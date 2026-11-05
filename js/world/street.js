// Street furniture and signs of the toy island, as V2 drawers registered per prop kind: lamps with a warm globe, benches with curled arms, fences with capped pickets, flags, lanterns, bollards, poles with plates,
// billboards, the ticker, the searchlight, the for-sale post, the pillar and the market board (the one hot hit shape here).
// Owner: T4 PROPS, NATURE AND CHARACTERS (docs/RENDER_PLAN.md). docs/ART_DIRECTION.md 3.1 (fat poles 3.6 across, pickets 3.5, posts 5 with ball caps, nothing under 3 wide, nothing without a contact shadow), 3.3 (a fence is
// pickets, rails and posts, never sticks) and 4.1. Each kind is a cached sprite body (static art) plus a live part (what moves or glows: a flag's cloth, a lantern's sway, a lamp's globe at night, the ticker's text).
// Colours come from the palette; a colour a kit still passes in the old dark data is lifted into the toy range or snapped to the nearest toy colour (toys.js).
import { shared } from './atlas.js';
import { DIST } from './layout.js';
import { ROAD, WOOD, METAL, TOY, PAVE, INK, GLASS, LIGHT, BLOOM, GRASS, ROCK, ROCKHI, faceTone } from './palette.js';
import { roundedBox } from './solids.js';
import { stampGlow, rgbOf } from './gfx.js';
import { P, col, lifted, toyOf, hi, shd, ball, disc, rr, poly, bar, post, drum, stand, stampSoft, castShadow, lettering, fq, facePoint, facesOf, capsule, mix, shade, clamp, seedOf, FONT, fade } from './toys.js';
import { h2 } from './iso.js';
import { skyOver } from './life.js';

const POLE = ROAD.mid, steel = (env) => col(METAL.steelLight, env);
const accOf = (p, fallback = TOY.orange) => (p.col || p.acc ? lifted(p.col || p.acc, 0.55) : fallback);
const glowAt = (ctx, rgb, x, y, r, a) => { if (a > 0.02) { const pa = ctx.globalAlpha; ctx.globalCompositeOperation = 'lighter'; stampGlow(ctx, rgb, x, y, r, a); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = pa; } };
const shadowOf = (g, p, h, w = 0.16, d = 0.16, env) => castShadow(g, p.gx - 0.02, p.gy - 0.02, w, d, h, { night: env.night || 0, dusk: 0 });

// ---------------------------------------------------------------- lamps
function lampBody(g, p, env, globe, h) {
  const [x, y] = P(p.gx, p.gy), pole = col(POLE, env), top = y - h;
  shadowOf(g, p, h, 0.2, 0.2, env); stand(g, x, y, 6, 2.8);
  drum(g, x, y, 5.4, 4.6, pole, { ribs: [0.55], ribCol: shade(pole, 0.82) });
  poly(g, [[x - 3.1, y - 4], [x + 3.1, y - 4], [x + 2.2, top + 5], [x - 2.2, top + 5]], shd(pole)); poly(g, [[x - 3.1, y - 4], [x + 0.9, y - 4], [x + 0.7, top + 5], [x - 2.2, top + 5]], pole); // a stout tapered shaft (6 pixels at the foot), not a stick
  rr(g, x - 4.4, y - 11.5, 8.8, 3.2, 1.6, shd(pole)); rr(g, x - 4.4, y - 11.5, 7.6, 2.6, 1.3, pole); // a collar above the foot
  { const alpha0 = fade(g, 0.5); poly(g, [[x - 2.6, y - 5], [x - 1.4, y - 5], [x - 1.1, top + 6], [x - 1.9, top + 6]], hi(pole, 0.8)); g.globalAlpha = alpha0; }
  rr(g, x - 4.4, top + 4.4, 8.8, 3.2, 1.6, shd(pole)); rr(g, x - 4.4, top + 4.4, 7.6, 2.6, 1.3, pole);
  ball(g, x, top - 0.4, 5.9, globe); rr(g, x - 3.4, top - 7.6, 6.8, 2.8, 1.4, shd(pole)); rr(g, x - 3.4, top - 7.6, 5.6, 2.2, 1.1, pole);
  return [x, top];
}
shared('lamp', {
  body(g, p, env) { lampBody(g, p, env, col(mix('#fff6dc', p.col ? lifted(p.col, 0.7) : '#ffe9a8', 0.3), env), 30); return null; },
  live(ctx, p, env) { if (env.night > 0.05) { const [x, y] = P(p.gx, p.gy); ball(ctx, x, y - 30.4, 5.9, '#fff3c4'); glowAt(ctx, '255,233,168', x, y - 30.4, 26, 0.7 * env.night); } },
  vary: ['col'], ext: [9, 9, 10, 10],
});
shared('neonlamp', {
  body(g, p, env) { lampBody(g, p, env, col(accOf(p, TOY.cyan), env), 34); return null; },
  live(ctx, p, env) { const [x, y] = P(p.gx, p.gy), a = 0.18 + 0.82 * env.night, k = env.t ? 1 + 0.12 * Math.sin((env.t / 3600) * Math.PI * 2) : 1; glowAt(ctx, rgbOf(accOf(p, TOY.cyan)), x, y - 34.4, 18 * k, a * 0.55); if (env.lights && !env.lite) env.lights.push({ wx: x, wy: y - 34.4 - env.zoff, r: 40, c: rgbOf(accOf(p, TOY.cyan)), a: 0.5 }); },
  vary: ['col'], ext: [9, 7, 9, 10],
});

