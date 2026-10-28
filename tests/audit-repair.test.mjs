// Regression tests for the repair round on the integrated branch: what the five audit clusters left half-fixed, and what only broke when they met. Each test names the finding it holds
// (the cluster's id, or the title of the new one) and fails on the integrated tree before this round (eb34526).
// Sections: the ledger, the swap (delivery, the oracle, the lock, the credit), royalties, ageing and the bell, the engine's arguments, the room (relay, identity, the snapshot door), the Deal Room glue
// and the games, the screens, and the late game of the balance table.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };

const { Game, closedWhy } = await import('../js/engine.js');
const { ASSETS, BUYERS, ZONES, CLIENTS, ECON, SWAPS, TOTAL_HOURS, SKILL_MAX, FMV_BAND } = await import('../js/config.js');
const { assetFMV, demandOf } = await import('../js/market.js');
const { Session, kv } = await import('../js/session.js');
const C = await import('../js/cohort.js');
const { Progress } = await import('../js/meta/progress.js');
const { makeGame, run } = await import('./bot.mjs');
const { balance, lateGame } = await import('./balance.mjs');
const { fakeCtx } = await import('./helpers/ctx.mjs');

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const mk = (perks = [], seed = 1, pid) => { const g = new Game({ perks, seed, handle: pid || 'T', pid: pid || 'T-' + seed }); g.env.algo = false; return g; };
const rich = (g, cash) => { g.s.cash = cash; g.advanceTo(g.s.hour + 1); return g; };
const put = (g, cls, zone, o = {}) => {
  const a = g._mk(g.s, cls, { zone, basis: o.basis ?? 1, cond: o.cond });
  if (o.truth) { a.truth = o.truth; a.known = !!o.known; } else if (o.known) a.known = true;
  g.s.assets.push(a);
  return a;
};
const sum = (rows) => rows.reduce((a, r) => a + r.amt, 0);
const rowsOf = (g, type) => g.s.ledger.filter((e) => e.type === type);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(20); } throw new Error('timed out: ' + fn); };

// ------------------------------------------------------------------------------------------------------------------------- the ledger [L5, DT-07, L7, L8]
test('L5, DT-07, L7: client income, SLA penalties and overdraft interest are rows, and a window of only those reconciles with cash to the cent', () => {
  // SMB accounts that are paid every day (the SLA is met): the CAC at signing, the income day by day, a closing memo that moves nothing
  const keep = CLIENTS.smb.minRunning; CLIENTS.smb.minRunning = 0;
  try {
    const g = mk([], 3); g.s.cash = 1e6; g.s.auditFirst = true; g.s.auditNext = null; g.advanceTo(25);
    const cash0 = g.s.cash, n0 = g.s.ledger.length;
    assert.ok(g.acquireClient('smb').ok && g.acquireClient('smb').ok);
    g.advanceTo(25 + 33 * 24);
    const all = g.s.ledger.slice(n0), rows = all.filter((e) => e.type === 'client');
    assert.ok(all.every((e) => e.type === 'client' || e.type === 'audit'), 'the window holds the accounts and the audit fines that came with a million dollars, nothing else');
    near(g.s.cash - cash0, sum(all), 0.01); // every dollar that moved is a row; the memo is a zero
    const memo = rows.filter((e) => /contract ended/.test(e.text));
    assert.equal(memo.length, 2); for (const m of memo) { assert.equal(m.amt, 0); assert.ok(m.earned > 1000 && m.cac > 400); }
    assert.ok(rows.filter((e) => e.amt > 0).every((e) => e.n >= 1), 'one income row a day for all the accounts that paid');
  } finally { CLIENTS.smb.minRunning = keep; }
  // an SLA that is not met: a penalty row each time, and a client that walks away after two
  const h = mk([], 3); h.s.cash = 1e6; h.s.auditFirst = true; h.s.auditNext = null; h.advanceTo(25);
  h.s.clients.push({ id: 'Cx', tier: 'smb', cac: 450, until: h.s.hour + 900, earned: 0, breaches: 0 });
  const c0 = h.s.cash, m0 = h.s.ledger.length;
  h.advanceTo(h.s.hour + 49);
  const window = h.s.ledger.slice(m0), sla = window.filter((e) => e.type === 'client' && e.sla);
  assert.equal(sla.length, 2); for (const r of sla) near(r.amt, -CLIENTS.smb.perDay * 2, 1e-9);
  near(h.s.cash - c0, sum(window), 0.01); // the penalties and, with a million dollars, whatever audit fine came due: every one a row
  // overdraft: interest is a row, and the rows add up to the counter
  const o = mk([], 4); o.s.cash = -2000; const oc = o.s.cash; o.advanceTo(24 * 4 + 1);
  const od = rowsOf(o, 'overdraft'); assert.ok(od.length >= 3);
  near(-sum(od), o.s.overdraft, 1e-9); near(o.s.cash - oc, sum(od), 0.01);
});

test('L5: the Bank no longer says the ledger is every dollar in and out, and says what a folded ledger holds', async () => {
  const bank = (await import('../js/ui/drawers/bank.js')).default;
  const ctx = fakeCtx({ days: 12 }); ctx.U.bank = { ledger: true };
  const html = bank.html(ctx);
  assert.ok(!/every dollar in and out/.test(html) && /gain or a cost/.test(html));
  const g = ctx.g();
  g.s.ledgerDropped = 5; g.s.ledger.unshift({ h: 0, type: 'summary', text: '5 older lines', amt: 0, n: 5, upto: 1, byType: {} });
  const html2 = bank.html(ctx);
  assert.ok(!/holds all of them/.test(html2) && /folded into one summary line/.test(html2));
});

