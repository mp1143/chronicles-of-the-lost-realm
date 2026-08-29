import type { Game } from '../sim/game';
import type { RosterEntry } from '../sim/game';
import type { ShardDelta } from '../world/shard';
import { emptyDelta } from '../world/shard';
import type { ItemStack } from '../content/items';
import * as C from '../sim/components';
import { spawnStructure } from '../sim/factory';
import { setPartySlot } from '../sim/actions';
import type { StorageAdapter } from '../platform/storage';
import { hashString } from '../core/math';
import { MIGRATIONS, CURRENT_SCHEMA } from './migrations';

/**
 * The world is never serialised. We store the seed plus a delta list and
 * regenerate on load, so a 40-hour save is a few hundred KB rather than tens of
 * megabytes (TechnicalDesign §3.2).
 *
 * Writes are atomic: the blob lands under a new key, then the pointer record is
 * flipped. A crash mid-write costs at most one autosave interval, never the file.
 */

export interface SaveGame {
  schemaVersion: number;
  worldSeed: string;
  shardId: string;
  createdAt: number;
  playedMs: number;
  nowMs: number;
  player: {
    x: number; y: number;
    hp: number; hpMax: number;
    level: number; xp: number; unspentPoints: number;
    attributes: C.PlayerTag['attributes'];
    survival: C.Survival;
    threadsilver: number;
    equipped: C.Inventory['equipped'];
  };
  inventory: ItemStack[];
  roster: RosterEntry[];
  knownRecipes: string[];
  tameAffinity: Array<[string, number]>;
  discovered: string[];
  world: Record<string, ShardDelta>;
}

export interface SaveMeta {
  slot: string;
  savedAt: number;
  playedMs: number;
  level: number;
  worldSeed: string;
  checksum: number;
}

const POINTER_KEY = (slot: string): string => `ptr:${slot}`;
const BLOB_KEY = (slot: string, gen: number): string => `blob:${slot}:${gen}`;
const META_KEY = (slot: string): string => `meta:${slot}`;
/** Autosave ring. Corruption in one is never fatal. */
export const AUTOSAVE_SLOTS = ['auto1', 'auto2', 'auto3'] as const;
export const MANUAL_SLOTS = ['slot1', 'slot2', 'slot3'] as const;

export function serialise(game: Game): SaveGame {
  const p = game.ecs.get(game.player, C.PlayerTag)!;
  const pos = game.ecs.get(game.player, C.Position)!;
  const hp = game.ecs.get(game.player, C.Health)!;
  const inv = game.ecs.get(game.player, C.Inventory)!;
  const surv = game.ecs.get(game.player, C.Survival)!;

  // Pull live party state back into the roster before writing.
  for (const [uid, e] of game.partyEntities) {
    if (!game.ecs.isAlive(e)) continue;
    const entry = game.roster.find((r) => r.uid === uid);
    const inst = game.ecs.get(e, C.CreatureInstance);
    const chp = game.ecs.get(e, C.Health);
    if (entry && inst) {
      entry.creatureId = inst.creatureId;
      entry.level = inst.level;
      entry.xp = inst.xp;
      entry.bond = inst.bond;
      entry.nickname = inst.nickname;
      entry.currentHp = chp?.current ?? entry.currentHp;
    }
  }

  return {
    schemaVersion: CURRENT_SCHEMA,
    worldSeed: game.worldSeed,
    shardId: game.shard.shardId,
    createdAt: Date.now(),
    playedMs: game.playedMs,
    nowMs: game.nowMs,
    player: {
      x: pos.x, y: pos.y,
      hp: hp.current, hpMax: hp.max,
      level: p.level, xp: p.xp, unspentPoints: p.unspentPoints,
      attributes: { ...p.attributes },
      survival: { ...surv },
      threadsilver: inv.threadsilver,
      equipped: { ...inv.equipped },
    },
    inventory: inv.slots.map((s) => ({ ...s })),
    roster: game.roster.map((r) => ({ ...r })),
    knownRecipes: [...game.knownRecipes],
    tameAffinity: [...game.tameAffinity],
    discovered: [...game.discoveredCreatures],
    world: { [game.shard.shardId]: game.shard.delta },
  };
}

export function applySave(game: Game, save: SaveGame): void {
  game.playedMs = save.playedMs;
  game.nowMs = save.nowMs;

  game.shard.delta = save.world[save.shardId] ?? emptyDelta();
  game.shard.updateResidency(save.player.x, save.player.y);
  game.shard.flushPending();

  const pos = game.ecs.get(game.player, C.Position)!;
  pos.x = save.player.x;
  pos.y = save.player.y;
  pos.px = pos.x;
  pos.py = pos.y;

  const p = game.ecs.get(game.player, C.PlayerTag)!;
  p.level = save.player.level;
  p.xp = save.player.xp;
  p.unspentPoints = save.player.unspentPoints;
  p.attributes = { ...save.player.attributes };

  const hp = game.ecs.get(game.player, C.Health)!;
  hp.max = save.player.hpMax;
  hp.current = save.player.hp;

  const surv = game.ecs.get(game.player, C.Survival)!;
  Object.assign(surv, save.player.survival);

  const inv = game.ecs.get(game.player, C.Inventory)!;
  inv.slots = save.inventory.map((s) => ({ ...s }));
  inv.threadsilver = save.player.threadsilver;
  inv.equipped = { ...save.player.equipped };

  game.knownRecipes = new Set(save.knownRecipes);
  game.tameAffinity = new Map(save.tameAffinity);
  game.discoveredCreatures = new Set(save.discovered);

  // Rebuild placed structures from the delta.
  for (const s of game.shard.delta.structures) spawnStructure(game.ecs, s.structureId, s.x, s.y);

  // Roster: reserve creatures stay data; active ones are re-instantiated.
  game.roster = save.roster.map((r) => ({ ...r }));
  game.partyEntities.clear();
  for (const entry of game.roster) {
    if (entry.partySlot < 0) continue;
    const slot = entry.partySlot;
    entry.partySlot = -1; // setPartySlot expects to be moving it in
    setPartySlot(game, entry.uid, slot);
  }
}

