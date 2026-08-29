import { test, expect } from '@playwright/test';
import { bootGame, debug, dismissGuide } from './helpers';

// These only make sense on a touch device profile.
test.describe('mobile layout and controls', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch-only assertions');

  test('renders on-screen controls', async ({ page }) => {
    await bootGame(page);
    const buttons = page.locator('.touch-btn');
    await expect(buttons.first()).toBeVisible();
    expect(await buttons.count()).toBeGreaterThanOrEqual(5);
  });

  test('every touch target meets the 48px minimum', async ({ page }) => {
    await bootGame(page);
    const undersized = await page.evaluate(() =>
      [...document.querySelectorAll('.touch-btn, .menu-btn, .party-card')]
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { label: b.getAttribute('aria-label') ?? b.textContent?.trim(), w: Math.round(r.width), h: Math.round(r.height) };
        })
        .filter((b) => b.w > 0 && (b.w < 48 || b.h < 48)),
    );
    expect(undersized, JSON.stringify(undersized)).toEqual([]);
  });

  test('controls carry accessible labels', async ({ page }) => {
    await bootGame(page);
    const unlabelled = await page.evaluate(() =>
      [...document.querySelectorAll('.touch-btn')].filter((b) => !b.getAttribute('aria-label')).length,
    );
    expect(unlabelled).toBe(0);
  });

  test('the floating stick appears where the thumb lands', async ({ page }) => {
    await bootGame(page);
    const box = (await page.locator('#game canvas').boundingBox())!;
    const x = box.x + box.width * 0.2;
    const y = box.y + box.height * 0.7;

    await page.touchscreen.tap(x, y);
    // A tap is press+release; hold instead so the stick stays visible.
    await page.mouse.move(x, y);
    await page.mouse.down();
    await expect(page.locator('.stick-base')).toBeVisible();
    const stick = (await page.locator('.stick-base').boundingBox())!;
    expect(Math.abs(stick.x + stick.width / 2 - x)).toBeLessThan(20);
    expect(Math.abs(stick.y + stick.height / 2 - y)).toBeLessThan(20);
    await page.mouse.up();
    await expect(page.locator('.stick-base')).toHaveCount(0);
  });

  test('survives an orientation change with the camera still centred', async ({ page }) => {
    await bootGame(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(2500);
    await dismissGuide(page);

    const info = (await debug(page))!;
    expect(Math.abs(info.playerScreen.x - info.screen.w / 2)).toBeLessThan(40);
    expect(Math.abs(info.playerScreen.y - info.screen.h / 2)).toBeLessThan(40);
    await expect(page.locator('.touch-btn').first()).toBeVisible();
  });

  test('the menu collapses behind a toggle and does not cover panels', async ({ page }) => {
    await bootGame(page);
    // Nine permanently visible buttons would cover a quarter of a phone screen
    // (in portrait or landscape — the collapse triggers on either axis), and
    // they used to sit on top of every open panel.
    await expect(page.locator('.menu-toggle')).toBeVisible();
    await expect(page.locator('.menu.open')).toHaveCount(0);

    await page.locator('.menu-toggle').click();
    await expect(page.locator('.menu.open')).toHaveCount(1);

    await page.locator('.menu-btn', { hasText: /^Craft$/ }).click();
    await expect(page.locator('.panel')).toHaveCount(1);
    // Choosing a panel dismisses the sheet, so nothing overlaps the content.
    await expect(page.locator('.menu.open')).toHaveCount(0);
    // ...and the toggle stands down, because it occupies the same corner as the
    // panel's close button. Both being there made the X unclickable.
    await expect(page.locator('.menu-toggle')).toHaveCount(0);

    // The panel's own close button must be reachable and must work.
    await page.locator('.panel-head .close').click();
    await expect(page.locator('.panel')).toHaveCount(0);
    await expect(page.locator('.menu-toggle')).toBeVisible();
  });

  test('panels are usable at a narrow width', async ({ page }) => {
    await bootGame(page);
    await page.locator('.menu-toggle').click();
    await page.locator('.menu-btn', { hasText: /^Bag$/ }).click();
    const panel = page.locator('.panel');
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.height).toBeLessThanOrEqual(viewport.height);
  });
});

test.describe('desktop layout', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop-only assertions');

  test('does not render touch controls on a pointer device', async ({ page }) => {
    await bootGame(page);
    await expect(page.locator('.touch-btn')).toHaveCount(0);
  });

  test('menu buttons stay reachable while a panel is open', async ({ page }) => {
    // Regression: the panel scrim covered the menu bar, so the only way out of
    // a panel was the X, and switching panels was impossible.
    await bootGame(page);
    await page.locator('.menu-btn', { hasText: /^Bag$/ }).click();
    await expect(page.locator('.panel')).toHaveCount(1);
    await page.locator('.menu-btn', { hasText: /^Craft$/ }).click();
    await expect(page.locator('.panel-head h2')).toHaveText('craft');
  });
});
