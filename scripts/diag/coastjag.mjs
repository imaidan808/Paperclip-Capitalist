// D-COAST: how far is the drawn coastline (a staircase of whole tiles) from the smooth shoreline the land field itself describes? Pure: reads LAYOUT only.
import { LAYOUT } from '../../js/world/layout.js';
import { GW, GH } from '../../js/world/island.js';
const { land, FV, VW, ZV, cliffs, tcol } = LAYOUT;
const S = (gx, gy) => [(gx - gy) * 32, (gx + gy) * 16];
const isL = (i, j) => i >= 0 && j >= 0 && i < GW && j < GH && land[j * GW + i] === 1;
// 1. drawn coast edges: tile edges between a land tile and a non-land tile
const edges = []; let nS = 0, nE = 0, nW = 0, nN = 0;
for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) if (isL(i, j)) {
  if (!isL(i, j + 1)) { edges.push([[i, j + 1], [i + 1, j + 1]]); nS++; }
  if (!isL(i + 1, j)) { edges.push([[i + 1, j], [i + 1, j + 1]]); nE++; }
  if (!isL(i - 1, j)) { edges.push([[i, j], [i, j + 1]]); nW++; }
  if (!isL(i, j - 1)) { edges.push([[i, j], [i + 1, j]]); nN++; }
}
// 2. the smooth shoreline: marching squares of the field FV = 0 (linear along each vertex-grid edge)
const contour = [];
const f = (i, j) => FV[j * VW + i];
const crossing = (a, b) => { const va = f(a[0], a[1]), vb = f(b[0], b[1]); if ((va > 0) === (vb > 0)) return null; const t = va / (va - vb); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
  const c = [crossing([i, j], [i + 1, j]), crossing([i + 1, j], [i + 1, j + 1]), crossing([i, j + 1], [i + 1, j + 1]), crossing([i, j], [i, j + 1])].filter(Boolean);
  if (c.length === 2) contour.push([c[0], c[1]]); else if (c.length === 4) { contour.push([c[0], c[3]], [c[1], c[2]]); }
}
const segD = (px, py, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)); return Math.hypot(px - a[0] - dx * t, py - a[1] - dy * t); };
// spatial hash of contour segments in grid space, then distance in screen px
const cell = 4, H = new Map(); contour.forEach((s, n) => { const k0 = [Math.floor(Math.min(s[0][0], s[1][0]) / cell), Math.floor(Math.min(s[0][1], s[1][1]) / cell)], k1 = [Math.floor(Math.max(s[0][0], s[1][0]) / cell), Math.floor(Math.max(s[0][1], s[1][1]) / cell)]; for (let a = k0[0]; a <= k1[0]; a++) for (let b = k0[1]; b <= k1[1]; b++) { const k = a + ',' + b; (H.get(k) || H.set(k, []).get(k)).push(n); } });
const near = (gx, gy) => { let best = 1e9; const cx = Math.floor(gx / cell), cy = Math.floor(gy / cell); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const n of H.get((cx + a) + ',' + (cy + b)) || []) { const s = contour[n], A = S(...s[0]), B = S(...s[1]), P = S(gx, gy), d = segD(P[0], P[1], A, B); if (d < best) best = d; } return best; };
const dev = []; let length = 0;
let border = 0; for (const [a, b] of edges) { if ((a[0] <= 0 && b[0] <= 0) || (a[1] <= 0 && b[1] <= 0) || (a[0] >= GW && b[0] >= GW) || (a[1] >= GH && b[1] >= GH)) { border++; continue; } length += 1; for (let k = 0; k < 4; k++) { const t = (k + 0.5) / 4; const d = near(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); if (d < 1e8) dev.push(d); } }
dev.sort((x, y) => x - y);
const pct = (q) => dev[Math.floor(dev.length * q)];
// 3. staircase turns: count corners (direction changes) along the drawn coast per 100 tile edges
let corners = 0; const key = (p) => p[0] + ',' + p[1]; const adj = new Map(); for (const [a, b] of edges) { (adj.get(key(a)) || adj.set(key(a), []).get(key(a))).push(b); (adj.get(key(b)) || adj.set(key(b), []).get(key(b))).push(a); }
for (const [k, n] of adj) if (n.length === 2) { const [x, y] = k.split(',').map(Number), d1 = [n[0][0] - x, n[0][1] - y], d2 = [n[1][0] - x, n[1][1] - y]; if (d1[0] * d2[0] + d1[1] * d2[1] === 0) corners++; }
// 4. foam coverage: coastal edges that get the foam line (cliffs) vs all
const cliffEdges = cliffs.length;
// 5. beaches: coast tiles that are sand
let sand = 0, coastTiles = 0; for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) if (isL(i, j) && (!isL(i + 1, j) || !isL(i - 1, j) || !isL(i, j + 1) || !isL(i, j - 1))) { coastTiles++; const zm = (ZV[j * VW + i] + ZV[j * VW + i + 1] + ZV[(j + 1) * VW + i] + ZV[(j + 1) * VW + i + 1]) / 4; if (zm < 2.6) sand++; }
// 6. stride inflation: coarse cells drawn vs true land area
const infl = {}; for (const st of [2, 4, 8]) { const L = LAYOUT.lands[st]; let cells = 0; for (let k = 0; k < L.a.length; k++) cells += L.a[k]; let true_ = 0; for (let k = 0; k < land.length; k++) true_ += land[k]; infl[st] = +((cells * st * st) / true_).toFixed(3); }
const px1 = Math.hypot(32, 16); // screen length of one tile edge at zoom 1
console.log(JSON.stringify({
  landTiles: land.reduce((a, b) => a + b, 0), coastEdges: edges.length, mapBorderEdgesSkipped: border, nS, nE, nW, nN, stairCorners: corners, cornersPer100Edges: +(corners / edges.length * 100).toFixed(1),
  tileEdgeScreenPx: +px1.toFixed(1), devMeanPx: +(dev.reduce((a, b) => a + b, 0) / dev.length).toFixed(1), devP50: +pct(0.5).toFixed(1), devP95: +pct(0.95).toFixed(1), devMax: +dev[dev.length - 1].toFixed(1),
  cliffEdgesWithFoam: cliffEdges, foamShareOfCoastEdges: +(cliffEdges / edges.length).toFixed(3), coastTiles, sandCoastTiles: sand, sandShare: +(sand / coastTiles).toFixed(3), strideLandInflation: infl,
}, null, 1));
