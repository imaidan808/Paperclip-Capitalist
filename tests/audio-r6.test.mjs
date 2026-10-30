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
import { readFileSync, readdirSync, statSync } from 'node:fs';
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

// ================================================================================ UX2: a volume is not a choice about the mix, and a student whose own mix stays is told
import * as S from '../js/audio/settings.js';
import * as wire from '../js/audio/wire.js';
/** The Sound section as stand-ins, one element for each id of the markup, bound to a settings object: enough to press a control and see what it stored. */
function section(settings) {
  const audio = { state: 'running', sync() {}, play() {}, unlock() {}, on: () => () => {} };
  const html = S.audioSettingsHTML(settings.audio, 'running'), made = {};
  const keyOf = { 's-preset': 'preset', 's-vol': 'master', 's-mute': 'mute', 's-ui': 'ui', 's-game': 'game', 's-world': 'worldTicks', 's-clock': 'clockSounds', 's-amb': 'ambient', 's-ambvol': 'ambientLevel', 's-dial': 'dial', 's-mkey': 'mKey' };
  for (const [, id] of html.matchAll(/id="(s-[a-z-]+)"/g)) {
    const type = /vol$/.test(id) ? 'range' : id === 's-preset' ? 'select' : id === 's-sample' ? 'button' : /-h$/.test(id) || id === 's-status' ? 'span' : 'checkbox';
    const e = { id, type, checked: false, value: '', disabled: false, textContent: '', dataset: {}, setAttribute() {}, querySelector: () => null, appendChild() {}, ownerDocument: { createElement: () => ({}) }, remove() {} };
    if (keyOf[id]) e.dataset.snd = keyOf[id];
    made[id] = e;
  }
  const sec = { querySelector: (sel) => (sel.startsWith('#') ? made[sel.slice(1)] || null : null), querySelectorAll: () => [] };
  const root = { isConnected: true, querySelector: (sel) => (sel === 'fieldset.snd' ? sec : sel.startsWith('#') ? made[sel.slice(1)] || null : null), querySelectorAll: (sel) => (sel === '[data-snd]' ? Object.values(made).filter((e) => e.dataset.snd) : []) };
  S.bindAudioSettings(root, { audio, settings, save() {}, announce() {} });
  return made;
}
/** The page layer's deps for pendingRoom and applyRoomRule: the settings, a key-value store and the toasts it raised. */
function depsOf(audio = {}) {
  const m = new Map(), toasts = [];
  return { settings: { audio: { ...audioDefaults(), ...audio } }, kv: { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => { m.set(k, v); return true; }, del: (k) => { m.delete(k); } }, save() {}, toast: (msg, level) => toasts.push([msg, level]), toasts };
}
test('UX2: moving the volume or the ambience level is not a choice about the mix: it leaves `touched` as it was, and every other control still sets it', () => {
  assert.deepEqual(S.LEVEL_KEYS, ['master', 'ambientLevel']);
  const settings = { audio: audioDefaults() }, made = section(settings);
  made['s-vol'].value = '30'; made['s-vol'].oninput(); made['s-vol'].onchange();
  assert.equal(settings.audio.master, 30); assert.equal(settings.audio.touched, false, 'the volume alone: a student who only turned it down is still a student the room can put in its rule');
  made['s-ambvol'].value = '40'; made['s-ambvol'].oninput(); made['s-ambvol'].onchange();
  assert.equal(settings.audio.ambientLevel, 40); assert.equal(settings.audio.touched, false, 'and so is the ambience level');
  for (const id of ['s-mute', 's-ui', 's-game', 's-world', 's-clock', 's-amb', 's-dial', 's-mkey']) {
    settings.audio = audioDefaults(); const e = made[id]; e.checked = !e.checked; e.onchange();
    assert.equal(settings.audio.touched, true, `${id} is a choice of the mix`);
  }
  settings.audio = audioDefaults(); made['s-preset'].value = 'classroom'; made['s-preset'].onchange(); assert.equal(settings.audio.touched, true, 'a preset is a choice');
  settings.audio = { ...audioDefaults(), touched: true }; made['s-vol'].value = '55'; made['s-vol'].oninput(); assert.equal(settings.audio.touched, true, 'and a volume moved after a choice does not take the choice back');
  settings.audio = audioDefaults(); assert.equal(S.toggleMute(settings.audio).next.touched, true, 'key M and the speaker button are choices (a mute)');
});
test('UX2: a student who only moved the volume is put in the room\'s rule like any other, at the volume they chose; a volume of 0 stays 0', () => {
  const settings = { audio: audioDefaults() }, made = section(settings);
  made['s-vol'].value = '35'; made['s-vol'].oninput();
  const j = S.joinRoom(settings.audio);
  assert.ok(j, 'the join reaches them: it was refused for a student who had only turned the volume down');
  assert.equal(j.next.quiet, true); assert.equal(j.next.master, 35, 'their volume is theirs'); assert.equal(j.next.touched, false); assert.equal(j.before.master, 35);
  const zero = S.joinRoom({ ...audioDefaults(), master: 0 });
  assert.equal(zero.next.quiet, true); assert.equal(zero.next.master, 0, 'a student who turned the volume to 0 to be quiet is not un-silenced by the room');
  assert.equal(S.applyPreset({ ...audioDefaults(), master: 0 }, 'classroom').master, 70, 'the control: a preset the student chooses still raises 0 to 70 (Full at 0 would be silent)');
  assert.deepEqual(S.roomPreset({ ...audioDefaults(), master: 0, touched: true }), { ...S.applyPreset(audioDefaults(), 'classroom'), master: 0, touched: false }, 'the room\'s preset: Classroom, the volume kept, not a choice');
  const left = S.leaveRoom(j.next, j.before); assert.equal(left.quiet, false); assert.equal(left.master, 35); assert.equal(left.touched, false);
});
test('UX2: the note for a student whose own sound stays says what stays, in words, and how to get quieter; and what the instructor\'s link had asked for', () => {
  const full = { ...audioDefaults(), master: 80, touched: true };
  assert.equal(S.ownSoundText(full), 'Your own sound settings stay in this room (Full, 80 percent). Press M to mute, or choose Classroom (quieter) under Display and sound.');
  assert.match(S.ownSoundText({ ...full, game: false, ambient: true }), /\(your own mix, 80 percent\)/);
  assert.match(S.ownSoundText({ ...full, game: false, clockSounds: true }), /\(Interface only, 80 percent\)/);
  assert.equal(wire.linkSound('?room=ABCD&sound=quiet'), 'quiet'); assert.equal(wire.linkSound('?sound=classroom'), 'quiet'); assert.equal(wire.linkSound('?room=ABCD&sound=OFF'), 'off');
  assert.equal(wire.linkSound('?room=ABCD'), ''); assert.equal(wire.linkSound('?sound=full'), ''); assert.equal(wire.linkSound('garbage'), '');
  assert.match(S.ownSoundText(full, 'quiet'), /^Your instructor's link asked for quiet sound, but your own sound settings stay in this room \(Full, 80 percent\)\. Press M to mute/);
  assert.match(S.ownSoundText(full, 'off'), /^Your instructor's link asked for no sound, but your own sound settings stay in this room/);
});
test('UX2: a student with sound of their own who joins a room gets ONE note, once per room; a student who hears nothing, or who is in Classroom, or who only moved the volume, gets the note that is theirs', () => {
  const d = depsOf({ touched: true, master: 80 }), before = { ...d.settings.audio };
  assert.equal(wire.pendingRoom({ code: 'ABCD' }, d), 'told', 'nothing was said to them: no Classroom, no toast, no line in the Draft, and Begin played at full volume');
  assert.deepEqual(d.toasts, [['Your own sound settings stay in this room (Full, 80 percent). Press M to mute, or choose Classroom (quieter) under Display and sound.', 'info']]);
  assert.deepEqual(d.settings.audio, before, 'and their settings stay exactly as they were');
  assert.equal(wire.pendingRoom({ code: 'ABCD' }, d), null, 'the Draft drawn again says nothing more'); assert.equal(wire.applyRoomRule(d, true), null, 'nor does the game\'s own check at Begin'); assert.equal(d.toasts.length, 1);
  assert.equal(wire.pendingRoom({ code: 'WXYZ' }, d), 'told', 'another room is another note'); assert.equal(d.toasts.length, 2);
  for (const [name, over] of [['muted', { mute: true }], ['volume 0', { master: 0 }], ['both buses off', { ui: false, game: false }]]) {
    const x = depsOf({ touched: true, ...over }); assert.equal(wire.pendingRoom({ code: 'ABCD' }, x), null, name); assert.equal(x.toasts.length, 0, `${name}: told nothing about a sound they cannot hear`);
  }
  const q = depsOf({ touched: true, quiet: true }); assert.equal(wire.pendingRoom({ code: 'ABCD' }, q), 'told'); assert.deepEqual(q.toasts, [[wire.ROOM_TOAST, 'info']], 'in Classroom by their own choice: the Classroom note, as before');
  const v = depsOf({ master: 35 }); assert.equal(wire.pendingRoom({ code: 'ABCD' }, v), 'joined', 'a volume alone is no choice: the room\'s rule applies'); assert.deepEqual(v.toasts, [[wire.ROOM_TOAST, 'info']]); assert.equal(v.settings.audio.master, 35); assert.equal(v.settings.audio.quiet, true);
});
test('UX2: the faculty kit\'s class script is true for every student (press M now, or use headphones), and it no longer says that a volume keeps a student out of Classroom', () => {
  const kit = src('docs/FACULTY_KIT.md');
  assert.match(kit, /press \*\*M\*\* now, or use headphones/i);
  assert.ok(!/tell them sound is quiet in a room/.test(kit), 'step 2 told the class something that was not true for a student with settings of their own');
  assert.ok(!/Sound is quiet in a room; press/.test(kit), 'and so did the script under Sound');
  assert.ok(!/the volume alone included, keeps their own/.test(kit), 'the volume is no longer such a setting');
  assert.match(kit, /Your own sound settings stay in this room/, 'the kit says what such a student is told');
});

// ================================================================================ UX3: Sound in the student link (Normal / Quiet / Off), and the softer voices of Classroom
import { tierOf, variantsOf } from '../js/audio/recipes.js';
import { Session } from '../js/session.js';
import { instructorParts, LINK_SOUNDS, LINK_COPIED } from '../js/ui/instructor.js';
const roomSession = (over = {}) => { const ses = new Session(); ses.mode = 'instructor'; ses.roomInfo = { code: 'ABCD', relay: '', role: 'instructor', ...over }; ses.room = { kind: 'local', state: 'open' }; return ses; };
/** A page as it boots on an instructor's link: the saved settings, the address, the remembered rule (common.js does these two in this order), and the page layer's deps. */
function bootOn(saved, search) {
  const d = depsOf(), settings = { audio: { ...audioDefaults(), ...saved, v: 1 } };
  wire.rememberLinkRule(d.kv, settings, search);
  d.settings.audio = S.migrateAudio(settings, search);
  return d;
}
const FULL80 = { master: 80 };
/** Every .js under a folder of the repository (not node_modules or the revision-1 prototype), as paths from the root. */
const walk = (dir) => { const out = []; for (const f of readdirSync(new URL('../' + dir, import.meta.url))) { const p = dir + '/' + f, st = statSync(new URL('../' + p, import.meta.url)); if (st.isDirectory()) { if (f !== 'node_modules' && f !== 'audio-proto') out.push(...walk(p)); } else if (f.endsWith('.js')) out.push(p); } return out; };
test('UX3: Classroom plays the voice one tier down for the loud rewards and the shock alert; with the rule off a request is unchanged', () => {
  const off = (id, o) => wire.softened(id, o, false), on = (id, o) => wire.softened(id, o, true);
  const lv = { variant: 'l', meta: { level: 5 } };
  assert.equal(off('level.up', lv)[1], lv, 'the same request, not a copy'); assert.equal(wire.softened('level.up', lv)[1], lv, 'the rule is off unless it is asked for');
  assert.deepEqual(on('level.up', { meta: { level: 5 } }), ['level.up', { variant: 's', meta: { level: 5 } }]);
  assert.equal(on('level.up', { variant: 'big', meta: { level: 10 } })[1].variant, 's', 'not even every fifth level is the big one');
  assert.deepEqual(on('achievement', { variant: 'epic', meta: { rarity: 'epic' } }), ['achievement', { variant: 'rare', meta: { rarity: 'epic' } }]);
  for (const v of ['common', 'rare']) assert.deepEqual(on('achievement', { variant: v }), ['achievement', { variant: v }], `${v} is already small`);
  for (const n of [1, 2, 3]) assert.deepEqual(on('milestone', { variant: 'm' + n }), ['quest.complete', { variant: 'quest' }]);
  assert.deepEqual(['tiktok', 'fed', 'tariff'].map((k) => on('alert.shock', { variant: k })[1].variant), ['viral', 'glut', 'glut']);
  for (const v of ['viral', 'glut', 'scare']) assert.deepEqual(on('alert.shock', { variant: v }), ['alert.shock', { variant: v }], `${v} is already medium`);
  for (const id of ['cash.in', 'sale.win', 'alert.margin-call', 'zone.open']) { const x = { variant: 'x' }; assert.equal(on(id, x)[1], x, `${id} is not one of them`); }
  // the table is the sound map's own: every voice it returns exists, and for every loud variant of the four ids it returns one that is not loud
  let loud = 0;
  for (const id of ['level.up', 'achievement', 'milestone', 'alert.shock']) for (const v of variantsOf(id)) {
    const [rid, ro] = on(id, { variant: v });
    assert.ok(RECIPES[rid]?.variants[ro.variant], `${id}#${v} -> ${rid}#${ro.variant} exists`);
    if (tierOf(id, v) === 'loud') { loud++; assert.notEqual(tierOf(rid, ro.variant), 'loud', `${id}#${v} (loud) must not stay loud in Classroom: ${rid}#${ro.variant} is ${tierOf(rid, ro.variant)}`); }
  }
  assert.ok(loud >= 7, `${loud} loud variants of those ids are softened (level l and big, epic, three milestones, three shocks)`);
});
test('UX3: the wiring asks for the softer voice only while the page\'s rule is on, for a level, a milestone, a shock and Market fatigue', () => {
  const quiet = { quiet: () => true }, loud = { quiet: () => false };
  const ev = (type, o) => wire.eventCalls({ type, ...o }, wire.newWireState(), quiet), full = (type, o) => wire.eventCalls({ type, ...o }, wire.newWireState(), loud);
  assert.deepEqual(ev('level', { level: 5 }), [['request', 'level.up', { variant: 's', meta: { level: 5 } }]]);
  assert.deepEqual(full('level', { level: 5 }), [['request', 'level.up', { meta: { level: 5 } }]], 'the rule off: the request it always was (the resolver chooses the voice)');
  assert.deepEqual(wire.eventCalls({ type: 'level', level: 5 }, wire.newWireState(), {}), [['request', 'level.up', { meta: { level: 5 } }]], 'no hook, no rule');
  assert.deepEqual(ev('milestone', { n: 2 }), [['request', 'quest.complete', { variant: 'quest' }]]); assert.deepEqual(full('milestone', { n: 2 }), [['request', 'milestone', { variant: 'm2' }]]);
  assert.deepEqual(ev('shock', { kind: 'tiktok' }), [['request', 'alert.shock', { variant: 'viral' }]]); assert.deepEqual(ev('shock', { kind: 'fed' }), [['request', 'alert.shock', { variant: 'glut' }]]);
  assert.deepEqual(full('shock', { kind: 'fed' }), [['request', 'alert.shock', { variant: 'fed' }]]); assert.deepEqual(ev('shock', { kind: 'scare' }), [['request', 'alert.shock', { variant: 'scare' }]]);
  assert.deepEqual(wire.noteCalls({ text: 'Market fatigue in District 3.' }, wire.newWireState(), quiet), [['request', 'alert.shock', { variant: 'glut', state: 'fatigue' }]], 'the state sound is already the medium voice');
  // and the engine plays what is asked: a level in Classroom is the medium run, not the fanfare
  const t = rig({ quiet: true }); t.audio.setEnv({ lastPress: t.clock.now() });
  for (const [m, id, o] of ev('level', { level: 5 })) t.audio[m](id, o);
  t.clock.advance(60);
  const plays = t.audio.stats().lastBurst.plays, voice = plays[0].mix[0];
  assert.equal(voice[0], 'level.up'); assert.equal(voice[1].variant, 's', 'the everyday run'); assert.equal(tierOf('level.up', voice[1].variant), 'medium');
  assert.equal(t.audio._resolver.lastFullLevel, -Infinity, 'and the 90 s window of the full fanfare is not spent by it');
});
test('UX3: no call site asks for a level, an epic achievement, a milestone or the shock alert except through softened()', () => {
  const files = [...walk('js'), ...walk('dev')].filter((f) => !/js\/audio\/(recipes|trims|resolve|engine)\.js$/.test(f));
  const bare = /\.(request|play|playMix)\(\s*['"](level\.up|alert\.shock|milestone|achievement)['"]|\[\s*['"](request|play)['"]\s*,\s*['"](level\.up|alert\.shock|milestone|achievement)['"]/;
  for (const f of files) assert.ok(!bare.test(src(f)), `${f} asks for one of them without softened()`);
  const w = src('js/audio/wire.js');
  assert.equal((w.match(/soft\(hooks, 'level\.up'/g) || []).length, 1); assert.equal((w.match(/soft\(hooks, 'milestone'/g) || []).length, 1); assert.equal((w.match(/soft\(hooks, 'alert\.shock'/g) || []).length, 2, 'the shock event and Market fatigue');
  assert.match(src('js/ui/shell.js'), /audio\.request\(\.\.\.softened\('achievement', \{[^}]*\}[^)]*settings\.audio\?\.quiet === true\)\)/, 'the shell\'s achievement request');
  assert.match(src('js/audio/index.js'), /softened, rememberLinkRule/);
  assert.match(src('dev/audition.js'), /softened\(id, opts, quiet\)/, 'the audition page\'s bursts'); assert.match(src('dev/sounds.js'), /quiet: \(\) => A\(\)\.quiet === true/, 'and its minute');
});
test('UX3: the three link values: Normal adds nothing, Quiet is Classroom as the room\'s rule applied early, Off is Classroom with Mute on; neither is the student\'s own choice, and neither raises a volume of 0', () => {
  const at = (search, saved = FULL80) => S.migrateAudio({ audio: { ...audioDefaults(), ...saved, v: 1 } }, search);
  const normal = at('?room=ABCD'), quiet = at('?room=ABCD&sound=quiet'), off = at('?room=ABCD&sound=off');
  assert.deepEqual([normal.quiet, normal.mute, normal.touched], [false, false, false], 'Normal: nothing');
  assert.deepEqual([quiet.quiet, quiet.mute, quiet.touched, quiet.clockSounds], [true, false, false, false], 'Quiet: Classroom, and the room\'s');
  assert.deepEqual([off.quiet, off.mute, off.touched, off.clockSounds], [true, true, false, false], 'Off: Classroom with Mute on, and the room\'s (it used to be a permanent mute the student was taken to have chosen)');
  for (const a of [quiet, off]) assert.equal(a.master, 80, 'the volume is the student\'s own');
  assert.equal(at('?room=ABCD&sound=quiet', { master: 0 }).master, 0); assert.equal(at('?room=ABCD&sound=off', { master: 0 }).master, 0);
  assert.equal(at('?sound=quiet', { master: 0 }).master, 0, 'no room in the link: still no raise (it is not a preset the student chose)');
  // no room in the link (a lecture hall, a hand-made address): a choice made for the student, which stays
  assert.deepEqual([at('?sound=quiet').quiet, at('?sound=quiet').touched], [true, true]); assert.deepEqual([at('?sound=off').mute, at('?sound=off').touched, at('?sound=off').quiet], [true, true, false]);
  // a student who chose their own settings is not changed by any of them
  for (const search of ['?room=ABCD&sound=quiet', '?room=ABCD&sound=off']) assert.deepEqual(S.migrateAudio({ audio: { ...audioDefaults(), touched: true, master: 90, v: 1 } }, search), { ...audioDefaults(), touched: true, master: 90 }, search);
  assert.equal(at('?room=ABCD&sound=full').touched, true, 'Full is a choice made for the student, as it was');
});
test('UX3: a student under the Quiet link: told once, not "joined" again; leaving gives back exactly the sound they had', () => {
  const d = bootOn(FULL80, '?room=ABCD&sound=quiet'), before = S.migrateAudio({ audio: { ...audioDefaults(), ...FULL80, v: 1 } }, '');
  assert.deepEqual([d.settings.audio.quiet, d.settings.audio.mute], [true, false]); assert.equal(d.kv.get(wire.ROOM_RULE), 'quiet'); assert.deepEqual(d.kv.get(wire.BEFORE_ROOM), before, 'the link remembered what it replaced, at boot');
  assert.equal(wire.pendingRoom({ code: 'ABCD' }, d), 'told', 'the Draft: the link had already applied the rule'); assert.deepEqual(d.toasts, [[wire.ROOM_TOAST, 'info']]);
  assert.equal(wire.applyRoomRule(d, true), null, 'and the game\'s own check says nothing more');
  assert.equal(wire.applyRoomRule(d, false), 'left'); assert.deepEqual(d.settings.audio, before, 'exactly what they had, nothing more and nothing less');
  assert.deepEqual(d.toasts.at(-1), ['Sound is back to Full: Classroom sound applies only in a room.', 'info']); assert.equal(d.kv.get(wire.BEFORE_ROOM), null); assert.equal(d.kv.get(wire.ROOM_RULE), null);
});
test('UX3: a student under the Off link: muted only while they are in the room, told so, and the mute is given back on leaving; M turns sound on (Classroom) and that stays theirs', () => {
  const d = bootOn(FULL80, '?room=ABCD&sound=off'), before = S.migrateAudio({ audio: { ...audioDefaults(), ...FULL80, v: 1 } }, '');
  assert.deepEqual([d.settings.audio.quiet, d.settings.audio.mute, d.settings.audio.touched], [true, true, false]); assert.equal(d.kv.get(wire.ROOM_RULE), 'off');
  assert.equal(wire.pendingRoom({ code: 'ABCD' }, d), 'told'); assert.deepEqual(d.toasts, [[wire.ROOM_OFF_TOAST, 'info']]);
  assert.match(wire.ROOM_OFF_TOAST, /^Sound is off in this room, as your instructor chose\. Press M to turn it on \(Classroom, quieter\); your own sound comes back when you leave\.$/);
  // they never press anything: leaving gives everything back, with one note
  const stay = bootOn(FULL80, '?room=ABCD&sound=off'); wire.pendingRoom({ code: 'ABCD' }, stay);
  assert.equal(wire.applyRoomRule(stay, false), 'left'); assert.deepEqual(stay.settings.audio, before); assert.deepEqual(stay.toasts.at(-1), ['Sound is back to Full: the room turned it off only while you were in it.', 'info']);
  // they press M in the room: Classroom, unmuted, and the unmute is theirs
  const r = S.toggleMute(d.settings.audio); assert.equal(r.changed, true); d.settings.audio = r.next;
  assert.deepEqual([d.settings.audio.mute, d.settings.audio.quiet, d.settings.audio.touched], [false, true, true], 'in the quieter room, not in Full');
  assert.equal(wire.applyRoomRule(d, false), 'left');
  assert.deepEqual([d.settings.audio.mute, d.settings.audio.quiet, d.settings.audio.touched], [false, false, true], 'the Classroom the room put them in goes; what they did stays');
  assert.equal(d.settings.audio.clockSounds, true); assert.equal(d.settings.audio.master, 80);
});
test('UX3: a student who joins a room whose link said nothing is put in Classroom by the room, and the Off link\'s join is told by the same path', () => {
  const plain = depsOf(FULL80); assert.equal(wire.pendingRoom({ code: 'ABCD' }, plain), 'joined'); assert.deepEqual(plain.toasts, [[wire.ROOM_TOAST, 'info']]); assert.equal(plain.kv.get(wire.ROOM_RULE), 'quiet');
  assert.equal(wire.applyRoomRule(plain, false), 'left'); assert.deepEqual(plain.settings.audio, { ...audioDefaults(), ...FULL80 });
  // a join with the Off rule already on the settings (the link was followed by a page load that the saved settings carried)
  const off = depsOf({ ...FULL80, quiet: true, mute: true, clockSounds: false }); assert.equal(wire.applyRoomRule(off, true), 'joined'); assert.equal(off.kv.get(wire.ROOM_RULE), 'off'); assert.deepEqual(off.toasts, [[wire.ROOM_OFF_TOAST, 'info']]);
  assert.equal(wire.applyRoomRule(off, false), 'left'); assert.deepEqual([off.settings.audio.mute, off.settings.audio.quiet, off.settings.audio.clockSounds], [false, false, true]);
  // a student who muted themselves (touched) is never unmuted by a room
  const mine = depsOf({ ...FULL80, mute: true, touched: true }); assert.equal(wire.applyRoomRule(mine, true), null); assert.equal(mine.settings.audio.mute, true);
});
test('UX3: rememberLinkRule remembers a rule only when the address applied one to a student with no choice of their own, and never over one already remembered', () => {
  const kv = () => depsOf().kv, saved = { audio: { ...audioDefaults(), ...FULL80, v: 1 } };
  const q = kv(); assert.equal(wire.rememberLinkRule(q, saved, '?room=ABCD&sound=quiet'), 'quiet'); assert.equal(q.get(wire.ROOM_RULE), 'quiet');
  const o = kv(); assert.equal(wire.rememberLinkRule(o, saved, '?room=ABCD&sound=off'), 'off'); assert.equal(o.get(wire.ROOM_RULE), 'off');
  for (const search of ['', '?room=ABCD', '?room=ABCD&sound=full', '?sound=quiet', '?sound=off']) assert.equal(wire.rememberLinkRule(kv(), saved, search), null, `nothing for ${search || 'no address'}`);
  assert.equal(wire.rememberLinkRule(kv(), { audio: { ...saved.audio, touched: true } }, '?room=ABCD&sound=off'), null, 'a student with a choice of their own');
  assert.equal(wire.rememberLinkRule(o, saved, '?room=ABCD&sound=quiet'), null, 'and never over a rule that is remembered'); assert.equal(o.get(wire.ROOM_RULE), 'off');
  assert.equal(wire.rememberLinkRule(null, saved, '?room=ABCD&sound=off'), null, 'no store, no throw');
});
test('UX3: leaving gives back exactly what the ROOM changed (under each link), and keeps what the student did', () => {
  for (const [link, rule] of [['', 'quiet'], ['&sound=quiet', 'quiet'], ['&sound=off', 'off']]) {
    const d = bootOn(FULL80, '?room=ABCD' + link); wire.pendingRoom({ code: 'ABCD' }, d);
    // the student, in the room: moves the volume, turns Interface sounds off by hand, and raises the ambience level
    d.settings.audio = { ...d.settings.audio, master: 40, ambientLevel: 20, ui: false, touched: true };
    assert.equal(wire.applyRoomRule(d, false), 'left');
    const a = d.settings.audio;
    assert.equal(a.quiet, false, `${rule}: the room's rule is gone`); assert.equal(a.clockSounds, true, 'the clock sounds are back'); assert.equal(a.mute, false, 'and the room\'s mute');
    assert.equal(a.ui, false, 'Interface sounds off by hand stays off'); assert.equal(a.master, 40); assert.equal(a.ambientLevel, 20); assert.equal(a.touched, true, 'a choice of the mix is a choice');
  }
  const same = S.leaveRoom({ ...audioDefaults() }, null); assert.equal(same, S.leaveRoom(same, null), 'nothing remembered, nothing changes');
});
test('UX3: the dashboard\'s Sound in the student link is three labeled radio buttons, Normal first and checked, and the link and the copy follow the choice', () => {
  assert.deepEqual(LINK_SOUNDS.map((x) => [x.id, x.label, x.query]), [['normal', 'Normal', ''], ['quiet', 'Quiet', '&sound=quiet'], ['off', 'Off', '&sound=off']]);
  assert.deepEqual(LINK_COPIED, { normal: 'Student link copied.', quiet: 'Student link copied, with quiet sound.', off: 'Student link copied, with sound off.' });
  const link = (h) => (h.match(/data-link="([^"]+)"/) || [])[1].replace(/&amp;/g, '&'), qs = (l) => new URLSearchParams(l.slice(l.indexOf('?')));
  for (const [id, want] of [['normal', null], ['quiet', 'quiet'], ['off', 'off']]) {
    const h = instructorParts(roomSession(), { linkSound: id }).head;
    assert.equal(qs(link(h)).get('sound'), want, `${id}: the link`); assert.equal(qs(link(h)).get('room'), 'ABCD');
    assert.equal((h.match(/<input type="radio" name="linksound"/g) || []).length, 3, 'three radios in one group (the arrow keys move through it)');
    assert.equal((h.match(/type="radio"[^>]* checked>/g) || []).length, 1, 'exactly one is chosen'); assert.match(h, new RegExp(`id="ls-${id}"[^>]* checked>`));
    for (const x of LINK_SOUNDS) assert.match(h, new RegExp(`<input type="radio" name="linksound" id="ls-${x.id}" value="${x.id}" data-change="linksound" data-fid="ls-${x.id}" aria-describedby="ls-h"[^>]*><label for="ls-${x.id}"[^>]*>${x.label}</label>`), `${x.id}: a radio with its own label`);
    assert.match(h, /<fieldset class="in-linksound"[^>]*><legend[^>]*>Sound in the student link<\/legend>/); assert.ok(/id="ls-h"/.test(h) && !/aria-hidden/.test(h.slice(h.indexOf('<fieldset'), h.indexOf('</fieldset>'))), 'the description is read, not hidden');
    assert.equal(/data-sound="/.test(h), id !== 'normal'); if (id !== 'normal') assert.match(h, new RegExp(`data-act="copylink" data-link="[^"]+" data-sound="${id}">`));
    assert.ok(h.indexOf('data-change="linksound"') < h.indexOf('data-act="copylink"'), 'choose, then copy');
  }
  assert.ok(instructorParts(roomSession(), { linkSound: 'off' }).head.includes(LINK_SOUNDS[2].hint) && instructorParts(roomSession(), {}).head.includes(LINK_SOUNDS[0].hint), 'the hint under it is the choice\'s own');
  assert.equal(qs(link(instructorParts(roomSession({ relay: 'wss://r.example.edu' }), { linkSound: 'off' }).head)).get('relay'), 'wss://r.example.edu', 'with a relay too');
  assert.ok(!/linkquiet|data-quiet|quietLink|> Quiet sound link</.test(src('js/ui/instructor.js')), 'the box is gone (a comment may still say what it was)');
  assert.match(src('js/ui/instructor.js'), /linksound\(b\) \{ U\.linkSound = LINK_SOUNDS\.some\(\(x\) => x\.id === b\.value\) \? b\.value : 'normal'; render\(\); \}/);
  // the control table: a radio is a change, heard as a select with its place in the group (a different tick for each)
  assert.deepEqual(wire.controlFor({ act: 'linksound', kind: 'change', checkbox: false, index: 2 }), ['play', 'ui.select', { variant: 'i0', params: { i: 2 } }]);
});
test('UX3: the kit says what the link does and that Classroom is "less than half as loud, and still not silent", and the numbers are the engine\'s', () => {
  const kit = src('docs/FACULTY_KIT.md'), comp = src('docs/COMPLIANCE.md');
  assert.match(kit, /less than half as loud, and still not silent/, 'the words the instructor can use');
  assert.match(kit, /\*\*Sound in the student link\.\*\* Beside \*\*Copy student link\*\* a choice of three: \*\*Normal\*\*/); assert.match(kit, /\*\*Off\*\* \(`&sound=off`\)/); assert.match(kit, /\*\*M\*\* turns sound on/);
  assert.match(kit, /Choose \*\*Quiet\*\* or \*\*Off\*\* under \*\*Sound in the student link\*\* \*before\* you press \*\*Copy student link\*\*/);
  assert.ok(!/Quiet sound link/.test(kit) && !/is a loud sound on every laptop at once/.test(kit), 'the old box and the old shock sentence');
  assert.match(comp, /Sound in the student link/);
  // 12.6 dB for a game sound and 10.6 for an interface sound, at the same volume, and 10 dB is half the loudness
  const db = (x) => 20 * Math.log10(x), room = db(S.masterGain({ ...audioDefaults(), quiet: false }) / S.masterGain({ ...audioDefaults(), quiet: true }));
  assert.ok(Math.abs(room - 4.64) < 0.01, `the headroom the room does not give back: ${room.toFixed(2)} dB`);
  assert.ok(Math.abs(-S.CLASSROOM_DB.game + room - 12.6) < 0.05 && Math.abs(-S.CLASSROOM_DB.ui + room - 10.6) < 0.05, `${(-S.CLASSROOM_DB.game + room).toFixed(2)} and ${(-S.CLASSROOM_DB.ui + room).toFixed(2)} dB under Full`);
  assert.ok(2 ** (-(-S.CLASSROOM_DB.ui + room) / 10) < 0.5, 'less than half the loudness, even for the interface (10 dB is half)');
  assert.match(kit, /12\.6 and 10\.6 dB under Full/);
});

// ================================================================================ item 8: the audition page's helper lives beside the page
import { existsSync } from 'node:fs';
test('the audition page\'s helper is dev/audition.js, beside the one page that uses it: not among the game\'s modules, imported by nothing in js/, and every reference says where it is', () => {
  const at = (f) => existsSync(new URL('../' + f, import.meta.url));
  assert.ok(at('dev/audition.js')); assert.ok(!at('js/audio/audition.js'), 'it sat in js/audio/ until the sixth round');
  assert.match(src('dev/sounds.js'), /from '\.\/audition\.js';/);
  for (const f of walk('js')) assert.ok(!/audition\.js/.test(src(f)), `${f}: the game's modules never name the audition page's helper`);
  for (const f of readdirSync(new URL('../tests', import.meta.url)).filter((x) => x.endsWith('.mjs') && x !== 'audio-r6.test.mjs')) assert.ok(!/js\/audio\/audition/.test(src('tests/' + f)), `tests/${f} names the old path`);
  const a = src('dev/audition.js');
  for (const m of ['settings', 'recipes', 'resolve', 'engine', 'wire']) assert.match(a, new RegExp(`from '\\.\\./js/audio/${m}\\.js'`), `its import of ${m}.js is relative to dev/`);
  assert.ok(!/from '\.\/(settings|recipes|resolve|engine|wire)\.js'/.test(a), 'and none is left as it was in js/audio/');
  assert.match(src('tests/finish-site.test.mjs'), /\['js\/meta\/ids\.js'\], 'a module nothing imports is either dead or the tests\\' alone/, 'the module-graph test names one exception, not two');
  const doc = src('docs/AUDIO.md'); assert.match(doc, /\| `dev\/audition\.js` \| \(rev 5; \*\*in `dev\/` since the sixth round\*\*/, '8.1 says where it is'); assert.ok(!/\| `js\/audio\/audition\.js` \|/.test(doc));
  assert.ok(!/^\| `audition\.js` \|/m.test(src('js/audio/README.md')), 'the folder\'s README no longer lists it');
});
