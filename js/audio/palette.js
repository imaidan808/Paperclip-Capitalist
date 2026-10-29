// The sound palette (docs/AUDIO.md section 2): the key, the shared noise, the layer renderer, the voices (marimba, glass, bell, coin, wood, thump, paper, swoosh, stamp, brass, horn,
// click, sparkle), money sizing and the master chain's soft clip. Everything is generated with the Web Audio API; there are no audio files.
// No import, no DOM, no window: it runs in a page, in an OfflineAudioContext and in Node against a fake context.

// ---- the key: D major pentatonic (D E F# A B), the same five pitches as B minor pentatonic. A recipe never contains a raw frequency.
const PC = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
export const KEY_NOTES = ['D', 'E', 'F#', 'A', 'B'];
export function hz(n) {
  if (typeof n === 'number') return n;
  const m = /^([A-G]#?)(-?\d)$/.exec(n);
  if (!m) throw new Error('bad note ' + n);
  return 440 * 2 ** ((12 * (+m[2] + 1) + PC[m[1]] - 69) / 12);
}
export const inKey = (n) => typeof n === 'string' && /^(D|E|F#|A|B)-?\d$/.test(n);
export const dB = (x) => 10 ** (x / 20);
const KEY_PC = new Set([2, 4, 6, 9, 11]);
/** Is this frequency one of the key's notes (within 30 cents, any octave)? */
export const inKeyHz = (fr) => { const m = 12 * Math.log2(fr / 440) + 69, r = Math.round(m); return Math.abs(m - r) <= 0.3 && KEY_PC.has(((r % 12) + 12) % 12); };
/** The partials of a bank that are actually generated: nothing above 6 kHz, and nothing outside the key louder than -26 dB (0.05) under the fundamental. */
export const keptPartials = (L) => { const f = hz(L.f); return L.p.filter(([ratio, pg]) => f * ratio <= 6000 && (pg <= 0.05 || inKeyHz(f * ratio))); };

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---- shared noise: white, pink, brown, 2.5 s, RMS 0.25, made once per context from a fixed seed.
// The noise is built in the frequency domain (Appendix F, I3). A buffer of plain random samples is stationary only on average: the energy a 40 ms window of it puts through a 600 Hz band varies by
// +-1 dB from one window to the next (about 20 independent values in the window), so a footstep, which is exactly that, came out 5 to 7 dB apart from one play to the next and the loudest 3 dB over
// its tier's ceiling. Here every block of 512 frames (10 ms) has the SAME magnitude spectrum, set by the colour, and a random phase in every bin; the blocks overlap by half under a sine window
// (power-complementary: the sum of the squared windows is 1) and wrap round the end, so the buffer loops with no seam and no cross-fade. The energy in any band is then the same in every block, and a
// window of a few blocks sees almost the same energy wherever it is laid. The sound is still noise: no bin repeats a phase.
const NOISE_BLOCK = { white: 512, pink: 512, brown: 1024 }; // brown's energy is low, so its blocks are longer to reach it (47 Hz a bin); the others are short, to be even over a few milliseconds
const NOISE_SHAPE = { white: () => 1, pink: (f) => 1 / Math.sqrt(f), brown: (f) => 1 / Math.sqrt(1 + (f / 150) ** 2) }; // magnitude by frequency: flat, -3 dB per octave, flat to 150 Hz and then -6 dB per octave
const TW = new Map(); // twiddle tables by block length
function twiddles(n) {
  let t = TW.get(n);
  if (!t) { t = { c: new Float64Array(n / 2), s: new Float64Array(n / 2) }; for (let k = 0; k < n / 2; k++) { t.c[k] = Math.cos(2 * Math.PI * k / n); t.s[k] = -Math.sin(2 * Math.PI * k / n); } TW.set(n, t); }
  return t;
}
function fftInPlace(re, im) { // radix 2, forward
  const n = re.length, { c, s } = twiddles(n);
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0, w = 0; k < half; k++, w += step) {
        const a = i + k, b = a + half, tr = re[b] * c[w] - im[b] * s[w], ti = re[b] * s[w] + im[b] * c[w];
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
}
const PH = 4096, PH_COS = new Float64Array(PH), PH_SIN = new Float64Array(PH); // phases come from a table: the noise needs a random angle, not a precise one
for (let i = 0; i < PH; i++) { PH_COS[i] = Math.cos(2 * Math.PI * i / PH); PH_SIN[i] = Math.sin(2 * Math.PI * i / PH); }
/** One colour of the noise: n frames (a whole number of hops), the random source `r`. Two blocks go through one complex transform (the real part is one block, the imaginary part the other). */
function flatNoise(n, sr, color, r) {
  const N = NOISE_BLOCK[color], H = N >> 1, hops = Math.ceil(n / H), total = hops * H, out = new Float64Array(total);
  const mag = new Float64Array(N / 2); let power = 0;
  for (let k = 1; k < N / 2; k++) { mag[k] = NOISE_SHAPE[color](k * sr / N); power += mag[k] * mag[k]; }
  const c = 1 / Math.sqrt(2 * power); // x[n] = sum of 2 a cos(..) has the power of 2 a^2 a bin: this makes the RMS of one block 1
  for (let k = 1; k < N / 2; k++) mag[k] *= c;
  const win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = Math.sin(Math.PI * (i + 0.5) / N);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let b = 0; b < hops; b += 2) {
    const two = b + 1 < hops;
    for (let k = 1; k < N / 2; k++) {
      const p1 = (r() * PH) | 0, x1 = mag[k] * PH_COS[p1], y1 = mag[k] * PH_SIN[p1]; // block b's bin k
      let x2 = 0, y2 = 0; if (two) { const p2 = (r() * PH) | 0; x2 = mag[k] * PH_COS[p2]; y2 = mag[k] * PH_SIN[p2]; } // block b + 1's
      re[k] = x1 - y2; im[k] = y1 + x2; re[N - k] = x1 + y2; im[N - k] = x2 - y1; // Z = X1 + i X2 with both spectra conjugate-symmetric
    }
    re[0] = im[0] = re[N >> 1] = im[N >> 1] = 0;
    fftInPlace(re, im);
    for (let i = 0; i < N; i++) { let o = b * H + i; if (o >= total) o -= total; out[o] += re[i] * win[i]; }
    if (two) for (let i = 0; i < N; i++) { let o = (b + 1) * H + i; if (o >= total) o -= total; out[o] += im[i] * win[i]; }
  }
  return out;
}
let NOISE_DATA = null; // made once for the page, whatever the number of contexts (an offline render makes one for every sound it measures)
function noiseData() {
  if (NOISE_DATA) return NOISE_DATA;
  const sr = NOISE_RATE, r = rng(0xC0FFEE), H = NOISE_BLOCK.brown >> 1, n = Math.ceil(Math.round(sr * 2.5) / H) * H, data = { n };
  for (const color of ['white', 'pink', 'brown']) {
    const x = flatNoise(n, sr, color, r), d = new Float32Array(n);
    let s = 0; for (let i = 0; i < n; i++) s += x[i] * x[i];
    const k = 0.25 / Math.sqrt(s / n || 1);
    for (let i = 0; i < n; i++) d[i] = x[i] * k;
    data[color] = d;
  }
  return (NOISE_DATA = data);
}
/** The noise is made at one rate whatever the context's, so a noise offset names the same burst on every device (the browser resamples a buffer of another rate as it plays it). */
export const NOISE_RATE = 48000;
export function noiseBuffers(ctx) {
  if (ctx._nb) return ctx._nb;
  const data = noiseData(), n = data.n, bufs = {};
  for (const color of ['white', 'pink', 'brown']) { const buf = ctx.createBuffer(1, n, NOISE_RATE); buf.getChannelData(0).set(data[color]); bufs[color] = buf; }
  return (ctx._nb = { white: bufs.white, pink: bufs.pink, brown: bufs.brown, loopEnd: n / NOISE_RATE, len: n / NOISE_RATE });
}
/** Where in the noise the i-th noise layer of a voice starts when the voice was given a chosen offset `at` (seconds): each layer a fixed step further on, so two layers of one colour are not the same noise. */
export const noiseStep = 0.2173;
export const noiseOffset = (at, i, loopEnd) => (at + i * noiseStep) % loopEnd;

// ---- envelopes: linear attack (0.4 ms at least, so nothing clicks), optional hold, exponential decay to -60 dB. Returns the time the voice is silent.
// A gain node's own value is 1, and an event at time T applies from the first frame at or after T: when T falls on a sample boundary and a rounding hair after the frame's own time (the engine's
// starts do, at 48 kHz: 0.012 s is 576 frames, and currentTime is a whole number of 128-frame quanta), the frame at T was rendered BEFORE the event and passed the first sample of the source at
// full scale, a one-sample click of up to -14 dBFS (Appendix F, I1). So the value is put in place first and the first event only repeats it.
export const MIN_ATTACK = 0.0004;
export function env(param, t, a, h, d, g) {
  param.value = 0;
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(g, t + a);
  if (h > 0) param.setValueAtTime(g, t + a + h);
  param.exponentialRampToValueAtTime(Math.max(1e-12, Math.min(g, Math.max(0.0001, g * 0.001))), t + a + h + d); // the release never rises: a layer quieter than the -80 dB floor stays where it is
  return t + a + h + d;
}
/** A fade in from silence that is silent at its first frame whatever the grid: the same rule as `env` for a ramp that is not a layer's (a bed, a modifier, the dial tone). */
export function fadeIn(param, at, dur, to = 1) {
  param.value = 0;
  param.setValueAtTime(0, at);
  param.linearRampToValueAtTime(to, at + dur);
}
/**
 * An equal-power fade (fourth round, R4): the gain follows a quarter of a sine going up (`in`, from silence) or of a cosine going down (`out`, from `level`) over `dur` seconds, in `steps` linear pieces,
 * so that two uncorrelated sounds fading across each other (two noise beds; a change of district) keep one power: sin^2 + cos^2 = 1. Two linear fades of different lengths, as the beds had, dip by 4 to 7 dB
 * in the middle (-3 dB for equal lengths, -5.1 for 3 s in and 2 s out). The first value is put in place before the first event, as `fadeIn` does (I1). Piecewise linear because a recording fake and every
 * engine take it, and 16 pieces of a quarter wave are within 0.15% of it.
 */
export function equalFade(param, at, dur, level, dir = 'in', steps = 16) {
  const f = (u) => level * (dir === 'in' ? Math.sin(u * Math.PI / 2) : Math.cos(u * Math.PI / 2));
  param.cancelScheduledValues(at);
  if (dir === 'in') { param.value = 0; param.setValueAtTime(0, at); } else param.setValueAtTime(level, at);
  for (let i = 1; i <= steps; i++) param.linearRampToValueAtTime(f(i / steps), at + dur * i / steps);
}
function biquad(ctx, type, spec, T, dur) { // spec = [f0, Q, f1?]: a static filter, or one swept (exponentially) to f1 over dur
  const q = ctx.createBiquadFilter(); q.type = type; q.Q.value = spec[1] ?? 0.7;
  q.frequency.value = spec[0]; // the value first: the filter's default is 350 Hz, and a frame rendered before the event would use it
  q.frequency.setValueAtTime(spec[0], T);
  if (spec[2]) q.frequency.exponentialRampToValueAtTime(spec[2], T + dur);
  return q;
}
function chain(ctx, head, L, T, dur, out) { // optional hp, lp, bp after `head`, then out
  let node = head;
  for (const [key, type] of [['hp', 'highpass'], ['lp', 'lowpass'], ['bp', 'bandpass']]) if (L[key]) { const q = biquad(ctx, type, L[key], T, L.sweep ?? dur); node.connect(q); node = q; }
  node.connect(out);
}

/** Layers that repeat in many sounds do not stack: the later voice skips a layer whose family started inside its window (docs/AUDIO.md 3.3). Milliseconds. */
export const FAMILY_MS = { coin: 250, stamp: 1200, sparkle: 800, brass: 1500, bell: 1500, thump: 250 };
/** A noise layer is texture (a click, paper, air) unless it says it is the body of the sound (`main`): a secondary voice of a burst plays without its texture. */
export const isGhost = (L) => L.k === 'noise' && !L.main;

/**
 * One layer of a recipe, scheduled at time T (seconds in the context's clock). Returns the time the layer is silent.
 * k: tone | bank | noise. Common: t (offset), g (peak), a (attack), h (hold), d (decay to -60 dB), hp/lp/bp = [f0, Q, f1?], fam (layer family), ding (no register ding when dull).
 * o: { r: random source, jit: cents shared by the voice, srcs: array that collects every started source (to stop the voice early), at: a chosen noise offset in seconds or null, ni: noise layers started so far }
 */
export function layer(ctx, out, L, T0, o) {
  const T = T0 + (L.t || 0) + (L.tj ? (o.r() * 2 - 1) * 0.004 : 0), a = Math.max(MIN_ATTACK, L.a ?? 0.003), h = L.h ?? 0, d = L.d ?? 0.2, g = L.g ?? 1;
  const srcs = o.srcs;
  const go = (s, t0, t1) => { s.start(t0); s.stop(t1); srcs?.push(s); };
  if (L.k === 'tone') {
    const n = L.uni ? L.uni[0] : 1, gain = ctx.createGain(), end = env(gain.gain, T, a, h, d, g / Math.sqrt(n));
    chain(ctx, gain, L, T, a + h + d * 0.5, out);
    for (let i = 0; i < n; i++) {
      const osc = ctx.createOscillator(); osc.type = L.type || 'sine';
      osc.detune.value = (n > 1 ? (i / (n - 1) * 2 - 1) * L.uni[1] : 0) + (L.det || 0) + o.jit;
      osc.frequency.value = hz(L.f);
      osc.frequency.setValueAtTime(hz(L.f), T);
      if (L.f2) osc.frequency.exponentialRampToValueAtTime(hz(L.f2), T + (L.gl ?? d));
      if (L.vib) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = L.vib[0]; lg.gain.value = L.vib[1]; lfo.connect(lg); lg.connect(osc.detune); go(lfo, T, end + 0.03); }
      osc.connect(gain); go(osc, T, end + 0.03);
    }
    return end;
  }
  if (L.k === 'bank') {
    const sum = ctx.createGain(); let end = T;
    chain(ctx, sum, L, T, 0.3, out);
    const f = hz(L.f);
    for (const [ratio, pg, pd] of keptPartials(L)) {
      const osc = ctx.createOscillator(), pgn = ctx.createGain();
      osc.type = L.type || 'sine'; osc.frequency.value = f * ratio; osc.detune.value = (L.det || 0) + o.jit;
      end = Math.max(end, env(pgn.gain, T, a, 0, pd, g * pg));
      osc.connect(pgn); pgn.connect(sum); go(osc, T, T + a + pd + 0.03);
    }
    return end;
  }
  if (L.k === 'noise') {
    const nb = noiseBuffers(ctx), buf = nb[L.c || 'white'], src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = buf; src.loop = true; src.loopStart = 0; src.loopEnd = nb.loopEnd;
    const end = env(gain.gain, T, a, h, d, g);
    let head = gain;
    if (L.am) { // crinkle: the level is multiplied by two unrelated low-rate oscillators (no random source needed)
      const am = ctx.createGain(); am.gain.value = 1 - L.am[1];
      for (const r of [1, 1.618]) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = L.am[0] * r; lg.gain.value = L.am[1] / 2; lfo.connect(lg); lg.connect(am.gain); go(lfo, T, end + 0.03); }
      gain.connect(am); head = am;
    }
    chain(ctx, head, L, T, a + h + d * 0.6, out);
    src.connect(gain); src.start(T, o.at != null ? noiseOffset(o.at, o.ni++, nb.loopEnd) : o.r() * (nb.loopEnd - 0.5)); src.stop(end + 0.03); srcs?.push(src); // a voice given offsets plays its noise from one of them (see js/audio/trims.js)
    return end;
  }
  throw new Error('unknown layer ' + L.k);
}

