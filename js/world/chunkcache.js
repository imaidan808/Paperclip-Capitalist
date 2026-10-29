// The ground's chunk store: baked bitmaps of CHUNK_PX device pixels, one per cell of the exact render scale's grid, kept in memory, stood in for by chunks of a neighbouring scale while the zoom moves, and given back.
// Owner: T5 RASTER QUALITY (docs/RENDER_PLAN.md sections 3 and 5). The ARITHMETIC is chunks.js (pure); the FRAME's use of the store (what is stamped, in what order, what is drawn directly) is groundcache.js; this file is the
// store and the bake. It draws nothing of its own: the ground layers (T1) draw into the surface it hands them through `draw(g, view)`.
//
// A chunk is baked at the exact render scale `a` into a surface of CHUNK_FULL (386) device pixels: the 384 of the cell and one pixel of bleed on every side (so the sealing sees the cell's edge rows with their neighbours).
// Under density 1.5 it is baked at twice that and drawn down once (a smooth coast and no crack on a 1x screen). Then the bitmap is SEALED (seal.js: gaps of one or two pixels between shapes that share an edge are closed),
// the cell's own 384 x 384 is handed to the browser as an immutable ImageBitmap (a cell of open sea has none: it is marked `empty` and never stamped), and that is the cheapest thing to blit. Stamped 1:1 on the whole pixel
// at `i CHUNK_PX + e`, it is the picture the ground layers would have drawn straight onto the canvas at this camera, pixel for pixel, minus the cracks.
import { CHUNK_PX, CHUNK_FULL, BLEED, scaleKey, chunkKey, staleRatio, superSample } from './chunks.js';
import { surface as makeSurface, ledger } from './gfx.js';
import { closeAlpha } from './seal.js';

const READ = { willReadFrequently: true };

export class ChunkCache {
  /** `name` is the ledger holder; `make` is the surface factory (tests hand in a stand-in). */
  constructor(name = 'ground.chunks', make = makeSurface) {
    this.name = name; this.make = make; this.map = new Map(); this.ver = NaN; this.bytes = 0; this.tick = 0;
    this.work = null; this.fin = null; this.cell = null; this.scratch = null; this.scratchN = 0; this.list = [];
    this.stats = { baked: 0, sealed: 0, dropped: 0, ms: 0, lastMs: 0, direct: 0, stale: 0, hits: 0, faded: 0 };
  }
  get size() { return this.map.size; }
  /** What the picture depends on besides the camera's scale (the districts that are open, the V2 layers' keys): a different value drops every chunk. */
  setVer(ver) { if (ver !== this.ver) { this.clear(); this.ver = ver; return true; } return false; }
  /** The same, for a ground that is dear to bake (the V2 ground): nothing is dropped, every chunk is marked stale. A stale chunk is still stamped until its replacement is baked over it, so a district opening never blanks the ground for the frames the new chunks take. */
  markStale(ver) { if (ver === this.ver) return false; for (const c of this.map.values()) c.stale = true; this.ver = ver; return true; }
  get(sk, i, j) { const c = this.map.get(chunkKey(sk, i, j)); if (c) c.last = ++this.tick; return c; }
  has(sk, i, j) { return this.map.has(chunkKey(sk, i, j)); }
  /** Every chunk of the other scales that could stand in for scale `a` (within the plan's ratio window), furthest first, into a reused list. */
  standIns(a, sk, now = 0) {
    this.lastA = a; this.now = now; const L = this.list; L.length = 0; const sc = this.scales || (this.scales = new Map()); sc.clear();
    for (const c of this.map.values()) if (c.sk !== sk && staleRatio(c.a, a, c.coarse)) { L.push(c); sc.set(c.sk, c.a); }
    L.sort((p, q) => Math.abs(Math.log(q.a / a)) - Math.abs(Math.log(p.a / a)));
    const sl = this.scaleList || (this.scaleList = []); sl.length = 0; for (const [k, a0] of sc) sl.push([k, a0, Math.abs(Math.log(a0 / a))]); sl.sort((p, q) => p[2] - q[2]); // the scales found, nearest first
    return L;
  }
  /** Is the world point (x, y) under a stand-in (of the scales the last standIns call found)? An empty cell of open sea counts: there is nothing to stand in for. */
  covered(x, y) { for (const [sk0, a0] of this.scales || []) { const s0 = CHUNK_PX / a0; if (this.map.has(chunkKey(sk0, Math.floor(x / s0), Math.floor(y / s0)))) return true; } return false; }
  /**
   * Is a stand-in wholly hidden behind exact chunks (scale key `sk`, cell size `s` world pixels) and stand-ins that are nearer in scale than it? Five points of its area (the middle and four corners pulled in a little) are
   * looked up; when every one is covered it need not be drawn at all, which saves the blit (a scaled one is 0.3 ms on a CPU-drawn canvas) wherever the sets of two scales overlap.
   */
  hidden(c, sk, s) {
    const s0 = CHUNK_PX / c.a, x0 = c.i * s0, y0 = c.j * s0, me = Math.abs(Math.log(c.a / this.lastA)), sl = this.scaleList || [];
    for (let q = 0; q < 5; q++) {
      const x = x0 + s0 * (q === 4 ? 0.5 : q & 1 ? 0.88 : 0.12), y = y0 + s0 * (q === 4 ? 0.5 : q & 2 ? 0.88 : 0.12); const ex = this.map.get(chunkKey(sk, Math.floor(x / s), Math.floor(y / s))); let hit = !!ex && !(ex.fadeEnd > this.now); // (an exact chunk that is still fading in hides nothing)
      for (let n = 0; !hit && n < sl.length && sl[n][2] < me - 1e-9; n++) { const t0 = CHUNK_PX / sl[n][1]; if (this.map.has(chunkKey(sl[n][0], Math.floor(x / t0), Math.floor(y / t0)))) hit = true; }
      if (!hit) return false;
    }
    return true;
  }

