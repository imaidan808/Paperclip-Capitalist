# Paperclip Capitalist v2: design contract

This is the single source of truth for the v2 redesign. Parallel work (data, mini-games, content, UI) is built against it. If something here is ambiguous, pick the reading that makes the game more *playable and teachable* and note it in your report.

## 1. What is wrong with v1 (the brief)

1. **Unequal starts.** Three profiles began with $0.05, $5,000 and $50,000 in three different places. That made the loop incomparable between starts.
2. **It is a business sim, not a game.** Seven tabs, tables, forms. Nothing to *do* with your hands. The tutorial shows the outcome but not the *why*.
3. **Three zones are not a world.** The loop never changes character. Trades are one button: Pitch, Confirm.
4. **No skill expression.** Stats decide outcomes. A player's judgment, reading and timing change nothing.

## 2. Principles

- **Everyone starts identical: one paperclip, $0.** Difference comes from *choices*, never from a head start.
- **Builds, not classes.** Before the run you pick **two Backgrounds**. Every Background has a real-world basis, a real strength and a real cost.
- **The world is the interface.** The 2.5D world is the screen. Menus are a dock of seven icons that open focused drawers. No tabs, no wall of tables.
- **Sixteen districts, one loop.** Every district runs the same core loop (source, improve, sell, reinvest) at a different scale, with *one signature rule* that teaches *one concept*.
- **Skill is a choice you make, not a reflex.** Every important interaction has a strategic skill layer (information, persuasion, negotiation, precision, bidding). Stats change the *difficulty*, never the *outcome*. Every game has a **Quick** option (auto-play at average skill) and an **Assist** mode, so nobody is excluded and time is never forced.
- **Learn by doing, then by naming it.** Each mission ends with *why it worked*, a *teach-back* question and a *Codex* entry.
- **Accessibility is not optional.** Nothing is timing-only. Everything is keyboard operable. Reduced motion is honored.

## 3. Backgrounds (replace Profiles)

Pick **two** of twelve. All twelve are balanced against each other. The target is that every one of the 66 pairs reaches the milestones within 35% of the median time; `node tests/balance.mjs` plays every pair with the bot over several seeds and reports the ones outside it (docs/BALANCE.md says which, today), and `tests/audit-repair.test.mjs` holds the late game of a sample of the pairs to bounds in CI. It is a target and a report, not a gate: the pairs near the line change places with any change to the data. Fields in `mods` are read through `Game.P` (aggregated by `perkMods(ids)`; numbers add, multipliers multiply).

| id | Background | Real-world basis | Strength | Cost |
|---|---|---|---|---|
| `connected` | Well-Connected | Social capital: "my dad knows a guy" | Buyers arrive 30% faster and bring 15% bigger budgets | Family obligations: 8% of your cash goes to relatives every 7 days |
| `grad` | Business-School Grad | Credentials and theory | Free Niche Radar and exact saturation on every preview; +1 Capital Sourcing; loan spreads 15% lower; an alumni network: buyers bring 12% bigger budgets | Student loans: 5% of every profit is garnished until $3,000 is repaid; -1 Ops (theory over practice) |
| `trades` | Licensed Tradesperson | Skilled labor | +2 Ops; repairs cost 50% less; broken goods are 20% cheaper to source | Not a salesperson: pitch prices -8%, haggling is harder (buyers have less patience) |
| `immigrant` | Immigrant Hustler | Diaspora networks and informal credit | International lanes +10 points of margin; freight 25% cheaper; a zero-interest Community Circle loan (up to 15% of net worth) | Credit-invisible: banks refuse you until net worth $5,000; paperwork means audits come 1.4x as often |
| `veteran` | Veteran | Discipline and logistics | Overhead -25%; macro shocks hit 40% softer; freight 15% faster | Rigid: trend and viral goods sell 20% lower to you (you cannot read fads) |
| `heir` | Legacy Heir | Inherited safety nets | Once per run the family clears 60% of your debt when you are margin-called; loan spreads 25% lower; the first audit fine is waived | Born on third base: you start with no skill edge (all skills 1, no specialty bonus) and learn 10% slower |
| `creator` | Creator | Audience and virality | Trend goods sell 30% higher; trend buyers appear for anything you hold | Algorithm whiplash: your non-trend demand swings +-15% every 3 days; a failed pitch costs buyers' goodwill for 2 days |
| `gigger` | Side-Hustler | Gig-economy flexibility | Small lots 8% cheaper; +25% XP; pipeline cycles 10% shorter | No safety net: no bank until net worth $2,500; burnout costs you a day of buyers about every 20 days |
| `roots` | Small-Town Roots | Local reputation | Loyal repeat buyers return with 20% bigger budgets and better trust; overhead -15% | Small pond: 30% fewer buyers in districts beyond tier 2; freight costs 30% more |
| `native` | Digital Native | Online reach | Digital goods +20% value; digital buyers appear in any district; lots refresh 25% faster | Scam magnet: 18% of buyers are fraudulent unless you verify them; tool subscriptions cost 1.5% of your cash a month |
| `second` | Second-Chance Hustler | Street smarts, but a record | Spots counterfeits (a free warning); +1 inspection probe; 12% cheaper lots in gray-market districts | A record follows you: no bank until net worth $8,000; audit fines are 1.5x |
| `pro` | Seasoned Pro | Decades of experience and a mentor | Appraisal sense (+2 inspection accuracy); a mentor tip each week; steady hands in haggling | Old school: digital goods -25%; you learn 15% slower; managers cost 10% more |

