// Regression tests for the remaining engine, session and games items of the audit of the integrated branch (the "engine" owner of the remaining-items round, on top of 0d66995).
// Each test names the finding it holds and fails on 0d66995. Sections: royalty streams, escrow, the swap's lock, experience, the grade for adaptability, offers, the appraisal, the Deal Room (a table whose
// subject has gone, the pitch, the walk-away card, the fix dial, the bench's quote, a counterfeit caught on a later visit, Assist) and the relay (its limits as shipped, the owner's token).
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };

const { Game } = await import('../js/engine.js');
const { ASSETS, SWAPS, FMV_BAND, EVENTS } = await import('../js/config.js');
const Sess = await import('../js/session.js');
const { Session } = Sess;
const C = await import('../js/cohort.js');
const { hash01 } = await import('../js/rng.js');
const D = await import('../js/deal.js');
const UI = await import('../js/ui/deal.js');
const haggle = await import('../js/play/haggle.js');
const pitch = await import('../js/play/pitch.js');
const { makeGame } = await import('./bot.mjs');
const { fakeCtx } = await import('./helpers/ctx.mjs');

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const mk = (perks = [], seed = 1, pid) => { const g = new Game({ perks, seed, handle: pid || 'T', pid: pid || 'T-' + seed }); g.env.algo = false; return g; };
const rich = (g, cash) => { g.s.cash = cash; g.advanceTo(g.s.hour + 1); return g; };
const put = (g, cls, zone, o = {}) => {
  const a = g._mk(g.s, cls, { zone, basis: o.basis ?? 1, cond: o.cond, quality: o.quality });
  if (o.truth) { a.truth = o.truth; a.known = !!o.known; } else if (o.known) a.known = true;
  g.s.assets.push(a);
  return a;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(20); } throw new Error('timed out: ' + fn); };
const J = (o) => JSON.parse(JSON.stringify(o));

// =========================================================================================================================  royalty streams
test('Royalty stream (medium): a promise worth $100 is not a stream of a million a day: what a receiver takes is capped at what the swap was priced at, whatever the payer sends', () => {
  const ALT = mk([], 1, 'ALT'), MAIN = mk([], 2, 'MAIN');
  const crate = put(MAIN, 'textbooks', 1), v = MAIN.val(crate);
  rich(ALT, v * 10); rich(MAIN, 500);                                   // ALT is worth about ten times the crate: the promise counts for a tenth of that, about the crate's price
  const off = ALT.createOffer({ to: 'MAIN', royalty: { perDay: 1e6, days: 90 }, want: { assets: [MAIN.pub(crate)], cash: 0 } });
  assert.ok(off.ok, off.msg);
  const acc = MAIN.acceptOffer(off.offer); assert.ok(acc.ok, acc.msg);
  assert.ok(ALT.finalizeOffer(off.offer.id, acc.deliver, 'MAIN').ok);
  const before = MAIN.s.cash;
  // a modified client for the payer sends a message for every day of the stream at once
  for (let i = 0; i < 90; i++) MAIN.receiveRoyalty(1e6, off.offer.id, 'ALT', MAIN.s.hour);
  const gained = MAIN.s.cash - before;
  assert.ok(gained <= v * (1 + FMV_BAND) * 1.01 + 0.01, `the receiver was paid ${gained} for a promise the check counted at about ${v}`);
  assert.ok(gained < 1000, 'and not millions');
  // the honest payer pays no more than the receiver will take: the stream it holds is capped the same way, and it owes no more than that
  const payer = ALT.s.royalties.find((r) => r.dir === 'pay');
  assert.ok(payer.cap <= v * (1 + FMV_BAND) * 1.01 + 0.01, 'the payer\'s stream is capped: ' + payer.cap);
  ALT.out.length = 0; ALT.advanceTo(ALT.s.hour + 24 * 95);
  const sent = ALT.out.filter((m) => m.t === 'royalty').reduce((a, m) => a + m.amount, 0);
  assert.ok(sent <= payer.cap + 0.01, `the payer sent ${sent}, no more than the receiver can take (${payer.cap})`);
  assert.ok(ALT.royaltyOwed() <= 0.01, 'and owes nothing more once it has');
});

test('Royalty stream (medium): receipts are paced to the days that have gone by, a day\'s rate each (and the day in progress), not the whole promise at once', () => {
  const A = mk([], 1, 'AAA'), B = mk([], 2, 'BBB');
  rich(A, 20000); rich(B, 3000);
  const off = A.createOffer({ to: 'BBB', giveCash: 0, royalty: { perDay: 30, days: 5 }, want: { assets: [], cash: 150 } });
  assert.ok(off.ok, off.msg);
  const acc = B.acceptOffer(off.offer); assert.ok(acc.ok);
  assert.ok(A.finalizeOffer(off.offer.id, acc.deliver, 'BBB').ok);
  const c0 = B.s.cash, h0 = B.s.hour;
  for (let i = 0; i < 20; i++) B.receiveRoyalty(30, off.offer.id, 'AAA', h0);
  near(B.s.cash - c0, 60, 1e-9);                                        // the day in progress and one in hand: two days' rate
  assert.match(B.receiveRoyalty(30, off.offer.id, 'AAA', h0).msg, /not due yet/);
  for (let i = 0; i < 20; i++) B.receiveRoyalty(30, off.offer.id, 'AAA', h0 + 24);
  near(B.s.cash - c0, 90, 1e-9);                                        // a day later: one more
  for (let i = 0; i < 20; i++) B.receiveRoyalty(30, off.offer.id, 'AAA', h0 + 24 * 30);
  near(B.s.cash - c0, 150, 1e-9);                                       // and never past what was promised
  // an honest payer who is behind on its arrears is paid up in a burst that is within its schedule
  const P = mk([], 3, 'PPP'), R = mk([], 4, 'RRR');
  rich(P, 20000); rich(R, 3000);
  const o2 = P.createOffer({ to: 'RRR', giveCash: 0, royalty: { perDay: 30, days: 5 }, want: { assets: [], cash: 150 } });
  const a2 = R.acceptOffer(o2.offer); P.finalizeOffer(o2.offer.id, a2.deliver, 'RRR');
  P.s.cash = 0; P.advanceTo(P.s.hour + 24 * 3 + 1); P.s.cash = 1000; P.out.length = 0; P.advanceTo(P.s.hour + 24 * 3);
  const r0 = R.s.cash;
  for (const m of P.out.filter((x) => x.t === 'royalty')) assert.ok(R.receiveRoyalty(m.amount, o2.offer.id, 'PPP', P.s.hour).ok, 'a payment from the honest payer is taken');
  near(R.s.cash - r0, 150, 1e-6);
});

