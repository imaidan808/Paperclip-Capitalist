// The materials of a district's block (js/world/groundmat.js), the meadows' dressing (groundart.js dressingOf), the decals' reading of puddles and stains (decalart.js ellKind), the swash as one outline
// (water.js) and the rack's four houses (bldg-works.js): the pure rules, and the drawing on a recording context. Judges' round 1, E1 to E7.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx, thinnestStroke } from './helpers/recctx.mjs';
import { gridRange, kerbBars, crackOutline, tonesOf, drawStage, paintFringe, decalBox, KERB_W, KERB_H, PLINTH_H } from '../js/world/groundmat.js';
import { dressingOf } from '../js/world/groundart.js';
import { ellKind, decalV2 } from '../js/world/decalart.js';
import { breathAt, drawSwash } from '../js/world/water.js';
import { rackVariant, rackFans } from '../js/world/bldg-works.js';
import { LAYOUT, DIST, GW, GH } from '../js/world/layout.js';
import { groundSet } from '../js/world/palette.js';
import { luma, mix, rgb } from '../js/world/iso.js';
import { lodOf } from '../js/world/lod.js';

const D1 = DIST[1], roadsOf = (D) => D.ground.filter((g) => g.kind === 'road');

test('gridRange: the tiles a view can touch, margin and clamping, taller views reaching further up the grid', () => {
  const v = { x0: -200, x1: 200, y0: 300, y1: 500 }, a = gridRange(v, 0, 0), b = gridRange(v, 60, 0), c = gridRange(v, 0, 2);
  assert.ok(a[0] <= a[1] && a[2] <= a[3]); assert.ok(b[1] >= a[1] && b[3] >= a[3] && b[0] <= a[0] && b[2] <= a[2], 'a height widens the range');
  assert.deepEqual([c[0], c[1], c[2], c[3]], [a[0] - 2, a[1] + 2, a[2] - 2, a[3] + 2], 'the margin is in tiles on every side');
  const L = gridRange({ x0: -1e5, x1: 1e5, y0: -1e5, y1: 1e5 }, 0, 1, [GW, GH]); assert.deepEqual(L, [0, GW - 1, 0, GH - 1], 'clamped to the island');
  for (const [x, y] of [[-200, 300], [200, 500]]) { const gx = x / 64 + y / 32, gy = y / 32 - x / 64; assert.ok(gx >= a[0] && gx <= a[1] + 1 && gy >= a[2] && gy <= a[3] + 1, 'the corners are inside'); }
});

test('kerbBars: a bar on each side of each street, none inside a road, none across a crossing, the faces facing the viewer, and no two overlapping', () => {
  const roads = roadsOf(D1), bars = kerbBars(roads); assert.equal(roads.length, 2);
  assert.ok(bars.length >= 8, `${bars.length} bars`);
  const overlap = (a, b) => a.x < b.x + b.w - 1e-9 && a.x + a.w > b.x + 1e-9 && a.y < b.y + b.d - 1e-9 && a.y + a.d > b.y + 1e-9;
  for (const b of bars) {
    for (const r of roads) assert.ok(!overlap(b, r), 'a kerb never lies on the asphalt');
    assert.ok(b.w > 0 && b.d > 0); assert.ok(b.face === 'l' || b.face === 'r');
    assert.equal(b.face, b.w > b.d ? 'l' : 'r', 'a bar along gx shows the wall that looks towards +gy (the sun side); one along gy the wall towards +gx');
    assert.ok(Math.min(b.w, b.d) <= KERB_W + 1e-9, 'a bar is as wide as the kerb');
  }
  for (let i = 0; i < bars.length; i++) for (let j = i + 1; j < bars.length; j++) assert.ok(!overlap(bars[i], bars[j]), `bars ${i} and ${j} overlap`);
  const ave = roads.find((r) => r.w > r.d), cross = roads.find((r) => r.w <= r.d), eastWest = bars.filter((b) => b.face === 'l');
  assert.ok(eastWest.every((b) => b.x + b.w <= cross.x + 1e-9 || b.x >= cross.x + cross.w - 1e-9), 'the east-west kerbs stop at the cross street');
  assert.equal(eastWest.filter((b) => b.y < ave.y).length, 2, 'one run each side of the crossing on the far side'); assert.equal(eastWest.filter((b) => b.y >= ave.y + ave.d).length, 2, 'and on the near side');
  assert.deepEqual(kerbBars([]), []);
  assert.ok(KERB_H > 1.5 && PLINTH_H > 1.5, 'a wall at least 1.5 world pixels tall: a face, not a line');
});

