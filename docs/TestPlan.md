# Test Plan

**Status:** 112 headless tests, a balance gate, and 66 end-to-end browser tests
across desktop and mobile profiles — all green on the current build.

```bash
npm run verify     # typecheck + tests + balance + e2e, in cost order
```

The strategy is deliberately narrow: test the things that are **expensive to get
wrong** (determinism, saves, balance, the frame budget) and the things a human
cannot check by playing (10,000 combat simulations). Do not test what the type
system already proves.

---

## 1. Layers and gates

| Layer | Tool | Scope | Gate | Current |
|---|---|---|---|---|
| Types | `tsc --noEmit` | whole repo, strict | must pass | ✅ clean |
| Unit | Vitest | formulas, RNG, ECS, events | must pass | ✅ 30 tests |
| Property | Vitest | generation invariants over many seeds | zero failures | ✅ 19 tests |
| Content integrity | Vitest | every id resolves, no cycles | must pass | ✅ 12 tests |
| Simulation | Vitest | 30 Hz sim driven headless | must pass | ✅ 36 tests |
| Persistence | Vitest | round-trip, corruption, migrations | must pass | ✅ 12 tests |
| Performance | Vitest | tick and generation budgets | must pass | ✅ 7 tests |
| Balance | `npm run balance` | 120 boss fights + matchup envelope | in-band | ✅ passing |
| End-to-end | Playwright | real Chromium, desktop + mobile profiles | must pass | ✅ 66 tests |

---

## 2. Test cases

### 2.1 Determinism — the foundation

The save file stores a seed plus deltas and regenerates the world on load, so
"same seed → same world" is not a nice property, it is the load-bearing one.

| ID | Case | Expected |
|---|---|---|
| DET-01 | Same seed, two `ShardTerrain` instances | identical hash |
| DET-02 | Different seed | different hash |
| DET-03 | Same seed, different shard id | different hash |
| DET-04 | 40 seeds, regenerate each | identical every time |
| DET-05 | `SeededRNG` sequence, 200 draws | byte-identical |
| DET-06 | 100,000 draws | all in [0,1) |
| DET-07 | 100,000 draws into 10 buckets | each within 5% of uniform |
| DET-08 | **Fork independent of draw order** | a subsystem drawing first cannot shift another's stream |
| DET-09 | Two different fork ids | different sequences |
| DET-10 | Chunk regenerated twice | identical tiles, nodes and spawns |

DET-08 is the one that matters for live service: without it, adding a resource
type in a patch shifts the terrain of every existing save.

### 2.2 World generation

| ID | Case | Expected |
|---|---|---|
| GEN-01 | Elevation, moisture, temperature | all within [0,1] |
| GEN-02 | Shard edges | mostly water — the radial falloff produces coastlines |
| GEN-03 | Shard centre, 4 seeds | walkable land exists |
| GEN-04 | `classifyBiome` over the whole input cube | always returns a defined biome |
| GEN-05 | Known climate corners | frostspire / dust_sea / mire / ashen as designed |
| GEN-06 | Every node and spawn, 9 chunks | placed on walkable, non-water tiles |
| GEN-07 | Start position, 3 seeds | walkable |
| GEN-08 | Chunk residency, one-tile step | no eviction (hysteresis holds) |
| GEN-09 | Tile override from delta | read back, walkability updated |
| GEN-10 | Line of sight through a placed wall | blocked |

### 2.3 Combat and balance

