# Art Direction: the Toy Island

The style bible for the 2.5D world of Paperclip Capitalist (`js/world/*`). Every artist and every agent who touches what the world looks like obeys this file. Where it says MUST or NEVER it is not a suggestion; where it gives a number, the number is the spec.

Scope: presentation only. Nothing here changes world coordinates, district geometry, hit shapes, the engine, game rules, data, balance or text. The object list below the map and its accessibility stay exactly as they are. `pc.world`'s public API and everything `js/ui/worldview.js` and the tests use keep working. The camera input handlers (wheel, pinch, gesture, `zoomBy`) belong to another branch (`v2/zoom`) and are not touched here.

Status: version 1, written at `adcd991`, 2026-10-28. Numbers marked "machine-checked" are held by `tests/art-direction.test.mjs` (see the constants block in Appendix A); if you change one, change the block and the prose together.

How to read it. Section 1 is the look and ten commandments. Section 2 is every colour. Section 3 is shape language with numbers. Section 4 is a row for every prop kind, kit, character and ground element. Section 5 is water, coast and terrain. Section 6 is fog and clouds. Section 7 is the level-of-detail ladder. Section 8 is motion. Section 9 is what to delete. Section 10 is acceptance. The cheat sheet at the end is the page to pin up. Appendix A is the performance and memory budget with the machine-checked constants, Appendix B is the module plan, Appendix C is sources.

Units. `wpx` is a world pixel at zoom 1 (the iso pixel the code already uses: one tile is a 64 x 32 wpx diamond, `sx = (gx - gy) * 32`, `sy = (gx + gy) * 16 - z`; a tile edge is about 35.8 wpx long; heights are wpx). `spx` is a CSS pixel on screen, `dpx` a device pixel. A size in wpx becomes `size * zoom` spx. Zoom ranges 0.129 (the whole island fits) to 2.4 (the finest). Distances in water and coast rules are in tiles unless marked wpx.

## 0. Why this exists: what the author saw

The author's verdict on the previous pass was that the graphical changes were "virtually nonexistent", and named five failures: the water beside the land has no effort or consistency with the map; textures glitch on edges and inside each element; every graphical element is low quality; the fog is poorly rendered; and even at the finest zoom the detail "still leaves much to be desired". The target is "slightly away from the Google advertisement 2D paper aesthetic, towards Untitled Goose Game and Egg, Inc." The follow-up added two sentences that govern this whole file: the fog is "singular patches of blurred dots", and the ocean "is blue with squiggly lines in it, and appears static behind the map when it moves."

What the build at `adcd991` actually shows (read from the captures `coast-1.0`, `sea-0.5`, `locked-0.9`, `locked-0.5`, `finest-2.4`, plus a fit view and a 0.3 view taken for this document), and the cause of each:

| What you see | Why it looks like that | Where |
|---|---|---|
| Land is big flat olive diamonds with a stair-stepped zig-zag of sand tiles, no shaped coast, no slope, no foam | the land is a binary tile mask, each tile one flat colour with a same-colour stroke | `layout.js` land mask, `tcol`; `world.js` `drawGround` terrain loop |
| Sea is a vertical blue gradient with faint dashes and dust dots, and sits still behind the island when the camera moves | the sea is a 1 x 256 strip stretched over the window in screen space, 26 sine "squiggle" lines placed by window coordinates, 44 one-pixel glints at window positions | `world.js` `drawWater`, `seaStrip`, `SEA_STRIP` |
| Locked districts are a grey-blue wash with smudges, mud and dirty glass | a dark radial pool, nine blurred radial-gradient blobs per cloud sprite, and every colour pulled towards `#121826` | `lighting.js` `fogSprites`, `Lighting.fog`; `iso.js` `fogged`; `world.js` `FOG_DIM` |
| Murky permanent dusk, although the clock is at 09:00 and the grade is already plain white | the palette itself is dark and desaturated (ground olives, slate roads `#2f3644`), shadows are near-black ink `rgb(8,10,20)`, the day layer adds a navy vignette `rgba(6,10,24,.42)` (laid at 0.6 by day) | `layout.js` `cols`/`tcol`; `iso.js` `INK`, `shadow`; `lighting.js` `paintVignette`, `bakeDay` |
| Thin vector-ad flatness: one-pixel fences, rails, hairline windows, 1 px outlines | lines are used for form: `rimLight`, `courses`, `seams`, 0.8 to 1.6 px strokes, `lineWidth = 1` everywhere | `shading.js`, `props.js`, `iso.js` `windows` |
| Finest zoom: sharp boxes, faceless voxel dolls, flat yellow crane, hard-edged ellipse shadows | every prism is a plain `box()` with hard corners, `person()` is five rectangles, shadows are two ellipses of ink | `iso.js` `box`, `person`, `blob`; `props.js` `crane` |

The things worth keeping: detail that grows as you zoom in (the sprite cache is already built for it), the sixteen districts' identity hues, the isometric geometry, the cast-shadow direction (towards +gx), the entity and hit logic, the governor and the ground cache. We keep the engine and replace almost everything that is painted.

### 0.1 Touchstones (the spirit, never the assets)

We describe and imitate shape language, palette logic, lighting and finish. We copy no asset and no specific design. What public sources say, and what we take:

- Untitled Goose Game (House House). Public descriptions: flat colours, low-poly untextured models, a storybook feel borrowed from British children's television, townsfolk like faceless miniature figures, "we don't want to texture things". We take: big flat colour fields, a village that looks like a model, faces kept to the absolute minimum (two dots), no texture images, everything slightly silly.
- Egg, Inc. (Auxbrain). Public sources say only "crisp and colorful 3D graphics" and many hen-house and vehicle kinds. Our reading of the product, not a claim about its internals: chunky rounded buildings, saturated toy colours, clean gradients on glossy surfaces, characters with big heads and big simple eyes, a strong silhouette per building so each upgrade reads at a glance. We take: chunky rounded buildings whose tier is visible from the silhouette, saturated toy colour, glossy light on tops.
- Monument Valley. A 30 degree isometric grid and a disciplined small palette (three values per surface). We take: every material has three value steps and one accent, no more.
- Townscaper. A distorted grid of rounded, pastel buildings on a sea, tile-based generation that avoids visible lattices. We take: rounded coasts and shapes that do not look like a grid, pastel house colours on a calm sea.
- A Short Hike. Flat consistent shading, no anti-aliasing at its resolution, a soft outline that helps shapes stand out, "a readable, attractive world built from as few pixels as possible". We take: a soft tone-on-tone contour, and the discipline of reading at a distance.
- Dorfromantik. Its team wrote an art style sheet early (shapes, proportions, atmosphere, lighting, colours, textures, perspective) aiming for simple, warm, playful, never rigid or fussy, then checked new work against it. We take: this file is that sheet, and every pass is checked against it.
- Islanders and Mini Motorways. Minimal shapes carefully composed, colourful islands. We take: the island reads as a composed object from far away.
- Stylised toon water in games (depth-driven shallow-to-deep colour, foam shaped by noise along the shore, foam sometimes replacing waveforms entirely). We take all three, drawn procedurally in Canvas 2D.

## 1. The look in one paragraph, and ten commandments

**The look.** A small sunny island sitting in a warm turquoise sea, made of chunky, rounded, matte toys. Beaches are soft cream sand with a wet edge and a white foam line that scallops and breathes. Meadows roll in gentle light with tufts and flower dots. Houses are pastel, fat-eaved and round-cornered, with big friendly windows; towers are glassy and stepped; machines are fat and cheerful. One warm sun stands upper left and every shadow agrees, soft and violet-blue, never black. Edges are filled shapes and soft contours, never hairlines. People are round-headed dolls with two dot eyes. Locked districts sleep under thick, fluffy, lit clouds with blue bellies, not under a dark wash. The longer you look and the closer you zoom, the more crafted it gets: shingles, bricks, planks, grass blades, litter, faces. The default hour is a bright summer morning. It is not realistic; it is handmade, tactile, tidy and warm.

**The ten commandments.** Each is testable on a 1440 x 900 capture.

1. **Round it, bevel it, cap it.** No sharp-cornered box larger than 6 wpx on any side. Every prism gets a top-edge bevel and rounded vertical corners with radius `clamp(0.10 x min(w, d) in wpx, 1.5, 4)`; every pole, post and rail has a rounded cap; every roof edge has thickness and a rounded rim.
2. **One sun, one shadow.** One warm key light from the upper left at about 52 degrees; cast shadows run towards +gx (down and to the right on screen) with length `0.75 x height` at day; every shadow is the same cool violet `#4a3f88`, never black or ink; nothing stands on the ground without a contact patch.
3. **Saturated pastel, warm light, cool shade, no grey.** Light sides lean warm, shade sides lean violet-blue, the darkest dark anywhere is plum-navy `#2c2a56`, never pure black. Every neutral is tinted (concrete is lilac-blue, asphalt is slate-violet, pavement is cream).
4. **No hairlines.** The thinnest drawn line is `max(1.5 wpx, 1.25 spx / zoom)`: never thinner than 1.5 wpx in the world and never thinner than 1.25 spx on the screen. Form is made by filled shapes, value steps and bands, not by thin strokes. Contours are tone-on-tone (a darker, more violet version of the fill), 1.2 to 2 spx, only on silhouettes, and absent at far zoom.
5. **Read it at 24 pixels.** Every object is identifiable as a flat coloured silhouette 24 spx wide. Each material has three value steps (light, mid, shade) and at most one accent.
6. **Detail is earned by zoom and is additive.** Four bands (far, mid, near, close). A finer band only adds marks on top of the coarser picture; it never redraws a different picture, and it crossfades (+/- 15% of the threshold) so nothing pops.
7. **The land is a place, not a lattice.** No visible tile edges, no diamond staircase coast. Coasts are smooth shaped curves, ground has soft lighting and patches, paths are worn in.
8. **The sea is a world-space surface.** Every colour, band, foam curl, glint and ripple is defined in world coordinates, so it slides with the island when the camera pans and grows when it zooms; drift is a gentle extra on top. Wave motifs are intentional cartoon shapes, never squiggle lines.
9. **Daylight is the default.** The hour grade is plain white from sun hour 07:00 to 16:59 (the run starts at 08:00). Evening is gold and rose, night is periwinkle indigo with warm windows and lamp pools. Nothing is ever a murky grey-brown; the mean luma of a night capture is never below 0.34.
10. **Toys breathe, slowly, and can be still.** Motion is sparse, periodic and gentle (no loop under 1.1 s except a footstep), nothing flickers, and every loop stops under Calm, Off and reduced motion with the picture resting in its best-looking pose.

The test for any proposed change is one sentence: would this look at home in a sunlit model village built from soft plastic, painted by someone who loves it?

## 2. Palette

All values are sRGB hex. Names are the tokens `js/world/palette.js` (Appendix B) exports; a hex that is not in this section is not allowed in world drawing code (a colour computed from these by `mix`, `shade` or the face model below is allowed). The previous palette (olive `#4b7a4e` terrain, `#cdbb8e` sand, `#2f3644` asphalt, `#1b3b5c` sea, `#121826` fog) is retired in full.

### 2.1 The rules that generate every colour

1. **Ramps have five stops**: `hi` (sun-struck), `light`, `mid` (the body colour), `shade`, `deep`. A shade step is never just darker: it shifts hue 12 to 18 degrees towards violet-blue and keeps saturation (it rises 5 points); a light step shifts 5 to 8 degrees towards warm yellow.
2. **Face model (replaces `tone()`).** For a body colour `c`: top = `mix(c, '#fff7dc', 0.10)`; left face (sun side) = `mix(shade(c, 0.92), '#ffd9a8', 0.05)`; right face (shade side) = `mix(shade(c, 0.76), '#5a52a8', 0.16)`. The old factors 0.8 and 0.6 are retired; they made every shade side grey.
3. **Neutrals do not exist.** White is `#fffaf0` (warm), "black" is `#2c2a56`. Metal, concrete, asphalt and stone are the tinted ramps below.
4. **Accents are saturated and few.** A district uses its two accents (2.4) on signs, awnings, bands, flags and trim. Never more than three saturated hues in one building.
5. **A tint is never black.** A veil over the world (shadow, ambient occlusion, vignette, fog shade) is violet-blue `#4a3f88` to `#5c4c96`, or warm `#ffe9c8`. The ink colour `rgb(8,10,20)` (`INK`, `inkA`) is retired.

### 2.2 Named ramps

Format: `hi / light / mid / shade / deep`.

| Ramp | Values | Use |
|---|---|---|
| `SKY` | zenith `#6fb7ee`, mid `#9fd6f6`, horizon `#fdf3dc`, sun glow `#fff2bd` | the haze at the map's edge, the day air layer, the sun-side wash |
| `SEA` | foam `#fbfffe`, shoal `#c4f4e6`, shallow `#7be0cf`, lagoon `#43c8d0`, sea `#2fa6d6`, deep `#2b80cf`, abyss `#2358b0` (distance bands in 5.1) | all water; extras: crest `#e2faff`, trough `#2a6fc0`, caustic `#c8fff0`, sparkle `#ffffff`, ring `#eaffff` |
| `SAND` | `#fff4d2` / `#f9e1a6` / `#f0c985` / `#d9a869` / `#a67c6e`; wet `#c99a68`, wet sheen `#e8d2b0` | beaches, dunes, sandy lots |
| `GRASS` | `#c9ee7a` / `#a4dc66` / `#7cc65a` / `#4fa956` / `#2c7358`; cool shade `#3a8f62`; dry meadow `#d5e07a`; park lawn `#8fd68a` / `#6cc178` | meadows, lawns, tree and bush bodies |
| `BLOOM` | white `#fffbe8`, butter `#ffd84d`, pink `#ff9cc2`, lilac `#c9a6ff`, poppy `#ff6a55` | flower dots, tufts, planters |
| `SOIL` | `#e7b27d` / `#d29a64` / `#b87b4e` / `#8f5a3f` / `#5d3a2e`; tilled rows `#b77a4c` and `#8d5b3a` | dirt lots, fields, paths, plots |
| `ROCK` (warm sandstone, coast cliffs) | `#f2d6aa` / `#e0b98a` / `#c79b78` / `#9a766f` / `#6e5470`; strata line `#8f6a66` | cliffs below 40 wpx |
| `ROCKHI` (cool lilac, high plateaus) | `#e2d9ea` / `#c6bad6` / `#a597bd` / `#7c6e9c` / `#574b7a` | cliffs and slopes above 40 wpx |
| `ROAD` | `#8c91b2` / `#7d82a3` / `#6b7092` / `#585d7e` / `#474b69`; kerb `#efe6d2`; centre dash `#ffe27a`; lane edge `#fff8e2`; zebra `#fffaf0`; manhole `#5a5f80` | asphalt, always lighter than the grass is dark |
| `PAVE` | cream `#f4e8cf`, joint `#e0cfae`, plaza stone `#efdcc5`, red paver `#e8a58f`, cobble `#dcc4a4` / `#c8ae8c` | sidewalks, plazas, courtyards |
| `WOOD` | `#f7d9a4` / `#e8b872` / `#cc8f50` / `#9c6238` / `#6a4128` | planks, crates, benches, signs, decks |
| `BRICK` | `#f0a285` / `#e0795a` / `#c85f47` / `#98413f` / mortar `#f6dcc4` | campus, realty, chimneys |
| `PLASTER` | cream `#fff0d4`, peach `#ffd8b6`, mint `#cdeedc`, sky `#cfe6f7`, lilac `#e1d4f3`, butter `#ffe8a0`, rose `#ffc8d0` | house walls; each gets the face model |
| `TILE` (roofs) | terracotta `#e2704c` shade `#b84a3a`; teal `#3fb9b2` shade `#278c94`; plum `#a272c8` shade `#744c9e`; mustard `#f4bb3e` shade `#cb9022`; slate-blue `#7396d6` shade `#4d6cb4`; thatch `#e6c070` | the four roof hues plus slate and thatch |
| `METAL` | steel `#dfe6f4` / `#b2bed8` / `#8392b4` / `#5b6890`; brass `#f6c94f` `#d9a52c`; copper `#e89a6a`; rust `#c9693d`; corrugated white `#f3f6fc` | tanks, gantries, containers, machines |
| `GLASS` (day) | top `#b8e8fb`, mid `#78bdec`, low `#4d8fd6`; reflection `#ffffff` at 0.55; unlit pane `#4a6fb8` (never black); lit `#ffe08a` / `#ffc65c`; curtain `#f6b9c8` | windows, towers |
| `TOY` | red `#ff5f4e`, orange `#ff9a3a`, yellow `#ffd84d`, green `#52cf7c`, cyan `#3ad4e6`, blue `#4a8ff0`, violet `#9a6bff`, pink `#ff7fb8` | cars, containers, crates, signs, characters |
| `INK` | `#2c2a56` darkest, text ink `#3a2f5e`, soft contour `#5a4a8c` | the darkest dark, sign lettering, contours |

### 2.3 Light and shadow (every surface, every district)

| Term | Value |
|---|---|
| Key light | warm `#fff1c9`, upper left, about 52 degrees; tops are brightest, left faces take it, right faces do not |
| Fill (sky bounce) | `#bcd8ff` at 0.30, folded into the right-face blend `#5a52a8` (rule 2 above); never a separate pass |
| Rim | a filled band 2 wpx wide `#fffbe6` at 0.55 along the top edges the sun catches (back-left and front-left), and 1.2 wpx at 0.30 down the front vertical corner. Never a 1 px line |
| Ground bounce | lowest 18% of every right face lifts toward `#ffd7a0` at 0.12 |
| Cast shadow | direction +gx (unchanged); colour `#4a3f88`; core alpha 0.26, penumbra (0.2 tile wider) alpha 0.10; length 0.75 x height at day, 1.2 x at the golden hour, 0.5 x at night (moon) |
| Contact shadow | ellipse `#3b3374` alpha 0.30 narrow plus 0.12 wide, offset 0.22 radius away from the sun; nothing stands without one |
| Ambient occlusion | base-of-wall band 3 wpx `#5c4c96` at 0.22; under eaves 0.18; where two things meet, a 2 wpx band |
| Shadow on water | `#1c6fae` at 0.28 (5.9) |

### 2.4 Districts: the daylight palette for all sixteen

The district's identity hue comes from `palette[0]` in the data (`js/data/tier*.js`); the data stays as it is and is an input only. The daylight ground is the same hue lifted into a bright pastel (hue within 40 degrees of the data hue where the data colour has any saturation; luma at least 0.60; both machine-checked). `walk` is `mix('#f3e6cc', ground, 0.18)`. For every district: `ground.hi = mix(g, '#fffaf0', 0.28)`, `ground.alt = mix(g, '#6a5a9c', 0.12)` (the checker or stripe partner), `pad = mix(g, '#7a6aa8', 0.18)` (the stash yard), road asphalt = `mix(ROAD.mid, g, 0.10)`. `layout.js` stops deriving ground from the data palette's luma and reads this table keyed by theme.

