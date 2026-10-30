// No hole in the ground while it is being drawn (js/world/chunks.js, chunkcache.js, groundcache.js, clouds.js, world.js). On a CPU four times slower than a Mac the ground is made one chunk a frame, 20 to 70 ms each, and for
// seconds the window showed the sea where land should be: bare rectangles over the middle of the town. Three things made them, and each has its test here: the store gave up a chunk that was still needed (the cap dropped the
// stand-ins on show, the oldest first, which is the middle of the town; the sweep dropped a stand-in the moment the chunks over it began to fade in, so the fade ran over the sea; the "is it hidden" test looked at five
// points and hid a chunk whose area was only half covered); a cell that nothing covered at all was baked like any other, one chunk a frame, instead of a soft whole picture first; and the first screen was shown before
// the ground was made. The pictures and the cell counts are scripts/perf-holes.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK_PX, scaleKey, chunkKey, cellsFor, cutParts, chunkCap } from '../js/world/chunks.js';
import { ChunkCache } from '../js/world/chunkcache.js';
import { recCtx } from './helpers/recctx.mjs';

/** A surface factory the store can bake into (nothing is drawn; each chunk is a bitmap stand-in). */
function stand() { const bm = () => ({ close() { this.closed = true; } }); return { make: (w, h) => ({ c: { width: w, height: h, transferToImageBitmap: () => bm() }, g: { setTransform() {}, clearRect() {}, drawImage() {}, imageSmoothingEnabled: true } }) }; }
const area = (parts) => { let s = 0; for (let p = 0; p < parts.length; p += 4) s += (parts[p + 2] - parts[p]) * (parts[p + 3] - parts[p + 1]); return s; };

test('cutParts: what is left of a rectangle when another is cut out of it, in pieces that tile the rest and leave out hairs', () => {
  const p = [0, 0, 10, 10]; assert.equal(cutParts(p, 3, 3, 7, 7), 16, 'a hole in the middle leaves four pieces'); assert.equal(area(p), 100 - 16);
  const q = [0, 0, 10, 10]; cutParts(q, -5, -5, 20, 20); assert.equal(q.length, 0, 'covered whole: nothing left');
  const r = [0, 0, 10, 10]; cutParts(r, 20, 20, 30, 30); assert.deepEqual(r, [0, 0, 10, 10], 'no overlap: untouched');
  const s = [0, 0, 10, 10]; cutParts(s, 0, 0, 10, 10 - 1e-9); assert.equal(s.length, 0, 'a hair left over is not a piece');
  const t = [0, 0, 10, 10]; cutParts(t, 5, -1, 11, 11); assert.deepEqual(t, [0, 0, 5, 10], 'a cut across one side leaves the other part');
  const u = [0, 0, 10, 10, 20, 0, 30, 10]; cutParts(u, 8, 0, 22, 10); assert.equal(area(u), 160, 'several rectangles are cut together: 80 and 80 are left');
  const v = [0, 0, 10, 10]; for (const [x, y] of [[0, 0], [5, 0], [0, 5], [5, 5]]) cutParts(v, x, y, x + 5, y + 5); assert.equal(v.length, 0, 'four quarters make the whole');
});

test('hidden: a stand-in is hidden only when exact chunks (and nearer ones) cover its WHOLE area, not when they cover five points of it', () => {
  const S = stand(), store = new ChunkCache('test.hid', S.make), a0 = 1, a = 2.6, sk = scaleKey(a), s = CHUNK_PX / a, s0 = CHUNK_PX / a0;
  const old = store.bake(() => {}, a0, 0, 0, 2, true); // a coarse chunk: 2.6 times magnified is inside its window
  for (const [i, j] of [[0, 0], [2, 0], [0, 2], [2, 2], [1, 1]]) store.bake(() => {}, a, i, j, 2); // the cells under its middle and its four corners, pulled in by an eighth: the old test saw these and hid the chunk
  store.standIns(a, sk, 0); assert.equal(store.hidden(old, sk, s), false, 'four cells between them are bare: the chunk is the only picture of them');
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) store.bake(() => {}, a, i, j, 2);
  store.standIns(a, sk, 0); assert.equal(store.hidden(old, sk, s), true, 'every cell under it is baked: it is hidden');
  assert.ok(s0 / s > 2.5 && s0 / s < 2.7);
  store.get(sk, 1, 1).fadeEnd = 500; store.standIns(a, sk, 100); assert.equal(store.hidden(old, sk, s), false, 'one of them is still fading in: the chunk under it still shows');
  store.standIns(a, sk, 600); assert.equal(store.hidden(old, sk, s), true, 'the fade is over');
  store.release();
});

