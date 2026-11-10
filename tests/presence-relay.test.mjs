// The relay's presence channel (docs/ARCHITECTURE.md, "Presence": relay version 2). Node clients against a relay in this process, on 127.0.0.1 only; nothing leaves the machine.
//   P1  a client that connects with `&v=2` is welcomed (what the relay can do); one that does not hears no welcome and none of the new frames, and cannot use them
//   P2  a `here` (where a member is, and what it is doing) goes to the other version 2 members of its room, stamped with the sender and role by the relay; never back to the sender, never to another room
//   P3  a `here` is rebuilt from a whitelist: a wrong type, a state that is not a short lowercase word, a frame over the limit is dropped; the alias is cleaned and cut; nothing else rides along
//   P4  the relay keeps the last `here` of each connected member and replays them, with their age, to a version 2 joiner: not a member who has left, not to a client that did not ask for version 2
//   P5  a `here` that says what the last one said is not sent again; a change is
//   P6  an `act` (what a student just did) goes to the instructor's seat alone: not to a classmate, not back to the sender, not kept for an instructor who comes later, not from the instructor, not from or to version 1
//   P7  an `act` is rebuilt from a whitelist, the same way
//   P8  presence is rate limited a socket (2 a second, a burst of 10): the rest is dropped, and the refill is the rate
//   P9  what the relay remembers of presence is bounded (MAX_HERE_BYTES) and given back when a member leaves
//   P10 hostile shapes are dropped without ending the connection or the service
//   P12 the alias on a `here` or an `act` is the one the member gave in its hello, whatever the frame says
//   P13 the relay's strip of unseen characters is the client's (every code point, both ways)
//   P14 the instructor's switch (`presence` in its clock) is kept: under online a student is told of the others without their districts, under off not at all, the instructor always in full; a change replays; only the seat sets it
//   P11 the client: `Room` asks for version 2, keeps the welcome to itself and says what the relay can do (`caps`, `can`), sends no presence where it was not promised, and forgets the promise when the connection drops
// The relay tests need `npm install` in server/ (skipped without it). Run: node --test tests/presence-relay.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Room } from '../js/net.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = !existsSync(join(ROOT, 'server/node_modules/ws')) && 'run npm install in server/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, ms = 5000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) assert.fail(`timed out waiting for ${what}`); await sleep(10); } };
const keyOf = (pid) => ('key-' + pid).replace(/[^A-Za-z0-9_-]/g, '_').padEnd(16, '0');
const NUL = String.fromCodePoint(0), RLO = String.fromCodePoint(0x202e); // a control character and a right-to-left override: written as code points so that nothing that handles this file can turn them into the characters themselves

