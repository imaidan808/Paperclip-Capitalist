// The V2 grade: the light of the hour laid over the finished world. A bright warm sun by default (nothing multiplied from 07:00 to 16:59), a gold evening with a rose sky and a sun glow in the upper left, a periwinkle
// night that is never murky, soft god rays at dawn and dusk, a haze that thickens as the camera pulls back (distant districts lighter and bluer), and a vignette that is a warm violet and at most a tenth of the picture.
// Owner: T2 ATMOSPHERE (docs/RENDER_PLAN.md, docs/ART_DIRECTION.md sections 1 and 2.7). It replaces lighting.js's grade, whose navy vignette, pale edge falloff and foot of ink made every capture dusk (RENDER_DIAGNOSIS G1 to G4).
//
// How it stays cheap. The air is smooth, so it is made small: five bitmaps of a quarter of the window (day, haze, night, gold, shafts) are mixed into one small bitmap by the light's step, and that one is stretched ONCE into
// the single full-size bitmap `air` (the stretch costs 3.2 ms a megapixel, so it is done in bands over a few frames: a step is a twenty-fourth of the light, and two bands of different steps side by side cannot be seen). A
// frame is one 1:1 copy of `air` (1 ms for a window) and, only while the hour is not plain day, one multiply tint (3 ms; none by day). Where there is no OffscreenCanvas (the Node tests) the air is one gradient.
import { clamp } from './iso.js';
import { Lighting } from './lighting.js';
import { surface, ledger, registerReleaser } from './gfx.js';
import { tintFor } from './palette.js';
import { registerLayer } from './stack.js';
import { DIST, LAYOUT } from './layout.js';
import { coverUnder } from './cloudpaint.js';
import { stampGlow } from './gfx.js';

const SCALE = 4;          // the five sources are a quarter of the window
const BANDS = 4;          // `air` is stretched in this many bands (one a frame while the light moves)
export const STEPS = 24;  // the crossfade of day and night, in twenty-fourths
export const HAZE_STEPS = 8, GOLD_STEPS = 8, SHAFT_STEPS = 8;

const smooth = (x) => { const t = x < 0 ? 0 : x > 1 ? 1 : x; return t * t * (3 - 2 * t); };
/** How thick the distance haze is at a camera zoom, 0 to 1: nothing from the working zoom (0.7 and over) and full at the whole-island view (0.2 and under). Aerial perspective: far things are paler and bluer. */
export const hazeAt = (zoom) => 1 - smooth((zoom - 0.2) / 0.5);
/**
 * The steps the air is mixed at, as integers, so that a still light is one key and a moving one changes it a few dozen times a day: { dq (day, of STEPS), nq (night, of STEPS), gq (the gold evening wash, of GOLD_STEPS),
 * sq (shafts, of SHAFT_STEPS), hq (haze, of HAZE_STEPS) }. A credit crunch (rain) turns the day down to 0.6 and the night up by 0.3, as the world always did; reduced motion and the quiet tier have no shafts.
 */
export function airSteps(night, dusk, crunch, zoom, calm, lite, out = {}) {
  const day = (1 - night) * (crunch ? 0.6 : 1), nt = clamp(night * (1 - 0.55 * clamp(dusk, 0, 1)) + (crunch ? 0.3 : 0), 0, 1); // the golden hour is warm: the blue of the night keeps back while the dusk is high
  out.dq = day > 0.02 ? Math.round(day * STEPS) : 0; out.nq = nt > 0.02 ? Math.round(nt * STEPS) : 0;
  out.gq = dusk > 0.03 && !crunch ? Math.round(clamp(dusk, 0, 1) * GOLD_STEPS * (1 - 0.7 * smooth((night - 0.35) / 0.4))) : 0; // the gold wash gives way to the blue hour's own colour once the night is half in
  out.sq = dusk > 0.05 && !calm && !crunch && !lite ? Math.round(clamp(dusk, 0, 1) * SHAFT_STEPS) : 0;
  out.hq = Math.round(hazeAt(zoom) * HAZE_STEPS * (1 - night * 0.7));
  return out;
}
export const stepKey = (s) => s.dq + (s.nq << 5) + (s.gq << 10) + (s.sq << 14) + (s.hq << 18);

