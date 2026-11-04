// Copy pass, part 2, package P5: the data text (buyer lines, the Backgrounds' claims, the skill, manager, upgrade, client, audit and shock lines) and the Draft's own words,
// held against the engine and the data. Every number a text states is recomputed here from the engine or the data, never copied from the text; a claim the engine does not make is a failure.
//   D1  the two engine facts a district's words lean on that no other test holds: an urgent buyer is quoted from their need, and the winner of an auction often pays more than the lot is worth (a district has no blurb now;
//       the shares, customs, fads, spoilage, rent, season, haggle and rewards its rule prints are held by tests/audit-content.test.mjs and tests/copy2-drawers.test.mjs)
//   D2  a buyer's line is short, in the buyer's voice, and the set is shorter than it was
//   D3  a Background's claim names no figure the mods do not hold, and the claims that were wrong are right (the immigrant's margin, the trades' haggle, the creator's goodwill, the roots' trust, the pro's inspections, the second chance's warnings)
//   D4  the skill, manager, upgrade and client lines say what the engine does; a manager is a manager, not a pipeline
//   D5  the shocks and the audits say what the engine does (the tariff slows lanes; it does not lock freight)
//   D6  the Draft says the paperclip once, asks nothing, and shows a summary only when there is a build to summarize
// Run: node --test tests/copy2-data.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };

const { Game } = await import('../js/engine.js');
const C = await import('../js/config.js');
const { ZONES, ASSETS, BUYERS, PERKS, SKILLS, PIPE, UPGRADES, CLIENTS, LOANS, AUDIT_THEMES, EVENTS, AUDIT, FEES, BASE_RATE, ECON } = C;
const { haggleParams, inspectParams, auctionParams, planFor, startRun } = await import('../js/deal.js');
const haggle = await import('../js/play/haggle.js');
const auction = await import('../js/play/auction.js');
const D = await import('../js/ui/draft.js');
const market = (await import('../js/ui/drawers/market.js')).default;
const { fakeCtx } = await import('./helpers/ctx.mjs');

const mk = (perks = [], seed = 1, extra = {}) => { const g = new Game({ perks, seed, handle: 'T', pid: 'T-' + seed, ...extra }); g.env.algo = false; g.s.events = []; return g; };
const rich = (g, cash) => { g.s.cash = cash; g._unlock(); return g; };
const put = (g, cls, zone, o = {}) => { const a = g._mk(g.s, cls, { zone, basis: o.basis ?? 1, cond: o.cond }); g.s.assets.push(a); return a; };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const words = (t) => t.trim().split(/\s+/).length;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pc = (x) => Math.round(x * 100);
const nums = (t, re) => [...t.matchAll(re)].map((m) => +m[1].replace(/,/g, ''));

/** Lots made in a district: shares of broken, fake, auction and warned lots (the rates a district's rules give are rates of LOTS). */
function lotShares(zone, cash, perks = [], n = 4000) {
  const g = mk(perks, 11); g.s.cash = cash; g._unlock();
  if (!g.s.zones.includes(zone)) g._openZone(zone);
  const s = { n: 0, broken: 0, fake: 0, auction: 0, warned: 0, warnedHonest: 0, q: [] };
  for (let i = 0; i < n; i++) {
    g.s.lots[zone] = []; g._spawnLot(zone, false);
    const l = g.s.lots[zone][0]; if (!l) continue;
    s.n++; if (l.cond === 'broken') s.broken++; if (l.truth.fake) s.fake++; if (l.mode === 'auction') s.auction++;
    if (l.warn) { s.warned++; if (!l.truth.fake) s.warnedHonest++; }
    if (l.cls === 'fleaBox') s.q.push(l.truth.q);
  }
  return s;
}
/** New buyers that turn up in a district over `hours` (the player takes every one at once). The rate is deterministic and the same on every seed, so a ratio of two counts is exact to about 0.01 and a wider band is slack; only which buyer arrives is drawn. */
function arrivals(g, zone, hours = 300) {
  let n = 0; g.s.leads[zone] = [];
  for (let h = 0; h < hours; h++) { g.advanceTo(g.s.hour + 1); n += g.s.leads[zone].length; g.s.leads[zone] = []; }
  return n;
}

// ---------------------------------------------------------------------------------------------------------------------
// D1. two engine facts a district's words lean on (the Scrap Yard's urgent buyers, the Estate Sales' winners)
// ---------------------------------------------------------------------------------------------------------------------
test('D1 Scrap Yard: an urgent buyer is quoted from their need, not from the crate\'s fair value and never from what it cost', () => {
  const g = mk(); const pen = put(g, 'pen', 1); pen.known = true;
  const budget = g.val(pen) * 6;
  const calm = { id: 'LC', zone: 1, seg: 'student', budget, need: null, born: 0, exp: 999 }, urgent = { id: 'LU', zone: 1, seg: 'student', budget, need: 'prestige', born: 0, exp: 999 };
  g.s.leads[1].push(calm, urgent);
  const pCalm = g.quotePitch(pen.id, 'LC', undefined, { blind: false }).price, pUrgent = g.quotePitch(pen.id, 'LU', undefined, { blind: false }).price;
  assert.ok(pUrgent > 2 * pCalm, `the buyer in need pays ${pUrgent.toFixed(2)}, the calm one ${pCalm.toFixed(2)}, for the same pen`);
  // ...and the same pen, bought for next to nothing or for a fortune, is quoted alike
  const quoteAt = (basis) => { const x = mk(), a = put(x, 'pen', 1, { basis }); a.known = true; x.s.leads[1].push({ id: 'LU', zone: 1, seg: 'student', budget, need: 'prestige', born: 0, exp: 999 }); return x.quotePitch(a.id, 'LU', undefined, { blind: false }).price; };
  assert.equal(quoteAt(0.01), quoteAt(1000));
});

