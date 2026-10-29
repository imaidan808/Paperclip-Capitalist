// The base of the picture, painted per pixel into a plain RGBA buffer: the sea (depth, foam, the island's glow and shadow, the haze), the cliff walls and the land (a Gouraud mesh of the terrain field with
// grain, beach, wet sand and an exact anti-aliased coast). Pure: typed arrays in, typed arrays out, no canvas, so Node tests it and renders it to a PNG and the browser bakes ground chunks with it.
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md). Art direction 5.1, 5.4 to 5.6, 5.8, 5.9, 5.10.
//
// A buffer covers a world rectangle: pixel (px, py) has its centre at world ((ox + (px + .5) / S), (oy + (py + .5) / S)), S device pixels to a world pixel. The sea and everything on the water
// plane read the grid position of a pixel at height 0 (gx = wx / 64 + wy / 32, gy = wy / 32 - wx / 64); the land reads the grid position and the height of the surface the pixel shows, which the
// rasteriser interpolates, so the coast, the beach and the grain are all functions of where a thing IS on the island and never of where it lands on the screen.
import { rgb, clamp, mix } from './iso.js';
import { seaRamp, SEA, SAND, GRASS, ROCK, ROCKHI, SKY, LIGHT } from './palette.js';
import { FS, FAR_D } from './coastgeo.js';
import { lnoise, vnoise, smooth } from './noise.js';

/** A fast integer hash of two cell indices to -0.5..0.5 (per-pixel grain and dither). */
const cellNoise = (ix, iy) => { let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h & 255) / 255 - 0.5; };
const HW = 32, HH = 16;
const TILE_PER_WPX = 1 / 25;       // tiles of coast distance per world pixel across the coast (it is 1/22.6 to 1/28.6 by the direction the coast runs): the width of one pixel in distance units

// ---------------------------------------------------------------- the scene: every table the passes read
const rgbf = (h) => { const c = rgb(h); return [c[0], c[1], c[2]]; };
const LUT_N = 8, LUT_LEN = FAR_D * LUT_N + 2;
/** The depth ramp as bytes, 8 entries a tile out to FAR_D (index = distance x 8). */
function seaLut() {
  const r = new Uint8Array(LUT_LEN), g = new Uint8Array(LUT_LEN), b = new Uint8Array(LUT_LEN);
  for (let i = 0; i < LUT_LEN; i++) { const c = rgb(seaRamp(Math.max(0.3, i / LUT_N))); r[i] = c[0]; g[i] = c[1]; b[i] = c[2]; }
  return { r, g, b };
}
/** The wave bands as a table by distance: soft ribbons of lighter water lying along the shore at 2, 4, 6, 8, 10, 12, 14, 17, 20, 24, 28 and 34 tiles (art direction 5.2), each wider the farther out it is. 0..1. */
export const BAND_LEVELS = Object.freeze([2, 4, 6, 8, 10, 12, 14, 17, 20, 24, 28, 34]);
function bandLut() {
  const t = new Float32Array(LUT_LEN);
  for (let i = 0; i < LUT_LEN; i++) { const d = i / LUT_N; let v = 0; for (const L of BAND_LEVELS) { const w = 0.13 + 0.012 * L, x = Math.abs(d - L) / w; if (x < 1) v = Math.max(v, 1 - x * x * (3 - 2 * x)); } t[i] = v; }
  return t;
}
/**
 * Everything a bake reads, made once per layout and unlock state: the coast, the terrain field, the sea's colour table and the palette tokens as float triples.
 * `bounds` is LAYOUT.bounds (the haze begins beyond it), `ZV`/`VW` the heights.
 */
export function makeScene(coast, terr, bounds, ZV, VW, GW, GH) {
  const walls = buildWalls(coast, ZV, VW, GW, GH);
  return {
    coast, terr, bounds, ZV, lut: seaLut(), band: bandLut(),
    foam: rgbf(SEA.foam), crest: rgbf(SEA.crest), shoal: rgbf(SEA.shoal), shadow: rgbf(mix(SEA.sea, LIGHT.shadow, 0.55)), haze: rgbf(mix(SKY.horizon, SKY.mid, 0.4)), glow: rgbf(mix(SEA.shoal, SEA.shallow, 0.5)),
    sandMid: rgbf(SAND.mid), sandLight: rgbf(SAND.light), sandHi: rgbf(SAND.hi), wet: rgbf(SAND.wet), wetSheen: rgbf(SAND.wetSheen), lip: rgbf(GRASS.shade), rock: rgbf(ROCK.mid), rockShade: rgbf(ROCK.shade), rockLight: rgbf(ROCK.light), rockHi: rgbf(ROCKHI.light), rockHiShade: rgbf(ROCKHI.shade), strata: rgbf(ROCK.strata), ao: rgbf(LIGHT.ao), walls,
  };
}

// ---------------------------------------------------------------- the sea
const SK = 16;                                 // the lattice the smooth part of the sea is evaluated on: one node every SK device pixels
let NODE = { n: 0, d: null, r: null, g: null, b: null, rr: null, rg: null, rb: null };
const nodes = (n) => { if (NODE.n < n) NODE = { n, d: new Float32Array(n), r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n), rr: new Float32Array(n), rg: new Float32Array(n), rb: new Float32Array(n) }; return NODE; };
/**
 * Paint the sea into the buffer: the depth ramp by distance to the coast (the fine field near the island, the coarse one beyond), a slow mottling, the glow of the shallows, the island's shadow on the
 * shade-facing coast and the haze beyond the map's bounds, all evaluated on a lattice of nodes eight pixels apart and interpolated (they are smooth); and, within two and a half tiles of the coast, the exact
 * distance per pixel with the foam line (white, scalloped by noise, anti-aliased to the pixel) and its broken trail. Cells wholly under the land are left alone: the land is drawn over them.
 */
