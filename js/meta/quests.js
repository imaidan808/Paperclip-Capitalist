// Quests, achievements and daily bounties (docs/V2_DESIGN.md section 12). Plain data: no imports, no logic beyond tiny builders.
//
// Every goal is `{ event, match?, count, sum? }` and is evaluated with js/meta/match.js (`goalDelta`): a `match` is a shallow subset test on the
// event payload (a literal or { gte|lte|gt|lt|eq|in }); with `sum` the named numeric payload field is accumulated up to `count`, otherwise each
// matching event adds 1. Only payload keys listed for the event in js/meta/ids.js (EVENT_PAYLOAD) are used.
//
// Extra fields beyond the section 12 schema (all optional for the engine; ignoring them is safe):
//   ACHIEVEMENTS[].reward  { xp, points? }  what the achievement pays out; scaled by rarity (common < rare < epic). Only the epics in POINT_EPICS add a skill point.
//   ACHIEVEMENTS[].bg      a BACKGROUND_IDS entry   the Background this achievement is themed to (a highlight only: anyone can earn it,
//                          except a-bg-heir, which needs the Legacy Heir's own safety net and so stays hidden until it is earned).
//
// Design rules followed here:
//  - Story quests chain: q01a -> q01b -> q02a -> ... -> q16b. Arrival quests use repeatable events scoped to the district (pitch, buy, ship, hire,
//    auction), never the one-shot `zone` unlock event, so a quest that becomes active after the district was opened can still be completed.
//  - Counts are small (1-5 for quests, up to 25 for achievements); money milestones use `sum`. No count may ask for more than a default
//    90-day run can produce (tests/audit-content.test.mjs plays the audit and rent counts out in the engine).
//  - Skill points are scarce: three skills top out at level 8, so a founder can spend 19 points at most (the Heir 21). Quests (8), the Academy (5)
//    and POINT_EPICS (6) together stay within that; levels give points too, and the engine turns any surplus into XP (Game.grantPoints).
//  - String payload values are the v1 ids (cond 'broken', client tier 'ent', shock kinds 'fed' | 'tiktok' | 'tariff', exit kind 'ipo', audit choice 'C').
//    Where a rename is plausible the match lists the likely synonyms with `in`.
//  - No em dashes anywhere (house style).

/** A pitch that closed a trade (anything but `rejected`). */
const SOLD = () => ({ in: ['win', 'pioneer', 'herd', 'flat'] });
/** A pitch that closed at a profit (`win`, or a `pioneer` niche sale). */
const PROFIT = () => ({ in: ['win', 'pioneer'] });

const quest = (id, zone, title, icon, desc, goal, xp, points, after) => ({
  id, title, desc, icon, zone, goal, reward: points ? { xp, points } : { xp }, ...(after ? { after } : {}),
});

