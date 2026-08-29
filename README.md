# Chronicles of the Lost Realm

[![CI](https://github.com/mp1143/chronicles-of-the-lost-realm/actions/workflows/ci.yml/badge.svg)](https://github.com/mp1143/chronicles-of-the-lost-realm/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

An open-world survival RPG with creature collection, procedural exploration and
base building. One TypeScript codebase, four targets: **web, Android, iOS**, and
desktop later. No engine, no backend, no accounts.

You wake on a shore that should not exist, holding a compass that points at
nothing. The Realm broke a thousand years ago; what is left drifts as Shards,
reassembled by a wounded machine called the Loom. Survive it, map it, tame the
creatures the Loom stitched from its own memory, and decide whether to repair
the Loom or let the Realm end cleanly.

![Exploration](docs/screenshots/02-desktop-explored.png)

---

## Quick start

```bash
npm install
npm run dev
```

Or **install it as an app** — Android, iOS, Windows, macOS, Linux, no toolchain:
build it, serve `dist/` over HTTPS, then use your browser's *Add to Home Screen*
or *Install*. It runs fullscreen and works offline. Full instructions for every
route: **[docs/InstallAndPlay.md](docs/InstallAndPlay.md)**.

**Desktop:** WASD to move, mouse to aim, click to attack, `1`/`2` for skills,
`E` to interact, `Space` for tactical pause, `Shift` to dodge. Gamepad works too.
**Mobile:** a floating stick appears wherever your left thumb lands; actions are
on the right.

Try: gather timber → build a Campfire from the Build panel → craft a Hand Axe →
weaken a creature below 40% health → press `E` to throw a Threadsnare.

In the console, `__spawnBoss()` summons Rootfather Ossuel.

---

## Status

**M2 — vertical slice, built and verified.** The whole core loop runs: explore a
procedurally generated Shard, fight, tame, bond, evolve, gather, craft, build a
base, survive the night, fight a multi-phase boss, and save.

| | |
|---|---|
| Headless tests | 112, all passing |
| End-to-end tests | 66, real Chromium, desktop + mobile profiles |
| Balance gate | passing (120 simulated boss fights per run) |
| Installable | PWA (offline-capable), plus committed Android and iOS projects |
| Simulation cost | 0.55 ms/tick with 83 entities (4 ms budget) |
| Cold start | 105 ms |
| Initial payload | 215 KB gzipped |
| Creatures | 40, across 16 evolution lines |

---

## Commands

```bash
npm run dev          # dev server with hot content reload
npm run build        # production bundle into dist/
npm run preview      # serve the production build

npm run verify       # everything below, in cost order
npm run typecheck    # strict tsc
npm test             # 112 unit, property, simulation and perf tests
npm run balance      # headless balance simulator + CI gate
npm run e2e          # 66 browser tests, desktop + mobile
npm run e2e:ui       # the same, interactively

npm run icons        # regenerate the PWA/launcher icon set from one SVG
npm run sync:android # build + copy into the Android project
npm run sync:ios     # build + copy into the iOS project
```

---

## Documentation

| Document | What it covers |
|---|---|
| [Install and Play](docs/InstallAndPlay.md) | Every way to run it — browser, PWA, source, Android, iOS, desktop — plus controls and troubleshooting |
| [Game Design Document](docs/GameDesignDocument.md) | Story, lore, world, 40 creatures, combat, economy, crafting, bosses, events, accessibility |
| [Technical Design](docs/TechnicalDesign.md) | Stack decision, architecture diagram, ECS, saves, AI, procedural generation, performance budget |
| [Test Plan](docs/TestPlan.md) | Every test case, every gate, and what is deliberately not automated |
| [Asset Specifications](docs/AssetSpecifications.md) | Sprite, tile, palette, audio and UI contracts for replacing the procedural placeholder art |
| [UI Mockups](docs/UIMockups.md) | Layouts, touch rules, screenshots from the running build |
| [Deployment Guide](docs/DeploymentGuide.md) | Web, Android, iOS and desktop build instructions; CI; release checklist |
| [Roadmap](docs/Roadmap.md) | What is built, what is next, what is deliberately deferred |
| [Contributing](CONTRIBUTING.md) | Setup, the four CI gates, house rules, and good first issues |

---

## Architecture in one screen

```
platform/   adapters: input (touch/KBM/gamepad), storage    ← the only platform-aware code
core/       loop, ECS, events, seeded RNG, noise, config
sim/        systems: movement, combat, status, AI, survival, streaming, progression
world/      deterministic terrain, biomes, chunks, deltas
content/    creatures, skills, items, recipes, biomes, structures, bosses, statuses
render/     PixiJS renderer, procedural textures
ui/         Preact HUD and panels
persist/    versioned saves with migrations
```

Six load-bearing decisions:

1. **No game engine.** TypeScript + PixiJS + Capacitor. A 2D tile game does not
   need Unity's 60 MB base APK or Godot's web-export friction.
2. **`core/` and `sim/` import nothing platform-specific.** That boundary is
   what makes four targets cheap, and it is why the balance simulator can run
   the real combat code headless.
3. **Fixed 30 Hz simulation, interpolated render.** Looks like 60 fps at half
   the CPU. The single largest mobile win available.
4. **The world is never saved.** Only the seed and a delta list — a 40-hour save
   is a few hundred KB instead of tens of megabytes.
5. **Every subsystem gets its own forked RNG stream.** Adding a resource type in
   a patch therefore cannot shift the terrain of an existing save.
6. **Content is data.** Adding a creature, skill, item or recipe never requires
   a code change, and the placeholder art generates itself from the definition.

---

## Five bugs the automation caught

Worth recording, because each was invisible to tests written from the design doc
and each made the game meaningfully worse:

- **Percent-of-max-HP damage-over-time.** Poison scaled with the target's health
  pool, so a 12,000 HP boss took ~370 poison damage per second from a level-12
  creature. Raising boss HP raised the DoT with it — boss health bars were
  meaningless. Found by the balance simulator when a 5× HP increase moved
  time-to-kill by one second. Now capped by the applier's own stats: unchanged
  on ordinary enemies, bounded on large ones.
- **Melee range ignored body size.** Collision separation pushed a 1.9-tile boss
  further away than its own attack range, so it approached forever and never
  attacked. Every large enemy was harmless. Ranges are now surface-to-surface.
- **Camera offset on every phone.** `renderer.width` is already in stage
  coordinates; dividing it by `resolution` shifted the camera on any device with
  a resolution other than 1. Found by a screenshot, now asserted in CI.
- **The Save button was unreachable.** It wrote to `slot1`, but startup only
  ever read `auto1`. Press Save, reload, lose the run. Boot now resumes the
  newest save from any slot. Caught by the e2e persistence spec.
- **The panel scrim covered the menu bar**, so the only way out of a panel was
  the X, and switching panels directly was impossible. Caught by a Playwright
  click timing out.

All five have regression tests.

---

## Contributing

Pull requests are welcome. Fork it, branch, make `npm run verify` pass, and open
a PR — [CONTRIBUTING.md](CONTRIBUTING.md) covers the setup, the four CI gates,
and the handful of house rules that are load-bearing (seeded randomness, the
platform boundary, save migrations).

Good first contributions: a creature, a recipe, a biome hazard, or an
accessibility improvement. All of those are data or small, isolated changes.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
Security reports go through [SECURITY.md](SECURITY.md), not public issues.

---

## Licence

[MIT](LICENSE). The placeholder art and audio are generated procedurally from
the content definitions, so there are no third-party asset licences to track.
