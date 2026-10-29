// The small and the grand houses: market stalls with striped awnings, the metro kiosk pod, the auction podium, the terrace of the property row, the estate manor and the plain shop. Owner: T3 BUILDINGS (docs/RENDER_PLAN.md).
// V2 drawers of the 'static-bldg' layer on the toy kit; the same hit polygons as the legacy drawers.
import { P, mix, clamp, h2 } from './iso.js';
import { PAVE, WOOD, TILE, BRICK } from './palette.js';
import { toyBox, toyRadius, toyTone, rampOf, wallOf, onWall, rrect, contourOf } from './solids.js';
import { ball, reg, facesOf, hitsOf, on, rgbaOf, windowGrid, archDoor, plank, wallMaterial, FONT, detailFor, zoomOf, contourW, styleOf, windowGlow, stage, roof, chimney, columns, pennant, tank, puffs, apron } from './parts.js';
import { seedOf, leftFace } from './props-common.js';
import { farBlock } from './buildings.js';

const tone = toyTone;
const CREAM = '#fff4de';
const clipSil = (ctx, B) => { ctx.beginPath(); ctx.moveTo(B.sil[0][0], B.sil[0][1]); for (let i = 1; i < B.sil.length; i++) ctx.lineTo(B.sil[i][0], B.sil[i][1]); ctx.closePath(); };
const outline = (ctx, B, col, w, a = 0.42) => { if (!(w > 0)) return; ctx.save(); ctx.lineJoin = 'round'; ctx.strokeStyle = contourOf(col); ctx.lineWidth = w; ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(B.sil[0][0], B.sil[0][1]); for (let i = 1; i < B.sil.length; i++) ctx.lineTo(B.sil[i][0], B.sil[i][1]); ctx.closePath(); ctx.stroke(); ctx.restore(); };
const poly = (ctx, pts, fill) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
const post = (ctx, x, y, h, col) => { ctx.strokeStyle = col; ctx.lineWidth = 3.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.stroke(); ctx.strokeStyle = rgbaOf('#ffffff', 0.35); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 0.9, y - 1); ctx.lineTo(x - 0.9, y - h + 1); ctx.stroke(); };