| # | Theme | District | Data ground / accent | DAY ground | walk | accent | accent 2 | Roofs | Mood |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `scrap` | The Scrap Yard | #5b5b1f / #b5651d | `#f1cd8e` | `#f3e2c1` | `#f08a3c` | `#5b8bd0` | rust corrugated | sun-baked junkyard: ochre dirt, rust, cornflower blue, crane yellow |
| 2 | `market` | Flea Market Row | #c4571a / #ffc93c | `#f5b98a` | `#f3dec0` | `#ffc93c` | `#36b5a8` | striped canvas | bazaar of scalloped awnings: tomato, marigold, teal, pink on peach cobbles |
| 3 | `campus` | Campus Quad | #9b3b2f / #2f9e5b | `#eab5a4` | `#f1ddc5` | `#38c06f` | `#fff0d2` | slate-blue on brick | red-brick halls round a bright lawn quad: brick, cream trim, emerald |
| 4 | `pawn` | Pawn District | #0e6f6b / #e3b341 | `#8fdcd0` | `#e1e4cd` | `#f2c14a` | `#ff6fae` | flat, neon trim | mint-teal shopfronts with gold lettering and pink or cyan neon edging |
| 5 | `metro` | Metro Hub | #3d4f66 / #3b9bff | `#a9bfdc` | `#e6dfcf` | `#4aa6ff` | `#e8f2ff` | flat glass slabs | blue-grey city blocks, glass towers, azure signage |
| 6 | `estate` | Estate Sales | #6b2d5c / #f2e3c6 | `#dcb0d2` | `#efdccd` | `#f6e8c8` | `#e8c56a` | plum tile hip roofs | lilac gravel and clipped hedges, cream manors with plum roofs, gold trim |
| 7 | `auto` | Auto Row | #383b3f / #e63b2e | `#b0b8d6` | `#e7dece` | `#ff5a47` | `#f4f6fb` | white flat and saw | cool concrete forecourts, white showrooms, red banding, rows of toy cars |
| 8 | `harbor` | Harbor Docks | #14305a / #ff8c1a | `#a3bbd9` | `#e5dece` | `#ff9a2e` | `#2f5fa8` | navy saw-tooth | blue-grey quay, orange gantry and bollards, navy hulls, bright containers |
| 9 | `industrial` | Industrial Park | #4b5a6a / #f5c518 | `#adc0d8` | `#e6dfce` | `#ffd02e` | `#8aa0b8` | steel saw-tooth | pale steel-blue yards, safety-yellow bands, fat tanks and striped stacks |
| 10 | `tech` | Tech Corridor | #0a0f1c / #19e3f2 | `#c4d4f0` | `#ebe3d2` | `#22d9ee` | `#9a6bff` | white slabs, cyan strip | pale periwinkle plazas, slate-violet server halls, cyan and violet light |
| 11 | `farm` | Farmland Co-op | #2e6b34 / #e3b93c | `#9bdc7e` | `#e3e4be` | `#f1c243` | `#d9553f` | barn-red gambrel | fresh green fields in gold and green stripes, red barn, cream silos |
| 12 | `creative` | Creative Quarter | #9d1c6b / #8f5bff | `#f0b6dc` | `#f2ddcf` | `#9a6bff` | `#ff4fa3` | flat, confetti colour | pink-lilac studio streets, magenta and violet signs, yellow confetti |
| 13 | `corporate` | Corporate Valley | #2b6cb0 / #cfeaff | `#a8cdf0` | `#e6e2d2` | `#dff2ff` | `#3f8fe0` | flat glass | cerulean plazas, ice-blue and azure glass towers, fountain and flags |
| 14 | `finance` | Financial District | #1f6b4f / #0c1a24 | `#a8e0c4` | `#e6e5cb` | `#25b97a` | `#e2b441` | slate-green pediment | mint marble plazas, emerald, brass and ink lettering, bull statue |
| 15 | `realty` | Real Estate Row | #b8553a / #f0d2a8 | `#f1b59a` | `#f3ddc3` | `#f6dcb5` | `#e8795a` | terracotta tile gable | peach and coral terraces, terracotta roofs, sand trim, for-sale signs |
| 16 | `exchange` | Global Exchange | #c8a02c / #14110a | `#f3dc8e` | `#f3e4c1` | `#f7c948` | `#2b2417` | ink and gold pediment | champagne plazas, gold, ink-brown lettering, flags, the turning globe |
Notes. `finance` and `exchange` carry near-black data accents (`#0c1a24`, `#14110a`); in daylight those are ink lettering (`#1c3a38`, `#2b2417`), not fills. `tech` is not dark: it is pale periwinkle plazas with slate-violet halls, and cyan and violet are lights, which show at day as saturated enamel and at night as glow.

### 2.5 Crate colours by tag

A crate or lot item takes the colour of its asset's first tag (`TAG_COLOR` in `world.js`). All 32 are light and saturated, none under luma 0.5 (machine-checked):

`tool` `#b5c0d6`, `office` `#f4eed8`, `prestige` `#a98be0`, `paper` `#fff0cf`, `retro` `#e8a15a`, `electronics` `#6bc4e8`, `vehicle` `#ff7a63`, `consumer` `#ff8fb3`, `trend` `#ff5fb8`, `scrap` `#b79a78`, `industrial` `#c9ad7a`, `training` `#5fd08c`, `digital` `#8ae8ff`, `b2b` `#7e93e6`, `franchise` `#ffd96a`, `infra` `#9a8ce0`, `food` `#ffb066`, `farm` `#b4dc6a`, `bulk` `#d2bf93`, `marine` `#5cb9e8`, `collectible` `#f2c94c`, `luxury` `#c9a0f2`, `fashion` `#ff8fc0`, `ip` `#a98cff`, `media` `#f06cc0`, `realty` `#ee9a7a`, `finance` `#5fd69e`, `energy` `#ffe05a`, `medical` `#f2f8ff`, `home` `#d8b48c`, `outdoor` `#7cd07a`, `gem` `#78eed8`.
### 2.6 People

Shirts (12): `#ff6a55` coral, `#ff9a3a` tangerine, `#ffd84d` sunflower, `#7bd36a` leaf, `#3ad4b6` teal, `#4aa0f0` sky, `#7f7bf0` periwinkle, `#b383f0` grape, `#ff7fb8` pink, `#f2f0e6` cream, `#e85a8a` raspberry, `#8fe0e8` aqua. Hair (6): `#3a2a22`, `#6b3f24`, `#b9772c`, `#e8c36a`, `#8a8fa8`, `#2e2a4a`. Skin (6): `#ffdcb8`, `#f3c08f`, `#dca070`, `#b97a4e`, `#8e5836`, `#6b3f2a`. Pants (5): `#4a5a9a`, `#6b5a8f`, `#3e6b73`, `#8a6a4a`, `#d8cdb8`. Cheeks `#ff9aa8` at 0.35, eyes `#2c2a56`. The player is always a tomato-red jacket (`#ff5f4e`), cream scarf, and a beanie with a paperclip pin: unique on the island, readable at far zoom.

### 2.7 The day, evening and night grade

The sun hour is `sunHour(hour) = (hour + 8) mod 24` (unchanged). The run starts at 08:00, so the first thing anyone sees is full daylight.

| Phase | Sun hour | Multiply tint | Air and shadow |
|---|---|---|---|
| Day (default) | 07:00 to 16:59 | none (white) | warm haze from the top `#fff6df` at 0.10 fading by 40% of the height, sun wash upper left `#fff2bd` 0.10, cool wash lower right `#6a8fe0` 0.06; shadows `#4a3f88` 0.26 at 0.75 x height; no dark vignette |
| Golden evening | 17:00 to 19:59 (peak 17:50) | `#ffd0a0` x `dusk`, fading as night comes on | rose wash at the top `#ff9aa8` 0.14; shadows 1.2 x height, colour `#7a3f7a` 0.30; windows begin lighting one by one; lamp pools amber `#ffe9a8`; sea horizon turns peach |
| Night | 20:00 to 03:59 | `#8c98de` at full night (luma 0.61; the old `[105,125,185]` is retired) | moon rim `#c8d8ff` on tops, windows `#ffd98a`, lamp pools, sea deep indigo with moon glints; mean luma of a night capture at least 0.34 |
| Dawn | 04:00 to 06:59 (peak 06:06) | `#ffd0a0` fading to white | pink-gold wash, shadows 1.2 x |
| Rain (credit crunch) | by event | multiply `#c4d0e8` | desaturate toward `#b8c4dc`; sea loses sparkle; rain streaks 1.5 wpx minimum |
| Trend surge, tariff | by event | none | pink wash `#ff3da8` at 0.05 (was 0.07); tariff edge `#ff5040` at 0.05 |

Colour never reaches black in any phase; the grade is built from multiplies and washes in the palette above, in the existing baked-layer pipeline (Appendix A).

## 3. Shape language, with numbers

Everything is chunky: wider and shorter than real, soft at every corner, one clear idea per object. Sizes are wpx at zoom 1 unless a column says otherwise. "Contour" means the tone-on-tone silhouette outline of 1.2 spx (mid), 1.6 spx (near), 2 spx (close), none at far, clamped to 0.8 to 3.0 wpx; its colour is `mix(shade(fill, 0.62), '#4a3f88', 0.20)`. Interior edges get value steps and bands, never contours.

### 3.1 Numbers per family

| Family | Silhouette and proportion | Bevel and radius | Detail rules | Contour and shadow |
|---|---|---|---|---|
| Houses, shops, halls (`bldg`, `hall`, `manor`, `rentrow`, `stall`) | wide and low: a house is 2.4 to 3 tiles wide and 28 to 44 wpx high; roof is 28 to 40% of the wall height | vertical corners radius 3, top-edge chamfer 2.5 (the `clamp` rule of commandment 1), plinth band 3 wpx in `PAVE.joint` at the base | eaves overhang 0.18 tile (about 6 wpx) on gable and hip, 0.10 on flat; flat roof slab 4 wpx thick with rounded rim radius 2; ridge cap 3 wpx wide, rounded; chimney 0.28 x 0.28 tile with a cap ring; downspout 1.6 wpx | contour 1.6 spx near; cast shadow 0.75 x h; contact 0.30 |
| Windows | 0.30 of the face width and 0.44 of the cell height; 2 to 4 columns on a 3-tile face | corner radius 0.16 of the window width; frame 1.4 wpx `#fff4de`; sill 2 wpx plus a 1 wpx shade under it | day glass is a top-to-bottom gradient `GLASS.top` to `GLASS.low` with a diagonal reflection band 22% wide at 0.55 white; unlit pane `#4a6fb8`; lit `#ffe08a`; mullion cross 1.6 wpx at near | no contour; the frame is the edge |
| Doors | 0.20 of face width, 0.50 of height, arched top (radius half the width) | frame 1.6 wpx; step 3 wpx | knob 1.2 wpx brass, number plate at close | none |
| Towers (`tower`, `ipo`, `office`, `bank`) | stepped: lower mass 100% width, upper mass 82% width, rounded crown | corner radius 3 to 4, crown ring 3 wpx | glass bands in 3 columns, horizontal mullion bands 2 wpx tone-on-tone, one diagonal sun streak per face, antenna with a 2 wpx ball tip | contour near; shadow 0.75 x h (long and soft) |
| Industrial (`factory`, `tank`, `silo`, `stack`, `containers`) | fat: a tank is 1.6 tiles wide and 36 to 46 high; stacks taper 14% | cylinders have domed lids (ellipse cap plus 3 wpx dome), rounded base ring; container posts radius 2 | corrugation as filled ridges 2.5 wpx, bands in accent, ladders with 2.4 wpx rounded rungs | contour near; shadow as buildings |
| Roads (`drawRoads`, block avenue and cross street) | avenue 2 tiles wide, cross street 2 tiles, sidewalks 1 tile each side | kerb 0.18 tile cream band both sides, rounded kerb returns of radius 0.9 tile at every junction | centre dashes 0.35 tile wide, 0.9 long, gap 0.8; lane edges 0.12 tile `#fff8e2`; zebra bars 0.22 tile wide; paver joints every 1 tile at near; drains and manholes at close | no contour; the kerb is the edge |
| Trees (`tree`) | lollipop: canopy is 55% of the total height; trunk 0.12 of canopy width, tapering, rounded foot | puffs round (circles), trunk cap round | small tree (scale up to 0.8): 3 puffs; standard: 5 puffs plus one crown puff; big (1.2 and over): 7 plus crown; puff radius 0.32 to 0.42 of canopy width; one crescent highlight on the upper-left of each puff (`GRASS.hi` at 0.5), one crescent shade on the lower-right (`GRASS.deep` at 0.35); bark highlight 1.6 wpx; pines are 3 rounded tiers 1.0 / 0.74 / 0.5 wide; palms 5 curved fronds | contour near on the canopy mass only; contact shadow wide |
| Bushes, hedges, planters | blob of 3 puffs; hedge top is scalloped every 0.35 tile | radius equals the puff | flower dots (2 to 3 wpx, 5 petals at close) from `BLOOM` on 1 in 3 bushes | contact only |
| Characters (`person`) | doll: total height 34 wpx (player 42; the present `person()` is 29, the player 38, so a doll is about a fifth taller and much rounder). Head circle 0.40 of height, torso capsule 0.30, legs 0.20 stubs, round feet; torso width 0.34 of height; arms capsules 0.07 wide, 0.26 long, round mitt hands 0.06 | everything is a circle or capsule, no rectangle | eyes are dots 0.07 of height, 0.12 apart, `#2c2a56`; cheeks ellipses 0.07 `#ff9aa8` 0.35; mouth a 0.05 arc; hair or hat is a cap shape 0.46 wide; faces appear at near and close only; at far a character is a 5 x 8 spx pill in its shirt colour; squash and stretch: standing scale Y 1.00 +/- 1.5%, stop squash Y 0.92 / X 1.06, hop stretch Y 1.08 / X 0.94 | contour near and close in `#5a4a8c` at 0.55; contact shadow 7 wpx radius |
| Crates and lot items | rounded cube 0.72 tile, 17 high; pallet 0.8 tile, 4 high | edge chamfer 1.6, corner brackets | three filled plank slats and two brackets; stencil mark at near; class "peeker" on top at close (4.4) | contour near; contact |
| Street furniture (lamps, benches, signs, bollards, fences, flags) | fat poles 3.6 wpx wide, taper 10%; pickets 3.5 wpx wide with rounded or pointed caps | ball caps radius 2.2 | no pole under 3 wpx at any zoom; a 1 px post is a fault | contour near; contact |
| Cars, trucks, boats | toy capsules: car 1.1 x 0.56 tile body with a glass dome cabin; truck cab and box with a rounded bed; boat hulls rounded with a bow curl | radius 3 | round wheels with hub dots; windows pastel glass; boats have bow foam and wake | contour near; contact; boats cast onto the water (5.7) |
| Clouds | puffs of radius 22 to 64 wpx, flat-bottomed banks, domed tops | all circles | body `#f7f9ff`, belly crescent `#c3d1f2`, top crescent `#ffffff`, rim 1.5 wpx `#e9f0ff` | no contour; ground shadow `#5a5fa0` 0.16 |

### 3.2 Recipes (what "rounded" means in a Canvas 2D iso renderer)

These are the constructions to use so two artists get the same shape.

- **Rounded prism.** Draw the three faces as now (`box()`), then (a) round the top face's four corners with `quadraticCurveTo` through the corner point at radius `r` (in ground units, `r / 32` tiles), (b) add the sun-side rim band along the top-left and front-left edges (width 2 wpx, `#fffbe6` at 0.55) inside the face, (c) add a 1.2 wpx lighter vertical strip down the front corner, ending in a rounded cap at both ends, (d) add the base AO band (3 wpx, `#5c4c96`, 0.22) on both faces, (e) fill the face gradient (`wallGradient`, recoloured to the violet and warm ends of 2.1). Cost rule: (a) to (e) are drawn only when a sprite is built, never per frame.
- **Gable roof.** Rounded-rim slab: two roof planes with 0.18 tile eaves, 4 wpx thick with a darker underside strip (`shade` 0.78) under the front eave, a 3 wpx rounded ridge cap in `TILE.light`, tile courses as alternating filled bands 3 wpx tall (`TILE.mid` and `TILE.light`, joined with a 1.5 wpx `TILE.shade` band every 4th) from the mid band; at close, individual shingles as scallop-ended rounded rectangles 4 x 3 wpx in staggered rows, each with a hashed value jitter of +/- 4%.
- **Window.** Frame rounded rectangle (radius 0.16 w), glass gradient, reflection band, cross mullion, sill plate, optional shutters (0.35 w each side, lilac, mint or butter), optional flower box at close (5 puffs and 3 blooms) or curtain (`#f6b9c8` triangle in a corner).
- **Awning.** Six stripes on the face, alternating district accent and cream, with a scalloped valance (scallop radius 3 wpx) and a 2 wpx shadow under it.
- **Tree.** Contact shadow ellipse (wide, 0.30), trunk (tapered, rounded foot, bark highlight), then puffs back to front, each: flat body circle, shade crescent, highlight crescent; crown puff last. A tree is one sprite per variant (five greens by hash), blitted; only the sway is live (8.1).
- **Character.** Shadow, legs, torso with a shade crescent on the right, arms, head circle, hair or hat cap, eyes and cheeks (near and up), contour. Built from capsules so one character costs about 14 path fills; at far a 5 x 8 pill.
- **Cloud puff.** Circle body, offset circle clipped for the belly crescent (down-right), offset circle clipped for the top crescent (up-left), 1.5 wpx rim. See 6.
- **Foam scallop.** A run of circular bites along a curve: scallop wavelength `w` in 36 to 52 wpx (hashed), depth `0.28 w`, joined by tangent arcs, filled white, with a 1.5 wpx `SEA.shoal` fringe on the water side.
- **Wave crest.** A lens: two arcs of radius `r` meeting at tapering tips, length 14 to 26 wpx, thickness 3 wpx at the middle, filled `SEA.crest` at 0.55 (5.2).
- **Cliff band.** A face strip divided into 3 to 5 strata, each a filled band with a wavy top edge (amplitude 1.5 wpx, wavelength 18 to 30), colours stepping from `ROCK.light` down to `ROCK.shade`, a `ROCK.strata` line of 1.5 wpx between bands (never thinner), a rounded lip of grass overhang 3 wpx at the top.

### 3.3 What a hairline is (and what to do instead)

A hairline is any stroke under 1.5 wpx, any 1 dpx line, any dashed line with a dash thinner than 2 wpx. Where a design wants a fine line:

| You wanted | Draw this instead |
|---|---|
| mortar between bricks | alternating filled bands 3 wpx tall (`BRICK.mid` and `BRICK.light`) with a 1.5 wpx `BRICK.mortar` band every 4th; pattern fill at near, individual bricks at close |
| plank joints, siding | filled slats with a 1.5 wpx `shade` strip between |
| window glints and sills | a filled reflection band and a 2 wpx sill plate |
| a fence | 3.5 wpx pickets, 3 wpx rails, 5 wpx posts with ball caps |
| rails on a bridge | 3 wpx rounded rails on 4 wpx posts with ball caps |
| a grid on a plaza | pavers: alternating `PAVE.cream` and `PAVE.joint` tiles with a rounded 1.5 wpx joint |
| a lane marking | a painted band 0.12 tile wide minimum |
| shingle, tile courses | the roof recipe above |
| an outline | the tone-on-tone contour above, or nothing |

## 4. Element-by-element redesign

One entry per thing. Every entry keeps its footprint, hit shape and hot spot exactly as in `layout.js` and `kits.js`; only what is painted changes. "Sig" lists the two or three signature details that make it itself. Every prop gets the face model (2.1), a contact shadow, and the cast shadow of 2.3 unless it says otherwise. Entries marked (not placed) exist in `DRAW` but no kit places them today; they are specified so that a future kit, or a test that draws every kind, gets the right art.

### 4.1 Street, yard and landmark props (the `DRAW` table, simple kinds)

