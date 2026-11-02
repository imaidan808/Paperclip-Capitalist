// The overview: a permanent, very coarse picture of the whole island's ground that lies under everything (js/world/groundcache.js, js/world/chunkcache.js). Whatever the exact chunks and the stand-ins do not cover yet
// shows it, soft, and never the bare sea: a recording of the live site (build 9ecceaa) had hard-edged flat rectangles at the coast for about a second every time the camera zoomed or glided, because the cells at
// the edge of the window had never been made at any scale. What a frame DREW is read back from the recording context with the clips in force (tests/helpers/reach.mjs), as in tests/world-ground-holes.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx } from './helpers/recctx.mjs';
import { reach } from './helpers/reach.mjs';

globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; this.ctx = recCtx(); } getContext() { return this.ctx.ctx; } };
globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
const { groundCacheMethods } = await import('../js/world/groundcache.js');
const { groundMethods } = await import('../js/world/ground.js');
const { CHUNK_PX, OVERVIEW_A, overviewCells } = await import('../js/world/chunks.js');
const { LAYOUT } = await import('../js/world/layout.js');
const { lodOf } = await import('../js/world/lod.js');
const { registerLayer } = await import('../js/world/stack.js');
const { ledger } = await import('../js/world/gfx.js');
registerLayer('shore', () => {}, 'inherit', () => 1);
for (const id of ['terrain', 'roads', 'blocks']) registerLayer(id, () => {}, 'inherit', () => 1);
registerLayer('livedecals', () => {}, 'inherit');

const world = (cam = { x: -2944, y: 2153, z: 1 }, dpr = 1.5, W = 1440, H = 900, withBounds = true) => ({
  ...groundCacheMethods, ...groundMethods,
  cam, dpr, W, H, cv: { width: Math.floor(W * dpr), height: Math.floor(H * dpr) }, unlockHash: 7, unlocked: new Set([1]), gnd: { zoom: 1, far: false, mode: 0, see: null, chunk: null }, gcKey: [NaN, NaN, NaN, 0, 0, 0, 0, 0], gcSeen: 0, gcValid: false,
  env: { t: 0, night: 0, dim: 0, far: false, lite: false, lod: lodOf(cam.z), lights: [] }, reveal: {}, hits: [], decals: new Map(),
  toWorld() {}, toScreen() {}, revealing() { return !!this.reveal.on; }, reduced() { return true; }, fxOf() { return { dim: 0 }; },
  ...(withBounds ? { bounds() { return LAYOUT.bounds; } } : {}),
  gcBudget: [1e-6, 1e-6], gcRest: 0, // one chunk a frame, and the scale is never "just changed" unless a test says so
});
const frame = (w) => { const main = recCtx(); w.env.lod = lodOf(w.cam.z); w.groundPass(main.ctx, { x0: -1e5, x1: 1e5, y0: -1e5, y1: 1e5 }); return main; };
const toCam = (gx, gy, gz) => ({ x: (gx - gy) * 32, y: (gx + gy) * 16 - gz });
/** The ground of the starting view made whole (the first frame bakes all of it), then frames until the overview and the ring are made, a chunk a frame. */
const settled = (w, frames = 90) => { w.gcBudget = [1e9, 1e9]; frame(w); w.gcBudget = [1e-6, 1e-6]; for (let n = 0; n < frames; n++) frame(w); return w; };
const cellCount = () => { const c = overviewCells(LAYOUT.bounds); return (c.i1 - c.i0 + 1) * (c.j1 - c.j0 + 1); };

test('the overview covers the island\'s whole box at a very coarse scale, in a few chunks', () => {
  const c = overviewCells(LAYOUT.bounds), s = CHUNK_PX / OVERVIEW_A, b = LAYOUT.bounds;
  assert.ok(OVERVIEW_A > 0.03 && OVERVIEW_A < 0.2, 'a few hundredths of a pixel to the world pixel: a whole island in a handful of chunks');
  assert.ok(c.i0 * s <= b.x0 && (c.i1 + 1) * s >= b.x1 && c.j0 * s <= b.y0 && (c.j1 + 1) * s >= b.y1, 'the cells cover the box the camera can reach: ' + JSON.stringify(c));
  assert.ok(cellCount() >= 2 && cellCount() <= 12, `${cellCount()} chunks (about 0.6 MB each): a handful`);
  assert.equal(c.s, s);
});

