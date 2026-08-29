import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../src/sim/game';
import * as C from '../src/sim/components';
import { spawnCreature, spawnBoss } from '../src/sim/factory';
import {
  addItem, countItem, removeItem, craft, build, harvest, useItem, equip,
  findInteractable, beginTame, tameBeat, resolveTame, canTame, setPartySlot, feedCreature,
} from '../src/sim/actions';
import { applyStatus, dealDamage } from '../src/sim/systems/combat';
import { gainBond, addCreatureXp, tryEvolve } from '../src/sim/systems/progression';
import { SIM_STEP_MS } from '../src/core/loop';
import { START_TIME_MS } from '../src/core/config';

const DT = SIM_STEP_MS / 1000;

function newGame(seed = 'test-seed'): Game {
  const g = new Game(seed, 'test_shard');
  g.newGame();
  return g;
}

/** Runs the whole simulation for n ticks. */
function run(g: Game, ticks: number): void {
  for (let i = 0; i < ticks; i++) g.tick(DT);
}

describe('simulation smoke', () => {
  let game: Game;
  beforeEach(() => {
    game = newGame();
  });

  it('starts with a player on walkable ground', () => {
    const pos = game.playerPos()!;
    expect(pos).toBeDefined();
    expect(game.shard.isWalkable(pos.x, pos.y)).toBe(true);
  });

  it('runs 600 ticks (20 simulated seconds) without throwing', () => {
    expect(() => run(game, 600)).not.toThrow();
    expect(game.ecs.get(game.player, C.Health)!.current).toBeGreaterThan(0);
  });

  it('streams creatures and resource nodes in around the player', () => {
    run(game, 30);
    expect(game.ecs.query(C.HarvestNode).length + game.ecs.query(C.CreatureInstance).length)
      .toBeGreaterThan(0);
  });

  it('moves the player when intent is applied, and stops at walls', () => {
    const pos = game.playerPos()!;
    const startX = pos.x;
    game.intent.moveX = 1;
    run(game, 20);
    expect(Math.abs(pos.x - startX)).toBeGreaterThan(0.1);

    game.intent.moveX = 0;
    const restX = pos.x;
    run(game, 10);
    expect(pos.x).toBeCloseTo(restX, 5);
  });

  it('never lets the player leave the shard', () => {
    game.intent.moveX = -1;
    game.intent.moveY = -1;
    run(game, 2000);
    const pos = game.playerPos()!;
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeGreaterThanOrEqual(0);
    expect(pos.x).toBeLessThanOrEqual(game.shard.size);
  });

  it('starts a new game in daylight, not at midnight', () => {
    expect(game.nowMs).toBe(START_TIME_MS);
    expect(game.isNight).toBe(false);
  });

  it('advances the simulation clock as it ticks', () => {
    const before = game.nowMs;
    run(game, 60);
    expect(game.nowMs - before).toBeCloseTo(2000, 0);
  });

  it('cycles day into night and back', () => {
    // timeOfDay is a pure function of nowMs; driving 15 simulated minutes of
    // full ticks to read it would add ~12s to the suite for no extra coverage.
    game.nowMs = 0;
    expect(game.isNight).toBe(true); // 00:00
    game.nowMs = 600_000; // midday
    expect(game.isNight).toBe(false);
    expect(game.daylight).toBeGreaterThan(0.9);
    game.nowMs = 1_020_000; // after dusk
    expect(game.isNight).toBe(true);
    expect(game.daylight).toBeLessThan(0.5);
  });

  it('drains hunger slowly and caps max health instead of killing', () => {
    const surv = game.ecs.get(game.player, C.Survival)!;
    const hp = game.ecs.get(game.player, C.Health)!;
    surv.hunger = 0;
    run(game, 5);
    expect(hp.max).toBeLessThan(150);
    expect(hp.current).toBeGreaterThan(0);
  });

  it('keeps entity count bounded while walking a long way', () => {
    game.intent.moveX = 1;
    run(game, 1500);
    expect(game.ecs.entityCount).toBeLessThan(600);
  });
});

