import type { Game } from '../game';
import * as C from '../components';
import { STATUSES } from '../../content/statuses';
import { DOT_SOURCE_SCALE } from '../../core/config';
import { effectiveStat } from '../formula';

/**
 * Ticks damage-over-time, expires statuses, and arms the player's chain-lock
 * immunity window on expiry. One system handles all twelve statuses; the rules
 * live in content/statuses.ts.
 */
export function runStatus(game: Game, dt: number): void {
  for (const e of game.ecs.query(C.StatusEffects, C.Health)) {
    const st = game.ecs.need(e, C.StatusEffects);
    if (st.active.length === 0) continue;
    const hp = game.ecs.need(e, C.Health);

    for (let i = st.active.length - 1; i >= 0; i--) {
      const s = st.active[i];
      const def = STATUSES[s.id];

      if (def.dotPercentPerSec && hp.current > 0) {
        s.tickAcc += dt;
        // Tick at 2Hz rather than per-frame: fewer damage events, identical DPS,
        // and the floating numbers stay readable.
        if (s.tickAcc >= 0.5) {
          const ticks = Math.floor(s.tickAcc / 0.5);
          s.tickAcc -= ticks * 0.5;
          const seconds = 0.5 * ticks;
          const byTarget = hp.max * def.dotPercentPerSec * s.stacks * seconds;
          // See DOT_SOURCE_SCALE: unchanged on normal targets, capped on bosses.
          const dmg = Math.max(1, Math.round(Math.min(byTarget, dotCap(game, s.source, s.stacks, seconds))));
          hp.current -= dmg;
          game.bus.emit('DamageDealt', {
            source: s.source ?? e, target: e, amount: dmg, crit: false, threadMult: 1,
          });
        }
      }

      if (game.nowMs >= s.expiresAt) {
        st.active.splice(i, 1);
        if (e === game.player && def.playerImmunityMs) {
          st.immuneUntil[s.id] = game.nowMs + def.playerImmunityMs;
        }
      }
    }
  }
}

/** Per-tick DoT ceiling, derived from the applier's own offensive stat. */
function dotCap(game: Game, source: number | null, stacks: number, seconds: number): number {
  if (source === null) return Infinity;
  const stats = game.ecs.get(source, C.CombatStats);
  if (!stats) return Infinity;
  const power = Math.max(
    effectiveStat(stats, 'atk', game.nowMs),
    effectiveStat(stats, 'mag', game.nowMs),
  );
  return power * DOT_SOURCE_SCALE * stacks * seconds;
}

/** Aggregate multiplier from all active statuses for one stat. */
export function statusStatMultiplier(
  game: Game,
  e: number,
  stat: 'spd' | 'atk' | 'mag' | 'def' | 'res' | 'accuracy',
): number {
  const st = game.ecs.get(e, C.StatusEffects);
  if (!st) return 1;
  let mult = 1;
  for (const s of st.active) {
    const mod = STATUSES[s.id].modifiers?.[stat];
    if (mod) mult += mod * s.stacks;
  }
  return Math.max(0.1, mult);
}
