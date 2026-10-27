// The session controller: clock, autosave and restore (with Backgrounds), the leaderboard, the gradebook percentile, the practice partner and the room lifecycle.
// No browser: a tiny in-memory localStorage stands in. Room traffic itself is tested in multiplayer.test.mjs.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };

const { Session, Clock, kv, SOLO_OFFLINE_CAP_H, SPEEDS } = await import('../js/session.js');
const { Game } = await import('../js/engine.js');
const { TOTAL_HOURS, SEC_PER_HOUR, PERKS } = await import('../js/config.js');

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const fresh = () => { store.clear(); const s = new Session(); s.pid = 'PC-TEST'; return s; };
const open = [];
const solo = (opts = {}) => { const s = fresh(); s.startGame({ perks: ['trades', 'pro'], specialty: 'ops', handle: 'Ada', ...opts }); open.push(s); return s; };
afterEach(() => { for (const s of open.splice(0)) { try { s.leaveRoom(); } catch { /* closed */ } } });

test('the clock: real time becomes game hours at the chosen speed, pausing holds it, and it never passes day 90', () => {
  const c = new Clock({ hour: 10, wall: 1000, speed: 2, paused: false });
  near(c.now(1000 + SEC_PER_HOUR * 1000), 12, 1e-9); // one game hour of wall time at 2x is two hours
  assert.equal(new Clock({ hour: 10, wall: 1000, speed: 2, paused: true }).now(1e12), 10);
  assert.equal(new Clock({ hour: 2000, wall: 1, speed: 64 }).now(1e12), TOTAL_HOURS);
  const d = new Clock({ hour: 0, speed: 1 });
  d.set({ speed: 16 });
  assert.equal(d.speed, 16);
  d.set({ hour: 5, paused: true });
  assert.equal(d.now(), 5);
  const copy = new Clock(JSON.parse(JSON.stringify(d)));
  assert.equal(copy.paused, true); assert.equal(copy.speed, 16); near(copy.now(), 5, 1e-6);
  assert.deepEqual(SPEEDS, [0.25, 1, 4, 16, 64]);
});

test('startGame builds the game from two Backgrounds and wires the cohort, difficulty and world seed', () => {
  const s = solo({ speed: 4 });
  const g = s.game;
  assert.deepEqual(g.s.perks, ['trades', 'pro']);
  assert.equal(g.s.handle, 'Ada'); assert.equal(g.s.pid, 'PC-TEST'); assert.equal(g.s.specialty, 'ops');
  assert.equal(g.s.cash, 0); assert.equal(g.s.assets.length, 1);
  assert.equal(s.clock.speed, 4);
  assert.ok(s.worldSeed.startsWith('solo-'));
  assert.equal(g.env.cohort, s.cohort); assert.equal(g.env.difficulty, s.difficulty); assert.equal(g.env.worldSeed, s.worldSeed);
  assert.equal(s.cohort.seed, s.worldSeed);
  assert.equal(s.synth.length, 11, 'simulated rivals fill the leaderboard in solo play');
  assert.equal(kv.get('handle'), 'Ada');
  const notes = []; s.on((t, d) => { if (t === 'note') notes.push(d); });
  g.note('info', 'hello'); assert.equal(notes.length, 1, 'game notes reach the UI through the session');
});

test('a game with an unknown or repeated Background still starts, with at most two known Backgrounds', () => {
  const s = fresh(); s.startGame({ perks: ['pro', 'pro', 'nonsense', 'trades'], handle: 'x' });
  assert.deepEqual(s.game.s.perks, ['pro', 'trades']);
  const e = fresh(); e.startGame({ handle: 'y' });
  assert.deepEqual(e.game.s.perks, []);
});

