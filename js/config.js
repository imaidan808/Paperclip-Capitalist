// All balance numbers and content live here so an instructor (or a fork) can retune the sim in one place.
export const TOTAL_DAYS = 90;
export const HOURS_PER_DAY = 24;
export const TOTAL_HOURS = TOTAL_DAYS * HOURS_PER_DAY;
export const SEC_PER_HOUR = 7; // at 1x: 6 virtual hours = 42 real seconds (spec: freight run)

export const MIL = { m1: 1000, m2: 25000, m3: 250000 };
export const CM = { min: 0.4, max: 3.14, ref: 1.68, beta: 0.4, pitchBase: 0.6 };
export const FEES = { base: 0.025, crunch: 0.12, digitalRouting: 0.12, exitBrokerage: 0.12 };
export const FMV_BAND = 0.4; // peer-to-peer guardrail: +/-40%
export const EEI_FLOOR_DEFAULT = 1000; // = Milestone 1. See docs/BALANCE.md: a $0.05 start would otherwise score ~1,000,000x the others
export const BASE_RATE = 0.025; // monthly index; +600 bps in the credit crunch
export const DEBT = { maxDE: 3.0, callDE: 4.5, fireSale: 0.35 };

export const ZONES = {
  1: { id: 1, name: 'The Scrap Yard', short: 'Scrap Yard', tax: 0, pool: 5000, friction: 0.10, speed: 1.0, auto: false, store: 10, leadEvery: 3, lotEvery: 4, urgent: 0.45, tagline: 'Manual hustle. Zero tax. Thin liquidity.' },
  2: { id: 2, name: 'The Metro Hub', short: 'Metro Hub', tax: 0.075, pool: 100000, friction: 0.125, speed: 2.5, auto: true, store: 18, leadEvery: 3, lotEvery: 4, urgent: 0.12, tagline: 'Regional retail, staffing and the Commercial Bank.' },
  3: { id: 3, name: 'Corporate Valley', short: 'Corporate Valley', tax: 0.15, pool: 2500000, friction: 0.15, speed: 5.0, auto: true, store: 30, leadEvery: 4, lotEvery: 5, urgent: 0.08, tagline: 'Enterprise B2B, deep credit, exits. Governance drag.' },
};

export const SKILLS = {
  ops: { id: 'ops', name: 'Operational Engineering', short: 'Ops', blurb: 'Cheaper repairs, better restorations, lower sourcing prices and pipeline friction.' },
  growth: { id: 'growth', name: 'Customer Acquisition Velocity', short: 'Growth', blurb: 'More buyer leads, faster pipeline cycles, cheaper client acquisition, higher pitch prices.' },
  fintech: { id: 'fintech', name: 'Capital Sourcing', short: 'Fintech', blurb: 'Cheaper institutional debt, lower fees, and earlier warnings of macro shocks.' },
};
export const SKILL_MAX = 8;
export const trainCost = (lvl) => 50 * Math.pow(3, lvl - 1);

export const PROFILES = {
  bootstrapper: {
    id: 'bootstrapper', name: 'The Bootstrapper', icon: '📎', cash: 0.05, startCapital: 0.05, startZone: 1, zones: [1],
    assets: [{ cls: 'paperclip' }], valueMult: 1.25, feeFree: true,
    perk: 'The Hustle Multiplier: +25% efficiency on asset valuation and zero barter-network fees, forever.',
    flaw: 'Severe capital constraints and exposure to early market volatility.',
    start: '$0.05 and one paperclip in the Scrap Yard.',
  },
  venture: {
    id: 'venture', name: 'The Venture-Backed', icon: '🏢', cash: 50000, startCapital: 50000, startZone: 3, zones: [1, 2, 3], assets: [],
    overheadMult: 1.3, liqDelay: 48, creditMult: 2,
    perk: 'Late-stage automation pipelines and deep credit reserves from day one.',
    flaw: 'The Bureaucracy Drag: +30% overhead on automated pipelines and every liquidation settles 2 virtual days late.',
    start: '$50,000 in Corporate Valley.',
  },
  midtier: {
    id: 'midtier', name: 'The Mid-Tier Commercial', icon: '🏬', cash: 5000, startCapital: 5000, startZone: 2, zones: [1, 2], assets: [],
    cacMult: 0.75, taxAdd: 0.02, b2bLockNW: 100000,
    perk: 'Regional retail channels and 25% lower customer acquisition cost.',
    flaw: 'Moderate corporate tax (+2 points) and no heavy B2B enterprise clients until net worth reaches $100,000.',
    start: '$5,000 in the Metro Hub.',
  },
};

