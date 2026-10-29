# Atmosphere, light and cloud (track T2, as built)

What the T2 track built on `v2/art-atmos` for the layers `clouds`, `grade`, `weather`, `field` and `particles` of `docs/RENDER_PLAN.md`. Presentation only. Every layer is registered and every flag is still `legacy`: the picture is the old one until the orchestrator flips them (section 5).

## 1. What each module does

| module | what it holds |
|---|---|
| `cloudbank.js` | unchanged: where the puffs of a bank stand, how much of a district they cover, the cost model the plan's `clouds` row is built on |
| `cloudpaint.js` | how a bank is painted: `bankOf` (lobes = the puffs plus small cusp lobes on the outline, made once), `paintBank` (a translucent floor and opaque lobes in shells), `bankTones` (the colours of the hour), `lobeLift` (the dissolve), `crescent` (the closed form of a two-arc crescent) |
| `clouds.js` | the V2 `clouds` layer: the banks over locked districts, their shadows, the padlock, the tall things standing out of the cloud, the dissolve, the reduced-motion cross-fade, the sky's own small clouds over the sea; the legacy `drawFog` stays |
| `grade.js` | the V2 `grade` layer: `Grade extends Lighting`, the air as one full-size bitmap mixed small and stretched in bands, the multiply tint, the lamp pools |
| `ambient.js` | the V2 `weather`, `field` and `particles` painters: rain, confetti, pollen, fireflies, gulls, butterflies, smoke, coins, stars, rings |
| `atmos.js` | registers the three screen-space layers; legacy `drawGrade`, `drawWeather`, `drawField`, `drawParticles` stay |
| `palette.js` | `tintFor` (the grade's multiply, now with the evening at its full gold) and `setVeil` (below) |

## 2. The look in numbers

**Cloud.** A bank is the plan's lattice: 85 puffs on three tiers (coarse 35, far 14). A tier is a translucent floor (`LOOK.floor` 0.38; the whole tier as one path so overlapping puffs blend once and what is under shows as a ghost) under opaque lobes (every lobe on the outline, 12% of the others), each lobe drawn in four shells: the shaded edge (belly blue, down and right), the body, a lit shoulder and a crown (`SHELLS`). The outline carries cusp lobes of 0.4 to 0.6 of their puff, so it scallops at two scales. Back tier bluer and paler, front tier the lit one; at the golden hour the tops catch the sun and the bellies go violet. The shadow is two quads of `#5a5fa0` (0.18 and 0.08) swept towards +gx by 2.6 x the sun's shadow length; a gold padlock bobs on the bank from zoom 0.42; towers, the IPO tower and cranes stand out of the dome in their own colour with a collar of puffs. The far bank (under 0.18) has no floor: a handful of opaque puffs. Banks hand over by a short band in which the finer bank grows in while the coarser one shrinks to 0.7 (both opaque, a pure function of the zoom: 0.18 to 0.22 and 0.62 to 0.70). The dissolve is the art direction's: 2.6 s from the gate outward, each lobe waits 0.35 s x (its distance / the bank's span), then rises 36 world px, shrinks to 0.6 and fades over 1.1 s. Under reduced motion the engine has no reveal, so the layer remembers a district it drew locked and cross-fades the bank out in 400 ms.

**Grade.** Plain white by day (nothing multiplied from sun hour 07:00 to 16:59), the day air is a warm wash from the upper left against a cool one from the lower right and a vignette of warm violet, 12% at the corners; the haze (`hazeAt`) is nothing from zoom 0.7 and full at 0.2, a pale blue-white over the upper 60%. The golden evening is the multiply `#ffd0a0` at 0.92 of the dusk, a rose sky, a sun glow in the upper left and five soft god rays; the night is `#8c98de`, a periwinkle air with a moon glow and a plum vignette, never under luma 0.34 (held by a test on the world's own colours). The crossfade of day and night keeps the blue back while the dusk is high. A lamp under a cloud shines at 0.3.

**Air.** Rain: three depths of rounded pastel streaks 1.6, 2.2 and 3 px. A surge: round confetti and a pink wash. Pollen and fireflies as before in warm light. Gulls: one in 0.62 of the 2,000 px sky cells, a lap of 60 to 90 s, at zooms under 0.8 (gone by 1.3). Butterflies: one in each 9-tile meadow cell whose home is land, a figure of eight, from zoom 0.95. Sky clouds: one in 0.55 of the 2,600 px cells, crossing it in about five minutes, over the sea only, under zoom 0.9, with a shadow on the water. Coins turn and are gold with a lit crescent; sparks are four-pointed stars; rings are a soft double ring. Everything is a function of `w.vt`, which is 0 under Calm, Off and reduced motion: no gull, butterfly or pollen is drawn then and the picture stands still.

## 3. Hooks outside the track's files

1. `iso.js`: `setVeil(fn)` and one line in `fogged`: while `FLAGS.clouds === 'v2'` a colour under cloud is `veiled`, never darkened (plan section 8, T5 item 10). `palette.js` installs the veil when it loads; `iso.js` now imports `FLAGS` from `stack.js` (which imports nothing). Nothing changes while the flag is legacy.
2. `docs/RENDER_PLAN.md`: the three new modules in T2's array of the ownership block.
3. For T3 and T4: `env.smoke`. A building's `live()` part pushes `{ wx, wy, size }` (world px of the chimney's top) and the `field` layer draws round pastel puffs that rise and drift with the wind, then empties the queue. It replaces `props-common.js`'s `smoke()`. `env.smoke` is created by the pusher: `(env.smoke ||= []).push(...)`.