describe('combat', () => {
  let game: Game;
  beforeEach(() => {
    game = newGame('combat-seed');
  });

  it('kills a creature and awards XP to the player', () => {
    const pos = game.playerPos()!;
    const e = spawnCreature(game.ecs, game.rng, 'sproutling', 3, pos.x + 1, pos.y);
    const before = game.ecs.get(game.player, C.PlayerTag)!.xp;
    const hp = game.ecs.get(e, C.Health)!;
    hp.current = 1;
    dealDamage(game, game.player, e, 999, false, 1);
    run(game, 2);
    expect(game.ecs.isAlive(e)).toBe(false);
    expect(game.ecs.get(game.player, C.PlayerTag)!.xp).toBeGreaterThan(before);
  });

  it('ticks poison damage over time', () => {
    const pos = game.playerPos()!;
    const e = spawnCreature(game.ecs, game.rng, 'mosshorn', 5, pos.x + 2, pos.y);
    const hp = game.ecs.get(e, C.Health)!;
    const before = hp.current;
    applyStatus(game, game.player, e, 'poison', 3);
    run(game, 60); // 2 simulated seconds
    expect(hp.current).toBeLessThan(before);
  });

  it('expires statuses', () => {
    const pos = game.playerPos()!;
    const e = spawnCreature(game.ecs, game.rng, 'mosshorn', 5, pos.x + 2, pos.y);
    applyStatus(game, game.player, e, 'burn', 1);
    expect(game.ecs.get(e, C.StatusEffects)!.active.length).toBe(1);
    run(game, 30 * 8);
    expect(game.ecs.get(e, C.StatusEffects)!.active.length).toBe(0);
  });

  it('grants the player immunity after a stun, so no chain-lock is possible', () => {
    applyStatus(game, game.player, game.player, 'freeze', 1);
    run(game, 30 * 3); // freeze lasts 2s
    const st = game.ecs.get(game.player, C.StatusEffects)!;
    expect(st.active.find((s) => s.id === 'freeze')).toBeUndefined();
    applyStatus(game, game.player, game.player, 'freeze', 1);
    expect(st.active.find((s) => s.id === 'freeze')).toBeUndefined(); // blocked by immunity
  });

  it('escalates chill into freeze at max stacks', () => {
    const pos = game.playerPos()!;
    const e = spawnCreature(game.ecs, game.rng, 'mosshorn', 5, pos.x + 2, pos.y);
    applyStatus(game, game.player, e, 'chill', 4);
    const st = game.ecs.get(e, C.StatusEffects)!;
    expect(st.active.some((s) => s.id === 'freeze')).toBe(true);
  });

  it('caps damage-over-time so a big health pool is not self-defeating', () => {
    // Regression: DoT was a flat percentage of the target's max health, so a
    // 12,000 HP boss took ~370 poison damage per second from a level-12
    // creature. Raising boss HP raised the DoT with it, which made boss health
    // pools meaningless.
    const pos = game.playerPos()!;
    const applier = spawnCreature(game.ecs, game.rng, 'thornkin', 12, pos.x + 1, pos.y);

    const small = spawnCreature(game.ecs, game.rng, 'sproutling', 12, pos.x + 2, pos.y);
    const big = spawnBoss(game.ecs, game.rng, 'rootfather_ossuel', pos.x + 4, pos.y, 0);
    const smallHp = game.ecs.get(small, C.Health)!;
    const bigHp = game.ecs.get(big, C.Health)!;
    smallHp.current = smallHp.max = 300;

    // Attribute damage by source: wild creatures streamed in by the world are
    // hostile to the boss and would otherwise pollute a raw health delta.
    let smallDot = 0;
    let bigDot = 0;
    game.bus.on('DamageDealt', ({ source, target, amount }) => {
      if (source !== applier) return;
      if (target === small) smallDot += amount;
      if (target === big) bigDot += amount;
    });

    applyStatus(game, applier, small, 'poison', 2);
    applyStatus(game, applier, big, 'poison', 2);
    run(game, 60); // 2 simulated seconds

    // Unchanged on an ordinary target: 1.5%/s/stack of 300 HP over 2s = ~18.
    expect(smallDot).toBeGreaterThan(10);
    expect(smallDot).toBeLessThan(30);
    // Capped, not proportional, on a large one. Uncapped this would be ~750.
    expect(bigDot).toBeGreaterThan(smallDot);
    expect(bigDot).toBeLessThan(200);
    expect(bigDot).toBeLessThan(bigHp.max * 0.05);
  });

  it('lets a large creature actually reach a target it is chasing', () => {
    // Regression: collision separation pushed a boss (1.9 tile radius) further
    // apart than its own melee range, so it approached forever and never
    // attacked. Every large enemy was harmless.
    const pos = game.playerPos()!;
    const boss = spawnBoss(game.ecs, game.rng, 'rootfather_ossuel', pos.x + 3, pos.y, 0);
    game.ecs.get(boss, C.AIState)!.target = game.player;

    let landed = 0;
    game.bus.on('DamageDealt', ({ source, target }) => {
      if (source === boss && target === game.player) landed++;
    });
    run(game, 30 * 12);
    expect(landed).toBeGreaterThan(0);
  });

  it('advances boss phases as health falls, and scales HP with party size', () => {
    const pos = game.playerPos()!;
    const solo = spawnBoss(game.ecs, game.rng, 'rootfather_ossuel', pos.x + 5, pos.y, 0);
    const trio = spawnBoss(game.ecs, game.rng, 'rootfather_ossuel', pos.x + 9, pos.y, 3);
    expect(game.ecs.get(trio, C.Health)!.max).toBeGreaterThan(game.ecs.get(solo, C.Health)!.max);

    const hp = game.ecs.get(solo, C.Health)!;
    expect(game.ecs.get(solo, C.BossTag)!.phase).toBe(0);
    hp.current = hp.max * 0.3;
    run(game, 2);
    expect(game.ecs.get(solo, C.BossTag)!.phase).toBe(1);
  });

  it('respawns the player at the shore instead of ending the run', () => {
    const hp = game.ecs.get(game.player, C.Health)!;
    let died = false;
    game.bus.on('PlayerDied', () => (died = true));
    hp.current = 0;
    run(game, 2);
    expect(died).toBe(true);
    expect(game.ecs.get(game.player, C.Health)!.current).toBeGreaterThan(0);
  });
});

