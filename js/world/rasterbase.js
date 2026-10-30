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
// ---------------------------------------------------------------- the swell: the sea's own wave shapes, a pure function of the world
const TAU = 6.2832;
const COSN = 1024, COSLUT = (() => { const t = new Float32Array(COSN + 1); for (let i = 0; i <= COSN; i++) t[i] = 0.5 + 0.5 * Math.cos(TAU * i / COSN); return t; })();
/** 0.5 + 0.5 cos(2 pi x) from a table (x in any range): the swell asks for it at every node, and a table read is a fifth of a cosine. */
const halfCos = (x) => { const f = x - Math.floor(x), i = f * COSN, a = i | 0, t = i - a; return COSLUT[a] + (COSLUT[a + 1] - COSLUT[a]) * t; };
/**
 * The swell at a grid position `d` tiles from the coast: a signed number, -1 (a soft trough) to +1 (a crest), the sea's cartoon waves as large, low shapes. Far from land they are rows of long soft bands that
 * run along the screen's horizontal (constant gx + gy), bent by slow noise and broken into patches of a few tiles; within a few tiles of a coast they bend to follow it (rows of constant distance), so a bay
 * has swells that wrap it. `fine` and `coarse` weigh the two scales (one band every 3.8 tiles of gx + gy, and one every 11.5), which the bake sets from its own scale, so the coarse bands carry the far zoom
 * and the fine ones the near, and no band is ever thinner than a few pixels. Nothing here depends on the camera, the buffer or the chunk.
 */
export function swellAt(gx, gy, d, fine, coarse) {
  let v = 0;
  if (fine > 0.01) {
    const warp = (lnoise(gx * 0.17 + 5, gy * 0.17 + 9) - 0.5) * 1.7 + (lnoise(gx * 0.52 + 2, gy * 0.52 + 6) - 0.5) * 0.4;
    const wn = d < 1.2 ? 0 : (1 - smooth(1.8, 7.5, d)) * smooth(1.2, 2.2, d); // how much of the shore-following rows replace the horizontal ones
    let c = halfCos((gx + gy) / 3.8 + warp), m = smooth(0.44, 0.62, lnoise(gx * 0.15 + 13, gy * 0.15 + 2)), t = c >= 0.5 ? smooth(0.8, 0.985, c) : -smooth(0.8, 0.985, 1 - c);
    let f = t * m * (1 - wn);
    if (wn > 0.01) { c = halfCos(d / 1.9 + warp * 0.25); m = smooth(0.5, 0.68, lnoise(gx * 0.3 + 31, gy * 0.3 + 7)); t = c >= 0.5 ? smooth(0.78, 0.985, c) : -smooth(0.78, 0.985, 1 - c); f += t * m * wn * 0.8; }
    v += f * fine;
  }
  if (coarse > 0.01) {
    const warp = (lnoise(gx * 0.035 + 3, gy * 0.035 + 11) - 0.5) * 1.7, c = halfCos((gx + gy) / 11.5 + warp + d * 0.012), m = smooth(0.38, 0.6, lnoise(gx * 0.04 + 17, gy * 0.04 + 3)), t = c >= 0.5 ? smooth(0.66, 0.97, c) : -smooth(0.66, 0.97, 1 - c); // long gentle rows: the far sea's waves are a few broad swells, never a squiggle
    v += t * m * coarse;
  }
  return v < -1 ? -1 : v > 1 ? 1 : v;
}
/** The two scale weights of the swell for a bake at `S` device pixels a world pixel: the fine bands come in over S 0.35 to 0.8 and are whole from there, the coarse ones carry the far zoom and stay at a third. */
export function swellScales(S) { const f = smooth(0.35, 0.8, S); return { fine: f, coarse: 0.34 + 0.66 * (1 - f) }; }
/**
 * How the depth ramp is bent: the distance used to look the colour up is the true one plus a slow noise that grows with the depth, so the bands of the ramp wander like the sea floor and no colour is a
 * contour of the coast (they were: a lagoon looked like a pool, and every depth echoed the polygon). Answers tiles; 0 at the coast, so the foam and the beach stay on the exact line.
 */
export function bentDepth(gx, gy, d) { return d <= 0.9 ? d : d + (vnoise(gx * 0.21 + 3, gy * 0.21 + 8) - 0.5) * Math.min(2.4, 0.3 + 0.24 * d) * smooth(0.9, 2.2, d); }
/** The pale shelf of the shallows: 1 on the shore side of a scalloped edge 1.3 to 1.9 tiles out (wider at the far zoom, where the island has to read as one pale rim), 0 beyond it. `nw` is a noise 0..1 along the coast. */
export function shelfAt(d, nw, S) { const out = 1.55 + 0.5 * nw + 2.6 * (1 - smooth(0.25, 0.9, S)); return 1 - smooth(out - 0.55, out + 0.1, d); }

/**
 * Everything a bake reads, made once per layout and unlock state: the coast, the terrain field, the sea's colour table and the palette tokens as float triples.
 * `bounds` is LAYOUT.bounds (the haze begins beyond it), `ZV`/`VW` the heights.
 */
export function makeScene(coast, terr, bounds, ZV, VW, GW, GH) {
  const walls = buildWalls(coast, ZV, VW, GW, GH);
  return {
    coast, terr, bounds, ZV, lut: seaLut(),
    foam: rgbf(SEA.foam), crest: rgbf(SEA.crest), trough: rgbf(SEA.trough), caustic: rgbf(SEA.caustic), shoal: rgbf(SEA.shoal), shadow: rgbf(mix(SEA.sea, LIGHT.shadow, 0.55)), haze: rgbf(mix(SKY.horizon, SKY.mid, 0.4)), glow: rgbf(mix(SEA.shoal, SEA.shallow, 0.5)),
    sandMid: rgbf(SAND.mid), sandLight: rgbf(SAND.light), sandHi: rgbf(SAND.hi), wet: rgbf(SAND.wet), wetSheen: rgbf(SAND.wetSheen), lip: rgbf(GRASS.shade), rock: rgbf(ROCK.mid), rockShade: rgbf(ROCK.shade), rockLight: rgbf(ROCK.light), rockHi: rgbf(ROCKHI.light), rockHiShade: rgbf(ROCKHI.shade), strata: rgbf(ROCK.strata), ao: rgbf(LIGHT.ao), walls,
  };
}