export function seaPass(buf, W, H, S, ox, oy, sc, skipLand = false) {
  const ids = IDS, useIds = skipLand && LAND_N > 0;
  const fine = sc.coast.fine, coarse = sc.coast.coarse, fd = fine.d, fnx = fine.nx, fox = fine.ox, foy = fine.oy, cd = coarse.d, cnx = coarse.nx, cny = coarse.ny, cox = coarse.ox, coy = coarse.oy;
  const lr = sc.lut.r, lg = sc.lut.g, lb = sc.lut.b, B = sc.bounds, foam = sc.foam, hz = sc.haze, sh = sc.shadow, glow = sc.glow, inv = 1 / S, aa = TILE_PER_WPX * inv;
  const fx1 = fox + fine.nx / FS - 0.5, fy1 = foy + fine.ny / FS - 0.5, fx0 = fox + 0.5, fy0 = foy + 0.5, hcx = (B.x0 + B.x1) / 2, hcy = (B.y0 + B.y1) / 2, ha0 = (B.x1 - B.x0) / 2, hb = (B.y1 - B.y0) / 2;
  const fineAt = (gx, gy) => { const u = (gx - fox) * FS - 0.5, v = (gy - foy) * FS - 0.5, a = Math.floor(u), b = Math.floor(v), tx = u - a, ty = v - b, i = b * fnx + a; return (fd[i] * (1 - tx) + fd[i + 1] * tx) * (1 - ty) + (fd[i + fnx] * (1 - tx) + fd[i + fnx + 1] * tx) * ty; };
  const coarseAt = (gx, gy) => { const u = clamp(gx - cox - 0.5, 0, cnx - 1.001), v = clamp(gy - coy - 0.5, 0, cny - 1.001), a = Math.floor(u), b = Math.floor(v), tx = u - a, ty = v - b, i = b * cnx + a; return (cd[i] * (1 - tx) + cd[i + 1] * tx) * (1 - ty) + (cd[i + cnx] * (1 - tx) + cd[i + cnx + 1] * tx) * ty; };
  const distAt = (gx, gy) => { if (gx > fx0 && gy > fy0 && gx < fx1 && gy < fy1) { const d = fineAt(gx, gy); if (d <= 10) return d; const w = d > 12 ? 1 : (d - 10) / 2; return d * (1 - w) + coarseAt(gx, gy) * w; } return coarseAt(gx, gy); };
  // ---- the lattice
  const NX = Math.ceil((W + 1) / SK) + 2, NY = Math.ceil((H + 1) / SK) + 2, N = nodes(NX * NY), nd = N.d, nr = N.r, ng = N.g, nb = N.b, qr = N.rr, qg = N.rg, qb = N.rb;
  for (let j = 0; j < NY; j++) {
    const wy = oy + (j * SK) * inv, ey = (wy - hcy) / hb, hv = smooth(0.6, 2.4, -ey) * 0.28;
    for (let i = 0; i < NX; i++) {
      const wx = ox + (i * SK) * inv, gx = wx / 64 + wy / 32, gy = wy / 32 - wx / 64, k = j * NX + i, d = distAt(gx, gy);
      const dd = d < 0 ? 0 : d, li = (dd > FAR_D ? FAR_D : dd) * LUT_N | 0, r0 = lr[li], g0 = lg[li], b0 = lb[li];
      let r = r0, g = g0, b = b0;
      const mo = (vnoise(gx * 0.11 + 31, gy * 0.11) - 0.5) * 0.07 + (lnoise(gx * 0.43, gy * 0.43 + 5) - 0.5) * 0.04; r += r * mo; g += g * mo; b += b * mo;
      if (d < 3.2) {
        const ds = distAt(gx - 0.5, gy - 0.12); // the island's shadow: the coast moved half a tile towards +gx (down and to the right on the screen), feathered over a tile and a bit
        if (ds < 1.3 && d > -0.5) { const a = (1 - smooth(-0.2, 1.3, ds)) * 0.3 * smooth(0, 0.35, d); if (a > 0) { r += (sh[0] - r) * a; g += (sh[1] - g) * a; b += (sh[2] - b) * a; } }
        const gl = (1 - smooth(0.2, 2.4, d)) * 0.22; if (gl > 0) { r += (glow[0] - r) * gl; g += (glow[1] - g) * gl; b += (glow[2] - b) * gl; } // the glow of the shallows hugging the coast
      }
      const ex = (wx - hcx) / ha0, ha = Math.min(0.93, smooth(1.0, 2.9, Math.sqrt(ex * ex + ey * ey)) * 0.88 + hv); // the haze: the sea goes pale and warm in an ellipse round the island, thicker the farther away it is (never a box)
      if (ha > 0) { r += (hz[0] - r) * ha; g += (hz[1] - g) * ha; b += (hz[2] - b) * ha; }
      nd[k] = d; nr[k] = r; ng[k] = g; nb[k] = b; qr[k] = r - r0; qg[k] = g - g0; qb[k] = b - b0; // the residual: everything but the ramp, which is exact per pixel near the coast
    }
  }
  // ---- the pixels: in 2 x 2 blocks where the sea is smooth (interpolated from the nodes), one pixel at a time within a tile and a half of the coast (the exact distance, the foam)
  const isk = 1 / SK, NEAR = 1.7;
  const band = sc.band, crest = sc.crest, bandAmp = smooth(0.2, 0.5, S); // the bands are ribbons a few pixels wide: they fade out as the scale falls (at the far zoom the depth, the foam and the glow carry the sea)
  const exact = (px, py, o, k, k1, k2, k3, tx, ty, nf, nt, nbk) => {
    const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty, di = nd[k] * w00 + nd[k1] * w10 + nd[k2] * w01 + nd[k3] * w11; // the lattice's own estimate of the distance
    if (di > 1.25) { buf[o] = nr[k] * w00 + nr[k1] * w10 + nr[k2] * w01 + nr[k3] * w11; buf[o + 1] = ng[k] * w00 + ng[k1] * w10 + ng[k2] * w01 + ng[k3] * w11; buf[o + 2] = nb[k] * w00 + nb[k1] * w10 + nb[k2] * w01 + nb[k3] * w11; buf[o + 3] = 255; return; }
    const wy = oy + (py + 0.5) * inv, wx = ox + (px + 0.5) * inv, gx = wx / 64 + wy / 32, gy = wy / 32 - wx / 64, d = fineAt(gx, gy), dd = d < 0 ? 0 : d, li = dd * LUT_N | 0;
    let r = lr[li] + qr[k] * w00 + qr[k1] * w10 + qr[k2] * w01 + qr[k3] * w11, g = lg[li] + qg[k] * w00 + qg[k1] * w10 + qg[k2] * w01 + qg[k3] * w11, b = lb[li] + qb[k] * w00 + qb[k1] * w10 + qb[k2] * w01 + qb[k3] * w11;
    if (d < 1.0) { // foam: a white line a few world pixels wide whose outer edge is scalloped by noise, and a thinner broken trail behind it
      const w1 = 0.1 + 0.075 * nf;
      let fa = clamp((w1 - d) / aa * 0.5 + 0.5, 0, 1);
      if (d > 0.25) { const tr = clamp((d - 0.3) / aa * 0.5 + 0.5, 0, 1) * clamp((0.58 - d) / aa * 0.5 + 0.5, 0, 1) * smooth(0.5, 0.72, nt) * 0.5; if (tr > fa) fa = tr; }
      if (fa > 0) { r += (foam[0] - r) * fa; g += (foam[1] - g) * fa; b += (foam[2] - b) * fa; }
    }
    const bv = band[li] * bandAmp; if (bv > 0.02) { const m = bv * 0.16 * nbk; r += (crest[0] - r) * m; g += (crest[1] - g) * m; b += (crest[2] - b) * m; }
    buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = 255;
  };
  for (let py = 0; py < H; py += 2) {
    const yc = py + 1, cj = Math.floor(yc * isk), ty = yc * isk - cj, py1 = py + 1 < H ? py + 1 : py;
    for (let px = 0; px < W; px += 2) {
      const xc = px + 1, ci = Math.floor(xc * isk), tx = xc * isk - ci, k = cj * NX + ci, k1 = k + 1, k2 = k + NX, k3 = k2 + 1, d00 = nd[k], d10 = nd[k1], d01 = nd[k2], d11 = nd[k3];
      const dmin = d00 < d10 ? (d00 < d01 ? (d00 < d11 ? d00 : d11) : (d01 < d11 ? d01 : d11)) : (d10 < d01 ? (d10 < d11 ? d10 : d11) : (d01 < d11 ? d01 : d11));
      if (useIds && ids[py * W + px] !== 0 && TRI[ids[py * W + px] * TS + 18] === 1 && ids[py1 * W + px] !== 0 && TRI[ids[py1 * W + px] * TS + 18] === 1 && px + 1 < W && ids[py * W + px + 1] !== 0 && TRI[ids[py * W + px + 1] * TS + 18] === 1) continue; // wholly under the land: its triangles are opaque
      if (dmin < -7) continue;
      if (dmin > NEAR) {
        const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
        let r = nr[k] * w00 + nr[k1] * w10 + nr[k2] * w01 + nr[k3] * w11, g = ng[k] * w00 + ng[k1] * w10 + ng[k2] * w01 + ng[k3] * w11, b = nb[k] * w00 + nb[k1] * w10 + nb[k2] * w01 + nb[k3] * w11;
        const dI = d00 * w00 + d10 * w10 + d01 * w01 + d11 * w11, bv = band[(dI > FAR_D ? FAR_D : dI) * LUT_N | 0] * bandAmp;
        if (bv > 0.02) { const bx = ox + xc * inv, by = oy + yc * inv, m = bv * 0.16 * smooth(0.42, 0.68, lnoise((bx / 64 + by / 32) * 0.55 + 21, (by / 32 - bx / 64) * 0.55 + 4)); r += (crest[0] - r) * m; g += (crest[1] - g) * m; b += (crest[2] - b) * m; } // soft ribbons of lighter water along the shore, broken by noise
        let o = (py * W + px) * 4, o2 = (py1 * W + px) * 4; const two = px + 1 < W;
        let q = cellNoise(px, py) * 2.2; buf[o] = r + q; buf[o + 1] = g + q; buf[o + 2] = b + q; buf[o + 3] = 255; q = cellNoise(px + 5, py1 + 3) * 2.2; buf[o2] = r + q; buf[o2 + 1] = g + q; buf[o2 + 2] = b + q; buf[o2 + 3] = 255; // (a level of dither, so the gradient is never a band)
        if (two) { q = cellNoise(px + 1, py + 9) * 2.2; buf[o + 4] = r + q; buf[o + 5] = g + q; buf[o + 6] = b + q; buf[o + 7] = 255; q = cellNoise(px + 8, py1 + 1) * 2.2; buf[o2 + 4] = r + q; buf[o2 + 5] = g + q; buf[o2 + 6] = b + q; buf[o2 + 7] = 255; }
      } else {
        const bx = ox + xc * inv, by = oy + yc * inv, bgx = bx / 64 + by / 32, bgy = by / 32 - bx / 64, nf = lnoise(bgx * 2.3 + 7, bgy * 2.3), nt = lnoise(bgx * 1.4 + 3, bgy * 1.4 + 11), nbk = smooth(0.42, 0.68, lnoise(bgx * 0.55 + 21, bgy * 0.55 + 4)); // the scallop noise varies over twenty pixels: one sample a block; the bands are broken by noise
        for (let qy = py; qy <= py1; qy++) for (let qx = px; qx <= px + 1 && qx < W; qx++) { if (useIds) { const id = ids[qy * W + qx]; if (id !== 0 && TRI[id * TS + 18] === 1) continue; } const cx = (qx + 0.5) * isk, cy = (qy + 0.5) * isk; exact(qx, qy, (qy * W + qx) * 4, k, k1, k2, k3, cx - ci, cy - cj, nf, nt, nbk); }
      }
    }
  }
}

