// The shapes of the sea's live marks as pure geometry: bent capsules for crests, chains of discs for foam curls, concentric squashed rings for ripples and four-point sparkles. Nothing here draws or reads the camera;
// water.js places them (in the world) and paints them. Every shape is a closed, rounded form: a crest is a capsule with round ends and a bow, never a polyline or a hairline, a curl is a row of overlapping discs
// (so its edge is scalloped by construction), a ripple is a ring squashed to the iso plane, and no two of a kind are the same size.
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md). Art direction 5.2 and 5.4: the cartoon water of the toy islands.
export const TAU = 6.2832;
/** The number of samples along one side of a crest's outline. */
export const CREST_N = 13;
/**
 * The outline of a crest at world (cx, cy): a capsule along the direction (ux, uy) (unit), `half` world pixels long each way from the middle, at most `thick` pixels through, bowed by `bow` pixels towards the
 * left of its direction. The thickness along it is sqrt(1 - s^2) of the full (an ellipse's: round ends, fattest in the middle), so the shape is one rounded form. Writes 2 x (2 CREST_N - 2) numbers (x, y) into `out`
 * and answers how many points that is.
 */
export function crestOutline(out, cx, cy, ux, uy, half, thick, bow) {
  const nx = -uy, ny = ux; let n = 0;
  for (let i = 0; i < CREST_N; i++) { const s = -1 + (2 * i) / (CREST_N - 1), w = Math.sqrt(Math.max(0, 1 - s * s)) * thick * 0.5, mid = bow * (1 - s * s), px = cx + ux * s * half + nx * mid, py = cy + uy * s * half + ny * mid; out[n++] = px + nx * w; out[n++] = py + ny * w; }
  for (let i = CREST_N - 2; i >= 1; i--) { const s = -1 + (2 * i) / (CREST_N - 1), w = Math.sqrt(Math.max(0, 1 - s * s)) * thick * 0.5, mid = bow * (1 - s * s), px = cx + ux * s * half + nx * mid, py = cy + uy * s * half + ny * mid; out[n++] = px - nx * w; out[n++] = py - ny * w; }
  return n / 2;
}
/** The discs of a foam curl: `n` discs of radius about `r` along an arc of radius `R` through the angle `span` from `rot`, the radius swelling to the middle (r at the ends x 0.55). Writes (x, y, radius) triples into `out`. */
export function foamChain(out, cx, cy, rot, R, r, n, span = 2.0) {
  for (let i = 0; i < n; i++) { const f = n === 1 ? 0.5 : i / (n - 1), a = rot + (f - 0.5) * span, k = 0.55 + 0.45 * Math.sin(Math.PI * f); out[i * 3] = cx + Math.cos(a) * R; out[i * 3 + 1] = cy + Math.sin(a) * R * 0.5; out[i * 3 + 2] = r * k; } // (the plane is squashed to half: an iso circle)
  return n;
}
/** A ripple: the state of ring `k` (0, 1, 2) of a ripple whose phase is `phase` (0..1 a cycle) at time `t` seconds, cycle `period` seconds. { r: 0..1 of the full radius, a: 0..1 alpha }. At t = 0 the ring stands at its resting radius, still. */
export function ringState(phase, t, k, period = 7.5) {
  const f = (t === 0 ? phase : t / period + phase) + k * 0.27, u = f - Math.floor(f);
  return { r: 0.22 + 0.78 * u, a: Math.pow(1 - u, 1.4) * (u < 0.08 ? u / 0.08 : 1) };
}
/** The outline of a four-point sparkle of radius `r`, its arms `slim` (0.15 to 0.35) of the radius at the waist, as 8 (x, y) points into `out`. */
export function sparkle(out, x, y, r, slim) {
  out[0] = x; out[1] = y - r; out[2] = x + r * slim; out[3] = y - r * slim; out[4] = x + r * 0.85; out[5] = y; out[6] = x + r * slim; out[7] = y + r * slim; out[8] = x; out[9] = y + r; out[10] = x - r * slim; out[11] = y + r * slim; out[12] = x - r * 0.85; out[13] = y; out[14] = x - r * slim; out[15] = y - r * slim;
  return 8;
}
/**
 * A ribbon along a run of the coast: `pts` is a flat array of world points (x, y) along the coast and `wid(i)` the width at point i towards the sea (world px; 0 at the run's ends); writes the closed polygon
 * (the coast's own points, then the offset ones back) into `out` using the sea-side normals `nrm` (x, y per point, unit) and answers the point count. One polygon is one fill: no seam, no butt end, no step.
 */
export function ribbon(out, pts, nrm, n, wid) {
  let k = 0;
  for (let i = 0; i < n; i++) { out[k++] = pts[2 * i]; out[k++] = pts[2 * i + 1]; }
  for (let i = n - 1; i >= 0; i--) { const w = wid(i); out[k++] = pts[2 * i] + nrm[2 * i] * w; out[k++] = pts[2 * i + 1] + nrm[2 * i + 1] * w; }
  return k / 2;
}
