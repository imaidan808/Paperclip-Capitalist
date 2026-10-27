// Tier 2: the four districts where the game becomes a business (docs/V2_DESIGN.md sections 4, 4.1, 5 and 13).
//   5 Metro Hub     working-capital  the city: office, consumer and electronics trade; managers and the Bank open
//   6 Estate Sales  winners-curse    auctions and sealed boxes; hidden value
//   7 Auto Row      repair-roi       broken cars, cheaper repairs; some fixes pay and some do not
//   8 Harbor Docks  supply-chain     imports, customs holds and tariff exposure
//
// Reading the numbers. A good's `base` is its price at utility 50 (scarcity x demand - depreciation); the market sits
// between 0.5x and 1.5x of it. `repair` is the cost at Ops 1 (15-40% of base): at Ops 1 a repair lifts a broken good from
// 0.3x to 0.5x of its value, so the cheap fixes pay at once and the dear ones only pay once Ops (or Auto Row's discount)
// has cut the bill. Buyer budgets are [lo, hi] willingness to pay: hi is 2-5x the district's scale for the big buyers.

export const zones = {
  5: {
    id: 5, name: 'Metro Hub', short: 'Metro', icon: '🏙️', tier: 2, theme: 'metro',
    blurb: 'The city: office, consumer and electronics trade, repeat clients, your first managers and the Bank. Learn why idle cash is the real cost.',
    teaches: 'working-capital',
    gate: 1000, scale: 400, tax: 0.05, friction: 0.116, pool: 10000, speed: 2.2, store: 17,
    leadEvery: 3, lotEvery: 4, urgent: 0.12, auto: true, plots: 4,
    palette: ['#3d4f66', '#3b9bff'],
    rules: { managers: true, bank: true },
    bonus: {},
  },
  6: {
    id: 6, name: 'Estate Sales', short: 'Estates', icon: '🏺', tier: 2, theme: 'estate',
    blurb: 'Estate auctions and sealed boxes. The winner is often the one who overpaid, so bid below your estimate and learn the winner\'s curse.',
    teaches: 'winners-curse',
    gate: 2500, scale: 900, tax: 0.0595, friction: 0.12, pool: 25000, speed: 2.5, store: 19,
    leadEvery: 3, lotEvery: 5, urgent: 0.115, auto: true, plots: 4,
    palette: ['#6b2d5c', '#f2e3c6'],
    rules: { auction: 0.55, fakes: 0.1 },
    bonus: { lotSlots: 1 },
  },
  7: {
    id: 7, name: 'Auto Row', short: 'Auto Row', icon: '🚘', tier: 2, theme: 'auto',
    blurb: 'Six in ten cars here are broken, and repairs run cheaper. Price each fix before you pick up a wrench: some pay, some just burn cash.',
    teaches: 'repair-roi',
    gate: 6000, scale: 2500, tax: 0.069, friction: 0.124, pool: 60000, speed: 2.8, store: 20,
    leadEvery: 3, lotEvery: 4, urgent: 0.11, auto: true, plots: 4,
    palette: ['#383b3f', '#e63b2e'],
    rules: { repair: 0.25 },
    bonus: { repairMult: 0.9 },
  },
  8: {
    id: 8, name: 'Harbor Docks', short: 'Harbor', icon: '🚢', tier: 2, theme: 'harbor',
    blurb: 'Ships dock, customs may hold your freight and tariffs bite. Learn lead times, duties and why longer supply chains carry more risk.',
    teaches: 'supply-chain',
    gate: 12000, scale: 5000, tax: 0.0785, friction: 0.128, pool: 120000, speed: 3.1, store: 22,
    leadEvery: 3, lotEvery: 4, urgent: 0.105, auto: true, plots: 4,
    palette: ['#14305a', '#ff8c1a'],
    rules: { customs: 0.25 },
    bonus: { freightMult: 0.7 },
  },
};

