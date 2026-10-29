// The yard and the landmarks of the toy island's districts, as V2 drawers: loose crates, tyre stacks, oil drums (and the burning one), scrap heaps, the gates that cut a locked district off, the lookout, the bronze bull,
// the fountain and the helipad.
// Owner: T4 PROPS, NATURE AND CHARACTERS (docs/RENDER_PLAN.md). docs/ART_DIRECTION.md 4.1: crates are rounded plank boxes; tyres are fat plum tori with one painted cream tyre in a stack of three or more; a drum has two raised
// ribs and a sheen strip, the burning one a cartoon flame of three tongues that bobs over 1.1 s and a warm light pool; a scrap heap is rounded junk in rust, teal, cornflower and ochre with a rubber duck on top; a gate
// is hazard furniture (candy-striped boom, a gold padlock plate, cones, warning lamps), the raised bridge leaf a plank deck with chevrons, the ferry a stubby white boat that bobs; the fountain throws arcs of droplets.
// Everything keeps its footprint and its hit shape (statics.js leaves the gate's circle and the board's faces to the frame); what moves is live, and stands still under Calm, Off and reduced motion.
import { registerProp } from './stack.js';
import { shared } from './atlas.js';
import { WOOD, METAL, TOY, SEA, ROAD, PAVE, BLOOM, GRASS, LIGHT, INK, TILE } from './palette.js';
import { roundedBox, roundedPoly } from './solids.js';
import { stampGlow } from './gfx.js';
import { plankBox } from './stock.js';
import { P, col, lifted, toyOf, hi, shd, ball, disc, rr, poly, bar, post, drum, stand, stampSoft, castShadow, lettering, fq, facePoint, mix, shade, clamp, seedOf, vs, vseed } from './toys.js';
import { h2 } from './iso.js';

const glowAt = (ctx, rgb, x, y, r, a) => { if (a > 0.02) { const pa = ctx.globalAlpha; ctx.globalCompositeOperation = 'lighter'; stampGlow(ctx, rgb, x, y, r, a); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = pa; } };
const cast = (g, p, h, env) => castShadow(g, p.gx, p.gy, p.w, p.d, h, { night: env.night || 0, dusk: 0 });