/** The strength of the dapples of light on the floor of the shallows at a grid position `d` tiles from the coast, 0..0.3: rounded patches a third of a tile across where two value noises are both high (the light a wave lets through), fading out from one tile to five and 0 on the foam. A close-zoom detail; the bake scales it by its scale. */
export function causticAt(gx, gy, d) {
  if (d < 0.35 || d > 5.5) return 0;
  const n = lnoise(gx * 1.3 + 3, gy * 1.3 + 8) * 0.55 + lnoise(gx * 2.9 + 41, gy * 2.9 + 23) * 0.45;
  return smooth(0.57, 0.7, n) * (1 - smooth(1.4, 5.5, d)) * smooth(0.35, 1.0, d) * 0.3;
}
// ---------------------------------------------------------------- the sea
const skOf = (S) => (S < 0.7 ? 12 : 16);          // the lattice the smooth part of the sea is evaluated on: one node every so many device pixels (a finer one at the far zoom, where the shallows' rim is a few pixels wide)

let NODE = { n: 0, d: null, r: null, g: null, b: null, rr: null, rg: null, rb: null, sw: null, sn: 0 };
const nodes = (n) => { if (NODE.n < n) NODE = { ...NODE, n, d: new Float32Array(n), r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n), rr: new Float32Array(n), rg: new Float32Array(n), rb: new Float32Array(n) }; return NODE; };
const SWD = [4, 6, 8, 12, 16]; // (spacings that divide a chunk's 384 pixels, so a chunk and its neighbour read the lattice at the same phase)
const swSpacing = (S) => { const w = 3.5 * S + 1; let k = SWD[0]; for (const v of SWD) if (v <= w + 0.5) k = v; return Math.max(6, k); }; // the swell lattice: one node every so many device pixels (its edges are a dozen world pixels soft, so a bilinear read of it is smooth)
const swellNodes = (n) => { if (NODE.sn < n) NODE = { ...NODE, sn: n, sw: new Float32Array(n) }; return NODE.sw; };
/** A hash of two integers to -0.5..0.5 for the dither, taken from the pixel's place in the WORLD's device grid (the buffer's own corner added), so a chunk and its neighbour dither alike and nothing depends on where a buffer starts. */
const dither = (ix, iy) => cellNoise(ix, iy);
/**
 * Paint the sea into the buffer: the depth ramp by the bent distance to the coast (the fine field near the island, the coarse one beyond), the pale shelf of the shallows with its scalloped edge, the island's
 * shadow on the shade-facing coast and the haze beyond the map's bounds, all evaluated on a lattice of nodes a few pixels apart and interpolated (they are smooth); the swell, the sea's large soft wave
 * bands, on a finer lattice; and, within two tiles of the coast, the exact distance per pixel with the foam (a white band whose edge is scalloped by noise and which breaks into bubbles at the close
 * zoom, a broken trail behind it) and, in the shallows at the close zoom, the web of caustic light. Cells wholly under the land are left alone: the land is drawn over them.
 */
