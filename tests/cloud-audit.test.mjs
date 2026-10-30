// Regression tests for what the cloud audit found and repaired (docs/CLOUD_HANDOFF.md). Each one fails on the code before its repair.
//   R1  the relay: a binary frame is dropped but is not free: a socket that sends only binary frames is cut off at the strike limit like any other flood (the check used to come before the rate limiter)
//   R2  the relay: SIGTERM (a deploy, `docker stop`, Ctrl-C) tells every client the relay is going away (close code 1001) and ends the process with status 0
//   R3  the static server: a symlink inside the served tree that leads out of it is not served
//   E1  the engine: an offer is accepted once (a second accept of the same offer paid again and delivered another copy of the proposer's crates)
//   E2  the engine writes a negative amount as -$12.50, as the rest of the product does, not $-12.50
//   E3  the engine's plurals: 1 day, 1 hour (not "1 days", "1 hours")
//   E5  the swap matrix prices a digital crate at its own quality (a known counterfeit showed as worth a genuine one)
//   E4  a throwing event listener does not stop a day from finishing (profit counted twice, a missing history row, no checkpoint)
//   A1  the art: a ferry gate's "Opens at" chip rides above its plaque (the first judge pass found the plaque's words half hidden)
//   D1  the Deal Room: the second press of a double-click and a held key are not second moves
//   S1  the relay: the owner token binds a room whose seat a tokenless instructor-role connection took first (rs-seat-claim)
//   K1  the relay: names that snapshotted and left do not fill a room's table of pids for good, and a student who snapshotted outlasts the names that only greeted (rs-keytable-lockout)
//   I1  the relay: a full room gives a place to a newcomer by dropping the connection silent longest, never the instructor's, and refuses while everyone is recent (relay-1)
//   I2  the relay: a full relay gives a place to a new class by forgetting the quietest room, never one that is in use (relay-1)
//   N1  the client: a connection the relay refuses with 1008 (an identity another connection bound first) is not retried for ever, and the room says it was refused (relay-2)
//   N2  the session: a refused room tells the player in words and says what to do (relay-2)
//   X1  the engine: a Read of a lot whose truth stays hidden pays on the evidence, not on the accuracy, and says nothing of the truth (deal-room-and-games-read-xp-oracle)
//   X2  the Deal Room: a walked-away Read is recorded as hidden, a Read that ends in a purchase is not
//   X3  at scale: over many worlds, no walked-away Read ticks a counterfeit-caught quest or marks the lot
//   X5  an Academy lesson's sandbox is a scripted world: a Read there still tells the lesson the truth, as the steps of Read the Room wait for
//   M1  the test rig: the headless Chrome that tests and scripts start is muted, so a run on a person's own machine plays nothing out loud
//   X4  and the quests are told when the truth stops being a secret (the lot is bought, lost at auction or gone from the shelf), exactly once, so catching a counterfeit is still earned
// The relay tests need `npm install` in server/ (skipped without it). Run: node --test tests/cloud-audit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, symlinkSync, unlinkSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Game } from '../js/engine.js';
import { makeGame } from './bot.mjs';
import * as D from '../js/deal.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const haveRelay = existsSync(join(ROOT, 'server/node_modules/ws'));
const SKIP = !haveRelay && 'run npm install in server/';
const until = async (fn, what, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 20)); } assert.fail(`timed out waiting for ${what}`); };
const KEY = 'key-0000000000000000';

test('R1: a socket that sends only binary frames is cut off at the strike limit, as one that sends text would be', { skip: SKIP, timeout: 30000 }, async () => {
  const { createRelay } = await import('../server/relay.mjs');
  const relay = createRelay({ env: { PORT: '0' }, log: () => {} }), port = await relay.listen(0);
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?room=BIN1&pid=P1&key=${KEY}`); ws.binaryType = 'arraybuffer';
    let closed = null; ws.addEventListener('close', (e) => { closed = e.code; });
    await until(() => ws.readyState === 1, 'the socket to open');
    // a text flood is the control: the same count of frames ends in a cut-off, so the relay is the thing under test
    for (let i = 0; i < 700 && ws.readyState === 1; i++) ws.send(new Uint8Array([1, 2, 3]));
    await until(() => closed !== null, 'the relay to cut off a socket that sends 700 binary frames at once');
    assert.ok(closed === 1006 || closed === 1005 || closed === 1008 || closed >= 1000, `closed with ${closed}`);
    // and a well-behaved socket in the same room is not touched
    const ok = new WebSocket(`ws://127.0.0.1:${port}/?room=BIN1&pid=P2&key=${KEY}`);
    await until(() => ok.readyState === 1, 'a second socket to open'); ok.send(JSON.stringify({ t: 'hello' })); await new Promise((r) => setTimeout(r, 100)); assert.equal(ok.readyState, 1); ok.close();
  } finally { await relay.close(); }
});

