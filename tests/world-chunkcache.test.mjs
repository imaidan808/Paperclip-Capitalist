// T5 raster quality: the ground chunk store (js/world/chunkcache.js) and the pixel policy arithmetic of js/world/chunks.js: one exact scale, whole-pixel translation, the cells of a scale's grid, stand-ins within a ratio
// window, the sweep, the cap, sealing at bake time, supersampling and the ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK_PX, CHUNK_FULL, BLEED, SCALE_Q, renderScale, scaleKey, snapTranslation, superSample, cellsFor, chunkKey, staleRatio, chunkCap, chunksTouched } from '../js/world/chunks.js';
import { ChunkCache } from '../js/world/chunkcache.js';
import { ledger } from '../js/world/gfx.js';

/** A surface factory the store can bake into: records the transform the layers were drawn under, can answer pixels with a crack, and hands out bitmaps. */
function stand(opt = {}) {
  const made = []; const bm = () => ({ close() { this.closed = true; } });
  const make = (w, h) => {
    const sets = [], calls = []; let data = null;
    const g = { setTransform: (...a) => sets.push(a), clearRect() {}, drawImage: (...a) => calls.push(['drawImage', ...a]), imageSmoothingEnabled: true, imageSmoothingQuality: 'low',
      getImageData: opt.pixels ? (x, y, ww, hh) => { data = new Uint8ClampedArray(ww * hh * 4); if (!opt.empty) for (let i = 0; i < ww * hh; i++) data[i * 4 + 3] = 255; if (opt.crack && !opt.empty) for (let y2 = 0; y2 < hh; y2++) data[(y2 * ww + 100) * 4 + 3] = 191; return { data, width: ww, height: hh }; } : undefined,
      putImageData: opt.pixels ? () => { g.put = (g.put || 0) + 1; g.putData = data; } : undefined };
    const c = { width: w, height: h, transferToImageBitmap: opt.bitmap === false ? undefined : () => bm() }, f = { c, g, sets, calls }; made.push(f); return f;
  };
  return { make, made };
}

test('renderScale and scaleKey: the scale is dpr x zoom to 1e-5, and equal scales are equal keys', () => {
  assert.equal(SCALE_Q, 1e5); assert.equal(renderScale(0.9, 2), 1.8); assert.equal(renderScale(0.12879, 2), 0.25758); assert.equal(scaleKey(renderScale(1.2345678, 1.5)), Math.round(1.2345678 * 1.5 * 1e5));
  assert.equal(renderScale(0.9, 2) === renderScale(0.9 + 1e-9, 2), true, 'a hair of zoom is the same scale: one cache key, no rebuild');
  assert.notEqual(scaleKey(renderScale(0.9, 2)), scaleKey(renderScale(0.9005, 2)));
});

test('snapTranslation rounds to whole device pixels and a pan by whole pixels moves it by exactly that many', () => {
  const out = [0, 0]; const a = renderScale(0.9, 2);
  for (const [W, H, x, y] of [[1440, 900, 123.456, -77.7], [390, 844, 5000.25, 2800.5], [768, 1024, -3644.1, 2213.9]]) {
    snapTranslation(W, H, 2, x, y, a, out); assert.ok(Number.isInteger(out[0]) && Number.isInteger(out[1]), 'whole pixels');
    assert.ok(Math.abs(out[0] - (2 * W / 2 - x * a)) <= 0.5 + 1e-9);
    const e0 = out[0]; snapTranslation(W, H, 2, x - 37 / a, y, a, out); assert.equal(out[0] - e0, 37, 'a pan of 37 device pixels is 37');
  }
});

test('cellsFor: the cells of the scale\'s grid a world rectangle touches, each 384 device pixels, tiling with no gap or overlap', () => {
  const a = 1.8, r = { x0: -500, x1: 700, y0: 1000, y1: 1900 }, c = cellsFor(r, a);
  assert.equal(c.s, CHUNK_PX / a); assert.ok(c.i0 * c.s <= r.x0 && (c.i1 + 1) * c.s >= r.x1 && c.j0 * c.s <= r.y0 && (c.j1 + 1) * c.s >= r.y1); assert.ok((c.i0 + 1) * c.s > r.x0 && c.i1 * c.s < r.x1);
  const n = (c.i1 - c.i0 + 1) * (c.j1 - c.j0 + 1); assert.ok(n <= chunksTouched(1440, 900, 2), 'a 1440 x 900 window at density 2 touches at most ' + chunksTouched(1440, 900, 2) + ' cells; this one ' + n);
  assert.equal(chunkKey(10, 3, 4) !== chunkKey(10, 4, 3), true); assert.equal(chunkKey(10, -5, -9) === chunkKey(10, -5, -9), true);
  const keys = new Set(); for (let i = -100; i < 100; i += 7) for (let j = -100; j < 100; j += 3) keys.add(chunkKey(1234, i, j)); assert.equal(keys.size, 29 * 67, 'keys never collide');
});

