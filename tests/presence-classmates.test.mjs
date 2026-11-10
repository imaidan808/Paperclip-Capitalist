// What a student sees of the others, and the instructor's switch (docs/ARCHITECTURE.md, "Presence"): Session.classmates() and figures(), names that are never taken from a `here`, and `presence: full | online | off` in the class clock.
//   K1  the clock carries the switch, checked: a word of the three, else none; a clock without it means full
//   K2  a student sees the classmates who are online, by the alias their hello and snapshot gave, never the one a `here` says
//   K3  the switch: full shows districts, online shows who is here and no district, off shows nothing; students obey, a clock without the field puts it back, leaving a room puts it back
//   K4  students go on sending where they are in every mode (the instructor's panel needs it): the switch governs what a student SEES
//   K5  only a student who is playing in a district is a figure, and only when everything is shown
//   K6  the instructor's dashboard has the control, only where there is something to switch
//   K2b a name is the alias the hello gave, whatever a here says, with no relay in between (so it holds against a relay that already rewrites the alias)
//   K7  a student whose connection blinked does not keep a classmate who left meanwhile: no row in the roster, no figure in the world
//   K8  and sees those who are still there again, and the relay is told who they are again (once, not at the first welcome)
//   K9  only the instructor's clock sets the switch, with no relay in between
//   K10 the control is not part of the live panel (a repaint never writes over a panel that holds the focused select)
//   K11 the instructor's session says when the switch changes, so that the page can write it down at once
// The relay tests need `npm install` in server/ (skipped without it). Run: node --test tests/presence-classmates.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session, Clock } from '../js/session.js';
import { cleanClock } from '../js/cohort.js';
import { instructorParts, liveHTML, presenceHTML } from '../js/ui/instructor.js';
import { Presence } from '../js/presence.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = !existsSync(join(ROOT, 'server/node_modules/ws')) && 'run npm install in server/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, ms = 6000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) assert.fail(`timed out waiting for ${what}`); await sleep(10); } };
const live = [];
async function startRelay() {
  const { createRelay } = await import('../server/relay.mjs');
  const relay = createRelay({ env: { PORT: '0' }, log: () => {} });
  const port = await relay.listen(0, '127.0.0.1');
  return Object.assign(relay, { url: `ws://127.0.0.1:${port}` });
}
const teacher = (relay, code) => { const t = new Session(); t.pid = 'TEACH'; t.clock = new Clock({ hour: 0, paused: true }); live.push(t); t.joinRoom({ code, relay: relay.url, role: 'instructor', handle: 'Prof' }); return t; };
const student = (relay, code, pid, handle = pid) => { const s = new Session(); s.pid = pid; live.push(s); s.joinRoom({ code, relay: relay.url, role: 'student', handle }); s.startGame({ perks: ['trades', 'pro'], specialty: 'ops', handle }); return s; };
const ready = (...ss) => Promise.all(ss.map((s) => until(() => s.room.can('here') && s.presence, `${s.pid} to be welcomed and its presence loaded`)));
const done = async (relay) => { for (const s of live.splice(0)) { try { s.leaveRoom(); } catch { /* closed */ } } await relay.close(); };
const base = { hour: 5, speed: 1, paused: false };

test('K1: the clock carries the switch, checked: one of three words, else none; a clock without it means full', () => {
  for (const p of ['full', 'online', 'off']) assert.equal(cleanClock({ ...base, presence: p }).presence, p);
  for (const bad of ['FULL', 'everyone', '', 5, null, {}, ['off'], 'off ']) assert.equal(cleanClock({ ...base, presence: bad }).presence, undefined, JSON.stringify(bad));
  assert.ok(cleanClock({ ...base, presence: 'nonsense' }), 'a bad word costs the clock nothing: the rest of it is believed');
  assert.equal(cleanClock(base).presence, undefined);
});

