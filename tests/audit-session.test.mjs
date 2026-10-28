// Regression tests for the session-layer audit: peer messages are untrusted, the practice partner cannot lose, a student's clock is the class's, an offer is accepted in two steps,
// rewind survives a reload, and the relay and the dev server survive whatever they are sent. Each test names the finding it holds (#n) and fails on the code before the fix.
// Rooms here are real: Sessions over BroadcastChannel (same process) and over the real relay; messages that need to be hostile are put through Session._onMsg or a raw WebSocket.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };

const { Session, Clock, kv, CLOCK_WAIT_MS, LOCK_MS } = await import('../js/session.js');
const C = await import('../js/cohort.js');
const { Game } = await import('../js/engine.js');
const { TOTAL_HOURS, SEC_PER_HOUR, ZONE_IDS } = await import('../js/config.js');
const { makeGame, run } = await import('./bot.mjs');
const { instructorParts, gradebookCSV } = await import('../js/ui/instructor.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(20); } throw new Error('timed out: ' + fn); };
const J = (o) => JSON.parse(JSON.stringify(o)); // what a message looks like after the wire

const live = [];
afterEach(() => { for (const s of live.splice(0)) { try { s.leaveRoom(); } catch { /* closed */ } } });
/** A student with a run and no room: messages are put straight through _onMsg. */
function mk(pid = 'V', perks = ['pro']) {
  store.clear();
  const s = new Session(); s.pid = pid; s.mode = 'student';
  s.startGame({ perks, specialty: 'ops', handle: pid });
  live.push(s);
  return s;
}
/** Replace the transport with a recorder so a test can read what a session says. */
function stubRoom(s) {
  const out = [];
  s.room = { send: (m) => out.push({ from: s.pid, ...m }), close() {}, kind: 'local', state: 'open' };
  s.roomInfo = { code: 'STUB', relay: '', role: s.mode === 'instructor' ? 'instructor' : 'student' };
  return out;
}
const snapMsg = (from, snap = {}, extra = {}) => J({ t: 'snap', from, role: 'student', handle: from, snap: { pid: from, handle: from, nw: 10, ...snap }, ...extra });
const fromTeacher = (m) => ({ from: 'TEACH', role: 'instructor', ...m });

/** The Cohort-level fix and the door every snapshot passes: honest data goes through untouched. */
test('#1 a classmate\'s niche counts cannot be negative, text or endless: nobody else\'s market moves', () => {
  const honest = mk().game.crowd('paperclip', 1);
  const hostile = [
    { '1|paperclip|x': -1e9 }, { '1|paperclip|x': 'abc' }, { '1|paperclip|student': -50 }, { '1|paperclip|student': '5' }, { '1|paperclip|student': null },
    { '1|paperclip|student': [3] }, { 'z|nope|x': 5 }, { '1|paperclip': 5 }, { '99|paperclip|student': 5 }, { '1|paperclip|trainer': 5 }, // a buyer of another district
  ];
  for (const niches of hostile) {
    const s = mk();
    s._onMsg(snapMsg('EVIL', { niches }));
    s._flushCohort?.();
    const c = s.game.crowd('paperclip', 1);
    assert.equal(c, honest, JSON.stringify(niches) + ' changed the market: ' + c);
    assert.ok(Number.isFinite(s.game.netWorth()) && Number.isFinite(s.game.eei()), JSON.stringify(niches));
    assert.ok(Number.isFinite(s.game.cmFor(1, 'paperclip', 'student').cm), JSON.stringify(niches));
  }
  // 1e999 is Infinity once JSON has read it; a huge but valid claim is believed only up to what an honest player could have done
  const s = mk();
  s._onMsg(JSON.parse('{"t":"snap","from":"EVIL","role":"student","snap":{"pid":"EVIL","niches":{"1|paperclip|student":1e999,"1|pen|student":1e6}}}'));
  s._flushCohort?.();
  const c = s.game.crowd('pen', 1), base = mk().game.crowd('pen', 1);
  assert.ok(c <= base && c >= base - 0.4 * C.NICHE_MAX / 220 - 1e-9, `${c} vs ${base}`);
  assert.equal(s.game.crowd('paperclip', 1), honest, 'Infinity is not a count');
  // the Cohort itself ignores what is not a count (a caller that skips the door)
  const k = new C.Cohort({ seed: 'k', ghosts: 0 });
  k.setPeers([{ pid: 'P', niches: { '1|pen|student': -5, '1|pen|x': 'a', '2|pen|y': Infinity, '1|pen|z': NaN, '__proto__': 4 } }]);
  assert.deepEqual(k.counts(10, 1, 'pen'), { total: 0, byBuyer: {} });
});

test('#1 the door keeps what an honest founder publishes, and caps how much a liar can say', () => {
  const g = makeGame(['trades', 'pro'], 'ops', 7); run(g, { days: 40 });
  const snap = g.publicSnapshot(), clean = C.cleanSnap(J(snap), 'HON');
  assert.deepEqual(clean.niches, g.niches48(), 'every honest niche survives');
  for (const k of ['nw', 'cash', 'debt', 'level', 'hour', 'zones', 'pipelines', 'p2p', 'trades', 'hoursPlayed', 'cmAvg']) assert.equal(clean[k], snap[k], k);
  assert.deepEqual(clean.perks, snap.perks); assert.deepEqual(clean.skills, snap.skills); assert.deepEqual(clean.flags, snap.flags);
  assert.equal(clean.inventory.length, snap.inventory.length); assert.deepEqual(clean.shockLog, snap.shockLog.map((x) => ({ ...x, de: x.de ?? null, nwAfter: x.nwAfter ?? null })));
  assert.equal(clean.pid, 'HON', 'identity is the sender\'s, whatever the payload says');
  // a flood of valid keys
  const keys = {};
  for (const r of new C.Cohort({ seed: 'k', ghosts: 36 }).allNiches(48)) keys[r.key] = 9999;
  assert.ok(Object.keys(keys).length > C.NICHE_CAP);
  const capped = C.cleanNiches(keys);
  assert.ok(Object.keys(capped).length <= C.NICHE_CAP);
  assert.ok(Object.values(capped).every((n) => n >= 1 && n <= C.NICHE_MAX && Number.isInteger(n)));
  assert.ok(Object.values(capped).reduce((a, b) => a + b, 0) <= C.NICHE_TOTAL);
  for (const bad of [null, 5, 'x', [], undefined]) assert.deepEqual(C.cleanNiches(bad), {});
  assert.equal(C.cleanSnap(null, 'A'), null); assert.equal(C.cleanSnap({}, '<script>'), null);
});

test('#2 #21 a royalty message pays a stream the receiver really holds, from the one who owes it, at most a day\'s rate and never more than was agreed', () => {
  const s = mk('V'), g = s.game;
  for (const amount of [1e9, -5e9, undefined, '7', NaN, Infinity, null, {}]) s._onMsg({ t: 'royalty', from: 'ACC', role: 'student', to: 'V', amount, offer: 'nonexistent' });
  assert.equal(g.s.cash, 0, 'no stream, no money');
  g.s.royalties.push({ dir: 'recv', peer: 'PAYER', perDay: 10, until: g.s.hour + 5 * 24, offer: 'O1', cap: 25 });
  g.s.royalties.push({ dir: 'pay', peer: 'PAYER', perDay: 10, until: g.s.hour + 5 * 24, offer: 'O2' }); // a stream we owe is not one we are owed
  const pay = (from, amount, offer = 'O1') => s._onMsg({ t: 'royalty', from, role: 'student', to: 'V', amount, offer });
  pay('ACC', 10);                       // somebody else's money
  pay('PAYER', 10, 'O2');               // our own debt
  pay('PAYER', -10); pay('PAYER', '10'); pay('PAYER', NaN); pay('PAYER', 0); pay('PAYER');
  assert.equal(g.s.cash, 0);
  pay('PAYER', 1e9);                    // clamps to the day rate
  assert.equal(g.s.cash, 10);
  pay('PAYER', 10); pay('PAYER', 10); pay('PAYER', 10);
  assert.equal(g.s.cash, 25, 'the agreed total is the most that can ever arrive');
  s._onMsg({ t: 'royalty', from: 'PAYER', role: 'student', to: 'SOMEONE', amount: 5, offer: 'O1' });
  assert.equal(g.s.cash, 25, 'only the addressee');
  assert.ok(Number.isFinite(g.netWorth()));
});

/** The practice partner. */
const partnerSession = () => { store.clear(); const s = new Session(); s.pid = 'SOLO'; s.startGame({ perks: ['trades', 'pro'], specialty: 'ops', handle: 'S' }); live.push(s); return s; };
const respond = (s, args) => { const r = s.propose(args); if (r.ok) s._npcRespond(r.offer); return r; };
const give = (s, cls, o = {}) => { const a = s.game._mk(s.game.s, cls, { zone: 1, basis: 1, ...o }); s.game.s.assets.push(a); return a; };

test('#3 #5 the practice partner never pays cash for cash, never pays more than it gets, and never pays against a promise', () => {
  const s = partnerSession(), g = s.game;
  g.s.cash = 100;
  respond(s, { to: 'NPC-PARTNER', giveIds: [], giveCash: 100, want: { assets: [], cash: 129 } });
  assert.equal(g.s.cash, 100, 'cash for cash is no swap (and certainly not +29%)');
  assert.equal(g.s.escrow.length, 0, 'the escrow came back');
  // selling it a crate: fair is fine, 29% over is not
  const pen = give(s, 'pen'), fmv = g.val(pen);
  respond(s, { to: 'NPC-PARTNER', giveIds: [pen.id], want: { assets: [], cash: fmv * 1.29 } });
  assert.ok(g.s.assets.some((a) => a.id === pen.id) && g.s.cash === 100, 'it will not overpay');
  respond(s, { to: 'NPC-PARTNER', giveIds: [pen.id], want: { assets: [], cash: fmv * 0.97 } });
  assert.ok(!g.s.assets.some((a) => a.id === pen.id), 'a fair price is paid');
  assert.ok(g.s.cash > 100 && g.s.cash <= 100 + fmv * 1.01);
  // an unbounded ask against a promise to pay: refused (or blocked by the engine before it gets that far)
  const cash0 = g.s.cash;
  respond(s, { to: 'NPC-PARTNER', giveIds: [], giveCash: 0, royalty: { perDay: 1e6, days: 1e6 }, want: { assets: [], cash: 1e12 } });
  assert.equal(g.s.cash, cash0);
  assert.ok(g.netWorth() < 1e6, 'no money was made from a promise: ' + g.netWorth());
  // the partner pays out only what its shelves are worth in a day
  const day = []; for (let i = 0; i < 12; i++) day.push(give(s, 'pen'));
  const before = g.s.cash;
  for (const a of day) respond(s, { to: 'NPC-PARTNER', giveIds: [a.id], want: { assets: [], cash: g.val(a) * 0.99 } });
  const purse = g.sideValue({ assets: s.npcView().inventory });
  assert.ok(g.s.cash - before <= purse + 1e-6, `paid ${g.s.cash - before} of a purse of ${purse}`);
});

test('#3 #35 a fair swap with the partner closes, passes the partner flag on to the engine, and stays inside a district\'s storage', async () => {
  const s = partnerSession(), g = s.game;
  const npc = s.roster().find((r) => r.npc), item = [...npc.inventory].sort((x, y) => y.fmv - x.fmv)[0];
  g.s.cash = 1000;
  const calls = []; const real = g.finalizeOffer.bind(g);
  g.finalizeOffer = (...a) => { calls.push(a); return real(...a); };
  const r = respond(s, { to: npc.pid, giveIds: [], giveCash: Math.round(item.fmv * 100) / 100, want: { assets: [item], cash: 0 } });
  assert.ok(r.ok, r.msg);
  assert.ok(g.s.assets.some((a) => a.cls === item.cls), 'the fair deal closed');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][3], { npc: true }, 'the engine is told the counterparty is the practice partner (no experience, no swap count)');
  // room: a district full by the time the partner answers takes no more crates
  const r2 = s.propose({ to: npc.pid, giveIds: [], giveCash: Math.round(item.fmv * 100) / 100, want: { assets: [item], cash: 0 } });
  assert.ok(r2.ok, r2.msg);
  while (g.roomIn(1) > 0) give(s, 'paperclip');
  const held = g.s.assets.filter((a) => a.zone === 1).length, cash = g.s.cash;
  s._npcRespond(r2.offer);
  assert.equal(g.s.assets.filter((a) => a.zone === 1).length, held, 'nothing was added to a full district');
  assert.equal(g.s.escrow.length, 0);
  assert.ok(g.s.cash > cash, 'the cash came back');
});

