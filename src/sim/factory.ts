import type { World, Entity } from '../core/ecs';
import type { SeededRNG } from '../core/rng';
import { getCreature, type BaseStats, type CreatureDef } from '../content/creatures';
import { getBoss, PARTY_HP_SCALE } from '../content/bosses';
import { getStructure } from '../content/structures';
import { HARVESTABLES } from '../content/biomes';
import { BASE_INVENTORY_SLOTS } from '../core/config';
import { resolveCreatureStats } from './formula';
import * as C from './components';

/** Entity construction. Everything that exists in the world is built here. */

const STAT_KEYS: (keyof BaseStats)[] = ['hp', 'atk', 'def', 'mag', 'res', 'spd'];

export function rollIVs(rng: SeededRNG): BaseStats {
  return {
    hp: rng.int(0, 15), atk: rng.int(0, 15), def: rng.int(0, 15),
    mag: rng.int(0, 15), res: rng.int(0, 15), spd: rng.int(0, 15),
  };
}

export function spawnPlayer(world: World, x: number, y: number): Entity {
  const e = world.create();
  world.add(e, C.Position, { x, y, px: x, py: y });
  world.add(e, C.Velocity, { x: 0, y: 0 });
  world.add(e, C.Facing, { angle: 0 });
  world.add(e, C.Health, { current: 120, max: 120, regenPerSec: 0.4 });
  world.add(e, C.Stamina, { current: 100, max: 100 });
  world.add(e, C.CombatStats, { atk: 22, def: 12, mag: 16, res: 10, spd: 5.2, critChance: 0.05, buffs: [] });
  world.add(e, C.Threads, { list: ['stone'] });
  world.add(e, C.FactionTag, { value: 'player' });
  world.add(e, C.Collider, { radius: 0.35 });
  world.add(e, C.StatusEffects, { active: [], immuneUntil: {} });
  world.add(e, C.SkillSet, { ids: ['slash', 'cleave', 'emberlance'] });
  world.add(e, C.Cooldowns, { until: {} });
  world.add(e, C.PlayerTag, {
    attributes: { vigor: 5, focus: 5, attunement: 5, craft: 5, grit: 5 },
    level: 1, xp: 0, unspentPoints: 0,
  });
  world.add(e, C.Survival, {
    hunger: 100, hungerMax: 100, warmth: 100, warmthMax: 100, sanity: 100, sanityMax: 100,
  });
  world.add(e, C.Inventory, {
    slots: [
      { itemId: 'threadsnare', count: 5 },
      { itemId: 'healing_salve', count: 2 },
      { itemId: 'loomcompass', count: 1 },
    ],
    capacity: BASE_INVENTORY_SLOTS,
    threadsilver: 60,
    equipped: {},
  });
  world.add(e, C.Renderable, { textureKey: 'player', radius: 0.35, tint: 0xffffff, layer: 'entity' });
  return e;
}

export interface SpawnCreatureOpts {
  owned?: boolean;
  owner?: Entity;
  spawnId?: string;
  bond?: number;
  nickname?: string;
}

export function spawnCreature(
  world: World,
  rng: SeededRNG,
  creatureId: string,
  level: number,
  x: number,
  y: number,
  opts: SpawnCreatureOpts = {},
): Entity {
  const def = getCreature(creatureId);
  const inst: C.CreatureInstance = {
    creatureId,
    level,
    xp: 0,
    bond: opts.bond ?? 0,
    ivs: rollIVs(rng),
    natureUp: rng.pick(STAT_KEYS),
    natureDown: rng.pick(STAT_KEYS),
    nickname: opts.nickname,
    role: def.role,
    owned: opts.owned ?? false,
  };
  const stats = resolveCreatureStats(def, inst);

  const e = world.create();
  world.add(e, C.Position, { x, y, px: x, py: y });
  world.add(e, C.Velocity, { x: 0, y: 0 });
  world.add(e, C.Facing, { angle: rng.float(0, Math.PI * 2) });
  world.add(e, C.Health, { current: stats.hp, max: stats.hp, regenPerSec: 0 });
  world.add(e, C.CombatStats, {
    atk: stats.atk, def: stats.def, mag: stats.mag, res: stats.res,
    spd: 2.4 + stats.spd * 0.022, critChance: stats.critChance, buffs: [],
  });
  world.add(e, C.Threads, { list: [...def.threads] });
  world.add(e, C.FactionTag, { value: opts.owned ? 'player' : 'wild' });
  world.add(e, C.Collider, { radius: def.sprite.size });
  world.add(e, C.StatusEffects, { active: [], immuneUntil: {} });
  world.add(e, C.SkillSet, { ids: skillsForLevel(def, inst) });
  world.add(e, C.Cooldowns, { until: {} });
  world.add(e, C.CreatureInstance, inst);
  world.add(e, C.AIState, {
    stance: 'balanced', target: null, lastPerceptionMs: 0, threat: new Map(),
    homeX: x, homeY: y, forcedTargetUntil: 0, bucket: 0,
    wanderX: x, wanderY: y, wanderUntil: 0,
  });
  world.add(e, C.Renderable, {
    textureKey: `creature:${creatureId}`, radius: def.sprite.size, tint: 0xffffff, layer: 'entity',
  });
  world.add(e, C.Nameplate, { text: inst.nickname ?? def.name, level });
  if (opts.owner !== undefined) world.add(e, C.OwnedBy, { owner: opts.owner });
  if (opts.spawnId) world.add(e, C.WorldSpawn, { spawnId: opts.spawnId });
  return e;
}

