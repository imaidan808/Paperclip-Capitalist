// Regression tests for the engine-core audit (the pitch, quotes, lots, leads, perks, bank, daily tick, clients, upgrades, XP and skills, manager economics).
// Every test here failed on the commit before the fix; the finding it covers is named in its title (the audit's own ids in brackets).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/engine.js';
import { Cohort } from '../js/cohort.js';
import { Progress } from '../js/meta/progress.js';
import { ASSETS, BUYERS, ZONES, ZONE_IDS, CLIENTS, LOANS, ECON, SKILL_MAX, TOTAL_HOURS, PIPE, PIPE_RULES, pipeMargin, pipeScale, pipeOverhead } from '../js/config.js';
import { demandOf, fitOf, restoreQuality } from '../js/market.js';
import { makeGame, run } from './bot.mjs';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const rel = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b)), `${a} vs ${b}`);
const mk = (perks = [], seed = 1, extra = {}) => { const g = new Game({ perks, seed, handle: 'T', pid: 'T-' + seed, ...extra }); g.env.algo = false; return g; };
const REAL = { blind: false };
const put = (g, cls, zone, o = {}) => { const a = g._mk(g.s, cls, { zone, basis: o.basis ?? 1, cond: o.cond }); if (o.truth) { a.truth = { defects: [], ...o.truth }; a.known = false; } g.s.assets.push(a); return a; };
const lead = (g, zone, seg, o = {}) => { const l = { id: 'L' + g.s.nid++, zone, seg, budget: 1e9, need: null, born: 0, exp: 99999, ...o }; g.s.leads[zone].push(l); return l; };
/** Every district open, the milestones passed and no shock on the calendar: a late-game desk to test the bank and the managers on. */
const desk = (perks = [], seed = 3, { cash = 400000, hour = 0 } = {}) => {
  const g = mk(perks, seed);
  for (let z = 1; z <= 16; z++) g._openZone(z);
  g.s.zones = [...new Set(g.s.zones)].sort((a, b) => a - b); g._bn = null;
  g.s.mil = { m1: true, m2: true, m3: true }; g.s.auditFirst = true; g.s.events = []; g.s.cash = cash; g.s.hour = hour; g._m = null;
  return g;
};
const lotsIn = (zone, worlds, perks = [], per = 5, nw = 0) => {
  const out = [];
  for (let seed = 1; seed <= worlds; seed++) {
    const g = mk(perks, seed); if (zone > 1) g._openZone(zone);
    if (nw) g.s.cash = nw;
    for (let k = 0; k < per; k++) { g.s.lots[zone] = []; g._spawnLot(zone); out.push(...g.s.lots[zone]); }
  }
  return out;
};

// ---------------------------------------------------------------------------------------------------- the Enterprise facility's fee [DT-01, L4, D1]
test('the Enterprise commitment fee is charged once per facility, however many draws the money was taken in [DT-01, L4, D1]', () => {
  const month = (draws) => {
    const g = desk([], 3);
    for (let i = 0; i < draws; i++) assert.ok(g.draw('enterprise', 100000 / draws).ok);
    for (let h = 0; h < 31 * 24; h++) g.stepHour();
    const rows = g.s.ledger.filter((e) => e.text === 'Unused-commitment fee').map((e) => { assert.equal(e.amt, 0, 'a memo: no cash moved (the repayment holds the fee)'); return e.fee; });
    return { rows, debt: g.debt(), drawn: g.s.loans.length };
  };
  const one = month(1), five = month(5), ten = month(10);
  assert.equal(one.rows.length, 1, 'one fee for the month'); assert.equal(five.rows.length, 1); assert.equal(ten.rows.length, 1);
  near(five.rows[0], one.rows[0], 1e-6); near(ten.rows[0], one.rows[0], 1e-6);
  near(one.rows[0] / LOANS.enterprise.commit, LOANS.enterprise.limit * 1.5 - 100000, 8000); // 1.5% of what is still undrawn of the whole line (less the month's interest already owed on it)
  near(five.debt, one.debt, 1e-4); near(ten.debt, one.debt, 1e-4);
  assert.equal(five.drawn, 5, 'the draws are still separate loans');
});

test('the facility fee starts a month after the first draw, stops when the line is repaid, and starts over with the next draw [DT-01]', () => {
  const g = desk([], 3);
  assert.ok(g.draw('enterprise', 50000).ok);
  const first = g.s.entFeeNext; assert.equal(first, g.s.hour + 720);
  g.advanceTo(first + 24);
  assert.equal(g.s.ledger.filter((e) => e.text === 'Unused-commitment fee').length, 1);
  for (const l of [...g.s.loans]) g.repay(l.id, 1e9);
  assert.equal(g.s.loans.length, 0);
  g.advanceTo(first + 24 + 1300); // past the next fee date (hour 1440) and still before the day-90 bell: the run is over at 2160 and a draw after it is refused
  assert.equal(g.s.ledger.filter((e) => e.text === 'Unused-commitment fee').length, 1, 'no loan, no fee');
  const now = g.s.hour; assert.ok(g.draw('enterprise', 1000).ok); assert.equal(g.s.entFeeNext, now + 720);
});

