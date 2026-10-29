// Isometric (2.5D) projection and the drawing primitives every scene is built from. Everything is Canvas 2D drawn from code: no images, no libraries.
// What it draws: flat diamonds, prisms (box), batched window grids, soft cast shadows, upright cylinders, trees, lamps, people.
// What it never does: read game state, touch the DOM, use Math.random (variation comes from the hash functions at the foot), or decide where anything stands.
// Grid coordinates (gx, gy) are tiles; gz is height in pixels. Screen x grows with gx - gy, screen y with gx + gy.
// Light: the sun stands to the upper left. Left faces are lit (0.8), right faces shaded (0.6), tops full; cast shadows run towards +gx (screen right and down).
import { FLAGS } from './stack.js';
export const TW = 64, TH = 32, HW = TW / 2, HH = TH / 2;
export const sx = (gx, gy) => (gx - gy) * HW;
export const sy = (gx, gy, gz = 0) => (gx + gy) * HH - gz;
export const P = (gx, gy, gz = 0) => [sx(gx, gy), sy(gx, gy, gz)];
export const toGrid = (x, y, gz = 0) => { const a = x / HW, b = (y + gz) / HH; return [(a + b) / 2, (b - a) / 2]; };

// ---------------------------------------------------------------- colour helpers (hex only, 6 digits)
// Every helper is memoised in a small bounded table: a frame asks for the same few hundred colours thousands of times, and building the strings was most of
// what colouring cost. Tables are cleared when they grow past their cap, so layout-time calls with endless distinct factors cannot bloat memory.
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
const byte = (v) => HEX[Math.round(v < 0 ? 0 : v > 255 ? 255 : v) || 0];
const nest = (map, a, cap = 2000) => { let m = map.get(a); if (m === undefined) { if (map.size > cap) map.clear(); m = new Map(); map.set(a, m); } return m; };
const rgbMemo = new Map();
export const rgb = (h) => { let v = rgbMemo.get(h); if (v === undefined) { const n = parseInt(h.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; if (rgbMemo.size > 4000) rgbMemo.clear(); rgbMemo.set(h, v); } return v; };
export const hex = (r, g, b) => '#' + byte(r) + byte(g) + byte(b);
const shadeMemo = new Map();
export const shade = (h, f) => {
  const m = nest(shadeMemo, h); let v = m.get(f);
  if (v === undefined) { const [r, g, b] = rgb(h); v = hex(r * f, g * f, b * f); if (m.size > 48) m.clear(); m.set(f, v); }
  return v;
};
const mixMemo = new Map();
export const mix = (a, b, t) => {
  const m = nest(nest(mixMemo, a), b, 64); let v = m.get(t);
  if (v === undefined) { const x = rgb(a), y = rgb(b); v = hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); if (m.size > 48) m.clear(); m.set(t, v); }
  return v;
};
const toneMemo = new Map();
/** A prism's three face colours from its top colour: top as given, left face 0.8 (lit), right face 0.6 (shaded). The result is shared: never change it. */
export const tone = (h) => {
  let v = toneMemo.get(h);
  if (v === undefined) { v = Object.freeze({ t: h, l: shade(h, 0.8), r: shade(h, 0.6) }); if (toneMemo.size > 3000) toneMemo.clear(); toneMemo.set(h, v); }
  return v;
};
export const gray = (h) => { const [r, g, b] = rgb(h), y = 0.3 * r + 0.59 * g + 0.11 * b; return hex(y, y, y); };
const fogMemo = new Map();
let veilFn = null;
/** (T2's hook, the one line this frozen module takes: docs/RENDER_PLAN.md section 8, T5 item 10) While the `clouds` layer is flagged v2, a colour under cloud is `veiled`, never darkened: palette.js hands its veil over here when it loads. */
export const setVeil = (fn) => { veilFn = fn; };
/** Fogged colour: desaturated and darkened by k (0 = untouched, 1 = a locked district). */
export const fogged = (h, k) => {
  if (!(k > 0.01)) return h;
  if (veilFn !== null && FLAGS.clouds === 'v2') return veilFn(h, k);
  const m = nest(fogMemo, h); let v = m.get(k);
  if (v === undefined) { v = mix(mix(h, gray(h), Math.min(1, k * 1.5)), '#121826', k * 0.5); if (m.size > 48) m.clear(); m.set(k, v); }
  return v;
};
/** Is a hex colour dark? (decides whether a district reads as night-like ground). */
export const luma = (h) => { const [r, g, b] = rgb(h); return (0.3 * r + 0.59 * g + 0.11 * b) / 255; };
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// A black or white veil at 0..1 strength, as a ready-made string (no string building while drawing).
const veils = (rgbs) => Array.from({ length: 101 }, (_, i) => `rgba(${rgbs},${(i / 100).toFixed(2)})`);
const INK = veils('8,10,20'), SNOW = veils('255,255,255'), SOOT = veils('0,0,0');
export const inkA = (a) => INK[Math.max(0, Math.min(100, Math.round(a * 100)))];
export const snowA = (a) => SNOW[Math.max(0, Math.min(100, Math.round(a * 100)))];
export const sootA = (a) => SOOT[Math.max(0, Math.min(100, Math.round(a * 100)))];