// ---------------------------------------------------------------- bench, fence, bollard
shared('bench', {
  body(g, p, env) {
    const w = p.w, d = p.d, wood = [col(WOOD.light, env), col(WOOD.mid, env)], st = col(METAL.steelMid, env), [cx, cy] = P(p.gx + w / 2, p.gy + d / 2);
    stampSoft(g, cx + 5, cy + 3, 22, 7, 0.2); stand(g, cx, cy + 1, 15, 5.5);
    for (const u of [0.1, 0.84]) { roundedBox(g, p.gx + w * u, p.gy + d * 0.18, w * 0.06, d * 0.64, 8, st, { r: 1.6, edge: false }); } // the curled steel arms (two stout legs with a foot)
    for (let i = 0; i < 3; i++) roundedBox(g, p.gx + w * 0.02, p.gy + d * (0.2 + i * 0.27), w * 0.96, d * 0.2, 2.8, wood[i % 2], { z: 7.4, r: 1.3, edge: false }); // three slats of seat
    for (let i = 0; i < 2; i++) roundedBox(g, p.gx + w * 0.02, p.gy + d * 0.1, w * 0.96, d * 0.1, 3, wood[(i + 1) % 2], { z: 11.4 + i * 4.2, r: 1.3, edge: false }); // and two of back
    for (const u of [0.1, 0.84]) roundedBox(g, p.gx + w * u, p.gy + d * 0.08, w * 0.06, d * 0.14, 12, st, { z: 7, r: 1.4, edge: false });
    return null;
  }, vary: [], ext: [6, 12, 6, 6],
});
shared('fence', {
  body(g, p, env) {
    const along = !p.dirY, len = along ? p.w : p.d, n = Math.max(3, Math.round(len / 0.36) + 1), c0 = lifted(p.col || '#e9e2d0', 0.78), c = col(along ? c0 : mix(c0, '#d8cfe0', 0.18), env), h = clamp(p.h || 16, 12, 20), pst = col(mix(c0, WOOD.light, 0.35), env);
    const at = (u, z = 0) => (along ? P(p.gx + len * u, p.gy + p.d / 2, z) : P(p.gx + p.w / 2, p.gy + len * u, z)), a = at(0), b = at(1);
    stampSoft(g, (a[0] + b[0]) / 2 + 5, (a[1] + b[1]) / 2 + 3, Math.abs(b[0] - a[0]) / 2 + 8, Math.abs(b[1] - a[1]) / 2 + 6, 0.18);
    for (const rh of [4.6, 11.4]) { bar(g, a[0], a[1] - rh, b[0], b[1] - rh, 4.4, shd(c)); bar(g, a[0], a[1] - rh - 0.7, b[0], b[1] - rh - 0.7, 2.8, hi(c, 0.35)); } // two chunky rails
    const posts = Math.max(2, Math.round(len / 1.5) + 1), gap = 0.55 / (n - 1);
    for (let i = 0; i < n; i++) { const u = i / (n - 1); let onPost = false; for (let k = 0; k < posts; k++) if (Math.abs(u - k / (posts - 1)) < gap) onPost = true; if (onPost) continue; const [x, y] = at(u); rr(g, x - 2.4, y - h, 4.8, h, 2.4, shd(c)); rr(g, x - 2.4, y - h, 3.7, h - 0.5, 2.4, c); { const alpha0 = fade(g, 0.4); rr(g, x - 1.6, y - h + 1.6, 1.2, h - 3.2, 0.6, '#fffbe6'); g.globalAlpha = alpha0; } }
    for (let i = 0; i < posts; i++) { const [x, y] = at(i / (posts - 1)); post(g, x, y, h + 3.2, 6.8, pst, true); }
    return null;
  }, vary: ['col', 'dirY'], ext: [6, 8, 6, 6],
});
shared('bollard', {
  body(g, p, env) {
    const [x, y] = P(p.gx + 0.15, p.gy + 0.15), c = col(accOf(p, TOY.orange), env), h = Math.max(9, (p.h || 8) + 2);
    stampSoft(g, x + 3, y + 1.5, 9, 3.4, 0.2); stand(g, x, y, 5.2, 2.4);
    drum(g, x, y, 5.4, h, c, { dome: 3.4 }); rr(g, x - 5.4, y - h * 0.62, 10.8, 2.6, 1.3, col('#fffaf0', env)); { const alpha0 = fade(g, 0.5); rr(g, x - 4.6, y - h * 0.62 + 0.2, 4.4, 1, 0.5, '#ffffff'); g.globalAlpha = alpha0; }
    return null;
  }, vary: ['col'], ext: [6, 6, 6, 6],
});

