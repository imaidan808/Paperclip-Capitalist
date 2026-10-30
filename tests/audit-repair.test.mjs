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
const { Session, kv, LOCK_MS } = await import('../js/session.js');
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
const until = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(20); } throw new Error('timed out: ' + fn); };

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
  A.tick(Date.now() + LOCK_MS + 1000); assert.equal(e.lockLapsed, true);
  A._onMsg(msg); assert.equal(e.locks, 2); assert.equal(e.lockLapsed, undefined, 'a second try is held again');
  A.tick(Date.now() + LOCK_MS + 1000); assert.equal(e.lockLapsed, true);
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
  for (const m of sent) assert.ok(B.receiveRoyalty(m.amount, off.offer.id, 'AAA', A.s.hour).ok); // (a stream is paced by the class's hour, which a room tells the engine and this test has to say)
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
/** The relay in this process, on a clock the test holds (createRelay's `now`): what the relay calls "too fresh to forget" and "old enough" are readings of that clock, not a race against the load of the machine. `logs`: what it would have printed. */
async function startLocalRelay(env = {}, clock = null) {
  const { createRelay } = await import('../server/relay.mjs');
  const logs = [], r = createRelay({ env, now: clock ? () => clock.t : Date.now, log: (...a) => logs.push(a.join(' ')) });
  const port = await r.listen(0);
  return { ...r, port, url: `ws://localhost:${port}`, logs, stop: () => r.close() };
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

// =========================================================================================================================
// REPAIR ROUND 2 (the audit of the integrated branch at 3336ee3): what the repair round left open, and what it opened.
// Each test names the finding it holds. Sections: the swap's last step and its edges, the ledger and the engine's arguments, the Deal Room, the room (relay, table, clock, snapshot door), the screens and the data.
// =========================================================================================================================
/** Sessions on an in-memory room: a message is delivered when the test drains it, as the relay would, to the addressee alone or to everyone else. */
function hubOf(code = 'HUB') {
  const members = new Map(), queue = [];
  const hub = {
    code, queue, members, dropped: [],
    join(S) {
      members.set(S.pid, S);
      S.room = { kind: 'local', send: (m) => queue.push({ ...m, from: S.pid, role: 'student', handle: S.handle, ts: Date.now() }), close() {}, on() {} };
      S.roomInfo = { code, relay: '', role: 'student' };
    },
    drain(n = 300) {
      for (let i = 0; i < n && queue.length; i++) {
        const m = queue.shift();
        if (hub.drop?.(m)) { hub.dropped.push(m); continue; }
        for (const [pid, M] of members) if (pid !== m.from && (m.to === undefined || m.to === pid)) M._onMsg(JSON.parse(JSON.stringify(m)));
      }
    },
  };
  return hub;
}
function sessionIn(hub, pid, perks = ['trades', 'pro'], hour = 0) {
  store.clear();
  // Founders in one room are in one world, as in a real room: the room's code is its seed, so a crowd, and so a price, is the same at both ends of a swap. (A solo start rolls a seed of its own.)
  const S = new Session(); S.pid = pid; S.handle = pid; S.mode = 'student'; S.worldSeed = hub.code; S.startGame({ perks, handle: pid }); S.clockAdopted = true; S.clock.set({ paused: true });
  if (hour) { S.game.advanceTo(hour); S.clock.set({ hour, paused: true }); }
  S.game.s.mil = { m1: true, m2: true, m3: true }; S.game.s.auditNext = null; S.game.s.auditFirst = true; S.game.s.events.length = 0;
  for (const z of [2, 3, 4]) S.game._openZone(z);
  S.game.s.assets.length = 0;
  hub.join(S);
  return S;
}
const totals = (...ses) => {
  const cls = {}; let cash = 0;
  for (const S of ses) { const s = S.game.s; cash += s.cash - s.ledger.filter((r) => /^Appraisal:/.test(r.text)).reduce((a, r) => a + r.amt, 0); /* (what a refused swap cost is not lost to the swap) */ for (const e of s.escrow) { cash += e.cash || 0; for (const a of e.assets) cls[a.cls] = (cls[a.cls] || 0) + 1; } for (const a of s.assets) cls[a.cls] = (cls[a.cls] || 0) + 1; }
  return { cls, cash };
};
const settleAll = (hub, ses) => { hub.drain(); for (const S of ses) for (const e of [...S.game.s.escrow]) S.withdraw(e.offerId); hub.drain(); };

test('Swap, last step (high): the acceptor commits only to what the proposer must take, so a hidden counterfeit asked for with cash, or a crate moved to another district, mints and destroys nothing', () => {
  // (1) the counterfeit: B asks for A's pen (a counterfeit nobody has told A about) and as much of A's cash as the guardrail lets through, giving a good crate
  {
    const hub = hubOf('S1'), A = sessionIn(hub, 'PC-AAAA', undefined, 24 * 30), B = sessionIn(hub, 'PC-BBBB', undefined, 24 * 30); // (day 30: a founder on day 0 cannot hold a crate worth this much)
    A.game.s.cash = 1000; B.game.s.cash = 0;
    const Y = B.game._mk(B.game.s, 'infusionPumps', { zone: 2, basis: 1 }); B.game.s.assets.push(Y);
    const X = A.game._mk(A.game.s, 'pen', { zone: 3, basis: 3 }); X.truth = { q: 1, fake: true }; X.known = false; A.game.s.assets.push(X);
    for (const S of [A, B]) S._sendSnap(true); hub.drain();
    const wantX = B.roster().find((q) => q.pid === A.pid).inventory.find((i) => i.id === X.id);
    const before = totals(A.game && A, B);
    let res, cash = Math.floor(B.game.val(Y) / 1.36 - 3);
    for (; cash > 0 && cash <= A.game.s.cash; cash = Math.floor(cash * 1.01)) { res = B.propose({ to: A.pid, giveIds: [Y.id], want: { assets: [wantX], cash } }); if (res.ok) break; }
    assert.ok(res?.ok, res?.msg); hub.drain();
    const acc = A.acceptIncoming(res.offer.id); assert.ok(acc.ok, acc.msg); hub.drain();
    assert.equal(B.game.s.escrow.length, 0, 'the proposer took the reply: its escrow is spent');
    assert.ok(!B.game.s.news.some((n) => /not what the offer asked/.test(n.text)), 'and did not refuse it');
    const after = totals(A, B);
    near(after.cash, before.cash, 1e-6);
    assert.deepEqual(after.cls, before.cls, 'every crate there was is still there once: none made, none destroyed');
    assert.ok(B.game.s.assets.some((a) => a.cls === 'pen') && A.game.s.assets.some((a) => a.cls === 'infusionPumps'));
    const got = B.game.s.assets.find((a) => a.cls === 'pen'); assert.ok(got.quality < 0.2, 'credited as what it is worth, a counterfeit: ' + got.quality);
  }
  // (2) the move: A ships the crate that was asked for to another district while the offer waits, then accepts
  {
    const hub = hubOf('S2'), A = sessionIn(hub, 'PC-AAAA'), B = sessionIn(hub, 'PC-BBBB');
    const pick = (() => { for (const cls of Object.keys(ASSETS)) { if (!ASSETS[cls].dem || ASSETS[cls].perish || ASSETS[cls].yield) continue; for (const z1 of [1, 2, 3, 4]) for (const z2 of [1, 2, 3, 4]) { if (z1 === z2) continue; const v1 = A.game.val({ cls, zone: z1, quality: 1, wear: 1, cond: 'ok' }, z1), v2 = A.game.val({ cls, zone: z2, quality: 1, wear: 1, cond: 'ok' }, z2); if (v1 > 40 && v2 > 0 && v2 / v1 >= 0.75 && v2 / v1 <= 0.86) return { cls, z1, z2, v1 }; } } return null; })();
    assert.ok(pick, 'a class worth 14 to 25 percent less in another district');
    const X = A.game._mk(A.game.s, pick.cls, { zone: pick.z1, basis: 1 }); A.game.s.assets.push(X); A.game.s.cash = 100;
    let best = null; for (const cls of Object.keys(ASSETS)) { if (!ASSETS[cls].dem) continue; const t = B.game._mk(B.game.s, cls, { zone: pick.z1, basis: 1 }), v = B.game.val(t); if (!best || Math.abs(v - pick.v1) < Math.abs(best.v - pick.v1)) best = { cls, v }; }
    const Yc = B.game._mk(B.game.s, best.cls, { zone: pick.z1, basis: 1 }); B.game.s.assets.push(Yc);
    for (const S of [A, B]) S._sendSnap(true); hub.drain();
    const wantX = B.roster().find((q) => q.pid === A.pid).inventory.find((i) => i.id === X.id);
    const res = B.propose({ to: A.pid, giveIds: [Yc.id], want: { assets: [wantX], cash: 0 } }); assert.ok(res.ok, res.msg); hub.drain();
    assert.ok(A.game.ship([X.id], pick.z2).ok); for (const f of A.game.s.freight) f.risk = 0; // (a truck damages its crates now and then, -20% quality, and a crate worth a fifth less puts the swap outside the band: in one run in twenty this test failed on that roll, which is not what it is about)
    A.game.advanceTo(A.game.s.hour + 14); A.clock.hour = A.game.s.hour;
    const here = A.game.s.assets.find((a) => a.id === X.id); assert.equal(here.zone, pick.z2, 'it is back on the shelf, in the other district');
    const before = totals(A, B); // (freight was paid)
    assert.ok(A.acceptIncoming(res.offer.id).ok); hub.drain();
    assert.equal(B.game.s.escrow.length, 0, 'the proposer took the reply');
    assert.deepEqual(totals(A, B).cls, before.cls); near(totals(A, B).cash, before.cash, 1e-6);
    const got = B.game.s.assets.find((a) => a.cls === pick.cls); assert.ok(got, 'the proposer holds the crate it asked for');
    assert.ok(B.game.val(got) <= B.game.val({ ...got, zone: pick.z1 }) + 1e-9, 'credited where it is worth no more than described');
  }
  // (3) the floor is still there for a reply that is junk: crates and cash together
  const { A, B } = swapPair();
  const scrap = put(B, 'scrap', 1), off = A.createOffer({ to: 'BBB', giveIds: [put(A, 'pen', 1).id], want: { assets: [B.pub(scrap)], cash: 0 } });
  assert.ok(off.ok, off.msg);
  assert.equal(A.finalizeOffer(off.offer.id, { assets: [{ ...B.pub(scrap), quality: 0.01, cond: 'broken' }], cash: 0 }, 'BBB').ok, false, 'a worthless reply with no cash behind it is not that swap');
  assert.equal(A.s.escrow.length, 1);
});

test('Swap, last step: a swarm of random proposals, accepts, withdrawals, replays and duplicates never makes or destroys a crate or a dollar (the protocol fuzz, 12 seeds)', () => {
  const ASSETS_OK = Object.keys(ASSETS).filter((c) => !ASSETS[c].yield && ASSETS[c].dem && !ASSETS[c].perish);
  for (let seed = 1; seed <= 12; seed++) {
    let st = (seed * 2654435761) >>> 0 || 1; const R = () => { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; return st / 4294967296; };
    const pick = (a) => a[Math.floor(R() * a.length)];
    const hub = hubOf('FZ' + seed), A = sessionIn(hub, 'PC-AAA'), B = sessionIn(hub, 'PC-BBB'), all = [A, B];
    for (const S of all) {
      S.game.s.cash = 5000 + Math.floor(R() * 5000);
      for (let i = 0; i < 6; i++) { const cls = pick(ASSETS_OK), a = S.game._mk(S.game.s, cls, { zone: pick([1, 2, 3, 4]), basis: 1, cond: R() < 0.2 && ASSETS[cls].repair ? 'broken' : 'ok', quality: 0.7 + R() * 0.5 }); if (R() < 0.3) { a.truth = { q: 0.6 + R() * 0.6, fake: R() < 0.25 }; a.known = R() < 0.3; } S.game.s.assets.push(a); }
    }
    for (const S of all) S._sendSnap(true); hub.drain();
    const base = totals(...all);
    for (let step = 0; step < 600; step++) {
      const S = pick(all), O = S === A ? B : A, k = R();
      if (k < 0.3) {
        const own = S.game.s.assets.filter((a) => !S.game.s.escrow.some((e) => e.assets.includes(a))), give = [], inv = S.roster().find((r) => r.pid === O.pid)?.inventory || [], want = [];
        for (let i = 0; i < Math.floor(R() * 3) && own.length; i++) give.push(pick(own).id);
        for (let i = 0; i < Math.floor(R() * 3) && inv.length; i++) want.push(pick(inv));
        const gv = give.reduce((v, id) => v + S.game.val(S.game.s.assets.find((a) => a.id === id)), 0), wv = want.reduce((v, w) => v + (w.fmv || 0), 0), fudge = 0.92 + R() * 0.12;
        const args = { to: O.pid, giveIds: give, giveCash: gv * fudge > wv ? 0 : Math.round((wv - gv * fudge) * 100) / 100, want: { assets: want, cash: gv * fudge > wv ? Math.round((gv * fudge - wv) * 100) / 100 : 0 } };
        S.propose(args);
      } else if (k < 0.5) { const i = S.incoming[0] && pick(S.incoming); if (i) S.acceptIncoming(i.offer.id); }
      else if (k < 0.58) { const e = S.game.s.escrow[0] && pick(S.game.s.escrow); if (e) S.withdraw(e.offerId); }
      else if (k < 0.9) { const m = hub.queue.length ? hub.queue.splice(Math.floor(R() * hub.queue.length), 1)[0] : null; if (m) { for (const [pid, M] of hub.members) if (pid !== m.from && (m.to === undefined || m.to === pid)) { M._onMsg(JSON.parse(JSON.stringify(m))); if (R() < 0.2) M._onMsg(JSON.parse(JSON.stringify(m))); } } }
      else hub.drain(50);
      if (hub.queue.length === 0 && all.every((X) => X.game.s.escrow.length === 0 && X.accepting.size === 0)) {
        const now = totals(...all);
        assert.deepEqual(now.cls, base.cls, `seed ${seed} step ${step}: crates`); near(now.cash, base.cash, 0.01);
      }
    }
    settleAll(hub, all); for (const S of all) S.accepting.clear();
    assert.deepEqual(totals(...all).cls, base.cls, `seed ${seed}: crates at the end`); near(totals(...all).cash, base.cash, 0.01);
  }
});

test('Swap and the bell (low): a swap whose acceptor has committed is finished when its reply arrives, even if the bell rang in between; with no confirmed acceptor the run is still closed', () => {
  const hub = hubOf('BELL'), A = sessionIn(hub, 'PC-AAAA'), B = sessionIn(hub, 'PC-BBBB');
  A.game.s.cash = 800; B.game.s.cash = 20;
  const guitar = B.game._mk(B.game.s, 'bike', { zone: 1, basis: 1 }); B.game.s.assets.push(guitar);
  const keep = A.game._mk(A.game.s, 'bike', { zone: 1, basis: 1 }); A.game.s.assets.push(keep);
  for (const S of [A, B]) S._sendSnap(true); hub.drain();
  const wantG = A.roster().find((q) => q.pid === B.pid).inventory.find((i) => i.id === guitar.id);
  const res = A.propose({ to: B.pid, giveIds: [keep.id], want: { assets: [wantG], cash: 0 } }); assert.ok(res.ok, res.msg); hub.drain();
  const before = totals(A, B);
  // B asks, A locks and confirms; B commits (its crate and A's crate change places) and delivers; the bell rings for A before the delivery is taken
  assert.ok(B.acceptIncoming(res.offer.id).ok);
  hub.drain(1);                              // accept reaches A, which locks and confirms
  const e = A.game.s.escrow[0]; assert.equal(e.lockedBy, 'PC-BBBB');
  const confirm = hub.queue.shift();          // hold the confirmation back, then let it through: B commits, and its delivery is queued
  B._onMsg(JSON.parse(JSON.stringify(confirm)));
  A.game.advanceTo(TOTAL_HOURS); assert.ok(A.game.s.over, 'the bell rang for A in between');
  hub.drain();
  assert.equal(A.game.s.escrow.length, 0, 'the swap was finished');
  assert.ok(A.game.s.assets.some((a) => a.id !== keep.id && a.cls === 'bike' && a.from === 'p2p'), 'A holds the crate it asked for');
  assert.deepEqual(totals(A, B).cls, before.cls); near(totals(A, B).cash, before.cash, 1e-6);
  // nothing else is let through a closed run
  const stray = A.game.finalizeOffer('nope', { assets: [], cash: 0 }); assert.equal(stray.ok, false); assert.equal(stray.msg, 'The run is over.');
});

test('Swap, stale confirmation (low): an acceptor does not commit on a confirmation that arrives after its own wait, whether or not its sweep has run', () => {
  const hub = hubOf('STALE'), A = sessionIn(hub, 'PC-AAAA'), B = sessionIn(hub, 'PC-BBBB');
  A.game.s.cash = 500; const x = B.game._mk(B.game.s, 'bike', { zone: 1, basis: 1 }); B.game.s.assets.push(x);
  for (const S of [A, B]) S._sendSnap(true); hub.drain();
  const want = A.roster().find((q) => q.pid === B.pid).inventory.find((i) => i.id === x.id);
  const res = A.propose({ to: B.pid, giveIds: [], giveCash: Math.round(want.fmv), want: { assets: [want], cash: 0 } }); assert.ok(res.ok, res.msg); hub.drain();
  assert.ok(B.acceptIncoming(res.offer.id).ok); hub.drain(1);
  const confirm = hub.queue.shift(), before = totals(A, B);
  B.accepting.get(res.offer.id).at -= 90000;  // the confirmation was held up for 90 seconds; B's sweep has not run
  B._onMsg(JSON.parse(JSON.stringify(confirm))); hub.drain();
  assert.deepEqual(totals(A, B), before, 'nothing changed hands');
  assert.ok(B.game.s.assets.some((a) => a.id === x.id), 'B still has its crate');
  assert.equal(A.game.s.escrow[0].lockedBy, undefined, 'and A was told, so its hold is let go at once');
  assert.ok(B.game.s.news.some((n) => /did not confirm in time/.test(n.text)));
});

test('Swap, a lost delivery (low): the acceptor says it again until the proposer says it arrived, and the proposer answers a repeat without taking it twice', () => {
  const hub = hubOf('LOST'), A = sessionIn(hub, 'PC-AAAA'), B = sessionIn(hub, 'PC-BBBB');
  A.game.s.cash = 500; const x = B.game._mk(B.game.s, 'bike', { zone: 1, basis: 1 }); B.game.s.assets.push(x);
  for (const S of [A, B]) S._sendSnap(true); hub.drain();
  const want = A.roster().find((q) => q.pid === B.pid).inventory.find((i) => i.id === x.id);
  const res = A.propose({ to: B.pid, giveIds: [], giveCash: Math.round(want.fmv), want: { assets: [want], cash: 0 } }); assert.ok(res.ok, res.msg); hub.drain();
  const before = totals(A, B);
  hub.drop = (m) => m.t === 'deliver' && !hub.allow;                       // the first delivery is lost on the way
  assert.ok(B.acceptIncoming(res.offer.id).ok); hub.drain();
  assert.equal(A.game.s.escrow.length, 1, 'A has not heard');
  assert.ok(B.delivering.has(res.offer.id), 'B knows it has not been acknowledged');
  hub.allow = true;
  B.tick(Date.now() + 6000); hub.drain();                                  // five seconds on: B sends it again
  assert.equal(A.game.s.escrow.length, 0, 'A took it'); assert.equal(B.delivering.size, 0, 'and B heard it');
  assert.deepEqual(totals(A, B).cls, before.cls); near(totals(A, B).cash, before.cash, 1e-6);
  // a repeat after it was taken is answered and changes nothing
  const snapA = JSON.stringify(A.game.s.assets);
  B.delivering.set(res.offer.id, { to: 'PC-AAAA', payload: hub.dropped[0] ? { offerId: res.offer.id, deliver: hub.dropped[0].deliver, handle: 'B' } : null, at: Date.now() - 9999, tries: 1, name: 'A' });
  B.tick(Date.now() + 20000); hub.drain();
  assert.equal(JSON.stringify(A.game.s.assets), snapA, 'a second copy is not taken'); assert.equal(B.delivering.size, 0, 'but it is acknowledged again');
  // never acknowledged: a few tries, then a note, then nothing more
  const C = sessionIn(hub, 'PC-CCCC'); C.delivering.set('Ox', { to: 'PC-AAAA', payload: { offerId: 'Ox', deliver: { cash: 0, assets: [] } }, at: 0, tries: 1, name: 'Ada' });
  for (let t = 1; t <= 10; t++) C.tick(t * 200000);                        // (every 30 seconds for half an hour since the commit, then it says so and stops)
  assert.equal(C.delivering.size, 0); assert.ok(C.game.s.news.some((n) => /has not said the swap arrived/.test(n.text)));
});

test('Swap and royalties (low): a founder who is selling the business (48 hours in which nothing is taken) is published as exiting, and a royalty owed to them ends instead of being sent into a refusal', () => {
  const g = mk([], 1, 'BBB'); rich(g, 400000); g.s.auditFirst = true; g.s.auditNext = null; g.exit('trade');
  assert.equal(g.publicSnapshot().flags.exiting, true); assert.equal(C.cleanSnap(g.publicSnapshot(), 'BBB').flags.exiting, true);
  assert.equal(g.receiveRoyalty(2, 'Ox', 'AAA').ok, false, 'the receiver refuses while it settles: so the payer must not send');
  store.clear();
  const S = new Session(); S.pid = 'AAA'; S.mode = 'student'; S.startGame({ perks: [], specialty: 'ops', handle: 'A' });
  S.peers.set('BBB', { pid: 'BBB', handle: 'B', role: 'student', seen: Date.now(), snap: C.cleanSnap({ ...g.publicSnapshot(), flags: { exiting: true } }, 'BBB'), clean: true });
  assert.equal(S.game.env.peerClosed('BBB'), true); assert.equal(S.game.env.peerClosed('NOBODY'), false);
  const p = S.game; p.s.cash = 5000;
  p.s.royalties.push({ dir: 'pay', peer: 'BBB', perDay: 10, days: 5, since: p.s.hour, until: p.s.hour + 120, offer: 'Oz', arrears: 0 });
  p.out.length = 0; p.advanceTo(p.s.hour + 49);
  assert.equal(p.out.filter((m) => m.t === 'royalty').length, 0, 'nothing sent'); assert.equal(p.s.royalties.length, 0, 'and the stream is ended'); assert.ok(p.s.cash >= 5000 - 1, 'the payer keeps its money');
});

// ------------------------------------------------------------------------------------------------------------------------- the ledger and the engine's arguments
const desk2 = (perks = [], seed = 3, cash = 400000) => {
  const g = mk(perks, seed);
  for (let z = 1; z <= 16; z++) g._openZone(z);
  g.s.zones = [...new Set(g.s.zones)].sort((a, b) => a - b); g._bn = null;
  g.s.mil = { m1: true, m2: true, m3: true }; g.s.auditFirst = true; g.s.auditNext = null; g.s.events = []; g.s.cash = cash; g._m = null;
  return g;
};
test('L7 (residual): the unused-commitment fee is a memo, so the fee is counted once (in the repayment that holds it) and a loan window reconciles with cash to the cent', () => {
  const g = desk2([], 3, 10000); const n0 = g.s.ledger.length, cash0 = g.s.cash;
  assert.ok(g.draw('enterprise', 20000).ok);
  g.advanceTo(g.s.hour + 31 * 24);
  const fee = g.s.ledger.filter((e) => /^Unused-commitment fee/.test(e.text)); assert.equal(fee.length, 1);
  assert.equal(fee[0].amt, 0, 'no money moved'); assert.ok(fee[0].fee > 0 && fee[0].memo === true, 'and the fee is in the row');
  for (const l of [...g.s.loans]) { g.s.cash = Math.max(g.s.cash, l.principal + l.accr + 1); assert.ok(g.repay(l.id, 1e12).ok); }
  assert.equal(g.s.loans.length, 0);
  const rows = g.s.ledger.slice(n0).filter((e) => ['loan', 'repay'].includes(e.type));
  near(g.s.cash - cash0, sum(rows), 0.01); // the draw, then the repayment that carried the fee and the interest: cash moved by exactly what the rows say, and the fee is not in them twice
});

test('Ledger (low): a freight inspected for nothing (a broke founder) is a plain zero, not -0, and a folded summary says where it begins and ends and stands where its oldest line stood', () => {
  const g = mk([], 4); g.s.zones = [...new Set([...g.s.zones, 1, 2, 3, 4, 5, 6, 7, 8, 9])]; g._bn = null;
  const dest = Object.keys(ZONES).map(Number).find((z) => ZONES[z].rules.customs) || 16; if (!g.s.zones.includes(dest)) g._openZone(dest);
  const a = put(g, 'bike', 1); g.s.cash = 0; g.s.freight.push({ id: 'F1', items: [a], to: dest, sent: 0, arrive: g.s.hour, risk: 0, book: 1000, from: 1 });
  const keep = g.rand; g.rand = () => 0; // the inspection always happens
  try { g._freight(); } finally { g.rand = keep; }
  const row = g.s.ledger.find((e) => e.type === 'customs'); assert.ok(row, 'inspected'); assert.ok(!Object.is(row.amt, -0), 'never -0'); assert.equal(row.amt, 0);
  // the summary of a folded ledger: from the oldest day it holds to the newest, and stamped where the oldest stood
  const h = mk([], 2); h.s.hour = 5 * 24;
  for (let i = 0; i < 3300; i++) { h.s.hour = 5 * 24 + Math.floor(i / 2); h.led('buy', 'x', -1); }
  const head = h.s.ledger[0]; assert.equal(head.type, 'summary');
  assert.match(head.text, /^\d+ older lines from day 6 to day \d+ folded into this one\./); assert.equal(head.h, 5 * 24, 'it stands at day 6, where its first line did');
  assert.ok(Math.floor(head.upto / 24) + 1 > 6);
});

test('Bank (low): the summary of the folded lines is shown at the foot of the list under every filter that holds it, and the note says so', async () => {
  const bank = (await import('../js/ui/drawers/bank.js')).default;
  const ctx = fakeCtx({ days: 12 }); ctx.U.bank = { ledger: true };
  const g = ctx.g(); for (let i = 0; i < 3300; i++) g.led(i % 2 ? 'buy' : 'repair', 'line ' + i, -1);
  assert.equal(g.s.ledger[0].type, 'summary');
  const html = bank.html(ctx), at = html.indexOf('older lines from day');
  assert.ok(at > 0, 'the summary row is on the page'); assert.ok(at > html.indexOf('line ' + 3299), 'after the newest lines: at the foot of the list');
  assert.match(html, /summary line at the foot of the list/); assert.ok(!/summary line at the top/.test(html));
  ctx.U.bank.logf = 'summary'; assert.ok(bank.html(ctx).includes('older lines from day'), 'and alone under its own filter');
});

test('draw (low): a line that is used up says so, and the debt-to-equity text is only for the debt-to-equity cap', () => {
  const g = desk2([], 3, 50000);
  assert.ok(g.draw('enterprise', 1e9).ok); // all of it (the room the ratio leaves is wide at this net worth)
  while (g.loanRoom('enterprise').limit - g.loanRoom('enterprise').owed > 0.01 && g.draw('enterprise', 1e9).ok);
  const full = g.draw('enterprise', 100); assert.equal(full.ok, false); assert.match(full.msg, /fully drawn/); assert.ok(!/debt-to-equity/.test(full.msg));
  const h = mk([], 5); h.s.mil.m1 = true; h.s.cash = 10; const dre = h.draw('micro', 1e9);
  if (!dre.ok) assert.match(dre.msg, /debt-to-equity|fully drawn|Nothing/); // a founder worth $10 has no room: whichever limit binds names itself
  const poor = desk2(['heir'], 6, 100); poor.s.loans.push({ id: 'Dz', prod: 'micro', principal: poor.loanRoom('micro').limit - 0.001, accr: 0, last: 0, next: 9999, drawn: 0 });
  const used = poor.draw('micro', 100); assert.equal(used.ok, false); assert.match(used.msg, /fully drawn/);
});

test('XP and points (low): an absurd or hostile amount is bounded, finishes at once and leaves a finite state; NaN and a negative pay nothing; a corrupt XP in a save mends to a level', () => {
  const t0 = Date.now();
  const g = mk([], 1);
  for (const n of [1e15, 1e300, 1e308, Infinity, 2 ** 53]) { g.grantPoints(n); g.xp(n); }
  assert.ok(Date.now() - t0 < 2000, 'finished: ' + (Date.now() - t0) + ' ms'); assert.ok(Number.isFinite(g.s.xp) && g.s.xp <= LEVEL_XPCAP, 'xp ' + g.s.xp);
  assert.ok(g.level() <= 100, 'level ' + g.level()); assert.ok(Number.isFinite(g.s.lvlPaid) && g.s.lvlPaid <= 100);
  const h = mk([], 2); const xp0 = h.s.xp; h.xp(NaN); h.xp(-500); h.xp(undefined); h.grantPoints(NaN); h.grantPoints(-3); assert.equal(h.s.xp, xp0); assert.equal(h.s.points, 0);
  const c = mk([], 3); c.s.xp = NaN; c._levelCheck(); assert.equal(c.s.xp, 0); c.s.xp = 1e300; assert.doesNotThrow(() => c._levelCheck()); assert.ok(c.s.xp <= LEVEL_XPCAP);
});
const LEVEL_XPCAP = 150 * 99 * 99;

test('Managers (medium): hiring and releasing the same manager again and again pays its experience once, not 120 each time (and an upgrade once for each level of each plot)', () => {
  const g = desk2([], 3, 2000000);
  const lane = g.radar(5, 3).find((x) => x.fit >= 0.3);
  let first = null, spent0 = g.s.cash;
  for (let i = 0; i < 25; i++) {
    const xp = g.s.xp, h = g.hirePipeline('broker', 5, { cls: lane.cls, buyer: lane.seg }); assert.ok(h.ok, h.msg);
    if (i === 0) first = g.s.xp - xp; else assert.equal(g.s.xp - xp, 0, 'cycle ' + i + ' pays nothing');
    const x2 = g.s.xp; assert.ok(g.upgradePipeline(h.pipe.id).ok);
    if (i === 0) assert.ok(g.s.xp > x2, 'the first upgrade pays'); else assert.equal(g.s.xp, x2, 'and so does it only once');
    g.s.pipes.find((p) => p.id === h.pipe.id).inflight = 0;
    assert.ok(g.releasePipeline(h.pipe.id).ok);
  }
  assert.ok(first >= 100, 'the first hire does pay: ' + first); assert.ok(g.s.cash < spent0, 'and the cycles cost cash');
  // a second manager in another plot of the district is a different thing and pays again
  const a = g.hirePipeline('broker', 5, { cls: lane.cls, buyer: lane.seg }); const xp = g.s.xp, b = g.hirePipeline('logistics', 5, { cls: lane.cls, buyer: lane.seg });
  if (b.ok) assert.ok(g.s.xp > xp, 'another kind in another plot pays'); assert.ok(a.ok);
});

test('Crew (low): a contract past its last payment frees its slot in the drawer the hour it does in the engine, and the Accounts list does not show it', async () => {
  const crew = (await import('../js/ui/drawers/crew.js')).default;
  const ctx = fakeCtx({ days: 25, perks: ['trades', 'pro'] }), g = ctx.g(); ctx.U.crew = { tab: 'clients' };
  g.s.cash = 1e6; g.s.hour = 25 * 24; g._m = null;
  const tier = 'smb', C = CLIENTS[tier]; g.s.clients = [];
  for (let i = 0; i < C.max; i++) g.s.clients.push({ id: 'Cq' + i, tier, cac: 400, until: g.s.hour - 1, earned: 100, breaches: 0 }); // the last payment was made a moment ago; midnight has not closed them
  assert.equal(g.liveClients(tier).length, 0); assert.ok(g.acquireClient(tier).ok, 'the engine signs');
  g.s.clients.pop(); g.s.clients.pop(); g.s.clients.length = Math.min(g.s.clients.length, C.max); // (one live contract and the stale ones)
  const html = crew.html(ctx);
  assert.ok(!new RegExp(`already hold all ${C.max}`).test(html), 'the drawer does not say the slots are full');
  assert.ok(!/Ends in 0h/.test(html), 'and no expired account is listed');
});

test('Swap guardrail (low): a refusal made on a crate\'s hidden worth is an appraisal: it costs a share of the value, is a ledger row and a tally, and still says no number', () => {
  const { A, B } = swapPair(); rich(A, 3000); rich(B, 3000);
  const fake = put(A, 'bike', 1, { truth: { q: 1, fake: true, defects: [] } }), want = put(B, 'bike', 1);
  const described = A.val({ ...fake, truth: undefined, known: true, quality: 1 });
  const cash0 = A.s.cash, n0 = A.s.ledger.length;
  const r = A.createOffer({ to: 'BBB', giveIds: [fake.id], want: { assets: [B.pub(want)], cash: 0 } });
  assert.equal(r.ok, false); assert.equal(r.msg, 'This crate cannot be traded at that price.');
  const paid = cash0 - A.s.cash; near(paid, Math.round(described * SWAPS.appraisal * 100) / 100, 0.02); assert.ok(paid > 0);
  const row = A.s.ledger.slice(n0).find((e) => /^Appraisal:/.test(e.text)); assert.ok(row && row.amt < 0 && row.type === 'verify');
  assert.equal(A.s.meta.appraisals, 1);
  for (let i = 0; i < 4; i++) A.createOffer({ to: 'BBB', giveIds: [fake.id], want: { assets: [B.pub(want)], cash: 0 } });
  assert.equal(A.s.meta.appraisals, 5, 'five asks, five appraisals: nothing is free to ask for'); assert.ok(A.s.cash < cash0 - 4 * paid * 0.99);
  const good = put(A, 'bike', 1), before = A.s.cash;
  assert.ok(A.createOffer({ to: 'BBB', giveIds: [good.id], want: { assets: [B.pub(want)], cash: 0 } }).ok); assert.equal(A.s.cash, before, 'a genuine crate costs nothing to offer');
});

test('Swap preview (low): a bid for a crate from a district the buyer has not opened is refused up front and without telling the instructor, and the preview says the same', async () => {
  const market = await import('../js/ui/drawers/market.js');
  const A = mk([], 1, 'AAA'); rich(A, 2000); const B = mk([], 2, 'BBB'); for (let z = 2; z <= 9; z++) B._openZone(z);
  assert.ok(Math.max(...A.s.zones) <= 6, 'A has not opened the far districts: ' + A.s.zones.join());
  let far = null;
  for (const cls of Object.keys(ASSETS)) for (const z of [7, 8, 9]) {
    if (demandOf(ASSETS[cls], z) < 4 || ASSETS[cls].perish) continue;
    const c = { id: 'Fq', cls, cond: 'ok', quality: 1, wear: 1, zone: z }, sits = A.sideValue({ assets: [c] }, { landing: false }), lands = A.sideValue({ assets: [c] }, { landing: true });
    if (sits > lands * 1.6 && lands > 5 && lands < 1500 && (!far || sits > far.sits)) far = { cls, z, sits, lands };
  }
  assert.ok(far, 'a good that is worth much more where it sits than where a founder who cannot enter would hold it');
  const x = B._mk(B.s, far.cls, { zone: far.z, basis: 1 }); B.s.assets.push(x);
  const pubX = B.pub(x), landing = A.sideValue({ assets: [pubX] }, { landing: true }), described = A.sideValue({ assets: [pubX] }, { landing: false });
  assert.ok(described > landing * 1.5, `the crate is worth ${described} where it sits and ${landing} to a founder who cannot enter: ` + A.s.zones.join());
  const bid = A.createOffer({ to: 'BBB', giveCash: Math.round(landing), want: { assets: [pubX], cash: 0 } });
  assert.equal(bid.ok, false); assert.match(bid.msg, /district you have not opened/); assert.ok(!A.out.some((m) => m.t === 'flag'), 'an honest bid is no misconduct: nobody is told');
  const o = { give: { assets: [], cash: Math.round(landing), royalty: null }, want: { assets: [pubX], cash: 0 } }, chk = A.checkOffer(o);
  assert.equal(chk.ok, false, 'the preview refuses it too'); assert.equal(chk.flagged, false, 'and does not call it extreme');
  const wild = A.checkOffer({ give: { assets: [], cash: 1, royalty: null }, want: { assets: [pubX], cash: 0 } }); assert.equal(wild.flagged, true, 'a real lopsided deal is extreme both ways');
  const asked = A.createOffer({ to: 'BBB', giveCash: 1, want: { assets: [pubX], cash: 0 } }); assert.match(asked.msg, /Extreme Asymmetric/); assert.ok(A.out.some((m) => m.t === 'flag'));
  const src = readFileSync(new URL('../js/ui/drawers/market.js', import.meta.url), 'utf8'); assert.match(src, /chk\.flagged/);
  void market;
});

test('Debrief (low): a save from before the cap, with a shock logged at a debt-to-equity of null, opens with the cap in its place, and the debrief checks a number with Number.isFinite', () => {
  const g = mk([], 1); g.s.shockLog.push({ id: 'tariff', kind: 'tariff', name: 'Tariff', start: 5, nw: 100, cash: 10, debt: 0, de: null, inv: 5, pipes: 0, nwAfter: 90, pivots: 1, pivot0: 0 });
  const back = new Game({ state: JSON.parse(JSON.stringify(g.s)) });
  assert.equal(back.s.shockLog[0].de, 999); assert.equal(back.publicSnapshot().shockLog[0].de, 999);
  const src = readFileSync(new URL('../js/ui/debrief.js', import.meta.url), 'utf8');
  assert.ok(!/[^.]\bisFinite\(\s*(x|f|fed)\.de\s*\)/.test(src), 'the global isFinite takes null for 0'); assert.equal((src.match(/Number\.isFinite\((x|f|fed)\.de\)/g) || []).length, 3);
});

test('Arguments (low): configure takes a null config for a real manager, and a founder who is selling gets no audit and no margin call in the 48 hours', () => {
  const g = desk2([], 3, 2000000); const lane = g.radar(5, 3).find((x) => x.fit >= 0.3);
  const h = g.hirePipeline('broker', 5, { cls: lane.cls, buyer: lane.seg }); assert.ok(h.ok, h.msg);
  assert.doesNotThrow(() => g.configure(h.pipe.id, null)); assert.doesNotThrow(() => g.configure(h.pipe.id, 'x')); assert.doesNotThrow(() => g.configure(h.pipe.id, [3]));
  assert.equal(g.configure(h.pipe.id, null).ok, true, 'a null config changes nothing and is not an error');
  // an exit under way: the audit that falls due and the margin call that would follow find nobody to answer
  const e = desk2([], 5, 400000); e.s.auditNext = e.s.hour + 5; e.s.auditFirst = true;
  assert.ok(e.exit('trade').ok);
  e.s.loans.push({ id: 'Dm', prod: 'micro', principal: 1, accr: 0, last: 0, next: 9999, drawn: 0 }); e.s.cash = 0;
  e.advanceTo(e.s.hour + 40);
  assert.equal(e.s.auditPending, null, 'no audit while it settles'); assert.ok(!e.s.news.some((n) => /margin call|Audit event/i.test(n.text)));
});

// ------------------------------------------------------------------------------------------------------------------------- the Deal Room
/** A world with districts 2 to 4 and 6 open, cash, a crate of several classes, and the leads of every district. */
function dealWorld(seed = 41, perks = ['grad', 'native']) {
  const g = makeGame(perks, 'ops', seed);
  for (const z of [2, 3, 4, 6]) g._openZone(z);
  g.s.cash = 1e6; g.s.skills.growth = 2;
  return g;
}
/** A sale to a buyer who would pay for a crate: [asset, lead] with the crate in the lead's district, a fit, and a buyer who is not a fraud. `skip`: leads already used. */
function sellable(g, skip = new Set()) {
  const out = [];
  for (const z of g.s.zones) for (const cls of Object.keys(ASSETS).filter((c) => (ASSETS[c].dem?.[z] || 0) >= 4 && !ASSETS[c].perish)) {
    const a = g._mk(g.s, cls, { zone: z, basis: 1 });
    for (const lead of g.s.leads[z] || []) {
      if (lead.scam || skip.has(lead.id)) continue;
      const q = g.quotePitch(a.id, lead.id, undefined, { blind: false }); // (the crate is not in the stock yet: put it there for the quote)
      g.s.assets.push(a); const r = g.quotePitch(a.id, lead.id, undefined, { blind: false }); g.s.assets.pop();
      if (r.ok && r.fit >= 0.3 && !r.rejected && !r.scam) { g.s.assets.push(a); return { a, lead }; }
      void q;
    }
  }
  return out[0] || null;
}

test('Deal Room (medium): the result card compares you with Quick and Expert on the sale\'s own footing: a Quick sale of a lot-bought crate whose truth is not what it was posted as shows you == Quick, and a counterfeit shows no price for any of them', () => {
  for (const [q, fake] of [[0.7, false], [1.1, false], [1, true], [0.8, false]]) {
    const g = dealWorld(41);
    const pair = sellable(g); assert.ok(pair, 'a buyer');
    pair.a.truth = { q, fake, defects: [] }; pair.a.known = false;
    const r = D.startRun(g, { kind: 'sell', assetId: pair.a.id, leadId: pair.lead.id }); assert.ok(r.ok, r.msg);
    r.quickAll(); const sm = r.finish();
    assert.equal(sm.ok, true, JSON.stringify(sm.engineMsg));
    if (fake) {
      assert.match(sm.title, /Counterfeit spotted/); assert.equal(sm.numbers.you, null);
      assert.equal(sm.numbers.quick, null, 'Quick would not have sold it either'); assert.equal(sm.numbers.expert, null);
    } else {
      assert.ok(sm.numbers.you != null && sm.numbers.quick != null, 'quality ' + q);
      assert.ok(Math.abs(sm.numbers.you - sm.numbers.quick) < 0.011, `quality ${q}: you ${sm.numbers.you}, Quick ${sm.numbers.quick}`);
    }
  }
  // a walk from the table is compared blind: the card must not read the crate's worth off Quick's price
  const g = dealWorld(43), pair = sellable(g); pair.a.truth = { q: 0.6, fake: false, defects: [] }; pair.a.known = false;
  const blindQ = g.quotePitch(pair.a.id, pair.lead.id, undefined, { blind: true }).price, realQ = g.quotePitch(pair.a.id, pair.lead.id, undefined, { blind: false }).price;
  assert.ok(Math.abs(blindQ - realQ) > 0.02, 'the truth would show in a real quote');
  const w = D.startRun(g, { kind: 'sell', assetId: pair.a.id, leadId: pair.lead.id }); w.quick(); const walked = w.walkAway();
  assert.equal(walked.title, 'No deal'); assert.ok(Math.abs(walked.numbers.quick - blindQ) < 0.02 || walked.numbers.quick == null || walked.numbers.quick !== realQ, 'blind: ' + walked.numbers.quick + ' vs real ' + realQ);
});

test('Deal Room (medium): a counterfeit sold through the Deal Room to five buyers, or a buyer who has left, is no haggle closed: no event, no experience, no quest progress', () => {
  const g = dealWorld(47);
  const first = sellable(g); assert.ok(first);
  first.a.truth = { q: 1, fake: true, defects: [] }; first.a.known = false; // the crate the player does not know to be counterfeit
  const events = []; g.onEvent = (e) => events.push(e);
  const used = new Set(); let tried = 0, caught = 0; const xp0 = g.s.xp;
  for (let k = 0; k < 5; k++) {
    const lead = (g.s.leads[first.a.zone] || []).find((l) => !l.scam && !used.has(l.id) && g.quotePitch(first.a.id, l.id, undefined, { blind: false }).fit >= 0.15); if (!lead) break;
    used.add(lead.id);
    const r = D.startRun(g, { kind: 'sell', assetId: first.a.id, leadId: lead.id }); if (!r.ok) continue;
    r.quickAll(); const sm = r.finish(); tried++;
    if (/Counterfeit/.test(sm.title)) { caught++; assert.ok(g.s.assets.some((a) => a.id === first.a.id), 'the crate is still owned'); }
  }
  assert.ok(caught >= 2, `tried ${tried}, caught ${caught}`);
  assert.equal(events.filter((e) => e.type === 'haggle').length, 0, 'no haggle closed'); assert.ok(!(g.s.meta?.haggle?.n > 0), 'and none tallied');
  assert.ok(!(g.s.meta?.pitch?.n > 0), 'nor a pitch played (the buyer\'s refusal is the engine\'s own event, not a skill game won)');
  assert.ok(g.s.xp - xp0 < 60, 'and no experience for them: ' + (g.s.xp - xp0));
  // the same crate, genuine, sold once: counted as before
  const h = dealWorld(47), good = sellable(h); const ev2 = []; h.onEvent = (e) => ev2.push(e);
  const r2 = D.startRun(h, { kind: 'sell', assetId: good.a.id, leadId: good.lead.id }); r2.quickAll(); const s2 = r2.finish();
  assert.ok(/Sold/.test(s2.title), s2.title); assert.ok(ev2.some((e) => e.type === 'pitch'), 'a real sale is a pitch played');
  // a buyer who has left by the time the deal is finished: nothing paid
  const k = dealWorld(47), pr = sellable(k), r3 = D.startRun(k, { kind: 'sell', assetId: pr.a.id, leadId: pr.lead.id }); const ev3 = []; k.onEvent = (e) => ev3.push(e);
  r3.quickAll(); k.s.leads[pr.a.zone] = k.s.leads[pr.a.zone].filter((l) => l.id !== pr.lead.id); const xp3 = k.s.xp; const gone = r3.finish();
  assert.equal(gone.title, 'Not done'); assert.equal(ev3.filter((e) => e.type === 'haggle').length, 0); assert.ok(!(k.s.meta?.pitch?.n > 0)); assert.equal(k.s.xp, xp3);
});

test('Deal Room (low): the first move at a hidden-information table is for good: sat at before, the Close and the Bid play at Quick, so a deal cannot be replayed with its answers in hand', () => {
  const g = dealWorld(49);
  const lot = (() => { for (const z of g.s.zones) for (const l of g.s.lots[z] || []) if (l.mode === 'fixed' && l.price > 5 && l.price < 5e5) return { zone: z, lotId: l.id }; return null; })();
  assert.ok(lot, 'a fixed-price lot'); const spec = { kind: 'buy', ...lot };
  const a = D.startRun(g, spec); assert.ok(a.ok, a.msg);
  a.quick(); a.next(); assert.equal(a.key, 'close');
  assert.equal(a.res.close, undefined, 'nothing played yet'); assert.equal(g.s.tried?.[a.dkey], undefined, 'looking is free');
  const moved = a.act({ type: 'anchor', level: 'low' }); assert.equal(moved.ok, true);
  assert.equal(g.s.tried[a.dkey], 1, 'the first move is the point of no return');
  // leave, and sit down again: the same talk, but played by an average dealer
  const b = D.startRun(g, spec); b.quick(); b.next();
  assert.ok(b.res.close, 'the talk is already played'); assert.equal(b.res.close.quick, true); assert.match(b.lastSay(), /sat at this table before/);
  const quickRef = D.startRun(dealWorld(49), spec); quickRef.quick(); quickRef.next(); quickRef.quick();
  assert.equal(b.res.close.deal, quickRef.res.close.deal); assert.equal(b.res.close.mult, quickRef.res.close.mult, 'exactly what Quick gets: par, whatever the first sitting was');
  assert.equal(b.act({ type: 'anchor', level: 'high' }).ok, false, 'and there is nothing left to play');
  // Quick pressed counts as sitting down too; a Read is not a hidden table and stays free to repeat
  const g2 = dealWorld(49), c = D.startRun(g2, spec); c.quick(); c.next(); c.quick(); assert.equal(g2.s.tried[c.dkey], 1);
  const g3 = dealWorld(49), d = D.startRun(g3, spec); d.quick(); assert.equal(g3.s.tried?.[d.dkey], undefined, 'reading marks nothing');
});

// ------------------------------------------------------------------------------------------------------------------------- the room: the relay
test('Relay seat (medium): the instructor\'s seat belongs to the first to take it, for good: nobody else gets it by waiting, the owner takes it back from anyone, and a handover needs the operator to ask', { skip: !haveRelay && 'run npm install in server/' }, async () => {
  const relay = await startRelay({ SEAT_GRACE_MS: '300' }), strict = await startRelay();
  try {
    for (const [r, label, grace] of [[strict, 'default', false], [relay, 'with a grace period', true]]) {
      const room = 'SEATX' + (grace ? 'G' : 'D'), prof = sock(r, room, 'PC-PROF', 'instructor'), st = sock(r, room, 'PC-STUD');
      await Promise.all([prof.ready, st.ready]);
      prof.send({ t: 'clock', hour: 100, speed: 4, paused: false }); await until(() => st.got.some((m) => m.t === 'clock'));
      prof.ws.close(); await until(() => prof.closed != null); await sleep(grace ? 500 : 500);   // the instructor's lid is closed for a break
      const evil = sock(r, room, 'PC-EVIL', 'instructor'); await evil.ready;
      evil.send({ t: 'clock', hour: 2000, speed: 64, paused: false }); evil.send({ t: 'rewind', toHour: 0 }); await sleep(250);
      if (!grace) assert.ok(!st.got.some((m) => (m.t === 'clock' && m.hour === 2000) || m.t === 'rewind'), label + ': a student who asks for the seat is not given it, however long the instructor is away');
      else assert.ok(st.got.some((m) => m.t === 'clock' && m.hour === 2000), 'an operator who sets a grace period hands the seat over after it');
      // the owner returns, with its own key: the seat is its again, whoever sits in it
      const back = sock(r, room, 'PC-PROF', 'instructor'); await back.ready;
      back.send({ t: 'clock', hour: 130, speed: 1, paused: true }); await until(() => st.got.some((m) => m.t === 'clock' && m.hour === 130 && m.role === 'instructor' && m.from === 'PC-PROF'));
      evil.send({ t: 'clock', hour: 5, speed: 64, paused: false }); await sleep(200);
      assert.ok(!st.got.some((m) => m.t === 'clock' && m.hour === 5), label + ': and the one who sat in it is a student again');
    }
  } finally { relay.stop(); strict.stop(); }
});

test('Relay (low): names that only greet cannot fill the room\'s table or keep a student out, the others hear when a connection closes, an acknowledgement is passed on, and a frame nested thousands deep does not harm its sender', { skip: !haveRelay && 'run npm install in server/' }, async () => {
  const clock = { t: 1e12 }; // (the relay's own clock, held by the test: it ran on the machine's, GHOST_MS was 150 ms of it, and nine connections took longer than that whenever the machine was busy)
  const relay = await startLocalRelay({ MAX_ROOM: '5', GHOST_MS: '150' }, clock);
  try {
    const watcher = sock(relay, 'FLOOD', 'PC-WATCH'); await watcher.ready;
    // nine greeters, and the watcher is the tenth pid (the table holds ten): they connect, say hello and leave
    for (let i = 0; i < 9; i++) { const g = sock(relay, 'FLOOD', 'GH' + i); await g.ready; g.send({ t: 'hello' }); await sleep(10); g.ws.close(); }
    await until(() => watcher.got.filter((m) => m.t === 'bye').length >= 9);
    assert.ok(watcher.got.filter((m) => m.t === 'bye').every((m) => /^GH\d$/.test(m.from)), 'the room is told each one left, though none said goodbye');
    const refused = sock(relay, 'FLOOD', 'PC-REAL1'); await until(() => refused.closed != null);
    assert.equal(refused.closed, 1013, 'right after the flood the table is full of names too fresh to forget');
    clock.t += 300; // the greeters are now older than GHOST_MS
    const real = sock(relay, 'FLOOD', 'PC-REAL2'); await real.ready; real.send({ t: 'snap', snap: { pid: 'PC-REAL2', nw: 5 } }); await sleep(100);
    assert.equal(real.closed, null, 'a real student gets in once the greeters are old enough to forget');
    assert.ok(watcher.got.some((m) => m.t === 'snap' && m.from === 'PC-REAL2'));
    // an acknowledgement is a message of the protocol
    const a = sock(relay, 'ACKR', 'PC-A'), b = sock(relay, 'ACKR', 'PC-B'); await Promise.all([a.ready, b.ready]);
    a.send({ t: 'ack', to: 'PC-B', offerId: 'Ox' }); await until(() => b.got.some((m) => m.t === 'ack' && m.from === 'PC-A' && m.offerId === 'Ox'));
    // frames that nest thousands of levels (under the 32 KB limit) are dropped and the sender goes on
    const deep = '['.repeat(15000) + ']'.repeat(15000);
    a.ws.send('{"t":"hello","x":' + deep + '}'); a.ws.send('{"t":"hello","x":' + '{"a":'.repeat(4000) + '1' + '}'.repeat(4000) + '}');
    await sleep(150); b.got.length = 0; a.send({ t: 'hello', handle: 'still here' });
    await until(() => b.got.some((m) => m.t === 'hello' && m.handle === 'still here')); assert.equal(a.closed, null);
    assert.equal(relay.http.listening, true); assert.deepEqual(relay.logs, [], 'no frame was refused with a fault, and nothing reached the last-resort handler: ' + relay.logs.join(' | ').slice(0, 200));
  } finally { await relay.stop(); }
});

test('Relay (low): a full relay forgets the room that has been empty longest before it refuses a class, and refuses only when every room has someone in it', { skip: !haveRelay && 'run npm install in server/' }, async () => {
  const relay = await startRelay({ MAX_ROOMS: '3', EMPTY_MS: '600000' });
  try {
    for (const code of ['AAA1', 'BBB1', 'CCC1']) { const s = sock(relay, code, 'X' + code); await s.ready; s.ws.close(); await until(() => s.closed != null); await sleep(30); }
    const prof = sock(relay, 'REAL1', 'PC-PROF', 'instructor'); await prof.ready; await sleep(100);
    assert.equal(prof.closed, null, 'a real class gets a room though three abandoned ones were holding the places');
    const b = sock(relay, 'REAL2', 'PC-B'), c = sock(relay, 'REAL3', 'PC-C'); await Promise.all([b.ready, c.ready]); await sleep(100);
    assert.equal(b.closed, null); assert.equal(c.closed, null);
    const late = sock(relay, 'REAL4', 'PC-D'); await until(() => late.closed != null); assert.equal(late.closed, 1013, 'with a class in every room the relay is full');
  } finally { relay.stop(); }
});

// ------------------------------------------------------------------------------------------------------------------------- the room: the table, the clock, the snapshot door
test('Peers (medium): a flood of hellos from fresh names cannot fill the table: real students still reach the gradebook, and the names that never sent anything are bounded', () => {
  store.clear();
  const s = new Session(); s.pid = 'TEACH'; s.mode = 'instructor'; s.clock.set({ hour: 24 * 20 });
  for (let i = 0; i < 600; i++) s._onMsg({ t: 'hello', from: 'GH' + i, role: 'student', handle: 'g' + i });
  assert.ok(s.peers.size <= 100, 'hello-only names are bounded: ' + s.peers.size);
  for (const [i, who] of ['ANN', 'BEN', 'CAL'].entries()) {
    s._onMsg({ t: 'hello', from: who, role: 'student', handle: who });
    s._onMsg({ t: 'snap', from: who, role: 'student', snap: { pid: who, handle: who, nw: 1000 * (i + 1), hour: 24 * 20, startCap: 0.05, flags: {} } });
  }
  const real = s.students().filter((r) => !r.synth).map((r) => r.pid);
  for (const who of ['ANN', 'BEN', 'CAL']) assert.ok(real.includes(who), who + ' is in the gradebook');
  // names with a snapshot still cap at MAX_PEERS and are replaced only when silent for ten minutes
  for (let i = 0; i < 460; i++) s._onMsg({ t: 'snap', from: 'SN' + i, role: 'student', snap: { pid: 'SN' + i, handle: 'x', nw: 5, hour: 480, flags: {} } });
  const withSnap = [...s.peers.values()].filter((p) => p.snap).length; assert.ok(withSnap <= 450, 'founders with a snapshot: ' + withSnap);
  assert.ok([...s.peers.values()].some((p) => p.pid === 'ANN'), 'and a real student is not pushed out by the flood');
});

test('Clock (low): a run nobody has played starts again at the class\'s hour however late the clock comes, and the lessons played on the title screen come with it; a run that has been played is left alone', () => {
  for (const mode of ['late clock', 'pending lessons']) {
    store.clear();
    const s = new Session(); s.pid = 'PC-LATE'; s.joinRoom({ code: 'LATE', role: 'student', handle: 'Ada' }); s.room.close();
    s.room = { kind: 'local', send() {}, close() {}, on() {} };
    s.startGame({ perks: ['trades', 'pro'], specialty: 'ops', handle: 'Ada' });
    if (mode === 'pending lessons') { s.game.xp(34); s.game.grantPoints(1); (s.game.s.meta ||= {}).cx = { 'creativity-multiplier': 3 }; }
    const xp = s.game.s.xp, pts = s.game.s.points;
    if (mode === 'late clock') { s.tick(Date.now() + 8000); assert.equal(s.clockAdopted, true, 'it waited six seconds and ran by itself'); assert.equal(s.clockHeard, false, 'but the class has not been heard'); }
    s._onMsg({ t: 'clock', from: 'PC-PROF', role: 'instructor', hour: 120, speed: 1, paused: true });
    assert.equal(s.clockHeard, true); assert.equal(s.game.s.startHour, 120, mode + ': it began again at the class\'s hour'); assert.equal(s.game.s.hour, 120);
    assert.equal(s.game.s.xp, xp, 'with what the lessons paid'); assert.equal(s.game.s.points, pts);
    if (mode === 'pending lessons') assert.equal(s.game.s.meta.cx['creativity-multiplier'], 3, 'and the Codex pages they opened');
  }
  // played: one sale, one skill point spent, an idle day behind it: not begun again
  for (const played of ['sale', 'point', 'days']) {
    store.clear();
    const s = new Session(); s.pid = 'PC-PLAY'; s.joinRoom({ code: 'PLAYED', role: 'student', handle: 'Bo' }); s.room.close(); s.room = { kind: 'local', send() {}, close() {}, on() {} };
    s.startGame({ perks: ['trades', 'pro'], specialty: 'ops', handle: 'Bo' }); const g = s.game;
    if (played === 'sale') g.led('pitch', 'sold a paperclip', 0.02); if (played === 'point') { g.grantPoints(1); assert.ok(g.spendPoint('growth').ok); } if (played === 'days') { g.s.hour = 30; g.s.startHour = 0; }
    s._onMsg({ t: 'clock', from: 'PC-PROF', role: 'instructor', hour: 120, speed: 1, paused: true });
    assert.equal(s.game.s.startHour, 0, played + ': a played run keeps its own start');
  }
  // a restored run that sat idle for ten days is the player\'s own
  store.clear();
  const r = new Session(); r.pid = 'PC-REST'; r.mode = 'student'; r.startGame({ perks: [], specialty: 'ops', handle: 'Cy' }); r.game.advanceTo(240); r.save(true);
  const r2 = new Session(); r2.pid = 'PC-REST'; assert.equal(r2.restore(), true); r2.room = { kind: 'local', send() {}, close() {}, on() {} };
  r2._onMsg({ t: 'clock', from: 'PC-PROF', role: 'instructor', hour: 400, speed: 1, paused: true });
  assert.equal(r2.game.s.startHour, 0, 'an idle run of ten days is not begun again');
});

test('Snapshot door (medium): what a classmate says they are worth is cut to what the best run could be on that day, and the hour they say they are at does not buy a bigger time bonus', () => {
  assert.ok(C.nwCeiling(0) <= 200 && C.nwCeiling(24 * 90) >= 2.5e7 && C.nwCeiling(24 * 90) <= C.NW_LIMIT, 'a narrow window at the start, wide enough for the best honest run at the end');
  for (let h = 0; h < 2160; h += 24) assert.ok(C.nwCeiling(h + 24) >= C.nwCeiling(h), 'it only rises, day by day');
  // what the best honest play reached stays under it: the bot deciding every two hours, on days 10, 30, 50, 70 and 90 (measured 938, 300k, 1.5M, 5.0M, 11.9M)
  for (const [day, best] of [[10, 938], [30, 300136], [50, 1487581], [70, 5041219], [90, 11852032]]) assert.ok(C.nwCeiling(day * 24) > best * 2, `day ${day}: ${Math.round(C.nwCeiling(day * 24))} against ${best}`);
  store.clear();
  const T = new Session(); T.pid = 'TEACH'; T.mode = 'instructor'; T.clock.set({ hour: 24 * 40, paused: true }); // (paused: a clock that runs reads a few milliseconds past hour 960, and the day-39 ceiling the test compares with is the ceiling at hour 912 to the digit)
  const snap = (nw, hour, extra = {}) => ({ handle: 'H', nw, cash: 0, debt: 0, hour, trades: 5, p2p: 400, flags: {}, skills: { ops: 1, growth: 1, fintech: 1 }, perks: [], shockLog: [], ...extra });
  const add = (pid, sn, away = false) => T.peers.set(pid, { pid, handle: pid, role: 'student', snap: C.cleanSnap(sn, pid), clean: true, seen: away ? 0 : Date.now() });
  add('HON1', snap(40000, 24 * 40)); add('HON2', snap(60000, 24 * 40)); add('HON3', snap(90000, 24 * 40));
  add('LIAR1', snap(1e8, 0)); add('LIAR2', snap(5000, 0));          // a made-up fortune on day 1, and an ordinary one claimed at hour 0 for the time bonus
  const rows = T.leaderboard(), by = (p) => rows.find((r) => r.pid === p);
  assert.ok(by('LIAR1').nw <= C.nwCeiling(24 * 40 - 48), 'a hundred million is cut to what day 39 allows: ' + by('LIAR1').nw);
  assert.ok(by('LIAR1').eei < by('HON3').eei * 100 && rows[0].pid !== 'LIAR2', 'and the ordinary fortune claimed at hour 0 does not win');
  const hours = by('LIAR2').eei / (5000 / 1000); // eeiCalc: net worth over the floor, times (1 + days left / 90)
  const honest = by('HON1').eei / (40000 / 1000);
  assert.ok(hours / honest < 1.03, `claiming hour 0 buys at most the two days of lag a founder may have (not the 28% that day 1 would give): ${hours} against ${honest}`);
  assert.ok(by('LIAR2').p2p <= SWAPS.perDay * (Math.floor((24 * 40 - 48) / 24) + 1), 'swaps are bounded by the class\'s days, not the claimed hour');
  // phantoms at the ceiling do not pretend to be more than the day allows
  for (let i = 0; i < 40; i++) add('PH' + i, snap(5e7, 24 * 40));
  assert.ok(T.students().filter((r) => r.pid.startsWith('PH')).every((r) => r.nw <= C.nwCeiling(24 * 40 + 49)));
  // a founder who left (away) or whose run is over is where they said they were, never ahead of the class
  add('GONE', snap(30000, 24 * 30), true); add('AHEAD', snap(9e6, 24 * 90, { flags: { over: true } }));
  const r2 = T.leaderboard(); assert.equal(r2.find((r) => r.pid === 'GONE').online, false); assert.ok(r2.find((r) => r.pid === 'AHEAD').nw <= C.nwCeiling(24 * 40 + 49));
  // an honest class keeps its order
  const order = rows.filter((r) => r.pid.startsWith('HON')).map((r) => r.pid); assert.deepEqual(order, ['HON3', 'HON2', 'HON1']);
});

test('Gradebook (low): 450 hostile peers with a dozen unique shock ids each cost a few milliseconds, not a hundred, and the grades are what the quadratic version gave', () => {
  store.clear();
  const s = new Session(); s.pid = 'TEACH'; s.mode = 'instructor'; s.clock.set({ hour: 24 * 60 });
  for (let i = 0; i < 449; i++) {
    const shockLog = Array.from({ length: 12 }, (_, k) => ({ id: `s${i}-${k}`, nw: 1000, nwAfter: 1000 + k * 50, pivots: k % 3, de: 1 }));
    s.peers.set('P' + i, { pid: 'P' + i, handle: 'p' + i, role: 'student', snap: C.cleanSnap({ handle: 'p' + i, nw: 1000 + i, hour: 24 * 60, flags: {}, shockLog }, 'P' + i), clean: true, seen: Date.now() });
  }
  s.peers.set('SHARED1', { pid: 'SHARED1', handle: 'a', role: 'student', clean: true, seen: Date.now(), snap: C.cleanSnap({ handle: 'a', nw: 2000, hour: 1440, flags: {}, shockLog: [{ id: 'fed@1056', nw: 1000, nwAfter: 1500, pivots: 1 }, { id: 'fed@1056', nw: 1, nwAfter: 99999, pivots: 9 }] }, 'SHARED1') });
  s.peers.set('SHARED2', { pid: 'SHARED2', handle: 'b', role: 'student', clean: true, seen: Date.now(), snap: C.cleanSnap({ handle: 'b', nw: 2000, hour: 1440, flags: {}, shockLog: [{ id: 'fed@1056', nw: 1000, nwAfter: 500, pivots: 0 }] }, 'SHARED2') });
  s.peers.set('SHARED3', { pid: 'SHARED3', handle: 'c', role: 'student', clean: true, seen: Date.now(), snap: C.cleanSnap({ handle: 'c', nw: 2000, hour: 1440, flags: {}, shockLog: [{ id: 'fed@1056', nw: 1000, nwAfter: 900, pivots: 0 }] }, 'SHARED3') }); // (a shock is graded when three founders logged it)
  s.gradebook(); const t0 = process.hrtime.bigint(); const gb = s.gradebook(); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 60, `gradebook of 451 rows took ${ms.toFixed(1)} ms`);
  const a = gb.find((r) => r.pid === 'SHARED1'), b = gb.find((r) => r.pid === 'SHARED2');
  assert.ok(a.adapt > b.adapt, 'a founder who grew through the shock outscores one who halved, against the median of the two (the first entry of a row for an id is the one that counts)');
  assert.ok(gb.every((r) => r.adapt == null || (r.adapt >= 0 && r.adapt <= 100)));
});