async function startRelay(env = {}, clock = null) {
  const { createRelay } = await import('../server/relay.mjs');
  const relay = createRelay({ env: { PORT: '0', ...env }, now: clock ? () => clock.t : Date.now, log: () => {} });
  const port = await relay.listen(0, '127.0.0.1');
  return Object.assign(relay, { port });
}
/** A client of the relay: what it heard (`got`), the code it was closed with (`closed`, null while open), `v` the version it asks for (0: none, as a client of before this change). */
function dial(relay, room, pid, { role = 'student', v = 2, handle = null } = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/?room=${room}&pid=${pid}&key=${keyOf(pid)}&role=${role}${v ? '&v=' + v : ''}`);
  const c = { ws, pid, got: [], closed: null, send: (m) => ws.send(JSON.stringify(m)), raw: (s) => ws.send(s), types: () => c.got.map((m) => m.t), of: (t) => c.got.filter((m) => m.t === t) };
  ws.addEventListener('message', (e) => { try { c.got.push(JSON.parse(e.data)); } catch { /* not ours */ } });
  ws.addEventListener('close', (e) => { c.closed = e.code; });
  if (handle !== null) ws.addEventListener('open', () => c.send({ t: 'hello', handle })); // the alias a member gives is the one its `here` and `act` carry
  c.ready = until(() => ws.readyState === 1 || c.closed !== null, `${pid} to open`);
  return c;
}
/** Waits until each of `others` has heard everything the relay had in flight from `from`: frames of one sender are handled and sent in order, so a hello that has arrived comes after every frame `from` sent before it. */
let sentinel = 0;
async function settle(from, ...others) { const n = 1e6 + ++sentinel; from.send({ t: 'hello', n }); for (const o of others) await until(() => o.got.some((m) => m.t === 'hello' && m.n === n), `${o.pid} to hear ${from.pid}'s hello ${n}`); }
const welcomed = (...cs) => Promise.all(cs.map((c) => until(() => c.of('welcome').length > 0, `${c.pid} to be welcomed`)));
const close = (...cs) => { for (const c of cs) { try { c.ws.close(); } catch { /* closed */ } } };

test('P1: a client that asks for version 2 is welcomed with what the relay can do; one that does not hears no welcome and none of the new frames, and cannot use them', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const a = dial(relay, 'PRES1', 'PC-A'), old = dial(relay, 'PRES1', 'PC-OLD', { v: 0 });
    await Promise.all([a.ready, old.ready]); await welcomed(a);
    assert.deepEqual(a.of('welcome'), [{ t: 'welcome', v: 2, caps: ['here', 'act'] }]);
    assert.equal(a.got[0].t, 'welcome', 'it is the first thing a version 2 client hears');
    a.send({ t: 'here', z: 3, s: 'play', handle: 'Ada' });
    await settle(a, old);
    assert.deepEqual(old.types(), ['hello'], 'a client that did not ask for version 2 hears the hello that follows and nothing else: no welcome, no here');
    old.send({ t: 'here', z: 9, s: 'play', handle: 'Old' }); old.send({ t: 'act', k: 'swap' });
    await settle(old, a);
    assert.deepEqual(a.of('here'), [], 'a here from a client that did not ask for version 2 is not forwarded');
    close(a, old);
  } finally { await relay.close(); }
});

test('P2: a here goes to the other version 2 members of its room, stamped by the relay with the sender and the role, never back to the sender and never to another room', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const s1 = dial(relay, 'PRES2', 'PC-S1', { handle: 'Ada' }), s2 = dial(relay, 'PRES2', 'PC-S2'), t = dial(relay, 'PRES2', 'PC-T', { role: 'instructor' });
    const o1 = dial(relay, 'PRES2B', 'PC-O1'), o2 = dial(relay, 'PRES2B', 'PC-O2');
    await Promise.all([s1, s2, t, o1, o2].map((c) => c.ready)); await welcomed(s1, s2, t, o1, o2);
    s1.send({ t: 'here', z: 5, s: 'play', handle: 'Ada', from: 'PC-FAKE', role: 'instructor' }); // (who it is from and in what role is the connection's word, never the message's)
    await settle(s1, s2, t); await settle(o2, o1);
    const want = { t: 'here', z: 5, s: 'play', handle: 'Ada', from: 'PC-S1', role: 'student' };
    assert.deepEqual(s2.of('here'), [want]); assert.deepEqual(t.of('here'), [want]);
    assert.deepEqual(s1.of('here'), [], 'not back to the sender'); assert.deepEqual(o1.of('here'), [], 'not to another room');
    t.send({ t: 'here', z: 0, s: 'dash' });
    await settle(t, s1, s2);
    assert.deepEqual(s1.of('here'), [{ t: 'here', z: 0, s: 'dash', handle: '', from: 'PC-T', role: 'instructor' }], 'the instructor may say where it is, and the role is the seat\'s');
    close(s1, s2, t, o1, o2);
  } finally { await relay.close(); }
});