## 4. Cost, measured

`scripts/world-budget.mjs` method (software raster, 1440 x 900 at dsf 2, density 1.5, median of 120 draws with a readback, still / moving), the same machine and session as the baseline column:

| scene | legacy | V2 | ceiling |
|---|---|---|---|
| fit 0.129 | 12.4 / 16.0 | 16.1 / 20.2 | 16.6 / 21.8 |
| mid 0.3 | 22.2 / 30.7 | 23.6 / 34.8 | 28.4 / 42.5 |
| mid 0.5 | 24.3 / 33.2 | 18.9 / 30.0 | 32.6 / 46.5 |
| coast 0.9 | 8.4 / 15.6 | 6.9 / 14.4 | 12.1 / 21.5 |
| district 1 at 1.0 | 14.1 / 22.3 | 10.2 / 20.3 | 18.1 / 30.9 |
| district 3 at 1.2 (locked) | 20.0 / 29.5 | 13.4 / 24.7 | 26.1 / 40.3 |
| district 1 at 1.8 | 14.9 / 17.8 | 8.6 / 11.8 | 19.4 / 23.9 |
| district 1 at 2.4 | 16.2 / 18.2 | 8.0 / 9.4 | 22.1 / 24.0 |

The working zoom is 25 to 40% faster than legacy because the legacy fog (a 3175 x 1969 pool blitted per locked district and blurred sprites) cost 10 to 16 ms there. The whole-island view is the tight one (16.1 against 16.6): its clouds are 7 ms (a bank is a hundred discs; a fill costs about 7 microseconds whatever its size, and a union path of a whole shell was measured SLOWER, 1.2 times, so the shells are drawn disc by disc). The grade is 1 ms (one 1:1 stamp) by day and about 4 ms at dusk and night (the multiply tint is one non-source-over pass over the window, 3 ms at density 1.5, as `lighting.js` always paid). Memory at dsf 2 (the pixel ledger, every hour): `light.air` 20.7 MB and `light.src` 2.3 MB, 23.0 MB in all, where `lighting.js` held up to 83 MB at dusk (the plan allowed 31); the clouds hold none.

## 5. Flipping the layers

`setFlags('clouds:v2,grade:v2,weather:v2,field:v2,particles:v2')`, or the same in the address as `?layers=`. The five flip together: the clouds are lit by the grade, the veil follows the clouds flag, and the weather, field and particles share one file. Tests that pin the old look and must change with the flip: `tests/world-stack.test.mjs` (the table's "every flag starts as legacy"), and the world's colour-helper test of `fogged` (it pins the old arithmetic; with the clouds v2 it is `veiled`). Delete after the flip: `drawFog`, `Lighting.fog` and `fogSprites` in `lighting.js`, `drawGrade`'s legacy body, `drawWeather`, `drawField` and `drawParticles` in `atmos.js`/`fx.js`, `FOG_DIM`'s darkening (`iso.fogged`'s legacy branch).

## 6. Not done, and what only the real window shows

- Chimney smoke is a hook, not a sight: no building calls it yet (T3 and T4 do, section 3).
- The window (a puff-sized hole near the gate, art direction 6.4) is not built; the dissolve, the padlock and the stand-out are.
- The Egg, Inc. gloss on a puff (a soft gradient) is not used: a gradient fill is 2.6 ms a megapixel and the plan forbids it. The softness is the shells.
- A bank's bob (1.6 world px) and swell (2%) are drawn, and are all but invisible at the far zoom; the slide (14 px over 48 s) is the visible drift.
- The pictures taken for this report put the legacy ground under the new air; the integrated look needs T1, T3 and T4's flips beside it.
