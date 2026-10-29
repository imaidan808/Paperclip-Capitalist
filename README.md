# Paperclip Capitalist

A free browser game for university entrepreneurship courses. You start with **one paperclip and $0** and trade your way up through sixteen districts over a virtual **90-day** run, learning asset valuation and arbitrage, working capital, customer acquisition cost against lifetime value, negotiation and macro risk by doing them. A class shares one economy, so the obvious deal gets crowded and the Creativity Engine punishes the herd.

Play it at **https://imaidan808.github.io/Paperclip-Capitalist/**. It is a folder of static files that runs entirely in the browser: no build step, no dependencies, no accounts, no tracking.

## What it is

- **Twelve Backgrounds, and you draft two.** Each has a real-world basis, a real strength and a real cost (Well-Connected, Business-School Grad, Licensed Tradesperson, Immigrant Hustler, Veteran, Legacy Heir, Creator, Side-Hustler, Small-Town Roots, Digital Native, Second-Chance Hustler, Seasoned Pro). They are the only difference between founders.
- **A living 2.5D world.** An isometric island of sixteen districts, from the Scrap Yard to the Global Exchange, joined by roads, bridges and a ferry. Buyers walk in with their offers over their heads, pallets and crates are objects, every pipeline is a building that grows, freight is a truck, the virtual hour sets the light, and a credit crunch brings rain. A dock of seven icons opens the drawers (Stock, Market, Crew, Bank, Travel, Codex, Quests). Everything in the world is also in a keyboard-accessible list.
- **Five skill games in the Deal Room.** Inspect a lot before you buy it, choose your pitch angles, haggle, bid at an auction and repair with a precision dial. Each has a **Quick** option (it plays at average skill), and the Deal Room has an **Assist** switch that adds advice and widens the margins, so nobody is shut out and time is never forced.
- **The Academy.** Ten short guided missions in the real interface against the real engine. Each ends with why it worked, a teach-back question and a Codex entry. Ungraded.
- **Shocks and a class.** Scheduled shocks (a demand surge on day 15, a credit crunch on day 45, a tariff lock on day 75), loans, margin calls, audits, managers, client tiers, peer swaps with a classmate, and an instructor dashboard with a gradebook and a debrief for a reflection paper.

## Three promises

1. **Everyone starts equal.** One paperclip and $0 for every founder. A Background has a strength and a cost; the harness (`npm run balance`) plays all 66 pairs of them against each other and reports any that falls outside the target, so a draft is a choice, not a head start.
2. **Skill counts, and nobody is shut out.** Judgment, reading and timing change what a deal pays, within bounds the engine enforces; every game can be played Quick, and the Deal Room can Assist. Play is keyboard operable, announced to screen readers, and has a high-contrast theme, reduced motion and four text sizes. Nothing is timing-only.
3. **Private by design.** The game asks for an alias, not a name. There are no accounts, no analytics and no cookies, and no request goes to any host but the one serving the page. A run lives in the browser's own storage. Nothing leaves the browser unless a student joins a classroom room, and then it is a random Founder ID, the alias and game numbers ([Privacy](#privacy)).

## Play

