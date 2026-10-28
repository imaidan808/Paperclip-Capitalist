// Regression tests for the audit's "engine-swaps" cluster: the closed run and the exit lock, the ledger, the escrowed swap between two founders (what a forged or stale message can do,
// what an acceptor really sends, what room a swap holds), royalty streams, freight and storage, the day checkpoint, and JSON-safe state.
// Each test names the audit finding(s) it covers and fails on the engine at commit 816e7c4.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CLOSED_METHODS, closedWhy } from '../js/engine.js';
import { ASSETS, BUYERS, ALGO_EVENTS, TOTAL_HOURS } from '../js/config.js';
import { assetFMV, FAKE_VALUE, demandOf } from '../js/market.js';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
/** A bare game: no cohort (crowding off), no algorithmic events. Two founders get their own pid. */
const mk = (perks = [], seed = 1, pid) => { const g = new Game({ perks, seed, handle: pid || 'T', pid: pid || 'T-' + seed }); g.env.algo = false; return g; };
const rich = (g, cash) => { g.s.cash = cash; g.advanceTo(g.s.hour + 1); return g; };
const put = (g, cls, zone, o = {}) => {
  const a = g._mk(g.s, cls, { zone, basis: o.basis ?? 1, cond: o.cond });
  if (o.truth) { a.truth = o.truth; a.known = !!o.known; }
  else if (o.known) a.known = true;
  g.s.assets.push(a);
  return a;
};
const snap = (g) => JSON.stringify(g.s);
/** First non-finite number anywhere in a value. */
const bad = (x, path = 's') => {
  if (typeof x === 'number') return Number.isFinite(x) ? null : path;
  if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { const r = bad(v, path + '.' + k); if (r) return r; }
  return null;
};
/** A and B, two founders in one room, A offering a pen for B's scrap in district 1; returns the pieces. */
function swap() {
  const A = mk([], 1, 'AAA'), B = mk([], 2, 'BBB');
  const pen = put(A, 'pen', 1), scrap = put(B, 'scrap', 1);
  const off = A.createOffer({ to: 'BBB', giveIds: [pen.id], want: { assets: [B.pub(scrap)], cash: 0 } });
  assert.ok(off.ok, off.msg);
  return { A, B, pen, scrap, offer: off.offer };
}

// ------------------------------------------------------------------------------------------------------------------------- the exit lock (DT-02, L1, E2, L6, L10)
const exitGame = () => { const g = rich(mk([], 7), 300000); g.s.auditFirst = true; g.s.auditNext = null; return g; };

test('DT-02, L1, E2: nothing can be borrowed while an exit settles, and the locked score is the proceeds less any debt', () => {
  const ctl = exitGame(); ctl.exit('trade'); ctl.advanceTo(ctl.s.hour + 49);
  const g = exitGame(); const q = g.exitQuote('trade'); assert.ok(q.ok);
  assert.ok(g.exit('trade').ok);
  const d = g.draw('enterprise', 1e9);
  assert.equal(d.ok, false, 'no credit while the sale is settling');
  assert.notEqual(g.loanBlock('enterprise'), '', 'and the Bank is told why');
  assert.equal(g.draw('micro', 1e9).ok, false); assert.equal(g.draw('circle', 1e9).ok, false);
  g.advanceTo(g.s.hour + 49);
  assert.ok(g.s.exit && g.s.over);
  near(g.s.exit.nw, ctl.s.exit.nw, 1e-6); near(g.s.exit.eei, ctl.s.exit.eei, 1e-9);
  assert.equal(g.debt(), 0);
  // a second line of defence: any debt that is somehow on the books at the lock is taken off the score
  const h = exitGame(); h.exit('trade');
  h.s.loans.push({ id: 'Dx', prod: 'micro', principal: 1000, accr: 0, last: 0, next: 9999, drawn: 0 });
  h.s.cash += 1000; // as if it had been drawn
  h.advanceTo(h.s.hour + 49);
  near(h.s.exit.nw, ctl.s.exit.nw + 1000 - h.debt(), 1e-6); // the cash that came with the debt, less the debt (and the interest it ran up)
  assert.ok(h.debt() >= 1000);
});

test('F1, L6: after the run is over every action refuses ("The run is over.") and changes nothing; reads still work', () => {
  const g = rich(mk([], 3), 300000);
  while (g.s.auditPending) g.resolveAudit('A');
  const lane = g.radar(5, 1)[0];
  const hired = g.hirePipeline('broker', 5, { cls: lane.cls, buyer: lane.seg });
  g.advanceTo(TOTAL_HOURS);
  assert.ok(g.s.over && !g.s.exit);
  const s = g.s;
  s.cash = 50000; s.points = 2;
  const a = put(g, 'bike', 1), broken = put(g, 'van', 1, { cond: 'broken' });
  s.leads[1] ||= [];
  s.leads[1].push({ id: 'Lx', zone: 1, seg: Object.keys(BUYERS).find((id) => BUYERS[id].zone === 1), budget: 50, need: null, born: s.hour, exp: s.hour + 50 });
  const lead = s.leads[1].at(-1);
  s.lots[1] ||= []; s.lots[1].push({ id: 'Tx', zone: 1, cls: 'bike', cond: 'ok', price: 1, exp: s.hour + 50, mode: 'fixed', truth: { q: 1, fake: false, defects: [] } });
  const before = snap(g), eei = g.eei(), nw = g.netWorth();
  const calls = {
    pitch: () => g.pitch(a.id, lead.id), verifyLead: () => g.verifyLead(lead.id), recordInspect: () => g.recordInspect(1, 'Tx', { estimate: { quality: 1, fakeProb: 0 }, score: 1 }), recordPlay: () => g.recordPlay('haggle', { score: 1 }),
    buyLot: () => g.buyLot(1, 'Tx'), passLead: () => g.passLead(1, lead.id), passLot: () => g.passLot(1, 'Tx'), repair: () => g.repair(broken.id), sellPool: () => g.sellPool([a.id]), ship: () => g.ship([a.id], 2),
    spendPoint: () => g.spendPoint('ops'), hirePipeline: () => g.hirePipeline('broker', 5, { cls: lane.cls, buyer: lane.seg }), configure: () => g.configure(hired.pipe.id, { alloc: 1 }), upgradePipeline: () => g.upgradePipeline(hired.pipe.id),
    pausePipeline: () => g.pausePipeline(hired.pipe.id, true), releasePipeline: () => g.releasePipeline(hired.pipe.id), buyUpgrade: () => g.buyUpgrade('jit'), acquireClient: () => g.acquireClient('smb'), draw: () => g.draw('micro', 100),
    repay: () => g.repay('D1', 1), resolveAudit: () => g.resolveAudit('A'), exit: () => g.exit('trade'), exitQuote: () => g.exitQuote('trade'),
    createOffer: () => g.createOffer({ to: 'X', giveIds: [a.id], want: { assets: [], cash: 1 } }), acceptOffer: () => g.acceptOffer({ id: 'O', from: 'P', give: { assets: [], cash: 5 }, want: { assets: [], cash: 5 } }),
    finalizeOffer: () => g.finalizeOffer('O', { assets: [], cash: 0 }), receiveRoyalty: () => g.receiveRoyalty(5, 'o'),
  };
  assert.deepEqual(Object.keys(calls).sort(), [...CLOSED_METHODS].sort(), 'the test drives every method the engine closes');
  for (const [name, f] of Object.entries(calls)) {
    const r = f();
    assert.equal(r.ok, false, name); assert.equal(r.msg, 'The run is over.', name);
  }
  assert.equal(snap(g), before, 'not one byte of the state moved');
  assert.equal(g.eei(), eei); assert.equal(g.netWorth(), nw);
  assert.equal(closedWhy(g), 'The run is over.');
  assert.equal(g.loanBlock('micro'), 'The run is over.');
  // reads and notes still work
  assert.ok(g.freightQuote([a.id], 2).ok !== undefined); assert.ok(g.poolQuote([a.id]).ok); assert.ok(g.quotePitch(a.id, lead.id).ok !== undefined);
  g.note('info', 'still can'); assert.equal(g.s.news[0].text, 'still can');
});

