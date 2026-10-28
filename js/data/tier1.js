// Tier 1 content: districts 1-4, the on-ramp (docs/V2_DESIGN.md sections 4, 4.1, 5 and 13).
//
//   1 The Scrap Yard     scale $1    barter ladder; urgent buyers pay for need, not cost      (utility-fit)
//   2 Flea Market Row    scale $6    every deal can be haggled; sealed boxes are a gamble      (negotiation)
//   3 Campus Quad        scale $25   a 28-day semester wave; cheap trends herd                 (saturation-herd)
//   4 Pawn District      scale $90   about one lot in five is fake; appraisal is the game      (information-asymmetry)
//
// Everyone starts with one paperclip (fair value about five cents) and no cash. Two ways up:
//   * sell it to someone who needs it right now (Wen the stressed student) and take the first dollars, or
//   * climb the barter ladder through the buyers' `holds`: paperclip -> pen -> sealed box / records -> radio -> bike.
// Home tags used here: tool office prestige paper retro scrap collectible home outdoor.
// Prices follow the v1 utility index (fair value = base x (0.5 + (sc x demand - dep) / 100)), which is why a good
// that nobody in the Scrap Yard wants (the radio, the records) is cheap there and dear on Flea Market Row.

export const zones = {
  1: {
    id: 1, name: 'The Scrap Yard', short: 'Scrap Yard', icon: '🏭', theme: 'scrap', tier: 1,
    blurb: 'You start here with one paperclip and no cash. Climb the barter ladder, and learn that an urgent buyer pays for what they need, not what it cost.',
    teaches: 'utility-fit', gate: 0, scale: 1, tax: 0, friction: 0.1, pool: 5000, speed: 1, store: 10, leadEvery: 3, lotEvery: 4, urgent: 0.45,
    auto: false, plots: 0, palette: ['#5b5b1f', '#b5651d'], rules: {}, bonus: {},
  },
  2: {
    id: 2, name: 'Flea Market Row', short: 'Flea Market', icon: '🎪', theme: 'market', tier: 1,
    blurb: 'A bazaar of canvas stalls where every deal can be haggled and sealed boxes are a gamble on condition. Learn to anchor and to walk away.',
    teaches: 'negotiation', gate: 20, scale: 6, tax: 0.01, friction: 0.104, pool: 5000, speed: 1.3, store: 12, leadEvery: 3, lotEvery: 4, urgent: 0.3,
    auto: false, plots: 0, palette: ['#c4571a', '#ffc93c'], rules: { haggle: true }, bonus: {},
  },
  3: {
    id: 3, name: 'Campus Quad', short: 'Campus', icon: '🎓', theme: 'campus', tier: 1,
    blurb: 'Books, notes and gadgets rise and fall on a 28-day semester wave, and cheap trends spread fast. Learn why the crowd favorite stops paying.',
    teaches: 'saturation-herd', gate: 80, scale: 25, tax: 0.02, friction: 0.108, pool: 5000, speed: 1.6, store: 13, leadEvery: 3, lotEvery: 4, urgent: 0.25,
    auto: false, plots: 0, palette: ['#9b3b2f', '#2f9e5b'],
    rules: { season: { period: 28, amp: 0.35, tags: ['paper', 'training', 'electronics'] } }, bonus: {},
  },
  4: {
    id: 4, name: 'Pawn District', short: 'Pawn', icon: '💍', theme: 'pawn', tier: 1,
    blurb: 'About one lot in five is a fake and a third of the stock goes to auction. Inspect before you bid: the seller always knows more than you do.',
    teaches: 'information-asymmetry', gate: 250, scale: 90, tax: 0.03, friction: 0.112, pool: 5000, speed: 1.9, store: 15, leadEvery: 3, lotEvery: 5, urgent: 0.2,
    auto: false, plots: 0, palette: ['#0e6f6b', '#e3b341'], rules: { fakes: 0.22, auction: 0.35, gray: true }, bonus: {},
  },
};