/** Two quests per district: an arrival quest (get there, do its first thing) and a mastery quest (the district's signature rule). */
export const QUESTS = [
  // ---------------------------------------------------------------- Tier 1: the streets
  quest('q01a', 1, 'First Swap', '🔁', 'Trade your paperclip to a buyer in The Scrap Yard. Any buyer who bites counts.',
    { event: 'pitch', match: { zone: 1, outcome: SOLD() }, count: 1 }, 50),
  quest('q01b', 1, 'Need Beats Cost', '🎯', 'Close 3 trades in The Scrap Yard with buyers who really need what you hold (fit 70% or better). Urgent buyers pay for need, not for what you paid.',
    { event: 'pitch', match: { zone: 1, outcome: SOLD(), fit: { gte: 0.7 } }, count: 3 }, 100, 0, 'q01a'),
  quest('q02a', 2, 'Stall Crawler', '🧺', 'Buy 2 lots from the stalls at Flea Market Row.',
    { event: 'buy', match: { zone: 2 }, count: 2 }, 80, 0, 'q01b'),
  quest('q02b', 2, 'Never Take the First Offer', '🗣️', 'Sell 3 goods in Flea Market Row for at least 10% above fair price. Anchor high, hold your ground, concede slowly.',
    { event: 'pitch', match: { zone: 2, outcome: SOLD(), gain: { gte: 0.1 } }, count: 3 }, 160, 0, 'q02a'),
  quest('q03a', 3, 'Syllabus Week', '📚', 'Sell 2 goods on Campus Quad.',
    { event: 'pitch', match: { zone: 3, outcome: SOLD() }, count: 2 }, 110, 0, 'q02b'),
  quest('q03b', 3, 'Ride the Wave', '🌊', 'Sell 3 goods on Campus Quad at a profit into an uncrowded niche (Creativity Multiplier 1.3 or better). Ride the semester wave, skip the herd.',
    { event: 'pitch', match: { zone: 3, outcome: PROFIT(), cm: { gte: 1.3 } }, count: 3 }, 220, 0, 'q03a'),
  quest('q04a', 4, 'Window Shopping', '🪟', 'Buy 2 lots in the Pawn District. About 1 in 5 of them is a fake, so look closely.',
    { event: 'buy', match: { zone: 4 }, count: 2 }, 150, 0, 'q03b'),
  quest('q04b', 4, 'Spot the Fake', '🕵️', 'Catch a counterfeit: probe a lot until the fake gives itself away. Serial numbers and paperwork are your friends.',
    { event: 'inspect', match: { fake: true, caught: true }, count: 1 }, 300, 1, 'q04a'),

  // ---------------------------------------------------------------- Tier 2: the town
  quest('q05a', 5, 'Uptown Debut', '🌆', 'Sell 2 goods in Metro Hub.',
    { event: 'pitch', match: { zone: 5, outcome: SOLD() }, count: 2 }, 200, 0, 'q04b'),
  quest('q05b', 5, 'Cash Is Not Sleeping', '👔', 'Hire a manager in Metro Hub so your cash keeps working while you do not.',
    { event: 'hire', match: { zone: 5 }, count: 1 }, 400, 0, 'q05a'),
  quest('q06a', 6, 'Paddle Up', '🙋', 'Bid in 2 auctions at Estate Sales. About half the lots here go to the highest bidder.',
    { event: 'auction', count: 2 }, 280, 0, 'q05b'),
  quest('q06b', 6, 'Beat the Curse', '🔨', 'Win 2 auctions for less than the lot is worth. Estimate, set a ceiling, and drop out when the price passes it.',
    { event: 'auction', match: { won: true, surplus: { gt: 0 } }, count: 2 }, 520, 1, 'q06a'),
  quest('q07a', 7, 'Junkyard Dreams', '🚗', 'Buy 2 broken goods in Auto Row. Broken goods are cheap, and 6 in 10 lots here are broken.',
    { event: 'buy', match: { zone: 7, cond: 'broken' }, count: 2 }, 350, 0, 'q06b'),
  quest('q07b', 7, 'Worth the Wrench', '🔧', 'Repair 3 goods at 80% precision or better. The bays in Auto Row cost 25% less, so this is the place to practise.',
    { event: 'repair', match: { precision: { gte: 0.8 } }, count: 3 }, 620, 0, 'q07a'),
  quest('q08a', 8, 'Dockside Delivery', '🚢', 'Ship a crate to Harbor Docks.',
    { event: 'ship', match: { to: 8 }, count: 1 }, 450, 0, 'q07b'),
  quest('q08b', 8, 'Through Customs', '🛃', 'Land 8 crates at Harbor Docks. Some may be held for inspection, so budget for the delay and the 2% fee.',
    { event: 'ship', match: { to: 8 }, count: 8, sum: 'count' }, 800, 1, 'q08a'),

  // ---------------------------------------------------------------- Tier 3: the region
  quest('q09a', 9, 'Hard Hat Required', '👷', 'Sell 2 goods in Industrial Park.',
    { event: 'pitch', match: { zone: 9, outcome: SOLD() }, count: 2 }, 520, 0, 'q08b'),
  quest('q09b', 9, 'Pass the Audit', '📋', 'Pass a compliance audit. A clean paper trail beats luck.',
    { event: 'audit', match: { ok: true }, count: 1 }, 900, 0, 'q09a'),
  quest('q10a', 10, 'Hello, World', '💻', 'Buy 2 lots in the Tech Corridor, where digital goods lose value fast.',
    { event: 'buy', match: { zone: 10 }, count: 2 }, 640, 0, 'q09b'),
  quest('q10b', 10, 'First Mover', '🚀', 'Land a pioneer sale in the Tech Corridor: reach a niche before everyone else piles in.',
    { event: 'pitch', match: { zone: 10, outcome: 'pioneer' }, count: 1 }, 1100, 1, 'q10a'),
  quest('q11a', 11, 'Harvest Moon', '🌽', 'Sell 2 goods in Farmland Co-op.',
    { event: 'pitch', match: { zone: 11, outcome: SOLD() }, count: 2 }, 700, 0, 'q10b'),
  quest('q11b', 11, 'Beat the Spoilage', '🍎', 'Sell 4 goods at a profit in Farmland Co-op before they spoil. Check the shelf life and the harvest wave first.',
    { event: 'pitch', match: { zone: 11, outcome: PROFIT() }, count: 4 }, 1200, 0, 'q11a'),
  quest('q12a', 12, 'Open Studio', '🎨', 'Buy 2 lots in the Creative Quarter.',
    { event: 'buy', match: { zone: 12 }, count: 2 }, 850, 0, 'q11b'),
  quest('q12b', 12, 'Paid While You Sleep', '💸', 'Collect 5 profitable cycles in the Creative Quarter. Royalties turn one asset into many paydays.',
    { event: 'cycle', match: { zone: 12, net: { gt: 0 } }, count: 5 }, 1400, 1, 'q12a'),

  // ---------------------------------------------------------------- Tier 4: the world
  quest('q13a', 13, 'Business Casual', '🏢', 'Sell 2 goods in Corporate Valley.',
    { event: 'pitch', match: { zone: 13, outcome: SOLD() }, count: 2 }, 1000, 0, 'q12b'),
  quest('q13b', 13, 'Land a Whale', '🐋', 'Sign an enterprise client. Long contracts pay well and punish missed SLAs.',
    { event: 'client', match: { tier: { in: ['ent', 'enterprise'] } }, count: 1 }, 1800, 0, 'q13a'),
  quest('q14a', 14, 'Open an Account', '🏦', 'Buy 2 lots in the Financial District.',
    { event: 'buy', match: { zone: 14 }, count: 2 }, 1300, 0, 'q13b'),
  quest('q14b', 14, 'Leverage With a Leash', '⚖️', 'Repay $50,000 of loans. Borrow to grow, then pay it back before the interest pays you a visit.',
    { event: 'repay', count: 50000, sum: 'amount' }, 2200, 1, 'q14a'),
  quest('q15a', 15, 'Key in Hand', '🔑', 'Sell 2 goods on Real Estate Row.',
    { event: 'pitch', match: { zone: 15, outcome: SOLD() }, count: 2 }, 1600, 0, 'q14b'),
  quest('q15b', 15, 'Landlord Life', '🏠', 'Collect $25,000 in cycle income on Real Estate Row. Rent pays every day you hold property, so buy early and be patient.',
    { event: 'cycle', match: { zone: 15, net: { gt: 0 } }, count: 25000, sum: 'net' }, 2600, 0, 'q15a'),
  quest('q16a', 16, 'Opening Bell', '🔔', 'Sell 2 goods at Global Exchange.',
    { event: 'pitch', match: { zone: 16, outcome: SOLD() }, count: 2 }, 2000, 0, 'q15b'),
  quest('q16b', 16, 'Close the Gap', '🌍', 'Sell 3 goods at Global Exchange at least 12% above fair price. Buy where it is cheap, ship it, sell where it is dear.',
    { event: 'pitch', match: { zone: 16, outcome: SOLD(), gain: { gte: 0.12 } }, count: 3 }, 3500, 2, 'q16a'),
];

