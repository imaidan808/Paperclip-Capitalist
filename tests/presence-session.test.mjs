// Presence through the session, over a real relay (an in-process one on 127.0.0.1): what a student says of where they are and what they just did reaches the instructor's table, and nothing of it reaches the game.
//   S1  a student's district and what they are doing reach the instructor's table; a student's own session does not keep the room's table (nothing shows it to students yet)
//   S2  a student who changes district many times in a second says it once or twice, and the last place is the one that stands
//   S3  an engine event becomes an act (a district opened, a shock); an event that is not news sends nothing; a flood of events is held to a few
//   S4  a swap between two students is one row on the instructor's feed, from the side that took the delivery
//   S5  on a relay that says nothing of presence a student sends none, and the dashboard says it is updating every 4 seconds
//   S6  presence is not the game: two thousand hostile presence frames change nothing in a student's run, and make no classmate
//   S7  what arrives before the module has loaded waits for it, in a queue with a bound
//   S8  leaving a room clears the table, the queue and the pending word of where a student was
//   S9  a student whose connection drops is "left" and, when it is back, "back", and says where it is again without being asked
//   S10 the shell tells the session what the engine did, and what is told is the engine's own event
// The relay tests need `npm install` in server/ (skipped without it). Run: node --test tests/presence-session.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session, Clock } from '../js/session.js';
import { ZONES, EVENTS } from '../js/config.js';
import { instructorParts } from '../js/ui/instructor.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = !existsSync(join(ROOT, 'server/node_modules/ws')) && 'run npm install in server/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, ms = 6000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) assert.fail(`timed out waiting for ${what}`); await sleep(10); } };
const live = [];
async function startRelay(env = {}) {
  const { createRelay } = await import('../server/relay.mjs');
  const relay = createRelay({ env: { PORT: '0', ...env }, log: () => {} });
  const port = await relay.listen(0, '127.0.0.1');
  return Object.assign(relay, { url: `ws://127.0.0.1:${port}` });
}
const teacher = (relay, code) => { const t = new Session(); t.pid = 'TEACH'; t.clock = new Clock({ hour: 0, paused: true }); live.push(t); t.joinRoom({ code, relay: relay.url, role: 'instructor', handle: 'Prof' }); return t; };
const student = (relay, code, pid, handle = pid) => { const s = new Session(); s.pid = pid; live.push(s); s.joinRoom({ code, relay: relay.url, role: 'student', handle }); s.startGame({ perks: ['trades', 'pro'], specialty: 'ops', handle }); return s; };
const ready = (...ss) => Promise.all(ss.map((s) => until(() => s.room.can('here') && s.presence, `${s.pid} to be welcomed and its presence loaded`)));
const done = async (relay) => { for (const s of live.splice(0)) { try { s.leaveRoom(); } catch { /* closed */ } } await relay.close(); };

test('S1: a student\'s district and what they are doing reach the instructor\'s table; a student\'s own session does not keep the room\'s table', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const t = teacher(relay, 'PS01'), a = student(relay, 'PS01', 'ADA', 'Ada'), b = student(relay, 'PS01', 'BO', 'Bo');
    await ready(t, a, b);
    a.setHere(5, 'play'); b.setHere(0, 'academy');
    await until(() => t.presence.members.get('ADA')?.z === 5 && t.presence.members.get('BO')?.s === 'academy', 'both students to be placed');
    const k = t.presence.counts();
    assert.deepEqual([k.here, k.play, k.academy, k.zones[5]], [2, 1, 1, 1]);
    assert.equal(t.presence.members.get('ADA').handle, 'Ada');
    assert.deepEqual(t.presence.feed.map((r) => r.kind).sort(), ['joined', 'joined'], 'two hellos, two rows');
    a.setHere(5, 'away');
    await until(() => t.presence.counts().away === 1, 'the away state');
    assert.equal(t.presence.counts().zones[5], 0, 'a student who is away stands in no district');
    assert.equal(b.presence.members.size, 0, 'a student\'s session ignores what the room says of where the others are');
    assert.equal(a.presence.members.size, 0);
    t.setHere(3, 'play'); await sleep(150);
    assert.equal(a.presence.members.size, 0, 'the instructor says nothing of where it is (it is not a figure in the world)');
  } finally { await done(relay); }
});

