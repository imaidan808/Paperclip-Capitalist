import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Room } from '../js/net.js';
import { Session, Clock } from '../js/session.js';
import { PERK_IDS } from '../js/config.js';

const until = async (fn, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 25)); } throw new Error('timed out'); };
const open = [];
const track = (r) => { open.push(r); return r; };
after(() => { for (const r of open) { try { r.transport.close(); } catch { /* closed */ } } });

test('same-browser transport delivers to other founders but not to self', async () => {
  const a = track(new Room({ code: 'LOCAL1', pid: 'A', handle: 'a', role: 'student' }));
  const b = track(new Room({ code: 'LOCAL1', pid: 'B', handle: 'b', role: 'student' }));
  const c = track(new Room({ code: 'OTHER1', pid: 'C', handle: 'c', role: 'student' }));
  const got = { a: [], b: [], c: [] };
  a.on((m) => got.a.push(m)); b.on((m) => got.b.push(m)); c.on((m) => got.c.push(m));
  a.send({ t: 'ping' });
  await until(() => got.b.length);
  assert.equal(got.b[0].t, 'ping'); assert.equal(got.b[0].from, 'A');
  assert.equal(got.a.length, 0); assert.equal(got.c.length, 0, 'rooms are isolated');
});

const relayPath = new URL('../server/relay.mjs', import.meta.url).pathname;
const haveRelay = existsSync(new URL('../server/node_modules/ws', import.meta.url));
test('WebSocket relay forwards, isolates rooms, and replays the last snapshot and clock to late joiners', { skip: !haveRelay && 'run npm install in server/' }, async () => {
  const port = 8800 + Math.floor(Math.random() * 90);
  const child = spawn('node', [relayPath], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('relay did not start')), 8000); child.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(to); res(); } }); child.on('exit', () => rej(new Error('relay exited early'))); });
    const url = `ws://localhost:${port}`;
    const teacher = track(new Room({ code: 'CLASS', pid: 'T', handle: 'teacher', role: 'instructor', relay: url }));
    const s1 = track(new Room({ code: 'CLASS', pid: 'S1', handle: 's1', role: 'student', relay: url }));
    const stranger = track(new Room({ code: 'ELSE', pid: 'X', handle: 'x', role: 'student', relay: url }));
    const seenS1 = [], seenX = [];
    s1.on((m) => seenS1.push(m)); stranger.on((m) => seenX.push(m));
    await until(() => teacher.state === 'open' && s1.state === 'open' && stranger.state === 'open');
    teacher.send({ t: 'clock', hour: 100, speed: 4, paused: false });
    s1.send({ t: 'snap', snap: { pid: 'S1', nw: 123 } });
    await until(() => seenS1.some((m) => m.t === 'clock'));
    assert.equal(seenX.length, 0, 'no leakage between rooms');
    const late = track(new Room({ code: 'CLASS', pid: 'S2', handle: 's2', role: 'student', relay: url }));
    const seenLate = []; late.on((m) => seenLate.push(m));
    await until(() => seenLate.some((m) => m.t === 'clock') && seenLate.some((m) => m.t === 'snap'));
    assert.equal(seenLate.find((m) => m.t === 'clock').hour, 100);
    assert.equal(seenLate.find((m) => m.t === 'snap').snap.nw, 123);
    // a student may not set the room clock for everyone
    s1.send({ t: 'clock', hour: 5, speed: 99, paused: true });
    const late2 = track(new Room({ code: 'CLASS', pid: 'S3', handle: 's3', role: 'student', relay: url }));
    const seen2 = []; late2.on((m) => seen2.push(m));
    await until(() => seen2.some((m) => m.t === 'clock'));
    assert.equal(seen2.find((m) => m.t === 'clock').hour, 100, 'only the instructor clock is remembered');
  } finally { child.kill(); }
});

function pair() {
  const code = 'T' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const teacher = new Session(); teacher.pid = 'TEACH'; teacher.mode = 'instructor'; teacher.clock = new Clock({ hour: 0, paused: true });
  teacher.joinRoom({ code, role: 'instructor', handle: 'Prof' });
  const mk = (pid, perks, spec) => { const s = new Session(); s.pid = pid; s.joinRoom({ code, role: 'student', handle: pid }); s.startGame({ perks, specialty: spec, handle: pid }); return s; };
  const a = mk('ADA', ['trades', 'pro'], 'ops'), b = mk('GRACE', ['creator', 'roots'], 'growth');
  for (const s of [teacher, a, b]) open.push({ transport: { close: () => s.room?.transport.close() } });
  return { teacher, a, b };
}

