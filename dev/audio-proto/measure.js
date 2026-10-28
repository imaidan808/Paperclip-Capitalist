// Offline measurement of every recipe: render through OfflineAudioContext (mono, 48 kHz, no master chain), then level, peak, duration, centroid, tail, head.
import { voice, master, noiseBuffers, hz, inKey, dB, GLUE } from './synth.js';
import { SOUNDS, TIER_TARGET } from './sounds.js';
import { ONE_SHOTS, BEDS, BED_IDS, MODS, bed } from './ambient.js';

const SR = 48000;
const biq = (x, b, a) => { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
const kw = (x) => biq(biq(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]), [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]);
const db = (x) => 20 * Math.log10(Math.max(1e-9, x));
function fft(re, im) { // in-place radix-2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = i + k + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } }
}
export function analyze(x, declared) {
  const n = x.length, F = 960, H = 480, k = kw(x), ms = [], un = [];
  for (let s = 0; s + F <= n; s += H) { let a = 0, b = 0; for (let i = s; i < s + F; i++) { a += k[i] * k[i]; b += x[i] * x[i]; } ms.push(a / F); un.push(b / F); }
  const top = Math.max(...ms), gate = top * 10 ** (-2.4); let sum = 0, cnt = 0;
  for (const m of ms) if (m >= gate) { sum += m; cnt++; }
  let peak = 0, nonFinite = 0, dc = 0, step = 0; for (let i = 0; i < n; i++) { const v = x[i]; if (!Number.isFinite(v)) nonFinite++; peak = Math.max(peak, Math.abs(v)); dc += v; if (i) step = Math.max(step, Math.abs(v - x[i - 1])); }
  let last = 0; for (let i = 0; i < un.length; i++) if (db(Math.sqrt(un[i])) > -55) last = i;
  const N = 16384, re = new Float64Array(N), im = new Float64Array(N);
  let first = 0; for (let i = 0; i < n; i++) if (Math.abs(x[i]) > 0.001) { first = i; break; }
  for (let i = 0; i < N && first + i < n; i++) re[i] = x[first + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
  fft(re, im); let num = 0, den = 0; for (let i = 1; i < N / 2; i++) { const m = Math.hypot(re[i], im[i]); num += m * (i * SR / N); den += m; }
  const t0 = Math.round((0.01 + declared) * SR); let tail = 0; for (let i = Math.max(0, t0 - 240); i < Math.min(n, t0 + 240); i++) tail = Math.max(tail, Math.abs(x[i]));
  let head = 0; for (let i = 0; i < Math.round(0.01 * SR) + 48 && i < n; i++) head = Math.max(head, Math.abs(x[i]));
  return { peak: db(peak), level: cnt ? 10 * Math.log10(sum / cnt) : -99, ms: Math.round((last * H + F) / SR * 1000 - 10), centroid: Math.round(num / (den || 1)), tail: db(tail), head: db(head), dc: Math.abs(dc / n), step: Math.round(step * 1000) / 1000, nonFinite };
}
const flat = (x) => x.flat(Infinity).filter(Boolean);
export async function renderLayers(layers, dur, o = {}) {
  const ctx = new OfflineAudioContext(1, Math.ceil(SR * (dur + 0.45)), SR);
  voice(ctx, ctx.destination, layers, 0.01, { seed: o.seed ?? 7, trim: o.trim ?? 0, jitterCents: o.jit ?? 0, noJitter: !o.jitterOn });
  return (await ctx.startRendering()).getChannelData(0);
}
export const entries = () => SOUNDS.flatMap((e) => Object.keys(e.variants).map((v) => ({ e, v, key: e.id + '#' + v, tier: e.variants[v].tier || e.tier })));
export async function run(trims = {}) {
  const rows = [];
  for (const { e, v, key, tier } of entries()) {
    const layers = flat(e.build(e.variants[v]));
    const x = await renderLayers(layers, e.dur, { trim: trims[key] || 0 });
    rows.push({ key, id: e.id, v, tier, bus: e.bus, declared: e.dur, trim: trims[key] || 0, ...analyze(x, e.dur) });
  }
  for (const o of ONE_SHOTS) {
    const x = await renderLayers(flat(o.build()), o.dur, { trim: trims[o.id] || 0 });
    rows.push({ key: o.id, id: o.id, v: '', tier: 'amb', bus: 'amb', declared: o.dur, trim: trims[o.id] || 0, ...analyze(x, o.dur) });
  }
  return rows;
}
export async function runBeds(trims = {}, base = null) {
  const rows = [];
  const cases = BED_IDS.map((id) => [id, []]).concat([['harbor', ['night']], ['metro', ['rain']], ['scrap', ['tariff']], ['exchange', ['wealth3']], ['farm', ['night', 'rain']]]);
  for (const [id, mods] of cases) {
    const ctx = new OfflineAudioContext(1, SR * 8, SR), g = ctx.createGain(); g.gain.value = dB(base ? (base[id] || 0) : (trims[id + '+' + mods.join('+')] || 0)); g.connect(ctx.destination);
    const layers = bed(ctx, g, id, 0, 8, mods);
    const x = (await ctx.startRendering()).getChannelData(0), y = x.slice(SR, SR * 8); // skip the first second (filters settling)
    rows.push({ key: id + (mods.length ? '+' + mods.join('+') : ''), id, mods, layers, trim: trims[id + '+' + mods.join('+')] || 0, ...analyze(y, 7) });
  }
  return rows;
}
/** Worst case: the loudest sounds of every bus at once through the master chain. */
export async function makeupGain() { // the compressor node's own gain for a quiet (-30 dBFS) sine: the chain's makeup undoes exactly this
  const ctx = new OfflineAudioContext(1, SR, SR), o = ctx.createOscillator(), g = ctx.createGain(), c = ctx.createDynamicsCompressor();
  o.frequency.value = 440; g.gain.value = 0.0316; for (const [k, v] of Object.entries(GLUE)) c.threshold && (c[k].value = v);
  o.connect(g); g.connect(c); c.connect(ctx.destination); o.start();
  const x = (await ctx.startRendering()).getChannelData(0); let pk = 0; for (let i = SR / 2; i < SR; i++) pk = Math.max(pk, Math.abs(x[i]));
  return pk / 0.0316;
}
export async function worst(names, o = {}) {
  const ctx = new OfflineAudioContext(2, SR * 4, SR), m = master(ctx, { master: o.master ?? 1, makeup: o.makeup ?? 1 });
  if (o.noclip) { m.clip.curve = new Float32Array([-1, 1]); } // the same chain with a straight line instead of the soft clip: what the clip had to hold
  const by = Object.fromEntries(entries().map((x) => [x.key, x]));
  names.forEach((nm, i) => { const x = by[nm]; voice(ctx, m.buses[x.e.bus], flat(x.e.build(x.e.variants[x.v])), 0.02 + (o.stagger ?? 0) * i, { seed: i + 1, trim: o.trims[nm] || 0, noJitter: true, jitterCents: 0 }); });
  const buf = await ctx.startRendering(); let pk = 0;
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); }
  return db(pk);
}

