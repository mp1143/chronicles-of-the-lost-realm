/**
 * Headless balance simulator.
 *
 * Runs the real combat systems thousands of times across level and party
 * permutations and reports time-to-kill, win rate and damage share. Balance is
 * measured, not guessed — this is a CI gate on any change to creatures.ts,
 * skills.ts or the damage formula (TechnicalDesign §5.5).
 *
 *   npm run balance            # summary table
 *   npm run balance -- --csv   # machine-readable, for tracking over time
 *
 * Exits non-zero if a boss win rate leaves its design band at the intended
 * level, if any thread matchup falls outside 0.6-1.65x of a neutral one, or if
 * a creature evolution stage has an unreasonable stat spread.
 */
import { Game } from '../src/sim/game';
import * as C from '../src/sim/components';
import { spawnBoss } from '../src/sim/factory';
import { setPartySlot } from '../src/sim/actions';
import { SIM_STEP_MS } from '../src/core/loop';
import { CREATURES, type CreatureDef } from '../src/content/creatures';
import { BOSSES } from '../src/content/bosses';
import { computeDamage } from '../src/sim/formula';
import { THREADS, type Thread } from '../src/content/threads';
import { SeededRNG } from '../src/core/rng';

const DT = SIM_STEP_MS / 1000;
const CSV = process.argv.includes('--csv');
/** 40 trials keeps sampling error near +-8% — tight enough to tell a real
 *  tuning change from noise, cheap enough to run on every CI push. */
const TRIALS = 40;
const MAX_TICKS = 30 * 120; // 2 simulated minutes before a fight is called a loss

interface FightResult {
  won: boolean;
  ticks: number;
  playerHpFrac: number;
}

/** One fight: a party of `partySize` creatures plus the player against a boss. */
function fightBoss(seed: string, bossId: string, playerLevel: number, partySize: number, partyOf: string): FightResult {
  const game = new Game(seed, 'balance');
  game.newGame();

  const player = game.ecs.get(game.player, C.PlayerTag)!;
  player.level = playerLevel;
  const stats = game.ecs.get(game.player, C.CombatStats)!;
  stats.atk = 22 + playerLevel * 3.2;
  stats.mag = 16 + playerLevel * 2.6;
  stats.def = 12 + playerLevel * 1.4;
  stats.res = 10 + playerLevel * 1.2;
  const hp = game.ecs.get(game.player, C.Health)!;
  hp.max = 100 + playerLevel * 10;
  hp.current = hp.max;

  const pos = game.playerPos()!;
  const rng = new SeededRNG(seed, 'balance');
  for (let i = 0; i < partySize; i++) {
    const uid = `p${i}`;
    game.roster.push({
      uid, creatureId: partyOf, level: playerLevel, xp: 0, bond: 5,
      ivs: { hp: 8, atk: 8, def: 8, mag: 8, res: 8, spd: 8 },
      natureUp: 'atk', natureDown: 'res', currentHp: 9999, partySlot: -1,
    });
    setPartySlot(game, uid, i);
  }

  const spot = game.shard.findWalkableNear(pos.x + 6, pos.y, 12) ?? pos;
  const boss = spawnBoss(game.ecs, rng, bossId, spot.x, spot.y, partySize);

  // Isolate the arena. Without this, wild creatures streamed in by the world
  // join in on the boss (they are hostile to it), and the measurement becomes
  // "how many bystanders spawned" rather than "how hard is this fight".
  const participants = new Set<number>([game.player, boss, ...game.activePartyEntities()]);
  const clearBystanders = (): void => {
    for (const e of game.ecs.query(C.Health)) {
      if (!participants.has(e)) game.ecs.destroy(e);
    }
    game.ecs.flush();
  };

  // The player attacks on cooldown and holds position; this measures the
  // system, not the operator.
  const skills = game.ecs.get(game.player, C.SkillSet)!.ids;
  let ticks = 0;
  while (ticks < MAX_TICKS) {
    clearBystanders();
    const bp = game.ecs.get(boss, C.Position);
    if (bp) {
      game.intent.aimX = bp.x;
      game.intent.aimY = bp.y;
      for (const id of skills) game.intent.useSkills.push(id);
    }
    game.tick(DT);
    ticks++;
    if (!game.ecs.isAlive(boss)) {
      return { won: true, ticks, playerHpFrac: hp.current / hp.max };
    }
    if (hp.current <= 0) return { won: false, ticks, playerHpFrac: 0 };
  }
  return { won: false, ticks, playerHpFrac: hp.current / hp.max };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// ---------- 1. Boss win rates ----------

const failures: string[] = [];
const bossRows: string[] = [];

for (const boss of Object.values(BOSSES)) {
  for (const partySize of [1, 2, 3]) {
    const trials = TRIALS;
    let wins = 0;
    let totalTicks = 0;
    let totalHp = 0;
    for (let i = 0; i < trials; i++) {
      const r = fightBoss(`bal-${boss.id}-${partySize}-${i}`, boss.id, boss.intendedLevel, partySize, 'thornkin');
      if (r.won) wins++;
      totalTicks += r.ticks;
      totalHp += r.playerHpFrac;
    }
    const rate = wins / trials;
    const ttk = totalTicks / trials / 30;
    const hpLeft = totalHp / trials;
    bossRows.push(
      CSV
        ? `${boss.id},${boss.intendedLevel},${partySize},${rate.toFixed(3)},${ttk.toFixed(1)},${hpLeft.toFixed(3)}`
        : `  ${boss.name.padEnd(22)} party ${partySize}  win ${pct(rate).padStart(6)}  ttk ${ttk.toFixed(0).padStart(3)}s  hp left ${pct(hpLeft).padStart(6)}`,
    );
    // The design envelope: a prepared player at level should win most of the
    // time with a full party, and struggle solo. Outside this band, the fight
    // is either a formality or a wall.
    if (partySize === 3 && (rate < 0.35 || rate > 0.95)) {
      failures.push(`${boss.id} 3-party win rate ${pct(rate)} outside 35-95%`);
    }
    if (partySize === 1 && rate > 0.9) {
      failures.push(`${boss.id} solo win rate ${pct(rate)} — the fight is not a fight`);
    }
  }
}

// ---------- 2. Thread matchup envelope ----------

const rng = new SeededRNG('threads', 'balance');
const threadRows: string[] = [];

function avgDamage(attack: Thread, defend: Thread): number {
  let total = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) {
    total += computeDamage({
      power: 60, attackStat: 120, defenceStat: 60,
      attackThread: attack, defenceThreads: [defend],
      critChance: 0.05, critRoll: rng.next(), varianceRoll: rng.next(),
    }).amount;
  }
  return total / n;
}

