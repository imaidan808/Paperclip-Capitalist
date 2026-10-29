// node scripts/audio-check.mjs [--calibrate] [--fast] [--pools] [--json file]
// Renders EVERY recipe of the sound layer offline in headless Chrome (an OfflineAudioContext on the audition page, dev/sounds.html, scripts/cdp.mjs) and prints, per sound:
// duration, peak dBFS, RMS dBFS, K-weighted active level, DC offset, clipped samples, spectral centroid at the start and at the end, the tail at the declared end, NaNs.
// It exits non-zero when any sound is silent, clips, has DC, has a NaN, runs longer than its tier allows, or sits outside its tier's loudness window (docs/AUDIO.md 3.2 and 10.1),
// and it holds the rest of the test plan's render checks: a pop-free step, the gentle top, the mid body of the refusal and loss family, the direction of gains against losses, the size
// ladders, the beds and the one-shots, the tier gaps through the master chain and the worst pile-up.
//   --calibrate  first trim every variant to its tier's target (the only thing calibration changes), write js/audio/trims.js, then check against it
//   --fast       skip the master-chain renders (tier gaps and the pile-up)
//   --pools      also render the other members of every pool (`id#variant@k`)
//   --json file  write the full rows
// Needs headless Chrome (scripts/cdp.mjs). Server on PORT (default 8401), Chrome on CDP (default 9901).
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { handler } from '../server/static.mjs';
import { launch, open } from './cdp.mjs';
import { TIER_TARGET, TIER_CEIL, TIER_MAX_MS, tierComp, RECIPES, trimDbOf } from '../js/audio/recipes.js';
import { ONE_SHOTS } from '../js/audio/ambient.js';

const args = new Set(process.argv.slice(2)), arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const PORT = +process.env.PORT || 8401, CDP = +process.env.CDP || 9901;
const TRIMS_FILE = fileURLToPath(new URL('../js/audio/trims.js', import.meta.url));
const BED_TARGET = -28, BED_PEAK = -11, BED_CENTROID = 5000, SHOT_CENTROID = 6500, MAP_CENTROID = 6000;
const FAMILY = ['ui.refuse#r', 'world.locked#l', 'sale.reject#nofit', 'sale.reject#fake', 'sale.scam#s', 'sale.herd#h', 'acad.teach#wrong', 'bid.rival#out', 'bid.hammer#lost', 'deal.result#bad', 'pitch.fit#down', 'audit.result#fail',
  'repair.stop#miss', 'repair.done#rough', 'ship.trouble#damage', 'haggle.close#walk', 'alert.insolvent#i', 'bank.draw#b', 'cash.out#s', 'cash.out#m', 'cash.out#l'];
const PAIRS = [['cash.in#m', 'cash.out#m'], ['cash.in#l', 'cash.out#l'], ['cash.in#s', 'cash.out#s'], ['sale.win#w', 'sale.reject#nofit'], ['sale.win#w', 'sale.herd#h'], ['cam#in', 'cam#out'], ['deal.result#good', 'deal.result#bad'],
  ['pitch.fit#up', 'pitch.fit#down'], ['audit.result#pass', 'audit.result#fail'], ['ui.toggle#on', 'ui.toggle#off'], ['clock#resume', 'clock#pause'], ['bid.hammer#won', 'bid.hammer#lost'], ['repair.done#great', 'repair.done#rough'], ['bank.repay#full', 'bank.draw#b']];
const LADDERS = [['cash.in#s', 'cash.in#m', 'cash.in#l', 'cash.in#xl'], ['cash.out#s', 'cash.out#m', 'cash.out#l'], ['alert.advance#l1', 'alert.advance#l2', 'alert.advance#l3'], ['achievement#common', 'achievement#rare', 'achievement#epic'],
  ['zone.open#t1', 'zone.open#t4'], ['level.up#s', 'level.up#l', 'level.up#big'], ['milestone#m1', 'milestone#m2', 'milestone#m3']];
