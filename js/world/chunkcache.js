// The ground's chunk store: baked bitmaps of CHUNK_PX device pixels, one per cell of the exact render scale's grid, kept in memory, stood in for by chunks of a neighbouring scale while the zoom moves, and given back.
// Owner: T5 RASTER QUALITY (docs/RENDER_PLAN.md sections 3 and 5). The ARITHMETIC is chunks.js (pure); the FRAME's use of the store (what is stamped, in what order, what is drawn directly) is groundcache.js; this file is the
// store and the bake. It draws nothing of its own: the ground layers (T1) draw into the surface it hands them through `draw(g, view)`.
//
// A chunk is baked at the exact render scale `a` into a surface of CHUNK_FULL (386) device pixels: the 384 of the cell and one pixel of bleed on every side. Under density 1.5 it is baked at twice that and drawn down once
// (a smooth coast and no crack on a 1x screen). Then the bitmap is SEALED (seal.js: gaps of one or two pixels between shapes that share an edge are closed) and handed to the browser as an immutable ImageBitmap, the
// cheapest thing to blit. Stamped 1:1 on the whole pixel at `i CHUNK_PX + e`, it is the picture the ground layers would have drawn straight onto the canvas at this camera, pixel for pixel, minus the cracks.
import { CHUNK_PX, CHUNK_FULL, BLEED, scaleKey, chunkKey, staleRatio, superSample } from './chunks.js';
import { surface as makeSurface, ledger } from './gfx.js';
import { closeAlpha } from './seal.js';

const READ = { willReadFrequently: true };

export class ChunkCache {
  /** `name` is the ledger holder; `make` is the surface factory (tests hand in a stand-in). */
  constructor(name = 'ground.chunks', make = makeSurface) {
    this.name = name; this.make = make; this.map = new Map(); this.ver = NaN; this.bytes = 0; this.tick = 0;
    this.work = null; this.fin = null; this.scratch = null; this.scratchN = 0; this.list = [];
    this.stats = { baked: 0, sealed: 0, dropped: 0, ms: 0, lastMs: 0, direct: 0, stale: 0, hits: 0 };
  }
  get size() { return this.map.size; }
  /** What the picture depends on besides the camera's scale (the districts that are open, the V2 layers' keys): a different value drops every chunk. */
  setVer(ver) { if (ver !== this.ver) { this.clear(); this.ver = ver; return true; } return false; }
  get(sk, i, j) { const c = this.map.get(chunkKey(sk, i, j)); if (c) c.last = ++this.tick; return c; }
  has(sk, i, j) { return this.map.has(chunkKey(sk, i, j)); }
  /** Every chunk of the other scales that could stand in for scale `a` (within the plan's ratio window), furthest first, into a reused list. */
  standIns(a, sk) { const L = this.list; L.length = 0; for (const c of this.map.values()) if (c.sk !== sk && staleRatio(c.a, a)) L.push(c); L.sort((p, q) => Math.abs(Math.log(q.a / a)) - Math.abs(Math.log(p.a / a))); return L; }

