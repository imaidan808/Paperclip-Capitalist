// Regression tests for the issues the verification round left open on the integrated branch (v2/remaining, 977ef85): the repair owner's round.
// Each test names the finding it holds (the ids are those of the open-items list: item-3, item-9, B3, new-bench-burn...) and fails on 977ef85.
// Sections: the swap's hold and a delivery lost for a long time, the grade for adaptability, a waived fine, the repair bench, the Academy's words and the spelling of the game's strings.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };

const { Game } = await import('../js/engine.js');
const Sess = await import('../js/session.js');
const { Session, LOCK_MS, RECALL_WAIT_MS } = Sess;
const C = await import('../js/cohort.js');
const D = await import('../js/deal.js');
const H = await import('../js/play/haggle.js');
const { makeGame, run } = await import('./bot.mjs');
const { fakeCtx } = await import('./helpers/ctx.mjs');
const { ACADEMY } = await import('../js/meta/academy.js');
const Sandbox = await import('../js/ui/academy-sandbox.js');
const { creativityBand } = await import('../js/market.js');
const bankDrawer = (await import('../js/ui/drawers/bank.js')).default;
const marketDrawer = (await import('../js/ui/drawers/market.js')).default;

const realNow = Date.now; let offset = 0;
Date.now = () => realNow() + offset;                                       // a clock the test can wind (the session reads Date.now(), and so does its tick)
afterEach(() => { offset = 0; });

const J = (o) => JSON.parse(JSON.stringify(o));
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const put = (g, cls, zone, o = {}) => { const a = g._mk(g.s, cls, { zone, basis: o.basis ?? 1, cond: o.cond, quality: o.quality }); g.s.assets.push(a); return a; };

// =========================================================================================================================  the swap's hold, and a delivery lost for a long time
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
/** B commits to a swap with A, and every delivery is lost for `outage` seconds. Each second both sides tick, the lines carry everything else, and A presses Withdraw as soon as it may. */
function lostDelivery(outage, { room = true } = {}) {
  const hub = hubOf('LOST' + outage), A = sessionIn(hub, 'PC-AAAA'), B = sessionIn(hub, 'PC-BBBB');
  A.game.s.cash = 500; const x = put(B.game, 'bike', 1);
  for (const S of [A, B]) S._sendSnap(true); hub.drain();
  const want = A.roster().find((q) => q.pid === B.pid).inventory.find((i) => i.id === x.id);
  const res = A.propose({ to: B.pid, giveIds: [], giveCash: Math.round(want.fmv), want: { assets: [want], cash: 0 } }); assert.ok(res.ok, res.msg); hub.drain();
  const before = totals(A, B), id = res.offer.id;
  hub.drop = (m) => m.t === 'deliver' && offset < outage * 1000;
  assert.ok(B.acceptIncoming(id).ok); hub.drain();
  assert.equal(A.game.s.escrow.length, 1, 'A has not heard'); assert.ok(B.delivering.has(id), 'B has committed');
  let withdrewAt = null;
  for (let t = 1; t <= 2200; t++) {
    offset = t * 1000; A.tick(Date.now()); B.tick(Date.now()); hub.drain();
    if (withdrewAt == null && A.game.s.escrow.length) { const w = A.withdraw(id); hub.drain(); if (w.ok) withdrewAt = t; }
    if (A.game.s.escrow.length === 0 && B.delivering.size === 0) break;
  }
  return { A, B, before, id, withdrewAt, after: totals(A, B), bikeOf: (S) => S.game.s.assets.filter((a) => a.cls === 'bike').length };
}

test('Swap lost delivery (item-3): an acceptor that has committed is taken however long the delivery is lost, up to about half an hour: the proposer asks before it takes its escrow back, so nothing is made twice or destroyed', () => {
  for (const outage of [60, 100, 130, 150, 160, 200, 400, 900, 1500]) {
    const r = lostDelivery(outage);
    assert.equal(r.withdrewAt, null, `outage ${outage}s: A never got to withdraw a crate B had already paid for`);
    assert.equal(r.A.game.s.escrow.length, 0, `outage ${outage}s: A took the delivery once the line was back`);
    assert.equal(r.B.delivering.size, 0, `outage ${outage}s: and B heard it`);
    assert.deepEqual(r.after.cls, r.before.cls, `outage ${outage}s: every crate there was is still there once`);
    near(r.after.cash, r.before.cash, 1e-6);
    assert.equal(r.bikeOf(r.A), 1, `outage ${outage}s: A holds B's bike`); assert.equal(r.bikeOf(r.B), 0, `outage ${outage}s: and B no longer does`);
  }
});

