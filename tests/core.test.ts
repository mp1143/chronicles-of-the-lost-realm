import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../src/core/rng';
import { World, defineComponent } from '../src/core/ecs';
import { EventBus } from '../src/core/events';

describe('SeededRNG', () => {
  it('is deterministic for a given seed', () => {
    const a = new SeededRNG('hello');
    const b = new SeededRNG('hello');
    const seqA = Array.from({ length: 200 }, () => a.next());
    const seqB = Array.from({ length: 200 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('differs across seeds', () => {
    const a = new SeededRNG('hello');
    const b = new SeededRNG('hello2');
    expect(a.next()).not.toBe(b.next());
  });

  it('stays inside [0,1) over a long run', () => {
    const rng = new SeededRNG(42);
    for (let i = 0; i < 100_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('distributes roughly uniformly across 10 buckets', () => {
    const rng = new SeededRNG('uniform');
    const buckets = new Array(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) buckets[Math.floor(rng.next() * 10)]++;
    for (const b of buckets) expect(Math.abs(b - n / 10) / (n / 10)).toBeLessThan(0.05);
  });

  it('forks independently of draw order — the load-bearing property', () => {
    // If forks depended on live state, adding a resource type in a patch would
    // shift the terrain of every existing save.
    const a = new SeededRNG('world');
    const forkA = a.fork('terrain').next();

    const b = new SeededRNG('world');
    for (let i = 0; i < 50; i++) b.next(); // simulate an unrelated subsystem drawing first
    const forkB = b.fork('terrain').next();

    expect(forkA).toBe(forkB);
  });

  it('gives different streams different sequences', () => {
    const root = new SeededRNG('world');
    expect(root.fork('terrain').next()).not.toBe(root.fork('loot').next());
  });

  it('int() covers the full inclusive range', () => {
    const rng = new SeededRNG('ints');
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) seen.add(rng.int(3, 7));
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
  });

  it('weighted() respects weights', () => {
    const rng = new SeededRNG('weights');
    let a = 0;
    for (let i = 0; i < 10_000; i++) if (rng.weighted([['a', 9], ['b', 1]] as const) === 'a') a++;
    expect(a / 10_000).toBeGreaterThan(0.85);
    expect(a / 10_000).toBeLessThan(0.95);
  });
});

describe('ECS', () => {
  const Pos = defineComponent<{ x: number }>('TestPos');
  const Vel = defineComponent<{ x: number }>('TestVel');

  it('adds, gets and removes components', () => {
    const w = new World();
    const e = w.create();
    w.add(e, Pos, { x: 1 });
    expect(w.get(e, Pos)).toEqual({ x: 1 });
    expect(w.has(e, Vel)).toBe(false);
    w.remove(e, Pos);
    expect(w.get(e, Pos)).toBeUndefined();
  });

  it('queries the intersection of components', () => {
    const w = new World();
    const both = w.create();
    w.add(both, Pos, { x: 0 });
    w.add(both, Vel, { x: 0 });
    const posOnly = w.create();
    w.add(posOnly, Pos, { x: 0 });

    expect([...w.query(Pos)].sort()).toEqual([both, posOnly].sort());
    expect([...w.query(Pos, Vel)]).toEqual([both]);
  });

  it('defers destruction until flush', () => {
    const w = new World();
    const e = w.create();
    w.add(e, Pos, { x: 1 });
    w.destroy(e);
    expect(w.isAlive(e)).toBe(true); // still valid inside the tick
    w.flush();
    expect(w.isAlive(e)).toBe(false);
  });

  it('invalidates stale handles after recycling — the use-after-destroy guard', () => {
    const w = new World();
    const first = w.create();
    w.destroy(first);
    w.flush();
    const second = w.create(); // reuses the index with a bumped generation
    expect(w.isAlive(first)).toBe(false);
    expect(w.isAlive(second)).toBe(true);
    expect(w.get(first, Pos)).toBeUndefined();
  });

  it('refreshes cached queries after a structural change', () => {
    const w = new World();
    const e = w.create();
    w.add(e, Pos, { x: 0 });
    expect(w.query(Pos).length).toBe(1);
    const e2 = w.create();
    w.add(e2, Pos, { x: 0 });
    expect(w.query(Pos).length).toBe(2);
    w.destroy(e2);
    w.flush();
    expect(w.query(Pos).length).toBe(1);
  });
});

describe('EventBus', () => {
  it('delivers to subscribers and honours unsubscribe', () => {
    const bus = new EventBus();
    const seen: number[] = [];
    const off = bus.on('DamageDealt', (p) => seen.push(p.amount));
    bus.emit('DamageDealt', { source: 1, target: 2, amount: 5, crit: false, threadMult: 1 });
    off();
    bus.emit('DamageDealt', { source: 1, target: 2, amount: 9, crit: false, threadMult: 1 });
    expect(seen).toEqual([5]);
  });

  it('survives a throwing subscriber', () => {
    const bus = new EventBus();
    const seen: number[] = [];
    bus.on('DamageDealt', () => {
      throw new Error('bad subscriber');
    });
    bus.on('DamageDealt', (p) => seen.push(p.amount));
    expect(() =>
      bus.emit('DamageDealt', { source: 1, target: 2, amount: 3, crit: false, threadMult: 1 }),
    ).not.toThrow();
    expect(seen).toEqual([3]);
  });
});
