# Faculty kit: Applied Entrepreneurship and Market Arbitrage (4-week module)

Everything a course needs to run Paperclip Capitalist: the setup, what the students do, every control on the dashboard, the shocks, the way back into a room, the grade, the rubric and the reflection paper. The game is at https://imaidan808.github.io/paperclip-capitalist/ and needs nothing installed.

## Five-minute setup
1. Open the game, choose **Instructor, Create a room**. Note the 4-letter code, keep the **recovery code** the game shows you (see below) and press **Copy student link**.
2. Students open the link (or enter the code under **Join a classroom**), pick an alias and draft two **Backgrounds** out of twelve. Everyone starts with one paperclip and $0. On a first visit the **Academy** runs after the draft: ten short guided missions, ungraded, that they can skip (it can be tried from the title screen too).
3. Pick a **pace preset** (table below). "One class session" runs the whole 90 days in 90 minutes; "Four-week module" stretches it across 28 days so students check in a few times a week.
4. Press **Start simulation**. The room stays in a lobby (paused on Day 1) until you do.
5. Watch the dashboard. Deploy shocks, move the risk sliders, rewind up to ten days if something goes wrong.

Students on different devices need the optional relay server (`server/relay.mjs`, see the README). Without it, rooms work between tabs of one browser, which is fine for a demo or a single shared lab machine.

## Backgrounds
Before the run every student drafts **two of twelve Backgrounds**. Everyone starts with one paperclip and $0, so the Backgrounds are the only difference between founders. Each has a real-world basis, a real strength and a real cost, and the twelve are balanced against each other (the 66 pairs are played by a bot and reported in `docs/BALANCE.md`). A debrief line shows what a student's build cost them, taken from their own ledger.

| Background | Real-world basis |
|---|---|
| Well-Connected | Social capital: "my dad knows a guy" |
| Business-School Grad | Credentials and theory |
| Licensed Tradesperson | Skilled labor |
| Immigrant Hustler | Diaspora networks and informal credit |
| Veteran | Discipline and logistics |
| Legacy Heir | Inherited safety nets |
| Creator | Audience and virality |
| Side-Hustler | Gig-economy flexibility |
| Small-Town Roots | Local reputation |
| Digital Native | Online reach |
| Second-Chance Hustler | Street smarts, but a record |
| Seasoned Pro | Decades of experience and a mentor |

The strength and the cost of each are on the draft screen, in plain words, and in `js/data/perks.js`. The dashboard shows which Backgrounds the class drafted and lets you filter the roster by one. A good seminar question is which Background earned its cost, and which pair a student would draft next time.

## The Academy
Ten short missions (about two minutes each) played in the real interface against the real engine, in a sandbox that saves nothing: First Swap, Read the Room, Know Your Buyer, Haggle 101, Fix It, Cash Is Not Sleeping, Other People's Money, Don't Follow the Herd, Storm Warning and Deal Day. Each has a goal, coach marks that point at the real controls, a **why it worked** card with the formula and a worked example, a **teach-back** question with a reason for every option, and a Codex entry. A lesson that is skipped pays nothing; one that is finished pays experience and, in some, a skill point, once. The Academy is ungraded: it is the practice before the run, and any lesson can be replayed from the Codex.

## The World and the dock
Students play in a 2.5D isometric world of sixteen districts, from the Scrap Yard to the Global Exchange, each opening at a net-worth gate. A dock of seven icons opens the drawers (Stock, Market, Crew, Bank, Travel, Codex, Quests); an icon appears when its feature first matters (Crew and the Bank open with district 5). Shocks are visible, not only announced: rain for the credit crunch, neon and confetti for the demand surge, red hazard signs at the freight depots for the tariff. Every object in the world also appears in a list below it, so the game is fully playable by keyboard and with a screen reader.

