// All balance numbers and content live here so an instructor (or a fork) can retune the sim in one place.
export const TOTAL_DAYS = 90;
export const HOURS_PER_DAY = 24;
export const TOTAL_HOURS = TOTAL_DAYS * HOURS_PER_DAY;
export const SEC_PER_HOUR = 7; // at 1x: 6 virtual hours = 42 real seconds (spec: freight run)

// Milestones are the gates of the districts that open a feature: managers and the Bank (district 5), audits (9), enterprise, M&A and IPO (13).
export const MIL = { m1: 1000, m2: 25000, m3: 250000 };
export const MIL_ZONE = { m1: 5, m2: 9, m3: 13 };
export const CM = { min: 0.4, max: 3.14, ref: 1.68, beta: 0.4, pitchBase: 0.6 };
export const FEES = { base: 0.025, crunch: 0.12, digitalRouting: 0.12, exitBrokerage: 0.12 };
// Economy tuning knobs (docs/BALANCE.md, "Economy knobs"). Mutable on purpose: tests/tune.mjs sweeps them against the pacing targets of docs/V2_DESIGN.md section 11.
// What they are for. Repairing a broken lot is the Quick bot's money machine (a restored crate is worth about 3 times what the broken one is, at every stake), so the price of a broken lot is the
// lever on the late game of hand play, and the early game is paid back through the urgent buyers and the supply of buyers and lots:
//   lotDiscHi / lotDiscLo   a sound lot is posted at lotDiscHi of its fair value at Ops 1, 2.5 points less per Ops level, never under lotDiscLo (the Codex's worked examples are written for 97%).
//   brokenLo / brokenSlope  a broken lot is posted at max(brokenLo, 1 - brokenSlope x (Ops - 1)) of its as-is value (the broken crate's own price, 30% of a working one). A NEGATIVE slope is meant:
//                           sellers of wrecks ask for the repair upside, so the better your Ops, the more a wreck costs: x1.00 at Ops 1, x1.42 at Ops 3, x1.63 at Ops 4, x2.05 at Ops 6 (the Tradesperson
//                           then pays 20% less). A restored crate sells at about x3.3 of the as-is price at Ops 5 and above, so a flip returns about +80% at Ops 4 and +35% at Ops 8 before repair, friction and fees.
//                           Before, a wreck cost 0.985 down to 0.9 of its as-is value and a flip returned +200%; the same bot with managers forbidden then ended 5.4 times richer than with them at a decision every 4 hours (27 times on commit 816e7c4).
//   brokenTop / brokenFrom  from the district after brokenFrom (13, Corporate Valley) a wreck costs brokenTop more for each district further out, on top of the price above: x1.10 in district 13, x1.20 in 14,
//                           x1.30 in 15 and x1.40 in 16. Wrecks there are worth tens or hundreds of thousands, and their sellers know what a repaired crate fetches. Without it a bot that decides every two hours and
//                           never hires a manager flipped one wreck after another in districts 15 and 16 (+60% to +100% each, five a day) and ended 4.7 times richer than the same bot with managers (72% of its runs in
//                           district 16, a net worth 10.8 times apart from its 10th to its 90th percentile); with it 0.70 times, 2% and 2.3 (docs/BALANCE.md, Managers and hand play). Nothing below district 13 changes.
//   lotSlots / lotEvery     lots open at once in a district, and how much slower than a district's own lotEvery they come (1.1 = every 1.1 x lotEvery hours). leadEvery is the same for buyers.
//   urgentK / urgentFade    an urgent buyer's budget = fair value x (1 + (0.4 to 2.6) x urgentK x (1 - urgentFade x how far past district 4, over eight districts)): need pays well in the first
//                           districts and nothing at all from district 12 (urgentFade 1). This is what carries the first two weeks now that wrecks are dearer.
//   cycleBase               a manager's cycle in hours at speed 1 (60 hours in Metro Hub at 132). pitchK: buyers pay pitchK of the base pitch price (0.92). margin: see PIPE_RULES.marginBase.
//   pointXp / warnMiss      what a skill point is worth in XP once every skill is at mastery; the share of counterfeits the Second-Chance street sense misses.
export const ECON = {
  lotDiscHi: 0.97, lotDiscLo: 0.84, lotSlots: 4, lotEvery: 1.1, leadEvery: 0.8, cycleBase: 132, pitchK: 0.92, margin: 1,
  brokenLo: 1, brokenSlope: -0.21, brokenTop: 0.1, brokenFrom: 12,
  urgentK: 3, urgentFade: 1,
  pointXp: 120, warnMiss: 0.1,
}; // retuned on 2026-10-28 against commit 816e7c4 (docs/BALANCE.md has the table); change one knob at a time and run tests/balance.mjs at a decision every 2, 4 and 8 hours
export const FMV_BAND = 0.4; // peer-to-peer guardrail: +/-40%
// What a completed swap with a real classmate pays the run. It was a flat 120 XP and a counted swap for any swap at all, so two tabs trading paperclips back and forth maxed every skill in minutes.
// A swap counts (swap total, trade total, experience, quests and the gradebook's engagement) only when it moves at least `minValue` of real value, at most `perDay` a day, once per partner a day;
// its experience is `xpBase` + `xpScale` x log10(1 + the value that came in), at most `xpMax`. The snapshot door (cohort.js) holds a classmate's reported swaps to the same daily bound.
// `appraisal`: what a swap refused on a crate's hidden worth costs, as a share of the value it was refused at (engine _appraisal).
export const SWAPS = { perDay: 3, minValue: 0.5, xpBase: 10, xpScale: 30, xpMax: 120, appraisal: 0.03 };
// A delivered reply is credited as the proposer described it and no better; crates and cash that together are worth less than this share of the description cannot have come through both ends' +/-40% guardrails (1 / 1.4^2 = 0.51).
export const DELIVERY_FLOOR = 0.45;
export const EEI_FLOOR_DEFAULT = 1000; // = Milestone 1. See docs/BALANCE.md: a $0.05 start would otherwise score ~1,000,000x the others
export const BASE_RATE = 0.025; // monthly index; +600 bps in the credit crunch
export const DEBT = { maxDE: 3.0, callDE: 4.5, fireSale: 0.35 };

