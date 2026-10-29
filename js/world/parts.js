// The parts a toy building is made of: windows with frames and sills, doors, awnings, signs, wall materials (brick, boards, ribs, glass, stone), roofs (gable, hip, flat, saw) with eaves and courses, chimneys.
// Owner: T3 BUILDINGS (docs/RENDER_PLAN.md). Pure drawing helpers for props-buildings.js; nothing here reads the game or the clock, and everything is drawn when a sprite is built (or, with no canvas, straight onto the scene).
//
// Everything on a wall is drawn in the wall's own elevation (solids.onWall: x along the wall, y up, sheared into the iso picture), so a window is an ordinary rounded rectangle there. Detail is additive (art direction
// 7.3): a part draws its complete base and adds its near and close marks with the alpha of `lv` = [1, mid, near, close] (lodOf(zoom).detail), which is a pure function of the zoom: a mark below the floor is skipped.
import { P, mix, shade, h2, clamp } from './iso.js';
import { GLASS, LIGHT, INK, BRICK, SKY, PAVE } from './palette.js';
import { rampOf, toyTone, toyBox, onWall, wallOf, rrect, contourOf, toHsl, fromHsl } from './solids.js';
import { lodOf } from './lod.js';
import { veiled } from './palette.js';
import { FOG_DIM } from './common.js';
import { DIST } from './layout.js';
import { themeRow } from './bstyle.js';
import { castShadow } from './shadow.js';

export const FONT = '"Nunito", "Arial Rounded MT Bold", "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
export const HAZE_C = '#a9c3e0';
const A_MIN = 0.02;

