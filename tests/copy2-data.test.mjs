// Copy pass, part 2, package P5: the data text (district blurbs, buyer lines, the Backgrounds' claims, the skill, manager, upgrade, client, audit and shock lines) and the Draft's own words,
// held against the engine and the data. Every number a text states is recomputed here from the engine or the data, never copied from the text; a claim the engine does not make is a failure.
//   D1  a district blurb is one short sentence, and each fact it states is the district's rule (the lot shares, the haggle, the wave, the decay, the customs, the audit, the rent, the price gaps)
//   D2  a buyer's line is short, in the buyer's voice, and the set is shorter than it was
//   D3  a Background's claim names no figure the mods do not hold, and the claims that were wrong are right (the immigrant's margin, the trades' haggle, the creator's goodwill, the roots' trust, the pro's inspections, the second chance's warnings)
//   D4  the skill, manager, upgrade and client lines say what the engine does; a manager is a manager, not a pipeline
//   D5  the shocks and the audits say what the engine does (the tariff slows lanes; it does not lock freight)
//   D6  the Draft says the paperclip once, asks nothing, and shows a summary only when there is a build to summarize
// Run: node --test tests/copy2-data.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const { Game } = await import('../js/engine.js');
const C = await import('../js/config.js');
const { ZONES, ASSETS, BUYERS, PERKS, SKILLS, PIPE, UPGRADES, CLIENTS, LOANS, AUDIT_THEMES, EVENTS, AUDIT, FEES, BASE_RATE, ECON, MIL, MIL_ZONE } = C;
const { assetFMV, seasonMult } = await import('../js/market.js');
const { haggleParams, inspectParams, auctionParams, planFor } = await import('../js/deal.js');
const haggle = await import('../js/play/haggle.js');
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
const WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const nums = (t, re) => [...t.matchAll(re)].map((m) => +m[1].replace(/,/g, ''));

/** Lots made in a district: shares of broken, fake, auction and warned lots (the rates a blurb quotes are rates of LOTS). */
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
/** New buyers that turn up in a district over `hours` (the player takes every one at once; the rate is deterministic, the draw is not). */
function arrivals(g, zone, hours = 300) {
  let n = 0; g.s.leads[zone] = [];
  for (let h = 0; h < hours; h++) { g.advanceTo(g.s.hour + 1); n += g.s.leads[zone].length; g.s.leads[zone] = []; }
  return n;
}

// ---------------------------------------------------------------------------------------------------------------------
// D1. the district blurbs
// ---------------------------------------------------------------------------------------------------------------------
test('D1: a district blurb is one short sentence, a statement, with no lesson attached and no advice', () => {
  assert.equal(Object.keys(ZONES).length, 16);
  for (const [id, z] of Object.entries(ZONES)) {
    assert.ok(z.blurb.length <= 100, `${id}: ${z.blurb.length} characters`);
    assert.ok(words(z.blurb) <= 16, `${id}: ${words(z.blurb)} words`);
    assert.equal((z.blurb.match(/[.!?](\s|$)/g) || []).length, 1, `${id}: one sentence`);
    assert.ok(z.blurb.endsWith('.'), `${id}: it ends with a period`);
    assert.doesNotMatch(z.blurb, /\blearn\b|\bthe lesson\b|\bwill teach\b/i, `${id}: "You will learn" is the badge's, not the blurb's`);
    assert.doesNotMatch(z.blurb, /\b(you should|inspect before|bid below|price each|patience is)\b/i, `${id}: no advice`);
    assert.doesNotMatch(z.blurb, /\?|!/, `${id}: a statement`);
    assert.doesNotMatch(z.blurb, /treasure|junk|long (sales )?cycles|cycles are long/i, id);
  }
  const total = Object.values(ZONES).reduce((n, z) => n + words(z.blurb), 0);
  assert.ok(total <= 210, `the sixteen blurbs hold ${total} words (they held 383)`);
});