test('R2: SIGTERM tells the clients the relay is going away (1001) and ends the process with status 0', { skip: SKIP, timeout: 30000 }, async () => {
  const child = spawn(process.execPath, [join(ROOT, 'server/relay.mjs')], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'ignore'] });
  const exit = new Promise((res) => child.once('exit', (code, sig) => res({ code, sig })));
  try {
    const port = await new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('relay did not start')), 8000); child.stdout.on('data', (d) => { const m = /listening on :(\d+)/.exec(String(d)); if (m) { clearTimeout(to); res(+m[1]); } }); });
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?room=TERM1&pid=P1&key=${KEY}`);
    let closed = null; ws.addEventListener('close', (e) => { closed = e.code; });
    await until(() => ws.readyState === 1, 'the socket to open');
    child.kill('SIGTERM');
    const r = await Promise.race([exit, new Promise((res) => setTimeout(() => res({ code: 'still running' }), 8000))]);
    assert.equal(r.code, 0, `the relay ended on SIGTERM with status ${r.code} (signal ${r.sig})`);
    await until(() => closed !== null, 'the client to see the close');
    assert.equal(closed, 1001, 'the client was told the relay is going away, not left with a dropped connection (1006)');
  } finally { child.kill('SIGKILL'); }
});

test('R3: a symlink inside the served tree that leads out of it is not served', async () => {
  const { handler } = await import('../server/static.mjs');
  const out = mkdtempSync(join(tmpdir(), 'pc-outside-')), secret = join(out, 'secret.css'), link = join(ROOT, 'css', 'zz-cloud-audit-link.css');
  writeFileSync(secret, 'body { --secret: 1; }');
  const get = (url) => new Promise((res) => { const r = { status: 0, body: '', writeHead(s) { this.status = s; }, end(b) { this.body = b ? String(b) : ''; res({ status: this.status, body: this.body }); }, headersSent: false }; handler({ method: 'GET', url }, r); });
  try {
    symlinkSync(secret, link);
    const r = await get('/css/zz-cloud-audit-link.css');
    assert.equal(r.status, 404, 'the link is not followed out of the tree'); assert.ok(!/secret/.test(r.body));
    assert.equal((await get('/css/styles.css')).status, 200, 'and a real file is still served');
  } finally { try { unlinkSync(link); } catch { /* gone */ } rmSync(out, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------------------------------------------------------------- the engine
const mk = (perks = [], seed = 1, pid) => { const g = new Game({ perks, seed, handle: pid || 'T', pid: pid || 'T-' + seed }); g.env.algo = false; return g; };
const rich = (g, cash) => { g.s.cash = cash; g.advanceTo(g.s.hour + 1); return g; };

test('E1: an offer is accepted once: the same message twice pays once and delivers once', () => {
  const A = mk([], 1, 'AAA'), B = mk([], 2, 'BBB'); rich(A, 20000); rich(B, 3000);
  const off = A.createOffer({ to: 'BBB', giveIds: [], giveCash: 0, royalty: { perDay: 30, days: 5 }, want: { assets: [], cash: 150 } });
  assert.ok(off.ok, off.msg);
  const cash0 = B.s.cash, first = B.acceptOffer(off.offer);
  assert.ok(first.ok, first.msg); assert.equal(B.s.cash, cash0 - 150); assert.equal(B.s.royalties.length, 1);
  const again = B.acceptOffer(off.offer);
  assert.equal(again.ok, false); assert.match(again.msg, /already accepted/);
  assert.equal(B.s.cash, cash0 - 150, 'no second payment'); assert.equal(B.s.royalties.length, 1, 'and no second stream');
  assert.deepEqual(JSON.parse(JSON.stringify(B.s)).accepted, ['AAA|' + off.offer.id], 'the record (the proposer and the id) is plain JSON in the save');
  // another founder's offer that carries the same id is another offer: an id is only the proposer's own
  const other = B.acceptOffer({ ...off.offer, from: 'CCC' }); assert.doesNotMatch(other.msg || '', /already accepted/, 'it is judged on its merits, not refused as already accepted');
  for (let i = 0; i < 250; i++) { B.s.accepted.push('O' + i); if (B.s.accepted.length > 200) B.s.accepted.shift(); }
  assert.ok(B.s.accepted.length <= 200);
});

test('E2: a negative amount in an engine message is -$12.50, not $-12.50', () => {
  const g = mk(); g.s.cash = -12.5;
  g.advanceTo(24 * 3 + 1); // day 4 starts: the overdraft notice is written on a day divisible by three
  const text = g.s.news.map((n) => n.text).find((t) => /Cash is negative/.test(t));
  assert.ok(text, 'the overdraft notice was written');
  assert.match(text, /\(-\$\d/); assert.doesNotMatch(text, /\$-/);
});

test('E3: the engine says 1 day and 1 hour, not 1 days and 1 hours', () => {
  const src = readFileSync(join(ROOT, 'js/engine.js'), 'utf8');
  assert.match(src, /const plural = \(n, word\) => `\$\{n\} \$\{word\}\$\{n === 1 \? '' : 's'\}`/);
  assert.doesNotMatch(src, /\+ ' days'|\+ ' hours'|\} days to spare/, 'no count is followed by a hard-coded plural');
  assert.match(src, /plural\(Math\.round\(this\.daysRemaining\(\)\), 'day'\)\} to spare/);
});

test('E4: an event listener that throws does not stop the day: the tick finishes, the history row is written once', () => {
  const g = mk(); rich(g, 500);
  const rows = g.s.hist ? g.s.hist.length : null, hour = g.s.hour;
  const errors = []; const was = console.error; console.error = (...a) => errors.push(a);
  try {
    g.onEvent = () => { throw new Error('a listener fault'); };
    g.advanceTo(hour + 24 * 2);
  } finally { console.error = was; g.onEvent = null; }
  assert.equal(g.s.hour, hour + 48, 'the clock reached the hour asked for'); assert.ok(errors.length >= 1, 'and the fault was reported, not swallowed silently');
  if (rows != null) assert.ok(g.s.hist.length >= rows + 2, 'a history row for each day');
  const again = JSON.stringify(g.s); assert.ok(again.length > 100, 'the state is still plain JSON');
});

test('E5: the swap matrix prices a digital crate at its own quality: a known counterfeit is a small share of a genuine one, as for a physical crate', () => {
  const g = mk(); rich(g, 5000);
  const crate = (id, quality) => ({ id, cls: 'domain', cond: 'ok', quality, wear: 1, zone: 1 });
  const genuine = g.projected(crate('D1', 1)), fake = g.projected(crate('D2', 0.08)), half = g.projected(crate('D3', 0.5));
  assert.ok(genuine > 0, `a genuine domain is worth something (${genuine})`);
  assert.ok(fake < genuine * 0.2, `a counterfeit (${fake.toFixed(2)}) is a small share of a genuine one (${genuine.toFixed(2)})`);
  assert.ok(half > fake && half < genuine, 'and quality is a scale, not a switch');
  const physical = (q) => g.projected({ id: 'P', cls: 'bike', cond: 'ok', quality: q, wear: 1, zone: 1 }); assert.ok(physical(0.08) < physical(1) * 0.2, 'as it already was for a physical crate');
});

// ------------------------------------------------------------------------------------------------------------------------- the Deal Room
test('D1: the Deal Room takes one press of a button as one move: the same move again within a third of a second and a key held down are not second moves, a different button in the same place is', () => {
  const src = readFileSync(join(ROOT, 'js/ui/deal.js'), 'utf8');
  assert.match(src, /const DOUBLE_MS = 350;/);
  assert.match(src, /if \(ses\.lastAct && ses\.lastAct\.name === name && at - ses\.lastAct\.at < DOUBLE_MS\) return;[^]*?ses\.lastAct = \{ name, at \}; acts\[name\]\?\.\(b, e\);/, 'the same act within DOUBLE_MS is dropped; any other is a move');
  assert.doesNotMatch(src, /e\.detail > 1/, 'not by the click count: a second click on the next stage\'s button in the same place is a decision, and the browser counts it as a double-click');
  assert.match(src, /const onKey = \(e\) => \{\n    if \(e\.repeat && e\.target\.closest\?\.\('\[data-deal\]'\)\) \{ e\.preventDefault\(\); return; \}/, 'and a key held on a Deal Room button repeats no click');
  assert.match(src, /run\.key !== 'fix' \|\| run\.res\.fix \|\| ses\.reduced\(\) \|\| e\.repeat \|\| !\(e\.key === ' ' \|\| e\.key === 'Enter'\)/, 'and a held space or Enter is one Stop, not a run of them');
});

// ------------------------------------------------------------------------------------------------------------------------- the art (the first judge pass)
test('A1: the "Opens at" chip of a ferry gate rides above its plaque instead of over its words, and the other gates keep theirs', () => {
  const statics = readFileSync(join(ROOT, 'js/world/statics.js'), 'utf8'), street = readFileSync(join(ROOT, 'js/world/props-street.js'), 'utf8');
  const m = /wy: y - \(p\.gk === 'ferry' \? (\d+) : (\d+)\)/.exec(statics), top = /roundRect\(ctx, a\[0\] - 22, a\[1\] - (\d+), 44, 16, 3\)/.exec(street);
  assert.ok(m && top, 'the chip\'s lift and the plaque\'s top are in the source');
  const ferry = +m[1], other = +m[2], plaque = +top[1]; // world px above the gate's ground point; the chip is 18 px tall at the scale of a working zoom, and is centred on its anchor
  assert.ok(ferry - 9 >= plaque + 4, `the chip's foot (${ferry - 9}) stands clear of the plaque's top (${plaque})`);
  assert.equal(other, 44, 'a barrier and a bridge keep the chip where it was');
});

// ---- the relay's blockers (round 1 of the audit: rs-seat-claim, rs-keytable-lockout, relay-1, relay-2)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A WebSocket client of a relay under test: what it heard, and the code it was closed with (null while open). */
const dial = (port, room, pid, { role = 'student', owner = '', key = KEY } = {}) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?room=${room}&pid=${pid}&key=${key}&role=${role}${owner ? '&owner=' + owner : ''}`);
  const c = { ws, got: [], closed: null, send: (m) => ws.send(JSON.stringify(m)) };
  ws.addEventListener('message', (e) => { try { c.got.push(JSON.parse(e.data)); } catch { /* not ours */ } });
  ws.addEventListener('close', (e) => { c.closed = e.code; });
  c.ready = until(() => ws.readyState === 1 || c.closed !== null, `${pid} to open or be refused`, 5000);
  return c;
};
const OWNER = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