test('P3: a here is rebuilt from a whitelist: what is not a whole district number and a short lowercase state, or is over the limit, is dropped; the alias (from the hello) is cleaned and cut; nothing else rides along', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const a = dial(relay, 'PRES3', 'PC-A'), b = dial(relay, 'PRES3', 'PC-B');
    await Promise.all([a.ready, b.ready]); await welcomed(a, b);
    const bad = [
      { t: 'here', z: '5', s: 'play' }, { t: 'here', z: 5.5, s: 'play' }, { t: 'here', z: -1, s: 'play' }, { t: 'here', z: 100, s: 'play' }, { t: 'here', z: null, s: 'play' }, { t: 'here', s: 'play' },
      { t: 'here', z: 5 }, { t: 'here', z: 5, s: 'Play' }, { t: 'here', z: 5, s: 'two words' }, { t: 'here', z: 5, s: 'x'.repeat(13) }, { t: 'here', z: 5, s: 7 }, { t: 'here', z: 5, s: '' },
      { t: 'here', z: 5, s: 'play', pad: 'x'.repeat(600) }, // a frame over 512 bytes
    ];
    for (const m of bad) a.send(m);
    await settle(a, b);
    assert.deepEqual(b.of('here'), [], 'none of them was forwarded');
    const alias = (handle, z) => { a.send({ t: 'hello', handle }); a.send({ t: 'here', z, s: 'play', x: 1, snap: { nw: 5 }, to: 'PC-C' }); };
    alias('A' + NUL + 'd' + RLO + 'a\n ', 7); alias({ x: 1 }, 8); alias('é'.repeat(40), 9); alias('ab' + '\u{1F600}'.repeat(30), 10);
    await settle(a, b);
    const got = b.of('here');
    assert.deepEqual(got[0], { t: 'here', z: 7, s: 'play', handle: 'Ada', from: 'PC-A', role: 'student' }, 'control and direction characters go, the alias is trimmed, no other field is kept, an address in it is ignored');
    assert.equal(got[1].handle, 'Ada', 'a hello whose alias is not text changes nothing: the member keeps the one it had');
    assert.equal(got[2].handle, 'é'.repeat(24), 'an alias is cut at 24 characters');
    assert.equal([...got[3].handle].length, 24, 'and by characters, not by halves of one');
    assert.equal(got.length, 4);
    close(a, b);
  } finally { await relay.close(); }
});

test('P4: the relay keeps the last here of each connected member and replays them, with their age, to a version 2 joiner: not a member who has left, not to a client that did not ask for it', { skip: SKIP, timeout: 30000 }, async () => {
  const clock = { t: 1e12 }, relay = await startRelay({}, clock);
  try {
    const s1 = dial(relay, 'PRES4', 'PC-S1', { handle: 'Ada' }), s2 = dial(relay, 'PRES4', 'PC-S2', { handle: 'Bo' });
    await Promise.all([s1.ready, s2.ready]); await welcomed(s1, s2);
    s1.send({ t: 'here', z: 3, s: 'play', handle: 'Ada' }); s1.send({ t: 'here', z: 5, s: 'play', handle: 'Ada' }); s2.send({ t: 'here', z: 1, s: 'draft', handle: 'Bo' });
    await settle(s1, s2); await settle(s2, s1);
    clock.t += 1500;
    const late = dial(relay, 'PRES4', 'PC-L'), lateOld = dial(relay, 'PRES4', 'PC-LOLD', { v: 0 });
    await Promise.all([late.ready, lateOld.ready]);
    await until(() => late.of('here').length === 2, 'the two heres to be replayed');
    assert.equal(late.got[0].t, 'welcome', 'the welcome comes before the replay');
    const by = Object.fromEntries(late.of('here').map((m) => [m.from, m]));
    assert.deepEqual(by['PC-S1'], { t: 'here', z: 5, s: 'play', handle: 'Ada', from: 'PC-S1', role: 'student', age: 1500 }, 'the last one, and how old it is');
    assert.deepEqual(by['PC-S2'], { t: 'here', z: 1, s: 'draft', handle: 'Bo', from: 'PC-S2', role: 'student', age: 1500 });
    await settle(s1, late, lateOld);
    assert.deepEqual(lateOld.of('here'), [], 'a client of before this change is replayed no here');
    // a member who leaves is forgotten: the next joiner is told of the one who stayed, and only of that one
    s2.ws.close(); await until(() => lateOld.of('bye').length === 1, 'the relay to say s2 has gone');
    const later = dial(relay, 'PRES4', 'PC-L2'); await later.ready; await settle(s1, later);
    assert.deepEqual(later.of('here').map((m) => m.from), ['PC-S1'], 'only the member still here is replayed (the joiners sent none)');
    close(s1, late, lateOld, later);
  } finally { await relay.close(); }
});

