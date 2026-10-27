// The 2.5D world of sixteen districts: projection maths, the generated island's layout invariants (footprints, reachability, capacity, plots,
// determinism, sixteen distinct looks), and headless draws against a recording canvas (every district, mode, hour, shock, locked or open).
import test from 'node:test';
import assert from 'node:assert/strict';
import { sx, sy, P, toGrid, hash, h2 } from '../js/world/iso.js';
import * as L from '../js/world/layout.js';
import { REGIONS } from '../js/world/island.js';
import { KITS } from '../js/world/kits.js';
import { DRAW } from '../js/world/props.js';
import { ZONES, ZONE_IDS } from '../js/data/index.js';
import { THEMES } from '../js/data/schema.js';
import { ASSETS, BUYERS } from '../js/config.js';
import { Game } from '../js/engine.js';

const { LAYOUT, DIST, SPOTS, PLOTS, SCENERY, T, BW, BD, GW, GH, zAt, zoneAt } = L;
const noop = () => {};
const grad = { addColorStop: noop };
function fakeCtx(log) {
  const t = { measureText: (s) => ({ width: String(s).length * 6 }), createLinearGradient: () => grad, createRadialGradient: () => grad, getTransform: () => ({}) };
  const fmt = (x) => (typeof x === 'number' ? String(Math.round(x * 10) / 10) : typeof x === 'string' ? x : typeof x);
  return new Proxy(t, {
    get(o, k) { if (k in o) return o[k]; if (typeof k === 'symbol') return undefined; return (...a) => { log.n++; if (log.trace) log.trace.push(k + ':' + a.map(fmt).join(',')); }; },
    set(o, k, v) { if (log.trace && (k === 'fillStyle' || k === 'strokeStyle' || k === 'globalAlpha')) log.trace.push(k + '=' + fmt(v)); if (log.colors && (k === 'fillStyle' || k === 'strokeStyle') && typeof v === 'string') log.colors.add(v); o[k] = v; return true; },
  });
}
function stubDom(w = 800, h = 520) {
  const log = { n: 0 };
  const el = () => ({ style: {}, dataset: {}, width: 0, height: 0, _h: {}, addEventListener(type, fn) { this._h[type] = fn; }, setAttribute: noop, getContext: () => fakeCtx(log), getBoundingClientRect: () => ({ width: w, height: h, left: 0, top: 0 }), replaceChildren: noop, append: noop });
  globalThis.document = { createElement: el, documentElement: { dataset: {} }, hidden: false };
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = noop;
  return log;
}
const polyAtMid = (b) => { const p = b.pts[Math.floor(b.pts.length / 2)]; return [p[0], p[1]]; };
const onRoadOrFerry = (x, y) => L.inLand(x, y) || LAYOUT.zAt(x, y) > 0.2 || LAYOUT.edges.some((e) => e.ferry && e.pts.some((p, i) => i && L.segDist(x, y, e.pts[i - 1][0], e.pts[i - 1][1], p[0], p[1]) < 2));
const [CLS_A, CLS_B] = Object.keys(ASSETS);
const newGame = (seed = 7, perks = ['connected', 'grad']) => new Game({ perks, handle: 'Test', pid: 'T-1', seed });
/** Open every district up to n (net worth just over its gate). */
function openTo(g, n) { g.s.auditFirst = true; g.s.cash = ZONES[n].gate + 50 + Math.max(0, g.s.cash - g.netWorth() + g.s.cash * 0); g._unlock(); return g; }
async function world(game, ui, size = [800, 520]) {
  const log = stubDom(...size);
  const { World } = await import('../js/world/world.js');
  const session = { game, clock: { now: () => game.s.hour, paused: true, speed: 1 } };
  const w = new World({ session, ui, activate: noop, hover: noop });
  w.host = { getBoundingClientRect: () => ({ width: size[0], height: size[1] }) };
  w.resize(); w.sync(); w.placePlayer();
  return { w, log };
}
const faults = (w) => [...(w.faults || [])];
const live = (w, type) => [...w.ents.values()].filter((e) => e.type === type && !e.gone && !e.leaving);
const rect = ([x, y, w, d]) => ({ x0: x, y0: y, x1: x + w, y1: y + d });
const overlap = (a, b, m = 0) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.y0 < b.y1 + m && a.y1 > b.y0 - m;
const solidsOf = (D) => [...D.props.filter((p) => p.solid).map((p) => ({ what: p.t + '@' + p.gx.toFixed(1) + ',' + p.gy.toFixed(1), ...rect([p.gx, p.gy, p.w, p.d]) })),
  ...D.plots.map(([x, y], i) => ({ what: 'plot' + i, ...rect([x, y, T.PS, T.PS]) })), { what: 'stash', ...rect(D.stashRect) }];

// ---------------------------------------------------------------- projection and terrain
test('isometric projection is invertible and ordered back to front', () => {
  for (const [gx, gy, z] of [[0, 0, 0], [10.5, 3.25, 0], [60, 40, 12], [103, 77, 120]]) {
    const [x, y] = P(gx, gy, z), [bx, by] = toGrid(x, y, z);
    assert.ok(Math.abs(bx - gx) < 1e-9 && Math.abs(by - gy) < 1e-9, `round trip ${gx},${gy}`);
  }
  assert.ok(sy(5, 6) < sy(6, 6) && sy(5, 6) < sy(5, 7), 'screen y grows towards the viewer');
  assert.ok(hash(1) >= 0 && hash(1) < 1 && h2(3, 4) === h2(3, 4));
});

test('the island is not a rectangle: ragged coast, a lake, rivers, islets, a land mask with water inside it', () => {
  const { land, isLand, ZV, VW } = LAYOUT; let n = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) if (land[j * GW + i]) { n++; x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j); }
  const fill = n / ((x1 - x0 + 1) * (y1 - y0 + 1)); assert.ok(fill < 0.82 && fill > 0.4, 'land fills only ' + (fill * 100).toFixed(0) + '% of its bounding box');
  assert.ok([[0, 0], [GW - 1, 0], [0, GH - 1], [GW - 1, GH - 1]].filter(([i, j]) => !isLand(i, j)).length >= 3, 'the corners of the grid are sea');
  const rows = []; for (let j = 0; j < GH; j += 4) { let a = -1, b = -1; for (let i = 0; i < GW; i++) if (isLand(i, j)) { if (a < 0) a = i; b = i; } if (a >= 0) rows.push([a, b]); }
  assert.ok(new Set(rows.map((r) => r[0])).size > 8 && new Set(rows.map((r) => r[1])).size > 8, 'left and right coasts wander from row to row');
  // components of land: a main island plus islets (the Global Exchange is one)
  const seen = new Uint8Array(GW * GH); let comps = 0;
  for (let k = 0; k < seen.length; k++) if (land[k] && !seen[k]) { comps++; const q = [k]; seen[k] = 1; for (let h = 0; h < q.length; h++) { const c = q[h], i = c % GW, j = (c - i) / GW; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = i + a, y = j + b; if (isLand(x, y) && !seen[y * GW + x]) { seen[y * GW + x] = 1; q.push(y * GW + x); } } } }
  assert.ok(comps >= 4, 'islets as well as the main island: ' + comps + ' pieces of land');
  assert.ok(!isLand(84, 70) && !isLand(108, 116) && !isLand(143, 20), 'the lake, the river and the north inlet are water');
  assert.ok(DIST[16].fp && !isLand(141, 14), 'the strait lies between the Global Exchange and the mainland');
  assert.ok(LAYOUT.cliffs.length > 100, 'cliffs where high ground meets the sea');
  assert.ok(LAYOUT.bridges.length >= 2 && LAYOUT.bridges.every((b) => b.pts.every(([x, y]) => LAYOUT.zAt(x, y) > 0.3) && LAYOUT.zAt(...polyAtMid(b)) > 3), 'bridges carry their roads above the water');
});

