# Paperclip Capitalist: what is not built yet

Updated 2026-11-04 (evening). The tasks that have no code yet, in the order I would take them, with the author's priorities of 2026-11-04 first. Items marked **(new)** were added by the author on 2026-11-04; their descriptions are first ideas, not designs. Where a survey or a design already exists it is named. "Needs" lines say what a task waits on.

## Where things stand

- **Done and live:** ground and latency (#17, #21 to #24), roads and cars (#18), flat people (#19) and nature (#20), copy passes 1 and 2 (#25, #29), the first-screen limit raised to 320 KB (#28), timing-test hardening (#30), Icons part 1 (#31: 387 of the 535 emoji and icon symbols are gone), the first version of this file (#32).
- **In flight:** night lag and haze, from the author's recording of 2026-11-04 (about 20 fps in lit district views against 60 at idle, and a hard-edged haze rectangle at night): investigated, a fix is being built. A survey for the world pass (items 1 and 2): roads, paths, traffic, zone environments and map scale against the nine screenshots in the author's `Visual Bugs` folder, ending in one plan for the author to approve.
- **Budgets to respect:** first screen 298 of 320 KB gzipped, whole site 1,011 of 1,111 KB, world memory ledger 160 MB.

## Priority now (the author's order, 2026-11-04)

1. **The world pass** (items 1 and 2): the roads, paths, traffic and visual bugs first, then the zone environments themselves. The author: the visual bugs "need attention as a priority alongside UI".
2. **Icons parts 2 to 4, with drawn replacements** for the pictures that were only removed (item 3).
3. **UI polish and modernization for every menu** (item 4).

The rest follow in the order below.

---

## 1. Priority

### 1. The world pass, part 1: roads, paths, traffic, parking and graphical fixes (new)

The author asked for "massive graphical improvements and fixes", "cars drive on road through zones instead of disappearing" and "parking lots", and put nine screenshots in a `Visual Bugs` folder. On roads: "All roads especially should either connect or terminate sensibly, not dead-end without even a roadblock showing it's closed that way. (Not to say all should terminate with a simple roadblock, perhaps tie it into existing infrastructure, lead into other zones, or an intuitive road termination like a roundabout with buildings or something else.)"

What the screenshots show on a first look (the survey confirms the causes): roads that stop at a hard diagonal edge or at a cliff with nothing there; forks and merges that overlap with visible seams; pale foot paths that lie over asphalt and end at cliffs or small piers; hard straight seams where a district's ground meets the terrain; a pink, purple or blue veil over the ground at dusk and night; cars that appear and vanish at district borders.

Plan: the survey (running) produces a road detector script, the root cause of each screenshot, a vocabulary of road terminations (a roundabout with buildings around its island, a cul-de-sac, a gate with a closed sign, a pier or ferry, a road that leads into another district, a loading-dock end) and connectivity rules. Then pull requests, global systems first: the road builder and its terminations, foot paths, ground seams, traffic that drives through zones along the whole network instead of vanishing, and the tint. Each is verified with before and after crops on fixed cameras, and the detector becomes a test. Parking lots (with parked cars) are a prop and a lot kit built here and placed district by district in item 2. **Needs:** the survey's plan, approved by the author.

### 2. The world pass, part 2: zone environments, bigger zones, decorative land (new)

The author: "most are simply intersections with random decorations dotting the landscape, regardless of whether it makes sense or not. Please ensure every zone environment makes sense, remains consistent with its theme, has its components remade if poorly drawn right now, and makes sense logistically." And earlier: "Make the map larger so that each zone can fit some zone-related buildings, also put some land that's there for decoration."

Idea: each of the 16 districts gets its own street plan (not a crossroads with props), room for the buildings and infrastructure its theme needs (docks with quays, stacked containers and cranes; farms with barns, silos beside them and fields; a studio lot; a campus with a quad and a gate), parking lots, roads that connect or end by a proper termination, and components remade in the flat style where they are poorly drawn. The map grows (about half again as many blocks per district, to be tested against the ground cache, the overview and the 160 MB ledger), with scenery-only land (hills, forest, farmland, a lake, a coast) between and around the districts. The survey writes a spec and a plan schematic per district. A pilot of two or three districts goes to the author first; the rest follow in groups. It folds in the flat buildings and props of item 15. **Needs:** the survey's plan, approved by the author; the F9 overlay (item 7) to measure the ground cost.

### 3. Icons parts 2 to 4, with replacements

The author, 2026-11-04: "The emojis are a big complaint throughout my recent image submissions." Later the same day: the dock has not been redrawn with original icons, and the removed emoji were "only removed", not replaced. Part 1 (#31, live) removed the decorative ones and took the guard's count from 535 to 148. Parts 2 to 4 draw what is left, and the replacements. Each part lowers the ratchet in `tests/guard-emoji.test.mjs`, and the last makes it strict (zero).

- **Part 2, the glyph kit, the dock, the marks that are the only cue (46), and the replacements.** The dock and seven drawer tabs; the tick, caret, play, pause, menu, close and camera marks; the Deal Room's verdict marks; the lock and manager-status marks. Replacements are drawn by family rather than one drawing per item: a glyph for each of the seven Codex categories (on the list and the page), the achievement families, the five probes and five angles of the Deal Room, the manager, client and loan kinds, and the dailies; a quest shows its district's glyph (part 3). First the 24 draft glyphs are redone for the bare tile the author chose (every part must read on the dark tile and in high-contrast mode), and a contact sheet goes to the author before anything is wired.
- **Part 3, the 16 districts and the 12 Backgrounds (28).**
- **Part 4, the 72 goods and the gavel on an auction tag (74).** The catalog's new goods (item 9) need drawings too.

### 4. UI polish and modernization for every menu (moved up from the deferred list)

The author: it goes "for all menus": the title screen, the instructor dashboard, the Deal Room's menus, the minigames, "etc.", and the visual bugs need attention "as a priority alongside UI". The Deal Room's Read screen (a Points row of unlabeled circles, wordy gauge labels) and its result sentences (`js/play/inspect.js`, written 2026-10-27 as joined fragments such as `The expert takes it to the bench: "tired, but serviceable". "I cannot say for certain." You spot problems: worn finish; loose fittings.`, never rewritten by the copy passes) belong here, and so do the mobile layout fixes. **Needs:** a design direction for the whole interface first (one survey), then pull requests by group of screens.

---

## 2. Next

### 5. Quick play on low skill (new)

The author: "Quick play should be on low not average skill."

Today Quick plays a stage at skill 0.5 (`QUICK` in `js/deal.js`), which the screen and the Codex call "average skill". Moving it to low (say 0.2) makes playing a stage by hand clearly better, which is also the play tester's complaint (no way to do exceptionally well). The change is one constant and its words ("average skill" on the Deal Room's Quick buttons and results, the Codex's Negotiation page, the Academy's Quick-versus-Expert lesson). It lowers every bot's results, so the balance bounds and the Academy's figures need a run (`npm run balance`, the bot-diff harness) before it ships. **Needs:** the level (0.2 is a guess).

### 6. Codex prose pass

56 Codex pages (about 18,700 words) and the quest, achievement and daily text (about 1,450 words), the Goal card's sentence included. The Codex's long pages were written on 2026-10-27 and only had their figures audited; the copy passes changed 15 of the file's 1,297 lines. Figures stay byte-identical (tests recompute them). Icons part 1 has merged, so it can start; it should follow the Quick decision (item 5) so the wording says the right thing.

### 7. F9 debug overlay (new)

The author: "f9 debug overlay with in-game map coordinates (for where viewport is,) and other important by-frame metrics, fps, etc."

F9 toggles a small corner panel, off by default and loaded only when first opened (no cost to the first screen). It shows the camera position in map coordinates and the district under the center, zoom and pixel density, fps and frame time (average, 95th percentile, worst), the cost of each draw pass (ground, props, people, lighting), the ground-chunk cache (ready, pending, holes, worker queue), memory against the 160 MB ledger, the quality governor's tier, and the sim hour and speed. A copy button puts the numbers on the clipboard for a bug report. It would also make the author's screen recordings diagnosable; the lag investigation had to rebuild these numbers by hand. **Needs:** a few lines to expose counters the renderer already keeps. The world pass (items 1 and 2) should be measured with it.

---

## 3. Economy and the loop

### 8. Zone item pools (new)

The author: "ensure that each zone's potential lot item pools host their zone's items, I'm seeing a lot that bleed into other zones."

Today a lot is drawn from every good with demand 3 or more in the district (inside the price band). Measured: each of the 72 goods is in demand in 1 to 6 districts (4 in one district, 62 in two or three, 6 in four to six), and in the later districts the pool leans on earlier tiers: district 13 has 19 candidate goods and 8 come from its own tier file, district 8 has 5 of 10, district 4 has 10 of 15. A tier file holds four districts, so the true bleed is larger than these numbers.

Idea: give every good a home district (or two), draw home goods at about 85% and visitors at the rest, and mark a visitor on the lot ("brought in from the Harbor"). Build it inside the first PR of the items catalog (item 9), which already needs a weighted draw. **Needs:** the home assignment for 72 goods (derivable from the demand table, then reviewed).

### 9. Items catalog

Designed (60 goods, 13 buyers, a rules checker), nothing built. The author's list: everyday items, cars, JDM cars, games and toys; "the more specific the item, the rarer it should be".

- **PR 1:** an engine change with nothing visible: arrival weighted by rarity (and by home district, item 8), plus reach and wants fields, proved identical for today's goods with the bot-diff harness.
- **PR 2:** 21 goods for districts 1 to 8, seeds remade, balance runs at 2, 4 and 8 hours.
- **PR 3:** the other 39 goods.

Known problem: as drafted it makes repair too profitable (day-90 median about 1.4x against a 1.3x bound), so the repairable share is cut and vehicles and machinery move up a district first. First-screen cost about 6.5 KB gzipped. **Needs from the author:** generic names or real brands (default generic), which goods to hold back (late-90s coupe line, flagship electric sedans, sailboats, pontoon boats, larger fishing boats, a mid-engine coupe), the rule changes (25% cap on new goods in districts 5, 6, 7, 11; a fake-risk floor; reach against the district's fair value).

### 10. Milestone ladder (new)

The author: "Milestone numbers for players to hit for incentive."

Today the only milestones are three feature gates (`MIL` in `js/config.js`: $1,000 opens managers, clients and the Bank; $25,000 the first audit; $250,000 the late features). Idea: a visible ladder of net-worth targets ($1k, $10k, $100k, $1M, $10M), perhaps with levels and districts opened as side rungs, shown as "next target" on the Goal card and in the Quests drawer. Reaching a rung pays a small reward (cash or XP, later a cosmetic from the wardrobe), a toast and a line in the Debrief timeline; the instructor sees a class milestone board. Rewards stay small so the economy does not move, and the test asserts they go through the ledger. **Needs:** reward sizes and which rungs.

### 11. Offers: sell or trade to people (new)

The author: "offer trade or sell to other people, instead of it being a guessing game; the object of the game is that you should be able to trade your way up alongside buying and selling things."

Idea: the player can make an offer to any person in the world (a buyer walking by, a stall owner, a classmate): pick one of your items and either "Sell for $X" or "Trade for their Y", and the person answers yes, no or a counter-offer. What each person wants and roughly what they can pay is readable before the offer (liked tags, a budget hint from a short chat), so the offer is an informed decision, not a guess. Trading up becomes a loop: a swap that gains value shows as "+$" on the item. Classmates use the same dialog through the Exchange. This touches the Market, the Exchange, the Deal Room and the Scrap Yard's barter ladder, so it needs a short design pass first. **Needs:** that design pass with the author, and whether a bad offer should cost reputation.

### 12. Rare wandering traders (new)

The author: "rare wandering traders."

Idea: now and then a rare trader walks or drives the real roads for a day or two (a distinct figure, with a cart or a van), announced by a marker and a short sound. They sell unusual goods (the catalog's rarest tiers), or buy one named item at a premium, and make their deals through the offers dialog; a visit can also carry a tip, the way a hobbyist NPC does. They stop in a parking lot or at a stall and then leave. Seeded from the room code and the day, so a class sees the same trader and ranked runs replay; roughly one every 10 to 15 game days; an instructor switch. **Needs:** the catalog's rarity weights (item 9), the offers dialog (item 11) and the world's connected roads (item 1).

---

## 4. Classroom, modes and events

### 13. Events, endless mode, leaderboard

Surveyed. A 40-event catalog (22 on today's levers), a timeline the instructor picks or randomizes, endless play without the day cap, and a leaderboard whose runs a server replays to check they were legal (server replay works: 1,361 actions, 40 KB at day 90). First a fix: 44% of rooms never get a random event because of how the roll is hashed. Also found: late or offline students never get an injected shock, a peer snapshot's shock rows are capped at 12, a swap row lacks the peer's skills, and the credit-crunch prompt has no engine effect. Six PRs shared with Teams: (1) fix the roll and clean up, (2) events, (3) endless mode, (4) teams, (5) team debrief and exports, (6) leaderboard, dark by default. **Needs from the author:** renaming the TikTok and Fed events (brand names), the default for new rooms, unannounced severity-3 events, the ranked ruleset, which ages get a board (day 90, 180, 365, 730), a host for the board under the author's account, moderation, retention and privacy copy, and whether the roll may change mid-term.

### 14. Teams

Surveyed (parts 4 and 5 of the plan above). Team value is the members' net worth plus a business-value premium (6x, or 10x if listed with a clean audit, times the 14-day average daily profit). Instructor panel (create, assign, auto-balance), a HUD chip, a team debrief (value bridge, capital structure, shock response, overlap, timeline) and CSV export. **Needs from the author:** value basis (total or per member), team size and auto-balance.

---

## 5. Wardrobe and the rest of the art

### 15. Wardrobe, player card, shops, mounts, flat buildings, props and cars

Surveyed, seven PRs: (1) a wear rig, (2) the catalog and engine (clothing as ordinary tradable assets, kept out of the lot draw), (3) six shops (districts 2, 4, 7, 10, 13, 15) and the Wardrobe dialog, (4) the player card and peers, (5) flat vehicles with mounts and a walk-speed setting (walks capped at 14 s), (6) flat buildings, (7) flat props. PRs 6 and 7 are now done district by district inside the world pass (item 2), the flat vehicles of PR 5 come with the traffic work (item 1), and `docs/ART_DIRECTION.md` needs a new section on flat buildings (3.1 and 3.2 still ask for gloss, shading and contours). The wardrobe PRs 1 to 4 and the mounts stay here. **Needs from the author:** wardrobe items as ordinary assets (recommended), whether gear gives any bonus beyond looks (and a cosmetics-only room switch), per run or permanent, net worth on cards (default off), shop names, walk speed default, aircraft, buildings with or without contour and ambient shading, sell-back markup.

---

## 6. Story and characters

### 16. Overall plot (new)

The author: "overall plot / story."

Idea: a simple spine in the game's existing voice. The player starts with one paperclip and nothing; the Paperclip CEO owns the trade the player started from, and the island at the back of the map (item 18) is where it ends. Each of the sixteen districts already teaches one business concept (the Codex's district pages), so each becomes a chapter: a short card when its gate opens, a character or two from the cast (item 17), and the concept shown in play. The ending is at the island: out-trade or buy out the CEO, with an epilogue in the Debrief. Light touch: optional for instructors (a "story off" switch for a pure simulation), and no new walls of text (the Academy rule: play first, words later). **Needs:** a one-page story bible (tone, the CEO's character, the arc); items 17 and 18 follow from it.

### 17. NPCs, quests and dialogue (new)

The author: "NPCs you can meet and talk to for special quests that reward you with either objects (worth money) or money + xp, also have talking points sometimes (maybe they're an expert and their field, a hobbyist, or just have an opinion on something;) dialogue options so it's not necessary but optional."

Idea: a small cast of named people standing in the districts (the world already has walking buyers and the figure rig for faces and clothes). Clicking one opens a short dialogue (two to four lines, two or three options, never required). Four kinds: a quest-giver (a job made from the game's own mechanics: find a good, repair something, sell to a named buyer above a price), an expert (a one-line lesson that points to a Codex page), a hobbyist (a hint about what is rare or in demand), and a person with an opinion (flavor, sometimes a tip). Rewards: an item that lands in Stock (worth money) or cash plus XP. Each person runs once per run and is seeded, so replays and rankings stay fair. Text follows `docs/COPY.md`: short and dignified. **Needs:** the story outline (item 16) so voices and quests fit.

### 18. The Paperclip CEO's island (new)

The author: "Antagonist? maybe island off the coast at the back of the map needing 10M to unlock that's the Paperclip CEO's HQ."

Idea: a seventeenth district reached by ferry once net worth passes $10M (the gate art already has a ferry variant). The CEO is the story's antagonist: the incumbent that owns the paperclip trade. The island has its own buyers and a cartel that fixes prices, so the player must undercut or out-trade it, and its last quest is the game's win moment and a Debrief chapter. $10M is about ten times the median day-90 net worth in bot runs (about $1M), so in a 90-day game only the best players reach it: it fits endless mode (item 13) and works as a stretch goal for a class. **Needs:** the story outline (item 16), a district's worth of data (a fifth tier), art (built with the world pass's methods), and the decision whether it exists in the classic 90-day game.

---

## 7. Casino, lottery, hiring, saves

### 19. Casino and lottery (lottery new)

The casino area is unbuilt and unsurveyed. The author's open question: play money only, built to teach expected value? The lottery request: "Add lottery tickets / powerball with realistic odds."

Idea: a lottery counter (a kiosk in a city district) with scratch tickets at $1 to $20 that return roughly 60 to 70 cents per dollar over time with a few large prizes, and a jackpot draw (modeled on the national jackpot games: a $2 ticket, a jackpot at about 1 in 292 million, named generically in the game) every few game days. It teaches expected value and the house edge, and sits with the casino as a Codex page ("Expected value"). Draws are seeded from the room and the hour, not rolled at the click, so a reload cannot reroll them and ranked runs stay replayable. A daily ticket cap, and an instructor switch that turns gambling off for a class. **Needs:** the author's answer on the casino question, and whether the instructor switch defaults to off.

### 20. Passive and offline hiring

A clearer hiring screen and hires that keep working while the game is closed, with a short report when the player returns. Not surveyed.

### 21. Loading a saved file

The menu downloads a save but cannot load one. Read as: import the file "Download my save" makes. Not surveyed; it must validate and mend the file (older saves, peers, rewinds) and refuse it for ranked runs.

---

## Deferred (the author's list for after the above)

- **Skill-based deal minigames,** harder as the deal grows, with more polish and better reward feedback. The play tester found the Deal Room "too monotonous" and without a way to "do exceptionally better than average": before designing, measure how much a strong player beats Quick by, stage by stage and by deal size, so the new games have a number to beat (the Close price is held between 0.6x and 1.4x of fair value today).
- **Background music:** lobby, each zone, tension in the minigames, the Academy.
- **More skills to put points into,** with slightly faster leveling to match, some builds clearly stronger than others so a player has to play well. Needs new skills with distinct, testable effects, the level curve, the Backgrounds' interaction, and balance runs at 2, 4 and 8 hours.

## Smaller leftovers

- The prop atlas's budget (5M pixels) is smaller than the 9.2M a 2.4x zoom needs; that is the open finding behind the pan-check flake.
- Lag has not been measured on 2 or 4 cores.
- A possible 0.25 s off the first load by sending the idle-built scene to the workers.
- Frame-to-frame flicker was never isolated (the night-lag work may touch it).
- Two handoff files (`docs/handoff/NEXT_SESSION_PROMPT.md`, `docs/CLOUD_HANDOFF.md`) were stale when last checked.
- Sign-up codes are unbuilt since the decision that the game is sold to universities.

## Dependencies to watch

- The world pass (items 1 and 2) is the biggest ground-cost risk and moves the hit-test golden grid and the world goldens: measure with the F9 overlay (item 7), compare on fixed cameras, and turn the road detector into a test. Parking lots, traffic and the flat buildings of item 15 belong to it.
- Icons part 1 has merged, so the Codex pass (item 6) and the quest sentences can start; the icon replacements (item 3) touch the Codex list and the quest cards, not their text.
- Quick on low (item 5) moves the balance bounds, the Academy's figures and the Codex wording.
- Zone pools (item 8) belong in the items catalog's first PR (item 9), which builds the weighted draw.
- Rare traders (item 12) need the catalog's rarity (item 9), the offers dialog (item 11) and connected roads (item 1).
- The story (item 16) comes before the NPCs (item 17) and the island (item 18); the island fits endless mode (item 13).
- The lottery (item 19) and the NPC rewards (item 17) must be seeded, not rolled at the click, so ranked runs can be replayed.
- First-screen budget: the icon kit adds 2 to 3 KB, the items catalog about 6.5 KB; everything else should load lazily.