test('P5: a here that says what the last one said is not sent again; a change of district, state or alias is', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const a = dial(relay, 'PRES5', 'PC-A'), b = dial(relay, 'PRES5', 'PC-B');
    await Promise.all([a.ready, b.ready]); await welcomed(a, b);
    let said = null;
    for (const m of [[3, 'Ada'], [3, 'Ada'], [3, 'Ada B'], [4, 'Ada B'], [4, 'Ada B'], [3, 'Ada B']]) { if (m[1] !== said) { a.send({ t: 'hello', handle: m[1] }); said = m[1]; } a.send({ t: 'here', z: m[0], s: 'play' }); }
    await settle(a, b);
    assert.deepEqual(b.of('here').map((m) => [m.z, m.handle]), [[3, 'Ada'], [3, 'Ada B'], [4, 'Ada B'], [3, 'Ada B']]);
    close(a, b);
  } finally { await relay.close(); }
});

test('P6: an act goes to the instructor\'s seat alone: not to a classmate, not back to the sender, not kept for an instructor who comes later, not from the instructor, not from or to version 1', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const t = dial(relay, 'PRES6', 'PC-T', { role: 'instructor' }), s1 = dial(relay, 'PRES6', 'PC-S1', { handle: 'Ada' }), s2 = dial(relay, 'PRES6', 'PC-S2'), old = dial(relay, 'PRES6', 'PC-OLD', { v: 0 });
    await Promise.all([t, s1, s2, old].map((c) => c.ready)); await welcomed(t, s1, s2);
    s1.send({ t: 'act', k: 'swap', v: 42.5, d: 'Bike', h: 120, to: 'PC-S2', handle: 'Ada' });
    await settle(s1, t, s2, old);
    assert.deepEqual(t.of('act'), [{ t: 'act', k: 'swap', v: 42.5, d: 'Bike', h: 120, handle: 'Ada', from: 'PC-S1', role: 'student' }]);
    assert.deepEqual(s2.of('act'), [], 'not to the classmate it was addressed to'); assert.deepEqual(s1.of('act'), [], 'not back to the sender'); assert.deepEqual(old.of('act'), []);
    t.send({ t: 'act', k: 'swap' }); old.send({ t: 'act', k: 'swap' });
    await settle(t, s1, s2); await settle(old, t);
    assert.deepEqual(s1.of('act').concat(s2.of('act')), [], 'the instructor reports nothing to the class');
    assert.equal(t.of('act').length, 1, 'and a client that did not ask for version 2 cannot send one');
    // nothing is kept for an instructor who comes after it
    const l1 = dial(relay, 'PRES6B', 'PC-L1'), l2 = dial(relay, 'PRES6B', 'PC-L2'); await Promise.all([l1.ready, l2.ready]); await welcomed(l1, l2);
    l1.send({ t: 'act', k: 'gate', v: 5 }); await settle(l1, l2);
    const ti = dial(relay, 'PRES6B', 'PC-TI', { role: 'instructor' }); await ti.ready; await welcomed(ti); await settle(l1, ti);
    assert.deepEqual(ti.of('act'), [], 'an act is news for the seat that is there when it happens');
    // an instructor of before this change is sent none of it
    const so = dial(relay, 'PRES6C', 'PC-SO'), io = dial(relay, 'PRES6C', 'PC-IO', { role: 'instructor', v: 0 }); await Promise.all([so.ready, io.ready]); await welcomed(so);
    so.send({ t: 'act', k: 'gate', v: 5 }); await settle(so, io);
    assert.deepEqual(io.types(), ['hello'], 'an instructor that did not ask for version 2 hears no act');
    close(t, s1, s2, old, l1, l2, ti, so, io);
  } finally { await relay.close(); }
});

