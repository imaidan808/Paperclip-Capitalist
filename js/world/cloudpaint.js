// How a cloud bank is PAINTED: the puff (a body disc with a lit crescent on its sunny side and a blue crescent on its shaded one), the bank (tiers back to front, a blue base where it sits on the ground, its soft shadow on the
// land), the padlock that floats on it and the dissolve when its district opens. The geometry (where the puffs stand, how much they cover, what it costs) is cloudbank.js; the layer that calls this is clouds.js.
// Owner: T2 ATMOSPHERE (docs/RENDER_PLAN.md, docs/ART_DIRECTION.md section 6).
//
// Everything is a flat fill (no gradient, no blur, no clip, no sprite scaled up: docs/RENDER_PLAN.md section 6 measured each against the live puff and every one is slower). A crescent is a path of two arcs, worked out in
// closed form (crescent()), so the three fills of a puff are three paths and nothing else. The light is the world's: the sun stands upper left, so the lit crescent is on the upper left of a puff and the blue one on its lower right.
// All motion is a function of the visual clock `t` (0 in Calm, Off and reduced motion: the bank stands in its resting pose, centred, with its puffs at mid bob).
import { P, mix, clamp, ease } from './iso.js';
import { CLOUD, LIGHT, SKY } from './palette.js';
import { bankPuffs, outlineOf, puffRadius, BANK } from './cloudbank.js';

/** The bob of a puff (world px, over 7 to 11 s), the swell (2% over 9 s) and the slide of the whole bank (+/- 14 world px over 48 s): the art direction's 6.4. */
export const MOTION = Object.freeze({ bob: 1.6, bobMin: 7, bobSpan: 4, swell: 0.02, swellPeriod: 9, slide: 14, slidePeriod: 48 });
/** Ghosts: the share of each tier that stands over what is under it (back, middle, front). */
export const GHOST = Object.freeze([0.94, 0.9, 0.86]);

// ---------------------------------------------------------------- the crescent: a disc of radius r at the origin without the disc of radius r2 at (ox, oy), as two arcs
/**
 * The two arcs of the crescent `disc(0, 0, r) minus disc(ox, oy, r2)`: { phi, beta, gamma } so that the outer arc is the disc's own from phi + beta to phi + 2 pi - beta (the far side from the cut) and the
 * inner arc is the cut disc's own from phi + pi + gamma back to phi + pi - gamma (anticlockwise). null when there is no crescent to draw: 'none' (the cut covers the disc) or 'disc' (the cut misses it, so the
 * whole disc is left: the caller draws the disc). Pure.
 */
export function crescent(r, ox, oy, r2) {
  const d = Math.hypot(ox, oy);
  if (d <= r2 - r + 1e-9) return { kind: 'none' };
  if (d >= r + r2 - 1e-9 || d <= r - r2 + 1e-9) return { kind: 'disc' }; // the cut misses the disc, or sits inside it (a ring, not a crescent: the caller never asks)
  const a = (r * r - r2 * r2 + d * d) / (2 * d), beta = Math.acos(clamp(a / r, -1, 1)), gamma = Math.acos(clamp((d - a) / r2, -1, 1));
  return { kind: 'crescent', phi: Math.atan2(oy, ox), beta, gamma };
}
/** The thickest part of the crescent, in world px: r - r2 + d for a cut disc at distance d (0 when there is none). */
export const crescentWidth = (r, ox, oy, r2) => { const c = crescent(r, ox, oy, r2); return c.kind === 'crescent' ? Math.max(0, r - r2 + Math.hypot(ox, oy)) : c.kind === 'disc' ? r : 0; };
/** Begin a path for the crescent of the disc at (x, y); fills nothing. Answers false when there is nothing to fill. */
export function pathCrescent(ctx, x, y, r, ox, oy, r2) {
  const c = crescent(r, ox, oy, r2);
  if (c.kind === 'none') return false;
  ctx.beginPath();
  if (c.kind === 'disc') { ctx.arc(x, y, r, 0, 6.2832); return true; }
  ctx.arc(x, y, r, c.phi + c.beta, c.phi + 6.2832 - c.beta, false);
  ctx.arc(x + ox, y + oy, r2, c.phi + Math.PI + c.gamma, c.phi + Math.PI - c.gamma, true);
  ctx.closePath(); return true;
}

// ---------------------------------------------------------------- the colours of a bank for the light of the hour (memoised: a still sky builds nothing)
const TONES = new Map();
/**
 * The three colours of each tier (body, belly, top) for the light now. `warm` is 0..1 (the golden hour: tops catch the low sun), `cool` 0..1 (the blue hour: bellies sink towards periwinkle). The tiers recede:
 * the back tier is bluer and paler so a bank has depth, the front tier is the lit one. A record per (warm, cool) in eighths, so the hour costs a handful of records in a day.
 */
