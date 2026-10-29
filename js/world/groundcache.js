// The ground cache: the ground (the layers of stage 'ground', T1) is drawn into CHUNKS of device pixels once and every frame after that is a handful of 1:1 blits.
// Owner: T5 RASTER QUALITY (docs/RENDER_PLAN.md section 5). The CONTENT of a chunk is the ground layers; how chunks are cut (chunks.js), kept and baked (chunkcache.js), sealed (seal.js) and stamped is this file and its neighbours.
//
// Before this the ground was one offscreen copy of the whole window, made only once the camera had stood still for a frame: a pan or a zoom drew 2,400 tiles every frame (12 to 16 ms, DIAGNOSIS C7) and the picture while
// moving had hairline cracks the still one did not. Now:
//   - the frame has ONE scale (renderScale: dpr x zoom, to 1e-5) and ONE whole-pixel translation (World.toWorld), so a chunk baked for this scale is stamped on whole pixels, 1:1, and is the picture direct drawing would give;
//   - a chunk is the cell (i, j) of that scale's grid: 384 device pixels square, baked with a pixel of bleed, sealed against cracks, kept until the districts, the scale or the memory cap say otherwise;
//   - a pan is blits; the chunks a pan reveals are baked ahead of need at a few milliseconds a frame (more at rest), and a cell that is not baked yet is drawn directly, clipped to its own pixels, so no frame ever has a hole and
//     the cell's edge falls on a pixel boundary (no seam against its baked neighbours);
//   - while the zoom moves, chunks of the nearest scales stand in, scaled by at most 1.25 up and 1 / 0.84 down, under the exact chunks, and the exact scale is baked as soon as the zoom rests: the picture never shows a
//     scaled chunk at rest;
//   - what moves on the ground (water, pulses: stage mode 2) is drawn live over the chunks, as before.
// A district opening is drawn directly while it lasts (its fog is moving), exactly as before.
import { groundKey } from './stack.js';
import { CHUNK_PX, CHUNK_FULL, BLEED, scaleKey, cellsFor, chunkCap, snapTranslation } from './chunks.js';
import { ChunkCache } from './chunkcache.js';
export { CHUNK_PX, chunkWorld, chunkBytes, chunksTouched, groundBytes, chunksFor } from './chunks.js'; // the chunk cache's arithmetic (tests/world-ledger.test.mjs holds the memory ledger to it)

/** Milliseconds a frame may spend baking chunks: with the camera still (the picture is settling, nothing else to do) and while it moves (a pan must stay cheap). The first bake of a frame always goes ahead. */
export const BAKE_MS_STILL = 10, BAKE_MS_MOVING = 3.5;

