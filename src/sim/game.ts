import { World, type Entity } from '../core/ecs';
import { EventBus } from '../core/events';
import { SeededRNG } from '../core/rng';
import { DAY_LENGTH_S, DAWN, DUSK, START_TIME_MS } from '../core/config';
import { ShardWorld } from '../world/shard';
import { SpatialHash } from './spatial';
import * as C from './components';
import { spawnPlayer } from './factory';
import { runStreaming } from './systems/streaming';
import { runAI } from './systems/ai';
import { runMovement } from './systems/movement';
import { runCombat } from './systems/combat';
import { runStatus } from './systems/status';
import { runSurvival } from './systems/survival';

/** A creature in the roster that is not currently instantiated in the world. */
export interface RosterEntry {
  uid: string;
  creatureId: string;
  level: number;
  xp: number;
  bond: number;
  ivs: C.CreatureInstance['ivs'];
  natureUp: C.CreatureInstance['natureUp'];
  natureDown: C.CreatureInstance['natureDown'];
  nickname?: string;
  currentHp: number;
  /** Index 0-2 = active party, -1 = reserve. */
  partySlot: number;
}

export interface PlayerIntent {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  /** Skill ids requested this tick; consumed by the combat system. */
  useSkills: string[];
  interact: boolean;
  dodge: boolean;
}

export function emptyIntent(): PlayerIntent {
  return { moveX: 0, moveY: 0, aimX: 0, aimY: 0, useSkills: [], interact: false, dodge: false };
}

/**
 * The simulation. Owns the ECS, the loaded Shard, and the tick order.
 *
 * Contains no platform or rendering imports — that boundary is what makes four
 * targets cheap, and it is why the balance simulator can run this headless.
 */
export class Game {
  readonly ecs = new World();
  readonly bus = new EventBus();
  readonly spatial = new SpatialHash();
  readonly rng: SeededRNG;
  shard: ShardWorld;

  /** Simulation clock in ms. Independent of wall clock so saves resume cleanly. */
  nowMs = 0;
  playedMs = 0;
  player: Entity = 0;
  intent: PlayerIntent = emptyIntent();

  roster: RosterEntry[] = [];
  /** Live entities for party creatures, indexed by roster uid. */
  partyEntities = new Map<string, Entity>();
  /** Streaming bookkeeping: which chunk-declared nodes/spawns are instantiated.
   *  Held on the Game (not module scope) so two Games never share state. */
  readonly liveNodes = new Map<string, Entity>();
  readonly liveSpawns = new Map<string, Entity>();

  knownRecipes = new Set<string>();
  /** Mercy mechanic: permanent taming affinity per species. */
  tameAffinity = new Map<string, number>();
  discoveredCreatures = new Set<string>();

  /** Set by the taming system while a snare minigame is open. */
  pendingTame: { target: Entity; startedAt: number; hits: number } | null = null;

  /** Toggled by the UI; the loop keeps running so animations do not freeze mid-pause. */
  paused = false;
  /** Tactical pause: time dilation factor applied to dt. */
  timeScale = 1;

  constructor(readonly worldSeed: string, shardId = 'verdant_reach_01') {
    this.rng = new SeededRNG(worldSeed, 'sim');
    this.shard = new ShardWorld(worldSeed, shardId);
  }

  /** Fresh game: generate the start area and place the player. */
  newGame(): void {
    this.nowMs = START_TIME_MS;
    const start = this.shard.findStartPosition();
    this.shard.updateResidency(start.x, start.y);
    this.shard.flushPending();
    this.player = spawnPlayer(this.ecs, start.x, start.y);
    for (const id of ['cook_meat', 'salve', 'axe', 'pick', 'threadsnare', 'fiber_wrap', 'worn_blade', 'copper_ingot', 'iron_ingot', 'copper_blade']) {
      this.knownRecipes.add(id);
    }
    runStreaming(this, 0);
  }

  /** Normalised time of day in [0,1). 0 = midnight. */
  get timeOfDay(): number {
    return (this.nowMs / 1000 / DAY_LENGTH_S) % 1;
  }

  get isNight(): boolean {
    const t = this.timeOfDay;
    return t < DAWN || t > DUSK;
  }

  /** 0 at deep night, 1 at midday. Drives the lighting grade and Duskveil pressure. */
  get daylight(): number {
    const t = this.timeOfDay;
    if (t < DAWN) return Math.max(0.1, t / DAWN * 0.5);
    if (t > DUSK) return Math.max(0.1, (1 - t) / (1 - DUSK) * 0.5);
    const mid = (t - DAWN) / (DUSK - DAWN);
    return 0.5 + Math.sin(mid * Math.PI) * 0.5;
  }

  playerPos(): C.Position | undefined {
    return this.ecs.get(this.player, C.Position);
  }

  /** One fixed simulation step. Order matters — see TechnicalDesign §2.4. */
  tick(dt: number): void {
    if (this.paused) return;
    const scaled = dt * this.timeScale;
    this.nowMs += scaled * 1000;
    this.playedMs += dt * 1000;

    this.rebuildSpatial();

    const pos = this.playerPos();
    if (pos) {
      this.shard.updateResidency(pos.x, pos.y);
      this.shard.processPending(1); // one chunk per tick: never a hitch
    }

    runStreaming(this, scaled);
    runAI(this, scaled);
    runMovement(this, scaled);
    runCombat(this, scaled);
    runStatus(this, scaled);
    runSurvival(this, scaled);

    this.ecs.flush();
  }

  private rebuildSpatial(): void {
    this.spatial.clear();
    for (const e of this.ecs.query(C.Position, C.Collider)) {
      const p = this.ecs.need(e, C.Position);
      this.spatial.insert(e, p.x, p.y);
    }
  }

  /** Party creatures currently alive in the world. */
  activePartyEntities(): Entity[] {
    const out: Entity[] = [];
    for (const entry of this.roster) {
      if (entry.partySlot < 0) continue;
      const e = this.partyEntities.get(entry.uid);
      if (e !== undefined && this.ecs.isAlive(e)) out.push(e);
    }
    return out;
  }

  notice(text: string, tone: 'info' | 'good' | 'bad' = 'info'): void {
    this.bus.emit('Notice', { text, tone });
  }
}
