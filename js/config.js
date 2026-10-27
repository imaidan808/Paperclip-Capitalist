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
export const FMV_BAND = 0.4; // peer-to-peer guardrail: +/-40%
export const EEI_FLOOR_DEFAULT = 1000; // = Milestone 1. See docs/BALANCE.md: a $0.05 start would otherwise score ~1,000,000x the others
export const BASE_RATE = 0.025; // monthly index; +600 bps in the credit crunch
export const DEBT = { maxDE: 3.0, callDE: 4.5, fireSale: 0.35 };

// Sixteen districts, the asset classes and the buyers live in js/data (docs/V2_DESIGN.md); they are re-exported here so the rest of the code keeps one import.
export { ZONES, ASSETS, BUYERS, ZONE_IDS, ZONE_COUNT } from './data/index.js';
export { PERKS, PERK_IDS, perkMods } from './data/perks.js';

export const SKILLS = {
  ops: { id: 'ops', name: 'Operational Engineering', short: 'Ops', blurb: 'Cheaper repairs, better restorations, lower sourcing prices and pipeline friction.' },
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
// Pipelines scale with a district's gate: a manager in district 13 handles about 27x the money of one in district 5.
export const PIPE_RULES = { cycleBase: 48, maxLevel: 8, hireGrowth: 1.7, levelGrowth: 2.5 };
export const pipeScale = (zone) => Math.max(1, Math.pow(zone.gate / 1000, 0.62));
export const pipeMargin = (zone) => Math.max(0.5, 1 - 0.045 * (zone.id - 5));
export const pipeOverhead = (zone) => Math.max(1, Math.pow(zone.gate / 1000, 0.5));

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
  { title: 'Worker Classification Check', text: 'Your logistics contractors look suspiciously like employees to the labour board.' },
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
