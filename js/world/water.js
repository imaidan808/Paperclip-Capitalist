// The sea, V2: a world-space surface. The depth, foam, glow and shadow of the water are baked into the ground chunks with the land (rasterbase.js: one picture, anchored to the world, with no seam where
// the sea meets the coast); this module is the layer under them and, below, the live motion on top. Docs/ART_DIRECTION.md 5.1 to 5.3 and 5.10.
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md).
import { registerLayer } from './stack.js';
import { mix, h2 } from './iso.js';
import { SEA } from './palette.js';
import { LAYOUT, DIST, zAt } from './layout.js';
import { coastOf } from './scene.js';
import { tone } from './decalart.js';
import { TAU, crestOutline, CREST_N, foamChain, ringState, sparkle } from './waves.js';

const FILL = mix(SEA.sea, SEA.deep, 0.5);
/** `sea` (world space): fill the view with the open sea's colour, so that whatever a chunk has not painted yet (a chunk being baked) is sea and never a hole. The depth is in the chunks. */
function drawSea(ctx, view) { ctx.fillStyle = FILL; ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0); }
registerLayer('sea', drawSea, 'world');

// ---------------------------------------------------------------- the live sea: crests, foam curls, ripples, sparkles and the swash on the beaches
// Everything here is a function of the world (a motif's place is hashed from its 6-tile cell and the distance field, so it is where it is whatever the camera does) and of the clock (a gentle drift and
// breath on top; under Calm, Off and reduced motion `env.t` is 0 and every motif stands at its resting pose, drawn once with the rest). Docs/ART_DIRECTION.md 5.2 and 5.4. The marks are few and bold: a crest is a
// fat rounded capsule with a soft trough under it (never a line), a curl a scalloped chain of foam discs, a ripple a squashed ring that grows and fades, a sparkle a four-point star; a cell holds a handful of them
// at most, they cluster (ripples near shores and in loose groups, curls along the coast), and no two are alike in size, bow or weight. Sizes have a screen-space minimum so nothing is a dash at any zoom; the
// detail fades in by `env.lod` (crests from the mid band, curls, ripples and sparkles from the near band, a second helping of each from the close band): nothing pops. A motif is never inside a bridge's corridor
// or within two tiles of the coast.

const CELL = 6, HWd = 32, HHd = 16;
const CELLS = new Map();
let BRIDGE_PTS = null;
const bridgeNear = (gx, gy, r) => { if (!BRIDGE_PTS) { BRIDGE_PTS = []; for (const b of LAYOUT.bridges) for (const p of b.pts) BRIDGE_PTS.push(p); } for (const p of BRIDGE_PTS) if (Math.abs(p[0] - gx) < r && Math.abs(p[1] - gy) < r && Math.hypot(p[0] - gx, p[1] - gy) < r) return true; return false; };
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const R2 = Math.SQRT1_2, MAX_LEAN = 0.5934; // 34 degrees
/** A grid direction (ux, uy) turned to lean no more than 34 degrees from the screen's horizontal; answers the grid direction (unit-ish). Pure. */
export function leanClamp(ux, uy) {
  let sx = (ux - uy) * HWd, sy = (ux + uy) * HHd; if (sx < 0) { sx = -sx; sy = -sy; } const a = Math.atan2(sy, sx), c = a > MAX_LEAN ? MAX_LEAN : a < -MAX_LEAN ? -MAX_LEAN : a;
  if (c === a) return [ux, uy]; const wx = Math.cos(c), wy = Math.sin(c), gx = (wx / HWd + wy / HHd) / 2, gy = (wy / HHd - wx / HWd) / 2, l = Math.hypot(gx, gy) || 1; return [gx / l, gy / l];
}
/**
 * The motifs of one 6 x 6 tile cell, flat arrays: crests [gx, gy, ux, uy, size, phase, extra], curls [gx, gy, rot, size, phase, extra], ripples [gx, gy, phase, size, extra], sparkles [gx, gy, phase, size, extra].
 * `(ux, uy)` is the crest's direction in grid units: along the shore near the coast (perpendicular to the distance's gradient), turning to the screen's horizontal (1, -1) a dozen tiles out, bent a little by a hash.
 * `extra` is 1 for the second helping, drawn only as the close band comes in. Hashed from the cell, so the same every time and everywhere.
 */
