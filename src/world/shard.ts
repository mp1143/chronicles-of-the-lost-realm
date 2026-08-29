import { CHUNK_SIZE, LOAD_RADIUS, UNLOAD_RADIUS, SHARD_SIZE } from '../core/config';
import { SeededRNG } from '../core/rng';
import { TILES, type TileId } from '../content/biomes';
import type { BiomeId } from '../content/creatures';
import { ShardTerrain } from './terrain';
import { Chunk, generateChunk, TILE_PALETTE } from './chunk';

/**
 * A loaded Shard: terrain fields, resident chunks, and the delta store that
 * records everything the player has changed.
 *
 * The world is never serialised. On load we regenerate from the seed and replay
 * the deltas — a 40 hour save is a few hundred KB instead of tens of MB
 * (TechnicalDesign §3.2).
 */

export interface ShardDelta {
  /** Node ids the player has harvested, with the real-time ms at which they respawn. */
  harvested: Record<string, number>;
  /** Spawn ids that are dead, with the ms at which they may return. */
  killed: Record<string, number>;
  /** Tile overrides, packed as "x,y" -> tile palette index. */
  tiles: Record<string, number>;
  /** Placed structures. */
  structures: Array<{ id: string; structureId: string; x: number; y: number }>;
  /** Per-POI flags: chest opened, dungeon cleared, boss defeated. */
  poi: Record<string, unknown>;
}

export function emptyDelta(): ShardDelta {
  return { harvested: {}, killed: {}, tiles: {}, structures: [], poi: {} };
}

export class ShardWorld {
  readonly terrain: ShardTerrain;
  readonly rng: SeededRNG;
  readonly chunks = new Map<string, Chunk>();
  delta: ShardDelta = emptyDelta();
  /** Chunks generated this session, for the loading budget. */
  private pending: Array<[number, number]> = [];

  constructor(
    readonly worldSeed: string,
    readonly shardId: string,
    size = SHARD_SIZE,
  ) {
    this.terrain = new ShardTerrain(worldSeed, shardId, size);
    this.rng = new SeededRNG(`${worldSeed}:${shardId}`, shardId);
  }

  get size(): number {
    return this.terrain.size;
  }

  // ---------- chunk residency ----------

  /** Queues chunks around a world position and drops distant ones. */
  updateResidency(worldX: number, worldY: number): void {
    const pcx = Math.floor(worldX / CHUNK_SIZE);
    const pcy = Math.floor(worldY / CHUNK_SIZE);

    for (let dy = -LOAD_RADIUS; dy <= LOAD_RADIUS; dy++) {
      for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
        const cx = pcx + dx;
        const cy = pcy + dy;
        if (!this.inBounds(cx, cy)) continue;
        const key = Chunk.key(cx, cy);
        if (!this.chunks.has(key) && !this.pending.some(([x, y]) => x === cx && y === cy)) {
          this.pending.push([cx, cy]);
        }
      }
    }