test('P7: an act is rebuilt from a whitelist: a kind that is a short lowercase token, a finite value and hour, a cleaned note; anything else is dropped or left out', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const t = dial(relay, 'PRES7', 'PC-T', { role: 'instructor' }), s = dial(relay, 'PRES7', 'PC-S');
    await Promise.all([t.ready, s.ready]); await welcomed(t, s);
    const bad = [{ t: 'act' }, { t: 'act', k: 'Swap' }, { t: 'act', k: 'two words' }, { t: 'act', k: 'x'.repeat(17) }, { t: 'act', k: '' }, { t: 'act', k: 5 },
      { t: 'act', k: 'swap', v: '9' }, { t: 'act', k: 'swap', v: 1e13 }, { t: 'act', k: 'swap', v: -1e13 }, { t: 'act', k: 'swap', h: -1 }, { t: 'act', k: 'swap', h: 5000 }, { t: 'act', k: 'swap', h: '3' },
      { t: 'act', k: 'swap', pad: 'x'.repeat(600) }];
    for (const m of bad) s.send(m);
    await settle(s, t);
    assert.deepEqual(t.of('act'), [], 'none of them was forwarded');
    s.send({ t: 'act', k: 'swap', v: -3, d: '  Big' + NUL + ' Bike ' + 'x'.repeat(100), h: 0.5, junk: 1, snap: { nw: 1 } });
    s.send({ t: 'act', k: 'exit', v: null, d: 7 });
    await settle(s, t);
    const got = t.of('act');
    assert.deepEqual(got[0], { t: 'act', k: 'swap', v: -3, d: 'Big Bike ' + 'x'.repeat(39), h: 0.5, handle: '', from: 'PC-S', role: 'student' }, 'a loss is a negative value; the note is cleaned and cut at 48; no other field is kept');
    assert.deepEqual(got[1], { t: 'act', k: 'exit', handle: '', from: 'PC-S', role: 'student' }, 'a value, an hour and a note are each optional');
    assert.equal(got.length, 2);
    close(t, s);
  } finally { await relay.close(); }
});

test('P8: presence is rate limited a socket (2 a second, a burst of 10): the rest is dropped, the refill is the rate, and other traffic is not touched', { skip: SKIP, timeout: 30000 }, async () => {
  const clock = { t: 1e12 }, relay = await startRelay({}, clock);
  try {
    const a = dial(relay, 'PRES8', 'PC-A'), b = dial(relay, 'PRES8', 'PC-B'), t = dial(relay, 'PRES8', 'PC-T', { role: 'instructor' });
    await Promise.all([a.ready, b.ready, t.ready]); await welcomed(a, b, t);
    const alt = (i) => ({ t: 'here', z: 1 + (i % 2), s: 'play' }); // (a change every time: none is a repeat)
    for (let i = 0; i < 40; i++) a.send(alt(i));
    await settle(a, b);
    assert.equal(b.of('here').length, 10, 'of 40 in a burst, 10 get through');
    clock.t += 2000; // two seconds: four more
    for (let i = 0; i < 10; i++) a.send(alt(i));
    await settle(a, b);
    assert.equal(b.of('here').length, 14, 'and the refill is 2 a second');
    for (let i = 0; i < 40; i++) b.send({ t: 'act', k: 'swap', v: i });
    await settle(b, t);
    assert.equal(t.of('act').length, 10, 'an act has the same limit, and its own socket\'s bucket (a flood of heres from a does not use b\'s)');
    close(a, b, t);
  } finally { await relay.close(); }
});

test('P9: what the relay remembers of presence is bounded (MAX_HERE_BYTES), a member over the bound is still heard but not kept, and the memory is given back when a member leaves', { skip: SKIP, timeout: 30000 }, async () => {
  const one = JSON.stringify({ t: 'here', z: 1, s: 'play', handle: 'Ada', from: 'PC-S1', role: 'student' }).length; // what the relay keeps of one member's here
  const relay = await startRelay({ MAX_HERE_BYTES: String(one * 2 + 10) }); // room for two
  try {
    assert.equal(relay.limits.MAX_HERE_BYTES, one * 2 + 10);
    const ms = ['PC-S1', 'PC-S2', 'PC-S3', 'PC-S4'].map((p) => dial(relay, 'PRES9', p, { handle: 'Ada' })); await Promise.all(ms.map((c) => c.ready)); await welcomed(...ms);
    for (const c of ms) c.send({ t: 'here', z: 1, s: 'play', handle: 'Ada' });
    for (const c of ms.slice(1)) await settle(c, ms[0]); await settle(ms[0], ms[1]);
    assert.equal(ms[0].of('here').length, 3, 'every here was passed on to the others');
    assert.equal(relay.rooms.get('PRES9').here.size, 2, 'two were kept');
    assert.equal(relay.stats().hereBytes, one * 2);
    const late = dial(relay, 'PRES9', 'PC-L'); await late.ready; await settle(ms[0], late);
    assert.equal(late.of('here').length, 2, 'a joiner is replayed what was kept');
    close(...ms, late); await until(() => relay.rooms.get('PRES9').clients.size === 0, 'the room to empty');
    assert.equal(relay.stats().hereBytes, 0, 'all given back');
  } finally { await relay.close(); }
});