/**
 * When the oscillators (and noise sources) of one layer are alive, relative to the voice's start: a list of [from, to, count] in seconds. A bank gives one entry per partial, since each partial
 * ends at its own time. This is what the engine's oscillator budget counts (docs/AUDIO.md 3.3): what is alive at the same instant, not what a voice would hold if it were played all at once.
 */
export function layerSpans(L) {
  const t = L.t || 0, a = Math.max(MIN_ATTACK, L.a ?? 0.003), h = L.h ?? 0, d = L.d ?? 0.2;
  if (L.k === 'tone') return [[t, t + a + h + d + 0.03, (L.uni ? L.uni[0] : 1) + (L.vib ? 1 : 0)]];
  if (L.k === 'bank') return keptPartials(L).map(([, , pd]) => [t, t + a + pd + 0.03, 1]);
  return [[t, t + a + h + d + 0.03, 1 + (L.am ? 2 : 0)]];
}

/** An equal-power panner passes a centred mono voice at -3.01 dB per side; the voice gain adds that back, so total power is the same at every pan (and the same as with no panner). */
export const PAN_COMP_DB = 20 * Math.log10(Math.SQRT2);

/**
 * Plays a recipe's layers into `dest` at T0.
 * o: { seed, trim (dB), gainDb, pan, jitterCents, noJitter, lp (a voice-wide lowpass, Hz), skip (Set of layer families to leave out), secondary (no texture layers), dull (no ding layers),
 *       noiseAt (a list of noise offsets in seconds, validated by the calibration: the voice plays its noise from one of them, picked by its seed, instead of from a random place) }
 * Returns { end (when everything is silent), gain (the voice gain), srcs, fams (the families it played), stop(t, fadeSec) }.
 */