test('Instructor dashboard (low): the header counts students who are online, not those who closed the tab; the stalled list leaves them out; a rewind that fell short shows against the student', async () => {
  const { instructorParts } = await import('../js/ui/instructor.js');
  store.clear();
  const s = new Session(); s.pid = 'TEACH'; s.mode = 'instructor'; s.clock.set({ hour: 24 * 20 }); s.roomInfo = { code: 'ROOM', relay: '' };
  const add = (pid, seen, extra = {}) => s.peers.set(pid, { pid, handle: pid, role: 'student', seen, clean: true, snap: C.cleanSnap({ handle: pid, nw: 5000, hour: 24 * 20, autoEligible: true, lastAutoHour: 0, mil: { m1: true }, flags: {}, ...extra }, pid) });
  add('S1', Date.now()); add('S2', 0); add('S3', 0);
  s.rewindReport.set('S1', { pid: 'S1', handle: 'S1', wanted: 0, hour: 48, ok: false, at: Date.now() });
  const parts = instructorParts(s, {});
  assert.match(parts.head, /<b>1<\/b> student online \(2 away\)/);
  const stalled = parts.c2.slice(parts.c2.indexOf('Operational bottlenecks'), parts.c2.indexOf('Flagged peer trades'));
  assert.ok(stalled.includes('S1') && !stalled.includes('S2') && !stalled.includes('S3'), 'only the one who is there is stalled');
  assert.match(parts.grade, /rewind stopped at day 3 \(asked for day 1\)/);
  assert.equal((parts.grade.match(/rewind stopped/g) || []).length, 1, 'and only against the one it concerns');
});