test('once the window\'s ground is whole and still the overview is made, a chunk a frame, apart from the exact chunks, which it never takes the place of', () => {
  const w = world(); w.gcBudget = [1e9, 1e9]; frame(w); assert.equal(w.gcValid, true); assert.equal(w.gc.ov.size, 0, 'nothing is spent on it before the first screen is whole');
  w.gcBudget = [1e-6, 1e-6]; const sizes = []; for (let n = 0; n < 40; n++) { frame(w); sizes.push(w.gc.ov.size); }
  assert.equal(w.gc.ov.size, cellCount(), 'every cell of the island\'s box has its chunk: ' + JSON.stringify(sizes));
  for (let n = 1; n < sizes.length; n++) assert.ok(sizes[n] - sizes[n - 1] <= 1, 'one a frame: ' + JSON.stringify(sizes));
  assert.ok([...w.gc.map.values()].every((c) => c.a !== OVERVIEW_A && !c.pin), 'the exact store holds none of it: its counts, its cap and its sweep are what they were');
  assert.ok([...w.gc.ov.values()].every((c) => c.pin && c.a === OVERVIEW_A), 'and it is marked as what it is');
  assert.ok(w.gc.bytes >= [...w.gc.ov.values()].reduce((s, c) => s + c.bytes, 0), 'the ledger holds it with the rest of the ground: ' + w.gc.bytes);
});

test('a camera that jumps to ground nobody has made shows no bare piece in its first frame (without the overview it did: a coarse chunk a frame left the rest of the window bare)', () => {
  const far = toCam(116, 46, 46);
  const control = settled(world(undefined, undefined, undefined, undefined, false)); Object.assign(control.cam, far); control.gcRest = 0;
  const c1 = frame(control), bareWithout = reach(c1, control.cv.width, control.cv.height).bare();
  assert.ok(bareWithout > 0, `the fault this guards against is real: ${bareWithout} sample points bare without it`);
  const w = settled(world()); assert.equal(w.gc.ov.size, cellCount()); Object.assign(w.cam, far); w.gcRest = 0;
  for (let n = 0; n < 3; n++) { const main = frame(w), r = reach(main, w.cv.width, w.cv.height); assert.equal(r.bare(), 0, `frame ${n + 1}: nothing bare, however far the camera went`); assert.equal(w.gcHoles, 0, 'and the gauge says so'); }
});

test('the same while the zoom moves: a notch out and a glide in the same frame leave no bare piece, even with no exact chunk made yet at the new scale', () => {
  const w = settled(world()); w.gcRest = 1e9; // (the scale is moving)
  for (const z of [0.86, 0.74, 0.64, 0.55]) { w.cam.z = z; Object.assign(w.cam, toCam(87, 112, 10)); const main = frame(w), r = reach(main, w.cv.width, w.cv.height); assert.equal(r.bare(), 0, `zoom ${z}: nothing bare`); assert.equal(w.gcHoles, 0); }
});

test('what lies outside the box of the island is open sea and is not a hole (it is drawn by the sea and the waves, and no chunk would add to it)', () => {
  const w = settled(world()), b = LAYOUT.bounds; Object.assign(w.cam, { x: b.x0 + 200, y: (b.y0 + b.y1) / 2 }); w.gcRest = 0;
  const main = frame(w), r = reach(main, w.cv.width, w.cv.height); assert.equal(w.gcHoles, 0, 'the window hangs out over the sea beyond the box, and the gauge counts only the island\'s');
  const a = w.renderScale(), e = w.snap[0], f = w.snap[1], inX = (b.x0 * a + e); assert.equal(r.bare(Math.max(0, inX), 0, w.cv.width, w.cv.height), 0, 'the part of the picture that is inside the box is whole');
});

test('while the camera moves, with the overview under everything, a chunk that costs more than the frame\'s budget is not started (the first one of a frame used to be baked whatever it cost: 10 to 14 frames a second); at rest the first one still is', () => {
  const w = settled(world()); w.gcBudget = [14, 9]; Object.assign(w.cam, toCam(87, 112, 10)); w.gcRest = 0; w.gc.stats.lastMs = 50; // (a chunk costs 50 ms on this machine)
  const baked0 = w.gc.stats.baked, main = frame(w); assert.equal(reach(main, w.cv.width, w.cv.height).bare(), 0);
  assert.equal(w.gc.stats.baked, baked0, 'the camera moved and the next chunk would take 50 ms: none was baked, the overview and the stand-ins were the picture');
  w.gc.stats.lastMs = 50; frame(w); assert.ok(w.gc.stats.baked > baked0, 'the camera is still: the first chunk of the frame is baked whatever it costs, as it always was');
  const w2 = settled(world()); w2.gcBudget = [14, 9]; Object.assign(w2.cam, toCam(87, 112, 10)); w2.gcRest = 0; w2.gc.stats.lastMs = 1; const b2 = w2.gc.stats.baked; frame(w2); assert.ok(w2.gc.stats.baked > b2, 'a cheap chunk (1 ms) is baked within the moving budget');
});

