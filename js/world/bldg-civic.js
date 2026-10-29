// The stone and glass landmarks: the colonnaded halls (the bank of finance, the exchange with its turning globe), the commercial bank with its vault door, the regulatory office, the glass towers and the IPO tower
// with its golden bell. Owner: T3 BUILDINGS (docs/RENDER_PLAN.md). V2 drawers of the 'static-bldg' layer, drawn on the toy kit (solids.toyBox, parts.js); same hit polygons as the legacy drawers.
import { P, mix, clamp, h2 } from './iso.js';
import { PAVE, GLASS, METAL } from './palette.js';
import { toyBox, toyRadius, toyTone, rampOf, wallOf, onWall, rrect, contourOf } from './solids.js';
import { reg, detailOf, facesOf, hitsOf, on, rgbaOf, windowGrid, archDoor, plank, wallMaterial, apron, FONT, detailFor, zoomOf, contourW, styleOf, windowGlow, fp, stage, columns, pediment, vaultDoor, dome, pennant, flatRoof, roof } from './parts.js';
import { hexRgb, seedOf, leftFace } from './props-common.js';
import { farBlock } from './buildings.js';

const tone = toyTone;
const CREAM = '#fff4de', MARBLE = '#fffaf0';

/** A stone step block: a rounded slab round the footprint (margin m tiles, h high) at elevation z. */
const slab = (ctx, p, m, h, z, col, r = 4.5) => toyBox(ctx, p.gx - m, p.gy - m, p.w + 2 * m, p.d + 2 * m, h, col, { z, r, gloss: 0.7, ao: false });

