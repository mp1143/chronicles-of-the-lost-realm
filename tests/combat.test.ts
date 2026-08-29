import { describe, it, expect } from 'vitest';
import { computeDamage, tameChance, statAtLevel, resolveCreatureStats, xpForKill, bondStatMultiplier } from '../src/sim/formula';
import { threadMultiplier, threadPair, THREADS } from '../src/content/threads';
import { CREATURES, getCreature } from '../src/content/creatures';
import { SKILLS } from '../src/content/skills';
import { STATUSES } from '../src/content/statuses';
import { ITEMS } from '../src/content/items';
import { RECIPES } from '../src/content/recipes';
import { BOSSES } from '../src/content/bosses';

const baseDamage = (over: Partial<Parameters<typeof computeDamage>[0]> = {}) =>
  computeDamage({
    power: 50, attackStat: 100, defenceStat: 50,
    attackThread: 'stone', defenceThreads: ['stone'],
    critChance: 0, critRoll: 0.99, varianceRoll: 0.5,
    ...over,
  });

describe('thread chart', () => {
  it('is a proper 5-cycle', () => {
    const cycle = ['verdant', 'stone', 'storm', 'tide', 'ember'] as const;
    for (let i = 0; i < cycle.length; i++) {
      const attacker = cycle[i];
      const defender = cycle[(i + 1) % cycle.length];
      expect(threadPair(attacker, defender)).toBe(1.5);
      expect(threadPair(defender, attacker)).toBeCloseTo(0.67, 2);
    }
  });

  it('makes radiance and umbra a mutual mirror pair', () => {
    expect(threadPair('radiance', 'umbra')).toBe(1.5);
    expect(threadPair('umbra', 'radiance')).toBe(1.5);
  });

  it('gives null an edge both ways', () => {
    for (const t of THREADS) {
      if (t === 'null') continue;
      expect(threadPair('null', t)).toBe(1.25);
      expect(threadPair(t, 'null')).toBe(1.25);
    }
  });

  it('multiplies for dual-thread defenders', () => {
    // Verdant beats stone but loses to ember, so a stone/ember defender is neutral.
    expect(threadMultiplier('verdant', ['stone', 'ember'])).toBeCloseTo(1.5 * 0.67, 5);
  });
});

describe('damage formula', () => {
  it('rises with attack and falls with defence', () => {
    expect(baseDamage({ attackStat: 200 }).amount).toBeGreaterThan(baseDamage().amount);
    expect(baseDamage({ defenceStat: 200 }).amount).toBeLessThan(baseDamage().amount);
  });

  it('never deals less than 1', () => {
    expect(baseDamage({ attackStat: 1, power: 1, defenceStat: 10_000 }).amount).toBeGreaterThanOrEqual(1);
  });

  it('applies thread advantage', () => {
    const neutral = baseDamage().amount;
    const strong = baseDamage({ attackThread: 'verdant', defenceThreads: ['stone'] }).amount;
    const weak = baseDamage({ attackThread: 'stone', defenceThreads: ['verdant'] }).amount;
    expect(strong).toBeGreaterThan(neutral);
    expect(weak).toBeLessThan(neutral);
    expect(strong / neutral).toBeCloseTo(1.5, 1);
  });

  it('crits for 1.75x', () => {
    const normal = baseDamage({ critChance: 0, critRoll: 0.99 }).amount;
    const crit = baseDamage({ critChance: 1, critRoll: 0 });
    expect(crit.crit).toBe(true);
    expect(crit.amount / normal).toBeCloseTo(1.75, 1);
  });

  it('keeps variance inside +/-6%', () => {
    const lo = baseDamage({ varianceRoll: 0 }).amount;
    const hi = baseDamage({ varianceRoll: 0.999 }).amount;
    expect(hi / lo).toBeLessThan(1.14);
    expect(hi).toBeGreaterThanOrEqual(lo);
  });

  it('defence has diminishing returns rather than a hard wall', () => {
    // Doubling defence must never reduce damage by more than half.
    const a = baseDamage({ defenceStat: 100 }).amount;
    const b = baseDamage({ defenceStat: 200 }).amount;
    expect(b).toBeGreaterThan(a * 0.5);
  });
});

describe('taming', () => {
  const base = {
    base: 0.4, rhythmHits: 0, focus: 5, statusBonus: 0,
    levelDelta: 0, affinity: 0, hpFraction: 0.3,
  };

  it('is clamped to a winnable and losable band', () => {
    expect(tameChance({ ...base, base: 5 })).toBeLessThanOrEqual(0.95);
    expect(tameChance({ ...base, base: 0, levelDelta: 100 })).toBeGreaterThanOrEqual(0.05);
  });

  it('rewards rhythm hits, focus, status and low health', () => {
    const b = tameChance(base);
    expect(tameChance({ ...base, rhythmHits: 3 })).toBeGreaterThan(b);
    expect(tameChance({ ...base, focus: 40 })).toBeGreaterThan(b);
    expect(tameChance({ ...base, statusBonus: 0.15 })).toBeGreaterThan(b);
    expect(tameChance({ ...base, hpFraction: 0.05 })).toBeGreaterThan(b);
  });

  it('punishes level gaps but not level surplus', () => {
    expect(tameChance({ ...base, levelDelta: 20 })).toBeLessThan(tameChance(base));
    expect(tameChance({ ...base, levelDelta: -20 })).toBe(tameChance(base));
  });

  it('mercy affinity accumulates into a real improvement', () => {
    // 10 failures should be worth about half a rhythm-perfect attempt.
    expect(tameChance({ ...base, affinity: 0.5 })).toBeGreaterThan(tameChance(base) + 0.4);
  });
});