// Sixteen districts, the asset classes and the buyers live in js/data (docs/V2_DESIGN.md); they are re-exported here so the rest of the code keeps one import.
import { ASSETS } from './data/index.js';
export { ZONES, ASSETS, BUYERS, ZONE_IDS, ZONE_COUNT } from './data/index.js';
export { PERKS, PERK_IDS, perkMods } from './data/perks.js';

// Levels: level = floor(sqrt(xp / LEVEL_XP)) + 1, so level L starts at xpForLevel(L). Each level earns one skill point.
export const LEVEL_XP = 150;
export const xpForLevel = (l) => (l - 1) ** 2 * LEVEL_XP;
export const SKILLS = {
  ops: { id: 'ops', name: 'Operational Engineering', short: 'Ops', blurb: 'Cheaper repairs, better restorations, lower prices on sound lots and lower pipeline friction.' },
  growth: { id: 'growth', name: 'Customer Acquisition Velocity', short: 'Growth', blurb: 'More buyer leads, faster pipeline cycles, cheaper client acquisition, higher pitch prices.' },
  fintech: { id: 'fintech', name: 'Capital Sourcing', short: 'Fintech', blurb: 'Cheaper institutional debt, lower fees, and earlier warnings of macro shocks.' },
};
export const SKILL_MAX = 8;

// A broken asset sells for this fraction of a working one. Asset classes: base price, sc (scarcity), dem (sparse demand by district), dep (depreciation), tags, repair cost.
export const BROKEN_FACTOR = 0.3; // as-is value of a broken asset relative to working