test('D1 Scrap Yard: the barter ladder is real, and urgent buyers pay for their need, not for the crate\'s cost', () => {
  assert.match(ZONES[1].blurb, /Barter up from a paperclip/);
  assert.match(ZONES[1].blurb, /urgent buyers pay for need, not cost/);
  // the ladder: buyers here hand goods back, and the paperclip is the bottom rung
  assert.ok(Object.values(BUYERS).filter((b) => b.zone === 1 && b.holds?.length).length >= 4);
  assert.ok(BUYERS.student.holds.some((h) => h.cls === 'pen'), 'the first buyer holds the next rung up');
  assert.ok(Object.values(ZONES).every((z) => z.id === 1 || z.urgent < ZONES[1].urgent), 'no district has as many urgent buyers as the first');
  // the price: a buyer in need is quoted from their budget, a buyer without one from the crate's fair value
  const g = mk(); const pen = put(g, 'pen', 1); pen.known = true;
  const budget = g.val(pen) * 6;
  const calm = { id: 'LC', zone: 1, seg: 'student', budget, need: null, born: 0, exp: 999 }, urgent = { id: 'LU', zone: 1, seg: 'student', budget, need: 'prestige', born: 0, exp: 999 };
  g.s.leads[1].push(calm, urgent);
  const pCalm = g.quotePitch(pen.id, 'LC', undefined, { blind: false }).price, pUrgent = g.quotePitch(pen.id, 'LU', undefined, { blind: false }).price;
  assert.ok(pUrgent > 2 * pCalm, `the buyer in need pays ${pUrgent.toFixed(2)}, the calm one ${pCalm.toFixed(2)}, for the same pen`);
});

test('D1 Flea Market Row: a haggle runs one round longer here, and a sealed box hides its condition', () => {
  const b = ZONES[2].blurb;
  assert.match(b, /Haggles run one round longer/); assert.match(b, /gamble on condition/);
  assert.doesNotMatch(b, /every deal can be haggled/i, 'a haggle is offered in every district; what this one adds is a round');
  assert.deepEqual(Object.values(ZONES).filter((z) => z.rules.haggle).map((z) => z.id), [2], 'only the Flea Market has the rule');
  const g = mk(), rounds = (zone) => haggle.create({ ...haggleParams(g, { role: 'sell', fair: 10, buyer: { style: 'friendly', patience: 4 }, lead: { budget: 100 }, zone, seed: 5 }), seed: 5 }).n;
  assert.equal(rounds(2), rounds(3) + 1, 'one more round in the Flea Market than in the Campus Quad, for the same buyer');
  const s = lotShares(2, 100, [], 3000);
  assert.ok(s.q.length > 100 && Math.min(...s.q) >= 0.85 && Math.max(...s.q) <= 1.15, 'a sealed box is worth 85% to 115% of what it looks like');
  assert.ok(Math.max(...s.q) - Math.min(...s.q) > 0.25, 'and the spread is real');
  assert.equal(s.fake, 0, 'never a fake');
});

test('D1 Campus Quad: demand for books and gadgets swings by the rule\'s amplitude on the rule\'s period', () => {
  const r = ZONES[3].rules.season;
  assert.ok(ZONES[3].blurb.includes(`${pc(r.amp)}% either way on a ${r.period}-day wave`), ZONES[3].blurb);
  assert.ok(r.tags.includes('paper') && r.tags.includes('training') && r.tags.includes('electronics'), 'books are paper and training, gadgets are electronics');
  const mult = [...Array(r.period).keys()].map((d) => seasonMult(ASSETS.courseBooks, 3, d + 1));
  near(Math.max(...mult), 1 + r.amp, 0.02); near(Math.min(...mult), 1 - r.amp, 0.02);
  assert.equal(seasonMult(ASSETS.dormFridge, 3, 7), 1, 'a fridge is not on the wave');
});

test('D1 Pawn District: about one lot in five is fake and a third of the stock goes to auction', () => {
  const r = ZONES[4].rules, b = ZONES[4].blurb;
  assert.equal(Math.round(1 / r.fakes), 5); assert.ok(Math.abs(r.auction - 1 / 3) < 0.04);
  assert.match(b, /About one lot in five is fake/); assert.match(b, /a third of the stock goes to auction/);
  const s = lotShares(4, 1000);
  assert.ok(Math.abs(s.fake / s.n - r.fakes) < 0.04, `${pc(s.fake / s.n)}% fake against a rule of ${pc(r.fakes)}%`);
  assert.ok(Math.abs(s.auction / s.n - r.auction) < 0.04, `${pc(s.auction / s.n)}% at auction against a rule of ${pc(r.auction)}%`);
});

