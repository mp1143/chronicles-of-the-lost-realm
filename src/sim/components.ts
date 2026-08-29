import { defineComponent } from '../core/ecs';
import type { Entity } from '../core/ecs';
import type { Thread } from '../content/threads';
import type { Role, BaseStats } from '../content/creatures';
import type { StatusId } from '../content/statuses';
import type { ItemStack } from '../content/items';

export type Faction = 'player' | 'wild' | 'hostile' | 'neutral';
export type Stance = 'aggressive' | 'balanced' | 'defensive' | 'hold';

export interface Position { x: number; y: number; /** previous tick, for render interpolation */ px: number; py: number }
export interface Velocity { x: number; y: number }
export interface Facing { angle: number }
export interface Health { current: number; max: number; regenPerSec: number }
export interface Stamina { current: number; max: number }

export interface CombatStats {
  atk: number; def: number; mag: number; res: number; spd: number;
  critChance: number;
  /** Timed multiplicative buffs applied by skills and food. */
  buffs: Array<{ stat: keyof Omit<CombatStats, 'buffs' | 'critChance'>; amount: number; expiresAt: number }>;
}

export interface Threads { list: Thread[] }
export interface FactionTag { value: Faction }
export interface Collider { radius: number }

export interface StatusEffects {
  active: Array<{
    id: StatusId;
    stacks: number;
    expiresAt: number;
    tickAcc: number;
    source: Entity | null;
  }>;
  /** Player-only chain-lock protection: statusId -> ms timestamp. GDD §10.3. */
  immuneUntil: Partial<Record<StatusId, number>>;
}

export interface SkillSet { ids: string[] }
export interface Cooldowns { until: Record<string, number> }

export interface Casting {
  skillId: string;
  /** ms remaining of the telegraph, then of the cast. */
  telegraphLeft: number;
  castLeft: number;
  /** Locked at activation so a moving target does not drag the telegraph. */
  aimX: number;
  aimY: number;
  interruptible: boolean;
}

export interface CreatureInstance {
  creatureId: string;
  level: number;
  xp: number;
  bond: number;
  /** Individual values, 0-15 per stat, rolled at capture. */
  ivs: BaseStats;
  /** Nature: +10% to one stat, -10% to another. */
  natureUp: keyof BaseStats;
  natureDown: keyof BaseStats;
  nickname?: string;
  role: Role;
  /** Set once the creature is in the player's roster. */
  owned: boolean;
}

export interface OwnedBy { owner: Entity }
export interface PartySlot { index: number }

export interface AIState {
  stance: Stance;
  target: Entity | null;
  lastPerceptionMs: number;
  /** Threat accumulated per source entity; the tank's job is to top this table. */
  threat: Map<Entity, number>;
  homeX: number;
  homeY: number;
  /** Set by a taunt. */
  forcedTargetUntil: number;
  /** Round-robin bucket for the AI time-slice budget. */
  bucket: number;
  /** Wander destination when idle. */
  wanderX: number;
  wanderY: number;
  wanderUntil: number;
}

export interface PlayerTag {
  attributes: { vigor: number; focus: number; attunement: number; craft: number; grit: number };
  level: number;
  xp: number;
  unspentPoints: number;
}

export interface Survival {
  hunger: number;
  hungerMax: number;
  warmth: number;
  warmthMax: number;
  sanity: number;
  sanityMax: number;
}

export interface Inventory {
  slots: ItemStack[];
  capacity: number;
  threadsilver: number;
  equipped: Partial<Record<'weapon' | 'head' | 'body' | 'trinket', string>>;
}

export interface HarvestNode {
  nodeId: string;
  kind: string;
  hitsLeft: number;
}

export interface WorldSpawn { spawnId: string }

export interface Projectile {
  skillId: string;
  source: Entity;
  dirX: number;
  dirY: number;
  speed: number;
  rangeLeft: number;
  radius: number;
}

export interface BossTag {
  bossId: string;
  phase: number;
  /** Environmental weak points; destroying one staggers the boss. */
  staggerUntil: number;
}

export interface Structure {
  structureId: string;
  x: number;
  y: number;
}

export interface Lifetime { msLeft: number }

export interface Renderable {
  /** Key into the procedural texture cache. */
  textureKey: string;
  radius: number;
  tint: number;
  layer: 'ground' | 'entity' | 'air' | 'fx';
}

export interface Nameplate { text: string; level: number }

// ---------- registry ----------

export const Position = defineComponent<Position>('Position');
export const Velocity = defineComponent<Velocity>('Velocity');
export const Facing = defineComponent<Facing>('Facing');
export const Health = defineComponent<Health>('Health');
export const Stamina = defineComponent<Stamina>('Stamina');
export const CombatStats = defineComponent<CombatStats>('CombatStats');
export const Threads = defineComponent<Threads>('Threads');
export const FactionTag = defineComponent<FactionTag>('FactionTag');
export const Collider = defineComponent<Collider>('Collider');
export const StatusEffects = defineComponent<StatusEffects>('StatusEffects');
export const SkillSet = defineComponent<SkillSet>('SkillSet');
export const Cooldowns = defineComponent<Cooldowns>('Cooldowns');
export const Casting = defineComponent<Casting>('Casting');
export const CreatureInstance = defineComponent<CreatureInstance>('CreatureInstance');
export const OwnedBy = defineComponent<OwnedBy>('OwnedBy');
export const PartySlot = defineComponent<PartySlot>('PartySlot');
export const AIState = defineComponent<AIState>('AIState');
export const PlayerTag = defineComponent<PlayerTag>('PlayerTag');
export const Survival = defineComponent<Survival>('Survival');
export const Inventory = defineComponent<Inventory>('Inventory');
export const HarvestNode = defineComponent<HarvestNode>('HarvestNode');
export const WorldSpawn = defineComponent<WorldSpawn>('WorldSpawn');
export const Projectile = defineComponent<Projectile>('Projectile');
export const BossTag = defineComponent<BossTag>('BossTag');
export const Structure = defineComponent<Structure>('Structure');
export const Lifetime = defineComponent<Lifetime>('Lifetime');
export const Renderable = defineComponent<Renderable>('Renderable');
export const Nameplate = defineComponent<Nameplate>('Nameplate');