test('K2: a student sees the classmates who are online, by the alias their hello and snapshot gave, never the one a here says', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const t = teacher(relay, 'PK02'), a = student(relay, 'PK02', 'ADA', 'Ada'), b = student(relay, 'PK02', 'BO', 'Bo');
    await ready(t, a, b);
    b.setHere(3, 'play'); a.setHere(5, 'play');
    await until(() => a.classmates().length === 1 && a.classmates()[0].z === 3, 'Ada to see Bo in district 3');
    assert.deepEqual(a.classmates().map((c) => [c.pid, c.name, c.z, c.s]), [['BO', 'Bo', 3, 'play']], 'not herself, not the instructor');
    assert.equal(a.nameOf('BO'), 'Bo');
    b.room.handle = 'Mallory'; b.setHere(4, 'play');                            // a hostile page puts another name in its here
    await until(() => a.presence.members.get('BO')?.z === 4, 'the new place');
    assert.equal(a.classmates()[0].name, 'Bo', 'the name stays the one the hello and the snapshot gave');
    assert.equal(a.nameOf('PC-ABCD'), 'Founder-ABCD', 'an id with no alias is shown as the placeholder every player starts with');
    assert.equal(t.classmates().length, 0, 'the instructor has the dashboard, not a classmate list');
    b.leaveRoom();
    await until(() => a.classmates().length === 0, 'Bo to be gone');
  } finally { await done(relay); }
});

test('K3: the switch: full shows districts, online shows who is here and no district, off shows nothing; students obey, a clock without the field puts it back, leaving a room puts it back', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const t = teacher(relay, 'PK03'), a = student(relay, 'PK03', 'ADA', 'Ada'), b = student(relay, 'PK03', 'BO', 'Bo');
    await ready(t, a, b);
    b.setHere(3, 'play');
    await until(() => a.classmates().some((c) => c.z === 3), 'Bo in district 3');
    assert.equal(a.presenceMode, 'full');
    t.setPresenceMode('online');
    await until(() => a.presenceMode === 'online', 'Ada to hear the switch');
    assert.deepEqual(a.classmates().map((c) => [c.name, c.z, c.s]), [['Bo', 0, 'play']], 'who is here, and not where');
    assert.deepEqual(a.figures(), [], 'no figures');
    t.setPresenceMode('off');
    await until(() => a.presenceMode === 'off' && b.presenceMode === 'off', 'both to hear it');
    assert.deepEqual(a.classmates(), []); assert.deepEqual(a.figures(), []);
    t.setPresenceMode('bogus'); assert.equal(t.presenceMode, 'off', 'a word that is not one of the three changes nothing');
    a._adoptClock({ hour: 5, speed: 1, paused: false, age: 0 }, true);           // a clock that does not carry the field
    assert.equal(a.presenceMode, 'full', 'means everything is shown');
    t.setPresenceMode('online'); await until(() => a.presenceMode === 'online', 'online again');
    a.leaveRoom(); assert.equal(a.presenceMode, 'full', 'what a class sets belongs to the class');
  } finally { await done(relay); }
});

test('K4: students go on sending where they are in every mode: the switch governs what a student sees, and the instructor\'s panel needs it', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const t = teacher(relay, 'PK04'), a = student(relay, 'PK04', 'ADA', 'Ada');
    await ready(t, a);
    t.setPresenceMode('off');
    await until(() => a.presenceMode === 'off', 'the switch');
    a.setHere(6, 'play');
    await until(() => t.presence.members.get('ADA')?.z === 6, 'the instructor to be told');
    assert.equal(t.presence.counts().zones[6], 1);
  } finally { await done(relay); }
});

test('K5: only a student who is playing in a district is a figure, and only when everything is shown', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const t = teacher(relay, 'PK05'), me = student(relay, 'PK05', 'ME', 'Me'), a = student(relay, 'PK05', 'ADA', 'Ada'), b = student(relay, 'PK05', 'BO', 'Bo'), c = student(relay, 'PK05', 'CY', 'Cy'), d = student(relay, 'PK05', 'DI', 'Di');
    await ready(t, me, a, b, c, d);
    a.setHere(2, 'play'); b.setHere(0, 'academy'); c.setHere(4, 'away'); d.setHere(4, 'debrief'); me.setHere(1, 'play');
    await until(() => me.classmates().length === 4 && me.classmates().find((x) => x.pid === 'DI')?.s === 'debrief', 'all four to be placed');
    assert.deepEqual(me.figures().map((f) => f.pid), ['ADA'], 'one in the world: not me, not the Academy, not away, not the Debrief');
    assert.deepEqual(me.classmates().map((x) => x.name), ['Ada', 'Bo', 'Cy', 'Di'], 'by name');
  } finally { await done(relay); }
});

