/** Status effect definitions. GDD §10.3. Behaviour lives in sim/systems/status.ts. */

export type StatusId =
  | 'burn'
  | 'chill'
  | 'freeze'
  | 'poison'
  | 'bleed'
  | 'shock'
  | 'blind'
  | 'confuse'
  | 'root'
  | 'weaken'
  | 'sunder'
  | 'sanity_drain';

export interface StatusDef {
  id: StatusId;
  name: string;
  maxStacks: number;
  durationMs: number;
  /** Fraction of the target's max HP dealt per second, per stack. */
  dotPercentPerSec?: number;
  /** True: damage bypasses DEF/RES. */
  ignoresDefence?: boolean;
  /** Multiplicative stat modifiers applied per stack. */
  modifiers?: Partial<Record<'spd' | 'atk' | 'mag' | 'def' | 'res' | 'accuracy', number>>;
  /** Prevents movement. */
  roots?: boolean;
  /** Prevents all action. */
  stuns?: boolean;
  /** Chance per skill activation that the action is interrupted. */
  interruptChance?: number;
  /** Chance per attack that the target strikes a random target instead. */
  confuseChance?: number;
  /** At max stacks, convert to this status and clear. */
  escalatesTo?: StatusId;
  /**
   * Immunity granted to the same target after this status expires. Applies to
   * players only; enemies get no such protection. No status may chain-lock the
   * player — GDD §10.3.
   */
  playerImmunityMs?: number;
  colour: number;
  /** Shape token for the icon. Gameplay-critical info is never colour-only. */
  glyph: string;
}

export const STATUSES: Record<StatusId, StatusDef> = {
  burn: {
    id: 'burn', name: 'Burn', maxStacks: 3, durationMs: 6000,
    dotPercentPerSec: 0.02, colour: 0xe0603c, glyph: '▲',
  },
  chill: {
    id: 'chill', name: 'Chill', maxStacks: 4, durationMs: 8000,
    modifiers: { spd: -0.15 }, escalatesTo: 'freeze', colour: 0x4a9fd4, glyph: '❋',
  },
  freeze: {
    id: 'freeze', name: 'Freeze', maxStacks: 1, durationMs: 2000,
    stuns: true, playerImmunityMs: 6000, colour: 0x9fd8f5, glyph: '◈',
  },
  poison: {
    id: 'poison', name: 'Poison', maxStacks: 5, durationMs: 12000,
    dotPercentPerSec: 0.015, ignoresDefence: true, colour: 0x7ac74f, glyph: '☣',
  },
  bleed: {
    id: 'bleed', name: 'Bleed', maxStacks: 3, durationMs: 10000,
    dotPercentPerSec: 0.02, colour: 0xc23b3b, glyph: '◤',
  },
  shock: {
    id: 'shock', name: 'Shock', maxStacks: 2, durationMs: 5000,
    interruptChance: 0.2, colour: 0xe2c044, glyph: '⚡',
  },
  blind: {
    id: 'blind', name: 'Blind', maxStacks: 1, durationMs: 5000,
    modifiers: { accuracy: -0.4 }, colour: 0x555160, glyph: '◐',
  },
  confuse: {
    id: 'confuse', name: 'Confuse', maxStacks: 1, durationMs: 6000,
    confuseChance: 0.25, colour: 0xb47ad4, glyph: '❓',
  },
  root: {
    id: 'root', name: 'Root', maxStacks: 1, durationMs: 3000,
    roots: true, playerImmunityMs: 6000, colour: 0x6bbf59, glyph: '⊥',
  },
  weaken: {
    id: 'weaken', name: 'Weaken', maxStacks: 2, durationMs: 9000,
    modifiers: { atk: -0.25, mag: -0.25 }, colour: 0x8a7f9e, glyph: '▽',
  },
  sunder: {
    id: 'sunder', name: 'Sunder', maxStacks: 2, durationMs: 9000,
    modifiers: { def: -0.25, res: -0.25 }, colour: 0xa98d6b, glyph: '◭',
  },
  sanity_drain: {
    id: 'sanity_drain', name: 'Sanity Drain', maxStacks: 1, durationMs: 15000,
    colour: 0x6a4a9e, glyph: '◍',
  },
};

/** Statuses cured by a Radiance effect or a cleanse item. */
export const CLEANSABLE: readonly StatusId[] = [
  'burn', 'poison', 'bleed', 'blind', 'confuse', 'root', 'weaken', 'sunder', 'sanity_drain',
];
