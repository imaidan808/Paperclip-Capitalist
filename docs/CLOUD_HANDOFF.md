# Cloud handoff: the whole-product audit and repair pass

Written 2026-10-29 for a cloud session. Read this file, then `docs/V2_DESIGN.md` (the contract) and `docs/ARCHITECTURE.md`.
Nothing on this branch has been merged to `main` or deployed; the live site is still the old v1 + 2.5D build. Do not push to `main`
(the Pages workflow deploys on a push to `main` and it refuses a test marked `todo`). Work on a branch and say what you did.

## What this snapshot is

One integrated tree: the v2 game plus four later pieces that were built on separate branches and merged here in this order.

1. **v2 finish and repair rounds** (the Academy card at phone sizes, the hire dialog's sticky foot, the case-sensitive Pages address
   `https://imaidan808.github.io/Paperclip-Capitalist/`, the same-browser classroom where each student tab gets its own identity and saved game).
2. **Scroll wheel and Mac trackpad zoom** (`js/world/camera-input.js`, pure; the hook in `js/world/world.js`).
3. **The generated sound layer** (`js/audio/*`, `docs/AUDIO.md`, `dev/sounds.html`, `scripts/audio-check.mjs`): five verification rounds done.
4. **The art overhaul, round 1** (`docs/ART_DIRECTION.md`, `docs/RENDER_DIAGNOSIS.md`, `docs/RENDER_PLAN.md`; a layer stack in `js/world/stack.js`;
   a world-anchored sea, smooth coast, clouds instead of fog, a bright grade, V2 buildings and props, raster quality). One judge round and one repair round were done.

Merge fixes made when joining these (all in the last commit): zoom now anchors to the camera's own numbers because the art branch draws from whole
device pixels; the Deal Room header sticks only in windows at least 561 px high; the sticky census, the module list test and the README know the sound layer.

The full suite is about 1,990 tests. Run `node --test --test-concurrency=4 tests/*.test.mjs` (15 skip: the relay tests need `npm install` in `server/`).
Known failing-on-purpose: one test is marked `todo` (below, item 1).

## Jobs for the cloud session, in priority order

### 1. The Academy coach card (phone and tablet sizes): fix it by RULE, proved by a matrix sweep
The card floats over the real game and has been found over controls at 844x390, 640x360, 360x640 and 768x1024 in three rounds of one-case patches.
Open now:
- With a drawer open the card can sit over the drawer's Close button (PB-1) and falls to a shape that draws the step's words and the 20-second hint at 0x0 (PB-3).
- `tests/rep-card.test.mjs` lesson 10 at 640x360 is `todo`: the card covers "Lots 3" instead of folding to its tab (it appeared when the sound layer joined: the Deal Room header now holds the Sound and Dial tone switches).
- Half-written work is in `docs/handoff/repair2-card.patch` (a sweep script `scripts/academy-sweep.mjs` plus `scripts/academy-sweep-page.js`, tests `academy-matrix` and `academy-sweep`, and edits to
  `js/ui/academy.js`, `academy-sandbox.js`, `shell.js`, `css/ui-academy.css`, docs and several tests). It was cut off by a usage limit and is untested: apply it (`git apply --3way`), finish it, or rewrite it.
- Wanted: a reusable matrix sweep (every lesson and step x six viewports x each state: drawers, dialogs, hint due, toast, large text, touch and mouse) that reports any control the card covers (real taps and elementFromPoint) and any step words or hint drawn at zero size; then a rule that makes the whole class impossible (a reserved band, or a guaranteed fold to a labelled tab, with the words always one tap or key away and announced to screen readers); then a clean sweep. Wide layouts must look unchanged.