test('save and restore round trip: Backgrounds, state, clock and handle come back, and play continues identically', () => {
  const s = solo({ speed: 16 });
  s.game.advanceTo(60);
  s.clock.set({ hour: 60, paused: true });
  s.save(true);
  const saved = kv.get('save');
  assert.equal(saved.v, 1); assert.equal(saved.mode, 'solo'); assert.deepEqual(saved.state.perks, ['trades', 'pro']);

  const r = new Session(); r.pid = 'PC-TEST'; open.push(r);
  assert.equal(r.restore(), true);
  assert.deepEqual(r.game.s.perks, ['trades', 'pro']);
  assert.equal(r.handle, 'Ada');
  assert.equal(JSON.stringify(r.game.s), JSON.stringify(s.game.s), 'the state is the state');
  assert.equal(r.worldSeed, s.worldSeed);
  assert.equal(r.clock.paused, true); assert.equal(r.clock.speed, 16);
  assert.equal(r.synth.length, 11);
  assert.equal(r.game.P.repairMult, 0.5, 'the restored game reads its Backgrounds');
  assert.equal(r.game.env.cohort, r.cohort);
  s.game.advanceTo(120); r.game.advanceTo(120);
  assert.equal(JSON.stringify(r.game.s), JSON.stringify(s.game.s), 'both timelines continue the same way');
});

test('save is throttled to once every four seconds unless forced; a restored solo clock is capped at a week of offline time', () => {
  const s = solo();
  const t0 = kv.get('save').savedAt;
  s.game.s.cash = 123;
  s.save();                            // too soon
  assert.equal(kv.get('save').state.cash, 0);
  s.t.save = Date.now() - 5000;
  s.save();
  assert.equal(kv.get('save').state.cash, 123);
  s.game.s.cash = 456; s.save(true);   // forced
  assert.equal(kv.get('save').state.cash, 456);
  assert.ok(kv.get('save').savedAt >= t0);
  // away for a year: only SOLO_OFFLINE_CAP_H comes back
  const d = kv.get('save');
  d.clock = { hour: d.state.hour, wall: Date.now() - 365 * 24 * 3600 * 1000, speed: 1, paused: false };
  kv.set('save', d);
  const r = new Session(); open.push(r);
  assert.equal(r.restore(), true);
  const away = r.clock.now() - d.state.hour;
  assert.ok(away >= SOLO_OFFLINE_CAP_H && away < SOLO_OFFLINE_CAP_H + 1, 'offline progress capped: ' + away);
});

test('restore refuses what it cannot read and leaves no half-built game behind', () => {
  store.clear();
  const none = new Session();
  assert.equal(none.restore(), false);
  for (const bad of [{ v: 2, state: {} }, { v: 1 }, 'garbage', 7]) {
    store.clear(); kv.set('save', bad);
    const r = new Session();
    assert.equal(r.restore(), false, JSON.stringify(bad));
    assert.equal(r.game, null);
  }
});

test('a save left by the v1 build (no Backgrounds) is refused instead of crashing the first tick', () => {
  // restore() used to check only the WRAPPER version (d.v === 1, unchanged since v1), so a v1 run in localStorage was accepted and then threw in Game.P (`s.perks.join`) on the first tick.
  // main.js shows "That save could not be read" only for `false`.
  store.clear();
  const v1State = { pid: 'PC-OLD', handle: 'Old', profile: 'midtier', specialty: 'ops', seed: 5, rng: 5, startHour: 0, hour: 200, cash: 5000, skills: { ops: 1, growth: 1, fintech: 1 }, zones: [1, 2], assets: [], leads: {}, lots: {}, pool: {}, pipes: [], upg: {}, clients: [], loans: [], settle: [], freight: [], escrow: [], royalties: [], events: [], ledger: [], news: [], niche: [], shockLog: [], acc: { profit: 0 }, dp: [], cm: { sum: 0, n: 0 }, mil: {}, nid: 9 };
  const wrap = (state) => ({ v: 1, mode: 'solo', worldSeed: 'solo', difficulty: {}, clock: { hour: 200, wall: Date.now(), speed: 1, paused: false }, room: null, state, savedAt: Date.now() });
  kv.set('save', wrap(v1State));
  const r = new Session();
  assert.equal(r.restore(), false);
  assert.equal(r.game, null); assert.equal(r.mode, 'solo');
  // the same wall around a state that says v2 but has no Backgrounds list is refused too; v:2 with a list is the only way in
  kv.set('save', wrap({ ...v1State, v: 2 })); assert.equal(new Session().restore(), false);
  kv.set('save', wrap({ ...v1State, v: 2, perks: 'trades' })); assert.equal(new Session().restore(), false);
  kv.set('save', wrap({ ...v1State, v: 1, perks: [] })); assert.equal(new Session().restore(), false, 'and a v1 state is refused even if it has the field');
  const live = solo(); live.game.advanceTo(10); live.save(true);
  const ok = new Session(); open.push(ok);
  assert.equal(ok.restore(), true);
  assert.doesNotThrow(() => ok.tick(Date.now() + 2 * SEC_PER_HOUR * 1000));
  // refusing leaves the stored save alone: nothing is deleted behind the player's back
  kv.set('save', wrap(v1State)); new Session().restore();
  assert.equal(kv.get('save').state.profile, 'midtier');
});

