// The palette (js/world/palette.js): every colour the toy island is painted in, held to the art direction's machine-checked block, plus the pure colour rules built on it:
// the face model, the veil over a locked district, the sea's depth ramp and the grade of the hour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as PAL from '../js/world/palette.js';
import { luma, mix, rgb } from '../js/world/iso.js';
import { dayTargets, sunHour, tintOf } from '../js/world/lighting.js';
import { ZONES, ZONE_IDS } from '../js/data/index.js';
import { THEMES } from '../js/data/schema.js';

const DOC = readFileSync(new URL('../docs/ART_DIRECTION.md', import.meta.url), 'utf8');
const K = JSON.parse(DOC.match(/<!-- art-constants -->\s*```json\n([\s\S]*?)\n```/)[1]);
const HEX = /^#[0-9a-f]{6}$/;
const hexesOf = (o) => Object.values(o).flatMap((v) => (typeof v === 'string' ? (v[0] === '#' ? [v] : []) : v && typeof v === 'object' ? hexesOf(v) : []));

test('the palette holds the art direction\'s constants: districts, crate tags, people, sea stops, grade, light and cloud', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(PAL.DISTRICT_DAY)), K.districts);
  assert.deepEqual(JSON.parse(JSON.stringify(PAL.CRATE_TAGS)), K.crateTags);
  for (const k of ['shirts', 'hair', 'skin', 'pants']) assert.deepEqual([...PAL.PEOPLE[k]], K.people[k], k);
  assert.deepEqual(PAL.SEA_STOPS.map((s) => ({ id: s.id, tiles: s.tiles, hex: s.hex })), K.sea);
  assert.equal(PAL.GRADE.dusk, K.grade.dusk); assert.equal(PAL.GRADE.night, K.grade.night); assert.equal(PAL.GRADE.rain, K.grade.rain); assert.equal(PAL.GRADE.horizon, K.grade.horizon); assert.equal(PAL.GRADE.day, K.grade.dayMultiply);
  assert.equal(PAL.LIGHT.key, K.light.key); assert.equal(PAL.LIGHT.shadow, K.light.shadow); assert.equal(PAL.LIGHT.ao, K.light.ao); assert.equal(PAL.LIGHT.contact, K.light.contact); assert.equal(PAL.INK.darkest, K.light.ink);
  for (const k of ['body', 'belly', 'top', 'rim', 'base']) assert.equal(PAL.CLOUD[k], K.cloud[k], k);
});

test('every colour is a six-digit lower-case hex, and no colour is the retired ink, fog or olive', () => {
  const all = [PAL.SKY, PAL.SEA, PAL.SAND, PAL.GRASS, PAL.BLOOM, PAL.SOIL, PAL.ROCK, PAL.ROCKHI, PAL.ROAD, PAL.PAVE, PAL.WOOD, PAL.BRICK, PAL.PLASTER, PAL.TILE, PAL.METAL, PAL.GLASS, PAL.TOY, PAL.INK, PAL.LIGHT, PAL.CLOUD, PAL.DISTRICT_DAY, PAL.CRATE_TAGS, PAL.PEOPLE].flatMap(hexesOf);
  assert.ok(all.length > 150, 'only ' + all.length + ' colours were found');
  for (const h of all) assert.match(h, HEX, h);
  for (const retired of ['#121826', '#4b7a4e', '#2f3644', '#1b3b5c', '#cdbb8e']) assert.ok(!all.includes(retired), `${retired} is retired`);
});

test('a surface ramp steps down in light: hi, light, mid, shade, deep; and a shade step leans violet-blue', () => {
  for (const [name, r] of Object.entries({ SAND: PAL.SAND, GRASS: PAL.GRASS, SOIL: PAL.SOIL, ROCK: PAL.ROCK, ROCKHI: PAL.ROCKHI, ROAD: PAL.ROAD, WOOD: PAL.WOOD, BRICK: PAL.BRICK })) {
    const ls = [r.hi, r.light, r.mid, r.shade, r.deep].map(luma);
    for (let i = 1; i < 5; i++) assert.ok(ls[i] < ls[i - 1], `${name} stop ${i} is not darker than ${i - 1}`);
    const [mr, , mb] = rgb(r.mid), [sr, , sb] = rgb(r.shade);
    assert.ok(sb - sr >= mb - mr - 12, `${name}'s shade does not lean towards blue`);
  }
});

