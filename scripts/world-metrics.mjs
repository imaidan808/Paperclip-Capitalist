// Numbers for a folder of world shots (made by scripts/world-shots.mjs), so a change to the art can be judged by more than the eye.
//
//   node scripts/world-metrics.mjs DIR [--out metrics.json] [--only name,name] [--skip-slow]       measure every shot in DIR
//   node scripts/world-metrics.mjs DIR --diff OTHER_DIR [--exclude x0,y0,x1,y1;...] [--out f.json]   the visible difference between two folders, shot by shot (DIR is before, OTHER_DIR after)
//   node scripts/world-metrics.mjs DIR --anchor                                                       did the water move and scale with the camera? reads every pan pair, the drift pair and the zoom pair of the manifest. EXIT CODE: 0 every pair
//                                                                                                      anchored, 1 a pair is not (a screen-space sea), 2 nothing proven (no pair, no manifest, or water too flat to tell)
//   node scripts/world-metrics.mjs DIR --unpainted                                                    exit 1 when any shot has a pixel the world never painted (black or transparent: a sea that ends where its bitmap does)
//
// Per shot (all in scripts/lib/imagemetrics.mjs, each proved on synthetic pictures by tests/world-metrics.test.mjs):
//   landSeams the same scan at 4 levels (minDiff) over the land only: the faint crack where two tiles of the ground meet, which the 18-level scan cannot see (the sea's own dashes are not counted: they are the water's)
//   seams    thin 1 or 2 pixel lines that differ from both neighbours although the neighbours match and stay flat for 4 css px each side (a lone hairline through a plain surface: the gap between two tiles,
//            a stray outline; stripes, fences and text do not count): segments of at least 10 css px; `perMpx` is the count of seam pixels per megapixel. Drawn outlines on flat ground count too: read it against the picture
//   coast    staircase along the land and water boundary, per1000 = corners per 1000 css px of coast (diamond tiles: many; a shaped shore: few), meanRun = css px between corners; null when little coast shows
//   water    the strength of pattern in the water at 2, 8 and 32 device px (RMS luminance levels): a flat gradient scores about 0, waves and foam do
//   palette  hue histogram (12 bins of 30 degrees), mean saturation and brightness of the water, the land and the whole frame
// `summary` averages them over the shots (the time-of-day shots and the pan and zoom pairs are left out of the averages so the numbers compare between runs of different sets).
// --diff: for each shot present in both folders (same size): `meanAbs` (mean absolute difference over R, G, B, 0 to 255), `share` (the share of pixels where some channel differs by more than 12 of 255)
// and `identical` (every pixel the same). Shots are the canvas alone, so the whole picture is the world area; --exclude lists css-pixel rectangles to leave out (a HUD in a .full.png).
// --anchor: for each shot whose manifest entry has `shiftDevicePx` (a pan pair), B's water against A's moved by the camera's move (anchored, still, shifted; see anchorScore); when the pair was drawn at two
// clock times (`t` differs: the motion-on pair) the water may also have drifted, by at most 0.1 tile a second (4.525 world pixels), and the best match within that residual counts (driftScore); and for each
// shot with `zoomFrom` (the zoom pair), B against A mapped through the zoom, the detail compared at matching world scales (scaleScore). A pair that is not anchored fails the run.
// --unpainted: the count and the bounding box of pixels painted by nothing, per shot; the run fails when any shot has one.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { decodePng } from './lib/png.mjs';
import { waterMask, seamScan, coastJag, bandPattern, palette, diffImages, anchorScore, driftScore, scaleScore, unpainted, fnv1a } from './lib/imagemetrics.mjs';

const argv = process.argv.slice(2), dir = argv[0] && !argv[0].startsWith('--') ? argv[0] : null;
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[i + 1]); };
if (!dir) { console.error('usage: node scripts/world-metrics.mjs DIR [--out f.json] [--only a,b] [--diff OTHER_DIR [--exclude x0,y0,x1,y1;...]] [--anchor] [--skip-slow]'); process.exit(2); }