// ---------------------------------------------------------------- the market stall
const GOODS = [['#e8503a', '#ff8a6a', '#6cc178'], ['#f2c94c', '#ffe27a', '#e8a03a'], ['#6cc178', '#a4dc66', '#3fb9b2']];
reg('stall', {
  far: farBlock,
  night: false,
  pad: [10, 20, 12, 8],
  body(ctx, p, env) {
    const lv = detailFor(ctx, env), { gx, gy, w, d } = p, S = styleOf(p, env), C = S.C, seed = seedOf(p), woodC = C(p.col || '#cc8f50'), a1 = C(p.awn || S.acc), a2 = C(p.awn2 || '#fff4dc');
    stage(ctx, p, env, 24, { m: 0.18, a: 0.5 });
    const zT = 25, zF = 17, n = 6, G = (u, v, z) => P(gx + w * u, gy + v, z);
    // back posts, the counter with the goods, front posts, then the striped canvas over them
    for (const [px, py] of [[gx + 0.08, gy + 0.08], [gx + w - 0.08, gy + 0.08]]) { const [x, y] = P(px, py); post(ctx, x, y, zT, tone(woodC).r); }
    const cB = toyBox(ctx, gx + 0.05, gy + d * 0.38, w - 0.1, d * 0.58, 8, woodC, { r: 3, gloss: 0.9 }), CL = wallOf(cB.left);
    ctx.save(); clipSil(ctx, cB); wallMaterial(ctx, CL, 'boards', woodC, 'l', lv, seed); ctx.restore();
    onWall(ctx, CL, (c) => { c.fillStyle = rgbaOf(a1, 0.85); c.fillRect(CL.ins[0], -CL.H + 0.5, CL.W - CL.ins[0] - CL.ins[1], 2.6); });
    const goods = GOODS[(p.goods | 0) % 3];
    for (let i = 0; i < 4; i++) { const u = (i + 0.5) / 4, [x, y] = P(gx + 0.1 + (w - 0.2) * u, gy + d * 0.62, 8); ctx.fillStyle = tone(woodC).l; ctx.beginPath(); ctx.ellipse(x, y, 8.4, 4.2, 0, 0, 6.3); ctx.fill(); ctx.fillStyle = rgbaOf('#4a3f88', 0.25); ctx.beginPath(); ctx.ellipse(x, y + 0.6, 7, 3.2, 0, 0, 6.3); ctx.fill(); for (let k = 0; k < 4; k++) ball(ctx, x + (k - 1.5) * 3.1, y - 2.2 - (k % 2) * 1.4, 2.9, goods[(i + k) % 3], '#fff7dc', mix(goods[(i + k) % 3], '#4a3f88', 0.45)); }
    for (const [px, py] of [[gx + 0.08, gy + d - 0.05], [gx + w - 0.08, gy + d - 0.05]]) { const [x, y] = P(px, py); post(ctx, x, y, zF + 1, tone(woodC).l); }
    for (let i = 0; i < n; i++) { const u0 = i / n, u1 = (i + 1) / n, c = tone(i % 2 ? a2 : a1); poly(ctx, [G(u0, -0.02, zT), G(u1, -0.02, zT), G(u1, d + 0.2, zF), G(u0, d + 0.2, zF)], i % 2 ? mix(c.t, c.l, 0.4) : mix(c.t, c.l, 0.4)); }
    // the scalloped valance and the lit lip, a hanging lantern and a price flag
    for (let i = 0; i < n; i++) { const a = G(i / n, d + 0.2, zF), b = G((i + 1) / n, d + 0.2, zF), c = tone(i % 2 ? a2 : a1); ctx.fillStyle = c.l; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.quadraticCurveTo(b[0], b[1] + 6, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 4); ctx.quadraticCurveTo(a[0], a[1] + 6, a[0], a[1]); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = rgbaOf('#ffffff', 0.5); ctx.lineWidth = 1.6; ctx.lineCap = 'round'; const t0 = G(0, -0.02, zT), t1 = G(1, -0.02, zT); ctx.beginPath(); ctx.moveTo(t0[0], t0[1] + 0.8); ctx.lineTo(t1[0], t1[1] + 0.8); ctx.stroke();
    const lq = G(0.85, d + 0.2, zF), lx = lq[0], ly = lq[1] + 5; ctx.strokeStyle = tone(woodC).r; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(lq[0], lq[1] + 3); ctx.lineTo(lx, ly); ctx.stroke(); ctx.fillStyle = '#ffd36e'; rrect(ctx, lx - 2.6, ly, 5.2, 6.2, 2.2); ctx.fill(); ctx.fillStyle = tone(woodC).l; rrect(ctx, lx - 3, ly - 1, 6, 2, 1); ctx.fill();
    const fq = P(gx + w * 0.15, gy + d * 0.7, 8); ctx.strokeStyle = '#5a4020'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(fq[0], fq[1]); ctx.lineTo(fq[0], fq[1] - 9); ctx.stroke(); ctx.fillStyle = '#fffaf0'; rrect(ctx, fq[0], fq[1] - 12, 7, 5.4, 1.2); ctx.fill(); ctx.fillStyle = '#3a2f5e'; ctx.font = `800 4.4px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', fq[0] + 3.5, fq[1] - 9.2);
    return null;
  },
});

// ---------------------------------------------------------------- the kiosk pod: a round-bodied pod with a glass band, an accent sign and a thin overhanging roof disc
reg('kiosk', {
  far: farBlock,
  night: false,
  pad: [10, 16, 12, 8],
  body(ctx, p, env) {
    const lv = detailFor(ctx, env), { gx, gy, w, d, h } = p, S = styleOf(p, env), C = S.C, col = C(p.col || '#5fa8e8'), [x, y] = P(gx + w / 2, gy + d / 2, 0), rx = Math.max(w, d) * 17;
    stage(ctx, p, env, h + 3, { m: 0.2, a: 0.5 });
    tank(ctx, x, y, rx, h * 0.62, col, { lid: mix(col, C('#ffffff'), 0.3), bands: [[0, 3, mix(col, C('#fffaf0'), 0.5)]] });
    const gl = ctx.createLinearGradient(0, y - h * 0.62 - h * 0.38, 0, y - h * 0.62); gl.addColorStop(0, C('#d6f2ff')); gl.addColorStop(1, C('#5aa4e0'));
    const yb = y - h * 0.62, yt = yb - h * 0.36; ctx.fillStyle = gl; ctx.beginPath(); ctx.moveTo(x - rx * 0.94, yb); ctx.lineTo(x - rx * 0.94, yt); ctx.ellipse(x, yt, rx * 0.94, rx * 0.47, 0, Math.PI, 0, true); ctx.lineTo(x + rx * 0.94, yb); ctx.ellipse(x, yb, rx * 0.94, rx * 0.47, 0, 0, Math.PI, false); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgbaOf('#ffffff', 0.45); ctx.beginPath(); ctx.moveTo(x - rx * 0.6, yb + rx * 0.2); ctx.lineTo(x - rx * 0.4, yb + rx * 0.3); ctx.lineTo(x - rx * 0.3, yt + rx * 0.4); ctx.lineTo(x - rx * 0.5, yt + rx * 0.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgbaOf('#4a3f88', 0.25); ctx.beginPath(); ctx.ellipse(x + 2, yt + 3, rx * 1.12, rx * 0.56, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = tone(mix(col, C('#fffaf0'), 0.4)).l; ctx.beginPath(); ctx.ellipse(x, yt, rx * 1.14, rx * 0.57, 0, 0, 6.3); ctx.fill(); ctx.fillStyle = tone(mix(col, C('#fffaf0'), 0.4)).t; ctx.beginPath(); ctx.ellipse(x, yt - 1.4, rx * 1.1, rx * 0.54, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, yt - 1.6, rx * 0.5, rx * 0.25, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = C('#fffaf0'); ctx.beginPath(); ctx.arc(x - rx * 0.2, yb + rx * 0.5 + 1, 5.6, 0, 6.3); ctx.fill(); ctx.fillStyle = col; ctx.font = `800 7px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.sign || 'M', x - rx * 0.2, yb + rx * 0.5 + 1.4);
    void lv; return null;
  },
});