// ---------------------------------------------------------------- small shared things
/** A colour as this building sees it: veiled where its district is locked (never darker), then hazed by the height of the ground it stands on (the haze the neighbouring props wear). */
export function tintC(c, env) {
  const k = env.dim ? env.dim / FOG_DIM : 0, v = k > 0.01 ? veiled(c, k) : c;
  return env.hz ? mix(v, HAZE_C, env.hz) : v;
}
/** The detail alphas [1, mid, near, close] a sprite is being built for: the engine's lodOf record when the sprite cache hands it over (env.lod), else the zoom read from the transform (a canvas density of 2 assumed), else all in. */
export function detailOf(ctx, env) {
  if (env && env.lod && env.lod.detail) return env.lod.detail;
  if (env && env.lodAll) return ALL_IN;
  try { const a = ctx.getTransform().a; if (a > 0) { const dpr = Math.min(typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 2, 2); return lodOf(a / dpr).detail; } } catch { /* no transform to read */ }
  return ALL_IN;
}
const ALL_IN = Object.freeze([1, 1, 1, 1]);
/** The three polygons of a prism as iso.box() returns them (the hit shapes of a building), without drawing. */
export function facesOf(gx, gy, w, d, h, z = 0) {
  const z1 = z + h, A = P(gx, gy, z1), B = P(gx + w, gy, z1), C = P(gx + w, gy + d, z1), D = P(gx, gy + d, z1), B0 = P(gx + w, gy, z), C0 = P(gx + w, gy + d, z), D0 = P(gx, gy + d, z);
  return { left: [D0, C0, C, D], right: [C0, B0, B, C], top: [A, B, C, D] };
}
export const hitsOf = (f) => [f.left, f.right, f.top];
/** Alpha for a mark of band `a` (a number 0..1): the mark is skipped (returns 0) below the floor. */
export const on = (a) => (a > A_MIN ? a : 0);
const rgbaOf = (c, a) => { const n = parseInt(c.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
export { rgbaOf };
const tone = toyTone;
const hz = (seed, i) => h2((seed | 0) + i * 31, i * 7 + 3);

/** Run `fn` with the context mapped onto a roof plane: origin at the screen point o, x along `u` (screen vector, drawn in its own pixel length) and y along `v`. fn(ctx, lenU, lenV). */
export function onPlane(ctx, o, u, v, fn) {
  const lu = Math.hypot(u[0], u[1]) || 1, lv = Math.hypot(v[0], v[1]) || 1;
  ctx.save(); ctx.transform(u[0] / lu, u[1] / lu, v[0] / lv, v[1] / lv, o[0], o[1]); fn(ctx, lu, lv); ctx.restore();
}

// ---------------------------------------------------------------- wall materials
/** Paint a wall's material over its base colour. `c` is the wall's body colour, S 'l' (sun side) or 'r'. Clipped to the wall by the caller's wall clip; drawn in the wall's elevation. */
export function wallMaterial(ctx, wl, mat, c, S, lv, seed = 0) {
  const T = tone(c)[S], R = rampOf(c), W = wl.W, H = wl.H;
  onWall(ctx, wl, (g) => {
    g.save(); g.beginPath(); g.rect(0, -H, W, H); g.clip();
    if (mat === 'brick') {
      const bh = 4.4, n = Math.ceil(H / bh), mortar = mix(BRICK.mortar, T, 0.35);
      g.fillStyle = rgbaOf(mortar, 0.5); for (let k = 1; k < n; k++) g.fillRect(0, -k * bh - 0.6, W, 1.3);
      g.fillStyle = rgbaOf(R.hi, 0.10); for (let k = 0; k < n; k += 2) g.fillRect(0, -(k + 1) * bh + 0.7, W, bh - 1.3);
      if (on(lv[3])) { g.globalAlpha = lv[3]; g.fillStyle = rgbaOf(mortar, 0.5); g.beginPath(); for (let k = 0; k < n; k++) { const off = (k % 2) * 5; for (let x = off; x < W; x += 10) g.rect(x, -(k + 1) * bh + 0.7, 1.3, bh - 1.3); } g.fill(); g.globalAlpha = 1; }
    } else if (mat === 'boards') {
      const sw = 5.2, n = Math.ceil(W / sw);
      g.fillStyle = rgbaOf(R.shade, 0.32); g.beginPath(); for (let k = 1; k < n; k++) g.rect(k * sw - 0.7, -H, 1.5, H); g.fill();
      g.fillStyle = rgbaOf(R.hi, 0.12); g.beginPath(); for (let k = 0; k < n; k += 2) g.rect(k * sw + 0.5, -H, sw - 1.4, H); g.fill();
      if (on(lv[3])) { g.globalAlpha = lv[3]; g.fillStyle = rgbaOf(R.deep, 0.35); g.beginPath(); for (let k = 0; k < n; k++) { const y = -(4 + hz(seed, k) * (H - 8)); g.rect(k * sw + 1.2, y, 1.6, 1.6); g.rect(k * sw + 1.2, y - 11, 1.6, 1.6); } g.fill(); g.globalAlpha = 1; }
    } else if (mat === 'metal') {
      const sw = 4.6, n = Math.ceil(W / sw);
      g.fillStyle = rgbaOf('#ffffff', 0.18); g.beginPath(); for (let k = 0; k < n; k++) g.rect(k * sw, -H, 2.3, H); g.fill();
      g.fillStyle = rgbaOf(R.shade, 0.22); g.beginPath(); for (let k = 0; k < n; k++) g.rect(k * sw + 2.3, -H, 2.3, H); g.fill();
    } else if (mat === 'stone') {
      const bh = 9, n = Math.ceil(H / bh);
      g.fillStyle = rgbaOf(R.shade, 0.22); for (let k = 1; k < n; k++) g.fillRect(0, -k * bh - 0.7, W, 1.6);
      if (on(lv[2])) { g.globalAlpha = lv[2]; g.beginPath(); for (let k = 0; k < n; k++) { const off = (k % 2) * 14; for (let x = off + 12; x < W; x += 28) g.rect(x, -(k + 1) * bh + 0.8, 1.6, bh - 1.6); } g.fill(); g.globalAlpha = 1; }
    } else if (mat === 'glass') {
      g.fillStyle = rgbaOf('#ffffff', 0.16); g.beginPath(); g.moveTo(W * 0.1, 0); g.lineTo(W * 0.3, 0); g.lineTo(W * 0.62, -H); g.lineTo(W * 0.42, -H); g.closePath(); g.fill();
      g.fillStyle = rgbaOf('#ffffff', 0.1); g.beginPath(); g.moveTo(W * 0.38, 0); g.lineTo(W * 0.46, 0); g.lineTo(W * 0.78, -H); g.lineTo(W * 0.7, -H); g.closePath(); g.fill();
    } else if (mat === 'plaster' && on(lv[3])) { // weathering blotches in the shade colour, hashed so a building always weathers the same way
      g.globalAlpha = lv[3] * 0.1; g.fillStyle = R.shade; g.beginPath();
      for (let k = 0; k < 4; k++) { const x = hz(seed, k) * W, y = -(H * (0.2 + hz(seed, k + 9) * 0.6)); g.moveTo(x + 7, y); g.ellipse(x, y, 7 + hz(seed, k + 4) * 5, 3 + hz(seed, k + 2) * 3, 0, 0, 6.3); }
      g.fill(); g.globalAlpha = 1;
    }
    g.restore();
  });
}

// ---------------------------------------------------------------- windows
const GL_TOP = GLASS.top, GL_MID = GLASS.mid, GL_LOW = GLASS.low;
/**
 * A grid of windows on a wall, in the wall's elevation. g = { cols, rows, x0, x1 (the span of the wall they fill, px), y0, y1 (heights above the foot), fw (window width as a share of its cell), fh, S ('l'|'r'),
 * trim (frame colour), lit (0..1+: how much of the fixed pattern is lit: windows come on one by one), phase, seed, mull ('cross'|'bar'|'none'), sill, shutter (colour|null), curtain (colour|null), box (flower boxes),
 * round (corner radius share), arch (arched tops), night (0..1: unlit glass deepens), glass: [top, low] override, lv }. One path per kind per row, so a tower of eighty panes is a few dozen fills.
 */
export function windowGrid(ctx, wl, g) {
  const { cols, rows, x0, x1, y0, y1, lv } = g, S = g.S || 'l', cw = (x1 - x0) / cols, ch = (y1 - y0) / rows, ww = Math.min(cw * 0.9, cw * (g.fw ?? 0.56)), wh = ch * (g.fh ?? 0.62);
  const frameC = tone(g.trim || '#fff4de')[S], R = g.round ?? 0.13, fwid = Math.max(1.5, Math.min(ww, wh) * 0.12), lit = g.lit || 0, night = g.night || 0;
  const unTop = mix(g.glass ? g.glass[0] : GL_TOP, '#3a4a98', 0.5 * night), unLow = mix(g.glass ? g.glass[1] : GL_LOW, '#2a3278', 0.5 * night);
  const sideMix = S === 'r' ? 0.22 : 0, tTop = mix(unTop, '#5a52a8', sideMix), tLow = mix(unLow, '#4a42a0', sideMix);
  const kindOf = (i, j) => { const rank = ((i * 7 + j * 13 + cols + (g.phase | 0)) % 5) / 5; return lit > 0 && rank < lit ? (rank + 0.12 < lit ? 2 : 1) : 0; };
  const px = (i) => x0 + i * cw + (cw - ww) / 2, py = (j) => y0 + j * ch + (ch - wh) / 2; // bottom of window (height above the foot)
  onWall(ctx, wl, (c) => {
    // frames (one path, one fill): the window plus its frame width all round
    c.fillStyle = frameC; c.beginPath();
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) rrAppend(c, px(i) - fwid, -(py(j) + wh) - fwid, ww + 2 * fwid, wh + 2 * fwid, ww * R + fwid, g.arch);
    c.fill();
    // glass, row by row and kind by kind: a gradient per row
    for (let j = 0; j < rows; j++) {
      const top = -(py(j) + wh), bot = -py(j);
      for (let kind = 0; kind < 3; kind++) {
        let any = false; c.beginPath();
        for (let i = 0; i < cols; i++) if (kindOf(i, j) === kind) { rrAppend(c, px(i), top, ww, wh, ww * R, g.arch); any = true; }
        if (!any) continue;
        const gr = c.createLinearGradient(0, top, 0, bot);
        if (kind === 0) { gr.addColorStop(0, tTop); gr.addColorStop(0.5, mix(tTop, tLow, 0.55)); gr.addColorStop(1, tLow); }
        else if (kind === 2) { gr.addColorStop(0, mix('#fff0b8', S === 'r' ? '#ffd9a0' : '#ffffff', 0.1)); gr.addColorStop(1, '#ffc65c'); }
        else { gr.addColorStop(0, mix(tTop, '#fff0b8', 0.55)); gr.addColorStop(1, mix(tLow, '#ffc65c', 0.55)); }
        c.fillStyle = gr; c.fill();
      }
    }
    // the sky in the glass: a reflection band, a mullion cross and a sill plate (near)
    const a = on(lv[2]);
    if (a) {
      c.globalAlpha = a;
      c.fillStyle = rgbaOf('#ffffff', S === 'r' ? 0.3 : 0.45); c.beginPath();
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { if (kindOf(i, j) === 2) continue; const x = px(i), y = -(py(j) + wh); c.moveTo(x + ww * 0.52, y + wh * 0.07); c.lineTo(x + ww * 0.82, y + wh * 0.07); c.lineTo(x + ww * 0.42, y + wh * 0.93); c.lineTo(x + ww * 0.12, y + wh * 0.93); c.closePath(); }
      c.fill();
      if (g.mull !== 'none') {
        c.fillStyle = frameC; c.beginPath(); const mw = Math.max(1.4, fwid * 0.8);
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const x = px(i), y = -(py(j) + wh); c.rect(x + ww / 2 - mw / 2, y, mw, wh); if (g.mull !== 'bar') c.rect(x, y + wh * 0.45, ww, mw); }
        c.fill();
      }
      if (g.sill !== false) {
        const sw = Math.max(2, wh * 0.1);
        c.fillStyle = rgbaOf(rampOf(g.trim || '#fff4de').deep, 0.3); c.beginPath(); for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) rrAppendDown(c, px(i) - fwid - 2, -py(j) + fwid + sw * 0.5, ww + 2 * fwid + 4, 1.8);
        c.fill();
        c.fillStyle = frameC; c.beginPath(); for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) rrAppendDown(c, px(i) - fwid - 2, -py(j) + fwid - 0.5, ww + 2 * fwid + 4, sw);
        c.fill();
      }
      if (g.shutter) {
        const sh = tone(g.shutter)[S], sw = Math.max(2.4, ww * 0.32); c.fillStyle = sh; c.beginPath();
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const x = px(i), y = -(py(j) + wh); rrAppendDown(c, x - fwid - sw - 0.6, y - fwid, sw, wh + 2 * fwid); rrAppendDown(c, x + ww + fwid + 0.6, y - fwid, sw, wh + 2 * fwid); }
        c.fill();
        c.fillStyle = rgbaOf(rampOf(g.shutter).deep, 0.35); c.beginPath(); // louvre slats
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const x = px(i), y = -(py(j) + wh); for (let s = 1; s < 5; s++) { const yy = y + (wh * s) / 5; c.rect(x - fwid - sw - 0.6 + 0.6, yy, sw - 1.2, 1.1); c.rect(x + ww + fwid + 0.6 + 0.6, yy, sw - 1.2, 1.1); } }
        c.fill();
      }
      c.globalAlpha = 1;
    }
    // the closest marks: curtains in a corner of a few unlit windows, flower boxes under a few more
    const b = on(lv[3]);
    if (b) {
      c.globalAlpha = b;
      if (g.curtain) {
        c.fillStyle = g.curtain; c.beginPath();
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (kindOf(i, j) !== 2 && hz(g.seed, i * 5 + j * 11) > 0.5) { const x = px(i), y = -(py(j) + wh); c.moveTo(x, y); c.lineTo(x + ww * 0.42, y); c.quadraticCurveTo(x + ww * 0.12, y + wh * 0.3, x + ww * 0.06, y + wh * 0.62); c.lineTo(x, y + wh * 0.62); c.closePath(); }
        c.fill();
      }
      if (g.box) {
        for (let j = 0; j < Math.min(rows, 2); j++) for (let i = 0; i < cols; i++) if (hz(g.seed, i * 3 + j * 17 + 1) > 0.35) {
          const x = px(i) - 1, y = -py(j) + fwid + 1, bw = ww + 2;
          c.fillStyle = tone('#b87b4e')[S]; rrect(c, x, y, bw, 3.6, 1.2); c.fill();
          for (let k = 0; k < 4; k++) { const cx = x + 2 + (bw - 4) * (k / 3), up = 2 + hz(g.seed, k + i) * 2; c.fillStyle = tone('#6cc178')[S]; c.beginPath(); c.arc(cx, y - up * 0.4, 2.3, 0, 6.3); c.fill(); if (k % 2 === (i & 1)) { c.fillStyle = ['#ff9cc2', '#ffd84d', '#fffbe8'][(k + i) % 3]; c.beginPath(); c.arc(cx + 0.4, y - up - 1.2, 1.1, 0, 6.3); c.fill(); } }
        }
      }
      c.globalAlpha = 1;
    }
  });
}
// a rounded rectangle appended to the current path (no beginPath); `arch` turns the top into a semicircle
function rrAppend(c, x, y, w, h, r, arch) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (arch) { const R = w / 2; c.moveTo(x, y + h - r); c.lineTo(x, y + R); c.arc(x + R, y + R, R, Math.PI, 0); c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.closePath(); return; }
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
function rrAppendDown(c, x, y, w, h) { rrAppend(c, x, y, w, h, Math.min(1.6, h / 2, w / 2)); }

