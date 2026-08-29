import { Application, Container, Graphics, Sprite, Text, TextStyle, type Renderer as PixiRenderer } from 'pixi.js';
import type { Entity } from '../core/ecs';
import type { Game } from '../sim/game';
import * as C from '../sim/components';
import { TILE_SIZE, CHUNK_SIZE } from '../core/config';
import { TILES } from '../content/biomes';
import { TILE_PALETTE } from '../world/chunk';
import { getSkill } from '../content/skills';
import { THREAD_COLOR } from '../content/threads';
import { TextureFactory } from './textures';
import { SeededRNG } from '../core/rng';

/**
 * Presentation. Reads the ECS, never writes it.
 *
 * Two techniques carry the frame budget:
 *  - chunk tilemaps are baked into one Sprite each, so the ground costs ~40
 *    draw calls regardless of world size;
 *  - entity sprites are pooled and interpolated between sim states, so a 30Hz
 *    simulation renders as 60fps motion.
 */

/** See bakeChunk: ground tiles are flat colour, so half resolution is lossless. */
const CHUNK_TEXTURE_SCALE = 0.5;

interface FloatingText {
  text: Text;
  vy: number;
  life: number;
}

export class GameRenderer {
  app!: Application;
  private textures!: TextureFactory;
  private world = new Container();
  private groundLayer = new Container();
  private entityLayer = new Container();
  private airLayer = new Container();
  private fxLayer = new Container();
  private nameLayer = new Container();

  private chunkSprites = new Map<string, Sprite>();
  private entitySprites = new Map<Entity, Sprite>();
  private healthBars = new Map<Entity, Graphics>();
  private nameplates = new Map<Entity, Text>();
  private floating: FloatingText[] = [];
  private telegraphs = new Graphics();
  private nightOverlay = new Graphics();

  /** Camera in world (tile) coordinates. */
  camX = 0;
  camY = 0;
  zoom = 1;

  /** Adaptive quality: dropped in steps when the frame budget is missed. */
  quality: 1 | 0.85 | 0.75 = 1;

  async init(host: HTMLElement): Promise<void> {
    this.app = new Application();
    await this.app.init({
      background: 0x0c0e14,
      antialias: false,
      resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
      autoDensity: true,
      resizeTo: host,
      preference: 'webgl',
    });
    host.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = 'none';

    this.textures = new TextureFactory(this.app.renderer as PixiRenderer);
    this.world.addChild(this.groundLayer, this.entityLayer, this.airLayer, this.fxLayer, this.nameLayer);
    this.fxLayer.addChild(this.telegraphs);
    this.app.stage.addChild(this.world, this.nightOverlay);
    // Sim owns update order; Pixi's ticker would double-drive it.
    this.app.ticker.stop();
  }

  /**
   * Renderer width/height are already in the stage's coordinate space (CSS
   * pixels); `resolution` only scales the backing canvas. Dividing by it here
   * was silently offsetting the camera on every device with a resolution other
   * than 1 — which is every phone.
   */
  get screenWidth(): number {
    return this.app.renderer.width;
  }

  get screenHeight(): number {
    return this.app.renderer.height;
  }

  /** World tile coordinates -> screen pixels. */
  worldToScreen(x: number, y: number): { x: number; y: number } {
    const scale = TILE_SIZE * this.zoom;
    return {
      x: (x - this.camX) * scale + this.screenWidth / 2,
      y: (y - this.camY) * scale + this.screenHeight / 2,
    };
  }

  screenToWorld(x: number, y: number): { x: number; y: number } {
    const scale = TILE_SIZE * this.zoom;
    return {
      x: (x - this.screenWidth / 2) / scale + this.camX,
      y: (y - this.screenHeight / 2) / scale + this.camY,
    };
  }

