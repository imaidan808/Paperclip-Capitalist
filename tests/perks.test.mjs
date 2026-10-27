// The twelve Backgrounds (docs/V2_DESIGN.md section 3): each one's strength AND its cost must take effect in the engine, with a before/after number.
// "Before" is the same game with no Background (or with the number equalised), "after" is the game with the one under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/engine.js';
import { PERKS, PERK_IDS, PERK_PAIRS, perkMods, MULT_KEYS, MAX_KEYS, ADD_KEYS, BOOL_KEYS, OBJ_KEYS } from '../js/data/perks.js';
import { BACKGROUND_IDS } from '../js/meta/ids.js';
import { ASSETS, BUYERS, ZONES, LOANS, AUDIT, EVENTS, ECON, SKILL_MAX } from '../js/config.js';
import { repairCostFor } from '../js/market.js';
import { makeGame, run } from './bot.mjs';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const rel = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b)), `${a} vs ${b}`);
const mk = (perks = [], seed = 1, extra = {}) => { const g = new Game({ perks, seed, handle: 'T', pid: 'T-' + seed, ...extra }); g.env.algo = false; return g; };
const rich = (g, cash) => { g.s.cash = cash; g.advanceTo(g.s.hour + 1); return g; };
const put = (g, cls, zone, o = {}) => { const a = g._mk(g.s, cls, { zone, basis: o.basis ?? 1, cond: o.cond }); g.s.assets.push(a); return a; };
const laneOf = (g, zone) => { const r = g.radar(zone, 1)[0]; return { cls: r.cls, buyer: r.seg }; };
const lead = (g, zone, seg, budget = 1e9, extra = {}) => { const l = { id: 'L' + g.s.nid++, zone, seg, budget, need: null, born: 0, exp: 9999, ...extra }; g.s.leads[zone].push(l); return l; };
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const bad = (x, path = 's') => { if (typeof x === 'number') return Number.isFinite(x) ? null : path; if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { const r = bad(v, path + '.' + k); if (r) return r; } return null; };
/** New buyers that turn up in a district over `hours` when the player takes every one at once. */
const arrivals = (perks, { zone = 1, hours = 400, seed = 3, cash = 0, skills = {} } = {}) => {
  const g = mk(perks, seed); Object.assign(g.s.skills, skills);
  if (cash) rich(g, cash);
  let n = 0;
  for (let h = 0; h < hours; h++) { g.advanceTo(g.s.hour + 1); n += g.s.leads[zone].length; g.s.leads[zone] = []; }
  return n;
};
/** The same lot, drawn in two worlds that differ only in the Background (same seed, same random stream). */
const lotPairs = (zone, perksA, perksB, worlds = 250, prep = () => {}) => {
  const out = [];
  for (let seed = 1; seed <= worlds; seed++) {
    const a = mk(perksA, seed), b = mk(perksB, seed);
    prep(a, b);
    a._openZone(zone); b._openZone(zone);
    a.s.lots[zone] = []; b.s.lots[zone] = [];
    a._spawnLot(zone); b._spawnLot(zone);
    out.push([a.s.lots[zone][0], b.s.lots[zone][0]]);
  }
  return out;
};
const leadPairs = (zone, perksA, perksB, worlds = 250, prep = () => {}) => {
  const out = [];
  for (let seed = 1; seed <= worlds; seed++) {
    const a = mk(perksA, seed), b = mk(perksB, seed);
    a._openZone(zone); b._openZone(zone);
    prep(a, b);
    a.s.leads[zone] = []; b.s.leads[zone] = [];
    a._spawnLead(zone); b._spawnLead(zone);
    out.push([a.s.leads[zone][0], b.s.leads[zone][0]]);
  }
  return out;
};

// ---------------------------------------------------------------------------------------------------- the table itself
test('twelve Backgrounds, each with a basis, a strength, a cost and mods; the ids match the meta content\'s list', () => {
  assert.equal(PERK_IDS.length, 12);
  assert.deepEqual([...PERK_IDS].sort(), [...BACKGROUND_IDS].sort());
  for (const [id, p] of Object.entries(PERKS)) {
    assert.equal(p.id, id);
    for (const k of ['name', 'icon', 'basis', 'strength', 'cost']) assert.ok(typeof p[k] === 'string' && p[k].trim(), `${id}.${k}`);
    assert.ok(p.mods && Object.keys(p.mods).length >= 2, id + ' has mods');
    for (const k of Object.keys(p.mods)) assert.ok([...MULT_KEYS, ...MAX_KEYS, ...ADD_KEYS, ...BOOL_KEYS, ...OBJ_KEYS].includes(k), `${id}.${k} is classified for aggregation`);
  }
  assert.equal(PERK_PAIRS.length, 66);
  assert.equal(new Set(PERK_PAIRS.map((p) => p.join())).size, 66);
  for (const [a, b] of PERK_PAIRS) assert.ok(PERK_IDS.indexOf(a) < PERK_IDS.indexOf(b));
});