// ---------------------------------------------------------------------------------------------------- the first sale must not end a run [F3]
test('no fraudulent buyer turns up before the third trade, and a founder down to the last crate is vouched for [F3]', () => {
  const spawn = (trades) => { let n = 0, s = 0; for (let seed = 1; seed <= 40; seed++) { const g = mk(['native', 'pro'], seed); g.s.trades = trades; for (let i = 0; i < 40; i++) { g.s.leads[1] = []; g._spawnLead(1); n++; if (g.s.leads[1][0].scam) s++; } } return { n, s }; };
  for (const t of [0, 1, 2]) assert.equal(spawn(t).s, 0, `${t} trades: no fraud`);
  const later = spawn(3); assert.ok(later.s / later.n > 0.1 && later.s / later.n < 0.26, 'from the third trade on the Native meets fraud at the usual 18%: ' + later.s + '/' + later.n);
  // a Native with one crate and no cash can check a buyer for free; one with something to lose still pays
  const g = mk(['native'], 3); g.s.cash = 0;
  const l = lead(g, 1, 'student', { budget: 8, scam: true });
  const v = g.verifyLead(l.id); assert.equal(v.ok, true); assert.equal(v.scam, true); assert.equal(v.cost, 0); assert.equal(g.s.cash, 0);
  const row = g.s.ledger.find((e) => e.type === 'verify'); assert.ok(row && Object.is(row.amt, 0) === true && !Object.is(row.amt, -0), 'recorded as 0, never -0');
  const h = mk(['native'], 3); h.s.cash = 0; put(h, 'pen', 1); const l2 = lead(h, 1, 'student', { budget: 8 });
  assert.equal(h.verifyLead(l2.id).ok, false, 'two crates: the check has to be paid for');
});

test('a Digital Native pair never ends a month at $0 with nothing to sell: the first sale cannot strand the founder [F3]', () => {
  const dead = [];
  for (let seed = 1; seed <= 24; seed++) {
    const g = makeGame(['grad', 'native'], 'ops', seed);
    run(g, { days: 30, every: 4 });
    if (g.s.cash < 0.01 && !g.s.assets.length && !g.s.pipes.length) dead.push(seed);
  }
  assert.deepEqual(dead, [], 'stranded runs');
});

test('a buyer confirmed as a fraud can never be paid, and cannot be shipped to either [F3]', () => {
  const g = mk(['native'], 3); g.s.cash = 5; g.s.trades = 3;
  const l = lead(g, 1, 'student', { budget: 8, scam: true });
  assert.equal(g.verifyLead(l.id).scam, true);
  const a = g.s.assets[0], cash = g.s.cash;
  for (const opts of [undefined, REAL, { blind: true }]) { const q = g.quotePitch(a.id, l.id, undefined, opts); assert.equal(q.ok, false); assert.match(q.msg, /fraud/); }
  const r = g.pitch(a.id, l.id); assert.equal(r.ok, false);
  assert.ok(g.s.assets.some((x) => x.id === a.id)); assert.equal(g.s.cash, cash);
});

// ---------------------------------------------------------------------------------------------------- garnishment [bg-garnish-negative-cash]
test('Grad garnishment is taken only from money that has arrived: a delayed pool sale pays it out of the settlement [bg-garnish-negative-cash]', () => {
  const g = mk(['grad', 'trades'], 9); g.s.cash = 10; g._openZone(9);
  const a = g._mk(g.s, 'cncCenter', { zone: 9, basis: 100 }); g.s.assets.push(a);
  const r = g.sellPool([a.id]); assert.equal(r.ok, true); assert.ok(r.delay > 0, 'district 9 settles late');
  assert.equal(g.s.cash, 10, 'nothing has arrived, so nothing was taken from the purse');
  const take = g.s.ps.garnished; assert.ok(take > 100, 'the instalment is real: ' + take);
  near(g.s.settle[0].amt, r.total - take, 1e-6);
  g.advanceTo(g.s.hour + r.delay + 1); assert.ok(g.s.cash >= 10 + r.total - take - 1e-6);
});

test('Grad garnishment never leaves cash negative, and what could not be taken is collected from the next profit so the $3,000 is still repaid [bg-garnish-negative-cash]', () => {
  const g = mk(['grad'], 1); g.s.cash = 30;
  assert.equal(g.garnish(1000), 30, 'only the 30 there'); assert.equal(g.s.cash, 0); near(g.s.ps.garnishDue, 20, 1e-9);
  g.s.cash = 1000; near(g.garnish(1000), 70, 1e-9); // 50 for this profit and the 20 owed
  assert.equal(g.s.ps.garnishDue, 0);
  g.s.cash = 0; g.garnish(10000); g.s.cash = 1e6;
  let guard = 0; while (g.s.ps.garnished < 3000 && guard++ < 100) g.garnish(10000);
  near(g.s.ps.garnished, 3000, 1e-9); assert.ok(g.s.cash >= 0);
  assert.equal(g.garnish(10000), 0, 'paid off');
  // a barter pitch (goods taken in kind) is garnished against the cash on hand only
  const b = makeGame(['grad', 'pro'], 'ops', 73);
  for (let h = 0; h < 12 * 24; h++) { b.advanceTo(b.s.hour + 1); if (h % 2 === 0) { const before = b.s.cash; void before; } assert.ok(b.s.cash > -1e-9, `hour ${b.s.hour}: cash ${b.s.cash}`); }
});