export function seaPass(buf, W, H, S, ox, oy, sc, skipLand = false) {
  const SK = skOf(S), ids = IDS, useIds = skipLand && LAND_N > 0;
  const fine = sc.coast.fine, coarse = sc.coast.coarse, fd = fine.d, fnx = fine.nx, fox = fine.ox, foy = fine.oy, cd = coarse.d, cnx = coarse.nx, cny = coarse.ny, cox = coarse.ox, coy = coarse.oy;
  const lr = sc.lut.r, lg = sc.lut.g, lb = sc.lut.b, B = sc.bounds, foam = sc.foam, hz = sc.haze, sh = sc.shadow, shoal = sc.shoal, inv = 1 / S, aa = TILE_PER_WPX * inv;
  const crest = sc.crest, trough = sc.trough, caustic = sc.caustic, sc2 = swellScales(S), fineTier = smooth(2.4, 3.8, S), bubbleTier = smooth(1.5, 2.6, S);
  const ix0 = Math.round(ox * S), iy0 = Math.round(oy * S);
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
      const ds2 = d > 1.2 && d < 40 ? d + ((distAt(gx + 0.6, gy) + distAt(gx - 0.6, gy) + distAt(gx, gy + 0.6) + distAt(gx, gy - 0.6)) * 0.25 - d) * smooth(1.2, 2.6, d) : d; // the distance a little rounded off, so the crease where two coasts' depths meet is not a ridge
      const db = d > 0.9 && d < FAR_D ? bentDepth(gx, gy, ds2) : d, lw = (db > FAR_D ? FAR_D : db < 0 ? 0 : db) * LUT_N | 0; // the ramp is looked up at the bent distance: the exact ramp at the coast, a wandering one beyond
      let r = lr[lw], g = lg[lw], b = lb[lw];
      const mo = (vnoise(gx * 0.09 + 31, gy * 0.09) - 0.5) * 0.04; r += r * mo; g += g * mo; b += b * mo; // a slow, faint drift of tone (never a blotch)
      if (d < 4) {
        const ds = distAt(gx - 0.5, gy - 0.12); // the island's shadow: the coast moved half a tile towards +gx (down and to the right on the screen), feathered over a tile and a bit
        if (ds < 1.3 && d > -0.5) { const a = (1 - smooth(-0.2, 1.3, ds)) * 0.3 * smooth(0, 0.35, d); if (a > 0) { r += (sh[0] - r) * a; g += (sh[1] - g) * a; b += (sh[2] - b) * a; } }
        if (d > 0) { const sf = shelfAt(d, lnoise(gx * 0.8 + 11, gy * 0.8 + 3), S) * 0.42; if (sf > 0.005) { r += (shoal[0] - r) * sf; g += (shoal[1] - g) * sf; b += (shoal[2] - b) * sf; } } // the shelf of the shallows: pale, with a scalloped edge
      }
      const ex = (wx - hcx) / ha0, ha = Math.min(0.93, smooth(1.0, 2.9, Math.sqrt(ex * ex + ey * ey)) * 0.88 + hv); // the haze: the sea goes pale and warm in an ellipse round the island, thicker the farther away it is (never a box)
      if (ha > 0) { r += (hz[0] - r) * ha; g += (hz[1] - g) * ha; b += (hz[2] - b) * ha; }
      nd[k] = d; nr[k] = r; ng[k] = g; nb[k] = b; qr[k] = r - r0; qg[k] = g - g0; qb[k] = b - b0; // the residual: everything but the ramp, which is exact per pixel near the coast
    }
  }
  // ---- the swell lattice: where the sea is deep enough to carry it, its signed wave value at every SW pixels (zero near the foam and under the land)
  const SW = swSpacing(S), SX = Math.ceil((W + 1) / SW) + 2, SY = Math.ceil((H + 1) / SW) + 2, sw = swellNodes(SX * SY), isk = 1 / SK, haveSwell = sc2.fine > 0.01 || sc2.coarse > 0.01;
  if (haveSwell) for (let j = 0; j < SY; j++) {
    const cj = (j * SW) * isk, bj = Math.min(Math.floor(cj), NY - 2), ty = cj - bj, wy = oy + (j * SW) * inv;
    for (let i = 0; i < SX; i++) {
      const ci = (i * SW) * isk, bi = Math.min(Math.floor(ci), NX - 2), tx = ci - bi, k = bj * NX + bi;
      const d = (nd[k] * (1 - tx) + nd[k + 1] * tx) * (1 - ty) + (nd[k + NX] * (1 - tx) + nd[k + NX + 1] * tx) * ty;
      if (d < 1.6) { sw[j * SX + i] = 0; continue; } // (none in the exact zone by the coast: the foam is there)
      const wx = ox + (i * SW) * inv, gx = wx / 64 + wy / 32, gy = wy / 32 - wx / 64;
      sw[j * SX + i] = swellAt(gx, gy, d, sc2.fine, sc2.coarse) * smooth(1.6, 2.6, d);
    }
  }
  const swAt = (px, py) => { const u = px / SW, v = py / SW, a = Math.floor(u), b = Math.floor(v), tx = u - a, ty = v - b, o = b * SX + a; return (sw[o] * (1 - tx) + sw[o + 1] * tx) * (1 - ty) + (sw[o + SX] * (1 - tx) + sw[o + SX + 1] * tx) * ty; };
  // ---- the pixels: in 2 x 2 blocks where the sea is smooth (interpolated from the nodes), one pixel at a time within a tile and a half of the coast (the exact distance, the foam)
  const NEAR = 1.7;
  const LF = new Float64Array(3);
  const lift = (r, g, b, sv) => { // a swell value: a crest lightens towards the crest colour, a trough deepens towards the trough colour (a crest is the stronger: the wave is a highlight, the trough only a shadow); writes LF, answers whether it changed the colour
    if (sv > 0.01) { const m = sv * 0.2; LF[0] = r + (crest[0] - r) * m; LF[1] = g + (crest[1] - g) * m; LF[2] = b + (crest[2] - b) * m; return true; }
    if (sv < -0.01) { const m = -sv * 0.11; LF[0] = r + (trough[0] - r) * m; LF[1] = g + (trough[1] - g) * m; LF[2] = b + (trough[2] - b) * m; return true; }
    return false;
  };
  const exact = (px, py, o, k, k1, k2, k3, tx, ty, nf, nt, cwb) => {
    const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty, di = nd[k] * w00 + nd[k1] * w10 + nd[k2] * w01 + nd[k3] * w11; // the lattice's own estimate of the distance
    if (di > 1.25) { let r = nr[k] * w00 + nr[k1] * w10 + nr[k2] * w01 + nr[k3] * w11, g = ng[k] * w00 + ng[k1] * w10 + ng[k2] * w01 + ng[k3] * w11, b = nb[k] * w00 + nb[k1] * w10 + nb[k2] * w01 + nb[k3] * w11; if (cwb > 0.005) { r += (caustic[0] - r) * cwb; g += (caustic[1] - g) * cwb; b += (caustic[2] - b) * cwb; } buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = 255; return; }
    const wy = oy + (py + 0.5) * inv, wx = ox + (px + 0.5) * inv, gx = wx / 64 + wy / 32, gy = wy / 32 - wx / 64, d = fineAt(gx, gy), dd = d < 0 ? 0 : d, li = dd * LUT_N | 0;
    let r = lr[li] + qr[k] * w00 + qr[k1] * w10 + qr[k2] * w01 + qr[k3] * w11, g = lg[li] + qg[k] * w00 + qg[k1] * w10 + qg[k2] * w01 + qg[k3] * w11, b = lb[li] + qb[k] * w00 + qb[k1] * w10 + qb[k2] * w01 + qb[k3] * w11;
    if (cwb > 0.005) { r += (caustic[0] - r) * cwb; g += (caustic[1] - g) * cwb; b += (caustic[2] - b) * cwb; } // the dapples of light on the floor of the shallows (worked out once for the 2 x 2 block)
    if (d < 1.25) { // foam: a white band whose edge swings in and out (scallops of a quarter tile and more), a broken trail behind it and, up close, bubbles in it
      const wmin = 1.6 * aa, w1 = Math.max(0.1 + 0.3 * nf, wmin + 0.03);
      let fa = clamp((w1 - d) / aa * 0.5 + 0.5, 0, 1);
      if (fa > 0 && bubbleTier > 0.02) { const bn = lnoise(gx * 9.5 + 5, gy * 9.5 + 1); fa *= 1 - 0.34 * smooth(0.64, 0.86, bn) * bubbleTier * smooth(0.0, 0.4, w1 - d); } // holes of a few pixels in the thick of the foam
      const t0 = w1 + 0.13, t1 = t0 + 0.12 + 0.2 * nt; // the trail: detached dashes of foam, 0.1 to 0.3 tile wide, only where its noise is high
      if (d > t0 - 0.06) { const tr = clamp((d - t0) / aa * 0.5 + 0.5, 0, 1) * clamp((t1 - d) / aa * 0.5 + 0.5, 0, 1) * smooth(0.5, 0.7, nt) * 0.62; if (tr > fa) fa = tr; }
      if (fa > 0) { r += (foam[0] - r) * fa; g += (foam[1] - g) * fa; b += (foam[2] - b) * fa; }
    }
    buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = 255;
  };
  for (let py = 0; py < H; py += 2) {
    const yc = py + 1, cj = Math.floor(yc * isk), ty = yc * isk - cj, py1 = py + 1 < H ? py + 1 : py;
    for (let px = 0; px < W; px += 2) {
      const xc = px + 1, ci = Math.floor(xc * isk), tx = xc * isk - ci, k = cj * NX + ci, k1 = k + 1, k2 = k + NX, k3 = k2 + 1, d00 = nd[k], d10 = nd[k1], d01 = nd[k2], d11 = nd[k3];
      const dmin = d00 < d10 ? (d00 < d01 ? (d00 < d11 ? d00 : d11) : (d01 < d11 ? d01 : d11)) : (d10 < d01 ? (d10 < d11 ? d10 : d11) : (d01 < d11 ? d01 : d11));
      if (useIds && ids[py * W + px] !== 0 && TRI[ids[py * W + px] * TS + DEEPI] === 1 && ids[py1 * W + px] !== 0 && TRI[ids[py1 * W + px] * TS + DEEPI] === 1 && px + 1 < W && ids[py * W + px + 1] !== 0 && TRI[ids[py * W + px + 1] * TS + DEEPI] === 1) continue; // wholly under the land: its triangles are opaque
      if (dmin < -7) continue;
      if (dmin > NEAR) {
        const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
        let r = nr[k] * w00 + nr[k1] * w10 + nr[k2] * w01 + nr[k3] * w11, g = ng[k] * w00 + ng[k1] * w10 + ng[k2] * w01 + ng[k3] * w11, b = nb[k] * w00 + nb[k1] * w10 + nb[k2] * w01 + nb[k3] * w11;
        if (haveSwell) { if (lift(r, g, b, swAt(xc, yc))) { r = LF[0]; g = LF[1]; b = LF[2]; } }
        if (fineTier > 0.02 && dmin < 6.5) { const bx = ox + xc * inv, by = oy + yc * inv, dI = d00 * w00 + d10 * w10 + d01 * w01 + d11 * w11, cw = causticAt(bx / 64 + by / 32, by / 32 - bx / 64, dI) * fineTier; if (cw > 0.005) { r += (caustic[0] - r) * cw; g += (caustic[1] - g) * cw; b += (caustic[2] - b) * cw; } }
        let o = (py * W + px) * 4, o2 = (py1 * W + px) * 4; const two = px + 1 < W;
        let q = dither(ix0 + px, iy0 + py) * 2.2; buf[o] = r + q; buf[o + 1] = g + q; buf[o + 2] = b + q; buf[o + 3] = 255; q = dither(ix0 + px + 5, iy0 + py1 + 3) * 2.2; buf[o2] = r + q; buf[o2 + 1] = g + q; buf[o2 + 2] = b + q; buf[o2 + 3] = 255; // (a level of dither, so the gradient is never a band)
        if (two) { q = dither(ix0 + px + 1, iy0 + py + 9) * 2.2; buf[o + 4] = r + q; buf[o + 5] = g + q; buf[o + 6] = b + q; buf[o + 7] = 255; q = dither(ix0 + px + 8, iy0 + py1 + 1) * 2.2; buf[o2 + 4] = r + q; buf[o2 + 5] = g + q; buf[o2 + 6] = b + q; buf[o2 + 7] = 255; }
      } else {
        const bx = ox + xc * inv, by = oy + yc * inv, bgx = bx / 64 + by / 32, bgy = by / 32 - bx / 64;
        const cwb = fineTier > 0.02 ? causticAt(bgx, bgy, dmin < 1.7 ? (d00 + d10 + d01 + d11) * 0.25 : dmin) * fineTier : 0, nf = smooth(0.28, 0.78, lnoise(bgx * 1.7 + 7, bgy * 1.7) * 0.5 + lnoise(bgx * 5.3 + 3, bgy * 5.3 + 5) * 0.5), nt = lnoise(bgx * 1.4 + 3, bgy * 1.4 + 11); // the scallop noise varies over twenty pixels: one sample a block
        for (let qy = py; qy <= py1; qy++) for (let qx = px; qx <= px + 1 && qx < W; qx++) { if (useIds) { const id = ids[qy * W + qx]; if (id !== 0 && TRI[id * TS + DEEPI] === 1) continue; } const cx = (qx + 0.5) * isk, cy = (qy + 0.5) * isk; exact(qx, qy, (qy * W + qx) * 4, k, k1, k2, k3, cx - ci, cy - cj, nf, nt, cwb); }
      }
    }
  }
}