// ---------------------------------------------------------------- flags and lanterns (their cloth and their sway are live)
shared('flag', {
  body(g, p, env) { const [x, y] = P(p.gx, p.gy), h = p.h; stampSoft(g, x + 4, y + 1.5, 10, 3.6, 0.18); stand(g, x, y, 4.6, 2.1); drum(g, x, y, 4.2, 3.4, col('#e8e0cc', env)); post(g, x, y - 2, h - 4, 3.6, col('#fffaf0', env), false); ball(g, x, y - h - 0.6, 2.6, col('#f6c94f', env)); return null; },
  live(ctx, p, env) {
    const [x, y] = P(p.gx, p.gy), h = p.h, c = col(accOf(p, TOY.pink), env), k = env.t ? (env.t / 2100) * Math.PI * 2 + p.gx * 3 : 0, A = env.t ? 1.8 * env.wind : 0, top = y - h + 1.5;
    const seg = 3, W = 17, Hh = 11; let px = x + 1.4, ptop = top, pbot = top + Hh;
    for (let i = 1; i <= seg; i++) { const dx = (W / seg) * i, o = Math.sin(k - i * 0.9) * A * (i / seg), nx = x + 1.4 + dx, nt = top + o + i * 0.5, nb = top + Hh + o + i * 0.5; poly(ctx, [[px, ptop], [nx + 0.4, nt], [nx + 0.4, nb], [px, pbot]], i % 2 ? c : mix(c, '#ffffff', 0.12)); px = nx; ptop = nt; pbot = nb; }
    { const alpha0 = fade(ctx, 0.5); rr(ctx, x + 2.4, top + 4.2, W - 3, 2.2, 1, '#fffaf0'); ctx.globalAlpha = alpha0; } // a trim band that rides the cloth
  },
  vary: ['col'], ext: [6, 6, 6, 6],
});
shared('lantern', {
  body(g, p, env) { const [x, y] = P(p.gx, p.gy), h = p.h; stand(g, x, y, 4.2, 2); drum(g, x, y, 3.8, 3, col('#7a5a40', env)); post(g, x, y - 2, h - 2, 3.6, col(WOOD.shade, env), false); bar(g, x, y - h + 1, x + 6, y - h + 1, 3, col(WOOD.shade, env)); return null; },
  live(ctx, p, env) {
    const [x, y] = P(p.gx, p.gy), h = p.h, c = col(accOf(p, TOY.orange), env), sw = env.t ? Math.sin((env.t / 3400) * Math.PI * 2 + p.gx) * 0.035 * env.wind : 0;
    ctx.save(); ctx.translate(x + 6, y - h + 2); ctx.rotate(sw);
    bar(ctx, 0, 0, 0, 3.2, 3, '#7a5a40'); ctx.translate(0, 3.2);
    disc(ctx, 0, 6.4, 5.6, 6.8, shd(c)); disc(ctx, -0.5, 6, 5, 6.2, c); rr(ctx, -5.4, 4.4, 10.8, 1.9, 0.9, shade(c, 0.8)); rr(ctx, -5.2, 8.4, 10.4, 1.9, 0.9, shade(c, 0.8)); { const alpha0 = fade(ctx, 0.55); disc(ctx, -2.2, 3.2, 1.8, 2.4, '#fffbe6'); ctx.globalAlpha = alpha0; } rr(ctx, -2.8, 12.4, 5.6, 1.8, 0.9, '#d9a52c'); bar(ctx, 0, 13, 0, 16.6, 3, '#f6c94f'); ctx.restore();
    if (env.night > 0.1) glowAt(ctx, '255,200,110', x + 6, y - h + 8, 20, 0.5 * env.night);
    if (env.night > 0.1 && env.lights && !env.lite) env.lights.push({ wx: x + 6, wy: y - h + 8 - env.zoff, r: 40, c: '255,200,110', a: 0.5 * env.night });
  },
  vary: [], ext: [6, 6, 6, 6],
});

// ---------------------------------------------------------------- signs on poles
shared('neonpole', {
  body(g, p, env) {
    const [x, y] = P(p.gx, p.gy), h = p.h, c = col(accOf(p, TOY.yellow), env), pole = col(POLE, env);
    shadowOf(g, p, h, 0.3, 0.3, env); stand(g, x, y, 6, 2.8); drum(g, x, y, 5.6, 4.6, pole); post(g, x, y - 3, h - 8, 4.4, pole, false);
    rr(g, x - 10, y - h + 2, 20, 17, 6, shd(c)); rr(g, x - 10, y - h + 2, 18, 15.4, 6, c); rr(g, x - 7.4, y - h + 4.4, 14.8, 10.6, 4, hi(c, 0.55));
    g.font = `800 9px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col('#8a5a14', env); g.fillText(p.text || '000', x, y - h + 10.2); ball(g, x, y - h - 0.6, 3, hi(c, 0.2));
    return null;
  },
  live(ctx, p, env) { const [x, y] = P(p.gx, p.gy), c = accOf(p, TOY.yellow); glowAt(ctx, rgbOf(c), x, y - p.h + 10, 26, 0.12 + 0.6 * env.night); if (env.lights && !env.lite) env.lights.push({ wx: x, wy: y - p.h + 10 - env.zoff, r: 56, c: rgbOf(c), a: 0.55 }); },
  vary: ['col', 'text'], ext: [8, 7, 14, 12],
});
shared('polesign', {
  body(g, p, env) {
    const [x, y] = P(p.gx, p.gy), h = p.h, c = col(toyOf(p.col || TOY.red), env), pole = col(POLE, env);
    shadowOf(g, p, h, 0.4, 0.4, env); stand(g, x, y, 7, 3.2); drum(g, x, y, 6, 5, pole); post(g, x, y - 4, h - 12, 4.4, pole, false);
    const F = roundedBox(g, p.gx - 0.6, p.gy - 0.05, 1.4, 0.1, 18, c, { z: h - 6, r: 4 }); const [mx, my] = facePoint(F.left, 0.5, 0.5);
    lettering(g, p.text || 'AUTO', mx, my, 11, '#fffaf0', 0.5); ball(g, x, y - h - 15, 3.2, col('#fff6dc', env));
    return null;
  }, vary: ['col', 'text'], ext: [9, 25, 16, 13],
});
shared('forsale', {
  body(g, p, env) {
    const [x, y] = P(p.gx + 0.2, p.gy), c = col(accOf(p, '#e8795a'), env), wd = col('#fffaf0', env);
    stampSoft(g, x + 6, y + 1.5, 14, 4.4, 0.2); stand(g, x, y, 5, 2.2);
    post(g, x, y, 24, 3.8, wd, true); bar(g, x, y - 20, x + 17, y - 18, 3, wd); // the post and the arm the board hangs from
    for (const cx of [x + 6, x + 18]) { bar(g, cx, y - 19.4 + (cx - x) * 0.12, cx, y - 16.4 + (cx - x) * 0.12, 1.6, '#8392b4'); }
    rr(g, x + 2.4, y - 17, 20, 12.4, 3, shd(c)); rr(g, x + 2.4, y - 17, 18.4, 10.8, 3, c); rr(g, x + 3.8, y - 15.6, 15.6, 4.6, 1.8, '#fffaf0');
    g.font = `800 4.4px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col('#c0432a', env); g.fillText('FOR SALE', x + 11.6, y - 13.2); rr(g, x + 5, y - 9.4, 13.2, 2, 1, '#fffaf0');
    return null;
  }, vary: ['col'], ext: [6, 6, 6, 6],
});
shared('pillar', {
  body(g, p, env) {
    const [x, y] = P(p.gx + 0.25, p.gy + 0.25), c = col(lifted(p.col || '#f0e6c8', 0.8), env), h = p.h;
    shadowOf(g, p, h, 0.5, 0.5, env); stand(g, x, y, 9, 4.2);
    roundedBox(g, p.gx + 0.02, p.gy + 0.02, 0.46, 0.46, 4, c, { r: 2 });
    const [cx, cy] = P(p.gx + 0.25, p.gy + 0.25, 4); drum(g, cx, cy, 5.2, h - 11, c, { ribs: null }); for (const u of [-0.45, 0, 0.45]) { { const alpha0 = fade(g, 0.22); rr(g, cx + u * 8 - 0.9, cy - (h - 11) + 1, 1.8, h - 13, 0.9, shade(c, 0.6)); g.globalAlpha = alpha0; } }
    const [tx, ty] = P(p.gx + 0.25, p.gy + 0.25, h - 7); roundedBox(g, p.gx - 0.02, p.gy - 0.02, 0.54, 0.54, 4.2, c, { z: h - 7.2, r: 2.2 }); disc(g, tx, ty - 5.6, 6.4, 2.6, hi(c, 0.35));
    return null;
  }, vary: ['col'], ext: [8, 6, 12, 11],
});

