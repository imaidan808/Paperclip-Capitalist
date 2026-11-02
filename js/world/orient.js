// A box turned to any heading: the island's flat-shaded prism for things that move along a road (cars; the mounts of a later change). The solids of solids.js are grid-aligned (a car could only face along the
// grid's two axes, so on a bend it slid sideways and flipped); this one has its footprint turned by `ang` and draws only what the camera sees of it: the top and the sides that face the lower half of the screen,
// each in ONE flat tone (no gradient, no rim, no outline: a matte, faceted form whose silhouette does the work). Owner: T4 PROPS, NATURE AND CHARACTERS.
import { P, mix } from './iso.js';

/** Corners of a len x wid rectangle centred on (cx, cy) in grid space with its long side along `ang` (radians, from +gx towards +gy), in the order front-right, front-left, back-left, back-right. */
export function footprint(cx, cy, len, wid, ang) {
  const c = Math.cos(ang), s = Math.sin(ang), a = len / 2, b = wid / 2;
  return [[a, -b], [a, b], [-a, b], [-a, -b]].map(([u, v]) => [cx + u * c - v * s, cy + u * s + v * c]);
}

/**
 * The faces of such a prism that the camera sees: the top, and each side whose outward normal points to the lower half of the screen (toward larger gx + gy). Answers `{ top: [[x, y], ...], sides: [{ i, a, b, nx, ny,
 * shade }] }` in grid coordinates, `i` the side's number (0 front, 1 left, 2 back, 3 right), `shade` 0 (in shade: it faces +gx) to 1 (in the sun: it faces +gy), the sides sorted far to near.
 */
export function visibleFaces(cx, cy, len, wid, ang) {
  const q = footprint(cx, cy, len, wid, ang), c = Math.cos(ang), s = Math.sin(ang), sides = [];
  const N = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // the outward normals in the box's own frame (along, across)
  for (let i = 0; i < 4; i++) {
    const nx = N[i][0] * c - N[i][1] * s, ny = N[i][0] * s + N[i][1] * c, view = nx + ny;
    if (view > 1e-6) sides.push({ i, a: q[i], b: q[(i + 1) % 4], nx, ny, view, shade: Math.min(1, Math.max(0, 0.5 + 0.35 * (ny - nx))) });
  }
  sides.sort((p, r) => p.view - r.view);
  return { top: q, sides };
}

/**
 * Draw the prism: centred on (cx, cy) in grid space, `h` pixels tall from height `z0`, turned by `ang`. `tone` is { t, l, r } (the top, the face in the sun, the face in shade: palette.faceTone), or a function of the
 * side `(side) => colour` when the sides need colours of their own (a cabin's glass). Answers the faces it drew.
 */
export function orientedBox(g, cx, cy, len, wid, h, ang, tone, z0 = 0) {
  const F = visibleFaces(cx, cy, len, wid, ang), poly = (pts, col) => { g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = col; g.lineWidth = 1; g.lineJoin = 'round'; g.stroke(); };
  for (const sd of F.sides) { const col = typeof tone === 'function' ? tone(sd) : mix(tone.r, tone.l, sd.shade); poly([P(sd.a[0], sd.a[1], z0), P(sd.b[0], sd.b[1], z0), P(sd.b[0], sd.b[1], z0 + h), P(sd.a[0], sd.a[1], z0 + h)], col); }
  poly(F.top.map(([x, y]) => P(x, y, z0 + h)), typeof tone === 'function' ? tone({ top: true }) : tone.t);
  return F;
}
