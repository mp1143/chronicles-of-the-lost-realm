# Install and Play

Five ways to run it, in order of how little you need installed.

| Route | Needs | Offline after first load | Verified here |
|---|---|---|---|
| **1. Browser** | a browser | — | ✅ automated e2e |
| **2. Install as an app (PWA)** | a browser | ✅ | ✅ automated e2e |
| **3. Run from source** | Node 20+ | ✅ | ✅ |
| **4. Android APK** | Android Studio, JDK 17 | ✅ | ⚠️ project scaffolded, not compiled here |
| **5. iOS** | a Mac, Xcode 15+ | ✅ | ⚠️ project scaffolded, not compiled here |

Routes 4 and 5 need SDKs that are not present on this machine (no Android SDK,
no macOS), so the native projects are generated and wired but the binaries have
not been built. Everything else has been driven end to end by the test suite.

---

## 1. Play in a browser

```bash
npm install
npm run dev
```

Open the URL it prints — `http://localhost:5173`. That is the whole thing.

To play on your phone over the same Wi-Fi, use the **Network** URL Vite prints
(Vite is already bound to all interfaces).

### Controls

| Desktop | |
|---|---|
| `W A S D` | Move |
| Mouse | Aim |
| Click or `J` | Attack |
| `1` / `2` | Skills |
| `E` | Gather · use a station · throw a Threadsnare |
| `Shift` | Dodge |
| `Space` | Tactical pause — time drops to 15%, not zero |

Gamepad works too: left stick moves, right stick aims, A attacks, X/Y skills,
B dodges.

| Touch | |
|---|---|
| Left thumb, anywhere | Move — the stick appears where you touch |
| Drag on the right | Aim |
| `ATK` | Attack |
| Skill buttons | Your two equipped abilities |
| `USE` | Gather · use a station · throw a Threadsnare |
| `DASH` | Dodge |
| `SLOW` | Tactical pause |

The first-run guide covers all of this in game, and you can reopen it any time
from **Log → How to play**.

---

## 2. Install it as an app (PWA) — recommended

This is the route that works on **Android, iOS, Windows, macOS and Linux** with
no toolchain at all. The game is fully offline-capable once installed: there is
no backend, and saves live in the browser's IndexedDB.

First, serve the production build somewhere:

```bash
npm run build
npm run preview          # http://localhost:4173
```

For a phone, put `dist/` on any static host — Netlify, Vercel, Cloudflare
Pages, GitHub Pages, or an Nginx box. Build command `npm run build`, publish
directory `dist`. Nothing else to configure.

> **HTTPS is required** for installation and offline support, except on
> `localhost`. A plain `http://` LAN address will run the game but will not
> offer to install it.

### Android (Chrome / Edge / Samsung Internet)

1. Open the URL.
2. Menu **⋮** → **Add to Home screen** (or the install prompt in the address bar).
3. Launch it from the home screen. It runs fullscreen, landscape, no browser UI.

### iOS / iPadOS (Safari — must be Safari)

1. Open the URL in Safari.
2. **Share** → **Add to Home Screen** → **Add**.
3. Launch from the home screen.

### Desktop (Chrome / Edge)

Click the install icon in the address bar, or menu → **Cast, save and
share** → **Install page as app**. It gets its own window and launcher entry.

---

## 3. Run from source

```bash
git clone <repo>
cd chronicles-of-the-lost-realm
npm install
npm run dev
```

Requires Node 20+ and npm 10+. Nothing else — no database, no API keys, no
services.

Verify the whole project:

```bash
npm run verify     # typecheck + 112 unit tests + balance gate + e2e suite
```

Or individually:

```bash
npm run typecheck
npm test           # 112 unit, property, simulation and performance tests
npm run balance    # 120 simulated boss fights, gates on the design bands
npm run e2e        # real browser, desktop + mobile profiles
npm run e2e:ui     # the same, interactively
```

---

## 4. Android APK

The Capacitor project is committed at `android/`, and `npm run sync:android`
already copies the built game into it.

**You need:** Android Studio (Ladybug or newer), Android SDK 34+, **JDK 17**.
Capacitor 7's Gradle plugin will not build on JDK 11.