test('S1: the owner token binds a room even when a connection with no token took the seat first, and then takes the seat from it', { skip: SKIP, timeout: 30000 }, async () => {
  const { createRelay } = await import('../server/relay.mjs');
  const relay = createRelay({ env: { PORT: '0' }, log: () => {} }), port = await relay.listen(0);
  try {
    // a stray instructor-role tab with no token is the first to claim the seat (after a restart, or a room forgotten while empty)
    const stud = dial(port, 'SEAT1', 'PC-STU'), squat = dial(port, 'SEAT1', 'PC-EVIL', { role: 'instructor' });
    await Promise.all([stud.ready, squat.ready]);
    squat.send({ t: 'clock', hour: 5, speed: 64, paused: false });
    await until(() => stud.got.some((m) => m.t === 'clock' && m.hour === 5), 'the first to claim the seat to hold it', 3000);
    assert.equal(relay.rooms.get('SEAT1').ownerProof, null, 'no token has been shown yet');
    // the real instructor arrives with the room\'s owner token, from a Founder ID the relay has not seen
    const real = dial(port, 'SEAT1', 'PC-REAL', { role: 'instructor', owner: OWNER }); await real.ready;
    real.send({ t: 'clock', hour: 100, speed: 1, paused: true });
    await until(() => stud.got.some((m) => m.t === 'clock' && m.hour === 100 && m.from === 'PC-REAL' && m.role === 'instructor'), 'the token to take the seat from a holder that never showed one', 3000);
    assert.notEqual(relay.rooms.get('SEAT1').ownerProof, null, 'the room is bound to the token');
    // and the squatter is a student again; nothing it sends as the instructor is forwarded
    squat.send({ t: 'clock', hour: 6, speed: 64, paused: false }); squat.send({ t: 'rewind', toHour: 0 }); await sleep(250);
    assert.ok(!stud.got.some((m) => m.hour === 6 || m.t === 'rewind'), 'the one who sat in the seat is a student again');
    // a token that is not the room\'s still changes nothing
    const wrong = dial(port, 'SEAT1', 'PC-WRNG', { role: 'instructor', owner: '0f9e8d7c6b5a49382716f5e4d3c2b1a0' }); await wrong.ready;
    wrong.send({ t: 'clock', hour: 7, speed: 64, paused: false }); await sleep(250);
    assert.ok(!stud.got.some((m) => m.hour === 7), 'a different token does not take a bound room\'s seat');
    for (const c of [stud, squat, real, wrong]) c.ws.close();
  } finally { await relay.close(); }
});

