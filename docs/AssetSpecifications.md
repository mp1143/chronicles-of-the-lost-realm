# Asset Specifications

Everything in the current build is generated procedurally from the content
definitions (`src/render/textures.ts`), so the game is playable with zero art
files. This document is the contract for replacing that placeholder layer with
production art **without touching game code** — `textureFor(key)` becomes an
atlas lookup and nothing else changes.

---

## 1. Naming and the texture key contract

The renderer asks for textures by key. Every key must resolve.

| Key | Source of truth | Count |
|---|---|---|
| `player` | — | 1 (+ cosmetic variants) |
| `creature:<id>` | `src/content/creatures.ts` | 40 |
| `boss:<id>` | `src/content/bosses.ts` | 8 |
| `node:<id>` | `HARVESTABLES` in `src/content/biomes.ts` | 7 |
| `structure:<id>` | `src/content/structures.ts` | 9 |
| `tile:<id>` | `TILES` in `src/content/biomes.ts` | 16 |
| `projectile` | — | 1 per thread (8) |

**Rule:** adding a creature to `creatures.ts` must never require a code change.
If an atlas entry is missing, the loader falls back to the procedural
silhouette rather than failing — a missing asset is a visual placeholder, never
a crash.

---

## 2. Sprites

### Grid

| | Size | Notes |
|---|---|---|
| Tile | 32 × 32 px | `TILE_SIZE` in `src/core/config.ts` |
| Small creature | 48 × 48 | stage-1, radius ≤ 0.35 tiles |
| Medium creature | 64 × 64 | stage-2, radius 0.35–0.55 |
| Large creature | 96 × 96 | stage-3, radius 0.55–0.7 |
| Boss | 192 × 192 | radius 1.5–2.5 |
| Player | 48 × 64 | |

Authored at **2× and downsampled**, so the same source serves high-DPI phones.

### The silhouette rule

> Every creature must be identifiable as a solid black shape at 32 px.

This is not a style preference. On a 6-inch screen in combat, colour and detail
are gone; shape is all the player has. Before a creature is approved, render it
black on white at 32 px next to the other 39 and confirm it is distinguishable.

The procedural system encodes this as `body` × `crest`:

| `body` | Reads as |
|---|---|
| `blob` | low, soft, slow |
| `quad` | four-legged animal |
| `biped` | upright, humanoid threat |
| `serpent` | long, tapering, fast |
| `insect` | segmented, many limbs |
| `winged` | airborne, wide |
| `floating` | untethered, uncanny |
| `plant` | rooted, stemmed |

`crest` (`horns`, `antennae`, `frill`, `wings`, `spines`, `tail`, `cap`, `halo`)
is the second axis that separates two same-body species. Production art should
preserve both axes: a Thornkin and a Mireling are both `biped`, and a player
must still tell them apart by silhouette alone.

### Animation

8 directions, **4 drawn and 4 mirrored** (E, NE, N, NW → mirror for W, SW, S, SE).

| State | Frames | Rate | Required |
|---|---|---|---|
| Idle | 4 | 6 fps | yes |
| Walk | 6 | 12 fps | yes |
| Attack | 5 | 15 fps | yes |
| Hurt | 2 | 12 fps | yes |
| Death | 6 | 12 fps | yes |
| Special | 6 | 15 fps | stage-3 and bosses only |

Budget: 40 creatures × 4 directions × ~23 frames ≈ 3,700 sprites. This is the
single largest content cost in the project. Mitigations, in order of value:

1. **Shared skeletons per body type** — 8 rigs, not 40.
2. **Palette swaps within an evolution line** — a Thornkin and a Bramblewarden
   share silhouette DNA; the third stage adds mass, not a new rig.
3. **Cut `Special` for anything below stage 3.**

### Atlases

One atlas per biome plus one shared:

| Atlas | Contents | Budget |
|---|---|---|
| `shared` | player, UI, projectiles, common nodes | 2048 × 2048 |
| `verdant`, `ashen`, `frost`, `mire`, `dust`, `deep`, `core` | that biome's creatures, tiles, nodes | 2048 × 2048 each |

Power-of-two, 2 px padding (prevents bleeding at non-integer scales), PNG-8 where
the palette allows. Only the shared atlas plus the current biome is resident:
that is what holds the 350 MB mobile memory budget.

---

## 3. Tiles

16 tile types (`TILES`). Each needs:

- 4 variants, so large areas do not read as a repeating grid. (The procedural
  build fakes this with seeded per-tile colour variance — keep that as a cheap
  fallback even with real art.)
- Edge transitions to its neighbouring biome tiles. Biome borders are dithered
  over ~4 tiles with a blue-noise mask (`ShardTerrain.tileFor`), so a full
  47-piece autotile set is **not** required — 4 variants plus the dither reads
  correctly and costs a tenth as much.

---

## 4. Colour

### Master palette

48 colours, one ramp. Per-biome sub-ramps of 12 pull from it, which is what
makes seven procedurally generated biomes feel like one world.

Thread colours are fixed and must never be reused for anything else, because
they are the only colour the player is asked to learn:

| Thread | Hex |
|---|---|
| Verdant | `#6BBF59` |
| Stone | `#A98D6B` |
| Storm | `#E2C044` |
| Tide | `#4A9FD4` |
| Ember | `#E0603C` |
| Radiance | `#F2E9C9` |
| Umbra | `#6A4A9E` |
| Null | `#2A2A32` |

### Accessibility constraint

**No gameplay-critical information may be colour-only.** Every thread also
carries a glyph, every status carries a glyph (`STATUSES[*].glyph`), and every
telegraph is a distinct outlined *shape* — a line, a ring, or a cone — not a
coloured blob. Verify each of the three colourblind simulations before sign-off.

---

## 5. Lighting

- 2D normal maps for creatures and structures (optional; the fallback is flat).
- Light accumulation pass for campfires, Wardlights and Glimmoth-line creatures.
- Day/night is a **graded LUT overlay**, not a per-sprite colour multiply — one
  full-screen quad instead of 300 tint operations.

---

## 6. Audio

| Category | Format | Bitrate | Budget |
|---|---|---|---|
| Music | Ogg/Opus stereo | 128 kbps | 32 MB |
| Ambience | Ogg/Opus stereo | 96 kbps | 8 MB |
| SFX | Ogg/Opus mono | 96 kbps | 16 MB |
| UI | Ogg/Opus mono | 64 kbps | 4 MB |
| **Total** | | | **< 60 MB** |

### Music

Adaptive vertical layering, four stems per biome, crossfaded on a bar boundary:

1. `bed` — always playing
2. `tension` — a hostile creature has line of sight
3. `combat` — the player is in combat
4. `duskveil` — night, layered on top of any of the above

Each biome gets a distinct instrument bed (Verdant: strings and woodwind;
Frostspire: glass and sustained pads; Hollow Deep: processed breath and low
percussion). Stems must be loop-exact and share tempo so any two can be
crossfaded without a beat glitch.

### SFX

| Bucket | Count | Notes |
|---|---|---|
| Player (footsteps ×7 surfaces, attacks, hurt, death) | ~40 | footsteps are surface-driven |
| Creature (cry, attack, hurt, death × 8 body types) | ~32 | shared per body type, pitched per species |
| Skills | ~40 | one per skill in `skills.ts` |
| World (harvest, craft, build, weather, riftgate) | ~30 | |
| UI | ~15 | |

3 variants for anything played more than once a second (footsteps, hits), with
±6% random pitch. Repetition is the fastest way to make audio feel cheap.

### Captions

Every audio cue that carries gameplay information needs a caption string and,
for off-screen sources, a direction indicator. This is an accessibility
requirement, not a nice-to-have (GDD §14).

---

## 7. UI assets

Minimal by design — the UI is DOM and CSS (`src/ui/styles.css`), not sprites.

- **Icons:** SVG, 24 × 24 base, single-path where possible. ~60 needed
  (items by category, statuses, threads, menu).
- **Font:** one variable font, Latin + Cyrillic + Greek subsets, WOFF2, under
  120 KB. A monospace fallback stack is already in place and is genuinely
  acceptable — do not add a font until it earns its bytes.
- **No 9-slice frames.** Panels are CSS `border-radius` and `border`. Zero
  assets, zero memory, resolution-independent.

---

## 8. Delivery checklist per asset

- [ ] Key matches a content id exactly
- [ ] Silhouette readable as black at 32 px
- [ ] All required animation states present, 4 directions
- [ ] Fits its atlas with 2 px padding
- [ ] Colour drawn from the master palette
- [ ] Gameplay information duplicated in shape, not colour alone
- [ ] Audio counterpart exists, with a caption string