describe('progression maths', () => {
  it('grows stats monotonically with level', () => {
    let prev = 0;
    for (let lv = 1; lv <= 60; lv++) {
      const v = statAtLevel(60, lv, 0);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('caps the IV spread at roughly 12% at level 60', () => {
    const worst = statAtLevel(60, 60, 0);
    const best = statAtLevel(60, 60, 15);
    expect(best / worst).toBeLessThan(1.2);
  });

  it('bond adds at most 10%', () => {
    expect(bondStatMultiplier(0)).toBe(1);
    expect(bondStatMultiplier(3)).toBe(1.05);
    expect(bondStatMultiplier(10)).toBe(1.1);
  });

  it('never awards zero XP for an under-levelled kill', () => {
    expect(xpForKill(1, 60)).toBeGreaterThan(0);
    expect(xpForKill(60, 1)).toBeGreaterThan(xpForKill(1, 1));
  });
});

describe('content integrity', () => {
  it('ships exactly 40 creatures', () => {
    expect(Object.keys(CREATURES).length).toBe(40);
  });

  it('has valid ids and non-empty threads and skills for every creature', () => {
    for (const [id, c] of Object.entries(CREATURES)) {
      expect(c.id).toBe(id);
      expect(c.threads.length).toBeGreaterThan(0);
      expect(c.skills.length).toBeGreaterThanOrEqual(2);
      expect(c.bestiary.length).toBe(3);
      for (const s of c.skills) expect(SKILLS[s], `${id} references skill ${s}`).toBeDefined();
      expect(ITEMS[c.preferredFood], `${id} prefers ${c.preferredFood}`).toBeDefined();
    }
  });

  it('resolves every evolution target and catalyst', () => {
    for (const c of Object.values(CREATURES)) {
      if (!c.evolvesTo) continue;
      expect(CREATURES[c.evolvesTo], `${c.id} -> ${c.evolvesTo}`).toBeDefined();
      if (c.evolveItem) expect(ITEMS[c.evolveItem], `${c.id} needs ${c.evolveItem}`).toBeDefined();
      // An evolution must be a stat upgrade, or it is a punishment.
      const before = Object.values(c.base).reduce((a, b) => a + b, 0);
      const after = Object.values(CREATURES[c.evolvesTo].base).reduce((a, b) => a + b, 0);
      expect(after, `${c.id} -> ${c.evolvesTo} must gain stats`).toBeGreaterThan(before);
    }
  });

  it('has no evolution cycles', () => {
    for (const start of Object.values(CREATURES)) {
      const seen = new Set<string>();
      let cur: string | undefined = start.id;
      while (cur) {
        expect(seen.has(cur), `cycle through ${cur}`).toBe(false);
        seen.add(cur);
        cur = CREATURES[cur].evolvesTo;
      }
    }
  });

  it('gives every skill a telegraph proportional to its danger', () => {
    for (const s of Object.values(SKILLS)) {
      expect(SKILLS[s.id]).toBeDefined();
      // Anything above 70 power is in one-shot territory and must warn for >= 600ms.
      if (s.power >= 70) expect(s.telegraphMs, `${s.id}`).toBeGreaterThanOrEqual(600);
      expect(s.maxTargets).toBeGreaterThan(0);
      for (const e of s.onHit) {
        if (e.effect === 'status') expect(STATUSES[e.status]).toBeDefined();
      }
    }
  });

  it('resolves every recipe input and output', () => {
    for (const r of Object.values(RECIPES)) {
      expect(ITEMS[r.output.itemId], `${r.id} output`).toBeDefined();
      for (const i of r.inputs) expect(ITEMS[i.itemId], `${r.id} input ${i.itemId}`).toBeDefined();
    }
  });

  it('resolves boss skills and drops', () => {
    for (const b of Object.values(BOSSES)) {
      expect(b.phases.length).toBeGreaterThan(1);
      for (const phase of b.phases) {
        for (const s of phase.skills) expect(SKILLS[s], `${b.id} phase skill ${s}`).toBeDefined();
        if (phase.summons) expect(CREATURES[phase.summons.creatureId]).toBeDefined();
      }
      for (const d of b.drops) expect(ITEMS[d.itemId], `${b.id} drop ${d.itemId}`).toBeDefined();
      // Phase thresholds must descend, or later phases never trigger.
      const th = b.phases.map((p) => p.hpThreshold);
      expect([...th].sort((a, c) => c - a)).toEqual(th);
    }
  });

  it('never lets a status chain-lock the player', () => {
    for (const s of Object.values(STATUSES)) {
      if (s.stuns || s.roots) {
        expect(s.playerImmunityMs, `${s.id} must grant immunity`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps a full-bond stat resolve inside sane bounds', () => {
    const def = getCreature('direfang');
    const stats = resolveCreatureStats(def, {
      creatureId: 'direfang', level: 60, xp: 0, bond: 10,
      ivs: { hp: 15, atk: 15, def: 15, mag: 15, res: 15, spd: 15 },
      natureUp: 'atk', natureDown: 'def', role: 'assassin', owned: true,
    });
    expect(stats.hp).toBeGreaterThan(def.base.hp);
    expect(stats.hp).toBeLessThan(def.base.hp * 4);
  });
});