/** Skill slots unlock with level and bond — 3 base, a 4th at bond 5. */
function skillsForLevel(def: CreatureDef, inst: C.CreatureInstance): string[] {
  const cap = inst.bond >= 5 ? 4 : 3;
  return def.skills.slice(0, cap);
}

export function spawnBoss(
  world: World,
  rng: SeededRNG,
  bossId: string,
  x: number,
  y: number,
  partySize: number,
): Entity {
  const def = getBoss(bossId);
  const hpScale = PARTY_HP_SCALE[Math.min(partySize, PARTY_HP_SCALE.length - 1)];
  const hp = Math.round(def.base.hp * hpScale);

  const e = world.create();
  world.add(e, C.Position, { x, y, px: x, py: y });
  world.add(e, C.Velocity, { x: 0, y: 0 });
  world.add(e, C.Facing, { angle: 0 });
  world.add(e, C.Health, { current: hp, max: hp, regenPerSec: 0 });
  world.add(e, C.CombatStats, {
    atk: def.base.atk, def: def.base.def, mag: def.base.mag, res: def.base.res,
    spd: 1.4, critChance: 0.05, buffs: [],
  });
  world.add(e, C.Threads, { list: [...def.threads] });
  world.add(e, C.FactionTag, { value: 'hostile' });
  world.add(e, C.Collider, { radius: def.sprite.size });
  world.add(e, C.StatusEffects, { active: [], immuneUntil: {} });
  world.add(e, C.SkillSet, { ids: [...def.phases[0].skills] });
  world.add(e, C.Cooldowns, { until: {} });
  world.add(e, C.BossTag, { bossId, phase: 0, staggerUntil: 0 });
  world.add(e, C.AIState, {
    stance: 'aggressive', target: null, lastPerceptionMs: 0, threat: new Map(),
    homeX: x, homeY: y, forcedTargetUntil: 0, bucket: 0,
    wanderX: x, wanderY: y, wanderUntil: 0,
  });
  world.add(e, C.Renderable, {
    textureKey: `boss:${bossId}`, radius: def.sprite.size, tint: 0xffffff, layer: 'entity',
  });
  world.add(e, C.Nameplate, { text: def.name, level: def.intendedLevel });
  void rng;
  return e;
}

export function spawnHarvestNode(world: World, nodeId: string, kind: string, x: number, y: number): Entity {
  const def = HARVESTABLES[kind];
  const e = world.create();
  world.add(e, C.Position, { x, y, px: x, py: y });
  world.add(e, C.Collider, { radius: def.size });
  world.add(e, C.HarvestNode, { nodeId, kind, hitsLeft: def.hitsToBreak });
  world.add(e, C.Renderable, {
    textureKey: `node:${kind}`, radius: def.size, tint: 0xffffff, layer: 'entity',
  });
  return e;
}

export function spawnStructure(world: World, structureId: string, x: number, y: number): Entity {
  const def = getStructure(structureId);
  const e = world.create();
  world.add(e, C.Position, { x, y, px: x, py: y });
  world.add(e, C.Structure, { structureId, x, y });
  world.add(e, C.Collider, { radius: Math.max(def.w, def.h) * 0.4 });
  world.add(e, C.Renderable, {
    textureKey: `structure:${structureId}`, radius: Math.max(def.w, def.h) * 0.5,
    tint: 0xffffff, layer: 'ground',
  });
  return e;
}

export function spawnProjectile(
  world: World,
  source: Entity,
  skillId: string,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  speed: number,
  range: number,
  radius: number,
  tint: number,
): Entity {
  const e = world.create();
  world.add(e, C.Position, { x, y, px: x, py: y });
  world.add(e, C.Projectile, { skillId, source, dirX, dirY, speed, rangeLeft: range, radius });
  world.add(e, C.Renderable, { textureKey: 'projectile', radius, tint, layer: 'air' });
  return e;
}
