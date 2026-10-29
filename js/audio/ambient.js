// The ambient bed (docs/AUDIO.md section 6): sixteen beds of looped filtered noise and quiet drones in the key, four modifiers (night, rain, tariff, wealth) and eighteen sparse one-shots.
// Off by default (it is unsolicited), at the very bottom of the mix, and it carries no information that is not also drawn. Nothing here is created until the player turns it on.
// The data and the bed builder are pure Web Audio (they render offline for the audit); the controller at the bottom is driven by the engine through a small `host`.
import { hz, dB, noiseBuffers, fadeIn, click, gls, bellL, thump, wood, horn } from './palette.js';
import { TRIMS } from './trims.js';

/** A bed layer: { c: noise color, hp/lp/bp: [f, Q], g: level, lfo: [Hz, depth] slow swell, am: [Hz, depth] fast pulse } or { drone: note, g }. Levels are linear before the bed's trim. */
export const BEDS = {
  scrap: { name: 'The Scrap Yard', layers: [{ c: 'brown', lp: [450, 0.7], g: 0.6, lfo: [0.06, 0.5] }, { c: 'pink', bp: [1800, 2], g: 0.1, lfo: [0.21, 0.9] }, { c: 'white', hp: [2500, 0.7], g: 0.04, am: [11, 0.95] }, { drone: 'D2', g: 0.05 }], note: 'wind over metal, a fire-barrel crackle' },
  market: { name: 'Flea Market Row', layers: [{ c: 'pink', bp: [600, 0.7], g: 0.5, lfo: [0.4, 0.5] }, { c: 'pink', bp: [1400, 1], g: 0.3, lfo: [0.7, 0.6] }, { c: 'pink', bp: [2800, 1], g: 0.14, lfo: [1.1, 0.7] }, { c: 'white', hp: [6000, 0.7], g: 0.02, lfo: [0.3, 0.5] }], note: 'a crowd: three babble bands, cloth rustle' },
  campus: { name: 'Campus Quad', layers: [{ c: 'pink', lp: [900, 0.7], g: 0.35, lfo: [0.09, 0.4] }, { c: 'pink', bp: [1000, 1], g: 0.15, lfo: [0.5, 0.6] }, { c: 'white', hp: [5000, 0.7], g: 0.012, lfo: [0.2, 0.7] }], note: 'a breeze and distant chatter; birds come as one-shots' },
  pawn: { name: 'Pawn District', layers: [{ c: 'pink', lp: [700, 0.7], g: 0.25, lfo: [0.08, 0.3] }, { drone: 'D2', g: 0.1 }, { drone: 'A2', g: 0.06 }, { c: 'white', hp: [5000, 0.7], g: 0.012, am: [6, 0.4] }], note: 'a neon hum' },
  metro: { name: 'Metro Hub', layers: [{ c: 'brown', lp: [300, 0.7], g: 0.7, lfo: [0.05, 0.3] }, { c: 'pink', bp: [900, 0.6], g: 0.3, lfo: [0.17, 0.5] }, { c: 'pink', bp: [3000, 1], g: 0.08, lfo: [0.31, 0.9] }, { drone: 'A2', g: 0.04 }], note: 'traffic rumble, a city wash, cars passing' },
  estate: { name: 'Estate Sales', layers: [{ c: 'pink', lp: [500, 0.7], g: 0.18, lfo: [0.04, 0.2] }, { c: 'pink', bp: [2500, 1], g: 0.02, lfo: [0.1, 0.5] }, { drone: 'D3', g: 0.03 }], note: 'room tone; a chime now and then' },
  auto: { name: 'Auto Row', layers: [{ c: 'brown', lp: [200, 0.7], g: 0.6, am: [22, 0.35] }, { c: 'pink', bp: [1200, 1], g: 0.15, lfo: [0.3, 0.5] }, { c: 'white', hp: [6000, 0.7], g: 0.04, am: [7, 0.6] }], note: 'an engine at idle, compressor hiss' },
  harbor: { name: 'Harbor Docks', layers: [{ c: 'pink', lp: [700, 0.7], g: 0.5, lfo: [0.11, 0.8] }, { c: 'white', bp: [2600, 0.6], g: 0.07, lfo: [0.11, 0.8] }, { c: 'brown', lp: [150, 0.7], g: 0.3 }, { drone: 'A2', g: 0.03 }], note: 'waves that swell every 9 s; gulls, a buoy, a ship horn' },
  industrial: { name: 'Industrial Park', layers: [{ c: 'brown', lp: [180, 0.7], g: 0.55 }, { drone: 'D2', g: 0.12 }, { drone: 'A2', g: 0.06 }, { c: 'pink', bp: [600, 1], g: 0.2, lfo: [2, 0.4] }, { c: 'white', hp: [4500, 0.7], g: 0.03, lfo: [0.15, 0.6] }], note: 'machine hum, a conveyor at 2 Hz, steam' },
  tech: { name: 'Tech Corridor', layers: [{ c: 'white', bp: [9000, 1], g: 0.02 }, { drone: 'D2', g: 0.08 }, { c: 'pink', lp: [600, 0.7], g: 0.12, lfo: [0.07, 0.3] }], note: 'server air; blips as one-shots' },
  farm: { name: 'Farmland Co-op', layers: [{ c: 'pink', lp: [800, 0.7], g: 0.3, lfo: [0.08, 0.6] }, { c: 'white', bp: [5000, 3], g: 0.03, am: [28, 0.9] }, { c: 'brown', lp: [120, 0.7], g: 0.2, am: [6, 0.3] }], note: 'wind in grass, insects, a far tractor; wind chimes' },
  creative: { name: 'Creative Quarter', layers: [{ c: 'pink', lp: [1200, 0.7], g: 0.15, lfo: [0.1, 0.4] }, { drone: 'D3', g: 0.03 }, { drone: 'A3', g: 0.03 }, { drone: 'E4', g: 0.025 }, { drone: 'F#4', g: 0.025 }, { c: 'pink', bp: [2000, 1], g: 0.05, lfo: [0.3, 0.6] }], note: 'a soft D add9 pad, a studio hum' },
  corporate: { name: 'Corporate Valley', layers: [{ c: 'pink', lp: [1200, 0.7], g: 0.3, lfo: [0.05, 0.2] }, { c: 'white', hp: [7000, 0.7], g: 0.02 }, { drone: 'A2', g: 0.04 }], note: 'air conditioning; an elevator ding' },
  finance: { name: 'Financial District', layers: [{ c: 'pink', bp: [1000, 1], g: 0.35, lfo: [0.6, 0.5] }, { c: 'white', bp: [3200, 0.7], g: 0.05, am: [14, 0.9] }, { drone: 'D2', g: 0.04 }], note: 'a trading floor, ticker chatter, a phone' },
  realty: { name: 'Real Estate Row', layers: [{ c: 'pink', lp: [700, 0.7], g: 0.25, lfo: [0.07, 0.4] }, { c: 'pink', bp: [2500, 1], g: 0.06, am: [4, 0.8] }, { c: 'brown', lp: [200, 0.7], g: 0.15 }], note: 'wind, a sprinkler, a hammer far away' },
  exchange: { name: 'Global Exchange', layers: [{ c: 'pink', bp: [800, 0.5], g: 0.5, lfo: [0.2, 0.4] }, { c: 'pink', bp: [2000, 1], g: 0.2, lfo: [0.35, 0.5] }, { c: 'white', hp: [5000, 0.7], g: 0.03, am: [3, 0.8] }, { drone: 'D2', g: 0.06 }, { drone: 'A2', g: 0.05 }, { drone: 'F#3', g: 0.03 }], note: 'a vast hall, a departures board' },
};
export const BED_IDS = Object.keys(BEDS);

