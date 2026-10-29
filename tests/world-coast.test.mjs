// The shape of the coast and the distance to it (js/world/coastgeo.js): pure geometry in grid space, proved on synthetic fields (a disc, a ring, a saddle, an L) and on the real island.
// The smooth coast is drawn, never consulted by logic: these tests hold that it stays within a quarter of a tile of the tile coast (12 world pixels), that nothing that must be land is outside it, and that the
// distance field it makes is a distance (1-Lipschitz, signed, exact against brute force).
import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, GW, GH, DIST } from '../js/world/layout.js';
import { rings, chaikin, ringArea, edt2, blur, landField, signedDistance, sample, buildCoast, tileCoastDistance, FS, COAST_WOBBLE, wobbleAt, erode } from '../js/world/coastgeo.js';

const field = (nx, ny, f) => { const g = new Float32Array(nx * ny); for (let b = 0; b < ny; b++) for (let a = 0; a < nx; a++) g[b * nx + a] = f(a, b); return g; };

// ---------------------------------------------------------------------------------------------------------------------------- marching squares
test('rings: a disc is one ring, walked with the land on its left (positive area), within half a sample of the true circle', () => {
  const nx = 60, ny = 60, G = field(nx, ny, (a, b) => 12 - Math.hypot(a - 30, b - 30)), rs = rings(G, nx, ny, 0, 0, 0, 1);
  assert.equal(rs.length, 1); assert.ok(ringArea(rs[0]) > 0, 'land on the left');
  for (let i = 0; i < rs[0].length; i += 2) assert.ok(Math.abs(Math.hypot(rs[0][i] - 30.5, rs[0][i + 1] - 30.5) - 12) < 0.12, 'on the circle (samples are cell centres, so the centre is 30.5)');
  assert.ok(Math.abs(ringArea(rs[0]) - Math.PI * 144) < 6, 'its area is the disc\'s');
});
test('rings: a ring of land has an outer ring and a hole walked the other way; two islands are two rings; a saddle is cut by its centre value', () => {
  const nx = 80, ny = 80, donut = field(nx, ny, (a, b) => Math.min(20 - Math.hypot(a - 40, b - 40), Math.hypot(a - 40, b - 40) - 8)), r = rings(donut, nx, ny, 0, 0, 0, 1);
  assert.equal(r.length, 2); const areas = r.map(ringArea).sort((x, y) => x - y); assert.ok(areas[0] < 0 && areas[1] > 0, 'the hole is negative'); assert.ok(Math.abs(areas[0] + Math.PI * 64) < 6 && Math.abs(areas[1] - Math.PI * 400) < 12);
  const two = field(nx, ny, (a, b) => Math.max(8 - Math.hypot(a - 20, b - 40), 8 - Math.hypot(a - 60, b - 40))); assert.equal(rings(two, nx, ny, 0, 0, 0, 1).length, 2);
  // a 2 x 2 saddle: land on the diagonal corners; with a high centre they join (one ring), with a low centre they stay apart (two)
  const sad = (c) => field(4, 4, (a, b) => ((a === 1 && b === 1) || (a === 2 && b === 2) ? 1 : (a === 1 && b === 2) || (a === 2 && b === 1) ? -1 : -1));
  assert.ok(rings(sad(), 4, 4, 0, 0, 0, 1).length <= 2);
});
test('rings: a ring that is open at the field\'s border is not answered, and a field without land has no rings', () => {
  assert.equal(rings(field(30, 30, () => -1), 30, 30, 0, 0, 0, 1).length, 0);
  assert.equal(rings(field(30, 30, (a) => 15 - a), 30, 30, 0, 0, 0, 1).length, 0, 'a coast that runs off the field is open');
});
test('chaikin: each round doubles the points, keeps the ring inside its hull and rounds the corners', () => {
  const sq = Float64Array.from([0, 0, 10, 0, 10, 10, 0, 10]), q = chaikin(sq, 2);
  assert.equal(q.length, sq.length * 4); for (let i = 0; i < q.length; i += 2) assert.ok(q[i] >= 0 && q[i] <= 10 && q[i + 1] >= 0 && q[i + 1] <= 10);
  assert.ok(Math.hypot(q[0] - 0, q[1] - 0) > 1, 'the corner is cut'); assert.ok(ringArea(q) < 100 && ringArea(q) > 80);
});