test('the layout is not symmetric and not evenly tiled: sizes, spacing and positions all vary', () => {
  const ds = ZONE_IDS.map((id) => DIST[id]), areas = ds.map((d) => d.area), mean = areas.reduce((a, b) => a + b, 0) / 16;
  assert.equal(new Set(areas).size, 16, 'no two districts have the same footprint');
  const sd = Math.sqrt(areas.reduce((a, b) => a + (b - mean) ** 2, 0) / 16); assert.ok(sd / mean > 0.25, 'footprint areas spread: cv ' + (sd / mean).toFixed(2));
  assert.ok(Math.max(...areas) / Math.min(...areas) > 3, 'from cramped to sprawling');
  const nn = ds.map((a) => Math.min(...ds.filter((b) => b !== a).map((b) => Math.hypot(a.cx - b.cx, a.cy - b.cy)))), nmean = nn.reduce((a, b) => a + b, 0) / 16, nsd = Math.sqrt(nn.reduce((a, b) => a + (b - nmean) ** 2, 0) / 16);
  assert.ok(nsd / nmean > 0.1 && Math.max(...nn) / Math.min(...nn) > 1.4, 'nearest-neighbour distances are uneven: cv ' + (nsd / nmean).toFixed(2) + ', ' + Math.min(...nn).toFixed(0) + ' to ' + Math.max(...nn).toFixed(0));
  for (let i = 0; i < 16; i++) for (let j = i + 1; j < 16; j++) assert.ok(Math.abs(ds[i].cx - ds[j].cx) >= 2 && Math.abs(ds[i].cy - ds[j].cy) >= 2, `districts ${i + 1} and ${j + 1} share no axis`);
  // no regular grid: the x and y gaps between sorted centres are not all alike
  for (const k of ['cx', 'cy']) { const v = ds.map((d) => d[k]).sort((a, b) => a - b), gaps = v.slice(1).map((x, i) => x - v[i]), gm = gaps.reduce((a, b) => a + b, 0) / gaps.length; assert.ok(Math.sqrt(gaps.reduce((a, b) => a + (b - gm) ** 2, 0) / gaps.length) / gm > 0.5, k + ' gaps are irregular'); }
  // mirror asymmetry: reflecting the island across its own axes does not map districts onto districts
  const mx = ds.reduce((a, d) => a + d.cx, 0) / 16, my = ds.reduce((a, d) => a + d.cy, 0) / 16;
  for (const f of [(d) => [2 * mx - d.cx, d.cy], (d) => [d.cx, 2 * my - d.cy], (d) => [2 * mx - d.cx, 2 * my - d.cy]]) assert.ok(ds.filter((d) => { const [x, y] = f(d); return ds.some((e) => Math.hypot(e.cx - x, e.cy - y) < 6); }).length < 6, 'no mirror symmetry');
  assert.ok(new Set(ds.map((d) => d.flip)).size === 2 && ds.some((d) => d.pad.some((p) => p === 0)) && ds.some((d) => d.pad.some((p) => p >= 10)));
});

test('the journey is geography: four regions climb from low crowded ground to the high clean skyline, and the roads are long enough to matter', () => {
  const zs = REGIONS.map((r) => r.ids.reduce((a, id) => a + DIST[id].z, 0) / 4); assert.deepEqual(zs, [...zs].sort((a, b) => a - b), 'each region sits higher than the last: ' + zs.map((z) => z.toFixed(0)));
  assert.ok(DIST[1].z < 6 && DIST[14].z > 80, 'low scrap yard, high skyline');
  const crowd = (ids) => { let m = 0, c = 0; for (const a of ids) for (const b of ids) if (a < b) { m += Math.hypot(DIST[a].cx - DIST[b].cx, DIST[a].cy - DIST[b].cy); c++; } return m / c; };
  assert.ok(crowd([1, 2, 3, 4]) < crowd([9, 10, 11, 12]) && crowd([1, 2, 3, 4]) < crowd([13, 14, 15, 16]) + 20, 'the starter streets are the most crowded');
  const open = new Set(ZONE_IDS), len = (r) => r.reduce((a, p, i) => a + (i ? Math.hypot(p[0] - r[i - 1][0], p[1] - r[i - 1][1]) : 0), 0);
  assert.ok(len(LAYOUT.route(1, 16, open)) > 350, 'walking from district 1 to 16 is a real journey: ' + len(LAYOUT.route(1, 16, open)).toFixed(0) + ' tiles');
  for (const id of ZONE_IDS) assert.ok(LAYOUT.route(1, id, open), 'district ' + id + ' is reachable by road');
  // a locked district is cut off: with only the districts before it open there is no road to it
  for (let d = 2; d <= 16; d++) { const o = new Set(ZONE_IDS.filter((z) => z < d)); assert.equal(LAYOUT.route(1, d, o), null, `district ${d} is cut off while locked`); assert.ok(LAYOUT.route(1, d - 1, o), 'and its neighbour is not'); }
  // what cuts it off matches the gate: a closed bridge over water, a barrier on the road, a ferry that is not running, or fog
  const kinds = new Set(ZONE_IDS.map((id) => DIST[id].gateKind)); assert.deepEqual([...kinds].sort(), ['barrier', 'bridge', 'ferry', 'fog']);
  for (const id of ZONE_IDS) { const D = DIST[id]; if (D.gateKind === 'fog') continue; const g = D.props.find((p) => p.t === 'gate'); assert.ok(g && g.gk === D.gateKind, `district ${id} shows its ${D.gateKind}`); if (D.gateKind === 'bridge') assert.ok(LAYOUT.bridges.some((b) => b.edge.n === D.gateAt.edge), 'a bridge gate stands on a bridge'); }
  assert.ok(ZONE_IDS.every((id) => REGIONS.some((r) => r.ids.includes(id))));
});

test('roads bend, fork and rejoin, with side paths to lookouts', () => {
  const main = LAYOUT.edges.filter((e) => !e.path && !e.ferry);
  assert.ok(main.every((e) => e.pts.length >= 4), 'every road bends'); assert.ok(main.some((e) => e.pts.some((p, i) => i && Math.abs(Math.abs(p[0] - e.pts[i - 1][0]) - Math.abs(p[1] - e.pts[i - 1][1])) > 2 && p[0] !== e.pts[i - 1][0] && p[1] !== e.pts[i - 1][1])), 'some run on a diagonal');
  const deg = {}; for (const e of LAYOUT.edges) { deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1; }
  assert.ok(Object.values(deg).some((v) => v >= 3), 'forks: a junction with three roads');
  assert.ok(LAYOUT.route(2, 3, new Set(ZONE_IDS)) && LAYOUT.route(4, 3, new Set(ZONE_IDS)) && LAYOUT.edges.filter((e) => e.gate === 4 || e.gate === 3).length >= 3, 'two ways between the starter districts: roads rejoin');
  assert.ok(LAYOUT.edges.filter((e) => e.path).length >= 4 && LAYOUT.nodes.size > 0);
  assert.ok(SCENERY.filter((p) => p.t === 'lookout').length >= 4, 'viewpoints at the ends of the paths');
  for (const e of LAYOUT.edges) { const a = LAYOUT.nodes.get(e.a), b = LAYOUT.nodes.get(e.b); assert.deepEqual(e.pts[0], a); assert.deepEqual(e.pts.at(-1), b); }
});