// ---------------------------------------------------------------- doors, awnings, signs
/** An arched door on a wall: frame, panel with a lit lower pane, a knob and a step (near), a number plate (close). x is the left of the opening, w its width, h its height; S the wall's side. */
export function archDoor(ctx, wl, o) {
  const { x, w, h, S = 'l', lv } = o, trim = tone(o.trim || '#fff4de')[S], panel = tone(o.col || '#9c6238')[S], fw = Math.max(1.8, w * 0.12), R = w / 2;
  onWall(ctx, wl, (c) => {
    // the step: a rounded slab under the door, a little wider
    c.fillStyle = tone('#e8dcc4')[S]; rrect(c, x - fw - 2, -3.4, w + 2 * fw + 4, 3.6, 1.6); c.fill();
    c.fillStyle = trim; c.beginPath(); c.moveTo(x - fw, -2); c.lineTo(x - fw, -(h - R)); c.arc(x + R, -(h - R), R + fw, Math.PI, 0); c.lineTo(x + w + fw, -2); c.closePath(); c.fill();
    c.fillStyle = panel; c.beginPath(); c.moveTo(x, -2); c.lineTo(x, -(h - R)); c.arc(x + R, -(h - R), R, Math.PI, 0); c.lineTo(x + w, -2); c.closePath(); c.fill();
    const a = on(lv[2]);
    if (a) {
      c.globalAlpha = a; c.fillStyle = rgbaOf(rampOf(o.col || '#9c6238').hi, 0.32); c.beginPath(); c.moveTo(x + w * 0.12, -2); c.lineTo(x + w * 0.12, -(h - R)); c.arc(x + R, -(h - R), R * 0.76, Math.PI, Math.PI * 1.5); c.lineTo(x + w * 0.5, -2); c.fill(); // a lit side
      c.fillStyle = rgbaOf(rampOf(o.col || '#9c6238').deep, 0.4); c.fillRect(x + w / 2 - 0.7, -(h * 0.62), 1.4, h * 0.62 - 2); // the leaf joint
      c.fillStyle = '#f6c94f'; c.beginPath(); c.arc(x + w * 0.78, -h * 0.4, Math.max(1.3, w * 0.07), 0, 6.3); c.fill();
      c.globalAlpha = 1;
    }
    const b = on(lv[3]);
    if (b && w > 7) { c.globalAlpha = b; c.fillStyle = '#fffaf0'; rrect(c, x + w + fw + 1.4, -(h * 0.72), 3.8, 4.4, 1); c.fill(); c.fillStyle = INK.text; c.font = `800 3.4px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(o.num || 1 + ((o.seed | 0) % 9)), x + w + fw + 3.3, -(h * 0.72) + 2.3); c.globalAlpha = 1; }
  });
}

/**
 * A striped awning over a window or door, standing out from the wall: stripes of colours c1 and c2, a scalloped valance and a soft shadow under it on the wall. f is the wall's face polygon, side 'L' or 'R'; u0..u1 are shares of the
 * wall's width, vTop and vBot shares of its height; `out` how far it stands out in tiles.
 */
export function awning(ctx, f, side, u0, u1, vTop, vBot, c1, c2, n = 6, out = 0.34, lv = ALL_IN, S = 'l') {
  const fp = (u, v) => [f[0][0] + (f[1][0] - f[0][0]) * u + (f[3][0] - f[0][0]) * v, f[0][1] + (f[1][1] - f[0][1]) * u + (f[3][1] - f[0][1]) * v];
  const dx = side === 'R' ? 32 * out : -32 * out, dy = 16 * out;
  const top = (u) => fp(u, vTop), low = (u) => { const q = fp(u, vBot); return [q[0] + dx, q[1] + dy]; };
  // the shadow it throws on the wall below
  const sa = fp(u0, vBot), sb = fp(u1, vBot), drop = Math.abs(f[3][1] - f[0][1]) * 0.1 + 5;
  ctx.fillStyle = rgbaOf('#4a3f88', 0.2); ctx.beginPath(); ctx.moveTo(sa[0], sa[1]); ctx.lineTo(sb[0], sb[1]); ctx.lineTo(sb[0], sb[1] + drop); ctx.lineTo(sa[0], sa[1] + drop); ctx.closePath(); ctx.fill();
  for (let i = 0; i < n; i++) {
    const a = u0 + ((u1 - u0) * i) / n, b = u0 + ((u1 - u0) * (i + 1)) / n, col = tone(i % 2 ? c2 : c1)[S];
    const q = [top(a), top(b), low(b), low(a)]; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let k = 1; k < 4; k++) ctx.lineTo(q[k][0], q[k][1]); ctx.closePath(); ctx.fill();
  }
  // the valance: a scallop hanging from the lower edge, one round tab to a stripe
  const v = 3.4;
  for (let i = 0; i < n; i++) {
    const a = low(u0 + ((u1 - u0) * i) / n), b = low(u0 + ((u1 - u0) * (i + 1)) / n), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    ctx.fillStyle = tone(i % 2 ? c2 : c1)[S]; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.quadraticCurveTo(b[0] - (b[0] - a[0]) * 0.02, b[1] + v * 1.25, mx, my + v); ctx.quadraticCurveTo(a[0] + (b[0] - a[0]) * 0.02, a[1] + v * 1.25, a[0], a[1]); ctx.closePath(); ctx.fill();
  }
  const hi = on(lv[2]);
  if (hi) { ctx.globalAlpha = hi; ctx.strokeStyle = rgbaOf('#ffffff', 0.5); ctx.lineWidth = 1.6; ctx.lineCap = 'round'; const a = top(u0), b = top(u1); ctx.beginPath(); ctx.moveTo(a[0], a[1] + 0.8); ctx.lineTo(b[0], b[1] + 0.8); ctx.stroke(); ctx.globalAlpha = 1; }
}

/** Letters standing out of a plank: a rounded plank in `col` on the wall, with the text in `ink` over a darker offset copy (the raised lettering). x is the plank's centre along the wall, up the height of its centre. */
export function plank(ctx, wl, text, o) {
  const { x, up, font = 9, S = 'l', col = '#9c6238', ink = '#fff4de', lv = ALL_IN } = o, w = o.w || Math.max(14, text.length * font * 0.66 + 8), h = font * 1.5;
  onWall(ctx, wl, (c) => {
    c.fillStyle = rgbaOf('#4a3f88', 0.25); rrect(c, x - w / 2 + 0.8, -up - h / 2 + 1.6, w, h, h * 0.3); c.fill();
    c.fillStyle = tone(col)[S]; rrect(c, x - w / 2, -up - h / 2, w, h, h * 0.3); c.fill();
    c.fillStyle = rgbaOf(rampOf(col).hi, 0.5); rrect(c, x - w / 2 + 1.2, -up - h / 2 + 1, w - 2.4, Math.max(1.6, h * 0.16), 1); c.fill();
    c.font = `800 ${font}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (on(lv[2])) { c.globalAlpha = lv[2]; c.fillStyle = rgbaOf(rampOf(col).deep, 0.6); c.fillText(text, x + 0.7, -up + 0.8 + font * 0.04); c.globalAlpha = 1; }
    c.fillStyle = S === 'r' ? mix(ink, '#9a90c8', 0.3) : ink; c.fillText(text, x, -up + font * 0.04);
  });
}

// ---------------------------------------------------------------- roofs
/**
 * A roof over the footprint [gx, gx + w] x [gy, gy + d] whose walls end at height z. kind 'gable' | 'hip'; the ridge runs along the longer side (axis 'x' along gx, 'y' along gy) unless o.axis says. Eaves overhang
 * by o.e tiles and drop with the slope; both visible slopes are drawn (a low roof shows its back slope above the ridge), courses of tiles on them as bands (more at near, scalloped shingles at close), a fascia board
 * under every eave and along every rake, a ridge cap. Returns { axis, rise, ridge: [[x, y], [x, y]] (screen), at(u, v, zz) -> screen point }.
 */
export function roof(ctx, p, z, o) {
  const { gx, gy, w, d } = p, kind = o.kind || 'gable', lv = o.lv || ALL_IN, axis = o.axis || (d > w * 1.2 ? 'y' : 'x');
  const len = axis === 'x' ? w : d, span = axis === 'x' ? d : w, e = o.e ?? 0.14, rise = o.rise ?? clamp(span * 4.6 + 2, 8, 20);
  const col = o.col, T = tone(col), R = rampOf(col), slope = rise / (span / 2), eaveZ = z - slope * e * (kind === 'hip' ? 1 : 1);
  // local (u along the ridge, v across: 0 back .. span front) to the screen
  const G = (u, v, zz) => (axis === 'x' ? P(gx + u, gy + v, zz) : P(gx + v, gy + u, zz));
  const ridge = kind === 'hip' ? [G(span / 2, span / 2, z + rise), G(len - span / 2, span / 2, z + rise)] : [G(-e, span / 2, z + rise), G(len + e, span / 2, z + rise)];
  const front = axis === 'x' ? T.l : mix(T.r, T.l, 0.2), backC = mix(T.l, T.t, 0.3), endC = axis === 'x' ? mix(T.r, T.l, 0.2) : T.l;
  const eF0 = G(-e, span + e, eaveZ), eF1 = G(len + e, span + e, eaveZ), eB0 = G(-e, -e, eaveZ), eB1 = G(len + e, -e, eaveZ);
  const wallC = tone(o.wall || '#fff0d4'), th = 3;
  const eaveShadow = () => {};
  const poly = (pts, fill) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  const planeDetail = (pts, base, tilt) => { // courses of tiles as bands from eave to ridge on a plane [eaveA, eaveB, ridgeB, ridgeA]
    const [a, b, c, dd] = pts, hgt = Math.hypot((dd[0] + c[0]) / 2 - (a[0] + b[0]) / 2, (dd[1] + c[1]) / 2 - (a[1] + b[1]) / 2), n = clamp(Math.round(hgt / 4.6), 3, 14);
    const lerp2 = (p0, p1, t) => [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
    ctx.fillStyle = rgbaOf(tilt, 0.2);
    for (let k = 1; k < n; k += 2) { const t0 = k / n, t1 = Math.min(1, (k + 0.62) / n), p0 = lerp2(a, dd, t0), p1 = lerp2(b, c, t0), p2 = lerp2(b, c, t1), p3 = lerp2(a, dd, t1); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = rgbaOf(R.deep, 0.16);
    for (let k = 1; k < n; k++) { const t0 = k / n, p0 = lerp2(a, dd, t0), p1 = lerp2(b, c, t0); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p1[0], p1[1] + 1.3); ctx.lineTo(p0[0], p0[1] + 1.3); ctx.closePath(); ctx.fill(); }
    const cl = on(lv[3]);
    if (cl && hgt > 12) { // individual shingles: a staggered row of rounded tabs along each course
      ctx.save(); ctx.globalAlpha = cl; onPlane(ctx, a, [b[0] - a[0], b[1] - a[1]], [dd[0] - a[0], dd[1] - a[1]], (g, lu, lvv) => {
        const tw = 7.5, rowH = lvv / n; g.fillStyle = rgbaOf(R.hi, 0.22); g.beginPath();
        for (let k = 0; k < n; k++) for (let x = (k % 2) * tw * 0.5; x < lu; x += tw) { g.moveTo(x + 0.8, k * rowH + 1.2); g.lineTo(x + tw - 0.8, k * rowH + 1.2); g.lineTo(x + tw - 0.8, k * rowH + rowH * 0.55); g.quadraticCurveTo(x + tw / 2, k * rowH + rowH * 0.95, x + 0.8, k * rowH + rowH * 0.55); g.closePath(); }
        g.fill(); g.fillStyle = rgbaOf(R.deep, 0.2); g.beginPath();
        for (let k = 0; k < n; k++) for (let x = (k % 2) * tw * 0.5; x < lu; x += tw) { g.rect(x + tw - 0.9, k * rowH + 1.5, 1, rowH * 0.7); }
        g.fill();
      }); ctx.restore();
    }
  };
  // ---- the planes
  if (kind === 'gable') {
    const g0 = G(len, 0, z), g1 = G(len, span, z), gt = G(len, span / 2, z + rise); // the gable end wall (the +u end), under the overhang
    poly([eB0, eB1, ridge[1], ridge[0]], backC); planeDetail([eB0, eB1, ridge[1], ridge[0]], backC, R.shade);
    poly([g0, g1, gt], axis === 'x' ? wallC.r : wallC.l);
    poly([eF0, eF1, ridge[1], ridge[0]], front); planeDetail([eF0, eF1, ridge[1], ridge[0]], front, R.deep);
    // fascia boards: under the front eave, and along the +u rakes of both slopes
    const fas = mix(R.shade, R.mid, 0.3), fasL = mix(R.light, '#ffffff', 0.2);
    ctx.fillStyle = axis === 'x' ? mix(R.shade, R.mid, 0.3) : mix(R.shade, R.deep, 0.3); ctx.beginPath(); ctx.moveTo(eF0[0], eF0[1]); ctx.lineTo(eF1[0], eF1[1]); ctx.lineTo(eF1[0], eF1[1] + th); ctx.lineTo(eF0[0], eF0[1] + th); ctx.closePath(); ctx.fill();
    ctx.fillStyle = fasL; ctx.beginPath(); ctx.moveTo(eF1[0], eF1[1]); ctx.lineTo(ridge[1][0], ridge[1][1]); ctx.lineTo(ridge[1][0], ridge[1][1] + th); ctx.lineTo(eF1[0], eF1[1] + th); ctx.closePath(); ctx.fill();
    ctx.fillStyle = fas; ctx.beginPath(); ctx.moveTo(eB1[0], eB1[1]); ctx.lineTo(ridge[1][0], ridge[1][1]); ctx.lineTo(ridge[1][0], ridge[1][1] + th * 0.7); ctx.lineTo(eB1[0], eB1[1] + th * 0.7); ctx.closePath(); ctx.fill();
  } else { // hip: back slope, the +u end slope, the front slope, meeting at hips
    const m = span / 2, e0 = G(len + e, span + e, eaveZ), e1 = G(len + e, -e, eaveZ);
    poly([eB0, eB1, ridge[1], ridge[0]], backC);
    poly([eF0, eB0, ridge[0]], mix(T.l, T.t, 0.22)); // the end that faces away from the sun side is still seen from above
    poly([eF1, e1, ridge[1]], endC); planeDetail([eF1, e1, ridge[1], ridge[1]], endC, R.deep);
    poly([eF0, eF1, ridge[1], ridge[0]], front); planeDetail([eF0, eF1, ridge[1], ridge[0]], front, R.deep);
    // hips: a rounded cap along the front-right hip
    ctx.strokeStyle = mix(R.light, '#ffffff', 0.2); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(eF1[0], eF1[1]); ctx.lineTo(ridge[1][0], ridge[1][1]); ctx.stroke();
    ctx.fillStyle = axis === 'x' ? R.shade : mix(R.shade, R.deep, 0.5); ctx.beginPath(); ctx.moveTo(eF0[0], eF0[1]); ctx.lineTo(eF1[0], eF1[1]); ctx.lineTo(e0[0], e0[1] + 0); ctx.lineTo(eF1[0], eF1[1] + th); ctx.lineTo(eF0[0], eF0[1] + th); ctx.closePath(); ctx.fill();
    void m;
  }
  // ridge cap
  ctx.lineCap = 'round'; ctx.strokeStyle = R.light; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(ridge[0][0], ridge[0][1]); ctx.lineTo(ridge[1][0], ridge[1][1]); ctx.stroke();
  ctx.strokeStyle = rgbaOf('#ffffff', 0.55); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ridge[0][0], ridge[0][1] - 0.9); ctx.lineTo(ridge[1][0], ridge[1][1] - 0.9); ctx.stroke();
  if (on(lv[2])) { ctx.globalAlpha = lv[2]; ctx.strokeStyle = rgbaOf('#fffbe6', 0.45); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(eF0[0], eF0[1] - 0.6); ctx.lineTo(eF1[0], eF1[1] - 0.6); ctx.stroke(); ctx.globalAlpha = 1; } // the sun on the lip of the front eave
  return { axis, rise, ridge, len, span, at: (u, v, zz) => G(u, v, zz), G, eaveZ };
}

/** A flat roof: a slab with a rounded rim over the footprint, with its own colour, a parapet ring, and the top face lit. Returns nothing; the caller adds roof furniture on it. */
export function flatRoof(ctx, p, z, o) {
  const { gx, gy, w, d } = p, e = o.e ?? 0.1, th = o.th ?? 4.5, f = toyBox(ctx, gx - e, gy - e, w + 2 * e, d + 2 * e, th, o.col, { z, r: Math.min(5, th * 1.1 + 1), contour: o.contour || 0, gloss: 0.8 });
  const lv = o.lv || ALL_IN, R = rampOf(o.col), T = tone(o.col);
  // an inner sunken panel: the roof deck inside the parapet
  const m = 0.26, z1 = z + th, q = [P(gx + m, gy + m, z1), P(gx + w - m, gy + m, z1), P(gx + w - m, gy + d - m, z1), P(gx + m, gy + d - m, z1)];
  ctx.fillStyle = o.deck || mix(T.t, R.light, 0.45); ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgbaOf(R.shade, 0.35); ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); ctx.lineTo(q[1][0], q[1][1]); ctx.lineTo(q[1][0] - 3, q[1][1] + 2); ctx.lineTo(q[0][0] + 3, q[0][1] + 2); ctx.closePath(); ctx.fill(); // the parapet's shadow on the deck
  ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); ctx.lineTo(q[3][0], q[3][1]); ctx.lineTo(q[3][0] + 3, q[3][1] - 2); ctx.lineTo(q[0][0] + 3, q[0][1] - 2); ctx.closePath(); ctx.fill();
  void lv; return { f, z: z1 };
}

