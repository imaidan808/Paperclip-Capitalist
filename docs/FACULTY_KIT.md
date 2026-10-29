# Faculty kit: Applied Entrepreneurship and Market Arbitrage (4-week module)

## Five-minute setup
1. Open the game, choose **Instructor, Create a room**. Note the 4-letter code and press **Copy student link**.
2. Students open the link (or enter the code under **Join a classroom**), pick an alias and draft two **Backgrounds** out of twelve, and can play the **Academy** (short guided missions, ungraded) before the clock starts.
3. Pick a **pace preset**. "One class session" runs the whole 90 days in 90 minutes; "Four-week module" stretches it across 28 days so students check in a few times a week.
4. Press **Start simulation**. The room stays in a lobby (paused on Day 1) until you do.
5. Watch the dashboard. Deploy shocks, move the risk sliders, rewind up to ten days if something goes wrong.

Students on different devices need the optional relay server (`server/relay.mjs`, see the README). Without it, rooms work between tabs of one browser, which is fine for a demo or a single shared lab machine.

**Keep the recovery code.** A new room shows its recovery code once (32 letters and digits in groups of four), and the title screen shows it again, under **Recovery code**, beside **Reopen room**. The relay gives the instructor's seat to the first connection that claims it and to nobody else, so if you lose this browser's storage, or want to run the room from your own laptop after starting it on a lab machine, the room code and the recovery code are the only way back in. On the other device choose **Instructor, Take back a room**, enter both and press **Take the room back**. The dashboard then waits a few seconds for the class's clock (a student's browser keeps it going while no instructor is there), starts from that hour, and leaves the pace paused if it could not hear one, so nothing you do on the new device can set a running class back to Day 1. The risk sliders, herd size and algorithmic events come back at their defaults: set them again. Anyone who has the recovery code can run the room, so treat it like a password. If you cannot find it, the relay's operator can set `SEAT_GRACE_MS` (milliseconds; 0 by default, which means never): once the seat's holder has been gone that long, another Founder ID that connects as the instructor is given the seat. Leave it at 0 unless you need a handover, because with a value set an instructor whose laptop lid stays shut for longer than that comes back to find someone else in the seat (the recovery code takes it back from them whatever the setting says).

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
| Peer market engagement | 10% | Completed peer swaps inside the fair-value band that moved real value (the game counts three a day at most and one per partner a day, so trading paperclips back and forth earns nothing), minus flagged attempts (a flag means the deal was out of the band on the values the player could see, never a refusal made on a crate's hidden truth) |

The dashboard pre-fills the 60 automated points. The **Export gradebook CSV** button uses pseudonymous Founder IDs and aliases only; map them to students through your LMS roster (students share their Founder ID and alias with you, for example by pasting it into the assignment).

## Reflection rubric (40 points)
| Criterion | Mastery 90-100% | Proficiency 75-89% | Developing 60-74% | Deficient <60% |
|---|---|---|---|---|
| Arbitrage logic and asset utility | Explains value creation through the Asset Utility Score; shows how scarcity and local demand shifts were used | Identifies winning swaps; misses depreciation or persona alignment | Describes swaps as luck; no link to drivers | Cannot explain valuation shifts |
| Working capital and pipeline velocity | Justifies reinvestment tempo; contrasts static stock with high-velocity pipelines | Understands automation; over-invested in stock at key moments | Upgrades randomly, no runway math | Insolvency from unmanaged overhead |
| Risk mitigation and black swans | Evaluates responses to Days 15, 45 and 75 and what changed in the capital structure | Survived the shocks reactively | Overwhelmed; no change of strategy | Ignored the signals |
| Market saturation and innovation | Uses Creativity Engine math; shows how segments were pivoted to avoid the herd | Knows crowding cuts margins; adjusted late | Blames luck rather than copycat strategy | Followed an online meta guide blindly |

## Reflection paper (1,000-1,500 words)
The **Debrief** screen assembles each student's own evidence (ledger rows, Day 45 capital structure, crowded-niche table) and exports a Markdown workbook. Ask for the three prompts:

- **A, the asymmetric trade.** Identify a swap with a classmate whose specialty differed from yours. State the asset before and after, and explain with margin data how it created value neither of you could create alone.
- **B, the Day 45 credit crunch.** Detail your capital structure when the shock went live. If leveraged, explain what you did to prevent margin compression; if holding cash, how you exploited the drop in asset values.
- **C, decoding the creativity penalty.** Pick a phase where the Creativity Engine compressed your margins. Using the formula, analyze how cohort volume drove your returns and which niche you pivoted to.

## Tuning for your course
Instructor sliders: transaction friction, audit frequency, synthetic-classmate count, algorithmic events, EEI floor. Everything else is in `js/config.js` (rates, fees, shocks, the economy's knobs) and `js/data/` (districts, assets, buyers, Backgrounds).

## Sound
The game makes its sounds in each student's browser (nothing is downloaded or recorded) and plays none until the student presses something. What the room does for you, and what to tell a class:

- **A room is quiet by default.** A student who joins by code or link is put on the **Classroom** sound preset from the moment they press Join, before the Background draft, where the loudest sound of the first minute plays when they press Begin (a whole class presses it on your word). In Classroom the tiny game sounds are off, the medium and loud ones are 10 dB lower, interface sounds 6 dB lower, and the ambient bed, the repair dial tone and the clock sounds (a buyer arriving, the new day, a manager's coin) are off. The student sees one note in the draft saying so, and everything goes back when they leave the room. A student who has changed a sound setting themselves keeps their own.
- **Quiet sound link.** Tick **Quiet sound link** beside **Copy student link** and the link ends `?sound=quiet`: students who open it start in Classroom sound, even on the title screen. Unlike the room rule it is kept in their browser until they change it under **Display and sound**; if a student has already chosen their own sound settings, the link does not change them.
- **Mute.** Key **M**, or the speaker button (top right of the game, and in the Deal Room beside Assist), mutes and unmutes in every window. **Display and sound** (the button on your dashboard, the menu and the title) has the volume, a preset (Full, Classroom, Interface only, Off), a test sound and a line that says in words whether sound can be heard.
- **Opt-in beds and tones.** The ambient bed (a quiet loop for each district) and the **repair dial tone** (a tone that follows the marker in the repair game) are off until the student switches them on, and are off in Classroom. The tone has a **Dial tone** button inside the repair window, beside Sound.
- **Sound is never the only cue.** Every sound has something drawn or written beside it (a toast, a ledger row, a stamp, the Deal Room's own words), so a student who cannot hear, or has muted the game, loses nothing: the repair timing game also has **Careful: pay more, no timing**, and a slider under reduced motion. Do not grade on what a student heard.
- **If a student hears nothing:** the device's volume and its silent switch (a browser can be on while the device is silent), the speaker button, and the status line under **Display and sound**.

## Accessibility and privacy for students
Keyboard-only play, screen-reader announcements, high-contrast theme, reduced motion, four text sizes. The game asks for an alias, not a name; progress is stored in the student's browser. See `docs/COMPLIANCE.md` for exactly what is and is not implemented.