// Asset classes. dem = local demand 0-10 in zones [1,2,3]. 0 means no market there.
// Utility = scarcity x demand - depreciation. repair = base repair cost when broken (Ops level 1).
export const ASSETS = {
  paperclip: { name: 'Rusty Paperclip', icon: '📎', base: 0.05, sc: 2, dem: [4, 1, 0], dep: 1, tags: ['tool', 'office'] },
  pen: { name: 'Vintage Fountain Pen', icon: '🖋️', base: 9, sc: 9, dem: [10, 8, 5], dep: 1, tags: ['prestige', 'office'] },
  radio: { name: 'Vintage Radio', icon: '📻', base: 60, sc: 7, dem: [7, 5, 2], dep: 2, tags: ['retro', 'electronics'], repair: 25 },
  bike: { name: 'Road Bike', icon: '🚲', base: 240, sc: 5, dem: [8, 6, 2], dep: 3, tags: ['vehicle', 'consumer'], repair: 90 },
  scrap: { name: 'Scrap Metal Lot', icon: '🔩', base: 150, sc: 3, dem: [9, 5, 1], dep: 1, tags: ['scrap', 'industrial'] },
  sneakers: { name: 'Limited Sneaker Lot', icon: '👟', base: 420, sc: 6, dem: [6, 9, 5], dep: 5, tags: ['trend', 'consumer'] },
  textbooks: { name: 'Pallet: Unused Textbooks', icon: '📚', base: 640, sc: 4, dem: [5, 8, 6], dep: 2, tags: ['paper', 'training'] },
  gadgets: { name: 'Viral Gadget Pallet', icon: '🔮', base: 900, sc: 6, dem: [6, 9, 5], dep: 6, tags: ['trend', 'electronics'], repair: 150 },
  electronics: { name: 'Pallet: Electronics', icon: '🔌', base: 3800, sc: 6, dem: [3, 8, 7], dep: 3, tags: ['electronics', 'b2b'], repair: 600 },
  domain: { name: 'Premier E-Commerce Domain', icon: '🌐', base: 3900, sc: 8, dem: [1, 7, 9], dep: 1, tags: ['digital', 'b2b'] },
  van: { name: 'Fleet Van Contract', icon: '🚐', base: 5000, sc: 5, dem: [2, 8, 8], dep: 3, tags: ['vehicle', 'b2b'], repair: 1200 },
  saas: { name: 'SaaS Subscription Book', icon: '💾', base: 26000, sc: 7, dem: [0, 5, 9], dep: 2, tags: ['digital', 'b2b'] },
  fleet: { name: 'Delivery Fleet (10 vans)', icon: '🚚', base: 62000, sc: 6, dem: [0, 6, 9], dep: 3, tags: ['vehicle', 'b2b'], repair: 9000 },
  franchise: { name: 'Franchise License', icon: '🏷️', base: 150000, sc: 8, dem: [0, 3, 9], dep: 1, tags: ['b2b', 'franchise'] },
  datacenter: { name: 'Server Rack Colocation', icon: '🗄️', base: 420000, sc: 7, dem: [0, 0, 9], dep: 2, tags: ['digital', 'b2b', 'infra'], repair: 40000 },
};
export const BROKEN_FACTOR = 0.3; // as-is value of a broken asset relative to working