/** A dashboard of a live room: a relay that carries presence and a table of who is where (a stand-in, for the markup). */
function liveDashboard() {
  const S = new Session(); S.pid = 'TEACH'; S.mode = 'instructor'; S.roomInfo = { code: 'LIVE', relay: 'wss://r.example.edu', role: 'instructor' };
  S.room = { kind: 'relay', state: 'open', can: () => true, send() {}, close() {}, on() {} };
  S.presence = new (class { now() { return 0; } counts() { return { here: 0, play: 0, academy: 0, away: 0, debrief: 0, other: 0, zones: Array(17).fill(0) }; } })();
  S.presence.feed = [];
  return S;
}

test('K6: the instructor\'s dashboard has the control, only where there is something to switch, in a panel of its own, and it says what each word does', () => {
  const quiet = new Session(); quiet.mode = 'instructor'; quiet.roomInfo = { code: 'OLD', relay: '', role: 'instructor' }; quiet.room = { kind: 'local', state: 'open' };
  assert.equal(instructorParts(quiet, {}).pm, '', 'a room that cannot carry presence has nothing to switch');
  assert.doesNotMatch(instructorParts(quiet, {}).live, /data-change="presence"/);
  const S = liveDashboard();
  const html = instructorParts(S, {}).pm;
  assert.match(html, /<select id="pm" data-change="presence"/);
  assert.deepEqual([...html.matchAll(/<option value="(\w+)"( selected)?>/g)].map((m) => [m[1], !!m[2]]), [['full', true], ['online', false], ['off', false]]);
  assert.match(html, /<label for="pm"[^>]*>Students see<\/label>/);
  assert.match(html, /<option value="off">No list, no figures<\/option>/, 'it does not promise more than it does: the Market\'s Exchange and the Debrief standings still list classmates');
  assert.doesNotMatch(html, /Nothing of each other/);
  assert.match(html, /aria-describedby="pm-why"[\s\S]*<span class="sr" id="pm-why">What each student sees of the others/, 'the explanation is there for a reader and not only on hover');
  S.presenceMode = 'off'; assert.match(instructorParts(S, {}).pm, /<option value="off" selected>/);
});

test('K10: the control is not part of the live panel: a repaint never writes over a panel that holds the focused select, so in it the control would have frozen "Right now" after the instructor had used it', () => {
  const S = liveDashboard();
  assert.doesNotMatch(liveHTML(S), /<select|<input|<textarea/i, 'nothing in the live panel can take the focus away from its own repaint');
  assert.match(presenceHTML(S), /<select id="pm"/);
  assert.equal(presenceHTML(new Session()), '', 'and no panel at all where there is nothing to switch');
});

// ---- no relay in between: the frames a hostile page could send are put to the client directly
const bare = (pid = 'ADA') => { const a = new Session(); a.pid = pid; a.mode = 'student'; a.presence = new Presence({ now: () => 0 }); a.room = { kind: 'relay', can: () => true }; return a; };

test('K2b: a name is the alias the hello gave, whatever a here says, with no relay in between (a relay that rewrites the alias would hide a client that did not)', () => {
  const a = bare();
  a._onMsg({ t: 'hello', from: 'PC-BO01', role: 'student', handle: 'Bo' });
  a._onMsg({ t: 'here', from: 'PC-BO01', role: 'student', z: 3, s: 'play', handle: 'Mallory' });
  assert.deepEqual(a.classmates().map((c) => [c.name, c.z, c.s]), [['Bo', 3, 'play']]);
  a._onMsg({ t: 'here', from: 'PC-BO01', role: 'student', z: 4, s: 'play', handle: 'Mallory II' });
  assert.equal(a.classmates()[0].name, 'Bo', 'the name stays the one the hello gave');
  a._onMsg({ t: 'here', from: 'PC-CY02', role: 'student', z: 2, s: 'play', handle: 'Eve' });
  assert.equal(a.nameOf('PC-CY02'), 'Founder-CY02', 'a member that never said hello is the placeholder, not the name its here carries');
});

