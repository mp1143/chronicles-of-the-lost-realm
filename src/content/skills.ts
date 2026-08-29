import type { Thread } from './threads';
import type { StatusId } from './statuses';

/**
 * Every skill in the game — player, creature and boss — uses this one schema.
 * There is no skill logic in code: `onHit` is interpreted by a small switch in
 * sim/systems/combat.ts. Adding a skill is a data edit.
 */

export type SkillShape =
  | { type: 'melee'; range: number; halfAngle: number }
  | { type: 'line'; length: number; width: number }
  | { type: 'circle'; radius: number; range: number }
  | { type: 'self'; radius: number }
  | { type: 'projectile'; speed: number; range: number; radius: number };

export type SkillEffect =
  | { effect: 'damage'; multiplier?: number }
  | { effect: 'status'; status: StatusId; chance: number; stacks?: number }
  | { effect: 'heal'; percentOfMaxHp: number }
  | { effect: 'cleanse'; count: number }
  | { effect: 'buff'; stat: 'atk' | 'def' | 'spd' | 'mag' | 'res'; amount: number; durationMs: number }
  | { effect: 'knockback'; force: number }
  | { effect: 'taunt'; durationMs: number }
  | { effect: 'lifesteal'; fraction: number };

export interface SkillDef {
  id: string;
  name: string;
  thread: Thread;
  /** Base power. Damage = f(power, ATK|MAG, DEF|RES) — see sim/combat/formula.ts */
  power: number;
  scaling: 'atk' | 'mag';
  cooldownMs: number;
  castMs: number;
  /** Warning window before a heavy hit lands. >= 600ms for anything that can one-shot. */
  telegraphMs: number;
  shape: SkillShape;
  onHit: SkillEffect[];
  /** Max targets struck. Keeps AoE readable and bounds worst-case cost. */
  maxTargets: number;
  staminaCost?: number;
  description: string;
}

function s(def: Omit<SkillDef, 'maxTargets'> & { maxTargets?: number }): SkillDef {
  return { maxTargets: 6, ...def };
}