test('every district has its own theme, kit, ground tone and accent', () => {
  for (const id of ZONE_IDS) {
    const D = DIST[id], Z = ZONES[id];
    assert.equal(D.theme, THEMES[id - 1]); assert.ok(KITS[D.theme], 'kit for ' + D.theme);
    assert.deepEqual(D.pal, Z.palette); assert.equal(D.cols.accent, Z.palette[1]);
    assert.ok(D.ground.some((g) => g.kind === 'block' && g.col === D.cols.ground), 'the block is laid in its own ground tone');
    assert.ok(D.props.length >= 12 && D.decals.length >= 3, `${D.theme} has a kit worth looking at: ${D.props.length} props, ${D.decals.length} decals`);
  }
  assert.equal(new Set(ZONE_IDS.map((id) => DIST[id].cols.ground)).size, 16, 'sixteen distinct ground tones');
  assert.equal(new Set(ZONE_IDS.map((id) => [...new Set(DIST[id].props.map((p) => p.t))].sort().join())).size, 16, 'sixteen distinct prop vocabularies');
});

test('footprints never overlap each other, a plot, a stash yard or a road; pads never overlap each other', () => {
  const ids = ZONE_IDS;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) assert.ok(!overlap(rect(DIST[ids[i]].fp), rect(DIST[ids[j]].fp)), `district ${ids[i]} and ${ids[j]} overlap`);
  for (const id of ids) {
    const D = DIST[id], S = solidsOf(D), keep = T.keep.map(([x, y, w, d]) => ({ what: 'road', ...rect([D.ox + x, D.oy + y, w, d]) })), F = rect(D.fp);
    for (let i = 0; i < S.length; i++) {
      const a = S[i];
      assert.ok(a.x0 >= F.x0 && a.x1 <= F.x1 && a.y0 >= F.y0 && a.y1 <= F.y1, `${D.theme}: ${a.what} leaves its ground`);
      for (const k of keep) assert.ok(!overlap(a, k), `${D.theme}: ${a.what} stands on a road`);
      for (let j = i + 1; j < S.length; j++) assert.ok(!overlap(a, S[j]), `${D.theme}: ${a.what} overlaps ${S[j].what}`);
      for (const s of LAYOUT.roadSegs) if (!(a.x0 >= D.ox && a.x1 <= D.ox + BW && a.y0 >= D.oy && a.y1 <= D.oy + BD)) assert.ok(L.segDist((a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2, s[0], s[1], s[2], s[3]) > s[4], `${D.theme}: pad prop ${a.what} sits on a road`);
    }
    assert.deepEqual(D.rejected.filter((r) => ['bldg', 'shack', 'depot', 'board', 'bank', 'office', 'ipo', 'rentrow', 'exchange'].includes(r.t)), [], `${D.theme}: no structure was refused a place`);
    assert.ok(D.props.some((p) => p.pad) || id === 1, `${D.theme}: its pad is dressed`);
  }
});

test('features, headquarters, depots and boards stand where the data says, once each', () => {
  const FEATURE = { bank: 'bank', audits: 'audit', enterprise: 'ipo', rent: 'rent', arbitrage: 'exchange' };
  const hot = SCENERY.filter((p) => p.hot).map((p) => p.hot);
  assert.equal(new Set(hot).size, hot.length, 'hotspot ids are unique');
  for (const [rule, id] of Object.entries(FEATURE)) {
    const zs = ZONE_IDS.filter((z) => ZONES[z].rules[rule]); assert.equal(zs.length, 1, rule + ' unlocks in exactly one district');
    const p = SCENERY.find((q) => q.hot === id); assert.ok(p, id + ' exists'); assert.equal(p.zone, zs[0], `${id} stands in district ${zs[0]}`);
  }
  for (const id of ZONE_IDS) for (const k of ['hq', 'depot', 'board']) assert.ok(hot.includes(`${k}:${id}`), `${k}:${id}`);
  assert.equal(hot.length, 16 * 3 + 5);
});

test('everything is reachable on foot over the road graph: each block from its ports, each port by road', () => {
  for (const id of ZONE_IDS) {
    const D = DIST[id], N = BW * 2, M = BD * 2, S = solidsOf(D).filter((s) => s.what !== 'stash' && s.x0 >= D.ox && s.x1 <= D.ox + BW);
    const blocked = new Uint8Array(N * M), seen = new Uint8Array(N * M), cell = (x, y) => Math.floor((y - D.oy) * 2) * N + Math.floor((x - D.ox) * 2);
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) { const c = rect([D.ox + i / 2, D.oy + j / 2, 0.5, 0.5]); if (S.some((s) => overlap(c, s))) blocked[j * N + i] = 1; }
    const q = [cell(D.cx, D.cy)]; seen[q[0]] = 1;
    for (let h = 0; h < q.length; h++) { const c = q[h], i = c % N, j = (c - i) / N; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= M) continue; const n = b * N + a; if (!seen[n] && !blocked[n]) { seen[n] = 1; q.push(n); } } }
    const touches = (r) => { for (let x = r.x0 - 0.5; x <= r.x1 + 0.5; x += 0.5) for (const y of [r.y0 - 0.5, r.y1 + 0.25]) if (x >= D.ox && x < D.ox + BW && y >= D.oy && y < D.oy + BD && seen[cell(x, y)]) return true; for (let y = r.y0 - 0.5; y <= r.y1 + 0.5; y += 0.5) for (const x of [r.x0 - 0.5, r.x1 + 0.25]) if (x >= D.ox && x < D.ox + BW && y >= D.oy && y < D.oy + BD && seen[cell(x, y)]) return true; return false; };
    for (const p of D.props) if (p.hot) assert.ok(touches(rect([p.gx, p.gy, p.w, p.d])), `${D.theme}: ${p.hot} can be walked up to`);
    D.plots.forEach(([x, y], i) => assert.ok(touches(rect([x, y, T.PS, T.PS])), `${D.theme}: plot ${i} can be walked up to`));
    for (const [x, y] of [...D.spots.leads, ...D.spots.lots, D.spots.home, ...D.spots.stash.pts, D.door]) assert.ok(seen[cell(x, y)], `${D.theme}: spot ${x.toFixed(1)},${y.toFixed(1)} is reachable`);
    for (const [k, [x, y]] of Object.entries(D.ports)) assert.ok(seen[cell(Math.min(Math.max(x, D.ox + 0.1), D.ox + BW - 0.1), Math.min(Math.max(y, D.oy + 0.1), D.oy + BD - 0.1))], `${D.theme}: port ${k} is reachable from the centre`);
  }
  // the roads join every port to the next district; the door stands on the cross street
  const all = new Set(ZONE_IDS); for (const id of ZONE_IDS.filter((z) => z > 1)) { const r = LAYOUT.route(1, id, all); assert.ok(r && r.length >= 2); for (const [x, y] of r) assert.ok(onRoadOrFerry(x, y), `route 1 to ${id} stays on land, a bridge or the ferry`); }
});

