/** The eight Threads (elements) and the affinity chart. GDD §3.4. */

export const THREADS = [
  'verdant',
  'stone',
  'storm',
  'tide',
  'ember',
  'radiance',
  'umbra',
  'null',
] as const;

export type Thread = (typeof THREADS)[number];

export const THREAD_COLOR: Record<Thread, number> = {
  verdant: 0x6bbf59,
  stone: 0xa98d6b,
  storm: 0xe2c044,
  tide: 0x4a9fd4,
  ember: 0xe0603c,
  radiance: 0xf2e9c9,
  umbra: 0x6a4a9e,
  null: 0x2a2a32,
};

/**
 * Five-cycle: verdant -> stone -> storm -> tide -> ember -> verdant.
 * radiance and umbra are mutually strong (a high-risk mirror pair).
 * null is strong against everything and resists nothing.
 *
 * Memorisable in one screen, teachable on a phone, and a tenth of the balance
 * surface of an 18-type chart.
 */
const STRONG_AGAINST: Record<Thread, readonly Thread[]> = {
  verdant: ['stone'],
  stone: ['storm'],
  storm: ['tide'],
  tide: ['ember'],
  ember: ['verdant'],
  radiance: ['umbra'],
  umbra: ['radiance'],
  null: ['verdant', 'stone', 'storm', 'tide', 'ember', 'radiance', 'umbra'],
};

export const ADVANTAGE = 1.5;
export const DISADVANTAGE = 0.67;
export const NULL_MULT = 1.25;

/** Multiplier for a single attacking thread against a single defending thread. */
export function threadPair(attack: Thread, defend: Thread): number {
  if (attack === 'null') return NULL_MULT;
  if (defend === 'null') return NULL_MULT; // null takes extra from everything
  if (STRONG_AGAINST[attack].includes(defend)) return ADVANTAGE;
  if (STRONG_AGAINST[defend].includes(attack)) return DISADVANTAGE;
  return 1;
}

/** Multiplier for one attacking thread against a (possibly dual-thread) defender. */
export function threadMultiplier(attack: Thread, defence: readonly Thread[]): number {
  let m = 1;
  for (const d of defence) m *= threadPair(attack, d);
  return m;
}

/** Human-readable effectiveness label, for the combat log and UI. */
export function effectivenessLabel(mult: number): string {
  if (mult >= 2.2) return 'Devastating';
  if (mult >= 1.4) return 'Effective';
  if (mult <= 0.5) return 'Resisted';
  if (mult <= 0.8) return 'Weak';
  return '';
}
