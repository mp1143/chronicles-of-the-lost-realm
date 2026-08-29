/**
 * Generates the PWA / launcher icon set from one SVG.
 *
 * Uses the Chromium that already ships with the dev dependencies rather than
 * adding an image library. One source of truth, regenerated on demand:
 *
 *   node tools/make-icons.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'public/icons';
mkdirSync(OUT, { recursive: true });

/**
 * The Loomcompass: an instrument that points at things that are wrong.
 * `safe` insets the artwork for maskable icons, where Android may crop up to
 * 20% off every edge.
 */
const svg = (safe) => {
  const s = safe ? 0.68 : 0.86; // fraction of the canvas the artwork occupies
  const r = 256 * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0c0e14"/>
  <circle cx="256" cy="256" r="${r}" fill="none" stroke="#2c3242" stroke-width="${28 * s}"/>
  <circle cx="256" cy="256" r="${r * 0.78}" fill="none" stroke="#6a4a9e" stroke-width="${10 * s}" opacity="0.7"/>
  <g transform="rotate(-34 256 256)">
    <path d="M256 ${256 - r * 0.72} L${256 + r * 0.2} 256 L256 ${256 + r * 0.16} L${256 - r * 0.2} 256 Z" fill="#9a7fd4"/>
    <path d="M256 ${256 + r * 0.72} L${256 - r * 0.2} 256 L256 ${256 - r * 0.16} L${256 + r * 0.2} 256 Z" fill="#f2e9c9"/>
  </g>
  <circle cx="256" cy="256" r="${r * 0.1}" fill="#e2c044"/>
</svg>`;
};

writeFileSync('public/icon.svg', svg(false));

const browser = await chromium.launch();
const page = await browser.newPage();

/** Renders one SVG at one size and writes a PNG. */
async function emit(name, size, safe) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:#0c0e14}svg{display:block;width:${size}px;height:${size}px}</style>${svg(safe)}`,
  );
  await page.screenshot({ path: `${OUT}/${name}`, omitBackground: false });
  console.log(`  ${OUT}/${name}`);
}

for (const size of [64, 128, 192, 256, 512, 1024]) {
  await emit(`icon-${size}.png`, size, false);
}
// Maskable variants: Android crops these into whatever shape the launcher uses.
for (const size of [192, 512]) {
  await emit(`maskable-${size}.png`, size, true);
}
// Apple touch icon must be opaque and square, no transparency, 180px.
await emit('apple-touch-icon.png', 180, false);
// Favicon.
await emit('favicon-32.png', 32, false);

await browser.close();
console.log('Icons written.');