/** Modifiers add layers to the current bed, faded in over 4 s; the bed itself is not re-normalized. */
export const MODS = {
  night: [{ c: 'white', bp: [4300, 12], g: 0.03, am: [30, 1] }], // crickets: a narrow noise band chirping (no pitch to put out of key)
  rain: [{ c: 'white', hp: [1500, 0.7], lp: [9000, 0.7], g: 0.07 }, { c: 'brown', lp: [140, 0.7], g: 0.1, lfo: [0.05, 0.6] }],
  tariff: [{ drone: 'A2', g: 0.05 }, { drone: 'E3', g: 0.03 }, { c: 'pink', bp: [400, 4], g: 0.02, lfo: [0.2, 0.8] }],
  wealth3: [{ drone: 'D3', g: 0.02 }, { drone: 'A3', g: 0.02 }, { drone: 'E4', g: 0.015 }, { drone: 'F#4', g: 0.015 }],
};

/** The cases the audit renders: every bed alone, and the modifiers on the beds that show them best. */
export const BED_CASES = BED_IDS.map((id) => [id, []]).concat([['harbor', ['night']], ['metro', ['rain']], ['scrap', ['tariff']], ['exchange', ['wealth3']], ['farm', ['night', 'rain']]]);

const FILTERS = [['hp', 'highpass'], ['lp', 'lowpass'], ['bp', 'bandpass']];
/** One bed layer into `sum`, started at T. A looped noise source or a drone, through its filter, with at most one slow oscillator on its level. Returns the sources, for stopping. */
function bedLayer(ctx, sum, L, T, stopAt) {
  const nb = noiseBuffers(ctx), g = ctx.createGain(), srcs = []; g.gain.value = L.g;
  let node = g;
  const go = (s) => { s.start(T); if (stopAt) s.stop(stopAt); srcs.push(s); };
  if (L.drone) {
    const o = ctx.createOscillator(); o.frequency.value = hz(L.drone); o.detune.value = 3 * (L.drone.length % 3 - 1); o.connect(g); go(o);
  } else {
    const src = ctx.createBufferSource(); src.buffer = nb[L.c]; src.loop = true; src.loopStart = 0; src.loopEnd = nb.loopEnd; src.connect(g); src.start(T, 0.3); if (stopAt) src.stop(stopAt); srcs.push(src);
  }
  for (const [key, type] of FILTERS) if (L[key]) { const q = ctx.createBiquadFilter(); q.type = type; q.frequency.value = L[key][0]; q.Q.value = L[key][1]; node.connect(q); node = q; }
  const spec = L.lfo || L.am; // a level moved by a low-rate oscillator: gain swings between 1 - depth and 1
  if (spec) {
    const am = ctx.createGain(); am.gain.value = 1 - spec[1] / 2;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = spec[0]; lg.gain.value = spec[1] / 2; lfo.connect(lg); lg.connect(am.gain); go(lfo);
    node.connect(am); node = am;
  }
  node.connect(sum);
  return srcs;
}
/** A group of layers behind one fade gain. Texture (noise) layers and drones sum apart so the night can move them against each other. */
function layerGroup(ctx, layers, T, stopAt) {
  const tex = ctx.createGain(), dr = ctx.createGain(), srcs = [];
  for (const L of layers) srcs.push(...bedLayer(ctx, L.drone ? dr : tex, L, T, stopAt));
  return { tex, dr, srcs };
}