// ---------------------------------------------------------------- rock: strata by absolute height
const RK = new Float64Array(3);
/**
 * The colour of a rock face at height `z` (pixels above the sea) and across position `xs` (the screen's x in tiles, gx - gy: the same on a wall and on the steep ground above it, so the layers run on
 * from one to the other): wavy strata six and a half pixels thick, each a step of sandstone (lilac rock above 40 pixels) from light at the top to shade at the foot, the joint between two a soft darker band
 * (never thinner than `wpxLine` world pixels, edges eased over half as much again), and a soft tonal drift across each layer in place of a grain. Written into RK.
 */
function rockAt(sc, z, xs, wpxLine) {
  const bt = 6.5, wob = (lnoise(xs * 1.1, z * 0.03 + 3) - 0.5) * 4, q = (z + wob) / bt, k = Math.floor(q), fr = q - k, hi = z > 46 ? 1 : z < 34 ? 0 : (z - 34) / 12, t = clamp(1 - z / 100, 0, 1) * 0.75 + (k % 3) * 0.1;
  const rl = sc.rockLight, rs = sc.rockShade, hl = sc.rockHi, hs = sc.rockHiShade, st = sc.strata;
  let r = rl[0] + (rs[0] - rl[0]) * t, g = rl[1] + (rs[1] - rl[1]) * t, b = rl[2] + (rs[2] - rl[2]) * t;
  if (hi > 0) { const hr = hl[0] + (hs[0] - hl[0]) * t, hg = hl[1] + (hs[1] - hl[1]) * t, hb = hl[2] + (hs[2] - hl[2]) * t; r += (hr - r) * hi; g += (hg - g) * hi; b += (hb - b) * hi; }
  const tp = (fr - (1 - 1.5 / bt)) / (1.5 / bt), cap = tp <= 0 ? 0 : tp >= 1 ? 1 : tp * tp * (3 - 2 * tp), drift = (fr - 0.5) * -0.05 + ((k & 1) ? 0.045 : -0.03) + cap * 0.07 + ((k * 37) % 7 - 3) * 0.012; r += r * drift; g += g * drift; b += b * drift; // each layer a little lighter at its top than at its foot, and a slow drift along it
  if (k > 0) { const e = fr * bt, line = 1 - smooth(wpxLine * 0.7, wpxLine * 1.6, e); if (line > 0) { r += (st[0] - r) * 0.58 * line; g += (st[1] - g) * 0.58 * line; b += (st[2] - b) * 0.58 * line; } }
  RK[0] = r; RK[1] = g; RK[2] = b;
}

