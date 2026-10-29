// The shape of the coast and the distance to it: pure geometry in GRID space (tiles), no drawing and no DOM, so Node tests it and the shot rig renders it.
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md).
//
// What it makes, from the tile land mask of layout.js (which stays the only thing logic reads):
//   1. a smooth land field G on FS samples per tile: the mask blurred, bent towards the generator's own continuous field FV (so the coast has the organic shape the island was made with) and then
//      CLAMPED so its zero contour never strays more than one sample (a quarter tile, 8.9 world pixels) from the tile coast: the smooth coast never retreats over a road, block or prop
//      (everything that must be land is deep in the mask) and never advances more than the same distance into the water;
//   2. the rings of that coast (marching squares on G, then one Chaikin pass) in grid coordinates: the outer coasts, the lakes and the islets;
//   3. a signed distance field SD (tiles, positive in the sea, negative on land) on the same samples: an exact Euclidean transform of the smooth land, with its first samples corrected to sub-sample
//      accuracy from G, plus a coarse field out to 56 tiles for the deep sea.
// Everything here is a function of the land mask and nothing else: the same layout gives the same bytes.
import { clamp } from './iso.js';

export const FS = 4;          // field samples per tile (one sample is 0.25 tile, 8.9 world pixels along a tile edge)
export const FPAD = 14;       // tiles of sea kept round the island in the fine field
export const CPAD = 56;       // tiles of sea kept round the island in the coarse field (one sample a tile)
export const FAR_D = 56;      // the distance the deep sea is measured to (tiles)

// ---------------------------------------------------------------- the smooth land field
/** A gaussian kernel of radius r (weights sum to 1). */
const kernel = (sigma, r) => { const k = new Float32Array(2 * r + 1); let s = 0; for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + r]; } for (let i = 0; i < k.length; i++) k[i] /= s; return k; };
/** Separable blur of an nx x ny field with a symmetric kernel, edges clamped. Answers a new Float32Array (the input is kept). */
export function blur(src, nx, ny, k) {
  const r = (k.length - 1) >> 1, tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let b = 0; b < ny; b++) { const row = b * nx; for (let a = 0; a < nx; a++) { let s = 0; for (let i = -r; i <= r; i++) { const aa = a + i < 0 ? 0 : a + i >= nx ? nx - 1 : a + i; s += src[row + aa] * k[i + r]; } tmp[row + a] = s; } }
  for (let b = 0; b < ny; b++) for (let a = 0; a < nx; a++) { let s = 0; for (let i = -r; i <= r; i++) { const bb = b + i < 0 ? 0 : b + i >= ny ? ny - 1 : b + i; s += tmp[bb * nx + a] * k[i + r]; } out[b * nx + a] = s; }
  return out;
}

/**
 * The smooth land field. `mask` is the tile land mask (GW x GH bytes), `FV` the generator's continuous field on the (GW+1) x (GH+1) vertex grid (or null). The field has nx x ny samples at FS per
 * tile over [-FPAD, GW + FPAD] x [-FPAD, GH + FPAD]; a sample (a, b) stands at grid position (ox + (a + 0.5) / FS, oy + (b + 0.5) / FS). G is positive on land, negative in the sea.
 */
export function landField(mask, GW, GH, FV, o = {}) {
  const pad = o.pad ?? FPAD, sigma = o.sigma ?? 1.7, ox = -pad, oy = -pad, nx = (GW + 2 * pad) * FS, ny = (GH + 2 * pad) * FS, VW = GW + 1;
  const m = new Uint8Array(nx * ny);
  for (let b = 0; b < ny; b++) { const ty = Math.floor(oy + (b + 0.5) / FS); if (ty < 0 || ty >= GH) continue; for (let a = 0; a < nx; a++) { const tx = Math.floor(ox + (a + 0.5) / FS); if (tx >= 0 && tx < GW && mask[ty * GW + tx]) m[b * nx + a] = 1; } }
  const f0 = new Float32Array(nx * ny); for (let i = 0; i < f0.length; i++) f0[i] = m[i];
  const G = blur(f0, nx, ny, kernel(sigma, Math.ceil(sigma * 3)));
  const bend = o.bend ?? 0.55, lim = o.limit ?? 0.2;
  for (let b = 0; b < ny; b++) for (let a = 0; a < nx; a++) {
    const i = b * nx + a; let g = G[i] - 0.5;
    if (FV && bend) { // the generator's own field, bilinear on the vertex grid: its zero is the coast the island was made with
      const gx = ox + (a + 0.5) / FS, gy = oy + (b + 0.5) / FS;
      if (gx > 0 && gy > 0 && gx < GW && gy < GH) { const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0, v = (FV[y0 * VW + x0] * (1 - fx) + FV[y0 * VW + x0 + 1] * fx) * (1 - fy) + (FV[(y0 + 1) * VW + x0] * (1 - fx) + FV[(y0 + 1) * VW + x0 + 1] * fx) * fy; g += clamp(v * 1.4, -lim, lim) * bend; }
    }
    G[i] = g;
  }
  // the clamp: a sample whose whole 4-neighbourhood is land is land, one whose whole 4-neighbourhood is sea is sea. The contour then stays within one sample of the tile coast.
  const at = (a, b) => (a < 0 || b < 0 || a >= nx || b >= ny ? 0 : m[b * nx + a]);
  for (let b = 0; b < ny; b++) for (let a = 0; a < nx; a++) {
    const i = b * nx + a, c = at(a, b) + at(a - 1, b) + at(a + 1, b) + at(a, b - 1) + at(a, b + 1);
    if (c === 5 && G[i] < 0.03) G[i] = 0.03; else if (c === 0 && G[i] > -0.03) G[i] = -0.03;
  }
  return { G, nx, ny, ox, oy, S: FS, GW, GH };
}