// Buyers. like = tag -> affinity 0..1. pop = how many players find them first (drives the "obvious channel").
// holds = goods a Scrap Yard buyer can barter with. budget = [low, high] willingness to pay.
export const BUYERS = {
  student: { zone: 1, name: 'Stressed Student', icon: '🎒', pop: 0.9, like: { tool: 1, office: 0.7, paper: 0.7, prestige: 0.55 }, budget: [1, 80], holds: [{ cls: 'paperclip' }, { cls: 'pen' }, { cls: 'radio' }] },
  barista: { zone: 1, name: 'Cafe Barista', icon: '☕', pop: 0.5, like: { office: 0.5, consumer: 0.35, paper: 0.3, prestige: 0.2 }, budget: [1, 40], holds: [{ cls: 'paperclip' }, { cls: 'pen' }] },
  mechanic: { zone: 1, name: 'Yard Mechanic', icon: '🔧', pop: 0.7, like: { vehicle: 0.9, industrial: 0.85, scrap: 0.9, tool: 0.2, electronics: 0.3 }, budget: [10, 1200], holds: [{ cls: 'bike', cond: 'broken' }, { cls: 'scrap' }, { cls: 'radio', cond: 'broken' }] },
  collector: { zone: 1, name: 'Flea-Market Collector', icon: '🧐', pop: 0.6, like: { retro: 1, prestige: 0.85, electronics: 0.4, consumer: 0.2 }, budget: [20, 2500], holds: [{ cls: 'radio' }, { cls: 'pen' }, { cls: 'bike' }, { cls: 'sneakers' }] },
  scrapper: { zone: 1, name: 'Scrap Broker', icon: '🏗️', pop: 0.8, like: { scrap: 1, industrial: 0.8, vehicle: 0.4 }, budget: [30, 6000], holds: [{ cls: 'scrap' }, { cls: 'electronics', cond: 'broken' }, { cls: 'gadgets' }, { cls: 'textbooks' }] },
  cyclist: { zone: 1, name: 'Bike Hobbyist', icon: '🚴', pop: 0.4, like: { vehicle: 0.8, consumer: 0.6, trend: 0.3 }, budget: [30, 1500], holds: [{ cls: 'bike' }, { cls: 'sneakers' }, { cls: 'radio' }] },
  bookstore: { zone: 2, name: 'Campus Bookstore', icon: '📖', pop: 0.95, like: { paper: 1, training: 0.5, office: 0.3 }, budget: [200, 6000] },
  trainer: { zone: 2, name: 'Corporate Training Provider', icon: '🎓', pop: 0.25, like: { training: 1, paper: 0.8, b2b: 0.5, office: 0.4 }, budget: [300, 20000] },
  boutique: { zone: 2, name: 'Trend Boutique', icon: '🛍️', pop: 0.8, like: { trend: 1, consumer: 0.85, prestige: 0.5 }, budget: [200, 15000] },
  smelog: { zone: 2, name: 'SME Logistics Co.', icon: '📦', pop: 0.5, like: { vehicle: 1, b2b: 0.7, industrial: 0.5 }, budget: [500, 40000] },
  etailer: { zone: 2, name: 'E-Tailer', icon: '🛒', pop: 0.85, like: { electronics: 1, trend: 0.6, digital: 0.5 }, budget: [500, 50000] },
  recruiter: { zone: 2, name: 'Corporate Recruiter', icon: '👔', pop: 0.7, like: { prestige: 1, office: 0.6 }, budget: [100, 8000] },
  freelancer: { zone: 2, name: 'Tech Freelancer', icon: '💻', pop: 0.45, like: { electronics: 0.9, digital: 0.7, tool: 0.2 }, budget: [100, 12000] },
  entIT: { zone: 3, name: 'Enterprise IT Dept.', icon: '🖥️', pop: 0.9, like: { digital: 1, electronics: 0.8, b2b: 0.8, infra: 1 }, budget: [5000, 900000] },
  holdco: { zone: 3, name: 'Holding Company', icon: '🏦', pop: 0.6, like: { b2b: 1, vehicle: 0.6, franchise: 1, infra: 0.5 }, budget: [10000, 2500000] },
  vcstart: { zone: 3, name: 'VC-Backed Startup', icon: '🚀', pop: 0.4, like: { digital: 1, training: 0.4, electronics: 0.5 }, budget: [3000, 400000] },
  franchisor: { zone: 3, name: 'Franchise Group', icon: '🍔', pop: 0.35, like: { franchise: 1, b2b: 0.7, vehicle: 0.5 }, budget: [20000, 2500000] },
};

export const PIPE = {
  student: { name: 'Supply-Chain Student', icon: '🎓', hire: 120, royalty: 0.03, margin: 0.052, cycle: 1.3, overhead: 2, cap: 450, blurb: 'Cheap and eager. Slower cycles, learns with experience (+margin).' },
  broker: { name: 'Asset Broker', icon: '🤝', hire: 600, royalty: 0.10, margin: 0.068, cycle: 1.0, overhead: 6, cap: 1000, blurb: 'The classic flipper. Takes a 10% trade royalty.' },
  logistics: { name: 'Logistics Agent', icon: '🚛', hire: 420, royalty: 0.06, margin: 0.055, cycle: 0.8, overhead: 5, cap: 700, blurb: 'Fastest cycles. Also cuts freight cost 20% and damage risk in half.' },
};
export const PIPE_RULES = { zoneScale: { 2: 1, 3: 14 }, zoneMargin: { 2: 1, 3: 0.5 }, overheadScale: { 2: 1, 3: 9 }, max: { 2: 4, 3: 6 }, cycleBase: 48, maxLevel: 8, hireGrowth: 1.7, levelGrowth: 2.5 };

