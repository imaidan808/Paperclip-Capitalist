// The V2 ground layers, in the toy language of the art direction: the base (sea, cliffs and land, painted per pixel by rasterbase.js), the districts' blocks as little stages, kerbed roads with painted dashes,
// zebra crossings, plank bridges with ball-capped rails and foam collars, and the ferry's buoys. Docs/ART_DIRECTION.md 4.5 and 5.
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md). Each is a layer of stack.js (`shore`, `terrain`, `roads`, `blocks`), registered here and drawn into a ground chunk (groundchunks.js) by the ground pass: they draw only
// from their arguments and the world's state, never from the camera, and every mark is a filled shape (nothing is stroked thinner than 1.5 world pixels).
import { registerLayer } from './stack.js';
import { LAYOUT, DIST, EDGES, zAt, isRoad, BW, BD, GW, GH } from './layout.js';
import { ROAD, PAVE, SAND, WOOD, LIGHT, SEA, TOY, GRASS, BLOOM, ROCK, ROCKHI, groundSet } from './palette.js';
import { mix, clamp, h2 } from './iso.js';
import { smooth as smoothstep, vnoise, LATTICE } from './noise.js';
import { bakeBase } from './rasterbase.js';
import { surface } from './gfx.js';
import { drawStage, paintFringe, tonesOf, tuft, gridRange, rrect } from './groundmat.js';
import { plantTree, bush, rock } from './nature.js';
import { decalV2, warmVeil } from './decalart.js';
import { VEIL, liftGround } from './terrainfield.js';

const HW = 32, HH = 16;
const px = (gx, gy) => (gx - gy) * HW, py = (gx, gy, z) => (gx + gy) * HH - z;
const SETS = new Map();
/** A district's daylight colours (the palette's row for its theme), memoised. */
function setOf(D) {
  let s = SETS.get(D.id);
  if (!s) {
    const g = groundSet(D.theme) || { ground: D.cols.ground, walk: D.cols.walk, hi: D.cols.ground, alt: D.cols.ground, pad: D.cols.pad, road: D.cols.road };
    const ground = liftGround(g.ground), hi = mix(ground, LIGHT.white, 0.3), pad = mix(ground, '#9a7e58', 0.3); // the ground a fifth more vivid than the table's, its rim lighter, and the yard a warm earth a step darker (never violet-dark: that was the mud)
    s = { ...g, ground, hi, pad, asphalt: mix(ROAD.mid, ground, 0.1), kerb: ROAD.kerb }; SETS.set(D.id, s);
  }
  return s;
}
const lockedOf = (w, id) => (w.unlocked ? !w.unlocked.has(id) : false);
const V = (c, k) => (k ? warmVeil(c, k * VEIL) : c);

// ---------------------------------------------------------------- the base: sea, cliffs and land, per pixel
/** `shore`: paint the chunk's whole buffer (sea, walls, land) and put it into the chunk. With no chunk (a direct draw: the Node tests) nothing is painted here. */
function drawShore(ctx, view, env, w, a) {
  const ch = a && a.chunk; if (!ch) return;
  bakeBase(ch.buf, ch.N, ch.N, ch.S, ch.ox, ch.oy, ch.scene, view);
  if (ch.img) ctx.putImageData(ch.img, 0, 0);
}
registerLayer('shore', drawShore, 'inherit', () => 1);
// ---------------------------------------------------------------- the terrain's dressing: grass, flowers, bushes, rocks and trees
const TUFT = [GRASS.hi, GRASS.shade, GRASS.deep, GRASS.coolShade];
const zOn = (gx, gy) => { const { ZV, VW } = LAYOUT, x = clamp(gx, 0, GW - 1e-6), y = clamp(gy, 0, GH - 1e-6), i = x | 0, j = y | 0, fx = x - i, fy = y - j; return (ZV[j * VW + i] * (1 - fx) + ZV[j * VW + i + 1] * fx) * (1 - fy) + (ZV[(j + 1) * VW + i] * (1 - fx) + ZV[(j + 1) * VW + i + 1] * fx) * fy; };
const BUSH_GREENS = [GRASS.mid, GRASS.lawn, GRASS.light, GRASS.lawnShade], ROCK_TONES = [ROCK.light, ROCKHI.light, ROCK.mid];
/**
 * What a meadow tile holds, as a pure function of the tile and of how green its neighbourhood is (`grove`, 0..1 from a slow noise): 0 nothing, 1 a bush, 2 a rock, 3 a tree. Trees come in groves and bushes
 * along them, so a wood is a wood and a meadow is a meadow; the numbers are the share of tiles, held by tests/world-groundmat.test.mjs (a bush in about one tile in ten, a tree in about one in twelve inside a grove).
 */
