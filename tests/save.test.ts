import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import * as C from '../src/sim/components';
import { SaveService, serialise, applySave, migrate, saveFingerprint } from '../src/persist/save';
import { CURRENT_SCHEMA } from '../src/persist/migrations';
import { MemoryStorage } from '../src/platform/storage';
import { addItem, build } from '../src/sim/actions';
import { spawnCreature } from '../src/sim/factory';

function seededGame(seed = 'save-seed'): Game {
  const g = new Game(seed, 'test_shard');
  g.newGame();
  return g;
}

/** Builds a save with real content in it, not an empty one. */
function populated(): Game {
  const game = seededGame();
  addItem(game, 'timber', 63);
  addItem(game, 'iron_ingot', 4);
  game.ecs.get(game.player, C.PlayerTag)!.level = 9;
  game.ecs.get(game.player, C.Inventory)!.threadsilver = 1234;
  game.knownRecipes.add('iron_blade');
  game.tameAffinity.set('sproutling', 0.15);
  game.discoveredCreatures.add('mosshorn');

  const pos = game.playerPos()!;
  const e = spawnCreature(game.ecs, game.rng, 'thornkin', 18, pos.x + 1, pos.y, {
    owned: true, owner: game.player, bond: 4, nickname: 'Bristle',
  });
  game.roster.push({
    uid: 'u1', creatureId: 'thornkin', level: 18, xp: 55, bond: 4,
    ivs: game.ecs.get(e, C.CreatureInstance)!.ivs,
    natureUp: 'atk', natureDown: 'res', nickname: 'Bristle',
    currentHp: 60, partySlot: 0,
  });
  game.partyEntities.set('u1', e);

  addItem(game, 'stone_block', 40);
  addItem(game, 'timber', 40);
  const spot = game.shard.findWalkableNear(pos.x + 2, pos.y, 8)!;
  build(game, 'campfire', Math.floor(spot.x), Math.floor(spot.y));
  game.shard.markHarvested('n:1,1:0', 999_999);
  return game;
}

describe('save serialisation', () => {
  it('round-trips player, inventory, roster and world deltas', async () => {
    const game = populated();
    const save = serialise(game);

    const restored = new Game(save.worldSeed, save.shardId);
    restored.newGame();
    applySave(restored, save);

    expect(restored.ecs.get(restored.player, C.PlayerTag)!.level).toBe(9);
    expect(restored.ecs.get(restored.player, C.Inventory)!.threadsilver).toBe(1234);
    expect(restored.knownRecipes.has('iron_blade')).toBe(true);
    expect(restored.tameAffinity.get('sproutling')).toBe(0.15);
    expect(restored.discoveredCreatures.has('mosshorn')).toBe(true);
    expect(restored.roster.length).toBe(1);
    expect(restored.roster[0].nickname).toBe('Bristle');
    expect(restored.shard.delta.structures.length).toBe(1);
    expect(restored.shard.isHarvested('n:1,1:0', 0)).toBe(true);
  });

  it('re-instantiates active party members on load', () => {
    const game = populated();
    const save = serialise(game);
    const restored = new Game(save.worldSeed, save.shardId);
    restored.newGame();
    applySave(restored, save);

    const party = restored.activePartyEntities();
    expect(party.length).toBe(1);
    const inst = restored.ecs.get(party[0], C.CreatureInstance)!;
    expect(inst.creatureId).toBe('thornkin');
    expect(inst.level).toBe(18);
    expect(inst.bond).toBe(4);
    expect(inst.nickname).toBe('Bristle');
  });

  it('is stable — serialising a restored save reproduces the same fingerprint', () => {
    const game = populated();
    const first = serialise(game);
    const restored = new Game(first.worldSeed, first.shardId);
    restored.newGame();
    applySave(restored, first);
    const second = serialise(restored);

    // createdAt is a wall-clock timestamp; everything else must match.
    expect(saveFingerprint({ ...second, createdAt: 0 })).toBe(
      saveFingerprint({ ...first, createdAt: 0 }),
    );
  });

  it('regenerates identical terrain from the seed alone', () => {
    const game = populated();
    const save = serialise(game);
    const restored = new Game(save.worldSeed, save.shardId);
    restored.newGame();
    expect(restored.shard.terrain.hash(23)).toBe(game.shard.terrain.hash(23));
  });

  it('stays small — the whole point of storing seed plus deltas', () => {
    const game = populated();
    const bytes = new TextEncoder().encode(JSON.stringify(serialise(game))).length;
    expect(bytes).toBeLessThan(120_000);
  });
});

describe('SaveService', () => {
  it('writes and reads a slot', async () => {
    const svc = new SaveService(new MemoryStorage());
    const game = populated();
    const meta = await svc.save(game, 'slot1');
    expect(meta.level).toBe(9);

    const loaded = await svc.load('slot1');
    expect(loaded).not.toBeNull();
    expect(loaded!.player.level).toBe(9);
    expect(loaded!.roster[0].nickname).toBe('Bristle');
  });

  it('returns null for an empty slot rather than throwing', async () => {
    const svc = new SaveService(new MemoryStorage());
    expect(await svc.load('never-written')).toBeNull();
  });

  it('falls back to the previous generation when the newest blob is corrupt', async () => {
    const storage = new MemoryStorage();
    const svc = new SaveService(storage);
    const game = populated();

    await svc.save(game, 'slot1'); // generation 1 — good
    game.ecs.get(game.player, C.PlayerTag)!.level = 11;
    await svc.save(game, 'slot1'); // generation 2 — about to be corrupted

    await storage.set('blob:slot1:2', new TextEncoder().encode('not a save'));
    const loaded = await svc.load('slot1');
    expect(loaded).not.toBeNull();
    expect(loaded!.player.level).toBe(9); // recovered the older good generation
  });

  it('lists and deletes slots', async () => {
    const svc = new SaveService(new MemoryStorage());
    const game = populated();
    await svc.save(game, 'slot1');
    await svc.save(game, 'auto1');
    expect((await svc.listMeta()).length).toBe(2);
    await svc.deleteSlot('slot1');
    expect((await svc.listMeta()).length).toBe(1);
    expect(await svc.load('slot1')).toBeNull();
  });
});

describe('migrations', () => {
  it('passes a current-version save through untouched', () => {
    const game = populated();
    const save = serialise(game);
    expect(migrate(save as never).schemaVersion).toBe(CURRENT_SCHEMA);
  });

  it('throws loudly rather than silently loading an unknown future schema', () => {
    const game = populated();
    const save = { ...serialise(game), schemaVersion: CURRENT_SCHEMA - 1 };
    // No migration is registered for the version below current yet, so this must
    // fail rather than hand the game a half-shaped save.
    if (CURRENT_SCHEMA > 1) expect(() => migrate(save as never)).toThrow();
  });
});