export const assets = {
  // ------------------------------------------------------------------ Metro Hub (scale 400)
  sneakers: {
    name: 'Limited-Release Sneaker Lot', icon: '👟', base: 380, sc: 6, dep: 7, tags: ['trend', 'fashion', 'consumer'],
    dem: { 5: 9, 3: 3 }, fakeRisk: 0.8,
  },
  gadgets: {
    name: 'Viral Gadget Pallet', icon: '🔮', base: 760, sc: 6, dep: 8, tags: ['trend', 'electronics'],
    dem: { 5: 9, 4: 3 }, repair: 130,
  },
  textbooks: {
    name: 'Pallet: Exam-Prep Textbooks', icon: '📚', base: 540, sc: 4, dep: 3, tags: ['paper', 'training'],
    dem: { 5: 8, 3: 3 },
  },
  laptops: {
    name: 'Off-Lease Laptop Pallet', icon: '💻', base: 1150, sc: 5, dep: 6, tags: ['electronics', 'office', 'b2b'],
    dem: { 5: 7, 4: 3 }, repair: 230,
  },
  webStore: {
    name: 'Turnkey Online Store', icon: '🏪', base: 1050, sc: 5, dep: 4, tags: ['digital', 'consumer'],
    dem: { 5: 7, 10: 3 }, fakeRisk: 0.3,
  },

  // ------------------------------------------------------------------ Estate Sales (scale 900)
  antiqueFurniture: {
    name: 'Estate Lot: Antique Furniture', icon: '🛋️', base: 1350, sc: 8, dep: 1, tags: ['home', 'collectible'],
    dem: { 6: 9, 12: 3 }, repair: 380, fakeRisk: 0.4,
  },
  estateBox: {
    name: 'Sealed Estate Box Lot', icon: '🎁', base: 620, sc: 7, dep: 1, tags: ['collectible', 'retro'],
    dem: { 6: 10, 4: 3 }, fakeRisk: 0.2,
  },
  vinylRecords: {
    name: 'Estate Vinyl Collection', icon: '💿', base: 700, sc: 8, dep: 1, tags: ['retro', 'collectible', 'media'],
    dem: { 6: 8, 4: 3 }, fakeRisk: 0.3,
  },
  watches: {
    name: 'Vintage Wristwatch Lot', icon: '⌚', base: 2300, sc: 9, dep: 1, tags: ['luxury', 'collectible'],
    dem: { 6: 8, 4: 3 }, repair: 520, fakeRisk: 0.6,
  },
  toolChest: {
    name: 'Master Machinist\'s Tool Chest', icon: '🧰', base: 900, sc: 6, dep: 1, tags: ['tool', 'collectible'],
    dem: { 6: 6, 7: 8, 9: 2 }, repair: 140, fakeRisk: 0.1,
  },

  // ------------------------------------------------------------------ Auto Row (scale 2500)
  sedan: {
    name: 'Used Commuter Sedan', icon: '🚗', base: 3000, sc: 4, dep: 4, tags: ['vehicle', 'consumer'],
    dem: { 7: 8, 9: 3 }, repair: 720,
  },
  classicCar: {
    name: 'Barn-Find Classic Roadster', icon: '🏎️', base: 6800, sc: 9, dep: 1, tags: ['collectible', 'retro', 'prestige'],
    dem: { 7: 7, 13: 3 }, repair: 2600, fakeRisk: 0.4,
  },
  van: {
    name: 'Ex-Fleet Cargo Van', icon: '🚐', base: 4400, sc: 5, dep: 3, tags: ['vehicle', 'b2b'],
    dem: { 7: 8, 8: 6, 9: 3 }, repair: 1050,
  },
  domain: {
    name: 'Premium Keyword Domain', icon: '🌐', base: 3500, sc: 8, dep: 1, tags: ['digital', 'b2b'],
    dem: { 7: 8, 10: 3 }, fakeRisk: 0.2,
  },

  // ------------------------------------------------------------------ Harbor Docks (scale 5000)
  electronics: {
    name: 'Container Lot: Consumer Electronics', icon: '🔌', base: 3800, sc: 6, dep: 5, tags: ['electronics', 'consumer', 'b2b'],
    dem: { 8: 9, 10: 3 }, repair: 600, fakeRisk: 0.5,
  },
  marineEngine: {
    name: 'Outboard Engines, Crate of Four', icon: '🚤', base: 6400, sc: 6, dep: 3, tags: ['marine', 'vehicle'],
    dem: { 8: 8, 9: 3 }, repair: 2000,
  },
  steelPlate: {
    name: 'Shipyard Steel Plate Bundle', icon: '⚓', base: 4200, sc: 3, dep: 1, tags: ['bulk', 'marine', 'industrial'],
    dem: { 8: 9, 9: 3 }, fakeRisk: 0.1,
  },
  apparel: {
    name: 'Container Lot: Imported Apparel', icon: '👕', base: 3600, sc: 4, dep: 8, tags: ['fashion', 'bulk', 'consumer'],
    dem: { 8: 9, 12: 3 }, fakeRisk: 0.5,
  },
};