const manifestOf = (d) => { try { return JSON.parse(readFileSync(`${d}/manifest.json`, 'utf8')); } catch { return null; } };
const shotsIn = (d) => readdirSync(d).filter((f) => f.endsWith('.png') && !f.endsWith('.full.png')).map((f) => f.slice(0, -4)).sort();
const only = arg('only', null) ? new Set(String(arg('only')).split(',')) : null;
const load = (d, n) => decodePng(readFileSync(`${d}/${n}.png`));
const dsfOf = (man, name, img) => { const s = man?.shots?.find((x) => x.name === name); return s?.canvas ? s.canvas.w / s.canvas.css[0] : (man?.options?.dsf ? Math.min(2, man.options.dsf) : (img.width >= 2800 ? 2 : 1)); };
const mean = (a) => { const v = a.filter((x) => x != null && Number.isFinite(x)); return v.length ? +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(3) : null; };
const compact = (v, ind = '') => { // JSON with short arrays and objects kept on one line, so a metrics file reads like a table
  const flat = JSON.stringify(v);
  if (v === null || typeof v !== 'object' || flat.length <= 110) return flat === undefined ? 'null' : flat.replace(/,"/g, ', "').replace(/":/g, '": ');
  const pad = ind + '  ';
  if (Array.isArray(v)) return '[\n' + v.map((x) => pad + compact(x, pad)).join(',\n') + '\n' + ind + ']';
  return '{\n' + Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => pad + JSON.stringify(k) + ': ' + compact(x, pad)).join(',\n') + '\n' + ind + '}';
};
const out = (o) => { const text = compact(o); if (arg('out', null)) writeFileSync(String(arg('out')), text + '\n'); console.log(text); };
const AVERAGED = (name) => !/^(tod-|sea-pan|sea-zoom)/.test(name) && name !== 'city-close'; // the plain scenes of the first state

if (arg('diff', null)) {
  const other = String(arg('diff')), a = new Set(shotsIn(dir)), b = new Set(shotsIn(other)), names = [...a].filter((n) => b.has(n) && (!only || only.has(n)));
  const excl = String(arg('exclude', '')).split(';').filter(Boolean).map((r) => r.split(',').map(Number)), res = {};
  for (const n of names) {
    const A = load(dir, n), B = load(other, n), dsf = dsfOf(manifestOf(dir), n, A);
    res[n] = diffImages(A, B, { exclude: excl.map(([x0, y0, x1, y1]) => [x0 * dsf, y0 * dsf, x1 * dsf, y1 * dsf].map(Math.round)) });
  }
  const ok = Object.values(res).filter((r) => !r.error);
  out({ before: dir, after: other, onlyBefore: [...a].filter((n) => !b.has(n)), onlyAfter: [...b].filter((n) => !a.has(n)), shots: res,
    summary: { compared: ok.length, identical: ok.filter((r) => r.identical).length, allIdentical: ok.length > 0 && ok.every((r) => r.identical) && Object.values(res).every((r) => !r.error), meanAbs: mean(ok.map((r) => r.meanAbs)), meanShare: mean(ok.map((r) => r.share)), errors: Object.entries(res).filter(([, r]) => r.error).map(([n, r]) => n + ': ' + r.error) } });
  process.exit(0);
}

/** The sea's own drift the art direction allows (5.3): 0.1 tile a second, one tile being 45.25 world pixels along the water plane's diagonal. */
const DRIFT_WPX_PER_S = 0.1 * 45.25, RASTER_SLACK_DPX = 2;
if (arg('anchor', false)) {
  const man = manifestOf(dir), res = {};
  if (!man) { console.error('no manifest.json in ' + dir); process.exit(2); }
  const by = (n) => man.shots.find((x) => x.name === n), dsfOfShot = (s) => s.canvas.w / s.canvas.css[0];
  for (const s of man.shots.filter((x) => x.shiftDevicePx && x.panFrom)) {
    const a = by(s.panFrom), A = load(dir, s.panFrom), B = load(dir, s.name), shift = s.shiftDevicePx.map(Math.round), dsf = dsfOfShot(s), dt = s.t != null && a?.t != null ? Math.abs(s.t - a.t) : 0, r = Math.round(3 * dsf);
    if (dt > 0) { const max = (DRIFT_WPX_PER_S * s.cam.z * dsf * dt) / 1000 + RASTER_SLACK_DPX; res[`${s.panFrom} -> ${s.name}`] = { kind: 'pan with the clock running', camera: shift, dtMs: dt, maxDriftDevicePx: +max.toFixed(2), ...driftScore(A, B, shift, max, { r }) }; }
    else res[`${s.panFrom} -> ${s.name}`] = { kind: 'pan', camera: shift, ...anchorScore(A, B, shift, { r }) };
  }
  for (const s of man.shots.filter((x) => x.zoomFrom)) {
    const a = by(s.zoomFrom); if (!a) continue;
    const A = load(dir, s.zoomFrom), B = load(dir, s.name), dsf = dsfOfShot(s), k = s.cam.z / a.cam.z, W = s.canvas.css[0], H = s.canvas.css[1];
    // a world point at A's device pixel (x, y) is at (k x + tx, k y + ty) in B: x_B = dpr W/2 + dpr z_B (camA.x - camB.x) + k (x_A - dpr W/2)
    const tx = dsf * (W / 2) * (1 - k) + dsf * s.cam.z * (a.cam.x - s.cam.x), ty = dsf * (H / 2) * (1 - k) + dsf * s.cam.z * (a.cam.y - s.cam.y);
    res[`${s.zoomFrom} -> ${s.name}`] = { kind: 'zoom', k: +k.toFixed(3), ...scaleScore(A, B, { k, tx, ty }, { r: Math.round(6 * dsf) }) };
  }
  const all = Object.values(res), failed = all.filter((r) => !r.anchored && !r.inconclusive && !r.error).length, inconclusive = all.filter((r) => r.inconclusive || r.error).length;
  const summary = { pairs: all.length, anchored: all.filter((r) => r.anchored).length, inconclusive, failed, verdict: !all.length ? 'nothing to judge: no pan or zoom pair in the manifest (shoot --set pan)' : failed ? 'FAIL: the water is not anchored to the world' : inconclusive ? 'inconclusive: the water has too little detail to tell' : 'pass' };
  out({ dir, anchored: res, summary });
  process.exit(!all.length ? 2 : failed ? 1 : inconclusive ? 2 : 0);
}