test('perkMods: multipliers multiply, adders add, the largest threshold wins, booleans OR, objects come from the first Background that has one', () => {
  const none = perkMods([]);
  for (const k of MULT_KEYS) assert.equal(none[k], 1, k);
  for (const k of [...ADD_KEYS, ...MAX_KEYS]) assert.equal(none[k], 0, k);
  for (const k of BOOL_KEYS) assert.equal(none[k], false, k);
  for (const k of OBJ_KEYS) assert.equal(none[k], undefined, k);
  assert.deepEqual(perkMods(), none); assert.deepEqual(perkMods(['nope', 'also-not']), none, 'unknown ids are ignored');
  // multipliers
  rel(perkMods(['trades', 'pro']).repairMult, 0.5); rel(perkMods(['trades', 'pro']).pitchMult, 0.92);
  rel(perkMods(['pro', 'native']).digitalMult, 0.75 * 1.2, 1e-12);                     // -25% and +20% = -10%
  rel(perkMods(['veteran', 'creator']).trendMult, 0.8 * 1.3, 1e-12);
  rel(perkMods(['heir', 'pro']).xpMult, 0.8 * 0.85, 1e-12);
  rel(perkMods(['gigger', 'pro']).xpMult, 1.25 * 0.85, 1e-12);
  rel(perkMods(['veteran', 'roots']).overheadMult, 0.75 * 0.85, 1e-12);
  rel(perkMods(['roots', 'immigrant']).freightMult, 1.3 * 0.75, 1e-12);
  rel(perkMods(['pro', 'veteran']).managerCost, 1.1);
  rel(perkMods(['immigrant', 'second']).auditMult, 1.4); rel(perkMods(['second', 'heir']).fineMult, 1.5);
  rel(perkMods(['connected', 'connected']).leadMult, 1.4 * 1.4, 1e-12);                // the aggregator itself does not de-duplicate; Game does
  // adders
  assert.equal(perkMods(['grad', 'trades']).opsBonus, -1 + 2);
  rel(perkMods(['grad', 'heir']).spreadAdj, -0.15 + -0.25, 1e-12);
  assert.equal(perkMods(['grad', 'heir']).fintechBonus, 1);
  rel(perkMods(['veteran', 'immigrant']).freightSpeed, 0.15);
  // max
  assert.equal(perkMods(['immigrant', 'second']).bankMinNW, 10000); assert.equal(perkMods(['immigrant', 'gigger']).bankMinNW, 5000); assert.equal(perkMods(['gigger', 'second']).bankMinNW, 10000);
  assert.equal(perkMods(['pro', 'trades']).bankMinNW, 0);
  // booleans
  assert.equal(perkMods(['grad', 'pro']).radar, true); assert.equal(perkMods(['pro', 'trades']).radar, false);
  assert.equal(perkMods(['pro', 'second']).mentor, true); assert.equal(perkMods(['second', 'native']).fakeDetect, true);
  assert.equal(perkMods(['heir', 'native']).noSpecialty, true);
  // objects: copied, not shared with the table
  const m = perkMods(['grad', 'immigrant']);
  assert.deepEqual(m.garnish, { rate: 0.08, cap: 4000 }); assert.deepEqual(m.circle, { pct: 0.15 });
  m.garnish.cap = 1; m.circle.pct = 9;
  assert.equal(PERKS.grad.mods.garnish.cap, 4000); assert.equal(PERKS.immigrant.mods.circle.pct, 0.15);
  assert.deepEqual(perkMods(['connected']).familyTax, { rate: 0.06, everyHours: 168 });
});

test('a Game keeps at most two known, distinct Backgrounds and reads them through P (cached by the pair)', () => {
  assert.deepEqual(mk(['pro', 'pro', 'bogus', 'trades', 'heir']).s.perks, ['pro', 'trades']);
  assert.deepEqual(mk(['bogus']).s.perks, []);
  const g = mk(['trades', 'pro']);
  rel(g.P.repairMult, 0.5); assert.equal(g.P, g.P, 'cached');
  g.s.perks = ['veteran']; rel(g.P.overheadMult, 0.75); assert.equal(g.P.repairMult, 1, 'the cache follows the Backgrounds');
});

test('all 66 pairs construct and play five days without an error, a NaN, or a state that is not plain data', () => {
  assert.equal(PERK_PAIRS.length, 66);
  for (const pair of PERK_PAIRS) {
    const g = makeGame(pair, 'ops', 3);
    run(g, { days: 5 });
    assert.equal(g.s.hour, 5 * 24, pair + ' played five days');
    assert.equal(bad(g.s), null, `${pair}: ${bad(g.s)}`);
    for (const v of [g.netWorth(), g.s.cash, g.debt(), g.eei(), g.level(), g.invValue()]) assert.ok(Number.isFinite(v), `${pair}: ${v}`);
    assert.deepEqual(JSON.parse(JSON.stringify(g.s)), g.s);
    assert.deepEqual(g.s.perks, pair);
  }
});

