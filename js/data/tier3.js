// Tier 3: districts 9-12 (Industrial Park, Tech Corridor, Farmland Co-op, Creative Quarter). docs/V2_DESIGN.md sections 4, 4.1, 5, 13.
// Scale starts to bite here. One avenue, four rules:
//   9  contracts and compliance (scale-compliance)   10 fads and first movers (obsolescence)
//   11 perishables and seasons (inventory-risk)      12 royalties that pay while you hold (recurring-revenue)
// Background hooks, so no single build owns the tier: Trades fixes the machines of 9 and the tractors of 11; Veteran's faster freight
// keeps produce fresh but cannot read the fads of 10; Native sells digital goods at +20% in 10 and 12 and pays for it in fakes (the
// fakeRisk goods); Roots has loyal buyers in the Co-op but few elsewhere; Creator owns trend media in 12; Pro appraises 9's medical gear
// and 12's rights but is penalized on digital; Second-Chance and Pro both get something from the small fakes rules.
// The suggested numbers of section 4.1 are used as written (friction is the straight line .10 to .16; urgent the straight fall from .12 at
// district 5 to .06 at 16, rounded). The one addition is a small `fakes` rule in 9, 10 and 12, which gives `fakeRisk` and the Inspect game
// something to do at this scale (counterfeit chips and cloned licenses, forged mill certificates, rights with a clouded title).

export const zones = {
  9: {
    id: 9, name: 'Industrial Park', short: 'Industrial', icon: '⚙️', theme: 'industrial', tier: 3, teaches: 'scale-compliance',
    blurb: 'Machines, metal and medical gear sold under contract. Buyers expect paperwork and SLAs, and your first compliance audit lands here.',
    gate: 25000, scale: 9000, tax: 0.088, friction: 0.132, pool: 250000, speed: 3.4, store: 24,
    leadEvery: 3, lotEvery: 4, urgent: 0.10, auto: true, plots: 4,
    palette: ['#4b5a6a', '#f5c518'],
    rules: { audits: true, bulk: true, fakes: 0.05 },
    bonus: { capMult: 1.25 },
  },
  10: {
    id: 10, name: 'Tech Corridor', short: 'Tech', icon: '💻', theme: 'tech', tier: 3, teaches: 'obsolescence',
    blurb: 'Software, silicon and startup wreckage. Digital goods lose value fast, so the first mover wins and the last one holds the bag.',
    gate: 50000, scale: 18000, tax: 0.0975, friction: 0.136, pool: 500000, speed: 3.7, store: 25,
    leadEvery: 2, lotEvery: 4, urgent: 0.09, auto: true, plots: 4,
    palette: ['#0a0f1c', '#19e3f2'],
    rules: { fads: true, fakes: 0.08 },
    bonus: { leadMult: 1.15 },
  },
  11: {
    id: 11, name: 'Farmland Co-op', short: 'Farmland', icon: '🌾', theme: 'farm', tier: 3, teaches: 'inventory-risk',
    blurb: 'Stock spoils on a clock and harvest waves swing every price. Buy ahead of the wave, sell before the rot, and learn what inventory risk costs.',
    gate: 90000, scale: 30000, tax: 0.107, friction: 0.14, pool: 900000, speed: 4.0, store: 27,
    leadEvery: 4, lotEvery: 4, urgent: 0.09, auto: true, plots: 4,
    palette: ['#2e6b34', '#e3b93c'],
    rules: { perish: true, season: { period: 30, amp: 0.35, tags: ['food', 'farm'] } },
    bonus: { storeBonus: 4 },
  },
  12: {
    id: 12, name: 'Creative Quarter', short: 'Creative', icon: '🎨', theme: 'creative', tier: 3, teaches: 'recurring-revenue',
    blurb: 'Catalogs, rights and channels that pay you every day you hold them. Steady income, no deals to chase: learn what recurring revenue is worth.',
    gate: 150000, scale: 50000, tax: 0.1165, friction: 0.144, pool: 1500000, speed: 4.3, store: 29,
    leadEvery: 3, lotEvery: 4, urgent: 0.08, auto: true, plots: 4,
    palette: ['#9d1c6b', '#8f5bff'],
    rules: { yield: true, fakes: 0.05 },
    bonus: {},
  },
};

