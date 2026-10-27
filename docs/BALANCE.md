# Rules as implemented, and where the spec needed a decision

Every number lives in `js/config.js` (economy), `js/data/` (districts, assets, buyers, Backgrounds) and `js/market.js` (formulas). The design contract is `docs/V2_DESIGN.md`; this file says what the engine actually does and what was decided on the way.

## Time
1 virtual hour = 7 real seconds at 1x. 24 hours = 1 day, 90 days = 2,160 steps = 4.2 real hours at 1x. A classroom picks the pace: the instructor dashboard has presets from "1 day = 30 s" to "90 days in 28 days". The engine is deterministic (seeded RNG, state in the save): a student who is away catches up by replaying the missed hours.

## Formulas
| Rule | As built |
|---|---|
| Asset Utility Score | `scarcity x local demand - depreciation`; price index `0.5 + U/100`. Demand is per district (`dem` is a sparse object; no entry means no market there). |
| Creativity Multiplier | `[0.40 + ln((V_total+2)/(V_niche+1))] x (1 - S)`, clamped to **[0.40, 3.14]**, `S = min(1, V_niche/V_total)`. Volumes are the last 48 virtual hours, per asset class and district. |
| Pitch price | `reference x fit term x 0.60 x ECON.pitchK x Cm x Growth x Background x Deal Room`, capped at the buyer's budget. Reference is the asset's fair value times its hidden condition, or the stated budget of an urgent lead. |
| Deal Room | The games return a price multiplier within **[0.6, 1.4]** and a quality multiplier within **[0.85, 1.15]** (repair cost within [0.9, 1.3]); the engine clamps them again. Quick (auto-play at average skill) averages 1.0, which is the economy the bot is balanced on. |
| EEI | `ending net worth / max(start, floor) x (1 + days remaining / 90)`. Everyone starts with one $0.05 paperclip and $0 cash, so the floor ($1,000, instructor-adjustable) is a constant divisor and the score is a pure ranking of net worth and time. |
| Peer variance | `abs(a - b) / min(a, b)`, blocked above 40% (7.69% for $4,200 vs $3,900). |
| Repair | cost `base x 0.42^(Ops-1)`, times the district's repair discount and the Background and district bonuses; restored quality `0.5 + 0.5 x min(1, (Ops-1)/4)`, times the Deal Room's precision result. |
| Managers | Capital and hire cost scale with the district's gate (`(gate/1000)^0.62`), margin falls slowly with district (`1 - 0.045 x (id-5)`, floor 0.5), cycle length is `ECON.cycleBase / district speed`. Gross = `allocation x margin x ECON.margin x (Cm/1.68) x lane`, less fee, tax, manager royalty and overhead. |
| Loans | Rate per 30 virtual days: `(2.5% index + spread) x Fintech discount`, spread adjusted by Backgrounds and district bonuses. Draws capped at D/E 3.0; margin call at 4.5 seizes the highest-value managers at a 35% discount until D/E is 3.0. |

## Equal starts
The v1 profiles ($0.05, $5,000 and $50,000, in three different districts) made scores incomparable. In v2 everyone starts with a paperclip and no cash. The difference between players is only the two Backgrounds they draft and what they do with them.

## Backgrounds
Each has a real-world basis, a strength and a cost (`js/data/perks.js`, `docs/V2_DESIGN.md` section 3). The pairing test is `node tests/balance.mjs [seeds] [every]`: it plays all 66 pairs with the heuristic bot and reports the day each pair reaches districts 5, 9 and 13. Numbers were tuned in the first balance pass (five seeds each, a decision every 4 virtual hours, specialty rotated): the median pair reaches district 5 on day 16, district 9 on day 30 and district 13 on day 55; 3 of 66 pairs deviate more than 35% from the median on some milestone, all of them on the early milestone, where one lucky or unlucky first week moves a run by days. Changes made by that pass: Well-Connected buyers arrive 30% faster (not 40%) with 15% bigger budgets and an 8% weekly family tax; Grad's garnish is 5% up to $3,000; Immigrant's international lanes gain 10 points (not 15); Second-Chance's bank gate is $8,000; Heir learns 10% slower.
The bot plays Quick and never opens the Deal Room, so strengths that only pay through skill (Pro's inspection accuracy, Second-Chance's probe) are valued at what they save a Quick player (the free counterfeit warning is heeded by the bot) and not at their skilled-play value: a human who inspects gets more from them. Treat the harness as a floor on the weakest pairs, not a ceiling on the strongest.

