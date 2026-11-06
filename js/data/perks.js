// The twelve Backgrounds (docs/V2_DESIGN.md section 3). Everyone starts with one paperclip and $0; a Background is a build, not a head start.
// `gain` and `loss` are the card's one-line headlines; `strength` and `cost` carry the exact numbers (shown on hover and focus, and in the player's build).
// `mods` are read through Game.P, aggregated by perkMods(): ADD keys add, MULT keys multiply, MAX keys take the largest, BOOL keys OR together, OBJ keys take the first present.
export const PERKS = {
  connected: {
    id: 'connected', name: 'Well-Connected', basis: 'Social capital: "my dad knows a guy".',
    gain: 'Faster buyers, bigger budgets', loss: 'Family takes 8% of cash weekly',
    strength: 'Buyers arrive 30% faster and bring 15% bigger budgets.', cost: 'Relatives take 8% of your cash every 7 days.',
    mods: { leadMult: 1.3, leadBudget: 1.15, familyTax: { rate: 0.08, everyHours: 168 } },
  },
  grad: {
    id: 'grad', name: 'Business-School Grad', basis: 'Credentials and theory.',
    gain: 'Niche Radar, cheaper loans', loss: 'Student loans, 1 less Ops',
    strength: 'Free Niche Radar with exact saturation, +1 Capital Sourcing, loan spreads 15% lower, and buyers bring 12% bigger budgets.', cost: '5% of every profit goes to student loans until $3,000 is repaid; -1 Ops.',
    mods: { radar: true, fintechBonus: 1, leadBudget: 1.12, spreadAdj: -0.15, opsBonus: -1, garnish: { rate: 0.05, cap: 3000 } },
  },
  trades: {
    id: 'trades', name: 'Licensed Tradesperson', basis: 'Skilled labor.',
    gain: '+2 Ops, half-price repairs', loss: 'Weaker pitches and haggling',
    strength: '+2 Ops, repairs cost 50% less, broken goods are 20% cheaper to source.', cost: 'Pitch prices are 8% lower, and every haggle has one round fewer.',
    mods: { opsBonus: 2, repairMult: 0.5, brokenDiscount: 0.2, pitchMult: 0.92, haggleHandicap: 1 },
  },
  immigrant: {
    id: 'immigrant', name: 'Immigrant Hustler', basis: 'Diaspora networks and informal credit.',
    gain: 'Cheap freight, better margins abroad', loss: 'No bank at first, more audits',
    strength: 'International lanes earn 1.4x the domestic margin instead of 1.3x, freight 25% cheaper, and a zero-interest Community Circle loan up to 15% of net worth.', cost: 'No bank until net worth reaches $5,000, and audits come 1.4x as often.',
    mods: { intlBonus: 0.10, freightMult: 0.75, circle: { pct: 0.15 }, bankMinNW: 5000, auditMult: 1.4 },
  },
  veteran: {
    id: 'veteran', name: 'Veteran', basis: 'Discipline and logistics.',
    gain: 'Low overhead, softer shocks', loss: 'Misreads fads and viral goods',
    strength: 'Manager overhead 25% lower, macro shocks hit 40% softer, freight 15% faster.', cost: 'Trend goods sell 20% lower to you.',
    mods: { overheadMult: 0.75, shockSoften: 0.4, freightSpeed: 0.15, trendMult: 0.8 },
  },
  heir: {
    id: 'heir', name: 'Legacy Heir', basis: 'Inherited safety nets.',
    gain: 'Family bail-out, cheaper loans', loss: 'No skill edge, slower learning',
    strength: 'Once per run the family clears 60% of your debt at a margin call. Loan spreads are 25% lower, the first audit fine is waived, and buyers bring 5% bigger budgets.', cost: 'No specialty (all skills start at 1), and you learn 10% slower.',
    mods: { bailout: { uses: 1, fraction: 0.6 }, spreadAdj: -0.25, fineWaive: 1, leadBudget: 1.05, noSpecialty: true, xpMult: 0.9 },
  },
  creator: {
    id: 'creator', name: 'Creator', basis: 'Audience and virality.',
    gain: 'Trend goods sell 30% higher', loss: 'Demand swings, failed pitches hurt',
    strength: 'Trend goods sell 30% higher, and trend buyers appear for anything you hold.', cost: 'Non-trend demand swings up to 15% every 3 days. A rejected or no-gain pitch halves buyer arrivals for 2 days.',
    mods: { trendMult: 1.3, trendBuyers: 0.35, volatility: 0.15, flopRep: 8 },
  },
  gigger: {
    id: 'gigger', name: 'Side-Hustler', basis: 'Gig-economy flexibility.',
    gain: 'Cheap small lots, +25% XP', loss: 'No bank at first, burnout days',
    strength: 'Small lots 8% cheaper, +25% XP, manager cycles 10% shorter.', cost: 'No bank until net worth reaches $2,500, and a burnout day with no buyers every 20 days.',
    mods: { lotDiscount: 0.08, xpMult: 1.25, cycleMult: 0.9, bankMinNW: 2500, burnout: { everyDays: 20 } },
  },
  roots: {
    id: 'roots', name: 'Small-Town Roots', basis: 'Local reputation.',
    gain: 'Loyal buyers, low overhead', loss: 'Fewer far buyers, dearer freight',
    strength: 'Repeat buyers return with up to 20% bigger budgets, and manager overhead is 15% lower.', cost: '30% fewer buyers beyond district 8, and freight costs 30% more.',
    mods: { loyalty: 0.2, overheadMult: 0.85, farLeadMult: 0.7, freightMult: 1.3 },
  },
  native: {
    id: 'native', name: 'Digital Native', basis: 'Online reach.',
    gain: 'Digital goods sell anywhere', loss: 'Fake buyers, subscription fees',
    strength: 'Digital goods +10% value, digital buyers appear in any district, lots refresh 25% faster.', cost: '12% of buyers are fraudulent (verifying costs 1% of their budget). Tool subscriptions take 1.5% of your cash a month.',
    mods: { digitalMult: 1.1, digitalBuyers: true, lotRefresh: 0.25, scamRate: 0.12, subscription: { rate: 0.015 } },
  },
  second: {
    id: 'second', name: 'Second-Chance Hustler', basis: 'Street smarts, but a record.',
    gain: 'Spots fakes, cheap gray-market lots', loss: 'No bank at first, harsher fines',
    strength: 'Most counterfeit lots carry a warning, +1 inspection probe, lots 12% cheaper in gray-market districts.', cost: 'No bank until net worth reaches $8,000, and audit fines are 1.5x.',
    mods: { fakeDetect: true, probeBonus: 1, lotDiscountGray: 0.12, bankMinNW: 8000, fineMult: 1.5 },
  },
  pro: {
    id: 'pro', name: 'Seasoned Pro', basis: 'Decades of experience and a mentor.',
    gain: 'Sharp appraisal, weekly mentor tip', loss: 'Slow learner, dearer managers',
    strength: 'More accurate inspections, a mentor tip each week, and advice at every haggle step.', cost: 'You learn 15% slower, managers cost 10% more, digital goods -15%.',
    mods: { inspectBonus: 2, mentor: true, haggleAssist: 1, digitalMult: 0.85, xpMult: 0.85, managerCost: 1.1 },
  },
};
export const PERK_IDS = Object.keys(PERKS);
export const MULT_KEYS = ['leadMult', 'leadBudget', 'pitchMult', 'repairMult', 'feeMult', 'overheadMult', 'cycleMult', 'freightMult', 'trendMult', 'digitalMult', 'xpMult', 'fineMult', 'auditMult', 'farLeadMult', 'managerCost'];
export const MAX_KEYS = ['bankMinNW'];
export const ADD_KEYS = ['brokenDiscount', 'opsBonus', 'growthBonus', 'fintechBonus', 'spreadAdj', 'freightSpeed', 'intlBonus', 'shockSoften', 'trendBuyers', 'lotDiscount', 'lotDiscountGray', 'lotRefresh',
  'scamRate', 'volatility', 'probeBonus', 'inspectBonus', 'haggleHandicap', 'haggleAssist', 'loyalty', 'flopRep', 'fineWaive', 'specialtyBonus'];
