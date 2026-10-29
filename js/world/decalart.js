// The ground decals of a district's kit (lawns, cobbles, bays, crops, circuit traces, the harbor basin) in the toy language: filled shapes only, soft corners, every band at least 0.12 tile wide, daylight colours.
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md). The kits (T3's, kits.js) still name their colours in the old dark hexes and rgba strings; this module reads them by INTERPRETATION (the plan's way):
// a dark colour is lifted towards the warm cream of the pavements until it reads in daylight, `grid` hairlines become pavers, `spk` specks become round pebbles, and `water` is drawn from the sea's own ramp.
import { mix, rgb, luma, hex, clamp, gray } from './iso.js';
import { PAVE, SEA, LIGHT, CLOUD, seaRamp } from './palette.js';
import { VEIL } from './terrainfield.js';

const HW = 32, HH = 16;
const WARM = mix(CLOUD.veil, '#fff0d4', 0.5), VEILM = new Map();
/**
 * The veil over a colour under cloud, the ground's own (the palette's `veiled` is T2's and cold: it takes a colour 45% to its grey and 22% to a lilac-white, and a locked district read as grey-lavender mud). This one
 * takes it 30% to its grey and 20% to a warm cream-lilac, `k` is the share of the veil (0 to 1), so a locked district keeps its own colour, asleep, and the ground, the blocks and the terrain field wear one veil.
 */