test('#3 #35 swaps with the practice partner pay no experience and are not counted as peer trades (also guaranteed by the engine through shared contract c)', () => {
  const s = partnerSession(), g = s.game;
  let closed = 0;
  for (let i = 0; i < 6; i++) {
    const item = s.roster().find((r) => r.npc).inventory[0], held = g.s.assets.length; g.s.cash = 100;
    respond(s, { to: 'NPC-PARTNER', giveIds: [], giveCash: Math.round(item.fmv * 100) / 100, want: { assets: [item], cash: 0 } });
    if (g.s.assets.length > held) closed++;
  }
  assert.ok(closed >= 5, 'the swaps did close: ' + closed);
  assert.equal(g.s.xp, 0); assert.equal(g.s.p2p, 0); assert.equal(g.s.trades, 0); assert.equal(g.s.points, 0); assert.equal(g.level(), 1);
});

/** Room clocks. */
const joined = (pid, code, role = 'student') => { const s = new Session(); s.pid = pid; live.push(s); return s; };
/** The class clock has reached this student (judged by what the clock says, so it reads the same whatever the bookkeeping behind it). */
const inStep = (s, teacher) => s.clockAdopted ?? (s.clock.speed === teacher.clock.speed && s.clock.paused === teacher.clock.paused && Math.abs(s.clock.now() - teacher.clock.now()) < 2);
function room(code = 'T' + Math.random().toString(36).slice(2, 6).toUpperCase(), clock = { hour: 0, paused: true }) {
  store.clear();
  const teacher = new Session(); teacher.pid = 'TEACH'; teacher.mode = 'instructor'; teacher.clock = new Clock(clock); live.push(teacher);
  teacher.joinRoom({ code, role: 'instructor', handle: 'Prof' });
  const student = async (pid, perks = ['trades', 'pro']) => {
    const s = new Session(); s.pid = pid; live.push(s);
    s.joinRoom({ code, role: 'student', handle: pid });
    s.startGame({ perks, specialty: 'ops', handle: pid });
    await until(() => inStep(s, teacher));
    return s;
  };
  return { code, teacher, student, inStep: (s) => inStep(s, teacher) };
}

test('#4 a student who comes back to a room does not play out the absence before the class clock arrives', async () => {
  const { teacher, student, inStep: stepped } = room(undefined, { hour: 120, paused: false, speed: 1 });
  const a = await student('ADA');
  a.tick();
  const savedHour = a.game.s.hour;
  assert.ok(savedHour >= 119, 'ADA played up to the class\'s hour ' + savedHour);
  a.save(true);
  const saved = kv.get('save');
  a.leaveRoom();
  teacher.setPaused(true);                                   // the class is over for the day
  saved.clock.wall -= 48 * 3600 * 1000; kv.set('save', saved); // she comes back two days later
  const b = new Session(); live.push(b);
  assert.equal(b.restore(), true);
  b.tick();                                                  // the heartbeat fires before anything has arrived
  assert.ok(b.game.s.hour <= savedHour, `the first tick played ${b.game.s.hour - savedHour} hours of absence`);
  assert.equal(b.clock.paused, true, 'the clock waits for the class');
  await until(() => stepped(b));
  b.tick();
  assert.ok(b.game.s.hour <= teacher.clock.now() + 1, `game hour ${b.game.s.hour} is ahead of the class clock ${teacher.clock.now()}`);
  assert.equal(b.clock.paused, true, 'and then follows the class: paused');
});

test('#4 a run begun in a room starts at the room\'s hour, however long the page sat on the title screen, and a late joiner does not replay idle days', async () => {
  const { teacher } = room(undefined, { hour: 0, paused: true });
  const s = new Session(); live.push(s);
  s.clock.wall -= 5 * 60 * 1000;                             // five minutes on the title screen and the draft
  s.joinRoom({ code: teacher.roomInfo.code, role: 'student', handle: 'Early' });
  s.startGame({ perks: ['heir', 'roots'], specialty: 'ops', handle: 'Early' });
  assert.equal(s.game.s.startHour, 0, 'not hour 42');
  await until(() => inStep(s, teacher));
  s.tick();
  assert.equal(s.game.s.hour, 0);
  // the class is at day 5 when another joins: the run begins there, it is not played from day 1
  teacher.clock.set({ hour: 120, paused: true }); teacher._sendClock();
  const late = new Session(); live.push(late);
  late.joinRoom({ code: teacher.roomInfo.code, role: 'student', handle: 'Late' });
  late.startGame({ perks: ['heir', 'roots'], specialty: 'ops', handle: 'Late' });
  await until(() => inStep(late, teacher));
  assert.equal(late.game.s.startHour, 120); assert.equal(late.game.s.hour, 120);
  assert.equal(late.game.publicSnapshot().hoursPlayed, 0);
  // a run that was already played is never rebased
  s.tick();
  assert.ok(s.game.s.hour >= 0);
});

test('#4 with nobody to set the clock a student runs on its own after a short wait', () => {
  const s = mk('LONE'); s.leaveRoom();
  s.joinRoom({ code: 'LONELY', role: 'student', handle: 'x' });
  assert.equal(s.clock.paused, true); assert.equal(s.clockAdopted, false);
  s.tick();
  assert.equal(s.clock.paused, true, 'not yet');
  s.joinedAt -= CLOCK_WAIT_MS + 100;
  s.tick();
  assert.equal(s.clock.paused, false); assert.equal(s.clockAdopted, true);
});

/** Offers. */
const legit = (o = {}) => ({ id: 'OACC-1', from: 'ACC', fromHandle: 'acc', to: 'V', at: 0, note: '', give: { assets: [], cash: 5, royalty: null }, want: { assets: [], cash: 0 }, skills: { ops: 1, growth: 1, fintech: 1 }, ...o });
const offerMsg = (offer, extra = {}) => J({ t: 'offer', from: 'ACC', role: 'student', handle: 'acc', to: 'V', offer, ...extra });