/** Ladders that must also get brighter at each step (the whole sound's spectral centroid): bigger sums are brighter, and the interval narrows and the tone opens as you close in. */
const BRIGHTER = [['cash.in#s', 'cash.in#m', 'cash.in#l', 'cash.in#xl'], ['haggle.tell#far', 'haggle.tell#reach', 'haggle.tell#near']];
/** A loss is never louder than the gain it mirrors (2.2: spending is quieter than earning), by the active level and by the K-weighted Fast level. */
const LOSS_TWINS = [['cash.in#s', 'cash.out#s'], ['cash.in#m', 'cash.out#m'], ['cash.in#l', 'cash.out#l'], ['sale.win#w', 'sale.herd#h'], ['sale.win#w', 'sale.scam#s'], ['sale.win#w', 'sale.reject#nofit'], ['ui.toggle#on', 'ui.toggle#off'],
  ['deal.result#good', 'deal.result#bad'], ['pitch.fit#up', 'pitch.fit#down'], ['audit.result#pass', 'audit.result#fail'], ['bid.hammer#won', 'bid.hammer#lost'], ['repair.done#great', 'repair.done#rough']];
const LAPTOP_TOL = 3.0, FAST_TOL = 3.0; // dB from the tier's median: the K-weighted Fast level of a sound after a 220 Hz high-pass (a small speaker), and without one
const PAN_PROBES = ['ui.tick#full', 'sale.win#w', 'level.up#l', 'cash.out#m', 'alert.advance#l2', 'ui.refuse#r']; // total power at any pan is the total power at the centre

