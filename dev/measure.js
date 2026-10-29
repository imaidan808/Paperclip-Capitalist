// Offline measurement of the sound layer (dev only; not part of the staged site). Loaded by scripts/audio-check.mjs in headless Chrome and by dev/sounds.js.
// Every recipe is rendered through an OfflineAudioContext (mono, 48 kHz, no master chain, jitter off) and analyzed: duration, peak, RMS, K-weighted active level, DC, clipped samples,
// spectral centroid at the start and at the end, the share of the energy above 250 Hz, the tail at the declared end, the largest step, NaNs.
import { voice, master, MAKEUP_FALLBACK, GLUE, dB, fadeIn, noiseBuffers } from '../js/audio/palette.js';
import { RECIPES, IDS, variantsOf, tierOf, layersFor, firstVariant } from '../js/audio/recipes.js';
import { ONE_SHOTS, BED_CASES, buildBed, oneShotLayers } from '../js/audio/ambient.js';
import { createAudio } from '../js/audio/engine.js';

export const SR = 48000;
const biq = (x, b, a) => { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
const kw = (x) => biq(biq(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]), [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]); // BS.1770 K-weighting
const db = (x) => 20 * Math.log10(Math.max(1e-9, x));
/** A 2nd-order Butterworth high-pass: the "laptop model" (docs/AUDIO.md 3.2): a small speaker has nothing under about 220 Hz, so a sound that lives in the lows is quieter there than its level says. */
export const LAPTOP_HZ = 220;
function hp2(x, fc) {
  const w = 2 * Math.PI * fc / SR, c = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2), a0 = 1 + al;
  return biq(x, [(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0], [1, -2 * c / a0, (1 - al) / a0]);
}
/** The K-weighted Fast level (125 ms exponential time weighting): the loudest it gets, in dB. A tick of 30 ms never reaches the level of a chord of half a second at the same active level. */
function fastLevel(k) {
  const a = Math.exp(-1 / (0.125 * SR)); let m = 0, mx = 0;
  for (let i = 0; i < k.length; i++) { m = a * m + (1 - a) * k[i] * k[i]; if (m > mx) mx = m; }
  return 10 * Math.log10(Math.max(1e-12, mx));
}
/** The K-weighted active level (BS.1770 blocks of 20 ms, gated 24 dB under the top one) of an already K-weighted signal. */
function activeOf(k, F = 960, H = 480) {
  const ms = []; for (let s = 0; s + F <= k.length; s += H) { let a = 0; for (let i = s; i < s + F; i++) a += k[i] * k[i]; ms.push(a / F); }
  const top = Math.max(...ms), gate = top * 10 ** (-2.4); let sum = 0, cnt = 0;
  for (const m of ms) if (m >= gate) { sum += m; cnt++; }
  return cnt ? 10 * Math.log10(sum / cnt) : -99;
}
function fft(re, im) { // in place, radix 2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = i + k + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } }
}
/** Spectral centroid (Hz) of a window of `len` samples starting at `s0`, Hann-windowed. */
function centroidAt(x, s0, len) {
  const N = 8192, re = new Float64Array(N), im = new Float64Array(N), n = Math.min(len, N);
  for (let i = 0; i < n && s0 + i < x.length; i++) re[i] = x[s0 + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / Math.max(1, n - 1)));
  fft(re, im);
  let num = 0, den = 0;
  for (let i = 1; i < N / 2; i++) { const m = Math.hypot(re[i], im[i]); num += m * (i * SR / N); den += m; }
  return den > 1e-9 ? Math.round(num / den) : 0;
}
/** The share of the whole sound's spectral energy above 250 Hz (2.2: the refusal and loss family has a body the ear can find). */
function shareAbove(x, hzCut) {
  let N = 1; while (N < x.length) N <<= 1;
  N = Math.min(N, 262144);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N && i < x.length; i++) re[i] = x[i];
  fft(re, im);
  let lo = 0, hi = 0; const k = Math.floor(hzCut * N / SR);
  for (let i = 1; i < N / 2; i++) { const e = re[i] * re[i] + im[i] * im[i]; if (i < k) lo += e; else hi += e; }
  return hi / (lo + hi || 1);
}
/** The spectral centroid of the first 16384 samples from the first audible one: the number the test plan's 6 kHz limit is about. */
function wholeCentroid(x, first) {
  const N = 16384, re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N && first + i < x.length; i++) re[i] = x[first + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
  fft(re, im);
  let num = 0, den = 0;
  for (let i = 1; i < N / 2; i++) { const m = Math.hypot(re[i], im[i]); num += m * (i * SR / N); den += m; }
  return Math.round(num / (den || 1));
}
export function analyze(x, declared) {
  const n = x.length, F = 960, H = 480, k = kw(x), ms = [], un = [];
  for (let s = 0; s + F <= n; s += H) { let a = 0, b = 0; for (let i = s; i < s + F; i++) { a += k[i] * k[i]; b += x[i] * x[i]; } ms.push(a / F); un.push(b / F); }
  const top = Math.max(...ms), gate = top * 10 ** (-2.4); let sum = 0, cnt = 0;
  for (const m of ms) if (m >= gate) { sum += m; cnt++; }
  let peak = 0, nonFinite = 0, dc = 0, step = 0, clipped = 0, sq = 0;
  for (let i = 0; i < n; i++) { const v = x[i]; if (!Number.isFinite(v)) nonFinite++; peak = Math.max(peak, Math.abs(v)); if (Math.abs(v) >= 0.999) clipped++; dc += v; sq += v * v; if (i) step = Math.max(step, Math.abs(v - x[i - 1])); }
  let first = 0; for (let i = 0; i < n; i++) if (Math.abs(x[i]) > 0.001) { first = i; break; }
  const topDb = db(Math.sqrt(Math.max(...un))); let lastFrame = 0; for (let i = 0; i < un.length; i++) if (db(Math.sqrt(un[i])) > topDb - 45) lastFrame = i; // the end is where the sound is 45 dB under its loudest frame, so a trim does not change a length
  const lastSample = Math.min(n, lastFrame * H + F), W = Math.round(0.1 * SR);
  const t0 = Math.round((0.01 + declared) * SR); let tail = 0; for (let i = Math.max(0, t0 - 240); i < Math.min(n, t0 + 240); i++) tail = Math.max(tail, Math.abs(x[i]));
  return {
    fast: fastLevel(k), lap: activeOf(kw(hp2(x, LAPTOP_HZ))), lapFast: fastLevel(kw(hp2(x, LAPTOP_HZ))),
    peak: db(peak), rms: db(Math.sqrt(sq / n)), level: cnt ? 10 * Math.log10(sum / cnt) : -99, ms: Math.max(0, Math.round((lastFrame * H + F) / SR * 1000 - 10)),
    dc: Math.abs(dc / n), step: Math.round(step * 1000) / 1000, clipped, nonFinite, tail: db(tail),
    centroid: wholeCentroid(x, first), c0: centroidAt(x, first, W), c1: centroidAt(x, Math.max(first, lastSample - W), W), share250: shareAbove(x, 250),
  };
}
const flat = (x) => x.flat(Infinity).filter(Boolean);
export async function renderLayers(layers, dur, o = {}) {
  const ctx = new OfflineAudioContext(1, Math.ceil(SR * (dur + 0.45)), SR);
  voice(ctx, ctx.destination, layers, 0.01, { seed: o.seed ?? 7, trim: o.trim ?? 0, noJitter: true, jitterCents: 0, jit: 0, dull: o.dull, secondary: o.secondary });
  return (await ctx.startRendering()).getChannelData(0);
}
/** Every variant (and every pool member, k > 0, as `id#variant@k`). */
export const entries = (pools = false) => IDS.flatMap((id) => variantsOf(id).flatMap((v) => {
  const e = RECIPES[id], out = [{ id, v, k: 0, key: id + '#' + v, tier: tierOf(id, v), dur: e.dur }];
  if (pools && e.pool) for (let k = 1; k < e.pool; k++) out.push({ id, v, k, key: id + '#' + v + '@' + k, tier: tierOf(id, v), dur: e.dur });
  return out;
}));
/** Render and analyze everything: { rows (sounds), shots (ambient one-shots) }. trims: { 'id#variant': dB, 'amb.x': dB }. */
export async function run(trims = {}, pools = false) {
  const rows = [], shots = [];
  for (const en of entries(pools)) {
    const trim = trims[en.key] ?? trims[en.key.replace(/@\d+$/, '')] ?? 0, x = await renderLayers(layersFor(en.id, en.v, {}, en.k), en.dur, { trim });
    rows.push({ ...en, trim, ...analyze(x, en.dur) });
  }
  for (const o of ONE_SHOTS) {
    const x = await renderLayers(oneShotLayers(o.id), o.dur, { trim: trims[o.id] || 0 });
    shots.push({ id: o.id, key: o.id, tier: 'amb', dur: o.dur, trim: trims[o.id] || 0, ...analyze(x, o.dur) });
  }
  return { rows, shots };
}
/** The beds: 8 s each, the first second skipped (filters settling). trims: { bedKey: dB } where bedKey is `theme` or `theme+mod+mod`. */
export async function runBeds(trims = {}) {
  const rows = [];
  for (const [id, mods] of BED_CASES) {
    const key = id + (mods.length ? '+' + mods.join('+') : '');
    const ctx = new OfflineAudioContext(1, SR * 8, SR);
    const bed = buildBed(ctx, ctx.destination, id, { T: 0, dur: 8, mods, trimDb: trims[id] || 0 });
    const x = (await ctx.startRendering()).getChannelData(0).slice(SR, SR * 8);
    rows.push({ key, id, mods, layers: bed.layers, trim: trims[id] || 0, ...analyze(x, 7) });
  }
  return rows;
}
/** The same voice at several pans, into a stereo context, no master chain: the total power of both channels relative to pan 0, in dB (an equal-power law keeps it at 0 at every pan, 3.6). */
export async function panPower(id, v, pans = [0, 0.02, 0.3, 0.6, 1, -0.6]) {
  const out = {}; let ref = null;
  for (const pan of pans) {
    const ctx = new OfflineAudioContext(2, SR * 3, SR);
    voice(ctx, ctx.destination, layersFor(id, v, {}), 0.01, { seed: 5, noJitter: true, jit: 0, pan });
    const b = await ctx.startRendering(); let p = 0;
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) p += d[i] * d[i]; }
    if (ref == null) ref = p;
    out[pan] = 10 * Math.log10(Math.max(1e-20, p) / Math.max(1e-20, ref));
  }
  return out;
}
/**
 * A sale at `pan` through the real engine (its mix, so the coins and the streak ride with it) into a stereo context with the whole master chain: the right channel's power minus the left's, in dB.
 * An equal-power law puts tan((pan + 1) pi / 4) between the two channels of one voice, and the members of a mix share the cause's place (docs/AUDIO.md 3.6), so the whole burst follows the law.
 */