// ---------------------------------------------------------------- the colonnaded hall (finance, exchange)
// A long marble block on a two-step plinth under a low hip roof, with a portico standing out of its middle: four round columns under a gabled pediment with a gold coin in it, steps, flags, tall arched windows.
function hallBody(ctx, p, env, o = {}) {
  const lv = detailFor(ctx, env), zm = zoomOf(ctx, env), { gx, gy, w, d, h } = p, S = styleOf(p, env), C = S.C, night = env.night || 0, seed = seedOf(p), stone = C(PAVE.joint), z0 = 4;
  const marble = C(o.wall || p.col || '#eef6ea'), roofC = C(o.roofCol || p.roofCol || '#4f9a78'), gold = C(S.acc), contour = contourW(zm, lv), pw = Math.min(w * 0.38, 3.2), pd = 0.8, px = gx + (w - pw) / 2;
  stage(ctx, p, env, h + z0 + 14, { m: 0.34 });
  const plinth = { gx, gy, w, d: d + pd }; // the plinth reaches out under the portico
  slab(ctx, plinth, 0.34, 2, 0, mix(stone, '#ffffff', 0.2)); slab(ctx, plinth, 0.18, 2, 2, mix(stone, '#ffffff', 0.4));
  const B = toyBox(ctx, gx, gy, w, d, h, marble, { z: z0, r: toyRadius(w, d) * 0.7, gloss: 0.8 });
  const L = wallOf(B.left), Rt = wallOf(B.right);
  onWall(ctx, L, (c) => { c.fillStyle = tone(marble).l; c.fillRect(L.ins[0], -L.H, L.W - L.ins[0] - L.ins[1], 5); c.fillStyle = rgbaOf('#4a3f88', 0.14); c.fillRect(L.ins[0], -L.H + 5, L.W - L.ins[0] - L.ins[1], 2); c.fillStyle = tone(stone).l; rrect(c, L.ins[0], -3.2, L.W - L.ins[0] - L.ins[1], 3.4, 1.4); c.fill(); });
  const colN = Math.max(5, Math.round(w * 1.1));
  windowGrid(ctx, L, { cols: colN, rows: 1, x0: L.W * 0.05, x1: L.W * 0.95, y0: 9, y1: L.H - 9, fw: 0.46, fh: 0.82, S: 'l', trim: CREAM, lit: night * 1.3, night, seed, lv, arch: true, mull: 'bar', sill: false });
  windowGrid(ctx, Rt, { cols: 3, rows: 1, x0: Rt.W * 0.08, x1: Rt.W * 0.92, y0: 9, y1: Rt.H - 9, fw: 0.5, fh: 0.82, S: 'r', trim: CREAM, lit: night * 1.2, night, seed: seed + 3, lv, arch: true, sill: false });
  archDoor(ctx, Rt, { x: Rt.W * 0.5 - 5, w: 10, h: Rt.H * 0.46, S: 'r', col: C('#7a5a1e'), trim: CREAM, lv, seed });
  if (contour > 0) { ctx.save(); ctx.lineJoin = 'round'; ctx.strokeStyle = contourOf(marble); ctx.lineWidth = contour; ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.moveTo(B.sil[0][0], B.sil[0][1]); for (let i = 1; i < 6; i++) ctx.lineTo(B.sil[i][0], B.sil[i][1]); ctx.closePath(); ctx.stroke(); ctx.restore(); }
  // the roof of the block: a low hip, then the portico in front of its middle with a cross gable
  roof(ctx, { gx, gy, w, d }, z0 + h, { kind: 'hip', col: roofC, wall: marble, lv, e: 0.14, rise: 9, axis: 'x' });
  const ph = h - 3, P0 = toyBox(ctx, px, gy + d - 0.02, pw, pd, ph, marble, { z: z0, r: 4, gloss: 0.8, contour: contour * 0.7 }), PL = wallOf(P0.left);
  onWall(ctx, PL, (c) => { c.fillStyle = rgbaOf('#5c4c96', 0.42); rrect(c, PL.W * 0.05, -(PL.H - 8), PL.W * 0.9, PL.H - 11, 3); c.fill(); c.fillStyle = tone(marble).l; c.fillRect(PL.ins[0], -PL.H, PL.W - PL.ins[0] - PL.ins[1], 7); c.fillStyle = rgbaOf('#4a3f88', 0.14); c.fillRect(PL.ins[0], -PL.H + 7, PL.W - PL.ins[0] - PL.ins[1], 2); });
  columns(ctx, PL, { n: 4, x0: PL.W * 0.08, x1: PL.W * 0.92, base: 3, top: PL.H - 7, cw: 5.4, col: marble, S: 'l', lv });
  plank(ctx, PL, p.sign || 'BANK', { x: PL.W * 0.5, up: PL.H - 2.6, font: 7, S: 'l', col: gold, ink: S.ink, lv, w: Math.max(26, (p.sign || 'BANK').length * 5.6 + 10) });
  const rf = roof(ctx, { gx: px, gy: gy + d - 0.02, w: pw, d: pd }, z0 + ph, { kind: 'gable', col: roofC, wall: marble, lv, e: 0.1, rise: 10, axis: 'y' });
  const [ex, ey] = rf.at(rf.len, rf.span / 2, z0 + ph + rf.rise * 0.3); // the gold coin in the tympanum of the cross gable
  ctx.save(); ctx.translate(ex, ey); ctx.transform(1, 0.5, 0, 1, 0, 0); ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(0, 0, 3.6, 0, 6.3); ctx.fill(); ctx.fillStyle = mix(gold, '#fff7dc', 0.55); ctx.beginPath(); ctx.arc(-0.8, -0.8, 1.8, 0, 6.3); ctx.fill(); ctx.restore();
  // steps and the flags on the corners of the block's roof
  toyBox(ctx, px - 0.16, gy + d + pd - 0.02, pw + 0.32, 0.4, 1.8, mix(stone, '#ffffff', 0.5), { z: z0, r: 2, gloss: 0.7, ao: false });
  const a = P(gx + 0.25, gy + d - 0.15, z0 + h + 2), b = P(gx + w - 0.25, gy + d - 0.15, z0 + h + 2), fl = S.acc2 === '#2b2417' ? gold : S.acc2; pennant(ctx, a[0], a[1], 15, fl, 'l'); pennant(ctx, b[0], b[1], 15, fl, 'l');
  return o.hot || p.hot ? hitsOf(facesOf(gx, gy, w, d, h, z0)) : null;
}
const hallLive = (ctx, p, env) => windowGlow(env, p, leftFace(p, p.h, 4), 0.8);
reg('hall', { far: farBlock, body: hallBody, live: hallLive, pad: [12, 30, 12, 8] });