test('L8: a folded ledger writes its totals by type into the summary line, where the table and the download both show them', () => {
  const g = mk([], 2);
  for (let i = 0; i < 3300; i++) g.led(i % 2 ? 'buy' : 'repair', 'x', i % 2 ? -5 : -2);
  assert.equal(g.s.ledger[0].type, 'summary'); assert.ok(g.s.ledgerDropped >= 200);
  assert.match(g.s.ledger[0].text, /By type: .*buy \d+ lines?, -\$/);
  assert.match(g.s.ledger[0].text, /repair \d+ lines?, -\$/);
  assert.ok(g.s.ledger[0].byType.buy.n > 0 && g.s.ledger[0].amt < 0);
});

// ------------------------------------------------------------------------------------------------------------------------- the swap: delivery, oracle, lock, credit
function swapPair() {
  const A = mk([], 1, 'AAA'), B = mk([], 2, 'BBB');
  return { A, B };
}
test('Swap delivery is believed (critical): the crate that comes back is credited as the proposer described it, and no better', () => {
  const { A, B } = swapPair();
  // A describes a crate of the dearest class in district 1 as nearly worthless, at the price of its paperclip, which the guardrail passes
  const cls = Object.keys(ASSETS).filter((c) => demandOf(ASSETS[c], 1) > 0).sort((x, y) => ASSETS[y].base - ASSETS[x].base)[0];
  const clip = A.s.assets[0], worth = A.val(clip);
  const full = assetFMV({ cls, cond: 'ok', quality: 1, wear: 1, zone: 1 }, 1, A.mods(), A.crowd(cls, 1));
  const tiny = { id: 'Zx', cls, cond: 'ok', quality: worth / full, wear: 1, zone: 1 };
  const off = A.createOffer({ to: 'BBB', giveIds: [clip.id], want: { assets: [tiny], cash: 0 } });
  assert.ok(off.ok, off.msg);
  const nw0 = A.netWorth();
  const perfect = { id: 'Zx', cls, cond: 'ok', quality: 1.5, wear: 1.5, zone: 1 };
  const r = A.finalizeOffer(off.offer.id, { assets: [perfect], cash: 0 }, 'BBB');
  assert.ok(r.ok, r.msg);
  const got = A.s.assets.find((a) => a.from === 'p2p');
  assert.ok(got.quality <= tiny.quality + 1e-12 && got.wear <= 1, `quality ${got.quality}, wear ${got.wear}`);
  assert.ok(A.netWorth() < nw0 + 1, `net worth ${nw0} -> ${A.netWorth()}: nothing was minted`);
  // a condition cannot be improved by the reply either
  const { A: A2 } = swapPair();
  const broken = { id: 'Bx', cls: 'sedan', cond: 'broken', quality: 1, wear: 1, zone: 1 };
  const o2 = A2.createOffer({ to: 'BBB', giveCash: 0, giveIds: [A2.s.assets[0].id], want: { assets: [broken], cash: 0 } });
  if (o2.ok) { assert.ok(A2.finalizeOffer(o2.offer.id, { assets: [{ ...broken, cond: 'ok' }], cash: 0 }).ok); assert.equal(A2.s.assets.find((a) => a.from === 'p2p').cond, 'broken'); }
});

test('Swap delivery: a worthless crate of the right id and class is not that swap (nothing credited, the escrow held)', () => {
  const { A, B } = swapPair();
  const scrap = put(B, 'scrap', 1);
  const off = A.createOffer({ to: 'BBB', giveIds: [put(A, 'pen', 1).id], want: { assets: [B.pub(scrap)], cash: 0 } });
  assert.ok(off.ok, off.msg);
  const junk = { ...B.pub(scrap), quality: 0.01, cond: 'broken' };
  const r = A.finalizeOffer(off.offer.id, { assets: [junk], cash: 0 }, 'BBB');
  assert.equal(r.ok, false); assert.match(r.msg, /not what the offer asked for/);
  assert.equal(A.s.escrow.length, 1); assert.ok(!A.s.assets.some((a) => a.from === 'p2p'));
  assert.ok(A.finalizeOffer(off.offer.id, { assets: [B.pub(scrap)], cash: 0 }, 'BBB').ok, 'the real crate still settles it');
});

test('Swap guardrail is not a free counterfeit detector: a refusal made on a hidden truth gives no number and reaches no instructor', () => {
  const { A, B } = swapPair();
  rich(A, 3000); rich(B, 3000);
  const fake = put(A, 'bike', 1, { truth: { q: 1, fake: true, defects: [] } });
  const want = put(B, 'bike', 1), price = Math.round(B.pub(want).fmv * 100) / 100;
  const r = A.createOffer({ to: 'BBB', giveIds: [fake.id], want: { assets: [B.pub(want)], cash: 0 } });
  assert.equal(r.ok, false); assert.equal(r.msg, 'This crate cannot be traded at that price.');
  assert.equal(r.chk, undefined); assert.ok(!/\d/.test(r.msg), 'no number in it');
  assert.ok(!A.out.some((m) => m.t === 'flag'), 'and the instructor is not told an innocent player tried an extreme premium');
  const good = put(A, 'bike', 1);
  assert.ok(A.createOffer({ to: 'BBB', giveIds: [good.id], want: { assets: [B.pub(want)], cash: 0 } }).ok, 'a genuine crate at the same price goes through');
  // the numbers a refusal DOES give are the ones the owner can already see: the described values
  const wild = A.createOffer({ to: 'BBB', giveIds: [put(A, 'bike', 1).id], giveCash: 0, want: { assets: [], cash: price * 3 } });
  assert.equal(wild.ok, false); assert.match(wild.msg, /Extreme Asymmetric/); assert.ok(A.out.some((m) => m.t === 'flag'));
  // the acceptor, too: their own unknown counterfeit is refused without its worth
  const fake2 = put(B, 'bike', 1, { truth: { q: 1, fake: true, defects: [] } });
  const offer = { id: 'Of', from: 'AAA', fromHandle: 'A', to: 'BBB', give: { assets: [], cash: price, royalty: null }, want: { assets: [B.pub(fake2)], cash: 0 }, skills: {} };
  const acc = B.acceptOffer(offer);
  assert.equal(acc.ok, false); assert.equal(acc.msg, 'This crate cannot be traded at that price.'); assert.equal(acc.chk, undefined);
});