function checksum(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

async function compress(text: string): Promise<Uint8Array> {
  const raw = new TextEncoder().encode(text);
  // CompressionStream is native on every target we ship to — no library needed.
  if (typeof CompressionStream === 'undefined') return raw;
  // Cast: TS models Uint8Array over ArrayBufferLike, BlobPart wants ArrayBuffer.
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompress(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === 'undefined') return new TextDecoder().decode(bytes);
  // gzip magic number; uncompressed saves (from a fallback write) start with '{'.
  if (!(bytes[0] === 0x1f && bytes[1] === 0x8b)) return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export class SaveService {
  constructor(private storage: StorageAdapter) {}

  async save(game: Game, slot: string): Promise<SaveMeta> {
    const data = serialise(game);
    const json = JSON.stringify(data);
    const bytes = await compress(json);

    // Atomic: write the new blob, verify it, then flip the pointer.
    const prevGen = Number((await this.readText(POINTER_KEY(slot))) ?? '0');
    const gen = prevGen + 1;
    await this.storage.set(BLOB_KEY(slot, gen), bytes);

    const meta: SaveMeta = {
      slot,
      savedAt: Date.now(),
      playedMs: data.playedMs,
      level: data.player.level,
      worldSeed: data.worldSeed,
      checksum: checksum(bytes),
    };
    await this.storage.set(META_KEY(slot), new TextEncoder().encode(JSON.stringify(meta)));
    await this.storage.set(POINTER_KEY(slot), new TextEncoder().encode(String(gen)));

    // Keep only the two most recent generations per slot.
    if (gen > 2) await this.storage.delete(BLOB_KEY(slot, gen - 2));
    return meta;
  }

  /** Loads a slot, falling back to the previous generation if the newest is bad. */
  async load(slot: string): Promise<SaveGame | null> {
    const gen = Number((await this.readText(POINTER_KEY(slot))) ?? '0');
    if (gen === 0) return null;
    for (const g of [gen, gen - 1]) {
      if (g < 1) continue;
      const bytes = await this.storage.get(BLOB_KEY(slot, g));
      if (!bytes) continue;
      try {
        const json = await decompress(bytes);
        const raw = JSON.parse(json) as SaveGame & { schemaVersion: number };
        return migrate(raw);
      } catch (err) {
        console.error(`Save slot ${slot} generation ${g} failed to load:`, err);
      }
    }
    return null;
  }

  /**
   * The newest save across every slot.
   *
   * Boot must not privilege one slot: pressing Save (which writes `slot1`) and
   * then reloading used to lose the run, because startup only ever read
   * `auto1`. "Most recently written wins" is the only rule that matches what a
   * player expects.
   */
  async loadLatest(): Promise<{ save: SaveGame; meta: SaveMeta } | null> {
    const metas = await this.listMeta();
    for (const meta of metas) {
      const save = await this.load(meta.slot);
      if (save) return { save, meta };
    }
    return null;
  }

  async listMeta(): Promise<SaveMeta[]> {
    const keys = await this.storage.keys();
    const out: SaveMeta[] = [];
    for (const k of keys) {
      if (!k.startsWith('meta:')) continue;
      const text = await this.readText(k);
      if (!text) continue;
      try {
        out.push(JSON.parse(text) as SaveMeta);
      } catch {
        // A corrupt meta record must not hide the other slots.
      }
    }
    return out.sort((a, b) => b.savedAt - a.savedAt);
  }

  async deleteSlot(slot: string): Promise<void> {
    const gen = Number((await this.readText(POINTER_KEY(slot))) ?? '0');
    for (let g = 1; g <= gen; g++) await this.storage.delete(BLOB_KEY(slot, g));
    await this.storage.delete(META_KEY(slot));
    await this.storage.delete(POINTER_KEY(slot));
  }

  private async readText(key: string): Promise<string | null> {
    const bytes = await this.storage.get(key);
    return bytes ? new TextDecoder().decode(bytes) : null;
  }
}

/**
 * Applies migrations in sequence. Migrations are append-only and never deleted,
 * and each ships with a fixture test that loads a real save from the prior
 * version. The cheapest insurance in the project.
 */
export function migrate(raw: SaveGame & { schemaVersion: number }): SaveGame {
  let data: any = raw;
  let v = data.schemaVersion ?? 1;
  while (v < CURRENT_SCHEMA) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`No migration from schema ${v}`);
    data = step(data);
    v++;
    data.schemaVersion = v;
  }
  return data as SaveGame;
}

/** Stable fingerprint of a save, for the determinism and round-trip tests. */
export function saveFingerprint(save: SaveGame): number {
  return hashString(JSON.stringify(save));
}
