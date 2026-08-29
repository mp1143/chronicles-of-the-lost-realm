import { Noise2D } from '../core/noise';
import { SeededRNG } from '../core/rng';
import { clamp } from '../core/math';
import { SEA_LEVEL, SHORE_LEVEL, MID_LEVEL, HIGH_LEVEL, SHARD_SIZE } from '../core/config';
import { BIOMES, classifyBiome, TILES, type TileId } from '../content/biomes';
import type { BiomeId } from '../content/creatures';

/**
 * Deterministic terrain field generator for one Shard.
 *
 * Everything here is a pure function of (worldSeed, shardId, x, y). Nothing is
 * stored: the save file holds the seed and a delta list, never tile data
 * (TechnicalDesign §3.2). Each field draws from its own forked RNG stream, so
 * adding a field in a later patch cannot shift an existing save's terrain.
 */

export interface TerrainSample {
  elevation: number;
  moisture: number;
  temperature: number;
  biome: BiomeId;
  tile: TileId;
}

export class ShardTerrain {
  readonly size: number;
  private elevationNoise: Noise2D;
  private moistureNoise: Noise2D;
  private temperatureNoise: Noise2D;
  private detailNoise: Noise2D;
  private riverMask: Float32Array;
  readonly rng: SeededRNG;

  constructor(worldSeed: string, readonly shardId: string, size = SHARD_SIZE) {
    this.size = size;
    this.rng = new SeededRNG(`${worldSeed}:${shardId}`, shardId);
    this.elevationNoise = new Noise2D(this.rng.fork('terrain/elevation'));
    this.moistureNoise = new Noise2D(this.rng.fork('terrain/moisture'));
    this.temperatureNoise = new Noise2D(this.rng.fork('terrain/temperature'));
    this.detailNoise = new Noise2D(this.rng.fork('terrain/detail'));
    this.riverMask = this.carveRivers();
  }

  /** Raw elevation in [0,1], continent-shaped so the Shard has real coastlines. */
  elevationAt(x: number, y: number): number {
    let e = this.elevationNoise.fbm(x, y, 5, 1 / 190, 0.52);
    // Ridged component gives mountain spines rather than smooth domes.
    e = e * 0.78 + this.elevationNoise.ridged(x + 1000, y + 1000, 3, 1 / 130) * 0.22;

    // Radial falloff: islands with coastlines, not noise mush.
    const cx = this.size / 2;
    const cy = this.size / 2;
    const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / (this.size * 0.52);
    e *= 1 - clamp(Math.pow(d, 2.2), 0, 1);

    // Rivers cut down through whatever is above them.
    const river = this.riverMask[this.idx(x, y)] ?? 0;
    if (river > 0) e = Math.min(e, SEA_LEVEL + 0.02) * (1 - river * 0.35);

    return clamp(e, 0, 1);
  }

  moistureAt(x: number, y: number): number {
    const base = this.moistureNoise.fbm(x, y, 3, 1 / 240, 0.5);
    // Low ground holds water; ridges shed it.
    const elev = this.elevationNoise.fbm(x, y, 5, 1 / 190, 0.52);
    return clamp(base * 0.75 + (1 - elev) * 0.25, 0, 1);
  }

  temperatureAt(x: number, y: number): number {
    const base = this.temperatureNoise.fbm(x, y, 2, 1 / 320, 0.5);
    // Latitude band plus altitude cooling — the two things players intuit.
    const latitude = 1 - Math.abs(y / this.size - 0.5) * 1.6;
    const elev = this.elevationNoise.fbm(x, y, 5, 1 / 190, 0.52);
    return clamp(base * 0.45 + latitude * 0.45 - elev * 0.28 + 0.16, 0, 1);
  }

  sample(x: number, y: number): TerrainSample {
    const elevation = this.elevationAt(x, y);
    const moisture = this.moistureAt(x, y);
    const temperature = this.temperatureAt(x, y);
    const biome = classifyBiome(elevation, moisture, temperature);
    return { elevation, moisture, temperature, biome, tile: this.tileFor(biome, elevation, x, y) };
  }