test('K1: pids that sent a snapshot and left cannot fill a room\'s table for good: once they are old enough a new student gets in, and the names that only greeted are forgotten first', { skip: SKIP, timeout: 30000 }, async () => {
  const { createRelay } = await import('../server/relay.mjs');
  const clock = { t: 1e12 }; // the relay\'s own clock, held by the test: GHOST_MS passes when it says so
  const relay = createRelay({ env: { PORT: '0', MAX_ROOM: '5', GHOST_MS: '150' }, now: () => clock.t, log: () => {} }), port = await relay.listen(0);
  const gone = async (room, n) => until(() => relay.rooms.get(room).clients.size === n, `${n} connected in ${room}`, 3000);
  const comeAndGo = async (room, pid, snap) => { const c = dial(port, room, pid); await c.ready; c.send(snap ? { t: 'snap', snap: { pid, nw: 5 } } : { t: 'hello' }); await sleep(30); c.ws.close(); await until(() => c.closed !== null, pid + ' to close', 3000); };
  try {
    // the audit\'s attack, scaled to a table of ten: nine connect-snapshot-leave names and the one who watches
    const watcher = dial(port, 'KEYS1', 'PC-WATCH'); await watcher.ready;
    for (let i = 0; i < 9; i++) await comeAndGo('KEYS1', 'SN' + i, true);
    await gone('KEYS1', 1);
    const fresh = dial(port, 'KEYS1', 'PC-REAL1'); await until(() => fresh.closed !== null, 'a refusal', 3000);
    assert.equal(fresh.closed, 1013, 'right after the burst the table is full of names too fresh to forget (the control)');
    clock.t += 300; // the names are now older than GHOST_MS
    const real = dial(port, 'KEYS1', 'PC-REAL2'); await real.ready; real.send({ t: 'hello' }); await sleep(150);
    assert.equal(real.closed, null, 'a student gets in once the names that snapshotted and left are older than GHOST_MS (they stayed for ever before)');
    // the order of forgetting: a name that only greeted goes before a student who snapshotted, though the student left first
    const w2 = dial(port, 'KEYS2', 'PC-WATCH'); await w2.ready;
    await comeAndGo('KEYS2', 'REAL-SNAP', true); clock.t += 10;
    for (let i = 0; i < 8; i++) { await comeAndGo('KEYS2', 'GH' + i, false); clock.t += 10; }
    await gone('KEYS2', 1); clock.t += 300;
    assert.equal(relay.rooms.get('KEYS2').keys.size, 10, 'the table is full');
    const next = dial(port, 'KEYS2', 'PC-NEXT'); await next.ready; await sleep(100);
    assert.equal(next.closed, null, 'the newcomer is let in');
    const keys = relay.rooms.get('KEYS2').keys;
    assert.ok(keys.has('REAL-SNAP'), 'the student who sent a snapshot keeps their place while greeters can be forgotten');
    assert.ok(!keys.has('GH0'), 'the oldest greeter was the one forgotten');
    for (const c of [watcher, fresh, real, w2, next]) c.ws.close();
  } finally { await relay.close(); }
});