export const assets = {
  // ------------------------------------------------------------------ The Scrap Yard (fair value $0.05 - $3)
  paperclip: {
    name: 'Rusty Paperclip', icon: '📎', base: 0.08, sc: 2, dep: 1, tags: ['tool', 'office'], dem: { 1: 7, 2: 2 },
  },
  oddHardware: {
    name: 'Coffee Can of Odd Hardware', icon: '🧰', base: 0.7, sc: 3, dep: 1, tags: ['tool', 'scrap', 'home'], dem: { 1: 8, 2: 4, 3: 2 },
  },
  paperbacks: {
    name: 'Box of Water-Stained Paperbacks', icon: '📕', base: 1.6, sc: 3, dep: 3, tags: ['paper', 'home'], dem: { 1: 6, 2: 7, 3: 3 },
  },
  scrap: {
    name: 'Bucket of Scrap Metal', icon: '🔩', base: 3, sc: 3, dep: 1, tags: ['scrap', 'industrial'], dem: { 1: 9, 2: 3 },
  },
  pen: {
    name: 'Vintage Fountain Pen', icon: '🖋️', base: 3.2, sc: 5, dep: 1, tags: ['prestige', 'office', 'retro'], dem: { 1: 8, 2: 7, 3: 3, 4: 2 }, fakeRisk: 0.35,
  },

  // ------------------------------------------------------------------ Flea Market Row (fair value $3 - $20)
  radio: {
    name: 'Vintage Tube Radio', icon: '📻', base: 12, sc: 6, dep: 2, tags: ['retro', 'electronics', 'home'], dem: { 1: 3, 2: 8, 3: 3, 4: 3 }, repair: 4.2,
  },
  fleaRecords: {
    name: 'Crate of Vinyl Records', icon: '🎶', base: 9, sc: 5, dep: 2, tags: ['retro', 'collectible', 'media'], dem: { 1: 2, 2: 8, 4: 3 }, fakeRisk: 0.5,
  },
  fleaBox: {
    name: 'Sealed Mystery Box', icon: '🎁', base: 7, sc: 9, dep: 2, tags: ['collectible', 'consumer'], dem: { 1: 2, 2: 9, 3: 3, 4: 3 },
  },

  // ------------------------------------------------------------------ Campus Quad (fair value $8 - $60)
  bike: {
    name: 'Road Bike', icon: '🚲', base: 34, sc: 5, dep: 3, tags: ['outdoor', 'vehicle'], dem: { 1: 3, 2: 4, 3: 9, 4: 5 }, repair: 12, fakeRisk: 0.5,
  },
  courseBooks: {
    name: 'Used Textbook Set', icon: '📚', base: 28, sc: 4, dep: 4, tags: ['paper', 'training'], dem: { 2: 2, 3: 9, 4: 2 },
  },
  graphCalc: {
    name: 'Graphing Calculator', icon: '🧮', base: 42, sc: 5, dep: 3, tags: ['training', 'electronics', 'office'], dem: { 2: 2, 3: 8, 4: 3 },
  },
  dormFridge: {
    name: 'Dorm Mini-Fridge', icon: '🧊', base: 52, sc: 4, dep: 3, tags: ['home', 'consumer'], dem: { 2: 3, 3: 8, 4: 3 }, repair: 17,
  },
  spiritHoodies: {
    name: 'Crate of Spirit-Week Hoodies', icon: '🧥', base: 20, sc: 3, dep: 6, tags: ['fashion', 'trend'], dem: { 2: 3, 3: 9 },
  },
  enamelPins: {
    name: 'Blind-Bag Enamel Pin Set', icon: '📌', base: 8, sc: 3, dep: 7, tags: ['trend', 'collectible'], dem: { 2: 3, 3: 8 },
  },

  // ------------------------------------------------------------------ Pawn District (fair value $60 - $330)
  pawnLaptop: {
    name: 'Refurbished Student Laptop', icon: '💻', base: 140, sc: 6, dep: 4, tags: ['electronics', 'digital'], dem: { 3: 5, 4: 8 }, repair: 48, fakeRisk: 0.8,
  },
  pawnGuitar: {
    name: 'Acoustic Guitar, Some Wear', icon: '🎸', base: 120, sc: 5, dep: 2, tags: ['media', 'retro'], dem: { 3: 4, 4: 9 }, repair: 34, fakeRisk: 0.9,
  },
  pawnWatch: {
    name: 'Pawn-Shop Wristwatch', icon: '⌚', base: 260, sc: 8, dep: 1, tags: ['prestige', 'luxury', 'collectible'], dem: { 3: 2, 4: 9 }, fakeRisk: 1,
  },
  signedBall: {
    name: 'Signed Game-Used Baseball', icon: '⚾', base: 150, sc: 7, dep: 1, tags: ['collectible', 'prestige'], dem: { 3: 3, 4: 7 }, fakeRisk: 1,
  },
};

