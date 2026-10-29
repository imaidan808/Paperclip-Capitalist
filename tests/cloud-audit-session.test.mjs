// Regression test for a session finding of the cloud audit (docs/CLOUD_HANDOFF.md).
//   S1  a class rewind to an hour a student's run has not reached leaves the run where it is (it restored the newest checkpoint at or before that hour and lost the hours since)
// Run: node --test tests/cloud-audit-session.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };
const { Session } = await import('../js/session.js');
const J = (o) => JSON.parse(JSON.stringify(o)); // what a message looks like after the wire
const fromTeacher = (m) => ({ from: 'TEACH', role: 'instructor', ...m });

test('S1: a rewind to an hour the run has not reached takes nothing back, and the instructor is told it is fine', () => {
  store.clear();
  const s = new Session(); s.pid = 'V'; s.mode = 'student'; s.startGame({ perks: ['pro'], specialty: 'ops', handle: 'V' });
  const sent = []; s._tell = (to, t, d) => sent.push({ to, t, ...d });
  s.game.advanceTo(30); s._persistCkpt && s._persistCkpt();
  const before = JSON.stringify(s.game.s);
  s._onMsg(J(fromTeacher({ t: 'rewind', toHour: 100 })));
  assert.equal(s.game.s.hour, 30, 'the run is where it was (the day-1 checkpoint is at hour 24)');
  assert.equal(JSON.stringify(s.game.s), before, 'nothing in it changed');
  const r = sent.find((m) => m.t === 'rewound'); assert.ok(r && r.ok === true && r.hour === 30 && r.wanted === 100, JSON.stringify(sent));
  // and a rewind to an hour it has passed still goes back, as before
  s._onMsg(J(fromTeacher({ t: 'rewind', toHour: 25 })));
  assert.ok(s.game.s.hour <= 25, `a rewind to hour 25 restores a checkpoint at or before it (${s.game.s.hour})`);
});