/** A strip of width `th` along the screen line a-b (a lit lip, a fascia): a filled quad, never a hairline. */
export function lip(ctx, a, b, th, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(a[0], a[1] - th / 2); ctx.lineTo(b[0], b[1] - th / 2); ctx.lineTo(b[0], b[1] + th / 2); ctx.lineTo(a[0], a[1] + th / 2); ctx.closePath(); ctx.fill(); }

/** A chimney: a small brick toy with a cap slab. Returns the screen point of its mouth (where the smoke starts). */
export function chimney(ctx, gx, gy, z, h, o = {}) {
  const w = o.w ?? 0.3, col = o.col || BRICK.mid;
  toyBox(ctx, gx, gy, w, w, h, col, { z, r: 2.4, ao: false, gloss: 0.6, contour: o.contour || 0 });
  toyBox(ctx, gx - 0.04, gy - 0.04, w + 0.08, w + 0.08, 3, mix(col, '#fff0d4', 0.35), { z: z + h, r: 1.6, ao: false, edge: false, gloss: 0.6 });
  const [x, y] = P(gx + w / 2, gy + w / 2, z + h + 3); ctx.fillStyle = rgbaOf(rampOf(col).deep, 0.85); ctx.beginPath(); ctx.ellipse(x, y, w * 17, w * 8, 0, 0, 6.3); ctx.fill();
  return [x, y];
}

