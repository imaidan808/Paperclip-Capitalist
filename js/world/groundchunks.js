// The ground in chunks: the baked picture of the island's ground (the sea, the coast, the land, the roads and the districts' blocks) is kept as tiles of CHUNK_PX device pixels at the exact scale of the
// camera, so a pan is a handful of whole-pixel copies and the picture is as sharp as it was baked. Docs/RENDER_PLAN.md sections 3 and 5.
// Owner: T1 TERRAIN, COAST AND WATER (the content of a chunk is T1's: the layers 'shore', 'terrain', 'roads' and 'blocks'; the cache that holds them is this module, written here because the V2 ground needs it
// and the engine's chunk cache (T5) is not merged yet. When it is, `chunkPass` is the one function it replaces).
//
// How it works. A chunk (ci, cj) covers the device pixels [ci C, (ci + 1) C) x [cj C, (cj + 1) C) of the world raster at scale S = dpr x zoom, so its world origin is (ci C / S, cj C / S) and, with the camera's
// translation rounded to whole device pixels (World.toWorld), it lands on whole pixels: a copy, not a resample. It is baked with a two pixel bleed so strokes and anti-aliased edges run on across
// the seam, and only its core is blitted. A bake runs the stack's ground layers into the chunk's own surface: `shore` paints the base (sea, cliffs and land, per pixel: rasterbase.js), `terrain` its dressing,
// `roads` and `blocks` the vector art over it.
// While the zoom changes the chunks of the old scale are blitted scaled (the one scaled copy the plan allows) and the exact ones are baked a few a frame as the zoom rests; a pan bakes the few chunks it
// exposes, and, with the camera still, the ring of chunks beyond the window is baked ahead one a frame so a pan finds them made.
import { surface, ledger, registerReleaser } from './gfx.js';
import { CHUNK_PX } from './chunks.js';
import { runLayer, groundKey } from './stack.js';
import { LAYOUT } from './layout.js';
import { FAR_ZOOM } from './common.js';
import { lockedOf, sceneOf } from './scene.js';

const C = CHUNK_PX, BLEED = 2, N = C + 2 * BLEED, CHUNK_BYTES = N * N * 4;
const caches = new Set();
let SCRATCH = null; // one pixel buffer for every bake: the base is painted per pixel into it and put into the chunk's surface
const scratch = () => SCRATCH || (SCRATCH = (() => { const buf = new Uint8ClampedArray(N * N * 4); return { buf, img: typeof ImageData === 'function' ? new ImageData(buf, N, N) : null }; })());
const POOL = []; // surfaces of released chunks, reused (a bake allocates nothing in the steady state)

/** One set of chunks at one scale and one state of the ground. */
class ChunkSet {
  constructor(S, key) { this.S = S; this.key = key; this.m = new Map(); this.stamp = 0; }
  get(ci, cj) { return this.m.get(ci * 4096 + cj); }
  put(ci, cj, c) { this.m.set(ci * 4096 + cj, c); }
  get size() { return this.m.size; }
  free() { for (const c of this.m.values()) POOL.push(c.s); this.m.clear(); }
}

export class ChunkCache {
  constructor() { this.cur = null; this.old = null; this.lastS = 0; this.lastE = NaN; this.lastF = NaN; this.still = 0; this.zStable = 0; this.frame = 0; this.baked = 0; this.stats = { baked: 0, blits: 0, stale: 0, missing: 0, bakeMs: 0 }; caches.add(this); }
  release() { this.cur?.free(); this.old?.free(); this.cur = this.old = null; this.sync(); }
  count() { return (this.cur ? this.cur.size : 0) + (this.old ? this.old.size : 0); }
  sync() { const n = this.count(); if (n) ledger.register('ground.chunks', n * CHUNK_BYTES); else ledger.release('ground.chunks'); }
}
registerReleaser(() => { for (const c of caches) c.release(); POOL.length = 0; });

/** Bake one chunk of a set: its surface is painted by the stack's ground layers under the chunk's own transform. */
function bake(w, cs, set, ci, cj) {
  const S = set.S, s = POOL.pop() || surface(N, N); if (!s) return null;
  const x0 = (ci * C) / S, y0 = (cj * C) / S, ox = x0 - BLEED / S, oy = y0 - BLEED / S, g = s.g, sc = scratch();
  const view = { x0: ox, x1: ox + N / S, y0: oy, y1: oy + N / S, maxZ: LAYOUT.maxZ }, rec = w.gnd;
  rec.zoom = w.cam.z; rec.far = w.cam.z < FAR_ZOOM; rec.mode = 1; rec.see = (a, b, c2, d) => c2 > view.x0 && a < view.x1 && d > view.y0 && b < view.y1;
  rec.chunk = { S, ox, oy, N, bleed: BLEED, ci, cj, buf: sc.buf, img: sc.img, scene: sceneOf(lockedOf(w.unlocked)) };
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  g.setTransform(S, 0, 0, S, -ox * S, -oy * S);
  for (const id of ['shore', 'terrain', 'roads', 'blocks']) runLayer(id, w, g, view, rec);
  rec.chunk = null; g.setTransform(1, 0, 0, 1, 0, 0);
  const c = { s, stamp: set.stamp }; set.put(ci, cj, c); return c;
}

/**
 * Draw the ground from chunks into the canvas (identity transform, device pixels). Called by groundPass in place of the full-window copy while the V2 ground is in force.
 * Answers false when there are no offscreen surfaces (the Node tests): the caller then draws the layers directly.
 */