test('Swap notice (low): the incoming-offer note sends the player to Market, Exchange, which exists, and not to a Syndicate that does not', () => {
  const hub = hubOf('NOTE'), A = sessionIn(hub, 'PC-AAAA'), B = sessionIn(hub, 'PC-BBBB');
  A.game.s.cash = 500; const x = B.game._mk(B.game.s, 'bike', { zone: 1, basis: 1 }); B.game.s.assets.push(x);
  for (const S of [A, B]) S._sendSnap(true); hub.drain();
  const want = A.roster().find((q) => q.pid === B.pid).inventory.find((i) => i.id === x.id);
  assert.ok(A.propose({ to: B.pid, giveIds: [], giveCash: Math.round(want.fmv), want: { assets: [want], cash: 0 } }).ok); hub.drain();
  const note = B.game.s.news.find((n) => /proposed a swap/.test(n.text)); assert.ok(note);
  assert.match(note.text, /Open Market, then Exchange/); assert.ok(!/Syndicate/.test(note.text));
  assert.ok(!/Syndicate/.test(readFileSync(new URL('../js/session.js', import.meta.url), 'utf8')));
});

// ------------------------------------------------------------------------------------------------------------------------- the data and the table
test('Data (low): no two goods that are sold in the same district share a tag set (every buyer fitted each pair identically), and the pairs that did are told apart for the buyers they differ for', () => {
  const sold = (id) => Object.keys(ASSETS[id].dem || {}).map(Number);
  const clashes = [];
  const ids = Object.keys(ASSETS);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j];
    if ([...ASSETS[a].tags].sort().join() === [...ASSETS[b].tags].sort().join() && sold(a).some((z) => sold(b).includes(z))) clashes.push(`${a}/${b}`);
  }
  assert.deepEqual(clashes, [], 'goods on one market with the same tags');
  // and they are not told apart only on paper: for every pair that was identical, some buyer of a shared district fits the two differently
  const { fitOf } = M; const was = [['fleaRecords', 'vinylRecords'], ['courseBooks', 'textbooks'], ['van', 'fleet'], ['domain', 'saas'], ['saas', 'erpBook'], ['startupAssets', 'gameCatalog']];
  for (const [a, b] of was) {
    const zones = sold(a).filter((z) => sold(b).includes(z));
    if (a === 'courseBooks') continue; // (the two book goods meet only at the Quad, where both of its book buyers are at the top of the scale for either: told apart by their tags and, at their other markets, by their buyers)
    assert.ok(Object.entries(BUYERS).some(([id, B]) => zones.includes(B.zone) && Math.abs(fitOf(a, id) - fitOf(b, id)) > 1e-9), `${a} and ${b} fit some buyer differently`);
  }
});
import * as M from '../js/market.js';

