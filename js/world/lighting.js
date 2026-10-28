// World lighting: the time-of-day targets, the colour grade (golden hour, night, rain), baked ambient layers (vignette, atmosphere,
// sun and shade, light shafts), additive light pools stamped from small sprites, and the soft fog over locked districts.
// Presentation only: it reads the world's light state (night, dusk, weather flags, the lights array) and draws; it changes no game state.
// Every layer is baked once and stamped with drawImage, so a frame pays for a few blits and no gradient is built. The ambient layers are painted at a
// quarter of the window (they are smooth), stretched ONCE into a bitmap of the canvas's own pixels, and stamped one-to-one: a straight copy is about ten
// times cheaper than stretching a small bitmap over the whole window every frame (measured: 0.4 ms against 3.9 ms at 1440x900, 1.6 against 15.3 at 2x).
// Where the browser has no OffscreenCanvas (the Node tests) each pass falls back to a direct gradient, as the world always drew.
// What a full-window pass costs on a CPU-drawn canvas (2160 x 1350, headless Chrome with the GPU off): a plain stamp 0.9 to 1.6 ms, but a stamp or fill in any other composite
// (multiply, lighter) 3.0 to 3.6 ms. So a frame keeps to plain stamps: the shafts, which are additive, are baked into the day and night crossfade with the rest of the air,
// where they cost a pass once a step and nothing in the frames between (the grade's multiply tint is the one pass left in another composite).
import { clamp, h2 } from './iso.js';
import { surface, stampGlow, hasOffscreen } from './gfx.js';

/** The run starts at 08:00 so the first view is daylight. */
export const sunHour = (hour) => ((hour ?? 0) + 8) % 24;

/**
 * Where the light is heading for a virtual hour: `night` (0 bright day, 1 deep night) and `dusk` (0..1, the golden hour either side of the sun).
 * Reduced motion is always plain day, and a very fast clock is held part way so nothing strobes (WCAG 2.3.1): the caller still rate-limits the approach.
 */
export function dayTargets(hour, speed, calm, out = { night: 0, dusk: 0 }) {
  const h = sunHour(hour);
  let night = h >= 7 && h < 17 ? 0 : h >= 17 && h < 20 ? (h - 17) / 3 : h >= 4 && h < 7 ? 1 - (h - 4) / 3 : 1;
  const bump = (c, w) => Math.max(0, 1 - ((h - c) / w) ** 2);
  let dusk = Math.max(bump(17.8, 1.7), bump(6.1, 1.2)); // the golden hour comes before the blue: while the night is still about a quarter dark
  if (calm) { night = 0; dusk = 0; } else if (speed >= 16) { night = 0.3; dusk = 0; }
  out.night = night; out.dusk = dusk; return out;
}

const NIGHT = [105, 125, 185], GOLD = [255, 205, 158], RAIN = [190, 204, 226];
let tintKey = -1, tintStr = 'rgb(255,255,255)';
/**
 * The multiply colour of the grade for the light now: white by day, warm gold at dawn and dusk, cool blue at night, greyer in a credit crunch.
 * Returns the css string (the same string object until the colour changes, so a still sky allocates nothing) or '' when it is plain white.
 */
export function tintOf(night, dusk, crunch) {
  let r = 255, g = 255, b = 255;
  if (dusk > 0.01) { const k = dusk * (1 - night * 0.55) * 0.85; r += (GOLD[0] - r) * k; g += (GOLD[1] - g) * k; b += (GOLD[2] - b) * k; }
  if (night > 0) { r += (NIGHT[0] - r) * night; g += (NIGHT[1] - g) * night; b += (NIGHT[2] - b) * night; }
  if (crunch) { r *= RAIN[0] / 255; g *= RAIN[1] / 255; b *= RAIN[2] / 255; }
  r = Math.round(r); g = Math.round(g); b = Math.round(b);
  if (r > 252 && g > 252 && b > 252) return '';
  const key = (r << 16) | (g << 8) | b;
  if (key !== tintKey) { tintKey = key; tintStr = `rgb(${r},${g},${b})`; }
  return tintStr;
}

// ---------------------------------------------------------------------------------------------- baked ambient layers
const SCALE = 4; // the layers are smooth, so they are baked at a quarter of the window and stretched when stamped

