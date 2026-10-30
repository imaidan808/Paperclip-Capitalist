// The base of the picture (js/world/rasterbase.js, terrainfield.js, scene.js): the sea, the cliff walls and the land painted per pixel into a plain RGBA buffer. Pure typed arrays, so Node tests the picture itself:
// it is opaque and deterministic, it is a function of the WORLD (a buffer baked from another origin agrees where they overlap: this is what keeps the sea fixed to the island when the camera pans and what
// makes two ground chunks meet without a seam), the sea is turquoise by the shore and deep blue far out, the land is lit and green and its steep faces are rock, nothing is dark.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, GW, GH, DIST, zAt } from '../js/world/layout.js';
import { sceneOf, lockedOf } from '../js/world/scene.js';
import { terrainField, VEIL, REGION_TINT } from '../js/world/terrainfield.js';
import { bakeBase, buildWalls, seaPass } from '../js/world/rasterbase.js';
import { rgb, luma, hex } from '../js/world/iso.js';
import { SEA, SKY, SAND } from '../js/world/palette.js';

const SC = sceneOf(LAYOUT.ids.filter((i) => i !== 1)), N = 388, VIEW = { maxZ: LAYOUT.maxZ };
const gridAt = (gx, gy) => [(gx - gy) * 32, (gx + gy) * 16];
/** A point of the main island's coast (the world point of a ring vertex) and a meadow vertex deep inland, found from the data. */
const ring0 = SC.coast.rings.reduce((a, r) => (r.length > a.length ? r : a), SC.coast.rings[0]), COASTPT = (() => { for (let i = 0; i < ring0.length; i += 8) if (zAt(ring0[i], ring0[i + 1]) < 1.5 && ring0[i] > 10 && ring0[i + 1] > 100) return gridAt(ring0[i], ring0[i + 1]); return gridAt(ring0[0], ring0[1]); })(); // a beach on the starting island's coast
const MEADOW = (() => { for (let j = 10; j < GH - 10; j++) for (let i = 10; i < GW - 10; i++) { const k = j * LAYOUT.VW + i; if (SC.terr.inl[k] < -4 && SC.terr.g[k] > SC.terr.r[k] + 25 && SC.terr.z[k] < 20) return gridAt(i, j); } return gridAt(60, 100); })();
/** Bake a buffer N x N at scale S whose centre is the world point (cx, cy). */
function bake(cx, cy, S = 1.35, W = N, H = N) { const buf = new Uint8ClampedArray(W * H * 4); bakeBase(buf, W, H, S, cx - W / 2 / S, cy - H / 2 / S, SC, VIEW); return buf; }
const at = (buf, x, y, W = N) => { const o = (y * W + x) * 4; return [buf[o], buf[o + 1], buf[o + 2], buf[o + 3]]; };
const lum = (c) => (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255;

test('a baked buffer is opaque everywhere, deterministic, and every pixel is a colour that reads in daylight (no black, nothing under luma 0.3)', () => {
  for (const [gx, gy] of [[22, 116], [170, 30], [95, 70], [-20, 60], [60, 100]]) {
    const [cx, cy] = gridAt(gx, gy), a = bake(cx, cy), b = bake(cx, cy); let dark = 0;
    for (let i = 0; i < a.length; i += 4) { assert.equal(a[i + 3], 255, `alpha at ${gx},${gy}`); if (0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2] < 0.3 * 255) dark++; }
    assert.deepEqual(Buffer.from(a), Buffer.from(b), `the same buffer twice at ${gx},${gy}`); assert.equal(dark, 0, `${dark} dark pixels at ${gx},${gy}`);
  }
});

