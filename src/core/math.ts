/** Scalar and 2D helpers. No allocation in hot paths — callers pass out-params where it matters. */

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (t: number): number => t * t * (3 - 2 * t);
export const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

export const dist2 = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};

export const dist = (ax: number, ay: number, bx: number, by: number): number =>
  Math.sqrt(dist2(ax, ay, bx, by));

/** Shortest signed angular difference, in radians, in (-PI, PI]. */
export const angleDelta = (from: number, to: number): number => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
};

/** True when `point` lies inside a cone of `halfAngle` radians centred on `facing` at the origin. */
export function inCone(
  ox: number,
  oy: number,
  facing: number,
  halfAngle: number,
  range: number,
  px: number,
  py: number,
): boolean {
  if (dist2(ox, oy, px, py) > range * range) return false;
  return Math.abs(angleDelta(facing, Math.atan2(py - oy, px - ox))) <= halfAngle;
}

/** Distance from point p to the segment a->b. Used for line-shaped skills. */
export function distToSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(ax, ay, px, py);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
  return dist(ax + t * dx, ay + t * dy, px, py);
}

/** FNV-1a over a string. Stable across platforms — used to derive seeds. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