// ---------------------------------------------------------------- tyres, drums, crates
function tyre(g, x, y, rx, c, c2) { // a fat torus: a side band, a lit top with the hole in it, a highlight arc
  const ry = rx * 0.5, th = 6.6;
  g.beginPath(); g.moveTo(x - rx, y); g.lineTo(x - rx, y - th); g.lineTo(x + rx, y - th); g.lineTo(x + rx, y); g.ellipse(x, y, rx, ry, 0, 0, Math.PI, false); g.closePath(); g.fillStyle = c2; g.fill();
  g.beginPath(); g.moveTo(x - rx, y); g.lineTo(x - rx, y - th); g.lineTo(x - rx * 0.1, y - th); g.lineTo(x - rx * 0.1, y + ry * 0.99); g.ellipse(x, y, rx, ry, 0, Math.PI * 0.6, Math.PI, false); g.closePath(); g.fillStyle = c; g.fill();
  disc(g, x, y - th, rx, ry, c2); disc(g, x, y - th, rx * 0.96, ry * 0.94, c); disc(g, x + 0.5, y - th + 0.5, rx * 0.52, ry * 0.5, shade(c2, 0.55)); disc(g, x, y - th - 0.4, rx * 0.4, ry * 0.38, mix(c, '#8a86b8', 0.35));
  g.beginPath(); g.ellipse(x, y - th, rx * 0.86, ry * 0.84, 0, Math.PI * 1.08, Math.PI * 1.62, false); g.strokeStyle = '#fffbe6'; g.globalAlpha *= 0.4; g.lineWidth = Math.max(1.5, rx * 0.12); g.stroke(); g.globalAlpha /= 0.4;
}
shared('tires', {
  body(g, p, env) {
    const [x, y] = P(p.gx + 0.45, p.gy + 0.45), n = p.n || 3, s = vs(p), cream = n >= 3 ? 1 : -1;
    stampSoft(g, x + 6, y + 2, 20 + n * 1.5, 8, 0.22); stand(g, x, y + 1, 13, 5.6);
    for (let i = 0; i < n; i++) { const xo = (h2(s, i) - 0.5) * 3, yy = y - i * 6.4, painted = i === cream; tyre(g, x + xo, yy, 11.6, col(painted ? '#fff3d6' : '#4b4770', env), col(painted ? '#e6d9bc' : '#34315a', env)); }
    return null;
  }, vary: ['n', '#'], ext: [6, 6, 6, 6],
});
shared('barrel', {
  body(g, p, env) {
    const [x, y] = P(p.gx + 0.35, p.gy + 0.35), c = col(toyOf(p.color || TOY.red), env);
    stampSoft(g, x + 6, y + 2, 17, 6.4, 0.24); stand(g, x, y + 1, 11.4, 5);
    drum(g, x, y, 10.6, 20, c, { ribs: [0.26, 0.7], ribCol: shade(c, 0.76) });
    if (p.fire) { disc(g, x, y - 20, 8.6, 4.2, '#3a2f5e'); disc(g, x, y - 19.4, 6.6, 3.1, col('#ff9a3a', env)); }
    return null;
  },
  live(ctx, p, env) {
    if (!p.fire || env.far) return;
    const [x, y] = P(p.gx + 0.35, p.gy + 0.35, 20), k = env.t ? Math.sin((env.t / 1100) * Math.PI * 2) : 0, a = env.t ? Math.sin((env.t / 1100) * Math.PI * 2 + 2) : 0.3;
    const tongue = (dx, w, h, c) => { ctx.beginPath(); ctx.moveTo(x + dx - w, y); ctx.quadraticCurveTo(x + dx - w * 0.9, y - h * 0.55, x + dx + (w * 0.2) * k, y - h); ctx.quadraticCurveTo(x + dx + w * 0.9, y - h * 0.5, x + dx + w, y); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); };
    tongue(-3.6, 3.6, 12 + 2 * a, '#ff9a3a'); tongue(3.2, 3.6, 13 - 2 * k, '#ff9a3a'); tongue(0, 4.6, 17 + 3 * k, '#ff7a3a'); tongue(0.4, 2.8, 11 + 2 * k, '#ffd84d'); tongue(0.2, 1.4, 6 + k, '#fff7dc');
    for (let i = 0; i < 2; i++) { const q = env.t ? ((env.t / 1800) + i / 2) % 1 : 0.3 + i * 0.3; ctx.globalAlpha = 0.8 * (1 - q); disc(ctx, x + (i ? 5 : -5) * q + Math.sin(q * 6) * 2, y - 14 - q * 26, 1.3, 1.3, '#ffd36e'); ctx.globalAlpha = 1; }
    if (!env.lite) glowAt(ctx, '255,150,60', x, y - 6, 30, 0.3 + 0.2 * env.night);
    if (env.lights && !env.lite) env.lights.push({ wx: x, wy: y - 6 - env.zoff, r: 52, c: '255,150,60', a: 0.45 });
  },
  vary: ['color', 'fire'], ext: [6, 6, 6, 6],
});
shared('crates', {
  body(g, p, env) {
    const n = p.n || 1, [mx, my] = P(p.gx + p.w / 2, p.gy + p.d / 2), s = vs(p); cast(g, p, 13 * n, env); stand(g, mx, my + 2, 18, 8);
    for (let i = 0; i < n; i++) {
      const w = Math.min(0.88, p.w - 0.1 * i), d = Math.min(0.88, p.d - 0.1 * i), c = i % 3 === 2 ? toyOf(['#ff9a3a', '#4a8ff0', '#52cf7c', '#ff7fb8'][(s >>> 2) % 4]) : [WOOD.mid, WOOD.light][(i + (s & 1)) % 2];
      plankBox(g, p.gx + 0.1 * i + (h2(s, i + 5) - 0.5) * 0.06, p.gy + 0.1 * i, w, d, 13, i * 13, col(c, env), { r: 3.2 });
    }
    return null;
  }, vary: ['n', '#'], ext: [9, 6, 11, 11],
});