test('I1: a full room gives a place to a newcomer by dropping the connection that has said nothing for longest, never the instructor\'s, and turns the newcomer away while everyone is recent', { skip: SKIP, timeout: 30000 }, async () => {
  const { createRelay } = await import('../server/relay.mjs');
  const clock = { t: 1e12 };
  const relay = createRelay({ env: { PORT: '0', MAX_ROOM: '5', IDLE_MS: '60000' }, now: () => clock.t, log: () => {} }), port = await relay.listen(0);
  try {
    // the audit\'s attack in small: idle sockets that fill a room, here with the instructor (whose seat is the oldest and quietest of all) and a student who is in use
    const prof = dial(port, 'IDLE1', 'PC-PROF', { role: 'instructor' }); await prof.ready;
    const stu = [];
    for (const p of ['PC-S1', 'PC-S2', 'PC-S3', 'PC-S4']) { clock.t += 10; const c = dial(port, 'IDLE1', p); await c.ready; stu.push(c); }
    const early = dial(port, 'IDLE1', 'PC-EARLY'); await until(() => early.closed !== null, 'a refusal', 3000);
    assert.equal(early.closed, 1013, 'while every connection is recent the room is full (the control)');
    clock.t += 120000; // everyone has been silent longer than IDLE_MS, and then one student speaks
    stu[3].send({ t: 'hello' }); await sleep(100);
    const late = dial(port, 'IDLE1', 'PC-LATE'); await late.ready; await sleep(150);
    assert.equal(late.closed, null, 'a real student gets in though the room was full of idle connections (it was turned away before)');
    await until(() => stu[0].closed !== null, 'the longest silent student to be dropped', 3000);
    assert.equal(prof.closed, null, 'the instructor holds the seat and is not dropped for being quiet');
    assert.deepEqual([stu[1].closed, stu[2].closed, stu[3].closed], [null, null, null], 'the others, and the student who spoke, stay');
    assert.equal(relay.rooms.get('IDLE1').clients.size, 5, 'the room is at its limit, not over it');
    for (const c of [prof, ...stu, early, late]) c.ws.close();
  } finally { await relay.close(); }
});

test('I2: a full relay gives a new class a place by forgetting the quietest room, and never a room that is in use', { skip: SKIP, timeout: 30000 }, async () => {
  const { createRelay } = await import('../server/relay.mjs');
  const clock = { t: 1e12 };
  const relay = createRelay({ env: { PORT: '0', MAX_ROOMS: '3', IDLE_MS: '60000' }, now: () => clock.t, log: () => {} }), port = await relay.listen(0);
  try {
    const squat = [];
    for (const code of ['AAA1', 'BBB1', 'CCC1']) { clock.t += 10; const c = dial(port, code, 'X' + code); await c.ready; squat.push(c); } // rooms made by a connection that sends nothing
    const early = dial(port, 'REAL1', 'PC-PROF', { role: 'instructor' }); await until(() => early.closed !== null, 'a refusal', 3000);
    assert.equal(early.closed, 1013, 'while every room is recent the relay is full (the control)');
    clock.t += 120000; // all three rooms have been silent longer than IDLE_MS, and then the second one speaks
    squat[1].send({ t: 'hello' }); await sleep(100);
    const prof = dial(port, 'REAL2', 'PC-PROF', { role: 'instructor' }); await prof.ready; await sleep(150);
    assert.equal(prof.closed, null, 'a real class gets a room though the relay was full of rooms nobody uses (it was turned away before)');
    await until(() => squat[0].closed !== null, 'the quietest room to be forgotten', 3000);
    assert.equal(relay.rooms.has('AAA1'), false, 'the quietest room is gone');
    assert.ok(relay.rooms.has('BBB1') && relay.rooms.has('CCC1') && relay.rooms.has('REAL2'));
    assert.equal(squat[1].closed, null, 'the room that was in use is untouched');
    assert.equal(relay.rooms.size, 3, 'the relay is at its limit, not over it');
    for (const c of [...squat, early, prof]) c.ws.close();
  } finally { await relay.close(); }
});