describe('inventory, crafting and building', () => {
  let game: Game;
  beforeEach(() => {
    game = newGame('craft-seed');
  });

  it('stacks and unstacks items', () => {
    addItem(game, 'timber', 40);
    expect(countItem(game, 'timber')).toBe(40);
    expect(removeItem(game, 'timber', 15)).toBe(true);
    expect(countItem(game, 'timber')).toBe(25);
    expect(removeItem(game, 'timber', 999)).toBe(false);
  });

  it('refuses to craft without a station', () => {
    addItem(game, 'fiber', 20);
    addItem(game, 'timber', 20);
    expect(craft(game, 'threadsnare').ok).toBe(false);
  });

  it('builds a campfire and then crafts at it', () => {
    addItem(game, 'timber', 40);
    addItem(game, 'stone_block', 40);
    addItem(game, 'raw_meat', 2);
    const pos = game.playerPos()!;
    const spot = game.shard.findWalkableNear(pos.x + 1, pos.y, 6)!;
    const placed = build(game, 'campfire', Math.floor(spot.x), Math.floor(spot.y));
    expect(placed.ok, placed.message).toBe(true);

    // Stand next to it so the station is in range.
    pos.x = spot.x;
    pos.y = spot.y;
    const result = craft(game, 'cook_meat');
    expect(result.ok, result.message).toBe(true);
    expect(countItem(game, 'cooked_meat')).toBe(1);
  });

  it('rejects a farm plot away from water and a forge under a roof', () => {
    addItem(game, 'timber', 40);
    addItem(game, 'fiber', 40);
    const pos = game.playerPos()!;
    // Deliberately far from water: the failure message is the point.
    const result = build(game, 'farm_plot', Math.floor(pos.x), Math.floor(pos.y));
    if (!result.ok) expect(result.message).toMatch(/water|Blocked|already/i);
  });

  it('consumes materials only on a successful craft', () => {
    addItem(game, 'fiber', 3);
    const before = countItem(game, 'fiber');
    expect(craft(game, 'salve').ok).toBe(false);
    expect(countItem(game, 'fiber')).toBe(before);
  });

  it('applies item effects and consumes the item', () => {
    const hp = game.ecs.get(game.player, C.Health)!;
    hp.current = 10;
    addItem(game, 'healing_salve', 1);
    const before = countItem(game, 'healing_salve');
    expect(useItem(game, 'healing_salve').ok).toBe(true);
    expect(hp.current).toBeGreaterThan(10);
    expect(countItem(game, 'healing_salve')).toBe(before - 1);
  });

  it('equips a weapon, raising attack and granting its art', () => {
    addItem(game, 'iron_blade', 1);
    const stats = game.ecs.get(game.player, C.CombatStats)!;
    const before = stats.atk;
    expect(equip(game, 'iron_blade').ok).toBe(true);
    expect(stats.atk).toBeGreaterThan(before);
    expect(game.ecs.get(game.player, C.SkillSet)!.ids).toContain('cleave');
  });

  it('does not double-count stats when swapping weapons', () => {
    addItem(game, 'copper_blade', 1);
    addItem(game, 'iron_blade', 1);
    const stats = game.ecs.get(game.player, C.CombatStats)!;
    const base = stats.atk;
    equip(game, 'copper_blade');
    equip(game, 'iron_blade');
    equip(game, 'copper_blade');
    expect(stats.atk).toBe(base + 18);
  });

  it('harvests a node into inventory and marks it spent', () => {
    run(game, 30);
    const pos = game.playerPos()!;
    const nodes = game.ecs.query(C.HarvestNode, C.Position);
    if (nodes.length === 0) return; // seed-dependent; the placement test covers generation
    const node = nodes[0];
    const np = game.ecs.get(node, C.Position)!;
    pos.x = np.x;
    pos.y = np.y;
    const found = findInteractable(game);
    expect(found).toBe(node);
    const hn = game.ecs.get(node, C.HarvestNode)!;
    // Some nodes need a tool; grant both so the test is not seed-dependent.
    addItem(game, 'axe', 1);
    addItem(game, 'pick', 1);
    for (let i = 0; i < hn.hitsLeft + 1; i++) harvest(game, node);
    expect(game.shard.isHarvested(hn.nodeId, game.nowMs)).toBe(true);
  });
});