if (arg('unpainted', false)) {
  const res = {}; let bad = 0;
  for (const n of shotsIn(dir).filter((x) => !only || only.has(x))) { const r = unpainted(load(dir, n)); res[n] = r; if (r.count) bad++; }
  out({ dir, shots: res, summary: { shots: Object.keys(res).length, withUnpainted: bad, verdict: bad ? 'FAIL: pixels the world never painted' : 'pass' } });
  process.exit(bad ? 1 : 0);
}

const man = manifestOf(dir), names = shotsIn(dir).filter((n) => !only || only.has(n)), res = {};
for (const n of names) {
  const t0 = Date.now(), img = load(dir, n), dsf = dsfOf(man, n, img), mask = waterMask(img), row = { size: [img.width, img.height], dsf, hash: fnv1a(img.data) };
  if (!arg('skip-slow', false)) {
    row.seams = seamScan(img, { minLen: Math.round(10 * dsf), flat: Math.round(4 * dsf) });
    // the faint seams: a line a few levels off its neighbours between two tiles of the ground (the crack where two anti-aliased edges meet shows 4 to 12 levels of the sea or the fog through), which the 18-level
    // scan above never sees. Land only (the water's own dashes are the sea's, T1), and only a line that is lone: flat on both sides for 4 css px.
    const land = new Uint8Array(mask.length); for (let i = 0; i < mask.length; i++) land[i] = mask[i] ? 0 : 1;
    row.landSeams = seamScan(img, { minLen: Math.round(10 * dsf), flat: Math.round(4 * dsf), minDiff: 4, tolSame: 3, region: land });
    row.coast = coastJag(img, { dsf, water: mask });
    row.water = bandPattern(img, mask, [2, 8, 32].map((s) => Math.round(s * dsf)));
  }
  row.palette = palette(img, mask);
  row.unpainted = unpainted(img);
  res[n] = row; console.error(`${n.padEnd(24)} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
const pool = Object.entries(res).filter(([n]) => AVERAGED(n)).map(([, r]) => r), has = pool.some((r) => r.seams);
out({
  dir, rig: man?.rig ?? null, git: man?.git ?? null, options: man?.options ?? null, shots: res,
  summary: {
    shots: names.length, averagedOver: pool.length,
    ...(has ? {
      seamPixelsPerMpx: mean(pool.map((r) => r.seams.perMpx)), seamSegments: pool.reduce((s, r) => s + r.seams.segments, 0), landSeamPixelsPerMpx: mean(pool.map((r) => r.landSeams.perMpx)), landSeamSegments: pool.reduce((s, r) => s + r.landSeams.segments, 0),
      coastJagPer1000: mean(pool.map((r) => r.coast.per1000)), coastMeanRunCss: mean(pool.map((r) => r.coast.meanRun)),
      waterPatternRms: mean(pool.filter((r) => r.water.waterShare > 0.03).map((r) => r.water.total)),
      waterPatternByScale: [0, 1, 2].map((k) => mean(pool.filter((r) => r.water.waterShare > 0.03).map((r) => r.water.scales[k].rms))),
    } : {}),
    unpaintedMaxShare: Math.max(0, ...Object.values(res).map((r) => r.unpainted.share)),
    waterShare: mean(pool.map((r) => r.palette.water.share)),
    landSaturation: mean(pool.map((r) => r.palette.land.saturation)), landBrightness: mean(pool.map((r) => r.palette.land.brightness)),
    waterSaturation: mean(pool.map((r) => r.palette.water.saturation)), waterBrightness: mean(pool.map((r) => r.palette.water.brightness)),
    frameSaturation: mean(pool.map((r) => r.palette.frame.saturation)), frameBrightness: mean(pool.map((r) => r.palette.frame.brightness)),
  },
});