// ---------------------------------------------------------------------------------------------------- Well-Connected
test('connected: buyers arrive about 40% faster and bring 25% bigger budgets; 6% of your cash goes to relatives every 7 days', () => {
  const before = arrivals([]), after = arrivals(['connected']);
  assert.ok(after / before > 1.3 && after / before < 1.6, `buyers in 400 hours: ${before} -> ${after}`);
  const ratios = leadPairs(5, [], ['connected']).map(([p, c]) => c.budget / p.budget);
  assert.ok(ratios.every((r) => r >= 1 - 1e-9 && r <= 1.251), 'never more than 25% bigger (give or take a cent)');
  near(median(ratios), 1.25, 0.002);
  assert.ok(ratios.reduce((a, b) => a + b, 0) / ratios.length > 1.2);
  // the cost
  const g = rich(mk(['connected']), 1000), plain = rich(mk([]), 1000);
  g.advanceTo(167); plain.advanceTo(167);
  assert.equal(g.s.cash, 1000, 'nothing is taken before the first week is out');
  g.advanceTo(168); plain.advanceTo(168);
  near(g.s.cash, 1000 * 0.94, 1e-9); assert.equal(plain.s.cash, 1000);
  assert.deepEqual(g.s.ledger.filter((e) => e.type === 'family').map((e) => [e.h, Math.round(e.amt * 100) / 100]), [[168, -60]]);
  g.advanceTo(336); near(g.s.cash, 1000 * 0.94 * 0.94, 1e-9);
  g.s.cash = 0; g.advanceTo(504); assert.equal(g.s.cash, 0, 'nobody taxes an empty pocket');
});

// ---------------------------------------------------------------------------------------------------- Business-School Grad
test('grad: Niche Radar and +1 Capital Sourcing, loan spreads 15% lower; costs -1 Ops and an 8% garnishment of every profit until $4,000 is repaid', () => {
  const g = mk(['grad']), plain = mk([]);
  assert.equal(g.P.radar, true); assert.equal(plain.P.radar, false);
  assert.equal(g.lvl('fintech'), plain.lvl('fintech') + 1);
  // loan spreads, with Capital Sourcing equalised so only the spread differs
  const eq = mk([]); eq.s.skills.fintech = 2;
  const spread = (x) => x.loanRate('micro') / (1 - 0.07 * (x.lvl('fintech') - 1)) - 0.025; // the rate net of the Capital Sourcing discount
  rel(spread(g) / spread(eq), 0.85, 1e-12);
  // the cost: -1 Ops, which is a 2.38x dearer repair (0.42 per level)
  assert.equal(g.lvl('ops'), plain.lvl('ops') - 1);
  rel(repairCostFor(ASSETS.bike.repair, g.lvl('ops')) / repairCostFor(ASSETS.bike.repair, plain.lvl('ops')), 1 / 0.42, 1e-12);
  // the garnishment
  g.s.cash = 0;
  assert.equal(g.garnish(1000), 80); assert.equal(g.s.cash, -80);
  assert.equal(g.garnish(-500), 0, 'no garnishment on a loss'); assert.equal(g.garnish(0), 0);
  let total = 80, safety = 0;
  while (g.s.ps.garnished < 4000 && safety++ < 1000) total += g.garnish(5000);
  near(g.s.ps.garnished, 4000, 1e-9); near(total, 4000, 1e-9);
  assert.equal(g.garnish(5000), 0, 'paid off: garnishment stops at $4,000');
  const rows = g.s.ledger.filter((e) => e.type === 'garnish'); near(rows.reduce((a, e) => a - e.amt, 0), 4000, 1e-9);
  // the last instalment is cut to what is left
  const h = mk(['grad']); h.s.ps.garnished = 3990; near(h.garnish(1000), 10, 1e-9);
  assert.equal(plain.garnish(1000), 0, 'other Backgrounds have no student loans');
});

// ---------------------------------------------------------------------------------------------------- Licensed Tradesperson
test('trades: +2 Ops, repairs cost half, broken goods are 20% cheaper to source; costs 8% on every pitch price and makes haggling harder', () => {
  const g = mk(['trades']), plain = mk([]);
  assert.equal(g.lvl('ops'), plain.lvl('ops') + 2);
  // repair: equalise Ops so the whole difference is the 50%
  const eq = mk([]); eq.s.skills.ops = g.lvl('ops');
  const cost = (x, zone = 1) => { const a = put(x, 'bike', zone, { cond: 'broken' }); return x.repairQuote(a.id).cost; };
  rel(cost(g) / cost(eq), 0.5, 1e-12);
  near(cost(g), repairCostFor(ASSETS.bike.repair, 5, 0.5), 1e-9);
  // sourcing broken lots, same world, same lot
  const pairs = lotPairs(3, [], ['trades'], 250, (a, b) => { b.s.skills.ops = 1; }).filter(([p, t]) => p.cls === t.cls && p.cond === t.cond);
  assert.ok(pairs.length > 200);
  const broken = pairs.filter(([p]) => p.cond === 'broken' && p.price >= 5), ok = pairs.filter(([p]) => p.cond === 'ok' && p.price >= 5);
  assert.ok(broken.length > 20 && ok.length > 20);
  for (const [p, t] of broken) assert.ok(Math.abs(t.price / p.price - 0.8) < 0.01, `${p.cls}: ${p.price} -> ${t.price}`);
  for (const [p, t] of ok) assert.ok(Math.abs(t.price / p.price - 1) < 0.01, 'sound goods cost the same');
  // the cost: pitch prices -8%, haggling is harder
  const sell = (x) => { const a = put(x, 'textbooks', 5); const l = lead(x, 5, 'trainer'); return x.quotePitch(a.id, l.id).price; };
  const t5 = rich(mk(['trades']), 3000), p5 = rich(mk([]), 3000);
  rel(sell(t5) / sell(p5), 0.92, 1e-12);
  assert.equal(g.P.haggleHandicap, 1); assert.equal(plain.P.haggleHandicap, 0);
});