    // Hysteresis: unload at a larger radius than we load, so walking a border
    // does not thrash generation.
    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - pcx) > UNLOAD_RADIUS || Math.abs(chunk.cy - pcy) > UNLOAD_RADIUS) {
        this.chunks.delete(key);
      }
    }
  }

  /**
   * Generates at most `budget` queued chunks. Called once per tick so a
   * fast-moving player never causes a frame hitch.
   */
  processPending(budget = 1): Chunk[] {
    const built: Chunk[] = [];
    while (built.length < budget && this.pending.length > 0) {
      const [cx, cy] = this.pending.shift()!;
      const key = Chunk.key(cx, cy);
      if (this.chunks.has(key)) continue;
      const chunk = generateChunk(this.terrain, this.rng, cx, cy);
      this.chunks.set(key, chunk);
      built.push(chunk);
    }
    return built;
  }

  /** Generates everything queued right now. Used at spawn and in tests. */
  flushPending(): Chunk[] {
    return this.processPending(this.pending.length);
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  private inBounds(cx: number, cy: number): boolean {
    const maxChunk = Math.ceil(this.size / CHUNK_SIZE);
    return cx >= 0 && cy >= 0 && cx < maxChunk && cy < maxChunk;
  }

  chunkAt(worldX: number, worldY: number): Chunk | undefined {
    return this.chunks.get(Chunk.key(Math.floor(worldX / CHUNK_SIZE), Math.floor(worldY / CHUNK_SIZE)));
  }

  // ---------- tile queries ----------

  tileAt(x: number, y: number): TileId {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const override = this.delta.tiles[`${tx},${ty}`];
    if (override !== undefined) return TILE_PALETTE[override];
    const chunk = this.chunkAt(tx, ty);
    if (chunk) {
      return chunk.tileAtLocal(tx - chunk.cx * CHUNK_SIZE, ty - chunk.cy * CHUNK_SIZE);
    }
    // Outside residency: fall back to the generator. Slower, always correct.
    return this.terrain.sample(tx, ty).tile;
  }

  biomeAt(x: number, y: number): BiomeId {
    const chunk = this.chunkAt(x, y);
    if (chunk) return chunk.biome;
    return this.terrain.sample(Math.floor(x), Math.floor(y)).biome;
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return false;
    return TILES[this.tileAt(x, y)].walkable;
  }

  speedAt(x: number, y: number): number {
    return TILES[this.tileAt(x, y)].speed;
  }

  blocksSight(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return true;
    return TILES[this.tileAt(x, y)].blocksSight;
  }

  /** Bresenham line-of-sight against the tile grid. Used by AI perception. */
  hasLineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
    let x0 = Math.floor(ax);
    let y0 = Math.floor(ay);
    const x1 = Math.floor(bx);
    const y1 = Math.floor(by);
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let guard = 0;
    while (guard++ < 512) {
      if (x0 === x1 && y0 === y1) return true;
      if (guard > 1 && this.blocksSight(x0, y0)) return false;
      const e2 = err * 2;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
    return false;
  }

  /** Nearest walkable tile centre to (x,y), searched in expanding rings. */
  findWalkableNear(x: number, y: number, maxRadius = 24): { x: number; y: number } | null {
    if (this.isWalkable(x, y)) return { x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5 };
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = Math.floor(x) + dx;
          const ny = Math.floor(y) + dy;
          if (this.isWalkable(nx, ny)) return { x: nx + 0.5, y: ny + 0.5 };
        }
      }
    }
    return null;
  }

  // ---------- deltas ----------

  isHarvested(nodeId: string, nowMs: number): boolean {
    const respawnAt = this.delta.harvested[nodeId];
    if (respawnAt === undefined) return false;
    if (nowMs >= respawnAt) {
      delete this.delta.harvested[nodeId];
      return false;
    }
    return true;
  }

  markHarvested(nodeId: string, respawnAtMs: number): void {
    this.delta.harvested[nodeId] = respawnAtMs;
  }

  isKilled(spawnId: string, nowMs: number): boolean {
    const respawnAt = this.delta.killed[spawnId];
    if (respawnAt === undefined) return false;
    if (nowMs >= respawnAt) {
      delete this.delta.killed[spawnId];
      return false;
    }
    return true;
  }

  markKilled(spawnId: string, respawnAtMs: number): void {
    this.delta.killed[spawnId] = respawnAtMs;
  }

  setTile(x: number, y: number, tile: TileId): void {
    this.delta.tiles[`${Math.floor(x)},${Math.floor(y)}`] = TILE_PALETTE.indexOf(tile);
  }

  /** A walkable spawn point near the Shard centre, for a new game. */
  findStartPosition(): { x: number; y: number } {
    const c = this.size / 2;
    const rng = this.rng.fork('start');
    for (let attempt = 0; attempt < 400; attempt++) {
      const r = (attempt / 400) * this.size * 0.3;
      const a = rng.float(0, Math.PI * 2);
      const x = Math.floor(c + Math.cos(a) * r);
      const y = Math.floor(c + Math.sin(a) * r);
      const tile = this.terrain.sample(x, y).tile;
      if (TILES[tile].walkable && tile !== 'water' && tile !== 'deep_water') {
        return { x: x + 0.5, y: y + 0.5 };
      }
    }
    return { x: c, y: c };
  }
}
