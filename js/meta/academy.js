// The Academy: ten short missions played in the real UI against a scripted sandbox (docs/V2_DESIGN.md sections 9 and 12).
// Plain data, validated by tests/meta-academy.test.mjs. Every asset, buyer and district named here is real content (js/data/tier1..4.js) and every
// number in a `why.example` or a teach-back is what the real engine returns for the mission's own sandbox (quotePitch, repairQuote, forecast, draw,
// deRatio, poolQuote, eei and the Deal Room games), read at par: a Deal Room multiplier of 1.00. The test file rebuilds each sandbox from `setup`,
// recomputes every number and fails when the economy, the content or a lesson drifts, naming the number that moved.
//
// Conventions the runner relies on:
//  - A mission's `win` is always a different event from its last step's `wait`, and always causally after it (a click on the control that
//    produces it, or a consequence of it), so a runner that watches `win` only once the last step is done cannot dead-lock.
//  - A 'paused' clock moves only when the player taps `hud-clock`; missions that need time (6, 7, 9) end a step with that tap. At 1x a virtual hour
//    is seven real seconds, so those steps tell the player to pick a fast speed.
//  - `lots[].auction` (and its twin `lots[].mode: 'auction'`, the engine's own field name) and `events[].cls` are optional extras the base schema
//    lacks: mission 10 needs a lot that is certainly an auction, mission 7 needs the glut to hit the sneakers it sells. A runner that ignores them
//    still plays, only less deterministically.
//  - The herd in missions 3, 6 and 8 is the cohort's ghosts at hour 0 with the seed 'academy-<mission id>'. The ghosts start in the first districts
//    and walk outward (js/cohort.js zoneShare), so a herd exists only where the ghosts already are at day 1: that is why mission 8 lives in Metro Hub.
//  - Districts that need their unlock bonus list at least two districts in `zones` (Game.B is cached by the number of open districts).

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
      { id: 'market', say: "Now open Market. Buyers appear as cards: what each one wants and how much they can spend. Read all three before you choose.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock, next to Stock." },
      { id: 'student', say: "The mechanic has the biggest budget. But who needs a thin metal tool right now? Tap that buyer. A fat wallet is not the same as a fat offer.", anchor: 'world:lead:sim-student', wait: { type: 'click', anchor: 'world:lead:sim-student' }, hint: "Look for the card that says it needs a tool: Wen, the student with the thesis." },
      { id: 'quick', say: "This is the Deal Room, where you will later play pitch, haggle and more. For now press Quick: it pitches at average skill so you can see what need is worth.", anchor: 'deal-quick', wait: { type: 'click', anchor: 'deal-quick' }, hint: "Press the Quick button inside the Deal Room." },
    ],
    win: { event: 'pitch', match: { outcome: 'win', price: { gte: 1 } } },
    why: {
      title: 'Why a five-cent clip sold for $2.62',
      body: [
        "Price follows need, not cost. Wen needed a thin tool right now, so for her the clip solved a real problem. When a buyer is urgent, their stated budget becomes the reference price. That gap between what something is worth and what a desperate buyer will pay is the urgency premium.",
        "A buyer with no urgent need judges the clip by its fair market value, about five cents. A big budget does not change that: the mechanic could spend $14.00 and still offers $0.03. A budget is a ceiling on what someone can pay, never the price they will pay.",
        "How well the item fits what the buyer wants (fit, 0 to 1) scales the offer, and below 0.15 the buyer simply refuses. The Asset Utility Score (scarcity × demand - depreciation) sets the fair value from the item's side: 2 × 7 - 1 = 13 for the clip.",
      ],
      formula: "Offer = reference × fit term × 0.60 × Cm. Urgent buyer: reference = their budget, fit term = 0.55 + 0.45 × fit. Otherwise: reference = fair value, fit term = 0.40 + 0.95 × fit.",
      example: {
        setup: "Paperclip: scarcity 2, demand 7, depreciation 1, so utility 13, price index 0.63 and fair value $0.05. Wen is urgent, needs a tool, budget $4.00, fit 1.0. Nobody else is pitching this niche, so Cm = 0.40 + ln 2 = 1.09. Prices are at par: Quick plays at average skill, so yours may land a little above or below.",
        steps: [
          "Wen: $4.00 × 1.00 × 0.60 × 1.09 = $2.62. She pays part in goods, a box of paperbacks worth $1.04, and $1.52 in cash after the 2.5% fee.",
          "Barista: $0.05 × 1.16 × 0.60 × 1.09 = $0.04 (fit 0.80, fit term = 0.40 + 0.95 × 0.80).",
          "Mechanic: $0.05 × 0.97 × 0.60 × 1.09 = $0.03 (fit 0.60), despite the $14.00 budget.",
        ],
        result: "One paperclip, three offers: $2.62, $0.04 and $0.03. Wen's need was worth about 70 times the barista's offer, and it paid you your first $1.52 in cash.",
      },
    },
    teachBack: {
      q: "The mechanic had the biggest budget, yet Wen paid far more. What explains it?",
      options: [
        { text: "A bigger budget always means a bigger offer, so the mechanic must have been holding back or bluffing.", correct: false, why: "A budget is only a ceiling. The mechanic could afford more, but a paperclip has little use for him, so his offer is a few cents." },
        { text: "Wen urgently needed what you held. Need sets the price, not cost or budget.", correct: true, why: "Yes. Urgency turned her budget into the reference price, and a perfect fit kept the offer high." },
        { text: "The clip cost you nothing, so any price is pure profit and depends on luck.", correct: false, why: "Your cost never sets the price. The same clip fetched $2.62 or $0.03 depending only on who asked and how badly they needed it." },
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
        { id: 'first-watch', cls: 'pawnWatch', cond: 'ok', price: 297, truth: { quality: 0.9, fake: true } },
        { id: 'second-watch', cls: 'pawnWatch', cond: 'ok', price: 297, truth: { quality: 1, fake: false } },
        { id: 'signed-ball', cls: 'signedBall', cond: 'ok', price: 139, truth: { quality: 0.9, fake: false } },
      ],
      zones: [4], features: ['stock', 'market', 'codex'], skills: { ops: 2, growth: 1, fintech: 1 }, cohort: { ghosts: 0 },
    },
    steps: [
      { id: 'codex', say: "Your first swap unlocked Codex pages. Open the Codex and skim Urgency Premium. Every mission ends with a page like it, written for the next time you need it.", anchor: 'dock-codex', wait: { type: 'ui', ui: 'open-drawer', id: 'codex' }, hint: "Click the Codex icon in the dock." },
      { id: 'market', say: "Open Market. Three lots, all priced near their value, and none says which one is honest. The seller knows. You do not. That gap is called information asymmetry.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock." },
      { id: 'first-watch', say: "The first watch looks perfect, and so does its price. Do not pay yet. Tap it and READ it: the serial number check costs one point and is the best fake detector. Then conclude.", anchor: 'world:lot:first-watch', wait: { type: 'event', event: 'inspect', match: { fake: true } }, hint: "Tap the first watch, choose the serial number probe, then press Conclude." },
      { id: 'second-watch', say: "Next lot. Close that one, tap the second watch and READ it too: serial number for fakes, power-on for condition. Never pay before you know what you are buying.", anchor: 'world:lot:second-watch', wait: { type: 'event', event: 'inspect', match: { fake: false } }, hint: "Close the Deal Room, tap the second watch, probe the serial number and the power, then press Conclude." },
      { id: 'buy', say: "Genuine and sound. Press Quick to buy it at the listed price.", anchor: 'deal-quick', wait: { type: 'click', anchor: 'deal-quick' }, hint: "Press the Quick button inside the Deal Room." },
    ],
    win: { event: 'buy', match: { fake: false } },
    why: {
      title: 'Why a one-point check beat the price tag',
      body: [
        "Information asymmetry means one side of a deal knows more than the other. The pawnbroker knows which watch is a replica. You do not, and the price tells you nothing: here a fake is listed at full price. About one lot in five in this district is counterfeit (22% for a watch), and a fake is worth about 8% of the real thing.",
        "Behind that sits adverse selection: whoever sells a bad lot is always happy to sell it, so a blind buy is a bet at the average, and the average includes fakes. Due diligence closes the gap. A check is worth buying whenever the chance of being wrong times the money at risk beats the check's cost.",
        "Read is a skill. Ops sets how many probe points you get and how sharp the answers are, so a higher Ops lets you check more lots before you pay. The serial number is the best probe for a fake; power-on is the best for condition.",
      ],
      formula: "Value of a check = P(fake) × (price - fake value). Blind buy = (1 - P) × value + P × fake value - price. Checked buy = (1 - P) × (value - price).",
      example: {
        setup: "A watch is worth $314.60 if genuine and $25.17 if fake. It lists at $297, like the one beside it. In this district 22% of watches are fakes. The signed baseball is worth $147.00 genuine and $11.76 fake, lists at $139, and has the same 22%.",
        steps: [
          "Blind buy at $297: 0.78 × $314.60 + 0.22 × $25.17 - $297 = -$46.07 expected. A loss, even though the genuine watch really is worth more than you pay.",
          "Check first and buy only if genuine: 0.78 × ($314.60 - $297) = +$13.73 expected.",
          "The check is worth $13.73 + $46.07 = $59.80, which is 0.22 × ($297 - $25.17): the chance of a fake times the money at risk.",
          "The baseball: blind -$21.75, checked +$6.24, so the check is worth $27.99. Same 22%, under half the money at risk, under half the value of a look.",
        ],
        result: "One probe point turns a -$46.07 bet into a +$13.73 deal on the watch, and adds $27.99 on the baseball. The price did not warn you. Looking did.",
      },
    },
    teachBack: {
      q: "The first watch was a fake, and it was priced exactly like the genuine one. What protected you?",
      options: [
        { text: "Nothing. Fakes look identical to real ones, so the only protection is luck and a little experience.", correct: false, why: "A tell existed: the serial number check. Inspection exists to turn luck into information." },
        { text: "Haggling hard. A big enough discount means a fake costs you little, so price is the real protection.", correct: false, why: "A fake is worth about 8% of a real watch, so even a 30% discount leaves you far above that. Haggling does not protect you. A check does." },
        { text: "A cheap check before paying. One probe point costs far less than the chance of a fake times the price at risk.", correct: true, why: "Exactly. Here the check was worth about $60 on the watch for one point. Let evidence, not hope or price, decide." },
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
      lots: [], zones: [3], features: ['stock', 'market', 'codex'], skills: { ops: 2, growth: 1, fintech: 1 }, perks: ['grad'], cohort: { ghosts: 120 },
    },
    steps: [
      { id: 'market', say: "Open Market. The Academy lends you a Niche Radar: each buyer's card now shows a crowd meter, how many rivals pitched there lately.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock." },
      { id: 'flipper', say: "Bree, the thrift flipper, loves trend pins, and so does every rival. Tap her card to open the Deal Room and see her crowd meter.", anchor: 'world:lead:thrift-flipper', wait: { type: 'click', anchor: 'world:lead:thrift-flipper' }, hint: "Tap Bree's card, the one with the fullest crowd meter." },
      { id: 'pitch-crowd', say: "PITCH stage: read the hints about what she values, then pick two of the five angles that speak to her. Aim at what they care about, not at what you like.", anchor: 'deal-stage-pitch', wait: { type: 'event', event: 'pitch', match: { seg: 'bree' } }, hint: "Pick two angles that match the hints, then finish the deal. Quick works if you are unsure." },
      { id: 'bookstore', say: "Sold. Remember the price. Now your second set: tap Delphine, the campus bookstore buyer, whose crowd meter is almost empty.", anchor: 'world:lead:bookstore-buyer', wait: { type: 'click', anchor: 'world:lead:bookstore-buyer' }, hint: "Tap Delphine's card." },
      { id: 'pitch-quiet', say: "PITCH again: different buyer, different hints. Read them and pick two angles for her. Then compare the final price with Bree's.", anchor: 'deal-stage-pitch', wait: { type: 'click', anchor: 'deal-stage-pitch' }, hint: "Choose two angles in the Pitch stage and finish the deal." },
    ],
    win: { event: 'pitch', match: { seg: 'bookstore' } },
    why: {
      title: 'Same pins, different buyers, different prices',
      body: [
        "Persona fit is how well your pitch speaks to what a buyer values. Every buyer leans toward an angle: prestige, utility, scarcity, price or story. Aim two angles at the buyer and the Deal Room multiplies your price by up to 1.20; fumble them and it can fall to 0.85.",
        "Fit decides whether a deal exists at all: below 0.15 a buyer refuses. Above it, the offer scales with a fit term of 0.40 + 0.95 × fit. Bree fits the pins at 1.00 and Delphine only at 0.50, so on fit alone Bree should pay 1.5 times more.",
        "Market saturation is the other half. When most recent pitches for your item went to one buyer, that niche is crowded, and the Creativity Multiplier Cm falls as saturation S = V_niche / V_total rises. The obvious buyer is rarely the best buyer.",
      ],
      formula: "Fit term = 0.40 + 0.95 × fit. S = V_niche / V_total. Cm = [0.40 + ln((V_total + 2) / (V_niche + 1))] × (1 - S), kept between 0.40 and 3.14.",
      example: {
        setup: "A pin set is worth $5.30 here. Most recent pin pitches went to Bree (S = 0.65), about a third to Priya (S = 0.34) and almost none to Delphine (S = 0.01). Prices are at par, before the Deal Room's pitch multiplier.",
        steps: [
          "Fit terms: Bree (fit 1.00) 0.40 + 0.95 × 1.00 = 1.35. Delphine (fit 0.50) 0.40 + 0.95 × 0.50 = 0.875.",
          "Bree: S = 0.65, so Cm is on the 0.40 floor: $5.30 × 1.35 × 0.60 × 0.40 = $1.72.",
          "Delphine: S = 0.01, so Cm is at the 3.14 ceiling: $5.30 × 0.875 × 0.60 × 3.14 = $8.74.",
        ],
        result: "The weaker fit paid 5.1 times more: $8.74 against $1.72. A perfect pitch adds at most 20%. Leaving the herd added 409%. Fit gets you a deal; distance from the crowd sets the price.",
      },
    },
    teachBack: {
      q: "Bree fit the pins far better, yet Delphine paid about five times more. What explains it?",
      options: [
        { text: "Few rivals were pitching to Delphine, so the Creativity Multiplier was far higher.", correct: true, why: "Yes. A quiet niche scores a high Cm and a crowded one hits the 0.40 floor. That outweighed Bree's better fit." },
        { text: "Delphine had the bigger budget, and a bigger budget always means a bigger offer.", correct: false, why: "A budget only caps an offer, it does not set it. Both budgets were far above either offer. What differed was the crowd." },
        { text: "Your angles were better the second time, so Delphine simply liked you more than Bree.", correct: false, why: "A well-aimed pair moves the price by at most 20%. A five-fold gap needs a bigger cause, and that cause is saturation." },
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
      lots: [], zones: [2], features: ['stock', 'market', 'codex'], skills: { ops: 1, growth: 2, fintech: 1 }, cohort: { ghosts: 0 },
    },
    steps: [
      { id: 'careless', say: "At Flea Market Row every deal can be haggled, so every first number matters. Deal 1, the careless way: tap the collector. In the Close stage open at fair and take their first answer.", anchor: 'world:lead:stall-collector', wait: { type: 'click', anchor: 'world:lead:stall-collector' }, hint: "Tap Mr. Abernathy's card." },
      { id: 'haggle-fair', say: "CLOSE stage: pick the fair anchor, then accept their first answer. Compare the final price with the radio's fair price.", anchor: 'deal-stage-close', wait: { type: 'event', event: 'haggle', match: { role: 'sell' } }, hint: "Anchor at fair. If they counter, press Accept. If they say yes at once, the deal is already done." },
      { id: 'careful', say: "Now the second radio with better habits. Tap Dolores, the stager. The busker is still waiting, and that is your alternative.", anchor: 'world:lead:stall-dolores', wait: { type: 'click', anchor: 'world:lead:stall-dolores' }, hint: "Tap Dolores' card, the apartment stager." },
      { id: 'haggle-high', say: "CLOSE stage: anchor HIGH, hold, and concede in small steps. If they stall, use your alternative once with Leverage. Walking away is real now.", anchor: 'deal-stage-close', wait: { type: 'click', anchor: 'deal-stage-close' }, hint: "Open high, hold your ground, use Leverage once, then split or accept at or above fair." },
    ],
    win: { event: 'haggle', match: { role: 'sell', deal: true, mult: { gte: 1 } } },
    why: {
      title: 'The first number is worth money',
      body: [
        "Anchoring: the first number on the table pulls the whole negotiation toward it. Everything after is a concession measured from that anchor. Open at fair and the most you can get is fair, and a buyer may say yes at once while willing to pay more. Open high and a deal can land above fair.",
        "Every deal has a ZOPA, the range of prices both sides could accept, from the lowest you would take to the highest the buyer would pay. A deal exists only where the two overlap. You cannot see their limit, but Growth gives you a fuzzy read of it. Hard bargainers punish an opening far past it, so anchor high but believable.",
        "Your BATNA is your best alternative to a deal. The busker made your walk-away price real: a threat to leave works only when you could actually leave. Mention a real alternative once with Leverage and a buyer may lift what they will accept.",
      ],
      formula: "ZOPA = [your floor, their limit]. Your real floor = your BATNA. Opening high is 1.40 × fair; a concession moves 4%, 9% or 16% of fair.",
      example: {
        setup: "Say a radio's fair price is $10.61 and a hard buyer will pay at most $12.84 (you cannot see that). A busker would pay you $8.74 for it. Both deals below are the same buyer with the same hidden limit.",
        steps: [
          "Open at fair ($10.61). They counter $7.47. Take it: you sell at $7.47, which is 0.70 × fair.",
          "Open high ($14.85, 1.40 × fair). They counter $7.61. You hold, then concede: $13.15, $12.20, $11.78. They agree at $11.78, which is 1.11 × fair.",
          "Same buyer, same limit: the opening number alone moved the price from $7.47 to $11.78, which is 41% of fair.",
          "The busker's $8.74 is your BATNA. Any offer below it is worse than walking away, so $7.47 should never have been taken.",
        ],
        result: "The careless deal ended at $7.47 and the careful one at $11.78. Neither buyer changed. Only the opening number did, and the $8.74 alternative told you which offers to refuse.",
      },
    },
    teachBack: {
      q: "What made the second deal end higher than the first?",
      options: [
        { text: "High anchors always win, so the smartest opening is simply the highest number you can possibly imagine, every time.", correct: false, why: "A wild anchor can backfire. Hard buyers dig in when you open far past their limit, and may walk. Anchor high but believable." },
        { text: "Haggling is mostly luck, so the second deal just got a better roll of the dice.", correct: false, why: "The buyers follow rules you can learn: the first number pulls the talk and a real alternative lifts what they accept. Skill, not dice, made the gap." },
        { text: "A believable high anchor shifted the range up, and a real alternative made walking away credible.", correct: true, why: "Yes. The anchor moves where the middle is, and your BATNA sets the floor you will not go below." },
      ],
    },
    reward: { xp: 150, codex: ['negotiation', 'anchoring', 'batna-zopa'] },
  },

  // ------------------------------------------------------------------------------------------------------------------ 5
  {
    id: 'm05', title: 'Fix It', icon: '🔧', zone: 7, concept: 'repair-roi', minutes: 2,
    intro: "Auto Row, the repair bays ring with hammers. An ex-fleet cargo van with a dead transmission sits in your yard, worth about 30% of a working one. Delgado Delivery wants vans, running or not. Is the fix worth what it costs?",
    setup: {
      clock: 'paused', cash: 600, assets: [{ cls: 'van', cond: 'broken', quality: 1 }],
      leads: [{ id: 'fleet-buyer', seg: 'smelog', budget: 5200 }],
      lots: [], zones: [6, 7], features: ['stock', 'market', 'codex', 'quests'], skills: { ops: 2, growth: 1, fintech: 1 }, cohort: { ghosts: 0 },
    },
    steps: [
      { id: 'quests', say: "Open Quests. Missions, bounties and your skill points live here. A point on Ops makes every repair cheaper and better. You will see how much in a minute.", anchor: 'dock-quests', wait: { type: 'ui', ui: 'open-drawer', id: 'quests' }, hint: "Click the Quests icon in the dock." },
      { id: 'stock', say: "Open Stock. Your broken van is in the crate. Broken goods sell for a fraction of their working price.", anchor: 'dock-stock', wait: { type: 'ui', ui: 'open-drawer', id: 'stock' }, hint: "Click the Stock icon in the dock." },
      { id: 'van', say: "Tap the van and read its repair quote: cost, restored quality, new value. Is the gain bigger than the cost? Your Ops sets that price. Then press Repair.", anchor: 'world:asset:van', wait: { type: 'click', anchor: 'world:asset:van' }, hint: "Tap the van in Stock or in the yard to see its repair quote." },
      { id: 'repair', say: "FIX stage: stop the moving marker in the green band three times. A wider band comes from Ops. Or press Careful: pay more, no risk.", anchor: 'deal-room', wait: { type: 'event', event: 'repair' }, hint: "Press Stop when the marker is inside the green band, three times. Careful is also fine." },
      { id: 'market', say: "Fixed. Open Market and find a buyer who wants a van that runs.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock." },
      { id: 'fleet', say: "Delgado Delivery buys vans, even broken ones, but pays far more for a working one. Tap the fleet buyer and open the Deal Room.", anchor: 'world:lead:fleet-buyer', wait: { type: 'click', anchor: 'world:lead:fleet-buyer' }, hint: "Tap the fleet buyer's card." },
      { id: 'quick', say: "Press Quick to sell. Then compare the price with what the broken van would have fetched.", anchor: 'deal-quick', wait: { type: 'click', anchor: 'deal-quick' }, hint: "Press the Quick button inside the Deal Room." },
    ],
    win: { event: 'pitch', match: { cls: 'van', seg: 'smelog' } },
    why: {
      title: 'When is a repair worth it?',
      body: [
        "A repair is an investment: you spend cash now to raise an asset's value. Repair ROI is the gain after cost divided by the cost. Do it only when the ROI beats what the same cash would earn elsewhere. That alternative return is your opportunity cost.",
        "Two things set the price of a fix. Ops makes it cheaper (each level multiplies the cost by 0.42) and better (quality climbs from 0.50 at Ops 1 to 1.00 at Ops 5). Auto Row takes 25% off the bill and opening it takes 10% more, so the van's $1,050 base becomes 0.675 of that. Your dial skill nudges quality by up to 15% and cost by -10% to +30%.",
        "So the same van can be a thin gain for one founder and a bargain for another. That is why a skill point on Ops is worth spending.",
      ],
      formula: "ROI = (value after - value before - cost) / cost. Cost = base × 0.42^(Ops - 1) × district discounts. Quality = 0.50 + 0.50 × min(1, (Ops - 1) / 4).",
      example: {
        setup: "A working van is worth $3,828. Broken, it is worth 30% of that: $1,148. Base repair $1,050, times 0.675 for Auto Row and its unlock bonus. Prices are at par, with a dial of 1.00. Delgado Delivery takes broken vans too.",
        steps: [
          "Ops 1: cost $1,050 × 0.675 = $709. Quality 0.50, so the van is worth $1,914. Gain $766 minus $709 cost = $57 (ROI 8%). Hardly worth the risk.",
          "Ops 2: cost $1,050 × 0.42 × 0.675 = $298. Quality 0.625, value $2,393. Gain $1,244 minus $298 = $946 (ROI 318%).",
          "Ops 3: cost $125, quality 0.75, value $2,871: +$1,598 (ROI 1,278%).",
          "Even a poor dial at Ops 2 (quality -15%, cost +30%) nets +$498. A perfect one nets +$1,335.",
          "Delgado pays $1,017 for the broken van and $2,118 for the repaired one, more than double, for a $298 repair.",
        ],
        result: "One skill point on Ops turns a $57 scrape into a $946 profit on the same van. Always read the quote before you pay.",
      },
    },
    teachBack: {
      q: "At Ops 1 the repair would cost $709 to add $766 of value, a $57 gain. What is the smart reading of that?",
      options: [
        { text: "Compare the gain with the cost first. If it barely pays, raise Ops or find a cheaper bay.", correct: true, why: "Yes. A repair is only good when it pays for itself. Ops and a cheaper bay both move the numbers." },
        { text: "Always repair: a working asset is worth more than a broken one, so the fix is worth it whatever it costs.", correct: false, why: "Value after is not profit. At Ops 1 you would risk $709 to gain $57." },
        { text: "Never repair: repairs are a hidden cost that only drains your cash and never pays for itself.", correct: false, why: "At Ops 2 the same repair returns 318%. Repair is excellent when the ROI is high, and the quote tells you which." },
      ],
    },
    reward: { xp: 160, codex: ['repair-roi', 'margin'], points: 1 },
  },

  // ------------------------------------------------------------------------------------------------------------------ 6
  {
    id: 'm06', title: 'Cash Is Not Sleeping', icon: '💰', zone: 5, concept: 'working-capital', minutes: 2,
    intro: "Metro Hub, where managers work the market while you sleep. You hold $620 in cash. It is safe, and it earns exactly nothing. A plot of land is open for your first manager. Can you hire one and still keep him fed?",
    setup: {
      clock: 'paused', cash: 620, assets: [], leads: [], lots: [], zones: [5],
      features: ['stock', 'market', 'codex', 'quests', 'crew'], skills: { ops: 2, growth: 2, fintech: 2 }, cohort: { ghosts: 200 },
    },
    steps: [
      { id: 'cash', say: "You hold $620 in cash. It is safe, and it earns $0 a day. Money that sits still is asleep. Tap your cash, then let's wake it up.", anchor: 'hud-cash', wait: { type: 'click', anchor: 'hud-cash' }, hint: "Tap the cash figure in the top bar." },
      { id: 'crew', say: "Open Crew. This is where managers live: people who buy and sell for you in a loop, on a fixed cycle.", anchor: 'dock-crew', wait: { type: 'ui', ui: 'open-drawer', id: 'crew' }, hint: "Click the Crew icon in the dock." },
      { id: 'plot', say: "Tap the empty plot to hire. Compare the cards: the hire fee, the money each manager needs per cycle, and how long a cycle takes.", anchor: 'world:plot:1', wait: { type: 'click', anchor: 'world:plot:1' }, hint: "Tap the empty plot marked 1 in the world." },
      { id: 'hire', say: "Careful: the hire fee AND the manager's working capital both leave your wallet. Hire the Student for the laptop lane to Brightpath, the quiet one, and keep $450 free to feed him.", anchor: 'drawer', wait: { type: 'event', event: 'hire' }, hint: "Pick the Student, Off-Lease Laptop Pallet and Brightpath Corporate Training. The fee plus his allocation must fit in $620, or he just idles." },
      { id: 'clock', say: "Your cash is out in the market now. Press the clock, pick a fast speed, and watch it come home.", anchor: 'hud-clock', wait: { type: 'click', anchor: 'hud-clock' }, hint: "Tap the clock to let time run; 16x or 64x is quicker. If the manager never starts a cycle he is starved: open Crew and lower his allocation." },
    ],
    win: { event: 'cycle' },
    why: {
      title: 'Cash is a tool, not a trophy',
      body: [
        "Working capital is the cash a business needs to run its loop: pay for goods, wait, get paid. A manager turns idle cash into that loop. Money in the wallet earns nothing. Money in the loop earns whatever its cycle nets after fees, every time the loop closes.",
        "Cash-flow velocity is how often a dollar completes the loop. Return per day is the net of one cycle over its length in days, so a faster cycle or a bigger net both help. But every cycle pays a fee on the whole allocation, so a thin lane can lose money: read the forecast first.",
        "The trap: a manager needs working capital as well as a fee. Spend everything on the hire and nothing is left to work with, so the manager sits idle, starved. A starved manager earns exactly what idle cash earns: nothing.",
      ],
      formula: "Hire fee + working capital <= cash on hand. Net per cycle = gross - fee - tax - royalty - overhead. Return per day = net per cycle / days per cycle.",
      example: {
        setup: "You have $620. The Student costs $120 and works with up to $450. The Broker costs $600 and works with up to $1,000. Both take the quiet lane: laptop pallets to Brightpath. Your Ops, Growth and Fintech are at level 2.",
        steps: [
          "Broker: $620 - $600 = $20 left to work with, against the $1,000 he wants. Starved: no cycle ever starts.",
          "Student: $620 - $120 = $500 left, so the full $450 goes to work. A cycle lasts 41 hours.",
          "His cycle: gross $16.43, less $15.06 of fee, tax, royalty and overhead (the fee alone is $10.96), leaves $1.37, or $0.80 a day.",
          "A funded Broker on the same lane would net $8.28 in 32 hours, $6.21 a day. Idle cash earns $0 a day.",
        ],
        result: "Fed Student: $0.80 a day. Starved Broker: $0. Idle cash: $0. Fees take most of a thin margin, so size and lane decide whether a cycle pays, and your wallet decides whether it runs.",
      },
    },
    teachBack: {
      q: "You hired the cheaper manager and kept cash in the wallet to feed him. Why was that wiser than hiring the Broker?",
      options: [
        { text: "Cheaper managers always earn more per cycle than expensive ones, so the cheap one was simply the better hire.", correct: false, why: "Not so. A stronger manager earns more per cycle: the Broker's forecast was $8.28 against $1.37. The problem is that a manager without working capital earns nothing at all." },
        { text: "A manager only earns with working capital, so the fee and the cash to run him must both fit.", correct: true, why: "Yes. Working capital is the fuel. Without it the best manager in the market is a very expensive statue." },
        { text: "Cash in the wallet is the main way to grow, so you should hire as little as possible.", correct: false, why: "Idle cash earns $0. The aim is to put most of your money to work while keeping enough free for each cycle." },
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
      zones: [5], features: ['stock', 'market', 'codex', 'quests', 'crew', 'bank'], skills: { ops: 1, growth: 1, fintech: 1 }, cohort: { ghosts: 0 },
      events: [{ kind: 'glut', atHour: 6, cls: 'sneakers' }],
    },
    steps: [
      { id: 'bank', say: "Open the Bank. Your own $400 is your equity. The bank lends up to a debt-to-equity ratio (D/E) of 3.0 and calls the loan at 4.5.", anchor: 'dock-bank', wait: { type: 'ui', ui: 'open-drawer', id: 'bank' }, hint: "Click the Bank icon in the dock." },
      { id: 'draw', say: "Each sneaker lot costs $250 and is worth $369. How much will you borrow? The gauge previews your D/E. The maximum is allowed, but is it wise? Draw a loan.", anchor: 'drawer', wait: { type: 'event', event: 'draw' }, hint: "Pick an amount in the Bank drawer and press Draw. Think about what a bad day would do to the gauge." },
      { id: 'market', say: "Money in hand. Open Market and buy the lots your loan paid for.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock." },
      { id: 'buy', say: "Tap a sneaker lot and press Quick to buy it. Each lot is worth more than you pay, so net worth rises the moment you own it. Buy as many as your loan truly justifies.", anchor: 'world:lot:bargain-a', wait: { type: 'event', event: 'buy' }, hint: "Tap a lot, then press Quick inside the Deal Room. Repeat for as many lots as you want." },
      { id: 'clock', say: "Done buying? Press the clock and pick a fast speed. A sneaker glut is on its way: more sellers than buyers, so prices will drop.", anchor: 'hud-clock', wait: { type: 'click', anchor: 'hud-clock' }, hint: "Tap the clock in the top bar to let time run; 16x or 64x is quicker." },
      { id: 'shock', say: "There it is: sneaker prices just fell. Read the ticker, then pause the clock. Your stock is worth less, but your debt is the same size.", anchor: 'ticker', wait: { type: 'event', event: 'shock', match: { kind: 'glut' } }, hint: "Wait a moment for the glut headline in the ticker, then press the clock to pause." },
      { id: 'bank-again', say: "Reopen the Bank and look at the gauge. How close did you come to 4.5? Repay what you can to bring the ratio back down.", anchor: 'dock-bank', wait: { type: 'ui', ui: 'open-drawer', id: 'bank' }, hint: "Open the Bank, then press Repay." },
    ],
    win: { event: 'repay' },
    why: {
      title: 'Borrowed money cuts both ways',
      body: [
        "Leverage means using borrowed money to hold more than you own. When prices rise you keep all the gain on the extra stock and pay only the interest. When prices fall you still owe the whole loan. Same lever, both directions.",
        "Debt-to-equity (D/E) is debt divided by net worth. The bank stops lending at 3.0 and forces a margin call at 4.5, seizing your best assets at a 35% discount until D/E is back to 3.0. Equity is what absorbs bad news, so it shrinks fast.",
        "The safe loan is the one you survive a crash with. Stay near D/E 1 and even a harsh fall in prices leaves a wide gap to 4.5. Interest is the smaller worry: about 12% per 30 days, roughly $2.40 a day on $600.",
      ],
      formula: "D/E = debt / net worth. Net worth = cash + stock - debt. The loan fee is 3% upfront. Margin call when D/E > 4.5.",
      example: {
        setup: "You have $400. Lots cost $250 and are worth $369 each. A glut cuts sneaker values by 25%. Prices are at par, before the Deal Room's multiplier.",
        steps: [
          "Borrow $600, buy 2 lots: net worth $619, D/E 0.97. After the glut: net worth $435, D/E 1.38.",
          "Borrow the maximum $1,200, buy 4 lots: net worth $838, D/E 1.43. After the glut: net worth $469, D/E 2.56.",
          "Margin call line: the big loan trips it if sneaker values fall 39% from the start, 18% beyond the glut. The small loan survives a 66% fall.",
        ],
        result: "Both loans looked fine at D/E 1.0 to 1.4, and both survived this glut. Only one has room for a worse day. Size a loan by the worst day, not the average one.",
      },
    },
    teachBack: {
      q: "The bigger loan still ended ahead after the glut. Why might the smaller loan have been the wiser choice?",
      options: [
        { text: "Smaller loans are always cheaper per dollar, and the interest bill is the only thing that really matters here.", correct: false, why: "Interest matters, but the real advantage of the small loan is survival: it leaves a wide gap to a margin call." },
        { text: "It was not wiser. The bigger loan earned more, and earning more is what matters.", correct: false, why: "This time it earned more. But a loan is sized by the worst day: 18% more fall would have forced a sale at a 35% discount." },
        { text: "Leverage multiplies losses as well as gains, and the smaller loan kept D/E far below the margin-call line.", correct: true, why: "Exactly. The same glut took one loan to D/E 2.56 and the other to 1.38. A harsher fall would have forced the big one to sell." },
      ],
    },
    reward: { xp: 180, codex: ['leverage-risk', 'debt-to-equity', 'margin-call'], points: 1 },
  },

  // ------------------------------------------------------------------------------------------------------------------ 8
  {
    id: 'm08', title: "Don't Follow the Herd", icon: '🧭', zone: 5, concept: 'creativity-multiplier', minutes: 2,
    intro: "Metro Hub. You hold two lots of limited-release sneakers. Loft 9 Trend Boutique is the obvious buyer: most rivals pitched there this week. A pop-up stall that nobody is pitching sits around the corner. Does a crowd help you or hurt you?",
    setup: {
      clock: 'paused', cash: 0, assets: [{ cls: 'sneakers' }, { cls: 'sneakers' }],
      leads: [
        { id: 'trend-boutique', seg: 'boutique', budget: 1200 },
        { id: 'popup-stall', seg: 'popup', budget: 900 },
      ],
      lots: [], zones: [5], features: ['stock', 'market', 'codex', 'quests', 'crew', 'bank'], skills: { ops: 2, growth: 1, fintech: 1 }, perks: ['grad'], cohort: { ghosts: 200 },
    },
    steps: [
      { id: 'market', say: "Open Market. The Academy lends you a Niche Radar. Each card shows S, how saturated that buyer is, and Cm, the Creativity Multiplier you would earn.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock." },
      { id: 'boutique', say: "Loft 9 first, the obvious channel. Read its S and Cm on the card. Predict the offer, then tap the card to open the Deal Room.", anchor: 'world:lead:trend-boutique', wait: { type: 'click', anchor: 'world:lead:trend-boutique' }, hint: "Tap the boutique's card." },
      { id: 'quick-herd', say: "Press Quick and read the result: price, S and Cm. This is what the herd earns.", anchor: 'deal-quick', wait: { type: 'event', event: 'pitch', match: { seg: 'boutique' } }, hint: "Press the Quick button inside the Deal Room." },
      { id: 'popup', say: "Now the pop-up stall nobody is pitching. Compare its S and Cm with the first card, then tap it.", anchor: 'world:lead:popup-stall', wait: { type: 'click', anchor: 'world:lead:popup-stall' }, hint: "Tap the stall's card." },
      { id: 'quick-open', say: "Same sneakers, same fit. Press Quick and compare this price with the first sale.", anchor: 'deal-quick', wait: { type: 'click', anchor: 'deal-quick' }, hint: "Press the Quick button inside the Deal Room." },
    ],
    win: { event: 'pitch', match: { seg: 'popup', S: { lt: 0.5 } } },
    why: {
      title: 'Where the crowd is not',
      body: [
        "The Creativity Engine counts the pitches the cohort made in the last 48 hours. V_total is every pitch for your item in this district, V_niche is those that went to one buyer. Saturation S is V_niche divided by V_total.",
        "Cm = [0.40 + ln((V_total + 2) / (V_niche + 1))] × (1 - S), kept between 0.40 and 3.14. A crowded niche sits near the 0.40 floor, the herd trap. A rare niche climbs toward the 3.14 ceiling, a pioneer vector.",
        "Your offer is multiplied by Cm, so the same lot can sell for under half the baseline or for several times it, always capped at the buyer's budget. Copying the leaderboard means competing for the same scraps.",
      ],
      formula: "S = V_niche / V_total. Cm = [0.40 + ln((V_total + 2) / (V_niche + 1))] × (1 - S), kept between 0.40 and 3.14.",
      example: {
        setup: "A sneaker lot is worth $364 here and both buyers fit it at 1.00, so the baseline offer is $364 × 1.35 × 0.60 = $295, and Cm then scales it. Prices are at par, before the Deal Room's multiplier.",
        steps: [
          "Boutique, the herd: S = 0.57, so Cm = 0.42, near the 0.40 floor. The offer is $125, about 42% of the baseline.",
          "Pop-up stall, after your first sale: S = 0.07, so Cm = 2.24. The offer is $660, about 2.2 times the baseline.",
          "Same lot, same fit of 1.00: the stall pays $535 more, 5.3 times the boutique's offer.",
        ],
        result: "Same sneakers, same fit: $125 in the herd and $660 in the open. A niche pays only while it stays quiet, so keep scouting for the next one.",
      },
    },
    teachBack: {
      q: "A niche paid a pioneer price last week. What should you expect once every rival copies it?",
      options: [
        { text: "Saturation will climb and Cm will fall, so scout a quiet niche before the herd arrives.", correct: true, why: "Yes. Proof draws a crowd. As V_niche approaches V_total, S rises and Cm slides toward the 0.40 floor." },
        { text: "It will keep paying, because a niche that already worked once is a proven niche, and proof is valuable.", correct: false, why: "Proof is exactly what attracts rivals. Each new pitch there raises S and lowers the multiplier for everyone." },
        { text: "Nothing changes, because the buyer's budget sets the price and the budget stays the same.", correct: false, why: "A budget is only a ceiling. The offer is scaled by Cm, and Cm falls as the niche fills." },
      ],
    },
    reward: { xp: 200, codex: ['creativity-multiplier'] },
  },

  // ------------------------------------------------------------------------------------------------------------------ 9
  {
    id: 'm09', title: 'Storm Warning', icon: '⛈️', zone: 5, concept: 'demand-shock', minutes: 2,
    intro: "Metro Hub, a calm afternoon. All your stock is three pallets of viral gadgets, one trend. The news ticker says a craze is about to hit that exact trend, then fade. You have a little time to prepare, not much.",
    setup: {
      clock: 'paused', cash: 600, assets: [{ cls: 'gadgets' }, { cls: 'gadgets' }, { cls: 'gadgets' }], leads: [],
      lots: [{ id: 'textbook-pallet', cls: 'textbooks', cond: 'ok', price: 380 }],
      zones: [4, 5], features: ['stock', 'market', 'codex', 'quests', 'crew', 'bank', 'travel'], cohort: { ghosts: 0 },
      events: [{ kind: 'tiktok', atHour: 24 }],
    },
    steps: [
      { id: 'stock', say: "Open Stock. Three gadget pallets, one tag: trend. If trend demand moves, what happens to everything you own? That is concentration risk.", anchor: 'dock-stock', wait: { type: 'ui', ui: 'open-drawer', id: 'stock' }, hint: "Click the Stock icon in the dock." },
      { id: 'travel', say: "Open Travel to see the map. This craze hits every district, so moving the pallets would not save them. Only owning something else will.", anchor: 'dock-travel', wait: { type: 'ui', ui: 'open-drawer', id: 'travel' }, hint: "Click the Travel icon in the dock." },
      { id: 'hedge', say: "Hedge: exam-prep textbooks follow exams, not the craze. Tap the textbook pallet and buy it with your spare cash.", anchor: 'world:lot:textbook-pallet', wait: { type: 'event', event: 'buy', match: { cls: 'textbooks' } }, hint: "Tap the textbook pallet, then press Quick to buy it." },
      { id: 'clock', say: "Your money is spread across two kinds of stock. Now press the clock and pick a fast speed. The craze is scheduled for tomorrow.", anchor: 'hud-clock', wait: { type: 'click', anchor: 'hud-clock' }, hint: "Tap the clock in the top bar to let time run; 16x or 64x is quicker." },
      { id: 'shock', say: "Breaking news: the craze has landed. Trend demand is spiking for 48 hours, then fatigue sets in. Pause the clock, read the ticker, then think about your gadgets.", anchor: 'ticker', wait: { type: 'event', event: 'shock', match: { kind: 'tiktok' } }, hint: "Wait a moment for the headline to scroll into the ticker, then press the clock to pause." },
      { id: 'sell', say: "Reopen Stock and sell the gadgets into the spike: select them and sell to the pool while the price is high. Keep the textbooks, your cushion.", anchor: 'dock-stock', wait: { type: 'ui', ui: 'open-drawer', id: 'stock' }, hint: "Open Stock, select the three gadget pallets and press Sell to pool." },
    ],
    win: { event: 'sell-pool' },
    why: {
      title: 'Do not keep every egg in one trend',
      body: [
        "A demand shock is a sudden swing in how many buyers want something. Here trend demand jumps to five times for 48 hours, then fatigue halves trend prices for 72. Whoever sold into the spike did well. Whoever held everything rode it up and all the way back down.",
        "Diversification spreads money across things that do not move together. Only the share you hold in the shocked tag is exposed: loss = share in the shock × size of the fall. Hedging goes a step further: hold something that keeps its value, or gains, when your main position falls.",
        "A warning is information. The ticker told you 12 hours ahead (earlier with Fintech). Acting costs the pool's haircut of about 14%. Ignoring it costs the whole fall.",
      ],
      formula: "Loss = share in the shocked tag × size of the fall. Spread over n independent tags and the worst case is the biggest single share.",
      example: {
        setup: "Your three pallets are worth $2,189 today ($730 each) and a textbook pallet is worth $427. The craze lifts each gadget pallet to $1,870, then fatigue cuts it to $348: a 52% fall from today.",
        steps: [
          "All in gadgets: loss = 100% × 52% = 52% of what you own, $1,146 of $2,189.",
          "With the textbook pallet too: gadgets are 84% of $2,615, so loss = 84% × 52% = 44% of the portfolio.",
          "Sell the gadgets into the craze: the pool pays $4,818 for the three at the peak, after its 14.1% haircut.",
          "Held through the fatigue, the same pallets are worth $1,043. Selling beat holding by $3,775.",
        ],
        result: "Same pallets, same shock. Hold and lose half; spread and lose 44%; act on the warning and bank $4,818. The ticker gave you 12 hours to choose.",
      },
    },
    teachBack: {
      q: "The ticker warned you before the shock landed. What is the best use of that warning?",
      options: [
        { text: "Ignore it. Prices always bounce back eventually, so holding through the fatigue phase costs you nothing.", correct: false, why: "A bounce takes time, and the fatigue phase lasts 72 hours. Capital stuck in a halved asset cannot work elsewhere meanwhile." },
        { text: "Reduce exposure: sell the shocked tag into the spike and hold goods that do not move with it.", correct: true, why: "Yes. You lock in the spike and your remaining stock moves independently of the craze." },
        { text: "Sell everything at once and hold only cash from now on, because cash can never lose value.", correct: false, why: "Cash is safe but earns nothing. Sell the exposed share, keep the rest working, and move on." },
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
        { id: 'estate-lot-b', cls: 'antiqueFurniture', cond: 'broken', price: 475, auction: true, mode: 'auction', truth: { quality: 0.9, fake: false } },
      ],
      zones: [6], features: ['stock', 'market', 'crew', 'bank', 'travel', 'codex', 'quests'], skills: { ops: 2, growth: 2, fintech: 2 }, cohort: { ghosts: 0 },
    },
    steps: [
      { id: 'read', say: "Deal Day. Tap an antique lot and READ it first: check the serial and the finish, then conclude. Remember the Pawn District?", anchor: 'world:lot:estate-lot-a', wait: { type: 'event', event: 'inspect' }, hint: "Tap an antique lot, probe the serial number and the power, then press Conclude." },
      { id: 'auction', say: "AUCTION: raise or drop each round. Your ceiling is what the lot is worth to you fixed and sold: $616. Win above it and you catch the winner's curse.", anchor: 'deal-room', wait: { type: 'event', event: 'auction', match: { won: true } }, hint: "Press Raise while the price is below your ceiling, and Drop when it is not. If a rival outbids you, the other lot is still there." },
      { id: 'fix', say: "Yours, but broken. Tap it in Stock and FIX it. Read the quote first: repair only if the gain beats the cost.", anchor: 'world:asset:antiqueFurniture', wait: { type: 'event', event: 'repair' }, hint: "Tap the lot, then stop the marker in the green band, or press Careful." },
      { id: 'close', say: "Now sell: tap the antique dealer, PITCH two angles, then CLOSE: anchor high, hold, concede small. Finish the deal and your Backgrounds come next.", anchor: 'deal-stage-close', wait: { type: 'click', anchor: 'deal-stage-close' }, hint: "Tap the dealer's card, choose two angles in the Pitch stage, then open high, hold, and split or accept at or above fair." },
    ],
    win: { event: 'pitch', match: { seg: 'antiqueDealer' } },
    why: {
      title: 'Your score is how well you used your days',
      body: [
        "You just used every skill. Read told you what the lot really was, the Auction capped what you would pay, Repair added value for less than it cost, Pitch matched a buyer's bias and Close anchored the price. Each step protects the margin of the next.",
        "A run is scored by the Economic Efficiency Index: ending net worth divided by starting capital, times a time bonus of 1 plus days remaining over 90. Starting capital is floored at $1,000 so a $0.05 start is fair. Finishing early lifts the bonus, but only if net worth holds.",
        "The winner's curse: in an auction the highest bidder is usually the one who most overestimated the prize. Your inspection and your ceiling are the antidote.",
      ],
      formula: "EEI = ending net worth / max(starting capital, $1,000) × (1 + days remaining / 90).",
      example: {
        setup: "This lot: repaired, the dealer pays $846 for it, $776 after tax and fees, and the repair costs $160. Then two founders each end with $20,000: Ana on day 60 (30 days left), Ben on day 90. Both started with $0.05, floored to $1,000.",
        steps: [
          "Your ceiling: $776 from the sale - $160 repair = $616. Bid above it and the lot loses you money.",
          "Ana: $20,000 / $1,000 = 20. Time bonus 1 + 30/90 = 1.33. EEI = 26.67.",
          "Ben: 20 × (1 + 0/90) = 20.00.",
          "For Ben to match Ana he would need to end with $26,667: speed counts like extra profit.",
        ],
        result: "Same money, different days: 26.67 against 20.00. Your own EEI grows from deals like this one, repeated well and early.",
      },
    },
    teachBack: {
      q: "Your numbers say the lot is worth up to $616 to you once it is fixed and sold. A rival keeps bidding past $620. What do you do?",
      options: [
        { text: "Keep bidding. Winning proves you were right about the lot, and nobody else will outbid a real expert.", correct: false, why: "Winning at $640 for a lot worth $616 to you proves nothing except that you paid for the rival's enthusiasm." },
        { text: "Bid up to $700 to make sure that nobody else gets it, since denying a rival is also a kind of profit.", correct: false, why: "Denying a rival is not a profit. Every dollar above your ceiling comes straight out of your net worth." },
        { text: "Drop out at your ceiling. A win above what the lot is worth to you only buys someone else's overconfidence.", correct: true, why: "Yes. That is the winner's curse. Your numbers set the ceiling, so hold it and let the rival overpay." },
      ],
    },
    reward: { xp: 400, codex: ['eei-score', 'winners-curse'], points: 1 },
  },
];