// ---------------------------------------------------------------- the land: a Gouraud mesh of the terrain field, rasterised once and shaded once
// Painter's order (back to front by i + j) decides which triangle owns a pixel, but only the OWNER is shaded: phase 1 writes triangle ids, phase 2 evaluates each pixel's attributes from its triangle's
// plane equations and shades it, so a slope that is overdrawn three times costs one shading. Attributes per triangle: r, g, b, gx, gy, z, rock steepness, side light as planes in buffer pixels
// (c0 + c1 x + c2 y), then `deep` (a triangle wholly inland, which the sea need not look under).
const NP = 8, TS = NP * 3 + 5, DEEPI = NP * 3;
let TRI = new Float32Array(TS * 4096), IDS = new Int32Array(0), LAND_N = 0;
const triRoom = (n) => { if (TRI.length < n * TS) { const t = new Float32Array(Math.max(TRI.length * 2, n * TS)); t.set(TRI); TRI = t; } };
/**
 * Paint every land tile whose screen box meets the buffer as two Gouraud triangles of the terrain field. A pixel's colour is the interpolated vertex colour with the world's own soft tone on top; the pixels
 * within two tiles of the coast read the signed distance to it for the exact anti-aliased coast, the sand of the beach, its wet edge and a foam film, and the rounded lip of a cliff top; steep ground that
 * faces the viewer is rock, by a steepness that is interpolated like the colour, so its edge is a smooth line and never a triangle's.
 */
export function landRaster(W, H, S, ox, oy, sc, view) {
  const T = sc.terr, { r: TR, g: TG, b: TB, z: TZ, inl: TI, mesh, VW, GW, GH, st: TST, sd: TSD } = T;
  const wx0 = ox, wy0 = oy, wx1 = ox + W / S, wy1 = oy + H / S;
  let gx0 = 1e9, gx1 = -1e9, gy0 = 1e9, gy1 = -1e9;
  for (const [x, y] of [[wx0, wy0], [wx1, wy0], [wx0, wy1], [wx1, wy1]]) for (const zz of [0, view.maxZ]) { const a = x / 64 + (y + zz) / 32, b = (y + zz) / 32 - x / 64; gx0 = Math.min(gx0, a); gx1 = Math.max(gx1, a); gy0 = Math.min(gy0, b); gy1 = Math.max(gy1, b); }
  const i0 = Math.max(0, Math.floor(gx0) - 1), i1 = Math.min(GW - 1, Math.ceil(gx1) + 1), j0 = Math.max(0, Math.floor(gy0) - 1), j1 = Math.min(GH - 1, Math.ceil(gy1) + 1);
  const sxp = (gx, gy) => ((gx - gy) * HW - ox) * S, syp = (gx, gy, z) => (((gx + gy) * HH - z) - oy) * S;
  if (IDS.length < W * H) IDS = new Int32Array(W * H); const ids = IDS; ids.fill(0, 0, W * H);
  let nt = 0;
  const VAL = new Float64Array(NP * 3); // the three vertices' attributes, set by the caller of tri()
  const tri = (ax, ay, bx, by, cx, cy, deep) => {
    const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay); if (det > -1e-3 && det < 1e-3) return;
    const ys = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 0.5)), ye = Math.min(H - 1, Math.floor(Math.max(ay, by, cy) - 0.5)); if (ys > ye) return;
    const id = ++nt; triRoom(id + 1); const o = id * TS, idt = 1 / det;
    for (let q = 0; q < NP; q++) { const va = VAL[q], vb = VAL[NP + q], vc = VAL[2 * NP + q], dxx = ((vb - va) * (cy - ay) - (vc - va) * (by - ay)) * idt, dyy = ((vc - va) * (bx - ax) - (vb - va) * (cx - ax)) * idt; TRI[o + q * 3] = va - ax * dxx - ay * dyy; TRI[o + q * 3 + 1] = dxx; TRI[o + q * 3 + 2] = dyy; }
    TRI[o + DEEPI] = deep;
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
      const deep = TI[ka] < -2.9 && TI[kb] < -2.9 && TI[kc] < -2.9 && TI[kd] < -2.9 ? 1 : 0; // wholly inland: the beach, the lip and the sea's coast never reach it (the beach is at most two tiles wide)
      const put = (n, key, gx, gy, z) => { const o = n * NP; VAL[o] = TR[key]; VAL[o + 1] = TG[key]; VAL[o + 2] = TB[key]; VAL[o + 3] = gx; VAL[o + 4] = gy; VAL[o + 5] = z; VAL[o + 6] = TST[key]; VAL[o + 7] = TSD[key]; };
      if (Math.abs(zA - zC) <= Math.abs(zB - zD)) { put(0, ka, i, j, zA); put(1, kb, i + 1, j, zB); put(2, kc, i + 1, j + 1, zC); tri(xA, yA, xB, yB, xC, yC, deep); put(1, kc, i + 1, j + 1, zC); put(2, kd, i, j + 1, zD); tri(xA, yA, xC, yC, xD, yD, deep); }
      else { put(0, ka, i, j, zA); put(1, kb, i + 1, j, zB); put(2, kd, i, j + 1, zD); tri(xA, yA, xB, yB, xD, yD, deep); put(0, kb, i + 1, j, zB); put(1, kc, i + 1, j + 1, zC); put(2, kd, i, j + 1, zD); tri(xB, yB, xC, yC, xD, yD, deep); }
    }
  }
  LAND_N = nt;
}
const MOW = TAU / 2.3;
let TLAT = new Float32Array(0);
const toneLattice = (n) => (TLAT.length < n ? (TLAT = new Float32Array(n)) : TLAT);
/**
 * The soft tone of the ground at a grid position, a multiplier's offset (about -0.06 to +0.06): tonal patches larger than a tile, a smaller drift, and, on grass, faint broad mowing stripes. Everything is value
 * noise in world units, so it is the same picture at every zoom and in every chunk, and nothing in it is a pixel: the old grain was a fixed block of two or three device pixels, sandpaper at the close zoom.
 * `fine` (0..1, from the scale) lets in a four-pixel-scale mottle when the picture is large enough to show it.
 */