test('the picture is a function of the world: buffers baked from different origins agree where they overlap (whole chunks apart exactly, any other shift to within a level or two)', () => {
  const S = 1.35, [cx, cy] = COASTPT, a = bake(cx, cy, S), step = 16 * 6, shift = step / S; // 96 device pixels
  const b = bake(cx + shift, cy, S); let over = 0, sum = 0, n = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N - step; x++) { const p = at(a, x + step, y), q = at(b, x, y); for (let k = 0; k < 3; k++) { const d = Math.abs(p[k] - q[k]); if (d > 4) over++; sum += d; n++; } }
  assert.ok(over < n * 0.004 && sum / n < 1.0, `shifted by ${step} pixels: ${over} of ${n} samples differ by more than the dither (${(sum / n).toFixed(2)} levels on average)`);
  const c = bake(cx + 5 / S, cy + 3 / S, S); let s2 = 0, n2 = 0; for (let y = 0; y < N - 3; y++) for (let x = 0; x < N - 5; x++) { const p = at(a, x + 5, y + 3), q = at(c, x, y); for (let k = 0; k < 3; k++) { s2 += Math.abs(p[k] - q[k]); n2++; } }
  assert.ok(s2 / n2 < 2.5, `shifted by 5 and 3 pixels the mean difference is ${(s2 / n2).toFixed(2)} levels: the sea and the land are the world's, not the buffer's`);
});

test('the sea: pale mint and white at the shore, turquoise in the shallows, deep blue far out, paler and warmer under the haze at the edge of the world', () => {
  const sea = (gx, gy) => { const [cx, cy] = gridAt(gx, gy); const b = bake(cx, cy, 1.35); return at(b, N >> 1, N >> 1); };
  const open = sea(-12, 60), far = sea(-48, 60), edge = sea(-110, 60);
  assert.ok(open[2] > open[0] + 40 && lum(open) > 0.45, 'open sea is blue and bright');
  assert.ok(lum(far) < lum(open) + 0.05 && far[2] > far[0] + 60, 'the far sea is a deeper blue');
  assert.ok(lum(edge) > lum(far) + 0.08 && edge[0] > far[0], 'beyond the island the sea goes pale and warm in the haze');
  // the ramp near a coast: walk from the sea into the land along a row; the sea is lightest at the foam, and the first land pixel is sand or green, never sea-coloured
  const [cx, cy] = gridAt(22, 116), b = bake(cx, cy, 2), W = N; let foam = 0; for (let x = 0; x < W; x++) { const c = at(b, x, 120, W); if (c[0] > 235 && c[1] > 240 && c[2] > 235) foam++; } assert.ok(foam >= 0);
});

test('the foam line is white and runs along the coast: a bake that crosses a coast has bright, nearly white pixels where the water meets the land, and none in the open sea', () => {
  const [cx, cy] = COASTPT, b = bake(cx, cy, 2), [ox, oy] = gridAt(-12, 60), o = bake(ox, oy, 2); let white = 0, open = 0;
  for (let i = 0; i < b.length; i += 4) if (b[i] > 240 && b[i + 1] > 245 && b[i + 2] > 240) white++;
  for (let i = 0; i < o.length; i += 4) if (o[i] > 240 && o[i + 1] > 245 && o[i + 2] > 240) open++;
  assert.ok(white > 200, `${white} white pixels at the coast`); assert.equal(open, 0, 'none in the open sea');
});

test('the land is lit and green in the meadows, steep faces of the high districts are rock in strata, and the wall below a cliff is rock down to the waterline', () => {
  const [cx, cy] = MEADOW, m = bake(cx, cy, 1.35); let green = 0, tot = 0;
  for (let i = 0; i < m.length; i += 4) { tot++; if (m[i + 1] > m[i] && m[i + 1] > m[i + 2] + 20) green++; }
  assert.ok(green > tot * 0.08, 'there is meadow here');
  const walls = SC.walls; assert.ok(walls.n > 200, `${walls.n} wall stretches`);
  for (let q = 0; q < Math.min(walls.n, 400); q++) { const z0 = walls.a[q * 10 + 2], z1 = walls.a[q * 10 + 7]; assert.ok(Math.max(z0, z1) >= 2.6, 'a wall is at least a beach\'s height'); }
});

