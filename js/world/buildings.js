// The toy buildings: every building kind of the island redrawn in the art direction (chunky, rounded, pastel, glossy: docs/ART_DIRECTION.md 3 and 4.2), registered as V2 drawers of the 'static-bldg' layer.
// Owner: T3 BUILDINGS (docs/RENDER_PLAN.md). A body is drawn into the prop's sprite once per rested zoom (sprites.js) and blitted; the live part draws what moves (smoke, blink, glow) and pushes the night's lights.
// Detail is additive: the base is complete at every zoom, and the near and close marks are drawn with the alphas of the zoom the sprite is built for (parts.detailOf), so a building is a bright solid at the island
// view and gains framed windows, shutters, tile courses, shingles, brick, curtains and flower boxes as you come in. Hit polygons are exactly the legacy drawers' (the same prism faces, from the same data).
import { P, mix, clamp, h2 } from './iso.js';
import { PAVE, LIGHT, METAL, GLASS, WOOD, BRICK, TOY } from './palette.js';
import { castShadow } from './shadow.js';
import { toyBox, toyRadius, toyTone, rampOf, wallOf, onWall, rrect, contourOf } from './solids.js';
import { reg, tank, columns, pediment, tintC, detailOf, facesOf, hitsOf, on, rgbaOf, windowGrid, archDoor, awning, plank, wallMaterial, roof, flatRoof, chimney, apron, lip, FONT, LITE, detailFor, zoomOf, contourW, lightOf, styleOf, windowGlow, fp, stage } from './parts.js';
import { hexRgb, seedOf, leftFace, smoke } from './props-common.js';

const tone = toyTone;

/** One window grid per wall, from the prop's own `win` = [cols, rows] on the sun side (the shade side gets the cols its depth earns). */
function wallWindows(ctx, wl, S, o) {
  windowGrid(ctx, wl, { trim: S.trim, shutter: S.shutter, curtain: S.curtain, box: S.boxes, lit: o.lit, night: o.night, phase: o.phase || 0, seed: o.seed, lv: o.lv, fw: o.fw ?? 0.52, fh: o.fh ?? 0.66, mull: o.mull, glass: o.glass, arch: o.arch, ...o.g });
}