test('Swap hold (item-3): the end of the hold is a question: an acceptor that never committed lets it go at once, one that does not answer lets it go after a minute, one that keeps saying it is holding cannot keep it for ever', () => {
  // never committed: B was sent a confirmation it never received (its accept was lost), so it is free
  const hub = hubOf('FREE'), A = sessionIn(hub, 'PC-AAAA'), B = sessionIn(hub, 'PC-BBBB');
  A.game.s.cash = 500;
  for (const S of [A, B]) S._sendSnap(true); hub.drain();
  const res = A.propose({ to: B.pid, giveIds: [], giveCash: 40, want: { assets: [], cash: 40 } }); hub.drain(); const id = res.offer.id;
  A._onMsg({ t: 'accept', from: B.pid, role: 'student', to: A.pid, offerId: id });   // B asked; A holds the escrow for it and sends a confirmation
  const e = A.game.s.escrow[0]; assert.equal(e.lockedBy, B.pid);
  hub.drop = (m) => m.t === 'confirm';                                                // ...which never arrives
  hub.drain();
  offset = LOCK_MS + 1000; A.tick(Date.now()); hub.drain();
  assert.equal(e.lockedBy, undefined, 'B said it was free, so the hold is let go'); assert.equal(e.recalling, undefined);
  assert.ok(A.withdraw(id).ok, 'and the owner has it back'); assert.equal(A.game.s.escrow.length, 0);
  // a confirmation that comes late finds nothing to commit to
  assert.equal(B.delivering.size, 0); B._onMsg({ t: 'confirm', from: A.pid, role: 'student', to: B.pid, offerId: id }); assert.equal(B.delivering.size, 0);
  // no answer at all: held for a minute, then lapsed
  const o2 = A.propose({ to: B.pid, giveIds: [], giveCash: 10, want: { assets: [], cash: 10 } }); hub.drop = () => true; hub.drain();
  A._onMsg({ t: 'accept', from: B.pid, role: 'student', to: A.pid, offerId: o2.offer.id });
  const e2 = A.game.s.escrow[0]; offset += LOCK_MS + 1000; A.tick(Date.now());
  assert.ok(e2.recalling && !e2.lockLapsed, 'asked, and held while it waits'); assert.equal(A.withdraw(o2.offer.id).ok, false);
  offset += RECALL_WAIT_MS + 1000; A.tick(Date.now());
  assert.equal(e2.lockLapsed, true, 'no answer in a minute'); assert.ok(A.withdraw(o2.offer.id).ok);
  // an acceptor that answers `holding` to every question holds the escrow six times and no more
  const o3 = A.propose({ to: B.pid, giveIds: [], giveCash: 10, want: { assets: [], cash: 10 } }); hub.drop = () => true; hub.drain();
  A._onMsg({ t: 'accept', from: B.pid, role: 'student', to: A.pid, offerId: o3.offer.id });
  const e3 = A.game.s.escrow[0];
  offset += LOCK_MS + 1000;
  for (let i = 0; i < 6; i++) {
    A.tick(Date.now()); assert.ok(e3.recalling, 'asked ' + (i + 1));
    A._onMsg({ t: 'holding', from: B.pid, role: 'student', to: A.pid, offerId: o3.offer.id }); assert.equal(e3.recalling, undefined); assert.equal(e3.lockLapsed, undefined, 'and the hold starts again'); near(e3.lockedAt + LOCK_MS - Date.now(), 5 * 60000, 5);
    offset += 5 * 60000 + 1000;
  }
  A.tick(Date.now());
  assert.equal(e3.lockLapsed, true, 'the seventh time it lapses without asking'); assert.ok(A.withdraw(o3.offer.id).ok);
  // a stranger cannot answer for B
  const o4 = A.propose({ to: B.pid, giveIds: [], giveCash: 10, want: { assets: [], cash: 10 } }); hub.drain();
  A._onMsg({ t: 'accept', from: B.pid, role: 'student', to: A.pid, offerId: o4.offer.id });
  const e4 = A.game.s.escrow[0]; offset += LOCK_MS + 1000; A.tick(Date.now());
  A._onMsg({ t: 'free', from: 'PC-MALLORY', role: 'student', to: A.pid, offerId: o4.offer.id }); assert.equal(e4.lockedBy, B.pid, 'only the classmate the hold is for can let it go');
});

test('Swap hold (item-3): a swap an acceptor has committed to survives a reload of its page, so the proposer\'s question is still answered `holding`', () => {
  const hub = hubOf('RELOAD'), A = sessionIn(hub, 'PC-AAAA'), B = sessionIn(hub, 'PC-BBBB');
  A.game.s.cash = 500; const x = put(B.game, 'bike', 1);
  for (const S of [A, B]) S._sendSnap(true); hub.drain();
  const want = A.roster().find((q) => q.pid === B.pid).inventory.find((i) => i.id === x.id);
  const res = A.propose({ to: B.pid, giveIds: [], giveCash: Math.round(want.fmv), want: { assets: [want], cash: 0 } }); hub.drain();
  hub.drop = (m) => m.t === 'deliver'; B.acceptIncoming(res.offer.id); hub.drain(); assert.ok(B.delivering.has(res.offer.id));
  B.save(true);
  const B2 = new Session(); B2.pid = 'PC-BBBB'; B2.handle = 'PC-BBBB'; assert.ok(B2.restore(), 'the page is opened again');
  B2.room?.close(); hub.members.delete('PC-BBBB'); hub.join(B2);                    // (the page's own connection is closed: the room is the test's)
  assert.ok(B2.delivering.has(res.offer.id), 'and still owes the delivery'); assert.equal(B2.delivering.get(res.offer.id).to, 'PC-AAAA');
  hub.drop = null; offset = LOCK_MS + 1000; A.tick(Date.now()); hub.drain(); B2.tick(Date.now()); hub.drain();
  assert.equal(A.game.s.escrow.length, 0, 'A took the delivery the reloaded page sent'); assert.equal(B2.delivering.size, 0);
});

