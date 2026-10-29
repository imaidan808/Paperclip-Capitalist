// The cloud banks' chunk store: the banks of every locked district and their shadows, baked once into chunks of device pixels on the same grid as the ground's, so a frame of clouds is a handful of 1:1 blits.
// Owner: T2 ATMOSPHERE, on T5's chunk store (chunkcache.js: the map, the stand-ins, the sweep, the ledger). Only the BAKE differs: a cloud chunk is painted straight into one 384 x 384 cell (no bleed, no sealing, no
// supersampling: a bank has no cracks to close and its soft edges are anti-aliased where they stand, and a lobe's gradient is anchored in world coordinates, so two chunks that share a bank meet without a seam) and
// handed over as an immutable bitmap. What is painted in it is the caller's `draw(g, a, e, f, view)`.
//
// Why chunks and not the live bank. A bank is 150 to 250 gradient-filled lobes; painted every frame that was the dearest layer of the world (6 to 12 ms at the working zoom), and the lit, soft look asked for more
// of it, not less. Baked, its cost is paid once per scale and per light of the hour, by a few chunks a frame, and a frame is blits of what the window shows. Memory is bounded the way the ground's is: a chunk is 384
// device pixels square at any zoom, so the store is never more than the window needs (a cell no bank reaches is never made).
import { CHUNK_PX, scaleKey, chunkKey } from './chunks.js';
import { ChunkCache } from './chunkcache.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
/** The margin a chunk is painted beyond its cell, in device pixels: a lobe whose edge crosses the cell is painted in this chunk as it is in the next, so nothing has to be stitched. */
export const MARGIN_PX = 6;

export class CloudCache extends ChunkCache {
  constructor() { super('cloud.chunks'); }
  /**
   * Bake chunk (i, j) of render scale `a`. `draw(g, a, e, f, view)` paints the bank world for the world rectangle `view` into `g`, whose matrix is the identity: it sets `a` (device pixels per world pixel) and the
   * translation `e`, `f` (the cell's own origin) itself. Answers the chunk or null when there is no surface to bake into (the caller then paints the banks straight onto the frame).
   */
  bake(draw, a, i, j) {
    const t0 = now(), sk = scaleKey(a), key = chunkKey(sk, i, j), old = this.map.get(key); if (old && !old.stale) return old;
    let cell = this.cell; if (!cell) { cell = this.cell = this.make(CHUNK_PX, CHUNK_PX); this.sync(); } if (!cell) return null;
    const g = cell.g, e = -i * CHUNK_PX, f = -j * CHUNK_PX, m = MARGIN_PX;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, CHUNK_PX, CHUNK_PX);
    const view = this.view || (this.view = { x0: 0, x1: 0, y0: 0, y1: 0 }); view.x0 = (i * CHUNK_PX - m) / a; view.x1 = ((i + 1) * CHUNK_PX + m) / a; view.y0 = (j * CHUNK_PX - m) / a; view.y1 = ((j + 1) * CHUNK_PX + m) / a;
    draw(g, a, e, f, view);
    g.setTransform(1, 0, 0, 1, 0, 0);
    let img = null;
    if (typeof cell.c.transferToImageBitmap === 'function') { try { img = cell.c.transferToImageBitmap(); } catch { img = null; this.cell = null; } }
    if (!img) { const own = this.make(CHUNK_PX, CHUNK_PX); if (own) { own.g.drawImage(cell.c, 0, 0); img = own.c; } } // no bitmaps to hand over (a test's stand-in canvas): the chunk keeps a surface of its own
    const c = { fadeEnd: 0, sk, a, i, j, img, empty: false, bytes: CHUNK_PX * CHUNK_PX * 4, last: ++this.tick, sealed: false };
    if (old) this.drop(old);
    this.map.set(key, c); this.sync();
    const ms = now() - t0; this.stats.baked++; this.stats.ms += ms; this.stats.lastMs = ms;
    return c;
  }
}
