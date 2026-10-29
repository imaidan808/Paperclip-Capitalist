// The art direction (docs/ART_DIRECTION.md) is a style bible the whole team obeys, so it is held to the code it describes: every prop kind in the DRAW table, every kit and every
// district has its entry; the daylight palette is bright and keeps each district's hue; the water, level-of-detail, memory and performance numbers in its machine-checked constants
// block are consistent with each other and with the rules in the prose. It reads the document and the data; it draws nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DRAW } from '../js/world/props.js';
import { KITS } from '../js/world/kits.js';
import { luma, mix } from '../js/world/iso.js';
import { THEMES, TAGS } from '../js/data/schema.js';
import { ZONES, ZONE_IDS } from '../js/data/index.js';

const DOC = readFileSync(new URL('../docs/ART_DIRECTION.md', import.meta.url), 'utf8');
const HEX = /^#[0-9a-f]{6}$/i;

/** The text from one heading to the next heading of the same or a higher level. */
function section(startRe, endRe) {
  const a = DOC.search(startRe); assert.ok(a >= 0, `heading not found: ${startRe}`);
  const rest = DOC.slice(a + 1), b = rest.search(endRe);
  return b < 0 ? DOC.slice(a) : DOC.slice(a, a + 1 + b);
}
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function hueSat(h) {
  const [r, g, b] = rgbOf(h).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return { hue: 0, sat: 0 };
  const hue = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { hue: hue * 60, sat: mx ? d / mx : 0 };
}
const hueGap = (a, b) => { const d = Math.abs(hueSat(a).hue - hueSat(b).hue); return Math.min(d, 360 - d); };

/** The machine-checked constants: the JSON block that follows the marker. */
function constants() {
  const m = DOC.match(/<!-- art-constants -->\s*```json\n([\s\S]*?)\n```/);
  assert.ok(m, 'the constants block is missing');
  return JSON.parse(m[1]);
}
const K = constants();