// ---------------------------------------------------------------------------------------------------- Immigrant Hustler
test('immigrant: a zero-interest Community Circle loan, intl lanes +15 points, freight 25% cheaper; costs: no bank until $5,000 and audits 1.4x as often', () => {
  // the Circle: up to 15% of net worth, no fee, no interest, no bank needed
  const g = mk(['immigrant']); g.s.cash = 100; const nw = g.netWorth();
  assert.equal(g.loanBlock('circle'), ''); assert.match(mk([]).loanBlock('circle'), /not part of a Community Circle/);
  assert.equal(g.loanBlock('micro') !== '', true, 'the Bank is still shut at this size');
  near(g.loanRoom('circle').limit, 0.15 * nw, 1e-9);
  const cash0 = g.s.cash, d = g.draw('circle', 1e9);
  assert.ok(d.ok, d.msg); near(g.s.cash - cash0, 0.15 * nw, 1e-9); // no fee
  assert.equal(g.loanRate('circle'), 0); assert.ok(g.loanRate('micro') > 0.1);
  const loan = g.s.loans[0], principal = loan.principal;
  g.advanceTo(24 * 60);
  assert.equal(loan.principal, principal); assert.equal(loan.accr, 0, 'two months and not a cent of interest');
  assert.equal(mk([]).draw('circle', 10).ok, false);
  // intl lanes and freight
  const a = rich(mk(['immigrant']), 6000), b = rich(mk([]), 6000);
  const lane = laneOf(a, 5);
  const pipe = (x) => x.hirePipeline('broker', 5, { ...lane, channel: 'intl' }).pipe;
  rel(a.forecast(pipe(a)).margin / b.forecast(pipe(b)).margin, (1.3 + 0.15) / 1.3, 1e-12);
  const dom = (x) => x.forecast({ ...x.s.pipes[0], channel: 'dom' }).margin;
  rel(dom(a), dom(b), 1e-12);
  const ship = (x) => { const k = put(x, 'bike', 5); return x.freightQuote([k.id], 6).cost; };
  rel(ship(a) / ship(b), 0.75, 1e-12);
  // the cost: the Bank
  const poor = rich(mk(['immigrant']), 1000), same = rich(mk([]), 1000);
  assert.match(poor.loanBlock('micro'), /\$5,000/); assert.equal(same.loanBlock('micro'), '');
  assert.equal(poor.draw('micro', 500).ok, false);
  poor.s.cash = 4990; assert.notEqual(poor.loanBlock('micro'), '');
  poor.s.cash = 5000; assert.equal(poor.loanBlock('micro'), ''); assert.ok(poor.draw('micro', 500).ok);
  // the cost: audits come 1.4x as often
  const gap = (perks) => { const x = rich(mk(perks), 30000); assert.ok(x.s.auditPending); const h = x.s.hour; x.resolveAudit('A'); return x.s.auditNext - h; };
  near(gap(['immigrant']), 360 / 1.4, 1e-9); assert.equal(gap([]), 360);
});

// ---------------------------------------------------------------------------------------------------- Veteran
test('veteran: overhead -25%, shocks hit 40% softer, freight 15% faster; costs trend goods selling 20% lower', () => {
  const v = rich(mk(['veteran']), 6000), p = rich(mk([]), 6000);
  const lane = laneOf(v, 5);
  const overhead = (x) => x.forecast(x.hirePipeline('broker', 5, lane).pipe).overhead;
  rel(overhead(v) / overhead(p), 0.75, 1e-12);
  // shocks: the TikTok surge 5x -> 1 + 4 x 0.6 = 3.4x; the Fed's +600 bps -> +360, fees 9.5% -> 5.7%, overhead x1.2 -> x1.12
  const surge = (x) => { x.advanceTo((EVENTS.tiktok.day - 1) * 24 + 2); return x.mods().demand.find((e) => e.tags.includes('trend')).mult; };
  rel(surge(mk(['veteran'])), 3.4, 1e-12); rel(surge(mk([])), 5, 1e-12);
  const fed = (x) => { x.advanceTo((EVENTS.fed.day - 1) * 24 + 2); return x.mods(); };
  const fv = fed(mk(['veteran'])), fp = fed(mk([]));
  near(fp.rateBps, 600, 1e-9); near(fv.rateBps, 360, 1e-9);
  near(fp.fee, 0.095, 1e-12); near(fv.fee, 0.057, 1e-12);
  near(fp.overhead, 1.2, 1e-12); near(fv.overhead, 1.12, 1e-12);
  const tariff = (x) => { x.injectEvent('tariff', 0, { id: 't' }); x.advanceTo(2); return x.mods(); };
  near(tariff(mk([])).repair, 1.45, 1e-12); near(tariff(mk(['veteran'])).repair, 1.27, 1e-12);
  near(tariff(mk([])).intlSlow, 96, 1e-9); near(tariff(mk(['veteran'])).intlSlow, 57.6, 1e-9);
  // freight is faster: 6 hours become 5, a long haul 8 become 7
  const run1 = (x, to) => { const k = put(x, 'bike', 5); return x.freightQuote([k.id], to).hours; };
  const v9 = rich(mk(['veteran']), 30000), p9 = rich(mk([]), 30000);
  assert.equal(run1(p, 6) - run1(v, 6), 1); assert.equal(run1(p9, 9) - run1(v9, 9), 1);
  // the cost
  const sneak = (x) => x.val({ cls: 'sneakers', cond: 'ok', quality: 1, wear: 1, zone: 5 }, 5);
  rel(sneak(v) / sneak(p), 0.8, 1e-12);
  const book = (x) => x.val({ cls: 'textbooks', cond: 'ok', quality: 1, wear: 1, zone: 5 }, 5);
  rel(book(v), book(p), 1e-12);
});