`mods` field names (all optional; absent = neutral): `leadMult`, `leadBudget`, `pitchMult`, `repairMult`, `brokenDiscount`, `opsBonus`, `growthBonus`, `fintechBonus`, `spreadAdj`, `feeMult`, `overheadMult`, `cycleMult`, `freightMult`, `freightSpeed`, `intlBonus`, `shockSoften`, `trendMult`, `trendBonus`, `digitalMult`, `lotDiscount`, `lotDiscountGray`, `lotRefresh`, `xpMult`, `fineMult`, `auditMult`, `bankMinNW`, `farLeadMult`, `scamRate`, `volatility`, `radar`, `fakeDetect`, `inspectBonus`, `haggleHandicap`, `haggleAssist`, `loyalty`, `managerCost`, `garnish {rate, cap}`, `familyTax {rate, everyHours}`, `bailout {uses, fraction}`, `circle {pct}`, `subscription {rate}`, `burnout {everyDays}`, `mentor`, `specialtyBonus`.

## 4. The sixteen districts

One avenue runs through all sixteen. Unlock is by **net worth** (`gate`). `scale` is the typical price of a mid-tier good there: it sets lot prices, buyer budgets, pipeline size and pool depth. Return per cycle is deliberately **similar in every district** (about 5-9% before costs); what grows is the stake, and what changes is the *rule*.