test('staleRatio of a coarse chunk (baked while the zoom moves): up to 3.2 times magnified and down to 0.5, and the default window is unchanged', () => {
  assert.ok(staleRatio(1, 3.2, true) > 0 && staleRatio(1, 0.5, true) > 0); assert.equal(staleRatio(1, 3.3, true), 0); assert.equal(staleRatio(1, 0.49, true), 0); assert.equal(staleRatio(1, 2, false), 0);
});

test('staleRatio: a chunk stands in within 1.5 up and 1 / 0.7 down, never more', () => {
  assert.ok(staleRatio(1, 1.5) > 0 && staleRatio(1, 0.7) > 0 && staleRatio(1, 1) === 1); assert.equal(staleRatio(1, 1.51), 0); assert.equal(staleRatio(1, 0.69), 0);
  assert.ok(chunkCap(1440, 900, 2) >= chunksTouched(1440, 900, 2) * 1.35 && chunkCap(1440, 900, 2) <= Math.ceil(chunksTouched(1440, 900, 2) * 1.35) + 2);
});

test('superSample: twice under density 1.5, once from 1.5 up', () => { assert.equal(superSample(1), 2); assert.equal(superSample(1.25), 2); assert.equal(superSample(1.49), 2); assert.equal(superSample(1.5), 1); assert.equal(superSample(2), 1); });

test('bake: the layers are drawn under the chunk\'s own transform for the exact scale with a pixel of bleed, and the view they are given is the cell plus the bleed', () => {
  const S = stand(), store = new ChunkCache('test.chunks', S.make); let seen = null;
  const a = 1.8, c = store.bake((g, view) => { seen = view; }, a, 3, -2, 2);
  assert.ok(c && c.i === 3 && c.j === -2 && c.sk === scaleKey(a)); const sets = S.made[0].sets, tf = sets.find((q) => q[0] === a && q[3] === a);
  assert.ok(tf, 'the scale is the exact render scale'); assert.equal(tf[4], -(3 * CHUNK_PX - BLEED)); assert.equal(tf[5], -(-2 * CHUNK_PX - BLEED), 'the chunk\'s own origin, one pixel of bleed up and left');
  assert.ok(Math.abs(seen.x0 - (3 * CHUNK_PX - BLEED) / a) < 1e-9 && Math.abs(seen.x1 - ((4) * CHUNK_PX + BLEED) / a) < 1e-9 && Math.abs(seen.y1 - ((-1) * CHUNK_PX + BLEED) / a) < 1e-9, 'the view is the cell and its bleed in world pixels');
  assert.equal(store.get(c.sk, 3, -2), c, 'it is in the store'); assert.equal(store.bake(() => { throw new Error('baked twice'); }, a, 3, -2, 2), c, 'a chunk that is there is not baked again');
  assert.equal(ledger.total('test.chunks') >= CHUNK_PX * CHUNK_PX * 4, true); store.release(); assert.equal(ledger.total('test.chunks'), 0, 'release gives it all back');
});

test('bake under density 1.5 draws twice as big and down once; at 2 it draws straight', () => {
  const S = stand(), store = new ChunkCache('test.ss', S.make); store.bake(() => {}, 1.2, 0, 0, 1);
  const work = S.made.find((f) => f.c.width === CHUNK_FULL * 2), fin = S.made.find((f) => f.c.width === CHUNK_FULL);
  assert.ok(work && fin, 'a working surface of 772 and a final one of 386'); assert.ok(work.sets.some((q) => q[0] === 2.4 && q[3] === 2.4), 'drawn at twice the scale'); assert.ok(fin.calls.some((q) => q[0] === 'drawImage' && q[4] === CHUNK_FULL * 2 && q[8] === CHUNK_FULL), 'and drawn down, smoothed');
  assert.equal(fin.g.imageSmoothingEnabled, true);
  const S2 = stand(), s2 = new ChunkCache('test.ss2', S2.make); s2.bake(() => {}, 1.8, 0, 0, 2); assert.equal(S2.made.filter((f) => f.c.width === CHUNK_FULL * 2).length, 0, 'no supersampling surface at density 2'); store.release(); s2.release();
});

test('the baked bitmap is sealed (a crack is closed and the pixels are put back), and is the cell\'s own 384 x 384; an empty cell has no bitmap and is marked', () => {
  const S = stand({ pixels: true, crack: true }), store = new ChunkCache('test.seal', S.make), c = store.bake(() => {}, 1.8, 0, 0, 2);
  const fin = S.made.find((f) => f.c.width === CHUNK_FULL); assert.equal(fin.g.put, 1, 'sealed pixels were put back'); assert.equal(fin.g.putData[(50 * CHUNK_FULL + 100) * 4 + 3], 255, 'the crack column is opaque');
  assert.equal(c.sealed, true); assert.equal(c.empty, false); assert.ok(c.img && S.made.some((f) => f.c.width === CHUNK_PX), 'a 384 x 384 surface made the stamped bitmap'); assert.equal(c.bytes, CHUNK_PX * CHUNK_PX * 4);
  const E = stand({ pixels: true, empty: true }), es = new ChunkCache('test.empty', E.make), ec = es.bake(() => {}, 1.8, 1, 1, 2); assert.equal(ec.empty, true); assert.equal(ec.img, null); assert.equal(ec.bytes, 0, 'open sea costs no memory'); store.release(); es.release();
});