test('#15 an invitation is rebuilt on arrival: a royalty on the wrong side, invented crates, unknown classes and missing parts cannot reach the player', () => {
  const s = mk('V'), g = s.game, out = stubRoom(s);
  // a want-side royalty padded the fair-value check so that $1e9 for nothing passed
  s._onMsg(offerMsg(legit({ id: 'OFREE-1', give: { assets: [], cash: 1e9, royalty: null }, want: { assets: [], cash: 0, royalty: { perDay: 1e8, days: 10 } } })));
  assert.equal(s.incoming.length, 0);
  assert.equal(s.acceptIncoming('OFREE-1').ok, false); assert.equal(g.s.cash, 0);
  // invented crates are rebuilt from a whitelist, with bounded numbers and no hidden truth (the sender has published the crate: an offer for a crate nobody holds is not delivered at all, tests/remaining-engine.test.mjs)
  s._onMsg(snapMsg('ACC', { nw: 5, inventory: [{ id: 'A1', cls: 'paperclip', cond: 'ok', zone: 1, quality: 1 }] }));
  s._onMsg(offerMsg(legit({ id: 'OFAKE-1', give: { assets: [{ id: 'A1', cls: 'paperclip', quality: 1e6, wear: 99, zone: 1, cond: 'ok', truth: { q: 9, fake: false }, secret: 'x', fmv: 1e9 }], cash: 0, royalty: null }, want: { assets: [], cash: 0 } })));
  const a = s.incoming[0].offer.give.assets[0];
  assert.deepEqual(Object.keys(a).sort(), ['cls', 'cond', 'id', 'known', 'quality', 'wear', 'zone']);
  assert.ok(a.quality <= 2 && a.wear <= 1);
  // a class that does not exist, parts that are missing, strings where numbers go
  for (const [i, bad] of [{ give: { assets: [{ id: 'A2', cls: 'nope', zone: 1 }], cash: 0 }, want: { assets: [], cash: 0 } }, { give: null, want: { assets: [], cash: 0 } }, { give: undefined, want: { assets: [], cash: 0 } },
    { give: { assets: [], cash: 5 }, want: undefined }, { give: { assets: 'x', cash: 5 }, want: { assets: [], cash: 0 } }, { give: { assets: [], cash: 5 }, want: { assets: [{ id: {} }], cash: 0 } },
    { give: { assets: [], cash: 5, royalty: 'lots' }, want: { assets: [], cash: 0 } }].entries()) {
    s._onMsg(offerMsg(legit({ id: 'OBAD-' + i, ...bad })));
  }
  s._onMsg(offerMsg(null)); s._onMsg({ t: 'offer', from: 'ACC', role: 'student', to: 'V' });
  assert.equal(s.lastError, null, 'none of it threw');
  assert.equal(s.incoming.filter((x) => x.offer.id.startsWith('OBAD')).length, 0, 'none of the broken shapes is an invitation');
  for (const { offer } of s.incoming) assert.doesNotThrow(() => g.checkOffer(offer), offer.id); // the Exchange drawer checks every invitation on every render
  // sent in somebody else's name, or to somebody else: dropped; a replay of one already seen is dropped
  const n = s.incoming.length;
  s._onMsg(offerMsg(legit({ id: 'OGHOST-1', from: 'GHOST' })));
  s._onMsg(offerMsg(legit({ id: 'OTO-1', to: 'SOMEONE' }), { to: 'SOMEONE' }));
  s._onMsg(offerMsg(legit({ id: 'OFAKE-1' })));
  assert.equal(s.incoming.length, n);
  // a real one: accepting asks its true sender
  g.s.cash = 10;
  s._onMsg(offerMsg(legit({ id: 'OREAL-1', give: { assets: [], cash: 5, royalty: null }, want: { assets: [], cash: 5 } })));
  out.length = 0;
  const r = s.acceptIncoming('OREAL-1');
  assert.ok(r.ok, r.msg);
  assert.deepEqual(out.map((m) => [m.t, m.to, m.offerId]), [['accept', 'ACC', 'OREAL-1']]);
  assert.equal(g.s.cash, 10, 'step one moves nothing');
  // the crates asked for are the ones we really hold
  const bike = give({ game: g }, 'bike', {});
  s._onMsg(offerMsg(legit({ id: 'OASK-1', give: { assets: [], cash: g.val(bike) }, want: { assets: [{ id: bike.id, cls: 'bike', quality: 99 }, ], cash: 0 } })));
  const ask = s.incoming.find((x) => x.offer.id === 'OASK-1').offer.want.assets[0];
  assert.equal(ask.quality, bike.quality, 'valued from the crate we hold, not from the message');
  s._onMsg(offerMsg(legit({ id: 'OASK-2', want: { assets: [{ id: 'A-never-held' }], cash: 0 } })));
  assert.ok(!s.incoming.some((x) => x.offer.id === 'OASK-2'));
  assert.ok(out.some((m) => m.t === 'decline' && m.offerId === 'OASK-2' && m.to === 'ACC'), 'and the proposer is told at once so its escrow comes back');
});

test('#15 an invitation flood is bounded', () => {
  const s = mk('V'); stubRoom(s);
  for (let i = 0; i < 100; i++) s._onMsg(offerMsg(legit({ id: 'OF-' + i })));
  assert.ok(s.incoming.length <= 6, 'six from one sender: ' + s.incoming.length);
  for (let k = 0; k < 10; k++) for (let i = 0; i < 10; i++) s._onMsg(J({ t: 'offer', from: 'X' + k, role: 'student', to: 'V', offer: legit({ id: `OX${k}-${i}`, from: 'X' + k }) }));
  assert.ok(s.incoming.length <= 24, 'twenty-four in all: ' + s.incoming.length);
});

/** The instructor's messages. */
test('#16 #46 only the instructor injects and rewinds, and a shock needs a real id and a finite hour', () => {
  const s = mk('V'), g = s.game;
  s.clock = new Clock({ hour: 0, paused: true });
  const n0 = g.s.events.length;
  s._onMsg({ t: 'inject', from: 'EVIL', role: 'student', kind: 'scare', atHour: 5, id: 'x1' });
  assert.equal(g.s.events.length, n0, 'a student cannot inject');
  s._onMsg({ t: 'rewind', from: 'EVIL', role: 'student', toHour: 0 });
  g.advanceTo(30);
  s._onMsg({ t: 'rewind', from: 'EVIL', role: 'student', toHour: 0 });
  assert.equal(g.s.hour, 30, 'nor rewind');
  for (const bad of [{ id: 7 }, { id: {} }, { id: 'a b' }, { id: 'x'.repeat(100) }, { atHour: 'x' }, { atHour: null }, { atHour: 1e999 }, { atHour: NaN }, { kind: 7 }, { kind: 'nope' }, { kind: '__proto__' }]) {
    s._onMsg(J(fromTeacher({ t: 'inject', kind: 'scare', atHour: 40, id: 'ok-1', ...bad })));
  }
  assert.equal(g.s.events.length, n0, 'none of the malformed shocks was kept');
  assert.doesNotThrow(() => g.advanceTo(24 * 6), 'and nothing breaks at the next day end');
  const fee = g.mods().fee;
  s._onMsg(J(fromTeacher({ t: 'inject', kind: 'fed', atHour: 'x', id: 'p' })));
  g._m = null; assert.equal(g.mods().fee, fee, 'a start that is not a number cannot make a shock permanent');
  s._onMsg(J(fromTeacher({ t: 'inject', kind: 'tariff', atHour: g.s.hour + 30, id: 'inj-ok' })));
  const ev = g.s.events.find((e) => e.id === 'inj-ok');
  assert.ok(ev && ev.injected && Number.isFinite(ev.start), 'a proper one still lands');
});

test('#17 the class clock is read only if it is a clock: no NaN hours, runaway or backward time, text for booleans, or poisoned difficulty', async () => {
  const { teacher, student } = room(undefined, { hour: 10, paused: true });
  const s = await student('V');
  const before = JSON.stringify([s.clock.hour, s.clock.speed, s.clock.paused]);
  const bad = [{ hour: 'x', speed: 'fast' }, { hour: NaN, speed: 1 }, { hour: 1e9, speed: 1 }, { hour: -5, speed: 1 }, { hour: 10, speed: 1e12 }, { hour: 10, speed: -4 }, { hour: 10, speed: 0 }, { hour: 10, speed: NaN }];
  for (const c of bad) s._onMsg(J(fromTeacher({ t: 'clock', paused: false, ...c })));
  s._onMsg(J(fromTeacher({ t: 'clock', hour: 10, speed: 1, paused: 'false' })));
  s._onMsg(J(fromTeacher({ t: 'clock', hour: 10, speed: 1 })));
  assert.equal(JSON.stringify([s.clock.hour, s.clock.speed, s.clock.paused]), before, 'none was adopted');
  s.tick(); assert.ok(Number.isFinite(s.clock.now()));
  assert.equal(s.game.s.over, false);
  // a good clock with hostile tunables: clamped, ignored if not numbers
  s._onMsg(J(fromTeacher({ t: 'clock', hour: 10, speed: 1, paused: true, difficulty: { friction: -3, audit: 'x', eeiFloor: 'abc', extra: {} }, ghosts: -1e9, algo: 'no' })));
  assert.equal(s.difficulty.friction, 0.5); assert.equal(s.difficulty.audit, 1); assert.equal(s.difficulty.eeiFloor, 1000);
  assert.equal(s.ghosts, 0); assert.equal(s.algo, true);
  assert.equal(Object.keys(s.difficulty).sort().join(), 'audit,eeiFloor,friction');
  assert.ok(s.game.instFee('pitch') >= 0 && s.game.zoneTax(5) >= 0, 'trading never pays the player');
  assert.ok(Number.isFinite(s.game.eei()));
  s._onMsg(JSON.parse('{"t":"clock","from":"TEACH","role":"instructor","hour":10,"speed":1,"paused":true,"difficulty":{"friction":99,"audit":99,"eeiFloor":1e99},"ghosts":1e999}'));
  assert.deepEqual([s.difficulty.friction, s.difficulty.audit, s.difficulty.eeiFloor <= 1e9, s.ghosts], [3, 3, true, 200]);
  s.save(true);
  const d = kv.get('save');
  assert.ok(Number.isFinite(d.clock.hour) && Number.isFinite(d.clock.speed) && typeof d.clock.paused === 'boolean');
  assert.ok(Object.values(d.difficulty).every(Number.isFinite));
  // a student who is not the class's instructor cannot set it at all
  s._onMsg({ t: 'clock', from: 'T2', role: 'student', hour: 500, speed: 64, paused: false });
  assert.ok(s.clock.now() < 100);
});