export async function saleBalance(pan, coin = 'xl', rung = 6) {
  const oc = new OfflineAudioContext(2, SR * 3, SR), settings = { master: 50, mute: false, ui: true, game: true, ambient: false, dial: false, clockSounds: true, quiet: false, worldTicks: true };
  const audio = createAudio({ get: () => settings, factory: () => oc, now: () => 1000, timers: { set: () => 0, clear() {} }, random: () => 0.5, measure: false });
  audio.unlock();
  const played = audio.playMix([['sale.win', { variant: 'w', pan, player: true }], ['cash.in', { size: coin, gainDb: -4 }], ['streak', { params: { n: rung }, gainDb: coin === 'xl' ? 5 : 0 }]], {});
  if (!played) return null;
  const b = await oc.startRendering(), pw = [0, 1].map((c) => { const d = b.getChannelData(c); let p = 0; for (let i = 0; i < d.length; i++) p += d[i] * d[i]; return p; });
  return 10 * Math.log10(Math.max(1e-20, pw[1]) / Math.max(1e-20, pw[0]));
}
/** The compressor node's own gain at the glue settings, for a quiet (-30 dBFS) sine: the master chain's makeup undoes exactly this. */
export async function makeupGain() {
  const ctx = new OfflineAudioContext(1, SR, SR), o = ctx.createOscillator(), g = ctx.createGain(), c = ctx.createDynamicsCompressor();
  o.frequency.value = 440; g.gain.value = 0.0316; for (const [k, v] of Object.entries(GLUE)) c[k].value = v;
  o.connect(g); g.connect(c); c.connect(ctx.destination); o.start();
  const x = (await ctx.startRendering()).getChannelData(0); let pk = 0; for (let i = SR / 2; i < SR; i++) pk = Math.max(pk, Math.abs(x[i]));
  return pk / 0.0316 || MAKEUP_FALLBACK;
}
/** One variant through the whole master chain (stereo, voice at 0.6 s: a fresh compressor needs 100 ms to settle, docs/AUDIO.md 3.7). Returns the analysis of the left channel from 0.5 s. */
export async function throughChain(id, v, trim, makeup, masterGain = 1, k = 0) {
  const e = RECIPES[id], ctx = new OfflineAudioContext(2, SR * 4, SR), m = master(ctx, { master: masterGain, makeup: 1 / makeup });
  voice(ctx, m.buses[e.bus], layersFor(id, v, {}, k), 0.6, { seed: 3, trim, noJitter: true, jit: 0 });
  const x = (await ctx.startRendering()).getChannelData(0).slice(Math.round(0.5 * SR));
  return analyze(x, e.dur + 0.1);
}
/** The twelve loudest sounds at once through the chain: the worst pile-up. Returns the peak in dBFS. */
export async function worstCase(keys, trims, makeup, masterGain = 1) {
  const ctx = new OfflineAudioContext(2, SR * 5, SR), m = master(ctx, { master: masterGain, makeup: 1 / makeup });
  keys.forEach((key, i) => { const [id, v] = key.split('#'); voice(ctx, m.buses[RECIPES[id].bus], layersFor(id, v, {}), 0.6 + i * 0.02, { seed: i + 1, trim: trims[key] || 0, noJitter: true, jit: 0 }); });
  const buf = await ctx.startRendering(); let pk = 0;
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); }
  return db(pk);
}

