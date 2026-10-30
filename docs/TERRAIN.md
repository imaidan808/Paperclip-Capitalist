# Terrain, coast and water (track T1)

How the ground, the coast and the sea are drawn since the T1 pass, and what is left. Presentation only: nothing here changes `LAYOUT.land`, `isLand`, `zAt`, the hit shapes or any game rule. `?layers=all:legacy` still draws the old picture.

## The idea

The sea is not a backdrop. It is the floor of the world the land stands on, and every pixel of it is a function of where that pixel IS on the island (`gx = wx / 64 + wy / 32`, `gy = wy / 32 - wx / 64` on the water plane) and of the clock. The land is one continuous surface painted from the same data, so a coast, a beach, a cliff and a meadow are not tiles with an edge but places with a distance to the sea.

One distance field carries it all. `coastgeo.js` turns the tile mask into a smooth coast and a signed distance to it (tiles, positive in the sea); the sea's depth colour, its foam, the island's glow and shadow, the wave bands, the beach and its wet edge, the cliff lip and the anti-aliased edge of the land are all read from that one field.

## The modules (all T1, all in `js/world/`)

| module | what it is | pure? |
|---|---|---|
| `coastgeo.js` | the smooth land field (the mask blurred, bent towards the generator's own field `FV`, clamped to a quarter tile of the tile coast), marching squares to rings, Chaikin, the exact Euclidean transform, the signed distance field (fine near the island, coarse to 56 tiles), `buildCoast` | yes |
| `noise.js` | value noise on a hashed lattice | yes |
| `terrainfield.js` | one colour per terrain vertex: meadow patches, height, slope, the district's ground over six tiles, the sun, the veil of a locked district | yes |
| `rasterbase.js` | the per-pixel base: `seaPass`, `wallPass`, `landRaster` + `landShade` (a Gouraud mesh, rasterised once and shaded once), `bakeBase` | yes (typed arrays) |
| `scene.js` | the coast and the terrain field for a set of locked districts, built once, lazily | data |
| `groundchunks.js` | the ground in chunks of 384 device pixels at the exact scale: `chunkPass` | needs surfaces |
| `groundart.js` | the V2 layers `shore` (the base), `terrain` (tufts, flowers), `blocks` (stages, kerbed roads, crossings, pavers, manholes, grain), `roads` (ribbons, bridges, buoys) | needs a context |
| `decalart.js` | the districts' decals in the toy language (kits are T3's and keep their dark hexes: they are lifted by interpretation) | needs a context |
| `water.js` | the sea layer (a fill), the live motifs (bold crests, foam curls, ripples, sparkles under one slow current), the swash on the beaches (one polygon a beach), the moving decals | needs a context |
| `waves.js` | the shapes of those motifs as pure geometry: bent capsules, chains of discs, ripple rings, four-point sparkles, ribbons | yes |

## How a frame goes

`world.draw()` runs `sea` (fills the view with open-sea colour so a chunk being baked is never a hole), then `groundPass`, which for the V2 ground calls `chunkPass` (`groundchunks.js`) and then `livedecals` (the live sea). A chunk is baked by the stack's ground layers in order: `shore` paints the whole pixel buffer (land rasterised first so the sea skips what is opaque land, then the sea, the cliff walls, the land shaded over them) and puts it into the chunk; `terrain`, `roads` and `blocks` draw vector art over it. A pan is a handful of whole-pixel copies; the camera's translation is rounded in `toWorld`.

- **Chunk size and memory.** 388 x 388 x 4 bytes (0.6 MB) with a two pixel bleed; the set is kept to the window and a ring of one chunk; registered in the ledger as `ground.chunks`.
- **Zoom.** While the zoom changes the fullest old set is blitted scaled (the one scaled copy the plan allows) and nothing is baked; at rest the exact scale is baked at 14 ms a frame (9 ms while moving), one chunk always. The shot rig (`window.__rig`) bakes everything at once so its pictures settle in two draws.
- **Cost.** A chunk bakes in 1.5 to 6 ms on this machine (a cliff coast 13), measured in Node by `scripts/diag/chunkbake.mjs`: sea 0.2 to 2.8 ms alone (a lattice of nodes 16 pixels apart, 2 x 2 blocks where the sea is smooth, the exact distance per pixel within a tile and a half of the coast), land 0.5 to 5 ms alone (deferred shading: each pixel is shaded once, however many triangles overlap it).

## What is where in the picture

- **Sea depth**: `seaRamp(d)` of the palette, 8 entries a tile out to 56 tiles; the island's glow (the first 2.4 tiles), its shadow (the coast moved half a tile towards +gx, feathered), a slow mottling, the haze (an ellipse round the island: never a box); twelve soft wave bands at 2 to 34 tiles, broken by noise.
- **Foam**: white, scalloped by noise, anti-aliased to the pixel, with a broken trail behind it; a film on the edge of the sand.
- **Beach** (ground under 5 pixels high): wet edge with a sheen, sand with a scalloped boundary to the meadow. **Cliffs**: strata by absolute height (sandstone below 40 pixels, lilac rock above), the same on the wall (to the waterline) and on the steep ground above it; only faces that look towards the viewer.
- **Live**: crests (soft lens highlights lying along the shore, a screen-space floor of 14 x 3.5 pixels), curls, glints, the swash. Everything moves as one slow current (at most 0.04 tile a second) plus a gentle breath; at `env.t === 0` (Calm, Off, reduced motion) each stands at its resting pose.