test('D1 Metro Hub: managers, clients, upgrades and the Bank open here', () => {
  const b = ZONES[5].blurb;
  for (const w of ['managers', 'clients', 'upgrades', 'Bank']) assert.ok(b.includes(w), w);
  assert.ok(ZONES[5].rules.managers && ZONES[5].rules.bank && ZONES[5].auto && ZONES[5].plots > 0);
  assert.equal(MIL_ZONE.m1, 5); assert.equal(MIL.m1, ZONES[5].gate);
  assert.ok(CLIENTS.smb.zone === 5 && Object.values(UPGRADES).every((u) => u.zone === 5), 'the first clients and every upgrade are Metro Hub\'s');
  const g = mk(); assert.match(g.loanBlock('micro'), /Commercial Bank opens at Metro Hub/); assert.ok(!g.s.mil.m1);
  rich(g, ZONES[5].gate + 10);
  assert.ok(g.s.mil.m1 && g.s.zones.includes(5)); assert.equal(g.loanBlock('micro'), '', 'the Bank is open');
});

test('D1 Estate Sales: more than half the lots are auctions, and the winner of an auction tends to have overpaid', () => {
  const r = ZONES[6].rules;
  assert.ok(r.auction > 0.5 && /More than half the lots are auctions/.test(ZONES[6].blurb));
  const s = lotShares(6, 3000);
  assert.ok(s.auction / s.n > 0.5 && s.auction / s.n < 0.6, `${pc(s.auction / s.n)}% at auction`);
  // several rivals bid against a noisy estimate, and whoever bids highest wins: the winning estimate is high (the winner's curse)
  const g = rich(mk(), 3000); g.s.lots[6] = []; g._spawnLot(6); const lot = g.s.lots[6][0]; assert.ok(lot, 'a lot to bid on');
  const runs = [];
  for (let seed = 1; seed <= 600; seed++) { const p = auctionParams(g, 6, lot, { seed }); runs.push({ est: p.estimate, win: p.estimate > Math.max(...p.bidders.map((b) => b.limit)) }); }
  const won = runs.filter((x) => x.win);
  assert.ok(runs[0] && auctionParams(g, 6, lot, { seed: 1 }).bidders.length >= 2, 'a field of rivals');
  assert.ok(won.length > 20 && mean(won.map((x) => x.est)) > 1.05 * mean(runs.map((x) => x.est)), `the estimates that win average ${(mean(won.map((x) => x.est)) / mean(runs.map((x) => x.est))).toFixed(2)}x all of them`);
});

test('D1 Auto Row: six in ten lots are broken, and a repair here costs a quarter less', () => {
  const r = ZONES[7].rules, b = ZONES[7].blurb;
  assert.match(b, /Six in ten lots are broken/); assert.doesNotMatch(b, /\bcars\b/, 'the 60% is a share of every lot (the tool chest too), not of cars');
  assert.ok(b.includes(`repairs here cost ${pc(r.repair)}% less`), b);
  const s = lotShares(7, 8000);
  assert.ok(Math.abs(s.broken / s.n - 0.6) < 0.05, `${pc(s.broken / s.n)}% of Auto Row's lots are broken`);
  const h = mk(); h._openZone(7); h._openZone(4); // the district's own factor is the only one that differs between 7 and 4
  near(h.repairMultFor(7) / h.repairMultFor(4), 1 - r.repair, 1e-9);
});

