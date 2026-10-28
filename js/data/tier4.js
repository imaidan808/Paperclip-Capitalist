// Tier 4: the endgame. Districts 13-16, where the player stops being a trader and becomes an institution.
// Contract: docs/V2_DESIGN.md sections 4, 4.1, 5 and 13; vocabulary and validator: js/data/schema.js.
//
//   13 Corporate Valley    enterprise clients; M&A and IPO preparation        teaches enterprise-sales
//   14 Financial District  credit markets: spreads fall, leverage cuts both   teaches leverage-risk
//   15 Real Estate Row     rent yields, foreclosure auctions                  teaches asset-cash-flow
//   16 Global Exchange     world markets: price gaps are arbitrage            teaches arbitrage-at-scale
//
// Pure data, no imports, no randomness. Prices follow market.js: fair = base * (0.5 + (sc * dem - dep) / 100), so the same
// good is dearer where demand is high and cheaper where it is thin; that gap is what the last district is about.
// Numbers follow section 4.1 (tax, friction, speed, store, pool, urgent) except where a comment says otherwise.

export const zones = {
  13: {
    id: 13, name: 'Corporate Valley', short: 'Corp. Valley', icon: '🏢',
    blurb: 'Glass towers, buying committees and big tickets. Enterprise clients pay richly under long contracts: learn to sell to a room, not a person.',
    teaches: 'enterprise-sales', theme: 'corporate', tier: 4,
    gate: 250000, scale: 90000, tax: 0.126, friction: 0.148, pool: 2500000, speed: 4.6, store: 30,
    leadEvery: 3, lotEvery: 4, urgent: 0.076, auto: true, plots: 4,
    palette: ['#2b6cb0', '#cfeaff'],
    rules: { enterprise: true },
    bonus: { creditLimitMult: 1.5 },
  },
  14: {
    id: 14, name: 'Financial District', short: 'Finance', icon: '💹',
    blurb: 'Banks, funds and treasurers buy paper, not products. Loan spreads fall here, and leverage becomes your sharpest weapon and your biggest risk.',
    teaches: 'leverage-risk', theme: 'finance', tier: 4,
    gate: 500000, scale: 180000, tax: 0.1355, friction: 0.152, pool: 5000000, speed: 4.9, store: 32,
    leadEvery: 3, lotEvery: 4, urgent: 0.071, auto: true, plots: 4,
    palette: ['#1f6b4f', '#0c1a24'],
    // No signature key is required here: the weapon is the -20% spread bonus and the Bank. Forged invoices and
    // misdescribed loan books are the paper world's counterfeits, so due diligence still pays.
    rules: { fakes: 0.06 },
    bonus: { spreadMult: 0.8 },
  },
  15: {
    id: 15, name: 'Real Estate Row', short: 'Real Estate', icon: '🏘️',
    blurb: 'Property pays rent every day you hold it. Tickets are big, a quarter of the lots are foreclosure auctions, and patience is the whole strategy.',
    teaches: 'asset-cash-flow', theme: 'realty', tier: 4,
    gate: 1000000, scale: 400000, tax: 0.145, friction: 0.156, pool: 10000000, speed: 5.2, store: 34,
    // Foreclosure sales are the appraisal dispute in game form: a quarter of lots are auctions. Fewer lots refresh (5) and
    // plots are scarce (3), because land is.
    leadEvery: 3, lotEvery: 5, urgent: 0.065, auto: true, plots: 3,
    palette: ['#b8553a', '#f0d2a8'],
    rules: { rent: true, yield: true, auction: 0.25 },
    bonus: { rentMult: 1.25 },
  },
  16: {
    id: 16, name: 'Global Exchange', short: 'Exchange', icon: '🌐',
    blurb: 'Gems, art and cargo trade on every continent at different prices. Spot the gap, pay the friction, and exit big.',
    teaches: 'arbitrage-at-scale', theme: 'exchange', tier: 4,
    gate: 2500000, scale: 1000000, tax: 0.1545, friction: 0.16, pool: 25000000, speed: 5.5, store: 36,
    // Gray-market luxury is arbitrage by another name (parallel imports), so gray is on and counterfeits are common: a tenth of
    // lots times the asset's fakeRisk. Customs makes the gap pay for its own freight. Auction houses take 30% of lots.
    leadEvery: 3, lotEvery: 5, urgent: 0.06, auto: true, plots: 3,
    palette: ['#c8a02c', '#14110a'],
    rules: { arbitrage: true, gray: true, fakes: 0.1, customs: 0.15, auction: 0.3 },
    bonus: { exitMult: 1.1 },
  },
};

