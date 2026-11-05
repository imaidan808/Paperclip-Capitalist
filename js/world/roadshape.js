// The shape of a road: rounding its corners and grading the ground under it. Pure (no drawing, no randomness); js/world/layout.js builds the roads with it. Owner: T1 TERRAIN, COAST AND WATER.
//
// Why. The roads of the island were hand-drawn polylines with sharp corners and the ground under them was whatever the noise and the district plateaus made it. At a corner the painted dashes came out as arrows and a car
// jumped sideways (its lane is a fixed offset from a line that turns in one point), and where a road crossed a cliff the ground stepped by 10 world pixels in half a tile, which reads as a road cut off.
// So every corner is an arc (`fillet`) and the ground along every road is a smooth profile (`gradeProfile`, `gradeRoads`) that follows the land's large shape and none of its steps.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
/** The tiles over which a branch of a fork rises or falls from the junction's height to its own profile (gradeRoads). */
export const JUNCTION_LEVEL = 4.5;

/**
 * Tidy a hand-drawn polyline: a point that repeats the one before it goes, and so does a point where the road runs out along a line and straight back along it (a spur: a waypoint that overshot a junction by a tile
 * left a stub that the road ran out to and back from; a turn of more than 145 degrees is a fold) and so does a point on a straight run, so that a corner is the end of a whole straight leg. Repeats until nothing changes; the ends are kept. Answers a new array.
 */
export function tidy(pts, eps = 0.05, foldDeg = 35) {
  let out = pts.map((p) => p.slice()), changed = true;
  while (changed && out.length > 2) {
    changed = false;
    for (let i = 1; i < out.length; i++) if (Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]) < eps && out.length > 2) { out.splice(i === out.length - 1 ? i - 1 : i, 1); changed = true; break; }
    if (changed) continue;
    for (let i = 1; i + 1 < out.length; i++) {
      const ax = out[i - 1][0] - out[i][0], ay = out[i - 1][1] - out[i][1], bx = out[i + 1][0] - out[i][0], by = out[i + 1][1] - out[i][1];
      const ang = Math.acos(clamp((ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1), -1, 1)); // 0 for a fold
      if (ang < (foldDeg * Math.PI) / 180 || ang > Math.PI - 0.02) { out.splice(i, 1); changed = true; break; } // a fold, or a point on a straight run (it would cut the straight leg short of its corner)
    }
  }
  return out;
}

/**
 * Round every interior corner of the polyline `pts` ([[x, y], ...]) with a circular arc of radius `r` (tiles). The arc is tangent to both legs; a radius too big for the legs is cut to what they allow (half of each
 * leg at most, so two corners never overlap). The ends are kept, a straight run and a fold are left as they are, and `steps` is the number of segments an arc of a right angle gets. Answers a new array.
 */
