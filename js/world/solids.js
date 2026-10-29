// Rounded solids: the shapes the toy island is built from. See docs/ART_DIRECTION.md commandment 1 and section 3.2, and docs/RENDER_PLAN.md.
// Owner: T3 BUILDINGS (T4 imports from it; changes to an existing signature go through the plan). Everything here is drawn when a sprite is built, never per frame: a rounded prism costs a
// clip and a handful of fills, which a cached sprite pays once and a live draw would pay every frame.
//
// The rules these helpers keep: no sharp-cornered box larger than 6 world pixels on any side; every top edge has a bevel and every corner a radius of
// clamp(0.10 x min(w, d) in world pixels, 1.5, 4); no line thinner than 1.5 world pixels; light faces lean warm and shade faces violet-blue (palette.faceTone); the sun is upper left, so the
// rim band runs along the back-left and front-left top edges and the ambient-occlusion band along the foot of both walls.
import { P, box, clamp } from './iso.js';
import { faceTone, LIGHT, GRASS } from './palette.js';
import { EDGE_WPX } from './shadow.js';

/** The corner radius of a prism with footprint w x d (in tiles), in world pixels: a tenth of the shorter side, never under 1.5 and never over 4. */
export const bevelRadius = (w, d) => clamp(0.10 * Math.min(w, d) * EDGE_WPX, 1.5, 4);
/** The thinnest line the world may draw, in world pixels, for a camera at `zoom`: 1.5 world pixels, and never under 1.25 screen pixels. */
export const minLine = (zoom = 1) => Math.max(1.5, 1.25 / Math.max(zoom, 1e-3));

/**
 * Append a closed path through `pts` ([[x, y], ...]) with every corner rounded to radius `r` (arcs tangent to both edges; a corner whose edges are shorter than the arc needs gets the
 * largest arc that fits). Does not fill or stroke. Returns how many corners were rounded.
 */
export function roundedPoly(ctx, pts, r) {
  const n = pts.length; let rounded = 0;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const ax = p0[0] - p1[0], ay = p0[1] - p1[1], bx = p2[0] - p1[0], by = p2[1] - p1[1], la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
    const cos = clamp((ax * bx + ay * by) / (la * lb), -1, 1), half = Math.acos(cos) / 2, t = half > 1e-3 && half < Math.PI / 2 - 1e-3 ? Math.min(r / Math.tan(half), la / 2, lb / 2) : 0;
    if (t > 0.01) { const sx = p1[0] + (ax / la) * t, sy = p1[1] + (ay / la) * t, ex = p1[0] + (bx / lb) * t, ey = p1[1] + (by / lb) * t; i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); ctx.quadraticCurveTo(p1[0], p1[1], ex, ey); rounded++; }
    else i ? ctx.lineTo(p1[0], p1[1]) : ctx.moveTo(p1[0], p1[1]);
  }
  ctx.closePath(); return rounded;
}

/**
 * A rounded, bevelled prism standing on [gx, gx + w] x [gy, gy + d], `h` high (from elevation o.z), body colour `c` (a hex): the three faces in the face model, clipped to a silhouette whose
 * corners are rounded, with a sun-side rim band along the back-left and front-left top edges, a lit strip down the front corner and a base ambient-occlusion band on both walls.
 * Returns the faces exactly as iso.box() does ({ left, right, top }, each a polygon), plus `r`, the radius used, so hit shapes and window grids built on it are unchanged.
 * o: { z: elevation, r: radius override, rim: false, ao: false, edge: false } (edge: true skips the front-corner strip).
 */
export function roundedBox(ctx, gx, gy, w, d, h, c, o = {}) {
  const tone = faceTone(c), r = o.r ?? bevelRadius(w, d), z0 = o.z || 0, z1 = z0 + h;
  const A = P(gx, gy, z1), B = P(gx + w, gy, z1), C = P(gx + w, gy + d, z1), D = P(gx, gy + d, z1), B0 = P(gx + w, gy, z0), C0 = P(gx + w, gy + d, z0), D0 = P(gx, gy + d, z0);
  ctx.save();
  roundedPoly(ctx, [D0, C0, B0, B, A, D], r); ctx.clip(); // the prism's outline on screen: left foot, front foot, right foot, right top, back top, left top
  const faces = box(ctx, gx, gy, w, d, h, tone, { z: z0 }); // the three faces, painted inside the rounded outline: the clip is what rounds the corners
  const prevAlpha = ctx.globalAlpha;
  if (o.rim !== false) { // a filled band along the sun-side top edges, 2 world pixels wide inside the silhouette
    ctx.globalAlpha = prevAlpha * 0.55; ctx.strokeStyle = LIGHT.rim; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(D[0], D[1]); ctx.lineTo(C[0], C[1]); ctx.stroke();
  }
  if (o.edge !== true) { // the front corner catches the light: a rounded strip 1.5 world pixels wide
    ctx.globalAlpha = prevAlpha * 0.30; ctx.strokeStyle = LIGHT.rim; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(C[0], C[1] + r * 0.6); ctx.lineTo(C0[0], C0[1] - r * 0.6); ctx.stroke();
  }
  if (o.ao !== false) { // the foot of both walls takes the colour of the shade: a band 3 world pixels tall
    ctx.globalAlpha = prevAlpha * 0.22; ctx.strokeStyle = LIGHT.ao; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(D0[0], D0[1]); ctx.lineTo(C0[0], C0[1]); ctx.lineTo(B0[0], B0[1]); ctx.stroke();
  }
  ctx.globalAlpha = prevAlpha;
  ctx.restore();
  faces.r = r; return faces;
}

/** A capsule: a round-capped stroke from (x0, y0) to (x1, y1) of radius `r` (a limb, a post, a rail, a rung). The thinnest it draws is 3 world pixels across. */
export function capsule(ctx, x0, y0, x1, y1, r, fill) {
  ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = fill; ctx.lineWidth = Math.max(3, r * 2); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.restore();
}

/**
 * A puff: a flat circle in `body`, a crescent of `shade` on its lower right, a crescent of `hi` on its upper left (alpha 0.5), as one clipped circle. The building block of trees, bushes and
 * clouds. Defaults are the foliage ramp. No gradient and no blur: three fills.
 */
export function puff(ctx, x, y, r, body = GRASS.mid, hi = GRASS.hi, shd = GRASS.shade) {
  r = Math.max(r, 1.5); const big = r * 4;
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = body; ctx.fill(); ctx.clip();
  ctx.beginPath(); ctx.rect(x - big, y - big, big * 2, big * 2); ctx.arc(x - r * 0.28, y - r * 0.30, r * 0.98, 0, Math.PI * 2); ctx.fillStyle = shd; ctx.fill('evenodd'); // body minus a circle up-left: the belly
  const prev = ctx.globalAlpha; ctx.globalAlpha = prev * 0.5;
  ctx.beginPath(); ctx.rect(x - big, y - big, big * 2, big * 2); ctx.arc(x + r * 0.22, y + r * 0.26, r * 0.95, 0, Math.PI * 2); ctx.fillStyle = hi; ctx.fill('evenodd'); // body minus a circle down-right: the sunlit top
  ctx.globalAlpha = prev; ctx.restore();
}

/** The points of a prism's outline on screen, in the order roundedBox rounds them (for tests and for hit shapes that follow the silhouette). */
export const outlineOf = (gx, gy, w, d, h, z = 0) => [P(gx, gy + d, z), P(gx + w, gy + d, z), P(gx + w, gy, z), P(gx + w, gy, z + h), P(gx, gy, z + h), P(gx, gy + d, z + h)];
