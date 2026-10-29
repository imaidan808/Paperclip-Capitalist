# Faculty kit: Applied Entrepreneurship and Market Arbitrage (4-week module)

Everything a course needs to run Paperclip Capitalist: the setup, what the students do, every control on the dashboard, the shocks, the way back into a room, the grade, the rubric and the reflection paper. The game is at https://imaidan808.github.io/Paperclip-Capitalist/ and needs nothing installed.

## Five-minute setup
1. Open the game, choose **Instructor, Create a room**. Note the 4-letter code, keep the **recovery code** the game shows you (see below) and press **Copy student link**.
2. Students open the link (or enter the code under **Join a classroom**; tell them to press **M** now, or use headphones), pick an alias and draft two **Backgrounds** out of twelve. Everyone starts with one paperclip and $0. On a first visit the **Academy** runs after the draft: ten short guided missions, ungraded, that they can skip (it can be tried from the title screen too). A browser that still holds an earlier run asks before **Begin** replaces it, and names that run, so a student who joins your room does not lose a solo run by accident.
3. Pick a **pace preset** (table below). "One class session" runs the whole 90 days in 90 minutes; "Four-week module" stretches it across 28 days so students check in a few times a week.
4. Press **Start simulation**. The room stays in a lobby (paused on Day 1) until you do.
5. Watch the dashboard. Deploy shocks, move the risk sliders, rewind up to ten days if something goes wrong.

Students on different devices, or in different browsers, need the optional relay server (`server/relay.mjs`, see the README). Without it a room works between the tabs of one browser, which is fine for a demo or a single shared lab machine: each student opens the **Copy student link** address, or the title screen and the room code, in their own tab of your browser. Each tab is its own founder, with its own Founder ID, alias and saved run. Refreshing a tab is the same student (**Resume your run**); closing it and opening a new tab is a new student, and the old one stays in the roster as away. A different browser, a private window or another computer cannot hear the room: that needs the relay.

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
| Head | **Copy student link**, **Access**, **Close room** | The link carries the room code (and the relay). Access opens the display settings. Close room leaves the room and goes back to the title screen; to come back in, use **Resume as instructor** on the title screen with the room code and the recovery code (see Recovery code and the instructor's seat). |
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
**Keep the recovery code.** The dashboard has a **Keep this room** panel: **Show the recovery code** (32 letters and digits in groups of four, hidden until you ask, because the dashboard is often on a projector) and **Copy the recovery code**. The title screen shows it again, under **Recovery code**, beside **Reopen room**. The relay gives the instructor's seat to the first connection that claims it and to nobody else, so if you lose this browser's storage, or want to run the room from your own laptop after starting it on a lab machine, the room code and the recovery code are the only way back in. On the other device choose **Instructor**, then **Resume as instructor: take back a room**, enter both and press **Take the room back**. The dashboard then waits about 15 seconds for the class's clock (a student's browser keeps it going while no instructor is there), starts from that hour, and leaves the pace paused if it could not hear one, so nothing you do on the new device can set a running class back to Day 1. While it waits, the pace, rewind and shock controls are switched off and a note says so (the game itself also refuses a rewind or a shock until it has heard the hour). **Then wait about a minute before you use them:** the room's students follow your new Founder ID only once the old one has been silent for 60 seconds, so until then they ignore a new pace, a shock or a rewind (the dashboard and the title screen say the same). The risk sliders, herd size and algorithmic events come back at their defaults: set them again. Anyone who has the recovery code can run the room, so treat it like a password.

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

## Sound
The game makes its sounds in each student's browser (nothing is downloaded or recorded) and plays none until the student presses something. What the room does for you, and what to tell a class:

**Before class, one minute.** (1) Choose **Quiet** or **Off** under **Sound in the student link** *before* you press **Copy student link**, if you want students quiet from the title screen: the link then ends `&sound=quiet` (or `&sound=off`) and the toast says "Student link copied, with quiet sound." (or "..., with sound off."). Leave it on **Normal** and the link is the link it always was. (On a lab server at a plain `http://` address a browser has no clipboard API: the button copies by the older command, and if even that is refused a message shows the link for nine seconds so you can read it out or type it.) (2) Tell the class: "Press **M** now, or use headphones." That is true for every student: a room puts most laptops in Classroom, but a student who had chosen sound settings of their own keeps them, and you cannot see who. (3) Know the three limits: you cannot see how a student's sound is set, and no switch of yours forces Classroom on a student; a student who has chosen a sound setting of their own (a preset, a switch, a mute with **M**; moving the volume alone does not count) keeps it and is not put in Classroom, but the draft tells them once, "Your own sound settings stay in this room (Full, 80 percent). Press M to mute, or choose Classroom (quieter) under Display and sound."; and a shock you deploy to the cohort is heard on every laptop at once: a laptop in Classroom plays the medium voice of the alert, never the loud one, but it does play it, so choose **Off** if the room must be silent.

- **A room is quiet by default.** A student who joins by code or link is put on the **Classroom** sound preset from the moment they press Join, before the Background draft, where the loudest sound of the first minute plays when they press Begin (a whole class presses it on your word). Classroom is **less than half as loud as Full, and still not silent**: the tiny game sounds are off, the medium and loud ones are 8 dB lower, interface sounds 6 dB lower (12.6 and 10.6 dB under Full at the same volume, where 10 dB is half the loudness), the loudest rewards play softer voices (a level-up is its everyday run, never the full fanfare; an epic achievement is the rare one; a milestone is the quest-complete run; a shock alert is its medium voice), and the ambient bed, the repair dial tone and the clock sounds (a buyer arriving, the new day, a manager's coin) are off. The student sees one note about sound, in the draft, saying so. When they leave the room (Leave room, Start over) what the room changed goes back and they get one note saying so; a volume or a setting they changed themselves in the room stays theirs. A student who had chosen a sound setting before joining (a preset, a switch or a mute; the volume alone is not one) keeps their own and is not put in Classroom; the draft tells them once what stays and how to get quieter.
- **Sound in the student link.** Beside **Copy student link** a choice of three: **Normal** (the link is unchanged), **Quiet** (the link gains `&sound=quiet`, or `?sound=quiet` if it carried no other query) and **Off** (`&sound=off`). Students who open a Quiet link start in Classroom sound, even on the title screen; students who open an Off link start muted, and **M** turns sound on (in Classroom). With a room code in the link either one is the room's rule applied early, so it goes back when the student leaves the room (a student who opens the link and never joins gets their own sound back at their first solo run), and a student who presses **M** in an Off room keeps what they did. If a student has already chosen their own sound settings, the link does not change them, and the draft tells them so.
- **Mute.** Key **M**, or the speaker button (top right of the game, and in the Deal Room beside Assist), mutes and unmutes in every window, and a short message says which ("Sound off. Press M to turn it back on."). **Display and sound** (the button on your dashboard, on the title, in the draft's header and in the menu) has the volume, a preset (Full, Classroom, Interface only, Off), a test sound and a line that says in words whether sound can be heard.
- **Opt-in beds and tones.** The ambient bed (a quiet loop for each district) and the **repair dial tone** (a tone that follows the marker in the repair game) are off until the student switches them on, and are off in Classroom. The tone has a **Dial tone** switch inside the repair window, beside Sound; the window's own words say so in the first two repairs of a run.
- **Sound is never the only cue.** Every sound has something drawn or written beside it (a toast, a ledger row, a stamp, the Deal Room's own words), so a student who cannot hear, or has muted the game, loses nothing: the repair timing game also has **Careful: pay more, no timing**, and a slider under reduced motion. Do not grade on what a student heard.
- **If a student hears nothing:** the device's volume and its silent switch (a browser can be on while the device is silent), the speaker button, and the status line under **Display and sound**.

## Accessibility and privacy for students
Keyboard-only play, screen-reader announcements, a high-contrast theme, reduced motion and four text sizes. The game asks for an alias, not a name; progress is stored in the student's browser, and nothing leaves it unless a student joins your room. See `docs/COMPLIANCE.md` for exactly what is and is not implemented.
