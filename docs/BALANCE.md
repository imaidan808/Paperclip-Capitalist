# Rules as implemented, and where the spec needed a decision

Every number lives in `js/config.js`; the formulas live in `js/market.js` and are pinned by `tests/engine.test.mjs`.

## Time
1 virtual hour = 7 real seconds at 1x (so a 6-hour freight run is the spec's 42 seconds). 24 hours = 1 day, 90 days = 2,160 steps = 4.2 real hours at 1x. A classroom picks the pace: the instructor dashboard has presets from "1 day = 30 s" to "90 days in 28 days". The engine is deterministic: a student who is away catches up by replaying the missed hours.

## Formulas
| Rule | As built |
|---|---|
| Asset Utility Score | `scarcity x demand - depreciation`, shown 0-100. Tutorial check: `9 x 10 - 1 = 89`. Price index = `0.5 + U/100`, so a fully utilised asset trades at 1.5x its class base. |
| Creativity Multiplier | `[0.40 + ln((V_total+2)/(V_niche+1))] x (1 - S)`, clamped to **[0.40, 3.14]**. `S = min(1, V_niche/V_total)`. |
| `V_total`, `V_niche` | Cohort pitches in the last 48 virtual hours. `V_total` is **per asset class and zone** (the "sector"); `V_niche` is that class sold to one buyer segment. |
| EEI | `ending net worth / starting capital x (1 + days remaining / 90)`. |
| Peer variance | `abs(a - b) / min(a, b)`, blocked above 40%. This reproduces the spec's 7.6% for $4,200 vs $3,900 (7.69%). |
| Repair | cost `base x 0.42^(Ops-1)`; restored quality `0.5 + 0.5 x min(1, (Ops-1)/4)`. Broken Fleet Van: Ops 1 = $1,200 and half value; Ops 6 = about $16 and full value. |
| Pitch price | `reference value x fit term x 0.60 x Cm x Growth x Hustle`, capped at the buyer's budget. Reference is the asset's fair value, or the buyer's stated budget for an *urgent* lead. |
| Pipeline cycle | gross = `allocation x margin x (Cm/1.68) x lane`; less fee, zone tax, manager royalty and overhead. Capital is locked for the cycle. |
| Loans | Rate is per 30 virtual days: `(2.5% index + spread) x Fintech discount`. Accrues daily, compounds on the facility's schedule. Draws are capped at D/E 3.0; a margin call fires at 4.5 and seizes the highest-value pipelines at a 35% discount until D/E is back to 3.0. |

## Decisions the spec left open (please review)
1. **Balanced Creativity value.** The spec's formula gives 2.36 for `V_niche=10, V_total=100`; its edge-case table says 1.68. I implemented the formula and its stated floor/ceiling (0.40 and 3.14, which the table fixes). To make "balanced" worth about 1.0x I set the buyer's baseline offer to **0.60 of fair value**, because `0.60 x 1.68 = 1.0`. Pipelines normalise by 1.68 for the same reason. The spec's textbook example then lands close: herd trap `0.60 x 0.40 x $625 = $150`; pioneer about $1,050 against the spec's $1,120.
2. **EEI floor.** Dividing by a $0.05 start gives a Bootstrapper an EEI up to a million times a Venture-Backed founder's for the same ending net worth. I floor starting capital at **$1,000** (Milestone 1; instructor-adjustable) and the gradebook scores economic performance as a **percentile within the founder's own profile**. A ratio between starts of different sizes cannot be fully equalised by a floor, so the leaderboard also shows rank within profile.
3. **Interest rates.** 2.5% to 8.5% are treated as per-30-virtual-days figures, since a 90-day game would otherwise barely register an annual rate.
4. **Fees and taxes.** Zone tax (0 / 7.5 / 15%) applies to buyer pitches and pipeline profit. The NPC pool charges its own friction (10 / 12.5 / 15%) plus the institutional fee (2.5%, 12% in the crunch). The Bootstrapper's "zero barter fees" removes the institutional fee on pitches and peer trades only.
5. **Venture-Backed gating.** They start in Zone 3 with all zones open. Milestones 1 and 2 are met on day 1 (so the first audit appears immediately); Milestone 3 still gates M&A and IPO.
6. **Urgent leads.** A $0.05 paperclip cannot reach a $12 pen through cost-based pricing, so some leads are *urgent*: the buyer's stated budget is the reference value. This is the tutorial's "student with a jammed SIM tray", and the opening lead is guaranteed.
7. **Cohort volumes** come from real peers plus a deterministic ghost herd (instructor-adjustable, 0 to switch off). The ghost herd also drifts to a second-best niche every ten days, so "just copy the meta" stops working.
8. **Exit.** M&A and IPO value the business at 6x or 10x trailing average daily profit plus book value, less 12% brokerage, settling after 48 hours. IPO needs a clean audit record.
9. **Algorithmic events** (viral mention, supply glut, regulatory scare) are derived from the room code and day, so every student in a room sees the same ones.

## Pacing check
`npm run calibrate bootstrapper growth 7` plays a heuristic founder. Typical result: $1,000 around day 16-27, $25,000 around day 27-37, $250,000 around day 43-59. A thoughtful human should be faster early and the real cohort slower late.
