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
    const k = 0.25 / Math.sqrt(s / n || 1);
    for (let i = 0; i < n; i++) d[i] *= k;
    for (let i = 0; i < f; i++) { const a = i / f; d[i] = d[i] * a + d[n - f + i] * (1 - a); } // seam: the first f samples now lead on from the last f
  }
  return (ctx._nb = { white: W, pink: P, brown: B, loopEnd: (n - f) / sr, len: n / sr });
}

// ---- envelopes: linear attack (0.4 ms at least, so nothing clicks), optional hold, exponential decay to -60 dB. Returns the time the voice is silent.
export const MIN_ATTACK = 0.0004;
export function env(param, t, a, h, d, g) {
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

/** Layers that repeat in many sounds do not stack: the later voice skips a layer whose family started inside its window (docs/AUDIO.md 3.3). Milliseconds. */
export const FAMILY_MS = { coin: 250, stamp: 1200, sparkle: 800, brass: 1500, bell: 1500, thump: 250 };
/** A noise layer is texture (a click, paper, air) unless it says it is the body of the sound (`main`): a secondary voice of a burst plays without its texture. */
export const isGhost = (L) => L.k === 'noise' && !L.main;

/**
 * One layer of a recipe, scheduled at time T (seconds in the context's clock). Returns the time the layer is silent.
 * k: tone | bank | noise. Common: t (offset), g (peak), a (attack), h (hold), d (decay to -60 dB), hp/lp/bp = [f0, Q, f1?], fam (layer family), ding (no register ding when dull).
 * o: { r: random source, jit: cents shared by the voice, srcs: array that collects every started source (to stop the voice early) }
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
    src.connect(gain); src.start(T, o.r() * (nb.loopEnd - 0.5)); src.stop(end + 0.03); srcs?.push(src);
    return end;
  }
  throw new Error('unknown layer ' + L.k);
}

/**
 * Plays a recipe's layers into `dest` at T0.
 * o: { seed, trim (dB), gainDb, pan, jitterCents, noJitter, lp (a voice-wide lowpass, Hz), skip (Set of layer families to leave out), secondary (no texture layers), dull (no ding layers) }
 * Returns { end (when everything is silent), gain (the voice gain), srcs, fams (the families it played), stop(t, fadeSec) }.
 */
export function voice(ctx, dest, layers, T0, o = {}) {
  const r = rng(o.seed ?? 1), jit = o.jit ?? (r() * 2 - 1) * (o.jitterCents ?? 7), vg = ctx.createGain();
  const gj = o.noJitter ? 0 : (r() * 2 - 1) * 0.7; // gain jitter, dB
  vg.gain.value = dB((o.trim || 0) + (o.gainDb || 0) + gj);
  let tail = vg;
  const lp = o.lp || (o.dull ? 3500 : 0);
  if (lp) { const q = ctx.createBiquadFilter(); q.type = 'lowpass'; q.frequency.value = lp; vg.connect(q); tail = q; }
  if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; tail.connect(p); p.connect(dest); } else tail.connect(dest);
  let end = T0;
  const srcs = [], fams = new Set(), oo = { r, jit, srcs };
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
export const wood = (f, t = 0, g = 0.5, d = 0.05) => [{ k: 'tone', f, t, a: 0.0008, d, g }, click(t, g * 0.5, 2400, 1.2, 0.012)];
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
 * The mid body of a refusal or a loss (docs/AUDIO.md 2.2): a laptop speaker has nothing under 150 Hz, so a "no" that lives in the lows is not heard. A sine at D4 (A3 is 220 Hz, under the line) and a knock
 * bandpassed at 300 to 600 Hz put at least 40% of the energy above 250 Hz without touching the low taps that make it read as a "no".
 */
export const body = (t = 0, g = 0.5, note = 'D4', d = 0.12) => [{ k: 'tone', f: note, t, a: 0.004, d: d * 1.4, g: g * 2 }, { k: 'noise', c: 'pink', t, a: 0.002, d: d * 0.6, g: g * 3, bp: [440, 0.9], main: true }];

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