test('D1 Harbor Docks: customs inspects one arriving shipment in four, with a 12-hour delay and a 2% fee', () => {
  const r = ZONES[8].rules, b = ZONES[8].blurb;
  assert.ok(b.includes(`one arriving shipment in ${WORD[Math.round(1 / r.customs)]}`) && b.includes('12-hour delay') && b.includes('2% fee'), b);
  const g = mk(); g._openZone(8); g.s.cash = 1e6; const n = 600, book = 1000, hour = g.s.hour;
  for (let i = 0; i < n; i++) g.s.freight.push({ id: 'F' + g.s.nid++, items: [g._mk(g.s, 'pen', { zone: 7, basis: 1 })], to: 8, sent: hour, arrive: hour, risk: 0, book, from: 7 });
  const cash0 = g.s.cash; g._freight();
  const held = g.s.freight; // the inspected ones stay on the road
  assert.ok(Math.abs(held.length / n - r.customs) < 0.06, `${pc(held.length / n)}% inspected against a rule of ${pc(r.customs)}%`);
  assert.ok(held.every((f) => f.arrive === hour + 12), 'a 12-hour delay');
  near(cash0 - g.s.cash, held.length * book * 0.02, 1e-6); // a 2% fee on what the crates are worth
});

test('D1 Industrial Park: the first compliance audit arrives when this district opens', () => {
  assert.equal(MIL_ZONE.m2, 9); assert.equal(MIL.m2, ZONES[9].gate); assert.match(ZONES[9].blurb, /first compliance audit arrives here/);
  const g = mk(); rich(g, ZONES[9].gate + 10);
  assert.ok(g.s.mil.m2 && g.s.zones.includes(9), 'milestone two is this district');
  assert.equal(g.s.auditPending, null, 'nothing yet'); g.advanceTo(g.s.hour + 1);
  assert.ok(g.s.auditPending, 'the notice lands the hour the district opens');
  const early = mk(); rich(early, ZONES[9].gate - 10); early.advanceTo(early.s.hour + 48); assert.equal(early.s.auditPending, null, 'and not before');
});

test('D1 Tech Corridor: digital goods lose value twice as fast here', () => {
  assert.match(ZONES[10].blurb, /digital goods lose value twice as fast/);
  const g = mk(), decay = (cls, zone) => { const a = put(g, cls, zone); g._age(a, zone); return 1 - a.wear; };
  near(decay('saas', 10) / decay('saas', 9), 2, 1e-9);
  near(decay('fleet', 10) / decay('fleet', 9), 1, 1e-9);
});

test('D1 Farmland Co-op: food spoils by the day, and food and farm demand follows a 30-day wave', () => {
  const r = ZONES[11].rules.season, b = ZONES[11].blurb;
  assert.ok(b.includes(`${r.period}-day harvest wave`) && /Food spoils by the day/.test(b), b);
  assert.ok(r.tags.includes('food') && r.tags.includes('farm'));
  const g = mk(), perishable = Object.entries(ASSETS).filter(([, a]) => a.perish);
  assert.ok(perishable.length >= 3 && perishable.every(([, a]) => a.tags.includes('food') || a.tags.includes('farm')), 'what spoils is food or grain');
  for (const [cls] of perishable) { const a = put(g, cls, 11); g._age(a, 11); assert.ok(1 - a.wear > 0.015, `${cls} loses ${pc(1 - a.wear)}% in a day`); }
  const woolly = put(g, 'rowCropTractor', 11); g._age(woolly, 11); assert.ok(1 - woolly.wear < 0.01, 'a tractor does not spoil');
});

test('D1 Creative Quarter: catalogs and rights pay every day they are held', () => {
  assert.match(ZONES[12].blurb, /pay you every day you hold them/);
  const g = mk(); rich(g, 1e6); const cat = put(g, 'filmCatalog', 12); g._dayTick();
  const row = g.s.ledger.find((e) => e.type === 'rent'); assert.ok(row, 'a row of royalties and rent');
  near(row.amt, g.val(cat) * ASSETS.filmCatalog.yield, 1e-6);
  assert.ok(Object.values(ASSETS).filter((a) => a.dem[12] >= 8 && a.yield).length >= 4, 'the district\'s signature goods are the ones that pay');
});

