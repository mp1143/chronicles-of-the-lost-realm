import type { Thread } from './threads';

/**
 * The full roster: 40 creatures across 16 evolution lines. GDD §6.2.
 *
 * This is data, not code. Adding a creature never requires a code change; the
 * silhouette is generated procedurally from `sprite` (render/textures.ts), so a
 * new entry is playable the moment it is typed.
 */

export type Role = 'tank' | 'bruiser' | 'assassin' | 'skirmisher' | 'mage' | 'support';
export type BiomeId =
  | 'verdant_reach' | 'ashen_wastes' | 'frostspire' | 'sunken_mire'
  | 'dust_sea' | 'hollow_deep' | 'loom_core';

export interface BaseStats {
  hp: number; atk: number; def: number; mag: number; res: number; spd: number;
}

/** Procedural silhouette recipe. Silhouette-first: readable as a black shape at 32px. */
export interface SpriteSpec {
  body: 'blob' | 'quad' | 'biped' | 'serpent' | 'insect' | 'winged' | 'floating' | 'plant';
  /** Extra identifying feature, drawn in the accent colour. */
  crest: 'none' | 'horns' | 'antennae' | 'frill' | 'wings' | 'spines' | 'tail' | 'cap' | 'halo';
  primary: number;
  accent: number;
  /** Radius in world units (1 unit = 1 tile). */
  size: number;
}

export interface CreatureDef {
  id: string;
  name: string;
  threads: Thread[];
  role: Role;
  base: BaseStats;
  trait: { id: string; name: string; description: string };
  skills: string[];
  biome: BiomeId;
  /** Relative spawn weight within its biome. */
  rarity: number;
  /** Base taming chance before modifiers. GDD §6.4. */
  tameBase: number;
  preferredFood: string;
  evolvesTo?: string;
  evolveLevel?: number;
  evolveBond?: number;
  evolveItem?: string;
  /** Special world condition, checked by sim/systems/evolution.ts. */
  evolveCondition?: 'night' | 'aurora';
  sprite: SpriteSpec;
  /** Unlocks at bond 1 / 5 / 9. Collectively these are the novel. */
  bestiary: [string, string, string];
}

const C = (d: CreatureDef): CreatureDef => d;