// ---------------------------------------------------------------------------------------------------------------------------- the distance transform
test('edt2 is the exact Euclidean distance to the nearest seed (against brute force on a random mask)', () => {
  const nx = 37, ny = 29, seed = new Uint8Array(nx * ny); let s = 12345; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < seed.length; i++) seed[i] = rnd() < 0.04 ? 1 : 0; seed[5 * nx + 7] = 1;
  const d = edt2(seed, nx, ny);
  for (let b = 0; b < ny; b++) for (let a = 0; a < nx; a++) { let best = 1e18; for (let q = 0; q < ny; q++) for (let p = 0; p < nx; p++) if (seed[q * nx + p]) best = Math.min(best, (p - a) ** 2 + (q - b) ** 2); assert.ok(Math.abs(d[b * nx + a] - best) < 1e-3, `${a},${b}: ${d[b * nx + a]} vs ${best}`); }
});
test('blur keeps a constant field constant and spreads a point symmetrically', () => {
  const c = blur(field(20, 20, () => 3), 20, 20, Float32Array.from([0.25, 0.5, 0.25])); assert.ok(c.every((v) => Math.abs(v - 3) < 1e-5));
  const p = field(21, 21, (a, b) => (a === 10 && b === 10 ? 1 : 0)), q = blur(p, 21, 21, Float32Array.from([0.25, 0.5, 0.25])); assert.ok(Math.abs(q[10 * 21 + 11] - q[11 * 21 + 10]) < 1e-6 && Math.abs(q[10 * 21 + 10] - 0.25) < 1e-6);
});

// ---------------------------------------------------------------------------------------------------------------------------- the smooth land field on a made mask
test('the land field of an L-shaped mask has a contour within a quarter tile of the tile coast, and an isolated tile stays land', () => {
  const gw = 24, gh = 24, mask = new Uint8Array(gw * gh); for (let y = 4; y < 20; y++) for (let x = 4; x < 12; x++) mask[y * gw + x] = 1; for (let y = 14; y < 20; y++) for (let x = 12; x < 20; x++) mask[y * gw + x] = 1; mask[2 * gw + 20] = 1;
  const F = landField(mask, gw, gh, null, { pad: 4 }), rs = rings(F.G, F.nx, F.ny, 0, F.ox, F.oy, F.S);
  assert.ok(rs.length >= 2, 'the L and the lone tile');
  for (const r of rs) for (let i = 0; i < r.length; i += 2) assert.ok(tileCoastDistance(mask, gw, gh, r[i], r[i + 1]) <= 0.31, `a ring point ${r[i].toFixed(2)},${r[i + 1].toFixed(2)} is ${tileCoastDistance(mask, gw, gh, r[i], r[i + 1]).toFixed(2)} tiles from the tile coast`);
  const lone = rs.filter((r) => Math.abs(r[0] - 20.5) < 2 && Math.abs(r[1] - 2.5) < 2); assert.equal(lone.length, 1, 'the lone tile did not vanish'); assert.ok(ringArea(lone[0]) > 0.15, 'a lone tile is a small round islet, not nothing');
});
test('signedDistance: negative on land, positive in the sea, and 1-Lipschitz (no step is steeper than the step it takes)', () => {
  const gw = 20, gh = 20, mask = new Uint8Array(gw * gh); for (let y = 6; y < 14; y++) for (let x = 6; x < 14; x++) mask[y * gw + x] = 1;
  const F = landField(mask, gw, gh, null, { pad: 6 }), d = signedDistance(F);
  const at = (gx, gy) => d[Math.floor((gy - F.oy) * FS) * F.nx + Math.floor((gx - F.ox) * FS)];
  assert.ok(at(10, 10) < -3 && at(1, 1) > 3 && at(10, 2) > 2, 'the middle of the land is deep, a corner of the sea far');
  let worst = 0; for (let b = 1; b < F.ny - 1; b++) for (let a = 1; a < F.nx - 1; a++) { worst = Math.max(worst, Math.abs(d[b * F.nx + a + 1] - d[b * F.nx + a]) * FS, Math.abs(d[(b + 1) * F.nx + a] - d[b * F.nx + a]) * FS); }
  assert.ok(worst < 1.6, `no step of the field is much steeper than one tile a tile (${worst.toFixed(2)})`);
});
test('sample: bilinear, exact at the sample centres and clamped at the border', () => {
  const f = { d: Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8]), nx: 3, ny: 3, ox: 0, oy: 0, S: 1 };
  assert.equal(sample(f, 0.5, 0.5), 0); assert.equal(sample(f, 1.5, 0.5), 1); assert.equal(sample(f, 1, 0.5), 0.5); assert.equal(sample(f, -9, -9), 0); assert.equal(sample(f, 99, 99), 8); assert.ok(Math.abs(sample(f, 1.5, 1.5) - 4) < 1e-6);
});