test('S2: a student who changes district many times in a second says it once or twice, and the last place stands', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const t = teacher(relay, 'PS02'), a = student(relay, 'PS02', 'ADA', 'Ada');
    await ready(t, a);
    let n = 0; t.on((type) => { if (type === 'presence') n++; });
    for (let i = 1; i <= 30; i++) a.setHere(1 + (i % 15), 'play');
    a.setHere(9, 'play');
    await until(() => t.presence.members.get('ADA')?.z === 9, 'the last district to stand', 4000);
    await sleep(1300);
    assert.equal(t.presence.members.get('ADA').z, 9);
    assert.ok(n >= 1 && n <= 3, `the instructor heard ${n} changes of 31`);
    a.setHere(9, 'play'); await sleep(200);
    assert.equal(a._hereSent.z, 9, 'saying the same again is nothing');
  } finally { await done(relay); }
});

test('S3: an engine event becomes an act (a district opened, a shock); an event that is not news sends nothing; a flood of events is held to a few', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const t = teacher(relay, 'PS03'), a = student(relay, 'PS03', 'ADA', 'Ada');
    await ready(t, a);
    a.reportEvent({ type: 'zone', id: 5, day: 3 });
    await until(() => t.presence.feed.some((r) => r.kind === 'zone'), 'the district row');
    const row = t.presence.feed.find((r) => r.kind === 'zone');
    assert.deepEqual([row.text, row.handle, row.pid], [`opened ${ZONES[5].name}`, 'Ada', 'ADA']);
    assert.equal(typeof row.hour, 'number', 'with the game hour it happened at');
    a.reportEvent({ type: 'buy', zone: 1 }); a.reportEvent({ type: 'level', level: 2 }); a.reportEvent({ type: 'day', day: 4 });
    a.reportEvent({ type: 'shock', kind: 'fed' });
    await until(() => t.presence.feed.some((r) => r.kind === 'shock'), 'the shock row');
    assert.equal(t.presence.feed[0].text, `felt a shock: ${EVENTS.fed.name}`);
    assert.deepEqual(t.presence.feed.map((r) => r.kind), ['shock', 'zone', 'joined'], 'nothing was sent for a purchase, a level or a day');
    // a flood: the page holds itself to a few (the relay would hold it to ten): counted where it is sent, so the relay's own limit cannot stand in for the page's
    const realSend = a.room.send.bind(a.room); let sentActs = 0; a.room.send = (m) => { if (m.t === 'act') sentActs++; return realSend(m); };
    for (let i = 0; i < 40; i++) a.reportEvent({ type: 'milestone', n: 1 });
    await sleep(600);
    assert.ok(sentActs >= 1 && sentActs <= 6, `${sentActs} of 40 milestones were sent (eight in five seconds, two of them already used)`);
    const n = t.presence.feed.filter((r) => r.kind === 'milestone').length;
    assert.ok(n >= 1 && n <= 8, `${n} of 40 milestones got through`);
    t.reportEvent({ type: 'zone', id: 2 }); await sleep(150);
    assert.equal(t.presence.feed.filter((r) => r.kind === 'zone').length, 1, 'an instructor reports nothing to itself');
  } finally { await done(relay); }
});

test('S4: a swap between two students is one row on the instructor\'s feed, from the side that took the delivery', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const t = teacher(relay, 'PS04'), a = student(relay, 'PS04', 'ADA', 'Ada'), b = student(relay, 'PS04', 'GRACE', 'Grace');
    await ready(t, a, b);
    await until(() => a.roster().some((r) => r.pid === 'GRACE' && !r.npc), 'a to see Grace');
    const bike = b.game._mk(b.game.s, 'bike', { zone: 1, basis: 9 }); b.game.s.assets.push(bike); b._sendSnap(true);
    await until(() => a.roster().find((r) => r.pid === 'GRACE')?.inventory.some((x) => x.cls === 'bike'), 'a to see the bike');
    const want = a.roster().find((r) => r.pid === 'GRACE').inventory.find((x) => x.cls === 'bike');
    a.game.s.cash += 100;
    const fair = a.propose({ to: 'GRACE', giveIds: [], giveCash: Math.round(want.fmv), want: { assets: [want], cash: 0 } });
    assert.ok(fair.ok, fair.msg);
    await until(() => b.incoming.length === 1, 'the offer to arrive');
    assert.ok(b.acceptIncoming(b.incoming[0].offer.id).ok);
    await until(() => a.game.s.assets.some((x) => x.cls === 'bike'), 'the swap to complete');
    await until(() => t.presence.feed.some((r) => r.kind === 'swap'), 'the swap row');
    await sleep(300);
    const rows = t.presence.feed.filter((r) => r.kind === 'swap');
    assert.equal(rows.length, 1, 'one row for one swap');
    assert.deepEqual([rows[0].pid, rows[0].handle, rows[0].text], ['ADA', 'Ada', 'swapped with Grace']);
  } finally { await done(relay); }
});