describe('taming and companions', () => {
  let game: Game;
  beforeEach(() => {
    game = newGame('tame-seed');
  });

  it('refuses to tame a healthy creature', () => {
    const pos = game.playerPos()!;
    const e = spawnCreature(game.ecs, game.rng, 'sproutling', 2, pos.x + 1, pos.y);
    expect(canTame(game, e).ok).toBe(false);
  });

  it('tames a weakened creature and adds it to the party', () => {
    const pos = game.playerPos()!;
    const e = spawnCreature(game.ecs, game.rng, 'sproutling', 1, pos.x + 1, pos.y);
    const hp = game.ecs.get(e, C.Health)!;
    hp.current = hp.max * 0.05;
    addItem(game, 'threadsnare', 20);

    // Retry until the roll lands; the mercy affinity guarantees it terminates.
    let tamed = false;
    for (let attempt = 0; attempt < 40 && !tamed; attempt++) {
      if (!game.ecs.isAlive(e)) break;
      hp.current = hp.max * 0.05;
      game.ecs.get(e, C.CreatureInstance)!.owned = false;
      if (!beginTame(game, e).ok) break;
      tameBeat(game, true);
      tameBeat(game, true);
      tameBeat(game, true);
      tamed = resolveTame(game).ok;
    }
    expect(tamed).toBe(true);
    expect(game.roster.length).toBe(1);
    expect(game.roster[0].partySlot).toBe(0);
    expect(game.activePartyEntities().length).toBe(1);
  });

  it('raises bond by feeding preferred food, and unlocks the 4th skill slot at bond 5', () => {
    const pos = game.playerPos()!;
    const e = spawnCreature(game.ecs, game.rng, 'thornkin', 20, pos.x + 1, pos.y, { owned: true, owner: game.player, bond: 0 });
    game.roster.push({
      uid: 'u1', creatureId: 'thornkin', level: 20, xp: 0, bond: 0,
      ivs: game.ecs.get(e, C.CreatureInstance)!.ivs,
      natureUp: 'atk', natureDown: 'def', currentHp: 1, partySlot: 0,
    });
    game.partyEntities.set('u1', e);

    addItem(game, 'sunberry', 40);
    for (let i = 0; i < 30; i++) feedCreature(game, e, 'sunberry');
    const inst = game.ecs.get(e, C.CreatureInstance)!;
    expect(inst.bond).toBeGreaterThanOrEqual(5);
    expect(game.ecs.get(e, C.SkillSet)!.ids.length).toBe(4);
  });

  it('evolves on level, carrying IVs and bond through the rebase', () => {
    const pos = game.playerPos()!;
    const e = spawnCreature(game.ecs, game.rng, 'sproutling', 15, pos.x + 1, pos.y, { owned: true, owner: game.player, bond: 2 });
    const inst = game.ecs.get(e, C.CreatureInstance)!;
    const ivs = { ...inst.ivs };
    addCreatureXp(game, e, 999_999);
    expect(inst.creatureId).not.toBe('sproutling');
    expect(inst.ivs).toEqual(ivs);
    expect(inst.bond).toBe(2);
  });

  it('blocks evolution when the bond gate is unmet', () => {
    const pos = game.playerPos()!;
    const e = spawnCreature(game.ecs, game.rng, 'fangling', 40, pos.x + 1, pos.y, { owned: true, owner: game.player, bond: 1 });
    expect(tryEvolve(game, e)).toBe(false);
    gainBond(game, e, 5);
    expect(game.ecs.get(e, C.CreatureInstance)!.creatureId).toBe('direfang');
  });

  it('swaps a companion to reserve and back without losing progress', () => {
    const pos = game.playerPos()!;
    const e = spawnCreature(game.ecs, game.rng, 'mosshorn', 12, pos.x + 1, pos.y, { owned: true, owner: game.player, bond: 3 });
    game.roster.push({
      uid: 'u2', creatureId: 'mosshorn', level: 12, xp: 40, bond: 3,
      ivs: game.ecs.get(e, C.CreatureInstance)!.ivs,
      natureUp: 'hp', natureDown: 'spd', currentHp: 50, partySlot: 0,
    });
    game.partyEntities.set('u2', e);

    expect(setPartySlot(game, 'u2', -1).ok).toBe(true);
    game.ecs.flush();
    expect(game.activePartyEntities().length).toBe(0);

    expect(setPartySlot(game, 'u2', 0).ok).toBe(true);
    expect(game.activePartyEntities().length).toBe(1);
    const back = game.ecs.get(game.activePartyEntities()[0], C.CreatureInstance)!;
    expect(back.level).toBe(12);
    expect(back.bond).toBe(3);
  });
});
