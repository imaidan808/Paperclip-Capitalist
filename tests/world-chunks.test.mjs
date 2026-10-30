// The V2 ground in the chunk cache (js/world/groundcache.js with chunkcache.js, T5; js/world/groundchunks.js, T1): on stand-in surfaces (no canvas is made), what the integrated ground does. The cache is T5's (chunks of CHUNK_PX
// device pixels at the exact scale, stamped 1:1 on whole pixels, sealed, kept per scale); the content of a chunk is T1's V2 base (a per-pixel picture painted into a buffer the descriptor hands to the `shore` layer).
// This file replaces the one that pinned T1's own stand-in cache (chunkPass), which the merge retired.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx } from './helpers/recctx.mjs';

// stand-ins for the browser's offscreen surfaces, installed before the modules ask for one
const made = [];
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; this.ctx = recCtx(); made.push(this); } getContext() { return this.ctx.ctx; } };
globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
const { groundCacheMethods } = await import('../js/world/groundcache.js');
const { groundMethods } = await import('../js/world/ground.js');
const { chunkDescriptor, releaseChunkBuffers } = await import('../js/world/groundchunks.js');
const { CHUNK_PX, CHUNK_FULL, BLEED } = await import('../js/world/chunks.js');
const { ledger, releaseAll } = await import('../js/world/gfx.js');
const { lodOf } = await import('../js/world/lod.js');
const { LAYOUT } = await import('../js/world/layout.js');
const { registerLayer } = await import('../js/world/stack.js');
// the real layers are tested on their own (rasterbase, the rig); here the cache's glue is: spies take their places and record what a bake hands the `shore` layer
const seen = [];
registerLayer('shore', (ctx, view, env, w, a) => { seen.push({ mode: a.mode, S: a.chunk && a.chunk.S, N: a.chunk && a.chunk.N, ox: a.chunk && a.chunk.ox, oy: a.chunk && a.chunk.oy, maxZ: view.maxZ }); if (a.chunk && a.chunk.img) ctx.putImageData(a.chunk.img, 0, 0); }, 'inherit', () => 1);
for (const id of ['terrain', 'roads', 'blocks']) registerLayer(id, () => {}, 'inherit', () => 1);
registerLayer('livedecals', () => {}, 'inherit');

const world = (cam = { x: -2944, y: 2153, z: 1 }, dpr = 1.5, W = 1440, H = 900) => ({
  ...groundCacheMethods, ...groundMethods,
  cam, dpr, W, H, cv: { width: Math.floor(W * dpr), height: Math.floor(H * dpr) }, unlockHash: 7, unlocked: new Set([1]), gnd: { zoom: 1, far: false, mode: 0, see: null, chunk: null }, gcKey: [NaN, NaN, NaN, 0, 0, 0, 0, 0], gcSeen: 0, gcValid: false, dirty: false, gcA: Math.round(cam.z * dpr * 1e5) / 1e5, gcAt: -1e9, // (the scale has stood still: a first frame that is a pinch's would bake at the bucket scale and stand in)
  env: { t: 0, night: 0, dim: 0, far: false, lite: false, lod: lodOf(cam.z), lights: [] }, reveal: {}, hits: [], decals: new Map(),
  toWorld() {}, toScreen() {}, revealing() { return !!this.reveal.on; }, reduced() { return true; }, fxOf() { return { dim: 0 }; },
});
const frame = (w, n = 1) => { const main = recCtx(); for (let i = 0; i < n; i++) { w.env.lod = lodOf(w.cam.z); main.log.calls.length = 0; w.groundPass(main.ctx, { x0: -1e5, x1: 1e5, y0: -1e5, y1: 1e5 }); } return main; };
const blits = (main) => main.log.calls.filter((c) => c[0] === 'drawImage');

test('the descriptor hands the base its chunk: the scale and the origin of the pixels, a buffer of the surface\'s side, the scene, and the island\'s highest ground on the view', () => {
  const w = { unlocked: new Set([1]) }, view = { x0: 100, x1: 400, y0: -50, y1: 250 }, info = { k: 1.5, ss: 1, n: CHUNK_FULL };
  const d = chunkDescriptor(w, view, info);
  assert.equal(d.S, 1.5); assert.equal(d.ox, 100); assert.equal(d.oy, -50); assert.equal(d.N, CHUNK_FULL); assert.equal(d.buf.length, CHUNK_FULL * CHUNK_FULL * 4); assert.ok(d.img && d.img.width === CHUNK_FULL); assert.ok(d.scene && d.scene.terr, 'the scene of the locked set');
  assert.equal(view.maxZ, LAYOUT.maxZ, 'the base reads the island\'s highest ground from the view (a rectangle without it is painted as open sea: the white chunks of the first merge)');
  const buf = d.buf; assert.strictEqual(chunkDescriptor(w, view, info).buf, buf, 'the buffer is reused for the same size');
  const d2 = chunkDescriptor(w, view, { k: 3, ss: 2, n: CHUNK_FULL * 2 }); assert.equal(d2.N, CHUNK_FULL * 2); assert.equal(d2.bleed, 2); assert.equal(d2.buf.length, CHUNK_FULL * 2 * CHUNK_FULL * 2 * 4, 'a supersampled bake gets a buffer of its own size');
  releaseChunkBuffers();
});

