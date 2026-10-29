// Numbers for a folder of world shots (made by scripts/world-shots.mjs), so a change to the art can be judged by more than the eye.
//
//   node scripts/world-metrics.mjs DIR [--out metrics.json] [--only name,name] [--skip-slow]       measure every shot in DIR
//   node scripts/world-metrics.mjs DIR --diff OTHER_DIR [--exclude x0,y0,x1,y1;...] [--out f.json]   the visible difference between two folders, shot by shot (DIR is before, OTHER_DIR after)
//   node scripts/world-metrics.mjs DIR --anchor                                                       did the water move with the camera? reads the sea-pan-a / sea-pan-b pair and the manifest's camera move
//
// Per shot (all in scripts/lib/imagemetrics.mjs, each proved on synthetic pictures by tests/world-metrics.test.mjs):
//   seams    thin 1 or 2 pixel lines that differ from both neighbours although the neighbours match and stay flat for 4 css px each side (a lone hairline through a plain surface: the gap between two tiles,
//            a stray outline; stripes, fences and text do not count): segments of at least 10 css px; `perMpx` is the count of seam pixels per megapixel. Drawn outlines on flat ground count too: read it against the picture
//   coast    staircase along the land and water boundary, per1000 = corners per 1000 css px of coast (diamond tiles: many; a shaped shore: few), meanRun = css px between corners; null when little coast shows
//   water    the strength of pattern in the water at 2, 8 and 32 device px (RMS luminance levels): a flat gradient scores about 0, waves and foam do
//   palette  hue histogram (12 bins of 30 degrees), mean saturation and brightness of the water, the land and the whole frame
// `summary` averages them over the shots (the time-of-day shots and the pan and zoom pairs are left out of the averages so the numbers compare between runs of different sets).
// --diff: for each shot present in both folders (same size): `meanAbs` (mean absolute difference over R, G, B, 0 to 255), `share` (the share of pixels where some channel differs by more than 12 of 255)
// and `identical` (every pixel the same). Shots are the canvas alone, so the whole picture is the world area; --exclude lists css-pixel rectangles to leave out (a HUD in a .full.png).
// --anchor: B's water against A's moved by the camera's move (anchored, still, shifted; see anchorScore), for each shot whose manifest entry has `shiftDevicePx` (the pan pair).
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { decodePng } from './lib/png.mjs';
import { waterMask, seamScan, coastJag, bandPattern, palette, diffImages, anchorScore, fnv1a } from './lib/imagemetrics.mjs';

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

if (arg('anchor', false)) {
  const man = manifestOf(dir), res = {};
  if (!man) { console.error('no manifest.json in ' + dir); process.exit(2); }
  for (const s of man.shots.filter((x) => x.shiftDevicePx && x.panFrom)) {
    const A = load(dir, s.panFrom), B = load(dir, s.name), shift = s.shiftDevicePx.map(Math.round);
    res[`${s.panFrom} -> ${s.name}`] = { camera: shift, ...anchorScore(A, B, shift, { r: Math.round(3 * (s.canvas.w / s.canvas.css[0])) }) };
  }
  out({ dir, anchored: res, summary: { pairs: Object.keys(res).length, anchored: Object.values(res).filter((r) => r.anchored).length, inconclusive: Object.values(res).filter((r) => r.inconclusive).length } });
  process.exit(0);
}

const man = manifestOf(dir), names = shotsIn(dir).filter((n) => !only || only.has(n)), res = {};
for (const n of names) {
  const t0 = Date.now(), img = load(dir, n), dsf = dsfOf(man, n, img), mask = waterMask(img), row = { size: [img.width, img.height], dsf, hash: fnv1a(img.data) };
  if (!arg('skip-slow', false)) {
    row.seams = seamScan(img, { minLen: Math.round(10 * dsf), flat: Math.round(4 * dsf) });
    row.coast = coastJag(img, { dsf, water: mask });
    row.water = bandPattern(img, mask, [2, 8, 32].map((s) => Math.round(s * dsf)));
  }
  row.palette = palette(img, mask);
  res[n] = row; console.error(`${n.padEnd(24)} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
const pool = Object.entries(res).filter(([n]) => AVERAGED(n)).map(([, r]) => r), has = pool.some((r) => r.seams);
out({
  dir, rig: man?.rig ?? null, git: man?.git ?? null, options: man?.options ?? null, shots: res,
  summary: {
    shots: names.length, averagedOver: pool.length,
    ...(has ? {
      seamPixelsPerMpx: mean(pool.map((r) => r.seams.perMpx)), seamSegments: pool.reduce((s, r) => s + r.seams.segments, 0),
      coastJagPer1000: mean(pool.map((r) => r.coast.per1000)), coastMeanRunCss: mean(pool.map((r) => r.coast.meanRun)),
      waterPatternRms: mean(pool.filter((r) => r.water.waterShare > 0.03).map((r) => r.water.total)),
      waterPatternByScale: [0, 1, 2].map((k) => mean(pool.filter((r) => r.water.waterShare > 0.03).map((r) => r.water.scales[k].rms))),
    } : {}),
    waterShare: mean(pool.map((r) => r.palette.water.share)),
    landSaturation: mean(pool.map((r) => r.palette.land.saturation)), landBrightness: mean(pool.map((r) => r.palette.land.brightness)),
    waterSaturation: mean(pool.map((r) => r.palette.water.saturation)), waterBrightness: mean(pool.map((r) => r.palette.water.brightness)),
    frameSaturation: mean(pool.map((r) => r.palette.frame.saturation)), frameBrightness: mean(pool.map((r) => r.palette.frame.brightness)),
  },
});
