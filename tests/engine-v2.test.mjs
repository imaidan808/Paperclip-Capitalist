// The v2 rules, one by one (docs/V2_DESIGN.md sections 3, 4, 4.1, 7, 7.1): districts that unlock by net worth, their bonuses and signature rules, hidden lot truth,
// bounded deal results, the event contract, skill points, scams, determinism and pacing.
// Tests named "BUG:" assert the correct behaviour and FAIL against the current engine; each is listed in the report for the engine owner. (Those the engine has since fixed lost the prefix.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/engine.js';
import { LEVEL_XP, xpForLevel } from '../js/config.js';
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
test('XP makes levels (LEVEL_XP x (level - 1)^2) and every level grants exactly one skill point, even when one award crosses several', () => {
  const g = mk(); const ev = log(g);
  assert.equal(g.level(), 1); assert.equal(g.s.points, 0);
  g.xp(LEVEL_XP - 1); assert.equal(g.level(), 1); assert.equal(g.s.points, 0);
  g.xp(1); assert.equal(g.level(), 2); assert.equal(g.s.points, 1);
  g.xp(xpForLevel(5) - LEVEL_XP); // level 5 starts at xpForLevel(5)
  assert.equal(g.level(), 5); assert.equal(g.s.points, 4); assert.equal(g.s.lvlPaid, 5);
  assert.deepEqual(ev.filter((e) => e.type === 'level').map((e) => e.level), [2, 3, 4, 5]);
  g.xp(50); assert.equal(g.s.points, 4, 'no level, no point');
});