test('crackOutline: a closed outline that tapers to points, is at least minW wide at its thickest, jags, and is the same for the same seed', () => {
  const o = crackOutline(7, 1.2, 5, 0.06), n = o.length; assert.equal(n, 12);
  assert.deepEqual(o, crackOutline(7, 1.2, 5, 0.06)); assert.notDeepEqual(o, crackOutline(8, 1.2, 5, 0.06));
  const top = o.slice(0, 6), bot = o.slice(6).reverse(); const widths = top.map((p, i) => bot[i][1] - p[1]);
  assert.ok(widths[0] < 0.02 && widths[5] < 0.02, 'a point at each end'); assert.ok(Math.max(...widths) >= 0.04, `thickest ${Math.max(...widths)}`); assert.ok(widths.every((w) => w > 0), 'never negative, so the outline never folds');
  assert.ok(Math.max(...top.map((p) => p[0])) > 1.1, 'the length asked for'); assert.ok(new Set(top.map((p) => p[1].toFixed(3))).size > 3, 'it bends');
});

test('the district floor: the start district is a warm, saturated pastel and not the old muddy olive, and its block tones are made once per district and veil', () => {
  const g = groundSet('scrap').ground, [r, gg, b] = rgb(g); assert.ok(luma(g) >= 0.72, `lifted: ${luma(g).toFixed(2)}`); assert.ok(r > gg && gg > b, 'warm: red over green over blue');
  const sat = (Math.max(r, gg, b) - Math.min(r, gg, b)) / Math.max(r, gg, b); assert.ok(sat >= 0.36, `saturated enough to sit beside lime grass and turquoise water: ${sat.toFixed(2)}`);
  const S = { ...groundSet('scrap'), asphalt: '#6b7092', kerb: '#efe6d2' }, t0 = tonesOf(D1, S, 0), t1 = tonesOf(D1, S, 1);
  assert.strictEqual(t0, tonesOf(D1, S, 0), 'memoised'); assert.notStrictEqual(t0, t1); assert.ok(luma(t1.ground) >= luma(t0.ground) - 0.05, 'a locked district is veiled, not darkened');
  assert.ok(luma(t0.kerbTop) > luma(t0.asph) + 0.3, 'the kerb is pale against the asphalt'); assert.ok(luma(t0.kerbL) < luma(t0.kerbTop) && luma(t0.kerbR) < luma(t0.kerbL), 'top, sunny wall, shaded wall');
  assert.ok(luma(t0.pad) > luma(t0.ground) - 0.02, 'the stash slab is light concrete, not a dark pad');
});

const VIEW1 = { x0: (D1.ox - D1.oy - 6) * 32, x1: (D1.ox + 22 - D1.oy + 6) * 32, y0: (D1.ox + D1.oy) * 16 - 400, y1: (D1.ox + D1.oy + 40) * 16 + 200 };
const stageOf = (detail, view = VIEW1) => { const r = recCtx(), S = { ...groundSet(D1.theme), asphalt: '#6b7092', kerb: '#efe6d2' }; drawStage(r.ctx, view, D1, S, 0, detail, (c, d) => decalV2(c, d, D1.z, 0, S, detail), 1); return r; };

test('drawStage: filled shapes only (no stroke), balanced, the plinth and kerbs drawn, and the detail of the near and close bands added to a base that is complete without it', () => {
  const far = stageOf([1, 0, 0, 0]), near = stageOf([1, 1, 1, 0]), close = stageOf([1, 1, 1, 1]);
  for (const r of [far, near, close]) { assert.equal(thinnestStroke(r.log), Infinity, 'no stroked line'); assert.equal(r.log.depth, 0, 'balanced'); assert.equal(r.log.minDepth, 0); }
  assert.ok(far.log.fills.length > 40, `${far.log.fills.length} fills at far: the whole stage is there`);
  assert.ok(near.log.fills.length >= far.log.fills.length + 5, `near adds pavers, pebbles and tufts (${far.log.fills.length} to ${near.log.fills.length})`); assert.ok(close.log.fills.length > near.log.fills.length, 'close adds cracks, lit paver edges and manholes');
  const styles = new Set(far.log.fills.map((f) => f.style)); assert.ok(styles.has('#ffe27a'), 'the dashes are painted'); assert.ok(styles.has('#efe6d2'), 'the kerb top');
  assert.ok(far.log.calls.filter((c) => c[0] === 'clip').length >= 3, 'the plinth walls and the plaza are clipped, not painted across');
  for (const f of far.log.fills) assert.ok(f.alpha >= 0 && f.alpha <= 1);
  const a = stageOf([1, 1, 1, 1]), b = stageOf([1, 1, 1, 1]); assert.equal(JSON.stringify(a.log.calls), JSON.stringify(b.log.calls), 'a function of the district and the view only: the same every time');
});