test('Royalty stream (medium): through a room, an honest payer\'s daily payments all arrive, even to a receiver whose game is a day behind the class\'s clock (a tab that was asleep)', () => {
  const hub = hubOf('ROYB'), A = sessionIn(hub, 'PC-AAAA', undefined, 24 * 10), B = sessionIn(hub, 'PC-BBBB', undefined, 24 * 10);
  const x = put(B.game, 'textbooks', 1), v = B.game.val(x);
  A.game.s.cash = v * 10;
  for (const S of [A, B]) S._sendSnap(true); hub.drain();
  const want = A.roster().find((q) => q.pid === B.pid).inventory.find((i) => i.id === x.id);
  const total = Math.round(v * 0.8), r = A.propose({ to: B.pid, giveIds: [], royalty: { perDay: total / 4, days: 4 }, want: { assets: [want], cash: 0 } }); assert.ok(r.ok, r.msg); hub.drain();
  assert.ok(B.acceptIncoming(r.offer.id).ok); hub.drain();
  assert.equal(A.game.s.escrow.length, 0, 'the swap is done'); const stream = B.game.s.royalties.find((q) => q.dir === 'recv'); assert.ok(stream && stream.cap >= total - 0.01, 'a promise worth its price is taken in full: ' + stream?.cap);
  const c0 = B.game.s.cash;
  for (let d = 1; d <= 6; d++) {
    const hour = 24 * 10 + d * 24;
    A.clock.set({ hour, paused: true }); B.clock.set({ hour, paused: true });   // the class's clock moves on for both
    A.tick(); hub.drain();                                                        // B's game stays where it was (its tab was asleep): the clock is what paces the stream
  }
  near(B.game.s.cash - c0, total, 0.02);
  assert.ok(A.game.royaltyOwed() < 0.02, 'and the payer owes nothing more');
});

test('Royalty offer (low): an invitation whose daily rate is more than its maker is worth is declined, and the maker\'s escrow comes back', () => {
  const hub = hubOf('ROYA'), A = sessionIn(hub, 'PC-AAAA', undefined, 24 * 10), B = sessionIn(hub, 'PC-BBBB', undefined, 24 * 10);
  const x = put(B.game, 'textbooks', 1), v = B.game.val(x);
  A.game.s.cash = v * 10;                                                // worth ten times the crate: a promise counts for a tenth of that, about the crate's price
  for (const S of [A, B]) S._sendSnap(true); hub.drain();
  const want = A.roster().find((q) => q.pid === B.pid).inventory.find((i) => i.id === x.id);
  const r = A.propose({ to: B.pid, giveIds: [], royalty: { perDay: v * 12, days: 1 }, want: { assets: [want], cash: 0 } }); // a day's rate bigger than the whole of what A is worth
  assert.ok(r.ok, r.msg); hub.drain();
  assert.equal(B.incoming.length, 0, 'not shown to the player');
  assert.equal(A.game.s.escrow.length, 0, 'and the proposer is told at once, so its escrow comes back');
  // a modest promise is shown
  const r2 = A.propose({ to: B.pid, giveIds: [], royalty: { perDay: v / 5, days: 5 }, want: { assets: [want], cash: 0 } });
  assert.ok(r2.ok, r2.msg); hub.drain();
  assert.equal(B.incoming.length, 1);
});

// =========================================================================================================================  escrow
test('Escrow (low): a perishable parked in an open swap spoils over midnight like one on the shelf (an offer to a classmate who never answers is not a freezer)', () => {
  const cls = Object.keys(ASSETS).find((c) => ASSETS[c].perish && ASSETS[c].dem);
  const g = mk([], 1, 'AAA'); rich(g, 300000); g.s.events = [];
  const shelf = put(g, cls, 1), parked = put(g, cls, 1);
  const off = g.createOffer({ to: 'BBB', giveIds: [parked.id], want: { assets: [], cash: Math.round(g.val(parked)) } });
  assert.ok(off.ok, off.msg); assert.equal(g.s.escrow.length, 1);
  g.advanceTo(g.s.hour + 24 * 2);                                        // two midnights, inside the 72 hours the offer lives
  assert.equal(g.s.escrow.length, 1, 'still open');
  assert.ok(shelf.wear < 0.95, 'the shelf one has spoiled: ' + shelf.wear);
  near(parked.wear, shelf.wear, 1e-9);
  assert.ok(g.val(g.s.escrow[0].assets[0]) < g.val(put(g, cls, 1)), 'and is worth less than a fresh one');
  // depreciation is paid in escrow too, not only spoilage
  const h = mk([], 2, 'CCC'); rich(h, 300000); h.s.events = [];
  const keep = put(h, 'sedan', 1), parkedSedan = put(h, 'sedan', 1);
  assert.ok(h.createOffer({ to: 'BBB', giveIds: [parkedSedan.id], want: { assets: [], cash: Math.round(h.val(parkedSedan)) } }).ok);
  h.advanceTo(h.s.hour + 24 * 2);
  assert.ok(keep.wear < 1, 'a sedan on the shelf wears: ' + keep.wear); near(parkedSedan.wear, keep.wear, 1e-12);
});

// =========================================================================================================================  the swap's lock
/** Sessions on an in-memory room: a message is delivered when the test drains it, as the relay would. */
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
/** A founder in the hub's room: one world for all (the room's seed), all districts to 4 open, at the given hour. */
function sessionIn(hub, pid, perks = ['trades', 'pro'], hour = 0) {
  store.clear();
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
  for (const S of ses) { const s = S.game.s; cash += s.cash - s.ledger.filter((r) => /^Appraisal:/.test(r.text)).reduce((a, r) => a + r.amt, 0); for (const e of s.escrow) { cash += e.cash || 0; for (const a of e.assets) cls[a.cls] = (cls[a.cls] || 0) + 1; } for (const a of s.assets) cls[a.cls] = (cls[a.cls] || 0) + 1; }
  return { cls, cash };
};

test('Swap lock (low): the proposer holds its escrow while the acceptor is still trying to deliver, so a delivery that comes late completes the swap and nothing is made twice', () => {
  const hub = hubOf('LOCK'), A = sessionIn(hub, 'PC-AAAA'), B = sessionIn(hub, 'PC-BBBB');
  A.game.s.cash = 500; const x = put(B.game, 'bike', 1);
  for (const S of [A, B]) S._sendSnap(true); hub.drain();
  const want = A.roster().find((q) => q.pid === B.pid).inventory.find((i) => i.id === x.id);
  const res = A.propose({ to: B.pid, giveIds: [], giveCash: Math.round(want.fmv), want: { assets: [want], cash: 0 } }); assert.ok(res.ok, res.msg); hub.drain();
  const before = totals(A, B);
  hub.drop = (m) => m.t === 'deliver' && !hub.allow;                       // B commits at the confirmation and every delivery is lost
  assert.ok(B.acceptIncoming(res.offer.id).ok); hub.drain();
  assert.equal(A.game.s.escrow.length, 1, 'A has not heard'); assert.ok(B.delivering.has(res.offer.id));
  A.game.s.escrow[0].lockedAt -= 90000;                                    // ninety seconds on: past a minute, inside B's tries (at 5, 20, 45 and 80 seconds, and a last one at 125)
  A.tick(Date.now());
  const w = A.withdraw(res.offer.id);
  assert.equal(w.ok, false, 'B is still trying: the offer cannot be taken back under it (' + w.msg + ')');
  hub.allow = true;                                                       // the network is back: the next try arrives
  B.tick(Date.now() + 100000); hub.drain();
  assert.equal(A.game.s.escrow.length, 0, 'A took the delivery'); assert.equal(B.delivering.size, 0, 'and B heard it');
  assert.deepEqual(totals(A, B).cls, before.cls, 'every crate there was is still there once'); near(totals(A, B).cash, before.cash, 1e-6);
  // the hold does end by itself: the acceptor is asked, and one that never committed lets it go (and one that does not answer is out of reach after a minute)
  const C = sessionIn(hub, 'PC-CCCC'); C.game.s.cash = 100;
  for (const S of [B, C]) S._sendSnap(true); hub.drain();
  const o2 = C.propose({ to: B.pid, giveIds: [], giveCash: 10, want: { assets: [], cash: 10 } }); hub.drain();
  C._onMsg({ t: 'accept', from: B.pid, role: 'student', to: C.pid, offerId: o2.offer.id });
  const e = C.game.s.escrow[0]; assert.equal(e.lockedBy, B.pid);
  hub.drop = () => true;                                                   // nobody answers
  const t0 = Date.now() + 10 * 60000;
  C.tick(t0); assert.ok(e.recalling, 'ten minutes on, B is asked'); assert.equal(C.withdraw(o2.offer.id).ok, false, 'and until it answers the offer is still held');
  C.tick(t0 + 61000); assert.equal(e.lockLapsed, true, 'a minute without an answer and the hold has lapsed'); assert.ok(C.withdraw(o2.offer.id).ok);
});