// ---------------------------------------------------------------- marching squares: the rings of a field
// Edge ids: the horizontal edge from sample (a, b) to (a + 1, b) is 2 (b nx + a), the vertical one from (a, b) to (a, b + 1) is 2 (b nx + a) + 1.
// Every segment is oriented with the field above `level` on its LEFT (x to the right, y up in the formal sense), so a ring of land is walked one way and a lake in it the other.
const SEG = [null, [['B', 'L']], [['R', 'B']], [['R', 'L']], [['T', 'R']], null, [['T', 'B']], [['T', 'L']], [['L', 'T']], [['B', 'T']], null, [['R', 'T']], [['L', 'R']], [['B', 'R']], [['L', 'B']], null];
/**
 * The closed rings of the level set of an nx x ny field (sample (a, b) at grid (ox + (a + .5) / S, oy + (b + .5) / S)). Answers an array of Float64Array [x0, y0, x1, y1, ...] in grid units.
 * A ring that touches the field's border is left open at it and is not answered (the fields are padded with sea so the land never reaches it).
 */
export function rings(G, nx, ny, level, ox, oy, S) {
  const next = new Map(), eid = (a, b, v) => 2 * (b * nx + a) + (v ? 1 : 0);
  for (let b = 0; b < ny - 1; b++) for (let a = 0; a < nx - 1; a++) {
    const v0 = G[b * nx + a], v1 = G[b * nx + a + 1], v2 = G[(b + 1) * nx + a + 1], v3 = G[(b + 1) * nx + a];
    const c = (v0 > level ? 1 : 0) | (v1 > level ? 2 : 0) | (v2 > level ? 4 : 0) | (v3 > level ? 8 : 0);
    if (c === 0 || c === 15) continue;
    const E = { B: eid(a, b, 0), T: eid(a, b + 1, 0), L: eid(a, b, 1), R: eid(a + 1, b, 1) };
    let segs = SEG[c];
    if (c === 5) segs = (v0 + v1 + v2 + v3) / 4 > level ? [['B', 'R'], ['T', 'L']] : [['B', 'L'], ['T', 'R']];
    else if (c === 10) segs = (v0 + v1 + v2 + v3) / 4 > level ? [['L', 'B'], ['R', 'T']] : [['R', 'B'], ['L', 'T']];
    for (const [f, t] of segs) next.set(E[f], E[t]);
  }
  const point = (id) => { // where the level set crosses an edge
    const vert = id & 1, k = id >> 1, b = Math.floor(k / nx), a = k - b * nx, v0 = G[b * nx + a], v1 = vert ? G[(b + 1) * nx + a] : G[b * nx + a + 1], t = (level - v0) / (v1 - v0 || 1e-9);
    return vert ? [ox + (a + 0.5) / S, oy + (b + 0.5 + t) / S] : [ox + (a + 0.5 + t) / S, oy + (b + 0.5) / S];
  };
  const out = [], seen = new Set();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const pts = []; let id = start, closed = false;
    for (let guard = 0; guard < 4e6; guard++) { seen.add(id); const p = point(id); pts.push(p[0], p[1]); const n = next.get(id); if (n === undefined) break; if (n === start) { closed = true; break; } if (seen.has(n)) break; id = n; }
    if (closed && pts.length >= 12) out.push(Float64Array.from(pts));
  }
  return out;
}
/** One round of Chaikin corner cutting of a closed ring (the points double): the ring keeps its shape within a quarter of its longest edge and loses its kinks. */
export function chaikin(ring, rounds = 1) {
  let p = ring;
  for (let r = 0; r < rounds; r++) {
    const n = p.length / 2, q = new Float64Array(p.length * 2);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n, x0 = p[2 * i], y0 = p[2 * i + 1], x1 = p[2 * j], y1 = p[2 * j + 1]; q[4 * i] = 0.75 * x0 + 0.25 * x1; q[4 * i + 1] = 0.75 * y0 + 0.25 * y1; q[4 * i + 2] = 0.25 * x0 + 0.75 * x1; q[4 * i + 3] = 0.25 * y0 + 0.75 * y1; }
    p = q;
  }
  return p;
}
/** The signed area of a ring (positive when the field above the level lay on its left in the formal x-right, y-up sense, which is how `rings` walks it). */
export function ringArea(p) { let s = 0; const n = p.length / 2; for (let i = 0; i < n; i++) { const j = (i + 1) % n; s += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1]; } return s / 2; }