- **Online:** open the address above. Choose **Try the Academy**, or **Play solo**, draft two Backgrounds and begin. A solo run keeps simulated rivals on the leaderboard and offers a Practice Partner to trade with.
- **On your computer:** `npm start`, then open http://localhost:8080 (it needs a current Node and nothing else).
- **In a class:** an instructor creates a room and shares a link; see [For instructors](#for-instructors) and [Multiplayer](#multiplayer).

## Run it

```bash
npm start            # the source tree on http://localhost:8080 (server/static.mjs: no dependencies, this machine only)
npm run preview      # stages the site and serves it as GitHub Pages does, on http://localhost:8081/Paperclip-Capitalist/
npm run stage        # stages the site into a folder and checks it (the workflow runs this with the folder _site)
npm run preload      # prints the <link rel="modulepreload"> lines of the staged page
npm run relay        # the optional classroom relay (npm install --prefix server, once, first)
```

`npm start` serves the source tree for development. `npm run preview` is the one to open before a release, because it is built by the same script as the published site and answers the way Pages does: under `/Paperclip-Capitalist/`, with the site's own 404 page for an address that is not a file, and with gzip.

## Test it

```bash
npm test             # the whole suite (node --test tests/*.test.mjs)
node --test tests/finish-site.test.mjs   # only the launch pass: the pages, the staging, the workflow, the docs
```

The suite covers the formulas and the engine, the skill games, the content, the screens as markup, multiplayer against the real relay (run `npm install --prefix server` once), accessibility, the 2.5D world against a recording canvas, and the launch pass. One test boots the staged site in headless Chrome (a title screen, a game, the Academy, the 404 page, no console error and no failed request); it is skipped where there is no Chrome, and `PC_NO_BROWSER=1` skips it. A test marked `todo` is a known fault, and the deploy workflow stops on one.

## The balance harness

The economy is deterministic (a seeded random stream is part of the saved state), so it can be played by a heuristic bot and measured. Targets and results are in [docs/BALANCE.md](docs/BALANCE.md).

```bash
npm run calibrate -- trades,pro ops 7   # a pacing table for one pair of Backgrounds, a specialty and a seed
npm run balance                         # all 66 pairs, five seeds each, a decision every 4 hours (2 to 4 minutes)
npm run balance -- 5 2                  # the same at a decision every 2 hours; add --no-managers to forbid hiring
npm run tune -- '{"urgentK":2}' trades,pro 4   # days to districts 5, 9, 13 and 16 for any setting of the economy's knobs
```

`calibrate` and `tune` take the two Background ids as `a,b` and stop with a message on an id the game does not know.

## Put it on GitHub Pages

1. Create a repository and push this folder to `main`.
2. In **Settings, Pages**, set the source to **GitHub Actions**.
3. `.github/workflows/pages.yml` runs on every push to `main`: it runs the whole suite, stops if any test is marked `todo`, then runs `node scripts/stage.mjs _site`, which builds exactly what is served and checks it hangs together, and uploads that folder. The site appears at `https://<user>.github.io/<repo>/`. If the address is not `https://imaidan808.github.io/Paperclip-Capitalist/`, change it in `scripts/stage.mjs` and in `index.html`, `404.html`, `robots.txt`, `sitemap.xml` and `llms.txt` (the launch test lists every place). The address is case-sensitive: the repository is spelled `Paperclip-Capitalist`, the same address with the name in lower case is a 404 on the real host, so `scripts/stage.mjs` refuses to stage a site that writes it any other way and `tests/site-address.test.mjs` reads every file of the repository for it.

What is published is an allowlist, not a copy of the repository: `index.html` with one `<link rel="modulepreload">` per module (so the browser fetches the module tree at once instead of one depth at a time), `404.html`, `robots.txt`, `sitemap.xml`, `llms.txt`, `assets/` (the share image and the icons), the stylesheets the page links, and the modules `js/main.js` imports. `tests/`, `server/`, `docs/`, `scripts/`, hidden files and anything nothing imports are never staged. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describes the pipeline.

The page has the usual launch tags: a title and description, a canonical address, Open Graph and Twitter cards with a 1200 x 630 share image (`assets/share.png`, drawn from `assets/src/share.html`; `node assets/src/render.mjs` redraws it), a schema.org description and a favicon in two forms. A GitHub project site lives under a path, and crawlers read `robots.txt` only at the root of a host, so the file in this repository takes effect with a custom domain or a user site; the sitemap can be given to a search engine's console directly.

## Multiplayer

| Mode | Setup | Good for |
|---|---|---|
| Solo | none | Practice. Simulated rivals fill the leaderboard; a Practice Partner trades with you |
| Same browser | Instructor creates a room and presses **Copy student link**; each student opens that link (or the title screen and the room code) in their own tab of the same browser. Each tab is its own founder, with its own Founder ID and saved run (no `?slot=` needed) | Demos, a shared lab machine, development |
| Relay | `cd server && npm install && npm start`, deploy anywhere that serves WebSockets (Render, Fly, a campus VM) behind TLS, then enter `wss://your-relay` when creating or joining a room, or add `&relay=...` to the student link | A real class on many devices |

A room between tabs of one browser: the first time a tab begins as a student in a room with no relay it becomes a founder of its own, with a new Founder ID, alias and saved run kept under its own slot (`pc.<name>.t-xxxxxxxx` in `localStorage`; the slot's name is kept in the tab's `sessionStorage`). Refresh a tab and it is the same student; close it and open a new tab and it is a new student, and the old one stays in the dashboard's roster as away. The settings, the Academy's progress and the instructor's room stay the browser's, and a solo run saved in the browser is never touched. A page with `?slot=name` in its address keeps everything in that slot as before, and a room with a relay keeps the browser's own Founder ID. Another browser, a private window or another computer cannot hear a same-browser room: that needs the relay. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ("A tab is a founder") has the details.

The relay forwards messages and keeps the latest snapshot per student in memory; it stores nothing on disk and never logs what a message holds. A connection brings the secret key its browser keeps beside its Founder ID (the app does this), and the relay refuses a second connection for an ID with another key, so a classmate cannot take the instructor's seat or another student's name with an ID read off the wire. The instructor's way back into a room from another device is its recovery code ([docs/FACULTY_KIT.md](docs/FACULTY_KIT.md)). A relay that cannot listen (the port is taken) exits with an error instead of looking started. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has the protocol.

## For instructors

Create a room, pick a pace, press Start. The dashboard shows wealth Gini (alert above 0.65), a niche saturation heat map, stalled founders, flagged peer trades and a pre-filled gradebook; controls pause, speed, rewind (up to ten days), deploy shocks, and scale friction and audit frequency. Keep the room's recovery code. [docs/FACULTY_KIT.md](docs/FACULTY_KIT.md) has the setup, the week map, the grading and the reflection rubric.

## What is and is not here

Built and tested: the 2.5D world, the full simulation across sixteen districts, all twelve Backgrounds, the five skill games, the Codex, quests and achievements, the Academy, three scheduled shocks plus algorithmic events, bank and margin calls, audits, client tiers, royalty streams, peer swaps with the +/-40% guardrail, the instructor dashboard, the debrief with a reflection workbook, and WCAG-checked themes.

**Not built** (see [docs/COMPLIANCE.md](docs/COMPLIANCE.md)): LTI 1.3 grade passback, SAML/OIDC SSO, SOC 2 / HECVAT attestations, server-side authoritative state. Those belong to a hosted service; [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) sketches the path. Where the design brief contradicted itself a call was made and recorded in [docs/BALANCE.md](docs/BALANCE.md), and [docs/V2_DESIGN.md](docs/V2_DESIGN.md) ends with a list of every place the build differs from its contract.

## Project layout

```
index.html        the page: the shell, the head tags, the entry point js/main.js
404.html          the page Pages serves for an address that is not a file (inline look, no script)
robots.txt, sitemap.xml, llms.txt
assets/           share.png, favicon.svg, apple-touch-icon.png; assets/src/ holds the scenes they are drawn from
css/              styles.css (the tokens, WCAG-tested) and one sheet per panel
js/               config.js (every economy number), engine.js (the simulation, no DOM), session.js (clock, rooms, gradebook),
                  data/ (districts, assets, buyers, Backgrounds), play/ (the five skill games), meta/ (Codex, quests, Academy),
                  world/ (the 2.5D renderer), audio/ (the generated sound layer: Web Audio, no audio files; docs/AUDIO.md is its contract),
                  ui/ (the screens and drawers)
server/           relay.mjs (the optional classroom relay) and static.mjs (the local file server)
dev/              world-harness.html and .js, the 2.5D world on its own, and sounds.html, the sound audition page (developer pages, never published)
scripts/          stage.mjs and preload.mjs (the Pages artifact), cdp.mjs, boot.mjs, shots.mjs and perf.mjs (headless Chrome drivers)
tests/            the suite, and the bot and harness scripts (bot.mjs, calibrate.mjs, balance.mjs, tune.mjs)
docs/             FACULTY_KIT.md, ARCHITECTURE.md, COMPLIANCE.md, BALANCE.md, V2_DESIGN.md, AUDIO.md
.github/workflows/pages.yml
```

[docs/V2_DESIGN.md](docs/V2_DESIGN.md) is the design contract with an appendix of how the build differs; [docs/BALANCE.md](docs/BALANCE.md) says what the engine actually does and how it was tuned.

## Privacy

- **What the browser keeps.** A run, its settings, the Academy's progress and, for an instructor, the room's code and recovery code are saved in the browser's own storage (`localStorage` keys that start with `pc.`). A student tab in a room between the tabs of one browser also keeps the name of its own slot in the tab's `sessionStorage` (one entry, `pc.tab`, gone when the tab closes). Nothing else is stored and there are no cookies. "Start over" in the menu deletes the current run; the Founder ID, alias, identity key, settings, Academy progress and debrief notes stay until the site's data is cleared in the browser, which deletes it all.
- **What leaves the browser.** Nothing, unless a student joins a classroom room. Rooms between tabs of one browser use `BroadcastChannel` and never leave it. A room on many devices uses the instructor's relay and shares a random Founder ID, the alias the student chose and game numbers (net worth, skills, niche counts, shock log, public stock, swap messages). No names, emails or accounts.
- **No third parties.** No analytics script, no font or script from another host, no tracking pixel; the staged page is checked to make no request outside itself.
- **The gradebook** is a CSV of Founder IDs and aliases that the instructor downloads. Map it to a roster in your LMS.

[docs/COMPLIANCE.md](docs/COMPLIANCE.md) says exactly what is and is not implemented. MIT licensed.
