// The V2 ground layers, in the toy language of the art direction: the base (sea, cliffs and land, painted per pixel by rasterbase.js), the districts' blocks as little stages, kerbed roads with painted dashes,
// zebra crossings, plank bridges with ball-capped rails and foam collars, and the ferry's buoys. Docs/ART_DIRECTION.md 4.5 and 5.
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md). Each is a layer of stack.js (`shore`, `terrain`, `roads`, `blocks`), registered here and drawn into a ground chunk (groundchunks.js) by the ground pass: they draw only
// from their arguments and the world's state, never from the camera, and every mark is a filled shape (nothing is stroked thinner than 1.5 world pixels).
import { registerLayer } from './stack.js';
import { LAYOUT, DIST, EDGES, zAt, roadZ, isRoad, BW, BD, GW, GH } from './layout.js';
import { ROAD, PAVE, SAND, WOOD, LIGHT, SEA, TOY, GRASS, BLOOM, ROCK, ROCKHI, groundSet } from './palette.js';
import { mix, clamp } from './iso.js';
import { smooth as smoothstep, vnoise, LATTICE, hz } from './noise.js';
import { bakeBase } from './rasterbase.js';
import { surface } from './gfx.js';
import { drawStage, paintFringe, tonesOf, tuft, TUFT_TONES, gridRange, rrect, decalBox } from './groundmat.js';
import { apronPieces, APRON } from './roadshape.js';
import { JUNCTIONS, HEADS } from './island.js';
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
const TUFT = TUFT_TONES;
const zOn = (gx, gy) => { const { ZV, VW } = LAYOUT, x = clamp(gx, 0, GW - 1e-6), y = clamp(gy, 0, GH - 1e-6), i = x | 0, j = y | 0, fx = x - i, fy = y - j; return (ZV[j * VW + i] * (1 - fx) + ZV[j * VW + i + 1] * fx) * (1 - fy) + (ZV[(j + 1) * VW + i] * (1 - fx) + ZV[(j + 1) * VW + i + 1] * fx) * fy; };
const BUSH_GREENS = [GRASS.mid, GRASS.lawn, GRASS.light, GRASS.lawnShade], ROCK_TONES = [ROCK.light, ROCKHI.light, ROCK.mid];
/**
 * What a meadow tile holds, as a pure function of the tile and of how green its neighbourhood is (`grove`, 0..1 from a slow noise): 0 nothing, 1 a bush, 2 a rock, 3 a tree. Trees come in groves and bushes
 * along them, so a wood is a wood and a meadow is a meadow; the numbers are the share of tiles, held by tests/world-groundmat.test.mjs (a bush in about one tile in ten, a tree in about one in twelve inside a grove).
 */
export function dressingOf(i, j, grove) {
  const u = hz(i, j, 7); // (the mixing hash: h2 leaves rows in what it scatters)
  if (u < 0.012 + 0.16 * grove * grove) return 3;
  if (u < 0.06 + 0.16 * grove) return 1;
  if (u < 0.078 + 0.16 * grove) return 2;
  return 0;
}
/**
 * `terrain`: the grass laid on the baked ground, near and close: clumps of blades in three greens and the odd cluster of flowers, never on a block, a slope or within a tile and a half of the coast. The bushes, rocks and
 * trees of the meadows are `drawPlants`, below. Baked with the chunk, so a pan draws none of it. At most 750 blades of grass in a chunk (1,500 units, two a blade).
 */
