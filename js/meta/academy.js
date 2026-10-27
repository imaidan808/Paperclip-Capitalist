// The Academy: ten short missions played in the real UI against a scripted sandbox (docs/V2_DESIGN.md sections 9 and 12).
// Plain data, validated by tests/meta-academy.test.mjs. Every number in a `why.example` is reproducible from the formulas in js/market.js and
// docs/BALANCE.md using the v1 reference economy (Cm = [0.40 + ln((Vtotal + 2) / (Vniche + 1))] x (1 - S) clamped to 0.40..3.14, pitch offer =
// reference x fit term x 0.60 x Cm, repair cost = base x 0.42^(Ops-1), quality = 0.50 + 0.50 x min(1, (Ops-1)/4), loans, D/E 3.0 and 4.5, EEI).
// The test file holds those constants and fails when a lesson number, a setup number and the text drift apart.
//
// Conventions the runner relies on:
//  - A mission's `win` is always a different event from its last step's `wait`, and always causally after it (a click on the control that
//    produces it, or a consequence of it), so a runner that watches `win` only once the last step is done cannot dead-lock.
//  - A 'paused' clock moves only when the player taps `hud-clock`; missions that need time (6, 7, 9) end a step with that tap.
//  - `lots[].auction` and `events[].cls` are two optional extras the base schema lacks (mission 10 needs a lot that is certainly an auction,
//    mission 7 needs the glut to hit the sneakers it sells); a runner that ignores them still plays, only less deterministically.

