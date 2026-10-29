// The sea, V2: a world-space surface. The depth, foam, glow and shadow of the water are baked into the ground chunks with the land (rasterbase.js: one picture, anchored to the world, with no seam where
// the sea meets the coast); this module is the layer under them and, below, the live motion on top. Docs/ART_DIRECTION.md 5.1 to 5.3 and 5.10.
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md).
import { registerLayer } from './stack.js';
import { mix, h2 } from './iso.js';
import { SEA } from './palette.js';
import { LAYOUT, DIST, zAt } from './layout.js';
import { coastOf } from './scene.js';
import { tone } from './decalart.js';
import { stampSoft } from './shadow.js';
import { hz } from './noise.js';

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
export { hz };
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/**
 * The way a crest lies, as a unit grid vector, for a point `d` tiles from the coast with the distance's gradient (nx, ny): along the shore close in (the water bends round the island), turning to the wind's direction
 * (horizontal on the screen, grid (1, -1)) beyond 10 tiles and wholly by 26, then a hashed lean of up to 0.4 radian either way (`j`, -1..1), so a stretch of open water is never a field of parallel contour lines.
 */
export function crestDir(d, nx, ny, j, out = [0, 0]) {
  const l = Math.hypot(nx, ny) || 1, sx0 = -ny / l, sy0 = nx / l, w = sstep(10, 26, d), wx = Math.SQRT1_2, wy = -Math.SQRT1_2, sg = sx0 * wx + sy0 * wy < 0 ? -1 : 1; // (the shore's tangent has two senses: the one nearer the wind's)
  let tx = sx0 * sg * (1 - w) + wx * w, ty = sy0 * sg * (1 - w) + wy * w; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
  const a = j * 0.4, c = Math.cos(a), s = Math.sin(a); out[0] = tx * c - ty * s; out[1] = tx * s + ty * c; return out;
}
/**
 * The motifs of one 6 x 6 tile cell: crests [gx, gy, tx, ty, d, phase], curls [gx, gy, phase], glints [gx, gy, phase] and the fine marks of the closest zoom [gx, gy, phase, kind] (0 a ripple ring, 1 a fleck of foam,
 * 2 a soft caustic), flat arrays. Hashed from the cell with a mixing hash, each in a slot of its own (two crests on either half of the cell, so none lands on another and none on a lattice), so they are the same every time and everywhere.
 */
export function motifCell(ci, cj) {
  const key = ci * 4096 + cj; let c = CELLS.get(key); if (c) return c;
  const coast = coastOf(), crest = [], curl = [], glint = [], fine = [], dir = [0, 0];
  const at = (u, v) => [(ci + u) * CELL, (cj + v) * CELL];
  for (let i = 0; i < 2; i++) { // a crest in each half of the cell
    const [gx, gy] = at((i + 0.1 + 0.8 * hz(ci, cj, 11 + i)) / 2, 0.1 + 0.8 * hz(ci, cj, 21 + i)), d = coast.dist(gx, gy); if (d < 1.6 || d > 60 || bridgeNear(gx, gy, 3.6)) continue;
    const e = 0.5, nx = coast.dist(gx + e, gy) - coast.dist(gx - e, gy), ny = coast.dist(gx, gy + e) - coast.dist(gx, gy - e);
    crestDir(d, nx, ny, hz(ci, cj, 31 + i) * 2 - 1, dir); crest.push(gx, gy, dir[0], dir[1], d, hz(ci, cj, 41 + i));
  }
  { const [gx, gy] = at(hz(ci, cj, 51), hz(ci, cj, 52)), d = coast.dist(gx, gy); if (d >= 1.6 && d < 12 && hz(ci, cj, 53) < 0.6 && !bridgeNear(gx, gy, 3.6)) curl.push(gx, gy, hz(ci, cj, 54)); }
  for (let i = 0; i < 2; i++) { const [gx, gy] = at(hz(ci, cj, 61 + i), hz(ci, cj, 71 + i)), d = coast.dist(gx, gy); if (d >= 1.6 && d <= 60 && !bridgeNear(gx, gy, 3.6)) glint.push(gx, gy, hz(ci, cj, 81 + i)); }
  for (let i = 0; i < 4; i++) { const [gx, gy] = at(hz(ci, cj, 91 + i), hz(ci, cj, 101 + i)), d = coast.dist(gx, gy); if (d >= 1.8 && d <= 60 && !bridgeNear(gx, gy, 3.6)) fine.push(gx, gy, hz(ci, cj, 111 + i), i === 0 ? 2 : i === 1 ? 0 : 1); }
  c = { crest: Float32Array.from(crest), curl: Float32Array.from(curl), glint: Float32Array.from(glint), fine: Float32Array.from(fine) };
  if (CELLS.size > 4000) CELLS.clear(); CELLS.set(key, c); return c;
}

