// The shot rig's image measurements (scripts/lib/imagemetrics.mjs) and PNG codec (scripts/lib/png.mjs): each metric is shown to catch the fault it is named for on a synthetic picture
// (a planted seam, a planted staircase, a flat gradient, a screen-fixed texture) and to ignore a clean one. These are pure functions over RGBA buffers, so no browser is needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from '../scripts/lib/png.mjs';
import { seamScan, coastJag, bandPattern, palette, diffImages, anchorScore, waterMask, isWater, fnv1a, hsv } from '../scripts/lib/imagemetrics.mjs';

const img = (w, h, f) => { const data = new Uint8Array(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = f(x, y), o = (y * w + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255; } return { width: w, height: h, data }; };
const put = (im, x, y, c) => { if (x < 0 || y < 0 || x >= im.width || y >= im.height) return; const o = (y * im.width + x) * 4; im.data[o] = c[0]; im.data[o + 1] = c[1]; im.data[o + 2] = c[2]; };
const GREEN = [100, 130, 70], WATER = [40, 80, 120];
const hash = (x, y) => { let h = Math.imul(x * 374761393 + y * 668265263, 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---------------------------------------------------------------------------------------------------------------------------- png
test('png: an image survives encode and decode exactly', () => {
  const a = img(37, 23, (x, y) => [(x * 7) & 255, (y * 11) & 255, (x * y) & 255]);
  const b = decodePng(encodePng(a));
  assert.equal(b.width, 37); assert.equal(b.height, 23); assert.deepEqual(Array.from(b.data), Array.from(a.data));
});
test('png: every row filter (none, sub, up, average, paeth) is reversed, for RGB and for grey', () => {
  const crc = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return (b) => { let c = 0xffffffff; for (const v of b) c = t[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
  const chunk = (name, body) => { const out = Buffer.alloc(12 + body.length); out.writeUInt32BE(body.length, 0); out.write(name, 4, 'latin1'); Buffer.from(body).copy(out, 8); out.writeUInt32BE(crc(out.subarray(4, 8 + body.length)), 8 + body.length); return out; };
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (const [type, bpp] of [[2, 3], [0, 1]]) {
    const w = 9, h = 5, stride = w * bpp, px = new Uint8Array(stride * h).map((_, i) => (i * 37 + (i >> 3) * 5) & 255), raw = Buffer.alloc((stride + 1) * h);
    for (let y = 0; y < h; y++) {
      const f = y % 5; raw[y * (stride + 1)] = f;
      for (let i = 0; i < stride; i++) {
        const cur = px[y * stride + i], a = i >= bpp ? px[y * stride + i - bpp] : 0, b = y ? px[(y - 1) * stride + i] : 0, c = i >= bpp && y ? px[(y - 1) * stride + i - bpp] : 0;
        raw[y * (stride + 1) + 1 + i] = (cur - [0, a, b, (a + b) >> 1, paeth(a, b, c)][f]) & 255;
      }
    }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = type;
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', [])]);
    const d = decodePng(png);
    for (let i = 0; i < w * h; i++) for (let k = 0; k < 3; k++) assert.equal(d.data[i * 4 + k], px[i * bpp + (bpp === 3 ? k : 0)], `type ${type} pixel ${i}`);
  }
});
test('png: something that is not a PNG is refused', () => { assert.throws(() => decodePng(Buffer.from('hello world, this is long enough to pass the length check')), /not a PNG/); });

// ---------------------------------------------------------------------------------------------------------------------------- seams
test('seams: a one pixel line between two tiles of one colour is found, as a vertical, a horizontal and a diagonal', () => {
  for (const [name, draw] of [
    ['vertical', (im) => { for (let y = 10; y < 100; y++) put(im, 80, y, [170, 180, 120]); }],
    ['horizontal', (im) => { for (let x = 10; x < 150; x++) put(im, x, 60, [170, 180, 120]); }],
    ['diagonal (2 to 1, as a tile edge)', (im) => { for (let x = 10; x < 150; x++) put(im, x, 20 + (x >> 1), [170, 180, 120]); }],
  ]) {
    const im = img(160, 120, () => GREEN); draw(im);
    const r = seamScan(im);
    assert.ok(r.segments >= 1 && r.pixels >= 60, `${name}: ${JSON.stringify(r)}`);
  }
});
test('seams: a two pixel line is found, a four pixel stripe is not (that is a road, not a seam)', () => {
  const two = img(160, 120, () => GREEN); for (let y = 0; y < 120; y++) { put(two, 80, y, [170, 180, 120]); put(two, 81, y, [170, 180, 120]); }
  assert.ok(seamScan(two).pixels >= 100);
  const four = img(160, 120, () => GREEN); for (let y = 0; y < 120; y++) for (let x = 80; x < 84; x++) put(four, x, y, [170, 180, 120]);
  assert.equal(seamScan(four).pixels, 0);
});
test('seams: a clean picture scores zero (flat fill, smooth gradient, a hard edge, isolated dust)', () => {
  assert.equal(seamScan(img(160, 120, () => GREEN)).pixels, 0);
  assert.equal(seamScan(img(160, 120, (x, y) => [60 + x / 4, 90 + y / 4, 120])).pixels, 0);
  assert.equal(seamScan(img(160, 120, (x) => (x < 80 ? GREEN : WATER))).pixels, 0, 'an edge between two colours is a coast, not a seam');
  const dust = img(160, 120, () => GREEN); for (let i = 0; i < 40; i++) put(dust, 3 + (i * 37) % 150, 3 + (i * 53) % 110, [250, 250, 250]);
  assert.equal(seamScan(dust).pixels, 0, 'single specks are shorter than a segment');
});
test('seams: with `flat`, a lone line through a plain tile counts and a run of stripes (a hatched ramp) does not', () => {
  const lone = img(160, 120, () => GREEN); for (let y = 0; y < 120; y++) put(lone, 80, y, [170, 180, 120]);
  const stripes = img(160, 120, () => GREEN); for (let y = 0; y < 120; y++) for (let x = 20; x < 140; x += 4) put(stripes, x, y, [170, 180, 120]);
  assert.ok(seamScan(lone, { flat: 4 }).pixels >= 100, 'a lone line stays found');
  assert.ok(seamScan(stripes, { flat: 0 }).pixels > 1000, 'every stripe is a thin line without the requirement');
  assert.equal(seamScan(stripes, { flat: 4 }).pixels, 0, 'stripes 4 px apart are not flat for 4 px');
});
test('seams: a region keeps the scan to where it is asked to look', () => {
  const im = img(160, 120, () => GREEN); for (let y = 10; y < 100; y++) put(im, 80, y, [170, 180, 120]);
  const left = new Uint8Array(160 * 120); for (let y = 0; y < 120; y++) for (let x = 0; x < 60; x++) left[y * 160 + x] = 1;
  assert.equal(seamScan(im, { region: left }).pixels, 0);
});

// ---------------------------------------------------------------------------------------------------------------------------- coast
const shore = (xOf) => img(300, 420, (x, y) => (x < xOf(y) ? WATER : GREEN));
test('coast jag: a staircase shore scores many times a smooth one, a straight one scores none', () => {
  const tri = (y, period, amp) => { const t = (y % period) / period; return amp * (t < 0.5 ? t * 2 : 2 - t * 2); };
  const stairs = coastJag(shore((y) => 120 + tri(y, 64, 16)));
  const smooth = coastJag(shore((y) => 150 + 20 * Math.sin(y * 2 * Math.PI / 300)));
  const straight = coastJag(shore((y) => 100 + y * 0.3));
  assert.ok(stairs.per1000 >= 15, 'staircase: ' + JSON.stringify(stairs));
  assert.ok(smooth.per1000 <= 3, 'smooth: ' + JSON.stringify(smooth));
  assert.equal(straight.per1000, 0, 'straight: ' + JSON.stringify(straight));
  assert.ok(stairs.per1000 > smooth.per1000 * 5);
  assert.ok(stairs.meanRun > 20 && stairs.meanRun < 50, 'a step every 32 px: ' + stairs.meanRun);
});
test('coast jag: a shore drawn at twice the density reads the same per css pixel', () => {
  const tri = (y, period, amp) => { const t = (y % period) / period; return amp * (t < 0.5 ? t * 2 : 2 - t * 2); };
  const one = coastJag(shore((y) => 120 + tri(y, 64, 16)), { dsf: 1 });
  const two = coastJag(img(600, 840, (x, y) => (x < 240 + 2 * tri(y / 2, 64, 16) ? WATER : GREEN)), { dsf: 2 });
  assert.ok(Math.abs(one.per1000 - two.per1000) <= one.per1000 * 0.25, `${one.per1000} against ${two.per1000}`);
});
test('coast jag: no shore, no number', () => {
  assert.equal(coastJag(img(200, 200, () => WATER)).per1000, null);
  assert.equal(coastJag(img(200, 200, () => GREEN)).per1000, null);
});
test('water is blue to turquoise, not grey, not green, not sand', () => {
  for (const c of [[40, 80, 120], [20, 120, 140], [8, 17, 31], [60, 100, 200]]) assert.ok(isWater(...c), c.join());
  for (const c of [[100, 130, 70], [210, 190, 140], [90, 90, 95], [0, 0, 0], [200, 60, 50]]) assert.ok(!isWater(...c), c.join());
  for (const c of [[45, 48, 60], [110, 118, 135], [70, 80, 95]]) assert.ok(!isWater(...c), 'blue-grey (tarmac, fog) is not water: ' + c.join());
  const m = waterMask(img(10, 10, (x) => (x < 4 ? WATER : GREEN))); assert.equal(m.reduce((a, b) => a + b, 0), 40);
});
test('water mask: a small blue thing (a sign, a barrel) on land is not water, a sea is', () => {
  const im = img(200, 200, (x, y) => (x < 100 ? WATER : (x >= 150 && x < 156 && y >= 50 && y < 56 ? [30, 90, 200] : GREEN)));
  const m = waterMask(im); let sea = 0, sign = 0;
  for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) { if (x < 100) sea += m[y * 200 + x]; else if (x >= 150 && x < 156 && y >= 50 && y < 56) sign += m[y * 200 + x]; }
  assert.equal(sea, 100 * 200); assert.equal(sign, 0);
  assert.equal(waterMask(im, undefined, { minArea: 0 })[55 * 200 + 155], 1, 'with no minimum the sign is kept');
});

// ---------------------------------------------------------------------------------------------------------------------------- water pattern
test('water pattern: a flat gradient scores about zero, waves and foam do not', () => {
  const flat = img(240, 240, (x, y) => [30 + y / 24, 70 + y / 12, 110 + y / 12]);
  const waves = img(240, 240, (x, y) => { const t = 10 * Math.sin(x / 1.7 + y / 9) + 9 * Math.sin((x + y) / 5) + 8 * Math.sin(y / 14 + x / 40); return [30 + t / 2, 70 + t, 110 + t]; });
  const grain = img(240, 240, (x, y) => { const t = (hash(x, y) - 0.5) * 60; return [30, 70 + t, 110 + t]; });
  const a = bandPattern(flat, null, [2, 8, 32]), b = bandPattern(waves, null, [2, 8, 32]), c = bandPattern(grain, null, [2, 8, 32]);
  assert.ok(a.total < 0.3, 'flat: ' + JSON.stringify(a));
  assert.ok(b.total > 3 && c.total > 3, `waves ${b.total}, grain ${c.total}`);
  assert.ok(b.scales[1].rms > 1, 'the 8 px scale sees the waves');
  assert.ok(c.scales[0].rms > b.scales[0].rms * 0.5 || c.scales[0].rms > 1, 'the 2 px scale sees grain');
});
test('water pattern: only water is measured', () => {
  const half = img(240, 240, (x, y) => (x < 120 ? [30, 70, 110] : [100 + hash(x, y) * 120, 130, 70])); // calm water beside noisy land
  const r = bandPattern(half, null, [2, 8]); assert.ok(r.total < 0.3, JSON.stringify(r)); assert.ok(Math.abs(r.waterShare - 0.5) < 0.02);
});

// ---------------------------------------------------------------------------------------------------------------------------- palette
test('palette: water and land are described apart', () => {
  const p = palette(img(100, 100, (x) => (x < 50 ? WATER : GREEN)));
  assert.ok(Math.abs(p.water.share - 0.5) < 0.01 && Math.abs(p.land.share - 0.5) < 0.01);
  assert.equal(p.water.dominant[0].hue, 210); assert.equal(p.land.dominant[0].hue, 90);
  assert.ok(p.water.saturation > 0.6 && p.land.saturation > 0.4 && p.land.saturation < 0.6);
  assert.deepEqual(p.land.rgb, GREEN);
  assert.ok(Math.abs(hsv(...WATER)[0] - 210) < 1);
});
test('palette: grey does not vote for a hue', () => {
  const p = palette(img(50, 50, () => [90, 90, 95]));
  assert.equal(p.frame.greyShare, 1); assert.equal(p.frame.dominant.length, 0);
});

// ---------------------------------------------------------------------------------------------------------------------------- difference
test('difference: the same picture is identical, a changed tenth is a tenth, an excluded tenth is not counted', () => {
  const a = img(100, 100, () => GREEN), b = img(100, 100, (x, y) => (y < 10 ? [GREEN[0] + 40, GREEN[1], GREEN[2]] : GREEN));
  const same = diffImages(a, a); assert.equal(same.identical, true); assert.equal(same.meanAbs, 0); assert.equal(same.share, 0);
  const d = diffImages(a, b); assert.equal(d.identical, false); assert.ok(Math.abs(d.share - 0.1) < 1e-9); assert.ok(Math.abs(d.meanAbs - 40 / 3 / 10) < 0.01);
  const e = diffImages(a, b, { exclude: [[0, 0, 100, 10]] }); assert.equal(e.share, 0); assert.equal(e.identical, true); assert.equal(e.counted, 9000);
  const small = diffImages(a, img(100, 100, () => [GREEN[0] + 5, GREEN[1], GREEN[2]])); assert.equal(small.share, 0); assert.ok(small.meanAbs > 0);
  assert.ok(diffImages(a, img(50, 50, () => GREEN)).error);
});
test('fnv1a: equal bytes give equal hashes, one changed byte does not', () => {
  const a = new Uint8Array([1, 2, 3, 4]), b = new Uint8Array([1, 2, 3, 4]), c = new Uint8Array([1, 2, 3, 5]);
  assert.equal(fnv1a(a), fnv1a(b)); assert.notEqual(fnv1a(a), fnv1a(c)); assert.match(fnv1a(a), /^[0-9a-f]{8}$/);
});

// ---------------------------------------------------------------------------------------------------------------------------- anchoring
// a sea texture in world coordinates (a few waves at unrelated spacings), sampled through a camera at (cx, cy)
const sea = (wx, wy) => { const t = 9 * Math.sin(wx / 7.3 + wy / 19) + 8 * Math.sin((wx - wy) / 5.1) + 7 * Math.sin(wy / 3.7 + wx / 23) + 6 * Math.sin((wx + 2 * wy) / 11.9); return [30 + t / 3, 70 + t / 2, 110 + t]; };
test('anchoring: water that moves with the camera is anchored; water fixed to the screen is not; flat water cannot say', () => {
  const W = 320, H = 240, dx = 37, dy = 19; // the camera moves by (dx, dy): a world point at (x + dx, y + dy) in A is at (x, y) in B
  const A = img(W, H, (x, y) => sea(x, y)), B = img(W, H, (x, y) => sea(x + dx, y + dy));
  const ok = anchorScore(A, B, [dx, dy]); assert.ok(ok.anchored && ok.shifted > 0.9 && ok.still < 0.5, JSON.stringify(ok));
  const stuckB = img(W, H, (x, y) => sea(x, y)); // the texture does not move at all
  const bad = anchorScore(A, stuckB, [dx, dy]); assert.ok(!bad.anchored && !bad.inconclusive && bad.still > 0.9 && bad.shifted < 0.5, JSON.stringify(bad));
  const flat = img(W, H, (x, y) => [30 + y / 30, 70 + y / 15, 110 + y / 15]);
  const none = anchorScore(flat, flat, [dx, dy]); assert.ok(none.inconclusive && !none.anchored, JSON.stringify(none));
});
test('anchoring: a screen-space tint over anchored water does not fool it (the detail is compared, not the shade)', () => {
  const W = 320, H = 240, dx = 41, dy = 23, tint = (x, y, c) => c.map((v) => v * (0.8 + 0.2 * Math.sin(x / 90 + y / 70)));
  const A = img(W, H, (x, y) => tint(x, y, sea(x, y))), B = img(W, H, (x, y) => tint(x, y, sea(x + dx, y + dy)));
  const r = anchorScore(A, B, [dx, dy]); assert.ok(r.anchored, JSON.stringify(r));
});
test('anchoring: a shore that moves with the camera does not make screen-fixed water look anchored', () => {
  const W = 320, H = 240, dx = 37, dy = 19, shore = (x, y) => x + y * 0.4 < 110 ? 'water' : 'land'; // the coast is a diagonal line fixed in the world
  const A = img(W, H, (x, y) => (shore(x, y) === 'water' ? sea(x, y) : GREEN)), B = img(W, H, (x, y) => (shore(x + dx, y + dy) === 'water' ? sea(x, y) : GREEN)); // the shore is carried by the camera, the waves are not
  const r = anchorScore(A, B, [dx, dy]); assert.ok(!r.anchored, JSON.stringify(r));
});

// ---------------------------------------------------------------------------------------------------------------------------- the scripts, without a browser
const script = (name) => fileURLToPath(new URL(`../scripts/${name}`, import.meta.url));
const run = (name, ...args) => spawnSync(process.execPath, [script(name), ...args], { encoding: 'utf8', timeout: 60000 });
const folder = (files, manifest) => { const d = mkdtempSync(tmpdir() + '/pc-rig-'); for (const [n, im] of Object.entries(files)) writeFileSync(`${d}/${n}.png`, encodePng(im)); if (manifest) writeFileSync(`${d}/manifest.json`, JSON.stringify(manifest)); return d; };
test('scripts: world-shots and world-ab say how they are used and start no browser when asked wrongly', () => {
  for (const name of ['world-shots.mjs', 'world-ab.mjs']) { const r = run(name); assert.equal(r.status, 2, name); assert.match(r.stderr, /usage: node scripts\/world-/); }
  const bad = run('world-shots.mjs', '--out', tmpdir() + '/pc-never', '--motion', 'sideways'); assert.equal(bad.status, 2); assert.match(bad.stderr, /--motion/);
  const nope = run('world-shots.mjs', '--out', tmpdir() + '/pc-never', '--set', 'no-such-shot'); assert.equal(nope.status, 2); assert.match(nope.stderr, /unknown shot or set/);
});
test('scripts: world-metrics measures a folder, compares two, and reads the water pair, with no browser', () => {
  const planted = img(400, 300, (x, y) => (x < 150 ? WATER : GREEN)); for (let y = 20; y < 280; y++) put(planted, 300, y, [170, 180, 120]); // a seam in the land
  const clean = img(400, 300, (x) => (x < 150 ? WATER : GREEN));
  const A = folder({ planted, clean }), B = folder({ planted, clean: img(400, 300, (x) => (x < 150 ? WATER : [GREEN[0] + 40, GREEN[1], GREEN[2]])) });
  try {
    const m = JSON.parse(run('world-metrics.mjs', A).stdout);
    assert.ok(m.shots.planted.seams.segments >= 1 && m.shots.clean.seams.segments === 0, JSON.stringify([m.shots.planted.seams, m.shots.clean.seams]));
    assert.ok(Math.abs(m.shots.clean.palette.water.share - 150 / 400) < 0.02);
    assert.equal(typeof m.summary.landSaturation, 'number');
    const same = JSON.parse(run('world-metrics.mjs', A, '--diff', A).stdout); assert.equal(same.summary.allIdentical, true); assert.equal(same.summary.compared, 2);
    const d = JSON.parse(run('world-metrics.mjs', A, '--diff', B).stdout);
    assert.equal(d.shots.planted.identical, true); assert.equal(d.summary.allIdentical, false); assert.ok(Math.abs(d.shots.clean.share - 250 / 400) < 0.001, JSON.stringify(d.shots.clean));
    const ex = JSON.parse(run('world-metrics.mjs', A, '--diff', B, '--exclude', '150,0,400,300').stdout); assert.equal(ex.shots.clean.identical, true);
  } finally { rmSync(A, { recursive: true, force: true }); rmSync(B, { recursive: true, force: true }); }
  const dx = 37, dy = 19, W = 320, H = 240, cv = { w: W, h: H, css: [W, H] };
  const P = folder({ 'sea-pan-a': img(W, H, (x, y) => sea(x, y)), 'sea-pan-b': img(W, H, (x, y) => sea(x + dx, y + dy)) }, { shots: [{ name: 'sea-pan-a', canvas: cv }, { name: 'sea-pan-b', canvas: cv, panFrom: 'sea-pan-a', shiftDevicePx: [dx, dy] }] });
  const Q = folder({ 'sea-pan-a': img(W, H, (x, y) => sea(x, y)), 'sea-pan-b': img(W, H, (x, y) => sea(x, y)) }, { shots: [{ name: 'sea-pan-a', canvas: cv }, { name: 'sea-pan-b', canvas: cv, panFrom: 'sea-pan-a', shiftDevicePx: [dx, dy] }] });
  try {
    const ok = JSON.parse(run('world-metrics.mjs', P, '--anchor').stdout); assert.equal(ok.summary.anchored, 1, JSON.stringify(ok));
    const stuck = JSON.parse(run('world-metrics.mjs', Q, '--anchor').stdout); assert.equal(stuck.summary.anchored, 0, JSON.stringify(stuck)); assert.equal(stuck.summary.inconclusive, 0);
  } finally { rmSync(P, { recursive: true, force: true }); rmSync(Q, { recursive: true, force: true }); }
});