// dem is sparse: 4..10 only inside districts 9-12, a trickle (<= 3) elsewhere. base is the fair price at utility 50 (about 1.0x).
export const assets = {
  // ---- Industrial Park (9)
  cncCenter: {
    name: 'Refurbished CNC Machining Center', icon: '🗜️', base: 13000, sc: 6, dep: 2, repair: 3600, fakeRisk: 0.15,
    dem: { 8: 2, 9: 9, 10: 2, 11: 2, 13: 3 }, tags: ['industrial', 'tool'],
  },
  steelCoil: {
    name: 'Cold-Rolled Steel Coil Lot (12 t)', icon: '⛓️', base: 10500, sc: 5, dep: 1, fakeRisk: 0.3,
    dem: { 8: 3, 9: 8, 11: 2, 13: 3 }, tags: ['industrial', 'bulk'],
  },
  infusionPumps: {
    name: 'Refurbished Infusion Pump Lot (20 units)', icon: '💉', base: 8500, sc: 7, dep: 2, repair: 2200, fakeRisk: 0.7,
    dem: { 9: 7, 11: 2, 13: 3 }, tags: ['medical', 'electronics'],
  },
  dieselGenset: {
    name: 'Standby Diesel Generator (200 kW)', icon: '🔋', base: 9500, sc: 6, dep: 2, repair: 2600, fakeRisk: 0.2,
    dem: { 8: 3, 9: 8, 10: 3, 11: 6, 13: 2 }, tags: ['energy', 'infra'],
  },
  fleet: {
    name: 'Delivery Fleet (6 vans)', icon: '🚚', base: 32000, sc: 6, dep: 3, repair: 7000, fakeRisk: 0.05,
    dem: { 8: 3, 9: 7, 11: 8, 12: 3, 13: 3 }, tags: ['vehicle', 'b2b', 'tool'],
  },
  // ---- Tech Corridor (10): digital goods wear out fast
  saas: {
    name: 'SaaS Subscription Book', icon: '💾', base: 22000, sc: 7, dep: 7, fakeRisk: 0.5,
    dem: { 9: 3, 10: 9, 12: 3, 13: 3 }, tags: ['digital', 'b2b'],
  },
  mobileApp: {
    name: 'Breakout Mobile App (50k users)', icon: '📱', base: 15000, sc: 8, dep: 10, fakeRisk: 0.8,
    dem: { 10: 9, 12: 3, 13: 2 }, tags: ['digital', 'trend'],
  },
  gpuServer: {
    name: 'GPU Training Server (8 cards)', icon: '🖥️', base: 27000, sc: 7, dep: 9, repair: 6000, fakeRisk: 1,
    dem: { 9: 3, 10: 9, 12: 3, 13: 3 }, tags: ['electronics', 'digital', 'infra'],
  },
  startupAssets: {
    name: 'Wound-Down Startup Asset Bundle', icon: '🧩', base: 19000, sc: 9, dep: 8, fakeRisk: 0.1,
    dem: { 10: 8, 12: 3, 13: 3 }, tags: ['digital', 'ip'],
  },
  gameCatalog: {
    name: 'Casual Game Back-Catalog (6 titles)', icon: '🕹️', base: 36000, sc: 8, dep: 1, yield: 0.006, fakeRisk: 0.3,
    dem: { 10: 6, 12: 8, 13: 2 }, tags: ['ip', 'digital', 'finance'],
  },
  // ---- Farmland Co-op (11): stock spoils
  produceReefer: {
    name: 'Reefer Load: Fresh Produce', icon: '🍅', base: 24000, sc: 4, dep: 2, perish: 6,
    dem: { 8: 3, 11: 9, 12: 3 }, tags: ['food', 'farm'],
  },
  cheeseWheels: {
    name: 'Cave-Aged Cheese Wheels (400 kg)', icon: '🧀', base: 20000, sc: 7, dep: 1, perish: 28,
    dem: { 8: 2, 11: 8, 12: 3 }, tags: ['food', 'consumer'],
  },
  winterWheat: {
    name: 'Winter Wheat (100 t)', icon: '🍞', base: 36000, sc: 3, dep: 1, perish: 50,
    dem: { 8: 3, 11: 9, 13: 2 }, tags: ['farm', 'bulk'],
  },
  rowCropTractor: {
    name: 'Used Row-Crop Tractor (200 hp)', icon: '🚜', base: 52000, sc: 5, dep: 2, repair: 13000,
    dem: { 8: 2, 9: 3, 11: 8 }, tags: ['farm', 'vehicle'],
  },
  // ---- Creative Quarter (12): rights that pay while you hold them
  filmCatalog: {
    name: 'Indie Film Catalog (40 titles)', icon: '🎞️', base: 115000, sc: 8, dep: 1, yield: 0.0045, fakeRisk: 0.3,
    dem: { 10: 3, 12: 8, 13: 3 }, tags: ['media', 'ip'],
  },
  musicRights: {
    name: 'Back-Catalog Music Rights (1990s)', icon: '🎼', base: 78000, sc: 9, dep: 1, yield: 0.004, fakeRisk: 0.45,
    dem: { 10: 2, 12: 8, 13: 3 }, tags: ['ip', 'retro'],
  },
  stockLibrary: {
    name: 'Stock Photo and Footage Library', icon: '📷', base: 34000, sc: 6, dep: 1, yield: 0.006, fakeRisk: 0.2,
    dem: { 10: 3, 12: 9, 13: 2 }, tags: ['media', 'digital'],
  },
  podcastNetwork: {
    name: 'Podcast Network (12 shows)', icon: '🎙️', base: 62000, sc: 7, dep: 2, yield: 0.006, fakeRisk: 0.4,
    dem: { 10: 3, 12: 8, 13: 3 }, tags: ['media', 'trend'],
  },
};

