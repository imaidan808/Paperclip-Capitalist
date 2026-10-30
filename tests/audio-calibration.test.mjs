// The calibration's arithmetic and the shared noise (docs/AUDIO.md Appendix F, I2 and I3). scripts/audio-check.mjs measures in Chrome; the decisions it makes from the measurements are pure
// (scripts/audio-calib.mjs) and the noise they depend on is built from a fixed seed, so both are held here with no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeContext } from './helpers/fakeaudio.mjs';
import { noiseBuffers, noiseOffset, voice, NOISE_RATE } from '../js/audio/palette.js';
import { layersFor, noiseAtFor, trimDbOf, TIER_TARGET, TIER_CEIL, tierComp } from '../js/audio/recipes.js';
import { oneShotLayers } from '../js/audio/ambient.js';
import { TRIMS } from '../js/audio/trims.js';
import { median, percentile, chooseList, restat, withLists, stage1, tierMedians, centre, calibrate, LIST_SPREAD, LIST_SIZE, BAL_MAX, CEIL_MARGIN } from '../scripts/audio-calib.mjs';

// ---------------------------------------------------------------------------------------------------------------- the shared noise
const nbOf = (sr) => noiseBuffers(fakeContext({ sampleRate: sr }));
const blocksDb = (d, w) => { const out = []; for (let i = 0; i + w <= d.length; i += w) { let a = 0; for (let j = i; j < i + w; j++) a += d[j] * d[j]; out.push(10 * Math.log10(a / w)); } return out; };
const sdOf = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
test('the noise is the same on every device: one rate, one realisation, made from a fixed seed', () => {
  const a = nbOf(48000), b = nbOf(44100), c = nbOf(96000);
  for (const col of ['white', 'pink', 'brown']) {
    assert.equal(a[col].sampleRate, NOISE_RATE); assert.equal(b[col].sampleRate, NOISE_RATE); assert.equal(c[col].sampleRate, NOISE_RATE);
    assert.deepEqual(a[col].getChannelData(0).slice(0, 64), b[col].getChannelData(0).slice(0, 64), col + ' at 44.1 kHz is the same noise');
    assert.equal(a[col].getChannelData(0).length, b[col].getChannelData(0).length);
  }
  assert.equal(a.loopEnd, a.len, 'the loop is the whole buffer: the blocks wrap, so there is no seam to stay clear of');
  assert.ok(a.loopEnd > 2.4 && a.loopEnd < 2.6);
});
test('each colour is at RMS 0.25, has no DC and no sample over full scale', () => {
  const nb = nbOf(48000);
  for (const col of ['white', 'pink', 'brown']) {
    const d = nb[col].getChannelData(0); let s = 0, dc = 0, pk = 0; for (const v of d) { s += v * v; dc += v; pk = Math.max(pk, Math.abs(v)); }
    assert.ok(Math.abs(Math.sqrt(s / d.length) - 0.25) < 1e-3, col + ' rms'); assert.ok(Math.abs(dc / d.length) < 0.01, col + ' dc ' + dc / d.length); assert.ok(pk < 1.3, col + ' peak ' + pk);
  }
});
const band = (d, f, q = 0.9) => { // a bandpass (RBJ) at f: what a footstep's gravel layer does to the noise
  const w = 2 * Math.PI * f / 48000, al = Math.sin(w) / (2 * q), a0 = 1 + al, b0 = al / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0, y = new Float64Array(d.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < d.length; i++) { const v = b0 * d[i] - b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = d[i]; y2 = y1; y1 = v; y[i] = v; } return y;
};
test('the noise is even in time: the energy a band of it carries in a 20 ms window varies far less than that of plain random noise', () => {
  const nb = nbOf(48000);
  let x = 12345; const rnd = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
  const plain = new Float64Array(nb.white.getChannelData(0).length); for (let i = 0; i < plain.length; i += 2) { const u = Math.max(1e-12, rnd()), v = rnd(), r = Math.sqrt(-2 * Math.log(u)); plain[i] = r * Math.cos(2 * Math.PI * v); plain[i + 1] = r * Math.sin(2 * Math.PI * v); }
  for (const [f, w] of [[520, 960], [700, 960], [1500, 960], [3200, 480]]) {
    const flat = sdOf(blocksDb(band(nb.white.getChannelData(0), f), w)), rough = sdOf(blocksDb(band(plain, f), w));
    assert.ok(flat < rough * 0.8, `white through a band at ${f} Hz: ${flat.toFixed(2)} dB against ${rough.toFixed(2)} for plain random noise`);
  }
  assert.ok(sdOf(blocksDb(nb.white.getChannelData(0), 480)) < 0.4 && sdOf(blocksDb(nb.pink.getChannelData(0), 480)) < 0.8, 'and across the whole spectrum a 10 ms window moves by under 0.4 dB (white) and 0.8 (pink)');
});
test('the loop has no seam: the energy across the wrap is the energy anywhere else', () => {
  const nb = nbOf(48000), d = nb.white.getChannelData(0), n = d.length, w = 480, wrap = new Float64Array(2 * w);
  for (let i = 0; i < 2 * w; i++) wrap[i] = d[(n - w + i) % n];
  let a = 0; for (const v of wrap) a += v * v;
  const around = 10 * Math.log10(a / wrap.length), typical = blocksDb(d, 2 * w), m = typical.reduce((p, q) => p + q, 0) / typical.length;
  assert.ok(Math.abs(around - m) < 0.6, `across the wrap ${around.toFixed(2)} dB, elsewhere ${m.toFixed(2)}`);
});
test('the colours are what they are called: white is flat, pink falls 3 dB an octave, brown 6 above 150 Hz', () => {
  const nb = nbOf(48000);
  const band = (d, f0, f1) => { // energy in a band by a DFT of 8192 samples averaged over blocks
    const N = 8192, out = []; let e = 0, cnt = 0;
    for (let s = 0; s + N <= d.length && cnt < 6; s += N, cnt++) for (let k = Math.floor(f0 * N / 48000); k < Math.ceil(f1 * N / 48000); k++) { let re = 0, im = 0; for (let i = 0; i < N; i += 1) { const a = -2 * Math.PI * k * i / N; re += d[s + i] * Math.cos(a); im += d[s + i] * Math.sin(a); } e += re * re + im * im; }
    return 10 * Math.log10(e / cnt);
  };
  void band; // a full DFT is slow in a test; the octave comparison below uses a cheap filterbank instead
  const oct = (d, fc) => { // two-pole bandpass energy at fc, one octave wide, by a biquad
    const w = 2 * Math.PI * fc / 48000, al = Math.sin(w) / (2 * 1.41), a0 = 1 + al, b = [al / a0, 0, -al / a0], a = [1, -2 * Math.cos(w) / a0, (1 - al) / a0];
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, e = 0; for (let i = 0; i < d.length; i++) { const y = b[0] * d[i] + b[2] * x2 - a[1] * y1 - a[2] * y2; x2 = x1; x1 = d[i]; y2 = y1; y1 = y; e += y * y; } return 10 * Math.log10(e / d.length);
  };
  const w = nb.white.getChannelData(0), p = nb.pink.getChannelData(0), br = nb.brown.getChannelData(0);
  const wl = [500, 1000, 2000, 4000].map((f) => oct(w, f)), pl = [500, 1000, 2000, 4000].map((f) => oct(p, f)), bl = [500, 1000, 2000, 4000].map((f) => oct(br, f));
  const steps = (l) => l.slice(1).map((v, i) => v - l[i]); // per octave, but a bandpass of fixed Q is wider (in Hz) the higher it goes: white rises 3 dB an octave by it
  for (let i = 0; i < 3; i++) { assert.ok(Math.abs(steps(wl)[i] - 3) < 1, 'white ' + steps(wl)[i]); assert.ok(Math.abs(steps(pl)[i]) < 1, 'pink is flat per octave: ' + steps(pl)[i]); assert.ok(Math.abs(steps(bl)[i] + 3) < 1, 'brown falls 3 dB an octave per octave band: ' + steps(bl)[i]); }
});
test('a voice given places in the noise plays from one of them; a voice without plays from a random one', () => {
  const layers = layersFor('world.step', 'a', {}), ctx = fakeContext({ sampleRate: 48000 }), nb = noiseBuffers(ctx);
  const offsets = (o) => { const c = fakeContext({ sampleRate: 48000 }); voice(c, c.destination, layers, 0.5, o); return c.nodes.filter((n) => n.kind === 'buf').map((n) => n.offset); };
  const noisy = layers.filter((L) => L.k === 'noise').length; assert.ok(noisy >= 2, 'a footstep has two noise layers');
  const listed = offsets({ seed: 4, noiseAt: [0.5, 1.2, 1.9] });
  assert.equal(listed.length, noisy);
  const firsts = new Set([0.5, 1.2, 1.9]); assert.ok(firsts.has(listed[0]), 'the first noise layer starts at one of the places');
  assert.ok(Math.abs(listed[1] - noiseOffset(listed[0], 1, nb.loopEnd)) < 1e-12, 'the next a fixed step on, so two noise layers are not the same noise');
  const seen = new Set(); for (let s = 1; s < 40; s++) seen.add(offsets({ seed: s, noiseAt: [0.5, 1.2, 1.9] })[0]); assert.equal(seen.size, 3, 'and the seed picks among them');
  const free = new Set(); for (let s = 1; s < 20; s++) free.add(offsets({ seed: s })[0]); assert.ok(free.size > 10, 'without a list the place is random');
  for (const o of free) assert.ok(o >= 0 && o < nb.loopEnd);
});
test('trims.js carries the lists, every list is places inside the buffer, and a list belongs to a sound that has noise', () => {
  assert.ok(TRIMS.noiseAt && typeof TRIMS.noiseAt === 'object');
  for (const [k, l] of Object.entries(TRIMS.noiseAt)) {
    assert.ok(Array.isArray(l) && l.length >= 3 && l.length <= LIST_SIZE, k); for (const c of l) assert.ok(c >= 0 && c < 2.51, k + ' ' + c);
    if (!k.includes('#')) { assert.ok(oneShotLayers(k).some((L) => L.k === 'noise'), k + ' is an ambient one-shot with noise'); continue; }
    const [id, rest] = k.split('#'), [v, pool] = rest.split('@');
    assert.ok(layersFor(id, v, {}, +pool || 0).some((L) => L.k === 'noise'), k + ' has noise');
    assert.deepEqual(noiseAtFor(id, v, +pool || 0), l);
  }
  for (const k of ['world.step#a', 'world.step#b']) assert.ok(TRIMS.noiseAt[k], k + ' (five milliseconds of noise) has its places');
});