// ---------------------------------------------------------------------------------------------------- Legacy Heir
test('heir: the family clears 60% of the debt once; costs: no skill edge, 20% slower learning', () => {
  const setup = (perks) => { const g = rich(mk(perks), 3000); g.s.loans.push({ id: 'DX', prod: 'micro', principal: 1_000_000, accr: 0, last: 0, next: 99999, drawn: 0 }); return g; };
  const g = setup(['heir']); const seen = [];
  g.onEvent = (e) => seen.push(e);
  g._marginCall();
  assert.deepEqual(seen.filter((e) => e.type === 'perk'), [{ type: 'perk', day: 1, id: 'heir', effect: 'bailout' }]);
  assert.equal(g.s.ps.bailout, 0);
  const afterFirst = g.s.loans[0].principal;
  assert.ok(afterFirst <= 400_000 && afterFirst > 380_000, 'about 40% is left: ' + afterFirst);
  assert.ok(seen.some((e) => e.type === 'margin-call'), 'the call itself is announced');
  put(g, 'bike', 5); g.s.cash = 0; const before = g.s.loans[0].principal;
  g._marginCall();
  assert.equal(seen.filter((e) => e.type === 'perk').length, 1, 'once per run');
  assert.ok(g.s.loans[0].principal > before * 0.9, 'the second call is the bank\'s, not the family\'s: ' + before + ' -> ' + g.s.loans[0].principal);
  const plain = setup([]); plain._marginCall();
  assert.ok(plain.s.loans[0].principal > 990_000, 'without a family nothing clears the debt');
  // the cost
  const h = mk(['heir'], 1, { specialty: 'ops' });
  assert.deepEqual(h.s.skills, { ops: 1, growth: 1, fintech: 1 }); assert.equal(h.s.specialty, null);
  assert.equal(mk([], 1, { specialty: 'ops' }).s.skills.ops, 3);
  h.xp(100); assert.equal(h.s.xp, 80);
});

test('heir: loan spreads 25% lower; the first audit fine is waived, the second is not', () => {
  const h = mk(['heir']), p = mk([]);
  rel((h.loanRate('pipeline') - 0.025) / (p.loanRate('pipeline') - 0.025), 0.75, 1e-12);
  const g = rich(mk(['heir']), 30000); const seen = [];
  g.onEvent = (e) => seen.push(e);
  assert.ok(g.s.auditPending);
  g.advanceTo(74); // ignored: due at 73
  assert.equal(g.s.auditFail, 1); assert.equal(g.s.cash, 30000, 'no fine'); near(g.s.velPenalty, 0.85, 1e-12);
  assert.deepEqual(seen.filter((e) => e.type === 'perk').map((e) => e.effect), ['fine-waived']);
  g.advanceTo(433 + 72 + 1);
  assert.equal(g.s.auditFail, 2); near(g.s.cash, 30000 - 7500, 1e-9);
  assert.equal(seen.filter((e) => e.type === 'perk').length, 1);
});

// ---------------------------------------------------------------------------------------------------- Creator
test('creator: trend goods +30% and trend buyers for anything you hold; costs whiplash on other goods and goodwill after a failed pitch', () => {
  const c = mk(['creator']), p = mk([]);
  const val = (x, cls, zone = 5) => x.val({ cls, cond: 'ok', quality: 1, wear: 1, zone }, zone);
  rel(val(c, 'sneakers') / val(p, 'sneakers'), 1.3, 1e-9);
  // trend buyers turn up for whatever you hold
  const share = (perks) => {
    let trend = 0, n = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const g = mk(perks, seed); g._openZone(5); put(g, 'textbooks', 5);
      for (let i = 0; i < 40; i++) { g.s.leads[5] = []; g._spawnLead(5); const l = g.s.leads[5][0]; n++; if ((BUYERS[l.seg].like.trend || 0) >= 0.5) trend++; }
    }
    return trend / n;
  };
  const sp = share([]), sc = share(['creator']);
  assert.ok(sc - sp > 0.05, `buyers who like trends: ${sp.toFixed(3)} -> ${sc.toFixed(3)}`);
  // the cost, part 1: non-trend demand swings up to +-15%, in 3-day steps; trend goods do not
  const day = (x, d) => { x.s.hour = (d - 1) * 24; x._m = null; };
  const pen = (x, d) => { day(x, d); return val(x, 'pen', 1); };
  const ratios = Array.from({ length: 12 }, (_, i) => pen(c, 1 + 3 * i) / pen(p, 1 + 3 * i));
  assert.ok(Math.max(...ratios) / Math.min(...ratios) > 1.1, 'the swings are real: ' + ratios.map((r) => r.toFixed(2)).join(' '));
  for (const r of ratios) assert.ok(r > 0.8 && r < 1.2, 'but bounded: ' + r);
  assert.equal(pen(c, 6), pen(c, 7)); assert.equal(pen(c, 6), pen(c, 8), 'one level for three days'); assert.notEqual(pen(c, 8), pen(c, 9), 'and a new one on the fourth');
  const tr = Array.from({ length: 12 }, (_, i) => { day(c, 1 + 3 * i); day(p, 1 + 3 * i); return val(c, 'sneakers') / val(p, 'sneakers'); });
  for (const r of tr) rel(r, 1.3, 1e-9);
  // the cost, part 2: a failed pitch costs 8 more reputation and halves the flow of buyers for two days
  const fail = (perks) => {
    const g = rich(mk(perks), 3000); g.s.assets = [];
    const a = put(g, 'textbooks', 5); a.truth = { q: 1, fake: true, defects: [] }; a.known = false;
    const l = lead(g, 5, 'trainer'); const rep = g.s.rep;
    g.pitch(a.id, l.id);
    return { lost: rep - g.s.rep, until: g.s.ps.goodwillUntil, hour: g.s.hour, g };
  };
  const fc = fail(['creator']), fp = fail([]);
  assert.equal(fp.lost, 3); assert.equal(fc.lost, 3 + 8);
  assert.equal(fc.until, fc.hour + 48); assert.equal(fp.until, 0);
  const flow = (f) => { let n = 0; for (let h = 0; h < 48; h++) { f.g.advanceTo(f.g.s.hour + 1); n += f.g.s.leads[5].length; f.g.s.leads[5] = []; } return n; };
  const before = flow(fp), after = flow(fc);
  assert.ok(after < before * 0.75, `buyers in the 48 hours after a failed pitch: ${before} -> ${after}`);
});

