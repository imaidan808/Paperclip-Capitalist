// The base of the picture's water and ground as pure functions (js/world/rasterbase.js, terrainfield.js, groundart.js, decalart.js): the swell (the sea's large soft wave shapes), the bent depth ramp, the shelf of the
// shallows, the caustic dapples, the world-space tone of the ground (in place of a pixel grain), the periodic mottle tile of the blocks, the lifted district ground, the warm veil and the buoy. Each of the rules the
// water pass of the second art round fixed (docs/RENDER_PLAN.md): no hairline contours, no squiggles, no block grain, no seam along a lattice row, a coast that is not a ruler.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx } from './helpers/recctx.mjs';
import { LAYOUT } from '../js/world/layout.js';
import { sceneOf } from '../js/world/scene.js';
import { bakeBase, swellAt, swellScales, bentDepth, shelfAt, causticAt, toneAt, landPass } from '../js/world/rasterbase.js';
import { veilColour, liftGround } from '../js/world/terrainfield.js';
import { mottleTile, buoy } from '../js/world/groundart.js';
import { rgb, luma } from '../js/world/iso.js';
import { TOY, PAVE } from '../js/world/palette.js';

test('swellAt: a signed number in -1..1 that is the same every time and everywhere, zero when both scales are off, with crests and troughs both present', () => {
  assert.equal(swellAt(31.2, 77.7, 9, 1, 0.3), swellAt(31.2, 77.7, 9, 1, 0.3)); assert.equal(swellAt(31.2, 77.7, 9, 0, 0), 0);
  let pos = 0, neg = 0, zero = 0, n = 0; for (let i = 0; i < 6000; i++) { const v = swellAt(i * 0.173, i * 0.311 + 40, 12 + (i % 20), 1, 0.34); assert.ok(v >= -1 && v <= 1); n++; if (v > 0.3) pos++; else if (v < -0.3) neg++; else if (Math.abs(v) < 0.02) zero++; }
  assert.ok(pos > n * 0.02 && neg > n * 0.02, `${pos} crests and ${neg} troughs of ${n}`); assert.ok(zero > n * 0.3, 'most of the sea is smooth: the waves are patches, not a texture');
});
test('swellAt is smooth: two points a tenth of a tile apart differ by little (no hairline, no squiggle: nothing in it is thinner than a few pixels at a scale where it is drawn)', () => {
  let worst = 0; for (let i = 0; i < 4000; i++) { const gx = 20 + i * 0.0731, gy = 60 + i * 0.0412, a = swellAt(gx, gy, 10, 1, 0.34), b = swellAt(gx + 0.1, gy + 0.05, 10, 1, 0.34); worst = Math.max(worst, Math.abs(a - b)); }
  assert.ok(worst < 0.95, `the sharpest step over a tenth of a tile is ${worst.toFixed(2)}: an edge, never a jump`);
});
test('swellScales: the fine bands come in over S 0.35 to 0.8 and the coarse ones carry the far zoom', () => {
  assert.equal(swellScales(0.2).fine, 0); assert.ok(swellScales(0.2).coarse > 0.9); assert.equal(swellScales(1).fine, 1); assert.ok(Math.abs(swellScales(1).coarse - 0.34) < 1e-9);
  let prev = -1; for (let S = 0.2; S < 1.2; S += 0.05) { const f = swellScales(S).fine; assert.ok(f >= prev); prev = f; }
});
test('bentDepth is the exact distance at the coast (the foam stays on the line), bends the open sea by less than a quarter of its depth and a bounded amount, and is the world\'s', () => {
  assert.equal(bentDepth(10, 10, 0.5), 0.5); assert.equal(bentDepth(10, 10, 0.9), 0.9);
  let worst = 0; for (let i = 0; i < 3000; i++) { const d = 1 + (i % 50), b = bentDepth(i * 0.37, i * 0.21, d); worst = Math.max(worst, Math.abs(b - d) / d); assert.ok(Math.abs(b - d) <= 1.21 + 1e-9, 'never more than 1.2 tiles'); } assert.ok(worst < 1.0);
  let moved = 0; for (let i = 0; i < 200; i++) if (Math.abs(bentDepth(i * 0.9, i * 0.4, 8) - 8) > 0.1) moved++; assert.ok(moved > 100, 'it really bends the contours');
});
test('shelfAt: the pale shelf is whole at the coast, gone two tiles out at a working scale and reaches further at the far zoom, so the island has a rim', () => {
  assert.equal(shelfAt(0.2, 0.5, 2), 1); assert.equal(shelfAt(3, 0.5, 2), 0); assert.ok(shelfAt(2.6, 0.5, 0.25) > 0.5, 'at the far zoom it is still there'); assert.ok(shelfAt(2.6, 0.5, 2) < 0.1);
  for (let d = 0; d < 6; d += 0.1) assert.ok(shelfAt(d, 0.3, 1) >= shelfAt(d + 0.1, 0.3, 1) - 1e-9, 'it only falls with the distance');
});
test('causticAt: dapples of light between a third of a tile and five tiles out, a few of them, zero on the foam and in the deep, and never more than 0.3', () => {
  assert.equal(causticAt(10, 10, 0.1), 0); assert.equal(causticAt(10, 10, 9), 0); let lit = 0, n = 0, worst = 0; for (let i = 0; i < 5000; i++) { const c = causticAt(i * 0.11, i * 0.07, 2.5); n++; if (c > 0.02) lit++; worst = Math.max(worst, c); }
  assert.ok(worst <= 0.3 + 1e-9, `${worst}`); assert.ok(lit > n * 0.03 && lit < n * 0.6, `${lit} of ${n} lit`);
});
test('toneAt: the ground\'s tone is a smooth function of the world (no pixel grain: a step of a hundredth of a tile changes it by under a thousandth), within +-0.1, and the close-zoom mottle only adds', () => {
  let worst = 0, big = 0; for (let i = 0; i < 4000; i++) { const gx = 12 + i * 0.0137, gy = 90 + i * 0.0091, a = toneAt(gx, gy, true, 1), b = toneAt(gx + 0.01, gy, true, 1); worst = Math.max(worst, Math.abs(a - b)); big = Math.max(big, Math.abs(a)); }
  assert.ok(worst < 0.004, `the sharpest step over a hundredth of a tile is ${worst.toFixed(4)}`); assert.ok(big <= 0.1, `${big}`); assert.equal(toneAt(5, 5, false, 0), toneAt(5, 5, false, 0));
  let d0 = 0; for (let i = 0; i < 500; i++) d0 = Math.max(d0, Math.abs(toneAt(i * 0.3, i * 0.2, false, 1) - toneAt(i * 0.3, i * 0.2, false, 0))); assert.ok(d0 > 0.005 && d0 < 0.03, 'the fine mottle is a few percent');
});
test('the ground\'s grain is not locked to the pixel: a buffer baked at 1.2 and one at 4.8 over the same ground show the same tone (a fixed 2 to 3 pixel block would be 4 times as large in world units at the first)', () => {
  const SC = sceneOf(LAYOUT.ids.filter((i) => i !== 1)), V = { maxZ: LAYOUT.maxZ }, cx = (60 - 100) * 32, cy = (60 + 100) * 16; // a meadow
  const mean = (S) => { const N = 96, buf = new Uint8ClampedArray(N * N * 4); landPass(buf, N, N, S, cx - N / 2 / S, cy - N / 2 / S, SC, V); let m = 0; for (let i = 0; i < N * N; i++) m += buf[i * 4 + 1]; return m / (N * N); };
  const a = mean(1.2), b = mean(4.8); assert.ok(Math.abs(a - b) < 18, `meadow green ${a.toFixed(1)} against ${b.toFixed(1)}`);
});
test('a baked sea chunk has no seam along a lattice row or column (a rectangle of another tone)', () => {
  const SC = sceneOf(LAYOUT.ids.filter((i) => i !== 1)), V = { maxZ: LAYOUT.maxZ }, N = 388;
  for (const S of [1.35, 2, 4.8]) {
    const buf = new Uint8ClampedArray(N * N * 4), wx = (86 - 70) * 32, wy = (86 + 70) * 16; bakeBase(buf, N, N, S, wx - N / 2 / S, wy - N / 2 / S, SC, V); // the middle of the lake: open water, no coast in the window
    const lum = (x, y) => { const o = (y * N + x) * 4; return 0.3 * buf[o] + 0.59 * buf[o + 1] + 0.11 * buf[o + 2]; };
    let worstRow = 0, worstCol = 0; for (let y = 1; y < N; y++) { let s = 0; for (let x = 0; x < N; x++) s += Math.abs(lum(x, y) - lum(x, y - 1)); worstRow = Math.max(worstRow, s / N); }
    for (let x = 1; x < N; x++) { let s = 0; for (let y = 0; y < N; y++) s += Math.abs(lum(x, y) - lum(x - 1, y)); worstCol = Math.max(worstCol, s / N); }
    assert.ok(worstRow < 2.6 && worstCol < 2.6, `at ${S}: the biggest mean step between rows is ${worstRow.toFixed(2)}, between columns ${worstCol.toFixed(2)}`);
  }
});
test('the shallows at the close zoom have no seam either: below the coast of the south bay at 4.8 pixels a world pixel (where the caustics are on) the rows are one picture (a rectangle one lattice row tall and 130 pixels wide once showed where the caustics, then lines, stopped on a node row; as dapples they are nearly invisible there, so this holds the rows to one picture in general)', () => {
  const SC = sceneOf(LAYOUT.ids.filter((i) => i !== 1)), V = { maxZ: LAYOUT.maxZ }, N = 388, S = 4.8, buf = new Uint8ClampedArray(N * N * 4); bakeBase(buf, N, N, S, -3565.5 - 100 / S, 2444.9 - 150 / S, SC, V);
  const lum = (x, y) => { const o = (y * N + x) * 4; return 0.3 * buf[o] + 0.59 * buf[o + 1] + 0.11 * buf[o + 2]; };
  const steps = []; for (let y = 130; y < N; y++) { let s = 0; for (let x = 0; x < N; x++) s += Math.abs(lum(x, y) - lum(x, y - 1)); steps.push(s / N); }
  const sorted = [...steps].sort((a, b) => a - b), med = sorted[sorted.length >> 1], worst = sorted[sorted.length - 1];
  assert.ok(worst < med * 1.6 + 0.2, `the biggest mean step between rows is ${worst.toFixed(2)} against a median of ${med.toFixed(2)}: one row stands out`);
});
test('the sea has no hairline: in open water the bake has no run of pixels thinner than four that differs from both neighbours by more than a tenth (the old bands were two or three pixels of 16% crest)', () => {
  const SC = sceneOf(LAYOUT.ids.filter((i) => i !== 1)), V = { maxZ: LAYOUT.maxZ }, N = 300, S = 2, buf = new Uint8ClampedArray(N * N * 4), cx = (80 - 76) * 32, cy = (80 + 76) * 16; bakeBase(buf, N, N, S, cx - N / 2 / S, cy - N / 2 / S, SC, V);
  const lum = (x, y) => { const o = (y * N + x) * 4; return 0.3 * buf[o] + 0.59 * buf[o + 1] + 0.11 * buf[o + 2]; };
  let thin = 0, rows = 0; for (let x = 60; x < N - 60; x += 7) for (let y = 60; y < N - 62; y++) { rows++; const m = lum(x, y); if (m - lum(x, y - 2) > 6 && m - lum(x, y + 2) > 6) thin++; }
  assert.ok(thin < rows * 0.004, `${thin} thin ridges of ${rows} columns`);
});