test('the style bible has every numbered section in order, the appendices, and ends on the cheat sheet', () => {
  const heads = [...DOC.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  const nums = heads.map((h) => (h.match(/^(\d+)\. /) || [])[1]).filter(Boolean).map(Number);
  assert.deepEqual(nums, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'sections 0 to 10, in order');
  for (const a of ['A', 'B', 'C']) assert.ok(heads.some((h) => h.startsWith(`Appendix ${a}.`)), `Appendix ${a}`);
  assert.equal(heads[heads.length - 1], 'Cheat sheet (pin this up)', 'the cheat sheet is last');
});

test('every prop kind in the DRAW table has an entry in section 4 (and none is described that does not exist)', () => {
  const s4 = section(/^## 4\. /m, /^## 5\. /m), keys = Object.keys(DRAW);
  assert.ok(keys.length >= 61, 'the DRAW table has its sixty-one kinds');
  for (const k of keys) assert.match(s4, new RegExp('^- \\*\\*`' + k + '`\\*\\*', 'm'), `no entry for the prop kind ${k}`);
  const props = section(/^### 4\.1 /m, /^### 4\.3 /m), listed = [...props.matchAll(/^- \*\*`([a-z0-9_]+)`\*\*/gm)].map((m) => m[1]);
  for (const k of listed) assert.ok(k in DRAW, `section 4 describes ${k}, which is not in the DRAW table`);
});

test('every district kit has an entry in 4.3, in the district order', () => {
  const s = section(/^### 4\.3 /m, /^### 4\.4 /m), listed = [...s.matchAll(/^- \*\*`([a-z]+)`\*\* \((\d+), /gm)];
  assert.deepEqual(listed.map((m) => m[1]), THEMES, 'one paragraph per kit, in the theme order');
  assert.deepEqual(listed.map((m) => +m[2]), THEMES.map((_, i) => i + 1), 'each carries its district number');
  for (const t of Object.keys(KITS)) assert.ok(THEMES.includes(t), `kit ${t} is a theme`);
});

test('the district table gives all sixteen districts and quotes the data palette exactly', () => {
  const rows = [...section(/^### 2\.4 /m, /^### 2\.5 /m).matchAll(/^\| (\d+) \| `([a-z]+)` \| ([^|]+) \| (#[0-9a-f]{6}) \/ (#[0-9a-f]{6}) \|/gm)];
  assert.equal(rows.length, 16);
  rows.forEach((m, i) => {
    const id = +m[1], z = ZONES[id];
    assert.equal(id, i + 1); assert.equal(m[2], THEMES[i]); assert.equal(m[3].trim(), z.name, `district ${id}'s name`);
    assert.deepEqual([m[4], m[5]], z.palette, `district ${id}'s data palette is quoted as it is in js/data`);
  });
  assert.deepEqual(ZONE_IDS.length, 16);
});

test('the daylight palette is bright, keeps each district its hue, and covers exactly the sixteen themes', () => {
  const D = K.districts;
  assert.deepEqual(Object.keys(D).sort(), [...THEMES].sort());
  for (const [i, t] of THEMES.entries()) {
    const d = D[t], data = ZONES[i + 1].palette[0];
    for (const f of ['ground', 'walk', 'accent', 'accent2']) assert.match(d[f], HEX, `${t}.${f}`);
    assert.ok(luma(d.ground) >= 0.6, `${t} ground is bright (luma ${luma(d.ground).toFixed(2)})`);
    assert.ok(luma(d.walk) >= 0.75, `${t} pavement is bright`);
    assert.ok(luma(d.accent) >= 0.45, `${t} accent is a light, saturated colour, not an ink`);
    assert.ok(hueSat(d.ground).sat >= 0.12, `${t} ground is tinted, not grey`);
    if (hueSat(data).sat > 0.15) assert.ok(hueGap(data, d.ground) <= 40, `${t} keeps its identity hue (${hueGap(data, d.ground).toFixed(0)} degrees from the data)`);
    const want = rgbOf(mix('#f3e6cc', d.ground, 0.18)), got = rgbOf(d.walk);
    assert.ok(want.every((v, k) => Math.abs(v - got[k]) <= 1), `${t} pavement is mix('#f3e6cc', ground, 0.18)`);
  }
});

test('crate colours cover every tag, are light and saturated, and the people palettes are complete', () => {
  assert.deepEqual(Object.keys(K.crateTags).sort(), [...TAGS].sort());
  for (const [t, h] of Object.entries(K.crateTags)) { assert.match(h, HEX, t); assert.ok(luma(h) >= 0.5, `${t} crate is light (luma ${luma(h).toFixed(2)})`); }
  const P = K.people;
  assert.deepEqual([P.shirts.length, P.hair.length, P.skin.length, P.pants.length], [12, 6, 6, 5]);
  for (const h of [...P.shirts, ...P.hair, ...P.skin, ...P.pants]) assert.match(h, HEX);
  assert.ok(!P.hair.includes('#000000') && !P.pants.includes('#000000'), 'no pure black on a person');
});

test('the sea ramp is ordered by distance, brightest at the shore, and never murky', () => {
  const S = K.sea;
  assert.deepEqual(S.map((s) => s.id), ['foam', 'shoal', 'shallow', 'lagoon', 'sea', 'deep', 'abyss']);
  for (let i = 0; i < S.length; i++) {
    assert.match(S[i].hex, HEX);
    if (i) { assert.ok(S[i].tiles > S[i - 1].tiles, 'stops ascend in tiles'); assert.ok(luma(S[i].hex) < luma(S[i - 1].hex), `${S[i].id} is darker than ${S[i - 1].id}`); }
  }
  assert.ok(luma(S.at(-1).hex) >= 0.3, 'the deepest water is a rich blue, not navy-grey');
  assert.ok(hueSat(S[2].hex).hue > 150 && hueSat(S[2].hex).hue < 190, 'the shallows are turquoise');
  const w = K.waves; assert.equal(w.levels.length, 12); assert.ok(w.levels.every((v, i) => !i || v > w.levels[i - 1]));
  assert.ok(w.ridges >= 2 && w.crossSeconds >= 12, 'ridges roll in slowly');
  assert.ok(K.foam.coastRetreatMaxWpx <= 12 && K.foam.periodSeconds >= 5 && K.foam.wavelengthWpx[0] < K.foam.wavelengthWpx[1]);
});

test('the zoom bands are contiguous, cover the whole zoom range, and cross-fade smoothly', () => {
  const z = K.zoom, B = z.bands;
  assert.deepEqual(B.map((b) => b.id), ['far', 'mid', 'near', 'close']);
  assert.equal(B[0].from, z.min); assert.equal(B.at(-1).to, z.max);
  for (let i = 1; i < B.length; i++) assert.equal(B[i].from, B[i - 1].to, 'no gap and no overlap between bands');
  assert.ok(z.workingLo >= B[2].from && z.workingHi <= B[2].to, 'the working zoom lies inside the near band');
  assert.ok(z.crossfade > 0.05 && z.crossfade < 0.3);
  // the overlay fade windows of 7.3 never meet each other: near's ends before close's begins
  const win = (t) => [t * (1 - z.crossfade), t * (1 + z.crossfade)];
  assert.ok(win(B[2].from)[1] < win(B[3].from)[0]);
});

test('the grade is bright by day and never murky at night, and shadows are cool, not ink', () => {
  const g = K.grade, l = K.light;
  assert.equal(g.dayMultiply, '#ffffff');
  for (const h of [g.dusk, g.night, g.rain, g.horizon]) assert.match(h, HEX);
  assert.ok(luma(g.night) >= 0.5, 'the night multiply keeps over half the light');
  assert.ok(luma(g.dusk) > luma(g.night));
  assert.ok(g.nightMeanLumaMin >= 0.3);
  for (const h of [l.key, l.shadow, l.ao, l.contact, l.ink]) assert.match(h, HEX);
  for (const h of [l.shadow, l.ao, l.contact]) { const [r, gg, b] = rgbOf(h); assert.ok(b > r && b > gg, `${h} leans blue-violet`); }
  assert.ok(luma(l.ink) > 0.1, 'the darkest dark is plum-navy, never black');
  assert.ok(l.shadowLength.night < l.shadowLength.day && l.shadowLength.day < l.shadowLength.golden);
});

test('the cloud bank is a continuous, lit, blue-bellied mass (not a dark wash)', () => {
  const c = K.cloud;
  for (const h of [c.body, c.belly, c.top, c.rim, c.base]) assert.match(h, HEX);
  assert.ok(luma(c.top) > luma(c.body) && luma(c.body) > luma(c.belly), 'top over body over belly');
  assert.ok(hueSat(c.belly).hue > 200 && hueSat(c.belly).hue < 250, 'the belly is blue');
  assert.ok(luma(c.belly) > 0.7, 'even the belly is light');
  assert.ok(c.coverageMin >= 0.85 && c.puffsMin >= 12 && c.puffsMax >= c.puffsMin * 2);
  assert.ok(c.rowOpacity.length === 3 && c.rowOpacity.every((v) => v > 0.6 && v < 1), 'rows are not fully opaque, so what is under the cloud shows through');
});

test('the memory budget adds up under the limit and the performance ceilings follow the baseline', () => {
  const M = K.memoryMB, { limit, ...parts } = M, total = Object.values(parts).reduce((a, b) => a + b, 0);
  assert.equal(limit, 160);
  assert.ok(total <= limit, `the holders total ${total} MB, over ${limit}`);
  assert.ok(limit - total >= 5, 'some headroom is kept');
  assert.ok(Math.abs(parts.mainCanvas - 20.7) < 1, 'a full-window layer at dsf 2 is 20.7 MB'); assert.ok(Math.abs(parts.groundChunks - 39.8) < 1, 'the ground is chunks of device pixels: 54 chunks of 0.59 MB, a quarter more at the peak of a zoom (js/world/chunks.js)');
  const P = K.perf;
  assert.equal(P.ceilingFactor, 1.25); assert.equal(P.finestMaxMs, 24);
  for (const z of ['0.3', '0.5', '0.9', '1.0', '1.2', '1.8']) {
    assert.ok(Math.abs(P.ceilingStillMs[z] - P.baselineStillMs[z] * P.ceilingFactor) <= 0.06, `still ceiling at ${z}`);
    assert.ok(Math.abs(P.ceilingMovingMs[z] - P.baselineMovingMs[z] * P.ceilingFactor) <= 0.06, `moving ceiling at ${z}`);
  }
  assert.ok(P.baselineStillMs['2.4'] < P.finestMaxMs && P.baselineMovingMs['2.4'] < P.finestMaxMs, 'the baseline finest zoom is under the hard cap');
});

test('every colour written in the document is a well-formed six-digit hex', () => {
  const bad = [...DOC.matchAll(/(?<![\w&])#([0-9a-zA-Z]+)\b/g)].map((m) => m[1]).filter((h) => /^[0-9a-fA-F]+$/.test(h) && h.length >= 3 && h.length !== 6);
  assert.deepEqual(bad, [], 'hex colours that are not six digits (shorthand is not used)');
});

test('the document names what it retires, by file, so the deleting work is traceable', () => {
  const s9 = section(/^## 9\. /m, /^## 10\. /m);
  for (const f of ['world.js', 'layout.js', 'island.js', 'lighting.js', 'iso.js', 'shading.js', 'props.js', 'kits.js', 'fx.js']) assert.ok(s9.includes('`' + f + '`'), `section 9 covers ${f}`);
  for (const id of ['drawWater', 'seaStrip', 'drawFog', 'fogSprites', 'fogged', 'paintVignette', 'rimLight', 'person()', 'tone()']) assert.ok(s9.includes(id), `section 9 names ${id}`);
});
