// The working buildings: the freight depot, the factory with its fat stacks, the scrap-yard shack, the server rack and the red barn. Owner: T3 BUILDINGS (docs/RENDER_PLAN.md).
// V2 drawers of the 'static-bldg' layer on the toy kit; the same hit polygons as the legacy drawers (the prism faces from the same data), live parts for what moves (smoke, LEDs, fans, the vane).
import { P, mix, clamp, h2 } from './iso.js';
import { PAVE, METAL, WOOD } from './palette.js';
import { toyBox, toyRadius, toyTone, rampOf, wallOf, onWall, rrect, contourOf } from './solids.js';
import { reg, facesOf, hitsOf, on, rgbaOf, windowGrid, archDoor, plank, wallMaterial, FONT, detailFor, zoomOf, contourW, styleOf, windowGlow, fp, stage, roof, tank, puffs, dome, lip } from './parts.js';
import { hexRgb, seedOf, leftFace } from './props-common.js';
import { farBlock } from './buildings.js';

const tone = toyTone;
const CREAM = '#fff4de';
const clipSil = (ctx, B) => { ctx.beginPath(); ctx.moveTo(B.sil[0][0], B.sil[0][1]); for (let i = 1; i < B.sil.length; i++) ctx.lineTo(B.sil[i][0], B.sil[i][1]); ctx.closePath(); };
const outline = (ctx, B, col, w, a = 0.42) => { if (!(w > 0)) return; ctx.save(); ctx.lineJoin = 'round'; ctx.strokeStyle = contourOf(col); ctx.lineWidth = w; ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(B.sil[0][0], B.sil[0][1]); for (let i = 1; i < B.sil.length; i++) ctx.lineTo(B.sil[i][0], B.sil[i][1]); ctx.closePath(); ctx.stroke(); ctx.restore(); };

// ---------------------------------------------------------------- the freight depot
reg('depot', {
  far: farBlock,
  pad: [10, 26, 12, 8],
  body(ctx, p, env) {
    const lv = detailFor(ctx, env), zm = zoomOf(ctx, env), { gx, gy, w, d, h } = p, S = styleOf({ ...p, col: p.color }, env), C = S.C, seed = seedOf(p), night = env.night || 0;
    const wall = mix(S.wall, C('#ffffff'), 0.1), roofC = mix(wall, C('#ffffff'), 0.4), contour = contourW(zm, lv);
    stage(ctx, p, env, h + 8);
    const B = toyBox(ctx, gx, gy, w, d, h, wall, { r: toyRadius(w, d) * 0.9, gloss: 0.9 }), L = wallOf(B.left), Rt = wallOf(B.right);
    ctx.save(); clipSil(ctx, B); wallMaterial(ctx, L, 'metal', wall, 'l', lv, seed); wallMaterial(ctx, Rt, 'metal', wall, 'r', lv, seed + 1);
    for (const [wl, side] of [[L, 'l'], [Rt, 'r']]) onWall(ctx, wl, (c) => { c.fillStyle = tone(mix(wall, C('#fffaf0'), 0.6))[side]; c.fillRect(wl.ins[0], -3.6, wl.W - wl.ins[0] - wl.ins[1], 3.6); c.fillStyle = tone(C('#ffd02e'))[side]; c.fillRect(wl.ins[0], -wl.H * 0.62, wl.W - wl.ins[0] - wl.ins[1], 2.6); }); ctx.restore(); // the plinth and a safety-yellow stripe
    outline(ctx, B, wall, contour);
    // three rounded roll-up doors with their slats, a hazard-striped bay and bumpers at the foot
    onWall(ctx, L, (c) => {
      for (let i = 0; i < 3; i++) {
        const x = L.W * (0.08 + i * 0.3), dw = L.W * 0.24, dh = h * 0.6;
        c.fillStyle = tone(C('#fffaf0')).l; rrect(c, x - 2.2, -dh - 2.2, dw + 4.4, dh + 2.2, 5); c.fill();
        c.fillStyle = tone(C('#9aa8c8')).l; rrect(c, x, -dh, dw, dh, 4); c.fill();
        c.fillStyle = rgbaOf('#ffffff', 0.38); for (let k = 1; k < 7; k++) c.fillRect(x + 1.5, -dh + (dh * k) / 7, dw - 3, 1.5);
        c.fillStyle = rgbaOf('#5c4c96', 0.2); c.fillRect(x, -dh * 0.5, dw, dh * 0.5);
        c.fillStyle = C('#ffd02e'); rrect(c, x, -5, dw, 5, 1.5); c.fill(); c.fillStyle = C('#3a2f5e'); c.beginPath(); for (let k = 0; k * 5 + 2.6 < dw - 1; k++) c.rect(x + 1.4 + k * 5, -4.2, Math.min(2.6, dw - 1.4 - k * 5), 3.4); c.fill(); // the hazard stripes of the bay
        c.fillStyle = tone(C('#3a2f5e')).l; rrect(c, x - 4.2, -8, 2.6, 6, 1.2); c.fill(); rrect(c, x + dw + 1.6, -8, 2.6, 6, 1.2); c.fill();
      }
    });
    windowGrid(ctx, Rt, { cols: 3, rows: 1, x0: Rt.W * 0.1, x1: Rt.W * 0.9, y0: h * 0.4, y1: h - 9, fw: 0.55, fh: 0.7, S: 'r', trim: CREAM, lit: night * 1.2, night, seed, lv });
    // a gentle gable in a lighter roof, two round vents on the ridge, the plank sign on the eave
    const rf = roof(ctx, p, h, { kind: 'gable', col: roofC, wall, lv, e: 0.12, rise: 8, axis: 'x' });
    for (const u of [0.28, 0.7]) { const [vx, vy] = rf.at(rf.len * u, rf.span / 2, h + rf.rise); dome(ctx, vx, vy + 1, 3.6, 3, C('#b2bed8'), { drum: 1.6, lantern: false }); }
    plank(ctx, L, 'FREIGHT', { x: L.W * 0.5, up: h + 3.5, font: 8.5, S: 'l', col: C('#3b7fd0'), ink: '#fffaf0', lv });
    return hitsOf(facesOf(gx, gy, w, d, h));
  },
  live: (ctx, p, env) => windowGlow(env, p, leftFace(p), 0.8),
});

