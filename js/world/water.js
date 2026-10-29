// The sea, V2: a world-space surface. The depth, foam, glow and shadow of the water are baked into the ground chunks with the land (rasterbase.js: one picture, anchored to the world, with no seam where
// the sea meets the coast); this module is the layer under them and, below, the live motion on top. Docs/ART_DIRECTION.md 5.1 to 5.3 and 5.10.
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md).
import { registerLayer } from './stack.js';
import { mix, h2 } from './iso.js';
import { SEA } from './palette.js';
import { LAYOUT, DIST, zAt } from './layout.js';
import { coastOf } from './scene.js';
import { tone } from './decalart.js';

const FILL = mix(SEA.sea, SEA.deep, 0.5);
/** `sea` (world space): fill the view with the open sea's colour, so that whatever a chunk has not painted yet (a chunk being baked) is sea and never a hole. The depth is in the chunks. */
function drawSea(ctx, view) { ctx.fillStyle = FILL; ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0); }
registerLayer('sea', drawSea, 'world');

// ---------------------------------------------------------------- the live sea: crests, curls, glints and the swash on the beaches
// Everything here is a function of the world (a motif's place is hashed from its 6-tile cell and the distance field, so it is where it is whatever the camera does) and of the clock (a gentle drift and
// breath on top; under Calm, Off and reduced motion `env.t` is 0 and every motif stands at its resting pose, drawn once with the rest). Docs/ART_DIRECTION.md 5.2 and 5.4.
// Sizes have a screen-space minimum (a crest at least 14 x 3 screen pixels, a curl 8 across, a glint 3) so nothing is a dash at any zoom; the detail fades in by `env.lod` (crests from the mid band, curls
// and glints from the near band): nothing pops. A motif is never inside a bridge's corridor or within a tile and a half of the coast.

const CELL = 6, HWd = 32, HHd = 16, TAU = 6.2832;
const CELLS = new Map();
let BRIDGE_PTS = null;
const bridgeNear = (gx, gy, r) => { if (!BRIDGE_PTS) { BRIDGE_PTS = []; for (const b of LAYOUT.bridges) for (const p of b.pts) BRIDGE_PTS.push(p); } for (const p of BRIDGE_PTS) if (Math.abs(p[0] - gx) < r && Math.abs(p[1] - gy) < r && Math.hypot(p[0] - gx, p[1] - gy) < r) return true; return false; };
/** The motifs of one 6 x 6 tile cell: crests [gx, gy, tx, ty, d, phase], curls [gx, gy, phase], glints [gx, gy, phase], flat arrays. Hashed from the cell, so they are the same every time and everywhere. */
export function motifCell(ci, cj) {
  const key = ci * 4096 + cj; let c = CELLS.get(key); if (c) return c;
  const coast = coastOf(), crest = [], curl = [], glint = [];
  const place = (n, seed, fn) => { for (let i = 0; i < n; i++) { const gx = (ci + h2(ci * 7 + seed, cj * 13 + i * 2 + 1)) * CELL, gy = (cj + h2(ci * 11 + seed + 5, cj * 17 + i * 2)) * CELL, d = coast.dist(gx, gy); if (d < 1.6 || d > 60 || bridgeNear(gx, gy, 3.6)) continue; fn(gx, gy, d, h2(ci * 3 + i, cj * 5 + seed)); } };
  place(2, 1, (gx, gy, d, ph) => { // a crest runs along the shore: perpendicular to the gradient of the distance
    const e = 0.5, nx = coast.dist(gx + e, gy) - coast.dist(gx - e, gy), ny = coast.dist(gx, gy + e) - coast.dist(gx, gy - e), l = Math.hypot(nx, ny) || 1;
    crest.push(gx, gy, -ny / l, nx / l, d, ph);
  });
  place(2, 2, (gx, gy, d, ph) => { if (d < 12 && h2(ci + gx * 3, cj + gy * 5) < 0.55) curl.push(gx, gy, ph); });
  place(2, 3, (gx, gy, d, ph) => { glint.push(gx, gy, ph); });
  c = { crest: Float32Array.from(crest), curl: Float32Array.from(curl), glint: Float32Array.from(glint) };
  if (CELLS.size > 4000) CELLS.clear(); CELLS.set(key, c); return c;
}