export const buyers = {
  // ================================================================== The Scrap Yard
  student: {
    zone: 1, name: 'Wen, stressed student', icon: '🎒', pop: 0.9, like: { tool: 1, office: 0.7, paper: 0.7, prestige: 0.55 }, budget: [0.1, 8],
    style: 'impulsive', patience: 4, bias: 'utility', hello: 'My thesis is due at nine and nothing is holding it together. Got a clip?',
    holds: [{ cls: 'pen' }, { cls: 'paperbacks' }, { cls: 'oddHardware' }],
  },
  mechanic: {
    zone: 1, name: 'Hector, yard mechanic', icon: '🔧', pop: 0.7, like: { vehicle: 0.9, scrap: 0.9, industrial: 0.85, tool: 0.6, electronics: 0.3 }, budget: [0.4, 14],
    style: 'analytical', patience: 5, bias: 'utility', hello: "Everything on this lot runs if you know where to hit it. What've you got?",
    holds: [{ cls: 'bike', cond: 'broken' }, { cls: 'radio', cond: 'broken' }, { cls: 'oddHardware' }, { cls: 'scrap' }],
  },
  scrapper: {
    zone: 1, name: 'Big Lou, scrap broker', icon: '🏗️', pop: 0.8, like: { scrap: 1, industrial: 0.8, vehicle: 0.4, tool: 0.4 }, budget: [0.3, 12],
    style: 'hard', patience: 4, bias: 'price', hello: "Weight is weight. Put it on the scale and we'll talk numbers.",
    holds: [{ cls: 'scrap' }, { cls: 'oddHardware' }],
  },
  marguerite: {
    zone: 1, name: 'Marguerite, retired seamstress', icon: '🧵', pop: 0.45, like: { home: 1, retro: 0.7, tool: 0.6, paper: 0.5 }, budget: [0.2, 7],
    style: 'friendly', patience: 6, bias: 'story', hello: 'I keep a drawer of small useful things. Tell me where yours has been.',
    holds: [{ cls: 'fleaRecords' }, { cls: 'pen' }, { cls: 'paperbacks' }],
  },
  barista: {
    zone: 1, name: 'Lucia, food-truck barista', icon: '☕', pop: 0.5, like: { office: 0.8, retro: 0.5, paper: 0.5, consumer: 0.4 }, budget: [0.2, 6],
    style: 'friendly', patience: 5, bias: 'price', hello: 'Orders are piling up and my pen just died. Make me a fair offer?',
    holds: [{ cls: 'pen' }, { cls: 'paperbacks' }],
  },
  dmitri: {
    zone: 1, name: 'Dmitri, junk sculptor', icon: '🎨', pop: 0.3, like: { scrap: 0.8, collectible: 0.6, retro: 0.5, industrial: 0.5, tool: 0.4 }, budget: [0.3, 10],
    style: 'impulsive', patience: 4, bias: 'scarcity', hello: 'I weld whatever the yard throws away. Show me something with a story.',
    holds: [{ cls: 'fleaBox' }, { cls: 'scrap' }, { cls: 'oddHardware' }],
  },

  // ================================================================== Flea Market Row
  collector: {
    zone: 2, name: 'Mr. Abernathy, serious collector', icon: '🧐', pop: 0.6, like: { retro: 1, collectible: 0.9, prestige: 0.85, electronics: 0.4 }, budget: [1.5, 70],
    style: 'hard', patience: 4, bias: 'prestige', hello: 'Condition, provenance, price. In that order. Show me.',
    holds: [{ cls: 'pen' }, { cls: 'radio' }, { cls: 'fleaRecords' }],
  },
  dolores: {
    zone: 2, name: 'Dolores, apartment stager', icon: '🛋️', pop: 0.65, like: { home: 1, retro: 0.7, consumer: 0.4, paper: 0.4 }, budget: [1, 48],
    style: 'friendly', patience: 6, bias: 'story', hello: 'Three shelves of charm by Friday. Charm costs extra, dear.',
    holds: [{ cls: 'paperbacks' }, { cls: 'radio' }, { cls: 'dormFridge' }],
  },
  tariq: {
    zone: 2, name: 'Tariq, street busker', icon: '🎷', pop: 0.45, like: { media: 1, electronics: 0.6, retro: 0.5, tool: 0.3 }, budget: [0.8, 36],
    style: 'impulsive', patience: 3, bias: 'utility', hello: 'My amp is dead and my crowd is already here. Anything with a speaker?',
    holds: [{ cls: 'fleaRecords' }, { cls: 'pen' }],
  },
  burt: {
    zone: 2, name: 'Burt, mystery-box gambler', icon: '🎲', pop: 0.7, like: { collectible: 0.9, consumer: 0.6, trend: 0.5 }, budget: [1, 55],
    style: 'impulsive', patience: 3, bias: 'scarcity', hello: "Sealed means anything could be inside. That's why I love it.",
    holds: [{ cls: 'fleaBox' }, { cls: 'enamelPins' }],
  },
  okonkwo: {
    zone: 2, name: 'Mrs. Okonkwo, school librarian', icon: '👓', pop: 0.5, like: { paper: 1, office: 0.6, home: 0.4 }, budget: [0.6, 28],
    style: 'analytical', patience: 6, bias: 'price', hello: 'The school library fund is thin. I read every price twice.',
    holds: [{ cls: 'paperbacks' }, { cls: 'courseBooks' }],
  },
  walt: {
    zone: 2, name: 'Walt, retired handyman', icon: '🛠️', pop: 0.4, like: { tool: 1, scrap: 0.7, electronics: 0.5, home: 0.4 }, budget: [0.8, 32],
    style: 'analytical', patience: 5, bias: 'utility', hello: "If it has a screw, I can fix it. If it doesn't, I'll add one.",
    holds: [{ cls: 'oddHardware' }, { cls: 'radio', cond: 'broken' }, { cls: 'bike', cond: 'broken' }, { cls: 'dormFridge', cond: 'broken' }],
  },

  // ================================================================== Campus Quad
  bookstore: {
    zone: 3, name: 'Delphine, campus bookstore buyer', icon: '📖', pop: 0.95, like: { paper: 1, training: 0.6, collectible: 0.5, office: 0.4 }, budget: [4, 220],
    style: 'analytical', patience: 5, bias: 'price', hello: 'Buyback week. Spines out, titles up, and I quote fast.',
    holds: [{ cls: 'courseBooks' }, { cls: 'graphCalc' }],
  },
  cyclist: {
    zone: 3, name: 'Aiko, weekend road cyclist', icon: '🚴', pop: 0.4, like: { outdoor: 1, vehicle: 0.8, consumer: 0.5, trend: 0.3 }, budget: [5, 160],
    style: 'friendly', patience: 5, bias: 'prestige', hello: "Hills don't climb themselves. Is the frame straight?",
    holds: [{ cls: 'bike' }],
  },
  priya: {
    zone: 3, name: 'Priya, dorm RA', icon: '🏠', pop: 0.8, like: { home: 1, consumer: 0.7, fashion: 0.5, trend: 0.55 }, budget: [4, 150],
    style: 'impulsive', patience: 4, bias: 'utility', hello: 'Forty freshmen, zero furniture, and move-in is Friday.',
    holds: [{ cls: 'spiritHoodies' }, { cls: 'dormFridge' }],
  },
  bree: {
    zone: 3, name: 'Bree, campus thrift flipper', icon: '🤳', pop: 0.9, like: { trend: 1, fashion: 0.9, collectible: 0.6, consumer: 0.4 }, budget: [4, 140],
    style: 'impulsive', patience: 3, bias: 'scarcity', hello: 'Everyone will be wearing it by Friday. I need it by Thursday.',
    holds: [{ cls: 'spiritHoodies' }, { cls: 'enamelPins' }],
  },
  kenji: {
    zone: 3, name: 'Kenji, physics tutor', icon: '🧪', pop: 0.45, like: { training: 1, paper: 0.8, electronics: 0.6, office: 0.5 }, budget: [4, 150],
    style: 'analytical', patience: 6, bias: 'utility', hello: 'Midterms are in three weeks. Calculators and old notes vanish fast.',
    holds: [{ cls: 'graphCalc' }, { cls: 'courseBooks' }],
  },
  jonah: {
    zone: 3, name: 'Jonah, commuting grad student', icon: '🚌', pop: 0.55, like: { vehicle: 0.9, outdoor: 0.7, consumer: 0.5, home: 0.4 }, budget: [3, 110],
    style: 'hard', patience: 4, bias: 'price', hello: 'Three buses to campus. A bike would give me an hour back every day.',
    holds: [{ cls: 'bike', cond: 'broken' }, { cls: 'graphCalc' }],
  },

  // ================================================================== Pawn District
  salPawn: {
    zone: 4, name: 'Sal, pawnbroker at Golden Anchor', icon: '🏪', pop: 0.9, like: { electronics: 0.8, vehicle: 0.6, tool: 0.6, collectible: 0.6, prestige: 0.5 }, budget: [20, 700],
    style: 'hard', patience: 4, bias: 'price', hello: 'Everything has a price, friend. Usually lower than you think.',
    holds: [{ cls: 'pawnGuitar' }, { cls: 'pawnLaptop', cond: 'broken' }, { cls: 'bike' }],
  },
  okafor: {
    zone: 4, name: 'Mr. Okafor, watch and jewelry dealer', icon: '💎', pop: 0.35, like: { luxury: 1, prestige: 0.9, collectible: 0.7, gem: 0.5 }, budget: [45, 1100],
    style: 'analytical', patience: 6, bias: 'prestige', hello: 'Provenance first. Pictures later, if ever.',
    holds: [{ cls: 'pawnWatch' }],
  },
  gilFan: {
    zone: 4, name: 'Gil, sports memorabilia fan', icon: '🧢', pop: 0.5, like: { collectible: 1, prestige: 0.6, retro: 0.5, media: 0.3 }, budget: [25, 600],
    style: 'impulsive', patience: 4, bias: 'scarcity', hello: "Dad's glove, my ticket stubs. Now I want one real signed ball.",
    holds: [{ cls: 'signedBall' }],
  },
  hollis: {
    zone: 4, name: 'Hollis, gigging guitarist', icon: '🎤', pop: 0.55, like: { media: 1, retro: 0.8, collectible: 0.4, electronics: 0.3 }, budget: [20, 450],
    style: 'friendly', patience: 6, bias: 'story', hello: 'A string snapped mid-song last night. I need something that sounds right.',
    holds: [{ cls: 'pawnGuitar', cond: 'broken' }],
  },
  dexCourier: {
    zone: 4, name: 'Dex, bike courier', icon: '🛵', pop: 0.6, like: { vehicle: 0.9, outdoor: 0.8, electronics: 0.5, tool: 0.4 }, budget: [12, 300],
    style: 'impulsive', patience: 3, bias: 'utility', hello: "Forty drops a day. If it rolls and it's cheap, I'm listening.",
    holds: [{ cls: 'bike' }],
  },
  ines: {
    zone: 4, name: 'Ines, freelance video editor', icon: '🎬', pop: 0.5, like: { electronics: 1, digital: 0.9, media: 0.6, training: 0.4 }, budget: [35, 800],
    style: 'analytical', patience: 5, bias: 'utility', hello: 'Render deadline in two days and my laptop just died. Specs matter.',
    holds: [{ cls: 'pawnLaptop', cond: 'broken' }],
  },
};