// Rewards scale with rarity: common 60-120 xp, rare 220-300 xp, epic 650-900 xp. Six of the epics, the skill-game ones, also pay a skill point:
// a founder can only spend 19 points, so the rest of the epics pay xp alone.
const POINT_EPICS = new Set(['a-poker-face', 'a-counterfeit-cop', 'a-perfectionist', 'a-auction-shark', 'a-unstoppable', 'a-trailblazer']);
const ach = (id, rarity, title, icon, desc, goal, xp, extra = {}) => ({
  id, title, desc, icon, rarity, goal, reward: POINT_EPICS.has(id) ? { xp, points: 1 } : { xp }, ...extra,
});

/** Achievements: skill play, streaks, risk, the Creativity Engine, the twelve Backgrounds, tiers, audits, peers, levels, money and a few secrets. */
export const ACHIEVEMENTS = [
  // ---------------------------------------------------------------- haggle
  ach('a-haggle-first', 'common', 'First Bargain', '💬', 'Close your first haggled deal.',
    { event: 'haggle', match: { deal: true }, count: 1 }, 60),
  ach('a-haggle-ten', 'common', 'Market Regular', '🛒', 'Close 10 haggled deals, buying or selling.',
    { event: 'haggle', match: { deal: true }, count: 10 }, 100),
  ach('a-silver-tongue', 'rare', 'Silver Tongue', '🗣️', 'Sell 5 goods through a haggle at 20% or more above fair price.',
    { event: 'haggle', match: { role: 'sell', deal: true, mult: { gte: 1.2 } }, count: 5 }, 250),
  ach('a-bargain-hunter', 'rare', 'Bargain Hunter', '🏷️', 'Buy 5 goods through a haggle at 5% or more below the asking price.',
    { event: 'haggle', match: { role: 'buy', deal: true, mult: { lte: 0.95 } }, count: 5 }, 250),
  ach('a-bg-pro', 'rare', 'Old School Charm', '🎩', 'Seasoned Pro: close 5 sales through a haggle with a score of 80% or better and a price 10% or more above fair. Steady hands win.',
    { event: 'haggle', match: { role: 'sell', deal: true, score: { gte: 0.8 }, mult: { gte: 1.1 } }, count: 5 }, 230, { bg: 'pro' }),
  ach('a-poker-face', 'epic', 'Poker Face', '🃏', 'Close 10 sales through a haggle with a score of 95% or better and a price 10% or more above fair. Anchor well, never blink.',
    { event: 'haggle', match: { role: 'sell', deal: true, score: { gte: 0.95 }, mult: { gte: 1.1 } }, count: 10 }, 700),

  // ---------------------------------------------------------------- inspect
  ach('a-good-eye', 'common', 'Good Eye', '👁️', 'Finish 5 inspections with a score of 80% or better.',
    { event: 'inspect', match: { score: { gte: 0.8 } }, count: 5 }, 80),
  ach('a-appraiser', 'rare', 'Appraiser', '🔎', 'Finish 15 inspections with a score of 90% or better.',
    { event: 'inspect', match: { score: { gte: 0.9 } }, count: 15 }, 280),
  ach('a-fake-buster', 'rare', 'Fake Buster', '🕵️', 'Second-Chance Hustler: catch 3 counterfeits before you buy them. You know the signs.',
    { event: 'inspect', match: { fake: true, caught: true }, count: 3 }, 220, { bg: 'second' }),
  ach('a-counterfeit-cop', 'epic', 'Counterfeit Cop', '🚔', 'Catch 15 counterfeits. Nothing fake gets past you.',
    { event: 'inspect', match: { fake: true, caught: true }, count: 15 }, 650),

  // ---------------------------------------------------------------- repair
  ach('a-fixer-upper', 'common', 'Fixer-Upper', '🔧', 'Repair your first broken good.',
    { event: 'repair', count: 1 }, 60),
  ach('a-hands-on', 'common', 'Hands On', '🛠️', 'Licensed Tradesperson: repair 10 goods. Your hands know the work.',
    { event: 'repair', count: 10 }, 110, { bg: 'trades' }),
  ach('a-steady-hands', 'rare', 'Steady Hands', '🎯', 'Repair 5 goods at 90% precision or better.',
    { event: 'repair', match: { precision: { gte: 0.9 } }, count: 5 }, 250),
  ach('a-perfectionist', 'epic', 'Perfectionist', '💎', 'Repair 10 goods at 97% precision or better.',
    { event: 'repair', match: { precision: { gte: 0.97 } }, count: 10 }, 700),

  // ---------------------------------------------------------------- auctions
  ach('a-paddle-up', 'common', 'Paddle Up', '🙋', 'Take part in your first auction.',
    { event: 'auction', count: 1 }, 60),
  ach('a-going-once', 'common', 'Going Once', '🔨', 'Win 3 auctions.',
    { event: 'auction', match: { won: true }, count: 3 }, 100),
  ach('a-no-curse', 'rare', 'No Curse Here', '🍀', 'Win 5 auctions for less than the lot is worth.',
    { event: 'auction', match: { won: true, surplus: { gt: 0 } }, count: 5 }, 280),
  ach('a-auction-shark', 'epic', 'Auction Shark', '🦈', 'Pocket $5,000 in total auction surplus: the value you won beyond what you paid.',
    { event: 'auction', match: { won: true, surplus: { gt: 0 } }, count: 5000, sum: 'surplus' }, 750),
  ach('a-winners-curse', 'common', "The Winner's Curse", '🤦', 'Win an auction and pay more than the lot was worth. It happens to everyone once. Now you know why.',
    { event: 'auction', match: { won: true, surplus: { lt: 0 } }, count: 1 }, 70, { hidden: true }),

  // ---------------------------------------------------------------- streaks
  ach('a-hot-hand', 'common', 'Hot Hand', '🔥', 'Reach a deal streak of 3.',
    { event: 'streak', match: { n: { gte: 3 } }, count: 1 }, 70),
  ach('a-on-fire', 'rare', 'On Fire', '🌶️', 'Reach a deal streak of 6.',
    { event: 'streak', match: { n: { gte: 6 } }, count: 1 }, 220),
  ach('a-unstoppable', 'epic', 'Unstoppable', '⚡', 'Reach a deal streak of 10.',
    { event: 'streak', match: { n: { gte: 10 } }, count: 1 }, 650),

  // ---------------------------------------------------------------- risk survived
  ach('a-called-not-cooked', 'rare', 'Called, Not Cooked', '📉', 'Take a margin call and keep your business running.',
    { event: 'margin-call', count: 1 }, 250),
  ach('a-rock-bottom', 'common', 'Rock Bottom', '🧱', 'Go insolvent. Every founder has a story like this; the lesson is to size your debt to your cash flow.',
    { event: 'insolvent', count: 1 }, 60, { hidden: true }),
  ach('a-credit-crunch', 'rare', 'Crunch Survivor', '🥶', 'Live through a credit crunch.',
    { event: 'shock', match: { kind: { in: ['fed', 'credit', 'credit-crunch'] } }, count: 1 }, 230),
  ach('a-tariff-tango', 'common', 'Tariff Tango', '🧾', 'Live through a tariff shock.',
    { event: 'shock', match: { kind: { in: ['tariff', 'tariffs'] } }, count: 1 }, 100),
  ach('a-demand-surge', 'common', 'Riding the Surge', '📈', 'Live through a demand shock.',
    { event: 'shock', match: { kind: { in: ['tiktok', 'demand', 'demand-shock'] } }, count: 1 }, 100),
  ach('a-bg-veteran', 'rare', 'Steady in the Storm', '⛈️', 'Veteran: weather 3 macro shocks of any kind. Discipline holds when markets do not.',
    { event: 'shock', count: 3 }, 250, { bg: 'veteran' }),

  // ---------------------------------------------------------------- the Creativity Engine
  ach('a-closer', 'common', 'Closer', '💼', 'Win 10 pitches: sales that land above fair price.',
    { event: 'pitch', match: { outcome: PROFIT() }, count: 10 }, 100),
  ach('a-rainmaker', 'rare', 'Rainmaker', '🌧️', 'Win 25 pitches.',
    { event: 'pitch', match: { outcome: PROFIT() }, count: 25 }, 280),
  ach('a-pioneer', 'rare', 'Pioneer', '🧭', 'Land a pioneer sale: a niche almost nobody else serves.',
    { event: 'pitch', match: { outcome: 'pioneer' }, count: 1 }, 250),
  ach('a-trailblazer', 'epic', 'Trailblazer', '🏔️', 'Land 10 pioneer sales. You do not follow trails, you cut them.',
    { event: 'pitch', match: { outcome: 'pioneer' }, count: 10 }, 750),
  ach('a-off-the-charts', 'epic', 'Off the Charts', '💫', 'Hit a Creativity Multiplier of 3.0 or higher on a pioneer sale. The ceiling is 3.14.',
    { event: 'pitch', match: { outcome: 'pioneer', cm: { gte: 3 } }, count: 1 }, 800, { hidden: true }),
  ach('a-perfect-match', 'rare', 'Perfect Match', '💘', 'Close 10 sales to buyers with a fit of 90% or better.',
    { event: 'pitch', match: { outcome: SOLD(), fit: { gte: 0.9 } }, count: 10 }, 220),
  ach('a-jackpot', 'rare', 'Jackpot', '🎰', 'Sell something for double its fair value.',
    { event: 'pitch', match: { outcome: SOLD(), gain: { gte: 1 } }, count: 1 }, 300, { hidden: true }),
  ach('a-herd-mentality', 'common', 'Follow the Leader', '🐑', 'Sell into a crowded herd 3 times. Everyone else is doing it, which is exactly the problem.',
    { event: 'pitch', match: { outcome: 'herd' }, count: 3 }, 70, { hidden: true }),
  ach('a-clip', 'rare', 'Paperclip Maximizer', '📎', 'Sell 10 paperclips. It is in the name, after all.',
    { event: 'pitch', match: { cls: 'paperclip', outcome: SOLD() }, count: 10 }, 200, { hidden: true }),

  // ---------------------------------------------------------------- the twelve Backgrounds
  ach('a-bg-connected', 'rare', 'Rolodex', '📇', 'Well-Connected: sign 3 clients. Your dad did know a guy.',
    { event: 'client', count: 3 }, 220, { bg: 'connected' }),
  ach('a-bg-grad', 'rare', 'Textbook Case', '📖', 'Business-School Grad: close 5 sales into niches under 25% saturated at 10% or more above fair price. Theory pays.',
    { event: 'pitch', match: { outcome: SOLD(), S: { lte: 0.25 }, gain: { gte: 0.1 } }, count: 5 }, 260, { bg: 'grad' }),
  ach('a-bg-immigrant', 'rare', 'Diaspora Express', '✈️', 'Immigrant Hustler: ship 25 crates between districts. Your network moves goods.',
    { event: 'ship', count: 25, sum: 'count' }, 250, { bg: 'immigrant' }),
  ach('a-bg-heir', 'rare', 'Family Safety Net', '🪂', 'Legacy Heir: take a margin call and let the family catch you. Only the Heir has this safety net.',
    { event: 'perk', match: { id: 'heir', effect: 'bailout' }, count: 1 }, 250, { bg: 'heir', hidden: true }),
  ach('a-bg-creator', 'rare', 'Gone Viral', '📱', 'Creator: close 3 pitches at 30% or more above fair price. The audience shows up.',
    { event: 'pitch', match: { outcome: SOLD(), gain: { gte: 0.3 } }, count: 3 }, 250, { bg: 'creator' }),
  ach('a-bg-gigger', 'common', 'Hustle Season', '🛵', 'Side-Hustler: complete 20 cycles, manager runs or paid days of rent and royalties. Always something running.',
    { event: 'cycle', count: 20 }, 120, { bg: 'gigger' }),
  ach('a-bg-roots', 'common', 'Hometown Favorite', '🏡', 'Small-Town Roots: close 12 sales in your first two districts. Locals remember.',
    { event: 'pitch', match: { zone: { lte: 2 }, outcome: SOLD() }, count: 12 }, 110, { bg: 'roots' }),
  ach('a-bg-native', 'common', 'Always On', '🔌', 'Digital Native: buy 3 upgrades. Tools stack up.',
    { event: 'upgrade', count: 3 }, 120, { bg: 'native' }),

  // ---------------------------------------------------------------- districts and tiers
  ach('a-uptown', 'common', 'Uptown Bound', '🌆', 'Open Metro Hub and step up to tier 2.',
    { event: 'zone', match: { id: 5 }, count: 1 }, 90),
  ach('a-smokestack', 'rare', 'Smokestack Season', '🏭', 'Open Industrial Park and step up to tier 3.',
    { event: 'zone', match: { id: 9 }, count: 1 }, 250),
  ach('a-glass-tower', 'epic', 'Glass Tower', '🏙️', 'Open Corporate Valley and step up to tier 4.',
    { event: 'zone', match: { id: 13 }, count: 1 }, 700),
  ach('a-world-stage', 'epic', 'World Stage', '🌐', 'Open Global Exchange, the last district on the avenue.',
    { event: 'zone', match: { id: 16 }, count: 1 }, 900),
  ach('a-cartographer', 'rare', 'Cartographer', '🗺️', 'Open 8 districts.',
    { event: 'zone', count: 8 }, 260),
  ach('a-grand-tour', 'epic', 'Grand Tour', '🧳', 'Open all 15 districts beyond the one you started in.',
    { event: 'zone', count: 15 }, 800),

  // ---------------------------------------------------------------- audits
  ach('a-clean-books', 'rare', 'Clean Books', '📒', 'Pass 3 audits.',
    { event: 'audit', match: { ok: true }, count: 3 }, 260),
  ach('a-audit-proof', 'epic', 'Audit-Proof', '🛡️', 'Pass 5 audits. Your paperwork could be framed.',
    { event: 'audit', match: { ok: true }, count: 5 }, 700),
  ach('a-lucky-bypass', 'rare', 'Not Today, Auditor', '🎲', 'Skip the paperwork and still pass an audit. Do not make a habit of it.',
    { event: 'audit', match: { choice: 'C', ok: true }, count: 1 }, 250, { hidden: true }),

  // ---------------------------------------------------------------- peers
  ach('a-handshake', 'common', 'Handshake', '🤝', 'Complete a peer-to-peer trade with a classmate.',
    { event: 'p2p', count: 1 }, 80),
  ach('a-network-effects', 'rare', 'Network Effects', '🕸️', 'Complete 5 peer-to-peer trades.',
    { event: 'p2p', count: 5 }, 240),
  ach('a-fair-dealer', 'rare', 'Fair Dealer', '⚖️', 'Complete 3 peer trades within 5% of each other in value.',
    { event: 'p2p', match: { variance: { lte: 0.05 } }, count: 3 }, 240),

  // ---------------------------------------------------------------- levels and skills
  ach('a-level-5', 'common', 'Rising Star', '⭐', 'Reach level 5.',
    { event: 'level', match: { level: { gte: 5 } }, count: 1 }, 90),
  ach('a-level-10', 'rare', 'Seasoned', '🌟', 'Reach level 10.',
    { event: 'level', match: { level: { gte: 10 } }, count: 1 }, 280),
  ach('a-level-15', 'epic', 'Legend', '👑', 'Reach level 15.',
    { event: 'level', match: { level: { gte: 15 } }, count: 1 }, 800),
  ach('a-first-point', 'common', 'Invest in Yourself', '🌱', 'Spend your first skill point.',
    { event: 'skill', count: 1 }, 70),
  ach('a-specialist', 'rare', 'Specialist', '🧠', 'Raise a skill to level 4.',
    { event: 'skill', match: { level: { gte: 4 } }, count: 1 }, 240),
  ach('a-grandmaster', 'epic', 'Grandmaster', '🏆', 'Raise a skill to level 6.',
    { event: 'skill', match: { level: { gte: 6 } }, count: 1 }, 700),

  // ---------------------------------------------------------------- money and the business
  ach('a-rev-1k', 'common', 'Four Figures', '💵', 'Sell $1,000 worth of goods in total.',
    { event: 'pitch', match: { outcome: SOLD() }, count: 1000, sum: 'price' }, 80),
  ach('a-rev-100k', 'rare', 'Six Figures', '💰', 'Sell $100,000 worth of goods in total.',
    { event: 'pitch', match: { outcome: SOLD() }, count: 100000, sum: 'price' }, 280),
  ach('a-rev-5m', 'epic', 'Seven Figures', '🤑', 'Sell $5,000,000 worth of goods in total.',
    { event: 'pitch', match: { outcome: SOLD() }, count: 5000000, sum: 'price' }, 850),
  ach('a-cycle-income', 'rare', 'Money While You Sleep', '😴', 'Earn $10,000 in total from cycles: manager runs and days of rent or royalties.',
    { event: 'cycle', match: { net: { gt: 0 } }, count: 10000, sum: 'net' }, 260),
  ach('a-first-hire', 'common', 'First Hire', '👋', 'Hire your first manager.',
    { event: 'hire', count: 1 }, 80),
  ach('a-org-chart', 'rare', 'Org Chart', '🗂️', 'Hire 5 managers.',
    { event: 'hire', count: 5 }, 240),
  ach('a-raise-the-bar', 'rare', 'Raise the Bar', '🪜', 'Upgrade a manager lane to level 3.',
    { event: 'pipe-level', match: { level: { gte: 3 } }, count: 1 }, 230),
  ach('a-whale-pod', 'epic', 'Whale Pod', '🐳', 'Sign 3 enterprise clients.',
    { event: 'client', match: { tier: { in: ['ent', 'enterprise'] } }, count: 3 }, 750),
  ach('a-draw-first', 'common', 'On the Books', '🏧', 'Draw your first loan.',
    { event: 'draw', count: 1 }, 70),
  ach('a-debt-slayer', 'rare', 'Debt Slayer', '🗡️', 'Repay $25,000 of loans in total.',
    { event: 'repay', count: 25000, sum: 'amount' }, 260),
  ach('a-fire-sale', 'common', 'Fire Sale', '🧯', 'Dump goods into the liquidity pool 3 times. Fast cash costs a haircut.',
    { event: 'sell-pool', count: 3 }, 70),
  ach('a-exit', 'rare', 'Cash Out', '🏁', 'Complete an exit and lock in your score.',
    { event: 'exit', count: 1 }, 300),
  ach('a-ipo', 'epic', 'Going Public', '📣', 'Take your company public with an IPO.',
    { event: 'exit', match: { kind: { in: ['ipo', 'IPO'] } }, count: 1 }, 900),

  // ---------------------------------------------------------------- the calendar
  ach('a-day-30', 'common', 'One Month In', '📅', 'Reach day 30.',
    { event: 'day', match: { day: { gte: 30 } }, count: 1 }, 80),
  ach('a-day-90', 'epic', 'Last Day', '🎖️', 'Reach day 90, the last day of the season.',
    { event: 'day', match: { day: { gte: 90 } }, count: 1 }, 650),
];