export function voice(ctx, dest, layers, T0, o = {}) {
  const r = rng(o.seed ?? 1), jit = o.jit ?? (r() * 2 - 1) * (o.jitterCents ?? 7), vg = ctx.createGain();
  const gj = o.noJitter ? 0 : (r() * 2 - 1) * 0.7; // gain jitter, dB
  // Every voice goes through the same equal-power panner, centred or not, and the panner's own -3 dB at the centre is made up in the voice gain: a panned sound is as loud as an unpanned one
  // (one with a panner and one without differed by exactly 3.0 dB in total, so a sale whose buyer was off screen jumped by that much). Where there is no panner the voice goes straight to the bus.
  const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  vg.gain.value = dB((o.trim || 0) + (o.gainDb || 0) + gj + (panner ? PAN_COMP_DB : 0));
  let tail = vg;
  const lp = o.lp || (o.dull ? 3500 : 0);
  if (lp) { const q = ctx.createBiquadFilter(); q.type = 'lowpass'; q.frequency.value = lp; vg.connect(q); tail = q; }
  if (panner) { panner.pan.value = Number.isFinite(+o.pan) ? Math.max(-1, Math.min(1, +o.pan)) : 0; tail.connect(panner); panner.connect(dest); } else tail.connect(dest);
  let end = T0;
  const srcs = [], fams = new Set(), oo = { r, jit, srcs, at: o.noiseAt && o.noiseAt.length ? o.noiseAt[Math.min(o.noiseAt.length - 1, Math.floor(r() * o.noiseAt.length))] : null, ni: 0 };
  for (const L of layers) {
    if (L.fam && o.skip?.has(L.fam)) continue;
    if (o.secondary && isGhost(L)) continue;
    if (o.dull && L.ding) continue;
    end = Math.max(end, layer(ctx, vg, L, T0 + (o.delay || 0), oo));
    if (L.fam) fams.add(L.fam);
  }
  const v = { end, gain: vg, srcs, fams, jit };
  v.stop = (t, fade = 0.012) => { // an early end is a fade, never a cut
    try { vg.gain.cancelScheduledValues(t); vg.gain.setValueAtTime(Math.max(0.0001, vg.gain.value), t); vg.gain.exponentialRampToValueAtTime(0.0001, t + fade); } catch { /* already gone */ }
    for (const s of srcs) { try { s.stop(t + fade + 0.02); } catch { /* already stopped */ } }
    v.end = Math.min(v.end, t + fade + 0.02);
  };
  return v;
}

