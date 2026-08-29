import { CRIT_MULT, DEFENCE_K, DAMAGE_VARIANCE, TAME_MIN_CHANCE, TAME_MAX_CHANCE } from '../core/config';
import { clamp } from '../core/math';
import { threadMultiplier, type Thread } from '../content/threads';
import type { BaseStats, CreatureDef } from '../content/creatures';
import type { CombatStats, CreatureInstance } from './components';

/**
 * Pure balance functions. No ECS, no side effects — so the balance simulator
 * (tools/balance-sim.ts) and the unit tests can call them directly.
 *
 * There is exactly ONE damage formula, shared by physical and magical attacks.
 * Two damage formulas is where RPG balance goes to die.
 */

export interface DamageInput {
  power: number;
  attackStat: number;
  defenceStat: number;
  attackThread: Thread;
  defenceThreads: readonly Thread[];
  critChance: number;
  /** Uniform [0,1) rolls supplied by the caller, so results are deterministic. */
  critRoll: number;
  varianceRoll: number;
  /** Extra multipliers from traits, buffs, stagger. */
  bonusMult?: number;
}

export interface DamageResult {
  amount: number;
  crit: boolean;
  threadMult: number;
}

export function computeDamage(input: DamageInput): DamageResult {
  const threadMult = threadMultiplier(input.attackThread, input.defenceThreads);
  const crit = input.critRoll < input.critChance;
  const variance = 1 - DAMAGE_VARIANCE + input.varianceRoll * DAMAGE_VARIANCE * 2;
  const base = (input.attackStat * (input.power / 100)) / (1 + input.defenceStat / DEFENCE_K);
  const amount =
    base * threadMult * (crit ? CRIT_MULT : 1) * variance * (input.bonusMult ?? 1);
  return { amount: Math.max(1, Math.round(amount)), crit, threadMult };
}

/** Effective stat after timed buffs. */
export function effectiveStat(
  stats: CombatStats,
  key: 'atk' | 'def' | 'mag' | 'res' | 'spd',
  nowMs: number,
): number {
  let mult = 1;
  for (const b of stats.buffs) {
    if (b.stat === key && b.expiresAt > nowMs) mult += b.amount;
  }
  return Math.max(1, stats[key] * mult);
}

/**
 * Creature stat growth. Keeps IVs and bond meaningful without letting either
 * dominate: a perfect-IV creature is about 12% ahead of an average one, and
 * bond adds up to another 10%.
 */
export function statAtLevel(base: number, level: number, iv: number): number {
  return Math.floor(base + base * level * 0.021 + iv);
}

export const NATURE_MULT = 0.1;

export function bondStatMultiplier(bond: number): number {
  if (bond >= 7) return 1.1;
  if (bond >= 3) return 1.05;
  return 1;
}

export function resolveCreatureStats(def: CreatureDef, inst: CreatureInstance): BaseStats & { critChance: number } {
  const bondMult = bondStatMultiplier(inst.bond);
  const out = {} as BaseStats & { critChance: number };
  for (const key of ['hp', 'atk', 'def', 'mag', 'res', 'spd'] as const) {
    let v = statAtLevel(def.base[key], inst.level, inst.ivs[key]);
    if (inst.natureUp === key) v *= 1 + NATURE_MULT;
    if (inst.natureDown === key) v *= 1 - NATURE_MULT;
    out[key] = Math.max(1, Math.round(v * bondMult));
  }
  out.critChance = 0.03 + inst.level * 0.0015;
  return out;
}

/**
 * Taming. A skill check, not a dice roll: hitting the target more, applying
 * status, and investing in Focus all move the number. GDD §6.4.
 */
export interface TameInput {
  base: number;
  /** Successful beats in the snare rhythm minigame, 0-3. */
  rhythmHits: number;
  focus: number;
  /** Bonus for Sleep/Charm/Root on the target. */
  statusBonus: number;
  /** Target level minus player level. */
  levelDelta: number;
  /** Accumulated mercy affinity for this species. */
  affinity: number;
  hpFraction: number;
}

export function tameChance(i: TameInput): number {
  const hpBonus = clamp((0.4 - i.hpFraction) * 0.8, 0, 0.32);
  const raw =
    i.base +
    i.rhythmHits * 0.18 +
    i.focus * 0.006 +
    i.statusBonus +
    i.affinity +
    hpBonus -
    Math.max(0, i.levelDelta) * 0.02;
  return clamp(raw, TAME_MIN_CHANCE, TAME_MAX_CHANCE);
}

/** XP awarded for defeating a creature of `level` at player level `playerLevel`. */
export function xpForKill(level: number, playerLevel: number): number {
  const delta = level - playerLevel;
  // Under-levelled kills give reduced XP but never zero — no dead-end grinding.
  const scale = delta >= 0 ? 1 + delta * 0.08 : Math.max(0.25, 1 + delta * 0.06);
  return Math.max(1, Math.round(12 * Math.pow(level, 1.25) * scale));
}

/** Vendor reward for a procedurally generated bounty. GDD §9.3. */
export function bountyReward(difficulty: number, distanceTiles: number, repMultiplier: number): number {
  return Math.round(40 * difficulty * (1 + distanceTiles / 220) * repMultiplier);
}