test('stash capacity covers the district store and its bonus; overflow stays visible and distinct', () => {
  const bonus = Math.max(...ZONE_IDS.map((z) => ZONES[z].bonus?.storeBonus || 0));
  for (const id of ZONE_IDS) {
    const D = DIST[id], sp = D.spots, Z = ZONES[id];
    assert.ok(sp.stash.n >= Z.store + bonus + 2 && sp.stash.n >= Z.store + 6, `${D.theme}: ${sp.stash.n} slots for ${Z.store} + ${bonus}`);
    assert.equal(sp.stash.pts.length, sp.stash.n); assert.equal(new Set(sp.stash.pts.map((p) => p.join())).size, sp.stash.n, 'distinct slots');
    const R = rect(D.stashRect); for (const [x, y] of sp.stash.pts) assert.ok(x > R.x0 && x < R.x1 && y > R.y0 && y < R.y1, 'slots lie inside the yard');
    assert.ok(sp.leads.length >= 8 && sp.lots.length >= 6 + Math.max(...ZONE_IDS.map((z) => ZONES[z].bonus?.lotSlots || 0)), 'room for every buyer and lot');
    const over = Array.from({ length: 40 }, (_, k) => LAYOUT.stashPos(id, sp.stash.n + k)), all = [...sp.stash.pts, ...over];
    assert.equal(new Set(all.map((p) => p.map((v) => v.toFixed(2)).join())).size, all.length, 'overflow crates do not stack on each other or on the yard');
    for (const [x, y] of over) assert.ok(L.inLand(x, y) && zoneAt(x, y) === id, 'overflow is on the district');
  }
});

test('manager plots: exactly ZONES[z].plots, none in districts 1-4', () => {
  for (const id of ZONE_IDS) {
    const D = DIST[id]; assert.equal(D.plots.length, ZONES[id].plots); assert.equal(PLOTS[id].length, ZONES[id].plots);
    assert.equal(ZONES[id].plots === 0, id <= 4);
    for (const [x, y] of D.plots) assert.equal(zoneAt(x + 1.5, y + 1.5), id, 'plot inside its district');
  }
});

test('the layout is deterministic: same zones, same island, and no Math.random anywhere', () => {
  const real = Math.random; Math.random = () => { throw new Error('Math.random in layout'); };
  try {
    const a = L.buildLayout(ZONES), b = L.buildLayout(structuredClone(ZONES));
    const dump = (x) => JSON.stringify({ d: x.districts, p: x.patches, w: x.walls });
    assert.equal(dump(a), dump(b)); assert.equal(dump(a), dump(LAYOUT));
  } finally { Math.random = real; }
});

test('a layout can be built for any zone set (a content change moves nothing it should not)', () => {
  const alt = structuredClone(ZONES); alt[7].plots = 3; alt[7].store = 20; alt[11].palette = ['#112233', '#ffcc00'];
  const a = L.buildLayout(alt), D7 = a.districts[7];
  assert.equal(D7.plots.length, 3); assert.equal(D7.spots.stash.n, 26); assert.equal(a.districts[11].pal[1], '#ffcc00');
  assert.equal(a.districts[3].ox, DIST[3].ox, 'other districts do not move');
});

// ---------------------------------------------------------------- headless drawing
test('headless draw: every district, mode, entity type, day and night, without a single fault', async () => {
  const g = newGame(21); openTo(g, 16);
  for (const z of ZONE_IDS) {
    const classes = Object.keys(ASSETS).filter((c) => (ASSETS[c].dem?.[z] || 0) >= 4);
    for (let i = 0; i < ZONES[z].store + 3; i++) g.s.assets.push(g._mk(g.s, classes[i % classes.length] || 'paperclip', { zone: z, cond: i % 4 === 3 ? 'broken' : 'ok' }));
    const buyer = Object.keys(BUYERS).find((b) => BUYERS[b].zone === z), cls = classes.find((c) => BUYERS[buyer].like && true);
    for (let i = 0; i < ZONES[z].plots - 1; i++) g.s.pipes.push({ id: 'P' + g.s.nid++, kind: ['student', 'broker', 'logistics'][i % 3], zone: z, level: 1 + i, cls, buyer, channel: 'dom', alloc: 100, prog: 3, len: 12, inflight: 1, cycles: 0, profit: 0, basis: 100, status: i === 1 ? 'paused' : 'running', pausedUntil: 0, starved: false });
  }
  const a = g.s.assets.find((x) => x.zone === 3); g.s.cash += 1e6; g.ship([a.id], 15);
  const ui = { zone: 1, sel: new Set(g.s.assets.slice(0, 3).map((x) => x.id)) };
  const { w, log } = await world(g, ui);
  const types = new Set([...w.ents.values()].map((e) => e.type));
  for (const t of ['lead', 'lot', 'asset', 'pipe', 'plot', 'truck']) assert.ok(types.has(t), 'entity type present: ' + t);
  for (const mode of ['world', 'map']) for (const zone of ZONE_IDS) for (const night of [0, 0.9]) {
    w.mode = mode; ui.zone = zone; w.focusZone(zone, false); w.sync(); w.night = night; w.update(0.03); w.night = night; w.draw();
  }
  w.fit(false); w.draw(); w.mode = 'map'; w.draw();
  assert.deepEqual(faults(w), [], 'no draw faults');
  assert.ok(log.n > 5000, 'the scene actually issued drawing calls: ' + log.n);
  assert.ok(w.hits.length > 10 && w.hotspots().length > 50, 'hit shapes and list view are populated');
});

test('headless draw under each macro shock, paused, reduced motion on and off, with the quality governor lite', async () => {
  const g = newGame(5); openTo(g, 9);
  const { w } = await world(g, { zone: 5, sel: new Set() });
  for (const kind of ['tiktok', 'fed', 'tariff']) {
    g.injectEvent(kind, g.s.hour + 1, { id: 'test-' + kind }); g.advanceTo(g.s.hour + 2);
    for (const reduce of [false, true]) for (const lite of [false, true]) { document.documentElement.dataset.motion = reduce ? 'reduce' : 'auto'; w.lite = lite; w.sync(); w.update(0.05); w.draw(); }
  }
  document.documentElement.dataset.motion = 'auto';
  assert.equal(w.env.crunch || w.env.surge || w.env.tariff, true, 'weather flags follow the active events');
  assert.deepEqual(faults(w), []);
});

test('sixteen distinct looks: each district draws a signature no other district shares', async () => {
  const g = newGame(3); openTo(g, 16);
  const { w, log } = await world(g, { zone: 1, sel: new Set() }, [1000, 640]);
  const sigs = new Map();
  for (const z of ZONE_IDS) {
    w.ui = { zone: z }; w.api.ui.zone = z; w.focusZone(z, false); w.update(0.03);
    log.colors = new Set(); log.trace = []; w.draw();
    const inBlock = SCENERY.filter((p) => p.zone === z).map((p) => p.t).sort().join('+'), key = [...log.colors].sort().join('|') + '#' + inBlock + '#' + log.trace.length;
    sigs.set(z, key); log.trace = null; log.colors = null;
  }
  assert.equal(new Set(sigs.values()).size, 16, 'sixteen distinct draw signatures');
  assert.deepEqual(faults(w), []);
});

test('culling and levels of detail: a focused view draws a fraction of the island, and the island at fit is still cheap', async () => {
  const g = newGame(3); openTo(g, 16);
  const { w, log } = await world(g, { zone: 7, sel: new Set() }, [1440, 900]);
  let statics = 0; const ds = w.drawStatic.bind(w); w.drawStatic = (ctx, p) => { statics++; ds(ctx, p); };
  w.focusZone(7, false); log.n = 0; w.draw(); const focusOps = log.n, focusStatics = statics;
  w.fit(false); statics = 0; log.n = 0; w.draw(); const fitOps = log.n, fitStatics = statics;
  assert.ok(focusStatics < SCENERY.length * 0.4, `focused: ${focusStatics} of ${SCENERY.length} props drawn`);
  assert.ok(fitStatics < SCENERY.length, 'at fit the small scenery is left out: ' + fitStatics + ' of ' + SCENERY.length);
  assert.ok(focusOps < 40000 && fitOps < 40000, `focused ${focusOps} calls, fit ${fitOps} calls`);
  w.cam.z = 0.9; w.cam.x = L.LAYOUT.bounds.x1 + 3000; w.clampCam(); assert.ok(w.cam.x <= w.bounds().x1, 'the camera cannot leave the island');
});