/** Daily bounty templates: small goals that make sense in any district. The engine picks a few per day. */
export const DAILIES = [
  { id: 'd-three-deals', title: 'Three Deals', desc: 'Close 3 trades today.', icon: '🤝',
    goal: { event: 'pitch', match: { outcome: SOLD() }, count: 3 }, reward: { xp: 40 } },
  { id: 'd-above-fair', title: 'Above Fair', desc: 'Sell 2 goods for at least 5% above fair price.', icon: '📈',
    goal: { event: 'pitch', match: { outcome: SOLD(), gain: { gte: 0.05 } }, count: 2 }, reward: { xp: 50 } },
  { id: 'd-restock', title: 'Restock', desc: 'Buy 3 lots to keep your shelves full.', icon: '📦',
    goal: { event: 'buy', count: 3 }, reward: { xp: 40 } },
  { id: 'd-haggle-day', title: 'Haggle Day', desc: 'Close 2 haggled deals.', icon: '🗣️',
    goal: { event: 'haggle', match: { deal: true }, count: 2 }, reward: { xp: 50 } },
  { id: 'd-buy-low', title: 'Buy Low', desc: 'Haggle a purchase down to the asking price or lower.', icon: '🏷️',
    goal: { event: 'haggle', match: { role: 'buy', deal: true, mult: { lte: 1 } }, count: 1 }, reward: { xp: 40 } },
  { id: 'd-look-first', title: 'Look First', desc: 'Inspect 2 lots before you buy.', icon: '🔍',
    goal: { event: 'inspect', count: 2 }, reward: { xp: 40 } },
  { id: 'd-sharp-eyes', title: 'Sharp Eyes', desc: 'Finish 2 inspections with a score of 70% or better.', icon: '👁️',
    goal: { event: 'inspect', match: { score: { gte: 0.7 } }, count: 2 }, reward: { xp: 50 } },
  { id: 'd-fix-and-flip', title: 'Fix and Flip', desc: 'Repair 2 broken goods.', icon: '🔧',
    goal: { event: 'repair', count: 2 }, reward: { xp: 45 } },
  { id: 'd-dial-it-in', title: 'Dial It In', desc: 'Repair a good at 70% precision or better.', icon: '🎚️',
    goal: { event: 'repair', match: { precision: { gte: 0.7 } }, count: 1 }, reward: { xp: 60 } },
  { id: 'd-beaten-path', title: 'Off the Beaten Path', desc: 'Close 2 sales into uncrowded niches (Creativity Multiplier 1.3 or better).', icon: '🧭',
    goal: { event: 'pitch', match: { outcome: SOLD(), cm: { gte: 1.3 } }, count: 2 }, reward: { xp: 60 } },
  { id: 'd-right-buyer', title: 'Right Buyer', desc: 'Close 2 sales to buyers with a fit of 70% or better.', icon: '🎯',
    goal: { event: 'pitch', match: { outcome: SOLD(), fit: { gte: 0.7 } }, count: 2 }, reward: { xp: 50 } },
  { id: 'd-four-in-a-row', title: 'Four in a Row', desc: 'Reach a deal streak of 4.', icon: '🔥',
    goal: { event: 'streak', match: { n: { gte: 4 } }, count: 1 }, reward: { xp: 60 } },
];
