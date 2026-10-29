// Rounded solids: the shapes the toy island is built from. See docs/ART_DIRECTION.md commandment 1 and section 3.2, and docs/RENDER_PLAN.md.
// Owner: T3 BUILDINGS (T4 imports from it; changes to an existing signature go through the plan). Everything here is drawn when a sprite is built, never per frame: a rounded prism costs a
// clip and a handful of fills, which a cached sprite pays once and a live draw would pay every frame.
//
// The rules these helpers keep: no sharp-cornered box larger than 6 world pixels on any side; every edge of a prism is rounded, the silhouette's corners by a radius of clamp(0.10 x min(w, d) x EDGE_WPX, 3, 12)
// world pixels (a building of two and a half tiles has a 9 pixel fillet: about 9 screen pixels at the working zoom, a form and not a hairline) and the two edges inside the silhouette (the front vertical edge, the
// top-front edges) by a band of the same radius that shades across the corner like a cylinder; no line thinner than 1.5 world pixels; light faces lean warm and shade faces violet-blue (palette.faceTone); the sun is
// upper left, so the rim band runs along the back-left and front-left top edges and the ambient-occlusion band along the foot of both walls.
import { P, box, clamp, mix, rgb, hex, luma } from './iso.js';
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


// ================================================================ the toy kit: colour ramps, the chunky box and the elevation of a wall
// What the buildings are made of (docs/ART_DIRECTION.md 2.1, 3.1, 3.2). Colour is a ramp of five stops from one body colour, hue-shifted the way a painter shifts it (light towards warm, shade towards violet-blue,
// never just darker), a prism is a toyBox (bigger fillet than roundedBox, a glossy sun side, a bounce-lit shade side, a contour that is a darker tone of the fill) and everything painted on a wall is drawn in the
// wall's own elevation (onWall: x along the wall, y up, sheared into the iso picture) so a window, a sign or a row of bricks is an ordinary rounded rectangle there.
const HSL = new Map();
/** [h 0..360, s 0..1, l 0..1] of a #rrggbb colour (memoised). */
export function toHsl(c) {
  let v = HSL.get(c); if (v) return v;
  const [R, G, B] = rgb(c), r = R / 255, g = G / 255, b = B / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dl = mx - mn;
  let h = 0, s = 0;
  if (dl > 1e-9) { s = dl / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / dl + 6) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4; h *= 60; }
  v = Object.freeze([h, s, l]); if (HSL.size > 3000) HSL.clear(); HSL.set(c, v); return v;
}
/** #rrggbb of an hsl triple. */
export function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return hex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
/** The hue `deg` degrees closer to `to` along the shorter way round the wheel. */
const hueToward = (h, to, deg) => { const d = ((to - h + 540) % 360) - 180; return h + Math.sign(d) * Math.min(Math.abs(d), deg); };
const RAMPS = new Map();
/**
 * The five-stop ramp of a body colour `c` (rule 2.1): hi (sun-struck: lifted and warmed), light, mid (c itself), shade (a lightness 0.15 down, 14 degrees towards violet-blue, saturation 5 points up) and deep (twice that).
 * Frozen and shared.
 */
export function rampOf(c) {
  let r = RAMPS.get(c); if (r) return r;
  const [h, s, l] = toHsl(c);
  r = Object.freeze({
    hi: mix(fromHsl(hueToward(h, 55, 7), s, Math.min(0.97, l + 0.1)), '#fff7dc', 0.18), light: fromHsl(hueToward(h, 55, 4), s, Math.min(0.96, l + 0.045)), mid: c,
    shade: fromHsl(hueToward(h, 255, 14), Math.min(1, s + 0.05), Math.max(0.05, l - 0.15)), deep: fromHsl(hueToward(h, 255, 28), Math.min(1, s + 0.08), Math.max(0.04, l - 0.30)),
  });
  if (RAMPS.size > 3000) RAMPS.clear(); RAMPS.set(c, r); return r;
}
const TOYS = new Map();
/**
 * The three face colours of a toy prism of body colour `c`: the top is the colour lifted towards warm cream, the sun side (left) is the colour a little eased, the shade side (right) is the ramp's shade pulled
 * a touch towards violet. The steps are what makes a pastel read as a solid (the luma falls at least 6% from the top to the sun side and at least 14% from the sun side to the shade side for every plaster,
 * tile, brick, metal and toy colour: tests/world-buildings.test.mjs). Same shape as faceTone: { t, l, r }, frozen and shared.
 */