test('S5: on a relay that says nothing of presence a student sends none, and the dashboard says it is updating every 4 seconds', { skip: SKIP, timeout: 30000 }, async () => {
  const { WebSocketServer } = createRequire(join(ROOT, 'server/package.json'))('ws');
  const frames = [], wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((r) => wss.on('listening', r));
  wss.on('connection', (sock) => sock.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch { /* not ours */ } }));
  try {
    const url = `ws://127.0.0.1:${wss.address().port}`;
    const a = new Session(); a.pid = 'ADA'; live.push(a);
    a.joinRoom({ code: 'PS05', relay: url, role: 'student', handle: 'Ada' });
    a.startGame({ perks: ['trades', 'pro'], specialty: 'ops', handle: 'Ada' });
    await until(() => a.room.state === 'open' && frames.some((f) => f.t === 'hello'), 'the relay to hear the hello');
    a.setHere(5, 'play'); a.reportEvent({ type: 'zone', id: 5 }); a.reportEvent({ type: 'insolvent' });
    await sleep(1300);
    assert.equal(a.room.can('here'), false);
    assert.deepEqual(frames.filter((f) => f.t === 'here' || f.t === 'act'), [], 'nothing the relay would not know what to do with');
    assert.ok(frames.some((f) => f.t === 'hello') && frames.some((f) => f.t === 'snap'), 'everything else is as it was');
    const t = new Session(); t.pid = 'TEACH'; live.push(t);
    t.joinRoom({ code: 'PS05', relay: url, role: 'instructor', handle: 'Prof' });
    await until(() => t.room.state === 'open', 'the instructor\'s room');
    const html = instructorParts(t, {}).live;
    assert.match(html, /Updates every 4 s/);
    assert.doesNotMatch(html, />Live</, 'it does not say Live when it is not');
  } finally { for (const s of live.splice(0)) { try { s.leaveRoom(); } catch { /* closed */ } } for (const c of wss.clients) c.terminate(); await new Promise((r) => wss.close(r)); }
});

test('S6: presence is not the game: two thousand hostile presence frames change nothing in a student\'s run, and make no classmate', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const a = student(relay, 'PS06', 'ADA', 'Ada');
    await until(() => a.room.can('here') && a.presence, 'the welcome');
    a.game.s.cash += 50; a.game.advanceTo(30);
    const before = JSON.stringify(a.game.s), peers = a.peers.size, cohort = a.cohort.peers.size;
    let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648, pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    for (let i = 0; i < 2000; i++) {
      const m = { t: pick(['here', 'act']), z: pick([0, 1, 5, 16, 99, 1e9, -3, '2', null]), s: pick(['play', 'away', 'academy', 'zzz', '', 7]), k: pick(['zone', 'swap', 'shock', 'exit', 'x', 5]), v: pick([1, -1e13, NaN, 'x', 2]), d: pick(['fed', 'Bo', 'x'.repeat(80), { a: 1 }]), h: pick([0, 99999, -1]), handle: pick(['Eve', '<img src=x onerror=alert(1)>', 5]), from: pick(['EVE', 'MAL', 'ADA', 'NPC-PARTNER', 'SYN-1', '__proto__', 'x'.repeat(60)]), role: pick(['student', 'instructor', 'x']), age: pick([undefined, 5, 1e12]) };
      a._onMsg(m);
    }
    assert.equal(JSON.stringify(a.game.s), before, 'the run is byte for byte what it was');
    assert.equal(a.peers.size, peers, 'a here or an act makes no classmate'); assert.equal(a.cohort.peers.size, cohort);
    assert.equal(a.presence.members.size, 0, 'and a student keeps no table of them');
    assert.equal({}.polluted, undefined);
    // the same on the instructor's side: whatever the table holds, it is bounded and holds only what passed
    const t = teacher(relay, 'PS06');
    await until(() => t.presence, 'the instructor\'s module');
    for (let i = 0; i < 2000; i++) t._onMsg({ t: pick(['here', 'act', 'hello', 'bye']), z: pick([0, 5, 1e9, '2']), s: pick(['play', 'zzz', 7]), k: pick(['zone', 'x']), handle: pick(['Eve', 5]), from: pick(['E1', 'E2', 'E3', 'E4']), role: 'student' });
    assert.ok(t.presence.members.size <= 4 && t.presence.feed.length <= 100);
  } finally { await done(relay); }
});

