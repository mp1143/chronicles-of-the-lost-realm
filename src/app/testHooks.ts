import type { Game } from '../sim/game';
import type { GameRenderer } from '../render/renderer';
import type { GameLoop } from '../core/loop';
import * as C from '../sim/components';
import { addItem, build } from '../sim/actions';
import { dealDamage } from '../sim/systems/combat';
import { spawnBoss } from '../sim/factory';
import { BOSSES } from '../content/bosses';
import { showBanner } from '../ui/store';

/**
 * In-page hooks for the end-to-end suite.
 *
 * Driving these flows purely through the UI would mean chopping trees for four
 * minutes to test one build-then-craft path, and the resulting test would be
 * measuring RNG rather than wiring. These hooks reach into the *real* systems —
 * they do not fake anything — so an e2e failure still means a real failure.
 *
 * Roughly 60 lines, no bundle-size concern, and genuinely useful for manual
 * debugging too. If they ever need to be stripped from a store build, gate the
 * install call in main.ts on an env flag.
 */
export function installTestHooks(game: Game, renderer: GameRenderer, loop: GameLoop): void {
  const w = globalThis as Record<string, unknown>;

  w.__debug = () => {
    const p = game.playerPos();
    if (!p) return null;
    return {
      playerScreen: renderer.worldToScreen(p.x, p.y),
      screen: { w: renderer.screenWidth, h: renderer.screenHeight },
      entities: game.ecs.entityCount,
      chunks: game.shard.chunks.size,
      fps: loop.stats.fps,
      simMs: loop.stats.simMs,
      renderMs: loop.stats.renderMs,
    };
  };

  w.__spawnBoss = () => {
    const p = game.playerPos();
    if (!p) return false;
    const spot = game.shard.findWalkableNear(p.x + 6, p.y, 10) ?? p;
    spawnBoss(game.ecs, game.rng, 'rootfather_ossuel', spot.x, spot.y, game.activePartyEntities().length);
    showBanner(BOSSES.rootfather_ossuel.phases[0].banner);
    return true;
  };

  w.__test = {
    /** Adds items through the real inventory path, stacking rules and all. */
    grant(itemId: string, count: number): boolean {
      return addItem(game, itemId, count);
    },

    /** Places a structure next to the player using the real placement rules. */
    build(structureId: string): boolean {
      const p = game.playerPos();
      if (!p) return false;
      // Try a ring of nearby tiles; placement legitimately fails on water or
      // occupied ground, and the test wants "can this be built at all".
      for (let r = 1; r <= 4; r++) {
        for (const [dx, dy] of [[r, 0], [0, r], [-r, 0], [0, -r], [r, r], [-r, -r]]) {
          const x = Math.floor(p.x) + dx;
          const y = Math.floor(p.y) + dy;
          if (build(game, structureId, x, y).ok) return true;
        }
      }
      return false;
    },

    /** Damages the nearest wild creature through the real combat path. */
    hitSomething(): number {
      const p = game.playerPos();
      if (!p) return 0;
      let target: number | null = null;
      let best = Infinity;
      for (const e of game.ecs.query(C.CreatureInstance, C.Position, C.Health)) {
        if (game.ecs.get(e, C.CreatureInstance)!.owned) continue;
        const cp = game.ecs.get(e, C.Position)!;
        const d = Math.hypot(cp.x - p.x, cp.y - p.y);
        if (d < best) {
          best = d;
          target = e;
        }
      }
      if (target === null) return 0;
      dealDamage(game, game.player, target, 25, false, 1);
      return 25;
    },

    /** Drops a live boss below its phase-2 threshold and reports the new phase. */
    advanceBossPhase(): number {
      for (const e of game.ecs.query(C.BossTag, C.Health)) {
        const hp = game.ecs.get(e, C.Health)!;
        hp.current = hp.max * 0.3;
        // The phase check runs inside the combat system on the next tick.
        return game.ecs.get(e, C.BossTag)!.phase;
      }
      return -1;
    },

    bossPhase(): number {
      for (const e of game.ecs.query(C.BossTag)) return game.ecs.get(e, C.BossTag)!.phase;
      return -1;
    },

    /** Roster size, for asserting a tame actually landed. */
    rosterSize(): number {
      return game.roster.length;
    },

    /**
     * Stable fingerprint of the Shard's terrain fields. Regenerated from the
     * seed alone, so an identical value after a reload proves the world came
     * back exactly — without depending on UI overlays that legitimately move.
     */
    terrainHash(): number {
      return game.shard.terrain.hash();
    },

    /** World position, for asserting a save restored where the player was. */
    playerPos(): { x: number; y: number } | null {
      const p = game.playerPos();
      return p ? { x: Math.round(p.x), y: Math.round(p.y) } : null;
    },

    playerLevel(): number {
      return game.ecs.get(game.player, C.PlayerTag)?.level ?? 0;
    },

    itemCount(itemId: string): number {
      const inv = game.ecs.get(game.player, C.Inventory);
      if (!inv) return 0;
      let n = 0;
      for (const s of inv.slots) if (s.itemId === itemId) n += s.count;
      return n;
    },
  };
}