// ---------------------------------------------------------------- rock: strata by absolute height
const RK = new Float64Array(3);
/**
 * The colour of a rock face at height `z` (pixels above the sea) and across position `xs` (the screen's x in tiles, gx - gy: the same on a wall and on the steep ground above it, so the layers run on
 * from one to the other): wavy strata nine pixels thick, stepping light to shade, sandstone below 40 pixels and lilac rock above, a line between layers never under 1.5 world pixels. Written into RK.
 */
function rockAt(sc, z, xs, wpxLine) {
  const bt = 9, wob = (lnoise(xs * 1.3, z * 0.035 + 3) - 0.5) * 5, q = (z + wob) / bt, k = Math.floor(q), fr = q - k, hi = z > 46 ? 1 : z < 34 ? 0 : (z - 34) / 12, t = clamp(1 - z / 100, 0, 1) * 0.75 + (k % 3) * 0.08;
  const rl = sc.rockLight, rs = sc.rockShade, hl = sc.rockHi, hs = sc.rockHiShade, st = sc.strata;
  let r = rl[0] + (rs[0] - rl[0]) * t, g = rl[1] + (rs[1] - rl[1]) * t, b = rl[2] + (rs[2] - rl[2]) * t;
  if (hi > 0) { const hr = hl[0] + (hs[0] - hl[0]) * t, hg = hl[1] + (hs[1] - hl[1]) * t, hb = hl[2] + (hs[2] - hl[2]) * t; r += (hr - r) * hi; g += (hg - g) * hi; b += (hb - b) * hi; }
  const grain = cellNoise(Math.floor(xs * 14), Math.floor(z * 0.9)) * 0.1; r += r * grain; g += g * grain; b += b * grain;
  if (fr * bt < wpxLine && k > 0) { r += (st[0] - r) * 0.62; g += (st[1] - g) * 0.62; b += (st[2] - b) * 0.62; }
  RK[0] = r; RK[1] = g; RK[2] = b;
}

