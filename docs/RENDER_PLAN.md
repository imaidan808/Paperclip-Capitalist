# Render plan: the layer stack and the five tracks

How the world's picture is built from here to the "Untitled Goose Game / Egg, Inc." look of `docs/ART_DIRECTION.md`, who builds which part, and the shared tools they build it with. Written at `579ce1c` (branch `v2/art-stack`, on `adcd991` plus the art direction, the render diagnosis and the shot rig), 2026-10-28, and revised after review the same day (section 12 says what changed and what was not changed). Presentation only: nothing here changes world coordinates, district geometry, hit shapes, the engine, game rules, data, balance, session, text, the object list below the map, or `pc.world`'s public API. The camera input handlers (`bindInput`, `zoomBy`) belong to `v2/zoom` and are not touched.

Three documents, three jobs. `ART_DIRECTION.md` says what it looks like (colours, shapes, numbers, acceptance). `RENDER_DIAGNOSIS.md` says why it looks wrong now (defect ids W, C, F, G, S, P) and what a frame costs. This file says how the code is arranged so five people can change the picture at once without touching each other's files: one stack of layers, one owner per file, a handful of shared helper modules, one rule for zoom, one rule for pixels, one measured budget per layer.

Four blocks below are machine-checked: the layer table (section 1) against `js/world/stack.js` and the ownership table (section 7) against the files in `js/world/`, both by `tests/world-ownership.test.mjs`; the budget scenes (section 6) by `scripts/world-budget.mjs` and `tests/world-budget.test.mjs`; the memory table (section 6) by `tests/world-ledger.test.mjs`. Change the code and the block together.

## 0. The eleven rules for every track

1. **Own files only.** Edit files your track owns (section 7). A file nobody owns, or a file another track owns, is not yours; ask the orchestrator and work round it inside your own files in the meantime. A new file is yours if you add it to YOUR track's array in the ownership block in the same commit (one file to a line, so two tracks adding files never touch adjacent lines) and import it from a module that is already staged in that same commit (`tests/finish-site.test.mjs` fails on a module nothing imports).
2. **Flags, then flip, then delete.** A layer has a LEGACY drawer (the code the world has always run) and may get a V2 drawer. You register V2 with `registerLayer`, test it behind `?layers=<id>:v2` or `setFlag`, and flip the default in `stack.js`'s table only when your acceptance rows pass (the flip is a one-line change the orchestrator merges). When every flag of your track is v2 and its tests pin the new look, delete your legacy drawers.
3. **Zero-diff while legacy.** With every flag on legacy the picture is the old one, pixel for pixel on all 27 shots of the rig. A change that is meant to be invisible is proved invisible (section 9).
4. **Hit shapes are sacred.** A V2 drawer returns the same hit polygons (`polys`, `circle`) the legacy drawer returned, from the same `LAYOUT`/`zAt`/`SCENERY` data. `tests/world-static.test.mjs` holds the scenery positions by hash; do not loosen it.
5. **Everything is a function of the world, the zoom and the clock.** No `Math.random` (use `hash`/`h2`), no wall clock, no `performance.now()` in drawing. `env.t` is the visual clock and is 0 under Calm, Off and reduced motion: a layer draws its best-looking resting pose when `env.t === 0`, and nothing it does moves, fades or flickers then.
6. **Colours come from `palette.js`.** A colour in world drawing is a token of `palette.js`, or a `mix`/`shade`/`faceTone`/`veiled` of tokens. The retired colours (`#121826`, `rgb(8,10,20)`, olive `#4b7a4e`, slate `#2f3644`, sea `#1b3b5c`) appear nowhere in V2 code.
7. **No hairlines.** Nothing is stroked thinner than `minLine(zoom)` (1.5 world pixels, never under 1.25 screen pixels); form is made of filled shapes, value steps and bands.
8. **Detail is additive and fades.** Read the zoom only through `lodOf` (`env.lod`); draw the base complete, add marks with `env.lod.detail[i]` as their alpha. No threshold of your own, no pop.
9. **Budget is a contract.** Section 6 gives each layer its milliseconds and megabytes. Over budget is a failed track, however good it looks. The quality governor must still step down and recover.
10. **Tests that pin the old look change only to pin the new intent**, and the commit message says which and why. New pure functions come with tests.
11. **Shared documents are the orchestrator's.** `docs/ARCHITECTURE.md` (the staged site's request, module and size figures), this plan's tables and `js/world/stack.js`'s layer table are edited by the orchestrator, in the merge commit; a track does not touch them (the one exception is your own array in the ownership block, rule 1). Every new module moves the figures of ARCHITECTURE.md, so on a track branch `tests/finish-repair.test.mjs` F2 tolerates the growth of `js/world/` (at most 24 modules, every one under `js/world/`, and 10% of the sizes) and holds the title screen's own set of modules exactly; with `PC_STRICT_DOCS=1` it is exact. The orchestrator runs `node scripts/arch-figures.mjs --write` and then the suite with `PC_STRICT_DOCS=1` at every merge, and the staged site's workflow runs it strict.

## 1. The target pipeline: one stack of layers

The frame is drawn in this order. A layer's SPACE says what transform the engine has set when it is called (`screen`: css pixels of the window; `world`: the camera transform, so the layer pans and zooms with the island; `inherit`: whatever the caller set). A layer's STAGE says where it sits: `sea` (under everything), `ground` (the terrain group, drawn into the ground cache while the camera is still), `things` (the depth-sorted list), `air` (over the things, in the world) or `screen` (the passes over the finished world).

```
 sea         world-space water, haze to the horizon, island shadow         live       T1   (legacy: a screen-space strip)
 shore       coast ribbon at mid swash, beach bands, cliff faces           ground     T1   (static: baked)
 terrain     the lit colour field, patches, paths                          ground     T1   (static: baked)
 roads       roads, kerbs, bridges, the ferry quay, buoys                  ground     T1   (static: baked)
 blocks      district plateaus, their decals and crosswalks                ground     T1   (static: baked)
 livedecals  EVERYTHING on the ground that moves or fades, drawn live over the cache's blit: the breathing foam ribbon,
             the wet-sand swash, the cliff foam skirts, moving decals (water, pulses) and the dressing (tufts, shells, flowers)   live   T1
 things      depth-sorted, back to front:                                  per item
               static-bldg   the 18 building kinds (props-buildings.js)         T3
               static-prop   the other 43 prop kinds (props-street, -nature, -actors)   T4
                             (both through one frame, statics.js, which stays T5's)
               plot, pipe   building plots and pipelines                       T3
               lead, lot, asset, truck, car, player   people, crates, traffic T4
             every item stamps its own contact and cast shadow (shadow.js)
 clouds      cloud banks over locked districts, their ground shadows       live       T2   (legacy: a dark pool and blurred banks)
 (hover)     the highlight under the pointer                               engine     T5
 grade       tint for the hour, light pools, ambient air                   screen     T2
 (route)     map mode's routes                                             engine     T5
 weather     rain, confetti, surge and tariff washes                       screen     T2
 field       floating dust and fireflies                                   screen     T2
 (overlay)   labels, price tags, bubbles, name tags                        engine     T5
 particles   coins, sparks, puffs, rings, text pops                        screen     T2
 (map)       map cards, region names; the minimap                          engine     T5
```

Layers in parentheses are the engine's, not flagged. The twenty-one flagged layers are the rows of the machine-checked block. `space` is the LEGACY drawer's: a V2 drawer says its own when it registers, and where it differs the row says so in `v2space` (the sea: legacy `screen`, V2 `world`; `registerLayer` refuses another space). A row with `bridge` is drawn through a shared frame that track owns (the two static layers, through `statics.js`): its owner registers per-kind drawers with `registerProp`, never a whole layer.

<!-- render-layers -->
```json
[
  { "id": "sea", "owner": "T1", "space": "screen", "v2space": "world", "stage": "sea" },
  { "id": "shore", "owner": "T1", "space": "inherit", "stage": "ground" },
  { "id": "terrain", "owner": "T1", "space": "inherit", "stage": "ground" },
  { "id": "roads", "owner": "T1", "space": "inherit", "stage": "ground" },
  { "id": "blocks", "owner": "T1", "space": "inherit", "stage": "ground" },
  { "id": "livedecals", "owner": "T1", "space": "inherit", "stage": "ground" },
  { "id": "static-bldg", "owner": "T3", "space": "inherit", "stage": "things", "bridge": "T5" },
  { "id": "static-prop", "owner": "T4", "space": "inherit", "stage": "things", "bridge": "T5" },
  { "id": "plot", "owner": "T3", "space": "inherit", "stage": "things" },
  { "id": "pipe", "owner": "T3", "space": "inherit", "stage": "things" },
  { "id": "lead", "owner": "T4", "space": "inherit", "stage": "things" },
  { "id": "lot", "owner": "T4", "space": "inherit", "stage": "things" },
  { "id": "asset", "owner": "T4", "space": "inherit", "stage": "things" },
  { "id": "truck", "owner": "T4", "space": "inherit", "stage": "things" },
  { "id": "car", "owner": "T4", "space": "inherit", "stage": "things" },
  { "id": "player", "owner": "T4", "space": "inherit", "stage": "things" },
  { "id": "clouds", "owner": "T2", "space": "world", "stage": "air" },
  { "id": "grade", "owner": "T2", "space": "screen", "stage": "screen" },
  { "id": "weather", "owner": "T2", "space": "screen", "stage": "screen" },
  { "id": "field", "owner": "T2", "space": "screen", "stage": "screen" },
  { "id": "particles", "owner": "T2", "space": "screen", "stage": "screen" }
]
```