export function dressingOf(i, j, grove) {
  const u = h2(i * 3 + 7, j * 5 + 11);
  if (u < 0.012 + 0.16 * grove * grove) return 3;
  if (u < 0.06 + 0.16 * grove) return 1;
  if (u < 0.078 + 0.16 * grove) return 2;
  return 0;
}
/**
 * `terrain`: the grass laid on the baked ground, near and close: clumps of blades in three greens and the odd cluster of flowers, never on a block, a slope or within a tile and a half of the coast. The bushes, rocks and
 * trees of the meadows are `drawPlants`, below. Baked with the chunk, so a pan draws none of it. At most 1,500 grass marks in a chunk.
 */
function drawTerrain(ctx, view, env, w, a) {
  const ch = a && a.chunk, lod = env.lod ? env.lod.detail : null; if (!ch || !lod || lod[2] < 0.04) return;
  const T = ch.scene.terr, { land, core } = LAYOUT, VW = LAYOUT.VW, [i0, i1, j0, j1] = gridRange(view, 90, 1, [GW, GH]), near = lod[2], close = lod[3], per = 0.9 + 1.5 * close; let budget = 1500;
  for (let s = i0 + j0; s <= i1 + j1 && budget > 0; s++) for (let j = Math.max(j0, s - i1); j <= Math.min(j1, s - i0); j++) {
    const i = s - j, k = j * GW + i; if (!land[k] || core[k] || !openMeadow(T, i, j, VW, -1.5, 4.5)) continue;
    const n = per + h2(i, j + 4000) * per, cnt = (n | 0) + (h2(i + 91, j) < n - (n | 0) ? 1 : 0);
    ctx.globalAlpha = near * 0.92;
    for (let q = 0; q < cnt; q++) {
      const gx = i + h2(i * 7 + q, j * 3 + 17), gy = j + h2(i * 5 + 3, j * 11 + q * 5 + 1); if (LAYOUT.footAt(gx, gy) && !outsideBlock(gx, gy)) continue;
      const z = zOn(gx, gy), x = px(gx, gy), y = py(gx, gy, z), hh = h2(i * 13 + q, j * 29 + 5);
      if (hh > 0.86 - 0.06 * close) { // a few flowers in a small cluster
        ctx.fillStyle = [BLOOM.white, BLOOM.butter, BLOOM.pink, BLOOM.lilac][(hh * 97 | 0) % 4]; ctx.beginPath(); for (let f = 0; f < 3; f++) { const fx = x + (h2(i + f, j * 3) - 0.5) * 7, fy = y + (h2(i * 3, j + f) - 0.5) * 3.5; ctx.moveTo(fx + 1.5, fy); ctx.arc(fx, fy, 1.5, 0, 6.2832); } ctx.fill(); budget -= 3; continue;
      }
      ctx.fillStyle = TUFT[(hh * 31 | 0) % 4]; ctx.beginPath(); tuft(ctx, x, y, hh); if (hh > 0.4) tuft(ctx, x + 4.2 + hh * 2, y + 1.4, 1 - hh, 4 + hh * 2.5); ctx.fill(); budget -= 6; // a clump: one tuft and, beside it, a smaller one
    }
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = 1;
}
/** Is the meadow tile (i, j) open ground: no corner within `coast` tiles of the sea (negative inland), and no corner more than `rise` pixels from the others (a slope is rock, not meadow)? */
function openMeadow(T, i, j, VW, coast, rise) {
  const kv = j * VW + i, ia = T.inl[kv], ib = T.inl[kv + 1], ic = T.inl[kv + VW], id = T.inl[kv + VW + 1]; if (ia > coast || ib > coast || ic > coast || id > coast) return false; // the beach and the coast keep their own look
  const za = T.z[kv], zb = T.z[kv + 1], zc = T.z[kv + VW], zd = T.z[kv + VW + 1]; return Math.max(za, zb, zc, zd) - Math.min(za, zb, zc, zd) <= rise;
}
/**
 * The meadows' bushes, rocks and trees, painted AFTER the districts' blocks (the `blocks` layer calls this at its end): a tree standing in front of a block is in front of its rim and its shadow, which a tree baked
 * under the block's layer was not (its crown was cut by the cream rim). Back to front, from the mid zoom, in grove and meadow, never on a road, a footprint's scenery or a slope or within two and a half tiles of the coast.
 */
export function drawPlants(ctx, view, env, w, a) {
  const ch = a && a.chunk, lod = env.lod ? env.lod.detail : null; if (!ch || !lod || lod[1] < 0.03) return;
  const T = ch.scene.terr, { land, core } = LAYOUT, VW = LAYOUT.VW, [i0, i1, j0, j1] = gridRange(view, 90, 1, [GW, GH]), mid = lod[1];
  for (let s = i0 + j0; s <= i1 + j1; s++) for (let j = Math.max(j0, s - i1); j <= Math.min(j1, s - i0); j++) {
    const i = s - j, k = j * GW + i; if (!land[k] || core[k] || !openMeadow(T, i, j, VW, -2.6, 4.5)) continue;
    const grove = smoothstep(0.46, 0.74, vnoise(i * 0.075 + 5, j * 0.075 + 2)), what = dressingOf(i, j, grove); if (!what) continue;
    const gx = i + 0.2 + h2(i * 11 + 1, j * 7) * 0.6, gy = j + 0.2 + h2(i * 5, j * 13 + 3) * 0.6; if (LAYOUT.footAt(gx, gy) || isRoad(gx, gy)) continue;
    const z = zOn(gx, gy), x = px(gx, gy), y = py(gx, gy, z), hh = h2(i * 17 + 3, j * 19 + 5);
    ctx.globalAlpha = mid;
    if (what === 3) plantTree(ctx, x, y, z > 26 || hh < 0.22 ? 'pine' : 'round', 0.78 + hh * 0.5, (hh * 997) | 0);
    else if (what === 1) bush(ctx, x, y, 7 + hh * 5, BUSH_GREENS[(hh * 31 | 0) % 4], hh > 0.7 ? BLOOM[['pink', 'butter', 'white', 'lilac'][(hh * 13 | 0) % 4]] : null);
    else rock(ctx, x, y, 4 + hh * 5, ROCK_TONES[(hh * 29 | 0) % 3]);
  }
  ctx.globalAlpha = 1;
}
/** Is the point outside every district's block (the stage's own rectangle) though it may lie in its footprint? Grass grows in the apron round a block but not on it. */
function outsideBlock(gx, gy) { for (const id of LAYOUT.ids) { const D = DIST[id]; if (gx >= D.ox - 0.3 && gx < D.ox + D.w + 0.3 && gy >= D.oy - 0.3 && gy < D.oy + D.d + 0.3) return false; } return true; }
registerLayer('terrain', drawTerrain, 'inherit', () => 1);

// ---------------------------------------------------------------- the districts' blocks
let GRAIN;
/**
 * A 256 x 256 tile of soft mottle (light warm and violet-dark patches at up to 7%, two scales of smooth periodic noise: a patch of a few tiles and a drift of one), made once and laid over a block in WORLD space, so
 * plaza, asphalt and dirt are weathered by large soft tonal patches that scale with the camera and are the same at every zoom: the old pattern was a 64-pixel tile of fine per-pixel speckle (sandpaper at the close
 * zoom, nothing at the far). The noise wraps at the tile's edge, so the pattern has no seam. Pure arrays, `mottleTile`, for the test.
 */
export function mottleTile(size = 256) {
  const lat = (n, seed) => { const t = new Float32Array(n * n); for (let i = 0; i < n * n; i++) t[i] = LATTICE[(i * 131 + seed * 977) & 65535]; return t; }, A = lat(6, 3), B = lat(15, 11), out = new Float32Array(size * size);
  const at = (t, n, u, v) => { const x = u * n, y = v * n, i = Math.floor(x), j = Math.floor(y); let fx = x - i, fy = y - j; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); const a0 = t[(j % n) * n + (i % n)], a1 = t[(j % n) * n + ((i + 1) % n)], b0 = t[((j + 1) % n) * n + (i % n)], b1 = t[((j + 1) % n) * n + ((i + 1) % n)]; return (a0 + (a1 - a0) * fx) + ((b0 + (b1 - b0) * fx) - (a0 + (a1 - a0) * fx)) * fy; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out[y * size + x] = at(A, 6, x / size, y / size) * 0.62 + at(B, 15, x / size, y / size) * 0.38;
  return out;
}
function grainPattern(ctx) {
  if (GRAIN !== undefined) return GRAIN;
  GRAIN = null;
  try {
    const f = surface(256, 256); if (!f || typeof ImageData !== 'function' || typeof ctx.createPattern !== 'function') return GRAIN;
    const img = f.g.createImageData(256, 256), d = img.data, m = mottleTile(256);
    for (let i = 0; i < 256 * 256; i++) { const v = (m[i] - 0.5) * 2.6, dark = v < 0, a = Math.min(1, Math.abs(v)); d[i * 4] = dark ? 74 : 255; d[i * 4 + 1] = dark ? 63 : 247; d[i * 4 + 2] = dark ? 136 : 220; d[i * 4 + 3] = Math.round(a * a * 36); }
    f.g.putImageData(img, 0, 0); GRAIN = ctx.createPattern(f.c, 'repeat') || null;
  } catch { GRAIN = null; /* a context without patterns: the blocks are drawn without the mottle */ }
  return GRAIN;
}
/**
 * Each district's block as a little stage: a soft shadow, a plinth, a cream rim, dirt with patches and pebbles, bevelled pavers, asphalt with worn edges, patches and cracks, raised kerbs, the stash's slab, the kit's
 * decals, and a fringe of grass where the stage meets the meadow. The materials are groundmat.js's; a locked district's colours are veiled, never darkened. Docs/ART_DIRECTION.md 4.5, 5.9.
 */
function drawBlocks(ctx, view, env, w, a) {
  const detail = env.lod ? env.lod.detail : [1, 1, 1, 1], land = LAYOUT.land, free = (gx, gy) => !LAYOUT.footAt(gx, gy) && zAt(gx, gy) > 0;
  for (const id of LAYOUT.ids) {
    const D = DIST[id], b = D.bb; if (!(b[2] > view.x0 && b[0] < view.x1 && b[3] + 200 > view.y0 && b[1] < view.y1 + 200)) continue;
    const S = setOf(D), k = lockedOf(w, id) ? 1 : 0, z = D.z;
    drawStage(ctx, view, D, S, k, detail, (c, d) => decalV2(c, d, z, k, S, detail), a.zoom);
    const gp = grainPattern(ctx); // the weathering of the whole stage: large soft tonal patches in world space, the same at every zoom (never a per-pixel speckle)
    if (gp && detail[1] > 0.02) { ctx.fillStyle = gp; ctx.globalAlpha = Math.min(1, 0.35 + detail[1] * 0.65); ctx.beginPath(); rrect(ctx, D.ox, D.oy, BW, BD, 0.9, z); ctx.fill(); ctx.globalAlpha = 1; }
    paintFringe(ctx, view, D, z, detail, tonesOf(D, S, k), (gx, gy) => land[(gy | 0) * GW + (gx | 0)] === 1, free);
  }
  drawPlants(ctx, view, env, w, a);
}
registerLayer('blocks', drawBlocks, 'inherit', () => 1);

// ---------------------------------------------------------------- roads
const DENSE = new WeakMap();
/** A road's polyline resampled every 0.6 tile or less, with the mitred normal, the ground's height and the arc length at each sample: [gx, gy, nx, ny, z, s] a sample. */
function denseOf(e) {
  let d = DENSE.get(e); if (d) return d;
  const pts = e.pts, out = []; let s = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1], l = Math.hypot(bx - ax, by - ay) || 1, n = Math.max(1, Math.ceil(l / 0.6));
    for (let k = 0; k < n; k++) out.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n, 0, 0, 0, s + l * k / n]);
    s += l;
  }
  out.push([pts[pts.length - 1][0], pts[pts.length - 1][1], 0, 0, 0, s]);
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)], tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
    out[i][2] = -ty / tl; out[i][3] = tx / tl; out[i][4] = zAt(out[i][0], out[i][1]) + 0.4;
  }
  DENSE.set(e, out); return out;
}
/** Fill the strip of a dense polyline between offsets o0 and o1 (tiles, left negative) over samples i0 to i1. */
function strip(ctx, d, o0, o1, lift, i0 = 0, i1 = d.length - 1) {
  if (i1 <= i0) return;
  ctx.beginPath();
  for (let i = i0; i <= i1; i++) { const p = d[i]; const gx = p[0] + p[2] * o0, gy = p[1] + p[3] * o0; i === i0 ? ctx.moveTo(px(gx, gy), py(gx, gy, p[4] + lift)) : ctx.lineTo(px(gx, gy), py(gx, gy, p[4] + lift)); }
  for (let i = i1; i >= i0; i--) { const p = d[i], gx = p[0] + p[2] * o1, gy = p[1] + p[3] * o1; ctx.lineTo(px(gx, gy), py(gx, gy, p[4] + lift)); }
  ctx.closePath(); ctx.fill();
}
const at = (d, s) => { let i = 0; while (i < d.length - 2 && d[i + 1][5] < s) i++; const a = d[i], b = d[i + 1], t = clamp((s - a[5]) / ((b[5] - a[5]) || 1), 0, 1); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t, a[4] + (b[4] - a[4]) * t]; };
const FOOT = mix(SAND.light, PAVE.cream, 0.5), FOOT_EDGE = mix(SAND.mid, PAVE.cobble, 0.5);

