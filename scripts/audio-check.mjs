// node scripts/audio-check.mjs [--calibrate] [--fast] [--pools] [--json file]
// Renders EVERY recipe of the sound layer offline in headless Chrome (an OfflineAudioContext on the audition page, dev/sounds.html, scripts/cdp.mjs) and prints, per sound:
// duration, peak dBFS, RMS dBFS, K-weighted active level, DC offset, clipped samples, spectral centroid at the start and at the end, the tail at the declared end, NaNs.
// It exits non-zero when any sound is silent, clips, has DC, has a NaN, runs longer than its tier allows, or sits outside its tier's loudness window (docs/AUDIO.md 3.2 and 10.1),
// and it holds the rest of the test plan's render checks: a pop-free step, the gentle top, the mid body of the refusal and loss family, the direction of gains against losses, the size
// ladders, the beds and the one-shots, the tier gaps through the master chain and the worst pile-up.
//   --calibrate  first trim every variant (the only thing calibration changes): to its tier's target on the median of 32 places in the noise (I3), then balanced between the K-weighted and the quiet-laptop
//                model (I2, scripts/audio-calib.mjs), and give the sounds that move with the place in the noise a list of places; write js/audio/trims.js, then check against it
//   --fast       skip the master-chain renders (tier gaps and the pile-up)
//   --pools      also render the other members of every pool (`id#variant@k`); the calibration, and the 32 plays of every variant (R1, R7), always include them
//   --leak       only the start-click sweep (I1): every variant muted, started at the engine's real start times at 44.1 and 48 kHz
//   --first      only the first sound of a context (R3-1): the real engine, a sound played at currentTime 0 against the same sound at 1 s, at 44.1 and 48 kHz
//   --dial       only the repair dial tone (R3-2): every note, in the green zone and out of it, against the tiny tier's medians (it renders the sounds once for those)
//   --json file  write the full rows
// Needs headless Chrome (scripts/cdp.mjs). Server on PORT (default 8401), Chrome on CDP (default 9901).
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { handler } from '../server/static.mjs';
import { launch, open } from './cdp.mjs';
import { TIER_TARGET, TIER_CEIL, TIER_MAX_MS, tierComp, RECIPES, trimDbOf, tierOf } from '../js/audio/recipes.js';
import { calibrate, stage1, median, percentile, peakOf, BAL_MAX, CEIL_MARGIN, LIST_SPREAD, LOSS_TWINS } from './audio-calib.mjs';
import { ONE_SHOTS } from '../js/audio/ambient.js';
import { masterGain, DEFAULT_MASTER, CLASSROOM_DB } from '../js/audio/settings.js';
import { AMB } from '../js/audio/ambient.js';

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
/** A loss is never louder than the gain it mirrors (2.2: spending is quieter than earning), by the K-weighted Fast level and by the quiet laptop's: the pairs are scripts/audio-calib.mjs `LOSS_TWINS`. */
const LEAK_FLOOR = -90; // dBFS: a muted layer started at any time the engine can start one may not put anything over this out (I1: a one-sample click of -8 to -40 dBFS was measured)
const TIER_GAP_MIN = 1.5; // dB of clear gap between one tier's loudest and the next tier's quietest variant under every model, before the buses: the nearest it came under the 400 ms momentary was 1.1 (R2)
const MOM_TOL = 3.0; // dB from the tier's median: the quiet laptop's MOMENTARY loudness (400 ms; fourth round, R2)
const LAPTOP_TOL = 3.0, FAST_TOL = 3.0, LAPA_TOL = 3.0; // dB from the tier's median: the K-weighted Fast level of a sound after a 220 Hz high-pass (a small speaker), without one, and the A-weighted Fast level after the high-pass (the quiet laptop, I2)
const PAN_LOSS_MAX = 1.6;  // dB a loud sound at pan 0.6 may be under the same sound centred, through the chain (R8: 0.7 at the default volume, 1.2 at 100%)
const CROSS_DIP_MAX = 1.5; // dB the quietest 100 ms of a change of district may sit under the lower of the two beds (R4)
const AT_BUS_GAP_K = 1.5;  // ... and under the K-weighted Fast level of a flat speaker, where the interface bus's two mediums are bright and the tiny game sounds are low and loud
const AT_BUS_GAP = 2.5;    // dB of clear gap between one tier's loudest and the next tier's quietest sound at the speaker, in Full and in Classroom, K-weighted and quiet-laptop Fast (R3)
const PLAYS_N = 32, PLAY_SEED = 500; // plays of every variant the way the engine makes them (R1, R7); the check draws its own, other than the calibration's
const SURVEY_N = 16, CALIB_N = 64; // places in the noise a noisy sound is played from: for the check, and for the calibration (docs/AUDIO.md Appendix F, I3)
const SPREAD_MAX = 2.5; // dB: the most the Fast level of a noisy sound moves with the place in the noise, once its list of places is in
// Frequent sounds, played the way the engine plays them: 32 plays with their own seeds, noise places, pitch and gain jitter. (I3)
const PLAY_PROBES = ['world.step#a', 'world.step#b', 'world.hover#t', 'ui.tick#light', 'ui.tick#full', 'ui.select#i0', 'ui.crate#pick1', 'haggle.move#small', 'cash.in#s', 'bid.raise#r1'];
const PLAY_NOISE_SPREAD = 1.5, PLAY_JITTER_SPREAD = 2.5, PLAY_BIAS = 1.0; // dB: Fast spread over 32 plays with only the noise place and pitch varying, with the gain jitter too, and how far their median is from what the calibration measured
const PAN_PROBES = ['ui.tick#full', 'sale.win#w', 'level.up#l', 'cash.out#m', 'alert.advance#l2', 'ui.refuse#r']; // total power at any pan is the total power at the centre
// The first sound after the context is made (sixth round, R3-1): Chrome's glue compressor takes up to 9.8 dB off a short sound that starts inside its first 100 to 150 ms, and the first press of a page makes the
// context and plays its tick in the same task. These are the sounds the review measured, played by the real engine at currentTime 0 and at 1 s.
const FIRST_KEYS = ['ui.tick#light', 'ui.select#i0', 'world.step#a', 'ui.toggle#on', 'draft.pick#slot2', 'ui.ok#o', 'sale.win#w'];
const FIRST_TOL = 1.0;  // dB: the first sound's K-weighted Fast level, the quiet laptop's and its peak, against the same sound at 1 s
const FIRST_IDLE = 30;  // s of silence after which a compressor that has gone quiet must not be cold again
// The repair dial tone (sixth round, R3-2): every note, steady, in the green zone and out of it, is held within this many dB of the tiny tier's median under the K-weighted Fast level and under the quiet laptop's.
const DIAL_TOL = 3.0, DIAL_PEAK_MAX = -12; // dB; and the loudest sample of the tone at the most (the tiny ceiling is -6: "far under" is 6 dB or more under it)


