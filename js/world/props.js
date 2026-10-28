// Scenery art for all sixteen districts. Each drawer paints one prop (ctx already shifted to the prop's elevation) and returns hit polygons for the clickable ones.
// env = { t (visual clock, 0 under reduced motion), night, wind, dim (fog), lights (push {wx, wy, r, c, a} to light the night), zoff, far (zoomed out), lite, hz (haze, set per prop here) }.
// What it draws: buildings, ground props and machines in one lighting model (sun upper left, see iso.js and shading.js). What it never does: choose where anything stands
// (layout.js and kits.js do), change game state, or use Math.random (all variation is hashed from the prop's own position).
// Props are built from a handful of shared builders (bldg, roof, hall) so a theme is mostly parameters.
// Heavy static props are LAYERS: body() draws everything that never changes into an offscreen sprite once (sprites.js), live() draws what moves (smoke, flicker, blink)
// and pushes lights every frame. Where no canvas can be had (a Node test) a layered prop simply draws body() and live() straight onto the scene.
import { P, box, quad, quadN, windows, shadow, blob, cyl, ellipse, tree, lamp, tone, shade, mix, fogged, diamond, facePoint, h2, roundRect, snowA, sootA, inkA, clamp } from './iso.js';
import { solid, contact, hazed, hazeAt, seams } from './shading.js';
import { drawSprite } from './sprites.js';

// ---------------------------------------------------------------- colour and light helpers
/** A colour as this prop sees it: fogged where its district is locked, then hazed by the height of the ground it stands on. */
const tint = (c, env) => { const v = env.dim ? fogged(c, env.dim) : c; return env.hz ? hazed(v, env.hz) : v; };
const body = (c, env) => tone(tint(c, env));
const glow = (env) => env.night;
const hot = (f) => [f.left, f.right, f.top];
const fp = facePoint;
const FONT = 'ui-monospace, Menlo, monospace';
const lite = (env) => env.lite || env.far;
const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };
const seedOf = (p) => (h2((p.gx * 13) | 0, (p.gy * 13) | 0) * 1e6) | 0;
/** The left (sun-lit) wall of a prop standing at its own elevation, as bottom-left, bottom-right, top-right, top-left points. */
const leftFace = (p, h = p.h, z = 0) => [P(p.gx, p.gy + p.d, z), P(p.gx + p.w, p.gy + p.d, z), P(p.gx + p.w, p.gy + p.d, z + h), P(p.gx, p.gy + p.d, z + h)];
/** The right (shaded) wall, same order of points. */
const rightFace = (p, h = p.h, z = 0) => [P(p.gx + p.w, p.gy + p.d, z), P(p.gx + p.w, p.gy, z), P(p.gx + p.w, p.gy, z + h), P(p.gx + p.w, p.gy + p.d, z + h)];
const stroke = (ctx, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(); };

function strip(ctx, f, side, u0, u1, v0, v1, col) {
  const F = side === 'R' ? f.right : f.left, a = fp(F, u0, v0), b = fp(F, u1, v0), c = fp(F, u1, v1), d = fp(F, u0, v1);
  quadN(ctx, a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1], col);
}
/**
 * Warm light spilling from lit windows: one soft light on the wall at night, as strong as the evening is deep. The light pass fills a square of side 2r with a gradient
 * for every light, so the pool is small and a little stronger rather than wide and faint: a third of the pixels for the same warmth where the wall stands.
 */
function windowGlow(env, p, face, scale = 1) {
  if (!env.lights || env.night < 0.3 || lite(env)) return;
  const [x, y] = fp(face, 0.5, 0.5);
  env.lights.push({ wx: x, wy: y - env.zoff, r: clamp((p.w * 14 + 16) * scale, 28, 62), c: '255,208,130', a: 0.2 * env.night });
}

function smoke(ctx, x, y, t, n = 4, col = '255,255,255') {
  for (let i = 0; i < n; i++) { const k = ((t / 1800) + i / n) % 1; ctx.fillStyle = `rgba(${col},${0.32 * (1 - k)})`; ctx.beginPath(); ctx.arc(x + Math.sin(k * 5 + i) * 4 + k * 8, y - k * 34, 3 + k * 7, 0, 7); ctx.fill(); }
}

// ---------------------------------------------------------------- signs
/** Text laid on a wall face: skewed to the face, on a dark plate so it reads on any wall colour. slope +0.5 for a left face, -0.5 for a right one. */
function faceText(ctx, F, text, color, font, v, u, slope) {
  const [x, y] = fp(F, u, v);
  ctx.save(); ctx.translate(x, y); ctx.transform(1, slope, 0, 1, 0, 0);
  ctx.font = `800 ${font}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = text.length * font * 0.62 + 7; ctx.fillStyle = 'rgba(8,12,22,.42)'; ctx.fillRect(-w / 2, -font * 0.66, w, font * 1.32);
  if (color) { ctx.fillStyle = color; ctx.fillText(text, 0, 0); }
  ctx.restore();
}
function sign(ctx, faceRight, text, color = '#ffd36e', font = 11, v = 0.82) { faceText(ctx, faceRight, text, color, font, v, 0.5, -0.5); }
function signLeft(ctx, faceLeft, text, color = '#ffd36e', font = 11, v = 0.82, u = 0.5) { faceText(ctx, faceLeft, text, color, font, v, u, 0.5); }
/** The glowing part of a neon sign (the plate behind it is part of the sprite): a faint halo under the text, a night light and an occasional flicker. */
function neonSign(ctx, p, env, face, text, col, v = 0.8, size = 10) {
  if (env.t && Math.sin(env.t / 140 + p.gx * 7) > 0.985) return;
  const [x, y] = fp(face, 0.5, v);
  ctx.save(); ctx.translate(x, y); ctx.transform(1, 0.5, 0, 1, 0, 0); ctx.font = `800 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (!lite(env)) { ctx.lineWidth = 4; ctx.strokeStyle = col; ctx.globalAlpha = 0.3; ctx.strokeText(text, 0, 0); ctx.globalAlpha = 1; }
  ctx.fillStyle = col; ctx.fillText(text, 0, 0); ctx.restore();
  env.lights?.push({ wx: x, wy: y - env.zoff, r: 52, c: hexRgb(col), a: 0.5 });
}

// ---------------------------------------------------------------- roofs
/** A rooftop vent or air-conditioning unit or two on a flat roof, placed by the building's own hash. */
function roofKit(ctx, p, env, z) {
  const r = (h2((p.gx * 9) | 0, (p.gy * 9) | 0) * 1e4) | 0, n = p.w * p.d > 5 ? 2 : 1, w = Math.min(0.4, p.w * 0.16), d = Math.min(0.3, p.d * 0.16), c = body('#8e97a6', env);
  for (let i = 0; i < n; i++) {
    const u = 0.14 + h2(r, i) * 0.5, v = 0.16 + h2(r, i + 7) * 0.5, gx = p.gx + p.w * u, gy = p.gy + p.d * v;
    box(ctx, gx, gy, w, d, 4, c, { z: z + 3 });
    const [x, y] = P(gx + w / 2, gy + d / 2, z + 7.2); ellipse(ctx, x, y, w * 14, d * 7, 'rgba(20,26,36,.6)');
  }
}
/** Roof of a building: flat slab, gable (ridge along x), hip, sawtooth or a pediment on the front. */
function roof(ctx, p, f, env, kind = p.roof || 'flat') {
  const { gx, gy, w, d } = p, z = p.h, base = p.col || '#8a94a8', wall = body(base, env), rc = body(p.roofCol || shade(base, 0.7), env), rh = Math.max(7, Math.min(24, d * 6)), fine = !lite(env);
  if (kind === 'none') return;
  if (kind === 'flat') {
    solid(ctx, gx - 0.1, gy - 0.1, w + 0.2, d + 0.2, 3, rc, { z, lite: !fine });
    if (fine) { diamond(ctx, gx + 0.12, gy + 0.12, w - 0.24, d - 0.24, sootA(0.1), null, z + 3); roofKit(ctx, p, env, z); }
    return;
  }
  strip(ctx, f, 'L', 0, 1, 0.9, 1, sootA(0.2)); // the wall under an overhang is always darker
  if (kind === 'gable') {
    const R0 = P(gx - 0.1, gy + d / 2, z + rh), R1 = P(gx + w + 0.1, gy + d / 2, z + rh);
    if (fine && h2((gx * 17) | 0, (gy * 17) | 0) > 0.45) { const t = tone(shade('#8a5a48', 0.9)); box(ctx, gx + w * 0.7, gy + d * 0.28, 0.28, 0.28, rh * 0.5 + 8, t, { z: z + rh * 0.35 }); } // chimney behind the ridge
    quad(ctx, [P(gx + w, gy, z), P(gx + w, gy + d, z), P(gx + w, gy + d / 2, z + rh)], wall.r);
    quad(ctx, [P(gx - 0.1, gy + d + 0.1, z), P(gx + w + 0.1, gy + d + 0.1, z), R1, R0], rc.l);
    quad(ctx, [P(gx + w + 0.1, gy + d + 0.1, z), P(gx + w + 0.1, gy - 0.05, z), R1], rc.r);
    if (fine) {
      ctx.beginPath(); for (let i = 1; i <= 3; i++) { const t = i / 4, a = P(gx - 0.1, gy + d / 2 + (d / 2 + 0.1) * t, z + rh * (1 - t)), b = P(gx + w + 0.1, gy + d / 2 + (d / 2 + 0.1) * t, z + rh * (1 - t)); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } stroke(ctx, sootA(0.13), 1);
      ctx.beginPath(); ctx.moveTo(R0[0], R0[1]); ctx.lineTo(R1[0], R1[1]); stroke(ctx, snowA(0.42), 1.3);                       // ridge catches the sun
      const e0 = P(gx - 0.1, gy + d + 0.1, z), e1 = P(gx + w + 0.1, gy + d + 0.1, z); ctx.beginPath(); ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); stroke(ctx, sootA(0.3), 1.4); // eave shadow line
    }
  } else if (kind === 'hip') {
    const m = Math.min(d, w) / 2, a = P(gx + m, gy + d / 2, z + rh), b = P(gx + w - m, gy + d / 2, z + rh);
    quad(ctx, [P(gx - 0.1, gy + d + 0.1, z), P(gx + w + 0.1, gy + d + 0.1, z), b, a], rc.l);
    quad(ctx, [P(gx + w + 0.1, gy + d + 0.1, z), P(gx + w + 0.1, gy - 0.1, z), b], rc.r);
    quad(ctx, [P(gx - 0.1, gy - 0.1, z), P(gx - 0.1, gy + d + 0.1, z), a], rc.t);
    if (fine) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); stroke(ctx, snowA(0.4), 1.3); const e0 = P(gx - 0.1, gy + d + 0.1, z), e1 = P(gx + w + 0.1, gy + d + 0.1, z); ctx.beginPath(); ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); stroke(ctx, sootA(0.3), 1.4); }
  } else if (kind === 'saw') {
    const n = Math.max(2, Math.round(w / 1.6)), r = 8, glass = mix(wall.l, '#9fd4f5', 0.45);
    for (let i = 0; i < n; i++) {
      const x0 = gx + (i * w) / n, x1 = gx + ((i + 1) * w) / n;
      quad(ctx, [P(x0, gy + d, z), P(x1, gy + d, z + r), P(x1, gy, z + r), P(x0, gy, z)], rc.t);
      quad(ctx, [P(x0, gy + d, z), P(x1, gy + d, z), P(x1, gy + d, z + r)], glass);
      if (fine) { const a = P(x1, gy + d, z + r), b = P(x1, gy, z + r); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); stroke(ctx, snowA(0.3), 1); }
    }
  } else if (kind === 'pediment') {
    solid(ctx, gx - 0.1, gy - 0.1, w + 0.2, d + 0.2, 3, rc, { z, lite: !fine });
    quad(ctx, [P(gx - 0.1, gy + d + 0.1, z + 3), P(gx + w + 0.1, gy + d + 0.1, z + 3), P(gx + w / 2, gy + d + 0.1, z + 3 + 14)], tone(tint('#e8e2cc', env)).l);
    quad(ctx, [P(gx + 0.5, gy + d + 0.1, z + 4), P(gx + w - 0.5, gy + d + 0.1, z + 4), P(gx + w / 2, gy + d + 0.1, z + 3 + 11)], rc.l);
    if (fine) { const a = P(gx - 0.1, gy + d + 0.1, z + 3), b = P(gx + w / 2, gy + d + 0.1, z + 17); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); stroke(ctx, snowA(0.5), 1.2); }
  }
}

