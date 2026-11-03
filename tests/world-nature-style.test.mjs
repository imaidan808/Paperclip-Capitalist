// The nature of the toy island in the author's second art direction (docs/ART_DIRECTION.md 3.5, after the people of 3.4): trees, bushes, hedges, planters and topiary as flat two-tone forms with a light flat shading on the
// lower right (no clip, no crescent, no gradient, no highlight, no soft stamp), grass as tufts of three to five rounded blades in mid and dark greens, and cloud banks as flat pale tones by depth with a flat rim on the
// lower right of the big puffs (no gradient dome, no glint, no outline). No canvas: the recording context of tests/helpers/recctx.mjs, wrapped so that any gradient, pattern, clip, stroke or blur asked of it is noted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recCtx } from './helpers/recctx.mjs';

const toys = await import('../js/world/toys.js'), nat = await import('../js/world/nature.js'), atlas = await import('../js/world/atlas.js'), gm = await import('../js/world/groundmat.js'), pal = await import('../js/world/palette.js'),
  cp = await import('../js/world/cloudpaint.js'), { luma, shade } = await import('../js/world/iso.js');
const BANNED = new Set(['createLinearGradient', 'createRadialGradient', 'createConicGradient', 'createPattern', 'clip', 'stroke', 'strokeRect', 'strokeText', 'fillText', 'fillRect', 'drawImage']);
/** A recording context that notes every gradient, pattern, clip, stroke, blur and filter asked of it: a flat drawing asks for none. */
function flatCtx() {
  const r = recCtx(), bad = [];
  const ctx = new Proxy(r.ctx, { get(o, k) { if (BANNED.has(k)) bad.push(k); return o[k]; }, set(o, k, v) { if ((k === 'shadowBlur' && v) || (k === 'filter' && v && v !== 'none')) bad.push(k); o[k] = v; return true; } });
  return { ...r, ctx, bad };
}
const HEX = /^#[0-9a-f]{6}$/, fillsOf = (r) => r.log.fills, hue = (c) => { const n = parseInt(c.slice(1), 16), R = n >> 16, G = (n >> 8) & 255, B = n & 255; return G > R && G > B; };
/** Every fill is a six-digit colour, and exactly the first (the ground shadow) is translucent. */
const flatFills = (r, what, shadows = 1) => { for (const f of fillsOf(r)) assert.match(f.style, HEX, `${what}: ${f.style}`); assert.equal(fillsOf(r).filter((f) => f.alpha !== 1).length, shadows, `${what}: only the ground shadow is translucent`); };

// ---------------------------------------------------------------- the flat form
test('blob: a flat round form of two fills, the darker step a little down and to the right and the colour a little up and to the left; no clip, no crescent, no gradient', () => {
  const r = flatCtx(); toys.blob(r.ctx, 10, 20, 12, '#5cc23e'); assert.deepEqual(r.bad, []); const e = r.log.calls.filter((c) => c[0] === 'ellipse'), f = fillsOf(r);
  assert.equal(e.length, 2); assert.equal(f.length, 2); assert.equal(f[0].style, shade('#5cc23e', 0.78)); assert.equal(f[1].style, '#5cc23e');
  assert.ok(e[0][1] > e[1][1] && e[0][2] > e[1][2], 'the dark one stands lower and to the right of the lit one'); assert.ok(luma(f[0].style) < luma(f[1].style));
  const x0 = Math.min(e[0][1] - e[0][3], e[1][1] - e[1][3]), x1 = Math.max(e[0][1] + e[0][3], e[1][1] + e[1][3]); assert.ok(Math.abs((x1 - x0) / 2 - 12) < 0.6, `the form is the size it was asked: ${(x1 - x0) / 2}`);
  const rim = e[0][1] + e[0][3] - (e[1][1] + e[1][3]); assert.ok(rim >= 0.8 && rim <= 3, `a light rim of ${rim.toFixed(2)} px on 12`);
  const small = flatCtx(); toys.blob(small.ctx, 0, 0, 2, '#2fb35f'); const es = small.log.calls.filter((c) => c[0] === 'ellipse'); assert.ok(es[0][1] - es[1][1] >= 0.5, 'a rim never thinner than half a pixel');
});
test('capsule: a limb or a stem is a filled path round at both ends, never a stroke', () => {
  const r = flatCtx(); toys.capsule(r.ctx, 0, 0, 10, 30, 4, '#9c6238'); assert.deepEqual(r.bad, []); assert.equal(r.log.strokes.length, 0); assert.equal(fillsOf(r).length, 1); assert.equal(fillsOf(r)[0].style, '#9c6238');
  const arcs = r.log.calls.filter((c) => c[0] === 'arc'); assert.equal(arcs.length, 2); assert.ok(arcs.every((a) => a[3] >= 2 - 1e-9), 'the caps are half the width');
});

