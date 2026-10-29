// The sixth round (docs/AUDIO.md Appendix I): the seven open items of docs/handoff/audio-open-items-r2.json, each with a test that fails on the code before the round.
//   R3-1  the first sound after the context is made came out up to 9.8 dB quiet (Chrome's glue compressor is cold for its first 100 to 150 ms): a voice never starts before 160 ms of context time
//   R3-2  the repair dial tone was 3 to 11 dB under the quietest tiny sound on a quiet laptop for its low notes: its gain is tilted by note
//   WA-1  run-scoped resolver state leaked into the next run (a held coin, the three teaching door bells)
//   UX1   a bare click (assistive technology) never unlocked audio
//   UX2   a student with sound settings of their own joined a room unannounced; a bare volume change counted as such a setting
//   UX3   the instructor of forty had one sound choice; the loud fanfares and the shock alert played at full voice in Classroom
//   (UX4, the audition page's sticky bar, is in tests/audio-r6-page.test.mjs: it needs a browser.)
// Node only: the real engine under a recording fake context, the real wiring and settings. The render half of R3-1 and R3-2 is scripts/audio-check.mjs (--first, --dial). Run: node --test tests/audio-r6.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeContext, fakeClock } from './helpers/fakeaudio.mjs';
import { createAudio, LIMITS } from '../js/audio/engine.js';
import { RECIPES } from '../js/audio/recipes.js';
import { audioDefaults } from '../js/audio/settings.js';
import { KEEP_MS } from '../js/audio/wire.js';
import { levelsAt, quick, wt, steadyDb } from '../dev/measure.js';

const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const rngOf = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
function rig(settings = {}, o = {}) {
  const ctx = fakeContext(o.ctx), clock = fakeClock(), s = { ...audioDefaults(), ...settings };
  const audio = createAudio({ get: () => s, now: clock.now, factory: () => ctx, timers: clock.timers_, random: rngOf(7), measure: false });
  audio.unlock();
  return { audio, ctx, clock, s };
}
const sources = (ctx) => ctx.nodes.filter((n) => n.kind === 'osc' || n.kind === 'buf');
const firstStart = (ctx) => Math.min(...sources(ctx).map((n) => n.started));

