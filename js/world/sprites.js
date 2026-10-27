// The offscreen cache for static scenery. A building is walls, windows, a roof and a sign: hundreds of path operations that look the same every frame.
// This draws such a prop once into its own canvas and from then on only blits it. What it draws: nothing of its own, it records what a layer's body() draws.
// What it never does: cache anything that moves (smoke, flicker, lights and signs that change are a layer's live() part, drawn after the blit), read game state,
// or change where anything stands (a sprite is blitted on the same pixel grid its own drawing would land on).
//
// A sprite is keyed by prop, zoom bucket (1/16 octave), fog bucket and night bucket (eighths): night moves windows on one by one, so eight steps read as evening
// coming on. While the zoom is changing (a wheel turn, a camera glide) props are drawn directly and nothing is built, so a gesture never pays for a rebuild;
// once the scale has rested 90 ms the next frame builds what is missing. Memory is bounded (SPRITE_BUDGET pixels, least recently used go first).
// Where there is no canvas (a Node test) drawSprite() answers undefined and the caller draws directly, exactly as before.

export const SPRITE_BUDGET = 22e6;    // pixels across every sprite: about 88 MB of 4-byte pixels
const MAX_SIDE = 3072;                // a sprite wider or taller than this (device pixels) is not cached
const MOVING_MS = 90;                 // the scale must rest this long before sprites are built
const PER_PROP = 3;                   // variants kept per prop (zoom, fog or night differ)
const STORE = new WeakMap();          // prop -> its entries
const ALL = new Set();                // every entry, for eviction
export const stats = { builds: 0, hits: 0, direct: 0, evicted: 0, pixels: 0 };
let tick = 0, lastA = 0, changedAt = 0, enabled = true;

const canUse = () => typeof OffscreenCanvas !== 'undefined' || (typeof document !== 'undefined' && typeof HTMLCanvasElement !== 'undefined');
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
const drop = (e) => { ALL.delete(e); stats.pixels -= e.w * e.h; try { if (typeof e.img.close === 'function') e.img.close(); else { e.img.width = 0; e.img.height = 0; } } catch { /* already gone */ } };
function trim() { // least recently used first, down to 85% of the budget
  const list = [...ALL].sort((a, b) => a.last - b.last);
  for (const e of list) { if (stats.pixels <= SPRITE_BUDGET * 0.85) break; const arr = STORE.get(e.p); if (arr) arr.splice(arr.indexOf(e), 1); drop(e); stats.evicted++; }
}
/** Forget every sprite (tests, and a quality change that wants a clean slate). */
export function clearSprites() { for (const e of [...ALL]) { const arr = STORE.get(e.p); if (arr) arr.length = 0; drop(e); } ALL.clear(); stats.pixels = 0; }
/** Switch the cache off (every prop draws directly) or back on: for comparisons, tests and a quality setting that would rather not hold the memory. */
export function enableSprites(on) { enabled = !!on; if (!enabled) clearSprites(); }

/**
 * Draw prop p through the cache. layer = { body(ctx, p, env) -> hit polygons, night: bool (does the look change with the night?), pad: [l, t, r, b] extra room in px }.
 * Returns the hit polygons, or undefined when the cache cannot serve this draw (no canvas, a gesture in progress with nothing built yet, a sprite too large):
 * the caller then draws directly.
 */
export function drawSprite(ctx, p, env, layer) {
  if (!enabled || !canUse() || typeof ctx.getTransform !== 'function') return undefined;
  const M = ctx.getTransform(), a = M.a;
  if (!(a > 0) || M.b || M.c) return undefined;
  const now = performance.now();
  if (a !== lastA) { lastA = a; changedAt = now; }
  const key = Math.round(Math.log2(a) * 16), dq = Math.round((env.dim || 0) * 16), nq = layer.night === false ? 0 : Math.round((env.night || 0) * 8);
  const fl = (env.lite ? 1 : 0) | (env.crunch ? 2 : 0);
  let arr = STORE.get(p), e = null;
  if (arr) for (let i = 0; i < arr.length; i++) { const c = arr[i]; if (c.key === key && c.dq === dq && c.nq === nq && c.fl === fl) { e = c; break; } }
  if (!e) {
    if (now - changedAt < MOVING_MS) { stats.direct++; return undefined; } // the zoom is moving: draw directly, build when it rests
    e = build(ctx, p, env, layer, key, dq, nq, fl, a);
    if (!e) return undefined;
    if (!arr) STORE.set(p, arr = []);
    if (arr.length >= PER_PROP) { let o = 0; for (let i = 1; i < arr.length; i++) if (arr[i].last < arr[o].last) o = i; drop(arr[o]); arr.splice(o, 1); }
    arr.push(e); ALL.add(e); stats.pixels += e.w * e.h; stats.builds++;
    if (stats.pixels > SPRITE_BUDGET) trim();
  } else stats.hits++;
  e.last = ++tick;
  // blit on whole device pixels (a sprite on a half pixel would be a blurred copy of itself); at the zoom it was built for this is a straight copy
  const k = a / e.s;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(e.img, Math.round(a * e.x0 + M.e), Math.round(a * e.y0 + M.f), e.w * k, e.h * k);
  ctx.restore();
  return e.polys;
}

function build(ctx, p, env, layer, key, dq, nq, fl, a) {
  const s = Math.pow(2, key / 16), pad = layer.pad || ZERO, sh = (p.h || 0) * 0.55; // the shadow runs right and down past the footprint
  const x0 = Math.floor(p.bb[0] - 6 - pad[0]), y0 = Math.floor(p.bb[1] + (p.z || 0) + 22 - pad[1]); // bb leaves 46 px over the back corner; roofs and chimneys need 20
  const x1 = Math.ceil(p.bb[2] + 8 + pad[2] + sh), y1 = Math.ceil(p.bb[3] + (p.z || 0) + 10 + pad[3] + sh * 0.5);
  const w = Math.ceil((x1 - x0) * s), h = Math.ceil((y1 - y0) * s);
  if (w < 1 || h < 1 || w > MAX_SIDE || h > MAX_SIDE) return null;
  const cv = makeCanvas(w, h), g = cv.getContext('2d'); if (!g) return null;
  g.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
  // a body sees a still world: no clock, no wind, nowhere to put lights; fog and night are the buckets it is keyed by
  const benv = { t: 0, wind: 0, lights: null, zoff: 0, locked: false, far: false, lite: !!env.lite, crunch: !!(fl & 2), dim: dq / 16, night: nq / 8, hz: env.hz, boardText: null, surge: false, alertAudit: false };
  let polys;
  try { polys = layer.body(g, p, benv) || null; } catch (err) { try { cv.width = 0; } catch { /* nothing to free */ } throw err; }
  // an OffscreenCanvas hands its pixels over as an immutable bitmap, the cheapest thing to blit (a canvas source is re-checked for changes at every draw)
  let img = cv; if (typeof cv.transferToImageBitmap === 'function') { try { img = cv.transferToImageBitmap(); } catch { img = cv; } }
  return { p, img, w, h, s, x0, y0, key, dq, nq, fl, polys, last: 0 };
}
const ZERO = [0, 0, 0, 0];