// ---------------------------------------------------------------- flat shapes
export function quad(ctx, pts, fill, stroke, lw = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
/** Four points given as plain numbers (no arrays): the allocation-free path for hot loops. */
export function quadN(ctx, ax, ay, bx, by, cx, cy, dx, dy, fill) {
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
}

/** Flat diamond on the ground (or at height z) covering [gx, gx+w] x [gy, gy+d]. */
export function diamond(ctx, gx, gy, w, d, fill, stroke, z = 0, lw = 1) {
  quad(ctx, [P(gx, gy, z), P(gx + w, gy, z), P(gx + w, gy + d, z), P(gx, gy + d, z)], fill, stroke, lw);
}

/** Solid prism. c = tone(); returns the corner points so callers can add windows or roofs. */
export function box(ctx, gx, gy, w, d, h, c, o = {}) {
  const z0 = o.z || 0, z1 = z0 + h;
  const A = P(gx, gy, z1), B = P(gx + w, gy, z1), C = P(gx + w, gy + d, z1), D = P(gx, gy + d, z1);
  const B0 = P(gx + w, gy, z0), C0 = P(gx + w, gy + d, z0), D0 = P(gx, gy + d, z0);
  // the silhouette first (DIAGNOSIS S1): the three faces share edges, and where two anti-aliased faces meet the pixel gets 0.5 + 0.5 x 0.5 of coverage, so a quarter of what is behind shows as a hairline. A hexagon in the
  // lit face's colour under them leaves nothing to show through (the seam pixel is a blend of two faces and the underlay, never of the ground)
  ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(B0[0], B0[1]); ctx.lineTo(C0[0], C0[1]); ctx.lineTo(D0[0], D0[1]); ctx.lineTo(D[0], D[1]); ctx.closePath(); ctx.fillStyle = c.l; ctx.fill();
  quad(ctx, [D, C, C0, D0], c.l, o.line);
  quad(ctx, [C, B, B0, C0], c.r, o.line);
  quad(ctx, [A, B, C, D], c.t, o.line);
  return { left: [D0, C0, C, D], right: [C0, B0, B, C], top: [A, B, C, D] };
}

/** The point at (u, v) on a face (bottom-left, bottom-right, top-right, top-left): u along its width, v up its height, both 0..1. */
export const facePoint = (f, u, v) => {
  const bx = f[0][0] + (f[1][0] - f[0][0]) * u, by = f[0][1] + (f[1][1] - f[0][1]) * u, tx = f[3][0] + (f[2][0] - f[3][0]) * u, ty = f[3][1] + (f[2][1] - f[3][1]) * u;
  return [bx + (tx - bx) * v, by + (ty - by) * v];
};

/**
 * Grid of windows on a face (bottom-left, bottom-right, top-right, top-left). Each window is lit or dark by a fixed pattern (so a building never shimmers);
 * `lit` (0..1+) is how much of the pattern is on, and windows just under the threshold glow half way, so evening comes on window by window.
 * All windows of a kind go into ONE path (a tower is four fills, not eighty). o = { fine: false skips the glass glints and sills (small or far views),
 * skipDark: true draws only the lit panes (the dark ones are already in a cached body underneath: a rack's blinking lights) }.
 */
export function windows(ctx, f, cols, rows, fill, lit = 0, pad = 0.12, litCol = '#ffd98a', phase = 0, o) {
  const cw = (1 - pad * 2) / cols, rh = (1 - pad * 2) / rows, fine = !o || o.fine !== false;
  const x0 = f[0][0], y0 = f[0][1], dx = f[1][0] - x0, dy = f[1][1] - y0, hx = f[3][0] - x0, hy = f[3][1] - y0; // a face is the parallelogram x0,y0 + u*(dx,dy) + v*(hx,hy)
  let dark = false, half = false, full = false, glint = false;
  const pass = (kind) => { // kind 0 = dark, 1 = half lit, 2 = fully lit
    ctx.beginPath(); let any = false;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const rank = ((i * 7 + j * 13 + cols + phase) % 5) / 5, on = lit > 0 && rank < lit, k = !on ? 0 : rank + 0.12 < lit ? 2 : 1;
      if (k !== kind) continue;
      const u0 = pad + i * cw + cw * 0.18, u1 = pad + (i + 1) * cw - cw * 0.18, v0 = pad + j * rh + rh * 0.2, v1 = pad + (j + 1) * rh - rh * 0.2;
      ctx.moveTo(x0 + dx * u0 + hx * v0, y0 + dy * u0 + hy * v0); ctx.lineTo(x0 + dx * u1 + hx * v0, y0 + dy * u1 + hy * v0);
      ctx.lineTo(x0 + dx * u1 + hx * v1, y0 + dy * u1 + hy * v1); ctx.lineTo(x0 + dx * u0 + hx * v1, y0 + dy * u0 + hy * v1); ctx.closePath(); any = true;
    }
    return any;
  };
  const skipDark = !!(o && o.skipDark);
  if (!skipDark && pass(0)) { ctx.fillStyle = fill; ctx.fill(); dark = true; }
  if (lit > 0) {
    if (pass(1)) { ctx.fillStyle = mix(fill, litCol, 0.55); ctx.fill(); half = true; }
    if (pass(2)) { ctx.fillStyle = litCol; ctx.fill(); full = true; }
  }
  if (fine && dark) { // glass: a bright hairline along the top-left of each dark pane and a sill line under it
    ctx.beginPath();
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const rank = ((i * 7 + j * 13 + cols + phase) % 5) / 5; if (lit > 0 && rank < lit) continue;
      const u0 = pad + i * cw + cw * 0.18, u1 = pad + (i + 1) * cw - cw * 0.18, v0 = pad + j * rh + rh * 0.2, v1 = pad + (j + 1) * rh - rh * 0.2;
      ctx.moveTo(x0 + dx * u0 + hx * v0, y0 + dy * u0 + hy * v0 - 0.5); ctx.lineTo(x0 + dx * u0 + hx * v1, y0 + dy * u0 + hy * v1);
      ctx.lineTo(x0 + dx * (u0 + (u1 - u0) * 0.55) + hx * v1, y0 + dy * (u0 + (u1 - u0) * 0.55) + hy * v1); glint = true;
    }
    if (glint) { ctx.strokeStyle = 'rgba(190,225,255,.32)'; ctx.lineWidth = 0.8; ctx.stroke(); }
  }
  return dark || half || full;
}