export const PIPE = {
  student: { name: 'Supply-Chain Student', icon: '🎓', hire: 120, royalty: 0.03, margin: 0.052, cycle: 1.3, overhead: 2, cap: 450, blurb: 'Cheap and eager. Slower cycles, learns with experience (+margin).' },
  broker: { name: 'Asset Broker', icon: '🤝', hire: 600, royalty: 0.10, margin: 0.068, cycle: 1.0, overhead: 6, cap: 1000, blurb: 'The classic flipper. Takes a 10% trade royalty.' },
  logistics: { name: 'Logistics Agent', icon: '🚛', hire: 420, royalty: 0.06, margin: 0.055, cycle: 0.8, overhead: 5, cap: 700, blurb: 'Fastest cycles. Also cuts freight cost 20% and damage risk in half.' },
};
// Pipelines scale with a district's gate: a manager in district 13 handles about 31x the money of one in district 5.
// A cycle's gross is allocation x kind margin x ECON.margin x pipeMargin x (Cm / 1.68) x lane. With marginBase 1.15 a balanced niche (Cm 1.68) pays 6.0% (student), 7.8% (broker) or 6.3% (logistics) before costs,
// an empty one (Cm 1.09, nobody else selling) 5.1% to a broker, and the best lane of every district 5 to 16 clears the 2.5% fee, tax, royalty and overhead (tests/audit-engine-core.test.mjs walks them all).
// One number for every district: cycles are shorter and stakes larger further out, but the return per cycle is meant to be the same everywhere (docs/V2_DESIGN.md section 4, tests/audit-engine-core.test.mjs holds
// marginSlope at 0). That makes a manager's return per DAY grow with the district (a cycle is 2.5 times shorter in the Global Exchange than in Metro Hub), on stakes 20 to 130 times larger, so ECON.cycleBase is the
// lever on it: 132 is a cycle 65% longer than the 80 it was, with the return per cycle unchanged. What decides how many runs reach district 16 and how far apart the net worths end is hand play, not the managers:
// see ECON.brokenLo and ECON.brokenTop above (hand play at the top, where a wreck is worth tens of thousands). scaleExp and overheadExp were swept (0.4 to 1.0 and 0 to 0.6) with no effect on the day-90 net worth beyond noise, so they stay.
export const PIPE_RULES = { cycleBase: 48, maxLevel: 8, hireGrowth: 1.7, levelGrowth: 2.5, scaleExp: 0.62, overheadExp: 0.5, marginBase: 1.15, marginSlope: 0 };
export const pipeScale = (zone) => Math.max(1, Math.pow(zone.gate / 1000, PIPE_RULES.scaleExp));
export const pipeMargin = (zone) => Math.max(0.5, PIPE_RULES.marginBase + PIPE_RULES.marginSlope * (zone.id - 5));
export const pipeOverhead = (zone) => Math.max(1, Math.pow(zone.gate / 1000, PIPE_RULES.overheadExp));

export const UPGRADES = {
  jit: { name: 'Just-In-Time (JIT) Inventory', cost: 2500, zone: 5, blurb: 'Pipeline cycles 20% shorter, 50% slower inventory decay, 10% lower overhead. Less capital sits idle.' },
  seo: { name: 'SEO Pipeline Adjustments', cost: 1800, zone: 5, blurb: '+50% buyer lead flow, +8% pipeline margin, 15% cheaper client acquisition.' },
  freight: { name: 'Bulk Freight Discounts', cost: 1200, zone: 5, blurb: 'Freight runs cost 40% less.' },
  research: { name: 'Market Research Suite', cost: 4000, zone: 5, blurb: 'Macro warnings arrive one tier earlier and the Niche Radar shows every underserved market at once.' },
};

export const CLIENTS = {
  smb: { name: 'SMB Account', icon: '🏪', zone: 5, cac: 450, perDay: 55, days: 30, minRunning: 1, max: 6, blurb: 'Local businesses. Light SLA.' },
  corp: { name: 'Corporate Account', icon: '🏢', zone: 5, cac: 4000, perDay: 380, days: 45, minRunning: 2, max: 4, needs: 'm2', b2b: true, blurb: 'Strict SLA: two pipelines must be running every day.' },
  ent: { name: 'Enterprise Account', icon: '🏛️', zone: 13, cac: 40000, perDay: 3200, days: 60, minRunning: 3, max: 3, needs: 'm3', b2b: true, blurb: 'Corporate Valley contracts. Three pipelines must stay live.' },
};

export const LOANS = {
  micro: { name: 'Micro-Business Line', limit: 2500, fee: 0.03, every: 24, spread: 0.095, note: 'Daily compounding, 3% upfront fee. Up to $2,500.' },
  pipeline: { name: 'Automated Pipeline Capital Loan', limitPct: 0.5, fee: 0.05, every: 168, spread: 0.045, note: 'Weekly compounding, 5% origination. Up to 50% of verified asset value.' },
  circle: { name: 'Community Circle', limitPct: 0.15, fee: 0, every: 720, spread: 0, hidden: true, note: 'Zero interest, from people who trust you. Up to 15% of your net worth.' },
  enterprise: { name: 'Enterprise Revolving Credit', limit: 100000, fee: 0, every: 720, spread: 0.025, commit: 0.015, zone: 13, note: 'Monthly compounding, 1.5% monthly commitment fee on the undrawn part. Needs Corporate Valley. Up to $100,000.' },
};