/**
 * A bed into `out`. opts: { T (start), dur (stop after, for an offline render), mods: [names], trimDb, night 0..1, rain, surge, tier (1..4: wealth) }.
 * Graph: layers -> texture and drone sums -> pre -> lowpass (night, rain, surge) -> bed gain (trim and fades) -> out. Returns a handle: { gain, lp, tex, dr, mods, setNight, setMods, stop }.
 */
export function buildBed(ctx, out, theme, opts = {}) {
  const T = opts.T ?? ctx.currentTime, stopAt = opts.dur ? T + opts.dur : 0;
  const def = BEDS[theme];
  if (!def) return null;
  const bedGain = ctx.createGain(), lp = ctx.createBiquadFilter(), pre = ctx.createGain();
  lp.type = 'lowpass'; lp.frequency.value = 9000; lp.Q.value = 0.5;
  bedGain.gain.value = dB(opts.trimDb ?? TRIMS.beds?.[theme] ?? 0);
  const dc = ctx.createBiquadFilter(); dc.type = 'highpass'; dc.frequency.value = 30; dc.Q.value = 0.7; // nothing under 30 Hz: a speaker cannot play it and noise carries a drift there that is a DC offset
  pre.connect(lp); lp.connect(dc); dc.connect(bedGain); bedGain.connect(out);
  const base = layerGroup(ctx, def.layers, T, stopAt);
  base.tex.connect(pre); base.dr.connect(pre);
  const bed = { theme, gain: bedGain, lp, pre, tex: base.tex, dr: base.dr, srcs: [...base.srcs], mods: new Map(), extra: [], night: 0, rain: false, surge: false, out };
  bed.setNight = (night, rain = bed.rain, surge = bed.surge, at = ctx.currentTime) => { // the lowpass falls from 9 kHz to 3.5 kHz with the night; rain closes it by a quarter, a surge opens it by a fifth
    bed.night = night; bed.rain = rain; bed.surge = surge;
    const cutoff = (9000 - 5500 * night) * (rain ? 0.75 : 1) * (surge ? 1.2 : 1);
    lp.frequency.setTargetAtTime(cutoff, at, 1.0);
    bed.tex.gain.setTargetAtTime(dB(-2 * night + (surge ? 1.5 : 0)), at, 1.0);
    bed.dr.gain.setTargetAtTime(dB(2 * night), at, 1.0);
  };
  bed.addMod = (name, at = ctx.currentTime, fade = 4) => {
    if (bed.mods.has(name) || !MODS[name]) return;
    const g = ctx.createGain(); fadeIn(g.gain, at, fade, 1);
    const grp = layerGroup(ctx, MODS[name], at, 0);
    grp.tex.connect(g); grp.dr.connect(g); g.connect(pre);
    bed.mods.set(name, { gain: g, srcs: grp.srcs });
  };
  bed.removeMod = (name, at = ctx.currentTime, fade = 4) => {
    const m = bed.mods.get(name); if (!m) return;
    bed.mods.delete(name);
    m.gain.gain.cancelScheduledValues(at); m.gain.gain.setValueAtTime(Math.max(0.0001, m.gain.gain.value), at); m.gain.gain.linearRampToValueAtTime(0.0001, at + fade);
    for (const s of m.srcs) { try { s.stop(at + fade + 0.05); } catch { /* already stopped */ } }
  };
  bed.hall = () => { // tier 4: a very quiet feedback delay (two combs at 61 and 83 ms, feedback 0.3, lowpassed at 3 kHz, wet at -30 dB) gives the bed a hall
    if (bed.extra.length) return;
    const wet = ctx.createGain(); wet.gain.value = dB(-30); wet.connect(out);
    for (const ms of [61, 83]) {
      const d = ctx.createDelay(0.2), fb = ctx.createGain(), f = ctx.createBiquadFilter();
      d.delayTime.value = ms / 1000; fb.gain.value = 0.3; f.type = 'lowpass'; f.frequency.value = 3000;
      lp.connect(d); d.connect(f); f.connect(fb); fb.connect(d); f.connect(wet);
      bed.extra.push(d, fb, f);
    }
    bed.extra.push(wet);
  };
  for (const m of opts.mods || []) { // offline renders: modifiers are on from the start
    if (!MODS[m]) continue;
    const grp = layerGroup(ctx, MODS[m], T, stopAt);
    grp.tex.connect(pre); grp.dr.connect(pre); bed.srcs.push(...grp.srcs);
  }
  if (opts.night != null || opts.rain || opts.surge) bed.setNight(opts.night ?? 0, !!opts.rain, !!opts.surge, T);
  bed.layers = def.layers.length + (opts.mods || []).reduce((n, m) => n + (MODS[m]?.length || 0), 0);
  bed.stop = (at, fade = 2) => { // fade out, then stop every source (so nothing keeps running under a hidden bed)
    bedGain.gain.cancelScheduledValues(at); bedGain.gain.setValueAtTime(Math.max(0.0001, bedGain.gain.value), at); bedGain.gain.linearRampToValueAtTime(0.0001, at + fade);
    const all = [...bed.srcs, ...[...bed.mods.values()].flatMap((m) => m.srcs)];
    for (const s of all) { try { s.stop(at + fade + 0.05); } catch { /* already stopped */ } }
    bed.stopped = at + fade + 0.05;
  };
  return bed;
}

