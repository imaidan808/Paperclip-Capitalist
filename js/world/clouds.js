// Cloud banks over locked districts and over one that is opening. LEGACY drawer (below): a dark pool and sliding blurred banks (lighting.js). The V2 drawer (registered here, flagged `clouds:v2`) is the cloud bank
// of docs/ART_DIRECTION.md section 6: puffs on a lattice, shaded as a dome and layered in three tiers, a blue base and a soft shadow on the land, a padlock, a dissolve when the district opens. How a bank is painted is
// cloudpaint.js; where its puffs stand and what it costs is cloudbank.js.
// Owner: T2 ATMOSPHERE (docs/RENDER_PLAN.md).
import { P, quad, clamp, ease } from './iso.js';
import { DIST } from './layout.js';
import { registerLayer, runLayer } from './stack.js';
import { CLOUD } from './palette.js';
import { shadowLength } from './shadow.js';
import { bankOf, paintBank, bankTones } from './cloudpaint.js';
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
/**
 * Which bank is drawn at a zoom: the far bank (a handful of big puffs: FAR_SCALE) from the whole-island view to 0.22, the coarse one (MID_SCALE) to 0.66, the fine one (FINE_SCALE) from there. A bank is
 * changed for the next only after the zoom has gone 0.02 past the edge (`prev` is the scale drawn last: hysteresis, so a zoom that rests at an edge does not flip), and the change is a cross-fade IN TIME
 * (CROSS_MS), never in zoom: a zoom can rest anywhere, and two banks on one another at half strength are a mush. Pure.
 */
export const FAR_SCALE = 2.6, MID_SCALE = 1.6, FINE_SCALE = 1, CROSS_MS = 350;
export function scaleFor(zoom, prev) {
  if (zoom >= (prev === FINE_SCALE ? 0.64 : 0.68)) return FINE_SCALE;
  return zoom >= (prev === FAR_SCALE ? 0.23 : 0.21) ? MID_SCALE : FAR_SCALE;
}
const smooth = (x) => { const t = x < 0 ? 0 : x > 1 ? 1 : x; return t * t * (3 - 2 * t); };
const SCALES = new WeakMap(); // per world: the scale drawn, the one it replaced and when
/** The two banks of this frame and how far the new one has grown in: [scale, from scale or 0, grown 0..1]. Instant under reduced motion (the world draws only when it must). */
function crossOf(w, zoom, calm) {
  let s = SCALES.get(w); if (!s) SCALES.set(w, s = { cur: scaleFor(zoom, 0), from: 0, t0: 0 });
  const next = scaleFor(zoom, s.cur);
  if (next !== s.cur) { s.from = calm ? 0 : s.cur; s.cur = next; s.t0 = w.t; }
  if (!s.from) return [s.cur, 0, 1];
  const g = smooth((w.t - s.t0) / CROSS_MS); if (g >= 1) { s.from = 0; return [s.cur, 0, 1]; }
  w.dirty = true; return [s.cur, s.from, g];
}

export const REVEAL_MS = 2600;                       // the engine's (world.js): how long a district takes to open
const NOFX = Object.freeze({ dim: 0, fog: 0, lights: 0 });
const smoothstep = (x, a, b) => smooth((x - a) / (b - a));