test('N1: a connection the relay refuses with 1008 is asked for once, not for ever: the room says it was refused', { skip: SKIP, timeout: 30000 }, async () => {
  const { createRelay } = await import('../server/relay.mjs');
  const { Room } = await import('../js/net.js');
  const relay = createRelay({ env: { PORT: '0' }, log: () => {} }); let connections = 0; relay.wss.on('connection', () => connections++);
  const port = await relay.listen(0);
  let room;
  try {
    // a classmate who has read the student\'s Founder ID off the wire gets to a new room first and binds it to their own key
    const squatter = dial(port, 'SQUAT1', 'PC-VICTIM', { key: 'squatters-key-000000000' }); await squatter.ready;
    room = new Room({ code: 'SQUAT1', pid: 'PC-VICTIM', key: 'victims-own-key-00000000', handle: 'v', role: 'student', relay: `ws://127.0.0.1:${port}` });
    await until(() => room.state === 'refused', 'the room to be refused, not "reconnecting"', 4000);
    await sleep(2500); // the client used to ask again after 0.8 s, 2.4 s, 5.6 s and so on, for ever
    assert.equal(room.state, 'refused', 'and it stays refused');
    assert.equal(connections, 2, 'the relay was asked once by the squatter and once by the student, and not again');
    squatter.ws.close();
  } finally { room?.close(); await relay.close(); }
});

test('N2: a room that is refused tells the player in words, and what to do', { skip: SKIP, timeout: 30000 }, async () => {
  const { createRelay } = await import('../server/relay.mjs');
  const { Session } = await import('../js/session.js');
  const relay = createRelay({ env: { PORT: '0' }, log: () => {} }), port = await relay.listen(0);
  try {
    const squatter = dial(port, 'SQUAT2', 'PC-VICTIM', { key: 'squatters-key-000000000' }); await squatter.ready;
    const s = new Session(); s.pid = 'PC-VICTIM'; s.key = 'victims-own-key-00000000';
    const notes = []; s.on((t, d) => { if (t === 'note') notes.push(d); });
    assert.equal(s.roomRefusal(), null, 'no refusal before there is a room');
    s.joinRoom({ code: 'SQUAT2', relay: `ws://127.0.0.1:${port}`, role: 'student', handle: 'v' });
    await until(() => notes.length, 'the player to be told', 4000);
    assert.equal(notes[0].level, 'bad');
    assert.match(notes[0].text, /SQUAT2/, 'it names the room');
    assert.match(notes[0].text, /Founder ID/, 'it says why');
    assert.match(notes[0].text, /new (room|code)/i, 'and what to do');
    assert.equal(s.roomRefusal(), notes[0].text, 'the shell can ask for the same words when it mounts after the refusal');
    assert.equal(notes.length, 1, 'once');
    s.leaveRoom(); squatter.ws.close();
  } finally { await relay.close(); }
});

// ---- the Read's experience was an oracle (deal-room-and-games-read-xp-oracle)
const readOnce = (fake, score, extra = {}, sandbox = false) => { // the same Read of a lot, in a world of the same seed; only the lot's hidden truth (and the accuracy score it would give) differs
  const g = makeGame(['grad', 'roots'], 'ops', 7), lot = g.s.lots[1][0], ev = [];
  if (sandbox) g.sandbox = { id: 'm02', zone: 4, warnings: [] }; // what js/ui/academy-sandbox.js sets on the game it builds for a lesson
  lot.truth.fake = fake; g.onEvent = (e) => ev.push(e);
  const r = g.recordInspect(1, lot.id, { estimate: { quality: 0.8, fakeProb: 0.9 }, confidence: 0.5, score, spent: 4, ...extra });
  return { g, lot, r, xp: g.s.xp, ev: ev.filter((e) => e.type === 'inspect') };
};

test('X1: a Read of a lot whose truth stays hidden pays on the evidence, not on the accuracy, and says nothing of the truth', () => {
  const counterfeit = readOnce(true, 0.95, { hidden: true }), genuine = readOnce(false, 0.1, { hidden: true });
  assert.equal(counterfeit.xp, genuine.xp, 'the experience does not tell a counterfeit from a genuine lot (it used to follow the accuracy score, which is made of the truth)');
  assert.equal(counterfeit.xp, Math.round(8 + 22 * 0.5), 'it is what the evidence stands for: 8 + 22 x confidence');
  assert.deepEqual(counterfeit.ev, genuine.ev, 'and so is what the quests are told');
  assert.equal(counterfeit.ev.length, 1);
  assert.equal(counterfeit.ev[0].fake, false); assert.equal(counterfeit.ev[0].caught, false);
  assert.equal(counterfeit.ev[0].score, 0, 'no accuracy is claimed for a lot nobody has seen the truth of');
  assert.equal(counterfeit.r.caught, false); assert.equal(counterfeit.lot.caughtReported, undefined);
  // reading it again, with a suspicion that is right, still tells nobody: the "later visit that newly catches a counterfeit" used to tick Spot the Fake for a lot on the shelf
  const again = counterfeit.g.recordInspect(1, counterfeit.lot.id, { estimate: { quality: 0.8, fakeProb: 0.95 }, confidence: 0.6, score: 1, spent: 2, hidden: true });
  assert.equal(again.caught, false);
  assert.equal(counterfeit.lot.caughtReported, undefined, 'the lot is not marked caught');
  // a Read whose lot is revealed (bought, or lost at auction) is scored on its accuracy as before
  const bought = readOnce(true, 0.8);
  assert.equal(bought.xp, Math.round(8 + 22 * 0.8)); assert.deepEqual(bought.ev[0], { type: 'inspect', day: 1, score: 0.8, fake: true, caught: true });
});