// ---- one-shots: sparse sounds on top of the bed, each in the key, each at -32 dB active level on the ambient bus
const chirp = (f, f2, t, g = 0.18) => ({ k: 'tone', f, f2, gl: 0.04, t, a: 0.004, d: 0.05, g, vib: [30, 40] });
/** where: the beds that carry it; when: 'day' (not at night), 'night', 'rain' (a credit crunch) or 'any'. every: the window in seconds. */
export const ONE_SHOTS = [
  { id: 'amb.clank', where: ['scrap', 'industrial'], when: 'any', every: [14, 40], recipe: 'distant metal tap: bank D4 with partials 3 and 5, lowpass 3 kHz', dur: 0.8, build: () => [{ k: 'bank', f: 'D4', a: 0.001, g: 0.3, p: [[1, 1, 0.4], [3, 0.5, 0.18], [5, 0.2, 0.1]], lp: [3000, 0.7] }, click(0, 0.1, 1800)] },
  { id: 'amb.bike-bell', where: ['market', 'campus'], when: 'any', every: [20, 60], recipe: 'two bright dings A6', dur: 0.9, build: () => [bellL('A6', 0, 0.22, 0.4), bellL('A6', 0.16, 0.2, 0.5)] },
  { id: 'amb.chirp', where: ['campus', 'realty', 'farm'], when: 'day', every: [8, 25], recipe: 'three short bird chirps gliding D6 to A6 to F#6 with a fast vibrato', dur: 0.5, build: () => [chirp('D6', 'A6', 0), chirp('A6', 'F#6', 0.09, 0.15), chirp('D6', 'A6', 0.18, 0.12)] },
  { id: 'amb.door-bell', where: ['pawn', 'realty', 'estate'], when: 'any', every: [25, 80], recipe: 'a single unpitched mechanical bell, far and soft: a lowpassed (2 kHz) strike with a short ring (not buyer.arrive: no D6, no A5)', dur: 0.9,
    build: () => [{ k: 'noise', c: 'white', a: 0.0008, d: 0.05, g: 1.4, bp: [1500, 1.2], lp: [2000, 0.7] }, { k: 'noise', c: 'white', a: 0.001, d: 0.5, g: 0.5, bp: [1350, 14], lp: [2000, 0.7], main: true }, { k: 'noise', c: 'white', t: 0.01, a: 0.001, d: 0.38, g: 0.35, bp: [2250, 16], lp: [2000, 0.7], main: true }] },
  { id: 'amb.gull', where: ['harbor'], when: 'day', every: [12, 40], recipe: 'a gull cry: A5 up to D6 and back over 400 ms with 6 Hz vibrato', dur: 0.7, build: () => [{ k: 'tone', f: 'A5', f2: 'D6', gl: 0.18, a: 0.03, d: 0.3, g: 0.14, vib: [6, 60], type: 'triangle', lp: [3500, 0.7] }] },
  { id: 'amb.buoy', where: ['harbor'], when: 'any', every: [15, 45], recipe: 'a slow buoy bell A3, long decay', dur: 2.2, build: () => [bellL('A3', 0, 0.3, 1.8, { lp: [2500, 0.7] })] },
  { id: 'amb.horn', where: ['harbor'], when: 'any', every: [60, 140], recipe: 'a far ship horn E2 and B2 (a fifth) with an air layer, 1.6 s, lowpassed (not the freight horn D2 D3)', dur: 2.2,
    build: () => [...horn('B2', 'E2', 0, 0.28, 1.0, 0.6), { k: 'noise', c: 'pink', a: 0.3, h: 0.6, d: 0.7, g: 0.08, lp: [600, 0.7], main: true }] },
  { id: 'amb.steam', where: ['industrial', 'auto'], when: 'any', every: [10, 35], recipe: 'a steam burst: noise above 2.5 kHz, 450 ms', dur: 0.8, build: () => [{ k: 'noise', c: 'pink', a: 0.04, d: 0.45, g: 0.5, bp: [2500, 0.8, 1200], main: true }] },
  { id: 'amb.blip', where: ['tech'], when: 'any', every: [10, 30], recipe: 'three quick sine blips D6 A6 F#6', dur: 0.4, build: () => [['D6', 0], ['A6', 0.07], ['F#6', 0.14]].map(([n, t]) => ({ k: 'tone', f: n, t, a: 0.002, d: 0.06, g: 0.14 })) },
  { id: 'amb.windchime', where: ['farm', 'estate', 'creative'], when: 'any', every: [12, 40], recipe: 'three or four glass notes from D6 E6 F#6 A6 B6, irregularly spaced, 1.2 s tails', dur: 2.0, build: () => [['F#6', 0], ['D6', 0.31], ['A6', 0.52], ['E6', 1.0]].map(([n, t]) => gls(n, t, 0.17, 1.0)) },
  { id: 'amb.shutter', where: ['creative'], when: 'any', every: [20, 60], recipe: 'a camera shutter: two ticks 60 ms apart', dur: 0.3, build: () => [click(0, 0.35, 3600), click(0.06, 0.3, 2800), thump('D3', 'D3', 0.01, 0.15, 0.03)] },
  { id: 'amb.phone', where: ['corporate', 'finance'], when: 'any', every: [25, 70], recipe: 'a distant two-tone ring D5 and A5, rising, lowpass 2.5 kHz (not the warning pair A4 F#4)', dur: 1.1, build: () => Array.from({ length: 6 }, (_, i) => ({ k: 'tone', f: i % 2 ? 'A5' : 'D5', t: i * 0.07, a: 0.003, d: 0.06, g: 0.1, lp: [2500, 0.7] })) },
  { id: 'amb.flap', where: ['exchange', 'finance'], when: 'any', every: [12, 35], recipe: 'a departures board: fourteen ticks 25 ms apart, fading', dur: 0.6, build: () => Array.from({ length: 14 }, (_, i) => click(i * 0.025, 0.3 * (1 - i / 16), 2200 + (i % 4) * 300, 1.6, 0.008)) },
  { id: 'amb.hammer', where: ['realty', 'auto'], when: 'any', every: [15, 50], recipe: 'three far knocks, 400 ms apart', dur: 1.4, build: () => [0, 0.4, 0.8].flatMap((t) => [...wood('D3', t, 0.28, 0.06)]) },
  { id: 'amb.cricket', where: ['*'], when: 'night', every: [6, 18], recipe: 'a burst of cricket chirps: 4.3 kHz noise band pulsing at 30 Hz, three bursts', dur: 0.7, build: () => [0, 0.14, 0.28].map((t) => ({ k: 'noise', c: 'white', t, a: 0.01, d: 0.09, g: 0.9, bp: [4300, 14], am: [30, 1], main: true })) },
  { id: 'amb.thunder', where: ['*'], when: 'rain', every: [40, 90], recipe: 'a rumble: brown noise below 160 Hz swelling over 400 ms and fading over 2 s', dur: 2.8, build: () => [{ k: 'noise', c: 'brown', a: 0.4, d: 2.0, g: 0.8, lp: [200, 0.7, 90], main: true }] },
  { id: 'amb.chime', where: ['estate', 'campus'], when: 'any', every: [30, 90], recipe: 'a far tower chime: a single E4 bell with a long lowpassed tail (not day.turn: no D4 A4 glass pair)', dur: 2.2, build: () => [bellL('E4', 0, 0.26, 1.7, { lp: [1800, 0.7] })] },
  { id: 'amb.pluck', where: ['creative'], when: 'any', every: [20, 60], recipe: 'a soft guitar-like pluck on a pentatonic note, fast decay', dur: 0.9, build: () => [{ k: 'tone', f: 'A3', type: 'triangle', a: 0.002, d: 0.5, g: 0.2, lp: [2000, 0.8, 600] }, click(0, 0.1, 2000)] },
];
export const ONE_SHOT_IDS = ONE_SHOTS.map((o) => o.id);
const flatL = (x) => x.flat(Infinity).filter(Boolean);
export const oneShotLayers = (id) => flatL(ONE_SHOTS.find((o) => o.id === id)?.build() || []);