test('F1: the score is struck at the bell on day 90 and does not move again (a crate dropped into the state, an event injected)', () => {
  const g = rich(mk([], 3), 5000);
  put(g, 'bike', 1); g.advanceTo(TOTAL_HOURS);
  assert.ok(g.s.over);
  const e = g.eei(), pub = g.publicSnapshot();
  put(g, 'bike', 1); g.s.cash += 1000; g.injectEvent('tiktok', g.s.hour, { id: 'late' });
  assert.equal(g.eei(), e); assert.equal(g.publicSnapshot().eei, e); assert.equal(g.publicSnapshot().nw, pub.nw);
  // a rewind to an earlier day gives the live score back
  g.rewindTo(80 * 24); assert.equal(g.s.over, false); assert.equal(g.s.final, undefined);
});

test('L6, F1: while an exit settles every action refuses ("Your exit is settling.") and changes nothing', () => {
  const g = exitGame();
  const a = put(g, 'bike', 1); g.exit('trade');
  g.s.cash = 0; // exit() sold the crate with the rest; a new one dropped in only to have something to act on
  const before = snap(g);
  for (const [name, r] of Object.entries({
    ship: g.ship([a.id], 2), draw: g.draw('micro', 5), exit: g.exit('ipo'), sellPool: g.sellPool([a.id]), buyUpgrade: g.buyUpgrade('jit'), createOffer: g.createOffer({ to: 'X', giveCash: 1, want: { assets: [], cash: 1 } }),
    receiveRoyalty: g.receiveRoyalty(5, 'o'), exitQuote: g.exitQuote('trade'),
  })) { assert.equal(r.ok, false, name); assert.equal(r.msg, 'Your exit is settling.', name); }
  assert.equal(snap(g), before);
  assert.equal(closedWhy(g), 'Your exit is settling.');
});

test('L6: an exit begun less than 48 hours before the bell settles at the bell (it used to be left settling for ever)', () => {
  const g = exitGame();
  g.s.hour = TOTAL_HOURS - 10; g._m = null;
  assert.ok(g.exit('trade').ok);
  g.advanceTo(TOTAL_HOURS);
  assert.ok(g.s.over); assert.equal(g.s.exiting, null, 'no longer settling'); assert.ok(g.s.exit, 'the score is locked');
  near(g.s.exit.nw, g.s.cash, 1e-9);
  assert.equal(g.s.settle.length, 0);
});

test('L6: nothing runs after the score locks in the same hour (a "connected" founder was charged family tax on money the score already held)', () => {
  const g = rich(mk(['connected', 'pro'], 7), 400000);
  g.s.auditFirst = true; g.s.auditNext = null; g.s.dp = Array(14).fill(2000);
  g.s.hour = 120; g._m = null; // 120 + 48 = 168: a day tick and a family-obligation week
  assert.ok(g.exit('trade').ok);
  g.advanceTo(168);
  assert.ok(g.s.exit);
  near(g.s.cash, g.s.exit.nw, 1e-9);
  assert.equal(g.s.ledger.filter((e) => e.type === 'family').length, 0);
});

test('L6: stepHour is a no-op on a closed run', () => {
  const g = rich(mk(), 5000); g.advanceTo(TOTAL_HOURS);
  const h = g.s.hour; g.stepHour(); g.stepHour();
  assert.equal(g.s.hour, h);
});

test('L10: an open swap is part of the exit: the quote counts what is in escrow, exit() withdraws the offer first, and the locked score holds it', () => {
  const g = exitGame();
  const keep = put(g, 'bike', 1), held = put(g, 'bike', 1);
  const off = g.createOffer({ to: 'X', giveIds: [held.id], giveCash: 20, want: { assets: [], cash: Math.round((g.val(held) + 20) * 100) / 100 } });
  assert.ok(off.ok, off.msg);
  const q = g.exitQuote('trade');
  const ctl = exitGame(); put(ctl, 'bike', 1); put(ctl, 'bike', 1);
  near(q.proceeds, ctl.exitQuote('trade').proceeds, 1e-6); // the same business, with or without an offer out
  const r = g.exit('trade');
  assert.ok(r.ok);
  assert.equal(g.s.escrow.length, 0, 'the offer was withdrawn');
  assert.ok(g.out.some((m) => m.t === 'withdraw' && m.offer === off.offer.id), 'and its recipient is told');
  g.advanceTo(g.s.hour + 49);
  near(g.s.exit.nw, q.proceeds, 1e-6);
  void keep;
});

test('F1: a crate on a truck is worth the lower of where it left and where it is going until it lands', () => {
  const g = rich(mk(), 200); // opens districts 1 to 3
  const a = put(g, 'bike', 1);
  const q = g.freightQuote([a.id], 3); assert.ok(q.ok);
  const lo = Math.min(g.val(a, 1), g.val(a, 3)), hi = Math.max(g.val(a, 1), g.val(a, 3));
  assert.ok(hi > lo, 'the two districts price the bike differently');
  const nw = g.netWorth();
  assert.ok(g.ship([a.id], 3).ok);
  near(g.netWorth(), nw - q.cost - (g.val(a, 1) - lo), 1e-6); // paid freight, and no unlanded gain
  assert.ok(g.netWorth() <= nw);
});

// ------------------------------------------------------------------------------------------------------------------------- profit that feeds the exit premium (DT-04)
test('DT-04: a pitch and a pool sale add their realised profit to the day\'s profit, which the exit premium averages', () => {
  let done = false;
  for (let seed = 1; seed <= 30 && !done; seed++) {
    const g = mk([], seed); const clip = g.s.assets[0];
    const lead = g.s.leads[1].find((l) => { const q = g.quotePitch(clip.id, l.id); return q.ok && !q.rejected; });
    if (!lead) continue;
    done = true;
    const before = g.s.acc.profit, r = g.pitch(clip.id, lead.id);
    assert.ok(r.ok && !r.rejected);
    assert.notEqual(r.profit, 0);
    near(g.s.acc.profit - before, r.profit, 1e-9);
  }
  assert.ok(done, 'found a buyer for the starting crate');
  const g = rich(mk(), 300); const a = put(g, 'bike', 1, { basis: 1 });
  const before = g.s.acc.profit, r = g.sellPool([a.id]);
  assert.ok(r.ok, r.msg);
  near(g.s.acc.profit - before, r.total - 1, 1e-9);
  g.advanceTo(g.s.hour + 24);
  assert.ok(g.s.dp.some((x) => Math.abs(x) > 0), 'the profit reached the 14-day average');
});

