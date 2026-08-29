import { expect, type Page } from '@playwright/test';

/** Shape of the in-page debug hook exposed by src/main.ts. */
export interface DebugInfo {
  playerScreen: { x: number; y: number };
  screen: { w: number; h: number };
  entities: number;
  chunks: number;
  fps: number;
  simMs: number;
  renderMs: number;
}

declare global {
  interface Window {
    __debug?: () => DebugInfo | null;
    __spawnBoss?: () => void;
  }
}

/**
 * Boots the game and waits until it is actually playable — canvas present, HUD
 * mounted, first chunks streamed. Every spec starts here.
 */
export async function bootGame(page: Page, opts: { fresh?: boolean; skipGuide?: boolean } = {}): Promise<void> {
  const { fresh = true, skipGuide = true } = opts;

  if (fresh) {
    // A clean slate per spec: otherwise a save from a previous test decides the
    // outcome of this one.
    await page.goto('/');
    await page.evaluate(async () => {
      localStorage.clear();
      const dbs = (await indexedDB.databases?.()) ?? [];
      await Promise.all(
        dbs.map(
          (d) =>
            new Promise<void>((resolve) => {
              if (!d.name) return resolve();
              const req = indexedDB.deleteDatabase(d.name);
              req.onsuccess = req.onerror = req.onblocked = () => resolve();
            }),
        ),
      );
    });
  }

  await page.goto('/');
  await page.waitForSelector('#game canvas', { timeout: 30_000 });
  await page.waitForSelector('.vitals', { timeout: 30_000 });

  if (skipGuide) await dismissGuide(page);

  // Wait for the world to be live rather than sleeping a fixed amount.
  await expect
    .poll(async () => (await debug(page))?.chunks ?? 0, { timeout: 30_000, message: 'chunks did not stream' })
    .toBeGreaterThan(8);
}

/** The first-run guide blocks input until dismissed; most specs are not about it. */
export async function dismissGuide(page: Page): Promise<void> {
  const begin = page.getByRole('button', { name: 'Begin' });
  if (await begin.isVisible().catch(() => false)) await begin.click();
  await expect(page.locator('.guide')).toHaveCount(0);
}

export async function debug(page: Page): Promise<DebugInfo | null> {
  return page.evaluate(() => window.__debug?.() ?? null);
}

/** Holds a key for a duration, so the player actually travels. */
export async function walk(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/** Collects console errors and page exceptions for the life of the page. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/**
 * Errors we accept. Kept explicit and tiny — a growing list here is a smell,
 * not a solution.
 */
const IGNORED = [
  /Failed to load resource.*favicon/i,
  /WebGL.*deprecated/i,
  /GroupMarkerNotSet/i, // SwiftShader noise in headless Chromium
];

export function assertNoErrors(errors: string[]): void {
  const real = errors.filter((e) => !IGNORED.some((p) => p.test(e)));
  expect(real, `console errors:\n${real.join('\n')}`).toEqual([]);
}

/**
 * Below 620px the menu collapses behind a toggle, so a spec that just clicks a
 * menu button has to reveal it first. Handled here rather than in every test.
 */
async function revealMenu(page: Page): Promise<void> {
  const toggle = page.locator('.menu-toggle');
  if (!(await toggle.isVisible().catch(() => false))) return;
  if (await page.locator('.menu.open').count()) return;
  await toggle.click();
  await expect(page.locator('.menu.open')).toHaveCount(1);
}

/** Opens a panel by its menu label and waits for it to render. */
export async function openPanel(page: Page, label: string): Promise<void> {
  await revealMenu(page);
  await page.locator('.menu-btn', { hasText: new RegExp(`^${label}$`) }).click();
  await expect(page.locator('.panel')).toHaveCount(1);
}

/**
 * Closes via the panel's own X. On narrow screens the menu toggle stands down
 * while a panel is open, so that button is the real close affordance there —
 * and it is the one a player actually uses on any width.
 */
export async function closePanel(page: Page, _label?: string): Promise<void> {
  await page.locator('.panel-head .close').click();
  await expect(page.locator('.panel')).toHaveCount(0);
}

/** Clicks a menu button that is not a panel toggle (Save). */
export async function clickMenu(page: Page, label: string): Promise<void> {
  await revealMenu(page);
  await page.locator('.menu-btn', { hasText: new RegExp(`^${label}$`) }).click();
}
