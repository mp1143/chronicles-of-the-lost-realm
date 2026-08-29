# Deployment & Build Guide

One codebase, four targets. There is no platform-specific game code — only the
adapters in `src/platform/` (TechnicalDesign §1.1), so every build below wraps
the same `dist/`.

**Prerequisites:** Node 20+, npm 10+.

```bash
npm install
```

---

## 1. Local development

```bash
npm run dev
```

Vite serves on `http://localhost:5173` with hot module replacement. Editing
`src/content/*.ts` reloads creature, item and skill data live — no restart.

To test on a phone on the same network, Vite is already bound to `0.0.0.0`;
open the Network URL it prints.

### In-page hooks

Defined in `src/app/testHooks.ts` and used by the e2e suite. They call the real
systems, so they are also the fastest way to reproduce a bug by hand.

```js
__debug()                       // camera, entities, chunks, fps, sim/render ms
__spawnBoss()                   // Rootfather Ossuel, next to the player
__test.grant('iron_ingot', 10)  // through the real inventory path
__test.build('campfire')        // through the real placement rules
__test.hitSomething()           // damages the nearest wild creature
__test.advanceBossPhase()
__test.itemCount('timber')
__test.rosterSize()
__test.playerLevel()
```

---

## 2. Web / HTML5 build

```bash
npm run build
```

Output lands in `dist/`. Measured on this build:

| Chunk | Raw | Gzipped |
|---|---|---|
| `pixi-*.js` (renderer) | 533 KB | 154 KB |
| `index-*.js` (game) | 176 KB | 59 KB |
| `index-*.css` | 7 KB | 2 KB |
| **Total initial payload** | **716 KB** | **215 KB** |

`base` is set to `./` in `vite.config.ts`, so the build works from any path —
a subdirectory, a CDN, or a `file://` URL inside a WebView. No server-side
rendering, no API, no backend: it is a static bundle.

### Serving it

```bash
npm run preview
```

Any static host works. Two requirements:

1. **Serve `index.html` for unknown paths** if you add routing later. Today there
   is a single entry point, so the default config of any host is fine.
2. **Set long cache headers on `/assets/*`** — filenames are content-hashed —
   and `no-cache` on `index.html`.

Example Nginx:

```nginx
server {
  root /var/www/chronicles/dist;
  location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
  location / { try_files $uri $uri/ /index.html; add_header Cache-Control "no-cache"; }
}
```

Netlify / Vercel / Cloudflare Pages / GitHub Pages: build command `npm run build`,
publish directory `dist`. Nothing else to configure.

### Browser support

WebGL2 and ES2022. That is Chrome/Edge 94+, Firefox 93+, Safari 16.4+. PixiJS
falls back to WebGL1 automatically where WebGL2 is missing.

---

## 2b. Progressive Web App

The static build is also an installable, offline-capable app. This is the route
that reaches Android, iOS and desktop with **no native toolchain at all**, and
it is covered by the e2e suite (`e2e/pwa.spec.ts`).

What ships:

| File | Purpose |
|---|---|
| `public/manifest.webmanifest` | name, icons, fullscreen landscape, `#0c0e14` splash |
| `public/sw.js` | offline cache — network-first for navigation, cache-first for hashed assets |
| `public/icons/*` | 64–1024 px, plus maskable and Apple touch variants |

Icons are generated from one SVG by `npm run icons` (it drives the Chromium that
already ships with the dev dependencies rather than adding an image library).

**Requirements for installation:** served over HTTPS — `localhost` is exempt —
with the manifest and both a 192 px and a 512 px icon reachable. The e2e suite
asserts all of that, including that the game still boots with the network cut.

The service worker deliberately does **not** register in `npm run dev` (it would
cache the very modules you are editing) or under Capacitor's custom scheme
(where the assets are already on the device).

---

## 3. Android build

### One-time setup

Install Android Studio (Ladybug or newer) with SDK 34+ and **JDK 17**.
Capacitor 7's Gradle plugin will not build on JDK 11.

`android/` is already generated and committed — it is a real Gradle project and
will accumulate signing config, icons and store metadata. To recreate it from
scratch:

```bash
npx cap add android
```