// ---------------------------------------------------------------- the factory: saw-tooth roof, a yellow band, an arched works door, two fat striped stacks that smoke round puffs
const stackAt = (p, i) => P(p.gx + p.w * (0.6 + i * 0.15), p.gy + p.d * 0.3, p.h);
reg('factory', {
  far: farBlock,
  pad: [12, 70, 14, 8],
  body(ctx, p, env) {
    const lv = detailFor(ctx, env), zm = zoomOf(ctx, env), { gx, gy, w, d, h } = p, S = styleOf(p, env), C = S.C, seed = seedOf(p), night = env.night || 0, wall = S.wall, contour = contourW(zm, lv);
    stage(ctx, p, env, h + 30);
    const B = toyBox(ctx, gx, gy, w, d, h, wall, { r: toyRadius(w, d) * 0.9, gloss: 0.9 }), L = wallOf(B.left), Rt = wallOf(B.right), yellow = C('#ffd02e');
    ctx.save(); clipSil(ctx, B); wallMaterial(ctx, L, 'metal', wall, 'l', lv, seed); wallMaterial(ctx, Rt, 'metal', wall, 'r', lv, seed + 1);
    for (const [wl, side] of [[L, 'l'], [Rt, 'r']]) onWall(ctx, wl, (c) => { c.fillStyle = tone(mix(wall, C('#fffaf0'), 0.5))[side]; c.fillRect(wl.ins[0], -3.6, wl.W - wl.ins[0] - wl.ins[1], 3.6); c.fillStyle = tone(yellow)[side]; c.fillRect(wl.ins[0], -wl.H * 0.9, wl.W - wl.ins[0] - wl.ins[1], wl.H * 0.12); c.fillStyle = rgbaOf('#ffffff', 0.3); c.fillRect(wl.ins[0], -wl.H * 0.9, wl.W - wl.ins[0] - wl.ins[1], 1.5); }); ctx.restore();
    outline(ctx, B, wall, contour);
    windowGrid(ctx, L, { cols: Math.max(3, Math.round(w * 1.3)), rows: 1, x0: L.W * 0.3, x1: L.W * 0.96, y0: h * 0.36, y1: h * 0.84, fw: 0.6, fh: 0.8, S: 'l', trim: CREAM, lit: night * 1.2, night, seed, lv });
    windowGrid(ctx, Rt, { cols: 2, rows: 1, x0: Rt.W * 0.12, x1: Rt.W * 0.88, y0: h * 0.36, y1: h * 0.84, fw: 0.6, fh: 0.8, S: 'r', trim: CREAM, lit: night * 1.2, night, seed: seed + 4, lv });
    onWall(ctx, L, (c) => { const x = L.W * 0.06, dw = L.W * 0.18, dh = h * 0.56; c.fillStyle = tone(C('#fffaf0')).l; c.beginPath(); c.moveTo(x - 2.2, 0); c.lineTo(x - 2.2, -(dh - dw / 2)); c.arc(x + dw / 2, -(dh - dw / 2), dw / 2 + 2.2, Math.PI, 0); c.lineTo(x + dw + 2.2, 0); c.closePath(); c.fill(); c.fillStyle = tone(C('#7c8fb8')).l; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, -(dh - dw / 2)); c.arc(x + dw / 2, -(dh - dw / 2), dw / 2, Math.PI, 0); c.lineTo(x + dw, 0); c.closePath(); c.fill(); c.fillStyle = rgbaOf('#ffffff', 0.32); for (let k = 1; k < 6; k++) c.fillRect(x + 1.4, -dh * (k / 6), dw - 2.8, 1.4); c.fillStyle = rgbaOf('#4a3f88', 0.25); c.fillRect(x, -dh * 0.5, dw, dh * 0.5); });
    // the saw teeth: sloped steel slabs with a bright glazed riser each
    const n = Math.max(2, Math.round(w / 1.5)), r = 9, T = tone(C('#7d93c8')), R = rampOf(wall), glass = mix(C('#bdeaff'), C('#ffffff'), 0.15), z0 = h + 3.5;
    toyBox(ctx, gx - 0.1, gy - 0.1, w + 0.2, d + 0.2, 3.5, C('#7d93c8'), { z: h, r: 4, ao: false, gloss: 0.7 });
    const q = (pts, fill) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
    for (let i = 0; i < n; i++) { const x0 = gx + (i * w) / n, x1 = gx + ((i + 1) * w) / n; q([P(x1, gy, z0), P(x1, gy + d, z0), P(x1, gy + d, z0 + r), P(x1, gy, z0 + r)], mix(glass, '#6a58b8', 0.2)); q([P(x0, gy + d, z0), P(x1, gy + d, z0 + r), P(x1, gy, z0 + r), P(x0, gy, z0)], T.t); q([P(x0, gy + d, z0), P(x1, gy + d, z0), P(x1, gy + d, z0 + r)], T.l); lip(ctx, P(x1, gy + d, z0 + r), P(x1, gy, z0 + r), 2, rgbaOf('#ffffff', 0.55)); }
    // two fat stacks, banded in yellow and white, with a flared rim
    for (let i = 0; i < (p.stacks | 0); i++) { const [x, y] = stackAt(p, i); ctx.fillStyle = 'rgba(74,63,136,.2)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 1, 9, 4, 0, 0, 6.3); ctx.fill(); tank(ctx, x, y, 7, 34, C('#f4f6fc'), { bands: [[8, 14, yellow], [20, 26, yellow]], lid: C('#5a6890') }); tank(ctx, x, y - 34, 8.2, 3, C('#e8eef8'), { lid: C('#40507a') }); }
    return null;
  },
  live(ctx, p, env) {
    if (!(env.far || env.lite)) for (let i = 0; i < (p.stacks | 0); i++) { const [x, y] = stackAt(p, i); puffs(ctx, x, y - 39, (env.t || 0) + i * 900, 4, 8, 34); }
    windowGlow(env, p, leftFace(p), 0.8);
  },
});