/** Layer balance: each layer rendered alone against the whole mix (both at trim 0). A layer more than 18 dB under the mix is inaudible; more than 3 dB over it is the mix. */
export async function balance() {
  const out = [];
  for (const { e, v, key } of entries()) {
    const layers = flat(e.build(e.variants[v])), all = analyze(await renderLayers(layers, e.dur), e.dur);
    const parts = [];
    for (let i = 0; i < layers.length; i++) { const a = analyze(await renderLayers([layers[i]], e.dur), e.dur); parts.push(Math.round((a.level - all.level) * 10) / 10); }
    out.push({ key, n: layers.length, rel: parts, kinds: layers.map((l) => l.k + (l.f ? ':' + l.f : '')) });
  }
  return out;
}
/** A coarse fingerprint of each variant: 5 slices of 120 ms from its first audible sample, 20 log-spaced bands from 150 Hz to 6 kHz, in dB, level removed. Two sounds that are really one sound sit close together. */
export async function fingerprints() {
  const out = [], N = 4096, edges = Array.from({ length: 21 }, (_, i) => 150 * 40 ** (i / 20));
  for (const { e, v, key } of entries()) {
    const x = await renderLayers(flat(e.build(e.variants[v])), e.dur);
    let first = 0; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 0.001) { first = i; break; }
    const f = [];
    for (let sl = 0; sl < 5; sl++) {
      const re = new Float64Array(N), im = new Float64Array(N), s0 = first + Math.round(sl * 0.12 * SR);
      for (let i = 0; i < N && s0 + i < x.length; i++) re[i] = x[s0 + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
      fft(re, im);
      for (let b = 0; b < 20; b++) { let en = 1e-12; for (let k = Math.floor(edges[b] * N / SR); k < Math.floor(edges[b + 1] * N / SR); k++) en += re[k] * re[k] + im[k] * im[k]; f.push(10 * Math.log10(en)); }
    }
    const mean = f.reduce((a, b) => a + b, 0) / f.length;
    out.push({ key, f: f.map((z) => Math.max(-40, z - mean)) });
  }
  return out;
}
export { hz, inKey };