export const BOOL_KEYS = ['radar', 'fakeDetect', 'noSpecialty', 'mentor', 'digitalBuyers'];
export const OBJ_KEYS = ['garnish', 'familyTax', 'bailout', 'circle', 'subscription', 'burnout'];

/** Aggregate the mods of the chosen Backgrounds. Absent numeric keys read as neutral (0 for adders, 1 for multipliers). */
export function perkMods(ids = []) {
  const m = {};
  for (const k of MULT_KEYS) m[k] = 1;
  for (const k of ADD_KEYS) m[k] = 0;
  for (const k of MAX_KEYS) m[k] = 0;
  for (const k of BOOL_KEYS) m[k] = false;
  for (const id of ids) {
    const p = PERKS[id];
    if (!p) continue;
    for (const [k, v] of Object.entries(p.mods)) {
      if (MULT_KEYS.includes(k)) m[k] *= v;
      else if (MAX_KEYS.includes(k)) m[k] = Math.max(m[k] ?? 0, v);
      else if (BOOL_KEYS.includes(k)) m[k] = m[k] || v;
      else if (OBJ_KEYS.includes(k)) m[k] = m[k] ?? { ...v };
      else m[k] = (m[k] ?? 0) + v;
    }
  }
  return m;
}
/** All 66 unordered pairs of Backgrounds. */
export const PERK_PAIRS = PERK_IDS.flatMap((a, i) => PERK_IDS.slice(i + 1).map((b) => [a, b]));