test('P10: hostile shapes are dropped without ending the connection or the service', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const a = dial(relay, 'PRES10', 'PC-A'), b = dial(relay, 'PRES10', 'PC-B'), t = dial(relay, 'PRES10', 'PC-T', { role: 'instructor' });
    await Promise.all([a.ready, b.ready, t.ready]); await welcomed(a, b, t);
    for (const s of ['{"t":"here","z":{"a":1},"s":["play"]}', '{"t":"here","z":[1],"s":"play"}', '{"t":"act","k":{"x":1}}', '{"t":"act","k":["swap"],"v":[1]}', '[{"t":"here","z":1,"s":"play"}]', '{"t":"here"}', '{"t":"act"}', 'null',
      '{"t":"here","z":1,"s":"play","a":' + '['.repeat(100) + ']'.repeat(100) + '}', '{"t":"here","z":1,"s":"play","__proto__":{"polluted":1}}', '{"t":"here","z":1e999,"s":"play"}']) a.raw(s);
    a.ws.send(new Uint8Array([1, 2, 3]));
    await settle(a, b, t);
    assert.equal(a.ws.readyState, 1, 'the sender is still connected');
    assert.deepEqual(b.of('here').map((m) => m.z), [1], 'the one valid shape in the lot (the __proto__ rider, dropped from it) was passed on');
    assert.equal({}.polluted, undefined);
    assert.deepEqual(t.of('act'), []);
    close(a, b, t);
  } finally { await relay.close(); }
});

test('P12: the alias on a here or an act is the one the member gave in its hello, whatever the frame says: one alias for one member', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const t = dial(relay, 'PRES12', 'PC-T', { role: 'instructor' }), a = dial(relay, 'PRES12', 'PC-A', { handle: 'Ada' }), b = dial(relay, 'PRES12', 'PC-B'), c = dial(relay, 'PRES12', 'PC-C');
    await Promise.all([t, a, b, c].map((x) => x.ready)); await welcomed(t, a, b, c);
    a.send({ t: 'here', z: 5, s: 'play', handle: 'Mallory' }); a.send({ t: 'act', k: 'swap', handle: 'Mallory' });
    c.send({ t: 'here', z: 2, s: 'play', handle: 'Eve' });
    await settle(a, b, t); await settle(c, b);
    assert.equal(b.of('here').find((m) => m.from === 'PC-A').handle, 'Ada', 'the hello\'s alias, not the frame\'s');
    assert.equal(t.of('act')[0].handle, 'Ada', 'the same on an act');
    assert.equal(b.of('here').find((m) => m.from === 'PC-C').handle, '', 'a member that has not said hello has no alias: the frame\'s is not taken instead');
    a.send({ t: 'hello', handle: 'Ada B' }); a.send({ t: 'here', z: 6, s: 'play' });
    await settle(a, b);
    assert.equal(b.of('here').at(-1).handle, 'Ada B', 'a new hello is a new alias');
    a.send({ t: 'hello', handle: String.fromCodePoint(0x2800) + ' ' + String.fromCodePoint(0x3164) }); a.send({ t: 'here', z: 7, s: 'play' });
    await settle(a, b);
    assert.equal(b.of('here').at(-1).handle, '', 'an alias of nothing that can be seen is none');
    close(t, a, b, c);
  } finally { await relay.close(); }
});

test('P13: the relay strips the unseen characters the client does: every code point, both ways', { skip: SKIP, timeout: 60000 }, async () => {
  const { plain } = await import('../server/relay.mjs'), { cleanHere } = await import('../js/presence.js');
  const client = (x) => cleanHere({ z: 0, s: 'x', handle: x }).handle;
  const bad = [];
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue; // (a lone surrogate is not a character)
    const x = 'a' + String.fromCodePoint(cp) + 'b';
    if (plain(x, 24) !== client(x)) bad.push(cp.toString(16));
  }
  assert.deepEqual(bad.slice(0, 20), [], 'the relay and the client disagree about these code points (' + bad.length + ' in all)');
  for (const x of [String.fromCodePoint(0x200d), String.fromCodePoint(0xfe0f) + String.fromCodePoint(0x200c), String.fromCodePoint(0x2800, 0x3164, 0xffa0), '  ', '\u{E0041}\u{E0042}', 'Ada' + String.fromCodePoint(0x34f), '\u{1F468}\u200D\u{1F469}']) assert.equal(plain(x, 24), client(x), JSON.stringify(x));
  assert.equal(plain('\u{1F468}\u200D\u{1F469}', 24), '\u{1F468}\u200D\u{1F469}', 'an emoji sequence keeps its joiner');
  assert.equal(plain(String.fromCodePoint(0x200d), 24), '', 'a joiner alone is no alias');
});