// ---------------------------------------------------------------- the auction podium: a plum-carpeted dais, a lectern and gavel, brass stanchions with a rope, a vase, a banner
reg('podium', {
  far: farBlock,
  night: false,
  pad: [10, 28, 12, 8],
  body(ctx, p, env) {
    const lv = detailFor(ctx, env), { gx, gy, w, d } = p, S = styleOf(p, env), C = S.C, carpet = C(p.col || '#a98bd6'), gold = C('#f6c94f'), stone = C('#e8dcc4');
    stage(ctx, p, env, 26, { m: 0.22, a: 0.5 });
    toyBox(ctx, gx - 0.2, gy - 0.2, w + 0.4, d + 0.4, 3, stone, { z: 0, r: 4, gloss: 0.8 });
    const D = toyBox(ctx, gx + 0.04, gy + 0.04, w - 0.08, d - 0.08, 1.6, carpet, { z: 3, r: 2.4, gloss: 0.9, ao: false, edge: false });
    const L = wallOf(D.left); onWall(ctx, L, (c) => { c.fillStyle = gold; c.fillRect(L.ins[0], -L.H, L.W - L.ins[0] - L.ins[1], 1); });
    const lec = toyBox(ctx, gx + w * 0.3, gy + d * 0.25, w * 0.4, d * 0.46, 12, carpet, { z: 4.6, r: 3, gloss: 1 }), LL = wallOf(lec.left);
    onWall(ctx, LL, (c) => { c.fillStyle = gold; rrect(c, LL.W * 0.28, -LL.H * 0.82, LL.W * 0.44, LL.H * 0.5, 2.4); c.fill(); c.fillStyle = tone(carpet).l; c.font = `800 5px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('LOT', LL.W * 0.5, -LL.H * 0.57); });
    const top = P(gx + w * 0.5, gy + d * 0.48, 4.6 + 12); // the gavel: a round head on a short handle
    ctx.strokeStyle = tone(C('#9c6238')).l; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(top[0] - 4, top[1] + 1); ctx.lineTo(top[0] + 3, top[1] - 2); ctx.stroke(); ctx.fillStyle = tone(C('#cc8f50')).l; rrect(ctx, top[0] + 1, top[1] - 6, 6, 5, 2); ctx.fill();
    // two brass stanchions with the rope between them, a vase of flowers, a banner behind
    const s0 = P(gx + 0.05, gy + d + 0.2, 3), s1 = P(gx + w - 0.05, gy + d + 0.2, 3);
    for (const q of [s0, s1]) { ctx.strokeStyle = gold; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0], q[1] - 14); ctx.stroke(); ctx.fillStyle = mix(gold, '#ffffff', 0.4); ctx.beginPath(); ctx.arc(q[0], q[1] - 15, 2.6, 0, 6.3); ctx.fill(); ctx.fillStyle = rgbaOf('#4a3f88', 0.25); ctx.beginPath(); ctx.ellipse(q[0] + 1, q[1], 4, 2, 0, 0, 6.3); ctx.fill(); }
    ctx.strokeStyle = C('#d94a6a'); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(s0[0], s0[1] - 14); ctx.quadraticCurveTo((s0[0] + s1[0]) / 2, (s0[1] + s1[1]) / 2 - 8, s1[0], s1[1] - 14); ctx.stroke();
    const v = P(gx + w * 0.82, gy + d * 0.3, 4.6); ctx.fillStyle = tone(C('#cdeedc')).l; rrect(ctx, v[0] - 2.6, v[1] - 6, 5.2, 6, 2); ctx.fill(); for (let k = 0; k < 3; k++) { ball(ctx, v[0] + (k - 1) * 3, v[1] - 8 - (k % 2), 2.4, ['#ff9cc2', '#ffd84d', '#fffbe8'][k], '#ffffff', '#c06080'); }
    const b = P(gx + w * 0.1, gy + d * 0.2, 4.6); ctx.strokeStyle = tone(C('#9c6238')).l; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0], b[1] - 22); ctx.stroke(); ctx.fillStyle = C('#ff7fb8'); rrect(ctx, b[0] + 0.8, b[1] - 22, 8, 10, 1.4); ctx.fill(); ctx.fillStyle = '#fffaf0'; ctx.font = `800 4px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('BID', b[0] + 4.8, b[1] - 15.8);
    void lv; return null;
  },
});

// ---------------------------------------------------------------- the property row: a terrace of gabled houses in coral, peach and mint, with doors, flower boxes and chimneys
const ROW = [['#ff9f8a', '#e2704c'], ['#ffd8b6', '#3fb9b2'], ['#cdeedc', '#a272c8']];
function terraceHouse(ctx, q, env, S, lv, i, seed) {
  const C = S.C, wall = C(ROW[i % 3][0]), roofC = C(ROW[i % 3][1]), night = env.night || 0, { gx, gy, w, d, h } = q;
  const B = toyBox(ctx, gx, gy, w, d, h, wall, { r: toyRadius(w, d) * 0.8, gloss: 0.9 }), L = wallOf(B.left), Rt = wallOf(B.right);
  ctx.save(); clipSil(ctx, B); onWall(ctx, L, (c) => { c.fillStyle = tone(mix(wall, C(PAVE.joint), 0.55)).l; c.fillRect(L.ins[0], -3.6, L.W - L.ins[0] - L.ins[1], 3.6); }); onWall(ctx, Rt, (c) => { c.fillStyle = tone(mix(wall, C(PAVE.joint), 0.55)).r; c.fillRect(Rt.ins[0], -3.6, Rt.W - Rt.ins[0] - Rt.ins[1], 3.6); }); ctx.restore();
  windowGrid(ctx, L, { cols: 2, rows: 2, x0: L.W * 0.08, x1: L.W * 0.92, y0: 6, y1: h - 4, fw: 0.42, fh: 0.58, S: 'l', trim: CREAM, shutter: S.shutter || C('#7be0cf'), curtain: S.curtain, box: true, lit: night * 1.3, night, seed: seed + i, lv });
  archDoor(ctx, L, { x: L.W * 0.5 - 4.4, w: 8.8, h: Math.min(18, h * 0.46), S: 'l', col: C(['#98413f', '#2f8f86', '#744c9e'][i % 3]), trim: CREAM, lv, seed: seed + i, num: 12 + i * 2 });
  windowGrid(ctx, Rt, { cols: 1, rows: 2, x0: Rt.W * 0.25, x1: Rt.W * 0.75, y0: 6, y1: h - 4, fw: 0.6, fh: 0.58, S: 'r', trim: CREAM, lit: night * 1.2, night, seed: seed + i + 3, lv });
  const rf = roof(ctx, q, h, { kind: 'gable', col: roofC, wall, lv, e: 0.1, rise: 16, axis: 'y' });
  chimney(ctx, gx + w * 0.3, gy + d * 0.28, h + rf.rise * 0.45, 9, { col: C(BRICK.mid), w: 0.24 });
  return { B, L, rf };
}
reg('rentrow', {
  far: farBlock,
  pad: [10, 34, 12, 8],
  body(ctx, p, env) {
    const lv = detailFor(ctx, env), { gx, gy, w, d, h } = p, S = styleOf(p, env), seed = seedOf(p), C = S.C, n = 3, cw = w / n, hs = [h, h - 8, h + 4];
    stage(ctx, p, env, h + 14, { m: 0.2 });
    let mid = null;
    for (let i = 0; i < n; i++) { const q = { gx: gx + i * cw + 0.05, gy, w: cw - 0.1, d, h: hs[i] }, r = terraceHouse(ctx, q, env, S, lv, i, seed); if (i === 1) mid = { q, r }; }
    plank(ctx, mid.r.L, 'TO LET', { x: mid.r.L.W * 0.5, up: mid.q.h * 0.62, font: 6.2, S: 'l', col: C('#e8795a'), ink: '#fffaf0', lv });
    return hitsOf(facesOf(mid.q.gx, mid.q.gy, mid.q.w, mid.q.d, mid.q.h));
  },
  live: (ctx, p, env) => windowGlow(env, p, leftFace(p), 1),
});

// ---------------------------------------------------------------- the manor: a cream block under a plum hip roof with two dormers, a columned portico, shutters, two chimneys
reg('manor', {
  far: farBlock,
  pad: [12, 40, 14, 8],
  body(ctx, p, env) {
    const lv = detailFor(ctx, env), zm = zoomOf(ctx, env), { gx, gy, w, d, h } = p, S = styleOf(p, env), C = S.C, seed = seedOf(p), night = env.night || 0, wall = S.wall, roofC = C(p.roofCol || '#a272c8'), contour = contourW(zm, lv), shutter = C('#c9a6ff');
    stage(ctx, p, env, h + 16, { m: 0.28 });
    const B = toyBox(ctx, gx, gy, w, d, h, wall, { r: toyRadius(w, d) * 0.8, gloss: 0.9 }), L = wallOf(B.left), Rt = wallOf(B.right);
    ctx.save(); clipSil(ctx, B); wallMaterial(ctx, L, 'plaster', wall, 'l', lv, seed); wallMaterial(ctx, Rt, 'plaster', wall, 'r', lv, seed + 1);
    for (const [wl, side] of [[L, 'l'], [Rt, 'r']]) onWall(ctx, wl, (c) => { c.fillStyle = tone(mix(wall, C(PAVE.joint), 0.6))[side]; c.fillRect(wl.ins[0], -3.6, wl.W - wl.ins[0] - wl.ins[1], 3.6); c.fillStyle = tone(C('#fffaf0'))[side]; c.fillRect(wl.ins[0], -wl.H, wl.W - wl.ins[0] - wl.ins[1], 3); c.fillStyle = rgbaOf('#4a3f88', 0.2); c.fillRect(wl.ins[0], -wl.H + 3, wl.W - wl.ins[0] - wl.ins[1], 7); }); ctx.restore();
    outline(ctx, B, wall, contour);
    const cols = Math.max(5, Math.round(w * 0.9));
    windowGrid(ctx, L, { cols, rows: 2, x0: L.W * 0.06, x1: L.W * 0.94, y0: 6, y1: h - 8, fw: 0.46, fh: 0.62, S: 'l', trim: CREAM, shutter, curtain: S.curtain, box: false, lit: night * 1.3, night, seed, lv, arch: false });
    windowGrid(ctx, Rt, { cols: 3, rows: 2, x0: Rt.W * 0.1, x1: Rt.W * 0.9, y0: 6, y1: h - 8, fw: 0.46, fh: 0.62, S: 'r', trim: CREAM, shutter, lit: night * 1.2, night, seed: seed + 3, lv });
    // climbing roses on the sunny wall: pink dots on green at close zoom
    if (on(lv[3])) { ctx.save(); ctx.globalAlpha = lv[3]; onWall(ctx, L, (c) => { for (let k = 0; k < 22; k++) { const x = L.W * (0.02 + h2(seed, k) * 0.12), y = -(5 + h2(seed, k + 30) * (h - 12)); c.fillStyle = h2(seed, k + 5) > 0.45 ? C('#ff9cc2') : C('#6cc178'); c.beginPath(); c.arc(x, y, 1.8 + h2(seed, k + 9), 0, 6.3); c.fill(); } }); ctx.restore(); }
    const rf = roof(ctx, p, h, { kind: 'hip', col: roofC, wall, lv, e: 0.14, rise: 16, axis: 'x' });
    // two dormers on the front slope
    for (const u of [0.27, 0.68]) {
      const v = rf.span * 0.76, zb = h + rf.rise * (1 - (v - rf.span / 2) / (rf.span / 2)) - 4.5, dw = 0.7, dd = 0.4;
      const Dm = toyBox(ctx, gx + w * u - dw / 2, gy + v, dw, dd, 9, wall, { z: zb, r: 2.6, gloss: 0.9, ao: false }), DL = wallOf(Dm.left);
      windowGrid(ctx, DL, { cols: 1, rows: 1, x0: DL.W * 0.18, x1: DL.W * 0.82, y0: 2, y1: DL.H - 1.5, fw: 0.8, fh: 0.8, S: 'l', trim: CREAM, lit: night * 1.2, night, seed: seed + 9, lv, mull: 'bar', sill: false });
      roof(ctx, { gx: gx + w * u - dw / 2, gy: gy + v, w: dw, d: dd }, zb + 9, { kind: 'gable', col: roofC, wall, lv: [1, 0, 0, 0], e: 0.08, rise: 5, axis: 'y' });
    }
    // the portico: four round columns under a small gable, steps in front
    const pw = Math.min(w * 0.3, 2.4), pd = 0.7, px = gx + (w - pw) / 2, ph = h * 0.62, P0 = toyBox(ctx, px, gy + d - 0.02, pw, pd, ph, wall, { r: 3.4, gloss: 0.9 }), PL = wallOf(P0.left);
    onWall(ctx, PL, (c) => { c.fillStyle = rgbaOf('#5c4c96', 0.4); rrect(c, PL.W * 0.05, -(PL.H - 6), PL.W * 0.9, PL.H - 8, 3); c.fill(); c.fillStyle = tone(wall).l; c.fillRect(PL.ins[0], -PL.H, PL.W - PL.ins[0] - PL.ins[1], 5); });
    columns(ctx, PL, { n: 4, x0: PL.W * 0.08, x1: PL.W * 0.92, base: 2.5, top: PL.H - 5, cw: 4.6, col: C('#fffaf0'), S: 'l', lv });
    archDoor(ctx, PL, { x: PL.W * 0.5 - 4, w: 8, h: PL.H * 0.55, S: 'l', col: C('#744c9e'), trim: CREAM, lv: [1, 0, 0, 0], seed });
    roof(ctx, { gx: px, gy: gy + d - 0.02, w: pw, d: pd }, ph, { kind: 'gable', col: roofC, wall, lv, e: 0.08, rise: 8, axis: 'y' });
    toyBox(ctx, px - 0.14, gy + d + pd - 0.04, pw + 0.28, 0.34, 2, C(PAVE.cream), { z: 0, r: 2, gloss: 0.7, ao: false });
    for (const [u, vv] of [[0.14, 0.34], [0.86, 0.34]]) { const q = P(gx + w * u, gy + d * vv, h + rf.rise * 0.9); void q; }
    chimney(ctx, gx + w * 0.12, gy + d * 0.3, h + rf.rise * 0.42, 12, { col: C(BRICK.mid), w: 0.3 }); chimney(ctx, gx + w * 0.82, gy + d * 0.3, h + rf.rise * 0.42, 12, { col: C(BRICK.mid), w: 0.3 });
    return null;
  },
  live(ctx, p, env) {
    windowGlow(env, p, leftFace(p), 1);
    if (!(env.far || env.lite)) for (const u of [0.12, 0.82]) { const [x, y] = P(p.gx + p.w * u + 0.15, p.gy + p.d * 0.3 + 0.15, p.h + 16 * 0.42 + 12 + 3); puffs(ctx, x, y, (env.t || 0) + u * 3000, 3, 6, 26); }
  },
});

void clamp; void TILE; void WOOD; void rampOf; void apron; void tank; void pennant;  void on;