// ---------------------------------------------------------------- shadows
/**
 * Cast shadow: the footprint swept away from the sun (upper left). Sweeping a diamond along a grid axis is again a diamond, so this is one analytic quad
 * (it used to be a convex hull sorted at every call). Two layers, a wide faint one under a tight dark one, give it a soft edge. h = the object's height in pixels.
 */
export function shadow(ctx, gx, gy, w, d, h, alpha = 0.28) {
  const L = h * 0.55 / HW;
  diamond(ctx, gx - 0.06, gy - 0.1, w + L + 0.16, d + 0.2, inkA(alpha * 0.4));
  diamond(ctx, gx, gy, w + L, d, inkA(alpha * 0.65));
}
/** A soft round contact shadow under something small (a person, a barrel): a faint wide ellipse under a darker narrow one, nudged away from the sun. */
export function blob(ctx, x, y, rx, ry, alpha = 0.3) {
  ellipse(ctx, x + rx * 0.22, y, rx * 1.18, ry * 1.2, inkA(alpha * 0.4));
  ellipse(ctx, x + rx * 0.22, y, rx * 0.86, ry * 0.88, inkA(alpha * 0.65));
}

export function ellipse(ctx, x, y, rx, ry, fill, stroke, lw = 1) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

// ---------------------------------------------------------------- cylinders
// A cylinder's shading gradient is the same for every tank of one colour and radius, so it is built once in local space (x from -rx to rx) and the
// drawing is shifted under it; creating a gradient and its stops at every draw was the dearest line of the old tank.
const GRADS = new WeakMap();
function cylGrad(ctx, c, rx) {
  let by = GRADS.get(c); if (!by) { by = new Map(); GRADS.set(c, by); }
  const k = Math.round(rx * 4); let g = by.get(k);
  if (!g) {
    g = ctx.createLinearGradient(-rx, 0, rx, 0);
    g.addColorStop(0, c.l); g.addColorStop(0.18, mix(c.t, '#ffffff', 0.1)); g.addColorStop(0.42, c.t); g.addColorStop(0.78, c.r); g.addColorStop(1, shade(c.r, 0.82));
    if (by.size > 24) by.clear();
    by.set(k, g);
  }
  return g;
}
/** Upright cylinder (tank, barrel, tower): footprint circle at gx, gy with radius r in tiles. Shaded from the lit left to the dark right, with a highlight strip and a lit rim on the lid. */
export function cyl(ctx, gx, gy, r, h, c, z = 0) {
  const [x, y0] = P(gx, gy, z), rx = r * HW * 1.42, ry = r * HH * 1.42, y1 = y0 - h;
  ctx.save(); ctx.translate(x, 0);
  ctx.beginPath(); ctx.moveTo(-rx, y0); ctx.lineTo(-rx, y1); ctx.ellipse(0, y1, rx, ry, 0, Math.PI, 0, true); ctx.lineTo(rx, y0); ctx.ellipse(0, y0, rx, ry, 0, 0, Math.PI, false); ctx.closePath();
  ctx.fillStyle = cylGrad(ctx, c, rx); ctx.fill();
  if (h > 10 && rx > 3) { ctx.fillStyle = snowA(0.12); ctx.fillRect(-rx * 0.58, y1, Math.max(1, rx * 0.16), h); } // sheen strip
  ctx.restore();
  ellipse(ctx, x, y1, rx, ry, c.t);
  if (rx > 4) { ctx.beginPath(); ctx.ellipse(x, y1, rx - 0.5, ry - 0.3, 0, Math.PI * 0.95, Math.PI * 1.75); ctx.strokeStyle = snowA(0.28); ctx.lineWidth = 1; ctx.stroke(); }
}