// ------------------------------------------------------------------------------------------------------------------------- the ledger (L5, L7, L8)
test('L8: the ledger never silently drops rows: the oldest are folded into ONE summary row that keeps their count, their total and their types', () => {
  const g = mk();
  for (let i = 0; i < 3500; i++) g.led(i % 2 ? 'pipe' : 'buy', 'row ' + i, i % 2 ? 1 : -1, { cm: 1, h: i });
  const L = g.s.ledger;
  assert.ok(L.length <= 3200, 'still capped');
  const sums = L.filter((r) => r.type === 'summary');
  assert.equal(sums.length, 1, 'exactly one summary row'); assert.equal(L[0], sums[0], 'at the head');
  assert.equal(sums[0].n + (L.length - 1), 3500, 'every row is either still there or counted in the summary');
  near(L.reduce((a, r) => a + r.amt, 0), 0, 1e-9); // 1750 gains and 1750 costs: the total is whole
  assert.equal(g.s.ledgerDropped, sums[0].n);
  assert.ok(sums[0].byType.pipe.n > 0, 'the type totals are kept');
  assert.equal(L.filter((r) => r.type === 'buy').length, 1750, 'the manager cycles are the bulk and go first: every other row is still a row');
  assert.equal(bad(L), null);
  // with nothing but one kind of row, the oldest of it are folded, and a second fold adds to the same row
  const h = mk();
  for (let i = 0; i < 3500; i++) h.led('buy', 'row ' + i, -1);
  const S = h.s.ledger.filter((r) => r.type === 'summary');
  assert.equal(S.length, 1); assert.equal(S[0].byType.buy.n, S[0].n); assert.equal(S[0].n + h.s.ledger.length - 1, 3500);
  assert.equal(h.s.ledger[1].text, 'row ' + S[0].n, 'and the rows left are the newest, in order');
  // the manager cycles that show a creativity penalty are the Debrief's evidence: they are the last of the manager rows to go
  const k = mk();
  for (let i = 0; i < 3300; i++) k.led('pipe', 'c' + i, 1, { cm: i < 100 ? 0.5 : 1.5 });
  assert.equal(k.s.ledger.filter((r) => r.type === 'pipe' && r.cm === 0.5).length, 100, 'all of the low-Cm cycles are still there');
});

test('L5, L7: an exit is ONE row of money in the ledger, not the proceeds twice (once at the start and again at the lock)', () => {
  const g = exitGame(); const q = g.exitQuote('trade');
  g.exit('trade'); g.advanceTo(g.s.hour + 49);
  const rows = g.s.ledger.filter((e) => e.type === 'exit');
  assert.ok(rows.length >= 2, 'the start and the settlement are both on the record');
  near(rows.reduce((a, e) => a + e.amt, 0), q.proceeds, 1e-6);
});

test('L7: a royalty received is on the ledger, once per payment, with the amount actually taken', () => {
  const { B, offer } = royaltyPair();
  assert.equal(B.s.ledger.filter((e) => e.type === 'p2p' && e.text === 'Royalty received').length, 0);
  assert.ok(B.receiveRoyalty(30, offer.id).ok);
  const rows = B.s.ledger.filter((e) => e.type === 'p2p' && e.text === 'Royalty received');
  assert.equal(rows.length, 1); near(rows[0].amt, 30);
});

// ------------------------------------------------------------------------------------------------------------------------- forged and stale replies (L2, F3)
test('L2: a forged "accept" cannot mint cash, plant an unknown crate, or destroy the escrow: the reply must be exactly what the offer asked for, and a refused reply changes nothing', () => {
  const { A, B, scrap, offer } = swap();
  const before = snap(A);
  const mint = A.finalizeOffer(offer.id, { assets: [], cash: 5e6 }, 'EVIL');
  assert.equal(mint.ok, false); assert.equal(snap(A), before, 'a delivery of cash the offer never asked for');
  assert.doesNotThrow(() => A.finalizeOffer(offer.id, { assets: [{ cls: 'nope', zone: 1, id: 'x' }], cash: 0 }, 'EVIL'));
  assert.equal(A.finalizeOffer(offer.id, { assets: [{ cls: 'nope', zone: 1, id: 'x' }], cash: 0 }, 'EVIL').ok, false);
  assert.equal(snap(A), before, 'an unknown class');
  assert.doesNotThrow(() => A.netWorth()); assert.doesNotThrow(() => A.advanceTo(A.s.hour + 2));
  A.s = JSON.parse(before);
  assert.doesNotThrow(() => A.finalizeOffer(offer.id));
  assert.equal(A.finalizeOffer(offer.id).ok, false); assert.equal(snap(A), before, 'no delivery at all must not destroy the escrow');
  assert.equal(A.finalizeOffer(offer.id, { assets: [{ ...B.pub(scrap), id: 'someone-else' }], cash: 0 }).ok, false);
  assert.equal(A.finalizeOffer(offer.id, { assets: [{ ...B.pub(scrap), cls: 'pen' }], cash: 0 }).ok, false, 'the wrong class');
  assert.equal(A.finalizeOffer(offer.id, { assets: [B.pub(scrap)], cash: 7 }).ok, false, 'cash on top');
  assert.equal(snap(A), before);
  assert.equal(A.s.escrow.length, 1, 'the escrow is still there for the real answer');
  const real = B.acceptOffer(offer);
  assert.ok(real.ok, real.msg);
  const fin = A.finalizeOffer(offer.id, real.deliver, 'BBB');
  assert.ok(fin.ok, fin.msg);
  assert.equal(A.s.escrow.length, 0); assert.ok(A.s.assets.some((x) => x.cls === 'scrap' && x.from === 'p2p'));
  assert.equal(A.finalizeOffer(offer.id, real.deliver).ok, false, 'and a reply cannot be played twice');
});

test('L2: when the room says who sent a reply or a decline, it must be the person the offer was made to', () => {
  const { A, B, scrap, offer } = swap();
  const acc = B.acceptOffer(offer);
  const before = snap(A);
  assert.equal(A.finalizeOffer(offer.id, acc.deliver, 'EVIL', { from: 'MALLORY' }).ok, false);
  assert.equal(A.cancelOffer(offer.id, 'declined', 'MALLORY').ok, false);
  assert.equal(snap(A), before, 'a stranger can neither settle nor cancel the swap');
  assert.ok(A.finalizeOffer(offer.id, acc.deliver, 'BBB', { from: 'BBB' }).ok);
  const x = swap();
  assert.ok(x.A.cancelOffer(x.offer.id, 'declined', 'BBB').ok, 'the person it was made to can decline');
  void scrap;
});

test('L2, L11: a reply that lists the crate twice delivers it once', () => {
  const { A, B, scrap, offer } = swap();
  assert.ok(A.finalizeOffer(offer.id, { assets: [B.pub(scrap), B.pub(scrap)], cash: 0 }).ok);
  assert.equal(A.s.assets.filter((x) => x.cls === 'scrap').length, 1);
  const ids = A.s.assets.map((x) => x.id); assert.equal(new Set(ids).size, ids.length);
});

