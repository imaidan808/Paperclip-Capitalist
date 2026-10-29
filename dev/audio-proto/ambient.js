// The ambient bed: looped filtered noise (three shared buffers), a few in-key drones, and sparse one-shots. Prototype for docs/AUDIO.md.
import { noiseBuffers, hz, dB, rng } from './synth.js';
import { gls, bellL, mar, click, wood, thump, paper, swoosh, horn, sparkle } from './sounds.js';

/** A bed layer: { c: noise colour, hp/lp/bp: [f, Q], g: level, lfo: [Hz, depth] slow level movement, am: [Hz, depth] fast (texture) } or { drone: note, g }. */
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

/** Modifiers: night, rain (credit crunch), tariff, and wealth (1 to 4) add layers; the bed itself is unchanged. */
export const MODS = {
  night: [{ c: 'white', bp: [4300, 12], g: 0.03, am: [30, 1] }], // crickets (a narrow noise band chirping: no pitch to put out of key)
  rain: [{ c: 'white', hp: [1500, 0.7], lp: [9000, 0.7], g: 0.07 }, { c: 'brown', lp: [140, 0.7], g: 0.1, lfo: [0.05, 0.6] }],
  tariff: [{ drone: 'A2', g: 0.05 }, { drone: 'E3', g: 0.03 }, { c: 'pink', bp: [400, 4], g: 0.02, lfo: [0.2, 0.8] }],
  wealth3: [{ drone: 'D3', g: 0.02 }, { drone: 'A3', g: 0.02 }, { drone: 'E4', g: 0.015 }, { drone: 'F#4', g: 0.015 }],
};

/** One bed layer into the graph. Returns the stop time. dur is in seconds; the sources loop. */
export function bedLayer(ctx, out, L, T, dur) {
  const nb = noiseBuffers(ctx), g = ctx.createGain(); g.gain.value = L.g;
  let node = g;
  if (L.drone) {
    const o = ctx.createOscillator(); o.frequency.value = hz(L.drone); o.detune.value = 3 * (L.drone.length % 3 - 1); o.connect(g); o.start(T); o.stop(T + dur);
  } else {
    const src = ctx.createBufferSource(); src.buffer = nb[L.c]; src.loop = true; src.loopEnd = nb.loopEnd; src.connect(g); src.start(T, 0.3); src.stop(T + dur);
  }
  for (const [key, type] of [['hp', 'highpass'], ['lp', 'lowpass'], ['bp', 'bandpass']]) if (L[key]) { const q = ctx.createBiquadFilter(); q.type = type; q.frequency.value = L[key][0]; q.Q.value = L[key][1]; node.connect(q); node = q; }
  const mod = (spec, base) => { // a level moved by a low-rate oscillator: gain = (1 - depth) + depth * (0.5 + 0.5 sin)
    const am = ctx.createGain(); am.gain.value = 1 - spec[1];
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = spec[0]; lg.gain.value = spec[1] / 2; lfo.connect(lg); lg.connect(am.gain); lfo.start(T); lfo.stop(T + dur);
    node.connect(am); node = am;
  };
  if (L.lfo) mod(L.lfo); if (L.am) mod(L.am);
  node.connect(out);
  return T + dur;
}
export function bed(ctx, out, name, T, dur, mods = []) {
  const layers = [...BEDS[name].layers, ...mods.flatMap((m) => MODS[m])];
  const sum = ctx.createGain(); sum.gain.value = 1; sum.connect(out);
  for (const L of layers) bedLayer(ctx, sum, L, T, dur);
  return layers.length;
}

