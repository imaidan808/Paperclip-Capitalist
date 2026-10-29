// Crisp edges: the tools every art track uses so a drawer never leaves a hairline, a crack or a stroke that straddles a pixel. Owner: T5 RASTER QUALITY (docs/RENDER_PLAN.md section 5, art direction commandment 4 and 3.3).
// Pure arithmetic plus a few helpers that take a 2D context; they read the context's transform (a sprite is drawn at the exact render scale on a whole-pixel phase, so the maths is exact there) and draw nothing of their own taste.
//
// THE HABITS THIS REPLACES (found by reading every drawer of the other tracks and the legacy helpers; each is a real line of code in the tree, and each has a tool below):
//   1. `ctx.lineWidth = 1` (or 0.8, or 1.2) for a rim, a mortar line, a rail: a world pixel is 0.13 to 0.4 device pixels at the far zooms and 1.8 at the working zoom, so the line is a faint smear at one and a hairline at the other.
//      -> `lineFor(ctx, wpx)`: never thinner than 1.5 world pixels AND never thinner than 1.25 device pixels, from the context's own transform. (solids.js minLine(zoom) says the same number from a zoom.)
//   2. An axis-aligned stroke or fillRect whose edge falls between two pixels (a post, a plank, a sign, a window): two half-covered columns instead of one solid one, and a different pair at every zoom (the edge "shimmers").
//      -> `crispRect(ctx, x, y, w, h)` snaps the rectangle's edges to the device grid; `snapWorld(v, a, e)` snaps one coordinate; `strokeShift(devicePx)` says where a stroke's centre goes so its edges are on pixel edges.
//   3. Faces that share an edge, each filled on its own: the pixel on the edge is half in each, gets 1 - 0.5 x 0.5 = 0.75 and shows a quarter of what is behind (a hairline of ground through a wall).
//      -> `sealedFaces(ctx, faces, under)` fills the UNION of the faces as ONE path first (one coverage, no seam), then the faces over it. (iso.js box() does it for the three faces of a prism; a drawer with its own faces uses this.)
//   4. A contour drawn as a stroke centred on the silhouette: half of it falls inside the fill and half outside, the outer half anti-aliased against the ground, so the line is half as strong and a different strength on each side.
//      -> `contourStroke(ctx, path..., fill, zoom)` draws the stroke UNDER the fill, widened by its own width, so the line is wholly outside the shape and the fill's edge is the shape's edge.
//   5. A dash or a gap under two world pixels (a dashed line, a picket gap): sub-pixel at the far zooms, an alias pattern as the camera moves. -> `dashFor(zoom)` and the 2 world pixel floor.
//   6. Ground tiles and stripes that abut with no overdraw: a crack along every shared edge at any scale under 1. -> `inflate(pts, d)` grows a convex polygon outward by d world pixels (the ground layers overdraw by 0.6).
import { shade, mix, clamp } from './iso.js';

/** The thinnest a line may be on the screen, in device pixels, and in the world, in world pixels (art direction 3.3). */
export const MIN_DEVICE_LINE = 1.25, MIN_WORLD_LINE = 1.5;
/** The thinnest a dash or a gap may be, in world pixels. */
export const MIN_DASH = 2;

/** The scale of a context's transform (device pixels per world pixel); 1 where it cannot be read. */
export function scaleOf(ctx) { const m = ctx && typeof ctx.getTransform === 'function' ? ctx.getTransform() : null; return m && m.a > 0 ? Math.hypot(m.a, m.b || 0) : 1; }

/** A line width in world pixels for what the drawer asked for (`wpx`): at least 1.5 world pixels, and at least 1.25 device pixels at the context's scale `a` (or the one given). */
export const lineFor = (ctx, wpx, a = typeof ctx === 'number' ? ctx : scaleOf(ctx)) => Math.max(wpx, MIN_WORLD_LINE, MIN_DEVICE_LINE / Math.max(a, 1e-6));
/** The contour width the art direction gives a silhouette at a zoom (3.1: 1.2 screen pixels at mid, 1.6 near, 2 close, none at far; clamped to 0.8 to 3 world pixels). 0 at far. */
export function contourWidth(zoom, band = 'near') { const spx = band === 'close' ? 2 : band === 'near' ? 1.6 : band === 'mid' ? 1.2 : 0; return spx ? clamp(spx / Math.max(zoom, 1e-3), 0.8, 3) : 0; }
/** The tone-on-tone contour colour of a fill (3.1): a darker, more violet version of it. */
export const contourColor = (fill) => mix(shade(fill, 0.62), '#4a3f88', 0.2);
/** The dash length and gap for a dashed line at a zoom: never under MIN_DASH world pixels and never under 3 device pixels. */
export const dashFor = (zoom, wpx = 4) => Math.max(wpx, MIN_DASH, 3 / Math.max(zoom, 1e-3));

/**
 * Snap one world coordinate to the device pixel grid: `a` is the render scale and `e` the whole-pixel translation of that axis (0 inside a sprite: its origin is on the grid). Answers a world coordinate whose device
 * position is a whole number of pixels, so an edge drawn there is one solid row or column and not two half ones.
 */
