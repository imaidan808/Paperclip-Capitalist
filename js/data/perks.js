// The twelve Backgrounds (docs/V2_DESIGN.md section 3). Everyone starts with one paperclip and $0; a Background is a build, not a head start.
// `mods` are read through Game.P, aggregated by perkMods(): ADD keys add, MULT keys multiply, MAX keys take the largest, BOOL keys OR together, OBJ keys take the first present.
export const PERKS = {
  connected: {
    id: 'connected', name: 'Well-Connected', icon: '🤝', basis: 'Social capital: "my dad knows a guy".',
    strength: 'Buyers arrive 30% faster and bring 15% bigger budgets.', cost: 'Family obligations: 8% of your cash goes to relatives every 7 days.',
    mods: { leadMult: 1.3, leadBudget: 1.15, familyTax: { rate: 0.08, everyHours: 168 } },
  },
  grad: {
    id: 'grad', name: 'Business-School Grad', icon: '🎓', basis: 'Credentials and theory.',
    strength: 'Free Niche Radar with exact saturation, +1 Capital Sourcing, loan spreads 15% lower, and an alumni network: buyers bring 12% bigger budgets.', cost: 'Student loans: 5% of every profit is garnished until $3,000 is repaid; -1 Ops (theory over practice).',
    mods: { radar: true, fintechBonus: 1, leadBudget: 1.12, spreadAdj: -0.15, opsBonus: -1, garnish: { rate: 0.05, cap: 3000 } },
  },
  trades: {
    id: 'trades', name: 'Licensed Tradesperson', icon: '🔧', basis: 'Skilled labor.',
    strength: '+2 Ops, repairs cost 50% less, broken goods are 20% cheaper to source.', cost: 'Not a salesperson: pitch prices -8% and haggling is harder (buyers have less patience).',
    mods: { opsBonus: 2, repairMult: 0.5, brokenDiscount: 0.2, pitchMult: 0.92, haggleHandicap: 1 },
  },
  immigrant: {
    id: 'immigrant', name: 'Immigrant Hustler', icon: '🧳', basis: 'Diaspora networks and informal credit.',
    strength: 'International lanes +10 points of margin, freight 25% cheaper, a zero-interest Community Circle loan (up to 15% of net worth).', cost: 'Credit-invisible: no bank until net worth $5,000; paperwork means audits come 1.4x as often.',
    mods: { intlBonus: 0.10, freightMult: 0.75, circle: { pct: 0.15 }, bankMinNW: 5000, auditMult: 1.4 },
  },
  veteran: {
    id: 'veteran', name: 'Veteran', icon: '🎖️', basis: 'Discipline and logistics.',
    strength: 'Overhead -25%, macro shocks hit 40% softer, freight 15% faster.', cost: 'Rigid: trend and viral goods sell 20% lower to you (you cannot read fads).',
    mods: { overheadMult: 0.75, shockSoften: 0.4, freightSpeed: 0.15, trendMult: 0.8 },
  },
  heir: {
    id: 'heir', name: 'Legacy Heir', icon: '🏛️', basis: 'Inherited safety nets.',
    strength: 'Once per run the family clears 60% of your debt when you are margin-called, loan spreads 25% lower, the first audit fine is waived, and family friends send buyers who bring 5% bigger budgets.', cost: 'Born on third base: no skill edge (all skills start at 1, no specialty) and you learn 10% slower.',
    mods: { bailout: { uses: 1, fraction: 0.6 }, spreadAdj: -0.25, fineWaive: 1, leadBudget: 1.05, noSpecialty: true, xpMult: 0.9 },
  },
  creator: {
    id: 'creator', name: 'Creator', icon: '📱', basis: 'Audience and virality.',
    strength: 'Trend goods sell 30% higher, and trend buyers appear for anything you hold.', cost: 'Algorithm whiplash: non-trend demand swings by up to 15% every 3 days; a failed pitch costs buyers\' goodwill.',
    mods: { trendMult: 1.3, trendBuyers: 0.35, volatility: 0.15, flopRep: 8 },
  },
  gigger: {
    id: 'gigger', name: 'Side-Hustler', icon: '🛵', basis: 'Gig-economy flexibility.',
    strength: 'Small lots 8% cheaper, +25% XP, pipeline cycles 10% shorter.', cost: 'No safety net: no bank until net worth $2,500; burnout costs you a day of buyers about every 20 days.',
    mods: { lotDiscount: 0.08, xpMult: 1.25, cycleMult: 0.9, bankMinNW: 2500, burnout: { everyDays: 20 } },
  },
  roots: {
    id: 'roots', name: 'Small-Town Roots', icon: '🏡', basis: 'Local reputation.',
    strength: 'Loyal repeat buyers return with 20% bigger budgets and better trust, overhead -15%.', cost: 'Small pond: 30% fewer buyers beyond district 8; freight costs 30% more.',
    mods: { loyalty: 0.2, overheadMult: 0.85, farLeadMult: 0.7, freightMult: 1.3 },
  },
  native: {
    id: 'native', name: 'Digital Native', icon: '💻', basis: 'Online reach.',
    strength: 'Digital goods +10% value, digital buyers appear in any district, lots refresh 25% faster.', cost: 'Scam magnet: 12% of buyers are fraudulent unless you verify them; tool subscriptions cost 1.5% of your cash a month.',
    mods: { digitalMult: 1.1, digitalBuyers: true, lotRefresh: 0.25, scamRate: 0.12, subscription: { rate: 0.015 } },
  },
  second: {
    id: 'second', name: 'Second-Chance Hustler', icon: '🗝️', basis: 'Street smarts, but a record.',
    strength: 'Spots counterfeits (a free warning), +1 inspection probe, 12% cheaper lots in gray-market districts.', cost: 'A record follows you: no bank until net worth $8,000; audit fines are 1.5x.',
    mods: { fakeDetect: true, probeBonus: 1, lotDiscountGray: 0.12, bankMinNW: 8000, fineMult: 1.5 },
  },
  pro: {
    id: 'pro', name: 'Seasoned Pro', icon: '🧭', basis: 'Decades of experience and a mentor.',
    strength: 'Appraisal sense (+2 inspection accuracy), a mentor tip each week, steady hands in haggling.', cost: 'Old school: digital goods -15%, you learn 15% slower, managers cost 10% more.',
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
