# Render diagnosis: why the world looks the way it does

Written at adcd991 (branch `v2/art-diagnosis`). Nothing in `js/` was changed: this is measurement and root cause only, so the art plan can be built on numbers. Every figure below was measured on the real app in headless Chrome 156 on the 16 GB Mac, 1440 x 900 css px; the scripts that produced them are in `scripts/diag/` and are named in each row.

The author's complaints, in their words, and where each is answered:

| the author said | answered by |
|---|---|
| "the ocean is blue with squiggly lines in it, and appears static behind the map when it moves" | W1, W2, W3 |
| "the adjunct water texture not having any effort or consistency with the rest of the map" | W2, W3, C2 |
| "the texture glitches within the actual map on its edges" | C1, C2, C4, C5, C6 |
| "... and throughout each independent element" | S1, S5, S6, S7 |
| "the overall low-quality of all graphical elements" | S2, S3, S4, P5 |
| "the fog ... is just singular patches of blurred dots" | F1, F2, F3, F4 |
| "it reads like permanent dusk" (the orchestrator's reading of the captures) | G1, G2, G3, G4 |
| "at the finest quality, it still leaves much to be desired" | S2, S3, S4, S8 |

## 0. How this was measured, and one thing that colours every picture

**Two Chrome modes.** `software` is `scripts/cdp.mjs`'s own launch (`--disable-gpu`): the baseline `scripts/perf.mjs` uses, and the mode the orchestrator's evidence images came from. `gpu` leaves the GPU on, as a real Mac browser does. They draw differently (P5): in `software`, `softwareRaster()` (`gfx.js`) is true, so `World.targetDpr()` caps the canvas at 1.5 and the compositor stretches it 1.33 x to a dsf 2 screen; in `gpu` the canvas is 2 x. Pictures and counts below are `gpu` (density as the author's screen most likely has it) unless a row says `software`; timings are `software` with a one-pixel readback after each stage, because without it the canvas only records and the cost shows up later (see P1 and P3).

**Two game states.** `Day 1`: a new game, hour 1.1, one district open, fifteen under fog. `Day 60`: the same after `tests/bot.mjs` played 60 days (`scripts/boot.mjs`), a handful open.

**Camera places** (world px, `SCEN` in `scripts/diag/lib.mjs`): `coast` (-3644, 2213) is the starting district's west coast; `sea` (710.66, 2587) the open bay in the middle; `lockedA` (-800, 3154) district 3; `finest` (-2684, 2133) the stash yard with crates and buyers; `fit` (710.66, 2467.4) the whole island. Zooms 0.13 (the fit), 0.3, 0.5, 0.9, 1.4, 2.4; densities 1, 1.25, 1.5, 2. A picture is "dsf 2, z 0.9, coast" means that.

**Where the pictures are.** `CROPS` = `/private/tmp/claude-501/-Users-stronghold--claude-spares-spare-hn5fMv/5bfad21d-b9ff-4652-a42a-d112d044bff1/scratchpad/art-diag/crops/`. They are the world canvas alone (no HTML), at device pixels, magnified where the name says (`-x3` is 3 x, nearest neighbour). Not committed (binary); `node scripts/diag/evidence.mjs` writes the same set to `DIAG_OUT`. Full-canvas shots at every zoom: `CROPS/hero-<place>-<zoom>-dsf2.png` (dsf 1 for 0.9 and 2.4 as `-dsf1`).

**Scripts** (all take `DIAG_BASE`, `DIAG_CDP`, `DIAG_OUT`; serve with `PORT=<p> node server/static.mjs`):

| script | what it measures |
|---|---|
| `lib.mjs` | the harness: `boot`, `view`, `crop`, `pixels`, the camera places |
| `anchor.mjs` | two camera positions, cross-correlates open sea and land: exit 1 while the sea is not anchored |
| `seams.mjs` | crack pixels in the ground pass, every zoom and density |
| `stages.mjs [sw\|gpu] [dsf] [days]` | per-stage frame cost, still and moving camera |
| `elements.mjs` | draw ops, gradients, colours, flat share and cracks of every prop type |
| `coastjag.mjs` | coastline staircase against the smooth shoreline the land field describes (pure, reads `LAYOUT`) |
| `pops.mjs` | what changes at the stride thresholds; cached against direct frame |
| `stridecol.mjs`, `palette.mjs`, `decals.mjs` | pure: coarse-mesh colour error, terrain palette, decal and prop counts |
| `atmos.mjs` | fog pass alone (blit log, sprite borders), which pass darkens and greys, the ambient layer over three grounds |
| `jitter.mjs` | sprite blit position against the camera while panning 0.2 device px a frame |
| `memory.mjs` | canvas pixels by owner: day, five views, dusk |
| `zooming.mjs [days]` | frame cost while the zoom changes every frame |
| `governor.mjs [sw\|gpu]` | the real loop for 8 s a view: tier, fps, density, rAF interval |
| `dprblur.mjs`, `sharpness.py` | screenshots of the same view at canvas density 1.5 and 2, and their Laplacian variance |
| `evidence.mjs` | writes the pictures |

## 1. The ten root causes that matter most

Ranked by how much of the author's complaint each one carries.

1. **The sea is a screen-space backdrop** (W1): `World.drawWater` (`world.js` 567) never reads the camera. Moving the camera 240 x 160 world px slid the land by exactly -240 x -160 device px and the open sea by 0 x 0 (correlation 0.71 to 1.00 at zero shift). The wave lines sit at `(i/26)*H` and `(i*137) % W`, the glints at `h2(i,61)*W`: all window coordinates.
2. **The sea has no content and no relation to the land** (W2, W3): one vertical gradient (`#1b3b5c` to `#235a7a`), twenty-six 1 px hairlines at 10 to 15 % alpha, forty-four 3 to 9 px dashes. No depth, no shore band, no foam at the waterline; a lake or river is just "not land" showing the same strip; the one real water decal (district 8) is a rectangle with six sine lines, a second style.
3. **The fog is one near-black pool plus five stretched blurs per district, and a hard-edged desaturation of the district's footprint** (F1, F2, F3). The pool is blitted 3175 x 1969 device px per locked district (at z 0.9 the four in view together cover 98 % of the frame, and 84 % of the frame is above 24 % alpha); each cloud is a 256 x 128 sprite of nine soft blobs stretched 5.2 x by 1.8 x to 1334 x 236. Under it every tile and prop of the district is greyed by `fogged(c, 0.5)`. The result is a dirty-glass rectangle, not a cloud bank, and it costs 14 to 16.5 ms of a 22 to 24 ms frame (F4).
4. **The coastline is the edge of a boolean tile mask** (C1, C2): `land[]` (`layout.js` 183) is one bit per 64 x 32 diamond, drawn as whole diamonds (`world.js` 624). Mean 7.3, 95th percentile 15, worst 34 px from the smooth shoreline the same field describes; a corner every 3 coast edges; no beach slope, no wet sand, and foam only on the 29 % of coast edges that have a cliff, at the cliff's base 34 px under the water, not at the waterline.
5. **The terrain palette is a collage of sixteen unrelated hues with per-tile relief shading** (C3): `layout.js` 194 to 206 mixes each tile towards its nearest district's ground colour at up to 0.65 (orange, teal, magenta, steel blue, gold) and shades each tile by its own slope. Mean lightness 0.41, mean saturation 0.26. The same district with no fog, no dim and no grade (`CROPS/fog-lockedA-0.9-RAW-PALETTE-...png`) is a warm, readable place: the palette is not the main darkener, the passes over it are.
6. **The coarse terrain meshes are a different island** (C4): below zoom 0.85 / 0.5 / 0.28 the ground is re-meshed at stride 2 / 4 / 8. Crossing a threshold changes 27 to 45 % of the frame's pixels, 5.6 to 9 % by more than 16 levels, and moves the land coverage by -0.5 / -1.4 / -6.9 %; at stride 4 and 8, 21 % and 40 % of cells that touch the sea are drawn as full land; each cell takes the colour of one tile, not their mean.
7. **"Dusk" is not the clock** (G1 to G4): the grade is plain day at the default hour (night 0, dusk 0); the dark murky look is fog plus dim plus pool (mean lightness 0.391 down to 0.275, saturation 0.233 down to 0.100), the edge haze in the day layer, and the base palette. When the clock does matter, at 16x and 64x it is pinned at night 0.3 for ever, and at 1x only 42 % of the 168 s day is full daylight.
8. **Every prop is flat boxes** (S1 to S4, S8): across 56 prop types a prop is 18 draw ops on average (median 12.5); 8 % of fills are gradients and 31 of 56 types have none; 75 % of a building's pixels have four identical neighbours; people are eight rectangles, trees three triangles, shadows two stacked hard-edged diamonds or ellipses. No bevel, no ambient occlusion between stacked crates, no surface noise.
9. **Cached props tick while the ground glides** (S5, S6): `drawSprite` rounds each blit to a whole device pixel (`sprites.js` 120) while the camera transform is fractional. At 0.2 device px of pan per frame a cached prop stayed still in 70 % of frames and then jumped a whole pixel (0.5 css px at dsf 2, a full css px at dsf 1). While the zoom changes (a pinch) all cached props are stale scaled copies (240 to 297 resamples in 40 frames) and the frame costs 33 to 38 ms on Day 1.
10. **The pipeline cannot see what it costs** (P1 to P3, P5): the governor times only JavaScript (it read 0.6 to 1.5 ms while the real frame was 21 ms), so a fog pass of 16 ms never steps quality down; `scripts/perf.mjs` reports medians of 0.5 and 1.6 ms because it draws a still camera through the ground cache without reading pixels back; canvas pixel memory peaks at 201 MB at dusk at dsf 2 (limit 160); and `software` raster halves the sharpness (Laplacian variance 33.5 against 101.7).

### By device scale

| dsf | canvas density, `gpu` / `software` | ground cracks, alpha under 225, z 0.13 / 0.3 | sprite tick while panning, mean offset | in a picture |
|---|---|---|---|---|
| 1 | 1 / 1 | 3782 / 3379 | 0.52 css px | every 1 px rule is a whole css px; the ground's anti-aliasing is as coarse as it gets |
| 1.25 | 1.25 / 1.25 | 4624 / 2654 | not measured | a non-integer density: sprites and ground cannot share a pixel grid |
| 1.5 | 1.5 / 1.5 | 5840 / 494 | not measured | as 1.25 |
| 2 | 2 / **1.5** | 6904 / 0 | 0.27 css px | in `software` the canvas is stretched 1.33 x: three times softer |

The frame costs in section 3 are density 1.5 (the `software` cap); a real 2x GPU canvas has 1.8 x the pixels.

## 2. Defect table

"Fix" is the direction, not a design; "owner" is the module that should hold it (new modules are marked `new`).

### Water

| id | symptom (author's words) | root cause | reproduce | crop | fix | owner |
|---|---|---|---|---|---|---|
| W1 | "appears static behind the map when it moves" | `World.drawWater` (`world.js` 567 to 598) paints a 1 x 256 strip stretched over the canvas (575, 582) and decorations at window coordinates: lines `y=(i/26)*H+8`, `x0=(i*137)%W` (585 to 589), glints `h2(i,61)*W`, `h2(i,62)*H` (592 to 596). The camera is never read; zoom changes nothing. | `node scripts/diag/anchor.mjs` (dsf 2, z 0.5, camera +240,+160): land moves -240,-160; sea region 1 best shift -1,0 (corr 0.71), region 2 shift 0,0 (corr 1.00). Exit 1. | `water-anchor-A.png`, `water-anchor-B.png` | Water becomes a pure function of (camera, size, density, clock): pattern in world coordinates, drawn under the camera transform, with a slow independent drift. The same script then reports the sea at -240,-160 and passes. | `sea.js` (new, pure maths plus `drawSea`), called from `World.drawWater` |
| W2 | "blue with squiggly lines in it"; "no effort or consistency" | One gradient (573 to 574); lines are 1 px at alpha 0.10 to 0.15 drawn as sine wobbles of 1.6 px; glints 3 to 9 x 1 px. In a 700 x 360 px region at z 0.9 there are two faint hairlines and one dash. No depth bands, no shore interaction, no foam, nothing that repeats as a motif. | `evidence.mjs`, `view(z 0.9, sea)` | `E-sea-squiggles-0.9-x2.png` | Shallows-to-deep colour bands that follow the shore (distance field from the land mask), cartoon crest highlights and foam curls as designed motifs on a seamless world-space tile at every zoom (a pattern period that is a whole number of iso tiles so zoom only scales it). | `sea.js` |
| W3 | "no consistency with the rest of the map" | Lakes, rivers and bays are carved out of `land[]` (`layout.js` 163 to 172) and show the screen strip. The only water decal (`drawDecal` case `water`, `world.js` 708 to 715; one instance, district 8) is a filled rectangle with six sine lines: a second water style that does not meet the first. | any view of district 8 (harbor) or the central lake | `hero-sea-0.5-dsf2.png` | One water for everything: lakes and rivers come from `sea.js`; drop or restyle the rectangle. | `sea.js`, `kits.js` (harbor decals) |

### Coast and terrain

| id | symptom | root cause | reproduce | crop | fix | owner |
|---|---|---|---|---|---|---|
| C1 | "texture glitches ... on its edges"; "stair-stepped zig-zag of pale sand tiles" | `land[j*GW+i]` is 1 when the mean of four vertex field values is above 0 (`layout.js` 183 to 186); `drawGround` fills each land tile as a whole diamond (`world.js` 624 to 632). `node scripts/diag/coastjag.mjs`: 1626 coast edges, 544 right-angle corners (33.5 per 100 edges), one tile edge is 35.8 px; distance from the smooth zero contour of `FV` (marching squares): mean 7.3, p50 6.8, p95 15.1, max 33.9 px at zoom 1. | `coastjag.mjs` (pure); picture: `view(z 0.9, coast)` | `E-coast-stairs-0.9.png`, `E-coast-stairs-0.9-x3.png` | A smooth shoreline polygon traced from `FV` (marching squares, then Chaikin or a spline) drawn as the land's silhouette, with the tile mask kept for everything else (walking, heights, hit tests). The beach is a band between the polygon and an inset copy. | `shore.js` (new, pure: contour, offset bands) |
| C2 | "no shaped coastline, no beach slope, no cliff, no foam" | Only 28.9 % of coast edges (470 of 1626) have a cliff quad (`layout.js` 208 to 213, needs `max(za,zb) > 3`); the rest is sand (a tile with mean height under 2.6, `layout.js` 199; 4.2 % of coast tiles) or grass meeting the sea at once. Foam is one 1.4 px light stroke over a 3.2 px dark one (`world.js` 606 to 616), placed at `z = -SEA` (-34 px) at the cliff's foot, not at the waterline (z 0); in world units, so 0.7 css px at zoom 0.5. Cliff walls (`quad` to `-SEA`, 612 to 614) hang 34 px below the water with three stroke lines: the island reads as standing on a plinth. | `view(z 0.5, sea)` | `E-cliff-plinth-0.5-x2.png` | The waterline at z 0 is a drawn thing: foam ring and wet band along the shoreline polygon (live, over the sea, under the cached land), walls that end at the waterline. | `shore.js`, `world.js` `drawGround` |
| C3 | "murky olive and brown"; "google advertisement 2D paper" | `layout.js` 194 to 206: base colour by height, then mixed with the region tint (0.12) and with the nearest district's `cols.ground` at weight `clamp(1 - dd/15)*0.65 + noise` (203), then `shade(base, 1 + (z00 - z11)*0.014 clamp .8..1.2 + noise*0.05)` (205). The sixteen district ground colours have hues 7 to 46 (red to gold), 125, 158, 177, 210 to 224, 315 and 323 degrees at saturation 0.04 to 0.64. Result over 19407 land tiles: mean lightness 0.408, mean saturation 0.259. Tile-to-tile steps are small (mean lightness step 0.7 %, 3.9 % of neighbouring pairs over 4 %, 0.8 % over 25 degrees of hue), so the collage is regional: wide bands of one dye abutting the next (the pink and orange fields in the crop), and flat slope bands where a skirt of five tiles takes one shade each (`palette.mjs`). | `view(z 0.3, fit)` | `E-collage-0.3.png`, `hero-fit-0.3-dsf2.png` | One terrain palette family (lawn, meadow, moor, rock, sand), one gradual blend, and the district colour as a thin accent (pad edge, paving), not a regional dye; slope shading as soft smoothed light, not per-tile steps. | `terrain.js` (new: tile colour and shading), `layout.js` `tcol` loop |
| C4 | "tiles that change colour at stride boundaries" | `stride = zoom >= 0.85 ? 1 : zoom >= 0.5 ? 2 : zoom >= 0.28 ? 4 : 8` (`world.js` 604); a stride-`st` cell is drawn if any tile in it is land (`lands[st]`), as a full `st x st` diamond with corner heights sampled at the cell's corners, and the colour of the land tile nearest its middle (`coarseCol`, 643). Measured: crossing 0.85, 0.5, 0.28 changes 26.8 / 41.8 / 44.8 % of the pixels (5.7 / 5.6 / 9.1 % by more than 16 levels) and the land area by -0.5 / -1.4 / -6.9 %. Cells that are partly sea but drawn whole: 7 % (stride 2), 21 % (4), 40 % (8); colour error against the mean of the cell's tiles 4.7 / 6.7 / 10.2 of 441, p95 up to 34; corner height error up to 4.7 px. | `pops.mjs` (zoom 0.8499 against 0.8501, 0.4999 against 0.5001, 0.2799 against 0.2801), `stridecol.mjs` | `stride-pop-0.50.png`, `stride-pop-0.85.png` | Detail must change by blending, not by re-meshing: chunked terrain painted once per zoom bucket from the same geometry (so a coarser bucket is a downsample of a finer one), averaged colours, the shoreline polygon at every zoom. | `terrain.js` |
| C5 | texture glitches | Tile fill plus a same-colour stroke of 0.8 world px (`world.js` 623, 631) is the only thing that hides anti-aliasing cracks; at zoom z and density d it is `0.8 z d` device px wide, under one device px below zoom 1.25 / d. Seam count (a pixel with alpha below 225 inside an opaque field, so at least a tenth of the sea shows through): at z 0.13 3.8, 4.6, 5.8 and 6.9 thousand pixels at dsf 1, 1.25, 1.5 and 2; at z 0.3 3.4, 2.7 and 0.5 thousand at dsf 1, 1.25 and 1.5, none at dsf 2; at most 17 pixels at z 0.5 and none from z 0.9 up. None bleeds more than a quarter. (Pixels with any alpha deficit: 10 to 34 thousand at z 0.5, dsf 2; they are 2 to 5 % bleed and invisible. A first reading of that count overstated the defect.) | `node scripts/diag/seams.mjs` | `E-cracks-*` (nothing to see at z 0.5 and 0.9, which is the finding) | Only matters once the mesh is rebuilt: paint chunks with a one-device-pixel bleed and no stroke dependence. | `terrain.js` |
| C6 | "the district is desaturated to a dull grey-brown"; hard rectangles | `fxOf` returns `dim: FOG_DIM (0.5)` for a locked district (`world.js` 55, 350 to 357); `drawGround` swaps every tile whose `owner[k]` is that district to `fogged(col, 0.5)` (627; `owner` is set only for tiles inside the footprint rectangle, `layout.js` 202 to 204), and every ground quad, prop and decal with it. The edge of the effect is the straight edge of the footprint rectangle. Each block quad also gets a `rgba(0,0,0,.4)` outline 1.5 world px wide (637): a sticker border that grows with zoom. | `view(z 0.3, fit)` | `hero-fit-0.3-dsf2.png`, `fog-lockedA-0.9-full-as-shipped.png` | Locked districts keep their colours and are covered by cloud (F-rows); no tile-level dye; outlines replaced by an ambient-occlusion edge that is part of the block's own painting. | `fog.js` (new), `terrain.js` |
| C7 | shimmer while moving; the world is cheap still and dear moving | `groundPass` (`world.js` 533 to 557) caches the ground only after the camera has stood still for one frame and any change of camera, size, density or opened district invalidates it. A moving or zooming camera draws the terrain tile by tile every frame (two path operations per tile at stride 1): 12 to 16 ms at zoom 0.9 to 1.2 (software). Cached and directly drawn frames are pixel-equal (2.3 % of pixels differ, 0.02 % by more than 16 levels), so the cache itself is sound. | `stages.mjs sw 2 0` | none | A world-space chunk cache keyed by zoom bucket so panning is blits (see the risks). | `terrain.js` |

### Fog and grade

| id | symptom | root cause | reproduce | crop | fix | owner |
|---|---|---|---|---|---|---|
| F1 | "a dark grey-blue wash over the whole district" | `Lighting.fog` (`lighting.js` 250 to 264) stamps one 192 x 192 radial pool (`rgba(14,20,32,0.55 / 0.4 / 0)`, 109 to 111) over `R = (footprint w + d) * 18` world px (`world.js` 735), flattened by `scale(1, 0.62)`. At z 0.9, dsf 2 one pool is 3175 x 1969 device px. Four visible districts cover 98 % of the frame, 84 % of it above 24 % alpha (mean alpha 0.39). | `atmos.mjs` | `fog-lockedA-0.9-AS-SHIPPED.png` | No dark pool. Fog is a bank of cloud over the district, bright where the sun hits it. | `fog.js` |
| F2 | "singular patches of blurred dots" | Two 256 x 128 sprites of nine soft radial blobs (`lighting.js` 112 to 118: radius 26 to 60, alpha 0.30 / 0.14 / 0, placed at `y = 40 + h2*48`, so blobs are cut by the sprite's top and left; border alpha 19 to 23 of 255 on one sprite). Five of them drift across the district on one band (`y = sin(i*2.1) * R*0.35`, 259 to 262), each drawn at `R*0.84 x R*0.24`: 1334 x 236 device px, 5.2 x wider and 1.8 x taller than the bitmap, then flattened again by the district's 0.62. Not drawn at all when zoomed out (`far`). Max step between neighbouring pixels in the whole layer is 12 of 255, so the cuts are faint; the look is blur, not blocks. | same | same | Clouds with a silhouette: layered bank (back, middle, front) of overlapping lobes, a lit rim and a soft shaded underside, tileable and drifting in world coordinates, with a smooth footprint mask. At every zoom. | `fog.js` |
| F3 | "mud and dirty glass" | `fogged(h, k)` (`iso.js` 43 to 48) = `mix(mix(h, gray(h), min(1, 1.5k)), '#121826', 0.5k)`: at k 0.5 each colour goes 75 % grey and 25 % near-black. Measured over the district: mean saturation 0.233 to 0.091 and lightness 0.391 to 0.346 from the dim alone; the pool takes it to 0.275. | `atmos.mjs` | `fog-lockedA-0.9-RAW-PALETTE-...png` against `...AS-SHIPPED.png` | as C6 | `fog.js` |
| F4 | slow with many locked districts | Software raster, Day 1, z 0.9, still camera: fog 16.4 ms of 23.2; z 1.2: 15.6 of 22.3; z 0.3: 16.5 of 24.3; z 2.4: 10.5 of 18.4; z 0.13: 6.0 of 15.5. Day 60: 0 to 0.9 ms (the district in view is open). | `stages.mjs sw 2 0` | none | A cloud bank blits a few sprites capped to the part on screen; budget in section 4. | `fog.js` |
| G1 | "reads like permanent dusk" | `dayTargets(hour, ...)` (`lighting.js` 21 to 28): the run starts at sun hour 9, so night = 0 and dusk = 0 at Day 1 (`night 0, dusk 0, hour 1.1` read from the world). The grade is white. Mean lightness over the district, centre 60 % of the frame: as shipped 0.275; no grade 0.241 (the grade adds haze); no fog sprites 0.346; no fog and no dim 0.391; raw palette 0.365. Saturation 0.100 / 0.125 / 0.091 / 0.233 / 0.263. | `atmos.mjs` | `fog-lockedA-0.9-*` | Lighter, warmer base; fog no longer darkens. | `fog.js`, `lighting.js` |
| G2 | dusk stuck on at fast clocks | `else if (speed >= 16) { night = 0.3; dusk = 0; }` (`lighting.js` 26); the speed menu is `[0.25, 1, 4, 16, 64]` (`js/ui/hud.js` 28), so two of five speeds hold a 30 % night for ever (meant to stop strobing; WCAG 2.3.1). | read the code; set the clock to 16 | none | Keep the rate limit; hold the hour, not a fixed night. | `lighting.js` |
| G3 | dark most of the time | `SEC_PER_HOUR = 7` (`config.js` 5): a day is 168 s at 1x. Sun hour = hour + 8: full day 10 of 24 hours (42 %), dusk 3, night 8, dawn 3; mean night value 0.46. | arithmetic | none | A brighter night grade (still readable: moon-lit, not black) and a longer day. | `lighting.js` |
| G4 | milky edges | `bakeDay` (`lighting.js` 79) lays a pale `rgba(196,218,238,0.2)` falloff to the edge (72 to 77) and a top haze of 0.24 (61), plus a 0.25 vignette. Over `#c8a050` the corner becomes (183,166,125) from (200,160,80); over `#3a8a4a` (110,155,122) from (58,138,74): saturation drops from about 0.6 to 0.2 at the edges while the centre is untouched. | `atmos.mjs`, section "ambient day layer" | none | Depth haze should tint toward sky and *add* contrast in the middle distance, not wash the frame edges. | `lighting.js` |

### Elements and sprites

| id | symptom | root cause | reproduce | crop | fix | owner |
|---|---|---|---|---|---|---|
| S1 | hairlines between faces | `box()` (`iso.js` 83 to 91) fills three anti-aliased quads that share edges; where two partial coverages meet the pixel keeps about 75 % alpha and shows the ground through. 125 pixels per box at scale 1, 158 at 1.25, 191 at 1.5, 258 at 2, 264 at 2.4 (alpha below 225). Over 56 prop types 10.2 thousand faint crack pixels in 3.3 Mpx. Real but low contrast: on crates and buildings at dsf 2 it is not visible to the eye; on pale ground with dark walls it will be. | `elements.mjs` | `E-finest-crates-x2.png` (clean) | Paint the silhouette first in the mid tone, then faces over it; or inflate faces by half a pixel. Costs nothing at draw time inside a sprite. | `iso.js` `box`, `shading.js` `solid` |
| S2 | "flat-shaded sharp boxes"; "no ambient occlusion, no rounded or bevelled forms, no surface texture" | `elements.mjs`, 56 prop types at scale 2.4: 18.3 ops per prop (median 12.5); gradient fills are 63 of 777 fills (8.1 %), 31 types have none; 74.9 % of building pixels (19 sprite-cached types) and 64.2 % of all prop pixels have four identical neighbours; median 78 distinct colours per prop (5 bit per channel). `solid()` adds a wall gradient, a rim and courses, which is all the form there is; the only occlusion is two stacked diamonds on the ground (`contact`, `shading.js` 70 to 73). No `shadowBlur`, no filter, no clip beyond one. | `elements.mjs` | `E-finest-crates-x2.png`, `hero-finest-2.4-dsf2.png` | A form kit: rounded and bevelled prisms (chamfered edges lit by the sun), cylinders with real highlights, soft occlusion at every contact, surface noise (planks, brick, grain), simple facial and clothing detail. Cached once per sprite so the cost is build time, not frame time. | `form.js` (new, built on `iso.js`), `props.js` |
| S3 | "voxel-doll characters with no face"; "thin one-pixel fences"; "a flat yellow crane" | `person()` (`iso.js` 213 to 223) is eight `fillRect` calls (legs, torso, shade strip, head, hair, two eyes) with a blob shadow; trees are three triangles (`tree`, 190 to 202); fences, rails and the crane are 1 to 2 px strokes and flat fills (`props.js` 221 to 233, 283). Drawn directly every frame, never cached. | `view(z 2.4, finest)` | `E-finest-person-x4.png`, `E-finest-fence-x3.png` | Characters and plants designed as shapes at the zoom they are seen at (bodies with limbs, hands, hair masses, expressions), cached per pose bucket; rails with thickness and posts. | `form.js`, `people.js` (new) |
| S4 | "hard-edged ellipse shadows" | `shadow()` is two diamonds at alpha 0.4 and 0.65 of the base (`iso.js` 144 to 148); `blob()` two ellipses (150 to 153); an asset's shadow is one flat ellipse (`world.js` 827). No penumbra. | `view(z 2.4, finest)` | `E-finest-person-x4.png` | A pre-blurred soft shadow sprite per size, stamped; sun direction already fixed (upper left). | `form.js` |
| S5 | shimmer, ticking | `drawSprite` blits at `Math.round(a * x0 + M.e)` (`sprites.js` 120) while `draw()` sets the transform with a fractional `dpr * (W/2 - cam.x * cam.z)` (`world.js` 482) and draws the ground, entities and uncached props at that fractional phase. Panning 0.2 device px a frame over 24 frames: the 10 cached props in view did not move in 70 to 72 % of frames, then jumped; mean offset from the true place 0.52 device px, worst 1.2 (difference of two roundings, both axes); at dsf 1 that is half to a whole css px. | `jitter.mjs` | none | Round the camera's translation to whole device pixels once in `draw()`: the ground then keeps one raster phase while it pans, sprites keep a constant sub-pixel offset, and nothing ticks relative to anything else. | `world.js` `draw` |
| S6 | blurry then sharp when zooming | While the scale is changing, or inside the 90 ms after it stops, `drawSprite` draws the sprite of the nearest zoom scaled by `k` (`sprites.js` 100 to 101, 125) and builds at most 3 ms a frame (`BUILD_MS`); a sprite over 2.2 Mpx waits 260 ms. During a pinch (40 frames at 0.6 % a frame) Day 1: 33 to 38 ms a frame with 240 to 297 resampled blits and 0 builds; Day 60: 17.6 to 22.3 ms. After the zoom rests everything is exact in 150 to 275 ms (6 sprites in view). | `zooming.mjs` | none | With pinch zoom becoming primary this path is the working path: keep sprites at the nearest bucket and cross-fade; build the next bucket ahead on idle. | `sprites.js` |
| S7 | grey cubes on the map | Under `FAR_ZOOM = 0.42` every prop not in `KEEP_FAR` is `farDraw`: one plain `box` in its colour, trees an 8 x 7 ellipse (`props.js` 741 to 747). | `view(z 0.3, fit)` | `hero-fit-0.3-dsf2.png` | Simplified silhouettes drawn from the same form kit, baked per district into one chunk. | `props.js`, `form.js` |
| S8 | labels | Fine: label sprites are made at the device density and blitted on whole pixels (`labels.js` 39 to 42). | n/a | none | keep | n/a |

### Pipeline

| id | symptom | root cause | reproduce | fix | owner |
|---|---|---|---|---|---|
| P1 | quality never steps down where it should | `govern(cost, gap)` (`world.js` 417 to 430) is fed `performance.now() - t0` around `update` and `draw` (`frame`, 388 to 406): JavaScript time only. In software raster the real frame is 21 to 23 ms (fog 16) and the governor read 0.6 to 1.5 ms (`gov.cost` after 8 s of the real loop at five views: tier 0 in all, 30 fps, no `lite`). Only a frame that arrives 2.2 intervals late counts as slow. | `governor.mjs` | Feed it the requestAnimationFrame interval too (cheap), so raster cost is seen. | `world.js` `govern` |
| P2 | memory | At dsf 2 with the GPU (canvas density 2): 74 MB at rest in one district, 129 MB after five views, 201 MB at dusk (main 5.18 Mpx, ground cache 5.18, day, night, shafts and mix layers 5.18 each, 91 sprites = 18.7 Mpx, labels 0.4). `SPRITE_BUDGET` at density 2 is 33 Mpx = 132 MB on its own. The limit for the new art is 160 MB total. | `memory.mjs` | Sprite budget to about 14 Mpx; the three extra light layers at half size; every new cache registers its pixels in one place. | `sprites.js`, `lighting.js`, `cache.js` (new) |
| P3 | the repo's own metric cannot hold a 1.25 x rule | `scripts/perf.mjs` times 120 `draw()` calls of a still camera through the ground cache and never reads a pixel: median 1.6 ms (island), 0.5 ms (focus), p95 60.5 and 4.3, rAF median 16.7 (60 Hz, no frame over 33 ms). Flush-inclusive medians for the same states are 7 to 23 ms. | `node scripts/perf.mjs` | Gate on the section 4 numbers (flush-inclusive, still and moving). | `scripts/diag/stages.mjs` |
| P4 | stepping | `this.fps = slow > 4 ? 15 : slow > 2 ? 20 : 30` (`world.js` 403): the world draws at most 30 times a second (every other frame at 60 Hz) even at tier 0. | read the code | A moving camera or zoom should draw every refresh. | `world.js` `frame` |
| P5 | soft pictures | `targetDpr()` (`world.js` 131 to 136) caps the canvas at `SOFT_DPR` 1.5 when `softwareRaster()` (`gfx.js` 28 to 37: no WebGL without a performance caveat). At dsf 2 in software raster the canvas is 2160 x 1350 shown at 2880 x 1800 (a 1.33 x non-integer stretch by the compositor): Laplacian variance 33.5 against 101.7 for the same view at density 2 (`dprblur-*.png`); edge sharpness 3 x lower. Any review made with a software browser (and the orchestrator's evidence images) is that soft. | `CROPS/dprblur-software-dpr1.5.png`, `dprblur-gpu-dpr2.png` | Design for non-integer scale (nothing that needs a one-pixel grid); keep the cap for CPU canvases but say so in captures; judge pictures with `gpu:true`. | `world.js` `targetDpr`, review process |

## 3. What a view is made of: stage costs

All `software` raster, dsf 2 (canvas 2160 x 1350), median of 40 draws, ms. Each stage is followed by a one-pixel readback that costs about 0.8 ms, so small stages read about 1 ms high. "Other" (the depth list, culling, props, hover) is the remainder.

### Day 1 (one district open)

| view | camera | total | p95 | water | ground | props (statics) | entities | fog | grade | field + overlay |
|---|---|---|---|---|---|---|---|---|---|---|
| z 0.13 fit | still | 15.5 | 18.7 | 1.97 | 1.61 | 3.84 | 0.73 | 6.04 | 1.05 | 0.3 |
| z 0.13 fit | moving | 19.7 | 22.9 | 1.94 | 6.05 | 3.28 | 0.79 | 6.03 | 1.09 | 0.3 |
| z 0.3 fit | still | 24.3 | 25.8 | 1.93 | 1.09 | 2.66 | 0.60 | 16.49 | 1.06 | 0.3 |
| z 0.3 fit | moving | 35.2 | 39.7 | 1.94 | 12.22 | 2.88 | 0.59 | 16.46 | 1.12 | 0.2 |
| z 0.5 lockedA | still | 21.9 | 25.2 | 2.00 | 1.10 | 3.38 | 0.12 | 14.41 | 1.07 | 0.1 |
| z 0.5 lockedA | moving | 30.5 | 35.6 | 1.94 | 9.92 | 3.27 | 0.10 | 14.26 | 1.07 | 0.1 |
| z 0.9 lockedA | still | 23.2 | 24.1 | 1.88 | 1.09 | 2.36 | 0.02 | 16.41 | 1.08 | 0.3 |
| z 0.9 lockedA | moving | 37.9 | 41.5 | 1.92 | 15.42 | 2.45 | 0.05 | 16.45 | 1.10 | 0.3 |
| z 1.2 lockedA | still | 22.3 | 24.0 | 1.98 | 1.05 | 2.23 | 0.03 | 15.56 | 1.15 | 0.4 |
| z 1.2 lockedA | moving | 32.9 | 37.6 | 1.89 | 12.08 | 2.07 | 0.02 | 15.70 | 1.07 | 0.3 |
| z 2.4 finest | still | 18.4 | 19.1 | 1.88 | 1.10 | 2.71 | 0.55 | 10.46 | 1.07 | 0.5 |
| z 2.4 finest | moving | 20.7 | 22.8 | 1.90 | 3.47 | 2.65 | 0.58 | 10.55 | 1.04 | 0.5 |
| z 0.9 coast | still | 9.9 | 10.2 | 1.89 | 1.03 | 2.00 | 0.49 | 2.85 | 1.03 | 0.4 |
| z 0.9 coast | moving | 16.8 | 17.8 | 1.92 | 7.84 | 2.03 | 0.45 | 2.91 | 1.01 | 0.4 |

Re-run of `stages.mjs` from the committed script: z 0.9 lockedA still 22.8 / moving 35.3 (fog 16.2); noise is about 2 ms.

### Day 60 (district 3 open)

| view | camera | total | p95 | ground | props | entities | fog |
|---|---|---|---|---|---|---|---|
| z 0.13 fit | still / moving | 12.5 / 17.2 | 14.3 / 20.6 | 1.61 / 6.43 | 3.38 / 3.15 | 2.77 / 3.02 | 0.87 / 0.85 |
| z 0.3 fit | still / moving | 10.1 / 21.0 | 11.0 / 24.8 | 1.07 / 12.08 | 2.41 / 2.63 | 2.18 / 2.03 | 0.94 / 0.93 |
| z 0.5 lockedA | still / moving | 8.2 / 17.6 | 9.4 / 19.1 | 1.05 / 10.06 | 2.98 / 3.11 | 1.04 / 1.06 | 0 |
| z 0.9 lockedA | still / moving | 7.4 / 23.0 | 8.3 / 31.0 | 1.02 / 16.01 | 2.26 / 2.67 | 0.59 / 0.76 | 0 |
| z 1.2 lockedA | still / moving | 7.5 / 20.2 | 9.6 / 23.2 | 1.02 / 13.26 | 2.23 / 2.42 | 0.78 / 0.81 | 0.01 |
| z 2.4 finest | still / moving | 8.6 / 10.9 | 9.6 / 12.5 | 1.06 / 3.67 | 2.98 / 2.90 | 0.84 / 0.75 | 0 |
| z 0.9 coast | still / moving | 6.8 / 13.9 | 7.4 / 16.3 | 1.01 / 8.01 | 1.94 / 2.01 | 0.49 / 0.49 | 0 |

### While the zoom changes every frame (a pinch), software raster

| state | zoom in from 0.9 | zoom out from 1.6 | zoom in from 0.3 |
|---|---|---|---|
| Day 1 median / p95 | 38.4 / 40.9 | 33.1 / 35.0 | 34.2 / 46.1 |
| Day 60 median / p95 | 22.3 / 24.7 | 17.6 / 19.5 | 19.0 / 27.2 |

### Other baselines

- `node scripts/perf.mjs` (dsf 2, software, 60 days): island 1.6 ms median (p95 60.5, max 64.4), focus 0.5 ms (p95 4.3, max 241.6), rAF median 16.7, p95 16.7, none over 33 ms, heap growth -6 MB, governor tier 0. JavaScript time of a still, cached camera only (P3).
- `gpu` mode, JavaScript time of one `draw()` over every view and density (a loop of 30 `draw()` calls per view, camera still and nudged): still 0.1 to 2.3 ms, moving 0.3 to 3.5 ms, p95 spikes to 14 ms when caches build. Deferred raster is not in it, which is why section 3 is `software` with readbacks.
- Real loop, 8 s per view: governor tier 0, 30 fps, density 1.5 (software) or 2 (gpu); rAF median 16.5 to 21 ms.
- Canvas memory: section P2.

### Proposed budget (the 1.25 x rule made checkable)

The rule in the brief ("not slower than 1.25 x the baseline") is checkable only on the flush-inclusive numbers above. Limits, same machine, `stages.mjs sw 2`:

| case | baseline | limit (1.25 x) | note |
|---|---|---|---|
| Day 1, z 0.9 still | 23.2 | 29.0 | fog is 16.4 of it: the new fog must cost far less, which pays for water and form |
| Day 1, z 1.2 still | 22.3 | 27.9 | |
| Day 1, z 0.9 moving | 37.9 | 47.4 | uncached ground 15.4 |
| Day 1, z 1.2 moving | 32.9 | 41.1 | |
| Day 60, z 0.9 still | 7.4 | 9.3 | water 1.9, grade 1.1, props 2.3, ground blit 1.0 leave about 3 for everything new |
| Day 60, z 1.2 still | 7.5 | 9.4 | |
| Day 60, z 0.9 moving | 23.0 | 28.8 | |
| Day 60, z 1.2 moving | 20.2 | 25.3 | |
| finest z 2.4 (either state, still or moving) | 8.6 to 20.7 | 24 hard | the brief's own ceiling |
| pinch, Day 1 / Day 60 | 33 to 38 / 18 to 22 | 48 / 28 | |
| canvas pixels, dsf 2 | 201 MB at dusk | 160 MB | P2 |

## 4. Parts of the pipeline that can stay

- **Projection and layout.** `iso.js` `sx/sy/P/toGrid`, the 190 x 140 tile grid, `island.js` anchors and roads, `layout.js` heights `ZV`/`zAt`, districts, props and `bounds`. Everything that decides where things are, how the camera clamps, how a click maps to a tile (`unproject`, `groundAt`, `zoneUnder`) and where buildings stand must not change.
- **The ground cache design.** Three modes (all, still, live) and a copy stamped for a still camera. Measured sound: cached and direct frames differ by 0.02 % of pixels beyond 16 levels. Extend it (chunks, world-space keys); do not remove it. The live decals sit on top of the stamp, which is also where moving water and foam can go: the sea is painted before the ground and the cached land is transparent over it.
- **The sprite cache.** Resolution-keyed (1/1024 octave), memory-budgeted, stale-scale reuse, `body()`/`live()` split, polygons stored for hit testing. Fix the budget (P2) and the rounding phase (S5); the structure is right.
- **Depth-sorted item list** with a reused record pool (`push`, `itemPool`, `BY_KEY`) and per-item `try/catch`.
- **Label sprites and the overlay planner** (`labels.js`, `drawOverlay`, `planZoneTags`): crisp at any density, tested.
- **Particle pool** (`fx.js`): fixed arrays, seeded, deterministic; the dust and firefly depth layers.
- **Light machinery**: `dayTargets` rate limit (WCAG 2.3.1), `tintOf`, the one-full-size-layer-a-frame crossfade (`Lighting.mix`, `perFrame`), idle release. The *content* of the layers changes; the scheduling stays.
- **The governor's tiers and its doubling wait**, `dprDown` hysteresis, `warm` frames after a resize. It needs a second signal (P1), not a rewrite.
- **Reduced motion and Calm/Off**: `reduced()` gives a still picture; every new animation must go through it.
- **Reveal API**: `fxOf(z)` (`fog`, `dim`, `lights`) and `startReveal`; `tests/world.test.mjs` 353 to 374 pins it. Keep the shape, change what it drives.
- **Helpers**: the memoised colour functions (`shade`, `mix`, `tone`, `fogged`), `gfx.js` `surface`/`Cache`/`glowSprite`/`snap`, `windows()` batching.
- **The test rig**: `stubDom`, `installRecording`, recorder contexts in `tests/world-fx.test.mjs`.

## 5. Risks

1. **Hit testing.** Clicks use polygons recorded during drawing (`this.hits`; a sprite returns the `polys` stored at build, `sprites.js` 128 to 129) and, for the ground, `groundAt` -> `unproject` -> `zAt` (bilinear `ZV`, bridge decks). A new coastline, terrain mesh or relief must be a function of the same `ZV` and bridge heights or a click lands visibly off the ground it points at; a rebuilt prop body must return the same polygons; map mode uses `zoneUnder` (footprints) and is unaffected. `LAYOUT.land` and `tcol` are read only by `world.js` (drawing) and the minimap (`miniBase`, 1186 to 1193: it paints tiles from them, so a new palette changes it too).
2. **Caches.** `gcKey` is `(cam.x, cam.y, cam.z, W, H, dpr, unlockHash)`: anything animated that moves from frame to frame must be drawn live over the stamp (mode 2) or it defeats the cache (the reveal test, `world-fx.test.mjs` 220). Foam and wave crests are animated: live layer. A chunk cache keyed by zoom bucket adds pixels (P2) and a rebuild stall at every bucket change; build ahead of need, never in the frame that needs it (`sprites.js` BUILD_MS rule).
3. **Memory.** Already 201 MB at dusk at dsf 2 against 160: every new offscreen layer (water tile, cloud sprites, terrain chunks, shadow sprites) must be paid for by shrinking the sprite budget (132 MB at density 2) or the light layers (four full-size at dusk).
4. **Governor.** It sees JavaScript time only (P1): a new pass made of large alpha blits will not trip it. `tests/world-fx.test.mjs` 283 uses synthetic costs; a second signal needs a new test. The tiers must still step down and recover (hysteresis `GOV_WAIT`, doubling).
5. **Moving and zooming frames are the dear ones** (12 to 16 ms of uncached ground; 33 to 38 ms in a pinch on Day 1), and the branch `v2/zoom` makes pinch and wheel the main way to zoom. Anything that is expensive per frame while the camera moves lands on the path people will use most.
6. **Software raster.** Every full-window pass is a CPU pass there, and the density is capped at 1.5, a non-integer stretch on a 2x screen. Pixel-grid art (one-pixel rails, dither) will shimmer; design for any scale. Test in both modes.
7. **Tests that pin the old look and must be changed to pin the new intent** (say so in the commit): `tests/world-fx.test.mjs` 356 to 376 (the sea is a 1 x 256 strip, seven strokes, lines never leap; replaced by the anchored sea), 325 to 354 (the air's layers and the centre-clear falloff), 106 (light stamps); `tests/world.test.mjs` 353 to 374 only if `fxOf`'s values change. The ground-cache tests (203 to 245) should keep passing if mode numbers and signatures stay.
8. **Colour constants.** `FOG_DIM`, `fogged`, the sea colours, `tcol` mixing and `TAG_COLOR` are read by labels and the minimap; a palette change is a change to the minimap's backdrop and to label contrast (labels sit on dark chips, so they are safe).
9. **Conflicts.** `v2/zoom` owns the wheel, pinch and Safari gesture listeners and `zoomBy` smoothing in `world.js`. This work is in `drawWater`, `drawGround`, `drawFog`, `draw()` (camera rounding, S5), `targetDpr` and the new modules; keep edits out of `bindInput` and `zoomBy`. The new sea must be a pure function of `cam`, so whatever smoothing `v2/zoom` adds (a target zoom eased per frame) cannot desynchronise it.
10. **Headless capture.** A hidden or headless page throttles `requestAnimationFrame`; draw by hand (`pc.world.draw()` twice), and call `pc.world.stop()` first or the loop advances the clock between two shots. Pictures from a software browser are 3 x softer (P5).

## 6. Reproducing

```
PORT=8502 node server/static.mjs &                         # note the PID, stop it by PID
export DIAG_BASE=http://localhost:8502 DIAG_CDP=9502 DIAG_OUT=/tmp/render-diag
node scripts/diag/anchor.mjs            # W1: exit 1 until the sea is anchored
node scripts/diag/seams.mjs             # C5, S1
node scripts/diag/stages.mjs sw 2 0     # section 3, Day 1; "sw 2 60" for Day 60
node scripts/diag/elements.mjs          # S1 to S3
node scripts/diag/coastjag.mjs          # C1, C2, C4
node scripts/diag/evidence.mjs          # the pictures
```

`pops.mjs`, `atmos.mjs`, `jitter.mjs`, `memory.mjs`, `zooming.mjs [0|60]`, `governor.mjs [sw|gpu]`, `dprblur.mjs` then `python3 scripts/diag/sharpness.py <the two pngs>`, `stridecol.mjs`, `palette.mjs` and `decals.mjs` reproduce the other numbers in this file with the setups given in the rows. Run-to-run noise on the timings is about 2 ms; the counts (cracks, pixels changed, blits) repeat exactly.