```bash
npm run sync:android     # builds the web bundle and copies it in
npm run open:android     # opens Android Studio
```

Then press Run, with a device connected or an emulator started.

From the command line instead:

```bash
cd android
./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Release build

1. Create a keystore once, and keep it **outside** the repo:

   ```bash
   keytool -genkey -v -keystore chronicles.keystore \
     -alias chronicles -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Create `android/keystore.properties` (already gitignored):

   ```properties
   storeFile=/absolute/path/chronicles.keystore
   storePassword=...
   keyAlias=chronicles
   keyPassword=...
   ```

3. Reference it from `android/app/build.gradle` under `signingConfigs`, then:

   ```bash
   cd android && ./gradlew bundleRelease
   # AAB for Play Console: android/app/build/outputs/bundle/release/
   ```

The app declares **no permissions**. It does not need any.

---

## 5. iOS

The Capacitor project is committed at `ios/`.

**You need:** macOS, Xcode 15+, CocoaPods, and an Apple Developer account for
anything beyond your own device.

```bash
npm run sync:ios
cd ios/App && pod install     # first time only
cd ../.. && npm run open:ios  # opens Xcode
```

In Xcode: select your team under Signing & Capabilities, choose a device, Run.

For TestFlight or the App Store: Product → Archive → Distribute App. Set
`ITSAppUsesNonExemptEncryption` to `NO` in `Info.plist` to skip the export
compliance questionnaire on every upload.

---

## 6. Desktop app (optional)

Not part of v1.0, but the path is short — Tauri wraps the same `dist/` in a
~5 MB binary instead of Electron's ~100 MB:

```bash
npm i -D @tauri-apps/cli
npx tauri init --app-name "Chronicles of the Lost Realm" \
  --dist-dir ../dist --dev-path http://localhost:5173
npx tauri build
```

Needs the Rust toolchain. No game code changes.

---

## Your first ten minutes

1. **Gather.** Walk into a tree or bush and press `E` / `USE`. Timber and Fiber
   are the foundation of everything.
2. **Build a Campfire.** Open **Build**, place it. It gives light, warmth,
   cooking, and holds the Duskveil back a little.
3. **Craft.** Stand next to the fire and open **Craft**. Make a Hand Axe (trees
   go much faster) and some Threadsnares.
4. **Fight something.** Aim and attack. Watch the Thread colours — Verdant beats
   Stone beats Storm beats Tide beats Ember beats Verdant, and an advantage is
   half again the damage.
5. **Tame it.** Once its health bar is below 40%, press `E` / `USE` to throw a
   Threadsnare, then tap on each beat of the shrinking ring. Failing raises your
   odds with that species permanently, so keep trying.
6. **Bond with it.** Feed it its favourite food (check the **Codex**). Bond
   changes how it fights for you — at 3 it will put itself between you and
   danger, at 7 it will break off a suicidal order to survive.
7. **Watch the clock.** Night is genuinely more dangerous. Be near a fire.

Progress saves automatically every three minutes, when you leave, and whenever
you press **Save**. Dying costs you nothing permanent — you wake on the shore.

Try `__spawnBoss()` in the browser console when you want a real fight.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Black screen, no canvas | WebGL is disabled or blocked. Check `chrome://gpu`. Hardware acceleration must be on. |
| "Install" never appears | Not served over HTTPS, or the manifest failed to load. `localhost` is exempt from the HTTPS rule. |
| Runs but won't work offline | The service worker only registers on a production build over http/https — not in `npm run dev`. |
| Low frame rate | The game drops render resolution automatically below 45 fps. On a very old device, lower `SIM_HZ` in `src/core/config.ts` from 30 to 20. |
| Progress vanished | Saves are per-origin in IndexedDB. A different URL, or clearing site data, is a different save. Private/incognito windows discard everything on close. |
| Android build fails on Gradle | You are on JDK 11. Capacitor 7 needs JDK 17. |
| `pod install` fails | Install CocoaPods: `sudo gem install cocoapods`. |
| Touch controls missing on a laptop | They only render on a touch device. That is deliberate. |