## Checks

`node scripts/world-metrics.mjs DIR --anchor` on `--set pan` exits 0 (pan 0.98, drift 0.93, zoom); `--unpainted` on `--set extent` at 390 x 844 and 768 x 1024 exits 0; `node scripts/world-budget.mjs` is inside every ceiling, still and moving. Tests: `tests/world-coast`, `world-raster`, `world-chunks`, `world-water` (pure parts in Node; the cache and the layers on stand-in surfaces).

## The water pass of the second art round (judge round 1: water 7, 7, 6; terrain 6, 6, 5)

What was wrong and what stands now, so nobody undoes it by accident.

- **No hairline, no squiggle.** The old base laid ribbons of lighter water at fixed distances from the coast (a few pixels wide: contour loops and a doodled paperclip) and the live layer lens-shaped leaves. The base now carries the swell (`swellAt`): large soft bands, patches of a few tiles, rows along the screen's horizontal far out and wrapping the coast within seven tiles, two scales (`swellScales`: the fine bands from S 0.35, the coarse ones carry the far zoom). The depth ramp is looked up at a bent distance (`bentDepth`) so no colour is a contour of the coast, with a scalloped pale shelf (`shelfAt`) that reaches further at the far zoom. The live marks are few and bold (`waves.js`): a crest is a capsule with a trough under it, never steeper than 34 degrees on the screen; a foam curl a chain of overlapping discs; a ripple a squashed ring that grows and fades; a sparkle a four-point star of any size. A second helping comes in with the close band (`lod[3]`), with caustic dapples (`causticAt`) and bubbles in the foam baked in.
- **The shore is one line.** The swash was stretches of 0.7 tile stroked with butt ends (the rectangular steps every tile); it is one filled ribbon a beach (`beachRuns`, `drawSwash`) tapering at both ends. The coast is swung by noise (`COAST_WOBBLE`, `wobbleAt`: up to 0.6 tile, 22 world pixels, so no run of it is a ruler) and the field smoothed after its clamp. The wet sand is a glossy tone that fades into the dry, not a band. The cliff wall is rasterised a column at a time (`wallPass`) with an anti-aliased foot over the foam, its strata six and a half pixels thick with alternating tone, and the rock on the land above it is a field interpolated from the vertices (`terrainField` `st`, `sd`), so its edge is a smooth contour and not a triangle's.
- **No pixel grain.** The land's tone is value noise in world units (`toneAt`, on a four-pixel lattice), the blocks' weathering a periodic mottle tile laid in world space (`mottleTile`); neither is locked to the device pixel. The dither is hashed from the pixel's place in the world's device grid, so a chunk and its neighbour dither alike.
- **The district meets the meadow without an edge.** The terrain field's district tint falls over a tile and a bit (it was 6.5, with a jump at the footprint: the olive veil and its stripes), the block has a verge of its own ground fading over half a tile and a ten-step contact shadow, the ground colours are lifted a fifth (`liftGround`), and a locked district wears one warm veil (`warmVeil`, `veilColour`) in the terrain, the blocks and the decals. Puddles and stains are soft blobs with irregular outlines (no rim). The ferry's buoys are cones with a band, a lamp, a foam ring and a shadow.
- **Lawns have something on them:** bushes and boulders hashed from the tile (mid band up), baked in the chunk.
- **Cost** (CPU time of one chunk bake at S 1.35, this machine): sea 2.8 to 5.1 ms, meadow 3.4 to 4.0, cliff 12.9 to 16.5, beach unchanged; the budget scenes of `world-budget.mjs` are all inside their ceilings.

## Not done, or left to others

- The legacy drawers (`drawWater`, `drawCliffs`, `drawTerrain`, `drawRoads`, `drawBlocks`, `drawLiveDecals`, the sea's strip) are still in the modules and reachable by `?layers=all:legacy`: deleting them also means editing `stack.js`'s adapters (T5's) and the tests that pin them.
- The engine's own chunk cache (T5) replaces `chunkPass` when it lands; the chunk draw contract (`a.chunk = { S, ox, oy, N, buf, img, scene }`) is the same one the plan describes.
- Water by night: the baked sea is the day picture and the grade (T2) multiplies it; moon glints and a darker deep sea are the grade's to do.
- The blocks' raised rim and the roads' ambient occlusion are painted flat; the district's kits (T3) still name their colours in the old dark hexes.
- Whole-island locked districts under cloud are T2's: the ground wears 60% of the veil so what is under the cloud is still colourful.
