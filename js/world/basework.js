// The V2 ground's base (rasterbase.js) painted off the main thread: baseSceneOf(scene) is what a bake reads of a scene, as data a worker can be sent; paintBase(job, scene) one chunk's pixels. As a worker's own
// script (baseclient.js) it answers { t: 'scene', key, scene } (the last two kept) and { t: 'bake', id, scene, N, S, ox, oy, maxZ } with { id, buf } or { id, err }. Owner: T5.
import { bakeBase } from './rasterbase.js';

/** The scene as a worker can be sent it: every field but the coast's rings and distance function (a bake reads neither, and `F` repeats `fine`). */
export const baseSceneOf = (sc) => ({ ...sc, coast: { fine: sc.coast.fine, coarse: sc.coast.coarse } });

export function paintBase(job, scene, out = null) {
  const N = job.N, buf = out || new Uint8ClampedArray(N * N * 4);
  bakeBase(buf, N, N, job.S, job.ox, job.oy, scene, { maxZ: job.maxZ });
  return buf;
}

if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
  const scenes = new Map();
  self.onmessage = (e) => {
    const m = e.data;
    if (m.t === 'scene') { scenes.set(m.key, m.scene); while (scenes.size > 2) scenes.delete(scenes.keys().next().value); return; }
    if (m.t !== 'bake') return;
    try {
      const sc = scenes.get(m.scene); if (!sc) throw new Error('no scene ' + m.scene);
      const buf = paintBase(m, sc); self.postMessage({ id: m.id, buf: buf.buffer }, [buf.buffer]);
    } catch (err) { self.postMessage({ id: m.id, err: String((err && err.message) || err) }); }
  };
}
