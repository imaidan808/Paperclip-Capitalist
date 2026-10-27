// Scenery art. Each drawer paints one prop (ctx already shifted to the prop's elevation) and returns hit polygons for clickable ones.
import { P, sx, sy, box, quad, windows, shadow, cyl, ellipse, tree, lamp, tone, shade, mix, diamond, facePoint, h2, hash, roundRect } from './iso.js';

const body = (c, env) => tone(env.dim ? mix(c, '#1a2030', env.dim) : c);
const glow = (env) => env.night;
const hot = (faces) => [faces.left, faces.right, faces.top];

function smoke(ctx, x, y, t, n = 4, col = '255,255,255') {
  for (let i = 0; i < n; i++) { const k = ((t / 1800) + i / n) % 1; ctx.fillStyle = `rgba(${col},${0.32 * (1 - k)})`; ctx.beginPath(); ctx.arc(x + Math.sin(k * 5 + i) * 4 + k * 8, y - k * 34, 3 + k * 7, 0, 7); ctx.fill(); }
}
function sign(ctx, faceRight, text, color = '#ffd36e', font = 11, v = 0.82) {
  const [x, y] = facePoint(faceRight, 0.5, v);
  ctx.save(); ctx.translate(x, y); ctx.transform(1, -0.5, 0, 1, 0, 0); ctx.fillStyle = color; ctx.font = `800 ${font}px ui-monospace, Menlo, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 0); ctx.restore();
}
function signLeft(ctx, faceLeft, text, color = '#ffd36e', font = 11, v = 0.82) {
  const [x, y] = facePoint(faceLeft, 0.5, v);
  ctx.save(); ctx.translate(x, y); ctx.transform(1, 0.5, 0, 1, 0, 0); ctx.fillStyle = color; ctx.font = `800 ${font}px ui-monospace, Menlo, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 0); ctx.restore();
}