// ---------------------------------------------------------------- trees
test('every species of tree, at every size, is flat fills: no gradient, clip, stroke or blur, one translucent shadow, a few tones, and no green lighter than its own base (no highlight)', () => {
  const BASES = ['#5cc23e', '#2fb35f', '#7fcf37', '#27a86c', '#98d433'];
  for (const sp of ['round', 'pine', 'palm', 'apple', 'blossom']) for (const s of [0.6, 1, 1.5]) for (let v = 0; v < 5; v++) {
    const r = flatCtx(); nat.plantTree(r.ctx, 0, 0, sp, s, v); const tag = `${sp} ${s} ${v}`; assert.deepEqual(r.bad, [], tag); assert.equal(r.log.strokes.length, 0, `${tag}: a stroke`); assert.equal(r.log.clips, 0, `${tag}: a clip`);
    flatFills(r, tag); assert.equal(r.log.depth, 0, tag); assert.equal(r.state.globalAlpha, 1, tag); assert.ok(new Set(fillsOf(r).map((f) => f.style)).size <= 16, `${tag}: ${new Set(fillsOf(r).map((f) => f.style)).size} tones`); assert.ok(fillsOf(r).length <= 70, `${tag}: ${fillsOf(r).length} fills`);
    if (sp === 'blossom') continue; const base = sp === 'palm' ? BASES[1] : BASES[v], greens = fillsOf(r).filter((f) => f.alpha === 1 && hue(f.style));
    assert.ok(greens.length >= 3, `${tag}: a crown`); for (const f of greens) assert.ok(luma(f.style) <= luma(base) + 1e-6, `${tag}: ${f.style} is lighter than its green ${base}`);
  }
});
test('a round crown is chunky: at least five puffs, each a flat two-tone blob with its rim on the lower right, and the trunk is a flat two-tone one', () => {
  const r = flatCtx(); nat.plantTree(r.ctx, 0, 0, 'round', 1, 0); const e = r.log.calls.filter((c) => c[0] === 'ellipse'); const pairs = []; for (let i = 0; i + 1 < e.length; i++) if (Math.abs(e[i][3] - e[i + 1][3]) < 0.6 && e[i][1] > e[i + 1][1] && e[i][2] > e[i + 1][2] && e[i][3] > 6) pairs.push([e[i], e[i + 1]]);
  assert.ok(pairs.length >= 5, `${pairs.length} puffs`);
});
test('nature.js has none of the glossy helpers left: no ball, soft stamp, rounded box, gradient drum or stroke, so nothing in it can shine', () => {
  const src = readFileSync(new URL('../js/world/nature.js', import.meta.url), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  for (const [re, what] of [[/\bball\(/, 'ball('], [/\bstampSoft\(/, 'stampSoft('], [/\broundedBox\(/, 'roundedBox('], [/\bdrum\(/, 'drum('], [/\bbar\(/, 'bar('], [/strokeStyle/, 'strokeStyle'], [/\bhi\(/, 'hi(']]) assert.ok(!re.test(src), `nature.js still calls ${what}`);
});
test('hedge, planter and topiary are flat too: no gradient, clip or stroke, one translucent shadow, bumps that are flat blobs', () => {
  const ENV = { t: 0, wind: 0, night: 0, dim: 0, hz: 0, far: false, lite: false, locked: false, zoff: 0, lights: null, crunch: false, lod: null, boardText: null };
  for (const [kind, p] of [['hedge', { gx: 10, gy: 20, w: 4, d: 0.6, h: 12, t: 'hedge' }], ['hedge', { gx: 13, gy: 22, w: 0.6, d: 3, h: 12, t: 'hedge', col: '#4aa05a' }], ['planter', { gx: 10, gy: 20, w: 1.2, d: 1.2, h: 10, t: 'planter' }], ['topiary', { gx: 10, gy: 20, w: 1, d: 1, h: 30, t: 'topiary' }], ['topiary', { gx: 11, gy: 21, w: 1, d: 1, h: 30, t: 'topiary' }]]) {
    const def = atlas.SHARED.get(kind); assert.ok(def, `${kind} is a shared prop`); const r = flatCtx(); def.body(r.ctx, p, ENV); const tag = `${kind} ${p.gx}`;
    assert.deepEqual(r.bad, [], tag); assert.equal(r.log.strokes.length, 0, `${tag}: a stroke`); assert.equal(r.log.clips, 0, `${tag}: a clip`); flatFills(r, tag); assert.ok(r.log.calls.filter((c) => c[0] === 'ellipse').length >= 6, `${tag}: blobs`); assert.equal(r.log.depth, 0, tag); assert.equal(r.state.globalAlpha, 1, tag);
  }
});
test('a bush, a rock, a flower patch and a reed bed are flat as well', () => {
  const draws = { bush: (g) => nat.bush(g, 0, 0, 10, '#5cc23e', '#ff7fb8'), rock: (g) => nat.rock(g, 0, 0, 8, '#b5c0d6'), flowers: (g) => nat.flowers(g, 0, 0, 4, 7), reeds: (g) => nat.reeds(g, 0, 0, 20, 3, '#6cc178') };
  for (const [k, f] of Object.entries(draws)) { const r = flatCtx(); f(r.ctx); assert.deepEqual(r.bad, [], k); assert.equal(r.log.strokes.length, 0, `${k}: a stroke`); flatFills(r, k, k === 'bush' || k === 'rock' ? 1 : 0); assert.equal(r.state.globalAlpha, 1, k); }
});

// ---------------------------------------------------------------- grass
test('a tuft is three to five blades, each with a rounded tip and no corner, the middle one the tallest', () => {
  for (const [hh, n] of [[0.05, 3], [0.2, 3], [0.4, 4], [0.6, 4], [0.7, 5], [0.95, 5]]) {
    const r = flatCtx(); r.ctx.beginPath(); const ret = gm.tuft(r.ctx, 50, 100, hh); assert.equal(ret, n, 'it answers its blades, for the budget of a chunk'); const mv = r.log.calls.filter((c) => c[0] === 'moveTo'), arcs = r.log.calls.filter((c) => c[0] === 'arc');
    assert.equal(mv.length, n, `hh ${hh}: ${mv.length} blades`); assert.equal(arcs.length, n, 'a round tip each'); assert.ok(arcs.every((a) => a[3] >= 0.6), 'a tip is a small cap, not a point'); assert.ok(!r.log.calls.some((c) => c[0] === 'lineTo'), 'no straight pointed edge');
    const tops = arcs.map((a) => a[2]), mid = tops[(n - 1) / 2 | 0] ?? tops[0]; assert.ok(Math.min(...tops) <= mid + 1e-9 && n % 2 === 1 ? Math.abs(tops[(n - 1) / 2] - Math.min(...tops)) < 1e-9 : true, 'the middle blade is the tallest');
    const h = 100 - Math.min(...tops); assert.ok(h >= 4 && h <= 10, `a tuft ${h.toFixed(1)} px tall`);
  }
});
test('the meadow\'s tufts are mid and dark greens: at least three, none lighter than the grass\'s mid green (no lime, no highlight)', () => {
  assert.ok(Array.isArray(gm.TUFT_TONES) && gm.TUFT_TONES.length >= 3, 'tones'); for (const c of gm.TUFT_TONES) { assert.match(c, HEX); assert.ok(hue(c), `${c} is a green`); assert.ok(luma(c) <= luma(pal.GRASS.mid) + 1e-6, `${c} is lighter than ${pal.GRASS.mid}`); }
  assert.equal(new Set(gm.TUFT_TONES).size, gm.TUFT_TONES.length, 'each a tone of its own');
});

// ---------------------------------------------------------------- clouds
const LOBES = [{ x: 0, y: 0, r: 60, row: 0, k: 0.2, kind: 0, edge: 1 }, { x: 70, y: 10, r: 50, row: 1, k: 0.4, kind: 0 }, { x: 30, y: 60, r: 30, row: 2, k: 0.9, kind: 2, edge: 1 }];
const paint = (lobes, o = {}) => { const r = flatCtx(); r.state.globalAlpha = 1; const a = o.a ?? 1.5, e = 10, f = 20, n = cp.paintLobes(r.ctx, lobes, { a, e, f, tones: cp.bankTones(0, 0), r0: 60, top: 0, bot: 100, ...o }); return { ...r, n, a, e, f }; };
test('a bank is flat: each lobe a flat disc of its tier\'s pale tone, the big lobes with a flat rim on the lower right, the underside in flat steps; no gradient, no glint, no outline, no stroke', () => {
  const r = paint(LOBES), tones = cp.bankTones(0, 0); assert.deepEqual(r.bad, []); assert.equal(r.n, 3); assert.equal(r.log.strokes.length, 0); assert.equal(r.log.clips, 0);
  for (const f of fillsOf(r)) { assert.equal(typeof f.style, 'string', 'a flat colour'); assert.match(f.style, HEX); assert.equal(f.alpha, 1); }
  assert.equal(fillsOf(r).length, 3 * 2 + 2 * 2 + 1, 'two steps of shade a lobe, a body a lobe and a rim on each of the two big ones'); const arcs = r.log.calls.filter((c) => c[0] === 'arc'), bodies = arcs.slice(6), rims = [];
  assert.equal(bodies.length, 5); for (let i = 0; i < 2; i++) { const dark = bodies[i * 2], lit = bodies[i * 2 + 1]; assert.ok(dark[1] > lit[1] && dark[2] > lit[2], `a big puff's rim lies lower right of its body`); rims.push(fillsOf(r)[6 + i * 2].style); }
  const flatOf = (row, q) => tones.tiers[row].cols[q].flat; assert.ok(fillsOf(r).some((f) => f.style === flatOf(2, 2) || f.style === flatOf(2, 3)), 'the small front lobe is its tier\'s flat tone'); assert.ok(rims.every((c, i) => luma(c) < luma(tones.tiers[i].cols[0].flat)), 'a rim is darker than the tone it edges');
});
test('the three tiers are three flat pale tones, back to front lighter and never warm cream by day; the golden hour warms them and the night greys them by value', () => {
  const day = cp.bankTones(0, 0), tiers = [0, 1, 2].map((r) => day.tiers[r].cols[3].flat); assert.ok(tiers.every((c) => /^#[0-9a-f]{6}$/.test(c)));
  assert.ok(luma(tiers[0]) < luma(tiers[1]) && luma(tiers[1]) < luma(tiers[2]), `back to front lighter: ${tiers}`); for (const c of tiers) { assert.ok(luma(c) >= 0.85, `${c} is pale`); const n = parseInt(c.slice(1), 16); assert.ok((n & 255) >= (n >> 16) - 2, `${c} is cool, not cream`); }
  const night = cp.bankTones(0, 1); assert.ok(luma(night.tiers[2].cols[3].flat) < luma(tiers[2]) * 0.8, 'darker at night'); const gold = cp.bankTones(1, 0); assert.notEqual(gold.tiers[2].cols[3].flat, tiers[2]);
  assert.equal(new Set(day.tiers.map((t) => t.cols[0].flat)).size, 3); assert.equal(day.tiers[2].cols[0].flat, day.tiers[2].cols[6].flat, 'a tier is flat from its top to its foot');
});
test('painting leaves the matrix and the alpha as it found them, skips a lobe out of view, and is the same picture every time', () => {
  const r = paint(LOBES); const last = r.log.calls.filter((c) => c[0] === 'setTransform').at(-1); assert.deepEqual(last.slice(1), [r.a, 0, 0, r.a, r.e, r.f]); assert.equal(r.state.globalAlpha, 1);
  assert.equal(paint(LOBES, { view: { x0: 1e6, x1: 1e6 + 5, y0: 0, y1: 5 } }).n, 0); assert.equal(JSON.stringify(paint(LOBES).log.calls), JSON.stringify(paint(LOBES).log.calls));
});
