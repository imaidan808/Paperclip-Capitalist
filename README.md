# Paperclip Capitalist

A gamified entrepreneurship simulation for higher education. Students turn **one paperclip** and no cash into an automated business over a virtual **90-day** run, balancing idle-game progression against real curriculum: asset valuation and arbitrage, working capital, customer acquisition cost vs lifetime value, and macro risk. A class shares one economy, so the obvious deal gets crowded and the Creativity Engine punishes the herd.

Runs entirely in the browser. No build step, no dependencies, no accounts, no tracking.

**The game is a living 2.5D world.** An isometric island of sixteen districts, from the Scrap Yard to the Global Exchange, joined by roads, bridges and a ferry, mirrors your run: buyers walk in with their offers over their heads, auction pallets and your stock are crates, every pipeline is a building that grows with its level, freight is a truck on the avenue, the virtual hour sets the light, and a credit crunch brings rain. Click things to play: a buyer to pitch, a pallet to buy, a plot to hire, the bank to borrow. A dock of seven icons opens the drawers (Stock, Market, Crew, Bank, Travel, Codex, Quests). Everything in the world is also in a keyboard-accessible list.

## Play
```bash
npm start            # http://localhost:8080
npm test             # the whole suite: formulas, engine, Deal Room games, content, UI, multiplayer (real relay), accessibility, the 2.5D world
npm run calibrate    # pacing table for a heuristic player: npm run calibrate -- trades,pro ops 7
npm run balance      # plays all 66 pairs of Backgrounds (5 seeds each, about 3 minutes)
```
Start with the **Academy** (short guided missions, ungraded), then draft two **Backgrounds** out of twelve. Everyone starts with one paperclip and $0; the Backgrounds are the only difference between founders.

`npm run calibrate` and `npm run tune` take the two Background ids as `a,b` and stop with a message on an id the game does not know. The relay's own dependencies are installed with `npm install --prefix server`.

## Put it on GitHub Pages
1. Create a repository and push this folder to `main`.
2. In **Settings, Pages**, set the source to **GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` runs the tests and deploys only if they pass. Your site appears at `https://<user>.github.io/<repo>/`.

## Multiplayer
| Mode | Setup | Good for |
|---|---|---|
| Solo | none | Practice. Simulated rivals fill the leaderboard; a Practice Partner trades with you |
| Same browser | Instructor creates a room, students open the link in other tabs (use `?slot=name` to keep saves apart) | Demos, a shared lab machine, development |
| Relay | `cd server && npm install && npm start`, deploy anywhere that serves WebSockets (Render, Fly, a campus VM) behind TLS, then enter `wss://your-relay` when creating or joining a room, or add `&relay=...` to the student link | A real class on many devices |

The relay forwards messages and keeps the latest snapshot per student in memory; it stores nothing on disk. A connection brings the secret key its browser keeps beside its Founder ID (the app does this), and the relay refuses a second connection for an ID with another key, so a classmate cannot take the instructor's seat or another student's name with an ID read off the wire (docs/ARCHITECTURE.md). A relay that cannot listen (the port is taken) exits with an error instead of looking started.

## For instructors
Create a room, pick a pace, press Start. The dashboard shows wealth Gini (alert above 0.65), a niche saturation heat map, stalled founders, flagged peer trades and a pre-filled gradebook; controls pause, speed, rewind (10 days), deploy shocks, and scale friction and audit frequency. See [docs/FACULTY_KIT.md](docs/FACULTY_KIT.md) for the syllabus, week map and rubrics.

## What is and is not here
Built and tested: the 2.5D world and island map (Canvas 2D, no libraries), the full simulation across sixteen districts, all twelve Backgrounds, the Deal Room's skill games, the Codex, quests and achievements, the Academy, three shocks plus algorithmic events, bank and margin calls, audits, client tiers, peer exchange with the +/-40% guardrail, instructor dashboard, debrief with reflection workbook, WCAG-checked themes.

**Not built** (see [docs/COMPLIANCE.md](docs/COMPLIANCE.md)): LTI 1.3 grade passback, SAML/OIDC SSO, SOC 2 / HECVAT attestations, server-side authoritative state. Those belong to a hosted service; [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) sketches the path. Where the design brief contradicted itself I made a call and recorded it in [docs/BALANCE.md](docs/BALANCE.md).

## Layout
`js/audio/` is the generated sound layer (Web Audio, no audio files: a collector, the buses and a master chain, sixteen ambient beds, the repair dial tone and a Classroom preset; [docs/AUDIO.md](docs/AUDIO.md) is its contract, `/dev/sounds.html` its audition page, `npm run audio` its render check); `js/config.js` holds the economy's numbers, `js/data/` the sixteen districts, the assets, the buyers and the twelve Backgrounds; `js/engine.js` is the DOM-free simulation; `js/ui/` the screens. [docs/V2_DESIGN.md](docs/V2_DESIGN.md) is the design contract. MIT licensed.
