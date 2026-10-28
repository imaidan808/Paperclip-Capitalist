// Shared drawing helpers for the world's presentation layer (lighting, particles, labels, the draw loop).
// Presentation only: nothing here knows about the game. Offscreen surfaces exist only where the browser has OffscreenCanvas;
// everywhere else (the Node tests, very old browsers) `surface()` answers null and every caller draws directly, as it always did.

/** True when this browser can make offscreen canvases. */
export const hasOffscreen = () => typeof OffscreenCanvas === 'function';

/**
 * An offscreen 2D surface of w x h device pixels as { c, g } (canvas, context), or null when there is no OffscreenCanvas.
 * A surface is a bitmap in memory (tens of megabytes at window size): make one for a thing that lasts and paint it again in place when it changes. Never one per frame or per
 * step of the light (the sea did that: about 22 full-window bitmaps a day/night turn, each 8 to 10 ms to fill on a CPU-drawn canvas; it is one 1 x 256 strip now, see World.drawWater).
 */
export function surface(w, h) {
  if (!hasOffscreen()) return null;
  try {
    const c = new OffscreenCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))), g = c.getContext('2d');
    return g ? { c, g } : null;
  } catch { return null; }
}

let SOFT = null;
/**
 * Is this browser drawing canvases on the CPU? A browser whose GPU is off, blocklisted or only emulated (SwiftShader, llvmpipe) refuses a WebGL context asked for with
 * `failIfMajorPerformanceCaveat` (or has no WebGL at all), and a 2D canvas is on the CPU on exactly those machines. Every full-window layer of the world is then a pass over all
 * its pixels on the main thread, so the world caps its pixel density there (see World.targetDpr). Asked once, and only ever on a high-density screen, so a 1x screen pays
 * nothing; no document (the Node tests) answers false. The probe context is released at once.
 */
export function softwareRaster() {
  if (SOFT !== null) return SOFT;
  SOFT = false;
  try {
    if (typeof document === 'undefined') return SOFT;
    const c = document.createElement('canvas'), gl = c.getContext?.('webgl', { failIfMajorPerformanceCaveat: true });
    if (gl) gl.getExtension?.('WEBGL_lose_context')?.loseContext(); else SOFT = typeof c.getContext === 'function';
  } catch { /* a browser that throws on the probe: capable */ }
  return SOFT;
}

/** A small least-recently-used map: sprites live here so the draw loop looks them up instead of drawing them again. */
export class Cache {
  constructor(max = 256) { this.max = max; this.m = new Map(); }
  get(k) { const v = this.m.get(k); if (v !== undefined) { this.m.delete(k); this.m.set(k, v); } return v; }
  set(k, v) { this.m.set(k, v); if (this.m.size > this.max) this.m.delete(this.m.keys().next().value); return v; }
  clear() { this.m.clear(); }
  get size() { return this.m.size; }
}

// Font strings are built once per (weight, size) and handed back by reference, so a label does not make a new string every frame.
const FONTS = new Map();
const fontOf = (family, w, px) => { const k = (family === 'mono' ? 0 : 1e6) + w * 1000 + px; let f = FONTS.get(k); if (!f) { f = family === 'mono' ? `${w} ${px}px ui-monospace, Menlo, Consolas, monospace` : `${px}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`; FONTS.set(k, f); } return f; };
export const mono = (w, px) => fontOf('mono', w, Math.round(px));
export const sans = (px) => fontOf('sans', 400, Math.round(px));

/** Round a CSS-pixel coordinate to the device-pixel grid, so a crisp sprite or a 1px line lands exactly on pixels. */
export const snap = (v, dpr) => Math.round(v * dpr) / dpr;

/** The numbers 'r,g,b' of a '#rrggbb' colour (the form the lights array carries). */
export const rgbOf = (h) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255); };

/**
 * A soft round glow of one colour ('r,g,b'), drawn once into a small surface and then stamped with drawImage at any size.
 * The falloff is steeper than linear (bright core, long soft skirt) so a lamp reads as a pool of light and not a flat disc.
 */
const GLOWS = new Cache(96);
export function glowSprite(rgb) {
  let s = GLOWS.get(rgb);
  if (s !== undefined) return s;
  const S = 64, f = surface(S, S);
  if (!f) return null; // no surfaces here: the caller draws a gradient (not remembered, so a later surface is used)
  const g = f.g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(0.12, `rgba(${rgb},0.82)`); g.addColorStop(0.32, `rgba(${rgb},0.4)`); g.addColorStop(0.62, `rgba(${rgb},0.1)`); g.addColorStop(1, `rgba(${rgb},0)`);
  f.g.fillStyle = g; f.g.fillRect(0, 0, S, S);
  return GLOWS.set(rgb, f.c);
}

/** Stamp a glow of radius r at (x, y) with the given strength; false when there is no sprite (the caller then draws a gradient). */
export function stampGlow(ctx, rgb, x, y, r, a, squash = 1) {
  const s = glowSprite(rgb); if (!s) return false;
  ctx.globalAlpha = a < 1 ? a : 1;
  ctx.drawImage(s, x - r, y - r * squash, r * 2, r * 2 * squash);
  return true;
}