export const AUDIT_THEMES = [
  { title: 'Corporate Transparency Review', text: 'A regulator asks for your beneficial-ownership filing and supplier list.' },
  { title: 'Sales-Tax Nexus Inquiry', text: 'Two states want to know why your city sales were not collected at the register.' },
  { title: 'Worker Classification Check', text: 'Your logistics contractors look suspiciously like employees to the labor board.' },
  { title: 'Inventory Provenance Audit', text: 'A customs agent wants paperwork proving where your pallets came from.' },
  { title: 'Related-Party Transactions Sweep', text: 'Auditors flag swaps with classmates who share your cap table.' },
  { title: 'Data Privacy Assessment', text: 'A privacy officer asks how your e-commerce domain stores customer records.' },
];
export const AUDIT = { fee: 1200, fine: 5000, passChance: 0.15, velocityHit: 0.85, pauseHours: 120, everyDays: 15, deadlineHours: 72 };

// Macro shocks. Phases are relative to the event start (hours). eff keys: demand/price/speed {tags,mult,zones}, fee, rateBps, overhead, repair, intlSlow, freeze
export const EVENTS = {
  tiktok: {
    id: 'tiktok', name: 'The TikTok Arbitrage Surge', day: 15, level: 1, short: 'Demand shock',
    alert: { code: 'MKT-DEM-SRG-15', readout: 'Viral demand is sweeping the consumer-trend sector. A 48-hour hyper-demand window opens at 00:00.',
      vars: ['Local demand for trend goods spikes +400% in every district.', 'Matching pipeline cycles run 60% faster.', 'After 48 hours market fatigue sets in: trend inventory loses 50% of its value for 72 hours.'],
      enforcement: 'No intervention. Sell into the window, then get out before fatigue.' },
    phases: [
      { from: 0, to: 48, eff: { demand: { tags: ['trend'], mult: 5 }, speed: { tags: ['trend'], mult: 1.6 } } },
      { from: 48, to: 120, eff: { price: { tags: ['trend'], mult: 0.5 } } },
    ],
  },
  fed: {
    id: 'fed', name: 'The Fed Taper and Credit Crunch', day: 45, level: 3, short: 'Liquidity shock',
    alert: { code: 'CB-MON-REG-UPD-45', readout: 'Liquidity Crunch Imminent. Restrictive monetary policy adjustments take effect on Virtual Day 45 at 00:00.',
      vars: ['Base corporate borrowing rate spikes from 2.5% to 8.5% (+600 bps).', 'Institutional transaction tax rises from 2.5% to 12.0%.', 'Automated pipeline overhead rises 20% from floating-rate facility drag.'],
      enforcement: 'Credit Action Override Activated. No new commercial bank loans may be drawn until Day 55. Open lines re-amortize at the new index rate within 24 virtual hours.' },
    phases: [
      { from: 0, to: 360, eff: { rateBps: 600, fee: 0.095, overhead: 1.2 } },
      { from: 0, to: 240, eff: { freeze: true } },
    ],
  },
  tariff: {
    id: 'tariff', name: 'The Cross-Border Tariff Lock', day: 75, level: 2, short: 'Supply shock',
    alert: { code: 'TRD-TAR-LCK-75', readout: 'Customs duties lock global freight and international dropshipping channels from Day 75.',
      vars: ['International pipeline cycles slow by 4 virtual days.', 'Asset rehabilitation costs outside the four starter districts rise 45%.', 'Domestic channels and the starter districts are unaffected.'],
      enforcement: 'Move international lanes to domestic channels, or ride out the slow cycles.' },
    phases: [{ from: 0, to: 360, eff: { intlSlow: 96, repair: 1.45 } }],
  },
};
export const ALGO_EVENTS = {
  viral: { name: 'Viral Product Mention', mk: (cls) => ({ name: 'Viral mention: ' + ASSETS[cls].name, phases: [{ from: 0, to: 36, eff: { demand: { cls, mult: 2.5, } } }] }) },
  glut: { name: 'Supply Glut', mk: (cls) => ({ name: 'Supply glut: ' + ASSETS[cls].name, phases: [{ from: 0, to: 72, eff: { demand: { cls, mult: 0.55, } } }] }) },
  scare: { name: 'Regulatory Scare', mk: () => ({ name: 'Regulatory scare: fees up for 48h', phases: [{ from: 0, to: 48, eff: { fee: 0.03 } }] }) },
};
export const WARN_LEAD = { novice: 12, mid: 72, adv: 168 };

export const FRESH = { freightHours: 6, freightCost: 0.045, damageBase: 0.30 };
