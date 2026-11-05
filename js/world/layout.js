// The island: an irregular, hand-anchored world of sixteen districts joined by bending roads, bridges and a ferry (geography in island.js).
// buildLayout(zones) is pure and deterministic (no Math.random): it places the districts and their pads, lays the roads and the walking graph, then makes the terrain
// (a land mask with bays, a lake, rivers, islets; a smooth height field with a plateau under every district) and the cliffs where land meets sea.
// Grid: one tile = 1 unit; x grows to the lower right on screen, y to the lower left; heights are screen pixels.
import { ZONES } from '../data/index.js';
import { h2, lerp, clamp, mix, shade, luma } from './iso.js';
import { KITS, FILL } from './kits.js';
import { GW, GH, BW, BD, ANCHORS, REGIONS, BLOBS, CARVES, ROADS, JUNCTIONS, HEADS, VIEWPOINTS, TERMS } from './island.js';
import { tidy, fillet, gradeRoads, portFrame, framePoint, frameRect, chooseTerm, shapeOf, wantsRail, headShape, deckOf } from './roadshape.js';

/** The radius, in tiles, of the arc every corner of a road is rounded with (a footpath turns tighter): the cars follow it and the painted dashes bend with it (roadshape.js). */
export const ROAD_RADIUS = 1.6, PATH_RADIUS = 1.2;

export { GW, GH, BW, BD, REGIONS };
export const LAND = { x0: 0, x1: GW, y0: 0, y1: GH };
export const SEA = 34;                 // how far below the water line a cliff falls
export const SKIRT = 5;                // tiles over which the ground rises or falls from a district's plateau to the hills around it
export const BRIDGE_GAP = 1.5;         // the dry stretch, in tiles, that two wet runs of one road may have between them and still be one bridge

// ---- the block template (local tiles, before the plan is mirrored for some districts): a core every district shares
export const T = {
  ave: [0, 8, BW, 2], cross: [10, 0, 2, BD],
  walks: [[0, 7, BW, 4], [9, 0, 4, BD]],                    // sidewalk bands (the avenue and cross street are drawn on top)
  keep: [[0, 7, BW, 4], [9, 0, 4, BD]],                     // no building may stand here
  plots: [[0.8, 0.5], [4.4, 0.5], [0.8, 4.0], [4.4, 4.0]], PS: 3,
  ne: [13, 0.8, 8, 4.8], nw: [0.8, 0.6, 8.2, 6.3], se: [13, 12.7, 8.2, 1.5],
  board: [13.6, 6.0, 3, 0.5], hq: [17.8, 14.3, 3, 3], depot: [13.3, 14.6, 3.5, 2.4], door: [11, 15.8],
  leads: [[3, 7.5], [6.2, 7.5], [14.6, 7.5], [17.8, 7.5], [3.6, 10.5], [7, 10.5], [15.6, 10.5], [19, 10.5]],
  lots: Array.from({ length: 8 }, (_, i) => [13.9 + i * 0.98, 11.8]), home: [9.5, 10.5],
  stash: { x: 1.1, y: 11.7, cols: 8, dx: 0.9, dy: 0.9 },
};

// ---- small maths
const sstep = (t) => t * t * (3 - 2 * t);
const vn = (x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = sstep(x - i), fy = sstep(y - j); return lerp(lerp(h2(i, j), h2(i + 1, j), fx), lerp(h2(i, j + 1), h2(i + 1, j + 1), fx), fy); };
export const segDist = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1); return Math.hypot(px - ax - dx * t, py - ay - dy * t); };
export const rectDist = (x, y, r) => Math.hypot(Math.max(r[0] - x, 0, x - (r[0] + r[2])), Math.max(r[1] - y, 0, y - (r[1] + r[3])));
const ov = (a, b, m = 0) => a.x < b.x + b.w + m && a.x + a.w > b.x - m && a.y < b.y + b.d + m && a.y + a.d > b.y - m;
/** A polyline with cumulative lengths, for walking and driving along it. */
export function polyInfo(pts) { const lens = [0]; for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return { pts, lens, len: lens[lens.length - 1] }; }
export function polyAt(P, s) {
  s = clamp(s, 0, P.len); let i = 1; while (i < P.lens.length - 1 && P.lens[i] < s) i++;
  const a = P.pts[i - 1], b = P.pts[i], l = P.lens[i] - P.lens[i - 1] || 1, k = (s - P.lens[i - 1]) / l;
  return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, dx: (b[0] - a[0]) / l, dy: (b[1] - a[1]) / l, s };
}
/** Offset a polyline to the right of its direction of travel (a lane); corners are mitred. */
export function offsetPoly(pts, lane) {
  const nrm = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]; };
  return pts.map((p, i) => {
    const n1 = i > 0 ? nrm(pts[i - 1], p) : nrm(p, pts[Math.min(1, pts.length - 1)]), n2 = i < pts.length - 1 ? nrm(p, pts[i + 1]) : n1, k = 1 / Math.max(0.5, 1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [p[0] + (n1[0] + n2[0]) * lane * k, p[1] + (n1[1] + n2[1]) * lane * k];
  });
}

const OUT = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };

// ---- nothing stands on water: the pad's scenery is a hashed scatter placed while the districts are built, before the land exists (the bays and the lake are carved out of it afterwards), so a tree, a planter or a house could stand in the sea.
/**
 * The kinds of prop that belong on the water, the one exception to "nothing stands in the sea": docks, piers, jetties, boats, ships, barges and buoys (the district plans put them at a quay), and the ferry's gate, which is a boat with a plaque
 * (type 'gate', gk 'ferry'). Their zone is a shore: a water prop stands in the sea at most WATER_REACH tiles from land, never in open water.
 */
export const WATER_PROPS = new Set(['dock', 'pier', 'jetty', 'boat', 'ship', 'barge', 'buoy']);
export const WATER_REACH = 6;
export const isWaterProp = (p) => WATER_PROPS.has(p.t) || (p.t === 'gate' && p.gk === 'ferry');
/** Does any tile of the land mask under the prop's footprint hold water? A sliver of a tile counts; a footprint that ends on a tile's edge is not on the tile beyond it. `isLand(tx, ty)` is the layout's own. */
export function standsOnWater(p, isLand) {
  const E = 1e-6;
  for (let i = Math.floor(p.gx + E); i <= Math.floor(p.gx + p.w - E); i++) for (let j = Math.floor(p.gy + E); j <= Math.floor(p.gy + p.d - E); j++) if (!isLand(i, j)) return true;
  return false;
}
/** Is there land within WATER_REACH tiles (a square ring a tile wider at a time) of the middle of the prop? */
function nearLand(p, isLand) {
  const cx = Math.floor(p.gx + p.w / 2), cy = Math.floor(p.gy + p.d / 2);
  for (let r = 0; r <= WATER_REACH; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && isLand(cx + dx, cy + dy)) return true;
  return false;
}
/**
 * Sort a district's props into those that may stay and those that are in the sea. What stays: everything dry, a prop of the water class that stands by a shore, and a hot spot wherever it is (the headquarters, the depot, the board and the district's
 * feature are the game: a kit that put one in the sea is a failing test, tests/world-placement.test.mjs, not a building that quietly goes missing). What goes, REMOVED and not moved: any prop that is not a hot spot and not of the water class and has a tile of its footprint on water (the pad's scatter that fell in a bay, and a kit-placed prop in the sea: tests/world-placement.test.mjs, PL3, fails on one), and a water prop out in open sea.
 * Removing is deterministic, spends no random number and leaves every other prop where it was; a moved prop would need a free spot clear of the roads, the block, the others and the coast, and the pad's scenery is filler that the district plans retire.
 * Answers { keep, drowned }, `drowned` being small records of what went (kind, place, size, zone and whether it was pad scenery).
 */