### Every build

```bash
npm run sync:android      # vite build + cap sync
npm run open:android      # opens Android Studio
```

Or from the command line:

```bash
cd android && ./gradlew assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/`.

### Release build

1. Generate a keystore once and store it **outside** the repo:

   ```bash
   keytool -genkey -v -keystore chronicles.keystore \
     -alias chronicles -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Create `android/keystore.properties` (add it to `.gitignore`):

   ```properties
   storeFile=/absolute/path/chronicles.keystore
   storePassword=...
   keyAlias=chronicles
   keyPassword=...
   ```

3. Wire it into `android/app/build.gradle` under `signingConfigs`, then:

   ```bash
   cd android && ./gradlew bundleRelease
   ```

   The `.aab` for Play Console lands in `android/app/build/outputs/bundle/release/`.

### Android checklist

- `minSdkVersion` 24 (Android 7.0) — that is where WebView WebGL2 is dependable.
- `targetSdkVersion` 34+ (Play requirement).
- Background colour is set to `#0c0e14` in `capacitor.config.ts`; without it the
  WebView flashes white on launch, which is the most visible polish bug on Android.
- Declare **no** permissions. The game needs none. Every permission in the
  manifest is a conversion loss at install time.
- Test on a real mid-tier device (Snapdragon 6-series class), not only the
  emulator — the emulator's GPU is not representative.

---

## 4. iOS build

### One-time setup

macOS with Xcode 15+, CocoaPods, and an Apple Developer account.

`ios/` is already generated and committed. On a Mac, run `pod install` once:

```bash
cd ios/App && pod install
```

### Every build

```bash
npm run sync:ios
npm run open:ios          # opens Xcode
```

Then Product → Run, or archive for distribution.

### iOS specifics that actually matter

- **`contentInset: 'never'` and `scrollEnabled: false`** are set in
  `capacitor.config.ts`. Without them the WebView bounces against the canvas and
  the game feels broken.
- **Safe areas.** The UI uses `env(safe-area-inset-*)` throughout
  (`src/ui/styles.css`), and `index.html` sets `viewport-fit=cover`. Verify on a
  notched device in landscape, where the inset is on the side.
- **`pagehide`, not `unload`.** iOS does not reliably fire `unload`, so the
  autosave on teardown listens for `pagehide` (`src/main.ts`).
- **JIT.** WKWebView gets JIT for the main context. If a profile on real
  hardware shows the simulation missing budget, drop `SIM_HZ` to 20 in
  `src/core/config.ts` before touching anything else — the render interpolation
  hides it.
- Set `ITSAppUsesNonExemptEncryption` to `NO` in `Info.plist` to skip the export
  compliance questionnaire on every upload.

---

## 5. Desktop (post-launch)

Tauri 2 wraps the same `dist/` in a ~5 MB binary instead of Electron's ~100 MB:

```bash
npm i -D @tauri-apps/cli
npx tauri init --app-name "Chronicles of the Lost Realm" \
  --dist-dir ../dist --dev-path http://localhost:5173
npx tauri build
```

Nothing in the game changes. This is deliberately out of scope for v1.0
(GDD §16) and listed here so the path is written down, not so it gets built now.

---

## 6. CI

```yaml
# .github/workflows/ci.yml — see the committed file for the full version
- run: npm run typecheck
- run: npm test          # 112 unit, property, simulation and perf tests
- run: npm run balance   # 120 simulated boss fights, gated on design bands
- run: npx playwright install --with-deps chromium
- run: npm run e2e       # 66 browser tests, desktop + mobile profiles
```

Four gates, in cost order: types, tests, balance, then a real browser.

`npm run verify` runs the same four locally.

---

## 7. Release checklist

- [ ] `npm run verify` green (typecheck, tests, balance, e2e)
- [ ] PWA installs and runs offline from the deployed URL
- [ ] Save migration fixture added if `CURRENT_SCHEMA` changed
- [ ] Bundle size still under 300 KB gzipped
- [ ] Tested on one low-end Android and one iPhone, both orientations
- [ ] Cold start under 5 s on the low-end device
- [ ] Version bumped in `package.json`, `android/app/build.gradle`, Xcode target
