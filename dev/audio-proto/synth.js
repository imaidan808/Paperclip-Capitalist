// Prototype synth for docs/AUDIO.md: the palette's voices and a renderer that works on AudioContext and OfflineAudioContext.
// Everything is generated: oscillators, shared noise buffers, biquads, gains. No files.

// ---- the key: D major pentatonic (D E F# A B), the same pitch set as B minor pentatonic
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

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---- shared noise: white, pink, brown, 2.5 s, RMS 0.25, made once per context from a fixed seed; the loop seam is cross-faded
export function noiseBuffers(ctx) {
  if (ctx._nb) return ctx._nb;
  const sr = ctx.sampleRate, n = Math.round(sr * 2.5), r = rng(0xC0FFEE), f = Math.round(sr * 0.12);
  const W = ctx.createBuffer(1, n, sr), P = ctx.createBuffer(1, n, sr), B = ctx.createBuffer(1, n, sr);
  const w = W.getChannelData(0), p = P.getChannelData(0), b = B.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const x = r() * 2 - 1; w[i] = x;
    b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852; b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362; b6 = x * 0.115926;
    last = (last + 0.02 * x) / 1.02; b[i] = last * 3.5;
  }
  for (const buf of [W, P, B]) {
    const d = buf.getChannelData(0); let s = 0;
    for (let i = 0; i < n; i++) s += d[i] * d[i];
    const k = 0.25 / Math.sqrt(s / n);
    for (let i = 0; i < n; i++) d[i] *= k;
    for (let i = 0; i < f; i++) { const a = i / f; d[i] = d[i] * a + d[n - f + i] * (1 - a); } // seam: the first f samples now lead on from the last f
  }
  return (ctx._nb = { white: W, pink: P, brown: B, loopEnd: (n - f) / sr, len: n / sr });
}

// ---- envelopes: linear attack, optional hold, exponential decay to -60 dB. Returns the time the voice is silent.
function env(param, t, a, h, d, g) {
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(g, t + a);
  if (h > 0) param.setValueAtTime(g, t + a + h);
  param.exponentialRampToValueAtTime(Math.max(0.0001, g * 0.001), t + a + h + d);
  return t + a + h + d;
}
function biquad(ctx, type, spec, T, dur) { // spec = [f0, Q, f1?]: a static filter, or one swept (exponentially) to f1 over dur
  const q = ctx.createBiquadFilter(); q.type = type; q.Q.value = spec[1] ?? 0.7;
  q.frequency.setValueAtTime(spec[0], T);
  if (spec[2]) q.frequency.exponentialRampToValueAtTime(spec[2], T + dur);
  return q;
}
function chain(ctx, head, L, T, dur, out) { // optional hp, lp, bp after `head`, then out
  let node = head;
  for (const [key, type] of [['hp', 'highpass'], ['lp', 'lowpass'], ['bp', 'bandpass']]) if (L[key]) { const q = biquad(ctx, type, L[key], T, L.sweep ?? dur); node.connect(q); node = q; }
  node.connect(out);
}

const KEY_PC = new Set([2, 4, 6, 9, 11]); // D E F# A B
/** Is this frequency one of the key's notes (within 30 cents, any octave)? */
export const inKeyHz = (fr) => { const m = 12 * Math.log2(fr / 440) + 69, r = Math.round(m); return Math.abs(m - r) <= 0.3 && KEY_PC.has(((r % 12) + 12) % 12); };
/** The partials of a bank that are actually generated: nothing above 6 kHz, and nothing outside the key louder than -26 dB (0.05) under the fundamental. */
export const keptPartials = (L) => { const f = hz(L.f); return L.p.filter(([ratio, pg]) => f * ratio <= 6000 && (pg <= 0.05 || inKeyHz(f * ratio))); };
/**
 * One layer of a recipe, scheduled at time T (seconds in the context's clock). Returns the time the layer is silent.
 * k: tone | bank | noise. Common: t (offset), g (peak), a (attack), h (hold), d (decay to -60 dB), hp/lp/bp = [f0, Q, f1?].
 */
