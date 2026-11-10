// What a student sees of the others, and the instructor's switch (docs/ARCHITECTURE.md, "Presence"): Session.classmates() and figures(), names that are never taken from a `here`, and `presence: full | online | off` in the class clock.
//   K1  the clock carries the switch, checked: a word of the three, else none; a clock without it means full
//   K2  a student sees the classmates who are online, by the alias their hello and snapshot gave, never the one a `here` says
//   K3  the switch: full shows districts, online shows who is here and no district, off shows nothing; students obey, a clock without the field puts it back, leaving a room puts it back
//   K4  students go on sending where they are in every mode (the instructor's panel needs it): the switch governs what a student SEES
//   K5  only a student who is playing in a district is a figure, and only when everything is shown
//   K6  the instructor's dashboard has the control, only where there is something to switch
// The relay tests need `npm install` in server/ (skipped without it). Run: node --test tests/presence-classmates.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session, Clock } from '../js/session.js';
import { cleanClock } from '../js/cohort.js';
import { instructorParts } from '../js/ui/instructor.js';

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

test('K6: the instructor\'s dashboard has the control, only where there is something to switch, and it says what each word does', () => {
  const quiet = new Session(); quiet.mode = 'instructor'; quiet.roomInfo = { code: 'OLD', relay: '', role: 'instructor' }; quiet.room = { kind: 'local', state: 'open' };
  assert.doesNotMatch(instructorParts(quiet, {}).live, /data-change="presence"/, 'a room that cannot carry presence has nothing to switch');
  const S = new Session(); S.pid = 'TEACH'; S.mode = 'instructor'; S.roomInfo = { code: 'LIVE', relay: 'wss://r.example.edu', role: 'instructor' };
  S.room = { kind: 'relay', state: 'open', can: () => true, send() {}, close() {}, on() {} };
  S.presence = new (class { now() { return 0; } counts() { return { here: 0, play: 0, academy: 0, away: 0, debrief: 0, other: 0, zones: Array(17).fill(0) }; } })();
  S.presence.feed = [];
  const html = instructorParts(S, {}).live;
  assert.match(html, /<select id="pm" data-change="presence"/);
  assert.deepEqual([...html.matchAll(/<option value="(\w+)"( selected)?>/g)].map((m) => [m[1], !!m[2]]), [['full', true], ['online', false], ['off', false]]);
  assert.match(html, /<label for="pm"[^>]*>Students see<\/label>/);
  S.presenceMode = 'off'; assert.match(instructorParts(S, {}).live, /<option value="off" selected>/);
});