test('#17 #71 what a classroom tunes belongs to the classroom: leaving it, or a new room, puts every dial back, and a solo run keeps none of it', async () => {
  const s = mk('V');
  s.joinRoom({ code: 'DIALS', role: 'student', handle: 'V' });
  s._onMsg(J(fromTeacher({ t: 'clock', hour: 0, speed: 1, paused: true, difficulty: { friction: 3, audit: 3, eeiFloor: 50000 }, ghosts: 0, algo: false })));
  assert.deepEqual([s.difficulty.friction, s.ghosts, s.algo], [3, 0, false]);
  assert.equal(s.game.env.difficulty, s.difficulty, 'the engine reads the same object');
  s.save(true);
  assert.equal(kv.get('save').difficulty.friction, 3, 'a student in the room keeps it across a reload');
  s.leaveRoom(); s.reset();
  s.startGame({ perks: ['pro'], specialty: 'ops', handle: 'V' });
  assert.deepEqual([s.difficulty.friction, s.difficulty.audit, s.difficulty.eeiFloor, s.ghosts, s.algo], [1, 1, 1000, 36, true]);
  assert.equal(s.game.env.difficulty.friction, 1); assert.equal(s.game.env.algo, true); assert.equal(s.cohort.ghosts, 36);
  s.save(true);
  assert.equal(kv.get('save').difficulty, undefined, 'a solo save carries no classroom difficulty');
  const r = new Session(); live.push(r);
  assert.equal(r.restore(), true);
  assert.deepEqual([r.difficulty.friction, r.difficulty.eeiFloor], [1, 1000]);
  // a new instructor room does not inherit the last one
  const t = new Session(); t.pid = 'T1'; live.push(t);
  t.mode = 'instructor'; t.joinRoom({ code: 'ROOMA', role: 'instructor' });
  t.setDifficulty({ friction: 2.5 }); t.setGhosts(10); t.setAlgo(false);
  t.reset();
  assert.deepEqual([t.difficulty.friction, t.ghosts, t.algo], [1, 36, true]);
  // typing nonsense into the dashboard cannot poison the room either
  t.mode = 'instructor'; t.joinRoom({ code: 'ROOMB', role: 'instructor' });
  t.setDifficulty({ friction: NaN, audit: 'x', eeiFloor: -5 }); t.setGhosts('many');
  assert.ok(Object.values(t.difficulty).every(Number.isFinite) && t.difficulty.eeiFloor > 0);
  assert.ok(Number.isFinite(t.ghosts));
});

test('#71 the instructor\'s heat map reads the same market the students\' prices are made of', async () => {
  const { teacher, student } = room('HEAT1');
  const s = await student('V');
  assert.equal(teacher.cohort.seed, 'HEAT1'); assert.equal(s.cohort.seed, 'HEAT1');
  for (const [z, cls] of [[1, 'paperclip'], [2, 'radio'], [5, 'textbooks']]) assert.deepEqual(teacher.cohort.counts(48, z, cls), s.cohort.counts(48, z, cls), z + cls);
  teacher.setGhosts(10);
  await until(() => s.cohort.ghosts === 10);
  assert.equal(teacher.cohort.counts(48, 5, 'textbooks').total, s.cohort.counts(48, 5, 'textbooks').total);
});

/** The gradebook. */
function instructorWith(snaps, hour = 100) {
  store.clear();
  const t = new Session(); t.pid = 'TEACH'; t.mode = 'instructor'; t.clock = new Clock({ hour, paused: true }); live.push(t);
  t.roomInfo = { code: 'GRADE', relay: '', role: 'instructor' }; stubRoom(t);
  for (const [from, snap, extra] of snaps) t._onMsg(snapMsg(from, snap, extra));
  return t;
}
const finiteRow = (r) => ['nw', 'eei', 'econ', 'engage', 'auto'].every((k) => Number.isFinite(r[k])) && (r.adapt == null || Number.isFinite(r.adapt));