// =========================================================================================================================  the grade for adaptability
function instructorRoom(code = 'ROOM', hour = 24 * 60) {
  store.clear();
  const s = new Session(); s.pid = 'TEACH'; s.mode = 'instructor'; s.worldSeed = code; s.clock.set({ hour, paused: true }); s.roomInfo = { code, relay: '', role: 'instructor' };
  const add = (pid, nw, shockLog, extra = {}) => s.peers.set(pid, { pid, handle: pid, role: 'student', clean: true, seen: Date.now(), snap: C.cleanSnap({ handle: pid, nw, hour, flags: {}, shockLog, ...extra }, pid) });
  return { s, add };
}
test('Adaptability (item-9): a made-up row for a shock that really happened is not believed: a result far beyond the class\'s own is not graded, and a shock fewer than three founders logged is not graded at all', () => {
  const { s, add } = instructorRoom();
  const fed = (r, pivots = 0, o = {}) => ({ id: 'fed@1056', nw: 1000, nwAfter: 1000 * r, pivots, ...o });
  add('H1', 5000, [fed(1.0, 2)]); add('H2', 4000, [fed(0.8)]); add('H3', 3000, [fed(0.7)]); add('H4', 2000, [fed(0.5)]);
  add('CHEAT', 50, [{ id: 'fed@1056', nw: 0.01, nwAfter: 0.2, pivots: 9 }]);                     // a real shock, a net worth of a cent and twenty times that five days later
  add('CHEAT5', 50, [{ id: 'fed@1056', nw: 0.01, nwAfter: 0.0251, pivots: 9 }]);               // the same, less greedy: two and a half times a cent is still ten times what the class's median got
  const before = Object.fromEntries(s.gradebook().map((r) => [r.pid, r]));
  assert.equal(before.CHEAT.adapt, null, 'the made-up row scores nothing: the neutral 50 in the automated points, not a 100'); assert.equal(before.CHEAT5.adapt, null);
  assert.ok(before.CHEAT.auto < before.H1.auto, 'and buys no points over the founder who really held the line');
  assert.ok(before.H1.adapt > before.H2.adapt && before.H2.adapt > before.H3.adapt && before.H3.adapt > before.H4.adapt, 'the honest class keeps its order');
  // a lie inside the class's range is still the founder's word (that is the server tally's to catch), but it cannot beat the best honest result by more than the range allows
  const { s: s2, add: add2 } = instructorRoom();
  add2('H1', 5000, [fed(1.0, 2)]); add2('H2', 4000, [fed(0.8)]); add2('H3', 3000, [fed(0.7)]); add2('H4', 2000, [fed(0.5)]);
  add2('LIAR', 50, [fed(1.0, 9)]);
  const lie = s2.gradebook().find((r) => r.pid === 'LIAR');
  assert.ok(lie.adapt <= 100 && lie.adapt <= s2.gradebook().find((r) => r.pid === 'H1').adapt + 1e-9, 'a believable lie scores no more than the best honest founder');
  // a shock only one or two founders logged has no class to be judged against
  const { s: s3, add: add3 } = instructorRoom();
  add3('A', 5000, [fed(1.0)]); add3('B', 4000, [fed(0.5)]); add3('C', 3000, [{ id: 'tariff@1776', nw: 100, nwAfter: 5000, pivots: 9 }]); add3('D', 2000, []);
  const by3 = Object.fromEntries(s3.gradebook().map((r) => [r.pid, r]));
  assert.equal(by3.A.adapt, null, 'two founders are not a class for a shock'); assert.equal(by3.B.adapt, null);
  // a small class is judged by all of it (a room of two is not left ungraded for ever)
  const { s: s4, add: add4 } = instructorRoom();
  add4('A', 5000, [fed(1.0)]); add4('B', 4000, [fed(0.5)]);
  const by4 = Object.fromEntries(s4.gradebook().map((r) => [r.pid, r]));
  assert.ok(by4.A.adapt > by4.B.adapt, 'a room of two compares the two');
});

// =========================================================================================================================  a waived fine
test('Ledger (B3): a failed or ignored audit whose fine the Heir\'s lawyer waives is recorded as 0 and never -0, and no ledger row is ever -0', () => {
  for (const ignored of [true, false]) {
    const g = new Game({ perks: ['heir', 'grad'], seed: 5 }); g.env.algo = false;
    g.s.mil.m2 = true; g.s.auditNext = 0;
    if (ignored) g.advanceTo(g.s.hour + 24 * 8); else g._auditFail(false);
    const row = g.s.ledger.find((e) => e.type === 'audit' && /audit/i.test(e.text) && /Ignored|Failed/.test(e.text));
    assert.ok(row, 'the audit was recorded (' + (ignored ? 'ignored' : 'failed') + ')');
    assert.ok(Object.is(row.amt, 0), 'recorded as 0, never -0: ' + Object.is(row.amt, -0));
  }
  // the writer itself: whatever a caller negates, a zero is a zero
  const g = new Game({ perks: [], seed: 1 }); g.led('test', 'a negated zero', -0); g.led('test', 'a negated zero', -(0 * 5));
  assert.ok(g.s.ledger.filter((r) => r.type === 'test').every((r) => Object.is(r.amt, 0)));
  assert.equal(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(g.s.ledger.at(-1).amt), '$0.00');
});