test('tick advances the game with the clock, delivers engine messages, stays idle when paused, and autosaves when the hour moves', () => {
  const s = solo({ speed: 1 });
  s.t.save = 0; s.t.refresh = Date.now();
  const wall = s.clock.wall + 5 * SEC_PER_HOUR * 1000 + 50;
  let ticks = 0; s.on((t) => { if (t === 'tick') ticks++; });
  s.tick(wall);
  assert.equal(s.game.s.hour, 5);
  assert.equal(ticks, 1);
  assert.equal(kv.get('save').state.hour, 5, 'the hour moved, so the game was saved');
  s.setPaused(true);
  const h = s.game.s.hour;
  s.tick(wall + 100 * SEC_PER_HOUR * 1000);
  assert.equal(s.game.s.hour, h, 'paused means paused');
  s.setSpeed(64);
  assert.equal(s.clock.paused, false); assert.equal(s.clock.speed, 64);
});

test('only a solo player or the instructor sets the clock; a student never does', () => {
  const s = solo();
  assert.equal(s.canSetClock(), true);
  s.mode = 'student'; assert.equal(s.canSetClock(), false);
  const before = s.clock.speed; s.setSpeed(64); assert.equal(s.clock.speed, before);
  s.mode = 'instructor'; assert.equal(s.canSetClock(), true);
  s.inject('tariff'); // an instructor with no room just emits
  s.mode = 'solo'; assert.equal(s.inject('tariff'), undefined, 'a solo player cannot inject shocks');
});

test('the leaderboard ranks by EEI with contiguous ranks, includes the player and the simulated class, and follows the player up', () => {
  const s = solo();
  let lb = s.leaderboard();
  assert.equal(lb.length, 12);
  assert.deepEqual(lb.map((r) => r.rank), Array.from({ length: 12 }, (_, i) => i + 1));
  for (let i = 1; i < lb.length; i++) assert.ok(lb[i - 1].eei >= lb[i].eei, 'sorted by EEI, best first');
  assert.equal(lb.filter((r) => r.me).length, 1);
  assert.equal(lb.filter((r) => r.synth).length, 11);
  const myRank0 = lb.find((r) => r.me).rank;
  s.game.s.cash = 5e6;
  lb = s.leaderboard();
  assert.equal(lb.find((r) => r.me).rank, 1, 'millions beat the class');
  assert.ok(lb.find((r) => r.me).rank <= myRank0);
  for (const r of lb) assert.ok(Number.isFinite(r.eei) && Number.isFinite(r.nw), r.pid);
});