test('hidden: nearer stand-ins hide a farther one only when together they leave nothing of it bare', () => {
  const S = stand(), store = new ChunkCache('test.hid2', S.make), a = 1.2, sk = scaleKey(a), s = CHUNK_PX / a;
  const far = store.bake(() => {}, 1, 0, 0, 2), nearA = 1.1, size = CHUNK_PX / nearA;
  store.bake(() => {}, nearA, 0, 0, 2); store.standIns(a, sk, 0); assert.equal(store.hidden(far, sk, s), false, 'one nearer chunk covers a part of it');
  for (const [i, j] of [[1, 0], [0, 1], [1, 1]]) store.bake(() => {}, nearA, i, j, 2);
  store.standIns(a, sk, 0); assert.equal(store.hidden(far, sk, s), true, 'the four nearer chunks tile what it covers (' + size.toFixed(1) + ' world px each)');
  store.release();
});

test('sweep: a stand-in is kept while the chunks over it are still fading in (the fade runs over the picture it replaces, not over the sea), and goes when the fade is over', () => {
  const S = stand(), store = new ChunkCache('test.fade', S.make), a0 = 1.8, a = a0 * 1.05, sk = scaleKey(a);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) store.bake(() => {}, a0, i, j, 2);
  const win = cellsFor({ x0: 0, x1: 2 * CHUNK_PX / a0, y0: 0, y1: 2 * CHUNK_PX / a0 }, a);
  for (let i = win.i0; i <= win.i1; i++) for (let j = win.j0; j <= win.j1; j++) { const c = store.bake(() => {}, a, i, j, 2); c.fadeEnd = 1000; }
  store.sweep(win, a, 99, 500); assert.equal([...store.map.values()].filter((c) => c.sk !== sk).length, 4, 'every chunk over them is fading: all four stay');
  store.sweep(win, a, 99, 1001); assert.equal([...store.map.values()].filter((c) => c.sk !== sk).length, 0, 'the fade is over: they go');
  store.release();
});

test('sweep: a stand-in is judged by the cells of the WINDOW under it, not by cells that are off screen', () => {
  const S = stand(), store = new ChunkCache('test.vis', S.make), a0 = 1.8, a = a0 * 1.05, sk = scaleKey(a), s = CHUNK_PX / a;
  const old = store.bake(() => {}, a0, 3, 3, 2); // at the window's right-hand edge, half of it outside
  const win = cellsFor({ x0: 3 * CHUNK_PX / a0 - 10, x1: 3.5 * CHUNK_PX / a0, y0: 3 * CHUNK_PX / a0 - 10, y1: 4 * CHUNK_PX / a0 }, a);
  for (let i = win.i0; i <= win.i1; i++) for (let j = win.j0; j <= win.j1; j++) store.bake(() => {}, a, i, j, 2);
  store.sweep(win, a, 99, 0); assert.equal(store.map.has(chunkKey(old.sk, 3, 3)), false, 'every cell of the window under it is baked: it is not needed, whatever lies beyond the window');
  assert.ok(s > 0); store.release();
});

test('sweep: a chunk of a scale far from the frame\'s is kept as a last resort while nothing covers its area, not dropped for being out of the ratio window', () => {
  const S = stand(), store = new ChunkCache('test.far', S.make), a0 = 1.8, a = a0 * 0.4, sk = scaleKey(a);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) store.bake(() => {}, a0, i, j, 2);
  const win = cellsFor({ x0: 0, x1: 3 * CHUNK_PX / a0, y0: 0, y1: 3 * CHUNK_PX / a0 }, a);
  store.sweep(win, a, 99, 0); assert.equal(store.size, 9, 'nine chunks, a quarter of the frame\'s scale: still all there');
  for (let i = win.i0; i <= win.i1; i++) for (let j = win.j0; j <= win.j1; j++) store.bake(() => {}, a, i, j, 2);
  store.sweep(win, a, 99, 0); assert.equal([...store.map.values()].filter((c) => c.sk !== sk).length, 0, 'the cells that cover them are baked: they go');
  store.release();
});

test('sweep over the cap: what is not on show goes first, then what is hidden; a stand-in on show stays (a hole would open) until a hard limit, and then the one farthest from the middle goes', () => {
  const S = stand(), store = new ChunkCache('test.cap', S.make), a0 = 1.8, a = a0 * 1.1, sk = scaleKey(a);
  const ring = [], shown = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const c = store.bake(() => {}, a0, i, j, 2); (i < 3 && j < 3 ? shown : ring).push(c); }
  const win = cellsFor({ x0: 0, x1: 2.4 * CHUNK_PX / a0, y0: 0, y1: 2.4 * CHUNK_PX / a0 }, a);
  store.begin(); for (const c of shown) store.use(c); // what the frame drew
  const n0 = store.size;
  store.sweep(win, a, n0 - 3, 0, n0 + 20); assert.equal(store.size, n0 - 3, 'over the cap by three: three went');
  assert.equal(shown.filter((c) => store.map.has(chunkKey(c.sk, c.i, c.j))).length, 9, 'none of the nine that were on show');
  assert.equal(ring.filter((c) => store.map.has(chunkKey(c.sk, c.i, c.j))).length, 7 - 3, 'the ones that were not on show went first, the oldest first');
  store.sweep(win, a, 5, 0, n0 + 20); assert.equal(shown.filter((c) => store.map.has(chunkKey(c.sk, c.i, c.j))).length, 9, 'at the cap and under the hard limit: the ones on show are never dropped');
  const keep = store.size; store.sweep(win, a, 5, 0, keep - 2);
  const gone = shown.filter((c) => !store.map.has(chunkKey(c.sk, c.i, c.j))), cx = (win.i0 + win.i1 + 1) / 2 * win.s, cy = (win.j0 + win.j1 + 1) / 2 * win.s, d = (c) => { const s0 = CHUNK_PX / c.a; return Math.hypot((c.i + 0.5) * s0 - cx, (c.j + 0.5) * s0 - cy); };
  assert.equal(gone.length, 2, 'beyond the hard limit two went'); const stay = shown.filter((c) => store.map.has(chunkKey(c.sk, c.i, c.j)));
  assert.ok(Math.min(...gone.map(d)) >= Math.max(...stay.map(d)) - 1e-9, 'the farthest from the middle of the window');
  store.release();
});

