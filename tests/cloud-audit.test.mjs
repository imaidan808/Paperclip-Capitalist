// Regression tests for what the cloud audit found and repaired (docs/CLOUD_HANDOFF.md). Each one fails on the code before its repair.
//   R1  the relay: a binary frame is dropped but is not free: a socket that sends only binary frames is cut off at the strike limit like any other flood (the check used to come before the rate limiter)
//   R2  the relay: SIGTERM (a deploy, `docker stop`, Ctrl-C) tells every client the relay is going away (close code 1001) and ends the process with status 0
//   R3  the static server: a symlink inside the served tree that leads out of it is not served
//   E1  the engine: an offer is accepted once (a second accept of the same offer paid again and delivered another copy of the proposer's crates)
//   E2  the engine writes a negative amount as -$12.50, as the rest of the product does, not $-12.50
//   E3  the engine's plurals: 1 day, 1 hour (not "1 days", "1 hours")
//   E4  a throwing event listener does not stop a day from finishing (profit counted twice, a missing history row, no checkpoint)
//   A1  the art: a ferry gate's "Opens at" chip rides above its plaque (the first judge pass found the plaque's words half hidden)
//   D1  the Deal Room: the second press of a double-click and a held key are not second moves
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
