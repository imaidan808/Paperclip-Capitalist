// The V2 ground layers, in the toy language of the art direction: the base (sea, cliffs and land, painted per pixel by rasterbase.js), the districts' blocks as little stages, kerbed roads with painted dashes,
// zebra crossings, plank bridges with ball-capped rails and foam collars, and the ferry's buoys. Docs/ART_DIRECTION.md 4.5 and 5.
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md). Each is a layer of stack.js (`shore`, `terrain`, `roads`, `blocks`), registered here and drawn into a ground chunk (groundchunks.js) by the ground pass: they draw only
// from their arguments and the world's state, never from the camera, and every mark is a filled shape (nothing is stroked thinner than 1.5 world pixels).
import { registerLayer } from './stack.js';
import { LAYOUT, DIST, EDGES, zAt, BW, BD, GW, GH } from './layout.js';
import { ROAD, PAVE, SAND, WOOD, LIGHT, SEA, TOY, GRASS, BLOOM, groundSet, veiled } from './palette.js';
import { mix, clamp, h2 } from './iso.js';
import { bakeBase } from './rasterbase.js';
import { decalV2 } from './decalart.js';
import { VEIL } from './terrainfield.js';

const HW = 32, HH = 16;
const px = (gx, gy) => (gx - gy) * HW, py = (gx, gy, z) => (gx + gy) * HH - z;
const SETS = new Map();
/** A district's daylight colours (the palette's row for its theme), memoised. */
function setOf(D) { let s = SETS.get(D.id); if (!s) { const g = groundSet(D.theme) || { ground: D.cols.ground, walk: D.cols.walk, hi: D.cols.ground, alt: D.cols.ground, pad: D.cols.pad, road: D.cols.road }; s = { ...g, asphalt: mix(ROAD.mid, g.ground, 0.1), kerb: ROAD.kerb }; SETS.set(D.id, s); } return s; }
const lockedOf = (w, id) => (w.unlocked ? !w.unlocked.has(id) : false);
const V = (c, k) => (k ? veiled(c, k * VEIL) : c);

// ---------------------------------------------------------------- the base: sea, cliffs and land, per pixel
/** `shore`: paint the chunk's whole buffer (sea, walls, land) and put it into the chunk. With no chunk (a direct draw: the Node tests) nothing is painted here. */
function drawShore(ctx, view, env, w, a) {
  const ch = a && a.chunk; if (!ch) return;
  bakeBase(ch.buf, ch.N, ch.N, ch.S, ch.ox, ch.oy, ch.scene, view);
  if (ch.img) ctx.putImageData(ch.img, 0, 0);
}
registerLayer('shore', drawShore, 'inherit', () => 1);
// ---------------------------------------------------------------- the terrain's dressing: tufts and flowers
const TUFT = [GRASS.hi, GRASS.shade, GRASS.deep, GRASS.coolShade];
const zOn = (gx, gy) => { const { ZV, VW } = LAYOUT, x = clamp(gx, 0, GW - 1e-6), y = clamp(gy, 0, GH - 1e-6), i = x | 0, j = y | 0, fx = x - i, fy = y - j; return (ZV[j * VW + i] * (1 - fx) + ZV[j * VW + i + 1] * fx) * (1 - fy) + (ZV[(j + 1) * VW + i] * (1 - fx) + ZV[(j + 1) * VW + i + 1] * fx) * fy; };
/**
 * `terrain`: the dressing laid on the baked ground, near and close only (it fades in with the level of detail, so nothing pops): small tufts of three curved blades in three greens and the odd cluster of
 * flowers, hashed per tile, never on a road, a block, a pad or within a tile and a half of the coast. At most 1,500 marks in a chunk; it is baked with the chunk, so a pan never draws it.
 */