export const assets = {
  // ------------------------------------------------------------------ 13 Corporate Valley (scale $90k)
  franchise: {
    name: 'Master Franchise License (Regional Territory)', icon: '🏷️',
    base: 120000, sc: 8, dep: 1, dem: { 13: 9, 16: 3 }, tags: ['b2b', 'franchise'], yield: 0.0035,
  },
  erpBook: {
    name: 'ERP License and Maintenance Book', icon: '🗂️',
    base: 85000, sc: 7, dep: 1, dem: { 13: 9, 14: 3 }, tags: ['digital', 'b2b'], yield: 0.0055,
  },
  hospitalPurchasing: {
    name: 'Hospital Group Purchasing Contract', icon: '📋',
    base: 70000, sc: 6, dep: 1, dem: { 13: 8, 9: 3 }, tags: ['b2b', 'medical'],
  },
  carveOut: {
    // M&A in one lot: a division the parent wants gone. A broken one is a distressed unit; repair is the turnaround.
    name: 'Corporate Carve-Out: Packaging Division', icon: '📤',
    base: 260000, sc: 5, dep: 2, dem: { 13: 8, 14: 3 }, tags: ['industrial', 'b2b'], repair: 52000,
  },

  // ------------------------------------------------------------------ 14 Financial District (scale $180k)
  invoicePool: {
    // Bought under par, paid at par when the invoices clear: the profit is the discount, so no daily yield. Forgery is the risk.
    name: 'Invoice Pool (Factored Receivables)', icon: '🧾',
    base: 150000, sc: 5, dep: 2, dem: { 14: 9, 13: 5 }, tags: ['finance', 'b2b'], fakeRisk: 1,
  },
  loanBook: {
    name: 'Consumer Installment Loan Book', icon: '💳',
    base: 240000, sc: 6, dep: 1, dem: { 14: 9, 5: 3 }, tags: ['finance', 'consumer'], yield: 0.004, fakeRisk: 0.5,
  },
  muniBonds: {
    name: 'Municipal Infrastructure Bond Lot', icon: '📜',
    base: 350000, sc: 4, dep: 1, dem: { 14: 9, 16: 5 }, tags: ['finance', 'infra'], yield: 0.0035, fakeRisk: 0.05,
  },
  royaltyNote: {
    name: 'Streaming Royalty Note', icon: '📀',
    base: 130000, sc: 7, dep: 1, dem: { 14: 7, 12: 3 }, tags: ['finance', 'ip', 'media'], yield: 0.004, fakeRisk: 0.4,
  },
  insuranceBook: {
    name: 'Homeowners Insurance Book (Renewal Rights)', icon: '🛡️',
    base: 420000, sc: 6, dep: 1, dem: { 14: 8, 15: 3 }, tags: ['finance', 'home'], yield: 0.0035, fakeRisk: 0.1,
  },

  // ------------------------------------------------------------------ 15 Real Estate Row (scale $400k)
  logisticsWarehouse: {
    name: 'Logistics Warehouse (180,000 sq ft)', icon: '📦',
    base: 320000, sc: 6, dep: 1, dem: { 15: 9, 13: 3 }, tags: ['realty', 'industrial'], yield: 0.0036, repair: 70000,
  },
  apartmentBlock: {
    name: 'Apartment Block (24 Units)', icon: '🏠',
    base: 450000, sc: 7, dep: 1, dem: { 15: 9, 14: 3 }, tags: ['realty', 'home'], yield: 0.004, repair: 112000,
  },
  officeFloors: {
    name: 'Downtown Office Floors (Three Leased)', icon: '🏬',
    base: 800000, sc: 7, dep: 1, dem: { 15: 8, 14: 3 }, tags: ['realty', 'b2b', 'prestige'], yield: 0.0035, repair: 160000,
  },
  datacenter: {
    name: 'Server Rack Colocation Hall', icon: '🗄️',
    base: 520000, sc: 7, dep: 1, dem: { 15: 9, 13: 3 }, tags: ['digital', 'b2b', 'infra'], yield: 0.0055, repair: 95000,
  },
  cellTowers: {
    name: 'Cell-Tower Ground-Lease Portfolio (46 Sites)', icon: '📡',
    base: 260000, sc: 7, dep: 1, dem: { 15: 8, 16: 3 }, tags: ['infra', 'realty'], yield: 0.0036, repair: 45000,
  },

  // ------------------------------------------------------------------ 16 Global Exchange (scale $1M)
  diamondParcel: {
    // Synthetics are the risk; a chipped stone needs recutting.
    name: 'Certified Polished Diamond Parcel', icon: '💎',
    base: 800000, sc: 9, dep: 1, dem: { 16: 10, 15: 3 }, tags: ['gem', 'luxury'], fakeRisk: 1, repair: 160000,
  },
  watchVault: {
    // The hype market: limited steel sports watches move on trend as much as on craft, so Creators and Veterans feel it differently.
    name: 'Swiss Watch Collection (12 Pieces)', icon: '💼',
    base: 380000, sc: 8, dep: 1, dem: { 16: 9, 15: 3 }, tags: ['luxury', 'collectible', 'trend'], fakeRisk: 0.9, repair: 57000,
  },
  postwarCanvas: {
    name: 'Post-War Canvas (Provenance on File)', icon: '🖼️',
    base: 1800000, sc: 9, dep: 1, dem: { 16: 9, 13: 2 }, tags: ['luxury', 'collectible'], fakeRisk: 1, repair: 450000,
  },
  copperCargo: {
    // Warehouse-receipt fraud is a real copper story, so the receipts get a fakeRisk.
    name: 'Copper Cathode Cargo (100 Tonnes)', icon: '🛳️',
    base: 780000, sc: 5, dep: 1, dem: { 16: 8, 13: 3 }, tags: ['industrial', 'bulk', 'energy'], fakeRisk: 0.5,
  },
};