test('S7: what arrives before the module has loaded waits for it, in a queue with a bound', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const t = new Session(); t.pid = 'TEACH'; live.push(t);
    t.joinRoom({ code: 'PS07', relay: relay.url, role: 'instructor', handle: 'Prof' });
    assert.equal(t.presence, null, 'the module is a promise, not yet a table');
    t._onMsg({ t: 'here', z: 4, s: 'play', handle: 'Zed', from: 'ZED', role: 'student' });
    for (let i = 0; i < 1000; i++) t._onMsg({ t: 'here', z: 1, s: 'play', handle: 'P' + i, from: 'P' + i, role: 'student' });
    assert.ok(t._presQ.length >= 450 && t._presQ.length <= 600, `${t._presQ.length} waiting: room for a replay of a room of 400 and some more, and no more than that`);
    await until(() => t.presence, 'the module');
    assert.equal(t.presence.members.get('ZED')?.z, 4, 'the first frame was kept, in order');
    assert.ok(t.presence.members.size >= 450 && t.presence.members.size <= 600 && t._presQ.length === 0, 'and the queue is empty once it has been applied');
  } finally { await done(relay); }
});

test('S8: leaving a room clears the table, the queue and the pending word of where a student was', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const t = teacher(relay, 'PS08'), a = student(relay, 'PS08', 'ADA', 'Ada');
    await ready(t, a);
    a.setHere(2, 'play'); a.setHere(3, 'play'); a.setHere(4, 'play'); // the second and third wait for the trailing word
    assert.ok(a._hereTimer, 'a word is waiting');
    a.leaveRoom(); t.leaveRoom();
    assert.equal(a._hereTimer, 0); assert.equal(a.presence, null); assert.equal(t.presence, null); assert.deepEqual(t._presQ, []);
    assert.equal(a._hereSent, null, 'and what was said is forgotten: a new room is told afresh');
  } finally { await done(relay); }
});

test('S9: a student whose connection drops is "left" and, when it is back, "back", and says where it is again without being asked', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const t = teacher(relay, 'PS09'), a = student(relay, 'PS09', 'ADA', 'Ada');
    await ready(t, a);
    a.setHere(6, 'play');
    await until(() => t.presence.members.get('ADA')?.z === 6, 'the district');
    a.room.transport.ws.close();
    await until(() => t.presence.members.get('ADA')?.online === false, 'the instructor to be told the student has gone');
    assert.equal(t.presence.counts().here, 0);
    await until(() => t.presence.members.get('ADA')?.online === true && t.presence.members.get('ADA').z === 6, 'the student to be back, in the same district', 9000);
    assert.deepEqual(t.presence.feed.map((r) => r.kind).slice(0, 3), ['back', 'left', 'joined']);
  } finally { await done(relay); }
});

test('S11: a room object with no `can` (a stand-in, as other tests build) is promised nothing and nothing throws', () => {
  const S = new Session(); S.pid = 'ADA'; S.mode = 'student';
  const sent = []; S.room = { kind: 'relay', state: 'open', send: (m) => sent.push(m), close() {}, on() {} };
  S.startGame({ perks: ['trades', 'pro'], specialty: 'ops', handle: 'Ada' });
  assert.doesNotThrow(() => { S.setHere(5, 'play'); S.setAway(true); S.setAway(false); S._sendAct({ k: 'swap', d: 'Bo' }); S.reportEvent({ type: 'zone', id: 5 }); });
  assert.deepEqual(sent.filter((m) => m.t === 'here' || m.t === 'act'), [], 'nothing was promised, so nothing was said');
});

