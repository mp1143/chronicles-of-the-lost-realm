import type { Entity } from '../../core/ecs';
import type { Game } from '../game';
import * as C from '../components';
import { AI_BUDGET_MS, AI_FULL_TICK_RANGE, AI_SLOW_TICK_RANGE, PERCEPTION_HZ } from '../../core/config';
import { dist2 } from '../../core/math';
import { getSkill } from '../../content/skills';
import type { Role } from '../../content/creatures';
import { activateSkill, canUseSkill } from './combat';

/**
 * Behaviour trees, one per role, shared by every creature of that role.
 *
 * Chosen over FSMs (spaghetti past ~6 states) and GOAP (overkill for combat
 * pets, painful to debug on a phone). Nodes are stateless and shared; only the
 * blackboard is per-entity, so 3,000 creatures share six tree instances.
 *
 * Bond is not merely a stat bonus — it enables branches. A bond-3 creature will
 * interpose itself between the player and a threat; a bond-7 one will break off
 * a suicidal order to survive. That is the cheapest way to make companionship
 * mechanically real.
 */

export type NodeResult = 'success' | 'failure' | 'running';

export interface Ctx {
  game: Game;
  e: Entity;
  ai: C.AIState;
  pos: C.Position;
  dt: number;
}

export interface BTNode {
  tick(ctx: Ctx): NodeResult;
}

// ---------- composites ----------

const Sequence = (...children: BTNode[]): BTNode => ({
  tick(ctx) {
    for (const c of children) {
      const r = c.tick(ctx);
      if (r !== 'success') return r;
    }
    return 'success';
  },
});

const Selector = (...children: BTNode[]): BTNode => ({
  tick(ctx) {
    for (const c of children) {
      const r = c.tick(ctx);
      if (r !== 'failure') return r;
    }
    return 'failure';
  },
});

const Condition = (fn: (ctx: Ctx) => boolean): BTNode => ({
  tick: (ctx) => (fn(ctx) ? 'success' : 'failure'),
});

const Action = (fn: (ctx: Ctx) => NodeResult): BTNode => ({ tick: fn });

// ---------- leaves ----------

const hasTarget = Condition((c) => c.ai.target !== null && c.game.ecs.isAlive(c.ai.target));

const isStance = (s: C.Stance): BTNode => Condition((c) => c.ai.stance === s);

const bondAtLeast = (n: number): BTNode =>
  Condition((c) => (c.game.ecs.get(c.e, C.CreatureInstance)?.bond ?? 0) >= n);

const ownerHpBelow = (frac: number): BTNode =>
  Condition((c) => {
    const owner = c.game.ecs.get(c.e, C.OwnedBy)?.owner;
    if (owner === undefined) return false;
    const hp = c.game.ecs.get(owner, C.Health);
    return !!hp && hp.current / hp.max < frac;
  });

const selfHpBelow = (frac: number): BTNode =>
  Condition((c) => {
    const hp = c.game.ecs.get(c.e, C.Health);
    return !!hp && hp.current / hp.max < frac;
  });

const Stop: BTNode = Action((c) => {
  const v = c.game.ecs.get(c.e, C.Velocity);
  if (v) {
    v.x = 0;
    v.y = 0;
  }
  return 'success';
});

const moveToward = (getPoint: (c: Ctx) => { x: number; y: number } | null, stopAt: number): BTNode =>
  Action((c) => {
    const p = getPoint(c);
    const v = c.game.ecs.get(c.e, C.Velocity);
    const stats = c.game.ecs.get(c.e, C.CombatStats);
    if (!p || !v || !stats) return 'failure';
    const dx = p.x - c.pos.x;
    const dy = p.y - c.pos.y;
    const d = Math.hypot(dx, dy);
    if (d <= stopAt) {
      v.x = 0;
      v.y = 0;
      return 'success';
    }
    const speed = stats.spd * (c.game.shard.speedAt(c.pos.x, c.pos.y) || 1);
    v.x = (dx / d) * speed;
    v.y = (dy / d) * speed;
    const f = c.game.ecs.get(c.e, C.Facing);
    if (f) f.angle = Math.atan2(dy, dx);
    return 'running';
  });

const followOwner = (distance: number): BTNode =>
  moveToward((c) => {
    const owner = c.game.ecs.get(c.e, C.OwnedBy)?.owner;
    if (owner === undefined) return null;
    return c.game.ecs.get(owner, C.Position) ?? null;
  }, distance);

/**
 * Surface-to-surface gap between two entities. Ranges are authored as reach
 * beyond the body, so a large creature must not be asked to walk its own radius
 * into a target it can never overlap — the separation pass pushes them apart
 * again, and the attack never fires.
 */