// ---------------------------------------------------------------- the scrap-yard shack: patchwork corrugated panels, a slanted roof weighted with two tyres, a pipe chimney, a porthole, a string of bulbs
const SH = { rust: '#e8955a', teal: '#43b8b0', cream: '#f2e6c8', roof: '#c9693d' };
reg('shack', {
  far: farBlock,
  pad: [12, 34, 14, 8],
  body(ctx, p, env) {
    const lv = detailFor(ctx, env), zm = zoomOf(ctx, env), { gx, gy, w, d, h } = p, S = styleOf(p, env), C = S.C, seed = seedOf(p), night = env.night || 0, contour = contourW(zm, lv), wall = C(SH.rust);
    stage(ctx, p, env, h + 12);
    const B = toyBox(ctx, gx, gy, w, d, h, wall, { r: toyRadius(w, d) * 0.7, gloss: 0.8 }), L = wallOf(B.left), Rt = wallOf(B.right);
    ctx.save(); clipSil(ctx, B);
    for (const [wl, side, sd] of [[L, 'l', seed], [Rt, 'r', seed + 5]]) {
      wallMaterial(ctx, wl, 'metal', wall, side, lv, sd);
      onWall(ctx, wl, (c) => { // mismatched panels: teal and cream sheets nailed on over the rust
        const cols = [C(SH.teal), C(SH.cream), C('#e8c36a')];
        for (let k = 0; k < 4; k++) { const pw = wl.W * (0.2 + h2(sd, k) * 0.12), px = h2(sd, k + 7) * (wl.W - pw), ph = wl.H * (0.34 + h2(sd, k + 3) * 0.3), py = h2(sd, k + 11) * (wl.H - ph); c.fillStyle = tone(cols[k % 3])[side]; rrect(c, px, -py - ph, pw, ph, 2); c.fill(); c.fillStyle = rgbaOf('#ffffff', 0.18); for (let x = px + 3; x < px + pw - 2; x += 4.6) c.fillRect(x, -py - ph + 1, 2.2, ph - 2); c.fillStyle = rgbaOf('#4a3f88', 0.16); c.fillRect(px, -py - 1.4, pw, 1.4); }
        c.fillStyle = tone(C('#9c6238'))[side]; c.fillRect(wl.ins[0], -3.6, wl.W - wl.ins[0] - wl.ins[1], 3.6);
      });
    }
    ctx.restore(); outline(ctx, B, wall, contour);
    // a round porthole with a cross on the shade side, a plank door on the sunny side
    onWall(ctx, Rt, (c) => { const x = Rt.W * 0.5, y = -h * 0.55; c.fillStyle = tone(C('#fff4de')).r; c.beginPath(); c.arc(x, y, 8.4, 0, 6.3); c.fill(); const g = c.createLinearGradient(0, y - 6, 0, y + 6); g.addColorStop(0, '#d6f2ff'); g.addColorStop(1, '#5aa4e0'); c.fillStyle = g; c.beginPath(); c.arc(x, y, 6.2, 0, 6.3); c.fill(); c.fillStyle = tone(C('#fff4de')).r; c.fillRect(x - 0.8, y - 6.2, 1.6, 12.4); c.fillRect(x - 6.2, y - 0.8, 12.4, 1.6); });
    onWall(ctx, L, (c) => { const x = L.W * 0.62, dw = L.W * 0.2, dh = h * 0.58; c.fillStyle = tone(C('#fff4de')).l; rrect(c, x - 2, -dh - 2, dw + 4, dh + 2, 3); c.fill(); c.fillStyle = tone(C('#9c6238')).l; rrect(c, x, -dh, dw, dh, 2); c.fill(); c.fillStyle = rgbaOf('#4a3f88', 0.22); for (let k = 1; k < 4; k++) c.fillRect(x + (dw * k) / 4 - 0.7, -dh, 1.4, dh); c.fillStyle = '#f6c94f'; c.beginPath(); c.arc(x + dw * 0.84, -dh * 0.45, 1.5, 0, 6.3); c.fill(); });
    windowGrid(ctx, L, { cols: 1, rows: 1, x0: L.W * 0.12, x1: L.W * 0.42, y0: h * 0.34, y1: h * 0.8, fw: 0.78, fh: 0.8, S: 'l', trim: SH.cream, lit: night * 1.3, night, seed, lv });
    // the slanted roof (a shed: high at the back), the two tyres on it, a pipe chimney
    const e = 0.16, rise = 13, zf = h + 1, G = (u, v, z) => P(gx + u, gy + v, z), tR = tone(C(SH.roof)), Rr = rampOf(C(SH.roof));
    const poly = (pts, fill) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
    poly([G(w, 0, h), G(w, d, h), G(w, d, h + rise * 0.1), G(w, 0, h + rise)], tone(wall).r);                                  // the high side wall under the slope
    poly([G(-e, d + e, zf - 1), G(w + e, d + e, zf - 1), G(w + e, -e, h + rise), G(-e, -e, h + rise)], tR.l);                    // the sheet roof
    for (let k = 1; k < 7; k++) { const t = k / 7, a = G(-e, d + e - (d + 2 * e) * t, zf - 1 + (h + rise - zf + 1) * t), b = G(w + e, d + e - (d + 2 * e) * t, zf - 1 + (h + rise - zf + 1) * t); ctx.strokeStyle = k % 2 ? rgbaOf(Rr.hi, 0.22) : rgbaOf(Rr.deep, 0.18); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    const f0 = G(-e, d + e, zf - 1), f1 = G(w + e, d + e, zf - 1); ctx.fillStyle = Rr.shade; ctx.beginPath(); ctx.moveTo(f0[0], f0[1]); ctx.lineTo(f1[0], f1[1]); ctx.lineTo(f1[0], f1[1] + 3); ctx.lineTo(f0[0], f0[1] + 3); ctx.closePath(); ctx.fill();
    // the string of bulbs along the front eave (warm by night)
    const nb = Math.max(4, Math.round(w * 2.4)); for (let i = 0; i < nb; i++) { const u = (i + 0.5) / nb, x = f0[0] + (f1[0] - f0[0]) * u, y = f0[1] + (f1[1] - f0[1]) * u + 4.5 + Math.sin(u * Math.PI * 3) * 1.4; ctx.fillStyle = night > 0.3 ? '#fff0a8' : ['#fff4de', '#ffe08a', '#ffc0cc'][i % 3]; ctx.beginPath(); ctx.arc(x, y, 1.9, 0, 6.3); ctx.fill(); }
    const tyre = (u, v) => { const [x, y] = G(u, v, h + rise * (1 - v / d) * 0.9 + 2); ctx.fillStyle = 'rgba(74,63,136,.25)'; ctx.beginPath(); ctx.ellipse(x + 2, y + 2, 8, 4, 0, 0, 6.3); ctx.fill(); ctx.fillStyle = C('#3a2f5e'); ctx.beginPath(); ctx.ellipse(x, y, 8, 4.4, 0, 0, 6.3); ctx.fill(); ctx.fillStyle = C('#5a4a8c'); ctx.beginPath(); ctx.ellipse(x, y - 1.2, 7.4, 3.6, 0, 0, 6.3); ctx.fill(); ctx.fillStyle = tone(C(SH.roof)).l; ctx.beginPath(); ctx.ellipse(x, y - 1.2, 3.8, 1.8, 0, 0, 6.3); ctx.fill(); };
    tyre(w * 0.25, d * 0.45); tyre(w * 0.5, d * 0.5);
    const [cx, cy] = G(w * 0.8, d * 0.3, h + rise * 0.7 + 4); tank(ctx, cx, cy, 3.8, 18, C('#9aa8c8'), { lid: C('#5a6890') });
    plank(ctx, L, 'SKILLS', { x: L.W * 0.3, up: h * 0.9, font: 8, S: 'l', col: C('#9c6238'), ink: '#ffe9a8', lv });
    return hitsOf(facesOf(gx, gy, w, d, h));
  },
  live(ctx, p, env) {
    if (!(env.far || env.lite)) { const [cx, cy] = P(p.gx + p.w * 0.8, p.gy + p.d * 0.3, p.h + 13 * 0.7 + 4); puffs(ctx, cx, cy - 18, env.t || 0, 3, 7, 28); }
    windowGlow(env, p, leftFace(p), 0.8);
    if (env.night > 0.3 && !(env.lite || env.far) && env.lights) { const f = leftFace(p), a = fp(f, 0.5, 1); env.lights.push({ wx: a[0], wy: a[1] - env.zoff, r: 50, c: '255,224,140', a: 0.28 * env.night }); }
  },
});

// ---------------------------------------------------------------- the server rack: a slate-violet block of drawer panels with LEDs, two cooling fans on the roof, a cable bundle, a label plate
const LEDS = ['#22d9ee', '#52cf7c', '#ffb347'];
function panels(ctx, wl, p, S, o) {
  const { cols, rows, lv } = o, side = o.side, C = S.C, accent = C(p.acc || '#22d9ee');
  onWall(ctx, wl, (c) => {
    const x0 = wl.W * 0.06, x1 = wl.W * 0.94, y0 = 5, y1 = wl.H - 4, cw = (x1 - x0) / cols, ch = (y1 - y0) / rows;
    c.fillStyle = tone(C('#4a52b0'))[side]; c.beginPath(); for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const x = x0 + i * cw + 1.2, y = -(y0 + j * ch + ch - 1.2), ww = cw - 2.4, hh = ch - 2.4, r = 1.6; c.moveTo(x + r, y); c.lineTo(x + ww - r, y); c.quadraticCurveTo(x + ww, y, x + ww, y + r); c.lineTo(x + ww, y + hh - r); c.quadraticCurveTo(x + ww, y + hh, x + ww - r, y + hh); c.lineTo(x + r, y + hh); c.quadraticCurveTo(x, y + hh, x, y + hh - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath(); }
    c.fill();
    c.fillStyle = rgbaOf('#ffffff', side === 'r' ? 0.1 : 0.2); c.beginPath(); for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) c.rect(x0 + i * cw + 2.2, -(y0 + j * ch + ch - 1.2) + 0.8, cw - 4.4, 1.2); c.fill();
    c.fillStyle = rgbaOf('#10162e', 0.55); c.beginPath(); for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) for (let k = 0; k < 3; k++) c.rect(x0 + i * cw + cw * 0.18, -(y0 + j * ch + ch * 0.5) + (k - 1) * 2.2, cw * 0.3, 1.1); c.fill(); // vent slits
    if (!o.live) { c.fillStyle = rgbaOf(accent, 0.55); c.beginPath(); for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { c.moveTo(x0 + i * cw + cw * 0.74, -(y0 + j * ch + ch * 0.5)); c.arc(x0 + i * cw + cw * 0.74, -(y0 + j * ch + ch * 0.5), 1.4, 0, 6.3); } c.fill(); }
  });
  void lv;
}
reg('rack', {
  far: farBlock,
  night: false,
  pad: [10, 24, 12, 8],
  body(ctx, p, env) {
    const lv = detailFor(ctx, env), zm = zoomOf(ctx, env), { gx, gy, w, d, h } = p, S = styleOf({ ...p, col: p.col }, env), C = S.C, seed = seedOf(p), wall = C(p.col || '#7b88d8'), contour = contourW(zm, lv), rows = Math.max(3, Math.round(h / 7)), accent = C(p.acc || '#22d9ee');
    stage(ctx, p, env, h + 8);
    const B = toyBox(ctx, gx, gy, w, d, h, wall, { r: toyRadius(w, d) * 0.9, gloss: 1 }), L = wallOf(B.left), Rt = wallOf(B.right);
    outline(ctx, B, wall, contour);
    panels(ctx, L, p, S, { cols: 3, rows, side: 'l', lv }); panels(ctx, Rt, p, S, { cols: 4, rows, side: 'r', lv });
    onWall(ctx, L, (c) => { c.fillStyle = rgbaOf(accent, 0.8); c.fillRect(L.ins[0], -L.H, L.W - L.ins[0] - L.ins[1], 2.6); c.fillStyle = tone(C('#eef2ff')).l; rrect(c, L.W * 0.3, -4, L.W * 0.4, 3.4, 1.4); c.fill(); });
    onWall(ctx, Rt, (c) => { c.fillStyle = rgbaOf(accent, 0.7); c.fillRect(Rt.ins[0], -Rt.H, Rt.W - Rt.ins[0] - Rt.ins[1], 2.6); });
    // the roof: a dark deck with two round fans and a cable bundle that bends down the back
    const top = toyBox(ctx, gx + 0.12, gy + 0.12, w - 0.24, d - 0.24, 3, mix(wall, C('#1c2146'), 0.55), { z: h, r: 3, gloss: 0.6, ao: false });
    for (const u of [0.3, 0.68]) { const [x, y] = P(gx + w * u, gy + d * 0.55, h + 3); ctx.fillStyle = rgbaOf('#10162e', 0.9); ctx.beginPath(); ctx.ellipse(x, y, 10.5, 5.4, 0, 0, 6.3); ctx.fill(); ctx.strokeStyle = tone(C('#dfe6f4')).t; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, 10.5, 5.4, 0, 0, 6.3); ctx.stroke(); }
    const c0 = P(gx + w * 0.12, gy + d * 0.2, h + 3), c1 = P(gx + w * 0.12, gy + d * 0.85, h + 3);
    ctx.strokeStyle = tone(C('#5a52a8')).l; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(c0[0], c0[1]); ctx.quadraticCurveTo(c0[0] - 8, (c0[1] + c1[1]) / 2 - 8, c1[0], c1[1]); ctx.stroke();
    ctx.strokeStyle = rgbaOf('#ffffff', 0.3); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(c0[0], c0[1] - 1); ctx.quadraticCurveTo(c0[0] - 8, (c0[1] + c1[1]) / 2 - 9, c1[0], c1[1] - 1); ctx.stroke();
    void top; void seed;
    return null;
  },
  live(ctx, p, env) {
    const ph = env.t ? Math.floor(env.t / 450) : 0, rows = Math.max(3, Math.round(p.h / 7)), lf = leftFace(p), rf = (p.w, [P(p.gx + p.w, p.gy + p.d, 0), P(p.gx + p.w, p.gy, 0), P(p.gx + p.w, p.gy, p.h), P(p.gx + p.w, p.gy + p.d, p.h)]);
    const lit = (f, cols, ph0) => {
      const H = Math.abs(f[0][1] - f[3][1]), ch = (H - 9) / rows;
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = LEDS[k]; ctx.beginPath();
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { if ((i * 5 + j * 3 + ph + ph0 + (p.seed | 0)) % 3 !== k) continue; const pt = fp(f, 0.06 + 0.88 * ((i + 0.74) / cols), (5 + (j + 0.5) * ch) / H); ctx.moveTo(pt[0] + 1.5, pt[1]); ctx.arc(pt[0], pt[1], 1.5, 0, 6.3); }
        ctx.fill();
      }
    };
    lit(lf, 3, 0); lit(rf, 4, 3);
    // the fans: a blade cross turning (still at rest)
    for (const u of [0.3, 0.68]) { const [x, y] = P(p.gx + p.w * u, p.gy + p.d * 0.55, p.h + 3), a = (env.t || 0) / 6000 * Math.PI * 2; ctx.strokeStyle = '#b8c4ec'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath(); for (let k = 0; k < 4; k++) { const an = a + (k * Math.PI) / 2; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(an) * 8.2, y + Math.sin(an) * 4.2); } ctx.stroke(); ctx.fillStyle = '#eef2ff'; ctx.beginPath(); ctx.ellipse(x, y, 1.8, 1, 0, 0, 6.3); ctx.fill(); }
    if (!(env.lite || env.far)) { const [x, y] = P(p.gx + p.w / 2, p.gy + p.d, p.h * 0.5); env.lights?.push({ wx: x, wy: y - env.zoff, r: 46, c: hexRgb(p.acc || '#22d9ee'), a: 0.3 }); }
  },
});

