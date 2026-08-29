import type { Game } from '../game';
import * as C from '../components';
import { STATUSES } from '../../content/statuses';
import { effectiveStat } from '../formula';

/**
 * Integrates velocity, resolves tile collision on each axis separately (so
 * sliding along a wall feels right rather than sticking), and pushes
 * overlapping entities apart.
 */
export function runMovement(game: Game, dt: number): void {
  const { ecs, shard } = game;

  // Player intent -> velocity.
  const pStats = ecs.get(game.player, C.CombatStats);
  const pVel = ecs.get(game.player, C.Velocity);
  const pPos = ecs.get(game.player, C.Position);
  if (pStats && pVel && pPos) {
    const rooted = isRooted(game, game.player);
    const speed = rooted ? 0 : effectiveStat(pStats, 'spd', game.nowMs) * terrainSpeed(game, pPos.x, pPos.y);
    let mx = game.intent.moveX;
    let my = game.intent.moveY;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    pVel.x = mx * speed;
    pVel.y = my * speed;
    if (len > 0.01) {
      const facing = ecs.get(game.player, C.Facing);
      if (facing) facing.angle = Math.atan2(my, mx);
    }
  }

  for (const e of ecs.query(C.Position, C.Velocity)) {
    const pos = ecs.need(e, C.Position);
    const vel = ecs.need(e, C.Velocity);
    pos.px = pos.x;
    pos.py = pos.y;

    if (isRooted(game, e) || isStunned(game, e)) {
      vel.x = 0;
      vel.y = 0;
      continue;
    }
    if (vel.x === 0 && vel.y === 0) continue;

    const radius = ecs.get(e, C.Collider)?.radius ?? 0.3;

    // Axis-separated: sliding along a wall instead of sticking to it.
    const nx = pos.x + vel.x * dt;
    if (canOccupy(game, nx, pos.y, radius)) pos.x = nx;
    const ny = pos.y + vel.y * dt;
    if (canOccupy(game, pos.x, ny, radius)) pos.y = ny;

    pos.x = Math.max(0.5, Math.min(shard.size - 0.5, pos.x));
    pos.y = Math.max(0.5, Math.min(shard.size - 0.5, pos.y));
  }

  separate(game, dt);
  moveProjectiles(game, dt);
}

/** Tile-level collision test against the four corners of the entity's circle. */
function canOccupy(game: Game, x: number, y: number, r: number): boolean {
  const s = game.shard;
  return (
    s.isWalkable(x - r, y - r) &&
    s.isWalkable(x + r, y - r) &&
    s.isWalkable(x - r, y + r) &&
    s.isWalkable(x + r, y + r)
  );
}

function terrainSpeed(game: Game, x: number, y: number): number {
  return game.shard.speedAt(x, y) || 1;
}

export function isRooted(game: Game, e: number): boolean {
  const st = game.ecs.get(e, C.StatusEffects);
  if (!st) return false;
  for (const s of st.active) {
    const def = STATUSES[s.id];
    if (def.roots || def.stuns) return true;
  }
  return false;
}

export function isStunned(game: Game, e: number): boolean {
  const st = game.ecs.get(e, C.StatusEffects);
  if (!st) return false;
  for (const s of st.active) if (STATUSES[s.id].stuns) return true;
  return false;
}

/**
 * Soft separation. Not a physics solver: one pass, capped displacement, so a
 * crowd spreads out over a few frames instead of exploding.
 */
const nearby: number[] = [];
function separate(game: Game, dt: number): void {
  const { ecs, spatial } = game;
  for (const e of ecs.query(C.Position, C.Collider, C.Health)) {
    const pos = ecs.need(e, C.Position);
    const col = ecs.need(e, C.Collider);
    spatial.queryCircle(pos.x, pos.y, col.radius * 2 + 1, nearby);
    let dx = 0;
    let dy = 0;
    for (const other of nearby) {
      if (other === e) continue;
      if (!ecs.has(other, C.Health)) continue; // nodes and structures do not push
      const op = ecs.get(other, C.Position);
      const oc = ecs.get(other, C.Collider);
      if (!op || !oc) continue;
      const minDist = col.radius + oc.radius;
      const ddx = pos.x - op.x;
      const ddy = pos.y - op.y;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 >= minDist * minDist || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (minDist - d) / minDist;
      dx += (ddx / d) * push;
      dy += (ddy / d) * push;
    }
    if (dx === 0 && dy === 0) continue;
    const step = Math.min(1, dt * 6);
    const nx = pos.x + dx * step;
    const ny = pos.y + dy * step;
    if (canOccupy(game, nx, pos.y, col.radius)) pos.x = nx;
    if (canOccupy(game, pos.x, ny, col.radius)) pos.y = ny;
  }
}

function moveProjectiles(game: Game, dt: number): void {
  const { ecs } = game;
  for (const e of ecs.query(C.Position, C.Projectile)) {
    const pos = ecs.need(e, C.Position);
    const pr = ecs.need(e, C.Projectile);
    pos.px = pos.x;
    pos.py = pos.y;
    const step = pr.speed * dt;
    pos.x += pr.dirX * step;
    pos.y += pr.dirY * step;
    pr.rangeLeft -= step;
    if (pr.rangeLeft <= 0 || game.shard.blocksSight(pos.x, pos.y)) ecs.destroy(e);
  }
}