  /**
   * Bake the chunk (i, j) of render scale `a` at canvas density `dpr`. `draw(g, view)` paints the still ground for the world rectangle `view` into `g`, whose transform is already set for the chunk. Answers the chunk, or
   * null when there is no surface to bake into (no OffscreenCanvas: the caller draws directly). The cost is added to stats.ms.
   */
  bake(draw, a, i, j, dpr) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0, ss = superSample(dpr), S = CHUNK_FULL * ss, sk = scaleKey(a);
    const key = chunkKey(sk, i, j), old = this.map.get(key); if (old) return old;
    let work = null;
    if (ss > 1) { if (!this.work || this.work.c.width !== S) { this.work = this.make(S, S, READ); this.sync(); } work = this.work; }
    let fin = this.fin; if (!fin) { fin = this.make(CHUNK_FULL, CHUNK_FULL, READ); this.fin = fin; this.sync(); }
    if (!fin || (ss > 1 && !work)) return null;
    const g = (ss > 1 ? work : fin).g, k = a * ss;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S, S);
    g.setTransform(k, 0, 0, k, -(i * CHUNK_PX - BLEED) * ss, -(j * CHUNK_PX - BLEED) * ss);
    const view = { x0: (i * CHUNK_PX - BLEED) / a, x1: ((i + 1) * CHUNK_PX + BLEED) / a, y0: (j * CHUNK_PX - BLEED) / a, y1: ((j + 1) * CHUNK_PX + BLEED) / a };
    draw(g, view);
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (ss > 1) { const f = fin.g; f.setTransform(1, 0, 0, 1, 0, 0); f.clearRect(0, 0, CHUNK_FULL, CHUNK_FULL); f.imageSmoothingEnabled = true; if ('imageSmoothingQuality' in f) f.imageSmoothingQuality = 'high'; f.drawImage(work.c, 0, 0, S, S, 0, 0, CHUNK_FULL, CHUNK_FULL); }
    let sealed = false;
    if (typeof fin.g.getImageData === 'function' && typeof fin.g.putImageData === 'function') {
      try {
        const id = fin.g.getImageData(0, 0, CHUNK_FULL, CHUNK_FULL), n = CHUNK_FULL * CHUNK_FULL;
        if (this.scratchN !== n) { this.scratch = { a: new Uint8Array(n), b: new Uint8Array(n) }; this.scratchN = n; }
        if (closeAlpha(id.data, CHUNK_FULL, CHUNK_FULL, { scratch: this.scratch })) fin.g.putImageData(id, 0, 0);
        sealed = true;
      } catch { /* a surface that cannot be read (a tainted or lost canvas): the chunk is stamped unsealed */ }
    }
    let img = fin.c;
    if (typeof fin.c.transferToImageBitmap === 'function') { try { img = fin.c.transferToImageBitmap(); } catch { img = fin.c; this.fin = null; } } else this.fin = null; // no bitmap to hand over: the surface itself is the chunk's, and the next bake makes its own
    const c = { sk, a, i, j, img, bytes: CHUNK_FULL * CHUNK_FULL * 4, last: ++this.tick, sealed };
    this.map.set(key, c); this.sync();
    const ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0; this.stats.baked++; if (sealed) this.stats.sealed++; this.stats.ms += ms; this.stats.lastMs = ms;
    return c;
  }

  /** Give one chunk back. */
  drop(c) { if (this.map.delete(chunkKey(c.sk, c.i, c.j))) { try { if (typeof c.img.close === 'function') c.img.close(); } catch { /* already gone */ } this.stats.dropped++; this.sync(); } }
  /**
   * End of a frame: free what is no longer wanted. A chunk of another scale goes when the exact chunks cover its whole area (it has nothing left to stand in for), when it is off the view's cells by more than a ring, or when
   * the scale has moved past the ratio window; then, over `cap`, the chunks furthest from the view's middle (stale first), never one of the visible exact ones. `win` is the visible cell range { i0, i1, j0, j1, s } at the scale `a`.
   */
  sweep(win, a, cap) {
    const sk = scaleKey(a), dead = []; let n = 0;
    for (const c of this.map.values()) {
      n++;
      if (c.sk === sk) continue;
      const k = staleRatio(c.a, a), s0 = CHUNK_PX / c.a, x0 = c.i * s0, x1 = x0 + s0, y0 = c.j * s0, y1 = y0 + s0;
      let gone = !k;
      if (!gone) { // off the view's cells (in world pixels, a cell of the exact grid is win.s wide)
        const w = win.s; if (x1 < (win.i0 - 1) * w || x0 > (win.i1 + 2) * w || y1 < (win.j0 - 1) * w || y0 > (win.j1 + 2) * w) gone = true;
      }
      if (!gone) { // covered: every exact cell under this chunk's area exists
        const ci0 = Math.floor(x0 * a / CHUNK_PX), ci1 = Math.floor((x1 * a - 1e-6) / CHUNK_PX), cj0 = Math.floor(y0 * a / CHUNK_PX), cj1 = Math.floor((y1 * a - 1e-6) / CHUNK_PX);
        let all = true; for (let j = cj0; j <= cj1 && all; j++) for (let i = ci0; i <= ci1; i++) if (!this.map.has(chunkKey(sk, i, j))) { all = false; break; }
        gone = all;
      }
      if (gone) dead.push(c);
    }
    for (const c of dead) { this.drop(c); n--; }
    if (n > cap) { // over the cap: the least recently used outside the visible cells (stale or not) first
      const rest = []; for (const c of this.map.values()) { const vis = c.sk === sk && c.i >= win.i0 && c.i <= win.i1 && c.j >= win.j0 && c.j <= win.j1; if (!vis) rest.push(c); }
      rest.sort((p, q) => p.last - q.last); for (const c of rest) { if (n <= cap) break; this.drop(c); n--; }
    }
  }
  /** Tell the ledger what the store holds (chunks, the working surfaces). */
  sync() {
    let b = 0; for (const c of this.map.values()) b += c.bytes;
    this.bytes = b; const extra = (this.work ? this.work.c.width * this.work.c.height * 4 : 0) + (this.fin ? CHUNK_FULL * CHUNK_FULL * 4 : 0);
    ledger.register(this.name, b + extra);
  }
  clear() { for (const c of [...this.map.values()]) this.drop(c); this.map.clear(); this.sync(); }
  /** Give everything back, the working surfaces too (the screen is leaving). */
  release() { this.clear(); this.work = null; this.fin = null; this.scratch = null; this.scratchN = 0; this.ver = NaN; ledger.release(this.name); }
}
