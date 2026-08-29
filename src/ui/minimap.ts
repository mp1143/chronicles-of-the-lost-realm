import type { Game } from '../sim/game';
import { TILES } from '../content/biomes';
import { SEA_LEVEL } from '../core/config';

/**
 * Shard map.
 *
 * Renders the whole Shard rather than a small window around the player — a map
 * you cannot navigate by is decoration. Terrain is shaded by elevation so
 * ridges, coastlines and rivers actually read.
 *
 * The terrain field is a pure function of the seed, so the base image is
 * computed once per Shard and cached; only the player and structure markers are
 * redrawn. Without the cache this is ~65k noise evaluations every time the
 * panel opens.
 */

const MAP_PX = 256;
const cache = new Map<string, ImageData>();

function shadeChannel(channel: number, light: number): number {
  return Math.max(0, Math.min(255, Math.round(channel * light)));
}

function baseImage(game: Game, ctx: CanvasRenderingContext2D): ImageData {
  const key = `${game.worldSeed}:${game.shard.shardId}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const img = ctx.createImageData(MAP_PX, MAP_PX);
  const step = game.shard.size / MAP_PX;

  for (let py = 0; py < MAP_PX; py++) {
    for (let px = 0; px < MAP_PX; px++) {
      const wx = Math.floor(px * step);
      const wy = Math.floor(py * step);
      const sample = game.shard.terrain.sample(wx, wy);
      const colour = TILES[sample.tile].colour;

      // Elevation shading: relief is what turns a colour blob into a map.
      // Below sea level, depth darkens instead.
      const light =
        sample.elevation < SEA_LEVEL
          ? 0.7 + (sample.elevation / SEA_LEVEL) * 0.3
          : 0.78 + ((sample.elevation - SEA_LEVEL) / (1 - SEA_LEVEL)) * 0.5;

      const i = (py * MAP_PX + px) * 4;
      img.data[i] = shadeChannel((colour >> 16) & 0xff, light);
      img.data[i + 1] = shadeChannel((colour >> 8) & 0xff, light);
      img.data[i + 2] = shadeChannel(colour & 0xff, light);
      img.data[i + 3] = 255;
    }
  }

  cache.set(key, img);
  return img;
}

/** Draws the map into a canvas sized MAP_PX square. */
export function drawMap(game: Game, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = MAP_PX;
  canvas.height = MAP_PX;

  ctx.putImageData(baseImage(game, ctx), 0, 0);

  const toMap = (x: number, y: number): [number, number] => [
    (x / game.shard.size) * MAP_PX,
    (y / game.shard.size) * MAP_PX,
  ];

  // Placed structures: the reason a player opens a map at all is to find home.
  ctx.fillStyle = '#e2c044';
  for (const s of game.shard.delta.structures) {
    const [mx, my] = toMap(s.x, s.y);
    ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
  }

  const pos = game.playerPos();
  if (!pos) return;
  const [px, py] = toMap(pos.x, pos.y);

  // Viewport box, so the player can tell how much of the map a screen covers.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  const viewTiles = 40;
  const viewPx = (viewTiles / game.shard.size) * MAP_PX;
  ctx.strokeRect(px - viewPx / 2, py - viewPx / 2, viewPx, viewPx);

  // Player marker: white cross on a dark ring, legible over any terrain colour.
  ctx.strokeStyle = '#0c0e14';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(px - 0.5, py - 7, 1, 4);
}

/** Called when a new game or a different Shard starts. */
export function clearMapCache(): void {
  cache.clear();
}