test('drawStage paints nothing for a view that does not meet the district, so a chunk of open meadow costs nothing', () => {
  const r = stageOf([1, 1, 1, 1], { x0: 90000, x1: 90500, y0: 90000, y1: 90500 }); assert.ok(r.log.fills.length < 60, 'the stage rim and shadow are culled by the canvas, the marks by the view');
  const marks = r.log.calls.filter((c) => c[0] === 'ellipse').length; assert.ok(marks < 12, `${marks} ellipses`);
});

test('paintFringe: tufts along the outside of the block only near and close, never where a street leaves the block, none for a view away from it', () => {
  const T = tonesOf(D1, { ...groundSet('scrap'), asphalt: '#6b7092', kerb: '#efe6d2' }, 0), land = (gx, gy) => LAYOUT.land[(gy | 0) * GW + (gx | 0)] === 1;
  const run = (detail, view = VIEW1) => { const r = recCtx(); paintFringe(r.ctx, view, D1, D1.z, detail, T, land, () => true); return r; };
  assert.equal(run([1, 1, 0, 0]).log.fills.length, 0, 'none at mid zoom'); assert.ok(run([1, 1, 1, 0]).log.fills.length >= 3, 'three greens near');
  assert.equal(run([1, 1, 1, 1], { x0: 9e4, x1: 9.1e4, y0: 9e4, y1: 9.1e4 }).log.fills.length, 0);
});

test('dressingOf: bushes about one tile in ten, trees in groves, rocks rarely, a pure function of the tile and how green its neighbourhood is, and more of everything where it is greener', () => {
  const count = (grove) => { const c = [0, 0, 0, 0]; for (let j = 0; j < 80; j++) for (let i = 0; i < 80; i++) c[dressingOf(i, j, grove)]++; return c; };
  const open = count(0), wood = count(1), n = 6400;
  assert.ok(open[1] / n > 0.04 && open[1] / n < 0.09, `bushes in the open ${(open[1] / n).toFixed(3)}`); assert.ok(open[3] / n < 0.025, `trees in the open ${(open[3] / n).toFixed(3)}`);
  assert.ok(wood[3] / n > 0.1 && wood[3] / n < 0.22, `trees in a grove ${(wood[3] / n).toFixed(3)}`); assert.ok(wood[1] / n > 0.03 && wood[1] / n < 0.12, `bushes in a grove ${(wood[1] / n).toFixed(3)}`); assert.ok(wood[3] > open[3] * 6, 'a grove is a wood');
  assert.ok(open[2] / n < 0.04 && open[2] > 0, 'rocks are rare');
  assert.equal(dressingOf(12, 34, 0.5), dressingOf(12, 34, 0.5));
});

test('ellKind: a blue-green fill is a puddle, a dark one a stain of dirt, anything else is drawn as the kit made it; and a puddle or stain is never a flat grey ellipse', () => {
  assert.equal(ellKind('rgba(110,150,190,.32)'), 'puddle'); assert.equal(ellKind('rgba(110,170,200,.28)'), 'puddle'); assert.equal(ellKind('rgba(20,16,12,.3)'), 'dirt');
  assert.equal(ellKind('rgba(245,211,106,.18)'), 'other'); assert.equal(ellKind(null), 'other'); assert.equal(ellKind('#fff'), 'other');
  const S = groundSet('scrap'), run = (fill) => { const r = recCtx(); decalV2(r.ctx, { k: 'ell', x: 5, y: 5, r: 0.7, fill }, 10, 0, S, [1, 1, 1, 1]); return r; };
  const pool = run('rgba(110,150,190,.32)'), dirt = run('rgba(20,16,12,.3)');
  assert.ok(pool.log.fills.length >= 3 && dirt.log.fills.length >= 2, 'a pool has a heart and a glint, a stain a body and a middle');
  for (const r of [pool, dirt]) { assert.equal(r.log.depth, 0); assert.equal(thinnestStroke(r.log), Infinity); for (const f of r.log.fills) assert.ok(f.alpha >= 0.1, 'visible'); }
  assert.ok(pool.log.fills.some((f) => String(f.style).toLowerCase() === '#fbfffe'), 'a glint of sky'); assert.ok(pool.log.fills.every((f) => luma(f.style) > 0.55), 'water is light, never grey');
});

