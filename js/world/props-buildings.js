// Buildings: the general building and the hall (walls, windows, doors, awning, band, sign, neon, roof), roofs, and the layered landmarks (cached body + live part) of every district.
// Owner: T3 BUILDINGS (docs/RENDER_PLAN.md). Heavy static props are LAYERS: body() draws everything that never changes into an offscreen sprite once (sprites.js), live() draws what
// moves (smoke, flicker, blink) and pushes lights every frame. Where no canvas can be had (a Node test) a layered prop simply draws body() and live() straight onto the scene.
import { P, box, quad, quadN, windows, shadow, cyl, ellipse, tone, shade, mix, diamond, h2, snowA, sootA } from './iso.js';
import { solid, contact, seams } from './shading.js';
import { tint, body, glow, hot, fp, FONT, lite, hexRgb, seedOf, leftFace, rightFace, stroke, strip, windowGlow, smoke, faceText, sign, signLeft, neonSign, DRAW, layer } from './props-common.js';

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
export function roof(ctx, p, f, env, kind = p.roof || 'flat') {
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
Object.assign(DRAW, {
  shop(ctx, p, env) {
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h, 0.2);
    const f = solid(ctx, p.gx, p.gy, p.w, p.d, p.h, body(p.color, env), { lite: lite(env) });
    windows(ctx, f.left, 2, 1, '#27345a', glow(env) * 1.3, 0.1, undefined, 0, { fine: !lite(env) });
    for (let i = 0; i < 6; i++) strip(ctx, f, 'L', i / 6, (i + 1) / 6, 0.52, 0.66, i % 2 ? '#f4f1e6' : '#c0392b');
    windows(ctx, f.right, 2, 2, '#27345a', glow(env), 0.15);
    return null;
  },
});

// ---------------------------------------------------------------- layered buildings
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