/** A soft grounding patch under a building: a cream paver apron round its footprint with rounded corners, and the lit stage edge. */
export function apron(ctx, gx, gy, w, d, m, col, a = 0.7) {
  const pts = [P(gx - m, gy - m), P(gx + w + m, gy - m), P(gx + w + m, gy + d + m), P(gx - m, gy + d + m)], r = 7;
  ctx.save(); ctx.globalAlpha *= a; ctx.beginPath();
  for (let i = 0; i < 4; i++) { const p0 = pts[(i + 3) % 4], p1 = pts[i], p2 = pts[(i + 1) % 4], l0 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]), l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), t0 = Math.min(r, l0 / 2) / l0, t2 = Math.min(r, l2 / 2) / l2; const s = [p1[0] + (p0[0] - p1[0]) * t0, p1[1] + (p0[1] - p1[1]) * t0], q = [p1[0] + (p2[0] - p1[0]) * t2, p1[1] + (p2[1] - p1[1]) * t2]; if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); ctx.quadraticCurveTo(p1[0], p1[1], q[0], q[1]); }
  ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.restore();
}
export const LITE = Object.freeze([1, 0, 0, 0]);
/** The detail alphas for this build: none of the near and close marks when the quality governor or the island view says lite. */
export const detailFor = (ctx, env) => (env.lite || env.far ? LITE : detailOf(ctx, env));
export const zoomOf = (ctx, env) => (env.lod && env.lod.zoom) || (() => { try { return ctx.getTransform().a / Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 2); } catch { return 1; } })();
/** The width of the tone-on-tone contour in world pixels: 1.2 screen pixels at the middle zoom, 1.6 near and 2 close, never under 0.8 or over 3 world pixels. */
export const contourW = (z, lv) => clamp((1.2 + 0.4 * lv[2] + 0.4 * lv[3]) / Math.max(z, 0.1), 0.8, 3);
export const lightOf = (env) => ({ night: env.night || 0, dusk: env.dusk || 0 });