export function fillet(pts, r, steps = 8) {
  if (pts.length < 3 || !(r > 0)) return pts.map((p) => p.slice());
  const out = [pts[0].slice()];
  for (let i = 1; i + 1 < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
    const ax = p0[0] - p1[0], ay = p0[1] - p1[1], bx = p2[0] - p1[0], by = p2[1] - p1[1], la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 1e-9 || lb < 1e-9) { out.push(p1.slice()); continue; }
    const ang = Math.acos(clamp((ax * bx + ay * by) / (la * lb), -1, 1)); // the angle between the legs: pi for a straight run
    if (ang > Math.PI - 1e-3 || ang < 1e-3) { out.push(p1.slice()); continue; }
    const half = ang / 2, t = Math.min(r / Math.tan(half), la / 2, lb / 2), rho = t * Math.tan(half); // t: how far from the corner along each leg the arc begins
    const ux = ax / la + bx / lb, uy = ay / la + by / lb, ul = Math.hypot(ux, uy) || 1, d = t / Math.cos(half); // the bisector, and the distance to the arc's centre along it
    const cx = p1[0] + (ux / ul) * d, cy = p1[1] + (uy / ul) * d;
    const sx = p1[0] + (ax / la) * t, sy = p1[1] + (ay / la) * t, ex = p1[0] + (bx / lb) * t, ey = p1[1] + (by / lb) * t;
    const a0 = Math.atan2(sy - cy, sx - cx); let da = Math.atan2(ey - cy, ex - cx) - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const n = Math.max(2, Math.ceil((Math.abs(da) / (Math.PI / 2)) * steps));
    out.push([sx, sy]);
    for (let k = 1; k < n; k++) out.push([cx + rho * Math.cos(a0 + (da * k) / n), cy + rho * Math.sin(a0 + (da * k) / n)]);
    out.push([ex, ey]);
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

/**
 * The height of a road along its length, from the natural ground `zs` sampled at even steps: the stretches over water (`wet`) take the straight line between the banks (a bridge deck), the whole is smoothed (a gaussian
 * of `sigma` samples, so the land's large shape stays and its steps go), the two ends are held where they were (a road leaves a district at the district's height) and the slope between neighbours is limited to `slope`
 * a step, or to what the two ends need when they are far apart. Answers a new array.
 */
export function gradeProfile(zs, wet = [], { sigma = 6, slope = 1.3 } = {}) {
  const n = zs.length; if (n < 2) return zs.slice();
  const z = zs.slice(); if (wet.every(Boolean) && wet.length === n) return z;
  for (let i = 0; i < n; i++) if (wet[i]) {
    let a = i - 1; while (a >= 0 && wet[a]) a--; let b = i + 1; while (b < n && wet[b]) b++;
    z[i] = a < 0 ? z[b] : b >= n ? z[a] : z[a] + ((z[b] - z[a]) * (i - a)) / (b - a);
  }
  const k = Math.ceil(sigma * 2.5), w = []; for (let d = -k; d <= k; d++) w.push(Math.exp(-(d * d) / (2 * sigma * sigma)));
  const sm = z.map((_, i) => { let s = 0, ws = 0; for (let d = -k; d <= k; d++) { const j = i + d; if (j < 0 || j >= n) continue; s += z[j] * w[d + k]; ws += w[d + k]; } return s / ws; });
  const e0 = z[0] - sm[0], e1 = z[n - 1] - sm[n - 1]; for (let i = 0; i < n; i++) sm[i] += e0 + (e1 - e0) * (i / (n - 1)); // the ends are what they were; the correction is carried along the road
  const m = Math.max(slope, (Math.abs(sm[n - 1] - sm[0]) / (n - 1)) * 1.15);
  for (let i = 1; i < n; i++) sm[i] = clamp(sm[i], sm[i - 1] - m, sm[i - 1] + m);
  for (let i = n - 2; i >= 0; i--) sm[i] = clamp(sm[i], sm[i + 1] - m, sm[i + 1] + m);
  return sm;
}

/**
 * Grade the ground under every road: for each edge (not the ferry) the height along it is the smooth profile of `gradeProfile`, and every land vertex of the height field `ZV` (width VW, a vertex a tile apart; FV is
 * the land field, positive on land) near the road is drawn toward the profile at the nearest point of the road: wholly within the road and half a tile of it, and less and less to `reach` tiles out. Water is left
 * alone. Changes `ZV` in place, and gives every edge its `zprof` ({ step, z }: the height along it every `step` tiles). `edges` are { pts, lens, len, w, ferry, stem, ja, jb } (the edge starts, ends at a junction).
 * The stem of a fork (the run from a port to the junction where two roads part) is graded last: the two branches are laid first, so the junction stands at one height for all three, and the stem then runs from the port's height to that
 * one and the ground under it follows it (graded first, the branches' own corridors, which overlap it near the junction, took the ground from under it: 3 pixels off at the stem of 12).
 */
export function gradeRoads(ZV, FV, VW, VH, edges, { step = 0.5, reach = 3.5 } = {}) {
  const at = (A, x, y) => { x = clamp(x, 0, VW - 1.001); y = clamp(y, 0, VH - 1.001); const i = Math.floor(x), j = Math.floor(y), tx = x - i, ty = y - j, k = j * VW + i; return (A[k] * (1 - tx) + A[k + 1] * tx) * (1 - ty) + (A[k + VW] * (1 - tx) + A[k + VW + 1] * tx) * ty; };
  for (const e of [...edges].sort((a, b) => (a.stem ? 1 : 0) - (b.stem ? 1 : 0))) {
    if (e.ferry) continue;
    const P = e.pts, L = e.lens, len = e.len, hw = e.w / 2, S = [];
    for (let s = 0, i = 1; ; s = Math.min(s + step, len)) { while (i < L.length - 1 && L[i] < s) i++; const a = P[i - 1], b = P[i], l = L[i] - L[i - 1] || 1, k = (s - L[i - 1]) / l; S.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); if (s >= len) break; }
    const zs = S.map(([x, y]) => at(ZV, x, y)), wet = S.map(([x, y]) => at(FV, x, y) <= 0), prof = gradeProfile(zs, wet);
    if (!e.stem) for (const [last, on] of [[false, e.ja], [true, e.jb]]) if (on) { // a branch leaves its junction level: the three roads of a fork share the ground under it for the first tiles, so they share one height there, and their own slopes begin beyond it
      const n = prof.length, z0 = prof[last ? n - 1 : 0];
      for (let i = 0; i < n; i++) { const d = (last ? n - 1 - i : i) * step; if (d < JUNCTION_LEVEL) prof[i] = z0 + (prof[i] - z0) * smooth(d / JUNCTION_LEVEL); }
    }
    e.zprof = { step, z: Float32Array.from(prof) }; // (the road's own height along its length: what the road is drawn at, where the ground at a bank dips to the water)
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of S) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const R = hw + reach;
    for (let j = Math.max(0, Math.floor(y0 - R)); j <= Math.min(VH - 1, Math.ceil(y1 + R)); j++) for (let i = Math.max(0, Math.floor(x0 - R)); i <= Math.min(VW - 1, Math.ceil(x1 + R)); i++) {
      const v = j * VW + i; if (FV[v] <= 0) continue;
      let best = 1e9, bk = 0; for (let k = 0; k < S.length; k++) { const d = (S[k][0] - i) ** 2 + (S[k][1] - j) ** 2; if (d < best) { best = d; bk = k; } }
      const d = Math.sqrt(best); if (d > R) continue;
      const wgt = 1 - smooth((d - (hw + 0.5)) / (reach - 0.5)); // 1 on the road and half a tile beyond it, fading to 0 at `reach`
      if (wgt > 0) ZV[v] = Math.max(0.5, ZV[v] + (prof[bk] - ZV[v]) * wgt);
    }
  }
}
