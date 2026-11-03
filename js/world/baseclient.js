// The main thread's side of the base worker (basework.js): ask(key, job, sceneKey, scene, now) answers the pixels of `job` ({ N, S, ox, oy, maxZ, sk }) once painted (handed over once), else null, sending the job
// if there is room; prune(now, keep) drops pixels nobody took (at once those of a scale `keep(sk)` refuses). A worker that errors or never answers is given up for good and the cache paints the base itself. Owner: T5.
export const BASE_TIMEOUT_MS = 6000, BASE_KEEP_MS = 4000, BASE_CAP = 6;

export class BaseClient {
  constructor(spawn) { this.spawn = spawn; this.w = null; this.dead = false; this.cap = BASE_CAP; this.now = 0; this.n = 0; this.out = new Map(); this.byId = new Map(); this.done = new Map(); this.sent = []; this.stats = { posted: 0, got: 0 }; }
  get live() { return !this.dead; }
  get pending() { return this.out.size; }
  start() {
    if (!this.w && !this.dead) try { const w = this.w = this.spawn(); w.onmessage = (e) => this.got(e && e.data); w.onerror = w.onmessageerror = () => this.fail(); } catch { this.fail(); }
    return !this.dead;
  }
  fail() { this.dead = true; try { this.w && this.w.terminate(); } catch { /* gone */ } this.out.clear(); this.byId.clear(); this.done.clear(); this.sent.length = 0; }
  got(m) {
    if (this.dead || !m) return;
    const key = this.byId.get(m.id); if (key === undefined) return; const e = this.out.get(key); this.byId.delete(m.id); this.out.delete(key);
    if (m.err || !m.buf) { this.fail(); return; }
    this.done.set(key, { px: new Uint8ClampedArray(m.buf), t: this.now, sk: e ? e.sk : 0 }); this.stats.got++;
  }
  ask(key, job, sceneKey, scene, now) {
    this.now = now; if (this.dead) return null;
    const d = this.done.get(key); if (d) { this.done.delete(key); return d.px; }
    for (const [k, p] of this.out) { // the oldest first
      if (now - p.t <= BASE_TIMEOUT_MS) break;
      if (!this.stats.got) { this.fail(); return null; } // never answered
      this.out.delete(k); this.byId.delete(p.id); // answered before: a hidden tab paused it, and this job is of ground the camera has left
    }
    if (this.out.has(key) || this.out.size + this.done.size >= this.cap || !this.start()) return null;
    try {
      if (!this.sent.includes(sceneKey)) { this.w.postMessage({ t: 'scene', key: sceneKey, scene: scene() }); this.sent.push(sceneKey); if (this.sent.length > 2) this.sent.shift(); }
      const id = ++this.n; this.out.set(key, { id, t: now, sk: job.sk }); this.byId.set(id, key); this.stats.posted++;
      this.w.postMessage({ t: 'bake', id, scene: sceneKey, N: job.N, S: job.S, ox: job.ox, oy: job.oy, maxZ: job.maxZ });
    } catch { this.fail(); }
    return null;
  }
  prune(now, keep = null) { this.now = now; for (const [k, d] of this.done) if (now - d.t > BASE_KEEP_MS || (keep && !keep(d.sk))) this.done.delete(k); }
}

/** A client that spawns the real worker, or null where there is none to spawn (no Worker, or a single core). */
export function makeBaseClient() {
  if (typeof Worker !== 'function' || typeof URL !== 'function') return null;
  if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency < 2) return null;
  return new BaseClient(() => new Worker(new URL('./basework.js', import.meta.url), { type: 'module' }));
}
