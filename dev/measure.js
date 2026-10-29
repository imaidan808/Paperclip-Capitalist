// Offline measurement of the sound layer (dev only; not part of the staged site). Loaded by scripts/audio-check.mjs in headless Chrome and by dev/sounds.js.
// Every recipe is rendered through an OfflineAudioContext (mono, 48 kHz, no master chain, jitter off) and analyzed: duration, peak, RMS, K-weighted active level, DC, clipped samples,
// spectral centroid at the start and at the end, the share of the energy above 250 Hz, the tail at the declared end, the largest step, NaNs.
import { voice, master, MAKEUP_FALLBACK, GLUE, dB, fadeIn, noiseBuffers, rng } from '../js/audio/palette.js';
import { RECIPES, IDS, variantsOf, tierOf, layersFor, firstVariant, jitterOf } from '../js/audio/recipes.js';
import { ONE_SHOTS, BED_CASES, buildBed, oneShotLayers, fadeBedIn, AMB } from '../js/audio/ambient.js';
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
/**
 * A-weighting (IEC 61672) as three biquads from the analog poles (20.6 Hz twice, 107.7 Hz, 737.9 Hz, 12.19 kHz twice and four zeros at 0), bilinear at 48 kHz, scaled to 0 dB at 1 kHz.
 * The ear at a quiet level (about 40 phon) hears the low mids 4 to 9 dB under 1 kHz: this is the "quiet laptop" model's second half (a 220 Hz high-pass is the first).
 */
function bilinear(b, a) { // analog (b0 s^2 + b1 s + b2) / (a0 s^2 + a1 s + a2) -> [[B0, B1, B2], [1, A1, A2]]
  const k = 2 * SR, N = [b[0] * k * k + b[1] * k + b[2], -2 * b[0] * k * k + 2 * b[2], b[0] * k * k - b[1] * k + b[2]], D = [a[0] * k * k + a[1] * k + a[2], -2 * a[0] * k * k + 2 * a[2], a[0] * k * k - a[1] * k + a[2]];
  return [N.map((v) => v / D[0]), D.map((v) => v / D[0])];
}
const W = (f) => 2 * Math.PI * f;
const A_SECTIONS = [bilinear([1, 0, 0], [1, 2 * W(20.598997), W(20.598997) ** 2]), bilinear([1, 0, 0], [1, W(107.65265) + W(737.86223), W(107.65265) * W(737.86223)]), bilinear([0, 0, W(12194.217) ** 2], [1, 2 * W(12194.217), W(12194.217) ** 2])];
/** The response of the A-weighting cascade at f (dB, before the 1 kHz normalisation is applied it is relative to itself). */
function respDb(sections, f) {
  const w = 2 * Math.PI * f / SR; let re = 1, im = 0;
  for (const [b, a] of sections) {
    const nr = b[0] + b[1] * Math.cos(w) + b[2] * Math.cos(2 * w), ni = -(b[1] * Math.sin(w) + b[2] * Math.sin(2 * w)), dr = a[0] + a[1] * Math.cos(w) + a[2] * Math.cos(2 * w), di = -(a[1] * Math.sin(w) + a[2] * Math.sin(2 * w));
    const q = dr * dr + di * di, hr = (nr * dr + ni * di) / q, hi = (ni * dr - nr * di) / q; [re, im] = [re * hr - im * hi, re * hi + im * hr];
  }
  return 20 * Math.log10(Math.hypot(re, im));
}
const A_NORM = 10 ** (-respDb(A_SECTIONS, 1000) / 20);
export const aWeightDb = (f) => respDb(A_SECTIONS, f) - respDb(A_SECTIONS, 1000);
const aw = (x) => { let y = x; for (const [b, a] of A_SECTIONS) y = biq(y, b, a); return y.map((v) => v * A_NORM); };
/** The K-weighted Fast level (125 ms exponential time weighting): the loudest it gets, in dB. A tick of 30 ms never reaches the level of a chord of half a second at the same active level. */
function fastLevel(k) {
  const a = Math.exp(-1 / (0.125 * SR)); let m = 0, mx = 0;
  for (let i = 0; i < k.length; i++) { m = a * m + (1 - a) * k[i] * k[i]; if (m > mx) mx = m; }
  return 10 * Math.log10(Math.max(1e-12, mx));
}
/**
 * Momentary loudness (BS.1770: a 400 ms window, here every 100 ms) of an already weighted signal: the loudest window's mean square, in dB. A sound shorter than the window is spread over it, so a tick
 * of 40 ms is 10 dB under what a Fast meter says and a half-second chord is not: the longer the integration, the more the length of a sound counts (fourth round, R2). `win` is in seconds.
 */