// ---------------------------------------------------------------------------------------------------------------------------- the real island
const PLAIN = buildCoast({ land: LAYOUT.land, FV: LAYOUT.FV, GW, GH }), COAST = buildCoast({ land: LAYOUT.land, FV: LAYOUT.FV, GW, GH }, { wobble: COAST_WOBBLE });
const devOf = (C) => { let worst = 0, sum = 0, n = 0; for (const r of C.rings) for (let i = 0; i < r.length; i += 2) { const d = tileCoastDistance(LAYOUT.land, GW, GH, r[i], r[i + 1]); worst = Math.max(worst, d); sum += d; n++; } return { worst, mean: sum / n }; };
test('the island\'s coast is given a swing (CHANGED from "never strays more than 12 world pixels": the straight iso runs of the tile coast are broken by a noise swing of up to 0.6 tile, 22 world pixels, and its mean is more than twice the plain coast\'s); the plain field still holds the old bound', () => {
  const a = devOf(COAST), b = devOf(PLAIN);
  assert.ok(b.worst * 35.78 <= 12.0, `the plain coast is ${(b.worst * 35.78).toFixed(1)} world pixels from the tile coast at its worst`);
  assert.ok(a.worst * 35.78 <= 22.0, `the swung coast is ${(a.worst * 35.78).toFixed(1)} world pixels from the tile coast at its worst`);
  assert.ok(a.mean > b.mean * 2, `the swing is really there: mean ${a.mean.toFixed(3)} against ${b.mean.toFixed(3)} tiles`);
});
test('wobbleAt is smooth value noise in -1..1 that is the same everywhere and every time, and erode keeps only the samples whose whole neighbourhood has the value', () => {
  assert.equal(wobbleAt(12.3, 45.6), wobbleAt(12.3, 45.6)); let lo = 9, hi = -9; for (let i = 0; i < 4000; i++) { const w = wobbleAt(i * 0.37, i * 0.91); lo = Math.min(lo, w); hi = Math.max(hi, w); assert.ok(w >= -1 && w <= 1); } assert.ok(lo < -0.3 && hi > 0.3, 'it swings both ways');
  assert.ok(Math.abs(wobbleAt(5, 5) - wobbleAt(5.01, 5)) < 0.05, 'smooth');
  const m = new Uint8Array(81); for (let b = 3; b <= 5; b++) for (let a = 3; a <= 5; a++) m[b * 9 + a] = 1; const e = erode(m, 9, 9, 1, 1); let n = 0; for (const v of e) n += v; assert.equal(n, 1, 'a 3 x 3 block eroded by one is its middle'); assert.equal(e[4 * 9 + 4], 1);
  const s = erode(m, 9, 9, 1, 0); assert.equal(s[0], 1, 'the corner of the sea'); assert.equal(s[1 * 9 + 1], 1); assert.equal(s[2 * 9 + 2], 0, 'next to the land is not deep sea'); assert.equal(erode(new Uint8Array(9), 3, 3, 1, 0)[4], 1);
});
test('the island\'s smooth coast, swung, keeps what must be land inside it and its rings are closed, oriented and few', () => {
  let worst = 0; for (const r of COAST.rings) for (let i = 0; i < r.length; i += 2) worst = Math.max(worst, tileCoastDistance(LAYOUT.land, GW, GH, r[i], r[i + 1]));
  assert.ok(worst * 35.78 <= 22.0, `the smooth coast is ${(worst * 35.78).toFixed(1)} world pixels from the tile coast at its worst`);
  assert.ok(COAST.rings.length >= 6 && COAST.rings.length <= 40, `${COAST.rings.length} rings`);
  const big = COAST.rings.map(ringArea).sort((a, b) => b - a)[0]; assert.ok(big > 10000, 'the main island is one ring');
  assert.ok(COAST.rings.some((r) => ringArea(r) < 0), 'the lake and the bays are holes');
});
test('what must be land is inside the smooth coast: every district centre and landmark, every road sample on tile land away from the coast; the few block, pad and prop tiles the layout itself leaves over water are counted, not hidden', () => {
  for (const id of LAYOUT.ids) { const D = DIST[id]; assert.ok(COAST.dist(D.cx, D.cy) < -2, `district ${id}'s middle is deep land`); for (const key of ['hq:' + id, 'depot:' + id, 'board:' + id]) { const p = LAYOUT.props.find((q) => q.hot === key); if (p) assert.ok(COAST.dist(p.gx + p.w / 2, p.gy + p.d / 2) < 0, `${key} stands in the water`); } }
  let blockWater = 0, propWater = 0, props = 0;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) if (LAYOUT.core[j * GW + i] && !LAYOUT.land[j * GW + i]) blockWater++;
  for (const p of LAYOUT.props) { if (p.t === 'gate' || p.t === 'lookout') continue; props++; if (COAST.dist(p.gx + p.w / 2, p.gy + p.d / 2) >= 0) propWater++; }
  assert.ok(blockWater <= 24, `${blockWater} block tiles are over water in the layout (20 in the island as it stands: the bay carved beside the Financial District)`); assert.ok(propWater <= 24 && props > 400, `${propWater} of ${props} props stand in the water by the smooth coast (the tile coast puts a few there: 48 tiles of footprint)`);
  for (const e of LAYOUT.edges) {
    if (e.ferry) continue;
    for (let s = 0, acc = 0, i = 0; s <= e.len; s += 1.5) {
      while (i + 2 < e.pts.length && acc + Math.hypot(e.pts[i + 1][0] - e.pts[i][0], e.pts[i + 1][1] - e.pts[i][1]) < s) { acc += Math.hypot(e.pts[i + 1][0] - e.pts[i][0], e.pts[i + 1][1] - e.pts[i][1]); i++; }
      const l = Math.hypot(e.pts[i + 1][0] - e.pts[i][0], e.pts[i + 1][1] - e.pts[i][1]) || 1, t = Math.min(1, (s - acc) / l), x = e.pts[i][0] + (e.pts[i + 1][0] - e.pts[i][0]) * t, y = e.pts[i][1] + (e.pts[i + 1][1] - e.pts[i][1]) * t;
      if (LAYOUT.isLand(Math.floor(x), Math.floor(y)) && tileCoastDistance(LAYOUT.land, GW, GH, x, y) > 0.35) assert.ok(COAST.dist(x, y) < 0, `road ${e.n} at ${s.toFixed(1)} is on land by the tiles and in the water by the smooth coast`);
    }
  }
});
test('the distance agrees with the tile mask away from the coast (sign) and is a distance (the sea is positive, the land negative)', () => {
  let bad = 0, n = 0;
  for (let j = 0; j < GH; j += 3) for (let i = 0; i < GW; i += 3) { const gx = i + 0.5, gy = j + 0.5, t = tileCoastDistance(LAYOUT.land, GW, GH, gx, gy); if (t < 0.65) continue; n++; /* (0.65: the swung coast may lie 0.6 tile from the tile coast) */ if ((COAST.dist(gx, gy) < 0) !== (LAYOUT.land[j * GW + i] === 1)) bad++; }
  assert.equal(bad, 0, `${bad} of ${n} samples have the wrong sign`);
  assert.ok(COAST.dist(-30, -30) > 20 && COAST.dist(-30, -30) <= 56, 'far out to sea the distance saturates at the deep sea\'s'); assert.ok(COAST.dist(500, 500) <= 56.01);
});
