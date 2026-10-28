# Architecture

```
index.html          shell: skip link, live regions, <dialog>, fx canvas
css/styles.css      tokens first (WCAG-tested), then components
js/config.js        every balance number and all content (assets, buyers, events, loans)
js/market.js        pure formulas: utility, Creativity Multiplier, EEI, variance, Gini, FMV
js/engine.js        the simulation: one step = one virtual hour; deterministic; no DOM
js/cohort.js        ghost herd, synthetic students, peer aggregation (the "rest of the class")
js/session.js       clock, autosave, room protocol, leaderboard, gradebook, practice partner
js/net.js           transports: BroadcastChannel (tabs) and WebSocket (relay)
js/world/            the 2.5D world: iso.js (projection + primitives), layout.js (island, slots), props.js (scenery art), world.js (camera, input, entities, light and weather)
js/ui/worldview.js  the DOM around the canvas: toolbar, HUD, tooltip, accessible list view
js/ui/*.js          views.js (pure HTML), game.js (actions), instructor.js, tutorial.js, debrief.js, common.js
server/relay.mjs    optional classroom relay (ws); server/static.mjs local file server
tests/              engine, multiplayer (spawns the real relay), accessibility; bot.mjs + calibrate.mjs
```

## Engine contract
`new Game({profile, specialty, handle, pid, startHour})`, then `game.advanceTo(hour)` and the action methods (`pitch`, `buyLot`, `repair`, `sellPool`, `ship`, `hirePipeline`, `draw`, `repay`, `resolveAudit`, `exit`, `createOffer`/`acceptOffer`/`finalizeOffer`). Every action returns `{ok, msg, ...}`. State is a plain JSON object (`game.s`); the RNG seed is part of it, so a save replays identically. The environment (`game.env`) injects the cohort, difficulty and world seed.

## Room protocol (JSON over either transport)
| Message | From | Meaning |
|---|---|---|
| `hello`, `bye` | anyone | presence |
| `snap` | student | public snapshot: net worth, skills, 48h niche counts, shock log, public inventory |
| `clock` | instructor | `{hour, speed, paused, difficulty, ghosts, algo}`; students adopt only the instructor's (or, with no instructor, the lowest Founder ID's) |
| `inject`, `rewind` | instructor | deploy a shock (idempotent by id) / restore daily checkpoints |
| `offer`, `accept`, `decline`, `withdraw` | student | peer swap: proposer escrows, recipient validates and delivers, proposer finalises |
| `flag` | student | a blocked offer outside +/-40% of fair value |
| `royalty` | student | daily payment on a royalty stream |

## Moving to a scalable, authoritative backend
1. Run `engine.js` on the server per student (it has no DOM), accept actions over HTTP/WebSocket, and persist `game.s` per Founder ID in Postgres with point-in-time recovery.
2. Move the cohort aggregation (`cohort.js`) server-side so niche volumes cannot be spoofed.
3. Validate peer trades server-side with the same `checkOffer`.
4. Add an LTI 1.3 launch to mint the pseudonymous Founder ID and an Assignment and Grade Services call from the gradebook export.
5. Keep the front end unchanged: swap `net.js`'s relay for the API.

## The 2.5D world
`World` (js/world/world.js) is a Canvas 2D renderer with no dependencies. The island is a tile grid in isometric projection (`sx = (gx - gy) * 32`, `sy = (gx + gy) * 16 - gz`); three districts sit at different elevations joined by ramps. Each game tick `sync()` reconciles *entities* with live game state: buyer NPCs per lead (they walk to a slot and walk away when the lead goes), pallets per lot, crates per stored asset, buildings per pipeline (height = level), empty plots, trucks per freight run. Static scenery is a deterministic list in `layout.js`. The frame loop draws ground, then depth-sorted props and entities, then screen-space passes (night multiply, lights, rain, labels, bubbles). Hit shapes are recorded while drawing and picked back-to-front.

Rules that keep it honest: the world never changes game state itself (clicks go through `api.activate` to the same `acts` as the dashboard); one broken object cannot blank the scene (each item draws inside try/catch and logs once); the clock-driven day/night is rate-limited and fixed at fast clock speeds (no strobing); reduced motion draws only on change; quality drops automatically (30 to 20 fps, lower device-pixel ratio) on a slow machine. `tests/world.test.mjs` draws every entity type, zone, mode, hour and shock against a recording canvas.

### Presentation notes (the polish pass)
These are drawing and layout rules only; none of them reads or changes game state.
- **Pixel density.** The canvas is drawn at the screen's density to 2x. Where the 2D canvas is on the CPU (a browser with the GPU off or emulated: it refuses a WebGL context asked for with `failIfMajorPerformanceCaveat`, see `softwareRaster` in `gfx.js`) the cap is 1.5x, because every full-window layer is a pass over all of its pixels on the main thread. The quality governor takes a further quarter off at its fourth tier and gives it back below its second, so a picture on the edge never reallocates the canvas back and forth.
- **Light layers.** `Lighting` makes at most one full-size layer a frame (`perFrame`), so the first dusk spreads its night, crossfade and shafts over three frames instead of one 70 ms frame; a frame without its crossfade stamps the day's air alone. The shafts are baked into that crossfade (`Lighting.mix`, eight steps of their strength) and are never stamped on their own: on a CPU-drawn canvas a plain full-window stamp costs 0.9 to 1.6 ms and a stamp or fill in the additive or multiply composites 3.0 to 3.6, so a dusk frame is one plain stamp, the grade's one multiply tint and the light pools, and `World.draw()` at dusk is about 1 ms where it was 17 (the raster of the additive stamp ran inside it).
- **Sprites.** A zoom that is moving shows the prop's sprite of the zoom before, scaled; a sprite of more than 2.2 Mpx is built only once the scale has rested; the memory budget grows with the density. `World.detach()` gives every bitmap back (`release()`).
- **The camera buttons.** They stand over one edge of the window, so `fit()`, the camera clamp, the district name tags and the map's cards use the part they leave free (`World.inset`, measured by `worldview.js` from the real buttons).
- **Dialogs and the Academy card.** A closed `<dialog>` is never drawn (`dialog:not([open]) { display: none }`, and `dlg` takes its class off when it closes), and when the control that opened it is gone the cursor goes to the open drawer's title, else to the game. The Deal Room's entrance animation fills `backwards`, never `both`: a held `transform: none` makes the sheet the containing block of every fixed box inside it, the coach layer among them. The coach card follows into any open Deal Room (a step about a buyer or lot in the world is shown there with no ring), the layer is marked `data-keep` so `setHTML` leaves it where it is when the sheet repaints, and `placeCard` takes weighted rects to stay off (`coverScore`): the control the keyboard is on outweighs everything else, then the drawer and dock, the game's buttons, and in a dialog its own controls. A lesson's HUD shows no level, XP or skill point of its own (`game.sandbox` marks a lesson's game), and `hud-clock` is the play button alone.