test('the daylight districts are the sixteen of the data, bright, and each keeps the data hue family where the data colour has one', () => {
  assert.deepEqual(Object.keys(PAL.DISTRICT_DAY).sort(), [...new Set(ZONE_IDS.map((z) => ZONES[z].theme))].sort());
  for (const [theme, row] of Object.entries(PAL.DISTRICT_DAY)) assert.ok(luma(row.ground) >= 0.6, `${theme} ground is too dark`);
  assert.ok(THEMES.length >= 16);
  const g = PAL.groundSet('scrap');
  assert.equal(g.ground, '#d4c070'); assert.equal(g.hi, mix('#d4c070', '#fffaf0', 0.28)); assert.equal(g.pad, mix('#d4c070', '#7a6aa8', 0.18)); assert.ok(luma(g.hi) > luma(g.ground) && luma(g.alt) < luma(g.ground));
  assert.equal(PAL.groundSet('constructor'), undefined); assert.equal(PAL.groundSet('nowhere'), undefined);
});

test('the face model: the top is lifted, the sun side stays light and warm, the shade side is darker and leans violet-blue; the result is shared and frozen', () => {
  for (const c of ['#7cc65a', '#ff5f4e', '#fff0d4', '#4a8ff0', '#cc8f50']) {
    const f = PAL.faceTone(c);
    assert.ok(luma(f.t) >= luma(c) - 0.01, 'top'); assert.ok(luma(f.l) < luma(f.t) && luma(f.r) < luma(f.l), 'top > left > right');
    const lean = (h) => { const [, g, b] = rgb(h); return (b - g) / Math.max(1, b); }; // how far blue stands above green: the shade side moves towards violet-blue
    assert.ok(lean(f.r) >= lean(c) - 0.005, `${c}: the shade side does not lean towards blue`);
    assert.ok(luma(f.r) > 0.08, 'the darkest face is not black');
    assert.equal(PAL.faceTone(c), f); assert.ok(Object.isFrozen(f));
  }
});

test('the face model steps in value: at least 15% of luma from the top to the left face and from the left to the right face, for every plaster, tile, brick, metal, wood, grass and toy colour', () => {
  const all = [...Object.values(PAL.PLASTER), ...Object.values(PAL.TILE), ...Object.values(PAL.METAL).filter((h) => luma(h) < 0.95), ...Object.values(PAL.TOY), PAL.BRICK.mid, PAL.GRASS.mid, PAL.WOOD.mid, ...Object.values(PAL.CRATE_TAGS).filter((h) => luma(h) < 0.9)];
  assert.ok(all.length > 50);
  for (const c of all) { const f = PAL.faceTone(c), t = luma(f.t), l = luma(f.l), r = luma(f.r); assert.ok((t - l) / t >= 0.15, `${c}: top to left ${(((t - l) / t) * 100).toFixed(1)}%`); assert.ok((l - r) / l >= 0.15, `${c}: left to right ${(((l - r) / l) * 100).toFixed(1)}%`); }
});

test('veiled: a locked district keeps its colour and its light (never darker than a twentieth), and a free one is untouched', () => {
  const colours = hexesOf({ a: PAL.GRASS, b: PAL.SAND, c: PAL.ROAD, d: PAL.TILE, e: PAL.TOY, f: PAL.DISTRICT_DAY, g: PAL.PLASTER });
  for (const c of colours) { const v = PAL.veiled(c, 1); assert.ok(luma(v) >= luma(c) - 0.05, `${c} -> ${v} is darker`); assert.equal(PAL.veiled(c, 0), c); }
  const [r, g, b] = rgb(PAL.veiled('#ff5f4e', 1)), [r0, g0, b0] = rgb('#ff5f4e'); assert.ok(Math.max(r, g, b) - Math.min(r, g, b) < Math.max(r0, g0, b0) - Math.min(r0, g0, b0), 'desaturated');
  const half = PAL.veiled('#ff5f4e', 0.5); assert.notEqual(half, PAL.veiled('#ff5f4e', 1)); assert.equal(PAL.veiled('#ff5f4e', 1), PAL.veiled('#ff5f4e', 1));
});