// ---------------------------------------------------------------- the five small bakes
const lin = (g, x0, y0, x1, y1, stops) => { const gr = g.createLinearGradient(x0, y0, x1, y1); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; };
/** Day: the sun's warm wash from the upper left against a cool one from the lower right, and a vignette of warm violet that is a tenth at the corners and clear over the middle three quarters. */
function bakeDay(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = lin(g, 0, 0, w, h, [[0, 'rgba(255,242,189,0.12)'], [0.45, 'rgba(255,242,189,0)'], [1, 'rgba(106,143,224,0.07)']]); g.fillRect(0, 0, w, h);
  g.save(); g.translate(w / 2, h * 0.5); g.scale(w / h, 1);
  const R = h * 0.82, gr = g.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
  gr.addColorStop(0, 'rgba(106,90,156,0)'); gr.addColorStop(0.7, 'rgba(106,90,156,0.04)'); gr.addColorStop(1, 'rgba(106,90,156,0.12)');
  g.fillStyle = gr; g.fillRect(-h * 3, -h * 3, h * 6, h * 6); g.restore();
}
/** Haze: the air's pale blue-white over the far (upper) part of the picture, thickest at the top and gone by 60% of the height; its strength is the camera's pull back (hazeAt). */
function bakeHaze(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = lin(g, 0, 0, 0, h, [[0, 'rgba(236,244,255,0.46)'], [0.3, 'rgba(226,238,252,0.24)'], [0.6, 'rgba(222,236,252,0)'], [1, 'rgba(222,236,252,0)']]); g.fillRect(0, 0, w, h);
}
/** Night: a periwinkle moonlit air from the top, a soft lift over everything so the picture is never murky, and a plum vignette at the corners. */
function bakeNight(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = lin(g, 0, 0, 0, h, [[0, 'rgba(158,174,252,0.26)'], [0.4, 'rgba(140,156,240,0.12)'], [1, 'rgba(112,120,214,0.06)']]); g.fillRect(0, 0, w, h);
  g.save(); g.translate(w * 0.7, h * 0.08); g.scale(w / h, 1); const m = g.createRadialGradient(0, 0, 0, 0, 0, h * 0.7); m.addColorStop(0, 'rgba(210,222,255,0.16)'); m.addColorStop(1, 'rgba(210,222,255,0)'); g.fillStyle = m; g.fillRect(-h, -h, h * 2, h * 2); g.restore();
  g.save(); g.translate(w / 2, h * 0.5); g.scale(w / h, 1);
  const R = h * 0.82, gr = g.createRadialGradient(0, 0, R * 0.5, 0, 0, R); gr.addColorStop(0, 'rgba(60,56,120,0)'); gr.addColorStop(1, 'rgba(60,56,120,0.2)');
  g.fillStyle = gr; g.fillRect(-h * 3, -h * 3, h * 6, h * 6); g.restore();
}
/** Gold: the evening's rose sky across the top and the low sun's glow in the upper left, over everything a little warm. */
function bakeGold(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = lin(g, 0, 0, 0, h, [[0, 'rgba(255,140,150,0.22)'], [0.5, 'rgba(255,164,120,0.09)'], [1, 'rgba(255,176,100,0.05)']]); g.fillRect(0, 0, w, h);
  g.save(); g.translate(w * 0.06, h * 0.04); g.scale(w / h, 1); const s = g.createRadialGradient(0, 0, 0, 0, 0, h * 1.15); s.addColorStop(0, 'rgba(255,226,150,0.55)'); s.addColorStop(0.3, 'rgba(255,190,110,0.24)'); s.addColorStop(1, 'rgba(255,150,100,0)'); g.fillStyle = s; g.fillRect(-h, -h, h * 3, h * 3); g.restore();
}
/** Shafts: five soft bands of low sunlight slanting down and to the right from the upper left, each fading with its length and soft at both edges (one horizontal gradient for the edges, a vertical one for the length). */
function bakeShafts(g, w, h, tmp) {
  g.clearRect(0, 0, w, h);
  const sk = 0.62, bands = [[0.04, 0.1, 1], [0.2, 0.07, 0.8], [0.36, 0.12, 1], [0.54, 0.08, 0.7], [0.72, 0.1, 0.85]];
  for (const [x0, wd, k] of bands) {
    const t = tmp.g; t.clearRect(0, 0, w, h); t.save(); t.setTransform(1, 0, sk, 1, 0, 0);
    t.fillStyle = lin(t, w * x0, 0, w * (x0 + wd), 0, [[0, 'rgba(255,214,150,0)'], [0.5, `rgba(255,214,150,${0.2 * k})`], [1, 'rgba(255,214,150,0)']]); t.fillRect(w * x0, -h * 0.1, w * wd, h * 1.2); t.restore();
    t.globalCompositeOperation = 'destination-in'; t.fillStyle = lin(t, 0, 0, 0, h, [[0, 'rgba(0,0,0,1)'], [0.55, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]); t.fillRect(0, 0, w, h); t.globalCompositeOperation = 'source-over';
    g.drawImage(tmp.c, 0, 0);
  }
}

// ---------------------------------------------------------------- the grade
export class Grade extends Lighting {
  constructor() {
    super();
    this.S = { day: null, haze: null, night: null, gold: null, shafts: null, mix: null }; this.sw = 0; this.sh = 0; this.sizeKey = ''; // the small bakes and the small mix
    this.air = null; this.airKey = ''; this.airAt = -1; this.band = BANDS; this.steps = { dq: 0, nq: 0, gq: 0, sq: 0, hq: 0 }; this.mixKey = -1; this.mixCount = 0; // `air`, the step it shows, the band being stretched
    this.stats = { remix: 0, bands: 0 }; this.locked = [];
  }
  release() {
    super.release(); this.S = { day: null, haze: null, night: null, gold: null, shafts: null, mix: null }; this.sizeKey = ''; this.air = null; this.airKey = ''; this.airAt = -1; this.mixKey = -1; this.band = BANDS;
    ledger.release('light.air'); ledger.release('light.src');
  }

  /** The five small bakes, for a window size (a resize only). */
  bakeSmall(W, H) {
    const key = W + 'x' + H; if (key === this.sizeKey) return this.S.day !== null; this.sizeKey = key;
    const w = Math.max(8, Math.ceil(W / SCALE)), h = Math.max(8, Math.ceil(H / SCALE)), make = (fn, ...r) => { const s = surface(w, h); if (!s) return null; fn(s.g, w, h, ...r); return s.c; };
    const tmp = surface(w, h);
    this.S = { day: make(bakeDay), haze: make(bakeHaze), night: make(bakeNight), gold: make(bakeGold), shafts: tmp ? make(bakeShafts, tmp) : null, mix: null };
    const m = surface(w, h); this.S.mix = m ? m.c : null; this.mixG = m ? m.g : null; this.sw = w; this.sh = h; this.mixKey = -1; this.airKey = ''; this.airAt = -1;
    ledger.register('light.src', ledger.bytesOf(w, h) * 7);
    return this.S.day !== null;
  }

  /**
   * The light pools of the lamps and windows, stamped additively as Lighting.lights does, except that a light standing under a district's cloud is not stamped at all: the cloud is in front of it, so it must not
   * shine on top of the bank like a lamp in front of a sheet (judge F6: glowing blobs inside the cloud where no source could be seen). A light in one of the bank's windows (the art direction's "the windows glow
   * through the gaps") shines in full, and so does every light of a district that is open.
   */
  lights(ctx, w, cap) {
    const { W, H, cam, lights } = w, z = cam.z, ox = W / 2 - cam.x * z, oy = H / 2 - cam.y * z, lk = this.locked; lk.length = 0;
    if (w.unlocked) for (const id of LAYOUT.ids) if (!w.unlocked.has(id)) lk.push(DIST[id]);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; let n = 0;
    for (const l of lights) {
      if (n++ >= cap) break;
      const x = l.wx * z + ox, y = l.wy * z + oy, r = l.r * z; if (x < -r || x > W + r || y < -r * 2 || y > H + r * 2) continue;
      let k = 1; for (let i = 0; i < lk.length; i++) { const D = lk[i], b = D.bb; if (l.wx > b[0] && l.wx < b[2] && l.wy > b[1] && l.wy < b[3]) { k = 1 - coverUnder(D, l.wx, l.wy, l.r); break; } }
      if (k < 0.04) continue;
      if (l.gy !== undefined) stampGlow(ctx, l.c, x, l.gy * z + oy, r * 1.3, l.a * 0.9 * k, 0.5);
      if (!stampGlow(ctx, l.c, x, y, r, l.a * k)) { const g = ctx.createRadialGradient(x, y, 1, x, y, r); g.addColorStop(0, `rgba(${l.c},${l.a * k})`); g.addColorStop(1, `rgba(${l.c},0)`); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
    }
    ctx.globalAlpha = 1; ctx.restore();
  }

  /** The multiply tint of the grade (the palette's: white by day, gold at the edges of the day, periwinkle by night, a cool grey in rain). Nothing at all in plain daylight. */
  tint(ctx, w) {
    const tint = tintFor(w.night, w.dusk, w.env.crunch); if (!tint) return;
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = tint; ctx.fillRect(0, 0, w.W, w.H); ctx.restore();
  }

  /** Mix the small bakes into `S.mix` for a step record (small, so cheap). */
  remix(s) {
    const g = this.mixG, S = this.S, w = this.sw, h = this.sh; g.clearRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
    if (s.dq) { g.globalAlpha = s.dq / STEPS; g.drawImage(S.day, 0, 0); }
    if (s.hq && s.dq) { g.globalAlpha = (s.hq / HAZE_STEPS) * (s.dq / STEPS); g.drawImage(S.haze, 0, 0); }
    if (s.nq) { g.globalAlpha = s.nq / STEPS; g.drawImage(S.night, 0, 0); }
    if (s.gq) { g.globalAlpha = s.gq / GOLD_STEPS; g.drawImage(S.gold, 0, 0); }
    if (s.sq && S.shafts) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = (s.sq / SHAFT_STEPS) * 0.9; g.drawImage(S.shafts, 0, 0); g.globalCompositeOperation = 'source-over'; }
    g.globalAlpha = 1; this.stats.remix++;
  }

  /** Stretch the small mix into band `i` of `air` (the band's rows of the canvas, from the matching rows of the mix). */
  stretch(i, pw, ph) {
    const y0 = Math.floor((ph * i) / BANDS), y1 = i === BANDS - 1 ? ph : Math.floor((ph * (i + 1)) / BANDS), sy0 = (this.sh * y0) / ph, sy1 = (this.sh * y1) / ph, g = this.airG;
    g.clearRect(0, y0, pw, y1 - y0); g.drawImage(this.S.mix, 0, sy0, this.sw, sy1 - sy0, 0, y0, pw, y1 - y0); this.stats.bands++;
  }

  /**
   * The air over the finished picture, in device pixels: ONE stamp of `air`. `air` is remixed when the light's step changes (airSteps) and stretched into place a band a frame; made at once the first time.
   * Without surfaces it is one gradient. The vignette, the haze, the sun's wash, the evening and the night are all in it.
   */
  ambient(ctx, w) {
    const { W, H, night, dusk } = w, zoom = w.cam.z;
    this.allow = this.perFrame;
    const pw = w.cv?.width || Math.ceil(W * (w.dpr || 1)), ph = w.cv?.height || Math.ceil(H * (w.dpr || 1)), s = airSteps(night, dusk, w.env.crunch, zoom, w.reduced(), w.lite, this.steps);
    if (!this.bakeSmall(W, H) || !this.S.mix) { this.direct(ctx, W, H, night, dusk); return; }
    const key = stepKey(s), akey = pw + 'x' + ph;
    if (akey !== this.airKey || !this.air) {
      const a = surface(pw, ph); if (!a) { this.direct(ctx, W, H, night, dusk); return; }
      this.air = a.c; this.airG = a.g; this.airKey = akey; ledger.register('light.air', ledger.bytesOf(pw, ph)); this.mixKey = -1;
    }
    if (key !== this.mixKey) {
      this.remix(s); const first = this.airAt < 0; this.mixKey = key;
      if (first) { for (let i = 0; i < BANDS; i++) this.stretch(i, pw, ph); this.band = BANDS; this.airAt = key; } else { this.band = 0; }
    }
    for (let n = w.reduced() ? BANDS : 1; n > 0 && this.band < BANDS; n--) { this.stretch(this.band++, pw, ph); if (this.band >= BANDS) this.airAt = key; } // a band a frame while the light moves (all of them at once under reduced motion, where the world draws only when it must)
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this.air, 0, 0); ctx.restore();
  }
  /** No surfaces: the picture's air as one gradient from the top (a pale warm haze by day, periwinkle by night). */
  direct(ctx, W, H, night) {
    ctx.save(); ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, night > 0.5 ? 'rgba(150,166,250,0.22)' : 'rgba(255,246,223,0.12)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0)']]); ctx.fillRect(0, 0, W, H); ctx.restore();
  }
}

const GRADES = new WeakMap(), ALL = new Set();
/** The world's V2 grade (made on first use, one per world). */
export function gradeOf(w) {
  let g = GRADES.get(w); if (!g) { g = new Grade(); g.perFrame = w.light?.perFrame ?? Infinity; GRADES.set(w, g); ALL.add(g); }
  return g;
}
registerReleaser(() => { for (const g of ALL) g.release(); });

/** The V2 `grade` layer: the tint for the hour and weather, the lamps' and windows' light pools at night or while a district opens, then the air. Screen space. */
function drawGrade(ctx, view, env, w) {
  const g = gradeOf(w);
  g.tint(ctx, w);
  if (w.night >= 0.04 || w.revealing()) g.lights(ctx, w, w.lite ? 40 : 160);
  g.ambient(ctx, w);
}
registerLayer('grade', drawGrade, 'screen');
