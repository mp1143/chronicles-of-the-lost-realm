import type { Thread } from './threads';
import type { BaseStats, BiomeId, SpriteSpec } from './creatures';

/**
 * Boss definitions. Every boss:
 *  - is beatable at the intended level with any party composition (no thread lock),
 *  - telegraphs anything lethal for >= 600ms in shape language, not colour alone,
 *  - has an environmental answer that halves the fight for a prepared player.
 * GDD §12.
 */

export interface BossPhase {
  /** Phase begins when health drops to or below this fraction. */
  hpThreshold: number;
  skills: string[];
  /** Multiplicative stat changes applied on entering the phase. */
  atkMult: number;
  spdMult: number;
  /** Adds summoned on entering the phase. */
  summons?: { creatureId: string; count: number };
  /** Shown as a full-width banner. Under 40 characters. */
  banner: string;
}

export interface BossDef {
  id: string;
  name: string;
  title: string;
  threads: Thread[];
  biome: BiomeId;
  intendedLevel: number;
  base: BaseStats;
  phases: BossPhase[];
  /** Prepared players who exploit this halve the fight. */
  environmentalAnswer: string;
  drops: Array<{ itemId: string; min: number; max: number; chance: number }>;
  sprite: SpriteSpec;
  intro: string;
}

export const BOSSES: Record<string, BossDef> = {
  rootfather_ossuel: {
    id: 'rootfather_ossuel',
    name: 'Rootfather Ossuel',
    title: 'The Standing Grief',
    threads: ['verdant'],
    biome: 'verdant_reach',
    intendedLevel: 12,
    base: { hp: 4200, atk: 52, def: 78, mag: 48, res: 66, spd: 34 },
    phases: [
      {
        hpThreshold: 1,
        skills: ['ossuel_sweep', 'ossuel_lance'],
        atkMult: 1, spdMult: 1,
        summons: { creatureId: 'sproutling', count: 3 },
        banner: 'Something very old wakes up.',
      },
      {
        hpThreshold: 0.5,
        skills: ['ossuel_sweep', 'ossuel_lance', 'ossuel_rot', 'ossuel_wail'],
        atkMult: 1.3, spdMult: 1.25,
        summons: { creatureId: 'thornkin', count: 2 },
        banner: 'It stops pretending to be a tree.',
      },
    ],
    environmentalAnswer:
      'The four Heartwood knots around the arena burn. Ember damage on a knot severs a root ' +
      'cluster and staggers Ossuel for 6 seconds. Four knots, four staggers, half the fight.',
    drops: [
      { itemId: 'heartwood_sap', min: 2, max: 4, chance: 1 },
      { itemId: 'threadstone_shard', min: 1, max: 2, chance: 1 },
      { itemId: 'timber', min: 20, max: 40, chance: 1 },
      { itemId: 'bond_token', min: 1, max: 1, chance: 0.35 },
    ],
    sprite: { body: 'plant', crest: 'horns', primary: 0x2f4a2a, accent: 0xd9b23c, size: 1.9 },
    intro:
      'Elder Ossa said a Keeper died here and the grove would not let go of him. ' +
      'She said it like a warning. She meant it like an apology.',
  },
};

export function getBoss(id: string): BossDef {
  const b = BOSSES[id];
  if (!b) throw new Error(`Unknown boss: ${id}`);
  return b;
}

/** Boss health scales sub-linearly with party size, so soloing is hard but viable. */
export const PARTY_HP_SCALE = [1, 1, 1.3, 1.55] as const;
