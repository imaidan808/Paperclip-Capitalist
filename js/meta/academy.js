// The Academy: ten short missions played in the real UI against a scripted sandbox (docs/V2_DESIGN.md sections 9 and 12).
// Plain data, validated by tests/meta-academy.test.mjs. Every asset, buyer and district named here is real content (js/data/tier1..4.js) and every
// number in a `why.example` or a teach-back is what the real engine returns for the mission's own sandbox (quotePitch, repairQuote, forecast, draw,
// deRatio, poolQuote, eei and the Deal Room games of js/deal.js), read at an average Deal Room result: a multiplier of exactly 1.00. The test file builds
// each sandbox with the real builder (js/ui/academy-sandbox.js), recomputes every number and fails when the economy, the content or a lesson drifts,
// naming the number that moved. One example is deliberately not a sandbox deal: mission 4 walks a made-up buyer through the real Haggle game so that
// three plays can meet the same hidden limit, and says so on the card.
//
// Conventions the runner relies on:
//  - A mission's `win` is always a different event from its last step's `wait`, and always causally after it (a click on the control that
//    produces it, or a consequence of it), so a runner that watches `win` only once the last step is done cannot dead-lock.
//  - The Deal Room tells the engine what a player did only when the deal is over (js/deal.js `finish`: Pass, See the result or Quick), so an `inspect`,
//    `haggle`, `auction` or `buy` event arrives together with the others at the end of one deal, never when a stage is concluded. Steps and wins are
//    written against that order: inspect, then haggle, then auction, then buy or pitch.
//  - A step that a player can finish either with Quick or by playing the stages waits for `{ type: 'click', anchor: 'deal-room' }` (any click inside the
//    Deal Room) and keeps the control it recommends as its own `anchor`; a wait on `deal-quick` or on one `deal-stage-*` panel would be skipped by the
//    other route, and the sale that follows would arrive while the step is still pending.
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
// What a runner must still do that no data can (the test file holds a reference check, `stillPossible`): a lesson whose one scarce thing (the paperclip,
// the broken van, the last pin set) was spent on the wrong buyer cannot be finished and needs a restart; a clock tapped before its step spends the
// scripted shock early (hold the clock until the step that asks for it, or pause it when the shock lands).

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
      { id: 'stock', say: "Open Stock to meet your paperclip. Its card shows what it is worth today, so you can tell a bargain from a bluff later.", anchor: 'dock-stock', wait: { type: 'ui', ui: 'open-drawer', id: 'stock' }, hint: "Click the Stock icon in the dock at the bottom of the screen." },
      { id: 'market', say: "Now open Market. Buyers appear as cards: what each one wants and how much they can spend. Read all three before you choose, fit label included: how well your clip suits what that buyer wants.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock, next to Stock." },
      { id: 'student', say: "The mechanic has the biggest budget. But who needs a thin metal tool right now? Tap that buyer. A fat wallet is not the same as a fat offer.", anchor: 'world:lead:sim-student', wait: { type: 'click', anchor: 'world:lead:sim-student' }, hint: "Look for the card that says it needs a tool: Wen, the student with the thesis." },
      { id: 'quick', say: "This is the Deal Room, where you will later play pitch, haggle and more. For now press Quick: it pitches at average skill so you can see what need is worth.", anchor: 'deal-quick', wait: { type: 'click', anchor: 'deal-room' }, hint: "Press the Quick button inside the Deal Room. Wen pays partly in goods (barter), so look in Stock afterwards." },
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
      q: "On a dry morning a stranger offers $1 for your spare umbrella. In a downpour a commuter with a meeting in ten minutes offers $8. Why the gap?",
      options: [
        { text: "Commuters have bigger budgets than strangers.", correct: false, why: "A budget only says what someone can pay. The mechanic had the biggest budget in your mission and offered three cents." },
        { text: "The commuter is in a hurry and the umbrella solves their problem, so it is worth more to them.", correct: true, why: "Yes. Urgency swaps the stranger's low starting point for what the fix is worth to the buyer. Your cost never set the price." },
        { text: "Rain made it a better umbrella, so its fair value went up and a seller can charge whatever the weather allows.", correct: false, why: "The umbrella did not change. The match between it and a buyer did." },
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
      { id: 'first-watch', say: "The first watch looks perfect, and so does its price. Tap it and READ it before you pay: the serial number check costs one inspection point and is the best fake detector.", anchor: 'world:lot:first-watch', wait: { type: 'event', event: 'inspect', match: { fake: true } }, hint: "Probe the serial number, then press Done reading, Continue and Pass on this lot. Passing keeps your read and leaves the watch on the shelf." },
      { id: 'second-watch', say: "That first watch was a fake, worth about 8% of a real one, and its price never warned you. Now READ the second watch the same way, power-on for condition too, before you pay.", anchor: 'world:lot:second-watch', wait: { type: 'event', event: 'inspect', match: { fake: false } }, hint: "Probe the serial number and the power, then press Done reading, Continue and Pass on this lot to keep what you learned. Quick deal also works, but it buys the watch." },
      { id: 'buy', say: "Genuine and sound? Then buy it: tap the genuine watch and press Quick. The haggle plays at average skill, so the price may land a little over the list.", anchor: 'world:lot:second-watch', wait: { type: 'event', event: 'haggle', match: { role: 'buy' } }, hint: "Tap the second watch again and press Quick deal. The signed baseball is genuine too, if you would rather buy that." },
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
          "A perfect check would be worth $29.33 + $26.07 = $55.40 compared with buying blind: 0.22 × ($277 - $25.17), the chance of a fake times the money at risk.",
          "A real probe is noisy. Your serial check catches about four fakes in five and wrongly flags about 3% of genuine watches, so it is worth about $43 here, most of the perfect $55.",
          "The baseball: blind -$10.75, perfect check +$14.82, so a perfect check is worth $25.57. Same 22%, under half the money at risk.",
        ],
        result: "A perfect check turns a -$26.07 bet into a +$29.33 deal on the watch, and a real one still adds about $43. The price did not warn you. Looking did.",
      },
    },
    teachBack: {
      q: "A seller lists a signed jersey at $150. Genuine it is worth $170, a fake about $14, and one in five is fake. A look costs one point. Is it worth it?",
      options: [
        { text: "Yes. Blind, it loses about $11 on average, and a perfect look would be worth about $27: the chance of a fake times the money at risk.", correct: true, why: "Exactly. A check is worth buying when the chance of being wrong times the money at risk beats its cost, and one point is cheap." },
        { text: "No. The jersey lists below its genuine value, so the average buyer still comes out ahead.", correct: false, why: "The listing is below the genuine value, but one jersey in five is a $14 fake. Bought blind, the average buyer loses about $11." },
        { text: "If the price looks suspiciously low. This one looks normal, so the price is enough.", correct: false, why: "Here fakes carry normal prices too. A normal price tells you nothing, so only a look can warn you." },
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
      { id: 'market', say: "Open Market. The Academy lends you a Niche Radar: each buyer's card now shows a crowd meter, how many rivals pitched there lately.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock." },
      { id: 'flipper', say: "Bree, the thrift flipper, loves trend pins, and every rival is pitching to her too. Compare her crowd meter with the others, then tap her card to open the Deal Room.", anchor: 'world:lead:thrift-flipper', wait: { type: 'click', anchor: 'world:lead:thrift-flipper' }, hint: "Tap Bree's card, the one with the fullest crowd meter." },
      { id: 'pitch-crowd', say: "PITCH stage: read the hint about how she buys, then pick two of the five angles that she cares about and your pins can honestly back. Aim at what they care about, not at what you like.", anchor: 'deal-stage-pitch', wait: { type: 'event', event: 'pitch', match: { seg: 'bree' } }, hint: "Pick two angles that fit the hint and what the pins offer (scarcity is their strength), then finish the deal. Quick works if you are unsure, but it skips the practice." },
      { id: 'bookstore', say: "Sold. Remember the price. Now your second set: tap Delphine, the campus bookstore buyer, whose crowd meter is almost empty.", anchor: 'world:lead:bookstore-buyer', wait: { type: 'click', anchor: 'world:lead:bookstore-buyer' }, hint: "Tap Delphine's card." },
      { id: 'pitch-quiet', say: "PITCH again: different buyer, different hint. Read it and pick two angles for her. Then compare the final price with Bree's.", anchor: 'deal-stage-pitch', wait: { type: 'click', anchor: 'deal-room' }, hint: "Choose two angles in the Pitch stage and finish the deal. Quick skips the angles, so you will not practise them." },
    ],
    win: { event: 'pitch', match: { seg: 'bookstore' } },
    why: {
      title: 'Same pins, different buyers, different pitches',
      body: [
        "Persona fit is how well your pitch speaks to what a buyer values. Every buyer leans toward an angle: prestige, utility, scarcity, price or story. In the Pitch stage you pick two. A pair that suits the buyer and that your goods can honestly back keeps the buyer keen; a bad pair cools them.",
        "Keenness can run from x0.85 for the worst possible pair to x1.20 for the best, and a keen buyer is easier to haggle with. At an average close a keen buyer accepts the fair price, while a cold one wants about 9% off. Fit decides whether a deal exists at all: below 0.15 a buyer refuses.",
        "The crowd matters too. When many rivals pitch the same buyer, that buyer's price sinks, whatever your angles. Mission 8 shows how far. The obvious buyer is often the crowded one.",
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
      q: "Bree buys with feeling, and your pins are rare and carry a story. Which pair of angles should you lead with?",
      options: [
        { text: "Whichever two angles you like most about the pins. A good buyer will come round to what you love.", correct: false, why: "The pitch is about the buyer, not about you. Aim at what they care about and what your goods can honestly back." },
        { text: "Utility with price: practical, cheap appeals that suit most buyers.", correct: false, why: "Those are the angles for a buyer who weighs numbers. Bree buys with feeling and the pins back neither, so she cooled to x0.98 and wanted 9% off." },
        { text: "Scarcity with prestige: both suit how she buys, and the pins can honestly back them.", correct: true, why: "Yes. A pair works when the buyer cares about both angles and the goods back them up. That kept her keen and the price at fair." },
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
      { id: 'careless', say: "At Flea Market Row every deal can be haggled, so every first number matters. Deal 1, the careless way: tap the collector, press Quick for the Pitch, then in the Close open at fair and take their first answer.", anchor: 'world:lead:stall-collector', wait: { type: 'click', anchor: 'world:lead:stall-collector' }, hint: "Tap Mr. Abernathy's card." },
      { id: 'haggle-fair', say: "CLOSE stage: pick the fair anchor, then accept their first answer. Note the multiple of fair on the result: compare that ratio, not the dollars.", anchor: 'deal-stage-close', wait: { type: 'event', event: 'haggle', match: { role: 'sell' } }, hint: "Anchor at fair. If they counter, press Accept. If they say yes at once, the deal is already done." },
      { id: 'careful', say: "Now the second radio with better habits. Tap Dolores, the stager. She is friendlier than Mr. Abernathy, so your prices will not match the card. The busker is still waiting: your alternative.", anchor: 'world:lead:stall-dolores', wait: { type: 'click', anchor: 'world:lead:stall-dolores' }, hint: "Tap Dolores' card, the apartment stager." },
      { id: 'haggle-high', say: "CLOSE stage: anchor HIGH, hold, and concede in small steps. If they stall, press Mention your other option once. Walking away is real now. Aim for 10% over fair.", anchor: 'deal-stage-close', wait: { type: 'click', anchor: 'deal-room' }, hint: "Open high, hold, concede small, and accept only at 1.10 × fair or better. If the deal will not get there, Leave and tap Dolores again to retry." },
    ],
    win: { event: 'haggle', match: { role: 'sell', deal: true, mult: { gte: 1.1 } } },
    why: {
      title: 'The first number is worth money',
      body: [
        "Anchoring: the first number on the table pulls the whole negotiation toward it. Open at fair and the most you can get is fair, and a buyer may say yes at once while willing to pay more. Open high and a deal can land above fair. Their first answer is not their limit: hold your ground and it climbs.",
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
        { text: "Opening high makes the buyer believe the goods are worth more, so their limit rises.", correct: false, why: "Their limit was set before you spoke. An anchor moves where the talk centres, and one far past the limit can end it." },
        { text: "A first counter is a probe, not their limit. Holding lets it climb, and a believable high anchor lifts the middle.", correct: true, why: "Yes. The first counter was $7.47 and the limit was $12.84. Holding and a high anchor found the room between them." },
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
      { id: 'quests', say: "Open Quests. Missions, bounties and your skill points live here. A point on Ops makes every repair cheaper and better. You will earn your first point when this mission ends.", anchor: 'dock-quests', wait: { type: 'ui', ui: 'open-drawer', id: 'quests' }, hint: "Click the Quests icon in the dock." },
      { id: 'stock', say: "Open Stock. Your broken van is in the crate. Broken goods sell for a fraction of their working price.", anchor: 'dock-stock', wait: { type: 'ui', ui: 'open-drawer', id: 'stock' }, hint: "Click the Stock icon in the dock." },
      { id: 'van', say: "Tap the van and read its repair quote: cost, restored quality, new value. Is the gain bigger than the cost? Your Ops sets that price. Then press Repair.", anchor: 'world:asset:van', wait: { type: 'click', anchor: 'world:asset:van' }, hint: "Tap the van in Stock or in the yard to see its repair quote." },
      { id: 'repair', say: "FIX stage: stop the moving marker in the green band three times. A wider band comes from Ops. Or press Careful: pay more, no risk.", anchor: 'deal-room', wait: { type: 'event', event: 'repair' }, hint: "Press Stop when the marker is inside the green band, three times. Careful is also fine." },
      { id: 'market', say: "Fixed. Open Market and find a buyer who wants a van that runs.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock." },
      { id: 'fleet', say: "Delgado Delivery buys vans and pays far more for one that runs. Tap the fleet buyer and open the Deal Room.", anchor: 'world:lead:fleet-buyer', wait: { type: 'click', anchor: 'world:lead:fleet-buyer' }, hint: "Tap the fleet buyer's card." },
      { id: 'quick', say: "Press Quick to sell. Then compare the price with the $1,058 Delgado would have paid for the broken van.", anchor: 'deal-quick', wait: { type: 'click', anchor: 'deal-room' }, hint: "Press the Quick button inside the Deal Room." },
    ],
    win: { event: 'pitch', match: { cls: 'van', seg: 'smelog' } },
    why: {
      title: 'When is a repair worth it?',
      body: [
        "A repair is an investment: you spend cash now to raise an asset's value. Repair ROI is the gain after cost divided by the cost. Do it only when the ROI beats what the same cash would earn elsewhere. That alternative return is your opportunity cost.",
        "Three things set the price of a fix. Ops makes it cheaper (each level multiplies the cost by 0.42) and better (quality climbs from 0.50 at Ops 1 to 1.00 at Ops 5). Auto Row takes 25% off the bill and unlocking it 10% more: 0.75 × 0.90 = 0.675 of the van's $1,050 base. Your timing on the marker nudges quality by up to 15% and cost by -10% to +30%.",
        "So the same van can be a thin gain for one founder and a bargain for another. That is why a skill point on Ops is worth spending.",
      ],
      formula: "ROI = (value after - value before - cost) / cost. Cost = base × 0.42^(Ops - 1) × district discounts. Quality = 0.50 + 0.50 × min(1, (Ops - 1) / 4).",
      example: {
        setup: "A working van is worth $3,828. Broken, it is worth 30% of that: $1,148. Base repair $1,050, times 0.675 for Auto Row and its unlock bonus. Numbers assume an average Deal Room result and a perfectly average marker. Delgado Delivery takes broken vans too.",
        steps: [
          "Ops 1: cost $1,050 × 0.675 = $709. Quality 0.50, so the van is worth $1,914. Gain $766 minus $709 cost = $57 (ROI 8%). Hardly worth the risk.",
          "Ops 2: cost $1,050 × 0.42 × 0.675 = $298. Quality 0.625, value $2,393. Gain $1,244 minus $298 = $946 (ROI 318%).",
          "Ops 3: cost $125, quality 0.75, value $2,871: +$1,598 (ROI 1,278%).",
          "Even a poor marker at Ops 2 (quality -15%, cost +30%) nets +$498. A perfect one nets +$1,335.",
          "Delgado pays $1,058 for the broken van and $2,203 for the repaired one, more than double, for a $298 repair.",
        ],
        result: "One skill point on Ops turns a $57 scrape into a $946 profit on the same van. Always read the quote before you pay.",
      },
    },
    teachBack: {
      q: "You can afford one job. Job 1 costs $500 and lifts a van's value by $600. Job 2 costs $200 and lifts another's by $500. Which repair is the smarter buy?",
      options: [
        { text: "Job 1: it adds more value, and a bigger lift is a bigger win.", correct: false, why: "Value added is not profit. After its $500 bill Job 1 gains $100, and that cash would have funded Job 2 twice." },
        { text: "Either one: both lift the value, and a repair that adds value is a good repair.", correct: false, why: "A lift has to beat the bill. Both do here, but by very different margins, so the choice matters." },
        { text: "Job 2: it nets $300 on $200 spent, against $100 on $500.", correct: true, why: "Yes. Judge a repair by the gain after its cost, against the cash it ties up. Job 2 returns 150%, Job 1 only 20%." },
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
      { id: 'cash', say: "You hold $620 in cash. It is safe, and it earns $0 a day. Money that sits still is asleep. Tap your cash, then let's wake it up.", anchor: 'hud-cash', wait: { type: 'click', anchor: 'hud-cash' }, hint: "Tap the cash figure in the top bar." },
      { id: 'crew', say: "Open Crew. This is where managers live: people who buy and sell for you in a loop, on a fixed cycle.", anchor: 'dock-crew', wait: { type: 'ui', ui: 'open-drawer', id: 'crew' }, hint: "Click the Crew icon in the dock." },
      { id: 'plot', say: "Tap the empty plot to hire. Compare the cards: the hire fee, the money each manager needs per cycle, and how long a cycle takes.", anchor: 'world:plot:1', wait: { type: 'click', anchor: 'world:plot:1' }, hint: "Tap the empty plot marked 1 in the world." },
      { id: 'hire', say: "Careful: the hire fee AND the working capital both leave your wallet. Hire the Student on the laptop lane to Brightpath (a lane is the goods and buyer a manager runs; this one is quiet) and keep $450 free.", anchor: 'drawer', wait: { type: 'event', event: 'hire' }, hint: "Pick the Student, Off-Lease Laptop Pallet and Brightpath Corporate Training. The fee plus the allocation must fit in $620, or the manager just idles. A quiet lane has few rivals." },
      { id: 'clock', say: "Your cash goes out to work as soon as time runs. Press the clock: it runs at 16x, so the 41-hour cycle takes about 18 seconds. Watch your $450 go out and come home.", anchor: 'hud-clock', wait: { type: 'click', anchor: 'hud-clock' }, hint: "Tap the clock to let time run. If the manager never starts a cycle it is starved of cash: press Restart on this card and hire the Student." },
    ],
    win: { event: 'cycle' },
    why: {
      title: 'Cash is a tool, not a trophy',
      body: [
        "Working capital is the cash a business needs to run its loop: pay for goods, wait, get paid. A manager turns idle cash into that loop. Money in the wallet earns nothing. Money in the loop earns whatever its cycle nets after fees, every time the loop closes.",
        "Cash-flow velocity is how often a dollar completes the loop. Profit per day is the net of one cycle over its length in days, so a faster cycle or a bigger net both help. But every cycle pays a fee on the whole allocation, so a thin lane can lose money: read the forecast first.",
        "The trap: a manager needs working capital as well as a fee. Spend everything on the hire and nothing is left to work with, so the manager sits idle, starved. A starved manager earns nothing, and the fee is already spent: your wallet is $600 lighter, and releasing the manager brings back only 60%.",
      ],
      formula: "Hire fee + working capital <= cash on hand. Net per cycle = gross - fee - tax - royalty - overhead. Profit per day = net per cycle / days per cycle.",
      example: {
        setup: "You have $620. The Student costs $120 and works with up to $450. The Broker costs $600 and works with up to $1,000. Both take the quiet lane: laptop pallets to Brightpath. Your three skills, Ops, Growth and Fintech (Capital Sourcing), are at level 2. Forecasts are read at the moment you hire.",
        steps: [
          "Broker: $620 - $600 = $20 left to work with, against the $1,000 it wants. Starved: no cycle ever starts, and the $600 fee has left your wallet.",
          "Student: $620 - $120 = $500 left, so the full $450 goes to work. A cycle lasts 41 hours.",
          "Its forecast: gross $16.43, less $15.06 of costs (the platform fee alone is $10.96, then tax, the manager's royalty and overhead), leaves $1.37, or $0.80 a day. Real cycles, the first included, pay more or less as the crowd moves.",
          "A funded Broker on the same lane would net $8.28 in 32 hours, $6.21 a day. Idle cash earns $0 a day.",
        ],
        result: "Fed Student: $0.80 a day. Starved Broker: $0 and a wallet $600 lighter. Idle cash: $0 and nothing spent. At this rate even the Student needs about 150 days to earn back its $120 fee, so check a hire's payback first.",
      },
    },
    teachBack: {
      q: "You have $700. Manager A costs $300 and needs $500 to run a cycle. Manager B costs $150 and needs $450. Which hire actually starts a cycle?",
      options: [
        { text: "Manager B: after its $150 fee you hold $550, enough for the $450 it needs.", correct: true, why: "Yes. The fee and the working capital must both fit in the wallet, and B leaves $100 to spare." },
        { text: "Manager A, because the pricier manager earns more per cycle and more than pays for itself.", correct: false, why: "Only if it is fed. After A's $300 fee you hold $400, short of the $500 it needs, so it never starts a cycle." },
        { text: "Both: $700 covers each fee, so both will run.", correct: false, why: "The fee is only part of the bill. Working capital has to be in the wallet too, and A would be starved." },
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
      { id: 'clock', say: "Done buying? Press the clock. It runs at 16x: a sneaker glut lands in about 3 seconds and lasts about 30. More sellers than buyers, so prices will drop.", anchor: 'hud-clock', wait: { type: 'click', anchor: 'hud-clock' }, hint: "Tap the clock in the top bar to let time run, and leave the speed alone." },
      { id: 'shock', say: "There it is: sneaker prices just fell. Read the ticker, then pause the clock. Your stock is worth less, but your debt is the same size.", anchor: 'ticker', wait: { type: 'event', event: 'shock', match: { kind: 'glut' } }, hint: "Wait a moment for the glut headline in the ticker, then press the clock to pause." },
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
      q: "Priya owns $1,000 of goods and owes $1,000 for more (D/E 1.0). Tom owns $1,000 and owes $3,000 (D/E 3.0). Prices fall 20%. Whose bank steps in first?",
      options: [
        { text: "Priya's, since she holds fewer goods to cover her debt.", correct: false, why: "She holds $2,000 of goods against $1,000 of debt. Tom holds $4,000 against $3,000, a much thinner cushion." },
        { text: "Neither is close, because a 20% fall is far below 4.5.", correct: false, why: "4.5 is a ratio of debt to net worth, not a price fall. Tom's 20% fall already pushed his D/E to 15." },
        { text: "Tom's. About an 8% fall trips his call, against about 39% for Priya: more debt means less room.", correct: true, why: "Yes. His equity of $1,000 sits under $3,000 of debt, so a small fall in prices eats most of it. Priya's cushion is much deeper." },
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
      { id: 'boutique', say: "Loft 9 first, the obvious channel. Read its S and Cm on the card. Predict the offer, then tap the card to open the Deal Room.", anchor: 'world:lead:trend-boutique', wait: { type: 'click', anchor: 'world:lead:trend-boutique' }, hint: "Tap the boutique's card." },
      { id: 'quick-herd', say: "Press Quick and read the result: price, S and Cm. This is what the herd earns.", anchor: 'deal-quick', wait: { type: 'event', event: 'pitch', match: { seg: 'boutique' } }, hint: "Press the Quick button inside the Deal Room." },
      { id: 'popup', say: "Now the pop-up stall almost nobody is pitching. Compare its S and Cm with the first card, then tap it.", anchor: 'world:lead:popup-stall', wait: { type: 'click', anchor: 'world:lead:popup-stall' }, hint: "Tap the stall's card." },
      { id: 'quick-open', say: "Same sneakers, same fit. Press Quick and compare this price with the first sale.", anchor: 'deal-quick', wait: { type: 'click', anchor: 'deal-room' }, hint: "Press the Quick button inside the Deal Room." },
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
      { id: 'clock', say: "Press the clock. It runs at 16x: the craze lands in about 10 seconds and lasts about 20, so leave the speed alone and watch the ticker for the warning.", anchor: 'hud-clock', wait: { type: 'click', anchor: 'hud-clock' }, hint: "Tap the clock in the top bar to let time run." },
      { id: 'shock', say: "Breaking news: the craze has landed. Trend demand is spiking for 48 hours, then fatigue sets in. Pause the clock, read the ticker, then think about your gadgets.", anchor: 'ticker', wait: { type: 'event', event: 'shock', match: { kind: 'tiktok' } }, hint: "The headline appears the moment the craze lands. Press the clock to pause, then sell." },
      { id: 'sell', say: "Reopen Stock and sell the gadgets into the spike: tick both pallets and sell them to the pool while the price is high. The textbooks stay: they are what spreading left you.", anchor: 'dock-stock', wait: { type: 'ui', ui: 'open-drawer', id: 'stock' }, hint: "Open Stock, tick the two gadget pallets and press Sell to the pool." },
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
      q: "Your $1,000 of trend goods will triple for two days, then fall to half of today's price. Selling into the spike costs a 14% haircut. What is the best move?",
      options: [
        { text: "Hold. The fall is temporary, so patience wins the price back and avoids the haircut.", correct: false, why: "Fatigue lasts 72 hours, and capital stuck in a halved asset cannot work elsewhere meanwhile. Holding ends at $500, not at the peak." },
        { text: "Sell after the fall, once you are sure the craze has ended.", correct: false, why: "By then the goods are worth $500. Waiting for certainty means selling at the bottom instead of the top." },
        { text: "Sell into the spike. About $2,580 after the haircut beats the $500 they are worth after the fall.", correct: true, why: "Yes. You lock in the spike, pay a 14% haircut, and keep the rest of your stock working on its own." },
      ],
    },
    reward: { xp: 200, codex: ['demand-shock', 'diversification', 'hedging'] },
  },

  // ------------------------------------------------------------------------------------------------------------------ 10
  {
    id: 'm10', title: 'Deal Day', icon: '🎓', zone: 6, concept: 'eei-score', minutes: 2.5,
    intro: "Graduation day at the Estate Sales. Two broken antique lots from one estate go to auction. Read one, bid for it, fix it, pitch it and haggle it, using every skill you have learned. Quick is fine for any stage you have mastered.",
    setup: {
      clock: 'paused', cash: 1000, assets: [],
      leads: [{ id: 'antique-dealer', seg: 'antiqueDealer', budget: 1500 }],
      lots: [
        { id: 'estate-lot-a', cls: 'antiqueFurniture', cond: 'broken', price: 475, auction: true, mode: 'auction', truth: { quality: 0.9, fake: false } },
        { id: 'estate-lot-d', cls: 'antiqueFurniture', cond: 'broken', price: 475, auction: true, mode: 'auction', truth: { quality: 0.9, fake: false } },
      ],
      zones: [6], features: ['stock', 'market', 'crew', 'bank', 'travel', 'codex', 'quests'], skills: { ops: 2, growth: 2, fintech: 2 }, cohort: { ghosts: 0 },
    },
    steps: [
      { id: 'read', say: "Deal Day. Tap an antique lot and READ it first (the serial or maker's mark, the papers). Then comes the AUCTION. Fixed and sold, a lot nets about $616, so stop well short of that.", anchor: 'world:lot:estate-lot-a', wait: { type: 'event', event: 'inspect' }, hint: "Tap an antique lot, probe the serial number and the papers, press Done reading, then Continue. Bid while the price is well under $616 and press Drop out when it is not." },
      { id: 'auction', say: "AUCTION: bid or drop out each round. The top bidder is the likeliest to overpay, and a win above what the lot is worth is the winner's curse. If a rival outbids you, the twin lot is still on the shelf.", anchor: 'deal-room', wait: { type: 'event', event: 'auction', match: { won: true } }, hint: "Press Bid while the next price is well under your ceiling and Drop out when it is not. If a rival outbids you, tap the other lot." },
      { id: 'fix', say: "Yours, but broken. Tap it in Stock and FIX it. Read the quote first: repair only if the gain beats the cost.", anchor: 'world:asset:antiqueFurniture', wait: { type: 'event', event: 'repair' }, hint: "Tap the lot, then stop the marker in the green band, or press Careful." },
      { id: 'close', say: "Now sell: tap the antique dealer, PITCH two angles, then CLOSE: anchor high, hold, concede small. Finish the deal and you will choose your two Backgrounds, the starting edge you bring to the real run.", anchor: 'world:lead:antique-dealer', wait: { type: 'click', anchor: 'deal-room' }, hint: "Tap the dealer's card, choose two angles in the Pitch stage, then open high, hold, and split or accept at or above fair." },
    ],
    win: { event: 'pitch', match: { seg: 'antiqueDealer' } },
    why: {
      title: 'Your score is how well you used your days',
      body: [
        "You just used every skill. Read told you what the lot really was, your ceiling capped what you would pay, Repair added value for less than it cost, Pitch matched a buyer's bias and Close anchored the price. Each step protects the margin of the next.",
        "A run is scored by the Economic Efficiency Index: ending net worth divided by starting capital, times a time bonus of 1 plus days remaining over 90. A start worth pennies is floored at $1,000 so it is fair. Finishing early lifts the bonus, but only if net worth holds, and an early exit costs 12% brokerage.",
        "The winner's curse: in an auction the highest bidder is usually the one who most overestimated the prize. The room's own value for this lot as it stands is about $534. You can pay more only because you can fix and resell it, and your sale price is an estimate too, so stop short of $616.",
      ],
      formula: "EEI = ending net worth / max(starting capital, $1,000) × (1 + days remaining / 90).",
      example: {
        setup: "This lot: repaired, the dealer pays $846 for it, $776 after tax and fees, and the repair costs $160. Then two founders each end with $20,000, Ana with 30 days left and Ben on day 90. Both started with a stake worth pennies, floored to $1,000.",
        steps: [
          "Your ceiling: $776 from the sale - $160 repair = $616. The room values the lot at about $534 as it stands, so the repair is your edge. Stay well short of $616.",
          "Ana: $20,000 / $1,000 = 20. Time bonus 1 + 30/90 = 1.33. EEI = 26.67.",
          "Ben: 20 × (1 + 0/90) = 20.00.",
          "For Ben to match Ana he would need to end with $26,667: speed counts like extra profit. Ana's $20,000 is after the 12% exit brokerage, so she needed about $22,727 first.",
        ],
        result: "Same money, different days: 26.67 against 20.00. Your own EEI grows from deals like this one, repeated well and early.",
      },
    },
    teachBack: {
      q: "Mia ends the run on day 90 with $30,000. Raj ends on day 45 with $24,000. Both started at the $1,000 floor. Who has the higher EEI?",
      options: [
        { text: "Mia. She finished with more money, and the score is about how much money you end with.", correct: false, why: "The score also rewards the days you save. Mia: 30 × 1.00 = 30.0. Raj: 24 × 1.50 = 36.0." },
        { text: "Raj: 24 × 1.50 = 36 beats her 30. Finishing early counts like extra profit.", correct: true, why: "Yes. EEI is ending net worth over the stake times (1 + days left / 90). The same money in fewer days scores higher." },
        { text: "Neither can be named, because the two runs are too different to compare fairly.", correct: false, why: "The formula compares them exactly. A different length is what the time bonus is for." },
      ],
    },
    reward: { xp: 400, codex: ['eei-score', 'winners-curse'], points: 1 },
  },
];