test('K9: only the instructor\'s clock sets the switch, and a student sees what it says: a student\'s clock does not, nor another page that claims the seat while the real instructor is heard', () => {
  const a = bare();
  a._onMsg({ t: 'hello', from: 'PC-BO01', role: 'student', handle: 'Bo' });
  a._onMsg({ t: 'here', from: 'PC-BO01', role: 'student', z: 3, s: 'play' });
  const clock = (from, role, presence) => a._onMsg({ t: 'clock', hour: 5, speed: 1, paused: false, presence, from, role });
  assert.equal(a.presenceMode, 'full');
  clock('TEACH', 'instructor', 'online');
  assert.equal(a.presenceMode, 'online', 'the instructor\'s clock is believed');
  assert.deepEqual(a.classmates().map((c) => [c.name, c.z]), [['Bo', 0]], 'who is here and not where');
  assert.deepEqual(a.figures(), []);
  clock('PC-BO01', 'student', 'off'); assert.equal(a.presenceMode, 'online', 'a student\'s clock does not set it');
  clock('PC-MAL3', 'instructor', 'off'); assert.equal(a.presenceMode, 'online', 'another page that says it is the instructor, while the real one is heard, does not either');
  clock('TEACH', 'instructor', 'off');
  assert.equal(a.presenceMode, 'off'); assert.deepEqual(a.classmates(), []);
  clock('TEACH', 'instructor', 'full');
  assert.deepEqual(a.classmates().map((c) => [c.name, c.z]), [['Bo', 3]]); assert.equal(a.figures().length, 1);
});

// ---- a connection that blinks (a student's wifi, a relay that restarts): the socket drops and the transport brings it back by itself
async function blink(s) {
  const tr = s.room.transport, ws = tr.ws;
  tr.closed = false; ws.close();
  await until(() => s.room.caps.size === 0, `${s.pid} to notice the drop`);
}
const welcomedAgain = (s) => until(() => s.room.can('here') && s.room.state === 'open', `${s.pid} to be welcomed again`, 15000);

test('K7: a student whose connection blinked does not keep a classmate who left meanwhile: no row in the roster, no figure in the world', { skip: SKIP, timeout: 60000 }, async () => {
  const relay = await startRelay();
  try {
    const t = teacher(relay, 'PK07'), a = student(relay, 'PK07', 'ADA', 'Ada'), b = student(relay, 'PK07', 'BO', 'Bo');
    await ready(t, a, b);
    b.setHere(3, 'play');
    await until(() => a.figures().length === 1, 'Ada to see Bo');
    await blink(a);
    b.leaveRoom();                                                                 // Bo's goodbye reaches nobody on Ada's side
    await until(() => t.presence.members.get('BO')?.online === false, 'the instructor to hear Bo leave');
    await welcomedAgain(a);
    await until(() => a.classmates().length === 0, 'the roster to let go of Bo');  // before the fix Bo stayed online, in district 3, for the rest of the session
    assert.deepEqual(a.figures(), []);
  } finally { await done(relay); }
});

test('K8: a student whose connection blinked sees the classmates who are still there again, and the relay is told who they are again (once, not at the first welcome)', { skip: SKIP, timeout: 60000 }, async () => {
  const relay = await startRelay();
  try {
    const t = teacher(relay, 'PK08'), a = student(relay, 'PK08', 'ADA', 'Ada'), b = student(relay, 'PK08', 'BO', 'Bo');
    await ready(t, a, b);
    b.setHere(3, 'play');
    await until(() => a.figures().length === 1, 'Ada to see Bo');
    const sent = [], send = a.room.send.bind(a.room); a.room.send = (m) => { sent.push(m.t); return send(m); };
    await blink(a);
    await welcomedAgain(a);
    await until(() => a.classmates().some((c) => c.pid === 'BO' && c.z === 3 && c.s === 'play'), 'Bo to come back with the relay\'s replay');
    assert.equal(sent.filter((x) => x === 'hello').length, 1, 'one hello after the reconnect: a relay that has restarted knows nobody');
    assert.equal(a.figures().length, 1);
  } finally { await done(relay); }
});

test('K11: the instructor\'s session says when the switch changes (so the page can write it down at once, and a reload inside five seconds does not bring the old word back), and says nothing for a word that is not one of the three', () => {
  const t = new Session(); t.pid = 'TEACH'; t.mode = 'instructor'; t.room = { kind: 'local', state: 'open', send() {}, close() {}, on() {} };
  const heard = []; t.on((type, x) => { if (type === 'switch') heard.push(x); });
  t.setPresenceMode('off'); t.setPresenceMode('bogus'); t.setPresenceMode('full');
  assert.deepEqual(heard, ['off', 'full']);
  const stu = new Session(); stu.mode = 'student'; const none = []; stu.on((type) => { if (type === 'switch') none.push(1); }); stu.setPresenceMode('off');
  assert.deepEqual(none, [], 'a student has no switch to set');
});
