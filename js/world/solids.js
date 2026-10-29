// Rounded solids: the shapes the toy island is built from. See docs/ART_DIRECTION.md commandment 1 and section 3.2, and docs/RENDER_PLAN.md.
// Owner: T3 BUILDINGS (T4 imports from it; changes to an existing signature go through the plan). Everything here is drawn when a sprite is built, never per frame: a rounded prism costs a
// clip and a handful of fills, which a cached sprite pays once and a live draw would pay every frame.
//
// The rules these helpers keep: no sharp-cornered box larger than 6 world pixels on any side; every edge of a prism is rounded, the silhouette's corners by a radius of clamp(0.10 x min(w, d) x EDGE_WPX, 3, 12)
// world pixels (a building of two and a half tiles has a 9 pixel fillet: about 9 screen pixels at the working zoom, a form and not a hairline) and the two edges inside the silhouette (the front vertical edge, the
// top-front edges) by a band of the same radius that shades across the corner like a cylinder; no line thinner than 1.5 world pixels; light faces lean warm and shade faces violet-blue (palette.faceTone); the sun is
// upper left, so the rim band runs along the back-left and front-left top edges and the ambient-occlusion band along the foot of both walls.
import { P, box, clamp, mix } from './iso.js';
import { faceTone, LIGHT, GRASS } from './palette.js';
import { EDGE_WPX } from './shadow.js';

/** The corner radius of a prism with footprint w x d (in tiles), in world pixels: a tenth of the shorter side, never under 3 and never over 12 (a crate is a 3.6 pixel fillet, a hall 9, a tower 11). */
export const bevelRadius = (w, d) => clamp(0.10 * Math.min(w, d) * EDGE_WPX, 3, 12);
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
 * A rounded, bevelled prism standing on [gx, gx + w] x [gy, gy + d], `h` high (from elevation o.z), body colour `c` (a hex): the three faces in the face model, clipped to a silhouette whose corners are
 * rounded by `r` (bevelRadius), and the three edges inside it rounded too, so the form reads as a chunky toy and not a slab with a pale line on it:
 *   the front vertical edge   a fillet strip 1.8 r wide whose colour runs across the corner from the lit face to the shade face through a light streak, like a cylinder (o.edge: false skips it)
 *   the top-front edges       a chamfer band 1.4 r wide in the colour between the top and the wall, and the sun's streak along its top side on the lit edge (o.rim: false skips both, and the back-left rim)
 *   the foot                  two bands of the shade colour, 2 r and 1 r wide, the ambient occlusion where a wall meets the ground, and a soft darkening up the lower wall (o.ao: false skips them)
 * Returns the faces exactly as iso.box() does ({ left, right, top }, each a polygon), plus `r`, the radius used, so hit shapes and window grids built on it are unchanged.
 * o: { z: elevation, r: radius override, rim: false, ao: false, edge: false }. Every stroke is at least 1.5 world pixels wide.
 */
export function roundedBox(ctx, gx, gy, w, d, h, c, o = {}) {
  const tone = faceTone(c), r = o.r ?? bevelRadius(w, d), z0 = o.z || 0, z1 = z0 + h;
  const A = P(gx, gy, z1), B = P(gx + w, gy, z1), C = P(gx + w, gy + d, z1), D = P(gx, gy + d, z1), B0 = P(gx + w, gy, z0), C0 = P(gx + w, gy + d, z0), D0 = P(gx, gy + d, z0);
  ctx.save();
  roundedPoly(ctx, [D0, C0, B0, B, A, D], r); ctx.clip(); // the prism's outline on screen: left foot, front foot, right foot, right top, back top, left top
  const faces = box(ctx, gx, gy, w, d, h, tone, { z: z0 }); // the three faces, painted inside the rounded outline: the clip is what rounds the silhouette
  const prevAlpha = ctx.globalAlpha, fine = Math.min(r, h * 0.45); // a very low prism (a kerb, a step) does not get a fillet taller than itself
  if (o.edge !== false && h >= 8) { // the front vertical edge: a strip across the corner shaded like a cylinder (lit side, a streak of sky light, then the shade)
    const k = fine * 0.9, g = ctx.createLinearGradient(C[0] - k, 0, C[0] + k, 0);
    g.addColorStop(0, tone.l); g.addColorStop(0.32, mix(tone.t, tone.l, 0.4)); g.addColorStop(0.62, mix(tone.l, tone.r, 0.55)); g.addColorStop(1, tone.r);
    ctx.globalAlpha = prevAlpha; ctx.fillStyle = g; ctx.fillRect(C[0] - k, C[1] + fine * 0.4, 2 * k, C0[1] - C[1] - fine * 0.8);
  }
  if (o.rim !== false) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // the chamfer between the top and each front wall: a band in the colour half way between them, centred on the edge
    ctx.globalAlpha = prevAlpha; ctx.lineWidth = Math.max(1.5, fine * 1.4);
    ctx.strokeStyle = mix(tone.t, tone.l, 0.5); ctx.beginPath(); ctx.moveTo(D[0], D[1]); ctx.lineTo(C[0], C[1]); ctx.stroke();
    ctx.strokeStyle = mix(tone.t, tone.r, 0.5); ctx.beginPath(); ctx.moveTo(C[0], C[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
    // the sun's streak on the lit edge, on the top face's side of the chamfer, and a fainter one round the back-left silhouette
    ctx.strokeStyle = LIGHT.rim; ctx.lineWidth = Math.max(1.5, fine * 0.5);
    ctx.globalAlpha = prevAlpha * 0.65; ctx.beginPath(); ctx.moveTo(D[0], D[1] - fine * 0.45); ctx.lineTo(C[0], C[1] - fine * 0.45); ctx.stroke();
    ctx.globalAlpha = prevAlpha * 0.3; ctx.beginPath(); ctx.moveTo(C[0], C[1] - fine * 0.45); ctx.lineTo(B[0], B[1] - fine * 0.45); ctx.stroke();
    ctx.globalAlpha = prevAlpha * 0.5; ctx.lineWidth = Math.max(1.5, fine * 0.8); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(D[0], D[1]); ctx.stroke();
  }
  if (o.ao !== false && h >= 8) { // the foot of both walls takes the colour of the shade: a wide faint band under a narrower stronger one, and the lower wall darkens a little
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt'; ctx.strokeStyle = LIGHT.ao;
    ctx.globalAlpha = prevAlpha * 0.14; ctx.lineWidth = Math.max(1.5, fine * 2); ctx.beginPath(); ctx.moveTo(D0[0], D0[1]); ctx.lineTo(C0[0], C0[1]); ctx.lineTo(B0[0], B0[1]); ctx.stroke();
    ctx.globalAlpha = prevAlpha * 0.2; ctx.lineWidth = Math.max(1.5, fine); ctx.beginPath(); ctx.moveTo(D0[0], D0[1]); ctx.lineTo(C0[0], C0[1]); ctx.lineTo(B0[0], B0[1]); ctx.stroke();
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
