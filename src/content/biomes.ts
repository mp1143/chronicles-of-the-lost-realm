import type { BiomeId } from './creatures';

export type TileId =
  | 'deep_water' | 'water' | 'sand' | 'grass' | 'tall_grass' | 'dirt' | 'stone'
  | 'snow' | 'ice' | 'ash' | 'lava_rock' | 'bog' | 'moss' | 'dust' | 'cave_floor' | 'cave_wall';

export interface TileDef {
  id: TileId;
  colour: number;
  /** Colour variance applied per-tile so large areas do not read as flat. */
  variance: number;
  walkable: boolean;
  /** Movement speed multiplier. */
  speed: number;
  /** Blocks line of sight and projectiles. */
  blocksSight: boolean;
}

const T = (d: TileDef): TileDef => d;

export const TILES: Record<TileId, TileDef> = Object.fromEntries(
  [
    T({ id: 'deep_water', colour: 0x1d4a6b, variance: 0.05, walkable: false, speed: 0, blocksSight: false }),
    T({ id: 'water', colour: 0x2f7ba8, variance: 0.06, walkable: true, speed: 0.55, blocksSight: false }),
    T({ id: 'sand', colour: 0xd8c48a, variance: 0.07, walkable: true, speed: 0.9, blocksSight: false }),
    T({ id: 'grass', colour: 0x4f8b45, variance: 0.09, walkable: true, speed: 1, blocksSight: false }),
    T({ id: 'tall_grass', colour: 0x3f7539, variance: 0.1, walkable: true, speed: 0.85, blocksSight: false }),
    T({ id: 'dirt', colour: 0x7a5f3d, variance: 0.08, walkable: true, speed: 1, blocksSight: false }),
    T({ id: 'stone', colour: 0x6e6e78, variance: 0.08, walkable: false, speed: 0, blocksSight: true }),
    T({ id: 'snow', colour: 0xdce8f0, variance: 0.05, walkable: true, speed: 0.8, blocksSight: false }),
    T({ id: 'ice', colour: 0xa7cfe4, variance: 0.06, walkable: true, speed: 1.15, blocksSight: false }),
    T({ id: 'ash', colour: 0x7a6f68, variance: 0.09, walkable: true, speed: 0.9, blocksSight: false }),
    T({ id: 'lava_rock', colour: 0x3a2b28, variance: 0.1, walkable: true, speed: 0.85, blocksSight: false }),
    T({ id: 'bog', colour: 0x46533a, variance: 0.1, walkable: true, speed: 0.6, blocksSight: false }),
    T({ id: 'moss', colour: 0x4a6b40, variance: 0.09, walkable: true, speed: 0.95, blocksSight: false }),
    T({ id: 'dust', colour: 0xc9ad74, variance: 0.07, walkable: true, speed: 0.92, blocksSight: false }),
    T({ id: 'cave_floor', colour: 0x3a3442, variance: 0.08, walkable: true, speed: 1, blocksSight: false }),
    T({ id: 'cave_wall', colour: 0x211d29, variance: 0.06, walkable: false, speed: 0, blocksSight: true }),
  ].map((t) => [t.id, t]),
) as Record<TileId, TileDef>;

export interface HarvestableDef {
  id: string;
  name: string;
  /** Yields, rolled once per harvest. */
  drops: Array<{ itemId: string; min: number; max: number; chance: number }>;
  /** Required tool, if any. */
  tool?: 'axe' | 'pick';
  hitsToBreak: number;
  /** Real minutes before the node regrows. */
  respawnMin: number;
  colour: number;
  accent: number;
  size: number;
  shape: 'tree' | 'rock' | 'bush' | 'crystal';
}

const H = (d: HarvestableDef): HarvestableDef => d;

export const HARVESTABLES: Record<string, HarvestableDef> = Object.fromEntries(
  [
    H({ id: 'tree', name: 'Tree', shape: 'tree', tool: 'axe', hitsToBreak: 4, respawnMin: 8, colour: 0x3f6b33, accent: 0x6b4a2a, size: 0.55, drops: [{ itemId: 'timber', min: 2, max: 4, chance: 1 }, { itemId: 'fiber', min: 0, max: 2, chance: 0.5 }] }),
    H({ id: 'bush', name: 'Berry Bush', shape: 'bush', hitsToBreak: 1, respawnMin: 5, colour: 0x4f8b45, accent: 0xe8543c, size: 0.32, drops: [{ itemId: 'sunberry', min: 1, max: 3, chance: 1 }, { itemId: 'fiber', min: 1, max: 2, chance: 0.7 }] }),
    H({ id: 'reeds', name: 'Reeds', shape: 'bush', hitsToBreak: 1, respawnMin: 4, colour: 0x7a8f4a, accent: 0x9bbf5a, size: 0.28, drops: [{ itemId: 'fiber', min: 2, max: 4, chance: 1 }] }),
    H({ id: 'rock', name: 'Rock', shape: 'rock', tool: 'pick', hitsToBreak: 4, respawnMin: 10, colour: 0x7a7a84, accent: 0x9a9aa4, size: 0.4, drops: [{ itemId: 'stone_block', min: 2, max: 4, chance: 1 }] }),
    H({ id: 'copper_vein', name: 'Copper Vein', shape: 'rock', tool: 'pick', hitsToBreak: 5, respawnMin: 14, colour: 0x7a7a84, accent: 0xc87a3a, size: 0.42, drops: [{ itemId: 'copper_ore', min: 2, max: 3, chance: 1 }, { itemId: 'stone_block', min: 1, max: 2, chance: 0.8 }] }),
    H({ id: 'iron_vein', name: 'Iron Vein', shape: 'rock', tool: 'pick', hitsToBreak: 6, respawnMin: 18, colour: 0x7a7a84, accent: 0x9a8478, size: 0.44, drops: [{ itemId: 'iron_ore', min: 1, max: 3, chance: 1 }, { itemId: 'stone_block', min: 1, max: 2, chance: 0.8 }] }),
    H({ id: 'threadstone_node', name: 'Threadstone Outcrop', shape: 'crystal', tool: 'pick', hitsToBreak: 8, respawnMin: 45, colour: 0x4a3c5a, accent: 0x9a7fd4, size: 0.46, drops: [{ itemId: 'threadstone_shard', min: 1, max: 1, chance: 1 }, { itemId: 'stone_block', min: 1, max: 3, chance: 0.6 }] }),
  ].map((h) => [h.id, h]),
);