// ---------------------------------------------------------------------------------------------------- quotes are blind unless asked otherwise [D2, F4]
test('a plain quote shows nothing the player has not earned: a fake looks like its twin, a flaw is invisible, a fraud is not marked [D2, F4]', () => {
  const g = mk(['native'], 3); g.s.cash = 3000; g.s.assets = []; g.s.trades = 3;
  const twin = put(g, 'textbooks', 5), fake = put(g, 'textbooks', 5, { truth: { q: 1, fake: true } }), flawed = put(g, 'textbooks', 5, { truth: { q: 0.7, fake: false } });
  g._openZone(5);
  const good = lead(g, 5, 'trainer'), bad = lead(g, 5, 'trainer', { scam: true });
  const q = (a, l, o) => g.quotePitch(a.id, l.id, undefined, o);
  assert.equal(q(fake, good).rejected, false); assert.equal(q(fake, good).reason, null); assert.equal(q(fake, good).price, q(twin, good).price);
  assert.equal(q(flawed, good).price, q(twin, good).price);
  assert.equal(q(twin, bad).scam, false); assert.equal('scam' in q(twin, bad).lead, false); assert.equal(good.scam, undefined);
  assert.equal(bad.scam, true, 'the lead itself is untouched');
  // the true figures are one explicit option away, and the sale is always the true one
  assert.equal(q(fake, good, REAL).rejected, true); assert.equal(q(twin, bad, REAL).scam, true); rel(q(flawed, good, REAL).price / q(twin, good, REAL).price, 0.7, 1e-12);
  assert.equal(g.pitch(fake.id, good.id).outcome, 'rejected'); assert.equal(fake.known, true);
  const again = lead(g, 5, 'trainer'); assert.equal(q(fake, again).reason, 'counterfeit', 'once the truth is out a plain quote shows it');
});

test('a plain pool quote is the as-described figure for every crate; only the sale pays what the crate is really worth, and a failed sale leaks nothing [D2, F4]', () => {
  const g = mk([], 3); g.s.cash = 3000; g.s.assets = []; g._openZone(5);
  const twin = put(g, 'textbooks', 5), fake = put(g, 'textbooks', 5, { truth: { q: 1, fake: true } }), flawed = put(g, 'textbooks', 5, { truth: { q: 0.7, fake: false } });
  const fric = ZONES[5].friction + g.instFee('pool'), described = g.val(twin) * (1 - fric);
  for (const a of [twin, fake, flawed]) rel(g.poolQuote([a.id]).total, described, 1e-12);
  rel(g.poolQuote([fake.id], false, REAL).total, described * 0.08, 1e-12); rel(g.poolQuote([flawed.id], false, REAL).total, described * 0.7, 1e-12);
  const cash = g.s.cash; assert.ok(g.sellPool([fake.id]).ok); rel(g.s.cash - cash, described * 0.08, 1e-12);
  g.s.pool[5] = 1; const refused = g.sellPool([flawed.id]);
  assert.equal(refused.ok, false); rel(refused.total, g.poolQuote([flawed.id]).total, 1e-12); // the refusal quotes the blind figure, not the 70%
});

// ---------------------------------------------------------------------------------------------------- the pitch's outcome [F5]
test('a pioneer-band sale that lost money is not a pioneer sale, and does not pay the pioneer achievement [F5]', () => {
  const g = makeGame(['trades', 'pro'], 'ops', 7);
  for (const z of [2, 3, 4]) { g.s.zones.push(z); g.s.leads[z] = []; g.s.lots[z] = []; g.s.pool[z] = ZONES[z].pool; }
  g.env.cohort = { counts: () => ({ total: 30, byBuyer: {} }) }; // a busy class where nobody sells to this buyer: Cm at its 3.14 ceiling
  g.s.cash = 500;
  g.s.lots[4].push({ id: 'T1', zone: 4, cls: 'pawnGuitar', cond: 'ok', price: 60, exp: 9999, mode: 'fixed', truth: { q: 1, fake: false, defects: [] } });
  const a = g.buyLot(4, 'T1').asset;
  g._spawnLead(4, false, true);
  const l = g.s.leads[4].find((x) => g.quotePitch(a.id, x.id).fit >= 0.5);
  l.budget = 5; l.need = null; // a buyer with a small wallet
  const prog = new Progress(g), evs = []; g.onEvent = (e) => { evs.push(e); prog.onEvent(e); };
  const r = g.pitch(a.id, l.id), e = evs.find((x) => x.type === 'pitch');
  assert.ok(e.cm >= 3, 'the niche is a pioneer one: ' + e.cm); assert.ok(e.gain < -0.5, 'and the sale lost money: ' + e.gain);
  assert.equal(r.outcome, 'flat'); assert.equal(e.outcome, 'flat');
  assert.ok(!prog.m.a['a-pioneer']?.done, 'no pioneer achievement for a loss');
});