// ---- the controller: a bed per district, a crossfade between them, modifiers, and one timer chain for the one-shots
export const AMB = { MAX_PER_MIN: 3, MIN_GAP: 4000, AFTER_MEDIUM: 1500, AFTER_MOMENT: 6000, FADE_IN: 3, FADE_OUT: 2, OVER_FADE: 4, SPEED_GAP: { 4: 40000 } };

/** The latest state, normalized: what a bad value does is nothing. */
export function normState(s) {
  const o = s && typeof s === 'object' ? s : {};
  const num = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
  return {
    zone: o.zone ?? null, theme: typeof o.theme === 'string' && Object.hasOwn(BEDS, o.theme) ? o.theme : null, tier: Math.round(num(o.tier, 0, 4, 1)),
    night: Math.round(num(o.night, 0, 1, 0) * 4) / 4, rain: !!o.rain, surge: !!o.surge, tariff: !!o.tariff, paused: !!o.paused, speed: num(o.speed, 0, 1000, 1),
    dialog: !!o.dialog, over: !!o.over, sandbox: !!o.sandbox,
  };
}
export const stateSig = (s) => [s.theme, s.tier, s.night, +s.rain, +s.surge, +s.tariff, +s.paused, s.speed, +s.dialog, +s.over, +s.sandbox].join('|');
/** Which one-shots a state allows, and how much their window is stretched by the speed (3.4.5: one per 40 s at 4x, none from 16x, none while paused). */
export function allowedShots(s) {
  if (!s.theme || s.paused || s.speed >= 16 || s.over || s.sandbox) return [];
  const stretch = s.speed >= 4 ? 40 / 25 : 1; // roughly: the windows are stretched so that the whole chain stays under one per 40 s
  return ONE_SHOTS.filter((o) => (o.where[0] === '*' || o.where.includes(s.theme)) && (o.when === 'any' || (o.when === 'day' && s.night < 0.5) || (o.when === 'night' && s.night >= 0.5) || (o.when === 'rain' && s.rain))).map((o) => ({ o, stretch }));
}
/** The rate rule (6.4): at most 3 a minute overall, 4 s between any two, none within 1.5 s after a game sound of tier medium or above, none within 6 s after a moment, none in a dialog. */
export function shotAllowed(h, now) {
  if (h.dialog) return false;
  if (h.shots.filter((t) => now - t < 60000).length >= AMB.MAX_PER_MIN) return false;
  if (h.shots.length && now - h.shots[h.shots.length - 1] < AMB.MIN_GAP) return false;
  if (now - h.lastMedium < AMB.AFTER_MEDIUM) return false;
  if (now - h.lastMoment < AMB.AFTER_MOMENT) return false;
  return true;
}