const cellRange = (view) => {
  let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
  for (const [x, y] of [[view.x0, view.y0], [view.x1, view.y0], [view.x0, view.y1], [view.x1, view.y1]]) { const a = x / 64 + y / 32, b = y / 32 - x / 64; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
  return [Math.floor(a0 / CELL), Math.floor(a1 / CELL), Math.floor(b0 / CELL), Math.floor(b1 / CELL)];
};
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/**
 * Draw the live sea over the ground chunks: crests (soft lens highlights lying along the shore), foam curls and four-point glints, in world space, under the camera transform the caller has set.
 * `zoom` is the camera's; `t` the visual clock in seconds (0 when motion is off); `lod` the detail alphas. Counts are bounded: about 600 motifs at the mid zoom, 1,100 near.
 */
export function drawMotifs(ctx, view, zoom, t, lod, tier = 0) {
  const dm = tier >= 2 ? 0 : lod[1], dn = tier >= 1 ? 0 : lod[2]; if (dm < 0.02) return; // the governor's tiers (docs/RENDER_PLAN.md section 5): tier 1 drops the curls and glints, tier 2 the crests too
  const [ci0, ci1, cj0, cj1] = cellRange(view), crestCol = SEA.crest, foamCol = SEA.foam, sparkle = SEA.sparkle, still = t === 0;
  let budget = zoom < 0.7 ? 600 : 1100;
  const dgx = still ? 0 : 0.12 * Math.sin(TAU * t / 23), dgy = still ? 0 : 0.12 * Math.cos(TAU * t / 31); // one slow current for the whole sea: at most 0.04 tile a second, the same for every motif
  ctx.save(); ctx.fillStyle = crestCol; ctx.lineCap = 'round';
  for (let cj = cj0; cj <= cj1 && budget > 0; cj++) for (let ci = ci0; ci <= ci1 && budget > 0; ci++) {
    const m = motifCell(ci, cj), cr = m.crest;
    for (let q = 0; q < cr.length; q += 6) {
      const ph = cr[q + 5], gx = cr[q] + dgx, gy = cr[q + 1] + dgy, x = (gx - gy) * HWd, y = (gx + gy) * HHd;
      if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue;
      const d = cr[q + 4], L = Math.max(15 + Math.min(d, 14) * 0.9, 14 / zoom) * 0.5, Tc = Math.max(5, 3.5 / zoom), sx = (cr[q + 2] - cr[q + 3]) * HWd, sy = (cr[q + 2] + cr[q + 3]) * HHd, sl = Math.hypot(sx, sy) || 1, ux = sx / sl, uy = sy / sl;
      const a = (still ? 0.52 : 0.44 + 0.08 * Math.sin(TAU * (t / 17 + ph * 1.7))) * dm; // a slow breath: the crest is there, brightening and softening a little if (a < 0.03) continue;
      for (let pass = 0; pass < 2; pass++) { // a soft wide glow under a crisper highlight: a crest, not a dash
        const th = pass ? Tc : Tc * 2.2, ll = pass ? L : L * 1.18; ctx.globalAlpha = pass ? a : a * 0.22;
        ctx.beginPath(); ctx.moveTo(x - ux * ll, y - uy * ll); ctx.quadraticCurveTo(x - uy * th, y + ux * th, x + ux * ll, y + uy * ll); ctx.quadraticCurveTo(x + uy * th, y - ux * th, x - ux * ll, y - uy * ll); ctx.fill();
      }
      budget--;
    }
  }
  if (dn > 0.02) {
    ctx.strokeStyle = foamCol; ctx.fillStyle = foamCol; ctx.lineWidth = Math.max(2.2, 2.2 / zoom);
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
      const m = motifCell(ci, cj), cu = m.curl;
      for (let q = 0; q < cu.length; q += 3) {
        const gx = cu[q] + dgx, gy = cu[q + 1] + dgy, x = (gx - gy) * HWd, y = (gx + gy) * HHd; if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue;
        const r = Math.max(4.5, 4.5 / zoom), ph = cu[q + 2], a = (still ? 0.8 : 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(TAU * (t / 9 + ph)))) * dn, rot = ph * TAU;
        ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(x, y, r, rot, rot + 4.7); ctx.stroke(); ctx.beginPath(); ctx.arc(x + Math.cos(rot + 4.7) * r, y + Math.sin(rot + 4.7) * r * 0.9, ctx.lineWidth * 0.8, 0, TAU); ctx.fill();
      }
    }
    ctx.fillStyle = sparkle; let gb = 40;
    for (let cj = cj0; cj <= cj1 && gb > 0; cj++) for (let ci = ci0; ci <= ci1 && gb > 0; ci++) {
      const m = motifCell(ci, cj), gl = m.glint;
      for (let q = 0; q < gl.length; q += 3) {
        const gx = gl[q] + dgx, gy = gl[q + 1] + dgy, x = (gx - gy) * HWd, y = (gx + gy) * HHd; if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue;
        const ph = gl[q + 2], tw = still ? 0.55 : Math.max(0, Math.sin(TAU * (t / (2.4 + ph * 1.6) + ph * 3))), a = tw * tw * dn; if (a < 0.08) continue;
        const r = Math.max(3.5, 3.5 / zoom) * (0.7 + 0.5 * tw); ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.28, y - r * 0.28); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.28, y + r * 0.28); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.28, y + r * 0.28); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.28, y - r * 0.28); ctx.closePath(); ctx.fill(); gb--;
      }
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- the swash: the water breathing on the beaches
const BEACH = new WeakMap();
/** For one ring of the coast: for each point, is the ground there a beach (under 2.5 pixels high)? A cliff has no swash: the sea does not run up a wall. */
function beachFlags(ring) { let f = BEACH.get(ring); if (!f) { const n = ring.length / 2; f = new Uint8Array(n); for (let i = 0; i < n; i++) f[i] = zAt(ring[2 * i], ring[2 * i + 1]) < 2.5 ? 1 : 0; BEACH.set(ring, f); } return f; }
const RING_DATA = new WeakMap();
/** One ring of the coast as screen-space arrays: the point (x, y), the unit normal (nx, ny), the arc length in tiles (arc) and the beach flags, made once. */
function ringData(ring) {
  let d = RING_DATA.get(ring); if (d) return d;
  const n = ring.length / 2, x = new Float32Array(n), y = new Float32Array(n), nx = new Float32Array(n), ny = new Float32Array(n), arc = new Float32Array(n);
  for (let i = 0; i < n; i++) { x[i] = (ring[2 * i] - ring[2 * i + 1]) * HWd; y[i] = (ring[2 * i] + ring[2 * i + 1]) * HHd; if (i) arc[i] = arc[i - 1] + Math.hypot(ring[2 * i] - ring[2 * i - 2], ring[2 * i + 1] - ring[2 * i - 1]); }
  for (let i = 0; i < n; i++) { const a = (i + n - 1) % n, b = (i + 1) % n, tx = x[b] - x[a], ty = y[b] - y[a], l = Math.hypot(tx, ty) || 1; nx[i] = -ty / l; ny[i] = tx / l; }
  d = { n, x, y, nx, ny, arc, fl: beachFlags(ring) }; RING_DATA.set(ring, d); return d;
}
/** The breath of the swash at a point of the coast `arc` tiles along it, 0..1: a period of 6.5 seconds whose phase runs along the beach (0.12 of a cycle a tile). */
export const breathAt = (t, arc) => 0.5 + 0.5 * Math.sin(TAU * (t / 6.5 + arc * 0.12));
/** The width, in world pixels, of a swash band at a point: `base` plus `amp` times the breath, never under 1.5 (nothing is a hairline), and tapering to a point over the first and last `TAPER` points of a run. */
export const swashWidth = (base, amp, breath, k, run) => Math.max(1.5, base + amp * breath) * Math.min(1, (k + 1) / TAPER, (run - k) / TAPER);
const TAPER = 5, MAXRUN = 70, SWASH_WIDE = mix(SEA.shoal, SEA.foam, 0.5);
/**
 * Along every beach in view, a film of foam that advances and retreats over 6.5 seconds, its phase running along the coast so the swash travels down the beach: a wide soft band of shoal colour under a
 * narrower white one. Each band is ONE filled outline per stretch of beach, its width following the breath at every point of the coast (the first version stroked a stretch of 0.7 tile at a time with its
 * own width and opacity, and every joint between two stretches showed as a step along the sand). The baked ground holds the foam line at mid swash, which is the whole picture at rest; this is only drawn
 * while motion is on, and not at all at tier 3 and over. Widths are never under 1.5 world pixels.
 */