| ID | Case | Expected |
|---|---|---|
| CMB-01 | Thread cycle, all 5 pairs | 1.5× forward, 0.67× reverse |
| CMB-02 | Radiance/Umbra | mutually 1.5× |
| CMB-03 | Null vs everything, both ways | 1.25× |
| CMB-04 | Dual-thread defender | multiplies both |
| CMB-05 | Damage vs attack and defence | monotonic in both directions |
| CMB-06 | Extreme defence | never below 1 damage |
| CMB-07 | Doubling defence | never more than halves damage |
| CMB-08 | Crit | exactly 1.75× |
| CMB-09 | Variance | within ±6% |
| CMB-10 | Kill a creature | XP awarded, entity reaped, respawn scheduled |
| CMB-11 | Poison over 2 s | health falls |
| CMB-12 | Status past its duration | expires |
| CMB-13 | Freeze the player twice | second blocked by immunity — **no chain-lock** |
| CMB-14 | 4 stacks of Chill | escalates to Freeze, on first application too |
| CMB-15 | Boss health crosses 50% | phase advances, skills swap, adds summoned |
| CMB-16 | Boss HP vs party size | scales sub-linearly |
| CMB-17 | Player health hits 0 | respawn at shore, run continues |
| CMB-18 | **DoT on a 4,200 HP boss** | capped — unchanged on a 300 HP target |
| CMB-19 | **A 1.9-tile boss chasing the player** | actually lands hits |

CMB-18 and CMB-19 are regressions found by the balance simulator and the browser
check respectively. Both were invisible to unit tests written from the design
doc, and both made the game trivially easy in ways a designer would have blamed
on numbers rather than code.

### 2.4 Content integrity

| ID | Case | Expected |
|---|---|---|
| CNT-01 | Creature count | exactly 40 |
| CNT-02 | Every creature | valid id, ≥1 thread, ≥2 skills, 3 bestiary entries |
| CNT-03 | Every skill reference | resolves |
| CNT-04 | Every preferred food | resolves to a real item |
| CNT-05 | Every evolution target | resolves |
| CNT-06 | Every evolution | gains base stats — an evolution must never be a downgrade |
| CNT-07 | Evolution graph | no cycles |
| CNT-08 | Skills with power ≥ 70 | telegraph ≥ 600 ms |
| CNT-09 | Every recipe input and output | resolves |
| CNT-10 | Every boss phase skill, summon and drop | resolves |
| CNT-11 | Boss phase thresholds | strictly descending |
| CNT-12 | Every stunning or rooting status | grants player immunity |

### 2.5 Progression, crafting and taming

| ID | Case | Expected |
|---|---|---|
| PRG-01 | Stats across levels 1–60 | monotonic |
| PRG-02 | Perfect vs zero IVs at 60 | under 20% apart |
| PRG-03 | Bond multiplier | 1.0 / 1.05 / 1.10 |
| PRG-04 | Under-levelled kill | never zero XP |
| PRG-05 | Evolution | IVs and bond survive the rebase |
| PRG-06 | Bond gate unmet | evolution blocked; met, it fires |
| PRG-07 | Feed preferred food ×30 | reaches bond 5, unlocks 4th skill slot |
| PRG-08 | Reserve and re-summon | level, bond and XP preserved |
| CRF-01 | Craft with no station | refused |
| CRF-02 | Craft with missing materials | refused, materials untouched |
| CRF-03 | Build campfire, then craft at it | succeeds |
| CRF-04 | Farm plot away from water | refused with a reason |
| CRF-05 | Item use | effect applied, item consumed |
| CRF-06 | Equip a weapon | attack rises, art granted |
| CRF-07 | Swap weapons three times | no stat double-counting |
| CRF-08 | Harvest to depletion | drops added, node marked spent |
| TAM-01 | Tame a healthy creature | refused |
| TAM-02 | Tame a weakened one | joins party |
| TAM-03 | Chance clamps | within [0.05, 0.95] |
| TAM-04 | Rhythm, focus, status, low HP | each raises the chance |
| TAM-05 | Level surplus | never penalised |
| TAM-06 | 10 failures | measurably better odds (mercy affinity) |

### 2.6 Persistence

| ID | Case | Expected |
|---|---|---|
| SAV-01 | Round-trip a populated save | player, inventory, roster, deltas, structures all restored |
| SAV-02 | Active party | re-instantiated with level, bond and nickname |
| SAV-03 | Serialise a restored save | identical fingerprint |
| SAV-04 | Terrain after reload | regenerated identically from the seed |
| SAV-05 | Save size | under 120 KB uncompressed |
| SAV-06 | Empty slot | returns null, does not throw |
| SAV-07 | **Corrupt newest generation** | falls back to the previous one |
| SAV-08 | List and delete slots | correct |
| SAV-09 | Current-schema save | passes through migration untouched |
| SAV-10 | Unknown schema | throws loudly rather than half-loading |

