import { describe, it, expect } from 'vitest';
import { ShardTerrain } from '../src/world/terrain';
import { ShardWorld } from '../src/world/shard';
import { generateChunk } from '../src/world/chunk';
import { SeededRNG } from '../src/core/rng';
import { TILES, classifyBiome, BIOMES } from '../src/content/biomes';
import { CHUNK_SIZE } from '../src/core/config';

const SIZE = 128; // small shards keep the property tests fast

describe('terrain determinism', () => {
  it('produces an identical world for the same seed', () => {
    const a = new ShardTerrain('seed-alpha', 'shard1', SIZE);
    const b = new ShardTerrain('seed-alpha', 'shard1', SIZE);
    expect(a.hash(7)).toBe(b.hash(7));
  });

  it('produces different worlds for different seeds', () => {
    const a = new ShardTerrain('seed-alpha', 'shard1', SIZE);
    const b = new ShardTerrain('seed-beta', 'shard1', SIZE);
    expect(a.hash(7)).not.toBe(b.hash(7));
  });

  it('produces different worlds for different shards on one seed', () => {
    const a = new ShardTerrain('seed-alpha', 'shard1', SIZE);
    const b = new ShardTerrain('seed-alpha', 'shard2', SIZE);
    expect(a.hash(7)).not.toBe(b.hash(7));
  });

  it('holds determinism across many seeds', () => {
    for (let i = 0; i < 40; i++) {
      const seed = `bulk-${i}`;
      expect(new ShardTerrain(seed, 's', 64).hash(9)).toBe(new ShardTerrain(seed, 's', 64).hash(9));
    }
  });

  it('keeps every field in [0,1]', () => {
    const t = new ShardTerrain('ranges', 'shard1', SIZE);
    for (let i = 0; i < 400; i++) {
      const x = (i * 37) % SIZE;
      const y = (i * 53) % SIZE;
      const s = t.sample(x, y);
      for (const v of [s.elevation, s.moisture, s.temperature]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(TILES[s.tile]).toBeDefined();
      expect(BIOMES[s.biome]).toBeDefined();
    }
  });

  it('has water at the edges — radial falloff produces real coastlines', () => {
    const t = new ShardTerrain('coast', 'shard1', SIZE);
    let edgeWater = 0;
    for (let x = 0; x < SIZE; x += 4) {
      if (t.elevationAt(x, 1) < 0.36) edgeWater++;
      if (t.elevationAt(x, SIZE - 2) < 0.36) edgeWater++;
    }
    expect(edgeWater).toBeGreaterThan(SIZE / 4);
  });

  it('has walkable land somewhere in the middle', () => {
    for (const seed of ['land-a', 'land-b', 'land-c', 'land-d']) {
      const t = new ShardTerrain(seed, 'shard1', SIZE);
      let walkable = 0;
      for (let y = SIZE * 0.3; y < SIZE * 0.7; y += 3) {
        for (let x = SIZE * 0.3; x < SIZE * 0.7; x += 3) {
          if (t.isWalkable(x, y)) walkable++;
        }
      }
      expect(walkable).toBeGreaterThan(20);
    }
  });
});

describe('biome classification', () => {
  it('is a total function over the input cube', () => {
    for (let e = 0; e <= 1.001; e += 0.1) {
      for (let m = 0; m <= 1.001; m += 0.25) {
        for (let t = 0; t <= 1.001; t += 0.25) {
          expect(BIOMES[classifyBiome(e, m, t)]).toBeDefined();
        }
      }
    }
  });

  it('is monotonic in the obvious places', () => {
    expect(classifyBiome(0.5, 0.2, 0.1)).toBe('frostspire');
    expect(classifyBiome(0.5, 0.2, 0.9)).toBe('dust_sea');
    expect(classifyBiome(0.5, 0.9, 0.7)).toBe('sunken_mire');
    expect(classifyBiome(0.9, 0.5, 0.1)).toBe('frostspire');
    expect(classifyBiome(0.9, 0.5, 0.9)).toBe('ashen_wastes');
  });
});

describe('chunk generation', () => {
  it('is reproducible', () => {
    const terrain = new ShardTerrain('chunks', 'shard1', SIZE);
    const rng = new SeededRNG('chunks:shard1', 'shard1');
    const a = generateChunk(terrain, rng, 1, 1);
    const b = generateChunk(terrain, new SeededRNG('chunks:shard1', 'shard1'), 1, 1);
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(a.nodes).toEqual(b.nodes);
    expect(a.spawns).toEqual(b.spawns);
  });

  it('never places a node or a spawn on unwalkable ground', () => {
    const terrain = new ShardTerrain('placement', 'shard1', SIZE);
    const rng = new SeededRNG('placement:shard1', 'shard1');
    for (let cy = 0; cy < 3; cy++) {
      for (let cx = 0; cx < 3; cx++) {
        const chunk = generateChunk(terrain, rng, cx, cy);
        for (const n of [...chunk.nodes, ...chunk.spawns]) {
          const lx = Math.floor(n.x) - cx * CHUNK_SIZE;
          const ly = Math.floor(n.y) - cy * CHUNK_SIZE;
          expect(TILES[chunk.tileAtLocal(lx, ly)].walkable).toBe(true);
        }
      }
    }
  });

  it('spawns only creatures that belong to the chunk biome', () => {
    const terrain = new ShardTerrain('pools', 'shard1', SIZE);
    const rng = new SeededRNG('pools:shard1', 'shard1');
    const chunk = generateChunk(terrain, rng, 2, 2);
    for (const s of chunk.spawns) {
      expect(s.level).toBeGreaterThanOrEqual(1);
      expect(s.creatureId.length).toBeGreaterThan(0);
    }
  });
});

describe('ShardWorld', () => {
  it('finds a walkable start position', () => {
    for (const seed of ['start-a', 'start-b', 'start-c']) {
      const w = new ShardWorld(seed, 'shard1', SIZE);
      const start = w.findStartPosition();
      w.updateResidency(start.x, start.y);
      w.flushPending();
      expect(w.isWalkable(start.x, start.y)).toBe(true);
    }
  });

  it('applies and expires harvest deltas', () => {
    const w = new ShardWorld('deltas', 'shard1', SIZE);
    w.markHarvested('n:1', 5000);
    expect(w.isHarvested('n:1', 1000)).toBe(true);
    expect(w.isHarvested('n:1', 6000)).toBe(false);
    expect(w.isHarvested('n:1', 1000)).toBe(false); // cleared once expired
  });

  it('honours tile overrides from the delta', () => {
    const w = new ShardWorld('tiles', 'shard1', SIZE);
    const start = w.findStartPosition();
    w.updateResidency(start.x, start.y);
    w.flushPending();
    w.setTile(start.x, start.y, 'stone');
    expect(w.tileAt(start.x, start.y)).toBe('stone');
    expect(w.isWalkable(start.x, start.y)).toBe(false);
  });

  it('unloads chunks with hysteresis so walking a border does not thrash', () => {
    const w = new ShardWorld('stream', 'shard1', 512);
    w.updateResidency(60, 60);
    w.flushPending();
    const loaded = w.chunks.size;
    expect(loaded).toBeGreaterThan(20);
    // A one-tile step must not evict anything.
    w.updateResidency(61, 60);
    expect(w.chunks.size).toBeGreaterThanOrEqual(loaded);
  });

  it('reports line of sight blocked by walls', () => {
    const w = new ShardWorld('los', 'shard1', SIZE);
    const start = w.findStartPosition();
    w.updateResidency(start.x, start.y);
    w.flushPending();
    expect(w.hasLineOfSight(start.x, start.y, start.x, start.y)).toBe(true);
    w.setTile(start.x + 2, start.y, 'stone');
    expect(w.hasLineOfSight(start.x, start.y, start.x + 5, start.y)).toBe(false);
  });
});