export const groundCacheMethods = {
  /** The render scale of this frame: device pixels per world pixel (chunks.js renderScale). */
  renderScale() { const a = Math.round(this.cam.z * this.dpr * 1e5) / 1e5; return a; },

  /**
   * The ground (terrain, roads, bridges, decals), stamped from chunks. `this.gcSeen` counts the frames the camera has stood still, `this.gcValid` says every visible cell is baked at the exact scale.
   */
  groundPass(ctx, view) {
    const { W, H, dpr } = this, cam = this.cam, k = this.gcKey;
    if (!this.cacheOK() || this.revealing()) { this.gcSeen = 0; this.gcValid = false; k[6] = -1; this.moving = !(k[0] === cam.x && k[1] === cam.y && k[2] === cam.z); k[0] = cam.x; k[1] = cam.y; k[2] = cam.z; this.drawGround(ctx, view, 0); return; } // a district is opening, or there is no canvas to bake into: the ground is drawn directly, as it always was
    const moved = !(k[0] === cam.x && k[1] === cam.y && k[2] === cam.z && k[3] === W && k[4] === H && k[5] === dpr);
    if (moved) { k[0] = cam.x; k[1] = cam.y; k[2] = cam.z; k[3] = W; k[4] = H; k[5] = dpr; this.gcSeen = 0; } else this.gcSeen++;
    this.moving = moved; // (the loop reads it: a camera that moves draws every refresh)
    const gk = groundKey(this); k[6] = this.unlockHash; k[7] = gk;
    let store = this.gc; if (!(store instanceof ChunkCache)) { if (store) this.gc = null; store = this.gc = new ChunkCache('ground.chunks'); }
    if (store.setVer((Math.imul(this.unlockHash | 0, 31) + gk) | 0)) this.gcValid = false;
    const a = this.renderScale(), sk = scaleKey(a), snap = this.snap || (this.snap = [0, 0]); snapTranslation(W, H, dpr, cam.x, cam.y, a, snap);
    const e = snap[0], f = snap[1], cw = this.cv.width, ch = this.cv.height;
    const win = this.gcWin || (this.gcWin = { x0: 0, x1: 0, y0: 0, y1: 0 }); win.x0 = -e / a; win.x1 = (cw - e) / a; win.y0 = -f / a; win.y1 = (ch - f) / a;
    const cells = cellsFor(win, a, this.gcCells || (this.gcCells = {}));
    const draw = this.gcDraw || (this.gcDraw = (g, v) => this.drawGround(g, v, 1));
    // ---- which cells are baked, and which are not (the nearest to the middle of the window are baked first)
    const miss = this.gcMiss || (this.gcMiss = []); miss.length = 0; let have = 0;
    const cx = (cw / 2 - e) / (a * 1), cy = (ch / 2 - f) / (a * 1), s = cells.s;
    for (let j = cells.j0; j <= cells.j1; j++) for (let i = cells.i0; i <= cells.i1; i++) { if (store.has(sk, i, j)) have++; else miss.push(i, j); }
    let baked = 0;
    if (miss.length) {
      const pts = []; for (let n = 0; n < miss.length; n += 2) pts.push([miss[n], miss[n + 1], Math.hypot((miss[n] + 0.5) * s - cx, (miss[n + 1] + 0.5) * s - cy)]); pts.sort((p, q) => p[2] - q[2]);
      const budget = this.gcSeen >= 1 ? (this.gcBudget?.[0] ?? BAKE_MS_STILL) : (this.gcBudget?.[1] ?? BAKE_MS_MOVING), t0 = performance.now(); miss.length = 0; // (this.gcBudget: a test's own milliseconds [still, moving])
      for (const [i, j] of pts) {
        if (baked === 0 || performance.now() - t0 < budget) { const c = store.bake(draw, a, i, j, dpr); if (c) { baked++; continue; } }
        miss.push(i, j);
      }
    }
    // ---- stamp: stale stand-ins first (not where an exact chunk goes), the cells with nothing to stand in drawn directly, then the exact chunks 1:1
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const X = (i) => i * CHUNK_PX + e, Y = (j) => j * CHUNK_PX + f;
    if (miss.length) {
      const L = store.standIns(a, sk), direct = this.gcDirect || (this.gcDirect = []); direct.length = 0;
      if (L.length) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cw, ch);
        for (let j = cells.j0; j <= cells.j1; j++) for (let i = cells.i0; i <= cells.i1; i++) if (store.has(sk, i, j)) ctx.rect(X(i), Y(j), CHUNK_PX, CHUNK_PX);
        ctx.clip('evenodd');
        for (const c of L) {
          const kk = a / c.a, dx = c.i * CHUNK_PX * kk + e, dy = c.j * CHUNK_PX * kk + f, sz = CHUNK_PX * kk;
          if (dx + sz + kk < 0 || dy + sz + kk < 0 || dx - kk > cw || dy - kk > ch) continue;
          ctx.drawImage(c.img, dx - BLEED * kk, dy - BLEED * kk, CHUNK_FULL * kk, CHUNK_FULL * kk);
        }
        ctx.restore(); store.stats.stale += L.length;
      }
      for (let n = 0; n < miss.length; n += 2) { // a cell no stand-in covers (its middle is in no stale chunk) is drawn directly
        const i = miss[n], j = miss[n + 1], mx = (i + 0.5) * s, my = (j + 0.5) * s; let covered = false;
        for (const c of L) { const s0 = CHUNK_PX / c.a; if (mx >= c.i * s0 && mx < (c.i + 1) * s0 && my >= c.j * s0 && my < (c.j + 1) * s0) { covered = true; break; } }
        if (!covered) direct.push(i, j);
      }
      if (direct.length) {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; ctx.save(); ctx.beginPath();
        for (let n = 0; n < direct.length; n += 2) { const i = direct[n], j = direct[n + 1]; ctx.rect(X(i), Y(j), CHUNK_PX, CHUNK_PX); x0 = Math.min(x0, i * s); x1 = Math.max(x1, (i + 1) * s); y0 = Math.min(y0, j * s); y1 = Math.max(y1, (j + 1) * s); }
        ctx.clip(); this.toWorld(ctx); this.drawGround(ctx, { x0: x0 - 1 / a, x1: x1 + 1 / a, y0: y0 - 1 / a, y1: y1 + 1 / a }, 1); ctx.restore(); store.stats.direct += direct.length / 2;
      }
    }
    for (let j = cells.j0; j <= cells.j1; j++) for (let i = cells.i0; i <= cells.i1; i++) {
      const c = store.get(sk, i, j); if (!c) continue;
      ctx.drawImage(c.img, BLEED, BLEED, CHUNK_PX, CHUNK_PX, X(i), Y(j), CHUNK_PX, CHUNK_PX); store.stats.hits++;
    }
    ctx.restore();
    this.gcValid = miss.length === 0;
    if (baked || miss.length === 0 || moved) store.sweep(cells, a, chunkCap(W, H, dpr));
    this.drawGround(ctx, view, 2); // what moves on the ground, live over the chunks (the caller's world transform is back)
  },

  /** Give the ground cache's bitmaps back (World.release). */
  releaseGround() { if (this.gc && typeof this.gc.release === 'function') this.gc.release(); this.gc = null; this.gcValid = false; this.gcSeen = 0; },

  cacheOK() { return typeof OffscreenCanvas === 'function' && this.cv.width > 0; },
};
