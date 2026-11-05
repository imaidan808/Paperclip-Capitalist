// pc.perf() (js/world/perfprobe.js): what a machine does with the world, as one line to paste back. It must change nothing the player sees (the world's own `draw` is wrapped for its seconds and put back exactly as it was
// found, an own property or a prototype's), count the draws the loop makes, notice a tier change, and answer the shape the notes in docs/ARCHITECTURE.md ("The world") read off.
import test from 'node:test';
import assert from 'node:assert/strict';

Object.assign(globalThis, {
  innerWidth: 1512, innerHeight: 865, screen: { width: 3024, height: 1964 }, matchMedia: () => ({ matches: false }),
  requestAnimationFrame: (f) => setTimeout(() => f(performance.now()), 16),
  PerformanceObserver: class { observe() { throw new Error('no such entry type'); } disconnect() {} },
});
globalThis.window = { devicePixelRatio: 2 };
globalThis.document = { hasFocus: () => true, visibilityState: 'visible', createElement: () => ({ getContext: () => null }) };
const { perfProbe } = await import('../js/world/perfprobe.js');

const fake = (over = {}) => Object.assign({ slow: 0, fps: 30, moving: false, gcValid: true, gcMore: false, gcHoles: 0, gov: { cost: 3.2 }, dpr: 2, cv: { width: 3024, height: 1730 }, cam: { z: 1.05 }, last: 0, n: 0 }, over);
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
/** The loop of a world, by hand (the counts do not depend on how fast a runner's timers are): `k` draws a few milliseconds apart, `at(i)` run before the i-th. */
const loop = async (w, k, at = () => {}) => { for (let i = 0; i < k; i++) { at(i); w.last = performance.now(); w.draw(); await nap(4); } };

test('the probe wraps an own `draw` for its seconds and gives back the very function, counts every draw, sees a tier change and a bare-ground frame, and answers one report', async () => {
  const w = fake({ draw() { this.n++; } }), orig = w.draw, p = perfProbe(w, 1);
  await loop(w, 30, (i) => { if (i === 15) { w.slow = 3; w.gcMore = true; } });
  const r = await p;
  assert.strictEqual(w.draw, orig, 'the world\'s own draw is back, the same function');
  assert.equal(r.probe, 'pc.perf v1'); assert.equal(r.seconds, 1);
  assert.equal(w.n, 30); assert.equal(r.draws.n, 30, 'every draw of the world was counted');
  assert.equal(r.draws.gapHist.length, 6, 'the gap histogram has the recording\'s six buckets'); assert.equal(r.draws.gapHist.reduce((a, b) => a + b, 0), 29, 'and holds every gap');
  assert.equal(r.tiers.max, 3); assert.deepEqual(r.tiers.changes.map(([, k]) => k), [0, 3], `the tier change is in the timeline: ${JSON.stringify(r.tiers.changes)}`); assert.deepEqual(r.tiers.sharePercent.slice(0, 4), [50, 0, 0, 50], JSON.stringify(r.tiers.sharePercent));
  assert.equal(r.ground.drawsWithBareGroundPercent, 50, 'half of the draws had a ground that was not whole');
  assert.ok(Array.isArray(r.draws.fpsAsked) && r.draws.fpsAsked[0] === 30 && r.raf.hist.length === 6, JSON.stringify([r.draws.fpsAsked, r.raf]));
  assert.deepEqual([r.env.dsf, r.env.canvas, r.env.dpr, r.env.zoom], [2, [3024, 1730], 2, 1.05]); assert.equal(typeof r.env.softwareRaster, 'boolean'); assert.ok(r.env.fillMpxPerSec === null, 'the fill-rate test answers null where there is no scratch canvas (here)');
  assert.ok(r.draws.moving.draws + r.draws.still.draws === r.draws.n, 'every draw is moving or still'); assert.ok(r.draws.startLagP50 >= 0 && r.draws.startLagP50 < 50, `the start lag of a draw: ${r.draws.startLagP50} ms`);
});

test('a world whose `draw` is its prototype\'s gets none of its own back, and the probe clamps its seconds to 1 to 120', async () => {
  class W { constructor() { Object.assign(this, fake()); } draw() { this.n++; } }
  const w = new W(), p = perfProbe(w, 0.2);
  await loop(w, 10); const r = await p;
  assert.equal(Object.prototype.hasOwnProperty.call(w, 'draw'), false, 'the wrapper is deleted: the prototype\'s draw shows again');
  assert.equal(r.seconds, 1, 'under a second is a second'); assert.equal(w.n, 10);
});