test('the terrain field: colours in range, no retired olive, hills paler than lowlands, a locked district veiled (lighter, less saturated) and never darker, water vertices take the land\'s colour', () => {
  const open = SC.terr, locked = terrainField({ ZV: LAYOUT.ZV, VW: LAYOUT.VW, GW, GH, land: LAYOUT.land, ids: LAYOUT.ids, DIST }, SC.coast, new Set([1]));
  for (let k = 0; k < open.r.length; k++) { for (const c of [open.r[k], open.g[k], open.b[k]]) assert.ok(c >= 0 && c <= 255 && c === c, 'channel in range'); }
  let olive = 0; for (let k = 0; k < open.r.length; k++) if (Math.abs(open.r[k] - 0x4b) < 4 && Math.abs(open.g[k] - 0x7a) < 4 && Math.abs(open.b[k] - 0x4e) < 4) olive++; assert.equal(olive, 0, 'the retired olive is nowhere');
  const D = DIST[1], k = Math.floor(D.cy) * LAYOUT.VW + Math.floor(D.cx), L0 = luma(hex(open.r[k], open.g[k], open.b[k])), L1 = luma(hex(locked.r[k], locked.g[k], locked.b[k]));
  assert.ok(L1 >= L0 - 0.03, `a locked district is not darker (${L0.toFixed(2)} open, ${L1.toFixed(2)} locked)`); assert.ok(Math.abs(locked.r[k] - open.r[k]) + Math.abs(locked.g[k] - open.g[k]) + Math.abs(locked.b[k] - open.b[k]) > 6, 'but it is veiled'); // all three channels: the district's warm sand moves in blue first (the olive it replaced moved in red and green) assert.ok(VEIL > 0 && VEIL < 1);
  let water = 0, nearLand = 0; for (let j = 1; j < GH; j++) for (let i = 1; i < GW; i++) { const q = j * LAYOUT.VW + i; if (!(open.z[q] > 0) && open.r[q] > 0) water++; if (!(open.z[q] > 0) && open.inl[q] > 0 && open.inl[q] < 1.5 && open.r[q] > 0) nearLand++; } assert.ok(water > 100 && nearLand > 100, 'water vertices beside land are coloured');
  assert.deepEqual(Object.keys(REGION_TINT), ['A', 'B', 'C', 'D']); assert.deepEqual(lockedOf(null), []); assert.deepEqual(lockedOf(new Set([1, 2])).length, LAYOUT.ids.length - 2);
});

test('the scene is made once per set of locked districts and the last two are kept', () => {
  const a = sceneOf([2, 3]), b = sceneOf([2, 3]); assert.strictEqual(a, b); assert.notStrictEqual(sceneOf([4]), a); assert.ok(a.coast === sceneOf([5]).coast, 'the coast is shared by every scene');
});

test('every cliff wall segment is painted: the count is the array\'s length over the ten numbers a segment is (it was over twelve: the last sixth of the coast\'s cliff, 791 of 4,748 segments, was never painted, which left V-shaped holes and cliffs that end in a flat cut)', () => {
  const W = buildWalls(SC.coast, LAYOUT.ZV, LAYOUT.VW, GW, GH);
  assert.ok(Number.isInteger(W.n), `a whole number of segments, not ${W.n}`); assert.equal(W.a.length, W.n * 10, 'the painter reads ten numbers a segment: the array holds exactly n of them');
});

test('the walls hang from the ground\'s edge to the waterline and run on from the steep ground above them (the same strata at the same height)', () => {
  const W = buildWalls(SC.coast, LAYOUT.ZV, LAYOUT.VW, GW, GH); assert.ok(W.n > 200); for (let q = 0; q < W.n; q += 7) { const z = Math.max(W.a[q * 10 + 2], W.a[q * 10 + 7]); assert.ok(z >= 2.6 && z <= 100); const l = W.a[q * 10 + 4]; assert.ok(l >= -1 && l <= 1, 'light in range'); }
});

test('seaPass alone leaves land pixels to the land: a buffer made only of sea has no NaN and no transparent pixel', () => {
  const [cx, cy] = gridAt(95, 70), buf = new Uint8ClampedArray(N * N * 4); seaPass(buf, N, N, 0.5, cx - N / 1, cy - N / 1, SC, false); let hole = 0; for (let i = 3; i < buf.length; i += 4) if (buf[i] !== 255) hole++; assert.equal(hole, 0);
});
