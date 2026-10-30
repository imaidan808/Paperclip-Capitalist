// Particles for the world, drawn in screen space over the finished scene. Presentation only: nothing here changes an object's place or the game.
//   - one fixed pool (typed arrays, allocated once, slots reused oldest first) for coins, sparks, dust puffs and ground rings
//   - a few text pops (the "+$40" of a finished cycle) in a fixed ring of reusable records
//   - a dust and firefly field in three depth layers that parallaxes with the camera, so the picture has air in front of and behind the ground
//   - rain in three depth layers (far, middle, near), in screen space, never touched by Math.random
// Where something is logic-adjacent (a coin burst after a cycle) its jitter is seeded from the game's own numbers, so a replay looks the same.
import { h2, clamp } from './iso.js';
import { stampGlow } from './gfx.js';

export const COIN = 1, SPARK = 2, PUFF = 3, RING = 4;
const N = 224, TEXTS = 8;
const mod = (a, n) => ((a % n) + n) % n;

export class Fx {
  constructor() {
    this.kind = new Uint8Array(N); this.x = new Float32Array(N); this.y = new Float32Array(N); this.vx = new Float32Array(N); this.vy = new Float32Array(N);
    this.age = new Float32Array(N); this.life = new Float32Array(N); this.size = new Float32Array(N); this.seed = new Float32Array(N);
    this.head = 0; this.live = 0; this.seq = 1;
    this.texts = Array.from({ length: TEXTS }, () => ({ on: false, text: '', color: '#ffd36e', x: 0, y: 0, age: 0, life: 1.8 })); this.th = 0; this.liveTexts = 0;
    this.drops = 108; this.rx = new Float32Array(this.drops); this.ry = new Float32Array(this.drops); this.rs = 0x9e3779b1;
    for (let i = 0; i < this.drops; i++) { this.rx[i] = h2(i, 1) * 1.2 - 0.1; this.ry[i] = h2(i, 2); }
    this.motes = 36;
  }

  /** Anything still moving? (the frame loop keeps drawing while this is true, even under a still camera) */
  get active() { return this.live > 0 || this.liveTexts > 0; }

  // ---------------------------------------------------------------------------------------------- spawning
  /** A free slot, or the oldest one when the pool is full (a burst can never allocate and never fail). */
  slot() { for (let n = 0; n < N; n++) { const i = (this.head + n) % N; if (!this.kind[i]) { this.head = (i + 1) % N; this.live++; return i; } } const i = this.head; this.head = (i + 1) % N; return i; }
  put(kind, x, y, vx, vy, life, size, seed) { const i = this.slot(); this.kind[i] = kind; this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy; this.age[i] = 0; this.life[i] = life; this.size[i] = size; this.seed[i] = seed; }

  /** Coins thrown up from a point: the same arc the world always drew (world px a second, 160 of gravity), seeded so a replay matches. */
  coins(x, y, n, seed) { for (let k = 0; k < n; k++) this.put(COIN, x, y, (h2(k, seed) - 0.5) * 40, -(50 + h2(k + 9, seed) * 50), 1.1 + h2(k + 3, seed) * 0.4, 5, h2(k + 5, seed) * 6.28); }
  /** Glints that float up from a point and cool away: a sale, a district opening. */
  sparks(x, y, n, seed, spread = 14, up = 46) { for (let k = 0; k < n; k++) this.put(SPARK, x + (h2(k, seed + 1) - 0.5) * spread * 2, y + (h2(k, seed + 2) - 0.5) * spread * 0.8, (h2(k, seed + 3) - 0.5) * 22, -(up * (0.5 + h2(k, seed + 4))), 0.7 + h2(k, seed + 5) * 0.7, 3 + h2(k, seed + 6) * 4, h2(k, seed + 7) * 6.28); }
  /** A soft puff of dust: a footstep, a crate landing. */
  puff(x, y, size = 6, seed = this.seq++) { this.put(PUFF, x + (h2(seed, 3) - 0.5) * 5, y, (h2(seed, 4) - 0.5) * 8, -6 - h2(seed, 5) * 5, 0.5 + h2(seed, 6) * 0.25, size, h2(seed, 7)); }
  /** A ring that opens out along the ground (flattened to the 2:1 ground plane when drawn). r0 and r1 are world px. */
  ring(x, y, r0, r1, life = 0.9) { this.put(RING, x, y, r0, r1, life, 0, 0); }
  /** A text pop that rises and fades (reuses a record from a fixed ring). */
  pop(text, x, y, color = '#ffd36e') { const t = this.texts[this.th]; this.th = (this.th + 1) % TEXTS; if (!t.on) this.liveTexts++; t.on = true; t.text = text; t.color = color; t.x = x; t.y = y; t.age = 0; t.life = 1.8; }
  clear() { this.kind.fill(0); this.live = 0; for (const t of this.texts) t.on = false; this.liveTexts = 0; }