// ---------------------------------------------------------------- the billboard, the ticker, the searchlight, the market board
shared('billboard', {
  body(g, p, env) {
    const [x, y] = P(p.gx + p.w / 2, p.gy), c = col(accOf(p, TOY.blue), env), ph = 18, pole = col(POLE, env), hw = p.w * 22;
    shadowOf(g, p, p.h, p.w, p.d, env); stand(g, x, y, hw + 6, 4); for (const sx of [-1, 1]) { post(g, x + sx * (hw - 2), y, p.h - 4, 5.4, pole, true); }
    const F = roundedBox(g, p.gx, p.gy, p.w, p.d, ph, col('#fffaf0', env), { z: p.h - ph, r: 4 });
    fq(g, F.left, 0.03, 0.97, 0.1, 0.9, c); fq(g, F.left, 0.03, 0.97, 0.1, 0.3, mix(c, '#fffbe6', 0.18));
    const [mx, my] = facePoint(F.left, 0.5, 0.5); lettering(g, p.text || '', mx, my, 11, '#fffaf0', 0.5, null);
    for (let i = 0; i < 9; i++) { const [bx, by] = facePoint(F.left, 0.06 + i * 0.11, 1.0); ball(g, bx, by - 2.4, 1.9, i % 2 ? '#fff3c4' : '#ffd84d'); }
    return null;
  },
  live(ctx, p, env) {
    const F = facesOf(p.gx, p.gy, p.w, p.d, 18, p.h - 18);
    if (p.anim && env.t) { const k = ((env.t / 12000) % 1), u0 = -0.3 + k * 1.6; ctx.save(); const a = facePoint(F.left, 0.03, 0.1), b = facePoint(F.left, 0.97, 0.1), c = facePoint(F.left, 0.97, 0.9), d = facePoint(F.left, 0.03, 0.9); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.clip(); ctx.globalAlpha = 0.26; poly(ctx, [facePoint(F.left, u0, 0), facePoint(F.left, u0 + 0.2, 0), facePoint(F.left, u0 + 0.35, 1), facePoint(F.left, u0 + 0.15, 1)], '#ffffff'); ctx.restore(); }
    if (!env.lite && env.lights) { const [lx, ly] = facePoint(F.left, 0.5, 0.5); env.lights.push({ wx: lx, wy: ly - env.zoff, r: 70, c: rgbOf(accOf(p, TOY.pink)), a: 0.28 * (p.anim ? 1 : 0.6) }); }
  },
  vary: ['col', 'text'], ext: [8, 6, 20, 12],
});
shared('ticker', {
  body(g, p, env) {
    const [mx, my] = P(p.gx + p.w / 2, p.gy + p.d / 2); shadowOf(g, p, p.h, p.w, p.d, env); stand(g, mx, my + 4, p.w * 22, 5);
    for (const x of [0.15, p.w - 0.15]) roundedBox(g, p.gx + x - 0.06, p.gy + p.d * 0.2, 0.12, p.d * 0.6, 6, col(POLE, env), { r: 2 });
    const F = roundedBox(g, p.gx, p.gy, p.w, p.d, p.h, col('#e9d9a0', env), { z: 4, r: 4 }); fq(g, F.left, 0.03, 0.97, 0.12, 0.88, col('#24433f', env)); fq(g, F.left, 0.03, 0.97, 0.12, 0.28, col('#2f5a52', env));
    return null;
  },
  live(ctx, p, env) {
    const F = facesOf(p.gx, p.gy, p.w, p.d, p.h, 4), a = facePoint(F.left, 0.04, 0.14), b = facePoint(F.left, 0.96, 0.14), c = facePoint(F.left, 0.96, 0.86), d = facePoint(F.left, 0.04, 0.86);
    ctx.save(); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.clip();
    const off = env.t ? (env.t * 0.04) % 160 : 0, [mx, my] = facePoint(F.left, 0.5, 0.5); ctx.translate(mx, my); ctx.transform(1, 0.5, 0, 1, 0, 0); ctx.font = `800 10px ${FONT}`; ctx.textBaseline = 'middle';
    const tw = Math.max(40, p.text.length * 5.8), words = p.text.split(' ');
    for (let k = -1; k < 3; k++) { let xx = -(off % tw) + k * tw - 24; for (let i = 0; i < words.length; i++) { ctx.fillStyle = i % 2 ? '#ff9f8a' : '#7cf0b0'; ctx.fillText(words[i], xx, 0); xx += ctx.measureText(words[i] + ' ').width; } }
    ctx.restore();
    if (!env.lite && env.lights) { const [lx, ly] = facePoint(F.left, 0.5, 0.5); env.lights.push({ wx: lx, wy: ly - env.zoff, r: 44, c: rgbOf(p.acc || '#6df0a0'), a: 0.22 }); }
  },
  vary: [], ext: [9, 6, 20, 10],
});
shared('spot', {
  body(g, p, env) {
    const [x, y] = P(p.gx + 0.3, p.gy + 0.3), c = col(toyOf(p.col || TOY.violet), env), base = col(POLE, env);
    shadowOf(g, p, 22, 0.5, 0.5, env); stand(g, x, y, 8, 3.6); roundedBox(g, p.gx, p.gy, p.w, p.d, 8, base, { r: 3 }); post(g, x, y - 8, 7, 4, base, false);
    g.save(); g.translate(x, y - 18); g.rotate(-0.5); rr(g, -6, -6.4, 12, 12.8, 4.2, shd(c)); rr(g, -6, -6.4, 10.6, 11.2, 4.2, c); disc(g, 5.4, 0, 1.9, 5.2, '#fffaf0'); disc(g, 5.8, 0, 1.2, 3.8, '#cfeaff'); { const alpha0 = fade(g, 0.6); disc(g, 5.4, -1.8, 0.7, 1.2, '#ffffff'); g.globalAlpha = alpha0; } g.restore();
    return null;
  },
  live(ctx, p, env) {
    if (env.night < 0.15) return; const [x, y] = P(p.gx + 0.3, p.gy + 0.3), a = (env.t ? Math.sin((env.t / 9000) * Math.PI * 2 + p.gx) : 0) * 0.55 - 0.4, L = 100, c = accOf(p, TOY.violet);
    ctx.save(); ctx.globalAlpha = 0.18 * env.night; ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(x + Math.sin(a) * L - 14, y - 18 - Math.cos(a) * L); ctx.quadraticCurveTo(x + Math.sin(a) * L, y - 18 - Math.cos(a) * L - 8, x + Math.sin(a) * L + 14, y - 18 - Math.cos(a) * L); ctx.closePath(); ctx.fill(); ctx.restore();
  },
  vary: ['col'], ext: [6, 6, 6, 6],
});
shared('board', {
  body(g, p, env) {
    const [x, y] = P(p.gx + p.w / 2, p.gy, 0), c = col(accOf(p, TOY.orange), env), pole = col(WOOD.shade, env), hw = p.w * 15;
    shadowOf(g, p, 40, p.w, p.d, env); stand(g, x, y, hw + 14, 5);
    for (const sx of [-1, 1]) post(g, x + sx * (hw + 9), y, 36, 5.4, pole, true);
    const F = roundedBox(g, p.gx, p.gy, p.w, p.d, 22, c, { z: 18, r: 4.5 });
    fq(g, F.left, 0.03, 0.97, 0.08, 0.92, shade(c, 0.92)); fq(g, F.left, 0.03, 0.97, 0.08, 0.2, mix(c, '#fffbe6', 0.2));
    for (let i = 0; i < 7; i++) { const u = 0.07 + i * 0.14, a = facePoint(F.left, u, 1), b = facePoint(F.left, u + 0.14, 1); poly(g, [[a[0], a[1] - 0.5], [b[0], b[1] - 0.5], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 6.4]], i % 2 ? '#fffaf0' : col(TOY.red, env)); }
    return null;
  },
  hit(p) { const F = facesOf(p.gx, p.gy, p.w, p.d, 22, 18); return [F.left, F.right, F.top]; }, // the hit is the legacy one, exactly: the three faces of the sign's box
  live(ctx, p, env) {
    const F = facesOf(p.gx, p.gy, p.w, p.d, 22, 18), [mx, my] = facePoint(F.left, 0.5, 0.46), text = env.boardText || p.text || '';
    lettering(ctx, text, mx + 0.7, my + 1, 10.5, 'rgba(60,40,90,.38)', 0.5); lettering(ctx, text, mx, my, 10.5, env.locked ? '#fff1b8' : '#fffaf0', 0.5);
    if (env.night > 0.1 && env.lights && !env.lite) env.lights.push({ wx: mx, wy: my - env.zoff, r: 56, c: rgbOf(accOf(p, TOY.orange)), a: 0.3 * env.night });
    skyOver(ctx, p, env); // the gulls of the district and the boats on the sea nearest to it ride on its board
  },
  vary: ['acc', 'col'], ext: [8, 16, 20, 15],
});