function reachPadding(c: Ctx): number {
  const self = c.game.ecs.get(c.e, C.Collider)?.radius ?? 0.3;
  const target = c.ai.target !== null ? c.game.ecs.get(c.ai.target, C.Collider)?.radius ?? 0.3 : 0.3;
  return self + target;
}

const approachTarget = (range: number): BTNode =>
  Action((c) => {
    const p = c.ai.target !== null ? c.game.ecs.get(c.ai.target, C.Position) ?? null : null;
    return moveToward(() => p, range + reachPadding(c)).tick(c);
  });

/** Backs away from the current target — Skirmisher hit-and-run, Mage spacing. */
const kite = (minRange: number): BTNode =>
  Action((c) => {
    if (c.ai.target === null) return 'failure';
    const tp = c.game.ecs.get(c.ai.target, C.Position);
    const v = c.game.ecs.get(c.e, C.Velocity);
    const stats = c.game.ecs.get(c.e, C.CombatStats);
    if (!tp || !v || !stats) return 'failure';
    const dx = c.pos.x - tp.x;
    const dy = c.pos.y - tp.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d >= minRange) return 'failure';
    v.x = (dx / d) * stats.spd;
    v.y = (dy / d) * stats.spd;
    return 'running';
  });

const interpose: BTNode = Action((c) => {
  const owner = c.game.ecs.get(c.e, C.OwnedBy)?.owner;
  if (owner === undefined || c.ai.target === null) return 'failure';
  const op = c.game.ecs.get(owner, C.Position);
  const tp = c.game.ecs.get(c.ai.target, C.Position);
  const v = c.game.ecs.get(c.e, C.Velocity);
  const stats = c.game.ecs.get(c.e, C.CombatStats);
  if (!op || !tp || !v || !stats) return 'failure';
  const mx = (op.x + tp.x) / 2;
  const my = (op.y + tp.y) / 2;
  const dx = mx - c.pos.x;
  const dy = my - c.pos.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.4) {
    v.x = 0;
    v.y = 0;
    return 'success';
  }
  v.x = (dx / d) * stats.spd;
  v.y = (dy / d) * stats.spd;
  return 'running';
});

/** Picks the best available skill that can currently reach the target. */
const useSkill: BTNode = Action((c) => {
  if (c.ai.target === null) return 'failure';
  const set = c.game.ecs.get(c.e, C.SkillSet);
  const tp = c.game.ecs.get(c.ai.target, C.Position);
  if (!set || !tp) return 'failure';
  const d = Math.hypot(tp.x - c.pos.x, tp.y - c.pos.y);
  const padding = reachPadding(c);

  let best: string | null = null;
  let bestPower = -1;
  for (const id of set.ids) {
    if (!canUseSkill(c.game, c.e, id)) continue;
    const sk = getSkill(id);
    if (skillReach(sk) + padding < d) continue;
    // Support skills are worth using even at zero power.
    const score = sk.power > 0 ? sk.power : 45;
    if (score > bestPower) {
      bestPower = score;
      best = id;
    }
  }
  if (!best) return 'failure';
  return activateSkill(c.game, c.e, best, tp.x, tp.y) ? 'success' : 'failure';
});

/**
 * Heal/buff branch for supports: fires on the most wounded ally including itself.
 *
 * ponytail: full ally scan per support creature per decision. O(n) inside the
 * AI loop, so O(n*supports) worst case. Fine at our entity counts (measured
 * 1.3ms/tick with 250 entities); if a crowd of supports ever shows up in a
 * profile, query the spatial hash instead of the ECS here.
 */
const supportAlly: BTNode = Action((c) => {
  const set = c.game.ecs.get(c.e, C.SkillSet);
  if (!set) return 'failure';
  const faction = c.game.ecs.get(c.e, C.FactionTag)?.value;
  let worst: Entity | null = null;
  let worstFrac = 0.85; // do not waste a heal above 85%
  for (const other of c.game.ecs.query(C.Health, C.Position, C.FactionTag)) {
    if (c.game.ecs.need(other, C.FactionTag).value !== faction) continue;
    const hp = c.game.ecs.need(other, C.Health);
    const op = c.game.ecs.need(other, C.Position);
    if (dist2(c.pos.x, c.pos.y, op.x, op.y) > 36) continue;
    const frac = hp.current / hp.max;
    if (frac < worstFrac) {
      worstFrac = frac;
      worst = other;
    }
  }
  if (worst === null) return 'failure';
  for (const id of set.ids) {
    const sk = getSkill(id);
    const beneficial = sk.onHit.some((e) => e.effect === 'heal' || e.effect === 'cleanse' || e.effect === 'buff');
    if (!beneficial || !canUseSkill(c.game, c.e, id)) continue;
    return activateSkill(c.game, c.e, id, c.pos.x, c.pos.y) ? 'success' : 'failure';
  }
  return 'failure';
});