// ---------------------------------------------------------------- small things
const TREE_LIGHT = snowA(0.1);
export function tree(ctx, gx, gy, s = 1, sway = 0, c = '#2f7d4b', z = 0) {
  const [x, y] = P(gx, gy, z), v = 0.92 + ((h2((gx * 8) | 0, (gy * 8) | 0) * 5) | 0) * 0.04; // every tree one of five greens
  blob(ctx, x + 5 * s, y + 2, 13 * s, 5.5 * s, 0.3);
  ctx.fillStyle = '#6b4a2c'; ctx.fillRect(x - 2 * s, y - 14 * s, 4 * s, 14 * s);
  const cv = v === 1 ? c : shade(c, v);
  for (let i = 0; i < 3; i++) {
    const w = (17 - i * 4) * s, yy = y - (16 + i * 9) * s, ax = x + sway * (i + 1) * 0.5, ay = yy - 14 * s;
    quadN(ctx, ax, ay, x + w, yy, x - w, yy, ax, ay, i === 0 ? shade(cv, 0.78) : i === 1 ? cv : shade(cv, 1.18));
  }
  ctx.beginPath(); // the sunlit half of every tier, one fill
  for (let i = 0; i < 3; i++) { const w = (17 - i * 4) * s, yy = y - (16 + i * 9) * s; ctx.moveTo(x + sway * (i + 1) * 0.5, yy - 14 * s); ctx.lineTo(x, yy); ctx.lineTo(x - w, yy); ctx.closePath(); }
  ctx.fillStyle = TREE_LIGHT; ctx.fill();
}