// ---------------------------------------------------------------------------------------------------------------- the arithmetic
const row = (key, tier, o = {}) => { const [id, v] = key.split('#'); return { key, id, v, tier, ms: 300, level: -30, fast: -30, lapFast: -30, lapFastA: -30, peak: -20, ...o }; };
test('median and percentile', () => {
  assert.equal(median([3, 1, 2]), 2); assert.equal(median([4, 1, 3, 2]), 3); assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95), 10); assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 0.95), 19);
});
test('a list is the places nearest the median that are not peaky, at most LIST_SIZE of them', () => {
  const cands = Array.from({ length: 32 }, (_, j) => ({ c: j / 10, fast: -30 + (j - 16) * 0.3, lapFastA: -30 + (j - 16) * 0.3, peak: j === 16 ? -2 : -20 }));
  const l = chooseList(cands);
  assert.equal(l.length, LIST_SIZE); assert.ok(!l.some((x) => x.peak === -2), 'the one whose peak is far over the median is left out even though it is the middle one');
  for (const x of l) assert.ok(Math.abs(x.fast + 30) < 1.4, 'all within a dB or so of the middle');
});
test('only a row that moves with the place gets a list, and its figures are then those of the listed places', () => {
  const plays = (spread) => Array.from({ length: 32 }, (_, j) => ({ c: j * 0.07, level: -30 + (j / 31 - 0.5) * spread, fast: -30 + (j / 31 - 0.5) * spread, lapFast: -30, lapFastA: -30 + (j / 31 - 0.5) * spread, peak: -20 }));
  const calm = { ...row('ui.tick#light', 'tiny'), cands: plays(1.0), spread: 1.0 }, wild = { ...row('world.step#a', 'tiny'), cands: plays(6), spread: 6 };
  const { rows, lists } = withLists([calm, wild]);
  assert.deepEqual(Object.keys(lists), ['world.step#a']); assert.equal(lists['world.step#a'].length, LIST_SIZE);
  assert.ok(rows[1].spread < LIST_SPREAD, 'the listed places are close together: ' + rows[1].spread); assert.ok(rows[0].spread === 1.0 && rows[0] === calm);
  assert.ok(Math.abs(restat(wild, wild.cands).level - median(wild.cands.map((c) => c.level))) < 1e-9);
  assert.ok(LIST_SPREAD >= 1 && LIST_SPREAD <= 2);
});
test('stage 1: the tier target plus the duration compensation and the variant\'s softness, held under the ceiling', () => {
  const r = row('ui.tick#light', 'tiny', { ms: 60, level: -34 });
  assert.ok(Math.abs(stage1(r) - (TIER_TARGET.tiny + tierComp('tiny', 60) - -34)) < 1e-9);
  const soft = row('sale.scam#s', 'medium', { ms: 700, level: -24 }); assert.ok(Math.abs(stage1(soft) - (TIER_TARGET.medium + trimDbOf('sale.scam', 's') + 24)) < 1e-9 && trimDbOf('sale.scam', 's') < 0, 'a loss twin is meant to sit a little under');
  const peaky = row('alert.shock#fed', 'loud', { ms: 2000, level: -30, peak: -5 }); assert.ok(Math.abs(stage1(peaky) - (TIER_CEIL.loud - CEIL_MARGIN + 5)) < 1e-9, 'the ceiling, less the margin the check needs, holds the level down');
  assert.ok(Math.abs(stage1({ id: 'amb.x', key: 'amb.x', tier: 'amb', level: -40, peak: -30 }) - 8) < 1e-9);
  assert.ok(CEIL_MARGIN > 0 && CEIL_MARGIN < 1);
});
test('stage 2: each variant ends the same distance from the middle under both models, as far as the balance reaches; the softness of a loss twin is kept', () => {
  // a tier of eleven sounds whose two models agree, plus one that the quiet laptop hears 5 dB under what the K-weighted model says (a "no" that lives in the lows) and one that is 5 dB over
  const rows = [...Array.from({ length: 11 }, (_, i) => row('cam#in'.replace('in', 'x' + i), 'tiny')), row('ui.refuse#r', 'tiny', { lapFastA: -35 }), row('ui.ok#o', 'tiny', { lapFastA: -25 })];
  const t1 = Object.fromEntries(rows.map((r) => [r.key, 0])), t = centre(rows, t1), M = tierMedians(rows, t);
  const dev = (r, f) => r[f] + t[r.key] - trimDbOf(r.id, r.v);
  const low = rows.find((r) => r.key === 'ui.refuse#r'), high = rows.find((r) => r.key === 'ui.ok#o');
  assert.ok(Math.abs(t['ui.refuse#r'] - 2.5) < 0.2, 'raised by half of the disagreement: ' + t['ui.refuse#r']); assert.ok(Math.abs(t['ui.ok#o'] + 2.5) < 0.2, 'lowered by half: ' + t['ui.ok#o']);
  assert.ok(Math.abs((dev(low, 'fast') - M.tiny.k) + (dev(low, 'lapFastA') - M.tiny.a)) < 0.4, 'one above the middle by as much as the other is below it');
  for (const r of rows.slice(0, 11)) assert.ok(Math.abs(t[r.key]) < 0.2, 'the sounds that agree stay where they were');
  // the clamp
  const far = [...Array.from({ length: 11 }, (_, i) => row('cam#x' + i, 'tiny')), row('ui.refuse#r', 'tiny', { lapFastA: -45 })], tf = centre(far, Object.fromEntries(far.map((r) => [r.key, 0])));
  assert.ok(Math.abs(tf['ui.refuse#r'] - BAL_MAX) < 1e-9, 'never more than BAL_MAX: ' + tf['ui.refuse#r']);
  // a twin's softness is not undone
  const tw = [...Array.from({ length: 11 }, (_, i) => row('cam#x' + i, 'medium')), row('sale.scam#s', 'medium', { fast: -30 + trimDbOf('sale.scam', 's'), lapFastA: -30 + trimDbOf('sale.scam', 's') })], tt = centre(tw, Object.fromEntries(tw.map((r) => [r.key, 0])));
  assert.ok(trimDbOf('sale.scam', 's') <= -1.5);
  assert.ok(Math.abs(tt['sale.scam#s']) < 0.2, 'sale.scam is under its gain by design and is not pulled back to the middle: ' + tt['sale.scam#s']);
});
test('the ceiling is never traded for balance', () => {
  const rows = [...Array.from({ length: 11 }, (_, i) => row('cam#x' + i, 'loud', { peak: -10 })), row('alert.shock#fed', 'loud', { lapFastA: -40, peak: -3.2 })];
  const t = centre(rows, Object.fromEntries(rows.map((r) => [r.key, 0])));
  assert.ok(rows.find((r) => r.id === 'alert.shock').peak + t['alert.shock#fed'] <= TIER_CEIL.loud - CEIL_MARGIN + 1e-9, String(t['alert.shock#fed']));
});
test('calibrate: lists, one-shots and trims in one go', () => {
  const plays = Array.from({ length: 32 }, (_, j) => ({ c: j * 0.07, level: -28 + (j % 7) * 0.9, fast: -28 + (j % 7) * 0.9, lapFast: -28, lapFastA: -28 + (j % 7) * 0.9, peak: -15 }));
  const rows = [{ ...row('world.step#a', 'tiny', { ms: 150 }), cands: plays, spread: 5.4 }, ...Array.from({ length: 11 }, (_, i) => row('cam#x' + i, 'tiny'))];
  const shots = [{ id: 'amb.chime', key: 'amb.chime', tier: 'amb', level: -40, peak: -30 }];
  const c = calibrate(rows, shots);
  assert.ok(c.lists['world.step#a'].length === LIST_SIZE && Object.keys(c.lists).length === 1);
  assert.equal(c.oneShots['amb.chime'], 8); assert.ok(Object.values(c.sounds).every(Number.isFinite));
});