function paintVignette(g, w, h) {
  g.save(); g.translate(w / 2, h * 0.5); g.scale(w / h, 1); // an ellipse that follows the window's shape
  const R = h * 0.8, gr = g.createRadialGradient(0, 0, R * 0.4, 0, 0, R);
  gr.addColorStop(0, 'rgba(6,10,24,0)'); gr.addColorStop(0.5, 'rgba(6,10,24,0.05)'); gr.addColorStop(0.8, 'rgba(6,10,24,0.22)'); gr.addColorStop(1, 'rgba(6,10,24,0.42)');
  g.fillStyle = gr; g.fillRect(-h * 3, -h * 3, h * 6, h * 6); g.restore();
}
/** Daylight air: a pale haze over the far (upper) part of the picture, the near foot sinking a little, and the sun's warm side against a cool shade. */
function bakeAir(g, w, h) {
  g.clearRect(0, 0, w, h);
  let gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(178,208,234,0.24)'); gr.addColorStop(0.3, 'rgba(178,208,234,0.08)'); gr.addColorStop(0.5, 'rgba(178,208,234,0)'); gr.addColorStop(0.8, 'rgba(10,16,34,0)'); gr.addColorStop(1, 'rgba(10,16,34,0.16)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  gr = g.createLinearGradient(0, 0, w, h); // the sun stands upper left: every cast shadow in the world runs to the lower right
  gr.addColorStop(0, 'rgba(255,226,160,0.15)'); gr.addColorStop(0.5, 'rgba(255,226,160,0)'); gr.addColorStop(1, 'rgba(36,60,118,0.12)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}
/**
 * Distance falloff, the stand-in for depth of field. The camera looks at the centre of the window, so a point's distance from the focus is its distance from the
 * centre on the screen (squashed to the 2:1 ground plane by the ellipse): the picture is cleanest where the camera looks and gives way to the air's own colour toward
 * the edge, losing contrast and colour the further it lies. Baked into the day and night layers, so it costs the frame nothing.
 */
function paintFalloff(g, w, h, rgb, a) {
  g.save(); g.translate(w / 2, h * 0.52); g.scale(w / h, 1);
  const R = h * 0.78, gr = g.createRadialGradient(0, 0, R * 0.3, 0, 0, R);
  gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(0.4, `rgba(${rgb},${a * 0.1})`); gr.addColorStop(0.72, `rgba(${rgb},${a * 0.5})`); gr.addColorStop(1, `rgba(${rgb},${a})`);
  g.fillStyle = gr; g.fillRect(-h * 3, -h * 3, h * 6, h * 6); g.restore();
}
/** Day: the air, the falloff toward pale haze, and a lighter vignette. Night: the moonlit air, a falloff toward deep blue, and the full vignette. */
function bakeDay(g, w, h) { bakeAir(g, w, h); paintFalloff(g, w, h, '196,218,238', 0.2); g.globalAlpha = 0.6; paintVignette(g, w, h); g.globalAlpha = 1; }
function bakeNight(g, w, h) { bakeAirNight(g, w, h); paintFalloff(g, w, h, '40,62,120', 0.22); paintVignette(g, w, h); }
/** Night air: a moonlit blue over the far part of the picture and a deeper foot. */
function bakeAirNight(g, w, h) {
  g.clearRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(46,72,140,0.34)'); gr.addColorStop(0.35, 'rgba(46,72,140,0.1)'); gr.addColorStop(0.55, 'rgba(46,72,140,0)'); gr.addColorStop(0.8, 'rgba(2,4,12,0)'); gr.addColorStop(1, 'rgba(2,4,12,0.28)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}
/** Slanting light shafts from the upper left, drawn additively at dawn and dusk. Three nested strips per shaft make a soft edge. */
function bakeShafts(g, w, h) {
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) {
    const x0 = w * (0.0 + 0.27 * i + h2(i, 5) * 0.08), wd = w * (0.07 + h2(i, 6) * 0.05), sk = h * 0.62;
    for (let k = 0; k < 4; k++) {
      const wk = wd * (1 - k * 0.22), x = x0 + (wd - wk) / 2, gr = g.createLinearGradient(x, 0, x + sk * 0.5, h);
      gr.addColorStop(0, 'rgba(255,206,130,0.16)'); gr.addColorStop(0.5, 'rgba(255,190,110,0.05)'); gr.addColorStop(1, 'rgba(255,190,110,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + wk, 0); g.lineTo(x + wk + sk, h); g.lineTo(x + sk, h); g.closePath(); g.fill();
    }
  }
}

// ---------------------------------------------------------------------------------------------- fog sprites
let FOG = null;
/** The dark pool and two banks of soft cloud that lie over a locked district; baked once for the whole page. */
function fogSprites() {
  if (FOG !== null) return FOG;
  if (!hasOffscreen()) return false;
  const pool = surface(192, 192), clouds = [surface(256, 128), surface(256, 128)];
  if (!pool || !clouds[0] || !clouds[1]) return false;
  const g = pool.g, gr = g.createRadialGradient(96, 96, 96 * 0.1, 96, 96, 96); // the stops are the world's own, so a locked district reads as before
  gr.addColorStop(0, 'rgba(14,20,32,0.55)'); gr.addColorStop(0.55, 'rgba(14,20,32,0.4)'); gr.addColorStop(1, 'rgba(14,20,32,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 192, 192);
  clouds.forEach((s, v) => {
    for (let i = 0; i < 9; i++) {
      const x = 40 + h2(v * 11 + i, 21) * 176, y = 40 + h2(v * 11 + i, 22) * 48, r = 26 + h2(v * 11 + i, 23) * 34;
      const c = s.g.createRadialGradient(x, y, 0, x, y, r); c.addColorStop(0, 'rgba(176,190,214,0.30)'); c.addColorStop(0.5, 'rgba(150,166,194,0.14)'); c.addColorStop(1, 'rgba(150,166,194,0)');
      s.g.fillStyle = c; s.g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  return (FOG = { pool: pool.c, clouds: [clouds[0].c, clouds[1].c] });
}

// ---------------------------------------------------------------------------------------------- the lighting passes
const IDLE_MS = 20000; // a full-size layer nobody has stamped for this long is let go (night's and the shafts' come back in one stretch when the light returns)
const LAYERS = ['day', 'night', 'shafts', 'mix'];
const STEPS = 24; // the crossfade of day and night is made in this many steps (each a still bitmap), so a dusk costs a few dozen makes and one stamp a frame, not two stamps a frame
const SHAFT_STEPS = 8; // the strength of the dusk and dawn shafts baked into it: eight steps, so the shafts add at most eight makes to a dusk
export class Lighting {
  constructor() {
    this.size = ''; this.src = { day: null, night: null, shafts: null };           // the layers as painted, a quarter of the window each
    this.big = { day: null, night: null, shafts: null, mix: null }; this.bigKey = ''; this.used = { day: 0, night: 0, shafts: 0, mix: 0 }; // the same, stretched to the canvas's own pixels (made on first use)
    this.mixG = null; this.mixAt = '';                                              // the crossfade's context, and the step it shows
    this.perFrame = Infinity; this.allow = Infinity;                                 // how many full-size layers one `ambient` may make or remake (the world sets 1: see `layer`)
  }

  /** Let go of every layer (the screen is leaving): the next `ambient` bakes and stretches what it needs again. */
  release() {
    this.size = ''; this.bigKey = ''; this.mixG = null; this.mixAt = '';
    this.src.day = this.src.night = this.src.shafts = null;
    this.big.day = this.big.night = this.big.shafts = this.big.mix = null;
  }

  /** Paint (or repaint) the ambient layers for a window size. Cheap and rare: only a resize asks for it. */
  bake(W, H) {
    const key = W + 'x' + H; if (key === this.size) return; this.size = key;
    const w = Math.max(8, Math.ceil(W / SCALE)), h = Math.max(8, Math.ceil(H / SCALE));
    const make = (fn) => { const s = surface(w, h); if (!s) return null; fn(s.g, w, h); return s.c; };
    this.src.day = make(bakeDay); this.src.night = make(bakeNight); this.src.shafts = make(bakeShafts); // each of day and night is the air, the falloff and the vignette in one bitmap: one blit
    this.big.day = this.big.night = this.big.shafts = this.big.mix = null; this.mixG = null;
  }

  /**
   * A layer at the canvas's own pixel size, ready to stamp one-to-one. The stretch from the small bake happens here, once; a layer is made the first frame
   * it is wanted (a daylit sky never makes the night's) and let go after IDLE_MS unused, so the memory is what the light of the moment needs.
   */
  layer(name, pw, ph, t) {
    this.fit(pw, ph); this.used[name] = t;
    let c = this.big[name]; if (c) return c;
    if (this.allow < 1) return null; // this frame has made its one full-size layer already: the caller does without until the next frame
    const src = this.src[name], s = src && surface(pw, ph); if (!s) return null;
    this.allow--;
    s.g.drawImage(src, 0, 0, pw, ph);
    return (this.big[name] = s.c);
  }
  /** Layers are for one canvas size; a different size drops them all. */
  fit(pw, ph) {
    const key = pw + 'x' + ph; if (key !== this.bigKey) { this.big.day = this.big.night = this.big.shafts = this.big.mix = null; this.mixG = null; this.bigKey = key; }
  }

  /**
   * Day and night crossfaded into one bitmap at `dq` and `nq` steps of STEPS, with the dusk and dawn shafts at `sq` steps of SHAFT_STEPS added in: made when a step changes,
   * stamped in one go every frame between. A step that cannot be made this frame (the frame's one full-size layer has gone to a layer it is made of, say) leaves the step
   * before on show, a twenty-fourth away, and is made on the next; null while there is none yet. A zero leaves that part out (a morning with no night left in it, still shafts).
   */
  mix(pw, ph, dq, nq, sq, t) {
    this.fit(pw, ph); const at = dq + '|' + nq + '|' + sq;
    if (this.big.mix && this.mixAt === at) { this.used.mix = t; return this.big.mix; }
    const a = dq ? this.layer('day', pw, ph, t) : true, b = nq ? this.layer('night', pw, ph, t) : true, c = sq ? this.layer('shafts', pw, ph, t) : true;
    if (!a || !b || !c || this.allow < 1) return this.big.mix;
    this.allow--; this.used.mix = t;
    if (!this.big.mix) { const s = surface(pw, ph); if (!s) return null; this.big.mix = s.c; this.mixG = s.g; this.mixAt = ''; }
    const g = this.mixG; g.clearRect(0, 0, pw, ph);
    if (dq) { g.globalAlpha = dq / STEPS; g.drawImage(a, 0, 0); }
    if (nq) { g.globalAlpha = nq / STEPS; g.drawImage(b, 0, 0); }
    if (sq) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = (sq / SHAFT_STEPS) * 0.38; g.drawImage(c, 0, 0); g.globalCompositeOperation = 'source-over'; } // light adds to the air it stands in
    g.globalAlpha = 1;
    this.mixAt = at; return this.big.mix;
  }

  /** The multiply tint of the grade for the hour and the weather (nothing at all in plain daylight). `w` supplies the light state and the size. */
  tint(ctx, w) {
    const tint = tintOf(w.night, w.dusk, w.env.crunch); if (!tint) return;
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = tint; ctx.fillRect(0, 0, w.W, w.H); ctx.restore();
  }

  /**
   * The air over the finished picture, in screen space (the context carries the device-pixel scale only): daylight haze with the sun's warm and cool sides,
   * night air, the dawn and dusk shafts, and the soft vignette. The lite tier stamps the stronger of day and night and leaves out the shafts.
   */
  ambient(ctx, w) {
    const { W, H, night, dusk } = w, calm = w.reduced(), lite = w.lite, crunch = w.env.crunch, t = w.t;
    this.bake(W, H); this.allow = this.perFrame;
    if (!this.src.day) { ctx.save(); this.vignetteDirect(ctx, W, H, night); ctx.restore(); return; } // no offscreen surfaces: one gradient, as the world always drew
    const pw = w.cv?.width || Math.ceil(W * (w.dpr || 1)), ph = w.cv?.height || Math.ceil(H * (w.dpr || 1));
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); // device pixels: every layer is a one-to-one copy of the canvas's own size
    if (lite) { // the quiet tier: whichever of day and night is stronger, one stamp, no shafts
      const L = this.layer(night > 0.5 ? 'night' : 'day', pw, ph, t); if (L) { ctx.globalAlpha = clamp(0.8 + night * 0.2, 0, 1); ctx.drawImage(L, 0, 0); }
    } else {
      const day = (1 - night) * (crunch ? 0.6 : 1), nt = clamp(night + (crunch ? 0.3 : 0), 0, 1), dayOn = day > 0.02, nightOn = nt > 0.02;
      const sq = dusk > 0.05 && !calm && !crunch ? Math.round(clamp(dusk, 0, 1) * SHAFT_STEPS) : 0; // the dawn and dusk shafts (none in rain or reduced motion)
      if ((dayOn && nightOn) || sq) { // the dusk and dawn, and rain by day: both airs and the shafts at once, one stamp
        const L = this.mix(pw, ph, dayOn ? Math.round(day * STEPS) : 0, nightOn ? Math.round(nt * STEPS) : 0, sq, t);
        if (L) ctx.drawImage(L, 0, 0);
        else if (dayOn) { const D = this.layer('day', pw, ph, t); if (D) { ctx.globalAlpha = day; ctx.drawImage(D, 0, 0); } } // not made yet (one full-size layer a frame): the day's air alone, for a frame or two
        else { const N = this.layer('night', pw, ph, t); if (N) { ctx.globalAlpha = nt; ctx.drawImage(N, 0, 0); } }
      }
      else if (dayOn) { const L = this.layer('day', pw, ph, t); if (L) { ctx.globalAlpha = day; ctx.drawImage(L, 0, 0); } }
      else if (nightOn) { const L = this.layer('night', pw, ph, t); if (L) { ctx.globalAlpha = nt; ctx.drawImage(L, 0, 0); } }
    }
    ctx.restore();
    for (const n of LAYERS) if (this.big[n] && t - this.used[n] > IDLE_MS) { this.big[n] = null; if (n === 'mix') this.mixG = null; }
  }
  vignetteDirect(ctx, W, H, night) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2);
    g.addColorStop(0, 'rgba(6,10,24,0)'); g.addColorStop(1, `rgba(6,10,24,${0.3 + 0.12 * night})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  /**
   * The lights the props and lamps pushed this frame, stamped additively: a round halo at the light, and for a street lamp a flattened pool of
   * light on the ground at its foot. `cap` bounds the count (fewer in the lite tier).
   */
  lights(ctx, w, cap) {
    const { W, H, cam, lights } = w, z = cam.z, ox = W / 2 - cam.x * z, oy = H / 2 - cam.y * z;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    let n = 0;
    for (const l of lights) {
      if (n++ >= cap) break;
      const x = l.wx * z + ox, y = l.wy * z + oy, r = l.r * z;
      if (x < -r || x > W + r || y < -r * 2 || y > H + r * 2) continue;
      if (l.gy !== undefined) stampGlow(ctx, l.c, x, l.gy * z + oy, r * 1.3, l.a * 0.9, 0.5);
      if (!stampGlow(ctx, l.c, x, y, r, l.a)) { const g = ctx.createRadialGradient(x, y, 1, x, y, r); g.addColorStop(0, `rgba(${l.c},${l.a})`); g.addColorStop(1, `rgba(${l.c},0)`); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
    }
    ctx.globalAlpha = 1; ctx.restore();
  }

  /**
   * Mist over one locked district (or one that is opening), in world space with the district's centre at the origin and its ellipse squashed to the
   * ground plane: a soft dark pool thickest at the heart and slow banks of cloud drifting across it. `fog` is 0..1, `t` the animation clock.
   */
  fog(ctx, R, fog, t, far) {
    const s = fogSprites();
    if (!s) { // no sprites: the world's original gradient pool and flat wisps
      const gr = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R); gr.addColorStop(0, `rgba(14,20,32,${0.55 * fog})`); gr.addColorStop(0.55, `rgba(14,20,32,${0.4 * fog})`); gr.addColorStop(1, 'rgba(14,20,32,0)');
      ctx.fillStyle = gr; ctx.fillRect(-R, -R, R * 2, R * 2);
      if (!far) { ctx.fillStyle = `rgba(120,135,160,${0.12 * fog})`; for (let i = 0; i < 5; i++) { const u = (t / 26000 + i * 0.21) % 1, x = -R * 0.8 + R * 1.6 * u, y = Math.sin(i * 2.1) * R * 0.35; ctx.beginPath(); ctx.ellipse(x, y, R * 0.28, R * 0.07, 0, 0, 7); ctx.fill(); } }
      return;
    }
    ctx.globalAlpha = fog; ctx.drawImage(s.pool, -R, -R, R * 2, R * 2);
    if (!far) for (let i = 0; i < 5; i++) {
      const u = (t / 26000 + i * 0.21) % 1, x = -R * 0.8 + R * 1.6 * u, y = Math.sin(i * 2.1) * R * 0.35, edge = Math.sin(u * Math.PI); // each bank fades in and out, never pops at the end of its drift
      ctx.globalAlpha = fog * 0.9 * edge; ctx.drawImage(s.clouds[i & 1], x - R * 0.42, y - R * 0.12, R * 0.84, R * 0.24);
    }
    ctx.globalAlpha = 1;
  }
}