export const ACADEMY = [
  // ------------------------------------------------------------------------------------------------------------------ 1
  {
    id: 'm01', title: 'First Swap', icon: '📎', zone: 1, concept: 'utility-fit', minutes: 1.5,
    intro: "Dawn in the Scrap Yard. You own one rusty paperclip and $0.00. Across the yard a student shakes her phone: the SIM tray is jammed and her exam starts soon. A mechanic and a barista wander by too. Who needs what you hold?",
    setup: {
      clock: 'paused', cash: 0, assets: [{ cls: 'paperclip' }],
      leads: [
        { id: 'sim-student', seg: 'student', budget: 4, need: 'tool' },
        { id: 'yard-mechanic', seg: 'mechanic', budget: 9 },
        { id: 'cafe-barista', seg: 'barista', budget: 5 },
      ],
      lots: [], zones: [1], features: ['stock', 'market'], cohort: { ghosts: 0 },
    },
    steps: [
      { id: 'cash', say: "Welcome, founder. This is your whole fortune: $0.00 and one paperclip worth about five cents. Everybody starts exactly here. Tap your cash to begin.", anchor: 'hud-cash', wait: { type: 'click', anchor: 'hud-cash' }, hint: "Tap the cash figure in the top bar. It is the number you are about to grow." },
      { id: 'stock', say: "Open Stock to meet your paperclip. Its card shows what it is worth today, so you can tell a bargain from a bluff later.", anchor: 'dock-stock', wait: { type: 'ui', ui: 'open-drawer', id: 'stock' }, hint: "Click the Stock icon in the dock at the bottom of the screen." },
      { id: 'market', say: "Now open Market. Buyers appear as cards: what each one wants and how much they can spend. Read all three before you choose.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock, next to Stock." },
      { id: 'student', say: "The mechanic has the biggest budget. But who needs a thin metal tool right now? Tap that buyer. A fat wallet is not the same as a fat offer.", anchor: 'world:lead:sim-student', wait: { type: 'click', anchor: 'world:lead:sim-student' }, hint: "Look for the card that says it needs a tool: the student with the jammed SIM tray." },
      { id: 'quick', say: "This is the Deal Room, where you will later play pitch, haggle and more. For now press Quick: it pitches at average skill so you can see what need is worth.", anchor: 'deal-quick', wait: { type: 'click', anchor: 'deal-quick' }, hint: "Press the Quick button inside the Deal Room." },
    ],
    win: { event: 'pitch', match: { outcome: 'win', price: { gte: 1 } } },
    why: {
      title: 'Why a five-cent clip sold for $2.62',
      body: [
        "Price follows need, not cost. The student needed a thin tool right now, so for her the clip solved a real problem. When a buyer is urgent, their stated budget becomes the reference price. That gap between what something costs and what a desperate buyer will pay is the urgency premium.",
        "A buyer with no urgent need judges the clip by its fair market value, about five cents. A big budget does not change that. A budget is a ceiling on what someone can pay, never the price they will pay.",
        "How well the item fits what the buyer wants (fit, 0 to 1) scales the offer, and below 0.15 the buyer simply refuses. Asset Utility Score (scarcity × demand - depreciation) measures the same idea from the item's side.",
      ],
      formula: "Offer = reference × fit term × 0.60 × Cm. Reference = the buyer's budget if urgent, otherwise the item's fair value.",
      example: {
        setup: "Paperclip, fair value $0.05. Student: urgent, needs a tool, budget $4.00, fit 1.0. Barista: not urgent, fit 0.5. Mechanic: budget $9.00, fit 0.2. Nobody else is pitching this niche, so Cm = 0.40 + ln 2 = 1.09.",
        steps: [
          "Student: $4.00 × 1.00 × 0.60 × 1.09 = $2.62.",
          "Barista: $0.05 × 0.875 × 0.60 × 1.09 = $0.03 (fit term = 0.40 + 0.95 × 0.5).",
          "Mechanic: $0.05 × 0.59 × 0.60 × 1.09 = $0.02, despite the $9.00 budget.",
        ],
        result: "One paperclip, three offers: $2.62, $0.03 and $0.02. The student's need was worth about 90 times the barista's offer, and it is your first dollar.",
      },
    },
    teachBack: {
      q: "The mechanic had the biggest budget, yet the student paid far more. What explains it?",
      options: [
        { text: "A bigger budget always means a bigger offer, so the mechanic must have been holding back or bluffing.", correct: false, why: "A budget is only a ceiling. The mechanic could afford more, but a paperclip has almost no use to him, so his offer is tiny." },
        { text: "The student urgently needed what you held. Need sets the price, not cost or budget.", correct: true, why: "Yes. Urgency turned her budget into the reference price, and a perfect fit kept the offer high." },
        { text: "The clip cost you nothing, so any price is pure profit and depends on luck.", correct: false, why: "Your cost never sets the price. The same clip fetched $2.62 or $0.02 depending only on who asked and how badly they needed it." },
      ],
    },
    reward: { xp: 100, codex: ['utility-fit', 'urgency-premium', 'asset-utility-score'] },
  },

  // ------------------------------------------------------------------------------------------------------------------ 2
  {
    id: 'm02', title: 'Read the Room', icon: '🔍', zone: 4, concept: 'information-asymmetry', minutes: 2,
    intro: "The Pawn District, mid-morning. Three things sit on the counter: a radio priced like a gift, a radio priced like a radio, and a fountain pen. The owner knows more about each than you ever will. Who knows what?",
    setup: {
      clock: 'paused', cash: 120, assets: [], leads: [],
      lots: [
        { id: 'flash-radio', cls: 'radio', cond: 'ok', price: 24, truth: { quality: 0.2, fake: true } },
        { id: 'honest-radio', cls: 'radio', cond: 'ok', price: 46, truth: { quality: 1, fake: false } },
        { id: 'pen-case', cls: 'pen', cond: 'ok', price: 7, truth: { quality: 0.9, fake: false } },
      ],
      zones: [4], features: ['stock', 'market', 'codex'], skills: { ops: 2, growth: 1, fintech: 1 }, cohort: { ghosts: 0 },
    },
    steps: [
      { id: 'codex', say: "Your first swap unlocked Codex pages. Open the Codex and skim Urgency Premium. Every mission ends with a page like it, written for the next time you need it.", anchor: 'dock-codex', wait: { type: 'ui', ui: 'open-drawer', id: 'codex' }, hint: "Click the Codex icon in the dock." },
      { id: 'market', say: "Open Market. Three lots, and none says which one is honest. The seller knows. You do not. That gap is called information asymmetry.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock." },
      { id: 'flash', say: "One radio costs about half as much as the other. Tempting! Do not pay yet. Tap it and READ it first: the serial number check costs 1 point and is the best fake detector. Then conclude.", anchor: 'world:lot:flash-radio', wait: { type: 'event', event: 'inspect', match: { fake: true } }, hint: "Tap the cheap radio, choose the serial number probe, then press Conclude." },
      { id: 'honest', say: "Next lot. Close that one, tap the other radio and READ it too: serial number for fakes, power-on for quality. Never pay before you know what you are buying.", anchor: 'world:lot:honest-radio', wait: { type: 'event', event: 'inspect', match: { fake: false } }, hint: "Close the Deal Room, tap the pricier radio, probe the serial number and the power, then press Conclude." },
      { id: 'buy', say: "Genuine and sound. Press Quick to buy it at the listed price.", anchor: 'deal-quick', wait: { type: 'click', anchor: 'deal-quick' }, hint: "Press the Quick button inside the Deal Room." },
    ],
    win: { event: 'buy', match: { fake: false } },
    why: {
      title: 'Why the cheap radio was the expensive one',
      body: [
        "Information asymmetry means one side of a deal knows more than the other. A pawn shop owner knows which items are replicas. You do not. A price far below value is a signal, because honest sellers rarely give away most of an item's worth.",
        "That is adverse selection: the bargains you stumble on blind are more likely to be the bad ones. Due diligence closes the gap. A check is worth buying whenever the chance of being wrong times the price at risk is bigger than the check's cost.",
        "Inspect is a skill. Ops sets how many probe points you get and how sharp the answers are, so a higher Ops lets you check more lots before you pay.",
      ],
      formula: "Value of a check = P(fake) × price at risk. Expected value of a blind buy = (1 - P(fake)) × true value - price.",
      example: {
        setup: "Say a radio is worth $60 if genuine and about $0 if fake. The 'gift' radio costs $24 and, being a gift, has a 50% chance of being fake. The honest radio costs $46 in a district where 22% of lots are fakes.",
        steps: [
          "Blind buy at $24: 0.50 × $60 - $24 = +$6.00 expected.",
          "Check first and buy only if genuine: 0.50 × ($60 - $24) = +$18.00 expected.",
          "The check is worth $18 - $6 = $12, which is P(fake) × price = 0.50 × $24.",
          "Honest radio at $46: blind 0.78 × $60 - $46 = +$0.80, checked 0.78 × ($60 - $46) = +$10.92.",
        ],
        result: "A serial check adds $12.00 to the cheap radio and $10.12 to the fair one, for one probe point. It is the best deal in the shop.",
      },
    },
    teachBack: {
      q: "The $24 radio turned out to be a fake. What was the best warning sign before you inspected it?",
      options: [
        { text: "Nothing. Fakes look identical to real ones, so the only protection is luck and a little experience.", correct: false, why: "A signal existed: a price far below value. And inspection exists to turn luck into information." },
        { text: "Cheap always means fake, so the safest rule is to skip bargains and only buy the most expensive lot.", correct: false, why: "Too blunt. The honest radio was fine at $46 and an expensive lot can be worn or overpriced. The point is to check, not to assume." },
        { text: "A price far below value hints that the seller knows something you do not, so a cheap check is worth making.", correct: true, why: "Exactly. A gap between price and value is information. Spend a probe point and let evidence, not hope, decide." },
      ],
    },
    reward: { xp: 120, codex: ['information-asymmetry', 'due-diligence', 'adverse-selection', 'expected-value'], points: 1 },
  },

  // ------------------------------------------------------------------------------------------------------------------ 3
  {
    id: 'm03', title: 'Know Your Buyer', icon: '🎯', zone: 3, concept: 'persona-fit', minutes: 2,
    intro: "Campus Quad, lunchtime. You hold two fountain pens and three people might want one. Every rival has spotted the obvious buyer too. Speak to what each buyer cares about, and notice where the crowd is standing.",
    setup: {
      clock: 'paused', cash: 0, assets: [{ cls: 'pen' }, { cls: 'pen' }],
      leads: [
        { id: 'lecture-student', seg: 'student', budget: 60 },
        { id: 'club-collector', seg: 'collector', budget: 90 },
        { id: 'cafe-barista', seg: 'barista', budget: 30 },
      ],
      lots: [], zones: [3], features: ['stock', 'market', 'codex'], skills: { ops: 2, growth: 1, fintech: 1 }, perks: ['grad'], cohort: { ghosts: 36 },
    },
    steps: [
      { id: 'market', say: "Open Market. The Academy lends you a Niche Radar: each buyer's card now shows a crowd meter, how many rivals pitched there lately.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock." },
      { id: 'student', say: "The Student fits a pen well, and so does every rival's pitch. Tap her card to open the Deal Room.", anchor: 'world:lead:lecture-student', wait: { type: 'click', anchor: 'world:lead:lecture-student' }, hint: "Tap the Student's card, the one with the fullest crowd meter." },
      { id: 'pitch-crowd', say: "PITCH stage: read the hints about what she values, then pick two of the five angles that speak to her. Aim at what they care about, not at what you like.", anchor: 'deal-stage-pitch', wait: { type: 'event', event: 'pitch', match: { seg: 'student' } }, hint: "Pick two angles that match the hints, then finish the deal. Quick works if you are unsure." },
      { id: 'collector', say: "Sold. Remember the price. Now your second pen: tap the Collector, whose crowd meter is almost empty.", anchor: 'world:lead:club-collector', wait: { type: 'click', anchor: 'world:lead:club-collector' }, hint: "Tap the Collector's card." },
      { id: 'pitch-quiet', say: "PITCH again: different buyer, different hints. Read them and pick two angles for this one. Then compare the final price with the Student's.", anchor: 'deal-stage-pitch', wait: { type: 'click', anchor: 'deal-stage-pitch' }, hint: "Choose two angles in the Pitch stage and finish the deal." },
    ],
    win: { event: 'pitch', match: { seg: 'collector' } },
    why: {
      title: 'Same pen, different buyers, different prices',
      body: [
        "Persona fit is how well your pitch speaks to what a buyer values. Every buyer has a bias, an angle they respond to: prestige, utility, scarcity, price or story. Two well-chosen angles can move the fit by up to 0.30, so the same pen sells for more.",
        "Fit decides whether a deal exists at all: below 0.15 a buyer refuses. Above it the offer scales with a fit term of 0.40 + 0.95 × fit.",
        "Market saturation is the other half. When most recent pitches for your item went to one buyer, that niche is crowded, and the Creativity Multiplier Cm falls as saturation S = V_niche / V_total rises. The obvious buyer is rarely the best buyer.",
      ],
      formula: "Fit term = 0.40 + 0.95 × fit. Saturation S = V_niche / V_total.",
      example: {
        setup: "A Barista has fit 0.50 with a pen, and a well-aimed pitch adds +0.20. Say recent pen pitches in the Quad were 20 in all: 14 to the Student and 2 to the Collector.",
        steps: [
          "Fit term at 0.50: 0.40 + 0.95 × 0.50 = 0.875. With the pitch bonus (0.70): 0.40 + 0.95 × 0.70 = 1.065, which is 22% more.",
          "Student: S = 14 / 20 = 0.70. Cm = (0.40 + ln(22/15)) × 0.30 = 0.23, so the 0.40 floor applies.",
          "Collector: S = 2 / 20 = 0.10. Cm = (0.40 + ln(22/3)) × 0.90 = 2.15.",
        ],
        result: "At equal fit the quiet Collector pays 2.15 / 0.40 = 5.4 times what the crowded Student does. Fit gets you a deal. Distance from the herd sets the price.",
      },
    },
    teachBack: {
      q: "Two buyers fit your pen equally well, yet one paid about five times more. What explains it?",
      options: [
        { text: "Fewer rivals were pitching to that buyer, so the Creativity Multiplier was far higher.", correct: true, why: "Yes. With equal fit, the crowd is what differs. A quiet niche scores a high Cm, and a crowded one hits the 0.40 floor." },
        { text: "The richer buyer simply paid more, because pens are a luxury item and rich buyers pay luxury prices.", correct: false, why: "A budget only caps an offer, it does not set it. These two buyers fit the pen equally. What differed was the crowd." },
        { text: "Your angles were better the second time, so the second buyer simply liked you more than the first.", correct: false, why: "Angles move fit by up to 0.30 and the price by about 20%. A five-fold gap needs a bigger cause, and that cause is saturation." },
      ],
    },
    reward: { xp: 140, codex: ['persona-fit', 'market-saturation', 'saturation-herd'], points: 1 },
  },

  // ------------------------------------------------------------------------------------------------------------------ 4
  {
    id: 'm04', title: 'Haggle 101', icon: '🤝', zone: 2, concept: 'anchoring', minutes: 2.5,
    intro: "Flea Market Row, Saturday. Every stall expects a haggle and every price is just a first offer. You have two pens to sell and three people circling. You are about to learn what the first number is worth.",
    setup: {
      clock: 'paused', cash: 0, assets: [{ cls: 'pen' }, { cls: 'pen' }],
      leads: [
        { id: 'stall-student', seg: 'student', budget: 16 },
        { id: 'stall-collector', seg: 'collector', budget: 30 },
        { id: 'stall-barista', seg: 'barista', budget: 12 },
      ],
      lots: [], zones: [2], features: ['stock', 'market', 'codex'], skills: { ops: 1, growth: 2, fintech: 1 }, cohort: { ghosts: 0 },
    },
    steps: [
      { id: 'careless', say: "At Flea Market Row every deal can be haggled, so every first number matters. Deal 1, the careless way: tap the Student. In the Close stage anchor at fair and take the first counter, just to see what it costs.", anchor: 'world:lead:stall-student', wait: { type: 'click', anchor: 'world:lead:stall-student' }, hint: "Tap the Student's card." },
      { id: 'haggle-fair', say: "CLOSE stage: pick the fair anchor, then accept their first counter. Compare the final price with the pen's fair value.", anchor: 'deal-stage-close', wait: { type: 'event', event: 'haggle', match: { role: 'sell' } }, hint: "Anchor at fair, then press Accept when they counter." },
      { id: 'careful', say: "Now the same pen with better habits. Tap the Collector. The Barista is still waiting, and that is your alternative.", anchor: 'world:lead:stall-collector', wait: { type: 'click', anchor: 'world:lead:stall-collector' }, hint: "Tap the Collector's card." },
      { id: 'haggle-high', say: "CLOSE stage: anchor HIGH, hold, and concede in small steps. If they stall, use your alternative once with Leverage. Walking away is real now.", anchor: 'deal-stage-close', wait: { type: 'click', anchor: 'deal-stage-close' }, hint: "Open high, hold your ground, use Leverage once, then split or accept above fair." },
    ],
    win: { event: 'haggle', match: { role: 'sell', deal: true, mult: { gte: 1 } } },
    why: {
      title: 'The first number is worth money',
      body: [
        "Anchoring: the first number on the table pulls the whole negotiation toward it. Everything after is a concession measured from that anchor. Open at fair and you can only meet below fair. Open high and a split lands above it.",
        "Every deal has a ZOPA, the zone of possible agreement, running from the lowest price you would accept to the highest the buyer would pay. A deal exists only where the two overlap. You cannot see their ceiling, but Growth gives you a fuzzy read of it.",
        "Your BATNA is your best alternative to a deal. The Barista made your walk-away price real. A threat to leave works only when you could actually leave.",
      ],
      formula: "ZOPA = [your floor, their ceiling]. Your real floor = your BATNA. A split lands at (your anchor + their counter) / 2.",
      example: {
        setup: "Say a pen has a fair value of $9. Your floor is $6 and the buyer's ceiling is $12 (you cannot see it). The Barista would pay you $9.50.",
        steps: [
          "Open at fair ($9). They counter $7. Split: ($9 + $7) / 2 = $8.00, which is 0.89 × fair.",
          "Open high ($13). They counter the same $7. Split: ($13 + $7) / 2 = $10.00, which is 1.11 × fair.",
          "Same buyer, same counter: the anchor alone moved the price by $2.00, 22% of fair.",
          "With the Barista at $9.50, any offer below $9.50 is worse than walking away. Your real floor is $9.50, not $6.",
        ],
        result: "The careless deal ended near $8.00 and the better one near $10.00. Neither buyer changed. Only the opening number and the credible alternative did.",
      },
    },
    teachBack: {
      q: "What made the second deal end higher than the first?",
      options: [
        { text: "High anchors always win, so the smartest opening is simply the highest number you can possibly imagine, every time.", correct: false, why: "A wild anchor can backfire. Hard buyers punish openings far above their ceiling and may walk. Anchor high but believable." },
        { text: "The Collector had more money than the Student, and richer buyers always pay more.", correct: false, why: "A budget only caps an offer. Fair value and the haggle decide the price, and that is what you changed." },
        { text: "A believable high anchor shifted the range up, and a real alternative made walking away credible.", correct: true, why: "Yes. The anchor moves where the middle is, and your BATNA sets the floor you will not go below." },
      ],
    },
    reward: { xp: 150, codex: ['negotiation', 'anchoring', 'batna-zopa'] },
  },

  // ------------------------------------------------------------------------------------------------------------------ 5
  {
    id: 'm05', title: 'Fix It', icon: '🔧', zone: 7, concept: 'repair-roi', minutes: 2,
    intro: "Auto Row, the repair bays ring with hammers. A Fleet Van with a dead transmission sits in your yard, worth about 30% of a working one. A logistics firm wants a van that runs. Is the fix worth what it costs?",
    setup: {
      clock: 'paused', cash: 600, assets: [{ cls: 'van', cond: 'broken', quality: 1 }],
      leads: [{ id: 'fleet-buyer', seg: 'smelog', budget: 6000 }],
      lots: [], zones: [7], features: ['stock', 'market', 'codex', 'quests'], skills: { ops: 2, growth: 1, fintech: 1 }, cohort: { ghosts: 0 },
    },
    steps: [
      { id: 'quests', say: "Open Quests. Missions, bounties and your skill points live here. A point on Ops makes every repair cheaper and better. You will see how much in a minute.", anchor: 'dock-quests', wait: { type: 'ui', ui: 'open-drawer', id: 'quests' }, hint: "Click the Quests icon in the dock." },
      { id: 'stock', say: "Open Stock. Your broken Fleet Van is in the crate. Broken goods sell for a fraction of their working price.", anchor: 'dock-stock', wait: { type: 'ui', ui: 'open-drawer', id: 'stock' }, hint: "Click the Stock icon in the dock." },
      { id: 'van', say: "Tap the van and read its repair quote: cost, restored quality, new value. Is the gain bigger than the cost? Your Ops sets that price. Then press Repair.", anchor: 'world:asset:van', wait: { type: 'click', anchor: 'world:asset:van' }, hint: "Tap the van in Stock or in the yard to see its repair quote." },
      { id: 'repair', say: "FIX stage: stop the moving marker in the green zone three times. A wider zone comes from Ops. Or press Careful: pay more, no risk.", anchor: 'deal-room', wait: { type: 'event', event: 'repair' }, hint: "Press Stop when the marker is inside the green zone, three times. Careful is also fine." },
      { id: 'market', say: "Fixed. Open Market and find a buyer who wants a van that runs.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock." },
      { id: 'fleet', say: "A logistics firm pays for a working van. Tap the fleet buyer and open the Deal Room.", anchor: 'world:lead:fleet-buyer', wait: { type: 'click', anchor: 'world:lead:fleet-buyer' }, hint: "Tap the fleet buyer's card." },
      { id: 'quick', say: "Press Quick to sell. Then compare the price with what the broken van would have fetched.", anchor: 'deal-quick', wait: { type: 'click', anchor: 'deal-quick' }, hint: "Press the Quick button inside the Deal Room." },
    ],
    win: { event: 'pitch', match: { cls: 'van', seg: 'smelog' } },
    why: {
      title: 'When is a repair worth it?',
      body: [
        "A repair is an investment: you spend cash now to raise an asset's value. Repair ROI is the gain after cost divided by the cost. Do it only when the ROI beats what the same cash would earn elsewhere. That alternative return is your opportunity cost.",
        "Two things set the price of a fix. Ops makes it cheaper (each level multiplies the cost by 0.42) and better (quality restored climbs from 0.50 at Ops 1 to 1.00 at Ops 5). Auto Row takes 25% off the bill. Your dial skill then nudges quality by up to 15% and cost by -10% to +30%.",
        "So the same van can be a loss for one founder and a bargain for another. That is why a skill point on Ops is worth spending.",
      ],
      formula: "ROI = (value after - value before - cost) / cost. Cost = base × 0.42^(Ops - 1) × district discount. Quality = 0.50 + 0.50 × min(1, (Ops - 1) / 4).",
      example: {
        setup: "Say a working van is worth $4,350. Broken, it is worth 30% of that: $1,305. Base repair $1,200. Auto Row takes 25% off.",
        steps: [
          "Ops 1: cost $1,200 × 0.75 = $900. Quality 0.50, so the van is worth $2,175. Gain $870 minus $900 cost = -$30 (ROI -3%). Do not repair yet.",
          "Ops 2: cost $1,200 × 0.42 × 0.75 = $378. Quality 0.625, value $2,719. Gain $1,414 minus $378 = +$1,036 (ROI 274%).",
          "Ops 3: cost $159, quality 0.75, value $3,263: +$1,799 (ROI 1,133%).",
          "Even a poor dial at Ops 2 (quality -15%, cost +30%) nets +$515. A perfect one nets +$1,481.",
        ],
        result: "One skill point on Ops turns a $30 loss into a $1,036 profit on the same van. Always read the quote before you pay.",
      },
    },
    teachBack: {
      q: "At Ops 1 the repair would cost $900 to add $870 of value. What is the smart reading of that?",
      options: [
        { text: "Compare the gain with the cost first. If it does not pay, raise Ops or find a cheaper bay.", correct: true, why: "Yes. A repair is only good when it pays for itself. Ops and a cheaper bay both move the numbers." },
        { text: "Always repair: a working asset is worth more than a broken one, so the fix is worth it whatever it costs.", correct: false, why: "Value after is not profit. At Ops 1 you would pay $900 to gain $870." },
        { text: "Never repair: repairs are a hidden cost that only drains your cash and never pays for itself.", correct: false, why: "At Ops 2 the same repair returns 274%. Repair is excellent when the ROI is high, and the quote tells you which." },
      ],
    },
    reward: { xp: 160, codex: ['repair-roi', 'margin'], points: 1 },
  },

  // ------------------------------------------------------------------------------------------------------------------ 6
  {
    id: 'm06', title: 'Cash Is Not Sleeping', icon: '💰', zone: 5, concept: 'working-capital', minutes: 2,
    intro: "Metro Hub, where managers work the market while you sleep. You hold $620 in cash. It is safe, and it earns exactly nothing. A plot of land is open for your first manager. Can you hire one and still keep them fed?",
    setup: {
      clock: 'paused', cash: 620, assets: [], leads: [], lots: [], zones: [5],
      features: ['stock', 'market', 'codex', 'quests', 'crew'], cohort: { ghosts: 0 },
    },
    steps: [
      { id: 'cash', say: "You hold $620 in cash. It is safe, and it earns $0 a day. Money that sits still is asleep. Tap your cash, then let's wake it up.", anchor: 'hud-cash', wait: { type: 'click', anchor: 'hud-cash' }, hint: "Tap the cash figure in the top bar." },
      { id: 'crew', say: "Open Crew. This is where managers live: people who buy and sell for you in a loop, on a fixed cycle.", anchor: 'dock-crew', wait: { type: 'ui', ui: 'open-drawer', id: 'crew' }, hint: "Click the Crew icon in the dock." },
      { id: 'plot', say: "Tap the empty plot to hire. Compare the cards: the hire fee, the money each manager needs per cycle, and how long a cycle takes.", anchor: 'world:plot:1', wait: { type: 'click', anchor: 'world:plot:1' }, hint: "Tap the empty plot marked 1 in the world." },
      { id: 'hire', say: "Careful: the hire fee AND the manager's working capital both come out of your wallet. Pick a manager you can afford and still feed, choose a lane, and hire.", anchor: 'drawer', wait: { type: 'event', event: 'hire' }, hint: "Hire fee plus the money the manager needs per cycle must fit in your $620. A manager with nothing to work with just idles." },
      { id: 'clock', say: "Your cash is out in the market now. Press the clock and watch it come home.", anchor: 'hud-clock', wait: { type: 'click', anchor: 'hud-clock' }, hint: "Tap the clock to let time run. If the manager never starts a cycle it is starved: open Crew and lower its allocation." },
    ],
    win: { event: 'cycle' },
    why: {
      title: 'Cash is a tool, not a trophy',
      body: [
        "Working capital is the cash a business needs to run its loop: pay for goods, wait, get paid. A manager turns your idle cash into that loop. Money in the wallet earns nothing. Money in the loop earns every time the loop closes.",
        "Cash-flow velocity is how often a dollar completes the loop. A small margin on a fast loop can beat a big margin on a slow one, because profit is earned every lap and then compounds.",
        "The trap: a manager needs working capital as well as a fee. Spend everything on the hire and nothing is left to work with, so the manager sits idle, starved.",
      ],
      formula: "Hire fee + working capital <= cash on hand. Return per day = net per cycle / days per cycle.",
      example: {
        setup: "You have $620. Say the Broker costs $600 to hire and works with up to $1,000 a cycle, the Student manager costs $120 and works with up to $450, and a cycle nets 2% and takes one day.",
        steps: [
          "Broker: $620 - $600 = $20 left to work with. Starved.",
          "Student: $620 - $120 = $500 left, so the full $450 goes to work. 2% of $450 = $9.00 a cycle.",
          "Thirty days of daily 2% cycles: $450 × 1.02^30 = $815.",
          "One slow flip netting 10% per 15 days, twice: $450 × 1.10 × 1.10 = $544.50. Idle cash: $450.",
        ],
        result: "Fast and small beat slow and big: $815 against $545, and $450 doing nothing. Keep working capital free, and keep it moving.",
      },
    },
    teachBack: {
      q: "You hired the cheaper manager and kept cash in the wallet to feed it. Why was that wiser than hiring the best one?",
      options: [
        { text: "Cheaper managers always earn more per cycle than expensive ones, so the cheap one was simply the better hire.", correct: false, why: "Not so. A stronger manager can earn more per cycle. The problem is that a manager without working capital earns nothing at all." },
        { text: "A manager only earns with working capital, so the fee and the cash to run it must both fit.", correct: true, why: "Yes. Working capital is the fuel. Without it the best manager in the market is a very expensive statue." },
        { text: "Cash in the wallet is the main way to grow, so you should hire as little as possible.", correct: false, why: "Idle cash earns $0. The aim is to put most of your money to work while keeping enough free for each cycle." },
      ],
    },
    reward: { xp: 160, codex: ['working-capital', 'cash-flow-velocity', 'opportunity-cost'] },
  },

  // ------------------------------------------------------------------------------------------------------------------ 7
  {
    id: 'm07', title: "Other People's Money", icon: '🏦', zone: 5, concept: 'leverage-risk', minutes: 2.5,
    intro: "The Metro Hub bank is open. You have $400 and four sneaker lots priced about a fifth under their value. You can afford one. The bank would lend you more. How much borrowed money is smart, and what if prices slip?",
    setup: {
      clock: 'paused', cash: 400, assets: [], leads: [],
      lots: [
        { id: 'bargain-a', cls: 'sneakers', cond: 'ok', price: 330 },
        { id: 'bargain-b', cls: 'sneakers', cond: 'ok', price: 330 },
        { id: 'bargain-c', cls: 'sneakers', cond: 'ok', price: 330 },
        { id: 'bargain-d', cls: 'sneakers', cond: 'ok', price: 330 },
      ],
      zones: [5], features: ['stock', 'market', 'codex', 'quests', 'crew', 'bank'], skills: { ops: 1, growth: 1, fintech: 1 }, cohort: { ghosts: 0 },
      events: [{ kind: 'glut', atHour: 6, cls: 'sneakers' }],
    },
    steps: [
      { id: 'bank', say: "Open the Bank. Your own $400 is your equity. The bank lends up to a debt-to-equity ratio (D/E) of 3.0 and calls the loan at 4.5.", anchor: 'dock-bank', wait: { type: 'ui', ui: 'open-drawer', id: 'bank' }, hint: "Click the Bank icon in the dock." },
      { id: 'draw', say: "Each sneaker lot costs $330 and is worth about a quarter more. How much will you borrow? The gauge previews your D/E. The maximum is allowed, but is it wise? Draw a loan.", anchor: 'drawer', wait: { type: 'event', event: 'draw' }, hint: "Pick an amount in the Bank drawer and press Draw. Think about what a bad day would do to the gauge." },
      { id: 'market', say: "Money in hand. Open Market and buy the lots your loan paid for.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock." },
      { id: 'buy', say: "Tap a sneaker lot and press Quick to buy it. Each lot is worth more than you pay, so net worth rises the moment you own it. Buy as many as your loan truly justifies.", anchor: 'world:lot:bargain-a', wait: { type: 'event', event: 'buy' }, hint: "Tap a lot, then press Quick inside the Deal Room. Repeat for as many lots as you want." },
      { id: 'clock', say: "Done buying? Press the clock. A sneaker glut is on its way: more sellers than buyers, so prices will drop.", anchor: 'hud-clock', wait: { type: 'click', anchor: 'hud-clock' }, hint: "Tap the clock in the top bar to let time run." },
      { id: 'shock', say: "There it is: sneaker prices just fell. Read the ticker. Your stock is worth less, but your debt is the same size.", anchor: 'ticker', wait: { type: 'event', event: 'shock' }, hint: "Wait a moment for the glut headline in the ticker." },
      { id: 'bank-again', say: "Reopen the Bank and look at the gauge. How close did you come to 4.5? Repay what you can to bring the ratio back down.", anchor: 'dock-bank', wait: { type: 'ui', ui: 'open-drawer', id: 'bank' }, hint: "Open the Bank, then press Repay." },
    ],
    win: { event: 'repay' },
    why: {
      title: 'Borrowed money cuts both ways',
      body: [
        "Leverage means using borrowed money to hold more than you own. When prices rise you keep all the gain on the extra stock and pay only the interest. When prices fall you still owe the whole loan. Same lever, both directions.",
        "Debt-to-equity (D/E) is debt divided by net worth. The bank stops lending at 3.0 and forces a margin call at 4.5, seizing your best assets at a 35% discount until D/E is back to 3.0. Equity is what absorbs bad news, so it shrinks fast.",
        "The safe loan is the one you survive a crash with. Stay near D/E 1 or lower and even a harsh fall in prices leaves a wide gap to 4.5. Interest is the smaller worry: about 12% per 30 days, roughly $2.40 a day on $600.",
      ],
      formula: "D/E = debt / net worth. Net worth = cash + assets - debt. Margin call when D/E > 4.5.",
      example: {
        setup: "You have $400. Lots cost $330 and are worth about $416. The loan fee is 3%. Say a glut cuts sneaker values by 25%.",
        steps: [
          "Borrow $600, buy 2 lots: net worth $554, D/E 1.08. After the glut: net worth $346, D/E 1.73.",
          "Borrow the maximum $1,200, buy 4 lots: net worth $708, D/E 1.69. After the glut: net worth $292, D/E 4.11.",
          "That is 0.39 from a margin call. A fall of 26.5% instead of 25% would have tripped it.",
          "The $600 loan would not trip it until stock values fell about 51%.",
        ],
        result: "Both loans looked fine at D/E 1.1 to 1.7. Only one survives a bad day with room to spare. Size a loan by the worst day, not the average one.",
      },
    },
    teachBack: {
      q: "The bigger loan made more money on paper. Why was the smaller loan the better choice?",
      options: [
        { text: "Smaller loans are always cheaper per dollar, and the interest bill is the only thing that really matters here.", correct: false, why: "Interest matters, but the real advantage of the small loan is survival: it leaves a wide gap to a margin call." },
        { text: "The glut was just bad luck, so the big loan was unlucky rather than unwise, and next time it would pay.", correct: false, why: "Prices do fall. That is the risk you accept when you borrow. A plan that only works when nothing goes wrong is not a plan." },
        { text: "Leverage multiplies losses as well as gains, and the smaller loan kept D/E far below the margin-call line.", correct: true, why: "Exactly. The same 25% drop took one loan to D/E 1.7 and the other to 4.1, a hair from forced selling." },
      ],
    },
    reward: { xp: 180, codex: ['leverage-risk', 'debt-to-equity', 'margin-call'], points: 1 },
  },

  // ------------------------------------------------------------------------------------------------------------------ 8
  {
    id: 'm08', title: "Don't Follow the Herd", icon: '🧭', zone: 10, concept: 'creativity-multiplier', minutes: 2,
    intro: "Tech Corridor. You hold two SaaS subscription books. Enterprise IT is the obvious buyer: dozens of rivals sold there this week. A small startup that nobody is pitching sits across the road. Does a crowd help you or hurt you?",
    setup: {
      clock: 'paused', cash: 0, assets: [{ cls: 'saas' }, { cls: 'saas' }],
      leads: [
        { id: 'big-corp-it', seg: 'entIT', budget: 90000 },
        { id: 'seed-startup', seg: 'vcstart', budget: 80000 },
      ],
      lots: [], zones: [10], features: ['stock', 'market', 'codex', 'quests', 'crew', 'bank'], skills: { ops: 2, growth: 1, fintech: 1 }, perks: ['grad'], cohort: { ghosts: 40 },
    },
    steps: [
      { id: 'market', say: "Open Market. The Academy lends you a Niche Radar. Each card shows S, how saturated that buyer is, and Cm, the Creativity Multiplier you would earn.", anchor: 'dock-market', wait: { type: 'ui', ui: 'open-drawer', id: 'market' }, hint: "Click the Market icon in the dock." },
      { id: 'corp', say: "Enterprise IT first, the obvious channel. Read its S and Cm on the card. Predict the offer, then tap the card to open the Deal Room.", anchor: 'world:lead:big-corp-it', wait: { type: 'click', anchor: 'world:lead:big-corp-it' }, hint: "Tap the Enterprise IT card." },
      { id: 'quick-herd', say: "Press Quick and read the result: price, S and Cm. This is what the herd earns.", anchor: 'deal-quick', wait: { type: 'event', event: 'pitch', match: { seg: 'entIT' } }, hint: "Press the Quick button inside the Deal Room." },
      { id: 'startup', say: "Now the startup nobody is pitching. Compare its S and Cm with the first card, then tap it.", anchor: 'world:lead:seed-startup', wait: { type: 'click', anchor: 'world:lead:seed-startup' }, hint: "Tap the startup's card." },
      { id: 'quick-open', say: "Same kind of book, same fit. Press Quick and compare this price with the first sale.", anchor: 'deal-quick', wait: { type: 'click', anchor: 'deal-quick' }, hint: "Press the Quick button inside the Deal Room." },
    ],
    win: { event: 'pitch', match: { seg: 'vcstart', S: { lt: 0.5 } } },
    why: {
      title: 'Where the crowd is not',
      body: [
        "The Creativity Engine counts the pitches the cohort made in the last 48 hours. V_total is every pitch for your item in this district, V_niche is those that went to one buyer. Saturation S is V_niche divided by V_total.",
        "Cm = [0.40 + ln((V_total + 2) / (V_niche + 1))] × (1 - S), kept between 0.40 and 3.14. A crowded niche hits the 0.40 floor, the herd trap. A rare niche approaches the 3.14 ceiling, a pioneer vector.",
        "Your offer is multiplied by Cm, so the same book can sell for under half the baseline or for several times it, always capped at the buyer's budget. Copying the leaderboard means competing for the same scraps.",
      ],
      formula: "S = V_niche / V_total. Cm = [0.40 + ln((V_total + 2) / (V_niche + 1))] × (1 - S), clamped to 0.40..3.14.",
      example: {
        setup: "Say a SaaS book is worth $29,000, with fit 1.0 for both buyers (fit term 1.35). In 48 hours 45 pitches were made: 43 to Enterprise IT, 2 to the startup. Baseline offer = $29,000 × 1.35 × 0.60 = $23,490.",
        steps: [
          "Enterprise IT: S = 43 / 45 = 0.96. Raw Cm = (0.40 + ln(47/44)) × 0.04 = 0.02, so the 0.40 floor applies: $23,490 × 0.40 = $9,396.",
          "Startup: S = 2 / 45 = 0.04. Cm = (0.40 + ln(47/3)) × 0.96 = 3.01: $23,490 × 3.01 = $70,739.",
          "A middle niche with 9 of 45 pitches: S = 0.20, Cm = 1.56, offer $36,599.",
        ],
        result: "Same book, same fit: $9,396 in the herd and $70,739 in the open. A niche pays only while it stays quiet, so keep scouting for the next one.",
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
    id: 'm09', title: 'Storm Warning', icon: '⛈️', zone: 6, concept: 'demand-shock', minutes: 2,
    intro: "Estate Sales, a calm afternoon. All your stock is three gadget pallets of one trend. The news ticker says a viral craze is about to hit that exact trend, then fade. You have a little time to prepare, not much.",
    setup: {
      clock: 'paused', cash: 500, assets: [{ cls: 'gadgets' }, { cls: 'gadgets' }, { cls: 'gadgets' }], leads: [],
      lots: [{ id: 'textbook-pallet', cls: 'textbooks', cond: 'ok', price: 440 }],
      zones: [5, 6], features: ['stock', 'market', 'codex', 'quests', 'crew', 'bank', 'travel'], cohort: { ghosts: 0 },
      events: [{ kind: 'tiktok', atHour: 24 }],
    },
    steps: [
      { id: 'stock', say: "Open Stock. Three gadget pallets, one tag: trend. If trend demand moves, what happens to everything you own? That is concentration risk.", anchor: 'dock-stock', wait: { type: 'ui', ui: 'open-drawer', id: 'stock' }, hint: "Click the Stock icon in the dock." },
      { id: 'travel', say: "Open Travel. Shocks are usually local, and the map shows other districts. Spreading across places is one more way to spread risk.", anchor: 'dock-travel', wait: { type: 'ui', ui: 'open-drawer', id: 'travel' }, hint: "Click the Travel icon in the dock." },
      { id: 'hedge', say: "Hedge: textbooks follow the semester, not the craze. Tap the textbook pallet and buy it with your spare cash.", anchor: 'world:lot:textbook-pallet', wait: { type: 'event', event: 'buy', match: { cls: 'textbooks' } }, hint: "Tap the textbook pallet, then press Quick to buy it." },
      { id: 'clock', say: "Your money is spread across two kinds of stock. Now press the clock. The craze is scheduled for tomorrow.", anchor: 'hud-clock', wait: { type: 'click', anchor: 'hud-clock' }, hint: "Tap the clock in the top bar to let time run." },
      { id: 'shock', say: "Breaking news: the craze has landed. Trend demand is spiking for 48 hours, then fatigue sets in. Read the ticker, then think about your gadgets.", anchor: 'ticker', wait: { type: 'event', event: 'shock' }, hint: "Wait a moment for the headline to scroll into the ticker." },
      { id: 'sell', say: "Reopen Stock and sell the gadgets into the spike: select them and sell to the pool while the price is high. Keep the textbooks, your cushion.", anchor: 'dock-stock', wait: { type: 'ui', ui: 'open-drawer', id: 'stock' }, hint: "Open Stock, select the three gadget pallets and press Sell to pool." },
    ],
    win: { event: 'sell-pool' },
    why: {
      title: 'Do not keep every egg in one trend',
      body: [
        "A demand shock is a sudden swing in how many buyers want something. Here trend demand jumps up to five times for 48 hours, then fatigue halves trend prices for 72. Whoever sold into the spike did well. Whoever held everything rode it up and all the way back down.",
        "Diversification spreads money across things that do not move together. Only the share you hold in the shocked tag is exposed: loss = share in the shock × size of the fall. Hedging goes a step further: hold something that keeps its value, or gains, when your main position falls.",
        "A warning is information. The ticker told you 12 hours ahead (earlier with Fintech). Acting costs a fee or a slightly lower price. Ignoring it costs the whole fall.",
      ],
      formula: "Loss = share in the shocked tag × size of the fall. Spread over n independent tags and the worst case is the biggest single share.",
      example: {
        setup: "Say a portfolio is worth $2,000. The fatigue phase cuts trend prices by 50%.",
        steps: [
          "All $2,000 in trend goods: loss = 100% × 50% = $1,000.",
          "Half in trend, half in textbooks: loss = 50% × 50% = $500.",
          "A quarter in trend, three quarters elsewhere: loss = 25% × 50% = $250.",
          "Sell the trend share into the spike and hold the proceeds: the fall costs $0.",
        ],
        result: "Same shock, same $2,000. You lose $1,000, $500, $250 or nothing, depending on how concentrated you were when it landed.",
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
    intro: "Graduation day at the Estate Sales. One mysterious box goes to auction. Read it, bid for it, fix it, pitch it and haggle it, using every skill you have learned. Quick is fine for any stage you have mastered.",
    setup: {
      clock: 'paused', cash: 700, assets: [],
      leads: [{ id: 'gallery-boutique', seg: 'boutique', budget: 1500 }],
      lots: [{ id: 'estate-box', cls: 'gadgets', cond: 'broken', price: 200, auction: true, truth: { quality: 0.9, fake: false } }],
      zones: [6], features: ['stock', 'market', 'crew', 'bank', 'travel', 'codex', 'quests'], skills: { ops: 2, growth: 2, fintech: 2 }, cohort: { ghosts: 0 },
    },
    steps: [
      { id: 'read', say: "Deal Day. Tap the estate box and READ it first: spend probe points to check for a fake and for damage, then conclude. Remember the Pawn District?", anchor: 'world:lot:estate-box', wait: { type: 'event', event: 'inspect' }, hint: "Tap the estate box, probe the serial number and the power, then press Conclude." },
      { id: 'auction', say: "AUCTION: raise or drop each round. Your ceiling is what the box is worth to you once fixed and sold. Win above it and you have caught the winner's curse.", anchor: 'deal-room', wait: { type: 'event', event: 'auction', match: { won: true } }, hint: "Press Raise while the price is below your ceiling, and Drop when it is not." },
      { id: 'fix', say: "The box is yours but broken. Tap the pallet and FIX it. Read the quote first: repair only if the gain beats the cost.", anchor: 'world:asset:gadgets', wait: { type: 'event', event: 'repair' }, hint: "Tap the pallet, then stop the marker in the green zone, or press Careful." },
      { id: 'buyer', say: "Now sell. The boutique loves trend gadgets. Tap the buyer, then PITCH: pick two angles that match what they value.", anchor: 'world:lead:gallery-boutique', wait: { type: 'click', anchor: 'world:lead:gallery-boutique' }, hint: "Tap the boutique's card, then choose two angles in the Pitch stage." },
      { id: 'close', say: "CLOSE: haggle. Anchor high, hold, concede in small steps. Finish the deal, and your Backgrounds come next.", anchor: 'deal-stage-close', wait: { type: 'click', anchor: 'deal-stage-close' }, hint: "Open high, hold, then split or accept above fair." },
    ],
    win: { event: 'pitch', match: { seg: 'boutique' } },
    why: {
      title: 'Your score is how well you used your days',
      body: [
        "You just used every skill. Read told you what the box really was, the Auction capped what you would pay, Repair added value for less than it cost, Pitch matched a buyer's bias and Close anchored the price. Each step protects the margin of the next.",
        "A run is scored by the Economic Efficiency Index: ending net worth divided by starting capital, times a time bonus of 1 plus days remaining over 90. Starting capital is floored at $1,000 so a $0.05 start is fair. Finishing early lifts the bonus, but only if net worth holds.",
        "The winner's curse: in an auction the highest bidder is usually the one who most overestimated the prize. Your inspection and your ceiling are the antidote.",
      ],
      formula: "EEI = ending net worth / max(starting capital, $1,000) × (1 + days remaining / 90).",
      example: {
        setup: "Two founders each end with $20,000. Ana finishes on day 60, with 30 days remaining. Ben uses all 90 days. Both started with $0.05, floored to $1,000.",
        steps: [
          "Ana: $20,000 / $1,000 = 20. Time bonus 1 + 30/90 = 1.33. EEI = 26.67.",
          "Ben: 20 × (1 + 0/90) = 20.00.",
          "For Ben to match Ana he would need to end with $26,700: speed counts like extra profit.",
        ],
        result: "Same money, different days: 26.67 against 20.00. Your own EEI grows from deals like this one, repeated well and early.",
      },
    },
    teachBack: {
      q: "Your numbers say the box is worth about $385 to you once it is fixed and sold. A rival keeps bidding past $400. What do you do?",
      options: [
        { text: "Keep bidding. Winning proves you were right about the box, and nobody else will outbid a real expert.", correct: false, why: "Winning at $420 for a box worth $385 to you proves nothing except that you paid for the rival's enthusiasm." },
        { text: "Bid up to $450 to make sure that nobody else gets it, since denying a rival is also a kind of profit.", correct: false, why: "Denying a rival is not a profit. Every dollar above your ceiling comes straight out of your net worth." },
        { text: "Drop out at your ceiling. A win above what the box is worth to you only buys someone else's overconfidence.", correct: true, why: "Yes. That is the winner's curse. Your numbers set the ceiling, so hold it and let the rival overpay." },
      ],
    },
    reward: { xp: 400, codex: ['eei-score', 'winners-curse'], points: 1 },
  },
];