test('F3 (residual): an escrow a classmate is accepting is not expired, and a sale does not begin, under them', () => {
  const { A } = swapPair();
  rich(A, 300000); A.s.auditFirst = true; A.s.auditNext = null;
  const pen = put(A, 'pen', 1);
  const off = A.createOffer({ to: 'BBB', giveIds: [pen.id], want: { assets: [], cash: A.val(pen) } });
  assert.ok(off.ok, off.msg);
  const e = A.s.escrow[0]; e.lockedBy = 'BBB'; e.lockedAt = Date.now();
  assert.equal(A.exit('trade').ok, false, 'no sale while a swap is being taken'); assert.equal(A.s.escrow.length, 1);
  A.advanceTo(A.s.hour + 100);
  assert.equal(A.s.escrow.length, 1, 'and 72 hours do not return it under them');
  e.lockLapsed = true; A.advanceTo(A.s.hour + 2);
  assert.equal(A.s.escrow.length, 0, 'once the hold has lapsed the offer expires as it should');
});

function sessionPair() {
  store.clear();
  const A = new Session(); A.pid = 'AAA'; A.mode = 'student'; A.startGame({ perks: [], specialty: 'ops', handle: 'Ada' });
  A.peers.set('BBB', { pid: 'BBB', handle: 'Bo', role: 'student', seen: Date.now() });
  return A;
}
test('The addressee can not pin the proposer\'s escrow by repeating accept (low): one hold per try, two per offer, and it lapses', () => {
  const A = sessionPair(), g = A.game;
  const pen = put(g, 'pen', 1);
  const r = A.propose({ to: 'BBB', giveIds: [pen.id], want: { assets: [], cash: g.val(pen) } });
  assert.ok(r.ok, r.msg);
  const id = r.offer.id, e = g.s.escrow[0], msg = { t: 'accept', from: 'BBB', role: 'student', to: 'AAA', offerId: id };
  A._onMsg(msg); const at = e.lockedAt, hourAt = e.at; assert.equal(e.lockedBy, 'BBB'); assert.equal(e.locks, 1);
  A._onMsg(msg); A._onMsg(msg);
  assert.equal(e.locks, 1, 'said again while it is held, it changes nothing'); assert.equal(e.lockedAt, at); assert.equal(e.at, hourAt, 'and the 72 hours are not given a fresh start');
  assert.equal(A.withdraw(id).ok, false, 'they are taking it');
  A.tick(Date.now() + 61000); assert.equal(e.lockLapsed, true);
  A._onMsg(msg); assert.equal(e.locks, 2); assert.equal(e.lockLapsed, undefined, 'a second try is held again');
  A.tick(Date.now() + 130000); assert.equal(e.lockLapsed, true);
  A._onMsg(msg); assert.equal(e.locks, 2, 'but no third');
  assert.ok(A.withdraw(id).ok, 'and the owner has it back');
});

test('Swap XP is not a farm: two tabs trading paperclips earn nothing, a real swap pays by its value, and a day pays three at most, once per partner', () => {
  const A = mk([], 1, 'AAA'), B = mk([], 2, 'BBB');
  for (let i = 0; i < 40; i++) {
    const a = A.s.assets[0], b = B.s.assets[0];
    const o = A.createOffer({ to: 'BBB', giveIds: [a.id], want: { assets: [B.pub(b)], cash: 0 } });
    assert.ok(o.ok, o.msg);
    const acc = B.acceptOffer(o.offer); assert.ok(acc.ok, acc.msg);
    assert.ok(A.finalizeOffer(o.offer.id, acc.deliver, 'BBB').ok);
  }
  assert.equal(A.s.p2p, 0); assert.equal(B.s.p2p, 0); assert.equal(A.s.xp, 0, 'forty paperclip swaps pay nothing'); assert.equal(B.s.xp, 0);
  // swaps that move value: the first with a partner pays, the second the same day does not, a fourth partner the same day does not, tomorrow does
  const X = mk([], 5, 'XXX'), partners = ['P1', 'P2', 'P3', 'P4'].map((p, i) => mk([], 10 + i, p));
  const swapWith = (Y) => { const a = put(X, 'bike', 1), b = put(Y, 'bike', 1); const o = X.createOffer({ to: Y.s.pid, giveIds: [a.id], want: { assets: [Y.pub(b)], cash: 0 } }); assert.ok(o.ok, o.msg); const acc = Y.acceptOffer(o.offer); assert.ok(acc.ok, acc.msg); return X.finalizeOffer(o.offer.id, acc.deliver, Y.s.pid); };
  const xp0 = X.s.xp; swapWith(partners[0]);
  const paid = X.s.xp - xp0; assert.ok(paid > 20 && paid < 120, 'paid by value: ' + paid); assert.equal(X.s.p2p, 1);
  swapWith(partners[0]); assert.equal(X.s.p2p, 1, 'the same partner the same day pays nothing more');
  swapWith(partners[1]); swapWith(partners[2]); assert.equal(X.s.p2p, 3);
  swapWith(partners[3]); assert.equal(X.s.p2p, 3, 'a fourth in a day does not count');
  X.s.hour += 24; swapWith(partners[3]); assert.equal(X.s.p2p, 4, 'tomorrow does');
  assert.ok(X.s.xp < 600, 'a hundred and some swaps could once be had for 120 each; xp ' + X.s.xp);
});

