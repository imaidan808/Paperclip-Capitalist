// The cloud bank's geometry (js/world/cloudbank.js) held to the art direction's rule on the sixteen real footprints: one connected mass of puffs that covers at least 85% of the district, every puff overlapping
// two others, a count and a radius that scale with the district; and the first sizing of the art direction, which could not meet its own rule, shown to be unable to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DIST } from '../js/world/layout.js';
import { BANK, spanOf, puffRadius, areaOf, outlineOf, bankPuffs, bankScale, coverage, structure, overlapOf, maxCoverage, fillMpx, inView, bankMs, PUFF_MS, FILL_MS_PER_MPX } from '../js/world/cloudbank.js';

const IDS = Object.keys(DIST), eq = (a, b) => assert.deepEqual(a, b);

test('the sixteen real footprints are the ones the plan measured: 405,504 world pixels squared for the Scrap Yard, 851,968 for the Campus, 1,478,656 for Farmland', () => {
  assert.equal(IDS.length, 16); assert.equal(areaOf(DIST[1].fp), 405504); assert.equal(areaOf(DIST[3].fp), 851968); assert.equal(areaOf(DIST[11].fp), 1478656); assert.equal(spanOf(DIST[1].fp), 1280);
  const [a, b, c, d] = outlineOf([0, 0, 2, 2], 0); eq([a, b, c, d], [[0, 0], [64, 32], [0, 64], [-64, 32]]);
});

test('the first sizing (14 to 42 puffs of radius 22 to 64) cannot cover 85% of a district while every puff overlaps its neighbours by 35%: it covers 27 to 68% at best, and twelve districts sit at the cap', () => {
  let capped = 0, best = 0, worst = 1;
  for (const id of IDS) {
    const fp = DIST[id].fp, tiles = fp[2] * fp[3], n = Math.min(42, Math.max(14, Math.round(tiles / 14))), cover = maxCoverage(n, 64, areaOf(fp));
    if (n === 42) capped++; best = Math.max(best, cover); worst = Math.min(worst, cover); assert.ok(cover < BANK.coverMin, `district ${id}: ${(cover * 100).toFixed(0)}%`);
  }
  assert.equal(capped, 12); assert.ok(best < 0.7 && best > 0.65, 'the best case is the Scrap Yard, about 68%'); assert.ok(worst < 0.3 && worst > 0.25, 'the worst is Farmland, about 27%');
});

test('every district gets a bank of 40 to 150 puffs that covers at least 85% of its footprint as ONE connected mass, every puff overlapping two others by at least 35% of the smaller radius', () => {
  for (const id of IDS) {
    const D = DIST[id], puffs = bankPuffs(D.fp, D.z), s = structure(puffs);
    assert.ok(puffs.length >= BANK.countMin && puffs.length <= BANK.countMax, `district ${id}: ${puffs.length} puffs`);
    const cov = coverage(puffs, D.fp, D.z); assert.ok(cov >= BANK.coverMin, `district ${id} covers ${(cov * 100).toFixed(1)}%`);
    assert.equal(s.components, 1, `district ${id}: ${s.components} separate masses`); assert.ok(s.fewest >= 2, `district ${id}: a puff overlaps ${s.fewest} neighbours`); assert.equal(s.isolated, 0);
    for (const p of puffs) assert.ok(p.r >= BANK.rMin * BANK.tiers[2] - 1e-9 && p.r <= BANK.rMax * BANK.tiers[0] + 1e-9, `district ${id}: radius ${p.r}`);
  }
});

test('the puff radius is a share of the footprint\'s width, so a bigger district has bigger puffs and about the same count; the tiers read back to front; the bank is deterministic and never empty', () => {
  assert.ok(puffRadius(DIST[1].fp) < puffRadius(DIST[3].fp) && puffRadius(DIST[3].fp) < puffRadius(DIST[11].fp)); assert.ok(Math.abs(puffRadius(DIST[11].fp) - 0.042 * spanOf(DIST[11].fp)) < 1e-9);
  const n1 = bankPuffs(DIST[1].fp, DIST[1].z).length, n11 = bankPuffs(DIST[11].fp, DIST[11].z).length; assert.ok(Math.abs(n1 - n11) < 0.25 * n1, `${n1} against ${n11}`);
  const p = bankPuffs(DIST[3].fp, DIST[3].z), mean = (row) => { const r = p.filter((q) => q.row === row).map((q) => q.r); return r.reduce((a, b) => a + b, 0) / r.length; };
  assert.ok(mean(0) > mean(1) && mean(1) > mean(2), 'back tier largest, front smallest'); assert.deepEqual(p.map((q) => q.row), p.map((q) => q.row).sort(), 'drawn back to front');
  eq(bankPuffs(DIST[3].fp, DIST[3].z), p); for (const q of p) assert.ok(q.k >= 0 && q.k < 1);
  assert.ok(bankPuffs([0, 0, 0.3, 0.3], 0).length >= 1, 'a tiny footprint still gets a bank'); assert.notDeepEqual(bankPuffs(DIST[1].fp, 0), bankPuffs(DIST[2].fp, 0));
});

