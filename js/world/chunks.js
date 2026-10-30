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
/**
 * Cut the rectangle (x0, y0, x1, y1) out of every rectangle in `parts`, a flat list of [x0, y0, x1, y1] quadruples, in place: what is left of each is up to four pieces. Pieces no wider or taller than `eps` are
 * hairs (the same edge worked out two ways) and are left out. Answers the new length. The coverage of the ground is this: the part of a cell that nothing stands under is what is left after every stand-in is cut from it.
 */
/** How many cells must be bare before the ground is covered coarse first: fewer are made exact at once, the nearest first, which is no dearer than one coarse chunk and leaves no soft picture to be replaced (a pan that reveals a cell or two used to make a coarse chunk and an exact one for each). */
export const COVER_MIN = 3;
const CUT = [];
export function cutParts(parts, x0, y0, x1, y1, eps = 1e-3) {
  const out = CUT; out.length = 0;
  for (let p = 0; p < parts.length; p += 4) {
    const a0 = parts[p], b0 = parts[p + 1], a1 = parts[p + 2], b1 = parts[p + 3];
    if (x0 >= a1 - eps || x1 <= a0 + eps || y0 >= b1 - eps || y1 <= b0 + eps) { out.push(a0, b0, a1, b1); continue; }
    const lo = Math.max(b0, y0), hi = Math.min(b1, y1), l = Math.max(a0, x0), r = Math.min(a1, x1);
    if (b0 < y0 - eps) out.push(a0, b0, a1, y0);   // above the cut
    if (b1 > y1 + eps) out.push(a0, y1, a1, b1);   // below it
    if (a0 < l - eps) out.push(a0, lo, l, hi);     // to its left
    if (a1 > r + eps) out.push(r, lo, a1, hi);     // and to its right
  }
  parts.length = out.length; for (let q = 0; q < out.length; q++) parts[q] = out[q];
  return parts.length;
}
/** A chunk's integer key: its scale key, column and row (cells stay within +-2,000 at any zoom the world allows, and a scale key within 0 to 2^20). */
export const chunkKey = (sk, i, j) => (sk * 4096 + (i + 2048)) * 4096 + (j + 2048);
/**
 * Is a chunk baked at scale `a0` a fair stand-in for scale `a` while the zoom moves? Shown scaled by k = a / a0: at most 1.5 up and 1 / 0.7 down. The plan's window for a SPRITE is 1.25 and 0.84 (a prop has fine detail that
 * a resample blurs); the ground is flat colour fields with anti-aliased edges, so a stand-in scaled by half again reads as motion, and it is a blit where the alternative is the legacy ground drawn straight, 12 to 16 ms
 * a frame (measured: a pinch out from 1.6 fell to 24 ms with the narrow window and the direct cells it brought). Returns k, or 0 when it is not.
 */
export const STALE_UP = 1.5, STALE_DOWN = 0.7;
/** A chunk baked for a zoom in motion (coarse: baked at about half the scale of the zoom when the zoom goes in, so a third of the chunks cover a window) stands in over a wider window, up to 3.2 times magnified and down to 0.5: soft for the moment the zoom lasts, and the exact scale is baked the moment it rests. */
export const COARSE_UP = 3.2, COARSE_DOWN = 0.5;
export const staleRatio = (a0, a, coarse = false) => { const k = a / a0; return (coarse ? k <= COARSE_UP && k >= COARSE_DOWN : k <= STALE_UP && k >= STALE_DOWN) ? k : 0; };
/** How many chunks the cache may hold: what the window touches, plus a third for the stale ones that stand in while a zoom settles and the cells a zoom out reveals, plus two. The memory table of docs/RENDER_PLAN.md is this number x 0.59 MB (the window touches at most 54 at dsf 2; a real window is 40 to 48). */
export const chunkCap = (w, h, dpr) => Math.ceil(chunksTouched(w, h, dpr) * 1.35) + 2;
