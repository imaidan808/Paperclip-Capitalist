// Copy pass, part 2, the drawers (Crew, Bank, Travel, Stock, Market, Quests), the Goal card and the quest text: what they say, held against the engine.
// Every figure below is read from the engine or the config, never typed in; the sentences are read off the drawers' own HTML. A claim the engine does not bear fails here.
//   D1  a district's words are said once (js/ui/drawers/districttext.js) and every figure in them is the engine's: the shares the lot generator draws, customs, fads, spoilage, haggling, the season, the unlocks and the rewards
//   D2  the old claims that were wrong are gone, and nothing of the old three sets of lesson titles is left
//   D3  Quests: the streak bonus and its cap, what a win is, what moves reputation, the Early warning with the Market Research Suite, every skill row
//   D4  Bank: the interest cut, the exits, the audit, the stress test and the cushion, the locked score
//   D5  Crew: the upgrades, the international lane, the royalty, the SLA
//   D6  the quests, the badges and the Goal card: one sentence, and the numbers they quote
//   D7  the voice: no question in what a player reads, and the drawers stay short
// Run: node --test tests/copy2-drawers.test.mjs
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
const { fakeCtx } = await import('./helpers/ctx.mjs');
const { run } = await import('./bot.mjs');
const C = await import('../js/config.js');
const { ZONES, ZONE_IDS, ASSETS, AUDIT, CM, DEBT, MIL, MIL_ZONE, ECON, PIPE, CLIENTS, WARN_LEAD, TOTAL_DAYS } = C;
const { CODEX } = await import('../js/meta/codex.js');
const { QUESTS, ACHIEVEMENTS, DAILIES, MONEY_SUMS } = await import('../js/meta/quests.js');
const { Progress } = await import('../js/meta/progress.js');
const { seasonMult } = await import('../js/market.js');
const D = await import('../js/deal.js');
const { create: haggleCreate } = await import('../js/play/haggle.js');
const T = await import('../js/ui/drawers/districttext.js');
const travel = (await import('../js/ui/drawers/travel.js')).default;
const market = (await import('../js/ui/drawers/market.js')).default;
const crew = (await import('../js/ui/drawers/crew.js')).default;
const bank = (await import('../js/ui/drawers/bank.js')).default;
const stock = (await import('../js/ui/drawers/stock.js')).default;
const quests = (await import('../js/ui/drawers/quests.js')).default;
const { trackerHTML } = await import('../js/ui/hud.js');

