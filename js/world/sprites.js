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

import { ledger, registerReleaser } from './gfx.js';
import { closeAlpha } from './seal.js';
import { DETAIL_MIN } from './lod.js';

// RASTER QUALITY (T5, docs/RENDER_PLAN.md sections 4 and 5), what changed from the first cache:
//  - a sprite is built at the exact render scale and on the frame's raster phase: its origin is the whole device pixel the live art would have put that world point on (R = round(scale x world x), the camera's
//    translation being whole pixels too), so a cached prop is the picture a direct draw would give, pixel for pixel, and a pan moves it with the ground and never against it;
//  - a body is SEALED after it is drawn (seal.js): a hairline crack where two faces share an edge is closed, a real gap of three pixels or more is not;
//  - a zoom that is moving is stood in for by the nearest sprite within 1.25 up and 1 / 0.84 down; a stand-in that is more than 19% up or 16% down is replaced, when the frame has time, by a sprite built at a quarter-octave
//    BUCKET scale (at most 9% off), so a long pinch is served by sprites a few percent off; with no stand-in at all the prop is drawn directly, as it always was. When the scale rests the exact one is built and fades in
//    over 120 ms over the stand-in (never under Calm, Off and reduced motion: env.t is 0 there);
//  - a layer may carry `detail: [{ band: 'near' | 'close', body(ctx, p, env) }]`: each is an overlay sprite, transparent except where it adds marks, built only for a prop in view whose band alpha (lod.js) is over
//    DETAIL_MIN and only once the scale has rested, and blitted with that alpha so a zoom fades the marks in and out and nothing pops. The base is complete without them. The governor's tier lowers the band: at 3 and over
//    `close` overlays are not built, at 5 and over `near` ones are not (docs/RENDER_PLAN.md section 5);
//  - every pixel is in the ledger (gfx.js) as `sprites`, the budget is the plan's 12 million at density 2, and the least recently used go first, overlays before bases.
export const SPRITE_BUDGET = 8e6;     // pixels across every sprite at a pixel density of 1; setSpriteBudget grows it 1.5 times at density 2, which is the plan's 12 million (48 MB of 4-byte pixels)
let budget = SPRITE_BUDGET;           // what is allowed now (setSpriteBudget): the same scenery is more pixels at a higher density, so a sharp screen gets more room, not a thrash
const STALE_UP = 1.25, STALE_DOWN = 0.84; // a sprite stands in for another scale when it would be shown scaled by at most this (the plan's window)
const NEAR_UP = 1.19, NEAR_DOWN = 0.84;   // within this a stand-in is good enough that nothing is built for it while the zoom moves (the plan's 0.84 to 1.19; up to 1.25 it is still used when the frame has no time to build)
const BUCKETS = 4;                    // sprites built while the zoom moves are at a whole number of quarter octaves
const BIG_PX = 2.2e6, BIG_REST_MS = 260;    // a sprite of more pixels than this is built only once the scale has rested this long: it is the one build that could take a frame by itself
const MAX_SIDE = 3072;                // a sprite wider or taller than this (device pixels) is not cached
const MOVING_MS = 90;                 // the scale must rest this long before exact sprites and overlays are built
let FADE_MS = 120;                    // an exact sprite fades in over the stand-in this long (setSpriteFade; 0 is off)
const PER_PROP = 3;                   // variants kept per prop and layer (zoom, fog or night differ)
let BUILD_MS = 3, GAP_MS = 6, MAX_MS = 100; // building time allowed in one frame; a pause of GAP_MS between two calls is a new frame (ground and sky are drawn between frames' props), and no frame is taken to last past MAX_MS
// (the first build of a frame always goes ahead)
const ZOOM_STEPS = 1024;              // zoom keys per octave (a 0.07% step: well inside the straight-copy tolerance)
const KEY_UP = Math.round(Math.log2(STALE_UP) * ZOOM_STEPS), KEY_DOWN = Math.round(Math.log2(1 / STALE_DOWN) * ZOOM_STEPS); // how many keys a stand-in may be below / above the wanted scale
const STORE = new WeakMap();          // prop -> its entries
const ALL = new Set();                // every entry, for eviction
export const stats = { builds: 0, hits: 0, direct: 0, evicted: 0, pixels: 0, stale: 0, deferred: 0, lost: 0, overlays: 0, sealed: 0, faded: 0, buckets: 0 };
let tick = 0, lastA = 0, changedAt = 0, enabled = true, winAt = -1e9, lastCall = -1e9, spent = 0;
const SCRATCH = { a: null, flags: null };