// =========================================================================================================================  experience
const lotsIn = (g, zone, n, prefix = 'LX') => {
  const out = [];
  for (let i = 0; i < n; i++) { const id = prefix + i; g.s.lots[zone].push({ id, zone, cls: 'pen', cond: 'ok', price: 5, exp: g.s.hour + 500, mode: 'fixed', truth: { q: 1, fake: false, defects: [] } }); out.push(id); }
  return out;
};

test('Skill-game XP (low): a Quick Read of every fresh lot is practice, not a faster way up: a kind of game pays at most 300 in a virtual day, and a Read in which nothing was bought pays nothing', () => {
  const g = mk(['trades', 'pro'], 3, 'XP'), mult = g.P.xpMult, ids = lotsIn(g, 1, 80);
  const xp0 = g.s.xp;
  for (const id of ids) g.recordInspect(1, id, { estimate: { quality: 1, fakeProb: 0.1 }, confidence: 0.5, score: 0.8, quick: true, key: id, spent: 3 });
  const day1 = g.s.xp - xp0;
  assert.ok(day1 <= 300 * mult + 5, `80 Quick Reads in a day paid ${day1} (the day's most is ${300 * mult}, give or take the rounding of each payment)`);
  assert.ok(day1 > 150, 'and a day does pay: ' + day1);
  assert.equal(g.s.meta.inspect.n, 80, 'every one is still tallied for the debrief');
  // the next day pays again
  g.advanceTo(g.s.hour + 24);
  const more = lotsIn(g, 1, 3, 'LY'), xp1 = g.s.xp;
  for (const id of more) g.recordInspect(1, id, { estimate: { quality: 1, fakeProb: 0.1 }, confidence: 0.5, score: 0.8, quick: true, key: id, spent: 3 });
  assert.ok(g.s.xp - xp1 > 40, 'a new day pays: ' + (g.s.xp - xp1));
  // a Read with nothing bought pays nothing and does not use up the lot's payment
  const g2 = mk(['trades', 'pro'], 3, 'XQ'), [lot] = lotsIn(g2, 1, 1), x0 = g2.s.xp;
  g2.recordInspect(1, lot, { estimate: { quality: 1, fakeProb: 0.1 }, confidence: 0, score: 0.5, key: lot, spent: 0 });
  assert.equal(g2.s.xp, x0, 'nothing bought, nothing paid');
  g2.recordInspect(1, lot, { estimate: { quality: 1, fakeProb: 0.1 }, confidence: 0.6, score: 0.8, key: lot, spent: 2 });
  assert.ok(g2.s.xp > x0, 'a real read of the same lot later still pays');
  // the other games are held to the same day
  const g3 = mk(['trades', 'pro'], 3, 'XR'), y0 = g3.s.xp;
  for (let i = 0; i < 80; i++) g3.recordPlay('haggle', { score: 0.9, quick: true, key: 'H' + i, role: 'buy', deal: true });
  assert.ok(g3.s.xp - y0 <= 300 * g3.P.xpMult + 5, 'haggles: ' + (g3.s.xp - y0));
});

// =========================================================================================================================  the grade for adaptability
function instructorRoom(code = 'ROOM', hour = 24 * 60) {
  store.clear();
  const s = new Session(); s.pid = 'TEACH'; s.mode = 'instructor'; s.worldSeed = code; s.clock.set({ hour, paused: true }); s.roomInfo = { code, relay: '', role: 'instructor' };
  const add = (pid, nw, shockLog, extra = {}) => s.peers.set(pid, { pid, handle: pid, role: 'student', clean: true, seen: Date.now(), snap: C.cleanSnap({ handle: pid, nw, hour, flags: {}, shockLog, ...extra }, pid) });
  return { s, add };
}
test('Adaptability (medium): only a shock the room really had is graded: a made-up row, an id nobody had, a net worth no run could reach, or a result for days that have not gone by score nothing', () => {
  const { s, add } = instructorRoom();
  const fed = (r, pivots = 0, o = {}) => ({ id: 'fed@1056', nw: 1000, nwAfter: 1000 * r, pivots, ...o });
  add('H1', 5000, [fed(1.0, 2)]); add('H2', 4000, [fed(0.8)]); add('H3', 3000, [fed(0.7)]); add('H4', 2000, [fed(0.5)]);
  add('CHEAT', 50, [{ id: 'fed@300', nw: 0.01, nwAfter: 0.2, pivots: 9 }]);                       // a shock at an hour the room never had one
  add('CHEAT2', 50, [{ id: 'made-up-shock', nw: 1, nwAfter: 99999, pivots: 9 }]);                // an id that appears nowhere
  add('CHEAT3', 50, [{ id: 'fed@1056', nw: 4e7, nwAfter: 4e7, pivots: 0 }]);                      // a real shock, a net worth the best run could not have had on day 44
  add('EARLY', 50, [{ id: 'tariff@1776', nw: 100, nwAfter: 5000, pivots: 9 }]);                  // the Day 75 shock, on day 60: it has not happened yet
  const by = Object.fromEntries(s.gradebook().map((r) => [r.pid, r]));
  for (const p of ['CHEAT', 'CHEAT2', 'CHEAT3', 'EARLY']) assert.equal(by[p].adapt, null, p + ' is graded on nothing: the neutral 50 in the automated points');
  assert.ok(by.H1.adapt > by.H2.adapt && by.H2.adapt > by.H3.adapt && by.H3.adapt > by.H4.adapt, 'the honest class keeps its order');
  assert.ok(by.CHEAT.auto < by.H1.auto, 'and a fabricated row buys no points');
  // a row cannot crowd its own list: the first entry for an id is the one that counts
  add('DUP', 2500, [fed(0.5), ...Array.from({ length: 10 }, () => fed(20, 9))]);
  assert.ok(s.gradebook().find((r) => r.pid === 'DUP').adapt < 50, 'ten extreme duplicates do not lift a row');
});

