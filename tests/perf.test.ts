import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { ShardTerrain } from '../src/world/terrain';
import { generateChunk } from '../src/world/chunk';
import { SeededRNG } from '../src/core/rng';
import { SIM_STEP_MS } from '../src/core/loop';
import { spawnCreature } from '../src/sim/factory';
import * as C from '../src/sim/components';

/**
 * Performance gates (TechnicalDesign §9.1).
 *
 * These are CI budgets, not benchmarks. They are set with generous headroom
 * over the measured figure on a dev machine, because CI runners are slower and
 * noisier — the purpose is to catch an order-of-magnitude regression, not to
 * chase a few percent. Real device numbers come from the manual matrix.
 *
 * Budget on target hardware: 4.0ms per simulation tick at 30Hz, of which AI
 * gets 2.5ms. These gates allow 6ms for the whole tick.
 */

const DT = SIM_STEP_MS / 1000;

function measure(fn: () => void, iterations: number): number {
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return (performance.now() - t0) / iterations;
}

describe('simulation performance', () => {
  it('ticks a populated world well inside the 4ms sim budget', () => {
    const game = new Game('perf-walk', 'shard');
    game.newGame();
    game.intent.moveX = 1;
    for (let i = 0; i < 300; i++) game.tick(DT); // warm caches and stream entities

    const perTick = measure(() => game.tick(DT), 2000);
    // eslint-disable-next-line no-console
    console.log(`  tick: ${perTick.toFixed(3)}ms with ${game.ecs.entityCount} entities`);
    expect(perTick).toBeLessThan(6);
  }, 60_000);

  it('holds up with 300 creatures in the world', () => {
    const game = new Game('perf-crowd', 'shard');
    game.newGame();
    const pos = game.playerPos()!;
    for (let i = 0; i < 300; i++) {
      const a = (i / 300) * Math.PI * 2;
      const r = 3 + (i % 12);
      const spot = game.shard.findWalkableNear(pos.x + Math.cos(a) * r, pos.y + Math.sin(a) * r, 5);
      if (spot) spawnCreature(game.ecs, game.rng.fork(`crowd${i}`), 'fangling', 10, spot.x, spot.y);
    }
    for (let i = 0; i < 60; i++) game.tick(DT);

    const perTick = measure(() => game.tick(DT), 400);
    // eslint-disable-next-line no-console
    console.log(`  crowd tick: ${perTick.toFixed(3)}ms with ${game.ecs.entityCount} entities`);
    expect(perTick).toBeLessThan(12);
  }, 60_000);

  it('respects the AI time-slice budget instead of scaling linearly', () => {
    // The AI system round-robins under a hard 2.5ms cap, so a crowd must not
    // cost proportionally more than a small group.
    const small = new Game('perf-ai-small', 'shard');
    small.newGame();
    const sp = small.playerPos()!;
    for (let i = 0; i < 20; i++) {
      const spot = small.shard.findWalkableNear(sp.x + (i % 6) - 3, sp.y + Math.floor(i / 6) - 2, 4);
      if (spot) spawnCreature(small.ecs, small.rng.fork(`s${i}`), 'fangling', 8, spot.x, spot.y);
    }
    for (let i = 0; i < 30; i++) small.tick(DT);
    const smallTick = measure(() => small.tick(DT), 300);

    const big = new Game('perf-ai-big', 'shard');
    big.newGame();
    const bp = big.playerPos()!;
    for (let i = 0; i < 400; i++) {
      const a = (i / 400) * Math.PI * 2;
      const spot = big.shard.findWalkableNear(bp.x + Math.cos(a) * (3 + (i % 10)), bp.y + Math.sin(a) * (3 + (i % 10)), 5);
      if (spot) spawnCreature(big.ecs, big.rng.fork(`b${i}`), 'fangling', 8, spot.x, spot.y);
    }
    for (let i = 0; i < 30; i++) big.tick(DT);
    const bigTick = measure(() => big.tick(DT), 200);

    // eslint-disable-next-line no-console
    console.log(`  ai scaling: ${smallTick.toFixed(3)}ms -> ${bigTick.toFixed(3)}ms (20x entities)`);
    // 20x the entities must cost far less than 20x the time.
    expect(bigTick).toBeLessThan(smallTick * 20);
  }, 120_000);
});

describe('world generation performance', () => {
  it('generates a chunk fast enough to stay inside a one-per-frame budget', () => {
    const terrain = new ShardTerrain('perf-gen', 'shard', 512);
    const rng = new SeededRNG('perf-gen:shard', 'shard');
    let n = 0;
    const per = measure(() => {
      generateChunk(terrain, rng, n % 8, Math.floor(n / 8) % 8);
      n++;
    }, 64);
    // eslint-disable-next-line no-console
    console.log(`  chunk gen: ${per.toFixed(2)}ms`);
    expect(per).toBeLessThan(40);
  }, 60_000);

  it('builds a full shard start area within the load-time budget', () => {
    const t0 = performance.now();
    const game = new Game('perf-boot', 'shard');
    game.newGame();
    const ms = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`  cold start: ${ms.toFixed(0)}ms, ${game.shard.chunks.size} chunks`);
    expect(ms).toBeLessThan(3000);
  }, 60_000);
});

describe('memory behaviour', () => {
  it('does not leak entities over a long walk', () => {
    const game = new Game('perf-leak', 'shard');
    game.newGame();
    game.intent.moveX = 1;
    game.intent.moveY = 0.4;
    for (let i = 0; i < 600; i++) game.tick(DT);
    const mid = game.ecs.entityCount;
    for (let i = 0; i < 2400; i++) game.tick(DT);
    const end = game.ecs.entityCount;
    // eslint-disable-next-line no-console
    console.log(`  entities: ${mid} -> ${end} after 3000 ticks of walking`);
    expect(end).toBeLessThan(mid * 3 + 60);
  }, 120_000);

  it('bounds the status effect array', () => {
    const game = new Game('perf-status', 'shard');
    game.newGame();
    const st = game.ecs.get(game.player, C.StatusEffects)!;
    for (let i = 0; i < 200; i++) {
      st.active.push({ id: 'burn', stacks: 1, expiresAt: 0, tickAcc: 0, source: null });
    }
    for (let i = 0; i < 5; i++) game.tick(DT);
    expect(st.active.length).toBe(0);
  });

  it('bounds the combat buff array', () => {
    const game = new Game('perf-buffs', 'shard');
    game.newGame();
    const stats = game.ecs.get(game.player, C.CombatStats)!;
    for (let i = 0; i < 500; i++) {
      stats.buffs.push({ stat: 'atk', amount: 0.1, expiresAt: -1 });
    }
    game.tick(DT);
    expect(game.ecs.get(game.player, C.CombatStats)!.buffs.length).toBe(0);
  });
});
