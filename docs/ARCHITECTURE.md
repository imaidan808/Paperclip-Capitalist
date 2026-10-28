# Architecture

```
index.html          shell: skip link, live regions, <dialog>, fx canvas
css/styles.css      tokens first (WCAG-tested), then components
js/config.js        every economy number (ECON, fees, loans, shocks, skills); re-exports the content below
js/data/            the content: sixteen districts, the asset classes, the buyers (tier1..tier4.js), the twelve Backgrounds (perks.js), the validator (schema.js)
js/market.js        pure formulas: utility, Creativity Multiplier, EEI, variance, Gini, FMV
js/engine.js        the simulation: one step = one virtual hour; deterministic; no DOM
js/deal.js          the Deal Room's glue: plans a deal, runs its stages (Read, Pitch, Close, Bid, Fix) and hands the result to the engine
js/play/            the five skill games (inspect, pitch, haggle, auction, repair): pure, deterministic, each with an autoplay for Quick
js/meta/            the Codex, quests, achievements and daily bounties, the Academy, and the Progress tracker that scores them from the engine's events
js/cohort.js        ghost herd, synthetic students, peer aggregation (the "rest of the class")
js/session.js       clock, autosave, room protocol, leaderboard, gradebook, practice partner
js/net.js           transports: BroadcastChannel (tabs) and WebSocket (relay)
js/world/           the 2.5D world: iso.js (projection + primitives), island.js and layout.js (the island and its slots), props.js (scenery art), world.js (camera, input, entities, light and weather)
js/ui/              shell.js (the game screen), worldview.js (the DOM around the canvas), drawers/ (the seven dock drawers), deal.js, hud.js, draft.js, academy.js, instructor.js, debrief.js, common.js
server/relay.mjs    optional classroom relay (ws); server/static.mjs local file server
tests/              engine, content, multiplayer (spawns the real relay), accessibility, UI; bot.mjs drives the heuristic player for calibrate.mjs, balance.mjs and tune.mjs
```

## Engine contract
`new Game({perks: [a, b], specialty, handle, pid, startHour, seed})`, where `perks` are the ids of exactly two of the twelve Backgrounds in `js/data/perks.js` (an unknown id is dropped, so the game would start without it), then `game.advanceTo(hour)` and the action methods (`pitch`, `buyLot`, `repair`, `sellPool`, `ship`, `hirePipeline`, `draw`, `repay`, `resolveAudit`, `exit`, `createOffer`/`acceptOffer`/`finalizeOffer`). Every action returns `{ok, msg, ...}`. State is a plain JSON object (`game.s`); the RNG seed is part of it, so a save replays identically. The environment (`game.env`) injects the cohort, difficulty and world seed. Quests, achievements, daily bounties and the Codex live in `game.s.meta` and are scored by `Progress` (`js/meta/progress.js`) from the events the engine emits (`game.onEvent`).

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
`World` (js/world/world.js) is a Canvas 2D renderer with no dependencies. The island is a tile grid in isometric projection (`sx = (gx - gy) * 32`, `sy = (gx + gy) * 16 - gz`); the sixteen districts sit on plateaus at different elevations joined by roads, bridges and a ferry. Each game tick `sync()` reconciles *entities* with live game state: buyer NPCs per lead (they walk to a slot and walk away when the lead goes), pallets per lot, crates per stored asset, buildings per pipeline (height = level), empty plots, trucks per freight run. Static scenery is a deterministic list in `layout.js`. The frame loop draws ground, then depth-sorted props and entities, then screen-space passes (night multiply, lights, rain, labels, bubbles). Hit shapes are recorded while drawing and picked back-to-front.

Rules that keep it honest: the world never changes game state itself (clicks go through `api.activate` to the same `acts` as the dashboard); one broken object cannot blank the scene (each item draws inside try/catch and logs once); the clock-driven day/night is rate-limited and fixed at fast clock speeds (no strobing); reduced motion draws only on change; quality drops automatically (30 to 20 fps, lower device-pixel ratio) on a slow machine. `tests/world.test.mjs` draws every entity type, district, mode, hour and shock against a recording canvas.