// ---------------------------------------------------------------------------------------------------- Side-Hustler
test('gigger: small lots 8% cheaper, +25% XP, pipeline cycles 10% shorter; costs: no bank until $2,500 and a burnout day every 20 days', () => {
  // small lots (worth under 60% of the district's scale) only
  const pairs = lotPairs(3, [], ['gigger']).filter(([p, g]) => p.cls === g.cls && p.cond === g.cond);
  const small = pairs.filter(([p]) => p.price >= 3 && p.price < 11), big = pairs.filter(([p]) => p.price > 17);
  assert.ok(small.length > 20 && big.length > 20, `${small.length} small, ${big.length} big`);
  for (const [p, g] of small) assert.ok(Math.abs(g.price / p.price - 0.92) < 0.012, `${p.cls}: ${p.price} -> ${g.price}`);
  for (const [p, g] of big) assert.ok(Math.abs(g.price / p.price - 1) < 0.002, `${p.cls}: ${p.price} -> ${g.price}`);
  const xp = (perks) => { const g = mk(perks); g.xp(100); return g.s.xp; };
  assert.equal(xp(['gigger']), 125); assert.equal(xp([]), 100);
  // cycles
  const cyc = (perks) => { const g = rich(mk(perks), 3000); const lane = { cls: 'textbooks', buyer: 'trainer' }; return g.cycleLen(g.hirePipeline('broker', 5, lane).pipe); };
  const long = cyc([]), short = cyc(['gigger']);
  assert.ok(long >= 30 && short / long > 0.88 && short / long < 0.95, `cycle ${long}h -> ${short}h`);
  // the Bank
  const g = rich(mk(['gigger']), 1000); g.s.cash = 2400;
  assert.match(g.loanBlock('micro'), /\$2,500/); g.s.cash = 2500; assert.equal(g.loanBlock('micro'), '');
  assert.equal(rich(mk([]), 1000).loanBlock('micro'), '');
  // burnout: every 20 days (day 20, 40, 60, 80) no new buyers come for a day
  const b = mk(['gigger']), q = mk([]);
  const watch = (x, from, to) => { let n = 0; for (let h = x.s.hour; h < to; h++) { x.advanceTo(h + 1); if (h + 1 > from) n += x.s.leads[1].length; x.s.leads[1] = []; } return n; };
  watch(b, 0, 455); watch(q, 0, 455);
  const noteCount = () => b.s.news.filter((n) => /Burnout/.test(n.text)).length;
  assert.equal(noteCount(), 0, 'not on day 19');
  assert.equal(b.burnedOut(), false);
  b.advanceTo(456); q.advanceTo(456); b.s.leads[1] = []; q.s.leads[1] = [];
  assert.equal(b.burnedOut(), true); assert.equal(b.s.ps.burnoutUntil, 480); assert.equal(noteCount(), 1);
  const dark = watch(b, 456, 479), normal = watch(q, 456, 479);
  assert.equal(dark, 0, 'a whole day without buyers'); assert.ok(normal >= 5, 'while everyone else had ' + normal);
  b.advanceTo(480); assert.equal(b.burnedOut(), false);
  assert.ok(watch(b, 480, 520) > 5, 'back to work');
  b.advanceTo(936); assert.equal(b.burnedOut(), true, 'and again on day 40');
});