In the **Deal Room** (a click on a buyer or a lot) a student plays up to three stages in skill games: Read (inspect a lot), Pitch (choose two angles), Close (haggle) or Bid (an auction) and Fix (a precision dial). Every stage can be played **Quick** (average skill), and an **Assist** switch adds advice and widens the margins. What a game can change is bounded by the engine, so skill matters without breaking the economy. The first move at a Close or a Bid is final: a student cannot leave a negotiation, read the answers and play it again.

## The dashboard
Instructor, Create a room opens it. It redraws about once a second.

| Panel | Control | What it does |
|---|---|---|
| Head | **Copy student link**, **Access**, **Close room** | The link carries the room code (and the relay). Access opens the display settings. Close room leaves the room and goes back to the title screen; to come back in, use Take back a room with the room code and the recovery code. |
| Global engine step controls | **Start simulation** | Leaves the lobby: Day 1, running. |
| | **Pause** / **Resume**, **1x 4x 16x 64x** | The class's clock. Every student's clock follows yours. |
| | **Rewind 1 day, 3 days, 7 days** | Restores each student's most recent daily checkpoint, up to 10 days back. A student with no checkpoint that old goes back as far as it can, and the roster says "rewind stopped at day N". A student who is offline catches up deterministically on return. |
| | **Pace preset** | Sets the speed (table below). |
| Manual black swan trigger | **Deploy to cohort** | Sends a shock: Scenario (the three scheduled shocks, or one of three algorithmic ones), When (right now with no warning, or later in virtual hours), and Replace the scheduled copy (pull it forward instead of stacking). |
| Asymmetric risk scaling | **Transaction friction** (0.5x to 3x) | Scales taxes and fees. |
| | **Compliance audit frequency** (0.5x to 3x) | Scales how often audits come. |
| | **Synthetic classmates filling the market** (0 to 80) | The herd that crowds niches, so the Creativity Engine has something to punish in a small class. It shapes prices, not the grade. |
| | **Demo students on this dashboard** (0 to 24) | Made-up students for a demo of the dashboard. Leave at 0 when you grade (see Grading). |
| | **EEI starting-capital floor** | The divisor floor of the score (default 1,000). |
| | **Algorithmic surprise events** | A viral mention, a supply glut or a regulatory scare, derived from the room code and the day, so every student in a room sees the same ones. |
| Live cohort metrics | Gini, median, where the class is, what was drafted, heat map | Wealth Gini with an alert above 0.65 and a one-click **Inject Credit Crunch now**, the median net worth, students by the highest district they have opened, the Backgrounds drafted, and a niche saturation heat map for any district (48 virtual hours of transactions by asset class and buyer). |
| Operational bottlenecks | Stalled founders | Founders past the first milestone whose pipelines have shown no automated activity for more than three virtual days, with how long and their net worth. |
| Flagged peer trades | Flags | A swap blocked for being outside +/-40% of fair value, with the variance. |
| Roster and gradebook | **Export gradebook CSV**, Background filter | The pre-filled 60 points per founder. |

The pace presets, and what a virtual day lasts at each:

| Preset | A virtual day lasts |
|---|---|
| Demo: 1 virtual day = 30 s | 30 seconds |
| One class session: 90 days in 90 min | 1 minute |
| One week: 90 days in 7 days | 112 minutes |
| Four-week module: 90 days in 28 days | 7.5 hours |

## Recovery code and the instructor's seat
**Keep the recovery code.** A new room shows its recovery code once (32 letters and digits in groups of four), and the title screen shows it again, under **Recovery code**, beside **Reopen room**. The relay gives the instructor's seat to the first connection that claims it and to nobody else, so if you lose this browser's storage, or want to run the room from your own laptop after starting it on a lab machine, the room code and the recovery code are the only way back in. On the other device choose **Instructor, Take back a room**, enter both and press **Take the room back**. The dashboard then waits 15 seconds for the class's clock (a student's browser keeps it going while no instructor is there), starts from that hour, and leaves the pace paused if it could not hear one, so nothing you do on the new device can set a running class back to Day 1. The risk sliders, herd size and algorithmic events come back at their defaults: set them again. Anyone who has the recovery code can run the room, so treat it like a password.

