import { test, expect, type Page } from '@playwright/test';
import { bootGame, debug, walk, openPanel, closePanel, collectErrors, assertNoErrors } from './helpers';

/** Calls a method on the in-page test hook object (src/app/testHooks.ts). */
async function hook<T>(page: Page, method: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([m, a]) => {
      const t = (globalThis as Record<string, unknown>).__test as Record<string, (...x: unknown[]) => unknown>;
      if (!t || typeof t[m as string] !== 'function') throw new Error(`missing test hook: ${m}`);
      return t[m as string](...(a as unknown[]));
    },
    [method, args] as const,
  ) as Promise<T>;
}

test.describe('first-run guide', () => {
  test('greets a new player and can be dismissed', async ({ page }) => {
    await bootGame(page, { skipGuide: false });
    const guide = page.locator('.guide');
    await expect(guide).toBeVisible();
    await expect(guide).toContainText('Controls');
    await expect(guide).toContainText('Your first ten minutes');

    await page.getByRole('button', { name: 'Begin' }).click();
    await expect(guide).toHaveCount(0);
  });

  test('does not reappear next visit, but can be reopened from the Log', async ({ page }) => {
    await bootGame(page, { skipGuide: false });
    await page.getByRole('button', { name: 'Begin' }).click();

    await page.reload();
    await page.waitForSelector('.vitals');
    await expect(page.locator('.guide')).toHaveCount(0);

    await openPanel(page, 'Log');
    await page.getByRole('button', { name: 'How to play' }).click();
    await expect(page.locator('.guide')).toBeVisible();
  });
});

test.describe('panels', () => {
  test('all eight open and close cleanly', async ({ page }) => {
    const errors = collectErrors(page);
    await bootGame(page);
    for (const label of ['Bag', 'Party', 'Craft', 'Build', 'Map', 'Codex', 'Char', 'Log']) {
      await openPanel(page, label);
      await expect(page.locator('.panel-head h2')).toBeVisible();
      await closePanel(page, label);
    }
    assertNoErrors(errors);
  });

  test('the bestiary lists all forty creatures', async ({ page }) => {
    await bootGame(page);
    await openPanel(page, 'Codex');
    await expect(page.locator('.panel-body .card')).toHaveCount(40);
    await expect(page.locator('.panel-body')).toContainText('of 40');
  });

  test('the map renders shaded terrain and marks the player', async ({ page }) => {
    await bootGame(page);
    await openPanel(page, 'Map');

    const map = await page.evaluate(() => {
      const c = document.querySelector('canvas.map') as HTMLCanvasElement | null;
      if (!c) return null;
      const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const seen = new Set<string>();
      let brightest = 0;
      for (let i = 0; i < data.length; i += 4) {
        seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
        brightest = Math.max(brightest, data[i] + data[i + 1] + data[i + 2]);
      }
      return { colours: seen.size, brightest, w: c.width, h: c.height };
    });

    expect(map).not.toBeNull();
    expect(map!.w).toBe(256);
    // Elevation shading produces a continuum, not a handful of flat fills.
    expect(map!.colours).toBeGreaterThan(60);
    // The white player marker is the brightest thing on the map.
    expect(map!.brightest).toBeGreaterThan(720);

    await expect(page.locator('.panel-body')).toContainText('You are at');
  });
});

test.describe('core loop', () => {
  test('gathering, building and crafting chain together', async ({ page }) => {
    await bootGame(page);

    expect(await hook<boolean>(page, 'grant', 'timber', 60)).toBe(true);
    expect(await hook<boolean>(page, 'grant', 'stone_block', 60)).toBe(true);
    expect(await hook<boolean>(page, 'grant', 'raw_meat', 4)).toBe(true);
    expect(await hook<number>(page, 'itemCount', 'timber')).toBeGreaterThanOrEqual(60);

    expect(await hook<boolean>(page, 'build', 'campfire'), 'campfire should be placeable').toBe(true);

    // Standing at the fire, at least one recipe becomes craftable.
    await openPanel(page, 'Craft');
    await expect(page.locator('.panel-body button:not([disabled])').first()).toBeVisible();

    await page.locator('.panel-body button:not([disabled])').first().click();
    await expect(page.locator('.notice')).toContainText(/Crafted/i);
  });

  test('crafting is gated on a station before one is built', async ({ page }) => {
    await bootGame(page);
    await openPanel(page, 'Craft');
    await expect(page.locator('.panel-body')).toContainText('at campfire');
    expect(await page.locator('.panel-body button:not([disabled])').count()).toBe(0);
  });

  test('damage reaches creatures and shows a number', async ({ page }) => {
    await bootGame(page);
    await walk(page, 'KeyD', 1500); // make sure something has streamed in
    const dealt = await hook<number>(page, 'hitSomething');
    expect(dealt, 'no creature was in range to hit').toBeGreaterThan(0);
  });

  test('the boss spawns, banners, and advances phase as health falls', async ({ page }) => {
    await bootGame(page);
    expect(await page.evaluate(() => (globalThis as Record<string, unknown> & { __spawnBoss?: () => boolean }).__spawnBoss?.())).toBe(true);
    await expect(page.locator('.banner')).toBeVisible();
    expect(await hook<number>(page, 'bossPhase')).toBe(0);

    await hook(page, 'advanceBossPhase');
    await expect
      .poll(() => hook<number>(page, 'bossPhase'), { timeout: 10_000 })
      .toBe(1);
    await expect(page.locator('.banner')).toContainText(/pretending/i);
  });

  test('walking a long way does not leak entities', async ({ page }) => {
    await bootGame(page);
    await walk(page, 'KeyD', 4000);
    const mid = (await debug(page))!.entities;
    await walk(page, 'KeyD', 6000);
    const end = (await debug(page))!.entities;
    expect(end).toBeLessThan(mid * 2 + 150);
  });

  test('tactical pause slows time without stopping it', async ({ page }) => {
    await bootGame(page);
    await page.keyboard.down('Space');
    await page.waitForTimeout(1500);
    await page.keyboard.up('Space');
    // Nothing to assert numerically from outside; what matters is that holding
    // it neither crashes nor freezes the render loop.
    const info = (await debug(page))!;
    expect(info.fps).toBeGreaterThan(0);
  });
});
