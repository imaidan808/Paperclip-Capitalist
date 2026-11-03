// What a chunk of the V2 ground costs to make and how it is stamped while the exact ground is being made (js/world/chunkcache.js, js/world/groundcache.js, js/world/world.js). A profile of the live ground at four times
// slower than a Mac (scripts/perf-moves.mjs) found three things that made the picture a mosaic for seconds after every move: every chunk was read back from its canvas to be sealed against cracks (a third of a chunk's cost
// at full speed, and 55 to 125 ms stalls when the canvas had to be flushed first) although the V2 base paints every pixel opaque and has no crack to close; stand-ins magnified past 1.6 were drawn without smoothing (the blocky
// stair-steps on cliff edges of a recording) on machines where a smoothed blit is nearly free; and the quality governor took a quarter off the canvas density because of frames that were slow only while the ground
// was being made, which bakes all of it again. These tests pin each of them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx } from './helpers/recctx.mjs';

globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; this.ctx = recCtx(); } getContext() { return this.ctx.ctx; } };
globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
const { CHUNK_FULL } = await import('../js/world/chunks.js');
const { ChunkCache } = await import('../js/world/chunkcache.js');
const { groundCacheMethods } = await import('../js/world/groundcache.js');
const { groundMethods } = await import('../js/world/ground.js');
const { LAYOUT } = await import('../js/world/layout.js');
const { lodOf } = await import('../js/world/lod.js');
const { registerLayer } = await import('../js/world/stack.js');
registerLayer('shore', () => {}, 'inherit', () => 1);
for (const id of ['terrain', 'roads', 'blocks']) registerLayer(id, () => {}, 'inherit', () => 1);
registerLayer('livedecals', () => {}, 'inherit');

/** A world with only what the ground pass reads (the harness of tests/world-overview.test.mjs). */
const world = (cam = { x: -2944, y: 2153, z: 1 }, dpr = 1.5, W = 1440, H = 900) => ({
  ...groundCacheMethods, ...groundMethods,
  cam, dpr, W, H, cv: { width: Math.floor(W * dpr), height: Math.floor(H * dpr) }, unlockHash: 7, unlocked: new Set([1]), gnd: { zoom: 1, far: false, mode: 0, see: null, chunk: null }, gcKey: [NaN, NaN, NaN, 0, 0, 0, 0, 0], gcSeen: 0, gcValid: false,
  env: { t: 0, night: 0, dim: 0, far: false, lite: false, lod: lodOf(cam.z), lights: [] }, reveal: {}, hits: [], decals: new Map(),
  toWorld() {}, toScreen() {}, revealing() { return !!this.reveal.on; }, reduced() { return true; }, fxOf() { return { dim: 0 }; }, bounds() { return LAYOUT.bounds; },
  gcBudget: [1e-6, 1e-6], gcRest: 0,
});
const frame = (w) => { const main = recCtx(); w.env.lod = lodOf(w.cam.z); w.groundPass(main.ctx, { x0: -1e5, x1: 1e5, y0: -1e5, y1: 1e5 }); return main; };

/** A surface factory that counts the readbacks the store makes. */
function counting(opt = {}) {
  const made = []; let reads = 0, puts = 0; const bm = () => ({ close() {} });
  const make = (w, h) => {
    const g = { setTransform() {}, clearRect() {}, drawImage() {}, imageSmoothingEnabled: true, imageSmoothingQuality: 'low',
      getImageData: (x, y, ww, hh) => { reads++; const d = new Uint8ClampedArray(ww * hh * 4); if (!opt.empty) for (let i = 0; i < ww * hh; i++) d[i * 4 + 3] = 255; return { data: d, width: ww, height: hh }; },
      putImageData: () => { puts++; } };
    const f = { c: { width: w, height: h, transferToImageBitmap: () => bm() }, g }; made.push(f); return f;
  };
  return { make, made, get reads() { return reads; }, get puts() { return puts; } };
}

test('a chunk of an opaque ground (the V2 base paints every pixel) is not read back to be sealed: nothing to close, and never a cell of open sea', () => {
  const L = counting(), legacy = new ChunkCache('test.legacy', L.make); legacy.bake(() => {}, 1.8, 0, 0, 2);
  assert.ok(L.reads > 0, 'the legacy ground, which has gaps between its shapes, is still sealed');
  const O = counting({ empty: true }), store = new ChunkCache('test.opaque', O.make); store.opaque = true;
  const c = store.bake(() => {}, 1.8, 0, 0, 2);
  assert.equal(O.reads, 0, 'no getImageData: it stalled the page for 55 to 125 ms while the canvas was flushed, and was a third of a chunk\'s cost');
  assert.equal(c.empty, false, 'an opaque chunk is never a cell of open sea, whatever a readback would say: the sea is painted');
  assert.ok(c.img && c.bytes > 0, 'it is a bitmap like any other');
  assert.equal(c.sealed, false); assert.equal(store.stats.sealed, 0);
  assert.ok(O.made.some((f) => f.c.width === CHUNK_FULL), 'and it is baked as it was');
  legacy.release(); store.release();
});

test('the V2 ground pass makes its store opaque, so none of its chunks is read back', () => {
  const w = world(); w.gcBudget = [1e9, 1e9]; frame(w);
  assert.equal(w.gc.opaque, true); assert.ok(w.gc.size > 0, 'chunks were made'); assert.equal(w.gc.stats.sealed, 0, 'and none sealed');
});

