# Render plan: the layer stack and the five tracks

How the world's picture is built from here to the "Untitled Goose Game / Egg, Inc." look of `docs/ART_DIRECTION.md`, who builds which part, and the shared tools they build it with. Written at `579ce1c` (branch `v2/art-stack`, on `adcd991` plus the art direction, the render diagnosis and the shot rig), 2026-10-28. Presentation only: nothing here changes world coordinates, district geometry, hit shapes, the engine, game rules, data, balance, session, text, the object list below the map, or `pc.world`'s public API. The camera input handlers (`bindInput`, `zoomBy`) belong to `v2/zoom` and are not touched.

Three documents, three jobs. `ART_DIRECTION.md` says what it looks like (colours, shapes, numbers, acceptance). `RENDER_DIAGNOSIS.md` says why it looks wrong now (defect ids W, C, F, G, S, P) and what a frame costs. This file says how the code is arranged so five people can change the picture at once without touching each other's files: one stack of layers, one owner per file, four shared helper modules, one rule for zoom, one rule for pixels, one budget per layer.

Two blocks below are machine-checked by `tests/world-ownership.test.mjs`: the layer table (section 1) against `js/world/stack.js`, and the ownership table (section 7) against the files in `js/world/`. Change the code and the block together.

## 0. The ten rules for every track

1. **Own files only.** Edit files your track owns (section 7). A file nobody owns, or a file another track owns, is not yours; ask the orchestrator and work round it inside your own files in the meantime. A new file is yours if you add it to the ownership block in the same commit.
2. **Flags, then flip, then delete.** A layer has a LEGACY drawer (the code the world has always run) and may get a V2 drawer. You register V2 with `registerLayer`, test it behind `?layers=<id>:v2` or `setFlag`, and flip the default in `stack.js`'s table only when your acceptance rows pass (the flip is a one-line change the orchestrator merges). When every flag of your track is v2 and its tests pin the new look, delete your legacy drawers.
3. **Zero-diff while legacy.** With every flag on legacy the picture is the old one, pixel for pixel on all 27 shots of the rig. A change that is meant to be invisible is proved invisible (section 9).
4. **Hit shapes are sacred.** A V2 drawer returns the same hit polygons (`polys`, `circle`) the legacy drawer returned, from the same `LAYOUT`/`zAt`/`SCENERY` data. `tests/world-static.test.mjs` holds the scenery positions by hash; do not loosen it.
5. **Everything is a function of the world, the zoom and the clock.** No `Math.random` (use `hash`/`h2`), no wall clock, no `performance.now()` in drawing. `env.t` is the visual clock and is 0 under Calm, Off and reduced motion: a layer draws its best-looking resting pose when `env.t === 0`, and nothing it does moves, fades or flickers then.
6. **Colours come from `palette.js`.** A colour in world drawing is a token of `palette.js`, or a `mix`/`shade`/`faceTone`/`veiled` of tokens. The retired colours (`#121826`, `rgb(8,10,20)`, olive `#4b7a4e`, slate `#2f3644`, sea `#1b3b5c`) appear nowhere in V2 code.
7. **No hairlines.** Nothing is stroked thinner than `minLine(zoom)` (1.5 world pixels, never under 1.25 screen pixels); form is made of filled shapes, value steps and bands.
8. **Detail is additive and fades.** Read the zoom only through `lodOf` (`env.lod`); draw the base complete, add marks with `env.lod.detail[i]` as their alpha. No threshold of your own, no pop.
9. **Budget is a contract.** Section 6 gives each layer its milliseconds and megabytes. Over budget is a failed track, however good it looks. The quality governor must still step down and recover.
10. **Tests that pin the old look change only to pin the new intent**, and the commit message says which and why. New pure functions come with tests.

## 1. The target pipeline: one stack of layers

The frame is drawn in this order. A layer's SPACE says what transform the engine has set when it is called (`screen`: css pixels of the window; `world`: the camera transform, so the layer pans and zooms with the island; `inherit`: whatever the caller set). A layer's STAGE says where it sits: `sea` (under everything), `ground` (the terrain group, drawn into the ground cache while the camera is still), `things` (the depth-sorted list), `air` (over the things, in the world) or `screen` (the passes over the finished world).