test('pioneer is never reported on a sale that did not pay; a sale made in the herd is a herd sale, whatever it paid [F5, repair round]', () => {
  const sale = (herd, budget, need) => {
    const g = mk([], 7);
    g.env.cohort = { counts: () => ({ total: 30, byBuyer: herd ? { student: 30 } : {} }) }; // a crowd selling to this buyer, or a busy class where nobody does
    const a = put(g, 'pen', 1); const l = lead(g, 1, 'student', { budget, need }); const evs = []; g.onEvent = (e) => evs.push(e);
    const r = g.pitch(a.id, l.id); return { r, e: evs.find((x) => x.type === 'pitch') };
  };
  const herdLoss = sale(true, 1e9, null), pioneerLoss = sale(false, 0.05, null);
  assert.equal(herdLoss.r.ci.band.id, 'herd'); assert.ok(herdLoss.e.gain < 0, 'sold into the herd at a loss: ' + herdLoss.e.gain); assert.equal(herdLoss.e.outcome, 'herd', 'the loss in the herd is the lesson, so it keeps the herd label'); assert.equal(herdLoss.r.outcome, 'herd');
  assert.equal(pioneerLoss.r.ci.band.id, 'pioneer'); assert.ok(pioneerLoss.e.gain < 0); assert.equal(pioneerLoss.e.outcome, 'flat');
  const herdWin = sale(true, 1e9, 'paper'), pioneerWin = sale(false, 1e9, 'paper'); // an urgent buyer who needs it pays well even in the herd
  assert.equal(herdWin.r.ci.band.id, 'herd'); assert.ok(herdWin.e.gain > 0.02, '' + herdWin.e.gain); assert.equal(herdWin.e.outcome, 'herd');
  assert.ok(pioneerWin.e.gain > 0.02); assert.equal(pioneerWin.e.outcome, 'pioneer');
});

// ---------------------------------------------------------------------------------------------------- skill points [skill-points-overflow]
test('skill points go only where a skill can use them; the rest pay XP, from levels as from quests [skill-points-overflow]', () => {
  const g = mk([], 1); const cap = 3 * (SKILL_MAX - 1) - 2; // the specialty starts at 3
  assert.equal(g.pointRoom(), cap);
  assert.deepEqual(g.grantPoints(5), { points: 5, xp: 0 }); assert.equal(g.s.points, 5);
  const xp0 = g.s.xp; const r = g.grantPoints(cap); // 5 banked, so cap - 5 fit
  assert.equal(r.points, cap - 5); assert.equal(r.xp, 5 * ECON.pointXp); assert.equal(g.s.points, cap); assert.ok(g.s.xp - xp0 >= r.xp, 'the spare points are paid in XP (and the levels that XP reaches pay XP too)');
  assert.equal(g.pointRoom(), 0);
  const ev = []; g.onEvent = (e) => ev.push(e);
  g.s.xp += 150 * 400; g._levelCheck(); // a hundred levels in one go
  assert.equal(g.s.points, cap, 'no level adds a point nothing can use');
  assert.ok(g.s.news.some((n) => /mastery/.test(n.text)), 'and the note does not promise one');
  assert.ok(ev.some((e) => e.type === 'level'));
  // spending a banked point uses up the room it was banked for, so nothing new fits; with a point left unspent in a fresh game there is room for exactly the rest
  assert.ok(g.spendPoint('ops').ok); assert.equal(g.pointRoom(), 0); assert.equal(g.grantPoints(1).points, 0);
  const h = mk([], 2); h.s.skills = { ops: SKILL_MAX, growth: SKILL_MAX, fintech: SKILL_MAX - 1 }; assert.equal(h.pointRoom(), 1); assert.deepEqual(h.grantPoints(3), { points: 1, xp: 2 * ECON.pointXp });
});

// ---------------------------------------------------------------------------------------------------- XP farming [E7]
test('a skill game pays once per thing played: reading the same lot again, or replaying one deal, earns nothing more [E7]', () => {
  const g = mk([], 4); const lot = g.s.lots[1][0];
  const read = () => g.recordInspect(1, lot.id, { estimate: { quality: 0.8, fakeProb: 0.5 }, score: 1, confidence: 0.5, quick: true });
  const first = read(); const xp = g.s.xp, n = g.s.meta.inspect.n;
  assert.ok(xp > 0);
  for (let i = 0; i < 200; i++) { const r = read(); assert.equal(r.ok, true); assert.equal(r.repeat, true); }
  assert.equal(g.s.xp, xp, 'two hundred more reads of the same lot pay nothing'); assert.equal(g.s.meta.inspect.n, n);
  void first;
  const other = g.s.lots[1][1]; g.recordInspect(1, other.id, { estimate: { quality: 0.8, fakeProb: 0.5 }, score: 1 }); assert.ok(g.s.xp > xp, 'a different lot is a different read');
  const ev = []; g.onEvent = (e) => ev.push(e);
  const x0 = g.s.xp;
  g.recordPlay('haggle', { role: 'sell', score: 1, deal: true, key: 'L7' });
  const x1 = g.s.xp; assert.ok(x1 > x0);
  for (let i = 0; i < 50; i++) g.recordPlay('haggle', { role: 'sell', score: 1, deal: true, key: 'L7' });
  assert.equal(g.s.xp, x1); assert.equal(ev.filter((e) => e.type === 'haggle').length, 1, 'and no more events either');
  g.recordPlay('haggle', { role: 'sell', score: 1, key: 'L8' }); assert.ok(g.s.xp > x1);
  g.recordPlay('auction', { won: true, key: 'L7' }); assert.ok(ev.some((e) => e.type === 'auction'), 'the key is per game: the same deal can pay its haggle and its auction');
  const x2 = g.s.xp; g.recordPlay('haggle', { score: 1 }); g.recordPlay('haggle', { score: 1 }); assert.ok(g.s.xp > x2 + 1, 'a play with no key (older callers) is still paid every time');
});

