// The V2 ground's chunk made off the main thread. A worker owns a CPU OffscreenCanvas and a chunk store of its own and bakes a chunk with the code the main thread bakes it with (ChunkCache.bake over the layers of ground.js,
// the per-pixel base included), so the pixels are the same ones; the cell comes back as an ImageBitmap and the main thread only stamps it. As a worker's own script (baseclient.js) it says { t: 'hello', ok } once its canvas works
// and answers { t: 'world', key, unlocked } (the districts that are open; the last two kept) and { t: 'chunk', id, world, a, i, j, dpr, coarse, pin, zoom } with { id, bmp } or { id, err }. Owner: T5.
import { ChunkCache } from './chunkcache.js';
import { groundMethods } from './ground.js';
import { lodOf } from './lod.js';
import { sceneOf, lockedOf, coastOf } from './scene.js';
import { surface } from './gfx.js';

/** A maker of chunks: the least a World is to the ground layers (the districts that are open, the zoom a chunk stands for and its level of detail) over a chunk store that keeps nothing. */
export class ChunkMaker {
  constructor(make = surface) {
    const store = this.store = new ChunkCache('worker.chunks', make), lod = {}; store.opaque = true; this.worlds = new Map();
    const w = this.w = { ...groundMethods, gnd: { zoom: 1, far: false, mode: 0, see: null }, cam: { z: 1 }, env: { lod: null }, unlocked: null };
    this.draw = (g, view, info) => { w.env.lod = lodOf(info.zoom > 0 ? info.zoom : w.cam.z, lod); w.drawGround(g, view, 1, info); }; // (the overview is baked as the far view it is, any other chunk as the camera's zoom)
  }
  /** Take the districts that are open under `key` (null: all of them); the scene of that state is built at once, before the first chunk asks for it. */
  world(key, unlocked) {
    const u = unlocked && new Set(unlocked); this.worlds.set(key, u); while (this.worlds.size > 2) this.worlds.delete(this.worlds.keys().next().value);
    sceneOf(lockedOf(u));
  }
  /** The cell of chunk (i, j) at render scale `a` as a bitmap, for the world `m.world` and the camera zoom `m.zoom`: it is handed over, the store keeps no chunk. */
  chunk(m) {
    const w = this.w, u = this.worlds.get(m.world); if (u === undefined) throw new Error('no world ' + m.world);
    w.unlocked = u; w.cam.z = m.zoom;
    const c = this.store.bake(this.draw, m.a, m.i, m.j, m.dpr, m.coarse, m.pin); if (!c || !c.img) throw new Error('no surface to bake into');
    this.store.map.clear(); this.store.ov.clear(); this.store.sync(); // (cleared, not dropped: the bitmap is not closed, it leaves with the message)
    return c.img;
  }
}

if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
  const f = surface(1, 1, { willReadFrequently: true });
  if (!f || typeof f.c.transferToImageBitmap !== 'function') self.postMessage({ t: 'hello', ok: false });
  else {
    const maker = new ChunkMaker();
    self.onmessage = (e) => {
      const m = e.data;
      try { if (m.t === 'world') maker.world(m.key, m.unlocked); else if (m.t === 'chunk') { const bmp = maker.chunk(m); self.postMessage({ id: m.id, bmp }, [bmp]); } } catch (err) { self.postMessage({ id: m.id, err: String((err && err.message) || err) }); }
    };
    coastOf(); self.postMessage({ t: 'hello', ok: true });
  }
}