/** The shadow of a bank on the land: its footprint swept towards +gx by the length the sun makes of the cloud's height (0.75 x by day, longer at the golden hour, shorter by moon), a soft penumbra round a core, both in the cloud shadow's violet. */
export function paintShadow(ctx, D, bank, a, night, dusk) {
  const len = shadowLength(night, dusk) * 1.9, o = bank.outline, dx = 32 * len, dy = 16 * len, prev = ctx.globalAlpha, z = D.z - 4, [gx, gy, w, d] = D.fp;
  ctx.globalAlpha = prev * a * 0.07; quad(ctx, [P(gx - 0.5, gy - 0.5, z), P(gx + w + len * 1.5 + 0.5, gy - 0.5, z), P(gx + w + len * 1.5 + 0.5, gy + d + 0.5, z), P(gx - 0.5, gy + d + 0.5, z)], CLOUD.shadow);
  ctx.globalAlpha = prev * a * 0.14; quad(ctx, [[o[0][0] + dx, o[0][1] + dy], [o[1][0] + dx, o[1][1] + dy], [o[2][0] + dx, o[2][1] + dy], [o[3][0] + dx, o[3][1] + dy]], CLOUD.shadow);
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
  const f = w.fxOf, hits = w.hits.length, over = w.overlay.length, lit = w.lights.length;
  for (const p of D.props) {
    if (!TALL.has(p.t) || p.h < DOME + 14) continue;
    const bx = (p.gx - p.gy) * 32 + 0, by = (p.gx + p.gy + p.w) * 16 - p.z;
    if (bx < view.x0 - 80 || bx > view.x1 + 80 || by < view.y0 || by - p.h > view.y1) continue;
    ctx.save(); ctx.beginPath(); ctx.rect(view.x0, view.y0 - 400, view.x1 - view.x0, by - DOME - (view.y0 - 400)); ctx.clip();
    w.fxOf = () => NOFX; try { runLayer('static', w, ctx, view, p); } finally { w.fxOf = f; }
    ctx.restore();
    w.hits.length = hits; w.overlay.length = over; w.lights.length = lit; // the frame pushes the hit and the labels of a prop: they are the first drawing's
    const r = 22 + p.w * 4, cy = by - DOME + 4, t = tones.tiers[2];
    for (const [dx, dy, k] of [[-0.55, 0.1, 0.8], [0.5, 0.15, 0.9], [0, -0.25, 0.7]]) { const q = r * k; ctx.fillStyle = t.belly; ctx.beginPath(); ctx.arc(bx + dx * r + r * 0.12, cy + dy * r + r * 0.22, q, 0, 6.2832); ctx.fill(); ctx.fillStyle = t.body; ctx.beginPath(); ctx.arc(bx + dx * r, cy + dy * r, q, 0, 6.2832); ctx.fill(); ctx.fillStyle = t.top; ctx.beginPath(); ctx.arc(bx + dx * r - q * 0.1, cy + dy * r - q * 0.2, q * 0.6, 0, 6.2832); ctx.fill(); }
  }
}

const SEEN = new WeakMap(); // per world: the districts it has drawn under cloud, and when each was last seen opening (for the reduced-motion cross-fade)
function drawClouds(ctx, view, env, w, vz) {
  const zoom = w.cam.z, t = env.t, calm = w.reduced(), warm = Math.min(1, (w.dusk || 0) * 1.1), cool = Math.min(1, (env.night || 0) * 0.8), tones = bankTones(warm, cool);
  const sc = crossOf(w, zoom, calm); let seen = SEEN.get(w); if (!seen) SEEN.set(w, seen = new Map());
  for (const id of vz) {
    const D = DIST[id]; let fx = w.fxOf(id), dis = null, a = fx.fog;
    if (fx.fog > 0.01) seen.set(id, -1);                                              // locked (or opening): remembered
    else if (calm && seen.has(id)) { // opened while motion is reduced: the engine has no reveal then, so the bank cross-fades out in 400 ms of the world's own clock
      let t0 = seen.get(id); if (t0 < 0) { t0 = w.t; seen.set(id, t0); } const k = (w.t - t0) / 400;
      if (k >= 1) { seen.delete(id); continue; } a = 1 - k; fx = { dim: 0, fog: a, lights: 0 }; w.dirty = true;
    } else { if (seen.has(id)) seen.delete(id); continue; }
    const rv = w.reveal[id]; if (rv && !calm) { const ms = w.t - rv.t0; if (ms >= 0) { const g = D.gateAt || { x: D.cx, y: D.cy }, [gx, gy] = P(g.x, g.y, D.z); dis = { ms, gx, gy, span: (D.fp[2] + D.fp[3]) * 32 }; a = 1; } }
    const bank = bankOf(D, sc[0]), old = sc[1] ? bankOf(D, sc[1]) : null, box = (old || bank).box;
    if (box.x1 + 80 < view.x0 || box.x0 - 30 > view.x1 || box.y1 + 30 < view.y0 || box.y0 - 30 > view.y1) continue;
    const phase = (id * 2.399) % 6.28318;
    paintShadow(ctx, D, bank, dis ? 1 - smoothstep(dis.ms, 300, 1800) : a, env.night || 0, w.dusk || 0);
    if (old) paintBank(ctx, old, { t, alpha: a, tones, phase, view, zoom, dis, lite: w.lite, grow: 1 - 0.3 * sc[2] }); // the bank it replaces shrinks as the new one grows over it
    paintBank(ctx, bank, { t, alpha: a, tones, phase, view, zoom, dis, lite: w.lite, grow: sc[2] });
    if (!dis) {
      pokeOut(ctx, view, w, id, D, tones, a, zoom);
      const lock = smoothstep(zoom, 0.42, 0.55) * a; if (lock > 0.02) { const [lx, ly] = P(D.cx, D.cy, D.z + 96); paintPadlock(ctx, lx, ly, t, lock); }
    }
  }
}
registerLayer('clouds', drawClouds, 'world');