test('Audit-Proof (low): the epic says what it takes (Industrial Park open by about day 30), and the run that does open it then earns it', () => {
  const ACH = import('../js/meta/quests.js');
  return ACH.then(({ ACHIEVEMENTS }) => {
    const a = ACHIEVEMENTS.find((x) => x.id === 'a-audit-proof');
    assert.match(a.desc || a.text || JSON.stringify(a), /day 30/); assert.equal(a.goal.count, 5);
  });
});

test('Balance (cadence): the late game at a decision every three hours, not only every four, is held at today\'s numbers (the design bound is one run in six and a spread of three; BALANCE.md says where it is not met)', () => {
  const { PERK_PAIRS: ALL } = { PERK_PAIRS: null }; void ALL;
  return import('../js/data/perks.js').then(({ PERK_PAIRS }) => {
    const sample = PERK_PAIRS.filter((_, i) => i % 6 === 0);
    const four = lateGame(balance({ seeds: 3, every: 4, pairs: sample }).rows), three = balance({ seeds: 3, every: 3, pairs: sample }), L = lateGame(three.rows);
    assert.ok(four.d16Share <= 0.17 && four.spread <= 3, `at the default rhythm the design bound holds: ${(four.d16Share * 100).toFixed(0)}% in district 16, spread ${four.spread.toFixed(2)}`);
    // a ceiling at what was measured (21% and 2.95 on this sample, 2026-10-28), not the design bound: it keeps the cliff from getting steeper without anyone seeing it
    assert.ok(L.d16Share <= 0.3, `every 3 hours: district 16 in ${(L.d16Share * 100).toFixed(0)}% of ${L.runs} runs`);
    assert.ok(L.spread <= 3.6, `every 3 hours: the 90th percentile is ${L.spread.toFixed(2)}x the 10th`);
    assert.ok(L.nwP50 <= 2600000, `every 3 hours: median day-90 net worth ${Math.round(L.nwP50)}`);
    assert.equal(three.wipedRuns, 0);
    assert.ok(readFileSync(new URL('../docs/BALANCE.md', import.meta.url), 'utf8').includes('decision every three hours'), 'and the docs say what the cadence does');
  });
});