  render(game: Game, alpha: number): void {
    const p = game.playerPos();
    if (p) {
      const ix = p.px + (p.x - p.px) * alpha;
      const iy = p.py + (p.y - p.py) * alpha;
      // Light camera smoothing; snapping to the player reads as jittery.
      this.camX += (ix - this.camX) * 0.18;
      this.camY += (iy - this.camY) * 0.18;
    }

    const scale = TILE_SIZE * this.zoom;
    this.world.scale.set(this.zoom);
    this.world.position.set(
      -this.camX * scale + this.screenWidth / 2,
      -this.camY * scale + this.screenHeight / 2,
    );

    this.syncChunks(game);
    this.syncEntities(game, alpha);
    this.drawTelegraphs(game);
    this.tickFloating();
    this.drawNight(game);

    this.app.renderer.render(this.app.stage);
  }

  // ---------- ground ----------

  private syncChunks(game: Game): void {
    for (const [key, chunk] of game.shard.chunks) {
      if (this.chunkSprites.has(key)) continue;
      const sprite = this.bakeChunk(game, chunk.cx, chunk.cy, chunk.tiles);
      this.chunkSprites.set(key, sprite);
      this.groundLayer.addChild(sprite);
    }
    for (const [key, sprite] of this.chunkSprites) {
      if (game.shard.chunks.has(key)) continue;
      sprite.destroy({ texture: true });
      this.chunkSprites.delete(key);
      this.groundLayer.removeChild(sprite);
    }
  }

