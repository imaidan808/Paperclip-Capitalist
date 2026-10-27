// World lighting: the time-of-day targets, the colour grade (golden hour, night, rain), baked ambient layers (vignette, atmosphere,
// sun and shade, light shafts), additive light pools stamped from small sprites, and the soft fog over locked districts.
// Presentation only: it reads the world's light state (night, dusk, weather flags, the lights array) and draws; it changes no game state.
// Every layer is baked once at a small size and stamped with drawImage, so a frame pays for a few blits and no gradient is built.
// Where the browser has no OffscreenCanvas (the Node tests) each pass falls back to a direct gradient, as the world always drew.
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
function bakeVignette(g, w, h) { g.clearRect(0, 0, w, h); paintVignette(g, w, h); }
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
/** Night air: a moonlit blue over the far part of the picture and a deeper foot. */
function bakeDay(g, w, h) { bakeAir(g, w, h); g.globalAlpha = 0.8; paintVignette(g, w, h); g.globalAlpha = 1; }
function bakeNight(g, w, h) { bakeAirNight(g, w, h); paintVignette(g, w, h); }
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
export class Lighting {
  constructor() { this.size = ''; this.vig = null; this.day = null; this.night = null; this.shafts = null; }

  /** Bake (or rebake) the ambient layers for a window size. Cheap and rare: only a resize asks for it. */
  bake(W, H) {
    const key = W + 'x' + H; if (key === this.size) return; this.size = key;
    const w = Math.max(8, Math.ceil(W / SCALE)), h = Math.max(8, Math.ceil(H / SCALE));
    const make = (fn) => { const s = surface(w, h); if (!s) return null; fn(s.g, w, h); return s.c; };
    this.vig = make(bakeVignette); this.day = make(bakeDay); this.night = make(bakeNight); this.shafts = make(bakeShafts); // each of day and night is the air and the vignette in one bitmap: one blit
  }

  /** The multiply tint of the grade for the hour and the weather (nothing at all in plain daylight). `w` supplies the light state and the size. */
  tint(ctx, w) {
    const tint = tintOf(w.night, w.dusk, w.env.crunch); if (!tint) return;
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = tint; ctx.fillRect(0, 0, w.W, w.H); ctx.restore();
  }

  /**
   * The air over the finished picture, in screen space (the context carries the device-pixel scale only): daylight haze with the sun's warm and cool sides,
   * night air, the dawn and dusk shafts, and the soft vignette. The lite tier keeps only the vignette.
   */
  ambient(ctx, w) {
    const { W, H, night, dusk } = w, calm = w.reduced(), lite = w.lite, crunch = w.env.crunch;
    this.bake(W, H);
    ctx.save();
    if (!lite && this.day) {
      const day = (1 - night) * (crunch ? 0.6 : 1), nt = clamp(night + (crunch ? 0.3 : 0), 0, 1);
      if (day > 0.02) { ctx.globalAlpha = day; ctx.drawImage(this.day, 0, 0, W, H); }
      if (nt > 0.02) { ctx.globalAlpha = nt; ctx.drawImage(this.night, 0, 0, W, H); }
      if (this.shafts && dusk > 0.05 && !calm && !crunch) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = dusk * 0.38; ctx.drawImage(this.shafts, 0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    } else if (this.vig) { ctx.globalAlpha = clamp(0.8 + night * 0.2, 0, 1); ctx.drawImage(this.vig, 0, 0, W, H); }
    else this.vignetteDirect(ctx, W, H, night);
    ctx.restore();
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