test('the bank stays on its district: no puff centre is further outside the footprint than the rim and the jitter allow', () => {
  for (const id of IDS) {
    const D = DIST[id], poly = outlineOf(D.fp, D.z), r0 = puffRadius(D.fp), cx = poly.reduce((a, q) => a + q[0], 0) / 4, cy = poly.reduce((a, q) => a + q[1], 0) / 4;
    for (const p of bankPuffs(D.fp, D.z)) { const lift = BANK.lift[p.row] * r0, out = Math.max(Math.abs(p.x - cx) / (spanOf(D.fp) / 2), Math.abs(p.y + lift - cy) / (spanOf(D.fp) / 4)); assert.ok(out <= 1.2, `district ${id}: a puff at ${out.toFixed(2)} of the footprint's half-width`); }
  }
});

test('the middle zooms use a coarse bank (a third of the puffs, one outline, the same rules), the far zoom a baked sprite, the near zooms the fine bank', () => {
  assert.equal(bankScale(0.129), 0); assert.equal(bankScale(0.299), 0); assert.equal(bankScale(0.3), 1.6); assert.equal(bankScale(0.5), 1.6); assert.equal(bankScale(0.699), 1.6); assert.equal(bankScale(0.7), 1); assert.equal(bankScale(2.4), 1);
  for (const id of IDS) {
    const D = DIST[id], fine = bankPuffs(D.fp, D.z), coarse = bankPuffs(D.fp, D.z, bankScale(0.5)), s = structure(coarse);
    assert.ok(coarse.length >= 24 && coarse.length <= fine.length / 2, `district ${id}: ${coarse.length} coarse against ${fine.length}`); assert.ok(coverage(coarse, D.fp, D.z) >= BANK.coverMin, `district ${id} coarse covers ${coverage(coarse, D.fp, D.z)}`);
    assert.equal(s.components, 1); assert.ok(s.fewest >= 2);
  }
});

test('overlap and the planning model: a puff overlaps itself fully, two apart do not, and what a bank costs is its puffs in view and its fill, on the budget machine\'s unit costs', () => {
  const a = { x: 0, y: 0, r: 50 }, b = { x: 60, y: 0, r: 50 }, c = { x: 200, y: 0, r: 50 }; assert.equal(overlapOf(a, a), 100); assert.equal(overlapOf(a, b), 40); assert.ok(overlapOf(a, c) < 0);
  const D = DIST[3], puffs = bankPuffs(D.fp, D.z), cx = (outlineOf(D.fp, D.z)[1][0] + outlineOf(D.fp, D.z)[3][0]) / 2, cy = (outlineOf(D.fp, D.z)[0][1] + outlineOf(D.fp, D.z)[2][1]) / 2, view = { x0: cx - 600, x1: cx + 600, y0: cy - 375, y1: cy + 375 };
  const none = { x0: 1e6, x1: 1e6 + 10, y0: 0, y1: 10 }; assert.equal(inView(puffs, none), 0); assert.equal(fillMpx(puffs, 1.2, 1.5, none), 0); assert.equal(bankMs(puffs, 1.2, 1.5, none), 0);
  const f15 = fillMpx(puffs, 1.2, 1.5, view), f20 = fillMpx(puffs, 1.2, 2, view); assert.ok(Math.abs(f20 / f15 - (2 / 1.5) ** 2) < 1e-9, 'fill grows with the square of the density');
  assert.ok(fillMpx(puffs, 1.2, 1.5, view, 'clip') === 2 * f15, 'a clipped puff is twice the fill of a flat one'); near(bankMs(puffs, 1.2, 1.5, view), PUFF_MS * inView(puffs, view) + FILL_MS_PER_MPX * f15);
});
function near(a, b, e = 1e-9) { assert.ok(Math.abs(a - b) <= e, `${a} is not ${b}`); }