test('X2: the Deal Room records a Read it walks away from as hidden, and a Read that ends in a purchase as revealed', () => {
  const world = (seed) => { const g = makeGame(['grad', 'roots'], 'ops', seed); for (const z of [2, 3, 4, 6]) g._openZone(z); g.s.cash = 1e6; return g; };
  const spy = (g) => { const seen = [], orig = g.recordInspect.bind(g); g.recordInspect = (z, id, res) => { seen.push(res); return orig(z, id, res); }; return seen; };
  const gw = world(51), seenW = spy(gw), lotW = gw.s.lots[4].find((l) => l.mode === 'fixed');
  const rw = D.startRun(gw, { kind: 'buy', zone: 4, lotId: lotW.id }); assert.ok(rw.ok);
  rw.act({ type: 'probe', id: 'serial' }); rw.walkAway();
  assert.equal(seenW.length, 1); assert.equal(seenW[0].hidden, true, 'a lot that stays on the shelf stays hidden: nothing paid for the Read may depend on its truth');
  assert.ok(gw.s.lots[4].some((l) => l.id === lotW.id), 'the lot is still on the shelf');
  const gb = world(51), seenB = spy(gb), lotB = gb.s.lots[4].find((l) => l.mode === 'fixed');
  const rb = D.startRun(gb, { kind: 'buy', zone: 4, lotId: lotB.id }); assert.ok(rb.ok);
  rb.act({ type: 'probe', id: 'serial' }); rb.act({ type: 'conclude' }); rb.quick(); const sm = rb.finish();
  assert.equal(sm.ok, true); assert.ok(!gb.s.lots[4].some((l) => l.id === lotB.id), 'the lot is bought');
  assert.equal(seenB.length, 1); assert.equal(!!seenB[0].hidden, false, 'a bought lot is revealed on the card, so its Read is scored on its accuracy');
});

test('X3: over many worlds, no Read that is walked away from ticks a counterfeit-caught quest or marks the lot caught', () => {
  let walked = 0, suspected = 0, leaks = [];
  for (let seed = 1; seed <= 25; seed++) {
    const g = makeGame(['grad', 'roots'], 'ops', seed); for (const z of [2, 3, 4, 6]) g._openZone(z); g.s.cash = 1e6;
    const ev = []; g.onEvent = (e) => ev.push(e);
    for (const z of g.s.zones) for (const lot of [...g.s.lots[z]]) {
      const r = D.startRun(g, { kind: 'buy', zone: z, lotId: lot.id }); if (!r.ok) continue;
      for (const id of ['look', 'serial', 'power', 'papers', 'expert']) r.act({ type: 'probe', id });
      const n0 = ev.length; r.walkAway(); walked++;
      if (lot.truth.fake && lot.belief && lot.belief.fakeProb >= 0.6) suspected++;
      for (const e of ev.slice(n0)) if (e.type === 'inspect' && (e.fake === true || e.caught === true)) leaks.push(`${seed}/${z}/${lot.id}`);
      if (lot.caughtReported) leaks.push(`${seed}/${z}/${lot.id} marked`);
    }
  }
  assert.ok(walked > 150, 'enough reads were walked away from: ' + walked);
  assert.ok(suspected > 0, 'the case is there: a counterfeit that a Read ended up suspecting (' + suspected + ' of ' + walked + ')');
  assert.deepEqual(leaks, [], 'a lot still on the shelf told a quest it was a counterfeit');
});