// ---------------------------------------------------------------- picking, anchors, camera
test('picking: a buyer, a building and a locked gate pick what they should; open water picks nothing', async () => {
  const g = newGame(3);
  const { w } = await world(g, { zone: 1, sel: new Set() });
  for (let i = 0; i < 40; i++) w.update(0.5); // buyers walk in from the entrance to their spots
  w.focusZone(1, false); w.draw();
  const lead = w.hits.find((h) => h.kind === 'lead'); assert.ok(lead, 'a buyer is hittable');
  const [px, py] = w.w2s(lead.circle[0], lead.circle[1]); assert.equal(w.pick(px, py)?.id, lead.id);
  const hq = w.hits.find((h) => h.kind === 'static' && h.id === 'hq:1'); assert.ok(hq, 'the headquarters is hittable');
  const poly = hq.polys[0], [cx, cy] = [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length], [qx, qy] = w.w2s(cx, cy);
  assert.equal(w.pick(qx, qy)?.id, 'hq:1');
  assert.equal(w.pick(2, 2) === null || w.pick(2, 2).kind !== 'lead', true);
  // a locked district shows a gate that picks as that district, and says what opens it
  w.focusZone(2, false); w.draw();
  const gate = w.hits.find((h) => h.kind === 'zone' && h.id === 2); assert.ok(gate && gate.locked && gate.gate === ZONES[2].gate, 'locked gate hit');
  const [gx, gy] = w.w2s(gate.circle[0], gate.circle[1]); assert.equal(w.pick(gx, gy)?.kind, 'zone');
  assert.ok(/locked/.test(gate.label));
});

test('map mode: every district is a label and a block you can click, with its lock state', async () => {
  const g = newGame(3); openTo(g, 6);
  const { w } = await world(g, { zone: 1, sel: new Set() }, [1440, 900]);
  w.setMode('map'); w.fit(false); w.draw();
  assert.equal(Object.keys(w.hitsLabel).length, 16);
  for (const id of ZONE_IDS) { const r = w.hitsLabel[id], h = w.pick(r[0] + r[2] / 2, r[1] + r[3] / 2); assert.equal(h?.kind, 'zone'); assert.equal(h.id, id); assert.equal(h.locked, id > 6, 'lock state of ' + id); }
  const D = DIST[11], [bx, by] = w.w2s(sx(D.ox + 2, D.oy + 15), sy(D.ox + 2, D.oy + 15, D.z));
  assert.equal(w.pick(bx, by)?.id, 11, 'the block itself picks too, not only its label');
  assert.deepEqual(faults(w), []);
});

test('rectOf gives a real on-screen rectangle for every kind of thing, and null for what is not there or not on screen', async () => {
  const g = newGame(8); openTo(g, 9); g.s.cash += 1e6;
  const a = g._mk(g.s, 'paperclip', { zone: 5 }); g.s.assets.push(a);
  const lane = g.radar(5, 1)[0], cls = lane.cls, buyer = lane.seg; // a lane the engine accepts, whatever the content looks like
  g.s.pipes.push({ id: 'P' + g.s.nid++, kind: 'broker', zone: 5, level: 2, cls, buyer, channel: 'dom', alloc: 100, prog: 3, len: 12, inflight: 1, cycles: 0, profit: 0, basis: 100, status: 'running', pausedUntil: 0, starved: false });
  g.ship([g.s.assets.find((x) => x.zone === 1).id], 2);
  const ui = { zone: 5, sel: new Set() }, { w } = await world(g, ui, [1440, 900]);
  for (let i = 0; i < 60; i++) w.update(0.5);
  w.focusZone(5, false); w.draw();
  const inside = (r) => r && r.w > 4 && r.h > 4 && r.x + r.w > 0 && r.y + r.h > 0 && r.x < w.W && r.y < w.H;
  const lead = g.s.leads[5][0], lot = g.s.lots[5][0], pipe = g.s.pipes.find((p) => p.zone === 5);
  assert.ok(inside(w.rectOf('lead', lead.id)), 'lead'); assert.ok(inside(w.rectOf('lot', lot.id)), 'lot'); assert.ok(inside(w.rectOf('asset', a.id)), 'asset'); assert.ok(inside(w.rectOf('pipe', pipe.id)), 'pipe');
  assert.ok(inside(w.rectOf('plot', '5:3')), 'plot by zone:index'); assert.ok(inside(w.rectOf('plot', 3)), 'plot by index in the current district');
  for (const id of ['hq:5', 'depot:5', 'board:5', 'bank']) assert.ok(inside(w.rectOf('static', id)), 'static ' + id);
  assert.ok(inside(w.rectOf('zone', 5)), 'zone');
  const f = g.s.freight[0]; w.truckPos(w.ents.get('truck:' + f.id)); assert.equal(w.rectOf('truck', f.id) === null || inside(w.rectOf('truck', f.id)), true);
  // the rectangle follows the camera
  const r1 = w.rectOf('static', 'bank'); w.cam.x += 50; const r2 = w.rectOf('static', 'bank'); assert.ok(Math.abs((r1.x - r2.x) - 50 * w.cam.z) < 1e-6, 'it moves with the camera');
  w.focusZone(16, false); assert.equal(w.rectOf('static', 'bank'), null, 'a building in another district is off screen');
  assert.equal(w.rectOf('lead', 'nope'), null); assert.equal(w.rectOf('static', 'nope'), null); assert.equal(w.rectOf('banana', 1), null);
});

test('focusing a district frames its whole block at any window size; fit shows the island; zoom stays in range', async () => {
  const g = newGame(3);
  for (const size of [[800, 520], [1440, 900], [390, 700]]) {
    const { w } = await world(g, { zone: 1, sel: new Set() }, size);
    for (const id of ZONE_IDS) {
      w.focusZone(id, false); const D = DIST[id], pts = [[D.ox, D.oy], [D.ox + BW, D.oy], [D.ox + BW, D.oy + BD], [D.ox, D.oy + BD]].map(([x, y]) => w.w2s(sx(x, y), sy(x, y, D.z)));
      const cx = (Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2, cy = (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2;
      assert.ok(Math.abs(cx - w.W / 2) < w.W * 0.12 && Math.abs(cy - w.H / 2) < w.H * 0.25, `district ${id} is centred at ${size}`);
      assert.ok(Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])) <= w.W * 1.02 || w.cam.z <= 0.4 + 1e-9, 'and fits across');
    }
    w.fit(false); const b = w.bounds(); assert.ok((b.x1 - b.x0) * w.cam.z <= w.W + 1 && (b.y1 - b.y0) * w.cam.z <= w.H + 1, 'the whole island is in view at fit');
    const [lo, hi] = w.zoomRange(); assert.ok(w.cam.z >= lo - 1e-9 && w.cam.z <= hi);
  }
});

