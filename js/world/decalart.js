// The ground decals of a district's kit (lawns, cobbles, bays, crops, circuit traces, the harbor basin) in the toy language: filled shapes only, soft corners, every band at least 0.12 tile wide, daylight colours.
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md). The kits (T3's, kits.js) still name their colours in the old dark hexes and rgba strings; this module reads them by INTERPRETATION (the plan's way):
// a dark colour is lifted towards the warm cream of the pavements until it reads in daylight, `grid` hairlines become pavers, `spk` specks become round pebbles, and `water` is drawn from the sea's own ramp.
import { mix, rgb, luma, hex, clamp } from './iso.js';
import { PAVE, SEA, LIGHT, veiled, seaRamp } from './palette.js';
import { VEIL } from './terrainfield.js';

const HW = 32, HH = 16;
const px = (gx, gy) => (gx - gy) * HW, py = (gx, gy, z) => (gx + gy) * HH - z;
const MEMO = new Map();
/** A kit's colour string (#rrggbb or rgba(r,g,b,a)) read for daylight: dark colours are lifted towards cream, and a district under cloud (k) is veiled. Answers a CSS colour string. */
export function tone(c, k = 0) {
  if (!c) return null;
  const key = c + '|' + k; let v = MEMO.get(key); if (v) return v;
  let r, g, b, a = 1;
  if (c[0] === '#') { const q = rgb(c); r = q[0]; g = q[1]; b = q[2]; } else { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return c; const p = m[1].split(',').map(Number); r = p[0]; g = p[1]; b = p[2]; a = p.length > 3 ? p[3] : 1; }
  let h = hex(r, g, b); const l = luma(h); if (l < 0.58) h = mix(h, PAVE.cream, clamp((0.58 - l) * 1.7, 0, 0.85));
  if (k) h = veiled(h, k * VEIL);
  v = a < 1 ? `rgba(${rgb(h).join(',')},${a})` : h; if (MEMO.size > 600) MEMO.clear(); MEMO.set(key, v); return v;
}
const MINB = 0.12, NEON = 0.26;
const V = (c, k) => (k ? veiled(c, k * VEIL) : c);
/** What an `ell` decal is, from its fill: a `puddle` (blue), `dirt` (dark) or a `ring` (anything lighter: a worn circle of a plaza). Pure. */
export function ellKind(fill) {
  if (!fill) return 'ring'; let r, g, b;
  if (fill[0] === '#') { const q = rgb(fill); r = q[0]; g = q[1]; b = q[2]; } else { const m = fill.match(/rgba?\(([^)]+)\)/); if (!m) return 'ring'; const p = m[1].split(',').map(Number); r = p[0]; g = p[1]; b = p[2]; }
  if (b > r + 24 && b >= g - 10) return 'puddle';
  return luma(hex(r, g, b)) < 0.4 ? 'dirt' : 'ring';
}
const ELL = new Map();
/** The colour of a soft patch on a district's ground: dirt is the ground a shade darker and a little violet, a puddle the shallows' aqua mixed into it; veiled under cloud. */
function ellBase(S, kind, k) {
  const key = S.ground + kind + k; let v = ELL.get(key); if (!v) { v = V(kind === 'dirt' ? mix(S.ground, LIGHT.shadow, 0.42) : mix(S.ground, '#bfe4f4', 0.5), k); if (ELL.size > 200) ELL.clear(); ELL.set(key, v); } return v;
}
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
    case 'ell': {
      const r = d.r, rx = r * HW * 1.42, ry = r * HH * 1.42, kind = ellKind(d.fill);
      if (kind === 'dirt' || kind === 'puddle') { // a soft patch of the ground's own tone, built up in three steps so it has no edge to read as a stain: dirt is the ground darkened a shade, a puddle a lighter aqua with a white sheen
        const base = ellBase(S, kind, k), sc = kind === 'puddle' ? 0.72 : 1;
        ctx.fillStyle = base;
        for (let i = 0; i < 3; i++) { ctx.globalAlpha = kind === 'dirt' ? 0.11 + 0.03 * i : 0.16 + 0.07 * i; ctx.beginPath(); disc(ctx, x, y, z, rx * sc * (1 - 0.2 * i), ry * sc * (1 - 0.2 * i)); ctx.fill(); }
        if (kind === 'puddle') { ctx.globalAlpha = 0.5; ctx.fillStyle = LIGHT.white; ctx.beginPath(); disc(ctx, x - r * 0.12, y - r * 0.1, z, rx * 0.24, ry * 0.2); ctx.fill(); }
        ctx.globalAlpha = 1; break;
      }
      const f = tone(d.fill, k); if (!f) break;
      ctx.fillStyle = f; ctx.beginPath(); disc(ctx, x, y, z, rx, ry); ctx.fill();
      ctx.globalAlpha = 0.18; ctx.fillStyle = LIGHT.white; ctx.beginPath(); disc(ctx, x - r * 0.12, y - r * 0.12, z, rx * 0.6, ry * 0.6); ctx.fill(); ctx.globalAlpha = 1; // a lighter middle: a ring of worn ground
      break;
    }
    case 'stripes': {
      let n = d.n; const span = d.axis === 'x' ? dd : w; if (span / n < MINB) n = Math.max(1, Math.floor(span / MINB));
      for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, c = tone(i % 2 ? d.c2 : d.c1, k); if (!c) continue; ctx.fillStyle = c; ctx.beginPath(); if (d.axis === 'x') quad(ctx, x, y + dd * t0, w, dd * (t1 - t0) + 0.01, z); else quad(ctx, x + w * t0, y, w * (t1 - t0) + 0.01, dd, z); ctx.fill(); }
      break;
    }
    case 'checker': {
      const c1 = tone(d.c1, k), c2 = tone(d.c2, k), s = d.step; if (c1) { ctx.fillStyle = c1; ctx.beginPath(); quad(ctx, x, y, w, dd, z); ctx.fill(); }
      if (c2) { ctx.fillStyle = c2; ctx.beginPath(); for (let i = 0; i * s < w - 0.01; i++) for (let j = 0; j * s < dd - 0.01; j++) if ((i + j) % 2) quad(ctx, x + i * s + 0.03, y + j * s + 0.03, Math.min(s, w - i * s) - 0.06, Math.min(s, dd - j * s) - 0.06, z); ctx.fill(); }
      break;
    }
    case 'grid': { // hairlines become pavers: every other tile of the grid a lighter shade of the district's own ground (never the neon colour, which stays on the strips), rounded, with a joint between them
      if (!d.col || detail[2] < 0.05) break; const s = d.step > 1.05 ? d.step / 2 : d.step; ctx.fillStyle = V(S.hi, k); ctx.globalAlpha = 0.5; ctx.beginPath(); // pavers no bigger than a tile
      for (let i = 0; i * s < w - 0.01; i++) for (let j = 0; j * s < dd - 0.01; j++) if ((i + j) % 2) rrect(ctx, x + i * s + 0.05, y + j * s + 0.05, Math.min(s, w - i * s) - 0.1, Math.min(s, dd - j * s) - 0.1, 0.16, z);
      ctx.fill(); ctx.globalAlpha = 1; break;
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
