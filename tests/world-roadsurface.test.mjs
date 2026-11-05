// One road surface (the world pass WP10). The author's screenshots showed a fork as two ribbons laid over each other with a cream line across both, a footpath lying on the asphalt, the farm's stripes and the harbor's band painted over a road,
// and every road meeting its block in one straight cut across the street: the asphalt changes tone, the sidewalk and the kerb stop, the stage's lip crosses the mouth. Recorded here as canvas calls and as geometry:
//   RS1  the road layer paints in four passes: every footpath, then every kerb, then every asphalt strip, then the dashes: no kerb is painted after any asphalt, so none lies across another road's asphalt
//   RS2  a 2 by 2 patch of kerb and of asphalt covers each junction (the fork itself, its stem and branches, the path heads, the one bridge and the gates are tests/world-roads.test.mjs's: the data), no centre dash within 2 tiles of it
//   RS3  the pads' stripes, grids, bands and lawns are painted under the roads (the road layer paints them first) and the blocks layer paints none of them: a decal never reaches a road
//   RS4  an apron at every connected port (33: a road leaves it): the pure geometry (the street's width and tone become the road's over 2 tiles, the sidewalk tapers to nothing, nothing outside its own rectangle) and the picture (the blocks layer
//        paints it over the stage: asphalt and kerb over the road's mouth at every port)
// The tones the layers paint in are worked out here from the palette, not read from the module under test, and the new exports are read as namespaces, so that on the commit before this one each test fails on what it asserts (the old code has no junction,
// no path head, no apron and no `pad` on a decal) instead of failing to load.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx } from './helpers/recctx.mjs';
import { LAYOUT, DIST, EDGES, T, polyAt } from '../js/world/layout.js';
import * as ISL from '../js/world/island.js';
import { lodOf } from '../js/world/lod.js';
import { runLayer } from '../js/world/stack.js';
import * as GA from '../js/world/groundart.js';
import { drawStage, tonesOf } from '../js/world/groundmat.js';
import { tone } from '../js/world/decalart.js';
import { mix } from '../js/world/iso.js';
import { ROAD, PAVE, SAND } from '../js/world/palette.js';
import * as RS from '../js/world/roadshape.js';

const JUNCTIONS = ISL.JUNCTIONS || {};
const px = (gx, gy) => (gx - gy) * 32, py = (gx, gy, z) => (gx + gy) * 16 - z;
const OUT = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };
/** The colours of an open road, as the art direction has them: the kerb, the asphalt, the dashes, a footpath's sand and its edge. */
const KERB = ROAD.kerb, ASPH = mix(ROAD.mid, ROAD.light, 0.12), DASH = ROAD.dash, FOOT = mix(SAND.light, PAVE.cream, 0.5), FOOT_EDGE = mix(SAND.mid, PAVE.cobble, 0.5);
const fakeW = (open = LAYOUT.ids) => ({ unlocked: new Set(open), env: { lod: lodOf(1), t: 0 }, cam: { z: 1 }, toWorld() {}, toScreen() {} });
/** The viewport (world pixels) round a grid point: `r` tiles each way, and the height of the ground up and down. */
const around = (gx, gy, r = 9, z = 0) => ({ x0: px(gx - r, gy + r) - 40, x1: px(gx + r, gy - r) + 40, y0: py(gx - r, gy - r, z) - 120, y1: py(gx + r, gy + r, z) + 120 });
/** What a layer paints into a view, as the fills it made in order: { style, alpha, pts (the path: moveTo and lineTo points, and an ellipse's four extremes) }. */
function paint(id, view, open = LAYOUT.ids) {
  const r = recCtx(), w = fakeW(open); runLayer(id, w, r.ctx, view, { zoom: 1, far: false, mode: 1, see: () => true });
  const fills = []; let path = [], k = 0;
  for (const c of r.log.calls) {
    if (c[0] === 'beginPath') path = [];
    else if (c[0] === 'moveTo' || c[0] === 'lineTo') path.push([c[1], c[2]]);
    else if (c[0] === 'ellipse') path.push([c[1] - c[3], c[2]], [c[1] + c[3], c[2]], [c[1], c[2] - c[4]], [c[1], c[2] + c[4]]);
    else if (c[0] === 'fill') { const f = r.log.fills[k++]; fills.push({ style: f.style, alpha: f.alpha, pts: path.slice() }); }
    else if (c[0] === 'fillRect') k++;
  }
  return fills;
}
const inside = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const nearestOn = (e, x, y) => { let best = Infinity; for (let i = 0; i + 1 < e.pts.length; i++) { const [ax, ay] = e.pts[i], [bx, by] = e.pts[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)); best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t)); } return best; };
const nameOf = (e) => `${e.a} > ${e.b}`;
const indexes = (f, pred) => f.map((q, i) => (pred(q) ? i : -1)).filter((i) => i >= 0);

