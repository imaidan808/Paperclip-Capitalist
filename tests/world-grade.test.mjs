// The V2 grade (js/world/grade.js): the light of the hour as a pure set of steps, the air that is mixed small and stretched once, one stamp a frame, the multiply tint that is only there when the hour is not plain day,
// the haze that thickens as the camera pulls back, and the brightness the art direction asks of every hour (a sunny morning, a warm evening, a night that is never murky).
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx } from './helpers/recctx.mjs';
import { Grade, hazeAt, airSteps, stepKey, STEPS, HAZE_STEPS, GOLD_STEPS, SHAFT_STEPS, gradeOf } from '../js/world/grade.js';
import { tintFor, GRASS, ROAD, SAND, PLASTER, TILE, SEA, GRADE } from '../js/world/palette.js';
import { luma, rgb } from '../js/world/iso.js';
import { ledger, releaseAll } from '../js/world/gfx.js';
import { slotFor, setFlag } from '../js/world/stack.js';
import { DIST } from '../js/world/layout.js';
import { bankOf, coverUnder } from '../js/world/cloudpaint.js';

/** A recording stand-in for OffscreenCanvas: each surface keeps the calls made on it. */
function installOffscreen() {
  const log = { surfaces: [], by: {} };
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h; this.calls = []; log.surfaces.push(this); const me = this; this.g = new Proxy({ canvas: this, globalAlpha: 1, globalCompositeOperation: 'source-over' }, { get(o, k) { if (k in o) return o[k]; if (typeof k === 'symbol') return undefined; if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); return (...a) => { me.calls.push([k, ...a]); log.by[k] = (log.by[k] || 0) + 1; }; }, set(o, k, v) { o[k] = v; return true; } }); }
    getContext() { return this.g; }
  };
  return log;
}
const world = (o = {}) => ({ W: 800, H: 520, dpr: 2, cv: { width: 1600, height: 1040 }, night: 0, dusk: 0, lite: false, t: 0, cam: { z: 0.9 }, env: { crunch: false }, reduced: () => false, ...o });
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} is not ${b}`);

test('the haze: nothing from the working zoom up, full at the whole-island view, and it thickens smoothly as the camera pulls back', () => {
  near(hazeAt(0.7), 0); near(hazeAt(1.2), 0); near(hazeAt(0.2), 1); near(hazeAt(0.129), 1);
  let prev = 0; for (let z = 0.7; z >= 0.2; z -= 0.01) { const h = hazeAt(z); assert.ok(h >= prev - 1e-12, `the haze thins at ${z}`); prev = h; }
  assert.ok(hazeAt(0.45) > 0.3 && hazeAt(0.45) < 0.8, 'half way at about 0.45');
});

test('the steps of the air: plain day is one record, dusk adds the gold wash and the shafts, a quiet world has no shafts, rain turns the day down, and a still light is one key', () => {
  const day = airSteps(0, 0, false, 1.0, false, false), noon = { ...day };
  assert.deepEqual(noon, { dq: STEPS, nq: 0, gq: 0, sq: 0, hq: 0 });
  const dusk = airSteps(0.27, 1, false, 1.0, false, false); assert.ok(dusk.dq > 0 && dusk.nq > 0 && dusk.gq === GOLD_STEPS && dusk.sq === SHAFT_STEPS, JSON.stringify(dusk));
  assert.ok(dusk.nq < Math.round(0.27 * STEPS), 'the golden hour keeps the blue of the night back');
  assert.equal(airSteps(0.27, 1, false, 1.0, true, false).sq, 0, 'reduced motion: no shafts'); assert.equal(airSteps(0.27, 1, false, 1.0, false, true).sq, 0, 'the quiet tier: no shafts'); assert.equal(airSteps(0.27, 1, true, 1.0, false, false).sq, 0, 'rain: none');
  const rain = airSteps(0, 0, true, 1.0, false, false); assert.equal(rain.dq, Math.round(0.6 * STEPS)); assert.equal(rain.nq, Math.round(0.3 * STEPS), 'a crunch turns the day to 0.6 and the night up by 0.3, as the world always did');
  const night = airSteps(1, 0, false, 1.0, false, false); assert.equal(night.dq, 0); assert.equal(night.nq, STEPS); assert.equal(night.gq, 0);
  assert.equal(airSteps(0, 0, false, 0.129, false, false).hq, HAZE_STEPS, 'pulled all the way back: full haze'); assert.ok(airSteps(1, 0, false, 0.129, false, false).hq < HAZE_STEPS, 'less haze at night');
  assert.equal(stepKey(airSteps(0.4, 0.3, false, 0.5, false, false)), stepKey(airSteps(0.4, 0.3, false, 0.5, false, false))); assert.notEqual(stepKey(airSteps(0.4, 0.3, false, 0.5, false, false)), stepKey(airSteps(0.5, 0.3, false, 0.5, false, false)));
  const keys = new Set(); for (let n = 0; n <= STEPS; n++) for (let g = 0; g <= GOLD_STEPS; g += 4) keys.add(stepKey({ dq: STEPS - n, nq: n, gq: g, sq: 0, hq: 0 })); assert.equal(keys.size, (STEPS + 1) * 3, 'the key tells every step apart');
  const o = {}; assert.equal(airSteps(0, 0, false, 1, false, false, o), o, 'it fills a record it is given: nothing allocated in a frame');
});

test('the air is one stamp of one full-size bitmap, made once; a light step remixes the small bitmap and stretches it in bands (a band a frame, all at once under reduced motion); the same step costs nothing', () => {
  const log = installOffscreen(); ledger.clear();
  try {
    const g = new Grade(), main = recCtx(), w = world();
    const frame = (o) => { main.log.calls.length = 0; g.ambient(main.ctx, { ...w, ...o }); return main.log.calls.filter((c) => c[0] === 'drawImage'); };
    let s = frame(); assert.equal(s.length, 1, 'a daylit frame is one stamp'); assert.equal(s[0].length, 4, 'a straight copy: image, x, y'); assert.equal(g.air.width, 1600); assert.equal(g.air.height, 1040, 'the canvas\'s own pixels');
    assert.equal(ledger.total('light.air'), 1600 * 1040 * 4, 'the ledger knows what it holds'); assert.ok(ledger.total('light.src') > 0);
    const made = log.surfaces.length, remix = g.stats.remix, bands = g.stats.bands; frame(); frame(); assert.equal(log.surfaces.length, made, 'later frames make no bitmap'); assert.equal(g.stats.remix, remix); assert.equal(g.stats.bands, bands, 'and stretch nothing');
    frame({ night: 0.5, dusk: 0.4 }); assert.equal(g.stats.remix, remix + 1, 'a new step: the small bitmap is mixed again'); assert.equal(g.stats.bands, bands + 1, 'and one band of the big one is stretched this frame');
    for (let i = 0; i < 5; i++) frame({ night: 0.5, dusk: 0.4 }); assert.equal(g.stats.bands, bands + 4, 'four bands in all, then it stops'); assert.equal(g.stats.remix, remix + 1);
    frame({ night: 0.5, dusk: 0.4, cam: { z: 0.4 } }); assert.equal(g.stats.remix, remix + 2, 'a pull-back thickens the haze: a new step'); const b0 = g.stats.bands; frame({ night: 0.5, dusk: 0.4, cam: { z: 0.4 }, reduced: () => true }); assert.equal(g.stats.bands, b0 + 4, 'under reduced motion (which has no shafts: a new step) every band goes at once: the world draws only when it must');
    const stretch = g.air.calls.filter((c) => c[0] === 'drawImage' && c.length === 10); assert.ok(stretch.length >= 4 && stretch[0][7] === 0 && stretch.at(-1)[7] + stretch.at(-1)[9] <= 1040, 'bands are stretches of the small mix into rows of the big one');
    frame({ cv: { width: 1200, height: 780 } }); assert.equal(g.air.width, 1200, 'a different canvas size makes it again at that size'); assert.equal(ledger.total('light.air'), 1200 * 780 * 4);
    g.release(); assert.equal(ledger.total('light.air'), 0, 'let go'); assert.equal(g.air, null);
  } finally { delete globalThis.OffscreenCanvas; ledger.clear(); }
});

test('without surfaces (the Node tests) the air is one gradient and nothing else', () => {
  delete globalThis.OffscreenCanvas; const g = new Grade(), r = recCtx(); g.ambient(r.ctx, world()); assert.equal(r.log.calls.filter((c) => c[0] === 'drawImage').length, 0); assert.equal(r.log.rects.length, 1); assert.equal(r.log.depth, 0);
});

test('the multiply tint is only there when the hour is not plain day: none at noon, gold at the edges of the day, periwinkle at night, a cool grey in rain; the palette\'s colours, not lighting.js\'s', () => {
  const g = new Grade(), pass = (o) => { const r = recCtx(); g.tint(r.ctx, world({ ...o })); return r; };
  assert.equal(pass({ night: 0, dusk: 0 }).log.rects.length, 0, 'plain daylight needs no pass');
  const night = pass({ night: 1, dusk: 0 }); assert.equal(night.log.rects.length, 1); assert.ok(night.log.calls.some((c) => c[0] === 'save') && night.log.depth === 0, 'balanced');
  assert.equal(tintFor(1, 0, false), 'rgb(140,152,222)', 'the art direction\'s #8c98de'); assert.equal(tintFor(0, 0, true), 'rgb(196,208,232)');
  const [gr, gg, gb] = rgb(GRADE.dusk), peak = tintFor(0.27, 1, false).match(/\d+/g).map(Number); assert.ok(peak[1] <= 225 && peak[2] <= 195 && peak[0] > peak[2] + 30, 'a golden evening is a clear gold: ' + peak); const pure = tintFor(0, 1, false).match(/\d+/g).map(Number); assert.ok(pure[1] >= gg - 2 && pure[2] >= gb - 2 && pure[2] <= gb + 12, 'with no night in it the multiply is the art direction\'s #ffd0a0'); void gr;
});

test('the blue hour is a colour, not a grey: the tint through the middle of the evening is rose-violet with a spread of at least 40 between its channels, and the gold wash gives way to it', () => {
  for (const [n, d] of [[0.45, 0.9], [0.55, 0.75], [0.62, 0.6], [0.67, 0.5]]) { const v = tintFor(n, d, false).match(/\d+/g).map(Number); assert.ok(Math.max(...v) - Math.min(...v) >= 40, `${n},${d}: ${v}`); assert.ok(v[2] >= v[1] && v[0] >= v[1] - 12, 'rose and violet, not green'); }
  const early = airSteps(0.27, 1, false, 1, false, false), late = airSteps(0.67, 0.5, false, 1, false, false); assert.equal(early.gq, GOLD_STEPS); assert.ok(late.gq < GOLD_STEPS * 0.5 * 0.9, `the gold wash is thin by the blue hour (${late.gq})`);
});

test('every hour is bright enough: the tint over the world\'s own colours keeps the mean luma of a night at 0.34 or more, and the evening and morning are lighter than that', () => {
  const world_ = [GRASS.mid, ROAD.mid, SAND.mid, PLASTER.cream, TILE.terracotta, SEA.sea, GRASS.shade, SEA.deep];
  const mean = (tint) => { const m = tint ? tint.match(/\d+/g).map(Number) : [255, 255, 255]; return world_.reduce((a, c) => { const [r, g, b] = rgb(c); return a + (0.3 * r * m[0] / 255 + 0.59 * g * m[1] / 255 + 0.11 * b * m[2] / 255) / 255; }, 0) / world_.length; };
  const day = mean(tintFor(0, 0, false)), eve = mean(tintFor(0.27, 1, false)), night = mean(tintFor(1, 0, false)), rain = mean(tintFor(0, 0, true));
  assert.ok(night >= GRADE.nightMeanLumaMin, `night ${night.toFixed(3)}`); assert.ok(eve > night && day > eve, `${day.toFixed(2)} > ${eve.toFixed(2)} > ${night.toFixed(2)}`); assert.ok(rain > night, 'rain is no darker than night');
  assert.ok(luma('#8c98de') > 0.55);
});

test('the V2 grade layer is registered in screen space and one Grade is made for each world', () => {
  assert.equal(slotFor('grade').impl, 'v2', 'the default build is the new grade'); assert.equal(slotFor('grade').space, 'screen'); setFlag('grade', 'legacy');
  try { assert.equal(slotFor('grade').impl, 'legacy'); } finally { setFlag('grade', 'v2'); }
  const w = { light: { perFrame: 3 } }, g = gradeOf(w); assert.strictEqual(gradeOf(w), g); assert.equal(g.perFrame, 3); assert.notStrictEqual(gradeOf({}), g); assert.ok(releaseAll() >= 0);
});

test('a lamp under a cloud is not stamped (the cloud is in front of it: no glowing blobs inside a bank), one in a window of the bank shines in full, and every other light is stamped as Lighting.lights stamps it', () => {
  installOffscreen();
  try {
    const g = new Grade(), seen = [], ctx = { globalAlpha: 1, globalCompositeOperation: 'source-over', save() {}, restore() {}, drawImage() { seen.push(+this.globalAlpha.toFixed(3)); } };
    const D = DIST[3], form = bankOf(D, 1), win = form.windows[0], under = form.lobes.filter((l) => l.kind === 0 && l.r > 40).sort((p, q) => Math.hypot(p.x - form.cx, p.y - form.cy) - Math.hypot(q.x - form.cx, q.y - form.cy))[0], outside = [DIST[1].bb[0] + 200, DIST[1].bb[1] + 400];
    const mk = (pt, unlocked, r = 40) => ({ W: 20000, H: 20000, cam: { x: pt[0], y: pt[1], z: 1 }, unlocked, lights: [{ wx: pt[0], wy: pt[1], r, c: '255,233,168', a: 0.6 }] });
    assert.equal(coverUnder(D, under.x, under.y, 40), 1, 'the middle of a lobe is wholly under cloud'); assert.equal(coverUnder(D, win.x, win.y, 40), 0, 'the middle of a window is clear sky');
    g.lights(ctx, mk([under.x, under.y], new Set([1])), 160); assert.deepEqual(seen, [], 'under cloud: nothing is stamped'); seen.length = 0;
    g.lights(ctx, mk([win.x, win.y], new Set([1])), 160); assert.deepEqual(seen, [0.6], 'in a window: in full'); seen.length = 0;
    g.lights(ctx, mk([under.x, under.y], new Set([1, 3])), 160); assert.deepEqual(seen, [0.6], 'once its district is open, in full'); seen.length = 0;
    g.lights(ctx, mk(outside, new Set([1])), 160); assert.deepEqual(seen, [0.6], 'a light elsewhere in full');
    const edge = [win.x + win.rx * 0.97, win.y]; seen.length = 0; g.lights(ctx, mk(edge, new Set([1]), 90), 160); assert.ok(seen.length === 0 || seen[0] < 0.6, 'a light at the edge of a window whose pool reaches under the rim is dimmed, never brighter than in the open');
  } finally { delete globalThis.OffscreenCanvas; }
});