test('the swash is one outline per stretch of beach whose width follows the breath at every point: no stepped joints, widths never under 1.5, a period of 6.5 seconds, a phase that runs along the coast', () => {
  const view = { x0: -4800, x1: -3000, y0: 1800, y1: 3200 }, sw = (t, zoom = 1, tier = 0) => { const r = recCtx(); drawSwash(r.ctx, view, zoom, t, tier); return r; };
  assert.equal(sw(0).log.calls.length, 0, 'at rest the baked foam is the picture'); assert.equal(sw(3, 1, 3).log.calls.length, 0); assert.equal(sw(3, 0.3).log.calls.length, 0);
  const r = sw(2.5); assert.ok(r.log.fills.length >= 4 && r.log.fills.length % 2 === 0, `${r.log.fills.length} fills: a wide band and a narrow one for each stretch`); assert.equal(r.log.strokes.length, 0, 'filled outlines, not strokes'); assert.equal(r.log.depth, 0);
  const alphas = new Set(r.log.fills.map((f) => f.alpha.toFixed(2))); assert.equal(alphas.size, 2, 'one strength for each band: the breath is in the width, so no stretch is a different opacity from its neighbour');
  const polys = []; let cur = null; for (const c of r.log.calls) { if (c[0] === 'moveTo') cur = [[c[1], c[2]]]; else if (c[0] === 'lineTo') cur.push([c[1], c[2]]); else if (c[0] === 'fill') polys.push(cur); }
  assert.ok(polys.some((p) => p.length > 30), 'a long stretch is one outline of many points (the old swash was a stroke of 0.7 tile)');
  const nums = (t) => sw(t).log.calls.flatMap((c) => c.filter((v) => typeof v === 'number')), a = nums(2.5), b = nums(2.5 + 6.5), c2 = nums(2.5 + 3.25), far = (x, y) => x.length !== y.length || x.some((v, i) => Math.abs(v - y[i]) > 0.01);
  assert.ok(!far(a, b), 'a period of 6.5 seconds'); assert.ok(far(a, c2), 'and not a shorter one'); // (compared with a tolerance of a hundredth of a pixel: the ribbon is kept in 32-bit numbers, and a rounded comparison flips on a number that sits on the rounding's edge)
  assert.ok(Math.abs(breathAt(0, 0) - breathAt(0, 1 / 0.12)) < 1e-4, 'the phase runs 0.12 of a cycle a tile'); assert.notEqual(breathAt(1, 0).toFixed(3), breathAt(1, 1).toFixed(3));
});

test('the rack is one of four houses by where it stands: its roof gear, its colour and its columns differ, the same house every time, and only roofs with fans have fans turning', () => {
  const seen = new Set(); for (let i = 0; i < 40; i++) { const p = { gx: 3 + i * 1.7, gy: 5 + i * 0.9, seed: i }; const v = rackVariant(p); assert.ok(v >= 0 && v < 4); assert.equal(v, rackVariant({ ...p })); seen.add(v); }
  assert.equal(seen.size, 4, 'all four turn up');
  assert.deepEqual(rackFans(0), [0.3, 0.68]); assert.deepEqual(rackFans(1), [0.5]); assert.deepEqual(rackFans(2), []); assert.deepEqual(rackFans(3), []);
});

test('decalBox: where a decal can reach, so a chunk draws only the decals it can see', () => {
  const z = 40, e = decalBox({ k: 'ell', x: 5, y: 5, r: 0.8 }, z), x = (5 - 5) * 32, y = (5 + 5) * 16 - z; assert.ok(e[0] < x - 30 && e[2] > x + 30 && e[1] < y && e[3] > y, 'a round decal is boxed by its radius');
  const r = decalBox({ k: 'rect', x: 2, y: 3, w: 4, d: 2 }, z); for (const [gx, gy] of [[2, 3], [6, 3], [6, 5], [2, 5]]) { const px = (gx - gy) * 32, py = (gx + gy) * 16 - z; assert.ok(px >= r[0] && px <= r[2] && py >= r[1] && py <= r[3], 'the corners are inside'); }
});

test('the golden-hour lod still reaches the new marks: at zoom 1.0 the near band is half in, at 2.4 the close band is in', () => {
  assert.ok(lodOf(1.0).detail[2] > 0.5 && lodOf(2.4).detail[3] > 0.95);
  assert.ok(mix('#f1cd8e', '#ffffff', 0.5) !== '#f1cd8e');
});