// the exchange: the hall in champagne with the golden pedestal on the roof; the globe turns live
const exchangeBody = (ctx, p, env) => {
  const q = { ...p, col: '#fffaf0', roofCol: '#7a5a30', sign: 'EXCHANGE', hot: 1 }, r = hallBody(ctx, q, env, { hot: 1 }), S = styleOf(p, env), gold = S.C('#f6c94f');
  const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, p.h + 4 + 9);
  ctx.fillStyle = 'rgba(74,63,136,.22)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 3, 17, 7, 0, 0, 6.3); ctx.fill();
  toyBox(ctx, p.gx + p.w / 2 - 0.5, p.gy + p.d / 2 - 0.5, 1, 1, 8, mix(gold, '#ffffff', 0.15), { z: p.h + 4 + 9, r: 3.5, gloss: 0.9 });
  ctx.strokeStyle = rgbaOf(gold, 0.5); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y - 8 - 17, 22, 0, 6.3); ctx.stroke(); // the halo ring behind the globe
  return r;
};
function globeAt(ctx, x, y, r, env, t) {
  // a ball shaded across (a radial gradient), continents drifting over it, meridians turning, a highlight: no clip, every mark stays inside the disc by construction
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r); g.addColorStop(0, '#7fd4f4'); g.addColorStop(0.55, '#2fa6d6'); g.addColorStop(1, '#2b5fb8');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
  const ph = (t / 9000) * Math.PI * 2; ctx.fillStyle = '#a4dc66';
  for (let k = 0; k < 4; k++) { const a = ph + k * 1.7, vis = Math.cos(a); if (vis < 0.05) continue; const cx = x + Math.sin(a) * r * 0.62, cy = y + (k % 2 ? 0.3 : -0.28) * r; ctx.beginPath(); ctx.ellipse(cx, cy, r * (0.2 + 0.07 * (k % 3)) * vis, r * (0.17 + 0.05 * (k % 2)), 0.4, 0, 6.3); ctx.fill(); }
  ctx.strokeStyle = 'rgba(255,247,220,.5)'; ctx.lineWidth = 1.5; for (let k = 0; k < 3; k++) { const a = ph + (k * Math.PI) / 3; ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.5, Math.abs(Math.cos(a)) * r - 0.75), r - 0.75, 0, 0, 6.3); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.ellipse(x - r * 0.38, y - r * 0.4, r * 0.26, r * 0.18, -0.5, 0, 6.3); ctx.fill();
}
const exchangeLive = (ctx, p, env) => {
  const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, p.h + 4 + 9 + 8 + 17);
  globeAt(ctx, x, y, 16, env, env.t || 0);
  if (!(env.lite || env.far)) env.lights?.push({ wx: x, wy: y - env.zoff, r: 80, c: '245,211,106', a: 0.35 });
  hallLive(ctx, p, env);
};
reg('exchange', { far: farBlock, body: exchangeBody, live: exchangeLive, pad: [12, 64, 12, 8] });