const cellRange = (view) => {
  let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
  for (const [x, y] of [[view.x0, view.y0], [view.x1, view.y0], [view.x0, view.y1], [view.x1, view.y1]]) { const a = x / 64 + y / 32, b = y / 32 - x / 64; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
  return [Math.floor(a0 / CELL), Math.floor(a1 / CELL), Math.floor(b0 / CELL), Math.floor(b1 / CELL)];
};
const smoothstep = (a, b, x) => sstep(a, b, x);
/** A tapered crescent from (ax, ay) to (bx, by): the outer edge bows by `bo` along the normal (nx, ny), the inner by `bi` (a smaller bow of the same side), so it is a curved swoosh that comes to a point at both ends. One moveTo and two quadratic curves. */
function swoosh(ctx, ax, ay, bx, by, nx, ny, bo, bi) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx + nx * bo, my + ny * bo, bx, by); ctx.quadraticCurveTo(mx + nx * bi, my + ny * bi, ax, ay);
}
/**
 * Draw the live sea over the ground chunks, in world space under the camera transform the caller has set: CRESTS (a long tapered swoosh with two shorter ones trailing beside it, white, the sea's cartoon wave), WAKES (a
 * foam head with a tapered tail), four-point GLINTS and, at the closest zoom, RIPPLE RINGS, flecks of foam and soft caustics. Every motif is hashed from its cell and so stands at one place in the world whatever the camera
 * does; the one current of the sea drifts them all together a little. `zoom` is the camera's; `t` the visual clock in seconds (0 when motion is off); `lod` the detail alphas. Sizes keep a screen-space minimum (a crest at least
 * 14 screen pixels long, a wake 8 across, a glint 3). Crests are batched a cell at a time (one fill for the glows, one for the strokes), so a window's worth is a few hundred fills.
 */