  // ---------------------------------------------------------------------------------------------- motion
  update(dt, calm) {
    if (this.live) {
      for (let i = 0; i < N; i++) {
        const k = this.kind[i]; if (!k) continue;
        const a = (this.age[i] += dt);
        if (a >= this.life[i]) { this.kind[i] = 0; this.live--; continue; }
        if (k === COIN) { this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; this.vy[i] += 160 * dt; }
        else if (k === SPARK) { this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; this.vy[i] *= 1 - 1.4 * dt; this.vx[i] *= 1 - 1.4 * dt; }
        else if (k === PUFF) { this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; }
      }
    }
    if (this.liveTexts) for (const t of this.texts) if (t.on && (t.age += dt) >= t.life) { t.on = false; this.liveTexts--; }
    void calm;
  }

  /** Advance the rain by dt seconds (a drop that leaves the bottom comes back at the top at a place drawn from a fixed sequence). */
  rainStep(dt) {
    for (let i = 0; i < this.drops; i++) {
      const sp = SPEED[i % 3];
      this.ry[i] += dt * sp; this.rx[i] -= dt * 0.22 * sp;
      if (this.ry[i] > 1.05) { this.rs = (Math.imul(this.rs, 1664525) + 1013904223) >>> 0; this.ry[i] = -0.05 - (this.rs & 255) / 2550; this.rx[i] = this.rs / 4294967296 * 1.3 - 0.05; }
      if (this.rx[i] < -0.1) this.rx[i] += 1.25;
    }
  }

