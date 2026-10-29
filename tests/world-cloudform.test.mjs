// The cloud bank as it is painted, as geometry (js/world/cloudform.js): the lobes a bank is made of, their strongly varied radii, the windows with rims of their own, where the cloud is thick, where its shadow can fall,
// the sky's small clouds. Pure: no canvas. The plan's rules for the lattice under it (coverage, structure) are tests/world-cloudbank.test.mjs; what the painted bank is held to here is judge round 1's F1 and F2 (a bank
// of stamps of one radius, and a slab that hid the district): the radii are spread, the district shows through windows, and the bank is still ONE connected mass with every window clear.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DIST, LAYOUT } from '../js/world/layout.js';
import { LIFT } from '../js/world/cloudpaint.js';
import { formOf, windowsOf, windowCount, insideOf, coverAt, coverOf, paintedCover, touchOf, touches, lightCover, skyFormOf, castsShadow, FORM, REACH, TOUCH, SHADOW } from '../js/world/cloudform.js';
import { shadowLength } from '../js/world/shadow.js';
import { structure, bankPuffs, puffRadius } from '../js/world/cloudbank.js';
import { bankOf } from '../js/world/cloudpaint.js';

const IDS = LAYOUT.ids;
const stats = (xs) => { const m = xs.reduce((s, v) => s + v, 0) / xs.length; return { mean: m, sd: Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length), min: Math.min(...xs), max: Math.max(...xs) }; };

test('the same district gives the same bank, back to front, and the lattice under it is the plan\'s (cloudbank.js)', () => {
  for (const id of [1, 3, 11]) {
    const D = DIST[id], a = formOf(D, 1), b = formOf(D, 1);
    assert.deepEqual(a.lobes.map((l) => [l.x, l.y, l.r, l.row, l.kind]), b.lobes.map((l) => [l.x, l.y, l.r, l.row, l.kind]), 'deterministic');
    assert.deepEqual(a.puffs.map((p) => [p.x, p.y, p.r]), bankPuffs(D.fp, D.z, 1).map((p) => [p.x, p.y, p.r]), 'the lattice is cloudbank.js\'s, unchanged');
    for (let i = 1; i < a.lobes.length; i++) assert.ok(a.lobes[i - 1].row < a.lobes[i].row || (a.lobes[i - 1].row === a.lobes[i].row && a.lobes[i - 1].y <= a.lobes[i].y), 'back to front, a row at a time, top to bottom');
    assert.strictEqual(bankOf(D, 1), bankOf(D, 1), 'made once and kept');
  }
});

test('F1: the radii are spread, not one size to a tier: the biggest lobe of a bank is at least three times the smallest, the spread of the radii is at least a fifth of their mean, and there are towers, mass and rim lobes', () => {
  for (const id of IDS) {
    const D = DIST[id], f = formOf(D, 1), r = f.lobes.map((l) => l.r), s = stats(r), kinds = [0, 1, 2, 3].map((k) => f.lobes.filter((l) => l.kind === k));
    assert.ok(s.max >= 3 * s.min, `district ${id}: radii ${s.min.toFixed(0)} to ${s.max.toFixed(0)}`); assert.ok(s.sd >= 0.2 * s.mean, `district ${id}: spread ${(s.sd / s.mean).toFixed(2)}`);
    assert.ok(kinds[0].length >= 30 && kinds[1].length >= 4 && kinds[2].length >= 20 && kinds[3].length >= 8, `district ${id}: ${kinds.map((k) => k.length)} lobes of the four kinds`);
    const mass = stats(kinds[0].map((l) => l.r)), tower = stats(kinds[1].map((l) => l.r)), rim = stats(kinds[2].map((l) => l.r));
    assert.ok(tower.mean > 1.25 * mass.mean, `district ${id}: the towers (${tower.mean.toFixed(0)}) are the big lobes of the core (the mass: ${mass.mean.toFixed(0)})`); assert.ok(rim.mean < 0.7 * mass.mean, `district ${id}: the rim lobes (${rim.mean.toFixed(0)}) are small (${mass.mean.toFixed(0)})`);
    // the mass is the lattice with its radius spread by FORM.spread: no lobe of it is smaller than 0.9 of the puff it came from, so what the lattice covered is covered
    const p0 = puffRadius(D.fp); for (const l of kinds[0]) assert.ok(l.r >= FORM.spread[0] * p0 * 0.85 - 1e-9 && l.r <= FORM.spread[1] * p0 * 1.15 + 1e-9, `district ${id}: a mass lobe of ${l.r.toFixed(0)}`);
  }
});