export function motifCell(ci, cj) {
  const key = ci * 4096 + cj; let c = CELLS.get(key); if (c) return c;
  const coast = coastOf(), crest = [], curl = [], ring = [], glint = [];
  const place = (n, seed, keep, fn) => { for (let i = 0; i < n; i++) { const gx = (ci + h2(ci * 7 + seed, cj * 13 + i * 2 + 1)) * CELL, gy = (cj + h2(ci * 11 + seed + 5, cj * 17 + i * 2)) * CELL, d = coast.dist(gx, gy); if (d < 2.0 || d > 70 || bridgeNear(gx, gy, 3.6)) continue; const hk = h2(ci * 3 + i + seed * 7, cj * 5 + seed); if (hk > keep(d)) continue; fn(gx, gy, d, h2(ci * 3 + i, cj * 5 + seed), i >= (n >> 1) ? 1 : 0, h2(ci * 19 + i, cj * 23 + seed)); } };
  place(4, 1, (d) => 0.44, (gx, gy, d, ph, extra, hh) => { // a crest: along the shore near the coast, along the screen's horizontal out at sea
    const e = 0.5, nx = coast.dist(gx + e, gy) - coast.dist(gx - e, gy), ny = coast.dist(gx, gy + e) - coast.dist(gx, gy - e), l = Math.hypot(nx, ny) || 1, ax = -ny / l, ay = nx / l, w = smoothstep(4, 13, d);
    let ux = ax * (1 - w) + R2 * w, uy = ay * (1 - w) - R2 * w; if (ux * R2 - uy * R2 < 0) { ux = -ux; uy = -uy; } // (the sign is the one that leans right on the screen)
    const bend = (hh - 0.5) * 0.7, cs = Math.cos(bend), sn = Math.sin(bend), vx = ux * cs - uy * sn, vy = ux * sn + uy * cs, vl = Math.hypot(vx, vy) || 1, d2 = leanClamp(vx / vl, vy / vl); // (never steeper than 34 degrees on the screen: a crest lies on the water, it does not stand on it)
    crest.push(gx, gy, d2[0], d2[1], 0.35 + 0.9 * h2(ci * 29 + gx, cj * 31 + gy), ph, extra);
  });
  place(4, 2, (d) => (d < 14 ? 0.62 : 0.14), (gx, gy, d, ph, extra, hh) => curl.push(gx, gy, hh * 6.2832, 0.5 + 0.8 * h2(ci * 3 + gx, cj + gy), ph, extra)); // a foam curl: mostly within fourteen tiles of a shore
  place(2, 3, (d) => (d < 9 ? 0.56 : 0.2), (gx, gy, d, ph, extra, hh) => ring.push(gx, gy, ph, 0.55 + 0.9 * hh, extra)); // a ripple, clustered towards the shores
  place(4, 4, (d) => 0.5, (gx, gy, d, ph, extra, hh) => glint.push(gx, gy, ph, 0.5 + 1.1 * hh * hh, extra)); // a sparkle, sparse and of every size
  c = { crest: Float32Array.from(crest), curl: Float32Array.from(curl), ring: Float32Array.from(ring), glint: Float32Array.from(glint) };
  if (CELLS.size > 4000) CELLS.clear(); CELLS.set(key, c); return c;
}