## Districts
Sixteen districts unlock by net worth: $0, 20, 80, 250, 1,000 (Metro Hub: managers, clients and the Bank), 2,500, 6,000, 12,000, 25,000 (Industrial Park: audits), 50,000, 90,000, 150,000, 250,000 (Corporate Valley: enterprise, M&A, IPO), 500,000, 1,000,000, 2,500,000. Return per cycle is deliberately similar everywhere; what grows is the stake, and each district has one signature rule (haggling stalls, semester waves, counterfeits and auctions, estate auctions, repair bays, customs, bulk and compliance, fads, perishables and seasons, royalties, enterprise clients, credit, rent, arbitrage). Opening a district also pays a permanent bonus (`BONUS_EXPECT` in `js/data/schema.js`).

## Hidden truth
A lot is posted "as described" at 78-95% of fair value. Its real condition (a multiplier of 0.7-1.15, 0.85-1.15 in the first two districts) and whether it is counterfeit (rule `fakes` times the asset's `fakeRisk`; a fake is worth 8%) are hidden. Net worth counts described value until the truth is known (a buyer's refusal, a pool sale, or reading it off an inspection). Buyers always check what they buy, so a fake is never sold at full price: information is worth money, which is what the Inspect game teaches.

## Economy knobs (`ECON`)
`lotDiscHi/lotDiscLo` (the discount on lots), `lotSlots`, `lotEvery`, `leadEvery`, `cycleBase`, `pitchK`, `margin`. Provisional values: 4 slots, lots refresh every 1.5x the district's `lotEvery`, `pitchK` 0.9, `margin` 0.45, `cycleBase` 80. `node tests/tune.mjs '{"pitchK":0.8}' trades,pro 4` prints the days to districts 5, 9, 13 and 16 over three seeds for any setting. Per-seed variation is large (a first week can swing 10 days), so judge a change over several seeds.

## Decisions the spec left open (please review)
1. **Balanced Creativity value.** The spec's formula gives 2.36 for `V_niche=10, V_total=100` while its edge-case table says 1.68. The formula and its floor and ceiling (0.40, 3.14) are implemented; the buyer baseline is 0.60 of fair value so a "balanced" niche is worth about 1.0x, and managers normalise by 1.68.
2. **Interest rates** of 2.5% to 8.5% are per 30 virtual days, since a 90-day game would barely register an annual rate.
3. **Urgent leads.** A $0.05 paperclip cannot reach a $12 pen through cost-based pricing, so some leads are urgent: the buyer's stated budget is the reference value. The opening lead is guaranteed.
4. **Cohort volumes** come from real peers plus a deterministic ghost herd. The herd climbs the districts together as a moving bell (centre at district `1 + 14 x (day/90)^0.9`) and drifts to a second-best niche every ten days.
5. **Exit.** M&A and IPO value the business at 6x or 10x trailing average daily profit plus book value (times Global Exchange's exit bonus), less 12% brokerage, settling after 48 hours. IPO needs a clean audit record.
6. **Algorithmic events** (viral mention, supply glut, regulatory scare) derive from the room code and day, so every student in a room sees the same ones.
7. **Skill points replace cash training.** Levels (`floor(sqrt(xp/100)) + 1`) grant one point each; skills top out at level 8.
8. **Per-district rules the data authors added** beyond the required ones: small `fakes` rules in several mid and late districts so `fakeRisk` and Inspect matter there; `gray` markets in the Pawn District and the Global Exchange; `customs` at the Exchange so arbitrage has to beat freight.
