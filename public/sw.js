/**
 * Offline service worker.
 *
 * The game has no backend: once the bundle is cached it runs entirely offline,
 * with saves in IndexedDB. That makes offline support a ~50 line cache rather
 * than a build-integrated precache manifest.
 *
 * ponytail: runtime caching, not precaching. The cost is that the very first
 * visit must be online (it already is — you are downloading the game). Upgrade
 * path if an install-then-immediately-offline flow ever matters: emit a hashed
 * asset list at build time and precache it here.
 */

// Bump to invalidate every cached asset. Vite content-hashes filenames, so this
// only needs bumping when index.html or the worker itself changes shape.
const CACHE = 'chronicles-v1';

self.addEventListener('install', (event) => {
  // The shell is the only thing worth precaching; everything else is hashed and
  // picked up on first use.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['./', './index.html', './manifest.webmanifest']))
      .catch(() => {
        // A failed precache must not block activation — runtime caching still works.
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first so a deployed update is picked up promptly,
  // falling back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html').then((r) => r ?? Response.error())),
    );
    return;
  }

  // Assets are content-hashed, so a cache hit is always correct and always the
  // fastest answer.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