// ---------------------------------------------------------------- the scrap heaps
const JUNK = ['#c9693d', '#3fb9b2', '#5b8bd0', '#d4c070', '#fffaf0', '#cdeedc', '#e89a6a'];
shared('scrap', {
  body(g, p, env) {
    const n = p.big || p.w > 3 ? 9 : 5, s = (p.seed | 0) + 1, pieces = [];
    for (let i = 0; i < n; i++) { const r1 = h2(s, i), r2 = h2(s, i + 9), r3 = h2(s, i + 19); pieces.push({ i, gx: p.gx + r1 * (p.w - 0.8), gy: p.gy + r2 * (p.d - 0.8), w: 0.5 + r3 * 0.4, d: 0.5 + r1 * 0.4, h: Math.max(8, p.h * (0.35 + r2 * 0.55) * 0.8), kind: i % 5 }); }
    pieces.sort((a, b) => a.gx + a.gy - (b.gx + b.gy));
    const [mx, my] = P(p.gx + p.w / 2, p.gy + p.d / 2); cast(g, p, p.h * 0.7, env); stampSoft(g, mx, my + 2, p.w * 22, p.d * 11, 0.2);
    let top = null;
    for (const q of pieces) {
      const c = col(JUNK[(q.i + s) % JUNK.length], env), [x, y] = P(q.gx + q.w / 2, q.gy + q.d / 2);
      if (q.kind === 2) { drum(g, x, y + 2, 9, q.h * 0.9, c, { ribs: [0.3, 0.7] }); }
      else if (q.kind === 3) { tyre(g, x, y + 2, 10, col('#4b4770', env), col('#34315a', env)); tyre(g, x + 0.6, y - 4, 10, col('#4b4770', env), col('#34315a', env)); }
      else { const F = roundedBox(g, q.gx, q.gy, q.w, q.d, q.h, c, { r: 3 }); if (q.kind === 0) { fq(g, F.left, 0.12, 0.88, 0.5, 0.54, shade(c, 0.78)); rr(g, facePoint(F.left, 0.82, 0.74)[0] - 0.8, facePoint(F.left, 0.82, 0.74)[1] - 3, 1.8, 6, 0.9, col('#b2bed8', env)); } else if (q.kind === 1) { fq(g, F.left, 0.1, 0.9, 0.3, 0.4, shade(c, 0.8)); fq(g, F.left, 0.1, 0.5, 0.62, 0.74, mix(c, '#c9693d', 0.5)); } else if (q.kind === 4) { for (const [u, v] of [[0.14, 0.14], [0.86, 0.14], [0.14, 0.86], [0.86, 0.86]]) { const [rx, ry] = facePoint(F.left, u, v); disc(g, rx, ry, 1.1, 1.1, hi(c, 0.7)); } } if (!top || y - q.h < top[1]) top = [x, y - q.h - 2]; }
    }
    if (top) { const [x, y] = top; ball(g, x, y - 3.4, 4.2, col('#ffd84d', env)); ball(g, x + 3.4, y - 6, 2.9, col('#ffd84d', env)); poly(g, [[x + 5.4, y - 6.4], [x + 8.4, y - 5.6], [x + 5.4, y - 4.6]], col(TOY.orange, env)); disc(g, x + 4, y - 6.8, 0.6, 0.6, '#2c2a56'); }
    return null;
  }, vary: ['seed', 'big'], ext: [9, 6, 6, 9],
});