// ---- one-shots (sparse, random in time; each also in the key)
const chirp = (f, f2, t, g = 0.18) => ({ k: 'tone', f, f2, gl: 0.04, t, a: 0.004, d: 0.05, g, vib: [30, 40] });
export const ONE_SHOTS = [
  { id: 'amb.clank', theme: 'scrap, industrial', every: [14, 40], recipe: 'distant metal tap: bank D4 with partials 3 and 5, lowpass 3 kHz', dur: 0.8, build: () => [{ k: 'bank', f: 'D4', a: 0.001, g: 0.3, p: [[1, 1, 0.4], [3, 0.5, 0.18], [5, 0.2, 0.1]], lp: [3000, 0.7] }, click(0, 0.1, 1800)] },
  { id: 'amb.bike-bell', theme: 'market, campus', every: [20, 60], recipe: 'two bright dings A6', dur: 0.9, build: () => [bellL('A6', 0, 0.22, 0.4), bellL('A6', 0.16, 0.2, 0.5)] },
  { id: 'amb.chirp', theme: 'campus, realty, farm (day)', every: [8, 25], recipe: 'three short bird chirps gliding D6 to A6 to F#6 with a fast vibrato', dur: 0.5, build: () => [chirp('D6', 'A6', 0), chirp('A6', 'F#6', 0.09, 0.15), chirp('D6', 'A6', 0.18, 0.12)] },
  { id: 'amb.door-bell', theme: 'pawn, realty, estate', every: [25, 80], recipe: 'the shop bell D6 then A5, far and soft (lowpass 3 kHz)', dur: 1.0, build: () => [bellL('D6', 0, 0.2, 0.35, { lp: [3000, 0.7] }), bellL('A5', 0.12, 0.2, 0.45, { lp: [3000, 0.7] })] },
  { id: 'amb.gull', theme: 'harbor (day)', every: [12, 40], recipe: 'a gull cry: A5 up to D6 and back over 400 ms with 6 Hz vibrato', dur: 0.7, build: () => [{ k: 'tone', f: 'A5', f2: 'D6', gl: 0.18, a: 0.03, d: 0.3, g: 0.14, vib: [6, 60], type: 'triangle', lp: [3500, 0.7] }] },
  { id: 'amb.buoy', theme: 'harbor', every: [15, 45], recipe: 'a slow buoy bell A3, long decay', dur: 2.2, build: () => [bellL('A3', 0, 0.3, 1.8, { lp: [2500, 0.7] })] },
  { id: 'amb.horn', theme: 'harbor', every: [60, 140], recipe: 'a far ship horn D2 and D3, 1.6 s, lowpassed', dur: 2.4, build: () => horn('D3', 'D2', 0, 0.28, 1.0, 0.6) },
  { id: 'amb.steam', theme: 'industrial, auto', every: [10, 35], recipe: 'a steam burst: noise above 2.5 kHz, 450 ms', dur: 0.8, build: () => [{ k: 'noise', c: 'pink', a: 0.04, d: 0.45, g: 0.5, bp: [2500, 0.8, 1200] }] },
  { id: 'amb.blip', theme: 'tech', every: [10, 30], recipe: 'three quick sine blips D6 A6 F#6', dur: 0.4, build: () => [['D6', 0], ['A6', 0.07], ['F#6', 0.14]].map(([n, t]) => ({ k: 'tone', f: n, t, a: 0.002, d: 0.06, g: 0.14 })) },
  { id: 'amb.windchime', theme: 'farm, estate, creative', every: [12, 40], recipe: 'three or four glass notes from D6 E6 F#6 A6 B6, irregularly spaced, 1.2 s tails', dur: 2.0, build: () => [['F#6', 0], ['D6', 0.31], ['A6', 0.52], ['E6', 1.0]].map(([n, t]) => gls(n, t, 0.17, 1.0)) },
  { id: 'amb.shutter', theme: 'creative', every: [20, 60], recipe: 'a camera shutter: two ticks 60 ms apart', dur: 0.3, build: () => [click(0, 0.35, 3600), click(0.06, 0.3, 2800), thump('D3', 'D3', 0.01, 0.15, 0.03)] },
  { id: 'amb.phone', theme: 'corporate, finance', every: [25, 70], recipe: 'a distant two-tone ring A5 F#5 x4, lowpass 2.5 kHz', dur: 1.1, build: () => Array.from({ length: 6 }, (_, i) => ({ k: 'tone', f: i % 2 ? 'F#5' : 'A5', t: i * 0.07, a: 0.003, d: 0.06, g: 0.1, lp: [2500, 0.7] })) },
  { id: 'amb.flap', theme: 'exchange, finance', every: [12, 35], recipe: 'a departures board: fourteen ticks 25 ms apart, fading', dur: 0.6, build: () => Array.from({ length: 14 }, (_, i) => click(i * 0.025, 0.3 * (1 - i / 16), 2200 + (i % 4) * 300, 1.6, 0.008)) },
  { id: 'amb.hammer', theme: 'realty, auto', every: [15, 50], recipe: 'three far knocks, 400 ms apart', dur: 1.4, build: () => [0, 0.4, 0.8].flatMap((t) => [...wood('D3', t, 0.28, 0.06)]) },
  { id: 'amb.cricket', theme: 'any, at night', every: [6, 18], recipe: 'a burst of cricket chirps: 4.3 kHz noise band pulsing at 30 Hz, three bursts', dur: 0.7, build: () => [0, 0.14, 0.28].map((t) => ({ k: 'noise', c: 'white', t, a: 0.01, d: 0.09, g: 0.9, bp: [4300, 14], am: [30, 1] })) },
  { id: 'amb.thunder', theme: 'any, in a credit crunch', every: [40, 90], recipe: 'a rumble: brown noise below 160 Hz swelling over 400 ms and fading over 2 s', dur: 2.8, build: () => [{ k: 'noise', c: 'brown', a: 0.4, d: 2.0, g: 0.8, lp: [200, 0.7, 90] }] },
  { id: 'amb.chime', theme: 'estate, campus', every: [30, 90], recipe: 'a far tower chime: glass D4 A4', dur: 1.8, build: () => [gls('D4', 0, 0.2, 1.2, { lp: [2500, 0.7] }), gls('A4', 0.5, 0.18, 1.2, { lp: [2500, 0.7] })] },
  { id: 'amb.pluck', theme: 'creative', every: [20, 60], recipe: 'a soft guitar-like pluck on a pentatonic note, fast decay', dur: 0.9, build: () => [{ k: 'tone', f: 'A3', type: 'triangle', a: 0.002, d: 0.5, g: 0.2, lp: [2000, 0.8, 600] }, click(0, 0.1, 2000)] },
];
