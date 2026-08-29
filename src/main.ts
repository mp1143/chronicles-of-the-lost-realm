import { render, h } from 'preact';
import { Game } from './sim/game';
import { GameLoop } from './core/loop';
import { GameRenderer } from './render/renderer';
import { createStorage } from './platform/storage';
import { SaveService, applySave } from './persist/save';
import { KeyboardMouseInput, TouchInput, isTouchDevice, type InputAdapter } from './platform/input';
import { App } from './ui/App';
import { TouchControls } from './ui/TouchControls';
import { refreshHud, pushNotice, showBanner, openPanel } from './ui/store';
import { guideOpen, shouldShowGuideOnBoot } from './ui/Onboarding';
import { AUTOSAVE_INTERVAL_S } from './core/config';
import * as C from './sim/components';
import {
  findInteractable, harvest, beginTame, tameBeat, resolveTame, canTame,
} from './sim/actions';
import { HARVESTABLES } from './content/biomes';
import { getStructure } from './content/structures';
import { getCreature } from './content/creatures';
import { BOSSES } from './content/bosses';
import { installTestHooks } from './app/testHooks';

/**
 * Bootstrap: wires the platform adapters to the simulation and the renderer.
 * This is the only file that knows about all three.
 */

const SEED_KEY = 'chronicles:seed';