**Standing rule:** every future `CURRENT_SCHEMA` bump ships with a migration and
a fixture save written by the previous version. No exceptions. This is the
cheapest insurance in the project and the most expensive thing to retrofit.

### 2.7 Performance

Budgets are CI ceilings with headroom over the measured figure, set to catch an
order-of-magnitude regression rather than a few percent. Real device numbers
come from the manual matrix.

| ID | Case | Budget | Measured |
|---|---|---|---|
| PRF-01 | Sim tick, populated world | < 6 ms | **0.55 ms** (83 entities) |
| PRF-02 | Sim tick, 300+ creatures | < 12 ms | **5.6 ms** (522 entities) |
| PRF-03 | AI cost, 20 → 400 entities | far below 20× | **0.84 → 7.9 ms** (9.4×) |
| PRF-04 | Chunk generation | < 40 ms | **2.3 ms** |
| PRF-05 | Cold start | < 3000 ms | **105 ms** (49 chunks) |
| PRF-06 | 3000 ticks of walking | entities bounded | **276 → 274** |
| PRF-07 | 200 stale statuses | drained | ✅ |
| PRF-08 | 500 expired buffs | drained | ✅ |

### 2.8 Balance (`npm run balance`)

120 full boss fights in an isolated arena, plus the thread envelope and the
creature power curve.

| Assertion | Band | Current |
|---|---|---|
| Boss win rate, full party at level | 35–95% | 72.5% |
| Boss win rate, solo at level | ≤ 90% | 32.5% |
| Any thread matchup vs neutral | 0.6–1.65× | within |
| Base-stat spread within an evolution stage | max/min ≤ 2.4 | within |

Reported for tracking: time-to-kill and average player health remaining, per
party size. `--csv` emits machine-readable output for trending across builds.

### 2.9 End-to-end (`npm run e2e`)

Playwright drives the **production build** in real Chromium, on a desktop
profile and a Pixel 7 touch profile. This layer catches everything headless
tests cannot: WebGL context creation, procedural texture generation, DOM wiring,
input, IndexedDB, the service worker, and layout.

`e2e/boot.spec.ts`

| ID | Case | Expected |
|---|---|---|
| E2E-01 | Boot | canvas sized, HUD mounted, chunks streamed, zero console errors |
| E2E-02 | **Camera** | player within 24 px of screen centre |
| E2E-03 | Start of a new run | daylight, not midnight |
| E2E-04 | Walk in two directions | entities stream in, and stay bounded |
| E2E-05 | Sim cost after exploring | under 16 ms per tick under software rendering |

`e2e/gameplay.spec.ts`

| ID | Case | Expected |
|---|---|---|
| E2E-06 | First run | guide appears, explains controls, dismisses |
| E2E-07 | Second visit | guide stays away, reopens from Log → How to play |
| E2E-08 | All eight panels | open and close, no console errors |
| E2E-09 | Bestiary | exactly 40 entries rendered |
| E2E-10 | Map | shaded terrain (>60 distinct colours), player marker drawn, position reported |
| E2E-11 | Grant → build → craft | campfire places, a recipe becomes craftable, crafting reports success |
| E2E-12 | Craft with no station | every recipe disabled |
| E2E-13 | Attack a creature | damage lands through the real combat path |
| E2E-14 | Boss | spawns, banners, advances to phase 1 with a new banner |
| E2E-15 | Long walk | entity count stays bounded |
| E2E-16 | Tactical pause held | render loop keeps running |

`e2e/persistence.spec.ts`