test('#18 #47 a classmate\'s odd snapshot cannot break the gradebook, take a rank by saying so, or borrow another\'s Founder ID', () => {
  const hostile = [5, 'str', true, {}, [null], [{ id: {} }], [{ id: 'fed@1', nw: 'x', nwAfter: {} }], [{ id: 'fed@1', nw: 1, nwAfter: 1e999, pivots: 'many' }]];
  const t = instructorWith([['GOOD', { nw: 100, hour: 100 }]]);
  for (const [i, shockLog] of hostile.entries()) t._onMsg(J(snapMsg('EVIL' + i, { nw: 1, eei: 1, shockLog })));
  assert.doesNotThrow(() => t.gradebook());
  for (const r of t.gradebook()) assert.ok(finiteRow(r), r.pid + JSON.stringify(r));
  const p = instructorParts(t, {}), csv = gradebookCSV(t);
  assert.ok(!/NaN|undefined|Infinity|\[object/.test(p.grade + csv), 'the table and the CSV read cleanly');
  // a claimed score is not believed: the score is worked out from the numbers
  const c = instructorWith([['HONEST', { nw: 5000, hour: 100 }], ['CHEAT', { nw: 0.05, eei: 1e9, p2p: 4, trades: 4, hour: 100, shockLog: [{ id: 'fed@1056', nw: 1, nwAfter: 1e9, pivots: 5 }] }]]);
  const rows = c.leaderboard();
  assert.equal(rows[0].pid, 'HONEST'); assert.ok(rows.find((r) => r.pid === 'CHEAT').eei < 1e3);
  // string scores did not sort lexicographically
  const s = instructorWith([['A', { nw: 9, eei: '9' }], ['B', { nw: 10, eei: '10' }], ['C', { nw: 100, eei: '100' }]]);
  assert.deepEqual(s.gradebook().map((r) => [r.pid, Math.round(r.econ)]).sort(), [['A', 0], ['B', 50], ['C', 100]]);
  // identity is the authenticated sender's; a flag that marks a student as a demo student is not carried
  const d = instructorWith([['ANN', { pid: 'ANN', nw: 50 }], ['MAL', { pid: 'ANN', nw: 60, synth: true, me: true, online: false, rank: 1 }]]);
  const ids = d.students().map((r) => r.pid).sort();
  assert.deepEqual(ids, ['ANN', 'MAL']);
  const mal = d.students().find((r) => r.pid === 'MAL');
  assert.ok(!mal.synth && !mal.me && mal.online === true && mal.rank === undefined);
  assert.ok(C.cleanSnap({ pid: 'ANN' }, 'MAL').pid === 'MAL');
  // p2p cannot exceed trades
  assert.equal(C.cleanSnap({ p2p: 40, trades: 3 }, 'X').p2p, 3);
});

test('#72 a founder wiped out by a shock gets an adaptability of zero, not NaN, and does not skew the others', () => {
  const log = (nwAfter, pivots = 0) => [{ id: 'fed@1056', nw: 1000, nwAfter, pivots }];
  const t = instructorWith([['KEEP', { nw: 1000, shockLog: log(1000, 1), eei: 1 }], ['MID', { nw: 800, shockLog: log(800), eei: 1 }], ['WIPED', { nw: -399.95, shockLog: log(-399.95), eei: 1 }]], 24 * 55); // (day 55: the Day 45 shock's five days are over for the founders being graded)
  const by = Object.fromEntries(t.gradebook().map((r) => [r.pid, r]));
  for (const r of Object.values(by)) assert.ok(finiteRow(r), r.pid);
  assert.equal(by.WIPED.adapt, 0);
  assert.ok(by.KEEP.adapt > by.MID.adapt && by.MID.adapt > by.WIPED.adapt);
});

test('#32 a student who closed their tab, or has been quiet for a long time, stays in the gradebook as away, with the rest ranked among everyone', async () => {
  const t = instructorWith([]);
  const seen = (min) => Date.now() - min * 60000;
  for (let i = 1; i <= 5; i++) t.peers.set('S' + i, { pid: 'S' + i, handle: 'S' + i, role: 'student', seen: seen(i <= 3 ? 12 : 0.02), snap: { pid: 'S' + i, handle: 'S' + i, nw: 100 * (6 - i), eei: 100 * (6 - i), startCap: 0.05, hour: 100, shockLog: [], p2p: 0, flags: {} } });
  const gb = t.gradebook();
  assert.equal(gb.length, 5, 'the three who left 12 minutes ago still have a row');
  const by = Object.fromEntries(gb.map((r) => [r.pid, r]));
  assert.equal(by.S1.econ, 100); assert.equal(by.S5.econ, 0, 'ranked among all five');
  assert.deepEqual(gb.filter((r) => !r.online).map((r) => r.pid).sort(), ['S1', 'S2', 'S3']);
  assert.equal(gradebookCSV(t).split('\n').length, 6);
  // closing the tab (bye) marks them away; their last snapshot stays
  t._onMsg(snapMsg('LEAVER', { nw: 70, hour: 100 }));
  assert.equal(t.students().find((r) => r.pid === 'LEAVER').online, true);
  t._onMsg({ t: 'bye', from: 'LEAVER', role: 'student' });
  const gone = t.students().find((r) => r.pid === 'LEAVER');
  assert.ok(gone && gone.online === false && gone.nw === 70);
  assert.ok(!t.alivePeers().some((p) => p.pid === 'LEAVER'), 'but they are not counted as present');
  assert.ok(!t.roster().some((r) => r.pid === 'LEAVER'), 'nor offered as someone to trade with');
  // and the roster survives the dashboard being reloaded
  t.mode = 'instructor'; t.roomInfo = { code: 'GRADE', relay: '', role: 'instructor' };
  t.rosterDirty = true; t.tick(Date.now() + 60000);
  const t2 = new Session(); t2.pid = 'TEACH'; t2.mode = 'instructor'; t2.clock = new Clock({ hour: 100, paused: true }); live.push(t2);
  t2.joinRoom({ code: 'GRADE', role: 'instructor', handle: 'Prof' });
  assert.equal(t2.students().filter((r) => !r.synth).length, 6);
  const back = Object.fromEntries(t2.students().map((r) => [r.pid, r.online]));
  assert.deepEqual([back.S1, back.S2, back.S3, back.LEAVER], [false, false, false, false], 'they come back as away, with when they were last seen');
  t2.joinRoom({ code: 'OTHER', role: 'instructor', handle: 'Prof' });
  assert.equal(t2.students().filter((r) => !r.synth).length, 0, 'another room starts empty');
  t2.joinRoom({ code: 'GRADE', role: 'instructor', handle: 'Prof' }); t2.leaveRoom();
  assert.equal(kv.get('roster'), null, 'closing the room forgets the roster');
});

/** Ingestion is bounded. */
test('#48 thousands of phantom classmates, niche keys, flags and crates cost a bounded amount and fill nothing without limit', () => {
  const s = mk('V');
  const t0 = Date.now();
  for (let i = 0; i < 20000; i++) s._onMsg(snapMsg('P' + i, { nw: 1 }));
  assert.ok(s.peers.size <= 450, 'peers: ' + s.peers.size);
  assert.ok(Date.now() - t0 < 4000, 'ingesting 20,000 snapshots took ' + (Date.now() - t0) + ' ms');
  assert.ok(s.leaderboard().length <= 452);
  // 100 peers each with 2,000 junk keys under the frame limit
  const junk = {}; for (let i = 0; i < 2000; i++) junk[`1|pen|k${i}`] = 3;
  const t = mk('W');
  for (let i = 0; i < 100; i++) t._onMsg(snapMsg('J' + i, { niches: junk, inventory: Array.from({ length: 500 }, (_, k) => ({ id: 'A' + k, cls: 'pen', zone: 1 })), shockLog: Array.from({ length: 500 }, (_, k) => ({ id: 'f' + k, nw: 1 })) }));
  t._flushCohort();
  const t1 = Date.now();
  t.cohort.allNiches(48); t.game.radar?.(1);
  assert.ok(Date.now() - t1 < 1500, 'the heat map took ' + (Date.now() - t1) + ' ms');
  for (const p of t.peers.values()) { assert.ok(p.snap.inventory.length <= C.INV_CAP && p.snap.shockLog.length <= 12 && Object.keys(p.snap.niches).length <= C.NICHE_CAP); }
  // flags
  const i = instructorWith([]);
  for (let k = 0; k < 2000; k++) i._onMsg(J({ t: 'flag', from: 'S1', role: 'student', offer: { id: 'o' + k, to: 'S2', variance: 5 } }));
  assert.equal(i.flags.length, 500);
  i._onMsg({ t: 'flag', from: 'S1', role: 'instructor', offer: { id: 'o', to: 'S2' } });
  assert.equal(i.flags.length, 500, 'only a student\'s flag counts');
  i._onMsg({ t: 'flag', from: 'S1', role: 'student', offer: 'x' }); i._onMsg({ t: 'flag', from: 'S1', role: 'student' });
  assert.equal(i.lastError, null);
  // a flag that carries a long text or an object where a number goes
  i._onMsg(J({ t: 'flag', from: 'S3', role: 'student', offer: { id: 'x'.repeat(500), to: { a: 1 }, variance: 'big', va: 'x' } }));
  const f = i.flags.at(-1);
  assert.ok(f.id.length <= 48 && f.to === '' && f.variance === 0);
});

test('#16 #47 messages with a sender that is not a Founder ID, or is the practice partner\'s or a demo student\'s, are ignored', () => {
  const s = mk('V');
  for (const from of [undefined, null, 5, '', 'x'.repeat(40), 'a b', '<b>', 'NPC-PARTNER', 'SYN-ABCD', 'V']) s._onMsg(J({ t: 'snap', from, role: 'student', snap: { pid: 'Q', nw: 5 } }));
  assert.equal(s.peers.size, 0);
  for (const m of [null, 5, 'str', [], { t: 5 }, {}]) s._onMsg(m);
  assert.equal(s.lastError, null);
});

/** Two-step swaps. */
async function trio() {
  const r = room(undefined, { hour: 0, paused: true });
  const a = await r.student('ADA'), b = await r.student('GRACE', ['creator', 'roots']);
  const mal = await r.student('MALLORY', ['heir', 'creator']);
  await until(() => a.roster().some((x) => x.pid === 'GRACE' && !x.npc) && b.roster().some((x) => x.pid === 'ADA' && !x.npc));
  return { ...r, a, b, mal };
}
const holdings = (...ss) => ({ vans: ss.reduce((n, s) => n + s.game.s.assets.filter((x) => x.cls === 'van').length + s.game.s.escrow.reduce((m, e) => m + e.assets.filter((x) => x.cls === 'van').length, 0), 0), cash: ss.reduce((n, s) => n + s.game.s.cash + s.game.s.escrow.reduce((m, e) => m + e.cash, 0), 0) });

test('#33 an accepted swap is confirmed by the proposer before the acceptor gives anything, and then completes for both', async () => {
  const { a, b } = await trio();
  const van = a.game._mk(a.game.s, 'van', { zone: 1, basis: 100, quality: 0.2 }); a.game.s.assets.push(van); // (a damaged one: on day 0 a founder cannot hold a crate worth more than the best run is worth then)
  const price = Math.round(a.game.val(van));
  b.game.s.cash = 2000;
  const r = a.propose({ to: 'GRACE', giveIds: [van.id], want: { assets: [], cash: price } });
  assert.ok(r.ok, r.msg);
  await until(() => b.incoming.length === 1);
  const before = holdings(a, b);
  const sent = []; const real = b.room.send.bind(b.room); b.room.send = (m) => { if (m.t !== 'snap') sent.push(m.t); return real(m); }; // the public snapshot goes out on its own jittered timer (0 to 400 ms) and can land anywhere in the wait: it is not a step of the swap
  const acc = b.acceptIncoming(b.incoming[0].offer.id);
  assert.ok(acc.ok, acc.msg);
  assert.equal(b.game.s.cash, 2000, 'step one moves nothing');
  assert.equal(b.game.s.assets.filter((x) => x.cls === 'van').length, 0);
  await until(() => a.game.s.cash === price && a.game.s.escrow.length === 0 && b.game.s.assets.some((x) => x.cls === 'van'));
  assert.equal(b.game.s.cash, 2000 - price);
  assert.deepEqual(sent, ['accept', 'deliver'], 'the acceptor said accept, waited to be confirmed, then delivered');
  assert.deepEqual(holdings(a, b), before, 'nothing created, nothing lost');
  assert.equal(a.game.s.p2p, 1); assert.equal(b.game.s.p2p, 1);
  assert.equal(a.sent.size, 0); assert.equal(b.accepting.size, 0);
});

test('#33 #46 a stale invitation, after the offer is gone or the class has been rewound, duplicates nothing and costs the acceptor nothing', async () => {
  const { teacher, a, b } = await trio();
  const van = a.game._mk(a.game.s, 'van', { zone: 1, basis: 100, quality: 0.2 }); a.game.s.assets.push(van);
  const price = Math.round(a.game.val(van));
  b.game.s.cash = 2000;
  const r = a.propose({ to: 'GRACE', giveIds: [van.id], want: { assets: [], cash: price } });
  assert.ok(r.ok, r.msg);
  await until(() => b.incoming.length === 1);
  // the offer is gone on the proposer's side (rewound, expired) while the invitation still stands on the acceptor's
  a.game.cancelOffer(r.offer.id);
  const before = holdings(a, b);
  const acc = b.acceptIncoming(b.incoming[0].offer.id);
  assert.ok(acc.ok);
  await until(() => b.accepting.size === 0);
  await sleep(150);
  assert.deepEqual(holdings(a, b), before, 'vans and cash are exactly as they were');
  assert.equal(b.game.s.cash, 2000); assert.equal(b.game.s.p2p, 0);
  // a rewind throws away invitations and escrows of the future that did not happen
  const c = a.propose({ to: 'GRACE', giveIds: [van.id], want: { assets: [], cash: price } });
  assert.ok(c.ok, c.msg);
  await until(() => b.incoming.length === 1);
  teacher.clock.set({ hour: 72, paused: true }); teacher._sendClock();
  await until(() => a.clock.now() >= 71 && b.clock.now() >= 71);
  a.tick(); b.tick();
  assert.equal(b.incoming.length, 1);
  teacher.rewind(1);
  await until(() => a.game.s.hour <= 48 && b.game.s.hour <= 48);
  assert.equal(b.incoming.length, 0, 'the invitation went with the rewound future');
  assert.equal(a.sent.size, a.game.s.escrow.length, 'and the proposer\'s list matches its escrow');
  assert.equal(b.acceptIncoming(c.offer.id).ok, false);
  assert.equal(holdings(a, b).vans, 1);
});

test('#21 #33 nobody but the classmate an offer was made to can take it, deliver for it, or cancel it; a delivery is clipped to what was asked, and counts once', () => {
  const a = mk('ADA'), out = stubRoom(a);
  a.game.s.cash = 100;
  const r = a.propose({ to: 'GRACE', giveIds: [], giveCash: 50, want: { assets: [], cash: 50 } }); // GRACE is not in this room yet
  assert.equal(r.ok, false);
  a._onMsg(snapMsg('GRACE', { nw: 1 })); a._onMsg(snapMsg('MALLORY', { nw: 1 }));
  const p = a.propose({ to: 'GRACE', giveIds: [], giveCash: 50, want: { assets: [], cash: 50 } });
  assert.ok(p.ok, p.msg);
  const id = p.offer.id, e = () => a.game.s.escrow.find((x) => x.offerId === id);
  out.length = 0;
  const msg = (from, t, extra = {}) => J({ t, from, role: 'student', to: 'ADA', offerId: id, handle: from, ...extra });
  // a third party asks to take it, delivers for it, declines it, withdraws it: nothing
  a._onMsg(msg('MALLORY', 'accept')); assert.equal(e().lockedBy, undefined); assert.equal(out.length, 0);
  a._onMsg(msg('MALLORY', 'deliver', { deliver: { cash: 1e9, assets: [] } })); a._onMsg(msg('GRACE', 'deliver', { deliver: { cash: 50, assets: [] } }));
  a._onMsg(msg('MALLORY', 'decline')); a._onMsg(msg('MALLORY', 'abort'));
  assert.ok(e(), 'the escrow is untouched'); assert.equal(a.game.s.cash, 50);
  // the right classmate asks: the escrow is held for them and they are told to go ahead; it cannot be withdrawn meanwhile
  a._onMsg(msg('GRACE', 'accept'));
  assert.equal(e().lockedBy, 'GRACE'); assert.deepEqual(out.map((m) => [m.t, m.to]), [['confirm', 'GRACE']]);
  assert.equal(a.withdraw(id).ok, false); assert.ok(e());
  // they deliver far too much: the offer asked for $50
  a._onMsg(msg('GRACE', 'deliver', { deliver: { cash: 1e9, assets: [{ id: 'A9', cls: 'van', zone: 1, quality: 99 }] } }));
  assert.equal(a.game.s.cash, 100, 'exactly the $50 that was asked for');
  assert.equal(a.game.s.assets.filter((x) => x.cls === 'van').length, 0, 'and no crate that was not asked for');
  assert.equal(a.game.s.escrow.length, 0); assert.equal(a.sent.size, 0);
  // a replay of the same delivery, or of the accept, changes nothing
  a._onMsg(msg('GRACE', 'deliver', { deliver: { cash: 50, assets: [] } })); a._onMsg(msg('GRACE', 'accept'));
  assert.equal(a.game.s.cash, 100); assert.equal(a.game.s.p2p, 1);
  assert.equal(out.at(-1).t, 'reject', 'and a late accept is told the offer is no longer open');
  // abort frees the hold
  const q = a.propose({ to: 'GRACE', giveIds: [], giveCash: 10, want: { assets: [], cash: 10 } });
  a._onMsg(J({ t: 'accept', from: 'GRACE', role: 'student', to: 'ADA', offerId: q.offer.id }));
  const eq = () => a.game.s.escrow.find((x) => x.offerId === q.offer.id);
  assert.equal(eq().lockedBy, 'GRACE');
  a._onMsg(J({ t: 'abort', from: 'GRACE', role: 'student', to: 'ADA', offerId: q.offer.id }));
  assert.equal(eq().lockedBy, undefined); assert.equal(a.withdraw(q.offer.id).ok, true);
  // the hold also ends by itself
  const w = a.propose({ to: 'GRACE', giveIds: [], giveCash: 10, want: { assets: [], cash: 10 } });
  a._onMsg(J({ t: 'accept', from: 'GRACE', role: 'student', to: 'ADA', offerId: w.offer.id }));
  a.game.s.escrow.find((x) => x.offerId === w.offer.id).lockedAt -= LOCK_MS + 1000;
  assert.equal(a.withdraw(w.offer.id).ok, true, 'once the acceptor has stopped trying (LOCK_MS) the proposer may withdraw');
});

test('#21 a forged or malformed accept, decline, withdraw or reject cannot touch anyone else\'s swap', () => {
  const b = mk('GRACE'); stubRoom(b);
  b.game.s.cash = 500;
  b._onMsg(offerMsg(legit({ id: 'OACC-7', to: 'GRACE', give: { assets: [], cash: 5, royalty: null }, want: { assets: [], cash: 5 } }), { to: 'GRACE' }));
  assert.equal(b.incoming.length, 1);
  b._onMsg({ t: 'withdraw', from: 'MALLORY', role: 'student', to: 'GRACE', offer: 'OACC-7' });
  assert.equal(b.incoming.length, 1, 'only the proposer withdraws its offer');
  assert.ok(b.acceptIncoming('OACC-7').ok);
  b._onMsg({ t: 'confirm', from: 'MALLORY', role: 'student', to: 'GRACE', offerId: 'OACC-7' });
  assert.equal(b.game.s.cash, 500, 'a confirmation from anyone but the proposer is nothing');
  b._onMsg({ t: 'reject', from: 'MALLORY', role: 'student', to: 'GRACE', offerId: 'OACC-7' });
  assert.equal(b.accepting.size, 1);
  b._onMsg({ t: 'confirm', from: 'ACC', role: 'student', to: 'GRACE', offerId: 'OACC-7' });
  assert.equal(b.game.s.cash, 500 - 5 + 5, 'the real confirmation commits: $5 out, $5 in');
  assert.equal(b.game.s.p2p, 1);
  b._onMsg({ t: 'confirm', from: 'ACC', role: 'student', to: 'GRACE', offerId: 'OACC-7' });
  assert.equal(b.game.s.p2p, 1, 'a replayed confirmation does nothing');
  for (const bad of [{ offerId: 5 }, { offerId: {} }, { offerId: '../x' }, {}]) for (const t of ['accept', 'confirm', 'deliver', 'abort', 'reject', 'decline']) b._onMsg(J({ t, from: 'ACC', role: 'student', to: 'GRACE', ...bad }));
  assert.equal(b.lastError, null);
  // an acceptor waiting for a proposer that never answers gives up, with nothing changed
  b._onMsg(offerMsg(legit({ id: 'OACC-8', to: 'GRACE', give: { assets: [], cash: 5, royalty: null }, want: { assets: [], cash: 5 } }), { to: 'GRACE' }));
  assert.ok(b.acceptIncoming('OACC-8').ok);
  const cash = b.game.s.cash;
  b.tick(Date.now() + 40000);
  assert.equal(b.accepting.size, 0); assert.equal(b.game.s.cash, cash);
});

test('#33 the royalty a swap carries is agreed once: what arrives is capped by the total that was offered', async () => {
  const { a, b } = await trio();
  a.game.s.cash = 1000; a._sendSnap(true); // a promise is worth what its maker has published to the room, so the room has to have heard how much that is
  await until(() => b.peers.get('ADA')?.snap?.nw >= 1000);
  const r = a.propose({ to: 'GRACE', giveIds: [], giveCash: 20, royalty: { perDay: 10, days: 3 }, want: { assets: [], cash: 40 } });
  assert.ok(r.ok, r.msg);
  b.game.s.cash = 100;
  await until(() => b.incoming.length === 1);
  assert.ok(b.acceptIncoming(b.incoming[0].offer.id).ok);
  await until(() => a.game.s.escrow.length === 0);
  const stream = b.game.s.royalties.find((x) => x.dir === 'recv');
  // the most it can be paid: what was promised (30) and no more than the fair-value check counted it for (a tenth of the net worth the room had heard of, on day 0: 10) with the band's headroom
  assert.ok(stream && Math.abs(stream.cap - 14) < 1e-9, 'the receiver knows the most it can be paid: ' + (stream && stream.cap));
  const cash = b.game.s.cash;
  for (let i = 0; i < 6; i++) { b.clock.hour += 24; b._onMsg({ t: 'royalty', from: 'ADA', role: 'student', to: 'GRACE', amount: 10, offer: stream.offer }); } // (a day's rate for each day: the stream is paced by the class's clock)
  assert.ok(Math.abs(b.game.s.cash - cash - 14) < 1e-9, 'and that is all that arrives: ' + (b.game.s.cash - cash));
});

/** Rewind. */
test('#70 #77 a student who reloaded is still rewound, as far back as the checkpoints it kept, and the instructor is told who could not go all the way', async () => {
  const { teacher, student } = room(undefined, { hour: 0, paused: true });
  const a = await student('ADA');
  teacher.clock.set({ hour: 24 * 10, paused: true }); teacher._sendClock();
  await until(() => a.clock.now() >= 239);
  a.tick();
  assert.ok(a.game.s.hour >= 239);
  const saved = a.game.s.hour;
  a.save(true);
  a.leaveRoom();
  const b = new Session(); live.push(b);
  assert.equal(b.restore(), true);
  assert.equal(b.game.s.hour, saved);
  assert.ok(b.game.ckpt.size >= 3, 'and come back with it: ' + b.game.ckpt.size);
  await until(() => inStep(b, teacher));
  const events = []; b.on((t, d) => { if (t === 'rewound') events.push(d); });
  teacher.rewind(2);
  await until(() => b.game.s.hour <= 24 * 8);
  assert.ok(b.game.s.hour >= 24 * 7, 'back to the day asked for: ' + b.game.s.hour);
  assert.equal(events.length, 1, 'the player is told');
  await until(() => teacher.rewindReport.get(b.pid));
  assert.equal(teacher.rewindReport.get(b.pid).ok, true);
  // a rewind further back than anything kept: as far as it can go, and the instructor is told it fell short
  teacher.clock.set({ hour: 24 * 10, paused: true });
  b.game.advanceTo(24 * 9); b._persistCkpt();
  const oldest = Math.min(...b.game.ckpt.keys());
  for (const d of [...b.game.ckpt.keys()]) if (d > oldest && d < 8) b.game.ckpt.delete(d);
  teacher.rewind(10); // asks for hour 0
  await until(() => teacher.rewindReport.get(b.pid) && teacher.rewindReport.get(b.pid).ok === false);
  assert.equal(b.game.s.hour, oldest * 24, 'it went back to the oldest checkpoint it has');
  const row = teacher.students().find((r) => r.pid === b.pid);
  assert.ok(row.rewind && row.rewind.ok === false && row.rewind.hour === oldest * 24);
});

test('#70 a student with no checkpoint at all keeps its run and says so rather than being half-rewound', () => {
  const s = mk('V');
  s.game.advanceTo(30);
  s.game.ckpt.clear();
  const notes = []; s.on((t, d) => { if (t === 'note') notes.push(d); });
  s._onMsg(J(fromTeacher({ t: 'rewind', toHour: 0 })));
  assert.equal(s.game.s.hour, 30);
  assert.ok(notes.some((n) => /no saved checkpoint/.test(n.text)));
});

test('#77 checkpoints are stored once each, as they are, within a budget, and are forgotten with the run', () => {
  const s = mk('V');
  s.joinRoom({ code: 'CKPT1', role: 'student', handle: 'V' });
  s.clock.set({ hour: 24 * 12, paused: true }); s.clockAdopted = true;
  s.tick();
  assert.ok(s.game.s.hour >= 24 * 12 - 1);
  const days = kv.get('ckdays').days;
  assert.ok(days.length >= 1 && days.length <= 9);
  for (const d of days) { const raw = kv.getRaw('ck.' + d); assert.ok(raw && raw[0] === '{' && JSON.parse(raw).hour != null, 'stored as plain JSON, not escaped twice'); }
  assert.ok(!days.some((d) => d < Math.floor(s.game.s.hour / 24) - 9));
  const key = (d) => `pc.ck.${d}.main`;
  assert.equal(store.has(key(days[0])), true);
  s.leaveRoom(); s.reset();
  assert.equal(kv.get('ckdays'), null); assert.equal(store.has(key(days[0])), false, 'a new run does not inherit the old run\'s past');
});

/** Hello flood and the relay. */
const relayPath = new URL('../server/relay.mjs', import.meta.url).pathname;
const haveRelay = existsSync(new URL('../server/node_modules/ws', import.meta.url));
const skipRelay = !haveRelay && 'run npm install in server/';
async function startRelay(env = {}) {
  const child = spawn('node', [relayPath], { env: { ...process.env, PORT: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const st = { exited: null, err: '' };
  child.on('exit', (c) => { st.exited = c; }); child.stderr.on('data', (d) => { st.err += d; });
  const port = await new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('relay did not start')), 8000); child.stdout.on('data', (d) => { const m = /listening on :(\d+)/.exec(String(d)); if (m) { clearTimeout(to); res(+m[1]); } }); child.on('exit', () => rej(new Error('relay exited early'))); });
  return { child, port, st, url: `ws://localhost:${port}`, stop: () => child.kill() };
}
/** A bare WebSocket in a room, recording everything it is sent. */
const keyFor = (pid) => ('key-' + pid).replace(/[^A-Za-z0-9_-]/g, '_').padEnd(16, '0'); // the secret a browser keeps beside its pid (the relay refuses a connection without one)
function raw(relay, room, pid, role = 'student', key = keyFor(pid)) {
  const ws = new WebSocket(`${relay.url}/?room=${room}&pid=${pid}&key=${key}&role=${role}`);
  const c = { ws, got: [], closed: null, ready: new Promise((res) => { ws.onopen = res; }), send: (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m)) };
  ws.onmessage = (e) => c.got.push(JSON.parse(e.data));
  ws.onclose = (e) => { c.closed = e.code; };
  return c;
}
const health = async (relay) => (await fetch(`http://localhost:${relay.port}/health`)).text();