  /** Tile lookup with a dithered biome edge, so borders interlock instead of forming a hard line. */
  private tileFor(biome: BiomeId, elevation: number, x: number, y: number): TileId {
    const t = BIOMES[biome].tiles;
    // Blue-noise-ish jitter across a ~4 tile band.
    const jitter = (this.detailNoise.sample(x * 0.7, y * 0.7) + 1) * 0.5 * 0.03 - 0.015;
    const e = elevation + jitter;
    if (e < SEA_LEVEL - 0.08) return t[0];
    if (e < SEA_LEVEL) return t[1];
    if (e < SHORE_LEVEL) return t[2];
    if (e < MID_LEVEL) return t[3];
    if (e < HIGH_LEVEL) return t[4];
    return t[5];
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return false;
    return TILES[this.sample(x, y).tile].walkable;
  }

  /**
   * Rivers: pick sources on high ground and walk steepest-descent to the sea,
   * widening downstream. The highest value-per-line-of-code feature in terrain
   * generation — it is what makes a generated map read as a place.
   */
  private carveRivers(): Float32Array {
    const mask = new Float32Array(this.size * this.size);
    const rng = this.rng.fork('terrain/rivers');
    const sourceCount = 5 + rng.int(0, 4);

    const rawElev = (x: number, y: number): number => {
      let e = this.elevationNoise.fbm(x, y, 5, 1 / 190, 0.52);
      e = e * 0.78 + this.elevationNoise.ridged(x + 1000, y + 1000, 3, 1 / 130) * 0.22;
      const cx = this.size / 2;
      const cy = this.size / 2;
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / (this.size * 0.52);
      return e * (1 - clamp(Math.pow(d, 2.2), 0, 1));
    };

    for (let s = 0; s < sourceCount; s++) {
      // Find a high starting point; give up after a bounded search rather than looping.
      let sx = 0;
      let sy = 0;
      let best = -1;
      for (let attempt = 0; attempt < 40; attempt++) {
        const x = rng.int(this.size * 0.2, this.size * 0.8);
        const y = rng.int(this.size * 0.2, this.size * 0.8);
        const e = rawElev(x, y);
        if (e > best) {
          best = e;
          sx = x;
          sy = y;
        }
      }
      if (best < MID_LEVEL) continue;

      let x = sx;
      let y = sy;
      const maxSteps = this.size * 2;
      for (let step = 0; step < maxSteps; step++) {
        const width = 0.6 + (step / maxSteps) * 2.4;
        this.stamp(mask, x, y, width);

        // Steepest descent among the 8 neighbours.
        let bx = x;
        let by = y;
        let bestE = rawElev(x, y);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= this.size || ny >= this.size) continue;
            const e = rawElev(nx, ny);
            if (e < bestE) {
              bestE = e;
              bx = nx;
              by = ny;
            }
          }
        }
        // Local minimum or reached the sea: stop. A lake is a fine outcome.
        if ((bx === x && by === y) || bestE < SEA_LEVEL) break;
        x = bx;
        y = by;
      }
    }
    return mask;
  }

  private stamp(mask: Float32Array, cx: number, cy: number, radius: number): void {
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= this.size || y >= this.size) continue;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > radius) continue;
        const v = 1 - d / radius;
        const i = this.idx(x, y);
        if (v > mask[i]) mask[i] = v;
      }
    }
  }

  private idx(x: number, y: number): number {
    return (y | 0) * this.size + (x | 0);
  }

  /** Cheap stable fingerprint of the whole Shard — used by the determinism test. */
  hash(step = 17): number {
    let h = 0x811c9dc5;
    for (let y = 0; y < this.size; y += step) {
      for (let x = 0; x < this.size; x += step) {
        const s = this.sample(x, y);
        h ^= Math.floor(s.elevation * 10000) ^ (s.tile.length << 8) ^ s.biome.charCodeAt(0);
        h = Math.imul(h, 0x01000193);
      }
    }
    return h >>> 0;
  }
}