const canUse = () => typeof OffscreenCanvas !== 'undefined' || (typeof document !== 'undefined' && typeof HTMLCanvasElement !== 'undefined');
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') { try { return new OffscreenCanvas(w, h); } catch { return null; } }
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
const free = (e) => { try { if (typeof e.img.close === 'function') e.img.close(); else { e.img.width = 0; e.img.height = 0; } } catch { /* already gone */ } };
const tell = () => ledger.register('sprites', stats.pixels * 4);
/** Take an entry out of every table and give its pixels back (the caller removes it from its prop's list). */
const drop = (e) => { if (ALL.delete(e)) { stats.pixels -= e.w * e.h; tell(); } free(e); };
const forget = (e) => { const arr = STORE.get(e.p); if (arr) { const i = arr.indexOf(e); if (i >= 0) arr.splice(i, 1); } drop(e); };
function trim(keep) { // least recently used first (overlays before bases), down to 85% of the budget; `keep` (the sprite just built) is never evicted
  const list = [...ALL].sort((a, b) => (a.L.ov ? 0 : 1) - (b.L.ov ? 0 : 1) || a.last - b.last);
  for (const e of list) { if (stats.pixels <= budget * 0.85) break; if (e === keep) continue; forget(e); stats.evicted++; }
}
/**
 * Size the memory for a pixel density (the world's canvas density): a density of 1 has SPRITE_BUDGET pixels, and the budget grows with the density towards 1.5 times that (12 million at density 2: 48 MB), which holds
 * the working set of one view at 2x (measured: the budget was crossed at every zoom pass, and each pass rebuilt about a hundred sprites it had just dropped).
 */