export const buyers = {
  // ------------------------------------------------------------------ Metro Hub: steady appetites a manager can serve
  trainer: {
    zone: 5, name: 'Brightpath Corporate Training', icon: '🎓', pop: 0.35,
    like: { training: 1, paper: 0.8, b2b: 0.5, office: 0.4 }, budget: [120, 1500],
    style: 'analytical', patience: 6, bias: 'utility',
    hello: 'We onboard forty new hires a quarter and every one needs a binder. What have you got?',
  },
  boutique: {
    zone: 5, name: 'Loft 9 Trend Boutique', icon: '🛍️', pop: 0.8,
    like: { trend: 1, fashion: 0.8, consumer: 0.6, prestige: 0.5 }, budget: [100, 1400],
    style: 'impulsive', patience: 4, bias: 'story',
    hello: 'If it is in everyone\'s feed by Friday, I want it on my rack by Thursday.',
  },
  etailer: {
    zone: 5, name: 'ClickCart E-Tailer', icon: '🛒', pop: 0.85,
    like: { electronics: 1, trend: 0.6, digital: 0.7 }, budget: [160, 1900],
    style: 'hard', patience: 4, bias: 'price',
    hello: 'Send me volume and a clean spec sheet. I list by morning and ship by noon.',
  },
  recruiter: {
    zone: 5, name: 'Dana Reyes, Corporate Recruiter', icon: '👔', pop: 0.7,
    like: { prestige: 1, office: 0.6, training: 0.55 }, budget: [80, 1100],
    style: 'friendly', patience: 6, bias: 'prestige',
    hello: 'First impressions close offers. I need things that make a candidate feel looked after.',
  },
  freelancer: {
    zone: 5, name: 'Sam Okoro, Tech Freelancer', icon: '🎧', pop: 0.45,
    like: { electronics: 0.9, digital: 0.7, training: 0.5, tool: 0.2 }, budget: [90, 1300],
    style: 'analytical', patience: 5, bias: 'utility',
    hello: 'Between gigs I rebuild my desk setup. Fast, clean and fairly priced, please.',
  },
  cowork: {
    zone: 5, name: 'Hotdesk Cowork Space', icon: '🏢', pop: 0.5,
    like: { office: 1, b2b: 0.9, electronics: 0.5, digital: 0.3 }, budget: [200, 1700],
    style: 'friendly', patience: 7, bias: 'utility',
    hello: 'Forty members, fresh desks each quarter. I reorder the same kit for years, if it is right.',
  },
  popup: {
    zone: 5, name: 'Corner Kicks Pop-Up Stall', icon: '🎪', pop: 0.3,
    like: { fashion: 1, trend: 0.9, consumer: 0.4 }, budget: [60, 900],
    style: 'impulsive', patience: 3, bias: 'scarcity',
    hello: 'Weekend market, one folding table. Give me something people stop walking for.',
  },

  // ------------------------------------------------------------------ Estate Sales: collectors who know what a lot is worth
  antiqueDealer: {
    zone: 6, name: 'Hargrove & Daughters Antiques', icon: '🏺', pop: 0.85,
    like: { home: 1, collectible: 0.6, retro: 0.4, luxury: 0.4 }, budget: [200, 3600],
    style: 'hard', patience: 4, bias: 'story',
    hello: 'Three generations of estate sales. I know a good dovetail when I see one.',
  },
  designer: {
    zone: 6, name: 'Wren & Co. Home Staging', icon: '🖼️', pop: 0.45,
    like: { home: 0.9, luxury: 0.5, prestige: 0.6 }, budget: [150, 2400],
    style: 'friendly', patience: 6, bias: 'prestige',
    hello: 'I stage listings with pieces that tell a story. Provenance sells the house.',
  },
  recordShop: {
    zone: 6, name: 'Needle & Groove Records', icon: '🎶', pop: 0.65,
    like: { media: 1, retro: 0.7, collectible: 0.3 }, budget: [80, 1400],
    style: 'impulsive', patience: 4, bias: 'scarcity',
    hello: 'Boxes of vinyl from somebody\'s basement? Say no more. I will bring a flashlight.',
  },
  watchCollector: {
    zone: 6, name: 'Dr. Imran Qureshi, Watch Collector', icon: '🕰️', pop: 0.4,
    like: { luxury: 1, prestige: 0.6, collectible: 0.45 }, budget: [300, 3800],
    style: 'analytical', patience: 6, bias: 'scarcity',
    hello: 'Show me the caseback. I buy movements and stories, in that order.',
  },
  boxFlipper: {
    zone: 6, name: 'Marcus Bell, Box Flipper', icon: '🗃️', pop: 0.7,
    like: { collectible: 0.8, retro: 0.5, home: 0.5, tool: 0.4 }, budget: [90, 1500],
    style: 'impulsive', patience: 3, bias: 'price',
    hello: 'Sealed lots, no peeking. I live for the second the lid comes off.',
  },
  thrift: {
    zone: 6, name: 'Second Life Thrift', icon: '🧺', pop: 0.6,
    like: { home: 0.8, consumer: 0.5, tool: 0.5, retro: 0.4 }, budget: [60, 1200],
    style: 'friendly', patience: 7, bias: 'price',
    hello: 'Five shops turn their furniture every month. Fair price, clean and no mystery smells.',
  },

  // ------------------------------------------------------------------ Auto Row: dealers, fleets and the people who fix things
  smelog: {
    zone: 7, name: 'Delgado Delivery Co.', icon: '📦', pop: 0.5,
    like: { vehicle: 1, b2b: 0.7, industrial: 0.5 }, budget: [700, 6500],
    style: 'analytical', patience: 6, bias: 'utility',
    hello: 'Eight vans, one dispatcher and no time for downtime. Reliable beats pretty.',
  },
  dealerGroup: {
    zone: 7, name: 'Kowalski Motors', icon: '🚙', pop: 0.9,
    like: { vehicle: 1, consumer: 0.6, digital: 0.5, tool: 0.5, prestige: 0.55 }, budget: [900, 10000],
    style: 'hard', patience: 3, bias: 'price',
    hello: 'I move sixty cars a month. Give me a number I can put on a sticker.',
  },
  rideshare: {
    zone: 7, name: 'Yellowline Rideshare Co-op', icon: '🚕', pop: 0.55,
    like: { vehicle: 0.9, consumer: 0.7, b2b: 0.5 }, budget: [600, 6500],
    style: 'friendly', patience: 7, bias: 'utility',
    hello: 'Our drivers rent by the week. It has to be clean, cheap to run and pass inspection.',
  },
  classicCollector: {
    zone: 7, name: 'Hal Pennington, Classic Roadsters', icon: '🎩', pop: 0.35,
    like: { collectible: 1, retro: 0.9, prestige: 0.5, vehicle: 0.4 }, budget: [1800, 11000],
    style: 'impulsive', patience: 4, bias: 'story',
    hello: 'Matching numbers or nothing. Tell me the story of this one before you tell me the price.',
  },
  toolTruck: {
    zone: 7, name: 'Tool Truck Tony', icon: '🛻', pop: 0.4,
    like: { tool: 1, industrial: 0.6, vehicle: 0.4, collectible: 0.4 }, budget: [150, 2800],
    style: 'friendly', patience: 5, bias: 'price',
    hello: 'I sell wrenches off a truck to every bay on this row. A good chest sells itself.',
  },
  restorer: {
    zone: 7, name: 'Bondo & Sons Restorations', icon: '🔧', pop: 0.25,
    like: { retro: 1, collectible: 0.6, vehicle: 0.45, tool: 0.5 }, budget: [300, 5500],
    style: 'hard', patience: 5, bias: 'utility',
    hello: 'Rust does not scare me, bad paperwork does. Bring me a project and an honest story.',
  },
  autoMarketplace: {
    zone: 7, name: 'DriveBoard Marketplace', icon: '🖱️', pop: 0.3,
    like: { digital: 1, b2b: 0.8, trend: 0.3 }, budget: [1000, 8500],
    style: 'analytical', patience: 5, bias: 'scarcity',
    hello: 'We list ten thousand cars, and the right web address is worth a hundred of them.',
  },

  // ------------------------------------------------------------------ Harbor Docks: importers, yards and the people who clear cargo
  boatyard: {
    zone: 8, name: 'Salty Dog Boatyard', icon: '⛵', pop: 0.45,
    like: { marine: 1, vehicle: 0.6, industrial: 0.4 }, budget: [900, 14000],
    style: 'hard', patience: 4, bias: 'utility',
    hello: 'Haul-out season starts in October. I need engines that run and paperwork that proves it.',
  },
  shipyard: {
    zone: 8, name: 'Port Royal Shipbuilders', icon: '🏗️', pop: 0.55,
    like: { industrial: 1, marine: 0.9, bulk: 0.4, b2b: 0.3 }, budget: [2200, 20000],
    style: 'analytical', patience: 6, bias: 'price',
    hello: 'We buy steel by the ton and mill certificates by the page. No cert, no deal.',
  },
  forwarder: {
    zone: 8, name: 'Ng & Sons Freight Forwarding', icon: '🚛', pop: 0.6,
    like: { b2b: 1, bulk: 0.7, vehicle: 0.55, digital: 0.4 }, budget: [1500, 15000],
    style: 'friendly', patience: 6, bias: 'utility',
    hello: 'I move other people\'s goods through customs. Delay costs me more than duty does.',
  },
  bigBox: {
    zone: 8, name: 'Bargain Barn Merchandising', icon: '🏬', pop: 0.9,
    like: { consumer: 1, fashion: 0.7, electronics: 0.7, bulk: 0.45 }, budget: [1800, 18000],
    style: 'hard', patience: 3, bias: 'price',
    hello: 'Forty stores, one buyer: me. Give me the container price and I will say if it works.',
  },
  fastFashion: {
    zone: 8, name: 'Mira Costa Fast Fashion', icon: '👗', pop: 0.4,
    like: { fashion: 1, trend: 0.9, bulk: 0.4, consumer: 0.3 }, budget: [900, 11000],
    style: 'impulsive', patience: 4, bias: 'scarcity',
    hello: 'Sketch to rack in three weeks. If the container is late, the trend is gone.',
  },
  liquidator: {
    zone: 8, name: 'Bonded Warehouse Liquidators', icon: '🏷️', pop: 0.3,
    like: { electronics: 0.8, consumer: 0.7, b2b: 0.6, bulk: 0.45 }, budget: [700, 12000],
    style: 'impulsive', patience: 4, bias: 'story',
    hello: 'Unclaimed cargo, seized pallets, orphaned containers. I will make an offer on any of it.',
  },
};