test('D1 Corporate Valley: enterprise clients and the exit, by trade sale or IPO, open here', () => {
  assert.match(ZONES[13].blurb, /Enterprise clients and your exit, by trade sale or IPO, open here/);
  assert.equal(CLIENTS.ent.zone, 13); assert.equal(CLIENTS.ent.needs, 'm3'); assert.equal(MIL_ZONE.m3, 13); assert.equal(MIL.m3, ZONES[13].gate);
  const g = mk(); rich(g, ZONES[13].gate - 100);
  assert.ok(!g.s.mil.m3 && g.exitQuote('sale').ok === false, 'no exit before the district');
  g.s.cash = ZONES[13].gate + 100; g._unlock(); g.s.dp = [1000];
  assert.ok(g.s.mil.m3 && g.s.zones.includes(13)); assert.ok(g.exitQuote('sale').ok && g.exitQuote('ipo').ok, 'both exits are open');
});

test('D1 Financial District: banks and funds buy paper, and opening it makes loans cheaper', () => {
  assert.match(ZONES[14].blurb, /buy paper, not products, and loans get cheaper/);
  assert.ok(Object.values(BUYERS).filter((b) => b.zone === 14).every((b) => b.like.finance > 0), 'every buyer here likes finance');
  const g = mk(); rich(g, 1e6); const before = g.loanRate('micro');
  g.s.zones = g.s.zones.filter((z) => z !== 14); g._bn = null; const without = g.loanRate('micro'); g.s.zones.push(14); g._bn = null; const withIt = g.loanRate('micro');
  assert.ok(withIt < without); near(without - withIt, LOANS.micro.spread * (1 - ZONES[14].bonus.spreadMult), 1e-9); assert.ok(before === withIt);
});

test('D1 Real Estate Row: property pays rent every day, and a quarter of the lots are foreclosure auctions', () => {
  const r = ZONES[15].rules;
  assert.equal(r.auction, 0.25); assert.match(ZONES[15].blurb, /a quarter of the lots are foreclosure auctions/);
  const s = lotShares(15, 1.1e6); assert.ok(Math.abs(s.auction / s.n - 0.25) < 0.05, `${pc(s.auction / s.n)}% at auction`);
  const g = mk(); rich(g, 1e7); const a = put(g, 'apartmentBlock', 15); g._dayTick();
  near(g.s.ledger.find((e) => e.type === 'rent').amt, g.val(a) * ASSETS.apartmentBlock.yield * g.B.rentMult, 1e-6);
});