// ---------------------------------------------------------------- style: what a prop wears
export function styleOf(p, env) {
  const th = p.th || (DIST[p.zone] && DIST[p.zone].theme), row = themeRow(th), C = (c) => tintC(c, env);
  const S = {
    th, wall: C(p.col || row.wall), trim: C(p.trim || row.trim), roof: C(p.roofCol || row.roof), acc: C(p.accent || row.acc), acc2: C(row.acc2), shutter: p.shutter === undefined ? (row.shutter ? C(row.shutter) : null) : p.shutter && C(p.shutter),
    curtain: C(row.curtain), plank: C(row.plank), door: C(row.door), ink: row.ink, boxes: !!row.boxes, mat: p.mat || (p.glass ? 'glass' : 'plaster'), neon: p.neon || null,
  };
  S.C = C; return S;
}

export const fp = (f, u, v) => { const bx = f[0][0] + (f[1][0] - f[0][0]) * u, by = f[0][1] + (f[1][1] - f[0][1]) * u, tx = f[3][0] + (f[2][0] - f[3][0]) * u, ty = f[3][1] + (f[2][1] - f[3][1]) * u; return [bx + (tx - bx) * v, by + (ty - by) * v]; };
/** Warm light spilling from lit windows at night: one soft light on the wall, as strong as the evening is deep. */
export function windowGlow(env, p, face, scale = 1) {
  if (!env.lights || env.night < 0.3 || env.lite || env.far) return;
  const [x, y] = fp(face, 0.5, 0.5);
  env.lights.push({ wx: x, wy: y - env.zoff, r: clamp((p.w * 14 + 16) * scale, 28, 62), c: '255,208,130', a: 0.2 * env.night });
}

