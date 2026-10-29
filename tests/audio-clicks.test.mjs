// Start clicks (docs/AUDIO.md Appendix F, I1). A gain node's own value is 1, and an event scheduled at time T applies from the first frame at or after T. When T falls on a sample boundary and a
// rounding hair after the frame's own time (the engine's starts do at 48 kHz) the frame at T is rendered BEFORE the event, and a source that starts at T passes its first sample at full scale:
// a one-sample click of -8 to -40 dBFS in 99% of the engine's starts (measured in headless Chrome 156, 16 start times, 44.1 and 48 kHz, every variant muted).
// scripts/audio-check.mjs renders the real thing (`--leak`); these tests hold the shape of the code that prevents it, with no browser: every parameter that has an event as its FIRST thing has had
// its value put in place before that event, whatever kind of source or filter it belongs to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeContext, fakeClock } from './helpers/fakeaudio.mjs';
import { voice, env, fadeIn, noiseBuffers } from '../js/audio/palette.js';
import { RECIPES, IDS, variantsOf, layersFor } from '../js/audio/recipes.js';
import { ONE_SHOTS, oneShotLayers, buildBed, BED_IDS } from '../js/audio/ambient.js';
import { createAudio } from '../js/audio/engine.js';
import { audioDefaults } from '../js/audio/settings.js';

const PARAMS = { gain: ['gain'], biquad: ['frequency'], osc: ['frequency'] };
/** Every parameter whose first act is an event, and has no value put in place before it (the value must be the event's own, so the first frame is already right). */
function unprimed(ctx) {
  const bad = [];
  ctx.nodes.forEach((n, i) => {
    for (const name of PARAMS[n.kind] || []) {
      const p = n.params[name];
      if (!p || !p.calls.length || p.calls[0][0] !== 'set') continue;
      const before = p.assigned.filter(([after]) => after === 0);
      if (!before.length || before.at(-1)[1] !== p.calls[0][1]) bad.push(`${n.kind}#${i}.${name}: first event ${p.calls[0][1]} at ${p.calls[0][2]}, values put in place first: ${JSON.stringify(before)}`);
    }
  });
  return bad;
}
const rise = (ctx) => { // a release never rises: the last event of an envelope is not above the level it came from
  const bad = [];
  for (const n of ctx.nodes) if (n.kind === 'gain') {
    const c = n.params.gain.calls; if (c.length < 3 || c[0][0] !== 'set') continue;
    const peak = Math.max(...c.filter((x) => x[0] === 'linear' || x[0] === 'set').map((x) => x[1])), last = c.at(-1);
    if (last[0] === 'exp' && last[1] > peak * (1 + 1e-9)) bad.push(`a release to ${last[1]} from a peak of ${peak}`);
  }
  return bad;
};
const build = (layers, T0 = 0.012 + 3 * 128 / 48000) => { const ctx = fakeContext({ sampleRate: 48000 }); voice(ctx, ctx.destination, layers, T0, { seed: 3 }); return ctx; };