test('L2: a delivery that carries a hidden truth or odd numbers arrives as a plain, known crate with real numbers', () => {
  const { A, B, scrap, offer } = swap();
  const sent = { ...B.pub(scrap), truth: { fake: false, q: 0.9 }, belief: { quality: 1 }, quality: 'high', wear: Infinity, basis: 1e12 };
  const r = A.finalizeOffer(offer.id, { assets: [sent], cash: 0 });
  assert.ok(r.ok, r.msg);
  const got = A.s.assets.find((x) => x.from === 'p2p');
  assert.equal(got.truth, undefined); assert.equal(got.belief, undefined); assert.equal(got.known, true);
  assert.equal(bad(A.s), null, 'no NaN or Infinity got into the save');
  near(got.quality, 0.9, 1e-9); // the truth was folded into the worth, never launders a worse crate into a better one
  assert.ok(got.basis < 100, 'and the basis is what it is worth, not what the sender said');
});

test('L2, repair round: a counterfeit sent against a genuine description is not that swap: nothing is credited and the escrow stays held', () => {
  const { A, B, scrap, offer } = swap();
  const fake = { ...B.pub(scrap), truth: { fake: true, q: 1 } };
  const r = A.finalizeOffer(offer.id, { assets: [fake], cash: 0 });
  assert.equal(r.ok, false); assert.match(r.msg, /not what the offer asked for/);
  assert.equal(A.s.escrow.length, 1, 'the escrow is still held'); assert.ok(!A.s.assets.some((x) => x.from === 'p2p'));
});

// ------------------------------------------------------------------------------------------------------------------------- royalties (L3, shared contract d, g)
function royaltyPair() {
  const A = mk([], 1, 'AAA'), B = mk([], 2, 'BBB');
  rich(A, 20000); rich(B, 3000);
  const off = A.createOffer({ to: 'BBB', giveIds: [], giveCash: 0, royalty: { perDay: 30, days: 5 }, want: { assets: [], cash: 150 } });
  assert.ok(off.ok, off.msg);
  const acc = B.acceptOffer(off.offer); assert.ok(acc.ok, acc.msg);
  const fin = A.finalizeOffer(off.offer.id, acc.deliver, 'BBB'); assert.ok(fin.ok, fin.msg);
  return { A, B, offer: off.offer };
}

test('L3: a royalty is credited only for a stream this founder was promised, at most a day\'s amount at a time, never past the promise; everything else is ignored', () => {
  const B = mk([], 2, 'BBB'); B.s.cash = 1000;
  for (const junk of [undefined, '5', 1e12, -5, NaN, {}, Infinity, null, [3]]) B.receiveRoyalty(junk, 'nope');
  assert.equal(B.s.cash, 1000, 'no such stream: nothing is credited');
  const { B: P, offer } = royaltyPair();
  const base = P.s.cash;
  const stream = P.s.royalties.find((r) => r.dir === 'recv');
  assert.equal(stream.offer, offer.id); assert.equal(stream.days, 5); assert.equal(stream.perDay, 30); assert.equal(stream.peer, 'AAA');
  for (const junk of [undefined, '7', {}, -5, NaN, Infinity, null, 0, [3]]) assert.equal(P.receiveRoyalty(junk, offer.id).ok, false, String(junk));
  assert.equal(P.s.cash, base, 'a bad amount credits nothing (cash stays a number)');
  assert.equal(typeof P.s.cash, 'number');
  assert.equal(P.receiveRoyalty(30, 'someone-elses').ok, false, 'another offer id');
  assert.equal(P.receiveRoyalty(30, offer.id, 'MALLORY').ok, false, 'when the sender is known it must be the one promised');
  const r = P.receiveRoyalty(1e12, offer.id, 'AAA');
  assert.ok(r.ok); near(P.s.cash - base, 30, 1e-9); // clamped to the day's amount
  for (let i = 0; i < 20; i++) P.receiveRoyalty(30, offer.id);
  near(P.s.cash - base, 150, 1e-9); // five days of thirty: the promise and not a cent more
  assert.equal(P.receiveRoyalty(30, offer.id).ok, false);
  assert.equal(bad(P.s), null);
  const Q = royaltyPair(); // after the end date, what the payer still owes (arrears) is taken, up to the promise and not a cent more
  Q.B.s.hour = Q.B.s.royalties.find((r) => r.dir === 'recv').until + 3;
  const q0 = Q.B.s.cash;
  for (let i = 0; i < 20; i++) Q.B.receiveRoyalty(30, Q.offer.id);
  near(Q.B.s.cash - q0, 150, 1e-9); assert.equal(Q.B.receiveRoyalty(1, Q.offer.id).ok, false, 'paid up');
  const R = royaltyPair(); // while it runs, a payment a little late (an hour or two) still counts
  R.B.s.hour = R.B.s.royalties.find((r) => r.dir === 'recv').until + 1;
  assert.equal(R.B.receiveRoyalty(30, R.offer.id).ok, true);
});

test('(g): a royalty in an offer is worth the least of what it promises, a tenth of the promiser\'s net worth and what the days left can pay', () => {
  const g = rich(mk(), 20000);
  const val = (royalty, nw) => g.checkOffer({ from: g.s.pid, give: { assets: [], cash: 0, royalty }, want: { assets: [], cash: 0 }, nw }).va;
  near(val({ perDay: 10, days: 5 }, 20000), 50, 1e-9); // the promise itself
  near(val({ perDay: 1000, days: 90 }, 20000), 2000, 1e-9); // a tenth of 20,000
  near(val({ perDay: 1000, days: 90 }), Math.min(90000, 0.1 * g.netWorth()), 1e-6); // the offerer's own net worth when the offer carries none
  g.s.hour = TOTAL_HOURS - 48; g._m = null; // two days left in the run
  near(val({ perDay: 100, days: 90 }, 1e9), 200, 1e-6);
  near(g.sideValue({ royalty: { perDay: 100, days: 90 } }, { nw: 1e9 }), 200, 1e-6);
  g.s.hour = 1; g._m = null;
  near(g.sideValue({ royalty: { perDay: 1000, days: 90 } }), 0.1 * g.netWorth(), 1e-6); // with no net worth given it is this founder's own
  // an offer from a classmate that does not say what they are worth promises nothing that counts; one that does is trusted that far
  const theirs = (nw) => g.checkOffer({ from: 'P', nw, give: { assets: [], cash: 0, royalty: { perDay: 10, days: 5 } }, want: { assets: [], cash: 0 } }).va;
  assert.equal(theirs(undefined), 0); near(theirs(100000), 50, 1e-9); near(theirs(100), 10, 1e-9);
});

