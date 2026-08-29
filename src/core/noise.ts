import type { SeededRNG } from './rng';
import { smoothstep } from './math';

/**
 * 2D gradient (Perlin-style) noise with a seeded permutation table, plus fBm.
 *
 * Hand-rolled rather than pulled from npm: the library versions are ~40 lines of
 * real logic each, and we need the permutation table to be derived from *our*
 * RNG so that world generation is reproducible from a save seed alone.
 */

const GRAD = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
] as const;

export class Noise2D {
  private perm: Uint8Array;

  constructor(rng: SeededRNG) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = rng.int(0, i);
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    // Doubled so lookups can index up to 511 without a modulo in the hot path.
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  /** Single octave, output in roughly [-1, 1]. */
  sample(x: number, y: number): number {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = smoothstep(xf);
    const v = smoothstep(yf);

    const aa = this.perm[this.perm[xi] + yi] & 7;
    const ab = this.perm[this.perm[xi] + yi + 1] & 7;
    const ba = this.perm[this.perm[xi + 1] + yi] & 7;
    const bb = this.perm[this.perm[xi + 1] + yi + 1] & 7;

    const d = (g: readonly number[], dx: number, dy: number): number => g[0] * dx + g[1] * dy;

    const x1 = lerp(d(GRAD[aa], xf, yf), d(GRAD[ba], xf - 1, yf), u);
    const x2 = lerp(d(GRAD[ab], xf, yf - 1), d(GRAD[bb], xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  }

  /** Fractional Brownian motion. Output normalised to [0, 1]. */
  fbm(x: number, y: number, octaves: number, frequency: number, persistence = 0.5): number {
    let total = 0;
    let amp = 1;
    let freq = frequency;
    let maxAmp = 0;
    for (let i = 0; i < octaves; i++) {
      total += this.sample(x * freq, y * freq) * amp;
      maxAmp += amp;
      amp *= persistence;
      freq *= 2;
    }
    return (total / maxAmp) * 0.5 + 0.5;
  }

  /** Ridged variant — good for mountain spines and cave walls. */
  ridged(x: number, y: number, octaves: number, frequency: number): number {
    let total = 0;
    let amp = 1;
    let freq = frequency;
    let maxAmp = 0;
    for (let i = 0; i < octaves; i++) {
      total += (1 - Math.abs(this.sample(x * freq, y * freq))) * amp;
      maxAmp += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return total / maxAmp;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
