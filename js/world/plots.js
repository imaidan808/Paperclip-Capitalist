// Empty building plots and the pipelines built on them, in the toy kit. Owner: T3 BUILDINGS (docs/RENDER_PLAN.md). V2 drawers of the 'plot' and 'pipe' layers (registerLayer): the same hit shapes, the same
// chips and bars the legacy drawers (ents-plots.js) push, with the picture redone: a plot is a freshly dug patch with stakes, hazard tape, cones and (close up) a sapling and a toy shovel; a pipeline is a little
// building in the colour of its role whose floors grow with its level (a roof garden from level 4, a gold crown ring from level 8) and which goes cool lilac with a sleeping puff when it is paused.
// A plot is cheap enough to draw every frame; a pipeline's body is drawn into a sprite once (sprites.js, keyed by a small record that is made again when its level, role or state changes).
import { PIPE } from '../config.js';
import { registerLayer } from './stack.js';
import { P, mix, clamp } from './iso.js';
import { PLOTS, DIST } from './layout.js';
import { PIP_ZOOM, FOG_DIM } from './common.js';
import { SOIL, LIGHT, PAVE, PLASTER, TILE, GRASS, TOY } from './palette.js';
import { toyBox, toyRadius, toyTone, rampOf, wallOf, onWall, rrect, roundedPoly, puff } from './solids.js';
import { tintC, detailOf, facesOf, rgbaOf, windowGrid, archDoor, wallMaterial, roof, stage, puffs, FONT, lip } from './parts.js';
import { drawSprite } from './sprites.js';

const tone = toyTone;

