// What a V2 ground layer is handed to bake into: the descriptor of one chunk. The chunk cache (chunkcache.js, T5) owns the store, the stand-ins, the sealing and the stamping; this is the one thing the
// V2 ground (T1's `shore` and `terrain` layers) needs beyond a canvas context: the scale and origin of the chunk's pixels, and a pixel buffer to paint the base into (rasterbase.js paints the sea, the
// coast and the land per pixel, which is far cheaper and cleaner than vector tiles). It replaces the stand-in chunk cache T1 wrote before T5's landed.
// Owner: T1 TERRAIN, COAST AND WATER (docs/RENDER_PLAN.md).
import { lockedOf, sceneOf } from './scene.js';
import { LAYOUT } from './layout.js';
import { registerReleaser } from './gfx.js';

const BUFS = new Map(); // one pixel buffer (and its ImageData) per bake size: the base is painted into it and put into the chunk's surface
const bufFor = (n) => { let b = BUFS.get(n); if (!b) { const buf = new Uint8ClampedArray(n * n * 4); b = { buf, img: typeof ImageData === 'function' ? new ImageData(buf, n, n) : null }; BUFS.set(n, b); } return b; };
const DESC = { S: 1, ox: 0, oy: 0, N: 0, bleed: 1, buf: null, img: null, scene: null };

/**
 * The descriptor of the chunk being baked. `view` is the chunk's world rectangle (with its bleed), `info` what the cache knows of the surface: `k` the scale of its pixels (device pixels a world pixel,
 * the supersampling included), `n` its side in pixels and `ss` its supersampling. One record, reused: a layer reads it during its own call and never keeps it.
 */
export function chunkDescriptor(w, view, info) {
  const b = bufFor(info.n), d = DESC;
  view.maxZ = LAYOUT.maxZ; // the base reads the island's highest ground to know which tiles can reach into the rectangle (T1's view always carried it)
  d.S = info.k; d.ox = view.x0; d.oy = view.y0; d.N = info.n; d.bleed = info.ss; d.buf = b.buf; d.img = b.img; d.scene = sceneOf(lockedOf(w.unlocked));
  return d;
}
/** Let go of the pixel buffers (a world that gives its memory back, a test). */
export function releaseChunkBuffers() { BUFS.clear(); }
registerReleaser(releaseChunkBuffers); // (World.release gives the pixel buffers back with everything else)