// =========================================================================================================================  the repair bench
function benchWorld(seed = 5) { const g = makeGame([], 'growth', seed); g._openZone(7); g.s.cash = 1e6; g.s.skills.ops = 3; const a = g._mk(g.s, 'sedan', { cond: 'broken', zone: 7 }); g.s.assets.push(a); return { g, a }; }
test('Repair bench (new-bench-burn): opening the bench and leaving it without a move does not burn the crate\'s hand-played repair; a stop (or Careful, or Quick) still does', () => {
  // open and leave: nothing was played, nothing is marked, the next sitting is the player's
  { const { g, a } = benchWorld(); const r1 = D.startRun(g, { kind: 'repair', assetId: a.id }); assert.ok(r1.st.fix, 'the dial is there to play');
    r1.walkAway(); assert.equal(g.s.tried?.[r1.dkey], undefined, 'no move, no mark'); assert.equal(a.cond, 'broken', 'and nothing was repaired or charged'); assert.equal(g.s.cash, 1e6);
    const r2 = D.startRun(g, { kind: 'repair', assetId: a.id });
    assert.ok(r2.st.fix && !r2.res.fix, 'the next sitting still has the dial to play by hand'); assert.ok(r2.act({ type: 'stop', t: 1500 }).ok);
    assert.equal(g.s.tried[r2.dkey], 1, 'the first stop is the point of no return'); }
  // one hand stop, then Leave: marked, as before
  { const { g, a } = benchWorld(); const r1 = D.startRun(g, { kind: 'repair', assetId: a.id }); assert.ok(r1.act({ type: 'stop', t: 1500 }).ok); r1.walkAway();
    const r2 = D.startRun(g, { kind: 'repair', assetId: a.id }); assert.ok(r2.res.fix && r2.res.fix.quick === true, 'played at Quick the next time'); assert.ok(!r2.st.fix); }
  // Careful and Quick mark too
  for (const how of ['careful', 'quick']) { const { g, a } = benchWorld(); const r1 = D.startRun(g, { kind: 'repair', assetId: a.id });
    if (how === 'careful') assert.ok(r1.act({ type: 'careful' }).ok, 'Careful is a move'); else r1.quick();
    r1.walkAway(); assert.equal(g.s.tried[r1.dkey], 1, how + ' marks the bench'); }
});

// =========================================================================================================================  the instructor's way back into a room
test('Instructor recovery (item-13): a room taken back with its recovery code does not push a made-up clock at the class: it waits for the class\'s hour, from the student standing in or from the snapshots', () => {
  store.clear();
  const sent = [];
  const mkInstr = (opts) => {
    const s = new Session(); s.pid = 'TEACH'; s.mode = 'instructor';
    s.joinRoom({ code: 'ROOMX', relay: '', role: 'instructor', handle: 'Instructor', ...opts });
    s.room.close(); s.room = { kind: 'local', send: (m) => sent.push(m), close() {}, on() {} };         // (the page's own connection is closed: the room is the test's)
    return s;
  };
  // the code this browser made, and the one it shows
  const first = mkInstr({}); const code = first.recoveryCode();
  assert.match(code, /^[0-9a-f]{4}(-[0-9a-f]{4}){7}$/, 'eight groups of four'); assert.equal(first.recoveryCodeFor('ROOMX'), code); assert.equal(first.recoveryCodeFor('NOPE'), null, 'a room this browser never opened');
  assert.equal(first.recoveryCodeFor('__proto__'), null); assert.equal(first.recoveryCodeFor('constructor'), null);
  assert.equal(first.recovering, false, 'an ordinary room keeps its own clock');
  first._sendClock(); assert.ok(sent.some((m) => m.t === 'clock'), 'and sends it');
  // another device: no storage, the code pasted (any spacing, any case)
  store.clear(); sent.length = 0;
  const back = mkInstr({ owner: code.toUpperCase().replace(/-/g, ' '), recover: true });
  assert.equal(back.recovering, true); assert.equal(back.recoveryCode(), code, 'the same code is kept for the room');
  back._sendClock(); back.tick(Date.now() + 5000); back._clockSoon();
  assert.equal(sent.some((m) => m.t === 'clock'), false, 'it says nothing about the clock until it has heard the class\'s');
  back._onMsg(J({ t: 'clock', from: 'PC-STUD', role: 'student', hour: 24 * 40 + 3, speed: 16, paused: false, age: 0 }));
  assert.equal(back.recovering, false); near(back.clock.now(), 24 * 40 + 3, 1); assert.equal(back.clock.speed, 16); assert.equal(back.clock.paused, false);
  back._sendClock(); const c = sent.find((m) => m.t === 'clock'); assert.ok(c && c.hour >= 24 * 40, 'and then it keeps the class\'s clock: ' + (c && c.hour));
  // only a student's clock is believed while recovering, and only once
  store.clear(); sent.length = 0;
  const b2 = mkInstr({ owner: code, recover: true });
  b2._onMsg(J({ t: 'clock', from: 'PC-X', role: 'instructor', hour: 99, speed: 1, paused: false, age: 0 })); assert.equal(b2.recovering, true, 'a claim to be the instructor is not the class\'s clock');
  // nobody stood in: after a few seconds the hour the snapshots show, paused
  for (const [pid, hour] of [['S1', 24 * 30], ['S2', 24 * 31], ['S3', 24 * 29]]) b2.peers.set(pid, { pid, handle: pid, role: 'student', clean: true, seen: Date.now(), snap: C.cleanSnap({ handle: pid, nw: 1000, hour, flags: {} }, pid) });
  b2.tick(Date.now() + 5000); assert.equal(b2.recovering, true, 'it waits a while first');
  b2.tick(Date.now() + 20000); assert.equal(b2.recovering, false); near(b2.clock.now(), 24 * 30, 1); assert.equal(b2.clock.paused, true, 'paused, for the instructor to start when ready');
  // a code that is not an owner token changes nothing (the session makes its own)
  store.clear(); const b3 = mkInstr({ owner: 'not a code', recover: true }); assert.match(b3.recoveryCode(), /^[0-9a-f]{4}(-[0-9a-f]{4}){7}$/);
});
test('Instructor recovery (item-13): the title screen offers it: the code beside "Reopen room", a place to paste one, and a new room shows its code once', () => {
  const src = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  for (const needle of ['recoveryCodeFor(instr.code)', "data-act=\"instr-recover\"", "'instr-recover'()", 'cleanOwner($(\'#ik\').value)', 'recover: !!owner && !saved', 'keepRecoveryCode(code)', 'Keep your recovery code']) assert.ok(src.includes(needle), 'main.js has: ' + needle);
  const kit = readFileSync(new URL('../docs/FACULTY_KIT.md', import.meta.url), 'utf8');
  assert.match(kit, /recovery code/i); assert.match(kit, /SEAT_GRACE_MS/);
});