test('the first ground is baked whole (a chunk for every cell the window touches, each put through the V2 base and stamped once, 1:1 on whole device pixels, together covering the canvas)', () => {
  ledger.clear(); made.length = 0; seen.length = 0; const w = world(), main = frame(w);
  const cw = w.cv.width, ch = w.cv.height, b = blits(main).filter((c) => c.length === 4);
  assert.ok(b.length >= Math.ceil(cw / CHUNK_PX) * Math.ceil(ch / CHUNK_PX), `${b.length} stamps`);
  let covered = 0; const cells = new Set();
  for (const [, , dx, dy] of b) { assert.ok(Number.isInteger(dx) && Number.isInteger(dy), `a stamp lands on whole device pixels (${dx}, ${dy})`); cells.add(dx + ',' + dy); covered += Math.max(0, Math.min(cw, dx + CHUNK_PX) - Math.max(0, dx)) * Math.max(0, Math.min(ch, dy + CHUNK_PX) - Math.max(0, dy)); }
  assert.equal(cells.size, b.length, 'no cell twice'); assert.equal(covered, cw * ch, 'the chunks tile the canvas with no gap and no overlap inside it');
  assert.ok(made.some((m) => m.ctx.log.calls.some((c) => c[0] === 'putImageData')), 'the V2 base was put into a chunk');
  const a = w.dpr * w.cam.z; assert.ok(seen.length >= b.length); for (const q of seen) { assert.equal(q.N, CHUNK_FULL, 'the bake is handed a surface of the cell and its bleed'); assert.ok(Math.abs(q.S - a) < 1e-9, 'at the exact render scale'); assert.equal(q.maxZ, LAYOUT.maxZ); assert.ok(Math.abs(q.ox * a - Math.round(q.ox * a + BLEED) + BLEED) < 1e-6, 'its origin is a cell edge less the bleed, on a whole device pixel'); }
});

test('a camera at rest stamps only: the ring beyond the window is baked one chunk a frame, and when it is whole nothing is baked at all', () => {
  const w = world(); frame(w, 2); const base = w.gc.stats.baked;
  frame(w, 1); assert.ok(w.gc.stats.baked - base <= 1, 'at most one ring chunk a frame');
  for (let i = 0; i < 40; i++) frame(w); const full = w.gc.stats.baked; frame(w); assert.equal(w.gc.stats.baked, full, 'a ring complete and nothing to bake: stamps only');
  assert.ok(w.gc.size <= Math.ceil((Math.ceil(w.cv.width / CHUNK_PX) + 1) * (Math.ceil(w.cv.height / CHUNK_PX) + 1) * 1.35) + 2, 'the set stays within the cap');
});

test('a district opening keeps the chunks on show (stale) and bakes the new ones over them, a few a frame: the ground never blanks, and V2 has no direct drawing even while a reveal is running', () => {
  const w = world(); frame(w, 40); const n = w.gc.size, b0 = w.gc.stats.baked;
  w.unlockHash = 99; w.reveal.on = true; const main = frame(w);
  assert.equal(w.gc.size, n, 'nothing is dropped: the stale chunks stay');
  assert.ok(blits(main).filter((c) => c.length === 4).length >= Math.ceil(w.cv.width / CHUNK_PX) * Math.ceil(w.cv.height / CHUNK_PX), 'the window is still stamped in full');
  assert.ok(w.gc.stats.baked > b0 && w.gc.stats.baked - b0 < n, 'a few are baked this frame, not all');
  let stale = 0; for (let i = 0; i < 80; i++) { frame(w); stale = [...w.gc.map.values()].filter((c) => c.stale).length; if (!stale) break; }
  assert.ok([...w.gc.map.values()].filter((c) => c.stale && c.i >= 0).length <= Math.ceil(n * 0.35), 'the stale chunks are replaced (the ring ahead is left for later)');
});

test('the ledger holds what the cache holds and letting go gives it back; with no offscreen surfaces the pass draws directly (nothing is baked)', () => {
  ledger.clear(); const w = world(); frame(w, 4); assert.ok(ledger.total('ground.chunks') > 0); w.release?.call(w); w.releaseGround(); releaseAll(); assert.equal(ledger.total('ground.chunks'), 0);
  const v = world(); v.cacheOK = () => false; let direct = 0; v.drawGround = () => { direct++; }; frame(v); assert.ok(direct >= 1 && !v.gc, 'drawn directly, no store made');
});
