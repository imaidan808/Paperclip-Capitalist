// The parts the props, plants and people of the toy island are made of: round balls, chunky pills, fat posts, rounded drums, soft shadows and the colour rules that keep every part in the art direction's palette.
// Owner: T4 PROPS, NATURE AND CHARACTERS (docs/RENDER_PLAN.md). Pure drawing helpers over solids.js (T3), shadow.js (T2) and palette.js (T2); nothing here reads the game, the clock or Math.random.
// The rules every helper keeps (docs/ART_DIRECTION.md section 3): a part is a filled shape with a value step (a lit top-left, a cool shade lower-right), never a hairline; the thinnest thing drawn is 1.5 world
// pixels; a pole is 3.6 across; every cap is round; a colour that comes from the kits' old dark data is lifted into the toy range (lifted) and a colour under a locked district is veiled, never darkened (col).
import { P, mix, shade, clamp, luma, h2, facePoint } from './iso.js';
import { veiled, SKY, LIGHT, TOY, INK } from './palette.js';
import { puff } from './solids.js';
import { contactShadow, castShadow, stampSoft } from './shadow.js';
import { FOG_DIM } from './common.js';

export { contactShadow, castShadow, stampSoft, puff, P };
/** The face of every sign and label on the island: a round, friendly, bold sans. The lettering stays crisp (docs/ART_DIRECTION.md 4.1, board). */
export const FONT = '"Nunito","Varela Round","Arial Rounded MT Bold",ui-rounded,system-ui,sans-serif';
export const SQ = Math.SQRT2;

// ---------------------------------------------------------------- colour
const q = (v) => Math.round(v * 100) / 100;
/** A colour as this prop stands: veiled where its district is locked (a locked district is never darker than an open one), then touched by the thin warm air of the plateau it stands on. */
export function col(c, env) {
  let v = env && env.dim > 0.01 ? veiled(c, env.dim / FOG_DIM) : c;
  if (env && env.hz > 0.004) v = mix(v, SKY.horizon, q(Math.min(0.12, env.hz * 0.9)));
  return v;
}
const LIFT = new Map();
/** A colour of the kits' old dark data brought into the toy range: pastel, never under luma 0.6 (a colour that is already light is returned as it is). */
export function lifted(c, floor = 0.6) {
  const k = c + floor; let v = LIFT.get(k);
  if (v === undefined) { const l = luma(c), lw = luma('#fff3d6'); v = l >= floor ? c : mix(c, '#fff3d6', clamp((floor - l) / (lw - l) + 0.02, 0.1, 0.9)); LIFT.set(k, v); }
  return v;
}
const TOY_LIST = [TOY.red, TOY.orange, TOY.yellow, TOY.green, TOY.cyan, TOY.blue, TOY.violet, TOY.pink];
const NEAR = new Map();
/** The toy colour a data colour is nearest to (a barrel the kit calls '#3d6fb0' is TOY blue), by hue first: a dark red and a bright red are both red. */
export function toyOf(c) {
  let v = NEAR.get(c); if (v) return v;
  const n = parseInt(c.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx - mn < 22) v = mx > 150 ? '#fffaf0' : TOY.blue; // a grey is a cream or a blue, never a grey
  else { let best = 1e9; v = TOY.red; for (const t of TOY_LIST) { const m = parseInt(t.slice(1), 16), dr = r - ((m >> 16) & 255), dg = g - ((m >> 8) & 255), db = b - (m & 255), d = dr * dr * 0.9 + dg * dg * 1.2 + db * db; if (d < best) { best = d; v = t; } } }
  NEAR.set(c, v); return v;
}
/** The cool shade of a body colour: darker, pulled towards violet-blue (the shade side of a round thing). */
export const shd = (c) => mix(shade(c, 0.8), '#5a52a8', 0.2);
/** The sunlit tone of a body colour: towards warm cream. */
export const hi = (c, k = 0.5) => mix(c, '#fffbe6', k);
export const seedOf = (p) => (h2((p.gx * 13) | 0, (p.gy * 13) | 0) * 1e6) | 0;
/** One of four variants of a prop, from its own place: the few looks a kind may have, so that props that differ only in a hashed detail still share one sprite (atlas.js shared). */
export const vseed = (p) => (seedOf(p) >>> 5) & 3;
export const vs = (p) => vseed(p) * 7919 + 13;
/** A deterministic 0..1 for a prop and a slot. */
export const rnd = (p, i = 0) => h2(seedOf(p) + (i | 0) * 31, (i | 0) * 7 + 5);