test('#31 one oversize, binary, malformed or unknown frame cannot stop the relay or anyone else\'s class', { skip: skipRelay }, async () => {
  const relay = await startRelay();
  try {
    const a = raw(relay, 'CRASH', 'A'), b = raw(relay, 'CRASH', 'B');
    await Promise.all([a.ready, b.ready]);
    a.send('x'.repeat(70000));                       // over the frame limit: the socket is closed, the relay is not
    await until(() => a.closed != null);
    assert.equal(relay.st.exited, null, 'the relay is still up: ' + relay.st.err.split('\n')[0]);
    assert.equal(await health(relay), 'ok');
    const c = raw(relay, 'CRASH', 'C'); await c.ready;
    c.ws.send(new Uint8Array([1, 2, 3]));           // binary
    for (const junk of ['not json', '[1,2]', '5', 'null', '{"t":5}', '{"t":"nope"}', '{"t":"snap"}', '{"t":"snap","snap":5}']) c.send(junk);
    c.send({ t: 'hello' });
    await until(() => b.got.some((m) => m.t === 'hello' && m.from === 'C'));
    assert.deepEqual(b.got.filter((m) => m.from === 'C').map((m) => m.t), ['hello'], 'only the real message got through');
    // bad connection requests
    const bad = raw(relay, 'x', 'ok'); await sleep(100); assert.equal(bad.closed, 1008);
    const bad2 = raw(relay, 'GOOD1', 'has space!'); await sleep(100); assert.equal(bad2.closed, 1008);
    assert.equal(relay.st.exited, null);
  } finally { relay.stop(); }
});