function drawTerrain(ctx, view, env, w, a) {
  const ch = a && a.chunk, lod = env.lod ? env.lod.detail : null; if (!ch || !lod || lod[2] < 0.04) return;
  const T = ch.scene.terr, { land, core } = LAYOUT, VW = LAYOUT.VW;
  let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
  for (const [x, y] of [[view.x0, view.y0], [view.x1, view.y0], [view.x0, view.y1], [view.x1, view.y1]]) for (const zz of [0, 60]) { const u = x / 64 + (y + zz) / 32, v = (y + zz) / 32 - x / 64; a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v); }
  const per = 0.7 + 1.1 * lod[3]; let budget = 1500; ctx.globalAlpha = lod[2] * 0.9;
  for (let j = Math.max(0, Math.floor(b0)); j <= Math.min(GH - 1, Math.ceil(b1)) && budget > 0; j++) for (let i = Math.max(0, Math.floor(a0)); i <= Math.min(GW - 1, Math.ceil(a1)); i++) {
    const k = j * GW + i; if (!land[k] || core[k]) continue;
    const kv = j * VW + i; if (T.inl[kv] > -1.5 || T.inl[kv + 1] > -1.5 || T.inl[kv + VW] > -1.5 || T.inl[kv + VW + 1] > -1.5) continue; // the beach and the coast keep their own look
    const n = per + h2(i, j + 4000) * per, cnt = (n | 0) + (h2(i + 91, j) < n - (n | 0) ? 1 : 0);
    for (let q = 0; q < cnt; q++) {
      const gx = i + h2(i * 7 + q, j * 3 + 17), gy = j + h2(i * 5 + 3, j * 11 + q * 5 + 1); if (LAYOUT.footAt(gx, gy)) continue;
      const z = zOn(gx, gy), x = px(gx, gy), y = py(gx, gy, z), hh = h2(i * 13 + q, j * 29 + 5);
      if (hh > 0.86 - 0.06 * lod[3]) { // a few flowers in a small cluster
        const c = [BLOOM.white, BLOOM.butter, BLOOM.pink, BLOOM.lilac][(hh * 97 | 0) % 4];
        ctx.fillStyle = c; ctx.beginPath(); for (let f = 0; f < 3; f++) { const fx = x + (h2(i + f, j * 3) - 0.5) * 7, fy = y + (h2(i * 3, j + f) - 0.5) * 3.5; ctx.moveTo(fx + 1.5, fy); ctx.arc(fx, fy, 1.5, 0, 6.2832); } ctx.fill(); budget -= 3; continue;
      }
      const col = TUFT[(hh * 31 | 0) % 4], hgt = 5 + hh * 3.4; ctx.fillStyle = col; ctx.beginPath(); // a tuft: three blades, each a leaning, tapering triangle
      for (let bl = -1; bl <= 1; bl++) { const bx = x + bl * 1.7, lean = bl * 1.5 + (hh - 0.5) * 2; ctx.moveTo(bx - 0.9, y); ctx.lineTo(bx + lean, y - hgt * (bl === 0 ? 1 : 0.78)); ctx.lineTo(bx + 0.9, y); ctx.closePath(); }
      ctx.fill(); budget -= 3;
    }
  }
  ctx.globalAlpha = 1;
}
registerLayer('terrain', drawTerrain, 'inherit', () => 1);

// ---------------------------------------------------------------- shapes in the ground plane
/** A rounded rectangle in grid units at height z, as a path (corner arcs of five segments). */
function rrect(ctx, x, y, w, d, r, z) {
  r = Math.min(r, w / 2, d / 2); ctx.moveTo(px(x + r, y), py(x + r, y, z));
  const arc = (cx, cy, a0) => { for (let i = 0; i <= 5; i++) { const a = a0 + (i / 5) * (Math.PI / 2), gx = cx + Math.cos(a) * r, gy = cy + Math.sin(a) * r; ctx.lineTo(px(gx, gy), py(gx, gy, z)); } };
  arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + d - r, 0); arc(x + r, y + d - r, Math.PI / 2); arc(x + r, y + r, Math.PI); ctx.closePath();
}
const fillRR = (ctx, x, y, w, d, r, z, c, a = 1) => { ctx.beginPath(); rrect(ctx, x, y, w, d, r, z); ctx.globalAlpha = a; ctx.fillStyle = c; ctx.fill(); ctx.globalAlpha = 1; };
const fillQuad = (ctx, x, y, w, d, z, c) => { ctx.beginPath(); ctx.moveTo(px(x, y), py(x, y, z)); ctx.lineTo(px(x + w, y), py(x + w, y, z)); ctx.lineTo(px(x + w, y + d), py(x + w, y + d, z)); ctx.lineTo(px(x, y + d), py(x, y + d, z)); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); };

// ---------------------------------------------------------------- the districts' blocks
/**
 * Each district's block as a little stage: a soft violet contact shadow on the terrain towards the shade side, the block in its daylight ground with a lighter rim, the sidewalks in cream, the avenue and the
 * cross street as kerbed asphalt, the stash yard in its own tone with a light border, then its decals and its crosswalks. A locked district's colours are veiled, never darkened.
 */