// ---------------------------------------------------------------- the commercial bank
reg('bank', {
  far: farBlock,
  night: false,
  pad: [14, 40, 12, 8],
  body(ctx, p, env) {
    const lv = detailFor(ctx, env), zm = zoomOf(ctx, env), { gx, gy, w, d, h } = p, S = styleOf({ ...p, col: env.crunch ? '#e0b2a8' : '#f2ecd6' }, env), C = S.C, stone = C(PAVE.joint), z0 = 5, contour = contourW(zm, lv);
    const mint = C('#e8f4de'), gold = C('#f6c94f'), seed = seedOf(p);
    stage(ctx, p, env, h + z0 + 10, { m: 0.4 });
    slab(ctx, p, 0.4, 2.5, 0, mix(stone, '#ffffff', 0.2)); slab(ctx, p, 0.22, 2.5, 2.5, mix(stone, '#ffffff', 0.4));
    const B = toyBox(ctx, gx, gy, w, d, h, env.crunch ? C('#e8c4bc') : mint, { z: z0, r: toyRadius(w, d) * 0.7, gloss: 0.8 });
    const L = wallOf(B.left), Rt = wallOf(B.right), wallC = env.crunch ? C('#e8c4bc') : mint;
    onWall(ctx, L, (c) => { c.fillStyle = rgbaOf('#5c4c96', 0.18); rrect(c, L.W * 0.06, -(L.H - 14), L.W * 0.88, L.H - 18, 3); c.fill(); c.fillStyle = tone(wallC).l; c.fillRect(L.ins[0], -L.H, L.W - L.ins[0] - L.ins[1], 10); c.fillStyle = rgbaOf('#4a3f88', 0.15); c.fillRect(L.ins[0], -L.H + 10, L.W - L.ins[0] - L.ins[1], 2); c.fillStyle = tone(C('#f6c94f')).l; c.fillRect(L.ins[0], -L.H + 7, L.W - L.ins[0] - L.ins[1], 3); });
    windowGrid(ctx, L, { cols: 3, rows: 2, x0: L.W * 0.13, x1: L.W * 0.87, y0: 8, y1: L.H - 17, fw: 0.42, fh: 0.7, S: 'l', trim: CREAM, lit: (env.night || 0) * 1.2, night: env.night || 0, seed, lv, arch: true, sill: false });
    columns(ctx, L, { n: 4, x0: L.W * 0.08, x1: L.W * 0.92, base: 3, top: L.H - 11, cw: 7, col: wallC, S: 'l', lv });
    onWall(ctx, L, (c) => { c.fillStyle = tone(stone).l; rrect(c, L.ins[0], -3.2, L.W - L.ins[0] - L.ins[1], 3.4, 1.4); c.fill(); });
    windowGrid(ctx, Rt, { cols: 2, rows: 2, x0: Rt.W * 0.1, x1: Rt.W * 0.9, y0: 8, y1: Rt.H - 14, fw: 0.5, fh: 0.7, S: 'r', trim: CREAM, lit: (env.night || 0) * 1.2, night: env.night || 0, seed: seed + 2, lv, arch: true, sill: false });
    vaultDoor(ctx, Rt, { x: Rt.W * 0.5, up: Rt.H * 0.36, r: 11, S: 'r', lv });
    // the green scalloped awning over the vault, then the roof, the gold dome and its coin sign
    toyBox(ctx, gx - 0.1, gy - 0.1, w + 0.2, d + 0.2, 3, C('#d8d2bc'), { z: z0 + h, r: 3.5, gloss: 0.7, ao: false });
    const [x, y] = P(gx + w / 2, gy + d / 2, z0 + h + 3);
    ctx.fillStyle = 'rgba(74,63,136,.2)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 2, 21, 8, 0, 0, 6.3); ctx.fill();
    toyBox(ctx, gx + w / 2 - 0.62, gy + d / 2 - 0.62, 1.24, 1.24, 6, mint, { z: z0 + h + 3, r: 4, gloss: 0.8 });
    dome(ctx, x, y - 6, 17, 13, gold);
    plank(ctx, L, 'BANK', { x: L.W * 0.5, up: L.H - 4.4, font: 7.4, S: 'l', col: C('#2f9e5b'), ink: '#fff6e0', lv });
    if (contour > 0) { ctx.save(); ctx.lineJoin = 'round'; ctx.strokeStyle = contourOf(wallC); ctx.lineWidth = contour; ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.moveTo(B.sil[0][0], B.sil[0][1]); for (let i = 1; i < 6; i++) ctx.lineTo(B.sil[i][0], B.sil[i][1]); ctx.closePath(); ctx.stroke(); ctx.restore(); }
    return hitsOf(facesOf(gx, gy, w, d, h, z0));
  },
});

