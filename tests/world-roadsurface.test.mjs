// One road surface (the world pass WP10). The author's screenshots showed a fork as two ribbons laid over each other with a cream line across both, a footpath lying on the asphalt, the farm's stripes and the harbor's band painted over a road,
// and every road meeting its block in one straight cut across the street: the asphalt changes tone, the sidewalk and the kerb stop, the stage's lip crosses the mouth. Recorded here as canvas calls and as geometry:
//   RS1  the road layer paints in four passes: every footpath, then every kerb, then every asphalt strip, then the dashes: no kerb is painted after any asphalt, so none lies across another road's asphalt
//   RS2  a 2 by 2 patch of kerb and of asphalt covers each junction (the fork itself, its stem and branches, the path heads, the one bridge and the gates are tests/world-roads.test.mjs's: the data), no centre dash within 2 tiles of it
//   RS3  the pads' stripes, grids, bands and lawns are painted under the roads (the road layer paints them first) and the blocks layer paints none of them: a decal never reaches a road
//   RS4  an apron at every connected port (33: a road leaves it): the pure geometry (the street's width and tone become the road's over 2 tiles, the sidewalk tapers to nothing, nothing outside its own rectangle) and the picture (the blocks layer
//        paints it over the stage: asphalt and kerb over the road's mouth at every port; its LOOK: the tone steps from the block's own asphalt to the road's, an open road's dashes go on through it and a locked road's tone does too, an opaque fill
//        lies over the stage's lip, and it is still painted at the zoom the governor's lite tier draws at)
//   RS5  the stage's own dashes stop before the block's edge: none of the 33 aprons cuts one in half (the last dash of the cross street overhung the edge at 13.S and 14.S, and the apron's asphalt covered half of it; at 15.S and 16.S, which have no road, it hung off the stage)
//   RS6  a footpath that leaves a road is joined to it: a sand strip of the path's own width runs from each path head back along the path's first stretch to the road, under the kerb (ground art: no edge changes)
//   RS7  at a fork whose branch is locked and whose stem is not (or the other way round), the branch keeps its own tone right up to the node, whichever way its road runs: the colour changes on one line across the branch, through the node; a fork whose roads
//        are all open is as it was (nothing is painted after the patches)
// The tones the layers paint in are worked out here from the palette, not read from the module under test, and the new exports are read as namespaces, so that on the commit before this one each test fails on what it asserts (the old code has no junction,
// no path head, no apron and no `pad` on a decal) instead of failing to load.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx } from './helpers/recctx.mjs';
import { LAYOUT, DIST, EDGES, T, polyAt, roadZ } from '../js/world/layout.js';
import * as ISL from '../js/world/island.js';
import { lodOf } from '../js/world/lod.js';
import { runLayer } from '../js/world/stack.js';
import * as GA from '../js/world/groundart.js';
import { drawStage, tonesOf } from '../js/world/groundmat.js';
import { tone, warmVeil } from '../js/world/decalart.js';
import { VEIL } from '../js/world/terrainfield.js';
import { mix } from '../js/world/iso.js';
import { ROAD, PAVE, SAND } from '../js/world/palette.js';
import * as RS from '../js/world/roadshape.js';
import { loadWorld, auditRoads, ratchetCounts } from '../scripts/lib/road-audit.mjs';