test('Adaptability (medium): a shock the instructor injected, and an algorithmic one this room\'s seed would roll, are the room\'s own; they survive a reload of the dashboard', () => {
  const { s } = instructorRoom('QRST', 24 * 60);                           // (a room whose seed rolls an algorithmic shock on days 8, 9, 28 and 29, and on no other before day 30)
  s.inject('tiktok', { when: 0 });
  const injected = [...s.injected.keys()][0];
  assert.ok(injected && s.shockStart(injected) != null, 'the instructor\'s own record: ' + injected);
  const day = (ok) => { for (let d = 4; d <= 86; d++) if ((hash01('QRST' + 'algo' + d) <= 0.14) === ok) return d; return null; };
  const rolled = day(true), unrolled = day(false);
  assert.ok(rolled && unrolled, 'days where this seed rolls an algorithmic shock, and days where it does not');
  assert.equal(s.shockStart('algo-' + rolled), (rolled - 1) * 24 + 8); assert.equal(s.shockStart('algo-' + unrolled), null);
  assert.equal(s.shockStart('tiktok@336'), 336, 'a scheduled shock'); assert.equal(s.shockStart('tiktok@337'), null, 'but not at another hour'); assert.equal(s.shockStart('__proto__'), null); assert.equal(s.shockStart('constructor@1'), null);
  const start = s.shockStart(injected), hourNow = Math.floor(s.clock.now());
  assert.ok(start <= hourNow);
  // the record survives the dashboard being closed and opened again
  s.rosterDirty = true; s._saveRoster(Date.now() + 60000);
  const t = new Session(); t.pid = 'TEACH'; t.mode = 'instructor'; t._loadRoster('QRST');
  assert.equal(t.shockStart(injected), start, 'a reloaded dashboard still knows what it injected');
});

// =========================================================================================================================  an offer describes only what its sender has published
/** A student with a run and a stand-in room that collects what it sends; the game is at the given hour. */
function receiver(pid = 'V', hour = 24 * 40) {
  store.clear();
  const s = new Session(); s.pid = pid; s.mode = 'student'; s.startGame({ perks: ['pro'], specialty: 'ops', handle: pid });
  s.game.advanceTo(hour); s.clock.set({ hour, paused: true }); s.clockAdopted = true;
  const out = []; s.room = { kind: 'local', send: (m) => out.push(m), close() {}, on() {} };
  return { s, out };
}
const snapMsg = (from, snap = {}) => J({ t: 'snap', from, role: 'student', handle: from, snap: { pid: from, handle: from, nw: 10, hour: 24 * 40, ...snap } });
const canvas = { id: 'A99', cls: 'postwarCanvas', cond: 'ok', quality: 1.4, wear: 1, zone: 1 };
const handBuilt = (give = [canvas], cash = 273914) => J({ t: 'offer', from: 'ACC', role: 'student', handle: 'acc', to: 'V', offer: { id: 'OACC-1', from: 'ACC', fromHandle: 'acc', to: 'V', at: 0, note: '', give: { assets: give, cash: 0, royalty: null }, want: { assets: [], cash }, skills: { ops: 1, growth: 1, fintech: 1 } } });

test('Offers (low): a hand-built offer for a crate its sender has not published is declined, not shown: the acceptor\'s engine never mints it', () => {
  // no snapshot from the sender at all
  let { s, out } = receiver();
  s.game.s.cash = 400000;
  s._onMsg(handBuilt());
  assert.equal(s.incoming.length, 0, 'an offer from someone who has published nothing is not an offer for a crate'); assert.ok(out.some((m) => m.t === 'decline' && m.to === 'ACC' && m.offerId === 'OACC-1'), 'and the sender is told, so a real escrow would come back');
  // a snapshot that does not list it, or lists it as something else
  ({ s, out } = receiver()); s.game.s.cash = 400000;
  s._onMsg(snapMsg('ACC', { nw: 5e6, inventory: [{ id: 'A1', cls: 'pen', cond: 'ok', zone: 1, quality: 1 }] }));
  s._onMsg(handBuilt()); assert.equal(s.incoming.length, 0);
  ({ s, out } = receiver()); s.game.s.cash = 400000;
  s._onMsg(snapMsg('ACC', { nw: 5e6, inventory: [{ id: 'A99', cls: 'pen', cond: 'ok', zone: 1, quality: 1 }] }));
  s._onMsg(handBuilt()); assert.equal(s.incoming.length, 0, 'the class has to be the one published');
  // the crate is published, but its sender is worth a few dollars: a crate worth hundreds of thousands cannot be theirs
  ({ s, out } = receiver()); s.game.s.cash = 400000;
  s._onMsg(snapMsg('ACC', { nw: 50, inventory: [{ ...canvas }] }));
  s._onMsg(handBuilt()); assert.equal(s.incoming.length, 0, 'bounded by what the sender is worth');
  // a real one: published, and the sender is worth it
  ({ s, out } = receiver()); s.game.s.cash = 400000;
  s._onMsg(snapMsg('ACC', { nw: 3e6, inventory: [{ ...canvas }] }));
  s._onMsg(handBuilt([canvas], 280000)); assert.equal(s.incoming.length, 1, 'a published crate is an offer');
});

test('Offers (low): an honest proposer\'s offer is always covered by its stock, even for a crate that is not among the 24 a snapshot lists, or one it got a moment ago', () => {
  const hub = hubOf('COVER'), A = sessionIn(hub, 'PC-AAAA'), B = sessionIn(hub, 'PC-BBBB');
  B.game.s.cash = 5000;
  for (let i = 0; i < 30; i++) put(A.game, 'paperclip', 1);
  const last = put(A.game, 'bike', 1);                                      // the thirty-first crate: not in the first 24 a snapshot shows
  for (const S of [A, B]) S._sendSnap(true); hub.drain();
  assert.ok(!B.peers.get('PC-AAAA').snap.inventory.some((i) => i.id === last.id), 'it is not in the published stock');
  const r = A.propose({ to: B.pid, giveIds: [last.id], giveCash: 0, want: { assets: [], cash: Math.round(A.game.val(last)) } }); assert.ok(r.ok, r.msg); hub.drain();
  assert.ok(B.peers.get('PC-AAAA').snap.inventory.some((i) => i.id === last.id), 'the proposer published its stock, with the crates of the offer in it, before it made the offer');
  assert.equal(B.incoming.length, 1, 'so the offer is covered');
  const fresh = put(A.game, 'bike', 1);                                     // got a moment ago: no snapshot since
  const r2 = A.propose({ to: B.pid, giveIds: [fresh.id], giveCash: 0, want: { assets: [], cash: Math.round(A.game.val(fresh)) } }); assert.ok(r2.ok, r2.msg); hub.drain();
  assert.equal(B.incoming.length, 2);
});