/** A soft clip that never passes the ceiling: linear to 0.5, then a tanh knee that settles at `ceil` (0.708 = -3 dBFS). Input beyond +-1 is held at the curve's end. */
export function softClipCurve(ceil = 0.708, n = 4096) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x); c[i] = Math.sign(x) * (a <= 0.5 ? a : 0.5 + (ceil - 0.5) * Math.tanh((a - 0.5) / (ceil - 0.5))); }
  return c;
}
/** The glue compressor (rev 2: threshold -16 dB, so the loud tier keeps its gap over the medium one). */
export const GLUE = { threshold: -16, knee: 18, ratio: 3, attack: 0.005, release: 0.25 };
/** Bus trims in dB: interface, game, ambient. */
export const BUS_DB = { ui: -3, game: 0, amb: -6 };
export const CEILING = 0.708; // -3 dBFS
/** The compressor node's own automatic gain at these settings, for browsers that cannot be measured (Chrome, measured at -16 dB). */
export const MAKEUP_FALLBACK = 1.321;
/**
 * The master chain: three buses -> master gain -> glue compressor -> makeup (undoes the compressor node's automatic gain) -> 4x soft clip at -3 dBFS -> destination.
 * `duck` (default off here) puts one more gain between each bus and the master, which the engine moves to duck a bus (3.5).
 */
