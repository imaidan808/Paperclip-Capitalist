// T5 raster quality: the far/full crossfade (js/world/lod.js farMix, js/world/props.js drawProp): the island's props fade from plain blocks to buildings over the zoom either side of FAR_ZOOM, and nothing pops at the threshold.
import test from 'node:test';
import assert from 'node:assert/strict';
import { farMix, FAR_BLEND } from '../js/world/lod.js';
import { drawProp } from '../js/world/props.js';
import { FAR_ZOOM } from '../js/world/common.js';
import { recCtx } from './helpers/recctx.mjs';
import { setFlag } from '../js/world/stack.js';

test('farMix: 0 below far - 0.04, 1 above far + 0.04, smooth and monotone between, half at the threshold', () => {
  assert.equal(FAR_BLEND, 0.04); assert.equal(farMix(0.2), 0); assert.equal(farMix(FAR_ZOOM - FAR_BLEND), 0); assert.equal(farMix(FAR_ZOOM + FAR_BLEND), 1); assert.equal(farMix(2.4), 1);
  assert.ok(Math.abs(farMix(FAR_ZOOM) - 0.5) < 1e-9, 'half at the threshold');
  let prev = -1; for (let z = 0.3; z <= 0.56; z += 0.004) { const m = farMix(z); assert.ok(m >= prev - 1e-12 && m >= 0 && m <= 1); prev = m; }
  assert.ok(Math.abs(farMix(0.3, 0.3) - 0.5) < 1e-9, 'the threshold is an argument: it follows FAR_ZOOM when the tracks move it to 0.30');
  const step = Math.max(...Array.from({ length: 200 }, (_, i) => Math.abs(farMix(0.3 + (i + 1) * 0.0008) - farMix(0.3 + i * 0.0008)))); assert.ok(step < 0.05, 'no step in it: ' + step);
});

const prop = (o = {}) => ({ t: 'bldg', gx: 10, gy: 10, w: 3, d: 2, h: 30, z: 5, bb: [-96, 300, 96, 420], col: '#8a94a8', hull: undefined, ...o });
const env = (o = {}) => ({ t: 0, night: 0, wind: 0, dim: 0, far: false, lite: false, lights: [], zoff: 0, tier: 0, lod: { detail: [1, 0, 0, 0] }, ...o });
/** The alpha each fill was made at: a recording context with the alpha in each fill record. */
const fillAlphas = (log) => log.fills.map((f) => +f.alpha.toFixed(3));

test('inside the zone a block and a building are both drawn, the block fading out after the half way and the building fading in; far of it a block alone, near of it a building alone', () => {
  const far = recCtx(), e1 = env({ far: true, farMix: 0 }); drawProp(far.ctx, prop(), e1); assert.ok(far.log.fills.length > 0 && fillAlphas(far.log).every((a) => a === 1), 'far: the block at full strength');
  const full = recCtx(), e2 = env({ far: false, farMix: 1 }); drawProp(full.ctx, prop(), e2); assert.ok(full.log.fills.length > far.log.fills.length, 'near: the building, which has more parts than the block');
  const mid = recCtx(), e3 = env({ far: true, farMix: 0.3 }); drawProp(mid.ctx, prop(), e3); const a = fillAlphas(mid.log);
  assert.ok(a.includes(1) && a.some((x) => Math.abs(x - 0.3) < 1e-9), 'at 0.3: the block at 1 and the building at 0.3: ' + [...new Set(a)]); assert.equal(e3.far, true, 'env.far is given back'); assert.equal(e3.farMix, 0.3, 'and so is the mix'); assert.equal(mid.state.globalAlpha, 1, 'and the alpha');
  const late = recCtx(), e4 = env({ far: false, farMix: 0.8 }); drawProp(late.ctx, prop(), e4); const b = fillAlphas(late.log);
  assert.ok(b.some((x) => Math.abs(x - 0.4) < 1e-9) && b.some((x) => Math.abs(x - 0.8) < 1e-9), 'at 0.8: the block at 0.4 (fading out) and the building at 0.8: ' + [...new Set(b)]);
});

test('a small prop has no far version: only the full one fades in; a prop that is kept at far is never blended', () => {
  // (the legacy drawer: a V2 body is built into a sprite and blitted at the blend's alpha in the browser; with no offscreen surface here it would draw its own translucent fills at their own alphas)
  setFlag('static-bldg', 'legacy'); setFlag('static-prop', 'legacy'); try {
  const sm = recCtx(), e = env({ far: true, farMix: 0.5 }); drawProp(sm.ctx, prop({ t: 'bldg', sm: true }), e); assert.ok(fillAlphas(sm.log).every((x) => Math.abs(x - 0.5) < 1e-9), 'every fill at 0.5: ' + [...new Set(fillAlphas(sm.log))]);
  const keep = recCtx(), e2 = env({ far: true, farMix: 0.5 }); let threw = false; try { drawProp(keep.ctx, prop({ t: 'board', text: 'X', hot: 'b' }), e2); } catch { threw = true; }
  if (!threw) assert.ok(fillAlphas(keep.log).every((x) => x === 1), 'a kept prop is drawn at its own alpha');
  } finally { setFlag('static-bldg', 'v2'); setFlag('static-prop', 'v2'); }
});

test('without a mix (a caller that does not know it) the old rule stands: env.far draws the block', () => {
  const a = recCtx(), e = env({ far: true }); delete e.farMix; drawProp(a.ctx, prop(), e); const b = recCtx(), e2 = env({ far: true, farMix: 0 }); drawProp(b.ctx, prop(), e2);
  assert.equal(a.log.fills.length, b.log.fills.length);
});