const cellRange = (view) => {
  let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
  for (const [x, y] of [[view.x0, view.y0], [view.x1, view.y0], [view.x0, view.y1], [view.x1, view.y1]]) { const a = x / 64 + y / 32, b = y / 32 - x / 64; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
  return [Math.floor(a0 / CELL), Math.floor(a1 / CELL), Math.floor(b0 / CELL), Math.floor(b1 / CELL)];
};
const OUT = new Float32Array(2 * (2 * CREST_N)), CH = new Float32Array(3 * 8), SP = new Float32Array(16);
/**
 * Draw the live sea over the ground chunks: crests, foam curls, ripples and sparkles, in world space, under the camera transform the caller has set. `zoom` is the camera's; `t` the visual clock in seconds (0 when
 * motion is off); `lod` the detail alphas. Counts are bounded: about 150 marks at the working zoom, 600 at the mid zoom, 800 close.
 */
export function drawMotifs(ctx, view, zoom, t, lod, tier = 0) {
  const dm = tier >= 2 ? 0 : lod[1], dn = tier >= 1 ? 0 : lod[2], dc = tier >= 1 ? 0 : lod[3]; if (dm < 0.02) return; // the governor's tiers (docs/RENDER_PLAN.md section 5): tier 1 drops the curls, ripples and sparkles, tier 2 the crests too
  const [ci0, ci1, cj0, cj1] = cellRange(view), crestCol = SEA.crest, troughCol = SEA.trough, foamCol = SEA.foam, ringCol = SEA.ring, sparkle = SEA.sparkle, still = t === 0;
  let budget = zoom < 0.7 ? 520 : 900;
  const dgx = still ? 0 : 0.12 * Math.sin(TAU * t / 23), dgy = still ? 0 : 0.12 * Math.cos(TAU * t / 31); // one slow current for the whole sea: at most 0.04 tile a second, the same for every motif
  ctx.save(); ctx.lineJoin = 'round';
  // ---- crests: a soft trough under a pale capsule, along the shore or the screen's horizontal
  for (let cj = cj0; cj <= cj1 && budget > 0; cj++) for (let ci = ci0; ci <= ci1 && budget > 0; ci++) {
    const m = motifCell(ci, cj), cr = m.crest;
    for (let q = 0; q < cr.length; q += 7) {
      const ex = cr[q + 6] ? dc : 1, dd = dm * ex; if (dd < 0.02) continue;
      const ph = cr[q + 5], gx = cr[q] + dgx, gy = cr[q + 1] + dgy, x = (gx - gy) * HWd, y = (gx + gy) * HHd;
      if (x < view.x0 - 80 || x > view.x1 + 80 || y < view.y0 - 40 || y > view.y1 + 40) continue;
      const k = cr[q + 4], ux = cr[q + 2], uy = cr[q + 3], sx = (ux - uy) * HWd, sy = (ux + uy) * HHd, sl = Math.hypot(sx, sy) || 1, wx = sx / sl, wy = sy / sl;
      const half = Math.max(13 + 15 * k, 12 / zoom), thick = Math.max(5 + 4.4 * k, 3.6 / zoom), bow = (ph - 0.5) * 7;
      const a = (still ? 0.5 : 0.42 + 0.08 * Math.sin(TAU * (t / 17 + ph * 1.7))) * dd; if (a < 0.03) continue;
      ctx.fillStyle = troughCol; ctx.globalAlpha = a * 0.3; let n = crestOutline(OUT, x + thick * 0.35, y + thick * 0.95, wx, wy, half * 0.94, thick * 0.9, bow); ctx.beginPath(); ctx.moveTo(OUT[0], OUT[1]); for (let i = 1; i < n; i++) ctx.lineTo(OUT[2 * i], OUT[2 * i + 1]); ctx.closePath(); ctx.fill(); // the trough under it
      ctx.fillStyle = crestCol; ctx.globalAlpha = a * 0.2; n = crestOutline(OUT, x, y, wx, wy, half * 1.12, thick * 1.9, bow); ctx.beginPath(); ctx.moveTo(OUT[0], OUT[1]); for (let i = 1; i < n; i++) ctx.lineTo(OUT[2 * i], OUT[2 * i + 1]); ctx.closePath(); ctx.fill(); // a soft halo
      ctx.globalAlpha = a; n = crestOutline(OUT, x, y, wx, wy, half, thick, bow); ctx.beginPath(); ctx.moveTo(OUT[0], OUT[1]); for (let i = 1; i < n; i++) ctx.lineTo(OUT[2 * i], OUT[2 * i + 1]); ctx.closePath(); ctx.fill();
      budget--;
    }
  }
  if (dn > 0.02) {
    // ---- foam curls: a scalloped chain of discs, white, breathing
    ctx.fillStyle = foamCol;
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
      const m = motifCell(ci, cj), cu = m.curl;
      for (let q = 0; q < cu.length; q += 6) {
        const ex = cu[q + 5] ? dc : 1, dd = dn * ex; if (dd < 0.02) continue;
        const gx = cu[q] + dgx, gy = cu[q + 1] + dgy, x = (gx - gy) * HWd, y = (gx + gy) * HHd; if (x < view.x0 - 40 || x > view.x1 + 40 || y < view.y0 - 40 || y > view.y1 + 40) continue;
        const sz = cu[q + 3], ph = cu[q + 4], a = (still ? 0.72 : 0.34 + 0.4 * (0.5 + 0.5 * Math.sin(TAU * (t / 9 + ph)))) * dd;
        const r = Math.max(2.3 + 1.5 * sz, 2.2 / zoom), R = r * 4.6, nn = foamChain(CH, x, y, cu[q + 2], R, r, 7, 1.9);
        ctx.globalAlpha = a; ctx.beginPath(); for (let i = 0; i < nn; i++) { const cx = CH[3 * i], cy = CH[3 * i + 1], rr = CH[3 * i + 2]; ctx.moveTo(cx + rr, cy); ctx.arc(cx, cy, rr, 0, TAU); } ctx.fill();
      }
    }
    // ---- ripples: two or three squashed rings that grow and fade, strokes never under 1.8 world pixels
    ctx.strokeStyle = ringCol; ctx.lineWidth = Math.max(2, 1.6 / zoom);
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
      const m = motifCell(ci, cj), rg = m.ring;
      for (let q = 0; q < rg.length; q += 5) {
        const ex = rg[q + 4] ? dc : 1, dd = dn * ex; if (dd < 0.02) continue;
        const gx = rg[q] + dgx, gy = rg[q + 1] + dgy, x = (gx - gy) * HWd, y = (gx + gy) * HHd; if (x < view.x0 - 60 || x > view.x1 + 60 || y < view.y0 - 40 || y > view.y1 + 40) continue;
        const R0 = Math.max(16 * rg[q + 3], 9 / zoom);
        for (let k = 0; k < 3; k++) { const rs = ringState(rg[q + 2], t, k); const al = rs.a * 0.6 * dd; if (al < 0.03) continue; ctx.globalAlpha = al; ctx.beginPath(); ctx.ellipse(x, y, R0 * rs.r, R0 * rs.r * 0.5, 0, 0, TAU); ctx.stroke(); }
      }
    }
    // ---- sparkles: four-point stars of every size, twinkling
    ctx.fillStyle = sparkle; let gb = 36;
    for (let cj = cj0; cj <= cj1 && gb > 0; cj++) for (let ci = ci0; ci <= ci1 && gb > 0; ci++) {
      const m = motifCell(ci, cj), gl = m.glint;
      for (let q = 0; q < gl.length; q += 5) {
        const ex = gl[q + 4] ? dc : 1, dd = dn * ex; if (dd < 0.02) continue;
        const gx = gl[q] + dgx, gy = gl[q + 1] + dgy, x = (gx - gy) * HWd, y = (gx + gy) * HHd; if (x < view.x0 - 20 || x > view.x1 + 20 || y < view.y0 - 20 || y > view.y1 + 20) continue;
        const ph = gl[q + 2], tw = still ? 0.55 + 0.35 * ph : Math.max(0, Math.sin(TAU * (t / (2.4 + ph * 1.6) + ph * 3))), a = tw * tw * dd; if (a < 0.08) continue;
        const r = Math.max(3 * gl[q + 3], 3 / zoom) * (0.75 + 0.45 * tw); sparkle4(ctx, x, y, r, 0.2 + 0.12 * ph, a); gb--;
      }
    }
  }
  ctx.restore();
}
function sparkle4(ctx, x, y, r, slim, a) { const n = sparkle(SP, x, y, r, slim); ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(SP[0], SP[1]); for (let i = 1; i < n; i++) ctx.lineTo(SP[2 * i], SP[2 * i + 1]); ctx.closePath(); ctx.fill(); }

