// The v2 rules, one by one (docs/V2_DESIGN.md sections 3, 4, 4.1, 7, 7.1): districts that unlock by net worth, their bonuses and signature rules, hidden lot truth,
// bounded deal results, the event contract, skill points, scams, determinism and pacing.
// Tests named "BUG:" assert the correct behaviour and FAIL against the current engine; each is listed in the report for the engine owner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/engine.js';
import { seasonMult, truthMult, FAKE_VALUE, assetFMV, demandOf, clamp } from '../js/market.js';
import {
  ASSETS, BUYERS, ZONES, ZONE_IDS, MIL, MIL_ZONE, ECON, SKILL_MAX, SKILLS, PERKS, PIPE, UPGRADES, LOANS, CLIENTS, AUDIT, FEES, FRESH, TOTAL_DAYS,
} from '../js/config.js';
import { UNLOCK_RULES } from '../js/data/schema.js';
import { EVENT_TYPES, EVENT_PAYLOAD } from '../js/meta/ids.js';
import { Cohort } from '../js/cohort.js';
import { makeGame, run } from './bot.mjs';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const rel = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b)), `${a} vs ${b}`);
const mk = (perks = [], seed = 1, extra = {}) => { const g = new Game({ perks, seed, handle: 'T', pid: 'T-' + seed, ...extra }); g.env.algo = false; return g; };
const rich = (g, cash) => { g.s.cash = cash; g.advanceTo(g.s.hour + 1); return g; };
const log = (g) => { const out = []; g.onEvent = (e) => out.push(e); return out; };
const laneOf = (g, zone) => { const r = g.radar(zone, 1)[0]; return { cls: r.cls, buyer: r.seg }; };
const putAsset = (g, cls, zone, o = {}) => { const a = g._mk(g.s, cls, { zone, basis: o.basis ?? 1, cond: o.cond }); if (o.truth) { a.truth = o.truth; a.known = false; } g.s.assets.push(a); return a; };
/** Lots as the market makes them when a district opens, over many worlds. */
const lotsIn = (zone, worlds, perks = [], per = 5) => {
  const out = [];
  for (let seed = 1; seed <= worlds; seed++) {
    const g = mk(perks, seed); if (zone > 1) g._openZone(zone);
    for (let k = 0; k < per; k++) { g.s.lots[zone] = []; g._spawnLot(zone); out.push(...g.s.lots[zone]); }
  }
  return out;
};
const sd = (p, n) => Math.sqrt(p * (1 - p) * n);
/** Content is found by its properties, so retuning the data does not break the rule tests. */
const find = (what, pred) => { const id = Object.keys(ASSETS).find((c) => pred(ASSETS[c], c)); assert.ok(id, 'the content has ' + what); return id; };
const SEASONAL = find('a seasonal goods in district 3', (a) => demandOf(a, 3) >= 6 && a.tags.some((t) => ZONES[3].rules.season.tags.includes(t)) && !a.tags.includes('trend'));
const PERISHABLES = Object.keys(ASSETS).filter((c) => ASSETS[c].perish);
const ROYALTY = find('a royalty asset for district 12', (a, c) => a.yield && demandOf(a, 12) >= 6 && !a.tags.includes('realty'));
const RENTAL = find('a rental property for district 15', (a) => a.yield && a.tags.includes('realty') && demandOf(a, 15) >= 6);
const DIGITAL10 = find('a digital good in district 10', (a) => a.tags.includes('digital') && demandOf(a, 10) >= 6);
const PLAIN10 = find('a non-digital good in district 10', (a) => !a.tags.includes('digital') && demandOf(a, 10) >= 3 && demandOf(a, 9) >= 3);

// ---------------------------------------------------------------------------------------------------- levels, XP and skill points
test('XP makes levels (100 x (level - 1)^2) and every level grants exactly one skill point, even when one award crosses several', () => {
  const g = mk(); const ev = log(g);
  assert.equal(g.level(), 1); assert.equal(g.s.points, 0);
  g.xp(99); assert.equal(g.level(), 1); assert.equal(g.s.points, 0);
  g.xp(1); assert.equal(g.level(), 2); assert.equal(g.s.points, 1);
  g.xp(2300); // 2,400 in all: level 5 (1,600 <= xp < 2,500)
  assert.equal(g.level(), 5); assert.equal(g.s.points, 4); assert.equal(g.s.lvlPaid, 5);
  assert.deepEqual(ev.filter((e) => e.type === 'level').map((e) => e.level), [2, 3, 4, 5]);
  g.xp(50); assert.equal(g.s.points, 4, 'no level, no point');
});

test('XP multipliers: Side-Hustler +25%, Heir -20%, Seasoned Pro -15%, and they multiply', () => {
  const xp = (perks) => { const g = mk(perks); g.xp(100); return g.s.xp; };
  assert.equal(xp([]), 100); assert.equal(xp(['gigger']), 125); assert.equal(xp(['heir']), 80); assert.equal(xp(['pro']), 85);
  assert.equal(xp(['gigger', 'pro']), Math.round(100 * 1.25 * 0.85));
  assert.equal(xp(['heir', 'pro']), Math.round(100 * 0.8 * 0.85));
  const slow = mk(['heir', 'pro']), fast = mk(['gigger']);
  slow.xp(900); fast.xp(900);
  assert.ok(fast.level() > slow.level(), 'the same play levels a Side-Hustler faster');
});

test('spendPoint: costs one point, raises one skill by one, pays 10 XP, emits "skill", and stops at SKILL_MAX', () => {
  const g = mk(); const ev = log(g);
  assert.equal(SKILL_MAX, 8);
  assert.equal(g.spendPoint('ops').ok, false, 'no points, no skill'); assert.match(g.spendPoint('ops').msg, /No skill points/);
  assert.equal(g.s.skills.ops, 3, 'a specialty starts at level 3');
  g.s.points = 2;
  const r = g.spendPoint('growth');
  assert.ok(r.ok, r.msg);
  assert.equal(g.s.skills.growth, 2); assert.equal(g.s.points, 1); assert.equal(g.s.xp, 10);
  assert.deepEqual(ev.find((e) => e.type === 'skill'), { type: 'skill', day: 1, skill: 'growth', level: 2 });
  assert.ok(g.s.ledger.some((e) => e.type === 'train'));
  assert.equal(g.spendPoint('nonsense').ok, false);
  assert.equal(g.s.points, 1, 'a refused spend keeps the point');
  g.s.skills.fintech = SKILL_MAX; g.s.points = 5;
  const top = g.spendPoint('fintech');
  assert.equal(top.ok, false); assert.match(top.msg, /mastery/i);
  assert.equal(g.s.points, 5); assert.equal(g.s.skills.fintech, SKILL_MAX);
  g.s.skills.ops = SKILL_MAX - 1;
  assert.ok(g.spendPoint('ops').ok); assert.equal(g.s.skills.ops, SKILL_MAX);
  assert.equal(g.spendPoint('ops').ok, false);
  assert.deepEqual(Object.keys(SKILLS), ['ops', 'growth', 'fintech']);
});

test('BUG: spendPoint refuses names that are not skills (a point on "constructor" corrupted the skills table)', () => {
  // js/engine.js spendPoint: `s.skills[skill]` finds inherited properties, so 'constructor' / 'toString' / '__proto__' spend a point and write NaN into skills.
  for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    const g = mk(); g.s.points = 3;
    const r = g.spendPoint(name);
    assert.equal(r.ok, false, name);
    assert.equal(g.s.points, 3, name + ': the point is kept');
    assert.deepEqual(Object.keys(g.s.skills), ['ops', 'growth', 'fintech']);
    assert.ok(Object.values(g.s.skills).every(Number.isFinite));
  }
});

test('skill levels read through lvl(): the specialty starts at 3, the Heir has none, Backgrounds add or subtract, and the result is clamped', () => {
  assert.deepEqual(mk([], 1, { specialty: 'growth' }).s.skills, { ops: 1, growth: 3, fintech: 1 });
  const heir = mk(['heir'], 1, { specialty: 'ops' });
  assert.deepEqual(heir.s.skills, { ops: 1, growth: 1, fintech: 1 }); assert.equal(heir.s.specialty, null);
  const trades = mk(['trades']); assert.equal(trades.lvl('ops'), 3 + 2);
  const grad = mk(['grad']); assert.equal(grad.lvl('ops'), 3 - 1); assert.equal(grad.lvl('fintech'), 1 + 1);
  grad.s.skills.ops = 0; assert.equal(grad.lvl('ops'), 0, 'never below zero');
  trades.s.skills.ops = SKILL_MAX; assert.equal(trades.lvl('ops'), SKILL_MAX + 2, 'perks may lift past mastery, but only by the cap');
  assert.equal(mk([], 1, { specialty: 'nonsense' }).s.skills.ops, 1, 'an unknown specialty is just no specialty');
});

