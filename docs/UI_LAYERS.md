# The game screen: layers, anchors and tokens

The screen is a stack of absolutely positioned pieces over the 2.5D canvas. Nothing here changes what a click does; it is how the pieces are placed, layered and drawn.
Code: `css/shell.css` (placement), `css/styles.css` (tokens), `js/ui/shell.js` (markup, anchors, render loop), `js/ui/hud.js`, `js/ui/worldview.js`, `js/ui/common.js` (toasts, dialog, burst).

## Layers (z-index)
One ladder, tokens in `css/styles.css`. `.stage` is its own stacking context, so 0 to 9 are relative to it; 60 and up are page level. A `<dialog>` is in the browser's top layer and beats all of it.

| z | token | what |
|---|---|---|
| 0 | `--z-world` | the canvas and its host |
| 2 | `--z-world-ui` | camera buttons, the accessible list |
| 3 | `--z-scrim` | the two soft gradients (`.stage::before` over the HUD, `.stage::after` over the dock) |
| 4 | `--z-aux` | goal tracker, news ticker |
| 5 | `--z-hud` | the HUD bar; an open list view |
| 6 | `--z-tip` | tooltip (kept off the HUD and the dock by geometry, see below) |
| 7 | `--z-dock` | the dock |
| 8 | `--z-drawer` | the drawer, or the bottom sheet |
| 9 | `--z-overlay` | coach marks and sheets the Academy lays over the stage |
| 60 | `--z-toast` | toasts |
| 80 | `--z-fx` | the burst canvas |
| 99 | `--z-skip` | the skip link |

No blur or `backdrop-filter` anywhere over the canvas (it redraws every frame, so a blur is repainted every frame). Depth comes from the scrims, a 1px top light and layered shadows (`--elev-1`, `--elev-2`), all tokens that high contrast turns off.

## Anchors
Every piece is placed against the HUD above it or the dock below it, never a guessed height. `shell.js` measures both bars with a `ResizeObserver` and writes `--hud-h` and `--dock-h` on `<html>` (the values in `styles.css` are only the fallback for the first frame). So a HUD that wraps, a dock that compacts, a bigger text size or a notch moves the tracker, ticker, drawer, list and toasts with it. Gutters are `--edge-t/r/b/l`, never less than the device's safe-area inset (`viewport-fit=cover` in `index.html`).

Three layouts:

| | when | HUD | drawer | tracker | dock |
|---|---|---|---|---|---|
| wide | wider than 900px | one row, numbers centred on the screen | panel on the right | card, top left | pill, labels |
| narrow | 900px and under | two rows, numbers share the second | bottom sheet with a grabber (820px and under and tall); a panel when short | one-line chip | fills the width; icon only under 520px |
| compact | 520px high and under | one slim row | panel on the right | one-line chip | icon only |

While a sheet is open the tracker, ticker, camera buttons and list are `visibility: hidden`, so keyboard focus never lands on something the sheet covers. The sheet closes by its close button, Escape, or a drag down on its header (`shell.js`, `touch-action: none` on the header only).

Tooltip (`worldview.js`): positioned with one transform inside the free band between the HUD's foot and the dock's top, flipped to the other side of the pointer when it would run off. Toasts sit above the dock, in the corner the drawer does not use; on a phone they span the width above the dock.

## Scales
Type (`--t-micro` to `--t-2xl`, in rem so Settings > Text size scales them; an 11px floor), spacing (`--sp-1` to `--sp-6`, a 4px grid), radii (`--r-1` to `--r-pill`), touch target (`--target`: 2.4rem, 44px on a coarse pointer). Above 2200x1200 the whole UI steps up 20% (`--ui-scale`). Money uses tabular numerals so it does not jiggle.

## Draw loops
- Burst (`common.js`): one pooled particle array, one `requestAnimationFrame` loop that stops when nothing is alive, physics by elapsed time, and a canvas that holds pixels only while particles fly. Nothing in reduced motion.
- Live bars (`shell.js`): listed once per render, each width worked out first and written only when it moved by 0.1%, the loop sleeps while the tab is hidden or the clock is stopped.
- Render: attributes are written only when they change, the drawer's scroll position is read only when its markup is replaced, the accessible list is built only while it is open.

## Checking it
`node scripts/shots.mjs` for pictures, `node scripts/perf.mjs` for the world's cost. `tests/a11y.test.mjs` holds the colour tokens (the layout tokens are a second `:root` block, so they are not in its way).
