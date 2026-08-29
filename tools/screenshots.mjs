/**
 * Regenerates the screenshots used in docs/UIMockups.md and the README.
 *
 * Separate from the e2e suite on purpose: those tests assert behaviour, this
 * one produces artwork for the documentation. Run it after a UI change.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node tools/screenshots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';
const outDir = process.argv[3] ?? 'docs/screenshots';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});

async function shot(page, name) {
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`  ${outDir}/${name}.png`);
}

async function fresh(page) {
  await page.goto(url);
  await page.evaluate(async () => {
    localStorage.clear();
    const dbs = (await indexedDB.databases?.()) ?? [];
    await Promise.all(
      dbs.map(
        (d) =>
          new Promise((resolve) => {
            if (!d.name) return resolve();
            const r = indexedDB.deleteDatabase(d.name);
            r.onsuccess = r.onerror = r.onblocked = () => resolve();
          }),
      ),
    );
  });
  await page.goto(url);
  await page.waitForSelector('#game canvas');
  await page.waitForSelector('.vitals');
  await page.waitForTimeout(3000);
}

async function dismissGuide(page) {
  const begin = page.getByRole('button', { name: 'Begin' });
  if (await begin.isVisible().catch(() => false)) await begin.click();
}

// ---------- desktop ----------
const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await fresh(desktop);
await shot(desktop, '00-first-run-guide');
await dismissGuide(desktop);
await shot(desktop, '01-desktop-boot');

for (const key of ['KeyD', 'KeyS', 'KeyA', 'KeyW']) {
  await desktop.keyboard.down(key);
  await desktop.waitForTimeout(1200);
  await desktop.keyboard.up(key);
}
await shot(desktop, '02-desktop-explored');

for (let i = 0; i < 6; i++) {
  await desktop.mouse.click(760, 400);
  await desktop.keyboard.press('Digit1');
  await desktop.waitForTimeout(220);
}
await shot(desktop, '03-desktop-combat');

// Give the build and craft panels something to show.
await desktop.evaluate(() => {
  const t = globalThis.__test;
  t.grant('timber', 60);
  t.grant('stone_block', 60);
  t.grant('iron_ingot', 6);
  t.grant('raw_meat', 4);
  t.build('campfire');
});

for (const [label, name] of [
  ['Craft', 'craft'],
  ['Build', 'build'],
  ['Map', 'map'],
  ['Codex', 'codex'],
  ['Log', 'log'],
  ['Bag', 'bag'],
]) {
  await desktop.locator('.menu-btn', { hasText: new RegExp(`^${label}$`) }).click();
  await desktop.waitForTimeout(600);
  await shot(desktop, `04-panel-${name}`);
  await desktop.locator('.menu-btn', { hasText: new RegExp(`^${label}$`) }).click();
  await desktop.waitForTimeout(200);
}

await desktop.evaluate(() => globalThis.__spawnBoss?.());
await desktop.waitForTimeout(2500);
await shot(desktop, '05-desktop-boss');
await desktop.close();

// ---------- mobile ----------
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
});
await fresh(mobile);
await shot(mobile, '06-mobile-first-run');
await dismissGuide(mobile);
await shot(mobile, '07-mobile-portrait');

await mobile.setViewportSize({ width: 844, height: 390 });
await mobile.waitForTimeout(2500);
await shot(mobile, '08-mobile-landscape');
await mobile.close();

await browser.close();
console.log('Screenshots regenerated.');