- **`gate`** (a locked district's gate: barrier, bridge leaf, ferry). Three variants, one language: chunky hazard furniture. Barrier: a candy-striped boom arm of eight rounded segments (`TOY.orange` and cream), two fat bollard posts (`ROAD.mid` with ball caps), a small gatehouse hut with a rounded roof and a gold padlock plate (rounded rectangle, keyhole), two warning lamps that pulse softly (3.2 s), two traffic cones. Bridge leaf raised: a thick plank deck with rounded edges tilted 26 degrees, yellow and plum chevron bands, counterweight blocks, chain rails with ball posts, two lamps. Ferry: a pontoon dock and a stubby white ferry (blue stripe, round portholes, little cabin, fender, flag), bobbing and moored when locked with a plank sign "NOT RUNNING", wake rings and a slow crossing when open. Sig: the padlock plate, the stripes, the cones. Shadow: contact ellipses, cast of the arm.
- **`lookout`** (a footpath's end). A timber deck of rounded planks (`WOOD.mid` and `light`, 1.5 wpx shade gaps), posts with ball caps and a rail, a bench, a brass telescope on a tripod, a small flag. Close: a cup on the rail, a pair of binoculars. Sig: the telescope, the ball-capped rail.
- **`board`** (the market board, a hot hit shape). A cheerful roadside sign: two thick wooden posts with round caps, a rounded panel (radius 4) in the district's `accent` with cream lettering (bold, rounded, high contrast; the text stays crisp), a row of bunting triangles along the top (accent and cream) at near. At night a warm lamp glows over it. It replaces the dark slab with cyan text. Sig: bunting, the rounded panel. Shadow: posts and panel.
- **`crane`** (the scrap yard crane, 118 high). A chunky yellow A-frame tower (`METAL` brass-yellow ramp `#ffd84d / #f4bb3e / #cb9022`), lattice of 3 wpx rounded struts, a round white-windowed cab, a jib with red-and-cream warning stripes at the tip, a counterweight block, a taut cable ending in a red magnet disc that carries a coloured crate. Sig: the cab, the striped jib tip, the swinging magnet. Shadow: long and soft; the trolley and hook move (8.1). Replaces the flat yellow strokes.
- **`scrap`** (scrap heaps). A mound of rounded junk in layered chunks: a fridge, two tyres, bent sheet panels, a bike wheel, pipes, a bucket, coloured rust `#c9693d`, teal `#3fb9b2`, cornflower `#5b8bd0`, ochre `#d4c070`, each with a highlight crescent. Close: rivets as 2 wpx dots, flaking paint blotches, a toaster, a rubber duck on top. Sig: the wheel, the duck. Shadow: the heap's footprint ellipse, penumbra wide.
- **`tires`** (tyre stacks). Fat tori: each tyre an ellipse ring with a lighter inner hub (`#5a5f80`), scalloped tread edge, deep plum `#3d3a5c` (never black) with a highlight arc; stacks of 3 to 5 with a gentle wobble offset, one painted cream tyre in a pile of three or more. Sig: the wobble, the one painted tyre.
- **`barrel`** (oil drums). Rounded drums in `TOY` red, blue, green or mustard, two rolled ribs as raised 3 wpx bands, a lid ring, a sheen strip. The burning barrel carries a cartoon flame of three rounded teardrop tongues (orange, yellow, cream) bobbing 1.1 s, a warm light pool and two drifting sparks. Sig: the ribs, the flame.
- **`crates`** (loose crate stacks, 1 to 3). Chunky wooden crates in `WOOD`, rounded cube, three filled plank slats and two corner brackets, a stencil arrow or cup at near, slight stacking offset. Sig: the brackets, the stencil.
- **`junkcar`** (not placed). A toy car wreck: capsule body in `#d0714a`, `#5b8bd0`, `#8fc06a` or `#b07ac0`, one missing door, flat tyres, a weed tuft growing through the bonnet, rust as filled blotches. Sig: the weed, the missing door.
- **`deadtree`** (not placed). A friendly bare tree: thick tapered round-capped branches 3 to 5 wpx, warm grey-brown `#a47c68` with a light side, a bird perched, three gold leaves left. Sig: the bird.
- **`fence`**. Pickets 3.5 wpx wide with rounded or pointed caps, spacing 0.36 tile, height 14 to 18, two 3 wpx rails, 5 wpx posts with ball caps, in cream or the district's trim colour, with a slight sag between posts; close: nail dots (2 wpx) and a wood-grain band. Sig: caps and posts. Replaces the 3 px sticks and 2 px rails.
- **`lamp`**. A tapered round pole 3.6 wpx (`ROAD.mid`) with a curved arm and a cream globe, a base cap and a base ring; at night the globe glows and a warm pool lies on the ground (existing light pool, recoloured `#ffe9a8`). Close: a small banner clip. Sig: the globe.
- **`neonlamp`**. As `lamp` with an accent-coloured glass globe (glossy highlight dot at day), a soft ring halo at night (round glow sprite, 3.6 s pulse of +/- 12%). Sig: the coloured globe.
- **`tree`**. See the tree rules in 3.1 and the recipe in 3.2. Five greens by hash, three sizes, 3 to 7 puffs, sway live. Per district a different species mix: pines (campus, estate), round lollipops (metro, realty), palms (harbor beach edges, pawn), orchard apples with red dots (farm). Sig: the highlight crescents and the round crown.
- **`bench`**. Three filled `WOOD.light` slats on two curled steel arms (rounded, `METAL`), a back rail, a soft shadow; close: a pigeon on one in the campus kit. Sig: the curled arms.
- **`planter`**. A rounded cream stone box (radius 3, rim highlight band) with a mound of 5 foliage puffs and 2 to 3 blooms from `BLOOM`. Sig: the blooms.
- **`topiary`**. Three stacked clipped puffs (ball, cone or spiral by hash) on a tiny trunk in a terracotta pot with a rim band, highlight crescent. Sig: the pot and the cone shape.
- **`hedge`**. A clipped hedge block, top scalloped every 0.35 tile, `GRASS.shade` with a highlight band, 3 wpx rounded corners, a few blooms. Sig: the scalloped top.
- **`pillar`** (not placed). A fluted classical column: three filled flutes per face, a round capital and base in cream stone `#f3ead6`, cylinder shading in three bands. Sig: the capital.
- **`flag`**. A white pole with a ball finial and a three-segment cloth with rounded corners in the district accent plus a trim band; 2.1 s ripple (8.1). Sig: the ball finial.
- **`lantern`**. A paper lantern: an ellipse in the accent with two rib bands, a tassel, on a hook pole; sways +/- 2 degrees over 3.4 s; a glow at night. Sig: the ribs and tassel.
- **`shop`** (not placed). A pastel corner shop 1 x 1 tile: counter, scalloped awning, open shutter, baskets of goods as coloured round shapes, a plank sign, a small lantern. Sig: the awning and baskets.
- **`tank`**. A fat storage tank: domed lid, vertical seam bands, a ladder with rounded rungs, a railing, a connecting pipe with rounded elbows, `METAL` steel-blue with a safety-yellow ring band in `industrial`, pale accent elsewhere, a sheen strip. Sig: the ring band and dome.
- **`silo`**. A grain silo: a cylinder with a dome cap, corrugation rings as 3 wpx bands, a cream or pale-blue body, a ladder, a small door. Sig: the rings.
- **`stack`**. A tapered smoke stack in three rings (accent, cream, accent), a rounded rim; smoke is round puffs (circle with a lit top crescent) rising for 3.2 s, spawned every 0.8 s, at most 4 per stack. Sig: the rings and the puffs.
- **`fountain`**. A two-tier round stone basin with a bevelled rim, the water in `SEA` shallow and lagoon, a central jet with arcing droplets (round dots, 1.6 s cycle), ring ripples, a few coins at close. Sig: the arcs and ripples.
- **`helipad`**. A round slab disc in `ROAD.mid`, a rounded yellow H and a cream ring, four corner lights, a windsock. Sig: the H and windsock.
- **`cart`**. A wooden handcart: a rounded box bed heaped with fruit (round dots red, orange, green), two big spoked wheels, scalloped canvas awning stripes, handles. Sig: the heaped fruit.
- **`neonpole`**. A tall pole with a rounded sign plate: by day pastel enamel with gold numerals, by night neon (soft glow halo, no flicker). Sig: the plate.
- **`polesign`**. The auto row's tall pole sign: a rounded red plate (`#ff5a47`) with cream "AUTO", a small lamp above. Sig: the plate.
- **`gantry`**. Harbor: a chunky orange A-frame of rounded struts, a boom with trolley, a spreader holding a rounded container; at `creative` it is the slimmer camera crane in the accent. Sig: the hung container.
- **`ship`**. A cargo ship: a rounded navy `#2f5fa8` hull with a red waterline stripe, a white bridge with round portholes, a striped funnel, coloured container stacks, bow foam and a V wake on the water; bobbing 5.5 s +/- 1.2 wpx with a 1.5 degree rock. Close: rope coils, life rings, a flag. Sig: the portholes and the wake.
- **`bollard`**. A fat rounded mushroom post in the district accent with a white band. Sig: the band.
- **`dome`**. A tech radome: a white dome with segment bands, a small door, a glowing cyan slit that slides slowly (14 s), a rounded base ring. Sig: the slit.
- **`dish`**. A satellite dish: a big rounded white bowl tilted on a bracket with a feed arm and ball, pastel base; it nods slowly (14 s, +/- 3 degrees). Sig: the feed ball.
- **`billboard`**. A billboard: a rounded panel on two chunky posts, a row of round bulbs along the top, the accent as background with cream lettering; in `creative` a slow gradient sweep (12 s). Sig: the bulb row.
- **`spot`**. A searchlight: a round lamp can on a post with a glass lens (glint at day), at night a soft cone beam with rounded edges swinging over 9 s; none at day. Sig: the lens.
- **`windmill`**. Farm: a cream round tapered tower, a red cap, four rounded lattice sails turning once per 9 s, a door, flowers at the base. Sig: the sails.
- **`hay`**. A round bale lying on its side with a spiral swirl band, gold `#f1cb62`, a few wisps; sometimes a square bale. Sig: the spiral.
- **`ticker`**. Finance and exchange: a wide rounded sign on posts with a deep-green panel (`#24433f`, not black) scrolling pastel green and coral text at 40 wpx/s (still under reduced motion), a brass frame. Sig: the scrolling text.
- **`statue`**. The bull: chunky gold `#f6c94f / #d9a52c / #a8741c` on a stone plinth with a plaque, upswept horns with highlights, a sparkle glint every 3 s. Sig: the horns and the glint.
- **`forsale`**. A post with a hanging board, two chains, white and accent-red plank lettering "FOR SALE". Sig: the chains.

### 4.2 Buildings and landmarks (the layered `DRAW` kinds)

These are sprites (`layer()` in `props.js`), built once per zoom and band and blitted, so they can afford the craft; the detail that is not the same at every zoom is an overlay (7.3). Every building casts the shadow of 2.3 (0.75 x its height towards +gx), has a 3 wpx base AO band and a contact patch, and stands on a plinth band; a building's shadow is part of its sprite.

- **`bldg`** (the general building: houses, shops, every district's headquarters). The rounded prism of 3.2 with the roof, windows, doors, awnings and signs of 3.1. Wall materials: `plaster` (the 7 pastels, with a 3 wpx hashed weathering blotch in the shade colour at close), `brick` (`BRICK` bands, mortar bands), `boards` (filled slats with 1.5 wpx gaps), `glass` (the window language across the whole face), `metal` (vertical ribs 2.5 wpx and a sheen band). Roof kinds: flat, gable, hip, saw (rounded teeth with glass quads), pediment. Features by flag: `clock` (a round cream clock on a rounded cupola, hands at close), `doors` (rounded roll-up or arched), `balc` (a 2 wpx cream balcony band per floor with a rounded rail), `awn`, `band`, `bars` (rounded window grilles in pawn), `studio`, `neon` (sign lettering as a soft tube glow at night, enamel at day), `sign` (rounded plank, raised letters). Always: a plinth band, a downspout, one chimney on 45% of gable roofs. Sig: fat eaves, friendly windows, the sign plank.
- **`hall`** (the bank of finance, the fx hall of exchange). A wide cream marble block on a two-step rounded plinth, 5 to 7 round columns with three-band cylinder shading and round capitals, a triangular pediment with a gold relief (a coin, a rising sun) in the tympanum, a gold lettering band, a rounded arched door with steps, banners on the corners, slate-green or ink roof. Sig: the columns and the coin in the pediment.
- **`exchange`** (the Global Exchange hall). The `hall` in champagne `#f3dc8e` with an ink-brown roof, plus a large turning globe on a pedestal on the roof (ocean `SEA.sea`, continents as soft rounded blobs in `GRASS.light`, meridian bands in gold; rotation 9 s, still at rest), a gold halo ring, flags on the corners. Sig: the globe.
- **`rack`** (tech server halls). A chunky slate-violet block (`#6a7ab8` ramp) with rounded corners, a face of rows of rounded drawer panels each with two LED dots (cyan, green, amber; a soft 3.6 s blink, still at rest), two round cooling fans on the roof turning slowly (6 s), a cable bundle with a rounded elbow, a label plate. Night: LEDs glow. Sig: the fans and the drawer rows.
- **`shack`** (the scrap yard headquarters). Mismatched corrugated panels in rust, teal and cream with a slanted roof weighted by two tyres, a pipe chimney with a smoke puff, a round porthole window with a cross, a hand-painted plank door sign, a string of bulbs along the eave. Sig: the tyres on the roof and the bulb string.
- **`depot`** (freight depot, one per district). A warehouse in the district's `depot` hex lightened 25%, three rounded roll-up doors, loading-dock bumpers, a striped yellow bay, round roof vents, a "FREIGHT" plank sign, two pallets of crates beside it. The tariff overlay (red bands) stays and is recoloured `#ff5040`. Sig: the roll-up doors and the plank sign.
- **`tower`** (metro and corporate glass towers). The stepped tower of 3.1: blue-cyan glass gradient, horizontal mullion bands, a diagonal sun streak per face, a rounded crown ring, an antenna with a ball tip; windows light one by one at evening. Colours by hash from `GLASS`, cerulean `#4a8fb0`, periwinkle `#5a7ab0`. Sig: the streak and the antenna ball.
- **`ipo`** (IPO and M&A tower, 186 high). The tallest building: three setbacks in pale-blue glass, a gold crown with a large golden bell in an arched opening, a spire, an aircraft lamp (steady, soft 3 s pulse), flags on the terraces. Sig: the golden bell.
- **`office`** (the regulatory office). A civic stone block in lilac `#a9b2d6` with a small cupola, a scales-of-justice relief, wide steps, an "AUDIT" plank, a flag. Sig: the scales relief.
- **`bank`** (the commercial bank). A chunky stone bank in mint-cream, four columns, a round vault door with a gold wheel on the face, a green scalloped awning, a coin sign. Sig: the vault door.
- **`manor`** (estates). A grand cream manor, a plum tile hip roof with two dormers, symmetrical wings, a bay window, two chimneys, a balustrade, steps, climbing roses (pink dots) on one wall, lilac shutters. Sig: the dormers and the roses.
- **`barn`** (farm). A big red barn, a gambrel roof with a rounded bend, cream X-braced doors, a hayloft hatch with a bale peeking, board bands, a rooster weather vane that swings 6 s, white trim. Sig: the X doors and the vane.
- **`factory`** (industrial). A saw-tooth roof in steel-pastel with a safety-yellow band, two stacks with round puffs, a big round-top door, pipes with rounded elbows, an attached tank, a row of glass windows, a conveyor as a filled band. Sig: the saw teeth and the yellow band.
- **`stall`** (flea market stalls). A wooden-framed canvas stall, a scalloped striped awning (accent and cream, `awn`/`awn2`), a counter with goods in three variants (fruit baskets, fabric rolls, pots) as coloured round shapes, a price flag, a tiny lantern. Sig: the scalloped awning and the goods.
- **`kiosk`** (metro). A small round-cornered pod with a glass top, an accent "M" sign, a thin overhang disc roof. Sig: the glass pod.
- **`podium`** (estates auction). A lectern and gavel on a plum-carpeted dais, two brass stanchions with a rope of ball ends, a flower vase, a banner. Sig: the gavel and the stanchions.
- **`autos`** (car rows, n 3 to 6). Toy cars: capsule bodies in `TOY` colours with white, red, yellow, teal and blue varied by seed, a glass dome cabin, round wheels with hub dots, headlights, a small price flag on the windshield; even spacing, shadow ellipses. Sig: the dome cabins and flags.
- **`containers`** (harbor). Shipping containers in `TOY` red, blue, yellow, teal, orange and green, corrugation as filled ridges 2.5 wpx, rounded corner posts, door lock rods, stencil numbers at close; stacks of up to 3 with small offsets. Sig: the ridges and the colour variety.
- **`rentrow`** (property row). A terrace of 4 or 5 narrow houses in coral, peach, mint, butter and rose, gable roofs in `TILE`, bay windows, tiny steps, numbered doors, window flower boxes, chimneys, a "TO LET" sign. Sig: the colour rhythm and flower boxes.

### 4.3 District kits and sprawl (the `KITS` and `FILL` tables)

One paragraph per kit. Each lists the block's signature scenery, its ground treatment (what `decals(A)` lays), and the sprawl (`FILL`, `padDecal`) that fills its pad. Colours come from 2.4. The decals below replace every hairline decal in `kits.js` (9).

- **`scrap`** (1, The Scrap Yard). Ochre dirt, cornflower and rust junk, yellow crane. Block: the `crane`, `scrap` heaps (8), tyre stacks, burning barrels, crates, `junkcar` wrecks and `deadtree` friends where room allows, a fence of cream pickets. Ground: dirt with soft puddles (turquoise ellipses with a white glint) and darker oil blotches; speckle as small pebbles at close. Sprawl: heaps and tyres. Mood: scruffy and warm, the starting underdog.
- **`market`** (2, Flea Market Row). Peach cobbles under scalloped striped awnings in tomato, marigold, teal and pink. Block: two rows of `stall` (3 goods variants), `cart` rows, crates, `lantern` strings. Ground: warm checker cobbles (`PAVE.cobble` pair) and a painted stripe band at least 0.25 tile wide. Sprawl: crates and carts. Mood: festive and busy.
- **`campus`** (3, Campus Quad). A lawn quad ringed with red-brick halls. Block: the brick library with a clock cupola and "LIBRARY", the lab, a `fountain`, pines and round trees, `bench`es, `flag`s. Ground: mowed lawn with light and dark stripes (alternating 0.55 tile bands, `GRASS.park` pair), a brick-pink paver path. Sprawl: trees and benches. Mood: sunny and studious.
- **`pawn`** (4, Pawn District). Mint-teal shopfronts, gold lettering, neon in pink or cyan. Block: three `bldg` shops with barred windows and neon, a `neonpole`, crates. Ground: wet-looking pavers with pink, gold and cyan reflection smears (filled bands 0.35 tile) and two puddles. Sprawl: crates. Mood: cheeky and a little seedy, never grim.
- **`metro`** (5, Metro Hub). Blue-grey blocks, glass, azure signs. Block: a glass `tower`, the `billboard`, a `kiosk`, `planter`s, `bench`es, small round trees along the avenue. Ground: square pavers (alternating cream and joint). Sprawl: trees and planters. Mood: clean and busy.
- **`estate`** (6, Estate Sales). Lilac gravel, clipped hedges, cream manors with plum roofs. Block: `manor` (two), the auction `podium`, `topiary`, scalloped `hedge`, `pillar` pairs. Ground: lilac lawns with pale gravel pads and soft stripes. Sprawl: topiary and trees. Mood: genteel.
- **`auto`** (7, Auto Row). Cool concrete forecourts, white showrooms, red banding. Block: the showroom `bldg`, `autos` rows, the `polesign`, the repair shop with `tires`. Ground: bays painted as filled white bands 0.14 tile wide minimum, red-and-cream kerb stripes. Sprawl: tyres and car rows. Mood: shiny and tidy.
- **`harbor`** (8, Harbor Docks). Blue-grey quay, orange gantry and bollards, navy hulls. Block: the `gantry`, a `ship` in the basin, `containers`, a customs `bldg` with a saw roof, `bollard` rows. Ground: the harbor basin is real water (`SEA` ramp, 5.1) with a quay edge in `PAVE` and an orange kerb. Sprawl: containers. Mood: busy and breezy; gulls here.
- **`industrial`** (9, Industrial Park). Pale steel-blue yards, yellow bands. Block: the `factory`, two `tank`s, a `stack`, a second factory. Ground: broad pavers in alternating steel tints, yellow-and-cream hazard kerb. Sprawl: tanks, stacks, crates. Mood: heavy but friendly: fat shapes, no menace.
- **`tech`** (10, Tech Corridor). Periwinkle plazas, slate-violet server halls, cyan and violet light. Block: `rack` halls, a `dome`, a `dish`, `neonlamp` rows. Ground: pavers with a glowing cyan inlay (filled band 0.18 tile at 0.35 alpha, a slow soft pulse 5 s along it), no hairline grids. Sprawl: racks and dishes. Mood: bright lab by day, glow at night.
- **`farm`** (11, Farmland Co-op). Fresh green fields in gold and green stripes. Block: the `barn`, a `silo`, the `windmill`, `hay`, cream `fence`. Ground: crop rows as filled stripes 0.55 tile wide in two greens and wheat gold, a worn dirt yard. Sprawl: hay, apple trees, silos. Mood: pastoral.
- **`creative`** (12, Creative Quarter). Pink-lilac studio streets, magenta and violet signs, confetti. Block: the studio `bldg` with a neon "ON AIR", `billboard`s with the slow gradient sweep, two `spot`s, the camera `gantry`. Ground: pastel pink and lilac checker, yellow confetti dots (3 wpx rounded, close only). Sprawl: spots and billboards. Mood: playful.
- **`corporate`** (13, Corporate Valley). Cerulean plazas, ice-blue glass towers, a fountain and flags. Block: stepped `tower`s, the `fountain`, `flag` rows, `planter`s. Ground: large square pavers with soft light stripes (0.07 alpha bands), no grid hairlines. Sprawl: planters and towers. Mood: confident and calm.
- **`finance`** (14, Financial District). Mint marble plazas, emerald, brass and ink. Block: the `hall`, the `ticker`, the bull `statue`, planters and topiary. Ground: marble checker (cream and mint) with a brass inlay band 0.2 tile. Sprawl: planters and topiary. Mood: dignified, warm.
- **`realty`** (15, Real Estate Row). Peach and coral terraces, terracotta roofs. Block: `rentrow`, the `forsale` sign, three gable houses with balconies, trees. Ground: lawns, light-coral pavers. Sprawl: houses and trees. Mood: homely.
- **`exchange`** (16, Global Exchange). Champagne plazas, gold, ink lettering. Block: the `exchange` hall with its globe, the `ticker` (FX), `flag` rows, `planter`s. Ground: a gold-ringed plaza medallion (two concentric rings 0.25 tile wide) and champagne pavers with brass bands. Sprawl: planters. Mood: grand, sunny, the summit.

### 4.4 Entities: characters, stock, pipelines, vehicles (drawn live from game state)

Entities are drawn each frame by `drawEnt` and friends; their art is built from cached part sprites (a character is a pre-drawn body per look and facing, blitted, plus live bob and blink), so the new detail costs nothing per frame beyond blits.

- **The player** (`drawPlayer`, `person`). A 42 wpx doll: tomato-red jacket `#ff5f4e`, cream scarf, denim pants `#4a5a9a`, a beanie with a paperclip pin (a 4 wpx silver clip shape, the game's emblem), two dot eyes and a small smile. Under the feet, not a yellow ring but a soft golden disc (radius 15, `#ffd36e` at 0.30, a lighter inner disc at 0.45) that breathes 2.8 s, plus a small chevron floating 12 wpx above the head at far and mid zoom (it replaces the flat ring at far zoom). Idle: bob 2.8 s +/- 0.8 wpx, blink every 3 to 6 s (80 ms). Moving: step cycle 0.45 s, body bob 1.2 wpx, footprint puffs as round dust (8.1). Sig: the beanie pin. Shadow: contact ellipse 7 wpx.
- **Buyers** (`drawLead`, `person`, `lookOf`; 101 buyer kinds in `config.js`). The same 34 wpx doll body, differentiated by `lookOf` from the palettes of 2.6 (12 shirts x 6 hair x 6 skin x 5 pants, hashed from the lead id) plus an accessory by role. The accessory is chosen by the buyer's strongest `like` tag, in families:

  | Top tag | Accessory |
  |---|---|
  | tool, vehicle, industrial, scrap | hard hat or cap, a wrench or a rag in a back pocket |
  | office, paper, training | glasses, a satchel, a book under the arm |
  | prestige, luxury, gem, collectible | top hat or fascinator, a scarf |
  | retro, home, media | beret or bowler, a scarf, headphones (media) |
  | electronics, digital, ip, infra | headset, a tablet under the arm |
  | trend, fashion, consumer | bold cap, sunglasses on the forehead, a shopping bag |
  | finance, b2b, franchise, realty | tie and a briefcase |
  | medical | a white coat, a cross badge |
  | food, farm, bulk, outdoor | apron or straw hat, a basket |
  | marine, energy | a flat sailor cap or a hard hat, a coil of rope |

  The 17 named originals override the rule: `student` backpack and beanie, `barista` apron and cap, `mechanic` overalls with a wrench, `collector` monocle and bowler, `scrapper` hard hat, `cyclist` helmet and a bike bell on a handlebar stub, `bookstore` glasses and a stack of books, `trainer` a whistle, `boutique` a scarf and bag, `smelog` a clipboard, `etailer` a parcel, `recruiter` a tie and badge, `freelancer` headphones and a laptop sleeve, `entIT` a lanyard, `holdco` a briefcase, `vcstart` a hoodie, `franchisor` a visor. An urgent buyer (`lead.need`) bounces: arm waving 1.2 s period and a golden pulse disc under the feet (as the player's but warmer `#ffb347`), never a flat ellipse. A buyer who leaves walks away with a small wave. Noticing: a buyer within 3.5 tiles of the player turns their head and body toward the player and hops 6 wpx once over 0.35 s, then every 20 to 40 s while the player stays near (8.1). Faces: eyes and cheeks always, mouth by state (neutral, smile after a sale, small "o" when urgent, flat when haggling hard). Far zoom: a 5 x 8 spx pill in the shirt colour, golden if urgent. Sig: the accessory, the face, the hop.
- **Crates in stock** (`drawAsset`) and **lot crates for sale** (`drawLot`). The rounded crate of 3.1 in the colour of 2.5. A lot sits on a wooden pallet (three stringers, 4 high). Condition: `broken` crates have a diagonal crack as a filled 2 wpx band, a cream tape cross, and a drooping corner; auction lots wear a gold rope loop and a small brass bell (it swings 4 s). A selected crate stands in a soft golden pool (radius 22, 0.30, no ring line) and bobs 2.2 s +/- 2 wpx. At close, a "peeker" sticks out of the top by tag family: a spanner (tool), a book (paper, training), a radio (retro, electronics), a bike wheel (outdoor, vehicle), a dress (fashion), a gem (gem, luxury), a leaf bunch (farm, food), a laptop (digital), a small bag of coins (finance), a lamp (home). The peeker is a 10 wpx rounded toy, one colour from 2.5. Sig: the stencil, the pallet, the peeker. The hit polygons stay the same boxes.
- **Pipeline buildings** (`drawPipe`, the three manager roles). Their height grows by level (`26 + 13 x level`, unchanged); the art grows with it: each level adds a rounded floor band, level 4 adds a roof garden of 3 puffs and a flag, level 8 a gold crown ring. Roles: *Supply-Chain Student* is a cosy study pod in `PLASTER.mint` with a `TILE.teal` roof, a small globe and a stack of books on the sill; *Asset Broker* is a golden-trimmed brokerage in `PLASTER.butter` with a brass `TILE.mustard` roof and a rolling ticker band; *Logistics Agent* is a blue loading shed in `PLASTER.sky` with a rounded roll-up door and a little truck mural. Paused or audited pipelines drop to `#b8b4cf` (a cool grey-lilac) with a "zzz" cloud puff, never grey `#6a707c`. Running pipelines have a rounded vent with round smoke puffs. At near zoom a tiny worker doll stands at the door (idle bob) when running. The old emoji glyph on the wall (`fillText(K.icon)`) is retired; the role is told by colour, roof and mural. Sig: the role colours and the growing floors.
- **Empty plots** (`drawPlot`). A fresh-dug patch: a soft `SOIL.light` square with rounded corners, four stakes joined by yellow-and-cream tape (a 3 wpx band, rounded), two traffic cones (rounded), a small sapling and a toy shovel at close; the "+ Hire" chip stays UI. Locked plot: the same patch frosted lilac with a padlock plate. The dashed 2 px outline is retired. Sig: tape and shovel.
- **Trucks** (`drawTruck`). A toy freight truck: a rounded white box with a blue stripe and a rounded bed, a cab with a glass dome, round wheels with hub dots, a flashing amber beacon only at night (soft pulse), a small exhaust puff trail (round). Held at the border during customs with the beacon lit. Sig: the cab dome, the stripe.
- **Cars** (`drawCar`, the road traffic). Capsule toy cars in `TOY` colours with a glass dome, hub-dotted wheels, headlights at night; fade in and out at the road ends as now. Sig: the dome.
- **Hover and selection** (`drawHover`). A cream 3 spx outline with a soft amber 6 spx halo under it (as now, recoloured `#fff4de` and `#ffb347` at 0.34) and a rounded join; the crate ring on the ground becomes a soft disc. Never a pure white 1 px rule.
- **Particles** (`fx.js`). Coins are round gold discs with a face stamp and a spin; sparks are four-point stars 4 to 7 wpx in `#fff2bd` and `#ffd36e`; puffs are round cartoon puffs with a lit top crescent; rings are two concentric soft rings, 2.5 wpx minimum, flattened to the ground plane; the ambient dust is pollen (round motes 2 to 3 wpx, only at zoom 0.7 and over, none in Calm). Replaces the rect motes and the 1.5 px streak rain minimum.

### 4.5 Ground, roads, pavements, decals

- **Block ground** (`D.ground` kinds `block`, `walk`, `road`, `pad`). The district block is the daylight `ground` with a soft inner glow (an inner stroke of `ground.hi` 5 wpx wide at 0.18, not a dark outline: the black 1.5 px block stroke is retired); the sidewalk bands are `walk` with paver joints at near; the stash yard `pad` is `pad` with a rounded rectangle border painted as a 3 wpx band of `ground.hi` (it replaces the 1 px `rgba(255,255,255,.28)` rectangle). The block is a plateau that sits on the terrain with a 3 wpx raised rim on its outer edge, so districts read as little stages.
- **Roads between districts** (`drawRoads`). Ribbons that follow the ground: `ROAD.mid` asphalt with a 0.18 tile cream kerb on both sides, rounded joins at every bend (round the polyline with a circle at each vertex as now, but kerb-wide), a painted centre dash 0.35 tile wide, 0.9 long, gap 0.8, in `ROAD`'s `#ffe27a` (it replaces the `rgba(255,211,110,.7)` 1.6 px dashes); footpaths `#e8d2a8` with pebble edges. Closed (locked) roads are `ROAD.light` cooled by 10% and show a roadblock cone pair at the gate, not a darker road. Sig: kerb and centre dashes.
- **Crossings and junction marks** (`drawMarks`). Zebra bars 0.22 tile wide in `#fffaf0` (replaces the half-transparent white bars), with a rounded kerb return at the corners and a tiny pedestrian-light post at close. Stop lines 0.12 tile wide.
- **Pavements** (`walks`). Cream pavers, 1 tile each, joints as 1.5 wpx `PAVE.joint` bands only at near and close; kerb highlight band on the sun side.
- **Decals** (`drawDecal` kinds). `rect`: soft-cornered paint and patches (radius 2 wpx), never a 1 px outlined rectangle. `ell`: puddles and patches as filled ellipses with a lighter inner ellipse and one 3 wpx glint dot; no stroke. `stripes`: crops, lawn mowing bands, hazard kerbs, at least 0.25 tile wide. `checker`: cobbles and marble as filled squares with a 1.5 wpx rounded joint. `grid`: retired as hairlines; becomes paver tiles with joints. `spk`: speckle becomes pebbles and confetti, round 2 to 3 wpx, close only. `pulse`: becomes a slow soft glow band (5 s), no flickering rects. `water`: a real water body in the `SEA` ramp, drawn by the same code as the sea (5.1), never wavy lines.
- **Bridges** (`drawBridge`). A plank deck of rounded boards (`WOOD.mid` and `light`, 1.5 wpx shade gaps), cream kerbs, 3 wpx rounded rails on 4 wpx posts with ball caps every 3 units, two chunky pier legs with a stone cap and a foam collar where they meet the water. A broken (locked) bridge ends in a splintered but friendly rounded stub with a "closed" barrier. Sig: ball-capped rails and foam collars.
- **The ferry route** (`e.ferry`). A line of soft round buoys (6 wpx, red and cream) every 1.5 tiles in place of the 2 px dashed line; the route glints.

### 4.6 Water, coast, beach, cliffs, plants, clouds

These have their own sections because they are the author's first complaint: water and coast in 5, fog and clouds in 6. Row summary: **water** is a world-space surface with a depth gradient, wave bands, crests, curls, glints and rings (5.1 to 5.3); **coast** is a smooth shaped shoreline (5.4); **beach** is a wet-to-dry sand band with shells and driftwood (5.5); **cliffs** are strata faces with a grass lip and a foam skirt (5.6); **boats** are `ship`, the ferry, a rowing boat and a sailboat on the lake with wakes (5.7); **trees and plants** follow 3.1 and 4.1 (`tree`, `planter`, `topiary`, `hedge`, flowers, tufts, reeds, palms); **clouds** over locked districts are 6.

## 5. Water, coast and terrain

This section is the author's first complaint and carries the most weight. Binding requirements are marked MUST. Technique notes marked "hint" are one way to meet a requirement within the budget of Appendix A; any technique that meets the look and the budget is allowed.

**The principle.** The sea is not a backdrop. It is the floor of the same world the land stands on. Every pixel of it is a function of world position (a point on the water plane `(gx, gy)`, drawn at sea level `z = 0` through the same camera transform as the land) plus a gentle independent drift. If the camera pans 300 wpx, a wave crest moves exactly 300 x zoom spx with the island. If the camera zooms, crests, foam curls and glints grow and shrink with the island. Today's `drawWater` runs in screen space under the identity transform (`ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` before it) and positions its lines by window coordinates; that is the fault. The new water draws under the camera transform, after nothing and before the ground.

### 5.1 The sea: depth, not a gradient

MUST: the sea colour is a function of the distance from the nearest shore, measured on the water plane, in tiles. `d_tiles = hypot(dx, 2 dy) / 45.25` where `dx, dy` are world-pixel offsets (the factor 2 undoes the 2:1 iso squash; 45.25 wpx is one tile along a plane diagonal axis).

| Band | `d` (tiles) | Colour | Character |
|---|---|---|---|
| foam | 0 | `#fbfffe` | the white line (5.4) |
| shoal | 0 to 0.8 | `#c4f4e6` | pale mint, sand showing through |
| shallow | 0.8 to 2.5 | `#7be0cf` | clear turquoise |
| lagoon | 2.5 to 6 | `#43c8d0` | saturated aqua |
| sea | 6 to 14 | `#2fa6d6` | open bright blue |
| deep | 14 to 28 | `#2b80cf` | deeper cobalt |
| abyss | 28 and beyond | `#2358b0` | far sea; the darkest water is a rich blue, never navy-grey (luma 0.32) |

Between stops the colour is `mix` with a smoothstep; the shoal-to-shallow shelf is a visibly softer, brighter band 0.6 tile wide (it is the "turquoise ring" the eye reads as a beach shelf). The depth bitmap carries 5% extra saturation over the first 3 tiles so the shallows glow.

Hint (revised after review): rasterise the island silhouette (land tiles at their heights plus cliff walls down to the waterline) into a 1/10 scale mask in world pixels and take an exact Euclidean distance transform of it (Felzenszwalb and Huttenlocher, two passes, y doubled: a chamfer metric has a few percent of angular error and shows as an octagon at the finest zoom), built once, lazily, in slices. Extract contours of that one field with marching squares, Chaikin-smooth them twice and keep them as `Path2D` chunks in world pixels. **Draw the depth as flat fills of the bands between 24 contour levels, each band overlapping its neighbour by one device pixel, never as a bitmap drawn to the window**: a one-texel-to-ten-world-pixel bitmap is a 13.5 times smoothed upscale, which costs 9.4 ms of a window at density 1.5 against 1.0 for a 1:1 copy (RENDER_PLAN section 6, `scripts/diag/unitcost.mjs`). The shoal and shallow bands, the foam line and the wave levels come from the same contours, so they are crisp at every zoom and agree to the pixel. Lakes, bays and rivers are in the silhouette as water, so they get shoal edges and a deeper middle automatically. Because it is measured from the drawn silhouette, a cliff coast's waterline is the wall's base, where the foam and shoal begin.

MUST: no screen-space gradient, no strip stretched over the window, no screen-space sea layer of any kind. The horizon haze of 5.10 is drawn in world space too.

### 5.2 Wave bands, crests, curls, glints, rings

The sea has six layers of motif on top of the depth colour (numbered below). All are intentional cartoon shapes, laid out in world space, repeated seamlessly by hashing, never lines of sine.

1. **Wave bands** (follow the shore). Soft, slightly lighter ribbons that run parallel to the coast at distances 2, 4, 6, 8, 10, 12, 14, 17, 20, 24, 28 and 34 tiles (twelve levels). Each is a broken ribbon: long dashes 60 to 140 wpx (hashed, rounded caps, fixed in world space) with gaps of 40 to 90 wpx; width `max(6 wpx, 1.8 spx / zoom)` of `SEA.crest` at 0.45 over a 2.4 x wider soft underband of the same colour at 0.12. Three ridges travel shoreward at once, each crossing all twelve levels in 24 s, so the brightness of level k is `b_k = min(1, sum over r of tri(k - u_r(t)))` with `u_r = (12 - 12 x frac(t / 24 s) + 4 r) mod 12`, `tri(x) = max(0, 1 - |x|)`, and both strokes' alphas (0.45 core, 0.12 under-band) are multiplied by `b_k`. That cross-fade makes the bands appear to roll in without any line moving relative to the world. At rest (reduced motion) `t = 0`. Hint: the twelve levels are iso-contours of the same distance field, extracted once with marching squares and smoothed (Chaikin, twice), stored as `Path2D` in world pixels, chunked by 1,024 wpx cells and drawn only for chunks in view.
2. **Crests** (the motif). A lens: two arcs meeting at tapering tips, length `14 + 0.9 d` wpx (max 26), 3 wpx thick at the middle, and never smaller on the screen than 14 spx long and 3 spx thick (so the world size is `max(14 + 0.9 d, 14 / zoom)` and `max(3, 3 / zoom)`: at the 0.5 gate a lens of 3 x 14 wpx would be 1.5 x 7 spx, the size of the dashes the author dislikes; curls are at least 8 spx across and glints at least 3), `SEA.crest` at 0.55, long axis parallel to the local shoreline (perpendicular to the depth gradient). Hashed on a world grid of 6 x 6 tile cells, 0 to 2 per cell, positions and orientation from `h2(cellX, cellY, k)`. Eight pre-rotated sprites, two mirrored.
3. **Curls** (the accent). A foam curl: a 270 degree arc 7 to 10 wpx across ending in a round dot, `SEA.foam` at 0.8, one per 3 cells on average, only where `d` is between 1 and 12 tiles. They sit in the shallows near the shore and a few near boats.
4. **Glints and rings** (the sparkle). A four-point star 3 to 6 wpx (`#ffffff`) twinkling over 2.4 to 4.0 s, at most 40 on screen, placed in the sun side of crests (upper left of each crest); and expanding rings (two concentric ellipses flattened 2:1, `SEA.ring`) spawned near boats, jetties, the harbor, the fountain and at random in cells, one per 6 s per ring source, radius 4 to 16 wpx over 2.4 s.

Seamlessness. Cells are hashed from world coordinates only, so the pattern never tiles, never repeats visibly and never depends on the camera. No texture image, no `CanvasPattern` of a repeated tile for motifs (a tiling pattern is allowed only for the soft sheen below, whose feature size is over 20 tiles).

5. **Sheen** (the big light). Two large soft diagonal light bands (`#ffffff` at 0.07 and `#6a8fe0` at 0.06, each 30 to 60 tiles wide) drifting across the water plane at one tile per 9 s, so the sea has a slow breathing of light that is independent of the camera. At rest they stand at their `t = 0` place.
6. **Caustics** (close only, in the shoal and shallow bands). Dappled light: 3 to 4 round blobs 5 to 9 wpx in `SEA.caustic` at 0.20, drifting 6 wpx per 5 s, in a fixed world pattern.

At far zoom the wave bands are wider than they are long and the picture leans on the depth bands, the foam and the sheen, not on strokes (a stroke costs about 8 ms per megapixel; at most 10,000 device pixels of band length are stroked a frame, and the sheen is two or three flat translucent bands, never a gradient fill, which is 7.6 ms).

LOD of the sea (7.2): far has depth colour, three wave levels (4, 10, 20 tiles, widened), the foam line and the sheen; mid adds all twelve levels and the crests; near adds curls, glints and rings; close adds caustics and a second, finer foam trail.

### 5.3 Anchored and alive: how it is verified

MUST, and checked by exit code (`node scripts/world-metrics.mjs DIR --anchor` exits 0 only when every pair of the rig's `--set pan` is anchored: the pan pair, the zoom pair with the detail compared at matching world scales, and the drift pair drawn 2 s apart; 1 for a sea that stayed on the screen, 2 when it proved nothing): with motion frozen (reduced motion, or `vt = 0`), the sea pixels of a second capture, taken with the camera moved by `(dx, dy)` wpx at zoom `z`, equal the first capture shifted by `(-dx z, -dy z)` spx to within 1 dpx, for any crest, curl or foam scallop that is in both frames and away from labels and the screen-space haze. With motion on, the same crest is displaced by the camera shift plus at most the drift (sheen 1 tile per 9 s, ridges as above): drift never exceeds 0.1 tile per second. Capture the same scene twice at two camera positions a few hundred pixels apart and match a named crest or foam curl by hand as the eyeball check.

### 5.4 The coast and the foam line

MUST: a shaped, smooth coast. No diamond staircase, no zig-zag sand tiles.

- **Shape.** The coast is a smooth closed curve per landmass derived from the tile land mask (`LAYOUT.land`) and smoothed: tile edges are blurred (3 x 3 binomial on the vertex field), contoured, and Chaikin-smoothed twice. The smooth coast may fill concave notches and round convex corners, but MUST NOT retreat more than 12 wpx from the tile-edge coast, and NEVER over a road, footpath, bridge end, district block, pad or prop footprint (those tiles are held fully land before smoothing). `LAYOUT.land`, `isLand`, `zAt`, bridges and routes are unchanged: the smooth coast is drawn, never consulted by logic.
- **Foam.** A white scalloped ribbon along the waterline: core width 5 wpx (`#fbfffe` at 0.95), scallop wavelength 36 to 52 wpx (hashed), depth 0.28 of the wavelength; behind it, a thin trailing foam line (3 wpx, `SEA.foam` at 0.55 fading to 0 over 1.4 tiles offshore) that breaks into dashes of 80 to 160 wpx. The foam breathes: it advances and retreats 0.35 tile (about 11 wpx) over a 6.5 s period, with the phase shifting 0.12 of a cycle per tile along the coast so the swash travels along the beach. At rest it stands at mid swash.
- **Wet sand.** On the land side of the foam a wet-sand band (`SAND.wet`, 0.35 tile wide, with a `SAND.wetSheen` highlight band along its outer half at 0.30) that widens and narrows with the swash by 0.2 tile.
- **Shore shadow.** Under the foam on the water side a soft contact shadow `#1c6fae` at 0.18, 0.6 tile wide.

### 5.5 The beach

Land whose ground height is under 3 wpx and within 1.6 tiles of the coast is beach. Ramp across it, from the water in: wet (0 to 0.35 tile), damp (0.35 to 0.7, `SAND.mid`), dry (0.7 to 1.6, `SAND.light` to `SAND.hi`), blending to meadow over a further 0.5 tile with a hashed noise edge (scalloped, not straight). Dressing at near and close, hashed per tile: shells (3 wpx, cream and pink), pebbles (2 wpx, lilac), driftwood (a 12 wpx rounded log), beach grass tufts (4 blades), starfish (5 wpx, `TOY.orange`), the occasional footprint pair, palms in harbor and pawn, a striped parasol and a towel at one or two spots near district 1 (the starting beach). None of it sits within 2 tiles of a road, pad or prop.

### 5.6 Cliffs

Where the coast is higher than a beach the ground meets the sea in a cliff. MUST: strata, a grass lip, and a foam skirt; never a flat brown wall.

- Face: 3 to 5 strata bands each with a wavy top edge (amplitude 1.5 wpx, wavelength 18 to 30 wpx), stepping from `ROCK.light` (warm sandstone) at the top to `ROCK.shade` at the foot (the cool lilac `ROCKHI` ramp above 40 wpx), separated by 1.5 wpx `ROCK.strata` lines (never thinner), with a few 5 to 8 wpx rounded rock bumps hashed along the face.
- Lip: a rounded grass overhang 3 wpx high in `GRASS.shade` along the top edge, with `GRASS.hi` tips.
- Foot: a foam skirt (the foam of 5.4, doubled in width, with three or four splash bumps of 6 wpx per tile) and a plunge shadow in the water `#1f5fa8` at 0.35, 0.6 tile wide; the wall is lighter on the sun side (left faces) and violet on the shade side.
- Smoothness: the face follows the smooth coast curve, not tile edges, so a curved cliff is a curved ribbon (the faces are drawn as quads between points of the smoothed contour lifted by the terrain height). Cliff faces are tinted by the district's ground at 8% where they border it, so a cliff under Harbor Docks is cooler than one under Farmland.

### 5.7 Boats and life on the water

MUST (these exist already): `ship` (4.1), the ferry (`gate`), and the harbor basin. SHOULD: a small white sailboat with a coloured sail that loops the lake (a 6 tile loop in 90 s, tilting +/- 3 degrees, a V wake of two foam bands), a rowing boat tied at the lookout `v2`, 6 red-and-cream buoys marking the ferry route and the harbor mouth, and gulls (3 at far and mid zoom circling a coast district, one per coast district at near; flap 0.5 s, glide loop 60 s). COULD: ducks on the lake, a fisher on the jetties. Boats cast onto the water: a contact shadow `#1c6fae` at 0.30 and a ring ripple every 2.4 s. Every one of these is cosmetic: not selectable, not in the object list, and stopped under Calm, Off and reduced motion.

### 5.8 Land: soft light, never a tile

MUST: no visible tile edge, lattice or flat diamond field at any zoom. The land is lit, textured and dressed as one continuous surface.

- **Colour field.** One colour per terrain vertex (the 191 x 141 vertex grid of `LAYOUT.ZV`), computed once by a pure function `terrainColour(i, j)`: biome by height (beach under 3 wpx, meadow 3 to 30 wpx in `GRASS.mid` to `GRASS.light`, hill 30 to 70 in `GRASS.shade` toward `ROCKHI`, plateau above 70 mixing to `ROCKHI.light`), steep slopes (over 6 wpx) mix to rock; the district ground blends in with a smooth falloff over 8 tiles (`ground` from 2.4, weight `smoothstep(1 - d/8)` capped at 0.8), the region tint at 10% (`REGIONS` tints lifted to `#c8a45a`, `#6fa8d8`, `#9bd06a`, `#e8d08a`), two octaves of low-frequency patch noise (+/- 6% value, hashed from world position), and slope lighting from the upper left: faces whose height falls toward the lower right are lit (warm `#ffe9b8` at up to 14%), faces rising to the lower right are in shade (violet `#5a52a8` at up to 18%). Never the old olive `#4b7a4e`.
- **Tiles never show.** A tile is filled with the bilinear blend of its four vertex colours: far and mid as one flat fill of the average, near as 2 x 2 sub-quads, close as 4 x 4 with +/- 2% micro-noise. Each tile is overdrawn by 0.6 wpx on its outer edge so no hairline gap shows at any zoom or dsf (verify at 2.4 and dsf 2).
- **Patches and paths.** Large soft patches of a second green (dry meadow `#d5e07a`, deeper `#6cc178`), 4 to 10 tiles across, with rounded blobby edges, drawn as filled shapes under the dressing; worn paths between district ports (the roads draw over them; footpaths are `#e8d2a8` with a lighter centre).
- **Dressing** (near and close; hashed per tile; never on roads, pads, props or within 1 tile of the coast; drawn into the ground cache only, never per frame while the camera moves): grass tufts (3 to 5 curved tapered blades 4 to 7 wpx tall in `GRASS.hi`, `mid`, `shade`, four sprite variants), flower dots from `BLOOM` (2 to 3 wpx, clusters of 2 to 5), clover pads, pebbles (2 to 4 wpx, lilac), tree stumps, mole hills at close. Budget: at most 1,500 dressing marks per frame. When the camera moves the dressing is skipped and the base lit terrain stands alone; the dressing fades in over 150 ms after rest.
- **District plateau.** The block of each district has a raised 3 wpx rounded rim of `ground.hi` and a soft contact shadow on the surrounding terrain (`#4a3f88` at 0.14, 0.8 tile wide), so a district reads as a little stage on the hills.

### 5.9 How the island sits on the sea

MUST: the island does not look pasted on. Three effects, all in world space:

- **Contact glow.** A bright shallow-water halo around the whole coast: `SEA.shallow` and `SEA.shoal` from the depth map already provide it; add a 2.5 tile wide `#8ff0dc` at 0.25 glow in the first band, fading outward.
- **Island shadow.** A soft shadow cast onto the water towards +gx (down and to the right on screen): the coast silhouette offset by 0.5 tile towards +gx, `#1c6fae` at 0.28, feathered over 1.2 tiles, only on the shade-facing coasts (south and east), and absent in the sunlit north-west.
- **Reflected light.** Near the coast on the sun side (north-west), a 1.5 tile band of `#e2faff` at 0.12 (sun glitter on the shoal).

### 5.10 The horizon haze at the map's edge

The sea does not end at the window. Beyond `LAYOUT.bounds` it continues as sea in world space (the draw area is extended 1,400 wpx past the bounds) and fades into haze. The sea FILLS THE VIEW with the haze colour first (one `fillRect` under the world transform), and whatever is finite (the depth fills, the haze's own ramp, a bitmap of any kind) is drawn over that fill, so no pixel of the opaque canvas is ever left unpainted: a phone's 390 x 844 fit view shows 8,962 world pixels beyond the bounds above and below, a tablet's 768 x 1024 shows 4,500, and 1,400 is only enough at 1440 x 900. `world-metrics.mjs DIR --unpainted` on the `--set extent` shots at those sizes is the check. Haze is a function of world position, so it slides with the map: from the bounds outward the sea mixes toward `SKY.horizon` (`#fdf3dc` warmed with `#cfeaf4` in the cooler half) with `a = smoothstep(0, 1, distanceBeyondBounds / 1400) x 0.85`, plus a vertical term that thickens with world `y` above the island (farther away: `a += smoothstep(bounds.y0 - 200, bounds.y0 - 1400, y) x 0.35`). At the fit zoom the window shows more than the bounds, so a viewer sees the island in turquoise, then blue, then a warm pale haze to the edge. No black vignette, no navy foot (the old `paintVignette` and `bakeAir` foot are retired).

### 5.11 Other water: lakes, rivers, the harbor basin

Every body of water, including the `water` decal in the harbor block and the lake and rivers carved from the land, uses the same depth ramp, motifs and glints as the sea, scaled to the body: shoal at the banks, aqua in the middle (a small pool reaches `lagoon` at its centre), crest lenses at near, rings from boats. Rivers flow: their wave bands drift downstream at one tile per 6 s. No wavy lines, no separate "water" look.

### 5.12 What the sea costs

Measured, not assumed (RENDER_PLAN section 6; every figure at density 1.5, the contract): the sea and the shore cost 3.5 ms at the working zoom (3.9 moving), not the 2.0 of the first plan, whose legacy gradient strip alone is 1.9. The depth bands are flat fills (about 1.0 ms of a window of water), the wave bands at most 10,000 device pixels of stroke (0.8), motifs are small blits at 2.5 microseconds each (a window's 300 to 600: 0.75 to 1.5), the foam ribbon, swash and cliff skirts are drawn live by the ground's live layer (0.8 ms, not in the cache: they breathe), and the sheen and haze are flat translucent bands (0.4). Never a full-window bitmap scaled per frame (9.4 ms) or a full-window gradient (7.6). The contour paths are 2 MB of `Path2D` (there is no depth bitmap); memory is Appendix A.2.

## 6. Fog and clouds over locked districts

The author's words: "singular patches of blurred dots." The replacement is a bank of cloud with a clear silhouette and a readable form, lit like everything else. It is cloud, not fog, not a wash.

### 6.1 The form

MUST: a continuous, layered, readable cloud cover over each locked district: one connected mass with one coherent outline, a flat base sitting on the ground and a domed, puffy top.

- **Coverage.** The bank covers at least 85% of the district footprint (the `fp` rectangle, as its outline on the screen) as one mass, measured as the area of the union of the puffs against the outline (`coverage()` in `js/world/cloudbank.js`, sampled every 12 world pixels). Every puff overlaps at least two neighbours by at least 35% of the smaller radius of the pair. `tests/world-cloudbank.test.mjs` holds all of this on the sixteen real footprints: 96 to 99.6% covered, one connected mass, no puff with fewer than two neighbours. Gaps are allowed only at the bank's rim and as one or two small "windows" (see 6.4) near the gate. No isolated puff in the interior, ever.
- **Puffs.** (Superseded by 6.7: a lobe is a gradient dome, and the bank is baked.) A puff is a flat-shaded circle: body `#f7f9ff`, a belly crescent `#c3d1f2` (a circle offset down-right, clipped to the body), a top crescent `#ffffff` (a circle offset up-left, clipped), a rim 1.5 wpx `#e9f0ff`. The radius is a share of the footprint's width on the screen, `0.042 x (w + d) x 32` wpx (54 for the Scrap Yard, 78 for the Campus, 102 for Farmland; clamped to 40 to 125), so a big district gets big puffs. No radial gradients, no blur, no 30%-alpha smudges.
- **Tiers.** The bank is 3 tiers of puffs in depth, back to front, each a band of rows of a hex lattice (rows 0.87 spacings apart, offset by half a puff so the silhouette scallops, spacing 1.5 radii): a back tier (largest, 1.15 of the base radius, raised by 0.30 of it, `#e3ebfb` body so it recedes), a middle tier (1.0, raised 0.12) and a front tier (0.85, the lowest, the lit one). Each row runs 0.4 radius past the outline so the bank has a rounded rim. Count: 80 to 90 puffs for any district (the radius grows with the footprint, so the count stays about the same; the rule is 40 to 150). The first sizing, `n = clamp(round(footprintTiles / 14), 14, 42)` puffs of radius 22 to 64, could not meet the coverage rule: a hex packing with 35% overlap answers for 2.36 r^2 a puff, so 28 puffs of 64 cover 68% of the Scrap Yard and 42 cover 27% of Farmland (twelve of the sixteen districts sat at the cap of 42).
- **Base.** A flat-bottomed ribbon of belly colour (`#aebfe8`, rounded rectangle, 0.55 puff-radius tall) under the front row, so the bank reads as sitting on the ground, with a soft contact shadow below it on the land.
- **Silhouette.** The union of puffs is the outline: a scalloped top edge, rounded ends, and a flat base. Squint at the capture: it reads as a loaf of cloud over the district, with the same outline at far, mid and near zoom.

### 6.2 Colour and light

- The cloud is lit from the upper left like everything: the top and upper-left of every puff are the brightest, the lower right is the blue belly. The warm sun tints the top crescents `#fff6e0` at the golden hour; at night the bank is `#8c98de`-multiplied, periwinkle, and the windows of the district glow through the gaps.
- **A tinted glow, not a dark wash.** Under the bank the district keeps its colour, softly veiled: `veiled(c, k)` = desaturate by `0.45 x k`, then `mix` 22% toward `#d8defa` (lilac-white), where `k = 1` while locked. The result is never darker than the source (luma at least the source's minus 5%). This replaces `fogged()` (which mixed toward `#121826` and darkened). A faint tint of the district's accent colour at 14% shows in the veil so each locked district still says what it is.
- **Cloud shadows.** Each bank casts a soft translucent shadow on the ground beyond its lower right edge (towards +gx): an ellipse flattened 2:1, `#5a5fa0` at 0.16, offset by 0.45 x bank height, plus two smaller shadow ellipses under the biggest puffs. The shadow is on the ground the district does not occupy, so it also reads on the sea.
- **Ghosts.** The rows are not fully opaque: back 0.90, middle 0.82, front 0.78. What stands under the cloud shows through as a soft ghost (the veiled colours above), so the player sees what is coming. The dome is about 70 wpx high, so tall things (towers, cranes, silos, the IPO tower) stand out of it with their tops in full light: this is the strongest "locked, but see what is in there" cue.

### 6.3 How locked still reads as locked

The cloud is the first cue; the cues stay redundant: the gate (barrier, raised bridge leaf, stopped ferry, or for fog-gated districts a soft arch of cloud over the road); a floating padlock sprite (a gold rounded padlock 28 wpx with a keyhole, bobbing 4 s +/- 2 wpx) on the cloud above the district centre at mid and near zoom; the "Opens at ..." chip and the district name tag (UI, unchanged); the veiled desaturated ground. At far zoom each bank is a single cloud sprite (6.5) and the district is a pale shape under it: the island shows the open districts bright (one at the start) and a cloud loaf over every other district; as districts open, the loaves lift away one by one.

### 6.4 Drift, bob and the dissolve

- **Drift.** A bank breathes in place: each puff bobs 1.6 wpx up and down over 7 to 11 s (hashed period and phase) and swells 2% over 9 s; the whole bank slides +/- 14 wpx horizontally on a 48 s sine. No puff travels across the district and no puff ends or wraps (the old banks slid across and faded, which looked like smoke). All stops under Calm, Off and reduced motion; the rest pose is bank centred, bobs at mid.
- **Windows.** Near the district's gate one or two small gaps (a puff-sized hole each 90 s, opening over 3 s and closing over 3 s) let sun fall on the ground below; they are the only gaps in the interior. Still under reduced motion (closed).
- **Dissolve on unlock** (`REVEAL_MS = 2600`, unchanged in length). In order: 0.0 s a golden flash ring from the gate; puffs lift upward and outward from the gate outward, each starting at `0.35 s x (its distance from the gate / the bank's width)`, rising 36 wpx, scaling from 1.0 to 0.6, fading from 1.0 to 0 over 1.1 s, shedding three to five small sparkles (the star particle of 4.4) each; the veil releases (saturation returns, luma settles to the open district's); the cloud shadow fades with the puffs; at 2.0 s two or three leftover wisps (small puffs, radius 14) drift off to the upper right for 0.6 s. No darkening step, no pop at the end (the last frame has no cloud pixels left, and the next is the plain district).
- Under reduced motion the dissolve is a 400 ms cross-fade of the bank and the veil, with no travel.

### 6.5 Level of detail and cost

| Band | What the bank is |
|---|---|
| far (under 0.30) | one pre-rendered cloud-bank silhouette per district (three variants, 512 x 256 px, blitted scaled to the footprint), no drift, with its ground shadow; one blit per locked district (15 at the start) |
| mid (0.30 to 0.70) | the COARSE bank (`bankScale` 1.6: about 35 puffs a district, one outline) drawn live as flat fills, per puff, back to front: bobbing, cloud shadows, ghost buildings; cross-faded with the fine bank over 0.60 to 0.80 |
| near (0.70 to 1.40) | the fine bank (about 85 puffs) live, plus thin ground mist (a lighter flat ribbon of `#f2f5ff` at 0.18 in the bank's lower rim, 12 wpx tall), the windows, sparkle motes in sun gaps |
| close (1.40 and over) | as near plus 8 to 14 small fraying puffs (radius 8 to 14) at the rim and a visible second rim line between puffs (a 1.5 wpx belly-coloured seam where puffs overlap) |

Cost (measured, `scripts/diag/cloudcost.mjs`, density 1.5): a live puff is three path fills (a body disc and two crescent paths: no clip, no gradient, no sprite) at about 27 microseconds and 1.2 ms per megapixel of fill, so a bank costs `bankMs` = 0.027 ms per puff in view plus 1.2 ms per megapixel: 6.6 ms for the Campus bank filling a window at zoom 1.2 (the legacy fog is 15.6), 4.3 ms for the Scrap Yard at 0.9, 12.3 ms for the thirteen banks in view at 0.3, 0.4 ms at the coast where a sliver of one is in view. A puff sprite blitted scaled is 3.9 ms per megapixel against 0.5 for the fill, a half-density bank scaled to the window is 9.4 ms, and puffs batched into one path are 1.4 to 1.5 times slower than filled one by one; none of them is used. There is no sprite sheet (the cloud memory is the three far silhouettes, 1.6 MB). The bank is drawn after the props of its district and over them (as `drawFog` does now), in world space under the camera transform, never in screen space. A bank that is not in view costs nothing. The puff count is 40 to 150 per district and at most 5 locked banks are in view at near zoom.

### 6.7 As built, after the first judging round (what replaced 6.1 to 6.5 where they differ)

The first build of this section painted a puff as flat discs and crescents, a bank as a near-opaque slab, and drew it live every frame. The judges' pictures (fog_quality 6, fog_cohesion 7, fog_edges 5) named the faults: bubble wrap (F1), a blanket that hid every building (F2), no shadow on the land (F3), hard pale lenses on the ground at the bank's edge (F4), purple foam at night (F5), lamp pools shining on top of the cloud (F6), a hard jagged wash and pale polygons (F7), a lock half buried by a puff (F8), banding (F10). What stands now, in `cloudform.js` (shape), `cloudpaint.js` (paint), `cloudcache.js` and `clouds.js` (the layer):

- **A bank is lobes, not stamps.** The lattice of `cloudbank.js` is still the plan's rule (96 to 99.6% of the footprint, one mass, two neighbours each: `tests/world-cloudbank.test.mjs`). The painted bank is the lattice with its radii spread (0.90 to 1.18), five or more towers (1.35 to 1.7 times the radius, raised: the big lobes of the core), small rim lobes (0.5 to 0.85) on every exposed side with a lump of their own on one in five, and a ring of lobes round each window. The biggest lobe of a bank is at least three times the smallest; `tests/world-cloudform.test.mjs`.
- **A lobe is a lit dome.** One radial gradient whose centre is moved to the sun (upper left): bright core, body colour at the edge, no dark rim of its own. The underside is cel-shaded: the bank is painted three times, in its belly colour where it stands, in its mid colour half way up to the sun and in its body colour lifted by `LIFT` (0.05 of the base radius to the left, 0.14 up), so only the edges that face away from the sun keep a rim, and it comes in two steps and not one hard band. A soft glint sits on the shoulder of the big lobes, and one thin periwinkle contour (a pixel and a half) runs round the union. Lobes lower in the bank are cooler: the union is shaded as one form.
- **The district shows through.** Two or three windows (one by the gate, the rest at hashed places, never at the heart where the padlock floats) are cleared of every lobe that would reach into them and ringed by small lobes of their own. The painted bank covers 60 to 90% of the footprint (82% on average), is still one connected mass at every scale, and the veil over a locked district keeps 60% of its saturation (desaturate 0.24, 12% towards lilac-white: `veiled`). The translucent per-puff floors of the first build, whose bottom edges were the hard lenses of F4, are gone.
- **Shadow.** A broad soft ellipse under the bank and a soft one under each lobe along its foot, pushed down and to the right by the light (72 world px a unit of `shadowLength`), stamped from the shared soft sprite: on the ground, the shore and the sea. The hard swept quads (the pale triangles of F7) are gone.
- **Hours.** The grade multiplies the frame by the hour's colour, so the cloud's tones are chosen before the multiply: golden tops and rose bellies in the evening, and at night sand-grey bodies that come out as a quiet blue-grey (saturation under 0.3 after the tint, a rim lighter than the body, a belly a quarter darker). The night's tones come in as the square of the night (the blue hour is still mostly the evening's). `tests/world-clouds.test.mjs` holds the numbers.
- **Lamps under cloud are hidden.** `Grade.lights` asks the bank's cover grid: a light under a lobe is not stamped, one in a window shines in full, one whose pool reaches under a window's rim is dimmed by the share of its reach that is covered.
- **Padlocks are drawn after every bank**, and the tall props that stand out of a bank (towers, cranes) with a collar of lobes before them.
- **Baked, not live.** Every locked bank and its shadow is baked into chunks of 384 device pixels on the ground's own grid (`cloudcache.js`, a `ChunkCache` whose bake paints straight into the cell), stamped 1:1 on whole pixels; the chunks a pan reveals are baked a few milliseconds a frame, chunks of the nearest scale stand in, scaled, while a zoom moves and the exact ones fade in over them (140 ms); a cell no bank (lobes or shadow) can touch is never made (`touches`). The rule is the frame's own scale, so a chunk is stamped 1:1 (the cheap blit: 0.7 ms a megapixel on a CPU-drawn canvas, where a scaled one is 4). Only where the pixel ledger has no room for the window's chunks (a window wholly under cloud is 54 chunks, 32 MB) are they baked at 0.75 of the scale and stamped 4/3 larger (exactly 512 pixels a chunk), and then at 0.5 (`ratioFor`, with a hysteresis: going back up wants 8 MB to spare); soft edges are cloud, and the memory table keeps the 0.5 row. `World.squeeze` gives the clouds' stale and off-window chunks back first. A bank that is opening, or cross-fading under reduced motion, is drawn live for its 2.6 s (400 ms) and leaves the chunks in the frame it opens, whose cells are baked again at once; the dissolve is unchanged (`dissolveFx`). The sky's small cumulus are baked once per cell into sprites of a quarter-octave of scale.
- **What is not built.** The bob, swell and slide of 6.4 (a baked bank stands still; what moves is the sky's small clouds, the padlock and the dissolve) and the sparkle motes. They need a live layer over the chunks and the first judging round did not ask for them.

## 7. The level-of-detail ladder

The author likes that quality becomes more visible as you zoom, and wants the ceiling raised a great deal: at 2.4 the world must look genuinely crafted. Four bands, one rule (detail is additive), one crossfade.

### 7.1 Bands

| Band | Zoom | What the player is doing | Reads as |
|---|---|---|---|
| far | 0.129 to 0.30 | looking at the whole island or a region | a bright toy map: a shaped island in a turquoise sea under cloud loaves |
| mid | 0.30 to 0.70 | choosing a district, scanning | a model village: roofs, trees, roads, water bands |
| near | 0.70 to 1.40 | working: buying, selling, hiring (the working zoom is 0.9 to 1.2) | a lived-in toy town: windows with frames, faces, awnings, tufts |
| close | 1.40 to 2.40 | admiring, reading a crate | a crafted diorama: shingles, bricks, planks, litter, expressions |

`FAR_ZOOM` (0.42 today) becomes 0.30 and `world.far` means "under the far band's upper edge". The old terrain stride (1, 2, 4, 8 by zoom), the plain-block `farDraw` and the dot characters are replaced by the rules below. Bands are in zoom, not in screen size, so they hold at any window size; `PIP_ZOOM` (0.45, the bars) and the labels' rules are UI and unchanged.

### 7.2 What is drawn, family by family

| Family | Far | Mid | Near | Close |
|---|---|---|---|---|
| Land | smooth lit colour field, shaped coast, beach band, cliffs as 2-tone bands | adds district plateaus with rim, soft patches, worn paths, foam scallops | adds 2 x 2 sub-quad shading, grass tufts, flower dots, beach shells | 4 x 4 shading, blades, clover, pebbles, mole hills, footprints in sand |
| Sea | depth bitmap, 3 widened wave levels, foam line, sheen | all 12 wave levels, crest lenses, boats and wakes, ripples near ships | curls, glints, rings, second foam trail | caustics in the shallows, bubbles at the pier legs, fine foam on cliff feet |
| Roads | tinted ribbons with a lighter kerb line | kerb band, centre dashes, zebra bars | paver joints on sidewalks, lane edges, manholes | drains, cracks, a dropped cup, a chalk game, tyre marks at the depot door |
| Buildings | rounded extruded blocks in 3 values, roof colour, no windows | window rows as bands, roof 2-tone, door as a dark notch, signs as colour bars | framed windows with glints, doors, awnings, tile-course roof, chimney, brick bands, lettering | shingles one by one, mortar bands, plank joints, curtains and window boxes, door numbers, downspouts, signs with raised letters, a doormat |
| Trees and plants | one round blob and a shadow | 3 puffs, trunk | full puff count, highlight and shade crescents, bark highlight | leaf dots, blossom, fruit (farm), a bird in a tree at times |
| Small props (lamps, benches, fences, bins) | none (lamps as a 3 spx dot every 4th) | lamps, fences as bands, benches as slabs | all of 4.1 at near detail, micro-props appear (7.4) | full detail, nails, caps, bulbs, the pigeon on the bench |
| Characters | none; a coloured pill 5 x 8 spx for the player and for urgent buyers only | pill with head dot, hat colour | full doll with face, hair, accessory, arms, shadow, bob | eyebrows, mouth states, hand-held items, blink, hop, footprints, wave |
| Crates and lots | 4 spx coloured squares | rounded cubes without detail | slats, brackets, stencil, pallet | tape, tags, label, peeker, rope and bell on auction lots |
| Clouds | one sprite per bank | puffs drifting, ground shadows, ghosts | mist rim, windows, sparkle | fraying puffs, seam lines |
| Light | grade and haze | plus lamp pools at dusk | plus window glow and rim bands | plus soft god-ray shafts at dawn and dusk (existing) |
| Particles | none | coins and sparks | puffs, pollen | all, plus footstep dust |

### 7.3 Additive layers and crossfade

MUST: a finer band only adds marks on top of the coarser picture; it never replaces it with a different picture. Implementation consequence: each layered prop sprite is a `base` sprite (silhouette, face model, roof colour, window bands, door notch, sign bars: the mid band's additions are sub-pixel at far and cost nothing to include, so they live in the base, valid from far to close) plus up to two overlay sprites (`detailNear`, `detailClose`) that are transparent except where they add marks. The sprite cache (`sprites.js`) keys them by prop, zoom octave, fog bucket, night bucket and layer. The crossfade:

- `detailAlpha(z, t) = smoothstep((z - 0.85 t) / (0.30 t))` for a band threshold `t` (so an overlay fades in over +/- 15% of its threshold: `detailNear` over zoom 0.595 to 0.805, `detailClose` over 1.19 to 1.61). Alpha is a pure function of zoom, so a zoom gesture fades smoothly in both directions and never pops.
- Overlays are built only for props in view whose alpha would exceed 0.02, and only once the scale has rested (the existing rule: no builds while the zoom moves). While a gesture is moving, the stale overlay of the nearest zoom is shown scaled (existing `stale` behaviour), and a missing overlay is simply absent: the base is always complete and never looks unfinished.
- Characters, crates and small props do the same with their own detail passes. The terrain's dressing fades with the same function and is cached with the ground.
- Memory: overlays count against the sprite budget (Appendix A); the budget evicts least recently used overlays first and bases last.
- The quality governor (`slow` tiers) lowers the effective band: at tier 3 and over `close` overlays are not built; at tier 5 and over `near` overlays are not built; the water drops curls and glints at tier 2; clouds drop mist and windows at tier 2. The picture never gets uglier than the base, which is already complete.

### 7.4 Micro-props: the small things that make close zoom crafted

Hashed per district block (so the same island every time), near and close only, never on roads, pads, plots or within 1 tile of a prop; capped at 60 per district in view; each is a 6 to 14 wpx rounded toy from the palette of 2.2. Their art is simple on purpose: one fill, one highlight, one shade, a contact shadow.

| Micro-prop | Where |
|---|---|
| flowerpot or window box (3 puffs and 2 blooms) | beside doors of `bldg`, `rentrow`, `manor`; everywhere residential (campus, estate, realty, market stalls) |
| mailbox (a rounded box on a post, a red flag) | sidewalk edges in campus, estate, realty, metro |
| street sign (a rounded plate on a pole with an arrow) | junctions in every district |
| bin (a small cylinder with a lid) | sidewalks in metro, corporate, pawn, campus |
| hydrant (a fat red toy) | kerbs in metro, auto, industrial |
| bike rack with a bike | campus, metro, creative |
| litter (a paper cup, a crumpled sheet, a banana peel) | pawn, scrap, market, creative; never in estate, finance, exchange |
| puddle (turquoise ellipse with a white glint) | scrap, pawn, harbor, after-rain feel |
| manhole cover, drain grate | roads in every district |
| crack in the pavement (a 2 wpx rounded band) | scrap, pawn, industrial |
| bunting (a row of triangles on a string) | market, campus, creative, harbor |
| welcome mat, doorstep, door number | houses at close |
| cat or dog on a step (a 12 wpx rounded toy, 6 s breathing) | realty, estate, campus (a cat), farm (a dog) |
| picnic blanket and basket | campus lawn, estate lawn |
| pigeon or gull on a bench, rail or roof | campus, metro, harbor |
| chalk drawing (a pastel hopscotch) | campus, realty |
| pallets and a forklift toy | depot yards |
| coin purse or ledger on a table | exchange, finance plazas |
| hay fork leaning on a bale | farm |

### 7.5 Characters at close zoom

At 1.4 and over a doll is crafted: eyebrows (2 wpx rounded dashes, tilt by mood), mouth states (neutral, smile, small "o", flat), blink every 3 to 6 s, hands holding the accessory, a visible shirt shade crescent, hair strands as 3 rounded tufts, shoe soles, a footprint trail of round puffs. They face the way they walk (a flipped sprite), turn toward the player when noticing (8.1), and wave when leaving. Under reduced motion they stand with open eyes and a neutral mouth, no bob.

## 8. Motion

Tasteful, sparse, periodic. Nothing flickers (WCAG 2.3.1): no luminance change faster than 3 per second anywhere; no loop is shorter than 1.1 s except a footstep (0.45 s); one-off events (a hop 0.35 s, a blink 80 ms, a squash 0.18 s, a spark) may be shorter. Every loop is a function of `env.t` (the visual clock), which is 0 under reduced motion, so under Calm, Off and reduced motion every phase sits at its rest value and the picture is a still, best-looking pose. The `this.reduced()` check already gates `env.t` and `env.wind`; no new motion may bypass it.

### 8.1 The list

| Motion | Period and size | Rest pose (reduced, Calm, Off) | Where |
|---|---|---|---|
| Foam breathing (swash) | 6.5 s, +/- 0.35 tile, phase 0.12 cycle per tile along the coast | mid swash | 5.4 |
| Wave ridges rolling in | 24 s for a ridge to cross all 12 levels, 3 ridges | `t = 0` positions | 5.2 |
| Sheen bands drifting | 1 tile per 9 s | `t = 0` | 5.2 |
| Glint twinkle | 2.4 to 4.0 s each, at most 40 | steady at 0.35 alpha | 5.2 |
| Ring ripples | one per 6 s per source, 2.4 s life | none | 5.2 |
| Cloud bank | puffs bob 1.6 wpx over 7 to 11 s; swell 2% over 9 s; bank slides +/- 14 wpx over 48 s | centred, bobs at mid | 6.4 |
| Cloud window | one per 90 s, 3 s open, 3 s close | closed | 6.4 |
| Padlock on the cloud | 4 s, +/- 2 wpx | mid | 6.3 |
| Tree sway | 4.2 s, +/- 1.2 wpx at the crown (hashed phase), with a slow gust envelope 18 s x 1.5 | upright | trees |
| Flag ripple | 2.1 s, three cloth segments | straight | `flag` |
| Lantern sway | 3.4 s, +/- 2 degrees | still | `lantern` |
| Smoke | puffs rise for 3.2 s, spawn every 0.8 s, 4 per stack at most | none | `stack`, `factory`, `shack`, pipelines |
| Windmill sails | 9 s per revolution | fixed at 30 degrees | `windmill` |
| Fan on rack roofs | 6 s per revolution | fixed | `rack` |
| Globe on the exchange | 9 s per revolution | fixed | `exchange` |
| Dish, dome slit | 14 s, +/- 3 degrees | centre | `dish`, `dome` |
| Fountain | jets arc over 1.6 s; rings 2.4 s | frozen arc | `fountain` |
| Crane trolley and hook | trolley 16 s, hook 10.7 s (the existing sine periods) | mid travel | `crane`, `gantry` |
| Boats | bob 5.5 s +/- 1.2 wpx, rock 1.5 degrees, wake ring every 2.4 s | level | `ship`, ferry, sailboat, rowing boat |
| Gulls | flap 0.5 s, glide loop 60 s | perched | 5.7 |
| Neon and LED glow | 3.6 s soft pulse +/- 12%, never a flicker | steady | signs, `rack`, `neonlamp` |
| Lamp warning pulses (gate barrier) | 3.2 s | lit steady dim | `gate` |
| Barrel fire | 1.1 s flame bob, one spark per 0.6 s | mid flame | `barrel` |
| Billboard gradient, ticker scroll, cyan inlay | 12 s, 40 wpx/s, 5 s | static | `billboard`, `ticker`, `tech` ground |
| Searchlight beam | 9 s swing, night only | off | `spot` |
| Traffic | cars along roads (existing) | none | `cars()` |
| Character idle | bob 2.8 s +/- 0.8 wpx; blink every 3 to 6 s (80 ms); a buyer with `lead.need` waves 1.2 s | standing, eyes open | 4.4 |
| Character walk | step 0.45 s, body bob 1.2 wpx, round footprint puffs | stands | `person` |
| Stop squash | 0.18 s: scale Y 0.92 then 1.0 with a 4% overshoot, scale X the inverse | none | all characters |
| Buyers noticing the player | within 3.5 tiles: head and body turn toward the player and a hop of 6 wpx over 0.35 s, once, then at most every 20 to 40 s while nearby | no turn, no hop | `drawLead` |
| Crate land, selection bob | land: drop and puff (existing, 180 px/s); selected bob 2.2 s +/- 2 wpx | none | crates |
| District unlock dissolve | 2.6 s (6.4) | 0.4 s cross-fade | `fxOf` |
| Coin and spark bursts | 1.1 to 1.5 s | not spawned in Calm (existing) | `fx.js` |
| Dust motes (pollen) | 3 depth layers, 14 s drift | off | `fx.field` |

### 8.2 Rules

- **Phase by position, not by frame.** Every phase is hashed from the object's world position so a reload looks the same and neighbours are not in unison.
- **Cheap.** Live motion is drawn as transforms of cached sprites (a sprite blit with a rotation or offset), not by redrawing the prop. A tree's sway is a blit of its crown sprite offset by `sin(t / 4.2 s + phase) x 1.2 wpx`.
- **No loop shorter than its readable period, no motion tied to the frame count**, and the foam, ridges and sheen are functions of absolute `env.t`, so a dropped frame does not stutter them.
- **Entrance only on events.** Unlocks, sales, landings and arrivals animate once and end.
- **The frame loop still stops when nothing moves** (reduced motion draws only on change; `animating` stays as is). In Calm the draw loop does not run for decoration.

## 9. What to delete

Each item names the file and the function or constant, and what replaces it. When an item is gone, grep for its colour literals (listed) to be sure nothing reintroduced them.

### 9.1 Water, ground and coast (`world.js`, `layout.js`, `island.js`)

- `world.js` `drawWater` (whole), the fields `waterGr`, `seaStrip`, `seaKey`, the constant `SEA_STRIP`, the strip logic in `release()`, the 26-line squiggle loop (`ctx.strokeStyle = rgba(190,230,255...)` with `Math.sin(ph + x * 0.1)`), the 44 one-pixel glint rectangles (`ctx.fillRect(x, y, 3 + (i % 4) * 2, 1)`), and the sea colours `#1b3b5c`, `#08111f`, `#3b3550`, `#235a7a`, `#0b1a2c`, `#6a5a6a`. Replaced by the world-space sea (5.1 to 5.3), drawn under the camera transform.
- `world.js` `drawGround`: the cliff quad loop that draws per tile edge with flat `mix('#9a8a64', '#575d6a', ...)` colours, the 1 px black interior lines (`rgba(0,0,0,.2)`) and the foam strokes `rgba(6,18,36,.38)` / `rgba(228,244,255,.5)` (replaced by 5.4 and 5.6); the terrain tile loop's `ctx.strokeStyle = col; ctx.stroke()` same-colour seam hack (replaced by the 0.6 wpx bleed of 5.8); `coarseCol` and the stride 1/2/4/8 mesh (replaced by the lit colour field); the block outline `'rgba(0,0,0,.4)'` at 1.5 px (the dark block stroke).
- `world.js` `drawRoads`: the road colours `#2f3644`, `#454a58`, `#8f7e5c`, the 1.6 px dash `rgba(255,211,110,.7)`, the ferry's 2 px dashed line; `drawBridge` (1.6 px `#c9ccd2` rails, 3 px `#2b3342` legs); `drawMarks` (`rgba(255,255,255,.5)` half-alpha zebra bars). Replaced by 4.5.
- `world.js` `drawDecal`: case `'water'` (the wavy lines `rgba(200,235,255,.35)`), case `'grid'` (1 px lines), case `'spk'` (rect dust), case `'rect'` with a 1 px stroke. Replaced by 4.5.
- `world.js` `drawPlot` (the dashed 2 px outline `#ffd36e` and the triangle cones), `drawPipe` (the emoji `fillText(K.icon)`, the dull `#6a707c` paused colour, plain `box`), `drawLot` and `drawAsset` (plain `box` with 0.25 alpha black `line` strokes, `shade(col, 0.65)` broken tint), `drawTruck`, `drawCar` (plain boxes), `drawPlayer` (the flat yellow ellipse ring), `drawLead` (the 5 x 8 `fillRect` and `person()` doll), `drawHover` (the pure `#ffffff` 1 px rule). Replaced by 4.4.
- `world.js` `TAG_COLOR` (the 32 muddy tag colours), `SHIRTS`, `HAIR`, the skin and pants arrays in `lookOf`. Replaced by 2.5 and 2.6.
- `layout.js` `buildDistrict`: the `cols` derivation (`ground` from `luma(g0)`, `road: mix('#2c323e', ground, 0.15)`, `walk: mix(ground, '#cfd5df', 0.42)`, `pad: shade(ground, 0.8)`, `edge: mix(ground, '#000000', 0.4)`) and `kit.ground(g0)` (the scrap `mix(g, '#9a7a50', 0.5)`); the tile colour pipeline `tcol` (`'#cdbb8e'`, `'#4b7a4e'`, `'#5e7a4a'`, `'#8a8a78'`, `'#7d7568'`, the `REGIONS` tint use, `shade(...)` per-tile). Replaced by the table of 2.4 and `terrainColour` (5.8). `island.js` `REGIONS[].tint` values (`#8a6a3a`, `#4a7aa8`, `#7a9a4a`, `#c9b878`) become the lifted ones in 5.8.
- `layout.js` `buildDistrict` stash decal: the 1 px `rgba(255,255,255,.28)` outline rectangle. The `cliffs` list stays as data (it drives where cliffs stand); its flat drawing goes.

### 9.2 Fog, light and shadow (`lighting.js`, `iso.js`, `shading.js`, `world.js`)

- `lighting.js`: `fogSprites` (the dark pool `rgba(14,20,32,...)` and the nine radial-gradient blobs per cloud sprite), `Lighting.fog` (the pool plus the sliding banks), the fallback gradient pool; `paintVignette` (`rgba(6,10,24,...)` up to 0.42), the navy foot in `bakeAir` (`rgba(10,16,34,0.16)`), `bakeAirNight`'s `rgba(2,4,12,0.28)` foot, `paintFalloff` toward `'196,218,238'` and `'40,62,120'` at 0.2 and 0.22 (re-baked in the palette of 2.7 with no dark edge), `NIGHT = [105,125,185]`, `GOLD = [255,205,158]`, `RAIN = [190,204,226]` (replaced by the values of 2.7).
- `world.js`: `drawFog` (replaced by the cloud banks of 6), `FOG_DIM = 0.5` and `fxOf().dim` as a darkening factor (it becomes the veil strength `k` of 6.2).
- `iso.js`: `fogged()` (the `'#121826'` mix and the darkening), `INK`, `inkA`, `veils('8,10,20')`, and every use of `inkA` for shadows (`shadow()`, `blob()`, `lamp()`, `contact()` in `shading.js`): shadows become `#4a3f88`; `tone()` factors 0.8 and 0.6 (replaced by the face model of 2.1); `sootA` and `snowA` (pure black and pure white veils) as the shading colours (replaced by violet `#5c4c96` and warm `#fffbe6`); `gray()` (used only by `fogged`).
- `shading.js`: `rimLight` (three 1 px hairline strokes), `courses` and `seams` (1 px lines), `weather` (1.6 px streaks), `glassSheen` and `sheen` as hairline-ish bands (replaced by bands of 2 wpx minimum), `HAZE = '#a9c3e0'` (replaced by `SKY.horizon` mixes).
- `fx.js`: the rain minimum 1 px width (`lineWidth = layer === 2 ? 1.5 : 1` becomes 1.5 minimum), the rect dust motes in `field()` (the near layer's large faint blur disc is kept but round and pastel), ring strokes `rgba(255,211,110,...)` 2.5 px stay as soft double rings.

### 9.3 Props and people (`iso.js`, `props.js`, `kits.js`)

- `iso.js`: `person()` (five rectangles, two dark squares for eyes), `tree()` (three sharp triangles per tree: `quadN(ax, ay, x + w, yy, x - w, yy, ax, ay)`), `lamp()` (a 3 px stick), `cyl()` (keep the gradient, replace the 1 px rim stroke with a filled band), `box()`'s `o.line` 1 px outline option (replaced by the contour of section 3), `windows()` (the `rgba(190,225,255,.32)` 0.8 px glint hairlines and sill lines, replaced by the reflection band and sill plate), the window colours `#1d2740`, `#2a4a6a`, `#241636` (unlit panes are `#4a6fb8`).
- `props.js`: `roof()` hairline strokes (`stroke(ctx, snowA(0.42), 1.3)` ridge, eave `sootA(0.3), 1.4`), `roofKit` (grey `#8e97a6` boxes), `strip` bands under 1.5 wpx, `bldgBody` window colours, the door hairlines (`rgba(255,255,255,.14)`), every `stroke(ctx, ..., 1)` and `ctx.lineWidth = 1` in `DRAW` (`crate` X-lines, `lookout`, `fence` rails of 2 px and posts of 3 px, `crane` strokes, `tires`), `board`'s dark slab `#202a3d` and `#0f1626` face, `crane`'s `#c9a227` strokes, `deadtree`, `junkcar`, `hallBody`'s `rgba(255,255,255,.55)` 3.2 px column strokes (columns become cylinders), the `FONT` mono lettering on signs (signs get a rounded sans; labels in the UI are unchanged).
- `kits.js`: every hairline decal: pawn `rect` lines of `d: 0.12`, auto `rect` lane lines of `w: 0.07` and the `d: 0.12` stripe bands, metro `rect` zebra bars of `d: 0.08`, harbor `d: 0.1` kerb line, industrial `d: 0.12` and `0.14` hazard lines, tech `d: 0.1` lines, finance `d: 0.08` lines, exchange `d: 0.1` lines, and every `grid` decal (the 1 px lattices in metro, industrial, tech, corporate and exchange, plus the `rgba(255,255,255,.1)` and `rgba(0,0,0,.14)` ones), and the realty `checker` of `step: 0.8` at `.05` and `.07` alpha (invisible). Each becomes a band at least 0.12 tile (about 4 wpx) wide, or a paver pattern with 1.5 wpx joints. `WALL`'s `deco('fence', ..., 0.1, ...)` keeps its footprint but is drawn per `fence` above.
- `kits.js` colours: the dark hexes (`'#1b2634'` racks, `'#1c2a38'`, `'#16202c'`, `'#202a3d'`, `'#3a3a44'` ship hull, `'#2b3342'` poles, `'#6b4a2c'` bench), the data-palette-derived grounds; replaced by the ramps of 2.2 and the table of 2.4.

## 10. Acceptance

A critic looks at a 1440 x 900 capture at device scale 2 (the evidence set: `coast-1.0`, `sea-0.5`, `locked-0.9`, `locked-0.5`, `finest-2.4`, and the fit view). An element family passes only if all three MUST-SEE items are visible and none of the three FAULTS is. One FAULT is a fail, however good the rest.

### 10.1 Per family

| Family | Must see | Faults that fail it |
|---|---|---|
| Sea | (1) a turquoise-to-cobalt depth gradient that follows the shore, with a pale shoal ring and a bright shallow band; (2) soft crest lenses, foam curls and sparkles that are clearly shapes, not lines, in a regular but never tiled rhythm; (3) when the camera is moved a few hundred pixels, every crest and curl moved by exactly the camera displacement, and zooming scales them with the island | any squiggle or sine line; any pattern that stays still while the island moves; a navy, grey or flat-gradient sea |
| Coast and foam | (1) a smooth shaped shoreline with no staircase; (2) a white scalloped foam line that visibly breathes (advance and retreat) and a wet-sand ring behind it; (3) a soft contact glow in the water and a soft island shadow on the shade side | a zig-zag of sand tiles; foam as a hairline; a hard cut between land and water |
| Beach | (1) cream sand with a darker wet edge grading dry to meadow with a scalloped boundary; (2) at near zoom shells, pebbles, driftwood or palms in places; (3) the starting district has a beach with a parasol or towel | a uniform tan strip; sand that stops in straight tile edges; props on the sand that block a road or pad |
| Cliffs | (1) strata bands with wavy edges stepping warm to violet; (2) a rounded grass lip along the top; (3) a foam skirt and plunge shadow at the foot | one flat brown wall; a straight vertical cut-out; no foam at the foot |
| Land | (1) soft lit grass with large soft patches, light from the upper left; (2) tufts, flower dots and worn paths at near and close; (3) district blocks sitting as little raised stages with a soft shadow | visible diamond tiles or tile seams at any zoom; flat olive or brown fields; huge empty uniform areas |
| Roads, crossings, pavements | (1) slate-violet asphalt lighter than a dark blue, with a cream kerb band and rounded returns; (2) painted centre dashes and zebra bars 0.22 tile wide; (3) pavers on sidewalks at near and manholes and drains at close | road ribbons darker than the grass is light; 1 px or half-alpha markings; a dark outline round a block |
| Houses and shops | (1) rounded corners and a fat-eaved roof with a rim highlight; (2) big framed windows with a reflection band, a door, an awning or sign; (3) two to three value steps per material and a violet shade side | a plain sharp box; hairline brick or window lines; grey shade sides |
| Towers and landmarks | (1) a stepped rounded silhouette with a sun streak on glass; (2) a unique crown or feature per landmark (bell, globe, vault door, dome); (3) towers standing out of cloud banks | a bare extruded box; the same tower repeated with no variation; windows as black rectangles |
| Industrial and harbor | (1) fat tanks and silos with domed lids and bands; (2) containers in saturated colours with ridges; (3) round smoke puffs, hulls with portholes and wakes | pencil-thin stacks; thin-strut cranes; black or grey metal |
| Trees and plants | (1) round puffs with highlight and shade crescents on a tapered trunk; (2) variety of species and sizes per district; (3) flowers and bushes at near zoom | triangle trees; every tree the same; a canopy that is one flat blob at near zoom |
| Characters | (1) round-headed dolls with two dot eyes, cheeks and a hat or accessory by role at near zoom; (2) the player is the unique tomato-red doll with a beanie pin; (3) idle bob, blink, a hop when a buyer notices the player | voxel dolls with no face; every buyer in the same outfit; a flat yellow ring under anyone |
| Crates, lots, stock | (1) rounded crates in saturated tag colours with slats and brackets; (2) pallets, rope and bell for auction lots, tape for broken; (3) a peeker toy on top at close zoom | grey crates; plain boxes with 1 px outlines; emoji on a wall |
| Street furniture and micro-props | (1) fat lamps with globes, benches with curled arms, fences with capped pickets; (2) at close zoom flowerpots, mailboxes, signs, litter; (3) soft contact shadows under everything | 1 to 3 px sticks as fences and poles; anything without a contact shadow; litter in a rich district |
| Gates, bridges, ferry | (1) striped boom arms, padlock plates and cones; (2) bridges with plank decks, ball-capped rails and foam collars; (3) a stubby ferry with portholes | hairline rails; a dashed ferry line; a flat grey bridge |
| Fog and clouds | (1) a continuous loaf of puffy cloud over each locked district with a clear scalloped silhouette; (2) lit tops, blue bellies, soft ground shadows, a padlock; (3) ghosts of buildings through the cloud and tall buildings standing out of it | isolated blurred blobs; a dark wash or dirty grey; a locked district darker than an open one |
| Lighting and grade | (1) a bright sunny morning by default; (2) one warm key with consistent violet shadows on everything; (3) gold evening and periwinkle night with warm windows | any capture that is murky or brown; black shadows; a navy vignette |
| Motion | (1) foam breathes, ridges roll, cloud bobs, trees sway; (2) nothing flickers or jitters; (3) with Calm, Off or reduced motion everything stops in a good-looking pose | a loop under 1.1 s; motion that bypasses `reduced()`; a frozen frame that looks broken |
| Level of detail | (1) clearly more crafted at each band; (2) no pop when zooming through any threshold; (3) the base is complete at every band | a visible pop; far zoom noisier than near; a missing base waiting for an overlay |
| Performance and memory | (1) median frame at 0.9 to 1.2 at most 1.25 x the baseline (Appendix A); (2) finest zoom at most 24 ms; (3) at most 160 MB of canvas pixels at dsf 2, and the governor still steps down and recovers | a per-frame allocation in a hot loop; a screen-space full-window layer added; a sprite budget that grows without bound |

### 10.2 Capture gates

| Capture | What the critic must see |
|---|---|
| `coast-1.0` | a shaped coast with a sand band and a white foam line; turquoise to blue sea with crest lenses; soft lit meadow with tufts; the starting district's block as a bright stage |
| `sea-0.5` | open water with a clear depth gradient, wave bands following the shore, a shoal glow, boats or buoys; lakes and rivers in the same water; no screen-space backdrop feel |
| `locked-0.9` | a thick cloud loaf with blue bellies over the district, tall buildings poking out, ghosts below, a padlock; bright, not murky; the district reads as locked at a glance |
| `locked-0.5` | cloud banks as clear loaves over the districts; the island reads as bright; gates visible; the seas around bright |
| `finest-2.4` | rounded crates with slats, a rounded crane with a cab and striped jib, dolls with faces and accessories, picket fences with caps, pavers, tufts, litter; soft violet shadows; no hairlines |
| fit (0.129) | a bright shaped island in a turquoise sea, the open districts bright (one at the start), a cloud loaf over every other district, a warm pale horizon haze |

### 10.3 Three quick tests anyone can run

1. **Squint.** Blur the capture by 8 spx: it must read as a sunlit island with 4 colour masses (sea, land, roads, cloud), not as a dark smear.
2. **Greyscale.** Convert to greyscale: every material shows three steps (light, mid, shade), light faces left, and clouds are the lightest thing in the frame.
3. **Five seconds.** Show it for five seconds to someone who has not seen the game and ask for one word. The wanted answers: sunny, cozy, toy, cute. The unwanted: dark, foggy, grey, flat.


## Appendix A. Budget, measurement and machine-checked constants

### A.1 How performance is judged

The method is `scripts/world-budget.mjs` (RENDER_PLAN section 6 is the contract and the block of scenes; this section is where the baseline came from). It is `scripts/perf.mjs`'s with one correction, because Canvas 2D in headless Chrome returns from `draw()` before the pixels are rastered: a bare `performance.now()` around `draw()` reads 0.4 to 3.4 ms at the median and means nothing (the cost lands later, in a flush, as 100 to 600 ms spikes). Force the flush: after each `w.draw()` call `w.ctx.getImageData(0, 0, 1, 1)` and time the pair. Method: headless Chrome 156, `--disable-gpu` (software raster, which is the stricter machine), viewport 1440 x 900, device scale factor 2 (the world caps itself at 1.5 on a CPU-drawn canvas, so the canvas is 2160 x 1350: every millisecond in this document is at that density; the shot rig pins the canvas to 2, where the same scenes read 1.55 to 1.8 times dearer, so a rig `--perf` number is never compared with a ceiling), a real game started through the draft screen at day 0, `pc.world` as the handle, `focusZone(1)` then `zoomBy(...)` to the zoom wanted, three draws to settle, then the median of 120 timed draws. "Still" is a camera that does not move (the ground cache is valid). "Moving" adds `cam.x += 0.7` before every draw (the ground is drawn directly, which is what a pan costs).

Baseline at `adcd991`, this machine, 2026-10-28 (milliseconds per frame, median; noise is about plus or minus 10%, so re-measure `adcd991` in the same session before judging a change):

| Zoom and scene | Still | Moving |
|---|---|---|
| 0.129 whole island | 13.2 | 13.2 |
| 0.5 mid (fit, then 0.5) | 26.1 | 37.2 |
| 0.9 coast of district 1 (working) | 9.7 | 17.2 |
| 1.0 district 1 (working) | 14.5 | 24.7 |
| 1.2 district 3, locked (working) | 20.9 | 32.2 |
| 1.8 district 1 (close) | 15.5 | 19.1 |
| 2.4 district 1 (finest) | 17.7 | 20.3 |

The rules: the median at the working zooms (0.9 to 1.2) must stay at or under 1.25 x the baseline, still and moving (12.1, 18.1, 26.1 ms still and 21.5, 30.9, 40.3 moving at 0.9, 1.0, 1.2); the finest zoom (2.4) must never exceed 24 ms, still or moving, which leaves only 6.3 ms (still) and 3.7 ms (moving) of headroom over the baseline: the new close-zoom richness must come from cached sprites and overlays, not from per-frame drawing. The quality governor (`SLOW_MS` 22, `FAST_MS` 16) must still step down and recover: a test must feed slow costs and check `slow` rises, then feed fast costs and check it falls.

The sprite cache already shows the shape of the working set: at the working zoom of the baseline it held 6.3 million pixels in 82 sprites.

### A.2 Where the pixels may live (dsf 2, canvas 2880 x 1800: one full-window layer is 20.7 MB)

| Holder | MB | Note |
|---|---|---|
| main canvas | 21 | the visible canvas |
| ground chunks | 40 | chunks of 384 DEVICE pixels (0.59 MB each; 54 at most in a window, 31.9 MB at rest, a quarter more while the zoom changes), so the memory does not depend on the zoom (chunks of 1,024 world pixels would be 387 MB at 2.4) |
| light layers | 31 | `day` full size, `mix` half size, a reserve for the transient `night` tile; `shafts` transient and released after 20 s idle (existing) |
| sprites | 48 | 12 million pixels at dsf 2 (`SPRITE_BUDGET` 8 million at density 1, times the cache's own growth of 1.5; today 22 million, T5 lowers it; overlays count) |
| sea contour paths | 2 | 24 depth levels and the wave levels as `Path2D`; there is no depth bitmap |
| foam and tuft caches | 1.5 | small cached tiles |
| cloud silhouettes | 1.6 | three far-zoom banks; the live banks hold no memory |
| labels | 6 | the existing label sprites |
| shadow stamps | 0.5 | one cached sprite per colour |
| total | 151.6 | limit 160, headroom 8.4 (RENDER_PLAN's render-memory block sums to 151.1 and `tests/world-ledger.test.mjs` holds it under 155) |

`World.release()` and `detach()` must give every one of these back (`registerReleaser`, `releaseAll`). Where there is no `OffscreenCanvas` (the Node tests) every layer falls back to direct drawing as today.

### A.3 Allowed and forbidden techniques

Allowed: baked offscreen bitmaps in world space; `Path2D` in world pixels; cached sprites and overlays; a `CanvasPattern` for large soft features only; hashed placement; integer-pixel blits; one `drawImage` for a whole layer; lookup tables for colour ramps; pure functions for every rule. Forbidden: WebGL, libraries, binary assets or image files, any per-frame allocation in a hot loop (reuse the pooled records, typed arrays and `Path2D`s), any new full-window screen-space layer, `Math.random` (use `hash`/`h2`), `ctx.filter` blurs, `shadowBlur`, gradients built per frame, strokes under 1.5 wpx.

### A.4 The constants block

<!-- art-constants -->
```json
{
  "version": 1,
  "zoom": {
    "min": 0.129,
    "max": 2.4,
    "workingLo": 0.9,
    "workingHi": 1.2,
    "crossfade": 0.15,
    "bands": [
      {
        "id": "far",
        "from": 0.129,
        "to": 0.3
      },
      {
        "id": "mid",
        "from": 0.3,
        "to": 0.7
      },
      {
        "id": "near",
        "from": 0.7,
        "to": 1.4
      },
      {
        "id": "close",
        "from": 1.4,
        "to": 2.4
      }
    ]
  },
  "sea": [
    {
      "id": "foam",
      "tiles": 0,
      "hex": "#fbfffe"
    },
    {
      "id": "shoal",
      "tiles": 0.8,
      "hex": "#c4f4e6"
    },
    {
      "id": "shallow",
      "tiles": 2.5,
      "hex": "#7be0cf"
    },
    {
      "id": "lagoon",
      "tiles": 6,
      "hex": "#43c8d0"
    },
    {
      "id": "sea",
      "tiles": 14,
      "hex": "#2fa6d6"
    },
    {
      "id": "deep",
      "tiles": 28,
      "hex": "#2b80cf"
    },
    {
      "id": "abyss",
      "tiles": 48,
      "hex": "#2358b0"
    }
  ],
  "waves": {
    "levels": [
      2,
      4,
      6,
      8,
      10,
      12,
      14,
      17,
      20,
      24,
      28,
      34
    ],
    "ridges": 3,
    "crossSeconds": 24
  },
  "foam": {
    "coreWpx": 5,
    "swashTiles": 0.35,
    "periodSeconds": 6.5,
    "wavelengthWpx": [
      36,
      52
    ],
    "coastRetreatMaxWpx": 12
  },
  "grade": {
    "dayMultiply": "#ffffff",
    "dusk": "#ffd0a0",
    "night": "#8c98de",
    "rain": "#c4d0e8",
    "horizon": "#fdf3dc",
    "nightMeanLumaMin": 0.34
  },
  "light": {
    "key": "#fff1c9",
    "shadow": "#4a3f88",
    "ao": "#5c4c96",
    "contact": "#3b3374",
    "ink": "#2c2a56",
    "shadowLength": {
      "day": 0.75,
      "golden": 1.2,
      "night": 0.5
    }
  },
  "cloud": {
    "body": "#f7f9ff",
    "belly": "#c3d1f2",
    "top": "#ffffff",
    "rim": "#e9f0ff",
    "base": "#aebfe8",
    "puffsMin": 40,
    "puffsMax": 150,
    "radiusShareOfSpan": 0.042,
    "coverageMin": 0.85,
    "rowOpacity": [
      0.9,
      0.82,
      0.78
    ]
  },
  "memoryMB": {
    "limit": 160,
    "mainCanvas": 21,
    "groundChunks": 40,
    "lightLayers": 31,
    "sprites": 48,
    "seaContourPaths": 2,
    "foamAndTufts": 1.5,
    "cloudSprites": 1.6,
    "labels": 6,
    "shadowStamps": 0.5
  },
  "perf": {
    "ceilingFactor": 1.25,
    "finestMaxMs": 24,
    "method": "scripts/world-budget.mjs: software raster, 1440 x 900 at dsf 2, the world's own density (1.5), median of 120 draws with a readback",
    "baselineStillMs": {
      "0.3": 22.7,
      "0.5": 26.1,
      "0.9": 9.7,
      "1.0": 14.5,
      "1.2": 20.9,
      "1.8": 15.5,
      "2.4": 17.7
    },
    "baselineMovingMs": {
      "0.3": 34,
      "0.5": 37.2,
      "0.9": 17.2,
      "1.0": 24.7,
      "1.2": 32.2,
      "1.8": 19.1,
      "2.4": 20.3
    },
    "ceilingStillMs": {
      "0.3": 28.4,
      "0.5": 32.6,
      "0.9": 12.1,
      "1.0": 18.1,
      "1.2": 26.1,
      "1.8": 19.4
    },
    "ceilingMovingMs": {
      "0.3": 42.5,
      "0.5": 46.5,
      "0.9": 21.5,
      "1.0": 30.9,
      "1.2": 40.3,
      "1.8": 23.9
    }
  },
  "districts": {
    "scrap": {
      "ground": "#f1cd8e",
      "walk": "#f3e2c1",
      "accent": "#f08a3c",
      "accent2": "#5b8bd0"
    },
    "market": {
      "ground": "#f5b98a",
      "walk": "#f3dec0",
      "accent": "#ffc93c",
      "accent2": "#36b5a8"
    },
    "campus": {
      "ground": "#eab5a4",
      "walk": "#f1ddc5",
      "accent": "#38c06f",
      "accent2": "#fff0d2"
    },
    "pawn": {
      "ground": "#8fdcd0",
      "walk": "#e1e4cd",
      "accent": "#f2c14a",
      "accent2": "#ff6fae"
    },
    "metro": {
      "ground": "#a9bfdc",
      "walk": "#e6dfcf",
      "accent": "#4aa6ff",
      "accent2": "#e8f2ff"
    },
    "estate": {
      "ground": "#dcb0d2",
      "walk": "#efdccd",
      "accent": "#f6e8c8",
      "accent2": "#e8c56a"
    },
    "auto": {
      "ground": "#b0b8d6",
      "walk": "#e7dece",
      "accent": "#ff5a47",
      "accent2": "#f4f6fb"
    },
    "harbor": {
      "ground": "#a3bbd9",
      "walk": "#e5dece",
      "accent": "#ff9a2e",
      "accent2": "#2f5fa8"
    },
    "industrial": {
      "ground": "#adc0d8",
      "walk": "#e6dfce",
      "accent": "#ffd02e",
      "accent2": "#8aa0b8"
    },
    "tech": {
      "ground": "#c4d4f0",
      "walk": "#ebe3d2",
      "accent": "#22d9ee",
      "accent2": "#9a6bff"
    },
    "farm": {
      "ground": "#9bdc7e",
      "walk": "#e3e4be",
      "accent": "#f1c243",
      "accent2": "#d9553f"
    },
    "creative": {
      "ground": "#f0b6dc",
      "walk": "#f2ddcf",
      "accent": "#9a6bff",
      "accent2": "#ff4fa3"
    },
    "corporate": {
      "ground": "#a8cdf0",
      "walk": "#e6e2d2",
      "accent": "#dff2ff",
      "accent2": "#3f8fe0"
    },
    "finance": {
      "ground": "#a8e0c4",
      "walk": "#e6e5cb",
      "accent": "#25b97a",
      "accent2": "#e2b441"
    },
    "realty": {
      "ground": "#f1b59a",
      "walk": "#f3ddc3",
      "accent": "#f6dcb5",
      "accent2": "#e8795a"
    },
    "exchange": {
      "ground": "#f3dc8e",
      "walk": "#f3e4c1",
      "accent": "#f7c948",
      "accent2": "#2b2417"
    }
  },
  "crateTags": {
    "tool": "#b5c0d6",
    "office": "#f4eed8",
    "prestige": "#a98be0",
    "paper": "#fff0cf",
    "retro": "#e8a15a",
    "electronics": "#6bc4e8",
    "vehicle": "#ff7a63",
    "consumer": "#ff8fb3",
    "trend": "#ff5fb8",
    "scrap": "#b79a78",
    "industrial": "#c9ad7a",
    "training": "#5fd08c",
    "digital": "#8ae8ff",
    "b2b": "#7e93e6",
    "franchise": "#ffd96a",
    "infra": "#9a8ce0",
    "food": "#ffb066",
    "farm": "#b4dc6a",
    "bulk": "#d2bf93",
    "marine": "#5cb9e8",
    "collectible": "#f2c94c",
    "luxury": "#c9a0f2",
    "fashion": "#ff8fc0",
    "ip": "#a98cff",
    "media": "#f06cc0",
    "realty": "#ee9a7a",
    "finance": "#5fd69e",
    "energy": "#ffe05a",
    "medical": "#f2f8ff",
    "home": "#d8b48c",
    "outdoor": "#7cd07a",
    "gem": "#78eed8"
  },
  "people": {
    "shirts": [
      "#ff6a55",
      "#ff9a3a",
      "#ffd84d",
      "#7bd36a",
      "#3ad4b6",
      "#4aa0f0",
      "#7f7bf0",
      "#b383f0",
      "#ff7fb8",
      "#f2f0e6",
      "#e85a8a",
      "#8fe0e8"
    ],
    "hair": [
      "#3a2a22",
      "#6b3f24",
      "#b9772c",
      "#e8c36a",
      "#8a8fa8",
      "#2e2a4a"
    ],
    "skin": [
      "#ffdcb8",
      "#f3c08f",
      "#dca070",
      "#b97a4e",
      "#8e5836",
      "#6b3f2a"
    ],
    "pants": [
      "#4a5a9a",
      "#6b5a8f",
      "#3e6b73",
      "#8a6a4a",
      "#d8cdb8"
    ]
  }
}
```

## Appendix B. Module plan, tests and priority

This is the suggested split so parallel work does not collide. Files are new unless marked.

| Module | Owns | Pure functions to test |
|---|---|---|
| `js/world/palette.js` (new) | every ramp and table of section 2, the face model, `veiled`, the grade | `faceTone`, `veiled`, `gradeFor(hour)`, `seaRamp(d)`, the district table against `js/data` |
| `js/world/sea.js` (new) | depth bitmap, wave levels, motifs, sheen, haze, island shadow | `seaRamp`, `motifsInCell(i, j)`, `waveAlpha(k, t)`, `hazeAt(x, y)`, the distance transform |
| `js/world/coast.js` (new) | smooth shoreline, foam, beach band, cliff faces | `smoothCoast(mask)` (no retreat over protected tiles, at most 12 wpx), `foamPath`, `beachWeight(d)` |
| `js/world/terrain.js` (new) | the vertex colour field and dressing placement | `terrainColour(i, j)`, `dressingAt(tx, ty)` (no marks on roads, pads or props) |
| `js/world/clouds.js` (new) | banks, puffs, shadows, dissolve | `bankPuffs(fp, z, scale)` (coverage at least 85% of the real footprint, every puff overlaps two, count 40 to 150; written in `cloudbank.js`), `dissolveAt(t, d)` |
| `js/world/figures.js` (new) | the doll, accessories, faces, noticing | `lookOf`, `accessoryFor(buyer)`, `noticing(player, buyer)` |
| `js/world/iso.js`, `shading.js`, `props.js`, `kits.js`, `layout.js`, `lighting.js`, `world.js`, `fx.js` (edited) | per section 9 | existing tests, updated where they pin the old look (say so in the commit message) |

Tests to add. `tests/art-direction.test.mjs` (this file's constants and coverage, already present). A world-water anchoring test: in headless Chrome with motion frozen, draw the same scene at two camera positions a few hundred pixels apart with the screen-space ambient layers and labels off and compare the sea region shifted by the camera displacement; skip when Chrome is absent, like the other browser tests. A no-hairline audit: a recording canvas run of `tests/world.test.mjs`'s draws that fails on any `lineWidth` under 1.5 (world space) or any `fillRect` of width or height under 1.5 in world drawing code. A palette audit: every `fillStyle` and `strokeStyle` the world sets is in the section 2 tables, a `mix`/`shade` of them, or a tint of the grade. A coverage test: every `DRAW` kind and every kit has its entry in section 4 (already in `tests/art-direction.test.mjs`).

Priority. P0 (the author's named complaints, do first): the world-space sea (5.1 to 5.3), the smooth coast with foam and beach (5.4, 5.5), the cloud banks replacing the fog (6), the daylight palette and grade (2.1, 2.7), the lit smooth terrain (5.8). P1: the rounded building, tree, prop and character redesign (3, 4), roads and decals (4.5), cliffs (5.6), the island's contact shadow and horizon haze (5.9, 5.10). P2: the detail ladder with overlays (7), micro-props, faces at close zoom. P3: life (boats, gulls, sailboat, noticing hops), the extra motion of section 8.

## Appendix C. Sources and how they were used

Public descriptions read for this document (accessed 2026-10-28). They informed the spirit only; nothing was copied.

- Untitled Goose Game, Wikipedia: flat colours, low-poly untextured models (developer quotes about not texturing things). https://en.wikipedia.org/wiki/Untitled_Goose_Game
- Nintendo Life, "How a joke hatched gaming's most horrible goose": faceless townsfolk like miniature television figures; a storybook flat colour style (as summarised by a search result; the page itself could not be fetched). https://3dsvc.nintendolife.com/news/2019/09/feature_how_a_joke_hatched_gamings_most_horrible_goose
- Dorfromantik, 80.lv interview: an early art style sheet covering shapes, proportions, atmosphere, lighting, colours, textures and perspective; simple, warm, playful, built from basic shapes. https://80.lv/articles/how-dorfromantik-expands-its-cozy-world-through-minimalist-design
- A Short Hike, PlayStation Blog: flat consistent shading, soft outline, readable from as few pixels as possible. https://blog.playstation.com/2021/08/05/crafting-a-tiny-open-world-a-look-behind-the-scenes-at-the-creation-of-a-short-hike/
- Monument Valley, Killscreen and other write-ups (via search summaries): a 30 degree isometric grid, a small disciplined palette. https://killscreen.com/monument-valley-elegance
- Egg, Inc., App Store listing: "crisp and colorful 3D graphics" and a variety of hen houses and vehicles; nothing more specific, so our reading of its chunky rounded style is labelled as our own. https://apps.apple.com/gb/app/egg-inc/id993492744
- Townscaper, Wikipedia and reviews: a distorted grid of rounded pastel buildings on a sea. https://en.wikipedia.org/wiki/Townscaper
- Toon water, 80.lv and tutorials (Roystan, Tuts+): depth-driven shallow-to-deep colour and noise-shaped foam along shores. https://80.lv/articles/cartoon-water-shader-in-ue4/
- Mini Motorways concept art, Dinosaur Polo Club. https://dinopoloclub.com/2023/07/23/behind-the-scenes-concepting-mini-motorways/

Where a source said little (Egg, Inc., Townscaper's rendering, Monument Valley's lighting), the rule in this file is the author's brief and this document's own judgement, not a claim about those games.

## Cheat sheet (pin this up)

**The look.** A sunny toy island: chunky, round, matte, pastel, warm light, violet shade, turquoise sea, fluffy clouds over locked districts. Goose Game flatness plus Egg, Inc. chunk, with more detail the closer you look.

**Ten commandments.** 1 Round, bevel, cap. 2 One sun upper left, shadows to +gx in `#4a3f88`. 3 Saturated pastel, warm light, cool shade, no grey, darkest dark `#2c2a56`. 4 No hairlines (1.5 wpx minimum). 5 Read it at 24 px, 3 values per material. 6 Detail is additive, four bands, crossfade +/- 15%. 7 Land is a place, no tile lattice. 8 Sea is a world-space surface. 9 Daylight by default. 10 Toys breathe slowly and can be still.

**Numbers.**

| What | Value |
|---|---|
| Units | tile 64 x 32 wpx; wpx at zoom 1; zoom 0.129 to 2.4 |
| Bands | far 0.129 to 0.30, mid to 0.70, near to 1.40, close to 2.40; working zoom 0.9 to 1.2 |
| Faces | top `mix(c, '#fff7dc', .10)`; left `shade(c, .92)` + 5% `#ffd9a8`; right `shade(c, .76)` + 16% `#5a52a8` |
| Shadow | `#4a3f88`, 0.26 core + 0.10 penumbra, 0.75 x height to +gx; contact `#3b3374` 0.30 |
| Bevel | `clamp(0.10 x min(w, d), 1.5, 4)` wpx; eaves 0.18 tile; chimney 0.28 tile |
| Windows | 0.30 x 0.44 of the cell, radius 0.16 w, frame 1.4 wpx cream, sill 2 wpx |
| Contour | `mix(shade(fill, .62), '#4a3f88', .2)`, 1.2 / 1.6 / 2 spx at mid / near / close, none at far |
| Min line | `max(1.5 wpx, 1.25 spx / zoom)` |
| Tree | 3 / 5+1 / 7+1 puffs, canopy 55% of the height, trunk 0.12 of the canopy |
| Doll | 34 wpx (player 42), head 0.40, torso 0.30, legs 0.20; eyes 0.07 dots; cheeks `#ff9aa8` |
| Sea | foam `#fbfffe`, shoal `#c4f4e6` (0.8), shallow `#7be0cf` (2.5), lagoon `#43c8d0` (6), sea `#2fa6d6` (14), deep `#2b80cf` (28), abyss `#2358b0` |
| Water motifs | 12 wave levels, 3 ridges per 24 s; crest lens 14 to 26 wpx; curl 7 to 10; glint 3 to 6, at most 40 |
| Coast | smooth, never over 12 wpx from the tile edge; foam 5 wpx, scallop 36 to 52 wpx, 6.5 s, 0.35 tile |
| Cloud | puff body `#f7f9ff`, belly `#c3d1f2`, top `#ffffff`, 3 rows, coverage 85%, 14 to 42 puffs |
| Grade | day none; dusk `#ffd0a0`; night `#8c98de`; rain `#c4d0e8` |
| Motion | nothing under 1.1 s; stops under Calm, Off, reduced |
| Budget | 1.25 x baseline at 0.9 to 1.2; 24 ms at 2.4; 160 MB at dsf 2 |

**Always.** Contact shadow under everything. Filled shapes, never thin lines. Tint every neutral. Rest pose looks designed. Test on the five evidence captures.