const JUNCTIONS = ISL.JUNCTIONS || {};
const px = (gx, gy) => (gx - gy) * 32, py = (gx, gy, z) => (gx + gy) * 16 - z;
const OUT = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };
/** The colours of an open road, as the art direction has them: the kerb, the asphalt, the dashes, a footpath's sand and its edge. */
const KERB = ROAD.kerb, ASPH = mix(ROAD.mid, ROAD.light, 0.12), DASH = ROAD.dash, FOOT = mix(SAND.light, PAVE.cream, 0.5), FOOT_EDGE = mix(SAND.mid, PAVE.cobble, 0.5);
/** The colours of a locked road: veiled (palette.js roadTones: the surface a paler grey, the kerb the same cream, both under half a veil). */
const LOCKED_KERB = warmVeil(ROAD.kerb, 0.5 * VEIL), LOCKED_ASPH = warmVeil(mix(ROAD.light, ROAD.kerb, 0.2), 0.5 * VEIL);
const fakeW = (open = LAYOUT.ids, zoom = 1, lite = false) => ({ unlocked: new Set(open), env: { lod: lodOf(zoom), t: 0, lite }, cam: { z: zoom }, toWorld() {}, toScreen() {} });
/** The viewport (world pixels) round a grid point: `r` tiles each way, and the height of the ground up and down. */
const around = (gx, gy, r = 9, z = 0) => ({ x0: px(gx - r, gy + r) - 40, x1: px(gx + r, gy - r) + 40, y0: py(gx - r, gy - r, z) - 120, y1: py(gx + r, gy + r, z) + 120 });
const WHOLE = { x0: -6000, x1: 7000, y0: -500, y1: 6000 };
/** The grid point a screen point shows at height z (the inverse of px and py). */
const gridOf = (x, y, z) => { const a = (y + z) / 16, b = x / 32; return [(a + b) / 2, (a - b) / 2]; };
/** The fills a recording made, in order: { style, alpha, pts (every point of the path: moveTo and lineTo points, and an ellipse's four extremes), polys (the same, a polygon to each subpath: a path of dashes holds one to a dash) }. */
function fillsOf(r) {
  const fills = []; let path = [], polys = [], cur = null, k = 0;
  for (const c of r.log.calls) {
    if (c[0] === 'beginPath') { path = []; polys = []; cur = null; }
    else if (c[0] === 'moveTo') { cur = [[c[1], c[2]]]; polys.push(cur); path.push([c[1], c[2]]); }
    else if (c[0] === 'lineTo') { if (!cur) { cur = []; polys.push(cur); } cur.push([c[1], c[2]]); path.push([c[1], c[2]]); }
    else if (c[0] === 'closePath') cur = null;
    else if (c[0] === 'ellipse') { const e = [[c[1] - c[3], c[2]], [c[1] + c[3], c[2]], [c[1], c[2] - c[4]], [c[1], c[2] + c[4]]]; path.push(...e); polys.push(e); cur = null; }
    else if (c[0] === 'fill') { const f = r.log.fills[k++]; fills.push({ style: f.style, alpha: f.alpha, pts: path.slice(), polys: polys.slice() }); }
    else if (c[0] === 'fillRect') k++;
  }
  return fills;
}
/** What a layer paints into a view at a zoom (the level of detail of that zoom, and the governor's lite tier if asked), as the fills it made in order. */
function paint(id, view, open = LAYOUT.ids, zoom = 1, lite = false) {
  const r = recCtx(), w = fakeW(open, zoom, lite); runLayer(id, w, r.ctx, view, { zoom, far: false, mode: 1, see: () => true });
  return fillsOf(r);
}
const inside = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
/** The index of the last fill that covers the screen point, is opaque and was painted after `from` (-1 when none does). */
const topmost = (f, x, y, from = 0) => { for (let i = f.length - 1; i >= from; i--) if (f[i].alpha >= 0.99 && f[i].polys.some((p) => inside(p, x, y))) return i; return -1; };
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

test('RS2: the fork is covered and unmarked: a 2 by 2 patch of kerb and of asphalt covers each node, turned to the stem and in the stem\'s own tone (open or locked), no centre dash lies within 2 tiles of it, and the three roads\' dashes are painted over all the asphalt', () => {
  const J = GA.junctions(); assert.equal(J.length, 3, 'the road layer knows the three forks (island.js JUNCTIONS)');
  for (const j of J) {
    const { at } = JUNCTIONS[j.name], es = EDGES.filter((e) => e.a === j.name || e.b === j.name), stem = es.find((e) => e.stem);
    // no dash within 2 tiles of the node, on any of its edges
    for (const e of es) for (const [s, s1] of GA.dashSpans(e)) assert.ok(e.a === j.name ? s >= GA.DASH_SKIP : s1 <= e.len - GA.DASH_SKIP, `${nameOf(e)}: a dash from ${s.toFixed(1)} to ${s1.toFixed(1)} is within ${GA.DASH_SKIP} tiles of ${j.name}`);
    // the patch: a square of the kerb's colour (2 by 2) and one of the asphalt's (1.6 by 1.6), turned to the stem. The stem's heading is read from the stem's own points (the street's axis: the way the traveller goes on), not from the module's own J.ux, J.uy
    const [qa, qb] = stem.pts.slice(-2), hl = Math.hypot(qb[0] - qa[0], qb[1] - qa[1]), hx = (qb[0] - qa[0]) / hl, hy = (qb[1] - qa[1]) / hl, vx = -hy, vy = hx, zNode = roadZ(stem, stem.len) + 0.4; // (the road's surface is 0.4 above its graded height)
    assert.ok(Math.abs(hx * (j.ux) + hy * (j.uy) - 1) < 1e-9, `${j.name}: the road layer turns the patch the way the stem heads`);
    for (const open of [LAYOUT.ids, LAYOUT.ids.filter((i) => i !== stem.gate)]) { // the stem open, and the stem shut: the patch takes the stem's tone
      const stemOpen = open.includes(stem.gate), f = paint('roads', around(at[0], at[1], 6, zNode), open);
      for (const [style, h, lift, what] of [[stemOpen ? KERB : LOCKED_KERB, 1, 0, 'kerb'], [stemOpen ? ASPH : LOCKED_ASPH, 0.8, 0.1, 'asphalt']]) {
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => { const gx = at[0] + hx * su * h + vx * sv * h, gy = at[1] + hy * su * h + vy * sv * h; return [px(gx, gy), py(gx, gy, zNode + lift)]; });
        const patch = f.filter((q) => q.style === style && q.pts.length === 4).find((q) => corners.every(([cx, cy]) => q.pts.some(([x, y]) => Math.hypot(x - cx, y - cy) < 0.01)));
        assert.ok(patch, `${j.name}, the stem ${stemOpen ? 'open' : 'locked'}: a square of ${what} in the stem's tone, ${2 * h} by ${2 * h} tiles, turned to the stem, covers the node`);
      }
    }
    // and in the picture no dash polygon comes within 1.8 tiles of the node (unprojected at the road's height)
    for (const q of paint('roads', around(at[0], at[1], 6, zNode)).filter((q) => q.style === DASH)) for (const [x, y] of q.pts) { const [gx, gy] = gridOf(x, y, zNode + 0.2); assert.ok(Math.hypot(gx - at[0], gy - at[1]) > 1.8, `${j.name}: a dash vertex ${Math.hypot(gx - at[0], gy - at[1]).toFixed(2)} tiles from the node`); }
  }
});

