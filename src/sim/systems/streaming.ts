import type { Game } from '../game';
import * as C from '../components';
import { dist2 } from '../../core/math';
import { HARVESTABLES } from '../../content/biomes';
import { spawnCreature, spawnHarvestNode } from '../factory';

/**
 * Instantiates entities for chunk contents near the player and despawns them
 * again when they fall out of range. The chunk data is the source of truth; the
 * entities are a view of it, which is why despawning is free and why a save
 * never has to serialise a single wild creature.
 */

const SPAWN_RANGE = 34;
const DESPAWN_RANGE = 46;

export function runStreaming(game: Game, _dt: number): void {
  const pos = game.playerPos();
  if (!pos) return;
  const { liveNodes, liveSpawns } = game;

  // --- spawn in ---
  for (const chunk of game.shard.chunks.values()) {
    for (const node of chunk.nodes) {
      if (liveNodes.has(node.id)) continue;
      if (dist2(pos.x, pos.y, node.x, node.y) > SPAWN_RANGE * SPAWN_RANGE) continue;
      if (game.shard.isHarvested(node.id, game.nowMs)) continue;
      if (!HARVESTABLES[node.kind]) continue;
      liveNodes.set(node.id, spawnHarvestNode(game.ecs, node.id, node.kind, node.x, node.y));
    }
    for (const spawn of chunk.spawns) {
      if (liveSpawns.has(spawn.id)) continue;
      if (dist2(pos.x, pos.y, spawn.x, spawn.y) > SPAWN_RANGE * SPAWN_RANGE) continue;
      if (game.shard.isKilled(spawn.id, game.nowMs)) continue;
      const e = spawnCreature(
        game.ecs,
        game.rng.fork(spawn.id),
        spawn.creatureId,
        spawn.level,
        spawn.x,
        spawn.y,
        { spawnId: spawn.id },
      );
      liveSpawns.set(spawn.id, e);
      game.discoveredCreatures.add(spawn.creatureId);
    }
  }

  // --- despawn out ---
  for (const [id, e] of liveNodes) {
    if (!game.ecs.isAlive(e)) {
      liveNodes.delete(id);
      continue;
    }
    const p = game.ecs.get(e, C.Position);
    if (!p || dist2(pos.x, pos.y, p.x, p.y) > DESPAWN_RANGE * DESPAWN_RANGE) {
      game.ecs.destroy(e);
      liveNodes.delete(id);
    }
  }
  for (const [id, e] of liveSpawns) {
    if (!game.ecs.isAlive(e)) {
      liveSpawns.delete(id);
      continue;
    }
    // Tamed creatures stop being world spawns and are never despawned.
    if (game.ecs.get(e, C.CreatureInstance)?.owned) {
      liveSpawns.delete(id);
      continue;
    }
    const p = game.ecs.get(e, C.Position);
    if (!p || dist2(pos.x, pos.y, p.x, p.y) > DESPAWN_RANGE * DESPAWN_RANGE) {
      game.ecs.destroy(e);
      liveSpawns.delete(id);
    }
  }
}