test('A swap with the Practice Partner pays no quest, achievement or bounty, only the Codex page (ui: spent for nothing)', () => {
  const g = mk([], 3); const prog = new Progress(g); g.onEvent = (e) => prog.onEvent(e);
  const evs = []; const prev = g.onEvent; g.onEvent = (e) => { evs.push(e); prev(e); };
  const mine = put(g, 'pen', 1);
  const o = g.createOffer({ to: 'NPC-PARTNER', giveIds: [mine.id], want: { assets: [{ id: 'NPC-1', cls: 'pen', cond: 'ok', quality: 1, wear: 1, zone: 1 }], cash: 0 } });
  assert.ok(o.ok, o.msg);
  const r = g.finalizeOffer(o.offer.id, { assets: [{ id: 'NPC-1', cls: 'pen', cond: 'ok', quality: 1, wear: 1, zone: 1 }], cash: 0 }, 'Practice Partner', { npc: true });
  assert.ok(r.ok, r.msg);
  const p2p = evs.find((e) => e.type === 'p2p'); assert.equal(p2p.npc, true);
  assert.ok(!prog.m.a['a-handshake']?.done && !(prog.m.a['a-handshake']?.p > 0), 'Handshake is still there to be earned from a real classmate');
  assert.equal(g.s.p2p, 0);
});

// ------------------------------------------------------------------------------------------------------------------------- royalties
test('Royalty promises are debts: arrears when cash is short, a liability in net worth and an exit, paid first, a day\'s rate a message, and ended when the receiver is over', () => {
  const A = mk([], 1, 'AAA'), B = mk([], 2, 'BBB');
  rich(A, 20000); rich(B, 3000);
  const off = A.createOffer({ to: 'BBB', giveCash: 0, royalty: { perDay: 30, days: 5 }, want: { assets: [], cash: 150 } });
  assert.ok(off.ok, off.msg);
  const acc = B.acceptOffer(off.offer); assert.ok(acc.ok, acc.msg);
  assert.ok(A.finalizeOffer(off.offer.id, acc.deliver, 'BBB').ok);
  const nw0 = A.netWorth(); near(A.royaltyOwed(), 150, 1e-9);
  A.s.cash = 0; // no cash on hand at midnight
  A.out.length = 0; A.advanceTo(A.s.hour + 24 * 2 + 1);
  const stream = A.s.royalties.find((r) => r.dir === 'pay');
  assert.ok(stream.arrears >= 59.9, 'two days due, nothing paid: ' + stream.arrears); assert.equal(A.out.filter((m) => m.t === 'royalty').length, 0);
  near(A.royaltyOwed(), 150 - 30 * 2 + 60, 1.5); // arrears plus the days still to come: the whole promise is still owed
  A.s.cash = 1000; A.out.length = 0; A.advanceTo(A.s.hour + 24);
  const sent = A.out.filter((m) => m.t === 'royalty');
  assert.ok(sent.length >= 3 && sent.every((m) => m.amount <= 30 + 1e-9), 'the arrears go in messages of a day\'s rate: ' + sent.map((m) => m.amount));
  near(sent.reduce((a, m) => a + m.amount, 0), 90, 1e-6);
  for (const m of sent) assert.ok(B.receiveRoyalty(m.amount, off.offer.id, 'AAA').ok);
  assert.ok(rowsOf(A, 'p2p').some((r) => r.text === 'Royalty paid' && r.amt < 0), 'and each payment is a row');
  // the exit's proceeds are less what the promise still owes
  const C2 = mk([], 3, 'CCC'); rich(C2, 400000); C2.s.auditFirst = true; C2.s.auditNext = null;
  const q0 = C2.exitQuote('trade').proceeds;
  C2.s.royalties.push({ dir: 'pay', peer: 'DDD', perDay: 100, days: 10, since: C2.s.hour, until: C2.s.hour + 240, offer: 'Ox', arrears: 0 });
  near(C2.exitQuote('trade').proceeds, q0 - 1000, 1e-6);
  // a receiver whose run is over is not paid: the stream ends and the payer keeps its money
  const D = mk([], 4, 'DDD'); rich(D, 5000); D.env.peerClosed = (pid) => pid === 'EEE';
  D.s.royalties.push({ dir: 'pay', peer: 'EEE', perDay: 10, days: 5, since: D.s.hour, until: D.s.hour + 120, offer: 'Oy', arrears: 0 });
  const cash = D.s.cash; D.out.length = 0; D.advanceTo(D.s.hour + 49);
  assert.equal(D.out.filter((m) => m.t === 'royalty').length, 0); assert.equal(D.s.royalties.length, 0); assert.ok(D.s.cash >= cash - 1);
  void nw0;
});

// ------------------------------------------------------------------------------------------------------------------------- ageing, the bell, the score
test('F8 / DT-10: Just-In-Time halves a perishable\'s spoilage on a truck as on a shelf, and the two agree to the digit', () => {
  const cls = Object.keys(ASSETS).find((c) => ASSETS[c].perish);
  for (const jit of [false, true]) {
    const g = mk([], 1); g.s.events = []; g.s.upg.jit = jit; g.s.zones = [...new Set([...g.s.zones, 5, 6])];
    const shelf = put(g, cls, 5), truck = g._mk(g.s, cls, { zone: 5 });
    g.s.freight.push({ id: 'Fx', items: [truck], to: 6, sent: 0, arrive: 99999, risk: 0, book: 1, from: 5 });
    for (let d = 1; d <= 10; d++) { g.s.hour = d * 24 - 1; g.s.freight[0].arrive = 99999; g._m = null; g.stepHour(); }
    near(truck.wear, shelf.wear, 1e-9);
    if (jit) assert.ok(1 - truck.wear < 0.6, 'half speed: ' + truck.wear);
  }
  const loss = (jit) => { const g = mk([], 1); g.s.events = []; g.s.upg.jit = jit; const a = put(g, cls, 5); g._age(a); return 1 - a.wear; };
  near(loss(true) / loss(false), 0.5, 0.06); // a day of spoilage and of depreciation, both halved
});