### 2. Sound layer, last open items (`docs/handoff/audio-open-items-r2.json`, partial work in `docs/handoff/audio-r3e.patch` and `docs/handoff/audio-r3x.patch`)
R3-1 the first sound after the AudioContext is made is up to 9.8 dB quiet (cold compressor); R3-2 the repair dial tone is under the quietest tiny sound on a quiet laptop for its low notes;
WA-1 run-scoped resolver state leaks into the next run; UX1 a bare click (assistive technology) never unlocks audio; UX2 a student whose saved settings have `touched: true` joins a room unannounced at their own volume;
UX3 an instructor of 40 has only a Quiet option (wanted: Normal, Quiet, Off, Off being room-scoped); UX4 the audition page's contents links land under its sticky bar.
Gate: `node scripts/audio-check.mjs --calibrate --pools` prints all checks pass. Also open: `js/audio/audition.js` is used only by `dev/sounds.html` but is staged with `js/`; move it under `dev/`.

### 3. Art overhaul: judge rounds 2 and 3, and the page weight
Judge round 1 (independent judges reading before/after PNGs from `scripts/world-shots.mjs`) scored: change noticeable 9 to 10 of 10 in every area; quality 6 to 7.5; edges (glitches, seams, aliasing) 5 to 6.5; 15 scores under 8 and 34 blocker or major issues.
Repairs for that round are merged but were never re-judged. Do: render the shot set (`node scripts/world-shots.mjs --help`), re-run a judge pass against the baseline folder (render the baseline from commit `adcd991` with the same script),
fix what remains until nothing scores under 8, then write the "As built" section of `docs/RENDER_PLAN.md`. Known gaps listed by the tracks: wave bands are static (not rolling); no boat wakes, beach dressing or road curbs;
chimney smoke is a hook nobody calls; far-zoom clouds are a live bank (about 7 ms at fit against 3.5 planned); a popcorn of puffs while a zoom rests between bank scales; the first bake of a window costs 250 to 400 ms; frame rates were only measured in headless software Chrome.
**Page weight regressed**: the staged site is now 150 requests, about 952 KB gzipped, 2,584 KB of JavaScript (it was 71 requests, 561 KB, 1,500 KB before the sound layer and the art). The title screen alone needs 27 modules. Lazy-load the world's art modules and the audio engine
behind the first interaction or the game screen, and put a budget test on it (`scripts/arch-figures.mjs --write` refreshes the figures in `docs/ARCHITECTURE.md`).
Presentation only: hit testing, layout geometry and gameplay must stay identical to `adcd991` (the regression auditor's check: hover and activate on a dense grid of points, same seed).

### 4. The whole-product audit (the original plan)
Re-run the multi-lens audit on the integrated product (engine and balance, session and classroom, the UI at all sizes, accessibility, security of the relay and static server, performance, content, docs against code),
loop until a round finds nothing new, repair with a regression test for each fix (a test that fails without the fix). The first audit of v2 found 99 issues; expect far fewer.
Things already known and open: Second-Chance Hustler is the weakest Background (0.66 of the median pair at 4 hours; see `docs/BALANCE.md`); the first-load JS weight above;
a real hardware check of the wheel/trackpad feel (the numbers were tuned without a trackpad), a screen reader pass, Safari and Firefox runs (everything was checked in headless Chrome and, for the world, the system WebKit only where noted).

## Working notes

- Tools: `scripts/cdp.mjs`, `boot.mjs`, `shots.mjs`, `perf.mjs` (headless Chrome), `scripts/world-shots.mjs`, `world-metrics.mjs`, `world-ab.mjs` (deterministic art shots and metrics), `scripts/audio-check.mjs`, `scripts/stage.mjs` (the Pages artifact).
- Serve with `PORT=8090 node server/static.mjs`. Each headless Chrome needs its own `--remote-debugging-port` and `--user-data-dir`. A hidden page throttles `requestAnimationFrame`: call `pc.world.draw()` twice before a shot.
- The repo is public. Commit as the GitHub noreply identity already configured; never put the author's email in history.
- The author's rules (see `docs/V2_DESIGN.md`): equal start (one paperclip), skill-based trades, a game that teaches; the art direction is a bright toy diorama, not a flat vector ad.