export function toneAt(gx, gy, grass, fine) {
  let t = (lnoise(gx * 0.33 + 3, gy * 0.33 + 9) - 0.5) * 0.075 + (lnoise(gx * 1.05 + 17, gy * 1.05 + 2) - 0.5) * 0.05;
  if (grass) t += Math.sin((gx + gy) * MOW + (lnoise(gx * 0.2, gy * 0.2) - 0.5) * 3) * 0.013;
  if (fine > 0.01) t += (lnoise(gx * 6.1 + 5, gy * 6.1 + 1) - 0.5) * 0.045 * fine;
  return t;
}
/** Phase 2: shade each pixel once, from the plane equations of the triangle that owns it (landRaster ran first, for the same buffer). `ox`, `oy` are the buffer's world corner (the dither is the world's, not the buffer's). */
export function landShade(buf, W, H, S, sc, ox = 0, oy = 0) {
  if (!LAND_N) return;
  const ids = IDS, fine = sc.coast.fine, fd = fine.d, fnx = fine.nx, fox = fine.ox, foy = fine.oy, sandMid = sc.sandMid, sandLight = sc.sandLight, wet = sc.wet, wetSheen = sc.wetSheen, lip = sc.lip, foam = sc.foam;
  const fineTone = smooth(0.9, 2.2, S), ix0 = Math.round(ox * S), iy0 = Math.round(oy * S);
  const fineAt = (gx, gy) => { const u = (gx - fox) * FS - 0.5, v = (gy - foy) * FS - 0.5, a = Math.floor(u), b = Math.floor(v), tx = u - a, ty = v - b, i = b * fnx + a; return (fd[i] * (1 - tx) + fd[i + 1] * tx) * (1 - ty) + (fd[i + fnx] * (1 - tx) + fd[i + fnx + 1] * tx) * ty; };
  const pxTile = 25 * S; let last = 0;
  // the soft tone is a function of the world (the ground plane under the pixel), smooth over a few pixels, so it is worked out on a lattice every TK pixels and read back bilinearly: a ninth of the work, and the same picture
  const TK = 4, TX = Math.ceil(W / TK) + 2, TYn = Math.ceil(H / TK) + 2, tl = toneLattice(TX * TYn);
  for (let j = 0; j < TYn; j++) { const wy = oy + (j * TK) / S; for (let i = 0; i < TX; i++) { const wx = ox + (i * TK) / S; tl[j * TX + i] = toneAt(wx / 64 + wy / 32, wy / 32 - wx / 64, true, fineTone); } }
  let r0 = 0, rx = 0, ry = 0, g0 = 0, gxx = 0, gyy = 0, b0 = 0, bx = 0, by = 0, x0 = 0, xx = 0, xy = 0, y0 = 0, yx = 0, yy = 0, z0 = 0, zx = 0, zy = 0, s0 = 0, sxx = 0, sxy = 0, d0 = 0, dxx = 0, dxy = 0, isDeep = 0;
  for (let py = 0; py < H; py++) {
    const yc = py + 0.5;
    for (let px = 0, k = py * W, o = k * 4; px < W; px++, k++, o += 4) {
      const id = ids[k]; if (!id) continue;
      if (id !== last) { last = id; const q = id * TS; r0 = TRI[q]; rx = TRI[q + 1]; ry = TRI[q + 2]; g0 = TRI[q + 3]; gxx = TRI[q + 4]; gyy = TRI[q + 5]; b0 = TRI[q + 6]; bx = TRI[q + 7]; by = TRI[q + 8]; x0 = TRI[q + 9]; xx = TRI[q + 10]; xy = TRI[q + 11]; y0 = TRI[q + 12]; yx = TRI[q + 13]; yy = TRI[q + 14]; z0 = TRI[q + 15]; zx = TRI[q + 16]; zy = TRI[q + 17]; s0 = TRI[q + 18]; sxx = TRI[q + 19]; sxy = TRI[q + 20]; d0 = TRI[q + 21]; dxx = TRI[q + 22]; dxy = TRI[q + 23]; isDeep = TRI[q + DEEPI]; }
      const xc = px + 0.5;
      let r = r0 + xc * rx + yc * ry, g = g0 + xc * gxx + yc * gyy, b = b0 + xc * bx + yc * by;
      const gx = x0 + xc * xx + yc * xy, gy = y0 + xc * yx + yc * yy;
      const tu = xc / TK, tv = yc / TK, ta = tu | 0, tb = tv | 0, tfx = tu - ta, tfy = tv - tb, tq = tb * TX + ta, tone = (tl[tq] * (1 - tfx) + tl[tq + 1] * tfx) * (1 - tfy) + (tl[tq + TX] * (1 - tfx) + tl[tq + TX + 1] * tfx) * tfy; r += r * tone; g += g * tone; b += b * tone;
      let alpha = 1;
      const steepW = smooth(5.0, 8.2, s0 + xc * sxx + yc * sxy); // steep ground that faces the viewer is rock: the steepness is interpolated from the vertices, so the edge of the rock is a smooth line
      const z = steepW > 0 || isDeep === 0 ? z0 + xc * zx + yc * zy : 0;
      if (steepW > 0) { // a cliff face: the strata of the rock by height, lit by which way the slope looks
        const fl = clamp(d0 + xc * dxx + yc * dxy, -1, 1); rockAt(sc, z, gx - gy, 1.5);
        let rr = RK[0], rg = RK[1], rb = RK[2]; if (fl > 0) { rr += (255 - rr) * 0.1 * fl; rg += (240 - rg) * 0.1 * fl; rb += (200 - rb) * 0.1 * fl; } else { rr += (92 - rr) * -0.22 * fl; rg += (76 - rg) * -0.22 * fl; rb += (150 - rb) * -0.22 * fl; }
        r += (rr - r) * steepW; g += (rg - g) * steepW; b += (rb - b) * steepW;
      }
      if (isDeep === 0) {
        const sd = fineAt(gx, gy); alpha = 0.5 - sd * pxTile; if (alpha <= 0) continue; if (alpha > 1) alpha = 1;
        const inland = -sd;
        if (inland < 2.4) {
          const nb = lnoise(gx * 1.7 + 9, gy * 1.7) - 0.5, nc = lnoise(gx * 0.45 + 5, gy * 0.45 + 2) - 0.5, low = z >= 5.2 ? 0 : z <= 2.4 ? 1 : smooth(5.2, 2.4, z); // low ground is beach; a cliff top is not
          if (low > 0) {
            const edge = 1.1 + nb * 0.9 + nc * 0.7, sand = low * (1 - smooth(edge - 0.55, edge + 0.2, inland));
            if (sand > 0) { const t = smooth(0.3, 1.3, inland), sn = (lnoise(gx * 3.1 + 2, gy * 3.1 + 8) - 0.5) * 0.07 * fineTone, sr = (sandMid[0] + (sandLight[0] - sandMid[0]) * t) * (1 + sn), sg = (sandMid[1] + (sandLight[1] - sandMid[1]) * t) * (1 + sn), sb = (sandMid[2] + (sandLight[2] - sandMid[2]) * t) * (1 + sn); r += (sr - r) * sand; g += (sg - g) * sand; b += (sb - b) * sand; }
            const wt = low * (1 - smooth(0.06, 0.4 + nb * 0.1, inland)) * 0.62; // the wet edge of the sand: a darker, glossier tone that fades into the dry sand, not a band
            if (wt > 0) { r += (wet[0] - r) * wt; g += (wet[1] - g) * wt; b += (wet[2] - b) * wt; }
            const sh = low * clamp(1 - Math.abs(inland - 0.26) / 0.16, 0, 1) * 0.3; if (sh > 0) { r += (wetSheen[0] - r) * sh; g += (wetSheen[1] - g) * sh; b += (wetSheen[2] - b) * sh; }
          }
          const lipW = (1 - low) * (1 - smooth(0.02, 0.34, inland)) * 0.4 * (steepW > 0.2 ? 0 : 1); // the rounded lip where the meadow rolls over a cliff top
          if (lipW > 0) { r += (lip[0] - r) * lipW; g += (lip[1] - g) * lipW; b += (lip[2] - b) * lipW; }
          const fm = 1 - smooth(0.0, 0.12, inland); // the film of foam on the very edge of the sand
          if (fm > 0) { const a = fm * 0.55 * (1 - (1 - low) * 0.7); r += (foam[0] - r) * a; g += (foam[1] - g) * a; b += (foam[2] - b) * a; }
        }
      }
      const dth = dither((ix0 + px) * 7 + 3, (iy0 + py) * 13 + 1) * 2.4; r += dth; g += dth; b += dth; // a level or so of dither, so a slow gradient is never a band
      if (alpha >= 1) { buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; } else { buf[o] += (r - buf[o]) * alpha; buf[o + 1] += (g - buf[o + 1]) * alpha; buf[o + 2] += (b - buf[o + 2]) * alpha; }
    }
  }
}