// ---------------------------------------------------------------------------------------------------- Small-Town Roots
test('roots: loyal buyers return with 20% bigger budgets, overhead -15%; costs: 30% fewer buyers beyond district 8 and freight 30% dearer', () => {
  const ratios = leadPairs(5, [], ['roots'], 250, (a, b) => { for (const g of [a, b]) for (const id of Object.keys(BUYERS)) g.s.loyal[id] = 3; })
    .map(([p, r]) => r.budget / p.budget);
  assert.ok(ratios.every((x) => x >= 1 - 1e-9 && x <= 1.201), 'at most 20% bigger (give or take a cent)');
  near(median(ratios), 1.2, 0.002);
  const half = leadPairs(5, [], ['roots'], 120, (a, b) => { for (const g of [a, b]) for (const id of Object.keys(BUYERS)) g.s.loyal[id] = 1; }).map(([p, r]) => r.budget / p.budget);
  assert.ok(median(half) > 1.06 && median(half) < 1.07, 'loyalty builds with repeat business: ' + median(half));
  const r5 = rich(mk(['roots']), 6000), p5 = rich(mk([]), 6000), lane = laneOf(r5, 5);
  const overhead = (x) => x.forecast(x.hirePipeline('broker', 5, lane).pipe).overhead;
  rel(overhead(r5) / overhead(p5), 0.85, 1e-12);
  // the small pond: fewer buyers beyond district 8, the same in the home districts
  const a9 = arrivals(['roots'], { zone: 9, cash: 30000 }), b9 = arrivals([], { zone: 9, cash: 30000 });
  assert.ok(a9 / b9 > 0.65 && a9 / b9 < 0.85, `district 9 buyers in 400 hours: ${b9} -> ${a9}`);
  assert.equal(arrivals(['roots'], { zone: 5, cash: 3000 }), arrivals([], { zone: 5, cash: 3000 }), 'district 5 is home');
  const ship = (x) => { const k = put(x, 'bike', 5); return x.freightQuote([k.id], 6).cost; };
  rel(ship(r5) / ship(p5), 1.3, 1e-12);
});

// ---------------------------------------------------------------------------------------------------- Digital Native
test('native: digital goods +20%, digital buyers in any district, lots refresh faster; costs: 18% scam buyers and a 1.5% monthly subscription', () => {
  const val = (x, cls) => x.val({ cls, cond: 'ok', quality: 1, wear: 1, zone: 10 }, 10);
  const n = mk(['native']), p = mk([]);
  rel(val(n, 'saas') / val(p, 'saas'), 1.2, 1e-12); rel(val(n, 'fleet'), val(p, 'fleet'), 1e-12);
  // digital buyers from elsewhere turn up in a district that has none of its own
  const foreign = (perks) => { let f = 0, t = 0; for (let seed = 1; seed <= 40; seed++) { const g = mk(perks, seed); g._openZone(5); for (let i = 0; i < 30; i++) { g.s.leads[5] = []; g._spawnLead(5); t++; if (BUYERS[g.s.leads[5][0].seg].zone !== 5) f++; } } return f / t; };
  assert.equal(foreign([]), 0); assert.ok(foreign(['native']) > 0.15, 'about a quarter: ' + foreign(['native']));
  // lots refresh 25% faster (district 1: every 6 hours becomes every 5)
  const lots = (perks) => { const g = mk(perks, 3); let k = 0; for (let h = 0; h < 600; h++) { g.advanceTo(g.s.hour + 1); k += g.s.lots[1].length; g.s.lots[1] = []; } return k; };
  const lp = lots([]), ln = lots(['native']);
  assert.ok(ln / lp > 1.15 && ln / lp < 1.3, `lots in 600 hours: ${lp} -> ${ln}`);
  // the subscription: 1.5% of your cash on day 30
  const s = rich(mk(['native']), 1000), q = rich(mk([]), 1000);
  s.advanceTo(719); q.advanceTo(719); assert.equal(s.s.cash, 1000);
  s.advanceTo(720); q.advanceTo(720);
  near(s.s.cash, 985, 1e-9); assert.equal(q.s.cash, 1000);
  assert.ok(s.s.ledger.some((e) => e.type === 'subscription'));
  // the scam magnet, and the check that costs 1% (the rest of the mechanics is in engine-v2.test.mjs)
  assert.equal(n.P.scamRate, 0.18); assert.equal(p.P.scamRate, 0);
  assert.equal(n.P.digitalBuyers, true);
});

// ---------------------------------------------------------------------------------------------------- Second-Chance Hustler
test('second: counterfeits come flagged, 12% cheaper lots in gray-market districts; costs: no bank until $10,000 and audit fines 1.5x', () => {
  let flagged = 0, fakes = 0, honestWarned = 0;
  for (const [lotP, lotS] of lotPairs(4, [], ['second'], 300)) {
    assert.equal(lotP.truth.fake, lotS.truth.fake, 'the same world');
    assert.equal('warn' in lotP, false);
    if (lotS.truth.fake) { fakes++; if (lotS.warn === true) flagged++; } else if (lotS.warn) honestWarned++;
  }
  assert.ok(fakes > 20); assert.equal(flagged, fakes, 'every counterfeit is flagged'); assert.equal(honestWarned, 0, 'and no honest lot is');
  // gray markets: district 4 and 16 take 12% off; district 3 does not
  const ratio = (zone) => lotPairs(zone, [], ['second'], 150).filter(([p, s]) => p.cls === s.cls && p.price >= 5).map(([p, s]) => s.price / p.price);
  const gray = ratio(4), plain = ratio(3);
  assert.ok(gray.length > 50 && plain.length > 50);
  for (const r of gray) assert.ok(Math.abs(r - 0.88) < 0.012, 'gray market: ' + r);
  for (const r of plain) assert.ok(Math.abs(r - 1) < 0.003, 'ordinary market: ' + r);
  assert.equal(ZONES[4].rules.gray, true); assert.equal(ZONES[16].rules.gray, true); assert.equal(ZONES[3].rules.gray, undefined);
  assert.equal(mk(['second']).P.probeBonus, 1); assert.equal(mk([]).P.probeBonus, 0);
  // the Bank
  const g = rich(mk(['second']), 1000); g.s.cash = 9990;
  assert.match(g.loanBlock('micro'), /\$10,000/); g.s.cash = 10000; assert.equal(g.loanBlock('micro'), '');
  // audit fines
  const f = (perks) => { const x = rich(mk(perks), 30000); x.advanceTo(74); return 30000 - x.s.cash; };
  assert.equal(f([]), AUDIT.fine); assert.equal(f(['second']), AUDIT.fine * 1.5);
  rel(rich(mk(['second']), 30000).auditFine(), 7500);
});