// ------------------------------------------------------------------------------------------------------------------------- repeated ids (L11, E4)
test('L11, E4: a crate listed twice is one crate: sellPool pays once, ship ships once, createOffer escrows once, and an offer asking for it twice asks for it once', () => {
  const g = rich(mk(), 300);
  const a = put(g, 'bike', 1), b = put(g, 'bike', 1);
  const one = g.poolQuote([a.id]).total, cash = g.s.cash;
  const r = g.sellPool([a.id, a.id, a.id]);
  assert.ok(r.ok, r.msg); near(g.s.cash - cash, one, 1e-9); assert.equal(r.per.length, 1);
  const nw = g.netWorth(), q1 = g.freightQuote([b.id], 2);
  const q = g.freightQuote([b.id, b.id, b.id, b.id], 2);
  near(q.cost, q1.cost, 1e-9); assert.equal(q.items.length, 1);
  assert.ok(g.ship([b.id, b.id, b.id, b.id], 2).ok);
  assert.equal(g.s.freight[0].items.length, 1);
  assert.ok(g.netWorth() <= nw, 'net worth did not jump');
  g.advanceTo(g.s.hour + 30);
  const ids = g.s.assets.map((x) => x.id); assert.equal(new Set(ids).size, ids.length, 'no id twice in the stock');
  // createOffer
  const A = mk([], 1, 'AAA'); rich(A, 500);
  const x = put(A, 'bike', 1);
  const want = A.val(x);
  const off = A.createOffer({ to: 'BBB', giveIds: [x.id, x.id], want: { assets: [], cash: Math.round(want * 100) / 100 } });
  assert.ok(off.ok, off.msg);
  assert.equal(off.offer.give.assets.length, 1); assert.equal(A.s.escrow[0].assets.length, 1);
  A.cancelOffer(off.offer.id);
  assert.equal(A.s.assets.filter((y) => y.id === x.id).length, 1, 'withdrawing returns one crate');
  // acceptOffer: asked for twice, delivered once
  const B = mk([], 2, 'BBB'); rich(B, 500);
  const y = put(B, 'bike', 1);
  const offer = { id: 'Odup', from: 'AAA', fromHandle: 'A', give: { assets: [], cash: Math.round(B.val(y) * 100) / 100, royalty: null }, want: { assets: [B.pub(y), B.pub(y)], cash: 0 }, skills: {} };
  const acc = B.acceptOffer(offer);
  assert.ok(acc.ok, acc.msg);
  assert.equal(acc.deliver.assets.length, 1, 'one crate left, one crate is sent');
});

// ------------------------------------------------------------------------------------------------------------------------- what a swap really sends and is worth (S5, F2, S11)
const dearIn7 = Object.keys(ASSETS).find((c) => { const d = ASSETS[c]; return demandOf(d, 7) >= 6 && assetFMV({ cls: c, cond: 'ok', quality: 1, wear: 1 }, 7, { demand: [], price: [] }) > 5 * assetFMV({ cls: c, cond: 'ok', quality: 1, wear: 1 }, 5, { demand: [], price: [] }) && assetFMV({ cls: c, cond: 'ok', quality: 1, wear: 1 }, 5, { demand: [], price: [] }) > 0.5; });

test('S5: the guardrail values what comes in where the receiver would hold it: a crate from a district they cannot enter is not worth its price there', () => {
  assert.ok(dearIn7, 'the content has a class far dearer in district 7 than in district 5');
  const RICH = mk([], 1, 'RICH'), POOR = mk([], 2, 'POOR');
  rich(RICH, 20000); rich(POOR, 1500);
  assert.ok(RICH.s.zones.includes(7) && !POOR.s.zones.includes(7) && POOR.s.zones.includes(5));
  const van = put(RICH, dearIn7, 7);
  const price = Math.round(RICH.pub(van).fmv * 100) / 100;
  // POOR proposes: cash for the crate in district 7
  const mine = POOR.createOffer({ to: 'RICH', giveCash: price, want: { assets: [RICH.pub(van)], cash: 0 } });
  assert.equal(mine.ok, false); assert.match(mine.msg, /once what you ask for lands/);
  assert.ok(!POOR.out.some((m) => m.t === 'flag'), 'a bid for a crate from a district the buyer cannot enter is not misconduct: no flag for the instructor');
  // RICH proposes the same to POOR: the recipient is protected too
  const offer = { id: 'Ov', from: 'RICH', fromHandle: 'R', to: 'POOR', give: { assets: [{ ...RICH.pub(van) }], cash: 0, royalty: null }, want: { assets: [], cash: price }, skills: {} };
  const cash = POOR.s.cash, nw = POOR.netWorth();
  const acc = POOR.acceptOffer(offer);
  assert.equal(acc.ok, false); assert.match(acc.msg, /Blocked/);
  assert.equal(POOR.s.cash, cash);
  // priced where it lands, the deal is fair, and the basis is what it is worth there
  const here = Math.round(POOR.sideValue({ assets: [RICH.pub(van)] }, { landing: true }) * 100) / 100;
  const fair = POOR.acceptOffer({ ...offer, want: { assets: [], cash: here } });
  assert.ok(fair.ok, fair.msg);
  const got = POOR.s.assets.find((a) => a.from === 'p2p');
  assert.ok(POOR.s.zones.includes(got.zone) && got.zone <= 5);
  near(got.basis, assetFMV(got, got.zone, POOR.mods(), 1), 1e-9);
  near(POOR.netWorth(), nw, here * 0.05 + 0.01); // a fair swap leaves net worth where it was
});

test('F2, S11: the acceptor\'s crate is checked and sent as it truly is: a counterfeit cannot be sold at its described value, and no hidden truth travels', () => {
  const A = mk([], 1, 'AAA'), B = mk([], 2, 'BBB');
  rich(A, 3000); rich(B, 3000);
  // a counterfeit its owner does not know about: the proposer sees only the description
  const fake = put(B, 'bike', 1, { truth: { q: 1, fake: true, defects: [] } });
  const off = A.createOffer({ to: 'BBB', giveCash: Math.round(B.pub(fake).fmv * 100) / 100, want: { assets: [B.pub(fake)], cash: 0 } });
  assert.ok(off.ok, 'A sees only the description: ' + off.msg);
  const acc = B.acceptOffer(off.offer);
  assert.equal(acc.ok, false, 'B\'s own check values the crate as it truly is'); assert.equal(acc.msg, 'This crate cannot be traded at that price.', 'and says nothing about what it truly is worth'); assert.equal(acc.chk, undefined);
  assert.ok(B.s.assets.some((x) => x.id === fake.id), 'and the crate stays with B');
  // one its owner has proven fake sells at its true worth, and the delivery carries that worth in its quality, not as a secret
  const known = put(B, 'bike', 1, { truth: { q: 1, fake: true, defects: [] }, known: true });
  const off2 = A.createOffer({ to: 'BBB', giveCash: Math.round(B.pub(known).fmv * 100) / 100, want: { assets: [B.pub(known)], cash: 0 } });
  assert.ok(off2.ok, off2.msg);
  const acc2 = B.acceptOffer(off2.offer);
  assert.ok(acc2.ok, acc2.msg);
  const sent = acc2.deliver.assets[0];
  assert.equal('truth' in sent, false); assert.equal('belief' in sent, false); assert.equal(sent.known, true);
  near(sent.quality, FAKE_VALUE, 1e-9);
  const fin = A.finalizeOffer(off2.offer.id, acc2.deliver, 'BBB');
  assert.ok(fin.ok, fin.msg);
  const got = A.s.assets.find((x) => x.from === 'p2p');
  assert.equal(got.truth, undefined); near(A.val(got), B.pub(known).fmv, B.pub(known).fmv * 0.02 + 0.01);
});