// ---------------------------------------------------------------- the general building and the hall
/** The general building: walls, windows, doors, awning, band, sign, neon, roof. Most districts' houses, shops and halls are this with parameters. */
function bldgBody(ctx, p, env) {
  const fine = !lite(env), B = body(p.col || '#8a94a8', env), [cols, rows] = p.win || [3, 2], gl = glow(env) * 1.3, wo = { fine };
  shadow(ctx, p.gx, p.gy, p.w, p.d, p.h); contact(ctx, p.gx, p.gy, p.w, p.d);
  const f = solid(ctx, p.gx, p.gy, p.w, p.d, p.h, B, { mat: p.mat || (p.glass ? 'glass' : 'plaster'), seed: seedOf(p), lite: !fine });
  if (p.band) strip(ctx, f, 'L', 0, 1, 0.82, 0.94, tint(p.band, env));
  const wf = p.glass ? '#2a4a6a' : p.studio ? '#241636' : '#1d2740';
  windows(ctx, f.left, cols, rows, wf, gl, 0.1, undefined, 0, wo); windows(ctx, f.right, Math.max(1, Math.round(cols * p.d / p.w)), rows, wf, gl, 0.1, undefined, 0, wo);
  if (p.doors) for (let i = 0; i < p.doors; i++) {
    const u0 = 0.1 + i * (0.8 / p.doors), u1 = u0 + 0.8 / p.doors - 0.06; strip(ctx, f, 'L', u0, u1, 0, 0.42, '#222a38');
    ctx.beginPath(); for (let k = 1; k < 4; k++) { const a = fp(f.left, u0, k * 0.1), b = fp(f.left, u1, k * 0.1); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } stroke(ctx, 'rgba(255,255,255,.14)', 1);
    strip(ctx, f, 'L', u0 - 0.01, u1 + 0.01, 0.42, 0.455, snowA(0.3)); // lintel
  } else if (p.door) { strip(ctx, f, 'L', 0.4, 0.6, 0, 0.38, snowA(0.22)); strip(ctx, f, 'L', 0.42, 0.58, 0, 0.36, '#2a2118'); }
  if (p.bars) for (let i = 0; i < cols; i++) strip(ctx, f, 'L', 0.1 + (i + 0.45) * (0.8 / cols), 0.1 + (i + 0.55) * (0.8 / cols), 0.28, 0.72, 'rgba(0,0,0,.45)');
  if (p.balc) for (let j = 0; j < rows; j++) strip(ctx, f, 'L', 0.05, 0.95, 0.12 + j * (0.78 / rows), 0.145 + j * (0.78 / rows), tint('#f6e6d4', env));
  if (p.awn) { strip(ctx, f, 'L', 0, 1, 0.38, 0.5, sootA(0.22)); for (let i = 0; i < 6; i++) strip(ctx, f, 'L', i / 6, (i + 1) / 6, 0.5, 0.64, i % 2 ? '#f4f1e6' : tint(p.acc || '#c0392b', env)); }
  roof(ctx, p, f, env);
  if (p.clock) { const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, p.h + 3); box(ctx, p.gx + p.w * 0.4, p.gy + p.d * 0.3, p.w * 0.2, p.d * 0.4, 14, B, { z: p.h + 5 }); ellipse(ctx, x, y - 14, 3.2, 3.2, '#f6f0d8', '#222', 1); }
  if (p.sign) { if (p.neon) faceText(ctx, f.left, p.sign, null, 9, 0.9, 0.5, 0.5); else signLeft(ctx, f.left, p.sign, p.acc || '#ffd36e', 9, 0.9); }
  return p.hot ? hot(f) : null;
}
function bldgLive(ctx, p, env) {
  const L = leftFace(p);
  if (p.sign && p.neon) neonSign(ctx, p, env, L, p.sign, p.neon, 0.9, 9);
  else if (p.neon && !lite(env)) { const [lx, ly] = fp(L, 0.5, 0.6); env.lights?.push({ wx: lx, wy: ly - env.zoff, r: 44, c: hexRgb(p.neon), a: 0.35 }); }
  windowGlow(env, p, L);
}

/** Colonnaded hall: the bank of finance, the exchange of the last district. */
function hallBody(ctx, p, env) {
  const fine = !lite(env), seed = seedOf(p);
  shadow(ctx, p.gx, p.gy, p.w, p.d, p.h); contact(ctx, p.gx - 0.3, p.gy - 0.3, p.w + 0.6, p.d + 0.6);
  solid(ctx, p.gx - 0.3, p.gy - 0.3, p.w + 0.6, p.d + 0.6, 4, body('#b9b2a0', env), { mat: 'stone', lite: !fine });
  const f = solid(ctx, p.gx, p.gy, p.w, p.d, p.h, body(p.col || '#e4ecdc', env), { z: 4, mat: 'stone', seed, lite: !fine });
  const n = Math.max(4, Math.round(p.w * 1.6));
  ctx.beginPath(); for (let i = 0; i < n; i++) { const u = 0.07 + (i * 0.86) / (n - 1), a = fp(f.left, u, 0.04), b = fp(f.left, u, 0.82); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } stroke(ctx, 'rgba(255,255,255,.55)', 3.2);
  ctx.beginPath(); for (let i = 0; i < n; i++) { const u = 0.07 + (i * 0.86) / (n - 1), a = fp(f.left, u, 0.04), b = fp(f.left, u, 0.82); ctx.moveTo(a[0] + 1.6, a[1]); ctx.lineTo(b[0] + 1.6, b[1]); } stroke(ctx, 'rgba(0,0,0,.22)', 1.3);
  if (fine) { ctx.beginPath(); for (let i = 0; i < n; i++) { const u = 0.07 + (i * 0.86) / (n - 1), a = fp(f.left, u, 0.82), b = fp(f.left, u, 0.04); ctx.moveTo(a[0] - 2.4, a[1]); ctx.lineTo(a[0] + 2.4, a[1]); ctx.moveTo(b[0] - 2.4, b[1]); ctx.lineTo(b[0] + 2.4, b[1]); } stroke(ctx, 'rgba(255,255,255,.4)', 1.6); } // capitals and bases
  windows(ctx, f.right, 3, 2, '#1d2f55', glow(env), 0.15, undefined, 0, { fine });
  roof(ctx, { ...p, h: p.h + 4, col: p.col || '#e4ecdc', roofCol: p.roofCol || '#2f5a44' }, f, env, 'pediment');
  strip(ctx, f, 'L', 0.3, 0.7, 0.9, 0.99, tint(p.acc || '#d8b94a', env)); if (p.sign) signLeft(ctx, f.left, p.sign, '#2a2410', 9, 0.945);
  strip(ctx, f, 'R', 0.35, 0.65, 0, 0.5, '#2a2118');
  return p.hot ? hot(f) : null;
}

function globeAt(ctx, x, y, r, env, col, t) {
  ellipse(ctx, x, y, r, r, tint('#16304a', env), col, 2);
  ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
  const ph = t / 2400;
  for (let i = 0; i < 4; i++) { const k = Math.cos(ph + (i * Math.PI) / 4); ctx.beginPath(); ctx.ellipse(x, y, Math.abs(k) * r, r, 0, 0, 7); ctx.stroke(); }
  for (const l of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.ellipse(x, y + l * r, r * Math.sqrt(1 - l * l), r * 0.18, 0, 0, 7); ctx.stroke(); }
  ctx.globalAlpha = 1;
  ellipse(ctx, x - r * 0.35, y - r * 0.4, r * 0.28, r * 0.2, snowA(0.25));
}