// =========================================================================================================================  the Academy's words, the sandbox and the cards
const M = (id) => ACADEMY.find((m) => m.id === id);
const allText = (m) => JSON.stringify([m.intro, m.steps, m.finish, m.why]);

test('Academy finish (S5): a lesson whose last step is only "open this" and whose win is a separate act says what that act is, on the card and in the goal card\'s first sentence', () => {
  const needs = ACADEMY.filter((m) => { const w = m.steps.at(-1).wait; return w.type !== 'event'; }).map((m) => m.id);
  assert.deepEqual(needs, ['m06', 'm07', 'm09'], 'the three lessons whose last step is a tap or an open');
  for (const m of ACADEMY) {
    const c = Sandbox.coachFor(m, { i: m.steps.length, n: m.steps.length, won: false });
    assert.equal(c.finishing, true);
    if (!needs.includes(m.id)) { assert.equal(m.finish, undefined, m.id + ' needs none'); continue; }
    assert.ok(m.finish && m.finish.say && m.finish.hint, m.id + ' names its last act');
    assert.equal(c.say, m.finish.say); assert.equal(c.hint, m.finish.hint);
    const first = Sandbox.shortSay(c.say);
    assert.ok(!/^Almost there\.?$/.test(first), m.id + ': the goal card\'s line is the instruction, not "Almost there": ' + first);
    assert.ok(m.finish.say.length <= 200 && m.finish.hint.length >= 20 && m.finish.hint.length <= 200);
  }
  assert.match(M('m07').finish.say, /Repay/); assert.match(M('m09').finish.say, /Sell to the pool/); assert.match(M('m06').finish.say, /cycle/);
  // a mission with no finish keeps the generic line
  const c = Sandbox.coachFor({ steps: [{ id: 'a', say: 'x', hint: 'y', anchor: 'tracker', wait: { type: 'event', event: 'pitch' } }] }, { i: 1, n: 1, won: false });
  assert.match(c.say, /^Almost there\./);
});

test('Academy clock (S4): only the Play / Pause button counts as pressing the clock; the speed picker, Help and Menu share its anchor and do not', () => {
  const src = readFileSync(new URL('../js/ui/academy.js', import.meta.url), 'utf8');
  assert.ok(/want !== 'hud-clock' \|\| e\.target\.closest\?\.\('\[data-act="pause"\]'\)/.test(src), 'the click wait for the clock asks for the pause button');
  const hud = readFileSync(new URL('../js/ui/hud.js', import.meta.url), 'utf8');
  assert.ok(hud.includes('data-act="pause"') && hud.includes('data-anchor="hud-clock"'), 'and the HUD still has both');
  for (const id of ['m06', 'm07', 'm09']) assert.ok(M(id).steps.some((x) => x.wait.type === 'click' && x.wait.anchor === 'hud-clock'), id + ' presses the clock');
});

test('Academy sandbox (S6): practice pays no experience, level or skill point; the lesson\'s reward card pays once, into the real run', () => {
  const m = M('m01'), sb = Sandbox.makeSandboxSession({ ...m.setup }, { id: m.id, zone: m.zone }), g = sb.game;
  const xp0 = g.s.xp, pts0 = g.s.points, lvl0 = g.level();
  g.xp(5000); g.recordPlay('haggle', { score: 1, quick: true, key: 'k1', role: 'sell', deal: true });
  assert.equal(g.s.xp, xp0, 'no experience in a lesson'); assert.equal(g.level(), lvl0); assert.equal(g.s.points, pts0);
  assert.ok(!g.s.news.some((n) => /Level \d/.test(n.text)), 'and no "Level 2" in the ticker');
  const real = new Game({ perks: [], seed: 3 }); real.xp(500); assert.ok(real.s.xp > 0, 'the real run still earns it');
  const c = Sandbox.cloneSandbox(g); c.xp(900); assert.equal(c.s.xp, xp0, 'a clone is the same lesson');
});