test('S11: a crate whose owner knows it is fake is shown to the room at its true price, and the guardrail agrees with that price', () => {
  const A = mk([], 1, 'AAA'), B = mk([], 2, 'BBB');
  rich(A, 3000); rich(B, 3000);
  const fake = put(B, 'bike', 1, { truth: { q: 1, fake: true, defects: [] }, known: true });
  const pub = B.pub(fake);
  near(pub.fmv, B.val(fake), 1e-12);
  near(A.sideValue({ assets: [pub] }), pub.fmv, 1e-9); // the guardrail value equals the displayed price
  const asking = Math.round(pub.fmv * 100) / 100;
  const ok = A.createOffer({ to: 'BBB', giveCash: asking, want: { assets: [pub], cash: 0 } });
  assert.ok(ok.ok, 'the honest price passes: ' + ok.msg);
  A.cancelOffer(ok.offer.id);
  const dear = A.createOffer({ to: 'BBB', giveCash: Math.round(pub.fmv * 12 * 100) / 100, want: { assets: [pub], cash: 0 } });
  assert.equal(dear.ok, false, 'twelve times the real price is the overpay it is');
});

test('F3 (atomic part): a reply to an offer that is no longer open changes nothing on the proposer\'s side', () => {
  const { A, B, offer } = swap();
  const acc = B.acceptOffer(offer); assert.ok(acc.ok);
  A.cancelOffer(offer.id);
  const before = snap(A);
  const r = A.finalizeOffer(offer.id, acc.deliver, 'BBB');
  assert.equal(r.ok, false); assert.match(r.msg, /no longer open/);
  assert.equal(snap(A), before, 'the withdrawn crate is back once, nothing was added');
});

test('(c): a swap with the Practice Partner pays no XP and is not a counted swap; with a classmate it is and does', () => {
  const { A, B, offer } = swap();
  const acc = B.acceptOffer(offer, { npc: true }); assert.ok(acc.ok);
  assert.equal(B.s.xp, 0); assert.equal(B.s.p2p, 0); assert.equal(B.s.trades, 0);
  const xp = A.s.xp;
  assert.ok(A.finalizeOffer(offer.id, acc.deliver, 'Practice Partner', { npc: true }).ok);
  assert.equal(A.s.xp, xp); assert.equal(A.s.p2p, 0); assert.equal(A.s.trades, 0);
  assert.ok(A.s.assets.some((x) => x.cls === 'scrap'), 'the goods still change hands');
  const real = swap(); const acc2 = real.B.acceptOffer(real.offer); real.A.finalizeOffer(real.offer.id, acc2.deliver, 'B');
  assert.ok(real.A.s.xp > 0 && real.A.s.p2p === 1 && real.B.s.p2p === 1 && real.B.s.xp > 0);
  // an NPC cannot promise a royalty it will never pay
  const B2 = mk([], 2, 'BBB'); rich(B2, 500);
  const roy = B2.acceptOffer({ id: 'Or', from: 'NPC', give: { assets: [], cash: 0, royalty: { perDay: 10, days: 5 } }, want: { assets: [], cash: 50 }, skills: {} }, { npc: true });
  assert.equal(roy.ok, false);
});

test('swaps: a founder cannot trade with or accept from themselves, and a malformed offer is refused, not thrown', () => {
  const A = mk([], 1, 'AAA'); rich(A, 500);
  assert.equal(A.createOffer({ to: 'AAA', giveCash: 1, want: { assets: [], cash: 1 } }).ok, false);
  assert.equal(A.createOffer({ to: 'X', giveIds: 'A1', giveCash: 1, want: { assets: [], cash: 1 } }).ok, false);
  assert.equal(A.createOffer({ to: 'X', giveCash: Infinity, want: { assets: [], cash: 1 } }).ok, false);
  assert.equal(A.createOffer({ to: 'X', giveCash: 1, want: { assets: [], cash: Infinity } }).ok, false);
  assert.equal(A.createOffer({ to: 'X', giveCash: 1, want: { assets: [{ id: 'q', cls: 'nope', zone: 1 }], cash: 0 } }).ok, false);
  assert.equal(A.createOffer({ to: 'X', giveCash: 1, want: { assets: [], cash: 1 }, royalty: { perDay: Infinity, days: 5 } }).ok, false);
  assert.equal(A.createOffer({ to: 'X', giveCash: 1, want: { assets: [], cash: 1 }, royalty: { perDay: 1, days: Infinity } }).ok, false);
  assert.equal(A.createOffer({ to: 'X', giveCash: 1, want: { assets: [], cash: 1 }, royalty: { perDay: 1, days: NaN } }).ok, false);
  for (const junk of [null, undefined, 5, 'x', {}, { give: null }, { give: {}, want: { assets: 'x' } }, { id: 'O', from: 'P', give: { assets: [{ cls: 'nope' }] }, want: {} }, { id: 'O', from: 'P', give: { cash: NaN }, want: {} }, { id: 'O', from: 'P', give: { cash: -5 }, want: {} }]) {
    assert.doesNotThrow(() => A.acceptOffer(junk)); assert.equal(A.acceptOffer(junk).ok, false, JSON.stringify(junk));
  }
  assert.equal(A.acceptOffer({ id: 'O', from: 'AAA', give: { assets: [], cash: 5 }, want: { assets: [], cash: 5 } }).ok, false, 'your own offer');
  assert.equal(A.acceptOffer({ id: 'O', from: 'P', to: 'SOMEONE-ELSE', give: { assets: [], cash: 5 }, want: { assets: [], cash: 5 } }).ok, false, 'an offer made to someone else');
  const royal = A.createOffer({ to: 'X', giveCash: 1, want: { assets: [], cash: 1 }, royalty: { perDay: 0.1, days: 1e9 } });
  if (royal.ok) assert.ok(royal.offer.give.royalty.days <= 90); // days are clamped to the run
  assert.equal(bad(A.s), null);
});

// ------------------------------------------------------------------------------------------------------------------------- storage (F3, F2-82)
function fullZone(g, zone, n) { for (let i = 0; i < n; i++) put(g, 'bike', zone); }
/** The cash that makes two sides of a swap equal in the proposer's eyes (the crates asked for are valued where they would land). */
function balance(g, give, asked) {
  const gv = give.reduce((x, a) => x + g.val(a), 0), wv = g.sideValue({ assets: asked }, { landing: true });
  const c = (x) => Math.round(Math.max(0, x) * 100) / 100;
  return { giveCash: c(wv - gv), wantCash: c(gv - wv) };
}

test('F3: shipping counts what an open swap holds in escrow, so a withdrawn offer cannot overfill the district', () => {
  const g = rich(mk([], 5), 500); // districts 1 to 3
  const z = 2, cap = g.storeCap(z);
  g.s.assets = g.s.assets.filter((a) => a.zone !== z);
  fullZone(g, z, cap - 2);
  const mine = [put(g, 'bike', z), put(g, 'bike', z)];
  const asked = [{ id: 'q', cls: 'bike', cond: 'ok', quality: 1, wear: 1, zone: 1 }, { id: 'r', cls: 'bike', cond: 'ok', quality: 1, wear: 1, zone: 1 }];
  const bal = balance(g, mine, asked);
  const off = g.createOffer({ to: 'X', giveIds: mine.map((a) => a.id), giveCash: bal.giveCash, want: { assets: asked, cash: bal.wantCash } });
  assert.ok(off.ok, off.msg);
  assert.equal(g.roomIn(z), 0, 'the two crates in escrow still hold their places');
  const far = [put(g, 'bike', 1), put(g, 'bike', 1)];
  const q = g.freightQuote(far.map((a) => a.id), z);
  assert.equal(q.room, 0, 'the quote says so too'); assert.equal(g.ship(far.map((a) => a.id), z).ok, false);
  g.cancelOffer(off.offer.id);
  assert.ok(g.s.assets.filter((a) => a.zone === z).length <= cap, 'the district is within its storage after the offer is withdrawn');
});

