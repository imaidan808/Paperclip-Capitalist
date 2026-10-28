// The Academy: ten short missions played in the real UI against a scripted sandbox (docs/V2_DESIGN.md sections 9 and 12).
// Plain data, validated by tests/meta-academy.test.mjs. Every asset, buyer and district named here is real content (js/data/tier1..4.js) and every
// number in a `why.example` or a teach-back is what the real engine returns for the mission's own sandbox (quotePitch, repairQuote, forecast, draw,
// deRatio, poolQuote, eei and the Deal Room games of js/deal.js), read at an average Deal Room result: a multiplier of exactly 1.00. The one other
// reading is mission 5's repair, which is read at the Careful setting (quality x1.00, bill x1.30), the only run of the Fix stage that is the same every time:
// no run of the marker gives quality x1.00 AND bill x1.00, so a card never calls a quote-level figure an "average marker". The test file builds
// each sandbox with the real builder (js/ui/academy-sandbox.js), recomputes every number and fails when the economy, the content or a lesson drifts,
// naming the number that moved. One example is deliberately not a sandbox deal: mission 4 walks a made-up buyer through the real Haggle game so that
// three plays can meet the same hidden limit, and says so on the card.
//
// Conventions the runner relies on:
//  - A mission's `win` is either a different event from its last step's `wait`, causally after it (a click on the control that produces it, or a
//    consequence of it), or the very same event, with a last-step `wait.match` that implies the win's (js/ui/academy-sandbox.js `feedRun` lets one event
//    finish the last step and win, and the test file plays both shapes). The second shape is for the two lessons whose last deal can reach the engine
//    without a haggle, or can be struck with the wrong buyer: m01 (a sale to anyone sends the same haggle, so only the pitch names Wen) and m02 (the Market
//    card's Quick buy sends a `buy` and no haggle). Everywhere else the step waits for the haggle and the win is the pitch or buy that follows it.
//  - The Deal Room tells the engine what a player did only when the deal is over (js/deal.js `finish`: Pass, See the result or Quick), so an `inspect`,
//    `haggle`, `auction` or `buy` event arrives together with the others at the end of one deal, never when a stage is concluded. Steps and wins are
//    written against that order: inspect, then haggle, then auction, then buy or pitch.
//  - A tap that opens a Deal Room is not a thing a step can wait for. The runner hears a click on a world sprite (its hit test) and on the HUD, but not on the
//    Market card's "Sell ... to ..." button, a lot's "Look it over" or a Stock row's "Repair", and those are the controls the coach points a player at. A step that
//    has the player open a deal therefore tells them to tap the buyer, the lot or the Repair button AND to play the deal, and waits for what the finished deal sends,
//    which is the same from every route (sprite, card, Stock row; Quick, by hand or a mix). Click waits are only for the HUD (hud-cash, hud-clock, hud-networth).
//  - For a sale the engine hears haggle (the Close stage) first and pitch last (js/deal.js `finish`). The last deal of a lesson waits for haggle and wins on the
//    pitch that follows it; a deal that is followed by another step waits for pitch, so the Continue press on its result screen can never advance a later step.
//    A wait on haggle is safe only where the Close stage is really played (the test file checks that none of these sales is capped: nothing to haggle over) and
//    where the haggle itself says enough: its payload (role, mult, score, deal) names no buyer and no lot, so a step that must hear ONE buyer or ONE kind of lot
//    waits for the pitch or the buy, whose payload does (seg, cls, fake, price).
//  - A coach card whose anchor is a deal-* element is carried into the Deal Room while one is open (and floats above the dock before), so a step that opens a deal
//    and plays it is anchored on deal-quick, deal-room or the stage panel it teaches; deal-room is the one that is there for every stage.
//  - A 'paused' clock moves only when the player taps `hud-clock`; missions that need time (6, 7, 9) end a step with that tap. The lesson runs the clock
//    at 16x (makeSandboxSession), a virtual hour is 7 real seconds, and the coach names that speed and what it means in seconds.
//  - `lots[].auction` (and its twin `lots[].mode: 'auction'`, the engine's own field name) and `events[].cls` are optional extras the base schema
//    lacks: mission 10 needs a lot that is certainly an auction, mission 7 needs the glut to hit the sneakers it sells. A runner that ignores them
//    still plays, only less deterministically.
//  - A clock mission opens every district its net worth already qualifies for (`zones`), so the engine does not announce them one by one at hour 1
//    and bury the lesson's own headline in the ticker.
//  - Skills never go down from one mission to the next (effective levels, the Background's bonus included: the Quests drawer shows them from mission 5).
//  - The herd in missions 3, 6 and 8 is the cohort's ghosts at hour 0 with the seed 'academy-<mission id>'. The ghosts start in the first districts
//    and walk outward (js/cohort.js zoneShare), so a herd exists only where the ghosts already are at day 1: that is why mission 8 lives in Metro Hub.
//  - Districts that need their unlock bonus list at least two districts in `zones` (Game.B is cached by the number of open districts).
//
// What a runner must still do that no data can (the test file holds the reference check, `stillPossible`, and plays each mistake below): a lesson whose one scarce
// thing (the paperclip, the broken van, the last pin set, the last lot, the only counterfeit, a manager's working capital) was spent on the wrong buyer or the wrong
// route cannot be finished and needs a restart, and the coach cannot know it unless the runner asks (it should ask after every game event and whenever a step
// begins, and rebuild the lesson with makeSandboxSession as `play(idx)` does, showing Restart at once rather than after the 20-second hint); a clock tapped before
// its step spends the scripted shock early (the coach says "do not pause yet" and "watch the ticker", and a runner should hold the clock until the step that asks
// for it, or pause it when the shock lands). The hints of those steps end by naming Restart.
//
// Three things the data cannot fix and the coach words around (js/ui/drawers/market.js and crew.js, js/ui/academy.js are outside this file): the Market card's
// "Quick buy" calls game.buyLot() and skips the Deal Room, so it sends a `buy` and no inspect, haggle or auction (m02 and m10 name Look it over, and m02's last
// step is finished by the buy itself); the hire dialog opens on the Broker whenever it is affordable, with the coach card behind it (m06's coach says so before
// the dialog opens); and a lot or buyer spent early strands a lesson (above). A UI that routes Quick buy through the Deal Room, carries the card into the hire
// dialog and offers Restart on a stranded lesson makes those three words redundant, not wrong.

