// The ground in chunks (js/world/groundchunks.js): what a pan, a rest and a zoom ask of the cache, on stand-in surfaces (no canvas is made). The chunk is the unit: CHUNK_PX device pixels, baked at the exact scale
// by the stack's ground layers, blitted 1:1 on whole device pixels (the camera's translation is rounded), kept per scale with the old scale shown scaled until the new one is made.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx } from './helpers/recctx.mjs';

// stand-ins for the browser's offscreen surfaces, installed before the module asks for one
const made = [];
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; this.ctx = recCtx(); made.push(this); } getContext() { return this.ctx.ctx; } };
globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
const { chunkPass, ChunkCache } = await import('../js/world/groundchunks.js');
const { CHUNK_PX, groundBytes } = await import('../js/world/chunks.js');
const { ledger, releaseAll } = await import('../js/world/gfx.js');
const { lodOf } = await import('../js/world/lod.js');
const { setFlag } = await import('../js/world/stack.js');
await import('../js/world/ground.js'); // the V2 ground layers register themselves

const world = (cam = { x: -2944, y: 2153, z: 1 }, dpr = 1.5, W = 1440, H = 900) => ({
  cacheOK: () => true, cam, dpr, W, H, cv: { width: Math.floor(W * dpr), height: Math.floor(H * dpr) }, unlockHash: 7, unlocked: new Set([1]), gnd: { zoom: 1, far: false, mode: 0, see: null }, gcValid: false,
  env: { t: 0, night: 0, dim: 0, far: false, lite: false, lod: lodOf(cam.z), lights: [] },
  toWorld() {}, toScreen() {},
});
const run = (w, n = 1) => { const main = recCtx(); for (let i = 0; i < n; i++) { w.env.lod = lodOf(w.cam.z); main.log.calls.length = 0; chunkPass(w, main.ctx); } return main; };
const blits = (main) => main.log.calls.filter((c) => c[0] === 'drawImage');

test('the first ground is baked whole: one chunk for every chunk the window touches, each blitted once at whole device pixels, and together they cover the canvas', () => {
  ledger.clear(); const w = world(), main = run(w); assert.equal(chunkPass.length, 2);
  const cw = w.cv.width, ch = w.cv.height, b = blits(main); assert.ok(b.length >= Math.ceil(cw / CHUNK_PX) * Math.ceil(ch / CHUNK_PX) && b.length <= (Math.ceil(cw / CHUNK_PX) + 1) * (Math.ceil(ch / CHUNK_PX) + 1), `${b.length} blits`);
  let covered = 0; const seen = new Set();
  for (const c of b) { const [, , sx, sy, sw, sh, dx, dy, dw, dh] = c; assert.ok(Number.isInteger(dx) && Number.isInteger(dy), `a blit lands on whole device pixels (${dx}, ${dy})`); assert.equal(sw, CHUNK_PX); assert.equal(dw, CHUNK_PX); assert.equal(dh, CHUNK_PX); seen.add(dx + ',' + dy); covered += Math.max(0, Math.min(cw, dx + dw) - Math.max(0, dx)) * Math.max(0, Math.min(ch, dy + dh) - Math.max(0, dy)); }
  assert.equal(seen.size, b.length, 'no chunk twice'); assert.equal(covered, cw * ch, 'the chunks tile the canvas with no gap and no overlap inside it');
  assert.ok(w.chunks.stats.baked >= b.length);
});

test('a camera at rest draws copies only; a pan bakes only the chunks it exposes, and the ring ahead of it is baked one a frame', () => {
  const w = world(); run(w, 3); const base = w.chunks.stats.baked; run(w, 2); assert.ok(w.chunks.stats.baked - base <= 2, 'at rest at most the ring is being filled, one a frame');
  for (let i = 0; i < 40; i++) run(w); const full = w.chunks.stats.baked;
  run(w); assert.equal(w.chunks.stats.baked, full, 'a ring complete and nothing to bake: blits only');
  w.cam.x += 70 / w.cam.z; const before = w.chunks.stats.baked; const main = run(w); assert.ok(blits(main).length > 20); assert.ok(w.chunks.stats.baked - before <= 6, `a pan of 70 css pixels baked ${w.chunks.stats.baked - before} chunks`);
});

test('a zoom keeps the old scale on show, scaled, and bakes the exact one when it rests; the old set is freed when the new one is whole', () => {
  const w = world(); for (let i = 0; i < 8; i++) run(w); const before = w.chunks.stats.baked;
  w.cam.z = 1.08; const main = run(w); const b = blits(main);
  assert.ok(b.some((c) => c[8] !== CHUNK_PX), 'chunks of the old scale are blitted scaled while the zoom has just changed'); assert.equal(w.chunks.stats.baked, before, 'a zoom on the move bakes nothing while there is an old set to show');
  assert.ok(w.chunks.old && w.chunks.old.size > 20, 'the old set is kept');
  for (let i = 0; i < 40 && w.chunks.old; i++) run(w);
  assert.equal(w.chunks.old, null, 'the exact scale is complete and the old one is gone'); assert.ok(w.chunks.cur.S === w.dpr * 1.08);
  const main2 = run(w); for (const c of blits(main2)) assert.equal(c[8], CHUNK_PX, 'at rest every blit is 1:1');
});

test('the ledger holds what the cache holds, and letting go gives it back', () => {
  ledger.clear(); const w = world(); run(w, 4); const n = w.chunks.count(); assert.ok(n > 20 && ledger.total('ground.chunks') === n * (CHUNK_PX + 4) ** 2 * 4, 'the ledger counts the chunks at four bytes a pixel');
  assert.ok(n * (CHUNK_PX + 4) ** 2 * 4 <= groundBytes(1440, 900, 1.5).peak * 1.5, 'the ground stays within the plan\'s memory for the window'); releaseAll(); assert.equal(ledger.total('ground.chunks'), 0); assert.equal(w.chunks.count(), 0);
});

test('with no offscreen surfaces the pass answers false and the ground is drawn directly; a state change (a district opening) makes the set again', () => {
  const w = world(); w.cacheOK = () => false; assert.equal(chunkPass(w, recCtx().ctx), false);
  const v = world(); run(v, 4); const first = v.chunks.cur; v.unlockHash = 99; run(v); assert.notStrictEqual(v.chunks.cur, first, 'a new state of the ground, a new set'); assert.ok(v.chunks.old === first || v.chunks.old === null);
});

test('every layer the chunks bake with is V2 in the default build', () => { for (const id of ['sea', 'shore', 'terrain', 'roads', 'blocks', 'livedecals']) assert.equal(setFlag(id, 'v2'), 'v2', id); });
