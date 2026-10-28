# Faculty kit: Applied Entrepreneurship and Market Arbitrage (4-week module)

## Five-minute setup
1. Open the game, choose **Instructor, Create a room**. Note the 4-letter code and press **Copy student link**.
2. Students open the link (or enter the code under **Join a classroom**), pick an alias and draft two **Backgrounds** out of twelve, and can play the **Academy** (short guided missions, ungraded) before the clock starts.
3. Pick a **pace preset**. "One class session" runs the whole 90 days in 90 minutes; "Four-week module" stretches it across 28 days so students check in a few times a week.
4. Press **Start simulation**. The room stays in a lobby (paused on Day 1) until you do.
5. Watch the dashboard. Deploy shocks, move the risk sliders, rewind up to ten days if something goes wrong.

Students on different devices need the optional relay server (`server/relay.mjs`, see the README). Without it, rooms work between tabs of one browser, which is fine for a demo or a single shared lab machine.

## The World and the dock
Students play in a 2.5D isometric world of sixteen districts, from the Scrap Yard to the Global Exchange, each opening at a net-worth gate. A dock of seven icons opens the drawers (Stock, Market, Crew, Bank, Travel, Codex, Quests). Shocks are visible, not only announced: rain for the credit crunch, neon and confetti for the demand surge, red hazard signs at the freight depots for the tariff. Every object in the world also appears in a list below it, so the game is fully playable by keyboard and with a screen reader.

## Week by week
| Week | Virtual days | In the game | Lecture alignment | Milestone |
|---|---|---|---|---|
| 1 | 1-22 | Hand trading in the first four districts (Scrap Yard to Pawn District) | Value creation, market gaps, persona fit, Asset Utility Score | $1,000 net worth opens Metro Hub (district 5), managers and the Commercial Bank |
| 2 | 23-45 | Metro Hub and beyond, first managers, client tiers | Scaling, supply chains, working capital, specialization | $25,000 net worth opens Industrial Park (district 9) and the first audit; the Day 15 demand shock has already landed |
| 3 | 46-68 | Leverage, audits, tightening credit | Debt-to-equity, rate shocks, risk mitigation | Stay solvent through the Day 45 credit crunch |
| 4 | 69-90 | Exit options: a trade sale or an IPO, which need Corporate Valley (district 13, $250,000) | Valuation, M&A, governance, exit timing | Maximize the EEI before Day 90; Day 75 tariff lock |

(The scheduled shocks are Day 15 TikTok Arbitrage Surge, Day 45 Fed Taper and Credit Crunch, Day 75 Cross-Border Tariff Lock. Higher Capital Sourcing skill buys earlier warnings: 12 hours, 72 hours, 7 days.)

## Grading (100 points)
| Domain | Weight | How it is measured |
|---|---|---|
| Economic performance | 30% | Percentile of EEI **among everyone in the room** (everyone starts with one paperclip, so no start is compared separately; gradebook CSV) |
| Strategic adaptability | 20% | Net-worth change over the 5 days after each shock vs the cohort median, plus credit for pivoting (telemetry) |
| Metacognitive reflection | 40% | Your rubric below, on the written debrief |
| Peer market engagement | 10% | Completed peer swaps inside the fair-value band, minus flagged attempts |

The dashboard pre-fills the 60 automated points. The **Export gradebook CSV** button uses pseudonymous Founder IDs and aliases only; map them to students through your LMS roster (students share their Founder ID and alias with you, for example by pasting it into the assignment).

## Reflection rubric (40 points)
| Criterion | Mastery 90-100% | Proficiency 75-89% | Developing 60-74% | Deficient <60% |
|---|---|---|---|---|
| Arbitrage logic and asset utility | Explains value creation through the Asset Utility Score; shows how scarcity and local demand shifts were used | Identifies winning swaps; misses depreciation or persona alignment | Describes swaps as luck; no link to drivers | Cannot explain valuation shifts |
| Working capital and pipeline velocity | Justifies reinvestment tempo; contrasts static stock with high-velocity pipelines | Understands automation; over-invested in stock at key moments | Upgrades randomly, no runway maths | Insolvency from unmanaged overhead |
| Risk mitigation and black swans | Evaluates responses to Days 15, 45 and 75 and what changed in the capital structure | Survived the shocks reactively | Overwhelmed; no change of strategy | Ignored the signals |
| Market saturation and innovation | Uses Creativity Engine maths; shows how segments were pivoted to avoid the herd | Knows crowding cuts margins; adjusted late | Blames luck rather than copycat strategy | Followed an online meta guide blindly |

## Reflection paper (1,000-1,500 words)
The **Debrief** screen assembles each student's own evidence (ledger rows, Day 45 capital structure, crowded-niche table) and exports a Markdown workbook. Ask for the three prompts:

- **A, the asymmetric trade.** Identify a swap with a classmate whose specialty differed from yours. State the asset before and after, and explain with margin data how it created value neither of you could create alone.
- **B, the Day 45 credit crunch.** Detail your capital structure when the shock went live. If leveraged, explain what you did to prevent margin compression; if holding cash, how you exploited the drop in asset values.
- **C, decoding the creativity penalty.** Pick a phase where the Creativity Engine compressed your margins. Using the formula, analyse how cohort volume drove your returns and which niche you pivoted to.

## Tuning for your course
Instructor sliders: transaction friction, audit frequency, synthetic-classmate count, algorithmic events, EEI floor. Everything else is in `js/config.js` (rates, fees, shocks, the economy's knobs) and `js/data/` (districts, assets, buyers, Backgrounds).

## Accessibility and privacy for students
Keyboard-only play, screen-reader announcements, high-contrast theme, reduced motion, four text sizes. The game asks for an alias, not a name; progress is stored in the student's browser. See `docs/COMPLIANCE.md` for exactly what is and is not implemented.
