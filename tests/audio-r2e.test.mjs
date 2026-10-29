// The third repair round's engine items (docs/AUDIO.md Appendix F): W1, the settlement fanfare of an exit at 64x; A2, the volume's taper and the headroom ahead of the soft clip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeContext, fakeClock } from './helpers/fakeaudio.mjs';
import { createAudio } from '../js/audio/engine.js';
import { RECIPES, CD_PER_VARIANT, cooldownOf, variantsOf, tierOf } from '../js/audio/recipes.js';
import { audioDefaults, DEFAULT_MASTER, VOLUME_CURVE, volumeGain, masterGain, HEADROOM, HEADROOM_DB, VERY_QUIET, statusText, applyPreset, audioSettingsHTML } from '../js/audio/settings.js';
import { eventCalls, noteCalls, newWireState } from '../js/audio/wire.js';
import { CEILING, softClipCurve } from '../js/audio/palette.js';

const rngOf = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
function rig(settings = {}, o = {}) {
  const ctx = fakeContext(o.ctx), clock = fakeClock(), s = { ...audioDefaults(), ...settings };
  const audio = createAudio({ get: () => s, now: clock.now, factory: () => ctx, timers: clock.timers_, random: rngOf(7), measure: false });
  audio.unlock();
  return { audio, ctx, clock, s };
}
const doc = readFileSync(new URL('../docs/AUDIO.md', import.meta.url), 'utf8');

// ---------------------------------------------------------------------------------------------------------------- W1
const apply = (t, calls) => { for (const [kind, id, o] of calls) t.audio[kind](id, o); t.clock.advance(30); }; // the collector's macrotask runs 0 ms later; 30 ms is a frame or two
test('W1: run.end has a cooldown of its own for each cause, so the settlement fanfare is not lost to the exit\'s start', () => {
  assert.ok(CD_PER_VARIANT.has('run.end') && RECIPES['run.end'].perVariant);
  for (const v of variantsOf('run.end')) assert.equal(cooldownOf('run.end', v), 8000, v + ' keeps its 8 s');
  assert.deepEqual(variantsOf('run.end').sort(), ['done', 'horizon', 'start']);
});
test('W1: the exit sequence at 64x plays the start and, 5.25 s later, the done fanfare', () => {
  const t = rig(); t.audio.setEnv({ speed: 64 });
  const st = newWireState(), hooks = { now: () => t.clock.now() };
  apply(t, eventCalls({ type: 'exit', kind: 'ipo' }, st, hooks)); // "Began an IPO ... settles in 48 virtual hours"
  assert.equal(t.audio.stats().played['run.end'], 1, 'the start plays');
  t.clock.advance(Math.round(48 * 7 / 64 * 1000) - 30); // 48 virtual hours at 64x, 7 s of real time an hour at 1x: 5.25 s
  apply(t, noteCalls({ final: true, exit: true, text: 'Exit complete at $1.2M. Score locked with 40 days to spare.' }, st, hooks));
  const s = t.audio.stats();
  assert.equal(s.played['run.end'], 2, 'the settlement fanfare plays: ' + JSON.stringify(s.dropped));
  assert.equal(s.dropped.cooldown || 0, 0, 'and nothing was held back by a cooldown');
});
test('W1: it is the cooldown that was holding it (the same sequence with one cooldown for the whole id loses the fanfare)', () => {
  const t = rig(); t.audio.setEnv({ speed: 64 });
  const was = RECIPES['run.end'].perVariant; RECIPES['run.end'].perVariant = false;
  try {
    apply(t, [['request', 'run.end', { variant: 'start' }]]); t.clock.advance(5220); apply(t, [['request', 'run.end', { variant: 'done' }]]);
    assert.equal(t.audio.stats().played['run.end'], 1); assert.equal(t.audio.stats().dropped.cooldown, 1, 'dropped by the 8 s cooldown');
  } finally { RECIPES['run.end'].perVariant = was; }
});
test('W1: the same cause twice inside its cooldown is still one fanfare, and the horizon is a cause of its own', () => {
  const t = rig();
  apply(t, [['request', 'run.end', { variant: 'done' }]]); t.clock.advance(2000); apply(t, [['request', 'run.end', { variant: 'done' }]]);
  assert.equal(t.audio.stats().played['run.end'], 1, 'a repeat of the same cause is dropped'); assert.equal(t.audio.stats().dropped.cooldown, 1);
  t.clock.advance(1000); apply(t, [['request', 'run.end', { variant: 'horizon' }]]);
  assert.equal(t.audio.stats().played['run.end'], 2, 'the horizon is not the done fanfare');
});
test('W1: it holds at every speed the clock has (the gap between the start and the settlement shrinks with it, down to 5.25 s)', () => {
  for (const speed of [1, 4, 16, 64]) {
    const t = rig(); t.audio.setEnv({ speed });
    apply(t, [['request', 'run.end', { variant: 'start' }]]); t.clock.advance(Math.round(48 * 7 / speed * 1000) - 30); apply(t, [['request', 'run.end', { variant: 'done' }]]);
    assert.equal(t.audio.stats().played['run.end'], 2, 'speed ' + speed);
  }
});