test('liftGround takes a district\'s ground further from its own grey and a little lighter (the Scrap Yard\'s khaki goes golden), and keeps a grey a grey', () => {
  const sat = (c) => { const q = rgb(c), y = luma(c) * 255; return Math.hypot(q[0] - y, q[1] - y, q[2] - y); };
  for (const c of ['#d4c070', '#a3bbd9', '#f0b6dc', '#9bdc7e']) { const l = liftGround(c); assert.ok(sat(l) > sat(c) * 1.1, `${c} -> ${l}`); assert.ok(luma(l) >= luma(c) - 0.01); }
  const g = rgb(liftGround('#808080')); assert.ok(Math.abs(g[0] - g[2]) < 3, 'a grey stays grey');
});
test('the veil over a locked district is warm, not grey-lavender (CHANGED: it was desaturated by 0.45 and 22% towards a cold lilac-white): a grey under it leans warm, and a green keeps most of its chroma', () => {
  const o = new Float32Array(3), g = veilColour(o, Float32Array.from([128, 128, 128]), 1); assert.ok(g[0] >= g[2], `a grey becomes ${[...g].map(Math.round)}: red is not below blue`);
  const green = veilColour(new Float32Array(3), Float32Array.from([124, 198, 90]), 0.6); assert.ok(green[1] - green[2] > 40, 'the meadow under cloud is still green'); const lit = (v) => 0.3 * v[0] + 0.59 * v[1] + 0.11 * v[2]; assert.ok(lit(green) >= lit([124, 198, 90]) - 6, 'never darker');
});
test('the mottle tile wraps without a seam (its first and last rows and columns are neighbours), stays in 0..1 and is a spread of soft patches, not a speckle (adjacent pixels are close)', () => {
  const m = mottleTile(128); let lo = 9, hi = -9, step = 0, wrap = 0; for (let i = 0; i < m.length; i++) { lo = Math.min(lo, m[i]); hi = Math.max(hi, m[i]); }
  for (let y = 0; y < 128; y++) for (let x = 0; x < 127; x++) step = Math.max(step, Math.abs(m[y * 128 + x] - m[y * 128 + x + 1])); for (let y = 0; y < 128; y++) wrap = Math.max(wrap, Math.abs(m[y * 128 + 127] - m[y * 128]));
  assert.ok(lo >= 0 && hi <= 1 && hi - lo > 0.3); assert.ok(step < 0.12, `adjacent pixels differ by at most ${step.toFixed(3)}`); assert.ok(wrap < 0.12, `the seam is ${wrap.toFixed(3)}`);
});
test('a buoy is a thing: a shadow, a ring of foam, a body, a white band and a lamp, all filled (nothing stroked), balanced, about 7 x 11 world pixels, and it is drawn at the alpha asked', () => {
  const r = recCtx(); buoy(r.ctx, 100, 100, TOY.red, 0.7); assert.equal(r.log.strokes.length, 0); assert.ok(r.log.fills.length >= 5, `${r.log.fills.length} fills`); assert.equal(r.state.globalAlpha, 1);
  const pts = r.log.calls.filter((c) => c[0] === 'moveTo' || c[0] === 'lineTo' || c[0] === 'arc').map((c) => [c[1], c[2]]); let minY = 1e9, maxY = -1e9; for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); } assert.ok(maxY - minY > 6 && maxY - minY < 14, `${(maxY - minY).toFixed(1)} high`);
  assert.ok(r.log.fills.some((f) => f.style === TOY.red) && r.log.fills.some((f) => f.style === PAVE.cream || f.style === '#fffaf0'), 'its colour and its white band');
  assert.ok(r.log.fills.some((f) => Math.abs(f.alpha - 0.7) < 1e-9), 'alpha asked');
});