export function keepDry(props, isLand) {
  const keep = [], drowned = [];
  for (const p of props) {
    const wet = standsOnWater(p, isLand);
    if (isWaterProp(p) ? !wet || nearLand(p, isLand) : !wet || p.hot) keep.push(p);
    else drowned.push({ t: p.t, gx: p.gx, gy: p.gy, w: p.w, d: p.d, zone: p.zone, pad: !!p.pad });
  }
  return { keep, drowned };
}

function mkProp(D, t, x, y, w, d, h, o, solid) {
  const p = { t, gx: x, gy: y, w, d, h, z: D.z, zone: D.id, key: x + w / 2 + y + d / 2, solid, ...o }, ext = o.ext || 0;
  p.bb = [(x - (y + d)) * 32 - 16 - ext, (x + y) * 16 - D.z - h - 46 - ext, (x + w - y) * 32 + 16 + ext, (x + w + y + d) * 16 - D.z + 14];
  D.props.push(p); return p;
}

function buildDistrict(zones, id, roadSegs) {
  const Z = zones[id], an = ANCHORS[id], ox = an.cx - BW / 2, oy = an.cy - BD / 2, flip = !!an.flip, z = an.z, pad = an.pad;
  const g0 = Z.palette[0], acc = Z.palette[1], l = luma(g0), kit = KITS[Z.theme], ground = kit.ground ? kit.ground(g0) : mix(g0, '#ffffff', clamp((0.3 - l) * 1.5, 0.08, 0.5));
  const cols = { ground, alt: shade(ground, 0.92), road: mix('#2c323e', ground, 0.15), walk: mix(ground, '#cfd5df', 0.42), pad: shade(ground, 0.8), accent: acc, edge: mix(ground, '#000000', 0.4) };
  const fp = [ox - pad[0], oy - pad[1], BW + pad[0] + pad[2], BD + pad[1] + pad[3]];
  const D = { id, name: Z.name, short: Z.short, icon: Z.icon, theme: Z.theme, tier: Z.tier, gate: Z.gate, region: REGIONS.find((r) => r.ids.includes(id))?.id, gateKind: an.gate, ox, oy, w: BW, d: BD, z, flip, cx: an.cx, cy: an.cy, fp, area: fp[2] * fp[3], pad, pal: Z.palette, cols, ground: [], decals: [], props: [], rejected: [], features: [], plots: [] };
  D.ports = { W: [ox, an.cy], E: [ox + BW, an.cy], N: [an.cx, oy], S: [an.cx, oy + BD] };
  const px = (x, w = 0) => ox + (flip ? BW - x - w : x), rc = (x, y, w, d) => [px(x, w), oy + y, w, d], pt = (x, y) => [px(x), oy + y];
  D.pt = pt; D.rc = rc;
  D.ground.push({ x: ox, y: oy, w: BW, d: BD, col: cols.ground, kind: 'block' });
  for (const [x, y, w, d] of T.walks) D.ground.push({ x: ox + x, y: oy + y, w, d, col: cols.walk, kind: 'walk' });
  D.ground.push({ x: ox, y: oy + T.ave[1], w: BW, d: T.ave[3], col: cols.road, kind: 'road' }, { x: ox + T.cross[0], y: oy, w: T.cross[2], d: BD, col: cols.road, kind: 'road' });
  const n = Z.store + 6, srows = Math.ceil(n / T.stash.cols), stashR = rc(0.7, 11.2, 8.2, srows * T.stash.dy + 0.5);
  D.stashRect = stashR; D.ground.push({ x: stashR[0], y: stashR[1], w: stashR[2], d: stashR[3], col: cols.pad, kind: 'pad' });
  D.decals.push({ k: 'rect', x: stashR[0], y: stashR[1], w: stashR[2], d: stashR[3], fill: null, stroke: 'rgba(255,255,255,.28)', min: 0.45 });
  const R = [], K = [];
  for (const q of T.keep) K.push({ x: ox + q[0], y: oy + q[1], w: q[2], d: q[3] });
  K.push({ x: stashR[0], y: stashR[1], w: stashR[2], d: stashR[3] });
  const lotsR = rc(13.4, 11.3, 8.2, 1.0); K.push({ x: lotsR[0], y: lotsR[1], w: lotsR[2], d: lotsR[3] });
  const spots = { leads: T.leads.map(([x, y]) => pt(x, y)), lots: T.lots.map(([x, y]) => pt(x, y)), home: pt(...T.home), stash: { n, cols: T.stash.cols, rows: srows, dx: T.stash.dx, dy: T.stash.dy, pts: [] } };
  for (let i = 0; i < n; i++) spots.stash.pts.push(pt(T.stash.x + (i % T.stash.cols) * T.stash.dx, T.stash.y + Math.floor(i / T.stash.cols) * T.stash.dy));
  D.spots = spots; D.door = pt(...T.door);
  const blocked = (x, y, w, d, m = 0) => x < ox + 0.2 || y < oy + 0.2 || x + w > ox + BW - 0.2 || y + d > oy + BD - 0.2 || K.some((q) => ov({ x, y, w, d }, q)) || R.some((q) => ov({ x, y, w, d }, q, m));
  const A = {
    id, pal: Z.palette, cols, zone: Z, rest: null, NW: null, SE: T.se.slice(),
    r: (i) => h2(id * 131 + 7, i + 1),
    add(t, lx, ly, w, d, h, o = {}) {
      const [x, y, ww, dd] = rc(lx, ly, w, d);
      if (blocked(x, y, ww, dd)) { D.rejected.push({ t, lx, ly }); return null; }
      R.push({ x, y, w: ww, d: dd, t }); return mkProp(D, t, x, y, ww, dd, h, o, true);
    },
    deco(t, lx, ly, w, d, h, o = {}) { const [x, y, ww, dd] = rc(lx, ly, w, d); return mkProp(D, t, x, y, ww, dd, h, o, false); },
    scatter(seed, nn, area, make, margin = 0.9) {
      if (!area) return 0;
      let placed = 0;
      for (let i = 0; placed < nn && i < nn * 60; i++) {
        const lx = area[0] + h2(seed, i * 2) * area[2], ly = area[1] + h2(seed, i * 2 + 1) * area[3], o = make(placed, h2(seed + 5, i)), w = o.w, d = o.d;
        const [x, y] = rc(lx, ly, w, d);
        if (lx + w > area[0] + area[2] || ly + d > area[1] + area[3] || blocked(x, y, w, d, margin * 0.5)) continue;
        if (spots.leads.concat(spots.lots, [spots.home]).some(([sx0, sy0]) => Math.hypot(sx0 - (x + w / 2), sy0 - (y + d / 2)) < margin * 0.6 + 0.4)) continue;
        const { t, ...rest } = o; R.push({ x, y, w, d, t }); mkProp(D, t, x, y, w, d, rest.h ?? 20, rest, true); placed++;
      }
      return placed;
    },
    decal(o) {
      if (o.k === 'ell') { const [cx, cy] = pt(o.x, o.y); D.decals.push({ ...o, x: cx, y: cy }); return; }
      const [x, y, w, d] = rc(o.x, o.y, o.w ?? 0, o.d ?? 0); D.decals.push({ ...o, x, y, w, d });
    },
  };
  let rest = T.ne.slice();
  const rules = Z.rules || {};
  const feat = (key, t, x, y, w, d, h, o, restX) => { const p = A.add(t, x, y, w, d, h, { hot: key, ...o }); if (p) D.features.push(key); if (restX) rest = [restX, T.ne[1], T.ne[0] + T.ne[2] - restX, T.ne[3]]; else if (restX === null) rest = null; return p; };
  if (rules.bank) feat('bank', 'bank', 13.4, 1.0, 4.4, 3.6, 56, { label: 'Commercial Bank' }, 18.4);
  if (rules.audits) feat('audit', 'office', 13.2, 1.1, 3.4, 3.4, 46, { label: 'Regulatory office', color: '#8b93a8', sign: 'AUDIT' }, 16.9);
  if (rules.enterprise) feat('ipo', 'ipo', 13.4, 0.9, 4.2, 4.2, 186, { label: 'IPO and M&A tower' }, 18.3);
  if (rules.rent) feat('rent', 'rentrow', 13.0, 1.0, 8, 3.8, 40, { label: 'Property row', acc, ext: 4 }, null);
  if (rules.arbitrage) feat('exchange', 'exchange', 14.0, 0.3, 7.4, 4.3, 56, { label: 'Exchange hall', acc, ext: 14 }, null); // (0.6 north and 0.9 east of where it stood, 13.1 and 0.9: its portico's steps end before the row of signs at y 5.8, and the market board, which stands east of it in this mirrored district's picture, covers a sliver of its columns)
  A.rest = rest; if (rest && rest[2] > 7.5) A.rest = [rest[0], rest[1], 7.5, rest[3]];
  const hqs = kit.hq || {};
  A.add(hqs.t || 'bldg', ...T.hq, 36, { hot: 'hq:' + id, label: 'Training office', col: hqs.col || cols.accent, acc, win: [3, 2], ...hqs });
  A.add('depot', ...T.depot, 34, { hot: 'depot:' + id, label: 'Freight depot', color: kit.depot || '#5a6a80' });
  A.add('board', ...T.board, 40, { hot: 'board:' + id, label: 'Market board', text: Z.short.toUpperCase(), acc });
  for (let i = 0; i < Z.plots; i++) { const q = rc(T.plots[i][0], T.plots[i][1], T.PS, T.PS); R.push({ x: q[0], y: q[1], w: T.PS, d: T.PS, t: 'plot' }); D.plots.push([q[0], q[1]]); }
  A.NW = Z.plots ? null : T.nw.slice();
  for (const [x, y] of [[9.0, 6.9], [12.4, 6.9], [9.0, 11.0], [12.4, 11.0], [1.5, 7.2], [5.5, 7.2], [15.5, 7.2], [19.5, 7.2], [1.5, 10.7], [5.5, 10.7], [15.5, 10.7], [19.5, 10.7]]) A.deco('lamp', x, y, 0.2, 0.2, 32, { col: kit.lamp, glow: kit.glow, sm: 1 });
  kit.place(A); kit.decals(A);
  // ---- the pad: the district's sprawl round the core, filled with its theme's scenery (kept off every road)
  const pads = [[fp[0], fp[1], pad[0], fp[3]], [ox + BW, fp[1], pad[2], fp[3]], [ox, fp[1], BW, pad[1]], [ox, oy + BD, BW, pad[3]]].filter((q) => q[2] > 0.5 && q[3] > 0.5);
  D.padRects = pads;
  const fill = FILL[Z.theme];
  pads.forEach((q, qi) => {
    const nn = Math.round(q[2] * q[3] * 0.045);
    for (let i = 0, placed = 0; placed < nn && i < nn * 40; i++) {
      const x = q[0] + h2(id * 7 + qi, i * 2) * q[2], y = q[1] + h2(id * 7 + qi, i * 2 + 1) * q[3], o = fill(placed, h2(id * 3 + qi, i)), r = { x, y, w: o.w, d: o.d };
      if (x + o.w > q[0] + q[2] || y + o.d > q[1] + q[3] || R.some((s) => ov(r, s, 0.6)) || roadSegs.some((s) => segDist(x + o.w / 2, y + o.d / 2, s[0], s[1], s[2], s[3]) < s[4] + Math.max(o.w, o.d) * 0.7 + 0.8)) continue;
      const { t, ...rst } = o; R.push({ ...r, t }); mkProp(D, t, x, y, o.w, o.d, rst.h ?? 20, { ...rst, pad: true }, true); placed++;
    }
    if (kit.padDecal) for (const dc of kit.padDecal(q, qi, cols)) D.decals.push({ ...dc, pad: true }); // (a pad's ground treatment is painted under the roads that cross it: groundart.js)
  });
  D.props.sort((a, b) => a.key - b.key);
  D.bb = [(fp[0] - (fp[1] + fp[3])) * 32 - 40, (fp[0] + fp[1]) * 16 - z - 250, (fp[0] + fp[2] - fp[1]) * 32 + 40, (fp[0] + fp[2] + fp[1] + fp[3]) * 16 - z + 40];
  return D;
}

