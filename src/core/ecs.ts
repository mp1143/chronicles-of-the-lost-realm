/**
 * Minimal ECS. ~200 LOC, no dependency.
 *
 * Design notes (TechnicalDesign §2):
 *  - Generational entity handles, so a stale handle fails `isAlive()` instead of
 *    silently addressing a recycled slot. This class of bug is otherwise very
 *    expensive to find in a game with pooled projectiles and creatures.
 *  - Destruction is deferred to `flush()` at the end of the tick, so a system
 *    never iterates a set that is mutating underneath it.
 *  - Queries are cached on the component signature and invalidated only on a
 *    structural change (add/remove/create/destroy). Steady state is allocation-free.
 *
 * ponytail: Map-based sparse component storage. Ceiling ~3k live entities per
 * tick before cache misses start to matter; upgrade path is archetype chunks or
 * bitECS behind this same façade. Not worth doing before a profiler says so.
 */

export type Entity = number;

const INDEX_BITS = 20;
const INDEX_MASK = (1 << INDEX_BITS) - 1;
export const MAX_ENTITIES = INDEX_MASK;

export const entityIndex = (e: Entity): number => e & INDEX_MASK;
export const entityGeneration = (e: Entity): number => e >>> INDEX_BITS;

export interface ComponentType<T> {
  readonly id: number;
  readonly name: string;
  /** Present only for typing; never read at runtime. */
  readonly _t?: T;
}

let nextComponentId = 0;

export function defineComponent<T>(name: string): ComponentType<T> {
  return { id: nextComponentId++, name };
}

export class World {
  private generations: number[] = [0];
  private alive: boolean[] = [false];
  private nextIndex = 1;
  private freeIndices: number[] = [];
  private stores = new Map<number, Map<number, unknown>>();
  private signatures: Set<number>[] = [new Set()];
  private queryCache = new Map<string, Entity[]>();
  private pendingDestroy: Entity[] = [];
  private structureVersion = 0;
  private cacheVersion = -1;

  create(): Entity {
    let index: number;
    if (this.freeIndices.length > 0) {
      index = this.freeIndices.pop()!;
    } else {
      index = this.nextIndex++;
      if (index > MAX_ENTITIES) throw new Error('ECS: entity limit exceeded');
      this.generations[index] = 0;
      this.signatures[index] = new Set();
    }
    this.alive[index] = true;
    this.signatures[index].clear();
    this.invalidate();
    return (index | (this.generations[index] << INDEX_BITS)) >>> 0;
  }

  isAlive(e: Entity): boolean {
    const i = entityIndex(e);
    return this.alive[i] === true && this.generations[i] === entityGeneration(e);
  }

  /** Queues the entity for removal; takes effect on the next `flush()`. */
  destroy(e: Entity): void {
    if (this.isAlive(e)) this.pendingDestroy.push(e);
  }

  add<T>(e: Entity, type: ComponentType<T>, value: T): T {
    if (!this.isAlive(e)) return value;
    const i = entityIndex(e);
    this.store(type.id).set(i, value);
    if (!this.signatures[i].has(type.id)) {
      this.signatures[i].add(type.id);
      this.invalidate();
    }
    return value;
  }

  get<T>(e: Entity, type: ComponentType<T>): T | undefined {
    if (!this.isAlive(e)) return undefined;
    return this.store(type.id).get(entityIndex(e)) as T | undefined;
  }

  /** Throws if absent. Use inside a query where the component is guaranteed. */
  need<T>(e: Entity, type: ComponentType<T>): T {
    const v = this.get(e, type);
    if (v === undefined) throw new Error(`ECS: entity ${e} is missing ${type.name}`);
    return v;
  }

  has(e: Entity, type: ComponentType<unknown>): boolean {
    return this.isAlive(e) && this.signatures[entityIndex(e)].has(type.id);
  }

  remove(e: Entity, type: ComponentType<unknown>): void {
    if (!this.isAlive(e)) return;
    const i = entityIndex(e);
    if (this.signatures[i].delete(type.id)) {
      this.store(type.id).delete(i);
      this.invalidate();
    }
  }

  /**
   * Entities holding every listed component. The returned array is cached and
   * reused — treat it as read-only and do not retain it across a `flush()`.
   */
  query(...types: ComponentType<any>[]): readonly Entity[] {
    if (this.cacheVersion !== this.structureVersion) {
      this.queryCache.clear();
      this.cacheVersion = this.structureVersion;
    }
    const key = types.map((t) => t.id).join(',');
    const cached = this.queryCache.get(key);
    if (cached) return cached;

    // Iterate the smallest store, not every entity.
    let smallest: Map<number, unknown> | null = null;
    for (const t of types) {
      const s = this.store(t.id);
      if (smallest === null || s.size < smallest.size) smallest = s;
    }
    const result: Entity[] = [];
    if (smallest) {
      for (const i of smallest.keys()) {
        if (!this.alive[i]) continue;
        const sig = this.signatures[i];
        let ok = true;
        for (const t of types) {
          if (!sig.has(t.id)) {
            ok = false;
            break;
          }
        }
        if (ok) result.push((i | (this.generations[i] << INDEX_BITS)) >>> 0);
      }
    }
    this.queryCache.set(key, result);
    return result;
  }

  /** Applies deferred destroys. Call once at the end of each tick. */
  flush(): void {
    if (this.pendingDestroy.length === 0) return;
    for (const e of this.pendingDestroy) {
      if (!this.isAlive(e)) continue;
      const i = entityIndex(e);
      for (const id of this.signatures[i]) this.store(id).delete(i);
      this.signatures[i].clear();
      this.alive[i] = false;
      this.generations[i] = (this.generations[i] + 1) & 0xfff;
      this.freeIndices.push(i);
    }
    this.pendingDestroy.length = 0;
    this.invalidate();
  }

  get entityCount(): number {
    let n = 0;
    for (let i = 1; i < this.nextIndex; i++) if (this.alive[i]) n++;
    return n;
  }

  private store(id: number): Map<number, unknown> {
    let s = this.stores.get(id);
    if (!s) {
      s = new Map();
      this.stores.set(id, s);
    }
    return s;
  }

  private invalidate(): void {
    this.structureVersion++;
  }
}