// ---------------------------------------------------------------------------------------------------- Seasoned Pro
test('pro: appraisal sense, a mentor tip each week, steady hands in haggling; costs: digital goods -25%, 15% slower learning, managers cost 10% more', () => {
  const g = mk(['pro']), p = mk([]);
  assert.equal(g.P.inspectBonus, 2); assert.equal(p.P.inspectBonus, 0);
  assert.equal(g.P.haggleAssist, 1); assert.equal(p.P.haggleAssist, 0);
  // the weekly mentor: a note on day 7, 14, 21, 28
  const tips = (x) => x.s.news.filter((n) => /Your mentor says/.test(n.text));
  g.advanceTo(143); p.advanceTo(143); assert.equal(tips(g).length, 0);
  g.advanceTo(144); p.advanceTo(144);
  assert.equal(tips(g).length, 1); assert.equal(tips(p).length, 0);
  g.advanceTo(672); p.advanceTo(672);
  assert.equal(tips(g).length, 4, 'days 7, 14, 21 and 28'); assert.equal(tips(p).length, 0);
  assert.deepEqual(tips(g).map((n) => n.h).reverse(), [144, 312, 480, 648]);
  assert.match(tips(g)[0].text, /look at .* for .* in /);
  // the costs
  const val = (x, cls) => x.val({ cls, cond: 'ok', quality: 1, wear: 1, zone: 10 }, 10);
  rel(val(g, 'saas') / val(p, 'saas'), 0.75, 1e-12); rel(val(g, 'fleet'), val(p, 'fleet'), 1e-12);
  g.xp(100); assert.equal(g.s.xp, 85);
  const a = rich(mk(['pro']), 6000), b = rich(mk([]), 6000);
  rel(a.pipeCost('broker', 5) / b.pipeCost('broker', 5), 1.1, 1e-12);
  const pa = a.hirePipeline('broker', 5, laneOf(a, 5)).pipe, pb = b.hirePipeline('broker', 5, laneOf(b, 5)).pipe;
  rel(a.pipeUpCost(pa) / b.pipeUpCost(pb), 1.1, 1e-12);
});

// ---------------------------------------------------------------------------------------------------- balance sanity
test('no Background is strictly better: each one\'s cost shows up in the numbers a player sees', () => {
  // every Background has at least one entry in its mods that hurts (a multiplier that makes things worse, a cost object, a threshold or a penalty)
  const hurts = {
    connected: (m) => !!m.familyTax, grad: (m) => !!m.garnish && m.opsBonus < 0, trades: (m) => m.pitchMult < 1 && m.haggleHandicap > 0, immigrant: (m) => m.bankMinNW > 0 && m.auditMult > 1,
    veteran: (m) => m.trendMult < 1, heir: (m) => m.xpMult < 1 && m.noSpecialty, creator: (m) => m.volatility > 0 && m.flopRep > 0, gigger: (m) => m.bankMinNW > 0 && !!m.burnout,
    roots: (m) => m.farLeadMult < 1 && m.freightMult > 1, native: (m) => m.scamRate > 0 && !!m.subscription, second: (m) => m.bankMinNW > 0 && m.fineMult > 1, pro: (m) => m.digitalMult < 1 && m.xpMult < 1 && m.managerCost > 1,
  };
  for (const id of PERK_IDS) assert.ok(hurts[id](perkMods([id])), id + ' has a cost');
  // and a strength
  const helps = {
    connected: (m) => m.leadMult > 1 && m.leadBudget > 1, grad: (m) => m.radar && m.fintechBonus > 0, trades: (m) => m.opsBonus > 0 && m.repairMult < 1, immigrant: (m) => !!m.circle && m.freightMult < 1,
    veteran: (m) => m.overheadMult < 1 && m.shockSoften > 0, heir: (m) => !!m.bailout && m.spreadAdj < 0, creator: (m) => m.trendMult > 1, gigger: (m) => m.lotDiscount > 0 && m.cycleMult < 1,
    roots: (m) => m.loyalty > 0 && m.overheadMult < 1, native: (m) => m.digitalMult > 1 && m.lotRefresh > 0, second: (m) => m.fakeDetect && m.lotDiscountGray > 0, pro: (m) => m.mentor && m.inspectBonus > 0,
  };
  for (const id of PERK_IDS) assert.ok(helps[id](perkMods([id])), id + ' has a strength');
  assert.equal(SKILL_MAX, 8); assert.ok(ECON.margin > 0 && LOANS.circle.hidden === true);
});