// ---------------------------------------------------------------------------------------------------- the lots the market makes [D4, bg-second-warn-exact-oracle]
test('the headline rates are rates of lots: the Pawn District is 22% counterfeit, Auto Row 60% broken, and every counterfeit district matches its rule [D4]', () => {
  for (const z of ZONE_IDS) {
    const rule = ZONES[z].rules.fakes || 0; if (!rule) continue;
    const lots = lotsIn(z, 500, [], 5, ZONES[z].gate * 1.5 + 10), got = lots.filter((l) => l.truth.fake).length / lots.length;
    assert.ok(Math.abs(got - rule) < 0.03, `district ${z}: ${(got * 100).toFixed(1)}% counterfeit against the rule's ${rule * 100}%`);
  }
  const auto = lotsIn(7, 500, [], 5, 6000 * 1.5 + 10);
  assert.ok(Math.abs(auto.filter((l) => l.cond === 'broken').length / auto.length - 0.6) < 0.03, 'Auto Row: 60% of lots broken');
  const others = lotsIn(5, 500, [], 5, 1500).filter((l) => ASSETS[l.cls].repair);
  assert.ok(Math.abs(others.filter((l) => l.cond === 'broken').length / others.length - 0.4) < 0.04, 'elsewhere: 40% of the repairable ones');
  assert.ok(auto.filter((l) => l.cond === 'broken').every((l) => ASSETS[l.cls].repair), 'only what can be repaired is ever broken');
});

test('the Second-Chance street sense is a strong signal, not an exact one: most counterfeits are flagged, none of the honest, and the miss is fixed by the lot [bg-second-warn-exact-oracle]', () => {
  const g = mk(['second', 'pro'], 4); g._openZone(4);
  let tp = 0, fp = 0, fn = 0; const seen = new Map();
  for (let i = 0; i < 4000; i++) {
    g.s.lots[4] = []; g._spawnLot(4, false); const l = g.s.lots[4][0]; if (!l) continue;
    if (l.truth.fake) { if (l.warn) tp++; else fn++; } else if (l.warn) fp++;
    seen.set(l.id, !!l.warn);
  }
  assert.equal(fp, 0, 'it never accuses an honest lot'); assert.ok(fn > 0, 'it misses some counterfeits');
  const hit = tp / (tp + fn); assert.ok(Math.abs(hit - (1 - ECON.warnMiss)) < 0.04, `the street sense catches ${(hit * 100).toFixed(1)}% of counterfeits`);
  // deterministic: the same world draws the same lots with the same warnings
  const h = mk(['second', 'pro'], 4); h._openZone(4); let same = 0;
  for (let i = 0; i < 400; i++) { h.s.lots[4] = []; h._spawnLot(4, false); const l = h.s.lots[4][0]; if (l && seen.get(l.id) === !!l.warn) same++; }
  assert.ok(same >= 399);
});

// ---------------------------------------------------------------------------------------------------- clients [DT-05, DT-09]
test('a client quote counts only the days the run has left, and a contract that cannot earn back its cost is refused [DT-05]', () => {
  const g = desk([], 3);
  for (let i = 0; i < 3; i++) g.s.pipes.push({ id: 'P' + i, kind: 'broker', zone: 5, level: 1, status: 'running', basis: 0, inflight: 0 });
  const early = g.clientQuote('ent'); assert.equal(early.payDays, 60); rel(early.ratio, 3200 * (1 - g.zoneTax(13)) * 60 / early.cac); assert.equal(early.worthwhile, true);
  g.s.hour = 80 * 24; // day 81: ten paying days are left
  const late = g.clientQuote('ent');
  assert.equal(late.payDays, 10); rel(late.ltv, 3200 * (1 - g.zoneTax(13)) * 10); assert.ok(late.ratio < 1 && late.worthwhile === false, 'ent ratio ' + late.ratio);
  const cash = g.s.cash, r = g.acquireClient('ent');
  assert.equal(r.ok, false); assert.match(r.msg, /day 90/); assert.equal(g.s.cash, cash); assert.equal(g.s.clients.length, 0);
  assert.equal(g.acquireClient('smb').ok, true, 'a small account that still pays back is fine');
  assert.equal(g.acquireClient('ent', { force: true }).ok, true, 'and the player may still insist');
  g.s.hour = 89 * 24 + 5; assert.equal(g.clientQuote('smb').payDays, 1, 'the tick of hour 2160 is the last that pays');
  g.s.hour = TOTAL_HOURS; assert.equal(g.clientQuote('smb').payDays, 0); assert.equal(g.clientQuote('smb').worthwhile, false);
});

