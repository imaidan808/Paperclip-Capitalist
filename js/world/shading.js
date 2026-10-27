// What makes a flat prism read as a lit solid: sky-lit tops, occluded bases, rim light on the edges the sun catches, material texture (brick, glass, metal,
// plaster, boards), contact shadow, and the thin blue haze that pales high ground. Built on iso.js's box(); props.js and kits call these, nothing else does.
// What it never does: move or resize anything (every effect stays inside the faces it is given), read game state, or use Math.random (texture comes from hashes).
// The sun is at the upper left: left faces are lit, right faces shaded, cast shadows run towards +gx (see iso.js).
import { box, diamond, quadN, facePoint, mix, snowA, sootA, inkA, h2, clamp } from './iso.js';

/** The air colour distant or high things fade towards. */
export const HAZE = '#a9c3e0';
/** How hazy a prop on ground z pixels high is, 0..0.09: a plateau 100 px up wears a thin blue veil, the shore none to speak of. */
export const hazeAt = (z) => 0.01 + 0.075 * clamp(z / 100, 0, 1);

const CLEAR = 'rgba(255,255,255,0)', CLEAR_DARK = 'rgba(0,0,0,0)';

// ---------------------------------------------------------------- face effects
const facePath = (ctx, f) => { ctx.beginPath(); ctx.moveTo(f[0][0], f[0][1]); ctx.lineTo(f[1][0], f[1][1]); ctx.lineTo(f[2][0], f[2][1]); ctx.lineTo(f[3][0], f[3][1]); ctx.closePath(); };

/** Sky-lit top and occluded base on one wall: a vertical gradient (light over the top fifth, dark over the bottom fifth). k scales both. */
export function wallGradient(ctx, f, h, k = 1, sky = 0.1) {
  const top = Math.min(f[2][1], f[3][1]), bot = Math.max(f[0][1], f[1][1]);
  if (!(bot - top > 6)) return;
  const g = ctx.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, snowA(sky * k)); g.addColorStop(0.28, CLEAR); g.addColorStop(0.78, CLEAR_DARK); g.addColorStop(1, sootA(0.24 * k));
  facePath(ctx, f); ctx.fillStyle = g; ctx.fill();
}

/** Rim light: the top edges the sun catches (left and front-left) and the front corner, one hairline each. */
export function rimLight(ctx, f, k = 1) {
  const T = f.top, R = f.right;
  ctx.lineWidth = 1; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(T[0][0], T[0][1] + 0.5); ctx.lineTo(T[3][0], T[3][1] + 0.5); ctx.lineTo(T[2][0], T[2][1] + 0.5);
  ctx.strokeStyle = snowA(0.38 * k); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(R[3][0], R[3][1] + 1); ctx.lineTo(R[0][0], R[0][1]);
  ctx.strokeStyle = snowA(0.2 * k); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(T[2][0], T[2][1] + 0.5); ctx.lineTo(T[1][0], T[1][1] + 0.5);
  ctx.strokeStyle = snowA(0.1 * k); ctx.stroke();
}

