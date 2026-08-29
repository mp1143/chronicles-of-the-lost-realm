import { signal } from '@preact/signals';
import type { Game } from '../sim/game';
import * as C from '../sim/components';

/**
 * UI state bridge.
 *
 * The HUD is refreshed at 10Hz from a flat snapshot of primitives, not on every
 * frame from live components. Preact then only re-renders when a value actually
 * changes, which keeps the UI cost near zero in the frame budget.
 */

export type PanelId =
  | null | 'inventory' | 'party' | 'craft' | 'build' | 'map' | 'journal' | 'character' | 'bestiary';

export interface HudSnapshot {
  hp: number; hpMax: number;
  stamina: number; staminaMax: number;
  hunger: number; warmth: number; sanity: number;
  level: number; xp: number; xpNext: number;
  threadsilver: number;
  clock: string;
  night: boolean;
  biome: string;
  fps: number;
  party: Array<{ uid: string; name: string; hp: number; hpMax: number; level: number; bond: number }>;
  skills: Array<{ id: string; name: string; ready: boolean; cooldownFrac: number }>;
  interactLabel: string | null;
  tameActive: boolean;
  tameProgress: number;
  tameHits: number;
}

export const hud = signal<HudSnapshot>({
  hp: 0, hpMax: 1, stamina: 0, staminaMax: 1,
  hunger: 100, warmth: 100, sanity: 100,
  level: 1, xp: 0, xpNext: 1, threadsilver: 0,
  clock: '06:00', night: false, biome: '', fps: 0,
  party: [], skills: [], interactLabel: null,
  tameActive: false, tameProgress: 0, tameHits: 0,
});

export const openPanel = signal<PanelId>(null);
/** Whether the collapsed mobile menu sheet is showing. Ignored above 620px. */
export const menuOpen = signal(false);
export const notices = signal<Array<{ id: number; text: string; tone: 'info' | 'good' | 'bad' }>>([]);
export const banner = signal<string | null>(null);

let noticeId = 0;

export function pushNotice(text: string, tone: 'info' | 'good' | 'bad'): void {
  const id = ++noticeId;
  notices.value = [...notices.value.slice(-4), { id, text, tone }];
  setTimeout(() => {
    notices.value = notices.value.filter((n) => n.id !== id);
  }, 3200);
}

export function showBanner(text: string): void {
  banner.value = text;
  setTimeout(() => {
    if (banner.value === text) banner.value = null;
  }, 2600);
}

export function formatClock(timeOfDay: number): string {
  const totalMinutes = Math.floor(timeOfDay * 24 * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Called at 10Hz from the main loop. */
export function refreshHud(game: Game, fps: number, interactLabel: string | null): void {
  const hp = game.ecs.get(game.player, C.Health);
  const st = game.ecs.get(game.player, C.Stamina);
  const p = game.ecs.get(game.player, C.PlayerTag);
  const surv = game.ecs.get(game.player, C.Survival);
  const inv = game.ecs.get(game.player, C.Inventory);
  const skills = game.ecs.get(game.player, C.SkillSet);
  const cds = game.ecs.get(game.player, C.Cooldowns);
  const pos = game.playerPos();
  if (!hp || !st || !p || !surv || !inv || !skills || !pos) return;

  const party = game.roster
    .filter((r) => r.partySlot >= 0)
    .map((r) => {
      const e = game.partyEntities.get(r.uid);
      const chp = e !== undefined && game.ecs.isAlive(e) ? game.ecs.get(e, C.Health) : null;
      return {
        uid: r.uid,
        name: r.nickname ?? r.creatureId.replace(/_/g, ' '),
        hp: Math.round(chp?.current ?? r.currentHp),
        hpMax: Math.round(chp?.max ?? Math.max(1, r.currentHp)),
        level: r.level,
        bond: Math.floor(r.bond),
      };
    });

  hud.value = {
    hp: Math.round(hp.current), hpMax: Math.round(hp.max),
    stamina: Math.round(st.current), staminaMax: Math.round(st.max),
    hunger: Math.round(surv.hunger), warmth: Math.round(surv.warmth), sanity: Math.round(surv.sanity),
    level: p.level, xp: p.xp, xpNext: Math.floor(85 * Math.pow(p.level, 1.55)),
    threadsilver: inv.threadsilver,
    clock: formatClock(game.timeOfDay),
    night: game.isNight,
    biome: game.shard.biomeAt(pos.x, pos.y).replace(/_/g, ' '),
    fps,
    party,
    skills: skills.ids.map((id) => {
      const until = cds?.until[id] ?? 0;
      const left = Math.max(0, until - game.nowMs);
      return {
        id,
        name: id.replace(/_/g, ' '),
        ready: left <= 0,
        cooldownFrac: left > 0 ? Math.min(1, left / 8000) : 0,
      };
    }),
    interactLabel,
    tameActive: game.pendingTame !== null,
    tameProgress: game.pendingTame ? Math.min(1, (game.nowMs - game.pendingTame.startedAt) / 3000) : 0,
    tameHits: game.pendingTame?.hits ?? 0,
  };
}
