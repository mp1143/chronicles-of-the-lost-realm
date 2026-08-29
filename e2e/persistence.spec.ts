import { test, expect, type Page } from '@playwright/test';
import { bootGame, dismissGuide, walk, clickMenu } from './helpers';

async function hook<T>(page: Page, method: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([m, a]) => {
      const t = (globalThis as Record<string, unknown>).__test as Record<string, (...x: unknown[]) => unknown>;
      return t[m as string](...(a as unknown[]));
    },
    [method, args] as const,
  ) as Promise<T>;
}

test.describe('saving and loading', () => {
  test('saves through IndexedDB and restores on reload', async ({ page }) => {
    await bootGame(page);

    await hook(page, 'grant', 'iron_ingot', 7);
    await hook(page, 'grant', 'timber', 42);
    await walk(page, 'KeyD', 2000);

    await clickMenu(page, 'Save');
    await expect(page.locator('.notice')).toContainText(/Saved/i);

    await page.reload();
    await page.waitForSelector('.vitals');
    await dismissGuide(page);
    await expect
      .poll(() => hook<number>(page, 'itemCount', 'iron_ingot'), { timeout: 30_000 })
      .toBe(7);
    expect(await hook<number>(page, 'itemCount', 'timber')).toBeGreaterThanOrEqual(42);
  });

  test('regenerates identical terrain and position from the seed after a reload', async ({ page }) => {
    await bootGame(page);
    const seed = await page.evaluate(() => localStorage.getItem('chronicles:seed'));
    expect(seed).toBeTruthy();

    await walk(page, 'KeyD', 2000);

    // Fingerprint the terrain fields, not the rendered map: the map also draws
    // the player marker and viewport box, which legitimately move between runs.
    const beforeHash = await hook<number>(page, 'terrainHash');
    const beforePos = await hook<{ x: number; y: number }>(page, 'playerPos');
    expect(beforeHash).toBeGreaterThan(0);

    await clickMenu(page, 'Save');
    await expect(page.locator('.notice')).toContainText(/Saved/i);

    await page.reload();
    await page.waitForSelector('.vitals');
    await dismissGuide(page);

    expect(await page.evaluate(() => localStorage.getItem('chronicles:seed'))).toBe(seed);
    expect(await hook<number>(page, 'terrainHash')).toBe(beforeHash);

    // Position is restored, not reset to the shore.
    const afterPos = await hook<{ x: number; y: number }>(page, 'playerPos');
    expect(Math.abs(afterPos.x - beforePos.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(afterPos.y - beforePos.y)).toBeLessThanOrEqual(2);
  });

  test('autosaves when the app is put away', async ({ page }) => {
    await bootGame(page);
    await hook(page, 'grant', 'copper_ingot', 5);

    // `pagehide` is the event iOS actually delivers (it does not fire `unload`),
    // and it is what src/main.ts listens to for a teardown save. Dispatching it
    // exercises the real handler; headless Chromium will not reliably produce a
    // genuine visibility change from a second tab.
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
    await expect(page.locator('.notice')).toContainText(/Saved/i, { timeout: 15_000 });

    await page.reload();
    await page.waitForSelector('.vitals');
    await dismissGuide(page);
    await expect
      .poll(() => hook<number>(page, 'itemCount', 'copper_ingot'), { timeout: 30_000 })
      .toBe(5);
  });

  test('a fresh browser profile starts a new run rather than failing', async ({ page }) => {
    await bootGame(page);
    expect(await hook<number>(page, 'playerLevel')).toBe(1);
    expect(await hook<number>(page, 'rosterSize')).toBe(0);
  });
});