// ---------------------------------------------------------------- the ends of the streets (the world pass WP12): what stands where a street ends. FLAT, as the people and the nature are (docs/ART_DIRECTION.md 3.4, 3.5 and 4.7): fills only, no gradient, no stroke, no
// highlight and no soft stamp; a block is a faceted prism in the three flat tones of the face model, a round form two flat fills, a limb a capsule, and a thing that stands on the ground has one flat ellipse of shadow. Six kinds: the barrier of a closed street
// (and the open boom of a gate), a bus shelter, a farm gate, a trough, a trailhead board, the sealed mouth of a tunnel and a loading dock. Their heading, where they have one, is `hx, hy` (the way out of the block): a boom or a gate stands across it.
export const flatShadow = (g, x, y, rx, ry, a = 0.17) => { const a0 = fade(g, a); disc(g, x, y, rx, ry, LIGHT.shadow); g.globalAlpha = a0; };
/** A faceted prism of one colour in the three flat tones of the face model (top, lit left, shaded right): no bevel, no rim, no strip. Answers its faces. */
export function prism(g, gx, gy, w, d, h, c, z = 0) { const F = facesOf(gx, gy, w, d, h, z), t = faceTone(c); poly(g, F.left, t.l); poly(g, F.right, t.r); poly(g, F.top, t.t); return F; }
/** A flat upright post: a capsule in the dark step with the colour over it a pixel up and to the left (the flat shading of a limb), from (x, y) up h. */
export function upright(g, x, y, h, w, c) { capsule(g, x + 0.7, y + 0.3, x + 0.7, y - h, w, shade(c, 0.78)); capsule(g, x - 0.3, y, x - 0.3, y - h, w, c); }
/** A traffic cone: a flat orange triangle on a flat base with a cream band. */
function cone(g, x, y, env) { const o = col(TOY.orange, env); flatShadow(g, x + 2, y + 1, 5.4, 2); disc(g, x, y, 4.6, 1.9, shade(o, 0.78)); poly(g, [[x - 3.4, y - 0.4], [x + 3.4, y - 0.4], [x + 1.3, y - 10.5], [x - 1.3, y - 10.5]], o); poly(g, [[x + 0.6, y - 0.4], [x + 3.4, y - 0.4], [x + 1.3, y - 10.5], [x + 0.2, y - 10.5]], shade(o, 0.78)); poly(g, [[x - 2.4, y - 4.6], [x + 2.4, y - 4.6], [x + 1.9, y - 6.6], [x - 1.9, y - 6.6]], col('#fffaf0', env)); }
/** The two faces of a prism of footprint w by d the camera sees: the long one gets the doors and the signs. */
const longFace = (F, w, d) => (w >= d ? F.left : F.right);