// ---------------------------------------------------------------- the props
export const DRAW = {
  gate(ctx, p, env) { // what cuts a locked district off: a barrier across the road, a raised bridge leaf, or a ferry that is not running
    const gx = p.gx + 0.15, gy = p.gy + 0.15, hx = p.hx, hy = p.hy, nx = -hy, ny = hx, k = p.gk;
    if (k === 'ferry') {
      const t = env.locked || !env.t ? 0.05 : 0.5 + 0.5 * Math.sin(env.t / 5200), bx = gx + (p.fx - gx) * (env.locked ? 0.05 : 0.08 + t * 0.84), by = gy + (p.fy - gy) * (env.locked ? 0.05 : 0.08 + t * 0.84), alongX = Math.abs(p.fx - gx) > Math.abs(p.fy - gy);
      const w = alongX ? 2.6 : 1.2, d = alongX ? 1.2 : 2.6, z0 = -p.z;
      solid(ctx, bx - w / 2, by - d / 2, w, d, 6, body('#e8eef6', env), { z: z0 - 1 }); const f = solid(ctx, bx - w / 4, by - d / 4, w / 2, d / 2, 8, body(env.locked ? '#6a7080' : '#2f80ed', env), { z: z0 + 5 });
      windows(ctx, f.left, 2, 1, '#1d2740', env.locked ? 0 : 0.8, 0.15);
      const a = P(gx, gy, 0); ctx.fillStyle = '#2b3342'; ctx.fillRect(a[0] - 2, a[1] - 22, 4, 22); roundRect(ctx, a[0] - 22, a[1] - 40, 44, 16, 3); ctx.fillStyle = '#10141c'; ctx.fill(); ctx.strokeStyle = env.locked ? '#ffd36e' : '#46e38e'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = env.locked ? '#ffd36e' : '#46e38e'; ctx.font = `800 8px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(env.locked ? 'NOT RUNNING' : 'FERRY', a[0], a[1] - 29);
      return null;
    }
    if (!env.locked) return null;
    if (k === 'bridge') { // the leaf is raised: a tilted slab, striped, with warning lamps
      const a = P(gx - nx * 1.3, gy - ny * 1.3, 0), b = P(gx + nx * 1.3, gy + ny * 1.3, 0), a2 = P(gx - nx * 1.3 + hx * 3.2, gy - ny * 1.3 + hy * 3.2, 26), b2 = P(gx + nx * 1.3 + hx * 3.2, gy + ny * 1.3 + hy * 3.2, 26);
      quad(ctx, [a, b, b2, a2], '#7a5a30', '#2a1a08', 1.5);
      for (let i = 0; i < 5; i++) { const u0 = i / 5, u1 = (i + 1) / 5; quad(ctx, [[a2[0] + (b2[0] - a2[0]) * u0, a2[1] + (b2[1] - a2[1]) * u0], [a2[0] + (b2[0] - a2[0]) * u1, a2[1] + (b2[1] - a2[1]) * u1], [a2[0] + (b2[0] - a2[0]) * u1 - 1, a2[1] + (b2[1] - a2[1]) * u1 + 8], [a2[0] + (b2[0] - a2[0]) * u0 - 1, a2[1] + (b2[1] - a2[1]) * u0 + 8]], i % 2 ? '#10141c' : '#ffd36e'); }
      for (const q of [a, b]) { ctx.fillStyle = '#2b3342'; ctx.fillRect(q[0] - 1.5, q[1] - 16, 3, 16); ellipse(ctx, q[0], q[1] - 17, 3, 3, env.t && Math.sin(env.t / 300) > 0 ? '#ff4d4d' : '#7a2a2a'); }
      return null;
    }
    const a = P(gx - nx * 1.3, gy - ny * 1.3, 0), b = P(gx + nx * 1.3, gy + ny * 1.3, 0); // a boom barrier across the road
    ctx.fillStyle = '#2b3342'; ctx.fillRect(a[0] - 2, a[1] - 18, 4, 18); ctx.fillRect(b[0] - 2, b[1] - 18, 4, 18);
    const n = 8; for (let i = 0; i < n; i++) { const u0 = i / n, u1 = (i + 1) / n; quad(ctx, [[a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0 - 16], [a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1 - 16], [a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1 - 11], [a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0 - 11]], i % 2 ? '#10141c' : '#ffd36e'); }
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - 26; roundRect(ctx, mx - 8, my - 6, 16, 12, 3); ctx.fillStyle = '#ffd36e'; ctx.fill(); ctx.strokeStyle = '#ffd36e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mx, my - 6, 4.5, Math.PI, 0); ctx.stroke(); ctx.fillStyle = '#10141c'; ctx.fillRect(mx - 1, my - 2, 2, 5);
    return null;
  },
  lookout(ctx, p, env) { // a viewpoint at the end of a footpath: a little deck, a bench and a telescope
    const [x, y] = P(p.gx + 0.5, p.gy + 0.5);
    blob(ctx, x, y + 2, 18, 9, 0.3); solid(ctx, p.gx, p.gy, 1, 1, 3, body('#8a6a3a', env), { mat: 'boards', lite: true });
    box(ctx, p.gx + 0.1, p.gy + 0.65, 0.8, 0.2, 5, tone('#6b4a2c'), { z: 3 }); ctx.fillStyle = '#c9ccd2'; ctx.fillRect(x - 5, y - 18, 1.6, 15); ctx.fillRect(x + 3, y - 18, 1.6, 15); ctx.fillStyle = tint('#e8eef6', env); ctx.beginPath(); ctx.moveTo(x - 6, y - 17); ctx.lineTo(x + 8, y - 24); ctx.lineTo(x + 8, y - 21); ctx.lineTo(x - 6, y - 14); ctx.fill();
    return null;
  },
  board(ctx, p, env) {
    const [x, y] = P(p.gx + p.w / 2, p.gy, 0);
    ctx.fillStyle = '#2b3342'; ctx.fillRect(x - 26, y - 6, 4, 6); ctx.fillRect(x + 22, y - 6, 4, 6); ctx.fillRect(x - 25, y - 30, 3, 26); ctx.fillRect(x + 22, y - 30, 3, 26);
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(x - 25, y - 30, 1, 26); ctx.fillRect(x + 22, y - 30, 1, 26);
    const f = box(ctx, p.gx, p.gy, p.w, p.d, 22, body('#202a3d', env), { z: 18, line: p.acc ? tint(p.acc, env) : undefined });
    quad(ctx, [fp(f.left, 0.04, 0.1), fp(f.left, 0.96, 0.1), fp(f.left, 0.96, 0.9), fp(f.left, 0.04, 0.9)], env.surge ? '#ff3da8' : '#0f1626');
    signLeft(ctx, f.left, env.boardText || p.text, env.locked ? '#ffd36e' : '#7be3ff', 10, 0.5);
    if (glow(env) > 0.1 && !lite(env)) { ctx.fillStyle = `rgba(123,227,255,${0.12 * glow(env)})`; ctx.fillRect(x - 40, y - 60, 80, 50); }
    return hot(f);
  },
  crane(ctx, p, env) {
    const [x, y] = P(p.gx, p.gy);
    blob(ctx, x, y + 2, 20, 8, 0.3);
    ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x - 6, y - 118); ctx.moveTo(x + 14, y); ctx.lineTo(x + 6, y - 118); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,180,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 15.2, y); ctx.lineTo(x - 7.2, y - 118); ctx.stroke(); // lit edge of the mast
    ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 2; for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x - 14 + i * 1.3, y - i * 20); ctx.lineTo(x + 14 - i * 1.3, y - i * 20 + 8); ctx.stroke(); }
    ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x - 70, y - 118); ctx.lineTo(x + 26, y - 118); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,180,.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 70, y - 120.5); ctx.lineTo(x + 26, y - 120.5); ctx.stroke();
    const trol = x - 40 + Math.sin(env.t / 2600) * 22, hook = 46 + Math.sin(env.t / 1700) * 12;
    ctx.strokeStyle = '#2b3342'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(trol, y - 118); ctx.lineTo(trol, y - 118 + hook); ctx.stroke();
    box(ctx, p.gx - 1.2 + (trol - x + 40) / 64 * 0.2, p.gy - 0.6, 0.5, 0.5, 8, tone(tint('#b0493a', env)), { z: 118 - hook - 8 });
    if (glow(env) > 0.2) ellipse(ctx, x - 70, y - 118, 3, 3, '#ff4d4d');
    return null;
  },
  scrap(ctx, p, env) {
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h * 0.7, 0.22);
    const cols = ['#7a7f88', '#8c4a2f', '#5b6573', '#a07a3a', '#6b5a4a'], n = p.big ? 9 : 5;
    for (let i = 0; i < n; i++) {
      const r1 = h2(p.seed, i), r2 = h2(p.seed, i + 9), r3 = h2(p.seed, i + 19), h = (p.h * (0.4 + r2 * 0.6)) * 0.8, gx = p.gx + r1 * (p.w - 0.7), gy = p.gy + r2 * (p.d - 0.7);
      const f = solid(ctx, gx, gy, 0.5 + r3 * 0.4, 0.5 + r1 * 0.4, h, body(cols[i % cols.length], env), { mat: 'metal', lite: lite(env) || h < 34 });
      if (r3 > 0.5) { ctx.beginPath(); const a = fp(f.left, 0.1, 0.55), b = fp(f.left, 0.9, 0.3); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); stroke(ctx, 'rgba(120,60,20,.35)', 1.4); } // rust streak
    }
    return null;
  },
  tires(ctx, p, env) {
    const [x, y] = P(p.gx + 0.45, p.gy + 0.45);
    blob(ctx, x, y + 1, 12 + p.n, 5.5, 0.3);
    for (let i = 0; i < p.n; i++) { ellipse(ctx, x, y - i * 7, 12, 6, '#161a22'); ellipse(ctx, x, y - i * 7 - 2, 12, 6, '#262c38'); ellipse(ctx, x, y - i * 7 - 2, 5, 2.6, '#10131a'); ctx.beginPath(); ctx.ellipse(x, y - i * 7 - 2, 11, 5.2, 0, Math.PI * 1.05, Math.PI * 1.6); stroke(ctx, snowA(0.14), 1); }
    return null;
  },
  barrel(ctx, p, env) {
    const c = body(p.color, env), [bx, by] = P(p.gx + 0.35, p.gy + 0.35);
    blob(ctx, bx, by + 1, 10, 4.5, 0.3);
    cyl(ctx, p.gx + 0.35, p.gy + 0.35, 0.3, 20, c);
    const rx = 0.3 * 32 * 1.42, ry = 0.3 * 16 * 1.42; // two steel hoops
    for (const k of [6, 14]) { ctx.beginPath(); ctx.ellipse(bx, by - k, rx, ry, 0, 0, Math.PI); stroke(ctx, sootA(0.22), 1.2); }
    if (p.fire && !env.far) { const [x, y] = P(p.gx + 0.35, p.gy + 0.35, 20), k = Math.sin(env.t / 90) * 2; quad(ctx, [[x - 6, y], [x + k, y - 20 - k], [x + 6, y]], '#ff8a2b'); quad(ctx, [[x - 3, y], [x - k, y - 11], [x + 3, y]], '#ffd36e'); if (!lite(env)) { const g = ctx.createRadialGradient(x, y - 4, 2, x, y - 4, 44); g.addColorStop(0, `rgba(255,150,60,${0.35 + 0.2 * glow(env)})`); g.addColorStop(1, 'rgba(255,150,60,0)'); ctx.fillStyle = g; ctx.fillRect(x - 46, y - 50, 92, 92); } }
    return null;
  },
  crates(ctx, p, env) {
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h, 0.2);
    for (let i = 0; i < p.n; i++) {
      const w = Math.min(0.9, p.w - 0.1 * i), d = Math.min(0.9, p.d - 0.1 * i), f = box(ctx, p.gx + 0.1 * i, p.gy + 0.1 * i, w, d, 12, body(i % 2 ? '#a07a45' : '#b58a4f', env), { z: i * 12, line: 'rgba(0,0,0,.25)' });
      if (!lite(env)) { ctx.beginPath(); const a = fp(f.left, 0.08, 0.1), b = fp(f.left, 0.92, 0.9), c = fp(f.left, 0.92, 0.1), e = fp(f.left, 0.08, 0.9); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(c[0], c[1]); ctx.lineTo(e[0], e[1]); stroke(ctx, 'rgba(0,0,0,.2)', 1); const t = f.top; ctx.beginPath(); ctx.moveTo(t[3][0], t[3][1] + 0.5); ctx.lineTo(t[2][0], t[2][1] + 0.5); stroke(ctx, snowA(0.25), 1); }
    }
    return null;
  },
  junkcar(ctx, p, env) {
    shadow(ctx, p.gx, p.gy, p.w, p.d, 22);
    solid(ctx, p.gx, p.gy, p.w, p.d, 9, body(p.color, env), { z: 4, mat: 'metal', lite: lite(env) });
    const f = solid(ctx, p.gx + p.w * 0.25, p.gy + 0.15, p.w * 0.5, p.d - 0.3, 9, body(shade(p.color, 0.9), env), { z: 13, lite: lite(env) });
    windows(ctx, f.left, 2, 1, '#27304a', 0, 0.15);
    for (const [wx, wy] of [[0.18, 0], [0.8, 0]]) { const [x, y] = P(p.gx + p.w * wx, p.gy + p.d, 0); ellipse(ctx, x, y - 2, 5, 5, '#111'); ellipse(ctx, x, y - 2, 2.2, 2.2, '#5b6573'); }
    return null;
  },
  deadtree(ctx, p, env) {
    const [x, y] = P(p.gx, p.gy);
    blob(ctx, x + 3, y + 1, 9, 3.5, 0.25);
    ctx.strokeStyle = '#4a3a2c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 30); ctx.lineWidth = 2; ctx.moveTo(x, y - 18); ctx.lineTo(x - 10, y - 34); ctx.moveTo(x, y - 24); ctx.lineTo(x + 9, y - 38); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 1, y); ctx.lineTo(x - 1, y - 30); ctx.stroke();
    return null;
  },
  fence(ctx, p, env) {
    const n = Math.round(p.dirY ? p.d : p.w) * 2, col = p.col || '#6b5a45', a = P(p.gx, p.gy), b = p.dirY ? P(p.gx, p.gy + p.d) : P(p.gx + p.w, p.gy);
    ctx.beginPath(); for (let i = 0; i <= n; i++) { const [x, y] = p.dirY ? P(p.gx, p.gy + i / 2) : P(p.gx + i / 2, p.gy); ctx.rect(x - 1.5, y - p.h, 3, p.h); } ctx.fillStyle = tint(col, env); ctx.fill();
    ctx.beginPath(); for (let i = 0; i <= n; i++) { const [x, y] = p.dirY ? P(p.gx, p.gy + i / 2) : P(p.gx + i / 2, p.gy); ctx.rect(x - 1.5, y - p.h, 1, p.h); } ctx.fillStyle = snowA(0.12); ctx.fill();
    ctx.beginPath(); for (const hh of [6, 14]) { ctx.moveTo(a[0], a[1] - hh); ctx.lineTo(b[0], b[1] - hh); } stroke(ctx, tint(shade(col, 1.2), env), 2);
    return null;
  },
  lamp(ctx, p, env) { lamp(ctx, p.gx, p.gy, glow(env)); return null; },
  neonlamp(ctx, p, env) { const [x, y] = P(p.gx, p.gy); lamp(ctx, p.gx, p.gy, glow(env)); ellipse(ctx, x, y - 32, 3.4, 2.4, p.col); if (!lite(env)) env.lights?.push({ wx: x, wy: y - 32 - env.zoff, r: 40, c: hexRgb(p.col), a: 0.5 }); return null; },
  tree(ctx, p, env) { tree(ctx, p.gx, p.gy, p.s || 1, Math.sin(env.t / 900 + (p.seed || 0)) * 2 * env.wind, tint(p.c || '#2f7d4b', env)); return null; },
  bench(ctx, p, env) {
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2); ellipse(ctx, x + 2, y + 2, 13, 4.5, inkA(0.2));
    const a = P(p.gx + p.w * 0.1, p.gy + p.d * 0.5), b = P(p.gx + p.w * 0.9, p.gy + p.d * 0.5); ctx.fillStyle = '#2b3342'; ctx.fillRect(a[0] - 1, a[1] - 6, 2, 6); ctx.fillRect(b[0] - 1, b[1] - 6, 2, 6); // legs
    box(ctx, p.gx, p.gy, p.w, p.d, 4, tone('#6b4a2c'), { z: 6 }); box(ctx, p.gx, p.gy, p.w, 0.08, 7, tone('#6b4a2c'), { z: 10 });
    return null;
  },
  planter(ctx, p, env) {
    solid(ctx, p.gx, p.gy, p.w, p.d, 6, body('#8a8f98', env), { mat: 'stone', lite: true }); const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, 6);
    ellipse(ctx, x, y - 3, p.w * 22, p.w * 11, tint('#3f8a4a', env)); ellipse(ctx, x - 2, y - 6, p.w * 13, p.w * 7, tint('#5aa85a', env)); ellipse(ctx, x - 4, y - 7, p.w * 6, p.w * 3, snowA(0.14));
    return null;
  },
  topiary(ctx, p, env) {
    const [x, y] = P(p.gx + 0.25, p.gy + 0.25); blob(ctx, x + 3, y + 1, 9, 3.6, 0.28);
    ctx.fillStyle = '#4a3a2a'; ctx.fillRect(x - 1.5, y - 16, 3, 16); ellipse(ctx, x, y - 22, 9, 10, tint('#2f6a3a', env)); ellipse(ctx, x - 2, y - 25, 5, 5, tint('#4a8a4a', env)); ellipse(ctx, x - 3.5, y - 26.5, 2.4, 2.2, snowA(0.16));
    return null;
  },
  hedge(ctx, p, env) { const f = solid(ctx, p.gx, p.gy, p.w, p.d, p.h, body(p.col || '#2f5a3a', env), { lite: true }); ctx.beginPath(); const t = f.top; ctx.moveTo(t[3][0], t[3][1] + 0.5); ctx.lineTo(t[2][0], t[2][1] + 0.5); stroke(ctx, snowA(0.14), 1); return null; },
  pillar(ctx, p, env) { cyl(ctx, p.gx + 0.25, p.gy + 0.25, 0.18, p.h, body(p.col || '#e8e2cc', env)); return null; },
  flag(ctx, p, env) { const [x, y] = P(p.gx, p.gy); ctx.fillStyle = '#c9ccd2'; ctx.fillRect(x - 1, y - p.h, 2, p.h); const k = Math.sin(env.t / 300 + p.gx) * 2; quad(ctx, [[x + 1, y - p.h], [x + 15, y - p.h + 3 + k], [x + 15, y - p.h + 11 + k], [x + 1, y - p.h + 9]], tint(p.col, env)); ellipse(ctx, x, y - p.h - 1, 1.6, 1.6, '#e8cd6a'); return null; },
  lantern(ctx, p, env) { const [x, y] = P(p.gx, p.gy); ctx.fillStyle = '#4a3a2a'; ctx.fillRect(x - 1, y - p.h, 2, p.h); ellipse(ctx, x, y - p.h + 3, 4, 5, tint(p.col, env)); ellipse(ctx, x - 1, y - p.h + 2, 1.5, 2, snowA(0.3)); if (glow(env) > 0.1 && !lite(env)) env.lights?.push({ wx: x, wy: y - p.h - env.zoff, r: 40, c: '255,200,110', a: 0.5 * glow(env) }); return null; },
  shop(ctx, p, env) {
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h, 0.2);
    const f = solid(ctx, p.gx, p.gy, p.w, p.d, p.h, body(p.color, env), { lite: lite(env) });
    windows(ctx, f.left, 2, 1, '#27345a', glow(env) * 1.3, 0.1, undefined, 0, { fine: !lite(env) });
    for (let i = 0; i < 6; i++) strip(ctx, f, 'L', i / 6, (i + 1) / 6, 0.52, 0.66, i % 2 ? '#f4f1e6' : '#c0392b');
    windows(ctx, f.right, 2, 2, '#27345a', glow(env), 0.15);
    return null;
  },
  tank(ctx, p, env) {
    const gx = p.gx + p.w / 2, gy = p.gy + p.d / 2, r = p.w * 0.45, [x, y] = P(gx, gy); blob(ctx, x + 5, y + 2, r * 62, r * 30, 0.28);
    cyl(ctx, gx, gy, r, p.h, body(p.col, env));
    for (const k of [0.3, 0.65]) { ctx.beginPath(); ctx.ellipse(x, y - p.h * k, r * 45, r * 22.6, 0, 0, Math.PI); stroke(ctx, tint(p.acc, env), 2); }
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(x - r * 45 * 0.4, y - p.h * 0.9, 1.6, p.h * 0.8); // ladder rail catches the sun
    return null;
  },
  silo(ctx, p, env) {
    const cx = p.gx + p.w / 2, cy = p.gy + p.d / 2, r = p.w * 0.42, [bx, by] = P(cx, cy); blob(ctx, bx + 5, by + 2, r * 62, r * 30, 0.28);
    cyl(ctx, cx, cy, r, p.h, body(p.col, env));
    const [x, y] = P(cx, cy, p.h), cap = tint('#9aa0a8', env);
    ctx.fillStyle = cap; ctx.beginPath(); ctx.ellipse(x, y, r * 45, r * 22, 0, Math.PI, 0); ctx.fill(); quad(ctx, [[x - r * 45, y], [x, y - 18], [x + r * 45, y]], cap);
    quadN(ctx, x - r * 45, y, x, y, x, y - 18, x - r * 45, y, snowA(0.18));
    ctx.beginPath(); for (const k of [0.25, 0.5, 0.75]) { ctx.moveTo(x + r * 45, y + p.h * k); ctx.ellipse(x, y + p.h * k, r * 45, r * 22.6, 0, 0, Math.PI); } stroke(ctx, sootA(0.1), 1); // ribbing
    return null;
  },
  stack(ctx, p, env) {
    const [x, y] = P(p.gx + 0.45, p.gy + 0.45, p.h), [bx, by] = P(p.gx + 0.45, p.gy + 0.45); blob(ctx, bx + 5, by + 2, 18, 7, 0.28);
    cyl(ctx, p.gx + 0.45, p.gy + 0.45, 0.32, p.h, body(p.col, env));
    for (const k of [0.6, 0.8]) { ctx.fillStyle = tint(p.acc, env); ctx.fillRect(x - 11, y + p.h * (1 - k) - 4, 22, 5); }
    ellipse(ctx, x, y, 10, 4.5, '#2a2e36');
    if (!env.far) smoke(ctx, x, y, env.t, 5, '200,205,215');
    return null;
  },
  fountain(ctx, p, env) {
    const cx = p.gx + p.w / 2, cy = p.gy + p.d / 2, [x, y] = P(cx, cy), s = Math.min(1, p.w / 2);
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.translate(-x, -y);
    blob(ctx, x + 4, y + 6, 46, 22, 0.22);
    ellipse(ctx, x, y + 2, 46, 23, tint('#8a94ad', env)); ellipse(ctx, x, y - 2, 42, 21, tint('#46577c', env)); ellipse(ctx, x, y - 3, 38, 19, tint('#4a9fd0', env));
    ctx.beginPath(); ctx.ellipse(x, y + 1, 45, 22, 0, Math.PI * 1.02, Math.PI * 1.75); stroke(ctx, snowA(0.35), 1.2); // lit lip of the basin
    if (!lite(env)) for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28 + env.t / 1500, r = 12 + 5 * Math.sin(env.t / 300 + i); ellipse(ctx, x + Math.cos(a) * r, y - 3 + Math.sin(a) * r * 0.5, 1.6, 1.2, 'rgba(220,245,255,.7)'); }
    ctx.fillStyle = '#d8d2c2'; ctx.fillRect(x - 3, y - 22, 6, 20); ctx.fillStyle = snowA(0.3); ctx.fillRect(x - 3, y - 22, 1.6, 20);
    if (!lite(env)) for (let i = 0; i < 8; i++) { const k = ((env.t / 700) + i / 8) % 1; ellipse(ctx, x + Math.sin(i * 2.4) * k * 18, y - 22 - Math.sin(k * 3.14) * 18 + k * 10, 1.8, 1.8, `rgba(220,245,255,${0.9 - k * 0.6})`); }
    ctx.restore();
    return null;
  },
  helipad(ctx, p, env) {
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2);
    ellipse(ctx, x, y + 3, 44, 22, inkA(0.3)); ellipse(ctx, x, y, 44, 22, '#2a3042'); ellipse(ctx, x, y, 40, 20, null, '#ffd36e', 2);
    ctx.fillStyle = '#ffd36e'; ctx.font = `800 22px ${FONT}`; ctx.textAlign = 'center'; ctx.save(); ctx.translate(x, y + 7); ctx.scale(1, 0.55); ctx.fillText('H', 0, 0); ctx.restore();
    return null;
  },

  // ---------------------------------------------------------------- market, campus, pawn, estate
  cart(ctx, p, env) {
    shadow(ctx, p.gx, p.gy, p.w, p.d, 22, 0.18); solid(ctx, p.gx, p.gy, p.w, p.d, 8, body('#8a5a32', env), { z: 3, mat: 'boards', lite: lite(env) });
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2); ctx.fillStyle = '#5a4020'; ctx.fillRect(x - 1, y - 28, 2, 24);
    quad(ctx, [[x - 18, y - 20], [x + 18, y - 20], [x + 8, y - 30], [x - 8, y - 30]], tint(p.awn || '#e8503a', env)); quadN(ctx, x - 18, y - 20, x + 18, y - 20, x + 18, y - 18.4, x - 18, y - 18.4, sootA(0.25));
    for (const dx of [-18, 18]) { ellipse(ctx, x + dx, y + 1, 3.4, 3.4, '#222'); ellipse(ctx, x + dx, y + 1, 1.2, 1.2, '#8a8f98'); }
    return null;
  },
  neonpole(ctx, p, env) {
    const [x, y] = P(p.gx, p.gy); ctx.fillStyle = '#2b3342'; ctx.fillRect(x - 1.5, y - p.h, 3, p.h); ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(x - 1.5, y - p.h, 1, p.h);
    for (const [dx, dy] of [[-7, 0], [7, 0], [0, -10]]) { ellipse(ctx, x + dx, y - p.h + 6 + dy, 5, 5, tint(p.col, env), shade(p.col, 0.6), 1); }
    if (!lite(env)) env.lights?.push({ wx: x, wy: y - p.h - env.zoff, r: 56, c: hexRgb(p.col), a: 0.55 });
    return null;
  },
  polesign(ctx, p, env) {
    const [x, y] = P(p.gx, p.gy); blob(ctx, x, y + 1, 7, 3, 0.3); ctx.fillStyle = '#6a707c'; ctx.fillRect(x - 1.5, y - p.h, 3, p.h); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x - 1.5, y - p.h, 1, p.h);
    const f = solid(ctx, p.gx - 0.6, p.gy - 0.05, 1.4, 0.1, 18, body(p.col, env), { z: p.h - 6, lite: true }); signLeft(ctx, f.left, p.text, '#fff', 9, 0.5);
    return null;
  },

  // ---------------------------------------------------------------- harbor, industrial
  gantry(ctx, p, env) {
    const [x0, y0] = P(p.gx, p.gy + p.d / 2), [x1, y1] = P(p.gx + p.w, p.gy + p.d / 2), H = p.h, c = tint(p.col, env);
    blob(ctx, (x0 + x1) / 2, (y0 + y1) / 2 + 2, Math.abs(x1 - x0) / 2 + 6, 7, 0.28);
    ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.beginPath(); for (const [x, y] of [[x0, y0], [x1, y1]]) { ctx.moveTo(x - 6, y); ctx.lineTo(x - 3, y - H); ctx.moveTo(x + 6, y); ctx.lineTo(x + 3, y - H); } ctx.stroke();
    ctx.strokeStyle = snowA(0.3); ctx.lineWidth = 1; ctx.beginPath(); for (const [x, y] of [[x0, y0], [x1, y1]]) { ctx.moveTo(x - 7.4, y); ctx.lineTo(x - 4.4, y - H); } ctx.stroke(); // lit edge of each leg
    ctx.strokeStyle = c; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x0, y0 - H); ctx.lineTo(x1, y1 - H); ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = shade(p.col, 0.7); ctx.beginPath(); ctx.moveTo(x0, y0 - H * 0.5); ctx.lineTo(x1, y1 - H * 0.5); ctx.stroke();
    ctx.strokeStyle = snowA(0.32); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y0 - H - 2.6); ctx.lineTo(x1, y1 - H - 2.6); ctx.stroke(); // the beam's lit top edge
    const f = 0.5 + 0.38 * Math.sin(env.t / 2800), tx = x0 + (x1 - x0) * f, ty = y0 + (y1 - y0) * f - H, hook = 18 + 10 * Math.sin(env.t / 1900 + 1);
    ctx.strokeStyle = '#2b3342'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty + hook); ctx.stroke();
    quad(ctx, [[tx - 7, ty + hook], [tx + 7, ty + hook + 3.5], [tx + 7, ty + hook + 10], [tx - 7, ty + hook + 6.5]], tint(['#c0392b', '#2f80ed', '#f2994a'][(p.gx | 0) % 3], env));
    return null;
  },
  ship(ctx, p, env) {
    const bob = env.t ? Math.sin(env.t / 900) * 1.2 : 0; ctx.save(); ctx.translate(0, bob);
    const f = solid(ctx, p.gx, p.gy, p.w, p.d, p.h, body(p.hull, env), { z: -2, mat: 'metal', lite: lite(env) }); strip(ctx, f, 'L', 0, 1, 0.55, 0.78, tint(p.acc, env)); strip(ctx, f, 'L', 0, 1, 0, 0.12, 'rgba(120,30,20,.5)'); // boot-topping at the waterline
    const n = Math.floor(p.w / 1.2); for (let i = 0; i < n - 1; i++) box(ctx, p.gx + 0.3 + i * 1.1, p.gy + 0.35, 0.95, p.d - 0.7, 7, body(['#c0392b', '#2f80ed', '#f2994a', '#27ae60'][i % 4], env), { z: p.h - 2 });
    const c = solid(ctx, p.gx + p.w - 1.2, p.gy + 0.3, 1.0, p.d - 0.6, 12, body('#e8eef6', env), { z: p.h - 2, lite: lite(env) }); windows(ctx, c.left, 2, 1, '#27304a', glow(env), 0.15);
    ctx.restore(); return null;
  },
  bollard(ctx, p, env) { cyl(ctx, p.gx + 0.15, p.gy + 0.15, 0.12, p.h, body(p.col, env)); const [x, y] = P(p.gx + 0.15, p.gy + 0.15, p.h); ellipse(ctx, x, y, 3.2, 1.6, shade(p.col, 1.25)); return null; },

  // ---------------------------------------------------------------- tech, creative, farm
  dome(ctx, p, env) {
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2), r = p.w * 30;
    blob(ctx, x + 4, y + 3, r + 6, r * 0.5 + 3, 0.26); ellipse(ctx, x, y, r, r * 0.5, tint('#1c2a38', env));
    ctx.save(); ctx.globalAlpha = 0.65; ctx.fillStyle = tint('#3a7a9a', env); ctx.beginPath(); ctx.ellipse(x, y, r, p.h, 0, Math.PI, 0); ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.ellipse(x - r * 0.28, y - p.h * 0.55, r * 0.3, p.h * 0.3, -0.5, 0, 7); ctx.fillStyle = snowA(0.12); ctx.fill(); // sky reflected in the glass
    ctx.strokeStyle = tint(p.acc, env); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, y, r, p.h, 0, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.ellipse(x, y, r * 0.5, p.h, 0, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.stroke();
    return null;
  },
  dish(ctx, p, env) {
    const [x, y] = P(p.gx + 0.4, p.gy + 0.4); blob(ctx, x + 2, y + 1, 8, 3.2, 0.28); ctx.fillStyle = '#6a707c'; ctx.fillRect(x - 2, y - p.h, 4, p.h); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(x - 2, y - p.h, 1.2, p.h);
    ctx.save(); ctx.translate(x, y - p.h); ctx.rotate(-0.5 + (env.t ? Math.sin(env.t / 4000) * 0.15 : 0)); ellipse(ctx, 0, 0, 13, 7, tint(p.col, env), '#8a94a4', 1.2); ellipse(ctx, -2, -1, 8, 3.8, snowA(0.14)); ctx.strokeStyle = tint(p.acc, env); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -12); ctx.stroke(); ellipse(ctx, 0, -12, 2, 2, tint(p.acc, env)); ctx.restore();
    return null;
  },
  billboard(ctx, p, env) {
    const [x, y] = P(p.gx + p.w / 2, p.gy); ctx.fillStyle = '#2b3342'; ctx.fillRect(x - p.w * 22, y - p.h + 6, 3, p.h - 6); ctx.fillRect(x + p.w * 22 - 3, y - p.h + 6, 3, p.h - 6);
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(x - p.w * 22, y - p.h + 6, 1, p.h - 6); ctx.fillRect(x + p.w * 22 - 3, y - p.h + 6, 1, p.h - 6);
    const hue = p.anim && env.t ? (env.t / 30) % 360 : 0, c = p.anim && env.t ? `hsl(${(hue + 280) % 360},70%,${env.dim ? 30 : 55}%)` : tint(p.col, env);
    const f = box(ctx, p.gx, p.gy, p.w, p.d, 18, body('#1a2030', env), { z: p.h - 18 }); strip(ctx, f, 'L', 0.04, 0.96, 0.1, 0.9, c); strip(ctx, f, 'L', 0.04, 0.96, 0.1, 0.16, snowA(0.14)); signLeft(ctx, f.left, p.text, '#fff', 11, 0.5);
    if (!lite(env)) { const [lx, ly] = fp(f.left, 0.5, 0.5); env.lights?.push({ wx: lx, wy: ly - env.zoff, r: 70, c: '255,150,240', a: 0.28 * (p.anim ? 1 : 0.6) }); }
    return null;
  },
  spot(ctx, p, env) {
    const [x, y] = P(p.gx + 0.3, p.gy + 0.3); solid(ctx, p.gx, p.gy, p.w, p.d, 8, body('#2b3342', env), { lite: true }); ellipse(ctx, x, y - 10, 4, 3, tint(p.col, env));
    if (!lite(env)) { const a = (env.t ? Math.sin(env.t / 1800 + p.gx) : 0) * 0.5 - 0.4; ctx.save(); ctx.globalAlpha = 0.16 + 0.12 * glow(env); ctx.fillStyle = p.col; ctx.beginPath(); ctx.moveTo(x - 2, y - 10); ctx.lineTo(x + Math.sin(a) * 90 - 14, y - 10 - Math.cos(a) * 90); ctx.lineTo(x + Math.sin(a) * 90 + 14, y - 10 - Math.cos(a) * 90); ctx.lineTo(x + 2, y - 10); ctx.fill(); ctx.restore(); }
    return null;
  },
  windmill(ctx, p, env) {
    const cx = p.gx + p.w / 2, cy = p.gy + p.d / 2, [bx, by] = P(cx, cy), [tx, ty] = P(cx, cy, p.h), c = body(p.col, env);
    blob(ctx, bx + 5, by + 2, 18, 7, 0.28);
    quad(ctx, [[bx - 12, by], [bx + 12, by], [tx + 5, ty], [tx - 5, ty]], c.l); quad(ctx, [[bx + 12, by], [bx + 4, by - 4], [tx + 5, ty], [tx + 1, ty]], c.r);
    quadN(ctx, bx - 12, by, bx - 10, by, tx - 3.6, ty, tx - 5, ty, snowA(0.22));
    const a0 = env.t ? env.t / 1600 : 0.3; ctx.strokeStyle = tint('#f2ead8', env); ctx.lineWidth = 3.2; ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = a0 + (i * Math.PI) / 2; ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(a) * 26, ty + Math.sin(a) * 26 * 0.95); } ctx.stroke(); ellipse(ctx, tx, ty, 3, 3, '#6a707c');
    return null;
  },
  hay(ctx, p, env) {
    const [x, y] = P(p.gx + 0.4, p.gy + 0.4); blob(ctx, x, y + 1, 16, 6, 0.26);
    for (const dx of [-5, 6]) { ellipse(ctx, x + dx, y - 5, 8, 4.5, tint('#c9a13a', env)); ellipse(ctx, x + dx, y - 9, 8, 4.5, tint('#e0bb52', env)); ctx.strokeStyle = tint('#a8822a', env); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x + dx, y - 9, 4, 2.2, 0, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.ellipse(x + dx, y - 9, 7, 3.8, 0, Math.PI * 1.1, Math.PI * 1.7); stroke(ctx, snowA(0.28), 1); }
    return null;
  },

  // ---------------------------------------------------------------- corporate, finance, realty, exchange
  ticker(ctx, p, env) {
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h, 0.2);
    const f = box(ctx, p.gx, p.gy, p.w, p.d, p.h, body('#10161e', env), { z: 4 });
    for (const x of [0.15, p.w - 0.15]) box(ctx, p.gx + x - 0.06, p.gy, 0.12, p.d, 4, body('#2b3342', env));
    const [x0, y0] = fp(f.left, 0.04, 0.2), [x1, y1] = fp(f.left, 0.96, 0.8);
    ctx.save(); ctx.beginPath(); ctx.moveTo(x0, y0 + 2); ctx.lineTo(x1, y1 + 2); ctx.lineTo(x1, y1 - 12); ctx.lineTo(x0, y0 - 12); ctx.closePath(); ctx.clip();
    const off = env.t ? (env.t / 40) % 160 : 0, [mx, my] = fp(f.left, 0.5, 0.5);
    ctx.translate(mx, my); ctx.transform(1, 0.5, 0, 1, 0, 0); ctx.font = `800 9px ${FONT}`; ctx.textBaseline = 'middle'; ctx.fillStyle = tint(p.acc, env);
    const tw = Math.max(40, p.text.length * 5.4); for (let k = -1; k < 3; k++) ctx.fillText(p.text, -(off % tw) + k * tw - 20, 0);
    ctx.restore();
    if (!lite(env)) env.lights?.push({ wx: mx, wy: my - env.zoff, r: 44, c: hexRgb(p.acc), a: 0.22 });
    return null;
  },
  statue(ctx, p, env) {
    solid(ctx, p.gx - 0.1, p.gy - 0.1, p.w + 0.2, p.d + 0.2, 7, body('#8a8f98', env), { mat: 'stone', lite: true });
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, 7), c = tint(p.col, env); blob(ctx, x + 3, y + 1, 12, 4, 0.2);
    quad(ctx, [[x - 9, y - 3], [x + 9, y - 3], [x + 8, y - 12], [x - 6, y - 14]], c); ellipse(ctx, x + 9, y - 13, 4, 3.4, c); ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 11, y - 15); ctx.lineTo(x + 15, y - 19); ctx.moveTo(x + 7, y - 15); ctx.lineTo(x + 5, y - 19); ctx.stroke();
    ctx.fillStyle = c; ctx.fillRect(x - 7, y - 3, 2.4, 5); ctx.fillRect(x + 5, y - 3, 2.4, 5);
    ctx.beginPath(); ctx.moveTo(x - 8, y - 4); ctx.lineTo(x - 6, y - 13); ctx.lineTo(x + 7, y - 12); stroke(ctx, snowA(0.35), 1); // polished back and shoulder
    return null;
  },
  forsale(ctx, p, env) { const [x, y] = P(p.gx + 0.2, p.gy); blob(ctx, x + 4, y + 1, 8, 3, 0.24); ctx.fillStyle = '#e8eef6'; ctx.fillRect(x - 1, y - 20, 2, 20); quad(ctx, [[x + 1, y - 20], [x + 17, y - 18], [x + 17, y - 9], [x + 1, y - 11]], tint(p.col, env)); ctx.fillStyle = '#fff'; ctx.fillRect(x + 4, y - 16, 10, 1.6); ctx.fillRect(x + 4, y - 13, 7, 1.6); return null; },
};

// ---------------------------------------------------------------- layered props: a cached body, a live part
/** type -> { body, live?, night?, pad?, draw }. draw is the plain "body then live" drawer that DRAW[type] holds. */
const LAYER = {};
function layer(type, def) {
  LAYER[type] = def;
  DRAW[type] = def.draw = (ctx, p, env) => { const r = def.body(ctx, p, env); if (def.live) def.live(ctx, p, env); return r; };
}

// A server rack: the cabinet is the sprite (its panes drawn dark); the blinking lights are the live part, painted over the panes the way the lit ones always were.
layer('rack', {
  night: false, // nothing in the cabinet depends on the hour: the lights are live
  body(ctx, p, env) {
    const fine = !lite(env), rows = Math.round(p.h / 6);
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h); contact(ctx, p.gx, p.gy, p.w, p.d, 0.16);
    const f = solid(ctx, p.gx, p.gy, p.w, p.d, p.h, body(p.col, env), { mat: 'metal', lite: !fine });
    if (fine) { // the cabinet's frame: end rails and a door seam on the lit wall, a vented kick plate, slits on the shaded wall, an accent line along the top edge
      const edge = `rgba(${hexRgb(tint(p.acc || '#35e0ff', env))},.6)`;
      strip(ctx, f, 'L', 0.015, 0.05, 0.05, 0.95, 'rgba(0,0,0,.5)'); strip(ctx, f, 'L', 0.95, 0.985, 0.05, 0.95, 'rgba(0,0,0,.5)'); strip(ctx, f, 'L', 0.05, 0.057, 0.05, 0.95, snowA(0.13));
      strip(ctx, f, 'L', 0.497, 0.503, 0.07, 0.93, 'rgba(0,0,0,.55)'); strip(ctx, f, 'L', 0, 1, 0, 0.045, 'rgba(0,0,0,.5)'); strip(ctx, f, 'L', 0, 1, 0.962, 0.99, edge);
      strip(ctx, f, 'R', 0, 1, 0, 0.045, 'rgba(0,0,0,.5)'); strip(ctx, f, 'R', 0, 1, 0.962, 0.99, edge);
      ctx.beginPath(); for (let i = 0; i < 9; i++) { const v = 0.12 + i * 0.045, a = fp(f.right, 0.22, v), b = fp(f.right, 0.78, v); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } stroke(ctx, 'rgba(0,0,0,.4)', 1.4);
    }
    windows(ctx, f.left, 6, rows, '#0b1a22', 0, 0.07, p.acc, 0, { fine: false }); windows(ctx, f.right, 4, rows, '#0b1a22', 0, 0.07, p.acc, 0, { fine: false });
    solid(ctx, p.gx + 0.15, p.gy + 0.15, p.w - 0.3, p.d - 0.3, 3, body('#10161e', env), { z: p.h, lite: true });
    return null;
  },
  live(ctx, p, env) {
    const ph = env.t ? Math.floor(env.t / 450) : 0, on = 0.55 + 0.25 * glow(env), rows = Math.round(p.h / 6);
    windows(ctx, leftFace(p), 6, rows, '#0b1a22', on, 0.07, p.acc, ph + (p.seed | 0), { fine: false, skipDark: true });
    windows(ctx, rightFace(p), 4, rows, '#0b1a22', on * 0.8, 0.07, p.acc, ph + 3, { fine: false, skipDark: true });
    if (!lite(env)) { const [x, y] = P(p.gx + p.w / 2, p.gy + p.d, p.h * 0.5); env.lights?.push({ wx: x, wy: y - env.zoff, r: 46, c: hexRgb(p.acc), a: 0.3 }); }
  },
});

const PLINTH = [6, 0, 0, 0]; // sprite room on the left for a plinth that runs 0.3 tile past the footprint
layer('bldg', { body: bldgBody, live: bldgLive });
layer('hall', { pad: PLINTH, body: hallBody, live: (ctx, p, env) => windowGlow(env, p, leftFace(p, p.h, 4), 0.8) });
const exchangeBody = (ctx, p, env) => hallBody(ctx, { ...p, col: '#d8c98a', roofCol: '#2a2410', sign: 'EXCHANGE', hot: 1 }, env);
const exchangeLive = (ctx, p, env) => {
  const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, p.h + 24);
  ellipse(ctx, x, y + 14, 12, 5, 'rgba(8,10,20,.3)'); ctx.fillStyle = '#2b3342'; ctx.fillRect(x - 4, y + 8, 8, 8);
  globeAt(ctx, x, y - 2, 17, env, tint(p.acc, env), env.t);
  if (!lite(env)) env.lights?.push({ wx: x, wy: y - env.zoff, r: 80, c: '245,211,106', a: 0.35 });
};
layer('exchange', { pad: PLINTH, body: exchangeBody, live: exchangeLive }); // the hall is the sprite; the turning globe over it is drawn live

layer('shack', {
  body(ctx, p, env) {
    const fine = !lite(env);
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h); contact(ctx, p.gx, p.gy, p.w, p.d);
    const f = solid(ctx, p.gx, p.gy, p.w, p.d, p.h, body('#7d6a55', env), { mat: 'boards', lite: !fine });
    quad(ctx, [fp(f.right, 0.35, 0), fp(f.right, 0.62, 0), fp(f.right, 0.62, 0.62), fp(f.right, 0.35, 0.62)], '#2a2118');
    windows(ctx, f.left, 2, 1, '#1d2740', glow(env) * 1.4, undefined, undefined, 0, { fine });
    solid(ctx, p.gx - 0.2, p.gy - 0.2, p.w + 0.4, p.d + 0.4, 4, body('#5b4a3a', env), { z: p.h, lite: !fine });
    if (!env.far) cyl(ctx, p.gx + p.w * 0.8, p.gy + p.d * 0.3, 0.25, 16, tone('#6a6f78'), p.h + 4);
    signLeft(ctx, f.left, 'SKILLS', '#ffd36e', 10, 0.8);
    return hot(f);
  },
  live(ctx, p, env) { if (!env.far) { const [cx, cy] = P(p.gx + p.w * 0.8, p.gy + p.d * 0.3, p.h + 4); smoke(ctx, cx, cy - 16, env.t, 4); } windowGlow(env, p, leftFace(p), 0.8); },
});
layer('depot', {
  body(ctx, p, env) {
    const fine = !lite(env);
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h); contact(ctx, p.gx, p.gy, p.w, p.d);
    const f = solid(ctx, p.gx, p.gy, p.w, p.d, p.h, body(p.color, env), { mat: 'metal', lite: !fine });
    solid(ctx, p.gx - 0.1, p.gy - 0.1, p.w + 0.2, p.d + 0.2, 3, body('#d8d2c2', env), { z: p.h, lite: !fine });
    for (let i = 0; i < 3; i++) {
      const u0 = 0.1 + i * 0.3, u1 = u0 + 0.22; strip(ctx, f, 'L', u0, u1, 0, 0.62, '#222a38');
      ctx.beginPath(); for (let k = 1; k < 5; k++) { const a = fp(f.left, u0, k * 0.124), b = fp(f.left, u1, k * 0.124); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } stroke(ctx, 'rgba(255,255,255,.12)', 1);
      strip(ctx, f, 'L', u0 - 0.01, u1 + 0.01, 0.62, 0.66, 'rgba(255,211,110,.55)'); // hazard lintel over each bay
    }
    windows(ctx, f.right, 3, 1, '#1d2740', glow(env), 0.15, undefined, 0, { fine });
    signLeft(ctx, f.left, 'FREIGHT', '#ffffff', 11, 0.86);
    return hot(f);
  },
});
layer('tower', {
  body(ctx, p, env) {
    const fine = !lite(env);
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h); contact(ctx, p.gx, p.gy, p.w, p.d);
    const f = solid(ctx, p.gx, p.gy, p.w, p.d, p.h, body(p.color, env), { mat: 'glass', lite: !fine }), rows = Math.max(4, Math.round(p.h / 11));
    windows(ctx, f.left, 4, rows, '#16264a', glow(env) * 1.5, 0.06, undefined, 0, { fine }); windows(ctx, f.right, 4, rows, '#10203f', glow(env) * 1.5, 0.06, undefined, 0, { fine });
    if (fine) seams(ctx, f.left, [0.25, 0.5, 0.75], 0, 'rgba(255,255,255,.1)');
    solid(ctx, p.gx + p.w * 0.3, p.gy + p.d * 0.3, p.w * 0.4, p.d * 0.4, 10, body(shade(p.color, 0.85), env), { z: p.h, mat: 'metal', lite: !fine });
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, p.h + 10);
    ctx.strokeStyle = '#8a94ad'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 24); ctx.stroke();
    return p.hot ? hot(f) : null;
  },
  live(ctx, p, env) {
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, p.h + 10);
    if (Math.sin(env.t / 700 + (p.seed || 0)) > 0) { ellipse(ctx, x, y - 24, 2.2, 2.2, '#ff4d4d'); if (!lite(env) && env.night > 0.2) env.lights?.push({ wx: x, wy: y - 24 - env.zoff, r: 22, c: '255,70,60', a: 0.5 }); }
    windowGlow(env, p, leftFace(p), 1.1);
  },
});
layer('ipo', {
  pad: PLINTH,
  body(ctx, p, env) {
    const fine = !lite(env), o = { fine };
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h, 0.34); contact(ctx, p.gx - 0.3, p.gy - 0.3, p.w + 0.6, p.d + 0.6);
    solid(ctx, p.gx - 0.3, p.gy - 0.3, p.w + 0.6, p.d + 0.6, 6, body('#c9c2ae', env), { mat: 'stone', lite: !fine });
    const f = solid(ctx, p.gx, p.gy, p.w, p.d, p.h * 0.72, body('#6f8fd0', env), { z: 6, mat: 'glass', lite: !fine });
    const f2 = solid(ctx, p.gx + 0.5, p.gy + 0.5, p.w - 1, p.d - 1, p.h * 0.28, body('#8aa6e0', env), { z: 6 + p.h * 0.72, mat: 'glass', lite: !fine });
    windows(ctx, f.left, 5, 12, '#16264a', glow(env) * 1.6, 0.05, undefined, 0, o); windows(ctx, f.right, 5, 12, '#10203f', glow(env) * 1.6, 0.05, undefined, 0, o); windows(ctx, f2.left, 3, 5, '#16264a', glow(env) * 1.6, 0.08, undefined, 0, o); windows(ctx, f2.right, 3, 5, '#10203f', glow(env) * 1.6, 0.08, undefined, 0, o);
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, 6 + p.h);
    quad(ctx, [[x - 14, y], [x + 14, y], [x, y - 24]], '#e8cd6a'); quadN(ctx, x - 14, y, x, y, x, y - 24, x - 14, y, snowA(0.25)); ellipse(ctx, x, y - 6, 5, 5, '#fff3b0');
    ctx.fillStyle = '#ffffff'; ctx.font = `800 12px ${FONT}`; ctx.textAlign = 'center'; const [bx, by] = fp(f.left, 0.5, 0.06); ctx.fillText('EXIT', bx, by);
    return hot(f);
  },
  live(ctx, p, env) {
    if (lite(env)) return;
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, 6 + p.h), k = 0.5 + 0.5 * Math.sin(env.t / 600);
    const g = ctx.createRadialGradient(x, y - 8, 4, x, y - 8, 70); g.addColorStop(0, `rgba(255,224,120,${0.3 + 0.25 * k})`); g.addColorStop(1, 'rgba(255,224,120,0)'); ctx.fillStyle = g; ctx.fillRect(x - 74, y - 78, 148, 148);
  },
});
layer('office', {
  body(ctx, p, env) {
    const fine = !lite(env);
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h); contact(ctx, p.gx, p.gy, p.w, p.d);
    const f = solid(ctx, p.gx, p.gy, p.w, p.d, p.h, body(p.color, env), { mat: 'glass', lite: !fine });
    windows(ctx, f.left, 3, 3, '#1d2f55', glow(env) * 1.2, undefined, undefined, 0, { fine }); windows(ctx, f.right, 3, 3, '#1d2f55', glow(env) * 1.2, undefined, undefined, 0, { fine });
    solid(ctx, p.gx + 0.2, p.gy + 0.2, p.w - 0.4, p.d - 0.4, 4, body(shade(p.color, 0.8), env), { z: p.h, lite: !fine });
    sign(ctx, f.right, p.sign, '#ffffff', 10, 0.1);
    return hot(f);
  },
  live(ctx, p, env) {
    if (env.alertAudit) { const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, p.h + 12); const k = 0.5 + 0.5 * Math.sin(env.t / 260); ellipse(ctx, x, y, 5, 5, `rgba(255,${80 + 100 * k},60,1)`); const g = ctx.createRadialGradient(x, y, 2, x, y, 40); g.addColorStop(0, `rgba(255,90,60,${0.5 * k})`); g.addColorStop(1, 'rgba(255,90,60,0)'); ctx.fillStyle = g; ctx.fillRect(x - 44, y - 44, 88, 88); }
    windowGlow(env, p, leftFace(p), 0.9);
  },
});
layer('bank', {
  night: false,
  pad: [12, 0, 0, 0], // the plinth runs 0.4 tile past the footprint on every side: its left tip is further out than the box's default margin
  body(ctx, p, env) {
    const fine = !lite(env);
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h); contact(ctx, p.gx - 0.4, p.gy - 0.4, p.w + 0.8, p.d + 0.8);
    solid(ctx, p.gx - 0.4, p.gy - 0.4, p.w + 0.8, p.d + 0.8, 5, body('#b9b2a0', env), { mat: 'stone', lite: !fine });
    const f = solid(ctx, p.gx, p.gy, p.w, p.d, p.h, body(env.crunch ? '#c9a09a' : '#ded6c2', env), { z: 5, mat: 'stone', lite: !fine });
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = fp(f.left, 0.1 + i * 0.16, 0.05), b = fp(f.left, 0.1 + i * 0.16, 0.8); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } stroke(ctx, 'rgba(0,0,0,.2)', 3);
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = fp(f.left, 0.1 + i * 0.16, 0.05), b = fp(f.left, 0.1 + i * 0.16, 0.8); ctx.moveTo(a[0] - 1.3, a[1]); ctx.lineTo(b[0] - 1.3, b[1]); } stroke(ctx, 'rgba(255,255,255,.3)', 1);
    quad(ctx, [fp(f.left, 0, 1), fp(f.left, 1, 1), fp(f.left, 0.5, 1.28)], body('#cfc6b0', env).l);
    quad(ctx, [fp(f.right, 0.3, 0.55), fp(f.right, 0.7, 0.55), fp(f.right, 0.7, 0), fp(f.right, 0.3, 0)], '#2a2118');
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, 5 + p.h), dome = body('#d8b94a', env);
    ctx.fillStyle = dome.t; ctx.beginPath(); ctx.ellipse(x, y - 8, 18, 12, 0, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y - 8, 18, 12, 0, Math.PI, Math.PI * 1.5); ctx.lineTo(x, y - 8); ctx.fillStyle = snowA(0.2); ctx.fill(); // the lit half of the dome
    ellipse(ctx, x, y - 8, 18, 5, body('#e8cd6a', env).t);
    ctx.fillStyle = '#ffffff'; ctx.font = `800 11px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('BANK', x, y + 14);
    return hot(f);
  },
});
layer('manor', {
  body(ctx, p, env) {
    const fine = !lite(env);
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h + 14); contact(ctx, p.gx, p.gy, p.w, p.d);
    const f = solid(ctx, p.gx, p.gy, p.w, p.d, p.h, body(p.col, env), { mat: 'stone', lite: !fine });
    windows(ctx, f.left, Math.max(4, Math.round(p.w * 0.9)), 2, '#2a2540', glow(env) * 1.3, 0.1, undefined, 0, { fine }); windows(ctx, f.right, 3, 2, '#2a2540', glow(env), 0.1, undefined, 0, { fine });
    roof(ctx, { ...p, roofCol: p.roofCol }, f, env, 'hip');
    box(ctx, p.gx + p.w * 0.38, p.gy + p.d, p.w * 0.24, 0.5, 18, body('#f4ecd6', env)); // portico
    for (let i = 0; i < 4; i++) cyl(ctx, p.gx + p.w * (0.39 + i * 0.07), p.gy + p.d + 0.42, 0.06, 18, tone(tint('#fff', env)));
    strip(ctx, f, 'L', 0.44, 0.56, 0, 0.4, '#3a2a30');
    for (const u of [0.15, 0.8]) { const [x, y] = P(p.gx + p.w * u, p.gy + p.d * 0.3, p.h + 8); ctx.fillStyle = tint('#8a5a40', env); ctx.fillRect(x - 3, y - 12, 6, 14); ctx.fillStyle = snowA(0.16); ctx.fillRect(x - 3, y - 12, 1.6, 14); }
    return null;
  },
  live: (ctx, p, env) => windowGlow(env, p, leftFace(p), 1),
});
layer('barn', {
  body(ctx, p, env) {
    const fine = !lite(env);
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h + 14); contact(ctx, p.gx, p.gy, p.w, p.d);
    const f = solid(ctx, p.gx, p.gy, p.w, p.d, p.h, body(p.col, env), { mat: 'boards', lite: !fine });
    roof(ctx, { ...p, roofCol: '#5a2a24' }, f, env, 'gable');
    const t = tint(p.trim, env), a = fp(f.left, 0.34, 0), b = fp(f.left, 0.66, 0.62), c = fp(f.left, 0.66, 0), d = fp(f.left, 0.34, 0.62);
    quad(ctx, [a, c, b, d], shade(p.col, 0.55)); ctx.strokeStyle = t; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke();
    ctx.beginPath(); for (const p4 of [a, c, b, d]) ctx.lineTo(p4[0], p4[1]); ctx.closePath(); ctx.stroke();
    strip(ctx, f, 'L', 0.42, 0.58, 0.72, 0.9, shade(p.col, 0.45)); // hayloft door
    windows(ctx, f.right, 2, 1, '#2a1a18', glow(env), 0.15, undefined, 0, { fine });
    return null;
  },
});
layer('factory', {
  body(ctx, p, env) {
    const fine = !lite(env);
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h + 30); contact(ctx, p.gx, p.gy, p.w, p.d);
    const f = solid(ctx, p.gx, p.gy, p.w, p.d, p.h, body(p.col, env), { mat: 'metal', lite: !fine });
    strip(ctx, f, 'L', 0, 1, 0.78, 0.9, tint(p.acc, env)); windows(ctx, f.left, Math.round(p.w), 1, '#1d2a36', glow(env) * 1.2, 0.08, undefined, 0, { fine }); windows(ctx, f.right, 2, 1, '#1d2a36', glow(env), 0.1, undefined, 0, { fine });
    strip(ctx, f, 'L', 0.06, 0.26, 0, 0.5, '#222a38'); strip(ctx, f, 'L', 0.06, 0.26, 0.5, 0.54, 'rgba(255,211,110,.5)');
    roof(ctx, { ...p, roofCol: shade(p.col, 0.65), roof: 'saw' }, f, env, 'saw');
    for (let i = 0; i < p.stacks; i++) { const gx = p.gx + p.w * (0.6 + i * 0.15), gy = p.gy + p.d * 0.3; cyl(ctx, gx, gy, 0.3, 34, body('#7a8088', env), p.h); const [x, y] = P(gx, gy, p.h + 34); ellipse(ctx, x, y, 7, 3.2, '#2a2e36'); }
    return null;
  },
  live(ctx, p, env) { if (!env.far) for (let i = 0; i < p.stacks; i++) { const [x, y] = P(p.gx + p.w * (0.6 + i * 0.15), p.gy + p.d * 0.3, p.h + 34); smoke(ctx, x, y, env.t + i * 600, 4, '210,215,225'); } },
});
layer('stall', {
  night: false,
  body(ctx, p, env) {
    shadow(ctx, p.gx, p.gy, p.w, p.d, 22, 0.2);
    solid(ctx, p.gx, p.gy + p.d * 0.35, p.w, p.d * 0.65, 8, body(p.col, env), { mat: 'boards', lite: lite(env) });
    for (const [px, py] of [[p.gx, p.gy], [p.gx + p.w, p.gy], [p.gx, p.gy + p.d], [p.gx + p.w, p.gy + p.d]]) { const [x, y] = P(px, py); ctx.fillStyle = '#5a4020'; ctx.fillRect(x - 1, y - 24, 2, 24); ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(x - 1, y - 24, 0.8, 24); }
    const n = 6, A = (i) => [P(p.gx + (p.w * i) / n, p.gy, 24), P(p.gx + (p.w * (i + 1)) / n, p.gy, 24), P(p.gx + (p.w * (i + 1)) / n, p.gy + p.d + 0.2, 17), P(p.gx + (p.w * i) / n, p.gy + p.d + 0.2, 17)];
    for (let i = 0; i < n; i++) quad(ctx, A(i), i % 2 ? tint(p.awn2 || '#fff4dc', env) : tint(p.awn, env));
    const a = P(p.gx, p.gy + p.d + 0.2, 17), b = P(p.gx + p.w, p.gy + p.d + 0.2, 17); // scalloped valance along the front edge
    ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const x0 = a[0] + (b[0] - a[0]) * (i / (n * 2)), y0 = a[1] + (b[1] - a[1]) * (i / (n * 2)), x1 = a[0] + (b[0] - a[0]) * ((i + 1) / (n * 2)), y1 = a[1] + (b[1] - a[1]) * ((i + 1) / (n * 2)); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + 4, x1, y1); } stroke(ctx, tint(p.awn, env), 2);
    ctx.beginPath(); ctx.moveTo(a[0], a[1] + 0.5); ctx.lineTo(b[0], b[1] + 0.5); stroke(ctx, sootA(0.22), 1.4);
    const gc = ['#e8503a', '#f2c94c', '#6ab04c'][p.goods | 0];
    for (let i = 0; i < 4; i++) box(ctx, p.gx + 0.15 + i * (p.w - 0.4) / 4, p.gy + p.d * 0.45, 0.32, 0.32, 5, tone(tint(i % 2 ? gc : '#f2f2e6', env)), { z: 8 });
    return null;
  },
});
layer('kiosk', {
  night: false,
  body(ctx, p, env) { shadow(ctx, p.gx, p.gy, p.w, p.d, p.h, 0.2); const f = solid(ctx, p.gx, p.gy, p.w, p.d, p.h, body(p.col, env), { lite: lite(env) }); solid(ctx, p.gx - 0.1, p.gy - 0.1, p.w + 0.2, p.d + 0.2, 2, body('#e8eef6', env), { z: p.h, lite: true }); signLeft(ctx, f.left, p.sign, '#fff', 11, 0.55); return null; },
});
layer('podium', {
  night: false,
  body(ctx, p, env) {
    solid(ctx, p.gx - 0.2, p.gy - 0.2, p.w + 0.4, p.d + 0.4, 3, body('#8a7a9a', env), { mat: 'stone', lite: lite(env) });
    const f = solid(ctx, p.gx + p.w * 0.3, p.gy + p.d * 0.25, p.w * 0.4, p.d * 0.5, 14, body(p.col, env), { z: 3, lite: lite(env) });
    signLeft(ctx, f.left, 'LOT', tint(p.acc, env), 7, 0.55);
    for (let i = 0; i < 3; i++) { const [x, y] = P(p.gx + 0.1 + i * 0.4, p.gy + p.d + 0.3); ctx.fillStyle = '#d8d2c2'; ctx.fillRect(x - 0.8, y - 14, 1.6, 14); quad(ctx, [[x, y - 14], [x + 7, y - 14], [x + 7, y - 9], [x, y - 9]], tint(i % 2 ? p.acc : '#c0392b', env)); }
    return null;
  },
});
layer('autos', {
  night: false,
  body(ctx, p, env) {
    const n = p.n, cw = p.w / n, cols = ['#c0392b', '#2f80ed', '#f2c94c', '#e8eef6', '#27ae60', '#5b6573'];
    for (let i = 0; i < n; i++) {
      const x = p.gx + i * cw + 0.06, c = cols[(i * 5 + (p.seed | 0)) % cols.length], ww = cw - 0.12;
      blob(ctx, ...P(x + ww / 2, p.gy + p.d), ww * 22, 4, 0.22);
      const b = solid(ctx, x, p.gy + 0.1, ww, p.d - 0.2, 5, body(c, env), { z: 2, mat: 'metal', lite: lite(env) });
      const f = solid(ctx, x + ww * 0.22, p.gy + 0.15, ww * 0.52, p.d - 0.3, 4, body(shade(c, 0.85), env), { z: 7, lite: true }); windows(ctx, f.left, 1, 1, '#27304a', 0, 0.18, undefined, 0, { fine: false });
      ctx.beginPath(); const w0 = fp(b.left, 0.18, 0.1), w1 = fp(b.left, 0.82, 0.1); ctx.moveTo(w0[0], w0[1]); ctx.lineTo(w1[0], w1[1]); stroke(ctx, 'rgba(0,0,0,.35)', 1.6);
    }
    return null;
  },
});
layer('containers', {
  night: false,
  body(ctx, p, env) {
    const cols = ['#c0392b', '#2f80ed', '#f2994a', '#27ae60', '#8e44ad', '#16a085'], cw = p.w / p.nx, fine = !env.far;
    for (let k = 0; k < p.stack; k++) for (let i = 0; i < p.nx; i++) {
      const c = cols[(i * 3 + k * 2 + (p.seed | 0)) % cols.length], f = box(ctx, p.gx + i * cw + 0.03, p.gy + 0.04, cw - 0.06, p.d - 0.08, 9, body(c, env), { z: k * 9.4 });
      if (fine) {
        ctx.beginPath(); for (let r = 1; r < 5; r++) { const a = fp(f.left, r / 5, 0.1), b = fp(f.left, r / 5, 0.9); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } stroke(ctx, 'rgba(0,0,0,.22)', 1);
        const t = f.top; ctx.beginPath(); ctx.moveTo(t[3][0], t[3][1] + 0.5); ctx.lineTo(t[2][0], t[2][1] + 0.5); stroke(ctx, snowA(0.3), 1); // lit top edge
        strip(ctx, f, 'L', 0, 1, 0, 0.1, sootA(0.18)); // dark bottom rail
      }
    }
    return null;
  },
});
layer('rentrow', {
  body(ctx, p, env) {
    const n = 3, cw = p.w / n, hs = [p.h, p.h - 8, p.h + 4], cs = ['#d89a7a', '#c4785a', '#e0b090'], fine = !lite(env);
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h); contact(ctx, p.gx, p.gy, p.w, p.d);
    let hf = null;
    for (let i = 0; i < n; i++) {
      const q = { gx: p.gx + i * cw + 0.05, gy: p.gy, w: cw - 0.1, d: p.d, h: hs[i], col: cs[i], roofCol: '#7a3a28' };
      const f = solid(ctx, q.gx, q.gy, q.w, q.d, q.h, body(q.col, env), { mat: 'brick', lite: !fine }); windows(ctx, f.left, 2, 3, '#2a2540', glow(env) * 1.3, 0.1, undefined, 0, { fine }); windows(ctx, f.right, 2, 3, '#2a2540', glow(env), 0.1, undefined, 0, { fine });
      for (let j = 0; j < 3; j++) strip(ctx, f, 'L', 0.05, 0.95, 0.12 + j * 0.26, 0.145 + j * 0.26, tint('#f6e6d4', env));
      strip(ctx, f, 'L', 0.4, 0.6, 0, 0.3, '#3a2a30'); roof(ctx, q, f, env, 'gable'); if (i === 1) hf = f;
    }
    signLeft(ctx, hf.left, 'RENT', '#fff', 9, 0.6);
    const [kx, ky] = P(p.gx + p.w / 2, p.gy + p.d + 0.6, 6); ctx.strokeStyle = tint(p.acc, env); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(kx - 5, ky, 3.2, 0, 7); ctx.moveTo(kx - 2, ky); ctx.lineTo(kx + 8, ky); ctx.moveTo(kx + 5, ky); ctx.lineTo(kx + 5, ky + 3); ctx.stroke();
    return [hf.left, hf.right, hf.top];
  },
});