function drawBlocks(ctx, view, env, w, a) {
  const detail = env.lod ? env.lod.detail : [1, 1, 1, 1];
  for (const id of LAYOUT.ids) {
    const D = DIST[id], b = D.bb; if (!(b[2] > view.x0 && b[0] < view.x1 && b[3] + 200 > view.y0 && b[1] < view.y1 + 200)) continue;
    const S = setOf(D), k = lockedOf(w, id) ? 1 : 0, z = D.z, ox = D.ox, oy = D.oy, v = (c) => V(c, k);
    // the contact shadow of the stage on the ground round it (three soft steps, towards +gx)
    for (let i = 3; i >= 1; i--) fillRR(ctx, ox - 0.5 + i * 0.28, oy - 0.5 + i * 0.12, BW + 1 + i * 0.22, BD + 1 + i * 0.3, 1.6, z, LIGHT.shadow, 0.045);
    for (const g of D.ground) {
      if (g.kind === 'block') { fillRR(ctx, g.x, g.y, g.w, g.d, 0.9, z, v(S.ground)); fillRR(ctx, g.x + 0.32, g.y + 0.32, g.w - 0.64, g.d - 0.64, 0.7, z, v(S.hi), 0.16); }
      else if (g.kind === 'walk') fillQuad(ctx, g.x, g.y, g.w, g.d, z, v(S.walk));
    }
    // the roads: kerb colour first for both, then the asphalt inset, so the two streets meet in a crossing with kerb returns
    const roads = D.ground.filter((g) => g.kind === 'road'), kb = 0.2, kerb = v(S.kerb), asph = v(S.asphalt);
    for (const g of roads) fillQuad(ctx, g.x, g.y, g.w, g.d, z, kerb);
    for (const g of roads) { const horiz = g.w > g.d; fillQuad(ctx, g.x + (horiz ? 0 : kb), g.y + (horiz ? kb : 0), g.w - (horiz ? 0 : 2 * kb), g.d - (horiz ? 2 * kb : 0), z, asph); }
    // the centre dashes and the crossing's bars (painted bands, 0.2 tile at the least)
    ctx.fillStyle = v(ROAD.dash); ctx.beginPath();
    for (let x = ox + 0.4; x < ox + BW - 1; x += 1.7) { if (x > ox + 8.2 && x < ox + 13.4) continue; ctx.moveTo(px(x, oy + 8.88), py(x, oy + 8.88, z)); ctx.lineTo(px(x + 0.9, oy + 8.88), py(x + 0.9, oy + 8.88, z)); ctx.lineTo(px(x + 0.9, oy + 9.12), py(x + 0.9, oy + 9.12, z)); ctx.lineTo(px(x, oy + 9.12), py(x, oy + 9.12, z)); ctx.closePath(); }
    for (let y = oy + 0.4; y < oy + BD - 0.6; y += 1.7) { if (y > oy + 6.4 && y < oy + 11.6) continue; ctx.moveTo(px(ox + 10.88, y), py(ox + 10.88, y, z)); ctx.lineTo(px(ox + 11.12, y), py(ox + 11.12, y, z)); ctx.lineTo(px(ox + 11.12, y + 0.9), py(ox + 11.12, y + 0.9, z)); ctx.lineTo(px(ox + 10.88, y + 0.9), py(ox + 10.88, y + 0.9, z)); ctx.closePath(); }
    ctx.fill();
    ctx.fillStyle = v(ROAD.zebra); ctx.beginPath();
    for (let q = 0; q < 5; q++) {
      const u = 0.28 + q * 0.34;
      for (const x of [ox + 8.3, ox + 13.1]) { ctx.moveTo(px(x, oy + 8 + u - 0.1), py(x, oy + 8 + u - 0.1, z)); ctx.lineTo(px(x + 0.6, oy + 8 + u - 0.1), py(x + 0.6, oy + 8 + u - 0.1, z)); ctx.lineTo(px(x + 0.6, oy + 8 + u + 0.1), py(x + 0.6, oy + 8 + u + 0.1, z)); ctx.lineTo(px(x, oy + 8 + u + 0.1), py(x, oy + 8 + u + 0.1, z)); ctx.closePath(); }
      for (const y of [oy + 6.4, oy + 11.1]) { ctx.moveTo(px(ox + 10.2 + u - 0.1, y), py(ox + 10.2 + u - 0.1, y, z)); ctx.lineTo(px(ox + 10.2 + u + 0.1, y), py(ox + 10.2 + u + 0.1, y, z)); ctx.lineTo(px(ox + 10.2 + u + 0.1, y + 0.6), py(ox + 10.2 + u + 0.1, y + 0.6, z)); ctx.lineTo(px(ox + 10.2 + u - 0.1, y + 0.6), py(ox + 10.2 + u - 0.1, y + 0.6, z)); ctx.closePath(); }
    }
    ctx.fill();
    for (const g of D.ground) if (g.kind === 'pad') { fillRR(ctx, g.x, g.y, g.w, g.d, 0.5, z, v(S.pad)); fillRR(ctx, g.x + 0.12, g.y + 0.12, g.w - 0.24, g.d - 0.24, 0.4, z, v(S.hi), 0.28); fillRR(ctx, g.x + 0.3, g.y + 0.3, g.w - 0.6, g.d - 0.6, 0.3, z, v(S.pad)); }
    for (const d of D.decals) if (a.zoom >= (d.min ?? 0.3)) decalV2(ctx, d, z, k, S, detail);
  }
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
    if (e.ferry) { // a line of soft round buoys, red and cream, where the ferry sails (the route glints when it runs: livedecals)
      for (let s = 3, n = 0; s < e.len - 3; s += 1.5, n++) { const p = at(d, s), x = px(p[0], p[1]), y = py(p[0], p[1], 0); ctx.globalAlpha = open ? 1 : 0.7; ctx.fillStyle = n % 2 ? PAVE.cream : TOY.red; ctx.beginPath(); ctx.ellipse(x, y, 3.2, 2.4, 0, 0, 6.2832); ctx.fill(); ctx.fillStyle = LIGHT.white; ctx.beginPath(); ctx.ellipse(x - 0.8, y - 1, 1.1, 0.8, 0, 0, 6.2832); ctx.fill(); }
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