test('#46 #49 the relay says who a message is from, and only the instructor\'s seat sets the clock, shocks and rewinds; an addressed message goes to one founder', { skip: skipRelay }, async () => {
  const relay = await startRelay();
  try {
    const t = raw(relay, 'SEAT1', 'TEACH', 'instructor');
    await t.ready;                                                    // the seat goes to whoever asks first: the teacher
    const s1 = raw(relay, 'SEAT1', 'S1'), s2 = raw(relay, 'SEAT1', 'S2'), thief = raw(relay, 'SEAT1', 'THIEF', 'instructor');
    await Promise.all([s1.ready, s2.ready, thief.ready]);
    s1.send({ t: 'clock', hour: 5, speed: 64, paused: false, from: 'TEACH', role: 'instructor' });   // a student claiming to be the teacher
    s1.send({ t: 'inject', kind: 'fed', atHour: 0, id: 'p' }); s1.send({ t: 'rewind', toHour: 0 });
    thief.send({ t: 'clock', hour: 7, speed: 64, paused: false });                                    // a second claimant for the seat
    t.send({ t: 'clock', hour: 100, speed: 1, paused: false, from: 'S2', role: 'student' });          // the teacher: stamped as the teacher whatever it writes
    await until(() => s2.got.some((m) => m.t === 'clock'));
    const clocks = s2.got.filter((m) => m.t === 'clock');
    assert.equal(clocks.length, 1); assert.equal(clocks[0].hour, 100); assert.equal(clocks[0].from, 'TEACH'); assert.equal(clocks[0].role, 'instructor');
    assert.ok(!s2.got.some((m) => m.t === 'inject' || m.t === 'rewind'));
    // from is the connection's, role too
    s1.send({ t: 'hello', from: 'ANN', role: 'instructor', age: 99999 });
    await until(() => s2.got.some((m) => m.t === 'hello'));
    const h = s2.got.find((m) => m.t === 'hello');
    assert.equal(h.from, 'S1'); assert.equal(h.role, 'student'); assert.equal(h.age, undefined);
    // addressed
    s1.send({ t: 'offer', to: 'S2', offer: { id: 'x' } });
    await until(() => s2.got.some((m) => m.t === 'offer'));
    await sleep(100);
    assert.ok(!t.got.some((m) => m.t === 'offer') && !thief.got.some((m) => m.t === 'offer'), 'only S2 was sent it');
    // the teacher reconnecting (same pid) keeps the seat; a late joiner is replayed the real clock, with its age
    const t2 = raw(relay, 'SEAT1', 'TEACH', 'instructor'); await t2.ready;
    const late = raw(relay, 'SEAT1', 'LATE'); await late.ready;
    await until(() => late.got.some((m) => m.t === 'clock'));
    const rc = late.got.find((m) => m.t === 'clock');
    assert.equal(rc.hour, 100); assert.equal(typeof rc.age, 'number'); assert.ok(rc.age >= 0);
    t2.send({ t: 'clock', hour: 110, speed: 1, paused: true });
    await until(() => late.got.some((m) => m.t === 'clock' && m.hour === 110));
  } finally { relay.stop(); }
});

test('#49 the relay forgets a founder\'s snapshot when their socket closes, replays the others with their age, and bounds snapshot size, rooms and bytes', { skip: skipRelay }, async () => {
  const relay = await startRelay({ MAX_ROOMS: '3', MAX_SNAP: '2000', MAX_SNAP_BYTES: '6000' });
  try {
    const snap = (pid, pad = 0) => ({ t: 'snap', snap: { pid, nw: 5, pad: 'x'.repeat(pad) } });
    const s1 = raw(relay, 'SNAP1', 'S1'), s2 = raw(relay, 'SNAP1', 'S2');
    await Promise.all([s1.ready, s2.ready]);
    s1.send(snap('S1')); s2.send(snap('S2'));
    await sleep(150);
    const j1 = raw(relay, 'SNAP1', 'J1'); await j1.ready;
    await until(() => j1.got.filter((m) => m.t === 'snap').length === 2);
    assert.ok(j1.got.filter((m) => m.t === 'snap').every((m) => m.age >= 100 && m.age < 5000), 'replayed with how old they are');
    // S1 closes: a later joiner is not told about them
    s1.ws.close();
    await sleep(200);
    const j2 = raw(relay, 'SNAP1', 'J2'); await j2.ready; await sleep(200);
    assert.deepEqual(j2.got.filter((m) => m.t === 'snap').map((m) => m.from), ['S2']);
    // a snapshot over the limit is neither kept nor forwarded
    s2.send(snap('S2', 5000)); await sleep(150);
    const j3 = raw(relay, 'SNAP1', 'J3'); await j3.ready; await sleep(200);
    assert.ok(!j3.got.some((m) => m.t === 'snap' && m.snap.pad), 'oversize snapshot dropped');
    assert.ok(!j2.got.some((m) => m.t === 'snap' && m.snap.pad));
    // all remembered snapshots together are bounded
    const many = Array.from({ length: 10 }, (_, i) => raw(relay, 'SNAP1', 'M' + i)); await Promise.all(many.map((m) => m.ready));
    for (const m of many) m.send(snap(m.ws.url.split('pid=')[1].split('&')[0], 900));
    await sleep(300);
    const j4 = raw(relay, 'SNAP1', 'J4'); await j4.ready; await sleep(200);
    assert.ok(j4.got.filter((m) => m.t === 'snap').length < 10, 'not every one was kept: ' + j4.got.filter((m) => m.t === 'snap').length);
    // rooms are bounded
    const r2 = raw(relay, 'ROOM2', 'A'), r3 = raw(relay, 'ROOM3', 'A'); await Promise.all([r2.ready, r3.ready]);
    const r4 = raw(relay, 'ROOM4', 'A'); await sleep(200);
    assert.equal(r4.closed, 1013, 'a fourth room is refused');
    const again = raw(relay, 'ROOM2', 'B'); await again.ready; // but an existing room can still be joined
    assert.equal(relay.st.exited, null);
  } finally { relay.stop(); }
});