**The ground group and its cache.** `shore`, `terrain`, `roads` and `blocks` are drawn under the world transform into `groundcache.js`'s offscreen copy once the camera has stood still for a frame; every later frame is blits (a chunk of device pixels each, section 5). The copy is drawn again when the camera, the size, the density, the unlocked districts or `groundKey(w)` change. `groundKey` folds the `key(w)` of every V2 ground layer: a number that changes whenever the layer's STILL picture changes (a palette step, an opened gate, the hour's grade where the layer bakes it). **No `key(w)` may read `env.t` or anything that moves with the clock**: a cache keyed on the clock is redrawn every frame (12 to 16 ms, DIAGNOSIS C7) and is no cache. So the cache holds only what stands still: the coast ribbon at MID swash (the resting pose), the beach bands, the cliff faces, the lit terrain, roads and blocks. **Everything on the ground that breathes, fades or moves is drawn by `livedecals`, live, after the blit**: the foam ribbon (breathing 0.35 tile over 6.5 s), the wet-sand swash, the cliff foam skirts, moving decals, and the dressing, which is a live blit of cached tuft, shell and flower sprites (at most 1,500, skipped while the camera moves) with its own alpha that rises over 150 ms after the camera rests. A baked foam, or a dressing baked with a fade, is a fault. The live drawer's cost is a row of section 6.

**The sea fills the view.** The V2 `sea` first fills the whole view rectangle with the haze colour (one plain `fillRect` under the world transform: 0.3 ms), then draws the depth and the motifs over it. A bitmap of finite size (the depth field covers `LAYOUT.bounds` plus 1,400 world pixels) is only ever what sits on that fill, so no pixel of an opaque canvas can be left unpainted in any window: a phone's 390 x 844 fit view shows 8,962 world pixels beyond the bounds above and below, a tablet's 768 x 1024 shows 4,500 (`world-metrics.mjs DIR --unpainted` is the check, section 9).

**Why layers are mixed into the World.** Each legacy drawer is a method that has always lived on `World`, now defined in its owner's module and mixed into `World.prototype` at the foot of `world.js` (`Object.assign(World.prototype, seaMethods, ...)`). The code was moved, not rewritten, so `w.drawWater`, `w.drawFog`, `w.drawGround` and the other names the tests call still exist. A V2 drawer is a plain function and does not need `this`.

## 2. The layer interface

```js
registerLayer(id, draw, space = 'world', key)   // draw(ctx, view, env, w, a); key(w) => number, ground layers only
registerProp(kind, drawer | { body, live?, night?, pad?, detail? })   // the two static layers: one prop kind's V2 drawer (T3 for the 18 building kinds, T4 for the rest)
setFlag(id, 'legacy' | 'v2')                    // or ?layers=sea:v2,static-bldg:v2 in the address while developing
```

`draw(ctx, view, env, w, a)`:

| argument | what it is |
|---|---|
| `ctx` | the 2D context: the canvas, or the ground cache's own surface. Leave its state (transform, alpha, composite, line style) as you found it: `save`/`restore` balance, `globalAlpha` returns to its value |
| `view` | `{x0, x1, y0, y1}`, the world-pixel rectangle on screen, with margins (80 px at the sides and below, 260 above) so tall things are not cut. Cull against it; draw nothing outside it |
| `env` | the presentation record `w.env`: `t` (visual clock), `night`, `wind`, `dim` (the veil strength of the district being drawn: 0.5 under cloud in legacy), `far`, `lite`, `lod` (`lodOf(zoom)`), `lights` (push `{wx, wy, r, c, a}` to light the night), `zoff` |
| `w` | the World, for reading: `cam`, `unlocked`, `fxOf(zone)`, `reduced()`, `ents`, `player`, `hover`, `dpr`. Layers never write game state and never write the camera |
| `a` | the subject: a prop (`static`), an entity (`plot`, `pipe`, `lead`, `lot`, `asset`, `truck`, `car`), the set of districts in view (`clouds`), the ground record `{zoom, far, see, mode}` (`shore`, `terrain`, `roads`, `blocks`) |

Rules of the signature. A drawer may push hits (`w.hits.push`) and overlay labels (`w.overlay.push`) exactly as the legacy drawer did; a V2 drawer for an entity must push the same hit. It may not allocate in a loop that runs per tile, per particle or per prop: reuse records, typed arrays and `Path2D`s (`itemPool` and `carList` are the model). It may not throw for bad data (the engine catches and logs once, but a throwing layer is a missing layer). Space: a layer that wants `world` or `screen` says so at registration and the engine sets it; an `inherit` layer must not call `setTransform`.

**Per-kind props.** A static prop is drawn by `statics.js` (the frame: the district's light and fog, lamp lights, the hit a prop leaves, a gate's chip, a depot's tariff flag; T5's and not replaced) through `drawProp`, which asks `propV2(kind)` first. A kind has a V2 drawer only while its layer's flag (`static-bldg` or `static-prop`) is `v2` AND its owner has registered one, so a track lands one kind at a time, flips its own flag when its rows pass, and deletes its legacy drawers when every kind is done; the other track's pixels never move, and a pixel difference on the rig is attributable to one owner (`?layers=static-bldg:v2` against the baseline). A layer definition `{ body, live, night, pad, detail }` is served through the sprite cache like a legacy layer (a sprite belongs to the definition that drew it, so a flag flipped at run time never serves the other's picture); a plain drawer is drawn straight onto the scene. `layer(type, def)` keeps every field of `def`, `detail` included.

**Veil.** A district under cloud reaches a V2 drawer as `env.dim` (legacy: 0 to 0.5). Convert with `k = env.dim / FOG_DIM` (`common.js`) and colour with `veiled(c, k)`; never `fogged`, which darkens.

**Adding a layer.** A new layer is a row in `LAYERS` (the orchestrator merges it), a section here and a row in the block above. Prefer a new drawer inside an existing layer.

## 3. Shared helpers, first versions written and tested

These modules (plus the tests' `recctx`) are the tools every track uses. Their signatures are the contract; behaviour may be deepened by the owner, signatures change only through this plan.

| module | owner | signatures |
|---|---|---|
| `palette.js` | T2 | tokens `SKY SEA SAND GRASS BLOOM SOIL ROCK ROCKHI ROAD PAVE WOOD BRICK PLASTER TILE METAL GLASS TOY INK LIGHT CLOUD GRADE`, tables `DISTRICT_DAY CRATE_TAGS PEOPLE`; `groundSet(theme)`, `crateColor(tag)`, `personLook(hash)`; `faceTone(c) -> {t, l, r}` (frozen, memoised; replaces `tone`); `veiled(c, k)` (replaces `fogged`); `seaRamp(d_tiles)`; `skyOf(sunHour)`, `phaseOf`, `tintFor(night, dusk, crunch)`, `gradeFor(sunHour, crunch, out)`, `sunHourOf` |
| `solids.js` | T3 | `bevelRadius(w, d)` (0.10 of the shorter side, 3 to 12 world pixels), `minLine(zoom)`, `roundedPoly(ctx, pts, r)`, `roundedBox(ctx, gx, gy, w, d, h, c, o) -> {left, right, top, r}` (the faces `box()` returns, so hit shapes and window grids do not change), `capsule(ctx, x0, y0, x1, y1, r, fill)`, `puff(ctx, x, y, r, body, hi, shade)`, `outlineOf(...)` |
| `shadow.js` | T2 | `shadowLength(night, dusk)`, `shadowReach(h, night, dusk)`, `stampSoft(ctx, x, y, rx, ry, a, color)`, `contactShadow(ctx, x, y, rx, ry)`, `castShadow(ctx, gx, gy, w, d, h, {night, dusk}, z)`, `releaseShadows()`; one cached sprite per colour, flat fallback without `OffscreenCanvas` |
| `cloudbank.js` | T2 | `bankPuffs(fp, z, scale)` (the bank's puffs: radius a share of the footprint's screen width, 40 to 150 of them, covering at least 85%), `bankScale(zoom)` (0 far sprite, 1.6 coarse mid, 1 fine near), `coverage`, `structure`, `maxCoverage`, `fillMpx`, `bankMs` (the planning cost model) |
| `gfx.js` (additions) | T5 | `ledger.register(name, bytes)`, `ledger.release(name)`, `ledger.total()`, `ledger.entries()`, `ledger.within()`; `registerReleaser(fn)` (called by `World.release()` through `releaseAll()`); `slice(job, {ms})` (a generator job run in idle slices of about 4 ms, `{ done, cancel }`) |
| `chunks.js` | T5 | `CHUNK_PX` (384 device pixels), `chunkWorld(zoom, dpr)`, `chunksFor(view, zoom, dpr)`, `chunksTouched(w, h, dpr)`, `groundBytes(w, h, dpr)` {rest, peak} |
| `stack.js` (additions) | T5 | `registerProp(kind, def)`, `propV2(kind)`, `staticLayerOf(kind)`, `BUILDING_KINDS`, `v2space` on a layer row |
| `lod.js` | T5 | `lodOf(zoom, out) -> {zoom, band, index, blend, level, nominal, nominalIndex, detail[4]}`, `detailAlpha(zoom, t)`, `bandIndex`, `BANDS`, `BAND_AT`, `FADE`, `DETAIL_MIN` |
| `tests/helpers/recctx.mjs` | T5 | `recCtx() -> {ctx, log, state}` records calls, stroke widths, fills, rects, clips, balance; `thinnestStroke(log)`, `callNames(log)` |

**The chunk draw contract.** The ground is baked in chunks (section 5). A chunk is a surface of `CHUNK_PX` device pixels (plus a one pixel bleed) at the current exact scale; the ground layers are called for it in the stack's order (`shore`, `terrain`, `roads`, `blocks`) with `ctx` set to the chunk's own transform and `view` = the chunk's world rectangle (no margin; cull against it), exactly as they are called for the window today. A ground layer therefore draws only from its arguments and the world's state, never from `w.cam`, and draws the same marks for any rectangle. `a.zoom` is the chunk's zoom. The ledger name of the set is `ground.chunks`.

**Ledger, releasers and slices.** Anything that holds canvas pixels registers them: `ledger.register('sea.paths', bytes)` when it makes or resizes a surface, `ledger.release(name)` when it lets go, and a module that keeps surfaces calls `registerReleaser(fn)` once at load so `World.release()` and `detach()` give them back (the world's own holders are released as before, then `releaseAll()`). A build that would hold a frame for more than about 6 ms (a distance transform, a contour extraction, a bank bake) is written as a generator and run with `slice(job, {ms: 4})`; with no `requestIdleCallback` it runs on a timer, and with no `OffscreenCanvas` (the Node tests) a layer draws direct.

How to use them. A building: `roundedBox` for the body (it paints the three faces in the face model inside a rounded outline, with a fillet strip down the front edge, a chamfer band along the top-front edges, the sun's streak, and two base AO bands, and returns the faces; look at `scripts/diag/solids.mjs` first: it is T3's first gate), `castShadow` before it and `contactShadow` at its foot, colours from `PLASTER`/`TILE`/`GLASS`. A tree: `contactShadow`, a tapered `capsule` trunk, `puff`s back to front. A cloud: `puff` in `CLOUD` colours. A wave crest: `SEA.crest` at 0.55 in a lens (T1 writes the lens helper in `sea.js`). A shadow colour is `LIGHT.shadow`, never a black or an ink.

## 4. The level-of-detail ladder

One function: `lodOf(zoom)`, called once a frame by the engine into `w.lod` and published as `env.lod`. Bands (zoom): far to 0.30, mid 0.30 to 0.70, near 0.70 to 1.40, close 1.40 to 2.40; the working zoom is 0.9 to 1.2. `detail = [1, mid, near, close]` are alphas 0..1, each `smoothstep((zoom - 0.85 t) / (0.30 t))` for the band's threshold `t` (so near fades in over zoom 0.595 to 0.805, close over 1.19 to 1.61; below 0.02 an alpha is 0). `band`/`blend` say the finest band that has anything visible and how far it has faded in; `level` is one continuous number 0..3 for anything that scales smoothly (wave levels, tuft counts); `nominal` is the hard band for decisions and labels, never for drawing.

How layers use it. **Draw the base complete at every band** (silhouette, face model, roof colour, window bands, door notch, sign bars: the mid band's additions are sub-pixel at far and live in the base). **Add the near and close overlays with their `detail` alpha.** Terrain and sea use `level` and the thresholds in the art direction's 7.2 table. Sprite overlays: a layered prop's definition may carry `detail: [{band: 'near', body(ctx, p, env)}, {band: 'close', body(...)}]`; `sprites.js` (T5) builds each overlay as its own transparent sprite, keyed by prop, zoom octave, band and night bucket, and blits it with `env.lod.detail[i]` as alpha. Until T5 lands that, a `detail` entry is ignored and the base alone draws, which is complete and never looks unfinished. Overlays are built only for props in view whose alpha exceeds `DETAIL_MIN`, and only once the zoom has rested (the existing "no builds while the zoom moves" rule). The governor lowers the effective band: at tier 3 and over `close` overlays are not built, at tier 5 and over `near` overlays are not.

`FAR_ZOOM` (0.42 now) becomes 0.30 when T5 flips `world.far`; until then the legacy `far` drawers keep their 0.42, so nothing changes. `PIP_ZOOM` (0.45, the bars) and the labels' rules are UI and stay.

## 5. Pixels: density, snapping, supersampling, seams

**Density.** Unchanged: the canvas is drawn at `min(devicePixelRatio, 2)`, at most 1.5 where the canvas is on the CPU (`softwareRaster()`), and the governor takes a quarter off at tier 4. All art must look right at 1, 1.25, 1.5 and 2, including the 1.33x stretch a CPU canvas gets on a 2x screen: nothing may need a one-pixel grid, and nothing may be judged on a software capture alone (judge on `--dsf 2` rig shots, which pin the canvas density; DIAGNOSIS P5).

**What is snapped, and what is not.**

| thing | policy |
|---|---|
| the camera translation | rounded to whole device pixels in `World.toWorld` (T5): `e = round(dpr (W/2 - cam.x z))`, `f` likewise; the scale `dpr z` stays fractional. Ground, sprites and live vector art then share one raster phase and a pan moves in whole device pixels (fixes DIAGNOSIS S5, the sprite tick) |
| sprite blits | to whole device pixels at that phase (`drawSprite` already does); label sprites likewise |
| the ground cache stamp | integer device pixels (already) |
| text | crisp: label sprites at the device density |
| live vector art (clouds, foam, ships, particles, waves) | NOT snapped: it moves continuously and is anti-aliased; snapping it would make it step |
| anything with `env.t === 0` | at rest: all of the above, so a still picture is the same picture on every draw |

**What scaling costs (measured, `scripts/diag/unitcost.mjs`).** On the budget machine a blit that lands 1:1 on whole device pixels is a copy: 0.34 ms per megapixel of destination. A blit that is scaled or lands on a fractional offset is resampled: 3.2 ms per megapixel, ten times as much, so one full-window bitmap scaled to the window costs 9.4 ms at density 1.5. A linear gradient filling the window costs 7.6 ms (2.6 per megapixel). A flat fill costs 0.1 to 0.4 ms per megapixel and a soft path fill about 1.2. Three rules follow, and they bind every track. **Never draw a full-window bitmap scaled or smoothed per frame** (the sea's depth bitmap at one texel to ten world pixels is a 13.5 times upscale: 9.4 ms; the plan's first bank "baked at half density" is the same 9.4). **Never fill a window with a gradient per frame**; a gradient is built into a sprite or a chunk, or approximated by a few flat translucent bands. **Scale only while the zoom moves**; at rest every blit is 1:1 and integer-aligned (the camera translation is rounded, section 5 table).

**Ground chunks.** At rest and while the camera pans (zoom constant) the ground is served from chunks of `CHUNK_PX` = 384 DEVICE pixels on a side, baked at the current exact scale with a one pixel bleed, keyed by zoom, chunk index and `groundKey`, so a pan is blits and not a redraw of 2,400 tiles (DIAGNOSIS C7: 12 to 16 ms now). A chunk is a fixed 0.59 MB at every zoom and density; the world area it covers is `384 / (dpr x zoom)` world pixels. (Chunks of 1,024 WORLD pixels, as this plan first said, are 1,843 device pixels across at zoom 0.9 and 4,915 at 2.4: up to 387 MB for the four a window needs at 2.4. `tests/world-ledger.test.mjs` holds the arithmetic.) A 1440 x 900 window at density 2 touches at most 54 chunks: 31.9 MB at rest, 39.8 MB at the peak of a zoom, when the stale chunks of the old scale are freed one by one as the new chunks that cover them are made. While the zoom changes, stale chunks of the nearest scale are shown scaled by at most 1.19x (the one place a scaled blit is allowed: 9.4 ms for a full window, inside the pinch's 48 ms) and the exact scale is baked on rest (within 150 ms, in slices); the picture never shows a scaled chunk at rest. Where the density is under 1.5 the chunk is baked at 2x and drawn down with smoothing (the canvas is small there): smooth coast edges and no cracks at dsf 1 and 1.25.

**Sprite resolution without blur.** A sprite is built at the exact device scale of the view, rounded to 1/64 octave (`dpr z`), and blitted 1:1: a straight copy, no resampling. While the zoom moves, the sprite of the nearest built scale is blitted scaled (ratio between 0.84 and 1.19, `imageSmoothingQuality = 'high'` only when shrinking by more than 30%) and the exact one fades in over 120 ms when built. Never scale up more than 1.25x; below that ratio build the missing sprite first (big ones, over 2.2 Mpx, wait for rest). Sprites hold their silhouette first in the mid tone, then the faces over it, so no crack shows where two faces meet (DIAGNOSIS S1).

**Seams and edges.** Ground tiles overdraw their outer edge by 0.6 world pixels; the same-colour stroke hack goes. Chunks bleed 1 device pixel. Coast and foam are paths, not tile edges. The crack counter (`scripts/diag/seams.mjs`) must read 0 at every zoom from 0.13 and every density from 1 to 2. Contours are tone-on-tone and only on silhouettes (art direction section 3).

**Governor.** The cost it judges gains a second signal: the `requestAnimationFrame` interval, so raster cost that JavaScript time cannot see (DIAGNOSIS P1) steps quality down. The 30 fps cap (P4) applies only to a still camera. What each tier drops, in order; every drop is recoverable and the picture never gets uglier than the complete base:

| tier | the world drops |
|---|---|
| 1 | caustics, rings, glints (sea); sparkle motes (clouds); micro-props |
| 2 | curls and crests (sea); mist rim and windows (clouds); `close` overlays not built |
| 3 | `near` overlays not built; cloud puffs shown as the bank sprite; foam breathing stops |
| 4 | density x 0.75 (existing) |
| 5 | fps 20; wave levels 12 to 3; terrain dressing off |
| 6 | fps 15; lite lights; props that are `sm` are skipped (existing) |

## 6. Budgets

**One method, and it is a command.** `node scripts/world-budget.mjs` (section 9) times the world at the scenes of the block below and says which are over. The method: headless Chrome with `--disable-gpu` (software raster, the stricter machine), a 1440 x 900 window at device scale 2, a real game at day 0 (`--days 60` for the late game), `pc.world` as the handle with the frame loop stopped, the camera set by the scene, three draws to settle and the sprites built, then the median of 120 draws each followed by a one-pixel readback so the raster is counted (without it a draw reads 0.4 to 3.4 ms and means nothing). "Still" is a camera that does not move (the ground cache is valid); "moving" adds `cam.x += 0.7` before every draw (a pan). **The canvas density is the world's own choice, 1.5 on a CPU-drawn canvas** (what `softwareRaster()` says and what `world.targetDpr` gives): every millisecond in this section and every ceiling is at density 1.5. The shot rig (`world-shots.mjs`) pins the canvas to density 2 so that pictures are what a GPU Mac draws, and the same scenes then read 1.55 to 1.8 times dearer (table below): **never compare a rig `--perf` number to a ceiling**; judge pictures at dsf 2 and milliseconds with `world-budget.mjs`. The reviewer measured 27 to 28 ms at the finest zoom and 38 to 41 ms at the locked working zoom on the unchanged legacy build: that was the density-2 pin, not a slow tree; the same tree reads 17 and 21 here.

The scenes, the baseline of `adcd991` measured by that method (this machine, median of two runs a few minutes apart, 2026-10-28: they agree within 3%), and the ceilings (1.25 x the baseline; the finest zoom never over 24 ms). `baseline` is the contract: ART_DIRECTION A.1's figures where it has the scene (this session re-measured them within 5%), this session's otherwise; `measured` is this session's two-run mean, and `pinned2` is the same scene at density 2, for orientation only. `alloc` is the allocation of the ceiling by layer (milliseconds, still then moving) for the track briefs: a sum under the ceiling leaves the margin for noise (`tests/world-budget.test.mjs` holds every sum under its ceiling, the still sum at least 5% under, and the `clouds` row at or over the model of `cloudbank.js` for the real layout at that scene).

<!-- render-budget -->
```json
{
  "factor": 1.25, "finestMaxMs": 24,
  "scenes": [
    { "id": "fit-0.129", "at": "fit", "x": 710.66, "y": 2467.44, "zoom": 0.1288, "baseline": [13.3, 17.4], "measured": [13.3, 17.4], "pinned2": [23.1, 26.3], "ceiling": [16.6, 21.8],
      "alloc": { "sea + shore": [3.0, 3.4], "ground chunks": [1.6, 3.0], "livedecals": [0.2, 0.2], "static props and shadows": [3.0, 3.1], "plots, people, crates, traffic": [0.7, 0.7], "clouds": [3.5, 3.5], "grade": [1.1, 1.1], "field, overlay, particles": [0.3, 0.3], "engine": [0.5, 0.7] } },
    { "id": "mid-0.3", "at": "fit", "x": 710.66, "y": 2467.44, "zoom": 0.3, "baseline": [22.7, 34.0], "measured": [22.7, 34.0], "pinned2": [40.2, 54.9], "ceiling": [28.4, 42.5],
      "alloc": { "sea + shore": [3.5, 3.9], "ground chunks": [1.1, 3.0], "livedecals": [0.3, 0.3], "static props and shadows": [2.9, 3.0], "plots, people, crates, traffic": [0.6, 0.6], "clouds": [15.1, 15.1], "grade": [1.1, 1.1], "field, overlay, particles": [0.3, 0.3], "engine": [0.5, 0.7] } },
    { "id": "mid-0.5", "at": "fit", "x": 710.66, "y": 2467.44, "zoom": 0.5, "baseline": [26.1, 37.2], "measured": [26.2, 37.9], "pinned2": [45.2, 59.2], "ceiling": [32.6, 46.5],
      "alloc": { "sea + shore": [3.5, 3.9], "ground chunks": [1.1, 3.0], "livedecals": [0.4, 0.4], "static props and shadows": [3.4, 3.5], "plots, people, crates, traffic": [0.2, 0.2], "clouds": [8.0, 8.0], "grade": [1.1, 1.1], "field, overlay, particles": [0.3, 0.3], "engine": [0.6, 0.8] } },
    { "id": "coast-0.9", "at": "coast", "x": -3644, "y": 2213, "zoom": 0.9, "baseline": [9.7, 17.2], "measured": [9.2, 16.8], "pinned2": [15.4, 25.9], "ceiling": [12.1, 21.5],
      "alloc": { "sea + shore": [3.5, 3.9], "ground chunks": [1.0, 3.0], "livedecals": [0.8, 0.6], "static props and shadows": [2.4, 2.6], "plots, people, crates, traffic": [0.6, 0.6], "clouds": [0.4, 0.4], "grade": [1.1, 1.1], "field, overlay, particles": [0.7, 0.7], "engine": [0.5, 0.7] } },
    { "id": "d1-1.0", "at": "zone:1", "zoom": 1.0, "baseline": [14.5, 24.7], "measured": [14.8, 25.1], "pinned2": [25.2, 38.9], "ceiling": [18.1, 30.9],
      "alloc": { "sea + shore": [3.0, 3.4], "ground chunks": [1.0, 3.0], "livedecals": [0.8, 0.6], "static props and shadows": [3.2, 3.4], "plots, people, crates, traffic": [1.0, 1.0], "clouds": [2.5, 2.5], "grade": [1.1, 1.1], "field, overlay, particles": [0.8, 0.8], "engine": [0.7, 0.9] } },
    { "id": "d3-1.2", "at": "zone:3", "zoom": 1.2, "baseline": [20.9, 32.2], "measured": [21.3, 32.6], "pinned2": [37.3, 53.5], "ceiling": [26.1, 40.3],
      "alloc": { "sea + shore": [2.5, 2.9], "ground chunks": [1.0, 3.0], "livedecals": [0.5, 0.4], "static props and shadows": [3.2, 3.4], "plots, people, crates, traffic": [0.8, 0.9], "clouds": [8.7, 8.7], "grade": [1.1, 1.1], "field, overlay, particles": [1.0, 1.0], "engine": [0.8, 1.0] } },
    { "id": "d1-1.8", "at": "zone:1", "zoom": 1.8, "baseline": [15.5, 19.1], "measured": [16.0, 19.8], "pinned2": [27.1, 32.1], "ceiling": [19.4, 23.9],
      "alloc": { "sea + shore": [2.2, 2.5], "ground chunks": [1.0, 2.5], "livedecals": [0.6, 0.5], "static props and shadows": [4.0, 4.2], "plots, people, crates, traffic": [2.0, 2.1], "clouds": [0.2, 0.2], "grade": [1.1, 1.1], "field, overlay, particles": [1.0, 1.0], "engine": [0.9, 1.1] } },
    { "id": "d1-2.4", "at": "zone:1", "zoom": 2.4, "baseline": [17.7, 20.3], "measured": [17.1, 19.1], "pinned2": [28.9, 32.9], "ceiling": [22.1, 24.0],
      "alloc": { "sea + shore": [2.0, 2.2], "ground chunks": [1.0, 2.0], "livedecals": [0.6, 0.4], "static props and shadows": [5.0, 5.2], "plots, people, crates, traffic": [3.5, 3.6], "clouds": [0.0, 0.0], "grade": [1.1, 1.1], "field, overlay, particles": [1.0, 1.0], "engine": [1.0, 1.2] } }
  ]
}
```

A pinch (the zoom changing every frame) stays under 48 ms on Day 1 and 28 ms on Day 60 (baseline 33 to 38 and 18 to 22: the stale chunks and sprites are blitted scaled while it lasts, 9.4 ms for a full window each, so a pinch must never also bake). Offscreen pixels never exceed 160 MB at dsf 2.

**What each operation costs**, measured by `scripts/diag/unitcost.mjs` on the same machine at density 1.5 (the canvas is 2.9 megapixels) with a readback after each: the numbers every allocation above is built from, and the reason the first version of this plan's rows were wrong. Re-run it on the machine you judge on.

| operation | ms for a full window | per megapixel |
|---|---|---|
| `fillRect`, opaque, or `clearRect` | 0.3 | 0.10 |
| `fillRect`, alpha 0.5 | 0.5 | 0.17 |
| `drawImage` 1:1 on whole device pixels (the ground blit, a baked layer) | 1.0 | 0.34 |
| `drawImage` of the same, nearest-neighbour scaled up (smoothing off) | 2.0 | 0.69 |
| **`drawImage` scaled or smoothed** (a bitmap to the window, a half-density bank to full) | **9.4** | **3.2** |
| **`fillRect` with a linear gradient** | **7.6** | **2.6** |
| 24 long stroked paths, 8 device pixels wide, alpha 0.45 | 3.4 | 1.2 (of the window; about 8 per megapixel of stroke) |
| 100 flat discs of radius 100 device pixels (3.1 Mpx of fill) | 1.3 | 0.41 |
| a puff as three path fills (body disc, belly and top crescents as paths) | 25 microseconds fixed, plus about 1.2 ms per megapixel of puff | |
| a puff as three fills in a clip | 3 discs of fill: twice the pixels of the crescent form | 0.51 per megapixel of fill |
| 400 small `drawImage` calls of 12 x 12 pixels (glints, motes) | 1.0 | 2.5 microseconds each |
| `setTransform` x 100 | under 0.05 | |

What follows from them, and what the tracks may and may not do. **A bank of cloud is drawn live, as flat fills, per puff, back to front** (`bankMs`: 27 microseconds a puff plus 1.2 ms per megapixel of fill; `scripts/diag/cloudcost.mjs` measures 6.6 ms for the Campus bank filling the window at zoom 1.2, 4.3 ms for the Scrap Yard at 0.9, 12.3 ms for the thirteen banks in view at 0.3 with the coarse puffs): never a sprite scaled up (a puff sprite is 3.9 ms per megapixel against 0.5 for the fill), never a half-density bake scaled to the window (9.4 ms), and never the puffs of a tier batched into one path (a union of overlapping subpaths measured 1.4 to 1.5 times slower than the same puffs filled one by one). Its memory is nothing. **The sea's base is not a bitmap drawn to the window.** A one texel to ten world pixel depth bitmap scaled to the window is 9.4 ms at density 1.5 and the plan's first sea row was 2.0; the depth is drawn as flat fills of bands between the marching-squares contours of the distance field (24 levels, an overlap of one device pixel between neighbours so no seam shows: about 1 ms for a window of water), the bitmap kept only as the build-time source of the field, and where a window is mostly water at fit zoom the same fills are cheaper than any bitmap. The wave bands are strokes and cost 8 ms per megapixel of stroke, so at most 10,000 device pixels of band length are stroked per frame (the visible dashes of the three nearest levels); motifs are small blits at 2.5 microseconds, 400 of them for a millisecond; the sheen is two or three flat translucent bands, never a gradient fill.

**Allocation, in words.** The sea and shore cost 3.5 ms where they were 2.0 (sea row of the first plan: optimistic by half; the legacy gradient strip alone is 1.9): the base fills 1.0, the bands 0.8, the motifs 0.75, the foam and swash in `livedecals` (which therefore is 0.8 where it was 0.1) and the sheen and haze 0.4. At the coast scene the clouds are 0.4 ms (the first plan gave 1.5: the nearest bank is a few puffs at the window's edge, which the model counts); at the Campus 8.7 (the first plan gave 5.0, and the legacy fog is 15.6), at 0.3 the thirteen banks in view are the dearest cell of the table (15.0 by the model, 12.3 measured) and the cell with least slack (3.1 ms, 11%): T2 may drop the crescents of a puff there before it drops a puff. The slack at the coast scene is 1.1 ms (9%): sea, ground and props must not grow.

**Memory** (MB of canvas pixels at dsf 2, the worst case: a GPU Mac draws at 2; one ledger in `gfx.js`, T5, into which every cache registers its pixels). The ground is chunks of 384 device pixels, 0.59 MB each, so its memory does not depend on the zoom (a window touches 54 at most; 40 MB at the peak of a zoom); the sprite budget is stated at the density it is judged at, 12 million pixels at dsf 2 (`SPRITE_BUDGET`, 22 million at density 1 today, becomes 8 million so that `setSpriteBudget`'s own growth of 1.5 lands on 12 million; the earlier text said 12 million at density 1, which is 72 MB at dsf 2 and 172 MB in all); the sea has no bitmap; the clouds are drawn live. `tests/world-ledger.test.mjs` sums the block and holds it under 155 MB.

| holder | MB | owner |
|---|---|---|
| main canvas (2880 x 1800) | 20.7 | T5 |
| ground chunks (54 x 0.59 at rest, a quarter more at the peak of a zoom) | 39.8 | T5 (content T1) |
| light layers (`day` full size 20.7, `mix` half size 5.2, a reserve for the transient `night` tile; `shafts` transient) | 31 | T2 |
| sprites and overlays (12 million pixels at dsf 2, overlays included) | 48 | T5 budget, T3 + T4 content |
| sea contour paths (24 levels as `Path2D`) | 2 | T1 |
| foam and tuft caches | 1.5 | T1 |
| far cloud banks (three baked silhouettes) | 1.6 | T2 |
| labels | 6 | T5 |
| shadow stamps | 0.5 | T2 |
| **total** | **151.1** (limit 160, headroom 8.9) | |

`World.release()` and `detach()` give every holder back (`releaseAll()`). With no `OffscreenCanvas` (the Node tests) every layer draws direct, as today.

<!-- render-memory -->
```json
{
  "window": [1440, 900], "dsf": 2, "limitMb": 160, "headroomMb": 5,
  "holders": [
    { "id": "canvas", "owner": "T5", "mb": "canvas" },
    { "id": "ground chunks (peak)", "owner": "T5", "mb": "ground.peak" },
    { "id": "light layers", "owner": "T2", "mb": 31 },
    { "id": "sprites and overlays", "owner": "T5", "mb": "sprites" },
    { "id": "sea contour paths", "owner": "T1", "mb": 2 },
    { "id": "foam and tuft caches", "owner": "T1", "mb": 1.5 },
    { "id": "far cloud banks", "owner": "T2", "mb": 1.6 },
    { "id": "labels", "owner": "T5", "mb": 6 },
    { "id": "shadow stamps", "owner": "T2", "mb": 0.5 }
  ],
  "spritePixelsAtDsf2": 12000000,
  "spriteBudgetBase": 8000000,
  "spriteBudgetNow": 22000000
}
```

## 7. Who owns which file

One owner per file. T5 owns the engine and the frozen foundations; the four art tracks each own a disjoint set of modules. Shared tokens live in modules with one owner (`palette.js` T2, `solids.js` T3, `shadow.js` T2, `cloudbank.js` T2, `lod.js` T5, `chunks.js` T5): the others import and never edit them. If a track needs a token or a helper it does not own, it writes the local variant in its own module from existing tokens (`mix`, `shade`, `faceTone`) and asks for the addition; when a helper is promoted, the owner moves it.

| track | scope | files (all in `js/world/` unless a path is given) |
|---|---|---|
| **T1** terrain, coast and water | the sea, the shaped coast, beach, cliffs, foam, terrain colour field and dressing, roads, bridges, ferry, ground decals, district ground colours | `sea.js` `coast.js` `terrain.js` `roads.js` `decals.js` `ground.js`; `layout.js` (colour derivations `cols`, `tcol`, and the land colour field only: the geometry, `land`, `ZV`, `zAt`, hit data are frozen); `island.js` (`REGIONS` tints only) |
| **T2** atmosphere | clouds replacing the fog, the grade and time of day, cast shadow rules, light shafts, vignette, sky haze, far-zoom aerial perspective, weather and particles; the palette | `clouds.js` `cloudbank.js` `atmos.js` `lighting.js` `fx.js` `palette.js` `shadow.js` |
| **T3** buildings | building bodies, roofs, windows, awnings, signs, per-theme styling, plots and pipelines, district kits' colours and parameters | `props-buildings.js` `ents-plots.js` `kits.js` (colours and style parameters only; footprints and placement are frozen) `solids.js` |
| **T4** props, nature and characters | crates and lot items, barrels, lamps, benches, fences, flags and signs, gates, vehicles, trees, bushes, flowers, rocks, the crane and industrial props, buyers and the player, micro-props | `props-street.js` `props-nature.js` `props-actors.js` `ents-actors.js` `ents-stock.js`; new: `figures.js` (the doll, faces, accessories, noticing) |
| **T5** raster quality | the engine, the layer stack, sprites and overlays, the ground cache and chunks, snapping, supersampling, seams, the governor, memory, labels, the map; the rig | `world.js` `stack.js` `lod.js` `chunks.js` `common.js` `groundcache.js` `statics.js` `overlay.js` `mapmode.js` `sprites.js` `gfx.js` `labels.js`; frozen legacy: `iso.js` `shading.js` `props.js` `props-common.js`; `tests/helpers/*`, `scripts/*` |

Why the splits fall where they do. `kits.js` is T3's because it names the buildings; the hairline decals in it are T1's concern but T1 fixes them by **interpretation** in `decals.js` (clamp every band to 0.12 tile, turn `grid` into pavers), not by editing `kits.js`. `layout.js`'s `kit.ground` call for the scrap yard dies when T1 reads the ground from `palette.groundSet`; T1 ignores it, T3 deletes it when convenient. `props-common.js`, `iso.js` and **`shading.js`** are legacy helpers (`tone`, `box`, `person`, `tree`, `lamp`, `fogged`, the `layer()` registry, `sign`; `solid`, `hazed`, `hazeAt`): T5 keeps them working, tracks write their V2 versions in their own modules (`solids.js`, `figures.js`) and migrate their drawers; when no drawer imports a legacy helper, T5 deletes it. `shading.js` is frozen because five modules of two other tracks import it (`solid` in all four `props-*.js` files, `hazed` and `hazeAt` in the frozen `props-common.js` and `props.js`): giving it to T3 would change T4's and T5's pixels at T3's merge. T3 replaces `solid` call by call inside its own modules with `roundedBox`; T4 does the same at its own pace; `HAZE` moves to a `mix` of `palette.SKY.horizon` when T5 moves `tint()` onto `veiled` (the same commit as the clouds flip, section 8, T5 item 10). The DRAW table is one object that the four `props-*.js` files add to; the V2 drawers do not go in it: they are registered per kind (`registerProp`, section 2) and the `layer()` registry is in `props-common.js`.

<!-- render-owners -->
```json
{
  "T1": [
    "sea.js",
    "coast.js",
    "terrain.js",
    "roads.js",
    "decals.js",
    "ground.js",
    "layout.js",
    "island.js"
  ],
  "T2": [
    "clouds.js",
    "cloudbank.js",
    "atmos.js",
    "lighting.js",
    "fx.js",
    "palette.js",
    "shadow.js"
  ],
  "T3": [
    "props-buildings.js",
    "ents-plots.js",
    "kits.js",
    "solids.js",
    "parts.js",
    "bstyle.js",
    "buildings.js",
    "bldg-civic.js",
    "bldg-works.js",
    "bldg-small.js",
    "plots.js"
  ],
  "T4": [
    "props-street.js",
    "props-nature.js",
    "props-actors.js",
    "ents-actors.js",
    "ents-stock.js"
  ],
  "T5": [
    "world.js",
    "stack.js",
    "lod.js",
    "chunks.js",
    "common.js",
    "groundcache.js",
    "statics.js",
    "overlay.js",
    "mapmode.js",
    "sprites.js",
    "gfx.js",
    "labels.js",
    "iso.js",
    "shading.js",
    "props.js",
    "props-common.js"
  ],
  "later": {
    "camera-input.js": "T5"
  }
}
```

`later` lists files that are owned but not yet in this branch: `camera-input.js` is `v2/zoom`'s (the wheel, trackpad and Safari-gesture zoom, merged into T5's `world.js` by the orchestrator). The test accepts a `later` file that is absent and requires that none is also in a track's array.

**Tests** follow their module: T1 `tests/world-sea|coast|terrain.test.mjs`; T2 `world-palette|shadow|clouds.test.mjs`; T3 `world-solids|buildings.test.mjs`; T4 `world-props|figures.test.mjs`; T5 `world-lod|stack|ownership.test.mjs`, the governor and sprites tests. The existing `world.test.mjs`, `world-fx.test.mjs`, `world-static.test.mjs` and `art-direction.test.mjs` are T5's to keep green; the track that flips a layer updates exactly the lines that pin that layer's old look.

## 8. Track briefs

Each brief: what to build (in order of what the author complained about first), what it must hand over, what it needs from the others, how it is judged. The look, colours and numbers are `ART_DIRECTION.md`; section numbers below are its.

### T1. Terrain, coast and water

Layers `sea`, `shore`, `terrain`, `roads`, `blocks`, `livedecals`. The author's first complaint is the sea, and the sea is yours.

1. **The sea is a world-space surface** (5.1 to 5.3, 5.10, 5.11, DIAGNOSIS W1 to W3). V2 `sea` is `world` space (`v2space`), drawn under the camera transform before the ground, and it fills the VIEW first with the haze colour (section 1: no pixel unpainted at any window size). Colour is a function of the distance to the nearest shore: rasterise the land silhouette (tiles at their heights plus cliff walls to the waterline) into a 1/10 mask, take an EXACT Euclidean distance transform (Felzenszwalb and Huttenlocher's two-pass transform, y doubled; a chamfer metric has several percent angular error and shows as an octagon at the finest zoom) built in slices with `slice()`, and extract contours from that one field by marching squares, Chaikin-smoothed twice, as `Path2D` chunks of 1,024 world pixels: 24 depth levels (the stops of 5.1 and the steps between them) and the twelve wave levels. **The depth is drawn as flat fills of the bands between those contours, with an overlap of one device pixel between neighbours so no seam shows, never as a bitmap scaled to the window**: a bitmap at one texel to ten world pixels is a 13.5 times smoothed upscale, 9.4 ms of a window at density 1.5 (the unit costs of section 6); the same contour polygons draw the shoal, the shelf and the foam, so the pale turquoise ring is crisp at every zoom (the first plan's bitmap was 48 device pixels a texel at 2.4). Crests, curls, glints, rings and caustics are hashed world-space motifs (small blits, at most 600 a frame at mid zoom, 1,100 at near), **with a screen-space minimum like the bands'**: a crest lens is at least 3 screen pixels thick and 14 long, a curl at least 8 across, a glint at least 3 (a lens of 3 x 14 world pixels is 1.5 x 7 screen pixels at the 0.5 gate, the size of the dashes the author dislikes), and at far zoom the bands are wider than long and lean on the depth bands, the foam and the sheen; the sheen is two or three flat translucent bands, never a gradient fill (7.6 ms). Wave bands are strokes (8 ms per megapixel of stroke): at most 10,000 device pixels of band length a frame. The `water` decal and the ferry route are restyled (4.5). **Acceptance is mechanical, by exit code**: `node scripts/world-metrics.mjs DIR --anchor` on the rig's `pan` set exits 0 only when every pair is anchored (it exits 1 for a sea that stayed on the screen, 2 when it proved nothing): the pan pair (`sea-pan-a`, `sea-pan-b`: the same scene from two cameras 300 by 160 css pixels apart differs by exactly the camera displacement, `env.t` frozen), the zoom pair (`sea-zoom-1`, `sea-zoom-2`: the detail at matching world scales, the camera mapped through the zoom) and the drift pair (`sea-drift-a`, `sea-drift-b`, drawn 2 s apart: a crest is where the camera puts it plus at most 0.1 tile a second); `node scripts/world-metrics.mjs DIR --unpainted` on `--set extent` shots at 390 x 844 and 768 x 1024 exits 0; `scripts/diag/anchor.mjs` exits 0. Both commands run in the T1 gate.
2. **A shaped, smooth coast** (5.4 to 5.6, C1, C2): marching squares on the land field with the roads, footpaths, bridge ends, blocks, pads and prop footprints held as land, smoothed twice, never more than 12 world pixels from the tile coast. The foam ribbon (scalloped, breathing 0.35 tile over 6.5 s, phase travelling along the beach; drawn LIVE by `livedecals` after the cache's blit, as are the wet-sand swash and the cliff foam skirts, and the baked `shore` holds the coast at mid swash), wet sand, a scalloped boundary to meadow, shells and driftwood at near, cliff faces with strata, a grass lip and a foam skirt, walls that end at the waterline (not 34 pixels under it).
3. **The land is a place** (5.8, C3 to C6): `terrainColour(i, j)` per vertex (height biome, slope light from the upper left, district ground blended over 8 tiles), bilinear fill with 2 x 2 and 4 x 4 sub-quads at near and close, 0.6 pixel overdraw, soft patches, worn paths, plateau rims, dressing capped at 1,500 marks and skipped while the camera moves. The stride-1/2/4/8 re-meshing and its pops go: detail changes by `env.lod`, not by re-meshing.
4. **Roads, bridges, decals** (4.5): kerbed ribbons with rounded joins, painted dashes, zebra bars, plank bridges with ball-capped rails and foam collars, a buoyed ferry route, decals as bands and pavers (every band at least 0.12 tile; no `grid` hairline lattices).
5. **District ground** from `palette.groundSet(theme)` in `layout.js` (2.4): bright, hue-faithful, with the block as a raised stage and a soft contact shadow.

Hands over `key(w)` for ground layers that bake time of day; the water's colours read `w.night`/`w.dusk` and the palette's `SEA`/`SKY`, and the grade (T2) multiplies the finished frame. Needs T5's chunk cache (`groundcache.js` with `chunks.js`, sections 3 and 5) for panning; until then the V2 ground draws into the existing copy. Judged by 10.1's Sea, Coast and foam, Beach, Cliffs, Land, Roads rows and the gates `coast-1.0`, `sea-0.5`, `fit`; cracks 0 (`scripts/diag/seams.mjs`); budget rows "sea + shore", "ground", "livedecals"; memory 2 + 1.5 MB.

### T2. Atmosphere

Layers `clouds`, `grade`, `weather`, `field`, `particles`; owns the palette and the shadow rule. The fog is "singular patches of blurred dots"; it goes.

1. **Cloud banks** (6, F1 to F4): `cloudbank.js` is written and tested (section 3): `bankPuffs(fp, z, scale)` gives 40 to 150 puffs (about 85 for any district) whose radius is 0.042 of the footprint's screen width, so a bank covers 96 to 99.6% of each of the 16 real footprints as one connected mass with every puff overlapping at least two others by 35% of the smaller radius (the first sizing, 14 to 42 puffs of radius 22 to 64, could cover 27 to 68% at best: `maxCoverage`, held by `tests/world-cloudbank.test.mjs`), three tiers back to front (larger and raised at the back, smaller and lowest in front), a flat belly-coloured base, lit tops (`CLOUD`), ground shadows towards +gx, ghosts of the district under it (rows at 0.90, 0.82, 0.78, the district seen through `veiled`), tall things standing out of the dome, a floating padlock, one or two small windows near the gate. **How it is drawn, by band** (`bankScale(zoom)`): below 0.30 one baked silhouette sprite per district, blitted scaled (a few small blits); from 0.30 to 0.70 the COARSE bank (`scale` 1.6: about 35 puffs a district, one outline) drawn live; from 0.70 the fine bank live, with the mist rim, the windows, sparkle motes and fraying puffs added as `detail` alphas, the coarse and fine banks cross-faded over zoom 0.60 to 0.80 (never a pop). **Live means flat fills, per puff, back to front**: the body as a disc, the belly and the top as crescent paths (no clip, no gradient, no blur, no sprite scaled up, no batching of a tier into one path: section 6 measured each against the live puffs and every one is slower). Bob, swell and the slow slide are free for a live puff (a position and a radius); under Calm, Off and reduced motion they stand at their rest pose. The unlock dissolve in 2.6 s (REVEAL_MS) from the gate outward with a flash ring, lifting puffs and sparkles, a 400 ms cross-fade under reduced motion. **Cost** is `bankMs`, 27 microseconds a puff plus 1.2 ms per megapixel of fill, measured by `scripts/diag/cloudcost.mjs`: 6.6 ms for the Campus bank filling the window at 1.2 (the legacy fog is 15.6), 12.3 ms for the thirteen banks in view at 0.3; the plan's clouds row is that model on the real layout at each scene's camera, and no more than 0.6 ms over it (`tests/world-budget.test.mjs`). Never a dark wash, never a pool: DIAGNOSIS F1 to F3 are the faults to prove gone. The memory of the clouds is the three far silhouettes (1.6 MB) and nothing else.
2. **Veil, not dim**: `veiled(c, k)` replaces `fogged` for everything under cloud; the ground and props (T1, T3, T4) call it with `k = env.dim / FOG_DIM`. A locked district is never darker than an open one.
3. **The grade** (2.7, G1 to G4): bright by default (plain white from sun hour 07:00 to 16:59), gold evening, periwinkle night with mean luma at least 0.34, no navy vignette, no pale edge falloff, no `bakeAir` foot; `tintFor`/`gradeFor` from the palette replace `lighting.js`'s `NIGHT`/`GOLD`/`RAIN`. Keep the rate limit (WCAG 2.3.1) and the one-full-layer-a-frame scheduling; replace the held 30% night at speeds of 16 and over by holding the hour (G2). The 168-second day (G3) is the author's to change in `config.js` (not ours); a brighter night is ours.
4. **Light and shadow**: the shadow rule and stamps in `shadow.js`, god-ray shafts at dawn and dusk, lamp pools in `#ffe9a8`, window glow, the 0.34 night-luma floor held by a test.
5. **Weather and particles** (`fx.js`): rain at least 1.5 px, round confetti and dust (no `fillRect` motes), round-and-pastel particles, rings as soft double rings.

Needs from T1/T3/T4: they call `castShadow`/`contactShadow` and `veiled`. Hands over `palette.js` as the colour authority. Judged by 10.1's Fog and clouds, Lighting and grade, Motion rows and the gates `locked-0.9`, `locked-0.5`, `fit`; the squint, greyscale and five-second tests (10.3); budget rows "clouds" (the model's cost at each scene: 0.4 ms at the coast, 8.7 at the Campus, 15.1 at 0.3, against 16.4 now at the Campus), "grade", "field, overlay, particles"; memory 31 + 1.6 + 0.5 MB.

### T3. Buildings

Layers `plot`, `pipe` and `static-bldg` (the 18 building kinds). Chunky, bevelled, pastel, friendly.

1. Adopt `roundedBox` for every body (corner radius `bevelRadius`, 3 to 12 world pixels by the building's size; the fillet down the front edge, the chamfer band along the top-front edges, the sun's streak, the two base AO bands; the face model that steps at least 15% of luma from top to left and from left to right) and the recipes of 3.2: rounded-rim roofs with eaves (flat, gable, hip, saw, pediment), framed windows with a reflection band and sill plate, arched doors, scalloped awnings, plank signs with raised letters, chimneys, downspouts, plinth bands; no hairline anywhere (3.3). Walls: plaster, brick, boards, glass, metal.
2. The landmarks of 4.2, each with its signature (`bldg`, `hall`, `exchange` with the turning globe, `rack`, `shack`, `depot` with its tariff overlay recoloured, `tower`, `ipo` with the golden bell, `office`, `bank`, `manor`, `barn`, `factory`, `stall`, `kiosk`, `podium`, `rentrow`, `shop`) and the pipeline buildings and plots (`pipe`, `plot`): height still equals the level, the tier readable from the silhouette.
3. Per-theme styling from `palette.groundSet`/`DISTRICT_DAY` accents and the roof table; `kits.js` loses its dark hexes and takes the ramps (parameters and colours only: every footprint, slot and hit shape stays, held by `tests/world-static.test.mjs`).
4. **Base + overlays** (section 4): the base sprite is the complete building; `detail: [{band:'near'}, {band:'close'}]` add framed windows and curtains, then shingles, bricks, plank joints, door numbers, window boxes. Live parts (smoke, blink, window glow, the globe) stay live and cheap.
5. `shading.js` is NOT yours (it is T5's frozen legacy: four prop modules, `props-common.js` and `props.js` import it): inside your own modules `solid` is replaced by `roundedBox` call by call. Register each building kind as you redo it (`registerProp(kind, def)`, section 2), test behind `?layers=static-bldg:v2`, and flip `static-bldg` when its rows pass; T4's kinds are untouched by your flag. **The first gate is the bare solid**: look at `scripts/diag/solids.mjs` (the legacy box beside `roundedBox` in the island's colours at the sizes of its buildings, at 0.9 and 2.4) before building anything on it; a body that does not read as a chunky toy there will not read as one with windows on it.

Needs T2 for `castShadow`/`contactShadow`/`veiled`, T5 for sprite overlays (until then the base stands alone). Judged by 10.1's Houses and shops, Towers and landmarks, Industrial and harbor (the buildings), the `finest-2.4` and `locked-0.9` gates (towers standing out of cloud); budget row "static props and shadows" shared with T4 (the sprites are cached: build cost is in the sprite ledger, not the frame); sprite memory share.

### T4. Props, nature and characters

Layers `lead`, `lot`, `asset`, `truck`, `car`, `player` and `static-prop` (the other 43 kinds: register each as you redo it with `registerProp(kind, def)`, section 2; flag `?layers=static-prop:v2`; `shading.js` stays as it is until you have no `solid` call left). Everything small, fat and rounded; people with faces.

1. **Crates and lots** (4.1, 4.4): the rounded cube (0.72 tile) with three plank slats and brackets, stencil at near, the pallet; `crateColor(tag)` replaces `TAG_COLOR`; auction lots with rope and bell, a broken crate with tape, a peeker toy on top at close.
2. **Street and yard** (4.1): `gate` (barrier, raised bridge leaf, ferry with the "NOT RUNNING" plank), `lookout`, `board`, `scrap`, `tires`, `barrel` (the burning one), `fence` (3.5 pixel pickets with caps), `lamp`, `neonlamp`, `bench`, `flag`, `lantern`, `neonpole`, `polesign`, `bollard`, `billboard`, `ticker`, `spot`, `statue`, `forsale`, `fountain`, `helipad`; contact shadows under everything.
3. **Nature**: trees as puffs on a tapered trunk (5 greens, 3 sizes, species by district), bushes, hedges, planters, topiary, hay, flowers, tufts, rocks, reeds; sway live and cheap.
4. **Machines and vehicles**: the crane (cab, striped jib, swinging magnet), gantry, ship with portholes and a wake, tank, silo, stack with round puffs, dome, dish, windmill, cart, car rows, containers, the freight truck and the traffic.
5. **Characters** (3.1, 7.5, `figures.js`): the doll (capsules; head, torso, legs), faces at near and close (two dot eyes, cheeks), hair and hats by role, clothes by `personLook`, idle bob and blink, a hop when a buyer notices the player, the unique tomato-red player with a beanie pin; a pill at far zoom. Wait, walk, leave. All motion stops under Calm, Off and reduced motion with open eyes.
6. **Micro-props** (7.4): a hashed `micro.js` (add it to the table) placing at most 60 per district in view at near and close, never on roads, pads or props.

Needs T2 for shadows, T3's `solids.js` (`capsule`, `puff`), T5 for overlays. Judged by 10.1's Trees and plants, Characters, Crates, Street furniture, Gates, Industrial and harbor (the props), Motion rows and the `finest-2.4` gate; budget rows "static props", "plots, pipes, people, crates, traffic".

### T5. Raster quality

The engine, the stack and the pixels; the track that makes the others' work sharp, cheap and safe. Its first four deliverables unblock the others, so they come first.

Already written and tested (the refactor and its review): the layer stack with the two static layers and `registerProp`, the pixel ledger, `registerReleaser`/`releaseAll`, `slice`, the chunk arithmetic (`chunks.js`), `scripts/world-budget.mjs`, `scripts/arch-figures.mjs`, `scripts/diag/unitcost.mjs`, `cloudcost.mjs` and `solids.mjs`, the exit-coded `--anchor` and `--unpainted`.

1. **Sprite overlays** (section 4): `layer.detail` bands built and blitted with `env.lod.detail[i]` (`layer()` and `registerProp` already keep the field; the sprite cache keys each entry by the layer definition that drew it); the sprite budget stated at the density it is judged at, 12 million pixels at dsf 2: `SPRITE_BUDGET` from 22 million to 8 million at density 1 so that `setSpriteBudget`'s own 1.5 growth lands on 12 million (change `spriteBudgetNow` in the render-memory block in the same commit); every holder registers in the pixel ledger; LRU evicting overlays before bases.
2. **Camera snapping** (section 5): `toWorld` rounds the translation (so every blit lands 1:1 on whole device pixels: a fractional offset is a resampled blit, ten times the cost); the cache key carries it; sprites, labels and the ground share one phase (S5).
3. **Ground chunks** (`groundcache.js`, with `chunks.js`): chunks of 384 device pixels at the exact scale with a one device pixel bleed, supersampling under density 1.5, stale scaled chunks while the zoom moves and an exact bake on rest in slices, keyed by `groundKey`; the pan costs blits (C7); 54 chunks at most, registered in the ledger as `ground.chunks`.
4. **Governor**: the `requestAnimationFrame` interval as a second signal, the 30 fps cap only for a still camera, the tier table of section 5, a test that feeds slow costs then fast and checks `slow` rises then falls (P1, P4).
5. **Zoom**: crossfade stale to exact sprites on a pinch, the `lodOf`-driven `far` mapping (`FAR_ZOOM` 0.42 to 0.30, with T1/T3/T4 flipping their `far` drawers; the full props that draw between 0.30 and 0.42 are counted in the 0.3 and 0.5 rows of section 6), no rebuild spike on the first frame of a zoom (S6). The camera input (`bindInput`, `zoomBy`, `camera-input.js`) is `v2/zoom`'s.
6. **Seams and edges**: the silhouette-first helper for sprites, tile overdraw with T1, the crack metric at 0 (S1, C5).
7. **Memory**: `release()`/`detach()` return every holder; the ledger asserts the 160 MB ceiling in the browser (`scripts/diag/memory.mjs`, summed against the render-memory block) as the test sums the plan (P2).
8. **Retirement**: when a track's flags are v2, delete the legacy drawer, its adapter and its test lines; when no drawer imports `iso.js`'s legacy primitives, `shading.js` or `props-common.js`'s helpers, delete them.
9. **The rig**: keep `scripts/world-shots.mjs`, `world-ab.mjs`, `world-metrics.mjs`, `world-budget.mjs` working and the baseline's 27 shots the default set.
10. **`tint()` follows the clouds flag**: `props-common.js`'s `tint(c, env)` (every prop's colour) calls `fogged` (a darkening) and `hazed` (the old `HAZE`); when T2's `clouds` layer flips to v2, `tint` calls `veiled(c, env.dim / FOG_DIM)` and a `mix` of `palette.SKY.horizon` instead, in the same commit, so a locked district under the new cloud is never darker than an open one while T3 and T4 are still on their legacy drawers.

Judged by: zero-diff for every no-op change, the budget script, the seams and anchor scripts, memory, the governor test.

## 9. How to check your work

Serve your worktree on your own port and run the rig; each Chrome needs its own debugging port and profile; stop what you started by PID (never `pkill`). At most one Chrome and one server of your own at a time.

```
PORT=85xx node server/static.mjs &                                    # note the PID
node scripts/world-shots.mjs --base http://localhost:85xx --out DIR --cdp 95xx [--set quick|pan|tod|extent] [--dsf 2] [--w 390 --h 844]   # the 27 shots of `all` are the baseline's
node scripts/world-metrics.mjs BEFORE_DIR --diff AFTER_DIR            # visible difference per shot: meanAbs, share, identical
node scripts/world-metrics.mjs DIR --anchor                           # EXIT 0: the water moved, scaled and drifted with the camera (pan, zoom and drift pairs of `--set pan`); 1: it did not; 2: nothing proven
node scripts/world-metrics.mjs DIR --unpainted                        # EXIT 1 when any shot has a pixel nothing painted (shoot `--set extent` at 390 x 844 and 768 x 1024)
node scripts/world-ab.mjs BEFORE_DIR AFTER_DIR OUT_DIR                # side-by-side pictures and a contact sheet
DIAG_BASE=http://localhost:85xx DIAG_CDP=95xx node scripts/world-budget.mjs [--scene id,id] [--days 60] [--check]   # milliseconds against section 6's ceilings; --check exits 1 over a ceiling
node scripts/diag/seams.mjs | anchor.mjs | stages.mjs sw 2 0|60      # cracks, anchoring (GPU Chrome), per-layer cost
node scripts/diag/unitcost.mjs | cloudcost.mjs | solids.mjs           # what an operation costs, what a cloud bank costs, the bare roundedBox sheet
node scripts/arch-figures.mjs [--write]                               # the figures ARCHITECTURE.md quotes (the orchestrator's, rule 11)
?layers=sea:v2,static-bldg:v2                                         # in the page address: choose V2 drawers while developing
```

Two methods, two jobs. **Pictures** are judged at dsf 2 (the rig pins the canvas density to 2, which is what a GPU Mac draws). **Milliseconds** are judged by `world-budget.mjs` at the world's own density, 1.5 on a CPU canvas: that is what every ceiling is in. The rig's `--perf` pins density 2 and reads 1.55 to 1.8 times dearer; use it to compare builds with each other, never with a ceiling.

`/private/tmp/claude-501/-Users-stronghold--claude-spares-spare-hn5fMv/5bfad21d-b9ff-4652-a42a-d112d044bff1/scratchpad/art-baseline/` holds the rig's 27 shots, their manifest and perf at `adcd991` (dsf 1 and 1.5 quick sets in subfolders); two runs of one build give identical pixels (`determinism-diff.json`), so any difference is the change. A no-op change is accepted at `identical: true` on every shot, at dsf 2, 1.5 and 1; an art change is accepted by its rows in section 10.1 of the art direction, its exit codes (T1: `--anchor`, `--unpainted`) and its budget rows here. Run the whole suite (`node --test --test-concurrency=4 tests/*.test.mjs`) before every commit: it passes with 15 skipped and takes about 3 minutes (set `PC_NO_BROWSER=1` to skip the browser halves while working).

## 10. Order of work and merging

Tracks branch from the tip of `v2/art-stack` (after this plan and the refactor), work in their own worktree, and merge in any order: the file sets are disjoint, the shared modules are frozen, and every flag starts as legacy, so a track's merge changes nothing until it flips. The two static layers make that true of T3 and T4 as well: each registers its own kinds and flips its own flag, and neither edits the other's drawers or the frame. The orchestrator merges flips one layer at a time, each with its rig diff and budget numbers. T5's first four deliverables should land before T3 and T4 depend on overlays; T3 and T4 meanwhile build the base complete. Cross-track requests go through the orchestrator in the track's report; do not edit round a freeze.

**Merging `v2/zoom`.** It adds `js/world/camera-input.js` (owned by T5: the ownership block lists it under `later`, so the ownership test accepts it before and after), a `tests/camera-input.test.mjs`, and edits `world.js` (T5's) and `docs/ARCHITECTURE.md`. Two textual conflicts, both the orchestrator's to resolve in the merge commit: the import block of `world.js` (this branch moved the drawers into modules and rewrote the imports beside the line `v2/zoom` adds, `import { ZoomInput } from './camera-input.js'`: keep every line of both) and `docs/ARCHITECTURE.md`'s figures (take this branch's text, then `node scripts/arch-figures.mjs --write`, then run the suite with `PC_STRICT_DOCS=1`). Nothing else overlaps: `v2/zoom` touches `bindInput`, `zoomBy`, `goTo`, `stop` and the canvas label, which no track edits.

## 11. As built: the refactor that put the code in this shape

Committed on `v2/art-stack` after the plan. Nothing visible changed: that is the point, and it is proved.

**What moved where.** Code was moved, not rewritten: every legacy drawer is the same text it was in `world.js`, now an object-literal method in its owner's module and mixed into `World.prototype` (`Object.assign(World.prototype, seaMethods, groundMethods, ...)` at the foot of `world.js`), so `this` is still the world and `w.drawWater`, `w.drawFog`, `w.drawGround`, `w.chip` and the rest of the names the tests call still exist. The one piece that was cut rather than lifted is `drawGround`, which was one 40-line method and is now its order (`ground.js`) over four layers: `drawCliffs` (`coast.js`), `drawTerrain` (`terrain.js`), `drawRoads` (`roads.js`) and `drawBlocks` (`ground.js`), called in the old order with the old variables.

| was in `world.js` | now |
|---|---|
| `drawWater` | `sea.js` |
| `drawGround` (order), districts' blocks, decals and crosswalks call | `ground.js` (`drawGround`, `drawBlocks`) |
| cliff walls and foam | `coast.js` (`drawCliffs`) |
| terrain tiles, `coarseCol` | `terrain.js` (`drawTerrain`, `coarseCol`) |
| `drawRoads`, `drawBridge`, `drawMarks` | `roads.js` |
| `drawDecal`, `drawLiveDecals` | `decals.js` |
| `groundPass`, `cacheOK` | `groundcache.js` (the camera matrix is `World.toWorld`, written once) |
| `drawFog` | `clouds.js` |
| `drawGrade`, `drawWeather`, `drawField`, `drawParticles`, `CONFETTI` | `atmos.js` |
| `drawStatic`, `boardText`, `drawTariff` | `statics.js` |
| `drawPlot`, `drawPipe` | `ents-plots.js` |
| `drawLead`, `drawPlayer`, `truckPos`, `drawTruck`, `cars`, `drawCar`, `lookOf`, `CARS` | `ents-actors.js` |
| `drawLot`, `drawAsset`, `TAG_COLOR`, `classColor` | `ents-stock.js` |
| `drawOverlay`, the name tags, pips, `chip`, `icon`, `tag`, `leadBubble`, `progress`, the tag-placement constants | `overlay.js` |
| `drawMapRoute`, `drawMapLabels`, `spreadCards`, `miniBase`, `drawMini` | `mapmode.js` |
| `compact`, `money`, `FAR_ZOOM`, `PIP_ZOOM`, `FOG_DIM` | `common.js` (`world.js` still exports `FAR_ZOOM`) |

`world.js` fell from 1,259 lines to 604: the constructor, lifecycle, camera (with `bindInput` and `zoomBy` left exactly where they were, for `v2/zoom`), hit testing, `sync`, the frame loop, the governor, `update`, `draw` (the stack's order), the entity dispatcher, the hover, and the tutorial anchors. `props.js` fell from 763 lines to 40 (the front door: `drawProp`, `farDraw`, `KEEP_FAR`, `layerOf`, `BUILDING`, the re-exported `DRAW`) over `props-common.js` (73, the frozen helpers and the `DRAW`/`LAYER` registries), `props-buildings.js` (359: `shop` and the 17 layered buildings), `props-street.js` (168: 24 kinds), `props-nature.js` (33: 6 kinds) and `props-actors.js` (132: 11 machines, `autos`, `containers`). The DRAW table has the same 61 kinds as before. `iso.js` is untouched.

**What was added.** `stack.js` (the layer table, the flags, `registerLayer`, `setFlag`, `setFlags`, `runLayer`, `groundKey`; `?layers=` is read in the address), `lod.js`, `palette.js`, `solids.js`, `shadow.js`; `World.toWorld`, `toScreen` and `safeLayer`; `env.lod` (set every frame from one reused record); `releaseShadows()` in `World.release`; `groundKey` as the eighth slot of the ground cache's key (0 while every layer is legacy, so nothing is redrawn that was not); `shading.js` re-exports `roundedBox` and `bevelRadius` so the module is part of the staged site's graph from now (T3 imports it directly when it begins). `docs/ARCHITECTURE.md` quoted the new module count and sizes (83 modules, 96 requests, 574 KB gzipped; `tests/finish-repair.test.mjs` holds them: since the review round, within a tolerance on a track branch, section 0 rule 11).

**The proof.** The shot rig (`scripts/world-shots.mjs`, the settings that made the baseline) against the baseline at `adcd991` (`art-baseline/`):

| set | shots | result |
|---|---|---|
| dsf 2, all | 27 (every scene, four hours of day, the pan and zoom pairs, the opened district) | identical on every shot: `meanAbs` 0, `share` 0, the same pixel hash in the manifests; no console error, none unstable |
| dsf 1.5, quick | 6 | identical |
| dsf 1, quick | 6 | identical |

Frame cost on the rig's `--perf` (flush-inclusive, the baseline's own method, this machine, medians): working-zoom shots still 29.2 to 29.7 ms and panning 35.0 to 35.3; the finest shots' medians 27.0 to 27.2 (start-close) and 11.8 to 11.9 (coast-close). Inside the noise (about 10%): the stack adds one function call per drawn item. Canvas memory unchanged (127.3 MB offscreen, 148 MB with the canvas).

The suite, `node --test --test-concurrency=4 tests/*.test.mjs`, twice in a row: 1,246 tests (1,210 before; 36 new), 0 failed, 15 skipped as before, about 175 seconds. **No existing test file was edited.** The two that quote or walk the staged site (`finish-repair.test.mjs` F2 and `finish-site.test.mjs`) pass because `docs/ARCHITECTURE.md`'s figures were refreshed and `shading.js` makes `solids.js` reachable. New: `tests/world-lod.test.mjs`, `world-palette.test.mjs`, `world-solids.test.mjs`, `world-shadow.test.mjs`, `world-stack.test.mjs`, `world-ownership.test.mjs` and the helper `tests/helpers/recctx.mjs`.

**Flipping a layer, as an example** (the sea; the two static layers flip per owner and register per kind, section 2). T1 writes `registerLayer('sea', drawSea, 'world', seaKey)` in `sea.js`, opens a page with `?layers=sea:v2` (or `setFlag('sea', 'v2')` in a test) and shoots it with the rig; when its rows pass, the orchestrator changes the default of `sea` from `'legacy'` to `'v2'` in `stack.js` (the one-line flip), and T1 deletes `drawWater` and `SEA_STRIP` and the lines of `tests/world-fx.test.mjs` that pin the strip.

**Still the old look on purpose.** `FAR_ZOOM` is 0.42 (T5 moves it to 0.30 with the tracks' `far` drawers), the sprite budget is 22 million pixels, the ground cache is the full-window copy, the camera translation is not rounded, and the governor sees JavaScript time only: each is a T5 deliverable above, and each changes pixels or timing, so none was done in a refactor that had to change neither.

## 12. The review round: what was found, what was changed, what was not

A reviewer measured the plan against the code and the machine. Every finding was checked here before anything was changed; the evidence below is what this round measured or computed itself. Nothing visible changed: the shot rig is identical to the baseline on every shot at dsf 2, 1.5 and 1 (the commit message has the table), and the suite is green.

| id | finding | verified | what changed |
|---|---|---|---|
| B1 | the cloud spec contradicted itself: 14 to 42 puffs of radius 22 to 64 cannot cover 85% of a district; the 5.0 ms row was not derived | yes: 28 puffs of 64 cover at most 68% of the Scrap Yard (405,504 world px squared), 42 cover 27% of Farmland (1,478,656); twelve of sixteen districts sit at the cap. The reviewer's fix (a half-density bake) is wrong: a scaled blit is 3.2 ms per megapixel, 9.4 ms for the window | `cloudbank.js` (radius a share of the footprint's width, 40 to 150 puffs, 96 to 99.6% coverage on all 16 real footprints, tested), live flat fills per puff, a coarse bank at the middle zooms, a baked silhouette at far; costs measured (`cloudcost.mjs`) and the clouds row derived from the model on the real layout and held by a test (0.4, 8.7 and 15.1 ms against 1.5, 5.0 and none) |
| B2 | every module a track adds breaks `finish-repair` F2 and `finish-site` on files no track may edit; `v2/zoom` collides; `camera-input.js` is in no row; the ownership block's tracks are on adjacent lines | yes: F2 held the module count exactly; a trial merge of `v2/zoom` conflicts in `docs/ARCHITECTURE.md` and in one hunk of `world.js`'s import block, nothing else | rule 11 (shared documents are the orchestrator's); F2 tolerates growth of `js/world/` on a track branch and is exact with `PC_STRICT_DOCS=1`; `scripts/arch-figures.mjs --write`; the ownership block has one file to a line and a `later` row (`camera-input.js`, T5); the merge note in section 10 |
| B3 | the one `static` layer carries all 61 kinds with one owner and one V2 slot | yes: `registerLayer` overwrites; T3 and T4 edit the legacy drawers in place | two layers `static-bldg` (T3, the 18 kinds of `props-buildings.js`) and `static-prop` (T4, the other 43), each with its flag, over the one frame `statics.js` (T5); `registerProp(kind, def)`, `propV2`; the sprite cache keys by layer definition; `tests/world-props-groups.test.mjs` holds the building list to the module |
| B4 | `roundedBox` is a slab with a pale line (radius at most 4, faces step 8 to 12%) | yes: rendered and looked at (the reviewer's picture, then `scripts/diag/solids.mjs`) | radius 3 to 12, a fillet down the front edge, a chamfer along the top-front edges, the sun's streak, two AO bands; `faceTone` steps at least 15% top to left and left to right (it was 8 to 14%, held by a test on 50 colours); the contact sheet is T3's first gate |
| M1 | `shading.js` is T3's but imported by T4's and T5's files | yes: `solid` in four modules, `hazed` and `hazeAt` in two frozen ones | `shading.js` is frozen legacy, T5's, like `iso.js`; `tint()` moves to `veiled` with the clouds flip (T5 item 10) |
| M2 | a finite sea bitmap leaves black bands in tall windows | yes: 8,962 world px beyond the bounds at 390 x 844, 4,500 at 768 x 1024 | the sea fills the view with haze first; `--unpainted` (exit 1) and the `extent` shots (`island-map` added) |
| M3 | two measurement methods 1.8 times apart | yes: this round measured both on `adcd991` (table below) | one method: `world-budget.mjs` at the world's own density; the rig is for pictures; the sea row is 3.5 ms, derived from unit costs (`unitcost.mjs`); baseline beside ceiling in the block, checked by a test |
| M4 | the ledger cannot hold chunks of 1,024 world pixels | yes: 387 MB at 2.4 | chunks of 384 device pixels (`chunks.js`), 39.8 MB at the peak; sprite budget stated at dsf 2; the memory block summed by a test at 151.1 MB |
| M5 | animated layers (foam, dressing) sit in the cached stage | yes: the table put them in `shore` and `terrain` | the cache holds only what stands still; `livedecals` draws the foam, swash, skirts and dressing live; no `key(w)` may read `env.t` |
| M6 | interfaces tracks need were not written | yes: no ledger, releaser, slicer or chunk contract | `gfx.js` ledger, `registerReleaser`/`releaseAll`, `slice`; `chunks.js`; the chunk draw contract in section 3; `layer()` keeps `detail` (tested) |
| M7 | `--anchor` always exits 0 | yes: `process.exit(0)` | exit 0, 1 or 2; a zoom pair (`scaleScore`) and a drift pair (`driftScore`, 0.1 tile a second) added, each proved on synthetic pictures that fail them |
| m1 | crest lenses are 1.5 x 7 screen pixels at the 0.5 gate | yes by arithmetic | screen-space minimums for crests, curls and glints (5.2, T1 brief) |
| m2 | no ceiling at 0.3 to 0.7 | yes | rows for 0.129, 0.3, 0.5 and 1.8 in the block, with allocations |
| m3 | a chamfer transform and a 10 world pixel bitmap blur the shoal ring | yes by arithmetic (48 device pixels a texel at 2.4) | exact Euclidean transform; the bands are fills of the contours, crisp at every zoom |
| m4 | the layer block's `space` is the legacy's; `runLayer` repeats `setTransform` | the first yes; the second yes but immaterial | `v2space` in the table, enforced by `registerLayer`. **Not changed:** the repeated `setTransform` is five calls a frame (the sea, the clouds and the four screen passes), each a few tenths of a microsecond; tracking the current space would put state in the runner that every drawer that sets its own transform could break, for no measurable gain |

**The two methods, measured on `adcd991`** (this machine, median of 120 draws with a readback, two runs a few minutes apart agreed within 3%): the same eight scenes at the world's own density 1.5 and pinned to 2.

| scene | density 1.5 still / moving | pinned to 2 still / moving | ratio |
|---|---|---|---|
| fit 0.129 | 13.3 / 17.4 | 23.1 / 26.3 | 1.7 / 1.5 |
| 0.3 | 22.7 / 34.0 | 40.2 / 54.9 | 1.8 / 1.6 |
| 0.5 | 26.2 / 37.9 | 45.2 / 59.2 | 1.7 / 1.6 |
| coast 0.9 | 9.2 / 16.8 | 15.4 / 25.9 | 1.7 / 1.5 |
| district 1 at 1.0 | 14.8 / 25.1 | 25.2 / 38.9 | 1.7 / 1.5 |
| district 3 at 1.2, locked | 21.3 / 32.6 | 37.3 / 53.5 | 1.8 / 1.6 |
| district 1 at 1.8 | 16.0 / 19.8 | 27.1 / 32.1 | 1.7 / 1.6 |
| district 1 at 2.4 | 17.1 / 19.1 | 28.9 / 32.9 | 1.7 / 1.7 |

The first column reproduces ART_DIRECTION A.1's baseline within 5% on every scene A.1 has, so the contract ceilings stand; the second is what the reviewer's rig run read.

**Still owed, and by whom.** T1 builds the sea and the coast to the sections above and is accepted by the exit codes; T2 builds the bank on `cloudbank.js` and the grade; T3 and T4 register their kinds; T5 lowers `SPRITE_BUDGET`, builds the chunk cache, snaps the camera and moves `tint()`. Not measured here and left to those who build them: the cost of the ground chunks' leading-edge bakes during a pan (the 3.0 ms moving cell), the crossfade between the coarse and fine banks (counted as a double bank for 0.2 of a zoom octave), and the contour-extraction time of the sea (it is a `slice` job and must stay under 6 ms a slice).