async function boot(): Promise<void> {
  const host = document.getElementById('game')!;
  const uiHost = document.getElementById('ui')!;

  const storage = createStorage();
  const saves = new SaveService(storage);

  // Resume the most recent save from any slot, or start a fresh world. The
  // save's own seed wins, so a resumed run always regenerates its own terrain.
  const existing = await saves.loadLatest();
  const seed =
    existing?.save.worldSeed ??
    localStorage.getItem(SEED_KEY) ??
    `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  localStorage.setItem(SEED_KEY, seed);

  const game = new Game(seed, existing?.save.shardId);
  game.newGame();

  const renderer = new GameRenderer();
  await renderer.init(host);

  if (existing) {
    applySave(game, existing.save);
    pushNotice(`Resumed from ${existing.meta.slot}`, 'good');
  }

  const touch = isTouchDevice();
  const input: InputAdapter = touch ? new TouchInput(host) : new KeyboardMouseInput(host);

  wireEvents(game, renderer);
  wireLifecycle(game, saves);

  render(
    h('div', null, [
      h(App, { game, key: 'app', onSave: () => void doSave(game, saves, 'slot1') }),
      touch ? h(TouchControls, { input, key: 'touch' }) : null,
    ]),
    uiHost,
  );

  // First run: show the guide before anything moves.
  if (shouldShowGuideOnBoot()) guideOpen.value = true;

  let hudTimer = 0;
  let autosaveTimer = 0;
  let attackHeld = false;
  let interactHeld = false;
  let tameTapHeld = false;

  const loop = new GameLoop(
    (dt) => {
      const state = input.poll();

      // --- intent ---
      game.intent.moveX = state.moveX;
      game.intent.moveY = state.moveY;

      const pos = game.playerPos();
      if (pos) {
        const world = renderer.screenToWorld(state.pointerX, state.pointerY);
        // Touch aims at the drag point; with no pointer, aim follows facing.
        if (state.pointerDown || !touch) {
          game.intent.aimX = world.x;
          game.intent.aimY = world.y;
        } else {
          const facing = game.ecs.get(game.player, C.Facing)?.angle ?? 0;
          game.intent.aimX = pos.x + Math.cos(facing) * 3;
          game.intent.aimY = pos.y + Math.sin(facing) * 3;
        }
      }

      const skills = game.ecs.get(game.player, C.SkillSet)?.ids ?? [];
      if (state.attack && !attackHeld && skills[0]) game.intent.useSkills.push(skills[0]);
      if (state.skill1 && skills[1]) game.intent.useSkills.push(skills[1]);
      if (state.skill2 && skills[2]) game.intent.useSkills.push(skills[2]);
      attackHeld = state.attack;

      // Tactical pause: 15% time, not a hard stop — pressure is preserved.
      game.timeScale = state.tacticalPause ? 0.15 : 1;
      game.paused = openPanel.value !== null || guideOpen.value;

      // --- taming minigame ---
      if (game.pendingTame) {
        if (state.attack && !tameTapHeld) {
          // Accurate when the shrinking ring is near the target size.
          const t = (game.nowMs - game.pendingTame.startedAt) / 3000;
          const phase = (t * 3) % 1;
          tameBeat(game, phase > 0.72 && phase < 0.95);
        }
        tameTapHeld = state.attack;
        if (game.nowMs - game.pendingTame.startedAt > 3000) {
          const result = resolveTame(game);
          pushNotice(result.message ?? '', result.ok ? 'good' : 'bad');
        }
      }

      // --- interact ---
      if (state.interact && !interactHeld) doInteract(game);
      interactHeld = state.interact;

      game.tick(dt);
    },
    (alpha) => {
      renderer.render(game, alpha);

      hudTimer += 1;
      if (hudTimer >= 6) {
        hudTimer = 0;
        refreshHud(game, loop.stats.fps, interactLabel(game));
        renderer.applyQuality(loop.stats.fps);
      }

      autosaveTimer += 1 / 60;
      if (autosaveTimer >= AUTOSAVE_INTERVAL_S) {
        autosaveTimer = 0;
        void doSave(game, saves, 'auto1');
      }
    },
  );

  loop.start();

  // Backgrounding must not fast-forward the simulation on resume.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      void doSave(game, saves, 'auto1');
    } else {
      loop.resetClock();
    }
  });

  installTestHooks(game, renderer, loop);
}

function interactLabel(game: import('./sim/game').Game): string | null {
  const target = findInteractable(game);
  if (target === null) return null;
  const node = game.ecs.get(target, C.HarvestNode);
  if (node) return `Gather ${HARVESTABLES[node.kind].name}`;
  const structure = game.ecs.get(target, C.Structure);
  if (structure) return `Use ${getStructure(structure.structureId).name}`;
  return null;
}

function doInteract(game: import('./sim/game').Game): void {
  // Taming takes priority: a weakened creature in reach is the interesting case.
  const pos = game.playerPos();
  if (pos && !game.pendingTame) {
    for (const e of game.ecs.query(C.CreatureInstance, C.Position, C.Health)) {
      const inst = game.ecs.need(e, C.CreatureInstance);
      if (inst.owned) continue;
      const p = game.ecs.need(e, C.Position);
      if (Math.hypot(p.x - pos.x, p.y - pos.y) > 3) continue;
      if (!canTame(game, e).ok) continue;
      const result = beginTame(game, e);
      pushNotice(result.message ?? '', result.ok ? 'good' : 'bad');
      return;
    }
  }

  const target = findInteractable(game);
  if (target === null) return;
  if (game.ecs.has(target, C.HarvestNode)) {
    const result = harvest(game, target);
    if (result.message) pushNotice(result.message, result.ok ? 'good' : 'bad');
    return;
  }
  const structure = game.ecs.get(target, C.Structure);
  if (structure) {
    const def = getStructure(structure.structureId);
    openPanel.value = def.station ? 'craft' : 'inventory';
  }
}

function wireEvents(game: import('./sim/game').Game, renderer: GameRenderer): void {
  game.bus.on('Notice', ({ text, tone }) => pushNotice(text, tone));

  game.bus.on('DamageDealt', ({ target, amount, crit, threadMult }) => {
    const p = game.ecs.get(target, C.Position);
    if (!p) return;
    const colour = crit ? 0xffd76b : threadMult > 1.2 ? 0xff8b3d : threadMult < 0.8 ? 0x8b8798 : 0xffffff;
    renderer.spawnFloatingText(p.x, p.y - 0.6, `${amount}${crit ? '!' : ''}`, colour, crit);
  });

  game.bus.on('EntityKilled', ({ creatureId }) => {
    if (creatureId) pushNotice(`${getCreature(creatureId).name} defeated`, 'info');
  });

  game.bus.on('CreatureTamed', ({ creatureId }) => {
    showBanner(`${getCreature(creatureId).name} joins you`);
  });

  game.bus.on('BossPhaseChanged', ({ entity }) => {
    const tag = game.ecs.get(entity, C.BossTag);
    if (!tag) return;
    showBanner(BOSSES[tag.bossId].phases[tag.phase].banner);
  });

  game.bus.on('PlayerDied', () => {
    showBanner('You wake on the shore again.');
  });
}

function wireLifecycle(game: import('./sim/game').Game, saves: SaveService): void {
  // Best-effort save on teardown. pagehide fires on iOS where unload does not.
  addEventListener('pagehide', () => void doSave(game, saves, 'auto1'));
}

async function doSave(game: import('./sim/game').Game, saves: SaveService, slot: string): Promise<void> {
  try {
    await saves.save(game, slot);
    pushNotice('Saved', 'good');
  } catch (err) {
    console.error('Save failed:', err);
    pushNotice('Save failed', 'bad');
  }
}

/**
 * Offline support. Registered only for real builds — a service worker in dev
 * caches the very modules you are editing, which is a memorable afternoon.
 */
function registerServiceWorker(): void {
  if (import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;
  // Capacitor serves from a custom scheme where service workers are neither
  // available nor needed; the assets are already on the device.
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration failed; the game still runs online.', err);
    });
  });
}

registerServiceWorker();
void boot();