test('RS1: the road layer paints in four passes: footpaths, then every kerb, then every asphalt strip, then the dashes: no kerb after any asphalt (it would lie across another road\'s asphalt), at all three forks and over the whole island', () => {
  const forks = Object.entries(JUNCTIONS).map(([j, { at }]) => ['the fork ' + j, around(at[0], at[1], 8, 20)]), pawn = around(70, 94, 9, 16);
  for (const [label, v] of [['the whole island', { x0: -6000, x1: 7000, y0: -500, y1: 6000 }], ['Pawn\'s east port', pawn], ...forks]) {
    const f = paint('roads', v), feet = indexes(f, (q) => q.style === FOOT || q.style === FOOT_EDGE), kerbs = indexes(f, (q) => q.style === KERB), asph = indexes(f, (q) => q.style === ASPH), dashes = indexes(f, (q) => q.style === DASH);
    assert.ok(kerbs.length >= 3 && asph.length >= 3 && dashes.length >= 1, `${label}: kerbs, asphalt and dashes are drawn (${kerbs.length}, ${asph.length}, ${dashes.length})`);
    if (feet.length) assert.ok(Math.max(...feet) < Math.min(...kerbs), `${label}: every footpath is under every road (the path's last fill ${Math.max(...feet)}, the first kerb ${Math.min(...kerbs)})`);
    assert.ok(Math.max(...kerbs) < Math.min(...asph), `${label}: the last kerb fill (${Math.max(...kerbs)}) is before the first asphalt fill (${Math.min(...asph)}): no kerb is painted over another road's asphalt`);
    assert.ok(Math.max(...asph) < Math.min(...dashes), `${label}: the dashes are painted over all the asphalt (${Math.max(...asph)} before ${Math.min(...dashes)})`);
  }
  assert.ok(indexes(paint('roads', { x0: -6000, x1: 7000, y0: -500, y1: 6000 }), (q) => q.style === FOOT).length >= 6, 'and the six footpaths are drawn');
});

test('RS2: the fork is covered and unmarked: a 2 by 2 patch of kerb and of asphalt covers each node, no centre dash lies within 2 tiles of it, and the three roads\' dashes are painted over all the asphalt', () => {
  const J = GA.junctions(); assert.equal(J.length, 3, 'the road layer knows the three forks (island.js JUNCTIONS)');
  for (const j of J) {
    const { at } = JUNCTIONS[j.name], es = EDGES.filter((e) => e.a === j.name || e.b === j.name);
    // no dash within 2 tiles of the node, on any of its edges
    for (const e of es) for (const [s, s1] of GA.dashSpans(e)) assert.ok(e.a === j.name ? s >= GA.DASH_SKIP : s1 <= e.len - GA.DASH_SKIP, `${nameOf(e)}: a dash from ${s.toFixed(1)} to ${s1.toFixed(1)} is within ${GA.DASH_SKIP} tiles of ${j.name}`);
    // the patch: a square of the kerb's colour and one of the asphalt's cover the node and the points 0.7 tile from it along and across the stem
    const f = paint('roads', around(at[0], at[1], 6, j.z)), vx = -j.uy, vy = j.ux;
    for (const [style, lift] of [[KERB, 0], [ASPH, 0.1]]) {
      const P = (a, b) => [px(at[0] + j.ux * a + vx * b, at[1] + j.uy * a + vy * b), py(at[0] + j.ux * a + vx * b, at[1] + j.uy * a + vy * b, j.z + lift)];
      const patch = f.filter((q) => q.style === style).find((q) => q.pts.length === 4 && [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7], [0.7, 0.7], [-0.7, -0.7]].every(([a, b]) => inside(q.pts, ...P(a, b))));
      assert.ok(patch, `${j.name}: a square of ${style === KERB ? 'kerb' : 'asphalt'} covers the node`);
    }
    // and in the picture no dash polygon comes within 1.8 tiles of the node (unprojected at the road's height)
    for (const q of f.filter((q) => q.style === DASH)) for (const [x, y] of q.pts) { const gx = ((x / 32) + (y + j.z + 0.2) / 16) / 2, gy = ((y + j.z + 0.2) / 16 - x / 32) / 2; assert.ok(Math.hypot(gx - at[0], gy - at[1]) > 1.8, `${j.name}: a dash vertex ${Math.hypot(gx - at[0], gy - at[1]).toFixed(2)} tiles from the node`); }
  }
});

