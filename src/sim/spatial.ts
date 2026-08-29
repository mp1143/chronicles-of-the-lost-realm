import type { Entity } from '../core/ecs';

/**
 * Uniform spatial hash over 4x4-tile cells. Rebuilt each tick from the entity
 * query — cheaper than incremental maintenance at our entity counts, and it
 * cannot drift out of sync with the ECS, which incremental versions always do.
 *
 * ponytail: no physics library. The game has no rigid bodies, no joints and no
 * stacking; a broadphase plus `distanceSquared < r*r` is the entire requirement.
 */
export const CELL = 4;

export class SpatialHash {
  private cells = new Map<number, Entity[]>();
  private pool: Entity[][] = [];

  clear(): void {
    for (const arr of this.cells.values()) {
      arr.length = 0;
      this.pool.push(arr);
    }
    this.cells.clear();
  }

  insert(e: Entity, x: number, y: number): void {
    const key = SpatialHash.key(x, y);
    let arr = this.cells.get(key);
    if (!arr) {
      arr = this.pool.pop() ?? [];
      this.cells.set(key, arr);
    }
    arr.push(e);
  }

  /** Entities in cells overlapping the circle. Caller still does the exact test. */
  queryCircle(x: number, y: number, radius: number, out: Entity[]): Entity[] {
    out.length = 0;
    const minX = Math.floor((x - radius) / CELL);
    const maxX = Math.floor((x + radius) / CELL);
    const minY = Math.floor((y - radius) / CELL);
    const maxY = Math.floor((y + radius) / CELL);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const arr = this.cells.get(SpatialHash.cellKey(cx, cy));
        if (!arr) continue;
        for (const e of arr) out.push(e);
      }
    }
    return out;
  }

  private static key(x: number, y: number): number {
    return SpatialHash.cellKey(Math.floor(x / CELL), Math.floor(y / CELL));
  }

  /** Pairs into a single number; the +512 offset keeps negative coords distinct. */
  private static cellKey(cx: number, cy: number): number {
    return ((cx + 512) << 12) | ((cy + 512) & 0xfff);
  }
}