// ---------------------------------------------------------------------------------------------------- districts unlock by net worth
test('the sixteen districts open exactly at their gates, once, announcing "zone" and (at 5, 9 and 13) "milestone"', () => {
  const g = mk(); g.s.assets = []; // net worth is then exactly the cash
  const ev = log(g);
  assert.deepEqual(g.s.zones, [1]);
  for (const z of ZONE_IDS.slice(1)) {
    g.s.cash = ZONES[z].gate - 0.5; g.advanceTo(g.s.hour + 1);
    assert.ok(!g.s.zones.includes(z), `district ${z} stays shut just under $${ZONES[z].gate}`);
    g.s.cash = ZONES[z].gate; g.advanceTo(g.s.hour + 1);
    assert.ok(g.s.zones.includes(z), `district ${z} opens at exactly $${ZONES[z].gate}`);
    assert.equal(ev.filter((e) => e.type === 'zone' && e.id === z).length, 1, `one zone event for ${z}`);
    assert.ok(g.s.leads[z].length >= 1 && g.s.lots[z].length >= 1, `district ${z} comes with buyers and lots`);
    assert.equal(g.s.pool[z], ZONES[z].pool);
  }
  assert.deepEqual(g.s.zones, ZONE_IDS);
  assert.deepEqual(ev.filter((e) => e.type === 'zone').map((e) => e.id), ZONE_IDS.slice(1), 'in order, none twice');
  assert.deepEqual(ev.filter((e) => e.type === 'milestone').map((e) => e.n), [1, 2, 3]);
  assert.deepEqual(g.s.mil, { m1: true, m2: true, m3: true });
  // falling back below a gate never closes a district or repeats the announcement
  g.s.cash = 0; g.advanceTo(g.s.hour + 5);
  assert.deepEqual(g.s.zones, ZONE_IDS);
  assert.equal(ev.filter((e) => e.type === 'zone').length, 15); assert.equal(ev.filter((e) => e.type === 'milestone').length, 3);
});