export function drawMotifs(ctx, view, zoom, t, lod, tier = 0) {
  const dm = tier >= 2 ? 0 : lod[1], dn = tier >= 1 ? 0 : lod[2], dc = tier >= 1 ? 0 : (lod[3] ?? 0); if (dm < 0.02) return; // the governor's tiers (docs/RENDER_PLAN.md section 5): tier 1 drops the wakes, glints and fine marks, tier 2 the crests too
  const [ci0, ci1, cj0, cj1] = cellRange(view), crestCol = SEA.crest, foamCol = SEA.foam, sparkle = SEA.sparkle, still = t === 0;
  let budget = zoom < 0.7 ? 420 : 760;
  const dgx = still ? 0 : 0.12 * Math.sin(TAU * t / 23), dgy = still ? 0 : 0.12 * Math.cos(TAU * t / 31); // one slow current for the whole sea: at most 0.04 tile a second, the same for every motif
  ctx.save(); ctx.fillStyle = crestCol; ctx.lineCap = 'round';
  for (let cj = cj0; cj <= cj1 && budget > 0; cj++) for (let ci = ci0; ci <= ci1 && budget > 0; ci++) {
    const m = motifCell(ci, cj), cr = m.crest; if (!cr.length) continue;
    const a = (still ? 0.5 : 0.42 + 0.08 * Math.sin(TAU * (t / 17 + hz(ci, cj, 5) * 1.7))) * dm; // a slow breath, a cell at a time
    if (a < 0.03) continue;
    for (let pass = 0; pass < 2; pass++) { // a soft wide glow under the crisper strokes: a crest, not a dash
      ctx.globalAlpha = pass ? a : a * 0.2; ctx.beginPath(); let any = false;
      for (let q = 0; q < cr.length; q += 6) {
        const ph = cr[q + 5], gx = cr[q] + dgx, gy = cr[q + 1] + dgy, x = (gx - gy) * HWd, y = (gx + gy) * HHd;
        if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue;
        const d = cr[q + 4], sc = 0.7 + 0.75 * ((ph * 7.13) % 1), L = Math.max((15 + Math.min(d, 14) * 0.9) * sc * 0.5, 14 / zoom * 0.5), Tc = Math.max(4.5 * (0.8 + 0.4 * sc), 3.2 / zoom);
        const sx0 = (cr[q + 2] - cr[q + 3]) * HWd, sy0 = (cr[q + 2] + cr[q + 3]) * HHd, sl = Math.hypot(sx0, sy0) || 1, ux = sx0 / sl, uy = sy0 / sl, nx = -uy, ny = ux; // (the crest's direction on the screen, and its normal)
        const gw = pass ? 1 : 1.9, ll = L * (pass ? 1 : 1.16);
        swoosh(ctx, x - ux * ll, y - uy * ll, x + ux * ll, y + uy * ll, nx, ny, Tc * 2.2 * gw, Tc * 0.5 * gw); // the long main crest
        if (pass) { // two shorter ones trailing it, each a little behind and further along, like the marks of a cartoon sea
          const o = Tc * 3.4, sh = L * 0.36; swoosh(ctx, x - ux * (L * 0.62) + ux * sh - nx * o, y - uy * (L * 0.62) + uy * sh - ny * o, x + ux * (L * 0.22) + ux * sh - nx * o, y + uy * (L * 0.22) + uy * sh - ny * o, nx, ny, Tc * 1.5, Tc * 0.3);
          const o2 = Tc * 6.2, sh2 = -L * 0.3; swoosh(ctx, x - ux * (L * 0.34) + ux * sh2 - nx * o2, y - uy * (L * 0.34) + uy * sh2 - ny * o2, x + ux * (L * 0.5) + ux * sh2 - nx * o2, y + uy * (L * 0.5) + uy * sh2 - ny * o2, nx, ny, Tc * 1.1, Tc * 0.2);
        }
        any = true; if (!pass) budget--;
      }
      if (any) ctx.fill();
    }
  }
  if (dn > 0.02) {
    ctx.fillStyle = foamCol;
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) { // wakes: a round foam head and a tapered tail trailing behind it along a lean of its own
      const m = motifCell(ci, cj), cu = m.curl; if (!cu.length) continue;
      for (let q = 0; q < cu.length; q += 3) {
        const gx = cu[q] + dgx, gy = cu[q + 1] + dgy, x = (gx - gy) * HWd, y = (gx + gy) * HHd; if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue;
        const ph = cu[q + 2], r = Math.max(2.8, 2.8 / zoom) * (0.8 + 0.5 * ph), a = (still ? 0.78 : 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(TAU * (t / 9 + ph)))) * dn, ang = (ph * 2 - 1) * 0.5 + Math.PI, ux = Math.cos(ang), uy = Math.sin(ang) * 0.5, ul = Math.hypot(ux, uy) || 1, tx = ux / ul, ty = uy / ul, nx = -ty, ny = tx;
        ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); ctx.fill(); // the head
        ctx.globalAlpha = a * 0.8; ctx.beginPath(); swoosh(ctx, x + tx * r * 0.4, y + ty * r * 0.4, x + tx * r * 7.5, y + ty * r * 7.5, nx, ny, r * 1.9, r * 0.2); ctx.fill(); // the tail: a swoosh of the wake that comes to a point
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
  if (dc > 0.02) fineMarks(ctx, view, zoom, t, dc, ci0, ci1, cj0, cj1, dgx, dgy);
  ctx.restore();
}
/** The finest zoom's marks, from the close band's alpha `dc`: soft caustic blobs of light on the water, ripple rings (a whole ellipse breathing outwards and fading, never a gapped ring) and small flecks of foam. At most 160 a frame. */
function fineMarks(ctx, view, zoom, t, dc, ci0, ci1, cj0, cj1, dgx, dgy) {
  const still = t === 0; let nb = 160;
  for (let cj = cj0; cj <= cj1 && nb > 0; cj++) for (let ci = ci0; ci <= ci1 && nb > 0; ci++) {
    const f = motifCell(ci, cj).fine;
    for (let q = 0; q < f.length; q += 4) {
      const gx = f[q] + dgx, gy = f[q + 1] + dgy, x = (gx - gy) * HWd, y = (gx + gy) * HHd; if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue;
      const ph = f[q + 2], kind = f[q + 3]; nb--;
      if (kind === 2) { const r = 24 + 26 * ph, a = (still ? 0.1 : 0.06 + 0.06 * (0.5 + 0.5 * Math.sin(TAU * (t / 7 + ph)))) * dc; stampSoft(ctx, x, y, r * 1.5, r * 0.75, a, SEA.caustic); }
      else if (kind === 0) { // a ripple ring: the phase runs 0..1 over 4.5 s, the ring grows and fades
        const u = still ? 0.45 + 0.2 * ph : (t / 4.5 + ph) % 1, r = (6 + 15 * u) * (0.8 + 0.5 * ph), a = (1 - u) * 0.55 * dc, lw = Math.max(2.2, 2.2 / zoom); ctx.globalAlpha = a; ctx.strokeStyle = SEA.ring; ctx.lineWidth = lw; ctx.beginPath(); ctx.ellipse(x, y, r * 1.9, r * 0.95, 0, 0, TAU); ctx.stroke();
      } else { const L = 5 + 4 * ph, ux = HWd, uy = HHd * 0.2, ul = Math.hypot(ux, uy), a = (still ? 0.7 : 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(TAU * (t / 5 + ph * 3)))) * dc; ctx.globalAlpha = a; ctx.fillStyle = SEA.foam; ctx.beginPath(); swoosh(ctx, x - (ux / ul) * L, y - (uy / ul) * L, x + (ux / ul) * L, y + (uy / ul) * L, 0, -1, 1.8, 0.4); ctx.fill(); }
    }
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- the swash: the water breathing on the beaches
const BEACH = new WeakMap();
/** For one ring of the coast: for each point, is the ground there a beach (under 2.5 pixels high)? A cliff has no swash: the sea does not run up a wall. */
function beachFlags(ring) { let f = BEACH.get(ring); if (!f) { const n = ring.length / 2; f = new Uint8Array(n); for (let i = 0; i < n; i++) f[i] = zAt(ring[2 * i], ring[2 * i + 1]) < 2.5 ? 1 : 0; BEACH.set(ring, f); } return f; }
const STRETCH = new WeakMap();
/**
 * The swash's stretches of one coast ring, worked out once: each is 0.7 tile of the coast (a run of points from `i` to `j`), with the length of coast before it (`arc`, which sets its phase), where it starts on the screen (`x`, `y`)
 * and whether it is a beach. Only the beach ones are kept: { n, i, j, arc, x, y } as typed arrays. The loop that drew the swash used to take this apart again every frame (a `Math.hypot` for every segment of every ring, 440 KB of
 * garbage a frame with a still camera); now a frame only looks at the stretches near the view.
 */
export function swashStretches(ring) {
  let st = STRETCH.get(ring); if (st) return st;
  const n = ring.length / 2, fl = beachFlags(ring), I = [], J = [], A = [], X = [], Y = []; let arc = 0, i = 0;
  while (i < n) {
    let j = i, len = 0; for (; j + 1 < n && len < 0.7; j++) len += Math.hypot(ring[2 * j + 2] - ring[2 * j], ring[2 * j + 3] - ring[2 * j + 1]);
    if (fl[i]) { I.push(i); J.push(j); A.push(arc); X.push((ring[2 * i] - ring[2 * i + 1]) * HWd); Y.push((ring[2 * i] + ring[2 * i + 1]) * HHd); }
    arc += len; i = Math.max(j, i + 1);
  }
  st = { n: I.length, i: Int32Array.from(I), j: Int32Array.from(J), arc: Float64Array.from(A), x: Float32Array.from(X), y: Float32Array.from(Y) };
  STRETCH.set(ring, st); return st;
}
/**
 * Along every beach in view, a film of foam that advances and retreats over 6.5 seconds, its phase running along the coast (0.12 of a cycle a tile) so the swash travels down the beach: a soft wide
 * band of shoal colour under a narrower white one, a stretch of 0.7 tile at a time. The baked ground holds the foam line at mid swash, which is the whole picture at rest; this is only drawn while
 * motion is on, and not at all at tier 3 and over. Strokes are never under 1.5 world pixels. Nothing is allocated in a frame: the stretches are made once (swashStretches).
 */
export function drawSwash(ctx, view, zoom, t, tier = 0) {
  if (!t || tier >= 3 || zoom < 0.45) return;
  const rings = coastOf().rings, x0 = view.x0 - 90, x1 = view.x1 + 90, y0 = view.y0 - 90, y1 = view.y1 + 90;
  ctx.save(); ctx.lineCap = 'butt'; ctx.lineJoin = 'round'; // butt ends and short stretches: no bumps where two meet
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r], st = swashStretches(ring);
    for (let s = 0; s < st.n; s++) {
      const x = st.x[s], y = st.y[s]; if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const breath = 0.5 + 0.5 * Math.sin(TAU * (t / 6.5 + st.arc[s] * 0.12)); ctx.beginPath(); ctx.moveTo(x, y);
      for (let q = st.i[s] + 1, e = st.j[s]; q <= e; q++) ctx.lineTo((ring[2 * q] - ring[2 * q + 1]) * HWd, (ring[2 * q] + ring[2 * q + 1]) * HHd);
      ctx.strokeStyle = SEA.shoal; ctx.globalAlpha = 0.16 + 0.2 * breath; ctx.lineWidth = Math.max(1.5, 7 + 8 * breath); ctx.stroke();
      ctx.strokeStyle = SEA.foam; ctx.globalAlpha = 0.25 + 0.4 * breath; ctx.lineWidth = Math.max(1.5, 2.2 + 3 * breath); ctx.stroke();
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
