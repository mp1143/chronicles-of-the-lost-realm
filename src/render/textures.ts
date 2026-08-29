import { Graphics, Texture, type Renderer } from 'pixi.js';
import { CREATURES, type SpriteSpec } from '../content/creatures';
import { BOSSES } from '../content/bosses';
import { HARVESTABLES, TILES, type TileId } from '../content/biomes';
import { STRUCTURES } from '../content/structures';
import { TILE_SIZE } from '../core/config';
import { SeededRNG } from '../core/rng';

/**
 * Procedural placeholder art.
 *
 * Every creature, node and structure is drawn from its data definition, so a
 * new content entry is playable the moment it is typed — no art dependency in
 * the loop. Production art replaces `textureFor` with an atlas lookup and
 * nothing else changes.
 *
 * Silhouette-first: each body type is a distinct black shape at 32px, which is
 * the actual readability requirement (GDD §15).
 */
export class TextureFactory {
  private cache = new Map<string, Texture>();

  constructor(private renderer: Renderer) {}

  get(key: string): Texture {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const tex = this.build(key);
    this.cache.set(key, tex);
    return tex;
  }

  private build(key: string): Texture {
    if (key === 'player') return this.fromSpec({ body: 'biped', crest: 'none', primary: 0xe8d9b5, accent: 0x4a7fc4, size: 0.35 });
    if (key === 'projectile') return this.circle(10, 0xffffff);
    if (key.startsWith('creature:')) {
      const def = CREATURES[key.slice(9)];
      return def ? this.fromSpec(def.sprite) : this.circle(12, 0xff00ff);
    }
    if (key.startsWith('boss:')) {
      const def = BOSSES[key.slice(5)];
      return def ? this.fromSpec(def.sprite) : this.circle(48, 0xff00ff);
    }
    if (key.startsWith('node:')) return this.node(key.slice(5));
    if (key.startsWith('structure:')) return this.structure(key.slice(10));
    if (key.startsWith('tile:')) return this.tile(key.slice(5) as TileId);
    return this.circle(12, 0xff00ff);
  }

  private render(g: Graphics): Texture {
    const tex = this.renderer.generateTexture({ target: g, resolution: 2 });
    g.destroy();
    return tex;
  }

  private circle(r: number, colour: number): Texture {
    const g = new Graphics();
    g.circle(r, r, r).fill(colour);
    return this.render(g);
  }

  private tile(id: TileId): Texture {
    const def = TILES[id] ?? TILES.grass;
    const g = new Graphics();
    g.rect(0, 0, TILE_SIZE, TILE_SIZE).fill(def.colour);
    return this.render(g);
  }

  /** Body + crest silhouette. The crest is what separates two same-body species. */
  private fromSpec(spec: SpriteSpec): Texture {
    const px = Math.max(16, Math.round(spec.size * TILE_SIZE * 2));
    const c = px / 2;
    const r = px * 0.38;
    const g = new Graphics();

    switch (spec.body) {
      case 'blob':
        g.ellipse(c, c + r * 0.15, r, r * 0.85).fill(spec.primary);
        break;
      case 'quad':
        g.ellipse(c, c + r * 0.1, r, r * 0.62).fill(spec.primary);
        g.circle(c + r * 0.7, c - r * 0.1, r * 0.42).fill(spec.primary);
        for (const dx of [-0.55, -0.15, 0.25, 0.6]) {
          g.rect(c + r * dx, c + r * 0.55, r * 0.2, r * 0.42).fill(spec.primary);
        }
        break;
      case 'biped':
        g.ellipse(c, c, r * 0.62, r * 0.86).fill(spec.primary);
        g.circle(c, c - r * 0.86, r * 0.44).fill(spec.primary);
        g.rect(c - r * 0.42, c + r * 0.7, r * 0.3, r * 0.5).fill(spec.primary);
        g.rect(c + r * 0.12, c + r * 0.7, r * 0.3, r * 0.5).fill(spec.primary);
        break;
      case 'serpent': {
        // A tapering S. Reads as "long thing" instantly at any size.
        for (let i = 0; i < 7; i++) {
          const t = i / 6;
          const x = c + Math.sin(t * Math.PI * 1.6) * r * 0.75;
          const y = c - r * 0.85 + t * r * 1.7;
          g.circle(x, y, r * (0.42 - t * 0.22)).fill(spec.primary);
        }
        break;
      }
      case 'insect':
        g.ellipse(c, c + r * 0.2, r * 0.55, r * 0.7).fill(spec.primary);
        g.circle(c, c - r * 0.55, r * 0.4).fill(spec.primary);
        for (const s of [-1, 1]) {
          for (const dy of [-0.2, 0.15, 0.5]) {
            g.rect(c + s * r * 0.5, c + r * dy, s * r * 0.45, r * 0.1).fill(spec.primary);
          }
        }
        break;
      case 'winged':
        g.ellipse(c, c, r * 0.42, r * 0.66).fill(spec.primary);
        g.ellipse(c - r * 0.8, c - r * 0.15, r * 0.6, r * 0.34).fill(spec.accent);
        g.ellipse(c + r * 0.8, c - r * 0.15, r * 0.6, r * 0.34).fill(spec.accent);
        g.circle(c, c - r * 0.7, r * 0.32).fill(spec.primary);
        break;
      case 'floating':
        g.circle(c, c - r * 0.1, r * 0.72).fill(spec.primary);
        for (let i = 0; i < 4; i++) {
          g.circle(c - r * 0.5 + i * r * 0.33, c + r * 0.7, r * 0.14).fill(spec.primary);
        }
        break;
      case 'plant':
        g.rect(c - r * 0.16, c, r * 0.32, r).fill(spec.primary);
        g.ellipse(c, c - r * 0.15, r * 0.8, r * 0.5).fill(spec.primary);
        break;
    }

    switch (spec.crest) {
      case 'horns':
        g.moveTo(c - r * 0.5, c - r * 0.8).lineTo(c - r * 0.85, c - r * 1.5).lineTo(c - r * 0.2, c - r * 0.95).fill(spec.accent);
        g.moveTo(c + r * 0.5, c - r * 0.8).lineTo(c + r * 0.85, c - r * 1.5).lineTo(c + r * 0.2, c - r * 0.95).fill(spec.accent);
        break;
      case 'antennae':
        g.rect(c - r * 0.45, c - r * 1.4, r * 0.08, r * 0.7).fill(spec.accent);
        g.rect(c + r * 0.37, c - r * 1.4, r * 0.08, r * 0.7).fill(spec.accent);
        break;
      case 'frill':
        for (let i = 0; i < 5; i++) {
          const a = Math.PI + (i / 4) * Math.PI;
          g.circle(c + Math.cos(a) * r * 0.9, c + Math.sin(a) * r * 0.9, r * 0.16).fill(spec.accent);
        }
        break;
      case 'wings':
        g.ellipse(c - r * 1.05, c - r * 0.3, r * 0.7, r * 0.28).fill(spec.accent);
        g.ellipse(c + r * 1.05, c - r * 0.3, r * 0.7, r * 0.28).fill(spec.accent);
        break;
      case 'spines':
        for (let i = 0; i < 4; i++) {
          const x = c - r * 0.6 + i * r * 0.4;
          g.moveTo(x, c - r * 0.5).lineTo(x + r * 0.12, c - r * 1.15).lineTo(x + r * 0.26, c - r * 0.5).fill(spec.accent);
        }
        break;
      case 'tail':
        g.ellipse(c - r * 0.95, c + r * 0.2, r * 0.45, r * 0.16).fill(spec.accent);
        break;
      case 'cap':
        g.ellipse(c, c - r * 0.5, r * 0.95, r * 0.45).fill(spec.accent);
        break;
      case 'halo':
        g.circle(c, c - r * 1.1, r * 0.5).stroke({ width: Math.max(2, r * 0.14), color: spec.accent });
        break;
      case 'none':
        break;
    }

    // Eyes: the cheapest possible "this is alive" signal.
    if (spec.body !== 'plant') {
      g.circle(c - r * 0.2, c - r * 0.45, r * 0.09).fill(0x14121a);
      g.circle(c + r * 0.2, c - r * 0.45, r * 0.09).fill(0x14121a);
    }
    return this.render(g);
  }