/** The start-click sweep (I1): a muted voice leaves nothing but a leak. Runs at 44.1 and 48 kHz with the engine's own start times (js/audio/palette.js env(), fadeIn()). */
async function leakCheck(call, pools) {
  const rows = await call(`m.leakSweep([44100, 48000], 16, ${pools})`), bad = rows.filter((r) => r.peak > LEAK_FLOOR);
  for (const sr of [44100, 48000]) { const a = rows.filter((r) => r.sr === sr); console.log(`start clicks at ${sr} Hz: ${a.length} muted variants and one-shots at 16 engine start times, worst ${f1(Math.max(...a.map((r) => r.peak)))} dBFS (limit ${LEAK_FLOOR})`); }
  for (const r of bad.sort((a, c) => c.peak - a.peak).slice(0, 12)) fail(`start click: ${r.key} at ${r.sr} Hz leaks ${f1(r.peak)} dBFS at ${r.at.toFixed(4)} s with every layer muted (a gain node's own value is 1: the envelope must be in place before the first frame)`);
  if (bad.length > 12) fail(`start click: ${bad.length - 12} more over ${LEAK_FLOOR} dBFS`);
}

/**
 * The first sound after the context is made (R3-1): each sound the review named is played by the REAL engine in an OfflineAudioContext twice, once before the first render quantum (currentTime 0, which
 * is where the page's first press plays its tick) and once at 1 s, from the same seeded voice; the two are read the way the calibration reads a sound (K-weighted Fast, the quiet laptop's Fast, the peak)
 * and may not differ by more than FIRST_TOL. Also: the later sound is not delayed, the first is (the engine waits for the compressor, it does not play early and quiet), and a compressor that has gone quiet
 * for FIRST_IDLE seconds does not go cold again. At 44.1 and 48 kHz.
 */
async function firstSoundCheck(call) {
  const pad = (s, n) => String(s).padEnd(n);
  for (const sr of [44100, 48000]) {
    const rows = await call(`m.firstSound(${sr}, ${JSON.stringify(FIRST_KEYS)})`);
    let worst = 0;
    for (const r of rows) {
      if (r.silent) { fail(`first sound: ${r.key} at ${sr} Hz ${r.played ? 'is silent' : 'was not played'}`); continue; }
      worst = Math.max(worst, Math.abs(r.dK), Math.abs(r.dA), Math.abs(r.dPk));
      console.log(`first sound at ${sr} Hz: ${pad(r.key, 17)} K Fast ${f1(r.dK).padStart(5)} dB, quiet-laptop Fast ${f1(r.dA).padStart(5)} dB, peak ${f1(r.dPk).padStart(5)} dB against the same sound at 1 s; heard ${r.first.at} ms after the context was made (${r.later.at} ms at 1 s)`);
      const off = [['K-weighted Fast level', r.dK], ['quiet-laptop Fast level', r.dA], ['peak', r.dPk]].filter(([, d]) => Math.abs(d) > FIRST_TOL);
      if (off.length) fail(`first sound: ${r.key} at ${sr} Hz, played at currentTime 0, is ${off.map(([what, d]) => `${f1(d)} dB in its ${what}`).join(', ')} from the same sound at 1 s (limit ${FIRST_TOL}): the glue compressor is cold${r.first.at < 150 ? ` and the sound starts after ${r.first.at} ms, inside its warm-up` : ''}`);
      else if (r.first.at < 150) fail(`first sound: ${r.key} at ${sr} Hz played at currentTime 0 is heard after ${r.first.at} ms: a voice may not start before the compressor has warmed up (LIMITS.WARM, 160 ms of context time)`);
      if (r.later.at > 40) fail(`first sound: ${r.key} at ${sr} Hz played at 1 s is heard ${r.later.at} ms late: only a sound inside the compressor's warm-up waits`);
    }
    console.log(`first sounds at ${sr} Hz: ${rows.length} sounds, the largest difference from the same sound at 1 s is ${f1(worst)} dB (limit ${FIRST_TOL})`);
  }
  const [x] = await call(`m.firstSound(48000, ['ui.tick#light'], { idle: ${FIRST_IDLE} })`);
  if (x && x.idle) {
    console.log(`after ${FIRST_IDLE} s of silence: ui.tick#light is ${f1(x.idle.dK)} dB (K-weighted Fast) and ${f1(x.idle.dA)} dB (quiet laptop) from the same sound at 1 s`);
    if (Math.abs(x.idle.dK) > FIRST_TOL || Math.abs(x.idle.dA) > FIRST_TOL) fail(`first sound: after ${FIRST_IDLE} s of silence a sound is ${f1(x.idle.dK)} / ${f1(x.idle.dA)} dB from the same sound at 1 s: the compressor goes cold again`);
  } else fail('first sound: the sound after a silence was not heard');
}