// =========================================================================================================================  the appraisal
test('Swap guardrail (medium): a refused swap costs the appraisal whatever the founder holds: with no cash, or with it parked in an escrow, the hidden worth of a crate is not a free oracle', () => {
  const swapPair = () => { const A = mk([], 1, 'AAA'), B = mk([], 2, 'BBB'); rich(A, 100000); rich(B, 3000); return { A, B }; };
  const probe = (A, B, fake, want) => A.createOffer({ to: 'BBB', giveIds: [fake.id], want: { assets: [B.pub(want)], cash: 0 } });
  // the price with cash in hand
  let { A, B } = swapPair();
  let fake = put(A, 'bike', 1, { truth: { q: 1, fake: true, defects: [] } }), want = put(B, 'bike', 1);
  const c0 = A.s.cash, r0 = probe(A, B, fake, want), paid = c0 - A.s.cash;
  assert.equal(r0.ok, false); assert.equal(r0.msg, 'This crate cannot be traded at that price.'); assert.ok(paid > 0.1, 'a fee: ' + paid);
  // no cash at all
  ({ A, B } = swapPair()); fake = put(A, 'bike', 1, { truth: { q: 1, fake: true, defects: [] } }); want = put(B, 'bike', 1);
  A.s.cash = 0; const n0 = A.s.ledger.length;
  const r1 = probe(A, B, fake, want);
  assert.equal(r1.msg, 'This crate cannot be traded at that price.', 'the same words: no number, nothing that depends on the hidden worth');
  near(0 - A.s.cash, paid, 1e-9);
  assert.ok(A.s.ledger.slice(n0).some((e) => /^Appraisal:/.test(e.text) && e.amt < 0), 'a ledger row'); assert.equal(A.s.meta.appraisals, 1);
  // cash parked in an escrow (an offer of cash for the same cash, taken back afterwards) is no way round it
  ({ A, B } = swapPair()); fake = put(A, 'bike', 1, { truth: { q: 1, fake: true, defects: [] } }); want = put(B, 'bike', 1);
  const all = A.s.cash, park = A.createOffer({ to: 'BBB', giveCash: all, want: { assets: [], cash: all } }); assert.ok(park.ok, park.msg); assert.equal(A.s.cash, 0);
  let spent = 0;
  for (let i = 0; i < 4; i++) { const b = A.s.cash; probe(A, B, fake, want); spent += b - A.s.cash; }
  near(spent, 4 * paid, 1e-9);
  assert.ok(A.cancelOffer(park.offer.id).ok); assert.ok(A.s.cash > all - spent - 1e-6 && A.s.cash < all, 'the cash comes back, less four appraisals: ' + A.s.cash);
  // and a genuine crate still costs nothing to offer
  const good = put(A, 'bike', 1), before = A.s.cash;
  assert.ok(probe(A, B, good, want).ok); assert.equal(A.s.cash, before);
});

// =========================================================================================================================  the Deal Room
function dealWorld(seed = 41, perks = ['grad', 'native']) {
  const g = makeGame(perks, 'ops', seed);
  for (const z of [2, 3, 4, 6]) g._openZone(z);
  g.s.cash = 1e6; g.s.skills.growth = 2;
  return g;
}
const fixedLot = (g) => { for (const z of g.s.zones) for (const l of g.s.lots[z] || []) if (l.mode === 'fixed' && l.price > 5 && l.price < 5e5) return { kind: 'buy', zone: z, lotId: l.id }; return null; };
function sellable(g, skip = new Set()) {
  for (const z of g.s.zones) for (const cls of Object.keys(ASSETS).filter((c) => (ASSETS[c].dem?.[z] || 0) >= 4 && !ASSETS[c].perish)) {
    const a = g._mk(g.s, cls, { zone: z, basis: 1 });
    for (const lead of g.s.leads[z] || []) {
      if (lead.scam || skip.has(lead.id)) continue;
      g.s.assets.push(a); const r = g.quotePitch(a.id, lead.id, undefined, { blind: false });
      if (r.ok && r.fit >= 0.3 && !r.rejected && !r.scam) return { a, lead };
      g.s.assets.pop();
    }
  }
  return null;
}
const brokenCrate = (g) => { const a = g.s.assets.find((x) => ASSETS[x.cls].repair) || (() => { const c = Object.keys(ASSETS).find((k) => ASSETS[k].repair), n = g._mk(g.s, c, { zone: 1, basis: 1 }); g.s.assets.push(n); return n; })(); a.cond = 'broken'; return { kind: 'repair', assetId: a.id }; };
const ready = (run) => { assert.ok(run.ok, run.msg); return run; };

test('Deal Room (medium): a table whose lot, buyer or crate has left the world while it was open ends as a refusal, never a throw, never a charge, and the sheet can always be closed', () => {
  const ways = ['act', 'quick', 'quickAll', 'next', 'walkAway', 'finish'];
  const touch = (run, way) => (way === 'act' ? run.act({ type: 'probe', id: 'look' }) : way === 'quickAll' ? run.quickAll() : run[way]());
  const check = (g, run, way, label) => {
    const cash = g.s.cash, xp = g.s.xp, assets = g.s.assets.length;
    let r; assert.doesNotThrow(() => { r = touch(run, way); }, `${label}: ${way} threw`);
    if (way === 'act') { assert.equal(r.ok, false); assert.equal(r.gone, true); assert.ok(r.msg.length > 10, 'a message that says why'); }
    else if (way === 'walkAway' || way === 'finish') { assert.equal(r.ok, false, `${label}: ${way} is a refusal`); assert.equal(r.gone, true); assert.equal(r.title, 'Not done'); assert.ok(r.msg.length > 10 && r.headline === r.msg); assert.equal(run.over, true); assert.equal(run.finish(), r, 'finished once'); }
    else assert.equal(!!r, false, `${label}: ${way} goes no further`);
    assert.equal(g.s.cash, cash, `${label}: ${way} charged nothing`); assert.equal(g.s.xp, xp); assert.equal(g.s.assets.length, assets);
    const m = D.modelOf(run, {}); assert.doesNotThrow(() => UI.sheetHTML(m), 'the sheet draws');
    if (run.over) assert.match(UI.sheetHTML(m), /data-close/, 'and has a button that closes it');
  };
  for (const way of ways) {
    // BUY: the lot goes (expiry), then every way out of the table
    { const g = dealWorld(41), spec = fixedLot(g), run = ready(D.startRun(g, spec)); g.advanceTo(g.s.hour + 60);
      if (g.s.lots[spec.zone].some((l) => l.id === spec.lotId)) g.s.lots[spec.zone] = g.s.lots[spec.zone].filter((l) => l.id !== spec.lotId);
      check(g, run, way, 'buy/expired'); }
    // BUY: the lot is taken from under the player; and one at the Bid stage
    { const g = dealWorld(43), spec = fixedLot(g), run = ready(D.startRun(g, spec)); run.quick(); g.s.lots[spec.zone] = g.s.lots[spec.zone].filter((l) => l.id !== spec.lotId);
      check(g, run, way, 'buy/after read'); }
    // SELL: the buyer leaves, the crate is sold elsewhere
    { const g = dealWorld(41), p = sellable(g), run = ready(D.startRun(g, { kind: 'sell', assetId: p.a.id, leadId: p.lead.id })); g.s.leads[p.a.zone] = g.s.leads[p.a.zone].filter((l) => l.id !== p.lead.id);
      check(g, run, way, 'sell/buyer left'); }
    { const g = dealWorld(41), p = sellable(g), run = ready(D.startRun(g, { kind: 'sell', assetId: p.a.id, leadId: p.lead.id })); g.s.assets = g.s.assets.filter((a) => a.id !== p.a.id);
      check(g, run, way, 'sell/crate gone'); }
    // SELL: a table that opened on a blocker (the Pitch was never entered), and the buyer has since left
    { const g = dealWorld(41), p = sellable(g), run = ready(D.startRun(g, { kind: 'sell', assetId: p.a.id, leadId: p.lead.id }));
      run.plan.blocker = 'This buyer has almost no use for that.'; delete run.pp; g.s.leads[p.a.zone] = g.s.leads[p.a.zone].filter((l) => l.id !== p.lead.id);
      check(g, run, way, 'sell/blocked, buyer left'); }
    // REPAIR: the crate is gone
    { const g = dealWorld(41), spec = brokenCrate(g), run = ready(D.startRun(g, spec)); g.s.assets = g.s.assets.filter((a) => a.id !== spec.assetId);
      check(g, run, way, 'repair/crate gone'); }
  }
  // the screen: the click that used to throw lands on the result card, which says why
  const g = dealWorld(41), spec = fixedLot(g), ctx = fakeCtx(); ctx.g = () => g;
  const ses = UI.createSession(ctx, ready(D.startRun(g, spec))); ses.show();
  g.s.lots[spec.zone] = g.s.lots[spec.zone].filter((l) => l.id !== spec.lotId);
  assert.doesNotThrow(() => ses.acts['quick-all']());
  const last = ctx.calls.filter((c) => c[0] === 'dlg').at(-1)[1];
  assert.match(last, /That lot is gone/); assert.match(last, /data-close/);
});