**The seat grace period.** If you cannot find the code, the relay's operator can set `SEAT_GRACE_MS` (milliseconds; 0 by default, which means never): once the seat's holder has been gone that long, another Founder ID that connects as the instructor is given the seat. Leave it at 0 unless you need a handover, because with a value set an instructor whose laptop lid stays shut for longer than that comes back to find someone else in the seat (the recovery code takes it back from them whatever the setting says). Without a relay (tabs of one browser) there is no seat to lose.

## Shocks
Three shocks are scheduled; the dashboard can also deploy them at any time. Higher **Capital Sourcing** skill buys earlier warnings: 12 hours' notice at first, 72 hours at level 3 and 7 days at level 5 (the Market Research Suite upgrade brings each a tier earlier).

| Shock | Day | What happens |
|---|---|---|
| The TikTok Arbitrage Surge (demand) | Day 15 | For 48 hours demand for trend goods spikes +400% and matching pipelines run 60% faster; then market fatigue halves the value of trend inventory for 72 hours. Sell into the window, then get out. |
| The Fed Taper and Credit Crunch (liquidity) | Day 45 | For 15 days the base borrowing rate goes from 2.5% to 8.5%, the transaction tax from 2.5% to 12.0% and pipeline overhead rises 20%; no new commercial bank loans may be drawn until Day 55. |
| The Cross-Border Tariff Lock (supply) | Day 75 | For 15 days international pipeline cycles slow by 4 virtual days and repairs outside the four starter districts cost 45% more. Domestic channels are unaffected. |

The adaptability grade compares what each student's net worth did in the five days after a shock with the class median.

## Week by week
| Week | Virtual days | In the game | Lecture alignment | Milestone |
|---|---|---|---|---|
| 1 | 1-22 | Hand trading in the first four districts (Scrap Yard to Pawn District), the Academy, the first Deal Room games | Value creation, market gaps, persona fit, Asset Utility Score | $1,000 net worth opens Metro Hub (district 5), managers and the Commercial Bank |
| 2 | 23-45 | Metro Hub and beyond, first managers, client tiers | Scaling, supply chains, working capital, specialization | $25,000 net worth opens Industrial Park (district 9) and the first audit; the Day 15 demand shock has already landed |
| 3 | 46-68 | Leverage, audits, tightening credit | Debt-to-equity, rate shocks, risk mitigation | Stay solvent through the Day 45 credit crunch |
| 4 | 69-90 | Exit options: a trade sale or an IPO, which need Corporate Valley (district 13, $250,000) | Valuation, M&A, governance, exit timing | Maximize the EEI before Day 90; Day 75 tariff lock |

A competent player reaches districts 5, 9 and 13 around days 15, 30 and 55 (`docs/BALANCE.md`), so a class that checks in a few times a week is a little behind that; the "Four-week module" pace is built for it.