test('stepHour closes the run at the bell, as advanceTo does (low)', () => {
  const g = mk([], 2);
  for (let i = 0; i < TOTAL_HOURS + 30; i++) g.stepHour();
  assert.equal(g.s.hour, TOTAL_HOURS); assert.equal(g.s.over, true); assert.ok(g.s.final); assert.match(closedWhy(g), /over/);
});

test('The debrief\'s net worth is the one the score was struck at, and stays there as the class\'s prices move (low)', () => {
  const g = makeGame(['trades', 'pro'], 'ops', 7); run(g, { days: 90, every: 6 });
  g.advanceTo(TOTAL_HOURS); assert.ok(g.s.over);
  const frozen = g.closedNetWorth(); near(frozen, g.s.final.nw ?? g.s.exit.nw, 1e-9);
  g.s.assets.push(g._mk(g.s, 'bike', { zone: 1 })); g.env.cohort = { counts: () => ({ total: 200, byBuyer: {} }), refresh() {} }; g._m = null;
  assert.notEqual(g.netWorth(), frozen, 'the live figure drifts'); assert.equal(g.closedNetWorth(), frozen, 'the reading does not');
  const src = readFileSync(new URL('../js/ui/debrief.js', import.meta.url), 'utf8');
  assert.ok(!/money\(g\.netWorth\(\)\)/.test(src) && /closedNetWorth/.test(src));
});

test('Levels: one note and one event for each level, in order, when XP crosses several at once with every skill at mastery', () => {
  const g = mk([], 1); for (const k of Object.keys(g.s.skills)) g.s.skills[k] = SKILL_MAX;
  const ev = []; g.onEvent = (e) => { if (e.type === 'level') ev.push(e.level); };
  g.s.xp = 150 * 11 * 11; g._levelCheck();
  assert.deepEqual(ev, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].slice(0, ev.length)); assert.ok(ev.length >= 11, ev.join());
  assert.equal(new Set(g.s.news.filter((n) => /^Level \d+/.test(n.text)).map((n) => n.text)).size, ev.length, 'every note is a different level');
});

// ------------------------------------------------------------------------------------------------------------------------- arguments the engine takes from outside
test('Hardening: createOffer(null), a negative or NaN allocation, a hostile game name, a text score and Infinity in a note do no harm', () => {
  const g = mk([], 1); rich(g, 1e6); for (let i = 5; i <= 6; i++) g._openZone(i);
  const r = g.createOffer(null); assert.equal(r.ok, false);
  assert.equal(g.createOffer(undefined).ok, false);
  const lane = g.radar(5, 10).find((x) => x.fit >= 0.3);
  for (const alloc of [-1, NaN, -Infinity, '12abc']) { const h = g.hirePipeline('student', 5, { cls: lane.cls, buyer: lane.seg, alloc }); if (h.ok) { assert.ok(h.pipe.alloc >= 0 && Number.isFinite(h.pipe.alloc), String(alloc)); g.releasePipeline(h.pipe.id); } }
  g.recordPlay('__proto__', { score: 0.5, key: 'k1' }); assert.equal(({}).n, undefined); assert.equal(({}).sum, undefined);
  const xp = g.s.xp; g.recordPlay('haggle', { score: 'abc', key: 'k2', role: 'sell' }); assert.ok(Number.isFinite(g.s.xp) && g.s.xp > xp);
  assert.ok(Number.isFinite(g.s.meta.haggle.sum));
  g.s.leads[1] = [{ id: 'Lq', zone: 1, seg: Object.keys(BUYERS)[0], budget: 5, born: 0, exp: 999 }];
  g.passLead(1, 'Lq', Infinity); g.passLead(1, 'nope', { x: 1 });
  assert.ok(g.s.news.every((n) => typeof n.text === 'string' && !/Infinity/.test(n.text)));
  for (const f of [() => g.clientQuote('nope'), () => g.clientQuote('constructor'), () => g.loanRoom('nope'), () => g.loanBlock('__proto__'), () => g.zoneTax('x'), () => g.poolQuote([g.s.assets[0].id], false, null), () => g.sideValue({}, null), () => g.acquireClient('smb', null), () => g.quotePitch('A1', 'L1', null, null)]) assert.doesNotThrow(f);
  assert.equal(g.acquireClient('nope').ok, false);
});

test('A typo in a Background is not a quietly different build: the bot refuses it and the engine says it dropped it (low)', () => {
  assert.throws(() => makeGame(['nope', 'trades']), /Unknown Background id: nope/);
  const g = new Game({ perks: ['nope', 'trades'], seed: 1 });
  assert.deepEqual(g.s.perks, ['trades']); assert.ok(g.s.news.some((n) => /nope is not a Background/.test(n.text)));
});