function drawTerrain(ctx, view, env, w, a) {
  const ch = a && a.chunk, lod = env.lod ? env.lod.detail : null; if (!ch || !lod || lod[2] < 0.04) return;
  const T = ch.scene.terr, { land, core } = LAYOUT, VW = LAYOUT.VW, [i0, i1, j0, j1] = gridRange(view, 90, 1, [GW, GH]), near = lod[2], close = lod[3], per = 0.9 + 1.5 * close; let budget = 1500;
  for (let s = i0 + j0; s <= i1 + j1 && budget > 0; s++) for (let j = Math.max(j0, s - i1); j <= Math.min(j1, s - i0); j++) {
    const i = s - j, k = j * GW + i; if (!land[k] || core[k] || !openMeadow(T, i, j, VW, -1.5, 4.5)) continue;
    const n = per + hz(i, j, 4000) * per, cnt = (n | 0) + (hz(i, j, 4001) < n - (n | 0) ? 1 : 0);
    ctx.globalAlpha = near * 0.92;
    for (let q = 0; q < cnt; q++) {
      const gx = i + hz(i, j, q * 3 + 1), gy = j + hz(i, j, q * 3 + 2); if (LAYOUT.footAt(gx, gy) && !outsideBlock(gx, gy)) continue;
      const z = zOn(gx, gy), x = px(gx, gy), y = py(gx, gy, z), hh = hz(i, j, q * 3 + 3);
      if (hh > 0.86 - 0.06 * close) { // a few flowers in a small cluster
        ctx.fillStyle = [BLOOM.white, BLOOM.butter, BLOOM.pink, BLOOM.lilac][(hh * 97 | 0) % 4]; ctx.beginPath(); for (let f = 0; f < 3; f++) { const fx = x + (hz(i, j, 20 + f) - 0.5) * 7, fy = y + (hz(i, j, 30 + f) - 0.5) * 3.5; ctx.moveTo(fx + 1.5, fy); ctx.arc(fx, fy, 1.5, 0, 6.2832); } ctx.fill(); budget -= 3; continue;
      }
      ctx.fillStyle = TUFT[(hh * 31 | 0) % 4]; ctx.beginPath(); let blades = tuft(ctx, x, y, hh); if (hh > 0.4) blades += tuft(ctx, x + 4.2 + hh * 2, y + 1.4, 1 - hh, 4 + hh * 2.5); ctx.fill(); budget -= 2 * blades; // a clump: one tuft and, beside it, a smaller one; two units a blade, as three blades cost six when a tuft was three
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
    const gx = i + 0.2 + hz(i, j, 11) * 0.6, gy = j + 0.2 + hz(i, j, 12) * 0.6; if (LAYOUT.footAt(gx, gy) || isRoad(gx, gy)) continue;
    const z = zOn(gx, gy), x = px(gx, gy), y = py(gx, gy, z), hh = hz(i, j, 13);
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
  drawAprons(ctx, view, env, w, a);
  drawPlants(ctx, view, env, w, a);
}
registerLayer('blocks', drawBlocks, 'inherit', () => 1);

// ---------------------------------------------------------------- roads
const DENSE = new WeakMap();
/** A road's polyline resampled every 0.6 tile or less, with the mitred normal, the ground's height and the arc length at each sample: [gx, gy, nx, ny, z, s] a sample. */
function denseOf(e) {
  let d = DENSE.get(e); if (d) return d;
  const pts = e.pts, out = [], br = LAYOUT.bridges.filter((b) => b.edge === e); let s = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = pts[i][0], ay = pts[i][1], bx = pts[i + 1][0], by = pts[i + 1][1], l = Math.hypot(bx - ax, by - ay) || 1, n = Math.max(1, Math.ceil(l / 0.6));
    for (let k = 0; k < n; k++) out.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n, 0, 0, 0, s + l * k / n]);
    s += l;
  }
  out.push([pts[pts.length - 1][0], pts[pts.length - 1][1], 0, 0, 0, s]);
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)], tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
    out[i][2] = -ty / tl; out[i][3] = tx / tl;
    const deck = br.some((b) => out[i][5] >= b.s0 - 0.01 && out[i][5] <= b.s1 + 0.01); // over a bridge the ground is the deck; elsewhere the road's own graded height (the ground at a bank dips to the water, and a road must not)
    out[i][4] = (deck || !e.zprof ? zAt(out[i][0], out[i][1]) : roadZ(e, out[i][5])) + 0.4;
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
/** The colours a road is painted in: an open road is grey asphalt in a cream kerb with yellow dashes; a locked one is paler, veiled, dashless; a footpath is sand in a darker sand edge. The kerb of a road is a tile's fifth wide, a path's its seventh. */
export function roadTones(open, path = false) {
  if (path) return { surface: FOOT, edge: FOOT_EDGE, kb: 0.14 };
  return { surface: V(open ? mix(ROAD.mid, ROAD.light, 0.12) : mix(ROAD.light, ROAD.kerb, 0.2), open ? 0 : 0.5), edge: V(ROAD.kerb, open ? 0 : 0.5), kb: 0.2, dash: ROAD.dash };
}
/** The dashes down the middle of a road: [from, to] along it, 0.9 long, 0.8 apart, from 1.2 tiles in; none within DASH_SKIP of a junction (the three roads of a fork meet there and a dash of each would lie on the others). */
export const DASH_SKIP = 2.0;
export function dashSpans(e) {
  const out = [];
  for (let s = 1.2; s < e.len - 1; s += 1.7) { const s1 = Math.min(e.len, s + 0.9); if ((e.ja && s < DASH_SKIP) || (e.jb && s1 > e.len - DASH_SKIP)) continue; out.push([s, s1]); }
  return out;
}
/** One centre dash: a band 0.35 tile wide from s to s1 along the road. */
function dash(ctx, d, s, s1) {
  const p = at(d, s), q = at(d, s1); ctx.beginPath();
  for (const [pt, o] of [[p, -0.175], [q, -0.175], [q, 0.175], [p, 0.175]]) { const gx = pt[0] + pt[2] * o, gy = pt[1] + pt[3] * o; ctx.lineTo(px(gx, gy), py(gx, gy, pt[4] + 0.2)); }
  ctx.closePath(); ctx.fill();
}
/** A junction: its place, the way its stem runs (a unit vector out of the node, along the stem's last stretch, away from the port) and the edges that meet there. Made from the layout, once. */
let JUNC = null;
/** How many tiles of a branch of another state than the stem's are painted again in its own tone, from the node out (the asphalt patch reaches 0.8 tile from the node along the grid's axes and 1.13 along its diagonal, and the kerb patch a tile more). */
export const FORK_REPAINT = 1.2;
export function junctions() {
  if (JUNC) return JUNC;
  JUNC = [];
  for (const name of Object.keys(JUNCTIONS)) {
    const es = EDGES.filter((e) => e.a === name || e.b === name), stem = es.find((e) => e.stem); if (!stem || es.length < 3) continue;
    const [x, y] = LAYOUT.nodes.get(name), d = denseOf(stem), q = d[d.length - 1], tx = q[3], ty = -q[2]; // the stem ends here: its heading is the way the traveller goes on, which is away from the port
    JUNC.push({ name, x, y, z: q[4], ux: tx, uy: ty, stem, edges: es });
  }
  return JUNC;
}
/** The samples of the first `len` tiles of a road from its junction, in the form `strip` takes, from the node outwards, with both ends exact. */
function nodeRun(e, J, len) {
  const d = denseOf(e), atA = e.a === J.name, out = [at(d, atA ? 0 : e.len)], ps = atA ? d : [...d].reverse();
  for (const p of ps) { const s = atA ? p[5] : e.len - p[5]; if (s > 0.01 && s < len - 0.01) out.push(p); }
  out.push(at(d, atA ? len : e.len - len));
  return out;
}
/** The 2 by 2 patch that hides the fork where three roads meet: a square of the road's own width, a tile each way from the node, turned to the stem; `inset` shrinks it by a kerb (the asphalt's is the kerb's less 0.2 all round). */
function patch(ctx, J, inset, lift) {
  const h = 1 - inset, vx = -J.uy, vy = J.ux; ctx.beginPath();
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([su, sv], i) => { const gx = J.x + J.ux * su * h + vx * sv * h, gy = J.y + J.uy * su * h + vy * sv * h, X = px(gx, gy), Y = py(gx, gy, J.z + lift); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
  ctx.closePath(); ctx.fill();
}

/**
 * The connectors of the path heads. A footpath that leaves a road starts at a path head (island.js HEADS), a point two tiles to the road's side, which keeps the path off the asphalt (the data: tests/world-roads.test.mjs); that left a tile of
 * grass between the road's kerb and the bare square end of the sand, and the path floated. A connector is the path's own first stretch run back to the road: a strip of sand in the path's width and two tones, from the head along the way the path
 * goes, backwards, to the first place that meets a road's middle line, so it comes out of the road at the angle the path leaves at. It is ground art, painted with the footpaths (under every kerb and every asphalt strip: the road lies over its end),
 * and no edge changes (the detector, which reads edges, still finds the path two tiles from the road). The head's curb return and bollards are WP11's. { head, edge (the path), road (the edge it joins), d (two samples in the form `strip` takes), hw, len, hit (the road's middle line, where it ends) }.
 */
let HEADC = null;
export function headConnectors() {
  if (HEADC) return HEADC;
  HEADC = [];
  const roads = EDGES.filter((e) => !e.path && !e.ferry);
  for (const e of EDGES) {
    if (!e.path || !HEADS[e.a]) continue;
    const d = denseOf(e), p = d[0], nx = p[2], ny = p[3], bx = -ny, by = nx; // (the way back: against the path's heading, which is (ny, -nx): the normal turned a quarter)
    let best = null;
    for (const r of roads) for (let i = 0; i + 1 < r.pts.length; i++) {
      const ax = r.pts[i][0], ay = r.pts[i][1], cx = r.pts[i + 1][0] - ax, cy = r.pts[i + 1][1] - ay, den = bx * cy - by * cx; if (Math.abs(den) < 1e-9) continue;
      const t = ((ax - p[0]) * cy - (ay - p[1]) * cx) / den, k = ((ax - p[0]) * by - (ay - p[1]) * bx) / den;
      if (t > 0 && t < 6 && k >= 0 && k <= 1 && (!best || t < best.t)) best = { t, road: r, s: r.lens[i] + k * Math.hypot(cx, cy) };
    }
    if (!best) continue;
    const q = [p[0] + bx * best.t, p[1] + by * best.t, nx, ny, at(denseOf(best.road), best.s)[4], best.t];
    HEADC.push({ head: e.a, edge: e, road: best.road, d: [p, q], hw: e.w / 2, len: best.t, hit: [q[0], q[1]] });
  }
  return HEADC;
}

/**
 * The aprons: one at every port a road leaves (not a footpath, not the ferry), where the block's street becomes the road beyond (roadshape.js APRON). { e, end (0: the edge starts at the port, 1: it ends there), port, D, pieces, bb }: the
 * polygons are in the grid and made once, from the road's own middle line beyond the port and the straight run under the block's edge.
 */
let APR = null;
export function aprons() {
  if (APR) return APR;
  APR = [];
  for (const e of EDGES) {
    if (e.path || e.ferry) continue;
    for (const end of [0, 1]) {
      const port = end ? e.b : e.a; if (!/^\d+\./.test(port)) continue;
      const D = DIST[+port.split('.')[0]], d = denseOf(e), s0 = end ? e.len : 0, p0 = at(d, s0), sg = end ? -1 : 1, tx = p0[3] * sg, ty = -p0[2] * sg; // (the way out of the block: along the edge, or against it)
      const frame = (u) => (u < 0 ? [p0[0] + tx * u, p0[1] + ty * u, p0[2], p0[3], p0[4]] : at(d, end ? e.len - u : u));
      const pieces = apronPieces(frame); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const [x, y, z] of pieces.bands[0].kerb[0].concat(pieces.bands[0].kerb[1])) { x0 = Math.min(x0, px(x, y)); x1 = Math.max(x1, px(x, y)); y0 = Math.min(y0, py(x, y, z)); y1 = Math.max(y1, py(x, y, z)); }
      for (const [x, y, z] of pieces.walks.left.concat(pieces.walks.right)) { x0 = Math.min(x0, px(x, y)); x1 = Math.max(x1, px(x, y)); y0 = Math.min(y0, py(x, y, z)); y1 = Math.max(y1, py(x, y, z)); }
      APR.push({ e, end, port, D, pieces, bb: [x0 - 8, y0 - 8, x1 + 8, y1 + 8] });
    }
  }
  return APR;
}
const poly = (ctx, pts, lift = 0) => { ctx.beginPath(); pts.forEach(([x, y, z], i) => { const X = px(x, y), Y = py(x, y, z + lift); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.closePath(); ctx.fill(); };
/**
 * Paint the aprons in view, over the stage (the blocks layer calls this once the stages are down: the apron covers the stage's lip and shadow where the street leaves it): the sidewalk's wedges, then each band of kerb and asphalt, which
 * step from the block's own tones at its edge to the road's, then the road's dashes that lie in it (the road under it painted them, and the apron has covered them). Culled by its own box, so a chunk that holds only the end of one has it.
 */
function drawAprons(ctx, view, env, w, a) {
  const zoom = a.zoom;
  for (const A of aprons()) {
    const bb = A.bb; if (!(bb[2] > view.x0 && bb[0] < view.x1 && bb[3] > view.y0 && bb[1] < view.y1)) continue;
    const D = A.D, T = tonesOf(D, setOf(D), lockedOf(w, D.id) ? 1 : 0), open = w.unlocked ? w.unlocked.has(A.e.gate) : true, R = roadTones(open);
    ctx.fillStyle = T.walk; poly(ctx, A.pieces.walks.left); poly(ctx, A.pieces.walks.right);
    for (const b of A.pieces.bands) { ctx.fillStyle = mix(T.kerbTop, R.edge, b.t); poly(ctx, b.kerb[0]); poly(ctx, b.kerb[1]); }
    for (const b of A.pieces.bands) { ctx.fillStyle = mix(T.asph, R.surface, b.t); poly(ctx, b.asphalt, 0.1); }
    if (open && zoom >= 0.3) { const d = denseOf(A.e); ctx.fillStyle = R.dash; for (const [s, s1] of dashSpans(A.e)) if ((A.end ? A.e.len - s1 : s) <= APRON.len + 0.1) dash(ctx, d, s, s1); } // (the dashes that begin within the apron's length of the port)
  }
}

/**
 * The pads' ground treatment (the farm's stripes, a yard's pavers, the harbor's bands, the campus lawn): each is a rectangle over the whole of a pad quadrant, and a road crosses a pad, so it is painted FIRST, under the roads, and never
 * reaches one (S16: the stripes of 11 lay over the asphalt of the road to 12, and the harbor's band over the road to 9). The blocks layer skips them.
 */
function drawPadDecals(ctx, view, env, w, a) {
  const detail = env.lod ? env.lod.detail : [1, 1, 1, 1], zoom = a.zoom;
  for (const id of LAYOUT.ids) {
    const D = DIST[id], b = D.bb; if (!D.decals.some((d) => d.pad) || !(b[2] > view.x0 && b[0] < view.x1 && b[3] + 200 > view.y0 && b[1] < view.y1)) continue;
    let S = null, k = 0;
    for (const d of D.decals) {
      if (!d.pad || zoom < (d.min ?? 0.3)) continue; const [x0, y0, x1, y1] = decalBox(d, D.z); if (!(x1 > view.x0 && x0 < view.x1 && y1 > view.y0 && y0 < view.y1)) continue;
      if (!S) { S = setOf(D); k = lockedOf(w, id) ? 1 : 0; }
      decalV2(ctx, d, D.z, k, S, detail);
    }
  }
}

/**
 * The roads, in four passes, so no kerb is ever painted across another road's asphalt (the edges were painted one at a time, kerb then asphalt then dashes, so where two roads met the later one's kerb lay over the earlier one's asphalt:
 * a fork was two ribbons with a cream line across them): the pads' decals; every footpath (under every road) with the strip of sand that joins each path head to its road; every kerb strip and the patch of kerb at each junction; every asphalt strip with its
 * bend discs and the patch of asphalt at each junction (each patch is the stem's tone; a branch of another state, a locked road at an open fork, is painted again over the patch from the node out, FORK_REPAINT tiles, so it keeps its own tone right up to the node
 * and the colour changes on one line across it, which is where its gate will stand); then the centre dashes (none
 * within two tiles of a junction) and the bridges. The ferry's buoys are last. An edge is culled by its own box.
 */
function drawRoads(ctx, view, env, w, a) {
  const zoom = a.zoom;
  drawPadDecals(ctx, view, env, w, a);
  const vis = [];
  for (const e of EDGES) {
    if (!e.v2bb) { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of e.pts) { x0 = Math.min(x0, px(x, y)); x1 = Math.max(x1, px(x, y)); y0 = Math.min(y0, py(x, y, 0)); y1 = Math.max(y1, py(x, y, 0)); } e.v2bb = [x0 - 80, y0 - LAYOUT.maxZ - 80, x1 + 80, y1 + 80]; e.br = LAYOUT.bridges.filter((b) => b.edge === e); }
    const bb = e.v2bb; if (!(bb[2] > view.x0 && bb[0] < view.x1 && bb[3] > view.y0 && bb[1] < view.y1)) continue;
    const open = w.unlocked ? w.unlocked.has(e.gate) : true, d = denseOf(e);
    if (e.ferry) { vis.push({ e, d, open }); continue; }
    const brokenBridge = !open && DIST[e.gate]?.gateKind === 'bridge', br = e.br[0], gap = brokenBridge && br ? [br.s0 + (br.s1 - br.s0) * 0.22, br.s1 - (br.s1 - br.s0) * 0.22] : null;
    let runs = [[0, d.length - 1]];
    if (gap) { const ia = d.findIndex((p) => p[5] >= gap[0]), ib = d.findIndex((p) => p[5] >= gap[1]); runs = [[0, Math.max(0, ia - 1)], [ib, d.length - 1]]; }
    vis.push({ e, d, open, gap, runs, brokenBridge, T: roadTones(open, e.path), hw: e.w / 2 });
  }
  const bends = (d, r0, r1, rad, lift) => { // rounded joins at every bend: a disc of the ground's own circle (an ellipse on the screen)
    for (let q = r0 + 1; q < r1; q++) { const p = d[q], a2 = d[q - 1], b2 = d[q + 1], turn = Math.abs(a2[2] * b2[3] - a2[3] * b2[2]); if (turn > 0.15) { ctx.beginPath(); ctx.ellipse(px(p[0], p[1]), py(p[0], p[1], p[4] + lift), rad * HW * 1.4142, rad * HH * 1.4142, 0, 0, 6.2832); ctx.fill(); } }
  };
  const ways = vis.filter((v) => !v.e.ferry), paths = ways.filter((v) => v.e.path), roads = ways.filter((v) => !v.e.path), forks = junctions().filter((J) => J.edges.some((e) => vis.some((v) => v.e === e)));
  // 1. the footpaths, under everything: their edges, then their sand; each path head's strip of sand to the road goes with them (the road is painted over its end)
  const joins = headConnectors().filter((c) => paths.some((v) => v.e === c.edge)), FP = roadTones(true, true);
  for (const v of paths) { ctx.fillStyle = v.T.edge; for (const [r0, r1] of v.runs) { strip(ctx, v.d, -v.hw, v.hw, 0, r0, r1); bends(v.d, r0, r1, v.hw, 0); } }
  ctx.fillStyle = FP.edge; for (const c of joins) strip(ctx, c.d, -c.hw, c.hw, 0);
  for (const v of paths) { ctx.fillStyle = v.T.surface; for (const [r0, r1] of v.runs) { strip(ctx, v.d, -v.hw + v.T.kb, v.hw - v.T.kb, 0.1, r0, r1); bends(v.d, r0, r1, v.hw - v.T.kb, 0.1); } }
  ctx.fillStyle = FP.surface; for (const c of joins) strip(ctx, c.d, -c.hw + FP.kb, c.hw - FP.kb, 0.1);
  // 2. the kerb of every road: one strip each, and the patch of every junction (a locked road's own kerb is paler)
  for (const v of roads) { ctx.fillStyle = v.T.edge; for (const [r0, r1] of v.runs) { strip(ctx, v.d, -v.hw, v.hw, 0, r0, r1); bends(v.d, r0, r1, v.hw, 0); } }
  for (const J of forks) { ctx.fillStyle = roadTones(openOf(w, J)).edge; patch(ctx, J, 0, 0); }
  const apart = (J) => J.edges.map((e) => vis.find((v) => v.e === e)).filter((v) => v && !v.e.stem && v.open !== openOf(w, J)); // (the branches that are not in the patch's state: a locked road at an open fork, an open road at a locked one)
  for (const J of forks) for (const v of apart(J)) { ctx.fillStyle = v.T.edge; strip(ctx, nodeRun(v.e, J, FORK_REPAINT), -v.hw, v.hw, 0); } // the patch is the stem's tone and reaches a tile into a branch of another: the branch keeps its own from the node out, so the colour changes on one line across it
  // 3. the asphalt of every road, inside its kerb, with the same patches (a tile's fifth smaller)
  for (const v of roads) { ctx.fillStyle = v.T.surface; for (const [r0, r1] of v.runs) { strip(ctx, v.d, -v.hw + v.T.kb, v.hw - v.T.kb, 0.1, r0, r1); bends(v.d, r0, r1, v.hw - v.T.kb, 0.1); } }
  for (const J of forks) { ctx.fillStyle = roadTones(openOf(w, J)).surface; patch(ctx, J, 0.2, 0.1); }
  for (const J of forks) for (const v of apart(J)) { ctx.fillStyle = v.T.surface; strip(ctx, nodeRun(v.e, J, FORK_REPAINT), -v.hw + v.T.kb, v.hw - v.T.kb, 0.1); }
  // 4. the centre dashes of the open roads (painted bands 0.35 tile wide, 0.9 long, 0.8 apart), then the bridges
  if (zoom >= 0.3) for (const v of roads) {
    if (!v.open) continue; ctx.fillStyle = v.T.dash;
    for (const [s, s1] of dashSpans(v.e)) { if (v.gap && s > v.gap[0] - 1 && s < v.gap[1] + 1) continue; dash(ctx, v.d, s, s1); }
  }
  for (const v of roads) for (const b of v.e.br) drawBridge(ctx, b, v.brokenBridge, a.far, zoom);
  // 5. the ferry: a line of buoys, red and cream: each a rounded cone with a white band, a lamp on its top, a foam ring where it meets the water and a soft shadow on the sea, so it reads as a thing and not as a speck
  for (const { e, d, open } of vis) if (e.ferry) { for (let s = 3, n = 0; s < e.len - 3; s += 1.5, n++) { const p = at(d, s); buoy(ctx, px(p[0], p[1]), py(p[0], p[1], 0), n % 2 ? PAVE.cream : TOY.red, open ? 1 : 0.7); } ctx.globalAlpha = 1; }
}
/** Is the fork's stem open? (A fork is painted in its stem's state: the roads at it are open or locked by the district of each, and the patch takes the stem's.) */
const openOf = (w, J) => (w.unlocked ? w.unlocked.has(J.stem.gate) : true);
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
