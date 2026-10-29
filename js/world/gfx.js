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

// ---------------------------------------------------------------- the pixel ledger, the releasers and the time-slicer (docs/RENDER_PLAN.md section 3)
// Three small interfaces every track's caches use, so the 160 MB ceiling is a number the world can read and a test can hold, and so a bitmap is never kept past the screen that wanted it.

/** The ceiling for canvas pixels the world may hold at a density of 2 (MB of 4 bytes a pixel): the main canvas, every offscreen surface, every sprite. */
export const LEDGER_LIMIT_MB = 160;
const LEDGER = new Map();
/**
 * The pixel ledger. A cache that holds canvas pixels says so under a name of its own: `ledger.register('sea.rings', bytes)` when it makes or resizes its surface (replacing what it said before), `ledger.release(name)`
 * when it gives them back. `bytes` is width x height x 4 (`ledger.bytesOf(w, h)`); a cache of many surfaces registers the sum. A name is the module's own ('ground.chunks', 'light.day', 'sprites'): one holder, one name.
 */
export const ledger = {
  /** Say what a holder holds now (bytes; 0 or less gives it back). Answers the holder's bytes. */
  register(name, bytes) {
    if (typeof name !== 'string' || !name) throw new TypeError('a ledger holder has a name');
    const b = Number.isFinite(bytes) && bytes > 0 ? Math.round(bytes) : 0;
    if (b) LEDGER.set(name, b); else LEDGER.delete(name);
    return b;
  },
  release(name) { return LEDGER.delete(name); },
  /** Bytes held by every holder, or by one. */
  total(name) { if (name !== undefined) return LEDGER.get(name) || 0; let t = 0; for (const b of LEDGER.values()) t += b; return t; },
  /** [name, bytes] for every holder, the largest first. */
  entries() { return [...LEDGER.entries()].sort((a, b) => b[1] - a[1]); },
  /** The bytes of a w x h surface (4 bytes a pixel). */
  bytesOf: (w, h) => Math.max(0, Math.ceil(w)) * Math.max(0, Math.ceil(h)) * 4,
  clear() { LEDGER.clear(); },
  /** Is the ledger under the ceiling (in MB, 1 MB = 1,000,000 bytes, as the plan's tables count)? */
  within: (limitMb = LEDGER_LIMIT_MB) => ledger.total() <= limitMb * 1e6,
};

const RELEASERS = new Set();
/**
 * Register a function World.release() calls when the world gives its bitmaps back (the screen went away, or the page is being torn down). A module that keeps surfaces, sprites, paths or chunks of its own
 * registers its releaser once, when it loads; the function drops them and tells the ledger. Answers an unregister function. A releaser that throws does not stop the others.
 */
export function registerReleaser(fn) {
  if (typeof fn !== 'function') throw new TypeError('a releaser is a function');
  RELEASERS.add(fn); return () => RELEASERS.delete(fn);
}
/** Call every registered releaser (World.release does). Answers how many ran. */
export function releaseAll() {
  let n = 0;
  for (const fn of [...RELEASERS]) { try { fn(); n++; } catch { /* one holder failing to let go must not strand the rest */ } }
  return n;
}

/**
 * Run a long build in slices, so a frame is never held by it. `job` is a generator function (or an iterator): each `yield` is a point where the work may stop; the slicer runs it until `ms` milliseconds
 * have gone, then goes on in the next idle moment (requestIdleCallback where there is one, else a timer). Answers { done: Promise (resolves when the job ends, or with `false` when it was cancelled), cancel() }.
 * `o`: { ms: 4 (the slice), now: () => ms (a clock, for tests), later: (fn) => void (the scheduler, for tests) }. A job that throws rejects `done`. The slicer allocates nothing per step but the iterator result.
 */
export function slice(job, o = {}) {
  const it = typeof job === 'function' ? job() : job, ms = o.ms ?? 4, now = o.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const later = o.later || ((fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 250 }) : setTimeout(fn, 0)));
  let off = false, resolve, reject; const done = new Promise((a, b) => { resolve = a; reject = b; });
  const run = () => {
    if (off) { resolve(false); return; }
    const end = now() + ms;
    try {
      for (;;) {
        const r = it.next(); if (r.done) { resolve(true); return; }
        if (off) { resolve(false); return; }
        if (now() >= end) break;
      }
    } catch (err) { reject(err); return; }
    later(run);
  };
  later(run);
  return { done, cancel() { off = true; } };
}