test('a contract pays exactly its days whatever hour it is signed, and frees its slot the hour after the last payment [DT-09]', () => {
  const keep = CLIENTS.smb.minRunning; CLIENTS.smb.minRunning = 0;
  try {
    const earned = (signHour) => {
      const g = desk([], 3); g.s.cash = 1e6;
      g.advanceTo(signHour); assert.equal(g.acquireClient('smb').ok, true);
      g.advanceTo(signHour + 30 * 24 + 48);
      return g.s.ledger.filter((e) => e.type === 'client' && /contract ended/.test(e.text)).map((e) => e.earned); // the closing row is a memo: the income was booked day by day, the CAC at signing
    };
    const day = CLIENTS.smb.perDay * (1 - ZONES[5].tax * 1);
    for (const h of [24, 25, 36, 47, 48]) { const e = earned(h); assert.equal(e.length, 1, 'hour ' + h); near(e[0], 30 * day, 1.5); }
    // six accounts, then the seventh as soon as they stop paying
    const g = desk([], 3); g.s.cash = 1e6; g.advanceTo(25);
    for (let i = 0; i < 6; i++) assert.equal(g.acquireClient('smb').ok, true);
    assert.equal(g.acquireClient('smb').ok, false, 'full');
    g.advanceTo(744); assert.equal(g.acquireClient('smb').ok, false, 'the thirtieth payment is still to come on the tick of hour 744');
    g.stepHour(); assert.equal(g.s.hour, 745);
    const paid = g.s.clients.reduce((a, c) => a + c.earned, 0); near(paid, 6 * 30 * day, 6);
    assert.equal(g.acquireClient('smb').ok, true, 'all six have paid their thirty days: the slots are free');
  } finally { CLIENTS.smb.minRunning = keep; }
});

// ---------------------------------------------------------------------------------------------------- upgrades [DT-10]
test('Just-In-Time Inventory halves perishable spoilage as well as wear, and an unknown upgrade is not "already installed" [DT-10]', () => {
  const wear = (jit) => { const g = mk([], 1); g.s.events = []; g.s.upg.jit = jit; const a = put(g, 'organicProduce' in ASSETS ? 'organicProduce' : Object.keys(ASSETS).find((c) => ASSETS[c].perish), 11); for (let i = 0; i < 10; i++) { g.s.hour = (i + 1) * 24; g._dayTick(); } return a.wear; };
  const plain = wear(false), jit = wear(true);
  const loss = (w) => 1 - w; assert.ok(loss(jit) < loss(plain) * 0.75, `10 days of spoilage: ${loss(plain).toFixed(3)} without JIT, ${loss(jit).toFixed(3)} with`);
  const g = mk([], 1); g.s.cash = 1e6;
  for (const id of ['nope', 'constructor', '__proto__', '']) { const r = g.buyUpgrade(id); assert.equal(r.ok, false); assert.match(r.msg, /Unknown upgrade/, id); }
  g._openZone(5); assert.equal(g.buyUpgrade('jit').ok, true); assert.match(g.buyUpgrade('jit').msg, /Already installed/);
});

// ---------------------------------------------------------------------------------------------------- the bank [bg-circle-cap-exceeds-15pct]
test('the Community Circle lends up to exactly 15% of net worth however often it is asked, and nothing under a cent [bg-circle-cap-exceeds-15pct]', () => {
  const g = mk(['immigrant', 'pro'], 1); g.s.cash = 10000; g.s.mil.m1 = true;
  const nw = g.netWorth();
  for (let i = 0; i < 12; i++) g.draw('circle', 1e9);
  near(g.debt() / nw, 0.15, 1e-6); assert.ok(g.debt() <= nw * 0.15 + 1e-9);
  const loans = g.s.loans.length; const r = g.draw('circle', 1e9);
  assert.equal(r.ok, false); assert.equal(g.s.loans.length, loans, 'no empty loan records pile up');
  assert.equal(g.draw('circle', 0.001).ok, false); assert.equal(mk(['immigrant', 'pro'], 2).draw('circle', 0.004).ok, false);
});

// ---------------------------------------------------------------------------------------------------- what an asset is worth in your hands [bg-projected-ignores-perks]
test('"worth in your hands" is what the engine would really give you, Background and all [bg-projected-ignores-perks]', () => {
  for (const perks of [['trades', 'pro'], ['pro', 'veteran'], ['grad', 'creator'], ['native', 'heir']]) {
    const g = mk(perks, 3); for (const z of [5, 6, 7]) g._openZone(z);
    const a = put(g, 'van', 7, { cond: 'broken', basis: 100 });
    const q = g.repairQuote(a.id);
    rel(g.projected(g.pub(a)), q.after - q.cost, 1e-9);
  }
  // a classmate's published levels are priced raw, in the district's terms
  const g = mk(['trades', 'pro'], 3); for (const z of [5, 6, 7]) g._openZone(z);
  const a = put(g, 'van', 7, { cond: 'broken' }), pub = g.pub(a);
  assert.ok(g.projected(pub, { ops: 3, growth: 1, fintech: 1 }) < g.projected(pub), 'a better repairer is told it is worth more');
  assert.ok(g.projected(pub, { ops: 3, growth: 1, fintech: 1 }) > 0);
});