test('RS3: the pads\' stripes, grids, bands and lawns are painted under the roads and not over them (the farm\'s stripes lay over the asphalt of the road from 11 to 12, the harbor\'s band over the road to 9), and the blocks layer paints none', () => {
  const padOf = (D) => D.decals.filter((d) => d.pad);
  assert.deepEqual(LAYOUT.ids.filter((id) => padOf(DIST[id]).length).map((id) => DIST[id].theme), ['campus', 'harbor', 'industrial', 'tech', 'farm'], 'five themes dress their pads, and say so (`pad`)');
  for (const id of LAYOUT.ids) for (const d of padOf(DIST[id])) assert.ok(DIST[id].padRects.some((r) => d.x >= r[0] - 1e-6 && d.y >= r[1] - 1e-6 && d.x + d.w <= r[0] + r[2] + 1e-6 && d.y + d.d <= r[1] + r[3] + 1e-6), `district ${id}: a ${d.k} decal lies on one of its pads`);
  // the setup is not vacuous: the road from 11 to 12 passes through the farm's west pad, so the stripes and the road overlap
  const D11 = DIST[11], road = EDGES.find((e) => e.a === '11.S' && e.b.startsWith('j')) || EDGES.find((e) => e.a === '11.S'), stripes = padOf(D11).filter((d) => d.k === 'stripes');
  assert.ok(stripes.some((d) => { for (let s = 0; s <= road.len; s += 0.25) { const p = polyAt(road, s); if (p.x > d.x && p.x < d.x + d.w && p.y > d.y && p.y < d.y + d.d) return true; } return false; }), 'the road 11 to 12 crosses a pad stripe decal');
  const f = paint('roads', around(28, 70, 11, D11.z)), styles = new Set(stripes.flatMap((d) => [tone(d.c1, 0), tone(d.c2, 0)]));
  const decals = indexes(f, (q) => styles.has(q.style)), kerb = indexes(f, (q) => q.style === KERB);
  assert.ok(decals.length >= 4 && kerb.length > 0, `the stripes (${decals.length} fills) and the road's kerb (${kerb.length}) are in the view`);
  assert.ok(Math.max(...decals) < Math.min(...kerb), 'every stripe is painted before the first kerb of a road: the road lies over the stripes, not the stripes over the road');
  // the stage hands the kit's own decals to its painter and leaves the pads' out
  let kit = 0;
  for (const id of LAYOUT.ids) {
    const D = DIST[id], seen = [], S = { ground: D.cols.ground, walk: D.cols.walk, asphalt: D.cols.road }; // (only its tones are read)
    drawStage(recCtx().ctx, { x0: D.bb[0], x1: D.bb[2], y0: D.bb[1], y1: D.bb[3] + 200 }, D, S, 0, [1, 1, 1, 1], (c, d) => seen.push(d), 2);
    assert.ok(seen.every((d) => !d.pad), `district ${id}: the stage is handed no pad decal`); kit += seen.length;
  }
  assert.ok(kit > 30, `and the kits' own decals are still drawn by the stage (${kit})`);
});