test('D1 Global Exchange: gems, art and cargo are priced very differently from one district to the next', () => {
  assert.match(ZONES[16].blurb, /Gems, art and cargo sell at very different prices from district to district/);
  for (const cls of ['diamondParcel', 'postwarCanvas', 'copperCargo', 'watchVault']) {
    const here = assetFMV({ cls, cond: 'ok', quality: 1, wear: 1 }, 16, {});
    const there = Object.keys(ZONES).map(Number).filter((z) => z !== 16).map((z) => assetFMV({ cls, cond: 'ok', quality: 1, wear: 1 }, z, {}));
    assert.ok(there.every((v) => v * 1.3 <= here), `${cls}: a district within 30% of its Global Exchange price`);
    assert.ok(there.filter((v) => v * 3 < here).length >= 12, `${cls}: in most districts it is worth under a third`);
  }
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
  // the line still says what the buyer wants: the words of a line that names a good name one the buyer likes (spot checks on the characters the lines were cut for)
  const likes = (id, tag) => assert.ok((BUYERS[id].like[tag] || 0) >= 0.5, `${id} likes ${tag}`);
  likes('trainer', 'training'); likes('boutique', 'fashion'); likes('etailer', 'electronics'); likes('thrift', 'home'); likes('boatyard', 'marine');
  likes('lakeshorePower', 'energy'); likes('marloweGrocers', 'food'); likes('ridgelineDealer', 'farm'); likes('almansooriDubai', 'luxury'); likes('cobaltReit', 'industrial');
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
    const have = figures(p.mods);
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
  assert.match(s, /International margin 1\.4x instead of 1\.3x/); assert.doesNotMatch(s, /points of margin/);
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

test('D3 creator: a failed pitch halves the arrival of buyers for two days, and other demand swings by the stated share every three days', () => {
  const c = PERKS.creator.cost, m = PERKS.creator.mods;
  assert.ok(c.includes('halves buyer arrivals for 2 days') && c.includes(`up to ${pc(m.volatility)}% every 3 days`), c);
  const calm = mk(); const sulk = mk(); sulk.s.ps.goodwillUntil = 1e9;
  const a = arrivals(calm, 1, 400), b = arrivals(sulk, 1, 400);
  assert.ok(Math.abs(b / a - 0.5) < 0.1, `${b} arrivals against ${a}`);
  const f = mk(['creator']), pen = put(f, 'pen', 1); f.s.leads[1].push({ id: 'LX', zone: 1, seg: 'mechanic', budget: 50, need: null, born: 0, exp: 999 }); // a buyer who has no use for a pen
  const h0 = f.s.hour, rep0 = f.s.rep, r = f.pitch(pen.id, 'LX');
  assert.equal(r.outcome, 'rejected'); assert.equal(f.s.ps.goodwillUntil - h0, 48, 'two days'); assert.equal(rep0 - f.s.rep, m.flopRep, 'and the reputation it costs');
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
  assert.ok(Math.abs(share - m.farLeadMult) < 0.1, `beyond district 8: ${share.toFixed(2)}x`); assert.ok(Math.abs(edge - 1) < 0.05, `in district 8 itself: ${edge.toFixed(2)}x`);
  assert.ok(PERKS.roots.cost.includes('beyond district 8') && PERKS.roots.cost.includes(`${pc(1 - m.farLeadMult)}% fewer`) && PERKS.roots.cost.includes(`${pc(m.freightMult - 1)}% more`));
});

test('D3 native: a buyer is a fraud at the stated rate and checking one costs money', () => {
  const c = PERKS.native.cost; assert.doesNotMatch(c, /unless you verify/); assert.match(c, /checking one costs money/);
  const g = mk(['native']); g.s.trades = 5; let frauds = 0, n = 0;
  for (let i = 0; i < 1500; i++) { g.s.leads[1] = []; g._spawnLead(1); const l = g.s.leads[1][0]; if (l) { n++; if (l.scam) frauds++; } }
  assert.ok(Math.abs(frauds / n - PERKS.native.mods.scamRate) < 0.03, `${pc(frauds / n)}% of ${n} buyers`);
  const plan = (perks) => { const x = mk(perks), a = put(x, 'pen', 1); x.s.leads[1].push({ id: 'L9', zone: 1, seg: 'student', budget: 40, need: null, born: 0, exp: 999 }); return planFor(x, { kind: 'sell', assetId: a.id, leadId: 'L9' }); };
  assert.ok(plan(['native']).canVerify && !plan([]).canVerify, 'only a Digital Native can check a buyer'); near(plan(['native']).verifyCost, 0.4, 1e-9); // 1% of the buyer's budget
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
  assert.doesNotMatch(D.specHTML(D.draftInit()), /Each level you earn/, 'the point rule is told where the points are spent');
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
  assert.ok(Math.abs(arrivals(s, 5, 300) / arrivals(plain, 5, 300) - 1.5) < 0.2, 'arrivals');
  assert.equal(UPGRADES.seo.blurb, '+50% buyer arrivals, +8% manager margin, 15% cheaper clients.');
  // freight: 40% less
  const ship = (g) => { g._openZone(2); const a = put(g, 'pen', 1, { basis: 1 }); return g.freightQuote([a.id], 2).cost; }; near(ship(withUpg('freight')) / ship(mk()), 0.6, 1e-9);
  assert.equal(UPGRADES.freight.blurb, 'Freight costs 40% less.');
  // research: warnings a tier earlier, and the Market grows a Radar tab (the engine reads the upgrade where the Grad's radar is read)
  const r = withUpg('research'); assert.ok(g0.warnLead() < r.warnLead() && r.warnLead() === 72 && g0.warnLead() === 12, 'from the first tier to the second');
  const ctx = fakeCtx({ days: 25, perks: ['trades', 'second'] }); assert.ok(!/data-t="radar"/.test(market.html(ctx)), 'no Radar tab without the suite');
  ctx.g().s.upg.research = true; assert.match(market.html(ctx), /data-t="radar"/, 'the Radar tab is the upgrade\'s');
  assert.equal(UPGRADES.research.blurb, 'Shock warnings come a tier earlier, and a Radar tab lists the best gaps in your district.');
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