/**
 * The start times the engine really produces (docs/AUDIO.md 3.7, Appendix F): the context's currentTime is a whole number of 128-frame render quanta (q * 128 / sr), the voice starts LEAD (12 ms)
 * after it, and a second voice on the same fundamental is shifted 30 to 45 ms. At 48 kHz these land on a sample boundary (0.012 * 48000 is 576), at 44.1 kHz almost never, and the hazard of a
 * parameter event that applies a hair after its frame (I1) lives exactly at the boundary. Half of the starts carry a shift of 0 to 15 ms in whole milliseconds on top.
 */
export function engineStarts(sr, n = 32) {
  const out = [];
  for (let i = 0; i < n; i++) { const q = 3 + 37 * i + (i % 5), shift = i % 2 ? 0.03 + ((i >> 1) % 16) * 0.001 : 0; out.push((q * 128) / sr + 0.012 + shift); }
  return out;
}
/** Every layer of a recipe at a gain of 1e-9: whatever is heard is not the sound but a leak (a sample of the shared noise or an oscillator let through before the layer's envelope was in place). */
const muted = (layers) => layers.map((L) => ({ ...L, g: 1e-9 }));
/**
 * The leak sweep (I1): every variant, every pool member and every ambient one-shot, MUTED, started at the engine's real start times at 44.1 and 48 kHz. The peak of what comes out is a leak;
 * with the envelopes in place it is below -140 dBFS. Returns [{ key, sr, peak (dBFS), at (s) }].
 */