// ---------------------------------------------------------------- the swash: the water breathing on the beaches
const BEACH = new WeakMap();
/** For one ring of the coast: for each point, is the ground there a beach (under 2.5 pixels high)? A cliff has no swash: the sea does not run up a wall. */
function beachFlags(ring) { let f = BEACH.get(ring); if (!f) { const n = ring.length / 2; f = new Uint8Array(n); for (let i = 0; i < n; i++) f[i] = zAt(ring[2 * i], ring[2 * i + 1]) < 2.5 ? 1 : 0; BEACH.set(ring, f); } return f; }
const RUNS = new WeakMap();
/**
 * The beaches of one ring as runs: { i0, i1, grid: Float32Array of the points (gx, gy), nrm: the sea-side unit normals (gx, gy), arc: the arc length of each point from the ring's start (tiles), bb: its world box }.
 * A run is a stretch of consecutive beach points; one that wraps round the ring's start is joined, and a run of fewer than six points is dropped. Made once per ring.
 */
export function beachRuns(ring) {
  let runs = RUNS.get(ring); if (runs) return runs; runs = [];
  const n = ring.length / 2, fl = beachFlags(ring), arcs = new Float32Array(n); let u = 0; for (let i = 0; i < n; i++) { arcs[i] = u; u += Math.hypot(ring[2 * ((i + 1) % n)] - ring[2 * i], ring[2 * ((i + 1) % n) + 1] - ring[2 * i + 1]); }
  let start = 0; while (start < n && fl[start]) start++; if (start === n) start = 0; // begin at a point that is not a beach, so no run wraps (a ring of all beach is one run from 0)
  for (let k = 0; k < n;) {
    const i = (start + k) % n; if (!fl[i]) { k++; continue; }
    let len = 0; while (k + len < n && fl[(start + k + len) % n]) len++;
    if (len >= 6) {
      const grid = new Float32Array(len * 2), nrm = new Float32Array(len * 2), arc = new Float32Array(len); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let q = 0; q < len; q++) {
        const j = (start + k + q) % n, jp = (j + n - 1) % n, jn = (j + 1) % n, tx = ring[2 * jn] - ring[2 * jp], ty = ring[2 * jn + 1] - ring[2 * jp + 1], tl = Math.hypot(tx, ty) || 1;
        grid[2 * q] = ring[2 * j]; grid[2 * q + 1] = ring[2 * j + 1]; nrm[2 * q] = ty / tl; nrm[2 * q + 1] = -tx / tl; arc[q] = arcs[j];
        const wx = (grid[2 * q] - grid[2 * q + 1]) * HWd, wy = (grid[2 * q] + grid[2 * q + 1]) * HHd; x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); y0 = Math.min(y0, wy); y1 = Math.max(y1, wy);
      }
      runs.push({ n: len, grid, nrm, arc, bb: [x0 - 40, y0 - 40, x1 + 40, y1 + 40] });
    }
    k += len;
  }
  RUNS.set(ring, runs); return runs;
}
const RIB = new Float32Array(2 * 4096), RIBW = new Float32Array(2 * 4096);
/** The breath of the swash at a point of the coast `arc` tiles along it, 0..1: a period of 6.5 seconds whose phase runs along the beach (0.12 of a cycle a tile). */
export const breathAt = (t, arc) => 0.5 + 0.5 * Math.sin(TAU * (t / 6.5 + arc * 0.12));
/**
 * Along every beach in view, a film of foam that advances and retreats over 6.5 seconds, its phase running along the coast (0.12 of a cycle a tile) so the swash travels down the beach: a wide soft ribbon of
 * shoal colour under a narrower white one, each ONE filled polygon along the whole run (the coast's own points and the same points pushed out to sea by the width), the width a smooth function of the arc, the ends
 * tapering to nothing, so there is no seam, no butt end and no step anywhere along it. The baked ground holds the foam line at mid swash, which is the whole picture at rest; this is only drawn while motion is
 * on, and not at all at tier 3 and over.
 */