export function drawSwash(ctx, view, zoom, t, tier = 0) {
  if (!t || tier >= 3 || zoom < 0.45) return;
  const rings = coastOf().rings; ctx.save();
  const band = (d, a, b, base, amp, col, alpha, ph) => {
    const run = b - a + 1; ctx.beginPath();
    for (let i = a; i <= b; i++) { const w = swashWidth(base, amp, breathAt(t, d.arc[i] + ph), i - a, run) / 2; (i === a ? ctx.moveTo : ctx.lineTo).call(ctx, d.x[i] + d.nx[i] * w, d.y[i] + d.ny[i] * w); }
    for (let i = b; i >= a; i--) { const w = swashWidth(base, amp, breathAt(t, d.arc[i] + ph), i - a, run) / 2; ctx.lineTo(d.x[i] - d.nx[i] * w, d.y[i] - d.ny[i] * w); }
    ctx.closePath(); ctx.globalAlpha = alpha; ctx.fillStyle = col; ctx.fill();
  };
  let ri = 0;
  for (const ring of rings) {
    const d = ringData(ring), n = d.n, ph = (ri++) * 0.37; let i = 0;
    while (i < n) {
      if (!d.fl[i] || d.x[i] < view.x0 - 90 || d.x[i] > view.x1 + 90 || d.y[i] < view.y0 - 90 || d.y[i] > view.y1 + 90) { i++; continue; }
      let j = i; while (j + 1 < n && j - i < MAXRUN && d.fl[j + 1] && d.x[j + 1] > view.x0 - 90 && d.x[j + 1] < view.x1 + 90 && d.y[j + 1] > view.y0 - 90 && d.y[j + 1] < view.y1 + 90) j++;
      if (j > i) { band(d, i, j, 7, 8, SWASH_WIDE, 0.26, ph); band(d, i, j, 2.2, 3, SEA.foam, 0.52, ph); }
      i = j + 1 < n && j - i >= MAXRUN ? j : j + 1; // a run cut at MAXRUN goes on from its last point, so the two outlines share it
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
        ctx.fillStyle = SEA.crest; for (let i = 0; i < 5; i++) { const gx = d.x + 1 + h2(21, i) * (d.w - 2), gy = d.y + 1 + h2(22, i) * (d.d - 2), x = (gx - gy) * HWd, y = (gx + gy) * HHd - z, L = 9, T = 1.5, a = (still ? 0.55 : 0.2 + 0.4 * (0.5 + 0.5 * Math.sin(TAU * (t / 6 + h2(23, i))))) * (k ? 0.5 : 1); ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(x - L, y - L * 0.5); ctx.quadraticCurveTo(x, y - T * 2, x + L, y + L * 0.5); ctx.quadraticCurveTo(x, y + T * 2, x - L, y - L * 0.5); ctx.fill(); }
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