test('Deal Room (low): a sale walked away from does not name the buyer\'s bias or the best pair while the buyer is still there', () => {
  const g = dealWorld(41), pair = sellable(g), spec = { kind: 'sell', assetId: pair.a.id, leadId: pair.lead.id };
  const probe = ready(D.startRun(g, spec)), params = probe.paramsFor('pitch');
  const angles = pitch.create(params).angles, picks = [];
  for (let i = 0; i < angles.length; i++) for (let j = i + 1; j < angles.length; j++) picks.push([angles[i], angles[j]]);
  let weak = 0;
  for (const pick of picks) {
    const run = ready(D.startRun(g, spec));
    assert.ok(run.act({ type: 'pick', angles: pick }).ok);
    const view = pitch.view(pitch.act(pitch.create(params), { type: 'pick', angles: pick }).state), rev = view.reveal;
    const sm = run.walkAway();
    assert.ok(g.s.leads[pair.a.zone].some((l) => l.id === pair.lead.id), 'the buyer is still here');
    assert.equal(sm.lesson.concept, 'persona-fit');
    assert.ok(!sm.lesson.text.includes(`${rev.best.angles[0]} with ${rev.best.angles[1]}`) && !/strongest pair/.test(sm.lesson.text), 'the best pair is not named: ' + sm.lesson.text);
    assert.ok(!sm.lesson.text.includes(rev.bias) || rev.bias.length < 4, 'nor the bias: ' + sm.lesson.text);
    if (/Match your pitch/.test(sm.lesson.text)) weak++;
  }
  assert.ok(weak > 0, 'some of the ten pairs were poor ones, which is when the card used to give the answer away');
});

test('Deal Room (low): the walk-away card keeps the Close\'s answers back for a table the player never sat at, and walking away from the table itself burns it (the next sitting is Quick\'s)', () => {
  const spec0 = (g) => fixedLot(g);
  // leaving at the Read: nothing was played at the Close, so Quick's and the expert's prices (a function of the seller's hidden floor) are not printed
  let g = dealWorld(49), run = ready(D.startRun(g, spec0(g)));
  run.quick();                                                              // a Read
  let sm = run.walkAway();
  assert.equal(sm.numbers.quick, null); assert.equal(sm.numbers.expert, null); assert.equal(sm.numbers.hidden, true);
  assert.equal(g.s.tried?.[run.dkey], undefined, 'and the Close is still there to be played by hand');
  const again = ready(D.startRun(g, spec0(g))); again.quick(); again.next(); assert.equal(again.res.close, undefined, 'it is a fresh table');
  // leaving the Close itself, without a move, is a move at the table: it is marked, and its prices may be told
  g = dealWorld(49); run = ready(D.startRun(g, spec0(g))); run.quick(); run.next(); assert.equal(run.key, 'close');
  sm = run.walkAway();
  assert.equal(g.s.tried[run.dkey], 1, 'a table walked away from has been sat at');
  assert.equal(sm.numbers.hidden, undefined, 'a table walked away from is no secret any more');
  const next = ready(D.startRun(g, spec0(g))); next.quick(); next.next();
  assert.ok(next.res.close && next.res.close.quick === true, 'the next sitting is played at Quick');
  // a deal that was struck shows its comparison as always
  g = dealWorld(49); run = ready(D.startRun(g, spec0(g))); run.quickAll(); sm = run.finish();
  assert.equal(sm.numbers.hidden, undefined); assert.ok(sm.numbers.you != null);
});

test('Deal Room (low): the repair dial cannot be scouted by reopening: the first stop (or Quick, or Careful) marks the deal, and a later sitting is played at Quick', () => {
  const g = dealWorld(51), spec = brokenCrate(g);
  const first = ready(D.startRun(g, spec));
  assert.equal(g.s.tried?.[first.dkey], undefined, 'looking is free');
  assert.ok(first.act({ type: 'stop', t: 1234 }).ok);
  assert.equal(g.s.tried[first.dkey], 1, 'the first stop is the point of no return');
  first.walkAway();                                                         // leave: nothing repaired, nothing charged
  const second = ready(D.startRun(g, spec));
  assert.ok(second.res.fix && second.res.fix.quick === true, 'reopened, the dial is already played at average skill');
  assert.equal(second.act({ type: 'stop', t: 1234 }).ok, false, 'and there is nothing left to play');
  const w = dealWorld(51), ref = ready(D.startRun(w, brokenCrate(w))); ref.quick();
  assert.equal(second.res.fix.precision, ref.res.fix.precision, 'exactly what Quick gets');
  // a bench left without a move (the cash does not reach it) is not burned
  const poor = dealWorld(51), ps = brokenCrate(poor); poor.s.cash = 1;
  const blocked = ready(D.startRun(poor, ps)); assert.ok(blocked.plan.blocker); blocked.walkAway(); assert.equal(poor.s.tried?.[blocked.dkey], undefined);
});

test('Stock drawer (low): the bench quotes the stock\'s repair from one function: the estimate it shows is the bench\'s, with the most the bill can run to and the reason the bench would not open', () => {
  const g = dealWorld(53), spec = brokenCrate(g);
  const q = D.benchQuote(g, spec.assetId), plan = D.planFor(g, spec);
  assert.ok(q.ok); assert.equal(q.cost, plan.quote.cost); assert.equal(q.most, plan.quote.most); assert.equal(q.blocker, plan.blocker);
  near(q.most, q.cost * D.REPAIR_MOST, 0.01);
  assert.equal(q.affordable, true);
  g.s.cash = q.cost * 1.1;                                                   // enough for the quote, not for what the bill can run to
  const q2 = D.benchQuote(g, spec.assetId); assert.equal(q2.affordable, false); assert.match(q2.blocker, /can run to/);
  assert.equal(D.planFor(g, spec).blocker, q2.blocker, 'the bench says the same thing');
  assert.equal(D.benchQuote(g, 'nope').ok, false);
});

