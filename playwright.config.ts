import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * The suite drives the *production build* through a real browser: WebGL context
 * creation, procedural texture generation, DOM wiring, input, IndexedDB saves
 * and the service worker. None of that is reachable from the headless unit
 * tests, and all of it has broken at least once.
 *
 *   npm run e2e            # build, serve, run everything
 *   npm run e2e:ui         # interactive
 */
export default defineConfig({
  testDir: './e2e',
  // Generating a shard and streaming entities takes a few seconds under
  // software rendering in CI; a 5s default would flake constantly.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // the shared preview server and IndexedDB do not like it
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: process.env.E2E_URL ?? 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        launchOptions: {
          // CI runners have no GPU. SwiftShader is slow but exercises the real
          // WebGL path rather than skipping it.
          args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
        },
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        launchOptions: {
          args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
        },
      },
    },
  ],

  // Serves the real production bundle, not the dev server.
  webServer: process.env.E2E_URL
    ? undefined
    : {
        command: 'npm run build && npx vite preview --port 4173 --host 127.0.0.1',
        url: 'http://127.0.0.1:4173',
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
      },
});