// ---------------------------------------------------------------- shapes
/** Fill a rounded rectangle (x, y is its top-left). */
export function rr(ctx, x, y, w, h, r, fill) {
  r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
}
export function disc(ctx, x, y, rx, ry, fill) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
export function poly(ctx, pts, fill) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
/** A round-capped stroke (a limb, a post, a strut, a rung): at least 3 world pixels across. */
export function bar(ctx, x0, y0, x1, y1, w, fill) { ctx.lineCap = 'round'; ctx.strokeStyle = fill; ctx.lineWidth = Math.max(3, w); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.lineCap = 'butt'; }
/** A ball: a flat disc in `c` with a cool crescent lower right and a sunlit crescent upper left (three fills in a clip). */
export function ball(ctx, x, y, r, c) { puff(ctx, x, y, r, c, hi(c, 0.55), shd(c)); }
/** An ellipse with the same two crescents (a lens, a loaf, a lid). Two flat fills and a highlight, no clip. */
export function lens(ctx, x, y, rx, ry, c) {
  disc(ctx, x, y, rx, ry, shd(c)); disc(ctx, x - rx * 0.06, y - ry * 0.08, rx * 0.9, ry * 0.88, c);
  ctx.globalAlpha *= 0.55; disc(ctx, x - rx * 0.28, y - ry * 0.36, rx * 0.34, ry * 0.2, hi(c, 0.75)); ctx.globalAlpha /= 0.55;
}
/** A rounded block seen as one face: a pill/plate with a shade strip at its foot and a sunlit one on top (a slat, a plank, a panel). x, y is its top-left. */
export function slat(ctx, x, y, w, h, r, c) {
  rr(ctx, x, y, w, h, r, shd(c)); rr(ctx, x, y, w, Math.max(r * 1.2, h * 0.74), r, c);
  if (h > 3.2 && w > 4) { ctx.globalAlpha *= 0.5; rr(ctx, x + w * 0.1, y + h * 0.1, w * 0.8, Math.max(1.2, h * 0.16), 0.6, hi(c, 0.8)); ctx.globalAlpha /= 0.5; }
}

/** The faces of a prism exactly as iso.box() returns them ({ left, right, top }, each a polygon), without drawing: the hit shapes of the props that are clickable. */
export function facesOf(gx, gy, w, d, h, z = 0) {
  const z1 = z + h, A = P(gx, gy, z1), B = P(gx + w, gy, z1), C = P(gx + w, gy + d, z1), D = P(gx, gy + d, z1), B0 = P(gx + w, gy, z), C0 = P(gx + w, gy + d, z), D0 = P(gx, gy + d, z);
  return { left: [D0, C0, C, D], right: [C0, B0, B, C], top: [A, B, C, D] };
}

/**
 * A fat upright post: a tapered pillar of colour `c` (lit left strip, cool right strip) from (x, y) up `h`, `w` across at the foot, 10% less at the top, capped by a ball of radius 0.62 w when `cap`.
 * Never under 3.6 across (docs/ART_DIRECTION.md 3.1: a 1 px post is a fault).
 */
export function post(ctx, x, y, h, w, c, cap = true) {
  w = Math.max(3.6, w); const wt = w * 0.9, top = y - h;
  poly(ctx, [[x - w / 2, y], [x + w / 2, y], [x + wt / 2, top], [x - wt / 2, top]], shd(c));
  poly(ctx, [[x - w / 2, y], [x + w * 0.16, y], [x + wt * 0.16, top], [x - wt / 2, top]], c);
  ctx.globalAlpha *= 0.55; poly(ctx, [[x - w * 0.38, y - 1], [x - w * 0.18, y - 1], [x - wt * 0.18, top + 1], [x - wt * 0.38, top + 1]], hi(c, 0.8)); ctx.globalAlpha /= 0.55;
  if (cap) ball(ctx, x, top - w * 0.1, w * 0.62, c);
}

/**
 * A rounded drum (a barrel, a tank, a silo, a bollard): foot ellipse centre (x, y), screen radius rx (the iso ellipse is rx x rx/2), height h. The side runs lit to shaded through five tones, the lid is
 * a lit ellipse with a ring, and `ribs` raised bands run round it. `dome` raises a rounded lid of that height. Gradient built per call: use it in a sprite body.
 */