export function warmVeil(c, k) {
  if (!(k > 0.01)) return c; const kk = Math.round(clamp(k, 0, 1) * 50) / 50; let m = VEILM.get(c); if (!m) { if (VEILM.size > 2000) VEILM.clear(); m = new Map(); VEILM.set(c, m); }
  let v = m.get(kk); if (v === undefined) { v = mix(mix(c, gray(c), 0.3 * kk), WARM, 0.2 * kk); if (m.size > 48) m.clear(); m.set(kk, v); } return v;
}
const px = (gx, gy) => (gx - gy) * HW, py = (gx, gy, z) => (gx + gy) * HH - z;
const MEMO = new Map();
/** A kit's colour string (#rrggbb or rgba(r,g,b,a)) read for daylight: dark colours are lifted towards cream, and a district under cloud (k) is veiled. Answers a CSS colour string. */
export function tone(c, k = 0) {
  if (!c) return null;
  const key = c + '|' + k; let v = MEMO.get(key); if (v) return v;
  let r, g, b, a = 1;
  if (c[0] === '#') { const q = rgb(c); r = q[0]; g = q[1]; b = q[2]; } else { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return c; const p = m[1].split(',').map(Number); r = p[0]; g = p[1]; b = p[2]; a = p.length > 3 ? p[3] : 1; }
  let h = hex(r, g, b); const l = luma(h); if (l < 0.58) h = mix(h, PAVE.cream, clamp((0.58 - l) * 1.7, 0, 0.85));
  if (k) h = warmVeil(h, k * VEIL);
  v = a < 1 ? `rgba(${rgb(h).join(',')},${a})` : h; if (MEMO.size > 600) MEMO.clear(); MEMO.set(key, v); return v;
}
const MINB = 0.12, NEON = 0.26;
/** What an `ell` decal of the kits is meant to be, from its colour: a puddle (blue-green), a stain of dirt (dark) or anything else (kept as it was drawn). */
export function ellKind(fill) {
  const m = typeof fill === 'string' && fill.match(/rgba?\(([^)]+)\)/); if (!m) return 'other';
  const [r, g, b] = m[1].split(',').map(Number); if (b > r + 25 && b >= g - 20) return 'puddle'; return (0.3 * r + 0.59 * g + 0.11 * b) / 255 < 0.35 ? 'dirt' : 'other';
}
const hashI = (x, y, i, j) => { let h = Math.imul((i * 7349 + ((x * 31) | 0)) | 0, 374761393) ^ Math.imul((j * 5651 + ((y * 17) | 0)) | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const quad = (ctx, x, y, w, d, z) => { ctx.moveTo(px(x, y), py(x, y, z)); ctx.lineTo(px(x + w, y), py(x + w, y, z)); ctx.lineTo(px(x + w, y + d), py(x + w, y + d, z)); ctx.lineTo(px(x, y + d), py(x, y + d, z)); ctx.closePath(); };
function rrect(ctx, x, y, w, d, r, z) {
  r = Math.min(r, w / 2, d / 2); ctx.moveTo(px(x + r, y), py(x + r, y, z));
  const arc = (cx, cy, a0) => { for (let i = 0; i <= 4; i++) { const a = a0 + (i / 4) * (Math.PI / 2), gx = cx + Math.cos(a) * r, gy = cy + Math.sin(a) * r; ctx.lineTo(px(gx, gy), py(gx, gy, z)); } };
  arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + d - r, 0); arc(x + r, y + d - r, Math.PI / 2); arc(x + r, y + r, Math.PI); ctx.closePath();
}
const disc = (ctx, gx, gy, z, rx, ry) => { ctx.moveTo(px(gx, gy) + rx, py(gx, gy, z)); ctx.ellipse(px(gx, gy), py(gx, gy, z), rx, ry, 0, 0, 6.2832); };

/**
 * One decal of a district, into a ground chunk: `d` is the kit's record, `z` the district's height, `k` its veil, `S` its daylight set and `detail` the level-of-detail alphas ([1, mid, near, close]).
 * Moving decals (`pulse`, the live part of `water`) are not drawn here: they are the live layer's.
 */
export function decalV2(ctx, d, z, k, S, detail) {
  if (d.k === 'pulse') return;
  const { x, y, w, d: dd } = d;
  switch (d.k) {
    case 'rect': {
      const f = tone(d.fill, k); if (!f) break;
      const thin = Math.min(w, dd) < NEON && Math.max(w, dd) >= 8 && f[0] === '#'; // (a long opaque strip only: the short pen lines and the translucent ones keep their own width) a neon strip or a long painted line: never a hairline. A soft wide glow under a core of 0.26 tile (about 4 css pixels at the working zoom), both the strip's own colour
      if (thin) {
        const along = w >= dd, glow = NEON * 2.2, core = NEON; const cx = x + w / 2, cy = y + dd / 2;
        const gx = along ? x : cx - glow / 2, gy = along ? cy - glow / 2 : y, gw = along ? w : glow, gd = along ? glow : dd;
        ctx.globalAlpha = 0.2; ctx.fillStyle = f; ctx.beginPath(); rrect(ctx, gx, gy, gw, gd, glow / 2, z); ctx.fill();
        const qx = along ? x : cx - core / 2, qy = along ? cy - core / 2 : y, qw = along ? w : core, qd = along ? core : dd;
        ctx.globalAlpha = 1; ctx.beginPath(); rrect(ctx, qx, qy, qw, qd, core / 2, z); ctx.fill(); break;
      }
      const ww = Math.max(w, MINB), dh = Math.max(dd, MINB), xx = w < MINB ? x - (MINB - w) / 2 : x, yy = dd < MINB ? y - (MINB - dd) / 2 : y;
      ctx.fillStyle = f; ctx.beginPath(); rrect(ctx, xx, yy, ww, dh, 0.14, z); ctx.fill(); break;
    }
    case 'ell': { // a puddle or a stain: a soft blob with an irregular outline feathered in three steps (no rim), in a colour that says which (clear blue-green water with a glint of sky, or a patch of darker worn dirt), never a flat grey ellipse
      const r = d.r, rx = r * HW * 1.42, ry = r * HH * 1.42, kind = ellKind(d.fill), cx = px(x, y), cy = py(x, y, z), seed = Math.floor(x * 31 + y * 17);
      const blob = (sc) => { ctx.beginPath(); for (let i = 0; i <= 18; i++) { const a = (i / 18) * 6.2832, w = 1 + 0.13 * Math.sin(2 * a + seed) + 0.08 * Math.sin(3 * a + seed * 1.7), X = cx + Math.cos(a) * rx * w * sc, Y = cy + Math.sin(a) * ry * w * sc; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.closePath(); ctx.fill(); };
      if (kind === 'puddle') {
        ctx.fillStyle = tone(mix(SEA.lagoon, SEA.shoal, 0.55), k); ctx.globalAlpha = 0.34; blob(1.14); ctx.globalAlpha = 0.55; blob(0.94);   // the pool: a clear, pale water with the dirt showing through
        ctx.fillStyle = tone(mix(SEA.shoal, SEA.foam, 0.6), k); ctx.globalAlpha = 0.5; blob(0.62);                                         // its lighter heart
        ctx.fillStyle = SEA.foam; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.ellipse(cx - rx * 0.26, cy - ry * 0.3, rx * 0.3, ry * 0.13, -0.35, 0, 6.2832); ctx.fill(); // a glint of sky on the upper left
      } else if (kind === 'dirt') {
        const g = (S && S.ground) || '#f1cd8e'; ctx.fillStyle = tone(mix(g, '#8d5a30', 0.45), k); ctx.globalAlpha = 0.3; blob(1.14); ctx.globalAlpha = 0.45; blob(0.94);   // a patch of worn, darker dirt
        ctx.fillStyle = tone(mix(g, '#fff4d8', 0.25), k); ctx.globalAlpha = 0.4; blob(0.55);
      } else {
        const f = tone(d.fill, k); if (!f) break; ctx.fillStyle = f; ctx.globalAlpha = 0.34; blob(1.14); ctx.globalAlpha = 0.5; blob(0.94); ctx.globalAlpha = 0.45; blob(0.62);
      }
      ctx.globalAlpha = 1; break;
    }
    case 'stripes': {
      let n = d.n; const span = d.axis === 'x' ? dd : w; if (span / n < MINB) n = Math.max(1, Math.floor(span / MINB));
      for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, c = tone(i % 2 ? d.c2 : d.c1, k); if (!c) continue; ctx.fillStyle = c; ctx.beginPath(); if (d.axis === 'x') quad(ctx, x, y + dd * t0, w, dd * (t1 - t0) + 0.01, z); else quad(ctx, x + w * t0, y, w * (t1 - t0) + 0.01, dd, z); ctx.fill(); }
      break;
    }
    case 'checker': { // two tones laid as pavers: the second is a tint a little paler or darker, slab by slab, with a joint between, not a chessboard
      const c1 = tone(d.c1, k), c2 = tone(d.c2, k), s = d.step; if (c1) { ctx.fillStyle = c1; ctx.beginPath(); quad(ctx, x, y, w, dd, z); ctx.fill(); }
      if (c2) { ctx.fillStyle = c2; ctx.globalAlpha = 0.5; ctx.beginPath(); for (let i = 0; i * s < w - 0.01; i++) for (let j = 0; j * s < dd - 0.01; j++) if ((i + j) % 2) rrect(ctx, x + i * s + 0.05, y + j * s + 0.05, Math.min(s, w - i * s) - 0.1, Math.min(s, dd - j * s) - 0.1, 0.08, z); ctx.fill(); ctx.globalAlpha = 1; }
      break;
    }
    case 'grid': { // hairlines become pavers: every slab of the grid a tint of the line's colour, each its own strength, joints between them (no chessboard)
      const c = tone(d.col, k); if (!c || detail[2] < 0.05) break; const s = d.step > 1.05 ? d.step / 2 : d.step; ctx.fillStyle = c; // pavers no bigger than a tile
      for (let q = 0; q < 3; q++) { ctx.globalAlpha = detail[2] * (0.3 + 0.28 * q); ctx.beginPath(); for (let i = 0; i * s < w - 0.01; i++) for (let j = 0; j * s < dd - 0.01; j++) if (((hashI(x, y, i, j) * 3) | 0) === q) rrect(ctx, x + i * s + 0.05, y + j * s + 0.05, Math.min(s, w - i * s) - 0.1, Math.min(s, dd - j * s) - 0.1, 0.07, z); ctx.fill(); }
      ctx.globalAlpha = 1; break;
    }
    case 'spk': { // specks become round pebbles and confetti, near and close only
      if (detail[3] < 0.15) break; const f = tone(d.fill, k); ctx.fillStyle = f; ctx.globalAlpha = detail[3]; ctx.beginPath();
      for (let i = 0; i < d.n; i++) { const hx = Math.sin(d.seed * 91 + i * 12.9898) * 43758.5453, hy = Math.sin(d.seed * 57 + i * 78.233) * 24634.6345, gx = x + (hx - Math.floor(hx)) * w, gy = y + (hy - Math.floor(hy)) * dd; disc(ctx, gx, gy, z, d.r * 1.3, d.r * 0.85); }
      ctx.fill(); ctx.globalAlpha = 1; break;
    }
    case 'water': { // the basin: shoal at the banks, aqua in the middle, from the sea's own ramp; its glints are the live layer's
      const b = 0.22; ctx.fillStyle = tone(seaRamp(0.8), k); ctx.beginPath(); rrect(ctx, x - 0.1, y - 0.1, w + 0.2, dd + 0.2, 0.5, z); ctx.fill();
      ctx.fillStyle = tone(seaRamp(2.4), k); ctx.beginPath(); rrect(ctx, x + b, y + b, w - 2 * b, dd - 2 * b, 0.4, z); ctx.fill();
      ctx.fillStyle = tone(seaRamp(5), k); ctx.beginPath(); rrect(ctx, x + b * 3, y + b * 3, w - 6 * b, dd - 6 * b, 0.35, z); ctx.fill(); break;
    }
    default: break;
  }
}