  private node(kind: string): Texture {
    const def = HARVESTABLES[kind];
    if (!def) return this.circle(12, 0xff00ff);
    const px = Math.max(20, Math.round(def.size * TILE_SIZE * 2.2));
    const c = px / 2;
    const r = px * 0.4;
    const g = new Graphics();
    const rng = new SeededRNG(kind, 'art');

    switch (def.shape) {
      case 'tree':
        g.rect(c - r * 0.16, c + r * 0.2, r * 0.32, r * 0.9).fill(def.accent);
        for (let i = 0; i < 3; i++) {
          g.circle(c + rng.float(-0.35, 0.35) * r, c - r * (0.1 + i * 0.28), r * (0.72 - i * 0.14)).fill(def.colour);
        }
        break;
      case 'bush':
        for (let i = 0; i < 4; i++) {
          g.circle(c + rng.float(-0.4, 0.4) * r, c + rng.float(-0.25, 0.3) * r, r * 0.5).fill(def.colour);
        }
        g.circle(c + r * 0.25, c - r * 0.1, r * 0.14).fill(def.accent);
        g.circle(c - r * 0.3, c + r * 0.2, r * 0.14).fill(def.accent);
        break;
      case 'rock':
        g.moveTo(c - r, c + r * 0.6)
          .lineTo(c - r * 0.55, c - r * 0.5)
          .lineTo(c + r * 0.15, c - r * 0.85)
          .lineTo(c + r, c + r * 0.1)
          .lineTo(c + r * 0.6, c + r * 0.75)
          .fill(def.colour);
        g.circle(c + r * 0.2, c - r * 0.2, r * 0.2).fill(def.accent);
        break;
      case 'crystal':
        g.moveTo(c, c - r * 1.1).lineTo(c + r * 0.5, c + r * 0.2).lineTo(c, c + r * 0.8).lineTo(c - r * 0.5, c + r * 0.2).fill(def.accent);
        g.moveTo(c - r * 0.7, c + r * 0.75).lineTo(c - r * 0.4, c - r * 0.2).lineTo(c - r * 0.1, c + r * 0.8).fill(def.colour);
        break;
    }
    return this.render(g);
  }

  private structure(id: string): Texture {
    const def = STRUCTURES[id];
    if (!def) return this.circle(16, 0xff00ff);
    const w = def.w * TILE_SIZE;
    const h = def.h * TILE_SIZE;
    const g = new Graphics();
    g.roundRect(0, 0, w, h, 4).fill(def.colour);
    g.roundRect(w * 0.15, h * 0.15, w * 0.7, h * 0.7, 3).fill(def.accent);
    if (def.lightRadius) g.circle(w / 2, h / 2, Math.min(w, h) * 0.22).fill(0xfff0c0);
    return this.render(g);
  }

  destroy(): void {
    for (const t of this.cache.values()) t.destroy(true);
    this.cache.clear();
  }
}