test('every variant, pool member and one-shot has its envelopes, filters and oscillators primed before their first event', () => {
  const bad = [];
  for (const id of IDS) for (const v of variantsOf(id)) for (let k = 0; k < (RECIPES[id].pool || 1); k++) {
    const ctx = build(layersFor(id, v, {}, k));
    bad.push(...unprimed(ctx).map((m) => `${id}#${v}@${k}: ${m}`), ...rise(ctx).map((m) => `${id}#${v}@${k}: ${m}`));
  }
  for (const o of ONE_SHOTS) { const ctx = build(oneShotLayers(o.id)); bad.push(...unprimed(ctx).map((m) => `${o.id}: ${m}`), ...rise(ctx).map((m) => `${o.id}: ${m}`)); }
  assert.deepEqual(bad.slice(0, 8), []);
});
test('env puts silence in place first, whatever the layer is', () => {
  const ctx = fakeContext(), g = ctx.createGain();
  const end = env(g.gain, 0.5, 0.002, 0.01, 0.2, 0.3);
  assert.deepEqual(g.gain.assigned[0], [0, 0], 'the value is 0 before any event');
  assert.deepEqual(g.gain.calls[0], ['set', 0, 0.5]); assert.ok(Math.abs(end - 0.712) < 1e-9);
  assert.deepEqual(unprimed(ctx), []);
});
test('a layer quieter than the floor is flat, never a release that rises (a muted layer is a test of nothing else)', () => {
  const ctx = fakeContext(), g = ctx.createGain(); env(g.gain, 0, 0.001, 0, 0.1, 1e-9);
  assert.equal(g.gain.calls.at(-1)[0], 'exp'); assert.ok(g.gain.calls.at(-1)[1] <= 1e-9 * (1 + 1e-9), 'to its own level, not to 0.0001');
  const c2 = fakeContext(), g2 = c2.createGain(); env(g2.gain, 0, 0.001, 0, 0.1, 0.5);
  assert.ok(Math.abs(g2.gain.calls.at(-1)[1] - 0.0005) < 1e-12, 'an audible layer still ends 60 dB under itself');
  const c3 = fakeContext(), g3 = c3.createGain(); env(g3.gain, 0, 0.001, 0, 0.1, 0.0002);
  assert.ok(Math.abs(g3.gain.calls.at(-1)[1] - 0.0001) < 1e-12, 'and the -80 dB floor of the release is kept for the layers that reach it');
  const c4 = fakeContext(), g4 = c4.createGain(); assert.doesNotThrow(() => env(g4.gain, 0, 0.001, 0, 0.1, 0), 'a layer of gain 0 does not make an exponential ramp to 0, which the API refuses');
});
test('the check can see the fault: the old start (a first event with the gain left at 1) is found', () => {
  const ctx = fakeContext(), g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0.5); g.gain.linearRampToValueAtTime(0.3, 0.502);
  assert.equal(unprimed(ctx).length, 1, 'planted');
  const ok = fakeContext(), h = ok.createGain(); h.gain.value = 0.0001; h.gain.setValueAtTime(0.0001, 0.5);
  assert.equal(unprimed(ok).length, 0);
  const wrong = fakeContext(), w = wrong.createGain(); w.gain.value = 1; w.gain.setValueAtTime(0, 0.5);
  assert.equal(unprimed(wrong).length, 1, 'a value that is not the event\'s own is not a primed one');
  const late = fakeContext(), l = late.createBiquadFilter(); l.frequency.setValueAtTime(3200, 0.5); l.frequency.value = 3200;
  assert.equal(unprimed(late).length, 1, 'put in place after the event is too late');
});
test('fadeIn is silent at its first frame and ends at its target', () => {
  const ctx = fakeContext(), g = ctx.createGain(); fadeIn(g.gain, 2, 4, 0.25);
  assert.deepEqual(g.gain.assigned[0], [0, 0]); assert.deepEqual(g.gain.calls, [['set', 0, 2], ['linear', 0.25, 6]]);
});
test('the beds, their modifiers and the dial tone fade in from a primed gain', () => {
  const ctx = fakeContext({ sampleRate: 48000 }), s = { ...audioDefaults(), ambient: true, dial: true }, clock = fakeClock();
  const a = createAudio({ get: () => s, now: clock.now, factory: () => ctx, timers: clock.timers_, random: () => 0.5, measure: false });
  a.unlock(); a.ambient({ theme: 'harbor', tier: 1, night: 1, rain: true, speed: 1 });
  assert.ok(ctx.count('buf') >= 3, 'the bed is running');
  const fades = ctx.nodes.filter((n) => n.kind === 'gain' && n.params.gain.calls.some((c) => c[0] === 'linear' && c[1] > 0));
  assert.ok(fades.length >= 2, 'the bed and at least one modifier fade in');
  assert.deepEqual(unprimed(ctx), []);
  assert.ok(a.dial.start()); assert.deepEqual(unprimed(ctx), [], 'the dial tone too');
  const dg = ctx.nodes.filter((n) => n.kind === 'gain' && n.params.gain.calls[0]?.[0] === 'set' && n.params.gain.calls[1]?.[0] === 'linear').at(-1);
  assert.deepEqual(dg.params.gain.assigned[0], [0, 0]);
});
test('a bed built for an offline render has no event on its gain to be late for', () => {
  for (const id of BED_IDS) { const ctx = fakeContext({ sampleRate: 48000 }); buildBed(ctx, ctx.destination, id, { T: 0, dur: 8 }); assert.deepEqual(unprimed(ctx), [], id); }
  const c = fakeContext(); const nb = noiseBuffers(c); assert.ok(nb.white.length > 0);
});