// ---------------------------------------------------------------- locked districts and the reveal
test('locked districts are fogged and desaturated with a gate; opening one plays the reveal, and reduced motion skips it', async () => {
  const g = newGame(3);
  const revealed = [], ui = { zone: 1, sel: new Set() }, { w, log } = await world(g, ui, [1440, 900]);
  w.api.reveal = (z) => revealed.push(z);
  assert.ok(w.fxOf(2).fog === 1 && w.fxOf(2).dim > 0 && w.fxOf(1).fog === 0, 'locked fog, open clear');
  w.focusZone(2, false); log.trace = []; w.draw(); const locked = log.trace.join('|'); log.trace = null;
  const board = w.hits.find((h) => h.kind === 'static' && h.id === 'board:2'); assert.ok(board && board.locked, 'its board reports it is locked');
  document.documentElement.dataset.motion = 'auto';
  openTo(g, 2); w.t = 5000; w.sync();
  assert.deepEqual(revealed, [2], 'the UI is told once that a district opened'); assert.ok(w.reveal[2], 'the reveal is playing');
  const fog = [], lights = [];
  for (const t of [5000, 5600, 6200, 6800, 7400, 8000]) { w.t = t; const f = w.fxOf(2); fog.push(f.fog); lights.push(f.lights); }
  assert.ok(fog[0] > 0.99 && fog.at(-1) === 0 && fog.every((v, i) => !i || v <= fog[i - 1] + 1e-9), 'the fog lifts monotonically: ' + fog.map((v) => v.toFixed(2)));
  assert.ok(Math.max(...lights) > 0.5 && lights.at(-1) === 0, 'the lights come on during the reveal and settle');
  w.t = 5900; w.draw(); log.trace = []; w.focusZone(2, false); w.draw(); const mid = log.trace.join('|'); log.trace = null;
  w.t = 9000; w.fxOf(2); assert.equal(w.reveal[2], undefined, 'it cleans up after itself');
  w.focusZone(2, false); log.trace = []; w.draw(); const open = log.trace.join('|'); log.trace = null;
  assert.ok(locked !== open && mid !== open && mid !== locked, 'locked, revealing and open all draw differently');
  assert.deepEqual(faults(w), []);
  // reduced motion: no animation at all, the district is simply open
  document.documentElement.dataset.motion = 'reduce';
  openTo(g, 3); w.sync(); assert.equal(w.reveal[3], undefined); assert.equal(w.fxOf(3).fog, 0); assert.deepEqual(revealed, [2, 3]);
  document.documentElement.dataset.motion = 'auto';
});

// ---------------------------------------------------------------- entities in any district
test('entities work in any district: buyers, lots, crates and managers each get their own place, also in the last one', async () => {
  const g = newGame(8); openTo(g, 16);
  const ui = { zone: 16, sel: new Set() }, { w } = await world(g, ui);
  for (let i = 0; i < 90; i++) { g.advanceTo(g.s.hour + 1); w.sync(); }
  for (const z of [1, 5, 11, 16]) {
    const leads = live(w, 'lead').filter((e) => e.zone === z), lots = live(w, 'lot').filter((e) => e.zone === z);
    assert.ok(leads.length >= 3 && lots.length >= 3, `district ${z} is busy: ${leads.length} buyers, ${lots.length} lots`);
    assert.equal(new Set(leads.map((e) => e.slot)).size, leads.length, 'distinct buyer slots'); assert.equal(new Set(lots.map((e) => e.slot)).size, lots.length, 'distinct lot slots');
    for (const e of leads) assert.equal(zoneAt(SPOTS[z].leads[e.slot][0], SPOTS[z].leads[e.slot][1]), z, 'a buyer waits in its own district');
  }
  for (let i = 0; i < 60; i++) w.update(0.5); w.focusZone(16, false); w.draw();
  const h = w.hits.filter((x) => x.kind === 'lead'); for (const lead of h) { const [px, py] = w.w2s(lead.circle[0], lead.circle[1]); if (px > 0 && py > 0 && px < w.W && py < w.H) assert.equal(w.pick(px, py)?.id, lead.id, 'each settled buyer is clickable at its own spot'); }
  // a full stash plus overflow in district 16
  const Z = ZONES[16]; for (let i = 0; i < Z.store + 12; i++) g.s.assets.push(g._mk(g.s, 'paperclip', { zone: 16 }));
  w.sync(); const crates = live(w, 'asset').filter((e) => e.zone === 16); assert.ok(crates.length >= Z.store + 12);
  assert.equal(new Set(crates.map((e) => w.posOf(e).map((v) => v.toFixed(2)).join())).size, crates.length, 'every crate has its own spot, overflow included');
  w.draw(); assert.deepEqual(faults(w), []);
});

test('entities follow the game: a sold-out lead leaves, a spent crate disappears, a hired manager takes a plot', async () => {
  const g = newGame(8); openTo(g, 9);
  const ui = { zone: 5, sel: new Set() }, { w } = await world(g, ui);
  const lane = g.radar(5, 1)[0], cls = lane.cls, buyer = lane.seg; // a lane the engine accepts, whatever the content looks like
  g.s.cash = 5e5; const plots0 = live(w, 'plot').filter((e) => e.zone === 5).length;
  const r = g.hirePipeline('broker', 5, { cls, buyer }); assert.ok(r.ok, r.msg); w.sync();
  assert.equal(live(w, 'plot').filter((e) => e.zone === 5).length, plots0 - 1, 'one plot became a building'); assert.equal(live(w, 'pipe').length, 1);
  const lead = g.s.leads[5][0]; g.s.leads[5] = g.s.leads[5].filter((l) => l !== lead); w.sync();
  assert.ok(w.ents.get('lead:' + lead.id).leaving, 'the buyer walks away instead of vanishing');
  const a = g.s.assets[0]; g.s.assets = g.s.assets.filter((x) => x !== a); w.sync(); assert.ok(w.ents.get('asset:' + a.id)?.gone, 'the crate fades out');
});

test('a released manager does not make the others jump to another plot', async () => {
  const g = newGame(8); openTo(g, 9); g.s.cash = 5e5;
  const ui = { zone: 5, sel: new Set() }, { w } = await world(g, ui);
  const lane = g.radar(5, 1)[0], cls = lane.cls, buyer = lane.seg; // a lane the engine accepts, whatever the content looks like
  const a = g.hirePipeline('broker', 5, { cls, buyer }).pipe, b = g.hirePipeline('student', 5, { cls, buyer }).pipe; w.sync();
  const pa = w.ents.get('pipe:' + a.id).plot, pb = w.ents.get('pipe:' + b.id).plot; assert.notEqual(pa, pb);
  g.releasePipeline(a.id); w.sync();
  assert.equal(w.ents.get('pipe:' + b.id).plot, pb, 'the remaining building stays on its plot');
  assert.equal([...w.ents.values()].filter((e) => e.type === 'plot' && !e.gone && e.zone === 5 && e.plot === pa).length, 0, 'no empty-plot marker under the fading building');
  for (let i = 0; i < 4; i++) { w.t += 400; w.update(0.5); w.sync(); }
  assert.equal(live(w, 'plot').filter((e) => e.zone === 5 && e.plot === pa).length, 1, 'once it has gone, its plot is empty again');
});

test('a crate that changes district is a new arrival there', async () => {
  const g = newGame(8); openTo(g, 6);
  const a = g._mk(g.s, CLS_B, { zone: 1 }); g.s.assets.push(a);
  const { w } = await world(g, { zone: 1, sel: new Set() });
  assert.equal(w.ents.get('asset:' + a.id).zone, 1);
  a.zone = 6; w.sync(); const e = w.ents.get('asset:' + a.id);
  assert.equal(e.zone, 6, 'the crate follows its asset'); assert.ok(e.drop > 0, 'and arrives with the drop-in');
});