test('F2-82: what an open swap has asked for holds its places, so nothing can take them before the swap lands, and the district never passes its storage', () => {
  const A = mk([], 5, 'AAA'), B = mk([], 6, 'BBB');
  rich(A, 500); rich(B, 500);
  const z = 2, cap = A.storeCap(z);
  A.s.assets = A.s.assets.filter((a) => a.zone !== z);
  fullZone(A, z, cap - 2); // two places left
  const give = put(A, 'bike', z); // one left; the bike leaves with the offer, two pens come back for it: one place more than it frees
  const pens = [put(B, 'pen', z), put(B, 'pen', z)];
  const asked = pens.map((p) => B.pub(p)), bal = balance(A, [give], asked);
  const off = A.createOffer({ to: 'BBB', giveIds: [give.id], giveCash: bal.giveCash, want: { assets: asked, cash: bal.wantCash } });
  assert.ok(off.ok, off.msg);
  assert.equal(A.roomIn(z), 0, 'the district keeps the two places the pens will need (the bike\'s one is inside them)');
  A.s.lots[z] = [{ id: 'Tx', zone: z, cls: 'bike', cond: 'ok', price: 1, exp: A.s.hour + 50, mode: 'fixed', truth: { q: 1, fake: false, defects: [] } }];
  const buy = A.buyLot(z, 'Tx');
  assert.equal(buy.ok, false, 'the places are spoken for'); assert.match(buy.msg, /full|storage/i);
  const acc = B.acceptOffer(off.offer); assert.ok(acc.ok, acc.msg);
  assert.ok(A.finalizeOffer(off.offer.id, acc.deliver, 'BBB').ok);
  assert.ok(A.s.assets.filter((a) => a.zone === z).length <= cap, `${A.s.assets.filter((a) => a.zone === z).length} crates in a district that holds ${cap}`);
});

// ------------------------------------------------------------------------------------------------------------------------- many swaps at random (the invariants the fixes above add up to)
test('swaps at random: crates and cash are only ever moved, never made or lost; ids stay unique; no district passes its storage; the state stays plain numbers', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const classes = Object.keys(ASSETS).filter((c) => [1, 2, 3].some((z) => demandOf(ASSETS[c], z) >= 3) && ASSETS[c].base < 60 && !ASSETS[c].yield);
  const A = mk([], 21, 'AAA'), B = mk([], 22, 'BBB');
  for (const g of [A, B]) { rich(g, 20000); g.s.assets = []; }
  for (const g of [A, B]) for (let i = 0; i < 9; i++) put(g, pick(classes), i < 8 ? 1 : 2); // district 1 holds ten: almost full, so room is what every swap is about
  const tally = () => {
    const out = {}, cash = { v: 0 };
    for (const g of [A, B]) {
      cash.v += g.s.cash + g.s.escrow.reduce((a, e) => a + e.cash, 0);
      for (const a of [...g.s.assets, ...g.s.escrow.flatMap((e) => e.assets), ...g.s.freight.flatMap((f) => f.items)]) out[a.cls] = (out[a.cls] || 0) + 1;
    }
    return { out, cash: cash.v };
  };
  const start = tally();
  const check = (what) => {
    for (const g of [A, B]) {
      const ids = [...g.s.assets, ...g.s.escrow.flatMap((e) => e.assets)].map((a) => a.id);
      assert.equal(new Set(ids).size, ids.length, what + ': ids are unique');
      for (const z of g.s.zones) { assert.ok(g.roomIn(z) >= 0, `${what}: district ${z} holds ${g.storeCap(z) - g.roomIn(z)} of ${g.storeCap(z)}`); assert.ok(g.s.assets.filter((a) => a.zone === z).length <= g.storeCap(z)); }
      assert.equal(bad(g.s), null, what + ': plain numbers');
    }
    const now = tally();
    assert.deepEqual(now.out, start.out, what + ': the same crates exist'); near(now.cash, start.cash, 1e-6);
  };
  let done = 0, refused = 0, noRoom = 0;
  for (let step = 0; step < 300; step++) {
    const [P, Q] = rnd() < 0.5 ? [A, B] : [B, A];
    const give = P.s.assets.filter(() => rnd() < 0.25).slice(0, 3);
    const theirs = Q.s.assets.filter(() => rnd() < 0.3).slice(0, 3).map((a) => Q.pub(a));
    const bal = balance(P, give, theirs);
    const r = P.createOffer({ to: Q.s.pid, giveIds: give.map((a) => a.id), giveCash: Math.min(bal.giveCash, P.s.cash), want: { assets: theirs, cash: Math.min(bal.wantCash, Q.s.cash) } });
    if (!r.ok && /no room/i.test(r.msg)) noRoom++;
    if (r.ok) {
      const roll = rnd();
      if (roll < 0.6) {
        const acc = Q.acceptOffer(r.offer);
        if (!acc.ok && /no room/i.test(acc.msg)) noRoom++;
        if (acc.ok) { const fin = P.finalizeOffer(r.offer.id, acc.deliver, Q.s.pid); assert.ok(fin.ok, fin.msg); done++; } else { refused++; P.cancelOffer(r.offer.id); }
      } else if (roll < 0.8) P.cancelOffer(r.offer.id);
      // else it stays open until it expires
    }
    check('step ' + step);
    if (rnd() < 0.1) { const h = Math.floor(rnd() * 30); A.advanceTo(A.s.hour + h); B.advanceTo(B.s.hour + h); check('after ' + h + ' hours'); }
  }
  assert.ok(done > 10, `${done} swaps went through (${refused} refused by the acceptor, ${noRoom} proposals had no room)`);
});

// ------------------------------------------------------------------------------------------------------------------------- freight ageing (F8)
test('F8: a crate on a truck over midnight spoils like one on the shelf', () => {
  const perishable = Object.keys(ASSETS).find((c) => ASSETS[c].perish && demandOf(ASSETS[c], 11) > 0 && demandOf(ASSETS[c], 12) > 0);
  assert.ok(perishable, 'the content has a perishable that sells in districts 11 and 12');
  const g = mk([], 5); g.s.events = [];
  for (let z = 2; z <= 12; z++) g._openZone(z);
  g.s.cash = 1e6; g.s.hour = 24 * 20; g._m = null;
  const stay = put(g, perishable, 11), go = put(g, perishable, 11);
  while (g.s.hour % 24 !== 21) g.stepHour();
  const r = g.ship([go.id], 12); assert.ok(r.ok, r.msg);
  for (let i = 0; i < r.hours + 3; i++) g.stepHour();
  assert.equal(g.s.freight.length, 0, 'it has landed');
  near(go.wear, stay.wear, 1e-12);
  assert.ok(stay.wear < 1 && go.wear < 1);
});

