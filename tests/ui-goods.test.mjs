// The goods' drawings (Icons part 4, docs/ART_DIRECTION.md 3.6): one picture for each of the 72 goods (js/art/g-goods.js, found by id through js/ui/glyphs.js: goodGlyph and goodGl), in the order of the tier files, told apart,
// and the grammar of the set: gold on tier 4, the pallet strip on a pallet, slate wheels on a vehicle. The screens that draw them are held in the same file from the next commit, the world's canvas in tests/world-goods.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const G = await import('../js/ui/glyphs.js');
const { idsOf, shapesOf } = await import('../js/art/glyph.js');
const { isMark, lookalikes, unionBox, tonesOf } = await import('./helpers/glyph-rules.mjs');
const { ASSETS } = await import('../js/config.js');
const tiers = await Promise.all([1, 2, 3, 4].map((n) => import(`../js/data/tier${n}.js`)));

/** Every glyph on the page is decorative or named: nothing a screen reader would read as an unnamed picture. */
const decorative = (html) => [...html.matchAll(/<svg\b([^>]*)>/g)].filter((m) => /viewBox="0 0 24 24"/.test(m[1]) && !/ aria-hidden="true"/.test(m[1]) && !/ role="img" aria-label="[^"]+"/.test(m[1])).map((m) => m[0]);
const IDS = Object.keys(ASSETS), GOODS = idsOf().filter((id) => id.startsWith('good-'));

// ---------------------------------------------------------------------------------------------------- the data
test('the 72 goods have one drawing each, named by what the data names them (good-<id>), in the order of the four tier files, and nothing is drawn that the data does not have', () => {
  assert.equal(IDS.length, 72);
  assert.deepEqual(GOODS, IDS.map((id) => 'good-' + id), 'one good-<id> for each good, a tier at a time, as the tier files list them: a new good is a line in the block of its tier');
  assert.deepEqual(IDS, tiers.flatMap((t) => Object.keys(t.assets)), 'the data merges the tiers in order');
  assert.equal(new Set(IDS.map((id) => G.goodGlyph(id))).size, 72);
  for (const id of IDS) { assert.equal(G.goodGlyph(id), 'good-' + id); assert.ok(!isMark(shapesOf('good-' + id)), `${id} is a picture, not a mark`); }
  assert.ok(G.goodGlyph('constructor') === '' && G.goodGlyph('__proto__') === '' && G.goodGlyph(undefined) === '' && G.goodGlyph('nope') === '' && G.goodGlyph(99) === '', 'a good nobody drew is no glyph, and a name from a save or a classmate is never a way into the registry');
  assert.equal(G.goodGl('nope'), '', 'and the markup of one is empty (the screens then print no tile)'); assert.equal(G.goodGl('radio', 'gl-sm'), G.gl('good-radio', 'gl-sm'));
  assert.equal(tiers.map((t) => Object.keys(t.assets).length).join(), '18,18,18,18');
});

test('no two goods look alike: on the dark tile, in their own tones, any two goods are 30 or more apart (the kit\'s floor is 25 across all its pictures: the goods are held higher among themselves, because a row of them is what a player reads), and each fills at least 15 units of the grid', () => {
  const pics = Object.fromEntries(GOODS.map((id) => [id, shapesOf(id)]));
  const near = lookalikes(pics, 30, '#1d2634');
  assert.deepEqual(near.map((p) => `${p.a} and ${p.b} are ${p.distance.toFixed(1)} apart`), [], 'draw one of each pair differently: another silhouette and another main tone, not another shade');
  const small = GOODS.map((id) => { const [x0, y0, x1, y1] = unionBox(pics[id]); return [id, Math.max(x1 - x0, y1 - y0)]; }).filter(([, size]) => size < 15).map(([id, size]) => `${id} ${size.toFixed(1)}`);
  assert.deepEqual(small, [], 'a good smaller than 15 units cannot be told from its neighbour at 16 px');
});

test('the set has a grammar a player can see: every asset of tier 4 wears gold, a good the data names a pallet stands on the same pallet strip (and nothing else does but the crate of four engines), and every vehicle rolls on slate wheels with the tile showing through the hub', () => {
  const gold = (id) => tonesOf(shapesOf('good-' + id)).some((t) => t === 'y' || t === 'yd');
  assert.deepEqual(Object.keys(tiers[3].assets).filter((id) => !gold(id)), [], 'tier 4: gold on every asset (a seal, a rim, a coin, a lit window, a ribbon)');
  const strip = (id) => shapesOf('good-' + id).some((s) => s[0] === 'p' && s[1] === 'nd' && s.length === 26 && Math.abs(Math.max(...s.slice(2).filter((_, i) => i % 2)) - Math.min(...s.slice(2).filter((_, i) => i % 2)) - 3.4) < 0.11);
  const pallets = IDS.filter((id) => /\bPallet\b/.test(ASSETS[id].name));
  assert.deepEqual(pallets, ['gadgets', 'textbooks', 'laptops'], 'the data names three pallets');
  assert.deepEqual(IDS.filter(strip), [...pallets, 'marineEngine'].sort((a, b) => IDS.indexOf(a) - IDS.indexOf(b)), 'the pallet strip is on the pallets and on the crate of four engines, and on nothing else');
  const wheels = (id) => shapesOf('good-' + id).filter((s) => s[0] === 'd' && s[1] === 'k' && s[3] === 'e').length;
  for (const [id, n] of Object.entries({ bike: 2, sedan: 2, classicCar: 2, van: 2, fleet: 2, rowCropTractor: 2 })) assert.equal(wheels(id), n, `${id}: ${n} slate wheels, rings with a hole (the tile shows through the hub)`);
});

test('the goods table is lazy and light: g-goods.js is one module of the later screens (tests/page-budget.test.mjs, LATER), a drawing costs 180 bytes gzipped at most on average (155 for the 72 of today: the catalog\'s fifty more will cost what they cost, not a limit written for 72), and the kit has no exemplar set left (js/art/g-sample.js went when its goods were drawn)', () => {
  const raw = readFileSync(new URL('../js/art/g-goods.js', import.meta.url)), gz = gzipSync(raw).length, each = gz / IDS.length; assert.ok(each <= 180, `js/art/g-goods.js is ${gz} bytes gzipped for ${IDS.length} goods: ${each.toFixed(0)} bytes a drawing (180 at most: fewer shapes, one decimal, a polygon where a rounded path is not needed)`);
  assert.throws(() => readFileSync(new URL('../js/art/g-sample.js', import.meta.url)), /ENOENT/, 'the exemplars are gone: the real drawings stand where they were');
  assert.match(src('js/ui/glyphs.js'), /^import '\.\.\/art\/g-goods\.js';$/m, 'the screens\' lookup loads the goods with the other sets');
});