export async function leakSweep(srs = [44100, 48000], per = 16, pools = false) {
  const out = [], items = [...entries(pools).map((en) => ({ key: en.key, layers: () => layersFor(en.id, en.v, {}, en.k) })), ...ONE_SHOTS.map((o) => ({ key: o.id, layers: () => oneShotLayers(o.id) }))];
  const peak = (x) => { let pk = 0, at = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > pk) { pk = a; at = i; } } return [db(pk), at]; };
  for (const sr of srs) {
    const starts = engineStarts(sr, per);
    for (const it of items) {
      const layers = muted(flat(it.layers())), tmax = Math.max(0, ...layers.map((L) => L.t || 0));
      const ctx = new OfflineAudioContext(1, Math.ceil(sr * (starts[starts.length - 1] + tmax + 0.08)), sr);
      starts.forEach((t, i) => voice(ctx, ctx.destination, layers, t, { seed: i + 1, noJitter: true, jit: 0 }));
      const [pk, at] = peak((await ctx.startRendering()).getChannelData(0));
      out.push({ key: it.key, sr, peak: pk, at: at / sr });
    }
    { // the fade-in of the beds, their modifiers and the dial tone: a looped noise source behind `fadeIn` to a muted target
      const ctx = new OfflineAudioContext(1, Math.ceil(sr * (starts[starts.length - 1] + 0.1)), sr), nb = noiseBuffers(ctx);
      starts.forEach((t, i) => { const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = nb.white; src.loop = true; src.connect(g); g.connect(ctx.destination); fadeIn(g.gain, t, 2, 1e-9); src.start(t, 0.3 + i * 0.01); });
      const [pk, at] = peak((await ctx.startRendering()).getChannelData(0));
      out.push({ key: 'fadeIn', sr, peak: pk, at: at / sr });
    }
  }
  return out;
}
export { IDS, firstVariant, dB };
