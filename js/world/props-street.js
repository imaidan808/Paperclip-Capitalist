// Street, yard and landmark props: gates, lookouts, boards, scrap and tyres, barrels and crates, fences, lamps, benches, flags, signs, statues, fountains.
// Owner: T4 PROPS, NATURE AND CHARACTERS (docs/RENDER_PLAN.md).
import { P, box, quad, windows, shadow, blob, cyl, ellipse, lamp, tone, shade, h2, roundRect, snowA, sootA, inkA } from './iso.js';
import { solid } from './shading.js';
import { tint, body, glow, hot, fp, FONT, lite, hexRgb, stroke, strip, signLeft, DRAW } from './props-common.js';

Object.assign(DRAW, {
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
  fence(ctx, p, env) {
    const n = Math.round(p.dirY ? p.d : p.w) * 2, col = p.col || '#6b5a45', a = P(p.gx, p.gy), b = p.dirY ? P(p.gx, p.gy + p.d) : P(p.gx + p.w, p.gy);
    ctx.beginPath(); for (let i = 0; i <= n; i++) { const [x, y] = p.dirY ? P(p.gx, p.gy + i / 2) : P(p.gx + i / 2, p.gy); ctx.rect(x - 1.5, y - p.h, 3, p.h); } ctx.fillStyle = tint(col, env); ctx.fill();
    ctx.beginPath(); for (let i = 0; i <= n; i++) { const [x, y] = p.dirY ? P(p.gx, p.gy + i / 2) : P(p.gx + i / 2, p.gy); ctx.rect(x - 1.5, y - p.h, 1, p.h); } ctx.fillStyle = snowA(0.12); ctx.fill();
    ctx.beginPath(); for (const hh of [6, 14]) { ctx.moveTo(a[0], a[1] - hh); ctx.lineTo(b[0], b[1] - hh); } stroke(ctx, tint(shade(col, 1.2), env), 2);
    return null;
  },
  lamp(ctx, p, env) { lamp(ctx, p.gx, p.gy, glow(env)); return null; },
  neonlamp(ctx, p, env) { const [x, y] = P(p.gx, p.gy); lamp(ctx, p.gx, p.gy, glow(env)); ellipse(ctx, x, y - 32, 3.4, 2.4, p.col); if (!lite(env)) env.lights?.push({ wx: x, wy: y - 32 - env.zoff, r: 40, c: hexRgb(p.col), a: 0.5 }); return null; },
  bench(ctx, p, env) {
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2); ellipse(ctx, x + 2, y + 2, 13, 4.5, inkA(0.2));
    const a = P(p.gx + p.w * 0.1, p.gy + p.d * 0.5), b = P(p.gx + p.w * 0.9, p.gy + p.d * 0.5); ctx.fillStyle = '#2b3342'; ctx.fillRect(a[0] - 1, a[1] - 6, 2, 6); ctx.fillRect(b[0] - 1, b[1] - 6, 2, 6); // legs
    box(ctx, p.gx, p.gy, p.w, p.d, 4, tone('#6b4a2c'), { z: 6 }); box(ctx, p.gx, p.gy, p.w, 0.08, 7, tone('#6b4a2c'), { z: 10 });
    return null;
  },
  pillar(ctx, p, env) { cyl(ctx, p.gx + 0.25, p.gy + 0.25, 0.18, p.h, body(p.col || '#e8e2cc', env)); return null; },
  flag(ctx, p, env) { const [x, y] = P(p.gx, p.gy); ctx.fillStyle = '#c9ccd2'; ctx.fillRect(x - 1, y - p.h, 2, p.h); const k = Math.sin(env.t / 300 + p.gx) * 2; quad(ctx, [[x + 1, y - p.h], [x + 15, y - p.h + 3 + k], [x + 15, y - p.h + 11 + k], [x + 1, y - p.h + 9]], tint(p.col, env)); ellipse(ctx, x, y - p.h - 1, 1.6, 1.6, '#e8cd6a'); return null; },
  lantern(ctx, p, env) { const [x, y] = P(p.gx, p.gy); ctx.fillStyle = '#4a3a2a'; ctx.fillRect(x - 1, y - p.h, 2, p.h); ellipse(ctx, x, y - p.h + 3, 4, 5, tint(p.col, env)); ellipse(ctx, x - 1, y - p.h + 2, 1.5, 2, snowA(0.3)); if (glow(env) > 0.1 && !lite(env)) env.lights?.push({ wx: x, wy: y - p.h - env.zoff, r: 40, c: '255,200,110', a: 0.5 * glow(env) }); return null; },
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

  bollard(ctx, p, env) { cyl(ctx, p.gx + 0.15, p.gy + 0.15, 0.12, p.h, body(p.col, env)); const [x, y] = P(p.gx + 0.15, p.gy + 0.15, p.h); ellipse(ctx, x, y, 3.2, 1.6, shade(p.col, 1.25)); return null; },

  billboard(ctx, p, env) {
    const [x, y] = P(p.gx + p.w / 2, p.gy); ctx.fillStyle = '#2b3342'; ctx.fillRect(x - p.w * 22, y - p.h + 6, 3, p.h - 6); ctx.fillRect(x + p.w * 22 - 3, y - p.h + 6, 3, p.h - 6);
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(x - p.w * 22, y - p.h + 6, 1, p.h - 6); ctx.fillRect(x + p.w * 22 - 3, y - p.h + 6, 1, p.h - 6);
    const hue = p.anim && env.t ? (env.t / 30) % 360 : 0, c = p.anim && env.t ? `hsl(${(hue + 280) % 360},70%,${env.dim ? 30 : 55}%)` : tint(p.col, env);
    const f = box(ctx, p.gx, p.gy, p.w, p.d, 18, body('#1a2030', env), { z: p.h - 18 }); strip(ctx, f, 'L', 0.04, 0.96, 0.1, 0.9, c); strip(ctx, f, 'L', 0.04, 0.96, 0.1, 0.16, snowA(0.14)); signLeft(ctx, f.left, p.text, '#fff', 11, 0.5);
    if (!lite(env)) { const [lx, ly] = fp(f.left, 0.5, 0.5); env.lights?.push({ wx: lx, wy: ly - env.zoff, r: 70, c: '255,150,240', a: 0.28 * (p.anim ? 1 : 0.6) }); }
    return null;
  },
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
  spot(ctx, p, env) {
    const [x, y] = P(p.gx + 0.3, p.gy + 0.3); solid(ctx, p.gx, p.gy, p.w, p.d, 8, body('#2b3342', env), { lite: true }); ellipse(ctx, x, y - 10, 4, 3, tint(p.col, env));
    if (!lite(env)) { const a = (env.t ? Math.sin(env.t / 1800 + p.gx) : 0) * 0.5 - 0.4; ctx.save(); ctx.globalAlpha = 0.16 + 0.12 * glow(env); ctx.fillStyle = p.col; ctx.beginPath(); ctx.moveTo(x - 2, y - 10); ctx.lineTo(x + Math.sin(a) * 90 - 14, y - 10 - Math.cos(a) * 90); ctx.lineTo(x + Math.sin(a) * 90 + 14, y - 10 - Math.cos(a) * 90); ctx.lineTo(x + 2, y - 10); ctx.fill(); ctx.restore(); }
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

});
