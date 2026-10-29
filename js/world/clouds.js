// Cloud banks over locked districts and over one that is opening. LEGACY drawer (below): a dark pool and sliding blurred banks (lighting.js). The V2 drawer (registered here, flagged `clouds:v2`) is the cloud bank
// of docs/ART_DIRECTION.md section 6: puffs on a lattice, shaded as a dome and layered in three tiers, a blue base and a soft shadow on the land, a padlock, a dissolve when the district opens. How a bank is painted is
// cloudpaint.js; where its puffs stand and what it costs is cloudbank.js.
// Owner: T2 ATMOSPHERE (docs/RENDER_PLAN.md).
import { P, quad, clamp, ease, h2, toGrid } from './iso.js';
import { DIST, LAYOUT } from './layout.js';
import { registerLayer, runLayer } from './stack.js';
import { CLOUD } from './palette.js';
import { shadowLength, stampSoft } from './shadow.js';
import { bankOf, paintBank, bankTones, lobesOf } from './cloudpaint.js';
import { bankScale } from './cloudbank.js';
export { BANK, bankPuffs, bankScale, bankMs, coverage, structure } from './cloudbank.js'; // the bank's geometry (docs/RENDER_PLAN.md T2): the V2 drawer is built on it, tests/world-cloudbank.test.mjs holds it to the plan

export const cloudMethods = {
  /** Mist over locked districts and over one that is opening: a soft dark pool centred on the district, thickest at its heart, with slow banks of cloud (lighting.js). */
  drawFog(ctx, vz) {
    const t = this.vt;
    for (const id of vz) {
      const fx = this.fxOf(id); if (fx.fog <= 0.01) continue;
      const D = DIST[id], F = D.fp, [X, Y] = P(F[0] + F[2] / 2, F[1] + F[3] / 2, D.z + 24), R = (F[2] + F[3]) * 18;
      ctx.save(); ctx.translate(X, Y); ctx.scale(1, 0.62);
      this.light.fog(ctx, R, fx.fog, t, this.far);
      ctx.restore();
    }
  },
};

// ---------------------------------------------------------------- V2
export const FAR_SCALE = 2.6, MID_SCALE = 1.6, FINE_SCALE = 1;
/** The far bank is a handful of opaque puffs and no translucent floor: nothing under it can be read at that size, and the floor was a fifth of what the bank cost. */
const FAR_LOOK = Object.freeze({ floor: 0, solid: 1 });
const smooth = (x) => { const t = x < 0 ? 0 : x > 1 ? 1 : x; return t * t * (3 - 2 * t); };
/**
 * Which banks are drawn at a zoom, as a pure function of the zoom (a zoom can rest anywhere, and a picture is the world, the zoom and the clock: nothing remembered): the far bank (a handful of big puffs) to 0.18, the
 * coarse one from 0.22 to 0.62, the fine one from 0.70, and between the two a short band in which the finer one GROWS in while the coarser one shrinks to 0.7 of its size, both opaque (two banks laid one on the other at
 * half strength are a mush). Answers [scale, its grow, finer scale, its grow]. The bands are narrow (0.04 and 0.08) so that a zoom rarely rests in one.
 */
export function scalesAt(zoom) {
  if (zoom >= 0.7) return [FINE_SCALE, 1, 0, 0];
  if (zoom > 0.62) { const g = smooth((zoom - 0.62) / 0.08); return [MID_SCALE, 1 - 0.3 * g, FINE_SCALE, g]; }
  if (zoom >= 0.22) return [MID_SCALE, 1, 0, 0];
  if (zoom > 0.18) { const g = smooth((zoom - 0.18) / 0.04); return [FAR_SCALE, 1 - 0.3 * g, MID_SCALE, g]; }
  return [FAR_SCALE, 1, 0, 0];
}

export const REVEAL_MS = 2600;                       // the engine's (world.js): how long a district takes to open
const NOFX = Object.freeze({ dim: 0, fog: 0, lights: 0 });
const smoothstep = (x, a, b) => smooth((x - a) / (b - a));