// ---------------------------------------------------------------- the regulatory office (civic stone, a cupola, the scales)
reg('office', {
  far: farBlock,
  pad: [10, 36, 12, 8],
  body(ctx, p, env) {
    const lv = detailFor(ctx, env), zm = zoomOf(ctx, env), { gx, gy, w, d, h } = p, S = styleOf({ ...p, col: '#c4ccf0' }, env), C = S.C, wall = C('#c4ccf0'), seed = seedOf(p), contour = contourW(zm, lv), night = env.night || 0;
    stage(ctx, p, env, h + 16, { m: 0.3 });
    slab(ctx, p, 0.3, 2.4, 0, C(PAVE.joint)); slab(ctx, p, 0.16, 2.4, 2.4, mix(C(PAVE.joint), '#ffffff', 0.3));
    const B = toyBox(ctx, gx, gy, w, d, h, wall, { z: 0, r: toyRadius(w, d) * 0.8, gloss: 0.8 });
    const L = wallOf(B.left), Rt = wallOf(B.right);
    ctx.save(); ctx.beginPath(); ctx.moveTo(B.sil[0][0], B.sil[0][1]); for (let i = 1; i < 6; i++) ctx.lineTo(B.sil[i][0], B.sil[i][1]); ctx.closePath();
    wallMaterial(ctx, L, 'stone', wall, 'l', lv, seed); wallMaterial(ctx, Rt, 'stone', wall, 'r', lv, seed + 1); ctx.restore();
    onWall(ctx, L, (c) => { c.fillStyle = tone(mix(wall, '#ffffff', 0.4)).l; c.fillRect(L.ins[0], -L.H, L.W - L.ins[0] - L.ins[1], 5); c.fillStyle = rgbaOf('#4a3f88', 0.16); c.fillRect(L.ins[0], -L.H + 5, L.W - L.ins[0] - L.ins[1], 2); });
    onWall(ctx, Rt, (c) => { c.fillStyle = tone(mix(wall, '#ffffff', 0.4)).r; c.fillRect(Rt.ins[0], -Rt.H, Rt.W - Rt.ins[0] - Rt.ins[1], 5); });
    windowGrid(ctx, L, { cols: 3, rows: 2, x0: L.W * 0.1, x1: L.W * 0.9, y0: 10, y1: L.H - 8, fw: 0.5, fh: 0.66, S: 'l', trim: CREAM, lit: night * 1.2, night, seed, lv, arch: false });
    windowGrid(ctx, Rt, { cols: 3, rows: 2, x0: Rt.W * 0.1, x1: Rt.W * 0.9, y0: 10, y1: Rt.H - 8, fw: 0.5, fh: 0.66, S: 'r', trim: CREAM, lit: night * 1.2, night, seed: seed + 2, lv });
    archDoor(ctx, Rt, { x: Rt.W * 0.5 - 5, w: 10, h: 17, S: 'r', col: C('#6a4a8c'), trim: CREAM, lv, seed });
    // the roof: a slab, a cupola with a scales relief on the front, a flag
    toyBox(ctx, gx - 0.1, gy - 0.1, w + 0.2, d + 0.2, 4, mix(wall, '#6a5ab0', 0.35), { z: h, r: 4, gloss: 0.8 });
    const cu = toyBox(ctx, gx + w * 0.3, gy + d * 0.3, w * 0.4, d * 0.4, 12, mix(wall, '#ffffff', 0.25), { z: h + 4, r: 4, gloss: 0.9 });
    const [x, y] = [(cu.left[0][0] + cu.left[1][0]) / 2, (cu.left[0][1] + cu.left[1][1]) / 2 - 7];
    ctx.save(); ctx.translate(x, y); ctx.transform(1, 0.5, 0, 1, 0, 0); ctx.strokeStyle = C('#a07a14'); ctx.fillStyle = C('#f6c94f'); ctx.lineWidth = 1.7; ctx.lineCap = 'round'; // the scales of justice
    ctx.beginPath(); ctx.moveTo(0, -4.5); ctx.lineTo(0, 4); ctx.moveTo(-5, -2.5); ctx.lineTo(5, -2.5); ctx.stroke(); ctx.beginPath(); ctx.arc(-5, 0.5, 2.5, 0, Math.PI); ctx.arc(5, 0.5, 2.5, 0, Math.PI); ctx.fill(); ctx.restore();
    toyBox(ctx, gx + w * 0.3 - 0.06, gy + d * 0.3 - 0.06, w * 0.4 + 0.12, d * 0.4 + 0.12, 3, C('#7a6ac8'), { z: h + 16, r: 3, gloss: 0.8, ao: false });
    const fpnt = P(gx + w * 0.5, gy + d * 0.5, h + 19); pennant(ctx, fpnt[0], fpnt[1], 14, C('#ff5f4e'), 'l');
    plank(ctx, L, p.sign || 'AUDIT', { x: L.W * 0.5, up: L.H * 0.1 + 4, font: 8, S: 'l', col: C('#6a5ab0'), ink: '#fff6e0', lv });
    if (contour > 0) { ctx.save(); ctx.lineJoin = 'round'; ctx.strokeStyle = contourOf(wall); ctx.lineWidth = contour; ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.moveTo(B.sil[0][0], B.sil[0][1]); for (let i = 1; i < 6; i++) ctx.lineTo(B.sil[i][0], B.sil[i][1]); ctx.closePath(); ctx.stroke(); ctx.restore(); }
    return hitsOf(facesOf(gx, gy, w, d, h));
  },
  live(ctx, p, env) {
    if (env.alertAudit) { const [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, p.h + 24), k = 0.5 + 0.5 * Math.sin((env.t || 0) / 260); ctx.fillStyle = `rgba(255,${80 + 100 * k},60,1)`; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 6.3); ctx.fill(); ctx.fillStyle = `rgba(255,90,60,${0.22 + 0.2 * k})`; ctx.beginPath(); ctx.arc(x, y, 13, 0, 6.3); ctx.fill(); }
    windowGlow(env, p, leftFace(p), 0.9);
  },
});