export function master(ctx, { master: m = 1, makeup = 1 } = {}) {
  const mk = (db) => { const g = ctx.createGain(); g.gain.value = dB(db); return g; };
  const buses = { ui: mk(BUS_DB.ui), game: mk(BUS_DB.game), amb: mk(BUS_DB.amb) }, mg = mk(0); mg.gain.value = m;
  const glue = ctx.createDynamicsCompressor(); for (const [k, v] of Object.entries(GLUE)) glue[k].value = v;
  const mu = ctx.createGain(); mu.gain.value = makeup;
  const clip = ctx.createWaveShaper(); clip.curve = softClipCurve(); clip.oversample = '4x';
  for (const b of Object.values(buses)) b.connect(mg);
  mg.connect(glue); glue.connect(mu); mu.connect(clip); clip.connect(ctx.destination);
  return { buses, master: mg, glue, makeup: mu, clip };
}

// ---- the palette's instruments: each returns layers (an object or an array of objects)
export const P5 = ['D4', 'E4', 'F#4', 'A4', 'B4', 'D5', 'E5', 'F#5', 'A5', 'B5', 'D6', 'E6', 'F#6', 'A6', 'B6', 'D7'];
export const mar = (f, t = 0, g = 0.6, d = 0.35, x = {}) => ({ k: 'bank', f, t, a: 0.002, g, p: [[1, 1, d], [4, 0.28, d * 0.25], [10, 0.045, 0.03]], ...x });
export const gls = (f, t = 0, g = 0.5, d = 0.9, x = {}) => ({ k: 'bank', f, t, a: 0.001, g, p: [[1, 1, d], [2.01, 0.42, d * 0.6], [3.02, 0.24, d * 0.4], [4.05, 0.1, d * 0.25]], ...x });
export const bellL = (f, t = 0, g = 0.5, d = 1.2, x = {}) => ({ k: 'bank', f, t, a: 0.001, g, p: [[1, 1, d], [2, 0.6, d * 0.7], [3, 0.45, d * 0.5], [4.01, 0.3, d * 0.35], [5.02, 0.12, d * 0.2]], ...x });
export const click = (t = 0, g = 0.25, f = 3200, q = 1.4, d = 0.01) => ({ k: 'noise', c: 'white', t, a: 0.0004, d, g: g * 4, bp: [Math.min(f, 3400), q] });
/** A wood knock: a short sine and a click. Below about 350 Hz (D4 is 294) a quiet laptop plays the sine 7 dB under what a flat speaker does, and the knock would be a bass thump that only the K-weighted ear hears: it carries its octave at six tenths of its level (docs/AUDIO.md Appendix F, I2). */
export const octaveUp = (n) => (typeof n === 'string' ? n.replace(/-?\d$/, (d) => String(+d + 1)) : n * 2);
export const wood = (f, t = 0, g = 0.5, d = 0.05) => [{ k: 'tone', f, t, a: 0.0008, d, g }, ...(hz(f) < 350 ? [{ k: 'tone', f: octaveUp(f), t, a: 0.0008, d: d * 0.8, g: g * 0.6 }] : []), click(t, g * 0.5, 2400, 1.2, 0.012)];
export const thump = (f0, f1, t = 0, g = 0.7, d = 0.16, x = {}) => ({ k: 'tone', f: f0, f2: f1, gl: d * 0.55, t, a: 0.002, d, g, th: 1, fam: 'thump', ...x });
export const paper = (t = 0, d = 0.14, g = 0.3, f0 = 1800, f1 = 5200, x = {}) => ({ k: 'noise', c: 'pink', t, a: 0.012, d, g: g * 4, bp: [f0, 0.9, f1], am: [29, 0.6], ...x });
export const swoosh = (t, d, f0, f1, g = 0.25) => ({ k: 'noise', c: 'pink', t, a: d * 0.4, d: d * 0.6, g: g * 3.4, bp: [f0, 0.8, f1] });
export const stamp = (t = 0, g = 1) => [thump('D3', 'D2', t, 0.8 * g, 0.12, { fam: 'stamp' }), { k: 'noise', c: 'pink', t, a: 0.001, d: 0.035, g: 0.5 * g, bp: [900, 0.9], fam: 'stamp' }, paper(t + 0.02, 0.09, 0.12 * g, 1800, 5200, { fam: 'stamp' })];
export const coin = (f, t = 0, g = 0.35, d = 0.14, x = {}) => [{ k: 'bank', f, t, a: 0.0008, g, p: [[1, 1, d], [1.5, 0.55, d * 0.7], [2, 0.35, d * 0.45]], tx: 1, fam: 'coin', ...x }, { ...click(t, g * 0.5, 5200, 2, 0.006), fam: 'coin' }];
export const brass = (f, t = 0, g = 0.5, h = 0.12, d = 0.3, c0 = 500, c1 = 2600) => ({ k: 'tone', f, t, type: 'sawtooth', uni: [3, 9], a: 0.04, h, d, g, lp: [c0, 0.8, c1], sweep: 0.04 + h, fam: 'brass' });
export const horn = (f, sub, t = 0, g = 0.5, h = 0.3, d = 0.4) => [{ k: 'tone', f, t, type: 'sawtooth', uni: [2, 6], a: 0.1, h, d, g, lp: [420, 0.9] }, { k: 'tone', f: sub, t, a: 0.1, h, d, g: g * 0.7 }];
export const COINS = ['D6', 'A6', 'D7', 'E6', 'E7', 'A6', 'B6', 'D7'];
export const FALL = ['D6', 'B5', 'A5', 'E5', 'D5']; // spending: each coin a step lower than the one before
export const RISE = ['A5', 'D6', 'E6', 'A6'];       // cash landing late: gently upward
export const coins = (n, span, t0 = 0, g = 0.3, set = COINS, x = {}, seq = false) => Array.from({ length: n }, (_, i) => coin(set[seq ? i % set.length : (i * 3 + 1) % set.length], t0 + (n < 2 ? 0 : span * Math.sqrt(i / (n - 1))), g * (0.65 + 0.35 * (((i * 7) % 5) / 4)), 0.13, x));
export const sparkle = (n, t0 = 0, g = 0.14, from = 10, step = 0.035) => Array.from({ length: n }, (_, i) => gls(P5[Math.min(P5.length - 1, from + i)], t0 + i * step, g, 0.4, { fam: 'sparkle' }));
export const arp = (notes, step, mk, t0 = 0) => notes.map((n, i) => mk(n, t0 + i * step, i));
export const ticks = (n, t0, gap, g = 0.2, f = 3600) => Array.from({ length: n }, (_, i) => click(t0 + i * gap, g, f + (i % 3) * 300, 1.6, 0.008));
export const pair = (a, b, t = 0, gap = 0.12, g = 0.4, d = 0.3) => [gls(a, t, g, d), gls(b, t + gap, g, d)]; // the two-tone of a warning: a falling minor third
/**
 * The mid body of a refusal or a loss (docs/AUDIO.md 2.2): a laptop speaker has nothing under 150 Hz, so a "no" that lives in the lows is not heard. A sine at A4 (440 Hz) and a knock bandpassed at 440 Hz put
 * at least 40% of the energy above 250 Hz without touching the low taps that make it read as a "no".
 * `from`: a loss FALLS, and the falling taps (D3, A2) are under what a laptop plays, so the body carries the fall where it can be heard: the sine steps down from `from` to `note` (D5 to A4 is a fifth, A4
 * to F#4 a third) in the time the taps take to fall. Without `from` the body is one held note (a neutral "no", or a body in a sound that is not a loss).
 * `knock`: the share of the noise knock. A loud alert that is held under its level by its peak (-3 dBFS) takes a body with most of its knock taken out and the sines (which have a crest factor of 3 dB, not 12)
 * raised, so that its level under a quiet laptop can rise without its peak.
 * The tone rings 2.0 times `d` (1.5 for the second note of a fall), where it rang 1.4 (1.1) until the fourth round: the loss family and the short purchases sat 3.4 to 4.1 dB under their tier in the quiet laptop's
 * MOMENTARY loudness (400 ms), which counts how long a sound is as well as how loud, and a body that rings a little longer is what a small speaker plays of them (Appendix G, R2).
 * The body sits at 370 to 590 Hz and not lower (it was D4, 294 Hz, until the third repair round): at the level of a quiet laptop (about 40 phon, A-weighted after the speaker's high-pass) 294 Hz is 7 dB
 * under 1 kHz and 440 Hz is 4, so a body at D4 made every loss 4 to 7 dB quieter than its tier on the device it was written for (Appendix F, I2).
 */