export function drawSwash(ctx, view, zoom, t, tier = 0) {
  if (!t || tier >= 3 || zoom < 0.45) return;
  ctx.save();
  for (const ring of coastOf().rings) for (const run of beachRuns(ring)) {
    const bb = run.bb; if (!(bb[2] > view.x0 && bb[0] < view.x1 && bb[3] > view.y0 && bb[1] < view.y1)) continue;
    const n = Math.min(run.n, 4096), g = run.grid, nm = run.nrm, a0 = run.arc[0], aN = run.arc[n - 1];
    for (let pass = 0; pass < 2; pass++) {
      const base = pass ? 0.06 : 0.16, amp = pass ? 0.08 : 0.15; let k = 0;
      for (let i = 0; i < n; i++) { const s = run.arc[i] - a0, e = Math.min(1, Math.min(s, aN - run.arc[i]) / 0.8), breath = breathAt(t, run.arc[i]), w = (base + amp * breath) * e * e * (3 - 2 * e); RIBW[i] = w; }
      for (let i = 0; i < n; i++) { RIB[k++] = (g[2 * i] - g[2 * i + 1]) * HWd; RIB[k++] = (g[2 * i] + g[2 * i + 1]) * HHd; }
      for (let i = n - 1; i >= 0; i--) { const gx = g[2 * i] + nm[2 * i] * RIBW[i], gy = g[2 * i + 1] + nm[2 * i + 1] * RIBW[i]; RIB[k++] = (gx - gy) * HWd; RIB[k++] = (gx + gy) * HHd; }
      ctx.beginPath(); ctx.moveTo(RIB[0], RIB[1]); for (let i = 1; i < 2 * n; i++) ctx.lineTo(RIB[2 * i], RIB[2 * i + 1]); ctx.closePath();
      ctx.fillStyle = pass ? SEA.foam : SEA.shoal; ctx.globalAlpha = pass ? 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(TAU * t / 6.5)) : 0.2 + 0.14 * (0.5 + 0.5 * Math.sin(TAU * t / 6.5)); ctx.fill();
    }
  }
  ctx.restore();
}