test('instructor sees students, drives the shared clock, injects shocks and tunes difficulty', async () => {
  const { teacher, a, b } = pair();
  await until(() => teacher.students().length === 2);
  teacher.setSpeed(16);
  await until(() => a.clock.speed === 16 && !a.clock.paused && b.clock.speed === 16);
  assert.equal(a.canSetClock(), false, 'students cannot change the clock');
  teacher.setDifficulty({ friction: 2, audit: 3 });
  await until(() => a.difficulty.friction === 2 && b.difficulty.audit === 3);
  assert.equal(a.game.env.difficulty.friction, 2, 'the engine reads the shared difficulty');
  teacher.inject('tariff', { when: 0, replace: true });
  await until(() => a.game.s.events.filter((e) => e.kind === 'tariff').length === 1 && a.game.s.events.find((e) => e.kind === 'tariff').injected);
  assert.equal(a.game.s.events.filter((e) => e.kind === 'tariff').length, 1, 'replace pulls the scheduled copy forward, never stacks');
  teacher.setGhosts(0);
  await until(() => a.cohort.ghosts === 0);
});

test('students trade through the room; a blocked extreme offer is flagged to the instructor', async () => {
  const { teacher, a, b } = pair();
  await until(() => a.roster().some((r) => r.pid === 'GRACE' && !r.npc));
  const bike = b.game._mk(b.game.s, 'bike', { zone: 1, basis: 9 }); b.game.s.assets.push(bike);
  b._sendSnap(true);
  await until(() => a.roster().find((r) => r.pid === 'GRACE')?.inventory.some((x) => x.cls === 'bike'));
  const grace = a.roster().find((r) => r.pid === 'GRACE'), want = grace.inventory.find((x) => x.cls === 'bike');
  assert.deepEqual(grace.perks, ['creator', 'roots'], 'classmates see each other\'s Backgrounds');
  const blocked = a.propose({ to: 'GRACE', giveIds: [], giveCash: 4900, want: { assets: [want], cash: 0 } });
  assert.equal(blocked.ok, false);
  a.tick(); // drains the flag message to the room
  await until(() => teacher.flags.length === 1);
  assert.ok(teacher.flags[0].variance > 0.4);
  a.game.s.cash += 100; // everyone starts with $0, so the buyer needs some cash
  const fair = a.propose({ to: 'GRACE', giveIds: [], giveCash: Math.round(want.fmv), want: { assets: [want], cash: 0 } });
  assert.ok(fair.ok, fair.msg);
  await until(() => b.incoming.length === 1);
  const cashB = b.game.s.cash;
  assert.ok(b.acceptIncoming(b.incoming[0].offer.id).ok);
  await until(() => a.game.s.assets.some((x) => x.cls === 'bike'));
  assert.ok(b.game.s.cash > cashB);
  assert.equal(a.game.s.escrow.length, 0);
  assert.equal(a.game.s.p2p, 1); assert.equal(b.game.s.p2p, 1);
});

test('gradebook: the economic score is a percentile among ALL players (everyone starts with one paperclip); weights sum to 60 automated points', async () => {
  const { teacher, a, b } = pair();
  await until(() => teacher.students().length === 2);
  a.game.s.cash += 100000; b._sendSnap(true); a._sendSnap(true);
  await until(() => teacher.students().find((s) => s.pid === 'ADA')?.nw > 100000);
  const rows = teacher.gradebook();
  const ada = rows.find((r) => r.pid === 'ADA'), grace = rows.find((r) => r.pid === 'GRACE');
  assert.equal(ada.econ, 100); assert.equal(grace.econ, 0);
  assert.ok(ada.auto <= ada.autoMax && ada.autoMax === 60);
  // with a simulated class around them the percentile is over everyone, not over a "profile"
  teacher.setDemo(10);
  const all = teacher.gradebook();
  assert.equal(all.length, 12);
  assert.equal(all.find((r) => r.pid === 'ADA').econ, 100);
  const sorted = [...all].sort((x, y) => x.eei - y.eei);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].econ >= sorted[i - 1].econ, 'percentile is monotone in EEI');
  assert.equal(sorted[0].econ, 0);
});

test('solo mode shows simulated rivals and a practice partner; a fair deal with the partner closes', async () => {
  const s = new Session(); s.pid = 'SOLO'; s.startGame({ perks: ['grad', 'veteran'], specialty: 'ops', handle: 'Solo' });
  assert.ok(s.leaderboard().length >= 12 && s.leaderboard().some((r) => r.me));
  assert.deepEqual(s.game.s.perks, ['grad', 'veteran']);
  const npc = s.roster().find((r) => r.npc);
  assert.ok(npc.inventory.length >= 3, 'the partner trades what the first districts sell');
  const item = [...npc.inventory].sort((x, y) => y.fmv - x.fmv)[0];
  s.game.s.cash = 100;
  const r = s.propose({ to: npc.pid, giveIds: [], giveCash: Math.round(item.fmv * 100) / 100, want: { assets: [item], cash: 0 } });
  assert.ok(r.ok, r.msg);
  await new Promise((res) => setTimeout(res, 2700));
  assert.ok(s.game.s.assets.some((x) => x.cls === item.cls), 'practice partner accepted');
});
