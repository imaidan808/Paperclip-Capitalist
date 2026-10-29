// T5 raster quality: the sealing pass (js/world/seal.js). A crack is a pixel of partial alpha between two opaque regions that share an edge; closing fills it and moves nothing else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { closeAlpha, countCracks, edgeSoftness, sealReport, OPAQUE } from '../js/world/seal.js';

const W = 64, H = 64;
const plane = (fn) => { const d = new Uint8ClampedArray(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b, a] = fn(x, y); const i = (y * W + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; } return d; };
const alphaAt = (d, x, y) => d[(y * W + x) * 4 + 3];

/** Two flat colour regions meeting on a diagonal, drawn the way a canvas draws two anti-aliased polygons: the seam pixels get alpha 0.75 from "source over" of two halves. */
const seamed = (width = 1, a = 191) => plane((x, y) => { const d = x - 32 + (y - 32) * 0.5; if (d >= 0 && d < width) return [90, 140, 60, a]; return [d < 0 ? 200 : 70, d < 0 ? 120 : 160, 50, 255]; });

test('closeAlpha fills a one pixel crack and a two pixel crack; the colour of the seam pixel is kept', () => {
  for (const wd of [1, 2]) {
    const d = seamed(wd), before = countCracks(d, W, H); assert.ok(before > 20, `the fixture has cracks (${wd} px): ${before}`);
    const ch = closeAlpha(d, W, H); assert.ok(ch > 0);
    assert.equal(countCracks(d, W, H), 0, `${wd} px crack closed`);
  }
  const d = seamed(1), i = (32 * W + 32) * 4; const rgb = [d[i], d[i + 1], d[i + 2]]; closeAlpha(d, W, H);
  assert.deepEqual([d[i], d[i + 1], d[i + 2]], rgb, 'a half-covered pixel keeps its blend; only its alpha rises');
});

test('two cracks that cross are both closed, the crossing pixel included', () => {
  const d = plane((x, y) => (x === 32 || y === 40 ? [90, 140, 60, 191] : [200, 120, 50, 255])); assert.ok(countCracks(d, W, H) > 40);
  closeAlpha(d, W, H); assert.equal(countCracks(d, W, H), 0); assert.equal(alphaAt(d, 32, 40), 255, 'the pixel where they cross');
});

test('a crack that has no colour at all (alpha 0) borrows its neighbours\' colour', () => {
  const d = plane((x) => (x === 32 ? [0, 0, 0, 0] : [10, 200, 30, 255]));
  closeAlpha(d, W, H); const i = (20 * W + 32) * 4;
  assert.equal(d[i + 3], 255); assert.deepEqual([d[i], d[i + 1], d[i + 2]], [10, 200, 30]);
});

test('a gap of three pixels is a real feature and stays; so does the coast, a soft tail and a corner of the silhouette', () => {
  const road = plane((x) => (x >= 30 && x < 33 ? [0, 0, 0, 0] : [10, 200, 30, 255])); closeAlpha(road, W, H);
  assert.equal(alphaAt(road, 31, 20), 0, 'the middle of a three pixel gap is untouched');
  const coast = plane((x) => (x < 20 ? [10, 200, 30, 255] : x === 20 ? [10, 200, 30, 140] : [0, 0, 0, 0])), keep = Uint8ClampedArray.from(coast); closeAlpha(coast, W, H);
  assert.deepEqual(Array.from(coast), Array.from(keep), 'a straight coast with its anti-aliased pixel is exactly the same after closing');
  const tail = plane((x) => (x < 20 ? [10, 200, 30, 255] : x < 30 ? [10, 200, 30, Math.round(100 - (x - 20) * 10)] : [0, 0, 0, 0])), tk = Uint8ClampedArray.from(tail); closeAlpha(tail, W, H);
  assert.deepEqual(Array.from(tail), Array.from(tk), 'a soft tail (alpha under the spreading floor) is not grown');
  const disc = plane((x, y) => { const r = Math.hypot(x - 32, y - 32); return r < 14 ? [200, 50, 50, 255] : r < 15 ? [200, 50, 50, Math.round(255 * (15 - r))] : [0, 0, 0, 0]; }), dk = Uint8ClampedArray.from(disc); closeAlpha(disc, W, H);
  const rep = sealReport(dk, disc, W, H); assert.ok(rep.grown <= 6, 'a round silhouette does not grow: ' + rep.grown); assert.ok(rep.raised <= 40, 'and hardly changes: ' + rep.raised);
});

test('closeAlpha never lowers an alpha, leaves the one pixel ring at the bitmap edge alone, and is idempotent', () => {
  const d = seamed(2), before = Uint8ClampedArray.from(d); closeAlpha(d, W, H);
  for (let i = 3; i < d.length; i += 4) assert.ok(d[i] >= before[i]);
  const edge = plane(() => [1, 2, 3, 100]), ek = Uint8ClampedArray.from(edge); closeAlpha(edge, W, H); assert.deepEqual(Array.from(edge), Array.from(ek), 'a uniform faint bitmap is left as it is');
  const once = Uint8ClampedArray.from(d); assert.equal(closeAlpha(d, W, H), 0, 'a second pass finds nothing'); assert.deepEqual(Array.from(d), Array.from(once));
});

test('countCracks does not count the coast or the edge of a bitmap; it counts what has opaque pixels on both sides', () => {
  const coast = plane((x) => (x < 20 ? [10, 200, 30, 255] : x === 20 ? [10, 200, 30, 140] : [0, 0, 0, 0])); assert.equal(countCracks(coast, W, H), 0);
  const hole = plane((x, y) => (x === 32 && y === 32 ? [10, 200, 30, 100] : [10, 200, 30, 255])); assert.equal(countCracks(hole, W, H), 1);
});

test('edgeSoftness: an anti-aliased silhouette scores high, a hard staircase low', () => {
  const soft = plane((x, y) => { const r = Math.hypot(x - 32, y - 32); return [1, 1, 1, Math.max(0, Math.min(255, Math.round(255 * (16 - r))))]; });
  const hard = plane((x, y) => [1, 1, 1, Math.hypot(x - 32, y - 32) < 15.5 ? 255 : 0]);
  assert.ok(edgeSoftness(soft, W, H).share > 0.25, 'soft ' + edgeSoftness(soft, W, H).share); assert.ok(edgeSoftness(hard, W, H).share < 0.05, 'hard ' + edgeSoftness(hard, W, H).share);
});

test('closing a chunk-sized bitmap is cheap enough to run when a chunk is baked', () => {
  const N = 386, d = new Uint8ClampedArray(N * N * 4); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = (y * N + x) * 4; d[i] = x; d[i + 1] = y; d[i + 2] = 5; d[i + 3] = (x + 2 * y) % 41 === 0 ? 190 : 255; }
  const scratch = { a: new Uint8Array(N * N), b: new Uint8Array(N * N) }; closeAlpha(d, N, N, { scratch }); // warm
  const t0 = process.hrtime.bigint(); for (let k = 0; k < 10; k++) closeAlpha(d, N, N, { scratch }); const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 10;
  assert.ok(ms < 6, `a closing of 386 x 386 took ${ms.toFixed(2)} ms`);
  assert.equal(OPAQUE, 250);
});
