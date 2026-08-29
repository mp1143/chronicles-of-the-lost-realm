import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  base: './', // relative paths: required for Capacitor WebView and static hosting alike
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split the renderer out of app code so gameplay patches don't re-download
        // Pixi. Rolldown (Vite 8+) takes a function here, not an object map.
        manualChunks(id: string) {
          if (id.includes('node_modules/pixi.js')) return 'pixi';
          return undefined;
        },
      },
    },
  },
  server: { host: true, port: 5173 },
});
