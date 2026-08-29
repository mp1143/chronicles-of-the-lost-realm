import { CHUNK_SIZE } from '../core/config';
import type { SeededRNG } from '../core/rng';
import { BIOMES, TILES, type TileId } from '../content/biomes';
import type { BiomeId } from '../content/creatures';
import { creaturesForBiome } from '../content/creatures';
import type { ShardTerrain } from './terrain';

/** Tile palette: chunks store a byte index rather than a string per tile. */
export const TILE_PALETTE: TileId[] = Object.keys(TILES) as TileId[];
const TILE_INDEX = new Map<TileId, number>(TILE_PALETTE.map((t, i) => [t, i]));

export interface NodeSpawn {
  /** Stable id: chunk-scoped, so the delta store can mark it harvested forever. */
  id: string;
  kind: string;
  x: number;
  y: number;
}

export interface CreatureSpawn {
  id: string;
  creatureId: string;
  level: number;
  x: number;
  y: number;
}

export class Chunk {
  readonly tiles: Uint8Array;
  readonly biomes: Uint8Array;
  readonly nodes: NodeSpawn[] = [];
  readonly spawns: CreatureSpawn[] = [];
  /** Dominant biome, used for ambient audio, lighting and the minimap legend. */
  biome: BiomeId = 'verdant_reach';

  constructor(readonly cx: number, readonly cy: number) {
    this.tiles = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    this.biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  }

  static key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  get key(): string {
    return Chunk.key(this.cx, this.cy);
  }

  tileAtLocal(lx: number, ly: number): TileId {
    return TILE_PALETTE[this.tiles[ly * CHUNK_SIZE + lx]];
  }
}

const BIOME_LIST: BiomeId[] = Object.keys(BIOMES) as BiomeId[];
const BIOME_INDEX = new Map<BiomeId, number>(BIOME_LIST.map((b, i) => [b, i]));

/**
 * Generates one chunk. Pure function of (terrain, cx, cy) — the same chunk
 * regenerates identically on every load, which is what lets the save file store
 * only deltas.
 *
 * Node and spawn placement use jittered-grid sampling (a cheap Poisson-disk
 * stand-in): points never overlap and never form a visible grid.
 */
export function generateChunk(terrain: ShardTerrain, rootRng: SeededRNG, cx: number, cy: number): Chunk {
  const chunk = new Chunk(cx, cy);
  const ox = cx * CHUNK_SIZE;
  const oy = cy * CHUNK_SIZE;

  const biomeCounts = new Map<BiomeId, number>();
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const s = terrain.sample(ox + lx, oy + ly);
      const i = ly * CHUNK_SIZE + lx;
      chunk.tiles[i] = TILE_INDEX.get(s.tile) ?? 0;
      chunk.biomes[i] = BIOME_INDEX.get(s.biome) ?? 0;
      biomeCounts.set(s.biome, (biomeCounts.get(s.biome) ?? 0) + 1);
    }
  }
  let bestBiome: BiomeId = 'verdant_reach';
  let bestCount = -1;
  for (const [b, n] of biomeCounts) {
    if (n > bestCount) {
      bestCount = n;
      bestBiome = b;
    }
  }
  chunk.biome = bestBiome;

  // Chunk-local streams, keyed by coordinate: generation order never matters.
  const nodeRng = rootRng.fork(`nodes/${cx},${cy}`);
  const spawnRng = rootRng.fork(`spawns/${cx},${cy}`);

  placeNodes(chunk, terrain, nodeRng, ox, oy);
  placeSpawns(chunk, terrain, spawnRng, ox, oy);
  return chunk;
}

function placeNodes(chunk: Chunk, terrain: ShardTerrain, rng: SeededRNG, ox: number, oy: number): void {
  const biome = BIOMES[chunk.biome];
  const walkable = countWalkable(chunk);
  const target = Math.round((walkable / 1000) * biome.nodeDensity);
  if (target <= 0) return;

  // Jittered grid: cell size chosen so the target count fits, then one sample per cell.
  const cells = Math.max(1, Math.ceil(Math.sqrt(target)));
  const cell = CHUNK_SIZE / cells;
  let placed = 0;

  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      if (placed >= target) return;
      const lx = Math.floor(gx * cell + rng.float(0, cell));
      const ly = Math.floor(gy * cell + rng.float(0, cell));
      if (lx >= CHUNK_SIZE || ly >= CHUNK_SIZE) continue;
      const tile = chunk.tileAtLocal(lx, ly);
      if (!TILES[tile].walkable) continue;
      if (tile === 'water' || tile === 'deep_water') continue;

      const localBiome = BIOME_LIST[chunk.biomes[ly * CHUNK_SIZE + lx]];
      const kind = rng.weighted(BIOMES[localBiome].nodes);
      chunk.nodes.push({
        id: `n:${chunk.cx},${chunk.cy}:${placed}`,
        kind,
        x: ox + lx + 0.5,
        y: oy + ly + 0.5,
      });
      placed++;
    }
  }
  void terrain;
}

function placeSpawns(chunk: Chunk, terrain: ShardTerrain, rng: SeededRNG, ox: number, oy: number): void {
  const biome = BIOMES[chunk.biome];
  const walkable = countWalkable(chunk);
  const target = Math.round((walkable / 1000) * biome.spawnDensity);
  if (target <= 0) return;

  const pool = creaturesForBiome(chunk.biome);
  if (pool.length === 0) return;

  for (let i = 0; i < target; i++) {
    const lx = rng.int(0, CHUNK_SIZE - 1);
    const ly = rng.int(0, CHUNK_SIZE - 1);
    const tile = chunk.tileAtLocal(lx, ly);
    if (!TILES[tile].walkable || tile === 'deep_water') continue;

    const creatureId = rng.weighted(pool);
    // Level scales with distance from the Shard centre and biome danger.
    const dist = Math.hypot(ox + lx - terrain.size / 2, oy + ly - terrain.size / 2) / (terrain.size / 2);
    const level = Math.max(
      1,
      Math.round(1 + dist * 14 * biome.danger * 0.5 + rng.float(-1.5, 2.5)),
    );
    chunk.spawns.push({
      id: `s:${chunk.cx},${chunk.cy}:${i}`,
      creatureId,
      level,
      x: ox + lx + 0.5,
      y: oy + ly + 0.5,
    });
  }
}

function countWalkable(chunk: Chunk): number {
  let n = 0;
  for (let i = 0; i < chunk.tiles.length; i++) {
    if (TILES[TILE_PALETTE[chunk.tiles[i]]].walkable) n++;
  }
  return n;
}