export const DRAW = {
  shack(ctx, p, env) {
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h);
    const f = box(ctx, p.gx, p.gy, p.w, p.d, p.h, body('#7d6a55', env));
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) { const a = facePoint(f.left, i / 10, 0), b = facePoint(f.left, i / 10, 1); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    quad(ctx, [facePoint(f.right, 0.35, 0), facePoint(f.right, 0.62, 0), facePoint(f.right, 0.62, 0.62), facePoint(f.right, 0.35, 0.62)], '#2a2118');
    windows(ctx, f.left, 2, 1, '#1d2740', glow(env) * 1.4);
    box(ctx, p.gx - 0.2, p.gy - 0.2, p.w + 0.4, p.d + 0.4, 4, body('#5b4a3a', env), { z: p.h });
    const [cx, cy] = P(p.gx + p.w * 0.8, p.gy + p.d * 0.3, p.h + 4); cyl(ctx, p.gx + p.w * 0.8, p.gy + p.d * 0.3, 0.25, 16, tone('#6a6f78'), p.h + 4); smoke(ctx, cx, cy - 16, env.t, 4);
    signLeft(ctx, f.left, 'SKILLS', '#ffd36e', 10, 0.8);
    return hot(f);
  },
  depot(ctx, p, env) {
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h);
    const f = box(ctx, p.gx, p.gy, p.w, p.d, p.h, body(p.color, env));
    box(ctx, p.gx - 0.1, p.gy - 0.1, p.w + 0.2, p.d + 0.2, 3, body('#d8d2c2', env), { z: p.h });
    for (let i = 0; i < 3; i++) { const u0 = 0.1 + i * 0.3, u1 = u0 + 0.22; quad(ctx, [facePoint(f.left, u0, 0), facePoint(f.left, u1, 0), facePoint(f.left, u1, 0.62), facePoint(f.left, u0, 0.62)], '#222a38'); for (let k = 1; k < 5; k++) { const a = facePoint(f.left, u0, k * 0.124), b = facePoint(f.left, u1, k * 0.124); ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } }
    windows(ctx, f.right, 3, 1, '#1d2740', glow(env), 0.15);
    signLeft(ctx, f.left, 'FREIGHT', '#ffffff', 11, 0.86);
    return hot(f);
  },
  board(ctx, p, env) {
    const [x, y] = P(p.gx + p.w / 2, p.gy, 0);
    ctx.fillStyle = '#2b3342'; ctx.fillRect(x - 26, y - 6, 4, 6); ctx.fillRect(x + 22, y - 6, 4, 6); ctx.fillRect(x - 25, y - 30, 3, 26); ctx.fillRect(x + 22, y - 30, 3, 26);
    const f = box(ctx, p.gx, p.gy, p.w, p.d, 22, body('#202a3d', env), { z: 18 });
    quad(ctx, [facePoint(f.left, 0.04, 0.1), facePoint(f.left, 0.96, 0.1), facePoint(f.left, 0.96, 0.9), facePoint(f.left, 0.04, 0.9)], env.surge ? '#ff3da8' : '#0f1626');
    signLeft(ctx, f.left, env.boardText || p.text, '#7be3ff', 10, 0.5);
    if (glow(env) > 0.1) { ctx.fillStyle = `rgba(123,227,255,${0.12 * glow(env)})`; ctx.fillRect(x - 40, y - 60, 80, 50); }
    return hot(f);
  },
  crane(ctx, p, env) {
    const [x, y] = P(p.gx, p.gy);
    ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x - 6, y - 118); ctx.moveTo(x + 14, y); ctx.lineTo(x + 6, y - 118); ctx.stroke();
    ctx.lineWidth = 2; for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x - 14 + i * 1.3, y - i * 20); ctx.lineTo(x + 14 - i * 1.3, y - i * 20 + 8); ctx.stroke(); }
    ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x - 70, y - 118); ctx.lineTo(x + 26, y - 118); ctx.stroke();
    const trol = x - 40 + Math.sin(env.t / 2600) * 22, hook = 46 + Math.sin(env.t / 1700) * 12;
    ctx.strokeStyle = '#2b3342'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(trol, y - 118); ctx.lineTo(trol, y - 118 + hook); ctx.stroke();
    box(ctx, p.gx - 1.2 + (trol - x + 40) / 64 * 0.2, p.gy - 0.6, 0.5, 0.5, 8, tone('#b0493a'), { z: 118 - hook - 8 });
    ellipse(ctx, x, y + 2, 20, 8, 'rgba(8,10,20,.3)');
    if (glow(env) > 0.2) { ellipse(ctx, x - 70, y - 118, 3, 3, '#ff4d4d'); }
    return null;
  },
  scrap(ctx, p, env) {
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h * 0.7, 0.22);
    const cols = ['#7a7f88', '#8c4a2f', '#5b6573', '#a07a3a', '#6b5a4a'];
    for (let i = 0; i < 5; i++) { const r1 = h2(p.seed, i), r2 = h2(p.seed, i + 9), r3 = h2(p.seed, i + 19); box(ctx, p.gx + r1 * (p.w - 0.7), p.gy + r2 * (p.d - 0.7), 0.5 + r3 * 0.4, 0.5 + r1 * 0.4, (p.h * (0.4 + r2 * 0.6)) * 0.8, body(cols[i % cols.length], env)); }
    return null;
  },
  tires(ctx, p, env) {
    const [x, y] = P(p.gx + 0.45, p.gy + 0.45);
    for (let i = 0; i < p.n; i++) { ellipse(ctx, x, y - i * 7, 12, 6, '#161a22'); ellipse(ctx, x, y - i * 7 - 2, 12, 6, '#262c38'); ellipse(ctx, x, y - i * 7 - 2, 5, 2.6, '#10131a'); }
    return null;
  },
  barrel(ctx, p, env) {
    cyl(ctx, p.gx + 0.35, p.gy + 0.35, 0.3, 20, body(p.color, env));
    if (p.fire) { const [x, y] = P(p.gx + 0.35, p.gy + 0.35, 20), k = Math.sin(env.t / 90) * 2; quad(ctx, [[x - 6, y], [x + k, y - 20 - k], [x + 6, y]], '#ff8a2b'); quad(ctx, [[x - 3, y], [x - k, y - 11], [x + 3, y]], '#ffd36e'); if (glow(env) > 0.1 || true) { const g = ctx.createRadialGradient(x, y - 4, 2, x, y - 4, 44); g.addColorStop(0, `rgba(255,150,60,${0.35 + 0.2 * glow(env)})`); g.addColorStop(1, 'rgba(255,150,60,0)'); ctx.fillStyle = g; ctx.fillRect(x - 46, y - 50, 92, 92); } }
    return null;
  },
  crates(ctx, p, env) {
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h, 0.2);
    for (let i = 0; i < p.n; i++) box(ctx, p.gx + 0.1 * i, p.gy + 0.1 * i, 0.9, 0.9, 12, body(i % 2 ? '#a07a45' : '#b58a4f', env), { z: i * 12, line: 'rgba(0,0,0,.25)' });
    return null;
  },
  junkcar(ctx, p, env) {
    shadow(ctx, p.gx, p.gy, p.w, p.d, 22);
    box(ctx, p.gx, p.gy, p.w, p.d, 9, body(p.color, env), { z: 4 });
    const f = box(ctx, p.gx + p.w * 0.25, p.gy + 0.15, p.w * 0.5, p.d - 0.3, 9, body(shade(p.color, 0.9), env), { z: 13 });
    windows(ctx, f.left, 2, 1, '#27304a', 0, 0.15);
    for (const [wx, wy] of [[0.18, 0], [0.8, 0]]) { const [x, y] = P(p.gx + p.w * wx, p.gy + p.d, 0); ellipse(ctx, x, y - 2, 5, 5, '#111'); }
    return null;
  },
  deadtree(ctx, p, env) {
    const [x, y] = P(p.gx, p.gy);
    ctx.strokeStyle = '#4a3a2c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 30); ctx.lineWidth = 2; ctx.moveTo(x, y - 18); ctx.lineTo(x - 10, y - 34); ctx.moveTo(x, y - 24); ctx.lineTo(x + 9, y - 38); ctx.stroke();
    return null;
  },
  fence(ctx, p, env) {
    const n = Math.round(p.dirY ? p.d : p.w) * 2;
    for (let i = 0; i <= n; i++) { const [x, y] = p.dirY ? P(p.gx, p.gy + i / 2) : P(p.gx + i / 2, p.gy); ctx.fillStyle = '#6b5a45'; ctx.fillRect(x - 1.5, y - p.h, 3, p.h); }
    const a = P(p.gx, p.gy), b = p.dirY ? P(p.gx, p.gy + p.d) : P(p.gx + p.w, p.gy);
    ctx.strokeStyle = '#8a7a62'; ctx.lineWidth = 2; for (const hh of [6, 14]) { ctx.beginPath(); ctx.moveTo(a[0], a[1] - hh); ctx.lineTo(b[0], b[1] - hh); ctx.stroke(); }
    return null;
  },
  lamp(ctx, p, env) { lamp(ctx, p.gx, p.gy, glow(env)); return null; },
  tree(ctx, p, env) { tree(ctx, p.gx, p.gy, p.s, Math.sin(env.t / 900 + p.seed) * 2 * env.wind, env.dim ? mix(p.c || '#2f7d4b', '#1a2030', env.dim) : p.c || '#2f7d4b'); return null; },
  bench(ctx, p, env) { box(ctx, p.gx, p.gy, p.w, p.d, 4, tone('#6b4a2c'), { z: 6 }); box(ctx, p.gx, p.gy, p.w, 0.08, 7, tone('#6b4a2c'), { z: 10 }); return null; },
  bank(ctx, p, env) {
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h);
    box(ctx, p.gx - 0.4, p.gy - 0.4, p.w + 0.8, p.d + 0.8, 5, body('#b9b2a0', env));
    const f = box(ctx, p.gx, p.gy, p.w, p.d, p.h, body(env.crunch ? '#c9a09a' : '#ded6c2', env), { z: 5 });
    ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) { const a = facePoint(f.left, 0.1 + i * 0.16, 0.05), b = facePoint(f.left, 0.1 + i * 0.16, 0.8); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    quad(ctx, [facePoint(f.left, 0, 1), facePoint(f.left, 1, 1), facePoint(f.left, 0.5, 1.28)], body('#cfc6b0', env).l);
    quad(ctx, [facePoint(f.right, 0.3, 0.55), facePoint(f.right, 0.7, 0.55), facePoint(f.right, 0.7, 0), facePoint(f.right, 0.3, 0)], '#2a2118');
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, 5 + p.h);
    ctx.fillStyle = body('#d8b94a', env).t; ctx.beginPath(); ctx.ellipse(x, y - 8, 18, 12, 0, Math.PI, 0); ctx.fill(); ellipse(ctx, x, y - 8, 18, 5, body('#e8cd6a', env).t);
    ctx.fillStyle = '#ffffff'; ctx.font = '800 11px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center'; ctx.fillText('BANK', x, y + 14);
    if (env.locked) { ctx.fillStyle = 'rgba(10,14,26,.35)'; ctx.fillRect(x - 70, y - 40, 140, 120); }
    return hot(f);
  },
  office(ctx, p, env) {
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h);
    const f = box(ctx, p.gx, p.gy, p.w, p.d, p.h, body(p.color, env));
    windows(ctx, f.left, 3, 3, '#1d2f55', glow(env) * 1.2); windows(ctx, f.right, 3, 3, '#1d2f55', glow(env) * 1.2);
    box(ctx, p.gx + 0.2, p.gy + 0.2, p.w - 0.4, p.d - 0.4, 4, body(shade(p.color, 0.8), env), { z: p.h });
    sign(ctx, f.right, p.sign, '#ffffff', 10, 0.1);
    if (env.alertAudit) { const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, p.h + 12); const k = 0.5 + 0.5 * Math.sin(env.t / 260); ellipse(ctx, x, y, 5, 5, `rgba(255,${80 + 100 * k},60,1)`); const g = ctx.createRadialGradient(x, y, 2, x, y, 40); g.addColorStop(0, `rgba(255,90,60,${0.5 * k})`); g.addColorStop(1, 'rgba(255,90,60,0)'); ctx.fillStyle = g; ctx.fillRect(x - 44, y - 44, 88, 88); }
    return hot(f);
  },
  shop(ctx, p, env) {
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h, 0.2);
    const f = box(ctx, p.gx, p.gy, p.w, p.d, p.h, body(p.color, env));
    windows(ctx, f.left, 2, 1, '#27345a', glow(env) * 1.3, 0.1);
    for (let i = 0; i < 6; i++) { const u0 = i / 6, u1 = (i + 1) / 6; quad(ctx, [facePoint(f.left, u0, 0.52), facePoint(f.left, u1, 0.52), facePoint(f.left, u1, 0.66), facePoint(f.left, u0, 0.66)], i % 2 ? '#f4f1e6' : '#c0392b'); }
    windows(ctx, f.right, 2, 2, '#27345a', glow(env), 0.15);
    return null;
  },
  tower(ctx, p, env) {
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h);
    const f = box(ctx, p.gx, p.gy, p.w, p.d, p.h, body(p.color, env));
    const rows = Math.max(4, Math.round(p.h / 11));
    windows(ctx, f.left, 4, rows, '#16264a', glow(env) * 1.5, 0.06); windows(ctx, f.right, 4, rows, '#10203f', glow(env) * 1.5, 0.06);
    box(ctx, p.gx + p.w * 0.3, p.gy + p.d * 0.3, p.w * 0.4, p.d * 0.4, 10, body(shade(p.color, 0.85), env), { z: p.h });
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, p.h + 10);
    ctx.strokeStyle = '#8a94ad'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 24); ctx.stroke();
    if (Math.sin(env.t / 700 + p.seed) > 0) ellipse(ctx, x, y - 24, 2.2, 2.2, '#ff4d4d');
    return hot(f);
  },
  ipo(ctx, p, env) {
    shadow(ctx, p.gx, p.gy, p.w, p.d, p.h, 0.34);
    box(ctx, p.gx - 0.3, p.gy - 0.3, p.w + 0.6, p.d + 0.6, 6, body('#c9c2ae', env));
    const f = box(ctx, p.gx, p.gy, p.w, p.d, p.h * 0.72, body('#6f8fd0', env), { z: 6 });
    const f2 = box(ctx, p.gx + 0.5, p.gy + 0.5, p.w - 1, p.d - 1, p.h * 0.28, body('#8aa6e0', env), { z: 6 + p.h * 0.72 });
    windows(ctx, f.left, 5, 12, '#16264a', glow(env) * 1.6, 0.05); windows(ctx, f.right, 5, 12, '#10203f', glow(env) * 1.6, 0.05); windows(ctx, f2.left, 3, 5, '#16264a', glow(env) * 1.6, 0.08); windows(ctx, f2.right, 3, 5, '#10203f', glow(env) * 1.6, 0.08);
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, 6 + p.h);
    quad(ctx, [[x - 14, y], [x + 14, y], [x, y - 24]], '#e8cd6a'); ellipse(ctx, x, y - 6, 5, 5, '#fff3b0');
    const k = 0.5 + 0.5 * Math.sin(env.t / 600); const g = ctx.createRadialGradient(x, y - 8, 4, x, y - 8, 70); g.addColorStop(0, `rgba(255,224,120,${0.3 + 0.25 * k})`); g.addColorStop(1, 'rgba(255,224,120,0)'); ctx.fillStyle = g; ctx.fillRect(x - 74, y - 78, 148, 148);
    ctx.fillStyle = '#ffffff'; ctx.font = '800 12px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center'; const [bx, by] = facePoint(f.left, 0.5, 0.06); ctx.fillText('EXIT', bx, by);
    return hot(f);
  },
  fountain(ctx, p, env) {
    const cx = p.gx + p.w / 2, cy = p.gy + p.d / 2, [x, y] = P(cx, cy);
    ellipse(ctx, x, y + 2, 46, 23, '#8a94ad'); ellipse(ctx, x, y - 2, 42, 21, '#46577c'); ellipse(ctx, x, y - 3, 38, 19, '#4a9fd0');
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28 + env.t / 1500, r = 12 + 5 * Math.sin(env.t / 300 + i); ellipse(ctx, x + Math.cos(a) * r, y - 3 + Math.sin(a) * r * 0.5, 1.6, 1.2, 'rgba(220,245,255,.7)'); }
    ctx.fillStyle = '#d8d2c2'; ctx.fillRect(x - 3, y - 22, 6, 20);
    for (let i = 0; i < 8; i++) { const k = ((env.t / 700) + i / 8) % 1; ellipse(ctx, x + Math.sin(i * 2.4) * k * 18, y - 22 - Math.sin(k * 3.14) * 18 + k * 10, 1.8, 1.8, `rgba(220,245,255,${0.9 - k * 0.6})`); }
    return null;
  },
  helipad(ctx, p, env) {
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2);
    ellipse(ctx, x, y, 44, 22, '#2a3042'); ellipse(ctx, x, y, 40, 20, null, '#ffd36e', 2);
    ctx.fillStyle = '#ffd36e'; ctx.font = '800 22px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center'; ctx.save(); ctx.translate(x, y + 7); ctx.scale(1, 0.55); ctx.fillText('H', 0, 0); ctx.restore();
    if (Math.sin(env.t / 500) > 0) ellipse(ctx, x + 40, y, 2.5, 2.5, '#5dff9e');
    return null;
  },
};

export function drawProp(ctx, p, env) { const f = DRAW[p.t]; return f ? f(ctx, p, env) : null; }
export const BUILDING = { body, smoke, sign, signLeft };