// ---------------------------------------------------------------- the red barn: gambrel roof, X-braced doors, a hayloft door with a bale, white trim, a rooster vane
const BARN = { wall: '#e8503a', trim: '#fff6e8', roof: '#a4b2d6' };
const barnRoof = (ctx, p, z, C, lv) => {
  const { gx, gy, w, d } = p, len = d, span = w, e = 0.12, rise = 24, knee = 0.17, kz = rise * 0.56, G = (u, v, zz) => P(gx + v, gy + u, zz), T = tone(C(BARN.roof)), R = rampOf(C(BARN.roof)), wall = tone(C(BARN.wall));
  const poly = (pts, fill) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  const sv = span * knee, zE = z - 1.5;
  // the back slopes (seen from above), the gable end wall (the +gy end faces the sun), the front slopes
  poly([G(-e, -e, zE), G(len + e, -e, zE), G(len + e, sv, z + kz), G(-e, sv, z + kz)], mix(T.t, T.l, 0.4)); poly([G(-e, sv, z + kz), G(len + e, sv, z + kz), G(len + e, span / 2, z + rise), G(-e, span / 2, z + rise)], mix(T.t, T.l, 0.15));
  poly([G(len, 0, z), G(len, span, z), G(len, span - sv, z + kz), G(len, span / 2, z + rise), G(len, sv, z + kz)], wall.l);
  poly([G(-e, span - sv, z + kz), G(len + e, span - sv, z + kz), G(len + e, span / 2, z + rise), G(-e, span / 2, z + rise)], T.r);
  poly([G(-e, span + e, zE), G(len + e, span + e, zE), G(len + e, span - sv, z + kz), G(-e, span - sv, z + kz)], mix(T.r, R.shade, 0.3));
  for (const [a0, a1, col] of [[span - sv, span + e, R.deep], [span / 2, span - sv, R.deep]]) { void a0; void a1; void col; }
  ctx.strokeStyle = rgbaOf(R.deep, 0.22); ctx.lineWidth = 1.6; for (let k = 1; k < 8; k++) { const u = (len + 2 * e) * (k / 8) - e, a = G(u, span - sv, z + kz), b = G(u, span + e, zE); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); const a2 = G(u, span / 2, z + rise), b2 = G(u, span - sv, z + kz); ctx.beginPath(); ctx.moveTo(a2[0], a2[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke(); }
  // trim along the rake of the gable end and the knee line, ridge cap
  ctx.strokeStyle = C(BARN.trim); ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath(); for (const [v, zz] of [[0, z], [sv, z + kz], [span / 2, z + rise], [span - sv, z + kz], [span, z]]) { const q = G(len, v, zz); if (v === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); } ctx.stroke();
  const r0 = G(-e, span / 2, z + rise), r1 = G(len + e, span / 2, z + rise); ctx.strokeStyle = R.light; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(r0[0], r0[1]); ctx.lineTo(r1[0], r1[1]); ctx.stroke(); ctx.strokeStyle = rgbaOf('#ffffff', 0.5); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(r0[0], r0[1] - 0.9); ctx.lineTo(r1[0], r1[1] - 0.9); ctx.stroke();
  void lv; return { G, rise, kz, len, span };
};
reg('barn', {
  far: farBlock,
  pad: [12, 44, 14, 8],
  body(ctx, p, env) {
    const lv = detailFor(ctx, env), zm = zoomOf(ctx, env), { gx, gy, w, d, h } = p, S = styleOf({ ...p, col: BARN.wall }, env), C = S.C, seed = seedOf(p), night = env.night || 0, wall = C(p.col || BARN.wall), trim = C(p.trim || BARN.trim), contour = contourW(zm, lv);
    stage(ctx, p, env, h + 22, { m: 0.26 });
    const B = toyBox(ctx, gx, gy, w, d, h, wall, { r: toyRadius(w, d) * 0.7, gloss: 0.8 }), L = wallOf(B.left), Rt = wallOf(B.right);
    ctx.save(); clipSil(ctx, B); wallMaterial(ctx, L, 'boards', wall, 'l', lv, seed); wallMaterial(ctx, Rt, 'boards', wall, 'r', lv, seed + 1);
    for (const [wl, side] of [[L, 'l'], [Rt, 'r']]) onWall(ctx, wl, (c) => { c.fillStyle = tone(trim)[side]; c.fillRect(0, -wl.H, 3.6, wl.H); c.fillRect(wl.W - 3.6, -wl.H, 3.6, wl.H); c.fillRect(wl.ins[0], -3.6, wl.W - wl.ins[0] - wl.ins[1], 3.6); }); ctx.restore();
    outline(ctx, B, wall, contour);
    // the big X-braced doors (the gable end faces the sun), then windows on the long shade side
    onWall(ctx, L, (c) => {
      const dw = L.W * 0.34, dh = h * 0.7, x = (L.W - dw) / 2;
      c.fillStyle = tone(trim).l; rrect(c, x - 2.4, -dh - 2.4, dw + 4.8, dh + 2.4, 3); c.fill(); c.fillStyle = tone(mix(wall, '#7a2a20', 0.35)).l; rrect(c, x, -dh, dw, dh, 2); c.fill();
      c.strokeStyle = tone(trim).l; c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(x + 2, -dh + 2); c.lineTo(x + dw / 2 - 1.5, -2); c.moveTo(x + dw / 2 - 1.5, -dh + 2); c.lineTo(x + 2, -2); c.moveTo(x + dw / 2 + 1.5, -dh + 2); c.lineTo(x + dw - 2, -2); c.moveTo(x + dw - 2, -dh + 2); c.lineTo(x + dw / 2 + 1.5, -2); c.stroke();
      c.fillStyle = tone(trim).l; c.fillRect(x + dw / 2 - 1, -dh, 2, dh); c.fillRect(x, -dh * 0.5 - 1, dw, 2);
    });
    windowGrid(ctx, Rt, { cols: 3, rows: 1, x0: Rt.W * 0.14, x1: Rt.W * 0.86, y0: h * 0.34, y1: h * 0.86, fw: 0.5, fh: 0.8, S: 'r', trim, lit: night * 1.2, night, seed, lv });
    const rf = barnRoof(ctx, p, h, C, lv);
    // the hayloft door in the gable, with a bale looking out
    const [hx, hy] = rf.G(rf.len, rf.span / 2, h + rf.rise * 0.3); ctx.save(); ctx.translate(hx, hy); ctx.transform(1, 0.5, 0, 1, 0, 0);
    ctx.fillStyle = trim; rrect(ctx, -9, -10, 18, 20, 3); ctx.fill(); ctx.fillStyle = mix(wall, '#7a2a20', 0.5); rrect(ctx, -6.6, -7.6, 13.2, 15.6, 2); ctx.fill(); ctx.fillStyle = C('#f2d27a'); rrect(ctx, -5.4, -1.6, 10.8, 8.4, 2); ctx.fill(); ctx.fillStyle = rgbaOf('#b8872a', 0.5); ctx.fillRect(-5.4, 1.2, 10.8, 1.2); ctx.fillRect(-1.2, -1.6, 1.2, 8.4); ctx.restore();
    return null;
  },
  live(ctx, p, env) {
    const { gx, gy, w, d } = p, [x, y] = P(gx + w / 2, gy + d - 0.2, p.h + 24), a = Math.sin((env.t || 0) / 6000 * Math.PI * 2) * 0.5;
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#8a5a3a'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -10); ctx.stroke();
    ctx.rotate(a); ctx.fillStyle = '#3a2f5e'; ctx.beginPath(); ctx.moveTo(-9, -10); ctx.lineTo(6, -10); ctx.lineTo(9, -12); ctx.lineTo(9, -8); ctx.lineTo(6, -10); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(-3, -14.5, 3, 0, 6.3); ctx.fill(); ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.arc(0, -10, 1.5, 0, 6.3); ctx.fill(); ctx.restore();
    windowGlow(env, p, [P(p.gx + p.w, p.gy + p.d, 0), P(p.gx + p.w, p.gy, 0), P(p.gx + p.w, p.gy, p.h), P(p.gx + p.w, p.gy + p.d, p.h)], 1);
  },
});

void PAVE; void METAL; void WOOD; void clamp; void archDoor; void FONT; void zoomOf; void on; void tank; void dome;