// ---------------------------------------------------------------------------------------------------------------------------------
// helpers
const fresh = (perks = [], seed = 21) => { const g = new Game({ perks, seed }); g.env.algo = false; g.s.events = []; return g; };
const pct = (x) => `${Math.round(x * 100)}%`;
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** What a player reads: the text of the page with a shut fold drawn as its line, the glyph spans out. */
const shown = (html) => html.replace(/<span class="sr"[^>]*>[\s\S]*?<\/span>/g, ' ').replace(/<span[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const words = (t) => t.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
/** A district with a given amount of cash, to measure the shares the lot generator draws (as tests/audit-content.test.mjs does). */
function lotShares(zone, n = 6000) {
  const g = fresh([], 11); g.s.cash = Math.max(ZONES[zone].gate * 1.5, 10); g._unlock();
  if (!g.s.zones.includes(zone)) g._openZone(zone);
  const s = { n: 0, fake: 0, broken: 0, auction: 0 };
  for (let i = 0; i < n; i++) { g.s.lots[zone] = []; g._spawnLot(zone, false); const l = g.s.lots[zone][0]; if (!l) continue; s.n++; if (l.truth.fake) s.fake++; if (l.cond === 'broken') s.broken++; if (l.mode === 'auction') s.auction++; }
  return s;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// D1. A district's words
test('D1: every district has a rule, written once; a rule key the engine does nothing with has no sentence', () => {
  for (const id of ZONE_IDS) {
    const r = T.rulePhrases(id);
    assert.ok(r.length >= 1 && r.every((t) => /^[A-Z0-9]/.test(t) && t.endsWith('.')), `${ZONES[id].name}: ${r}`);
  }
  assert.deepEqual(T.rulePhrases(99), []); assert.deepEqual(T.rewardPhrases(99), []);
  // bulk, bank, gray and arbitrage are keys the engine never reads for anyone (gray: only the Second-Chance Hustler's lot prices, see below)
  const src = read('js/engine.js') + read('js/deal.js') + read('js/market.js') + read('js/session.js');
  for (const k of ['bulk', 'arbitrage']) assert.ok(!new RegExp(`rules\\??\\.${k}\\b`).test(src), `the engine reads no rule "${k}"`);
  assert.ok(!/rules\??\.bank\b/.test(src));
  assert.equal((src.match(/rules\??\.gray\b/g) || []).length, 1, 'gray is read once, for one Background\'s prices');
  const all = ZONE_IDS.flatMap((id) => T.rulePhrases(id)).join(' ');
  assert.doesNotMatch(all, /\bbulk\b|audit fines|\bgray\b/i);
  // the lesson titles are the Codex's, and the hover line is the Codex's summary
  for (const id of ZONE_IDS) { const e = CODEX.find((c) => c.id === ZONES[id].teaches); assert.equal(T.lessonTitle(ZONES[id].teaches), e.title); assert.equal(T.lessonGist(ZONES[id].teaches), e.summary); }
});

test('D1: the shares a district states are the shares its lot generator draws (counterfeits, auctions, broken lots)', () => {
  const fakeZones = ZONE_IDS.filter((z) => ZONES[z].rules.fakes), auctionZones = ZONE_IDS.filter((z) => ZONES[z].rules.auction);
  for (const z of new Set([...fakeZones, ...auctionZones, 7])) {
    const got = lotShares(z), Z = ZONES[z], said = T.rulePhrases(z).join(' ');
    if (Z.rules.fakes) { assert.ok(said.includes(`About ${pct(Z.rules.fakes)} of lots are counterfeit.`), `${Z.name} says its fake share`); assert.ok(Math.abs(got.fake / got.n - Z.rules.fakes) < 0.03, `${Z.name}: ${got.fake / got.n} of lots are fake, the rule is ${Z.rules.fakes}`); }
    if (Z.rules.auction) { assert.ok(said.includes(`${pct(Z.rules.auction)} of lots are auctions.`)); assert.ok(Math.abs(got.auction / got.n - Z.rules.auction) < 0.03, `${Z.name}: ${got.auction / got.n} of lots are auctions, the rule is ${Z.rules.auction}`); }
  }
  const auto = lotShares(7);
  assert.match(T.rulePhrases(7)[0], new RegExp(`Repairs cost ${pct(ZONES[7].rules.repair)} less, and about 6 in 10 lots are broken\\.`));
  assert.ok(Math.abs(auto.broken / auto.n - 0.6) < 0.04, `Auto Row: ${auto.broken / auto.n} of its lots are broken`);
  // ...and a repair there costs what the rule says against a district of the same tier with no such rule
  const g = fresh(); g._openZone(7); g._openZone(8);
  assert.ok(Math.abs(g.repairMultFor(7) / g.repairMultFor(8) - (1 - ZONES[7].rules.repair)) < 1e-9);
});

test('D1: customs inspect the share said, hold freight 12 hours and charge 2% of its value', () => {
  for (const to of [8, 16]) {
    const g = fresh(); g._openZone(to); g.s.cash = 1e9; let held = 0, N = 3000, delay = null, feeRate = null;
    for (let i = 0; i < N; i++) {
      g.s.hour = 100 + i; const cash = g.s.cash;
      g.s.freight = [{ id: 'F' + i, items: [], to, from: 1, sent: g.s.hour - 6, arrive: g.s.hour, risk: 0, book: 1000 }];
      g._freight();
      const f = g.s.freight[0];
      if (f) { held++; delay = f.arrive - g.s.hour; feeRate = (cash - g.s.cash) / 1000; }
    }
    assert.ok(Math.abs(held / N - ZONES[to].rules.customs) < 0.03, `${ZONES[to].name}: ${held / N} of shipments are held, the rule is ${ZONES[to].rules.customs}`);
    assert.match(T.rulePhrases(to).join(' '), new RegExp(`${pct(ZONES[to].rules.customs)} of arriving shipments are inspected: a ${delay}-hour delay and a ${Math.round(feeRate * 100)}% fee\\.`));
    // Travel names the fee in dollars for the shipment in front of the player
    assert.ok(read('js/ui/drawers/travel.js').includes('q.book * 0.02') && Math.abs(feeRate - 0.02) < 1e-9);
  }
});

test('D1: fads double a digital good\'s wear, perishables spoil every day, yield pays every day, and the stock card says the engine\'s own rates', () => {
  const g = fresh(), digital = Object.keys(ASSETS).find((c) => ASSETS[c].tags.includes('digital') && !ASSETS[c].perish && !ASSETS[c].yield);
  const loss = (cls, zone, jit = false) => { const h = fresh(); h.s.upg.jit = jit; const a = { cls, wear: 1 }; h._age(a, zone); return 1 - a.wear; };
  assert.ok(Math.abs(loss(digital, 10) / loss(digital, 9) - 2) < 1e-9, 'twice as fast in the Tech Corridor');
  assert.match(T.rulePhrases(10)[0], /twice as fast/);
  assert.match(T.rulePhrases(11).join(' '), /Perishable goods spoil every day\./);
  const perish = Object.keys(ASSETS).find((c) => ASSETS[c].perish);
  assert.ok(loss(perish, 11) > ASSETS[perish].dep * 0.002, 'spoilage is on top of depreciation, in any district');
  assert.ok(Math.abs(loss(perish, 1) - loss(perish, 11)) < 1e-12);
  for (const jit of [false, true]) { // the Stock chip
    const ctx = fakeCtx({ days: 0 }); ctx.g().s.upg.jit = jit; const a = ctx.g()._mk(ctx.g().s, perish, { zone: 1, basis: 1 }); ctx.g().s.assets = [a];
    assert.match(shown(stock.html(ctx)), new RegExp(`Spoils: about ${(loss(perish, 1, jit) * 100).toFixed(0)}% a day`), `Just-In-Time ${jit}`);
  }
  // yield: a crate that pays, in a district with the rent rule and out of it
  const yielding = Object.keys(ASSETS).find((c) => ASSETS[c].yield && ASSETS[c].tags.includes('realty'));
  for (const zones of [[1], [1, 15]]) {
    const ctx = fakeCtx({ days: 0 }), h = ctx.g();
    for (const z of zones) if (!h.s.zones.includes(z)) h._openZone(z);
    const a = h._mk(h.s, yielding, { zone: 15, basis: 1 }); h.s.assets = [a]; h.s.pipes = []; h.s.loans = [];
    const said = +/Pays about \$([\d,]+) a day/.exec(shown(stock.html(ctx)))[1].replace(/,/g, '');
    h.s.hour = 24; const cash = h.s.cash; h._dayTick();
    assert.ok(Math.abs(h.s.cash - cash - said) / said < 0.02, `${zones}: the card says $${said}, the day paid $${h.s.cash - cash}`);
    if (zones.length > 1) assert.ok(h.B.rentMult > 1, 'the card counted the rent bonus');
  }
  assert.equal(g.B.rentMult, 1);
});

test('D1: a haggle lasts one round longer in Flea Market Row, and the season swings the demand the district says', () => {
  const rounds = (zone) => haggleCreate(D.haggleParams(fresh(), { role: 'buy', zone, seed: 5, style: 'friendly', lot: { price: 10 }, fair: 10 })).n0;
  assert.equal(rounds(2) - rounds(3), 1);
  assert.match(T.rulePhrases(2)[0], /one round longer/);
  for (const z of [3, 11]) {
    const r = ZONES[z].rules.season, def = Object.values(ASSETS).find((a) => a.tags.some((t) => r.tags.includes(t)));
    const swing = Array.from({ length: r.period * 4 }, (_, i) => seasonMult(def, z, i / 4 + 1)), top = Math.max(...swing), bottom = Math.min(...swing);
    assert.ok(Math.abs(top - (1 + r.amp)) < 0.01 && Math.abs(bottom - (1 - r.amp)) < 0.01, 'up to the amplitude, both ways');
    assert.ok(Math.abs(seasonMult(def, z, 3) - seasonMult(def, z, 3 + r.period)) < 1e-9 && Math.abs(seasonMult(def, z, 3) - seasonMult(def, z, 3 + r.period / 2)) > 1e-3, 'and the period is a wave');
    const said = T.rulePhrases(z).find((t) => /wave/.test(t));
    assert.ok(said.includes(`${pct(r.amp)} either way on a ${r.period}-day wave.`)); assert.ok(r.tags.every((t) => said.toLowerCase().includes(t)));
  }
});

test('D1: what a district opens is a rule of the district, said once: the Bank and managers at Metro Hub, audits at Industrial Park, enterprise at Corporate Valley', () => {
  assert.equal(ZONES[5].gate, MIL.m1); assert.equal(MIL_ZONE.m1, 5); assert.equal(MIL_ZONE.m2, 9); assert.equal(MIL_ZONE.m3, 13);
  assert.equal(ZONES[9].gate, MIL.m2); assert.equal(ZONES[13].gate, MIL.m3);
  assert.ok(ZONES[5].auto && !ZONES[4].auto, 'managers work from Metro Hub on');
  const g = fresh(); g.s.cash = MIL.m2 * 2; g._unlock();
  assert.ok(g.s.mil.m1 && g.s.mil.m2 && g.s.mil.m3 === false && g.s.auditNext != null, 'reaching Industrial Park starts the audits');
  g.s.cash = MIL.m3 * 2; g._unlock(); assert.ok(g.s.mil.m3);
  assert.equal(g.exitQuote('sale').ok, true);
  assert.match(T.rulePhrases(5)[0], /Managers, clients, upgrades and the Bank open here/); assert.match(T.rulePhrases(9)[0], /Compliance audits begin here/); assert.match(T.rulePhrases(13)[0], /Enterprise clients, trade sales and IPOs open here/);
  // what Metro Hub opens: the upgrades and the first client are Metro Hub's (zone 5), and the milestone's own note says the rest
  assert.ok(Object.values(C.UPGRADES).every((u) => u.zone === 5) && C.CLIENTS.smb.zone === 5 && C.CLIENTS.corp.zone === 5);
  { const h = fresh(); h.s.cash = 5000;
    assert.match(h.buyUpgrade('freight').msg, /Unlocks at Metro Hub/); assert.match(h.acquireClient('smb').msg, /Not available in your districts yet/);
    h.s.cash = MIL.m1 * 2; h._unlock(); assert.match(h.s.news.find((n) => n.milestone === 1).text, /Managers, clients and the Commercial Bank are open/);
    assert.equal(h.buyUpgrade('freight').ok, true); assert.doesNotMatch(h.acquireClient('smb').msg, /Not available in your districts yet/, 'Metro Hub opens the clients'); }
  assert.ok(C.CLIENTS.ent.zone === 13 && C.CLIENTS.ent.needs === 'm3', 'enterprise clients are Corporate Valley\'s');
  for (const id of [5, 9, 13]) assert.ok(T.rewardPhrases(id).every((t) => !/open|begin|unlock/i.test(t)), 'the reward lists what it gives, not what it opens');
});

test('D1: each reward line is what opening the district does in the engine', () => {
  // two games that differ by one district: the effect is the ratio between them
  const pair = (id, base = [1, 2]) => { const a = fresh(), b = fresh(); for (const z of base) { a._openZone(z); b._openZone(z); } b._openZone(id); return [a, b]; };
  const said = (id) => T.rewardPhrases(id).join(' ');
  { const [a, b] = pair(8); const crate = (g) => { const x = g._mk(g.s, 'radio', { zone: 1 }); g.s.assets = [x]; g.s.cash = 1e6; return g.freightQuote([x.id], 2).cost; }; assert.ok(Math.abs(crate(b) / crate(a) - 0.7) < 1e-9); assert.ok(said(8).includes(`Freight costs ${pct(1 - crate(b) / crate(a))} less everywhere.`)); }
  { const [a, b] = pair(7); assert.ok(said(7).includes(`Repairs cost ${pct(1 - b.repairMultFor(8) / a.repairMultFor(8))} less everywhere.`)); }
  { const [a, b] = pair(9, [1, 2, 5]); const cap = (g) => g.pipeCap({ kind: 'broker', zone: 5, level: 1 }); assert.ok(said(9).includes(`Manager capacity is ${pct(cap(b) / cap(a) - 1)} higher.`)); }
  { const [a, b] = pair(11); assert.equal(b.storeCap(1) - a.storeCap(1), 4); assert.ok(said(11).includes('4 more storage spaces in every district.')); }
  { const [a, b] = pair(6); const room = (g) => { let n = 0; for (let i = 0; i < 40; i++) { g.s.lots[1] = g.s.lots[1].slice(0, n); g._spawnLot(1); if (g.s.lots[1].length > n) n = g.s.lots[1].length; } return n; }; assert.equal(room(b) - room(a), 1); assert.ok(said(6).includes('1 more lot on offer in every district.')); }
  { const [a, b] = pair(14, [1, 2, 5]); a.s.mil.m1 = b.s.mil.m1 = true; const rate = (g) => (g.loanRate('pipeline') / g.fintechRate - C.BASE_RATE); void rate;
    const base = (g) => C.BASE_RATE + g.mods().rateBps / 10000, spread = (g) => g.loanRate('pipeline') - base(g) * Math.max(0.45, 1 - 0.07 * (g.lvl('fintech') - 1)); // what is left of the rate once the base has been taken out
    assert.ok(Math.abs(spread(b) / spread(a) - 0.8) < 1e-9); assert.ok(said(14).includes(`Loan spreads are ${pct(1 - spread(b) / spread(a))} lower.`)); }
  { const [a, b] = pair(13, [1, 2, 5]); a.s.mil.m1 = b.s.mil.m1 = true; const limit = (g, p) => g.loanRoom(p).limit;
    assert.ok(Math.abs(limit(b, 'micro') / limit(a, 'micro') - 1.5) < 1e-9); assert.equal(limit(b, 'pipeline'), limit(a, 'pipeline'), 'a limit that is a share of what you own does not move');
    assert.ok(said(13).includes(`Micro-Business and Enterprise credit limits are ${pct(limit(b, 'micro') / limit(a, 'micro') - 1)} higher.`)); }
  { const [a, b] = pair(16, [1, 2, 5, 13]); const prem = (g) => { g.s.mil.m3 = true; g.s.dp = [1000, 1000]; return g.exitQuote('ipo').premium; }; assert.ok(Math.abs(prem(b) / prem(a) - 1.1) < 1e-9); assert.ok(said(16).includes(`Exit multiples are ${pct(prem(b) / prem(a) - 1)} higher.`)); }
  { const [a, b] = pair(15, [1, 2, 5]); const income = (g) => { const x = g._mk(g.s, Object.keys(ASSETS).find((c) => ASSETS[c].yield && ASSETS[c].tags.includes('realty')), { zone: 15 }); g.s.assets = [x]; g.s.pipes = []; g.s.hour = 24; const cash = g.s.cash; g._dayTick(); return g.s.cash - cash; };
    const ratio = income(b) / income(a); assert.ok(Math.abs(ratio - 1.25) < 0.01); assert.ok(said(15).includes(`Property rent income is ${pct(Math.round(ratio * 100) / 100 - 1)} higher.`)); }
  { const [a, b] = pair(10); const arrivals = (g) => { let n = 0; for (let h = 1; h <= 2400; h++) { g.s.hour = h; g.s.leads[1] = []; g._spawnLead(1, true); n += g.s.leads[1].length; } return n; }; const r = arrivals(b) / arrivals(a); assert.ok(Math.abs(r - 1.15) < 0.02, `buyers arrive ${r}x as fast`); assert.ok(said(10).includes('Buyers arrive 15% faster.')); }
  for (const id of ZONE_IDS) assert.deepEqual(Object.keys(ZONES[id].bonus || {}).length > 0, T.rewardPhrases(id).length > 0, `${ZONES[id].name}: a reward line for every bonus, and none without`);
});

test('D1: the liquidity pool refills 35% of its depth a day, as the Stock confirmation says', () => {
  const g = fresh(); g.s.pool[1] = 0; g.s.zones = [1]; g.s.leads[1] = []; g.s.lots[1] = [];
  for (let i = 0; i < 24; i++) g.stepHour();
  const share = g.s.pool[1] / ZONES[1].pool; assert.ok(Math.abs(share - 0.35) < 1e-9, `${share}`);
  const ctx = fakeCtx({ days: 10 }), h = ctx.g(); h.s.assets = []; const a = h._mk(h.s, 'bike', { zone: 1, basis: 1 }); h.s.assets = [a]; ctx.U.zone = 1; ctx.U.sel.add(a.id); h.s.pool[1] = 0.01;
  let body = ''; ctx.confirmBox = (title, html) => { body = html; }; stock.acts(ctx)['stock-sellpool']({ dataset: {} });
  assert.match(body, new RegExp(`It refills ${Math.round(share * 100)}% of its depth a day\\.`));
});

test('D1: a gray market tells the Second-Chance Hustler its discount and no one else; the engine reads the rule for no one else', () => {
  const price = (perks) => { const g = fresh(perks, 4); g.s.cash = 1e5; g._unlock(); g._openZone(4); const prices = []; for (let i = 0; i < 300; i++) { g.s.lots[4] = []; g._spawnLot(4); const l = g.s.lots[4][0]; prices.push(l.price / g.val({ cls: l.cls, cond: l.cond, quality: 1, wear: 1, zone: 4 }, 4)); } return prices.reduce((x, y) => x + y, 0) / prices.length; };
  const second = fresh(['second', 'trades']), plain = fresh(['trades', 'pro']);
  assert.ok(second.P.lotDiscountGray > 0 && !plain.P.lotDiscountGray);
  assert.equal(T.grayBreak(4, plain.P.lotDiscountGray || 0), ''); assert.equal(T.grayBreak(5, second.P.lotDiscountGray), '', 'and only in a district with the gray rule');
  assert.equal(T.grayBreak(4, second.P.lotDiscountGray), `Gray market: lots cost ${pct(second.P.lotDiscountGray)} less for you.`);
  assert.ok(price(['second', 'trades']) < price(['trades', 'pro']) * 0.98, 'the lots are cheaper for the Hustler');
});

// ---------------------------------------------------------------------------------------------------------------------------------
// D2. The old claims, gone
test('D2: the wrong claims and the three sets of lesson titles are gone from the drawers', () => {
  const files = ['crew', 'bank', 'travel', 'stock', 'market', 'quests', 'districttext'].map((f) => [f, read(`js/ui/drawers/${f}.js`)]);
  files.push(['hud', read('js/ui/hud.js')], ['quests data', read('js/meta/quests.js')]);
  const OLD = [
    [/Cycles are long/i, 'the cycle is shorter on Real Estate Row, not longer (it was Market rent)'], [/appraisals can be disputed/i, 'no mechanic'],
    [/audit fines are not softened/i, 'no district softens a fine; the gray rule only touches one Background\'s prices'], [/tariffs slow every cycle/i, 'a tariff shock slows international lanes; ordinary days do not'],
    [/trims every spread/i, 'Capital Sourcing cuts the whole rate, base and spread'], [/\bQuicker\b/, 'a trade sale and an IPO both settle in 48 hours'], [/A rejected pitch costs 10/, 'a scam costs 10, a spotted counterfeit 3, a pitch with no fit nothing'],
    [/5 \* \(s\.streak \+ 1\)/, 'the streak bonus stops at 10 steps'], [/Your score is locked at \$\{m\(s\.exit\.nw\)\}/, 'that figure is the net worth; the score is the EEI'],
    [/Deals come in bulk|bulk lots come in multiples/i, 'no engine rule'], [/rarely what they seem/i, 'most lots are what they say'], [/Takes \$\{Math\.round\(K\.royalty \* 100\)\}% of profit/, 'the royalty is on the margin before costs'],
    [/Saturation and the herd|Repair and return|Assets that pay|Assets and cash flow|Utility fit/, 'the Codex names the sixteen lessons, once'], [/One in five lots may be counterfeit|Nearly all lots|A third of the lots/, 'the old share words'],
    [/Everything is done by hand\./, 'x'],
  ];
  for (const [re, why] of OLD) for (const [name, src] of files) assert.doesNotMatch(src, re, `${name}: ${why}`);
  // one set of titles: the Codex's, and no drawer types one of them out
  for (const [name, src] of files.filter(([n]) => !/quests data|hud/.test(n))) for (const c of CODEX.slice(0, 16)) assert.ok(!src.includes(c.title.replace(/'/g, '’')) && !src.includes(`'${c.title}'`) && !src.includes(`"${c.title}"`), `${name} types out the title "${c.title}"`);
});

test('D2: Travel and the Market print the same lesson title for every district, the Codex\'s', () => {
  const ctx = fakeCtx({ days: 60 }); const g = ctx.g(); for (const z of ZONE_IDS) if (!g.s.zones.includes(z)) g._openZone(z);
  ctx.U.travel = { tab: 'path', sig: '' }; const t = travel.html(ctx);
  for (const z of ZONE_IDS) {
    const title = CODEX.find((c) => c.id === ZONES[z].teaches).title;
    assert.ok(t.includes(`aria-label="Read about ${esc(title)} in the Codex"`), `Travel names ${title}`);
    ctx.U.zone = z; ctx.U.marketTab = 'exchange'; ctx.U.fold = { 'market.about': true };
    assert.ok(market.html(ctx).includes(`Teaches <b>${esc(title)}</b>`), `the Market names ${title}`);
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------
// D3. Quests
/** A winning sale in the Scrap Yard: a paperclip and an urgent buyer, the streak set, and the XP the engine asked for. */
function winAt(streak, perks = ['grad', 'pro']) {
  const g = fresh(perks, 33), a = g._mk(g.s, 'paperclip', { zone: 1 }); g.s.assets = [a];
  const lead = { id: 'LT' + g.s.nid++, zone: 1, seg: 'student', budget: 8, need: 'tool', born: 0, exp: 99 }; g.s.leads[1] = [lead];
  g.s.streak = streak; const asked = []; const xp = g.xp.bind(g); g.xp = (n) => { asked.push(n); return xp(n); };
  const r = g.pitch(a.id, lead.id, { mult: 1.4 });
  return { g, r, xp: asked.at(-1), streak: g.s.streak };
}
test('D3: the next win pays 5 XP for each step of the streak it makes, and the steps stop at ten', () => {
  const base = winAt(-1).xp; // a win that makes streak 0 pays no streak bonus: the rest of a win's XP
  assert.equal(winAt(-1).streak, 0);
  for (const streak of [1, 2, 3, 4, 8, 9, 10, 11, 16, 48]) {
    const bonus = winAt(streak).xp - base; // what the engine pays for the win after a streak of `streak`
    const ctx = fakeCtx({ days: 0, perks: ['grad', 'pro'] }); const m = ctx.g().P.xpMult ?? 1; ctx.progress = new Progress(ctx.g()); ctx.g().s.streak = streak;
    const said = +/Next win: \+(\d+) bonus XP/.exec(shown(quests.html(ctx)))[1];
    assert.equal(said, Math.round(bonus * m), `streak ${streak}: the engine pays ${bonus} (x${m})`);
  }
  assert.equal(winAt(10).xp, winAt(40).xp, 'ten steps and no more');
  assert.doesNotMatch(read('js/ui/drawers/quests.js'), /5 \* \(s\.streak \+ 1\)/);
});

test('D3: a win is a sale more than 2% above fair value; anything less ends the streak', () => {
  const trial = (mult) => { const g = fresh([], 33), a = g._mk(g.s, 'radio', { zone: 2 }); g.s.assets = [a]; g.s.zones.push(2); g.s.leads[2] = []; const lead = { id: 'LT1', zone: 2, seg: 'dolores', budget: 1e6, born: 0, exp: 99 }; g.s.leads[2].push(lead); g.s.streak = 4; return { g, q: g.quotePitch(a.id, lead.id, { mult }, { blind: false }), run: () => g.pitch(a.id, lead.id, { mult }) }; };
  let lo = 0.6, hi = 1.4; // the dearest deal that is still no win, and the cheapest that is one
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (trial(mid).q.gain > 0.02) hi = mid; else lo = mid; }
  const below = trial(lo), above = trial(hi);
  assert.ok(below.q.gain <= 0.02 && above.q.gain > 0.02 && above.q.gain - below.q.gain < 1e-6, `the line sits at a gain of ${above.q.gain}`);
  below.run(); above.run();
  assert.equal(below.g.s.streak, 0, 'a gain of 2% or less ends the streak'); assert.equal(above.g.s.streak, 5, 'a gain above it adds one');
  const ctx = fakeCtx({ days: 0 }); ctx.progress = new Progress(ctx.g());
  assert.match(shown(quests.html(ctx)), /A win beats fair price by more than 2%\./);
  assert.match(ACHIEVEMENTS.find((a) => a.id === 'a-closer').desc, /over 2% above fair price/);
});

test('D3: reputation falls 10 for a scam, 3 for a spotted counterfeit and nothing for a pitch with no fit; a win adds 1; buyers come 0.85 + 0.003 per point as fast', () => {
  const rep = (setup, perks = []) => { const g = fresh(perks, 5); g.s.zones.push(2); g.s.leads[2] ||= []; g.s.rep = 50; const a = g._mk(g.s, 'radio', { zone: 2 }); g.s.assets = [a]; const lead = { id: 'LT1', zone: 2, seg: 'dolores', budget: 1e6, born: 0, exp: 99 }; g.s.leads[2] = [lead]; setup(g, a, lead); g.pitch(a.id, lead.id, { mult: 1.4 }); return g.s.rep - 50; };
  const lost = rep((g, a, lead) => { lead.scam = true; });
  const spotted = rep((g, a) => { a.truth = { q: 1, fake: true, defects: [] }; });
  const nofit = rep((g, a, lead) => { lead.seg = 'okonkwo'; a.cls = 'dormFridge'; ASSETS.dormFridge && (lead.seg = 'burt'); a.cls = 'oddHardware'; lead.seg = 'burt'; });
  const won = rep(() => {});
  const ctx = fakeCtx({ days: 0 }); ctx.progress = new Progress(ctx.g()); const t = shown(quests.html(ctx));
  assert.equal(lost, -10); assert.equal(spotted, -3); assert.equal(nofit, 0); assert.equal(won, 1);
  assert.ok(t.includes(`A win adds ${won}. A scam costs ${-lost} and a spotted counterfeit ${-spotted}.`), t.slice(0, 600));
  // the arrival rate against reputation
  const arrivals = (rp) => { const g = fresh([], 8); g.s.rep = rp; let n = 0; for (let h = 1; h <= 2400; h++) { g.s.hour = h; g.s.leads[1] = []; g._spawnLead(1, true); n += g.s.leads[1].length; } return n; };
  const at50 = arrivals(50); for (const rp of [0, 25, 72, 100]) {
    const c = fakeCtx({ days: 0 }); c.progress = new Progress(c.g()); c.g().s.rep = rp;
    const said = +/Buyers arrive at ([\d.]+)x speed/.exec(shown(quests.html(c)))[1];
    assert.ok(Math.abs(arrivals(rp) / at50 - said / 1.0) < 0.025, `at reputation ${rp} the page says ${said}x, the engine ${arrivals(rp) / at50}x`);
  }
});

test('D3: every row of every skill is the engine\'s, and the Market Research Suite counts in the early warning', () => {
  const rowOf = (ctx, label) => { const li = new RegExp(`<li><span class="lb">${label}</span><span class="now">([^<]*)</span>(?:<span class="nx">.*?</span></span>)?`).exec(quests.html(ctx)); return li[1]; };
  const num = (t) => parseFloat(t.replace(/[^0-9.]/g, ''));
  for (let L = 1; L <= C.SKILL_MAX; L++) {
    const ctx = fakeCtx({ days: 0, perks: [] }); ctx.progress = new Progress(ctx.g()); const g = ctx.g(); Object.assign(g.s.skills, { ops: L, growth: L, fintech: L });
    const lvl1 = fresh(); Object.assign(lvl1.s.skills, { ops: 1, growth: 1, fintech: 1 }); const cost = (x) => x.repairQuoteFor('radio', 2); // the same class in the same district
    lvl1._openZone(2); g._openZone(2);
    { const exact = (cost(g).cost / cost(lvl1).cost) * 100; assert.ok(Math.abs(num(rowOf(ctx, 'Repair bill')) - exact) <= (exact >= 10 ? 0.5 : 0.05) + 1e-9, `Ops ${L}: repair bill ${exact}`); } // (the drawer rounds to a whole percent from 10, to a tenth below)
    assert.equal(num(rowOf(ctx, 'Repairs restore')), Math.round(cost(g).quality * 100));
    const risk = (x) => { const crate = x._mk(x.s, 'radio', { zone: 1 }); x.s.assets = [crate]; return x.freightQuote([crate.id], 2).risk; };
    assert.equal(num(rowOf(ctx, 'Damage risk in freight')), Math.round(risk(g) * 100));
    assert.equal(num(rowOf(ctx, 'Pitch prices')), Math.round((g.growthMult() - 1) * 100));
    const p = { kind: 'student', zone: 5, level: 1, alloc: 100 }; assert.ok(Math.abs(num(rowOf(ctx, 'Manager cycles')) / 100 - (lvl1.cycleLen(p) / g.cycleLen(p) - 1)) < 0.03, `Growth ${L}: cycles (the engine rounds a cycle to whole hours)`);
    assert.equal(num(rowOf(ctx, 'Trading fees')), Math.round((1 - g.instFee('pitch') / lvl1.instFee('pitch')) * 100));
    assert.equal(num(rowOf(ctx, 'Loan interest')), Math.round((1 - g.loanRate('micro') / lvl1.loanRate('micro')) * 100));
    for (const research of [false, true]) {
      g.s.upg.research = research; const h = g.warnLead();
      assert.equal(rowOf(ctx, 'Early warning of shocks'), h >= 24 ? `${h / 24} days` : `${h} hours`, `Capital Sourcing ${L}, research ${research}`);
    }
  }
  assert.deepEqual([WARN_LEAD.novice, WARN_LEAD.mid, WARN_LEAD.adv].map((h) => h), [12, 72, 168].map((h) => h));
  { // buyers arriving: +15% a level
    const arrivals = (L) => { const g = fresh(); g.s.skills.growth = L; let n = 0; for (let h = 1; h <= 2400; h++) { g.s.hour = h; g.s.leads[1] = []; g._spawnLead(1, true); n += g.s.leads[1].length; } return n; };
    for (const L of [3, 8]) { const ctx = fakeCtx({ days: 0, perks: [] }); ctx.progress = new Progress(ctx.g()); ctx.g().s.skills.growth = L; assert.ok(Math.abs(arrivals(L) / arrivals(1) - (1 + num(rowOf(ctx, 'Buyers arriving')) / 100)) < 0.03); }
  }
});

test('D3: the level line, the point line and what a skill does are on the page, the last one shut', () => {
  const ctx = fakeCtx({ days: 25 }); ctx.progress = new Progress(ctx.g()); const g = ctx.g();
  const h = quests.html(ctx), t = shown(h);
  assert.equal((h.match(/<summary data-act="quests-fold" data-k="sk-/g) || []).length, 3, 'one fold for each skill');
  for (const K of Object.values(C.SKILLS)) { assert.ok(h.includes(`title="${esc(K.blurb)}`) && !t.includes(K.blurb), `${K.name}: its blurb is the hover and the fold`); }
  g.s.points = 0; Object.assign(g.s.skills, { ops: C.SKILL_MAX, growth: C.SKILL_MAX, fintech: C.SKILL_MAX });
  assert.equal(g.pointRoom(), 0); assert.match(shown(quests.html(ctx)), new RegExp(`Every skill is mastered: a level pays ${ECON.pointXp} XP\\.`));
  const before = g.s.xp; g.grantPoints(1); assert.equal(g.s.xp - before, ECON.pointXp, 'which is what the engine pays');
});

// ---------------------------------------------------------------------------------------------------------------------------------
// D4. Bank
test('D4: the Bank says by how much Capital Sourcing cuts loan interest, in the engine\'s own rates (on the Rate of each line, as a hover)', () => {
  const rate = (L) => { const g = fresh(); g.s.skills.fintech = L; return g.loanRate('micro'); };
  for (let L = 1; L <= C.SKILL_MAX; L++) {
    const ctx = fakeCtx({ days: 10, perks: [] }); ctx.g().s.skills.fintech = L;
    assert.match(bank.html(ctx), new RegExp(`title="[^"]*Capital Sourcing level ${L} cuts loan interest by ${Math.round((1 - rate(L) / rate(1)) * 100)}%\\."[^>]*>[\\d.]+% per 30 days`), 'the Rate of a line carries it as its hover');
    assert.doesNotMatch(shown(bank.html(ctx)), /Capital Sourcing level/, 'and it is not on the page');
  }
});

test('D4: a trade sale and an IPO both settle in 48 hours; the cards state the multiple, and the IPO wants a clean record', () => {
  const ctx = fakeCtx({ days: 60 }), g = ctx.g(); g.s.dp = [1000, 1000, 1000];
  const sale = g.exitQuote('sale'), ipo = g.exitQuote('ipo'), avg = 1000;
  assert.equal(sale.hours, 48); assert.equal(ipo.hours, 48); assert.equal(sale.hours, ipo.hours);
  const mult = (q) => q.premium / avg / Math.max(0.3, 1 - 0.15 * g.s.auditFail);
  const t = shown(bank.html(ctx));
  assert.ok(t.includes(`Sells the whole business at ${+mult(sale).toFixed(1)}x average daily profit.`)); assert.ok(t.includes(`Goes public at ${+mult(ipo).toFixed(1)}x average daily profit; needs a clean audit record.`));
  assert.doesNotMatch(t, /Quicker/);
  g.s.auditFail = 1; assert.equal(g.exitQuote('ipo').ok, false); assert.equal(g.exitQuote('sale').ok, true);
  g.s.auditFail = 0; g.exit('sale'); g.advanceTo(g.s.hour + 48);
  assert.ok(g.s.exit);
  const done = shown(bank.html(ctx));
  assert.ok(done.includes(`Net worth locked at ${ctx.money(g.s.exit.nw)}`) && done.includes(`Score ${g.eei().toFixed(2)}.`), done.slice(0, 200));
  assert.notEqual(g.s.exit.nw, g.eei(), 'a net worth and a score are two figures');
});

test('D4: the audit page quotes the engine: the consultant, five days, the odds, the fine, the slowdown, the growth of the fine', () => {
  for (const L of [1, 4, 8]) {
    const ctx = fakeCtx({ days: 25 }), g = ctx.g(); g.s.skills.fintech = L; g.s.auditNext = g.s.hour; g._audits(); assert.ok(g.s.auditPending);
    g.s.cash = 1e6; const t = shown(bank.html(ctx));
    const fee = (() => { const x = Game.prototype; void x; const cash = g.s.cash; const copy = fakeCtx({ days: 25 }).g(); copy.s.skills.fintech = L; copy.s.auditNext = copy.s.hour; copy._audits(); copy.s.cash = 1e6; copy.resolveAudit('A'); return 1e6 - copy.s.cash + (cash - cash); })();
    assert.ok(t.includes(`Hire a consultant for ${ctx.money(fee)}`) && t.includes(`Costs ${ctx.money(fee)} once.`), `fintech ${L}`);
    assert.ok(t.includes(`stops for ${AUDIT.pauseHours / 24} days`) && t.includes(`${Math.round(AUDIT.passChance * 100)}% chance nobody notices.`));
    assert.ok(t.includes(`a ${ctx.money(g.auditFine())} fine`) && t.includes(`${Math.round((1 - AUDIT.velocityHit) * 100)}% slower for good`));
    const w = fakeCtx({ days: 25 }).g(); w._auditFail(false); const first = w.auditFine(); w._auditFail(false);
    assert.ok(Math.abs(w.auditFine() / first - 1.5) < 1e-9); assert.ok(t.includes('Each failure makes the next fine 50% bigger.'));
    const v = fakeCtx({ days: 25 }).g(); v.s.pipes.forEach((p) => { p.inflight = 0; }); const p0 = v.s.pipes[0]; const len = v.cycleLen(p0); v._auditFail(false); assert.ok(Math.abs(v.cycleLen(p0) / len - 1 / AUDIT.velocityHit) < 0.05, 'a cycle takes 1/0.85 as long: managers run 15% slower');
  }
});

test('D4: the stress test and the cushion are the net worth the engine ends with', () => {
  const ctx = fakeCtx({ days: 25 }), g = ctx.g(), s = g.s;
  s.loans = [{ id: 'D1', prod: 'micro', principal: g.netWorth() * 0.5, accr: 0, last: s.hour, next: s.hour + 24, drawn: s.hour }];
  const nw = g.netWorth(), debt = g.debt(), t = shown(bank.html(ctx));
  s.cash -= nw * 0.3; assert.ok(t.includes(`the ratio would jump to ${g.deRatio().toFixed(2)}`), 'a fall of 30% tomorrow'); s.cash += nw * 0.3;
  const cushion = nw - debt / DEBT.callDE; s.cash -= cushion; assert.ok(Math.abs(g.deRatio() - DEBT.callDE) < 1e-9, 'the cushion takes the ratio to the margin call'); s.cash += cushion;
  assert.ok(t.includes(ctx.money(DEBT.maxDE * nw - debt)) && t.includes(ctx.money(cushion)));
  assert.ok(Math.abs(g.loanRoom('pipeline').de - (DEBT.maxDE * nw - debt)) < 1e-6, 'the room the ratio leaves');
  assert.match(t, new RegExp(`at ${Math.round(DEBT.fireSale * 100)}% off`));
});

// ---------------------------------------------------------------------------------------------------------------------------------
// D5. Crew
test('D5: each upgrade does what its line says, and the Crew drawer prints that line (js/config.js UPGRADES)', () => {
  const pair = (key) => { const a = fresh(), b = fresh(); for (const g of [a, b]) { g.s.cash = 1e6; g._unlock(); g._openZone(5); g._openZone(2); } b.s.upg[key] = true; return [a, b]; };
  const pipe = { kind: 'student', zone: 5, level: 1, alloc: 100, cls: 'radio', buyer: 'tariq', channel: 'dom', cycles: 0 }, broker = { ...pipe, kind: 'broker' }; // (a broker's cycle is 60 hours: no rounding to speak of)
  const arrivals = (g) => { let n = 0; for (let h = 1; h <= 2400; h++) { g.s.hour = h; g.s.leads[1] = []; g._spawnLead(1, true); n += g.s.leads[1].length; } return n; };
  const ctx = fakeCtx({ days: 10 }); ctx.U.crew = { tab: 'upgrades', hire: null }; const page = shown(crew.html(ctx));
  for (const u of Object.values(C.UPGRADES)) assert.ok(page.includes(u.blurb), `the drawer prints the line of ${u.name}`);
  const said = (id, ...parts) => { const b = C.UPGRADES[id].blurb; for (const p of parts) assert.ok(p instanceof RegExp ? p.test(b) : b.includes(p), `${id}: "${b}" says ${p}`); };
  { const [a, b] = pair('jit'); // (the line may say the decay as "50% slower" or "half as fast")
    const age = (g, cls) => { const x = { cls, wear: 1 }; g._age(x, 1); return 1 - x.wear; }, perish = Object.keys(ASSETS).find((c) => ASSETS[c].perish);
    assert.ok(Math.abs(age(b, 'radio') / age(a, 'radio') - 0.5) < 1e-9 && Math.abs(age(b, perish) / age(a, perish) - 0.5) < 0.01, 'depreciation and spoilage at half');
    said('jit', `${pct(1 - b.cycleLen(broker) / a.cycleLen(broker))} shorter`, /50% slower|half as fast/, `${pct(1 - b.forecast(pipe).overhead / a.forecast(pipe).overhead)} lower`); }
  { const [a, b] = pair('seo'); const ratio = arrivals(b) / arrivals(a); assert.ok(Math.abs(ratio - 1.5) < 0.04, `${ratio}`);
    said('seo', `+${pct(Math.round(ratio * 10) / 10 - 1)}`, `+${pct(b.forecast(pipe).margin / a.forecast(pipe).margin - 1)}`, `${pct(1 - b.clientQuote('smb').cac / a.clientQuote('smb').cac)} cheaper`); }
  { const [a, b] = pair('freight'); const cost = (g) => { const x = g._mk(g.s, 'radio', { zone: 1 }); g.s.assets = [x]; return g.freightQuote([x.id], 2).cost; };
    said('freight', `${pct(1 - cost(b) / cost(a))} less`); }
  { const [a, b] = pair('research'); assert.equal(a.warnLead(), WARN_LEAD.novice); assert.equal(b.warnLead(), WARN_LEAD.mid, 'one tier earlier');
    said('research', 'tier', 'Radar');
    const plain = fakeCtx({ days: 25, perks: ['trades', 'second'] }); plain.U.marketTab = 'radar'; assert.doesNotMatch(market.html(plain), /data-panel="radar"/); plain.g().s.upg.research = true; assert.match(market.html(plain), /data-panel="radar"/, 'the Radar tab opens with the Suite'); }
});

test('D5: an international lane earns the stated margin and slows only in a tariff shock; the royalty is a share of the margin before costs', () => {
  const g = fresh(); g.s.cash = 1e6; g._unlock(); g._openZone(5);
  const p = { kind: 'broker', zone: 5, level: 1, alloc: 500, cls: 'radio', buyer: 'tariq', channel: 'dom', cycles: 0 }, intl = { ...p, channel: 'intl' };
  assert.ok(Math.abs(g.forecast(intl).margin / g.forecast(p).margin - (1.3 + g.P.intlBonus)) < 1e-9);
  assert.equal(g.cycleLen(intl), g.cycleLen(p), 'an ordinary day: no slowdown');
  const f = g.forecast(p); assert.ok(Math.abs(f.roy / f.gross - PIPE.broker.royalty) < 1e-9, 'the royalty is a share of the margin before costs');
  g.injectEvent('tariff', g.s.hour + 1); g.stepHour();
  assert.equal(g.cycleLen(intl) - g.cycleLen(p), C.EVENTS.tariff.phases[0].eff.intlSlow, 'a tariff shock: four days');
  const ctx = fakeCtx({ days: 25 }); const gg = ctx.g(); const zone = [...gg.s.zones].filter((z) => ZONES[z].auto && gg.s.pipes.filter((q) => q.zone === z).length < ZONES[z].plots).sort((a, b) => b - a)[0];
  crew.acts(ctx)['crew-hire']({ dataset: { d: String(zone) } });
  const dlg = [...ctx.calls].reverse().find((c) => c[0] === 'dlg')[1], t = shown(dlg);
  assert.ok(t.includes(`Margin x${(1.3 + gg.P.intlBonus).toFixed(2)}. A tariff shock slows these cycles by ${C.EVENTS.tariff.phases[0].eff.intlSlow / 24} days.`));
  for (const k of Object.keys(PIPE)) assert.ok(t.includes(`Royalty ${Math.round(PIPE[k].royalty * 100)}%.`));
});

test('D5: a missed day costs twice the account\'s daily pay and the second one ends the contract', () => {
  for (const tier of ['smb', 'corp']) {
    const ctx = fakeCtx({ days: 25 }); const g = ctx.g(), s = g.s; s.pipes = []; s.cash = 1e6; s.clients = [{ id: 'C1', tier, cac: 1, until: 1e6, earned: 0, breaches: 0 }]; ctx.U.crew = { tab: 'clients', hire: null };
    const said = shown(crew.html(ctx)); const cash = s.cash;
    g._dayTick(); const penalty = cash - s.cash;
    assert.equal(penalty, CLIENTS[tier].perDay * 2);
    assert.ok(said.includes('A missed day costs twice the account\'s daily rate, and a second ends the contract.'), 'the rule is said once, above the accounts');
    assert.ok(crew.html(ctx).includes(`title="A missed day costs ${ctx.money(penalty)}."`), 'and its dollars are on each card\'s SLA chip');
    assert.equal(s.clients.length, 1); g._dayTick(); assert.equal(s.clients.length, 0, 'the second miss ends it');
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------
// D6. Quests, badges and the Goal card
test('D6: a quest is one sentence, and the figures in the quests are the rules\'', () => {
  const one = (t) => (t.match(/[.!?](?=\s|$)/g) || []).length;
  for (const q of QUESTS) assert.equal(one(q.desc), 1, `${q.id}: ${q.desc}`);
  for (const d of DAILIES) assert.equal(one(d.desc), 1, `${d.id}: ${d.desc}`);
  const two = ACHIEVEMENTS.filter((a) => one(a.desc) > 1); assert.deepEqual(two.map((a) => a.id), ['a-bg-heir'], `only the Heir's safety net needs a second sentence: ${two.map((a) => a.id)}`);
  const slogans = /You know the signs|Nothing fake gets past you|Your hands know|You do not follow trails|It is in the name|Your dad did know|Your network moves goods|Locals remember|Tools stack up|A crowd cuts your price|Fast cash costs a haircut|Anchor high|Aim at the stars|beats luck/;
  for (const x of [...QUESTS, ...ACHIEVEMENTS, ...DAILIES]) assert.doesNotMatch(x.desc, slogans, x.id);
  const q = (id) => QUESTS.find((x) => x.id === id).desc, a = (id) => ACHIEVEMENTS.find((x) => x.id === id).desc;
  assert.ok(q('q04a').includes('about 1 in 5') && Math.abs(ZONES[4].rules.fakes - 0.2) < 0.03);
  assert.ok(q('q06a').includes('about half') && Math.abs(ZONES[6].rules.auction - 0.5) < 0.08);
  assert.ok(q('q07a').includes('6 in 10 lots here are broken') && T.rulePhrases(7)[0].includes('6 in 10'));
  assert.ok(q('q07b').includes(`${pct(ZONES[7].rules.repair)} less`));
  assert.ok(q('q08b').includes('12 hours') && q('q08b').includes('2% fee'));
  assert.ok(q('q10a').includes('twice as fast') && T.rulePhrases(10)[0].includes('twice as fast'));
  assert.ok(a('a-off-the-charts').includes(`${CM.max}`));
  assert.ok(a('a-lucky-bypass').includes(`${Math.round(AUDIT.passChance * 100)}% chance`));
  assert.ok(a('a-audit-proof').includes(`every ${AUDIT.everyDays} days`) && a('a-audit-proof').includes(`about day ${TOTAL_DAYS - 4 * AUDIT.everyDays}`), 'five audits fit if the first comes by day 30');
  assert.equal(ACHIEVEMENTS.find((x) => x.id === 'a-audit-proof').goal.count, 5);
});

test('D6: "Open 8 districts beyond the one you started in": the engine counts the districts after the first, and the grand tour is all fifteen', () => {
  const g = fresh(); const pr = new Progress(g); let zones = 0; g.onEvent = (e) => { if (e.type === 'zone') zones++; pr.onEvent(e); };
  g.s.cash = 1e9; g._unlock();
  assert.equal(zones, ZONE_IDS.length - 1);
  assert.equal(ACHIEVEMENTS.find((x) => x.id === 'a-grand-tour').goal.count, zones);
  for (const id of ['a-cartographer', 'a-grand-tour']) assert.match(ACHIEVEMENTS.find((x) => x.id === id).desc, /beyond the one you started in\./);
  assert.ok(pr.m.a['a-cartographer'].done && pr.m.a['a-grand-tour'].done);
});

test('D6: an exit begins the exit achievement, whatever the kind', () => {
  assert.match(ACHIEVEMENTS.find((x) => x.id === 'a-exit').desc, /trade sale or IPO/);
  const g = fresh(); const pr = new Progress(g); g.onEvent = (e) => pr.onEvent(e); g.s.cash = 1e9; g._unlock(); g.s.dp = [1000]; assert.ok(g.exit('sale').ok);
  assert.ok(pr.m.a['a-exit'].done, 'it fires when the exit begins, 48 hours before it settles');
});

test('D6: the Goal card prints a goal in dollars as dollars, and the drawer and the card agree', () => {
  const ctx = fakeCtx({ days: 0 }); const g = ctx.g(); ctx.progress = new Progress(g);
  for (const q of QUESTS) ctx.progress.m.q[q.id] = { p: q.goal.count, done: true };
  for (const id of ['q14b', 'q15b']) {
    const def = QUESTS.find((x) => x.id === id); assert.ok(MONEY_SUMS.has(def.goal.sum));
    for (const q of QUESTS) if (q.zone >= def.zone && q.id !== id) { ctx.progress.m.q[q.id] = undefined; delete ctx.progress.m.q[q.id]; }
    for (const q of QUESTS) if (q.zone < def.zone || (q.zone === def.zone && q.id < id)) ctx.progress.m.q[q.id] = { p: q.goal.count, done: true };
    ctx.progress.m.q[id] = { p: 1234.5, done: false }; g.s.zones.push(...ZONE_IDS.filter((z) => !g.s.zones.includes(z)));
    ctx.U.tracker = null;
    const t = shown(trackerHTML(ctx));
    assert.ok(t.includes(`${ctx.money(1234.5)} / ${ctx.money(def.goal.count)}`), `${id}: ${t}`);
    const d = shown(quests.html(ctx)); assert.ok(d.includes(`${ctx.money(1234.5)} / ${ctx.money(def.goal.count)}`));
  }
  const plain = fakeCtx({ days: 0 }); plain.progress = new Progress(plain.g()); plain.progress.m.q.q01a = { p: 0, done: false };
  assert.match(shown(trackerHTML(plain)), /0 \/ 1/);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// D7. The voice and the length
function pages() {
  const out = [];
  for (const days of [0, 10, 25, 60]) {
    const ctx = fakeCtx({ days, perks: ['grad', 'pro'] }); ctx.progress = new Progress(ctx.g());
    for (const tab of ['crew', 'upgrades', 'clients']) { ctx.U.crew = { tab, hire: null }; out.push([`crew ${tab} d${days}`, crew.html(ctx), `crew-${tab}`, ctx.g().s.pipes.length]); }
    out.push([`bank d${days}`, bank.html(ctx), 'bank']);
    ctx.U.travel = { tab: 'path', sig: '' }; ctx.U.shipIds = []; out.push([`travel d${days}`, travel.html(ctx), 'travel']);
    out.push([`stock d${days}`, stock.html(ctx), 'stock']);
    for (const tab of ['buyers', 'lots', 'radar', 'exchange']) { ctx.U.marketTab = tab; out.push([`market ${tab} d${days}`, market.html(ctx), 'market-' + tab]); }
    out.push([`quests d${days}`, quests.html(ctx), 'quests']);
  }
  return out;
}
test('D7: nothing a player reads by default asks a question or exclaims', () => {
  for (const [name, html] of pages()) {
    const t = shown(html.replace(/<select[\s\S]*?<\/select>/g, ' ')); // the audit's list of managers is the managers' names
    assert.ok(!/[?!]/.test(t.replace(/[?]\s*<\/?[a-z]*>/g, '')), `${name}: ${t.match(/[^.]*[?!][^.]*/)?.[0]}`);
    assert.ok(!/[—–]/.test(html), `${name}: a dash`);
    assert.ok(!/\bzones?\b/i.test(t), `${name}: says zone`);
  }
});

test('D7: the drawers stay short', () => {
  const LIMIT = { travel: 340, 'market-buyers': 300, 'market-lots': 270, 'market-exchange': 130, stock: 300, bank: 400, quests: 560, 'crew-upgrades': 100, 'crew-clients': 380 }; // (a Radar owner's eight buyers carry the crowd counts the Academy's lessons read)
  const seen = {};
  for (const [name, html, kind, managers] of pages()) {
    const w = words(shown(html.replace(/<select[\s\S]*?<\/select>/g, ' ')));
    if (kind === 'crew-crew') assert.ok(w <= 90 + 75 * managers, `${name}: ${w} words for ${managers} managers`); // the page is its managers (the card is measured below)
    else seen[kind] = Math.max(seen[kind] || 0, w);
  }
  for (const [kind, limit] of Object.entries(LIMIT)) assert.ok((seen[kind] || 0) <= limit, `${kind}: ${seen[kind]} words (limit ${limit})`);
  // one manager card
  const ctx = fakeCtx({ days: 25, perks: ['grad', 'pro'] }); const card = crew.html(ctx).split('<article class="cr-card')[1];
  assert.ok(words(shown('<article class="cr-card' + card.split('</article>')[0])) <= 70, 'a manager card is a line of facts, not a paragraph');
  // a locked district is one line
  const t = fakeCtx({ days: 0 }); t.U.travel = { tab: 'path', sig: '' };
  const rows = travel.html(t).split('<li class="tv-d locked').slice(1).map((r) => shown('<li' + r.split('</li>')[0]));
  assert.ok(rows.length >= 10 && rows.every((r) => words(r) <= 8), rows[0]);
});
