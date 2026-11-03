// The base of the V2 ground, painted off the main thread. rasterbase.js is typed-array arithmetic (the sea, the cliffs and the land, a pixel at a time) and needs no canvas: it was two thirds of what a chunk costs to make
// (26 of 40 ms at four times slower than a Mac), done between two frames on the thread that draws them. This module is the worker's whole job and the few things the main thread needs to hand it one:
//   baseSceneOf(scene)   what a bake reads of a scene, as plain data a worker can be sent (typed arrays, numbers, colour triples: no function, and not the coast's rings, which only built the cliff walls)
//   paintBase(job, scene)   one chunk's pixels, as the main thread would have painted them (the same function, on a copy of the same data)
// Loaded in a worker (`new Worker(new URL('./basework.js', import.meta.url), { type: 'module' })`, baseclient.js) it answers two messages: { t: 'scene', key, scene } (kept: the last two sets of locked districts) and
// { t: 'bake', id, scene: key, N, S, ox, oy, maxZ }, which it answers with { id, buf, ms } (the RGBA bytes, handed over, not copied, and the milliseconds the painting took) or { id, err }. Imported anywhere else it does nothing but export.
// Owner: T5 RASTER QUALITY (docs/RENDER_PLAN.md section 5); the painting itself is T1's rasterbase.js, untouched.
import { bakeBase } from './rasterbase.js';

const COLOURS = ['foam', 'crest', 'trough', 'caustic', 'shoal', 'shadow', 'haze', 'glow', 'sandMid', 'sandLight', 'sandHi', 'wet', 'wetSheen', 'lip', 'rock', 'rockShade', 'rockLight', 'rockHi', 'rockHiShade', 'strata', 'ao'];
const FIELD = (f) => ({ d: f.d, nx: f.nx, ny: f.ny, ox: f.ox, oy: f.oy, S: f.S });

/** The parts of a scene (rasterbase.js makeScene) that a bake reads, as data that structured-clones: the typed arrays are shared with the scene (postMessage copies them), nothing is a function. */
export function baseSceneOf(sc) {
  const T = sc.terr, out = {
    coast: { fine: FIELD(sc.coast.fine), coarse: FIELD(sc.coast.coarse) },
    terr: { r: T.r, g: T.g, b: T.b, z: T.z, inl: T.inl, mesh: T.mesh, VW: T.VW, GW: T.GW, GH: T.GH, st: T.st, sd: T.sd },
    bounds: { x0: sc.bounds.x0, x1: sc.bounds.x1, y0: sc.bounds.y0, y1: sc.bounds.y1 },
    lut: { r: sc.lut.r, g: sc.lut.g, b: sc.lut.b },
    walls: { a: sc.walls.a, n: sc.walls.n },
  };
  for (const k of COLOURS) out[k] = sc[k];
  return out;
}

/**
 * One chunk's base: `job` is { N, S, ox, oy, maxZ } (a buffer of N x N pixels at S device pixels to the world pixel, its top left corner at the world point (ox, oy), the island's highest ground), `scene` what
 * baseSceneOf made. Answers the RGBA bytes (opaque everywhere); `out` is a buffer to paint into (else a new one: the worker hands it back, so it is never reused).
 */
export function paintBase(job, scene, out = null) {
  const N = job.N, buf = out || new Uint8ClampedArray(N * N * 4);
  bakeBase(buf, N, N, job.S, job.ox, job.oy, scene, { maxZ: job.maxZ });
  return buf;
}

// ---- the worker's side: only when this module is the worker's own script
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
  const scenes = new Map();
  self.onmessage = (e) => {
    const m = e.data;
    if (m.t === 'scene') { scenes.set(m.key, m.scene); while (scenes.size > 2) scenes.delete(scenes.keys().next().value); return; }
    if (m.t !== 'bake') return;
    try {
      const sc = scenes.get(m.scene); if (!sc) throw new Error('the worker has no scene ' + JSON.stringify(m.scene));
      const t0 = performance.now(), buf = paintBase(m, sc); self.postMessage({ id: m.id, buf: buf.buffer, ms: performance.now() - t0 }, [buf.buffer]);
    } catch (err) { self.postMessage({ id: m.id, err: String((err && err.message) || err) }); }
  };
}