// ================================================================================ R3-1: the first sound of a context
test('R3-1: a voice never starts before 160 ms of context time: the first sound after the context is made waits for the compressor, it does not play early and quiet', () => {
  assert.equal(LIMITS.WARM, 0.16, 'the compressor is cold for 100 to 150 ms; at 160 ms the loss is under half a dB (scripts/audio-check.mjs --first)');
  const t = rig();
  assert.equal(t.ctx.currentTime, 0, 'a context that was just made');
  assert.ok(t.audio.play('ui.tick', { variant: 'light', poolIndex: 0 }));
  assert.ok(Math.abs(firstStart(t.ctx) - LIMITS.WARM) < 1e-9, `starts at ${firstStart(t.ctx)}, not at LEAD (${LIMITS.LEAD})`);
  for (const n of sources(t.ctx)) assert.ok(n.started >= LIMITS.WARM - 1e-9, 'no source of the voice starts earlier');
});
test('R3-1: the wait is for the first sound only: once the context is older than WARM less LEAD a voice starts LEAD from now, as it always did', () => {
  for (const now of [0.148, 0.2, 1, 63.5]) {
    const t = rig(); t.ctx.currentTime = now;
    t.audio.play('ui.tick', { variant: 'light', poolIndex: 0 });
    const want = Math.max(now + LIMITS.LEAD, LIMITS.WARM);
    assert.ok(Math.abs(firstStart(t.ctx) - want) < 1e-9, `at ${now} s: starts at ${firstStart(t.ctx)}, wanted ${want}`);
  }
  const young = rig(); young.ctx.currentTime = 0.1; young.audio.play('ui.tick', { variant: 'light', poolIndex: 0 });
  assert.ok(Math.abs(firstStart(young.ctx) - LIMITS.WARM) < 1e-9, 'a context of 100 ms still waits, for the rest of the 160');
  const old = rig(); old.ctx.currentTime = 1; old.audio.play('ui.tick', { variant: 'light', poolIndex: 0 });
  assert.ok(Math.abs(firstStart(old.ctx) - 1.012) < 1e-9, 'and one of a second does not');
});
test('R3-1: the ambient one-shots wait the same way (a gull as the first sound of a page is as cold as a tick)', () => {
  const t = rig({ ambient: true });
  assert.ok(t.audio.playOneShot('amb.chirp'));
  assert.ok(firstStart(t.ctx) >= LIMITS.WARM - 1e-9, `starts at ${firstStart(t.ctx)}`);
  const old = rig({ ambient: true }); old.ctx.currentTime = 5; old.audio.playOneShot('amb.chirp');
  assert.ok(Math.abs(firstStart(old.ctx) - 5.012) < 1e-9);
});
test('R3-1: the oscillator budget counts a delayed voice from where it really starts, so two sounds that both wait for the compressor are alive together', () => {
  const t = rig();
  t.audio.play('ui.select', { variant: 'i0', noCooldown: true });
  t.clock.advance(100); t.ctx.currentTime = 0.1; // 100 ms later, still inside the warm-up: this voice also starts at 160 ms of context time
  t.audio.play('ui.toggle', { variant: 'on', noCooldown: true });
  const [a, b] = t.audio._voices;
  assert.ok(a && b, 'both admitted');
  assert.ok(Math.abs(a.spans[0][0] - 1160) < 1e-6, `the first voice's spans start 160 ms after its request (${a.spans[0][0] - 1000} ms)`);
  assert.ok(Math.abs(b.spans[0][0] - a.spans[0][0]) < 1e-6, `and the second's start at the same instant, 60 ms after its own request, not 12 (${b.spans[0][0] - 1100} ms)`);
  // the count the engine keeps is the real count: both voices' sources are alive at once
  const alive = (at) => sources(t.ctx).filter((n) => n.started <= at && (n.stopped ?? Infinity) > at).length;
  const spans = [...a.spans, ...b.spans], atMs = a.spans[0][0] + 5, mine = spans.filter((s) => s[0] <= atMs && s[1] > atMs).reduce((n, s) => n + s[2], 0);
  assert.equal(mine, alive(LIMITS.WARM + 0.005), 'the budget sees what is alive at the first instant both play');
});
test('R3-1: a group\'s end carries the wait (the moment queue, the voice cap and the ducks measure from it), and a duck still outlasts its sound by 300 ms', () => {
  const first = rig(), later = rig(); later.ctx.currentTime = 1;
  const h1 = first.audio.play('level.up', { variant: 'l' }), h2 = later.audio.play('level.up', { variant: 'l' });
  const len = (h, t) => h.group.endMs - t.clock.now();
  assert.ok(Math.abs((len(h1, first) - len(h2, later)) - (LIMITS.WARM - LIMITS.LEAD) * 1000) < 1e-6, `the first sound ends ${len(h1, first) - len(h2, later)} ms later, the length of its wait`);
  // the duck of a loud sound on the tiny bus: down at once, back up 300 ms after the sound ends, on the context's clock
  const g = first.audio.chain.nodes.game.tiny.gain.calls, down = g.find((c) => c[0] === 'target' && c[1] < 1), up = g.filter((c) => c[0] === 'target' && c[1] === 1).at(-1);
  const end = Math.max(...h1.group.voices.map((v) => v.end)), endLater = Math.max(...h2.group.voices.map((v) => v.end));
  assert.ok(down && up, 'ducked and released');
  assert.ok(Math.abs(up[2] - (end + 0.3)) < 1e-6, `the release is at ${up[2]}, the sound ends at ${end}: 300 ms after (the hold is measured from the group's real end)`);
  assert.ok(Math.abs((end - LIMITS.WARM) - (endLater - (1 + LIMITS.LEAD))) < 1e-9, 'and that end is the delayed one: the sound is as long as the same sound later, from its own start');
});
test('R3-1: a voice that is stopped before it has started never plays, and the tick of the press that leaves the screen is kept for as long as the longest wait', () => {
  const t = rig();
  const h = t.audio.play('ui.tick', { variant: 'full', poolIndex: 0 }); assert.ok(h);
  t.audio.stopAll(40);
  for (const n of sources(t.ctx)) assert.ok(n.stopped < n.started, `a source stopped at ${n.stopped} before its start at ${n.started} makes no sound (Web Audio: a stop before the start is a voice that never plays)`);
  assert.ok((LIMITS.WARM - LIMITS.LEAD) * 1000 < KEEP_MS, `the longest wait (${(LIMITS.WARM - LIMITS.LEAD) * 1000} ms) is shorter than what unwire keeps (${KEEP_MS} ms): a first tick that is leaving the screen is kept, not cut`);
  const k = rig(); k.audio.play('ui.tick', { variant: 'full', poolIndex: 0 }); k.clock.advance(120); k.audio.release(KEEP_MS);
  for (const n of sources(k.ctx)) assert.equal(n.stopped > n.started, true, 'a voice requested 120 ms ago is left to play');
});
test('R3-1: AUDIO.md 3.7 no longer says the long-lived context has no such problem, and says what the engine does', () => {
  const doc = src('docs/AUDIO.md'), i = doc.indexOf('- **Warm-up.**'), s = doc.slice(i, doc.indexOf('- **Soft clip**', i));
  assert.ok(i > 0);
  assert.ok(!/long-lived and has no such problem/.test(s) && !/The engine's context is long-lived/.test(s), 'the sentence the review found false');
  assert.match(s, /first sound/i); assert.match(s, /LIMITS\.WARM/); assert.match(s, /160 ms/);
  assert.match(s, /9\.8 dB/, 'the number that was measured');
});
test('R3-1: scripts/audio-check.mjs holds the first sounds of the review at 44.1 and 48 kHz within 1 dB, with the helpers of dev/measure.js', () => {
  const check = src('scripts/audio-check.mjs'), measure = src('dev/measure.js');
  for (const k of ['ui.tick#light', 'ui.select#i0', 'world.step#a', 'ui.toggle#on', 'draft.pick#slot2', 'ui.ok#o', 'sale.win#w']) assert.ok(check.includes(`'${k}'`), k);
  assert.match(check, /FIRST_TOL = 1\.0/); assert.match(check, /m\.firstSound\(\$\{sr\}/); assert.match(check, /\[44100, 48000\]/);
  assert.match(check, /await firstSoundCheck\(call\)/, 'the full run makes it');
  assert.match(measure, /export async function firstSound\(/); assert.match(measure, /export function engineRig\(/);
});
test('R3-1: the weightings the render checks use at the context\'s own rate are the table\'s at 48 kHz, and the same filters at 44.1 kHz', () => {
  const noise = (sr, n, seed = 5) => { const r = rngOf(seed), x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = (r() * 2 - 1) * 0.1 * Math.exp(-i / (0.15 * sr)); return x; };
  const tone = (sr, f, n) => Float32Array.from({ length: n }, (_, i) => 0.1 * Math.sin(2 * Math.PI * f * i / sr));
  for (const x of [noise(48000, 24000), tone(48000, 1000, 24000), tone(48000, 300, 24000), tone(48000, 5000, 24000)]) {
    const old = quick(x), now = levelsAt(x, 48000);
    assert.ok(Math.abs(old.fast - now.fastK) < 0.02, `K-weighted Fast: the table's ${old.fast.toFixed(3)} against ${now.fastK.toFixed(3)}`);
    assert.ok(Math.abs(old.lapFastA - now.fastA) < 0.02, `quiet-laptop Fast: the table's ${old.lapFastA.toFixed(3)} against ${now.fastA.toFixed(3)}`);
  }
  // the response is a property of the filter, not of the rate: a tone through each weighting is as loud at 44.1 kHz as at 48 kHz (a sine has the same level whatever its sampling)
  const gain = (f, sr, w) => { const x = tone(sr, f, sr), y = w(x, sr), from = Math.round(sr * 0.5); return steadyDb(y, from, y.length) - steadyDb(x, from, x.length); };
  for (const f of [150, 300, 440, 1000, 3000, 6000]) {
    for (const [name, w] of [['K', wt.k], ['high-pass then A', (x, sr) => wt.a(wt.hp(x, sr), sr)]]) assert.ok(Math.abs(gain(f, 44100, w) - gain(f, 48000, w)) < 0.2, `${name} at ${f} Hz: ${gain(f, 44100, w).toFixed(2)} dB at 44.1 kHz, ${gain(f, 48000, w).toFixed(2)} at 48`);
  }
  assert.ok(Math.abs(gain(1000, 44100, (x, sr) => wt.a(x, sr))) < 0.05 && Math.abs(gain(1000, 48000, (x, sr) => wt.a(x, sr))) < 0.05, 'the A-weighting reads 0 dB at 1 kHz at both rates');
  assert.ok(Math.abs(gain(100, 48000, (x, sr) => wt.a(x, sr)) + 19.1) < 0.3, 'and -19.1 dB at 100 Hz (IEC 61672)');
});

// ================================================================================ R3-2: the repair dial tone's level by note
import * as engine from '../js/audio/engine.js';
const NOTE_HZ = { D4: 293.66, E4: 329.63, 'F#4': 369.99, A4: 440, B4: 493.88, D5: 587.33, E5: 659.26, 'F#5': 739.99, A5: 880, B5: 987.77, D6: 1174.66 };
test('R3-2: the dial tone\'s gain table is finite, tapers from D4 to nothing at D6, and the loudest note stays far under the tiny ceiling', () => {
  const { DIAL_NOTES, DIAL_BASE_DB, DIAL_TILT_DB, DIAL_RISE_DB, dialGainDb } = engine;
  assert.deepEqual(DIAL_NOTES, ['D4', 'E4', 'F#4', 'A4', 'B4', 'D5', 'E5', 'F#5', 'A5', 'B5', 'D6'], 'the eleven notes of the marker\'s bar');
  assert.ok(Array.isArray(DIAL_TILT_DB) && Array.isArray(DIAL_RISE_DB) && Number.isFinite(DIAL_BASE_DB), 'the tables exist');
  for (const t of [DIAL_TILT_DB, DIAL_RISE_DB]) { assert.equal(t.length, DIAL_NOTES.length, 'a gain for every note'); for (const v of t) assert.ok(Number.isFinite(v), 'finite: ' + v); }
  for (let i = 1; i < DIAL_TILT_DB.length; i++) assert.ok(DIAL_TILT_DB[i] <= DIAL_TILT_DB[i - 1], `the tilt tapers: ${DIAL_NOTES[i]} (${DIAL_TILT_DB[i]}) is not above ${DIAL_NOTES[i - 1]} (${DIAL_TILT_DB[i - 1]})`);
  assert.equal(DIAL_TILT_DB.at(-1), 0, 'and is nothing at D6');
  assert.ok(DIAL_TILT_DB[0] >= 6 && DIAL_TILT_DB[0] <= 9, `D4 is lifted by about 8 dB over D6 (${DIAL_TILT_DB[0]}): a quiet laptop takes 8 dB more off D4 than off D6`);
  assert.ok(DIAL_TILT_DB[3] > 2 && DIAL_TILT_DB[3] < DIAL_TILT_DB[1], 'A4 is lifted by a few dB, less than E4');
  for (const v of DIAL_RISE_DB) assert.ok(v >= -2 && v <= 3, `the zone adds at most the 3 dB it always did (${v})`);
  // the in-zone tone is the fundamental with an octave partial of 0.35 and a shimmer of 0.18: its peak, with the loudest gain of any note, is far under the tiny ceiling of -6 dBFS
  const loudest = Math.max(...DIAL_NOTES.flatMap((_, i) => [dialGainDb(i, false), dialGainDb(i, true)])), peak = loudest + 20 * Math.log10(1 + 0.35 + 0.18);
  assert.ok(peak <= -12, `the loudest note peaks at ${peak.toFixed(1)} dBFS at the most`);
  // it was one level, -33 out of the zone and -30 in it
  assert.ok(dialGainDb(0, false) - dialGainDb(10, false) > 5, 'D4 is well above D6 now');
  assert.ok(dialGainDb(10, false) > -33, 'and the whole tone is louder than the -33 dBFS it was (D6 was 4.7 dB under the tiny median on a flat speaker)');
});
test('R3-2: the engine\'s tone is at the table\'s gain for the note the marker is on, in the zone and out of it, reached with the same 20 ms as before (no step)', () => {
  const t = rig({ dial: true });
  assert.ok(t.audio.dial.start());
  const [g, main, oct, shim, og, sg] = t.ctx.nodes.slice(-6), dB = (x) => 10 ** (x / 20); // the tone's own six nodes are the last made
  assert.equal(g.kind, 'gain'); assert.equal(main.kind, 'osc'); assert.equal(sg.kind, 'gain');
  const ramp = g.gain.calls.find((c) => c[0] === 'linear');
  assert.ok(Math.abs(ramp[1] - dB(engine.dialGainDb(0, false))) < 1e-12, 'it starts on D4 at D4\'s gain, from silence, in 30 ms');
  const last = () => g.gain.calls.at(-1);
  for (const [pos, lo, hi, i, zone] of [[0.5, 0.4, 0.6, 5, true], [0, 0.9, 1, 0, false], [1, 0, 0.1, 10, false], [0.3, 0.2, 0.4, 3, true], [0.2, 0.9, 1, 2, false], [0.1, 0, 0.2, 1, true]]) {
    t.audio.dial.update(pos, lo, hi);
    assert.equal(last()[0], 'target', 'the gain moves toward its value, it is never set (a step would click)'); assert.equal(last()[3], 0.02, '20 ms');
    assert.ok(Math.abs(last()[1] - dB(engine.dialGainDb(i, zone))) < 1e-12, `${engine.DIAL_NOTES[i]} ${zone ? 'in' : 'out of'} the zone`);
  }
  assert.equal(g.gain.calls.filter((c) => c[0] === 'set').length, 1, 'only the fade-in\'s own start is a set');
});
test('R3-2: no two oscillators of the tone share a pitch: the shimmer (A5) is left out at A4, whose octave is A5, and at A5 itself', () => {
  const t = rig({ dial: true }); t.audio.dial.start();
  const [, main, oct, shim, og, sg] = t.ctx.nodes.slice(-6), f =(o) => o.frequency.calls.filter((c) => c[0] === 'target').at(-1)?.[1] ?? o.frequency.value, on = (gn) => gn.gain.calls.filter((c) => c[0] === 'target').at(-1)?.[1] ?? gn.gain.value;
  for (const [i, name] of engine.DIAL_NOTES.entries()) {
    t.audio.dial.update(i / 10, i / 10 - 0.01, i / 10 + 0.01); // in the zone
    const voices = [[f(main), 1], [f(oct), on(og)], [f(shim), on(sg)]].filter(([, g]) => g > 0.001);
    assert.ok(Math.abs(f(main) - NOTE_HZ[name]) < 0.5, `${name} is ${f(main)}`);
    for (let a = 0; a < voices.length; a++) for (let b = a + 1; b < voices.length; b++) assert.ok(Math.abs(voices[a][0] - voices[b][0]) > 20, `${name}: two oscillators at ${voices[a][0].toFixed(1)} and ${voices[b][0].toFixed(1)} Hz add by their phase, which nothing controls`);
    t.audio.dial.update(i / 10, i < 5 ? 0.9 : 0, i < 5 ? 1 : 0.1); // out of it: a plain sine
    assert.ok(on(og) < 0.001 && on(sg) < 0.001, `${name} out of the zone is a sine`);
  }
  assert.ok(engine.sharesShimmer(440) && engine.sharesShimmer(880) && !engine.sharesShimmer(370) && !engine.sharesShimmer(1174.66));
  t.audio.dial.update(0.3, 0.29, 0.31); assert.ok(on(sg) < 0.001, 'A4 in the zone: octave only'); t.audio.dial.update(0.2, 0.19, 0.21); assert.ok(on(sg) > 0.1, 'F#4 in the zone: octave and shimmer');
});
test('R3-2: AUDIO.md 4.5 says what the level is now and scripts/audio-check.mjs holds every note against the tiny tier at both rates', () => {
  const doc = src('docs/AUDIO.md'), s = doc.slice(doc.indexOf('### 4.5 The one continuous voice'), doc.indexOf('## 5. What is deliberately silent'));
  assert.ok(!/\*\*Level\*\*: 6 dB under a tiny sound/.test(s), 'the old level');
  assert.match(s, /DIAL_TILT_DB/); assert.match(s, /within 3 dB of the tiny tier's median/);
  const check = src('scripts/audio-check.mjs');
  assert.match(check, /DIAL_TOL = 3\.0/); assert.match(check, /m\.dialTone\(\$\{sr\}\)/); assert.match(check, /--dial/); assert.match(check, /await dialCheck\(call, tierMedian\.tiny\)/);
});

// ================================================================================ WA-1: what a run keeps, and what the page keeps
import { createResolverState, resetRun, dropHeld, holdRelease, RUN_FIELDS } from '../js/audio/resolve.js';
/** What the resolver measures in real time whatever run is on: the reward budget (a fanfare that rang 5 s ago holds the next one back, in a new run too) and the counters `stats()` reports. */
const KEPT_FIELDS = ['lastFull', 'lastTick', 'lastDaily', 'lastFullLevel', 'sentences', 'bursts', 'maxSentences'];
/** A resolver state that a run has used: every field away from where a first run starts. */
function used() {
  const st = createResolverState();
  Object.assign(st, { lastFull: 5000, lastTick: 5100, lastDaily: 5200, lastFullLevel: 5300, lastBuyer: 6000, lastUrgent: 6100, lastCycle: 6200, buyers: 7, days: 9, holdNet: 120, holdAny: true, fastNet: 33, nextFast: 99999, sentences: 4, bursts: 3, maxSentences: 2 });
  st.states.overdraft = { last: 6300, sum: 12 };
  return st;
}
test('WA-1: every field of the resolver state belongs to the run or to the page, so a field added later cannot be forgotten by a new run', () => {
  assert.deepEqual([...RUN_FIELDS, ...KEPT_FIELDS].sort(), Object.keys(createResolverState()).sort(), 'put a new field in RUN_FIELDS (a run starts without it) or say here why the page keeps it');
  assert.deepEqual(RUN_FIELDS.filter((k) => KEPT_FIELDS.includes(k)), [], 'and on one side only');
});
test('WA-1: resetRun puts the run\'s fields back to a first run\'s, in place, and leaves the reward budget and the counters', () => {
  const st = used(), states = st.states, fresh = createResolverState();
  assert.equal(resetRun(st), st, 'in place: the engine keeps the one object');
  for (const k of RUN_FIELDS) assert.deepEqual(st[k], fresh[k], `${k} is a first run's`);
  assert.deepEqual(st.states, {}); assert.notEqual(st.states, states, 'the standing-state gates are a new object (a state that was announced 40 s ago is announced again by the new run)');
  for (const k of KEPT_FIELDS) assert.equal(st[k], used()[k], `${k} stays`);
});
test('WA-1: dropHeld forgets the sums that wait for a coin, and only those', () => {
  const st = dropHeld(used()), was = used();
  assert.deepEqual([st.holdNet, st.holdAny, st.fastNet], [0, false, 0]);
  for (const k of Object.keys(was).filter((k) => !['holdNet', 'holdAny', 'fastNet'].includes(k))) assert.deepEqual(st[k], was[k], `${k} stays`);
  assert.equal(holdRelease(st, 5000), null, 'and a dialog that closes after it has no coin to play');
});
test('WA-1: a coin held under a dialog does not outlive the game that held it: hold, a manager cycle, release, then the next game\'s first dialog plays nothing', () => {
  const t = rig(); t.audio.setEnv({ netWorth: 10000, speed: 1 });
  const coins = () => (t.audio.stats().played['cash.in'] || 0) + (t.audio.stats().played['cash.out'] || 0);
  // the control: in one game the held cycles come out as one coin when the dialog closes
  t.audio.hold(true);
  assert.equal(t.audio.request('manager.cycle', { meta: { net: 4000 } }), false, 'held');
  assert.equal(t.audio.request('manager.cycle', { meta: { net: 2500 } }), false, 'held');
  t.audio.hold(false); t.clock.advance(60);
  assert.equal(coins(), 1, 'one coin for both (the control: the hold works)');
  t.clock.advance(5000); // (long after the coin's own cooldown: a second coin that is held back must be held back by the fix, not by that)
  // a dialog is open, a cycle is held, and the game is left (unwire releases the engine): the sheet that would release the coin is gone with the game
  t.audio.hold(true); t.audio.request('manager.cycle', { meta: { net: 4000 } });
  t.audio.release(KEEP_MS);
  const built = sources(t.ctx).length;
  // the next game's first dialog opens and closes
  t.audio.hold(true); t.audio.hold(false); t.clock.advance(60);
  assert.equal(coins(), 1, 'no second coin: it rang a shower for money of another run (cash.in xl)');
  assert.equal(sources(t.ctx).length, built, 'nothing was built');
});
test('WA-1: the 16x coin\'s sum goes with the game too, not only the dialog\'s', () => {
  const t = rig(); t.audio.setEnv({ netWorth: 10000, speed: 16 });
  const st = t.audio._resolver;
  t.audio.request('manager.cycle', { meta: { net: 40 } }); t.clock.advance(60); // the first plays, with its sum
  t.audio.request('manager.cycle', { meta: { net: 70 } }); // within the 8 s: summed, not played
  assert.equal(st.fastNet, 70);
  t.audio.release(KEEP_MS);
  assert.equal(st.fastNet, 0, 'a game that is left takes the sum with it');
});
test('WA-1: the three door bells that teach the cue are a run\'s: after newRun the next run\'s first three ring, however soon after the last run\'s', () => {
  const t = rig(), bells = () => t.audio.stats().played['buyer.arrive'] || 0;
  const arrive = () => { t.audio.request('buyer.arrive', { clock: true }); t.clock.advance(3500); };
  for (let i = 0; i < 3; i++) arrive();
  assert.equal(bells(), 3, 'three bells');
  arrive(); assert.equal(bells(), 3, 'the fourth, 10 s after the first, waits for the 30 s gap');
  for (let i = 0; i < 3; i++) arrive();
  assert.equal(bells(), 3, 'the control: in a run that goes on, the next buyers are held to one per 30 s');
  t.audio.newRun();
  for (let i = 0; i < 3; i++) arrive();
  assert.equal(bells(), 6, 'a new run teaches the cue again, 3.5 s apart');
  arrive(); assert.equal(bells(), 6, 'and its fourth waits for the 30 s as ever');
});
test('WA-1: a new run keeps the reward budget, and so does leaving a game: a fanfare that rang a few seconds ago still holds the next one back', () => {
  const t = rig(); t.audio.setEnv({ lastPress: t.clock.now() });
  t.audio.request('level.up', { meta: { level: 2 } }); t.audio.request('sale.win', { variant: 'w', with: [['cash.in', { size: 'm' }]] }); t.clock.flush();
  const rs = t.audio._resolver, budget = KEPT_FIELDS.map((k) => rs[k]);
  assert.ok(rs.lastFull > -Infinity, 'a full reward sentence was spent');
  t.audio.newRun(); assert.deepEqual(KEPT_FIELDS.map((k) => rs[k]), budget, 'newRun');
  t.audio.release(KEEP_MS); assert.deepEqual(KEPT_FIELDS.map((k) => rs[k]), budget, 'release');
});