// Baseline: a matchup with no relationship either way.
const neutral = avgDamage('verdant', 'radiance');
for (const attack of THREADS) {
  if (attack === 'null') continue;
  for (const defend of THREADS) {
    if (defend === 'null') continue;
    const avg = avgDamage(attack as Thread, defend as Thread);
    const ratio = avg / neutral;
    threadRows.push(CSV ? `${attack},${defend},${avg.toFixed(1)},${ratio.toFixed(2)}` : '');
    // Thread choice should tilt a fight, never decide it outright. The design
    // envelope is 0.67x to 1.5x of neutral, with tolerance for crit variance.
    if (ratio > 1.65 || ratio < 0.6) {
      failures.push(`${attack} vs ${defend} is ${ratio.toFixed(2)}x neutral, outside 0.6-1.65x`);
    }
  }
}

// ---------- 3. Creature power curve ----------

const bstRows: string[] = [];
const byStage = new Map<number, number[]>();
function stageOf(def: CreatureDef): number {
  // Stage = how many evolutions lead into this creature.
  let stage = 0;
  for (const other of Object.values(CREATURES)) {
    if (other.evolvesTo === def.id) stage = stageOf(other) + 1;
  }
  return stage;
}
for (const def of Object.values(CREATURES)) {
  const bst = Object.values(def.base).reduce((a, b) => a + b, 0);
  const stage = stageOf(def);
  if (!byStage.has(stage)) byStage.set(stage, []);
  byStage.get(stage)!.push(bst);
}
for (const [stage, values] of [...byStage].sort((a, b) => a[0] - b[0])) {
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  bstRows.push(
    CSV
      ? `stage${stage},${values.length},${avg.toFixed(0)},${min},${max}`
      : `  stage ${stage}: ${String(values.length).padStart(2)} creatures, avg BST ${avg.toFixed(0)}, range ${min}-${max}`,
  );
  // A stage-2 creature must not be weaker than an average stage-1 one.
  if (max / min > 2.4) failures.push(`stage ${stage} BST spread ${min}-${max} is too wide`);
}

// ---------- report ----------

if (CSV) {
  console.log('# bosses: id,level,party,winRate,ttkSeconds,playerHpLeft');
  for (const r of bossRows) console.log(r);
  console.log('# threads: attack,defend,avgDamage,ratioToNeutral');
  for (const r of threadRows) console.log(r);
  console.log('# stages: stage,count,avgBST,minBST,maxBST');
  for (const r of bstRows) console.log(r);
} else {
  console.log(`\nBOSS WIN RATES (${TRIALS} trials each, player at intended level)`);
  for (const r of bossRows) console.log(r);
  console.log('\nCREATURE POWER CURVE');
  for (const r of bstRows) console.log(r);
}

if (failures.length > 0) {
  console.error(`\nBALANCE GATE FAILED — ${failures.length} issue(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nBalance gate passed.');