// ---------------------------------------------------------------- the glass towers: stepped masses, glass in bands, a crown and an antenna with a ball tip
function towerShape(p) {
  const { w, d, h } = p, pod = 5, H1 = Math.round((h - pod) * 0.6), m = Math.min(w, d) * 0.09, crown = 4, H2 = h - pod - H1 - crown;
  return { pod, H1, H2, m, crown };
}
function glassBand(ctx, B, S, o) {
  const L = wallOf(B.left), Rt = wallOf(B.right), { lv, night, seed, trim, glass } = o, rows = Math.max(3, Math.round(L.H / 9)), cols = o.cols;
  windowGrid(ctx, L, { cols, rows, x0: L.W * 0.07, x1: L.W * 0.93, y0: 3, y1: L.H - 2, fw: 0.78, fh: 0.8, S: 'l', trim, glass, lit: night * 1.5, night, seed, lv, mull: 'bar', sill: false, round: 0.1 });
  windowGrid(ctx, Rt, { cols: Math.max(2, Math.round((cols * o.dw) / o.w)), rows, x0: Rt.W * 0.07, x1: Rt.W * 0.93, y0: 3, y1: Rt.H - 2, fw: 0.78, fh: 0.8, S: 'r', trim, glass, lit: night * 1.5, night, seed: seed + 5, lv, mull: 'bar', sill: false, round: 0.1 });
}
function towerBody(ctx, p, env) {
  const lv = detailFor(ctx, env), zm = zoomOf(ctx, env), { gx, gy, w, d, h } = p, S = styleOf({ ...p, col: p.color || '#6fb4ea' }, env), C = S.C, wall = S.wall, night = env.night || 0, seed = seedOf(p), contour = contourW(zm, lv);
  const { pod, H1, H2, m, crown } = towerShape(p), trim = mix(wall, C('#ffffff'), 0.5), glass = [mix(C('#bdeaff'), wall, 0.15), mix(C('#4d8fd6'), wall, 0.25)];
  stage(ctx, p, env, h + 14, { m: 0.2 });
  slab(ctx, p, 0.16, pod, 0, C(PAVE.joint), 4);
  const B1 = toyBox(ctx, gx, gy, w, d, H1, wall, { z: pod, r: toyRadius(w, d) * 0.8, gloss: 1, contour });
  const ca = ctx.getTransform ? 0 : 0; void ca;
  ctx.save(); ctx.beginPath(); ctx.moveTo(B1.sil[0][0], B1.sil[0][1]); for (let i = 1; i < 6; i++) ctx.lineTo(B1.sil[i][0], B1.sil[i][1]); ctx.closePath();
  wallMaterial(ctx, wallOf(B1.left), 'glass', wall, 'l', lv, seed); wallMaterial(ctx, wallOf(B1.right), 'glass', wall, 'r', lv, seed + 1); ctx.restore();
  glassBand(ctx, B1, S, { lv, night, seed, trim, glass, cols: 4, dw: d, w });
  // the setback ring, then the upper mass
  const ring = toyBox(ctx, gx + m * 0.4, gy + m * 0.4, w - m * 0.8, d - m * 0.8, 3, mix(wall, C('#ffffff'), 0.4), { z: pod + H1, r: 3, gloss: 0.9, ao: false });
  const B2 = toyBox(ctx, gx + m, gy + m, w - 2 * m, d - 2 * m, H2, mix(wall, C('#ffffff'), 0.06), { z: pod + H1 + 3, r: toyRadius(w - 2 * m, d - 2 * m) * 0.8, gloss: 1, contour });
  ctx.save(); ctx.beginPath(); ctx.moveTo(B2.sil[0][0], B2.sil[0][1]); for (let i = 1; i < 6; i++) ctx.lineTo(B2.sil[i][0], B2.sil[i][1]); ctx.closePath();
  wallMaterial(ctx, wallOf(B2.left), 'glass', wall, 'l', lv, seed); wallMaterial(ctx, wallOf(B2.right), 'glass', wall, 'r', lv, seed + 1); ctx.restore();
  glassBand(ctx, B2, S, { lv, night, seed: seed + 9, trim, glass, cols: 3, dw: d - 2 * m, w: w - 2 * m });
  // the crown: a rounded cap, a plant room, and the antenna with its ball tip
  const top = pod + H1 + 3 + H2;
  toyBox(ctx, gx + m * 0.6, gy + m * 0.6, w - m * 1.2, d - m * 1.2, crown, mix(wall, C('#ffffff'), 0.5), { z: top, r: 3, gloss: 0.9, ao: false });
  toyBox(ctx, gx + w * 0.34, gy + d * 0.34, w * 0.32, d * 0.32, 5, mix(wall, C('#fffaf0'), 0.3), { z: top + crown, r: 3, gloss: 0.8 });
  const [ax, ay] = P(gx + w / 2, gy + d / 2, top + crown + 5);
  ctx.strokeStyle = C(METAL.steelLight); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, ay - 22); ctx.stroke();
  ctx.fillStyle = C(METAL.steelHi); ctx.beginPath(); ctx.arc(ax, ay - 23, 2.5, 0, 6.3); ctx.fill();
  void ring;
  return p.hot ? hitsOf(facesOf(gx, gy, w, d, h)) : null;
}
function towerLive(ctx, p, env) {
  const { pod, H1, H2, crown } = towerShape(p), [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, pod + H1 + 3 + H2 + crown + 5), k = 0.5 + 0.5 * Math.sin((env.t || 0) / 700 + (p.seed || 0)), on_ = env.t ? Math.sin((env.t || 0) / 700 + (p.seed || 0)) > -0.2 : true;
  if (on_) { ctx.fillStyle = 'rgba(255,90,80,.3)'; ctx.beginPath(); ctx.arc(x, y - 23, 5.2 + k, 0, 6.3); ctx.fill(); ctx.fillStyle = '#ff5f4e'; ctx.beginPath(); ctx.arc(x, y - 23, 2.6, 0, 6.3); ctx.fill(); if (!(env.lite || env.far) && env.night > 0.2) env.lights?.push({ wx: x, wy: y - 23 - env.zoff, r: 22, c: '255,70,60', a: 0.5 }); }
  windowGlow(env, p, leftFace(p), 1.1);
}
reg('tower', { far: farBlock, body: towerBody, live: towerLive, pad: [10, 44, 14, 8] });