const srv = createServer(handler).listen(PORT, '127.0.0.1');
const b = await launch(CDP);
const fails = [], warns = [];
const fail = (m) => fails.push(m), warn = (m) => warns.push(m);
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
try {
  const p = await open(b, `http://127.0.0.1:${PORT}/dev/sounds.html?check=1`);
  const call = (expr) => p.eval(`(async()=>{const m=await import('/dev/measure.js');return JSON.stringify(await (${expr}))})()`).then(JSON.parse);
  const pools = args.has('--pools');
  let trims = {};
  const makeup = await call('m.makeupGain()');

  if (args.has('--calibrate')) {
    const r0 = await call('m.run({}, true)'), sounds = {}, oneShots = {}; // every member of every pool has a trim of its own
    for (const r of r0.rows) {
      const comp = tierComp(r.tier, r.ms), target = TIER_TARGET[r.tier] + comp + trimDbOf(r.id, r.v);
      let t = target - r.level; if (r.peak + t > TIER_CEIL[r.tier]) t = TIER_CEIL[r.tier] - r.peak;
      sounds[r.key] = Math.round(t * 10) / 10;
    }
    for (const r of r0.shots) { let t = TIER_TARGET.amb - r.level; if (r.peak + t > TIER_CEIL.amb) t = TIER_CEIL.amb - r.peak; oneShots[r.id] = Math.round(t * 10) / 10; }
    const beds0 = await call('m.runBeds({})'), beds = {};
    for (const r of beds0) if (!r.mods.length) beds[r.id] = Math.round((BED_TARGET - r.level) * 10) / 10;
    trims = { makeup: Math.round(makeup * 1000) / 1000, sounds, beds, oneShots };
    writeFileSync(TRIMS_FILE, '// Calibrated trims in dB, one per variant (`id#variant`), applied as a single gain on each voice. Written by `node scripts/audio-check.mjs --calibrate`; do not edit by hand.\n'
      + 'export const TRIMS = {\n makeup: ' + trims.makeup + ',\n sounds: ' + JSON.stringify(sounds) + ',\n beds: ' + JSON.stringify(beds) + ',\n oneShots: ' + JSON.stringify(oneShots) + ',\n};\n');
    console.log('calibrated:', Object.keys(sounds).length, 'variants,', Object.keys(oneShots).length, 'one-shots,', Object.keys(beds).length, 'beds ->', TRIMS_FILE);
  } else {
    trims = (await import('../js/audio/trims.js')).TRIMS;
  }
  const T = { ...trims.sounds, ...trims.oneShots };
  const res = await call(`m.run(${JSON.stringify(T)}, ${pools})`);
  const bedRows = await call(`m.runBeds(${JSON.stringify(trims.beds || {})})`);

  // ---- the table
  const pad = (s, n) => String(s).padEnd(n), num = (x, n) => String(f1(x)).padStart(n);
  console.log(pad('sound', 30), pad('tier', 6), 'ms'.padStart(5), 'peak'.padStart(6), 'rms'.padStart(6), 'level'.padStart(6), 'dc'.padStart(6), 'clip', 'cent0'.padStart(6), 'cent1'.padStart(6), 'tail'.padStart(6), 'trim'.padStart(5), ' flags');
  const rows = [...res.rows, ...res.shots];
  const median = (a) => { const v = [...a].sort((x, y) => x - y); return v[v.length >> 1]; };
  const tierMedian = {};
  for (const tier of ['tiny', 'medium', 'loud']) { const L = res.rows.filter((r) => r.tier === tier && !r.key.includes('@')); tierMedian[tier] = { lapFast: median(L.map((r) => r.lapFast)), fast: median(L.map((r) => r.fast)) }; }
  for (const r of rows) {
    const flags = [];
    const base = r.key.replace(/@\d+$/, '');
    const id = r.id, tier = r.tier;
    const comp = tierComp(tier, r.ms);
    const target = tier === 'amb' ? TIER_TARGET.amb : TIER_TARGET[tier] + comp + trimDbOf(id, r.v);
    const limited = r.peak > TIER_CEIL[tier] - 0.15; // the trim was held by the peak ceiling
    if (r.nonFinite) { fail(`${r.key}: ${r.nonFinite} NaN or infinite samples`); flags.push('NaN'); }
    if (r.peak < -60 || r.level < -60) { fail(`${r.key}: silent (peak ${f1(r.peak)} dBFS)`); flags.push('SILENT'); }
    if (r.clipped) { fail(`${r.key}: ${r.clipped} clipped samples`); flags.push('CLIP'); }
    if (r.peak > TIER_CEIL[tier] + 0.15) { fail(`${r.key}: peak ${f1(r.peak)} dBFS is over the ${tier} ceiling ${TIER_CEIL[tier]}`); flags.push('PEAK'); }
    if (r.dc > 0.002) { fail(`${r.key}: DC offset ${r.dc.toFixed(4)}`); flags.push('DC'); }
    if (r.step > 0.25) { fail(`${r.key}: a step of ${r.step} between samples (a pop)`); flags.push('POP'); }
    if (r.ms > TIER_MAX_MS[tier]) { fail(`${r.key}: ${r.ms} ms is longer than a ${tier} sound may be (${TIER_MAX_MS[tier]} ms)`); flags.push('LONG'); }
    if (r.tail > -50) { fail(`${r.key}: still ${f1(r.tail)} dBFS at its declared end (${r.dur} s)`); flags.push('TAIL'); }
    if (tier === 'amb' ? r.centroid > SHOT_CENTROID : r.centroid > MAP_CENTROID) { fail(`${r.key}: centroid ${r.centroid} Hz is too bright`); flags.push('BRIGHT'); }
    const off = r.level - target;
    if (limited ? off < -2.05 || off > 0.6 : Math.abs(off) > 0.6) { fail(`${r.key}: active level ${f1(r.level)} dB is ${f1(off)} dB from its target ${f1(target)}${limited ? ' (held by the peak ceiling)' : ''}`); flags.push('LEVEL'); }
    else if (limited && off < -0.4) flags.push('held ' + f1(off));
    if (tier !== 'amb' && r.share250 < 0.4) { fail(`${r.key}: only ${Math.round(r.share250 * 100)}% of its energy is above 250 Hz (a laptop speaker has nothing under 220 Hz: ${FAMILY.includes(base) ? 'a "no" needs a body it can play' : 'every sound needs a mid body, 2.2'})`); flags.push('BODY'); }
    const med = tierMedian[tier];
    if (med && !r.key.includes('@')) {
      if (Math.abs(r.lapFast - med.lapFast) > LAPTOP_TOL) { fail(`${r.key}: ${f1(r.lapFast)} dB K-weighted Fast level after a 220 Hz high-pass is ${f1(r.lapFast - med.lapFast)} dB from the ${tier} median ${f1(med.lapFast)} (a small speaker plays it ${r.lapFast - med.lapFast < 0 ? 'quieter' : 'louder'} than its tier)`); flags.push('LAPTOP'); }
      if (Math.abs(r.fast - med.fast) > FAST_TOL) { fail(`${r.key}: ${f1(r.fast)} dB Fast level is ${f1(r.fast - med.fast)} dB from the ${tier} median ${f1(med.fast)} (a very short tick under-compensated, or a dense one over)`); flags.push('FAST'); }
    }
    console.log(pad(r.key, 30), pad(tier, 6), String(r.ms).padStart(5), num(r.peak, 6), num(r.rms, 6), num(r.level, 6), r.dc.toFixed(4).padStart(6), String(r.clipped).padStart(4), String(r.c0).padStart(6), String(r.c1).padStart(6), num(r.tail, 6), num(r.trim, 5), ' ' + flags.join(' '));
  }
  console.log('\nbeds (8 s, active level target ' + BED_TARGET + ' dB):');
  for (const r of bedRows) {
    const flags = [];
    if (r.nonFinite) { fail(`bed ${r.key}: NaN`); flags.push('NaN'); }
    if (r.peak < -60) { fail(`bed ${r.key}: silent`); flags.push('SILENT'); }
    if (r.clipped) { fail(`bed ${r.key}: clipped`); flags.push('CLIP'); }
    if (r.peak > BED_PEAK) { fail(`bed ${r.key}: peak ${f1(r.peak)} dBFS is over ${BED_PEAK}`); flags.push('PEAK'); }
    if (r.dc > 0.002) { fail(`bed ${r.key}: DC ${r.dc.toFixed(4)}`); flags.push('DC'); }
    if (r.centroid > BED_CENTROID) { fail(`bed ${r.key}: centroid ${r.centroid} Hz is over ${BED_CENTROID}`); flags.push('BRIGHT'); }
    const tol = r.mods.length ? 3.5 : 0.6;
    if (Math.abs(r.level - BED_TARGET) > tol) { fail(`bed ${r.key}: active level ${f1(r.level)} dB is not ${BED_TARGET} (within ${tol})`); flags.push('LEVEL'); }
    console.log(pad(r.key, 30), String(r.layers).padStart(3) + ' layers', 'peak', num(r.peak, 6), 'rms', num(r.rms, 6), 'level', num(r.level, 6), 'cent', String(r.centroid).padStart(5), ' ' + flags.join(' '));
  }

  // ---- relations between sounds
  const by = Object.fromEntries(res.rows.filter((r) => !r.key.includes('@')).map((r) => [r.key, r]));
  for (const [g, l] of PAIRS) if (by[g] && by[l] && !(by[g].centroid > by[l].centroid)) fail(`brightness: ${g} (${by[g].centroid} Hz) is not brighter than ${l} (${by[l].centroid} Hz)`);
  for (const lad of LADDERS) for (let i = 1; i < lad.length; i++) if (by[lad[i - 1]] && by[lad[i]] && !(by[lad[i]].ms > by[lad[i - 1]].ms)) fail(`ladder: ${lad[i]} (${by[lad[i]].ms} ms) is not longer than ${lad[i - 1]} (${by[lad[i - 1]].ms} ms)`);
  for (const lad of BRIGHTER) for (let i = 1; i < lad.length; i++) if (by[lad[i - 1]] && by[lad[i]] && !(by[lad[i]].centroid > by[lad[i - 1]].centroid)) fail(`ladder: ${lad[i]} (${by[lad[i]].centroid} Hz) is not brighter than ${lad[i - 1]} (${by[lad[i - 1]].centroid} Hz)`);
  for (const [g, l] of LOSS_TWINS) if (by[g] && by[l]) {
    if (by[l].fast > by[g].fast + 0.3) fail(`loss: ${l} (${f1(by[l].fast)} dB Fast) is louder than ${g} (${f1(by[g].fast)} dB Fast)`);
  }
  if (pools) for (const r of res.rows) if (r.key.includes('@')) { const b0 = by[r.key.replace(/@\d+$/, '')]; if (b0 && Math.abs(r.level - b0.level) > 1.2) fail(`pool: ${r.key} is ${f1(r.level - b0.level)} dB from its first member`); }

  // ---- pan: a panned sound is as loud as a centred one (total power of both channels)
  for (const k of PAN_PROBES) {
    const [id, v] = k.split('#'), pw = await call(`m.panPower(${JSON.stringify(id)}, ${JSON.stringify(v)})`);
    for (const [pan, d] of Object.entries(pw)) if (Math.abs(d) > 0.1) fail(`pan: ${k} at pan ${pan} is ${f1(d)} dB from the same sound at the centre (an equal-power law is flat to 0.1 dB)`);
  }

  // ---- pan of a mix: a sale at the buyer's place (the coins and the streak ride in its mix) is on that side as far as the equal-power law says, not only its first voice
  for (const pan of [0.3, 0.6, -0.6]) {
    const got = await call(`m.saleBalance(${pan})`), law = 20 * Math.log10(Math.tan((pan + 1) * Math.PI / 4));
    console.log(`sale at pan ${pan}: right minus left ${got == null ? 'none' : f1(got)} dB (the law: ${f1(law)})`);
    if (got == null || Math.abs(got - law) > 2) fail(`pan: a sale at pan ${pan} is ${got == null ? 'silent' : f1(got) + ' dB right minus left, the law says ' + f1(law)} (the coins and the streak must share the sale's place, 3.6)`);
  }

  // ---- by tier
  console.log('\nby tier (active level dB; peak dBFS; length ms):');
  for (const tier of ['tiny', 'medium', 'loud', 'amb']) {
    const list = rows.filter((r) => r.tier === tier && !r.key.includes('@'));
    if (!list.length) continue;
    const lv = list.map((r) => r.level), ms = list.map((r) => r.ms).sort((a, c) => a - c), mean = lv.reduce((a, c) => a + c, 0) / lv.length;
    console.log(pad(tier, 8), String(list.length).padStart(4), 'variants  level', f1(Math.min(...lv)), 'to', f1(Math.max(...lv)), '(mean', f1(mean) + ')  peak max', f1(Math.max(...list.map((r) => r.peak))), ' length', ms[0], '/', ms[ms.length >> 1], '/', ms[ms.length - 1]);
  }

  // ---- through the master chain (voices at 0.6 s)
  if (!args.has('--fast')) {
    const game = res.rows.filter((r) => RECIPES[r.id].bus === 'game' && !r.key.includes('@') && !(r.tier === 'tiny' && r.ms < 120));
    const gaps = {};
    for (const M of [1, 0.49]) {
      const lv = { medium: [], loud: [] };
      for (const r of game) if (lv[r.tier]) { const a = await call(`m.throughChain(${JSON.stringify(r.id)}, ${JSON.stringify(r.v)}, ${r.trim}, ${makeup}, ${M})`); lv[r.tier].push(a.level - 20 * Math.log10(M)); }
      const mean = (x) => x.reduce((a, c) => a + c, 0) / x.length;
      gaps[M] = mean(lv.loud) - mean(lv.medium);
      console.log(`tier gap through the chain at master ${M === 1 ? 100 : 49}%: medium ${f1(mean(lv.medium))} dB, loud ${f1(mean(lv.loud))} dB, gap ${f1(gaps[M])} dB`);
      if (gaps[M] < 5) fail(`the medium to loud gap through the master chain is ${f1(gaps[M])} dB (5 dB at least) at master ${M}`);
    }
    const loudest = res.rows.filter((r) => r.tier === 'loud' && RECIPES[r.id].bus === 'game' && !r.key.includes('@')).sort((a, c) => c.level - a.level).slice(0, 12).map((r) => r.key);
    const worst = await call(`m.worstCase(${JSON.stringify(loudest)}, ${JSON.stringify(trims.sounds)}, ${makeup}, 1)`);
    console.log(`the ${loudest.length} loudest sounds at once through the chain peak at ${f1(worst)} dBFS`);
    if (worst > -2.9) fail(`the worst pile-up peaks at ${f1(worst)} dBFS (the chain's ceiling is -3.0)`);
  }
  console.log(`\ncompressor makeup (measured): ${makeup.toFixed(3)}; ${rows.length} sounds, ${bedRows.length} beds; ${ONE_SHOTS.length} one-shots`);
  if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify({ rows: res.rows, shots: res.shots, beds: bedRows, makeup, trims }, null, 1));
  const errs = p.logs.filter((l) => /^(error|EXC)/.test(l));
  if (errs.length) { for (const e of errs) fail('page: ' + e); }
} catch (e) {
  fail('script: ' + (e.stack || e.message));
} finally {
  b.close(); srv.close();
}
for (const w of warns) console.log('warning:', w);
if (fails.length) { console.log('\n' + fails.length + ' problems:'); for (const f of fails) console.log(' -', f); process.exitCode = 1; } else console.log('\nall checks pass');