test('without the overview (not all of it made, or none) nothing about the moving frames changes: the first chunk of a frame is baked and a bare cell is covered coarse first', () => {
  const w = world(undefined, undefined, undefined, undefined, false); w.gcBudget = [14, 9]; w.gcRest = 0; frame(w); w.gc.stats.lastMs = 50; Object.assign(w.cam, toCam(87, 112, 10)); const baked0 = w.gc.stats.baked; frame(w);
  assert.ok(w.gc.stats.baked > baked0, 'a moving frame bakes at least one chunk when nothing is under the picture');
  const half = world(); half.gcBudget = [1e9, 1e9]; frame(half); half.gcBudget = [1e-6, 1e-6]; frame(half); frame(half); assert.ok(half.gc.ov.size > 0 && half.gc.ov.size < cellCount(), 'a part of it is made');
  half.gcBudget = [14, 9]; half.gc.stats.lastMs = 50; Object.assign(half.cam, toCam(87, 112, 10)); const b = half.gc.stats.baked; frame(half); assert.ok(half.gc.stats.baked > b, 'a part of it is not enough to rely on');
});

test('the overview is not made while the canvas is held back or for the shot rig', () => {
  const held = world(); held.gcBudget = [1e9, 1e9]; frame(held); held.veilHold = true; for (let n = 0; n < 20; n++) frame(held); assert.equal(held.gc.ov.size, 0, 'the first seconds belong to the exact ground');
  globalThis.window = { __rig: {} }; try { const rig = world(); rig.gcBudget = [1e9, 1e9]; for (let n = 0; n < 20; n++) frame(rig); assert.equal(rig.gc.ov.size, 0, 'the rig bakes what it reads and nothing else'); } finally { delete globalThis.window; }
});

test('with the ledger at its ceiling (the largest windows sit there) the overview is still made once, and made again when it is stale only when there is room: the squeeze gives back the others, never this', () => {
  const full = world(); full.gcBudget = [1e9, 1e9]; frame(full); full.gcBudget = [1e-6, 1e-6]; ledger.register('test.hog', 170e6);
  try {
    for (let n = 0; n < 30; n++) frame(full); assert.equal(full.gc.ov.size, cellCount(), 'a chunk that does not exist yet is made whatever the ledger says');
    full.unlockHash = 99; for (let n = 0; n < 80; n++) frame(full); assert.ok([...full.gc.ov.values()].every((c) => c.stale), 'over the ceiling a stale chunk is left as it is (and is still the picture under a bare cell)');
  } finally { ledger.release('test.hog'); }
  for (let n = 0; n < 40; n++) frame(full); assert.ok([...full.gc.ov.values()].every((c) => !c.stale), 'with room again it is made again');
});

test('a district opening makes the overview again (its chunks go stale and are replaced, one a frame, after the exact ground is whole), and they are shown while they are stale', () => {
  const w = settled(world()); assert.equal(w.gc.ov.size, cellCount()); w.unlockHash = 99; const far = toCam(116, 46, 46); Object.assign(w.cam, far); w.gcRest = 0;
  const main = frame(w); assert.ok([...w.gc.ov.values()].every((c) => c.stale), 'every chunk of it is stale'); assert.equal(reach(main, w.cv.width, w.cv.height).bare(), 0, 'and still the picture under the bare cells');
  for (let n = 0; n < 160; n++) frame(w); assert.ok([...w.gc.ov.values()].every((c) => !c.stale), 'made again'); assert.equal(w.gc.ov.size, cellCount());
});

test('the sweep, the cap and the squeeze of the exact store do not touch it, and giving the ground back gives it back too', () => {
  const w = settled(world()); const n = w.gc.ov.size, bytes0 = w.gc.bytes; assert.equal(n, cellCount());
  w.gc.sweep({ i0: 0, i1: 0, j0: 0, j1: 0, s: 100 }, 1, 1, performance.now(), 1, true); assert.equal(w.gc.ov.size, n, 'a sweep with a cap of one leaves it');
  w.gc.shrink(0, null, 1); assert.equal(w.gc.ov.size, n, 'and so does a shrink to nothing');
  assert.ok(bytes0 > 0); w.releaseGround(); assert.equal(w.gc, null, 'the ground is given back with it'); assert.equal(ledger.total('ground.chunks'), 0, 'the ledger holds nothing of it');
});