test('Counterfeit (low): a fake caught on a later visit to a lot still reaches the quests, once, with no more experience', () => {
  const g = mk(['trades', 'pro'], 3, 'CF'), [id] = lotsIn(g, 1, 1);
  g.s.lots[1].find((l) => l.id === id).truth = { q: 1, fake: true, defects: [] };
  const events = []; g.onEvent = (e) => { if (e.type === 'inspect') events.push(e); };
  const read = (fakeProb, spent) => g.recordInspect(1, id, { estimate: { quality: 1, fakeProb }, confidence: 0.6, score: 0.6, key: id, spent });
  read(0.3, 1);                                                              // visit one: a look, nothing found
  assert.equal(events.length, 1); assert.equal(events[0].caught, false);
  const xp = g.s.xp;
  const r = read(0.99, 2);                                                   // visit two: the serial number
  assert.equal(r.caught, true);
  assert.equal(events.length, 2, 'the catch is reported'); assert.equal(events[1].caught, true); assert.equal(events[1].fake, true);
  assert.equal(g.s.xp, xp, 'with no more experience'); assert.equal(g.s.meta.inspect.n, 1, 'and not as another inspection');
  assert.ok(!('score' in events[1]), 'it is not another inspection to grade, so it counts toward no score goal');
  read(0.99, 2); assert.equal(events.length, 2, 'reported once for the lot');
  // caught on the first visit: a later one does not report it again
  const g2 = mk(['trades', 'pro'], 3, 'CG'), [id2] = lotsIn(g2, 1, 1); g2.s.lots[1].find((l) => l.id === id2).truth = { q: 1, fake: true, defects: [] };
  const ev2 = []; g2.onEvent = (e) => { if (e.type === 'inspect') ev2.push(e); };
  g2.recordInspect(1, id2, { estimate: { quality: 1, fakeProb: 0.95 }, confidence: 0.8, score: 0.9, key: id2, spent: 3 });
  g2.recordInspect(1, id2, { estimate: { quality: 1, fakeProb: 0.97 }, confidence: 0.8, score: 0.9, key: id2, spent: 3 });
  assert.equal(ev2.length, 1);
});

test('Assist (low): the advice is always a move the table allows: at the floor it says to take their number (or walk to the alternative), never a step that is not there', () => {
  // six thousand talks, every style and both roles, played by a player who picks a legal move at random: at every turn the advice has to be one of the moves the table offers
  let checked = 0, floor = 0; const bad = [];
  let st = 12345; const R = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  for (let seed = 1; seed <= 6000; seed++) {
    const role = seed % 2 ? 'sell' : 'buy', style = haggle.STYLES[seed % 4], fair = 50 + (seed % 13) * 17, rf = role === 'sell' ? 0.72 + (seed % 9) * 0.07 : 1.4 - (seed % 9) * 0.07;
    let s = haggle.create({ role, fair, style, seed, patience: 3 + (seed % 5), reserve: fair * rf, alt: seed % 3 === 0 ? fair * (role === 'sell' ? 1.05 : 0.95) : null, assist: true, insight: seed % 6 });
    for (let step = 0; step < 12 && !s.done; step++) {
      const v = haggle.view(s), legalNow = haggle.legal(s);
      if (v.advice) {
        checked++;
        const a = v.advice.action;
        if (!legalNow.some((l) => l.type === a.type && l.level === a.level && l.size === a.size)) bad.push(`seed ${seed} step ${step}: ${JSON.stringify(a)} with the ask at ${s.ask}`);
        if (!legalNow.some((l) => l.type === 'concede')) { floor++; assert.ok(!/step/.test(v.advice.text) || /no step left/.test(v.advice.text), 'at the floor the advice does not talk of a step: ' + v.advice.text); }
      }
      s = haggle.act(s, legalNow[Math.floor(R() * legalNow.length)]).state;
    }
  }
  assert.ok(checked > 10000 && floor > 100, `a real sweep: ${checked} pieces of advice, ${floor} of them with the ask at the floor`);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} pieces of advice were moves the table does not allow`);
});

// =========================================================================================================================  the relay
const haveRelay = existsSync(new URL('../server/node_modules/ws', import.meta.url));
const keyOf = (s) => ('key-' + s).replace(/[^A-Za-z0-9_-]/g, '_').padEnd(16, '0');
async function localRelay(env = {}, clock = null) {
  const { createRelay } = await import('../server/relay.mjs');
  const logs = [], r = createRelay({ env, now: clock ? () => clock.t : Date.now, log: (...a) => logs.push(a.join(' ')) });
  const port = await r.listen(0);
  return { ...r, port, url: `ws://localhost:${port}`, logs, stop: () => r.close() };
}
function sock(relay, room, pid, role = 'student', extra = '') {
  const ws = new WebSocket(`${relay.url}/?room=${room}&pid=${pid}&key=${keyOf(pid)}&role=${role}${extra}`);
  const c = { ws, got: [], closed: null, ready: new Promise((res) => { ws.onopen = res; }), send: (m) => ws.send(JSON.stringify(m)) };
  ws.onmessage = (e) => c.got.push(JSON.parse(e.data)); ws.onclose = (e) => { c.closed = e.code; };
  return c;
}

test('Relay limits (low): the limits a relay ships with are held: a 20 KB snapshot is not forwarded, a burst of 400 messages is cut at 60, and the 201st room is refused', { skip: !haveRelay && 'run npm install in server/' }, async () => {
  const clock = { t: 1e12 }, relay = await localRelay({}, clock);          // no overrides: the shipped defaults
  try {
    assert.deepEqual([relay.limits.MAX_ROOMS, relay.limits.MAX_SNAP, relay.limits.BURST, relay.limits.RATE, relay.limits.MAX_ROOM], [200, 16 * 1024, 60, 20, 400], 'the shipped defaults');
    // snapshots
    const a = sock(relay, 'LIM1', 'PC-A'), b = sock(relay, 'LIM1', 'PC-B'); await Promise.all([a.ready, b.ready]);
    a.send({ t: 'snap', snap: { pid: 'PC-A', nw: 5, pad: 'x'.repeat(20 * 1024) } });
    a.send({ t: 'snap', snap: { pid: 'PC-A', nw: 7 } });
    await until(() => b.got.some((m) => m.t === 'snap' && m.snap.nw === 7));
    assert.ok(!b.got.some((m) => m.t === 'snap' && m.snap.pad), 'the 20 KB snapshot was not forwarded');
    // message rate: with the clock still, a burst is the bucket and no more (a fresh sender: the bucket starts full)
    const heard = () => b.got.filter((m) => m.t === 'hello' && typeof m.n === 'number').length;
    const burster = sock(relay, 'LIM1', 'PC-BURST'); await burster.ready; b.got.length = 0;
    for (let i = 0; i < 100; i++) burster.send({ t: 'hello', n: i });
    await until(() => heard() >= 60); await sleep(300);
    assert.equal(heard(), 60, 'of 100 messages in a burst, 60 get through');
    clock.t += 1000;                                                        // a second later the bucket has refilled by the rate (20 a second)
    b.got.length = 0; for (let i = 0; i < 100; i++) burster.send({ t: 'hello', n: i });
    await until(() => heard() >= 20); await sleep(300);
    assert.equal(heard(), 20, 'and 20 a second after that');
    const flood = sock(relay, 'LIM1', 'PC-FLOOD'); await flood.ready; b.got.length = 0;
    for (let i = 0; i < 400; i++) flood.send({ t: 'hello', n: i });
    await until(() => flood.closed != null); await sleep(100);
    assert.equal(heard(), 60, 'of 400 messages in a burst, 60 get through, and the sender is cut off');
    // the instructor's seat has five times the bucket
    const t = sock(relay, 'LIM1', 'PC-T', 'instructor'); await t.ready; b.got.length = 0;
    clock.t += 60000;                                                       // (a minute of refill: the instructor's bucket is five times the size)
    for (let i = 0; i < 400; i++) t.send({ t: 'hello', n: i });
    await until(() => b.got.filter((m) => m.t === 'hello' && typeof m.n === 'number').length >= 300); await sleep(300);
    assert.equal(b.got.filter((m) => m.t === 'hello' && typeof m.n === 'number').length, 300);
    // rooms: 200 rooms each with someone in it, and the 201st class is turned away
    const socks = [];
    for (let i = 0; i < 199; i++) socks.push(sock(relay, 'R' + i.toString(36).toUpperCase().padStart(3, '0'), 'PC-' + i));   // (LIM1 is the first of the 200)
    await Promise.all(socks.map((c) => c.ready));
    assert.equal(relay.rooms.size, 200);
    const late = sock(relay, 'LATE', 'PC-LATE'); await until(() => late.closed != null);
    assert.equal(late.closed, 1013, 'the 201st room is refused');
    for (const c of [a, b, t, burster, flood, ...socks]) c.ws.close();
  } finally { await relay.stop(); }
});

