// The ground in chunks of device pixels: the arithmetic of the chunk cache and of the pixel ledger that holds it (docs/RENDER_PLAN.md sections 5 and 6). Pure: nothing here draws or allocates a surface.
// Owner: T5 RASTER QUALITY. Chunks are a fixed number of DEVICE pixels on a side, whatever the zoom: a chunk of 1,024 WORLD pixels would be 1,843 device pixels across at zoom 0.9 and 4,915 at zoom 2.4 (up to
// 387 MB for the four a window needs there), so the memory of the ground would grow with the zoom. A chunk of CHUNK_PX device pixels is the same 0.59 MB at every zoom and every density; the world area it covers
// is CHUNK_PX / (dpr x zoom) world pixels on a side.
export const CHUNK_PX = 384;
/** World pixels one chunk covers on a side, at a camera zoom and a canvas density. */
export const chunkWorld = (zoom, dpr) => CHUNK_PX / (Math.max(zoom, 1e-3) * Math.max(dpr, 1e-3));
/** Bytes of one chunk (4 bytes a pixel). */
export const chunkBytes = () => CHUNK_PX * CHUNK_PX * 4;
/** The most chunks a window of w x h css pixels can touch at any camera position: the grid it spans, plus the one the offset can add on each axis. */
export const chunksTouched = (w, h, dpr) => (Math.ceil((w * dpr) / CHUNK_PX) + 1) * (Math.ceil((h * dpr) / CHUNK_PX) + 1);
/**
 * Bytes the ground holds at rest (every chunk the window touches) and at its peak while the zoom changes: the stale chunks of the old scale are freed one by one as the chunks of the new scale that cover
 * them are made, and a new chunk can overlap four old ones, so the two sets overlap by at most a quarter of the set (`PEAK`).
 */
export const PEAK = 1.25;
export const groundBytes = (w, h, dpr) => ({ rest: chunksTouched(w, h, dpr) * chunkBytes(), peak: Math.round(chunksTouched(w, h, dpr) * chunkBytes() * PEAK) });
/**
 * The chunk indices that cover a world rectangle at a zoom and density: { i0, i1, j0, j1 } (inclusive), the chunk (i, j) covering world x in [i s, (i + 1) s), y likewise, s = chunkWorld. The bleed is one device
 * pixel on every side (a chunk is baked a pixel larger than it is drawn, so no hairline shows where two meet), which is `bleed` world pixels here.
 */
export function chunksFor(view, zoom, dpr) {
  const s = chunkWorld(zoom, dpr), bleed = 1 / (Math.max(zoom, 1e-3) * Math.max(dpr, 1e-3));
  return { i0: Math.floor((view.x0 - bleed) / s), i1: Math.floor((view.x1 + bleed) / s), j0: Math.floor((view.y0 - bleed) / s), j1: Math.floor((view.y1 + bleed) / s), s, bleed };
}

// ---------------------------------------------------------------- the pixel policy: one exact scale, whole-pixel translation, stale ratios (docs/RENDER_PLAN.md section 5)
/** Quantum of the render scale: a scale is a whole number of these, so equality is exact and a cache key is an integer (a relative error of 1e-5: a tenth of a pixel across 10,000). */
export const SCALE_Q = 1e5;
/**
 * The scale the whole frame is drawn at: device pixels per world pixel, `dpr x zoom` rounded to SCALE_Q. Everything that is drawn under the camera transform (the ground, the sprites, the live art) and everything cached
 * for it (chunks, sprites) uses THIS number and no other, so a cached bitmap built for a scale is the same scale as the picture it is stamped into, to the last bit, and no blit ever lands on a fraction of a pixel.
 */
export const renderScale = (zoom, dpr) => Math.round(zoom * dpr * SCALE_Q) / SCALE_Q;
/** The integer key of a render scale. */
export const scaleKey = (a) => Math.round(a * SCALE_Q);
/**
 * The camera's translation in whole device pixels: where the world's origin lands on the canvas, `e = round(dpr (W/2 - cam.x z))`, `f` likewise. Rounding it once, here, puts the ground, the sprites and the live art on ONE raster
 * phase: a pan moves everything by whole pixels together, so no edge crawls against another (DIAGNOSIS S5) and every blit lands 1:1. `out` is reused when given ([e, f]).
 */
export function snapTranslation(W, H, dpr, camX, camY, a, out = [0, 0]) { out[0] = Math.round(dpr * W / 2 - camX * a); out[1] = Math.round(dpr * H / 2 - camY * a); return out; }
/** Chunk pixels are baked this many times over and drawn down when the canvas density is under 1.5 (a smooth coast and no crack on a 1x or 1.25x screen): 2 under 1.5, else 1. */
export const superSample = (dpr) => (dpr < 1.5 ? 2 : 1);
/** Device pixels of bleed a chunk keeps on every side (a chunk is baked this much larger than it is stamped: scaled neighbours overlap instead of leaving a hairline). */
export const BLEED = 1;
/** The side of a baked chunk including its bleed, in device pixels at density 1 of supersampling. */
export const CHUNK_FULL = CHUNK_PX + 2 * BLEED;
/**
 * The chunk cells a world rectangle touches at render scale `a`: { i0, i1, j0, j1, s } inclusive, the cell (i, j) covering device pixels [i CHUNK_PX, (i + 1) CHUNK_PX) of the scale's own grid, so world x from i CHUNK_PX / a. No bleed
 * is added: a chunk is stamped inner part only, and the cells tile the canvas exactly.
 */
export function cellsFor(r, a, out = {}) {
  const s = CHUNK_PX / Math.max(a, 1e-6);
  out.i0 = Math.floor(r.x0 / s); out.i1 = Math.floor((r.x1 - 1e-9) / s); out.j0 = Math.floor(r.y0 / s); out.j1 = Math.floor((r.y1 - 1e-9) / s); out.s = s; return out;
}
/** A chunk's integer key: its scale key, column and row (cells stay within +-2,000 at any zoom the world allows, and a scale key within 0 to 2^20). */
export const chunkKey = (sk, i, j) => (sk * 4096 + (i + 2048)) * 4096 + (j + 2048);
/**
 * Is a chunk baked at scale `a0` a fair stand-in for scale `a` while the zoom moves? Shown scaled by k = a / a0: at most 1.25 up and 1 / 0.84 down (the plan's window), never more. Returns k, or 0 when it is not.
 */
export const STALE_UP = 1.25, STALE_DOWN = 0.84;
export const staleRatio = (a0, a) => { const k = a / a0; return k <= STALE_UP && k >= STALE_DOWN ? k : 0; };
/** How many chunks the cache may hold: what the window touches, plus a quarter for the stale ones that stand in while a zoom settles (PEAK), plus two. The memory table of docs/RENDER_PLAN.md is this number x 0.59 MB. */
export const chunkCap = (w, h, dpr) => Math.ceil(chunksTouched(w, h, dpr) * PEAK) + 2;