/** Build the whole island for a set of zones (the sixteen districts of js/data). Pure and deterministic. `water: false` leaves the props that fell on water where the districts put them (the island as it was; tests/world-placement.test.mjs diffs against it). */
export function buildLayout(zones = ZONES, { water = true } = {}) {
  const ids = Object.keys(zones).map(Number).sort((a, b) => a - b);
  // ---- ports and roads first (the pads need to stay off the roads)
  const PORT = {};
  for (const id of ids) { const an = ANCHORS[id], ox = an.cx - BW / 2, oy = an.cy - BD / 2; PORT[id + '.W'] = [ox, an.cy]; PORT[id + '.E'] = [ox + BW, an.cy]; PORT[id + '.N'] = [an.cx, oy]; PORT[id + '.S'] = [an.cx, oy + BD]; PORT[id + '.C'] = [an.cx, an.cy]; }
  const node = (name) => PORT[name] || (JUNCTIONS[name] && JUNCTIONS[name].at) || (HEADS[name] && HEADS[name].at) || VIEWPOINTS[name] || null;
  const edges = [];
  for (const r of ROADS) {
    const A = node(r.a), B = node(r.b); if (!A || !B) continue;
    const oa = OUT[r.a.split('.')[1]], ob = OUT[r.b.split('.')[1]], pts = [A.slice()];
    if (oa) pts.push([A[0] + oa[0] * 3, A[1] + oa[1] * 3]);
    for (const v of r.via || []) pts.push(v.slice());
    if (ob) pts.push([B[0] + ob[0] * 3, B[1] + ob[1] * 3]);
    pts.push(B.slice());
    edges.push({ ...r, ...polyInfo(r.ferry ? pts : fillet(tidy(pts), r.path ? PATH_RADIUS : ROAD_RADIUS)), plan: pts, w: r.path ? 1 : 2, n: edges.length, ja: !!JUNCTIONS[r.a], jb: !!JUNCTIONS[r.b] }); // (`plan`: the corners as drawn; the land and the scenery keep off those; `ja`, `jb`: the edge starts, ends at a junction)
  }
  const roadSegs = []; for (const e of edges) if (!e.ferry) for (let i = 0; i + 1 < e.plan.length; i++) roadSegs.push([e.plan[i][0], e.plan[i][1], e.plan[i + 1][0], e.plan[i + 1][1], e.w / 2]);
  const districts = {}; for (const id of ids) districts[id] = buildDistrict(zones, id, roadSegs);
  const ds = ids.map((id) => districts[id]);
  // ---- the land: districts and roads give it body, blobs add peninsulas and islets, water is carved out of it, noise roughens the coast
  const fieldAt = (x, y) => {
    let v = -1;
    for (const D of ds) v = Math.max(v, 1 - rectDist(x, y, D.fp) / 4.5);
    for (const s of roadSegs) v = Math.max(v, 1 - segDist(x, y, s[0], s[1], s[2], s[3]) / (s[4] > 0.6 ? 4 : 2));
    for (const b of BLOBS) v = Math.max(v, 1 - Math.hypot((x - b[0]) / b[2], (y - b[1]) / b[3]));
    v += (vn(x * 0.06, y * 0.06) - 0.5) * 0.55 + (vn(x * 0.17 + 7, y * 0.17) - 0.5) * 0.22;
    for (const D of ds) if (rectDist(x, y, D.fp) < 2.2) v = Math.max(v, 0.5);
    for (const c of CARVES.ellipses) v = Math.min(v, (Math.hypot((x - c[0]) / c[2], (y - c[1]) / c[3]) - 1) * 0.6 + (vn(x * 0.2, y * 0.2) - 0.5) * 0.12);
    for (const r of CARVES.rivers) { let d = 1e9; for (let i = 0; i + 1 < r.pts.length; i++) d = Math.min(d, segDist(x, y, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1])); v = Math.min(v, (d / r.r - 1) * 0.6 + (vn(x * 0.2 + 3, y * 0.2) - 0.5) * 0.12); }
    return v;
  };
  const VW = GW + 1, FV = new Float32Array(VW * (GH + 1)), ZV = new Float32Array(VW * (GH + 1));
  for (let j = 0; j <= GH; j++) for (let i = 0; i <= GW; i++) {
    const v = fieldAt(i, j); FV[j * VW + i] = v;
    let num = 0, den = 0; for (const D of ds) { const dd = Math.hypot(i - D.cx, j - D.cy), w = 1 / (1 + (dd / 22) ** 2) ** 2; num += w * D.z; den += w; }
    let zz = num / den + (vn(i * 0.05 + 3, j * 0.05) - 0.5) * 14 + (vn(i * 0.13, j * 0.13 + 9) - 0.5) * 5;
    zz *= sstep(clamp(v / 0.22, 0, 1));
    for (const D of ds) { const d = rectDist(i, j, D.fp); if (d < SKIRT) zz = lerp(D.z, zz, sstep(d / SKIRT)); }
    ZV[j * VW + i] = v > 0 ? Math.max(0.5, zz) : 0;
  }
  gradeRoads(ZV, FV, VW, GH + 1, edges); // the ground under every road is graded: a smooth profile that follows the land's large shape and none of its steps (roadshape.js)
  const land = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) land[j * GW + i] = (FV[j * VW + i] + FV[j * VW + i + 1] + FV[(j + 1) * VW + i] + FV[(j + 1) * VW + i + 1]) / 4 > 0 ? 1 : 0;
  const isLand = (tx, ty) => tx >= 0 && ty >= 0 && tx < GW && ty < GH && land[ty * GW + tx] === 1;
  const lands = {}; for (const s of [2, 4, 8]) { const w = Math.ceil(GW / s), a = new Uint8Array(w * Math.ceil(GH / s)); for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) if (land[j * GW + i]) a[Math.floor(j / s) * w + Math.floor(i / s)] = 1; lands[s] = { a, w }; }
  // ---- nothing stands on water: the districts were built before the land existed, so the pad's scatter may have fallen in a bay or the lake; it is removed here (keepDry), and the list of what went is kept
  const drowned = [];
  // (the guard runs after the terminations have kept the pad's scatter off the ends of the streets: what stood where an end is built is gone from both islands, with the guard and without it)
  let maxZ = 0; for (let k = 0; k < ZV.length; k++) maxZ = Math.max(maxZ, ZV[k]);
  const core = new Uint8Array(GW * GH); for (const D of ds) for (let j = Math.floor(D.oy); j < D.oy + BD; j++) for (let i = Math.floor(D.ox); i < D.ox + BW; i++) core[j * GW + i] = 1;
  let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) if (land[j * GW + i]) { const x = (i - j) * 32, y = (i + j) * 16 - ZV[j * VW + i]; bx0 = Math.min(bx0, x - 32); bx1 = Math.max(bx1, x + 64); by0 = Math.min(by0, y); by1 = Math.max(by1, y + 32 + SEA); }
  const bounds = { x0: bx0 - 80, x1: bx1 + 80, y0: by0 - 260, y1: by1 + 60 };
  // ---- tile colours: terrain by height and slope, tinted towards the nearest district; steep ground goes to rock; relief shading from the upper left
  const tcol = new Array(GW * GH), owner = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    if (!land[j * GW + i]) continue;
    const z00 = ZV[j * VW + i], z10 = ZV[j * VW + i + 1], z01 = ZV[(j + 1) * VW + i], z11 = ZV[(j + 1) * VW + i + 1], zm = (z00 + z10 + z01 + z11) / 4, slope = Math.max(z00, z10, z01, z11) - Math.min(z00, z10, z01, z11);
    let nd = null, dd = 1e9; for (const D of ds) { const d = rectDist(i + 0.5, j + 0.5, D.fp); if (d < dd) { dd = d; nd = D; } }
    const nz = vn(i * 0.3, j * 0.3) - 0.5;
    let base = zm < 2.6 ? '#cdbb8e' : zm < 30 ? mix('#4b7a4e', '#5e7a4a', zm / 30) : mix('#5e7a4a', '#8a8a78', clamp((zm - 30) / 70, 0, 1));
    if (slope > 6) base = mix(base, '#7d7568', clamp((slope - 6) / 8, 0, 0.9));
    base = mix(base, REGIONS.find((r) => r.ids.includes(nd.id)).tint, 0.12);
    const inside = dd === 0, w = inside ? 0.8 + nz * 0.3 : clamp(1 - dd / 15, 0, 1) * 0.65 + nz * 0.2;
    if (w > 0.02 && zm >= 2.6) base = mix(base, nd.cols.ground, clamp(w, 0, 0.92));
    if (inside) owner[j * GW + i] = nd.id;
    tcol[j * GW + i] = shade(base, clamp(1 + (z00 - z11) * 0.014, 0.8, 1.2) + nz * 0.05);
  }
  // ---- coast cliffs: wherever land meets water with a drop of more than a beach
  const cliffs = [];
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    if (!land[j * GW + i]) continue;
    if (!isLand(i, j + 1)) { const a = ZV[(j + 1) * VW + i], b = ZV[(j + 1) * VW + i + 1]; if (Math.max(a, b) > 3) cliffs.push({ k: 's', x: i, y: j + 1, za: a, zb: b, bb: [(i - j - 1) * 32, (i + j + 1) * 16 - Math.max(a, b) - 2, (i - j) * 32, (i + j + 2) * 16 + SEA + 2] }); }
    if (!isLand(i + 1, j)) { const a = ZV[j * VW + i + 1], b = ZV[(j + 1) * VW + i + 1]; if (Math.max(a, b) > 3) cliffs.push({ k: 'e', x: i + 1, y: j, za: a, zb: b, bb: [(i - j) * 32, (i + 1 + j) * 16 - Math.max(a, b) - 2, (i + 1 - j) * 32, (i + j + 2) * 16 + SEA + 2] }); }
  }
  // ---- heights (bilinear on the vertex grid; a bridge deck overrides the water under it)
  const bilin = (gx, gy) => { const x = clamp(gx, 0, GW - 1e-6), y = clamp(gy, 0, GH - 1e-6), i = x | 0, j = y | 0, fx = x - i, fy = y - j; return lerp(lerp(ZV[j * VW + i], ZV[j * VW + i + 1], fx), lerp(ZV[(j + 1) * VW + i], ZV[(j + 1) * VW + i + 1], fx), fy); };
  const bridges = []; // the stretches of a road that cross water (the ferry sails instead): ONE run to a crossing, a sandbar of a tile or less in the middle of the water does not end the bridge and start another (8.W to 9.E was two bridges that touched)
  for (const e of edges) {
    if (e.ferry || e.path) continue;
    let run = null, last = null;
    const close = () => { if (last && run.s0 - last.s1 <= BRIDGE_GAP) { last.s1 = run.s1; } else { bridges.push(run); last = run; } run = null; };
    // (the road is looked at every quarter tile and a run's ends are put out to the half tile, so a sliver of water between two samples half a tile apart is not missed and a bridge starts and ends where it always did)
    for (let k = 0; k * 0.25 <= e.len + 0.01; k++) { const s = k * 0.25, p = polyAt(e, s), wet = !isLand(Math.floor(p.x), Math.floor(p.y)); if (wet && !run) run = { s0: Math.max(0, Math.floor((s - 0.5) * 2) / 2), edge: e }; if (!wet && run) { run.s1 = Math.ceil(s * 2) / 2; close(); } }
    if (run) { run.s1 = e.len; close(); }
  }
  /** The height of a road's surface at arc length s (the graded profile of roadshape.js); NaN for an edge with none (the ferry). Over a bridge the deck's own height is `zAt`. */
  const roadZ = (e, s) => { const q = e.zprof; if (!q) return NaN; const k = clamp(s / q.step, 0, q.z.length - 1), i = Math.min(Math.floor(k), q.z.length - 2), f = k - i; return q.z[i] * (1 - f) + q.z[i + 1] * f; };
  for (const b of bridges) { b.z0 = Math.max(0.6, roadZ(b.edge, Math.max(0, b.s0 - 1))); b.z1 = Math.max(0.6, roadZ(b.edge, Math.min(b.edge.len, b.s1 + 1))); b.pts = []; for (let s = b.s0; s <= b.s1 + 0.01; s += 1) { const p = polyAt(b.edge, Math.min(s, b.s1)); b.pts.push([p.x, p.y]); } b.info = polyInfo(b.pts); b.gate = b.edge.gate; }
  const deck = (b, t) => lerp(b.z0, b.z1, t) + 7 * Math.sin(clamp(t, 0, 1) * Math.PI);
  const bridgeZ = (gx, gy) => { for (const b of bridges) { const pi = b.info; for (let i = 0; i + 1 < pi.pts.length; i++) { const a = pi.pts[i], c = pi.pts[i + 1]; if (Math.abs(gx - a[0]) > 3 || Math.abs(gy - a[1]) > 3) continue; if (segDist(gx, gy, a[0], a[1], c[0], c[1]) < 1.4) return deck(b, (pi.lens[i] + Math.hypot(gx - a[0], gy - a[1])) / (pi.len || 1)); } } return null; };
  const zAt = (gx, gy) => { const b = bridges.length ? bridgeZ(gx, gy) : null; return b !== null ? b : bilin(gx, gy); };
  const zoneAt = (gx, gy) => { for (const D of ds) if (gx >= D.ox && gx < D.ox + BW && gy >= D.oy && gy < D.oy + BD) return D.id; return 0; };
  const footAt = (gx, gy) => { for (const D of ds) if (gx >= D.fp[0] && gx < D.fp[0] + D.fp[2] && gy >= D.fp[1] && gy < D.fp[1] + D.fp[3]) return D.id; return 0; };
  // ---- the walking graph: a district's centre joins its four ports, roads join ports to ports (a port shared by two roads is a fork)
  const adj = new Map(), nodes = new Map(), link = (a, b, len, gate, e) => { (adj.get(a) || adj.set(a, []).get(a)).push({ to: b, len, gate, e }); (adj.get(b) || adj.set(b, []).get(b)).push({ to: a, len, gate, e }); };
  for (const id of ids) for (const P of ['W', 'E', 'N', 'S']) { nodes.set(id + '.' + P, PORT[id + '.' + P]); nodes.set(id + '.C', PORT[id + '.C']); link(id + '.C', id + '.' + P, Math.hypot(PORT[id + '.C'][0] - PORT[id + '.' + P][0], PORT[id + '.C'][1] - PORT[id + '.' + P][1]), id, null); }
  for (const e of edges) { nodes.set(e.a, node(e.a)); nodes.set(e.b, node(e.b)); link(e.a, e.b, e.len, e.gate, e); }
  const walk = (a, b, open) => { // shortest route over open roads; returns the steps
    const dist = new Map([[a, 0]]), prev = new Map(), todo = new Set([a]);
    while (todo.size) { let u = null; for (const n of todo) if (u === null || dist.get(n) < dist.get(u)) u = n; todo.delete(u); if (u === b) break; for (const k of adj.get(u) || []) { if (open && !open.has(k.gate)) continue; const nd = dist.get(u) + k.len; if (!dist.has(k.to) || nd < dist.get(k.to)) { dist.set(k.to, nd); prev.set(k.to, { from: u, k }); todo.add(k.to); } } }
    if (!dist.has(b)) return null;
    const out = []; for (let n = b; n !== a;) { const p = prev.get(n); out.unshift({ from: p.from, to: n, e: p.k.e }); n = p.from; } return out;
  };
  const assemble = (steps, start) => { const pts = [nodes.get(start).slice()]; for (const s of steps) { if (s.e) { const P = s.e.a === s.from ? s.e.pts : [...s.e.pts].reverse(); for (let i = 1; i < P.length; i++) pts.push(P[i].slice()); } else pts.push(nodes.get(s.to).slice()); } return pts; };
  const route = (a, b, open) => { const steps = walk(a + '.C', b + '.C', open); return steps ? assemble(steps, a + '.C') : null; };
  // ---- the entry of each district: the road that opens with it, and where that road meets it (the notch of the district's cloud: its gate used to stand here, ten tiles out; the gates stand at the open ends now, below)
  // (a name stands for a port: a junction for the port its stem leaves, so a road that ends at the fork is a road into that district; the point is ten tiles from the port along the road in, the stem counted in that ten)
  const portOf = (name) => (JUNCTIONS[name] ? JUNCTIONS[name].port : name), belongs = (name, id) => portOf(name).startsWith(id + '.');
  const stemLen = (name) => { const st = edges.find((q) => q.stem && (q.a === name || q.b === name)); return st ? st.len : 0; };
  for (const D of ds) {
    const e = edges.find((q) => q.gate === D.id && !q.path && !q.stem && (belongs(q.a, D.id) || belongs(q.b, D.id))) || null, port = e ? (belongs(e.a, D.id) ? portOf(e.a) : portOf(e.b)) : D.id + '.W', P0 = node(port), out = OUT[port.split('.')[1]];
    D.entry = [P0[0] - out[0] * 0.8, P0[1] - out[1] * 0.8]; D.entryPort = port; D.inEdge = e ? e.n : null; D.gates = [];
    if (D.id === 1 || !e) continue;
    const rev = !belongs(e.a, D.id);          // the edge is stored from the previous district to this one
    const lead = stemLen(rev ? e.b : e.a), run = Math.max(0, 10 - lead); // (the tiles of the ten that are the edge's own: a fork's stem is the rest)
    const br = bridges.find((q) => q.edge === e), s = br ? (rev ? br.s0 - 1 : br.s1 + 1) : e.ferry ? (rev ? 3 : e.len - 3) : (rev ? e.len - run : run);
    const q = polyAt(e, clamp(s, 0, e.len)), dir = rev ? 1 : -1;
    D.gateAt = { x: q.x, y: q.y, hx: q.dx * dir, hy: q.dy * dir, kind: D.gateKind, edge: e.n };
  }
  // ---- gates (WP11): a gate stands on EVERY road that opens with a locked district whose gate is not fog, at the road's OPEN end: 3 tiles along it from the port of the district the player already owns, just past the apron (2 beside the node of a fork it leaves), and not ten tiles
  // before the district it guards, which on an 84-tile road left 74 tiles of it looking open; the four roads that open with a later district (4.E to 3.N, 4.E to 5.W, 6.N to 7.E, 10.N to 14.S) have theirs now. The gate belongs to the district it guards
  // (it is locked and opens with it) and stands in the open neighbour's ground: it is `own` (culled by its own box) and takes the light and the veil of the district it stands in (`fz`). A bridge's leaf stands at the bank on the open side, a ferry's boat 3 tiles in.
  const GATE_FIRST = 3, GATE_FORK = 2;
  for (const e of edges) {
    if (e.stem || e.path) continue; const D = districts[e.gate]; if (!D || D.gateKind === 'fog') continue;
    const da = +portOf(e.a).split('.')[0], db = +portOf(e.b).split('.')[0], atA = da !== D.id ? (db !== D.id ? da < db : true) : false, open = atA ? da : db, from = atA ? e.a : e.b, far = node(atA ? e.b : e.a);
    const bs = bridges.filter((q) => q.edge === e), br = bs.length ? bs.reduce((m, q) => ((atA ? q.s0 < m.s0 : q.s1 > m.s1) ? q : m)) : null;
    const sOpen = e.ferry ? 3 : D.gateKind === 'bridge' && br ? (atA ? br.s0 - 1 : br.s1 + 1) : JUNCTIONS[from] ? GATE_FORK : GATE_FIRST, s = atA ? sOpen : e.len - sOpen;
    const q = polyAt(e, clamp(s, 0.5, e.len - 0.5)), dir = atA ? 1 : -1, hx = q.dx * dir, hy = q.dy * dir;
    const p = mkProp(D, 'gate', q.x - 0.15, q.y - 0.15, 0.3, 0.3, 16, { gk: D.gateKind, hx, hy, fx: far[0], fy: far[1], label: D.name + ' (locked)', ext: 70, own: 1, fz: open, gi: D.gates.length }, false);
    p.z = zAt(q.x, q.y); p.bb = [(q.x - q.y) * 32 - 90, (q.x + q.y) * 16 - p.z - 80, (q.x - q.y) * 32 + 90, (q.x + q.y) * 16 - p.z + 40];
    D.gates.push({ x: q.x, y: q.y, hx, hy, kind: D.gateKind, edge: e.n, open, from, s, prop: p });
  }
  for (const D of ds) D.gates.sort((a, b) => (b.edge === D.inEdge) - (a.edge === D.inEdge) || a.edge - b.edge); // (the road in first: its gate is the district's own)
  // ---- lookouts at the ends of the footpaths: a deck of 2 by 2 tiles (ground art, drawn in every tier: groundart.js) with a rail on the three sides the path does not come in by, and on it, as a small prop, a bench and a telescope
  const decks = [];
  for (const [name, [x, y]] of Object.entries(VIEWPOINTS)) {
    const e = edges.find((q) => q.b === name), D = districts[e?.gate]; if (!D) continue;
    const end = polyAt(e, e.len), inSide = Math.abs(end.dx) >= Math.abs(end.dy) ? (end.dx > 0 ? 'W' : 'E') : (end.dy > 0 ? 'N' : 'S'); // the side the path comes in by
    const p = mkProp(D, 'lookout', x - 0.5, y - 0.5, 1, 1, 14, { label: 'Lookout', sm: 1, own: 1, inSide }, false); p.z = zAt(x, y); p.bb = [(x - y - 1) * 32 - 20, (x + y) * 16 - p.z - 60, (x - y + 1) * 32 + 20, (x + y + 1) * 16 - p.z + 14];
    decks.push({ name, edge: e.n, district: D.id, x, y, inSide, prop: p, ...deckOf(x, y, inSide, zAt) });
  }
  // ---- terminations (WP12): a street that no road leaves ends in a place. Each is derived from the ground beyond its port and the district's theme (roadshape.js chooseTerm; the rule is in docs/ART_DIRECTION.md section 4.7) unless island.js TERMS chose it by hand; the
  // registry says what stands there (ground pieces, props, the room kept clear of the pad's scatter) and where a car would turn round (turnSpots, for the traffic work). Ground art: groundart.js drawTerms; props: the dressing of each shape.
  const probeEnd = (D, f) => { // what lies beyond a port on its street's axis: the tiles of level ground (land within 6 px of the block's height), the tile where the sea begins and how far the ground stands above it, and whether a wall of rock rises within 4 tiles
    let flat = 0, water = null, rise = 0, level = true, fall = false;
    for (let u = 0.25; u <= 14; u += 0.25) {
      const [x, y] = framePoint(f, u, 0); if (!isLand(Math.floor(x), Math.floor(y))) { water = u; if (level) fall = true; break; }
      const dz = zAt(x, y) - D.z; if (u <= 4) rise = Math.max(rise, dz); if (level) { if (Math.abs(dz) <= 6) flat = u; else { level = false; fall = dz < 0; } }
    }
    const [wx, wy] = water === null ? [0, 0] : framePoint(f, water - 0.25, 0);
    return { flat, water, drop: water === null ? null : zAt(wx, wy), hill: rise >= 20, fall }; // (`fall`: the level ground ends in a drop or the sea, not a slope up)
  };
  const roomFor = (D, f, side, segs) => (kind, opt = {}) => { // does the shape of `kind` find its room here: land, level, outside every block, clear of every road (`segs`: the road legs within 18 tiles of the port, the only ones that can be in the way)?
    const sh = shapeOf(kind, { theme: D.theme, side, ...opt });
    for (const r of sh.foot) for (let u = r.u0; u <= r.u1 + 1e-9; u += 0.5) for (let v = r.v0; v <= r.v1 + 1e-9; v += 0.5) {
      const [x, y] = framePoint(f, u, v); if (!isLand(Math.floor(x), Math.floor(y)) || Math.abs(zAt(x, y) - D.z) > 6) return false;
      if (u > 0.3) { if (zoneAt(x, y)) return false; for (const sg of segs) if (segDist(x, y, sg[0], sg[1], sg[2], sg[3]) < sg[4] + 0.5) return false; }
    }
    return true;
  };
  const boxOf = (pieces) => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const q of pieces) for (const [x, y, zz] of q.pts) { x0 = Math.min(x0, (x - y) * 32); x1 = Math.max(x1, (x - y) * 32); y0 = Math.min(y0, (x + y) * 16 - zz); y1 = Math.max(y1, (x + y) * 16 - zz); } return [x0 - 10, y0 - 70, x1 + 10, y1 + 24]; }; // the box of a drawing on the screen: its ground and the room above it for a rail or a post
  const rebox = (p, z) => { p.z = z; p.bb = [(p.gx - (p.gy + p.d)) * 32 - 16 - (p.ext || 0), (p.gx + p.gy) * 16 - z - p.h - 46 - (p.ext || 0), (p.gx + p.w - p.gy) * 32 + 16 + (p.ext || 0), (p.gx + p.w + p.gy + p.d) * 16 - z + 14]; };
  const mkEndProps = (D, f, specs, term) => specs.flatMap((sp) => { // the dressing: a spec is a place and a size in the frame of its port; the grid footprint is its axis-aligned box (a prop that would stand in the sea is left out: nothing stands on water)
    const [cx, cy] = framePoint(f, sp.u, sp.v), alongX = f.ux !== 0, w = alongX ? sp.a : sp.b, d = alongX ? sp.b : sp.a, o = { ...sp.o, own: 1, term };
    if (standsOnWater({ gx: cx - w / 2, gy: cy - d / 2, w, d }, isLand)) return [];
    if (['roadend', 'farmgate', 'portal'].includes(sp.t)) { o.hx = f.ux; o.hy = f.uy; }
    if (sp.t === 'fence') { o.dirY = (sp.o.along === 'v') === alongX; delete o.along; }
    if (sp.t === 'lamp') o.col = KITS[D.theme].lamp;
    if (['lamp', 'bench', 'bollard', 'planter', 'hay', 'trough', 'crates', 'barrel', 'polesign', 'trailboard', 'flag', 'tree'].includes(sp.t)) o.sm = 1;
    const p = mkProp(D, sp.t, cx - w / 2, cy - d / 2, w, d, sp.h, o, false); rebox(p, zAt(cx, cy)); return [p];
  });
  const BUILT = new Set(['bldg', 'shop', 'depot', 'factory', 'barn', 'hall', 'office', 'bank', 'shack', 'stall', 'kiosk', 'tower', 'manor', 'rack', 'rentrow', 'exchange', 'ipo']);
  const builtNear = (pt) => ds.some((D) => D.props.some((p) => p.solid && BUILT.has(p.t) && Math.hypot(p.gx + p.w / 2 - pt[0], p.gy + p.d / 2 - pt[1]) < 6.5));
  const connectedPorts = new Set(edges.filter((e) => !e.path).flatMap((e) => [e.a, e.b])), pathPorts = new Set(edges.filter((e) => e.path).map((e) => e.a));
  const terms = [], turnSpots = [], keeps = [];
  for (const D of ds) for (const side of ['W', 'E', 'N', 'S']) {
    const port = D.id + '.' + side; if (connectedPorts.has(port)) continue; // (a road or the ferry leaves it: the apron's)
    const [px, py] = D.ports[side], f = portFrame(side, px, py), street = side === 'W' || side === 'E' ? 'avenue' : 'cross', probe = probeEnd(D, f), authored = TERMS[port] || null;
    const fitsHere = roomFor(D, f, side, roadSegs.filter((sg) => segDist(px, py, sg[0], sg[1], sg[2], sg[3]) < sg[4] + 18)), pick = chooseTerm({ side, theme: D.theme, street, ...probe, path: pathPorts.has(port), authored }, fitsHere), opt = { theme: D.theme, side, ...pick.opt, water: probe.water === null ? undefined : probe.water };
    if (pick.kind === 'bulb' && builtNear(framePoint(f, 2.7, 0)) && fitsHere('bulb', { bays: true })) opt.bays = true; // a building stands near the end: two parking bays off the turning circle
    if (wantsRail(pick.kind, shapeOf(pick.kind, opt), probe.flat, probe.fall)) { opt.rail = true; opt.flat = probe.flat; } // the plateau falls away just beyond it: a rail across the far side
    const sh = shapeOf(pick.kind, opt), to = (u, v) => framePoint(f, u, v), z = (x, y) => zAt(x, y) + 0.4;
    const pieces = sh.pieces.map((q) => ({ role: q.role, pts: q.pts.map(([u, v]) => { const [x, y] = to(u, v); return [x, y, z(x, y)]; }) }));
    const foot = sh.foot.map((r) => frameRect(f, r.u0, r.u1, r.v0, r.v1)), keep = sh.foot.map((r) => frameRect(f, r.u0 - 0.2, r.u1 + 0.5, r.v0 - 0.5, r.v1 + 0.5));
    const [tx, ty] = to(sh.turn.u, sh.turn.v);
    const T = { id: port, port, district: D.id, side, theme: D.theme, street, kind: pick.kind, why: pick.why, authored: !!authored, opt, probe, frame: f, pieces, foot: foot.map((r) => ({ ...r })), frameFoot: sh.foot, keep, door: sh.door ? to(sh.door.u, sh.door.v) : null, props: [], bb: boxOf(pieces), turn: sh.turn, specs: sh.props };
    terms.push(T); keeps.push(...keep);
    turnSpots.push({ id: port, port, district: D.id, kind: pick.kind, x: tx, y: ty, r: sh.turn.r, hx: f.ux, hy: f.uy, open: sh.turn.open, ring: !!sh.turn.ring });
  }
  const hits = (p, k) => p.gx < k.x + k.w && p.gx + p.w > k.x && p.gy < k.y + k.d && p.gy + p.d > k.y;
  const gaps = terms.map((T) => frameRect(T.frame, -0.6, 1.8, -1.5, 1.5)); // (and a run of pickets that crossed the street's mouth, the scrap yard's along the hill, is open there: the street goes through)
  for (const D of ds) D.props = D.props.filter((p) => !(p.pad && keeps.some((k) => hits(p, k))) && !(p.t === 'fence' && gaps.some((k) => hits(p, k)))); // the pad's scatter is kept off every end (it is hashed: it knows the roads, not what a street's end needs)
  if (water) for (const D of ds) { const r = keepDry(D.props, isLand); D.props = r.keep; D.drowned = r.drowned; drowned.push(...r.drowned); } else for (const D of ds) D.drowned = [];
  for (const T of terms) T.props = mkEndProps(districts[T.district], T.frame, T.specs, T.port);
  const heads = []; // a path head beside a road (island.js HEADS): the dropped kerb over the road's kerb, two bollards across the path, a board and a bench
  for (const [name, H] of Object.entries(HEADS)) {
    const path = edges.find((q) => q.b !== undefined && q.a === name && q.path), D = path && districts[path.gate]; if (!D) continue;
    const a = path.pts[0], b = path.pts[1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / l, uy = (b[1] - a[1]) / l, f = { x: a[0] - ux * 2, y: a[1] - uy * 2, ux, uy, vx: -uy, vy: ux }, sh = headShape();
    const pieces = sh.pieces.map((q) => ({ role: q.role, pts: q.pts.map(([u, v]) => { const [x, y] = framePoint(f, u, v); return [x, y, zAt(x, y) + 0.4]; }) }));
    const H2 = { name, district: D.id, edge: path.n, port: H.port, kind: 'sidehead', frame: f, pieces, specs: sh.props, props: [], bb: boxOf(pieces) };
    H2.props = sh.props.flatMap((sp) => { // (a board or a bench that would stand in the water is tried on the other side of the path, then nearer the road, and left out when there is no dry place for it)
      const sq = Math.max(sp.a, sp.b, 0.3), o = { ...sp.o, own: 1, term: name, sm: 1 };
      for (const [du, dv] of [[0, 0], [0, -2 * sp.v], [-0.7, 0], [-0.7, -2 * sp.v]]) { const [cx, cy] = framePoint(f, sp.u + du, sp.v + dv); if (standsOnWater({ gx: cx - sq / 2, gy: cy - sq / 2, w: sq, d: sq }, isLand)) continue; const p = mkProp(D, sp.t, cx - sq / 2, cy - sq / 2, sq, sq, sp.h, o, false); rebox(p, zAt(cx, cy)); return [p]; }
      return [];
    });
    keeps.push(...H2.props.map((p) => ({ x: p.gx - 0.4, y: p.gy - 0.4, w: p.w + 0.8, d: p.d + 0.8 })));
    heads.push(H2);
  }
  for (const dk of decks) dk.bb = boxOf(dk.pieces);
  for (const D of ds) { D.props.sort((a1, b1) => a1.key - b1.key); D.free = D.props.filter((p) => p.own); }
  const props = ids.flatMap((id) => districts[id].props).sort((a, b) => a.key - b.key);
  return {
    districts, ids, edges, bridges, nodes, land, isLand, lands, ZV, VW, FV, tcol, owner, core, cliffs, props, drowned, maxZ, roadSegs, zAt, roadZ, zoneAt, footAt, route, deck, bounds, terms, turnSpots, heads, decks,
    spots: Object.fromEntries(ids.map((id) => [id, districts[id].spots])),
    plots: Object.fromEntries(ids.map((id) => [id, districts[id].plots])),
    doors: Object.fromEntries(ids.map((id) => [id, districts[id].door])),
    stashPos(z, i) {
      const sp = districts[z].spots.stash;
      if (i < sp.n) return sp.pts[i];
      const k = i - sp.n, a = k * 2.399, r = 1.1 + 0.4 * Math.sqrt(k), [hx, hy] = districts[z].spots.home; // overflow: a small pile by the player's spot
      return [hx + Math.cos(a) * r, hy + Math.sin(a) * r * 0.7];
    },
    /** Freight route between two districts' depot doors over the open roads: down the cross street, along the roads (right-hand lane), up the other one. */
    truckRoute(a, b, open) {
      const A = districts[a], B = districts[b], r = route(a, b, open); if (!r) return null;
      const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
      const mid = r.slice(same(r[1], PORT[a + '.S']) ? 1 : 0, r.length - (same(r[r.length - 2], PORT[b + '.S']) ? 1 : 0));
      return [A.door.slice(), ...offsetPoly(mid, 0.5), B.door.slice()];
    },
    /** Waypoints for the player walking from district `from` to the home spot of district `to` (null if the roads are not open). */
    playerRoute(from, to, open) { const r = route(from, to, open); return r ? [...offsetPoly(r, 0.9), districts[to].spots.home.slice()] : null; },
  };
}

export const LAYOUT = buildLayout(ZONES);
export const DIST = LAYOUT.districts, SPOTS = LAYOUT.spots, PLOTS = LAYOUT.plots, DOORS = LAYOUT.doors, SCENERY = LAYOUT.props, EDGES = LAYOUT.edges;
export const stashPos = (z, i) => LAYOUT.stashPos(z, i);
export const zAt = LAYOUT.zAt, roadZ = LAYOUT.roadZ, zoneAt = LAYOUT.zoneAt, footAt = LAYOUT.footAt;
export const inLand = (gx, gy) => LAYOUT.isLand(Math.floor(gx), Math.floor(gy));
/** Is (gx, gy) on a road or sidewalk of a block, or on one of the roads between districts? */
export function isRoad(gx, gy) {
  const z = zoneAt(gx, gy);
  if (z) { const D = DIST[z], lx = gx - D.ox, ly = gy - D.oy; return (ly >= 7 && ly < 11) || (lx >= 9 && lx < 13); }
  return LAYOUT.roadSegs.some((s) => segDist(gx, gy, s[0], s[1], s[2], s[3]) <= s[4] + 0.2);
}
