// The offscreen cache for static scenery. A building is walls, windows, a roof and a sign: hundreds of path operations that look the same every frame.
// This draws such a prop once into its own canvas and from then on only blits it. What it draws: nothing of its own, it records what a layer's body() draws.
// What it never does: cache anything that moves (smoke, flicker, lights and signs that change are a layer's live() part, drawn after the blit), read game state,
// or change where anything stands (a sprite is blitted on the same pixel grid its own drawing would land on).
//
// A sprite is keyed by prop, zoom (1/1024 octave: a sprite is always built at the scale it is shown at, so the blit is a straight copy, which is ten times cheaper than a
// resampled one), fog bucket (sixteenths) and night bucket (eighths): night moves windows on one by one, so eight steps read as evening coming on.
// While the zoom is changing (a wheel turn, a camera glide) props are drawn directly and nothing is built, so a gesture never pays for a rebuild; once the scale has
// rested 90 ms the next frames build what is missing, a few milliseconds' worth a frame (BUILD_MS), and a prop whose turn has not come yet is served by its sprite of
// the neighbouring night or fog step (or drawn directly if it has none), so a dusk that crosses a bucket never rebuilds the whole district in one frame.
// A zoom that is still moving (or a sprite whose turn to be built has not come) shows the prop's sprite of the zoom before, scaled by the ratio of the two, in place of drawing the prop
// again: a scaled copy is one blit, drawing it directly is hundreds of path operations, and the copy is exact again as soon as the zoom rests and its own sprite is built.
// Memory is bounded (the budget below, least recently used go first; the sprite being drawn is never the one to go).
// Where there is no canvas (a Node test) drawSprite() answers undefined and the caller draws directly, exactly as before.

export const SPRITE_BUDGET = 22e6;    // pixels across every sprite at a pixel density of 1: about 88 MB of 4-byte pixels
let budget = SPRITE_BUDGET;           // what is allowed now (setSpriteBudget): the same scenery is more pixels at a higher density, so a sharp screen gets more room, not a thrash
const REUSE_STEPS = Math.round(0.6 * 1024); // a sprite of another zoom stands in for a prop when it is within this many zoom keys (0.6 octave, about 1.5 times) of the one wanted
const BIG_PX = 2.2e6, BIG_REST_MS = 260;    // a sprite of more pixels than this is built only once the scale has rested this long: it is the one build that could take a frame by itself
const MAX_SIDE = 3072;                // a sprite wider or taller than this (device pixels) is not cached
const MOVING_MS = 90;                 // the scale must rest this long before sprites are built
const PER_PROP = 3;                   // variants kept per prop (zoom, fog or night differ)
let BUILD_MS = 3, GAP_MS = 6, MAX_MS = 100; // building time allowed in one frame; a pause of GAP_MS between two calls is a new frame (ground and sky are drawn between frames' props), and no frame is taken to last past MAX_MS
// (the first build of a frame always goes ahead)
const ZOOM_STEPS = 1024;              // zoom keys per octave (a 0.07% step: well inside the straight-copy tolerance)
const STORE = new WeakMap();          // prop -> its entries
const ALL = new Set();                // every entry, for eviction
export const stats = { builds: 0, hits: 0, direct: 0, evicted: 0, pixels: 0, stale: 0, deferred: 0, lost: 0 };
let tick = 0, lastA = 0, changedAt = 0, enabled = true, winAt = -1e9, lastCall = -1e9, spent = 0;

const canUse = () => typeof OffscreenCanvas !== 'undefined' || (typeof document !== 'undefined' && typeof HTMLCanvasElement !== 'undefined');
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
const free = (e) => { try { if (typeof e.img.close === 'function') e.img.close(); else { e.img.width = 0; e.img.height = 0; } } catch { /* already gone */ } };
/** Take an entry out of every table and give its pixels back (the caller removes it from its prop's list). */
const drop = (e) => { if (ALL.delete(e)) stats.pixels -= e.w * e.h; free(e); };
const forget = (e) => { const arr = STORE.get(e.p); if (arr) { const i = arr.indexOf(e); if (i >= 0) arr.splice(i, 1); } drop(e); };
function trim(keep) { // least recently used first, down to 85% of the budget; `keep` (the sprite just built) is never evicted
  const list = [...ALL].sort((a, b) => a.last - b.last);
  for (const e of list) { if (stats.pixels <= budget * 0.85) break; if (e === keep) continue; forget(e); stats.evicted++; }
}
/**
 * Size the memory for a pixel density (the world's canvas density): a density of 1 has SPRITE_BUDGET pixels, and the budget grows with the density towards 1.5 times that (a bit over 130 MB),
 * which holds the working set of one view at 2x (measured: the budget was crossed at every zoom pass, and each pass rebuilt about a hundred sprites it had just dropped).
 */