test('#68 one student joining a class of students costs a handful of messages, not one snapshot from every student', { skip: skipRelay }, async () => {
  const relay = await startRelay();
  const sessions = [];
  try {
    const spy = raw(relay, 'FLOOD', 'SPY'); await spy.ready;
    const join = async (n) => {
      store.clear();
      const s = new Session(); s.pid = 'F' + n; live.push(s); sessions.push(s);
      s.joinRoom({ code: 'FLOOD', relay: relay.url, role: 'student', handle: 'F' + n });
      s.startGame({ perks: ['trades', 'pro'], specialty: 'ops', handle: 'F' + n });
      await until(() => s.room.state === 'open');
    };
    for (let n = 0; n < 8; n++) await join(n);
    await sleep(700);
    spy.got.length = 0;
    await join(8);
    await sleep(1200);
    const snaps = spy.got.filter((m) => m.t === 'snap').length;
    assert.ok(snaps <= 3, `one join delivered ${snaps} snapshots to a bystander (8 students were already there)`);
    // the joiner still learns about the room: the relay replays what it has
    await until(() => sessions[8].peers.size >= 8, 4000);
    assert.ok(sessions[8].peers.size >= 8);
  } finally { for (const s of sessions) { try { s.leaveRoom(); } catch { /* closed */ } } relay.stop(); }
});

test('#4 #17 a student over the real relay adopts the replayed clock a moment late, not hours early or late', { skip: skipRelay }, async () => {
  const relay = await startRelay();
  const keep = [];
  try {
    store.clear();
    const t = new Session(); t.pid = 'TEACH'; t.mode = 'instructor'; t.clock = new Clock({ hour: 50, paused: false, speed: 64 }); keep.push(t);
    t.joinRoom({ code: 'REPLAY', relay: relay.url, role: 'instructor', handle: 'Prof' });
    await until(() => t.room.state === 'open');
    t._sendClock();
    await sleep(500);
    const s = new Session(); s.pid = 'LATE'; keep.push(s);
    s.joinRoom({ code: 'REPLAY', relay: relay.url, role: 'student', handle: 'Late' });
    s.startGame({ perks: ['pro'], specialty: 'ops', handle: 'Late' });
    await until(() => inStep(s, t));
    assert.equal(s.clock.speed, 64);
    // the clock left at ~50 half a second ago at 64x (about 4.6 hours later), and the teacher's own clock has moved on by the same
    assert.ok(Math.abs(s.clock.now() - t.clock.now()) < 6, `${s.clock.now()} vs ${t.clock.now()}`);
    assert.ok(s.game.s.startHour >= 50, 'it started at the class\'s hour, ' + s.game.s.startHour);
  } finally { for (const s of keep) { try { s.leaveRoom(); } catch { /* closed */ } } relay.stop(); }
});

/** The dev server. */
const staticPath = new URL('../server/static.mjs', import.meta.url).pathname;
async function startStatic(env = {}) {
  const child = spawn('node', [staticPath], { env: { ...process.env, PORT: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const st = { exited: null };
  child.on('exit', (c) => { st.exited = c; });
  const port = await new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('did not start')), 8000); child.stdout.on('data', (d) => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(to); res(+m[1]); } }); child.on('exit', () => rej(new Error('exited early'))); });
  // one raw HTTP exchange: what the parser hands the handler is what we send, whatever it is
  const talk = (req) => new Promise((res) => { const sock = net.connect(port, '127.0.0.1'); let buf = ''; sock.on('data', (d) => { buf += d; }); sock.on('close', () => res(buf)); sock.on('error', () => res(buf)); sock.write(req); setTimeout(() => sock.end(), 400); });
  const get = async (path) => /^HTTP\/1\.1 (\d+)/.exec(await talk(`GET ${path} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`))?.[1];
  return { child, port, st, talk, get, stop: () => child.kill() };
}

test('#50 a malformed request gets a 400 and the dev server carries on', async () => {
  const srv = await startStatic();
  try {
    assert.equal(await srv.get('/%E0%A4%A'), '400');
    assert.equal(await srv.get('/%'), '400');
    assert.equal(await srv.get('//'), '200');
    assert.equal(await srv.get('/js/%zz'), '400');
    assert.equal(srv.st.exited, null, 'the server is still running');
    assert.equal(await srv.get('/index.html'), '200');
    assert.match(await srv.talk('POST /index.html HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'), /^HTTP\/1.1 405/);
    assert.match(await srv.talk('GARBAGE\r\n\r\n'), /^HTTP\/1.1 400/);
    assert.equal(srv.st.exited, null);
    assert.equal(await srv.get('/index.html'), '200');
  } finally { srv.stop(); }
  // and the handler itself, called as the server calls it, never rejects
  const { handler, route } = await import('../server/static.mjs');
  for (const url of ['/%E0%A4%A', '/%', '/js/%zz', 'nonsense', '', undefined]) {
    const res = { statusCode: 0, ended: false, headersSent: false, writeHead(c) { this.statusCode = c; }, end() { this.ended = true; } };
    await assert.doesNotReject(handler({ method: 'GET', url }, res), String(url));
    assert.ok(res.ended && (res.statusCode === 400 || res.statusCode === 404), url + ' -> ' + res.statusCode);
  }
  assert.deepEqual(route('/%E0%A4%A'), { status: 400 });
});

test('#87 the dev server listens on this machine only and serves the app and nothing else: no .git, workflows, dependencies, server code or package files', async () => {
  const srv = await startStatic();
  try {
    const external = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
    if (external) {
      const reached = await new Promise((res) => { const sock = net.connect({ port: srv.port, host: external.address }); sock.on('connect', () => { sock.destroy(); res(true); }); sock.on('error', () => res(false)); });
      assert.equal(reached, false, 'not reachable from the network at ' + external.address);
    }
    for (const ok of ['/', '/index.html', '/css/styles.css', '/js/main.js', '/js/ui/instructor.js', '/docs/ARCHITECTURE.md', '/tests/bot.mjs', '/tests/helpers/ctx.mjs', '/dev/world-harness.html', '/js/main.js?x=1']) assert.equal(await srv.get(ok), '200', ok);
    for (const no of ['/.git/HEAD', '/.git/config', '/.git/logs/HEAD', '/.github/workflows/pages.yml', '/.gitignore', '/server/node_modules/ws/package.json', '/server/package-lock.json', '/server/relay.mjs', '/package.json', '/README.md',
      '/../../etc/hosts', '/%2e%2e/%2e%2e/etc/hosts', '/..%2f..%2fetc/hosts', '/js/../.git/HEAD', '/js/.hidden.js', '/js/node_modules/x.js', '/js/', '/js/main.js%00.png', '/css/unknown.exe']) {
      assert.match(await srv.get(no), /^(400|404)$/, no);
    }
  } finally { srv.stop(); }
  const { route } = await import('../server/static.mjs');
  for (const f of ['css', 'js', 'docs', 'dev', 'tests']) assert.ok(existsSync(new URL('../' + f, import.meta.url)), f + ' exists');
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const m of index.matchAll(/(?:href|src)="((?:css|js)\/[^"]+)"/g)) assert.ok(route('/' + m[1]).file, m[1]); // every file the page loads is served
});

test('#85 the relay test no longer picks a port that something else may hold', () => {
  const src = readFileSync(new URL('./multiplayer.test.mjs', import.meta.url), 'utf8');
  assert.ok(!/Math\.random\(\) \* 90/.test(src) && !/8800/.test(src), 'no random port in a range');
  assert.ok(/PORT: '0'/.test(src), 'it asks for any free port');
  assert.ok(/listening on :\(\\d\+\)/.test(src), 'and reads the one it got');
  const relaySrc = readFileSync(relayPath, 'utf8');
  assert.ok(/http\.address\(\)\.port/.test(relaySrc), 'the relay says which port it listens on');
});

test('the room protocol and the engine still agree: a game the bot played passes through the door and the leaderboard unchanged', () => {
  const g = makeGame(['creator', 'roots'], 'growth', 3); run(g, { days: 30 });
  const t = instructorWith([['BOT', J(g.publicSnapshot())]], g.s.hour);
  const row = t.students().find((r) => r.pid === 'BOT');
  assert.equal(row.nw, g.publicSnapshot().nw);
  assert.ok(Math.abs(row.eei - g.eei()) < Math.abs(g.eei()) * 1e-9 + 1e-9, `${row.eei} vs ${g.eei()}`);
  assert.deepEqual(row.perks, g.s.perks); assert.equal(row.zones, Math.max(...g.s.zones));
  assert.ok(Game && TOTAL_HOURS && SEC_PER_HOUR && ZONE_IDS.length === 16 && joined);
});