export const snapWorld = (v, a, e = 0) => (Math.round(v * a + e) - e) / a;
/**
 * Where an axis-aligned stroke of `devicePx` device pixels has its centre so that its edges fall on pixel edges: on a pixel boundary for an even width, on a pixel's middle (half a pixel in) for an odd one. Answers the
 * offset to add to the coordinate in DEVICE pixels (0 or 0.5): divide by the scale to add it in world pixels.
 */
export const strokeShift = (devicePx) => (Math.round(devicePx) % 2 ? 0.5 : 0);
/** A rectangle with its four edges snapped to the device grid (width and height at least one device pixel), as [x, y, w, h] in world pixels. `e`, `f` are the whole-pixel translations. */
export function snapRect(x, y, w, h, a, e = 0, f = 0, out = [0, 0, 0, 0]) {
  const x0 = snapWorld(x, a, e), y0 = snapWorld(y, a, f); let x1 = snapWorld(x + w, a, e), y1 = snapWorld(y + h, a, f);
  if (x1 - x0 < 1 / a) x1 = x0 + 1 / a; if (y1 - y0 < 1 / a) y1 = y0 + 1 / a;
  out[0] = x0; out[1] = y0; out[2] = x1 - x0; out[3] = y1 - y0; return out;
}
/** fillRect with the edges snapped to the device grid of the context's current transform (its translation rounded: the world's camera and a sprite's origin both are whole pixels). */
export function crispRect(ctx, x, y, w, h) {
  const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null; if (!m || !(m.a > 0) || m.b || m.c) { ctx.fillRect(x, y, w, h); return; }
  const r = snapRect(x, y, w, h, m.a, m.e, m.f); ctx.fillRect(r[0], r[1], r[2], r[3]);
}

/** A convex polygon grown outward by `d` (every edge moved out by d, corners mitred), as new points; the overdraw of a ground tile or a stripe, so two that abut overlap instead of cracking. */
export function inflate(pts, d) {
  const n = pts.length; if (n < 3 || !d) return pts.map((p) => [p[0], p[1]]);
  let area = 0; for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
  const sgn = area >= 0 ? 1 : -1, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], bx = p2[0] - p1[0], by = p2[1] - p1[1], la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
    const n1x = (ay / la) * sgn, n1y = (-ax / la) * sgn, n2x = (by / lb) * sgn, n2y = (-bx / lb) * sgn; // outward normals of the two edges at this corner
    const dot = n1x * n2x + n1y * n2y, k = d / Math.max(1 + dot, 0.2); // a mitre: the corner moves by d / cos(half the turn), capped so a spike stays a spike of a few pixels
    out.push([p1[0] + (n1x + n2x) * k, p1[1] + (n1y + n2y) * k]);
  }
  return out;
}

/**
 * Fill faces that share edges without a crack. `faces` is [{ pts: [[x, y], ...], fill }]; `under` is the colour of the silhouette laid first (the lit face's, or a mid tone). The union of the faces is filled as ONE path
 * (a pixel on a shared edge is covered once, in full), then each face over it. Answers nothing; the faces keep their own colours and edges.
 */
export function sealedFaces(ctx, faces, under) {
  ctx.beginPath();
  for (const f of faces) { const p = f.pts; ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); }
  ctx.fillStyle = under || faces[0].fill; ctx.fill('nonzero');
  for (const f of faces) { const p = f.pts; ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); ctx.fillStyle = f.fill; ctx.fill(); }
}

/**
 * A contour that is wholly outside the shape: the path stroked at twice the contour width in the contour colour UNDER the fill, so the fill's own edge is the shape's edge and the line is `width` wide on the outside
 * only. `trace(ctx)` appends the shape's path (it is called twice: once for the line, once for the fill). `width` 0 draws just the fill.
 */
export function contourFill(ctx, trace, fill, width, color = contourColor(fill)) {
  if (width > 0) { ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.lineWidth = width * 2; ctx.beginPath(); trace(ctx); ctx.stroke(); ctx.restore(); }
  ctx.beginPath(); trace(ctx); ctx.fillStyle = fill; ctx.fill();
}

/**
 * Audit a recorded drawing (tests/helpers/recctx.mjs): the strokes thinner than `minLine` world pixels, and (for an axis-aligned rect) edges that fall between device pixels at scale `a`. Answers { thin, loose }
 * counts and the first few of each, for a track's own test to hold at zero.
 */
export function audit(log, o = {}) {
  const a = o.scale || 1, minW = o.min ?? Math.max(MIN_WORLD_LINE, MIN_DEVICE_LINE / a), thin = [], loose = [];
  for (const s of log.strokes || []) if ((s.lw ?? s.width) < minW - 1e-9) thin.push(s);
  for (const r of log.rects || []) { if (typeof r.x !== 'number') continue; const x = r.x * a + (o.e || 0), y = r.y * a + (o.f || 0), x1 = (r.x + r.w) * a + (o.e || 0), y1 = (r.y + r.h) * a + (o.f || 0); if ([x, y, x1, y1].some((v) => Math.abs(v - Math.round(v)) > 0.02)) loose.push(r); }
  return { thin: thin.length, loose: loose.length, thinFirst: thin.slice(0, 5), looseFirst: loose.slice(0, 5) };
}