/** The ground a building stands on and the shadow it throws: a paver apron round the footprint, the cast shadow (h is the height the shadow is cast from: the walls and a share of the roof), a thin contact ring. */
export function stage(ctx, p, env, h, o = {}) {
  const { gx, gy, w, d } = p, C = (c) => tintC(c, env);
  apron(ctx, gx, gy, w, d, o.m ?? 0.22, C(PAVE.cream), o.a ?? 0.6);
  castShadow(ctx, gx, gy, w, d, h, lightOf(env), 0);
  apron(ctx, gx, gy, w, d, 0.08, LIGHT.contact, 0.14);
}

// ---------------------------------------------------------------- stone: columns, pediments, round doors
/** A row of round columns on a wall (the elevation of a cylinder: light on the left, a bright streak, the shade on the right), each with a capital and a base. o: { n, x0, x1, base, top (heights up the wall), cw (column width), col (stone), S, lv }. */
export function columns(ctx, wl, o) {
  const { n, x0, x1, base, top, cw = 5.4, S = 'l', lv = ALL_IN } = o, T = tone(o.col)[S], R = rampOf(o.col);
  onWall(ctx, wl, (c) => {
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? (x0 + x1) / 2 - cw / 2 : x0 + ((x1 - x0 - cw) * i) / (n - 1);
      const g = c.createLinearGradient(x, 0, x + cw, 0); g.addColorStop(0, mix(T, R.hi, 0.35)); g.addColorStop(0.3, mix(T, '#ffffff', 0.45)); g.addColorStop(0.62, T); g.addColorStop(1, S === 'r' ? tone(o.col).r : mix(T, R.shade, 0.65));
      c.fillStyle = rgbaOf('#4a3f88', 0.22); rrect(c, x + 1.3, -top, cw, top - base, cw * 0.4); c.fill(); // the shadow it casts on the wall behind
      c.fillStyle = g; rrect(c, x, -top + 2, cw, top - base - 3.6, 1.2); c.fill();
      c.fillStyle = mix(T, R.hi, 0.3); rrect(c, x - 1.3, -top, cw + 2.6, 3, 1.2); c.fill();      // capital
      rrect(c, x - 1.3, -base - 3, cw + 2.6, 3.2, 1.2); c.fill();                                // base
      if (on(lv[3])) { c.globalAlpha = lv[3]; c.fillStyle = rgbaOf(R.shade, 0.3); for (let k = 1; k < 3; k++) c.fillRect(x + (cw * k) / 3 - 0.4, -top + 4, 0.9, top - base - 8); c.globalAlpha = 1; } // flutes
    }
  });
}
/** A triangular pediment on a wall, standing above height `base` over the span x0..x1: a raised rim, a recessed tympanum and an emblem (a gold coin) in it. */
export function pediment(ctx, wl, o) {
  const { x0, x1, base, ph = 14, S = 'l', lv = ALL_IN } = o, T = tone(o.col)[S], R = rampOf(o.col), xm = (x0 + x1) / 2, rim = 3.2;
  onWall(ctx, wl, (c) => {
    c.fillStyle = rgbaOf('#4a3f88', 0.2); c.beginPath(); c.moveTo(x0 + 1.5, -base + 2.5); c.lineTo(x1 + 1.5, -base + 2.5); c.lineTo(xm + 1.5, -base - ph + 2.5); c.closePath(); c.fill();
    c.fillStyle = mix(T, S === 'r' ? '#8a80c0' : '#ffffff', 0.18); c.beginPath(); c.moveTo(x0, -base); c.lineTo(x1, -base); c.lineTo(xm, -base - ph); c.closePath(); c.fill();
    const ix = rim * 1.8; c.fillStyle = mix(T, R.shade, 0.35); c.beginPath(); c.moveTo(x0 + ix, -base - 0.2); c.lineTo(x1 - ix, -base - 0.2); c.lineTo(xm, -base - ph + rim * 1.5); c.closePath(); c.fill();
    c.strokeStyle = rgbaOf('#ffffff', S === 'r' ? 0.3 : 0.6); c.lineWidth = 1.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0 + 0.8, -base - 0.8); c.lineTo(xm, -base - ph + 0.8); c.stroke();
    const gold = o.gold || '#f6c94f', cy = -base - ph * 0.36, r = Math.max(3, ph * 0.22);
    c.fillStyle = tone(gold)[S]; c.beginPath(); c.arc(xm, cy, r, 0, 6.3); c.fill(); c.fillStyle = mix(gold, '#fff7dc', 0.5); c.beginPath(); c.arc(xm - r * 0.2, cy - r * 0.2, r * 0.5, 0, 6.3); c.fill();
    if (on(lv[2])) { c.globalAlpha = lv[2]; c.strokeStyle = tone(gold)[S]; c.lineWidth = 1.5; c.lineCap = 'round'; c.beginPath(); for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; c.moveTo(xm + Math.cos(a) * r * 1.35, cy + Math.sin(a) * r * 1.35); c.lineTo(xm + Math.cos(a) * r * 1.9, cy + Math.sin(a) * r * 1.9); } c.stroke(); c.globalAlpha = 1; }
  });
}
/** A round door (a vault) on a wall: steel disc, a bolt ring and a gold wheel with spokes. x is its centre along the wall, up the height of its centre. */
export function vaultDoor(ctx, wl, o) {
  const { x, up, r = 11, S = 'l', lv = ALL_IN } = o, steel = tone('#b2bed8')[S], gold = tone('#f6c94f')[S];
  onWall(ctx, wl, (c) => {
    c.fillStyle = rgbaOf('#4a3f88', 0.3); c.beginPath(); c.arc(x + 1.2, -up + 1.4, r + 2.4, 0, 6.3); c.fill();
    c.fillStyle = tone('#8392b4')[S]; c.beginPath(); c.arc(x, -up, r + 2.4, 0, 6.3); c.fill();
    c.fillStyle = steel; c.beginPath(); c.arc(x, -up, r, 0, 6.3); c.fill();
    c.fillStyle = rgbaOf('#ffffff', 0.4); c.beginPath(); c.arc(x - r * 0.25, -up - r * 0.28, r * 0.6, 0, 6.3); c.fill();
    c.strokeStyle = gold; c.lineWidth = Math.max(1.8, r * 0.16); c.lineCap = 'round'; c.beginPath(); c.arc(x, -up, r * 0.55, 0, 6.3); c.stroke();
    c.beginPath(); for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2 + 0.4; c.moveTo(x, -up); c.lineTo(x + Math.cos(a) * r * 0.9, -up + Math.sin(a) * r * 0.9); } c.stroke();
    c.fillStyle = gold; c.beginPath(); c.arc(x, -up, r * 0.2, 0, 6.3); c.fill();
    if (on(lv[2])) { c.globalAlpha = lv[2]; c.fillStyle = tone('#8392b4')[S]; for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.86, -up + Math.sin(a) * r * 0.86, 1, 0, 6.3); c.fill(); } c.globalAlpha = 1; }
  });
}
/** A dome: a half sphere on a drum, shaded across (light left, shade right) with a bright crescent and a lantern on top. Drawn in screen space at (x, y) = the centre of its base. */
export function dome(ctx, x, y, rx, ry, col, o = {}) {
  const T = tone(col), g = ctx.createLinearGradient(x - rx, 0, x + rx, 0); g.addColorStop(0, mix(T.l, '#ffffff', 0.25)); g.addColorStop(0.35, T.l); g.addColorStop(0.75, T.r); g.addColorStop(1, mix(T.r, '#4a3f88', 0.2));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, Math.PI, 0); ctx.lineTo(x + rx, y + (o.drum ?? 3)); ctx.ellipse(x, y + (o.drum ?? 3), rx, ry * 0.42, 0, 0, Math.PI); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgbaOf('#ffffff', 0.42); ctx.beginPath(); ctx.ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.3, ry * 0.38, -0.5, 0, 6.3); ctx.fill();
  if (o.lantern !== false) { ctx.fillStyle = T.l; rrect(ctx, x - rx * 0.12, y - ry - 6, rx * 0.24, 7, 2); ctx.fill(); ctx.fillStyle = mix(col, '#fff7dc', 0.5); ctx.beginPath(); ctx.arc(x, y - ry - 7, rx * 0.16, 0, 6.3); ctx.fill(); }
}
/** A pennant on a pole standing at the screen point (x, y): a round pole and a small swallow-tailed flag (still: the rest pose). */
export function pennant(ctx, x, y, h, col, S = 'l') {
  ctx.strokeStyle = tone('#fffaf0')[S]; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.stroke();
  ctx.fillStyle = tone(col)[S]; ctx.beginPath(); ctx.moveTo(x + 0.6, y - h); ctx.lineTo(x + 8.5, y - h + 1.6); ctx.lineTo(x + 6.4, y - h + 4); ctx.lineTo(x + 8.5, y - h + 6.4); ctx.lineTo(x + 0.6, y - h + 6.4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = mix(col, '#ffffff', 0.5); ctx.beginPath(); ctx.arc(x, y - h - 0.6, 1.5, 0, 6.3); ctx.fill();
}

// ---------------------------------------------------------------- cylinders, round smoke
/**
 * An upright cylinder of body colour `col` standing on the screen point (x, y) (the centre of its foot), radius rx across and `h` high: shaded across like a cylinder (light on the left, a bright streak, the shade on the right),
 * an elliptical lid with a lit rim, bands (o.bands: [[from, to, colour]] in heights) and a rounded foot ring. The thinnest it draws is 6 pixels across.
 */
export function tank(ctx, x, y, rx, h, col, o = {}) {
  rx = Math.max(3, rx); const ry = rx * 0.5, T = tone(col), R = rampOf(col), y1 = y - h;
  const g = ctx.createLinearGradient(x - rx, 0, x + rx, 0); g.addColorStop(0, mix(T.l, '#ffffff', 0.2)); g.addColorStop(0.22, mix(T.l, '#ffffff', 0.35)); g.addColorStop(0.5, T.l); g.addColorStop(0.8, T.r); g.addColorStop(1, mix(T.r, '#4a3f88', 0.25));
  ctx.beginPath(); ctx.moveTo(x - rx, y); ctx.lineTo(x - rx, y1); ctx.ellipse(x, y1, rx, ry, 0, Math.PI, 0, true); ctx.lineTo(x + rx, y); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI, false); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
  if (o.bands) for (const [a, b, bc] of o.bands) { const g2 = ctx.createLinearGradient(x - rx, 0, x + rx, 0), B = tone(bc); g2.addColorStop(0, mix(B.l, '#ffffff', 0.2)); g2.addColorStop(0.3, B.l); g2.addColorStop(0.8, B.r); g2.addColorStop(1, mix(B.r, '#4a3f88', 0.25)); ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(x - rx, y - a); ctx.ellipse(x, y - a, rx, ry, 0, Math.PI, 0, true); ctx.lineTo(x + rx, y - b); ctx.ellipse(x, y - b, rx, ry, 0, 0, Math.PI, false); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = rgbaOf('#4a3f88', 0.22); ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI); ctx.ellipse(x, y - 2.4, rx, ry, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill(); // the foot ring
  ctx.fillStyle = o.lid ? tone(o.lid).t : T.t; ctx.beginPath(); ctx.ellipse(x, y1, rx, ry, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = rgbaOf(R.deep, 0.5); ctx.beginPath(); ctx.ellipse(x, y1, rx * 0.72, ry * 0.72, 0, 0, 6.3); ctx.fill(); ctx.fillStyle = o.lid ? tone(o.lid).t : mix(T.t, R.hi, 0.2); ctx.beginPath(); ctx.ellipse(x, y1 - 0.5, rx * 0.66, ry * 0.64, 0, 0, 6.3); ctx.fill();
  ctx.strokeStyle = rgbaOf('#ffffff', 0.55); ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.ellipse(x, y1, rx - 0.5, ry - 0.3, 0, Math.PI * 0.95, Math.PI * 1.6); ctx.stroke();
}
/** Round cartoon smoke: `n` puffs rising from (x, y), each a soft white disc with a lilac belly, bigger and fainter as it climbs; t is the visual clock (0: a rest pose with the puffs spread out). */
export function puffs(ctx, x, y, t, n = 3, drift = 7, rise = 30) {
  for (let i = 0; i < n; i++) {
    const k = ((t / 3400 + i / n + (t ? 0 : 0.12)) % 1), r = 3 + k * 6.5, px = x + Math.sin(k * 4 + i * 2) * 2.4 + k * drift, py = y - 3 - k * rise;
    ctx.fillStyle = `rgba(255,255,255,${0.82 * (1 - k)})`; ctx.beginPath(); ctx.arc(px, py, r, 0, 6.3); ctx.fill();
    ctx.fillStyle = `rgba(184,196,240,${0.5 * (1 - k)})`; ctx.beginPath(); ctx.arc(px + r * 0.2, py + r * 0.28, r * 0.74, 0, 6.3); ctx.fill();
  }
}
export { wallOf, onWall, toyBox, toyTone, rampOf, contourOf, toHsl, fromHsl, shade, h2, mix, clamp, P, SKY, LIGHT };