/** Parallel lines across a face every `step` pixels of height (brick courses, siding, panel joints). */
export function courses(ctx, f, h, step, alpha) {
  const n = Math.floor(h / step); if (n < 2 || n > 60) return;
  ctx.beginPath();
  for (let i = 1; i < n; i++) { const v = (i * step) / h, a = facePoint(f, 0, v), b = facePoint(f, 1, v); ctx.moveTo(a[0], a[1] + 0.5); ctx.lineTo(b[0], b[1] + 0.5); }
  ctx.strokeStyle = sootA(alpha); ctx.lineWidth = 1; ctx.stroke();
}
/** Vertical joints across a face at the given u positions. */
export function seams(ctx, f, us, alpha, col) {
  ctx.beginPath();
  for (const u of us) { const a = facePoint(f, u, 0.02), b = facePoint(f, u, 0.98); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  ctx.strokeStyle = col || sootA(alpha); ctx.lineWidth = 1; ctx.stroke();
}
/** A bright vertical strip of sheen on a face (polished metal, a window wall catching the sun). */
export function sheen(ctx, f, u, wd, alpha, v0 = 0.04, v1 = 0.96) {
  const a = facePoint(f, u, v0), b = facePoint(f, u + wd, v0), c = facePoint(f, u + wd, v1), d = facePoint(f, u, v1);
  quadN(ctx, a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1], snowA(alpha));
}
/** Two diagonal reflections across a glass face, clipped to it. */
export function glassSheen(ctx, f, alpha = 0.1) {
  ctx.save(); facePath(ctx, f); ctx.clip();
  const q = (u0, u1) => { const a = facePoint(f, u0, 0), b = facePoint(f, u1, 0), c = facePoint(f, u1 + 0.5, 1), d = facePoint(f, u0 + 0.5, 1); quadN(ctx, a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1], snowA(alpha)); };
  q(0.05, 0.2); q(0.34, 0.4);
  ctx.restore();
}
/** Faint rain streaks running down a plaster wall, placed by hash so a building always weathers the same way. */
export function weather(ctx, f, seed, alpha = 0.05) {
  ctx.beginPath();
  for (let i = 0; i < 4; i++) { const u = 0.08 + h2(seed, i) * 0.84, v = 0.55 + h2(seed, i + 9) * 0.35, a = facePoint(f, u, 0.97), b = facePoint(f, u, v); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  ctx.strokeStyle = sootA(alpha); ctx.lineWidth = 1.6; ctx.stroke();
}

// ---------------------------------------------------------------- solids
/** Soft occlusion on the ground round a footprint: where a wall meets the earth it is a shade darker, whatever the sun does. */
export function contact(ctx, gx, gy, w, d, a = 0.2) {
  diamond(ctx, gx - 0.16, gy - 0.16, w + 0.32, d + 0.32, inkA(a * 0.4));
  diamond(ctx, gx - 0.07, gy - 0.07, w + 0.14, d + 0.14, inkA(a * 0.8));
}

/**
 * A prism with its finish: face gradients, rim light and, by material, texture. Same corner points as box(). o = { z, line, mat, seed, k (strength, 1), lite (skip finishing) }.
 * mat: 'brick' | 'glass' | 'metal' | 'plaster' | 'boards' | 'stone' | undefined (just gradient and rim).
 */
export function solid(ctx, gx, gy, w, d, h, c, o = {}) {
  const f = box(ctx, gx, gy, w, d, h, c, o);
  if (o.lite || h < 6) return f;
  const k = o.k ?? 1, tall = clamp(0.6 + h / 150, 0.6, 1.6); // a tall wall is lit more strongly at the top: the sky shows in it
  wallGradient(ctx, f.left, h, k, (o.mat === 'glass' ? 0.16 : 0.1) * tall); wallGradient(ctx, f.right, h, k, 0.05 * tall);
  if (h >= 14) switch (o.mat) {
    case 'brick': courses(ctx, f.left, h, 4, 0.085); courses(ctx, f.right, h, 4, 0.1); break;
    case 'boards': seams(ctx, f.left, uniform(Math.max(4, Math.round(w * 5))), 0.14); seams(ctx, f.right, uniform(Math.max(4, Math.round(d * 5))), 0.16); break;
    case 'metal': seams(ctx, f.left, uniform(Math.max(3, Math.round(w * 2.2))), 0.12); sheen(ctx, f.left, 0.1, 0.045, 0.14); courses(ctx, f.right, h, 7, 0.07); break;
    case 'glass': glassSheen(ctx, f.left, 0.1); glassSheen(ctx, f.right, 0.05); break;
    case 'stone': courses(ctx, f.left, h, 10, 0.06); courses(ctx, f.right, h, 10, 0.08); break;
    case 'plaster': weather(ctx, f.left, (o.seed | 0) + 3, 0.05); break;
    default: break;
  }
  rimLight(ctx, f, k);
  return f;
}
const UNIFORM = new Map();
function uniform(n) { let a = UNIFORM.get(n); if (!a) { a = Array.from({ length: n - 1 }, (_, i) => (i + 1) / n); UNIFORM.set(n, a); } return a; }

/** A cheap hue shift towards the haze colour; props.js applies it to every body colour of a prop standing on high ground. */
export const hazed = (c, k) => (k > 0.004 ? mix(c, HAZE, k) : c);