test('without bitmaps to hand over (a stand-in canvas) each chunk keeps a surface of its own and none is shared', () => {
  const S = stand({ pixels: true, bitmap: false }), store = new ChunkCache('test.nobm', S.make), a = store.bake(() => {}, 1.8, 0, 0, 2), b = store.bake(() => {}, 1.8, 1, 0, 2);
  assert.ok(a.img && b.img && a.img !== b.img, 'two chunks, two surfaces'); store.release();
});

test('standIns: the chunks of other scales within the ratio window, furthest first; covered and hidden say what a nearer scale already shows', () => {
  const S = stand(), store = new ChunkCache('test.stale', S.make); const a0 = 1.8;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) store.bake(() => {}, a0, i, j, 2);
  const a1 = a0 * 1.1; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) store.bake(() => {}, a1, i, j, 2);
  const a = a0 * 1.2, sk = scaleKey(a), L = store.standIns(a, sk, 0);
  assert.equal(L.length, 13); assert.equal(L[0].sk, scaleKey(a0), 'the furthest scale is first'); assert.equal(L.at(-1).sk, scaleKey(a1), 'the nearest last (it is painted on top)');
  assert.equal(store.standIns(a0 * 2, scaleKey(a0 * 2), 0).length, 0, 'twice the scale is no stand-in');
  store.standIns(a, sk, 0); const s = CHUNK_PX / a; assert.equal(store.covered(0.5 * (CHUNK_PX / a0), 0.5 * (CHUNK_PX / a0)), true, 'a point inside a cell of the old grid'); assert.equal(store.covered(50 * (CHUNK_PX / a0), 0), false, 'a point far away: nothing stands in there');
  // the old chunk under the middle of the new ones is hidden when the nearer scale covers its whole area
  const big = L[0], hid = store.hidden(big, sk, s); assert.equal(typeof hid, 'boolean');
  const near = store.get(scaleKey(a1), 0, 0); assert.equal(store.hidden(near, sk, s), false, 'the nearest scale is hidden by nothing but exact chunks');
  for (let i = -1; i < 4; i++) for (let j = -1; j < 4; j++) store.bake(() => {}, a, i, j, 2);
  assert.equal(store.hidden(big, sk, s), true, 'with the exact chunks of the same area baked, the old one is wholly hidden');
  assert.equal(store.hidden(near, sk, s), true); const fadingKey = store.get(sk, 0, 0); fadingKey.fadeEnd = 1e12; store.standIns(a, sk, 1000); assert.equal(store.hidden(near, sk, s), false, 'an exact chunk that is still fading in hides nothing'); store.release();
});

test('sweep: a stand-in goes when exact chunks cover it, when the scale is out of its window, or when it is far from the view; the cap drops the least recently used outside the view', () => {
  const S = stand(), store = new ChunkCache('test.sweep', S.make), a0 = 1.8;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) store.bake(() => {}, a0, i, j, 2);
  const a = a0 * 1.05, win = cellsFor({ x0: 0, x1: 3 * CHUNK_PX / a, y0: 0, y1: 3 * CHUNK_PX / a }, a);
  store.sweep(win, a, 99); assert.equal(store.size, 16, 'nothing covers them yet: all stay');
  for (let i = win.i0; i <= win.i1; i++) for (let j = win.j0; j <= win.j1; j++) store.bake(() => {}, a, i, j, 2);
  store.sweep(win, a, 99); assert.ok(store.size < 16 + 9, 'the stand-ins under the exact chunks went: ' + store.size);
  const far = a0 * 3; store.sweep(cellsFor({ x0: 0, x1: 100, y0: 0, y1: 100 }, far), far, 99); assert.equal([...store.map.values()].filter((c) => c.sk === scaleKey(a0)).length, 0, 'out of the ratio window: all gone');
  for (let i = 0; i < 30; i++) store.bake(() => {}, far, i, 0, 2); store.sweep(cellsFor({ x0: 0, x1: 4 * CHUNK_PX / far, y0: 0, y1: CHUNK_PX / far }, far), far, 10); assert.ok(store.size <= 10 && store.size >= 5, 'the cap holds (the visible cells are never dropped): ' + store.size);
  assert.equal(store.get(scaleKey(far), 0, 0) !== undefined, true, 'a visible cell stays'); store.shrink(3, cellsFor({ x0: 0, x1: CHUNK_PX / far, y0: 0, y1: CHUNK_PX / far }, far), far); assert.ok(store.size <= 3 || store.size === 1, 'shrink drops further when memory asks: ' + store.size); store.release();
});

test('setVer: a different picture (a district opened) drops every chunk; the same one keeps them', () => {
  const S = stand(), store = new ChunkCache('test.ver', S.make); store.setVer(7); store.bake(() => {}, 1.8, 0, 0, 2); assert.equal(store.setVer(7), false); assert.equal(store.size, 1); assert.equal(store.setVer(8), true); assert.equal(store.size, 0); assert.equal(ledger.total('test.ver') <= CHUNK_FULL * CHUNK_FULL * 8, true); store.release();
});