/** The tiny tier's medians as the table reads them: the K-weighted Fast level and the quiet laptop's (A-weighted Fast after the 220 Hz high-pass) of the variants themselves, not their pool members. */
const tinyMedians = (rows) => { const L = rows.filter((r) => r.tier === 'tiny' && !r.key.includes('@')); return { fast: median(L.map((r) => r.fast)), lapFastA: median(L.map((r) => r.lapFastA)) }; };
/**
 * The repair dial tone (R3-2). It is the one continuous voice and has no recipe, so no level check covered it, and on the quiet laptop its low notes sat 3 to 11 dB under the quietest tiny sound. The real
 * engine plays each of its eleven notes, in the green zone and out of it, in an OfflineAudioContext at 44.1 and 48 kHz; the steady state is read through the master chain under the two models and held within
 * DIAL_TOL of the tiny tier's median under both, and its loudest sample is held far under the tiny ceiling.
 */
async function dialCheck(call, med) {
  const NAMES = ['D4', 'E4', 'F#4', 'A4', 'B4', 'D5', 'E5', 'F#5', 'A5', 'B5', 'D6'];
  console.log(`\nrepair dial tone against the tiny tier's medians (K-weighted Fast ${f1(med.fast)} dB, quiet laptop ${f1(med.lapFastA)} dB; limit +-${DIAL_TOL} dB):`);
  for (const sr of [44100, 48000]) {
    const rows = await call(`m.dialTone(${sr})`);
    console.log(`  ${sr} Hz   out of the zone: K, laptop   |   in the zone: K, laptop     (level less the median, dB)`);
    for (const r of rows.filter((x) => !x.inZone)) {
      const z = rows.find((x) => x.i === r.i && x.inZone), sgn = (x) => [x.k - med.fast, x.a - med.lapFastA].map((v) => (v >= 0 ? '+' : '') + f1(v).padStart(4));
      console.log(`    ${NAMES[r.i].padEnd(4)}      ${sgn(r).join(' ')}              |   ${sgn(z).join(' ')}      peak ${f1(Math.max(r.pk, z.pk))} dBFS`);
      for (const x of [r, z]) {
        const dk = Math.abs(x.k - med.fast), da = Math.abs(x.a - med.lapFastA), where = `${NAMES[x.i]} ${x.inZone ? 'in the zone' : 'out of the zone'} at ${sr} Hz`;
        if (!Number.isFinite(dk) || !Number.isFinite(da)) { fail(`dial tone: ${where} is silent (the tone did not start)`); continue; }
        if (dk > DIAL_TOL) fail(`dial tone: ${where} is ${f1(x.k - med.fast)} dB from the tiny tier's median under the K-weighted Fast level (limit ${DIAL_TOL}): a flat speaker plays it ${x.k < med.fast ? 'under' : 'over'} a tiny sound`);
        if (da > DIAL_TOL) fail(`dial tone: ${where} is ${f1(x.a - med.lapFastA)} dB from the tiny tier's median under the quiet laptop's A-weighted Fast level (limit ${DIAL_TOL}): a quiet laptop plays it ${x.a < med.lapFastA ? 'under' : 'over'} a tiny sound`);
        if (x.pk > DIAL_PEAK_MAX) fail(`dial tone: ${where} peaks at ${f1(x.pk)} dBFS (limit ${DIAL_PEAK_MAX}: it is the quietest voice and sits far under the tiny ceiling)`);
      }
    }
  }
}