export const ACADEMY = [
  // ------------------------------------------------------------------------------------------------------------------ 1
  {
    id: 'm01', title: 'First Swap', icon: '📎', zone: 1, concept: 'utility-fit', minutes: 1.5,
    intro: "Dawn in the Scrap Yard. You own one rusty paperclip and $0.00. Wen, a stressed student, is clutching a thesis that will not stay together, and it is due at nine. A mechanic and a barista wander by too. Who needs what you hold?",
    setup: {
      clock: 'paused', cash: 0, assets: [{ cls: 'paperclip' }],
      leads: [
        { id: 'sim-student', seg: 'student', budget: 4, need: 'tool' },
        { id: 'yard-mechanic', seg: 'mechanic', budget: 14 },
        { id: 'cafe-barista', seg: 'barista', budget: 6 },
      ],
      lots: [], zones: [1], features: ['stock', 'market'], cohort: { ghosts: 0 },
    },
    steps: [
      { id: 'cash', say: "Welcome, founder. This is your whole fortune: $0.00 and one paperclip worth about five cents. Everybody starts exactly here. Tap your cash to begin.", anchor: 'hud-cash', wait: { type: 'click', anchor: 'hud-cash' }, hint: "Tap the cash figure in the top bar. It is the number you are about to grow." },
      { id: 'stock', say: "Open Stock to meet your paperclip. Its card shows what it is worth today, so you can tell a bargain from a bluff later. Keep it for now: the sale comes last.", anchor: 'dock-stock', wait: { type: 'ui', ui: 'open-drawer', id: 'stock' }, hint: "Click the Stock icon in the dock at the bottom of the screen." },
      { id: 'market', say: "Now open Market. Buyers appear as cards: what each one wants and how much they can spend. Read all three before you choose, fit label included: how well your clip suits what that buyer wants.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock, next to Stock." },
      { id: 'student', say: "Tap the buyer who needs a thin metal tool right now, not the one with the biggest budget. In the Deal Room that opens, press Quick: it pitches at average skill so you can see what need is worth.", anchor: 'deal-quick', wait: { type: 'event', event: 'pitch', match: { seg: 'student', outcome: 'win', price: { gte: 1 } } }, hint: "Wen, the student with the thesis, is the card marked Urgent. Press Quick deal in the room. She pays partly in goods (barter): see Stock after. If the clip is gone, press Restart." },
    ],
    win: { event: 'pitch', match: { outcome: 'win', price: { gte: 1 } } },
    why: {
      title: 'Why a five-cent clip fetched $2.62',
      body: [
        "Price follows need, not cost. Wen needed a thin tool right now, so for her the clip solved a real problem. For a buyer in a hurry, their budget becomes the starting price, because the fix is worth that much to them. The gap between what something is worth and what a desperate buyer will pay is the urgency premium.",
        "A buyer in no hurry starts from the item's fair value, about five cents, and for them a budget is only a ceiling on what they can pay, never the price they will pay. The mechanic could spend $14.00 and still offers $0.03.",
        "Fit, how well the item matches what the buyer wants (0 to 1), nudges every offer, and below 0.15 the buyer refuses. Here fit moved the two calm buyers' offers by about 20% (1.16 against 0.97), while urgency moved them 65 to 87 times.",
      ],
      formula: "Offer = reference × fit term × 0.60 × market factor. Urgent buyer: reference = their budget, fit term = 0.55 + 0.45 × fit. Otherwise: reference = fair value, fit term = 0.40 + 0.95 × fit.",
      example: {
        setup: "The clip is worth about five cents. Wen is urgent, needs a tool, has a $4.00 budget and fits the clip at 1.0. Nobody has pitched this clip lately, so the market factor is an ordinary 1.09 (mission 8 explains it). Numbers assume an average Deal Room result (a multiplier of exactly 1.00), so yours may land a little above or below.",
        steps: [
          "Wen: $4.00 × 1.00 × 0.60 × 1.09 = $2.62. She pays part in goods, a box of paperbacks worth $1.04, and $1.52 in cash after the 2.5% fee.",
          "Barista: $0.05 × 1.16 × 0.60 × 1.09 = $0.04 (fit 0.80, fit term = 0.40 + 0.95 × 0.80).",
          "Mechanic: $0.05 × 0.97 × 0.60 × 1.09 = $0.03 (fit 0.60), despite the $14.00 budget.",
        ],
        result: "One paperclip, three offers: $2.62, $0.04 and $0.03. Wen's need was worth about 65 to 70 times the barista's offer, and it paid you your first $1.52 in cash.",
      },
    },
    teachBack: {
      q: "It is pouring and you are selling your spare umbrella on a corner. A tourist strolling past offers $1. A commuter with a meeting in ten minutes offers $8. Why the gap?",
      options: [
        { text: "Commuters have bigger budgets than tourists, so they pay more for the same umbrella.", correct: false, why: "A budget only says what someone can pay. The mechanic had the biggest budget in your mission and offered three cents." },
        { text: "The commuter is in a hurry, so the umbrella is worth more to them.", correct: true, why: "Yes. Urgency swaps the tourist's low starting point for what the fix is worth to the buyer. Your cost never set the price." },
        { text: "The rain made umbrellas worth more, so every buyer should pay more.", correct: false, why: "If that were the whole story the tourist would pay more too. The rain was the same for both. What differed was how badly each of them needed an umbrella right now." },
      ],
    },
    reward: { xp: 100, codex: ['utility-fit', 'urgency-premium', 'asset-utility-score'] },
  },

  // ------------------------------------------------------------------------------------------------------------------ 2
  {
    id: 'm02', title: 'Read the Room', icon: '🔍', zone: 4, concept: 'information-asymmetry', minutes: 2,
    intro: "The Pawn District, mid-morning. Two vintage wristwatches and a signed baseball sit on the counter, each priced like the real thing. The pawnbroker knows more about every one of them than you ever will. What is a look worth?",
    setup: {
      clock: 'paused', cash: 1000, assets: [], leads: [],
      lots: [
        { id: 'first-watch', cls: 'pawnWatch', cond: 'ok', price: 277, truth: { quality: 0.9, fake: true } },
        { id: 'second-watch', cls: 'pawnWatch', cond: 'ok', price: 277, truth: { quality: 1, fake: false } },
        { id: 'signed-ball', cls: 'signedBall', cond: 'ok', price: 128, truth: { quality: 1, fake: false } },
      ],
      zones: [4], features: ['stock', 'market', 'codex'], skills: { ops: 2, growth: 1, fintech: 1 }, cohort: { ghosts: 0 },
    },
    steps: [
      { id: 'codex', say: "Your first swap unlocked Codex pages. Open the Codex and skim Urgency Premium. Every mission ends with a page like it, written for the next time you need it.", anchor: 'dock-codex', wait: { type: 'ui', ui: 'open-drawer', id: 'codex' }, hint: "Click the Codex icon in the dock." },
      { id: 'market', say: "Open Market. Three lots, all priced near their value, and none says which one is honest. The seller knows. You do not. That gap is called information asymmetry.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock." },
      { id: 'first-watch', say: "The first watch looks perfect, and so does its price. Tap it and READ it before you pay (Look it over, not Quick buy): the serial number check costs one inspection point and is the best fake detector.", anchor: 'world:lot:first-watch', wait: { type: 'event', event: 'inspect', match: { fake: true } }, hint: "Use Look it over, not Quick buy: Quick buy pays at once and skips the check. Probe the serial number, then press Done reading, Continue and Pass on this lot." },
      { id: 'second-watch', say: "That first watch was a fake, worth about 8% of a real one, and its price never warned you. Now READ the second watch the same way, power-on for condition too, before you pay.", anchor: 'world:lot:second-watch', wait: { type: 'event', event: 'inspect', match: { fake: false } }, hint: "Use Look it over. Probe the serial number and the power, then press Done reading, Continue and Pass on this lot to keep what you learned. Quick deal also works, but it buys the watch." },
      { id: 'buy', say: "Genuine and sound? Then buy it: tap the genuine watch and press Quick deal (the card's Quick buy works too). The haggle plays at average skill, so the price may land a little over the list.", anchor: 'world:lot:second-watch', wait: { type: 'event', event: 'buy', match: { fake: false } }, hint: "Tap the second watch again and press Quick deal. The signed baseball is genuine too, if you would rather buy that." },
    ],
    win: { event: 'buy', match: { fake: false } },
    why: {
      title: 'Why a one-point check beat the price tag',
      body: [
        "Information asymmetry means one side of a deal knows more than the other. The pawnbroker knows which watch is a replica. You do not, and here the price tells you nothing: a fake is listed at full price. (In the wild a suspiciously low price is a warning too.) Up to about one lot in five of the riskiest goods is counterfeit (22% for a watch), and a fake is worth about 8% of the real thing.",
        "Adverse selection is the risk behind that: the sellers most eager to deal are often the ones with something to hide, so an easy deal deserves a second look. Here the fakes carry full price, so only a check can warn you. Due diligence closes the gap: a check pays when the chance of being wrong times the money at risk beats its cost.",
        "Read is a skill. Ops (Operational Engineering) gives you more probe points on each lot and sharper answers. The serial number is the best probe for a fake; power-on is the best for condition. A real probe is still noisy: read a clean result as lower risk, not zero.",
      ],
      formula: "Perfect check, per lot: worth = P(fake) × (price - fake value). Blind buy = (1 - P) × value + P × fake value - price. Checked buy = (1 - P) × (value - price).",
      example: {
        setup: "A watch is worth $314.60 if genuine and $25.17 if fake. It lists at $277, like the one beside it. In this district 22% of watches are fakes. The signed baseball is worth $147.00 genuine and $11.76 fake, lists at $128, and has the same 22%.",
        steps: [
          "Blind buy at $277: 0.78 × $314.60 + 0.22 × $25.17 - $277 = -$26.07 expected. A loss, even though the genuine watch really is worth more than you pay.",
          "If a check were perfect and you bought only genuine watches: 0.78 × ($314.60 - $277) = +$29.33 expected.",
          "Without a look, your best choice is to skip the watch: $0. A perfect check turns that into +$29.33, and set against buying blind it is a $29.33 + $26.07 = $55.40 swing (0.22 × ($277 - $25.17), the chance of a fake times the money at risk).",
          "A real probe is noisy. Your serial check catches about four fakes in five and wrongly flags about 3% of genuine watches, so it earns about $17 here, more than half of the perfect $29.",
          "The baseball: blind -$10.75, perfect check +$14.82, a swing of $25.57. Same 22%, under half the money at risk.",
        ],
        result: "Blind, the watch is a -$26.07 bet. A perfect check makes it a +$29.33 deal, and a real serial check about +$17. The price did not warn you. Looking did.",
      },
    },
    teachBack: {
      q: "A seller lists a signed jersey at $150, and a fake would carry the same price. Genuine it is worth $170, a fake about $14, and one in five is fake. A look costs one point. Spend it?",
      options: [
        { text: "Yes. The listing hides a real chance of a fake, and one point is cheap protection against it.", correct: true, why: "Exactly. Blind, you lose about $11 on average (0.8 × $170 + 0.2 × $14 - $150). A perfect look turns that into a +$16 deal (0.8 × ($170 - $150)), a swing of about $27." },
        { text: "No. The jersey lists below its genuine value, so the average buyer still comes out clearly ahead.", correct: false, why: "The listing is below the genuine value, but one jersey in five is a $14 fake. Bought blind, the average buyer loses about $11." },
        { text: "No. The price looks normal, and a normal price means an honest seller.", correct: false, why: "Here fakes carry normal prices too, so a normal price tells you nothing. A look is the only thing that can warn you." },
      ],
    },
    reward: { xp: 120, codex: ['information-asymmetry', 'due-diligence', 'adverse-selection', 'expected-value'], points: 1 },
  },

  // ------------------------------------------------------------------------------------------------------------------ 3
  {
    id: 'm03', title: 'Know Your Buyer', icon: '🎯', zone: 3, concept: 'persona-fit', minutes: 2,
    intro: "Campus Quad, lunchtime. You hold two sets of blind-bag enamel pins and three people might want one. Every rival has spotted the obvious buyer. Speak to what each buyer cares about, and notice where the crowd is standing.",
    setup: {
      clock: 'paused', cash: 0, assets: [{ cls: 'enamelPins' }, { cls: 'enamelPins' }],
      leads: [
        { id: 'thrift-flipper', seg: 'bree', budget: 30 },
        { id: 'dorm-ra', seg: 'priya', budget: 25 },
        { id: 'bookstore-buyer', seg: 'bookstore', budget: 45 },
      ],
      lots: [], zones: [3], features: ['stock', 'market', 'codex'], skills: { ops: 3, growth: 1, fintech: 1 }, perks: ['grad'], cohort: { ghosts: 120 },
    },
    steps: [
      { id: 'market', say: "Open Market. The Academy lends you a Niche Radar: each buyer's card now says how crowded that buyer is, and how many of the recent sales went there.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock." },
      { id: 'bree', say: "Tap Bree's card; her line reads Crowded. In the Pitch stage lead with two angles, the selling points you stress: read the hint on how she buys, then pick two her pins can back.", anchor: 'deal-stage-pitch', wait: { type: 'event', event: 'pitch', match: { seg: 'bree' } }, hint: "Pick two angles that fit the hint and what the pins offer (scarcity is their strength), then finish the deal. Quick skips the practice. A toast about crates? Use Bree's card in Market." },
      { id: 'delphine', say: "Sold. Now tap Delphine, whose card says almost nobody else sells to her, and Pitch again: new buyer, new hint. 'x as keen' is your angles; the price gap is mostly the crowd.", anchor: 'deal-stage-pitch', wait: { type: 'event', event: 'haggle', match: { role: 'sell' } }, hint: "Tap Delphine's card in Market, choose two angles in the Pitch stage and finish the deal. Quick skips the angles, so you will not practise them. No pins left? Press Restart." },
    ],
    win: { event: 'pitch', match: { seg: 'bookstore' } },
    why: {
      title: 'Same pins, different buyers, different pitches',
      body: [
        "Persona fit is how well your pitch speaks to what a buyer values. Every buyer leans toward an angle: prestige, utility, scarcity, price or story. In the Pitch stage you pick two. A pair that suits the buyer and that your goods can honestly back keeps the buyer keen; a bad pair cools them.",
        "Keenness can run from x0.85 for the worst possible pair to x1.20 for the best, and a keen buyer is easier to haggle with. At an average close a keen buyer accepts the fair price, while a cold one wants about 9% off. Fit decides whether a deal exists at all: below 0.15 a buyer refuses.",
        "The crowd matters too. When many rivals pitch the same buyer, that buyer's price sinks, whatever your angles. Mission 8 shows how far. The obvious buyer is often the crowded one. In this lesson the gap between Bree's price and Delphine's is the crowd; your angles' own effect is the smaller, steadier 9% shown below.",
      ],
      formula: "Fit term = 0.40 + 0.95 × fit. Keenness = x0.85 (worst pair) to x1.20 (best pair). A buyer at x1.00 or more accepts the fair price at an average close.",
      example: {
        setup: "Bree fits the pins at 1.00 and Delphine at 0.50. A pin set is worth $5.30 here, and the crowds put the fair prices at $1.72 and $8.74. Numbers assume Quick plays the Close stage, an average Deal Room result.",
        steps: [
          "Bree buys with feeling and your pins back scarcity, prestige and story. Scarcity with prestige makes her x1.13 as keen, and she accepts the fair price, $1.72.",
          "Utility with price is her worst pair: x0.98 keen, and the pins back neither angle. She wants about 9% off, so $1.56.",
          "Delphine, the same test: scarcity with story (x1.07) closes at $8.74, utility with price (x0.94) at $7.95, which is $0.79 less.",
        ],
        result: "Same pins, same buyers: the right angles kept the full price and the wrong ones cost about 9%. Fit gets you a deal, the angles protect its price, and the crowd sets how big it is.",
      },
    },
    teachBack: {
      q: "Kenji, a physics tutor, weighs things up with his head and wants proof. You are selling him a graphing calculator that works well. Which pair of angles should you lead with?",
      options: [
        { text: "Scarcity with story, the pair that suited Bree.", correct: false, why: "That pair suited Bree because she buys with feeling and her pins were rare. Kenji weighs things with his head, so it leaves him only about x1.01 as keen, against about x1.13 for the best pair." },
        { text: "Utility with price: both suit how he buys, and a calculator can honestly back them.", correct: true, why: "Yes. A pair works when the buyer cares about both angles and your goods back them up, here about x1.13 as keen. Bree needed feeling; Kenji needs proof and numbers." },
        { text: "Prestige with scarcity: sell it as an exclusive piece.", correct: false, why: "A claim your goods cannot back is worse than silence. A calculator has no standing to claim, and this is Kenji's coolest pair, about x1.00 as keen." },
      ],
    },
    reward: { xp: 140, codex: ['persona-fit', 'market-saturation', 'saturation-herd'], points: 1 },
  },

  // ------------------------------------------------------------------------------------------------------------------ 4
  {
    id: 'm04', title: 'Haggle 101', icon: '🤝', zone: 2, concept: 'anchoring', minutes: 2.5,
    intro: "Flea Market Row, Saturday. Every stall expects a haggle and every price is just a first offer. You have two vintage radios to sell and three people circling. You are about to learn what the first number is worth.",
    setup: {
      clock: 'paused', cash: 0, assets: [{ cls: 'radio' }, { cls: 'radio' }],
      leads: [
        { id: 'stall-collector', seg: 'collector', budget: 40 },
        { id: 'stall-dolores', seg: 'dolores', budget: 40 },
        { id: 'stall-tariq', seg: 'tariq', budget: 30 },
      ],
      lots: [], zones: [2], features: ['stock', 'market', 'codex'], skills: { ops: 2, growth: 2, fintech: 2 }, cohort: { ghosts: 0 },
    },
    steps: [
      { id: 'market', say: "Open Market. Three people circle your radios: Mr. Abernathy (a hard bargainer), Dolores (friendlier) and Tariq, a busker who would pay less but is your fallback.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock." },
      { id: 'careless', say: "Deal 1, the careless way: tap Mr. Abernathy's card, press 'Quick: auto-play at average skill' for the Pitch, then in the Close press Fair and take his first answer. Compare the multiple of fair, not the dollars.", anchor: 'deal-room', wait: { type: 'event', event: 'pitch', match: { seg: 'collector' } }, hint: "Press Fair. If they counter, press Accept their offer. If they say yes at once, the deal is already done. Two crates? Use his card in Market, or tick one in Stock first." },
      { id: 'careful', say: "Deal 2, the careful way: tap Dolores, press the stage's Quick for the Pitch (not Quick deal). In the Close read 'Your read of their limit', press Aim high, Hold, then Come down small. Aim for 10% over fair.", anchor: 'deal-room', wait: { type: 'event', event: 'haggle', match: { role: 'sell' } }, hint: "Smallest step: the Come down button with the smallest amount. Quick deal skips the Close. If she stalls, Mention your other option once. Accept at 1.10 × fair. Weak Pitch? Leave and tap Dolores again." },
    ],
    win: { event: 'pitch', match: { mult: { gte: 1.1 } } },
    why: {
      title: 'The first number is worth money',
      body: [
        "Anchoring: the first number on the table pulls the whole negotiation toward it. Open at fair and the most you can get is fair, and a buyer may say yes at once while willing to pay more. Open high and a deal can land above fair. Their first answer is not their limit: hold and it climbs. (Real anchors also shift what people think a thing is worth; here the limit stays fixed.)",
        "Every deal has a ZOPA, the range of prices both sides could accept, from the lowest you would take to the highest the buyer would pay. You cannot see their limit, but Growth (Customer Acquisition Velocity), your skill at finding and reading buyers, gives you a fuzzy read of it. Hard bargainers punish an opening far past it, so anchor high but believable.",
        "Your BATNA is your best alternative to a deal. The busker made your walk-away price real: a threat to leave works only when you could actually leave. Press Mention your other option once and a buyer may lift what they will accept.",
      ],
      formula: "ZOPA = [your floor, their limit]. Your real floor = your BATNA. Opening high is 1.40 × fair; a concession moves 4%, 9% or 16% of fair.",
      example: {
        setup: "A made-up hard buyer: a radio's fair price is $10.61 and he will pay at most $12.84, which you cannot see. A busker would pay you $8.74 for it. All three plays meet this same buyer. In the game you meet other people, so your own prices will differ.",
        steps: [
          "Open at fair ($10.61) and take their first counter, $7.47: you sell at $7.47, which is 0.70 × fair.",
          "Open at fair but hold your ground: they come up to $10.61. Refusing the first answer was worth $3.14.",
          "Open high ($14.85, 1.40 × fair), hold, then concede: $13.15, $12.20, $11.78. They agree at $11.78, which is 1.11 × fair. The high anchor added another $1.17.",
          "The busker's $8.74 is your BATNA. Any offer below it is worse than walking away, so $7.47 should never have been taken.",
        ],
        result: "Same buyer, same limit, three plays: $7.47, $10.61 and $11.78. Patience was worth $3.14 and the high anchor $1.17 more, and the $8.74 alternative told you which offers to refuse.",
      },
    },
    teachBack: {
      q: "Same buyer, same hidden limit. One seller opens at fair and takes the first counter. Another opens high, holds, and concedes in small steps. Why does the second end higher?",
      options: [
        { text: "Opening high forces the buyer to pay more than their limit, because they feel bound to match the number.", correct: false, why: "No buyer pays past their limit, they walk away. A high anchor works by pulling the middle of the talk upward, and one far past the limit ends it." },
        { text: "A first counter is a probe, not their limit. Holding lets it climb and a high anchor lifts the middle.", correct: true, why: "Yes. The first counter was $7.47 and the limit was $12.84. Holding and a high anchor found the room between them." },
        { text: "The second seller met a luckier buyer, since the first counter shows what this buyer will pay.", correct: false, why: "The buyer followed the same rules both times. A counter is an opening move, and patience, not luck, closed the $3.14 gap." },
      ],
    },
    reward: { xp: 150, codex: ['negotiation', 'anchoring', 'batna-zopa'] },
  },

  // ------------------------------------------------------------------------------------------------------------------ 5
  {
    id: 'm05', title: 'Fix It', icon: '🔧', zone: 7, concept: 'repair-roi', minutes: 2,
    intro: "Auto Row, the repair bays ring with hammers. An ex-fleet cargo van with a dead transmission sits in your yard, worth about 30% of a working one. Delgado Delivery is shopping for vans. Is the fix worth what it costs?",
    setup: {
      clock: 'paused', cash: 600, assets: [{ cls: 'van', cond: 'broken', quality: 1 }],
      leads: [{ id: 'fleet-buyer', seg: 'smelog', budget: 5200 }],
      lots: [], zones: [6, 7], features: ['stock', 'market', 'codex', 'quests'], skills: { ops: 2, growth: 2, fintech: 2 }, cohort: { ghosts: 0 },
    },
    steps: [
      { id: 'quests', say: "Open Quests. Missions, bounties and your skill points live here. A point on Ops makes every repair cheaper and better, and this lesson pays you another one at the end.", anchor: 'dock-quests', wait: { type: 'ui', ui: 'open-drawer', id: 'quests' }, hint: "Click the Quests icon in the dock." },
      { id: 'stock', say: "Open Stock. Your broken van is in the crate. Broken goods sell for a fraction of their working price.", anchor: 'dock-stock', wait: { type: 'ui', ui: 'open-drawer', id: 'stock' }, hint: "Click the Stock icon in the dock." },
      { id: 'repair', say: "Read the van's repair quote in Stock: cost, restored quality, new value. Is the gain bigger than the cost? Your Ops sets that price. Then press Repair and stop the marker in the green band.", anchor: 'drawer', wait: { type: 'event', event: 'repair' }, hint: "Press Repair on the van's card. In the Fix stage press Stop in the green band three times (Ops widens it), or press Careful: the quote's quality, a bill 30% over it. Van sold already? Press Restart." },
      { id: 'market', say: "Fixed. Open Market and find a buyer who wants a van that runs.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock." },
      { id: 'fleet', say: "Delgado Delivery buys vans and pays far more for one that runs. Tap the fleet buyer's card, then press Quick in the Deal Room and compare the price with the $1,058 Delgado would have paid for the broken van.", anchor: 'deal-room', wait: { type: 'event', event: 'haggle', match: { role: 'sell' } }, hint: "Tap the fleet buyer's card in Market, then press Quick deal inside the Deal Room." },
    ],
    win: { event: 'pitch', match: { cls: 'van', seg: 'smelog' } },
    why: {
      title: 'When is a repair worth it?',
      body: [
        "A repair is an investment: you spend cash now to raise an asset's value. Repair ROI is the gain after cost divided by the cost. Do it only when the ROI beats what the same cash would earn elsewhere. That alternative return is your opportunity cost.",
        "Three things set the price of a fix. Ops makes it cheaper (each level multiplies the cost by 0.42) and better (quality climbs from 0.50 at Ops 1 to 1.00 at Ops 5). Auto Row takes 25% off the bill and unlocking it 10% more: 0.75 × 0.90 = 0.675 of the van's $1,050 base. Your timing on the marker nudges quality by up to 15% and cost by -10% to +30%.",
        "So the same van can be a loss for one founder and a bargain for another. Stock's quote is the bill before the marker, and Careful, the steady setting, runs 30% over it. That is why a skill point on Ops is worth spending.",
      ],
      formula: "ROI = (value after - value before - cost) / cost. Cost = base × 0.42^(Ops - 1) × district discounts. Quality = 0.50 + 0.50 × min(1, (Ops - 1) / 4).",
      example: {
        setup: "A working van is worth $3,828. Broken, it is worth 30% of that: $1,148. Base repair $1,050, times 0.675 for Auto Row and its unlock bonus. Numbers assume an average Deal Room result and the Careful setting: the quote's quality at a bill 30% over it. Delgado Delivery takes broken vans too.",
        steps: [
          "Ops 1: cost $1,050 × 0.675 × 1.30 = $921.38. Quality 0.50, so the van is worth $1,914. Gain $765.60 minus $921.38 cost = -$155.77 (ROI -17%). It loses money.",
          "Ops 2: cost $1,050 × 0.42 × 0.675 × 1.30 = $387. Quality 0.625, value $2,393. Gain $1,244 minus $387 = $857 (ROI 221%).",
          "Ops 3: cost $163, quality 0.75, value $2,871: +$1,560 (ROI 960%).",
          "Careful is not the worst case. A poor marker at Ops 2 (quality -15%, cost +30%) still nets +$498, and a perfect one (quality +15%, cost -10%) nets +$1,335.",
          "Delgado pays $1,058 for the broken van and $2,203 for the repaired one, more than double, for a $387 repair.",
        ],
        result: "One skill point on Ops turns a $156 loss into an $857 profit on the same van. Always read the quote before you pay.",
      },
    },
    teachBack: {
      q: "You can afford one job. Job 1 costs $500 and lifts a van's value by $600. Job 2 costs $200 and lifts another's by $500. Which repair is the smarter buy?",
      options: [
        { text: "Job 1: it adds more value, and a bigger lift is a bigger win.", correct: false, why: "Value added is not profit. After its $500 bill Job 1 gains $100, and that cash would have funded Job 2 twice." },
        { text: "Either one: both lift the value, and a repair that adds value is a good repair.", correct: false, why: "A lift has to beat the bill. Both do here, but by very different margins, so the choice matters." },
        { text: "Job 2: after its cost it gains more, on less cash.", correct: true, why: "Yes. Job 2 nets $300 on $200 spent (150%), against $100 on $500 (20%) for Job 1. Judge a repair by the gain after its cost, against the cash it ties up." },
      ],
    },
    reward: { xp: 160, codex: ['repair-roi', 'margin'], points: 1 },
  },

  // ------------------------------------------------------------------------------------------------------------------ 6
  {
    id: 'm06', title: 'Cash Is Not Sleeping', icon: '💰', zone: 5, concept: 'working-capital', minutes: 2,
    intro: "Metro Hub, where managers work the market while you sleep. You hold $620 in cash. It is safe, and it earns exactly nothing. A plot of land is open for your first manager. Can you hire one and still keep it fed?",
    setup: {
      clock: 'paused', cash: 620, assets: [], leads: [], lots: [], zones: [1, 2, 3, 4, 5],
      features: ['stock', 'market', 'codex', 'quests', 'crew'], skills: { ops: 2, growth: 2, fintech: 2 }, cohort: { ghosts: 200 },
    },
    steps: [
      { id: 'cash', say: "You hold $620 in cash. It is safe, and it earns $0 a day. Cash at work can earn more, but starting the work costs a fee. Tap your cash, then let's price that trade.", anchor: 'hud-cash', wait: { type: 'click', anchor: 'hud-cash' }, hint: "Tap the cash figure in the top bar." },
      { id: 'crew', say: "Open Crew. This is where managers live: people who buy and sell for you in a loop, on a fixed cycle. At this size they pay thinly: we hire only to watch the loop run.", anchor: 'dock-crew', wait: { type: 'ui', ui: 'open-drawer', id: 'crew' }, hint: "Click the Crew icon in the dock." },
      { id: 'hire', say: "Press Hire a manager. The room opens on the Broker: pick the Student first. The fee AND the capital leave your wallet, so keep $450 free. A lane is the goods and buyer a manager runs. Expect a long payback.", anchor: 'drawer', wait: { type: 'event', event: 'hire' }, hint: "The room opens on the Broker: click the Student. Lane: Off-Lease Laptop Pallet to Brightpath Corporate Training. Leave Capital per cycle at full; Use what I can afford runs a big manager on pennies." },
      { id: 'clock', say: "Your cash goes out to work as soon as time runs. Press the clock: it runs at 16x, so the 41-hour cycle takes about 18 seconds. Watch your $450 go out and come home.", anchor: 'hud-clock', wait: { type: 'click', anchor: 'hud-clock' }, hint: "Tap the clock to let time run. If the manager never starts a cycle it is starved of cash: press Restart on this card and hire the Student." },
    ],
    win: { event: 'cycle' },
    why: {
      title: 'A manager is a bet with a payback date',
      body: [
        "Working capital is the cash a business needs to run its loop: pay for goods, wait, get paid. A manager turns idle cash into that loop. Money in the wallet earns nothing. Money in the loop earns whatever its cycle nets after fees, and that has to pay back the fee you spent to start it before it beats idle cash.",
        "Cash-flow velocity is how often a dollar completes the loop. Profit per day is the net of one cycle over its length in days, so a faster cycle or a bigger net both help. But every cycle pays a fee on the whole allocation, so a thin lane can lose money: read the forecast first. More capital, a faster lane and upgrades are what make a manager pay.",
        "The trap: a manager needs working capital as well as a fee. Spend everything on the hire and nothing is left to work with, so the manager sits idle, starved. A starved manager earns nothing, and the fee is already spent: your wallet is $600 lighter, and releasing the manager brings back only 60%. Lowering its capital to fit leaves you with an expensive manager earning next to nothing.",
      ],
      formula: "Hire fee + working capital <= cash on hand. Net per cycle = gross - fee - tax - royalty - overhead. Profit per day = net per cycle / days per cycle. Payback in days = hire fee / profit per day.",
      example: {
        setup: "You have $620. The Student costs $120 and works with up to $450. The Broker costs $600 and works with up to $1,000. Both take the quiet lane: laptop pallets to Brightpath. Your three skills, Ops, Growth and Fintech (Capital Sourcing), are at level 2. Forecasts are read at the moment you hire.",
        steps: [
          "Broker: $620 - $600 = $20 left to work with, against the $1,000 of capital per cycle it is set to use. Starved: no cycle ever starts, and the $600 fee has left your wallet.",
          "Student: $620 - $120 = $500 left, so the full $450 goes to work. A cycle lasts 41 hours.",
          "Its forecast: gross $16.43, less $15.06 of costs (the platform fee alone is $10.96, then tax, the manager's royalty and overhead), leaves $1.37, or $0.80 a day. Real cycles, the first included, pay more or less as the crowd moves.",
          "A funded Broker on the same lane would net $8.28 in 32 hours, $6.21 a day, and still need 97 days to earn back its $600 fee. Idle cash earns $0 a day.",
        ],
        result: "Fed Student: $0.80 a day. Starved Broker: $0 and a wallet $600 lighter. Idle cash: $0, nothing spent. The Student needs about 150 days to earn back its $120 fee, longer than a 90-day run, so here it is a training wheel. Divide the fee by the profit per day before you hire.",
      },
    },
    teachBack: {
      q: "You have $700 and plan to put $500 per cycle behind Manager A ($300 to hire) or $450 per cycle behind Manager B ($150 to hire). Which plan can start a cycle?",
      options: [
        { text: "Manager B: after its fee the wallet still holds enough to cover the capital it will use.", correct: true, why: "Yes. After B's $150 fee you hold $550, enough for the $450 it needs, with $100 to spare." },
        { text: "Manager A, because the pricier manager earns more per cycle and more than pays for itself.", correct: false, why: "Only if it is fed. After A's $300 fee you hold $400, short of the $500 it needs, so it never starts a cycle." },
        { text: "Both: the wallet covers each hire fee, so both will run.", correct: false, why: "Not both. The two fees take $450 and leave $250, short of what either needs ($500 and $450). The fee is only part of the bill: the working capital must be in the wallet too." },
      ],
    },
    reward: { xp: 160, codex: ['working-capital', 'cash-flow-velocity', 'opportunity-cost'] },
  },

  // ------------------------------------------------------------------------------------------------------------------ 7
  {
    id: 'm07', title: "Other People's Money", icon: '🏦', zone: 5, concept: 'leverage-risk', minutes: 2.5,
    intro: "The Metro Hub bank is open. You have $400 and four sneaker lots priced about a third under their value. You can afford one. The bank would lend you more. How much borrowed money is smart, and what if prices slip?",
    setup: {
      clock: 'paused', cash: 400, assets: [], leads: [],
      lots: [
        { id: 'bargain-a', cls: 'sneakers', cond: 'ok', price: 250 },
        { id: 'bargain-b', cls: 'sneakers', cond: 'ok', price: 250 },
        { id: 'bargain-c', cls: 'sneakers', cond: 'ok', price: 250 },
        { id: 'bargain-d', cls: 'sneakers', cond: 'ok', price: 250 },
      ],
      zones: [1, 2, 3, 4, 5], features: ['stock', 'market', 'codex', 'quests', 'crew', 'bank'], skills: { ops: 2, growth: 2, fintech: 2 }, cohort: { ghosts: 0 },
      events: [{ kind: 'glut', atHour: 6, cls: 'sneakers' }],
    },
    steps: [
      { id: 'bank', say: "Open the Bank. Your own $400 is your equity. The bank lends up to a debt-to-equity ratio (D/E) of 3.0. At 4.5 it steps in and sells your stock for you at a steep discount: a margin call.", anchor: 'dock-bank', wait: { type: 'ui', ui: 'open-drawer', id: 'bank' }, hint: "Click the Bank icon in the dock." },
      { id: 'draw', say: "Each sneaker lot costs $250 and is worth $369. The slider borrows a share of the $1,200 the bank allows: 15% is $180, enough for a second lot. The gauge previews your D/E. How much will you borrow?", anchor: 'drawer', wait: { type: 'event', event: 'draw' }, hint: "Slide to an amount in the Bank drawer and press Borrow. Think about what a bad day would do to the gauge." },
      { id: 'market', say: "Money in hand. Open Market and buy the lots your loan paid for.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock." },
      { id: 'buy', say: "Tap a sneaker lot and press Quick to buy it. Each lot is worth more than you pay, so net worth rises on paper the moment you own it. Buy as many as your loan truly justifies.", anchor: 'world:lot:bargain-b', wait: { type: 'event', event: 'buy' }, hint: "Tap a lot, then press Quick inside the Deal Room. Repeat for as many lots as you want." },
      { id: 'clock', say: "Done buying? Press the clock. It runs at 16x: a sneaker glut lands in about 3 seconds and lasts about 30. More sellers than buyers, so prices will drop. Do not pause yet.", anchor: 'hud-clock', wait: { type: 'click', anchor: 'hud-clock' }, hint: "Tap the clock in the top bar to let time run, and leave the speed alone." },
      { id: 'shock', say: "Watch the ticker. The glut headline lands in a few seconds: when it does, pause the clock. Your stock will be worth less, but your debt stays the same size.", anchor: 'ticker', wait: { type: 'event', event: 'shock', match: { kind: 'glut' } }, hint: "Wait for the glut headline in the ticker, then press the clock to pause. If you paused too soon, press the clock again and keep watching." },
      { id: 'bank-again', say: "Reopen the Bank and look at the gauge. The margin call is at 4.5: how much further could prices fall before you got there? Then repay what you can.", anchor: 'dock-bank', wait: { type: 'ui', ui: 'open-drawer', id: 'bank' }, hint: "Open the Bank, then press Repay." },
    ],
    win: { event: 'repay' },
    why: {
      title: 'Borrowed money cuts both ways',
      body: [
        "Leverage means using borrowed money to hold more than you own. When prices rise you keep all the gain on the extra stock and pay only the interest. When prices fall you still owe the whole loan. Same lever, both directions.",
        "Debt-to-equity (D/E) is debt divided by net worth. The bank stops lending when D/E would reach 3.0, counted before its 3% fee, so the gauge reads about 3.3 right after a maximum draw. At 4.5 it forces a margin call, seizing your best assets at a 35% discount until D/E is back to 3.0.",
        "The safe loan is the one you survive a crash with. Stay near D/E 1 and even a harsh fall in prices leaves a wide gap to 4.5. Interest matters too: about 11% per 30 days is roughly $2.23 a day on $600, so a loan only pays when the goods earn more than that while you hold them. Here the lots are worth 47% more than you pay.",
      ],
      formula: "D/E = debt / net worth. Net worth = cash + stock - debt. The loan fee is 3% upfront. Margin call when D/E > 4.5.",
      example: {
        setup: "You have $400. Lots cost $250 and are worth $369 each. A glut cuts sneaker values by 25%. Numbers assume an average Deal Room result (a multiplier of exactly 1.00), so yours may land a few dollars either way.",
        steps: [
          "Borrow only what you will spend, $180, and buy 2 lots: net worth $632, D/E 0.28. After the glut: net worth $447, D/E 0.40.",
          "Borrow the maximum $1,200, buy 4 lots: net worth $838, D/E 1.43. After the glut: net worth $469, D/E 2.56.",
          "Margin call line: the big loan trips it if sneaker values fall 39% from the start, 18% beyond the glut. The small loan survives an 80% fall.",
        ],
        result: "Both loans survived this glut, and the big one even ended $22 ahead. But it sat only 18% of a fall away from a forced sale at a steep discount, and you could not feel it. Size a loan by the worst day, not the average one.",
      },
    },
    teachBack: {
      q: "Priya holds $2,000 of goods: $1,000 of her own and $1,000 borrowed (D/E 1.0). Tom holds $4,000: $1,000 his own and $3,000 borrowed (D/E 3.0). Prices fall 20%. Whose bank steps in first?",
      options: [
        { text: "Priya's, since she holds fewer goods to cover her debt.", correct: false, why: "She holds $2,000 of goods against $1,000 of debt. Tom holds $4,000 against $3,000, a much thinner cushion." },
        { text: "Neither is close, because a fall that size is far below the margin call level.", correct: false, why: "The margin call level, 4.5, is a ratio of debt to net worth, not a price fall. Tom's 20% fall already pushed his D/E to 15." },
        { text: "Tom's: he owes three times his own money, so a small fall wipes out his cushion.", correct: true, why: "Yes. About an 8% fall trips his call, against about 39% for Priya. His equity of $1,000 sits under $3,000 of debt, so a small fall in prices eats most of it." },
      ],
    },
    reward: { xp: 180, codex: ['leverage-risk', 'debt-to-equity', 'margin-call'], points: 1 },
  },

  // ------------------------------------------------------------------------------------------------------------------ 8
  {
    id: 'm08', title: "Don't Follow the Herd", icon: '🧭', zone: 5, concept: 'creativity-multiplier', minutes: 2,
    intro: "Metro Hub. You hold two lots of limited-release sneakers. Loft 9 Trend Boutique is the obvious buyer: most rivals pitched there in the last two days. A pop-up stall that almost nobody is pitching sits around the corner. Does a crowd help you or hurt you?",
    setup: {
      clock: 'paused', cash: 0, assets: [{ cls: 'sneakers' }, { cls: 'sneakers' }],
      leads: [
        { id: 'trend-boutique', seg: 'boutique', budget: 1200 },
        { id: 'popup-stall', seg: 'popup', budget: 900 },
      ],
      lots: [], zones: [5], features: ['stock', 'market', 'codex', 'quests', 'crew', 'bank'], skills: { ops: 3, growth: 2, fintech: 1 }, perks: ['grad'], cohort: { ghosts: 200 },
    },
    steps: [
      { id: 'market', say: "Open Market. The Academy lends you a Niche Radar. Each card shows S, how saturated that buyer is, and Cm, the Creativity Multiplier you would earn.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock." },
      { id: 'boutique', say: "Loft 9 first, the obvious channel. Read its S and Cm on the card and predict the offer. Then tap the card, press Quick in the Deal Room and read the result: price, S and Cm. This is what the herd earns.", anchor: 'deal-quick', wait: { type: 'event', event: 'pitch', match: { seg: 'boutique' } }, hint: "Tap Loft 9's card in Market, then press Quick deal inside the Deal Room." },
      { id: 'popup', say: "Now the pop-up stall almost nobody is pitching. Compare its S and Cm with the first card, tap it and press Quick. Same sneakers, same fit: compare this price with the first sale.", anchor: 'deal-quick', wait: { type: 'event', event: 'haggle', match: { role: 'sell' } }, hint: "Tap the stall's card in Market, then press Quick deal inside the Deal Room. If both sneaker lots are gone, press Restart." },
    ],
    win: { event: 'pitch', match: { seg: 'popup', S: { lt: 0.5 } } },
    why: {
      title: 'Where the crowd is not',
      body: [
        "The Creativity Engine counts the pitches your cohort (here, simulated classmates) made in the last 48 hours. V_total is every pitch for your item in this district, V_niche is those that went to one buyer. Saturation S is V_niche divided by V_total.",
        "Cm, the Creativity Multiplier, falls as S rises. A crowded niche sits near the 0.40 floor, the herd trap. A rare niche climbs toward the 3.14 ceiling, a pioneer vector. The formula is below.",
        "Your offer is multiplied by Cm, so the same lot can sell for under half the baseline or for several times it, always capped at the buyer's budget. Copying whatever everyone else sold last week means competing for the same scraps.",
      ],
      formula: "S = V_niche / V_total. Cm = [0.40 + ln((V_total + 2) / (V_niche + 1))] × (1 - S), kept between 0.40 and 3.14.",
      example: {
        setup: "A sneaker lot is worth $364 here and both buyers fit it at 1.00, so the baseline offer is $364 × 1.35 × 0.60 × 1.04 = $307 (1.04 is your Growth bonus), and Cm then scales it. Numbers assume an average Deal Room result (a multiplier of exactly 1.00), so yours may land a little above or below.",
        steps: [
          "Boutique, the herd: S = 0.57, so Cm = 0.42, near the 0.40 floor. The offer is $130, about 42% of the baseline.",
          "Pop-up stall, after your first sale: S = 0.07, so Cm = 2.24. The offer is $686, about 2.2 times the baseline.",
          "Same lot, same fit of 1.00: the stall pays $556 more, 5.3 times the boutique's offer.",
        ],
        result: "Same sneakers, same fit: $130 in the herd and $686 in the open. A niche pays only while it stays quiet, so keep scouting for the next one.",
      },
    },
    teachBack: {
      q: "Two buyers fit your goods equally. About 6 in 10 recent pitches went to the first, about 1 in 10 to the second. Which pays more today, and why?",
      options: [
        { text: "The second. A quiet niche earns a high Cm, which fades as rivals copy you.", correct: true, why: "Yes. A crowded niche sits near the 0.40 floor of Cm and a rare one climbs toward 3.14. Proof draws rivals, so keep scouting." },
        { text: "The first. Where most rivals pitch, demand is proven and buyers pay a premium for it.", correct: false, why: "Proof is what draws the crowd. Each pitch there raises S and lowers Cm for everyone." },
        { text: "They pay the same, because equal fit means equal offers, whatever the crowd does.", correct: false, why: "Fit is one factor. Cm scales the offer too, and it depends on how many rivals pitched to that buyer." },
      ],
    },
    reward: { xp: 200, codex: ['creativity-multiplier'] },
  },

  // ------------------------------------------------------------------------------------------------------------------ 9
  {
    id: 'm09', title: 'Storm Warning', icon: '⛈️', zone: 5, concept: 'demand-shock', minutes: 2,
    intro: "Metro Hub, a calm afternoon. You hold two pallets of viral gadgets, all one trend, and a pallet of textbooks. A craze is coming for that exact trend, then it fades. The news ticker will warn you 12 hours before it lands.",
    setup: {
      clock: 'paused', cash: 0, assets: [{ cls: 'gadgets' }, { cls: 'gadgets' }, { cls: 'textbooks' }], leads: [], lots: [],
      zones: [1, 2, 3, 4, 5, 6], features: ['stock', 'market', 'codex', 'quests', 'crew', 'bank', 'travel'], skills: { ops: 2, growth: 2, fintech: 2 }, cohort: { ghosts: 0 },
      events: [{ kind: 'tiktok', atHour: 24 }],
    },
    steps: [
      { id: 'stock', say: "Open Stock. Two gadget pallets tagged trend, and a pallet of textbooks. If trend demand moves, only the gadgets care. Not everything you own rides one trend: that is diversification.", anchor: 'dock-stock', wait: { type: 'ui', ui: 'open-drawer', id: 'stock' }, hint: "Click the Stock icon in the dock." },
      { id: 'travel', say: "Open Travel to see the map. This craze hits every district, so shipping the pallets away would not save them. Only owning something else, or selling in time, will.", anchor: 'dock-travel', wait: { type: 'ui', ui: 'open-drawer', id: 'travel' }, hint: "Click the Travel icon in the dock." },
      { id: 'clock', say: "Press the clock. It runs at 16x: in about 5 seconds the ticker warns you, and in about 10 the craze lands and lasts about 20. Leave the speed alone and do not pause yet.", anchor: 'hud-clock', wait: { type: 'click', anchor: 'hud-clock' }, hint: "Tap the clock in the top bar to let time run." },
      { id: 'shock', say: "Watch the ticker: first the warning, then the headline that the craze is now in effect. When it is live, pause the clock and think about your gadgets. Demand spikes for 48 hours, then fatigue sets in.", anchor: 'ticker', wait: { type: 'event', event: 'shock', match: { kind: 'tiktok' } }, hint: "Wait for the second headline, then press the clock to pause and sell. If you paused too soon, press the clock again and keep watching." },
      { id: 'sell', say: "Pause the clock if it still runs, then reopen Stock and sell the gadgets into the spike: tick both pallets and sell them to the pool. The textbooks stay: they are what spreading left you.", anchor: 'dock-stock', wait: { type: 'ui', ui: 'open-drawer', id: 'stock' }, hint: "Open Stock, tick the two gadget pallets and press Sell to the pool." },
    ],
    win: { event: 'sell-pool' },
    why: {
      title: 'Do not keep every egg in one trend',
      body: [
        "A demand shock is a sudden swing in how many buyers want something. Here trend demand jumps to five times for 48 hours, then fatigue halves trend prices for 72. Whoever sold into the spike did well. Whoever held everything rode it up and all the way back down.",
        "Diversification spreads money across things that do not move together. Only the share you hold in the shocked tag is exposed: loss = share in the shock × size of the fall. Hedging goes a step further: hold something that keeps its value, or gains, when your main position falls.",
        "A warning is information. The ticker told you 12 hours ahead (earlier with Fintech, Capital Sourcing). Acting costs the pool's haircut of about 14%. Ignoring it costs the whole fall. Spreading trimmed the loss; selling in time avoided it.",
      ],
      formula: "Loss = share in the shocked tag × size of the fall. Spread over n independent tags and the worst case is the biggest single share.",
      example: {
        setup: "You hold two gadget pallets worth $730 each today and a textbook pallet worth $427, $1,886 in all. The craze lifts each gadget pallet to $1,870, then fatigue cuts it to $348: a 52% fall from today.",
        steps: [
          "Had all three pallets been gadgets: loss = 100% × 52% = 52% of what you own, $1,146 of $2,189.",
          "Your real mix: gadgets are 77% of $1,886, so loss = 77% × 52% = 40%, or $764. Spreading trimmed the loss, but gadgets still dominate.",
          "Sell the gadgets into the craze: the pool pays about $3,200 for the two at the peak, after its 14% haircut.",
          "Held through the fatigue, the same two pallets are worth about $700. Selling beat holding by about $2,500.",
        ],
        result: "Hold everything and lose half; spread and lose 40%; act on the warning and bank about $3,200. Diversify for the shocks you cannot see coming. When a warning arrives, sell what it points at.",
      },
    },
    teachBack: {
      q: "Your $1,000 of trend goods will triple for two days, then fall to half of today's price for three days before recovering. Selling into the spike costs a 14% haircut. Best move?",
      options: [
        { text: "Hold. The fall is temporary, so patience wins the price back and avoids the haircut.", correct: false, why: "Prices do recover after the 72 hours of fatigue, but you would wait about five days and end back near $1,000, while selling into the spike banks about $2,580 now. The haircut costs less than the spike you would miss." },
        { text: "Sell after the fall, once you are sure the craze has ended.", correct: false, why: "By then the goods are worth $500. Waiting for certainty means selling at the bottom instead of the top." },
        { text: "Sell into the spike: lock in the high price and accept the haircut.", correct: true, why: "Yes. About $2,580 after the 14% haircut beats the $500 they are worth after the fall, and the rest of your stock keeps working on its own." },
      ],
    },
    reward: { xp: 200, codex: ['demand-shock', 'diversification', 'hedging'] },
  },

  // ------------------------------------------------------------------------------------------------------------------ 10
  {
    id: 'm10', title: 'Deal Day', icon: '🎓', zone: 6, concept: 'eei-score', minutes: 2.5,
    intro: "Graduation day at the Estate Sales. Three broken antique lots from one estate go to auction. Read one, bid for it, fix it, pitch it and haggle it, using every skill you have learned. Quick is fine for any stage you have mastered.",
    setup: {
      clock: 'paused', cash: 1000, assets: [],
      leads: [{ id: 'antique-dealer', seg: 'antiqueDealer', budget: 1500 }],
      lots: [
        { id: 'estate-lot-a', cls: 'antiqueFurniture', cond: 'broken', price: 475, auction: true, mode: 'auction', truth: { quality: 0.9, fake: false } },
        { id: 'estate-lot-d', cls: 'antiqueFurniture', cond: 'broken', price: 475, auction: true, mode: 'auction', truth: { quality: 0.9, fake: false } },
        { id: 'estate-lot-h', cls: 'antiqueFurniture', cond: 'broken', price: 475, auction: true, mode: 'auction', truth: { quality: 0.9, fake: false } },
      ],
      zones: [6], features: ['stock', 'market', 'crew', 'bank', 'travel', 'codex', 'quests'], skills: { ops: 2, growth: 2, fintech: 2 }, cohort: { ghosts: 0 },
    },
    steps: [
      { id: 'read', say: "Deal Day. Tap an antique lot and READ it (serial, papers), then comes the AUCTION. Fixed and sold, a lot nets about $616: stop well short.", anchor: 'world:lot:estate-lot-a', wait: { type: 'event', event: 'inspect' }, hint: "Use Look it over, not Quick buy. Probe the serial number (a read with no probe does not count), press Done reading, then Continue. A ceiling near $450 is well short of $616 and still wins a lot." },
      { id: 'auction', say: "AUCTION: bid or drop out each round. A win above the lot's worth is the winner's curse. Outbid? Other lots remain.", anchor: 'deal-room', wait: { type: 'event', event: 'auction', match: { won: true } }, hint: "Press Bid while the next price is well under your ceiling and Drop out when it is not. If a rival outbids you, tap another lot and read it too." },
      { id: 'fix', say: "Yours, but broken. Open Stock and FIX it. Read the quote first: repair only if the gain beats the cost.", anchor: 'dock-stock', wait: { type: 'event', event: 'repair' }, hint: "Press Repair on the lot's card in Stock, then stop the marker in the green band, or press Careful." },
      { id: 'score', say: "Your stake is $1,000. Tap your net worth, divide it by $1,000: one factor of your EEI. The time bonus multiplies it.", anchor: 'hud-networth', wait: { type: 'click', anchor: 'hud-networth' }, hint: "Click the net worth figure in the top bar, then divide it by $1,000. With all 90 days still ahead the time bonus is about x2." },
      { id: 'close', say: "Now sell: tap the antique dealer's card, PITCH two angles, then CLOSE: anchor high, hold, concede small. Then you choose your two Backgrounds.", anchor: 'deal-room', wait: { type: 'event', event: 'haggle', match: { role: 'sell' } }, hint: "Tap the dealer's card in Market, choose two angles in the Pitch stage, then open high, hold, and split or accept at or above fair." },
    ],
    win: { event: 'pitch', match: { seg: 'antiqueDealer' } },
    why: {
      title: 'Your score is how well you used your days',
      body: [
        "You just used every skill. Read told you what the lot really was, your ceiling capped what you would pay, Repair added value for less than it cost, Pitch matched a buyer's bias and Close anchored the price. Each step protects the margin of the next.",
        "A run is scored by the Economic Efficiency Index: ending net worth divided by starting capital, times a time bonus of 1 plus days remaining over 90. A start worth pennies is floored at $1,000 so it is fair. Finishing early lifts the bonus, but only if net worth holds, and an early exit costs 12% brokerage.",
        "The winner's curse: in an auction the highest bidder is usually the one who most overestimated the prize. As it stands the lot is worth about $490, the figure Stock shows. You can pay more only because you can fix and resell it, and your sale price is an estimate too, so stop short of $616.",
      ],
      formula: "EEI = ending net worth / max(starting capital, $1,000) × (1 + days remaining / 90).",
      example: {
        setup: "This lot: repaired, the dealer pays $846 for it, $776 after tax and fees, and the repair costs $160. Then two founders each end with $20,000, Ana with 30 days left and Ben on day 90. Both started with a stake worth pennies, floored to $1,000.",
        steps: [
          "Your ceiling: $776 from the sale - $160 repair = $616. Stock shows the lot at about $490 as it stands, so the repair is your edge. Stay well short of $616.",
          "Ana: $20,000 / $1,000 = 20. Time bonus 1 + 30/90 = 1.33. EEI = 26.67.",
          "Ben: 20 × (1 + 0/90) = 20.00.",
          "For Ben to match Ana he would need to end with $26,667: speed counts like extra profit. Ana's $20,000 is after the 12% exit brokerage, so she needed about $22,727 first.",
        ],
        result: "Same money, different days: 26.67 against 20.00. Your lesson stake was $1,000, so the net worth you checked, divided by $1,000, was the first factor of your EEI; the time bonus multiplies it. It grows from deals like this one, repeated well and early.",
      },
    },
    teachBack: {
      q: "Mia ends the run on day 90 with $30,000. Raj ends on day 45 with $24,000. Both started at the $1,000 floor. Who has the higher EEI?",
      options: [
        { text: "Mia. She finished with more money, and the score is about how much money you end with.", correct: false, why: "The score also rewards the days you save. Mia: 30 × 1.00 = 30.0. Raj: 24 × 1.50 = 36.0." },
        { text: "Raj. Finishing early counts like extra profit, so the same money in fewer days scores higher.", correct: true, why: "Yes. EEI is ending net worth over the stake times (1 + days left / 90). Raj: 24 × 1.50 = 36 beats her 30." },
        { text: "Neither can be named, because the two runs are too different to compare fairly.", correct: false, why: "The formula compares them exactly. A different length is what the time bonus is for." },
      ],
    },
    reward: { xp: 400, codex: ['eei-score', 'winners-curse'], points: 1 },
  },
];