test('XP multipliers: Side-Hustler +25%, Heir -10%, Seasoned Pro -15%, and they multiply', () => {
  const xp = (perks) => { const g = mk(perks); g.xp(100); return g.s.xp; };
  assert.equal(xp([]), 100); assert.equal(xp(['gigger']), 125); assert.equal(xp(['heir']), 90); assert.equal(xp(['pro']), 85);
  assert.equal(xp(['gigger', 'pro']), Math.round(100 * (1.25 * 0.85)));
  assert.equal(xp(['heir', 'pro']), Math.round(100 * (0.9 * 0.85)));
  const slow = mk(['heir', 'pro']), fast = mk(['gigger']);
  slow.xp(3000); fast.xp(3000);
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

test('spendPoint refuses names that are not skills (a point on "constructor" once corrupted the skills table)', () => {
  // spendPoint looked `s.skills[skill]` up with an inherited property, so 'constructor' / 'toString' / '__proto__' spent a point and wrote NaN into skills.
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

test('rule fakes: the district rate is the share of ITS LOTS that are counterfeit (shared out by the asset\'s own fake risk), only in lots that look fine, and nowhere else', () => {
  // (the rate used to be multiplied by the class's risk with no regard to the mix, so the Pawn District's 22% measured 14%: audit D4)
  for (const z of ZONE_IDS) {
    const lots = lotsIn(z, 400), rule = ZONES[z].rules.fakes || 0;
    const fakes = lots.filter((l) => l.truth.fake);
    if (!rule) { assert.equal(fakes.length, 0, `district ${z} has no counterfeits`); continue; }
    assert.ok(fakes.every((l) => l.cond === 'ok'), 'a broken lot is never also a fake');
    assert.ok(Math.abs(fakes.length / lots.length - rule) < 0.03, `district ${z}: ${(100 * fakes.length / lots.length).toFixed(1)}% of ${lots.length} lots are counterfeit against the rule's ${rule * 100}%`);
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

test('rule repair: repairs at Auto Row cost 25% less, and 60% of ITS LOTS are broken (audit D4: it measured 49%); elsewhere 40% of the repairable ones are', () => {
  const g = rich(mk(), 7000);
  const a6 = putAsset(g, 'bike', 6, { cond: 'broken' }), a7 = putAsset(g, 'bike', 7, { cond: 'broken' });
  rel(g.repairQuote(a7.id).cost / g.repairQuote(a6.id).cost, 0.75);
  const all7 = lotsIn(7, 400);
  assert.ok(Math.abs(all7.filter((x) => x.cond === 'broken').length / all7.length - 0.6) < 0.03, 'Auto Row: a broken lot is 60% of its lots');
  const l5 = lotsIn(5, 400).filter((x) => ASSETS[x.cls].repair), f5 = l5.filter((x) => x.cond === 'broken').length / l5.length;
  assert.ok(Math.abs(f5 - 0.4) < 4.5 * sd(0.4, l5.length) / l5.length, 'Metro Hub: ' + f5);
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
const REAL = { blind: false }; // quotes are blind unless asked otherwise (audit D2/F4); these tests are about what the engine really decides

test('a counterfeit is rejected by every buyer in the district, whatever they like, and the first rejection reveals it', () => {
  const g = rich(mk(), 3000); g.s.assets = [];
  const fake = withTruth(g, 'textbooks', 5, { q: 1, fake: true });
  for (const seg of Object.keys(BUYERS).filter((b) => BUYERS[b].zone === 5)) {
    const lead = { id: 'L-' + seg, zone: 5, seg, budget: 1e6, need: null, born: 0, exp: 999 }; g.s.leads[5].push(lead);
    const q = g.quotePitch(fake.id, lead.id, undefined, REAL);
    assert.equal(q.rejected, true, seg); assert.equal(q.price, 0); assert.equal(q.reason, 'counterfeit', seg);
    assert.notEqual(g.quotePitch(fake.id, lead.id).reason, 'counterfeit', seg + ': an ordinary (blind) quote has not been told');
  }
  assert.equal(g.quotePitch(putAsset(g, 'textbooks', 5).id, 'L-trainer', undefined, REAL).rejected, false, 'the same buyer takes a genuine copy');
  const urgent = { id: 'LU', zone: 5, seg: 'trainer', budget: 5000, need: 'paper', born: 0, exp: 999 }; g.s.leads[5].push(urgent);
  assert.equal(g.quotePitch(fake.id, 'LU', undefined, REAL).rejected, true, 'even an urgent buyer who needs exactly this');
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
  const real = (id) => g.poolQuote([id], false, REAL).total;
  rel(real(twin.id), described * (1 - fric));
  rel(real(flaw.id), described * (1 - fric) * 0.7);
  const unknown = real(fake.id);
  rel(unknown, described * (1 - fric) * 0.08);
  fake.known = true;
  rel(real(fake.id), unknown, 1e-12); // revealing it does not pay a second haircut
  assert.ok(unknown < real(twin.id) * 0.1);
  fake.known = false;
  for (const a of [twin, fake, flaw]) rel(g.poolQuote([a.id]).total, described * (1 - fric), 1e-12); // what the player is shown is the as-described figure for all three
  const cash = g.s.cash; assert.ok(g.sellPool([fake.id]).ok);
  rel(g.s.cash - cash, unknown, 1e-12); // ...and what the pool really pays is the truth
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

test('a NaN from the Deal Room is a neutral deal, never written into the player\'s cash', () => {
  // clamp(NaN, lo, hi) is NaN (Math.min/Math.max propagate it), so deal.mult / costMult / qualityMult of NaN once reached the price. A Haggle on a zero fair price (0/0) makes one.
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

test('deal values that are not numbers are neutral, and infinities are the nearest bound', () => {
  const g = rich(mk(), 3000); g.s.assets = [];
  const text = putAsset(g, 'textbooks', 5);
  g.s.leads[5].push({ id: 'LD', zone: 5, seg: 'trainer', budget: 1e12, need: null, born: 0, exp: 999 });
  const pitch = (mult) => g.quotePitch(text.id, 'LD', mult === undefined ? undefined : { mult });
  const base = pitch(1);
  for (const junk of [NaN, undefined, null, '1.3', {}, [], true]) { const q = pitch(junk); assert.equal(q.deal, 1, 'mult ' + String(junk)); assert.equal(q.price, base.price); }
  assert.equal(pitch(Infinity).deal, 1.4); assert.equal(pitch(-Infinity).deal, 0.6);
  assert.equal(g.quotePitch(text.id, 'LD', 'not an object').deal, 1); assert.equal(g.quotePitch(text.id, 'LD', null).deal, 1);
  // buying
  const lot = g.s.lots[5][0];
  const buy = (mult) => g.buyQuote(5, lot.id, { mult }).price;
  assert.equal(buy(NaN), lot.price); assert.equal(buy('x'), lot.price); assert.equal(buy(Infinity), buy(1.4)); assert.equal(buy(-Infinity), buy(0.6));
  // repairing
  const a = putAsset(g, 'bike', 5, { cond: 'broken' });
  const base2 = g.repairQuote(a.id);
  const cost = (costMult, qualityMult) => g.repairQuote(a.id, { costMult, qualityMult });
  rel(cost(NaN, NaN).cost, base2.cost); rel(cost(NaN, NaN).quality, base2.quality);
  rel(cost(Infinity, Infinity).cost / base2.cost, 1.3); rel(cost(-Infinity, -Infinity).cost / base2.cost, 0.9);
  rel(cost(1, Infinity).quality / base2.quality, 1.15); rel(cost(1, -Infinity).quality / base2.quality, 0.85);
  const ev = log(g);
  g.repair(a.id, { precision: NaN }); assert.equal(ev.find((e) => e.type === 'repair').precision, 0.5, 'unknown precision is the middle');
  const b = putAsset(g, 'bike', 5, { cond: 'broken' }); g.repair(b.id, { precision: Infinity }); assert.equal(ev.filter((e) => e.type === 'repair')[1].precision, 1);
  assert.ok(Number.isFinite(g.s.cash) && Number.isFinite(g.netWorth()));
});

test('ok() and fail() keep their own verdict and message even when a quote is spread into them', () => {
  const g = rich(mk(), 100);
  const c = putAsset(g, 'bike', 2); g.s.pool[2] = 0;
  const r = g.sellPool([c.id]);
  assert.equal(r.ok, false); assert.match(r.msg, /liquidity pool/);
  assert.ok(r.total > 0 && r.zone === 2 && Array.isArray(r.per), 'the quote still rides along for the UI');
  const away = g.sellPool([c.id, 'nope']);
  assert.equal(typeof away.ok, 'boolean'); assert.equal(typeof away.msg, 'string');
  for (const f of [() => g.draw('micro', 1), () => g.buyLot(1, 'nope'), () => g.ship([], 1), () => g.hirePipeline('broker', 1, {}), () => g.repay('nope'), () => g.exit('trade'), () => g.resolveAudit('A')]) {
    const x = f(); assert.equal(x.ok, false); assert.ok(typeof x.msg === 'string' && x.msg.length > 0, 'every refusal says why');
  }
});

// ---------------------------------------------------------------------------------------------------- ids from the UI and the network
test('ids that come from the UI or the network are looked up as own keys: inherited names such as "constructor" never match anything', () => {
  const g = rich(mk(), 400000); g.resolveAudit('A');
  const before = JSON.stringify(g.s);
  for (const bad of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
    assert.equal(g.hirePipeline(bad, 5, { cls: 'textbooks', buyer: 'trainer' }).ok, false, 'manager ' + bad);
    assert.equal(g.buyUpgrade(bad).ok, false, 'upgrade ' + bad);
    assert.equal(g.acquireClient(bad).ok, false, 'client ' + bad);
    assert.equal(g.draw(bad, 10).ok, false, 'loan ' + bad);
    assert.equal(g.spendPoint(bad).ok, false, 'skill ' + bad);
    assert.equal(g.validLane(5, bad, 'trainer').ok, false); assert.equal(g.validLane(5, 'textbooks', bad).ok, false);
  }
  assert.equal(JSON.stringify(g.s), before, 'not one of them changed the game');
  assert.deepEqual(mk(['constructor', '__proto__', 'toString']).s.perks, [], 'Backgrounds too');
  assert.deepEqual(mk(['toString', 'pro']).s.perks, ['pro']);
  assert.deepEqual(Object.keys(g.s.skills), ['ops', 'growth', 'fintech']);
});

test('BUG: an instructor shock of an unknown kind is refused (injectEvent("constructor") was accepted, then every tick threw "ev.phases is not iterable")', () => {
  // js/engine.js injectEvent: `EVENTS[kind]` / `ALGO_EVENTS[kind]` find inherited properties. Session._onMsg passes m.kind straight from the room, so any peer's message bricks every student's saved game.
  for (const bad of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'nonsense']) {
    const g = mk();
    const n = g.s.events.length;
    assert.equal(g.injectEvent(bad, 5, { id: 'x' }), false, bad);
    assert.equal(g.s.events.length, n);
    assert.doesNotThrow(() => g.advanceTo(10), bad);
  }
});

test('BUG: an unknown exit kind is refused (exit("constructor") settled as a trade sale and announced kind "constructor")', () => {
  // js/engine.js exitQuote/exit: only 'ipo' is tested; anything else is a trade sale, so the "exit" event can carry a kind outside the contract (trade | ipo).
  const g = rich(mk(), 300000);
  for (const bad of ['constructor', 'nonsense', undefined, 7]) { assert.equal(g.exitQuote(bad).ok, false, String(bad)); assert.equal(g.exit(bad).ok, false, String(bad)); }
  assert.equal(g.s.exiting, null);
  assert.equal(g.exitQuote('trade').ok, true); assert.equal(g.exitQuote('ipo').ok, true);
});

// ---------------------------------------------------------------------------------------------------- buyer flow, storage
/** New buyers that turn up in a district over `hours` when the player takes every one at once. */
const flow = (g, zone, hours) => { let n = 0; g.s.leads[zone] = []; for (let h = 0; h < hours; h++) { g.advanceTo(g.s.hour + 1); n += g.s.leads[zone].length; g.s.leads[zone] = []; } return n; };
/** The rate the engine promises: buyers per hour = multiplier / (the district's leadEvery x ECON.leadEvery). */
const expectedFlow = (zone, mult, hours) => hours * mult / (ZONES[zone].leadEvery * ECON.leadEvery);

test('buyers arrive at an exact average rate, and the Growth skill, the SEO upgrade, Connected and the district bonus all speed them up', () => {
  const at = (growth, upg) => { const g = mk([], 3); g.s.skills.growth = growth; if (upg) g.s.upg.seo = true; return flow(g, 1, 400); };
  const base = at(1);
  assert.ok(Math.abs(base - expectedFlow(1, 1, 400)) <= 1, `plain: ${base} vs ${expectedFlow(1, 1, 400)}`);
  assert.ok(base > 100 && base < 250, 'about one buyer every two or three hours in the Scrap Yard: ' + base);
  assert.ok(Math.abs(at(3) - expectedFlow(1, 1.3, 400)) <= 1, 'Growth 3 is x1.3'); assert.ok(Math.abs(at(1, true) - expectedFlow(1, 1.5, 400)) <= 1, 'SEO is x1.5');
  const con = flow(mk(['connected'], 3), 1, 400);
  assert.ok(Math.abs(con - expectedFlow(1, 1.3, 400)) <= 1, 'Connected: 30% faster: ' + con);
  assert.ok(flow(mk(['native'], 3), 1, 400) > 0);
  const slow = mk(['roots'], 3); assert.equal(flow(slow, 1, 400), base, 'Roots changes nothing at home');
  const slowFar = rich(mk(['roots'], 3), 30000), fastFar = rich(mk([], 3), 30000);
  assert.ok(Math.abs(flow(slowFar, 9, 400) - expectedFlow(9, 0.7, 400)) <= 1, 'but 30% fewer buyers beyond district 8');
  assert.ok(Math.abs(flow(fastFar, 9, 400) - expectedFlow(9, 1, 400)) <= 1);
  // the Tech Corridor bonus (+15%) counts too, from the first hour it is open
  const bonus = rich(mk([], 3), 60000);
  assert.equal(bonus.B.leadMult, 1.15);
  assert.ok(Math.abs(flow(bonus, 1, 400) - expectedFlow(1, 1.15, 400)) <= 1, 'x1.15 shows in the Scrap Yard too');
});

test('every level of Growth brings more buyers (the arrival rate is exact, not rounded to whole hours)', () => {
  // Once the cadence was Math.round(leadEvery * ECON.leadEvery / mult), so Growth levels 2, 4, 5, 6 and 7 did nothing (165, 165, 245, 245, 245, 245, 245, 485 buyers in 480 hours).
  const counts = [];
  for (let growth = 1; growth <= SKILL_MAX; growth++) { const g = mk([], 3); g.s.skills.growth = growth; counts.push(flow(g, 1, 480)); }
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] > counts[i - 1] * 1.04, `Growth ${i} -> ${i + 1}: ${counts[i - 1]} -> ${counts[i]} buyers (${counts.join(', ')})`);
  counts.forEach((n, i) => assert.ok(Math.abs(n - expectedFlow(1, 1 + 0.15 * i, 480)) <= 1, `Growth ${i + 1}: ${n}`));
});

test('buyers arrive no faster in a bad name: a failed pitch halves the Creator\'s flow, reputation moves it a little, and the flow never needs a whole number of hours', () => {
  const lo = mk([], 3), hi = mk([], 3); lo.s.rep = 0; hi.s.rep = 100;
  assert.ok(Math.abs(flow(lo, 1, 400) - expectedFlow(1, 0.85, 400)) <= 1); assert.ok(Math.abs(flow(hi, 1, 400) - expectedFlow(1, 1.15, 400)) <= 1);
});

test('lots appear at an exact average rate too, and a Background that refreshes them faster gets exactly that many more', () => {
  const lots = (perks, zone = 1, hours = 600) => { const g = mk(perks, 3); let n = 0; g.s.lots[zone] = []; for (let h = 0; h < hours; h++) { g.advanceTo(g.s.hour + 1); n += g.s.lots[zone].length; g.s.lots[zone] = []; } return n; };
  const rate = (zone, refresh = 0) => 1 / (ZONES[zone].lotEvery * ECON.lotEvery * (1 - refresh));
  assert.ok(Math.abs(lots([]) - 600 * rate(1)) <= 1, `${lots([])} vs ${600 * rate(1)}`);
  assert.ok(Math.abs(lots(['native']) - 600 * rate(1, 0.25)) <= 1);
  assert.ok(lots(['native']) / lots([]) > 1.25, 'a quarter fewer hours between lots is a third more lots');
});

test('a swap cannot push a district past its storage: roomIn counts held, in-transit and escrowed crates, and accepting refuses what does not fit', () => {
  const g = mk(); const cap = g.storeCap(1);
  assert.equal(g.roomIn(1), cap - 1, 'the starting paperclip');
  g.s.assets = []; for (let i = 0; i < cap - 2; i++) g.s.assets.push(g._mk(g.s, 'bike', { zone: 1 }));
  assert.equal(g.roomIn(1), 2);
  g.s.freight.push({ id: 'F1', items: [g._mk(g.s, 'bike', { zone: 1 })], to: 1, arrive: 99, risk: 0, book: 1, from: 2 });
  assert.equal(g.roomIn(1), 1, 'a crate on its way holds a place');
  const mate = g._mk(g.s, 'pen', { zone: 1 }); g.s.assets.push(mate);
  assert.equal(g.roomIn(1), 0);
  g.s.cash = 100;
  const incoming = (cls, id) => ({ cls, cond: 'ok', quality: 1, wear: 1, zone: 1, id });
  const offer = (give, want) => ({ id: 'Ox', from: 'P', fromHandle: 'P', give: { assets: give, cash: 0, royalty: null }, want, skills: {} });
  const pen = incoming('pen', 'z1');
  const cash = Math.round(g.sideValue({ assets: [pen] }) * 100) / 100;
  const full = g.acceptOffer(offer([pen], { assets: [], cash }));
  assert.equal(full.ok, false); assert.match(full.msg, /no room/i);
  assert.equal(g.s.cash, 100, 'nothing changed hands'); assert.equal(g.s.assets.length, cap - 2 + 1);
  // a one-for-one swap in a full district is fine: what leaves makes the room for what arrives
  const swap = g.acceptOffer(offer([pen], { assets: [g.pub(mate)], cash: 0 }));
  assert.ok(swap.ok, swap.msg); assert.equal(g.roomIn(1), 0);
  // two arriving for one leaving is not
  const two = g.acceptOffer(offer([incoming('pen', 'z2'), incoming('pen', 'z3')], { assets: [g.pub(g.s.assets.find((a) => a.id === g.s.assets.at(-1).id))], cash: 0 }));
  assert.equal(two.ok, false);
  // an asset from a district the founder cannot enter lands in the nearest open one, and that is where the room is counted
  const far = incoming('textbooks', 'z4'); far.zone = 5; g.s.cash = 1000;
  assert.equal(g.roomIn(1), 0);
  // (priced where it would sit, in this founder's hands: the audit's S5 found a price in the district they cannot enter was a 427% overpay, see tests/audit-engine-swaps.test.mjs)
  const off = g.acceptOffer(offer([far], { assets: [], cash: Math.round(g.sideValue({ assets: [far] }, { landing: true }) * 100) / 100 }));
  assert.equal(off.ok, false); assert.match(off.msg, new RegExp(ZONES[1].short));
});

test('BUG: proposing a swap for a crate you have no room for is refused (createOffer ignores the cap, so finalizeOffer overfills the proposer\'s district)', () => {
  // js/engine.js createOffer checks nothing about the room for the crates it asks for; the other side accepts, and finalizeOffer pushes them in regardless.
  const A = mk([], 1), B = mk([], 2); A.s.pid = 'AAA'; B.s.pid = 'BBB';
  const cap = A.storeCap(1); A.s.assets = []; for (let i = 0; i < cap; i++) A.s.assets.push(A._mk(A.s, 'bike', { zone: 1 }));
  A.s.cash = 100;
  const pen = putAsset(B, 'pen', 1);
  const offer = A.createOffer({ to: 'BBB', giveIds: [], giveCash: 3, want: { assets: [B.pub(pen)], cash: 0 } });
  if (offer.ok) { const acc = B.acceptOffer(offer.offer); if (acc.ok) A.finalizeOffer(offer.offer.id, acc.deliver); }
  assert.ok(A.s.assets.filter((a) => a.zone === 1).length <= cap, `${A.s.assets.length} crates in a district that holds ${cap} (offer ok: ${offer.ok})`);
});

test('offers disclose the truth: what leaves for a classmate is worth what it truly is, the hidden fields stay behind, and a fake cannot be swapped for a real crate', () => {
  const A = mk([], 1), B = mk([], 2); A.s.pid = 'AAA'; B.s.pid = 'BBB';
  rich(A, 3000); rich(B, 3000);
  const genuine = putAsset(B, 'textbooks', 5); const want = B.pub(genuine);
  const fake = putAsset(A, 'textbooks', 5, { truth: { q: 1, fake: true, defects: [] } }), flawed = putAsset(A, 'textbooks', 5, { truth: { q: 0.7, fake: false, defects: [{ id: 'd0', label: 'worn finish' }] } });
  A.s.assets.find((a) => a.id === flawed.id).belief = { quality: 0.9, fakeProb: 0.1, confidence: 0.5 };
  // the described value of both is the same as the real thing's, but a fake dressed as a real crate is blocked by the 40% guardrail
  const blocked = A.createOffer({ to: 'BBB', giveIds: [fake.id], want: { assets: [want], cash: 0 } });
  assert.equal(blocked.ok, false); assert.match(blocked.msg, /Extreme Asymmetric Premium/);
  assert.ok(A.s.assets.some((a) => a.id === fake.id), 'and it stays with its owner');
  // a flawed crate goes out at its true quality
  const cash = Math.round(A.val(flawed) * 0.7 * 100) / 100;
  const off = A.createOffer({ to: 'BBB', giveIds: [flawed.id], giveCash: 0, want: { assets: [], cash } });
  assert.ok(off.ok, off.msg);
  const sent = off.offer.give.assets[0];
  assert.equal('truth' in sent, false); assert.equal('belief' in sent, false);
  assert.equal(sent.known, true); rel(sent.quality, 0.7);
  rel(A.sideValue(off.offer.give), A.val({ ...flawed, known: true }), 1e-9);
  assert.ok(A.s.escrow[0].assets[0].truth, 'the escrow keeps the original with its truth');
  const acc = B.acceptOffer(off.offer);
  assert.ok(acc.ok, acc.msg);
  const got = B.s.assets.find((a) => a.from === 'p2p');
  assert.equal(got.truth, undefined); assert.equal(got.known, true);
  near(B.val(got), A.val({ ...flawed, known: true }), 1e-9);
  // withdrawing gives the original back, truth and all
  const C = mk([], 3); rich(C, 3000);
  const keep = putAsset(C, 'textbooks', 5, { truth: { q: 0.9, fake: false, defects: [] } });
  const o2 = C.createOffer({ to: 'X', giveIds: [keep.id], want: { assets: [{ cls: 'textbooks', cond: 'ok', quality: 0.9, wear: 1, zone: 5, id: 'q' }], cash: 0 } });
  assert.ok(o2.ok, o2.msg);
  C.cancelOffer(o2.offer.id);
  const back = C.s.assets.find((a) => a.id === keep.id);
  assert.deepEqual(back.truth, { q: 0.9, fake: false, defects: [] }); assert.equal(back.known, false);
  // a crate with no hidden truth (the starting paperclip) just keeps its quality
  const clip = mk(); const o3 = clip.createOffer({ to: 'X', giveIds: [clip.s.assets[0].id], giveCash: 0, want: { assets: [{ cls: 'paperclip', cond: 'ok', quality: 1, wear: 1, zone: 1, id: 'q' }], cash: 0 } });
  assert.ok(o3.ok); assert.equal(o3.offer.give.assets[0].quality, 1);
});

test('passLead and passLot: a buyer who walks away, or a lot lost at auction, leaves the district; nothing else does', () => {
  const g = mk(); g.s.cash = 10;
  const lead = g.s.leads[1][0], other = g.s.leads[1][1], lot = g.s.lots[1][0], otherLot = g.s.lots[1][1];
  const n = g.s.leads[1].length, m = g.s.lots[1].length, notes = g.s.news.length;
  const r = g.passLead(1, lead.id);
  assert.ok(r.ok); assert.equal(g.s.leads[1].length, n - 1); assert.ok(!g.s.leads[1].some((l) => l.id === lead.id) && g.s.leads[1].some((l) => l.id === other.id));
  assert.equal(g.s.news.length, notes, 'silent without a reason');
  assert.equal(g.passLead(1, lead.id).ok, false, 'gone is gone'); assert.match(g.passLead(1, lead.id).msg, /left/);
  assert.equal(g.passLead(99, 'x').ok, false); assert.equal(g.passLead(1, 'nobody').ok, false);
  const walked = g.passLead(1, other.id, 'The buyer walked away from your price.');
  assert.ok(walked.ok); assert.equal(g.s.news[0].text, 'The buyer walked away from your price.');
  const l = g.passLot(1, lot.id);
  assert.ok(l.ok); assert.equal(g.s.lots[1].length, m - 1); assert.ok(g.s.lots[1].some((x) => x.id === otherLot.id));
  assert.equal(g.passLot(1, lot.id).ok, false); assert.equal(g.passLot(1, 'nobody').ok, false);
  assert.equal(g.buyLot(1, lot.id).ok, false, 'a passed lot cannot be bought');
  const lost = g.passLot(1, otherLot.id, 'Another bidder won it.');
  assert.ok(lost.ok); assert.equal(g.s.news[0].text, 'Another bidder won it.');
  assert.equal(g.pitch(g.s.assets[0].id, lead.id).ok, false, 'a passed buyer cannot be pitched');
});

test('blind quotes show what a player may see: no hidden truth and no undisclosed fraud; the sale itself is never blind', () => {
  const g = rich(mk(['native'], 3), 3000); g.s.assets = [];
  const twin = putAsset(g, 'textbooks', 5);
  const fake = putAsset(g, 'textbooks', 5, { truth: { q: 1, fake: true, defects: [] } }), flawed = putAsset(g, 'textbooks', 5, { truth: { q: 0.7, fake: false, defects: [] } });
  g.s.leads[5].push({ id: 'Lg', zone: 5, seg: 'trainer', budget: 1e12, need: null, born: 0, exp: 999 }, { id: 'Ls', zone: 5, seg: 'trainer', budget: 1e12, need: null, born: 0, exp: 999, scam: true });
  const before = JSON.stringify(g.s);
  const blind = (a, l) => g.quotePitch(a.id, l, undefined, { blind: true }), full = (a, l) => g.quotePitch(a.id, l, undefined, REAL);
  // quotes are blind by default: the plain call is the blind one
  assert.equal(g.quotePitch(fake.id, 'Lg').rejected, false); assert.equal(g.quotePitch(fake.id, 'Lg').price, blind(fake, 'Lg').price); assert.equal(g.quotePitch(twin.id, 'Ls').scam, false);
  // a fake looks like its twin to a blind quote, and to nobody else
  assert.equal(blind(fake, 'Lg').rejected, false); assert.equal(blind(fake, 'Lg').reason, null); assert.equal(blind(fake, 'Lg').price, blind(twin, 'Lg').price);
  assert.equal(full(fake, 'Lg').rejected, true); assert.equal(full(fake, 'Lg').reason, 'counterfeit');
  // a flaw is invisible to a blind quote, and costs 30% to a real one
  assert.equal(blind(flawed, 'Lg').price, blind(twin, 'Lg').price); rel(full(flawed, 'Lg').price / full(twin, 'Lg').price, 0.7, 1e-12);
  // an unverified fraud does not announce itself
  assert.equal(blind(twin, 'Ls').scam, false); assert.equal(full(twin, 'Ls').scam, true);
  assert.equal('scam' in blind(twin, 'Ls').lead, false, 'the buyer handed back is not marked either'); assert.equal(full(twin, 'Ls').lead.scam, true);
  assert.equal(JSON.stringify(g.s), before, 'quoting changes nothing');
  assert.equal(fake.known, false);
  // the real thing is not blind
  assert.equal(g.pitch(fake.id, 'Lg').outcome, 'rejected'); assert.equal(fake.known, true);
  g.s.leads[5].push({ id: 'Lg2', zone: 5, seg: 'trainer', budget: 1e12, need: null, born: 0, exp: 999 });
  assert.equal(g.quotePitch(fake.id, 'Lg2', undefined, { blind: true }).rejected, true, 'once the truth is out a blind quote shows it too');
  assert.equal(g.pitch(twin.id, 'Ls').outcome, 'scam', 'and a fraud still takes the goods');
  // a verified fraud is out of the question for both kinds of quote; a genuine buyer is fine
  g.s.leads[5].push({ id: 'Lv', zone: 5, seg: 'trainer', budget: 500, need: null, born: 0, exp: 999, scam: true });
  assert.equal(g.verifyLead('Lv').scam, true);
  for (const opts of [undefined, { blind: true }]) { const q = g.quotePitch(flawed.id, 'Lv', undefined, opts); assert.equal(q.ok, false); assert.match(q.msg, /fraud/); }
  g.s.leads[5].push({ id: 'Lg3', zone: 5, seg: 'trainer', budget: 1e12, need: null, born: 0, exp: 999 });
  assert.equal(blind(flawed, 'Lg3').ok, true);
  // the options argument is optional and ignored when not an object of the right kind
  assert.equal(g.quotePitch(flawed.id, 'Lg3', undefined, {}).price, blind(flawed, 'Lg3').price);
  assert.equal(g.quotePitch(flawed.id, 'Lg3', undefined, { blind: false }).price, full(flawed, 'Lg3').price);
});

// ---------------------------------------------------------------------------------------------------- scams
test('Digital Native: about 18% of buyers are fraudulent; every other Background meets none', () => {
  const count = (perks, trades = 3) => { let n = 0, s = 0; for (let seed = 1; seed <= 60; seed++) { const g = mk(perks, seed); g.s.trades = trades; for (let i = 0; i < 40; i++) { g.s.leads[1] = []; g._spawnLead(1); n++; if (g.s.leads[1][0].scam) s++; } } return { n, s }; };
  const nat = count(['native', 'pro']), other = count(['trades', 'pro']);
  assert.ok(Math.abs(nat.s / nat.n - 0.18) < 4.5 * sd(0.18, nat.n) / nat.n, `${nat.s} of ${nat.n}`);
  assert.equal(other.s, 0);
  assert.equal(count(['native', 'pro'], 2).s, 0, 'no fraud before the third trade (audit F3: a first sale to a fraud ended the run at $0)');
});

test('an unverified fraudulent buyer takes the goods and never pays; a verified genuine buyer pays as usual', () => {
  const g = mk(['native'], 3); g.s.cash = 5;
  const ev = log(g);
  const a = g.s.assets[0];
  const lead = (id, scam) => { const l = { id, zone: 1, seg: 'student', budget: 8, need: null, born: 0, exp: 999, ...(scam ? { scam: true } : {}) }; g.s.leads[1].push(l); return l; };
  lead('Lscam', true); lead('Lgood', false);
  const q = g.quotePitch(a.id, 'Lscam', undefined, REAL);
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
  putAsset(g, 'pen', 1);
  assert.equal(g.verifyLead('Lc').ok, false, 'no cash, no check');
  g.s.assets = g.s.assets.slice(0, 1); // ...unless the buyer is about to take the founder's last crate: then there is nothing to protect with the cash, and the check is free
  const free = g.verifyLead('Lc'); assert.equal(free.ok, true); assert.equal(free.cost, 0); assert.equal(g.s.cash, 0.001);
  assert.ok(g.s.ledger.some((e) => e.type === 'verify'));
});

test('a buyer confirmed as fraudulent cannot then be sold to (verifying used to turn a fraudster into a paying customer)', () => {
  // quotePitch had `scam: !!lead.scam && !lead.verified`, and verifyLead says "Skip this buyer".
  const g = mk(['native'], 3); g.s.cash = 5;
  g.s.leads[1].push({ id: 'Lscam', zone: 1, seg: 'student', budget: 8, need: null, born: 0, exp: 999, scam: true });
  assert.equal(g.verifyLead('Lscam').scam, true);
  const a = g.s.assets[0], cash = g.s.cash;
  const q = g.quotePitch(a.id, 'Lscam');
  assert.equal(q.ok, false); assert.match(q.msg, /fraud/);
  const r = g.pitch(a.id, 'Lscam');
  assert.equal(r.ok, false, 'selling to a confirmed fraudster is refused: ' + r.outcome);
  assert.ok(g.s.assets.some((x) => x.id === a.id), 'the goods stay where they are');
  assert.equal(g.s.cash, cash, 'no money from a fraudster'); assert.ok(g.s.leads[1].some((l) => l.id === 'Lscam'), 'the player decides what to do with the lead');
  assert.equal(g.passLead(1, 'Lscam').ok, true, 'and may send them away');
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

test('a game restored into a fresh Cohort (as Session.restore does) plays on exactly as one that never stopped', async () => {
  // Cohort.counts once kept the numbers computed at the FIRST hour asked in each 6-hour bucket, so a restored game (empty cache) drifted from the uninterrupted run ($64,819 vs $31,740 after ten more days).
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

test('after a rewind the same days replay the same way (the cohort no longer remembers the first timeline)', () => {
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
  near(-take.amt, q.profit * 0.05, 1e-9); near(g.s.ps.garnished, q.profit * 0.05, 1e-9);
  near(g.s.cash, q.change - q.profit * 0.05, 1e-9);
});