// ---------------------------------------------------------------- far view and dispatch
/** Far view: a plain shaded block with the prop's own colour (no windows, no animation). */
function farDraw(ctx, p, env) {
  const c = p.col || p.color || p.hull || p.acc || '#8a94a8';
  if (p.t === 'tree' || p.t === 'topiary') { ellipse(ctx, ...P(p.gx, p.gy, p.h * 0.6), 8, 7, tint(p.c || '#3f8a4a', env)); return null; }
  const f = box(ctx, p.gx, p.gy, p.w, p.d, Math.max(4, p.h), body(c, env));
  return p.hot ? hot(f) : null;
}
const KEEP_FAR = new Set(['board', 'bank', 'ipo', 'tower', 'crane', 'gantry', 'rentrow', 'exchange', 'hall', 'ship', 'gate', 'lookout']);
/** Draw one prop: through its sprite when it is a layer and the cache can serve it, else straight onto the scene. env.hz carries the prop's haze for the length of the call. */
export function drawProp(ctx, p, env) {
  if (env.far && !KEEP_FAR.has(p.t)) return farDraw(ctx, p, env);
  const prev = env.hz; env.hz = hazeAt(p.z || 0);
  try {
    const f = DRAW[p.t], L = LAYER[p.t];
    if (L && f === L.draw) { // a layer that nobody has replaced: serve its static body from the cache
      const polys = drawSprite(ctx, p, env, L);
      if (polys !== undefined) { if (L.live) L.live(ctx, p, env); return polys; }
    }
    return f ? f(ctx, p, env) : farDraw(ctx, p, env);
  } finally { env.hz = prev; }
}
/** A layer's definition (body, live, pad, night) by prop type: for tests and tools that need to know a sprite's box. */
export const layerOf = (t) => LAYER[t];
export const BUILDING = { body, smoke, sign, signLeft, roof, bldg: DRAW.bldg, hall: DRAW.hall };