/**
 * host: { ctx(), out() (the ambient bus), enabled(), running(), now() (ms), random(), setTimeout, clearTimeout, duck(db), dialogOpen(), lastMedium(), lastMoment(), shot(id, layers, pan) }
 * Nothing exists while ambient is off: no timer, no node.
 */
export function createAmbient(host) {
  let state = normState(null), have = false, bed = null, olds = [], timer = null, sig = '';
  const due = new Map(), shots = [];
  const c = { stats: { beds: 0, shots: 0, skipped: 0 } };
  const rand = (a, b) => a + host.random() * (b - a);
  function clearT() { if (timer != null) { host.clearTimeout(timer); timer = null; } }
  function fadeOut(b, fade) { try { b.stop(host.ctx().currentTime, fade); } catch { /* context gone */ } }
  function reap() { const t = host.ctx()?.currentTime ?? 0; olds = olds.filter((b) => (b.stopped || 0) > t); }
  function wanted() { return have && host.enabled() && host.running() && !state.sandbox && !state.over && !!state.theme; }
  function adjust() {
    const t = host.ctx().currentTime;
    bed.setNight(state.night, state.rain, state.surge, t);
    const want = { night: state.night >= 0.5, rain: state.rain, tariff: state.tariff, wealth3: state.tier >= 3 };
    for (const m of Object.keys(want)) if (want[m]) bed.addMod(m, t, 4); else bed.removeMod(m, t, 4);
    if (state.tier >= 4) bed.hall();
    host.duck(state.dialog ? -6 : state.paused ? -3 : 0); // the bed ducks while a dialog is open or the clock is paused (3.5)
  }
  function crossfade() {
    const ctx = host.ctx(), t = ctx.currentTime;
    if (bed) { fadeOut(bed, AMB.FADE_OUT); olds.push(bed); }
    reap(); while (olds.length > 1) { const o = olds.shift(); try { o.stop(t, 0.05); } catch { /* gone */ } } // at most two beds exist at once
    bed = buildBed(ctx, host.out(), state.theme, { T: t });
    if (!bed) return;
    const target = bed.gain.gain.value;
    bed.gain.gain.cancelScheduledValues(t); fadeIn(bed.gain.gain, t, AMB.FADE_IN, target);
    c.stats.beds++;
    due.clear();
  }
  function schedule() {
    clearT();
    if (!wanted() || !bed) return;
    const now = host.now(), list = allowedShots(state);
    let next = Infinity;
    for (const { o, stretch } of list) {
      if (!due.has(o.id)) due.set(o.id, now + rand(o.every[0], o.every[1]) * 1000 * stretch);
      next = Math.min(next, due.get(o.id));
    }
    if (next === Infinity) return;
    timer = host.setTimeout(fire, Math.max(50, next - now));
  }
  function fire() {
    timer = null;
    if (!wanted() || !bed) return;
    const now = host.now(), list = allowedShots(state), ready = list.filter(({ o }) => (due.get(o.id) ?? Infinity) <= now);
    const h = { shots, lastMedium: host.lastMedium(), lastMoment: host.lastMoment(), dialog: state.dialog || host.dialogOpen() };
    if (ready.length) {
      if (shotAllowed(h, now)) {
        const { o, stretch } = ready[Math.floor(host.random() * ready.length)];
        shots.push(now); if (shots.length > 8) shots.shift();
        due.set(o.id, now + rand(o.every[0], o.every[1]) * 1000 * stretch);
        c.stats.shots++;
        try { host.shot(o.id, flatL(o.build()), (host.random() * 2 - 1) * 0.5); } catch { /* a recipe that throws is dropped */ }
      } else {
        c.stats.skipped++;
        for (const { o } of ready) due.set(o.id, now + rand(1500, 6000)); // try again after a pause; the allowed shots do not pile up
      }
    }
    schedule();
  }
  c.set = (s) => { state = normState(s); have = true; c.apply(); };
  c.apply = () => {
    if (!have) return;
    if (!wanted()) { clearT(); if (bed) { fadeOut(bed, host.enabled() && state.over ? AMB.OVER_FADE : 0.6); olds.push(bed); bed = null; sig = ''; } return; }
    try {
      if (!bed || bed.theme !== state.theme) crossfade();
      if (!bed) return;
      const s = stateSig(state);
      if (s !== sig) { sig = s; adjust(); }
      if (timer == null) schedule();
    } catch { clearT(); }
  };
  c.stop = (fade = 0.3) => { clearT(); if (bed) { fadeOut(bed, fade); olds.push(bed); bed = null; sig = ''; } for (const o of olds) fadeOut(o, fade); due.clear(); };
  c.pause = () => { clearT(); };
  c.playing = () => !!bed;
  c.theme = () => bed?.theme || null;
  c.has = () => have;
  c.timerActive = () => timer != null;
  c.state = () => state;
  return c;
}