test('gradebook: econ is the percentile of EEI among all players, adapt scores shocks against the class median, engage rewards swaps and docks flagged ones', () => {
  const s = solo();
  const row = (pid, eei, extra = {}) => ({ pid, eei, nw: eei, shockLog: [], p2p: 0, ...extra });
  s.students = () => [row('a', 1), row('b', 2), row('c', 3), row('d', 4)];
  let gb = s.gradebook();
  assert.deepEqual(gb.map((r) => Math.round(r.econ)), [0, 33, 67, 100]);
  for (const r of gb) { assert.equal(r.autoMax, 60); assert.equal(r.adapt, null); assert.ok(r.auto <= r.autoMax + 1e-9 && r.auto >= 0); }
  near(gb[0].auto, 0 * 0.3 + 50 * 0.2 + 0, 1e-9);              // no shocks: adapt reads as 50
  near(gb[3].auto, 100 * 0.3 + 50 * 0.2 + 0, 1e-9);
  s.students = () => [row('only', 5)];
  assert.equal(s.gradebook()[0].econ, 50, 'a class of one is not ranked');
  // adaptability: the student who held their net worth through the shock beats the one who lost half
  const shock = (ratio, pivots) => [{ id: 'fed@1056', nw: 1000, nwAfter: 1000 * ratio, pivots }];
  s.students = () => [row('keeps', 3, { shockLog: shock(1.0, 2) }), row('median', 2, { shockLog: shock(0.8, 0) }), row('loses', 1, { shockLog: shock(0.5, 0) })];
  gb = s.gradebook();
  const by = Object.fromEntries(gb.map((r) => [r.pid, r]));
  assert.ok(by.keeps.adapt > by.median.adapt && by.median.adapt > by.loses.adapt, JSON.stringify([by.keeps.adapt, by.median.adapt, by.loses.adapt]));
  for (const r of gb) assert.ok(r.adapt >= 0 && r.adapt <= 100);
  // engagement: 25 points per swap, 10 off per blocked offer
  s.students = () => [row('x', 1, { p2p: 3 }), row('y', 2, { p2p: 1 }), row('z', 3, { p2p: 9 })];
  s.flags = [{ from: 'x' }, { from: 'x' }];
  gb = s.gradebook();
  const e = Object.fromEntries(gb.map((r) => [r.pid, r.engage]));
  assert.equal(e.x, 75 - 20); assert.equal(e.y, 25); assert.equal(e.z, 100);
  assert.equal(gb.find((r) => r.pid === 'x').flagged, 2);
});

test('the practice partner always has something to swap, priced by the engine', () => {
  const s = solo();
  const n = s.npcView();
  assert.equal(n.pid, 'NPC-PARTNER'); assert.equal(n.npc, true);
  assert.ok(n.inventory.length >= 3 && n.inventory.length <= 5);
  for (const a of n.inventory) { assert.ok(a.fmv > 0 && Number.isFinite(a.fmv), a.cls); assert.equal(a.zone, 1); }
  for (const p of n.perks) assert.ok(PERKS[p], 'the partner\'s Backgrounds exist: ' + p);
  assert.deepEqual(s.roster().map((r) => r.pid), ['NPC-PARTNER'], 'solo: the partner is the only counterparty');
  s.setDemo(4); assert.equal(s.synth.length, 4); s.setDemo(0); assert.equal(s.synth.length, 0);
});

test('a student session adopts the room code as the world seed and reverts to solo when it leaves', () => {
  const s = solo();
  s.joinRoom({ code: 'ZZ99', role: 'student', handle: 'Ada' });
  assert.equal(s.mode, 'student'); assert.equal(s.worldSeed, 'ZZ99'); assert.equal(s.game.env.worldSeed, 'ZZ99'); assert.equal(s.cohort.seed, 'ZZ99');
  assert.equal(s.roomInfo.code, 'ZZ99');
  s.leaveRoom();
  assert.equal(s.mode, 'solo'); assert.equal(s.room, null);
  assert.ok(s.worldSeed.startsWith('solo-'), 'back to a private world');
  assert.equal(s.game.env.worldSeed, s.worldSeed);
});

test('a student who joins late starts at the room\'s hour and only meets shocks that are still ahead', () => {
  const s = fresh();
  s.mode = 'student'; s.clock = new Clock({ hour: 400, paused: true });
  s.startGame({ perks: ['heir', 'roots'], handle: 'Late' });
  open.push(s);
  assert.equal(s.game.s.hour, 400); assert.equal(s.game.s.startHour, 400);
  const kinds = s.game.s.events.map((e) => e.kind);
  assert.ok(!kinds.includes('tiktok'), 'day 15 is behind them');
  assert.ok(kinds.includes('fed') && kinds.includes('tariff'));
});

test('reset forgets the save and the game', () => {
  const s = solo();
  assert.ok(kv.get('save'));
  s.reset();
  assert.equal(kv.get('save'), null); assert.equal(s.game, null); assert.equal(s.mode, 'solo');
  assert.ok(Game);
});