function drawRoads(ctx, view, env, w, a) {
  const zoom = a.zoom;
  for (const e of EDGES) {
    if (!e.v2bb) { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of e.pts) { x0 = Math.min(x0, px(x, y)); x1 = Math.max(x1, px(x, y)); y0 = Math.min(y0, py(x, y, 0)); y1 = Math.max(y1, py(x, y, 0)); } e.v2bb = [x0 - 80, y0 - LAYOUT.maxZ - 80, x1 + 80, y1 + 80]; e.br = LAYOUT.bridges.filter((b) => b.edge === e); }
    const bb = e.v2bb; if (!(bb[2] > view.x0 && bb[0] < view.x1 && bb[3] > view.y0 && bb[1] < view.y1)) continue;
    const open = w.unlocked ? w.unlocked.has(e.gate) : true, d = denseOf(e);
    if (e.ferry) { // a line of buoys, red and cream: each a rounded cone with a white band, a lamp on its top, a foam ring where it meets the water and a soft shadow on the sea, so it reads as a thing and not as a speck
      for (let s = 3, n = 0; s < e.len - 3; s += 1.5, n++) { const p = at(d, s); buoy(ctx, px(p[0], p[1]), py(p[0], p[1], 0), n % 2 ? PAVE.cream : TOY.red, open ? 1 : 0.7); }
      ctx.globalAlpha = 1; continue;
    }
    const hw = e.w / 2, brokenBridge = !open && DIST[e.gate]?.gateKind === 'bridge', br = e.br[0];
    const gap = brokenBridge && br ? [br.s0 + (br.s1 - br.s0) * 0.22, br.s1 - (br.s1 - br.s0) * 0.22] : null;
    const col = e.path ? FOOT : V(open ? mix(ROAD.mid, ROAD.light, 0.12) : mix(ROAD.light, ROAD.kerb, 0.2), open ? 0 : 0.5), kerb = e.path ? FOOT_EDGE : V(ROAD.kerb, open ? 0 : 0.5), kb = e.path ? 0.14 : 0.2;
    let i0 = 0, runs = [[0, d.length - 1]];
    if (gap) { const ia = d.findIndex((p) => p[5] >= gap[0]), ib = d.findIndex((p) => p[5] >= gap[1]); runs = [[0, Math.max(0, ia - 1)], [ib, d.length - 1]]; }
    const bends = (r0, r1, rad, lift) => { // rounded joins at every bend: a disc of the ground's own circle (an ellipse on the screen)
      for (let q = r0 + 1; q < r1; q++) { const p = d[q], a2 = d[q - 1], b2 = d[q + 1], turn = Math.abs(a2[2] * b2[3] - a2[3] * b2[2]); if (turn > 0.15) { ctx.beginPath(); ctx.ellipse(px(p[0], p[1]), py(p[0], p[1], p[4] + lift), rad * HW * 1.4142, rad * HH * 1.4142, 0, 0, 6.2832); ctx.fill(); } }
    };
    for (const [r0, r1] of runs) { ctx.fillStyle = kerb; strip(ctx, d, -hw, hw, 0, r0, r1); bends(r0, r1, hw, 0); } // the kerb under everything, then the asphalt inside it
    for (const [r0, r1] of runs) { ctx.fillStyle = col; strip(ctx, d, -hw + kb, hw - kb, 0.1, r0, r1); bends(r0, r1, hw - kb, 0.1); }
    if (!e.path && open && zoom >= 0.3) { // the centre dashes: painted bands 0.35 tile wide, 0.9 long, 0.8 apart
      ctx.fillStyle = ROAD.dash;
      for (let s = 1.2; s < e.len - 1; s += 1.7) { if (gap && s > gap[0] - 1 && s < gap[1] + 1) continue; const p = at(d, s), q = at(d, Math.min(e.len, s + 0.9)); ctx.beginPath(); for (const [pt, o] of [[p, -0.175], [q, -0.175], [q, 0.175], [p, 0.175]]) { const gx = pt[0] + pt[2] * o, gy = pt[1] + pt[3] * o; ctx.lineTo(px(gx, gy), py(gx, gy, pt[4] + 0.2)); } ctx.closePath(); ctx.fill(); }
    }
    for (const b of e.br) drawBridge(ctx, b, brokenBridge, a.far, zoom);
  }
}
registerLayer('roads', drawRoads, 'inherit', () => 1);