test('one big jump opens every district it clears in one go, in order, and no further', () => {
  const g = mk(); const ev = log(g);
  rich(g, 30000); // clears districts up to 9 (gate 25,000), not 10 (50,000)
  assert.deepEqual(g.s.zones, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(ev.filter((e) => e.type === 'zone').map((e) => e.id), [2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(ev.filter((e) => e.type === 'milestone').map((e) => e.n), [1, 2]);
  assert.equal(g.s.auditNext != null || !!g.s.auditPending, true, 'Milestone 2 starts the audit clock');
  assert.equal(g.s.mil.m3, false);
});

test('the milestone gates are the gates of the districts that unlock their features', () => {
  assert.equal(MIL.m1, ZONES[MIL_ZONE.m1].gate); assert.equal(MIL.m2, ZONES[MIL_ZONE.m2].gate); assert.equal(MIL.m3, ZONES[MIL_ZONE.m3].gate);
  assert.equal(MIL_ZONE.m1, UNLOCK_RULES.managers); assert.equal(MIL_ZONE.m1, UNLOCK_RULES.bank);
  assert.equal(MIL_ZONE.m2, UNLOCK_RULES.audits); assert.equal(MIL_ZONE.m3, UNLOCK_RULES.enterprise);
  assert.ok(ZONES[5].rules.managers && ZONES[5].rules.bank && ZONES[9].rules.audits && ZONES[13].rules.enterprise && ZONES[15].rules.rent && ZONES[16].rules.arbitrage);
  for (const [k, z] of Object.entries(UNLOCK_RULES)) for (const id of ZONE_IDS) assert.equal(!!ZONES[id].rules[k], id === z, `rule ${k} is set exactly in district ${z}`);
});

test('features open at their districts: managers and the Bank at 5, audits at 9, enterprise and exits at 13', () => {
  const g = mk();
  const lane = { cls: 'pen', buyer: 'student' };
  assert.match(g.loanBlock('micro'), /Commercial Bank opens/);
  assert.match(g.hirePipeline('broker', 5, lane).msg, /access/, 'no managers in a district you cannot enter');
  assert.equal(g.autoLocked(), false); assert.equal(g.s.auditPending, null);
  assert.match(g.exitQuote('trade').msg, /Corporate Valley/);
  assert.match(g.acquireClient('smb').msg, /district|yet/i);
  rich(g, 1000);
  assert.equal(g.loanBlock('micro'), '', 'the Bank is open'); assert.equal(g.hirePipeline('broker', 5, laneOf(g, 5)).ok, true);
  assert.equal(g.s.auditPending, null, 'no audit before Industrial Park');
  assert.match(g.loanBlock('enterprise'), /Corporate Valley/);
  assert.match(g.acquireClient('ent').msg, /district|yet|Milestone/i);
  rich(g, 30000);
  assert.ok(g.s.auditPending, 'audits begin at Industrial Park');
  g.resolveAudit('A');
  assert.match(g.exitQuote('trade').msg, /Corporate Valley/);
  rich(g, 300000);
  assert.equal(g.loanBlock('enterprise'), ''); assert.equal(g.exitQuote('trade').ok, true);
  assert.equal(g.loanRoom('enterprise').limit, LOANS.enterprise.limit * g.B.creditLimitMult);
});

test('a manager needs a slot: 4 per district (3 in the two largest), and none where everything is done by hand', () => {
  const g = mk(); rich(g, 400000);
  g.resolveAudit('A');
  assert.equal(g.s.zones.length, 13);
  const l5 = laneOf(g, 5);
  for (let i = 0; i < ZONES[5].plots; i++) { g.s.cash = 1e6; assert.ok(g.hirePipeline('broker', 5, l5).ok, 'manager ' + (i + 1)); }
  g.s.cash = 1e6; const full = g.hirePipeline('broker', 5, l5);
  assert.equal(full.ok, false); assert.match(full.msg, /slots/);
  assert.equal(ZONES[15].plots, 3); assert.equal(ZONES[16].plots, 3);
  assert.ok(ZONE_IDS.every((z) => (z < 5 ? ZONES[z].plots === 0 : ZONES[z].plots >= 3)));
});

// ---------------------------------------------------------------------------------------------------- unlock bonuses (g.B)
test('unlock bonuses start neutral and apply once their district is open', () => {
  const g = mk();
  assert.deepEqual(g.B, { freightMult: 1, capMult: 1, leadMult: 1, spreadMult: 1, storeBonus: 0, lotSlots: 0, feeMult: 1, repairMult: 1, rentMult: 1, exitMult: 1, creditLimitMult: 1 });
  rich(g, 100); assert.equal(g.B.lotSlots, 0, 'districts 2 to 4 grant nothing');
  rich(g, 3000); assert.equal(g.B.lotSlots, 1);
  rich(g, 7000); rel(g.B.repairMult, 0.9);
  rich(g, 13000); rel(g.B.freightMult, 0.7);
  rich(g, 30000); rel(g.B.capMult, 1.25);
  rich(g, 60000); rel(g.B.leadMult, 1.15);
  rich(g, 100000); assert.equal(g.B.storeBonus, 4);
  rich(g, 300000); rel(g.B.creditLimitMult, 1.5);
  rich(g, 600000); rel(g.B.spreadMult, 0.8);
  rich(g, 1100000); rel(g.B.rentMult, 1.25);
  rich(g, 3e6); rel(g.B.exitMult, 1.1);
  assert.equal(g.s.zones.length, 16);
});

/** Two games that differ only in having reached district `z` (or the one before it). */
const pairAt = (z) => ({ before: rich(mk(), ZONES[z].gate - 1), after: rich(mk(), ZONES[z].gate) });

test('bonus, district 6 Estate Sales: one more lot slot in every district', () => {
  const { before, after } = pairAt(6);
  assert.equal(before.s.zones.includes(6), false); assert.equal(after.s.zones.includes(6), true);
  const fill = (g) => { for (let i = 0; i < 12; i++) g._spawnLot(5); return g.s.lots[5].length; };
  assert.equal(fill(before), ECON.lotSlots); assert.equal(fill(after), ECON.lotSlots + 1);
});

test('bonus, district 7 Auto Row: repairs 10% cheaper everywhere', () => {
  const { before, after } = pairAt(7);
  const cost = (g) => { const a = putAsset(g, 'bike', 5, { cond: 'broken' }); return g.repairQuote(a.id).cost; };
  rel(cost(after) / cost(before), 0.9);
});

test('bonus, district 8 Harbor Docks: freight 30% cheaper', () => {
  const { before, after } = pairAt(8);
  const cost = (g) => { g.s.cash = 1000; const a = putAsset(g, 'bike', 5); return g.freightQuote([a.id], 6).cost; };
  rel(cost(after) / cost(before), 0.7);
});

test('bonus, district 9 Industrial Park: pipeline caps +25%', () => {
  const { before, after } = pairAt(9);
  const cap = (g) => g.pipeCap({ kind: 'broker', zone: 5, level: 1 });
  rel(cap(after) / cap(before), 1.25);
  rel(after.pipeCap({ kind: 'student', zone: 9, level: 3 }) / before.pipeCap({ kind: 'student', zone: 9, level: 3 }), 1.25);
});

test('bonus, district 10 Tech Corridor: the lead multiplier grows by 15%', () => {
  const { before, after } = pairAt(10);
  rel(after.B.leadMult / before.B.leadMult, 1.15);
});

test('bonus, district 11 Farmland Co-op: four more crates of storage everywhere', () => {
  const { before, after } = pairAt(11);
  for (const z of [1, 5, 9]) assert.equal(after.storeCap(z), before.storeCap(z) + 4, 'district ' + z);
  assert.equal(before.storeCap(1), ZONES[1].store);
});

test('bonus, district 13 Corporate Valley: credit lines 50% bigger', () => {
  const { before, after } = pairAt(13);
  const room = (g) => { g.s.cash = 1e7; return g.loanRoom('micro').limit; };
  assert.equal(room(before), LOANS.micro.limit); assert.equal(room(after), LOANS.micro.limit * 1.5);
});

test('bonus, district 14 Financial District: loan spreads 20% lower', () => {
  const { before, after } = pairAt(14);
  const spread = (g) => g.loanRate('micro') - (0.025 + g.mods().rateBps / 1e4);
  rel(spread(after) / spread(before), 0.8, 1e-9);
  assert.ok(after.loanRate('pipeline') < before.loanRate('pipeline'));
});

test('bonus, district 15 Real Estate Row: rent income +25%, and only for rent (not for royalties)', () => {
  const { before, after } = pairAt(15);
  const income = (g, cls, zone = 15) => { g.s.assets = []; g.s.cash = 0; const a = putAsset(g, cls, zone); g.resolveAudit?.('A'); const c0 = g.s.cash; g.advanceTo(Math.ceil((g.s.hour + 1) / 24) * 24); return { got: g.s.cash - c0, expect: g.val(a) * ASSETS[cls].yield }; };
  const b = income(before, RENTAL), a = income(after, RENTAL);
  rel(b.got, b.expect, 1e-9); rel(a.got, a.expect * 1.25, 1e-9);
  const rb = income(before, ROYALTY, 12), ra = income(after, ROYALTY, 12);
  rel(rb.got, rb.expect, 1e-9); rel(ra.got, ra.expect, 1e-9);
});

test('bonus, district 16 Global Exchange: exit multiples +10%', () => {
  const { before, after } = pairAt(16);
  const premium = (g) => { g.s.dp = [10000]; return g.exitQuote('trade').premium; };
  assert.equal(premium(before), 10000 * 6 * 1); rel(premium(after), 10000 * 6 * 1.1);
});

// ---------------------------------------------------------------------------------------------------- district rules
test('rule haggle: only the Flea Market Row bargains', () => {
  for (const z of ZONE_IDS) assert.equal(!!ZONES[z].rules.haggle, z === 2, 'district ' + z);
});

test('rule auction: the share of auction lots follows the district\'s number, and fixed-price districts never auction', () => {
  for (const z of ZONE_IDS) {
    const lots = lotsIn(z, 300), want = ZONES[z].rules.auction || 0, n = lots.length;
    const got = lots.filter((l) => l.mode === 'auction').length / n;
    assert.ok(lots.every((l) => l.mode === 'auction' || l.mode === 'fixed'), 'mode is auction or fixed');
    if (!want) assert.equal(got, 0, `district ${z} has fixed prices only`);
    else assert.ok(Math.abs(got - want) < 4 * sd(want, n) / n, `district ${z}: ${got.toFixed(3)} auction lots vs the rule's ${want} (n=${n})`);
  }
});

test('rule fakes: counterfeits appear at the district rate times the asset\'s own fake risk, only in lots that look fine, and nowhere else', () => {
  for (const z of ZONE_IDS) {
    const lots = lotsIn(z, 400), rule = ZONES[z].rules.fakes || 0;
    const fakes = lots.filter((l) => l.truth.fake);
    if (!rule) { assert.equal(fakes.length, 0, `district ${z} has no counterfeits`); continue; }
    assert.ok(fakes.every((l) => l.cond === 'ok'), 'a broken lot is never also a fake');
    const ps = lots.map((l) => (l.cond === 'ok' ? rule * (ASSETS[l.cls].fakeRisk ?? 1) : 0));
    const expected = ps.reduce((a, b) => a + b, 0), sigma = Math.sqrt(ps.reduce((a, p) => a + p * (1 - p), 0));
    assert.ok(Math.abs(fakes.length - expected) < 4.5 * sigma + 1, `district ${z}: ${fakes.length} fakes vs ${expected.toFixed(1)} +- ${sigma.toFixed(1)}`);
  }
  // the Pawn District is the place to learn appraisal: a fifth of its lots, by far the highest rate
  const rate = (z) => { const l = lotsIn(z, 300); return l.filter((x) => x.truth.fake).length / l.length; };
  assert.ok(rate(4) > rate(6) && rate(4) > 0.08 && rate(3) === 0);
});

test('rule season: demand for paper, training and electronics swings +-35% on a 28-day wave at Campus Quad (and food and farm on 30 days at Farmland)', () => {
  const book = ASSETS[SEASONAL];
  for (const d of [0, 7, 14, 21, 28, 35]) rel(seasonMult(book, 3, d), 1 + 0.35 * Math.sin((2 * Math.PI * d) / 28), 1e-12);
  assert.equal(seasonMult(ASSETS.pen, 3, 7), 1, 'office goods do not follow the semester');
  assert.equal(seasonMult(book, 1, 7), 1, 'other districts have no season'); assert.equal(seasonMult(book, 3, undefined), 1);
  rel(seasonMult(ASSETS[PERISHABLES[0]], 11, 7.5), 1 + 0.35 * Math.sin((2 * Math.PI * 7.5) / 30), 1e-12);
  // through the engine: the price of the same crate rises to the peak (day 7), is back at the middle on day 14 and bottoms on day 21
  const g = mk(); g.s.events = [];
  const price = (day, cls = SEASONAL) => { g.s.hour = (day - 1) * 24; g._m = null; return g.val({ cls, cond: 'ok', quality: 1, wear: 1, zone: 3 }, 3); };
  const p = [1, 7, 8, 14, 15, 21, 22, 28].map((d) => price(d));
  assert.ok(price(8) > price(1) && price(8) > price(15) && price(22) < price(15) && price(22) < price(1), p.join(' '));
  rel(price(1), price(29), 1e-9); // one full period later
  rel(price(2), price(30), 1e-9);
  assert.ok(price(8) / price(1) > 1.05, 'the wave is worth a few percent at least: ' + price(8) / price(1));
  const flat = (day) => { g.s.hour = (day - 1) * 24; g._m = null; return g.val({ cls: 'pen', cond: 'ok', quality: 1, wear: 1, zone: 3 }, 3); };
  assert.equal(flat(8), flat(22), 'a pen is not seasonal');
});

test('rule customs: freight arriving at Harbor Docks is inspected one time in four (12 hours\' delay and a 2% fee); other districts never are', () => {
  const trial = (from, to, seed) => {
    const g = mk([], seed); rich(g, 100000); g.resolveAudit('A');
    const a = putAsset(g, 'bike', from); g.s.cash = 5000;
    assert.ok(g.ship([a.id], to).ok);
    const f = g.s.freight[0], eta = f.arrive, book = f.book, cash = g.s.cash;
    g.advanceTo(eta);
    const held = g.s.freight.length === 1 && g.s.freight[0].arrive === eta + 12;
    if (held) {
      const fee = g.s.ledger.find((e) => e.type === 'customs');
      near(-fee.amt, book * 0.02, 1e-9); near(g.s.cash, cash - book * 0.02, 1e-9);
      g.advanceTo(eta + 12); assert.equal(g.s.freight.length, 0); assert.equal(a.zone, to, 'it arrives after the delay');
    } else assert.equal(a.zone, to, 'on time');
    return held;
  };
  let n = 0, held = 0;
  for (let seed = 1; seed <= 400; seed++) { n++; if (trial(7, 8, seed)) held++; }
  assert.ok(Math.abs(held / n - 0.25) < 4.5 * sd(0.25, n) / n, `${held} of ${n} inspected`);
  let none = 0;
  for (let seed = 1; seed <= 60; seed++) if (trial(6, 7, seed)) none++;
  assert.equal(none, 0, 'no customs at Auto Row');
  assert.equal(ZONES[8].rules.customs, 0.25); assert.equal(ZONES[16].rules.customs, 0.15);
});

test('rule repair: repairs at Auto Row cost 25% less, and 60% of its repairable lots are broken against 40% elsewhere', () => {
  const g = rich(mk(), 7000);
  const a6 = putAsset(g, 'bike', 6, { cond: 'broken' }), a7 = putAsset(g, 'bike', 7, { cond: 'broken' });
  rel(g.repairQuote(a7.id).cost / g.repairQuote(a6.id).cost, 0.75);
  const frac = (z) => { const l = lotsIn(z, 400).filter((x) => ASSETS[x.cls].repair); return { f: l.filter((x) => x.cond === 'broken').length / l.length, n: l.length }; };
  const f7 = frac(7), f5 = frac(5);
  assert.ok(Math.abs(f7.f - 0.6) < 4.5 * sd(0.6, f7.n) / f7.n, 'Auto Row: ' + f7.f);
  assert.ok(Math.abs(f5.f - 0.4) < 4.5 * sd(0.4, f5.n) / f5.n, 'Metro Hub: ' + f5.f);
});

test('rule perish: perishables spoil every day by 80% / their shelf life (on top of ordinary wear); others only wear', () => {
  assert.ok(PERISHABLES.length >= 3, 'the farm has several perishables: ' + PERISHABLES);
  const g = mk(); g.s.events = [];
  const goods = PERISHABLES.map((c) => putAsset(g, c, 11)), box = putAsset(g, 'bike', 11);
  g.advanceTo(72); // three day-ticks
  const per = (a, life) => Math.pow((1 - ASSETS[a.cls].dep * 0.002) * (life ? 1 - 0.8 / life : 1), 3);
  for (const a of goods) rel(a.wear, per(a, ASSETS[a.cls].perish), 1e-9);
  rel(box.wear, per(box, 0), 1e-9);
  const shortest = goods.reduce((m, a) => (ASSETS[a.cls].perish < ASSETS[m.cls].perish ? a : m)), longest = goods.reduce((m, a) => (ASSETS[a.cls].perish > ASSETS[m.cls].perish ? a : m));
  assert.ok(shortest.wear < longest.wear && longest.wear < box.wear, 'the shorter the shelf life the faster it goes');
  g.advanceTo(24 * 12);
  assert.ok(shortest.wear < 0.25, 'a short-lived load is nearly worthless after 12 days: ' + shortest.wear);
  assert.ok(g.val(shortest) < g.val({ ...shortest, wear: 1 }) * 0.25);
});

test('rule yield: royalties and rent are paid every day you hold the asset, as a share of its value, and announced as a "cycle"', () => {
  const g = rich(mk(), 200000); g.resolveAudit('A');
  const ev = log(g);
  g.s.assets = []; const cat = putAsset(g, ROYALTY, 12), pen = putAsset(g, 'pen', 12);
  const c0 = g.s.cash;
  g.advanceTo(24); // the first day-tick after this setup
  const inc = g.val(cat) * ASSETS[ROYALTY].yield;
  near(g.s.cash - c0, inc, 1e-6);
  assert.ok(inc > 100, 'a real income: ' + inc);
  const cyc = ev.filter((e) => e.type === 'cycle');
  assert.equal(cyc.length, 1); near(cyc[0].net, inc, 1e-6); assert.equal(cyc[0].zone, 12);
  assert.ok(g.s.ledger.some((e) => e.type === 'rent'));
  g.advanceTo(72);
  assert.equal(ev.filter((e) => e.type === 'cycle').length, 3, 'one per day');
  assert.equal(ASSETS.pen.yield, undefined);
});

test('rule fads: digital goods lose value twice as fast at Tech Corridor; other goods are unaffected', () => {
  const g = mk(); g.s.events = [];
  const saasHere = putAsset(g, DIGITAL10, 10), saasThere = putAsset(g, DIGITAL10, 9), fleetHere = putAsset(g, PLAIN10, 10), fleetThere = putAsset(g, PLAIN10, 9);
  g.advanceTo(240);
  const dep = ASSETS[DIGITAL10].dep * 0.002;
  rel(saasThere.wear, Math.pow(1 - dep, 10), 1e-9); rel(saasHere.wear, Math.pow(1 - 2 * dep, 10), 1e-9);
  assert.ok(saasHere.wear < saasThere.wear);
  assert.equal(fleetHere.wear, fleetThere.wear);
  assert.ok(ZONES[10].rules.fads);
});

test('the JIT upgrade halves ordinary decay', () => {
  const a = mk(), b = mk(); a.s.events = b.s.events = [];
  b.s.upg.jit = true;
  const x = putAsset(a, 'bike', 1), y = putAsset(b, 'bike', 1);
  a.advanceTo(240); b.advanceTo(240);
  rel(x.wear, Math.pow(1 - ASSETS.bike.dep * 0.002, 10), 1e-9); rel(y.wear, Math.pow(1 - ASSETS.bike.dep * 0.001, 10), 1e-9);
});

test('every lot the market makes is sane: a class that sells there, a posted price, hidden truth in range, and never more lots than the district allows', () => {
  for (const z of ZONE_IDS) {
    for (const l of lotsIn(z, 60)) {
      assert.ok(demandOf(ASSETS[l.cls], z) >= 3, `${l.cls} sells in district ${z}`);
      assert.ok(l.price > 0 && Number.isFinite(l.price)); assert.ok(l.exp > 0);
      assert.ok(['ok', 'broken'].includes(l.cond)); if (l.cond === 'broken') assert.ok(ASSETS[l.cls].repair, 'only repairable goods come broken');
      assert.ok(l.truth.q >= (z <= 2 ? 0.85 : 0.7) - 0.005 && l.truth.q <= 1.15 + 0.005, `q ${l.truth.q} in district ${z}`);
      assert.equal(typeof l.truth.fake, 'boolean'); assert.ok(Array.isArray(l.truth.defects));
      for (const d of l.truth.defects) assert.ok(d.id && d.label);
    }
  }
  const g = rich(mk(), 3e6);
  for (let i = 0; i < 40; i++) { g.advanceTo(g.s.hour + 6); for (const z of g.s.zones) { assert.ok(g.s.lots[z].length <= ECON.lotSlots + g.B.lotSlots); assert.ok(g.s.leads[z].length <= 8); } }
});

// ---------------------------------------------------------------------------------------------------- hidden truth
test('truthMult: a fake is worth 8% of the real thing, a genuine lot its condition, and an asset with no truth (the starting paperclip) is just itself', () => {
  assert.equal(FAKE_VALUE, 0.08);
  assert.equal(truthMult({}), 1);
  assert.equal(truthMult({ truth: { q: 0.7, fake: false } }), 0.7);
  assert.equal(truthMult({ truth: { q: 1.1, fake: true } }), 0.08);
  const base = { cls: 'bike', cond: 'ok', quality: 1, wear: 1 };
  const v = assetFMV(base, 3, { demand: [], price: [] });
  assert.equal(assetFMV({ ...base, truth: { q: 0.7, fake: false }, known: false }, 3, { demand: [], price: [] }), v, 'unknown truth is invisible to the price');
  rel(assetFMV({ ...base, truth: { q: 0.7, fake: false }, known: true }, 3, { demand: [], price: [] }), v * 0.7);
  rel(assetFMV({ ...base, truth: { q: 1.1, fake: true }, known: true }, 3, { demand: [], price: [] }), v * 0.08);
});

const withTruth = (g, cls, zone, truth) => putAsset(g, cls, zone, { truth: { defects: [], ...truth } });

test('a counterfeit is rejected by every buyer in the district, whatever they like, and the first rejection reveals it', () => {
  const g = rich(mk(), 3000); g.s.assets = [];
  const fake = withTruth(g, 'textbooks', 5, { q: 1, fake: true });
  for (const seg of Object.keys(BUYERS).filter((b) => BUYERS[b].zone === 5)) {
    const lead = { id: 'L-' + seg, zone: 5, seg, budget: 1e6, need: null, born: 0, exp: 999 }; g.s.leads[5].push(lead);
    const q = g.quotePitch(fake.id, lead.id);
    assert.equal(q.rejected, true, seg); assert.equal(q.price, 0); assert.equal(q.reason, 'counterfeit', seg);
  }
  assert.equal(g.quotePitch(putAsset(g, 'textbooks', 5).id, 'L-trainer').rejected, false, 'the same buyer takes a genuine copy');
  const urgent = { id: 'LU', zone: 5, seg: 'trainer', budget: 5000, need: 'paper', born: 0, exp: 999 }; g.s.leads[5].push(urgent);
  assert.equal(g.quotePitch(fake.id, 'LU').rejected, true, 'even an urgent buyer who needs exactly this');
  const ev = log(g);
  assert.equal(fake.known, false, 'quoting reveals nothing to the asset');
  const cash = g.s.cash, rep = g.s.rep;
  const r = g.pitch(fake.id, 'L-' + Object.keys(BUYERS).find((b) => BUYERS[b].zone === 5));
  assert.equal(r.outcome, 'rejected');
  assert.equal(fake.known, true, 'now everybody knows');
  assert.equal(g.s.cash, cash); assert.equal(g.s.rep, rep - 3); assert.equal(g.s.streak, 0);
  assert.ok(g.s.assets.includes(fake), 'it stays in the crate');
  assert.equal(ev.find((e) => e.type === 'pitch').outcome, 'rejected');
});

test('net worth counts a lot as described until the truth is known, then writes it down (a fake to 8%)', () => {
  const g = rich(mk(), 3000); g.s.assets = []; g.s.cash = 0;
  const twin = putAsset(g, 'textbooks', 5);
  const fake = withTruth(g, 'textbooks', 5, { q: 1, fake: true });
  const flaw = withTruth(g, 'textbooks', 5, { q: 0.7, fake: false });
  const described = g.val(twin);
  for (const a of [fake, flaw]) rel(g.val(a), described, 1e-12);
  rel(g.netWorth(), 3 * described, 1e-12);
  fake.known = true;
  rel(g.val(fake), described * 0.08, 1e-12);
  rel(g.netWorth(), 2 * described + described * 0.08, 1e-12);
  assert.equal(flaw.known, false, 'a mere flaw is not revealed by a rejection');
});

test('the pool pays for what is really there: an unknown fake or a flawed lot is paid at its true value, a known fake the same', () => {
  const g = rich(mk(), 3000); g.s.assets = [];
  const twin = putAsset(g, 'textbooks', 5), fake = withTruth(g, 'textbooks', 5, { q: 1, fake: true }), flaw = withTruth(g, 'textbooks', 5, { q: 0.7, fake: false });
  const fric = ZONES[5].friction + g.instFee('pool'), described = g.val(twin);
  rel(g.poolQuote([twin.id]).total, described * (1 - fric));
  rel(g.poolQuote([flaw.id]).total, described * (1 - fric) * 0.7);
  const unknown = g.poolQuote([fake.id]).total;
  rel(unknown, described * (1 - fric) * 0.08);
  fake.known = true;
  rel(g.poolQuote([fake.id]).total, unknown, 1e-12); // revealing it does not pay a second haircut
  assert.ok(unknown < g.poolQuote([twin.id]).total * 0.1);
});

test('buying keeps the hidden truth with the crate; the posted price describes the lot as it looks, whatever it is', () => {
  const g = mk(); g.s.cash = 100;
  const lot = g.s.lots[1][0];
  const truth = JSON.parse(JSON.stringify(lot.truth));
  const t = g.lotTruth(1, lot.id); t.q = 99; t.defects.push({ id: 'x', label: 'x' });
  assert.deepEqual(g.s.lots[1][0].truth, truth, 'lotTruth hands out a copy');
  assert.equal(g.lotTruth(1, 'nope'), null);
  const r = g.buyLot(1, lot.id);
  assert.ok(r.ok);
  assert.deepEqual(r.asset.truth, truth); assert.equal(r.asset.known, false); assert.equal(r.asset.from, 'lot');
  assert.equal(g.s.lots[1].some((l) => l.id === lot.id), false, 'the lot is sold');
  near(g.s.cash, 100 - lot.price, 1e-9);
  assert.equal(g.buyLot(1, lot.id).ok, false, 'a lot sells once');
});

test('Inspect: the Deal Room reports what the player learned; the lot (and then the crate) remembers the belief, and the engine pays XP and announces it', () => {
  const g = mk(); const ev = log(g);
  const lot = g.s.lots[1][0];
  lot.truth.fake = true; // force the case
  const res = g.recordInspect(1, lot.id, { estimate: { quality: 0.8, fakeProb: 0.9 }, confidence: 0.7, score: 0.8 });
  assert.ok(res.ok); assert.equal(res.caught, true);
  assert.deepEqual(lot.belief, { quality: 0.8, fakeProb: 0.9, confidence: 0.7 });
  assert.deepEqual(ev.find((e) => e.type === 'inspect'), { type: 'inspect', day: 1, score: 0.8, fake: true, caught: true });
  assert.equal(g.s.xp, Math.round(8 + 22 * 0.8));
  assert.equal(g.recordInspect(1, lot.id, { estimate: { quality: 1, fakeProb: 0.1 }, score: 0.2 }).caught, false, 'a low suspicion does not "catch" it');
  g.s.cash = 50; const b = g.buyLot(1, lot.id);
  assert.equal(b.asset.belief.fakeProb, 0.1, 'the crate remembers what you believed when you bought it');
  assert.equal(g.recordInspect(1, 'gone', { estimate: {} }).ok, false);
  assert.equal(g.recordInspect(1, g.s.lots[1][0].id, {}).ok, false);
  assert.equal(g.recordInspect(1, g.s.lots[1][0].id, { estimate: { quality: 1, fakeProb: 0 }, score: 7 }).ok, true);
  assert.equal(ev.at(-1).score, 1, 'scores are clamped to 0..1');
});

test('played-for-their-own-sake games pay XP and announce themselves', () => {
  const g = mk(); const ev = log(g);
  g.recordPlay('haggle', { role: 'buy', mult: 0.85, score: 0.9, deal: true });
  g.recordPlay('auction', { won: true, price: 12.5, surplus: 3 });
  g.recordPlay('haggle', { score: 9 });
  assert.deepEqual(ev[0], { type: 'haggle', day: 1, role: 'buy', mult: 0.85, score: 0.9, deal: true });
  assert.deepEqual(ev[1], { type: 'auction', day: 1, won: true, price: 12.5, surplus: 3 });
  assert.deepEqual(ev[2], { type: 'haggle', day: 1, role: 'sell', mult: 1, score: 1, deal: false }, 'defaults, and scores clamp to 1');
  assert.equal(g.s.xp, Math.round(6 + 24 * 0.9) + Math.round(6 + 24 * 0.5) + 30);
});

// ---------------------------------------------------------------------------------------------------- bounded deals
test('deal.mult is clamped to 0.6..1.4 on a pitch, and the quote reports the multiplier it used', () => {
  const g = rich(mk(), 3000); g.s.assets = [];
  const a = putAsset(g, 'textbooks', 5);
  const lead = { id: 'LX', zone: 5, seg: 'trainer', budget: 1e9, need: null, born: 0, exp: 999 }; g.s.leads[5].push(lead);
  const at = (mult) => g.quotePitch(a.id, 'LX', mult === undefined ? undefined : { mult });
  const base = at(1);
  assert.equal(base.deal, 1); assert.equal(at().deal, 1); assert.equal(g.quotePitch(a.id, 'LX', {}).deal, 1);
  for (const [asked, used] of [[1.4, 1.4], [9, 1.4], [Infinity, 1.4], [1.2, 1.2], [0.6, 0.6], [0, 0.6], [-5, 0.6], [0.1, 0.6]]) {
    const q = at(asked);
    assert.equal(q.deal, used, 'asked ' + asked);
    if (!q.rejected && base.price > 0) rel(q.price / base.price, used, 1e-12);
  }
  const high = at(100), low = at(0.001);
  rel(high.price / low.price, 1.4 / 0.6, 1e-12);
  // the budget is a hard cap whatever the haggle says
  const small = { id: 'LS', zone: 5, seg: 'trainer', budget: base.price / 2, need: null, born: 0, exp: 999 }; g.s.leads[5].push(small);
  const capped = g.quotePitch(a.id, 'LS', { mult: 1.4 });
  assert.equal(capped.capped, true); near(capped.price, small.budget, 1e-9);
});

test('deal.mult is clamped to 0.6..1.4 when buying a lot, and the price is rounded to cents', () => {
  const g = mk(); g.s.cash = 1e6;
  const lot = g.s.lots[1][0];
  const price = (mult) => g.buyQuote(1, lot.id, mult === undefined ? undefined : { mult }).price;
  assert.equal(price(), lot.price);
  rel(price(0.6), Math.round(lot.price * 60) / 100, 1e-9);
  assert.equal(price(0.01), price(0.6)); assert.equal(price(50), price(1.4));
  rel(price(1.4), Math.round(lot.price * 140) / 100, 1e-9);
  const cash = g.s.cash, pay = price(0.6); g.buyLot(1, lot.id, { mult: 0.01 });
  near(g.s.cash, cash - pay, 1e-9);
});

test('repair: costMult is clamped to 0.9..1.3 and qualityMult to 0.85..1.15, and "precision" rides along to the event', () => {
  const g = rich(mk(), 3000); const ev = log(g);
  const a = putAsset(g, 'bike', 5, { cond: 'broken' });
  const base = g.repairQuote(a.id);
  for (const [asked, used] of [[0, 0.9], [0.5, 0.9], [1, 1], [2, 1.3], [99, 1.3]]) rel(g.repairQuote(a.id, { costMult: asked }).cost / base.cost, used, 1e-12);
  for (const [asked, used] of [[0, 0.85], [0.5, 0.85], [1.1, 1.1], [5, 1.15]]) rel(g.repairQuote(a.id, { qualityMult: asked }).quality / base.quality, used, 1e-12);
  const r = g.repair(a.id, { costMult: 1.3, qualityMult: 1.15, precision: 0.8 });
  assert.ok(r.ok); assert.equal(a.cond, 'ok');
  rel(a.quality, Math.min(1.15, base.quality * 1.15)); near(a.basis, 1 + base.cost * 1.3, 1e-9);
  assert.deepEqual(Object.keys(ev.find((e) => e.type === 'repair')).sort(), ['cls', 'cost', 'day', 'precision', 'quality', 'type']);
  assert.equal(ev.find((e) => e.type === 'repair').precision, 0.8);
  assert.equal(g.repair(a.id).ok, false, 'nothing left to repair');
});

test('BUG: a NaN from the Deal Room is treated as a neutral deal, not written into the player\'s cash', () => {
  // js/engine.js: clamp(NaN, lo, hi) is NaN (Math.min/Math.max propagate it), so deal.mult / costMult / qualityMult of NaN reach the price. A Haggle on a zero fair price (0/0) makes one.
  const problems = [];
  const g = mk(); g.s.cash = 100;
  const lot = g.s.lots[1][0];
  if (!Number.isFinite(g.buyQuote(1, lot.id, { mult: NaN }).price)) problems.push('buyQuote with a NaN mult');
  g.buyLot(1, lot.id, { mult: NaN });
  if (!Number.isFinite(g.s.cash)) problems.push('buyLot left cash at ' + g.s.cash);
  const h = rich(mk(), 3000), a = putAsset(h, 'bike', 5, { cond: 'broken' });
  const q = h.repairQuote(a.id, { costMult: NaN, qualityMult: NaN });
  if (!Number.isFinite(q.cost) || !Number.isFinite(q.quality)) problems.push(`repairQuote with NaN: cost ${q.cost}, quality ${q.quality}`);
  h.s.leads[5].push({ id: 'LN', zone: 5, seg: 'trainer', budget: 1e6, need: null, born: 0, exp: 999 });
  const p = putAsset(h, 'textbooks', 5);
  if (!Number.isFinite(h.quotePitch(p.id, 'LN', { mult: NaN }).price)) problems.push('quotePitch with a NaN mult');
  assert.deepEqual(problems, []);
});

// ---------------------------------------------------------------------------------------------------- buyer flow, storage
/** New buyers that turn up in a district over `hours` when the player takes every one at once. */
const flow = (g, zone, hours) => { let n = 0; for (let h = 0; h < hours; h++) { g.advanceTo(g.s.hour + 1); n += g.s.leads[zone].length; g.s.leads[zone] = []; } return n; };

test('buyers keep arriving at a steady pace, and the Growth skill, the SEO upgrade and the Connected Background all speed them up', () => {
  const at = (growth, upg) => { const g = mk([], 3); g.s.skills.growth = growth; if (upg) g.s.upg.seo = true; return flow(g, 1, 400); };
  const base = at(1);
  assert.ok(base > 100 && base < 250, 'about one buyer every two or three hours in the Scrap Yard: ' + base);
  assert.ok(at(3) > base * 1.2, 'Growth 3'); assert.ok(at(1, true) > base * 1.2, 'SEO');
  assert.ok(flow(mk(['connected'], 3), 1, 400) > base * 1.3, 'Connected: 40% faster');
  assert.ok(flow(mk(['native'], 3), 1, 400) > 0);
  const slow = mk(['roots'], 3); assert.equal(flow(slow, 1, 400), base, 'Roots changes nothing at home');
});

test('BUG: every level of Growth brings more buyers (the lead cadence is rounded to whole hours, so levels 2, 4, 5, 6 and 7 do nothing)', () => {
  // js/engine.js _spawnLead: every = Math.max(1, Math.round(Z.leadEvery * ECON.leadEvery / mult)). With leadEvery 3 the cadence is 3 hours up to a x1.2 multiplier, then 2 up to x1.5, then jumps to 1.
  // Measured over 480 hours with every buyer taken at once: Growth 1..8 = 165, 165, 245, 245, 245, 245, 245, 485. The Tech Corridor bonus (x1.15 buyers) is the same: nothing at Growth 1.
  const counts = [];
  for (let growth = 1; growth <= SKILL_MAX; growth++) { const g = mk([], 3); g.s.skills.growth = growth; counts.push(flow(g, 1, 480)); }
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] > counts[i - 1] * 1.04, `Growth ${i} -> ${i + 1}: ${counts[i - 1]} -> ${counts[i]} buyers (${counts.join(', ')})`);
});

test('BUG: a swap cannot push a district past its storage (accepting an offer ignored the cap)', () => {
  // js/engine.js acceptOffer/finalizeOffer push the delivered crates without the storage check that buyLot, ship and the barter path respect.
  const g = mk(); const cap = g.storeCap(1);
  g.s.assets = []; for (let i = 0; i < cap; i++) g.s.assets.push(g._mk(g.s, 'bike', { zone: 1 }));
  g.s.cash = 100;
  const pen = { cls: 'pen', cond: 'ok', quality: 1, wear: 1, zone: 1, id: 'z' };
  const r = g.acceptOffer({ id: 'Ox', from: 'P', fromHandle: 'P', give: { assets: [pen], cash: 0, royalty: null }, want: { assets: [], cash: Math.round(g.sideValue({ assets: [pen] })) }, skills: {} });
  assert.ok(g.s.assets.filter((a) => a.zone === 1).length <= cap, `${g.s.assets.length} crates in a district that holds ${cap} (accepted: ${r.ok})`);
});

// ---------------------------------------------------------------------------------------------------- scams
test('Digital Native: about 18% of buyers are fraudulent; every other Background meets none', () => {
  const count = (perks) => { let n = 0, s = 0; for (let seed = 1; seed <= 60; seed++) { const g = mk(perks, seed); for (let i = 0; i < 40; i++) { g.s.leads[1] = []; g._spawnLead(1); n++; if (g.s.leads[1][0].scam) s++; } } return { n, s }; };
  const nat = count(['native', 'pro']), other = count(['trades', 'pro']);
  assert.ok(Math.abs(nat.s / nat.n - 0.18) < 4.5 * sd(0.18, nat.n) / nat.n, `${nat.s} of ${nat.n}`);
  assert.equal(other.s, 0);
});

test('an unverified fraudulent buyer takes the goods and never pays; a verified genuine buyer pays as usual', () => {
  const g = mk(['native'], 3); g.s.cash = 5;
  const ev = log(g);
  const a = g.s.assets[0];
  const lead = (id, scam) => { const l = { id, zone: 1, seg: 'student', budget: 8, need: null, born: 0, exp: 999, ...(scam ? { scam: true } : {}) }; g.s.leads[1].push(l); return l; };
  lead('Lscam', true); lead('Lgood', false);
  const q = g.quotePitch(a.id, 'Lscam');
  assert.equal(q.scam, true, 'the quote warns the engine\'s caller');
  const cash = g.s.cash, rep = g.s.rep;
  const r = g.pitch(a.id, 'Lscam');
  assert.equal(r.outcome, 'scam');
  assert.equal(g.s.assets.some((x) => x.id === a.id), false, 'the paperclip is gone'); assert.equal(g.s.cash, cash, 'and no payment came');
  assert.equal(g.s.rep, rep - 10); assert.equal(g.s.streak, 0);
  assert.equal(ev.find((e) => e.type === 'pitch').outcome, 'rejected');
  assert.ok(g.s.news[0].text.includes('Scam'));
});

test('verifyLead costs 1% of the buyer\'s budget (at least a cent), says what it found, and only charges once', () => {
  const g = mk(['native'], 3); g.s.cash = 20;
  g.s.leads[1].push({ id: 'La', zone: 1, seg: 'student', budget: 400, need: null, born: 0, exp: 999, scam: true }, { id: 'Lb', zone: 1, seg: 'student', budget: 0.5, need: null, born: 0, exp: 999 });
  const a = g.verifyLead('La');
  assert.ok(a.ok); assert.equal(a.scam, true); near(a.cost, 4, 1e-9); near(g.s.cash, 16, 1e-9); assert.match(a.msg, /Fraud confirmed/);
  const again = g.verifyLead('La'); assert.equal(again.msg, 'Already verified.'); near(g.s.cash, 16, 1e-9);
  const b = g.verifyLead('Lb'); assert.equal(b.scam, false); assert.equal(b.cost, 0.01); assert.match(b.msg, /genuine/);
  assert.equal(g.verifyLead('nobody').ok, false);
  g.s.cash = 0.001; g.s.leads[1].push({ id: 'Lc', zone: 1, seg: 'student', budget: 50, need: null, born: 0, exp: 999 });
  assert.equal(g.verifyLead('Lc').ok, false, 'no cash, no check');
  assert.ok(g.s.ledger.some((e) => e.type === 'verify'));
});

test('BUG: a buyer confirmed as fraudulent cannot then be sold to at full price', () => {
  // js/engine.js quotePitch: `scam: !!lead.scam && !lead.verified`, so verifying turns a fraudster into a paying customer (verifyLead says "Skip this buyer").
  const g = mk(['native'], 3); g.s.cash = 5;
  g.s.leads[1].push({ id: 'Lscam', zone: 1, seg: 'student', budget: 8, need: null, born: 0, exp: 999, scam: true });
  assert.equal(g.verifyLead('Lscam').scam, true);
  const a = g.s.assets[0], cash = g.s.cash;
  const r = g.pitch(a.id, 'Lscam');
  assert.ok(!r.ok || r.outcome === 'rejected' || r.outcome === 'scam', 'selling to a confirmed fraudster must not pay: ' + r.outcome);
  assert.ok(g.s.cash <= cash, 'no money from a fraudster');
});

// ---------------------------------------------------------------------------------------------------- events
const KINDS = {
  pitch: { zone: 'n', cls: 's', seg: 's', outcome: ['win', 'pioneer', 'herd', 'flat', 'rejected'], gain: 'n', cm: 'n', S: 'n', fit: 'n', price: 'n', mult: 'n' },
  buy: { zone: 'n', cls: 's', price: 'n', fake: 'b', cond: ['ok', 'broken'] },
  'sell-pool': { zone: 'n', total: 'n', count: 'n' }, repair: { cls: 's', cost: 'n', quality: 'n', precision: 'n' }, ship: { from: 'n', to: 'n', count: 'n' },
  hire: { kind: Object.keys(PIPE), zone: 'n' }, upgrade: { id: Object.keys(UPGRADES) }, 'pipe-level': { id: 's', level: 'n' }, cycle: { zone: 'n', net: 'n' },
  draw: { prod: Object.keys(LOANS), amount: 'n' }, repay: { amount: 'n' }, client: { tier: Object.keys(CLIENTS) }, audit: { choice: ['A', 'B', 'C'], ok: 'b' },
  zone: { id: 'n' }, milestone: { n: [1, 2, 3] }, shock: { kind: ['tiktok', 'fed', 'tariff', 'viral', 'glut', 'scare'] }, p2p: { peer: 's', variance: 'n' },
  skill: { skill: Object.keys(SKILLS), level: 'n' }, level: { level: 'n' }, inspect: { score: 'n', fake: 'b', caught: 'b' }, haggle: { role: ['buy', 'sell'], mult: 'n', score: 'n', deal: 'b' },
  auction: { won: 'b', price: 'n', surplus: 'n' }, streak: { n: 'n' }, day: { day: 'n' }, 'margin-call': {}, insolvent: {}, exit: { kind: ['trade', 'ipo'] }, perk: { id: Object.keys(PERKS), effect: 's' },
};
const seen = new Map();
const watch = (g) => g.onEvent = (e) => {
  seen.set(e.type, (seen.get(e.type) || 0) + 1);
  assert.ok(EVENT_TYPES.includes(e.type), 'a known event type: ' + e.type);
  const keys = Object.keys(e).filter((k) => k !== 'type' && k !== 'day').sort(); // every event carries type and day; the "day" event's own payload is that same day
  assert.deepEqual(keys, EVENT_PAYLOAD[e.type].filter((k) => k !== 'day').sort(), `${e.type} carries exactly the documented payload`);
  assert.ok(Number.isInteger(e.day) && e.day >= 1 && e.day <= TOTAL_DAYS, 'day ' + e.day);
  for (const [k, kind] of Object.entries(KINDS[e.type])) {
    const v = e[k];
    if (kind === 'n') assert.ok(typeof v === 'number' && Number.isFinite(v), `${e.type}.${k} is a finite number: ${v}`);
    else if (kind === 's') assert.ok(typeof v === 'string' && v, `${e.type}.${k} is a string`);
    else if (kind === 'b') assert.equal(typeof v, 'boolean', `${e.type}.${k} is a boolean`);
    else assert.ok(kind.includes(v), `${e.type}.${k} = ${v} is one of ${kind}`);
  }
  if (e.type === 'repair') assert.ok(e.precision >= 0 && e.precision <= 1);
  if (e.type === 'pitch') assert.ok(e.mult >= 0.6 && e.mult <= 1.4);
};

test('every event in the contract fires with exactly the documented payload keys (a bot plays; scripted moments fill the rest)', () => {
  // the bot plays three different builds for the whole 90 days
  for (const [perks, seed] of [[['trades', 'native'], 7], [['heir', 'creator'], 8], [['immigrant', 'gigger'], 9]]) {
    const g = makeGame(perks, 'ops', seed); watch(g); run(g);
    assert.equal(g.evq.length <= 200, true, 'the event queue is bounded');
  }
  // scripted: the things a bot never does or does only rarely
  const g1 = mk(['heir', 'native'], 4); watch(g1);
  const lot = g1.s.lots[1][0];
  g1.recordInspect(1, lot.id, { estimate: { quality: 0.9, fakeProb: 0.7 }, confidence: 0.5, score: 0.8 });
  g1.recordPlay('haggle', { role: 'buy', mult: 1.1, score: 0.7, deal: true }); g1.recordPlay('auction', { won: true, price: 10, surplus: 2 });
  g1.s.cash = -50; g1.s.assets = []; g1.advanceTo(g1.s.hour + 1); // insolvent
  const g2 = mk(['heir', 'native'], 5); watch(g2);
  rich(g2, 3000); g2.s.loans.push({ id: 'D1', prod: 'micro', principal: 1e6, accr: 0, last: 0, next: 9999, drawn: 0 }); g2._marginCall(); // margin-call + the Heir's bailout
  const g3 = mk([], 6); watch(g3); rich(g3, 30000);
  g3.resolveAudit('A');
  const l3 = laneOf(g3, 5);
  const p3 = g3.hirePipeline('broker', 5, l3).pipe; g3.buyUpgrade('freight'); g3.upgradePipeline(p3.id); g3.acquireClient('smb');
  const dr = g3.draw('micro', 300); assert.ok(dr.ok); g3.repay(g3.s.loans[0].id, 100);
  g3.advanceTo(g3.s.hour + 100); // a cycle, the shocks that start in range, audits
  rich(g3, 300000); g3.exit('trade');
  const A = mk([], 1), B = mk([], 2); watch(A); watch(B);
  A.s.pid = 'AAA'; B.s.pid = 'BBB';
  const pen = putAsset(A, 'pen', 1), scrap = putAsset(B, 'scrap', 1);
  const off = A.createOffer({ to: 'BBB', giveIds: [pen.id], want: { assets: [B.pub(scrap)], cash: 0 } });
  const acc = B.acceptOffer(off.offer); A.finalizeOffer(off.offer.id, acc.deliver);
  const g4 = mk(['gigger'], 7); watch(g4);
  g4.xp(150); g4.spendPoint('growth');
  const missing = EVENT_TYPES.filter((t) => !seen.has(t));
  assert.deepEqual(missing, [], 'every contract event was observed: ' + [...seen.keys()].join(' '));
  assert.deepEqual(Object.keys(KINDS).sort(), [...EVENT_TYPES].sort());
});

test('a game keeps its last 200 events and hands each one to onEvent as it happens', () => {
  const g = mk(); const got = log(g);
  for (let i = 0; i < 250; i++) g.emit('day', { day: i });
  assert.equal(got.length, 250); assert.equal(g.evq.length, 200); assert.equal(g.evq.at(-1).day, 249);
  assert.deepEqual(g.evq.at(-1), got.at(-1));
  assert.equal(g.emit('streak', { n: 3 }).type, 'streak');
});

test('streaks: consecutive wins build a streak and announce it from the second one; a loss or a rejection ends it', () => {
  const g = rich(mk(), 3000); g.s.assets = [];
  const ev = log(g);
  const sell = (deal) => { g.s.niche = []; /* a fresh niche each time: repeating one is the herd trap */ const a = putAsset(g, 'textbooks', 5); g.s.leads[5].push({ id: 'L' + g.s.nid++, zone: 5, seg: 'trainer', budget: 1e9, need: null, born: 0, exp: 999 }); return g.pitch(a.id, g.s.leads[5].at(-1).id, deal); };
  const r1 = sell({ mult: 1.4 }), r2 = sell({ mult: 1.4 }), r3 = sell({ mult: 1.4 });
  for (const r of [r1, r2, r3]) assert.ok(r.gain > 0.02, 'a good haggle wins: ' + r.gain);
  assert.equal(g.s.streak, 3); assert.equal(g.s.bestStreak, 3);
  assert.deepEqual(ev.filter((e) => e.type === 'streak').map((e) => e.n), [2, 3], 'announced from the second win');
  assert.ok(r2.xp > r1.xp, 'a streak pays more XP: ' + r1.xp + ' -> ' + r2.xp);
  const loss = sell({ mult: 0.6 });
  assert.ok(loss.gain < 0.02 && g.s.streak === 0, 'a poor deal ends the run'); assert.equal(g.s.bestStreak, 3, 'but the best stays');
  sell({ mult: 1.4 }); assert.equal(g.s.streak, 1, 'and a new one starts');
  const fake = withTruth(g, 'textbooks', 5, { q: 1, fake: true });
  g.s.leads[5].push({ id: 'Lf', zone: 5, seg: 'trainer', budget: 1e9, need: null, born: 0, exp: 999 });
  g.pitch(fake.id, 'Lf');
  assert.equal(g.s.streak, 0, 'a rejection ends it too');
});

// ---------------------------------------------------------------------------------------------------- determinism, save and restore
test('the same seed and the same Backgrounds give the same game, move for move; another seed or another Background does not', () => {
  const play = (perks, seed) => { const g = makeGame(perks, 'ops', seed); run(g, { days: 25 }); return JSON.stringify(g.s); };
  for (const perks of [['trades', 'pro'], ['heir', 'creator'], ['immigrant', 'native'], ['connected', 'veteran']]) assert.equal(play(perks, 31), play(perks, 31), perks.join('+'));
  assert.notEqual(play(['trades', 'pro'], 31), play(['trades', 'pro'], 32));
  assert.notEqual(play(['trades', 'pro'], 31), play(['trades', 'heir'], 31));
});

/** Plays `days` with the bot, saves, restores into a new Game (with the given cohort) and plays `days` more. Returns that game and one that played straight through. */
async function saveAndContinue(days, freshCohort) {
  const { Progress } = await import('../js/meta/progress.js');
  const hook = (g) => { const p = new Progress(g); g.onEvent = (e) => p.onEvent(e); return p; };
  const a = makeGame(['trades', 'pro'], 'ops', 17); hook(a);
  const b = makeGame(['trades', 'pro'], 'ops', 17); hook(b);
  run(a, { days: 2 * days }); run(b, { days });
  const saved = JSON.stringify(b.s), restored = JSON.parse(saved);
  assert.equal(JSON.stringify(restored), saved, 'the state is pure JSON: nothing is lost or invented by the round trip');
  const c = new Game({ state: restored });
  c.env.cohort = freshCohort ? new Cohort({ seed: 'test', ghosts: 36 }) : b.env.cohort; // Session.restore builds a new, empty cohort
  c.env.worldSeed = b.env.worldSeed; c.env.algo = b.env.algo;
  hook(c);
  return { a, b, c, again: () => run(c, { days }) };
}

test('a saved state restores through a JSON round trip, the quests/Codex "meta" block included, and play continues the same way', async () => {
  const { a, b, c, again } = await saveAndContinue(10, false);
  assert.ok(b.s.meta && Object.keys(b.s.meta.q).length > 0, 'quests have progress to save: ' + Object.keys(b.s.meta?.q || {}).length);
  assert.deepEqual(c.s.meta, b.s.meta, 'meta survived');
  assert.deepEqual(c.s.perks, ['trades', 'pro']); assert.equal(c.P.repairMult, 0.5);
  again();
  assert.equal(JSON.stringify(c.s), JSON.stringify(a.s), 'ten days, save, load, ten days = twenty days');
});

test('BUG: a game restored into a fresh Cohort (as Session.restore does) plays on exactly as one that never stopped', async () => {
  // js/cohort.js counts(): the cache keeps the numbers computed at the FIRST hour asked in each 6-hour bucket, so the crowd a trade sees depends on who asked when.
  // A restored game starts with an empty cache and drifts away from the uninterrupted run (here: $64,819 vs $31,740 after ten more days).
  const { a, c, again } = await saveAndContinue(10, true);
  again();
  assert.equal(JSON.stringify(c.s), JSON.stringify(a.s));
});

test('rewinding to a daily checkpoint restores the saved state, the quest block included', async () => {
  const { Progress } = await import('../js/meta/progress.js');
  const g = makeGame(['gigger', 'second'], 'ops', 5);
  const p = new Progress(g); g.onEvent = (e) => p.onEvent(e);
  run(g, { days: 6 });
  const atSix = JSON.parse(JSON.stringify(g.s));
  assert.ok(atSix.meta && atSix.meta.q && atSix.meta.d, 'the quest block exists to be restored');
  run(g, { days: 4 }); // on to day 10
  assert.equal(g.rewindTo(6 * 24 + 5), 6 * 24, 'the nearest checkpoint at or before the hour asked');
  assert.equal(g.s.hour, 6 * 24);
  for (const k of ['cash', 'assets', 'zones', 'perks', 'meta', 'rng', 'leads', 'lots', 'skills', 'xp', 'points']) assert.deepEqual(g.s[k], atSix[k], 'rewound ' + k);
  assert.equal(g.rewindTo(-5), null, 'nothing exists before the first checkpoint');
  assert.equal(g.rewindTo(3 * 24), 3 * 24, 'and further back still');
  assert.equal(g.rewindTo(6 * 24), 3 * 24, 'checkpoints after the one rewound to were dropped');
});

test('BUG: after a rewind the same days replay the same way (the cohort cache remembers the first timeline)', () => {
  // Same root cause as the restore test above; the checkpoint is also taken inside the day-tick, so the end of that hour (peak net worth) is not in it, which is allowed to differ.
  const g = makeGame(['gigger', 'second'], 'ops', 5);
  run(g, { days: 10 });
  const original = JSON.parse(JSON.stringify(g.s));
  g.rewindTo(6 * 24);
  run(g, { days: 4 });
  const strip = (s) => { const c = JSON.parse(JSON.stringify(s)); delete c.peak; return JSON.stringify(c); };
  assert.equal(strip(g.s), strip(original));
});

// ---------------------------------------------------------------------------------------------------- pacing
test('pacing: for ten different Background pairs a competent bot reaches district 5 between days 6 and 35 and ends day 90 solvent', (t) => {
  const PAIRS = [['connected', 'grad'], ['trades', 'immigrant'], ['veteran', 'heir'], ['creator', 'gigger'], ['roots', 'native'], ['second', 'pro'], ['grad', 'native'], ['heir', 'creator'], ['immigrant', 'second'], ['gigger', 'pro']];
  assert.deepEqual([...new Set(PAIRS.flat())].sort(), Object.keys(PERKS).sort(), 'the ten pairs cover all twelve Backgrounds');
  const days = [];
  for (const pair of PAIRS) {
    const g = makeGame(pair, 'ops', 7);
    const marks = run(g);
    days.push(marks[5]);
    assert.ok(marks[5] >= 6 && marks[5] <= 35, `${pair}: district 5 on day ${marks[5]}`);
    assert.ok(marks[3] <= 14, `${pair}: districts 1-4 within two weeks (district 3 on day ${marks[3]})`);
    assert.equal(g.s.over, true); assert.equal(g.s.insolvent, false, pair + ' ends solvent');
    assert.ok(g.netWorth() > 0 && g.s.cash > -1000, `${pair}: nw ${Math.round(g.netWorth())}`);
    assert.ok(g.eei() > 0 && Number.isFinite(g.eei()));
  }
  const sorted = [...days].sort((a, b) => a - b), med = (sorted[4] + sorted[5]) / 2;
  t.diagnostic(`district 5 on days ${days.join(', ')} (median ${med}); the contract asks every pair within 35% of the median: ${days.filter((d) => Math.abs(d - med) / med > 0.35).length} of ${days.length} are outside`);
});

test('pacing: a bot plays the starter districts in order and gets richer day by day, never going backwards by more than a bad day', () => {
  const g = makeGame(['trades', 'pro'], 'ops', 7);
  const nw = [];
  run(g, { days: 40, onDay: (d, v) => nw.push(v) });
  assert.ok(nw[nw.length - 1] > nw[0] * 1000, 'from pennies to thousands');
  let worst = Infinity;
  for (let i = 5; i < nw.length; i++) worst = Math.min(worst, nw[i] / nw[i - 1]);
  assert.ok(worst > 0.5, 'no day halves a business: ' + worst);
  assert.ok(g.s.zones.length >= 8, 'zones: ' + g.s.zones.length);
});

test('late-game guards: a free-falling account becomes insolvent, announces it once, and the pipelines stop', () => {
  const g = rich(mk(), 3000); const ev = log(g);
  g.hirePipeline('broker', 5, laneOf(g, 5));
  g.s.assets = []; g.s.pipes.forEach((p) => { p.basis = 0; p.inflight = 0; }); g.s.cash = -10;
  g.advanceTo(g.s.hour + 3);
  assert.equal(g.s.insolvent, true);
  assert.equal(ev.filter((e) => e.type === 'insolvent').length, 1);
  assert.equal(g.draw('micro', 100).ok, false, 'no new credit while insolvent');
  g.s.cash = 5000; g.advanceTo(g.s.hour + 1);
  assert.equal(g.s.insolvent, false, 'solvent again');
});

test('the Business-School Grad\'s garnishment applies to trading profit through the real pitch', () => {
  const g = mk(['grad'], 2); g.s.cash = 0;
  const a = g.s.assets[0];
  g.s.leads[1].push({ id: 'Lp', zone: 1, seg: 'student', budget: 8, need: 'office', born: 0, exp: 999 }); // an urgent buyer who pays for need
  const q = g.quotePitch(a.id, 'Lp');
  assert.ok(q.profit > 0);
  const r = g.pitch(a.id, 'Lp');
  assert.ok(r.ok);
  const take = g.s.ledger.find((e) => e.type === 'garnish');
  assert.ok(take, 'garnish is on the ledger');
  near(-take.amt, q.profit * 0.08, 1e-9); near(g.s.ps.garnished, q.profit * 0.08, 1e-9);
  near(g.s.cash, q.change - q.profit * 0.08, 1e-9);
});