/** Bond >= 7: disengage to survive rather than obey a suicidal order. */
const selfPreserve: BTNode = Action((c) => {
  const v = c.game.ecs.get(c.e, C.Velocity);
  const stats = c.game.ecs.get(c.e, C.CombatStats);
  if (!v || !stats || c.ai.target === null) return 'failure';
  const tp = c.game.ecs.get(c.ai.target, C.Position);
  if (!tp) return 'failure';
  const dx = c.pos.x - tp.x;
  const dy = c.pos.y - tp.y;
  const d = Math.hypot(dx, dy) || 1;
  v.x = (dx / d) * stats.spd * 1.2;
  v.y = (dy / d) * stats.spd * 1.2;
  return 'running';
});

const wander: BTNode = Action((c) => {
  const v = c.game.ecs.get(c.e, C.Velocity);
  const stats = c.game.ecs.get(c.e, C.CombatStats);
  if (!v || !stats) return 'failure';
  if (c.game.nowMs > c.ai.wanderUntil) {
    const a = c.game.rng.float(0, Math.PI * 2);
    const r = c.game.rng.float(2, 7);
    const wx = c.ai.homeX + Math.cos(a) * r;
    const wy = c.ai.homeY + Math.sin(a) * r;
    const spot = c.game.shard.findWalkableNear(wx, wy, 4);
    c.ai.wanderX = spot?.x ?? c.ai.homeX;
    c.ai.wanderY = spot?.y ?? c.ai.homeY;
    c.ai.wanderUntil = c.game.nowMs + c.game.rng.float(2500, 6000);
  }
  const dx = c.ai.wanderX - c.pos.x;
  const dy = c.ai.wanderY - c.pos.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.5) {
    v.x = 0;
    v.y = 0;
    return 'success';
  }
  v.x = (dx / d) * stats.spd * 0.4;
  v.y = (dy / d) * stats.spd * 0.4;
  return 'running';
});

function skillReach(sk: ReturnType<typeof getSkill>): number {
  switch (sk.shape.type) {
    case 'melee': return sk.shape.range;
    case 'line': return sk.shape.length;
    case 'circle': return sk.shape.range + sk.shape.radius;
    case 'projectile': return sk.shape.range;
    case 'self': return sk.shape.radius;
  }
}

// ---------- the six role trees ----------

const TREES: Record<Role, BTNode> = {
  tank: Selector(
    Sequence(isStance('hold'), Stop),
    Sequence(bondAtLeast(3), ownerHpBelow(0.3), hasTarget, interpose),
    Sequence(hasTarget, approachTarget(1.4), useSkill),
    Sequence(hasTarget, approachTarget(1.4)),
    followOwner(2.5),
    wander,
  ),
  bruiser: Selector(
    Sequence(isStance('hold'), Stop),
    Sequence(bondAtLeast(7), selfHpBelow(0.15), selfPreserve),
    Sequence(hasTarget, approachTarget(1.5), useSkill),
    Sequence(hasTarget, approachTarget(1.5)),
    followOwner(3),
    wander,
  ),
  assassin: Selector(
    Sequence(isStance('hold'), Stop),
    Sequence(bondAtLeast(7), selfHpBelow(0.2), selfPreserve),
    Sequence(hasTarget, approachTarget(1.3), useSkill),
    Sequence(hasTarget, approachTarget(1.3)),
    followOwner(3.5),
    wander,
  ),
  skirmisher: Selector(
    Sequence(isStance('hold'), Stop),
    Sequence(bondAtLeast(7), selfHpBelow(0.2), selfPreserve),
    Sequence(hasTarget, useSkill),
    Sequence(hasTarget, kite(2.2)),
    Sequence(hasTarget, approachTarget(2.6)),
    followOwner(3),
    wander,
  ),
  mage: Selector(
    Sequence(isStance('hold'), Stop),
    Sequence(bondAtLeast(7), selfHpBelow(0.25), selfPreserve),
    Sequence(hasTarget, kite(3.5)),
    Sequence(hasTarget, useSkill),
    Sequence(hasTarget, approachTarget(5)),
    followOwner(4),
    wander,
  ),
  support: Selector(
    Sequence(isStance('hold'), Stop),
    supportAlly,
    Sequence(bondAtLeast(7), selfHpBelow(0.3), selfPreserve),
    Sequence(hasTarget, kite(3)),
    Sequence(hasTarget, useSkill),
    followOwner(2.5),
    wander,
  ),
};