export interface BiomeDef {
  id: BiomeId;
  name: string;
  /** Danger 1-6, used to weight spawn level and loot. */
  danger: number;
  /** Ordered by elevation: [deepWater, water, shore, low, mid, high]. */
  tiles: [TileId, TileId, TileId, TileId, TileId, TileId];
  /** Harvestable node weights. */
  nodes: Array<[string, number]>;
  /** Nodes per 1000 walkable tiles. */
  nodeDensity: number;
  /** Creature spawns per 1000 walkable tiles. */
  spawnDensity: number;
  /** Warmth drain per second (negative = the biome heats you). */
  warmthDrain: number;
  ambientLight: number;
}

const B = (d: BiomeDef): BiomeDef => d;

export const BIOMES: Record<BiomeId, BiomeDef> = Object.fromEntries(
  [
    B({
      id: 'verdant_reach', name: 'Verdant Reach', danger: 1,
      tiles: ['deep_water', 'water', 'sand', 'grass', 'tall_grass', 'stone'],
      nodes: [['tree', 100], ['bush', 55], ['rock', 40], ['copper_vein', 14], ['iron_vein', 5], ['threadstone_node', 1]],
      nodeDensity: 46, spawnDensity: 12, warmthDrain: 0, ambientLight: 1,
    }),
    B({
      id: 'ashen_wastes', name: 'Ashen Wastes', danger: 3,
      tiles: ['deep_water', 'lava_rock', 'ash', 'ash', 'lava_rock', 'stone'],
      nodes: [['rock', 100], ['iron_vein', 40], ['copper_vein', 20], ['threadstone_node', 4]],
      nodeDensity: 30, spawnDensity: 16, warmthDrain: -0.9, ambientLight: 0.9,
    }),
    B({
      id: 'frostspire', name: 'Frostspire', danger: 3,
      tiles: ['ice', 'ice', 'snow', 'snow', 'stone', 'stone'],
      nodes: [['tree', 60], ['rock', 80], ['iron_vein', 30], ['threadstone_node', 3]],
      nodeDensity: 32, spawnDensity: 13, warmthDrain: 1.1, ambientLight: 1,
    }),
    B({
      id: 'sunken_mire', name: 'Sunken Mire', danger: 2,
      tiles: ['deep_water', 'water', 'bog', 'bog', 'moss', 'stone'],
      nodes: [['reeds', 100], ['tree', 55], ['bush', 30], ['rock', 20], ['threadstone_node', 2]],
      nodeDensity: 44, spawnDensity: 15, warmthDrain: 0.2, ambientLight: 0.85,
    }),
    B({
      id: 'dust_sea', name: 'Dust Sea', danger: 4,
      tiles: ['deep_water', 'sand', 'dust', 'dust', 'sand', 'stone'],
      nodes: [['rock', 100], ['copper_vein', 25], ['iron_vein', 20], ['threadstone_node', 5]],
      nodeDensity: 22, spawnDensity: 11, warmthDrain: -0.5, ambientLight: 1.1,
    }),
    B({
      id: 'hollow_deep', name: 'Hollow Deep', danger: 5,
      tiles: ['deep_water', 'water', 'cave_floor', 'cave_floor', 'cave_wall', 'cave_wall'],
      nodes: [['rock', 70], ['iron_vein', 45], ['threadstone_node', 20]],
      nodeDensity: 34, spawnDensity: 18, warmthDrain: 0.4, ambientLight: 0.25,
    }),
    B({
      id: 'loom_core', name: 'Loom Core', danger: 6,
      tiles: ['deep_water', 'water', 'cave_floor', 'cave_floor', 'stone', 'cave_wall'],
      nodes: [['threadstone_node', 100], ['rock', 40]],
      nodeDensity: 26, spawnDensity: 20, warmthDrain: 0, ambientLight: 0.5,
    }),
  ].map((b) => [b.id, b]),
) as Record<BiomeId, BiomeDef>;

/**
 * Whittaker-style classification, not a random pick. This is why a generated
 * Shard reads as a coherent place instead of noise. GDD §4.2 / TechDesign §8.4.
 */
export function classifyBiome(elevation: number, moisture: number, temperature: number): BiomeId {
  if (elevation > 0.78) return temperature < 0.35 ? 'frostspire' : 'ashen_wastes';
  if (temperature > 0.68 && moisture < 0.34) return 'dust_sea';
  if (temperature > 0.55 && moisture > 0.66) return 'sunken_mire';
  if (temperature < 0.28) return 'frostspire';
  if (temperature > 0.8) return 'ashen_wastes';
  return 'verdant_reach';
}