/** The shadow of a bank on the land: its footprint swept towards +gx by the length the sun makes of the cloud's height (0.75 x by day, longer at the golden hour, shorter by moon), a soft penumbra round a core, both in the cloud shadow's violet. */
export function paintShadow(ctx, D, bank, a, night, dusk) {
  const len = shadowLength(night, dusk) * 2.6, o = bank.outline, dx = 32 * len, dy = 16 * len, prev = ctx.globalAlpha, z = D.z - 4, [gx, gy, w, d] = D.fp;
  ctx.globalAlpha = prev * a * 0.08; quad(ctx, [P(gx - 0.5, gy - 0.5, z), P(gx + w + len * 1.5 + 0.5, gy - 0.5, z), P(gx + w + len * 1.5 + 0.5, gy + d + 0.5, z), P(gx - 0.5, gy + d + 0.5, z)], CLOUD.shadow);
  ctx.globalAlpha = prev * a * 0.18; quad(ctx, [[o[0][0] + dx, o[0][1] + dy], [o[1][0] + dx, o[1][1] + dy], [o[2][0] + dx, o[2][1] + dy], [o[3][0] + dx, o[3][1] + dy]], CLOUD.shadow);
  ctx.globalAlpha = prev;
}

/** The padlock that floats on a bank: a gold rounded lock of 28 world px with a keyhole, bobbing 2 world px over 4 s, in a soft shadow of the cloud's blue so it stands off white. (x, y) is its centre. */
export function paintPadlock(ctx, x, y, t, a) {
  if (a < 0.02) return;
  const bob = t ? Math.sin(t / 4000 * 6.2832) * 2 : 0, prev = ctx.globalAlpha; y += bob;
  ctx.globalAlpha = prev * a * 0.5; ctx.fillStyle = CLOUD.shadow; ctx.beginPath(); ctx.ellipse(x + 3, y + 22, 15, 5, 0, 0, 6.2832); ctx.fill();
  ctx.globalAlpha = prev * a;
  ctx.lineCap = 'round'; ctx.lineWidth = 5.5; ctx.strokeStyle = '#a8742a'; ctx.beginPath(); ctx.arc(x, y - 4, 8.4, Math.PI, 0); ctx.lineTo(x + 8.4, y + 2); ctx.moveTo(x - 8.4, y - 4); ctx.lineTo(x - 8.4, y + 2); ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = '#ffd84d'; ctx.beginPath(); ctx.arc(x, y - 4, 8.4, Math.PI, 0); ctx.moveTo(x + 8.4, y - 4); ctx.lineTo(x + 8.4, y + 2); ctx.moveTo(x - 8.4, y - 4); ctx.lineTo(x - 8.4, y + 2); ctx.stroke();
  const rr = (X, Y, W, H, R) => { ctx.beginPath(); ctx.moveTo(X + R, Y); ctx.arcTo(X + W, Y, X + W, Y + H, R); ctx.arcTo(X + W, Y + H, X, Y + H, R); ctx.arcTo(X, Y + H, X, Y, R); ctx.arcTo(X, Y, X + W, Y, R); ctx.closePath(); };
  ctx.fillStyle = '#d99a22'; rr(x - 14, y - 2, 28, 22, 6); ctx.fill();
  ctx.fillStyle = '#ffd84d'; rr(x - 14, y - 2, 26, 18, 6); ctx.fill();
  ctx.fillStyle = '#fff0a8'; rr(x - 11, y, 14, 4, 2); ctx.fill();
  ctx.fillStyle = '#7a4a12'; ctx.beginPath(); ctx.arc(x, y + 7, 3.2, 0, 6.2832); ctx.fill(); rr(x - 1.6, y + 8, 3.2, 6, 1.4); ctx.fill();
  ctx.globalAlpha = prev;
}