export function momentary(k, win = 0.4, hop = 0.1) {
  const W = Math.round(win * SR), H = Math.round(hop * SR), n = k.length, cs = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + k[i] * k[i];
  let mx = 0;
  for (let s = 0; s < n; s += H) { const e = Math.min(n, s + W), m = (cs[e] - cs[s]) / W; if (m > mx) mx = m; }
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
    fast: fastLevel(k), lap: activeOf(kw(hp2(x, LAPTOP_HZ))), lapFast: fastLevel(kw(hp2(x, LAPTOP_HZ))), lapA: activeOf(aw(hp2(x, LAPTOP_HZ))), lapFastA: fastLevel(aw(hp2(x, LAPTOP_HZ))), lapMomA: momentary(aw(hp2(x, LAPTOP_HZ))),
    peak: db(peak), rms: db(Math.sqrt(sq / n)), level: cnt ? 10 * Math.log10(sum / cnt) : -99, ms: Math.max(0, Math.round((lastFrame * H + F) / SR * 1000 - 10)),
    dc: Math.abs(dc / n), step: Math.round(step * 1000) / 1000, clipped, nonFinite, tail: db(tail),
    centroid: wholeCentroid(x, first), c0: centroidAt(x, first, W), c1: centroidAt(x, Math.max(first, lastSample - W), W), share250: shareAbove(x, 250),
  };
}
const flat = (x) => x.flat(Infinity).filter(Boolean);
export async function renderLayers(layers, dur, o = {}) {
  const ctx = new OfflineAudioContext(1, Math.ceil(SR * ((o.at ?? 0.01) + dur + (o.tail ?? 0.45))), SR);
  voice(ctx, ctx.destination, layers, o.at ?? 0.01, { seed: o.seed ?? 7, trim: o.trim ?? 0, noJitter: true, jitterCents: 0, jit: 0, dull: o.dull, secondary: o.secondary, ...(o.voice || {}) });
  return (await ctx.startRendering()).getChannelData(0);
}
/** The cheap metrics of one play: K-weighted active level, K Fast, peak (dBFS). The full `analyze` also does four FFTs, which 32 plays of every noisy variant cannot afford. */
export function quick(x) {
  const k = kw(x);
  const h = hp2(x, LAPTOP_HZ);
  return { level: activeOf(k), fast: fastLevel(k), lapFast: fastLevel(kw(h)), lapFastA: fastLevel(aw(h)), lapMomA: momentary(aw(h)), peak: db(x.reduce((m, v) => Math.max(m, Math.abs(v)), 0)) };
}
/** The peak alone (dBFS): the 32 plays of every variant that hold the ceiling to account need nothing else, and are far cheaper without the filters. */
export const peakOf = (x) => { let pk = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > pk) pk = a; } return db(pk); };
/** Every variant (and every pool member, k > 0, as `id#variant@k`). */
export const entries = (pools = false) => IDS.flatMap((id) => variantsOf(id).flatMap((v) => {
  const e = RECIPES[id], out = [{ id, v, k: 0, key: id + '#' + v, tier: tierOf(id, v), dur: e.dur }];
  if (pools && e.pool) for (let k = 1; k < e.pool; k++) out.push({ id, v, k, key: id + '#' + v + '@' + k, tier: tierOf(id, v), dur: e.dur });
  return out;
}));
/** The candidate noise offsets (seconds into the shared noise): a golden-ratio sequence, which fills the buffer evenly whatever n is. */
export const candidates = (n) => Array.from({ length: n }, (_, j) => (((j + 0.5) * 0.6180339887498949) % 1) * 2.5066666);
/** Does a variant carry any noise layer (so its level depends on where in the noise it starts)? */
export const noisy = (layers) => layers.some((L) => L.k === 'noise');
const med = (a) => { const v = [...a].sort((x, y) => x - y); return v[v.length >> 1]; };
const pct = (a, p) => { const v = [...a].sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.ceil(p * v.length) - 1)]; };
/**
 * One variant, analysed. The base render is the one every spectral figure comes from. A variant with noise in it is then played from n different places in the noise (everything else equal: no gain
 * jitter, no pitch jitter) and its level figures (K active level, K Fast, Fast after the laptop high-pass, A-weighted Fast after it) are the MEDIAN of those plays, its peak the highest and its
 * `spread` the Fast level's range (I3): calibrating on the one place the first seed happened to draw put the footsteps 2.5 dB under what they play at. A chosen list of places (`list`, from the
 * calibration) is played instead of the golden-ratio ones. `keep` returns every play.
 */