export const body = (t = 0, g = 0.5, note = 'A4', d = 0.12, from = null, knock = 1) => [
  ...(from
    ? [{ k: 'tone', f: from, t, a: 0.004, d: d * 0.6, g: g * 1.6 }, { k: 'tone', f: note, t: t + d * 0.45, a: 0.004, d: d * 1.5, g: g * 2 }]
    : [{ k: 'tone', f: note, t, a: 0.004, d: d * 2.0, g: g * 2 }]),
  { k: 'noise', c: 'pink', t, a: 0.002, d: d * 0.6, g: g * 3 * knock, bp: [440, 0.9], main: true },
];

// ---- sizing money (2.4): coins carry the size of the sum, on a log scale. The thresholds are the table's: $41, $1,780 and $75,000, and a deal worth a fifth of everything you have is a step bigger.
export const MONEY_STEPS = [41, 1780, 75000];
export function moneySize(amount, netWorth) {
  const a = Math.abs(Number(amount));
  if (!Number.isFinite(a)) return 's';
  let base = 0;
  for (const s of MONEY_STEPS) if (a >= s) base++;
  const nw = Number(netWorth);
  const big = Number.isFinite(nw) && nw > 0 && a >= 0.2 * nw ? 1 : 0;
  return ['s', 'm', 'l', 'xl'][Math.min(3, base + big)];
}
