// The frame budget of docs/RENDER_PLAN.md section 6 (the render-budget block) held to itself and to the code: the ceilings are 1.25 x the contract baseline (the finest zoom never over 24 ms) and agree with
// the art direction's constants; every allocation by layer sums under its ceiling, the still sum with at least 5% to spare; and the clouds row is at least what cloudbank.js's cost model says the real layout costs
// at that scene's camera. scripts/world-budget.mjs reads the same block and is the command that times the world against it (it needs Chrome, so it is run by hand; its usage is tested here).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DIST } from '../js/world/layout.js';
import { sx, sy } from '../js/world/iso.js';
import { sceneCloudMs } from '../js/world/cloudbank.js';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const PLAN = read('../docs/RENDER_PLAN.md'), ART = read('../docs/ART_DIRECTION.md');
const B = JSON.parse(PLAN.match(/<!-- render-budget -->\s*```json\n([\s\S]*?)\n```/)[1]), K = JSON.parse(ART.match(/<!-- art-constants -->\s*```json\n([\s\S]*?)\n```/)[1]).perf;
const near = (a, b, e) => Math.abs(a - b) <= e;
const cameraOf = (s) => { if (s.at.startsWith('zone:')) { const d = DIST[+s.at.slice(5)]; return [sx(d.cx, d.cy), sy(d.cx, d.cy, d.z) - 20]; } return [s.x, s.y]; };

test('the budget scenes are the plan\'s eight, each with a baseline, a ceiling of 1.25 x the baseline (the finest zoom capped at 24 ms), and the same ceilings as the art direction where it has the zoom', () => {
  assert.equal(B.factor, 1.25); assert.equal(B.finestMaxMs, 24); assert.equal(B.scenes.length, 8); assert.equal(new Set(B.scenes.map((s) => s.id)).size, 8);
  for (const s of B.scenes) {
    assert.match(s.at, /^(fit|coast|zone:\d+)$/, s.id); if (!s.at.startsWith('zone:')) assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y), s.id + ' names its camera');
    for (let i = 0; i < 2; i++) {
      const want = Math.min(s.zoom >= 2.4 ? B.finestMaxMs : Infinity, Math.round(s.baseline[i] * B.factor * 10) / 10);
      assert.ok(near(s.ceiling[i], want, 0.11), `${s.id} ${i ? 'moving' : 'still'}: ceiling ${s.ceiling[i]}, 1.25 x ${s.baseline[i]} is ${want}`);
      assert.ok(near(s.measured[i], s.baseline[i], Math.max(1, 0.08 * s.baseline[i])), `${s.id}: this session's ${s.measured[i]} against the contract baseline ${s.baseline[i]}`);
      assert.ok(s.pinned2[i] / s.measured[i] >= 1.4 && s.pinned2[i] / s.measured[i] <= 1.9, `${s.id}: the density-2 pin is 1.4 to 1.9 times the world's own density (${s.pinned2[i]} against ${s.measured[i]})`);
    }
    const key = String(+s.zoom.toFixed(2)); if (K.ceilingStillMs[key] !== undefined) { assert.equal(K.ceilingStillMs[key], s.ceiling[0], `${s.id} still: the art direction's constants`); assert.equal(K.ceilingMovingMs[key], s.ceiling[1], `${s.id} moving`); }
  }
});

test('every allocation sums under its ceiling (the still sum 5% or more under it), over the plan\'s nine layers, and the clouds row is at least the model\'s cost of the real layout at that camera', () => {
  const LAYERS = ['sea + shore', 'ground chunks', 'livedecals', 'static props and shadows', 'plots, people, crates, traffic', 'clouds', 'grade', 'field, overlay, particles', 'engine'];
  for (const s of B.scenes) {
    assert.deepEqual(Object.keys(s.alloc), LAYERS, s.id);
    for (let i = 0; i < 2; i++) { const sum = Object.values(s.alloc).reduce((a, v) => a + v[i], 0); assert.ok(sum <= s.ceiling[i], `${s.id} ${i ? 'moving' : 'still'}: the rows sum to ${sum.toFixed(1)} over the ceiling ${s.ceiling[i]}`); if (!i) assert.ok(sum <= s.ceiling[0] * 0.95, `${s.id}: ${sum.toFixed(1)} leaves under 5% of ${s.ceiling[0]} for noise`); }
    const [x, y] = cameraOf(s), model = sceneCloudMs(DIST, [1], x, y, s.zoom, 1.5);
    assert.ok(s.alloc.clouds[0] >= model - 1e-9 && s.alloc.clouds[1] >= model - 1e-9, `${s.id}: the clouds row ${s.alloc.clouds} is under the model's ${model.toFixed(2)}`);
    assert.ok(s.alloc.clouds[0] <= model + 0.6, `${s.id}: the clouds row ${s.alloc.clouds[0]} is far over the model's ${model.toFixed(2)}: the table would hide slack`);
    for (const [name, [a, b]] of Object.entries(s.alloc)) assert.ok(name === 'livedecals' ? b <= a : b >= a, `${s.id}: ${name} costs ${b} moving and ${a} still (a pan costs more, except that the dressing is skipped while the camera moves)`);
  }
});

test('the clouds are the dearest row only where a window is mostly cloud: the Campus at 1.2 and the thirteen banks of 0.3; at the coast they are a sliver', () => {
  const at = (id) => B.scenes.find((s) => s.id === id).alloc.clouds[0];
  assert.ok(at('d3-1.2') >= 8 && at('mid-0.3') >= 14, 'the dear scenes'); assert.ok(at('coast-0.9') < 1 && at('d1-2.4') === 0 && at('d1-1.8') < 0.5, 'the cheap ones');
  assert.ok(at('mid-0.3') > at('mid-0.5') && at('mid-0.5') > at('coast-0.9'));
});

test('scripts/world-budget.mjs says how it is used and starts no browser when asked for a scene the block does not have', () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/world-budget.mjs', import.meta.url)), '--scene', 'no-such-scene'], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 2); assert.match(r.stderr, /no such scene; the block has: fit-0\.129, mid-0\.3, mid-0\.5, coast-0\.9, d1-1\.0, d3-1\.2, d1-1\.8, d1-2\.4/);
});
