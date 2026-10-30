// The cloud banks leave no hole while they are being made (js/world/clouds.js stampBanks on the chunk store of js/world/chunkcache.js, the same rules as the ground's: tests/world-holes.test.mjs and
// tests/world-ground-holes.test.mjs). A bank whose chunk is not made shows the land without its cloud: a rectangle cut out of the bank, and the sea-coloured rectangles over the middle of a town that the player calls
// "clouds clipping over". The picture is judged by what the blits reached against what the settled picture covers at the same camera; one chunk is made a frame, as on a machine four times slower than a Mac.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx } from './helpers/recctx.mjs';
import { reach } from './helpers/reach.mjs';
import { DIST, LAYOUT } from '../js/world/layout.js';
import { FOG_DIM } from '../js/world/common.js';
import { setFlag, runLayer } from '../js/world/stack.js';
import { bankOf } from '../js/world/cloudpaint.js';
import { cloudStats, cloudStore, cloudCap, REVEAL_MS } from '../js/world/clouds.js';
import { snapTranslation } from '../js/world/chunks.js';
import { ledger, releaseAll } from '../js/world/gfx.js';

const NOFX = { dim: 0, fog: 0, lights: 0 };
function fakeSurfaces() {
  const made = []; const make = (w, h) => { const r = recCtx(); const c = { width: w, height: h, transferToImageBitmap() { return { width: w, height: h, close() { this.closed = true; } }; } }; made.push(c); return { c, g: r.ctx, log: r.log }; };
  return { make, made };
}
const viewOf = (w) => ({ x0: w.cam.x - w.W / 2 / w.cam.z - 80, x1: w.cam.x + w.W / 2 / w.cam.z + 80, y0: w.cam.y - w.H / 2 / w.cam.z - 260, y1: w.cam.y + w.H / 2 / w.cam.z + 80 });
function stubWorld(o = {}) {
  const D = DIST[3], b = bankOf(D, 1), w = {
    W: 800, H: 520, dpr: 2, cv: { width: 1600, height: 1040 }, cam: { x: b.cx, y: b.cy, z: 0.9 }, dusk: 0, env: { t: 0, night: 0 }, reveal: {}, hits: [], overlay: [], lights: [], dirty: false, moving: false, snap: [0, 0], unlocked: new Set([1]), t: 5000, gcBudget: [1e9, 1e9], gcRest: 0, gcFade: 0,
    toWorld(ctx) { const a = this.renderScale(); snapTranslation(this.W, this.H, this.dpr, this.cam.x, this.cam.y, a, this.snap); ctx.setTransform(a, 0, 0, a, this.snap[0], this.snap[1]); }, toScreen() {}, renderScale() { return Math.round(this.cam.z * this.dpr * 1e5) / 1e5; },
    fxOf(id) { return this.unlocked.has(id) ? NOFX : { dim: FOG_DIM, fog: 1, lights: 0 }; }, reduced() { return false; }, ...o,
  };
  w.view = viewOf(w); return w;
}
const withSurfaces = (fn) => { const { make } = fakeSurfaces(); globalThis.OffscreenCanvas = class { constructor(w, h) { const s = make(w, h); this.width = w; this.height = h; this.g = s.g; this.transferToImageBitmap = s.c.transferToImageBitmap; } getContext() { return this.g; } }; try { return fn(); } finally { delete globalThis.OffscreenCanvas; releaseAll(); ledger.clear(); setFlag('clouds', 'legacy'); } };
const draw = (w, vz = new Set([3])) => { const r = recCtx(); r.state.globalAlpha = 1; setFlag('clouds', 'v2'); w.view = viewOf(w); runLayer('clouds', w, r.ctx, w.view, vz); return r; };
const chunks = (img) => typeof img.close === 'function'; // (the bitmaps of the store; the sky's small clouds are canvases)
const seen = (r, w) => reach(r, w.cv.width, w.cv.height, { only: chunks });
/** The sample points the settled picture covers and this frame did not, over the whole canvas and inside a rectangle of the screen. */
const missing = (T, R, inner) => { let all = 0, inn = 0; const step = 16; for (let j = 0; j < T.ny; j++) for (let i = 0; i < T.nx; i++) { const k = j * T.nx + i; if (T.got[k] && !R.got[k]) { all++; const x = i * step + 8, y = j * step + 8; if (!inner || (x >= inner[0] && x < inner[2] && y >= inner[1] && y < inner[3])) inn++; } } return { all, inn }; };
const settled = (z, extra = {}) => { const w = stubWorld({ ...extra }); w.cam.z = z; draw(w); return seen(draw(w), w); };