/** A buoy at (x, y) on the water: a soft shadow and a ring of foam on the sea, a cone of `col` (a little taller than wide) with a white band and a small yellow lamp, lit from the upper left. About 7 x 11 world pixels. */
export function buoy(ctx, x, y, col, alpha = 1) {
  ctx.globalAlpha = 0.22 * alpha; ctx.fillStyle = LIGHT.shadow; ctx.beginPath(); ctx.ellipse(x + 2.2, y + 1.6, 6, 2.5, 0, 0, 6.2832); ctx.fill();
  ctx.globalAlpha = 0.85 * alpha; ctx.fillStyle = SEA.foam; ctx.beginPath(); ctx.ellipse(x, y + 0.6, 6.4, 2.7, 0, 0, 6.2832); ctx.fill();
  ctx.globalAlpha = alpha; ctx.fillStyle = shadeOf(col); ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.quadraticCurveTo(x - 4.4, y - 3.4, x - 1.8, y - 8); ctx.lineTo(x + 1.8, y - 8); ctx.quadraticCurveTo(x + 4.4, y - 3.4, x + 4, y); ctx.quadraticCurveTo(x, y + 2, x - 4, y); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - 3.7, y - 0.4); ctx.quadraticCurveTo(x - 4.1, y - 3.4, x - 1.7, y - 8); ctx.lineTo(x + 0.6, y - 8); ctx.quadraticCurveTo(x - 0.6, y - 3, x - 0.4, y + 0.6); ctx.quadraticCurveTo(x - 2, y + 0.4, x - 3.7, y - 0.4); ctx.fill();
  ctx.fillStyle = LIGHT.white; ctx.fillRect(x - 3.5, y - 4.4, 7, 1.6);
  ctx.fillStyle = TOY.yellow; ctx.beginPath(); ctx.arc(x, y - 9.2, 1.7, 0, 6.2832); ctx.fill(); ctx.fillStyle = INKD; ctx.fillRect(x - 0.5, y - 8.2, 1, 1);
  ctx.globalAlpha = 1;
}
const INKD = '#5a4a8c', shadeOf = (c) => mix(c, '#5a52a8', 0.28);
// ---------------------------------------------------------------- bridges
const STONE = mix(PAVE.cobble, PAVE.cobbleJoint, 0.3);
/** A plank deck of rounded boards, cream kerbs, rails on posts with ball caps and two stone piers with a foam collar where they meet the water. A broken bridge ends in a stub at each bank. */
function drawBridge(ctx, b, broken, far, zoom) {
  if (far) return;
  const pts = b.pts, n = pts.length, hw = 1.2;
  const seg = (i) => { const [ax, ay] = pts[i], [bx, by] = pts[i + 1], l = Math.hypot(bx - ax, by - ay) || 1; return { ax, ay, bx, by, nx: -(by - ay) / l, ny: (bx - ax) / l, z0: zAt(ax, ay), z1: zAt(bx, by) }; };
  const skip = (i) => broken && i > n * 0.22 && i < n * 0.78;
  for (let i = 0; i + 1 < n; i++) { // piers first (under the deck): a stone leg to the water every third post, with a collar of foam
    if (skip(i) || i % 3 !== 1) continue; const s = seg(i), mx = (s.ax + s.bx) / 2, my = (s.ay + s.by) / 2, z = (s.z0 + s.z1) / 2;
    for (const sg of [-1, 1]) { const gx = mx + s.nx * sg * 0.85, gy = my + s.ny * sg * 0.85, x = px(gx, gy), y0 = py(gx, gy, 0), y1 = py(gx, gy, z);
      ctx.fillStyle = STONE; ctx.beginPath(); ctx.moveTo(x - 2.6, y0); ctx.lineTo(x - 2.2, y1); ctx.lineTo(x + 2.2, y1); ctx.lineTo(x + 2.6, y0); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.85; ctx.fillStyle = SEA.foam; ctx.beginPath(); ctx.ellipse(x, y0 + 0.5, 5.2, 2.2, 0, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1; }
  }
  for (let i = 0; i + 1 < n; i++) { // the deck: boards in two woods, a kerb on each side
    if (skip(i)) continue; const s = seg(i), a0 = s.z0 + 0.4, a1 = s.z1 + 0.4;
    const q = (o0, o1, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(px(s.ax + s.nx * o0, s.ay + s.ny * o0), py(s.ax + s.nx * o0, s.ay + s.ny * o0, a0)); ctx.lineTo(px(s.bx + s.nx * o0, s.by + s.ny * o0), py(s.bx + s.nx * o0, s.by + s.ny * o0, a1)); ctx.lineTo(px(s.bx + s.nx * o1, s.by + s.ny * o1), py(s.bx + s.nx * o1, s.by + s.ny * o1, a1)); ctx.lineTo(px(s.ax + s.nx * o1, s.ay + s.ny * o1), py(s.ax + s.nx * o1, s.ay + s.ny * o1, a0)); ctx.closePath(); ctx.fill(); };
    q(-hw, hw, WOOD.shade); q(-hw + 0.16, hw - 0.16, i % 2 ? WOOD.mid : WOOD.light); q(-hw, -hw + 0.18, PAVE.cream); q(hw - 0.18, hw, PAVE.cream);
  }
  ctx.fillStyle = PAVE.cream; // rails: a 3 world pixel bar along each side on posts, every third a post with a ball cap
  for (let i = 0; i + 1 < n; i++) {
    if (skip(i)) continue; const s = seg(i);
    for (const sg of [-1, 1]) { const o = hw * sg, A = [px(s.ax + s.nx * o, s.ay + s.ny * o), py(s.ax + s.nx * o, s.ay + s.ny * o, s.z0 + 6.5)], B = [px(s.bx + s.nx * o, s.by + s.ny * o), py(s.bx + s.nx * o, s.by + s.ny * o, s.z1 + 6.5)];
      ctx.beginPath(); ctx.moveTo(A[0], A[1] - 1.5); ctx.lineTo(B[0], B[1] - 1.5); ctx.lineTo(B[0], B[1] + 1.5); ctx.lineTo(A[0], A[1] + 1.5); ctx.closePath(); ctx.fill();
      if (i % 3 === 0) { const x = A[0], y = py(s.ax + s.nx * o, s.ay + s.ny * o, s.z0); ctx.fillRect(x - 2, y - 7, 4, 7.6); ctx.beginPath(); ctx.arc(x, A[1] - 2.6, 2.4, 0, 6.2832); ctx.fill(); }
    }
  }
}
export { drawBridge };