| ID | Case | Expected |
|---|---|---|
| E2E-17 | **Save then reload** | inventory restored — this caught the manual-save bug below |
| E2E-18 | Map hash before and after reload | identical: the world regenerated exactly from the seed |
| E2E-19 | Position after reload | restored to within 2 tiles, not reset to the shore |
| E2E-20 | `pagehide` (the event iOS actually delivers) | autosaves, and the save loads |
| E2E-21 | Fresh browser profile | starts a clean run rather than failing |

`e2e/pwa.spec.ts`

| ID | Case | Expected |
|---|---|---|
| E2E-22 | Manifest | valid, correct colours, 192 and 512 icons, a maskable variant |
| E2E-23 | Every declared icon | actually resolves and is an image |
| E2E-24 | Service worker | registers and reaches `activated` |
| E2E-25 | **Network cut, then reload** | the game still boots |
| E2E-26 | Viewport and theme | `viewport-fit=cover`, no user scaling, matching theme colour |

`e2e/mobile.spec.ts`

| ID | Case | Expected |
|---|---|---|
| E2E-27 | Touch profile | on-screen controls render |
| E2E-28 | Every touch target | ≥ 48 px |
| E2E-29 | Every icon-only control | carries an `aria-label` |
| E2E-30 | Press on the left | the floating stick anchors within 20 px of the thumb |
| E2E-31 | Orientation change | camera still centred, controls still present |
| E2E-32 | Panels at narrow width | fit inside the viewport |
| E2E-33 | Pointer device | no touch controls rendered |
| E2E-34 | **Menu while a panel is open** | still clickable — the scrim used to swallow it |

Three of these exist because of bugs that shipped past the unit tests:

- **E2E-17** — the Save button wrote `slot1`, but boot only ever read `auto1`.
  Pressing Save and reloading silently lost the run. Boot now resumes the newest
  save from any slot.
- **E2E-02** — `renderer.width` is already in stage coordinates; dividing it by
  `resolution` offset the camera on every device with a resolution other than 1.
- **E2E-34** — the panel scrim covered the menu bar, so the only way out of a
  panel was the X and switching panels was impossible.

### Test hooks

`src/app/testHooks.ts` exposes `__debug()`, `__spawnBoss()` and `__test.*`.
These call the **real** systems — inventory, placement rules, combat — so an
e2e failure still means a real failure. They exist because driving a
build-then-craft test purely through the UI would mean chopping trees for four
minutes and would end up measuring RNG rather than wiring.

---

## 3. Not automated (and why)

| Area | Approach |
|---|---|
| "Is it fun" | The M2 gate. No test replaces playing it. |
| Real device performance | Manual matrix: 6 Android, 4 iOS, 4 browsers, before each release. |
| Native Android/iOS builds | Manual: the Gradle and Xcode projects are committed, but compiling them needs an Android SDK and a Mac. |
| Audio mix | Manual, on phone speakers and headphones. |
| Art readability | Manual: silhouette review at 32 px against the other 39. |
| Long-session stability | Manual 4-hour soak, watching memory. |

---

## 4. Device matrix (pre-release)

| Tier | Devices | Target |
|---|---|---|
| Low Android | 2019 mid-range, 3 GB RAM | 30 fps locked, no crash |
| Mid Android | Snapdragon 6-series, 2021 | 60 fps |
| High Android | Recent flagship | 60 fps, full quality |
| iOS min | iPhone SE 2020 | 60 fps |
| iOS current | Recent iPhone and one iPad | 60 fps, both orientations |
| Browsers | Chrome, Firefox, Safari, Edge — latest and latest-1 | 60 fps |

Each: cold start, 20 minutes of play, save/load, background/foreground,
orientation change, and a boss fight.

---

## 5. Bug severity

| Severity | Definition | Fix by |
|---|---|---|
| S1 | Save loss or corruption; crash on boot | immediately, blocks release |
| S2 | Progress blocked; unwinnable state; persistent crash | before release |
| S3 | Wrong behaviour with a workaround; balance outside band | next sprint |
| S4 | Visual or audio polish | backlog |

Save corruption is the only category with a standing "stop everything" rule. A
player's 40-hour file is not recoverable by patching.