test('a zoom that moves the camera beyond the ratio window: the chunks of the old scale are the soft picture the same frame, the rest is covered coarse one chunk a frame, and the old window\'s clouds are never bare', () => withSurfaces(() => {
  const A = stubWorld(); draw(A); draw(A); const W0 = { x0: A.cam.x - A.W / 2 / 0.9, x1: A.cam.x + A.W / 2 / 0.9, y0: A.cam.y - A.H / 2 / 0.9, y1: A.cam.y + A.H / 2 / 0.9 };
  const T = settled(0.6); assert.ok(T.got.reduce((n, v) => n + v, 0) > 100, 'the settled picture has clouds to cover');
  A.gcBudget = [1e-6, 1e-6]; A.cam.z = 0.6; const log = [];
  for (let n = 0; n < 24; n++) {
    const R = seen(draw(A), A), a = A.renderScale(), e = A.snap[0], f = A.snap[1], inner = [(W0.x0 - A.cam.x) * a + A.W / 2 * A.dpr + 16, (W0.y0 - A.cam.y) * a + A.H / 2 * A.dpr + 16, (W0.x1 - A.cam.x) * a + A.W / 2 * A.dpr - 16, (W0.y1 - A.cam.y) * a + A.H / 2 * A.dpr - 16];
    const m = missing(T, R, inner); log.push(m.all); assert.equal(m.inn, 0, `frame ${n + 1}: ${m.inn} sample points of the old window's clouds are bare: ` + JSON.stringify(log)); void e; void f;
  }
  assert.equal(log.at(-1), 0, 'covered at the end: ' + JSON.stringify(log)); assert.ok(log.findIndex((v) => v === 0) <= 12, 'in a dozen frames: ' + JSON.stringify(log));
  for (let n = 1; n < log.length; n++) assert.ok(log[n] <= log[n - 1], 'what is bare only shrinks: ' + JSON.stringify(log));
  assert.equal(cloudStats(A).holes, 0);
}));

test('two notches out, a chunk a frame: the clouds the old window made are never taken from under the picture, and the store stays within its hard limit', () => withSurfaces(() => {
  const A = stubWorld(); draw(A); draw(A); const W0 = { x0: A.cam.x - A.W / 2 / 0.9, x1: A.cam.x + A.W / 2 / 0.9, y0: A.cam.y - A.H / 2 / 0.9, y1: A.cam.y + A.H / 2 / 0.9 };
  const T1 = settled(0.9 / 1.16), T2 = settled(0.9 / 1.16 / 1.16); A.gcBudget = [1e-6, 1e-6]; const worst = []; let big = 0;
  for (const [z, T] of [[0.9 / 1.16, T1], [0.9 / 1.16 / 1.16, T2]]) {
    A.cam.z = z; A.gcRest = 1e9;
    for (let n = 0; n < 8; n++) {
      const R = seen(draw(A), A), a = A.renderScale(), inner = [(W0.x0 - A.cam.x) * a + A.W / 2 * A.dpr + 16, (W0.y0 - A.cam.y) * a + A.H / 2 * A.dpr + 16, (W0.x1 - A.cam.x) * a + A.W / 2 * A.dpr - 16, (W0.y1 - A.cam.y) * a + A.H / 2 * A.dpr - 16];
      worst.push(missing(T, R, inner).inn); big = Math.max(big, cloudStats(A).size);
    }
  }
  assert.deepEqual(worst.filter((n) => n > 0), [], 'no sample point of the old window\'s clouds was bare at any frame: ' + JSON.stringify(worst)); assert.ok(big <= Math.ceil(cloudCap(800, 520, 2, 1) * 1.25), 'the store stayed within its hard limit: ' + big);
}));

test('a district that opens re-bakes the cells under its own bank in that frame (the dissolve never plays over a bank that is still there), and the other cells a chunk a frame, stale ones on show meanwhile', () => withSurfaces(() => {
  const A = stubWorld(); draw(A); draw(A); const N = cloudStats(A).size, b0 = cloudStats(A).baked; assert.ok(N >= 6, `${N} cells under cloud`);
  A.gcBudget = [1e-6, 1e-6]; A.unlocked = new Set([...A.unlocked, 3]); A.reveal[3] = { t0: 5000, dur: REVEAL_MS }; A.t = 5100;
  A.fxOf = function (id) { return id === 3 ? { dim: FOG_DIM * 0.9, fog: 0.9, lights: 0.1 } : this.unlocked.has(id) ? NOFX : { dim: FOG_DIM, fog: 1, lights: 0 }; };
  const T = (() => { const w = stubWorld({ unlocked: new Set([...A.unlocked]) }); draw(w); return seen(draw(w), w); })();
  const first = seen(draw(A), A), b1 = cloudStats(A).baked - b0; const store = cloudStore(A), reachOf = bankOf(DIST[3], 1).reach;
  assert.ok(b1 >= 1 && b1 < N * 0.7, `${b1} chunks baked in the opening frame of ${N}: the cells under the bank, not every cell`);
  const a = A.renderScale(); for (const c of store.map.values()) { const s0 = 384 / c.a, x0 = c.i * s0, x1 = x0 + s0, y0 = c.j * s0, y1 = y0 + s0; if (x1 > reachOf.x0 && x0 < reachOf.x1 && y1 > reachOf.y0 && y0 < reachOf.y1) assert.ok(!c.stale, `the chunk (${c.i}, ${c.j}) under the opening bank is baked again`); }
  assert.equal(missing(T, first).all, 0, 'the clouds that stay are on show in that frame'); void a;
  for (let n = 0; n < 40; n++) { const R = seen(draw(A), A); assert.equal(missing(T, R).all, 0, `frame ${n + 2}: nothing that stays under cloud is bare`); }
  assert.equal([...store.map.values()].filter((c) => c.stale).length, 0, 'every stale chunk was replaced, a few a frame');
}));