export function toyTone(c) {
  let v = TOYS.get(c); if (v) return v;
  const [h, s, l] = toHsl(c);
  const top = mix(fromHsl(hueToward(h, 55, 5), s, Math.min(0.97, l + (l > 0.7 ? 0.05 : 0.085))), '#fff6d8', 0.12), left = fromHsl(hueToward(h, 55, 2), s, l > 0.9 ? l - 0.115 : l > 0.7 ? l - 0.08 : l - 0.025);
  const warm = clamp(1 - Math.abs(h - 42) / 36, 0, 1); // a yellow or an orange would shade towards red: it takes more violet, so a cream wall's shade side is a lilac-tinged cream and not an orange one
  const right = mix(fromHsl(hueToward(h, 255, 12), s > 0.8 ? s - 0.06 : Math.min(1, s + 0.02 - 0.12 * warm), Math.max(0.05, l - (l > 0.7 ? 0.2 : 0.15))), '#6a58b8', 0.15 + 0.2 * warm);
  v = Object.freeze({ t: top, l: left, r: right }); if (TOYS.size > 3000) TOYS.clear(); TOYS.set(c, v); return v;
}


/** The corner radius of a toy prism with footprint w x d tiles in world pixels: a seventh of the shorter side, 3.5 to 14 (a house of two and a half tiles has a 12 pixel fillet: you see it as round, not as a bevelled edge). */
export const toyRadius = (w, d) => clamp(Math.min(w, d) * EDGE_WPX * 0.13, 3.5, 14);

/** The tone-on-tone contour colour of a fill (art direction 3: a darker, more violet version of the fill, never black). */
export const contourOf = (c) => mix(rampOf(c).deep, '#4a3f88', 0.25);

const rgba = (c, a) => { const [r, g, b] = rgb(c); return `rgba(${r},${g},${b},${a})`; };
/** The tangent points of the corner at p1 (edges to p0 and p2) rounded to radius r, as roundedPoly takes them: { s on the edge to p0, e on the edge to p2 } (both p1 when the corner is too small to round). */
function cornerOf(p0, p1, p2, r) {
  const ax = p0[0] - p1[0], ay = p0[1] - p1[1], bx = p2[0] - p1[0], by = p2[1] - p1[1], la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
  const cos = clamp((ax * bx + ay * by) / (la * lb), -1, 1), half = Math.acos(cos) / 2, t = half > 1e-3 && half < Math.PI / 2 - 1e-3 ? Math.min(r / Math.tan(half), la / 2, lb / 2) : 0;
  return t > 0.01 ? { s: [p1[0] + (ax / la) * t, p1[1] + (ay / la) * t], e: [p1[0] + (bx / lb) * t, p1[1] + (by / lb) * t], v: p1 } : { s: p1, e: p1, v: p1 };
}
/** Split a rounded corner at the line from its vertex towards `inner`: the point where the curve crosses it, and the control points of the two halves ({ m, q1 (first half), q2 (second half) }). */
function splitCorner(k, inner) {
  const { s, e, v } = k, ux = inner[0] - v[0], uy = inner[1] - v[1], ci = (s[0] - v[0]) * uy - (s[1] - v[1]) * ux, co = (e[0] - v[0]) * uy - (e[1] - v[1]) * ux;
  if (Math.abs(ci) < 1e-9 || Math.abs(co) < 1e-9 || ci * co > 0) return { m: v, q1: v, q2: v };
  const t = 1 / (1 + Math.sqrt(-co / ci)), u = 1 - t;
  return { m: [u * u * s[0] + 2 * t * u * v[0] + t * t * e[0], u * u * s[1] + 2 * t * u * v[1] + t * t * e[1]], q1: [s[0] + (v[0] - s[0]) * t, s[1] + (v[1] - s[1]) * t], q2: [v[0] + (e[0] - v[0]) * t, v[1] + (e[1] - v[1]) * t] };
}
/**
 * A toy prism: the chunky, glossy box the buildings stand on. Standing on [gx, gx + w] x [gy, gy + d], `h` high from elevation o.z, body colour `c`; faces in toyTone(c) (or o.tone), with the silhouette's corners rounded by `r`
 * (toyRadius): each face is a path of its own whose outer corners follow the rounded outline (a corner that two faces share is split where its curve meets their common edge), so NO CLIP is used: a path clip makes every
 * later draw in a software canvas cost half a millisecond, and a house is a hundred draws. The finish is cartoon-solid: the sun side has light over its top third and a darker foot, the shade side a cool top and a warm bounce
 * light over its lowest fifth (gloss 0.6 and over; a slab goes without), a fillet strip down the front corner shaded like a cylinder, a chamfer band along both front top edges with the sun's streak on the lit one, ambient
 * occlusion at the foot of both walls, and (o.contour, in world pixels) a tone-on-tone contour round the silhouette. The seams between the faces are covered by those bands. Returns { left, right, top, r, sil } exactly as
 * roundedBox does (the faces are box()'s, so hit shapes and wall grids are unchanged); left.ins and right.ins say how far in from each end a wall's own painting must stay to keep inside the rounded outline.
 * o: { z, r, tone, contour (0 = none), rim: false, ao: false, edge: false, gloss (1) }.
 */
