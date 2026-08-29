import { test, expect } from '@playwright/test';
import { bootGame, debug, collectErrors, assertNoErrors, walk } from './helpers';

test.describe('boot and render', () => {
  test('boots to a playable world with no console errors', async ({ page }) => {
    const errors = collectErrors(page);
    await bootGame(page);

    const canvas = page.locator('#game canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box!.width).toBeGreaterThan(200);
    expect(box!.height).toBeGreaterThan(200);

    await expect(page.locator('.vitals .meter')).toHaveCount(4);
    await expect(page.locator('.menu-btn')).toHaveCount(9);

    const info = await debug(page);
    expect(info).not.toBeNull();
    expect(info!.chunks).toBeGreaterThan(8);

    assertNoErrors(errors);
  });

  test('keeps the camera on the player', async ({ page }) => {
    // Regression: renderer.width is already in stage coordinates. Dividing it by
    // `resolution` offset the camera on every device with a resolution other
    // than 1 -- which is every phone.
    await bootGame(page);
    const info = (await debug(page))!;
    expect(Math.abs(info.playerScreen.x - info.screen.w / 2)).toBeLessThan(24);
    expect(Math.abs(info.playerScreen.y - info.screen.h / 2)).toBeLessThan(24);
  });

  test('starts in daylight, not at midnight', async ({ page }) => {
    await bootGame(page);
    const clock = await page.locator('.chip').first().textContent();
    expect(clock).toContain('☀');
  });

  test('streams entities in as the player explores', async ({ page }) => {
    await bootGame(page);
    const before = (await debug(page))!;

    await walk(page, 'KeyD', 2500);
    await walk(page, 'KeyS', 2500);

    const after = (await debug(page))!;
    expect(after.entities).toBeGreaterThan(4);
    // Bounded, not unbounded: streaming must despawn what it leaves behind.
    expect(after.entities).toBeLessThan(before.entities * 4 + 200);
  });

  test('stays inside the simulation budget', async ({ page }) => {
    await bootGame(page);
    await walk(page, 'KeyD', 3000);
    const info = (await debug(page))!;
    // Generous: this is software rendering on a shared CI runner. The gate is
    // for order-of-magnitude regressions, not for tuning.
    expect(info.simMs).toBeLessThan(16);
  });
});
