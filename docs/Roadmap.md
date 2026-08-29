# Roadmap

**Where we are:** M2, the vertical slice, is built and verified. The five other
milestones below are estimates, not commitments — each one should be re-planned
after the milestone before it lands.

---

## Delivered — M0 through M2

| Milestone | Contents | State |
|---|---|---|
| **M0 Skeleton** | Fixed-step loop with render interpolation, ECS, PixiJS renderer, input adapters (touch / KBM / gamepad), storage adapter | ✅ |
| **M1 World** | Deterministic terrain with rivers and coastlines, Whittaker biome classification, chunk streaming, seeded resource and spawn placement | ✅ |
| **M2 Vertical Slice** | Real-time combat with telegraphs and 12 statuses, behaviour-tree creature AI, taming with the snare minigame, bond and evolution, inventory, crafting, base building, survival meters, day/night, one boss with phases, full HUD and eight panels, versioned save system | ✅ |
| **M2.1 Shippable** | First-run guide, full-Shard map with elevation shading, installable PWA with offline support, generated icon set, committed Android and iOS projects, 66-test end-to-end suite | ✅ |

Also delivered ahead of schedule because they are data, not code: **all 40
creatures**, all 16 evolution lines, the full item, recipe, structure and status
tables, and the seven-biome definitions.

### Verified

- 112 headless tests, a balance gate, and 66 end-to-end browser tests, all green
- 0.55 ms/tick simulation with 83 entities (4 ms budget)
- 105 ms cold start, 215 KB gzipped initial payload
- Runs on desktop and mobile viewports with the same code and the same markup
- Installs as a PWA and boots with the network cut

### The M2 question

**Is thirty minutes of this fun?** Everything below is contingent on that
answer. If the loop is not compelling now, M3–M5 will not fix it — they will
make a bigger version of the same problem. Play it before funding the rest.

---

## M3 — Systems (≈ 6 weeks)

Turn one biome into a game.

| Item | Notes |
|---|---|
| Remaining 6 biomes wired for play | definitions exist; needs hazards, weather, and biome-specific spawning |
| Riftgates and the Shard graph | the world topology is designed but only one Shard is instantiated |
| NPC AI | utility scoring, schedules, the two-layer reputation system with witnessing and decay |
| Dialogue system | condition-driven node selection, the nine named characters |
| Procedural quest generator | the grammar in GDD §8.2, plus the Bounty Board |
| Economy | vendors, finite restocking stock, dynamic pricing, repair as the late sink |
| Anchor tiers 2–5 | Wardlight coverage, creature pens, farms, the Duskveil defence loop |
| Dungeon generator | the three archetypes plus the shared solvability validator |
| Player magic and weapon classes | six weapon classes with distinct combos; Thread magic tiers |

**Exit:** all five progression tracks live, and pushing any one alone hard-gates
on another within about four hours.

---

## M4 — Content (≈ 8 weeks)

| Item | Notes |
|---|---|
| Seven biomes fully dressed | POIs, set pieces, hazards |
| Remaining 7 bosses | each with phases and an environmental answer |
| Main story, Acts I–V | 42 Threadline quests, 9 companion arcs, 4 endings |
| Faction content | 4 × 8 quests, vendors, reputation rewards |
| ~120 discovery moments | environmental storytelling, the Cael journals |
| Production art pass | per `AssetSpecifications.md` — the largest single cost in the project |
| Audio | adaptive stems per biome, ~160 SFX |

**Exit:** playable start to finish.

---

## M5 — Polish (≈ 5 weeks)

| Item | Notes |
|---|---|
| Full accessibility surface | text scaling, remappable touch layout, combat assists, captions |
| Device matrix pass | 6 Android, 4 iOS, 4 browsers |
| Balance passes | driven by the simulator, not by feel |
| Memory and load-time tuning | atlas streaming per biome, 350 MB mobile ceiling |
| Localisation | strings are already centralised in content files; no extraction work needed |
| Store presence | listings, trailers, screenshots |

**Exit:** every CI gate green on every target; nothing on the release checklist
outstanding.

---

## Post-launch

### Phase 1 — Stability (0–3 months)

Bug fixes, balance from real telemetry-free feedback, quality-of-life. No new
systems. The most common failure mode after launch is shipping features instead
of fixing what people are actually complaining about.

### Phase 2 — Event Seeds (3–6 months)

Signed JSON bundles defining a themed Shard, a boss variant and cosmetic
rewards, run in a sandbox save slot. Rewards are cosmetic plus one catalyst;
they never touch main-save balance.

This is the **entire** live-ops surface for a premium single-player game, and it
is deliberately small. The delivery mechanism already exists — content is data.

### Phase 3 — Desktop (6–9 months)

Tauri wrapper, ~5 MB binary, Steam release. Native resolution, keyboard and
mouse, gamepad. No game changes; the input abstraction already covers it.

### Phase 4 — Expansion (9–18 months)

One paid cosmetic-and-content expansion: a new Shard cluster, ~12 creatures, two
bosses, a new faction. No new systems, no monetisation change.

---

## Deferred, with the seams already built

v1.0 builds four cheap architectural affordances and **nothing more**
(TechnicalDesign §12). These cost roughly zero today and are the difference
between "add multiplayer" and "rewrite the game":

| Seam | What it enables later |
|---|---|
| Deterministic, fixed-step, input-driven sim with no platform coupling | run the same simulation on a Node server; send inputs, not state |
| Stable namespaced entity ids (`shard:spawnIndex`) | networked entity mapping is a rename, not a redesign |
| `CloudSaveProvider` interface | cloud saves, and the same seam serves guild and trade storage |
| Signed JSON content bundles | seasonal events with no client patch |

**Explicitly not in v1.0, and not started:** real-time multiplayer, PvP, player
trading, guilds, voice acting, 3D, creature breeding, procedural creature
generation, mod support, and any form of monetised live service.

The conflict-resolution policy for cloud save is already written down —
*compare `playedMs` and `lastWriteAt`, show the player both, never auto-merge* —
specifically so it does not get invented under deadline pressure later.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation | State |
|---|---|---|---|---|
| Scope — this is a five-system game | High | Critical | Vertical slice first; gate at M2 | ✅ slice built |
| Content volume (3,700 sprites) | High | High | Shared skeletons, palette swaps within lines, cut Special below stage 3 | spec'd |
| Mobile performance on low-end | Medium | High | Perf gates in CI from week one | ✅ 0.55 ms/tick |
| Procgen produces boring maps | Medium | High | Rivers and POI density are the levers; seed-explorer tool in CI | rivers done, tool pending |
| Save corruption | Low | Critical | Ring buffer, atomic writes, checksums, migration fixtures | ✅ built and tested |
| iOS WebView performance | Medium | High | Early spike on real hardware; fallback is `SIM_HZ` 20 | untested on device |
| Balance across 40 creatures × 8 bosses | High | Medium | Automated balance simulator as a CI gate | ✅ built, found two real bugs |

The rows still marked untested — real iOS and Android hardware, and the
seed-explorer tool — are the honest gaps. Compiling the native projects needs an
Android SDK and a Mac; neither was available where this was built, so the
Gradle and Xcode projects are generated and wired but not yet compiled.
Everything else on this table has been exercised.