export function setSpriteBudget(dpr = 1) { budget = Math.round(SPRITE_BUDGET * Math.max(1, Math.min(1.5, 1 + (dpr - 1) * 0.7))); }
/** Forget every sprite (tests, and a quality change that wants a clean slate). */
export function clearSprites() { for (const e of [...ALL]) forget(e); ALL.clear(); stats.pixels = 0; }
/** Switch the cache off (every prop draws directly) or back on: for comparisons, tests and a quality setting that would rather not hold the memory. */
export function enableSprites(on) { enabled = !!on; if (!enabled) clearSprites(); }

/** The box a prop's sprite covers in world pixels: the footprint's bounds with room for the back corner, the shadow to the right and below, and the layer's own pad. */
export function spriteBounds(p, layer) {
  const pad = (layer && layer.pad) || ZERO, sh = (p.h || 0) * 0.55; // the shadow runs right and down past the footprint
  return {
    x0: Math.floor(p.bb[0] - 6 - pad[0]), y0: Math.floor(p.bb[1] + (p.z || 0) + 22 - pad[1]), // bb leaves 46 px over the back corner; roofs and chimneys need 20
    x1: Math.ceil(p.bb[2] + 8 + pad[2] + sh), y1: Math.ceil(p.bb[3] + (p.z || 0) + 10 + pad[3] + sh * 0.5),
  };
}

/** Change how much building one frame allows, and what counts as a frame (tests; a quality setting that wants sprites spread thinner). Starts a fresh frame. */
export function setBuildBudget(ms = 3, gapMs = 6, maxMs = 100) { BUILD_MS = ms; GAP_MS = gapMs; MAX_MS = maxMs; winAt = -1e9; lastCall = -1e9; spent = 0; }

/**
 * Is there time left in this frame to build another sprite? A frame is the run of calls with no pause of GAP_MS between them: the ground is drawn before the first prop of every
 * frame. The first build of a frame goes ahead whatever it costs (so something is always made), except a big one (`px` pixels), which waits for the scale to have rested.
 */
function mayBuild(now, before, px) {
  if (now - before > GAP_MS || now - winAt > MAX_MS) { winAt = now; spent = 0; }
  if (px > BIG_PX && BUILD_MS < 1e6 && (now - changedAt < BIG_REST_MS || spent > 0)) return false; // (an unlimited building time, as the tests set, is no gate at all)
  return spent < BUILD_MS;
}

/**
 * Draw prop p through the cache. layer = { body(ctx, p, env) -> hit polygons, night: bool (does the look change with the night?), pad: [l, t, r, b] extra room in px }.
 * Returns the hit polygons, or undefined when the cache cannot serve this draw (no canvas, a gesture in progress, this frame's building time spent with nothing near enough
 * to show, a sprite too large, a bitmap that was lost): the caller then draws directly.
 */
