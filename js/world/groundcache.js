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
//
// The V2 ground (the base is painted per pixel: 20 to 70 ms a chunk on a laptop four times slower than a Mac) has no direct drawing, so a cell that is not made shows the sea. What keeps that off the screen, in order:
//   - the exact chunk, stamped 1:1; else the stand-ins of the nearer scales (the store keeps them for as long as the picture needs them: chunkcache.js); else the chunk of ANY scale that has the area, soft (`soften`);
//   - what no chunk has is made COARSE first: a chunk baked at about half the scale covers four cells, so a soft whole picture exists in a quarter of the frames, and the exact chunks follow and fade in over it;
//   - while the canvas is held back (the veil, world.js: nobody sees the ground being made) the cells are made exact at once, as they were: coarse chunks would only be work thrown away.
//   - and under all of that the OVERVIEW: the whole island's ground at a very coarse scale (chunks.js OVERVIEW_A: a handful of chunks), made a chunk a frame once the window's ground is whole and the camera still, kept apart
//     from the chunks of the frame's scales (chunkcache.js `ov`), and drawn, soft, into whatever nothing else covers. A camera that jumps, or a zoom out that reveals ground nobody has made, never shows the bare sea (a
//     recording of the live site had hard-edged flat rectangles at the coast for about a second at every zoom or glide, and 10 to 14 frames a second: the first chunk of every frame was baked whatever it cost). With the
//     overview made, a frame in which the camera moves does not start a chunk that costs more than its budget (`calmMove`: the stand-ins and the overview are the picture, and the exact chunks follow when the camera rests).
// The V2 base is painted by a WORKER where there is one (basework.js): the pass asks for chunks, nearest the middle first, and makes each when its pixels are back (no coarse cover then); else it paints here.
// `gcHoles` counts the pieces of the window that nothing at all covers after all of that (the sea shows there; the open sea beyond the island's box is not a hole), and `gcMore` says the ground wants another frame.
import { groundKey, slotFor } from './stack.js';
import { CHUNK_PX, scaleKey, chunkKey, cellsFor, chunkCap, snapTranslation, OVERVIEW_A, overviewCells, standInSmooth } from './chunks.js';
import { ChunkCache } from './chunkcache.js';
import { ledger, LEDGER_LIMIT_MB, softwareRaster } from './gfx.js';
import { lodOf } from './lod.js';
import { makeBaseClient } from './baseclient.js';
import { baseSceneOf } from './basework.js';
import { sceneOf, lockedOf } from './scene.js';
import { LAYOUT } from './layout.js';
export { CHUNK_PX, chunkWorld, chunkBytes, chunksTouched, groundBytes, chunksFor } from './chunks.js'; // the chunk cache's arithmetic (tests/world-ledger.test.mjs holds the memory ledger to it)

/** Milliseconds a frame may spend baking chunks: with the camera still (the picture is settling, nothing else to do) and while it moves (a pan must stay cheap). The first bake of a frame always goes ahead. */
export const BAKE_MS_STILL = 10, BAKE_MS_MOVING = 3.5;
/** The V2 ground's chunks are dearer to bake (a base painted per pixel, 3 to 13 ms each in Node), so a frame may spend more on them: still, moving. A chunk that nothing stands in for is baked whatever the budget, one a frame at the least. */
export const V2_BAKE_MS = [14, 9];
/** While the zoom changes a frame bakes one chunk (the first is always baked) and no more than this many milliseconds of them: a pinch must never stall on the base. */
export const ZOOM_BAKE_MS = 2.5;
/** The scale must stand still this long (ms) before chunks are baked at it: while it changes every frame, stale chunks and direct cells stand in. */
export const ZOOM_REST_MS = 90;
/** An exact chunk baked over the stand-in that was showing there fades in over this many ms (a zoom that comes to rest: the soft picture sharpens, a stride that changed does not pop). Never under Calm, Off and reduced motion. */
export const GROUND_FADE_MS = 140;