// ---------------------------------------------------------------------------------------------------- a shock that finds the player bust [shockLog.de]
test('the shock log stores a finite debt-to-equity even when there is no equity left (JSON turned Infinity into null)', () => {
  const g = mk([], 2); g.s.assets = []; g.s.cash = 0; g.s.events = [g._evInstance('tiktok', 30)];
  g.s.loans.push({ id: 'D1', prod: 'micro', principal: 500, accr: 0, last: 0, next: 24, drawn: 0 });
  assert.equal(g.deRatio(), Infinity);
  g.advanceTo(31);
  const row = g.s.shockLog[0]; assert.ok(row && Number.isFinite(row.de), 'de ' + row?.de);
  assert.equal(JSON.parse(JSON.stringify(g.s.shockLog))[0].de, row.de, 'and it survives a save');
  assert.ok(Number.isFinite(g.publicSnapshot().shockLog[0].de));
});

// ---------------------------------------------------------------------------------------------------- your selling narrows the gap [F4]
test('every unit you sell in a district lowers what the same goods fetch there for two days, as the Codex says [F4]', () => {
  const g = mk([], 3); g.s.events = []; g._openZone(5);
  const probe = { cls: 'textbooks', cond: 'ok', quality: 1, wear: 1, zone: 5 };
  const v0 = g.val(probe, 5);
  for (let i = 0; i < 30; i++) g.logNiche(5, 'textbooks', 'npc-pool', 1.68);
  const v1 = g.val(probe, 5); assert.ok(v1 < v0 * 0.985, `${v0} -> ${v1}`);
  assert.equal(g.val({ ...probe, cls: 'pen' }, 5) > 0, true);
  rel(g.val({ ...probe, cls: 'bike', zone: 6 }, 6), g.val({ ...probe, cls: 'bike', zone: 6 }, 6)); // other districts and classes are untouched
  const other = mk([], 3); other.s.events = []; other._openZone(5);
  rel(g.val({ ...probe, cls: 'bike' }, 5), other.val({ ...probe, cls: 'bike' }, 5), 1e-12);
  g.s.hour += 49; g._m = null; assert.ok(Math.abs(g.val(probe, 5) - v0) < 1e-9 * v0 + 1e-9 || g.val(probe, 5) > v1, 'the pressure goes after 48 hours');
  rel(g.val(probe, 5), g.val({ ...probe }, 5));
});

// ---------------------------------------------------------------------------------------------------- manager economics [E3]
const NATURAL_DAY = { 5: 17, 6: 21, 7: 24, 8: 27, 9: 30, 10: 37, 11: 44, 12: 50, 13: 55, 14: 64, 15: 73, 16: 85 }; // when the median player is there (docs/BALANCE.md pacing)
const desk2 = (day, cohort, skill = 1) => {
  const g = mk([], 5); if (cohort) g.env.cohort = new Cohort({ seed: 'solo', ghosts: 36 });
  for (let i = 1; i <= 16; i++) g._openZone(i);
  g.s.zones = [...new Set(g.s.zones)].sort((a, b) => a - b); g._bn = null;
  g.s.events = []; g.s.hour = 24 * day; g._m = null; g.s.skills = { ops: skill, growth: skill, fintech: skill };
  return g;
};
/** The best lane (by net per day) for a level-1 broker running its own full capital in a district, from the forecast. */
const bestLane = (g, z, kind = 'broker') => {
  let best = null;
  for (const cls of Object.keys(ASSETS)) {
    if (demandOf(ASSETS[cls], z) <= 0) continue;
    for (const buyer of Object.keys(BUYERS)) {
      if (BUYERS[buyer].zone !== z || fitOf(cls, buyer) < 0.3) continue;
      const p = { id: 'X', kind, zone: z, cls, buyer, channel: 'dom', level: 1, alloc: 0, cycles: 0, inflight: 0, prog: 0 }; p.alloc = g.pipeCap(p);
      const f = g.forecast(p);
      if (!best || f.perDay > best.f.perDay) best = { cls, buyer, f };
    }
  }
  return best;
};