  // ---------------------------------------------------------------------------------------------- drawing
  /** The pool and the text pops, over the grade and under the labels. `w` is the world (camera, size, light, reduced()). */
  draw(ctx, w) {
    if (!this.active) return;
    const { W, H, cam } = w, z = cam.z, ox = W / 2 - cam.x * z, oy = H / 2 - cam.y * z, night = w.night, calm = w.reduced();
    if (this.live) {
      // dust, then rings, then coins: ordinary compositing
      for (let i = 0; i < N; i++) {
        const k = this.kind[i]; if (k !== PUFF && k !== RING && k !== COIN) continue;
        const t = this.age[i] / this.life[i], x = this.x[i] * z + ox, y = this.y[i] * z + oy;
        if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
        if (k === PUFF) {
          const r = (this.size[i] * (0.8 + t * 1.5)) * z, a = (1 - t) * (1 - t) * 0.32;
          if (night < 0.98) stampGlow(ctx, '224,210,184', x, y, r, a * (1 - night));
          if (night > 0.02) stampGlow(ctx, '126,136,160', x, y, r, a * night);
        } else if (k === RING) {
          const r = (this.vx[i] + (this.vy[i] - this.vx[i]) * (1 - (1 - t) * (1 - t))) * z;
          ctx.strokeStyle = `rgba(255,211,110,${(1 - t) * 0.75})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, 0, 0, 6.2832); ctx.stroke();
        } else {
          const a = clamp((1 - t) * 3, 0, 1), spin = Math.abs(Math.cos(this.age[i] * 9 + this.seed[i])), wd = Math.max(1.5, 5 * spin) * z, ht = 5 * z; // the coin turns as it flies
          ctx.globalAlpha = a; ctx.fillStyle = '#ffd36e'; ctx.fillRect(x - wd / 2, y - ht / 2, wd, ht); ctx.fillStyle = '#b8860b'; ctx.fillRect(x - wd / 2 + 1, y - ht / 2 + 1, Math.max(0, wd - 2), Math.max(0, ht - 2)); ctx.fillStyle = '#fff1b8'; ctx.fillRect(x - wd / 2, y - ht / 2, Math.max(1, wd * 0.4), 1);
        }
      }
      ctx.globalAlpha = 1;
      // sparks: additive
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < N; i++) {
        if (this.kind[i] !== SPARK) continue;
        const t = this.age[i] / this.life[i], x = this.x[i] * z + ox, y = this.y[i] * z + oy;
        if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
        const tw = 0.6 + 0.4 * Math.sin(this.age[i] * 18 + this.seed[i]), r = this.size[i] * (1 - t * 0.6) * z * 2.4;
        if (!stampGlow(ctx, '255,214,120', x, y, r, (1 - t) * tw)) { ctx.fillStyle = `rgba(255,214,120,${(1 - t) * tw})`; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
      }
      ctx.globalAlpha = 1; ctx.restore();
    }
    if (this.liveTexts) {
      const s = clamp(z, 0.75, 1.25);
      ctx.font = `800 ${Math.round(15 * s)}px ui-monospace, Menlo, Consolas, monospace`; ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(8,10,20,.85)';
      for (const p of this.texts) {
        if (!p.on) continue;
        const x = Math.round(p.x * z + ox), y = Math.round((p.y - (calm ? 0 : p.age * 26)) * z + oy);
        ctx.globalAlpha = clamp(1 - p.age / p.life, 0, 1); ctx.strokeText(p.text, x, y); ctx.fillStyle = p.color; ctx.fillText(p.text, x, y);
      }
      ctx.globalAlpha = 1; ctx.lineJoin = 'miter';
    }
  }

  /**
   * Dust by day, fireflies by night: three depth layers drifting in screen space. Each layer follows the camera by its own share (far 0.3, middle 0.8,
   * near 1.4 of the ground's own travel), so panning slides the layers past one another. The near layer is large and faint (out of focus), the far layer
   * small and sharp. Deterministic: positions come from a fixed hash of the mote's index and the world clock.
   */
  field(ctx, w) {
    if (w.lite || w.reduced() || w.env.crunch) return;
    const { W, H, cam, vt } = w, night = w.night, z = cam.z;
    ctx.save();
    for (let i = 0; i < this.motes; i++) {
      const d = i % 3, par = PAR[d], u = h2(i, 41), v = h2(i, 42), ph = h2(i, 43);
      const wrapW = W + 80, wrapH = H + 80;
      const x = mod(u * wrapW + Math.sin(vt / 3100 + ph * 6.28) * 14 * (d + 1) - cam.x * z * par, wrapW) - 40;
      const y = mod(v * wrapH - vt * RISE[d] * 0.001 - cam.y * z * par * 0.8, wrapH) - 40;
      const r = RAD[d] * (0.7 + ph * 0.6) * (0.8 + 0.2 * z);
      if (night < 0.98) { ctx.globalCompositeOperation = 'source-over'; stampGlow(ctx, '255,246,222', x, y, r, ALPHA[d] * (1 - night) * (0.6 + 0.4 * Math.sin(vt / 1900 + i))); }
      if (night > 0.05 && d < 2) { ctx.globalCompositeOperation = 'lighter'; const b = Math.max(0, Math.sin(vt / 760 + ph * 6.28)); stampGlow(ctx, '200,255,150', x, y, 2.2 + d * 1.6, 0.8 * night * b * b); } // fireflies: tiny, bright, blinking
    }
    ctx.globalAlpha = 1; ctx.restore();
  }

  /** Rain in three depth layers over the finished picture: far drops short and faint and slow, near drops long and bright and quick. */
  rain(ctx, w) {
    const { W, H } = w; ctx.save(); ctx.lineCap = 'round';
    for (let layer = 0; layer < 3; layer++) {
      ctx.strokeStyle = RAINCOL[layer]; ctx.lineWidth = layer === 2 ? 1.5 : 1; ctx.beginPath();
      const len = LEN[layer];
      for (let i = layer; i < this.drops; i += 3) { const x = this.rx[i] * W, y = this.ry[i] * H; ctx.moveTo(x, y); ctx.lineTo(x - len * 0.36, y + len); }
      ctx.stroke();
    }
    ctx.restore();
  }
}
const PAR = [0.3, 0.8, 1.4], RISE = [6, 10, 16], RAD = [4, 7, 15], ALPHA = [0.34, 0.3, 0.14];
const SPEED = [1.0, 1.6, 2.4], LEN = [6, 11, 19], RAINCOL = ['rgba(190,210,235,.16)', 'rgba(190,210,235,.3)', 'rgba(200,220,242,.46)'];