export const buyers = {
  // ------------------------------------------------------------------ 13 Corporate Valley: committees, deadlines, models
  holdco: {
    zone: 13, name: 'Halvorsen Holding Co.', icon: '🏦', pop: 0.55,
    like: { b2b: 1, franchise: 1, industrial: 0.6, infra: 0.5 }, budget: [25000, 420000],
    style: 'hard', patience: 6, bias: 'utility',
    hello: 'Forty years of holding good companies. Convince me yours belongs in the family.',
  },
  franchisor: {
    zone: 13, name: 'Brightside Franchise Group', icon: '🍔', pop: 0.35,
    like: { franchise: 1, vehicle: 0.5, realty: 0.4, b2b: 0.3 }, budget: [18000, 300000],
    style: 'friendly', patience: 5, bias: 'prestige',
    hello: 'Four hundred units, nine states, and a board hungry for a new territory. Pitch me.',
  },
  lakeshoreHealth: {
    zone: 13, name: 'Evergreen Health Network', icon: '🏥', pop: 0.65,
    like: { medical: 1, b2b: 0.4, digital: 0.4 }, budget: [20000, 210000],
    style: 'analytical', patience: 7, bias: 'price',
    hello: 'The committee meets Thursday. Bring numbers it can read aloud, slowly.',
  },
  harbourlinePE: {
    zone: 13, name: 'Rhea Nair, Harborline Capital', icon: '📊', pop: 0.45,
    like: { franchise: 0.8, digital: 0.6, industrial: 0.5, b2b: 0.45, finance: 0.4 }, budget: [30000, 450000],
    style: 'analytical', patience: 4, bias: 'story',
    hello: "I've modeled this at three entry multiples already. Where's your floor?",
  },
  altitudeSI: {
    zone: 13, name: 'Altitude Systems Integrators', icon: '🖥️', pop: 0.75,
    like: { digital: 1, electronics: 0.5, b2b: 0.4 }, budget: [12000, 220000],
    style: 'impulsive', patience: 3, bias: 'scarcity',
    hello: 'My client needs this live by quarter-end. What is your best number today?',
  },
  pinecrestChain: {
    zone: 13, name: 'Pinecrest Pharmacy Group', icon: '💊', pop: 0.5,
    like: { medical: 0.9, consumer: 0.6, franchise: 0.5, b2b: 0.4 }, budget: [15000, 240000],
    style: 'friendly', patience: 6, bias: 'utility',
    hello: 'Sixty stores, one purchasing desk. Make it easy for my buyers to say yes.',
  },
  ironbridgeMfg: {
    zone: 13, name: 'Ironbridge Manufacturing Group', icon: '⚙️', pop: 0.4,
    like: { industrial: 1, b2b: 0.4, vehicle: 0.4 }, budget: [40000, 380000],
    style: 'hard', patience: 5, bias: 'price',
    hello: "Third-generation plant owners. We buy the divisions the big groups can't stomach.",
  },

  // ------------------------------------------------------------------ 14 Financial District: sharp, analytical, fast
  harborTrustBank: {
    zone: 14, name: 'Harbor Trust Commercial Bank', icon: '🏛️', pop: 0.8,
    like: { finance: 0.8, b2b: 0.6, consumer: 0.5, infra: 0.4 }, budget: [60000, 750000],
    style: 'analytical', patience: 6, bias: 'price',
    hello: 'Credit committee approves in rounds. Show me collateral and a clean paper trail.',
  },
  kestrelFund: {
    zone: 14, name: 'Kestrel Credit Partners', icon: '🦅', pop: 0.5,
    like: { finance: 0.9, ip: 0.5, media: 0.4, b2b: 0.3 }, budget: [40000, 650000],
    style: 'impulsive', patience: 3, bias: 'scarcity',
    hello: "Speed is a yield. Give me one number and I'll answer inside a minute.",
  },
  countyTreasurer: {
    zone: 14, name: 'Ana Ortiz, County Treasurer', icon: '🧮', pop: 0.4,
    like: { infra: 1, finance: 0.4, realty: 0.3 }, budget: [50000, 450000],
    style: 'friendly', patience: 7, bias: 'utility',
    hello: 'Public money, public scrutiny. I buy boring things on purpose.',
  },
  graniteMutual: {
    zone: 14, name: 'Granite State Mutual', icon: '☂️', pop: 0.6,
    like: { home: 1, infra: 0.6, realty: 0.5, finance: 0.45 }, budget: [80000, 900000],
    style: 'analytical', patience: 6, bias: 'prestige',
    hello: "We price risk for a living. Show us the loss ratios, then we'll talk price.",
  },
  tillmanFactor: {
    zone: 14, name: 'Tillman Factoring Co.', icon: '🤝', pop: 0.85,
    like: { b2b: 1, consumer: 0.5, finance: 0.4 }, budget: [20000, 260000],
    style: 'hard', patience: 5, bias: 'story',
    hello: "I buy invoices from people who can't wait sixty days. Fair, never generous.",
  },
  echoRights: {
    zone: 14, name: 'Echo Rights Capital', icon: '🎧', pop: 0.25,
    like: { media: 1, ip: 0.9, finance: 0.4, collectible: 0.3 }, budget: [25000, 320000],
    style: 'friendly', patience: 5, bias: 'scarcity',
    hello: "We fund the songs people hum in the shower. Tell me this catalog's story.",
  },

  // ------------------------------------------------------------------ 15 Real Estate Row: appraisal-minded, patient
  cobaltReit: {
    zone: 15, name: 'Cobalt Industrial REIT', icon: '🏙️', pop: 0.8,
    like: { industrial: 1, realty: 0.7, infra: 0.6, b2b: 0.4 }, budget: [100000, 1700000],
    style: 'hard', patience: 6, bias: 'price',
    hello: 'We underwrite on cap rate and nothing else. What is the net operating income?',
  },
  okaforLandlord: {
    zone: 15, name: 'Mrs. Adeyemi, 40 Doors', icon: '🔑', pop: 0.7,
    like: { home: 1, realty: 0.45, consumer: 0.3 }, budget: [60000, 700000],
    style: 'friendly', patience: 7, bias: 'story',
    hello: "Thirty years collecting rent on the first of the month. Don't rush me, dear.",
  },
  tidewaterDev: {
    zone: 15, name: 'Tidewater Development Group', icon: '🏗️', pop: 0.5,
    like: { realty: 0.9, prestige: 0.6, home: 0.4, b2b: 0.4 }, budget: [150000, 1900000],
    style: 'impulsive', patience: 3, bias: 'scarcity',
    hello: "Land is the one thing they aren't making more of. I'll take the good ones.",
  },
  nimbusCloud: {
    zone: 15, name: 'Stratus Cloud Site Team', icon: '☁️', pop: 0.3,
    like: { infra: 1, digital: 1, b2b: 0.4, energy: 0.4 }, budget: [200000, 2200000],
    style: 'analytical', patience: 5, bias: 'utility',
    hello: 'Power, fiber, cooling. If your hall has all three, name your price.',
  },
  redlineFreight: {
    zone: 15, name: 'Redline Freight & Logistics', icon: '🚛', pop: 0.6,
    like: { industrial: 0.9, vehicle: 0.6, infra: 0.5, realty: 0.45 }, budget: [80000, 950000],
    style: 'hard', patience: 4, bias: 'utility',
    hello: 'Dock doors and highway access. Everything else is decoration.',
  },
  aldrinOffice: {
    zone: 15, name: 'Aldrin Family Office', icon: '🪙', pop: 0.35,
    like: { prestige: 0.8, home: 0.6, luxury: 0.6, finance: 0.5, realty: 0.4 }, budget: [120000, 1600000],
    style: 'friendly', patience: 7, bias: 'prestige',
    hello: 'We think in generations, not quarters. Will this still be standing in 2090?',
  },

  // ------------------------------------------------------------------ 16 Global Exchange: six desks, six ways to value the same thing
  rochatGeneva: {
    zone: 16, name: 'Rochat & Fils, Geneva', icon: '🏔️', pop: 0.6,
    like: { luxury: 1, gem: 0.5, finance: 0.6, collectible: 0.5 }, budget: [150000, 3800000],
    style: 'analytical', patience: 6, bias: 'prestige',
    hello: 'Discretion is part of the price. Your paperwork first, then your number.',
  },
  sanghviMumbai: {
    zone: 16, name: 'Sanghvi Jewelers, Mumbai', icon: '💍', pop: 0.65,
    like: { gem: 1, luxury: 0.6, collectible: 0.3 }, budget: [100000, 2000000],
    style: 'friendly', patience: 7, bias: 'story',
    hello: 'Sit, have chai. We will haggle properly, yes? It is only polite.',
  },
  laiwingHK: {
    zone: 16, name: 'Lai Wing Trading, Hong Kong', icon: '🏮', pop: 0.55,
    like: { industrial: 0.9, bulk: 0.8, energy: 0.6, luxury: 0.4 }, budget: [200000, 2800000],
    style: 'hard', patience: 4, bias: 'price',
    hello: 'Containers wait for no one. Grade, tonnage, port. Three questions; go.',
  },
  almansooriDubai: {
    zone: 16, name: 'Al-Mansoori Trading House, Dubai', icon: '👑', pop: 0.5,
    like: { luxury: 0.9, gem: 0.9, collectible: 0.5, bulk: 0.5 }, budget: [150000, 3600000],
    style: 'impulsive', patience: 3, bias: 'scarcity',
    hello: 'The best pieces never reach the shop window. What did you bring me?',
  },
  norlandFund: {
    zone: 16, name: 'Norland Sovereign Fund', icon: '🧭', pop: 0.3,
    like: { finance: 1, infra: 0.8, energy: 0.6, realty: 0.5 }, budget: [300000, 4500000],
    style: 'hard', patience: 7, bias: 'utility',
    hello: 'We hold for decades and read every page of the file. Take your time.',
  },
  whitcombeMuseum: {
    zone: 16, name: 'Whitcombe Foundation', icon: '🎨', pop: 0.25,
    like: { collectible: 1, luxury: 0.8, prestige: 0.6 }, budget: [120000, 3800000],
    style: 'friendly', patience: 7, bias: 'story',
    hello: 'We acquire for the public, so provenance matters more than price.',
  },
};
