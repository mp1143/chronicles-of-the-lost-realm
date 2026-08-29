import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [preact()],
  base: './', // relative paths: required for Capacitor WebView and static hosting alike
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split the renderer out of app code so gameplay patches don't re-download Pixi.
        manualChunks: { pixi: ['pixi.js'] },
      },
    },
  },
  server: { host: true, port: 5173 },
});