test('F2: the district shows through: two or three windows on the fine bank, the painted bank covers 60 to 90% of the footprint (the lattice under it 96%), each window is clear of every lobe and the gate has the first', () => {
  let sum = 0;
  for (const id of IDS) {
    const D = DIST[id], f = formOf(D, 1), n = f.windows.length, cov = paintedCover(f); sum += cov;
    assert.equal(n, windowCount(1)); assert.ok(n >= 2 && n <= 3, `district ${id}: ${n} windows`); assert.ok(cov >= 0.6 && cov <= 0.9, `district ${id}: the painted bank covers ${(cov * 100).toFixed(0)}%`);
    for (const w of f.windows) {
      assert.ok(w.rx >= 0.1 * ((D.fp[2] + D.fp[3]) * 32) && w.rx <= 0.18 * ((D.fp[2] + D.fp[3]) * 32), `district ${id}: a window ${w.rx.toFixed(0)} wide`);
      for (const l of f.lobes) if (l.kind !== 3) assert.ok(Math.hypot((l.x - w.x) / (FORM.window.hole * w.rx + l.r), (l.y - w.y) / (FORM.window.hole * w.ry + l.r)) >= 1 - 1e-9, `district ${id}: a lobe stands in a window`);
      assert.equal(coverAt(f, w.x, w.y), 0, `district ${id}: the middle of a window is clear`);
    }
    const g = D.gateAt, first = f.windows[0]; if (g) { const gx = (g.x - g.y) * 32, gy = (g.x + g.y) * 16 - D.z, others = f.windows.slice(1); assert.ok(others.every((w) => Math.hypot(w.x - gx, w.y - gy) >= Math.hypot(first.x - gx, first.y - gy) - 1), `district ${id}: the first window is the one by the gate`); }
  }
  assert.ok(sum / IDS.length < 0.85, `on average the painted bank covers ${(100 * sum / IDS.length).toFixed(0)}% of a footprint (the old blanket: 96 to 99%)`);
});

test('windows keep to the interior: never the heart (the padlock floats there on solid cloud), apart from each other, and fewer on the coarser banks', () => {
  for (const id of IDS) {
    const D = DIST[id], f = formOf(D, 1), [gx, gy, w, d] = D.fp, cx = (gx + w / 2 - (gy + d / 2)) * 32, cy = (gx + w / 2 + gy + d / 2) * 16 - D.z;
    for (const win of f.windows) assert.ok(Math.hypot(win.x - cx, (win.y - cy) * 2) > 0.1 * ((w + d) * 32), `district ${id}: a window at the heart`);
    for (let i = 0; i < f.windows.length; i++) for (let j = i + 1; j < f.windows.length; j++) { const a = f.windows[i], b = f.windows[j]; assert.ok(Math.hypot((a.x - b.x) / (1.9 * a.rx), (a.y - b.y) / (1.9 * a.rx * FORM.window.ratio)) > 0.99, `district ${id}: two windows overlap`); }
    assert.equal(coverAt(f, cx, cy), 1, `district ${id}: the heart is under cloud`);
  }
  assert.deepEqual([1, 1.6, 2.6].map(windowCount), [3, 3, 2]); assert.equal(formOf(DIST[3], 1.6).windows.length, 3); assert.equal(formOf(DIST[3], 2.6).windows.length, 2);
  const D = DIST[3], w = windowsOf(D, 1); assert.deepEqual(w, windowsOf(D, 1)); assert.equal(windowsOf(D, 1, 1).length, 1); assert.ok(insideOf(w[0], w[0].x, w[0].y) === 0 && Math.abs(insideOf(w[0], w[0].x + w[0].rx, w[0].y) - 1) < 1e-12);
});

test('the bank is still ONE connected mass at every scale (no island of lobes, a window never cuts it in two), with the shared rules of the lattice: every lobe overlaps another', () => {
  for (const scale of [1, 1.6, 2.6]) for (const id of IDS) {
    const f = formOf(DIST[id], scale), s = structure(f.lobes, 1e-6); assert.equal(s.components, 1, `district ${id}, scale ${scale}: ${s.components} separate masses`); assert.ok(s.fewest >= 1, `district ${id}, scale ${scale}: a lone lobe`);
  }
});