export const SKILLS: Record<string, SkillDef> = Object.fromEntries(
  [
    // ---------- Player weapon arts ----------
    s({
      id: 'slash', name: 'Slash', thread: 'stone', power: 34, scaling: 'atk',
      cooldownMs: 420, castMs: 120, telegraphMs: 0, staminaCost: 6,
      shape: { type: 'melee', range: 1.6, halfAngle: 1.0 },
      onHit: [{ effect: 'damage' }], maxTargets: 3,
      description: 'A quick arc. The bread and butter.',
    }),
    s({
      id: 'cleave', name: 'Cleave', thread: 'stone', power: 68, scaling: 'atk',
      cooldownMs: 3200, castMs: 320, telegraphMs: 200, staminaCost: 22,
      shape: { type: 'melee', range: 2.2, halfAngle: 1.6 },
      onHit: [{ effect: 'damage' }, { effect: 'knockback', force: 3 }, { effect: 'status', status: 'bleed', chance: 0.3 }],
      maxTargets: 5,
      description: 'Wide, slow, and it hurts.',
    }),
    s({
      id: 'thrust', name: 'Thrust-Through', thread: 'stone', power: 58, scaling: 'atk',
      cooldownMs: 2600, castMs: 240, telegraphMs: 160, staminaCost: 16,
      shape: { type: 'line', length: 3.4, width: 1.0 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'sunder', chance: 0.35 }],
      maxTargets: 3,
      description: 'Pierces armour and everyone standing behind it.',
    }),

    // ---------- Player magic ----------
    s({
      id: 'emberlance', name: 'Emberlance', thread: 'ember', power: 62, scaling: 'mag',
      cooldownMs: 4200, castMs: 350, telegraphMs: 600,
      shape: { type: 'line', length: 6, width: 1.5 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'burn', chance: 0.35, stacks: 1 }],
      description: 'A spear of heat, thrown flat.',
    }),
    s({
      id: 'tidewall', name: 'Tidewall', thread: 'tide', power: 30, scaling: 'mag',
      cooldownMs: 9000, castMs: 500, telegraphMs: 300,
      shape: { type: 'self', radius: 3.2 },
      onHit: [{ effect: 'damage' }, { effect: 'knockback', force: 5 }, { effect: 'status', status: 'chill', chance: 0.6, stacks: 2 }],
      maxTargets: 10,
      description: 'A ring of cold water. Buys you space.',
    }),
    s({
      id: 'stonebind', name: 'Stonebind', thread: 'stone', power: 24, scaling: 'mag',
      cooldownMs: 8000, castMs: 400, telegraphMs: 400,
      shape: { type: 'circle', radius: 2.0, range: 5 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'root', chance: 0.85 }],
      description: 'The ground closes around their feet.',
    }),
    s({
      id: 'stormchain', name: 'Stormchain', thread: 'storm', power: 46, scaling: 'mag',
      cooldownMs: 5500, castMs: 260, telegraphMs: 250,
      shape: { type: 'circle', radius: 3.4, range: 6 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'shock', chance: 0.5 }],
      description: 'Arcs between everything metal, wet, or unlucky.',
    }),
    s({
      id: 'radiant_ward', name: 'Radiant Ward', thread: 'radiance', power: 0, scaling: 'mag',
      cooldownMs: 16000, castMs: 600, telegraphMs: 0,
      shape: { type: 'self', radius: 4 },
      onHit: [{ effect: 'heal', percentOfMaxHp: 0.22 }, { effect: 'cleanse', count: 2 }, { effect: 'buff', stat: 'def', amount: 0.2, durationMs: 8000 }],
      maxTargets: 4,
      description: 'Steady light. Heals, cleanses, holds.',
    }),
    s({
      id: 'umbral_step', name: 'Umbral Step', thread: 'umbra', power: 52, scaling: 'mag',
      cooldownMs: 7000, castMs: 150, telegraphMs: 0,
      shape: { type: 'circle', radius: 2.2, range: 4 },
      onHit: [{ effect: 'damage' }, { effect: 'lifesteal', fraction: 0.3 }, { effect: 'status', status: 'blind', chance: 0.3 }],
      description: 'You are briefly somewhere else, and so is their blood.',
    }),
    s({
      id: 'verdant_snare', name: 'Verdant Snare', thread: 'verdant', power: 28, scaling: 'mag',
      cooldownMs: 7500, castMs: 380, telegraphMs: 350,
      shape: { type: 'circle', radius: 2.6, range: 5 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'poison', chance: 0.7, stacks: 2 }, { effect: 'status', status: 'root', chance: 0.4 }],
      description: 'Thorns from below.',
    }),

    // ---------- Creature: universal ----------
    s({
      id: 'strike', name: 'Strike', thread: 'stone', power: 30, scaling: 'atk',
      cooldownMs: 1600, castMs: 180, telegraphMs: 0,
      shape: { type: 'melee', range: 1.5, halfAngle: 0.9 },
      onHit: [{ effect: 'damage' }], maxTargets: 1,
      description: 'A plain hit.',
    }),
    s({
      id: 'pounce', name: 'Pounce', thread: 'stone', power: 48, scaling: 'atk',
      cooldownMs: 5000, castMs: 260, telegraphMs: 300,
      shape: { type: 'melee', range: 2.4, halfAngle: 0.7 },
      onHit: [{ effect: 'damage' }, { effect: 'knockback', force: 2 }], maxTargets: 1,
      description: 'Closes distance and lands hard.',
    }),
    s({
      id: 'guard_up', name: 'Guard Up', thread: 'stone', power: 0, scaling: 'atk',
      cooldownMs: 12000, castMs: 200, telegraphMs: 0,
      shape: { type: 'self', radius: 0 },
      onHit: [{ effect: 'buff', stat: 'def', amount: 0.45, durationMs: 6000 }], maxTargets: 1,
      description: 'Braces.',
    }),
    s({
      id: 'bellow', name: 'Bellow', thread: 'stone', power: 8, scaling: 'atk',
      cooldownMs: 10000, castMs: 300, telegraphMs: 200,
      shape: { type: 'self', radius: 4.5 },
      onHit: [{ effect: 'taunt', durationMs: 5000 }, { effect: 'status', status: 'weaken', chance: 0.4 }],
      maxTargets: 8,
      description: 'Everything nearby decides you are the problem.',
    }),

    // ---------- Creature: Verdant ----------
    s({
      id: 'thorn_lash', name: 'Thorn Lash', thread: 'verdant', power: 42, scaling: 'atk',
      cooldownMs: 3200, castMs: 200, telegraphMs: 150,
      shape: { type: 'line', length: 3, width: 0.9 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'bleed', chance: 0.35 }], maxTargets: 2,
      description: 'A whip of barbed vine.',
    }),
    s({
      id: 'spore_burst', name: 'Spore Burst', thread: 'verdant', power: 26, scaling: 'mag',
      cooldownMs: 6000, castMs: 320, telegraphMs: 300,
      shape: { type: 'self', radius: 3 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'poison', chance: 0.75, stacks: 2 }],
      description: 'A cloud that gets into everything.',
    }),
    s({
      id: 'regrow', name: 'Regrow', thread: 'verdant', power: 0, scaling: 'mag',
      cooldownMs: 14000, castMs: 500, telegraphMs: 0,
      shape: { type: 'self', radius: 3.5 },
      onHit: [{ effect: 'heal', percentOfMaxHp: 0.18 }], maxTargets: 4,
      description: 'Growth, forced and fast.',
    }),
    s({
      id: 'rootwall', name: 'Rootwall', thread: 'verdant', power: 20, scaling: 'mag',
      cooldownMs: 11000, castMs: 400, telegraphMs: 400,
      shape: { type: 'circle', radius: 2.8, range: 4 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'root', chance: 0.8 }],
      description: 'Roots erupt and hold.',
    }),

    // ---------- Creature: Ember ----------
    s({
      id: 'cinder_spit', name: 'Cinder Spit', thread: 'ember', power: 40, scaling: 'mag',
      cooldownMs: 3000, castMs: 220, telegraphMs: 180,
      shape: { type: 'projectile', speed: 9, range: 7, radius: 0.6 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'burn', chance: 0.4 }], maxTargets: 1,
      description: 'A gobbet of something still burning.',
    }),
    s({
      id: 'eruption', name: 'Eruption', thread: 'ember', power: 74, scaling: 'mag',
      cooldownMs: 9500, castMs: 620, telegraphMs: 800,
      shape: { type: 'circle', radius: 3, range: 5 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'burn', chance: 0.8, stacks: 2 }, { effect: 'knockback', force: 4 }],
      description: 'The ground opens. Do not be standing there.',
    }),
    s({
      id: 'molten_charge', name: 'Molten Charge', thread: 'ember', power: 56, scaling: 'atk',
      cooldownMs: 6500, castMs: 300, telegraphMs: 500,
      shape: { type: 'line', length: 4.5, width: 1.4 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'burn', chance: 0.5 }, { effect: 'knockback', force: 3 }],
      description: 'A running start and a very hot shoulder.',
    }),

    // ---------- Creature: Tide ----------
    s({
      id: 'frost_bite', name: 'Frostbite', thread: 'tide', power: 38, scaling: 'atk',
      cooldownMs: 2800, castMs: 180, telegraphMs: 120,
      shape: { type: 'melee', range: 1.7, halfAngle: 0.8 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'chill', chance: 0.65 }], maxTargets: 1,
      description: 'Cold that stays after the bite.',
    }),
    s({
      id: 'rime_shard', name: 'Rime Shard', thread: 'tide', power: 44, scaling: 'mag',
      cooldownMs: 3400, castMs: 250, telegraphMs: 200,
      shape: { type: 'projectile', speed: 11, range: 8, radius: 0.5 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'chill', chance: 0.55, stacks: 2 }], maxTargets: 1,
      description: 'A splinter of ice, thrown flat and fast.',
    }),
    s({
      id: 'undertow', name: 'Undertow', thread: 'tide', power: 50, scaling: 'mag',
      cooldownMs: 8000, castMs: 420, telegraphMs: 450,
      shape: { type: 'circle', radius: 3.2, range: 4 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'root', chance: 0.5 }, { effect: 'knockback', force: -3 }],
      description: 'Drags everything toward the centre.',
    }),

    // ---------- Creature: Storm ----------
    s({
      id: 'dust_devil', name: 'Dust Devil', thread: 'storm', power: 36, scaling: 'atk',
      cooldownMs: 4500, castMs: 200, telegraphMs: 200,
      shape: { type: 'line', length: 4, width: 1.2 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'blind', chance: 0.45 }], maxTargets: 3,
      description: 'A dash that leaves grit in every eye behind it.',
    }),
    s({
      id: 'arc_lash', name: 'Arc Lash', thread: 'storm', power: 48, scaling: 'mag',
      cooldownMs: 4000, castMs: 200, telegraphMs: 220,
      shape: { type: 'circle', radius: 2.8, range: 6 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'shock', chance: 0.55 }],
      description: 'Jumps between targets without asking.',
    }),
    s({
      id: 'gale_step', name: 'Gale Step', thread: 'storm', power: 0, scaling: 'atk',
      cooldownMs: 10000, castMs: 150, telegraphMs: 0,
      shape: { type: 'self', radius: 0 },
      onHit: [{ effect: 'buff', stat: 'spd', amount: 0.5, durationMs: 5000 }], maxTargets: 1,
      description: 'Briefly very hard to hit.',
    }),

    // ---------- Creature: Radiance / Umbra ----------
    s({
      id: 'moonveil', name: 'Moonveil', thread: 'radiance', power: 0, scaling: 'mag',
      cooldownMs: 12000, castMs: 400, telegraphMs: 0,
      shape: { type: 'self', radius: 4 },
      onHit: [{ effect: 'cleanse', count: 1 }, { effect: 'heal', percentOfMaxHp: 0.1 }], maxTargets: 4,
      description: 'A pale sheet of light. Whatever was clinging lets go.',
    }),
    s({
      id: 'aurora', name: 'Aurora', thread: 'radiance', power: 0, scaling: 'mag',
      cooldownMs: 20000, castMs: 700, telegraphMs: 0,
      shape: { type: 'self', radius: 6 },
      onHit: [{ effect: 'heal', percentOfMaxHp: 0.12 }, { effect: 'buff', stat: 'res', amount: 0.25, durationMs: 10000 }],
      maxTargets: 6,
      description: 'The sky remembers something kind.',
    }),
    s({
      id: 'radiant_lance', name: 'Radiant Lance', thread: 'radiance', power: 60, scaling: 'mag',
      cooldownMs: 5200, castMs: 340, telegraphMs: 500,
      shape: { type: 'line', length: 7, width: 1.1 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'blind', chance: 0.3 }],
      description: 'A hard, straight line of light.',
    }),
    s({
      id: 'drain_touch', name: 'Drain Touch', thread: 'umbra', power: 46, scaling: 'mag',
      cooldownMs: 4200, castMs: 260, telegraphMs: 250,
      shape: { type: 'melee', range: 1.8, halfAngle: 0.8 },
      onHit: [{ effect: 'damage' }, { effect: 'lifesteal', fraction: 0.45 }], maxTargets: 1,
      description: 'Takes and keeps.',
    }),
    s({
      id: 'hex', name: 'Hex', thread: 'umbra', power: 22, scaling: 'mag',
      cooldownMs: 7000, castMs: 380, telegraphMs: 300,
      shape: { type: 'circle', radius: 2.4, range: 5 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'weaken', chance: 0.6 }, { effect: 'status', status: 'confuse', chance: 0.25 }],
      description: 'Something goes wrong with them, specifically.',
    }),
    s({
      id: 'devour', name: 'Devour', thread: 'umbra', power: 82, scaling: 'atk',
      cooldownMs: 11000, castMs: 450, telegraphMs: 700,
      shape: { type: 'melee', range: 2, halfAngle: 0.6 },
      onHit: [{ effect: 'damage' }, { effect: 'lifesteal', fraction: 0.4 }, { effect: 'status', status: 'bleed', chance: 0.6, stacks: 2 }],
      maxTargets: 1,
      description: 'The bite that ends most conversations.',
    }),
    s({
      id: 'nightfall', name: 'Nightfall', thread: 'umbra', power: 40, scaling: 'mag',
      cooldownMs: 13000, castMs: 600, telegraphMs: 700,
      shape: { type: 'self', radius: 5 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'blind', chance: 0.7 }, { effect: 'status', status: 'sunder', chance: 0.4 }],
      maxTargets: 8,
      description: 'The light goes out in a circle.',
    }),

    // ---------- Boss: Rootfather Ossuel ----------
    s({
      id: 'ossuel_sweep', name: 'Root Sweep', thread: 'verdant', power: 70, scaling: 'atk',
      cooldownMs: 5000, castMs: 500, telegraphMs: 900,
      shape: { type: 'circle', radius: 4.2, range: 0 },
      onHit: [{ effect: 'damage' }, { effect: 'knockback', force: 6 }], maxTargets: 8,
      description: 'A ring of roots erupts around the trunk.',
    }),
    s({
      id: 'ossuel_lance', name: 'Bramble Lance', thread: 'verdant', power: 88, scaling: 'mag',
      cooldownMs: 7000, castMs: 550, telegraphMs: 1000,
      shape: { type: 'line', length: 9, width: 1.8 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'bleed', chance: 0.6, stacks: 2 }],
      maxTargets: 4,
      description: 'A single thorn, the length of a road.',
    }),
    s({
      id: 'ossuel_rot', name: 'Rotbloom', thread: 'verdant', power: 44, scaling: 'mag',
      cooldownMs: 10000, castMs: 700, telegraphMs: 1100,
      shape: { type: 'circle', radius: 3.4, range: 6 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'poison', chance: 0.9, stacks: 3 }],
      maxTargets: 6,
      description: 'The soil turns black and reaches up.',
    }),
    s({
      id: 'ossuel_wail', name: "Ossuel's Wail", thread: 'umbra', power: 96, scaling: 'mag',
      cooldownMs: 16000, castMs: 900, telegraphMs: 1400,
      shape: { type: 'self', radius: 7 },
      onHit: [{ effect: 'damage' }, { effect: 'status', status: 'weaken', chance: 0.8, stacks: 2 }, { effect: 'knockback', force: 8 }],
      maxTargets: 10,
      description: 'Four hundred years of grief, all at once. Phase two only.',
    }),
  ].map((sk) => [sk.id, sk]),
);

export function getSkill(id: string): SkillDef {
  const sk = SKILLS[id];
  if (!sk) throw new Error(`Unknown skill: ${id}`);
  return sk;
}