shared('roadend', { // T3 (and the open boom of a T4 gate): posts either side of the street, a striped boom across it, a plate that says what it is, two cones; open: the boom raised and a booth beside it
  body(g, p, env) {
    const cx = p.gx + p.w / 2, cy = p.gy + p.d / 2, hx = p.hx ?? 1, hy = p.hy ?? 0, nx = -hy, ny = hx, open = !!p.open, span = 1.35; // (a heading of 0 is a heading: `||` made every N and S port a diagonal)
    const a = P(cx - nx * span, cy - ny * span), b = P(cx + nx * span, cy + ny * span), red = col(TOY.red, env), cream = col('#fffaf0', env), steel = col(METAL.steelMid, env);
    for (const q of [a, b]) flatShadow(g, q[0] + 4, q[1] + 1.5, 7, 2.6);
    if (open) { // a booth beside the way in (on the side of b): a small flat prism with a window on its long face, a roof a little wider
      const bx = cx + nx * 2.1, by = cy + ny * 2.1, F = prism(g, bx - 0.45, by - 0.45, 0.9, 0.9, 22, cream); prism(g, bx - 0.58, by - 0.58, 1.16, 1.16, 3, col(TOY.blue, env), 22);
      fq(g, longFace(F, 0.9, 0.9), 0.14, 0.86, 0.38, 0.8, col(GLASS.mid, env));
    }
    for (const q of a[1] <= b[1] ? [a, b] : [b, a]) upright(g, q[0], q[1], 19, 5.4, steel); // (the post that stands farther from the viewer first)
    const z0 = 14, pivot = open ? b : a, tip = open ? [b[0] + (a[0] - b[0]) * 0.5, b[1] + (a[1] - b[1]) * 0.5 - 30] : b, lift = open ? 0 : z0, n = 8;
    for (let i = 0; i < n; i++) { // the boom: eight flat segments in red and cream, each a quad 5 pixels thick, the dark step a pixel and a half under it
      const t0 = i / n, t1 = (i + 1) / n, X0 = pivot[0] + (tip[0] - pivot[0]) * t0, Y0 = pivot[1] + (tip[1] - pivot[1]) * t0 - lift, X1 = pivot[0] + (tip[0] - pivot[0]) * t1, Y1 = pivot[1] + (tip[1] - pivot[1]) * t1 - lift, c = i % 2 ? cream : red;
      poly(g, [[X0, Y0 - 1], [X1, Y1 - 1], [X1, Y1 + 4], [X0, Y0 + 4]], shade(c, 0.78)); poly(g, [[X0, Y0 - 2.5], [X1, Y1 - 2.5], [X1, Y1 + 2.5], [X0, Y0 + 2.5]], c);
    }
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - 14 - 12, plate = open ? col(TOY.blue, env) : red, text = p.plate || 'ROAD CLOSED'; // the plate hangs over the middle of the street, clear of the raised boom
    upright(g, mx, my + 10.5, 11.5, 3.6, steel); rr(g, mx - 17, my - 7, 34, 13.4, 3, shade(plate, 0.78)); rr(g, mx - 17.6, my - 7.6, 33.6, 12.6, 3, plate); rr(g, mx - 15.2, my - 5.6, 29.6, 9.8, 2, cream); rr(g, mx - 14.2, my - 4.6, 27.6, 7.8, 1.6, plate);
    lettering(g, text, mx, my - 0.6, text.length > 9 ? 5.2 : 6, cream, 0, null);
    if (!open) { cone(g, a[0] - 9, a[1] + 5, env); cone(g, b[0] + 9, b[1] + 5, env); }
    return null;
  }, vary: ['hx', 'hy', 'open', 'plate'], ext: [100, 52, 78, 46],
});
shared('busstop', { // a bus shelter: a flat roof on posts, a glass panel behind and a bench under it (the panel stands on the side the camera does not see)
  body(g, p, env) {
    const w = p.w, d = p.d, roofC = col(TOY.blue, env), post = col(METAL.steelLight, env), glass = col(GLASS.top, env), wood = col(WOOD.light, env), alongX = w >= d, [cx, cy] = P(p.gx + w / 2, p.gy + d / 2);
    flatShadow(g, cx + 6, cy + 3, (w + d) * 13.5, (w + d) * 5.4, 0.15);
    const corners = [[0.12, 0.12], [w - 0.12, 0.12], [0.12, d - 0.12], [w - 0.12, d - 0.12]].map(([u, v]) => P(p.gx + u, p.gy + v)), sorted = [...corners].sort((q, r) => q[1] - r[1]);
    for (const q of sorted.slice(0, 2)) upright(g, q[0], q[1], 18, 3.6, post);
    const pa = alongX ? [P(p.gx + 0.1, p.gy + 0.1, 2), P(p.gx + w - 0.1, p.gy + 0.1, 2), P(p.gx + w - 0.1, p.gy + 0.1, 18), P(p.gx + 0.1, p.gy + 0.1, 18)] : [P(p.gx + 0.1, p.gy + 0.1, 2), P(p.gx + 0.1, p.gy + d - 0.1, 2), P(p.gx + 0.1, p.gy + d - 0.1, 18), P(p.gx + 0.1, p.gy + 0.1, 18)];
    poly(g, pa, shade(glass, 0.86)); // the back panel (a flat pane in a darker step; the lighter one over it is the clear part)
    const inset = alongX ? [P(p.gx + 0.2, p.gy + 0.1, 5), P(p.gx + w - 0.2, p.gy + 0.1, 5), P(p.gx + w - 0.2, p.gy + 0.1, 16), P(p.gx + 0.2, p.gy + 0.1, 16)] : [P(p.gx + 0.1, p.gy + 0.2, 5), P(p.gx + 0.1, p.gy + d - 0.2, 5), P(p.gx + 0.1, p.gy + d - 0.2, 16), P(p.gx + 0.1, p.gy + 0.2, 16)];
    poly(g, inset, glass);
    if (alongX) prism(g, p.gx + 0.25, p.gy + 0.16, w - 0.5, 0.26, 3.4, wood, 5); else prism(g, p.gx + 0.16, p.gy + 0.25, 0.26, d - 0.5, 3.4, wood, 5);
    for (const q of sorted.slice(2)) upright(g, q[0], q[1], 18, 3.6, post);
    prism(g, p.gx - 0.04, p.gy - 0.04, w + 0.08, d + 0.08, 3.2, roofC, 17.6); // the roof: a slab a little wider than the shelter
    return null;
  }, vary: [], ext: [8, 10, 8, 8],
});
shared('trough', { // a wooden water trough: a long flat box with the water in its top
  body(g, p, env) {
    const [cx, cy] = P(p.gx + p.w / 2, p.gy + p.d / 2), wood = col(WOOD.mid, env), water = col('#8fd8ee', env); flatShadow(g, cx + 4, cy + 2, (p.w + p.d) * 14, (p.w + p.d) * 4.6, 0.16);
    for (const [u, v] of [[0.14, 0.14], [p.w - 0.14, p.d - 0.14]]) { const q = P(p.gx + u, p.gy + v); upright(g, q[0], q[1], 4, 3.4, col(WOOD.shade, env)); }
    const F = prism(g, p.gx, p.gy, p.w, p.d, 6.4, wood, 2); void F;
    const t = facesOf(p.gx + 0.09, p.gy + 0.09, p.w - 0.18, p.d - 0.18, 0.1, 8.4).top; poly(g, t, shade(water, 0.84)); poly(g, facesOf(p.gx + 0.13, p.gy + 0.13, p.w - 0.3, p.d - 0.3, 0.1, 8.4).top, water);
    return null;
  }, vary: [], ext: [6, 6, 6, 6],
});
shared('farmgate', { // a five-bar field gate across a track: two posts and the bars, a brace on the diagonal
  body(g, p, env) {
    const cx = p.gx + p.w / 2, cy = p.gy + p.d / 2, hx = p.hx ?? 1, hy = p.hy ?? 0, nx = -hy, ny = hx, span = 1.15, a = P(cx - nx * span, cy - ny * span), b = P(cx + nx * span, cy + ny * span), wood = col(WOOD.shade, env), bar = col('#f6eedc', env);
    for (const q of [a, b]) flatShadow(g, q[0] + 3, q[1] + 1.2, 6, 2.2);
    const run = (t, z, h) => { const X = a[0] + (b[0] - a[0]) * t, Y = a[1] + (b[1] - a[1]) * t; return [X, Y - z - h / 2]; };
    for (const z of [3.5, 8.5, 13.5, 18.5]) { const p0 = run(0.06, z, 0), p1 = run(0.94, z, 0); poly(g, [[p0[0], p0[1] - 1.1 + 1.2], [p1[0], p1[1] - 1.1 + 1.2], [p1[0], p1[1] + 1.1 + 1.2], [p0[0], p0[1] + 1.1 + 1.2]], shade(bar, 0.78)); poly(g, [[p0[0], p0[1] - 1.1], [p1[0], p1[1] - 1.1], [p1[0], p1[1] + 1.1], [p0[0], p0[1] + 1.1]], bar); }
    { const p0 = run(0.1, 4, 0), p1 = run(0.9, 18, 0); poly(g, [[p0[0], p0[1] - 1.1], [p1[0], p1[1] - 1.1], [p1[0], p1[1] + 1.1], [p0[0], p0[1] + 1.1]], bar); } // the brace
    for (const q of [a, b]) { upright(g, q[0], q[1], 22, 5, wood); disc(g, q[0] - 0.3, q[1] - 22.5, 3.1, 2.1, col(WOOD.mid, env)); }
    return null;
  }, vary: ['hx', 'hy'], ext: [60, 36, 60, 14],
});
shared('trailboard', { // a trailhead board on two posts: a wooden frame round a cream panel with a hill, a sun and a path on it, facing the camera
  body(g, p, env) {
    const F = facesOf(p.gx, p.gy, p.w, p.d, 15, 12), face = longFace(F, p.w, p.d), a = facePoint(face, 0.08, 0.1), b = facePoint(face, 0.92, 0.1), [cx, cy] = P(p.gx + p.w / 2, p.gy + p.d / 2);
    flatShadow(g, cx + 5, cy + 2.5, (p.w + p.d) * 14, (p.w + p.d) * 5, 0.16);
    for (const q of [a, b]) upright(g, q[0], q[1], 13, 3.6, col(WOOD.shade, env));
    fq(g, face, 0, 1, 0, 1, shade(col(WOOD.mid, env), 0.78)); fq(g, face, 0, 0.98, 0.02, 1, col(WOOD.mid, env)); fq(g, face, 0.08, 0.9, 0.14, 0.88, col('#fff0d4', env));
    const pt = (u, v) => facePoint(face, u, v); poly(g, [pt(0.12, 0.2), pt(0.42, 0.62), pt(0.62, 0.34), pt(0.74, 0.5), pt(0.86, 0.2)], col(GRASS.mid, env)); poly(g, [pt(0.3, 0.2), pt(0.5, 0.2), pt(0.46, 0.4)], col('#f0c985', env)); disc(g, pt(0.74, 0.76)[0], pt(0.74, 0.76)[1], 2.6, 2.6, col(TOY.yellow, env));
    return null;
  }, vary: [], ext: [8, 10, 8, 8],
});
shared('portal', { // a tunnel mouth, sealed: a face of rock with an arch, boarded across with planks, a CLOSED plate and two cones (the arch is on the face that looks towards the street)
  body(g, p, env) {
    const h = p.h, rock = col(mix(ROCK.mid, ROCK.shade, 0.2), env), F = prism(g, p.gx, p.gy, p.w, p.d, h, rock), face = longFace(F, p.w, p.d), pt = (u, v) => facePoint(face, u, v), [cx, cy] = P(p.gx + p.w / 2, p.gy + p.d / 2);
    flatShadow(g, cx + 9, cy + 4, p.w * 15 + p.d * 8, (p.w + p.d) * 4.6, 0.15);
    for (const v of [0.58, 0.74, 0.88]) fq(g, face, 0, 1, v, v + 0.06, shade(rock, 0.88)); // three strata
    const arch = [pt(0.16, 0), pt(0.16, 0.42)]; for (let k = 1; k <= 10; k++) { const t = (k / 10) * Math.PI; arch.push(pt(0.5 - Math.cos(t) * 0.34, 0.42 + Math.sin(t) * 0.22)); } arch.push(pt(0.84, 0.42), pt(0.84, 0));
    poly(g, arch, col('#3a2f5e', env)); poly(g, arch.map(([x, y], i) => (i < 2 || i > arch.length - 3 ? [x, y] : [x, y + 0.8])).slice(1, -1), col('#4e4079', env));
    const plank = (u0, v0, u1, v1, c) => { const a = pt(u0, v0), b = pt(u1, v1); poly(g, [[a[0], a[1] - 2.2], [b[0], b[1] - 2.2], [b[0], b[1] + 2.2], [a[0], a[1] + 2.2]], c); };
    plank(0.16, 0.06, 0.84, 0.52, col(WOOD.mid, env)); plank(0.16, 0.52, 0.84, 0.06, col(WOOD.light, env)); plank(0.16, 0.3, 0.84, 0.3, col(WOOD.shade, env)); // the X of planks and the one across it
    const [sx, sy] = pt(0.5, 0.16); rr(g, sx - 12, sy - 6, 24, 11, 2.4, shade(col(TOY.red, env), 0.78)); rr(g, sx - 12.4, sy - 6.4, 23.6, 10.4, 2.4, col(TOY.red, env)); lettering(g, 'CLOSED', sx, sy - 1, 5.4, col('#fffaf0', env), face === F.left ? 0.5 : -0.5, null);
    const hx = p.hx ?? 0, hy = p.hy ?? -1, nx = -hy, ny = hx, half = hx ? p.w / 2 : p.d / 2, bx = p.gx + p.w / 2 - hx * (half + 0.55), by = p.gy + p.d / 2 - hy * (half + 0.55); // two cones on the street's side of the face
    for (const sd of [-1, 1]) { const [X, Y] = P(bx + nx * sd * 1.15, by + ny * sd * 1.15); cone(g, X, Y, env); }
    return null;
  }, vary: ['hx', 'hy'], ext: [34, 14, 34, 34],
});
shared('loaddock', { // a loading dock: a low shed with a roll-up door for each bay on the faces the camera sees (yellow frames, a hazard stripe along the foot), a band of colour under a flat roof with two vents
  body(g, p, env) {
    const wall = col('#e6eaf2', env), roof = col('#667599', env), acc = col(p.acc || '#ffd02e', env), steel = col('#b2bed8', env), dark = col('#3a2f5e', env), [cx, cy] = P(p.gx + p.w / 2, p.gy + p.d / 2), h = p.h;
    flatShadow(g, cx + 8, cy + 4, p.w * 20 + p.d * 12, (p.w + p.d) * 5.5, 0.15);
    const F = prism(g, p.gx, p.gy, p.w, p.d, h - 4, wall); prism(g, p.gx - 0.08, p.gy - 0.08, p.w + 0.16, p.d + 0.16, 4, roof, h - 4);
    prism(g, p.gx + p.w * 0.22, p.gy + p.d * 0.3, 0.5, 0.4, 3.4, shade(roof, 0.86), h); prism(g, p.gx + p.w * 0.62, p.gy + p.d * 0.5, 0.5, 0.4, 3.4, shade(roof, 0.86), h); // two roof vents
    const doors = (face, n) => {
      fq(g, face, 0, 1, 0.74, 0.9, acc); // the band of colour under the roof
      for (let i = 0; i < n; i++) {
        const u0 = 0.07 + (i * 0.86) / n + 0.035, u1 = 0.07 + ((i + 1) * 0.86) / n - 0.035;
        fq(g, face, u0 - 0.014, u1 + 0.014, 0.0, 0.66, acc); fq(g, face, u0, u1, 0.05, 0.64, dark); fq(g, face, u0 + 0.01, u1 - 0.01, 0.1, 0.64, steel); // a frame in the colour, the opening, the shutter
        for (const v of [0.26, 0.4, 0.54]) fq(g, face, u0 + 0.01, u1 - 0.01, v, v + 0.045, shade(steel, 0.82)); fq(g, face, u0, u1, 0.0, 0.07, dark);
      }
    };
    doors(longFace(F, p.w, p.d), 3); doors(p.w >= p.d ? F.right : F.left, 1);
    return null;
  }, vary: ['acc'], ext: [10, 14, 10, 12],
});