export function toyBox(ctx, gx, gy, w, d, h, c, o = {}) {
  const tone = o.tone || toyTone(c), r = o.r ?? toyRadius(w, d), z0 = o.z || 0, z1 = z0 + h, gl = o.gloss ?? 1;
  const A = P(gx, gy, z1), B = P(gx + w, gy, z1), C = P(gx + w, gy + d, z1), D = P(gx, gy + d, z1), B0 = P(gx + w, gy, z0), C0 = P(gx + w, gy + d, z0), D0 = P(gx, gy + d, z0);
  const sil = [D0, C0, B0, B, A, D], prevAlpha = ctx.globalAlpha, fine = Math.min(r, h * 0.45), glossy = gl >= 0.6;
  const kD0 = cornerOf(D, D0, C0, r), kC0 = cornerOf(D0, C0, B0, r), kB0 = cornerOf(C0, B0, B, r), kB = cornerOf(B0, B, A, r), kA = cornerOf(B, A, D, r), kD = cornerOf(A, D, D0, r);
  const sC0 = splitCorner(kC0, C), sB = splitCorner(kB, C), sD = splitCorner(kD, C);
  // the three faces, each a path of its own along the rounded outline and the straight inner edges
  const left = () => { ctx.beginPath(); ctx.moveTo(sD.m[0], sD.m[1]); ctx.quadraticCurveTo(sD.q2[0], sD.q2[1], kD.e[0], kD.e[1]); ctx.lineTo(kD0.s[0], kD0.s[1]); ctx.quadraticCurveTo(D0[0], D0[1], kD0.e[0], kD0.e[1]); ctx.lineTo(kC0.s[0], kC0.s[1]); ctx.quadraticCurveTo(sC0.q1[0], sC0.q1[1], sC0.m[0], sC0.m[1]); ctx.lineTo(C[0], C[1]); ctx.closePath(); };
  const right = () => { ctx.beginPath(); ctx.moveTo(sC0.m[0], sC0.m[1]); ctx.quadraticCurveTo(sC0.q2[0], sC0.q2[1], kC0.e[0], kC0.e[1]); ctx.lineTo(kB0.s[0], kB0.s[1]); ctx.quadraticCurveTo(B0[0], B0[1], kB0.e[0], kB0.e[1]); ctx.lineTo(kB.s[0], kB.s[1]); ctx.quadraticCurveTo(sB.q1[0], sB.q1[1], sB.m[0], sB.m[1]); ctx.lineTo(C[0], C[1]); ctx.closePath(); };
  const top = () => { ctx.beginPath(); ctx.moveTo(sB.m[0], sB.m[1]); ctx.quadraticCurveTo(sB.q2[0], sB.q2[1], kB.e[0], kB.e[1]); ctx.lineTo(kA.s[0], kA.s[1]); ctx.quadraticCurveTo(A[0], A[1], kA.e[0], kA.e[1]); ctx.lineTo(kD.s[0], kD.s[1]); ctx.quadraticCurveTo(sD.q1[0], sD.q1[1], sD.m[0], sD.m[1]); ctx.lineTo(C[0], C[1]); ctx.closePath(); };
  right(); ctx.fillStyle = tone.r; ctx.fill();
  if (glossy) { const gr = ctx.createLinearGradient(0, Math.min(C[1], B[1]), 0, Math.max(C0[1], B0[1])); gr.addColorStop(0, rgba('#9fb4ff', 0.10 * gl)); gr.addColorStop(0.3, rgba('#9fb4ff', 0)); gr.addColorStop(0.74, rgba('#ffd7a0', 0)); gr.addColorStop(1, rgba('#ffd7a0', 0.2 * gl)); ctx.fillStyle = gr; ctx.fill(); }
  left(); ctx.fillStyle = tone.l; ctx.fill();
  if (glossy) { const gl2 = ctx.createLinearGradient(0, Math.min(D[1], C[1]), 0, Math.max(D0[1], C0[1])); gl2.addColorStop(0, rgba('#fff4d0', 0.30 * gl)); gl2.addColorStop(0.28, rgba('#fff4d0', 0.04 * gl)); gl2.addColorStop(0.6, rgba('#fff4d0', 0)); gl2.addColorStop(0.86, rgba('#5c4c96', 0)); gl2.addColorStop(1, rgba('#5c4c96', 0.16 * gl)); ctx.fillStyle = gl2; ctx.fill(); }
  top(); ctx.fillStyle = tone.t; ctx.fill();
  if (glossy && w * d > 1.5) { const gt = ctx.createLinearGradient(A[0], A[1], C[0], C[1]); gt.addColorStop(0, rgba('#ffffff', 0.16 * gl)); gt.addColorStop(0.55, rgba('#ffffff', 0)); gt.addColorStop(1, rgba('#7a68c8', 0.07 * gl)); ctx.fillStyle = gt; ctx.fill(); }
  if (o.edge !== false && h >= 8) { // the front vertical edge: a strip across the corner shaded like a cylinder (lit side, a streak of sky light, then the shade)
    const k = fine * 1.0, g = ctx.createLinearGradient(C[0] - k, 0, C[0] + k, 0);
    g.addColorStop(0, tone.l); g.addColorStop(0.34, mix(tone.t, tone.l, 0.35)); g.addColorStop(0.62, mix(tone.l, tone.r, 0.5)); g.addColorStop(1, tone.r);
    ctx.fillStyle = g; ctx.fillRect(C[0] - k, C[1] + fine * 0.4, 2 * k, C0[1] - C[1] - fine * 0.9);
  }
  // the bands are filled quads along the edges, shortened where an edge meets a rounded silhouette corner (a band that ran into the curve would stick out of it)
  const E = r * 0.8, along = (p0, p1, e0, e1) => { const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1; return [[p0[0] + (dx / l) * e0, p0[1] + (dy / l) * e0], [p1[0] - (dx / l) * e1, p1[1] - (dy / l) * e1]]; };
  const band = (p0, p1, e0, e1, th, dy, col, al) => { const [a, b] = along(p0, p1, e0, e1); th = Math.max(1.5, th); ctx.globalAlpha = prevAlpha * al; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(a[0], a[1] + dy - th / 2); ctx.lineTo(b[0], b[1] + dy - th / 2); ctx.lineTo(b[0], b[1] + dy + th / 2); ctx.lineTo(a[0], a[1] + dy + th / 2); ctx.closePath(); ctx.fill(); };
  if (o.rim !== false) {
    band(D, C, E * 0.6, 0, fine * 1.5, 0, mix(tone.t, tone.l, 0.55), 1); band(C, B, 0, E * 0.6, fine * 1.5, 0, mix(tone.t, tone.r, 0.5), 1);
    band(D, C, E, 0, fine * 0.55, -fine * 0.45, LIGHT.rim, 0.7); band(C, B, 0, E, fine * 0.55, -fine * 0.45, LIGHT.rim, 0.32); band(A, D, E, E, fine * 0.9, 0, LIGHT.rim, 0.55);
  }
  if (o.ao !== false && h >= 8) { // the foot of both walls: ambient occlusion where a wall meets the ground
    band(D0, C0, E, E * 0.6, fine * 2.2, -fine * 1.1, LIGHT.ao, 0.16); band(C0, B0, E * 0.6, E, fine * 2.2, -fine * 1.1, LIGHT.ao, 0.16); band(D0, C0, E, E * 0.6, fine, -fine * 0.5, LIGHT.ao, 0.22); band(C0, B0, E * 0.6, E, fine, -fine * 0.5, LIGHT.ao, 0.22);
  }
  ctx.globalAlpha = prevAlpha;
  if (o.contour > 0) { ctx.save(); roundedPoly(ctx, sil, r); ctx.lineJoin = 'round'; ctx.strokeStyle = contourOf(c); ctx.lineWidth = Math.max(1.5, o.contour); ctx.globalAlpha = prevAlpha * (o.contourAlpha ?? 0.5); ctx.stroke(); ctx.restore(); }
  const L = [D0, C0, C, D], Rr = [C0, B0, B, C]; L.ins = [r * 0.5, 0]; Rr.ins = [0, r * 0.5];
  return { left: L, right: Rr, top: [A, B, C, D], r, sil };
}

// ---------------------------------------------------------------- a wall in its own elevation
/**
 * The frame of a wall face ([bottom-left, bottom-right, top-right, top-left], as box() returns them): its width in screen pixels, its height, and the slope of its foot. A wall is a sheared rectangle (its
 * verticals are vertical), so one transform paints a plain elevation onto it.
 */
export function wallOf(f) { const W = f[1][0] - f[0][0]; return { x0: f[0][0], y0: f[0][1], k: (f[1][1] - f[0][1]) / W, W, H: f[0][1] - f[3][1], ins: f.ins || [0, 0] }; }
/** Run `fn(ctx, W, H)` with the context set to the wall's elevation: x runs along the wall from its left foot corner, y runs DOWN from the foot (so a point `up` pixels above the foot is y = -up). Balanced save and restore. */
export function onWall(ctx, wl, fn) { ctx.save(); ctx.transform(1, wl.k, 0, 1, wl.x0, wl.y0); fn(ctx, wl.W, wl.H); ctx.restore(); }
/** A rounded rectangle path at (x, y) w x h, corner radius r (a path only). */
export function rrect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