test('RS3: the pads\' stripes, grids, bands and lawns are painted under the roads and not over them (the farm\'s stripes lay over the asphalt of the road from 11 to 12, the harbor\'s band over the road to 9), every decal of every pad is painted, and the blocks layer paints none', () => {
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
  // every decal of every pad (the grids of 9 and 10, the harbor's band, the campus lawn and all the farm's stripes), not only the farm's: a fill of the decal's own colour with a vertex on its rectangle, painted before the first kerb of the island
  const all = paint('roads', WHOLE), firstKerb = Math.min(...indexes(all, (q) => q.style === KERB)); let pads = 0;
  for (const id of LAYOUT.ids) for (const d of padOf(DIST[id])) {
    pads++; const D = DIST[id], cols = (d.k === 'stripes' ? [d.c1, d.c2] : d.k === 'grid' ? [d.col] : d.k === 'rect' ? [d.fill] : [d.c1, d.c2, d.col, d.fill]).map((c) => c && tone(c, 0)).filter(Boolean);
    const onIt = ([x, y]) => { const [gx, gy] = gridOf(x, y, D.z); return gx >= d.x - 0.2 && gx <= d.x + d.w + 0.2 && gy >= d.y - 0.2 && gy <= d.y + d.d + 0.2; };
    const mine = indexes(all, (q) => cols.includes(q.style) && q.pts.some(onIt));
    assert.ok(mine.length >= 1, `district ${id} (${D.theme}): its ${d.k} decal is painted by the roads layer (${mine.length} fills of ${cols.join(' / ')})`);
    assert.ok(Math.max(...mine) < firstKerb, `district ${id}: its ${d.k} decal is painted before the first kerb`);
  }
  assert.ok(pads >= 20, `the pads' decals are not a handful (${pads})`);
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

test('RS4c: the apron\'s look: the asphalt steps from the block\'s own tone to the road\'s (the open road\'s, or the locked road\'s) in bands that only go one way, the kerb the same, an open road\'s dashes go on through the apron and a locked road\'s have none, an opaque fill lies over the stage\'s lip, and all of it is painted at the zoom of the governor\'s lite tier too', () => {
  const rgbOf = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const projected = (pts, lift) => pts.map(([x, y, z]) => [px(x, y), py(x, y, z + lift)]);
  const same = (poly, pts) => poly.length === pts.length && pts.every(([x, y]) => poly.some(([a, b]) => Math.abs(a - x) < 1e-9 && Math.abs(b - y) < 1e-9)); // (the same polygon, wherever it starts: the module's arithmetic is the test's, so the numbers agree to rounding)
  /** Do the tones of a run of bands go from the first to the last without turning back (each channel, step by step)? */
  const oneWay = (tones) => { const t = tones.map(rgbOf); return [0, 1, 2].every((c) => { const d = Math.sign(t.at(-1)[c] - t[0][c]); return t.every((v, i) => !i || Math.sign(v[c] - t[i - 1][c]) * d >= 0) && (d !== 0 || t.every((v) => v[c] === t[0][c])); }); };
  let dashed = 0, withLock = 0;
  for (const a of GA.aprons()) {
    const [id, side] = a.port.split('.'), D = DIST[+id], [ux, uy] = OUT[side], [x0, y0] = D.ports[side], gate = a.e.gate, bands = a.pieces.bands, zr = bands[0].asphalt[0][2]; // (zr: the road's own height at the port)
    const inApron = ([x, y]) => { const [gx, gy] = gridOf(x, y, zr + 0.2), u = (gx - x0) * ux + (gy - y0) * uy, o = -(gx - x0) * uy + (gy - y0) * ux; return u > 0.35 && u < 3 && Math.abs(o) < 0.4; }; // (a dash vertex on the middle of the street, beyond the edge and within the apron's reach: 2 tiles and a dash)
    const street = D.ground.find((g) => g.kind === 'road' && (g.w > g.d) === (side === 'W' || side === 'E')), streetPoly = [[street.x, street.y], [street.x + street.w, street.y], [street.x + street.w, street.y + street.d], [street.x, street.y + street.d]].map(([x, y]) => [px(x, y), py(x, y, D.z)]);
    for (const state of ['open', 'locked']) {
      const roadOpen = state === 'open', open = roadOpen ? LAYOUT.ids : LAYOUT.ids.filter((i) => i !== gate), blockLocked = !open.includes(D.id), at = `${a.port} (${state})`;
      const f = paint('blocks', around(x0 + ux * 1.2, y0 + uy * 1.2, 6, D.z), open), find = (pts, lift) => { const want = projected(pts, lift); return f.findIndex((q) => q.polys.some((p) => same(p, want))); };
      const asph = bands.map((b) => find(b.asphalt, 0.1)), kerbs = bands.map((b) => [find(b.kerb[0], 0), find(b.kerb[1], 0)]), walls = [find(a.pieces.walks.left, 0), find(a.pieces.walks.right, 0)];
      assert.ok(asph.every((i) => i >= 0) && kerbs.flat().every((i) => i >= 0) && walls.every((i) => i >= 0), `${at}: every piece of the apron is painted (asphalt ${asph}, kerb ${kerbs.flat()}, sidewalk ${walls})`);
      // the asphalt: the first band is the block's own street, the last is the road's surface, between them the tones only go one way
      const stageStreet = f.find((q) => q.polys.some((p) => same(p, streetPoly))); assert.ok(stageStreet, `${at}: the stage paints its street`);
      const roadSurface = roadOpen ? ASPH : LOCKED_ASPH, tones = asph.map((i) => f[i].style);
      assert.notEqual(stageStreet.style, roadSurface, `${at}: the block's asphalt and the road's are two tones (else there is no step to soften)`);
      assert.equal(tones[0], stageStreet.style, `${at}: the apron begins in the block's own asphalt (${tones[0]} against the stage's ${stageStreet.style})`);
      assert.equal(tones.at(-1), roadSurface, `${at}: and ends in the ${state} road's surface (${tones.at(-1)} against ${roadSurface})`);
      assert.ok(oneWay(tones) && new Set(tones).size === tones.length, `${at}: the tones of its bands go one way, each its own (${tones.join(' ')})`);
      // the kerb: from the block's cream to the road's, the two sides alike
      const kt = kerbs.map(([l, r]) => { assert.equal(f[l].style, f[r].style, `${at}: both sides of a band are one tone`); return f[l].style; });
      assert.equal(kt[0], blockLocked ? warmVeil(KERB, VEIL) : KERB, `${at}: the kerb begins as the block's`); assert.equal(kt.at(-1), roadOpen ? KERB : LOCKED_KERB, `${at}: and ends as the ${state} road's`); assert.ok(oneWay(kt), `${at}: the kerb's tones go one way`);
      // an opaque fill of the apron lies over the stage's lip: 0.05 tile under the block's edge, on the middle, in the asphalt and on the kerb
      const mine = new Set([...asph, ...kerbs.flat(), ...walls]);
      for (const [o, lift] of [[0, 0.1], [0.5, 0.1], [-0.5, 0.1], [0.95, 0.1], [-0.95, 0.1], [1.1, 0], [-1.1, 0]]) {
        const gx = x0 - ux * 0.05 - uy * o, gy = y0 - uy * 0.05 + ux * o, at2 = topmost(f, px(gx, gy), py(gx, gy, zr + lift));
        assert.ok(mine.has(at2), `${at}: the topmost opaque fill 0.05 tile under the edge, ${o} tile from the middle, is the apron's (the fill ${at2} of ${f.length})`);
      }
      // the dashes: an open road's go on through the apron (repainted: the road's own, which the apron covered), a locked road has none
      const beyond = f.filter((q) => q.style === DASH && q.polys.some((p) => p.every((v) => inApron(v)))); // (in the apron's reach: another district's stage may be in the view, and its dashes are elsewhere)
      if (roadOpen) {
        const spans = GA.dashSpans(a.e).filter(([s, s1]) => (a.end ? a.e.len - s1 : s) <= RS.APRON.len + 0.1); assert.ok(spans.length >= 1, `${at}: the road has a dash within the apron's length`);
        for (const [s, s1] of spans) { const m = polyAt(a.e, (s + s1) / 2), z = roadZ(a.e, (s + s1) / 2) + 0.6; assert.ok(f.some((q) => q.style === DASH && q.polys.some((p) => inside(p, px(m.x, m.y), py(m.x, m.y, z)))), `${at}: the dash from ${s.toFixed(1)} to ${s1.toFixed(1)} is painted over the apron`); }
        dashed++;
      } else { assert.equal(beyond.length, 0, `${at}: a locked road has no dash in its apron`); withLock++; }
    }
    // at zoom 0.6, which is what the lite tier draws at: the bands and the dashes are there
    const g = paint('blocks', around(x0 + ux * 1.2, y0 + uy * 1.2, 6, D.z), LAYOUT.ids, 0.6, true), want = bands.map((b) => projected(b.asphalt, 0.1));
    assert.ok(want.every((w) => g.some((q) => q.polys.some((p) => same(p, w)))), `${a.port}: at zoom 0.6 every band of the apron's asphalt is painted`);
    assert.ok(g.some((q) => q.style === DASH && q.polys.some((p) => p.every((v) => inApron(v)))), `${a.port}: and the road's dash`);
  }
  assert.equal(dashed, 33, 'every port of an open road has dashes in its apron'); assert.equal(withLock, 33);
});

test('RS5: the stage\'s own dashes stop before the block\'s edge: none of the 33 aprons cuts one (the last dash of the cross street overhung the edge by 0.3 tile at 13.S and 14.S, and the apron, which starts 0.1 under the edge, covered half of it and left it with a hard diagonal end)', () => {
  const DASHES = new Map();
  const dashesOf = (D) => { // the stage's centre dashes, each as a polygon in the grid
    if (!DASHES.has(D.id)) { const r = recCtx(), S = { ground: D.cols.ground, walk: D.cols.walk, asphalt: D.cols.road }; drawStage(r.ctx, { x0: D.bb[0], x1: D.bb[2], y0: D.bb[1], y1: D.bb[3] + 200 }, D, S, 0, [1, 1, 1, 1], () => {}, 2); DASHES.set(D.id, fillsOf(r).filter((q) => q.style === DASH).flatMap((q) => q.polys.map((p) => p.map(([x, y]) => gridOf(x, y, D.z))))); }
    return DASHES.get(D.id);
  };
  /** Does the apron's asphalt (from 0.1 under the edge outwards) lie over any part of the polygon (grid points)? The polygon is sampled at its corners and on a 7 by 3 lattice. */
  const cutBy = (a, poly) => {
    const apron = a.pieces.bands[0].asphalt.map(([x, y]) => [x, y]), [p0, p1, p2, p3] = poly;
    for (let i = 0; i <= 6; i++) for (let j = 0; j <= 2; j++) { const x = p0[0] + (p1[0] - p0[0]) * (i / 6) + (p3[0] - p0[0]) * (j / 2), y = p0[1] + (p1[1] - p0[1]) * (i / 6) + (p3[1] - p0[1]) * (j / 2); if (inside(apron, x, y)) return true; }
    return false;
  };
  let n = 0;
  for (const a of GA.aprons()) {
    const [id, side] = a.port.split('.'), D = DIST[+id], [ux, uy] = OUT[side], [x0, y0] = D.ports[side];
    // the test can see a cut: a dash laid from 0.6 tile inside the edge to 0.3 beyond it (what the last dash of the cross street was at 13.S and 14.S) is cut by this port's apron
    const lay = (u0, u1) => [[u0, -0.12], [u1, -0.12], [u1, 0.12], [u0, 0.12]].map(([u, o]) => [x0 + ux * u - uy * o, y0 + uy * u + ux * o]);
    assert.ok(cutBy(a, lay(-0.6, 0.3)), `${a.port}: a dash that overhangs the edge is cut`); assert.ok(!cutBy(a, lay(-1.5, -0.6)), `${a.port}: and one wholly inside the block is not`);
    for (const q of dashesOf(D)) { n++; assert.ok(!cutBy(a, q), `${a.port}: a stage dash at (${q[0][0].toFixed(2)}, ${q[0][1].toFixed(2)}) to (${q[2][0].toFixed(2)}, ${q[2][1].toFixed(2)}) is covered by the apron`); }
  }
  assert.ok(n >= 33 * 15, `the test looked at every dash of every stage for each of the ports (${n})`);
  // and none lies beyond its block's edge anywhere (15.S and 16.S have no road: there the overhanging dash hung off the stage), and every stage has the same dashes whatever its place on the grid (which dash was the last depended on how the additions rounded)
  for (const id of LAYOUT.ids) { const D = DIST[id]; for (const q of dashesOf(D)) for (const [x, y] of q) assert.ok(x >= D.ox - 1e-6 && x <= D.ox + D.w + 1e-6 && y >= D.oy - 1e-6 && y <= D.oy + D.d + 1e-6, `district ${id}: a stage dash reaches (${x.toFixed(2)}, ${y.toFixed(2)}), beyond its block`); }
  const counts = LAYOUT.ids.map((id) => dashesOf(DIST[id]).length); assert.equal(new Set(counts).size, 1, `every stage has the same number of dashes (${counts.join(', ')})`);
});

test('RS6: a footpath that leaves a road is joined to it: from each path head a strip of sand in the path\'s own width and two tones runs back along the path\'s first stretch to the road, under the kerb and the asphalt (ground art: no edge changes, so the detector still finds the footpath 2 tiles from the road)', async () => {
  assert.equal(typeof GA.headConnectors, 'function', 'groundart.js knows where each path head is joined to its road');
  const C = GA.headConnectors(), heads = Object.entries(ISL.HEADS);
  assert.deepEqual(C.map((c) => c.head).sort(), heads.map(([h]) => h).sort(), 'one connector to each path head: the three footpaths that leave a road');
  const roads = EDGES.filter((e) => !e.path && !e.ferry), all = paint('roads', WHOLE), lite = paint('roads', WHOLE, LAYOUT.ids, 0.6, true), firstKerb = Math.min(...indexes(all, (q) => q.style === KERB));
  for (const [h, { at }] of heads) {
    const path = EDGES.find((e) => e.path && e.a === h), p1 = polyAt(path, 0.5), back = [-p1.dx, -p1.dy], lat = [-back[1], back[0]], z = roadZ(path, 0) + 0.4, c = C.find((q) => q.head === h);
    assert.deepEqual(path.pts[0], at, `${h}: the footpath still starts where island.js puts its head (the connector is not data)`);
    // the way back along the path's first stretch: how far to the road's kerb (1 tile from its middle line), and where it meets the middle line
    const toRoad = (t) => Math.min(...roads.map((r) => nearestOn(r, at[0] + back[0] * t, at[1] + back[1] * t)));
    let kerbAt = null; for (let t = 0.05; t < 6 && kerbAt === null; t += 0.05) if (toRoad(t) <= 1.0) kerbAt = t;
    assert.ok(kerbAt !== null && kerbAt >= 0.8 && kerbAt <= 2, `${h}: the road's kerb is ${kerbAt && kerbAt.toFixed(2)} tiles back along the path from its head`);
    assert.ok(c.len > kerbAt && c.len < kerbAt + 1.6, `${h}: the connector runs ${c.len.toFixed(2)} tiles, past the kerb (${kerbAt.toFixed(2)}), to the road's middle`);
    const at2 = (t, o) => [at[0] + back[0] * t + lat[0] * o, at[1] + back[1] * t + lat[1] * o], covered = (style, t, o) => { const [gx, gy] = at2(t, o); return all.some((q) => q.style === style && q.polys.some((p) => inside(p, px(gx, gy), py(gx, gy, z)))); };
    for (let t = 0.1; t <= kerbAt - 0.05; t += 0.1) {
      assert.ok(covered(FOOT_EDGE, t, 0) && covered(FOOT, t, 0), `${h}: sand (edge and surface) lies ${t.toFixed(1)} tile from the head, on the way to the road`);
      for (const o of [-0.8, 0.8]) assert.ok(!covered(FOOT_EDGE, t, o) && !covered(FOOT, t, o), `${h}: and no sand ${o} tile beside it (it is the path's width, ${t.toFixed(1)} tile from the head)`);
    }
    // and at zoom 0.6 with the governor's lite tier on, which is where the author's cameras 5 and 8 were taken: the same sand, on the way to the road
    for (const t of [0.3, kerbAt - 0.1]) { const [gx, gy] = at2(t, 0); assert.ok(lite.some((q) => q.style === FOOT && q.polys.some((p) => inside(p, px(gx, gy), py(gx, gy, z)))), `${h}: at zoom 0.6, lite, the sand is there ${t.toFixed(1)} tile from the head`); }
    // under the road: it is a footpath fill, so RS1 puts it before every kerb; and at the road's middle line the topmost fill is the road's
    const [mx, my] = at2(c.len, 0), top = topmost(all, px(mx, my), py(mx, my, z));
    assert.ok(top > firstKerb && [ASPH, DASH].includes(all[top].style), `${h}: at the road's middle the topmost fill is the road's asphalt (fill ${top}: ${all[top] && all[top].style})`);
  }
  // none of it is data
  const world = await loadWorld(); assert.equal(ratchetCounts(auditRoads(world, { full: false })).pathTilesOverAsphalt, 0, 'the detector, which reads edges, still finds no footpath over asphalt');
});

test('RS7: at a fork where a branch is locked and the stem is not (4 before 5, 8 before 9, 12 before 13) the branch keeps its own tone right up to the node: the colour changes on one line across it, through the node, and the patch\'s corner does not poke into it, whichever way the road runs (from the node, or into it); a fork whose roads are all open is as it was (nothing is painted after the patches), and the same goes the other way round, an open branch of a locked stem', () => {
  let checked = 0;
  /** The index of the last fill that is a patch of the fork at `at` (a square of kerb or asphalt tone within 1.5 tiles of the node). */
  const lastPatch = (f, at, zNode) => Math.max(...indexes(f, (q) => q.pts.length === 4 && [KERB, ASPH, LOCKED_KERB, LOCKED_ASPH].includes(q.style) && q.pts.every(([x, y]) => { const [gx, gy] = gridOf(x, y, zNode); return Math.hypot(gx - at[0], gy - at[1]) < 1.5; })));
  /** The picture of fork `j` with the branch `b` in a state of its own: the branch's own tone along its first tile, the stem's behind the node line, the corners of the patch that lie in the branch's width, the kerb on the branch's outer side. */
  const check = (j, b, open, stemOpen, label) => {
    const { at } = JUNCTIONS[j.name], stem = EDGES.find((e) => e.stem && (e.a === j.name || e.b === j.name)), zNode = roadZ(stem, stem.len) + 0.4;
    const [qa, qb] = stem.pts.slice(-2), hl = Math.hypot(qb[0] - qa[0], qb[1] - qa[1]), hx = (qb[0] - qa[0]) / hl, hy = (qb[1] - qa[1]) / hl; // the stem's own heading (u), and across it (v)
    const f = paint('roads', around(at[0], at[1], 6, zNode), open), P = (gx, gy) => [px(gx, gy), py(gx, gy, zNode + 0.1)];
    const out = b.a === j.name ? 1 : -1, pb = polyAt(b, b.a === j.name ? 0.01 : b.len - 0.01), dx = pb.dx * out, dy = pb.dy * out, nx = -dy, ny = dx; // the branch's heading away from the node, and across it
    const branchTone = stemOpen ? [LOCKED_KERB, LOCKED_ASPH] : [KERB, ASPH], stemTone = stemOpen ? [KERB, ASPH] : [LOCKED_KERB, LOCKED_ASPH], at2 = (s, o) => [at[0] + dx * s + nx * o, at[1] + dy * s + ny * o];
    const styleAt = (s, o) => { const i = topmost(f, ...P(...at2(s, o))); return i < 0 ? null : f[i].style; };
    // along the branch from the node: its own asphalt, to 1.0 tile out; and the same row of points a little behind the node line is the stem's
    for (const s of [0.15, 0.4, 0.7, 1.0]) for (const o of [-0.6, -0.3, 0, 0.3, 0.6]) assert.equal(styleAt(s, o), branchTone[1], `${label}: the asphalt ${s} tile along the branch and ${o} across it is the branch's own`);
    for (const o of [-0.6, -0.3, 0, 0.3, 0.6]) assert.equal(styleAt(-0.15, o), stemTone[1], `${label}: and 0.15 tile behind the node line, ${o} across, it is the stem's: the change lies on one line across the branch, through the node`);
    // the kerb of the branch on the side away from every other road, 0.9 from its middle: its own, from the node out
    const away = [-0.9, 0.9].filter((o) => { const [x, y] = at2(0.6, o); return EDGES.filter((e) => e !== b && !e.path && !e.ferry).every((e) => nearestOn(e, x, y) > 1.15); });
    for (const o of away) for (const s of [0.15, 0.5, 1.0]) assert.equal(styleAt(s, o), branchTone[0], `${label}: the kerb ${s} tile along the branch on its outer side is the branch's own`);
    // the corners of the stem's patch that lie ahead of the node line and well inside the branch's width are the branch's too (the patch's asphalt reaches 1.13 tiles along a road that leaves at 45 degrees)
    let corners = 0;
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const gx = at[0] + (hx * su - hy * sv) * 0.78, gy = at[1] + (hy * su + hx * sv) * 0.78, s = (gx - at[0]) * dx + (gy - at[1]) * dy, o = (gx - at[0]) * nx + (gy - at[1]) * ny;
      if (s > 0.2 && Math.abs(o) < 0.7) { corners++; assert.equal(styleAt(s, o), branchTone[1], `${label}: the patch's corner ${s.toFixed(2)} along the branch and ${o.toFixed(2)} across it is the branch's, not a dark notch in it`); }
    }
    if (Math.abs(dx * hx + dy * hy) > 0.5) assert.ok(corners >= 1, `${label}: a branch that leaves at an angle (not square across the stem, as the T's does) has a corner of the patch inside its width (${corners})`);
    // at zoom 0.6 with the governor's lite tier on (the author's cameras 1 and 3): the same
    const g = paint('roads', around(at[0], at[1], 6, zNode), open, 0.6, true), gi = topmost(g, ...P(...at2(0.5, 0))); assert.ok(gi >= 0 && g[gi].style === branchTone[1], `${label}: at zoom 0.6, lite, the branch's own tone is there too (${gi >= 0 && g[gi].style})`);
    // what is painted after the last patch, before the dashes, is the branch's own asphalt, its first tile and a bit and no more
    const last = lastPatch(f, at, zNode), dash1 = f.findIndex((q, i) => i > last && q.style === DASH), between = f.slice(last + 1, dash1 < 0 ? f.length : dash1);
    assert.ok(between.length >= 1 && between.every((q) => q.style === branchTone[1]), `${label}: the branch's own asphalt is painted again after the patch (${between.length} fills)`);
    for (const q of between) for (const [x, y] of q.pts) { const [gx, gy] = gridOf(x, y, zNode + 0.1), d = Math.hypot(gx - at[0], gy - at[1]); assert.ok(d < 1.5, `${label}: and its first tile and a bit, no more: a corner of it lies ${d.toFixed(2)} tiles from the node`); }
    checked++;
  };
  let forks = 0;
  for (const j of GA.junctions()) {
    const { at } = JUNCTIONS[j.name], es = EDGES.filter((e) => e.a === j.name || e.b === j.name), stem = es.find((e) => e.stem), differing = es.filter((e) => !e.stem && e.gate !== stem.gate), zNode = roadZ(stem, stem.len) + 0.4;
    assert.equal(differing.length, 1, `${j.name}: one branch opens with another district than the stem does`);
    check(j, differing[0], LAYOUT.ids.filter((i) => i !== differing[0].gate), true, `${j.name}, the stem open, the branch locked`);
    check(j, differing[0], LAYOUT.ids.filter((i) => i !== stem.gate), false, `${j.name}, the stem locked, the branch open`);
    // all open: nothing is painted between the last patch and the dashes
    const all = paint('roads', around(at[0], at[1], 6, zNode)), afterAll = all.slice(lastPatch(all, at, zNode) + 1).findIndex((q) => q.style === DASH);
    assert.ok(afterAll === 0, `${j.name}: with every road open the dashes come straight after the patch of asphalt (${afterAll} fills between)`);
    forks++;
  }
  assert.equal(forks, 3);
  // a road that runs INTO its node, not out of it (the road from 7 to 8 ends at the fork of 8; all three that part at a fork happen to be locked from the node outwards), is repainted the same way: make it a district's of its own for the length of the test
  const into = EDGES.find((e) => e.a === '7.N' && e.b === 'j8'), j8 = GA.junctions().find((q) => q.name === 'j8'), was = into.gate;
  try { into.gate = 99; check(j8, into, LAYOUT.ids, true, 'j8, the road in from 7 locked (a gate of its own, shut), the stem open'); check(j8, into, [...LAYOUT.ids.filter((i) => i !== 8 && i !== 9), 99], false, 'j8, the road in from 7 open, the stem and the road out to 9 locked'); } finally { into.gate = was; }
  assert.equal(into.gate, 8); assert.ok(checked >= 8, `eight pictures were looked at (${checked})`);
});