// ---------------------------------------------------------------- empty plots
function cone(ctx, x, y, s = 1) {
  ctx.fillStyle = 'rgba(74,63,136,.25)'; ctx.beginPath(); ctx.ellipse(x + 2 * s, y + 1, 6 * s, 2.6 * s, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = '#e66a1a'; rrect(ctx, x - 6 * s, y - 2.6 * s, 12 * s, 3.4 * s, 1.6 * s); ctx.fill();
  ctx.fillStyle = '#ff9a3a'; ctx.beginPath(); ctx.moveTo(x - 4.4 * s, y - 2 * s); ctx.lineTo(x - 1.2 * s, y - 14 * s); ctx.quadraticCurveTo(x, y - 15.6 * s, x + 1.2 * s, y - 14 * s); ctx.lineTo(x + 4.4 * s, y - 2 * s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.moveTo(x - 3.2 * s, y - 6 * s); ctx.lineTo(x + 3.2 * s, y - 6 * s); ctx.lineTo(x + 2.4 * s, y - 9.4 * s); ctx.lineTo(x - 2.4 * s, y - 9.4 * s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(x - 1.6 * s, y - 11 * s, 0.9 * s, 2.4 * s, 0.2, 0, 6.3); ctx.fill();
}
function drawPlotV2(ctx, view, env, w, e) {
  const pl = PLOTS[e.zone][e.plot], D = DIST[e.zone], z = D.z, hov = w.hover && w.hover.eid === e.id, zl = e.zoneLocked, far = w.far;
  const lv = env.lod && env.lod.detail ? env.lod.detail : [1, 1, 1, 1], locked = e.locked, C = (c) => tintC(c, { dim: zl ? FOG_DIM : 0 });
  ctx.save(); ctx.translate(0, -z);
  const x = pl[0], y = pl[1], pts = [P(x, y), P(x + 3, y), P(x + 3, y + 3), P(x, y + 3)];
  const patch = locked ? '#e1d4f3' : SOIL.light, tp = tone(C(patch));
  // the dug patch: a rounded square of soil with a darker rim and fresh ridges; frosted lilac when locked
  roundedPoly(ctx, pts, 9); ctx.fillStyle = mix(C(patch), '#4a3f88', 0.16); ctx.fill();
  const ins = [P(x + 0.12, y + 0.1), P(x + 2.92, y + 0.1), P(x + 2.92, y + 2.9), P(x + 0.12, y + 2.9)]; roundedPoly(ctx, ins, 8); ctx.fillStyle = tp.t; ctx.fill();
  if (!far) { ctx.fillStyle = rgbaOf(rampOf(C(patch)).shade, 0.35); for (let k = 0; k < 5; k++) { const a = P(x + 0.3, y + 0.5 + k * 0.5), b = P(x + 2.7, y + 0.5 + k * 0.5); ctx.beginPath(); ctx.moveTo(a[0], a[1] - 1.4); ctx.lineTo(b[0], b[1] - 1.4); ctx.lineTo(b[0], b[1] + 1.4); ctx.lineTo(a[0], a[1] + 1.4); ctx.closePath(); ctx.fill(); } }
  // four stakes and the hazard tape between them (a rounded band: yellow with cream bars)
  const tape = [P(x + 0.22, y + 0.22), P(x + 2.78, y + 0.22), P(x + 2.78, y + 2.78), P(x + 0.22, y + 2.78)];
  if (!far) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tape[0][0], tape[0][1] - 6); for (let i = 1; i < 4; i++) ctx.lineTo(tape[i][0], tape[i][1] - 6); ctx.closePath();
    ctx.strokeStyle = locked ? '#c9b8e8' : hov ? '#ffe27a' : '#ffd84d'; ctx.lineWidth = 3.4; ctx.stroke(); ctx.setLineDash([5, 5]); ctx.strokeStyle = '#fffaf0'; ctx.lineWidth = 3.4; ctx.stroke(); ctx.setLineDash([]);
    for (const q of tape) { ctx.strokeStyle = tone('#cc8f50').l; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(q[0], q[1] + 1); ctx.lineTo(q[0], q[1] - 8); ctx.stroke(); ctx.fillStyle = '#e8b872'; ctx.beginPath(); ctx.arc(q[0], q[1] - 8, 1.9, 0, 6.3); ctx.fill(); }
    cone(ctx, P(x + 0.4, y + 2.7)[0], P(x + 0.4, y + 2.7)[1]); cone(ctx, P(x + 2.7, y + 2.7)[0], P(x + 2.7, y + 2.7)[1]);
  } else { ctx.fillStyle = locked ? '#c9b8e8' : '#ffd84d'; roundedPoly(ctx, [P(x + 0.5, y + 0.5), P(x + 2.5, y + 0.5), P(x + 2.5, y + 2.5), P(x + 0.5, y + 2.5)], 6); ctx.fill(); }
  if (hov && !far) { ctx.strokeStyle = rgbaOf('#ffb347', 0.5); ctx.lineWidth = 6; roundedPoly(ctx, pts, 9); ctx.stroke(); ctx.strokeStyle = '#fff4de'; ctx.lineWidth = 3; ctx.stroke(); }
  if (!far && lv[3] > 0.02 && !locked) { // a sapling and a toy shovel, close up
    ctx.globalAlpha = lv[3]; const [sx, sy] = P(x + 1.6, y + 1.2); ctx.strokeStyle = '#9c6238'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 9); ctx.stroke(); puff(ctx, sx - 2.4, sy - 11, 3.2, GRASS.mid, GRASS.hi, GRASS.shade); puff(ctx, sx + 2.6, sy - 12, 3.4, GRASS.light, GRASS.hi, GRASS.mid); puff(ctx, sx, sy - 14.4, 3, GRASS.mid, GRASS.hi, GRASS.shade);
    const [hx, hy] = P(x + 2.2, y + 2.1); ctx.strokeStyle = '#e8b872'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + 3, hy - 13); ctx.stroke(); ctx.fillStyle = '#b2bed8'; rrect(ctx, hx - 3.2, hy - 1, 6.4, 6, 2); ctx.fill(); ctx.globalAlpha = 1;
  }
  if (locked && !far) { const [cx, cy] = P(x + 1.5, y + 1.5); ctx.fillStyle = 'rgba(74,63,136,.28)'; rrect(ctx, cx - 9 + 1.4, cy - 14 + 1.6, 18, 16, 4); ctx.fill(); ctx.fillStyle = '#fffaf0'; rrect(ctx, cx - 9, cy - 14, 18, 16, 4); ctx.fill(); ctx.strokeStyle = '#8a80c0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy - 11.5, 3.6, Math.PI, 0); ctx.stroke(); ctx.fillStyle = '#8a80c0'; rrect(ctx, cx - 5, cy - 11, 10, 7, 2); ctx.fill(); }
  ctx.restore();
  if (zl) return;
  const [px, py] = P(x + 1.5, y + 1.5, z);
  w.hits.push({ eid: e.id, kind: 'plot', id: `${e.zone}:${e.plot}`, zone: e.zone, label: locked ? 'Building plot (locked)' : 'Empty plot: hire a manager here', polys: [[P(x, y, z), P(x + 3, y, z), P(x + 3, y + 3, z), P(x, y + 3, z)]], locked });
  if (w.cam.z > 0.5) w.overlay.push({ k: 'chip', n: 6, wx: px, wy: py - 20, draw: (g, qx, qy, s) => w.chip(g, qx, qy, locked ? 'Locked' : '+ Hire', locked ? '#a3b3c9' : '#ffd36e', s) });
}
registerLayer('plot', drawPlotV2, 'inherit');