```
 sea         world-space water, haze to the horizon, island shadow         live       T1   (legacy: a screen-space strip)
 shore       coast ribbon, beach bands, foam, cliff faces                  ground     T1
 terrain     the lit colour field, patches, paths, dressing                ground     T1
 roads       roads, kerbs, bridges, the ferry quay, buoys                  ground     T1
 blocks      district plateaus, their decals and crosswalks                ground     T1
 livedecals  decals that move (water, pulses), over the cached ground      live       T1
 things      depth-sorted, back to front:                                  per item
               static   props and buildings (props-*.js through statics.js)   T3 buildings, T4 the rest
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

Layers in parentheses are the engine's, not flagged. The twenty flagged layers are the rows of the machine-checked block:

<!-- render-layers -->
```json
[
  { "id": "sea", "owner": "T1", "space": "screen", "stage": "sea" },
  { "id": "shore", "owner": "T1", "space": "inherit", "stage": "ground" },
  { "id": "terrain", "owner": "T1", "space": "inherit", "stage": "ground" },
  { "id": "roads", "owner": "T1", "space": "inherit", "stage": "ground" },
  { "id": "blocks", "owner": "T1", "space": "inherit", "stage": "ground" },
  { "id": "livedecals", "owner": "T1", "space": "inherit", "stage": "ground" },
  { "id": "static", "owner": "T5", "space": "inherit", "stage": "things" },
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

**The ground group and its cache.** `shore`, `terrain`, `roads` and `blocks` are drawn under the world transform into `groundcache.js`'s offscreen copy once the camera has stood still for a frame; every later frame is one `drawImage`. `livedecals` is drawn live over the copy. The copy is drawn again when the camera, the size, the density, the unlocked districts or `groundKey(w)` change. `groundKey` folds the `key(w)` of every V2 ground layer: a function returning a number that changes whenever the layer's picture for a still camera changes (a palette step, a swash phase that is baked, an opened gate). A ground layer with no key depends on nothing but the camera and the unlocked districts. Anything that animates belongs in `sea`, `livedecals` or a `things` layer, not in the copy. The sea and the foam are live: they are drawn every frame, so the cache never holds a wave.

**Why layers are mixed into the World.** Each legacy drawer is a method that has always lived on `World`, now defined in its owner's module and mixed into `World.prototype` at the foot of `world.js` (`Object.assign(World.prototype, seaMethods, ...)`). The code was moved, not rewritten, so `w.drawWater`, `w.drawFog`, `w.drawGround` and the other names the tests call still exist. A V2 drawer is a plain function and does not need `this`.

## 2. The layer interface

```js
registerLayer(id, draw, space = 'world', key)   // draw(ctx, view, env, w, a); key(w) => number, ground layers only
setFlag(id, 'legacy' | 'v2')                    // or ?layers=sea:v2,clouds:v2 in the address while developing
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

**Veil.** A district under cloud reaches a V2 drawer as `env.dim` (legacy: 0 to 0.5). Convert with `k = env.dim / FOG_DIM` (`common.js`) and colour with `veiled(c, k)`; never `fogged`, which darkens.

**Adding a layer.** A new layer is a row in `LAYERS` (the orchestrator merges it), a section here and a row in the block above. Prefer a new drawer inside an existing layer.

## 3. Shared helpers, first versions written and tested

These four modules (plus the tests' `recctx`) are the tools every track uses. Their signatures are the contract; behaviour may be deepened by the owner, signatures change only through this plan.

| module | owner | signatures |
|---|---|---|
| `palette.js` | T2 | tokens `SKY SEA SAND GRASS BLOOM SOIL ROCK ROCKHI ROAD PAVE WOOD BRICK PLASTER TILE METAL GLASS TOY INK LIGHT CLOUD GRADE`, tables `DISTRICT_DAY CRATE_TAGS PEOPLE`; `groundSet(theme)`, `crateColor(tag)`, `personLook(hash)`; `faceTone(c) -> {t, l, r}` (frozen, memoised; replaces `tone`); `veiled(c, k)` (replaces `fogged`); `seaRamp(d_tiles)`; `skyOf(sunHour)`, `phaseOf`, `tintFor(night, dusk, crunch)`, `gradeFor(sunHour, crunch, out)`, `sunHourOf` |
| `solids.js` | T3 | `bevelRadius(w, d)`, `minLine(zoom)`, `roundedPoly(ctx, pts, r)`, `roundedBox(ctx, gx, gy, w, d, h, c, o) -> {left, right, top, r}` (the faces `box()` returns, so hit shapes and window grids do not change), `capsule(ctx, x0, y0, x1, y1, r, fill)`, `puff(ctx, x, y, r, body, hi, shade)`, `outlineOf(...)` |
| `shadow.js` | T2 | `shadowLength(night, dusk)`, `shadowReach(h, night, dusk)`, `stampSoft(ctx, x, y, rx, ry, a, color)`, `contactShadow(ctx, x, y, rx, ry)`, `castShadow(ctx, gx, gy, w, d, h, {night, dusk}, z)`, `releaseShadows()`; one cached sprite per colour, flat fallback without `OffscreenCanvas` |
| `lod.js` | T5 | `lodOf(zoom, out) -> {zoom, band, index, blend, level, nominal, nominalIndex, detail[4]}`, `detailAlpha(zoom, t)`, `bandIndex`, `BANDS`, `BAND_AT`, `FADE`, `DETAIL_MIN` |
| `tests/helpers/recctx.mjs` | T5 | `recCtx() -> {ctx, log, state}` records calls, stroke widths, fills, rects, clips, balance; `thinnestStroke(log)`, `callNames(log)` |

How to use them. A building: `roundedBox` for the body (it paints the three faces in the face model inside a rounded outline, with the sun-side rim, a lit front corner and a base AO band, and returns the faces), `castShadow` before it and `contactShadow` at its foot, colours from `PLASTER`/`TILE`/`GLASS`. A tree: `contactShadow`, a tapered `capsule` trunk, `puff`s back to front. A cloud: `puff` in `CLOUD` colours. A wave crest: `SEA.crest` at 0.55 in a lens (T1 writes the lens helper in `sea.js`). A shadow colour is `LIGHT.shadow`, never a black or an ink.

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

**Ground cache supersampling.** At rest the cache is the full-window copy at the canvas density, as today. Where the density is under 1.5 the copy is baked at 2x and drawn down with smoothing (a quarter of the cost of an extra layer at dsf 1, since the canvas is small there): smooth coast edges and no cracks at dsf 1 and 1.25. While the camera pans (zoom constant) T5 serves the ground from world-space chunks (1,024 world pixels square, baked at the current exact scale with a 1 device pixel bleed on every side, keyed by zoom, chunk and `groundKey`) so a pan is blits and not a redraw of 2,400 tiles (DIAGNOSIS C7: 12 to 16 ms now). While the zoom changes, stale chunks of the nearest scale are shown scaled by at most 1.19x and the exact scale is baked on rest (within 150 ms); the picture never shows a scaled chunk at rest. Chunk and copy pixels are counted in the one pixel ledger (section 6).

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

Method (the contract, from ART_DIRECTION A.1): headless Chrome, `--disable-gpu`, 1440 x 900 at device scale 2, a real game at day 0, `pc.world` as the handle, a one-pixel readback after every `draw()` so the raster is counted, the median of 120 draws, "still" = a fixed camera, "moving" = `cam.x += 0.7` before every draw. `node scripts/world-shots.mjs --perf` measures the rig's scenes; `scripts/diag/stages.mjs sw 2 0|60` splits a frame by layer. Judge against a baseline measured in the same session (noise is about 10%).

**Ceilings** (1.25 x the baseline at `adcd991`): the working zoom must stay at or under 12.1 ms still and 21.5 moving at 0.9 on the coast of district 1; 18.1 and 30.9 at 1.0 in district 1; 26.1 and 40.3 at 1.2 in district 3 (locked). The finest zoom (2.4) never exceeds 24 ms, still or moving. A pinch stays under 48 ms (Day 1) and 28 ms (Day 60). Offscreen pixels never exceed 160 MB at dsf 2.

**Allocation by layer**, milliseconds of a frame, at the three scenes that bind (a sum under the ceiling leaves the margin for noise):

| layer | owner | 0.9 coast, d1 still / moving | 1.2 d3 locked still / moving | 2.4 finest still / moving |
|---|---|---|---|---|
| sea + shore (live) | T1 | 2.0 / 2.6 | 2.0 / 2.6 | 1.5 / 1.8 |
| ground (cache blit, chunk blits) | T1 + T5 | 1.0 / 7.0 | 1.0 / 8.0 | 1.5 / 4.5 |
| livedecals | T1 | 0.1 / 0.2 | 0.1 / 0.2 | 0.1 / 0.2 |
| static props and shadows | T3 + T4 | 2.6 / 2.8 | 3.2 / 3.4 | 5.0 / 5.2 |
| plots, pipes, people, crates, traffic | T3 + T4 | 0.6 / 0.6 | 0.8 / 0.9 | 3.5 / 3.6 |
| clouds | T2 | 1.5 / 1.8 | 5.0 / 5.5 | 2.0 / 2.2 |
| grade | T2 | 1.2 / 1.2 | 1.2 / 1.2 | 1.2 / 1.2 |
| field, overlay, particles | T2 + T5 | 0.8 / 0.8 | 1.0 / 1.0 | 1.0 / 1.0 |
| engine (cull, sort, hits) | T5 | 0.6 / 0.8 | 0.8 / 1.0 | 1.0 / 1.2 |
| **total** | | **10.4 / 17.8** (ceiling 12.1 / 21.5) | **15.1 / 23.8** (26.1 / 40.3) | **16.8 / 20.9** (24 / 24) |

Baseline for orientation (DIAGNOSIS section 3, Day 1, z 0.9): water 1.9, ground blit 1.1 (moving 15.4 uncached), props 2.4, fog 16.4 (the single dearest layer), grade 1.1. The fog's 16 ms is what pays for everything new in a locked scene; in an open scene (Day 60: 9.3 ms ceiling at 0.9) there is no fog and the sum above, 8.9, is tight: sea, ground and props must not grow.

**Memory** (MB of canvas pixels at dsf 2; one ledger in `gfx.js`, T5, into which every cache registers its pixels):

| holder | MB | owner |
|---|---|---|
| main canvas | 21 | T5 |
| ground cache or chunks | 21 | T5 (content T1) |
| light layers (`day`, `mix`; `night`, `shafts` transient) | 42 | T2 (one of the two full-size layers goes to half size) |
| sprites and overlays (`SPRITE_BUDGET` 22 million to 12 million pixels at dpr 1, overlays included) | 48 | T5 budget, T3 + T4 content |
| sea depth bitmap (one, world space, built in slices) | 4.3 | T1 |
| wave path chunks, foam and tuft caches | 2 | T1 |
| cloud sprite sheet | 3 | T2 |
| labels | 6 | T5 |
| shadow stamps | 0.5 | T2 |
| **total** | **147.8** (limit 160) | |

`World.release()` and `detach()` give every holder back. With no `OffscreenCanvas` (the Node tests) every layer draws direct, as today.

## 7. Who owns which file

One owner per file. T5 owns the engine and the frozen foundations; the four art tracks each own a disjoint set of modules. Shared tokens live in modules with one owner (`palette.js` T2, `solids.js` T3, `shadow.js` T2, `lod.js` T5): the others import and never edit them. If a track needs a token or a helper it does not own, it writes the local variant in its own module from existing tokens (`mix`, `shade`, `faceTone`) and asks for the addition; when a helper is promoted, the owner moves it.

| track | scope | files (all in `js/world/` unless a path is given) |
|---|---|---|
| **T1** terrain, coast and water | the sea, the shaped coast, beach, cliffs, foam, terrain colour field and dressing, roads, bridges, ferry, ground decals, district ground colours | `sea.js` `coast.js` `terrain.js` `roads.js` `decals.js` `ground.js`; `layout.js` (colour derivations `cols`, `tcol`, and the land colour field only: the geometry, `land`, `ZV`, `zAt`, hit data are frozen); `island.js` (`REGIONS` tints only) |
| **T2** atmosphere | clouds replacing the fog, the grade and time of day, cast shadow rules, light shafts, vignette, sky haze, far-zoom aerial perspective, weather and particles; the palette | `clouds.js` `atmos.js` `lighting.js` `fx.js` `palette.js` `shadow.js` |
| **T3** buildings | building bodies, roofs, windows, awnings, signs, per-theme styling, plots and pipelines, district kits' colours and parameters | `props-buildings.js` `ents-plots.js` `kits.js` (colours and style parameters only; footprints and placement are frozen) `shading.js` `solids.js` |
| **T4** props, nature and characters | crates and lot items, barrels, lamps, benches, fences, flags and signs, gates, vehicles, trees, bushes, flowers, rocks, the crane and industrial props, buyers and the player, micro-props | `props-street.js` `props-nature.js` `props-actors.js` `ents-actors.js` `ents-stock.js`; new: `figures.js` (the doll, faces, accessories, noticing) |
| **T5** raster quality | the engine, the layer stack, sprites and overlays, the ground cache and chunks, snapping, supersampling, seams, the governor, memory, labels, the map; the rig | `world.js` `stack.js` `lod.js` `common.js` `groundcache.js` `statics.js` `overlay.js` `mapmode.js` `sprites.js` `gfx.js` `labels.js`; frozen legacy: `iso.js` `props.js` `props-common.js`; `tests/helpers/*`, `scripts/*` |

Why the splits fall where they do. `kits.js` is T3's because it names the buildings; the hairline decals in it are T1's concern but T1 fixes them by **interpretation** in `decals.js` (clamp every band to 0.12 tile, turn `grid` into pavers), not by editing `kits.js`. `layout.js`'s `kit.ground` call for the scrap yard dies when T1 reads the ground from `palette.groundSet`; T1 ignores it, T3 deletes it when convenient. `props-common.js` and `iso.js` are legacy helpers (`tone`, `box`, `person`, `tree`, `lamp`, `fogged`, the `layer()` registry, `sign`): T5 keeps them working, tracks write their V2 versions in their own modules (`solids.js`, `figures.js`) and migrate their drawers; when no drawer imports a legacy helper, T5 deletes it. The DRAW table is one object that the four `props-*.js` files add to; the `layer()` registry is in `props-common.js`.

<!-- render-owners -->
```json
{
  "T1": ["sea.js", "coast.js", "terrain.js", "roads.js", "decals.js", "ground.js", "layout.js", "island.js"],
  "T2": ["clouds.js", "atmos.js", "lighting.js", "fx.js", "palette.js", "shadow.js"],
  "T3": ["props-buildings.js", "ents-plots.js", "kits.js", "shading.js", "solids.js"],
  "T4": ["props-street.js", "props-nature.js", "props-actors.js", "ents-actors.js", "ents-stock.js"],
  "T5": ["world.js", "stack.js", "lod.js", "common.js", "groundcache.js", "statics.js", "overlay.js", "mapmode.js", "sprites.js", "gfx.js", "labels.js", "iso.js", "props.js", "props-common.js"]
}
```

**Tests** follow their module: T1 `tests/world-sea|coast|terrain.test.mjs`; T2 `world-palette|shadow|clouds.test.mjs`; T3 `world-solids|buildings.test.mjs`; T4 `world-props|figures.test.mjs`; T5 `world-lod|stack|ownership.test.mjs`, the governor and sprites tests. The existing `world.test.mjs`, `world-fx.test.mjs`, `world-static.test.mjs` and `art-direction.test.mjs` are T5's to keep green; the track that flips a layer updates exactly the lines that pin that layer's old look.

## 8. Track briefs

Each brief: what to build (in order of what the author complained about first), what it must hand over, what it needs from the others, how it is judged. The look, colours and numbers are `ART_DIRECTION.md`; section numbers below are its.

### T1. Terrain, coast and water

Layers `sea`, `shore`, `terrain`, `roads`, `blocks`, `livedecals`. The author's first complaint is the sea, and the sea is yours.

1. **The sea is a world-space surface** (5.1 to 5.3, 5.10, 5.11, DIAGNOSIS W1 to W3). V2 `sea` is `world` space, drawn under the camera transform before the ground. Colour is a function of the distance to the nearest shore: rasterise the land silhouette (tiles at their heights plus cliff walls to the waterline) into a 1/10 mask, two-pass chamfer distance with y doubled, paint `seaRamp(d)` into one world-space bitmap covering `LAYOUT.bounds` plus 1,400 world pixels (4.3 MB, built lazily in slices, a flat `SEA.sea` fill until ready), one `drawImage`. Twelve wave levels from marching squares on the same field, Chaikin-smoothed, as `Path2D` chunks; crests, curls, glints, rings, sheen and caustics as hashed world-space motifs; haze to `SKY.horizon` beyond the bounds. Lakes, rivers and the harbor basin are in the silhouette, so they get the same water; the `water` decal and the ferry route are restyled (4.5). **Acceptance is mechanical**: the same scene at two camera positions a few hundred pixels apart differs by exactly the camera displacement (`node scripts/world-metrics.mjs DIR --anchor` on the rig's `pan` set, and `scripts/diag/anchor.mjs`, both exit 0), with `env.t` frozen; with motion on a crest moves by the camera shift plus at most the drift (0.1 tile per second).
2. **A shaped, smooth coast** (5.4 to 5.6, C1, C2): marching squares on the land field with the roads, footpaths, bridge ends, blocks, pads and prop footprints held as land, smoothed twice, never more than 12 world pixels from the tile coast. The foam ribbon (scalloped, breathing 0.35 tile over 6.5 s, phase travelling along the beach), wet sand, a scalloped boundary to meadow, shells and driftwood at near, cliff faces with strata, a grass lip and a foam skirt, walls that end at the waterline (not 34 pixels under it).
3. **The land is a place** (5.8, C3 to C6): `terrainColour(i, j)` per vertex (height biome, slope light from the upper left, district ground blended over 8 tiles), bilinear fill with 2 x 2 and 4 x 4 sub-quads at near and close, 0.6 pixel overdraw, soft patches, worn paths, plateau rims, dressing capped at 1,500 marks and skipped while the camera moves. The stride-1/2/4/8 re-meshing and its pops go: detail changes by `env.lod`, not by re-meshing.
4. **Roads, bridges, decals** (4.5): kerbed ribbons with rounded joins, painted dashes, zebra bars, plank bridges with ball-capped rails and foam collars, a buoyed ferry route, decals as bands and pavers (every band at least 0.12 tile; no `grid` hairline lattices).
5. **District ground** from `palette.groundSet(theme)` in `layout.js` (2.4): bright, hue-faithful, with the block as a raised stage and a soft contact shadow.

Hands over `key(w)` for ground layers that bake time of day; the water's colours read `w.night`/`w.dusk` and the palette's `SEA`/`SKY`, and the grade (T2) multiplies the finished frame. Needs T5's chunk cache (`GroundChunks`, section 5) for panning; until then the V2 ground draws into the existing copy. Judged by 10.1's Sea, Coast and foam, Beach, Cliffs, Land, Roads rows and the gates `coast-1.0`, `sea-0.5`, `fit`; cracks 0 (`scripts/diag/seams.mjs`); budget rows "sea + shore", "ground", "livedecals"; memory 4.3 + 2 MB.

### T2. Atmosphere

Layers `clouds`, `grade`, `weather`, `field`, `particles`; owns the palette and the shadow rule. The fog is "singular patches of blurred dots"; it goes.

1. **Cloud banks** (6, F1 to F4): a pure `bankPuffs(district)` (new `cloudbank.js` if it needs a file: add it to the table) giving 14 to 42 puffs in three rows, covering at least 85% of the footprint as one connected mass with every puff overlapping two others by 35% of its radius, a flat belly-coloured base, lit tops (`CLOUD`), ground shadows towards +gx, ghosts of the district under it (rows at 0.90, 0.82, 0.78, the district seen through `veiled`), tall things standing out of the dome, a floating padlock, one or two small windows near the gate. Bob, swell and a slow slide in place (no puff travels or ends); the unlock dissolve in 2.6 s (REVEAL_MS) from the gate outward with a flash ring, lifting puffs and sparkles, a 400 ms cross-fade under reduced motion. Far zoom: one pre-rendered bank sprite per district; mid: puffs as blits from a 6-size sheet (3 MB); near and close: mist rim, windows, sparkle motes, fraying puffs. Never a dark wash, never a pool: DIAGNOSIS F1 to F3 are the faults to prove gone.
2. **Veil, not dim**: `veiled(c, k)` replaces `fogged` for everything under cloud; the ground and props (T1, T3, T4) call it with `k = env.dim / FOG_DIM`. A locked district is never darker than an open one.
3. **The grade** (2.7, G1 to G4): bright by default (plain white from sun hour 07:00 to 16:59), gold evening, periwinkle night with mean luma at least 0.34, no navy vignette, no pale edge falloff, no `bakeAir` foot; `tintFor`/`gradeFor` from the palette replace `lighting.js`'s `NIGHT`/`GOLD`/`RAIN`. Keep the rate limit (WCAG 2.3.1) and the one-full-layer-a-frame scheduling; replace the held 30% night at speeds of 16 and over by holding the hour (G2). The 168-second day (G3) is the author's to change in `config.js` (not ours); a brighter night is ours.
4. **Light and shadow**: the shadow rule and stamps in `shadow.js`, god-ray shafts at dawn and dusk, lamp pools in `#ffe9a8`, window glow, the 0.34 night-luma floor held by a test.
5. **Weather and particles** (`fx.js`): rain at least 1.5 px, round confetti and dust (no `fillRect` motes), round-and-pastel particles, rings as soft double rings.

Needs from T1/T3/T4: they call `castShadow`/`contactShadow` and `veiled`. Hands over `palette.js` as the colour authority. Judged by 10.1's Fog and clouds, Lighting and grade, Motion rows and the gates `locked-0.9`, `locked-0.5`, `fit`; the squint, greyscale and five-second tests (10.3); budget rows "clouds" (5.0 ms for four banks in view, against 16.4 now), "grade", "field, overlay, particles"; memory 42 + 3 + 0.5 MB.

### T3. Buildings

Layers `plot`, `pipe` and the building kinds of `static`. Chunky, bevelled, pastel, friendly.

1. Adopt `roundedBox` for every body (corner radius `bevelRadius`, top bevel, sun-side rim band, base AO, the face model) and the recipes of 3.2: rounded-rim roofs with eaves (flat, gable, hip, saw, pediment), framed windows with a reflection band and sill plate, arched doors, scalloped awnings, plank signs with raised letters, chimneys, downspouts, plinth bands; no hairline anywhere (3.3). Walls: plaster, brick, boards, glass, metal.
2. The landmarks of 4.2, each with its signature (`bldg`, `hall`, `exchange` with the turning globe, `rack`, `shack`, `depot` with its tariff overlay recoloured, `tower`, `ipo` with the golden bell, `office`, `bank`, `manor`, `barn`, `factory`, `stall`, `kiosk`, `podium`, `rentrow`, `shop`) and the pipeline buildings and plots (`pipe`, `plot`): height still equals the level, the tier readable from the silhouette.
3. Per-theme styling from `palette.groundSet`/`DISTRICT_DAY` accents and the roof table; `kits.js` loses its dark hexes and takes the ramps (parameters and colours only: every footprint, slot and hit shape stays, held by `tests/world-static.test.mjs`).
4. **Base + overlays** (section 4): the base sprite is the complete building; `detail: [{band:'near'}, {band:'close'}]` add framed windows and curtains, then shingles, bricks, plank joints, door numbers, window boxes. Live parts (smoke, blink, window glow, the globe) stay live and cheap.
5. `shading.js` is yours: its `solid` is replaced by `roundedBox` call by call, `HAZE` moves to `palette.SKY.horizon` mixes.

Needs T2 for `castShadow`/`contactShadow`/`veiled`, T5 for sprite overlays (until then the base stands alone). Judged by 10.1's Houses and shops, Towers and landmarks, Industrial and harbor (the buildings), the `finest-2.4` and `locked-0.9` gates (towers standing out of cloud); budget row "static props and shadows" shared with T4 (the sprites are cached: build cost is in the sprite ledger, not the frame); sprite memory share.

### T4. Props, nature and characters

Layers `lead`, `lot`, `asset`, `truck`, `car`, `player` and the non-building kinds of `static`. Everything small, fat and rounded; people with faces.

1. **Crates and lots** (4.1, 4.4): the rounded cube (0.72 tile) with three plank slats and brackets, stencil at near, the pallet; `crateColor(tag)` replaces `TAG_COLOR`; auction lots with rope and bell, a broken crate with tape, a peeker toy on top at close.
2. **Street and yard** (4.1): `gate` (barrier, raised bridge leaf, ferry with the "NOT RUNNING" plank), `lookout`, `board`, `scrap`, `tires`, `barrel` (the burning one), `fence` (3.5 pixel pickets with caps), `lamp`, `neonlamp`, `bench`, `flag`, `lantern`, `neonpole`, `polesign`, `bollard`, `billboard`, `ticker`, `spot`, `statue`, `forsale`, `fountain`, `helipad`; contact shadows under everything.
3. **Nature**: trees as puffs on a tapered trunk (5 greens, 3 sizes, species by district), bushes, hedges, planters, topiary, hay, flowers, tufts, rocks, reeds; sway live and cheap.
4. **Machines and vehicles**: the crane (cab, striped jib, swinging magnet), gantry, ship with portholes and a wake, tank, silo, stack with round puffs, dome, dish, windmill, cart, car rows, containers, the freight truck and the traffic.
5. **Characters** (3.1, 7.5, `figures.js`): the doll (capsules; head, torso, legs), faces at near and close (two dot eyes, cheeks), hair and hats by role, clothes by `personLook`, idle bob and blink, a hop when a buyer notices the player, the unique tomato-red player with a beanie pin; a pill at far zoom. Wait, walk, leave. All motion stops under Calm, Off and reduced motion with open eyes.
6. **Micro-props** (7.4): a hashed `micro.js` (add it to the table) placing at most 60 per district in view at near and close, never on roads, pads or props.

Needs T2 for shadows, T3's `solids.js` (`capsule`, `puff`), T5 for overlays. Judged by 10.1's Trees and plants, Characters, Crates, Street furniture, Gates, Industrial and harbor (the props), Motion rows and the `finest-2.4` gate; budget rows "static props", "plots, pipes, people, crates, traffic".

### T5. Raster quality

The engine, the stack and the pixels; the track that makes the others' work sharp, cheap and safe. Its first four deliverables unblock the others, so they come first.

1. **Sprite overlays** (section 4): `layer.detail` bands built and blitted with `env.lod.detail[i]`; the sprite budget from 22 million pixels (at dpr 1) to 12 million with overlays counted; the pixel ledger in `gfx.js` that every cache registers into; LRU evicting overlays before bases.
2. **Camera snapping** (section 5): `toWorld` rounds the translation; the cache key carries it; sprites, labels and the ground share one phase (S5).
3. **Ground chunks** (`groundcache.js`): world-space chunks at the exact scale, a bleed, supersampling under density 1.5, stale scaled chunks while the zoom moves and an exact bake on rest, keyed by `groundKey`; the pan costs blits (C7).
4. **Governor**: the `requestAnimationFrame` interval as a second signal, the 30 fps cap only for a still camera, the tier table of section 5, a test that feeds slow costs then fast and checks `slow` rises then falls (P1, P4).
5. **Zoom**: crossfade stale to exact sprites on a pinch, the `lodOf`-driven `far` mapping (`FAR_ZOOM` 0.42 to 0.30, with T1/T3/T4 flipping their `far` drawers), no rebuild spike on the first frame of a zoom (S6).
6. **Seams and edges**: the silhouette-first helper for sprites, tile overdraw with T1, the crack metric at 0 (S1, C5).
7. **Memory**: `release()`/`detach()` return every holder; the ledger asserts the 160 MB ceiling in a test (P2).
8. **Retirement**: when a track's flags are v2, delete the legacy drawer, its adapter and its test lines; when no drawer imports `iso.js`'s legacy primitives or `props-common.js`'s helpers, delete them.
9. **The rig**: keep `scripts/world-shots.mjs`, `world-ab.mjs`, `world-metrics.mjs` working; add `scripts/world-budget.mjs`, a flush-inclusive gate on the section 6 scenes that fails over a ceiling, so the budget is a command and not an opinion.

Judged by: zero-diff for every no-op change, the budget script, the seams and anchor scripts, memory, the governor test.

## 9. How to check your work

Serve your worktree on your own port and run the rig; each Chrome needs its own debugging port and profile; stop what you started by PID.

```
PORT=85xx node server/static.mjs &                                    # note the PID
node scripts/world-shots.mjs --base http://localhost:85xx --out DIR --cdp 95xx [--set quick|pan|tod] [--dsf 2] [--perf]
node scripts/world-metrics.mjs BEFORE_DIR --diff AFTER_DIR            # visible difference per shot: meanAbs, share, identical
node scripts/world-metrics.mjs DIR --anchor                           # did the water move with the camera? (the pan pair)
node scripts/world-ab.mjs BEFORE_DIR AFTER_DIR OUT_DIR                # side-by-side pictures and a contact sheet
node scripts/diag/seams.mjs | anchor.mjs | stages.mjs sw 2 0|60      # cracks, anchoring, per-layer cost
?layers=sea:v2,clouds:v2                                              # in the page address: choose V2 drawers while developing
```

`/private/tmp/claude-501/-Users-stronghold--claude-spares-spare-hn5fMv/5bfad21d-b9ff-4652-a42a-d112d044bff1/scratchpad/art-baseline/` holds the rig's 27 shots, their manifest and perf at `adcd991` (dsf 1 and 1.5 quick sets in subfolders); two runs of one build give identical pixels (`determinism-diff.json`), so any difference is the change. A no-op change is accepted at `identical: true` on every shot, at dsf 2, 1.5 and 1; an art change is accepted by its rows in section 10.1 of the art direction and its budget rows here. Run the whole suite (`node --test --test-concurrency=4 tests/*.test.mjs`) before every commit: it passes with 15 skipped and takes about 140 seconds.

## 10. Order of work and merging

Tracks branch from the tip of `v2/art-stack` (after this plan and the refactor), work in their own worktree, and merge in any order: the file sets are disjoint, the shared modules are frozen, and every flag starts as legacy, so a track's merge changes nothing until it flips. The orchestrator merges flips one layer at a time, each with its rig diff and budget numbers. T5's first four deliverables should land before T3 and T4 depend on overlays; T3 and T4 meanwhile build the base complete. Cross-track requests go through the orchestrator in the track's report; do not edit round a freeze.


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

**What was added.** `stack.js` (the layer table, the flags, `registerLayer`, `setFlag`, `setFlags`, `runLayer`, `groundKey`; `?layers=` is read in the address), `lod.js`, `palette.js`, `solids.js`, `shadow.js`; `World.toWorld`, `toScreen` and `safeLayer`; `env.lod` (set every frame from one reused record); `releaseShadows()` in `World.release`; `groundKey` as the eighth slot of the ground cache's key (0 while every layer is legacy, so nothing is redrawn that was not); `shading.js` re-exports `roundedBox` and `bevelRadius` so the module is part of the staged site's graph from now (T3 imports it directly when it begins). `docs/ARCHITECTURE.md` quotes the new module count and sizes (83 modules, 96 requests, 574 KB gzipped; `tests/finish-repair.test.mjs` holds them).

**The proof.** The shot rig (`scripts/world-shots.mjs`, the settings that made the baseline) against the baseline at `adcd991` (`art-baseline/`):

| set | shots | result |
|---|---|---|
| dsf 2, all | 27 (every scene, four hours of day, the pan and zoom pairs, the opened district) | identical on every shot: `meanAbs` 0, `share` 0, the same pixel hash in the manifests; no console error, none unstable |
| dsf 1.5, quick | 6 | identical |
| dsf 1, quick | 6 | identical |

Frame cost on the rig's `--perf` (flush-inclusive, the baseline's own method, this machine, medians): working-zoom shots still 29.2 to 29.7 ms and panning 35.0 to 35.3; the finest shots' medians 27.0 to 27.2 (start-close) and 11.8 to 11.9 (coast-close). Inside the noise (about 10%): the stack adds one function call per drawn item. Canvas memory unchanged (127.3 MB offscreen, 148 MB with the canvas).

The suite, `node --test --test-concurrency=4 tests/*.test.mjs`, twice in a row: 1,246 tests (1,210 before; 36 new), 0 failed, 15 skipped as before, about 175 seconds. **No existing test file was edited.** The two that quote or walk the staged site (`finish-repair.test.mjs` F2 and `finish-site.test.mjs`) pass because `docs/ARCHITECTURE.md`'s figures were refreshed and `shading.js` makes `solids.js` reachable. New: `tests/world-lod.test.mjs`, `world-palette.test.mjs`, `world-solids.test.mjs`, `world-shadow.test.mjs`, `world-stack.test.mjs`, `world-ownership.test.mjs` and the helper `tests/helpers/recctx.mjs`.

**Flipping a layer, as an example.** T1 writes `registerLayer('sea', drawSea, 'world', seaKey)` in `sea.js`, opens a page with `?layers=sea:v2` (or `setFlag('sea', 'v2')` in a test) and shoots it with the rig; when its rows pass, the orchestrator changes the default of `sea` from `'legacy'` to `'v2'` in `stack.js` (the one-line flip), and T1 deletes `drawWater` and `SEA_STRIP` and the lines of `tests/world-fx.test.mjs` that pin the strip.

**Still the old look on purpose.** `FAR_ZOOM` is 0.42 (T5 moves it to 0.30 with the tracks' `far` drawers), the sprite budget is 22 million pixels, the ground cache is the full-window copy, the camera translation is not rounded, and the governor sees JavaScript time only: each is a T5 deliverable above, and each changes pixels or timing, so none was done in a refactor that had to change neither.