test('Academy words (S7 S8 S9 S11): the closing step says what closes the deal, no card points at a control that is not there, and the Deal Room\'s other figures are accounted for', () => {
  const close = M('m10').steps.find((x) => x.id === 'close');
  assert.match(close.say, /open high, hold, then split the difference or accept once the offer reaches fair/, 'the dealer closes on a split or an offer at fair, not on small concessions (which end in "No deal" against four rounds)');
  assert.ok(!/concede small/.test(close.say) && !/Backgrounds/.test(close.say), 'and the Backgrounds are drafted before the Academy, not after it');
  assert.match(close.say, /finishes the Academy/);
  assert.ok(!/trade-in/.test(allText(M('m04'))), 'no "trade-in" control exists'); assert.match(M('m04').steps[2].hint, /Sell the records you were paid in to Tariq, with Assist on/);
  assert.ok(!/tagged trend/.test(M('m09').steps[0].say), 'Stock shows no tag'); assert.match(M('m09').steps[0].say, /same viral trend/);
  assert.match(M('m02').steps[2].hint, /Press Restart/, 'and the lesson that can lose its fake watch to a Quick buy says how to start again');
  assert.ok(!/first swap unlocked/i.test(M('m02').steps[0].say), 'the Codex does not claim a swap just unlocked its pages');
  assert.match(M('m10').why.body[2], /result cards print others for it: its real condition and the auction's own "true value"/);
  assert.match(M('m07').why.example.setup, /1\.00 to 1\.18 times the asking price/);
  // the figures the cards print are the engine's: the auction's true value is the guide price over 0.8 at the real condition, the sale card's "fair price" is a perfect one's
  const g = Sandbox.makeSandboxSession({ ...M('m10').setup }, { id: 'm10', zone: 6 }).game;
  assert.equal(Math.round(D.auctionParams(g, 6, g.s.lots[6][0]).trueValue), 534);
});

test('Bank drawer (S10): the margin call sells the biggest manager, or, with none, the most valuable stock', () => {
  const html = bankDrawer.html(fakeCtx({ days: 25 }));
  assert.match(html, /sells your biggest manager \(or, with none, your most valuable stock\) at 35% off/);
  // ...which is what the engine does
  const g = new Game({ perks: [], seed: 4 }); g.env.algo = false;
  const crate = put(g, 'antiqueFurniture', 1); g.s.cash = 10; g.s.loans.push({ principal: 5000, accr: 0, rate: 0.05, at: 0, kind: 'micro', id: 'L1' });
  const before = g.s.assets.length; g._marginCall();
  assert.ok(g.s.assets.length < before || g.s.cash > 10, 'with no manager the stock is sold');
});

test('Market (S13, S16): the Market opens on the Lots tab when the district has lots and no buyers, and an ordinary factor is "Open", not "Crowded"', () => {
  const ctx = fakeCtx({ days: 0, perks: ['trades', 'pro'] }), g = ctx.g(), z = ctx.U.zone;
  g.s.leads[z] = []; g.s.lots[z] = [{ id: 'LT1', zone: z, cls: 'pen', cond: 'ok', price: 5, exp: g.s.hour + 500, mode: 'fixed', truth: { q: 1, fake: false, defects: [] } }];
  const html = marketDrawer.html(ctx);
  assert.match(html, /data-panel="lots"/, 'the lots'); assert.ok(!/No buyers right now/.test(html));
  ctx.U.marketTab = 'buyers'; assert.match(marketDrawer.html(ctx), /data-panel="buyers"/, 'a tab the player chose stays chosen');
  assert.equal(creativityBand(0.4).id, 'herd'); assert.equal(creativityBand(0.8).id, 'crowded'); assert.equal(creativityBand(0.96).label, 'Open'); assert.equal(creativityBand(1.09).id, 'open');
  assert.equal(creativityBand(1.5).id, 'balanced'); assert.equal(creativityBand(3).id, 'pioneer');
  const solo = new Game({ perks: [], seed: 3 }); solo.env.algo = false; const ci = solo.cmFor(1, 'paperclip', 'student', 'x');
  assert.ok(ci.vT === 0 && Math.abs(ci.cm - 1.0931) < 0.001 && ci.band.id === 'open', 'a niche nobody has pitched is the ordinary 1.09, which is open: ' + JSON.stringify(ci.band));
});

test('Result card (S15): a sale that paid for the repair says so: what you had in the crate and the profit, and does not call it "no gain" when it was one', () => {
  const m = M('m05'), g = Sandbox.makeSandboxSession({ ...m.setup }, { id: 'm05', zone: 7 }).game, van = g.s.assets.find((a) => a.cls === 'van');
  const fix = D.startRun(g, { kind: 'repair', assetId: van.id }); fix.quick(); fix.finish();
  const sale = D.startRun(g, { kind: 'sell', assetId: van.id, leadId: 'fleet-buyer' }); sale.quickAll(); const sm = sale.finish();
  assert.equal(sm.ok, true);
  const had = sm.lines.find((l) => /^You had \$/.test(l)); assert.ok(had, 'the card tells what the crate had cost: ' + JSON.stringify(sm.lines));
  assert.match(had, /a profit of \$[\d,]+/); assert.ok(!/no gain/i.test(sm.title) || /loss/.test(had), 'a profitable sale is not "no gain": ' + sm.title);
  assert.ok(sm.lines.some((l) => /against the crate's value|times the crate's value/.test(l)), 'the comparison with the market stays');
  // a loss is a loss
  const g2 = Sandbox.makeSandboxSession({ ...m.setup }, { id: 'm05', zone: 7 }).game, v2 = g2.s.assets.find((a) => a.cls === 'van'); v2.basis = 5000;
  const s2 = D.startRun(g2, { kind: 'sell', assetId: v2.id, leadId: 'fleet-buyer' }); s2.quickAll(); const sm2 = s2.finish();
  assert.match(sm2.lines.find((l) => /^You had/.test(l)), /a loss of \$/);
});

// =========================================================================================================================  managers against the strongest hand pair
const doc = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
test('Managers and hand play (item-4, B1, B2, M1): even the strongest hand pair (Tradesperson with Seasoned Pro) ends no richer than its own managers would make it at a decision every 2 or 4 hours, and hand play is not worthless either; the docs say so', () => {
  // Measured on f747048 (before ECON.brokenTop), specialty Operations, seeds 7, 11, 23, 31: without managers 8.1x, 10.5x, 3.6x and 10.4x as rich at every 2 hours, 7.6x, 3.5x, 2.1x and 12.1x at every 4,
  // 0.77x to 0.80x and 2.1x at every 8. With the premium on the wrecks of districts 13 to 16: 0.51x, 0.70x, 1.00x and 0.80x at every 2 hours, 0.80x, 0.83x, 0.57x and 0.87x at every 4, 0.84x, 1.29x, 0.56x and 0.60x at every 8.
  const ratio = (every, seed) => {
    const a = makeGame(['trades', 'pro'], 'ops', seed); run(a, { every });
    const b = makeGame(['trades', 'pro'], 'ops', seed); b.hirePipeline = () => ({ ok: false, msg: 'managers are forbidden in this run' }); run(b, { every });
    return b.netWorth() / a.netWorth();
  };
  for (const [every, seed] of [[2, 7], [2, 23], [4, 7], [4, 23], [8, 7]]) {
    const r = ratio(every, seed);
    assert.ok(r >= 0.3 && r <= 1.5, `seed ${seed}, every ${every} hours: ${r.toFixed(2)}x as rich without managers (the bound is 0.3 to 1.5: it was 2.1x to 12.1x before the premium on the wrecks of the top districts, and hand play must not vanish)`);
  }
  const B = doc('docs/BALANCE.md'), V = doc('docs/V2_DESIGN.md');
  assert.match(B, /The strongest hand pair/); assert.match(B, /8\.1x, 10\.5x, 3\.6x and 10\.4x/); assert.match(B, /0\.51x, 0\.70x, 1\.00x and 0\.80x/); assert.match(B, /at every 2, 4 and 8 hours/);
  assert.match(V, /at the median of the 66 pairs, earn at least as much/); assert.match(V, /at every 2, 4 and 8 hours/); assert.match(V, /bounds of this section are for a decision every 2 to 4 hours/);
});

test('Close panel (S14): once a deal is struck both sides\' figures read the agreed price, not the counter that was on the table before the buyer said yes', () => {
  let seen = 0;
  for (let seed = 1; seed <= 60 && seen < 3; seed++) {
    for (const role of ['sell', 'buy']) {
      let st = H.create({ role, fair: 100, reserve: role === 'sell' ? 135 : 65, style: 'friendly', patience: 6, insight: 3, seed });
      const a0 = H.view(st).anchors.fair; // the number you would say at fair
      for (let k = 0; k < 30 && !st.done; k++) { const v = H.view(st), act = k === 0 ? { type: 'anchor', level: 'fair' } : v.actions.find((x) => x.type === 'accept') || v.actions[0]; const r = H.act(st, act); if (r.say === null) break; st = r.state; }
      if (!st.done || st.end !== 'deal') continue;
      const v = H.view(st), res = H.result(st);
      assert.equal(v.yours, v.theirs, 'one number'); assert.ok(Math.abs(v.yours - res.price) < 0.01, `the agreed price ${res.price} is the one shown (${v.yours} / ${v.theirs}); the fair anchor was ${a0}`);
      seen++;
    }
  }
  assert.ok(seen >= 1, 'a struck deal was seen');
  const live = H.create({ role: 'sell', fair: 100, reserve: 130, style: 'friendly', patience: 6, insight: 3, seed: 5 });
  assert.equal(H.view(live).theirs, null, 'and nothing changes while the talk is on');
});

// =========================================================================================================================  the coach card in the Deal Room
// Rects measured in headless Chrome at 1440 x 900 on lesson m04 (Haggle 101): [x, y, w, h, label] for every button, field and link of the open Deal Room, at its Pitch stage (step 2), at its
// Close stage (step 3, Dolores) and after the first counter. On 977ef85 the card was put at the middle of the foot of the window whatever the dialog held (the keep-clear list was the drawer and the
// dock), so it stood on "Pick 2 more angles" and the stage's Quick button, and, with the hint on, over "Fair" and over "Come down $0.53" and "Mention your other option" that the hint names.
const DEAL_VIEW = { w: 1440, h: 900 }, DEAL_DOCK = { x: 616, y: 821, w: 207, h: 69 };
const DEAL_ROOM = {
  pitch: { dialog: [192, 95, 1056, 709], controls: [[1079, 119, 18, 18, 'Assist'], [1167, 113, 62, 30, 'Leave'], [481, 459, 141, 150, 'Prestige'], [629, 459, 141, 150, 'Utility'], [777, 459, 141, 150, 'Scarcity'], [925, 459, 141, 150, 'Price'], [1072, 459, 141, 150, 'Story'], [481, 619, 194, 38, 'Pick 2 more angles'], [769, 755, 330, 38, 'Quick: auto-play'], [1107, 755, 122, 38, 'Quick deal']] },
  close: { dialog: [192, 138, 1056, 623], controls: [[1079, 162, 18, 18, 'Assist'], [1167, 156, 62, 30, 'Leave'], [481, 514, 239, 60, 'Aim high'], [728, 514, 239, 60, 'Fair'], [974, 514, 239, 60, 'Quick sale'], [481, 584, 94, 30, 'Walk away'], [899, 712, 330, 38, 'Quick: auto-play']] },
  counter: { dialog: [192, 125, 1056, 651], controls: [[1079, 148, 18, 18, 'Assist'], [1167, 142, 62, 30, 'Leave'], [224, 528, 216, 18, 'Talk so far'], [481, 500, 178, 60, 'Hold'], [666, 500, 178, 60, 'Come down $0.53'], [851, 500, 178, 60, 'Come down $1.20'], [1035, 500, 178, 60, 'Come down $2.14'], [481, 568, 178, 60, 'Split the difference'], [666, 568, 178, 60, 'Mention your other option'], [851, 568, 178, 60, 'Accept their offer'], [1035, 568, 178, 60, 'Walk away'], [899, 725, 330, 38, 'Quick: auto-play']] },
};
const asRect = ([x, y, w, h]) => ({ x, y, w, h });
const overlapOf = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const coveredBy = (card, controls) => controls.map((c) => ({ label: c[4], share: overlapOf(card, asRect(c)) / (c[2] * c[3]), centre: card.x <= c[0] + c[2] / 2 && c[0] + c[2] / 2 <= card.x + card.w && card.y <= c[1] + c[3] / 2 && c[1] + c[3] / 2 <= card.y + card.h })).filter((c) => c.share > 0);

test('Coach card (A1): in an open Deal Room the card stands clear of every button of it, with the hint or without, so the buttons a hint names can be pressed', () => {
  for (const [stage, L] of Object.entries(DEAL_ROOM)) {
    const keep = Sandbox.keepClear({ dock: DEAL_DOCK, controls: L.controls.map(asRect) });
    assert.equal(keep.length, L.controls.length + 1, `${stage}: the dock and every control are kept clear`);
    for (const size of [{ w: 336, h: 203 }, { w: 336, h: 301 }, { w: 336, h: 320 }]) { // without the hint, with it, and with a longer one
      const at = Sandbox.placeCard(asRect(L.dialog), size, DEAL_VIEW, 14, 8, keep), card = { ...at, ...size };
      assert.deepEqual(coveredBy(card, L.controls), [], `${stage}, a card ${size.h} high at ${at.x},${at.y}: it stands on a button`);
      assert.ok(at.x >= 8 && at.y >= 8 && at.x + size.w <= DEAL_VIEW.w - 8 && at.y + size.h <= DEAL_VIEW.h - 8, `${stage}: inside the window`);
      assert.equal(overlapOf(card, DEAL_DOCK), 0, `${stage}: and off the dock`);
    }
  }
  // the card as 977ef85 placed it (the middle of the foot of the window: 336 x 203 at 552,607, and with the hint on a card that grows upward from the same foot) stood on exactly what the lessons name
  const old = (h) => ({ x: 552, y: 810 - h, w: 336, h }), shares = (stage, h) => Object.fromEntries(coveredBy(old(h), DEAL_ROOM[stage].controls).map((c) => [c.label, Math.round(c.share * 100)]));
  assert.ok(shares('pitch', 203)['Pick 2 more angles'] >= 60 && shares('pitch', 203)['Quick: auto-play'] >= 30, JSON.stringify(shares('pitch', 203)));
  assert.ok(shares('counter', 301)['Mention your other option'] >= 90 && shares('counter', 301)['Come down $0.53'] >= 80, JSON.stringify(shares('counter', 301)));
});

test('Coach card (A1): the keep-clear list is the drawer, the dock and the dialog\'s controls, empty rects and missing ones left out; where nothing is clear the card covers the least', () => {
  const keep = Sandbox.keepClear({ drawer: { x: 610, y: 70, w: 480, h: 606 }, dock: null, controls: [{ x: 1, y: 2, w: 3, h: 4 }, null, { x: 5, y: 5, w: 0, h: 9 }, undefined, { x: 9, y: 9, w: 20, h: 10 }] });
  assert.deepEqual(keep.map((r) => r.wt), [3, 1, 1], 'the drawer weighs more than a button, and a rect with no area or none is dropped');
  assert.deepEqual(Sandbox.keepClear(), []); assert.deepEqual(Sandbox.keepClear({ controls: 'nothing' }), []);
  // a phone with a dialog that is all buttons: no place is clear, so the card goes where it hides the least, and never outside the window
  const view = { w: 390, h: 844 }, card = { w: 344, h: 200 };
  const rows = Array.from({ length: 10 }, (_, i) => ({ x: 20, y: 90 + i * 70, w: 350, h: 56 })), many = Sandbox.keepClear({ controls: rows });
  const at = Sandbox.placeCard(asRect([0, 0, 390, 844]), card, view, 14, 8, many), where = { x: at.x, y: at.y, w: card.w, h: card.h };
  const covered = (p) => Sandbox.coverScore(p, null, many), floor0 = { x: (view.w - card.w) / 2, y: view.h - card.h - 90, w: card.w, h: card.h }; // where 977ef85 would have put it
  assert.ok(at.x >= 8 && at.y >= 8 && at.x + card.w <= 382 && at.y + card.h <= 836, 'inside the window: ' + JSON.stringify(at));
  assert.ok(covered(where) <= covered(floor0), `it hides no more than the middle of the foot would (${covered(where)} against ${covered(floor0)} square pixels)`);
});