test('Relay owner (low): an instructor who has lost the browser\'s storage, or changed device, takes the seat back with the room\'s owner token; nobody else can', { skip: !haveRelay && 'run npm install in server/' }, async () => {
  const relay = await localRelay();
  try {
    const tok = 'a1b2c3d4e5f60718293a4b5c6d7e8f90', other = '0f9e8d7c6b5a49382716f5e4d3c2b1a0';
    const own = (p, t, role = 'instructor') => sock(relay, 'OWN1', p, role, t ? '&owner=' + t : '');
    const first = own('PC-ONE', tok), stud = own('PC-STU', null, 'student'); await Promise.all([first.ready, stud.ready]);
    first.send({ t: 'clock', hour: 100, speed: 1, paused: false }); await until(() => stud.got.some((m) => m.t === 'clock' && m.hour === 100));
    // a classmate who asks for the seat with no token, or a wrong one, gets nothing (the seat is the first holder's)
    const thief = own('PC-EVIL', null), wrong = own('PC-EVI2', other); await Promise.all([thief.ready, wrong.ready]);
    thief.send({ t: 'clock', hour: 5, speed: 64, paused: false }); wrong.send({ t: 'rewind', toHour: 0 }); await sleep(250);
    assert.ok(!stud.got.some((m) => m.hour === 5 || m.t === 'rewind'), 'no seat without the token');
    // the instructor, on a new device (a new Founder ID and key), with the token
    const again = own('PC-TWO', tok); await again.ready;
    again.send({ t: 'clock', hour: 200, speed: 1, paused: true }); await until(() => stud.got.some((m) => m.t === 'clock' && m.hour === 200 && m.from === 'PC-TWO' && m.role === 'instructor'));
    // and the old holder is a student again
    first.send({ t: 'clock', hour: 9, speed: 64, paused: false }); await sleep(250);
    assert.ok(!stud.got.some((m) => m.t === 'clock' && m.hour === 9), 'the seat moved with the token');
    // a room that was never bound to a token: without a token it is claimed as before (first come, then nobody else)...
    const p1 = sock(relay, 'OWN2', 'PC-P1', 'instructor'); await p1.ready; // ("first come" is the first to connect: the three used to connect at once, and on a busy machine PC-P4 could be the first, take the seat and fail the assertion below; the runner did that once)
    const p2 = sock(relay, 'OWN2', 'PC-P2', 'student'), p4 = sock(relay, 'OWN2', 'PC-P4', 'instructor'); await Promise.all([p2.ready, p4.ready]);
    p4.send({ t: 'clock', hour: 55, speed: 1, paused: true }); await sleep(250);
    assert.ok(!p2.got.some((m) => m.t === 'clock' && m.hour === 55), 'a second connection with no token does not take the seat from the first');
    // ...and the first token shown binds it and takes the seat, from a holder that never showed one (tests/cloud-audit.test.mjs S1: a stray tab must not leave the room without an owner for good)
    const p3 = sock(relay, 'OWN2', 'PC-P3', 'instructor', '&owner=' + tok); await p3.ready; p3.send({ t: 'clock', hour: 77, speed: 1, paused: true });
    await until(() => p2.got.some((m) => m.t === 'clock' && m.hour === 77 && m.from === 'PC-P3' && m.role === 'instructor'));
    p1.send({ t: 'clock', hour: 78, speed: 1, paused: true }); await sleep(250);
    assert.ok(!p2.got.some((m) => m.t === 'clock' && m.hour === 78), 'the holder that showed no token is a student once the owner arrives');
    for (const c of [first, stud, thief, wrong, again, p1, p2, p3, p4]) c.ws.close();
  } finally { await relay.stop(); }
});

test('Instructor recovery (low): the room\'s owner token is made once, kept beside the room, shown as a code to copy, and accepted pasted in any spacing; a student is never given one', { skip: !haveRelay && 'run npm install in server/' }, async () => {
  const relay = await localRelay(), sessions = [];
  try {
    store.clear();
    const T = new Session(); T.pid = 'PC-TEA1'; T.mode = 'instructor'; sessions.push(T);
    T.joinRoom({ code: 'RECO', relay: relay.url, role: 'instructor', handle: 'Prof' });
    const code = T.recoveryCode();
    assert.match(code, /^([0-9a-f]{4}-){7}[0-9a-f]{4}$/, 'eight groups of four: ' + code);
    assert.ok(T.room.transport.url.includes('owner=' + code.replace(/-/g, '')), 'the relay is given the token');
    T.leaveRoom(); T.mode = 'instructor'; T.joinRoom({ code: 'RECO', relay: relay.url, role: 'instructor', handle: 'Prof' });
    assert.equal(T.recoveryCode(), code, 'the same room, the same token');
    const student = new Session(); student.pid = 'PC-STU1'; student.mode = 'student'; sessions.push(student);
    student.joinRoom({ code: 'RECO', relay: relay.url, role: 'student', handle: 'S' });
    assert.ok(!student.room.transport.url.includes('owner='), 'a student is not given one'); assert.equal(student.recoveryCode(), null);
    await until(() => T.room.state === 'open' && student.room.state === 'open');
    // storage lost, another device: a new identity, and the code pasted as it was typed
    store.clear(); T.leaveRoom();
    const U = new Session(); U.pid = 'PC-TEA2'; U.mode = 'instructor'; sessions.push(U);
    U.joinRoom({ code: 'RECO', relay: relay.url, role: 'instructor', handle: 'Prof', owner: code.toUpperCase().replace(/-/g, ' ') });
    assert.equal(U.recoveryCode(), code, 'accepted as typed, kept as it is');
    await until(() => U.room.state === 'open');
    student.instructorSeen = Date.now() - 61000;                         // (a student follows a new instructor ID once the old one has been quiet for a minute)
    U.clock.set({ hour: 321, paused: true });
    await until(() => { U._sendClock(); return student.instructorPid === 'PC-TEA2'; });
    assert.equal(student.clock.now(), 321, 'the class hears its instructor from the new device and takes its clock');
    assert.equal(Sess.cleanOwner('nope'), null); assert.equal(Sess.cleanOwner('A1B2-C3D4 E5F6 0718-293a-4b5c-6d7e-8f90'), 'a1b2c3d4e5f6071829' + '3a4b5c6d7e8f90');
  } finally { for (const x of sessions) { try { x.leaveRoom(); } catch { /* closed */ } } await relay.stop(); }
});
