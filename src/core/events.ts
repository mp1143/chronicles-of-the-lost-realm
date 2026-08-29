import type { Entity } from './ecs';

/**
 * Typed pub/sub. Presentation (damage numbers, screen shake, audio, UI) and the
 * quest system are all subscribers — never inline calls inside the simulation.
 * That is what lets the sim run headless in tests and in the balance simulator.
 */

export interface GameEvents {
  DamageDealt: { source: Entity; target: Entity; amount: number; crit: boolean; threadMult: number };
  EntityKilled: { entity: Entity; killer: Entity | null; creatureId?: string; level?: number };
  StatusApplied: { target: Entity; status: string; stacks: number };
  SkillUsed: { source: Entity; skillId: string };
  ItemAcquired: { itemId: string; count: number };
  ItemConsumed: { itemId: string; count: number };
  ResourceHarvested: { itemId: string; count: number; x: number; y: number };
  CreatureTamed: { creatureId: string; entity: Entity };
  CreatureLevelled: { entity: Entity; level: number };
  CreatureBondChanged: { entity: Entity; bond: number };
  PlayerLevelled: { level: number };
  PlayerDied: { cause: string };
  StructureBuilt: { structureId: string; x: number; y: number };
  ItemCrafted: { itemId: string; count: number; quality: string };
  BossPhaseChanged: { entity: Entity; phase: number };
  Notice: { text: string; tone: 'info' | 'good' | 'bad' };
  SaveRequested: { reason: string };
}

type Handler<K extends keyof GameEvents> = (payload: GameEvents[K]) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler<never>>>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(type as string);
    if (!set) {
      set = new Set();
      this.handlers.set(type as string, set);
    }
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(type as string);
    if (!set) return;
    // Copy: a handler is allowed to unsubscribe itself mid-dispatch.
    for (const fn of [...set]) {
      try {
        (fn as Handler<K>)(payload);
      } catch (err) {
        // One bad subscriber must never take down the simulation tick.
        console.error(`EventBus handler for "${String(type)}" threw:`, err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