export function layer(ctx, out, L, T0, o) {
  const T = T0 + (L.t || 0) + (L.tj ? (o.r() * 2 - 1) * 0.004 : 0), a = L.a ?? 0.003, h = L.h ?? 0, d = L.d ?? 0.2, g = L.g ?? 1;
  if (L.k === 'tone') {
    const n = L.uni ? L.uni[0] : 1, gain = ctx.createGain(), end = env(gain.gain, T, a, h, d, g / Math.sqrt(n));
    chain(ctx, gain, L, T, a + h + d * 0.5, out);
    for (let i = 0; i < n; i++) {
      const osc = ctx.createOscillator(); osc.type = L.type || 'sine';
      osc.detune.value = (n > 1 ? (i / (n - 1) * 2 - 1) * L.uni[1] : 0) + (L.det || 0) + o.jit;
      osc.frequency.setValueAtTime(hz(L.f), T);
      if (L.f2) osc.frequency.exponentialRampToValueAtTime(hz(L.f2), T + (L.gl ?? d));
      if (L.vib) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = L.vib[0]; lg.gain.value = L.vib[1]; lfo.connect(lg); lg.connect(osc.detune); lfo.start(T); lfo.stop(end + 0.03); }
      osc.connect(gain); osc.start(T); osc.stop(end + 0.03);
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
      osc.connect(pgn); pgn.connect(sum); osc.start(T); osc.stop(T + a + pd + 0.03);
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
      for (const r of [1, 1.618]) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = L.am[0] * r; lg.gain.value = L.am[1] / 2; lfo.connect(lg); lg.connect(am.gain); lfo.start(T); lfo.stop(end + 0.03); }
      gain.connect(am); head = am;
    }
    chain(ctx, head, L, T, a + h + d * 0.6, out);
    src.connect(gain); src.start(T, o.r() * (nb.loopEnd - 0.5)); src.stop(end + 0.03);
    return end;
  }
  throw new Error('unknown layer ' + L.k);
}

/** Plays a recipe's layers into `dest` at T0. `o`: { seed, gainDb, pan, jitterCents }. Returns { end } (when everything is silent). */
export function voice(ctx, dest, layers, T0, o = {}) {
  const r = rng(o.seed ?? 1), jit = (r() * 2 - 1) * (o.jitterCents ?? 7), vg = ctx.createGain();
  vg.gain.value = dB((o.trim || 0) + (o.gainDb || 0) + (o.noJitter ? 0 : (r() * 2 - 1) * 0.7));
  let tail = vg;
  if (o.lp) { const q = ctx.createBiquadFilter(); q.type = 'lowpass'; q.frequency.value = o.lp; vg.connect(q); tail = q; }
  if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; tail.connect(p); p.connect(dest); } else tail.connect(dest);
  let end = T0;
  const oo = { r, jit };
  for (const L of layers) end = Math.max(end, layer(ctx, vg, L, T0, oo));
  return { end };
}

/** A soft clip that never passes the ceiling: linear to 0.5, then a tanh knee that settles at `ceil` (0.708 = -3 dBFS). Input beyond +-1 is held at the curve's end. */
export function softClipCurve(ceil = 0.708, n = 4096) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x); c[i] = Math.sign(x) * (a <= 0.5 ? a : 0.5 + (ceil - 0.5) * Math.tanh((a - 0.5) / (ceil - 0.5))); }
  return c;
}
export const GLUE = { threshold: -22, knee: 18, ratio: 3, attack: 0.005, release: 0.25 };
/** The master chain: three buses -> master gain -> glue compressor -> makeup (undoes the compressor node's automatic gain, measured) -> 4x soft clip at -3 dBFS. */
export function master(ctx, { master = 1, makeup = 1 } = {}) {
  const mk = (db) => { const g = ctx.createGain(); g.gain.value = dB(db); return g; };
  const buses = { ui: mk(-3), game: mk(0), amb: mk(-6) }, mg = mk(0); mg.gain.value = master;
  const glue = ctx.createDynamicsCompressor(); for (const [k, v] of Object.entries(GLUE)) glue[k].value = v;
  const mu = ctx.createGain(); mu.gain.value = makeup;
  const clip = ctx.createWaveShaper(); clip.curve = softClipCurve(); clip.oversample = '4x';
  for (const b of Object.values(buses)) b.connect(mg);
  mg.connect(glue); glue.connect(mu); mu.connect(clip); clip.connect(ctx.destination);
  return { buses, master: mg, glue, makeup: mu, clip };
}
