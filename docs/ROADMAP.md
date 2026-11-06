# Paperclip Capitalist: what is not built yet

Updated 2026-11-06. The tasks that have no code yet, in the order I would take them, with the author's priorities of 2026-11-04 first. Items marked **(new)** were added by the author on 2026-11-04; their descriptions are first ideas, not designs. Where a survey or a design already exists it is named. "Needs" lines say what a task waits on.

## Where things stand

- **Done and live:** ground and latency (#17, #21 to #24), roads and cars (#18), flat people (#19) and nature (#20), copy passes 1 and 2 (#25, #29), the first-screen limit raised to 320 KB (#28), timing-test hardening (#30), Icons part 1 (#31: 387 of the 535 emoji and icon symbols are gone), night lag and the haze (#34), the first parts of the world pass (#35 and #37: the road detector as a test, nothing standing in the sea, one road surface with junctions and aprons), Icons part 2 (#36: the dock, the marks and the replacements by family), the first version of this file and its updates (#32, #33, #38).
- **In flight:** the world pass: every street end made a place and every locked road gated (built, in review), and the plan for the rest, version 2.1, written and checked by three independent reviewers, waiting for the author's answers (item 1 lists them). Icons parts 3 and 4 (the districts and Backgrounds, then the goods) are being built.
- **Budgets to respect:** first screen 302.3 of 320 KB gzipped, whole site 1,044.9 of 1,111 KB on main (about 1,064 KB with the road ends), 167 of 170 requests, world memory ledger 160 MB.

## Priority now (the author's order, 2026-11-04)

1. **The world pass** (items 1 and 2): the roads, paths, traffic and visual bugs first, then the zone environments themselves. The author: the visual bugs "need attention as a priority alongside UI".
2. **Icons parts 3 and 4** (the districts, the Backgrounds and the goods); part 2 (the dock, the marks and the replacements by family) is merged (#36).
3. **UI polish and modernization for every menu** (item 4).

The rest follow in the order below.

---

## 1. Priority

### 1. The world pass, part 1: roads, cars, infrastructure and graphical fixes (new)

The author asked for "massive graphical improvements and fixes", "cars drive on road through zones instead of disappearing", "more cars and trucks on the roads" and "parking lots", and put nine screenshots in a `Visual Bugs` folder. On roads: "All roads especially should either connect or terminate sensibly, not dead-end without even a roadblock showing it's closed that way. (Not to say all should terminate with a simple roadblock, perhaps tie it into existing infrastructure, lead into other zones, or an intuitive road termination like a roundabout with buildings or something else.)" After the first fixes went live (2026-11-05): "Most but not all roads have been fixed, and all zones still exist as intersections, many with abruptly terminating ends with no logical endpoints. ... roadwork and car functionality ... need a more thorough pass and integration with other roadmap topics (more infrastructure, better environmental blending, etc.)"

Done: the road detector as a test, nothing standing in the sea, one road surface with junctions and aprons (work packages WP01, WP02 and WP10: pull requests #35 and #37). Built and in review: every street end becomes a place (a turning bulb with a bus loop, a roundabout, a loading yard, a farm gate, a quay, a railed lookout, a barrier that says it is closed, a sealed tunnel mouth) and every locked road shows its gate at the open end. Next, as one program with item 2 so the parts fit together: one network graph for the whole island, with every place where a vehicle or a person stops, turns, parks or appears registered once as a station, so cars, trucks, parking, walkers, the ferry and NPCs share it (rare traders get their places, stops and paths from it and wait for the items catalog and the offers dialog for the traders themselves); cars, taxis, vans and, on the tours whose ends can take them, trucks and buses that drive through every district, turn round at the road ends and park there, and never fade (about 36 vehicles measured on the loop ends and 40 or more if the tee ends verify, against 18 today; how many are on the road depends on the hour curve the author chooses); lay-bys with a shelter and a bench on the long roads, signposts at the forks, poles with wires on the open roads and rails, a railed pier head at each ferry end, and parked vehicles at the road ends and the lay-bys (the first parking lot is the Tech Corridor's: no existing district gets one); traffic that follows the hour, with a quieter night; buyers on sidewalks and the player off the carriageway; the ferry as a lift-and-boat link, so that the player and the freight trucks no longer walk over the sea; signals at the junctions the plans name. The ground meets all of it: the blending in item 2 is what the road ends and the roadside stand against. Each pull request is checked by work counters in the test suite and by before and after pictures on fixed cameras, and the road detector stays a test.

**Needs from the author:** the request cap raised from 170 to 180 or 200 (the program adds more lazy modules than the cap allows) and the traffic rhythm by the hour (busy by day and quieter at night, or equally busy). The order, the sizes and the checks are in the world pass plan, version 2.1, which the first pull request built on it brings into the repository as a short `docs/WORLD_PASS.md`.

### 2. The world pass, part 2: zone environments, bigger zones, decorative land (new)

The author: "most are simply intersections with random decorations dotting the landscape, regardless of whether it makes sense or not. Please ensure every zone environment makes sense, remains consistent with its theme, has its components remade if poorly drawn right now, and makes sense logistically." And earlier: "Make the map larger so that each zone can fit some zone-related buildings, also put some land that's there for decoration." And on 2026-11-05: "all zones still exist as intersections".

The survey and a packing study are done: every district is the same 22 by 18 crossroads on a colored rectangle with a hashed scatter; sixteen district plans exist on paper; a re-laid island fits all of them. The work is now one program with item 1, in this order. Blending first, on all sixteen districts as they are: the dyed rectangles and the stage under each block go, today's props stay unless the author chooses otherwise on the pictures (the scatter at the rim is the "random decorations" the author named, so it can also move in, become owned clusters or go), the ground meets the land in bands, the dusk grade keeps its greens and teals, and woods, fields, hedgerows and tree belts dress the land between. Then the plan format: one loader, one checker, and a rule that a district may not keep a plain four-way (a ring, a staggered street, a couplet or a signalized plaza instead), with flat buildings drawn once and doors on the faces the camera shows. The first real district is the Tech Corridor, a campus round a ring plaza with a fenced data center, built with its neighbors nudged apart to make room and shown to the author alone. Then the whole island is laid again once, 1.33 times wider and 1.42 times higher (253 by 199 tiles, all sixteen plans as drawn, every road builds, the tunnel stays sealed), with room for hills, a lake and a low coast between the districts (decorative land stays thin until the decor pass); Flea Market Row and the Creative Quarter follow, and the author reviews the three pilots before the other thirteen districts start in three groups. Plateaus then get organic edges and walls by edge kind, and the shared flat kit (fences, gates, signs, yard furniture) comes before the groups. It folds in the flat buildings and props of item 15.

**Needs:** the ground and props picture chosen, the dusk grade picture chosen, the island size and the four new roads (the skeleton rule and how the first district gets its room are taken and listed in the plan). The F9 overlay (item 7) is the measuring tool for the ground cost.

### 3. Icons parts 3 and 4 (part 2 is done: PR #36)

The author's complaint of 2026-11-04: "The emojis are a big complaint throughout my recent image submissions." Part 1 took the guard's count from 535 to 148 and part 2 from 148 to 102; parts 3 and 4 draw what is left. Each part lowers the ratchet in `tests/guard-emoji.test.mjs`, and the last makes it strict (zero).

- **Part 2, the glyph kit, the dock and the marks that are the only cue (46), done.** The kit (`js/art/`, docs/ART_DIRECTION.md 3.6), the dock and seven drawer tabs, the controls and marks (tick, cross, caret, play, pause, menu, help, camera, lock, dot, warning, audit, the Deal Room's verdicts) in JS, CSS masks and the world's canvas, and the pictures part 1 took away, back as a drawing for each family: the Codex's seven categories, the twelve badge families and the secret, the daily bounties, the three rarities, the Deal Room's probes and angles, the three managers, three clients and four loans. Quests wait for the districts' drawings (part 3): a quest card has no picture yet.
- **Part 3, the 16 districts and the 12 Backgrounds (28).**
- **Part 4, the 72 goods and the gavel on an auction tag (74), done.** One drawing for each good (`js/art/g-goods.js`, a block for each tier, `good-<id>`), on every screen that showed an emoji (Stock, Market, Crew, Travel, the Deal Room) and in the world (a crate's icon, a lot's price tag, the gavel as a drawn mark); the data carries no `icon` and the emoji guard is strict (zero). The catalog's new goods (item 9) need drawings too: a line in the block of the good's tier, and `tests/ui-goods.test.mjs` says which good has none (the pallet strip, the gold of tier 4 and the slate wheels are the set's grammar, `docs/ART_DIRECTION.md` 3.6).

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

### 7b. Player profile tab (new)

The author (2026-11-04, asked for earlier as the player card, then clarified): "Add a player card/profile tab. Available clicking on the user card at the top left of the screen or from the bottom, should go to the right of quests. Features all of the player's information, level, stats, reputation, etc. Intuitive integration with multiplayer."

Idea: a Profile tab in the dock, to the right of Quests, that the player card at the top left also opens (that card opens Quests today; Quests stays its own tab). It holds everything about the player in one place: the figure with what they wear, the alias, the two Backgrounds and the specialty; level, XP and skill points, with the skills they are in; reputation and what it does for them; the win streak; cash, net worth and the districts opened; achievements earned, quests done and Codex progress; and run stats (deals made, the best deal, repairs, audits passed, loans). Multiplayer: the card is also what classmates see of you (a "see my card as a classmate does" toggle shows exactly that), and tapping any classmate's name (the Exchange's "Trade with", the room roster, a team list, a ticker line) opens their card in the same tab with a back link and one-tap actions (trade, offer, team). A Room section lists who is here. Public by default: alias, Backgrounds, skills, look, achievements, reputation and streak. Private by default: net worth and rank, which students never see today and the instructor can switch on. It rides on the snapshot the relay already carries: three or four new fields (look, achievements, reputation, streak) on snapshots of about 3 KB against the relay's 16 KB cap, so no server change.

Points to settle: the dock gets an eighth tab, and the seven it has take 49 px each on a 390 px phone, so it needs smaller tabs or a scroll; the top-left card is anchored by the Academy and pinned by a test (`data-anchor="player-card"`), so the click target and those pins change together; the dock needs a drawing for it (icons part 2 drew the other seven); the wardrobe (item 15) supplies the look. **Needs from the author:** what is public and what is private, and whether net worth ever shows on a card.

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

### 9b. Item classes: what an item is decides what you can do with it (new)

The author: "Items need to be classified better so that their options for examination, trading, selling etc. can determine the proper game, include proper details, etc. As things currently can show the 'power it on' option if the item is a food. This is a minor example, but having more specific item categorization and utility would vastly improve realism and ux."

Today a good has a name, an icon, a base value, a demand per district and one to three of 32 buyer-taste tags (`js/data/tier*.js`: `tool`, `retro`, `electronics`, `vehicle` and so on). The tags say who likes a good, not what it is, so nothing can tell a radio from a bag of food: all 72 goods get the same five Read probes at the same costs (`PROBES` in `js/play/inspect.js`: Look it over, Check the serial, Power it up, Read the paperwork, Hire an expert), the same defect wording and the same repair and quality details. That is why a food can be offered "Power it up".

Idea: give every good a **kind** (a small closed list: electronics, appliance or machine, vehicle, tool or hardware, apparel, jewelry or watch, collectible or toy or game, book or media, furniture or home, food or perishable, art or antique, raw material or scrap) and a few **traits** (powered, numbered, sealed, perishable, wearable, repairable, gradable). The kind and traits then decide which probes are offered (power only for powered goods, the serial only for numbered ones, a date and smell check for food, a grade for a card, a test drive for a vehicle), which defects can turn up and how they read (rust on a tool, a stale date, a cracked screen), whether repair is offered and what it costs, which Deal Room game runs, what the lot card and the Stock row show (expiry, mileage, size, condition), what storage and shipping allow (perishables spoil, vehicles need a big lot), and the buyers' tags, derived from kind and traits instead of picked by hand. The same field tells the offers dialog (item 11) and the traders (item 12) what a person may ask for, the Codex what to teach, and the catalog's "the more specific the item, the rarer" rule where to apply.

Order: data first (a `kind` and `traits` for the 72 goods, checked by `validateData` so a new good cannot ship without them, and a test that no probe is offered that the kind cannot use), then the probe, defect and repair tables keyed by kind and trait, then the cards. It belongs with the items catalog (item 9): its engine PR 1 is the place for the field and the checker, and its new goods need a kind from day one. It changes what the Deal Room offers, so the balance runs at 2, 4 and 8 hours and the bot-diff harness are re-run (probes cost points, and hiding the wrong ones changes how much a player learns); saves and peers stay safe because they carry ids, not texts. **Needs from the author:** the list of kinds (the draft above), whether a probe that does not fit is hidden (the default) or offered and fails, and whether kind-specific games wait for the skill-based minigames (Deferred).

### 10. Milestone ladder (new)

The author: "Milestone numbers for players to hit for incentive."

Today the only milestones are three feature gates (`MIL` in `js/config.js`: $1,000 opens managers, clients and the Bank; $25,000 the first audit; $250,000 the late features). Idea: a visible ladder of net-worth targets ($1k, $10k, $100k, $1M, $10M), perhaps with levels and districts opened as side rungs, shown as "next target" on the Goal card and in the Quests drawer. Reaching a rung pays a small reward (cash or XP, later a cosmetic from the wardrobe), a toast and a line in the Debrief timeline; the instructor sees a class milestone board. Rewards stay small so the economy does not move, and the test asserts they go through the ledger. **Needs:** reward sizes and which rungs.

### 11. Offers: sell or trade to people (new)

The author: "offer trade or sell to other people, instead of it being a guessing game; the object of the game is that you should be able to trade your way up alongside buying and selling things."

Idea: the player can make an offer to any person in the world (a buyer walking by, a stall owner, a classmate): pick one of your items and either "Sell for $X" or "Trade for their Y", and the person answers yes, no or a counter-offer. What each person wants and roughly what they can pay is readable before the offer (liked tags, a budget hint from a short chat), so the offer is an informed decision, not a guess. Trading up becomes a loop: a swap that gains value shows as "+$" on the item. Classmates use the same dialog through the Exchange. This touches the Market, the Exchange, the Deal Room and the Scrap Yard's barter ladder, so it needs a short design pass first. **Needs:** that design pass with the author, and whether a bad offer should cost reputation.

### 12. Rare wandering traders (new)

The author: "rare wandering traders."

Idea: now and then a rare trader walks or drives the real roads for a day or two (a distinct figure, with a cart or a van), announced by a marker and a short sound. They sell unusual goods (the catalog's rarest tiers), or buy one named item at a premium, and make their deals through the offers dialog; a visit can also carry a tip, the way a hobbyist NPC does. They stop in a parking lot or at a stall and then leave. Seeded from the room code and the day, so a class sees the same trader and ranked runs replay; roughly one every 10 to 15 game days; an instructor switch. **Needs:** the catalog's rarity weights (item 9), the offers dialog (item 11) and the world's connected roads (item 1): the network, the stops and the lay-bys the traders arrive at come with the world pass, the traders themselves wait for items 9 and 11.

---

## 4. Classroom, modes and events

### 13. Events, endless mode, leaderboard

Surveyed. A 40-event catalog (22 on today's levers), a timeline the instructor picks or randomizes, endless play without the day cap, and a leaderboard whose runs a server replays to check they were legal (server replay works: 1,361 actions, 40 KB at day 90). First a fix: 44% of rooms never get a random event because of how the roll is hashed. Also found: late or offline students never get an injected shock, a peer snapshot's shock rows are capped at 12, a swap row lacks the peer's skills, and the credit-crunch prompt has no engine effect. Six PRs shared with Teams: (1) fix the roll and clean up, (2) events, (3) endless mode, (4) teams, (5) team debrief and exports, (6) leaderboard, dark by default. **Needs from the author:** renaming the TikTok and Fed events (brand names), the default for new rooms, unannounced severity-3 events, the ranked ruleset, which ages get a board (day 90, 180, 365, 730), a host for the board under the author's account, moderation, retention and privacy copy, and whether the roll may change mid-term.

### 14. Teams

Surveyed (parts 4 and 5 of the plan above). Team value is the members' net worth plus a business-value premium (6x, or 10x if listed with a clean audit, times the 14-day average daily profit). Instructor panel (create, assign, auto-balance), a HUD chip, a team debrief (value bridge, capital structure, shock response, overlap, timeline) and CSV export. **Needs from the author:** value basis (total or per member), team size and auto-balance.

---

## 5. Wardrobe and the rest of the art

### 15. Wardrobe, shops, mounts, flat buildings, props and cars

Surveyed, seven PRs: (1) a wear rig, (2) the catalog and engine (clothing as ordinary tradable assets, kept out of the lot draw), (3) six shops (districts 2, 4, 7, 10, 13, 15) and the Wardrobe dialog, (4) the look on the card and on peers (the card itself is item 7b), (5) flat vehicles with mounts and a walk-speed setting (walks capped at 14 s), (6) flat buildings, (7) flat props. PRs 6 and 7 are now done district by district inside the world pass (item 2), the flat vehicles of PR 5 come with the traffic work (item 1), and `docs/ART_DIRECTION.md` needs a new section on flat buildings (3.1 and 3.2 still ask for gloss, shading and contours). The wardrobe PRs 1 to 4 and the mounts stay here. **Needs from the author:** wardrobe items as ordinary assets (recommended), whether gear gives any bonus beyond looks (and a cosmetics-only room switch), per run or permanent, shop names, walk speed default, aircraft, buildings with or without contour and ambient shading, sell-back markup. Whether net worth shows on a card is item 7b's question.

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

- The world pass (items 1 and 2) is the biggest ground-cost risk and moves the hit-test golden grid and the world goldens: measure with the F9 overlay (item 7), compare on fixed cameras, and turn the road detector into a test. Parking lots, traffic and the flat buildings of item 15 belong to it. It also binds two limits: the whole-site request cap (167 of 170 now, and the program adds lazy modules) and the whole-site size (about 1,064 of 1,111 KB with the road ends); each is raised in the pull request that crosses it, the request cap only with the author's yes.
- Icons part 1 has merged, so the Codex pass (item 6) and the quest sentences can start; the icon replacements (item 3) touch the Codex list and the quest cards, not their text.
- Quick on low (item 5) moves the balance bounds, the Academy's figures and the Codex wording.
- Zone pools (item 8) belong in the items catalog's first PR (item 9), which builds the weighted draw.
- Item classes (item 9b) ride on the same first PR and change what the Deal Room offers: re-run the balance at 2, 4 and 8 hours and the bot-diff harness, and expect the icons for new goods (item 3) and the skill-based minigames (Deferred) to follow the kinds.
- Rare traders (item 12) need the catalog's rarity (item 9), the offers dialog (item 11) and connected roads (item 1).
- The story (item 16) comes before the NPCs (item 17) and the island (item 18); the island fits endless mode (item 13).
- The lottery (item 19) and the NPC rewards (item 17) must be seeded, not rolled at the click, so ranked runs can be replayed.
- The profile tab (item 7b) needs a dock drawing and a phone layout for an eighth tab, changes the click target of the top-left card that the Academy anchors and a test pins, and rides on the peer snapshot; the look and the achievements on it come with item 15 and the icons.
- First-screen budget: the icon kit adds 2 to 3 KB, the items catalog about 6.5 KB; everything else should load lazily.