test('D1 Estate Sales: a winner at auction often pays more than the lot is worth (the engine\'s side of the winner\'s curse)', () => {
  // "Overpay" is the price at the hammer against what the lot is worth, and the Deal Room has two worths for an auction lot: the auction's own true value (the lesson's surplus, the quests)
  // and the engine's value of the crate (DealRun.worth, which the card's "Paid a little too much" uses). Play each auction through, bidding up to your own estimate.
  const hammer = (p) => { let a = auction.create(p); for (let i = 0; i < 500 && !a.done; i++) { const v = auction.view(a); a = auction.act(a, { type: v.yourTurn && v.actions.some((x) => x.type === 'bid') && v.nextBid <= p.estimate + 1e-9 ? 'bid' : 'drop' }).state; } return auction.result(a); };
  const g = rich(mk(), 3000), won = { n: 0, overTrue: 0, overWorth: 0, fakes: 0, fakesOver: 0 };
  for (let i = 0; i < 300; i++) {
    g.s.lots[6] = []; g._spawnLot(6); const lot = g.s.lots[6][0];
    if (!lot || lot.mode !== 'auction') continue;
    const run = startRun(g, { kind: 'buy', zone: 6, lotId: lot.id }), secret = run.secret(), worth = run.worth(secret);
    assert.ok(auctionParams(g, 6, lot, { seed: 1 }).bidders.length >= 2, 'a field of rivals');
    for (let seed = 1; seed <= 12; seed++) {
      const p = auctionParams(g, 6, lot, { seed }), res = hammer(p); if (!res.won) continue;
      won.n++; if (res.price > p.trueValue) won.overTrue++; if (res.price > worth) won.overWorth++;
      if (secret.fake) { won.fakes++; if (res.price > p.trueValue && res.price > worth) won.fakesOver++; }
    }
  }
  assert.ok(won.n > 1000 && won.fakes > 50 && won.fakesOver === won.fakes, 'winners enough to count, and whoever wins a counterfeit (worth 8% of what it looks) overpays by either worth');
  const shares = [won.overTrue / won.n, won.overWorth / won.n], low = Math.min(...shares);
  assert.ok(low > 0.15, `${pc(shares[0])}% of the winners paid more than the auction's true value, ${pc(shares[1])}% more than the crate's worth: "often" is more than one win in seven by both (a majority, "tend to", is not what the engine gives by the first)`);
  // the mechanism the Codex names, apart from the price: the highest estimate wins, and it runs high (the same on every lot, so the last one will do)
  const lot = g.s.lots[6][0], runs = Array.from({ length: 3000 }, (_, i) => { const p = auctionParams(g, 6, lot, { seed: i + 1 }); return { est: p.estimate, win: p.estimate > Math.max(...p.bidders.map((x) => x.limit)) }; });
  const top = runs.filter((x) => x.win);
  assert.ok(top.length > 20 && mean(top.map((x) => x.est)) > 1.02 * mean(runs.map((x) => x.est)), `the estimates that win average ${(mean(top.map((x) => x.est)) / mean(runs.map((x) => x.est))).toFixed(3)}x all of them`);
});