test('a lobe on the outline is marked `edge` (the painter gives it the full shade) and one in the middle of the mass is not; every rim lobe and window ring lobe is an edge', () => {
  for (const id of [1, 3, 11]) {
    const f = formOf(DIST[id], 1), edge = f.lobes.filter((l) => l.edge), inner = f.lobes.filter((l) => !l.edge);
    assert.ok(edge.length > 30 && inner.length > 5, `district ${id}: ${edge.length} edge, ${inner.length} inner`); assert.ok(f.lobes.filter((l) => l.kind >= 2).every((l) => l.edge));
    for (const l of inner) assert.ok(l.kind <= 1, 'only mass and towers can be inner');
  }
});

test('the box holds every lobe, the reach holds the shadow, and a rectangle outside the bank touches nothing while one on a lobe touches it', () => {
  for (const id of [1, 3, 11]) {
    const f = formOf(DIST[id], 1), { box, reach } = f;
    for (const l of f.lobes) assert.ok(l.x - l.r >= box.x0 && l.x + l.r <= box.x1 && l.y - l.r >= box.y0 && l.y + l.r <= box.y1, 'a lobe outside the box');
    assert.ok(reach.x1 >= box.x1 + REACH.x - 1e-9 && reach.y1 >= box.y1 + REACH.y - 1e-9 && reach.x0 <= box.x0 && reach.y0 <= box.y0, 'the reach is the box swept down and to the right');
    assert.equal(touches(f, box.x1 + 5000, box.y1 + 5000, box.x1 + 5400, box.y1 + 5400), false); assert.equal(touches(f, f.cx - 10, f.cy - 10, f.cx + 10, f.cy + 10), true);
    const l = f.lobes[40]; assert.equal(touches(f, l.x - 5, l.y - 5, l.x + 5, l.y + 5), true);
    // the diamond's empty corner (the box's top left) is not touched, so a chunk store never bakes it
    assert.equal(touches(f, box.x0, box.y0, box.x0 + TOUCH - 1, box.y0 + TOUCH - 1), false, 'the top left corner of the box is empty');
    let blocks = 0, set = 0; for (const b of f.touch.bits) { blocks++; if (b) set++; } assert.ok(set / blocks < 0.85, `the bank and its shadow touch ${(100 * set / blocks).toFixed(0)}% of the blocks of their box`);
  }
});

test('a small sky cloud\'s box holds all of its paint: every body (lifted towards the sun by LIFT) and its contour is inside, so no puff is cut flat on top', () => {
  for (let k = 0; k < 400; k++) {
    const f = skyFormOf(k * 977 + 13), lx = LIFT.x * f.r0, ly = LIFT.y * f.r0, cw = 1.2; // the contour is a pixel or so out (cloudpaint.js: cw)
    for (const l of f.lobes) {
      assert.ok(l.y - ly - l.r - cw >= f.box.y0, `cloud ${k}: the top of a lifted body and its contour (${(l.y - ly - l.r - cw).toFixed(1)}) is inside the box (${f.box.y0.toFixed(1)})`);
      assert.ok(l.x - lx - l.r - cw >= f.box.x0 && l.x + l.r + cw <= f.box.x1 && l.y + l.r + cw <= f.box.y1, `cloud ${k}: the sides and the foot too`);
    }
  }
});

test('light under a cloud: a point in a lobe is covered, a point in a window or outside the bank is not, and a light is covered by the share of five points of its reach that are', () => {
  const D = DIST[3], f = formOf(D, 1), w = f.windows[0], l = f.lobes.find((q) => q.kind === 0 && q.r > 40);
  assert.equal(coverAt(f, l.x, l.y), 1); assert.equal(coverAt(f, w.x, w.y), 0); assert.equal(coverAt(f, f.box.x0 - 500, f.box.y0 - 500), 0); assert.equal(coverAt(f, f.box.x1 + 500, f.box.y1 + 500), 0);
  assert.equal(lightCover(f, l.x, l.y, 20), 1); assert.equal(lightCover(f, w.x, w.y, 20), 0); const edge = lightCover(f, w.x + w.rx * 0.95, w.y, 120); assert.ok(edge > 0 && edge < 1, `a light by a window's rim is half hidden: ${edge}`);
  const g = coverOf([{ x: 0, y: 0, r: 100 }], { x0: -120, x1: 120, y0: -120, y1: 120 }); assert.equal(g.nx, 10); assert.equal(g.bits[5 * 10 + 5], 1); assert.equal(g.bits[0], 0);
  const t = touchOf([{ x: 0, y: 0, r: 50 }], { x0: -60, x1: 60, y0: -60, y1: 60 }); assert.ok(t.bits.some((b) => b) && t.nx * TOUCH >= 120 + REACH.x);
});