export function bankTones(warm = 0, cool = 0) {
  const w = Math.round(clamp(warm, 0, 1) * 8), c = Math.round(clamp(cool, 0, 1) * 8), key = w * 16 + c; let t = TONES.get(key);
  if (t) return t;
  const kw = w / 8, kc = c / 8, top = mix(mix(CLOUD.top, '#ffe9bf', kw * 0.9), '#e6ecff', kc * 0.4);
  const tier = (body, belly, lit) => { const b = mix(mix(body, '#ffe6c0', kw * 0.22), '#c8d0f4', kc * 0.3), e = mix(mix(belly, '#a58ee0', kw * 0.5), '#8f9ce0', kc * 0.35); return Object.freeze({ body: b, belly: e, top: lit, cols: Object.freeze([e, b, mix(b, lit, 0.4), mix(b, lit, 0.8)]) }); };
  t = Object.freeze({ tiers: Object.freeze([tier(CLOUD.back, '#a9b8e6', mix(top, CLOUD.back, 0.35)), tier('#eef3ff', '#b6c5ee', mix(top, CLOUD.body, 0.4)), tier(CLOUD.body, CLOUD.belly, top)]), base: mix(mix(CLOUD.base, '#e0a8b4', kw * 0.3), '#7f8cd2', kc * 0.4), rim: mix(CLOUD.rim, '#fff0d0', kw * 0.5), glow: mix('#fff6e0', '#ffd49a', kw) });
  if (TONES.size > 200) TONES.clear(); TONES.set(key, t); return t;
}

// ---------------------------------------------------------------- one puff: the body, the blue crescent on its shaded side (down and to the right), the lit one on its sunny side (up and to the left)
/** The offsets of the shade and the light, as shares of the radius: where the cut discs stand, and how big they are (the crescents' widths come out of these). */
export const PUFF = Object.freeze({ shadeX: -0.2, shadeY: -0.3, shadeR: 0.985, litX: 0.17, litY: 0.24, litR: 0.97 });
/** Paint one puff of radius r at (x, y): three path fills. `tone` is one tier's { body, belly, top }; `a` its alpha. Leaves globalAlpha as it was. */
export function paintPuff(ctx, x, y, r, tone, a = 1) {
  const prev = ctx.globalAlpha; ctx.globalAlpha = prev * a;
  ctx.fillStyle = tone.body; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  ctx.fillStyle = tone.belly; if (pathCrescent(ctx, x, y, r, PUFF.shadeX * r, PUFF.shadeY * r, PUFF.shadeR * r)) ctx.fill();
  ctx.fillStyle = tone.top; if (pathCrescent(ctx, x, y, r, PUFF.litX * r, PUFF.litY * r, PUFF.litR * r)) ctx.fill();
  ctx.globalAlpha = prev;
}

// ---------------------------------------------------------------- banks are made once per district and scale
/**
 * Which puffs stand on the bank's outline, and the small lobes that fill the cusps between them. `rim` is set on a puff when some point just inside its edge (in eight directions) is covered by no other puff; a rim puff gets
 * one or two child lobes of 0.4 to 0.6 of its radius on its exposed sides, so the outline scallops at two scales (a cloud's edge is lumps on lumps, never one size). Returns the lobes: the puffs and the children, back to front.
 * Done once per bank; deterministic (the children are placed by the puff's hash).
 */