test('bareOf: the part of an exact cell that no stand-in covers, in world pixels, clipped to the window', () => {
  const S = stand(), store = new ChunkCache('test.bare', S.make), a0 = 1, a = 1.25, sk = scaleKey(a), s = CHUNK_PX / a, s0 = CHUNK_PX / a0;
  store.bake(() => {}, a0, 0, 0, 2); store.standIns(a, sk, 0);
  const out = []; store.bareOf(0, 0, s, out, null); assert.equal(area(out), 0, 'cell (0, 0) lies wholly inside the old chunk (the old one is ' + s0 + ' wide, the cell ' + s.toFixed(1) + ')');
  out.length = 0; store.bareOf(1, 0, s, out, null); const right = (2 * s) - s0; assert.ok(Math.abs(area(out) - right * s) < 1e-3, 'cell (1, 0) sticks out of it by ' + right.toFixed(2) + ' world px: the bare part is that strip, ' + area(out));
  out.length = 0; store.bareOf(5, 5, s, out, null); assert.ok(Math.abs(area(out) - s * s) < 1e-3, 'a cell nothing stands under is bare whole');
  out.length = 0; store.bareOf(5, 5, s, out, { x0: 5 * s, x1: 5 * s + 10, y0: 5 * s, y1: 5 * s + 20 }); assert.ok(Math.abs(area(out) - 200) < 1e-3, 'and only the part in the window counts');
  store.release();
});

test('soften: a bare piece takes the nearest chunk of ANY scale that has its area, clipped to the piece, and what no chunk has stays bare', () => {
  const S = stand(), store = new ChunkCache('test.soft', S.make), a = 3, sk = scaleKey(a);
  const far = store.bake(() => {}, 0.5, 0, 0, 2), near = store.bake(() => {}, 0.9, 0, 0, 2); // 3.3 and 6 times magnified: both outside the ratio window; the 0.9 is nearer
  store.standIns(a, sk, 0); assert.equal(store.list.length, 0, 'neither is a stand-in');
  const r = recCtx(), parts = [10, 10, 60, 40, 900, 900, 940, 940]; // the first piece lies under both chunks (0.9: 0 to 426 world px; 0.5: 0 to 768); the second under neither
  const n = store.soften(r.ctx, parts, a, 0, 0); assert.equal(n, 1, 'one draw'); const dI = r.log.calls.filter((c) => c[0] === 'drawImage'); assert.equal(dI.length, 1);
  assert.strictEqual(dI[0][1], near.img, 'the nearer scale'); assert.deepEqual(dI[0].slice(2).map((v) => Math.round(v)), [Math.round(-a / 0.9 * 0.5), Math.round(-a / 0.9 * 0.5), Math.round(CHUNK_PX * a / 0.9 + a / 0.9), Math.round(CHUNK_PX * a / 0.9 + a / 0.9)], 'scaled to this frame (a pixel larger than its cell, as a stand-in is)');
  assert.deepEqual(parts, [900, 900, 940, 940], 'the piece under no chunk is still bare'); assert.ok(r.log.clips >= 1, 'clipped to the piece');
  assert.ok(far && near);
  store.release();
});
test('standIns lists the chunks outside the ratio window apart, nearest scale first; they are a last resort and are never in the list that is drawn', () => {
  const S = stand(), store = new ChunkCache('test.soft2', S.make), a = 2, sk = scaleKey(a);
  store.bake(() => {}, 0.4, 0, 0, 2); store.bake(() => {}, 0.9, 0, 0, 2); const win = store.bake(() => {}, 1.9, 0, 0, 2);
  const L = store.standIns(a, sk, 0); assert.deepEqual(L.map((c) => c.a), [1.9], 'only the 1.9 is a stand-in for 2 (0.9 is 2.2 times: out; 0.4: out)');
  assert.deepEqual(store.soft.map((c) => c.a), [0.9, 0.4], 'the others, nearest first'); assert.ok(win);
  store.release();
});
test('the cap of the ground store is unchanged at rest (what the window touches, a third more, and two)', () => { assert.equal(chunkCap(1024, 768, 2), Math.ceil(35 * 1.35) + 2); });