| # | District | Tier | Gate | Scale | Signature rule | Teaches (codex id) | Unlock bonus |
|---|---|---|---|---|---|---|---|
| 1 | The Scrap Yard | 1 | $0 | $1 | Barter ladder. Urgent buyers pay for need, not cost | `utility-fit` | none |
| 2 | Flea Market Row | 1 | $20 | $6 | **Haggle stalls**: every deal can be bargained; sealed boxes are a gamble on condition | `negotiation` | none |
| 3 | Campus Quad | 1 | $80 | $25 | **Semester waves**: paper, training and electronics demand swings on a 28-day cycle; trends spread fast | `saturation-herd` | none |
| 4 | Pawn District | 1 | $250 | $90 | **Fakes and auctions**: 22% of the lots are counterfeit (shared out by each good's `fakeRisk`, so a watch is fake about a third of the time); appraisal is the game | `information-asymmetry` | none |
| 5 | Metro Hub | 2 | $1,000 | $400 | **Managers and the Bank open**; client contracts | `working-capital` | Managers, Bank, clients |
| 6 | Estate Sales | 2 | $2,500 | $900 | **Auctions** (55% of lots); hidden-value boxes | `winners-curse` | lots +1 slot |
| 7 | Auto Row | 2 | $6,000 | $2,500 | **Repair bays**: 60% of lots are broken; repair costs 25% less here | `repair-roi` | repairs 10% cheaper everywhere |
| 8 | Harbor Docks | 2 | $12,000 | $5,000 | **Customs**: freight arriving here may be inspected; tariff exposure | `supply-chain` | freight 30% cheaper |
| 9 | Industrial Park | 3 | $25,000 | $9,000 | **Bulk contracts** and SLAs; compliance audits begin (Milestone 2) | `scale-compliance` | pipeline caps +25% |
| 10 | Tech Corridor | 3 | $50,000 | $18,000 | **Fads**: digital goods lose value fast; first movers win | `obsolescence` | buyers +15% faster |
| 11 | Farmland Co-op | 3 | $90,000 | $30,000 | **Perishables and seasons**: stock spoils; harvest waves | `inventory-risk` | storage +4 |
| 12 | Creative Quarter | 3 | $150,000 | $50,000 | **Royalties**: IP and media assets pay you daily while you hold them | `recurring-revenue` | none |
| 13 | Corporate Valley | 4 | $250,000 | $90,000 | **Enterprise clients**; M&A and IPO preparation (Milestone 3) | `enterprise-sales` | enterprise credit |
| 14 | Financial District | 4 | $500,000 | $180,000 | **Credit markets**: spreads fall; leverage is the weapon and the risk | `leverage-risk` | loan spreads -20% |
| 15 | Real Estate Row | 4 | $1,000,000 | $400,000 | **Rent yields**: property pays rent; big tickets; foreclosure auctions | `asset-cash-flow` | rent income +25% |
| 16 | Global Exchange | 4 | $2,500,000 | $1,000,000 | **World markets**: price gaps between districts are arbitrage; exits and IPO | `arbitrage-at-scale` | exit multiples +10% |

Zone fields, rule keys and bonus keys are enforced by `js/data/schema.js` (`validateData`). Do not invent others.

## 5. Assets, buyers, tags (content rules)

- **32 tags** (`TAGS` in schema.js) are the only vocabulary. A buyer *likes* tags; an asset *has* tags; `fit = min(1, strongest liked tag + 0.15 per extra liked tag)`.
- **Assets** are shared across districts. `dem` is a **sparse object** `{ zoneId: 1..10 }`. An asset trades only where it has demand. Price ladder rule: an asset must be a *signature* good (demand >= 6 and base within 0.08x to 3.5x of the district's `scale`) in at least one district.
- Every district needs at least **4 tradeable classes** (demand >= 4, base within 0.05x to 4x of scale) and **5 buyers** of **3 different haggling styles**.
- **Niche depth** (the Creativity Engine needs it): for every tradeable class in a district at least **2 buyers with fit >= 0.5**, so there is always an obvious channel and a pioneer niche.
- Buyers carry `style` (`hard|friendly|impulsive|analytical`), `patience` (3-7 rounds), `bias` (the pitch angle they respond to: `prestige|utility|scarcity|price|story`), and a one-line `hello`.
- Keep these v1 ids (tests depend on them): assets `paperclip, pen, radio, bike, scrap, sneakers, textbooks, gadgets, electronics, domain, van, saas, fleet, franchise, datacenter`; buyers `student, barista, mechanic, collector, scrapper, cyclist, bookstore, trainer, boutique, smelog, etailer, recruiter, freelancer, entIT, holdco, vcstart, franchisor`. You may move them between districts and rebalance their budgets, but not rename them.

## 6. The Deal Room (skill layer)

Clicking a buyer or a lot opens the **Deal Room**: a character, a line of dialogue, and up to three stages. Each stage is optional and skippable with **Quick** (auto-play at skill 0.5).

| Stage | Game | What you decide | Stats set the difficulty | Teaches |
|---|---|---|---|---|
| Read | **Inspect** (buying) | Spend limited probes (look, serial, power-on, paperwork, expert) to learn a lot's hidden condition and authenticity | Ops = probes and accuracy | value of information, due diligence |
| Pitch | **Pitch** (selling) | Choose 2 of 5 angles (prestige, utility, scarcity, price, story) to match the buyer's needs and bias | Growth = how many hints about the buyer | persona alignment |
| Close | **Haggle** (buy or sell) | Anchor, hold, concede, split, use your alternative, walk | Growth = a fuzzy read of their reserve price | anchoring, BATNA, ZOPA |
| Fix | **Repair** | Stop a precision dial three times (or *Careful*: pay more, guaranteed) | Ops = width of the sweet spot | quality control, ROI of repair |
| Bid | **Auction** (district rule) | Raise or drop each round against bidders with limits and moods | Fintech = a sharper estimate of the true value | winner's curse |

Outcomes are **bounded**: a game moves the price multiplier within `[0.6, 1.4]` and quality within `[0.85, 1.15]`. Nothing breaks the economy.

### 6.1 API contract for `js/play/*.js` (pure, deterministic, JSON state)

Every module exports `create(params)`, `act(state, action)`, `result(state)`, `autoplay(params, skill = 0.5)` (a heuristic player, `skill` 0..1) and `legal(state)` (list of legal actions). `params.seed` (uint32) drives all randomness through `js/rng.js`. `act` returns `{ state, say, done }` and never mutates its input. `result` returns at least `{ done, score }` with `score` in 0..1. All numbers must be finite; invalid actions return the same state with `say: null`.

- `haggle.js`: `create({ role: 'sell'|'buy', fair, reserve, style, patience, insight = 0, alt = null, handicap = 0, assist = false, seed })`. `fair` is the asset's computed fair price; `reserve` is the counterparty's hidden limit (the max a buyer will pay or the min a seller will take). Actions: `{ type:'anchor', level:'high'|'fair'|'low' }` (first move only), then `{ type:'hold' }`, `{ type:'concede', size:'small'|'medium'|'large' }`, `{ type:'split' }`, `{ type:'leverage' }` (use `alt`, once), `{ type:'walk' }`, `{ type:'accept' }`. `result` adds `{ deal, price, mult, rounds }` where `mult = price / fair`. Required properties (tested): best play beats random play on average; always conceding ends at or below fair for a seller; an absurd anchor against a `hard` buyer fails more often; `leverage` only helps when `alt` exists; `analytical` buyers punish low-balls, `impulsive` buyers reward high anchors, `friendly` buyers concede to small concessions, `hard` buyers punish anchors above 1.25 x reserve.
- `inspect.js`: `create({ truth: { quality, fake, defects: [{ id, label }] }, budget, accuracy, fakeDetect = false, seed })`. Probes `{ type:'probe', id:'look'|'serial'|'power'|'papers'|'expert' }` each cost points (1,1,2,1,3), return noisy evidence and update `belief = { quality, fakeProb }`. `{ type:'conclude' }` ends. `result` adds `{ estimate: { quality, fakeProb }, spent, confidence }`. Tested: more probes, lower error; `serial` finds fakes best; `power` finds quality best; `fakeDetect` raises fake detection; budget never exceeded.
- `pitch.js`: `create({ buyer: { needs: [tag], bias, quirk }, asset: { tags, features }, insight = 0, seed })` where `features` is an array of `{ angle, strength 0..1 }` for the asset. The state exposes `hints` (more with insight) and the five `angles`. Action `{ type:'pick', angles:[a, b] }` (exactly two distinct). `result` adds `{ fitDelta, mult }` with `fitDelta` in `[-0.3, 0.3]`, `mult` in `[0.85, 1.2]`. Tested: picking the buyer's bias plus the asset's strongest feature beats the worst pair; deterministic.
- `repair.js`: `create({ ops, difficulty = 1, assist = false, careful = false, seed })` with three steps. `{ type:'stop', t }` where `t` is milliseconds since the step began; the marker position is `pos(t)` (a smooth deterministic oscillation, exported); a hit lands inside the green zone whose half-width grows with `ops` and with `assist`. `careful` skips the dial (guaranteed 0.5 precision, higher cost). `result` adds `{ precision, qualityMult, costMult }` with `qualityMult` in `[0.85, 1.15]` and `costMult` in `[0.9, 1.3]`. Tested: perfect timing beats missing; assist widens; careful is deterministic.
- `auction.js`: `create({ estimate, trueValue, reserve, bidders: [{ style, limit }], increment, seed })`. Actions `{ type:'bid' }`, `{ type:'drop' }`. `result` adds `{ won, price, surplus }` where `surplus = trueValue - price` if won. Tested: bidders drop above their limit; a player who bids above `trueValue` has negative expected surplus; dropping early never loses money.

## 7. Engine hooks (owned by the engine refactor)

`Game` takes `{ perks: [id, id], handle, pid, seed, startHour }`, always starts with one paperclip and $0.05 of *value* (cash 0). Zones unlock automatically when net worth passes the gate. New state: `s.perks`, `s.points` (skill points), `s.level`, `s.rep` (goodwill 0..100), `s.lots[z][i].truth` (hidden), `s.auctions`, `s.streak`. New methods: `buyLot(zone, id, deal)`, `pitch(assetId, leadId, deal)`, `repair(assetId, deal)`, `quoteBuy`, `spendPoint(skill)`, `emit(type, payload)`. `deal = { mult, qualityMult, info }` comes from the Deal Room and is **clamped by the engine**.

### 7.1 Event contract (`game.onEvent(evt)` with `evt = { type, day, ...payload }`)

`pitch {zone, cls, seg, outcome:'win'|'pioneer'|'herd'|'flat'|'rejected', gain, cm, S, fit, price, mult}`, `buy {zone, cls, price, fake, cond}`, `sell-pool {zone, total, count}`, `repair {cls, cost, quality, precision}`, `ship {from, to, count}`, `hire {kind, zone}`, `upgrade {id}`, `pipe-level {id, level}`, `cycle {zone, net}`, `draw {prod, amount}`, `repay {amount}`, `client {tier}`, `audit {choice, ok}`, `zone {id}`, `milestone {n}`, `shock {kind}`, `p2p {peer, variance}`, `skill {skill, level}`, `level {level}`, `inspect {score, fake, caught}`, `haggle {role, mult, score, deal}`, `auction {won, price, surplus}`, `streak {n}`, `day {day}`, `margin-call {}`, `insolvent {}`, `exit {kind}`, `perk {id, effect}`.

## 8. Interface: one screen, a dock, seven drawers

The world canvas fills the screen. Overlaid: a **player card** (avatar, two Background icons, level ring), **cash / net worth / day** (compact), the **clock**, the **mission tracker** (current objective with progress), a **news ticker**, and the **dock** of seven icons:

| Dock | Drawer | Replaces |
|---|---|---|
| Stock | your crates, condition, repair, sell, ship, offer | inventory panel |
| Market | buyers and lots in this district, as cards | Trade tab |
| Crew | managers, lanes, upgrades, clients | Automation panel, Clients |
| Bank | loans, D/E gauge, audits, exit | Bank, Audit, Exit |
| Travel | the sixteen districts as a map and list, freight | Map tab |
| Codex | concepts you have unlocked; the Academy | Help |
| Quests | missions, daily bounties, achievements, skills and points | Skills, parts of Ledger |

Progressive disclosure: an icon appears when the feature is first relevant (Crew at district 5, Bank at district 5, and so on).

Gamification: XP and levels (each level grants a **skill point**), deal streaks with a multiplier on XP, daily bounties, achievements, a reputation meter, level-up fanfare. Cash training is removed.

## 9. The Academy (tutorial)

A campaign of ten short missions in the real UI against the real engine in a scripted sandbox. Each mission: a goal, coach marks pointing at real controls, a **why it worked** card with the formula and a worked example, a **teach-back** question (pick the true explanation, with a reason for every option), and a Codex unlock. Missions: 1 First Swap (fit and urgency), 2 Read the Room (inspect and information), 3 Know Your Buyer (pitch angles; saturation and the herd), 4 Haggle 101 (anchor, BATNA), 5 Fix It (repair ROI), 6 Cash Is Not Sleeping (working capital, first manager), 7 Other People's Money (leverage, D/E, margin call), 8 Don't Follow the Herd (the Creativity Engine with cohort data), 9 Storm Warning (a shock drill), 10 Deal Day (all skills, graduation). It finishes by opening the Background draft.

## 10. File ownership (parallel work)

| Area | Files |
|---|---|
| Content data | `js/data/tier1.js`, `tier2.js`, `tier3.js`, `tier4.js` (each exports `{ zones, assets, buyers }`) |
| Schema and validation | `js/data/schema.js`, `tests/data.test.mjs` |
| Mini-game logic | `js/play/{haggle,inspect,pitch,repair,auction}.js`, `tests/play-*.test.mjs` |
| Meta content | `js/meta/{codex,academy,quests}.js`, `tests/meta.test.mjs` |
| Engine, perks, config | `js/engine.js`, `js/config.js`, `js/data/perks.js`, `js/market.js`, `js/cohort.js`, `js/session.js` |
| World | `js/world/*` |
| UI | `js/ui/*`, `css/styles.css`, `js/main.js` |

## 11. Balance targets (tested with the bot)

Time to reach each district's gate for a competent bot, by zone: 1-4 within days 1-14; 5 (Bank) by day 14-22; 9 (audits) by day 30-40; 13 (Corporate) by day 55-70; 16 by day 85+ only for strong play. The target is that no Background pair deviates from the median milestone day by more than 35% (reported by `tests/balance.mjs`; docs/BALANCE.md lists the pairs that do). The late game is held too, for a bot that decides every two, three or four virtual hours (docs/BALANCE.md has the table): no more than about one run in six reaches district 16 by day 90, the day-90 net worth of the 90th percentile is at most about three times the 10th's, and the median day-90 net worth stays near commit 816e7c4's (about 1.5M, 1.0M and 0.4M at a decision every 2, 4 and 8 hours). Managers are the passive route and earn at least as much as the hand play they displace: the same bot with hiring forbidden must not end richer than the one with it at a decision every 4 or 8 hours (at every 2 hours it still does, by about 4 times: docs/BALANCE.md). Skill play must matter: Deal-Room-optimal play beats Quick play by 15-30% on profit per deal; random play loses to Quick.

## 4.1 District numbers and rule semantics (what the engine will do with your data)

Suggested numbers (stay inside the validator's bounds; justify any big deviation in your report): `tax` = 0, .01, .02, .03 for districts 1-4, then `0.05 + (id - 5) * 0.0095`; `friction` .10 to .16 rising with id; `speed` = `1 + (id - 1) * 0.3`; `store` = `round(10 + (id - 1) * 1.7)`; `pool` = `max(5000, round(gate * 10 / 1000) * 1000)`; `leadEvery` 3 (2 in Tech Corridor, 4 in Farmland); `lotEvery` 4 (5 where auctions are common); `urgent` .45, .30, .25, .20 then .12 falling to .06; `plots` 0 for 1-4 and 4 for 5-16 (3 in the two largest if you want scarcity). `palette` = `[ground, accent]`, saturated and distinct per theme (scrap olive/brown, market warm orange, campus brick/green, pawn teal/gold, metro slate/blue, estate plum/cream, auto asphalt/red, harbor navy/orange, industrial steel/yellow, tech black/cyan, farm green/gold, creative magenta/violet, corporate glass blue, finance green/ink, realty terracotta, exchange gold/black).

Rule keys, as the engine will read them:

| key | value | meaning |
|---|---|---|
| `haggle` | true | every deal in this district offers the Haggle stage with a friendly start (patience +1) |
| `auction` | 0..1 | fraction of lots that are auctions (Auction game) instead of fixed-price lots |
| `fakes` | 0..1 | probability a lot is counterfeit, multiplied by the asset's own `fakeRisk` (default 1) |
| `season` | `{ period, amp, tags }` | demand for assets with any of `tags` swings by `amp` (0..0.6) on a sine of `period` days |
| `customs` | 0..1 | chance that freight arriving here is inspected (12h delay and a 2% fee) |
| `gray` | true | gray-market district: Second-Chance gets its discount; audit fines are not reduced here |
| `repair` | 0..0.6 | repairs done here cost this much less |
| `perish`, `yield`, `bulk`, `fads` | true | informational flags the UI and Academy read (perishables spoil per the asset's `perish`; assets with `yield` pay daily; bulk lots come in multiples; digital goods lose value twice as fast) |
| `managers`, `bank`, `audits`, `enterprise`, `rent`, `arbitrage` | true | this district is where that feature *unlocks* (set exactly once each: managers and bank in district 5, audits in 9, enterprise in 13, rent in 15, arbitrage in 16) |

`bonus` keys are permanent rewards applied once the district is unlocked: `freightMult` (<1 cheaper), `capMult` (>1 pipeline caps), `leadMult` (>1 buyers faster), `spreadMult` (<1 cheaper loans), `storeBonus` (integer crates everywhere), `lotSlots` (integer extra lots per district), `feeMult`, `repairMult`, `rentMult`, `exitMult`, `creditLimitMult`. Use the "Unlock bonus" column of the district table.

## 12. Meta content schemas (Codex, Academy, quests)

All meta content is plain data exported from `js/meta/*.js`, validated by `tests/meta.test.mjs`. **Event matching**: a `match` object is a shallow subset test against an event payload; a value can be a literal or `{ gte|lte|gt|lt|eq|in }`.

**Codex entry** (`js/meta/codex.js`, `export const CODEX = [...]`):
`{ id, title, icon, category: 'Value'|'Markets'|'Operations'|'Finance'|'Risk'|'People'|'Strategy', zone?: 1..16, summary (<= 140 chars), body: [2-4 paragraphs, each <= 420 chars, plain language, concrete], formula?: string, example: { setup: string, steps: [string], result: string } (a worked example with real numbers from the game), mistakes: [<= 3 short strings], tryIt: string (one thing to do in the game), related: [ids], unlock: 'start' | { event, match? } }`. **Required ids** (at least these 52, listed in `js/meta/ids.js` as `REQUIRED_CODEX`): the sixteen `teaches` ids from the district table plus `fair-market-value, asset-utility-score, creativity-multiplier, market-saturation, persona-fit, urgency-premium, margin, depreciation, opportunity-cost, cash-flow-velocity, compounding, interest-and-compounding, debt-to-equity, margin-call, collateral, cac-vs-ltv, sla, audit-compliance, tariffs, credit-crunch, demand-shock, diversification, hedging, anchoring, batna-zopa, adverse-selection, due-diligence, comparative-advantage, specialization, economies-of-scale, network-effects, risk-of-ruin, expected-value, eei-score, reputation, exit-valuation`. Voice: warm, specific, never condescending. Every `example` uses numbers a player can reproduce.

**Academy mission** (`js/meta/academy.js`, `export const ACADEMY = [...]`, exactly 10, ids `m01`..`m10` in the order of section 9):
`{ id, title, icon, zone: 1..16, concept: codexId, minutes, intro (<= 260 chars, a scene), setup, steps, win, why, teachBack, reward }` where
`setup = { clock: 'paused'|'running', assets: [{ cls, cond?, quality? }], leads: [{ id, seg, budget, need? }], lots: [{ id, cls, cond, price, truth?: { quality, fake } }], cash?, zones: [ids], features: [dock ids visible: 'stock'|'market'|'crew'|'bank'|'travel'|'codex'|'quests'], skills?: { ops, growth, fintech }, perks?: [ids], cohort?: { ghosts: n }, events?: [{ kind, atHour }] }`;
`steps = [{ id, say (coach text <= 220 chars), anchor, wait, hint }]` where `anchor` is one of `hud-cash, hud-networth, hud-day, hud-clock, player-card, tracker, ticker, dock-stock, dock-market, dock-crew, dock-bank, dock-travel, dock-codex, dock-quests, world, drawer, deal-room, deal-stage-read, deal-stage-pitch, deal-stage-close, deal-quick` or `world:lead:<id>`, `world:lot:<id>`, `world:asset:<cls>`, `world:plot:<n>`, `world:static:<id>`; and `wait` is `{ type:'event', event, match? }` or `{ type:'ui', ui:'open-drawer', id }` or `{ type:'click', anchor }`; `hint` appears after 20 seconds of no progress;
`win = { event, match? }` (the mission is complete when this event arrives after the last step);
`why = { title, body: [paragraphs <= 420 chars], formula?, example: { setup, steps, result } }`;
`teachBack = { q, options: [{ text, correct: boolean, why }] }` (exactly 3 options, exactly 1 correct, a reason for every option, wrong options are tempting misconceptions);
`reward = { xp, codex: [ids], points?: 1 }`.
Every mission must be completable by the scripted sandbox alone (all leads, lots and assets it needs are in `setup`), must teach its codex `concept` by doing, and must be playable in 90-150 seconds.

**Quest / achievement** (`js/meta/quests.js`, `export const QUESTS`, `export const ACHIEVEMENTS`, `export const DAILIES`):
`QUESTS`: at least 32 story quests (two per district: an *arrival* quest and a *mastery* quest that exercises the district's signature rule), `{ id, title, desc, icon, zone, goal: { event, match?, count, sum? }, reward: { xp, points? }, after?: questId }`;
`ACHIEVEMENTS`: at least 40, `{ id, title, desc, icon, rarity: 'common'|'rare'|'epic', goal: { event, match?, count, sum? }, hidden?: true }` covering skill play (haggle, inspect, repair, auction), streaks, risk survived, each Background combination theme, and every district;
`DAILIES`: at least 10 templates `{ id, title, desc, icon, goal: { event, match?, count }, reward: { xp } }` that make sense in any district.
`sum` names a numeric payload field to accumulate instead of counting events.

## 13. Content tiers: ownership and tier-local rules

Four authors write `tier1..4.js` in parallel and never see each other's files, so every rule below is checkable *inside one tier* (`tests/data.test.mjs`, tables in `js/data/schema.js`); the merged set then passes the global validator by construction.

- **Tier t owns districts `4t-3 .. 4t`**, every buyer whose `zone` is one of them, and every asset it defines. Asset and buyer ids are unique across tiers.
- **v1 ids by owner** (`TIER_ASSETS`, `TIER_BUYERS`): tier 1 assets `paperclip pen radio bike scrap`, buyers `student barista mechanic collector scrapper cyclist bookstore`; tier 2 assets `sneakers textbooks gadgets electronics domain van`, buyers `trainer boutique smelog etailer recruiter freelancer`; tier 3 assets `saas fleet`, buyers `entIT vcstart`; tier 4 assets `franchise datacenter`, buyers `holdco franchisor`. Re-zone and rebalance them (bases within about 0.5x..2x of v1 unless the district's scale demands more; budgets to the district's scale), never rename.
- **Demand stays home**: an asset's `dem` is 4..10 only in its own tier's districts; elsewhere at most 3 (a trickle that the pool and the ghosts price). Each asset is a *signature good* (demand >= 6, base 0.08x..3.5x of scale) in at least one district of its tier. That keeps the "tradeable class" and "2 buyers with fit >= 0.5" rules inside the tier.
- **Counts**: at least 14 assets and 20 buyers per tier (so >= 56 and >= 80 overall), at least 4 tradeable classes and 5 buyers in every district.
- **Home tags** (`TIER_TAGS`): each tier uses each of its home tags on at least one asset and has at least one buyer like it. Together the four tiers cover all 32 tags. Use other tags freely.
- **Signature rules and bonuses** are checked against `RULE_NEED`, `UNLOCK_RULES` and `BONUS_EXPECT`: write the rule (with sensible numbers, section 4.1) and the exact bonus listed there. Zones 1 and 14 have no required rule key (zone 1 is the barter ladder, taught by buyers' `holds`; zone 14's weapon is leverage, delivered by its bonus and the Bank). `teaches` is the `TEACHES` entry for the district.
- **Voice**: names and `hello` lines are warm and specific (a person you could picture, not "Buyer 7"). Blurbs say what is special about the place and what it teaches, in under 160 characters. Icons are single emoji.
- **Barter** (`holds`, districts 1-4 only): buyers in 1-4 may hold goods they swap for yours, so the early game can climb a barter ladder from the paperclip. Make sure a clever chain of swaps from the paperclip reaches district 2's goods and, with cash, district 3's.
- **Pacing intent** (how the engine will use your numbers): a competent player turns about 5-9% per cycle in every district; the stake grows with `scale`, and `gate` is about 8-12x the previous district's scale, so a district's goods and lots should let the player fill one crate worth about `scale` and a few worth up to 4x. A player reaches district 5 (gate $1,000) around day 14-22, district 9 around day 30-40.

## 14. Procedure for parallel authors

1. Work only in your own git worktree and branch (instructions are in your brief); never touch `main` or the main checkout, and touch only the files you own (section 10).
2. Read sections 1-6, the parts of 7-13 your brief names, `js/data/schema.js` (the vocabulary and validators) and, for engine-adjacent code, `js/rng.js`, `js/market.js` and `js/config.js` (v1 numbers and behaviors you must stay compatible with).
3. Run your tests (`node --test tests/<yours>.test.mjs`) until they pass; run `node --check` on every file. Do not run the whole suite (the engine is mid-refactor on main).
4. Commit with a clear message, ending with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Report: branch name, commit hash, files, anything in the contract you found ambiguous and how you read it, and anything you could not satisfy.
