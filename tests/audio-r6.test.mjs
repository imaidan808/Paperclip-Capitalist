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