test('RS4a: the apron is pure geometry: the street\'s asphalt and kerb become the road\'s over 2 tiles, the sidewalk tapers to nothing, and nothing lies outside the rectangle it declares', () => {
  const A = RS.APRON; assert.ok(A, 'roadshape.js says what an apron is');
  assert.equal(A.streetHalf, T.ave[3] / 2, 'the street it starts from is the block\'s (2 wide)');
  const e = EDGES[0], kb = 0.2, roadHalf = e.w / 2 - kb;
  assert.equal(A.roadHalf, roadHalf, 'and ends at the road\'s asphalt (1.6 wide in a flat kerb of a fifth)'); assert.equal(A.kerb, kb, 'the kerb the same flat fifth');
  assert.equal(RS.apronHalf(0), 1); assert.ok(Math.abs(RS.apronHalf(A.len) - 0.8) < 1e-9); assert.equal(RS.apronWalk(0), A.walk); assert.ok(RS.apronWalk(A.len) === 0 && RS.apronWalk(1) < A.walk, 'the sidewalk tapers to nothing');
  for (let u = 0; u < A.len; u += 0.1) assert.ok(RS.apronHalf(u + 0.1) <= RS.apronHalf(u) + 1e-12 && RS.apronWalk(u + 0.1) <= RS.apronWalk(u) + 1e-12, 'narrowing all the way');
  const frame = (u) => [100 + u, 50, 0, 1, 10], P = RS.apronPieces(frame), all = [...P.bands.flatMap((b) => [...b.kerb[0], ...b.kerb[1], ...b.asphalt]), ...P.walks.left, ...P.walks.right];
  const reach = A.streetHalf + A.kerb + A.walk;
  for (const [x, y, z] of all) { assert.ok(x >= 100 - A.back - 1e-9 && x <= 100 + A.len + 1e-9, 'inside its length'); assert.ok(Math.abs(y - 50) <= reach + 1e-9, 'inside its width'); assert.equal(z, 10); }
  assert.equal(P.bands[0].t, 0, 'it begins in the block\'s own tone'); assert.equal(P.bands.at(-1).t, 1, 'and ends in the road\'s'); assert.ok(P.bands.every((b, i) => !i || b.t >= P.bands[i - 1].t), 'by steps that only go one way');
  assert.ok(P.bands.length === A.slices + 1 && P.bands.every((b) => b.u0 >= -A.back - 1e-9));
  assert.ok(P.walks.left.every(([, y]) => 50 - y > 0) && P.walks.right.every(([, y]) => y - 50 > 0), 'a wedge a side, each on its own side');
});

test('RS4b: the blocks layer paints an apron over the stage at each of the 33 connected ports: asphalt and kerb over the street\'s mouth, out to 1.7 tiles, and a wedge of sidewalk each side of it', () => {
  const A = GA.aprons(); assert.equal(A.length, 33, 'a road leaves 33 ports (35 with the ferry\'s two: it ends in buoys, not asphalt)');
  assert.equal(new Set(A.map((a) => a.port)).size, 33, 'each port once: a fork is one road out of the port, its stem');
  for (const a of A) {
    const [id, side] = a.port.split('.'), D = DIST[+id], [ux, uy] = OUT[side], [x0, y0] = D.ports[side];
    const f = paint('blocks', around(x0 + ux * 1.2, y0 + uy * 1.2, 6, D.z)), T = tonesOf(D, { ground: D.cols.ground, walk: D.cols.walk, asphalt: D.cols.road }, 0);
    for (const u of [0.3, 1.0, 1.7]) {
      const gx = x0 + ux * u, gy = y0 + uy * u, solid = f.filter((q) => q.alpha >= 0.99 && (inside(q.pts, px(gx, gy), py(gx, gy, D.z + 0.4)) || inside(q.pts, px(gx, gy), py(gx, gy, D.z + 0.5))));
      assert.ok(solid.length >= 2, `${a.port}: ${solid.length} opaque fills cover the road ${u} tile out of the port (the asphalt's bands, one over another)`);
    }
    // a sidewalk wedge each side, 0.4 tile out and 1.6 tiles from the middle (the kerb's outer edge is 1.2 there, the wedge 0.8 wide)
    for (const sg of [-1, 1]) {
      const gx = x0 + ux * 0.4 - uy * 1.6 * sg, gy = y0 + uy * 0.4 + ux * 1.6 * sg;
      assert.ok(f.some((q) => q.style === T.walk && inside(q.pts, px(gx, gy), py(gx, gy, D.z + 0.4))), `${a.port}: the sidewalk goes on past the block's edge as a wedge (side ${sg})`);
    }
  }
});