// ---------------------------------------------------------------- the land: a Gouraud mesh of the terrain field, rasterised once and shaded once
// Painter's order (back to front by i + j) decides which triangle owns a pixel, but only the OWNER is shaded: phase 1 writes triangle ids, phase 2 evaluates each pixel's attributes from its triangle's
// plane equations and shades it, so a slope that is overdrawn three times costs one shading. Attributes per triangle: r, g, b, gx, gy, z as planes in buffer pixels (c0 + c1 x + c2 y), then deep, steep, light.
const TS = 24;
let TRI = new Float32Array(TS * 4096), IDS = new Int32Array(0), LAND_N = 0;
const triRoom = (n) => { if (TRI.length < n * TS) { const t = new Float32Array(Math.max(TRI.length * 2, n * TS)); t.set(TRI); TRI = t; } };
/**
 * Paint every land tile whose screen box meets the buffer as two Gouraud triangles of the terrain field. A pixel's colour is the interpolated vertex colour with a per-pixel grain; the pixels within two tiles
 * of the coast read the signed distance to it for the exact anti-aliased coast, the sand of the beach, its wet edge and a foam film, and the rounded lip of a cliff top; steep ground that faces the viewer is rock.
 */
export function landRaster(W, H, S, ox, oy, sc, view) {
  const T = sc.terr, { r: TR, g: TG, b: TB, z: TZ, inl: TI, mesh, VW, GW, GH } = T, fine = sc.coast.fine, fd = fine.d, fnx = fine.nx, fox = fine.ox, foy = fine.oy;
  const sandMid = sc.sandMid, sandLight = sc.sandLight, wet = sc.wet, wetSheen = sc.wetSheen, lip = sc.lip, foam = sc.foam;
  const wx0 = ox, wy0 = oy, wx1 = ox + W / S, wy1 = oy + H / S;
  let gx0 = 1e9, gx1 = -1e9, gy0 = 1e9, gy1 = -1e9;
  for (const [x, y] of [[wx0, wy0], [wx1, wy0], [wx0, wy1], [wx1, wy1]]) for (const zz of [0, view.maxZ]) { const a = x / 64 + (y + zz) / 32, b = (y + zz) / 32 - x / 64; gx0 = Math.min(gx0, a); gx1 = Math.max(gx1, a); gy0 = Math.min(gy0, b); gy1 = Math.max(gy1, b); }
  const i0 = Math.max(0, Math.floor(gx0) - 1), i1 = Math.min(GW - 1, Math.ceil(gx1) + 1), j0 = Math.max(0, Math.floor(gy0) - 1), j1 = Math.min(GH - 1, Math.ceil(gy1) + 1);
  const sxp = (gx, gy) => ((gx - gy) * HW - ox) * S, syp = (gx, gy, z) => (((gx + gy) * HH - z) - oy) * S;
  if (IDS.length < W * H) IDS = new Int32Array(W * H); const ids = IDS; ids.fill(0, 0, W * H);
  let nt = 0;
  const VAL = new Float64Array(18); // the three vertices' attributes, set by the caller of tri()
  const tri = (ax, ay, bx, by, cx, cy, deep, steep, fl) => {
    const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay); if (det > -1e-3 && det < 1e-3) return;
    const ys = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 0.5)), ye = Math.min(H - 1, Math.floor(Math.max(ay, by, cy) - 0.5)); if (ys > ye) return;
    const id = ++nt; triRoom(id + 1); const o = id * TS, idt = 1 / det;
    for (let q = 0; q < 6; q++) { const va = VAL[q], vb = VAL[6 + q], vc = VAL[12 + q], dxx = ((vb - va) * (cy - ay) - (vc - va) * (by - ay)) * idt, dyy = ((vc - va) * (bx - ax) - (vb - va) * (cx - ax)) * idt; TRI[o + q * 3] = va - ax * dxx - ay * dyy; TRI[o + q * 3 + 1] = dxx; TRI[o + q * 3 + 2] = dyy; }
    TRI[o + 18] = deep; TRI[o + 19] = steep; TRI[o + 20] = fl;
    for (let py = ys; py <= ye; py++) {
      const yc = py + 0.5; let xl = 1e9, xr = -1e9;
      if ((ay <= yc && by >= yc) || (by <= yc && ay >= yc)) { if (by !== ay) { const x = ax + (bx - ax) * (yc - ay) / (by - ay); if (x < xl) xl = x; if (x > xr) xr = x; } }
      if ((by <= yc && cy >= yc) || (cy <= yc && by >= yc)) { if (cy !== by) { const x = bx + (cx - bx) * (yc - by) / (cy - by); if (x < xl) xl = x; if (x > xr) xr = x; } }
      if ((cy <= yc && ay >= yc) || (ay <= yc && cy >= yc)) { if (ay !== cy) { const x = cx + (ax - cx) * (yc - cy) / (ay - cy); if (x < xl) xl = x; if (x > xr) xr = x; } }
      if (xl > xr) continue;
      const xs = Math.max(0, Math.ceil(xl - 0.85)), xe = Math.min(W - 1, Math.floor(xr + 0.35)); for (let px = xs, k = py * W + xs; px <= xe; px++, k++) ids[k] = id;
    }
  };
  for (let s = i0 + j0; s <= i1 + j1; s++) {
    for (let j = Math.max(j0, s - i1); j <= Math.min(j1, s - i0); j++) {
      const i = s - j; if (!mesh[j * GW + i]) continue;
      const ka = j * VW + i, kb = ka + 1, kc = ka + VW + 1, kd = ka + VW, zA = TZ[ka], zB = TZ[kb], zC = TZ[kc], zD = TZ[kd];
      const xA = sxp(i, j), yA = syp(i, j, zA), xB = sxp(i + 1, j), yB = syp(i + 1, j, zB), xC = sxp(i + 1, j + 1), yC = syp(i + 1, j + 1, zC), xD = sxp(i, j + 1), yD = syp(i, j + 1, zD);
      if (Math.max(xA, xB, xC, xD) < -1 || Math.min(xA, xB, xC, xD) > W + 1 || Math.max(yA, yB, yC, yD) < -1 || Math.min(yA, yB, yC, yD) > H + 1) continue;
      const deep = TI[ka] < -2.4 && TI[kb] < -2.4 && TI[kc] < -2.4 && TI[kd] < -2.4 ? 1 : 0;
      const dzx = ((zB + zC) - (zA + zD)) / 2, dzy = ((zD + zC) - (zA + zB)) / 2, stp = Math.hypot(dzx, dzy), steep = dzx + dzy < 0.15 * stp ? stp : 0, fl = stp > 0.01 ? clamp((dzx - dzy) / stp, -1, 1) : 0; // only a face that looks towards the viewer is shown as rock
      const put = (n, key, gx, gy, z) => { VAL[n * 6] = TR[key]; VAL[n * 6 + 1] = TG[key]; VAL[n * 6 + 2] = TB[key]; VAL[n * 6 + 3] = gx; VAL[n * 6 + 4] = gy; VAL[n * 6 + 5] = z; };
      if (Math.abs(zA - zC) <= Math.abs(zB - zD)) { put(0, ka, i, j, zA); put(1, kb, i + 1, j, zB); put(2, kc, i + 1, j + 1, zC); tri(xA, yA, xB, yB, xC, yC, deep, steep, fl); put(1, kc, i + 1, j + 1, zC); put(2, kd, i, j + 1, zD); tri(xA, yA, xC, yC, xD, yD, deep, steep, fl); }
      else { put(0, ka, i, j, zA); put(1, kb, i + 1, j, zB); put(2, kd, i, j + 1, zD); tri(xA, yA, xB, yB, xD, yD, deep, steep, fl); put(0, kb, i + 1, j, zB); put(1, kc, i + 1, j + 1, zC); put(2, kd, i, j + 1, zD); tri(xB, yB, xC, yC, xD, yD, deep, steep, fl); }
    }
  }
  LAND_N = nt;
}
/** Phase 2: shade each pixel once, from the plane equations of the triangle that owns it (landRaster ran first, for the same buffer). */
export function landShade(buf, W, H, S, sc) {
  if (!LAND_N) return;
  const ids = IDS, fine = sc.coast.fine, fd = fine.d, fnx = fine.nx, fox = fine.ox, foy = fine.oy, sandMid = sc.sandMid, sandLight = sc.sandLight, wet = sc.wet, wetSheen = sc.wetSheen, lip = sc.lip, foam = sc.foam;
  const GK = clamp(25 * S / 2.4, 2, 24), grainAmp = 0.07 * clamp(GK * 2.4 / (25 * S) * (S > 0.5 ? 1 : S * 2), 0.3, 1);
  const fineAt = (gx, gy) => { const u = (gx - fox) * FS - 0.5, v = (gy - foy) * FS - 0.5, a = Math.floor(u), b = Math.floor(v), tx = u - a, ty = v - b, i = b * fnx + a; return (fd[i] * (1 - tx) + fd[i + 1] * tx) * (1 - ty) + (fd[i + fnx] * (1 - tx) + fd[i + fnx + 1] * tx) * ty; };
  const pxTile = 25 * S; let last = 0;
  let r0 = 0, rx = 0, ry = 0, g0 = 0, gxx = 0, gyy = 0, b0 = 0, bx = 0, by = 0, x0 = 0, xx = 0, xy = 0, y0 = 0, yx = 0, yy = 0, z0 = 0, zx = 0, zy = 0, isDeep = 0, steepT = 0, flT = 0;
  for (let py = 0; py < H; py++) {
    const yc = py + 0.5;
    for (let px = 0, k = py * W, o = k * 4; px < W; px++, k++, o += 4) {
      const id = ids[k]; if (!id) continue;
      if (id !== last) { last = id; const o0 = id * TS; r0 = TRI[o0]; rx = TRI[o0 + 1]; ry = TRI[o0 + 2]; g0 = TRI[o0 + 3]; gxx = TRI[o0 + 4]; gyy = TRI[o0 + 5]; b0 = TRI[o0 + 6]; bx = TRI[o0 + 7]; by = TRI[o0 + 8]; x0 = TRI[o0 + 9]; xx = TRI[o0 + 10]; xy = TRI[o0 + 11]; y0 = TRI[o0 + 12]; yx = TRI[o0 + 13]; yy = TRI[o0 + 14]; z0 = TRI[o0 + 15]; zx = TRI[o0 + 16]; zy = TRI[o0 + 17]; isDeep = TRI[o0 + 18]; steepT = TRI[o0 + 19]; flT = TRI[o0 + 20]; }
      const xc = px + 0.5;
      let r = r0 + xc * rx + yc * ry, g = g0 + xc * gxx + yc * gyy, b = b0 + xc * bx + yc * by;
      const gx = x0 + xc * xx + yc * xy, gy = y0 + xc * yx + yc * yy;
      let gr = cellNoise(Math.floor(gx * GK), Math.floor(gy * GK)) * grainAmp;
      if (g > r + 6 && isDeep === 1) gr += cellNoise(Math.floor((gx - gy) * GK * 1.5), Math.floor((gx + gy) * GK * 0.4) + 977) * grainAmp * 0.9; // grass: blade-long streaks, standing upright on the screen
      r += r * gr; g += g * gr; b += b * gr;
      let alpha = 1; const steep = steepT;
      const z = steep > 4.6 || isDeep === 0 ? z0 + xc * zx + yc * zy : 0;
      if (steep > 4.6) { // a cliff face: the strata of the rock by height, lit by which way the slope looks
        const w = steep >= 9.5 ? 1 : (steep - 4.6) / 4.9, fl = flT; rockAt(sc, z, gx - gy, 1.5);
        let rr = RK[0], rg = RK[1], rb = RK[2]; if (fl > 0) { rr += (255 - rr) * 0.1 * fl; rg += (240 - rg) * 0.1 * fl; rb += (200 - rb) * 0.1 * fl; } else { rr += (92 - rr) * -0.22 * fl; rg += (76 - rg) * -0.22 * fl; rb += (150 - rb) * -0.22 * fl; }
        r += (rr - r) * w; g += (rg - g) * w; b += (rb - b) * w;
      }
      if (isDeep === 0) {
        const sd = fineAt(gx, gy); alpha = 0.5 - sd * pxTile; if (alpha <= 0) continue; if (alpha > 1) alpha = 1;
        const inland = -sd;
        if (inland < 2.2) {
          const nb = lnoise(gx * 1.7 + 9, gy * 1.7) - 0.5, low = z >= 5.2 ? 0 : z <= 2.4 ? 1 : smooth(5.2, 2.4, z); // low ground is beach; a cliff top is not
          if (low > 0) {
            const edge = 1.25 + nb * 1.1, sand = low * (1 - smooth(edge - 0.4, edge + 0.12, inland));
            if (sand > 0) { const t = smooth(0.3, 1.3, inland), sn = (lnoise(gx * GK * 0.8, gy * GK * 0.8) - 0.5) * 0.11, sr = (sandMid[0] + (sandLight[0] - sandMid[0]) * t) * (1 + sn), sg = (sandMid[1] + (sandLight[1] - sandMid[1]) * t) * (1 + sn), sb = (sandMid[2] + (sandLight[2] - sandMid[2]) * t) * (1 + sn); r += (sr - r) * sand; g += (sg - g) * sand; b += (sb - b) * sand; }
            const wt = low * (1 - smooth(0.2, 0.36 + nb * 0.08, inland)); // the wet edge of the sand, darker, with a sheen along its outer half
            if (wt > 0) { r += (wet[0] - r) * wt * 0.85; g += (wet[1] - g) * wt * 0.85; b += (wet[2] - b) * wt * 0.85; }
            const sh = low * clamp(1 - Math.abs(inland - 0.3) / 0.1, 0, 1) * 0.35; if (sh > 0) { r += (wetSheen[0] - r) * sh; g += (wetSheen[1] - g) * sh; b += (wetSheen[2] - b) * sh; }
          }
          const lipW = (1 - low) * (1 - smooth(0.02, 0.3, inland)) * 0.4 * (steep > 3 ? 0 : 1); // the rounded lip where the meadow rolls over a cliff top
          if (lipW > 0) { r += (lip[0] - r) * lipW; g += (lip[1] - g) * lipW; b += (lip[2] - b) * lipW; }
          const fm = 1 - smooth(0.0, 0.12, inland); // the film of foam on the very edge of the sand
          if (fm > 0) { const a = fm * 0.55 * (1 - (1 - low) * 0.7); r += (foam[0] - r) * a; g += (foam[1] - g) * a; b += (foam[2] - b) * a; }
        }
      }
      const dth = cellNoise(px * 7 + 3, py * 13 + 1) * 2.4; r += dth; g += dth; b += dth; // a level or so of dither, so a slow gradient is never a band
      if (alpha >= 1) { buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; } else { buf[o] += (r - buf[o]) * alpha; buf[o + 1] += (g - buf[o + 1]) * alpha; buf[o + 2] += (b - buf[o + 2]) * alpha; }
    }
  }
}