// ------------------------------------------------------------------------------------------------------------------------- the day checkpoint (F7)
test('F7: a rewind to a day checkpoint and a replay give exactly the state the straight run had (an audit due on the day boundary is created in the same hour)', () => {
  const base = rich(mk([], 7), 30000); // opens the audit gate
  while (base.s.auditPending) base.resolveAudit('A');
  const K = Math.floor(base.s.hour / 24) + 3, boundary = K * 24;
  base.s.auditNext = boundary;
  const start = JSON.stringify(base.s);
  const play = (rewind) => {
    const g = mk([], 7); g.s = JSON.parse(start); g._m = null; g._checkpoint();
    while (g.s.hour < boundary + 60) g.advanceTo(g.s.hour + 1);
    if (rewind) { assert.equal(g.rewindTo(boundary), boundary); while (g.s.hour < boundary + 60) g.advanceTo(g.s.hour + 1); }
    return g;
  };
  const ref = play(false), rew = play(true);
  assert.equal(ref.s.auditPending.at, boundary, 'the audit starts on the boundary hour');
  assert.equal(rew.s.auditPending.at, ref.s.auditPending.at);
  assert.equal(JSON.stringify(rew.s), JSON.stringify(ref.s));
  // a checkpoint asked for outside a step (a new game, a restored save) is taken at once
  const g = mk(); assert.ok(g.ckpt.has(0));
});

// ------------------------------------------------------------------------------------------------------------------------- JSON-safe state (F9, shocklog-de-infinity)
test('F9: the debt-to-equity stored at a shock is a real number even when net worth is gone, so a save and a reload keep it', () => {
  const g = mk(['heir', 'pro'], 3);
  g.s.loans.push({ id: 'D1', prod: 'micro', principal: 50, accr: 0, last: 0, next: 24, drawn: 0 }); // $50 owed against a $0.05 net worth
  while (g.s.hour < 336) g.advanceTo(g.s.hour + 1); // day 15: the TikTok shock
  const sh = g.s.shockLog[0];
  assert.ok(sh, 'a shock was logged'); assert.ok(Number.isFinite(sh.de), 'de = ' + sh.de);
  assert.ok(sh.de > 4.5, 'and it still says the founder was far over the limit');
  assert.deepEqual(JSON.parse(JSON.stringify(g.s.shockLog)), g.s.shockLog, 'a save round trip changes nothing');
  assert.equal(bad(g.s), null);
  assert.equal(bad(g.publicSnapshot()), null);
});

// ------------------------------------------------------------------------------------------------------------------------- argument hardening (L12)
test('L12: a district that does not exist, a list that is not a list and a config that is null are refused, not thrown', () => {
  const g = rich(mk([], 4), 5000);
  const lot = g.s.lots[1][0];
  for (const zone of [99, undefined, null, '__proto__', 'constructor', 0, -1, 1.5, NaN, {}]) {
    for (const [name, f] of Object.entries({
      hirePipeline: () => g.hirePipeline('broker', zone, {}), lotTruth: () => g.lotTruth(zone, lot.id), buyQuote: () => g.buyQuote(zone, lot.id), buyLot: () => g.buyLot(zone, lot.id),
      passLot: () => g.passLot(zone, lot.id), passLead: () => g.passLead(zone, 'L1'), recordInspect: () => g.recordInspect(zone, lot.id, { estimate: { quality: 1, fakeProb: 0 } }),
    })) assert.doesNotThrow(f, `${name}(${String(zone)})`);
  }
  assert.equal(g.hirePipeline('broker', 99, {}).ok, false);
  assert.equal(g.lotTruth('__proto__', 'x'), null);
  assert.equal(g.sellPool('A1').ok, false); assert.equal(g.poolQuote(null).ok, false); assert.equal(g.freightQuote('A1', 2).ok, false); assert.equal(g.ship({}, 2).ok, false);
  assert.doesNotThrow(() => g.configure('P1', null)); assert.equal(g.configure('P1', null).ok, false);
  assert.doesNotThrow(() => g.hirePipeline('broker', 5, null));
  // a district id that is text but means a number still works, as it did
  assert.equal(g.buyQuote(String(lot.zone), lot.id).ok, true);
  assert.ok(g.lotTruth(String(lot.zone), lot.id));
});

test('injectEvent: a bad hour, id, class or options are refused or defaulted without touching the state', () => {
  const g = mk();
  const n = g.s.events.length;
  for (const at of [NaN, Infinity, -Infinity, 'x', undefined, null, {}]) assert.equal(g.injectEvent('tariff', at, { id: 'inj-' + String(at) }), false, String(at));
  assert.equal(g.s.events.length, n);
  assert.equal(g.injectEvent('tariff', 100.7, { id: 5 }), true); // a numeric id is not an id: the default is used
  assert.equal(g.s.events.at(-1).start, 100); assert.equal(typeof g.s.events.at(-1).id, 'string');
  assert.equal(g.injectEvent(Object.keys(ALGO_EVENTS)[0], 200, null), true);
  assert.equal(g.injectEvent('nonsense', 5, { replace: true }), false);
  assert.doesNotThrow(() => g.advanceTo(300));
  assert.equal(bad(g.s), null);
});

test('the table of closed methods names real methods, and every public method that acts for the player is closed', () => {
  // the methods that only read, or are the room's or a reward's, not a market action of the player's (grantPoints: the progress tracker's reward, not a market action)
  const OPEN = new Set(['emit', 'daysRemaining', 'rand', 'lvl', 'note', 'led', 'xp', 'level', 'burnedOut', 'garnish', 'mods', 'crowd', 'perkValue', 'val', 'fintechMult', 'instFee', 'zoneTax', 'liqDelay', 'loanRate', 'storeCap', 'debt', 'invValue', 'inTransit',
    'netWorth', 'deRatio', 'eei', 'creativityScore', 'advanceTo', 'stepHour', 'warnLead', 'injectEvent', 'ownCounts', 'cmFor', 'logNiche', 'radar', 'growthMult', 'acceptsBroken', 'quotePitch', 'lotTruth', 'buyQuote', 'repairMultFor', 'repairQuote',
    'repairQuoteFor', 'bestZone', 'poolQuote', 'freightQuote', 'autoLocked', 'pipeCost', 'pipeCap', 'pipeUpCost', 'cycleLen', 'forecast', 'validLane', 'clientQuote', 'runningPipes', 'loanRoom', 'loanBlock', 'auditFine', 'pub', 'sideValue',
    'checkOffer', 'projected', 'roomIn', 'cancelOffer', 'rewindTo', 'toJSON', 'niches48', 'publicSnapshot', 'day', 'P', 'B', 'grantPoints']);
  const names = Object.getOwnPropertyNames(Game.prototype).filter((n) => n !== 'constructor' && !n.startsWith('_'));
  for (const m of CLOSED_METHODS) assert.ok(names.includes(m), m + ' is a method');
  assert.ok(!CLOSED_METHODS.some((m) => OPEN.has(m)));
  // a method added later that reads like an action must be placed: closed (it acts for the player) or knowingly open (it only reads)
  const ACTION = /^(buy|sell|ship|hire|draw|repay|pitch|exit|offer|accept|record|pass|repair|configure|upgrade|release|pause|acquire|resolve|verify|spend|receive|finalize|create|invest|borrow|trade|sign|claim)/;
  const undecided = names.filter((n) => !CLOSED_METHODS.includes(n) && !OPEN.has(n) && ACTION.test(n));
  assert.deepEqual(undecided, [], 'add it to CLOSED_METHODS (it acts for the player) or to this test\'s open list (it only reads)');
});
