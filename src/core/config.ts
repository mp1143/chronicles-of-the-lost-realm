/** Tuning constants. One place, so balance passes are a diff, not an archaeology dig. */

export const TILE_SIZE = 32;

/** Chunk edge in tiles. 32 keeps a single generation call well under one frame. */
export const CHUNK_SIZE = 32;

/**
 * Shard edge in tiles. The design target is 2048 (TechnicalDesign §4.1); the
 * vertical slice uses 512 so a full Shard generates in ~120ms and the whole
 * thing is walkable in a play session.
 */
export const SHARD_SIZE = 512;

export const SEA_LEVEL = 0.36;
export const SHORE_LEVEL = 0.42;
export const MID_LEVEL = 0.6;
export const HIGH_LEVEL = 0.78;

/** Chunks loaded around the player, and the radius at which they are dropped. */
export const LOAD_RADIUS = 3;
export const UNLOAD_RADIUS = 5;

/** Day length in real seconds. 20 minutes: 14 day, 6 night. */
export const DAY_LENGTH_S = 1200;
export const DAWN = 0.2;
export const DUSK = 0.7;

/** Survival drain per second at Normal difficulty. */
export const HUNGER_DRAIN = 0.055;
export const WARMTH_DRAIN_BASE = 0.0;
export const STAMINA_REGEN = 14;

/** Combat. */
export const CRIT_MULT = 1.75;
export const BASE_CRIT = 0.03;
export const DAMAGE_VARIANCE = 0.06;
/** Defence softening constant — higher means defence matters less. */
export const DEFENCE_K = 120;

/**
 * Damage-over-time cap.
 *
 * DoT is authored as a percentage of the target's max health, which is right
 * for ordinary enemies but unbounded against a boss: a 12,000 HP boss took ~370
 * poison damage per second from a level-12 creature, which made boss health
 * pools meaningless (raising boss HP raised the DoT with it). Each tick is
 * therefore capped at a multiple of the applier's own offensive stat, so DoT
 * stays exactly as strong as it was on normal targets and stops scaling
 * infinitely on large ones.
 */
export const DOT_SOURCE_SCALE = 0.35;

/** AI. */
export const AI_BUDGET_MS = 2.5;
export const AI_FULL_TICK_RANGE = 20;
export const AI_SLOW_TICK_RANGE = 48;
export const PERCEPTION_HZ = 6;

/** Progression. */
export const MAX_PLAYER_LEVEL = 100;
export const MAX_CREATURE_LEVEL = 60;
export const PARTY_ACTIVE = 3;
export const PARTY_RESERVE = 6;
export const RESERVE_XP_SHARE = 0.4;

export const playerXpToNext = (level: number): number => Math.floor(85 * Math.pow(level, 1.55));
export const creatureXpToNext = (level: number): number => Math.floor(65 * Math.pow(level, 1.5));

/** Taming. GDD §6.4. */
export const TAME_HP_THRESHOLD = 0.4;
export const TAME_MIN_CHANCE = 0.05;
export const TAME_MAX_CHANCE = 0.95;
/** Permanent affinity granted per failed attempt on a species — the mercy mechanic. */
export const TAME_FAILURE_AFFINITY = 0.05;

/** Inventory. */
export const BASE_INVENTORY_SLOTS = 30;

/** New games start at 07:00 rather than midnight — opening in the dark reads as broken. */
export const START_TIME_MS = DAY_LENGTH_S * 1000 * (7 / 24);

/** Autosave interval in seconds. */
export const AUTOSAVE_INTERVAL_S = 180;