// ------------------------------------------------------------------------------------------------------------------------- the room: relay, identity, the snapshot door
const relayPath = new URL('../server/relay.mjs', import.meta.url).pathname;
const haveRelay = existsSync(new URL('../server/node_modules/ws', import.meta.url));
const keyFor = (s) => ('key-' + s).replace(/[^A-Za-z0-9_-]/g, '_').padEnd(16, '0');
async function startRelay(env = {}) {
  const child = spawn('node', [relayPath], { env: { ...process.env, PORT: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const st = { exited: null, err: '' };
  child.on('exit', (c) => { st.exited = c; }); child.stderr.on('data', (d) => { st.err += d; });
  const port = await new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('relay did not start')), 8000); child.stdout.on('data', (d) => { const m = /listening on :(\d+)/.exec(String(d)); if (m) { clearTimeout(to); res(+m[1]); } }); child.on('exit', () => rej(new Error('relay exited early'))); });
  return { child, port, st, url: `ws://localhost:${port}`, stop: () => child.kill() };
}
function sock(relay, room, pid, role = 'student', key = keyFor(pid)) {
  const ws = new WebSocket(`${relay.url}/?room=${room}&pid=${pid}${key === null ? '' : '&key=' + key}&role=${role}`);
  const c = { ws, got: [], closed: null, ready: new Promise((res) => { ws.onopen = res; }), send: (m) => ws.send(JSON.stringify(m)) };
  ws.onmessage = (e) => c.got.push(JSON.parse(e.data)); ws.onclose = (e) => { c.closed = e.code; };
  return c;
}
test('Relay identity (critical): a classmate who reuses the instructor\'s pid, with no key or another, is refused, and the real one is not disturbed', { skip: !haveRelay && 'run npm install in server/' }, async () => {
  const relay = await startRelay();
  try {
    const prof = sock(relay, 'SEAT1', 'PC-PROF', 'instructor'), vic = sock(relay, 'SEAT1', 'PC-VICT');
    await Promise.all([prof.ready, vic.ready]);
    prof.send({ t: 'clock', hour: 100, speed: 4, paused: false });
    await until(() => vic.got.some((m) => m.t === 'clock'));
    const nokey = sock(relay, 'SEAT1', 'PC-PROF', 'instructor', null), wrong = sock(relay, 'SEAT1', 'PC-PROF', 'instructor', 'a'.repeat(20)), twin = sock(relay, 'SEAT1', 'PC-VICT', 'student', 'b'.repeat(20));
    await until(() => nokey.closed != null && wrong.closed != null && twin.closed != null);
    assert.equal(nokey.closed, 1008); assert.equal(wrong.closed, 1008); assert.equal(twin.closed, 1008, 'and no one overwrites a student\'s snapshot or answers as them');
    assert.ok(!vic.got.some((m) => m.t === 'rewind' || m.t === 'inject'), 'nothing arrived from the impostor');
    prof.send({ t: 'clock', hour: 200, speed: 4, paused: false });
    await until(() => vic.got.filter((m) => m.t === 'clock').length >= 2); assert.equal(vic.got.filter((m) => m.t === 'clock').at(-1).hour, 200, 'the real instructor\'s clock still works');
    const back = sock(relay, 'SEAT1', 'PC-PROF', 'instructor'); await back.ready; assert.equal(back.closed, null, 'the real one can reconnect with its own key');
    for (const bad of ['', 'short', 'x'.repeat(65), 'a b c d e f g h i j k l']) { const s = sock(relay, 'SEAT2', 'PX', 'student', bad); await until(() => s.closed != null); assert.equal(s.closed, 1008, 'key ' + JSON.stringify(bad)); }
  } finally { relay.stop(); }
});

