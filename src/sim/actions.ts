import type { Entity } from '../core/ecs';
import type { Game } from './game';
import * as C from './components';
import { dist2 } from '../core/math';
import { getItem, ITEMS, type ItemStack } from '../content/items';
import { HARVESTABLES } from '../content/biomes';
import { RECIPES, rollQuality, DECONSTRUCT_RATIO, type StationId } from '../content/recipes';
import { getStructure, STRUCTURES } from '../content/structures';
import { getCreature } from '../content/creatures';
import { TAME_HP_THRESHOLD, TAME_FAILURE_AFFINITY } from '../core/config';
import { tameChance } from './formula';
import { spawnCreature, spawnStructure } from './factory';
import { gainBond, syncRoster } from './systems/progression';

/**
 * Player-initiated actions. Called from the input layer and the UI; never from
 * inside a system. Each one returns a plain result so the UI can report failure
 * without reaching into the simulation.
 */

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (message: string): ActionResult => ({ ok: false, message });

// ---------- inventory ----------

export function addItem(game: Game, itemId: string, count: number): boolean {
  const inv = game.ecs.get(game.player, C.Inventory);
  if (!inv) return false;
  const def = getItem(itemId);
  let left = count;

  for (const slot of inv.slots) {
    if (slot.itemId !== itemId || slot.count >= def.stack) continue;
    const room = def.stack - slot.count;
    const put = Math.min(room, left);
    slot.count += put;
    left -= put;
    if (left === 0) break;
  }
  while (left > 0) {
    if (inv.slots.length >= inv.capacity) {
      game.notice('Inventory full', 'bad');
      return false;
    }
    const put = Math.min(def.stack, left);
    inv.slots.push({ itemId, count: put });
    left -= put;
  }
  game.bus.emit('ItemAcquired', { itemId, count: count - left });
  return true;
}

export function countItem(game: Game, itemId: string): number {
  const inv = game.ecs.get(game.player, C.Inventory);
  if (!inv) return 0;
  let n = 0;
  for (const s of inv.slots) if (s.itemId === itemId) n += s.count;
  return n;
}

export function removeItem(game: Game, itemId: string, count: number): boolean {
  const inv = game.ecs.get(game.player, C.Inventory);
  if (!inv || countItem(game, itemId) < count) return false;
  let left = count;
  for (let i = inv.slots.length - 1; i >= 0 && left > 0; i--) {
    const s = inv.slots[i];
    if (s.itemId !== itemId) continue;
    const take = Math.min(s.count, left);
    s.count -= take;
    left -= take;
    if (s.count <= 0) inv.slots.splice(i, 1);
  }
  game.bus.emit('ItemConsumed', { itemId, count });
  return true;
}

export function hasAll(game: Game, inputs: ItemStack[]): boolean {
  return inputs.every((i) => countItem(game, i.itemId) >= i.count);
}

// ---------- interaction ----------