// ---------------------------------------------------------------- the cliff walls
/** The height of the ground at a grid point (bilinear on the vertex heights, as layout.js reads it). */
const zBil = (ZV, VW, GW, GH, gx, gy) => { const x = clamp(gx, 0, GW - 1e-6), y = clamp(gy, 0, GH - 1e-6), i = x | 0, j = y | 0, fx = x - i, fy = y - j; return (ZV[j * VW + i] * (1 - fx) + ZV[j * VW + i + 1] * fx) * (1 - fy) + (ZV[(j + 1) * VW + i] * (1 - fx) + ZV[(j + 1) * VW + i + 1] * fx) * fy; };
const WALL_MIN = 2.6, WALL_N = 12;
/**
 * The cliff walls of a coast, as flat arrays: for each stretch of coast between two ring points that stands higher than a beach and faces the viewer, the world position of both ends (x, the foot's y and
 * the top's y), the arc length along the coast, the height and the light on its face. Where the coast is below a beach's height there is no wall: the sand does that work.
 */
export function buildWalls(coast, ZV, VW, GW, GH) {
  const out = []; let u = 0;
  for (const ring of coast.rings) {
    const n = ring.length / 2; if (n < 3) continue;
    const gx = (i) => ring[2 * ((i + n) % n)], gy = (i) => ring[2 * ((i + n) % n) + 1];
    const P = new Float64Array(n * 6);
    for (let i = 0; i < n; i++) {
      const tx = gx(i + 1) - gx(i - 1), ty = gy(i + 1) - gy(i - 1), tl = Math.hypot(tx, ty) || 1, nx = ty / tl, ny = -tx / tl, z = zBil(ZV, VW, GW, GH, gx(i), gy(i));
      P[i * 6] = (gx(i) - gy(i)) * HW; P[i * 6 + 1] = (gx(i) + gy(i)) * HH; P[i * 6 + 2] = z; P[i * 6 + 3] = nx; P[i * 6 + 4] = ny; P[i * 6 + 5] = u; u += Math.hypot(gx(i + 1) - gx(i), gy(i + 1) - gy(i));
    }
    for (let i = 0; i < n; i++) {
      const a = i * 6, b = ((i + 1) % n) * 6, z0 = P[a + 2], z1 = P[b + 2];
      if (z0 < WALL_MIN && z1 < WALL_MIN) continue;
      if (P[a + 3] + P[a + 4] < -0.15 && P[b + 3] + P[b + 4] < -0.15) continue; // facing away: the land in front of it hides it
      const lit = (nx, ny) => clamp(ny - nx, -1, 1);
      out.push(P[a], P[a + 1], z0, P[a + 5], lit(P[a + 3], P[a + 4]), P[b], P[b + 1], z1, P[b + 5] + (P[b + 5] < P[a + 5] ? 1e5 : 0), lit(P[b + 3], P[b + 4]));
    }
  }
  return { a: Float32Array.from(out), n: out.length / WALL_N };
}
const WA = new Float64Array(18), WDX = new Float64Array(6), WDY = new Float64Array(6);
/** Rasterise one triangle of attributes WA (6 a vertex) through `shade(o, attrs)`, with the same fill rule and overdraw as the land. */
function scan(W, H, ax, ay, bx, by, cx, cy, shade) {
  const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay); if (det > -1e-3 && det < 1e-3) return; const id = 1 / det;
  for (let q = 0; q < 6; q++) { const va = WA[q], vb = WA[6 + q], vc = WA[12 + q]; WDX[q] = ((vb - va) * (cy - ay) - (vc - va) * (by - ay)) * id; WDY[q] = ((vc - va) * (bx - ax) - (vb - va) * (cx - ax)) * id; }
  const ys = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 0.5)), ye = Math.min(H - 1, Math.floor(Math.max(ay, by, cy) - 0.5));
  for (let py = ys; py <= ye; py++) {
    const yc = py + 0.5; let xl = 1e9, xr = -1e9;
    if ((ay <= yc && by >= yc) || (by <= yc && ay >= yc)) { if (by !== ay) { const x = ax + (bx - ax) * (yc - ay) / (by - ay); if (x < xl) xl = x; if (x > xr) xr = x; } }
    if ((by <= yc && cy >= yc) || (cy <= yc && by >= yc)) { if (cy !== by) { const x = bx + (cx - bx) * (yc - by) / (cy - by); if (x < xl) xl = x; if (x > xr) xr = x; } }
    if ((cy <= yc && ay >= yc) || (ay <= yc && cy >= yc)) { if (ay !== cy) { const x = cx + (ax - cx) * (yc - cy) / (ay - cy); if (x < xl) xl = x; if (x > xr) xr = x; } }
    if (xl > xr) continue;
    const xs = Math.max(0, Math.ceil(xl - 0.85)), xe = Math.min(W - 1, Math.floor(xr + 0.35)); if (xs > xe) continue;
    const dy = yc - ay; const A = WA; // attributes at the pixel: a plane
    for (let px = xs; px <= xe; px++) { const dx = px + 0.5 - ax; shade((py * W + px) * 4, A[0] + dx * WDX[0] + dy * WDY[0], A[1] + dx * WDX[1] + dy * WDY[1], A[2] + dx * WDX[2] + dy * WDY[2], A[3] + dx * WDX[3] + dy * WDY[3]); }
  }
}
/**
 * Paint the cliff walls the buffer shows: each stretch of coast is a quad from the foot at the waterline (the sea's plane) up to the top edge of the ground, two world pixels higher than the land's own edge so
 * the land (drawn after) closes it with its anti-aliased coast. A face is 3 to 5 strata, wavy, each a step of sandstone (lilac rock above 40 pixels) from light at the top to shade at the foot, with a thin
 * darker line between them (never under 1.5 world pixels), a rounded lip of grass along the top, a violet occlusion band at the foot and the sun on the faces that look towards the upper left.
 */