test('freight: a truck leaves its depot door, drives the avenue in the right-hand lane and arrives at the other district\'s door', async () => {
  const g = newGame(4); openTo(g, 12); g.s.cash += 1e6;
  const a = g._mk(g.s, CLS_A, { zone: 2 }); g.s.assets.push(a); assert.ok(g.ship([a.id], 11).ok);
  const b = g._mk(g.s, CLS_B, { zone: 12 }); g.s.assets.push(b); assert.ok(g.ship([b.id], 3).ok);
  const { w } = await world(g, { zone: 2, sel: new Set() });
  for (const f of g.s.freight) {
    const e = w.ents.get('truck:' + f.id), from = e.from, to = f.to, R = LAYOUT.truckRoute(from, to, w.unlocked);
    assert.deepEqual(R[0], DIST[from].door); assert.deepEqual(R.at(-1), DIST[to].door);
    for (let i = 0; i + 1 < R.length; i++) assert.ok(Math.hypot(R[i + 1][0] - R[i][0], R[i + 1][1] - R[i][1]) > 1e-6, 'no repeated points');
    const at = (h) => { w.hourF = () => h; w.ents.get('truck:' + f.id).maxP = 0; return w.truckPos(w.ents.get('truck:' + f.id)).slice(); };
    const p0 = at(f.arrive - 100), p1 = at(f.arrive + 5), mid = at(f.arrive - 2);
    assert.deepEqual(p0.map((v) => +v.toFixed(3)), DIST[from].door.map((v) => +v.toFixed(3)), 'starts at the depot door'); assert.deepEqual(p1.map((v) => +v.toFixed(3)), DIST[to].door.map((v) => +v.toFixed(3)), 'ends at the other door');
    let prev = null; for (let k = 0; k <= 40; k++) { w.ents.get('truck:' + f.id).maxP = 0; w.hourF = () => f.arrive - 6 + k * 0.15; const [x, y] = w.truckPos(w.ents.get('truck:' + f.id)); assert.ok(onRoadOrFerry(x, y), `on land, a bridge or the ferry (${from} to ${to}) at ${x.toFixed(1)},${y.toFixed(1)}`); if (prev) assert.ok(Math.abs(zAt(x, y) - zAt(prev[0], prev[1])) < 40, 'no teleporting'); prev = [x, y]; }
    void mid;
  }
  w.draw(); assert.deepEqual(faults(w), []);
  w.hourF = () => g.s.hour;
});

test('the player walks the avenue to another district and arrives at its home spot', async () => {
  const g = newGame(4); openTo(g, 16);
  const ui = { zone: 1, sel: new Set() }, { w } = await world(g, ui);
  ui.zone = 16; w.sync(); assert.ok(w.player.path.length > 4, 'a long walk with waypoints');
  const R = LAYOUT.playerRoute(1, 16, w.unlocked); for (const [x, y] of R) assert.ok(onRoadOrFerry(x, y), 'every waypoint is on land, a bridge or the ferry');
  for (let i = 0; i < 400 && w.player.path.length; i++) w.update(0.05);
  assert.deepEqual(w.player.path, []); assert.ok(Math.hypot(w.player.x - SPOTS[16].home[0], w.player.y - SPOTS[16].home[1]) < 0.2, 'standing at the home spot of district 16');
});

test('travel: the avatar walks the real roads between open districts; quickTravel skips the walk; a locked district refuses', async () => {
  const g = newGame(4); openTo(g, 6);
  const ui = { zone: 1, sel: new Set() }, { w } = await world(g, ui, [1440, 900]);
  ui.zone = 6; w.sync(); const R = [...w.player.path];
  assert.ok(R.length > 6, 'a walk with many waypoints');
  let len = 0, prev = [w.player.x, w.player.y]; for (const p of R) { len += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p; }
  assert.ok(len > 120, 'distance matters: ' + len.toFixed(0) + ' tiles from district 1 to 6');
  const near = (x, y) => LAYOUT.roadSegs.some((s) => L.segDist(x, y, s[0], s[1], s[2], s[3]) < 2.2) || LAYOUT.zoneAt(x, y) > 0;
  for (const [x, y] of R) assert.ok(near(x, y), `waypoint ${x.toFixed(1)},${y.toFixed(1)} is on a road or inside a district`);
  for (let i = 0; i < 600 && w.player.path.length; i++) w.update(0.05);
  assert.ok(Math.hypot(w.player.x - SPOTS[6].home[0], w.player.y - SPOTS[6].home[1]) < 0.3, 'arrived at district 6');
  assert.equal(w.quickTravel(7), false, 'a locked district cannot be travelled to'); assert.equal(w.player.zone, 6);
  assert.equal(w.quickTravel(3), true); assert.deepEqual(w.player.path, []); assert.equal(w.player.zone, 3);
  assert.ok(Math.hypot(w.player.x - SPOTS[3].home[0], w.player.y - SPOTS[3].home[1]) < 1e-9, 'standing at the home spot at once');
  w.update(0.05); w.draw(); assert.ok(w.camTo || Math.abs(w.cam.x - sx(DIST[3].cx, DIST[3].cy)) < 400, 'and the camera goes there');
  // from far out every visible district has a tag that travels
  w.fit(false); w.draw(); const tags = w.hits.filter((h) => h.eid?.startsWith('tag:')); assert.ok(tags.length >= 12, 'tags on the districts in view: ' + tags.length);
  const t = tags.find((h) => h.id === 7), [px, py] = w.w2s(t.circle[0], t.circle[1]); assert.equal(w.pick(px, py)?.id, 7); assert.ok(w.pick(px, py).quick && w.pick(px, py).locked, 'the tag of a locked district says so');
  assert.deepEqual(faults(w), []);
});

test('gates only stand while a district is locked: the barrier, the raised bridge and the ferry that is not running', async () => {
  const g = newGame(4), ui = { zone: 1, sel: new Set() }, { w } = await world(g, ui, [1440, 900]);
  const gateOf = (id) => w.hits.find((h) => h.eid === 'gate:' + id);
  for (const id of [2, 5, 16]) { const D = DIST[id]; w.goTo(sx(D.gateAt.x, D.gateAt.y), sy(D.gateAt.x, D.gateAt.y, zAt(D.gateAt.x, D.gateAt.y)) - 30, 0.9, false); w.draw(); const h = gateOf(id); assert.ok(h && h.locked && h.gate === ZONES[id].gate, `district ${id} (${D.gateKind}) is shut and says what opens it`); }
  openTo(g, 16); w.sync();
  for (const id of [2, 5, 16]) { const D = DIST[id]; w.goTo(sx(D.gateAt.x, D.gateAt.y), sy(D.gateAt.x, D.gateAt.y, zAt(D.gateAt.x, D.gateAt.y)) - 30, 0.9, false); w.draw(); assert.equal(gateOf(id), undefined, `district ${id} is open: no gate`); }
  assert.deepEqual(faults(w), []);
});

