import type { Entity } from '../../core/ecs';
import type { Game } from '../game';
import * as C from '../components';
import {
  playerXpToNext, creatureXpToNext, MAX_PLAYER_LEVEL, MAX_CREATURE_LEVEL, RESERVE_XP_SHARE,
} from '../../core/config';
import { getCreature } from '../../content/creatures';
import { resolveCreatureStats } from '../formula';

/** Levels, bond and evolution. */

export function awardPlayerXp(game: Game, xp: number): void {
  const p = game.ecs.get(game.player, C.PlayerTag);
  if (!p || p.level >= MAX_PLAYER_LEVEL) return;
  p.xp += xp;
  while (p.level < MAX_PLAYER_LEVEL && p.xp >= playerXpToNext(p.level)) {
    p.xp -= playerXpToNext(p.level);
    p.level++;
    p.unspentPoints += 1;
    game.bus.emit('PlayerLevelled', { level: p.level });
    game.notice(`Wayfinder level ${p.level}`, 'good');
  }
}

/**
 * Splits XP across the party. Reserve creatures get 40% — enough that swapping
 * a creature in is never a punishment, which is the thing that kills roster
 * variety in this genre.
 */
export function awardCreatureXp(game: Game, xp: number): void {
  for (const e of game.activePartyEntities()) {
    addCreatureXp(game, e, xp);
    gainBond(game, e, 0.02);
  }
  for (const entry of game.roster) {
    if (entry.partySlot >= 0) continue;
    entry.xp += Math.round(xp * RESERVE_XP_SHARE);
    while (entry.level < MAX_CREATURE_LEVEL && entry.xp >= creatureXpToNext(entry.level)) {
      entry.xp -= creatureXpToNext(entry.level);
      entry.level++;
    }
  }
}

export function addCreatureXp(game: Game, e: Entity, xp: number): void {
  const inst = game.ecs.get(e, C.CreatureInstance);
  if (!inst || inst.level >= MAX_CREATURE_LEVEL) return;
  inst.xp += xp;
  let levelled = false;
  while (inst.level < MAX_CREATURE_LEVEL && inst.xp >= creatureXpToNext(inst.level)) {
    inst.xp -= creatureXpToNext(inst.level);
    inst.level++;
    levelled = true;
  }
  if (!levelled) return;

  applyStats(game, e, inst);
  game.bus.emit('CreatureLevelled', { entity: e, level: inst.level });
  syncRoster(game, e);
  tryEvolve(game, e);
}

export function gainBond(game: Game, e: Entity, amount: number): void {
  const inst = game.ecs.get(e, C.CreatureInstance);
  if (!inst || !inst.owned) return;
  const before = Math.floor(inst.bond);
  inst.bond = Math.min(10, inst.bond + amount);
  const after = Math.floor(inst.bond);
  if (after === before) return;

  applyStats(game, e, inst);
  // A 4th skill slot opens at bond 5.
  const def = getCreature(inst.creatureId);
  const set = game.ecs.get(e, C.SkillSet);
  if (set) set.ids = def.skills.slice(0, after >= 5 ? 4 : 3);

  game.bus.emit('CreatureBondChanged', { entity: e, bond: after });
  game.notice(`${inst.nickname ?? def.name} — bond ${after}`, 'good');
  syncRoster(game, e);
  tryEvolve(game, e);
}

/** Checks the three gates: level, bond, and catalyst item or world condition. */
export function tryEvolve(game: Game, e: Entity): boolean {
  const inst = game.ecs.get(e, C.CreatureInstance);
  if (!inst || !inst.owned) return false;
  const def = getCreature(inst.creatureId);
  if (!def.evolvesTo) return false;
  if (def.evolveLevel !== undefined && inst.level < def.evolveLevel) return false;
  if (def.evolveBond !== undefined && Math.floor(inst.bond) < def.evolveBond) return false;
  if (def.evolveCondition === 'night' && !game.isNight) return false;
  if (def.evolveCondition === 'aurora') return false; // aurora is a scheduled world event

  if (def.evolveItem) {
    const inv = game.ecs.get(game.player, C.Inventory);
    if (!inv) return false;
    const slot = inv.slots.find((s) => s.itemId === def.evolveItem);
    if (!slot || slot.count < 1) return false;
    slot.count--;
    if (slot.count <= 0) inv.slots.splice(inv.slots.indexOf(slot), 1);
  }

  const from = def.name;
  inst.creatureId = def.evolvesTo;
  const next = getCreature(def.evolvesTo);
  inst.role = next.role;

  // Rebase, do not reset: IVs and bond carry over. Evolution is a reward.
  applyStats(game, e, inst);
  const threads = game.ecs.get(e, C.Threads);
  if (threads) threads.list = [...next.threads];
  const set = game.ecs.get(e, C.SkillSet);
  if (set) set.ids = next.skills.slice(0, Math.floor(inst.bond) >= 5 ? 4 : 3);
  const col = game.ecs.get(e, C.Collider);
  if (col) col.radius = next.sprite.size;
  const rend = game.ecs.get(e, C.Renderable);
  if (rend) {
    rend.textureKey = `creature:${next.id}`;
    rend.radius = next.sprite.size;
  }
  const plate = game.ecs.get(e, C.Nameplate);
  if (plate && !inst.nickname) plate.text = next.name;

  game.discoveredCreatures.add(next.id);
  game.notice(`${from} evolved into ${next.name}!`, 'good');
  syncRoster(game, e);
  return true;
}

function applyStats(game: Game, e: Entity, inst: C.CreatureInstance): void {
  const def = getCreature(inst.creatureId);
  const stats = resolveCreatureStats(def, inst);
  const hp = game.ecs.get(e, C.Health);
  if (hp) {
    const frac = hp.max > 0 ? hp.current / hp.max : 1;
    hp.max = stats.hp;
    hp.current = Math.max(1, Math.round(stats.hp * frac));
  }
  const cs = game.ecs.get(e, C.CombatStats);
  if (cs) {
    cs.atk = stats.atk;
    cs.def = stats.def;
    cs.mag = stats.mag;
    cs.res = stats.res;
    cs.spd = 2.4 + stats.spd * 0.022;
    cs.critChance = stats.critChance;
  }
  const plate = game.ecs.get(e, C.Nameplate);
  if (plate) plate.level = inst.level;
}

/** Mirrors live entity state back into the persistent roster entry. */
export function syncRoster(game: Game, e: Entity): void {
  const inst = game.ecs.get(e, C.CreatureInstance);
  if (!inst || !inst.owned) return;
  const uid = uidFor(game, e);
  if (!uid) return;
  const entry = game.roster.find((r) => r.uid === uid);
  if (!entry) return;
  entry.creatureId = inst.creatureId;
  entry.level = inst.level;
  entry.xp = inst.xp;
  entry.bond = inst.bond;
  entry.nickname = inst.nickname;
  entry.currentHp = game.ecs.get(e, C.Health)?.current ?? entry.currentHp;
}

function uidFor(game: Game, e: Entity): string | null {
  for (const [uid, ent] of game.partyEntities) if (ent === e) return uid;
  return null;
}