// ---------------------------------------------------------------- the general building
function bldgBody(ctx, p, env) {
  const lv = detailFor(ctx, env), z = zoomOf(ctx, env), { gx, gy, w, d, h } = p, S = styleOf(p, env), night = env.night || 0, seed = seedOf(p), C = S.C;
  const kind = p.roof || 'flat', gabled = kind === 'gable' || kind === 'hip', lit = night * 1.3;
  const R = toyRadius(w, d), contour = contourW(z, lv) , f = facesOf(gx, gy, w, d, h);
  // the ground: a paver apron, the cast shadow, the contact ring
  stage(ctx, p, env, h + (gabled ? 8 : 4));
  // the walls
  const B = toyBox(ctx, gx, gy, w, d, h, S.wall, { r: R, contour: 0 });
  const L = wallOf(B.left), Rt = wallOf(B.right);
  ctx.save(); // everything on the walls stays inside the rounded silhouette
  ctx.beginPath(); ctx.moveTo(B.sil[0][0], B.sil[0][1]); for (let i = 1; i < B.sil.length; i++) ctx.lineTo(B.sil[i][0], B.sil[i][1]); ctx.closePath();
  wallMaterial(ctx, L, S.mat, S.wall, 'l', lv, seed); wallMaterial(ctx, Rt, S.mat, S.wall, 'r', lv, seed + 1);
  // the plinth, and the band under the roof
  const plinth = mix(S.wall, C(PAVE.joint), 0.55);
  for (const [wl, side] of [[L, 'l'], [Rt, 'r']]) onWall(ctx, wl, (c) => {
    c.fillStyle = toyTone(plinth)[side]; c.fillRect(wl.ins[0], -3.6, wl.W - wl.ins[0] - wl.ins[1], 3.6); c.fillStyle = rgbaOf('#ffffff', 0.25); c.fillRect(wl.ins[0], -3.6, wl.W - wl.ins[0] - wl.ins[1], 1.2);
    if (!gabled) { c.fillStyle = toyTone(S.trim)[side]; c.fillRect(wl.ins[0], -wl.H, wl.W - wl.ins[0] - wl.ins[1], 3.2); c.fillStyle = rgbaOf('#4a3f88', 0.18); c.fillRect(wl.ins[0], -wl.H + 3.2, wl.W - wl.ins[0] - wl.ins[1], 1.8); }
    else { const gr = c.createLinearGradient(0, -wl.H, 0, -wl.H + 10); gr.addColorStop(0, rgbaOf('#4a3f88', 0.3)); gr.addColorStop(1, rgbaOf('#4a3f88', 0)); c.fillStyle = gr; c.fillRect(wl.ins[0], -wl.H, wl.W - wl.ins[0] - wl.ins[1], 10); } // the shadow of the eave on the wall
  });
  ctx.restore();
  // the contour round the body, tone on tone
  if (contour > 0) { ctx.save(); ctx.lineJoin = 'round'; ctx.strokeStyle = contourOf(S.wall); ctx.lineWidth = contour; ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.moveTo(B.sil[0][0], B.sil[0][1]); for (let i = 1; i < B.sil.length; i++) ctx.lineTo(B.sil[i][0], B.sil[i][1]); ctx.closePath(); ctx.stroke(); ctx.restore(); }
  // windows
  const [cols, rows] = p.win || [3, 2], top = h - (gabled ? 12 : 7.5), foot = p.doors ? Math.max(12, h * 0.46) : 7.5;
  const toneL = toyTone; void toneL;
  const wopt = { lit, night, seed, lv, mull: S.mat === 'glass' ? 'bar' : 'cross', glass: S.mat === 'glass' ? ['#9fdcf6', '#4d8fd6'] : null };
  const pad = p.glass ? 0.04 : 0.09, fw = p.glass ? 0.8 : 0.56, fh = p.glass ? 0.78 : 0.72;
  if (!p.awn) wallWindows(ctx, L, S, { ...wopt, fw, fh, g: { cols, rows, x0: L.W * pad, x1: L.W * (1 - pad), y0: foot, y1: top, S: 'l' } });
  wallWindows(ctx, Rt, S, { ...wopt, phase: 3, fw, fh, g: { cols: Math.max(1, Math.round((cols * d) / w)), rows, x0: Rt.W * 0.1, x1: Rt.W * 0.9, y0: foot, y1: top, S: 'r' } });
  // the front: a shop's awning and glass, a garage's doors, a house's arched door
  if (p.awn) {
    awning(ctx, B.left, 'L', 0.08, 0.92, 0.5, 0.38, S.acc, S.acc2, 6, 0.3, lv, 'l');
    wallWindows(ctx, L, S, { ...wopt, lit: lit * 0.9, fw: 0.78, fh: 0.82, g: { cols: 2, rows: 1, x0: L.W * 0.1, x1: L.W * 0.62, y0: 4, y1: h * 0.36, S: 'l' } });
    archDoor(ctx, L, { x: L.W * 0.72, w: Math.max(8, L.W * 0.09), h: h * 0.4, S: 'l', col: S.door, trim: S.trim, lv, seed });
  } else if (p.doors) {
    const n = p.doors, span = L.W * 0.8;
    onWall(ctx, L, (c) => {
      for (let i = 0; i < n; i++) {
        const dw = span / n - 5, x = L.W * 0.1 + (i * span) / n + 2.5, dh = h * 0.42;
        c.fillStyle = toyTone(S.trim)['l']; rrect(c, x - 2, -dh - 2, dw + 4, dh + 2, 3); c.fill();
        c.fillStyle = toyTone('#9aa8c8')['l']; rrect(c, x, -dh, dw, dh, 2.4); c.fill();
        c.fillStyle = rgbaOf('#ffffff', 0.35); for (let k = 1; k < 5; k++) c.fillRect(x + 1, -dh + (dh * k) / 5, dw - 2, 1.4);
        c.fillStyle = rgbaOf(rampOf('#9aa8c8').deep, 0.3); c.fillRect(x, -dh * 0.6, dw, dh * 0.6);
      }
    });
  } else if (p.door) archDoor(ctx, L, { x: L.W * 0.5 - 4.6, w: 9.2, h: Math.min(18, h * 0.5), S: 'l', col: S.door, trim: S.trim, lv, seed });
  if (p.bars && on(lv[2])) onWall(ctx, L, (c) => { c.globalAlpha = lv[2]; c.fillStyle = rgbaOf('#2b8f86', 0.7); const cw = (L.W * 0.82) / cols; for (let i = 0; i < cols; i++) for (let k = 0; k < 3; k++) rrect(c, L.W * 0.09 + i * cw + cw * (0.27 + k * 0.23) - 1, -(foot + (top - foot) * 0.55), 2, (top - foot) * 0.4, 1) , c.fill(); c.globalAlpha = 1; });
  if (p.balc) onWall(ctx, L, (c) => { for (let j = 0; j < rows; j++) { const y = foot + (j * (top - foot)) / rows - 1.5; c.fillStyle = toyTone(S.trim)['l']; rrect(c, L.W * 0.05, -y - 3, L.W * 0.9, 3, 1.5); c.fill(); if (on(lv[2])) { c.globalAlpha = lv[2]; for (let x = L.W * 0.07; x < L.W * 0.93; x += 6) rrect(c, x, -y - 8, 1.8, 5, 0.9), c.fill(); c.globalAlpha = 1; } } });
  if (p.band) onWall(ctx, L, (c) => { c.fillStyle = toyTone(S.acc)['l']; c.fillRect(L.ins[0], -(h - 9), L.W - L.ins[0] - L.ins[1], 5); });
  // the roof
  let rf = null;
  if (kind === 'gable' || kind === 'hip') {
    rf = roof(ctx, p, h, { kind, col: S.roof, wall: S.wall, lv, e: 0.14, rise: clamp(h * 0.36, 8, Math.min(20, Math.min(w, d) * 5)) });
    if (kind === 'gable' && !p.clock && h2((gx * 17) | 0, (gy * 17) | 0) > 0.45) {
      const u = rf.len * 0.7, v = rf.span * 0.3, base = h + rf.rise * (v / (rf.span / 2)) - 1, at = rf.G ? null : null; void at;
      const gxx = rf.axis === 'x' ? gx + u : gx + v, gyy = rf.axis === 'x' ? gy + v : gy + u;
      chimney(ctx, gxx, gyy, base, 11, { col: C(BRICK.mid), w: 0.26, contour: 0 });
    }
  } else if (kind === 'pediment') { // a flat slab roof, a stone pediment with a gold coin over four round columns on the front
    const fr = flatRoof(ctx, p, h, { col: S.roof, deck: mix(S.roof, C('#fffaf0'), 0.3), lv });
    columns(ctx, L, { n: 4, x0: L.W * 0.1, x1: L.W * 0.9, base: 3, top: h - 6, cw: 5.2, col: S.wall, S: 'l', lv });
    pediment(ctx, L, { x0: L.W * 0.02, x1: L.W * 0.98, base: h + 4, ph: 11, S: 'l', col: S.wall, gold: S.acc, lv });
    void fr;
  } else if (kind === 'saw') sawRoof(ctx, p, h, S, lv);
  else {
    const fr = flatRoof(ctx, p, h, { col: S.roof, deck: mix(S.roof, C('#c9c4df'), 0.55), lv });
    roofKit(ctx, p, fr.z, S, lv, seed);
  }
  if (p.clock && rf) cupola(ctx, p, h, rf, S, lv);
  if (p.sign) {
    if (S.neon) { // an enamel plate with a lit tube: the glow itself is live
      onWall(ctx, L, (c) => { const sw = Math.max(18, p.sign.length * 7 + 8), x = L.W * 0.5; c.fillStyle = rgbaOf('#2c2a56', 0.92); rrect(c, x - sw / 2, -(h * 0.86) - 7, sw, 14, 4); c.fill(); c.strokeStyle = S.neon; c.lineWidth = 1.5; c.globalAlpha = 0.9; rrect(c, x - sw / 2 + 1.5, -(h * 0.86) - 5.5, sw - 3, 11, 3); c.stroke(); c.globalAlpha = 1; c.font = `800 8.5px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = S.neon; c.fillText(p.sign, x, -(h * 0.86) + 0.3); });
    } else plank(ctx, L, p.sign, { x: L.W * 0.5, up: p.awn ? h * 0.7 : gabled ? h + 3 : h * 0.84, font: 8.5, S: 'l', col: S.plank, ink: '#fff6e0', lv });
  }
  return p.hot ? hitsOf(f) : null;
}

/** A string of bunting along the front edge of a flat roof: a sagging cord and a swallow of little triangles in alternating colours. */
function bunting(ctx, p, z, cols, S) {
  const a = P(p.gx + 0.12, p.gy + p.d + 0.02, z + 5), b = P(p.gx + p.w - 0.12, p.gy + p.d + 0.02, z + 5), n = clamp(Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 7), 4, 30);
  const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * 3.5];
  ctx.strokeStyle = rgbaOf('#4a3f88', 0.5); ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.beginPath(); for (let i = 0; i <= 12; i++) { const q = at(i / 12); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); } ctx.stroke();
  for (let i = 0; i < n; i++) { const t0 = (i + 0.15) / n, t1 = (i + 0.85) / n, q0 = at(t0), q1 = at(t1), m = at((t0 + t1) / 2); ctx.fillStyle = S.C(cols[i % cols.length]); ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.lineTo(m[0], m[1] + 6.2); ctx.closePath(); ctx.fill(); }
}
/**
 * What stands on a flat roof: a couple of chunky air-conditioning units with round fans, a row of glass skylights, and a thing of the district's own (the pawn shop's three gold balls, a water tank in the glass districts,
 * solar panels in the tech corridor, bunting over the creative and auto fronts). All placed by the building's own hash.
 */
function roofKit(ctx, p, z, S, lv, seed) {
  const { gx, gy, w, d } = p, C = S.C, th = S.th, long = w >= d, len = long ? w : d, wid = long ? d : w, at = (t, v, zz = z) => (long ? P(gx + len * t, gy + wid * v, zz) : P(gx + wid * v, gy + len * t, zz));
  const box = (t, v, bw, bd, bh, col, o = {}) => { const x = long ? gx + len * t : gx + wid * v, y = long ? gy + wid * v : gy + len * t; return toyBox(ctx, x, y, long ? bw : bd, long ? bd : bw, bh, col, { z, r: 2.4, ao: false, gloss: 0.9, ...o }); };
  const nAC = p.w * p.d > 5 ? 2 : 1, ac = C(METAL.steelLight);
  for (let i = 0; i < nAC; i++) { const t = 0.12 + i * 0.16, v = 0.22 + h2(seed, i) * 0.2, bw = Math.min(0.5, len * 0.12), bd = Math.min(0.4, wid * 0.14); box(t, v, bw, bd, 5.5, ac, { r: 2.6, gloss: 0.7 }); const [x, y] = at(t + bw / len / 2, v + bd / wid / 2, z + 5.5); ctx.fillStyle = rgbaOf(rampOf(ac).deep, 0.85); ctx.beginPath(); ctx.ellipse(x, y, 6.4, 3.2, 0, 0, 6.3); ctx.fill(); ctx.fillStyle = rgbaOf(rampOf(ac).hi, 0.9); ctx.beginPath(); ctx.ellipse(x, y - 0.6, 4.2, 2.1, 0, 0, 6.3); ctx.fill(); }
  const nS = clamp(Math.round(len / 1.25) - 1, 0, 5);
  for (let i = 0; i < nS; i++) { const t = 0.5 + (i * 0.44) / Math.max(1, nS - 1) * 0.9 - (nS > 1 ? 0 : 0); box(Math.min(0.88, 0.46 + i * (0.44 / Math.max(1, nS - 1))), 0.5, 0.55, 0.38, 2.8, C('#b8e8fb'), { r: 2, gloss: 1.2 }); void t; }
  if (th === 'pawn') { const [x, y] = at(0.86, 0.2); ctx.strokeStyle = tone('#5a4a8c').l; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 16); ctx.stroke(); for (const [dx, dy] of [[-6, -17], [6, -17], [0, -24]]) { ctx.fillStyle = C('#f6c94f'); ctx.beginPath(); ctx.arc(x + dx, y + dy, 4.4, 0, 6.3); ctx.fill(); ctx.fillStyle = rgbaOf('#ffffff', 0.6); ctx.beginPath(); ctx.arc(x + dx - 1.3, y + dy - 1.4, 1.6, 0, 6.3); ctx.fill(); } }
  else if (th === 'metro' || th === 'corporate') { const [x, y] = at(0.1, 0.72); tank(ctx, x, y, 8, 12, C('#cc8f50'), { lid: C('#9c6238'), bands: [[3, 5, C('#9c6238')], [8, 10, C('#9c6238')]] }); }
  else if (th === 'tech') { for (let i = 0; i < 3; i++) { const a = at(0.56 + i * 0.14, 0.18), b = at(0.66 + i * 0.14, 0.18), c = at(0.66 + i * 0.14, 0.44), dd = at(0.56 + i * 0.14, 0.44); ctx.fillStyle = C('#3a52c0'); ctx.beginPath(); ctx.moveTo(a[0], a[1] - 4); ctx.lineTo(b[0], b[1] - 4); ctx.lineTo(c[0], c[1] - 1); ctx.lineTo(dd[0], dd[1] - 1); ctx.closePath(); ctx.fill(); ctx.fillStyle = rgbaOf('#bdeaff', 0.35); ctx.beginPath(); ctx.moveTo(a[0] + 1.5, a[1] - 3.4); ctx.lineTo(b[0] - 1.5, b[1] - 3.4); ctx.lineTo(b[0] - 3, b[1] - 1.6); ctx.lineTo(a[0] + 3, a[1] - 1.6); ctx.closePath(); ctx.fill(); } }
  else if (th === 'creative') bunting(ctx, p, z, ['#ff4fa3', '#ffd84d', '#9a6bff', '#3ad4e6'], S);
  else if (th === 'auto') bunting(ctx, p, z, ['#ff5a47', '#fffaf0'], S);
}

/** A saw-tooth roof: sloped slabs rising along +gx, each with a glazed riser facing the sun's shade side, in the roof colour with bright glass. */
function sawRoof(ctx, p, z, S, lv) {
  const { gx, gy, w, d } = p, n = Math.max(2, Math.round(w / 1.5)), r = 9, T = toyTone(S.roof), R = rampOf(S.roof), glass = mix(S.C(GLASS.top), S.C('#ffffff'), 0.15);
  toyBox(ctx, gx - 0.1, gy - 0.1, w + 0.2, d + 0.2, 3.5, S.roof, { z, r: 4, ao: false, gloss: 0.6 });
  const q = (pts, fill) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  const z0 = z + 3.5;
  for (let i = 0; i < n; i++) {
    const x0 = gx + (i * w) / n, x1 = gx + ((i + 1) * w) / n;
    q([P(x1, gy, z0), P(x1, gy + d, z0), P(x1, gy + d, z0 + r), P(x1, gy, z0 + r)], mix(glass, '#6a58b8', 0.18));              // the glazed riser (faces +gx)
    q([P(x0, gy + d, z0), P(x1, gy + d, z0 + r), P(x1, gy, z0 + r), P(x0, gy, z0)], T.t);                                       // the sloped slab
    q([P(x0, gy + d, z0), P(x1, gy + d, z0), P(x1, gy + d, z0 + r)], T.l);                                                      // the sunny end triangle
    lip(ctx, P(x1, gy + d, z0 + r), P(x1, gy, z0 + r), 2, rgbaOf('#ffffff', 0.55)); // the lit lip
    if (on(lv[2])) { ctx.globalAlpha = lv[2]; ctx.fillStyle = rgbaOf(R.shade, 0.24); const a2 = P(x0 + (x1 - x0) * 0.5, gy + d, z0 + r * 0.5), b2 = P(x0 + (x1 - x0) * 0.5, gy, z0 + r * 0.5); ctx.beginPath(); ctx.moveTo(a2[0], a2[1]); ctx.lineTo(b2[0], b2[1]); ctx.lineTo(b2[0], b2[1] + 1.6); ctx.lineTo(a2[0], a2[1] + 1.6); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
  }
}

/** A clock cupola on the ridge: a small rounded tower with a round clock face on its sunny wall and a little hip roof. */
function cupola(ctx, p, z, rf, S, lv) {
  const cw = 0.8, u = rf.len / 2 - cw / 2, v = rf.span / 2 - cw / 2, gx = rf.axis === 'x' ? p.gx + u : p.gx + v, gy = rf.axis === 'x' ? p.gy + v : p.gy + u, base = z + rf.rise - 3;
  const B = toyBox(ctx, gx, gy, cw, cw, 15, S.wall, { z: base, r: 3.2, gloss: 0.8 });
  const [x, y] = [(B.left[0][0] + B.left[1][0]) / 2, (B.left[0][1] + B.left[1][1]) / 2 - 8];
  ctx.save(); ctx.translate(x, y); ctx.transform(1, 0.5, 0, 1, 0, 0);
  ctx.fillStyle = S.C('#fff4de'); ctx.beginPath(); ctx.arc(0, 0, 5.3, 0, 6.3); ctx.fill(); ctx.fillStyle = S.C('#fffaf0'); ctx.beginPath(); ctx.arc(0, 0, 4.1, 0, 6.3); ctx.fill();
  if (on(lv[2])) { ctx.globalAlpha = lv[2]; ctx.strokeStyle = '#3a2f5e'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -2.9); ctx.moveTo(0, 0); ctx.lineTo(2.1, 0.8); ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.restore();
  roof(ctx, { gx, gy, w: cw, d: cw }, base + 15, { kind: 'hip', col: S.roof, wall: S.wall, lv: [1, 0, 0, 0], e: 0.1, rise: 9, axis: 'x' });
}

function bldgLive(ctx, p, env) {
  const S = p.neon ? p.neon : null;
  if (p.sign && S && env.lod) { /* neon glow below */ }
  const L = leftFace(p);
  if (p.sign && p.neon) neonGlow(ctx, p, env, L);
  else if (p.neon && !(env.lite || env.far)) { const [lx, ly] = fp(L, 0.5, 0.6); env.lights?.push({ wx: lx, wy: ly - env.zoff, r: 44, c: hexRgb(p.neon), a: 0.35 }); }
  windowGlow(env, p, L);
  if (p.roof === 'gable' && !p.clock && h2((p.gx * 17) | 0, (p.gy * 17) | 0) > 0.45 && !(env.far || env.lite)) chimneySmoke(ctx, p, env);
}
/** The tube of a neon sign: a soft halo and a bright core on the plate the body drew, and its light at night. Steady under Calm, Off and reduced motion. */
function neonGlow(ctx, p, env, face) {
  const [x, y] = fp(face, 0.5, 0.86);
  ctx.save(); ctx.translate(x, y); ctx.transform(1, 0.5, 0, 1, 0, 0); ctx.font = `800 8.5px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const k = env.night || 0;
  if (!(env.lite || env.far)) { ctx.lineWidth = 3.2; ctx.strokeStyle = p.neon; ctx.globalAlpha = 0.18 + 0.3 * k; ctx.lineJoin = 'round'; ctx.strokeText(p.sign, 0, 0.3); ctx.globalAlpha = 1; }
  ctx.fillStyle = k > 0.3 ? mix(p.neon, '#ffffff', 0.45) : p.neon; ctx.fillText(p.sign, 0, 0.3); ctx.restore();
  env.lights?.push({ wx: x, wy: y - env.zoff, r: 52, c: hexRgb(p.neon), a: 0.18 + 0.4 * k });
}
/** Round cartoon smoke puffs from the chimney's mouth (rest pose at t = 0). */
function chimneySmoke(ctx, p, env) {
  const rf = { len: p.d > p.w * 1.2 ? p.d : p.w, span: p.d > p.w * 1.2 ? p.w : p.d, axis: p.d > p.w * 1.2 ? 'y' : 'x' };
  const u = rf.len * 0.7, v = rf.span * 0.3, gx = rf.axis === 'x' ? p.gx + u : p.gx + v, gy = rf.axis === 'x' ? p.gy + v : p.gy + u, base = p.h + clamp(rf.span * 7.5 + 4, 10, 30) * (v / (rf.span / 2)) - 1 + 13 + 3;
  const [cx, cy] = P(gx + 0.15, gy + 0.15, base), t = env.t || 0;
  for (let i = 0; i < 3; i++) { const k = (((t / 3200) + i / 3) + (env.t ? 0 : 0.1)) % 1, r = 3.2 + k * 5.5; ctx.fillStyle = `rgba(255,255,255,${0.78 * (1 - k)})`; ctx.beginPath(); ctx.arc(cx + Math.sin(k * 4 + i) * 2.4 + k * 6, cy - 4 - k * 30, r, 0, 6.3); ctx.fill(); ctx.fillStyle = `rgba(190,200,240,${0.42 * (1 - k)})`; ctx.beginPath(); ctx.arc(cx + Math.sin(k * 4 + i) * 2.4 + k * 6 + r * 0.22, cy - 4 - k * 30 + r * 0.26, r * 0.78, 0, 6.3); ctx.fill(); }
}

/**
 * The island view of a building (the zoom is under the far line): its prism in its own wall colour and a roof-coloured top, four flat fills with no gradient, no stroke and no allocation worth the name: the island view
 * draws a few hundred of them every frame. The hit shapes are the legacy far drawer's (the prism, raised to at least four pixels), for a prop that has a hot spot.
 */
export function farBlock(ctx, p, env) {
  const q = p.color && !p.col ? { ...p, col: p.color } : p, S = styleOf(q, env), { gx, gy, w, d } = p, h = Math.max(4, p.h), t = toyTone(S.wall), f = facesOf(gx, gy, w, d, h);
  const poly = (pts, fill) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  poly(f.left, t.l); poly(f.right, t.r);
  const rc = p.awn && typeof p.awn === 'string' ? S.C(p.awn) : p.roofCol || p.roof ? S.roof : mix(S.wall, S.C('#ffffff'), 0.3), T = f.top; poly(T, rc);
  ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.moveTo(T[0][0], T[0][1]); ctx.lineTo(T[3][0], T[3][1]); ctx.lineTo(T[2][0], T[2][1]); ctx.lineTo(T[2][0], T[2][1] + 1.6); ctx.lineTo(T[3][0], T[3][1] + 1.6); ctx.lineTo(T[0][0], T[0][1] + 1.6); ctx.closePath(); ctx.fill();
  return p.hot ? hitsOf(f) : null;
}
const bldgFar = farBlock;

reg('bldg', { body: bldgBody, live: bldgLive, far: bldgFar, pad: [4, 4, 4, 4] });
// (the 'shop' kind is not placed by any district: it keeps its legacy drawer until a kit uses it)

export { bldgBody, chimneySmoke, roofKit };
void GLASS; void WOOD; void TOY; void seedOf; void smoke; void toyRadius;