/** Tall things that stand out of the cloud: the towers, the IPO tower and the cranes (kinds taller than the dome) drawn again over it, above the line the dome reaches, in their own colour, with a collar of puffs where they leave it. */
const TALL = new Set(['tower', 'ipo', 'crane']);
const DOME = 66;
function pokeOut(ctx, view, w, id, D, tones, a, zoom) {
  if (a < 0.5 || zoom < 0.55) return;
  const f = w.fxOf, own = Object.hasOwn(w, 'fxOf'), hits = w.hits.length, over = w.overlay.length, lit = w.lights.length;
  for (const p of D.props) {
    if (!TALL.has(p.t) || p.h < DOME + 14) continue;
    const bx = (p.gx - p.gy) * 32 + 0, by = (p.gx + p.gy + p.w) * 16 - p.z;
    if (bx < view.x0 - 80 || bx > view.x1 + 80 || by < view.y0 || by - p.h > view.y1) continue;
    ctx.save(); ctx.beginPath(); ctx.rect(view.x0, view.y0 - 400, view.x1 - view.x0, by - DOME - (view.y0 - 400)); ctx.clip();
    w.fxOf = () => NOFX; try { runLayer('static', w, ctx, view, p); } finally { if (own) w.fxOf = f; else delete w.fxOf; }
    ctx.restore();
    w.hits.length = hits; w.overlay.length = over; w.lights.length = lit; // the frame pushes the hit and the labels of a prop: they are the first drawing's
    const r = 22 + p.w * 4, cy = by - DOME + 4, t = tones.tiers[2];
    for (const [dx, dy, k] of [[-0.55, 0.1, 0.8], [0.5, 0.15, 0.9], [0, -0.25, 0.7]]) { const q = r * k; ctx.fillStyle = t.belly; ctx.beginPath(); ctx.arc(bx + dx * r + r * 0.12, cy + dy * r + r * 0.22, q, 0, 6.2832); ctx.fill(); ctx.fillStyle = t.body; ctx.beginPath(); ctx.arc(bx + dx * r, cy + dy * r, q, 0, 6.2832); ctx.fill(); ctx.fillStyle = t.top; ctx.beginPath(); ctx.arc(bx + dx * r - q * 0.1, cy + dy * r - q * 0.2, q * 0.6, 0, 6.2832); ctx.fill(); }
  }
}


// ---------------------------------------------------------------- the sky's own clouds: small cumulus that drift over the sea at the far and middle zooms, each with its soft shadow on the water
/** A sky cell is this many world px on a side; each holds at most one small cloud, which crosses it from west to east in about five minutes and fades in and out at its ends. */
export const SKY_CELL = 2600;
const SKY_SPEED = 8;     // world px a second
const skyBanks = new Map();
/** Is there a small cloud in sky cell (cx, cy), and where is it at time t (ms)? Fills `out` { x, y, a (0..1: its fade), size (0.8..1.3), k } or answers false for an empty cell. Pure. */
export function skyCloudAt(cx, cy, t, out) {
  const k = cx * 877 + cy * 1361; if (h2(k, 91) > 0.55) return false;
  const u = (((t / 1000) * SKY_SPEED) / SKY_CELL + h2(k, 92)) % 1;
  out.x = (cx + u) * SKY_CELL; out.y = (cy + 0.2 + 0.6 * h2(k, 93)) * SKY_CELL * 0.62; out.a = Math.min(1, Math.sin(u * Math.PI) * 2.2); out.size = 0.8 + 0.5 * h2(k, 94); out.k = k; return out;
}
function skyBank(k) { // a small cumulus: a row of five to seven puffs on a flat base, made once per cell
  let b = skyBanks.get(k); if (b) return b;
  const n = 5 + ((h2(k, 95) * 3) | 0), puffs = [];
  for (let i = 0; i < n; i++) { const u = (i + 0.5) / n - 0.5, r = 46 * (0.75 + 0.5 * Math.cos(u * 3.1)) * (0.85 + 0.3 * h2(k, 100 + i)); puffs.push({ x: u * 210, y: -r * 0.5 * (0.6 + 0.8 * h2(k, 110 + i)), r, row: 2, k: h2(k, 120 + i), rim: 1 }); }
  puffs.sort((p, q) => p.y - q.y); b = { lobes: puffs, r0: 46, box: { x0: -140, x1: 140, y0: -100, y1: 60 } }; if (skyBanks.size > 128) skyBanks.clear(); skyBanks.set(k, b); return b;
}
const SKYO = { x: 0, y: 0, a: 0, size: 1, k: 0 };
function paintSky(ctx, view, env, w, zoom, tones, t) {
  const fade = 1 - smoothstep(zoom, 0.55, 0.9); if (fade < 0.03) return;
  const x0 = Math.floor(view.x0 / SKY_CELL) - 1, x1 = Math.floor(view.x1 / SKY_CELL) + 1, y0 = Math.floor(view.y0 / (SKY_CELL * 0.62)) - 1, y1 = Math.floor(view.y1 / (SKY_CELL * 0.62)) + 1, prev = ctx.globalAlpha, night = env.night || 0;
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
    if (!skyCloudAt(cx, cy, t, SKYO)) continue; const { x, y, a, size, k } = SKYO; if (a < 0.03 || x < view.x0 - 200 || x > view.x1 + 200 || y < view.y0 - 200 || y > view.y1 + 200) continue;
    const [gx, gy] = toGrid(x, y, 0); if (LAYOUT.isLand(Math.floor(gx), Math.floor(gy))) continue; // over the sea only: it never covers what the player is looking at
    ctx.globalAlpha = prev * a * fade * 0.55; stampSoft(ctx, x + 70 * size, y + 62 * size, 150 * size, 38 * size, 0.5, CLOUD.shadow);
    ctx.globalAlpha = prev * a * fade * 0.9; ctx.save(); ctx.translate(x, y - 70 * size); ctx.scale(size, size); paintBank(ctx, skyBank(k), { t: 0, alpha: 1, tones, view: null, zoom: zoom * size, floor: 0, solid: 1, phase: 0 }); ctx.restore();
  }
  ctx.globalAlpha = prev; void night; void lobesOf;
}