test('P14: the instructor\'s switch is kept by the relay: under online a student is told of the others without their districts, under off not at all, the instructor always in full; a change replays; only the seat sets it', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  const view = (m) => ({ z: m.z, s: m.s, handle: m.handle, from: m.from });
  try {
    const t = dial(relay, 'PRES14', 'PC-T', { role: 'instructor', handle: 'Prof' }), a = dial(relay, 'PRES14', 'PC-A', { handle: 'Ada' }), b = dial(relay, 'PRES14', 'PC-B', { handle: 'Bo' });
    await Promise.all([t, a, b].map((x) => x.ready)); await welcomed(t, a, b);
    const clock = (presence) => t.send({ t: 'clock', hour: 0, speed: 1, paused: true, ...(presence === undefined ? {} : { presence }) });
    const hearsFrom = (c, pid) => c.of('here').filter((m) => m.from === pid).map(view);
    // everything, when the clock says nothing of it
    clock(); await settle(t, a, b);
    a.send({ t: 'here', z: 5, s: 'play' }); await settle(a, b, t);
    assert.deepEqual(hearsFrom(b, 'PC-A'), [{ z: 5, s: 'play', handle: 'Ada', from: 'PC-A' }]);
    // online: a student hears that Ada is here and what she is doing, no district; the instructor hears it all
    clock('online'); await settle(t, a, b);
    a.send({ t: 'here', z: 7, s: 'play' }); await settle(a, b, t);
    assert.deepEqual(hearsFrom(b, 'PC-A').at(-1), { z: 0, s: 'play', handle: 'Ada', from: 'PC-A' }, 'no district for a student');
    assert.deepEqual(hearsFrom(t, 'PC-A').at(-1), { z: 7, s: 'play', handle: 'Ada', from: 'PC-A' }, 'the whole of it for the instructor');
    const before = b.of('here').length;
    a.send({ t: 'here', z: 8, s: 'play' }); a.send({ t: 'here', z: 9, s: 'play' }); await settle(a, b, t);
    assert.equal(b.of('here').length, before, 'a move from one district to another is no news to a student');
    assert.equal(hearsFrom(t, 'PC-A').at(-1).z, 9, 'and the whole of it to the instructor');
    a.send({ t: 'here', z: 9, s: 'away' }); await settle(a, b);
    assert.deepEqual(hearsFrom(b, 'PC-A').at(-1), { z: 0, s: 'away', handle: 'Ada', from: 'PC-A' }, 'here or away is news');
    // a student who joins under online is replayed the same
    const c = dial(relay, 'PRES14', 'PC-C', { handle: 'Cy' }); await c.ready; await welcomed(c); await settle(t, c);
    assert.deepEqual(hearsFrom(c, 'PC-A'), [{ z: 0, s: 'away', handle: 'Ada', from: 'PC-A' }], 'a joiner is told the same as the others');
    // off: a student hears nothing of the others, the instructor everything
    clock('off'); await settle(t, a, b, c);
    const heard = b.of('here').length;
    a.send({ t: 'here', z: 3, s: 'play' }); b.send({ t: 'here', z: 4, s: 'play' }); await settle(a, b, c, t); await settle(b, a, c, t);
    assert.equal(b.of('here').length, heard, 'under off the students are told nothing');
    assert.deepEqual(hearsFrom(t, 'PC-A').at(-1), { z: 3, s: 'play', handle: 'Ada', from: 'PC-A' }); assert.deepEqual(hearsFrom(t, 'PC-B').at(-1), { z: 4, s: 'play', handle: 'Bo', from: 'PC-B' });
    const d = dial(relay, 'PRES14', 'PC-D', { handle: 'Di' }); await d.ready; await welcomed(d); await settle(t, d);
    assert.deepEqual(d.of('here'), [], 'a joiner under off is replayed nothing');
    const t2 = dial(relay, 'PRES14', 'PC-T', { role: 'instructor' }); await t2.ready; await welcomed(t2); await settle(a, t2);
    assert.deepEqual(t2.of('here').map(view).sort((x, y) => (x.from < y.from ? -1 : 1)), [{ z: 3, s: 'play', handle: 'Ada', from: 'PC-A' }, { z: 4, s: 'play', handle: 'Bo', from: 'PC-B' }], 'an instructor who comes back is told everything, districts and all');
    // a student cannot set it, and a clock with a word it does not know means everything
    a.send({ t: 'clock', hour: 0, speed: 1, paused: true, presence: 'full' }); a.send({ t: 'here', z: 6, s: 'play' }); await settle(a, b, t);
    assert.equal(b.of('here').length, heard, 'still off: only the seat\'s clock counts');
    clock('everyone'); await settle(t, a, b, c, d);
    await until(() => hearsFrom(b, 'PC-A').at(-1)?.z === 6 && hearsFrom(d, 'PC-A').at(-1)?.z === 6, 'the room to be told what it knows when the switch is lifted');
    assert.deepEqual(hearsFrom(d, 'PC-B').at(-1), { z: 4, s: 'play', handle: 'Bo', from: 'PC-B' });
    assert.ok(!b.of('here').some((m) => m.from === 'PC-B'), 'not what a member said of itself');
    close(t, t2, a, b, c, d);
  } finally { await relay.close(); }
});

