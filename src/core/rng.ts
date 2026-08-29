import { hashString } from './math';

/**
 * xoshiro128** — deterministic, fast, well-distributed 32-bit PRNG.
 *
 * Determinism is load-bearing for this project: the save file stores a seed and
 * deltas rather than world data (TechnicalDesign §3.2), so identical seed must
 * always mean identical world. `Math.random` is banned everywhere in src/.
 *
 * `fork()` derives an independent substream. Every subsystem gets its own, so
 * adding a resource type cannot shift the terrain of an existing save.
 */
export class SeededRNG {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;
  readonly streamId: string;
  /** The seed this stream was constructed from. `fork()` derives from this, never from live
   *  state, so the order in which subsystems draw numbers cannot affect one another. */
  private readonly rootSeed: number;

  constructor(seed: string | number, streamId = 'root') {
    this.streamId = streamId;
    let h = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
    this.rootSeed = h;
    // splitmix32 to spread a single seed across the four state words.
    const mix = (): number => {
      h = (h + 0x9e3779b9) >>> 0;
      let z = h;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
      return (z ^ (z >>> 15)) >>> 0;
    };
    this.s0 = mix();
    this.s1 = mix();
    this.s2 = mix();
    this.s3 = mix();
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1; // all-zero state is a fixed point
  }

  /** Raw 32-bit unsigned output. */
  nextUint(): number {
    const r = Math.imul(this.s1, 5);
    const result = Math.imul((r << 7) | (r >>> 25), 9) >>> 0;
    const t = this.s1 << 9;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = ((this.s3 << 11) | (this.s3 >>> 21)) >>> 0;
    return result;
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.nextUint() / 4294967296;
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max < min) return min;
    return min + (this.nextUint() % (max - min + 1));
  }

  /** Uniform float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  bool(chance = 0.5): boolean {
    return this.next() < chance;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Weighted pick. Weights need not sum to 1. Returns the last entry if all weights are 0. */
  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
    let total = 0;
    for (const [, w] of entries) total += w > 0 ? w : 0;
    if (total <= 0) return entries[entries.length - 1][0];
    let roll = this.next() * total;
    for (const [value, w] of entries) {
      if (w <= 0) continue;
      roll -= w;
      if (roll <= 0) return value;
    }
    return entries[entries.length - 1][0];
  }

  /** In-place Fisher-Yates. Deterministic given the stream. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /** Independent substream, derived from the seed identity (see `rootSeed`). */
  fork(streamId: string): SeededRNG {
    const combined = (this.rootSeed ^ hashString(`${this.streamId}/${streamId}`)) >>> 0;
    return new SeededRNG(combined, `${this.streamId}/${streamId}`);
  }

  /** Snapshot/restore for save files that need to resume a live stream. */
  getState(): [number, number, number, number] {
    return [this.s0, this.s1, this.s2, this.s3];
  }

  setState(s: readonly [number, number, number, number]): void {
    this.s0 = s[0] >>> 0;
    this.s1 = s[1] >>> 0;
    this.s2 = s[2] >>> 0;
    this.s3 = s[3] >>> 0;
  }
}

/** Convenience: a stream derived from (worldSeed, shardId, purpose). */
export function shardStream(worldSeed: string, shardId: string, purpose: string): SeededRNG {
  return new SeededRNG(`${worldSeed}:${shardId}`, shardId).fork(purpose);
}