const srv = createServer(handler).listen(PORT, '127.0.0.1');
const b = await launch(CDP);
const fails = [], warns = [];
const fail = (m) => fails.push(m), warn = (m) => warns.push(m);
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
/** The ends of a run that checks one thing only (--leak, --first, --dial). */
const quit = (ok) => { b.close(); srv.close(); for (const f of fails) console.log(' -', f); console.log(fails.length ? fails.length + ' problems' : ok); process.exit(fails.length ? 1 : 0); };
try {
  const p = await open(b, `http://127.0.0.1:${PORT}/dev/sounds.html?check=1`);
  const call = (expr) => p.eval(`(async()=>{const m=await import('/dev/measure.js');return JSON.stringify(await (${expr}))})()`).then(JSON.parse);
  const pools = args.has('--pools');
  if (args.has('--leak')) { await leakCheck(call, pools); quit('no start clicks'); }
  if (args.has('--first')) { await firstSoundCheck(call); quit('the first sound of a context is as loud as the same sound later'); }
  if (args.has('--dial')) { // the tiny tier's medians come from one render of the sounds with the written trims
    const t0 = (await import('../js/audio/trims.js')).TRIMS, r0 = await call(`m.run(${JSON.stringify({ ...t0.sounds, ...t0.oneShots })}, false, { n: ${SURVEY_N}, lists: ${JSON.stringify(t0.noiseAt || {})} })`);
    await dialCheck(call, tinyMedians(r0.rows)); quit('every note of the dial tone is within the tiny tier\'s window');
  }
  let trims = {};
  const makeup = await call('m.makeupGain()');

  if (args.has('--calibrate')) {
    const r0 = await call(`m.run({}, true, { n: ${CALIB_N}, keep: true })`); // every member of every pool has a trim of its own
    // The ceilings hold the peak of the engine's own plays (R1): the first pass finds the lists of places in the noise, the plays are then made with them (pitch jitter, gain jitter, the place), and the second pass
    // trims with the 95th percentile of their peaks.
    const pass1 = calibrate(r0.rows, r0.shots), pk = await call(`m.sweep({}, ${JSON.stringify(pass1.lists)}, ${PLAYS_N}, { pools: true, levels: false })`);
    const withPeak = (r) => ({ ...r, peakJ: pk[r.key] ? pk[r.key].peak[0] : undefined });
    const c = calibrate(r0.rows.map(withPeak), r0.shots.map(withPeak)), sounds = {}, oneShots = c.oneShots;
    for (const k of Object.keys(c.sounds).sort((x, y) => r0.rows.findIndex((r) => r.key === x) - r0.rows.findIndex((r) => r.key === y))) sounds[k] = c.sounds[k];
    const beds0 = await call('m.runBeds({})'), beds = {};
    for (const r of beds0) if (!r.mods.length) beds[r.id] = Math.round((BED_TARGET - r.level) * 10) / 10;
    trims = { makeup: Math.round(makeup * 1000) / 1000, sounds, beds, oneShots, noiseAt: c.lists };
    writeFileSync(TRIMS_FILE, '// Calibrated trims in dB, one per variant (`id#variant`), applied as a single gain on each voice. Written by `node scripts/audio-check.mjs --calibrate`; do not edit by hand.\n'
      + '// noiseAt: the places in the shared noise (seconds) that a sound whose level moves with the place plays its noise from (a voice picks one by its seed); the others start from a random place.\n'
      + 'export const TRIMS = {\n makeup: ' + trims.makeup + ',\n sounds: ' + JSON.stringify(sounds) + ',\n beds: ' + JSON.stringify(beds) + ',\n oneShots: ' + JSON.stringify(oneShots) + ',\n noiseAt: ' + JSON.stringify(c.lists) + ',\n};\n');
    console.log('calibrated:', Object.keys(sounds).length, 'variants,', Object.keys(oneShots).length, 'one-shots,', Object.keys(beds).length, 'beds,', Object.keys(c.lists).length, 'sounds with a list of places in the noise ->', TRIMS_FILE);
  } else {
    trims = (await import('../js/audio/trims.js')).TRIMS;
  }
  const T = { ...trims.sounds, ...trims.oneShots };
  const res = await call(`m.run(${JSON.stringify(T)}, ${pools}, { n: ${SURVEY_N}, lists: ${JSON.stringify(trims.noiseAt || {})} })`);
  const bedRows = await call(`m.runBeds(${JSON.stringify(trims.beds || {})})`);

  // ---- the engine's plays of EVERY variant (R1, R7): n plays the way the engine makes them (the place in the noise, the pitch jitter, the gain jitter), drawn other than the calibration's.
  // They come first because the table below reads the peak a ceiling holds from them: the 95th percentile of these plays, not the one play the render made.
  let sw = null;
  const tierOfKey = (k) => { const [id, rest] = k.split('#'); return rest ? tierOf(id, rest.replace(/@\d+$/, '')) : 'amb'; };
  if (!args.has('--fast')) {
    const t0 = Date.now(), T0 = { ...trims.sounds, ...trims.oneShots };
    sw = await call(`m.sweep(${JSON.stringify(T0)}, ${JSON.stringify(trims.noiseAt || {})}, ${PLAYS_N}, { pools: true, seed0: ${PLAY_SEED} })`);
    sw.took = Math.round((Date.now() - t0) / 1000);
    for (const r of [...res.rows, ...res.shots]) if (sw[r.key]) r.peakJ = sw[r.key].peak[0];
  }

  // ---- the table
  const pad = (s, n) => String(s).padEnd(n), num = (x, n) => String(f1(x)).padStart(n);
  console.log(pad('sound', 30), pad('tier', 6), 'ms'.padStart(5), 'peak'.padStart(6), 'rms'.padStart(6), 'level'.padStart(6), 'dc'.padStart(6), 'clip', 'cent0'.padStart(6), 'cent1'.padStart(6), 'tail'.padStart(6), 'trim'.padStart(5), 'fastK'.padStart(6), 'fastA'.padStart(6), 'bal'.padStart(5), 'sprd'.padStart(5), ' flags');
  const rows = [...res.rows, ...res.shots];
  const tierMedian = {};
  for (const tier of ['tiny', 'medium', 'loud']) { const L = res.rows.filter((r) => r.tier === tier && !r.key.includes('@')); tierMedian[tier] = { lapFast: median(L.map((r) => r.lapFast)), fast: median(L.map((r) => r.fast)), lapFastA: median(L.map((r) => r.lapFastA)), lapMomA: median(L.map((r) => r.lapMomA)) }; }
  for (const r of rows) {
    const flags = [];
    const base = r.key.replace(/@\d+$/, '');
    const id = r.id, tier = r.tier;
    const comp = tierComp(tier, r.ms);
    const target = tier === 'amb' ? TIER_TARGET.amb : TIER_TARGET[tier] + comp + trimDbOf(id, r.v);
    const limited = peakOf(r) > TIER_CEIL[tier] - CEIL_MARGIN - 0.15; // the trim was held by the peak ceiling (and the margin the calibration keeps under it): of the engine-like plays when they were made
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
    // how far the balance between the two models moved this variant from its tier's target (it is what the trim holds, over what the level alone asks): read back from the measured figures
    const bal = tier === 'amb' ? 0 : r.trim - stage1({ ...r, level: r.level - r.trim, peak: r.peak - r.trim, peakJ: r.peakJ - r.trim });
    if (limited ? off < -2.05 - BAL_MAX || off > BAL_MAX + 0.6 : Math.abs(off) > BAL_MAX + 0.6) { fail(`${r.key}: active level ${f1(r.level)} dB is ${f1(off)} dB from its target ${f1(target)}${limited ? ' (held by the peak ceiling)' : ''}`); flags.push('LEVEL'); }
    else if (limited && off < -0.4) flags.push('held ' + f1(off));
    if (Math.abs(bal) > BAL_MAX - 0.05) flags.push('bal' + (bal > 0 ? '+' : '-'));
    if (r.spread != null && r.spread > SPREAD_MAX) { fail(`${r.key}: its Fast level moves ${f1(r.spread)} dB with the place in the noise it starts from (more than ${SPREAD_MAX}: it needs a list of places, or less random noise)`); flags.push('NOISE'); }
    if (tier !== 'amb' && r.share250 < 0.4) { fail(`${r.key}: only ${Math.round(r.share250 * 100)}% of its energy is above 250 Hz (a laptop speaker has nothing under 220 Hz: ${FAMILY.includes(base) ? 'a "no" needs a body it can play' : 'every sound needs a mid body, 2.2'})`); flags.push('BODY'); }
    const med = tierMedian[tier], soft = trimDbOf(id, r.v); // (a variant that is meant to sit under its tier, a loss twin, or over it, a medium on the interface bus, is held to its window less that softness, as stage 2 measures it)
    if (med && !r.key.includes('@')) {
      if (Math.abs(r.lapFast - med.lapFast - soft) > LAPTOP_TOL) { fail(`${r.key}: ${f1(r.lapFast)} dB K-weighted Fast level after a 220 Hz high-pass is ${f1(r.lapFast - med.lapFast)} dB from the ${tier} median ${f1(med.lapFast)} (a small speaker plays it ${r.lapFast - med.lapFast < 0 ? 'quieter' : 'louder'} than its tier)`); flags.push('LAPTOP'); }
      if (Math.abs(r.lapFastA - med.lapFastA - soft) > LAPA_TOL) { fail(`${r.key}: ${f1(r.lapFastA)} dB A-weighted Fast level after a 220 Hz high-pass is ${f1(r.lapFastA - med.lapFastA)} dB from the ${tier} median ${f1(med.lapFastA)} (a quiet laptop at about 40 phon plays it ${r.lapFastA - med.lapFastA < 0 ? 'quieter' : 'louder'} than its tier)`); flags.push('QUIET'); }
      if (Number.isFinite(r.lapMomA) && Math.abs(r.lapMomA - med.lapMomA - soft) > MOM_TOL) { fail(`${r.key}: ${f1(r.lapMomA)} dB A-weighted momentary level (400 ms) after a 220 Hz high-pass is ${f1(r.lapMomA - med.lapMomA)} dB from the ${tier} median ${f1(med.lapMomA)} (under a longer integration the quiet laptop plays it ${r.lapMomA - med.lapMomA < 0 ? 'quieter' : 'louder'} than its tier)`); flags.push('MOMENT'); }
      if (Math.abs(r.fast - med.fast - soft) > FAST_TOL) { fail(`${r.key}: ${f1(r.fast)} dB Fast level is ${f1(r.fast - med.fast)} dB from the ${tier} median ${f1(med.fast)} (a very short tick under-compensated, or a dense one over)`); flags.push('FAST'); }
    }
    console.log(pad(r.key, 30), pad(tier, 6), String(r.ms).padStart(5), num(r.peak, 6), num(r.rms, 6), num(r.level, 6), r.dc.toFixed(4).padStart(6), String(r.clipped).padStart(4), String(r.c0).padStart(6), String(r.c1).padStart(6), num(r.tail, 6), num(r.trim, 5), num(r.fast, 6), num(r.lapFastA, 6), num(bal, 5), r.spread == null ? '     ' : num(r.spread, 5), ' ' + flags.join(' '));
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
    if (by[l].lapFastA > by[g].lapFastA + 0.3) fail(`loss on a quiet laptop: ${l} (${f1(by[l].lapFastA)} dB A-weighted Fast after the high-pass) is louder than ${g} (${f1(by[g].lapFastA)} dB)`);
  }
  // The tiers do not overlap under either model of a listener (I2): the loudest tiny sound is under the quietest medium one, the loudest medium under the quietest loud one, on the K-weighted Fast level
  // and on the A-weighted Fast level after the laptop's high-pass. A loss is never quieter than the tier below it, which is the same rule read for the family that used to fall through it.
  const TIERS = ['tiny', 'medium', 'loud'], MODELS = [['fast', 'K-weighted Fast'], ['lapFast', 'K-weighted Fast after the 220 Hz high-pass'], ['lapFastA', 'quiet-laptop A-weighted Fast'], ['lapMomA', 'quiet-laptop A-weighted momentary (400 ms)']];
  for (const [f, name] of MODELS) for (let i = 1; i < TIERS.length; i++) {
    const lo = Object.values(by).filter((r) => r.tier === TIERS[i - 1]), up = Object.values(by).filter((r) => r.tier === TIERS[i]);
    const top = lo.reduce((a, r) => (r[f] > a[f] ? r : a)), bot = up.reduce((a, r) => (r[f] < a[f] ? r : a));
    console.log(`tiers under ${name}: loudest ${TIERS[i - 1]} ${top.key} ${f1(top[f])}, quietest ${TIERS[i]} ${bot.key} ${f1(bot[f])} (gap ${f1(bot[f] - top[f])} dB)`);
    if (!(bot[f] > top[f])) fail(`tiers overlap under ${name}: ${bot.key} (${TIERS[i]}, ${f1(bot[f])} dB) is not louder than ${top.key} (${TIERS[i - 1]}, ${f1(top[f])} dB)`);
    else if (bot[f] - top[f] < TIER_GAP_MIN) fail(`tiers all but touch under ${name}: ${bot.key} (${TIERS[i]}) is only ${f1(bot[f] - top[f])} dB over ${top.key} (${TIERS[i - 1]}); ${TIER_GAP_MIN} dB at least`);
    for (const r of up) if (FAMILY.includes(r.key) && r[f] < top[f]) fail(`a loss under ${name}: ${r.key} (${TIERS[i]}, ${f1(r[f])} dB) is quieter than ${top.key}, the loudest ${TIERS[i - 1]} sound (${f1(top[f])} dB)`);
  }
  if (pools) for (const r of res.rows) if (r.key.includes('@')) { const b0 = by[r.key.replace(/@\d+$/, '')]; if (b0 && Math.abs(r.level - b0.level) > 1.2) fail(`pool: ${r.key} is ${f1(r.level - b0.level)} dB from its first member`); }

  // ---- play to play (I3): the frequent sounds, played the way the engine plays them, move by a little and stay under their tier's ceiling
  for (const key of PLAY_PROBES) {
    const r = by[key]; if (!r) continue;
    const [id, v] = key.split('#'), list = JSON.stringify((trims.noiseAt || {})[key] || null), t = T[key] ?? 0;
    const pj = await call(`m.plays(${JSON.stringify(id)}, ${JSON.stringify(v)}, 0, ${t}, 32, true, ${list})`), pn = await call(`m.plays(${JSON.stringify(id)}, ${JSON.stringify(v)}, 0, ${t}, 32, false, ${list})`);
    const rg = (P, f) => Math.max(...P.map((x) => x[f])) - Math.min(...P.map((x) => x[f])), p95 = percentile(pj.map((x) => x.peak), 0.95), bias = median(pj.map((x) => x.fast)) - r.fast;
    console.log(`plays of ${pad(key, 18)}: Fast level spread ${f1(rg(pn, 'fast'))} dB (noise place and pitch only), ${f1(rg(pj, 'fast'))} dB (with the gain jitter); peak 95th percentile ${f1(p95)} dBFS (ceiling ${TIER_CEIL[r.tier]}); median ${f1(bias)} dB from the calibration`);
    if (rg(pn, 'fast') > PLAY_NOISE_SPREAD) fail(`plays: ${key} moves ${f1(rg(pn, 'fast'))} dB from play to play with only the place in the noise and the pitch varying (limit ${PLAY_NOISE_SPREAD})`);
    if (rg(pj, 'fast') > PLAY_JITTER_SPREAD) fail(`plays: ${key} moves ${f1(rg(pj, 'fast'))} dB from play to play with the engine's jitter (limit ${PLAY_JITTER_SPREAD})`);
    if (p95 > TIER_CEIL[r.tier] + 0.15) fail(`plays: the 95th percentile of ${key}'s peak over 32 jittered plays is ${f1(p95)} dBFS, over the ${r.tier} ceiling ${TIER_CEIL[r.tier]}`);
    if (Math.abs(bias) > PLAY_BIAS) fail(`plays: the median play of ${key} is ${f1(bias)} dB from the level it was calibrated at (limit ${PLAY_BIAS})`);
  }

  if (sw) {
    const took = sw.took; delete sw.took;
    let nOver = 0, nWide = 0, worstOver = -99, worstSpread = 0, worstMax = -99;
    for (const [k, x] of Object.entries(sw)) {
      const tier = tierOfKey(k), over = x.peak[0] - TIER_CEIL[tier], wideK = x.fast[2] - x.fast[0], wideA = x.lapFastA[2] - x.lapFastA[0];
      worstOver = Math.max(worstOver, over); worstMax = Math.max(worstMax, x.peak[1] - TIER_CEIL[tier]); worstSpread = Math.max(worstSpread, wideK, wideA);
      if (over > 0.15) { nOver++; fail(`plays: the 95th percentile of ${k}'s peak over ${PLAYS_N} plays the way the engine makes them is ${f1(x.peak[0])} dBFS, ${f1(over)} dB over the ${tier} ceiling ${TIER_CEIL[tier]}`); }
      if (wideK > PLAY_JITTER_SPREAD || wideA > PLAY_JITTER_SPREAD) { nWide++; fail(`plays: ${k} moves ${f1(wideK)} dB (K-weighted Fast) and ${f1(wideA)} dB (quiet-laptop A-weighted Fast) from play to play with the engine's jitter (limit ${PLAY_JITTER_SPREAD})`); }
    }
    console.log(`plays of every variant (${Object.keys(sw).length} of them, ${PLAYS_N} each, ${took} s): the 95th percentile of the peak is at most ${f1(worstOver)} dB over its tier's ceiling and the largest peak of all ${f1(worstMax)} dB over; the Fast level moves at most ${f1(worstSpread)} dB (limit ${PLAY_JITTER_SPREAD}); ${nOver} over the ceiling, ${nWide} too wide`);
  }

  // ---- a change of district (R4): two uncorrelated beds fade across each other and the level must not dip in the middle (equal-power curves of one length)
  for (const [a, c] of [['scrap', 'market'], ['harbor', 'campus'], ['tech', 'farm'], ['finance', 'industrial']]) {
    const x = await call(`m.crossfadeDip(${JSON.stringify(a)}, ${JSON.stringify(c)})`);
    console.log(`change of district ${a} to ${c} (${AMB.CROSS} s, equal power): before ${f1(x.before)} dB, after ${f1(x.after)} dB, the quietest 100 ms of the fade is ${f1(x.dip)} dB under the lower of the two (${f1(x.at)} s in)`);
    if (x.dip > CROSS_DIP_MAX) fail(`ambient: the change of district ${a} to ${c} dips ${f1(x.dip)} dB in the middle (limit ${CROSS_DIP_MAX}; two linear fades of different lengths dipped 4 to 7)`);
  }

  // ---- start clicks
  if (!args.has('--fast')) await leakCheck(call, pools);

  // ---- the first sound after the context is made (R3-1) and the repair dial tone (R3-2): the real engine, through the master chain, at both sample rates
  if (!args.has('--fast')) { await firstSoundCheck(call); await dialCheck(call, tierMedian.tiny); }

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

  // ---- through the master chain (voices at 0.6 s). The slider's gain is the taper times the headroom (docs/AUDIO.md 3.2, A2): the default is unity, 100% is +4.6 dB ahead of the compressor and the soft clip.
  if (!args.has('--fast')) {
    const own = (r) => !r.key.includes('@'), long = (r) => !(r.tier === 'tiny' && r.ms < 120);
    const group = { 'tiny (interface)': res.rows.filter((r) => own(r) && long(r) && r.tier === 'tiny' && RECIPES[r.id].bus === 'ui'), 'tiny (game)': res.rows.filter((r) => own(r) && long(r) && r.tier === 'tiny' && RECIPES[r.id].bus === 'game'),
      medium: res.rows.filter((r) => own(r) && r.tier === 'medium' && RECIPES[r.id].bus === 'game'), loud: res.rows.filter((r) => own(r) && r.tier === 'loud' && RECIPES[r.id].bus === 'game') };
    const mean = (x) => x.reduce((a, c) => a + c, 0) / x.length;
    const levelsAt = async (a, gainDb = { ui: 0, game: 0 }) => {
      const out = {};
      for (const [name, rs] of Object.entries(group)) {
        if (a.quiet && name === 'tiny (game)') continue; // the Classroom rule leaves the tiny game sounds out
        const lv = [], pk = [];
        for (const r of rs) { const x = await call(`m.throughChain(${JSON.stringify(r.id)}, ${JSON.stringify(r.v)}, ${r.trim}, ${makeup}, ${masterGain(a)}, 0, ${gainDb[RECIPES[r.id].bus]})`); lv.push(x.level); pk.push(x.peak); }
        out[name] = { level: mean(lv), peak: Math.max(...pk) };
      }
      return out;
    };
    const show = (o) => Object.entries(o).map(([k, v]) => `${k} ${f1(v.level)}`).join(', ');
    const at = {};
    for (const v of [100, DEFAULT_MASTER]) {
      at[v] = await levelsAt({ master: v, quiet: false });
      const o = at[v], gapMed = o.medium.level - o['tiny (game)'].level, gapLoud = o.loud.level - o.medium.level;
      console.log(`tier levels through the chain at volume ${v}% (gain ${f1(20 * Math.log10(masterGain({ master: v })))} dB): ${show(o)}; tiny to medium ${f1(gapMed)} dB, medium to loud ${f1(gapLoud)} dB`);
      const need = v === DEFAULT_MASTER ? 5 : 4.5; // above the default the compressor and the soft clip take 0.4 dB more off the loud tier (3.2)
      if (gapLoud < need) fail(`the medium to loud gap through the master chain is ${f1(gapLoud)} dB (${need} dB at least) at volume ${v}%`);
      if (gapMed < need) fail(`the tiny to medium gap through the master chain is ${f1(gapMed)} dB (${need} dB at least) at volume ${v}%`);
    }
    const room = await levelsAt({ master: DEFAULT_MASTER, quiet: true }, CLASSROOM_DB); // the Classroom rule: interface 6 dB lower, game 8 dB lower, tiny game sounds off, and no headroom
    console.log(`the Classroom rule at volume ${DEFAULT_MASTER}%: ${show(room)}`);
    for (const [name, o] of Object.entries(room)) { const d = at[DEFAULT_MASTER][name].level - o.level; console.log(`   ${name}: ${f1(d)} dB under Full at the same volume`); if (d < (name.includes('interface') ? -CLASSROOM_DB.ui : -CLASSROOM_DB.game)) fail(`the Classroom rule is only ${f1(d)} dB under Full for the ${name} sounds at volume ${DEFAULT_MASTER}% (it must stay clearly quieter: ${-CLASSROOM_DB.ui} dB for the interface, ${-CLASSROOM_DB.game} for the game)`); }
    for (const [name, o] of Object.entries(at[DEFAULT_MASTER])) if (o.peak > -3 + 0.15) fail(`${name} peaks at ${f1(o.peak)} dBFS at the default volume (the chain's ceiling is -3)`);
    const loudest = res.rows.filter((r) => r.tier === 'loud' && RECIPES[r.id].bus === 'game' && !r.key.includes('@')).sort((a, c) => c.level - a.level).slice(0, 12).map((r) => r.key);
    const worst = await call(`m.worstCase(${JSON.stringify(loudest)}, ${JSON.stringify(trims.sounds)}, ${makeup}, ${masterGain({ master: 100 })})`);
    console.log(`the ${loudest.length} loudest sounds at once through the chain at volume 100% peak at ${f1(worst)} dBFS`);
    if (worst > -2.9) fail(`the worst pile-up peaks at ${f1(worst)} dBFS (the chain's ceiling is -3.0)`);

    // The tiers at the speaker (R3): the checks above are before the buses. The interface bus is 3 dB under the game bus, so the interface's mediums met the loudest tiny game sound, and Classroom (interface -6, game -8,
    // no headroom, no tiny game sounds) narrows every gap again. Each variant goes through the chain on its own bus, at the default volume, in Full and in Classroom; the clear gap between one tier's loudest sound
    // and the next tier's quietest must stay over AT_BUS_GAP under the K-weighted Fast level and under the quiet laptop's.
    const everyone = res.rows.filter(own);
    for (const [label, a, gd] of [['Full', { master: DEFAULT_MASTER, quiet: false }, { ui: 0, game: 0 }], ['Classroom', { master: DEFAULT_MASTER, quiet: true }, CLASSROOM_DB]]) {
      const L = [];
      for (const r of everyone) { if (a.quiet && RECIPES[r.id].bus === 'game' && r.tier === 'tiny') continue; const x = await call(`m.throughChain(${JSON.stringify(r.id)}, ${JSON.stringify(r.v)}, ${r.trim}, ${makeup}, ${masterGain(a)}, 0, ${gd[RECIPES[r.id].bus]})`); L.push({ key: r.key, tier: r.tier, fast: x.fast, lapFastA: x.lapFastA }); }
      for (const [f, name] of [['fast', 'K-weighted Fast'], ['lapFastA', 'quiet-laptop A-weighted Fast']]) for (const [lo, hi] of [['tiny', 'medium'], ['medium', 'loud']]) {
        const A = L.filter((x) => x.tier === lo), B = L.filter((x) => x.tier === hi), top = A.reduce((p, x) => (x[f] > p[f] ? x : p)), bot = B.reduce((p, x) => (x[f] < p[f] ? x : p));
        console.log(`tiers at the speaker, ${label}, ${name}: loudest ${lo} ${top.key} ${f1(top[f])}, quietest ${hi} ${bot.key} ${f1(bot[f])} (clear gap ${f1(bot[f] - top[f])} dB)`);
        if (bot[f] - top[f] < (f === 'fast' ? AT_BUS_GAP_K : AT_BUS_GAP)) fail(`the tiers at the speaker in ${label}, ${name}: ${bot.key} (${hi}, ${f1(bot[f])}) is only ${f1(bot[f] - top[f])} dB over ${top.key} (${lo}, ${f1(top[f])}); ${f === 'fast' ? AT_BUS_GAP_K : AT_BUS_GAP} dB at least`);
      }
    }

    // A loud sound panned off centre (R8): a voice at pan 0.6 puts 2.6 dB more on its near channel than a centred one puts on either, the glue compressor and the soft clip take more off it, and it is a little quieter
    // than the same sound centred. The remedy proposed (a lower voice gain when panned) made it quieter still, so the loss is held rather than cured: not worse than 1.6 dB, and the peak under the ceiling.
    for (const k of ['zone.open#t4', 'level.up#l', 'run.end#horizon', 'alert.shock#fed']) {
      const [id, v] = k.split('#'), r = by[k]; if (!r) continue;
      for (const vol of [DEFAULT_MASTER, 100]) {
        const c = await call(`m.panChain(${JSON.stringify(id)}, ${JSON.stringify(v)}, ${r.trim}, ${makeup}, ${masterGain({ master: vol })}, 0, 0)`), p6 = await call(`m.panChain(${JSON.stringify(id)}, ${JSON.stringify(v)}, ${r.trim}, ${makeup}, ${masterGain({ master: vol })}, 0.6, 0)`);
        console.log(`${k} at pan 0.6, volume ${vol}%: ${f1(p6.fast - c.fast)} dB from the centred play (K-weighted Fast, both channels), peak ${f1(p6.peak)} dBFS`);
        if (p6.fast - c.fast < -PAN_LOSS_MAX) fail(`pan: ${k} at pan 0.6 and volume ${vol}% is ${f1(c.fast - p6.fast)} dB quieter than the same sound centred (limit ${PAN_LOSS_MAX})`);
        if (p6.peak > -3 + 0.15) fail(`pan: ${k} at pan 0.6 and volume ${vol}% peaks at ${f1(p6.peak)} dBFS (the chain's ceiling is -3)`);
      }
    }
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