export async function measureEntry(layers, dur, { trim = 0, list = null, n = 0, keep = false } = {}) {
  const x = await renderLayers(layers, dur, { trim, voice: list && list.length ? { noiseAt: [list[0]] } : {} }), row = { trim, ...analyze(x, dur) };
  if (n && noisy(layers)) {
    const cs = list && list.length ? list : candidates(n), cands = [];
    for (let j = 0; j < cs.length; j++) cands.push({ c: cs[j], ...quick(await renderLayers(layers, dur, { trim, seed: j + 1, at: 0.012 + (3 + (j * 7) % 64) * 128 / SR, tail: 0.15, voice: { noiseAt: [cs[j]] } })) });
    const col = (f) => cands.map((c) => c[f]);
    Object.assign(row, { level: med(col('level')), fast: med(col('fast')), lapFast: med(col('lapFast')), lapFastA: med(col('lapFastA')), lapMomA: med(col('lapMomA')), peak: Math.max(...col('peak')), spread: Math.max(Math.max(...col('fast')) - Math.min(...col('fast')), Math.max(...col('lapFastA')) - Math.min(...col('lapFastA'))), ncand: cands.length });
    if (keep) row.cands = cands;
  }
  return row;
}
/** Render and analyze everything: { rows (sounds), shots (ambient one-shots) }. trims: { 'id#variant': dB, 'amb.x': dB }; o: { n (places in the noise), lists (chosen places by key), keep }. */
export async function run(trims = {}, pools = false, o = {}) {
  const rows = [], shots = [], lists = o.lists || {}, n = o.n ?? 0;
  for (const en of entries(pools)) {
    const base = en.key.replace(/@\d+$/, ''), trim = trims[en.key] ?? trims[base] ?? 0, list = lists[en.key] ?? lists[base] ?? null;
    rows.push({ ...en, ...(await measureEntry(layersFor(en.id, en.v, {}, en.k), en.dur, { trim, list, n, keep: o.keep })) });
  }
  for (const sh of ONE_SHOTS) shots.push({ id: sh.id, key: sh.id, tier: 'amb', dur: sh.dur, ...(await measureEntry(oneShotLayers(sh.id), sh.dur, { trim: trims[sh.id] || 0, list: lists[sh.id] ?? null, n, keep: o.keep })) });
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
export async function throughChain(id, v, trim, makeup, masterGain = 1, k = 0, gainDb = 0) {
  const e = RECIPES[id], ctx = new OfflineAudioContext(2, SR * 4, SR), m = master(ctx, { master: masterGain, makeup: 1 / makeup });
  voice(ctx, m.buses[e.bus], layersFor(id, v, {}, k), 0.6, { seed: 3, trim, gainDb, noJitter: true, jit: 0 });
  const x = (await ctx.startRendering()).getChannelData(0).slice(Math.round(0.5 * SR));
  return analyze(x, e.dur + 0.1);
}
/**
 * One variant through the whole master chain at a pan (fourth round, R8), both channels: the K-weighted Fast level of the two channels' power together (what a listener on speakers hears), the peak of the louder
 * channel. A voice at pan 0.6 puts 2.6 dB more on its near channel than a centred one puts on either, so a loud sound's near channel reaches the glue compressor and the soft clip harder and the chain takes
 * more off it. Returns { fast, peak }.
 */
export async function panChain(id, v, trim, makeup, masterGain = 1, pan = 0, gainDb = 0) {
  const e = RECIPES[id], ctx = new OfflineAudioContext(2, SR * 4, SR), m = master(ctx, { master: masterGain, makeup: 1 / makeup });
  voice(ctx, m.buses[e.bus], layersFor(id, v, {}), 0.6, { seed: 3, trim, gainDb, pan, noJitter: true, jit: 0 });
  const b = await ctx.startRendering(), from = Math.round(0.5 * SR), L = b.getChannelData(0).slice(from), R = b.getChannelData(1).slice(from);
  const kl = kw(L), kr = kw(R), both = new Float32Array(kl.length); for (let i = 0; i < both.length; i++) both[i] = Math.hypot(kl[i], kr[i]);
  let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  return { fast: fastLevel(both), peak: db(pk) };
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

/**
 * Play-to-play variation of one variant (I3): n plays the way the engine makes them, each with its own seed (its own noise offset, pitch jitter and, when `jitter` is on, its own gain jitter of
 * 0.7 dB either way) and a start time of its own, at the variant's calibrated trim. Returns the per-play { level, fast, lapFast, peak }.
 */
export async function plays(id, v, k = 0, trim = 0, n = 32, jitter = true, noiseAt = null) {
  const layers = layersFor(id, v, {}, k), dur = RECIPES[id].dur, out = [];
  for (let i = 0; i < n; i++) {
    const at = 0.012 + (3 + (i * 7) % 64) * 128 / SR, rnd = rng(i + 101);
    const x = await renderLayers(layers, dur, { at, seed: i + 1, trim, tail: 0.15, voice: { noJitter: !jitter, jit: (rnd() * 2 - 1) * 7 * jitterOf(id, v), jitterCents: 7, noiseAt } });
    out.push(quick(x));
  }
  return out;
}

/**
 * The engine's own plays of EVERY variant (fourth round, R1 and R7): `n` plays of each the way the engine makes them (its own seed for the place in the noise, the pitch jitter of 7 cents, the gain jitter of
 * 0.7 dB, a start time of its own), at the given trims and lists of places. Where the checks used to look at ten frequent sounds, this looks at all of them: a rare loud sound that varied by 3 dB from one
 * play to the next, and a fanfare whose real peaks were 1 to 2 dB over a ceiling that held for the one play the calibration made, were not in the ten.
 * Returns { key: { peak: [p95, max], fast: [min, median, max], lapFastA: [min, median, max], lapMomA: [min, median, max] } } (dBFS and dB). `levels: false` reads the peak alone, a third of the work.
 * keys: only these entries (default: all, pool members too with `pools`, and the ambient one-shots).
 */
export async function sweep(trims = {}, lists = {}, n = 32, o = {}) {
  const out = {}, only = o.keys ? new Set(o.keys) : null;
  const items = [...entries(!!o.pools).map((en) => ({ key: en.key, layers: layersFor(en.id, en.v, {}, en.k), dur: RECIPES[en.id].dur, jit: jitterOf(en.id, en.v) })), ...ONE_SHOTS.map((sh) => ({ key: sh.id, layers: oneShotLayers(sh.id), dur: sh.dur }))];
  for (const it of items) {
    if (only && !only.has(it.key)) continue;
    const base = it.key.replace(/@\d+$/, ''), trim = trims[it.key] ?? trims[base] ?? 0, noiseAt = lists[it.key] ?? lists[base] ?? null, peaks = [], fast = [], lapA = [], mom = [], jScale = it.jit ?? 1;
    for (let i = 0; i < n; i++) {
      const at = 0.012 + (3 + (i * 7) % 64) * 128 / SR, rnd = rng(i + 101 + (o.seed0 || 0));
      const x = await renderLayers(it.layers, it.dur, { at, seed: i + 1 + (o.seed0 || 0), trim, tail: 0.15, voice: { noJitter: false, jit: (rnd() * 2 - 1) * 7 * jScale, jitterCents: 7, noiseAt } });
      if (o.levels === false) { peaks.push(peakOf(x)); continue; }
      const q = quick(x); peaks.push(q.peak); fast.push(q.fast); lapA.push(q.lapFastA); mom.push(q.lapMomA);
    }
    const stat = (a) => (a.length ? [Math.min(...a), med(a), Math.max(...a)] : null);
    out[it.key] = { peak: [pct(peaks, 0.95), Math.max(...peaks)], fast: stat(fast), lapFastA: stat(lapA), lapMomA: stat(mom) };
  }
  return out;
}

/**
 * A change of district through the real ambient gains (fourth round, R4): bed `a` plays on its own, then at 4 s bed `b` takes over with the crossfade the controller uses, and the level in 100 ms steps is
 * read off a mono render at 48 kHz. Returns { before, after (dB, the means of the two beds alone: the last and the first second away from the fade), dip (dB the quietest 100 ms of the fade sits under the lower of the
 * two), at (s into the fade) }. Two beds are uncorrelated noise, so their powers add: a fade that is not equal-power dips in the middle.
 */
export async function crossfadeDip(a, b, fade = AMB.CROSS) {
  const T = 4, ctx = new OfflineAudioContext(1, SR * (T + fade + 5), SR);
  const oldBed = buildBed(ctx, ctx.destination, a, { T: 0 }), newBed = buildBed(ctx, ctx.destination, b, { T });
  oldBed.stop(T, fade, { equalPower: true }); fadeBedIn(newBed, T, fade); // the two calls the controller makes at a change of district
  const x = (await ctx.startRendering()).getChannelData(0), W = Math.round(0.1 * SR), lv = [];
  for (let s = 0; s + W <= x.length; s += W) { let e = 0; for (let i = s; i < s + W; i++) e += x[i] * x[i]; lv.push(10 * Math.log10(Math.max(1e-12, e / W))); }
  const mean = (arr) => 10 * Math.log10(arr.reduce((p, v) => p + 10 ** (v / 10), 0) / arr.length);
  const before = mean(lv.slice(20, 38)), after = mean(lv.slice(Math.round((T + fade) * 10) + 8, lv.length - 2));
  const from = Math.round(T * 10), to = Math.round((T + fade) * 10), win = lv.slice(from, to), lo = Math.min(...win);
  return { before, after, dip: Math.min(before, after) - lo, at: (win.indexOf(lo)) / 10 };
}


// ================================================================================================================ sixth round: the engine itself, at any sample rate
// The filters above are designed for 48 kHz (the `SR` of the calibration). The checks of this round run the REAL engine at 44.1 and 48 kHz, so they need the weightings at the context's own rate:
// the K-weighting of BS.1770-4 and a 220 Hz Butterworth high-pass as the laptop's speaker, designed per rate (the A-weighting is the cascade above, built for the rate).

/** BS.1770-4 K-weighting (a high shelf and a 38 Hz high-pass) designed at `sr`. At 48 kHz it is the table's constants to seven places. */
function kCoefsAt(sr) {
  const f0 = 1681.9744509555319, G = 3.999843853973347, Q = 0.7071752369554196, K = Math.tan(Math.PI * f0 / sr), Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416, a0 = 1 + K / Q + K * K;
  const shelf = [[(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]];
  const f1 = 38.13547087613982, Q1 = 0.5003270373253953, K1 = Math.tan(Math.PI * f1 / sr), c0 = 1 + K1 / Q1 + K1 * K1;
  return [shelf, [[1, -2, 1], [1, 2 * (K1 * K1 - 1) / c0, (1 - K1 / Q1 + K1 * K1) / c0]]];
}
const hp2At = (x, fc, sr) => { const w = 2 * Math.PI * fc / sr, c = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2), a0 = 1 + al; return biq(x, [(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0], [1, -2 * c / a0, (1 - al) / a0]); };
const bilinearAt = (b, a, sr) => { const k = 2 * sr, N = [b[0] * k * k + b[1] * k + b[2], -2 * b[0] * k * k + 2 * b[2], b[0] * k * k - b[1] * k + b[2]], D = [a[0] * k * k + a[1] * k + a[2], -2 * a[0] * k * k + 2 * a[2], a[0] * k * k - a[1] * k + a[2]]; return [N.map((v) => v / D[0]), D.map((v) => v / D[0])]; };
const aCache = new Map();
function aSectionsAt(sr) {
  let c = aCache.get(sr);
  if (!c) {
    const sec = [bilinearAt([1, 0, 0], [1, 2 * W(20.598997), W(20.598997) ** 2], sr), bilinearAt([1, 0, 0], [1, W(107.65265) + W(737.86223), W(107.65265) * W(737.86223)], sr), bilinearAt([0, 0, W(12194.217) ** 2], [1, 2 * W(12194.217), W(12194.217) ** 2], sr)];
    const w = 2 * Math.PI * 1000 / sr; let re = 1, im = 0; // the cascade's gain at 1 kHz, so the weighting reads 0 dB there
    for (const [b, a] of sec) { const nr = b[0] + b[1] * Math.cos(w) + b[2] * Math.cos(2 * w), ni = -(b[1] * Math.sin(w) + b[2] * Math.sin(2 * w)), dr = a[0] + a[1] * Math.cos(w) + a[2] * Math.cos(2 * w), di = -(a[1] * Math.sin(w) + a[2] * Math.sin(2 * w)), q = dr * dr + di * di, hr = (nr * dr + ni * di) / q, hi = (ni * dr - nr * di) / q; [re, im] = [re * hr - im * hi, re * hi + im * hr]; }
    c = { sec, norm: 1 / Math.hypot(re, im) }; aCache.set(sr, c);
  }
  return c;
}
/** The three weightings at `sr`: K-weighted, the laptop's high-pass, and A-weighting. `fast` is the loudest 125 ms exponential mean square of an already weighted signal, in dB. */
export const wt = {
  k: (x, sr) => kCoefsAt(sr).reduce((y, [b, a]) => biq(y, b, a), x),
  hp: (x, sr, fc = LAPTOP_HZ) => hp2At(x, fc, sr),
  a: (x, sr) => { const { sec, norm } = aSectionsAt(sr); let y = x; for (const [b, a] of sec) y = biq(y, b, a); return y.map((v) => v * norm); },
  fast: (k, sr) => { const a = Math.exp(-1 / (0.125 * sr)); let m = 0, mx = 0; for (let i = 0; i < k.length; i++) { m = a * m + (1 - a) * k[i] * k[i]; if (m > mx) mx = m; } return 10 * Math.log10(Math.max(1e-12, mx)); },
};
/** The two Fast levels of a window the way the calibration reads them (K-weighted, and the quiet laptop: a 220 Hz high-pass, then A-weighting) and its peak, all at the window's own rate. */
export function levelsAt(x, sr) {
  const h = wt.hp(x, sr); let pk = 0; for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > pk) pk = v; }
  return { fastK: wt.fast(wt.k(x, sr), sr), fastA: wt.fast(wt.a(h, sr), sr), pk: db(pk) };
}
/** The mean square of a steady window through a weighting, in dB: for a tone that holds one level (the dial). */
export const steadyDb = (y, from, to) => { let e = 0; for (let i = from; i < to; i++) e += y[i] * y[i]; return 10 * Math.log10(Math.max(1e-24, e / Math.max(1, to - from))); };

/**
 * The REAL engine (js/audio/engine.js) in an OfflineAudioContext at `sr`, stereo, with its own settings and a seeded random, so a sound is the same sound in two rigs. Calls made through `at(t, fn)` run
 * at the first render quantum at or after t (suspend and resume), so the engine reads `currentTime` as a whole number of 128-frame quanta, exactly as it does in the page; calls made before `render()`
 * run at currentTime 0, the moment after the context is made, which is the first sound of a page. `events` has the time each call really ran.
 */
export const ENGINE_DEFAULTS = { master: 70, mute: false, ui: true, game: true, ambient: false, ambientLevel: 70, dial: false, clockSounds: true, quiet: false, worldTicks: true };
export function engineRig({ sr = 48000, lengthSec = 4, settings = {}, seed = 1, channels = 2 } = {}) {
  const oc = new OfflineAudioContext(channels, Math.ceil(sr * lengthSec), sr), S = { ...ENGINE_DEFAULTS, ...settings }, events = [], timers = new Map();
  let vnow = 0, tid = 0;
  const audio = createAudio({ get: () => S, factory: () => oc, now: () => vnow, timers: { set: (f, ms) => { timers.set(++tid, { f, ms }); return tid; }, clear: (h) => timers.delete(h) }, random: rng(seed ^ 0x5bd1e995), measure: false });
  audio.unlock();
  const flushTimers = () => { for (const [h, t] of [...timers]) if (t.ms <= 0) { timers.delete(h); try { t.f(); } catch { /* a timer of the engine */ } } };
  const api = {
    oc, audio, sr, S, events,
    at(tSec, fn) { events.push({ q: Math.ceil(tSec * sr / 128) * 128, fn }); },
    async render() {
      events.sort((a, b) => a.q - b.q);
      for (let i = 1; i < events.length; i++) if (events[i].q <= events[i - 1].q) events[i].q = events[i - 1].q + 128;
      for (const ev of events) oc.suspend(ev.q / sr).then(() => { vnow = 5000 + (ev.q / sr) * 1000; ev.t = ev.q / sr; try { ev.fn(audio, api); } catch (e) { ev.err = String((e && e.stack) || e); } flushTimers(); oc.resume(); });
      const buf = await oc.startRendering();
      api.errs = events.filter((e) => e.err).map((e) => e.err);
      return buf;
    },
  };
  return api;
}
/** First and last audible sample of a window (above -120 dBFS), in samples from its start: -1 for silence. */
const audible = (L, R) => { const n = L.length; let s = -1, e = -1; for (let i = 0; i < n; i++) if (Math.abs(L[i]) > 1e-6 || Math.abs(R[i]) > 1e-6) { s = i; break; } for (let i = n - 1; i >= 0; i--) if (Math.abs(L[i]) > 1e-6 || Math.abs(R[i]) > 1e-6) { e = i; break; } return [s, e]; };

/**
 * The first sound after the context is made (sixth round, R3-1). Chrome's glue compressor is cold for its first 100 to 150 ms and takes up to 10 dB off a short sound that starts inside them
 * (docs/AUDIO.md 3.7), and the page's first press creates the context and plays its tick in the same task. Each variant is played through the real engine twice, in two rigs that draw the same
 * seeded voice: once at currentTime 0 (the first sound of a page) and once at 1.0 s; the level of the two (K-weighted Fast, the quiet laptop's A-weighted Fast, the peak) are compared and the
 * time the first one is heard at is read. A third play, after `idle` seconds of silence, says whether a compressor that has gone quiet goes cold again.
 * Returns [{ key, sr, first: { fastK, fastA, pk, at (ms) }, later: {...}, dK, dA, dPk, idle?: { dK, dA } }].
 */
export async function firstSound(sr, keys, { idle = 0 } = {}) {
  const out = [];
  for (const key of keys) {
    const [id, v] = key.split('#'), dur = RECIPES[id].dur, seg = dur + 0.7, len = 1.0 + seg + 0.4 + (idle ? idle + seg : 0);
    const play = (au) => au.play(id, { variant: v, poolIndex: 0, noCooldown: true });
    const A = engineRig({ sr, lengthSec: len, seed: 5 }), B = engineRig({ sr, lengthSec: len, seed: 5 });
    const ha = play(A.audio); // before any rendering: the context's currentTime is 0
    B.at(1.0, play);
    if (idle) B.at(1.0 + seg + 0.2 + idle, play);
    const [ba, bb] = [await A.render(), await B.render()], cut = (b, from) => [b.getChannelData(0).subarray(Math.round(from * sr), Math.round((from + seg) * sr)), b.getChannelData(1).subarray(Math.round(from * sr), Math.round((from + seg) * sr))];
    const m = (b, from) => { const [L, R] = cut(b, from), [s] = audible(L, R); if (s < 0) return null; const lv = levelsAt(L, sr); return { ...lv, at: Math.round(s / sr * 1000) }; };
    const f = m(ba, 0), l = m(bb, 1.0);
    if (!f || !l || !ha) { out.push({ key, sr, silent: true, played: !!ha }); continue; }
    const row = { key, sr, first: f, later: l, dK: f.fastK - l.fastK, dA: f.fastA - l.fastA, dPk: f.pk - l.pk };
    if (idle) { const i2 = m(bb, 1.0 + seg + 0.2 + idle); row.idle = i2 && { dK: i2.fastK - l.fastK, dA: i2.fastA - l.fastA }; }
    out.push(row);
  }
  return out;
}

export { IDS, firstVariant, dB };