/** The nearest interactable within reach: a harvest node, a station, or a creature. */
export function findInteractable(game: Game, maxRange = 1.8): Entity | null {
  const pos = game.playerPos();
  if (!pos) return null;
  let best: Entity | null = null;
  let bestD = maxRange * maxRange;

  for (const e of game.ecs.query(C.Position, C.HarvestNode)) {
    const p = game.ecs.need(e, C.Position);
    const d = dist2(pos.x, pos.y, p.x, p.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  for (const e of game.ecs.query(C.Position, C.Structure)) {
    const p = game.ecs.need(e, C.Position);
    const d = dist2(pos.x, pos.y, p.x, p.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

export function harvest(game: Game, node: Entity): ActionResult {
  const hn = game.ecs.get(node, C.HarvestNode);
  if (!hn) return fail('Nothing to gather here.');
  const def = HARVESTABLES[hn.kind];

  if (def.tool && countItem(game, def.tool) === 0) {
    return fail(`You need a ${getItem(def.tool).name}.`);
  }

  hn.hitsLeft--;
  if (hn.hitsLeft > 0) return ok();

  const pos = game.ecs.get(node, C.Position);
  const rng = game.rng;
  for (const drop of def.drops) {
    if (rng.next() > drop.chance) continue;
    const n = rng.int(drop.min, drop.max);
    if (n <= 0) continue;
    addItem(game, drop.itemId, n);
    if (pos) {
      game.bus.emit('ResourceHarvested', { itemId: drop.itemId, count: n, x: pos.x, y: pos.y });
    }
    learnFromMaterial(game, drop.itemId);
  }

  game.shard.markHarvested(hn.nodeId, game.nowMs + def.respawnMin * 60_000);
  game.liveNodes.delete(hn.nodeId);
  game.ecs.destroy(node);
  return ok(`Gathered ${def.name}.`);
}

/**
 * Discovery-based recipe learning: harvesting a new material has a chance to
 * teach a recipe that uses it. This is what wires exploration directly into
 * crafting instead of gating it behind a vendor.
 */
function learnFromMaterial(game: Game, itemId: string): void {
  for (const [id, recipe] of Object.entries(RECIPES)) {
    if (recipe.known !== 'discovery') continue;
    if (game.knownRecipes.has(id)) continue;
    if (!recipe.inputs.some((i) => i.itemId === itemId)) continue;
    if (game.rng.next() > 0.6) continue;
    game.knownRecipes.add(id);
    game.notice(`Recipe learned: ${getItem(recipe.output.itemId).name}`, 'good');
  }
}

// ---------- crafting ----------

export function stationsInRange(game: Game, range = 3): Set<StationId> {
  const out = new Set<StationId>();
  const pos = game.playerPos();
  if (!pos) return out;
  for (const e of game.ecs.query(C.Position, C.Structure)) {
    const p = game.ecs.need(e, C.Position);
    if (dist2(pos.x, pos.y, p.x, p.y) > range * range) continue;
    const st = getStructure(game.ecs.need(e, C.Structure).structureId).station;
    if (st) out.add(st);
  }
  return out;
}

export function craft(game: Game, recipeId: string): ActionResult {
  const recipe = RECIPES[recipeId];
  if (!recipe) return fail('Unknown recipe.');
  if (!game.knownRecipes.has(recipeId)) return fail('You do not know that recipe.');
  if (!stationsInRange(game).has(recipe.station)) {
    return fail(`Requires a ${recipe.station}.`);
  }
  if (!hasAll(game, recipe.inputs)) return fail('Missing materials.');

  for (const i of recipe.inputs) removeItem(game, i.itemId, i.count);

  const craftAttr = game.ecs.get(game.player, C.PlayerTag)?.attributes.craft ?? 5;
  const stationTier = recipe.station === 'forge' || recipe.station === 'alchemy' ? 2 : 1;
  const quality = rollQuality(craftAttr, stationTier, game.rng.next());
  addItem(game, recipe.output.itemId, recipe.output.count);
  game.bus.emit('ItemCrafted', { itemId: recipe.output.itemId, count: recipe.output.count, quality });
  return ok(`Crafted ${getItem(recipe.output.itemId).name} (${quality}).`);
}

export function deconstruct(game: Game, itemId: string): ActionResult {
  const recipe = Object.values(RECIPES).find((r) => r.output.itemId === itemId);
  if (!recipe) return fail('That cannot be broken down.');
  if (!removeItem(game, itemId, 1)) return fail('You do not have that.');
  for (const i of recipe.inputs) {
    const back = Math.floor(i.count * DECONSTRUCT_RATIO);
    if (back > 0) addItem(game, i.itemId, back);
  }
  return ok(`Broke down ${getItem(itemId).name}.`);
}

// ---------- building ----------

export function canPlace(game: Game, structureId: string, x: number, y: number): ActionResult {
  const def = getStructure(structureId);
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      if (!game.shard.isWalkable(x + dx, y + dy)) return fail('Blocked terrain.');
    }
  }
  for (const e of game.ecs.query(C.Position, C.Structure)) {
    const p = game.ecs.need(e, C.Position);
    if (dist2(p.x, p.y, x, y) < 1) return fail('Something is already here.');
  }
  if (def.requires === 'adjacent_water') {
    let water = false;
    for (let dy = -1; dy <= def.h; dy++) {
      for (let dx = -1; dx <= def.w; dx++) {
        const t = game.shard.tileAt(x + dx, y + dy);
        if (t === 'water' || t === 'deep_water') water = true;
      }
    }
    if (!water) return fail('Must be built beside water.');
  }
  if (def.requires === 'open_sky') {
    // Open sky = no sight-blocking tile within 2 tiles. Smoke has to go somewhere.
    for (let dy = -2; dy <= def.h + 1; dy++) {
      for (let dx = -2; dx <= def.w + 1; dx++) {
        if (game.shard.blocksSight(x + dx, y + dy)) return fail('Needs open sky above it.');
      }
    }
  }
  return ok();
}

export function build(game: Game, structureId: string, x: number, y: number): ActionResult {
  const def = getStructure(structureId);
  const placement = canPlace(game, structureId, x, y);
  if (!placement.ok) return placement;
  if (!hasAll(game, def.cost)) return fail('Missing materials.');

  for (const c of def.cost) removeItem(game, c.itemId, c.count);
  spawnStructure(game.ecs, structureId, x + 0.5, y + 0.5);
  game.shard.delta.structures.push({
    id: `st:${game.shard.delta.structures.length}`, structureId, x: x + 0.5, y: y + 0.5,
  });
  game.bus.emit('StructureBuilt', { structureId, x, y });
  return ok(`Built ${def.name}.`);
}

export function buildableStructures(game: Game): string[] {
  return Object.keys(STRUCTURES).filter((id) => hasAll(game, getStructure(id).cost));
}

// ---------- items ----------

export function useItem(game: Game, itemId: string): ActionResult {
  const def = getItem(itemId);
  if (!def.use) return fail('Nothing happens.');
  if (countItem(game, itemId) === 0) return fail('You do not have that.');

  const hp = game.ecs.get(game.player, C.Health);
  const stam = game.ecs.get(game.player, C.Stamina);
  const surv = game.ecs.get(game.player, C.Survival);
  const stats = game.ecs.get(game.player, C.CombatStats);
  const status = game.ecs.get(game.player, C.StatusEffects);

  if (def.use.healPercent && hp) hp.current = Math.min(hp.max, hp.current + hp.max * def.use.healPercent);
  if (def.use.staminaPercent && stam) stam.current = Math.min(stam.max, stam.current + stam.max * def.use.staminaPercent);
  if (def.use.hungerRestore && surv) surv.hunger = Math.min(surv.hungerMax, surv.hunger + def.use.hungerRestore);
  if (def.use.warmthRestore && surv) surv.warmth = Math.min(surv.warmthMax, surv.warmth + def.use.warmthRestore);
  if (def.use.cures && status) status.active = status.active.filter((s) => !def.use!.cures!.includes(s.id));
  if (def.use.buff && stats) {
    stats.buffs.push({
      stat: def.use.buff.stat, amount: def.use.buff.amount,
      expiresAt: game.nowMs + def.use.buff.durationMs,
    });
  }

  removeItem(game, itemId, 1);
  return ok(`Used ${def.name}.`);
}

/** Feeding a creature its preferred food is the fastest bond gain in the game. */
export function feedCreature(game: Game, e: Entity, itemId: string): ActionResult {
  const inst = game.ecs.get(e, C.CreatureInstance);
  if (!inst) return fail('That is not a creature.');
  const def = getItem(itemId);
  if (!def.use?.bondGain) return fail('They will not eat that.');
  if (!removeItem(game, itemId, 1)) return fail('You do not have that.');

  const creature = getCreature(inst.creatureId);
  const preferred = creature.preferredFood === itemId;
  gainBond(game, e, preferred ? def.use.bondGain * 3 : def.use.bondGain);
  const hp = game.ecs.get(e, C.Health);
  if (hp) hp.current = Math.min(hp.max, hp.current + hp.max * 0.15);
  return ok(preferred ? `${creature.name} is delighted.` : `${creature.name} eats it.`);
}

export function equip(game: Game, itemId: string): ActionResult {
  const def = getItem(itemId);
  if (!def.equip) return fail('That cannot be equipped.');
  const inv = game.ecs.get(game.player, C.Inventory);
  const stats = game.ecs.get(game.player, C.CombatStats);
  const skills = game.ecs.get(game.player, C.SkillSet);
  if (!inv || !stats || !skills) return fail('Cannot equip right now.');
  if (countItem(game, itemId) === 0) return fail('You do not have that.');

  const slot = def.equip.slot;
  const previous = inv.equipped[slot];
  if (previous) applyEquipStats(game, previous, -1);
  inv.equipped[slot] = itemId;
  applyEquipStats(game, itemId, 1);

  if (slot === 'weapon') {
    const art = def.equip.skill;
    skills.ids = ['slash', ...(art ? [art] : []), 'emberlance'];
  }
  return ok(`Equipped ${def.name}.`);
}

function applyEquipStats(game: Game, itemId: string, sign: number): void {
  const eq = getItem(itemId).equip;
  const stats = game.ecs.get(game.player, C.CombatStats);
  const hp = game.ecs.get(game.player, C.Health);
  if (!eq || !stats) return;
  stats.atk += (eq.atk ?? 0) * sign;
  stats.def += (eq.def ?? 0) * sign;
  stats.mag += (eq.mag ?? 0) * sign;
  stats.res += (eq.res ?? 0) * sign;
  stats.spd += (eq.spd ?? 0) * 0.02 * sign;
  if (hp && eq.hp) {
    hp.max += eq.hp * sign;
    hp.current = Math.min(hp.current, hp.max);
  }
}

// ---------- taming ----------

export function canTame(game: Game, target: Entity): ActionResult {
  const inst = game.ecs.get(target, C.CreatureInstance);
  const hp = game.ecs.get(target, C.Health);
  if (!inst || !hp) return fail('That cannot be tamed.');
  if (inst.owned) return fail('Already yours.');
  if (hp.current / hp.max > TAME_HP_THRESHOLD) return fail('Weaken it first.');
  if (countItem(game, 'threadsnare') === 0) return fail('No Threadsnares.');
  return ok();
}

/** Opens the 3-beat snare rhythm minigame. The UI drives `tameBeat`. */
export function beginTame(game: Game, target: Entity): ActionResult {
  const check = canTame(game, target);
  if (!check.ok) return check;
  removeItem(game, 'threadsnare', 1);
  game.pendingTame = { target, startedAt: game.nowMs, hits: 0 };
  return ok('Snare thrown!');
}

/** One rhythm beat. `accurate` comes from the shrinking-ring timing check. */
export function tameBeat(game: Game, accurate: boolean): void {
  if (!game.pendingTame) return;
  if (accurate) game.pendingTame.hits++;
}

export function resolveTame(game: Game): ActionResult {
  const pending = game.pendingTame;
  game.pendingTame = null;
  if (!pending) return fail('No snare in flight.');

  const target = pending.target;
  const inst = game.ecs.get(target, C.CreatureInstance);
  const hp = game.ecs.get(target, C.Health);
  const player = game.ecs.get(game.player, C.PlayerTag);
  if (!inst || !hp || !player || !game.ecs.isAlive(target)) return fail('It got away.');

  const def = getCreature(inst.creatureId);
  const status = game.ecs.get(target, C.StatusEffects);
  const statusBonus = status && status.active.some((s) => s.id === 'root' || s.id === 'freeze') ? 0.15 : 0;

  const chance = tameChance({
    base: def.tameBase,
    rhythmHits: pending.hits,
    focus: player.attributes.focus,
    statusBonus,
    levelDelta: inst.level - player.level,
    affinity: game.tameAffinity.get(inst.creatureId) ?? 0,
    hpFraction: hp.current / hp.max,
  });

  if (game.rng.next() > chance) {
    // Mercy mechanic: every failure makes the next attempt on this species easier.
    const prev = game.tameAffinity.get(inst.creatureId) ?? 0;
    game.tameAffinity.set(inst.creatureId, prev + TAME_FAILURE_AFFINITY);
    const ai = game.ecs.get(target, C.AIState);
    if (ai) ai.target = game.player;
    const faction = game.ecs.get(target, C.FactionTag);
    if (faction) faction.value = 'hostile';
    return fail(`${def.name} breaks free!`);
  }

  return completeTame(game, target, inst);
}

function completeTame(game: Game, target: Entity, inst: C.CreatureInstance): ActionResult {
  const def = getCreature(inst.creatureId);
  inst.owned = true;
  inst.bond = 1;
  const faction = game.ecs.get(target, C.FactionTag);
  if (faction) faction.value = 'player';
  game.ecs.add(target, C.OwnedBy, { owner: game.player });
  const ai = game.ecs.get(target, C.AIState);
  if (ai) {
    ai.target = null;
    ai.threat.clear();
    ai.stance = 'balanced';
  }
  const hp = game.ecs.get(target, C.Health);
  if (hp) hp.current = hp.max;

  const spawn = game.ecs.get(target, C.WorldSpawn);
  if (spawn) {
    game.liveSpawns.delete(spawn.spawnId);
    game.ecs.remove(target, C.WorldSpawn);
  }

  const uid = `cr${game.roster.length}_${Math.floor(game.nowMs)}`;
  const activeCount = game.roster.filter((r) => r.partySlot >= 0).length;
  const entry = {
    uid,
    creatureId: inst.creatureId,
    level: inst.level,
    xp: inst.xp,
    bond: inst.bond,
    ivs: inst.ivs,
    natureUp: inst.natureUp,
    natureDown: inst.natureDown,
    nickname: inst.nickname,
    currentHp: hp?.current ?? 1,
    partySlot: activeCount < 3 ? activeCount : -1,
  };
  game.roster.push(entry);

  if (entry.partySlot >= 0) {
    game.partyEntities.set(uid, target);
  } else {
    // Reserve creatures are stored as data only.
    game.ecs.destroy(target);
  }

  game.discoveredCreatures.add(inst.creatureId);
  game.bus.emit('CreatureTamed', { creatureId: inst.creatureId, entity: target });
  return ok(`${def.name} joins you!`);
}

// ---------- party ----------

export function setStance(game: Game, stance: C.Stance): void {
  for (const e of game.activePartyEntities()) {
    const ai = game.ecs.get(e, C.AIState);
    if (ai) ai.stance = stance;
  }
}

/** Swaps a roster creature into an active party slot, instantiating it. */
export function setPartySlot(game: Game, uid: string, slot: number): ActionResult {
  const entry = game.roster.find((r) => r.uid === uid);
  if (!entry) return fail('Unknown creature.');
  const pos = game.playerPos();
  if (!pos) return fail('Cannot do that now.');

  if (slot >= 0) {
    const occupant = game.roster.find((r) => r.partySlot === slot && r.uid !== uid);
    if (occupant) {
      recallCreature(game, occupant.uid);
      occupant.partySlot = -1;
    }
  }
  if (entry.partySlot >= 0) recallCreature(game, uid);
  entry.partySlot = slot;
  if (slot < 0) return ok('Sent to reserve.');

  const spot = game.shard.findWalkableNear(pos.x + 1, pos.y, 6) ?? { x: pos.x, y: pos.y };
  const e = spawnCreature(game.ecs, game.rng.fork(uid), entry.creatureId, entry.level, spot.x, spot.y, {
    owned: true, owner: game.player, bond: entry.bond, nickname: entry.nickname,
  });
  const inst = game.ecs.need(e, C.CreatureInstance);
  inst.ivs = entry.ivs;
  inst.natureUp = entry.natureUp;
  inst.natureDown = entry.natureDown;
  inst.xp = entry.xp;
  const hp = game.ecs.get(e, C.Health);
  if (hp) hp.current = Math.max(1, Math.min(hp.max, entry.currentHp));
  game.partyEntities.set(uid, e);
  return ok('Summoned.');
}

function recallCreature(game: Game, uid: string): void {
  const e = game.partyEntities.get(uid);
  if (e === undefined) return;
  if (game.ecs.isAlive(e)) {
    syncRoster(game, e);
    game.ecs.destroy(e);
  }
  game.partyEntities.delete(uid);
}

export function renameCreature(game: Game, uid: string, name: string): ActionResult {
  const entry = game.roster.find((r) => r.uid === uid);
  if (!entry) return fail('Unknown creature.');
  const trimmed = name.trim().slice(0, 20);
  if (trimmed.length === 0) return fail('Name cannot be empty.');
  entry.nickname = trimmed;
  const e = game.partyEntities.get(uid);
  if (e !== undefined && game.ecs.isAlive(e)) {
    const inst = game.ecs.get(e, C.CreatureInstance);
    if (inst) inst.nickname = trimmed;
    const plate = game.ecs.get(e, C.Nameplate);
    if (plate) plate.text = trimmed;
  }
  return ok(`Named ${trimmed}.`);
}

/** All item ids the player is carrying, for UI lists. */
export function inventoryList(game: Game): ItemStack[] {
  return game.ecs.get(game.player, C.Inventory)?.slots ?? [];
}

export const ALL_ITEM_IDS = Object.keys(ITEMS);