  /**
   * Bakes one chunk into a single texture. Per-tile colour variance is derived
   * from a seeded RNG so a chunk looks identical every time it is re-baked.
   *
   * Baked at half resolution: a chunk is 32x32 tiles of 32px flat colour, so at
   * 1024x1024 RGBA it cost 4MB, and 49 resident chunks came to ~200MB — over
   * half the entire mobile memory budget, for flat squares. At 0.5 with nearest
   * filtering each tile is exactly 16px and upscales back 2x with no visible
   * difference, for a quarter of the memory.
   */
  private bakeChunk(game: Game, cx: number, cy: number, tiles: Uint8Array): Sprite {
    const g = new Graphics();
    const rng = new SeededRNG(`${game.worldSeed}:tint:${cx},${cy}`);
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const def = TILES[TILE_PALETTE[tiles[ly * CHUNK_SIZE + lx]]];
        const v = 1 + (rng.next() - 0.5) * def.variance * 2;
        const r = Math.min(255, Math.round(((def.colour >> 16) & 0xff) * v));
        const gr = Math.min(255, Math.round(((def.colour >> 8) & 0xff) * v));
        const b = Math.min(255, Math.round((def.colour & 0xff) * v));
        g.rect(lx * TILE_SIZE, ly * TILE_SIZE, TILE_SIZE, TILE_SIZE).fill((r << 16) | (gr << 8) | b);
      }
    }
    const tex = this.app.renderer.generateTexture({ target: g, resolution: CHUNK_TEXTURE_SCALE });
    // Nearest: linear filtering would bleed neighbouring tile colours across
    // every boundary once the texture is scaled back up.
    tex.source.scaleMode = 'nearest';
    g.destroy();
    const sprite = new Sprite(tex);
    sprite.position.set(cx * CHUNK_SIZE * TILE_SIZE, cy * CHUNK_SIZE * TILE_SIZE);
    sprite.width = CHUNK_SIZE * TILE_SIZE;
    sprite.height = CHUNK_SIZE * TILE_SIZE;
    return sprite;
  }

  // ---------- entities ----------

  private syncEntities(game: Game, alpha: number): void {
    const seen = new Set<Entity>();
    const halfW = this.screenWidth / (2 * TILE_SIZE * this.zoom) + 2;
    const halfH = this.screenHeight / (2 * TILE_SIZE * this.zoom) + 2;

    for (const e of game.ecs.query(C.Position, C.Renderable)) {
      const pos = game.ecs.need(e, C.Position);
      // Cull before doing any work: off-screen entities cost nothing.
      if (Math.abs(pos.x - this.camX) > halfW || Math.abs(pos.y - this.camY) > halfH) continue;
      seen.add(e);

      const rend = game.ecs.need(e, C.Renderable);
      let sprite = this.entitySprites.get(e);
      if (!sprite) {
        sprite = new Sprite(this.textures.get(rend.textureKey));
        sprite.anchor.set(0.5, 0.62);
        this.layerFor(rend.layer).addChild(sprite);
        this.entitySprites.set(e, sprite);
      }
      const wanted = this.textures.get(rend.textureKey);
      if (sprite.texture !== wanted) sprite.texture = wanted;

      const ix = pos.px + (pos.x - pos.px) * alpha;
      const iy = pos.py + (pos.y - pos.py) * alpha;
      sprite.position.set(ix * TILE_SIZE, iy * TILE_SIZE);
      sprite.tint = rend.tint;

      // Hit flash: red while a status is ticking, so damage is legible without HUD.
      const st = game.ecs.get(e, C.StatusEffects);
      if (st && st.active.length > 0) {
        sprite.tint = 0xffaaaa;
      }

      this.syncHealthBar(game, e, ix, iy);
      this.syncNameplate(game, e, ix, iy);
    }

    for (const [e, sprite] of this.entitySprites) {
      if (seen.has(e)) continue;
      sprite.destroy();
      this.entitySprites.delete(e);
      this.healthBars.get(e)?.destroy();
      this.healthBars.delete(e);
      this.nameplates.get(e)?.destroy();
      this.nameplates.delete(e);
    }
  }

  private layerFor(layer: C.Renderable['layer']): Container {
    switch (layer) {
      case 'ground': return this.groundLayer;
      case 'air': return this.airLayer;
      case 'fx': return this.fxLayer;
      default: return this.entityLayer;
    }
  }

  private syncHealthBar(game: Game, e: Entity, x: number, y: number): void {
    const hp = game.ecs.get(e, C.Health);
    const rend = game.ecs.get(e, C.Renderable);
    if (!hp || !rend || e === game.player || hp.current >= hp.max) {
      const existing = this.healthBars.get(e);
      if (existing) {
        existing.destroy();
        this.healthBars.delete(e);
      }
      return;
    }
    let bar = this.healthBars.get(e);
    if (!bar) {
      bar = new Graphics();
      this.nameLayer.addChild(bar);
      this.healthBars.set(e, bar);
    }
    const w = Math.max(20, rend.radius * TILE_SIZE * 1.6);
    const frac = Math.max(0, hp.current / hp.max);
    const friendly = game.ecs.get(e, C.FactionTag)?.value === 'player';
    bar.clear();
    bar.rect(-w / 2, 0, w, 4).fill(0x1a1620);
    bar.rect(-w / 2, 0, w * frac, 4).fill(friendly ? 0x6fd49a : 0xd4544a);
    bar.position.set(x * TILE_SIZE, (y - rend.radius - 0.5) * TILE_SIZE);
  }

  private syncNameplate(game: Game, e: Entity, x: number, y: number): void {
    const plate = game.ecs.get(e, C.Nameplate);
    const rend = game.ecs.get(e, C.Renderable);
    // Only label what is close enough to act on, plus anything wounded or huge.
    // A screen of thirty overlapping labels is noise, not information.
    const hp = game.ecs.get(e, C.Health);
    const interesting =
      rend !== undefined &&
      (rend.radius > 1 ||
        (hp !== undefined && hp.current < hp.max) ||
        Math.hypot(x - this.camX, y - this.camY) < 9);
    if (!plate || !rend || !interesting) {
      const stale = this.nameplates.get(e);
      if (stale) {
        stale.destroy();
        this.nameplates.delete(e);
      }
      return;
    }
    let text = this.nameplates.get(e);
    if (!text) {
      text = new Text({
        text: '',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: 0xd8d4e0 }),
      });
      text.anchor.set(0.5, 1);
      this.nameLayer.addChild(text);
      this.nameplates.set(e, text);
    }
    const label = `${plate.text} ${plate.level}`;
    if (text.text !== label) text.text = label;
    text.position.set(x * TILE_SIZE, (y - rend.radius - 0.75) * TILE_SIZE);
  }

  // ---------- fx ----------

  /**
   * Draws the danger telegraph for anything currently casting. Shape language,
   * not colour alone — the outline is the readable signal for colourblind
   * players, and the fill is only a reinforcement.
   */
  private drawTelegraphs(game: Game): void {
    this.telegraphs.clear();
    for (const e of game.ecs.query(C.Casting, C.Position)) {
      const cast = game.ecs.need(e, C.Casting);
      if (cast.telegraphLeft <= 0) continue;
      const pos = game.ecs.need(e, C.Position);
      const skill = getSkill(cast.skillId);
      const colour = THREAD_COLOR[skill.thread];
      const angle = Math.atan2(cast.aimY - pos.y, cast.aimX - pos.x);
      const px = pos.x * TILE_SIZE;
      const py = pos.y * TILE_SIZE;
      const g = this.telegraphs;

      switch (skill.shape.type) {
        case 'line': {
          const len = skill.shape.length * TILE_SIZE;
          const wide = skill.shape.width * TILE_SIZE;
          g.moveTo(px, py)
            .lineTo(px + Math.cos(angle) * len, py + Math.sin(angle) * len)
            .stroke({ width: wide, color: colour, alpha: 0.28 });
          break;
        }
        case 'circle': {
          const d = Math.min(Math.hypot(cast.aimX - pos.x, cast.aimY - pos.y), skill.shape.range);
          const cx = px + Math.cos(angle) * d * TILE_SIZE;
          const cy = py + Math.sin(angle) * d * TILE_SIZE;
          g.circle(cx, cy, skill.shape.radius * TILE_SIZE).fill({ color: colour, alpha: 0.16 });
          g.circle(cx, cy, skill.shape.radius * TILE_SIZE).stroke({ width: 3, color: colour, alpha: 0.8 });
          break;
        }
        case 'self':
          g.circle(px, py, skill.shape.radius * TILE_SIZE).stroke({ width: 3, color: colour, alpha: 0.7 });
          break;
        case 'melee':
          g.circle(px, py, skill.shape.range * TILE_SIZE).stroke({ width: 2, color: colour, alpha: 0.4 });
          break;
        default:
          break;
      }
    }
  }

  /** Damage numbers. Subscribed to the event bus, never called from the sim. */
  spawnFloatingText(x: number, y: number, label: string, colour: number, big = false): void {
    if (this.floating.length > 40) return; // hard cap: readability and cost
    const text = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: big ? 18 : 13,
        fill: colour,
        stroke: { color: 0x0c0e14, width: 3 },
      }),
    });
    text.anchor.set(0.5, 1);
    text.position.set(x * TILE_SIZE, y * TILE_SIZE);
    this.fxLayer.addChild(text);
    this.floating.push({ text, vy: -0.8, life: 1 });
  }

  private tickFloating(): void {
    for (let i = this.floating.length - 1; i >= 0; i--) {
      const f = this.floating[i];
      f.text.y += f.vy;
      f.vy *= 0.94;
      f.life -= 0.02;
      f.text.alpha = Math.max(0, f.life);
      if (f.life <= 0) {
        f.text.destroy();
        this.floating.splice(i, 1);
      }
    }
  }

  /** Day/night as a graded overlay rather than a colour multiply on every sprite. */
  private drawNight(game: Game): void {
    const darkness = (1 - game.daylight) * 0.62;
    this.nightOverlay.clear();
    if (darkness <= 0.02) return;
    this.nightOverlay.rect(0, 0, this.screenWidth, this.screenHeight).fill({ color: 0x0a0d1c, alpha: darkness });
  }

  /**
   * Adaptive quality. Degrades in fixed steps when the rolling frame average
   * misses budget, and never touches gameplay-critical clarity.
   */
  applyQuality(fps: number): void {
    const next = fps < 45 ? 0.75 : fps < 55 ? 0.85 : 1;
    if (next === this.quality) return;
    this.quality = next as 1 | 0.85 | 0.75;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    // Must go through resize(), not a bare resolution assignment: the latter
    // leaves renderer.width/height stale, which desyncs worldToScreen and
    // visibly pushes the camera off-centre.
    this.app.renderer.resize(this.screenWidth, this.screenHeight, dpr * this.quality);
  }

  destroy(): void {
    this.textures.destroy();
    this.app.destroy(true, { children: true, texture: true });
  }
}