## Grading (100 points)
| Domain | Weight | How it is measured |
|---|---|---|
| Economic performance | 30% | Percentile of EEI **among everyone on the roster** (everyone starts with one paperclip, so no start is compared separately; gradebook CSV) |
| Strategic adaptability | 20% | Net-worth change over the 5 days after each shock vs the cohort median, plus credit for pivoting (telemetry). No shock yet reads as a neutral 50 |
| Metacognitive reflection | 40% | Your rubric below, on the written debrief |
| Peer market engagement | 10% | Completed peer swaps inside the fair-value band that moved real value (the game counts 3 a day at most and one per partner a day, so trading paperclips back and forth earns nothing), 25 points of the 100 for each, minus 10 for each flagged attempt (a flag means the deal was out of the band on the values the player could see, never a refusal made on a crate's hidden truth) |

The dashboard pre-fills the 60 automated points. The **Export gradebook CSV** button writes one row per real student with pseudonymous Founder IDs and aliases only (founder_id, alias, both Backgrounds, district reached, level, net worth, EEI, the percentile and the three automated components out of their weights, the 60-point subtotal, an empty column for your 40 reflection points, swaps, flagged trades and days played); map them to students through your LMS roster (students share their Founder ID and alias with you, for example by pasting it into the assignment). Two things to know:

- **Demo students count in everyone's percentile.** The percentile is taken over every row on the roster, and the dashboard's demo students are rows (the CSV leaves them out, but their scores stay in). Leave **Demo students on this dashboard** at 0 when you grade. The synthetic classmates that fill the market are not rows and do not affect the grade.
- **A shock counts for a student only if the class shows it was possible.** At least three founders must have logged the shock (all of them, in a smaller class), and a result more than 2.5 times the class median is not believed. A number in a snapshot is the student's own word, so treat the automated points as a first pass in a graded course; `docs/ARCHITECTURE.md` says what a server would add.

## Reflection rubric (40 points)
| Criterion | Mastery 90-100% | Proficiency 75-89% | Developing 60-74% | Deficient <60% |
|---|---|---|---|---|
| Arbitrage logic and asset utility | Explains value creation through the Asset Utility Score; shows how scarcity and local demand shifts were used | Identifies winning swaps; misses depreciation or persona alignment | Describes swaps as luck; no link to drivers | Cannot explain valuation shifts |
| Working capital and pipeline velocity | Justifies reinvestment tempo; contrasts static stock with high-velocity pipelines | Understands automation; over-invested in stock at key moments | Upgrades randomly, no runway math | Insolvency from unmanaged overhead |
| Risk mitigation and black swans | Evaluates responses to Days 15, 45 and 75 and what changed in the capital structure | Survived the shocks reactively | Overwhelmed; no change of strategy | Ignored the signals |
| Market saturation and innovation | Uses Creativity Engine math; shows how segments were pivoted to avoid the herd | Knows crowding cuts margins; adjusted late | Blames luck rather than copycat strategy | Followed an online meta guide blindly |

## The debrief and the reflection paper (1,000-1,500 words)
When a run ends (the bell on Day 90, or an exit) the student opens the **Debrief**. It assembles their own evidence: a net-worth chart on a log scale, what their Backgrounds cost them (from the ledger), their Deal Room play, how they met each shock, the swaps they made, their Day 45 capital structure and the crowded-niche table. Beside each prompt is a box for their analysis with a word count, and **Download workbook (.md)** saves it all as `reflection-<Founder ID>.md`, ready to submit. Ask for the three prompts:

- **Prompt A: the asymmetric trade.** Identify a swap with a classmate whose specialty differed from yours. State the asset before and after, and explain with margin data how it created value neither of you could create alone.
- **Prompt B: the Day 45 credit crunch.** Detail your capital structure when the shock went live. If leveraged, explain what you did to prevent margin compression; if holding cash, how you exploited the drop in asset values.
- **Prompt C: decoding the creativity penalty.** Pick a phase where the Creativity Engine compressed your margins. Using the formula, analyze how cohort volume drove your returns and which niche you pivoted to.

## Tuning for your course
Instructor sliders: transaction friction, audit frequency, synthetic-classmate count, algorithmic events, EEI floor. Everything else is in `js/config.js` (rates, fees, shocks, the economy's knobs) and `js/data/` (districts, assets, buyers, Backgrounds). `docs/BALANCE.md` says what each knob does and how to measure a change with `npm run tune`.

## Accessibility and privacy for students
Keyboard-only play, screen-reader announcements, a high-contrast theme, reduced motion and four text sizes. The game asks for an alias, not a name; progress is stored in the student's browser, and nothing leaves it unless a student joins your room. See `docs/COMPLIANCE.md` for exactly what is and is not implemented.