export function drum(ctx, x, y, rx, h, c, o = {}) {
  const ry = rx * 0.5, top = y - h, t = mix(c, '#fff7dc', 0.18), l = mix(shade(c, 0.9), '#ffd9a8', 0.05), r = mix(shade(c, 0.66), '#5a52a8', 0.2);
  const g = ctx.createLinearGradient(x - rx, 0, x + rx, 0); g.addColorStop(0, l); g.addColorStop(0.2, mix(t, l, 0.35)); g.addColorStop(0.42, c); g.addColorStop(0.78, mix(c, r, 0.55)); g.addColorStop(1, r);
  ctx.beginPath(); ctx.moveTo(x - rx, y); ctx.lineTo(x - rx, top); ctx.lineTo(x + rx, top); ctx.lineTo(x + rx, y); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI, false); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
  if (o.ribs) for (const k of o.ribs) { const yy = y - h * k, bw = Math.max(1.8, h * 0.09); ctx.beginPath(); ctx.ellipse(x, yy, rx, ry, 0, 0.02, Math.PI - 0.02, false); ctx.strokeStyle = o.ribCol || shade(c, 0.78); ctx.lineWidth = bw; ctx.stroke(); ctx.beginPath(); ctx.ellipse(x, yy - bw * 0.7, rx, ry, 0, 0.3, Math.PI - 0.5, false); ctx.strokeStyle = hi(c, 0.45); ctx.globalAlpha *= 0.55; ctx.lineWidth = Math.max(1.5, bw * 0.45); ctx.stroke(); ctx.globalAlpha /= 0.55; }
  if (o.dome) { // a rounded lid: half an ellipse above the rim
    const dh = o.dome; ctx.beginPath(); ctx.ellipse(x, top, rx, dh, 0, Math.PI, 0, false); ctx.lineTo(x + rx, top); ctx.ellipse(x, top, rx, ry, 0, 0, Math.PI, false); ctx.lineTo(x - rx, top); ctx.closePath(); ctx.fillStyle = o.domeCol || t; ctx.fill();
    ctx.globalAlpha *= 0.55; ctx.beginPath(); ctx.ellipse(x - rx * 0.32, top - dh * 0.55, rx * 0.34, dh * 0.3, -0.5, 0, Math.PI * 2); ctx.fillStyle = hi(o.domeCol || t, 0.85); ctx.fill(); ctx.globalAlpha /= 0.55;
  } else {
    disc(ctx, x, top, rx, ry, shade(c, 0.74)); disc(ctx, x, top, rx * 0.93, ry * 0.9, t); disc(ctx, x + rx * 0.05, top + ry * 0.06, rx * 0.72, ry * 0.68, mix(t, c, 0.35));
    ctx.globalAlpha *= 0.5; ctx.beginPath(); ctx.ellipse(x, top, rx * 0.93, ry * 0.9, 0, Math.PI * 1.05, Math.PI * 1.62, false); ctx.strokeStyle = '#fffbe6'; ctx.lineWidth = Math.max(1.5, rx * 0.1); ctx.stroke(); ctx.globalAlpha /= 0.5;
  }
}

/** Fill a rectangle laid on a face of a prism (the faces facesOf and roundedBox return): u along its width, v up its height, both 0..1, with the face's own skew. */
export function fq(ctx, F, u0, u1, v0, v1, fill) {
  const a = facePoint(F, u0, v0), b = facePoint(F, u1, v0), c = facePoint(F, u1, v1), d = facePoint(F, u0, v1);
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
export { facePoint };
/** A soft contact patch under a thing that stands (a narrow dark ellipse and a wide pale one, pushed away from the sun) at a foot point. */
export const stand = (ctx, x, y, rx, ry = rx * 0.5) => contactShadow(ctx, x, y, rx, ry);

/** Lettering on a surface: a round bold face in `fill`, optionally on a flat plate. (x, y) is the middle of the text; `skew` is the iso slope of the face (+0.5 on a left face, -0.5 on a right one). */
export function lettering(ctx, text, x, y, size, fill, skew = 0.5, plate) {
  ctx.save(); ctx.translate(x, y); ctx.transform(1, skew, 0, 1, 0, 0); ctx.font = `800 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (plate) { const w = ctx.measureText(text).width + size * 0.9; rr(ctx, -w / 2, -size * 0.7, w, size * 1.4, size * 0.5, plate); }
  ctx.fillStyle = fill; ctx.fillText(text, 0, size * 0.04); ctx.restore();
}
/** Is the picture a close one (the closest band of the ladder is at least `at` in)? Reads only the record the engine publishes, so a sprite body (which sees no lod) answers false and a live part answers truly. */
export const near = (env, i = 2) => (env && env.lod ? env.lod.detail[i] : 0);
export { LIGHT, INK, clamp, mix, shade, luma };