// ---------------------------------------------------------------- the cliff walls
/** The height of the ground at a grid point (bilinear on the vertex heights, as layout.js reads it). */
const zBil = (ZV, VW, GW, GH, gx, gy) => { const x = clamp(gx, 0, GW - 1e-6), y = clamp(gy, 0, GH - 1e-6), i = x | 0, j = y | 0, fx = x - i, fy = y - j; return (ZV[j * VW + i] * (1 - fx) + ZV[j * VW + i + 1] * fx) * (1 - fy) + (ZV[(j + 1) * VW + i] * (1 - fx) + ZV[(j + 1) * VW + i + 1] * fx) * fy; };
const WALL_MIN = 2.6, WALL_REACH = 3, WALL_LIFT = 45, WALL_N = 10; // (ten numbers a segment: both ends' x, foot, height, arc length and light. It was 12, so the painter stopped a sixth short and the last 791 segments of the coast had no wall)
/**
 * The cliff walls of a coast, as flat arrays: for each stretch of coast between two ring points that stands higher than a beach and faces the viewer, the world position of both ends (x, the foot's y and
 * the top's y), the arc length along the coast, the height and the light on its face. Where the coast is below a beach's height there is no wall: the sand does that work.
 */
export function buildWalls(coast, ZV, VW, GW, GH) {
  const out = []; let u = 0;
  for (const ring of coast.rings) {
    const n = ring.length / 2; if (n < 3) continue;
    const gx = (i) => ring[2 * ((i + n) % n)], gy = (i) => ring[2 * ((i + n) % n) + 1];
    const P = new Float64Array(n * 6), zr = new Float64Array(n);
    for (let i = 0; i < n; i++) zr[i] = zBil(ZV, VW, GW, GH, gx(i), gy(i));
    for (let i = 0; i < n; i++) {
      const tx = gx(i + 1) - gx(i - 1), ty = gy(i + 1) - gy(i - 1), tl = Math.hypot(tx, ty) || 1, nx = ty / tl, ny = -tx / tl;
      // the top of the wall is the highest ground within WALL_REACH ring points of this one: at a corner of the coast the ring point itself can stand low (the height is read at one point), and the wall's top then dips to a V with the
      // sea showing through above it (a teal check mark in a cliff). The land is painted after the wall and closes anything the wall holds above the ground's edge.
      let z = zr[i]; for (let k = 1; k <= WALL_REACH; k++) { const a = zr[(i + k) % n], b = zr[(i - k + n) % n]; if (a > z) z = a; if (b > z) z = b; }
      P[i * 6] = (gx(i) - gy(i)) * HW; P[i * 6 + 1] = (gx(i) + gy(i)) * HH; P[i * 6 + 2] = Math.min(z, zr[i] + WALL_LIFT); P[i * 6 + 3] = nx; P[i * 6 + 4] = ny; P[i * 6 + 5] = u; u += Math.hypot(gx(i + 1) - gx(i), gy(i + 1) - gy(i));
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
/**
 * Paint the cliff walls the buffer shows. Each stretch of coast is a quad with vertical sides, from the foot at the waterline (the sea's plane) up to the top edge of the ground, two world pixels higher
 * than the land's own edge so the land (drawn after) closes it with its anti-aliased coast, so it is drawn a column at a time: in each column the foot and the top are exact lines, the strata run by height
 * above the foot (3 to 5 layers, wavy, each a step of sandstone, lilac rock above 40 pixels, from light at the top to shade at the foot, with a soft darker joint between), the sun is on the faces that look
 * towards the upper left, and the foot is anti-aliased by the share of its last pixel the wall covers, blended over the foam the sea pass painted, so the silhouette against the water is a clean line and no
 * stair. A soft violet occlusion lies along the foot and the sea's foam is left to show through its last pixel.
 */
export function wallPass(buf, W, H, S, ox, oy, sc) {
  const Wl = sc.walls; if (!Wl || !Wl.n) return;
  const wx0 = ox - 4, wy0 = oy - 100, wx1 = ox + W / S + 4, wy1 = oy + H / S + 4, a = Wl.a, sx = (x) => (x - ox) * S, sy = (y) => (y - oy) * S, ao = sc.ao;
  for (let i = 0; i < Wl.n; i++) {
    const q = i * 10; let x0 = a[q], x1 = a[q + 5], yb0 = a[q + 1], yb1 = a[q + 6], z0 = a[q + 2], z1 = a[q + 7], l0 = a[q + 4], l1 = a[q + 9];
    if (Math.max(x0, x1) < wx0 || Math.min(x0, x1) > wx1 || Math.max(yb0, yb1) < wy0 || Math.min(yb0, yb1) - Math.max(z0, z1) > wy1) continue;
    if (x1 < x0) { let t = x0; x0 = x1; x1 = t; t = yb0; yb0 = yb1; yb1 = t; t = z0; z0 = z1; z1 = t; t = l0; l0 = l1; l1 = t; } // columns run left to right
    const ax = sx(x0), bx = sx(x1), fa = sy(yb0), fb = sy(yb1), ta = sy(yb0 - z0 - 2), tb = sy(yb1 - z1 - 2), span = bx - ax || 1e-6;
    const c0 = Math.max(0, Math.ceil(ax - 0.5 - 0.9)), c1 = Math.min(W - 1, Math.floor(bx - 0.5 + 0.9)); // (a pixel column beyond each end: two neighbouring stretches overlap, so no hairline of sea shows between them)
    for (let px = c0; px <= c1; px++) {
      const t = clamp((px + 0.5 - ax) / span, 0, 1), foot = fa + (fb - fa) * t, top = ta + (tb - ta) * t, hh = z0 + 2 + (z1 - z0) * t, lit = l0 + (l1 - l0) * t, xs = (x0 + (x1 - x0) * t) / 32, depth = foot - top;
      if (!(depth > 0.01)) continue;
      const ys = Math.max(0, Math.floor(top)), ye = Math.min(H - 1, Math.floor(foot));
      for (let py = ys; py <= ye; py++) {
        const cov = foot - py >= 1 ? 1 : foot - py; if (cov <= 0) continue;
        const hAbs = clamp((foot - (py + 0.5)) / depth, 0, 1) * hh; rockAt(sc, hAbs, xs, 1.5);
        let r = RK[0], g = RK[1], b = RK[2];
        if (lit > 0) { r += (255 - r) * 0.1 * lit; g += (240 - g) * 0.1 * lit; b += (200 - b) * 0.1 * lit; } else { r += (92 - r) * -0.22 * lit; g += (76 - g) * -0.22 * lit; b += (150 - b) * -0.22 * lit; }
        const qo = 1 - smooth(0, 6, hAbs); if (qo > 0) { r += (ao[0] - r) * qo * 0.26; g += (ao[1] - g) * qo * 0.26; b += (ao[2] - b) * qo * 0.26; } // the foot of the wall, in shadow
        const o = (py * W + px) * 4; if (cov >= 1) { buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; } else { buf[o] += (r - buf[o]) * cov; buf[o + 1] += (g - buf[o + 1]) * cov; buf[o + 2] += (b - buf[o + 2]) * cov; }
      }
    }
  }
}

/** Bake a buffer: the land is rasterised first (so the sea skips what is opaque land), then the sea, the cliff walls and the land shaded over them. */
export function bakeBase(buf, W, H, S, ox, oy, sc, view) { for (let i = 3, n = W * H * 4; i < n; i += 4) buf[i] = 255; /* opaque everywhere, whatever the buffer held before */ landRaster(W, H, S, ox, oy, sc, view); seaPass(buf, W, H, S, ox, oy, sc, true); wallPass(buf, W, H, S, ox, oy, sc); landShade(buf, W, H, S, sc, ox, oy); }
/** The land alone, rasterised and shaded (tests and the Node renderer). */
export function landPass(buf, W, H, S, ox, oy, sc, view) { landRaster(W, H, S, ox, oy, sc, view); landShade(buf, W, H, S, sc, ox, oy); }