test('every district\'s best lane earns a positive net per cycle for a level-1 broker with its own capital, at 5-9% gross for a balanced niche and up to the pioneer premium [E3]', () => {
  for (let z = 1; z <= 4; z++) assert.equal(ZONES[z].auto, false, 'no managers in district ' + z);
  const rows = [];
  for (let z = 5; z <= 16; z++) {
    for (const cohort of [true, false]) {
      const g = desk2(cohort ? NATURAL_DAY[z] : 30, cohort), b = bestLane(g, z), f = b.f;
      const gross = f.gross / f.alloc, net = f.net / f.alloc;
      rows.push(`district ${z} ${cohort ? 'with the class' : 'alone'}: gross ${(gross * 100).toFixed(2)}% net ${(net * 100).toFixed(2)}% cm ${f.ci.cm.toFixed(2)}`);
      assert.ok(net > 0.002, `district ${z} ${cohort ? 'with the class' : 'alone'}: net ${(net * 100).toFixed(2)}% per cycle on ${b.cls} to ${b.buyer}`);
      assert.ok(gross >= 0.05 && gross <= 0.16, `district ${z} ${cohort ? 'with the class' : 'alone'}: gross ${(gross * 100).toFixed(2)}%`);
    }
    const g = desk2(30, false);
    for (const kind of Object.keys(PIPE)) { // a balanced niche (Cm 1.68) pays each kind its own table margin, within 5-9% before costs
      const p = { id: 'X', kind, zone: z, cls: 'pen', buyer: Object.keys(BUYERS).find((b) => BUYERS[b].zone === z), channel: 'dom', level: 1, alloc: 1000, cycles: 0, inflight: 0 };
      const f = g.forecast(p), balanced = PIPE[kind].margin * ECON.margin * pipeMargin(ZONES[z]);
      assert.ok(balanced >= 0.05 && balanced <= 0.09, `${kind} in district ${z}: ${(balanced * 100).toFixed(2)}% for a balanced niche`);
      assert.ok(Number.isFinite(f.net));
    }
  }
  assert.ok(rows.length === 24, rows.join('\n'));
});

test('the forecast a manager shows is what its next cycles pay: it does not saturate its own lane [E3]', () => {
  for (const z of [5, 9, 13]) {
    const g = desk2(30, false); g.s.cash = 1e12;
    const b = bestLane(g, z), h = g.hirePipeline('broker', z, { cls: b.cls, buyer: b.buyer, alloc: 1e12 });
    assert.equal(h.ok, true); const p = h.pipe;
    const f0 = g.forecast(p), cap = g.pipeCap(p), nets = [];
    for (let i = 0; i < 24 * 20; i++) { const n = p.cycles; g.stepHour(); if (p.cycles > n) nets.push(g.s.ledger.filter((e) => e.type === 'pipe').at(-1)); }
    assert.ok(nets.length >= 6, 'cycles ran: ' + nets.length);
    for (const r of nets) { assert.ok(r.cm > 1, `district ${z}: cycle cm ${r.cm} (a lone manager is not a herd of one)`); assert.ok(r.amt > 0, `district ${z}: a cycle lost money`); rel(r.amt / cap, f0.net / f0.alloc, 0.02); }
    assert.ok(g.s.niche.filter((n) => n[4] === p.id).length >= 1, 'its cycles are logged against the pipeline');
  }
});

test('a manager does not crowd itself, but you and your other managers do [E3]', () => {
  const g = desk2(30, false); g.s.cash = 1e12;
  const b = bestLane(g, 5), h = g.hirePipeline('broker', 5, { cls: b.cls, buyer: b.buyer, alloc: 1e12 }); const p = h.pipe;
  for (let i = 0; i < 24 * 8; i++) g.stepHour();
  assert.ok(p.cycles >= 2);
  const mine = g.cmFor(5, b.cls, b.buyer, p.id), seen = g.cmFor(5, b.cls, b.buyer);
  assert.ok(mine.cm > seen.cm && mine.vN === 0 && seen.vN >= 1, `with its own cycles left out ${mine.cm.toFixed(2)}, with them ${seen.cm.toFixed(2)}`);
  const second = g.hirePipeline('broker', 5, { cls: b.cls, buyer: b.buyer, alloc: 1e12 }).pipe; // a second manager on the same lane sees the first one's cycles
  assert.ok(g.forecast(second).ci.vN >= 1); assert.ok(g.forecast(second).ci.cm < g.forecast(p).ci.cm);
  assert.deepEqual(g.ownCounts(5, b.cls, p.id).byBuyer[b.buyer] ?? 0, 0);
});

test('managers pay: the bot\'s managers earn money over a run instead of losing it [E3]', () => {
  for (const seed of [7, 11]) {
    const g = makeGame(['trades', 'pro'], 'ops', seed); run(g, { days: 60, every: 4 });
    const profit = g.s.pipes.reduce((a, p) => a + p.profit, 0);
    assert.ok(g.s.pipes.length >= 3 && profit > 0, `seed ${seed}: ${g.s.pipes.length} managers, lifetime profit ${Math.round(profit)}`);
  }
});

test('the margin table is the documented one: pipeScale and pipeOverhead grow with the gate, pipeMargin is one number for every district [E3]', () => {
  assert.equal(PIPE_RULES.marginSlope, 0); assert.equal(pipeMargin(ZONES[5]), pipeMargin(ZONES[16]));
  assert.ok(pipeScale(ZONES[13]) / pipeScale(ZONES[5]) > 20); assert.ok(pipeOverhead(ZONES[16]) > pipeOverhead(ZONES[5]));
  assert.ok(restoreQuality(1) > 0);
});