test('the sky\'s small clouds: five to seven lobes on a flat base, two or three taller ones, deterministic by cell, a box that holds them', () => {
  const seen = new Set(); for (let k = 1; k < 200; k += 7) {
    const f = skyFormOf(k), g = skyFormOf(k); assert.deepEqual(f, g); const base = f.lobes.filter((l) => l.kind === 0), tops = f.lobes.filter((l) => l.kind === 1); seen.add(base.length);
    assert.ok(base.length >= 5 && base.length <= 7 && tops.length >= 2 && tops.length <= 3, `${base.length} and ${tops.length}`); assert.ok(f.lobes.every((l) => l.row === 2 && l.edge === 1));
    for (const l of f.lobes) assert.ok(l.x - l.r >= f.box.x0 && l.x + l.r <= f.box.x1 && l.y - l.r >= f.box.y0 && l.y + l.r <= f.box.y1);
    for (let i = 1; i < f.lobes.length; i++) assert.ok(f.lobes[i - 1].y <= f.lobes[i].y, 'top to bottom');
  }
  assert.ok(seen.size >= 2, 'the sizes vary');
});

test('a chunk is made where something is painted: the middle of every shadow stamp, at every light of the day, is in a touched block, and the touched share of the bank\'s reach is well under all of it', () => {
  for (const id of [1, 3, 11]) {
    const f = formOf(DIST[id], 1), { box } = f, h = box.y1 - box.y0, w = box.x1 - box.x0;
    for (const [night, dusk] of [[0, 0], [0, 1], [1, 0], [0.5, 0.5]]) {
      const len = shadowLength(night, dusk), sx = SHADOW.sx * len, sy = SHADOW.sy * len;
      assert.ok(sx >= SHADOW.sxMin - 1e-9 && sx <= SHADOW.sxMax + 1e-9 && sy >= SHADOW.syMin - 1e-9 && sy <= SHADOW.syMax + 1e-9, 'the push of the light is inside the range the grid is made for');
      assert.equal(touches(f, (box.x0 + box.x1) / 2 + sx - 5, box.y0 + h * SHADOW.broadAt + sy - 5, (box.x0 + box.x1) / 2 + sx + 5, box.y0 + h * SHADOW.broadAt + sy + 5), true, 'the middle of the broad shadow');
      let stamps = 0; for (const l of f.lobes) { if (!castsShadow(l)) continue; stamps++; const x = l.x + sx, y = l.y + l.r * SHADOW.lobeDown + sy; assert.equal(touches(f, x - 3, y - 3, x + 3, y + 3), true, `district ${id}: the shadow of a lobe at ${x.toFixed(0)}, ${y.toFixed(0)}`); }
      assert.ok(stamps > 20, `${stamps} lobes cast`);
    }
    let touched = 0, all = 0; for (let y = box.y0; y < box.y1 + REACH.y; y += TOUCH) for (let x = box.x0; x < box.x1 + REACH.x; x += TOUCH) { all++; if (touches(f, x + 1, y + 1, x + TOUCH - 1, y + TOUCH - 1)) touched++; }
    assert.ok(touched / all < 0.75, `district ${id}: ${(100 * touched / all).toFixed(0)}% of the blocks of the reach are touched`); void w;
  }
  assert.equal(castsShadow({ row: 0, kind: 0, k: 0 }), false); assert.equal(castsShadow({ row: 2, kind: 2, k: 0 }), false); assert.equal(castsShadow({ row: 2, kind: 0, k: 0.9 }), false); assert.equal(castsShadow({ row: 1, kind: 1, k: 0.3 }), true);
});
