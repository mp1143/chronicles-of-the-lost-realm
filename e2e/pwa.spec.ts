import { test, expect } from '@playwright/test';
import { bootGame } from './helpers';

/**
 * The PWA path is how the game is actually installed on a phone or a desktop
 * without a native toolchain, so it gets the same scrutiny as gameplay.
 */
test.describe('installability', () => {
  test('serves a valid manifest with the required icon sizes', async ({ page, request, baseURL }) => {
    await page.goto('/');
    const href = await page.getAttribute('link[rel="manifest"]', 'href');
    expect(href).toBeTruthy();

    const res = await request.get(new URL(href!, baseURL).toString());
    expect(res.ok()).toBe(true);
    const manifest = await res.json();

    expect(manifest.name).toContain('Chronicles');
    expect(manifest.short_name.length).toBeLessThanOrEqual(12); // launcher truncation
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.background_color).toBe('#0c0e14');

    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    // Chrome requires a 192 and a 512 before it will offer installation.
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  });

  test('every declared icon actually exists', async ({ page, request, baseURL }) => {
    await page.goto('/');
    const href = await page.getAttribute('link[rel="manifest"]', 'href');
    const manifest = await (await request.get(new URL(href!, baseURL).toString())).json();

    for (const icon of manifest.icons as Array<{ src: string }>) {
      const res = await request.get(new URL(icon.src, baseURL).toString());
      expect(res.ok(), `${icon.src} is missing`).toBe(true);
      expect(res.headers()['content-type']).toContain('image');
    }

    for (const rel of ['icon', 'apple-touch-icon']) {
      const src = await page.getAttribute(`link[rel="${rel}"]`, 'href');
      expect(src, `<link rel="${rel}"> is missing`).toBeTruthy();
      expect((await request.get(new URL(src!, baseURL).toString())).ok()).toBe(true);
    }
  });

  test('registers a service worker and takes control', async ({ page }) => {
    await bootGame(page);
    const state = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return 'none';
      await navigator.serviceWorker.ready;
      return reg.active?.state ?? 'pending';
    });
    expect(state).toBe('activated');
  });

  test('the game still boots with the network cut', async ({ page, context }) => {
    // First visit populates the cache.
    await bootGame(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    // Give the runtime cache a moment to take the hashed asset requests.
    await page.waitForTimeout(2000);

    await context.setOffline(true);
    await page.reload();

    await page.waitForSelector('#game canvas', { timeout: 30_000 });
    await page.waitForSelector('.vitals', { timeout: 30_000 });

    await context.setOffline(false);
  });

  test('sets a viewport and theme suitable for a fullscreen install', async ({ page }) => {
    await page.goto('/');
    const viewport = await page.getAttribute('meta[name="viewport"]', 'content');
    expect(viewport).toContain('viewport-fit=cover'); // notch safe areas
    expect(viewport).toContain('user-scalable=no'); // pinch-zoom would fight the canvas
    expect(await page.getAttribute('meta[name="theme-color"]', 'content')).toBe('#0c0e14');
  });
});