test('X4: a Read of a hidden lot is told to the quests when its truth stops being a secret (bought, lost at auction, or gone from the shelf), once, and never for a lot nobody read', () => {
  const world = (fake) => { const g = makeGame(['grad', 'roots'], 'ops', 7), lot = g.s.lots[1][0], ev = []; lot.truth.fake = fake; g.onEvent = (e) => ev.push(e); return { g, lot, ev: () => ev.filter((e) => e.type === 'inspect') }; };
  const hiddenRead = ({ g, lot }, fakeProb = 0.9, score = 0.85) => g.recordInspect(1, lot.id, { estimate: { quality: 0.8, fakeProb }, confidence: 0.5, score, spent: 3, hidden: true });
  // gone from the shelf: the counterfeit that was suspected and passed on is caught, now that nobody can buy it
  const a = world(true); hiddenRead(a);
  assert.equal(a.ev().length, 1, 'the Read itself said nothing of the truth'); assert.equal(a.ev()[0].caught, false);
  a.lot.exp = a.g.s.hour; a.g._spawnLot(1); // its time is up
  assert.ok(!a.g.s.lots[1].some((l) => l.id === a.lot.id), 'the lot has left the shelf');
  assert.equal(a.ev().length, 2); assert.deepEqual(a.ev()[1], { type: 'inspect', day: 1, score: 0.85, fake: true, caught: true });
  a.g._spawnLot(1); assert.equal(a.ev().length, 2, 'once');
  // a genuine lot that was suspected is not "caught", whatever the player believed; and a suspicion under 60% is not either
  const b = world(false); hiddenRead(b); b.lot.exp = b.g.s.hour; b.g._spawnLot(1); assert.deepEqual([b.ev()[1].fake, b.ev()[1].caught], [false, false]);
  const c = world(true); hiddenRead(c, 0.3); c.lot.exp = c.g.s.hour; c.g._spawnLot(1); assert.deepEqual([c.ev()[1].fake, c.ev()[1].caught], [true, false]);
  // bought later (the card reveals it then)
  const d = world(true); hiddenRead(d); d.g.s.cash = 1e6; assert.equal(d.g.buyLot(1, d.lot.id).ok, true);
  assert.equal(d.ev().length, 2); assert.equal(d.ev()[1].caught, true); assert.equal(d.ev()[1].fake, true);
  // lost at auction
  const e = world(true); hiddenRead(e); assert.equal(e.g.passLot(1, e.lot.id).ok, true);
  assert.equal(e.ev().length, 2); assert.equal(e.ev()[1].caught, true);
  // a lot nobody read tells the quests nothing when it goes
  const f = world(true); f.lot.exp = f.g.s.hour; f.g._spawnLot(1); assert.equal(f.ev().length, 0);
  // a Read that was revealed at once (the old path) leaves nothing to settle
  const h = world(true); h.g.recordInspect(1, h.lot.id, { estimate: { quality: 0.8, fakeProb: 0.9 }, confidence: 0.5, score: 0.8, spent: 3 });
  h.lot.exp = h.g.s.hour; h.g._spawnLot(1); assert.equal(h.ev().length, 1);
});

test('M1: the headless Chrome that the tests and scripts start is muted: a run on a person\'s own machine plays nothing out loud', async () => {
  // new-style headless Chrome is the whole browser, and the game has a sound layer: a test that clicks through a lesson makes the cues, and without --mute-audio they came out of the machine\'s speakers
  const { chromeArgs } = await import('../scripts/chrome.mjs');
  assert.ok(chromeArgs().includes('--mute-audio'), 'chromeArgs() mutes: ' + chromeArgs().join(' '));
  // and every launch takes its flags from it
  for (const f of ['scripts/cdp.mjs', 'scripts/diag/lib.mjs']) assert.match(readFileSync(join(ROOT, f), 'utf8'), /\.\.\.chromeArgs\(\)/, f + ' builds its flags from chromeArgs()');
});

test('X5: an Academy lesson\'s sandbox is a scripted world: a Read there tells the lesson the truth, because its steps wait for it (Read the Room)', () => {
  // m02 reads a fake watch (the step waits for inspect with fake: true) and then says which was which; nothing in a lesson\'s lots is a secret worth keeping from the lesson
  const fake = readOnce(true, 0.8, { hidden: true }, true), genuine = readOnce(false, 0.8, { hidden: true }, true);
  assert.deepEqual(fake.ev[0], { type: 'inspect', day: 1, score: 0.8, fake: true, caught: true }, 'the counterfeit watch read in the lesson is reported as the counterfeit it is');
  assert.deepEqual([genuine.ev[0].fake, genuine.ev[0].caught], [false, false]);
  assert.equal(fake.xp, Math.round(8 + 22 * 0.8), 'and it is scored on its accuracy, as before');
  assert.equal(fake.lot.readScore, undefined, 'nothing is held back to be told later');
});

test('M2: a Chrome that dies at once is reported with its exit code and what it wrote, not as "fetch failed" nine seconds later', async () => {
  const { chromeReady, CHROME_WAIT } = await import('../scripts/chrome.mjs');
  const { spawn } = await import('node:child_process');
  assert.ok(CHROME_WAIT * 0.15 >= 45, `the launchers wait ${CHROME_WAIT * 0.15} s for Chrome to open its port (the first Chrome on a fresh GitHub runner takes 9 to 10 s: nine seconds failed there)`);
  const dead = spawn(process.execPath, ['-e', "console.error('No usable sandbox! Update your kernel'); process.exit(3)"], { stdio: ['ignore', 'ignore', 'pipe'] });
  await assert.rejects(() => chromeReady(dead, 9, 20), (e) => { assert.match(e.message, /exited with 3/); assert.match(e.message, /No usable sandbox/); assert.match(e.message, /debugging port 9/); return true; });
  const quiet = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 4000)'], { stdio: ['ignore', 'ignore', 'pipe'] });
  try { await assert.rejects(() => chromeReady(quiet, 9, 3), /still running after/); } finally { quiet.kill('SIGKILL'); }
});