test('S12: an instructor whose connection drops and returns does not go on counting a student who left while it was away', { skip: SKIP, timeout: 40000 }, async () => {
  const relay = await startRelay();
  try {
    const t = teacher(relay, 'PS12'), a = student(relay, 'PS12', 'ADA', 'Ada'), b = student(relay, 'PS12', 'BO', 'Bo');
    await ready(t, a, b);
    a.setHere(5, 'play'); b.setHere(2, 'play');
    await until(() => t.presence.members.get('ADA')?.z === 5 && t.presence.members.get('BO')?.z === 2, 'both students to be placed');
    t.room.transport.ws.close();                                   // the instructor's connection drops
    await until(() => !t.room.can('here'), 'the promise to be forgotten');
    a.leaveRoom();                                                 // Ada leaves while it is away: the goodbye is lost to it
    await until(() => t.room.can('here') && t.room.state === 'open', 'the instructor to be back', 12000);
    await until(() => t.presence.members.get('BO')?.online === true, 'Bo to be replayed');
    await sleep(300);
    assert.equal(t.presence.members.get('ADA').online, false, 'Ada is gone');
    assert.deepEqual([t.presence.counts().here, t.presence.counts().zones[5], t.presence.counts().zones[2]], [1, 0, 1]);
    assert.match(instructorParts(t, {}).live, /1 student here: 1 playing/);
  } finally { await done(relay); }
});

test('S13: a lazy import that fails is tried again, and the table arrives', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const t = new Session(); t.pid = 'TEACH'; live.push(t);
    let tries = 0; const real = t._importPresence.bind(t);
    t._importPresence = () => (++tries === 1 ? Promise.reject(new Error('offline')) : real());
    t.joinRoom({ code: 'PS13', relay: relay.url, role: 'instructor', handle: 'Prof' });
    await until(() => t.presence, 'the table, after a second try', 8000);
    assert.ok(tries >= 2, `${tries} tries`);
    const s = new Session(); s.pid = 'STU'; live.push(s); let never = 0;
    s._importPresence = () => { never++; return Promise.reject(new Error('still offline')); };
    s.joinRoom({ code: 'PS13', relay: relay.url, role: 'student', handle: 'Stu' });
    await sleep(4500);
    assert.ok(never >= 2 && never <= 4, `it gives up after a few tries, ${never}`);
    assert.equal(s.presence, null);
  } finally { await done(relay); }
});

test('S14: the Debrief says so, a tab that loads hidden is away, and Start over forgets where the student was', () => {
  const S = new Session(); S.setHere(5, 'play');
  assert.deepEqual(S._here, { z: 5, s: 'play' });
  S.reset();
  assert.deepEqual(S._here, { z: 0, s: '' }, 'a new run, or another room, is not told the old place');
  globalThis.document = { hidden: true };
  try { assert.equal(new Session()._away, true, 'a tab that is opened in the background has not said it is away yet: it is'); } finally { delete globalThis.document; }
  assert.equal(new Session()._away, false);
  const main = readFileSync(join(ROOT, 'js/main.js'), 'utf8');
  assert.match(main, /debrief\(\) \{[^}]*S\.setHere\(0, 'debrief'\)/s, 'the Debrief screen says so');
});

test('S15: a listener that throws on a presence event cannot cancel the transport\'s reconnect', { skip: SKIP, timeout: 40000 }, async () => {
  const relay = await startRelay();
  try {
    const a = student(relay, 'PS15', 'ADA', 'Ada');
    await until(() => a.room.can('here') && a.presence, 'the welcome');
    a.on((type) => { if (type === 'presence') throw new Error('a listener broke'); });
    a.room.transport.ws.close();
    await until(() => !a.room.can('here'), 'the promise to be forgotten');
    await until(() => a.room.state === 'open' && a.room.can('here'), 'the reconnect and a new welcome', 12000);
    assert.equal(relay.rooms.get('PS15').clients.size, 1, 'the relay has her again');
  } finally { await done(relay); }
});

test('S10: the shell tells the session what the engine did, and what is told is the engine\'s own event; the screens say where the student is', () => {
  const shell = readFileSync(join(ROOT, 'js/ui/shell.js'), 'utf8');
  assert.match(shell, /g\(\)\.onEvent = \(evt\) => \{[^}]*S\.reportEvent\(evt\)/s, 'the game screen hands every engine event to the session, which decides what is news');
  assert.match(shell, /S\.setHere\(U\.zone, 'play'\)/, 'and says which district the student is in whenever the screen is drawn');
  const main = readFileSync(join(ROOT, 'js/main.js'), 'utf8');
  assert.match(main, /setHere\(0, 'academy'\)/, 'the Academy says so');
  assert.match(main, /visibilitychange[\s\S]{0,400}S\.setAway\(/, 'and a hidden tab says it is away');
});