export const UPGRADES = {
  jit: { name: 'Just-In-Time (JIT) Inventory', cost: 2500, zone: 2, blurb: 'Pipeline cycles 20% shorter, 50% slower inventory decay, 10% lower overhead. Less capital sits idle.' },
  seo: { name: 'SEO Pipeline Adjustments', cost: 1800, zone: 2, blurb: '+50% buyer lead flow, +8% pipeline margin, 15% cheaper client acquisition.' },
  freight: { name: 'Bulk Freight Discounts', cost: 1200, zone: 2, blurb: 'Freight runs cost 40% less.' },
  research: { name: 'Market Research Suite', cost: 4000, zone: 2, blurb: 'Macro warnings arrive one tier earlier and the Niche Radar shows every underserved market at once.' },
};

export const CLIENTS = {
  smb: { name: 'SMB Account', icon: '🏪', zone: 2, cac: 450, perDay: 55, days: 30, minRunning: 1, max: 6, blurb: 'Local businesses. Light SLA.' },
  corp: { name: 'Corporate Account', icon: '🏢', zone: 2, cac: 4000, perDay: 380, days: 45, minRunning: 2, max: 4, needs: 'm2', b2b: true, blurb: 'Strict SLA: two pipelines must be running every day.' },
  ent: { name: 'Enterprise Account', icon: '🏛️', zone: 3, cac: 40000, perDay: 3200, days: 60, minRunning: 3, max: 3, needs: 'm3', b2b: true, blurb: 'Zone 3 contracts. Three pipelines must stay live.' },
};

export const LOANS = {
  micro: { name: 'Micro-Business Line', limit: 2500, fee: 0.03, every: 24, spread: 0.095, note: 'Daily compounding, 3% upfront fee. Up to $2,500.' },
  pipeline: { name: 'Automated Pipeline Capital Loan', limitPct: 0.5, fee: 0.05, every: 168, spread: 0.045, note: 'Weekly compounding, 5% origination. Up to 50% of verified asset value.' },
  enterprise: { name: 'Enterprise Revolving Credit', limit: 100000, fee: 0, every: 720, spread: 0.025, commit: 0.015, zone: 3, note: 'Monthly compounding, 1.5% monthly commitment fee on the undrawn part. Needs Zone 3. Up to $100,000.' },
};

export const AUDIT_THEMES = [
  { title: 'Corporate Transparency Review', text: 'A regulator asks for your beneficial-ownership filing and supplier list.' },
  { title: 'Sales-Tax Nexus Inquiry', text: 'Two states want to know why your Metro Hub sales were not collected at the register.' },
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
      vars: ['Local demand for trend goods in Zones 1 and 2 spikes +400%.', 'Matching pipeline cycles run 60% faster.', 'After 48 hours market fatigue sets in: trend inventory loses 50% of its value for 72 hours.'],
      enforcement: 'No intervention. Sell into the window, then get out before fatigue.' },
    phases: [
      { from: 0, to: 48, eff: { demand: { tags: ['trend'], mult: 5, zones: [1, 2] }, speed: { tags: ['trend'], mult: 1.6, zones: [1, 2] } } },
      { from: 48, to: 120, eff: { price: { tags: ['trend'], mult: 0.5, zones: [1, 2] } } },
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
      vars: ['International pipeline cycles slow by 4 virtual days.', 'Asset rehabilitation costs outside the Scrap Yard rise 45%.', 'Domestic channels and Scrap Yard recycling are unaffected.'],
      enforcement: 'Move international lanes to domestic channels, or ride out the slow cycles.' },
    phases: [{ from: 0, to: 360, eff: { intlSlow: 96, repair: 1.45 } }],
  },
};
export const ALGO_EVENTS = {
  viral: { name: 'Viral Product Mention', mk: (cls) => ({ name: 'Viral mention: ' + ASSETS[cls].name, phases: [{ from: 0, to: 36, eff: { demand: { cls, mult: 2.5, zones: [1, 2, 3] } } }] }) },
  glut: { name: 'Supply Glut', mk: (cls) => ({ name: 'Supply glut: ' + ASSETS[cls].name, phases: [{ from: 0, to: 72, eff: { demand: { cls, mult: 0.55, zones: [1, 2, 3] } } }] }) },
  scare: { name: 'Regulatory Scare', mk: () => ({ name: 'Regulatory scare: fees up for 48h', phases: [{ from: 0, to: 48, eff: { fee: 0.03 } }] }) },
};
export const WARN_LEAD = { novice: 12, mid: 72, adv: 168 };

export const FRESH = { freightHours: 6, freightCost: 0.045, damageBase: 0.30 };