export const CREATURES: Record<string, CreatureDef> = Object.fromEntries(
  [
    // ═══════════════ VERDANT REACH ═══════════════
    C({
      id: 'sproutling', name: 'Sproutling', threads: ['verdant'], role: 'support',
      base: { hp: 58, atk: 30, def: 34, mag: 44, res: 40, spd: 38 },
      trait: { id: 'photosynthesis', name: 'Photosynthesis', description: 'Regenerates health steadily while in daylight.' },
      skills: ['strike', 'spore_burst', 'regrow'],
      biome: 'verdant_reach', rarity: 100, tameBase: 0.45, preferredFood: 'sunberry',
      evolvesTo: 'thornkin', evolveLevel: 16,
      sprite: { body: 'plant', crest: 'cap', primary: 0x6bbf59, accent: 0xc8e87a, size: 0.34 },
      bestiary: [
        'Barely animal. It turns to face the sun even when the sun is behind a wall.',
        'It buries its feet at night. Digging one up is how you learn it screams.',
        "Cael's note: they were the first draft. The Loom made a hundred thousand and kept trying.",
      ],
    }),
    C({
      id: 'thornkin', name: 'Thornkin', threads: ['verdant'], role: 'skirmisher',
      base: { hp: 78, atk: 62, def: 48, mag: 50, res: 46, spd: 60 },
      trait: { id: 'barbed', name: 'Barbed', description: 'Reflects 15% of melee damage taken.' },
      skills: ['thorn_lash', 'spore_burst', 'pounce', 'regrow'],
      biome: 'verdant_reach', rarity: 55, tameBase: 0.32, preferredFood: 'sunberry',
      evolvesTo: 'bramblewarden', evolveLevel: 34,
      sprite: { body: 'biped', crest: 'spines', primary: 0x4e9c46, accent: 0xd9b23c, size: 0.42 },
      bestiary: [
        'Walks upright, badly, as though it only recently decided to.',
        'It grows a new thorn for every wound it survives. Old ones are almost armoured.',
        'Cael: it remembers being cut. That is not a plant behaviour. That is not any behaviour I built.',
      ],
    }),
    C({
      id: 'bramblewarden', name: 'Bramblewarden', threads: ['verdant', 'stone'], role: 'tank',
      base: { hp: 132, atk: 74, def: 92, mag: 54, res: 70, spd: 42 },
      trait: { id: 'rootwall_trait', name: 'Rootwall', description: 'Immune to knockback and displacement.' },
      skills: ['thorn_lash', 'rootwall', 'bellow', 'guard_up', 'regrow'],
      biome: 'verdant_reach', rarity: 12, tameBase: 0.16, preferredFood: 'heartwood_sap',
      sprite: { body: 'quad', crest: 'horns', primary: 0x3d7a38, accent: 0x8b6b3a, size: 0.62 },
      bestiary: [
        'It stands where it stands. Weather goes around it.',
        'Wardens choose a place and never leave it. Nobody knows how they choose.',
        'Cael: it is guarding a Threadstone. All of them are. I never told them to.',
      ],
    }),
    C({
      id: 'mosshorn', name: 'Mosshorn', threads: ['stone'], role: 'bruiser',
      base: { hp: 84, atk: 56, def: 62, mag: 26, res: 40, spd: 34 },
      trait: { id: 'sure_footed', name: 'Sure-Footed', description: 'Ignores movement penalties from terrain.' },
      skills: ['strike', 'pounce', 'guard_up'],
      biome: 'verdant_reach', rarity: 85, tameBase: 0.42, preferredFood: 'grain_cake',
      evolvesTo: 'lichenbull', evolveLevel: 22,
      sprite: { body: 'quad', crest: 'horns', primary: 0x7f8f5e, accent: 0xa98d6b, size: 0.46 },
      bestiary: [
        'A slow animal with an unhurried opinion of you.',
        'The moss on its back is a separate organism and considerably older.',
        'Cael: kill one and the moss keeps living. I think the moss is the draft.',
      ],
    }),
    C({
      id: 'lichenbull', name: 'Lichenbull', threads: ['stone', 'verdant'], role: 'tank',
      base: { hp: 148, atk: 84, def: 88, mag: 34, res: 58, spd: 36 },
      trait: { id: 'regrowth', name: 'Regrowth', description: 'Heals 3% of max health whenever it lands a killing blow.' },
      skills: ['strike', 'bellow', 'guard_up', 'rootwall'],
      biome: 'verdant_reach', rarity: 22, tameBase: 0.2, preferredFood: 'grain_cake',
      sprite: { body: 'quad', crest: 'horns', primary: 0x6b7d4a, accent: 0xc9d18a, size: 0.66 },
      bestiary: [
        'Enormous, patient, and entirely willing to walk through a house.',
        'A bull will carry a wounded animal of any species back toward water.',
        'Cael: they carry the dying. Nothing in the pattern asks them to.',
      ],
    }),
    C({
      id: 'glimmoth', name: 'Glimmoth', threads: ['radiance'], role: 'support',
      base: { hp: 52, atk: 24, def: 30, mag: 58, res: 52, spd: 66 },
      trait: { id: 'lumen', name: 'Lumen', description: 'Extends the party light radius by 3 tiles.' },
      skills: ['moonveil', 'radiant_lance'],
      biome: 'verdant_reach', rarity: 60, tameBase: 0.4, preferredFood: 'nectar',
      evolvesTo: 'lumimoth', evolveLevel: 25, evolveCondition: 'night',
      sprite: { body: 'winged', crest: 'antennae', primary: 0xf2e9c9, accent: 0xe2c044, size: 0.3 },
      bestiary: [
        'It gives off more light than it should. Considerably more.',
        'Glimmoths cluster around dying people. It is meant kindly.',
        'Cael: they are lamps. I made them to light the Loom galleries. They got out.',
      ],
    }),
    C({
      id: 'lumimoth', name: 'Lumimoth', threads: ['radiance'], role: 'support',
      base: { hp: 86, atk: 36, def: 46, mag: 96, res: 84, spd: 76 },
      trait: { id: 'moonveil_trait', name: 'Moonveil', description: 'Cleanses one debuff from an ally every 12 seconds.' },
      skills: ['moonveil', 'aurora', 'radiant_lance'],
      biome: 'verdant_reach', rarity: 14, tameBase: 0.18, preferredFood: 'nectar',
      sprite: { body: 'winged', crest: 'halo', primary: 0xfff6dc, accent: 0xffd06b, size: 0.4 },
      bestiary: [
        'Bright enough to read by. Bright enough to be seen from the next valley.',
        'It will not leave a wounded companion, and it cannot be persuaded otherwise.',
        'Cael: a lamp that refuses to be put out is no longer a lamp.',
      ],
    }),
    C({
      id: 'fangling', name: 'Fangling', threads: ['verdant'], role: 'assassin',
      base: { hp: 54, atk: 68, def: 30, mag: 24, res: 28, spd: 82 },
      trait: { id: 'pack', name: 'Pack', description: '+12% attack for each allied Fangling-line creature nearby.' },
      skills: ['strike', 'pounce'],
      biome: 'verdant_reach', rarity: 70, tameBase: 0.35, preferredFood: 'raw_meat',
      evolvesTo: 'direfang', evolveLevel: 28, evolveBond: 5,
      sprite: { body: 'quad', crest: 'tail', primary: 0x5a7a3f, accent: 0xd8d0b0, size: 0.34 },
      bestiary: [
        'Never alone. If you see one, you have already been counted.',
        'The pack decides together and moves without a signal anyone has found.',
        'Cael: one mind, several bodies. The Loom does this when it runs short of pattern.',
      ],
    }),
    C({
      id: 'direfang', name: 'Direfang', threads: ['verdant', 'umbra'], role: 'assassin',
      base: { hp: 96, atk: 128, def: 52, mag: 40, res: 44, spd: 104 },
      trait: { id: 'throat_take', name: 'Throat-Take', description: 'Critical hits deal 2.5x damage to targets below 25% health.' },
      skills: ['pounce', 'devour', 'drain_touch', 'gale_step'],
      biome: 'verdant_reach', rarity: 10, tameBase: 0.14, preferredFood: 'raw_meat',
      sprite: { body: 'quad', crest: 'spines', primary: 0x2f3a2a, accent: 0xc23b3b, size: 0.5 },
      bestiary: [
        'The one that stopped waiting for the pack.',
        'A bonded Direfang will not hunt anything you have named. It waits to be told.',
        'Cael: it chose. Out of everything down here, that is the part that frightens me.',
      ],
    }),

    // ═══════════════ ASHEN WASTES ═══════════════
    C({
      id: 'cindermite', name: 'Cindermite', threads: ['ember'], role: 'skirmisher',
      base: { hp: 46, atk: 52, def: 32, mag: 46, res: 30, spd: 70 },
      trait: { id: 'swarm_born', name: 'Swarm-Born', description: 'Always spawns as a pair.' },
      skills: ['strike', 'cinder_spit'],
      biome: 'ashen_wastes', rarity: 100, tameBase: 0.44, preferredFood: 'char_root',
      evolvesTo: 'magmite', evolveLevel: 18,
      sprite: { body: 'insect', crest: 'none', primary: 0xe0603c, accent: 0xffb347, size: 0.28 },
      bestiary: [
        'Small, hot, and there are two of them.',
        'A pair will die rather than separate. Tested, regrettably, more than once.',
        'Cael: two bodies, one allocation. I ran out of memory and never fixed it.',
      ],
    }),
    C({
      id: 'magmite', name: 'Magmite', threads: ['ember'], role: 'bruiser',
      base: { hp: 96, atk: 88, def: 62, mag: 64, res: 48, spd: 52 },
      trait: { id: 'molten_core', name: 'Molten Core', description: '20% chance to apply Burn on any hit.' },
      skills: ['molten_charge', 'cinder_spit', 'guard_up'],
      biome: 'ashen_wastes', rarity: 48, tameBase: 0.3, preferredFood: 'char_root',
      evolvesTo: 'obsidiath', evolveLevel: 40, evolveItem: 'obsidian_heart',
      sprite: { body: 'quad', crest: 'spines', primary: 0xc0442a, accent: 0xffd76b, size: 0.44 },
      bestiary: [
        'Heavy enough to crack the crust it walks on.',
        'It cools to black when it sleeps and no one can find it.',
        'Cael: cooling is the closest thing to peace anything down here gets.',
      ],
    }),
    C({
      id: 'obsidiath', name: 'Obsidiath', threads: ['ember', 'stone'], role: 'tank',
      base: { hp: 158, atk: 106, def: 108, mag: 78, res: 74, spd: 44 },
      trait: { id: 'vitrify', name: 'Vitrify', description: 'Gains 30% defence while below 40% health.' },
      skills: ['molten_charge', 'eruption', 'guard_up', 'bellow'],
      biome: 'ashen_wastes', rarity: 8, tameBase: 0.12, preferredFood: 'emberglass_dust',
      sprite: { body: 'quad', crest: 'spines', primary: 0x2b2226, accent: 0xff7a3c, size: 0.68 },
      bestiary: [
        'Black glass with a fire still moving inside it.',
        'Struck hard enough it does not break — it hardens, and then it is your problem.',
        "Cael: I have seen one standing over a Keeper's grave. Standing, not guarding. Standing.",
      ],
    }),
    C({
      id: 'emberfowl', name: 'Emberfowl', threads: ['ember'], role: 'skirmisher',
      base: { hp: 50, atk: 58, def: 28, mag: 54, res: 34, spd: 88 },
      trait: { id: 'updraft', name: 'Updraft', description: '+25% speed in open terrain.' },
      skills: ['cinder_spit', 'pounce', 'gale_step'],
      biome: 'ashen_wastes', rarity: 72, tameBase: 0.38, preferredFood: 'ash_grain',
      evolvesTo: 'pyrelark', evolveLevel: 26,
      sprite: { body: 'winged', crest: 'frill', primary: 0xe87b3a, accent: 0xffe08a, size: 0.32 },
      bestiary: [
        'It does not so much fly as fall upward in a hurry.',
        'They nest in active vents. The eggs need the heat; the parents apparently do not mind.',
        'Cael: the vents are Loom exhaust. They are nesting in the machine.',
      ],
    }),
    C({
      id: 'pyrelark', name: 'Pyrelark', threads: ['ember', 'storm'], role: 'mage',
      base: { hp: 84, atk: 68, def: 44, mag: 116, res: 62, spd: 106 },
      trait: { id: 'cinderfall', name: 'Cinderfall', description: 'Leaves a burning trail while dashing.' },
      skills: ['cinder_spit', 'arc_lash', 'eruption', 'gale_step'],
      biome: 'ashen_wastes', rarity: 16, tameBase: 0.17, preferredFood: 'ash_grain',
      sprite: { body: 'winged', crest: 'wings', primary: 0xff8b3d, accent: 0xffe9a8, size: 0.42 },
      bestiary: [
        'A line of fire in the sky that turns when you do.',
        'Larks sing before an ash storm. Every caravan in the Wastes listens for it.',
        'Cael: the song is a Loom diagnostic tone. They are reading the weather off the machine.',
      ],
    }),
    C({
      id: 'slagworm', name: 'Slagworm', threads: ['ember', 'stone'], role: 'tank',
      base: { hp: 118, atk: 70, def: 84, mag: 52, res: 56, spd: 30 },
      trait: { id: 'burrow', name: 'Burrow', description: 'Becomes untargetable for 2 seconds, once per fight.' },
      skills: ['strike', 'eruption', 'guard_up'],
      biome: 'ashen_wastes', rarity: 44, tameBase: 0.28, preferredFood: 'sulfur_cake',
      evolvesTo: 'cauldrake', evolveLevel: 38, evolveBond: 6,
      sprite: { body: 'serpent', crest: 'none', primary: 0x8a4a2c, accent: 0xffa14a, size: 0.5 },
      bestiary: [
        'You feel it before you see it, which is not much warning.',
        'It eats stone and excretes glass. The Wastes are paved with its opinion of dinner.',
        'Cael: the glass roads are a map. Something is being written down there.',
      ],
    }),
    C({
      id: 'cauldrake', name: 'Cauldrake', threads: ['ember'], role: 'mage',
      base: { hp: 132, atk: 82, def: 76, mag: 128, res: 80, spd: 46 },
      trait: { id: 'eruptor', name: 'Eruptor', description: 'Area skills gain one radius tier.' },
      skills: ['eruption', 'molten_charge', 'cinder_spit', 'bellow'],
      biome: 'ashen_wastes', rarity: 7, tameBase: 0.11, preferredFood: 'emberglass_dust',
      sprite: { body: 'serpent', crest: 'horns', primary: 0xb03a22, accent: 0xffcf5c, size: 0.7 },
      bestiary: [
        'A worm that grew a head and some very firm ideas.',
        'It nests on the largest heat source within a day of travel and defends it absolutely.',
        'Cael: the largest heat source is always a Threadstone. Always. They are guarding the machine that made them.',
      ],
    }),

    // ═══════════════ FROSTSPIRE ═══════════════
    C({
      id: 'frostkit', name: 'Frostkit', threads: ['tide'], role: 'skirmisher',
      base: { hp: 54, atk: 50, def: 34, mag: 48, res: 44, spd: 76 },
      trait: { id: 'snowstep', name: 'Snowstep', description: 'Leaves no tracks; increased evasion on snow.' },
      skills: ['strike', 'frost_bite'],
      biome: 'frostspire', rarity: 100, tameBase: 0.46, preferredFood: 'frozen_fish',
      evolvesTo: 'rimefang', evolveLevel: 17,
      sprite: { body: 'quad', crest: 'tail', primary: 0xd9ecf5, accent: 0x4a9fd4, size: 0.3 },
      bestiary: [
        'Small, white, and where it was standing a moment ago.',
        'A kit will follow a traveller for days without ever being seen once.',
        'Cael: they follow anyone carrying a Threadstone. They can smell the machine.',
      ],
    }),
    C({
      id: 'rimefang', name: 'Rimefang', threads: ['tide'], role: 'assassin',
      base: { hp: 78, atk: 94, def: 44, mag: 62, res: 54, spd: 98 },
      trait: { id: 'frostbite_trait', name: 'Frostbite', description: 'Every hit applies one stack of Chill.' },
      skills: ['frost_bite', 'rime_shard', 'pounce'],
      biome: 'frostspire', rarity: 50, tameBase: 0.3, preferredFood: 'frozen_fish',
      evolvesTo: 'glacierclaw', evolveLevel: 36,
      sprite: { body: 'quad', crest: 'spines', primary: 0xa7cfe4, accent: 0xffffff, size: 0.4 },
      bestiary: [
        'The cold arrives slightly before it does.',
        'It hunts by exhaustion — it does not need to be faster, only colder.',
        'Cael: patience is not a stat I gave anything.',
      ],
    }),
    C({
      id: 'glacierclaw', name: 'Glacierclaw', threads: ['tide', 'stone'], role: 'bruiser',
      base: { hp: 146, atk: 122, def: 92, mag: 66, res: 76, spd: 62 },
      trait: { id: 'avalanche', name: 'Avalanche', description: 'Critical hits stun Chilled targets.' },
      skills: ['frost_bite', 'undertow', 'pounce', 'guard_up'],
      biome: 'frostspire', rarity: 9, tameBase: 0.13, preferredFood: 'rime_marrow',
      sprite: { body: 'biped', crest: 'horns', primary: 0x6f9ec0, accent: 0xe8f6ff, size: 0.64 },
      bestiary: [
        'Two metres of weather with hands.',
        'It carves the ice it sleeps in. The carvings repeat, across peaks it cannot have visited.',
        'Cael: the carvings are Loom glyphs. It is copying something it has never seen.',
      ],
    }),
    C({
      id: 'snowquill', name: 'Snowquill', threads: ['tide', 'radiance'], role: 'support',
      base: { hp: 62, atk: 34, def: 44, mag: 62, res: 60, spd: 58 },
      trait: { id: 'warmcoat', name: 'Warmcoat', description: 'Reduces party Warmth drain by 40%.' },
      skills: ['rime_shard', 'moonveil', 'regrow'],
      biome: 'frostspire', rarity: 66, tameBase: 0.4, preferredFood: 'pine_seed',
      evolvesTo: 'auroraquill', evolveLevel: 30, evolveCondition: 'aurora',
      sprite: { body: 'winged', crest: 'frill', primary: 0xf0f6fa, accent: 0xbfd8e8, size: 0.34 },
      bestiary: [
        'Warm to the touch, in a place where nothing is.',
        'Travellers who sleep near one wake up. Travellers who do not, sometimes do not.',
        'Cael: it is a survival subroutine that grew a body. The kindest accident in the Realm.',
      ],
    }),
    C({
      id: 'auroraquill', name: 'Auroraquill', threads: ['radiance'], role: 'support',
      base: { hp: 96, atk: 46, def: 62, mag: 122, res: 106, spd: 72 },
      trait: { id: 'aurora_trait', name: 'Aurora', description: 'Heals the whole party for 12% every 20 seconds.' },
      skills: ['aurora', 'moonveil', 'radiant_lance', 'regrow'],
      biome: 'frostspire', rarity: 6, tameBase: 0.1, preferredFood: 'rime_marrow',
      sprite: { body: 'winged', crest: 'halo', primary: 0xdff6f0, accent: 0x9ff0c4, size: 0.46 },
      bestiary: [
        'Under the lights, it becomes briefly the same colour as the sky.',
        'It only evolves under an aurora. Nobody has ever seen it happen twice.',
        'Cael: the aurora is the Loom venting. It is being born out of the machine breathing.',
      ],
    }),
    C({
      id: 'hoarfrost_wisp', name: 'Hoarfrost Wisp', threads: ['tide', 'umbra'], role: 'mage',
      base: { hp: 56, atk: 26, def: 30, mag: 88, res: 66, spd: 80 },
      trait: { id: 'phase', name: 'Phase', description: '20% chance to ignore an incoming hit entirely.' },
      skills: ['rime_shard', 'hex', 'undertow'],
      biome: 'frostspire', rarity: 40, tameBase: 0.26, preferredFood: 'pine_seed',
      evolvesTo: 'blizzardwraith', evolveLevel: 42, evolveItem: 'rime_crystal',
      sprite: { body: 'floating', crest: 'none', primary: 0xbfe4f0, accent: 0x6a4a9e, size: 0.3 },
      bestiary: [
        'Half there. The half that is there is very cold.',
        'It drifts along old roads that the snow buried centuries ago.',
        'Cael: it is walking a route. The route is a Loom maintenance path. It is still doing its job.',
      ],
    }),
    C({
      id: 'blizzardwraith', name: 'Blizzardwraith', threads: ['tide', 'umbra'], role: 'mage',
      base: { hp: 102, atk: 44, def: 58, mag: 138, res: 96, spd: 92 },
      trait: { id: 'whiteout', name: 'Whiteout', description: 'Enemies within its aura suffer -25% accuracy.' },
      skills: ['undertow', 'rime_shard', 'nightfall', 'hex'],
      biome: 'frostspire', rarity: 5, tameBase: 0.09, preferredFood: 'rime_marrow',
      sprite: { body: 'floating', crest: 'frill', primary: 0x8fb8cc, accent: 0x4b3a72, size: 0.5 },
      bestiary: [
        'The storm has a middle, and the middle is looking at you.',
        'It does not pursue. It arranges the weather until you come to it.',
        'Cael: it still thinks it is clearing a path. It has forgotten there is anyone to clear it for.',
      ],
    }),

    // ═══════════════ SUNKEN MIRE ═══════════════
    C({
      id: 'bogling', name: 'Bogling', threads: ['verdant'], role: 'support',
      base: { hp: 60, atk: 34, def: 40, mag: 48, res: 42, spd: 44 },
      trait: { id: 'spore_cloud', name: 'Spore Cloud', description: 'Poisons attackers who strike it in melee.' },
      skills: ['spore_burst', 'strike', 'regrow'],
      biome: 'sunken_mire', rarity: 100, tameBase: 0.47, preferredFood: 'bog_cap',
      evolvesTo: 'mireling', evolveLevel: 15,
      sprite: { body: 'blob', crest: 'cap', primary: 0x5f7a4a, accent: 0x9bbf5a, size: 0.3 },
      bestiary: [
        'It is mostly water and does not seem embarrassed about it.',
        'Boglings gather where someone died. They are not scavenging. They just gather.',
        'Cael: they are marking losses. A tally kept by something that cannot count.',
      ],
    }),
    C({
      id: 'mireling', name: 'Mireling', threads: ['verdant', 'tide'], role: 'skirmisher',
      base: { hp: 88, atk: 66, def: 56, mag: 62, res: 54, spd: 70 },
      trait: { id: 'amphibious', name: 'Amphibious', description: 'No penalty in water; gains speed while swimming.' },
      skills: ['thorn_lash', 'spore_burst', 'undertow'],
      biome: 'sunken_mire', rarity: 58, tameBase: 0.32, preferredFood: 'bog_cap',
      evolvesTo: 'fenlord', evolveLevel: 33,
      sprite: { body: 'biped', crest: 'frill', primary: 0x47694a, accent: 0x6fb3a8, size: 0.4 },
      bestiary: [
        'Comfortable in water that would kill you in an hour.',
        'It ferries smaller creatures across deep channels, unasked and unthanked.',
        'Cael: unasked. Write that down. Nothing in the pattern is unasked.',
      ],
    }),
    C({
      id: 'fenlord', name: 'Fenlord', threads: ['verdant', 'tide'], role: 'tank',
      base: { hp: 156, atk: 92, def: 96, mag: 74, res: 78, spd: 48 },
      trait: { id: 'drowning_grip', name: 'Drowning Grip', description: '25% chance to root a target on hit.' },
      skills: ['undertow', 'rootwall', 'thorn_lash', 'bellow'],
      biome: 'sunken_mire', rarity: 9, tameBase: 0.13, preferredFood: 'mire_pearl',
      sprite: { body: 'biped', crest: 'horns', primary: 0x2f4a3a, accent: 0x7fc4a8, size: 0.66 },
      bestiary: [
        'The mire stands up and has a face.',
        'A Fenlord rules a stretch of water and everything living in it, benignly and absolutely.',
        'Cael: it built a government. Out of frogs. I want that on the record.',
      ],
    }),
    C({
      id: 'croakhide', name: 'Croakhide', threads: ['verdant'], role: 'tank',
      base: { hp: 104, atk: 46, def: 74, mag: 40, res: 56, spd: 32 },
      trait: { id: 'elastic', name: 'Elastic', description: 'Caps any single hit at 20% of its max health.' },
      skills: ['strike', 'guard_up', 'spore_burst'],
      biome: 'sunken_mire', rarity: 70, tameBase: 0.4, preferredFood: 'marsh_fly',
      evolvesTo: 'toadmancer', evolveLevel: 29, evolveBond: 4,
      sprite: { body: 'blob', crest: 'none', primary: 0x6a7f3c, accent: 0xc4d18a, size: 0.44 },
      bestiary: [
        'Hitting it is like hitting a decision that has already been made.',
        'It swallows things whole and thinks about them later.',
        'Cael: I have recovered three Threadstones from inside these. They are collecting them.',
      ],
    }),
    C({
      id: 'toadmancer', name: 'Toadmancer', threads: ['verdant', 'umbra'], role: 'mage',
      base: { hp: 128, atk: 60, def: 84, mag: 124, res: 88, spd: 40 },
      trait: { id: 'hex_tongue', name: 'Hex-Tongue', description: 'Applies a random debuff whenever it uses a skill.' },
      skills: ['hex', 'spore_burst', 'nightfall', 'guard_up'],
      biome: 'sunken_mire', rarity: 11, tameBase: 0.15, preferredFood: 'mire_pearl',
      sprite: { body: 'blob', crest: 'horns', primary: 0x4a5a2e, accent: 0x8b5fbf, size: 0.56 },
      bestiary: [
        'It has been sitting there a long time and it has been thinking.',
        'Toadmancers trade. Bring an object, leave it, come back — something else will be there.',
        'Cael: it is running a market. It learned commerce from watching us. Nobody taught it.',
      ],
    }),
    C({
      id: 'silthid', name: 'Silthid', threads: ['tide'], role: 'assassin',
      base: { hp: 58, atk: 76, def: 34, mag: 44, res: 38, spd: 92 },
      trait: { id: 'slipstream', name: 'Slipstream', description: 'Its first attack each fight cannot miss.' },
      skills: ['strike', 'frost_bite', 'pounce'],
      biome: 'sunken_mire', rarity: 54, tameBase: 0.33, preferredFood: 'raw_fish',
      evolvesTo: 'nagathid', evolveLevel: 37,
      sprite: { body: 'serpent', crest: 'none', primary: 0x3f7d8c, accent: 0xa8e0e8, size: 0.34 },
      bestiary: [
        'The water moves wrong, and then you are bleeding.',
        'It never strikes twice from the same direction, ever, in its whole life.',
        'Cael: no repetition. Do you know how hard that is to do on purpose?',
      ],
    }),
    C({
      id: 'nagathid', name: 'Nagathid', threads: ['tide', 'umbra'], role: 'assassin',
      base: { hp: 108, atk: 134, def: 56, mag: 78, res: 62, spd: 116 },
      trait: { id: 'constrict', name: 'Constrict', description: 'Damage scales with the target’s missing health.' },
      skills: ['devour', 'drain_touch', 'undertow', 'pounce'],
      biome: 'sunken_mire', rarity: 6, tameBase: 0.1, preferredFood: 'mire_pearl',
      sprite: { body: 'serpent', crest: 'frill', primary: 0x1f4a52, accent: 0x7a4fa8, size: 0.58 },
      bestiary: [
        'Long. Patient. Already closer than it was.',
        'A bonded Nagathid coils around its Wayfinder while they sleep. It is not affection. It is a perimeter.',
        'Cael: it guards. Everything down here guards. What did I teach them to be so afraid of?',
      ],
    }),

    // ═══════════════ DUST SEA ═══════════════
    C({
      id: 'sandflea', name: 'Sandflea', threads: ['storm'], role: 'skirmisher',
      base: { hp: 44, atk: 48, def: 26, mag: 34, res: 28, spd: 96 },
      trait: { id: 'erratic', name: 'Erratic', description: '+18% evasion, -10% accuracy.' },
      skills: ['strike', 'gale_step'],
      biome: 'dust_sea', rarity: 100, tameBase: 0.5, preferredFood: 'dust_grain',
      evolvesTo: 'duneskitter', evolveLevel: 19,
      sprite: { body: 'insect', crest: 'antennae', primary: 0xd8bd7a, accent: 0xe2c044, size: 0.24 },
      bestiary: [
        'Impossible to hit and not really worth hitting.',
        'They migrate in millions. Once a year the desert appears to boil.',
        'Cael: the migration route is a Loom cable trench. They are following buried wire.',
      ],
    }),
    C({
      id: 'duneskitter', name: 'Duneskitter', threads: ['storm', 'stone'], role: 'skirmisher',
      base: { hp: 82, atk: 84, def: 58, mag: 52, res: 46, spd: 118 },
      trait: { id: 'dust_devil_trait', name: 'Dust Devil', description: 'Dashing leaves a blinding cloud behind it.' },
      skills: ['dust_devil', 'gale_step', 'pounce', 'arc_lash'],
      biome: 'dust_sea', rarity: 46, tameBase: 0.28, preferredFood: 'dust_grain',
      sprite: { body: 'insect', crest: 'spines', primary: 0xc9a45c, accent: 0xf0dc9a, size: 0.4 },
      bestiary: [
        'It arrives as weather and leaves as a rumour.',
        'Caravans hire them. Nobody has explained the terms to the Duneskitter.',
        'Cael: it accepts payment. In glass. Only in glass.',
      ],
    }),
    C({
      id: 'scarabond', name: 'Scarabond', threads: ['stone'], role: 'tank',
      base: { hp: 98, atk: 52, def: 84, mag: 30, res: 52, spd: 36 },
      trait: { id: 'carapace', name: 'Carapace', description: 'Reduces every incoming hit by a flat 4.' },
      skills: ['strike', 'guard_up'],
      biome: 'dust_sea', rarity: 78, tameBase: 0.42, preferredFood: 'glass_beetle',
      evolvesTo: 'carapax', evolveLevel: 31,
      sprite: { body: 'insect', crest: 'none', primary: 0x8b7a4a, accent: 0xd4c07a, size: 0.4 },
      bestiary: [
        'A shield that walks and occasionally eats.',
        'They bury relics. Not eat — bury, carefully, in rows.',
        'Cael: rows. Sorted rows. By age. They are keeping an archive.',
      ],
    }),
    C({
      id: 'carapax', name: 'Carapax', threads: ['stone'], role: 'tank',
      base: { hp: 168, atk: 82, def: 128, mag: 44, res: 82, spd: 38 },
      trait: { id: 'bulwark', name: 'Bulwark', description: 'Adjacent allies take 20% less damage.' },
      skills: ['guard_up', 'bellow', 'strike', 'rootwall'],
      biome: 'dust_sea', rarity: 10, tameBase: 0.14, preferredFood: 'relic_dust',
      sprite: { body: 'insect', crest: 'spines', primary: 0x6b5c34, accent: 0xe8d69a, size: 0.66 },
      bestiary: [
        'It positions itself between danger and whatever is smaller than it.',
        'A Carapax will not move from in front of a wounded creature. Not for anything.',
        'Cael: I have watched one die that way. It could have left. It did the arithmetic and stayed.',
      ],
    }),
    C({
      id: 'mirageling', name: 'Mirageling', threads: ['storm', 'radiance'], role: 'mage',
      base: { hp: 58, atk: 32, def: 34, mag: 86, res: 62, spd: 84 },
      trait: { id: 'split_image', name: 'Split-Image', description: 'Spawns a decoy when it drops below 50% health.' },
      skills: ['arc_lash', 'radiant_lance', 'gale_step'],
      biome: 'dust_sea', rarity: 38, tameBase: 0.25, preferredFood: 'sun_glass',
      evolvesTo: 'sphinxwing', evolveLevel: 44, evolveItem: 'relic_fragment',
      sprite: { body: 'floating', crest: 'halo', primary: 0xf0e0b0, accent: 0xe2c044, size: 0.32 },
      bestiary: [
        'You saw it over there. It was never over there.',
        'A Mirageling shows travellers water. Sometimes the water is real. It seems to depend on the traveller.',
        'Cael: it is testing us. It has been testing us for a thousand years and I do not know the pass mark.',
      ],
    }),
    C({
      id: 'sphinxwing', name: 'Sphinxwing', threads: ['storm', 'radiance'], role: 'mage',
      base: { hp: 106, atk: 58, def: 62, mag: 142, res: 98, spd: 96 },
      trait: { id: 'riddle', name: 'Riddle', description: '15% chance to Confuse on any skill hit.' },
      skills: ['radiant_lance', 'arc_lash', 'hex', 'aurora'],
      biome: 'dust_sea', rarity: 4, tameBase: 0.08, preferredFood: 'relic_dust',
      sprite: { body: 'winged', crest: 'halo', primary: 0xe8d9a8, accent: 0xfff4c8, size: 0.52 },
      bestiary: [
        'It asks you something. You will not remember the question afterward.',
        'It only bonds with a Wayfinder who has answered it correctly. Nobody knows what they said.',
        "Cael: it asked me what the Realm was for. I did not have an answer. It let me live anyway.",
      ],
    }),

    // ═══════════════ HOLLOW DEEP ═══════════════
    C({
      id: 'gloomcap', name: 'Gloomcap', threads: ['umbra', 'verdant'], role: 'support',
      base: { hp: 66, atk: 36, def: 46, mag: 62, res: 56, spd: 40 },
      trait: { id: 'sporelight', name: 'Sporelight', description: 'Reveals hidden tiles within a radius.' },
      skills: ['spore_burst', 'hex', 'regrow'],
      biome: 'hollow_deep', rarity: 100, tameBase: 0.36, preferredFood: 'deep_fungus',
      evolvesTo: 'sporelord', evolveLevel: 35,
      sprite: { body: 'plant', crest: 'cap', primary: 0x4a3c5a, accent: 0x8fd4a8, size: 0.34 },
      bestiary: [
        'It glows faintly, which in the Deep makes it the most beautiful thing you have ever seen.',
        'Gloomcaps grow in a ring around every sealed door.',
        'Cael: every one. Every sealed door in the Deep. They are marking my locks.',
      ],
    }),
    C({
      id: 'sporelord', name: 'Sporelord', threads: ['umbra', 'verdant'], role: 'mage',
      base: { hp: 124, atk: 62, def: 78, mag: 132, res: 92, spd: 44 },
      trait: { id: 'bloomrot', name: 'Bloomrot', description: 'Poison on its victims spreads when they die.' },
      skills: ['spore_burst', 'nightfall', 'hex', 'rootwall'],
      biome: 'hollow_deep', rarity: 14, tameBase: 0.15, preferredFood: 'threadstone_dust',
      sprite: { body: 'plant', crest: 'cap', primary: 0x33294a, accent: 0x6fd49a, size: 0.6 },
      bestiary: [
        'The ring became a crown.',
        'A Sporelord is the centre of a fungal network several kilometres wide. It is, arguably, the cave.',
        'Cael: it has grown into the Loom cabling. It is not attacking it. It is splicing.',
      ],
    }),
    C({
      id: 'echobat', name: 'Echobat', threads: ['umbra'], role: 'skirmisher',
      base: { hp: 56, atk: 62, def: 32, mag: 50, res: 40, spd: 100 },
      trait: { id: 'echolocate', name: 'Echolocate', description: 'Ignores darkness and the Blind status.' },
      skills: ['strike', 'drain_touch', 'gale_step'],
      biome: 'hollow_deep', rarity: 84, tameBase: 0.34, preferredFood: 'deep_fungus',
      evolvesTo: 'nightmaw', evolveLevel: 45, evolveBond: 7,
      sprite: { body: 'winged', crest: 'wings', primary: 0x3a3050, accent: 0xb0a0d8, size: 0.3 },
      bestiary: [
        'You hear it map you.',
        'A colony sings a single continuous note that has not stopped in living memory.',
        'Cael: the note is a Loom carrier frequency. They have been holding the line open for a thousand years, waiting for someone to answer.',
      ],
    }),
    C({
      id: 'nightmaw', name: 'Nightmaw', threads: ['umbra', 'null'], role: 'assassin',
      base: { hp: 128, atk: 152, def: 66, mag: 92, res: 74, spd: 122 },
      trait: { id: 'devour_trait', name: 'Devour', description: 'Heals for 40% of any overkill damage it deals.' },
      skills: ['devour', 'nightfall', 'drain_touch', 'pounce'],
      biome: 'hollow_deep', rarity: 3, tameBase: 0.06, preferredFood: 'threadstone_dust',
      sprite: { body: 'winged', crest: 'spines', primary: 0x1a1626, accent: 0x9a5fd4, size: 0.66 },
      bestiary: [
        'The dark has a shape and the shape is hungry.',
        'It will not attack a Wayfinder holding a Loomcompass. It has never been observed to attack one.',
        'Cael: it recognises the compass. It recognises *me*. This is the last entry I am writing down here.',
      ],
    }),
  ].map((c) => [c.id, c]),
);

export const CREATURE_IDS = Object.keys(CREATURES);

export function getCreature(id: string): CreatureDef {
  const c = CREATURES[id];
  if (!c) throw new Error(`Unknown creature: ${id}`);
  return c;
}

/** Spawn table for a biome, as [id, weight] pairs for SeededRNG.weighted(). */
export function creaturesForBiome(biome: BiomeId): Array<[string, number]> {
  return CREATURE_IDS.filter((id) => CREATURES[id].biome === biome).map(
    (id) => [id, CREATURES[id].rarity] as [string, number],
  );
}