// ---------------------------------------------------------------- the IPO tower: three setbacks of pale glass, a gold crown with the golden bell in an arch, a spire
reg('ipo', {
  far: farBlock,
  pad: [14, 80, 34, 10],
  body(ctx, p, env) {
    const lv = detailFor(ctx, env), zm = zoomOf(ctx, env), { gx, gy, w, d, h } = p, S = styleOf({ ...p, col: '#8db2f0' }, env), C = S.C, night = env.night || 0, seed = seedOf(p), contour = contourW(zm, lv), pod = 6;
    const wall = C('#8db2f0'), trim = mix(wall, C('#ffffff'), 0.5), glass = [C('#cdeeff'), C('#5a94de')], gold = C('#f6c94f');
    stage(ctx, p, env, h + 20, { m: 0.3 });
    slab(ctx, p, 0.3, 3, 0, C(PAVE.joint), 5); slab(ctx, p, 0.16, 3, 3, mix(C(PAVE.joint), '#ffffff', 0.3), 4);
    const H = h * 0.72, h1 = H * 0.55, h2 = H - h1, h3 = h * 0.28, m1 = 0.5, m2 = 1.0;
    const parts = [[0, w, d, h1, 0, wall, 5, 4], [0.35, w - 0.7, d - 0.7, h2, h1, mix(wall, C('#ffffff'), 0.05), 4, 3], [m2, w - 2 * m2, d - 2 * m2, h3, H, mix(wall, C('#ffffff'), 0.1), 3, 3]];
    let B = null;
    for (const [off, ww, dd, hh, zz, col, cols] of parts) {
      B = toyBox(ctx, gx + off, gy + off, ww, dd, hh, col, { z: pod + zz, r: toyRadius(ww, dd) * 0.8, gloss: 1, contour });
      ctx.save(); ctx.beginPath(); ctx.moveTo(B.sil[0][0], B.sil[0][1]); for (let i = 1; i < 6; i++) ctx.lineTo(B.sil[i][0], B.sil[i][1]); ctx.closePath();
      wallMaterial(ctx, wallOf(B.left), 'glass', col, 'l', lv, seed); wallMaterial(ctx, wallOf(B.right), 'glass', col, 'r', lv, seed + 1); ctx.restore();
      glassBand(ctx, B, S, { lv, night, seed: seed + zz, trim, glass, cols, dw: dd, w: ww });
      toyBox(ctx, gx + off - 0.06, gy + off - 0.06, ww + 0.12, dd + 0.12, 2.5, mix(wall, C('#ffffff'), 0.55), { z: pod + zz + hh, r: 2.5, gloss: 0.9, ao: false }); // the setback terrace edge
    }
    // the gold crown on the top mass: a ring, an arched opening with the bell in it, a spire
    const zt = pod + H + h3 + 2.5, [cx, cy] = P(gx + w / 2, gy + d / 2, zt), Lb = wallOf(B.left);
    toyBox(ctx, gx + m2 + 0.15, gy + m2 + 0.15, w - 2 * m2 - 0.3, d - 2 * m2 - 0.3, 6, mix(gold, '#ffffff', 0.2), { z: zt, r: 3, gloss: 1 });
    onWall(ctx, Lb, (c) => { const bx = Lb.W / 2, by = -(Lb.H * 0.5); c.fillStyle = rgbaOf('#4a3f88', 0.55); c.beginPath(); c.moveTo(bx - 8, by + 12); c.lineTo(bx - 8, by - 4); c.arc(bx, by - 4, 8, Math.PI, 0); c.lineTo(bx + 8, by + 12); c.closePath(); c.fill();
      c.fillStyle = gold; c.beginPath(); c.moveTo(bx - 6, by + 10); c.quadraticCurveTo(bx - 6, by - 4, bx, by - 7); c.quadraticCurveTo(bx + 6, by - 4, bx + 6, by + 10); c.closePath(); c.fill(); c.fillStyle = mix(gold, '#fffbe6', 0.55); c.beginPath(); c.ellipse(bx - 2.3, by, 1.8, 5, 0.12, 0, 6.3); c.fill(); c.fillStyle = C('#d9a52c'); c.beginPath(); c.arc(bx, by + 11, 2, 0, 6.3); c.fill(); });
    ctx.strokeStyle = gold; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy - 32); ctx.stroke(); ctx.fillStyle = mix(gold, '#ffffff', 0.4); ctx.beginPath(); ctx.arc(cx, cy - 33, 3, 0, 6.3); ctx.fill();
    for (const [u, v] of [[0.06, 0.94], [0.94, 0.94]]) { const q = P(gx + w * u, gy + d * v, pod + h1 + 2.5); pennant(ctx, q[0], q[1], 12, C('#ff7fb8'), 'l'); }
    return hitsOf(facesOf(gx, gy, w, d, h * 0.72, 6));
  },
  live(ctx, p, env) {
    const zt = 6 + p.h * 0.72 + p.h * 0.28 + 2.5, [x, y] = P(p.gx + p.w / 2, p.gy + p.d / 2, zt), k = 0.5 + 0.5 * Math.sin((env.t || 0) / 1000);
    ctx.fillStyle = `rgba(255,224,120,${0.16 + 0.12 * k})`; ctx.beginPath(); ctx.arc(x, y - 8, 22 + 3 * k, 0, 6.3); ctx.fill(); ctx.fillStyle = `rgba(255,224,120,${0.24 + 0.2 * k})`; ctx.beginPath(); ctx.arc(x, y - 8, 12, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#ff5f4e'; ctx.beginPath(); ctx.arc(x, y - 33, 2.4, 0, 6.3); ctx.fill();
    windowGlow(env, p, leftFace(p, p.h * 0.72, 6), 1.2);
  },
});

void rampOf; void h2; void clamp; void GLASS; void hexRgb; void apron; void FONT; void fp; void flatRoof; void detailOf; void on; void rgbaOf; void archDoor; void tone;