export function drawSprite(ctx, p, env, layer) {
  if (!enabled || !canUse() || typeof ctx.getTransform !== 'function') return undefined;
  const M = ctx.getTransform(), a = M.a;
  if (!(a > 0) || M.b || M.c) return undefined;
  const now = performance.now(), before = lastCall; lastCall = now;
  if (a !== lastA) { lastA = a; changedAt = now; }
  const key = Math.round(Math.log2(a) * ZOOM_STEPS), dq = Math.round((env.dim || 0) * 16), nq = layer.night === false ? 0 : Math.round((env.night || 0) * 8);
  const fl = (env.lite ? 1 : 0) | (env.crunch ? 2 : 0);
  let arr = STORE.get(p), e = null, near = null, other = null;
  if (arr) for (let i = 0; i < arr.length; i++) {
    const c = arr[i]; if (c.fl !== fl || c.L !== layer) continue; // (a sprite belongs to the layer definition that drew it: a flag flipped between legacy and V2 never serves the other's picture)
    const dk = Math.abs(c.key - key), close = Math.abs(c.dq - dq) <= 2 && Math.abs(c.nq - nq) <= 1; // one step of evening or three of fog off: close enough for a frame or two
    if (dk === 0) {
      if (c.dq === dq && c.nq === nq) { e = c; break; }
      if (close && (!near || c.last > near.last)) near = c;
    } else if (close && dk <= REUSE_STEPS && (!other || dk < Math.abs(other.key - key))) other = c; // the nearest zoom that has one
  }
  if (e) stats.hits++;
  else {
    if (now - changedAt < MOVING_MS) { // the zoom is moving: nothing is built; the sprite of the zoom before stands in, scaled, else the prop is drawn directly
      if (other) { e = other; stats.stale++; } else { stats.direct++; return undefined; }
    } else {
      const B = spriteBounds(p, layer), px = Math.ceil((B.x1 - B.x0) * Math.pow(2, key / ZOOM_STEPS)) * Math.ceil((B.y1 - B.y0) * Math.pow(2, key / ZOOM_STEPS));
      if (mayBuild(now, before, px)) {
        e = build(ctx, p, env, layer, key, dq, nq, fl);
        lastCall = performance.now(); spent += lastCall - now;
        if (!e) return undefined;
        if (!arr) STORE.set(p, arr = []);
        if (arr.length >= PER_PROP) { let o = 0; for (let i = 1; i < arr.length; i++) if (arr[i].last < arr[o].last) o = i; const old = arr[o]; arr.splice(o, 1); drop(old); }
        e.last = ++tick; // recent before anything can be trimmed: the entry just built must not be the least recently used
        arr.push(e); ALL.add(e); stats.pixels += e.w * e.h; stats.builds++;
        if (stats.pixels > budget) trim(e);
      } else if (near || other) { e = near || other; stats.stale++; }
      else { stats.direct++; stats.deferred++; return undefined; } // nothing to show yet and no time to build: this frame draws the prop directly
    }
  }
  e.last = ++tick;
  // blit on whole device pixels in identity space (a sprite on a half pixel would be a blurred copy of itself). The sprite was built at this very scale, so it is copied
  // at its own size; a resampled copy only happens for a stale sprite from a scale that is off by more than the tolerance (never, by the key)
  const k = a / e.s, X = Math.round(a * e.x0 + M.e), Y = Math.round(a * e.y0 + M.f);
  let ok = false;
  ctx.save();
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (k > 0.998 && k < 1.002) ctx.drawImage(e.img, X, Y); else ctx.drawImage(e.img, X, Y, e.w * k, e.h * k);
    ok = true;
  } catch { /* a bitmap the browser took back (a lost context, a closed image): fall through and draw the prop directly */ } finally { ctx.restore(); }
  if (!ok) { forget(e); stats.lost++; return undefined; }
  return e.polys;
}

function build(ctx, p, env, layer, key, dq, nq, fl) {
  const s = Math.pow(2, key / ZOOM_STEPS), B = spriteBounds(p, layer), x0 = B.x0, y0 = B.y0;
  const w = Math.ceil((B.x1 - x0) * s), h = Math.ceil((B.y1 - y0) * s);
  if (w < 1 || h < 1 || w > MAX_SIDE || h > MAX_SIDE) return null;
  const cv = makeCanvas(w, h), g = cv.getContext('2d'); if (!g) return null;
  g.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
  // a body sees a still world: no clock, no wind, nowhere to put lights; fog and night are the buckets it is keyed by
  const benv = { t: 0, wind: 0, lights: null, zoff: 0, locked: false, far: false, lite: !!env.lite, crunch: !!(fl & 2), dim: dq / 16, night: nq / 8, hz: env.hz, boardText: null, surge: false, alertAudit: false, lod: env.lod, dusk: env.dusk }; // lod: the zoom's ladder (lodOf), read synchronously by a V2 body that draws its near and close marks into the sprite (T3 hook)
  let polys;
  try { polys = layer.body(g, p, benv) || null; } catch (err) { try { cv.width = 0; } catch { /* nothing to free */ } throw err; }
  // an OffscreenCanvas hands its pixels over as an immutable bitmap, the cheapest thing to blit (a canvas source is re-checked for changes at every draw)
  let img = cv; if (typeof cv.transferToImageBitmap === 'function') { try { img = cv.transferToImageBitmap(); } catch { img = cv; } }
  return { p, img, w, h, s, x0, y0, key, dq, nq, fl, polys, last: 0, L: layer };
}
const ZERO = [0, 0, 0, 0];