export function wallPass(buf, W, H, S, ox, oy, sc) {
  const Wl = sc.walls; if (!Wl || !Wl.n) return;
  const wx0 = ox - 4, wy0 = oy - 100, wx1 = ox + W / S + 4, wy1 = oy + H / S + 4, a = Wl.a, sx = (x) => (x - ox) * S, sy = (y) => (y - oy) * S, ao = sc.ao;
  const shade = (o, xs, v, hh, lit) => {
    const hAbs = Math.max(0, v * hh); rockAt(sc, hAbs, xs, 1.5);
    let r = RK[0], g = RK[1], b = RK[2];
    if (lit > 0) { r += (255 - r) * 0.1 * lit; g += (240 - g) * 0.1 * lit; b += (200 - b) * 0.1 * lit; } else { r += (92 - r) * -0.22 * lit; g += (76 - g) * -0.22 * lit; b += (150 - b) * -0.22 * lit; }
    const q = 1 - smooth(0, 5, hAbs); if (q > 0) { r += (ao[0] - r) * q * 0.3; g += (ao[1] - g) * q * 0.3; b += (ao[2] - b) * q * 0.3; } // the foot of the wall, in shadow
    buf[o] = r; buf[o + 1] = g; buf[o + 2] = b;
  };
  for (let i = 0; i < Wl.n; i++) {
    const q = i * 10, x0 = a[q], x1 = a[q + 5], yb0 = a[q + 1], yb1 = a[q + 6], z0 = a[q + 2], z1 = a[q + 7];
    if (Math.max(x0, x1) < wx0 || Math.min(x0, x1) > wx1 || Math.max(yb0, yb1) < wy0 || Math.min(yb0, yb1) - Math.max(z0, z1) > wy1) continue;
    const ax = sx(x0), bx = sx(x1), fa = sy(yb0), fb = sy(yb1), ta = sy(yb0 - z0 - 2), tb = sy(yb1 - z1 - 2), u0 = x0 / 32, u1 = x1 / 32, l0 = a[q + 4], l1 = a[q + 9];
    // vertices: top0 (v 1), top1, foot1 (v 0), foot0; attributes xs, v, height, light
    const put = (n, u, v, hh, lit) => { WA[n * 6] = u; WA[n * 6 + 1] = v; WA[n * 6 + 2] = hh + 2; WA[n * 6 + 3] = lit; };
    put(0, u0, 1, z0, l0); put(1, u1, 1, z1, l1); put(2, u1, 0, z1, l1); scan(W, H, ax, ta, bx, tb, bx, fb, shade);
    put(0, u0, 1, z0, l0); put(1, u1, 0, z1, l1); put(2, u0, 0, z0, l0); scan(W, H, ax, ta, bx, fb, ax, fa, shade);
  }
}

/** Bake a buffer: the land is rasterised first (so the sea skips what is opaque land), then the sea, the cliff walls and the land shaded over them. */
export function bakeBase(buf, W, H, S, ox, oy, sc, view) { for (let i = 3, n = W * H * 4; i < n; i += 4) buf[i] = 255; /* opaque everywhere, whatever the buffer held before */ landRaster(W, H, S, ox, oy, sc, view); seaPass(buf, W, H, S, ox, oy, sc, true); wallPass(buf, W, H, S, ox, oy, sc); landShade(buf, W, H, S, sc); }
/** The land alone, rasterised and shaded (tests and the Node renderer). */
export function landPass(buf, W, H, S, ox, oy, sc, view) { landRaster(W, H, S, ox, oy, sc, view); landShade(buf, W, H, S, sc); }