export function lobesOf(puffs) {
  const n = puffs.length, kids = [];
  for (let i = 0; i < n; i++) {
    const p = puffs[i]; let rim = 0;
    for (let d = 0; d < 8; d++) {
      const a = d * Math.PI / 4, qx = p.x + Math.cos(a) * p.r * 0.92, qy = p.y + Math.sin(a) * p.r * 0.92; let hidden = false;
      for (let j = 0; j < n && !hidden; j++) { if (j === i) continue; const o = puffs[j], dx = qx - o.x, dy = qy - o.y; if (dx * dx + dy * dy < o.r * o.r * 0.94) hidden = true; }
      if (!hidden) rim |= 1 << d;
    }
    p.rim = rim;
    for (let d = 0; d < 8; d++) {
      if (!(rim & (1 << d))) continue; const hk = (p.k * 97.13 + d * 0.618) % 1; if (hk > 0.55) continue;
      const a = d * Math.PI / 4 + (hk - 0.27) * 0.5, kr = p.r * (0.4 + 0.2 * ((hk * 7.7) % 1)), x = p.x + Math.cos(a) * p.r * 0.98, y = p.y + Math.sin(a) * p.r * 0.98;
      let inside = false; for (let j = 0; j < n && !inside; j++) { if (j === i) continue; const o = puffs[j]; if ((x - o.x) ** 2 + (y - o.y) ** 2 < (o.r * 0.7) ** 2) inside = true; }
      if (!inside) kids.push({ x, y, r: kr, row: p.row, k: (p.k * 13.7 + d * 0.31) % 1, rim: 1, kid: true });
    }
  }
  const all = puffs.concat(kids); all.sort((a, b) => a.row - b.row || a.y - b.y); return all;
}
const BANKS = new Map();
/** The bank over district `D` at a scale (1 fine, 1.6 coarse), made once and kept: { puffs (cloudbank.js: the geometry the rules hold), lobes (what is painted: the puffs and the cusp lobes), outline, box, cx, cy, r0 }. */
export function bankOf(D, scale = 1) {
  const key = D.fp[0] * 100000 + D.fp[1] * 100 + scale * 3; let b = BANKS.get(key);
  if (!b) {
    const puffs = bankPuffs(D.fp, D.z, scale), o = outlineOf(D.fp, D.z), r0 = puffRadius(D.fp) * scale, top = Math.min(...o.map((q) => q[1])), bot = Math.max(...o.map((q) => q[1])), left = Math.min(...o.map((q) => q[0])), right = Math.max(...o.map((q) => q[0]));
    if (scale > 2) for (const p of puffs) p.y += 0.65 * BANK.lift[p.row] * r0; // the far bank (a handful of big puffs) stands flatter: raised as much, its back tier would be a tower
    b = { puffs, lobes: lobesOf(puffs), outline: o, r0, box: { x0: left - 1.5 * r0, x1: right + 1.5 * r0, y0: top - 2.4 * r0, y1: bot + 1.6 * r0 }, cx: (left + right) / 2, cy: (top + bot) / 2 };
    if (BANKS.size > 64) BANKS.clear(); BANKS.set(key, b);
  }
  return b;
}
export function releaseBanks() { BANKS.clear(); }

const TAU = Math.PI * 2;
/** The slide of a bank at time t (world px, along the screen's x): a slow sine of 48 s; 0 at rest. Phase by the district so neighbours are not in step. */
export const slideAt = (t, phase) => (t ? Math.sin(t / 1000 / MOTION.slidePeriod * TAU + phase) * MOTION.slide : 0);
/** The bob of one puff, world px (up is negative): a period of 7 to 11 s and a phase from its hash `k`; 0 at rest. */
export const bobAt = (t, k) => (t ? Math.sin(t / 1000 / (MOTION.bobMin + MOTION.bobSpan * ((k * 7.31) % 1)) * TAU + k * 40) * MOTION.bob : 0);
/** The swell of the whole bank: 2% over 9 s; 1 at rest. */
export const swellAt = (t, phase) => (t ? 1 + Math.sin(t / 1000 / MOTION.swellPeriod * TAU + phase) * MOTION.swell : 1);