// ---------------------------------------------------------------- pipelines: the little building of a manager role, floors by level
const ROLE = {
  student: { wall: PLASTER.mint, roof: TILE.teal, trim: '#fff4de', door: '#2f8f86' },
  broker: { wall: PLASTER.butter, roof: TILE.mustard, trim: '#f6c94f', door: '#9c6238' },
  logistics: { wall: PLASTER.sky, roof: '#5a8fe0', trim: '#fffaf0', door: '#3b7fd0' },
};
const OFF = { wall: '#c9c4df', roof: '#a9a3cf', trim: '#e6e1f4', door: '#8a80c0' };
function pipeBody(ctx, q, env) {
  const lv = env.lod && env.lod.detail ? env.lod.detail : detailOf(ctx, env), R = q.off ? OFF : ROLE[q.kind] || ROLE.student, floors = q.level, h = q.h, night = env.night || 0;
  const C = (c) => tintC(c, env), wall = C(R.wall), roofC = C(R.roof), x = q.gx, y = q.gy;
  stage(ctx, { gx: x, gy: y, w: 2.4, d: 2.4 }, env, h + 8, { m: 0.28 });
  const B = toyBox(ctx, x, y, 2.4, 2.4, h, wall, { z: 1, r: toyRadius(2.4, 2.4), gloss: 0.9 }), L = wallOf(B.left), Rt = wallOf(B.right);
  ctx.save(); ctx.beginPath(); ctx.moveTo(B.sil[0][0], B.sil[0][1]); for (let i = 1; i < 6; i++) ctx.lineTo(B.sil[i][0], B.sil[i][1]); ctx.closePath(); ctx.clip();
  for (const [wl, side] of [[L, 'l'], [Rt, 'r']]) onWall(ctx, wl, (c) => { c.fillStyle = tone(mix(wall, C(PAVE.joint), 0.55))[side]; c.fillRect(0, -3.4, wl.W, 3.4); for (let f = 1; f <= floors; f++) { const yy = 3.4 + f * 13 - 1; c.fillStyle = tone(mix(wall, C(R.trim), 0.5))[side]; c.fillRect(0, -yy - 1.6, wl.W, 2.8); c.fillStyle = rgbaOf('#4a3f88', 0.1); c.fillRect(0, -yy - 4.4, wl.W, 2.6); } }); ctx.restore();
  const rows = floors; // one row of windows per floor; the ground floor has the door
  windowGrid(ctx, L, { cols: 3, rows: Math.max(1, rows), x0: L.W * 0.1, x1: L.W * 0.9, y0: 6, y1: h - 4, fw: 0.42, fh: 0.54, S: 'l', trim: R.trim, lit: q.running ? 0.8 + 0.2 * night : night * 0.5, night, seed: 3, lv });
  windowGrid(ctx, Rt, { cols: 3, rows: Math.max(1, rows), x0: Rt.W * 0.1, x1: Rt.W * 0.9, y0: 6, y1: h - 4, fw: 0.42, fh: 0.54, S: 'r', trim: R.trim, lit: q.running ? 0.8 : night * 0.5, night, seed: 9, lv });
  if (q.kind === 'logistics') onWall(ctx, L, (c) => { const dw = L.W * 0.34, dh = Math.min(h * 0.55, 20), xx = L.W * 0.33; c.fillStyle = tone(C('#fffaf0')).l; rrect(c, xx - 2, -dh - 2, dw + 4, dh + 2, 4); c.fill(); c.fillStyle = tone(C('#9aa8c8')).l; rrect(c, xx, -dh, dw, dh, 3); c.fill(); c.fillStyle = rgbaOf('#ffffff', 0.4); for (let k = 1; k < 5; k++) c.fillRect(xx + 1, -dh + (dh * k) / 5, dw - 2, 1.3); }); // a roll-up door
  else archDoor(ctx, L, { x: L.W * 0.5 - 4.4, w: 8.8, h: Math.min(h * 0.5, 17), S: 'l', col: C(R.door), trim: R.trim, lv, seed: 5, num: 1 });
  // the roof: a gentle hip in the role's colour, a roof garden from level 4, a gold crown ring from level 8
  toyBox(ctx, x - 0.2, y - 0.2, 2.8, 2.8, 4, roofC, { z: h + 1, r: 5, gloss: 0.8, ao: false });
  if (floors >= 4) { for (const [u, v] of [[0.3, 0.3], [0.62, 0.34], [0.46, 0.62]]) { const [gx, gy] = P(x + 2.4 * u + 0.1, y + 2.4 * v + 0.1, h + 5); puff(ctx, gx, gy - 4, 4.4, GRASS.mid, GRASS.hi, GRASS.shade); } const [fx, fy] = P(x + 2.1, y + 0.4, h + 5); ctx.strokeStyle = '#fffaf0'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 13); ctx.stroke(); ctx.fillStyle = C(TOY.red); ctx.beginPath(); ctx.moveTo(fx + 0.4, fy - 13); ctx.lineTo(fx + 8, fy - 11); ctx.lineTo(fx + 0.4, fy - 8); ctx.closePath(); ctx.fill(); }
  if (floors >= 8) { toyBox(ctx, x - 0.26, y - 0.26, 2.92, 2.92, 2.6, C('#f6c94f'), { z: h + 5, r: 5, gloss: 1, ao: false }); }
  if (q.kind === 'student') { const [gx, gy] = P(x + 0.3, y + 0.35, h + 5); ctx.fillStyle = C('#2fa6d6'); ctx.beginPath(); ctx.arc(gx, gy - 4, 4, 0, 6.3); ctx.fill(); ctx.fillStyle = C('#a4dc66'); ctx.beginPath(); ctx.arc(gx - 1, gy - 4.6, 1.8, 0, 6.3); ctx.fill(); for (let k = 0; k < 3; k++) { ctx.fillStyle = C(['#ff9cc2', '#ffd84d', '#7be0cf'][k]); rrect(ctx, gx + 5, gy - 2 - k * 2.4, 8, 2.4, 0.8); ctx.fill(); } }
  if (q.kind === 'broker') { onWall(ctx, L, (c) => { c.fillStyle = C('#2c2a56'); rrect(c, L.W * 0.1, -h * 0.2 - 5, L.W * 0.8, 6, 2); c.fill(); c.fillStyle = C('#6df0a0'); c.font = `800 4.6px ${FONT}`; c.textBaseline = 'middle'; c.fillText('AAPL 182.4  GOLD 2041  BRK 389', L.W * 0.13, -h * 0.2 - 2); }); }
  if (q.off) { const [zx, zy] = P(x + 1.2, y + 1.2, h + 6); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(zx + 10, zy - 14, 7, 0, 6.3); ctx.arc(zx + 16, zy - 12, 5.6, 0, 6.3); ctx.arc(zx + 4, zy - 11, 5, 0, 6.3); ctx.fill(); ctx.fillStyle = '#8a80c0'; ctx.font = `800 7px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('zzz', zx + 10, zy - 13); }
  return null;
}
const PIPE_SPRITE = { night: true, pad: [8, 40, 28, 8], body: pipeBody };
const PROXY = new WeakMap(); // pipeline record -> the small stable record its sprite is keyed by (made again when what is painted changes)
function proxyFor(e, pl, D) {
  const p = e.pipe, off = p.status === 'paused' || p.status === 'audit', running = p.status === 'running', sig = p.kind + '|' + p.level + '|' + (off ? 1 : 0) + '|' + (running ? 1 : 0);
  let q = PROXY.get(p); if (q && q.sig === sig) return q;
  const h = 26 + p.level * 13, gx = pl[0] + 0.3, gy = pl[1] + 0.3;
  q = { t: 'pipe', sig, kind: p.kind, level: p.level, off, running, h, gx, gy, w: 2.4, d: 2.4, z: 0, bb: [(gx - (gy + 2.4)) * 32 - 16, (gx + gy) * 16 - h - 46, (gx + 2.4 - gy) * 32 + 16, (gx + 2.4 + gy + 2.4) * 16 + 14] };
  PROXY.set(p, q); void D; return q;
}
function drawPipeV2(ctx, view, env, w, e) {
  const p = e.pipe, pl = PLOTS[e.zone][e.plot % PLOTS[e.zone].length], D = DIST[e.zone], z = D.z, K = PIPE[p.kind], hov = w.hover && w.hover.eid === e.id;
  const off = p.status === 'paused' || p.status === 'audit', running = p.status === 'running', h = 26 + p.level * 13, far = w.far;
  const q = proxyFor(e, pl, D);
  ctx.save(); ctx.translate(0, -z - e.drop);
  const prevDim = env.dim; env.dim = 0;
  const ok = drawSprite(ctx, q, env, PIPE_SPRITE); if (ok === undefined) pipeBody(ctx, q, env);
  env.dim = prevDim;
  if (hov) { const f = facesOf(q.gx, q.gy, 2.4, 2.4, h, 1); ctx.strokeStyle = rgbaOf('#ffb347', 0.5); ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(f.left[0][0], f.left[0][1]); ctx.lineTo(f.left[1][0], f.left[1][1]); ctx.lineTo(f.right[1][0], f.right[1][1]); ctx.lineTo(f.top[1][0], f.top[1][1]); ctx.lineTo(f.top[0][0], f.top[0][1]); ctx.lineTo(f.left[3][0], f.left[3][1]); ctx.closePath(); ctx.stroke(); ctx.strokeStyle = '#fff4de'; ctx.lineWidth = 2.6; ctx.stroke(); }
  if (running && !w.reduced() && !far) { const [cx, cy] = P(pl[0] + 2.2, pl[1] + 0.8, h + 8); ctx.fillStyle = '#9aa8c8'; rrect(ctx, cx - 4, cy - 10, 8, 12, 2.6); ctx.fill(); ctx.fillStyle = '#d6def2'; rrect(ctx, cx - 4, cy - 10, 3, 12, 1.5); ctx.fill(); puffs(ctx, cx, cy - 10, w.vt, 4, 10, 36); }
  ctx.restore();
  const f = facesOf(q.gx, q.gy, 2.4, 2.4, h, 1);
  w.hits.push({ eid: e.id, kind: 'pipe', id: p.id, zone: e.zone, label: `${K.name}, level ${p.level}`, polys: [f.left, f.right, f.top].map((qq) => qq.map(([a, b]) => [a, b - z - e.drop])), pipe: p });
  const [x, y] = P(pl[0] + 1.5, pl[1] + 1.5, z), frac = p.inflight ? clamp((p.prog + (w.hourF() - w.g.s.hour)) / Math.max(1, p.len), 0, 1) : 0;
  if (w.cam.z >= PIP_ZOOM) w.overlay.push({ k: 'bar', n: 0, wx: x, wy: y - h - 14 - e.drop, draw: (g, px, py, s) => w.progress(g, px, py, s, frac, p, off) });
}
registerLayer('pipe', drawPipeV2, 'inherit');

void LIGHT; void lip; void wallMaterial; void roof; void rampOf;