// like: tag -> affinity. pop: how many players find this buyer first. budget: [low, high] willingness to pay.
export const buyers = {
  // ---- Industrial Park (9): contracts, SLAs, compliance
  halvorsenParts: {
    zone: 9, name: 'Kessler Precision Parts', icon: '🔩', pop: 0.9, style: 'analytical', patience: 6, bias: 'utility',
    like: { industrial: 1, b2b: 0.6, bulk: 0.5, tool: 0.5 }, budget: [2500, 38000],
    hello: 'Spec sheet, maintenance log and a delivery date we can hold you to. Then we sign.',
  },
  lakeshorePower: {
    zone: 9, name: 'Lakeshore Municipal Power', icon: '🔌', pop: 0.5, style: 'hard', patience: 4, bias: 'price',
    like: { energy: 1, infra: 0.8, industrial: 0.5, vehicle: 0.4 }, budget: [3500, 48000],
    hello: 'I buy for uptime, not looks. What is your response time when it fails at 3 a.m.?',
  },
  stBrigidsHospital: {
    zone: 9, name: "St. Brigid's Procurement Office", icon: '🏥', pop: 0.35, style: 'analytical', patience: 7, bias: 'prestige',
    like: { medical: 1, energy: 0.5, electronics: 0.4, b2b: 0.4 }, budget: [3000, 34000],
    hello: 'Every device needs a clean service history and a signed compliance sheet.',
  },
  dombrowskiFoundry: {
    zone: 9, name: 'Dombrowski Foundry and Metals', icon: '🔥', pop: 0.7, style: 'hard', patience: 4, bias: 'price',
    like: { industrial: 1, bulk: 1, scrap: 0.8, energy: 0.4 }, budget: [2000, 32000],
    hello: 'Weigh it, assay it, then we talk price. My furnace is hot and my memory is long.',
  },
  reyesConstruction: {
    zone: 9, name: 'Ramos and Daughters Construction', icon: '🚧', pop: 0.6, style: 'friendly', patience: 6, bias: 'scarcity',
    like: { energy: 0.7, vehicle: 0.8, industrial: 0.6, b2b: 0.4 }, budget: [1200, 26000],
    hello: 'Job starts Monday and my generator just died. Whatever runs, I will look at today.',
  },
  corridorFreight: {
    zone: 9, name: 'Corridor Freight and Distribution', icon: '🚛', pop: 0.65, style: 'impulsive', patience: 4, bias: 'utility',
    like: { vehicle: 1, b2b: 0.8, industrial: 0.3, energy: 0.3 }, budget: [4000, 52000],
    hello: 'Our contract has a 98% on-time clause. Fleet uptime is the only number I read.',
  },
  northfieldVets: {
    zone: 9, name: 'Northfield Veterinary Group', icon: '🐾', pop: 0.2, style: 'friendly', patience: 7, bias: 'story',
    like: { medical: 0.9, consumer: 0.4, farm: 0.3 }, budget: [1000, 14000],
    hello: 'Seven clinics, one shared budget, and patients who cannot tell us where it hurts.',
  },
  // ---- Tech Corridor (10): fads and first movers
  entIT: {
    zone: 10, name: 'Larkin Mutual Enterprise IT', icon: '🖥️', pop: 0.9, style: 'analytical', patience: 7, bias: 'utility',
    like: { infra: 1, b2b: 0.85, digital: 0.6, electronics: 0.7 }, budget: [4000, 72000],
    hello: 'Procurement approved the budget in Q3. Quote us something with a support contract.',
  },
  vcstart: {
    zone: 10, name: 'Nimbus Labs (VC-backed)', icon: '🚀', pop: 0.4, style: 'impulsive', patience: 3, bias: 'story',
    like: { digital: 1, ip: 0.6, electronics: 0.5, trend: 0.4 }, budget: [3000, 54000],
    hello: 'We move fast. Close by Friday and we wire the cash the same afternoon.',
  },
  brindleAcquihire: {
    zone: 10, name: 'Brindle and Co. Acqui-hires', icon: '🤝', pop: 0.2, style: 'hard', patience: 4, bias: 'price',
    like: { ip: 1, digital: 0.9, b2b: 0.6 }, budget: [5000, 60000],
    hello: 'Dead startups, living code. We pay cash for a clean cap table and a handover plan.',
  },
  rackspanResellers: {
    zone: 10, name: 'Rackspan Hardware Resellers', icon: '🧰', pop: 0.55, style: 'analytical', patience: 5, bias: 'price',
    like: { electronics: 1, infra: 0.8, digital: 0.5, industrial: 0.4 }, budget: [2500, 48000],
    hello: 'I read serial numbers for a living. Show me the label, the sticker and the invoice.',
  },
  pixelPineAgency: {
    zone: 10, name: 'Pixel and Pine Digital Agency', icon: '🖌️', pop: 0.6, style: 'friendly', patience: 6, bias: 'story',
    like: { digital: 0.8, trend: 0.8, media: 0.5 }, budget: [1500, 36000],
    hello: 'Our clients want whatever is blowing up this month. How is yours doing on retention?',
  },
  tallowGames: {
    zone: 10, name: 'Tallow Games', icon: '🎮', pop: 0.3, style: 'friendly', patience: 5, bias: 'prestige',
    like: { ip: 1, digital: 0.45, trend: 0.5, media: 0.5 }, budget: [2500, 44000],
    hello: 'Three hits in the store and one flop paying the rent. Show me a catalog that earns.',
  },
  corvidMlLab: {
    zone: 10, name: 'Corvid Machine-Learning Lab', icon: '🧠', pop: 0.35, style: 'impulsive', patience: 3, bias: 'scarcity',
    like: { infra: 1, electronics: 0.9, digital: 0.4 }, budget: [4000, 66000],
    hello: 'Our training run starts Monday. I need cards that do not overheat, by Thursday.',
  },
  // ---- Farmland Co-op (11): perishables and seasons
  marloweGrocers: {
    zone: 11, name: "Marlowe's Market Grocers", icon: '🥬', pop: 0.9, style: 'hard', patience: 4, bias: 'price',
    like: { food: 1, consumer: 0.6, farm: 0.4, b2b: 0.5 }, budget: [3000, 90000],
    hello: 'Shelf life is my whole business. Show me delivery dates before you show me prices.',
  },
  goldenValleyMill: {
    zone: 11, name: 'Amber Valley Mill and Cannery', icon: '🥫', pop: 0.6, style: 'analytical', patience: 6, bias: 'utility',
    like: { bulk: 1, food: 0.9, farm: 0.6, industrial: 0.6, energy: 0.5 }, budget: [6000, 110000],
    hello: 'We take it by the ton, on contract, and we test every load for moisture.',
  },
  elmwoodCoop: {
    zone: 11, name: "Elmwood Growers' Co-op", icon: '🐄', pop: 0.8, style: 'friendly', patience: 7, bias: 'story',
    like: { farm: 1, vehicle: 0.6, energy: 0.5, bulk: 0.5, b2b: 0.3 }, budget: [2500, 80000],
    hello: 'We vote on big purchases. Bring a fair price and a good story; we remember both.',
  },
  hearthHiveGroup: {
    zone: 11, name: 'Hearth and Hive Restaurant Group', icon: '🍽️', pop: 0.5, style: 'impulsive', patience: 3, bias: 'prestige',
    like: { food: 1, consumer: 0.4, prestige: 0.5 }, budget: [1500, 36000],
    hello: 'The chef changes the menu on Thursday. Tell me what is perfect this week.',
  },
  ridgelineDealer: {
    zone: 11, name: 'Ridgeline Equipment Dealer', icon: '🏬', pop: 0.55, style: 'hard', patience: 5, bias: 'scarcity',
    like: { farm: 0.9, vehicle: 1, industrial: 0.5, energy: 0.3 }, budget: [4000, 85000],
    hello: 'This is the last one of the model year. Check the hours meter and the hydraulics.',
  },
  prairieBiofuels: {
    zone: 11, name: 'Prairie Biofuels Plant', icon: '⛽', pop: 0.15, style: 'analytical', patience: 6, bias: 'price',
    like: { energy: 1, bulk: 0.7, farm: 0.45 }, budget: [5000, 70000],
    hello: 'Corn, wheat, anything starchy and dry. And a backup generator that actually starts.',
  },
  // ---- Creative Quarter (12): rights that pay
  marigoldPictures: {
    zone: 12, name: 'Marigold Pictures', icon: '🎬', pop: 0.8, style: 'hard', patience: 5, bias: 'prestige',
    like: { media: 1, ip: 0.7, prestige: 0.5 }, budget: [8000, 220000],
    hello: 'We greenlight on library value, not hope. Show me the chain of title.',
  },
  lanternStream: {
    zone: 12, name: 'Lantern Stream', icon: '📺', pop: 0.9, style: 'analytical', patience: 6, bias: 'utility',
    like: { media: 1, digital: 0.7, trend: 0.6 }, budget: [6000, 200000],
    hello: 'Our catalog needs hours and our analysts need numbers. Bring both.',
  },
  oldGoldRecords: {
    zone: 12, name: 'Old Gold Records', icon: '🎵', pop: 0.5, style: 'friendly', patience: 6, bias: 'story',
    like: { ip: 0.85, media: 0.8, retro: 0.8 }, budget: [5000, 150000],
    hello: "One hit, a cold February in '94. That song still pays for my whole office.",
  },
  brightleafLicensing: {
    zone: 12, name: 'Brightleaf Brand Licensing', icon: '🧸', pop: 0.45, style: 'impulsive', patience: 3, bias: 'scarcity',
    like: { ip: 1, consumer: 0.7, trend: 0.6 }, budget: [4000, 140000],
    hello: 'Lunch boxes, pajamas, theme parks. Give me an IP with legs and I will find the merch.',
  },
  northbridgeRoyalty: {
    zone: 12, name: 'Northbridge Royalty Partners', icon: '📈', pop: 0.15, style: 'analytical', patience: 7, bias: 'price',
    like: { finance: 1, ip: 0.9, media: 0.5 }, budget: [20000, 250000],
    hello: 'We underwrite cash flows. Give me three years of statements and a clean assignment.',
  },
  wavelengthCollective: {
    zone: 12, name: "Wavelength Creators' Collective", icon: '🎤', pop: 0.6, style: 'friendly', patience: 6, bias: 'story',
    like: { trend: 1, media: 0.9, digital: 0.7 }, budget: [4000, 90000],
    hello: 'Nine of us and one microphone budget. We will grow your numbers if you give us runway.',
  },
};