/** The moving decals of the districts in view: soft round pulses on the circuit ground and light on the harbor's basin (crests and a glint, with the sea's own shapes). */
function liveDecals(ctx, view, env, w) {
  const t = env.t / 1000, still = t === 0, zoom = w.cam.z;
  for (const id of LAYOUT.ids) {
    const D = DIST[id], b = D.bb; if (!(b[2] > view.x0 && b[0] < view.x1 && b[3] + 200 > view.y0 && b[1] < view.y1 + 200)) continue;
    let live = w.decals.get(id); if (!live) w.decals.set(id, (live = D.decals.filter((d) => d.k === 'water' || d.k === 'pulse')));
    for (const d of live) {
      if (zoom < (d.min ?? 0.3)) continue; const z = D.z, k = w.unlocked && !w.unlocked.has(id) ? 1 : 0;
      if (d.k === 'pulse') { ctx.fillStyle = tone(d.col, k); for (let i = 0; i < 7; i++) { const gx = d.x + h2(7, i) * d.w, gy = d.y + h2(8, i) * d.d; ctx.globalAlpha = still ? 0.5 : 0.2 + 0.4 * (0.5 + 0.5 * Math.sin(TAU * (t / 5 + h2(9, i)))); ctx.beginPath(); ctx.ellipse((gx - gy) * HWd, (gx + gy) * HHd - z, 5, 2.6, 0, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; }
      else { // the basin: a few crests lying along its length and a glint, from the sea's own shapes
        ctx.fillStyle = SEA.crest; for (let i = 0; i < 4; i++) { const gx = d.x + 1 + h2(21, i) * (d.w - 2), gy = d.y + 1 + h2(22, i) * (d.d - 2), x = (gx - gy) * HWd, y = (gx + gy) * HHd - z, a = (still ? 0.55 : 0.2 + 0.4 * (0.5 + 0.5 * Math.sin(TAU * (t / 6 + h2(23, i))))) * (k ? 0.5 : 1); ctx.globalAlpha = a; const n = crestOutline(OUT, x, y, 0.894, 0.447, 11 + 4 * h2(24, i), 4.6, (h2(25, i) - 0.5) * 6); ctx.beginPath(); ctx.moveTo(OUT[0], OUT[1]); for (let q = 1; q < n; q++) ctx.lineTo(OUT[2 * q], OUT[2 * q + 1]); ctx.closePath(); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
    }
  }
}
/** `livedecals` (V2): everything on the ground that moves or fades, drawn over the chunks: the sea's motifs and the districts' own moving decals. */
function drawLive(ctx, view, env, w) {
  if (!env.far && env.lod.detail[1] >= 0.02) { drawSwash(ctx, view, w.cam.z, env.t / 1000, w.slow | 0); drawMotifs(ctx, view, w.cam.z, env.t / 1000, env.lod.detail, w.slow | 0); }
  liveDecals(ctx, view, env, w);
}
registerLayer('livedecals', drawLive, 'inherit');