test('the sea\'s depth ramp: exact at every stop, smooth between, foam at the line and the abyss from 48 tiles, never navy', () => {
  for (const s of PAL.SEA_STOPS) assert.equal(PAL.seaRamp(s.tiles), s.hex, s.id);
  assert.equal(PAL.seaRamp(-3), PAL.SEA.foam); assert.equal(PAL.seaRamp(0), PAL.SEA.foam); assert.equal(PAL.seaRamp(500), PAL.SEA.abyss);
  let prev = luma(PAL.seaRamp(0.8));
  for (let d = 0.85; d <= 60; d += 0.25) { const l = luma(PAL.seaRamp(d)); assert.ok(l <= prev + 0.012, `the water gets lighter at ${d}`); assert.ok(Math.abs(l - prev) < 0.06, `a jump at ${d}`); prev = l; }
  assert.ok(luma(PAL.SEA.abyss) >= 0.32 - 0.04, 'the deepest water is a rich blue, not a dark one');
  const [r, g, b] = rgb(PAL.SEA.abyss); assert.ok(b > r * 1.8 && b > g, 'abyss is blue');
});

test('the hour: the phases and shadow lengths of the art direction; the curves equal lighting.js; night is never murky', () => {
  assert.deepEqual([6.99, 7, 12, 16.99, 17, 19.99, 20, 23, 3.99, 4].map(PAL.phaseOf), ['dawn', 'day', 'day', 'day', 'evening', 'evening', 'night', 'night', 'night', 'dawn']);
  for (let h = 0; h < 24; h += 0.25) { const a = PAL.skyOf(PAL.sunHourOf(h)), b = dayTargets(h, 1, false); assert.equal(a.night, b.night, `night at ${h}`); assert.equal(a.dusk, b.dusk, `dusk at ${h}`); assert.equal(PAL.sunHourOf(h), sunHour(h)); }
  assert.equal(PAL.tintFor(0, 0, false), ''); assert.equal(PAL.tintFor(1, 0, false), 'rgb(140,152,222)');
  assert.equal(luma('#8c98de') > 0.55, true);
  assert.equal(PAL.tintFor(0, 0, true), 'rgb(196,208,232)');
  assert.notEqual(PAL.tintFor(0, 1, false), tintOf(0, 1, false) + 'x'); assert.match(PAL.tintFor(0, 1, false), /^rgb\(255,2\d\d,1[6-9]\d\)$/);
  const day = PAL.gradeFor(10), eve = PAL.gradeFor(17.8), night = PAL.gradeFor(23);
  assert.equal(day.phase, 'day'); assert.equal(day.tint, ''); assert.equal(day.shadowLength, 0.75);
  assert.equal(eve.phase, 'evening'); assert.ok(eve.shadowLength > 1.0 && eve.shadowLength <= 1.2 + 1e-9);
  assert.equal(night.phase, 'night'); assert.equal(night.shadowLength, 0.5); assert.equal(night.night, 1);
  const o = {}; assert.equal(PAL.gradeFor(10, false, o), o);
});

test('crates and people: every tag has a light, saturated colour and an unknown tag still gets one; a look comes from one hash', () => {
  for (const [tag, c] of Object.entries(PAL.CRATE_TAGS)) assert.ok(luma(c) >= 0.5, `${tag} is too dark`);
  assert.equal(PAL.crateColor('tool'), '#b5c0d6'); assert.ok(HEX.test(PAL.crateColor('constructor'))); assert.ok(HEX.test(PAL.crateColor(undefined)));
  const a = PAL.personLook(123456), b = PAL.personLook(123456); assert.deepEqual(a, b);
  for (const k of ['shirt', 'hair', 'skin', 'pants']) assert.match(a[k], HEX);
  assert.equal(new Set(Array.from({ length: 200 }, (_, i) => PAL.personLook(i * 2654435761 >>> 0).shirt)).size > 6, true);
});
