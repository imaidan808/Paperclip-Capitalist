// Isometric (2.5D) projection and drawing primitives. Everything is drawn with Canvas 2D from code: no images, no libraries.
// Grid coordinates (gx, gy) are tiles; gz is height in pixels. Screen x grows with gx - gy, screen y with gx + gy.
export const TW = 64, TH = 32, HW = TW / 2, HH = TH / 2;
export const sx = (gx, gy) => (gx - gy) * HW;
export const sy = (gx, gy, gz = 0) => (gx + gy) * HH - gz;
export const P = (gx, gy, gz = 0) => [sx(gx, gy), sy(gx, gy, gz)];
export const toGrid = (x, y, gz = 0) => { const a = x / HW, b = (y + gz) / HH; return [(a + b) / 2, (b - a) / 2]; };

// ---- colour helpers (hex only, 6 digits)
export const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const shade = (h, f) => { const [r, g, b] = rgb(h); return hex(r * f, g * f, b * f); };
export const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); };
export const tone = (h) => ({ t: h, l: shade(h, 0.8), r: shade(h, 0.6) });
export const gray = (h) => { const [r, g, b] = rgb(h), y = 0.3 * r + 0.59 * g + 0.11 * b; return hex(y, y, y); };
/** Fogged colour: desaturated and darkened by k (0 = untouched, 1 = a locked district). */
export const fogged = (h, k) => (k > 0.01 ? mix(mix(h, gray(h), Math.min(1, k * 1.5)), '#121826', k * 0.5) : h);
/** Is a hex colour dark? (decides whether a district reads as night-like ground). */
export const luma = (h) => { const [r, g, b] = rgb(h); return (0.3 * r + 0.59 * g + 0.11 * b) / 255; };
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function quad(ctx, pts, fill, stroke, lw = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
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
  quad(ctx, [D, C, C0, D0], c.l, o.line);
  quad(ctx, [C, B, B0, C0], c.r, o.line);
  quad(ctx, [A, B, C, D], c.t, o.line);
  return { left: [D0, C0, C, D], right: [C0, B0, B, C], top: [A, B, C, D] };
}

const fp = (f, u, v) => { const b = [f[0][0] + (f[1][0] - f[0][0]) * u, f[0][1] + (f[1][1] - f[0][1]) * u], t = [f[3][0] + (f[2][0] - f[3][0]) * u, f[3][1] + (f[2][1] - f[3][1]) * u]; return [b[0] + (t[0] - b[0]) * v, b[1] + (t[1] - b[1]) * v]; };
/** Grid of windows on a face (bottom-left, bottom-right, top-right, top-left). */
export function windows(ctx, f, cols, rows, fill, lit = 0, pad = 0.12, litCol = '#ffd98a', phase = 0) {
  const cw = (1 - pad * 2) / cols, rh = (1 - pad * 2) / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const u0 = pad + i * cw + cw * 0.18, u1 = pad + (i + 1) * cw - cw * 0.18, v0 = pad + j * rh + rh * 0.2, v1 = pad + (j + 1) * rh - rh * 0.2;
    const on = lit > 0 && ((i * 7 + j * 13 + cols + phase) % 5) / 5 < lit;
    quad(ctx, [fp(f, u0, v0), fp(f, u1, v0), fp(f, u1, v1), fp(f, u0, v1)], on ? litCol : fill);
  }
}
export const facePoint = fp;

/** Soft cast shadow: hull of the footprint and a copy shifted away from the sun (upper left). */
export function shadow(ctx, gx, gy, w, d, h, alpha = 0.28) {
  const k = h * 0.55, pts = [];
  for (const [x, y] of [[gx, gy], [gx + w, gy], [gx + w, gy + d], [gx, gy + d]]) { const [px, py] = P(x, y); pts.push([px, py], [px + k, py + k * 0.5]); }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of [...pts].reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  quad(ctx, [...lo.slice(0, -1), ...up.slice(0, -1)], `rgba(8,10,20,${alpha})`);
}

export function ellipse(ctx, x, y, rx, ry, fill, stroke, lw = 1) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

/** Upright cylinder (tank, barrel, tower): footprint circle at gx, gy with radius r in tiles. */
export function cyl(ctx, gx, gy, r, h, c, z = 0) {
  const [x, y0] = P(gx, gy, z), rx = r * HW * 1.42, ry = r * HH * 1.42, y1 = y0 - h;
  ctx.beginPath(); ctx.moveTo(x - rx, y0); ctx.lineTo(x - rx, y1); ctx.ellipse(x, y1, rx, ry, 0, Math.PI, 0, true); ctx.lineTo(x + rx, y0); ctx.ellipse(x, y0, rx, ry, 0, 0, Math.PI, false); ctx.closePath();
  const g = ctx.createLinearGradient(x - rx, 0, x + rx, 0); g.addColorStop(0, c.l); g.addColorStop(0.55, c.t); g.addColorStop(1, c.r);
  ctx.fillStyle = g; ctx.fill();
  ellipse(ctx, x, y1, rx, ry, c.t);
}

export function tree(ctx, gx, gy, s = 1, sway = 0, c = '#2f7d4b', z = 0) {
  const [x, y] = P(gx, gy, z);
  ellipse(ctx, x + 6 * s, y + 2, 14 * s, 6 * s, 'rgba(8,10,20,.25)');
  ctx.fillStyle = '#6b4a2c'; ctx.fillRect(x - 2 * s, y - 14 * s, 4 * s, 14 * s);
  for (let i = 0; i < 3; i++) { const w = (17 - i * 4) * s, yy = y - (16 + i * 9) * s; quad(ctx, [[x + sway * (i + 1) * 0.5, yy - 14 * s], [x + w, yy], [x - w, yy]], i === 0 ? shade(c, 0.78) : i === 1 ? c : shade(c, 1.18)); }
}

export function lamp(ctx, gx, gy, glow = 0, z = 0) {
  const [x, y] = P(gx, gy, z);
  ctx.fillStyle = '#2b3342'; ctx.fillRect(x - 1.5, y - 30, 3, 30); ctx.fillRect(x - 5, y - 32, 10, 3);
  ellipse(ctx, x, y - 30, 3, 2, glow > 0.05 ? '#ffe9a8' : '#99a3b5');
}

/** A small person, feet at (x, y) in world pixels. look = {shirt, pants, hair, skin}. */
export function person(ctx, x, y, s, look, t = 0, moving = false, dir = 1) {
  const step = moving ? Math.sin(t / 110) * 3 * s : 0, bob = moving ? Math.abs(Math.sin(t / 110)) * 1.2 * s : Math.sin(t / 700) * 0.6 * s;
  ellipse(ctx, x, y + 1, 8 * s, 3.2 * s, 'rgba(8,10,20,.3)');
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

// ---- deterministic randomness
export function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = Math.imul(n + (n << 3), 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
export const h2 = (a, b) => hash(a * 73856093 ^ b * 19349663);
export function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