const SEEN = new WeakMap(); // per world: the districts it has drawn under cloud, and when each was last seen opening (for the reduced-motion cross-fade)
function drawClouds(ctx, view, env, w, vz) {
  const zoom = w.cam.z, t = env.t, calm = w.reduced(), warm = Math.min(1, (w.dusk || 0) * 1.1), cool = Math.min(1, (env.night || 0) * 0.8), tones = bankTones(warm, cool);
  paintSky(ctx, view, env, w, zoom, tones, t); const sc = scalesAt(zoom); let seen = SEEN.get(w); if (!seen) SEEN.set(w, seen = new Map());
  for (const id of vz) {
    const D = DIST[id]; let fx = w.fxOf(id), dis = null, a = fx.fog;
    if (fx.fog > 0.01) seen.set(id, -1);                                              // locked (or opening): remembered
    else if (calm && seen.has(id)) { // opened while motion is reduced: the engine has no reveal then, so the bank cross-fades out in 400 ms of the world's own clock
      let t0 = seen.get(id); if (t0 < 0) { t0 = w.t; seen.set(id, t0); } const k = (w.t - t0) / 400;
      if (k >= 1) { seen.delete(id); continue; } a = 1 - k; fx = { dim: 0, fog: a, lights: 0 }; w.dirty = true;
    } else { if (seen.has(id)) seen.delete(id); continue; }
    const rv = w.reveal[id]; if (rv && !calm) { const ms = w.t - rv.t0; if (ms >= 0) { const g = D.gateAt || { x: D.cx, y: D.cy }, [gx, gy] = P(g.x, g.y, D.z); dis = { ms, gx, gy, span: (D.fp[2] + D.fp[3]) * 32 }; a = 1; } }
    const bank = bankOf(D, sc[0]), box = bank.box;
    if (box.x1 + 80 < view.x0 || box.x0 - 30 > view.x1 || box.y1 + 30 < view.y0 || box.y0 - 30 > view.y1) continue;
    const phase = (id * 2.399) % 6.28318;
    paintShadow(ctx, D, bank, dis ? 1 - smoothstep(dis.ms, 300, 1800) : a, env.night || 0, w.dusk || 0);
    paintBank(ctx, bank, { t, alpha: a, tones, phase, view, zoom, dis, lite: w.lite, grow: sc[1], ...(sc[0] === FAR_SCALE ? FAR_LOOK : null) }); // the coarser bank shrinks as the finer one grows over it
    if (sc[3] > 0.01) paintBank(ctx, bankOf(D, sc[2]), { t, alpha: a, tones, phase, view, zoom, dis, lite: w.lite, grow: sc[3] });
    if (!dis) {
      pokeOut(ctx, view, w, id, D, tones, a, zoom);
      const lock = smoothstep(zoom, 0.42, 0.55) * a; if (lock > 0.02) { const [lx, ly] = P(D.cx, D.cy, D.z + 96); paintPadlock(ctx, lx, ly, t, lock); }
    }
  }
}
registerLayer('clouds', drawClouds, 'world');