// ---------------------------------------------------------------- the distance transform
/** Felzenszwalb and Huttenlocher's exact squared Euclidean distance transform of a sampled function along one line (in place over `f`, scratch `v`, `z`). */
function edt1(f, n, v, z, d) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    for (;;) { const p = v[k]; s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p); if (s <= z[k] && k > 0) k--; else break; }
    if (s <= z[k]) { v[0] = q; z[0] = -Infinity; z[1] = Infinity; k = 0; continue; }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + f[p]; }
}
/** Exact squared Euclidean distance (in samples) from every sample to the nearest sample where `seed[i]` is 1 (Infinity when there is none). */
export function edt2(seed, nx, ny) {
  const INF = 1e20, g = new Float32Array(nx * ny), n = Math.max(nx, ny), v = new Int32Array(n), z = new Float64Array(n + 1), f = new Float64Array(n), d = new Float64Array(n);
  for (let a = 0; a < nx; a++) { for (let b = 0; b < ny; b++) f[b] = seed[b * nx + a] ? 0 : INF; edt1(f, ny, v, z, d); for (let b = 0; b < ny; b++) g[b * nx + a] = d[b]; }
  for (let b = 0; b < ny; b++) { for (let a = 0; a < nx; a++) f[a] = g[b * nx + a]; edt1(f, nx, v, z, d); for (let a = 0; a < nx; a++) g[b * nx + a] = d[a]; }
  return g;
}

/**
 * The signed distance field of the smooth coast on its own samples: tiles, positive in the sea, negative on land. The distance is the exact transform (to the nearest sample of the other kind, less half
 * a sample, which is where the coast lies on average) and, for the samples next to the coast, the first-order distance G / |grad G| read from the field itself, which is accurate to a few hundredths of a
 * sample where the transform is only good to half of one. The two are blended over the second and third sample.
 */
export function signedDistance(F) {
  const { G, nx, ny, S } = F, n = nx * ny, land = new Uint8Array(n), sea = new Uint8Array(n);
  for (let i = 0; i < n; i++) { if (G[i] > 0) land[i] = 1; else sea[i] = 1; }
  const dSea = edt2(land, nx, ny), dLand = edt2(sea, nx, ny), out = new Float32Array(n);
  for (let b = 0; b < ny; b++) for (let a = 0; a < nx; a++) {
    const i = b * nx + a, isLand = land[i] === 1, d2 = isLand ? dLand[i] : dSea[i];
    let d = Math.max(0.3, Math.sqrt(d2) - 0.5); // samples to the coast
    if (d < 3.2 && a > 0 && b > 0 && a < nx - 1 && b < ny - 1) {
      const gx = (G[i + 1] - G[i - 1]) / 2, gy = (G[i + nx] - G[i - nx]) / 2, gm = Math.hypot(gx, gy);
      if (gm > 1e-4) { const e = Math.abs(G[i]) / gm, w = clamp((d - 1.2) / 2, 0, 1); d = e * (1 - w) + d * w; }
    }
    out[i] = (isLand ? -d : d) / S;
  }
  return out;
}
/** A coarse signed distance field (one sample a tile, to CPAD tiles round the island) taken from the fine one's land and sea: the deep sea only needs it to a tile. */
export function coarseDistance(F, pad = CPAD) {
  const { G, nx, ny, ox, oy, GW, GH } = F, cx = GW + 2 * pad, cy = GH + 2 * pad, land = new Uint8Array(cx * cy);
  for (let b = 0; b < cy; b++) for (let a = 0; a < cx; a++) { const gx = -pad + a + 0.5, gy = -pad + b + 0.5, fa = Math.floor((gx - ox) * FS), fb = Math.floor((gy - oy) * FS); if (fa >= 0 && fb >= 0 && fa < nx && fb < ny && G[fb * nx + fa] > 0) land[b * cx + a] = 1; }
  const d2 = edt2(land, cx, cy), out = new Float32Array(cx * cy);
  for (let i = 0; i < out.length; i++) out[i] = land[i] ? 0 : Math.min(FAR_D, Math.max(0.3, Math.sqrt(d2[i]) - 0.5));
  return { d: out, nx: cx, ny: cy, ox: -pad, oy: -pad, S: 1 };
}