// ---------- the system ----------

let roundRobin = 0;

export function runAI(game: Game, dt: number): void {
  const start = performance.now();
  const playerPos = game.playerPos();
  if (!playerPos) return;

  const entities = game.ecs.query(C.AIState, C.Position, C.Velocity);
  if (entities.length === 0) return;

  // Round-robin start point, so a fixed budget never starves the same entities.
  const n = entities.length;
  let processed = 0;
  for (let i = 0; i < n; i++) {
    const e = entities[(roundRobin + i) % n];
    const pos = game.ecs.get(e, C.Position);
    const ai = game.ecs.get(e, C.AIState);
    if (!pos || !ai) continue;

    const d2 = dist2(pos.x, pos.y, playerPos.x, playerPos.y);
    // LOD: full tick near the camera, 4Hz mid-range, frozen far away.
    if (d2 > AI_SLOW_TICK_RANGE * AI_SLOW_TICK_RANGE) {
      const v = game.ecs.get(e, C.Velocity);
      if (v) {
        v.x = 0;
        v.y = 0;
      }
      continue;
    }
    if (d2 > AI_FULL_TICK_RANGE * AI_FULL_TICK_RANGE && game.nowMs - ai.lastPerceptionMs < 250) continue;

    perceive(game, e, ai, pos);

    const role = roleOf(game, e);
    TREES[role].tick({ game, e, ai, pos, dt });
    processed++;

    // Hard 2.5ms budget. Latency degrades gracefully; the frame never blows out.
    if ((processed & 7) === 0 && performance.now() - start > AI_BUDGET_MS) {
      roundRobin = (roundRobin + i + 1) % n;
      return;
    }
  }
  roundRobin = (roundRobin + n) % Math.max(1, n);
}

function roleOf(game: Game, e: Entity): Role {
  const inst = game.ecs.get(e, C.CreatureInstance);
  if (inst) return inst.role;
  if (game.ecs.has(e, C.BossTag)) return 'bruiser';
  return 'skirmisher';
}

/** Vision cone plus hearing radius, line-of-sight checked against the tile grid. */
function perceive(game: Game, e: Entity, ai: C.AIState, pos: C.Position): void {
  if (game.nowMs - ai.lastPerceptionMs < 1000 / PERCEPTION_HZ) return;
  ai.lastPerceptionMs = game.nowMs;

  if (ai.forcedTargetUntil > game.nowMs && ai.target !== null && game.ecs.isAlive(ai.target)) return;

  const myFaction = game.ecs.get(e, C.FactionTag)?.value ?? 'wild';
  const sightRange = myFaction === 'player' ? 11 : 9;

  // Threat table wins when it has entries — that is what makes taunts work.
  let best: Entity | null = null;
  let bestScore = -Infinity;
  for (const [src, threat] of ai.threat) {
    if (!game.ecs.isAlive(src)) {
      ai.threat.delete(src);
      continue;
    }
    const sp = game.ecs.get(src, C.Position);
    if (!sp) continue;
    if (dist2(pos.x, pos.y, sp.x, sp.y) > sightRange * sightRange * 2.25) continue;
    if (threat > bestScore) {
      bestScore = threat;
      best = src;
    }
  }
  if (best !== null) {
    ai.target = best;
    return;
  }

  const candidates = game.ecs.query(C.Position, C.Health, C.FactionTag);
  let nearest: Entity | null = null;
  let nearestD2 = sightRange * sightRange;
  for (const t of candidates) {
    if (t === e) continue;
    const tf = game.ecs.need(t, C.FactionTag).value;
    if (!isHostileTo(myFaction, tf)) continue;
    const tp = game.ecs.need(t, C.Position);
    const d2 = dist2(pos.x, pos.y, tp.x, tp.y);
    if (d2 >= nearestD2) continue;
    if (!game.shard.hasLineOfSight(pos.x, pos.y, tp.x, tp.y)) continue;
    nearestD2 = d2;
    nearest = t;
  }
  ai.target = nearest;
}

function isHostileTo(a: C.Faction, b: C.Faction): boolean {
  if (a === b) return false;
  if (a === 'neutral' || b === 'neutral') return false;
  // Wild creatures do not initiate against the player's party; they retaliate.
  if (a === 'wild' && b === 'player') return false;
  return true;
}