export function setSpriteBudget(dpr = 1) { budget = Math.round(SPRITE_BUDGET * Math.max(1, Math.min(1.5, 1 + (dpr - 1) * 0.7))); }
/** The pixels the cache may hold now. */
export const spriteBudget = () => budget;
/** Forget every sprite (tests, and a quality change that wants a clean slate). */
export function clearSprites() { for (const e of [...ALL]) forget(e); ALL.clear(); stats.pixels = 0; tell(); }
/** Switch the cache off (every prop draws directly) or back on: for comparisons, tests and a quality setting that would rather not hold the memory. */
export function enableSprites(on) { enabled = !!on; if (!enabled) clearSprites(); }
/** Treat scale `a` as one that has rested (the shot rig and the tests that want exact sprites at once, without waiting out the zoom's 90 ms). */
export function settle(a) { lastA = a; changedAt = -1e9; }
/** How long an exact sprite takes to fade in over its stand-in, in ms (0: it replaces it at once: the shot rig and the tests that compare pictures). */
export function setSpriteFade(ms = 120) { FADE_MS = Math.max(0, +ms || 0); }
registerReleaser(clearSprites); // World.release() gives every sprite back

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
 * Draw prop p through the cache. layer = { body(ctx, p, env) -> hit polygons, night: bool (does the look change with the night?), pad: [l, t, r, b] extra room in px, seal: false (leave the body's cracks), detail: [overlays] }.
 * `alpha` (an overlay's band alpha) multiplies the blit. Returns the hit polygons, or undefined when the cache cannot serve this draw (no canvas, this frame's building time spent with nothing near enough to show, a
 * sprite too large, a bitmap that was lost, an overlay that has no sprite yet): the caller then draws directly (an overlay is simply left out: the base is complete without it).
 */
export function drawSprite(ctx, p, env, layer, alpha = 1) {
  if (!enabled || !canUse() || typeof ctx.getTransform !== 'function') return undefined;
  const M = ctx.getTransform(), a = M.a;
  if (!(a > 0) || M.b || M.c) return undefined;
  const now = performance.now(), before = lastCall; lastCall = now;
  if (a !== lastA) { lastA = a; changedAt = now; }
  const key = Math.round(Math.log2(a) * ZOOM_STEPS), dq = Math.round((env.dim || 0) * 16), nq = layer.night === false ? 0 : Math.round((env.night || 0) * 8), ov = layer.ov === true;
  const fl = (env.lite ? 1 : 0) | (env.crunch ? 2 : 0), moving = now - changedAt < MOVING_MS;
  let arr = STORE.get(p), e = null, near = null, other = null, n = 0;
  if (arr) for (let i = 0; i < arr.length; i++) {
    const c = arr[i]; if (c.fl !== fl || c.L !== layer) continue; // (a sprite belongs to the layer definition that drew it: a flag flipped between legacy and V2 never serves the other's picture)
    n++;
    const d = key - c.key, close = Math.abs(c.dq - dq) <= 2 && Math.abs(c.nq - nq) <= 1; // one step of evening or three of fog off: close enough for a frame or two
    if (d === 0) {
      if (c.dq === dq && c.nq === nq) { e = c; break; }
      if (close && (!near || c.last > near.last)) near = c;
    } else if (close && d >= -KEY_DOWN && d <= KEY_UP && (!other || Math.abs(d) < Math.abs(key - other.key))) other = c; // the nearest scale within the stand-in window
  }
  let built = null;
  if (e) stats.hits++;
  else if (moving) { // the zoom is moving: a stand-in (scaled, within the window) is shown; with none, or a poor one, and time to spare, a sprite is built at a quarter-octave bucket; else the prop is drawn directly
    const stand = near || other, ratio = stand ? a / stand.s : 1, poor = !!stand && (ratio > NEAR_UP || ratio < NEAR_DOWN); // (with no stand-in at all nothing is built while the zoom moves: the prop is drawn directly, as it always was, and built when the zoom rests)
    if (poor && !ov) {
      const s = Math.pow(2, Math.round(Math.log2(a) * BUCKETS) / BUCKETS), B = spriteBounds(p, layer), px = Math.ceil((B.x1 - B.x0) * s) * Math.ceil((B.y1 - B.y0) * s);
      if (px <= BIG_PX && mayBuild(now, before, px)) { built = e = make(ctx, p, env, layer, s, a, dq, nq, fl, arr, true); if (e) stats.buckets++; }
    }
    if (!e && stand) { e = stand; stats.stale++; }
    if (!e) { if (!ov) stats.direct++; return undefined; }
  } else {
    const B = spriteBounds(p, layer), px = Math.ceil((B.x1 - B.x0) * a) * Math.ceil((B.y1 - B.y0) * a);
    if (mayBuild(now, before, px)) {
      const under = near || other || null;
      built = e = make(ctx, p, env, layer, a, a, dq, nq, fl, arr, false);
      if (!e) return undefined;
      if (under && FADE_MS > 0 && !ov && env.t !== 0 && under.s !== e.s) e.under = under; // the stand-in the exact sprite fades in over (never under Calm, Off and reduced motion: env.t is 0 there)
    } else if (near || other) { e = near || other; stats.stale++; }
    else { if (!ov) { stats.direct++; stats.deferred++; } return undefined; } // nothing to show yet and no time to build: this frame draws the prop directly
  }
  if (built) {
    if (!STORE.has(p)) STORE.set(p, arr = []); else arr = STORE.get(p);
    let own = 0; for (let i = 0; i < arr.length; i++) if (arr[i].L === layer) own++;
    if (own >= PER_PROP) { let o = -1; for (let i = 0; i < arr.length; i++) if (arr[i].L === layer && arr[i] !== built && (o < 0 || arr[i].last < arr[o].last)) o = i; if (o >= 0) { const old = arr[o]; arr.splice(o, 1); drop(old); } }
    built.last = ++tick; // recent before anything can be trimmed: the entry just built must not be the least recently used
    arr.push(built); ALL.add(built); stats.pixels += built.w * built.h; stats.builds++; if (ov) stats.overlays++; tell();
    if (stats.pixels > budget) trim(built);
  }
  e.last = ++tick;
  // blit on whole device pixels in identity space (a sprite on a half pixel would be a blurred copy of itself). An exact sprite was built at this very scale on this very phase, so it is copied at its own size and lands where
  // the live art does; a stand-in is scaled by the ratio (at most 1.25 up, 1 / 0.84 down)
  let ok = false;
  const ga = typeof ctx.globalAlpha === 'number' ? ctx.globalAlpha : 1;
  ctx.save();
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (e.under) {
      const u = e.under, t = (now - e.born) / FADE_MS;
      if (t >= 1 || !ALL.has(u)) e.under = null;
      else { // the exact sprite fades in over the stand-in: the stand-in whole, the exact one at the share of the fade
        const ku = a / u.s; drawAt(ctx, u, a, M, ku);
        const sm = t * t * (3 - 2 * t); ctx.globalAlpha = ga * alpha * sm; drawAt(ctx, e, a, M, a / e.s); stats.faded++; ok = true;
      }
    }
    if (!ok) { if (alpha < 1) ctx.globalAlpha = ga * alpha; drawAt(ctx, e, a, M, a / e.s); ok = true; }
  } catch { ok = false; /* a bitmap the browser took back (a lost context, a closed image): fall through and draw the prop directly */ } finally { ctx.restore(); }
  if (!ok) { forget(e); stats.lost++; return undefined; }
  return e.polys;
}
/** Blit an entry at its place for the scale `a` and the camera matrix M: a straight copy when its own scale is the view's (within 0.2%), else scaled by k. */
function drawAt(ctx, e, a, M, k) {
  const X = Math.round(a * e.x0 + M.e), Y = Math.round(a * e.y0 + M.f);
  if (k > 0.998 && k < 1.002) ctx.drawImage(e.img, X, Y); else ctx.drawImage(e.img, X, Y, e.w * k, e.h * k);
}

/**
 * Build one sprite at scale `s` (the exact render scale `a` at rest, a bucket's while the zoom moves) and put it in the prop's list. The sprite's origin is the whole device pixel the live art puts the world point
 * (x0, y0) on (R = round(a x0), the camera's translation being a whole number of pixels), so what the body draws lands exactly where a direct draw would.
 */
function make(ctx, p, env, layer, s, a, dq, nq, fl, arr, bucket) {
  const t0 = performance.now(), key = Math.round(Math.log2(s) * ZOOM_STEPS);
  const e = build(ctx, p, env, layer, s, a, key, dq, nq, fl);
  lastCall = performance.now(); spent += lastCall - t0;
  if (e) { e.born = lastCall; e.bucket = bucket; }
  return e;
}
const OVERLAY_LOD = Object.freeze({ band: 'close', index: 3, blend: 1, level: 3, nominal: 'close', nominalIndex: 3, detail: Object.freeze([1, 1, 1, 1]) }); // what an overlay's body sees as `env.lod`: its band is fully in
const BASE_LOD = Object.freeze({ band: 'far', index: 0, blend: 1, level: 0, nominal: 'far', nominalIndex: 0, detail: Object.freeze([1, 0, 0, 0]) }); // and a base's: complete, with nothing of any finer band
function build(ctx, p, env, layer, s, a, key, dq, nq, fl) {
  const B = spriteBounds(p, layer), x0 = B.x0 - 1, y0 = B.y0 - 1; // (a pixel more on the left and top: the whole-pixel phase can put content half a pixel before the origin)
  const R = Math.round(a * x0), Rf = Math.round(a * y0), w = Math.ceil((B.x1 - x0) * s) + 1, h = Math.ceil((B.y1 - y0) * s) + 1;
  if (w < 1 || h < 1 || w > MAX_SIDE || h > MAX_SIDE) return null;
  const cv = makeCanvas(w, h); if (!cv) return null;
  const seal = layer.seal !== false, g = seal ? (cv.getContext('2d', { willReadFrequently: true }) || cv.getContext('2d')) : cv.getContext('2d'); if (!g) return null;
  g.setTransform(s, 0, 0, s, s === a ? -R : -x0 * s, s === a ? -Rf : -y0 * s); // exact: on the raster phase; a bucket stand-in is only ever shown scaled, so its phase is its own
  // a body sees a still world: no clock, no wind, nowhere to put lights; fog and night are the buckets it is keyed by
  const benv = { t: 0, wind: 0, lights: null, zoff: 0, locked: false, far: false, lite: !!env.lite, crunch: !!(fl & 2), dim: dq / 16, night: nq / 8, hz: env.hz, boardText: null, surge: false, alertAudit: false, tier: env.tier | 0, lod: layer.ov ? OVERLAY_LOD : BASE_LOD };
  let polys;
  try { polys = layer.body(g, p, benv) || null; } catch (err) { try { cv.width = 0; } catch { /* nothing to free */ } throw err; }
  if (seal && typeof g.getImageData === 'function' && typeof g.putImageData === 'function') { // close the hairline cracks where two faces share an edge (seal.js)
    try {
      const id = g.getImageData(0, 0, w, h), n = w * h;
      if (!SCRATCH.a || SCRATCH.a.length < n) SCRATCH.a = new Uint8Array(Math.max(n, 1 << 18));
      if (closeAlpha(id.data, w, h, { scratch: SCRATCH, min: 128 })) { g.putImageData(id, 0, 0); stats.sealed++; }
    } catch { /* a surface that cannot be read: the sprite is used as it is */ }
  }
  // an OffscreenCanvas hands its pixels over as an immutable bitmap, the cheapest thing to blit (a canvas source is re-checked for changes at every draw)
  let img = cv; if (typeof cv.transferToImageBitmap === 'function') { try { img = cv.transferToImageBitmap(); } catch { img = cv; } }
  return { p, img, w, h, s, x0, y0, key, dq, nq, fl, polys, last: 0, L: layer, born: 0, under: null, bucket: false };
}
const ZERO = [0, 0, 0, 0];

// ---------------------------------------------------------------- overlays: the marks a finer band adds
const BAND_INDEX = { mid: 1, near: 2, close: 3 };
const OVERLAYS = new WeakMap();
/** The layer definition an overlay is cached under: its own sprites (transparent but for its marks), the base's night rule and room, the `ov` mark the trimmer evicts first. One per overlay entry, made once. */
function overlayLayer(layer, o) {
  let v = OVERLAYS.get(o);
  if (!v || v.parent !== layer) { v = { body: (g, p, env) => { o.body(g, p, env); return null; }, night: layer.night, pad: layer.pad, ov: true, parent: layer, seal: o.seal }; OVERLAYS.set(o, v); }
  return v;
}
/**
 * Draw the near and close overlays of a layered prop over its base: each as its own sprite, with the band's alpha from lod.js (`env.lod.detail`) so a zoom fades the marks in and out. An overlay is built only for a prop in
 * view whose alpha is over DETAIL_MIN and only once the scale has rested, and the governor's tier lowers the band: at 3 and over `close` is not built, at 5 and over `near` is not. Call it right after the base was served by the cache.
 */
export function drawOverlays(ctx, p, env, layer) {
  const D = layer.detail, lod = env.lod; if (!D || !D.length || !lod) return;
  const det = lod.detail, tier = env.tier | 0;
  for (let i = 0; i < D.length; i++) {
    const o = D[i], b = BAND_INDEX[o.band]; if (!b || typeof o.body !== 'function') continue;
    const al = det[b]; if (!(al > DETAIL_MIN)) continue;
    if ((b === 3 && tier >= 3) || (b === 2 && tier >= 5)) continue;
    drawSprite(ctx, p, env, overlayLayer(layer, o), al);
  }
}
