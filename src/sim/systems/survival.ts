import type { Game } from '../game';
import * as C from '../components';
import { HUNGER_DRAIN } from '../../core/config';
import { BIOMES } from '../../content/biomes';
import { getCreature } from '../../content/creatures';

/**
 * Hunger, Warmth and Sanity.
 *
 * These exist to shape route planning, not to nag. Hunger drains slowly and
 * zero Hunger caps max health at 50% — it never kills you outright. A survival
 * meter that can kill a player who is otherwise winning is a punishment
 * mechanic, not a design one.
 */
export function runSurvival(game: Game, dt: number): void {
  const s = game.ecs.get(game.player, C.Survival);
  const hp = game.ecs.get(game.player, C.Health);
  const pos = game.playerPos();
  if (!s || !hp || !pos) return;

  s.hunger = Math.max(0, s.hunger - HUNGER_DRAIN * dt);

  const biome = BIOMES[game.shard.biomeAt(pos.x, pos.y)];
  let warmthDrain = biome.warmthDrain;
  // A Snowquill-line companion is the intended answer to Frostspire.
  for (const e of game.activePartyEntities()) {
    const inst = game.ecs.get(e, C.CreatureInstance);
    if (inst && getCreature(inst.creatureId).trait.id === 'warmcoat') {
      warmthDrain *= 0.6;
      break;
    }
  }
  if (game.isNight) warmthDrain += 0.15;
  s.warmth = Math.max(0, Math.min(s.warmthMax, s.warmth - warmthDrain * dt));

  // Sanity only drains in the dark places, and light stops it.
  const dark = biome.ambientLight < 0.4;
  s.sanity = dark
    ? Math.max(0, s.sanity - 0.3 * dt)
    : Math.min(s.sanityMax, s.sanity + 1.2 * dt);

  // Effects. Capping max HP is the whole penalty for starving.
  const player = game.ecs.get(game.player, C.PlayerTag);
  const baseMax = 100 + (player?.attributes.vigor ?? 5) * 8 + ((player?.level ?? 1) - 1) * 6;
  const hungerPenalty = s.hunger <= 0 ? 0.5 : s.hunger < 20 ? 0.8 : 1;
  const coldPenalty = s.warmth <= 0 ? 0.7 : s.warmth < 25 ? 0.9 : 1;
  hp.max = Math.round(baseMax * hungerPenalty * coldPenalty);
  hp.current = Math.min(hp.current, hp.max);

  const stats = game.ecs.get(game.player, C.CombatStats);
  if (stats) {
    // Freezing slows you down; that is the pressure, not damage.
    stats.spd = 5.2 * (s.warmth <= 0 ? 0.7 : 1);
  }
}
