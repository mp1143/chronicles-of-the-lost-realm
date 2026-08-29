# Contributing

Thanks for wanting to help. This document is short on ceremony and specific
about the few things that actually matter here.

---

## Getting set up

You need **Node 20+** and **npm 10+**. Nothing else — no database, no API keys,
no services.

```bash
git clone https://github.com/<your-username>/chronicles-of-the-lost-realm
cd chronicles-of-the-lost-realm
npm install
npm run dev
```

For the end-to-end suite you also need a browser binary once:

```bash
npx playwright install chromium
```

---

## The workflow

1. **Fork**, then branch from `main`. Name it for the change: `fix/camera-drift`,
   `feat/frostspire-hazards`.
2. Make the change.
3. Run `npm run verify` and get it green.
4. Open a pull request. Fill in the template — especially *how you tested it*.

Small, focused pull requests get reviewed. A 40-file branch that does five
unrelated things does not.

---

## What has to pass

```bash
npm run verify
```

That is four gates in cost order:

| Gate | What it is |
|---|---|
| `npm run typecheck` | strict TypeScript over the whole repo |
| `npm test` | 112 unit, property, simulation and performance tests (Vitest) |
| `npm run balance` | 120 simulated boss fights against the design bands |
| `npm run e2e` | 68 Playwright tests, desktop and mobile profiles |

Individually while iterating:

```bash
npm run typecheck
npm test -- tests/combat.test.ts     # one file
npm run e2e:ui                       # interactive Playwright
npm run e2e -- -g "camera"           # one test by name
```

CI runs the same four on every pull request.

There is deliberately **no linter**. Match the style of the file you are in.

---

## House rules

These are not style preferences; each one is load-bearing.

### `Math.random` is banned in `src/`

Everything random goes through `SeededRNG`. The save file stores a seed and a
delta list and regenerates the world on load, so identical seed *must* mean
identical world.

When you add a subsystem that needs randomness, **fork your own stream**:

```ts
const rng = parentRng.fork('resources/ore');
```

Sharing a stream means adding a feature in a later patch shifts the terrain of
every existing save.

### `core/` and `sim/` import nothing platform-specific

No DOM, no PixiJS, no Capacitor. That boundary is what makes four platforms
cheap and lets the balance simulator run the real combat code headless. Platform
access goes through an adapter in `src/platform/`.

### Presentation reads the ECS, never writes it

Damage numbers, screen shake, audio and quest progress are all subscribers to
the event bus. If you find yourself calling a renderer from a system, emit an
event instead.

### Content is data

Adding a creature, skill, item, recipe, structure or status is a change to a
file in `src/content/` and nothing else. If your content change needs a code
change, the schema is probably wrong — say so in the PR and we will fix the
schema.

### Save compatibility is not negotiable

If you change the shape of `SaveGame`:

1. Bump `CURRENT_SCHEMA` in `src/persist/migrations.ts`.
2. Add a migration from the previous version. Migrations are **append-only** and
   are never edited or deleted once shipped.
3. Add a fixture test that loads a save written by the previous version.

A player's 40-hour file is not recoverable by patching.

### Leave a check behind

Non-trivial logic ships with the smallest test that fails if the logic breaks.
Not a suite — one test. Trivial one-liners need nothing.

---

## Where things live

```
src/core/       loop, ECS, events, seeded RNG, noise, tuning constants
src/sim/        systems: movement, combat, status, AI, survival, streaming, progression
src/world/      deterministic terrain, biomes, chunk streaming, world deltas
src/content/    creatures, skills, items, recipes, biomes, structures, bosses, statuses
src/render/     PixiJS renderer, procedural placeholder textures
src/ui/         Preact HUD and panels
src/platform/   input and storage adapters — the only platform-aware code
src/persist/    versioned saves and migrations
e2e/            Playwright specs
tests/          Vitest specs
tools/          balance simulator, icon generator, screenshot generator
docs/           design, technical, test plan, deployment, roadmap
```

Read [docs/TechnicalDesign.md](docs/TechnicalDesign.md) before a structural
change, and [docs/GameDesignDocument.md](docs/GameDesignDocument.md) before a
design one.

---

## Good first contributions

- **A creature.** Add an entry to `src/content/creatures.ts`. The placeholder
  art generates itself from the definition, so it is playable immediately.
  Content tests will tell you if you missed something.
- **A recipe, item or structure.** Same shape, same story.
- **A biome hazard.** Six of the seven biomes are defined but not yet wired for
  play — see the M3 section of [docs/Roadmap.md](docs/Roadmap.md).
- **Accessibility.** Text scaling and a remappable touch layout are both
  planned and unbuilt; the CSS and the button layout data are already ready for
  them.
- **A balance finding.** Run `npm run balance -- --csv` and tell us what looks
  wrong.

If you want to build something large, open an issue first so nobody duplicates
your work.

---

## Balance and design changes

Numbers are gated by the simulator, not by opinion. If you change a creature's
stats, a skill's power or the damage formula, `npm run balance` must still pass,
and the PR should say what moved and why.

Design changes that contradict [docs/GameDesignDocument.md](docs/GameDesignDocument.md)
are welcome, but update the document in the same PR. A design doc that disagrees
with the code is worse than no design doc.

---

## Reporting bugs

Open an issue with the template. The single most useful thing you can include is
the **world seed** — it is printed in the Map panel, and it makes almost every
world-generation bug reproducible on someone else's machine.

---

## Code of Conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