export const groundCacheMethods = {
  /** The render scale of this frame: device pixels per world pixel (chunks.js renderScale). */
  renderScale() { const a = Math.round(this.cam.z * this.dpr * 1e5) / 1e5; return a; },

  /**
   * The ground (terrain, roads, bridges, decals), stamped from chunks. `this.gcSeen` counts the frames the camera has stood still, `this.gcValid` says every visible cell is baked at the exact scale.
   */
  groundPass(ctx, view) {
    const { W, H, dpr } = this, cam = this.cam, k = this.gcKey;
    const v2 = slotFor('shore').impl === 'v2', rig = v2 && typeof window !== 'undefined' && !!window.__rig; // the V2 ground is a base painted per pixel into chunks: it has no direct drawing, so a district that is opening is served from chunks too (its clouds are a layer of their own) and a cell not baked yet shows the sea under it
    if (!this.cacheOK() || (!v2 && this.revealing())) { this.gcSeen = 0; this.gcValid = false; this.gcHoles = 0; this.gcMore = false; k[6] = -1; this.moving = !(k[0] === cam.x && k[1] === cam.y && k[2] === cam.z); k[0] = cam.x; k[1] = cam.y; k[2] = cam.z; this.drawGround(ctx, view, 0); return; } // a district is opening, or there is no canvas to bake into: the ground is drawn directly, as it always was
    const moved = !(k[0] === cam.x && k[1] === cam.y && k[2] === cam.z && k[3] === W && k[4] === H && k[5] === dpr);
    if (moved) { k[0] = cam.x; k[1] = cam.y; k[2] = cam.z; k[3] = W; k[4] = H; k[5] = dpr; this.gcSeen = 0; } else this.gcSeen++;
    this.moving = moved; // (the loop reads it: a camera that moves draws every refresh)
    const gk = groundKey(this); k[6] = this.unlockHash; k[7] = gk;
    let store = this.gc; if (!(store instanceof ChunkCache)) { if (store) this.gc = null; store = this.gc = new ChunkCache('ground.chunks'); }
    store.opaque = v2;
    const client = v2 && !rig ? this.baseWorker() : null;
    store.base = client ? this.baseHook(client, performance.now()) : null;
    const ver = (Math.imul(this.unlockHash | 0, 31) + gk) | 0;
    if (v2 ? store.markStale(ver) : store.setVer(ver)) this.gcValid = false;
    store.begin();
    const a = this.renderScale(), sk = scaleKey(a), snap = this.snap || (this.snap = [0, 0]); snapTranslation(W, H, dpr, cam.x, cam.y, a, snap);
    if (client) { this.gcWantSk = sk; client.prune(performance.now(), this.gcWanted || (this.gcWanted = (k) => k === this.gcWantSk || k === scaleKey(OVERVIEW_A))); }
    const now = performance.now(); if (a !== this.gcA) { this.gcUp = a > (this.gcA ?? a) ? 1 : this.gcUp === 1 && a === this.gcA ? 1 : a < (this.gcA ?? a) ? 0 : this.gcUp; this.gcA = a; this.gcAt = now; }
    const zooming = now - (this.gcAt ?? -1e9) < (this.gcRest ?? ZOOM_REST_MS); // the scale is changing (a pinch, a wheel, a glide): nothing is baked at a scale that is gone in the next frame; stand-ins and direct cells cover the window, and the exact scale is baked once it rests
    const e = snap[0], f = snap[1], cw = this.cv.width, ch = this.cv.height;
    const win = this.gcWin || (this.gcWin = { x0: 0, x1: 0, y0: 0, y1: 0 }); win.x0 = -e / a; win.x1 = (cw - e) / a; win.y0 = -f / a; win.y1 = (ch - f) / a;
    const cells = cellsFor(win, a, this.gcCells || (this.gcCells = {}));
    const draw = this.gcDraw || (this.gcDraw = (g, v, info) => this.drawGround(g, v, 1, info));
    const bnd = typeof this.bounds === 'function' ? this.bounds() : null; // the box the island and its coast fill: what lies outside it is open sea (no hole, no overview)
    let winB = win; if (bnd) { winB = this.gcWinB || (this.gcWinB = { x0: 0, x1: 0, y0: 0, y1: 0 }); winB.x0 = Math.max(win.x0, bnd.x0); winB.x1 = Math.min(win.x1, bnd.x1); winB.y0 = Math.max(win.y0, bnd.y0); winB.y1 = Math.min(win.y1, bnd.y1); }
    let ov = null; if (v2 && bnd) { ov = this.gcOv && this.gcOv.b === bnd ? this.gcOv : (this.gcOv = { b: bnd, c: overviewCells(bnd), n: 0 }); ov.n = (ov.c.i1 - ov.c.i0 + 1) * (ov.c.j1 - ov.c.j0 + 1); }
    const ovReady = !!ov && store.ov.size >= ov.n, calmMove = moved && ovReady; // the overview is made and under everything, and the camera moves
    const fadeMs = this.reduced() ? 0 : (this.gcFade ?? GROUND_FADE_MS);
    const soft = softwareRaster();
    // ---- which cells are baked, and which are not (the nearest to the middle of the window are baked first)
    const miss = this.gcMiss || (this.gcMiss = []); miss.length = 0; let have = 0;
    const cx = (cw / 2 - e) / (a * 1), cy = (ch / 2 - f) / (a * 1), s = cells.s;
    for (let j = cells.j0; j <= cells.j1; j++) for (let i = cells.i0; i <= cells.i1; i++) { const c0 = store.map.get(chunkKey(sk, i, j)); if (c0 && !c0.stale) have++; else miss.push(i, j); }
    let baked = 0; const all = v2 && rig; // (the shot rig bakes the whole window at once; a real start bakes it over a few frames, the first chunk of a frame always and then the frame's budget, so the first screen is never a 450 ms freeze)
    const bare = this.gcPart || (this.gcPart = []);
    if (miss.length) {
      const pts = []; for (let n = 0; n < miss.length; n += 2) pts.push([miss[n], miss[n + 1], Math.hypot((miss[n] + 0.5) * s - cx, (miss[n + 1] + 0.5) * s - cy)]); pts.sort((p, q) => p[2] - q[2]);
      const budget = zooming ? (this.gcBudget?.[1] ?? ZOOM_BAKE_MS) : this.gcSeen >= 1 ? (this.gcBudget?.[0] ?? (v2 ? V2_BAKE_MS[0] : BAKE_MS_STILL)) : (this.gcBudget?.[1] ?? (v2 ? V2_BAKE_MS[1] : BAKE_MS_MOVING)), t0 = performance.now(); miss.length = 0; // (all: the first ground, and the shot rig, bake the whole window at once) // (this.gcBudget: a test's own milliseconds [still, moving])
      if (zooming || fadeMs > 0 || v2) store.standIns(a, sk, now);
      const ab = Math.round(Math.pow(2, Math.round(Math.log2(a) * 4) / 4 - (this.gcUp ? 0.9 : 0)) * 1e5) / 1e5, sb = CHUNK_PX / ab; // the quarter-octave bucket, a zoom IN bakes at 0.54 of the scale it is at (a chunk of 3.4 times the world area, so a third of the chunks cover the window, and the per-pixel base costs a third; magnified 1.9 to 3.2 times while the zoom lasts), a zoom OUT at the scale it is at (shrunk to a half); the frames of one stretch of a zoom share their chunks
      if (v2) {
        // ---- COVER FIRST: a cell that no stand-in covers is made coarse (about half the scale: four cells to a chunk) before any exact chunk, unless the canvas is held back or the budget is the whole window's (a test)
        const whole = budget >= 1e6, cover = !all && !whole && !this.veilHold && !calmMove && !client; let bareLeft = false; // (held back: nobody sees the cells being made, and a canvas that is just attached is a scale that "just changed"; the overview is the cover while the camera moves)
        if (cover) {
          const ac = Math.round(Math.pow(2, Math.round(Math.log2(a) * 4) / 4 - 0.9) * 1e5) / 1e5;
          bareLeft = store.cover(pts, s, winB, sk, a, now, ac, (ci, cj) => { const c = store.bake(draw, ac, ci, cj, dpr, true); if (c) baked++; return c; }, (made) => baked === 0 || performance.now() - t0 < budget); // (the first bake of a frame always goes ahead)
        }
        // ---- then the exact chunks, the nearest to the middle first (not while the scale changes: it is gone in the next frame); one made over a stand-in that covers all of its cell fades in over it
        const cost = calmMove ? store.stats.lastMs || 0 : 0; // (while the camera moves over the overview a chunk is not started when it would not fit the budget: the first of a frame is no longer made whatever it costs)
        for (const [i, j] of pts) {
          if (!zooming && !bareLeft && (all || (calmMove ? performance.now() - t0 + cost <= budget : baked === 0 || performance.now() - t0 < budget))) {
            const c = store.bake(draw, a, i, j, dpr);
            if (c) { baked++; bare.length = 0; if (fadeMs > 0 && !c.empty && (ovReady || (store.list.length && !store.bareOf(i, j, s, bare, winB)))) c.fadeEnd = performance.now() + fadeMs; continue; } // (no fade over a stand-in that leaves part of the cell bare: the fade would run over the sea; over the overview it is a fade over a soft picture)
          }
          miss.push(i, j);
        }
      } else {
        for (const [i, j] of pts) {
          const ok = all || baked === 0 || performance.now() - t0 < budget;
          if (!zooming) { if (ok) { const c = store.bake(draw, a, i, j, dpr); if (c) { baked++; if (fadeMs > 0 && !c.empty && store.covered((i + 0.5) * s, (j + 0.5) * s)) c.fadeEnd = performance.now() + fadeMs; continue; } } } // (a chunk baked where a stand-in was showing fades in over it)
          else { // while the scale changes a cell is baked only when nothing stands in for it (the cells a zoom out reveals), at the bucket scale: that chunk stands in for the next frames of the zoom, and costs a bake once where a direct draw costs every frame
            const mx = (i + 0.5) * s, my = (j + 0.5) * s;
            if (!store.covered(mx, my) && ok) { const c = store.bake(draw, ab, Math.floor(mx / sb), Math.floor(my / sb), dpr, true); if (c) { baked++; store.standIns(a, sk); } }
          }
          miss.push(i, j);
        }
      }
    }
    // ---- stamp: stale stand-ins first (not where an exact chunk goes, unless that chunk is still fading in), the cells with nothing to stand in drawn directly, then the exact chunks 1:1
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const X = (i) => i * CHUNK_PX + e, Y = (j) => j * CHUNK_PX + f, tNow = performance.now();
    let fading = 0;
    for (let j = cells.j0; j <= cells.j1; j++) for (let i = cells.i0; i <= cells.i1; i++) { const c = store.map.get(chunkKey(sk, i, j)); if (c && c.fadeEnd) { if (c.fadeEnd > tNow) fading++; else c.fadeEnd = 0; } }
    let holes = 0;
    if (miss.length || fading) {
      const L = store.standIns(a, sk, tNow), direct = this.gcDirect || (this.gcDirect = []); direct.length = 0;
      if (v2) { // the pieces of the window that no stand-in covers, in the cells with no finished chunk of their own: the chunk of any other scale that has the area is drawn into them, soft; what is left is the sea
        bare.length = 0; for (let j = cells.j0; j <= cells.j1; j++) for (let i = cells.i0; i <= cells.i1; i++) { const ex = store.map.get(chunkKey(sk, i, j)); if (!ex || ex.fadeEnd > tNow) store.bareOf(i, j, s, bare, winB); }
        if (bare.length) { store.soften(ctx, bare, a, e, f); holes = bare.length >> 2; }
      }
      if (L.length) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cw, ch);
        for (let j = cells.j0; j <= cells.j1; j++) for (let i = cells.i0; i <= cells.i1; i++) { const c = store.map.get(chunkKey(sk, i, j)); if (c && !(c.fadeEnd > tNow)) ctx.rect(X(i), Y(j), CHUNK_PX, CHUNK_PX); }
        ctx.clip('evenodd');
        for (const c of L) {
          const kk = a / c.a, dx = c.i * CHUNK_PX * kk + e, dy = c.j * CHUNK_PX * kk + f, sz = CHUNK_PX * kk;
          if (dx + sz + kk < 0 || dy + sz + kk < 0 || dx - kk > cw || dy - kk > ch) continue;
          if (c.empty || store.hidden(c, sk, s)) { c.last = ++store.tick; continue; } store.use(c); ctx.imageSmoothingEnabled = standInSmooth(kk, zooming, soft); ctx.drawImage(c.img, dx - kk * 0.5, dy - kk * 0.5, sz + kk, sz + kk); // (a pixel larger than its cell, so scaled neighbours overlap and never leave a hairline)
        }
        ctx.restore(); store.stats.stale += L.length;
      }
      if (!v2) for (let n = 0; n < miss.length; n += 2) { // a cell no stand-in covers (its middle is in no stale chunk) is drawn directly
        const i = miss[n], j = miss[n + 1], mx = (i + 0.5) * s, my = (j + 0.5) * s; let covered = false;
        for (const c of L) { const s0 = CHUNK_PX / c.a; if (mx >= c.i * s0 && mx < (c.i + 1) * s0 && my >= c.j * s0 && my < (c.j + 1) * s0) { covered = true; break; } }
        if (!covered) direct.push(i, j);
      }
      if (direct.length && !v2) {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; ctx.save(); ctx.beginPath();
        for (let n = 0; n < direct.length; n += 2) { const i = direct[n], j = direct[n + 1]; ctx.rect(X(i), Y(j), CHUNK_PX, CHUNK_PX); x0 = Math.min(x0, i * s); x1 = Math.max(x1, (i + 1) * s); y0 = Math.min(y0, j * s); y1 = Math.max(y1, (j + 1) * s); }
        ctx.clip(); this.toWorld(ctx); this.drawGround(ctx, { x0: x0 - 1 / a, x1: x1 + 1 / a, y0: y0 - 1 / a, y1: y1 + 1 / a }, 1); ctx.restore(); store.stats.direct += direct.length / 2;
      }
    }
    for (let j = cells.j0; j <= cells.j1; j++) for (let i = cells.i0; i <= cells.i1; i++) {
      const c = store.get(sk, i, j); if (!c || c.empty) continue;
      if (c.fadeEnd > tNow) { const t = 1 - (c.fadeEnd - tNow) / fadeMs; ctx.globalAlpha = t * t * (3 - 2 * t); ctx.drawImage(c.img, X(i), Y(j)); ctx.globalAlpha = 1; store.stats.faded++; continue; }
      ctx.drawImage(c.img, X(i), Y(j)); store.stats.hits++; // the whole bitmap, 1:1 on whole pixels (with a source rectangle the same blit costs twice as much on a CPU-drawn canvas)
    }
    ctx.restore(); if (fading) this.dirty = true; // (a fade is a few frames of its own: the loop keeps drawing until it is over)
    // ---- the V2 ground: with the window complete, one chunk of the ring beyond it is baked a frame, the one the camera is heading for (still: the next that is missing), so a pan finds its ground made
    const de = e - (this.gcE ?? e), df = f - (this.gcF ?? f); this.gcE = e; this.gcF = f;
    // ---- the overview first (a chunk a frame, the nearest to the middle of the window first, in a frame that made no chunk of the window's own), not while the canvas is held back (the first seconds are the exact ground's) and not for
    // the shot rig. A chunk that does not exist yet is made whatever the ledger says (the largest windows sit at its ceiling, and the squeeze gives back sprites, clouds and exact chunks, never this); a stale one is made again when there is room.
    const ovMade = !!ov && !baked && !miss.length && !zooming && !rig && !this.veilHold && (store.ov.size < ov.n || ledger.within(LEDGER_LIMIT_MB)) && this.overviewStep(store, draw, dpr, ov, cx, cy);
    if (ovMade) baked++;
    if (v2 && !miss.length && !zooming && !rig && !ovMade && store.size < chunkCap(W, H, dpr)) {
      let bi = 0, bj = 0, bs = -1e9;
      for (let j = cells.j0 - 1; j <= cells.j1 + 1; j++) for (let i = cells.i0 - 1; i <= cells.i1 + 1; i++) {
        if ((i >= cells.i0 && i <= cells.i1 && j >= cells.j0 && j <= cells.j1) || store.has(sk, i, j)) continue;
        const mx = (i + 0.5) * CHUNK_PX + e - cw / 2, my = (j + 0.5) * CHUNK_PX + f - ch / 2, sc = (mx * -de + my * -df) - 0.001 * (mx * mx + my * my); // toward the way the picture is being pulled, else the nearest
        if (sc > bs) { bs = sc; bi = i; bj = j; }
      }
      if (bs > -1e9) { const c = store.bake(draw, a, bi, bj, dpr); if (c) baked++; }
    }
    this.gcValid = miss.length === 0; this.gcHoles = holes; this.gcMore = v2 && miss.length > 0; // (gcMore: a ground that is not whole asks for the next frame, or a loop that sleeps under reduced motion stops on a half-made one)
    if (baked || miss.length === 0 || moved) { const cap = chunkCap(W, H, dpr); store.sweep(cells, a, cap, performance.now(), Math.ceil(cap * 1.25), v2 && !miss.length && !zooming && !fading); } // (a stand-in on show is kept past the cap, up to a fifth more: a hole is worse than a few chunks)
    this.drawGround(ctx, view, 2); // what moves on the ground, live over the chunks (the caller's world transform is back)
  },

  /**
   * Make the next chunk of the overview: the cell of the island's box (ov.c) that has none, or a stale one (a district opened since), the nearest to the world point (cx, cy) first. It is baked as the far view it is (the
   * level of detail of its own scale, not the camera's). Answers whether a chunk was made.
   */
  overviewStep(store, draw, dpr, ov, cx, cy) {
    const c = ov.c, s = c.s, sk = scaleKey(OVERVIEW_A); let bi = 0, bj = 0, bd = Infinity;
    for (let j = c.j0; j <= c.j1; j++) for (let i = c.i0; i <= c.i1; i++) {
      const have = store.ov.get(chunkKey(sk, i, j)); if (have && !have.stale) continue;
      const d = Math.hypot((i + 0.5) * s - cx, (j + 0.5) * s - cy); if (d < bd) { bd = d; bi = i; bj = j; }
    }
    if (bd === Infinity) return false;
    const env = this.env, keep = env && env.lod; if (env) env.lod = lodOf(OVERVIEW_A / Math.max(dpr, 1e-3), this.gcOvLod || (this.gcOvLod = {}));
    try { return !!store.bake(draw, OVERVIEW_A, bi, bj, dpr, false, true); } finally { if (env) env.lod = keep; }
  },

  /** The base worker (baseclient.js), made on first use: null where there is none or it failed (for good). */
  baseWorker() {
    if (this.gcWorker === undefined) this.gcWorker = makeBaseClient();
    if (this.gcWorker && !this.gcWorker.live) this.gcWorker = null;
    return this.gcWorker;
  },
  /** The cache's `base` hook for this frame: a chunk's base from the worker (null while it is painted), for the districts locked now. */
  baseHook(client, now) {
    if (this.gcLockHash !== this.unlockHash || this.gcSceneKey === undefined) { const locked = lockedOf(this.unlocked); this.gcLockHash = this.unlockHash; this.gcSceneKey = locked.join(','); this.gcScene = () => baseSceneOf(sceneOf(locked)); }
    const sk = this.gcSceneKey, scene = this.gcScene, maxZ = LAYOUT.maxZ;
    return (J) => { J.maxZ = maxZ; return client.ask(J.key + '|' + sk, J, sk, scene, now); };
  },
  /** Give the ground cache's bitmaps back (World.release). */
  releaseGround() { if (this.gc && typeof this.gc.release === 'function') this.gc.release(); this.gc = null; if (this.gcWorker) this.gcWorker.fail(); this.gcWorker = undefined; this.gcValid = false; this.gcHoles = 0; this.gcMore = false; this.gcSeen = 0; },

  cacheOK() { return typeof OffscreenCanvas === 'function' && this.cv.width > 0; },
};