test('Relay (low): a relay that cannot listen says so and exits with a failing code', { skip: !haveRelay && 'run npm install in server/' }, async () => {
  const first = await startRelay();
  try {
    const second = spawn('node', [relayPath], { env: { ...process.env, PORT: String(first.port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = ''; second.stdout.on('data', (d) => { out += d; }); second.stderr.on('data', (d) => { err += d; });
    const code = await new Promise((res) => { second.on('exit', res); setTimeout(() => { second.kill(); res('hung'); }, 6000); });
    assert.equal(code, 1); assert.match(err, /EADDRINUSE/); assert.ok(!/listening/.test(out));
  } finally { first.stop(); }
});

test('Room: a student who has typed no alias is not called Instructor, and a student standing in for the instructor does not set the class\'s dials', () => {
  store.clear();
  const s = new Session(); s.pid = 'PC-ABCD'; s.joinRoom({ code: 'ALIAS', role: 'student' });
  assert.equal(s.room.handle, 'Founder-ABCD'); s.startGame({ perks: [], specialty: 'ops', handle: 'Ada' }); assert.equal(s.room.handle, 'Ada'); s.leaveRoom();
  store.clear();
  const t = new Session(); t.pid = 'PC-TEAC'; t.joinRoom({ code: 'ALIAS2', role: 'instructor' }); assert.equal(t.room.handle, 'Instructor'); t.leaveRoom();
  // the lowest-pid student fills in for a silent instructor: hour, speed and pause only
  store.clear();
  const v = new Session(); v.pid = '0LOW'; v.mode = 'student'; v.startGame({ perks: [], specialty: 'ops', handle: 'v' });
  v.joinedAt = 0; v.instructorSeen = 0;
  v._onMsg({ t: 'clock', from: '0A', role: 'student', hour: 5, speed: 4, paused: false, difficulty: { friction: 0.5, audit: 3, eeiFloor: 1 }, ghosts: 0, algo: false });
  assert.equal(v.difficulty.friction, 1); assert.equal(v.ghosts, 36); assert.equal(v.algo, true);
});

test('Snapshot door: an exited run\'s score is recomputed, ratios and swap counts are bounded, and a niche claim is capped at what an honest player makes', () => {
  store.clear();
  const s = new Session(); s.pid = 'TEACH'; s.mode = 'instructor'; s.clock.set({ hour: 24 * 40 });
  const snap = (over = {}) => ({ handle: 'H', nw: 0.05, cash: 0, debt: 0, hour: 24 * 40, eei: 1e12, trades: 1000, p2p: 1000, flags: { exited: true }, skills: { ops: 1, growth: 1, fintech: 1 }, perks: [], shockLog: [{ id: 's1', nw: 1, nwAfter: 1e9, pivots: 5 }], ...over });
  const clean = C.cleanSnap(snap(), 'CHEAT'); s.peers.set('CHEAT', { pid: 'CHEAT', handle: 'H', role: 'student', snap: clean, clean: true, seen: Date.now() });
  const honest = C.cleanSnap(snap({ nw: 5000, eei: 5, trades: 50, p2p: 2, flags: {}, shockLog: [] }), 'ANN'); s.peers.set('ANN', { pid: 'ANN', handle: 'A', role: 'student', snap: honest, clean: true, seen: Date.now() });
  const rows = s.leaderboard(); const cheat = rows.find((r) => r.pid === 'CHEAT');
  assert.ok(cheat.eei < 1, 'a made-up score is not believed: ' + cheat.eei); assert.equal(rows[0].pid, 'ANN');
  assert.ok(C.cleanSnap(snap(), 'X').p2p <= SWAPS.perDay * 41, 'a thousand swaps in 40 days is not a thing the engine counts');
  const gb = s.gradebook().find((r) => r.pid === 'CHEAT'); assert.ok(gb.adapt <= 100); assert.ok(gb.engage <= 100);
  assert.equal(C.NICHE_MAX <= 12 && C.NICHE_TOTAL <= 150, true);
  const key = Object.keys(C.cleanNiches({ '1|pen|student': 60 }))[0]; assert.equal(C.cleanNiches({ '1|pen|student': 60 })[key], C.NICHE_MAX);
  assert.equal(C.cleanSnap(snap({ nw: 1e12 }), 'Y').nw, C.NW_LIMIT);
});

// ------------------------------------------------------------------------------------------------------------------------- the Deal Room glue and the games
const D = await import('../js/deal.js');
const world = (perks = [], seed = 10, days = 30) => { const g = makeGame(perks, 'ops', seed); run(g, { days, every: 4 }); g.s.cash = Math.max(g.s.cash, 5000); return g; };
test('Games: finishing a repair whose Fix was not played repairs nothing and charges nothing, and does not throw', () => {
  const g = world();
  const a = g.s.assets.find((x) => x.cond === 'broken' && ASSETS[x.cls].repair) || (() => { const c = Object.keys(ASSETS).find((k) => ASSETS[k].repair && demandOf(ASSETS[k], 1) > 0); const x = put(g, c, 1, { cond: 'broken' }); return x; })();
  const cash = g.s.cash, xp = g.s.xp;
  for (const stops of [0, 1]) {
    const run1 = D.startRun(g, { kind: 'repair', assetId: a.id }); assert.ok(run1.ok);
    for (let i = 0; i < stops; i++) { const v = run1.view(); run1.act({ type: 'stop', t: D.tForPos(0.5, v.step, v.seed) }); }
    let s; assert.doesNotThrow(() => { s = run1.finish(); });
    assert.equal(g.s.cash, cash, 'stops ' + stops); assert.equal(g.s.assets.find((x) => x.id === a.id).cond, 'broken'); assert.equal(g.s.xp, xp);
    assert.equal(s.title, 'Not repaired');
  }
});

test('Games: a price agreed that the cash cannot pay is not a haggle won (nothing bought, nothing recorded)', () => {
  const g = world(['trades', 'pro'], 11, 25);
  const z = Math.max(...g.s.zones.filter((k) => (g.s.lots[k] || []).some((l) => l.mode === 'fixed' && l.price > 5)));
  const lot = g.s.lots[z].find((l) => l.mode === 'fixed' && l.price > 5);
  g.s.cash = lot.price * 0.61; // enough for the bench's lowest price, not for the price the Close agrees
  const run1 = D.startRun(g, { kind: 'buy', zone: z, lotId: lot.id }); assert.ok(run1.ok && !run1.plan.blocker, 'the bench opens: the lowest price it can settle at is affordable');
  const events = []; g.onEvent = (e) => events.push(e.type);
  run1.quickAll(); assert.equal(run1.res.close.deal, true, 'and the talk closes at the posted price, which is more than the cash');
  const sum1 = run1.finish();
  assert.equal(sum1.title, 'Not bought');
  assert.ok(!events.includes('haggle') && !events.includes('buy'), events.join());
});

test('Games: the reduced-motion slider is a par option and never beats the Expert dial', async () => {
  const R = await import('../js/play/repair.js');
  assert.equal(R.SLIDER_CAP, 0.85);
  for (const ops of [1, 3, 5, 8]) {
    let slider = 0, expert = 0, n = 0;
    for (let seed = 1; seed <= 40; seed++) {
      let s = R.create({ ops, seed });
      while (!s.done) s = R.act(s, { type: 'stop', t: D.tForPos(0.5, s.step, s.seed), slider: true }).state;
      slider += R.result(s).precision; expert += R.autoplay({ ops, seed }, 1).precision; n++;
    }
    assert.ok(slider / n <= expert / n + 1e-9, `ops ${ops}: slider ${(slider / n).toFixed(3)} against Expert ${(expert / n).toFixed(3)}`);
  }
  const src = readFileSync(new URL('../js/ui/deal.js', import.meta.url), 'utf8');
  assert.match(src, /slider: true/);
});

test('Games: Read says what the Market\'s street-sense flag says, once (bg-second-warn)', async () => {
  const I = await import('../js/play/inspect.js');
  const g = makeGame(['second', 'pro'], 'ops', 8); run(g, { days: 25, every: 4 });
  let flagged = 0, quietFake = 0, genuine = 0, bad = [];
  for (let k = 0; k < 400; k++) {
    g.s.hour += 3; g._m = null; for (const z of g.s.zones) { g._spawnLot(z, false); }
    for (const z of g.s.zones) for (const lot of g.s.lots[z]) {
      if (lot.seenW) continue; lot.seenW = 1;
      const st = I.create(D.inspectParams(g, z, lot)), w = st.warning || '';
      if (lot.warn) { flagged++; if (!/snags/.test(w)) bad.push('flagged lot, gut says: ' + w); } else { if (/snags/.test(w)) bad.push('unflagged lot, gut snags'); if (lot.truth.fake) quietFake++; else genuine++; }
    }
  }
  assert.deepEqual(bad.slice(0, 3), []); assert.ok(flagged > 5 && genuine > 50, `${flagged} flagged, ${genuine} genuine, ${quietFake} missed fakes`);
});

test('Games: in a buy-role haggle the seller does not say "too much" to a low offer, and the advice is written for a buyer', async () => {
  const H = await import('../js/play/haggle.js');
  const lines = new Set(), advice = new Set();
  for (const style of H.STYLES) for (let seed = 1; seed <= 6; seed++) {
    let s = H.create({ role: 'buy', fair: 100, reserve: 80, style, seed, patience: 6, assist: true, alt: 85, insight: 3 });
    advice.add(H.view(s).advice?.text);
    for (const a of [{ type: 'anchor', level: 'low' }, { type: 'leverage' }, { type: 'hold' }, { type: 'concede', size: 'small' }]) { const r = H.act(s, a); if (r.say !== null) { s = r.state; lines.add(r.say); if (!s.done) advice.add(H.view(s).advice?.text); } }
  }
  const all = [...lines, ...advice].filter(Boolean).join('\n');
  assert.ok(!/Whoa, too much|Ha, ambitious|a bit steep|past about 1\.25 times their limit|A big first number excites/.test(all), all.match(/.{0,30}(too much|ambitious|steep|1\.25 times|big first number).{0,30}/)?.[0]);
});

// ------------------------------------------------------------------------------------------------------------------------- the screens
test('Screens: the Crew drawer\'s client cards say how many days pay and refuse a contract the run cannot earn back, and the lane picker skips the manager being edited', async () => {
  const crew = (await import('../js/ui/drawers/crew.js')).default;
  const ctx = fakeCtx({ days: 25, perks: ['trades', 'pro'] }), g = ctx.g();
  ctx.U.crew = { tab: 'clients' };
  g.s.clients = []; g.s.hour = 89 * 24 + 5; g._m = null;
  const html = crew.html(ctx);
  assert.match(html, /could not earn back/); assert.match(html, /over the 1 day you have left/);
  const src = readFileSync(new URL('../js/ui/drawers/crew.js', import.meta.url), 'utf8');
  assert.match(src, /lanesFor\(v, H\.zone, take, \[\{ cls: H\.cls, seg: H\.buyer \}\], H\.edit \|\| null\)/);
  assert.equal(typeof g.radar(5, 3, 'P1')[0].cm, 'number');
});

test('Screens: the Net worth dialog adds up (a crate on a truck is counted at the lower of its two prices), the level toast is not said twice, Academy rewards bank only what a skill can take', async () => {
  const g = makeGame(['trades', 'pro'], 'ops', 10); run(g, { days: 25, every: 4 });
  const a = g.s.assets.find((x) => x.zone === Math.max(...g.s.zones)) || g.s.assets[0];
  const to = g.s.zones.find((z) => z !== a.zone);
  if (a && to) { g.s.cash = 1e6; g.ship([a.id], to); }
  const tr = g.s.freight.reduce((x, f) => x + g.inTransit(f), 0);
  const rows = g.s.cash + g.invValue() + tr + g.s.pipes.reduce((x, p) => x + p.basis + (p.inflight || 0), 0) + g.s.settle.reduce((x, y) => x + y.amt, 0)
    + g.s.escrow.reduce((x, e) => x + (e.cash || 0) + e.assets.reduce((q, y) => q + g.val(y), 0), 0) - g.debt() - g.royaltyOwed();
  near(rows, g.netWorth(), 1e-6);
  const shell = readFileSync(new URL('../js/ui/shell.js', import.meta.url), 'utf8');
  assert.match(shell, /game\.inTransit\(f\)/); assert.ok(!/You earned a skill point/.test(shell));
  const { applyRewards } = await import('../js/ui/academy-sandbox.js');
  const m = mk([], 1); for (const k of Object.keys(m.s.skills)) m.s.skills[k] = SKILL_MAX;
  const out = applyRewards(m, { grant: true, xp: 0, points: 1, codex: [] }, { id: 'm01' }, (game) => new Progress(game));
  assert.equal(out.points, 0); assert.equal(m.s.points, 0); assert.ok(m.s.xp >= ECON.pointXp, 'paid in XP instead');
});

// ------------------------------------------------------------------------------------------------------------------------- the late game of the balance table
test('Balance: the late game does not run away: on a sample of the 66 pairs few runs reach district 16 and the net worths stay within a reasonable spread', () => {
  const { PERK_PAIRS } = { PERK_PAIRS: null };
  void PERK_PAIRS;
  return import('../js/data/perks.js').then(({ PERK_PAIRS: ALL }) => {
    const r = balance({ seeds: 3, every: 4, pairs: ALL.filter((_, i) => i % 6 === 0) });
    const L = lateGame(r.rows);
    // 59% of the runs reached district 16 and the 90th percentile of net worth was 6.4x the 10th before the cycle change (docs/BALANCE.md)
    assert.ok(L.d16Share <= 0.2, `district 16 in ${(L.d16Share * 100).toFixed(0)}% of ${L.runs} runs`);
    assert.ok(L.nwP50 >= 800000 && L.nwP50 <= 2200000, `median day-90 net worth ${Math.round(L.nwP50)}`);
    assert.ok(L.spread <= 3.6, `the 90th percentile is ${L.spread.toFixed(1)}x the 10th`);
    assert.ok(r.base[1] >= 28 && r.base[1] <= 40, `district 9 on day ${r.base[1]}, inside the design's window`);
    assert.equal(r.wipedRuns, 0);
  });
});
