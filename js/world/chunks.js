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