export function chunkPass(w, ctx) {
  if (!w.cacheOK()) return false;
  const cs = w.chunks || (w.chunks = new ChunkCache()), cam = w.cam, dpr = w.dpr, S = dpr * cam.z, cw = w.cv.width, ch = w.cv.height;
  const e = Math.round(dpr * (w.W / 2 - cam.x * cam.z)), f = Math.round(dpr * (w.H / 2 - cam.y * cam.z));
  const key = `${w.unlockHash}|${groundKey(w)}|${cw}x${ch}`;
  cs.frame++;
  const shx = e - cs.lastE, shy = f - cs.lastF, moved = shx !== 0 || shy !== 0 || cs.lastE !== cs.lastE, zoomed = S !== cs.lastS;
  cs.still = moved || zoomed ? 0 : cs.still + 1; cs.zStable = zoomed ? 0 : cs.zStable + 1; cs.lastE = e; cs.lastF = f; cs.lastS = S;
  if (!cs.cur || cs.cur.S !== S || cs.cur.key !== key) { // a new scale, or a new state of the ground: the fullest set stays on show, scaled, until the exact one is made
    const was = cs.cur;
    if (was && was.size && (!cs.old || was.size >= cs.old.size)) { if (cs.old) cs.old.free(); cs.old = was; } else if (was) was.free(); // (a zoom that changes every frame must not replace a full old set with the one or two chunks a frame made)
    cs.cur = new ChunkSet(S, key);
  }
  const set = cs.cur, old = cs.old, i0 = Math.floor(-e / C), i1 = Math.floor((cw - 1 - e) / C), j0 = Math.floor(-f / C), j1 = Math.floor((ch - 1 - f) / C), cx = (cw / 2 - e) / C, cy = (ch / 2 - f) / C;
  const need = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) need.push({ i, j, d: (i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2 });
  need.sort((a, b) => a.d - b.d);
  // What may be baked this frame. The very first ground (nothing to show yet) is baked whole. After that a frame bakes for about 9 ms, 14 with the camera at rest (always one chunk, if one is missing; the shot rig bakes everything at once): a camera at rest or a pan
  // fills in what it needs; a zoom on the move bakes nothing (the scale changes every frame) while there is an old set to show.
  const first = !old && !set.size, hold = !!old && (zoomed || (cs.still < 1 && cs.zStable < 3)), rig = typeof window !== 'undefined' && !!window.__rig, t0 = typeof performance !== 'undefined' ? performance.now() : 0, ms = cs.still >= 1 ? 14 : 9;
  let baked = 0; const may = () => first || rig || (!hold && (baked === 0 || (typeof performance === 'undefined' || performance.now() - t0 < ms)));
  set.stamp = cs.frame; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  let missing = 0;
  for (const n of need) {
    let c = set.get(n.i, n.j);
    if (!c && may()) { c = bake(w, cs, set, n.i, n.j); baked++; cs.stats.baked++; }
    const dx = e + n.i * C, dy = f + n.j * C;
    if (c) { c.stamp = cs.frame; ctx.drawImage(c.s.c, BLEED, BLEED, C, C, dx, dy, C, C); cs.stats.blits++; continue; }
    missing++;
    if (old) { // the old scale, scaled, over the rectangle of the chunk that is not made yet
      const k = S / old.S, so = C / old.S; ctx.save(); ctx.beginPath(); ctx.rect(dx, dy, C, C); ctx.clip();
      const wx0 = (dx - e) / S, wy0 = (dy - f) / S, oi0 = Math.floor(wx0 / so), oi1 = Math.floor((wx0 + C / S) / so), oj0 = Math.floor(wy0 / so), oj1 = Math.floor((wy0 + C / S) / so);
      for (let oj = oj0; oj <= oj1; oj++) for (let oi = oi0; oi <= oi1; oi++) { const oc = old.get(oi, oj); if (oc) { ctx.drawImage(oc.s.c, BLEED, BLEED, C, C, e + oi * C * k, f + oj * C * k, C * k, C * k); cs.stats.stale++; } }
      ctx.restore();
    }
  }
  ctx.restore();
  if (!missing && old) { old.free(); cs.old = null; } // the exact scale is complete: the old one goes
  if (!missing && !hold && may()) { // nothing missing: bake one chunk of the ring beyond the window, the one the camera is heading for, so a pan finds it ready
    let best = null, bs = -1e9; const ax = -shx, ay = -shy;
    for (let j = j0 - 1; j <= j1 + 1; j++) for (let i = i0 - 1; i <= i1 + 1; i++) {
      if ((i >= i0 && i <= i1 && j >= j0 && j <= j1) || set.get(i, j)) continue;
      const sc = (i + 0.5 - cx) * ax + (j + 0.5 - cy) * ay - 0.001 * ((i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2); if (sc > bs) { bs = sc; best = [i, j]; }
    }
    if (best && (cs.still >= 1 || (shx !== 0 || shy !== 0))) { bake(w, cs, set, best[0], best[1]); cs.stats.baked++; }
  }
  // keep the set to the window and the ring round it: the chunks unused for the longest go back to the pool
  const cap = (i1 - i0 + 1 + 2) * (j1 - j0 + 1 + 2);
  if (set.size > cap) { const all = [...set.m.entries()].sort((a, b) => a[1].stamp - b[1].stamp); for (let q = 0; set.size > cap && q < all.length; q++) { POOL.push(all[q][1].s); set.m.delete(all[q][0]); } }
  if (POOL.length > 12) POOL.length = 12;
  if (typeof performance !== 'undefined') cs.stats.bakeMs += performance.now() - t0;
  cs.sync(); w.gcValid = true;
  return true;
}