// ---------------------------------------------------------------- robustness (kept from v1 and extended)
test('one broken prop never blanks the frame: the fault is logged once and everything else still draws', async () => {
  const g = newGame(4); openTo(g, 4);
  const { w, log } = await world(g, { zone: 1, sel: new Set() });
  w.focusZone(1, false); const orig = DRAW.scrap; DRAW.scrap = () => { throw new Error('boom'); };
  const err = console.error; let logged = 0; console.error = () => { logged++; };
  try { log.n = 0; w.draw(); const ops = log.n; w.draw(); assert.ok(ops > 3000, 'the rest of the scene was drawn: ' + ops); assert.equal(logged, 1, 'logged once, not per frame'); assert.equal(faults(w).length, 1); } finally { DRAW.scrap = orig; console.error = err; }
});

test('resize redraws synchronously: the canvas is never blank after it changes size', async () => {
  const g = newGame(4); const { w } = await world(g, { zone: 1, sel: new Set() });
  let draws = 0; const d = w.draw.bind(w); w.draw = () => { draws++; d(); };
  w.host = { getBoundingClientRect: () => ({ width: 1000, height: 700 }) }; w.resize();
  assert.equal(draws, 1); assert.equal(w.W, 1000); assert.equal(w.cv.width, 1000 * w.dpr);
});

test('hover finds the entity, and fading things take no clicks', async () => {
  const g = newGame(3); const { w } = await world(g, { zone: 1, sel: new Set() });
  for (let i = 0; i < 40; i++) w.update(0.5); w.focusZone(1, false); w.draw();
  const lot = w.hits.find((h) => h.kind === 'lot'); assert.ok(lot && lot.eid === 'lot:' + lot.id, 'hits carry the entity key');
  w.hover = lot; w.draw(); assert.equal(w.hover.eid, lot.eid, 'hover survives a redraw and is refreshed from the new hit');
  const id = lot.id; g.s.lots[1] = g.s.lots[1].filter((l) => l.id !== id); w.sync();
  assert.ok(!w.hits.some((h) => h.eid === 'lot:' + id), 'removed at once, not at the next frame');
  w.draw(); assert.ok(!w.hits.some((h) => h.eid === 'lot:' + id), 'and not hittable while it fades');
});

test('reduced motion freezes every pulse (two draws at different times are identical)', async () => {
  const g = newGame(21); openTo(g, 16); g.s.auditPending = { title: 'x', text: 'y', due: g.s.hour + 50 };
  const { w, log } = await world(g, { zone: 9, sel: new Set(g.s.assets.slice(0, 1).map((a) => a.id)) });
  document.documentElement.dataset.motion = 'reduce';
  const snap = (t) => { w.t = t; w.sync(); w.update(0); w.t = t; w.vt = 0; log.trace = []; w.focusZone(9, false); w.draw(); const out = log.trace.join('|'); log.trace = null; return out; };
  w.draw(); // the first draw builds the minimap's backdrop; the freeze is about what moves
  const a = snap(100000), b = snap(100250);
  document.documentElement.dataset.motion = 'auto';
  assert.equal(a, b, 'nothing moves under reduced motion');
});

function key(w, k, mods = {}) { let prevented = false; w.cv._h.keydown({ key: k, preventDefault() { prevented = true; }, ...mods }); return prevented; }
test('keyboard shortcuts keep the browser\'s own, and 0 really fits the island', async () => {
  const g = newGame(3); const { w } = await world(g, { zone: 1, sel: new Set() });
  w.goTo(0, 0, 1.2, false); const before = { ...w.cam };
  assert.equal(key(w, '=', { ctrlKey: true }), false, 'Ctrl+= is left to the browser');
  assert.equal(key(w, '-', { metaKey: true }), false); assert.equal(key(w, 'ArrowLeft', { altKey: true }), false);
  assert.deepEqual(w.cam, before, 'and moves nothing');
  assert.equal(key(w, '0'), true); assert.ok(w.camTo, 'fit() is animating');
  assert.equal(key(w, '+'), true, 'plain + still zooms');
});

test('instant camera moves are clamped to the island', async () => {
  const g = newGame(3); const { w } = await world(g, { zone: 1, sel: new Set() });
  const b = w.bounds(); w.goTo(b.x1 + 5000, b.y1 + 5000, 1, false);
  assert.ok(w.cam.x <= b.x1 && w.cam.y <= b.y1, 'a minimap click under reduced motion cannot leave the island');
});

test('only the primary button acts; lifting one finger after a pinch never jumps the camera', async () => {
  const g = newGame(3); let acted = 0; const { w } = await world(g, { zone: 1, sel: new Set() });
  w.api.activate = () => { acted++; };
  for (let i = 0; i < 40; i++) w.update(0.5); w.focusZone(1, false); w.draw();
  const lead = w.hits.find((h) => h.kind === 'lead'), [px, py] = w.w2s(lead.circle[0], lead.circle[1]);
  const ev = (id, x, y, type, button = 0) => ({ pointerId: id, offsetX: x, offsetY: y, button, type, clientX: x, clientY: y });
  w.cv._h.pointerdown(ev(1, px, py, 'pointerdown', 2)); w.cv._h.pointerup(ev(1, px, py, 'pointerup', 2));
  assert.equal(acted, 0, 'a right-click does nothing');
  w.cv._h.pointerdown(ev(1, px, py, 'pointerdown', 0)); w.cv._h.pointerup(ev(1, px, py, 'pointerup', 0));
  assert.equal(acted, 1, 'a left click acts once');
  w.cv._h.pointerdown(ev(1, 100, 100, 'pointerdown')); w.cv._h.pointerdown(ev(2, 300, 100, 'pointerdown'));
  w.cv._h.pointermove(ev(2, 340, 100, 'pointermove')); const mid = { ...w.cam };
  w.cv._h.pointerup(ev(2, 340, 100, 'pointerup'));
  w.cv._h.pointermove(ev(1, 101, 100, 'pointermove'));
  assert.ok(Math.hypot(w.cam.x - mid.x, w.cam.y - mid.y) < 8 / w.cam.z, 'a 1px wobble moves the camera about 1px, not hundreds');
  w.cv._h.pointerup(ev(1, 101, 100, 'pointerup')); assert.equal(acted, 1, 'ending a gesture is not a click');
});

test('the quality governor ignores cold frames, steps symmetrically, recovers, and never thrashes the canvas', async () => {
  const g = newGame(3); openTo(g, 5);
  const { w } = await world(g, { zone: 2, sel: new Set() });
  window.devicePixelRatio = 2; w.resize(); assert.equal(w.dpr, 2);
  let reallocs = 0, widthSet = w.cv.width; Object.defineProperty(w.cv, 'width', { get: () => widthSet, set: (v) => { if (v !== widthSet) reallocs++; widthSet = v; } });
  const realNow = performance.now.bind(performance); let calls = 0, base = 0, cost = 30;
  performance.now = () => (calls++ % 2 === 0 ? (base += 40) : base + cost);
  w.running = true; let ts = 1000; const step = () => { w.dirty = true; w.last = 0; w.frame(ts += 40); };
  try {
    for (let i = 0; i < 25; i++) step(); assert.equal(w.slow, 0, 'the first frames after a resize are not judged');
    for (let i = 0; i < 80; i++) step();
    assert.ok(w.slow >= 5 && w.lite, 'a genuinely slow machine drops to the lite tier'); assert.ok(w.dpr < 2, 'and a lower pixel density');
    assert.ok(reallocs <= 2, 'with at most one or two reallocations, not one per frame: ' + reallocs);
    cost = 4; for (let i = 0; i < 120; i++) step();
    assert.equal(w.slow, 0, 'and it recovers when the load goes away'); assert.equal(w.dpr, 2, 'restoring full sharpness'); assert.equal(w.lite, false);
  } finally { performance.now = realNow; window.devicePixelRatio = 1; w.stop(); }
});