  /**
   * Bake the chunk (i, j) of render scale `a` at canvas density `dpr`. `draw(g, view)` paints the still ground for the world rectangle `view` into `g`, whose transform is already set for the chunk. Answers the chunk, or
   * null when there is no surface to bake into (no OffscreenCanvas: the caller draws directly). The cost is added to stats.ms.
   */
  bake(draw, a, i, j, dpr, coarse = false) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0, ss = superSample(dpr), S = CHUNK_FULL * ss, sk = scaleKey(a);
    const key = chunkKey(sk, i, j), old = this.map.get(key); if (old && !old.stale) return old;
    let work = null;
    if (ss > 1) { if (!this.work || this.work.c.width !== S) { this.work = this.make(S, S, READ); this.sync(); } work = this.work; }
    let fin = this.fin; if (!fin) { fin = this.make(CHUNK_FULL, CHUNK_FULL, READ); this.fin = fin; this.sync(); }
    if (!fin || (ss > 1 && !work)) return null;
    const g = (ss > 1 ? work : fin).g, k = a * ss;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S, S);
    g.setTransform(k, 0, 0, k, -(i * CHUNK_PX - BLEED) * ss, -(j * CHUNK_PX - BLEED) * ss);
    const view = { x0: (i * CHUNK_PX - BLEED) / a, x1: ((i + 1) * CHUNK_PX + BLEED) / a, y0: (j * CHUNK_PX - BLEED) / a, y1: ((j + 1) * CHUNK_PX + BLEED) / a };
    const info = this.info || (this.info = { k: 0, ss: 1, n: 0 }); info.k = k; info.ss = ss; info.n = S;
    draw(g, view, info); // (`info`: the scale and side of the pixels being painted, for a layer that paints pixels itself: the V2 ground's base)
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (ss > 1) { const f = fin.g; f.setTransform(1, 0, 0, 1, 0, 0); f.clearRect(0, 0, CHUNK_FULL, CHUNK_FULL); f.imageSmoothingEnabled = true; if ('imageSmoothingQuality' in f) f.imageSmoothingQuality = 'high'; f.drawImage(work.c, 0, 0, S, S, 0, 0, CHUNK_FULL, CHUNK_FULL); }
    let sealed = false, empty = false;
    if (typeof fin.g.getImageData === 'function' && typeof fin.g.putImageData === 'function') {
      try {
        const id = fin.g.getImageData(0, 0, CHUNK_FULL, CHUNK_FULL), n = CHUNK_FULL * CHUNK_FULL, d = id.data;
        if (this.scratchN !== n) { this.scratch = { a: new Uint8Array(n), b: new Uint8Array(n) }; this.scratchN = n; }
        if (closeAlpha(d, CHUNK_FULL, CHUNK_FULL, { scratch: this.scratch })) fin.g.putImageData(id, 0, 0);
        sealed = true;
        empty = true; for (let q = 3; q < d.length; q += 4) if (d[q]) { empty = false; break; } // a cell of open sea: nothing to stamp, ever
      } catch { /* a surface that cannot be read (a tainted or lost canvas): the chunk is stamped unsealed */ }
    }
    // the stamped bitmap is the cell's own 384 x 384 (the bleed was for the sealing and the scaled stand-in): whole-bitmap blits are twice as cheap as ones with a source rectangle on a CPU-drawn canvas (measured)
    let img = null;
    if (!empty) {
      let cell = this.cell; if (!cell) { cell = this.cell = this.make(CHUNK_PX, CHUNK_PX, READ); this.sync(); }
      if (cell && typeof cell.c.transferToImageBitmap === 'function') {
        const cg = cell.g; cg.setTransform(1, 0, 0, 1, 0, 0); cg.clearRect(0, 0, CHUNK_PX, CHUNK_PX); cg.drawImage(fin.c, BLEED, BLEED, CHUNK_PX, CHUNK_PX, 0, 0, CHUNK_PX, CHUNK_PX);
        try { img = cell.c.transferToImageBitmap(); } catch { img = null; this.cell = null; }
      }
      if (!img) { // no bitmaps to hand over (a test's stand-in canvas): the chunk keeps a surface of its own
        const own = this.make(CHUNK_PX, CHUNK_PX); if (own) { own.g.drawImage(fin.c, BLEED, BLEED, CHUNK_PX, CHUNK_PX, 0, 0, CHUNK_PX, CHUNK_PX); img = own.c; }
      }
    }
    const c = { fadeEnd: 0, coarse, sk, a, i, j, img, empty, bytes: empty ? 0 : CHUNK_PX * CHUNK_PX * 4, last: ++this.tick, sealed };
    if (old) this.drop(old); // (a stale chunk of the same cell: replaced)
    this.map.set(key, c); this.sync();
    const ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0; this.stats.baked++; if (sealed) this.stats.sealed++; this.stats.ms += ms; this.stats.lastMs = ms;
    return c;
  }

  /** Give one chunk back. */
  drop(c) { if (this.map.delete(chunkKey(c.sk, c.i, c.j))) { try { if (c.img && typeof c.img.close === 'function') c.img.close(); } catch { /* already gone */ } this.stats.dropped++; this.sync(); } }
  /**
   * End of a frame: free what is no longer wanted. A chunk of another scale goes when the exact chunks cover its whole area (it has nothing left to stand in for), when it is off the view's cells by more than a ring, or when
   * the scale has moved past the ratio window; then, over `cap`, the chunks furthest from the view's middle (stale first), never one of the visible exact ones. `win` is the visible cell range { i0, i1, j0, j1, s } at the scale `a`.
   */
  sweep(win, a, cap) {
    const sk = scaleKey(a), dead = []; let n = 0;
    for (const c of this.map.values()) {
      n++;
      if (c.sk === sk) continue;
      const k = staleRatio(c.a, a, c.coarse), s0 = CHUNK_PX / c.a, x0 = c.i * s0, x1 = x0 + s0, y0 = c.j * s0, y1 = y0 + s0;
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
  /** Over a memory ceiling: drop chunks (stale first, then the least recently used outside the visible cells) until `n` are left. Answers how many went. */
  shrink(n, win, a) {
    const sk = scaleKey(a), rest = []; for (const c of this.map.values()) { const vis = win && c.sk === sk && c.i >= win.i0 && c.i <= win.i1 && c.j >= win.j0 && c.j <= win.j1; if (!vis) rest.push(c); }
    rest.sort((p, q) => (q.sk !== sk) - (p.sk !== sk) || p.last - q.last); let k = 0; for (const c of rest) { if (this.map.size <= n) break; this.drop(c); k++; } return k;
  }
  /** Tell the ledger what the store holds (chunks, the working surfaces). */
  sync() {
    let b = 0; for (const c of this.map.values()) b += c.bytes;
    this.bytes = b; const extra = (this.work ? this.work.c.width * this.work.c.height * 4 : 0) + (this.fin ? CHUNK_FULL * CHUNK_FULL * 4 : 0) + (this.cell ? CHUNK_PX * CHUNK_PX * 4 : 0);
    ledger.register(this.name, b + extra);
  }
  clear() { for (const c of [...this.map.values()]) this.drop(c); this.map.clear(); this.sync(); }
  /** Give everything back, the working surfaces too (the screen is leaving). */
  release() { this.clear(); this.work = null; this.fin = null; this.cell = null; this.scratch = null; this.scratchN = 0; this.ver = NaN; ledger.release(this.name); }
}