test('a camera that moves, or a ground that is still being made, is settling: its frames pay for caches filled once, are not judged by the governor, and the loop draws every refresh while it lasts', async () => {
  const G = await import('../js/world/governor.js'), { World } = await import('../js/world/world.js');
  const w = Object.create(World.prototype); w.cv = { width: 100 };
  for (const [moving, gcValid, gcMore, want] of [[false, true, false, false], [true, true, false, true], [false, false, false, true], [false, true, true, true], [false, undefined, false, true]]) Object.assign(w, { moving, gcValid, gcMore }), assert.equal(w.settling(), want, JSON.stringify({ moving, gcValid, gcMore }));
  w.cv = { width: 0 }; Object.assign(w, { moving: true, gcValid: false, gcMore: true }); assert.equal(w.settling(), false, 'with no canvas to bake into the ground is drawn straight every frame, and a slow frame is a slow frame');
  const { readFileSync } = await import('node:fs'); assert.match(readFileSync(new URL('../js/world/world.js', import.meta.url), 'utf8'), /if \(\(this\.moving \|\| this\.gcMore\) && this\.slow < 3\) this\.fps = 60/, 'the frame loop draws every refresh while the camera moves or the ground is being made');
  assert.equal(G.fpsFor(0, false), 30, 'a still picture over a whole ground idles at 30');
  assert.equal(G.fpsFor(0, true), 60, 'and the ground being made is drawn every refresh like a moving camera: a chunk or two a frame, so a 30 fps loop took twice as long to finish it');
  assert.equal(G.fpsFor(3, true), 20, 'unless the machine has already fallen to tier 3');
  // the zoom out that took a quarter off the canvas density (tier 4) because of frames that were slow only while the ground was made: the same slow frames, flagged as a settle, move nothing
  const mk = () => { const o = Object.create(World.prototype); o.gov = { cost: 0, bad: 0, good: 0, wait: G.GOV_WAIT, upAt: -1e9, prev: 0 }; o.warm = 0; o.slow = 0; o.fps = 30; o.t = 0; return o; };
  const o = mk(); for (let i = 0; i < 120; i++) o.govern(60, 0, true); assert.equal(o.slow, 0, 'sixty-millisecond frames of a settle are not judged');
  const p = mk(); for (let i = 0; i < 60; i++) p.govern(60, 0, false); assert.ok(p.slow >= 3, 'and the same frames of a still picture are: ' + p.slow);
});

/** The blits of a frame with the smoothing in force when each was made: the main context's `drawImage` is wrapped to read the flag the ground pass had set (recCtx logs the call, not the state). */
const smoothing = (w) => {
  const main = recCtx(), seen = [];
  const ctx = new Proxy(main.ctx, { get(o, k) { if (k === 'drawImage') return (...a) => { seen.push({ smooth: o.imageSmoothingEnabled, a }); return o.drawImage(...a); }; return Reflect.get(o, k); }, set(o, k, v) { o[k] = v; return true; } });
  w.env.lod = lodOf(w.cam.z); w.groundPass(ctx, { x0: -1e5, x1: 1e5, y0: -1e5, y1: 1e5 }); return seen;
};

test('a stand-in magnified past 1.6 while the zoom moves is smoothed on a canvas the GPU draws (the blocky stair-steps on cliff edges of a recording): nearest-neighbour is for a CPU canvas that cannot afford the blit', async () => {
  const { standInSmooth, NEAREST_ABOVE } = await import('../js/world/chunks.js');
  for (const k of [0.6, 1, 1.59, 1.6, 2.4, 3.2]) assert.equal(standInSmooth(k, true, false), true, `on a GPU canvas ${k}x is smoothed`);
  assert.equal(standInSmooth(2.4, true, true), false, 'a CPU canvas pays 3.2 ms a megapixel for a smoothed blit and 1 for a plain one: past NEAREST_ABOVE it draws plain while the zoom moves');
  assert.equal(standInSmooth(NEAREST_ABOVE - 0.01, true, true), true); assert.equal(standInSmooth(3, false, true), true, 'and the exact scale, once the zoom rests, is never blocky');
  // the real thing: a frame of a zoom whose stand-ins are magnified past the line has every one of them smoothed
  const control = world(undefined, undefined, undefined, undefined); control.bounds = undefined; // (no overview: the coarse cover is what stands in)
  control.gcBudget = [1e9, 1e9]; frame(control); control.gcBudget = [1e-6, 1e-6]; Object.assign(control.cam, { x: -2944 + 3000, y: 2153 + 1500, z: 1.3 }); control.gcRest = 1e9;
  let big = 0; for (let n = 0; n < 4; n++) for (const { smooth, a } of smoothing(control)) if (a.length === 5 && a[3] / (384 + 1) >= 1.6) { big++; assert.equal(smooth, true, 'a stand-in magnified ' + (a[3] / 385).toFixed(2) + 'x is drawn smoothed'); }
  assert.ok(big > 0, 'the scenario puts stand-ins past the line on show (else this asserts nothing)');
});

test('the surfaces an opaque ground is baked on stay CPU-backed although nothing reads them back: a GPU canvas anti-aliases a path with 4 samples (5 coverage levels, the CPU\'s analytic edge has 256), and the road dashes and cliff edges of a chunk showed stair-steps (measured on an M1 Pro: 5 levels against 34 on a test path)', () => {
  const opts = []; const make = (w, h, o) => { opts.push({ w, h, o }); return { c: { width: w, height: h, transferToImageBitmap: () => ({ close() {} }) }, g: { setTransform() {}, clearRect() {}, drawImage() {}, imageSmoothingEnabled: true } }; };
  const store = new ChunkCache('test.cpu', make); store.opaque = true; store.bake(() => {}, 1.8, 0, 0, 2);
  assert.ok(opts.length >= 2 && opts.every((x) => x.o && x.o.willReadFrequently), 'willReadFrequently: ' + JSON.stringify(opts)); store.release();
});