// ---------------------------------------------------------------------------------------------------------------- A2
test('A2: the taper is a power of 1.5, so 10 to 30% is a usable range, not a dead zone', () => {
  assert.equal(VOLUME_CURVE, 1.5); assert.equal(volumeGain(100), 1); assert.equal(volumeGain(0), 0); assert.equal(volumeGain(-5), 0); assert.equal(volumeGain(NaN), 0); assert.equal(volumeGain(500), 1);
  const db = (v) => 20 * Math.log10(volumeGain(v));
  assert.ok(Math.abs(db(5) - -39.0) < 0.1, '5% is -39 dB (it was -52)'); assert.ok(Math.abs(db(20) - -20.9) < 0.1, '20%: -21 (was -28)'); assert.ok(Math.abs(db(30) - -15.7) < 0.1, '30%: -15.7 (was -21)');
  for (let v = 5; v < 100; v += 5) assert.ok(volumeGain(v + 5) > volumeGain(v), 'monotonic at ' + v);
  assert.ok(volumeGain(30) > 0.15 && volumeGain(10) > 0.03);
});
test('A2: the headroom puts the default at unity and the top of the slider 4.6 dB above it, ahead of the compressor and the soft clip', () => {
  assert.equal(DEFAULT_MASTER, 70); assert.equal(audioDefaults().master, 70);
  assert.ok(Math.abs(volumeGain(DEFAULT_MASTER) * HEADROOM - 1) < 1e-12, 'the default is unity');
  assert.ok(Math.abs(HEADROOM_DB - 4.64) < 0.01, 'the headroom is +4.64 dB: ' + HEADROOM_DB);
  assert.ok(Math.abs(masterGain({ master: 100, mute: false, quiet: false }) - HEADROOM) < 1e-12, '100% is the headroom');
  assert.equal(masterGain({ master: 100, mute: true }), 0);
  assert.equal(masterGain({ master: 70, mute: false, quiet: true }), volumeGain(70), 'Classroom has the taper and no headroom: a room is not made louder by it');
  assert.ok(20 * Math.log10(masterGain({ master: 70, quiet: false }) / masterGain({ master: 70, quiet: true })) > 4.6, 'and so is at least 4.6 dB under Full at the same slider, before its own -6 and -10 dB');
});
test('A2: the engine\'s master gain is the settings\' (unity at the default, 0 when muted, the headroom at 100, none in Classroom) and the ambience has the taper', () => {
  const g = (t) => t.audio.chain.master.gain.value;
  assert.ok(Math.abs(g(rig()) - 1) < 1e-9);
  const t = rig(); t.audio.setMaster(100); assert.ok(Math.abs(t.audio.chain.master.gain.calls.at(-1)[1] - HEADROOM) < 1e-9);
  t.audio.setMaster(50); assert.ok(Math.abs(t.audio.chain.master.gain.calls.at(-1)[1] - volumeGain(50) * HEADROOM) < 1e-9, 'volume 50 is 0.60');
  t.audio.setMute(true); assert.equal(t.audio.chain.master.gain.calls.at(-1)[1], 0, 'muted: the master gain goes to 0');
  const q = rig({ quiet: true }); assert.ok(Math.abs(g(q) - volumeGain(70)) < 1e-9);
  const a = rig({ ambient: true, ambientLevel: 50 }); assert.ok(Math.abs(a.audio.chain.nodes.ambLevel.gain.value - volumeGain(50)) < 1e-9);
});
test('A2: the soft clip still holds the output under -3 dBFS whatever the headroom lets in', () => {
  const c = softClipCurve();
  for (const drive of [1, HEADROOM, 2 * HEADROOM, 10]) { let pk = 0; for (let x = -1; x <= 1; x += 0.001) { const v = Math.max(-1, Math.min(1, x * drive)), i = Math.round((v + 1) / 2 * (c.length - 1)); pk = Math.max(pk, Math.abs(c[i])); } assert.ok(pk <= CEILING + 1e-6, `drive ${drive}: ${pk}`); }
  assert.ok(Math.abs(CEILING - 0.708) < 1e-3);
});
test('A2: the status line says "very quiet" below 25%, and not above; at 0 and when muted it keeps its own words', () => {
  assert.equal(VERY_QUIET, 25);
  const a = { ...audioDefaults() };
  assert.match(statusText({ ...a, master: 20 }, 'running'), /very quiet/i); assert.match(statusText({ ...a, master: 5 }, 'locked'), /very quiet/i); assert.match(statusText({ ...a, master: 20 }, 'running'), /^Sound is on\./);
  assert.doesNotMatch(statusText({ ...a, master: 25 }, 'running'), /quiet/); assert.doesNotMatch(statusText(a, 'running'), /quiet/); assert.doesNotMatch(statusText({ ...a, master: 100 }, 'running'), /quiet/);
  assert.match(statusText({ ...a, master: 0 }, 'running'), /Volume is at 0/); assert.doesNotMatch(statusText({ ...a, master: 0 }, 'running'), /very quiet/);
  assert.match(statusText({ ...a, master: 10, mute: true }, 'running'), /^Sound is off/);
  assert.match(audioSettingsHTML({ ...a, master: 15 }, 'running'), /very quiet/);
  assert.doesNotMatch(statusText({ ...a, master: 15, game: false }, 'running').replace(/very quiet/, ''), /undefined|NaN/);
});
test('A2: the default level is in the document with its numbers (the taper, the headroom, the default and what each tier reaches there)', () => {
  const sec = doc.slice(doc.indexOf('### 3.2 Levels, in decibels'), doc.indexOf('### 3.3 Voices'));
  assert.match(sec, /\(v \/ 100\) \*\* 1\.5/, 'the taper'); assert.match(sec, new RegExp('\\+' + HEADROOM_DB.toFixed(1).replace('.', '\\.') + ' dB'), 'the headroom in dB'); assert.match(sec, /default of 70/i);
  assert.match(sec, /Classroom/); assert.match(sec, /very quiet/);
});
test('A2: a preset still leaves the volume alone (the headroom is in the chain, not in the number the player sets)', () => {
  const a = { ...audioDefaults(), master: 30, touched: true };
  for (const name of ['full', 'classroom', 'interface']) assert.equal(applyPreset(a, name).master, 30);
});