/** A bilinear sample of a field `{ d, nx, ny, ox, oy, S }` at grid (gx, gy); positions outside it are clamped to its border. */
export function sample(f, gx, gy) {
  const { d, nx, ny, ox, oy, S } = f, u = (gx - ox) * S - 0.5, v = (gy - oy) * S - 0.5, a = Math.floor(u), b = Math.floor(v), fx = u - a, fy = v - b;
  const a0 = a < 0 ? 0 : a >= nx ? nx - 1 : a, a1 = a + 1 < 0 ? 0 : a + 1 >= nx ? nx - 1 : a + 1, b0 = b < 0 ? 0 : b >= ny ? ny - 1 : b, b1 = b + 1 < 0 ? 0 : b + 1 >= ny ? ny - 1 : b + 1;
  return (d[b0 * nx + a0] * (1 - fx) + d[b0 * nx + a1] * fx) * (1 - fy) + (d[b1 * nx + a0] * (1 - fx) + d[b1 * nx + a1] * fx) * fy;
}

/**
 * The whole coast of a layout: its smooth field, its rings (grid units, smoothed once more), the fine and coarse distance fields and `dist(gx, gy)`, the distance in tiles to the coast
 * (negative on land) from whichever field is better there. `layout` is { land, FV, GW, GH } (the arrays of buildLayout).
 */
export function buildCoast(layout, o = {}) {
  const F = landField(layout.land, layout.GW, layout.GH, layout.FV, o), fine = { d: signedDistance(F), nx: F.nx, ny: F.ny, ox: F.ox, oy: F.oy, S: FS }, coarse = coarseDistance(F);
  const rs = rings(F.G, F.nx, F.ny, 0, F.ox, F.oy, F.S).map((r) => chaikin(r, 1));
  const fx1 = F.ox + F.nx / FS, fy1 = F.oy + F.ny / FS;
  const dist = (gx, gy) => { // fine inside its own margin and near the coast, coarse beyond: blended over 10 to 12 tiles so no seam shows
    const inside = gx > F.ox + 0.5 && gy > F.oy + 0.5 && gx < fx1 - 0.5 && gy < fy1 - 0.5;
    if (!inside) return sample(coarse, gx, gy);
    const df = sample(fine, gx, gy); if (df < 10) return df;
    const dc = sample(coarse, gx, gy), w = clamp((df - 10) / 2, 0, 1); return df * (1 - w) + dc * w;
  };
  return { F, fine, coarse, rings: rs, dist, GW: layout.GW, GH: layout.GH };
}

/** The smallest distance (tiles) from a point to any edge of the tile mask's coast: for tests that hold the smooth coast to the tile coast. */
export function tileCoastDistance(mask, GW, GH, gx, gy) {
  const land = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH && mask[y * GW + x] === 1;
  let best = 1e9; const x0 = Math.floor(gx), y0 = Math.floor(gy);
  for (let y = y0 - 2; y <= y0 + 3; y++) for (let x = x0 - 2; x <= x0 + 3; x++) {
    const here = land(x, y);
    for (const [dx, dy, ax, ay, bx, by] of [[1, 0, x + 1, y, x + 1, y + 1], [0, 1, x, y + 1, x + 1, y + 1]]) { // the tile's east edge and south edge against the next tile
      if (here === land(x + dx, y + dy)) continue;
      const vx = bx - ax, vy = by - ay, t = clamp(((gx - ax) * vx + (gy - ay) * vy) / (vx * vx + vy * vy), 0, 1); best = Math.min(best, Math.hypot(gx - ax - vx * t, gy - ay - vy * t));
    }
  }
  return best;
}
