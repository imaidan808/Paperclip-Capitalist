// The main thread's side of the chunk workers (basework.js): ask(key, job, world, unlocked, now) answers the bitmap of the chunk `job` ({ a, i, j, dpr, coarse, pin, zoom, sk }) once a worker has made it (handed over once), else null,
// sending the job to the worker with the most room; prune(now, keep) drops the bitmaps nobody took (at once those of a scale `keep(sk)` refuses). A worker that errors, has no canvas or never says a word is given up for good, and the
// cache makes its chunks itself. Owner: T5.
export const BASE_TIMEOUT_MS = 6000, BASE_KEEP_MS = 4000, BASE_PER = 2, BASE_POOL = 3, BASE_SPARE_MS = 30000;

export class BaseClient {
  constructor(spawn, size = 1) { this.spawn = spawn; this.size = size; this.ws = []; this.dead = false; this.cap = size * BASE_PER * 2; this.now = 0; this.t0 = 0; this.n = 0; this.takes = Infinity; this.out = new Map(); this.byId = new Map(); this.done = new Map(); this.stats = { posted: 0, got: 0 }; }
  get live() { return !this.dead; }
  get pending() { return this.out.size; }
  start() {
    if (!this.ws.length && !this.dead) try {
      this.t0 = this.now;
      for (let k = 0; k < this.size; k++) { const s = { w: this.spawn(), sent: [], load: 0, up: false }; this.ws.push(s); s.w.onmessage = (e) => this.got(s, e && e.data); s.w.onerror = s.w.onmessageerror = () => this.fail(); }
    } catch { this.fail(); }
    return !this.dead;
  }
  fail() {
    this.dead = true; for (const s of this.ws) try { s.w.terminate(); } catch { /* gone */ }
    for (const d of this.done.values()) try { d.bmp.close(); } catch { /* gone */ }
    this.ws.length = 0; this.out.clear(); this.byId.clear(); this.done.clear();
  }
  got(s, m) {
    if (this.dead || !m) return;
    if (m.t === 'hello') { if (m.ok) s.up = true; else this.fail(); return; }
    const key = this.byId.get(m.id); if (key === undefined) { try { m.bmp.close(); } catch { /* none */ } return; } // (the answer to a job given up on: its bitmap goes)
    const e = this.out.get(key); this.byId.delete(m.id); this.out.delete(key); s.load--;
    if (m.err || !m.bmp) { this.fail(); return; }
    this.done.set(key, { bmp: m.bmp, t: this.now, sk: e ? e.sk : 0 }); this.stats.got++;
  }
  /** The bitmap of chunk `key` if it is made (handed over once), else asks for it (`want`) and answers null. */
  ask(key, job, world, unlocked, now) {
    this.now = now; if (this.dead) return null;
    const d = this.done.get(key); if (d) { if (this.takes <= 0) return null; this.takes--; this.done.delete(key); return d.bmp; } // (`takes`: how many the frame may take, set by the pass: a bitmap's first draw is an upload to the GPU)
    this.want(key, job, world, unlocked, now); return null;
  }
  /** Send chunk `key` to the worker with the most room unless it is made or on its way, taking nothing: the camera is going where it will be asked for. At most `cap` chunks are out and waiting. */
  want(key, job, world, unlocked, now, cap = this.cap) {
    this.now = now; if (this.dead || this.done.has(key)) return;
    if (this.ws.length && now - this.t0 > BASE_TIMEOUT_MS && !this.ws.some((s) => s.up)) { this.fail(); return; } // none ever came up
    for (const [k, p] of this.out) { // the oldest first
      if (now - p.t <= BASE_TIMEOUT_MS) break;
      if (!this.stats.got) { this.fail(); return; } // never answered
      this.out.delete(k); this.byId.delete(p.id); p.s.load--; // answered before: a hidden tab paused it, and this job is of ground the camera has left
    }
    if (this.out.has(key) || this.out.size + this.done.size >= cap || !this.start()) return;
    let s = null; for (const x of this.ws) if (x.up && x.load < BASE_PER && (!s || x.load < s.load)) s = x; // (a worker still loading is given nothing)
    if (!s) return;
    try {
      if (!s.sent.includes(world)) { s.w.postMessage({ t: 'world', key: world, unlocked }); s.sent.push(world); if (s.sent.length > 2) s.sent.shift(); }
      const id = ++this.n; this.out.set(key, { id, t: now, sk: job.sk, s }); this.byId.set(id, key); s.load++; this.stats.posted++;
      s.w.postMessage({ t: 'chunk', id, world, a: job.a, i: job.i, j: job.j, dpr: job.dpr, coarse: job.coarse, pin: job.pin, zoom: job.zoom });
    } catch { this.fail(); }
  }
  prune(now, keep = null) { this.now = now; for (const [k, d] of this.done) if (now - d.t > BASE_KEEP_MS || (keep && !keep(d.sk))) { this.done.delete(k); try { d.bmp.close(); } catch { /* none */ } } }
}

let SPARE = null;
/** Boot the pool now. js/main.js does it as the game screen is asked for: the workers take 0.4 s to load the ground's code and the world is made while they do, then it takes the pool when its ground needs the first chunk. A title screen holds none (35 MB of memory each); a pool nobody takes in BASE_SPARE_MS (a game that opened without its world) is given back. */
export function bootBaseClient() {
  if (SPARE) return;
  const c = SPARE = makeBaseClient(); if (!c) return;
  c.now = typeof performance !== 'undefined' ? performance.now() : 0; c.start();
  const t = typeof setTimeout === 'function' ? setTimeout(() => { if (SPARE === c) { SPARE = null; c.fail(); } }, BASE_SPARE_MS) : null; t?.unref?.();
}
/** A client that spawns the real workers (up to three, and two cores fewer than the machine has), or the one that was warmed, or null where there are none to spawn (no Worker, or a single core). */
export function makeBaseClient() {
  if (SPARE) { const c = SPARE; SPARE = null; return c; }
  if (typeof Worker !== 'function' || typeof URL !== 'function') return null;
  const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 0; if (hc < 2) return null;
  return new BaseClient(() => new Worker(new URL('./basework.js', import.meta.url), { type: 'module' }), Math.max(1, Math.min(BASE_POOL, (hc || 4) - 2))); // (two cores are left to the frames, the compositor and the GPU)
}