const disc = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const ramp = (x, a, b) => { const t = (x - a) / (b - a); return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); };
/** The shells a lobe is painted in, from the one furthest down and to the right (the shaded edge) to the crown: scale of the puff's radius, offset up/left as shares of it, the colour (index into a tier's `cols`), the share of lobes that get it, and the puff size on screen (css px) from which it is drawn. */
export const SHELLS = Object.freeze([{ s: 1, x: 0.2, y: 0.38, c: 0, of: 1, from: 0, full: 0 }, { s: 1, x: 0, y: 0, c: 1, of: 1, from: 0, full: 0 }, { s: 0.84, x: -0.06, y: -0.15, c: 2, of: 0.6, from: 16, full: 30 }, { s: 0.55, x: -0.12, y: -0.27, c: 3, of: 0.25, from: 24, full: 44 }]);
/** How far into its own lift a lobe is when `dis.ms` milliseconds of the dissolve have gone: 0 not begun, 1 gone. A lobe waits 0.35 s x (its distance from the gate / the bank's span), then takes 1.1 s. Pure. */
export const lobeLift = (dis, p) => { const d = Math.hypot(p.x - dis.gx, (p.y - dis.gy) * 2) / (dis.span || 1), q = (dis.ms - 350 * d * 2.4) / 1100; return q <= 0 ? 0 : q >= 1 ? 1 : q; };
/** How a bank is shown: the floor is the translucent sheet every tier lays over the district (so what is under it shows as a ghost), the lobes are the opaque puffs standing on it (all on the outline, and `solid` of the others). */
export const LOOK = Object.freeze({ floor: 0.38, solid: 0.12 });
/**
 * Paint a bank, a tier at a time from the back. Each tier is a translucent floor (every puff of the tier as ONE path, so overlapping puffs blend once and the district shows through as a ghost, without the soap-bubble
 * look of translucent balls), then the lobes standing on it, opaque: every lobe on the bank's outline and a share of the others, each drawn in shells (SHELLS): the shaded edge, the body, a lit shoulder and a crown, each smaller
 * and further up and to the left than the one before and a step paler, so a lobe is shaded as a dome and the outline as a lit rim on the sunny side and a blue one on the shaded side. Shells too small to see are not drawn
 * (`zoom` says how big a puff is on screen). `o`: { t, alpha, tones (bankTones), phase, view, zoom, floor, solid, dis, grow (the share of full size its puffs stand at, 0 to 1: a bank handing over to a finer one under a zoom shrinks as the finer one grows, so no two translucent banks ever lie one on the other), lite (the governor's quiet tier: the shaded edge and the body only, no cusp lobes) }. `dis` is a dissolve in progress, { ms (milliseconds into it), gx, gy (the gate, in world px), span (the bank's width) }:
 * each lobe starts to lift 0.35 s x (its distance from the gate / the span) in, and rises 36 world px, shrinks to 0.6 and fades over 1.1 s (docs/ART_DIRECTION.md 6.4); the floor goes with the first of them. Lobes outside `view` are skipped. Returns how many lobes were painted.
 */
export function paintBank(ctx, bank, o) {
  const { t = 0, alpha = 1, tones, view, dis, lite } = o, gro = o.grow ?? 1, ph = o.phase || 0, slide = slideAt(t, ph), swell = swellAt(t, ph), lobes = bank.lobes, prev = ctx.globalAlpha, floor = o.floor ?? LOOK.floor, solid = o.solid ?? LOOK.solid, rpx = bank.r0 * (o.zoom || 1) * gro, kidMin = 12;
  if (gro < 0.04) return 0;
  let n = 0, from = 0;
  while (from < lobes.length) {
    const row = lobes[from].row; let to = from; while (to < lobes.length && lobes[to].row === row) to++;
    const tone = tones.tiers[row], cols = tone.cols;
    if (floor > 0) { // the sheet: one path, one fill
      ctx.globalAlpha = prev * alpha * floor * gro * gro * (dis ? 1 - ramp(dis.ms, 200, 1500) : 1); ctx.fillStyle = tone.body; ctx.beginPath();
      for (let i = from; i < to; i++) { const p = lobes[i]; if (p.kid) continue; const r = p.r * swell * gro, x = p.x + slide, y = p.y + bobAt(t, p.k); if (view && (x + r < view.x0 || x - r > view.x1 || y + r < view.y0 || y - r > view.y1)) continue; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
      ctx.fill();
    }
    for (let s = 0; s < SHELLS.length; s++) {
      const sh = SHELLS[s], sa = sh.full ? (lite ? 0 : ramp(rpx * (sh.s || 1), sh.from, sh.full)) : 1; if (sa < 0.03) continue;
      ctx.globalAlpha = prev * alpha * sa; ctx.fillStyle = cols[sh.c];
      for (let i = from; i < to; i++) {
        const p = lobes[i]; if (p.kid ? lite || rpx < kidMin : !p.rim && p.k > solid) continue; if (sh.of < 1 && ((p.k * 11.3) % 1) > sh.of) continue;
        let r0 = p.r * (0.97 + 0.08 * p.k) * swell * gro, lx = 0, ly = 0;
        if (dis) { const q = lobeLift(dis, p); if (q >= 1) continue; ctx.globalAlpha = prev * alpha * sa * (1 - q) * (1 - q); r0 *= 1 - 0.4 * q; lx = q * 14 * Math.sign(p.x - dis.gx || 1); ly = -q * 36; }
        const r = r0 * sh.s * (sh.c === 3 ? 0.85 + 0.3 * ((p.k * 5.7) % 1) : 1), x = p.x + slide + lx + sh.x * r0, y = p.y + bobAt(t, p.k) + ly + sh.y * r0;
        if (view && (x + r < view.x0 - r || x - r > view.x1 + r || y + r < view.y0 - r || y - r > view.y1 + r)) continue;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); if (s === 1) n++;
      }
    }
    from = to;
  }
  ctx.globalAlpha = prev; return n;
}
