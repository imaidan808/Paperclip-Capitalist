// The main thread's side of the base worker (basework.js): it asks for the pixels of a chunk's base and is told when they are there, and never waits for them. The chunk cache (chunkcache.js `base`) asks while it plans
// the frame; a chunk whose pixels have not come back is a chunk that is not made yet, exactly as one that is over the frame's budget is, and the stand-ins and the overview are the picture until it is.
//
//   ask(key, job, sceneKey, scene, now)   the pixels of `job` ({ N, S, ox, oy, maxZ, sk: the scale's key }) when the worker has painted them (handed over once), else null, having sent the job if it was not out already and there is room
//   prune(now, keep)                      drops pixels nobody took: at once those of a scale `keep(scaleKey)` refuses (the camera zoomed on), the rest in BASE_KEEP_MS
//   live, pending, done, dispose()        a dead client (the worker errored, answered with an error, or went silent for BASE_TIMEOUT_MS) answers null for ever and the cache paints the base itself, as it always did
// `scene` is a function that answers what to send for a set of locked districts (baseSceneOf of the scene): it is called once for each set, and the worker keeps the last two, as this does.
// Owner: T5 RASTER QUALITY (docs/RENDER_PLAN.md section 5).

export const BASE_TIMEOUT_MS = 6000;  // a job out this long: the worker never started (a script that did not load, a page that forbids workers)
export const BASE_KEEP_MS = 4000;     // pixels nobody took: the camera has left that ground
export const BASE_CAP = 6;            // jobs out and pixels waiting, together: the camera moves on, and what was asked for is of no use

export class BaseClient {
  /** `spawn` makes the worker (a test hands in a stand-in). The worker is made on the first ask. */
  constructor(spawn) {
    this.spawn = spawn; this.w = null; this.dead = false; this.cap = BASE_CAP; this.now = 0; this.n = 0;
    this.out = new Map(); this.byId = new Map(); this.done = new Map(); this.sent = []; this.stats = { posted: 0, got: 0, ms: 0 }; // (ms: what the worker spent painting)
  }
  get live() { return !this.dead; }
  get pending() { return this.out.size; }
  start() {
    if (this.dead) return false; if (this.w) return true;
    try { const w = this.spawn(); this.w = w; w.onmessage = (e) => this.got(e && e.data); w.onerror = () => this.fail(); w.onmessageerror = () => this.fail(); } catch { this.fail(); }
    return !this.dead;
  }
  /** Give the worker up: whatever was out is forgotten and the cache paints the base on the main thread again. */
  fail() { this.dead = true; try { this.w && this.w.terminate(); } catch { /* already gone */ } this.out.clear(); this.byId.clear(); this.done.clear(); this.sent.length = 0; }
  dispose() { this.fail(); }
  got(m) {
    if (this.dead || !m) return;
    const key = this.byId.get(m.id); if (key === undefined) return; const e = this.out.get(key); this.byId.delete(m.id); this.out.delete(key);
    if (m.err || !m.buf) { this.fail(); return; } // (a bake that threw would throw on the main thread as well: the cache finds out there, where it is handled)
    this.done.set(key, { px: new Uint8ClampedArray(m.buf), t: this.now, sk: e ? e.sk : 0 }); this.stats.got++; this.stats.ms += m.ms || 0;
  }
  ask(key, job, sceneKey, scene, now) {
    this.now = now; if (this.dead) return null;
    const d = this.done.get(key); if (d) { this.done.delete(key); return d.px; }
    for (const [k, p] of this.out) { // (the oldest job first)
      if (now - p.t <= BASE_TIMEOUT_MS) break;
      if (!this.stats.got) { this.fail(); return null; } // never answered: it did not start
      this.out.delete(k); this.byId.delete(p.id); // it has answered before: a tab that was hidden paused it, and this job is of ground the camera has left
    }
    if (this.out.has(key) || this.out.size + this.done.size >= this.cap || !this.start()) return null;
    try {
      if (!this.sent.includes(sceneKey)) { this.w.postMessage({ t: 'scene', key: sceneKey, scene: scene() }); this.sent.push(sceneKey); if (this.sent.length > 2) this.sent.shift(); } // (the worker keeps the last two: the same order)
      const id = ++this.n; this.out.set(key, { id, t: now, sk: job.sk }); this.byId.set(id, key); this.stats.posted++;
      this.w.postMessage({ t: 'bake', id, scene: sceneKey, N: job.N, S: job.S, ox: job.ox, oy: job.oy, maxZ: job.maxZ });
    } catch { this.fail(); } // (a scene that cannot be cloned, a worker that is gone: the main thread paints the base, and the frame goes on)
    return null;
  }
  /** Drop the pixels nobody took: those of a scale `keep(sk)` says is gone at once (the camera zoomed on: they were six results that nobody would take and that held the cap, so nothing new was asked for until they aged out), the rest after BASE_KEEP_MS. */
  prune(now, keep = null) { this.now = now; for (const [k, d] of this.done) if (now - d.t > BASE_KEEP_MS || (keep && !keep(d.sk))) this.done.delete(k); }
}

/** A client that spawns the real worker, or null where there is none to spawn: no Worker (Node, an old browser), or a machine with a single core, where a worker would only take the thread's turns. */
export function makeBaseClient() {
  if (typeof Worker !== 'function' || typeof URL !== 'function') return null;
  try { if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency && navigator.hardwareConcurrency < 2) return null; } catch { /* a navigator that throws: assume cores */ }
  return new BaseClient(() => new Worker(new URL('./basework.js', import.meta.url), { type: 'module', name: 'ground-base' }));
}