// ---------------------------------------------------------------- the gates (a locked district's way in is hazard furniture; drawn straight onto the scene, since it reads the district's lock)
const CONE = (g, x, y, env) => { stampSoft(g, x + 2, y + 1, 7, 2.6, 0.2); disc(g, x, y, 5.2, 2.2, col('#ff7a3a', env)); poly(g, [[x - 3.6, y - 0.5], [x + 3.6, y - 0.5], [x + 1.4, y - 11], [x - 1.4, y - 11]], col(TOY.orange, env)); poly(g, [[x - 3.6, y - 0.5], [x - 0.2, y - 0.5], [x - 0.6, y - 11], [x - 1.4, y - 11]], hi(TOY.orange, 0.3)); rr(g, x - 2.6, y - 6.2, 5.2, 2, 0.9, '#fffaf0'); ball(g, x, y - 11.4, 1.7, col(TOY.orange, env)); };
function lampOn(g, x, y, env, ph) { const k = env.t ? 0.5 + 0.5 * Math.sin((env.t / 3200) * Math.PI * 2 + ph) : 0.6; ball(g, x, y, 3.2, mix('#a8503f', '#ff5f4e', 0.3 + 0.7 * k)); if (k > 0.6) glowAt(g, '255,90,70', x, y, 12, 0.35 * (k - 0.6) * 2.5); }
registerProp('gate', {
  draw(ctx, p, env) {
    const gx = p.gx + 0.15, gy = p.gy + 0.15, hx = p.hx, hy = p.hy, nx = -hy, ny = hx, k = p.gk;
    if (k === 'ferry') {
      const t = env.locked || !env.t ? 0.05 : 0.5 + 0.5 * Math.sin(env.t / 5200), bx = gx + (p.fx - gx) * (env.locked ? 0.05 : 0.08 + t * 0.84), by = gy + (p.fy - gy) * (env.locked ? 0.05 : 0.08 + t * 0.84), alongX = Math.abs(p.fx - gx) > Math.abs(p.fy - gy);
      const w = alongX ? 2.6 : 1.2, d = alongX ? 1.2 : 2.6, z0 = -p.z, bob = env.t ? Math.sin(env.t / 880) * 1.2 : 0, [sx, sy] = P(bx, by, z0);
      stampSoft(ctx, sx + 5, sy + 4, (w + d) * 17, (w + d) * 7, 0.22); ctx.save(); ctx.translate(0, bob);
      const F = roundedBox(ctx, bx - w / 2, by - d / 2, w, d, 8, col('#fffaf0', env), { z: z0 - 1, r: 6 }); fq(ctx, F.left, 0.02, 0.98, 0.36, 0.58, col('#4a8ff0', env)); fq(ctx, F.right, 0.02, 0.98, 0.36, 0.58, col('#3a6fc0', env)); fq(ctx, F.left, 0.02, 0.98, 0.0, 0.16, col('#ff5f4e', env)); fq(ctx, F.right, 0.02, 0.98, 0.0, 0.16, shade(col('#ff5f4e', env), 0.7));
      for (let i = 0; i < 5; i++) { const [px, py] = facePoint(F.left, 0.12 + i * 0.19, 0.12); ball(ctx, px, py, 2, col('#222a52', env)); } // fenders along the side
      const C = roundedBox(ctx, bx - w * 0.3, by - d * 0.3, w * 0.6, d * 0.6, 11, col(env.locked ? '#f2efe8' : '#fffaf0', env), { z: z0 + 7, r: 4.6 }); fq(ctx, C.left, 0.08, 0.92, 0.42, 0.82, col(env.locked ? '#9fb4d8' : '#78bdec', env)); fq(ctx, C.right, 0.08, 0.92, 0.42, 0.82, shade(col('#78bdec', env), 0.72));
      for (let i = 0; i < 4; i++) { const [px, py] = facePoint(F.left, 0.18 + i * 0.2, 0.74); disc(ctx, px, py, 1.7, 1.7, col('#78bdec', env)); }
      const [fx, fy] = P(bx, by, z0 + 20); bar(ctx, fx, fy + 4, fx, fy - 3, 3, col('#fffaf0', env)); poly(ctx, [[fx + 1, fy - 3], [fx + 8, fy - 1], [fx + 1, fy + 1]], col(TOY.red, env)); ctx.restore();
      const a = P(gx, gy, 0), c = col(env.locked ? '#d9c9a8' : '#bfe8ff', env); post(ctx, a[0], a[1], 26, 4.6, col(WOOD.shade, env), true);
      rr(ctx, a[0] - 22, a[1] - 40, 44, 15, 4.4, shd(c)); rr(ctx, a[0] - 22, a[1] - 40, 44, 13.2, 4.4, c); ctx.font = `800 7.6px ${'"Nunito",ui-rounded,system-ui,sans-serif'}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = env.locked ? '#a2422f' : '#2f6fd0'; ctx.fillText(env.locked ? 'NOT RUNNING' : 'FERRY', a[0], a[1] - 33);
      return null;
    }
    if (!env.locked) return null;
    const a = P(gx - nx * 1.3, gy - ny * 1.3, 0), b = P(gx + nx * 1.3, gy + ny * 1.3, 0), post0 = col(ROAD.light, env), pc = col(ROAD.mid, env);
    if (env.far) { // from the whole-island view a gate is its posts and its striped arm (no lamps, no cones, no padlock plate)
      for (const q of [a, b]) post(ctx, q[0], q[1], 19, 6.4, pc, true);
      if (k === 'bridge') { const a2 = P(gx - nx * 1.3 + hx * 3.2, gy - ny * 1.3 + hy * 3.2, 26), b2 = P(gx + nx * 1.3 + hx * 3.2, gy + ny * 1.3 + hy * 3.2, 26); poly(ctx, [a, b, b2, a2], col(WOOD.mid, env)); return null; }
      bar(ctx, a[0], a[1] - 14, b[0], b[1] - 14, 6.4, col(TOY.orange, env)); return null;
    }
    if (k === 'bridge') { // the leaf is raised: a tilted plank deck striped with chevrons, ball-capped posts and warning lamps
      const a2 = P(gx - nx * 1.3 + hx * 3.2, gy - ny * 1.3 + hy * 3.2, 26), b2 = P(gx + nx * 1.3 + hx * 3.2, gy + ny * 1.3 + hy * 3.2, 26);
      stampSoft(ctx, (a[0] + b[0]) / 2 + 8, (a[1] + b[1]) / 2 + 4, 44, 10, 0.2);
      roundedPoly(ctx, [a, b, b2, a2], 4); ctx.fillStyle = col(WOOD.shade, env); ctx.fill(); roundedPoly(ctx, [[a[0], a[1] - 2], [b[0], b[1] - 2], [b2[0], b2[1] - 1], [a2[0], a2[1] - 1]], 4); ctx.fillStyle = col(WOOD.mid, env); ctx.fill();
      for (let i = 1; i < 9; i++) { const u = i / 9, L2 = (v, A, B) => [A[0] + (B[0] - A[0]) * v, A[1] + (B[1] - A[1]) * v], s0 = L2(u, a, b), s1 = L2(u, a2, b2); ctx.globalAlpha = 0.5; bar(ctx, s0[0], s0[1] - 2, s1[0], s1[1] - 1, 1.6, col(WOOD.shade, env)); ctx.globalAlpha = 1; }
      for (let i = 0; i < 6; i++) { const u0 = i / 6, u1 = (i + 1) / 6, L = (u, A, B) => [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u]; poly(ctx, [L(u0, a2, b2), L(u1, a2, b2), [L(u1, a2, b2)[0] - 0.5, L(u1, a2, b2)[1] + 10], [L(u0, a2, b2)[0] - 0.5, L(u0, a2, b2)[1] + 10]], i % 2 ? col('#6a5a9c', env) : col(TOY.yellow, env)); }
      for (const q of [a, b]) { stand(ctx, q[0], q[1], 6, 2.6); post(ctx, q[0], q[1], 17, 5, pc, true); lampOn(ctx, q[0], q[1] - 22, env, q[0]); }
      return null;
    }
    stampSoft(ctx, (a[0] + b[0]) / 2 + 6, (a[1] + b[1]) / 2 + 4, Math.abs(b[0] - a[0]) / 2 + 12, 7, 0.2); // a boom barrier across the road
    for (const q of [a, b]) { stand(ctx, q[0], q[1], 7, 3); post(ctx, q[0], q[1], 19, 6.4, pc, true); }
    const n = 8, Z = 14, L = (u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - Z];
    for (let i = 0; i < n; i++) { const p0 = L(i / n), p1 = L((i + 1) / n); bar(ctx, p0[0] + 1.2, p0[1], p1[0] - 1.2, p1[1], 6.4, i % 2 ? col('#fffaf0', env) : col(TOY.orange, env)); ctx.globalAlpha *= 0.45; bar(ctx, p0[0] + 1.2, p0[1] - 1.5, p1[0] - 1.2, p1[1] - 1.5, 1.6, '#ffffff'); ctx.globalAlpha /= 0.45; }
    const [mx, my] = L(0.5); rr(ctx, mx - 8, my - 18, 16, 12.4, 3.4, col('#d9a52c', env)); rr(ctx, mx - 8, my - 18, 15, 11, 3.4, col('#f6c94f', env)); ctx.strokeStyle = col('#d9a52c', env); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(mx, my - 18, 4.4, Math.PI, 0); ctx.stroke(); disc(ctx, mx, my - 13.4, 1.5, 1.5, '#7a4a1c'); rr(ctx, mx - 0.6, my - 13, 1.2, 3.4, 0.5, '#7a4a1c');
    lampOn(ctx, a[0], a[1] - 25, env, 0); lampOn(ctx, b[0], b[1] - 25, env, 3);
    CONE(ctx, a[0] - 11, a[1] + 4, env); CONE(ctx, b[0] + 11, b[1] + 4, env);
    return null;
  },
});

// ---------------------------------------------------------------- the lookout, the bull, the fountain, the helipad
shared('lookout', {
  body(g, p, env) {
    const [x, y] = P(p.gx + 0.5, p.gy + 0.5), wood = col(WOOD.mid, env);
    stampSoft(g, x + 6, y + 4, 40, 15, 0.2);
    roundedBox(g, p.gx, p.gy, 1, 1, 3.4, wood, { r: 2.6 });
    for (const [u, v] of [[0.06, 0.06], [0.94, 0.06], [0.06, 0.94], [0.94, 0.94]]) { const [px, py] = P(p.gx + u, p.gy + v, 3.4); post(g, px, py, 13, 4.2, col(WOOD.shade, env), true); }
    const A = P(p.gx + 0.06, p.gy + 0.94, 13), B = P(p.gx + 0.94, p.gy + 0.94, 13), C = P(p.gx + 0.94, p.gy + 0.06, 13); bar(g, A[0], A[1] - 1.5, B[0], B[1] - 1.5, 3.2, col(WOOD.light, env)); bar(g, B[0], B[1] - 1.5, C[0], C[1] - 1.5, 3.2, col(shade(WOOD.light, 0.86), env));
    roundedBox(g, p.gx + 0.16, p.gy + 0.62, 0.68, 0.2, 5, col(WOOD.light, env), { z: 3.4, r: 1.8, edge: false }); roundedBox(g, p.gx + 0.16, p.gy + 0.8, 0.68, 0.08, 6, col(WOOD.mid, env), { z: 8.4, r: 1.4, edge: false });
    const [tx, ty] = P(p.gx + 0.62, p.gy + 0.3, 3.4), brass = col(METAL.brass, env);
    for (const dx of [-5, 0, 5]) bar(g, tx, ty - 8, tx + dx, ty, 2.4, col(METAL.steelMid, env)); g.save(); g.translate(tx, ty - 9); g.rotate(-0.55); rr(g, -8, -2.6, 15, 5.2, 2.6, shade(brass, 0.85)); rr(g, -8, -2.6, 14, 4, 2.6, brass); rr(g, 4, -3.4, 4.4, 6.8, 2.2, col(METAL.steelHi, env)); g.restore();
    return null;
  }, vary: [], ext: [6, 6, 6, 6],
});
shared('statue', {
  body(g, p, env) {
    const plinth = col(PAVE.plaza, env), gold = col(METAL.brass, env), [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, 7);
    cast(g, p, 26, env); stand(g, x, y + 7, 18, 8);
    const F = roundedBox(g, p.gx - 0.1, p.gy - 0.1, p.w + 0.2, p.d + 0.2, 7, plinth, { r: 3.4 }); fq(g, F.left, 0.34, 0.66, 0.34, 0.7, col('#d9a52c', env));
    for (const lx of [-6.6, -2.6, 2.8, 6.8]) rr(g, x + lx - 1.8, y - 5, 3.6, 6.4, 1.8, lx > 0 ? shade(gold, 0.8) : gold);
    bar(g, x - 7, y - 9, x + 6, y - 9.4, 11.4, shade(gold, 0.82)); bar(g, x - 7.4, y - 10.4, x + 5, y - 10.6, 9.6, gold); g.globalAlpha *= 0.55; bar(g, x - 5, y - 13, x + 3, y - 13.2, 2.6, '#fff3c4'); g.globalAlpha /= 0.55;
    bar(g, x - 9.6, y - 10, x - 12.6, y - 5, 3, shade(gold, 0.85)); ball(g, x - 12.8, y - 3.6, 2.2, gold);
    ball(g, x + 10.6, y - 12.2, 4.8, gold); disc(g, x + 13.4, y - 10, 2.6, 2, hi(gold, 0.3)); disc(g, x + 14.2, y - 10.2, 0.5, 0.5, '#7a4a1c');
    for (const [sx, hx, hy] of [[-1, 6.2, -16.6], [1, 12.6, -16.2]]) { g.beginPath(); g.moveTo(x + hx - sx * 0.5, y - 14.4); g.quadraticCurveTo(x + hx - sx * 3.2, y - 17.5, x + hx - sx * 2.4 + (sx > 0 ? 3 : -1), y - 21.6); g.strokeStyle = col('#fff3c4', env); g.lineWidth = 2.6; g.lineCap = 'round'; g.stroke(); g.lineCap = 'butt'; }
    return null;
  },
  live(ctx, p, env) { if (!env.t) return; const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, 7), k = ((env.t / 3000) % 1), a = k < 0.2 ? Math.sin((k / 0.2) * Math.PI) : 0; if (a < 0.02) return; ctx.globalAlpha = a; poly(ctx, [[x + 14, y - 26], [x + 15, y - 22.6], [x + 18.4, y - 21.6], [x + 15, y - 20.6], [x + 14, y - 17.2], [x + 13, y - 20.6], [x + 9.6, y - 21.6], [x + 13, y - 22.6]], '#fffbe6'); ctx.globalAlpha = 1; },
  vary: ['col'], ext: [8, 6, 11, 11],
});
shared('fountain', {
  body(g, p, env) {
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2), s = Math.min(1, p.w / 2), stone = col(PAVE.plaza, env), water = col(SEA.shallow, env);
    g.save(); g.translate(x, y); g.scale(s, s); g.translate(-x, -y);
    stampSoft(g, x + 8, y + 6, 54, 22, 0.2);
    drum(g, x, y + 2, 44, 9, stone, { ribs: null }); disc(g, x, y - 7, 39, 19.6, col(SEA.shoal, env)); disc(g, x, y - 6.4, 36, 18, water); disc(g, x + 2, y - 5, 28, 14, col(SEA.lagoon, env));
    g.globalAlpha *= 0.45; g.beginPath(); g.ellipse(x - 6, y - 8, 22, 10, 0, Math.PI * 1.15, Math.PI * 1.7, false); g.strokeStyle = '#ffffff'; g.lineWidth = 2.4; g.stroke(); g.globalAlpha /= 0.45;
    drum(g, x, y - 4, 7.6, 20, stone); drum(g, x, y - 22, 19, 5, stone); disc(g, x, y - 27.4, 15.6, 7.6, col(SEA.shoal, env)); disc(g, x, y - 27, 13.4, 6.6, water); ball(g, x, y - 30, 3.8, stone);
    g.restore(); return null;
  },
  live(ctx, p, env) {
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2), s = Math.min(1, p.w / 2), t = env.t;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    for (let i = 0; i < 8; i++) { const k = ((t / 1600) + i / 8) % 1, sw = (i % 4 - 1.5) * 8.4; ctx.globalAlpha = 0.9 * (1 - k * 0.5); disc(ctx, sw * Math.sin(k * 1.6) * 1.4 * (i < 4 ? 1 : -1) * 0.7, -30 - Math.sin(k * Math.PI) * 17 + k * 17, 1.9, 1.9, '#f4ffff'); }
    ctx.globalAlpha = 1; if (t) for (let i = 0; i < 2; i++) { const k = ((t / 2400) + i / 2) % 1; ctx.globalAlpha = 0.5 * (1 - k); ctx.beginPath(); ctx.ellipse(0, -27, 5 + k * 22, 2.4 + k * 11, 0, 0, 6.3); ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 1.6; ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.restore();
  },
  vary: [], ext: [6, 6, 6, 6],
});
shared('helipad', {
  body(g, p, env) {
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2), c = col(ROAD.mid, env);
    stampSoft(g, x + 4, y + 5, 52, 22, 0.2); drum(g, x, y + 1, 42, 3, c); disc(g, x, y - 2, 40, 20, shd(c)); disc(g, x, y - 2.4, 38, 18.8, c); disc(g, x - 3, y - 4, 24, 9, mix(c, '#fffbe6', 0.12));
    g.beginPath(); g.ellipse(x, y - 2.4, 31, 15.4, 0, 0, 6.3); g.strokeStyle = col('#fff3d6', env); g.lineWidth = 3.4; g.stroke();
    g.save(); g.translate(x, y - 2.4); g.scale(1, 0.5); const hc = col(TOY.yellow, env); rr(g, -13, -16, 6.4, 32, 2.4, hc); rr(g, 6.6, -16, 6.4, 32, 2.4, hc); rr(g, -9, -3.4, 18, 6.8, 2.4, hc); g.restore();
    for (const [dx, dy] of [[-38, 0], [38, 0], [0, -19], [0, 19]]) { disc(g, x + dx * 0.97, y - 2.4 + dy * 0.97, 2.8, 1.5, col('#ffb347', env)); }
    const [wx, wy] = P(p.gx + p.w - 0.3, p.gy + 0.3, 0); post(g, wx, wy, 26, 3.6, col('#fffaf0', env), false);
    return null;
  },
  live(ctx, p, env) { const [wx, wy] = P(p.gx + p.w - 0.3, p.gy + 0.3, 0), sw = env.t ? Math.sin(env.t / 1900) * 2.4 * env.wind : 0; let px = wx, py = wy - 25; for (let i = 0; i < 4; i++) { const nx = px + 4.6, ny = py + 1.2 + sw * 0.3 * (i + 1) * 0.5; poly(ctx, [[px, py - 3 + i * 0.5], [nx, ny - 2.4 + i * 0.5], [nx, ny + 2.4 - i * 0.5], [px, py + 3 - i * 0.5]], i % 2 ? '#fffaf0' : col(TOY.orange, null)); px = nx; py = ny; } },
  vary: [], ext: [6, 6, 6, 6],
});