test('P11: the client: Room asks for version 2, keeps the welcome to itself, says what the relay can do, sends no presence where it was not promised, and forgets the promise when the connection drops', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay(), url = `ws://127.0.0.1:${relay.port}`;
  const heardA = [], heardB = [];
  const a = new Room({ code: 'PRES11', pid: 'PC-RA', key: keyOf('PC-RA'), handle: 'Ada', role: 'student', relay: url });
  const b = new Room({ code: 'PRES11', pid: 'PC-RB', key: keyOf('PC-RB'), handle: 'Bo', role: 'student', relay: url });
  const local = new Room({ code: 'PRES11L', pid: 'PC-RL', handle: 'Lo', role: 'student' }); // a room between the tabs of one browser: no relay, so no promise
  a.on((m) => heardA.push(m)); b.on((m) => heardB.push(m));
  try {
    await until(() => a.state === 'open' && b.state === 'open' && a.can('here') && b.can('here'), 'both rooms to be welcomed');
    assert.match(a.transport.url, /[?&]v=2(&|$)/, 'the connection asks for version 2');
    assert.deepEqual([...a.caps].sort(), ['act', 'here']);
    assert.ok(!heardA.some((m) => m.t === 'welcome'), 'the welcome is the transport\'s: no handler hears it');
    a.send({ t: 'hello' }); a.send({ t: 'here', z: 4, s: 'play' }); // (a Room puts its handle on everything it sends: the hello is where the relay takes the alias from)
    await until(() => heardB.some((m) => m.t === 'here'), 'b to hear a\'s here');
    const m = heardB.find((x) => x.t === 'here');
    assert.deepEqual([m.z, m.s, m.from, m.handle, m.role], [4, 'play', 'PC-RA', 'Ada', 'student']);
    // where nothing was promised, presence is not sent (the relay of before this change would only drop it), and everything else is as it was
    assert.equal(local.can('here'), false); assert.equal(local.caps.size, 0);
    const sent = []; local.transport.send = (x) => sent.push(x);
    local.send({ t: 'here', z: 1, s: 'play' }); local.send({ t: 'act', k: 'swap' }); assert.deepEqual(sent, [], 'no presence without the promise');
    local.send({ t: 'hello' }); assert.equal(sent.length, 1, 'other traffic is not held back');
    // a dropped connection forgets what was promised until the relay says it again
    a.transport.ws.close();
    await until(() => a.caps.size === 0, 'the promise to be forgotten when the connection drops');
    await until(() => a.can('here') && a.state === 'open', 'the welcome again after the reconnect', 8000);
    assert.ok(!heardA.some((x) => x.t === 'welcome'), 'and still no handler hears it');
  } finally { a.close(); b.close(); local.close(); await relay.close(); }
});