export function lamp(ctx, gx, gy, glow = 0, z = 0) {
  const [x, y] = P(gx, gy, z);
  ellipse(ctx, x + 1, y, 3.4, 1.6, inkA(0.28));
  ctx.fillStyle = '#2b3342'; ctx.fillRect(x - 1.5, y - 30, 3, 30); ctx.fillRect(x - 5, y - 32, 10, 3);
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x - 1.5, y - 30, 1, 30);
  ellipse(ctx, x, y - 30, 3, 2, glow > 0.05 ? '#ffe9a8' : '#99a3b5');
}

/** A small person, feet at (x, y) in world pixels. look = {shirt, pants, hair, skin}. */
export function person(ctx, x, y, s, look, t = 0, moving = false, dir = 1) {
  const step = moving ? Math.sin(t / 110) * 3 * s : 0, bob = moving ? Math.abs(Math.sin(t / 110)) * 1.2 * s : Math.sin(t / 700) * 0.6 * s;
  blob(ctx, x, y + 1, 7 * s, 2.8 * s, 0.32);
  ctx.fillStyle = look.pants || '#27324a';
  ctx.fillRect(x - 4 * s + step * dir, y - 9 * s, 3 * s, 9 * s); ctx.fillRect(x + 1 * s - step * dir, y - 9 * s, 3 * s, 9 * s);
  ctx.fillStyle = look.shirt; ctx.fillRect(x - 5 * s, y - 20 * s - bob, 10 * s, 12 * s);
  ctx.fillStyle = shade(look.shirt, 0.72); ctx.fillRect(x + 2 * s, y - 20 * s - bob, 3 * s, 12 * s);
  ctx.fillStyle = look.skin || '#f1c27d'; ctx.fillRect(x - 4 * s, y - 28 * s - bob, 8 * s, 8 * s);
  ctx.fillStyle = look.hair || '#2b1b10'; ctx.fillRect(x - 4 * s, y - 29 * s - bob, 8 * s, 3 * s);
  ctx.fillStyle = '#10141c'; ctx.fillRect(x - 2.5 * s + dir * s, y - 25 * s - bob, 1.4 * s, 1.8 * s); ctx.fillRect(x + 1 * s + dir * s, y - 25 * s - bob, 1.4 * s, 1.8 * s);
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ---------------------------------------------------------------- deterministic randomness
export function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = Math.imul(n + (n << 3), 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
export const h2 = (a, b) => hash(a * 73856093 ^ b * 19349663);
export function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