// ---------------------------------------------------------------------------------------------------------------------
// D2. the buyers' lines
// ---------------------------------------------------------------------------------------------------------------------
/** The 101 buyers whose lines this pass wrote. A later package may add buyers; those are held to the schema's 90 characters and to the mean below, these to the tighter bound. */
const THIS_PASS = [
  'student mechanic scrapper marguerite barista dmitri collector dolores tariq burt okonkwo walt bookstore cyclist priya bree kenji jonah salPawn okafor',
  'gilFan hollis dexCourier ines trainer boutique etailer recruiter freelancer cowork popup antiqueDealer designer recordShop watchCollector boxFlipper',
  'thrift smelog dealerGroup rideshare classicCollector toolTruck restorer autoMarketplace boatyard shipyard forwarder bigBox fastFashion liquidator',
  'halvorsenParts lakeshorePower stBrigidsHospital dombrowskiFoundry reyesConstruction corridorFreight northfieldVets entIT vcstart brindleAcquihire',
  'rackspanResellers pixelPineAgency tallowGames corvidMlLab marloweGrocers goldenValleyMill elmwoodCoop hearthHiveGroup ridgelineDealer prairieBiofuels',
  'marigoldPictures lanternStream oldGoldRecords brightleafLicensing northbridgeRoyalty wavelengthCollective holdco franchisor lakeshoreHealth',
  'harbourlinePE altitudeSI pinecrestChain ironbridgeMfg harborTrustBank kestrelFund countyTreasurer graniteMutual tillmanFactor echoRights cobaltReit',
  'okaforLandlord tidewaterDev nimbusCloud redlineFreight aldrinOffice rochatGeneva sanghviMumbai laiwingHK almansooriDubai norlandFund whitcombeMuseum',
].join(' ').split(' ');
test('D2: a buyer\'s line is short, plain and its own (no two alike), and the set is shorter than the 13.6 words a line took', () => {
  const all = Object.entries(BUYERS).map(([id, b]) => [id, b.hello]), mine = all.filter(([id]) => THIS_PASS.includes(id));
  assert.equal(mine.length, 101, 'every buyer of this pass is still there');
  for (const [id, h] of all) {
    assert.ok(h.length <= 90 && words(h) <= 16, `${id}: ${h.length} characters, ${words(h)} words`);
    assert.doesNotMatch(h, /[\u2013\u2014]/, `${id}: no dash`);
    assert.doesNotMatch(h, /\b(synerg|leverage your|reach out|circle back|touch base|deep dive|robust|seamless|cutting-edge|game-changer)/i, `${id}: no business-speak`);
  }
  for (const [id, h] of mine) assert.ok(h.length <= 80 && words(h) <= 12, `${id}: ${h.length} characters, ${words(h)} words`);
  assert.equal(new Set(all.map(([, h]) => h)).size, all.length, 'no two buyers say the same');
  assert.ok(mean(mine.map(([, h]) => words(h))) <= 11, `a line takes ${mean(mine.map(([, h]) => words(h))).toFixed(1)} words`);
  assert.ok(mean(all.map(([, h]) => words(h))) <= 12, 'and so does the whole set, new buyers too');
  // the line still says what the buyer wants (spot checks on the characters the lines were cut for): the line keeps a word that points at its good, and the buyer likes that good
  const cue = {
    trainer: ['training', /binder/], boutique: ['fashion', /rack/], etailer: ['electronics', /spec sheet/], thrift: ['home', /furniture/], boatyard: ['marine', /haul-out|engines/i],
    lakeshorePower: ['energy', /uptime/], marloweGrocers: ['food', /shelf life/i], ridgelineDealer: ['farm', /hours meter|hydraulics/], almansooriDubai: ['luxury', /best pieces/], cobaltReit: ['realty', /cap rate|operating income/i],
  };
  for (const [id, [tag, re]] of Object.entries(cue)) {
    assert.match(BUYERS[id].hello, re, `${id}: the line no longer points at ${tag}`);
    assert.ok((BUYERS[id].like[tag] || 0) >= 0.5, `${id} likes ${tag}`);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// D3. the Backgrounds' claims
// ---------------------------------------------------------------------------------------------------------------------
/** Every figure a mod could be quoted as: its percent distance from 1, its percent size, and a rate or a cap inside an object. */
function figures(mods) {
  const out = new Set(), add = (v) => { if (typeof v === 'number' && Number.isFinite(v)) for (const x of [Math.abs(1 - v) * 100, Math.abs(v) * 100]) out.add(+x.toFixed(1)); };
  for (const v of Object.values(mods)) { if (v && typeof v === 'object') for (const x of Object.values(v)) add(x); else add(v); }
  return out;
}
test('D3: every percent a Background\'s claim quotes is a figure of its mods, and every dollar amount is its bank floor or its garnishment cap', () => {
  for (const [id, p] of Object.entries(PERKS)) {
    const have = figures(p.mods); if (id === 'native') have.add(1); // a check's 1% is no mod: 'D3 native' recomputes it from the engine
    for (const [what, t] of [['strength', p.strength], ['cost', p.cost]]) {
      for (const n of nums(t, /(\d+(?:\.\d+)?)%/g)) assert.ok(have.has(n), `${id}.${what}: "${n}%" is no figure of the mods (${[...have].join(', ')})`);
      for (const d of nums(t, /\$([\d,]+)/g)) assert.ok(d === p.mods.bankMinNW || d === p.mods.garnish?.cap, `${id}.${what}: $${d}`);
    }
  }
  // the multipliers a claim words in "x"
  assert.ok(PERKS.immigrant.cost.includes(`${PERKS.immigrant.mods.auditMult}x as often`));
  assert.ok(PERKS.second.cost.includes(`${PERKS.second.mods.fineMult}x`));
  assert.ok(PERKS.native.cost.includes(`${pc(PERKS.native.mods.scamRate)}% of buyers`) && PERKS.native.cost.includes(`${(PERKS.native.mods.subscription.rate * 100).toFixed(1)}% of your cash a month`));
  assert.ok(PERKS.connected.cost.includes(`every ${PERKS.connected.mods.familyTax.everyHours / 24} days`));
  assert.ok(PERKS.gigger.cost.includes(`every ${PERKS.gigger.mods.burnout.everyDays} days`));
  for (const [id, p] of Object.entries(PERKS)) { assert.ok(words(p.strength) <= 31 && words(p.cost) <= 20, `${id}`); assert.doesNotMatch(p.strength + ' ' + p.cost, /pipeline|alumni|theory over|third base|whiplash|credit-invisible|scam magnet/i, id); }
  const total = Object.values(PERKS).reduce((n, p) => n + words(p.strength) + words(p.cost), 0);
  assert.ok(total <= 350, `the twenty-four claims hold ${total} words (they held 373)`);
});

test('D3 immigrant: international lanes earn 1.4x the domestic margin, not 1.3x (the old "+10 points of margin" was a tenth of a multiplier)', () => {
  const s = PERKS.immigrant.strength;
  assert.match(s, /International lanes earn 1\.4x the domestic margin instead of 1\.3x/); assert.doesNotMatch(s, /points of margin/);
  const ratio = (perks) => { const g = mk(perks); g._openZone(5); const f = (channel) => g.forecast({ kind: 'broker', zone: 5, level: 1, alloc: 500, channel, cycles: 0 }).margin; return f('intl') / f('dom'); };
  near(ratio([]), 1.3, 1e-9); near(ratio(['immigrant']), 1.4, 1e-9);
  assert.ok(s.includes(`${pc(PERKS.immigrant.mods.circle.pct)}% of net worth`) && s.includes(`${pc(1 - PERKS.immigrant.mods.freightMult)}% cheaper`));
  const g = mk(['immigrant']); g.s.cash = 0; assert.equal(g.loanRate('circle'), 0, 'the Circle charges no interest');
});

test('D3 trades: a haggle has one round fewer, and a pitch is 8% lower', () => {
  const c = PERKS.trades.cost;
  assert.ok(/every haggle has one round fewer/.test(c) && c.includes(`Pitch prices are ${pc(1 - PERKS.trades.mods.pitchMult)}% lower`), c); assert.doesNotMatch(c, /less patience|Not a salesperson/);
  const rounds = (perks) => haggle.create({ ...haggleParams(mk(perks), { role: 'sell', fair: 10, buyer: { style: 'friendly', patience: 5 }, lead: { budget: 100 }, zone: 3, seed: 5 }), seed: 5 }).n;
  assert.equal(rounds(['trades']), rounds([]) - 1);
  const buy = (perks) => haggle.create({ ...haggleParams(mk(perks), { role: 'buy', fair: 10, lot: { price: 10 }, style: 'friendly', zone: 3, seed: 5 }), seed: 5 }).n;
  assert.equal(buy(['trades']), buy([]) - 1, 'buying too');
});

test('D3 creator: a rejected or no-gain pitch halves the arrival of buyers for two days, and other demand swings by the stated share every three days', () => {
  const c = PERKS.creator.cost, m = PERKS.creator.mods;
  assert.ok(/[Rr]ejected or no-gain pitch halves buyer arrivals for 2 days/.test(c) && c.includes(`up to ${pc(m.volatility)}% every 3 days`), c);
  const calm = mk(); const sulk = mk(); sulk.s.ps.goodwillUntil = 1e9;
  const a = arrivals(calm, 1, 400), b = arrivals(sulk, 1, 400);
  assert.ok(Math.abs(b / a - 0.5) < 0.03, `${b} arrivals against ${a}: halved means 0.5x, and the count is exact`);
  const f = mk(['creator']), pen = put(f, 'pen', 1); f.s.leads[1].push({ id: 'LX', zone: 1, seg: 'mechanic', budget: 50, need: null, born: 0, exp: 999 }); // a buyer who has no use for a pen
  const h0 = f.s.hour, rep0 = f.s.rep, r = f.pitch(pen.id, 'LX');
  assert.equal(r.outcome, 'rejected'); assert.equal(f.s.ps.goodwillUntil - h0, 48, 'two days'); assert.equal(rep0 - f.s.rep, m.flopRep, 'and the reputation it costs');
  // a no-gain pitch is also a sale that does not clear fair value by 2% ("Traded, no gain."): the same two days and half the reputation; a sale that wins costs nothing, and only a Creator pays
  const trade = (perks, share, need) => { const x = mk(perks, 3), a = put(x, 'pen', 1); a.known = true; x.s.leads[1].push({ id: 'LS', zone: 1, seg: 'student', budget: share * x.val(a), need, born: 0, exp: 999 }); return { x, a, h0: x.s.hour, rep0: x.s.rep, r: x.pitch(a.id, 'LS') }; };
  const flat = trade(['creator'], 0.9, null);
  assert.equal(flat.r.outcome, 'flat'); assert.ok(!flat.x.s.assets.some((a) => a.id === flat.a.id), 'the pen was sold');
  assert.equal(flat.x.s.ps.goodwillUntil - flat.h0, 48, 'a sale below fair value costs the same two days'); assert.equal(flat.rep0 - flat.x.s.rep, m.flopRep / 2, 'and half the reputation');
  const won = trade(['creator'], 6, 'prestige'); assert.equal(won.r.outcome, 'win'); assert.equal(won.x.s.ps.goodwillUntil, 0, 'a winning sale costs nothing');
  assert.equal(trade([], 0.9, null).x.s.ps.goodwillUntil, 0, 'and only a Creator is penalized');
  const crowd = (day) => { const x = mk(['creator']); x.s.hour = day * 24; return x.crowd('paperbacks', 1); };
  const swing = [3, 6, 9, 12, 15, 18, 21, 24].map(crowd);
  assert.ok(Math.max(...swing) - Math.min(...swing) > 0.03 && Math.max(...swing) <= 1 + m.volatility + 1e-9 && Math.min(...swing) >= 1 - m.volatility - 1e-9, swing.join(' '));
});

test('D3 roots: repeat buyers bring up to the loyalty share more, and the engine has no "trust" to give', () => {
  const s = PERKS.roots.strength, m = PERKS.roots.mods;
  assert.ok(s.includes(`up to ${pc(m.loyalty)}% bigger budgets`) && !/trust/.test(s), s);
  assert.deepEqual(Object.keys(m).sort(), ['farLeadMult', 'freightMult', 'loyalty', 'overheadMult'], 'four mods, none of them trust');
  // the budget of a returning buyer: three sales to the segment earn the full share
  const draw = (loyal) => { const out = []; for (let seed = 1; seed <= 200; seed++) { const g = mk(['roots'], seed); g._openZone(1); g.s.loyal.student = loyal; g.s.leads[1] = []; g._spawnLead(1); const l = g.s.leads[1][0]; if (l?.seg === 'student') out.push(l.budget); } return out; };
  const b0 = draw(0), b3 = draw(3); assert.ok(b0.length > 15 && b0.length === b3.length);
  const ratio = mean(b3) / mean(b0); assert.ok(ratio > 1.1 && ratio <= 1 + m.loyalty + 1e-9, `${ratio.toFixed(3)}x`);
  const far = (perks, z) => { const g = mk(perks); rich(g, ZONES[z].gate + 5e3); return arrivals(g, z, 300); };
  const share = far(['roots'], 9) / far([], 9), edge = far(['roots'], 8) / far([], 8);
  assert.ok(Math.abs(share - m.farLeadMult) < 0.03, `beyond district 8: ${share.toFixed(3)}x`); assert.ok(Math.abs(edge - 1) < 0.03, `in district 8 itself: ${edge.toFixed(3)}x`);
  assert.ok(PERKS.roots.cost.includes('beyond district 8') && PERKS.roots.cost.includes(`${pc(1 - m.farLeadMult)}% fewer`) && PERKS.roots.cost.includes(`${pc(m.freightMult - 1)}% more`));
});

test('D3 native: a buyer is a fraud at the stated rate and verifying costs 1% of their budget', () => {
  const c = PERKS.native.cost; assert.doesNotMatch(c, /unless you verify|checking/); assert.match(c, /\(verifying costs 1% of their budget\)/);
  const g = mk(['native']); g.s.trades = 5; let frauds = 0, n = 0;
  for (let i = 0; i < 1500; i++) { g.s.leads[1] = []; g._spawnLead(1); const l = g.s.leads[1][0]; if (l) { n++; if (l.scam) frauds++; } }
  assert.ok(Math.abs(frauds / n - PERKS.native.mods.scamRate) < 0.03, `${pc(frauds / n)}% of ${n} buyers`);
  const plan = (perks) => { const x = mk(perks), a = put(x, 'pen', 1); x.s.leads[1].push({ id: 'L9', zone: 1, seg: 'student', budget: 40, need: null, born: 0, exp: 999 }); return planFor(x, { kind: 'sell', assetId: a.id, leadId: 'L9' }); };
  assert.ok(plan(['native']).canVerify && !plan([]).canVerify, 'only a Digital Native can check a buyer'); near(plan(['native']).verifyCost, 0.4, 1e-9); // 1% of the buyer's budget
  assert.ok(c.includes(`verifying costs ${pc(plan(['native']).verifyCost / 40)}% of their budget`), c); // the lead in this plan has a budget of 40
});

test('D3 second chance: most counterfeit lots carry a warning, and no honest lot does', () => {
  const s = PERKS.second.strength; assert.match(s, /Most counterfeit lots carry a warning/); assert.doesNotMatch(s, /Spots counterfeits|free warning/);
  const x = lotShares(4, 1000, ['second'], 3000);
  assert.ok(x.fake > 300); assert.equal(x.warnedHonest, 0, 'never an honest lot'); const share = x.warned / x.fake;
  assert.ok(share > 0.8 && share < 1, `${pc(share)}% of the fakes are flagged (the street sense misses ${pc(ECON.warnMiss)}%)`);
  assert.ok(s.includes(`${pc(PERKS.second.mods.lotDiscountGray)}% cheaper in gray-market districts`));
  assert.deepEqual(Object.values(ZONES).filter((z) => z.rules.gray).map((z) => z.id), [4, 16], 'the gray-market districts');
});

test('D3 pro: inspections are more accurate, a mentor speaks each week, and every haggle step has advice', () => {
  const s = PERKS.pro.strength; assert.match(s, /More accurate inspections/); assert.match(s, /advice at every haggle step/); assert.doesNotMatch(s, /steady hands|Appraisal sense|\+2 inspection accuracy/);
  const acc = (perks) => { const g = mk(perks); g._openZone(4); return inspectParams(g, 4, g.s.lots[4][0]).accuracy; };
  assert.ok(acc(['pro']) > acc([]), 'the inspection game is given a better accuracy'); near(acc(['pro']) - acc([]), 0.05 * PERKS.pro.mods.inspectBonus, 1e-9);
  const withAssist = haggle.create({ ...haggleParams(mk(['pro']), { role: 'sell', fair: 10, buyer: { style: 'hard', patience: 5 }, lead: { budget: 100 }, zone: 3, seed: 7 }), seed: 7 });
  assert.equal(withAssist.assist, true); assert.ok(haggle.view(withAssist).advice, 'the haggle shows the textbook move');
  assert.equal(haggle.create({ ...haggleParams(mk([]), { role: 'sell', fair: 10, buyer: { style: 'hard', patience: 5 }, lead: { budget: 100 }, zone: 3, seed: 7 }), seed: 7 }).assist, false);
  const g = mk(['pro']); g.advanceTo(24 * 7); assert.ok(g.s.news.some((n) => /Your mentor says/.test(n.text)), 'a mentor tip arrives on the seventh day');
});

test('D3 the Backgrounds the pass left alone still say what the engine does', () => {
  assert.ok(PERKS.grad.strength.includes('12% bigger budgets') && PERKS.grad.cost.includes('5% of every profit goes to student loans until $3,000 is repaid'));
  assert.ok(PERKS.heir.strength.startsWith('Once per run the family clears 60% of your debt') && PERKS.heir.cost.includes('learn 10% slower') && PERKS.heir.cost.includes('No specialty'));
  assert.ok(/Manager overhead 25% lower/.test(PERKS.veteran.strength) && /Trend goods sell 20% lower/.test(PERKS.veteran.cost));
  assert.ok(/manager overhead is 15% lower/.test(PERKS.roots.strength) && /manager cycles 10% shorter/.test(PERKS.gigger.strength));
  const g = mk(['veteran']); near(g.P.overheadMult, 0.75); const h = mk(['gigger']); near(h.P.cycleMult, 0.9);
  const f = (perks) => mk(perks).forecast({ kind: 'broker', zone: 1, level: 1, alloc: 100 }).overhead; assert.ok(f(['veteran']) < f([]), 'the veteran\'s overhead is a manager\'s overhead');
});

// ---------------------------------------------------------------------------------------------------------------------
// D4. skills, managers, upgrades, clients, loans
// ---------------------------------------------------------------------------------------------------------------------
test('D4: the three skill lines say what a level does', () => {
  assert.equal(SKILLS.ops.blurb, 'Cheaper, better repairs and cheaper working lots, but dearer wrecks. Less manager overhead.');
  assert.equal(SKILLS.growth.blurb, 'More buyers, faster cycles, cheaper clients, higher pitch prices.');
  assert.equal(SKILLS.fintech.blurb, 'Cheaper loans and fees, earlier warnings of shocks.');
  const at = (k, level) => { const g = mk(); g._openZone(5); g.s.skills[k] = level; return g; };
  const lo = at('growth', 1), hi = at('growth', 5);
  assert.ok(hi.growthMult() > lo.growthMult(), 'higher pitch prices');
  assert.ok(hi.cycleLen({ kind: 'broker', zone: 5, alloc: 100, level: 1 }) < lo.cycleLen({ kind: 'broker', zone: 5, alloc: 100, level: 1 }), 'faster cycles');
  assert.ok(hi.clientQuote('smb').cac < lo.clientQuote('smb').cac, 'cheaper clients');
  assert.ok(arrivals(hi, 5, 200) > arrivals(lo, 5, 200), 'more buyers');
  const f1 = at('fintech', 1), f5 = at('fintech', 5);
  assert.ok(f5.loanRate('micro') < f1.loanRate('micro') && f5.instFee('pitch') < f1.instFee('pitch') && f5.warnLead() > f1.warnLead(), 'cheaper loans, lower fees, earlier warnings');
  assert.ok(Object.values(SKILLS).every((k) => k.blurb.length <= 92 && !/pipeline|leads|institutional|macro/.test(k.blurb)));
});

test('D4: a Specialty starts at level 3 and the other skills at 1 (the Draft says so)', () => {
  assert.ok(D.specHTML(D.draftInit()).includes('One skill starts at level 3, the others at 1.'));
  const g = mk([], 1, { specialty: 'growth' }); assert.deepEqual(g.s.skills, { ops: 1, growth: 3, fintech: 1 });
  const lv = mk([], 1, { specialty: 'growth' }); lv.xp(C.LEVEL_XP); assert.equal(lv.level(), 2); assert.equal(lv.s.points, 1, 'a new level pays one point'); assert.ok(lv.spendPoint('ops').ok && lv.s.skills.ops === 2, 'and it raises a skill that is not the specialty');
  assert.match(D.specHTML(D.draftInit()), /Each level you earn gives a point for any skill\./);
});

test('D4: the manager lines say what is not on the card below them, and each is true', () => {
  assert.equal(PIPE.student.blurb, 'Cheapest to hire. Its margin grows with experience.'); assert.equal(PIPE.broker.blurb, 'The highest base margin.'); assert.equal(PIPE.logistics.blurb, 'Cuts freight cost 20% and damage risk by half.');
  const hire = Object.entries(PIPE).sort((a, b) => a[1].hire - b[1].hire)[0][0]; assert.equal(hire, 'student');
  assert.equal(Object.entries(PIPE).sort((a, b) => b[1].margin - a[1].margin)[0][0], 'broker');
  const g = mk(); g._openZone(5); const m = (cycles) => g.forecast({ kind: 'student', zone: 5, level: 1, alloc: 100, cycles }).margin;
  assert.ok(m(30) > m(0), 'a student\'s margin grows with the cycles it has run');
  const ship = (withLog) => { const x = mk(); x._openZone(2); const a = put(x, 'pen', 1, { basis: 1 }); if (withLog) x.s.pipes.push({ kind: 'logistics' }); return x.freightQuote([a.id], 2); };
  near(ship(true).cost / ship(false).cost, 1 - 0.2, 1e-9); near(ship(true).risk / ship(false).risk, 0.5, 1e-9);
  assert.ok(PIPE.logistics.blurb.includes('20%') && PIPE.logistics.blurb.includes('by half'));
});

test('D4: the upgrade lines say what the engine does', () => {
  const g0 = mk(), withUpg = (id) => { const g = mk(); g._openZone(5); g.s.upg[id] = true; return g; }, plain = mk(); plain._openZone(5);
  const p = { kind: 'broker', zone: 5, level: 1, alloc: 500, cycles: 0 };
  // JIT: cycles 20% shorter, stock decays half as fast, overhead 10% lower
  const j = withUpg('jit'); near(j.cycleLen(p) / plain.cycleLen(p), 0.8, 0.02); near(j.forecast(p).overhead / plain.forecast(p).overhead, 0.9, 1e-9);
  const decay = (g) => { const a = put(g, 'saas', 10); g._age(a, 10); return 1 - a.wear; }; near(decay(j) / decay(plain), 0.5, 1e-9);
  assert.equal(UPGRADES.jit.blurb, 'Manager cycles 20% shorter, stock decays half as fast, overhead 10% lower.');
  // SEO: buyers arrive 50% faster, margin +8%, clients 15% cheaper
  const s = withUpg('seo'); near(s.forecast(p).margin / plain.forecast(p).margin, 1.08, 1e-9); near(s.clientQuote('smb').cac / plain.clientQuote('smb').cac, 0.85, 1e-9);
  const seoRatio = arrivals(s, 5, 300) / arrivals(plain, 5, 300); assert.ok(Math.abs(seoRatio - 1.5) < 0.03, `arrivals: ${seoRatio.toFixed(3)}x`);
  assert.equal(UPGRADES.seo.blurb, '+50% buyer arrivals, +8% manager margin, 15% cheaper clients.');
  // freight: 40% less
  const ship = (g) => { g._openZone(2); const a = put(g, 'pen', 1, { basis: 1 }); return g.freightQuote([a.id], 2).cost; }; near(ship(withUpg('freight')) / ship(mk()), 0.6, 1e-9);
  assert.equal(UPGRADES.freight.blurb, 'Freight costs 40% less.');
  // research: the Suite counts as +2 Capital Sourcing for warnings only (7 days at most), and the Market grows a Radar tab (the engine reads the upgrade where the Grad's radar is read)
  assert.equal(Math.max(...Object.values(C.WARN_LEAD)), 7 * 24, '"7 days at most"');
  for (let lvl = 1; lvl <= C.SKILL_MAX; lvl++) {
    const a = mk(), b = withUpg('research'), plus2 = mk(); a.s.skills.fintech = b.s.skills.fintech = lvl; plus2.s.skills.fintech = lvl + 2;
    assert.equal(b.warnLead(), plus2.warnLead(), `level ${lvl}: the Suite counts as +2 Capital Sourcing for warnings`);
    assert.equal(b.warnLead() > a.warnLead(), lvl <= 4, `level ${lvl}: the Suite lifts the notice a step below the longest one and not from level 5 up`);
  }
  const ctx = fakeCtx({ days: 25, perks: ['trades', 'second'] }); assert.ok(!/data-t="radar"/.test(market.html(ctx)), 'no Radar tab without the suite');
  ctx.g().s.upg.research = true; assert.match(market.html(ctx), /data-t="radar"/, 'the Radar tab is the upgrade\'s');
  assert.equal(UPGRADES.research.blurb, 'Counts as +2 Capital Sourcing for shock warnings (7 days at most), and a Radar tab lists the best gaps in your district.');
  assert.doesNotMatch(UPGRADES.research.blurb, /every underserved market/, 'the Radar lists a district\'s best gaps, not every market');
  assert.ok(g0.radar(5, 8).length <= 8 && Object.keys(ASSETS).length * Object.keys(BUYERS).length > 8 * 20, 'a short list of the best, not every market');
});

test('D4: the client lines name the SLA, and the SLA is stricter with each tier', () => {
  assert.deepEqual(Object.values(CLIENTS).map((c) => c.minRunning), [1, 2, 3]);
  assert.equal(CLIENTS.smb.blurb, 'Local businesses. Light SLA.'); assert.equal(CLIENTS.corp.blurb, 'Mid-size firms. Strict SLA.'); assert.equal(CLIENTS.ent.blurb, 'Corporate Valley contracts. The strictest SLA.');
  assert.equal(CLIENTS.ent.zone, 13);
  for (const c of Object.values(CLIENTS)) assert.doesNotMatch(c.blurb, /pipeline/, 'the card says how many managers; the blurb does not count them');
});

test('D4: the loans carry no prose of their own (the old enterprise note said $100,000; the line is $150,000 whenever it can be drawn)', () => {
  for (const [id, l] of Object.entries(LOANS)) assert.ok(!('note' in l), `${id}: the Bank's card prints the limit, rate, fee and compounding`);
  const g = mk(); rich(g, ZONES[13].gate + 10); assert.ok(g.s.zones.includes(13));
  near(g.loanRoom('enterprise').limit, LOANS.enterprise.limit * ZONES[13].bonus.creditLimitMult);
  assert.ok(g.loanRoom('enterprise').limit > LOANS.enterprise.limit, 'the line is bigger than its table entry whenever it can be drawn');
});

// ---------------------------------------------------------------------------------------------------------------------
// D5. shocks and audits
// ---------------------------------------------------------------------------------------------------------------------
test('D5: each shock\'s lines give its day and its length, and the figures are the phases\'', () => {
  const T = EVENTS.tiktok, F = EVENTS.fed, R = EVENTS.tariff;
  for (const e of [T, F, R]) assert.ok(e.alert.readout.includes(`Day ${e.day}`), `${e.id}: the day`);
  // the craze: 400% demand, 60% faster cycles, 48 hours, then 50% off for 72 hours
  assert.ok(T.alert.readout.includes(`${T.phases[0].to - T.phases[0].from} hours`));
  assert.ok(T.alert.vars[0].includes(`${pc(T.phases[0].eff.demand.mult - 1)}%`) && T.alert.vars[1].includes(`${pc(T.phases[0].eff.speed.mult - 1)}%`));
  assert.ok(T.alert.vars[2].includes(`${T.phases[1].from} hours`) && T.alert.vars[2].includes(`${pc(1 - T.phases[1].eff.price.mult)}%`) && T.alert.vars[2].includes(`${T.phases[1].to - T.phases[1].from} hours`));
  assert.ok(/Manager cycles/.test(T.alert.vars[1]));
  // the crunch: the index, the fee, the overhead, the freeze
  const fx = F.phases[0].eff;
  assert.ok(F.alert.vars[0].includes(`${(BASE_RATE * 100).toFixed(1)}% to ${((BASE_RATE + fx.rateBps / 1e4) * 100).toFixed(1)}%`) && F.alert.vars[0].includes(`${F.phases[0].to / 24} days`));
  assert.ok(F.alert.vars[1].includes(`${(FEES.base * 100).toFixed(1)}% to ${((FEES.base + fx.fee) * 100).toFixed(1)}%`) && F.alert.vars[2].includes(`${pc(fx.overhead - 1)}%`));
  assert.ok(F.alert.enforcement.includes(`Day ${F.day + F.phases[1].to / 24}`), 'the freeze lifts on the day the phase ends');
  // the tariff: international lanes 4 days slower, repairs 45% dearer outside the four starter districts, for 15 days
  const tx = R.phases[0].eff;
  assert.ok(R.alert.readout.includes(`${R.phases[0].to / 24} days`) && R.alert.vars[0].includes(`${tx.intlSlow / 24} days slower`) && R.alert.vars[1].includes(`${pc(tx.repair - 1)}% more`) && R.alert.vars[1].includes('four starter districts'));
  assert.ok(ZONES[4].tier === 1 && ZONES[5].tier === 2, 'four starter districts');
});

test('D5: the tariff slows international manager lanes and dears repairs from district 5; it locks no freight and there is no dropshipping', () => {
  const R = EVENTS.tariff; assert.doesNotMatch(R.alert.readout, /lock|freight|dropship/i);
  const g = mk(); rich(g, 1e6); g.s.cash = 1e6; g._openZone(5);
  const lane = { kind: 'broker', zone: 5, alloc: 500, level: 1, channel: 'intl' }, dom = { ...lane, channel: 'dom' };
  const quote = () => { const a = put(g, 'pen', 1, { basis: 1 }); const q = g.freightQuote([a.id], 5); g.s.assets = g.s.assets.filter((x) => x.id !== a.id); return q.hours; };
  const before = { intl: g.cycleLen(lane), dom: g.cycleLen(dom), freight: quote(), repair5: g.repairMultFor(5), repair4: g.repairMultFor(4) };
  g.s.events = [g._evInstance('tariff', g.s.hour)]; g.advanceTo(g.s.hour + 2); g._m = null;
  assert.equal(g.cycleLen(lane) - before.intl, R.phases[0].eff.intlSlow, 'international lanes run 96 hours slower'); assert.equal(g.cycleLen(dom), before.dom, 'domestic lanes do not');
  near(g.repairMultFor(5) / before.repair5, R.phases[0].eff.repair, 1e-9); near(g.repairMultFor(4), before.repair4, 1e-9);
  assert.equal(quote(), before.freight, 'freight is not touched');
});

test('D5: the audit lines say what the auditor asks, plainly', () => {
  assert.equal(AUDIT_THEMES.length, 6);
  assert.equal(new Set(AUDIT_THEMES.map((t) => t.title)).size, 6);
  for (const t of AUDIT_THEMES) { assert.ok(t.text.endsWith('.') && words(t.text) <= 15, t.title); assert.doesNotMatch(t.text, /suspiciously|at the register/); }
  assert.match(AUDIT_THEMES[1].text, /sales tax/); assert.match(AUDIT_THEMES[2].text, /contractors are really employees/); assert.match(AUDIT_THEMES[4].text, /own a stake in your company/);
  assert.equal(AUDIT.deadlineHours / 24, 3, 'the notice gives three days to answer (the engine\'s note says 72 hours)');
});

// ---------------------------------------------------------------------------------------------------------------------
// D6. the Draft's own words
// ---------------------------------------------------------------------------------------------------------------------
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');
test('D6: the Draft says the paperclip once, asks nothing, and shows no summary until there is a build', () => {
  const two = D.draftReduce(D.draftReduce(D.draftInit(), { type: 'toggle', id: 'trades' }), { type: 'toggle', id: 'pro' });
  const full = D.draftHTML(two);
  assert.equal((full.match(/paperclip/g) || []).length, 1, 'the lede, not the bar');
  assert.match(full, /Everyone starts with one paperclip and \$0\./); assert.doesNotMatch(full, /same:|real strength|real cost|Choose two Backgrounds/);
  for (const st of [D.draftInit(), two, D.draftReduce(D.draftInit(), { type: 'reroll' })]) {
    const t = text(D.draftHTML(st)); assert.doesNotMatch(t, /\?/, 'a screen of statements'); assert.doesNotMatch(t, /Not sure|Keep it or swap/);
  }
  const empty = D.trayHTML(D.draftInit());
  assert.doesNotMatch(empty, /dr-sum|In short|So far/, 'nothing to summarize'); assert.doesNotMatch(empty, /Pick a card/); assert.equal((empty.match(/Open slot/g) || []).length, 2);
  const one = D.trayHTML(D.draftReduce(D.draftInit(), { type: 'toggle', id: 'trades' })); assert.match(one, /So far/); assert.match(D.trayHTML(two), /In short/);
  assert.match(D.trayHTML(D.draftInit()), /Reroll for a balanced pair\./); assert.match(D.trayHTML(D.draftReduce(D.draftInit(), { type: 'reroll' })), /Suggested for balance: one Background covers the other's weak spot\.<\/p>/);
  assert.equal(D.summaryOf([]).text, 'Pick two Backgrounds to see what your build is good and bad at.', 'the sentence is still the reducer\'s for a screen reader; the tray does not print it');
  // the claims shown in the tray are the Backgrounds' own, and the headline is shorter than the claim
  for (const id of ['trades', 'pro']) { assert.ok(D.trayHTML(two).includes(PERKS[id].strength.replace(/'/g, '&#39;')) || D.trayHTML(two).includes(PERKS[id].strength), id); }
  const lede = /<p class="dr-lede">([\s\S]*?)<\/p>/.exec(full)[1]; assert.ok(words(text(lede)) <= 14, `the lede is ${words(text(lede))} words (it was 23)`);
});

// ---------------------------------------------------------------------------------------------------------------------
// D3/D5 numerals and direction (the review of this pass)
// ---------------------------------------------------------------------------------------------------------------------
test('D3: every +N / -N a claim words with a unit is that Background\'s own mod, and the Heir\'s skills start where its cost says', () => {
  const unit = { 'Ops': 'opsBonus', 'Growth': 'growthBonus', 'Capital Sourcing': 'fintechBonus', 'inspection probe': 'probeBonus' };
  for (const [id, p] of Object.entries(PERKS)) {
    const said = {};
    for (const m of (p.strength + ' ' + p.cost).matchAll(/([+-])(\d+) (Ops|Growth|Capital Sourcing|inspection probe)/g)) said[unit[m[3]]] = +(m[1] + m[2]);
    const held = Object.fromEntries(Object.entries(p.mods).filter(([k]) => Object.values(unit).includes(k)));
    assert.deepEqual(said, held, `${id}: the claim and the mods state the same +N / -N`);
  }
  const start = Object.values(mk(['heir'], 1, { specialty: 'ops' }).s.skills);
  assert.ok(start.every((v) => v === start[0]) && PERKS.heir.cost.includes(`all skills start at ${start[0]}`), `the Heir's skills start at ${start}`);
});

test('D5: an open loan accrues at the crunch rate from the first midnight after the Fed shock starts, and no later than the hours its line says', () => {
  const F = EVENTS.fed, said = /re-rate within (\d+) hours/.exec(F.alert.enforcement); assert.ok(said, F.alert.enforcement);
  const calm = mk().loanRate('micro'), latency = [], day0 = (F.day - 1) * 24;
  for (const start of [day0, day0 + 1, day0 + 12, day0 + 23]) { // scheduled for a midnight, or deployed by an instructor at any hour of a day
    const g = rich(mk(), ZONES[5].gate + 10); assert.equal(g.draw('micro', 1000).ok, true);
    g.s.hour = day0 - 26; assert.equal(g.injectEvent('fed', start, { id: 'x' }), true);
    let prev = g.debt(), first = null;
    while (g.s.hour < start + 48 && first === null) { g.stepHour(); const d = g.debt(); if (g.s.hour >= start && d > prev + 1e-9) first = { hour: g.s.hour, rate: (d - prev) * 30 / prev }; prev = d; }
    assert.ok(first, `start ${start}: a midnight tick came`); near(first.rate, g.loanRate('micro'), 1e-9); assert.ok(first.rate > calm + 0.03, `start ${start}: the crunch rate, not the calm ${calm}`);
    latency.push(first.hour - start);
  }
  assert.equal(Math.max(...latency) + 1, +said[1], 'the longest wait for the new rate is a day, less one hour');
});

// D3/D5 direction and pairing. figures() above is the cheap backstop (a magnitude that is some mod's); here every clause is REBUILT from the mod it states,
// so the figure, the word that gives its direction (faster/slower, rises/falls, lose/gain ...), its sign and the thing it is paired with all come from the data.
const fig = (x) => String(+(Math.abs(x) * 100).toFixed(1));                 // 0.3 -> "30", 0.015 -> "1.5", 4 -> "400"
const modAt = (o, path) => path.split('.').reduce((v, k) => v[k], o);
/** One clause rebuilt from its mod value v. kind 'x': v is a multiplier (the figure is |v-1|, "up" when v > 1); 'a': an adder or a rate (|v|, "up" when v > 0); 'n': a count (|v|, no percent).
 *  In the template {p} is the figure, {s} its sign, and {up/down} picks the word by the sign of the mod; everything else is the claim's own words (the thing the figure is paired with). */
function clause(v, kind, tpl) {
  const d = kind === 'x' ? v - 1 : v, up = d > 0, p = kind === 'n' ? String(Math.abs(d)) : fig(d);
  return tpl.replace(/\{(\w+)\/(\w+)\}/g, (_, u, w) => (up ? u : w)).replace(/\{s\}/g, up ? '+' : '-').replace(/\{p\}/g, p);
}
/** [Background, field, path in mods, kind, template] */
const CLAUSES = [
  ['connected', 'strength', 'leadMult', 'x', 'arrive {p}% {faster/slower}'], ['connected', 'strength', 'leadBudget', 'x', '{p}% {bigger/smaller} budgets'], ['connected', 'cost', 'familyTax.rate', 'a', 'take {p}% of your cash'],
  ['grad', 'strength', 'spreadAdj', 'a', 'loan spreads {p}% {higher/lower}'], ['grad', 'strength', 'leadBudget', 'x', '{p}% {bigger/smaller} budgets'], ['grad', 'strength', 'fintechBonus', 'n', '{s}{p} Capital Sourcing'],
  ['grad', 'cost', 'garnish.rate', 'a', '{p}% of every profit'], ['grad', 'cost', 'opsBonus', 'n', '{s}{p} Ops'],
  ['trades', 'strength', 'opsBonus', 'n', '{s}{p} Ops'], ['trades', 'strength', 'repairMult', 'x', 'repairs cost {p}% {more/less}'], ['trades', 'strength', 'brokenDiscount', 'a', 'broken goods are {p}% {cheaper/dearer}'],
  ['trades', 'cost', 'pitchMult', 'x', 'Pitch prices are {p}% {higher/lower}'],
  ['immigrant', 'strength', 'freightMult', 'x', 'freight {p}% {dearer/cheaper}'], ['immigrant', 'strength', 'circle.pct', 'a', 'up to {p}% of net worth'],
  ['veteran', 'strength', 'overheadMult', 'x', 'Manager overhead {p}% {higher/lower}'], ['veteran', 'strength', 'shockSoften', 'a', 'hit {p}% {softer/harder}'], ['veteran', 'strength', 'freightSpeed', 'a', 'freight {p}% {faster/slower}'],
  ['veteran', 'cost', 'trendMult', 'x', 'Trend goods sell {p}% {higher/lower}'],
  ['heir', 'strength', 'bailout.fraction', 'a', 'clears {p}% of your debt'], ['heir', 'strength', 'spreadAdj', 'a', 'Loan spreads are {p}% {higher/lower}'], ['heir', 'strength', 'leadBudget', 'x', '{p}% {bigger/smaller} budgets'],
  ['heir', 'cost', 'xpMult', 'x', 'learn {p}% {faster/slower}'],
  ['creator', 'strength', 'trendMult', 'x', 'Trend goods sell {p}% {higher/lower}'], ['creator', 'cost', 'volatility', 'a', 'swings up to {p}%'],
  ['gigger', 'strength', 'lotDiscount', 'a', 'Small lots {p}% {cheaper/dearer}'], ['gigger', 'strength', 'xpMult', 'x', '{s}{p}% XP'], ['gigger', 'strength', 'cycleMult', 'x', 'manager cycles {p}% {longer/shorter}'],
  ['roots', 'strength', 'loyalty', 'a', 'up to {p}% {bigger/smaller} budgets'], ['roots', 'strength', 'overheadMult', 'x', 'overhead is {p}% {higher/lower}'],
  ['roots', 'cost', 'farLeadMult', 'x', '{p}% {more/fewer} buyers beyond district 8'], ['roots', 'cost', 'freightMult', 'x', 'freight costs {p}% {more/less}'],
  ['native', 'strength', 'digitalMult', 'x', 'Digital goods {s}{p}% value'], ['native', 'strength', 'lotRefresh', 'a', 'lots refresh {p}% {faster/slower}'],
  ['native', 'cost', 'scamRate', 'a', '{p}% of buyers are fraudulent'], ['native', 'cost', 'subscription.rate', 'a', 'take {p}% of your cash a month'],
  ['second', 'strength', 'probeBonus', 'n', '{s}{p} inspection probe'], ['second', 'strength', 'lotDiscountGray', 'a', 'lots {p}% {cheaper/dearer} in gray-market districts'],
  ['pro', 'cost', 'xpMult', 'x', 'learn {p}% {faster/slower}'], ['pro', 'cost', 'managerCost', 'x', 'managers cost {p}% {more/less}'], ['pro', 'cost', 'digitalMult', 'x', 'digital goods {s}{p}%'],
];
test('D3 direction: each clause of a Background\'s claim carries its mod\'s figure, direction word, sign and noun, and no percent is left that no clause accounts for', () => {
  // the one figure that is no mod: a check costs a share of the buyer's budget (deal.js verifyCost), read from the Deal Room's own plan for a buyer with a budget of 40
  const px = mk(['native']), pa = put(px, 'pen', 1); px.s.leads[1].push({ id: 'L9', zone: 1, seg: 'student', budget: 40, need: null, born: 0, exp: 999 });
  const phrase = `(verifying costs ${pc(planFor(px, { kind: 'sell', assetId: pa.id, leadId: 'L9' }).verifyCost / 40)}% of their budget)`;
  assert.ok(PERKS.native.cost.includes(phrase), PERKS.native.cost);
  const left = { 'native.cost': PERKS.native.cost.replace(phrase, '') };
  for (const [id, field, path, kind, tpl] of CLAUSES) {
    const want = clause(modAt(PERKS[id].mods, path), kind, tpl), key = id + '.' + field, have = (left[key] ??= PERKS[id][field]);
    assert.ok(have.includes(want), `${key}: expected "${want}" in "${PERKS[id][field]}"`);
    left[key] = have.replace(want, '');
  }
  for (const [key, rest] of Object.entries(left)) assert.doesNotMatch(rest, /\d%/, `${key}: a percent no clause accounts for: "${rest}"`);
  for (const [id, p] of Object.entries(PERKS)) for (const f of ['strength', 'cost']) if (/\d%/.test(p[f])) assert.ok((id + '.' + f) in left, `${id}.${f} states a percent and has no clause row`);
});

test('D5 direction: the TikTok and Fed lines say rises or falls, faster or slower, lose or gain, and the sign, as the phases\' effects do', () => {
  const T = EVENTS.tiktok.phases, F = EVENTS.fed.phases[0].eff, V = EVENTS.tiktok.alert.vars, W = EVENTS.fed.alert.vars;
  assert.ok(V[0].includes(clause(T[0].eff.demand.mult, 'x', 'Demand for trend goods {rises/falls} {p}%')), V[0]);
  assert.ok(V[1].includes(clause(T[0].eff.speed.mult, 'x', 'run {p}% {faster/slower}')), V[1]);
  assert.ok(V[2].includes(clause(T[1].eff.price.mult, 'x', 'trend goods {gain/lose} {p}% of their value')), V[2]);
  const pct1 = (x) => (x * 100).toFixed(1), word = F.rateBps > 0 ? 'rises' : 'falls', sign = F.rateBps > 0 ? '+' : '-';
  assert.ok(W[0].includes(`rate ${word} from ${pct1(BASE_RATE)}% to ${pct1(BASE_RATE + F.rateBps / 1e4)}% (${sign}${Math.abs(F.rateBps)} bps)`), W[0]);
  assert.ok(W[1].includes(`fee on sales ${F.fee > 0 ? 'rises' : 'falls'} from ${pct1(FEES.base)}% to ${pct1(FEES.base + F.fee)}%`), W[1]);
  assert.ok(W[2].includes(clause(F.overhead, 'x', 'Manager overhead {rises/falls} {p}%')), W[2]);
});
