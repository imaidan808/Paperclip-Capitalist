// The cloud bank's painting and its layer (js/world/cloudpaint.js, cloudcache.js, clouds.js): a lobe is a lit dome and the bank is its lobes under one thin contour with a cel-shaded underside, the colours of the hour (judge F5:
// a night cloud is a quiet blue-grey by value, not purple foam), the soft shadow on the land, the dissolve, the padlock, the layer that bakes the banks into chunks and stamps them, and the veil. The geometry the rules hold
// (coverage, structure, cost) is tests/world-cloudbank.test.mjs; the painted bank's shape (radii, windows, cover) is tests/world-cloudform.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx } from './helpers/recctx.mjs';
import { DIST, LAYOUT } from '../js/world/layout.js';
import { fogged, luma, mix, rgb, gray } from '../js/world/iso.js';
import { veiled, CLOUD, GRADE } from '../js/world/palette.js';
import { FLAGS, setFlag, slotFor, runLayer } from '../js/world/stack.js';
import { bankOf, bankTones, paintLobes, paintCloudShadow, lobeLift, dissolveFx, fadeFx, LIFT, DOME, SHADES } from '../js/world/cloudpaint.js';
import { scaleAt, skyCloudAt, SKY_CELL, paintPadlock, COARSE_SCALE, FINE_SCALE, REVEAL_MS, ratioFor, RATIOS, cloudCap, lockedMask, shrinkClouds, cloudStats } from '../js/world/clouds.js';
import { CloudCache, MARGIN_PX } from '../js/world/cloudcache.js';
import { CHUNK_PX, snapTranslation, chunksTouched } from '../js/world/chunks.js';
import { ledger, releaseAll } from '../js/world/gfx.js';
import { FOG_DIM } from '../js/world/common.js';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} is not ${b}`);
const sat = (c) => { const [r, g, b] = rgb(c), m = Math.max(r, g, b); return m ? (m - Math.min(r, g, b)) / m : 0; };
const times = (c, t) => { const [r, g, b] = rgb(c), [tr, tg, tb] = rgb(t); return '#' + [r * tr / 255, g * tg / 255, b * tb / 255].map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''); };

test('the colours of the hour: three tiers that recede (the back paler and bluer than the front), a lit top that catches the low sun, a belly that stays blue, shared and frozen, the same record for the same eighth', () => {
  const day = bankTones(0, 0), eve = bankTones(1, 0), night = bankTones(0, 1);
  assert.equal(day.tiers.length, 3); assert.ok(Object.isFrozen(day)); assert.strictEqual(bankTones(0.01, 0.01), day, 'eighths: a hair of change is the same record'); assert.notStrictEqual(bankTones(0.2, 0), day);
  for (const t of day.tiers) { assert.equal(t.cols.length, SHADES + 1); for (const c of t.cols) { assert.ok(luma(c.lit) >= luma(c.hi) - 1e-9 && luma(c.hi) >= luma(c.body) - 1e-9 && luma(c.body) >= luma(c.mid) - 1e-9 && luma(c.mid) >= luma(c.belly) - 1e-9, 'light to shade, in five steps'); const [r, , b] = rgb(c.belly); assert.ok(b > r, 'a blue belly, never grey'); } }
  assert.ok(luma(day.tiers[0].cols[3].body) <= luma(day.tiers[2].cols[3].body) + 1e-9, 'the back tier recedes'); assert.ok(luma(day.tiers[2].cols[0].lit) > 0.97, 'the lit front top is the lightest thing: a bright cloud');
  for (let q = 1; q <= SHADES; q++) assert.ok(luma(day.tiers[2].cols[q].body) <= luma(day.tiers[2].cols[q - 1].body) + 1e-9, 'the foot of the bank is cooler than its top: the union is shaded as one form');
  const [er, , eb] = rgb(eve.tiers[2].cols[0].lit), [dr, , db] = rgb(day.tiers[2].cols[0].lit); assert.ok(er - eb > dr - db, 'the tops catch the low sun');
  { const [r1, , b1] = rgb(eve.tiers[2].cols[SHADES].belly), [r0, , b0] = rgb(day.tiers[2].cols[SHADES].belly); assert.ok(r1 - b1 > r0 - b0, 'and the belly goes rose'); }
});

test('the key light: the sun stands upper left and is warm, so the tops of the day cloud are cream and not blue-white, its underside is a lilac shade a clear step darker, and the evening\'s tops are peach over an indigo belly (judge round 1: "cold, no visible key light")', () => {
  const day = bankTones(0, 0), eve = bankTones(1, 0), warm = (c) => { const [r, , b] = rgb(c); return r - b; }, cool = (c) => { const [r, , b] = rgb(c); return b - r; };
  for (const row of [1, 2]) assert.ok(warm(day.tiers[row].cols[0].lit) >= 8, `tier ${row}: the lit top of the day cloud is warm (${day.tiers[row].cols[0].lit})`);
  for (const row of [0, 1, 2]) { const foot = day.tiers[row].cols[SHADES]; assert.ok(cool(foot.belly) >= 55, `tier ${row}: the belly is lilac-blue (${foot.belly})`); assert.ok(luma(foot.belly) <= 0.69, `tier ${row}: a clear step darker than the top: belly ${luma(foot.belly).toFixed(2)}`); }
  for (const row of [0, 1, 2]) { const top = eve.tiers[row].cols[0], foot = eve.tiers[row].cols[SHADES]; assert.ok(warm(top.lit) >= 25, `tier ${row}: the evening's top is peach (${top.lit})`); assert.ok(luma(foot.belly) <= 0.62 && cool(foot.belly) >= 50, `tier ${row}: over an indigo belly (${foot.belly}, luma ${luma(foot.belly).toFixed(2)})`); }
});

test('F5: at night the cloud is a quiet blue-grey after the grade\'s multiply: lower in saturation than the day cloud, darker than it, with a moonlit rim that is lighter than the body and a deep belly (form by value, not by hue)', () => {
  const day = bankTones(0, 0), night = bankTones(0, 1), tint = '#' + GRADE.night.slice(1);
  for (let row = 0; row < 3; row++) {
    const d = day.tiers[row].cols[3], n = night.tiers[row].cols[3], nb = times(n.body, tint), nl = times(n.lit, tint), nbel = times(n.belly, tint), db = times(d.body, tint);
    assert.ok(sat(nb) <= 0.3, `tier ${row}: the night body ${nb} has saturation ${sat(nb).toFixed(2)}`); assert.ok(sat(nb) < sat(db) - 0.05, `tier ${row}: less saturated than the day cloud under the same tint (${sat(db).toFixed(2)})`);
    assert.ok(luma(nb) < luma(d.body) * 0.55 && luma(nb) > 0.25, `tier ${row}: darker than the day cloud, never murky: ${luma(nb).toFixed(2)}`); assert.ok(luma(nl) > luma(nb) * 1.2, `tier ${row}: a moonlit rim: ${luma(nl).toFixed(2)} on ${luma(nb).toFixed(2)}`); assert.ok(luma(nbel) < luma(nb) * 0.75, `tier ${row}: a deep belly: ${luma(nbel).toFixed(2)}`);
  }
  assert.ok(luma(times(night.tiers[2].cols[3].lit, tint)) < 0.7, 'the rim cannot outshine the tint\'s own colour'); assert.ok(luma(night.glint) < luma(day.glint) + 1e-9);
  const mid = bankTones(0, 0.5); assert.ok(luma(mid.tiers[2].cols[3].body) < luma(day.tiers[2].cols[3].body) && luma(mid.tiers[2].cols[3].body) > luma(night.tiers[2].cols[3].body), 'the evening is between the two');
});

// ---------------------------------------------------------------- the painter
const run = (lobes, o = {}) => { const r = recCtx(); r.state.globalAlpha = 0.9; const a = o.a ?? 1.5, e = 10, f = 20, n = paintLobes(r.ctx, lobes, { a, e, f, tones: bankTones(0, 0), r0: 60, top: 0, bot: 100, ...o }); return { ...r, n, a, e, f }; };
const LOBES = [{ x: 0, y: 0, r: 60, row: 0, k: 0.2, kind: 0, edge: 1 }, { x: 70, y: 10, r: 50, row: 1, k: 0.4, kind: 0 }, { x: 30, y: 60, r: 30, row: 2, k: 0.9, kind: 2, edge: 1 }];

test('painting a bank: a contour in one path, two flat steps of shade, then a lit dome a lobe (one gradient fill each), and a soft glint on the big ones; no stroke, no clip, no blur, no filter; the matrix and the alpha come back as they were', () => {
  const r = run(LOBES), names = r.log.calls.map((c) => c[0]);
  assert.equal(r.n, 3, 'three lobes painted'); near(r.state.globalAlpha, 0.9);
  for (const k of ['stroke', 'clip', 'drawImage', 'fillRect', 'save', 'restore']) assert.ok(!names.includes(k), `no ${k}`);
  assert.equal(r.state.shadowBlur, undefined); assert.equal(r.state.filter, undefined);
  const last = r.log.calls.filter((c) => c[0] === 'setTransform').at(-1); assert.deepEqual(last.slice(1), [r.a, 0, 0, r.a, r.e, r.f], 'the surface\'s own matrix is back');
  const fills = r.log.fills; assert.equal(fills.length, 1 + 3 * 2 + 3 + 2, `one contour, a belly and a mid step a lobe, a body a lobe, glints on the two big ones (${fills.length})`);
  assert.equal(new Set(fills.map((f) => f.style).filter((s) => typeof s === 'object')).size, 3 + 1, 'a gradient per tier and height (cached per hour and per context) and one glint, however many lobes');
  assert.ok(fills.slice(7, 10).every((f) => typeof f.style === 'object'), 'the bodies are gradients'); assert.ok(fills.slice(1, 7).every((f) => typeof f.style === 'string'), 'the shade is flat');
});

test('the dome is scaled to its lobe by the transform: a unit gradient, the centre of its light moved towards the sun (upper left), bright at its core and body-coloured at its edge', () => {
  assert.ok(DOME.cx < 0 && DOME.cy < 0, 'the light leans to the upper left'); assert.ok(DOME.R > 1, 'the gradient reaches past the lobe\'s edge on the shaded side, so the shade is never a dark rim all round');
  const r = run([{ ...LOBES[0], k: 0.9 }]), bodies = r.log.calls.filter((c) => c[0] === 'arc' && c[3] === 1); assert.equal(bodies.length, 1, 'one unit arc: the body'); const tr = r.log.calls.filter((c) => c[0] === 'setTransform');
  assert.ok(tr.some((c) => Math.abs(c[1] - 1.5 * 60) < 1e-9 && Math.abs(c[5] - (1.5 * (0 - LIFT.x * 60) + 10)) < 1e-9 && Math.abs(c[6] - (1.5 * (0 - LIFT.y * 60) + 20)) < 1e-9), 'the body is lifted up and to the left by LIFT, scaled to its radius');
  assert.ok(LIFT.y > LIFT.x && LIFT.y > 0.1, 'the underside is thicker than the right side');
});

test('the shade is two flat steps (belly where the lobe stands, mid half way to the sun) so the underside is cel-shaded and not one hard band; the contour is one path round the union', () => {
  const r = run(LOBES), arcs = r.log.calls.filter((c) => c[0] === 'arc' && c[3] !== 1);
  assert.equal(arcs.length, 3 * 2 + 3 * 2, 'two discs of the contour a lobe (where it stands and lifted) and two of the shade'); assert.ok(r.log.fills[0].alpha < 0.9, 'the contour is a thin translucent line');
  const shade = arcs.slice(6), lobeCentres = LOBES.map((l) => l.x); assert.ok(shade.some((c) => Math.abs(c[1] - (LOBES[0].x - LIFT.x * 60 * 0.5)) < 1e-9), 'the mid step stands half way up to the sun'); assert.ok(shade.some((c) => lobeCentres.includes(c[1])), 'the belly step stands where the lobe stands');
});

test('a quiet tier paints no contour and no glints; a lobe out of view is skipped; a bank at alpha 0.5 scales every fill; a lobe the dissolve has finished with is not painted', () => {
  const full = run(LOBES), lite = run(LOBES, { lite: true }); assert.ok(lite.log.fills.length < full.log.fills.length && lite.n === full.n, `${lite.log.fills.length} fills against ${full.log.fills.length}`);
  const off = run(LOBES, { view: { x0: 1e6, x1: 1e6 + 5, y0: 0, y1: 5 } }); assert.equal(off.n, 0); assert.equal(off.log.fills.filter((f) => typeof f.style === 'object').length, 0);
  const half = run(LOBES, { fx: fadeFx(0.5) }); assert.ok(half.log.fills.slice(1).every((f) => f.alpha <= 0.9 * 0.5 + 1e-9), 'the alpha it was given');
  const gone = run(LOBES, { fx: (l, out) => { out.a = 0; out.s = 1; out.dx = 0; out.dy = 0; } }); assert.equal(gone.n, 0, 'nothing left to paint');
  const a = JSON.stringify(run(LOBES).log.calls), b = JSON.stringify(run(LOBES).log.calls); assert.equal(a, b, 'a still bank is the same picture every time');
});

test('lobes are shaded by their height in the bank: one near the top is lighter than one at the foot, in the same tier', () => {
  const t = bankTones(0, 0), top = run([{ x: 0, y: 0, r: 40, row: 2, k: 0.9, kind: 0 }], { top: 0, bot: 100 }), foot = run([{ x: 0, y: 100, r: 40, row: 2, k: 0.9, kind: 0 }], { top: 0, bot: 100 });
  assert.ok(top.log.fills.some((f) => f.style === t.tiers[2].cols[0].belly) && foot.log.fills.some((f) => f.style === t.tiers[2].cols[SHADES].belly), 'the belly colour is the one of the lobe\'s height'); assert.notEqual(t.tiers[2].cols[0].belly, t.tiers[2].cols[SHADES].belly);
});

// ---------------------------------------------------------------- the shadow
test('F3: a bank throws a soft shadow on the land and the sea: stamps of the soft sprite (no hard quad, no fillRect), down and to the right of the bank, longer at dusk, fading with the bank, fainter by moonlight', () => {
  const D = DIST[3], b = bankOf(D, 1), tones = bankTones(0, 0), shot = (o) => { const r = recCtx(); r.state.globalAlpha = 1; const n = paintCloudShadow(r.ctx, b, { tones, ...o }); return { ...r, n }; };
  const day = shot({ night: 0, dusk: 0, alpha: 1 }), dusk = shot({ night: 0, dusk: 1, alpha: 1 }), moon = shot({ night: 1, dusk: 0, alpha: 1 }), gone = shot({ night: 0, dusk: 0, alpha: 0 });
  assert.ok(day.n >= 20, `${day.n} stamps`); assert.equal(day.log.rects.length, 0, 'no fillRect'); assert.ok(!day.log.calls.some((c) => ['quad', 'lineTo', 'stroke'].includes(c[0])), 'no polygon: nothing with a hard edge');
  const xs = (r) => r.log.calls.filter((c) => c[0] === 'ellipse').map((c) => c[1]), ys = (r) => r.log.calls.filter((c) => c[0] === 'ellipse').map((c) => c[2]), mean = (a) => a.reduce((s, v) => s + v, 0) / a.length, maxX = (r) => Math.max(...xs(r)); assert.ok(day.log.calls.some((c) => c[0] === 'ellipse'), 'the stamps (two flat ellipses where there is no OffscreenCanvas)');
  const under = b.lobes.filter((l) => l.row >= 1 && l.kind <= 1 && l.k <= 0.6); assert.ok(mean(xs(day)) > mean(under.map((l) => l.x)) + 30 && mean(ys(day)) > mean(under.map((l) => l.y)) + 15, 'down and to the right of the lobes it comes from');
  assert.ok(maxX(dusk) > maxX(day), 'the golden hour throws it further'); assert.ok(maxX(moon) < maxX(day), 'by moonlight it is shorter');
  assert.equal(gone.n, 0, 'a faded bank has no shadow'); near(day.state.globalAlpha, 1);
  const cull = shot({ night: 0, dusk: 0, alpha: 1, view: { x0: 1e7, x1: 1e7 + 5, y0: 0, y1: 5 } }); assert.equal(cull.n, 0, 'out of view: nothing');
});

// ---------------------------------------------------------------- the dissolve
test('the dissolve: a lobe waits for the opening to reach it (near the gate first), then lifts and fades over 1.1 s, and the whole bank is gone by the end of REVEAL_MS', () => {
  const D = DIST[3], b = bankOf(D, 1), [gx, gy] = [b.cx, b.cy + b.r0 * 3], span = (D.fp[2] + D.fp[3]) * 32, dis = (ms) => ({ ms, gx, gy, span });
  let nearest = b.lobes[0], farthest = b.lobes[0]; for (const l of b.lobes) { if (Math.hypot(l.x - gx, (l.y - gy) * 2) < Math.hypot(nearest.x - gx, (nearest.y - gy) * 2)) nearest = l; if (Math.hypot(l.x - gx, (l.y - gy) * 2) > Math.hypot(farthest.x - gx, (farthest.y - gy) * 2)) farthest = l; }
  assert.equal(lobeLift(dis(0), nearest), 0); assert.ok(lobeLift(dis(400), nearest) > 0, 'the nearest lobe has begun'); assert.equal(lobeLift(dis(400), farthest), 0, 'the farthest has not');
  for (const l of [nearest, farthest]) { let prev = 0; for (let ms = 0; ms <= REVEAL_MS; ms += 100) { const q = lobeLift(dis(ms), l); assert.ok(q >= prev - 1e-12 && q >= 0 && q <= 1); prev = q; } assert.equal(lobeLift(dis(REVEAL_MS), l), 1, 'every lobe is gone when the opening ends'); }
  assert.equal(REVEAL_MS, 2600);
  const out = { a: 1, s: 1, dx: 0, dy: 0 }; dissolveFx(dis(0))(nearest, out); assert.ok(out.a === 1 && out.s === 1 && out.dx === 0 && out.dy === 0, 'whole at the first moment'); dissolveFx(dis(REVEAL_MS))(nearest, out); assert.equal(out.a, 0); near(out.s, 0.6); assert.equal(out.dy, -36); assert.ok(Math.abs(out.dx) === 14);
  const tones = bankTones(0, 0), view = { x0: b.box.x0, x1: b.box.x1, y0: b.box.y0, y1: b.box.y1 }, count = (ms) => { const r = recCtx(); return paintLobes(r.ctx, b.lobes, { a: 1, e: 0, f: 0, tones, r0: b.r0, top: b.box.y0, bot: b.box.y1, view, fx: dissolveFx(dis(ms)) }); };
  assert.ok(count(0) > 100 && count(1500) < count(0) && count(REVEAL_MS) === 0, 'the bank thins and ends with no cloud pixels left');
  const r = recCtx(); r.state.globalAlpha = 1; paintLobes(r.ctx, b.lobes, { a: 1, e: 0, f: 0, tones, r0: b.r0, view, fx: dissolveFx(dis(1800)) }); near(r.state.globalAlpha, 1);
});

test('the padlock is gold with no hairline and draws nothing when faded out', () => {
  const lock = recCtx(); paintPadlock(lock.ctx, 0, 0, 0, 1); assert.ok(lock.log.fills.some((f) => f.style === '#ffd84d'), 'gold'); assert.ok(lock.log.strokes.every((s) => s.lw >= 3), 'no hairline'); assert.equal(lock.log.depth, 0);
  const none = recCtx(); paintPadlock(none.ctx, 0, 0, 0, 0.01); assert.equal(none.log.calls.length, 0);
});

test('which lattice is used is a pure function of the zoom (the fine bank from 0.30, the coarse one below it); the clouds are baked at the frame\'s own scale unless the ledger has no room, then at 0.75 and 0.5, with a hysteresis', () => {
  for (const z of [2.4, 1.2, 0.9, 0.3]) assert.equal(scaleAt(z), FINE_SCALE, `zoom ${z}`); for (const z of [0.299, 0.129]) assert.equal(scaleAt(z), COARSE_SCALE, `zoom ${z}`); assert.equal(FINE_SCALE, 1); assert.equal(COARSE_SCALE, 1.6);
  const MB = (n) => n * 1e6, chunk = CHUNK_PX * CHUNK_PX * 4; assert.deepEqual([...RATIOS], [1, 0.75, 0.5]);
  assert.equal(ratioFor(0.26, 500, 0), 1, 'a far bank is a few chunks: always the frame\'s own scale'); assert.equal(ratioFor(0.8, 500, 0), 1);
  assert.equal(ratioFor(1.8, 40, MB(60)), 1, 'with room: the cheap 1:1 blit'); assert.equal(ratioFor(1.8, 40, (40 + 4) * chunk), 1, 'exactly the room it needs'); assert.equal(ratioFor(1.8, 40, (40 + 4) * chunk - 1), 0.75, 'a byte short: 0.75');
  assert.equal(ratioFor(1.8, 54, MB(25)), 0.75, 'a window wholly under cloud (54 chunks, 32 MB) in 25 MB: 35 chunks of 0.75, 21 MB'); assert.equal(ratioFor(1.8, 54, MB(15)), 0.5, 'in 15 MB: 20 chunks of 0.5'); assert.equal(ratioFor(1.8, 54, MB(1)), 0.5, 'never under 0.5');
  assert.equal(ratioFor(1.8, 40, MB(26), 0.75), 0.75, 'once softened it stays until there are 8 MB to spare'); assert.equal(ratioFor(1.8, 40, (40 + 4) * chunk + MB(8), 0.75), 1); assert.equal(ratioFor(1.8, 40, MB(14), 0.5), 0.5, 'and from 0.5 it needs 6 MB to spare for 0.75');
  const [w, h] = [1440, 900]; assert.equal(cloudCap(w, h, 2, 1), chunksTouched(w, h, 2) + 4); assert.equal(cloudCap(w, h, 2, 0.75), 39); assert.equal(cloudCap(w, h, 2, 0.5), 24); assert.ok(cloudCap(w, h, 2, 0.5) * CHUNK_PX * CHUNK_PX * 4 / 1e6 < 14.5, 'the plan\'s row of memory is the fallback\'s');
});

// ---------------------------------------------------------------- the chunk store
function fakeSurfaces() {
  const made = []; const make = (w, h) => { const r = recCtx(); const c = { width: w, height: h, transferToImageBitmap() { return { width: w, height: h, close() { this.closed = true; } }; } }; made.push(c); return { c, g: r.ctx, log: r.log }; };
  return { make, made };
}
test('the cloud store bakes a chunk into one 384 pixel cell, hands it over as a bitmap, keeps it until its light or its districts change, and tells the ledger', () => {
  ledger.clear(); const { make } = fakeSurfaces(), store = new CloudCache(); store.make = make; const calls = [];
  const draw = (g, a, e, f, view) => calls.push({ a, e, f, view: { ...view } });
  const c = store.bake(draw, 1.5, 2, 3); assert.ok(c && c.img && !c.stale); assert.equal(c.bytes, CHUNK_PX * CHUNK_PX * 4); assert.deepEqual([c.i, c.j, c.a], [2, 3, 1.5]);
  assert.equal(calls.length, 1); assert.equal(calls[0].e, -2 * CHUNK_PX); assert.equal(calls[0].f, -3 * CHUNK_PX); near(calls[0].view.x0, (2 * CHUNK_PX - MARGIN_PX) / 1.5); near(calls[0].view.x1, (3 * CHUNK_PX + MARGIN_PX) / 1.5); near(calls[0].view.y0, (3 * CHUNK_PX - MARGIN_PX) / 1.5);
  assert.strictEqual(store.bake(draw, 1.5, 2, 3), c, 'a chunk that is not stale is not baked again'); assert.equal(calls.length, 1);
  assert.equal(ledger.total('cloud.chunks'), CHUNK_PX * CHUNK_PX * 4 + CHUNK_PX * CHUNK_PX * 4, 'the chunk and the one cell surface the baking goes through');
  assert.equal(store.markStale(7), true); assert.equal(store.markStale(7), false); const d = store.bake(draw, 1.5, 2, 3); assert.notStrictEqual(d, c); assert.equal(calls.length, 2, 'a stale chunk is baked over'); assert.equal(store.size, 1);
  store.release(); assert.equal(ledger.total('cloud.chunks'), 0); ledger.clear();
  const none = new CloudCache(); none.make = () => null; assert.equal(none.bake(draw, 1, 0, 0), null, 'no surfaces: the caller paints straight onto the frame');
});

// ---------------------------------------------------------------- the layer
const NOFX = { dim: 0, fog: 0, lights: 0 };
function stubWorld(o = {}) {
  const D = DIST[3], b = bankOf(D, 1), w = {
    W: 800, H: 520, dpr: 2, cv: { width: 1600, height: 1040 }, cam: { x: b.cx, y: b.cy, z: 0.9 }, dusk: 0, env: { t: 0, night: 0 }, reveal: {}, hits: [], overlay: [], lights: [], dirty: false, moving: false, snap: [0, 0], unlocked: new Set([1]), t: 5000, gcBudget: [1e9, 1e9], gcRest: 0, gcFade: 0,
    toWorld(ctx) { const a = this.renderScale(); snapTranslation(this.W, this.H, this.dpr, this.cam.x, this.cam.y, a, this.snap); ctx.setTransform(a, 0, 0, a, this.snap[0], this.snap[1]); }, toScreen() {}, renderScale() { return Math.round(this.cam.z * this.dpr * 1e5) / 1e5; },
    fxOf(id) { return this.unlocked.has(id) ? NOFX : { dim: FOG_DIM, fog: 1, lights: 0 }; }, reduced() { return false; }, ...o,
  };
  w.view = { x0: w.cam.x - w.W / 2 / w.cam.z - 80, x1: w.cam.x + w.W / 2 / w.cam.z + 80, y0: w.cam.y - w.H / 2 / w.cam.z - 260, y1: w.cam.y + w.H / 2 / w.cam.z + 80 };
  return w;
}
const withSurfaces = (fn) => { const { make } = fakeSurfaces(); globalThis.OffscreenCanvas = class { constructor(w, h) { const s = make(w, h); this.width = w; this.height = h; this.g = s.g; this.transferToImageBitmap = s.c.transferToImageBitmap; } getContext() { return this.g; } }; try { return fn(); } finally { delete globalThis.OffscreenCanvas; releaseAll(); ledger.clear(); } };
const draw = (w, vz = new Set([3])) => { const r = recCtx(); r.state.globalAlpha = 1; setFlag('clouds', 'v2'); runLayer('clouds', w, r.ctx, w.view, vz); return r; };
const arcs = (r) => r.log.calls.filter((c) => c[0] === 'arc').length;

test('the V2 layer without surfaces (the Node tests): locked districts are painted straight onto the frame, shadows first then banks, the padlock over every bank; an open district draws nothing', () => {
  const w = stubWorld({ unlocked: new Set(LAYOUT.ids.filter((id) => id !== 3)) }); try {
    const locked = draw(w); assert.equal(slotFor('clouds').impl, 'v2'); assert.ok(arcs(locked) > 300, `${arcs(locked)} arcs`); assert.ok(locked.log.fills.some((f) => f.style === '#ffd84d'), 'the padlock'); near(locked.state.globalAlpha, 1);
    assert.equal(locked.log.rects.length, 0); assert.equal(locked.log.depth, 0, 'save and restore balance'); assert.equal(w.hits.length, 0, 'nothing is pushed to the hit list');
    const names = locked.log.calls.map((c) => c[0]), firstShadow = names.indexOf('ellipse'), firstBody = locked.log.calls.findIndex((c) => c[0] === 'arc' && c[3] === 1), lateEllipses = names.slice(firstBody).filter((n) => n === 'ellipse').length; assert.ok(firstShadow >= 0 && firstShadow < firstBody && lateEllipses === 1, 'every shadow before the first bank (the one ellipse after is the padlock\'s own)');
    w.unlocked = new Set(LAYOUT.ids); const open = draw(w); assert.equal(arcs(open), 0, 'a world with every district open has no bank'); assert.equal(open.log.fills.filter((f) => f.style === '#ffd84d').length, 0);
  } finally { setFlag('clouds', 'legacy'); }
});

test('F8: every padlock is drawn after the last bank, so a neighbour\'s lobe never buries one (the two locked districts in view here are painted bank, bank, lock, lock)', () => {
  const w = stubWorld({ unlocked: new Set(LAYOUT.ids.filter((id) => id !== 3 && id !== 4)) }); const vz = new Set([3, 4]); try {
    const r = draw(w, vz), calls = r.log.calls; let lastGradient = -1, firstLock = -1, locks = 0;
    calls.forEach((c, i) => { if (c[0] === 'arc' && c[3] === 1) lastGradient = i; }); // (the last lobe body: a unit arc under the lobe's own transform)
    // a padlock is the only thing that strokes: its shackle is stroked twice, and a stroke is never part of a bank
    calls.forEach((c, i) => { if (c[0] === 'stroke') { if (firstLock < 0) firstLock = i; locks++; } }); assert.equal(locks, 4, 'two shackles of two strokes');
    const lastFill = calls.map((c, i) => [c[0], i]).filter(([n]) => n === 'fill').at(-1)[1]; assert.ok(firstLock > lastGradient, 'no stroke before the last gradient: the locks come last');
    const lobeFills = calls.map((c, i) => [c[0], i]).filter(([n]) => n === 'fill').length; assert.ok(lobeFills > 500 && lastFill > firstLock);
  } finally { setFlag('clouds', 'legacy'); }
});

test('the V2 layer with surfaces: the banks are baked into chunks the first frame and every frame after that is blits (nothing is baked again), shadows and banks inside, the padlock over them', () => withSurfaces(() => {
  const w = stubWorld(); try {
    const first = draw(w);
    const imgs1 = first.log.images; assert.ok(imgs1 >= 6, `${imgs1} chunks stamped`); assert.ok(!first.log.calls.some((c) => c[0] === 'arc' && c[3] === 1), 'nothing of the bank is painted on the frame: it is in the chunks');
    const second = draw(w); assert.equal(second.log.images, imgs1, 'the same blits again'); assert.ok(!second.log.calls.some((c) => c[0] === 'arc' && c[3] === 1));
    assert.ok(ledger.total('cloud.chunks') >= imgs1 * CHUNK_PX * CHUNK_PX * 4, 'the chunks are in the ledger');
    assert.ok(second.log.fills.some((f) => f.style === '#ffd84d'), 'the padlock is live over the chunks');
    // the light of the hour changes the chunks (a record per eighth): the first frame of it bakes again
    w.env.night = 0.5; const dusk = draw(w); assert.equal(dusk.log.images, imgs1, 'stale chunks are stamped until their replacements are baked, and every cell is replaced in the frame when the budget allows');
    assert.ok(shrinkClouds(w) >= 0);
  } finally { setFlag('clouds', 'legacy'); }
}));

test('a district that opens leaves the chunks at once and is drawn live for its dissolve; under reduced motion it cross-fades over 400 ms; the padlock goes with the opening', () => withSurfaces(() => {
  const w = stubWorld(); const unlocked = new Set(w.unlocked); try {
    const locked = draw(w); const imgs = locked.log.images; assert.ok(imgs > 0 && locked.log.fills.some((f) => f.style === '#ffd84d'));
    unlocked.add(3); w.unlocked = unlocked; w.reveal[3] = { t0: 5000, dur: REVEAL_MS }; w.t = 5900; w.fxOf = function (id) { return id === 3 ? { dim: FOG_DIM * 0.7, fog: 0.7, lights: 0.3 } : this.unlocked.has(id) ? NOFX : { dim: FOG_DIM, fog: 1, lights: 0 }; };
    const mid = draw(w); assert.ok(arcs(mid) > 20, `mid dissolve: the lobes that are left are painted live (${arcs(mid)} arcs)`); assert.ok(!mid.log.fills.some((f) => f.style === '#ffd84d'), 'the padlock goes with the opening');
    assert.equal(lockedMask(w.unlocked) & (1 << 3), 0, 'the district is not in the chunks any more');
  } finally { setFlag('clouds', 'legacy'); }
}));

test('reduced motion: an opened district is a 400 ms cross-fade of the whole bank, then gone', () => {
  const w = stubWorld({ reduced: () => true, unlocked: new Set(LAYOUT.ids.filter((id) => id !== 3)) }); const open = new Set(w.unlocked); try {
    draw(w); open.add(3); w.unlocked = open; w.t = 6000; const f0 = draw(w); assert.ok(arcs(f0) > 150, 'the bank is still there at the first frame of the fade'); assert.equal(w.dirty, true, 'and keeps the world drawing');
    w.t = 6450; const f1 = draw(w); assert.equal(arcs(f1), 0, 'gone after 400 ms');
  } finally { setFlag('clouds', 'legacy'); }
});

test('while the clouds are V2 a colour under cloud is veiled, never darkened, and the veil keeps most of the district\'s colour (F2: a hint of the district under the wash, not a flat grey); while legacy, fogged is what it always was', () => {
  const colours = ['#7cc65a', '#4b7a4e', '#e2704c', '#8c91b2', '#f9e1a6', '#a8cdf0'];
  const legacy = colours.map((c) => fogged(c, FOG_DIM)); for (let i = 0; i < colours.length; i++) assert.ok(luma(legacy[i]) < luma(colours[i]) + 1e-9, 'the old fog darkens');
  assert.equal(FLAGS.clouds, 'legacy'); assert.equal(fogged('#7cc65a', FOG_DIM), mix(mix('#7cc65a', gray('#7cc65a'), 0.75), '#121826', 0.25), 'unchanged while legacy');
  setFlag('clouds', 'v2');
  try {
    for (const c of colours) { const v = fogged(c, FOG_DIM); assert.equal(v, veiled(c, 1)); assert.ok(luma(v) >= luma(c) - 0.05, `${c} -> ${v}`); } assert.equal(fogged('#7cc65a', 0), '#7cc65a'); assert.equal(fogged('#7cc65a', FOG_DIM / 2), veiled('#7cc65a', 0.5), 'as a district opens the veil thins with the dim');
    for (const c of ['#7cc65a', '#e2704c', '#4b9be0']) assert.ok(sat(veiled(c, 1)) >= 0.6 * sat(c), `${c} keeps most of its colour under the veil: ${sat(veiled(c, 1)).toFixed(2)} of ${sat(c).toFixed(2)}`);
  } finally { setFlag('clouds', 'legacy'); }
});

test('the sky\'s own clouds: a cell holds at most one, deterministic, drifting east at 8 world px a second inside its cell and fading in and out at its ends; they are drawn over the sea at the far and middle zooms and not close in', () => {
  const a = {}, b = {}; let cell = null; for (let cx = 0; cx < 8 && !cell; cx++) if (skyCloudAt(cx, 1, 5000, a)) cell = [cx, 1]; assert.ok(cell); skyCloudAt(cell[0], cell[1], 5000, b); assert.deepEqual(a, b);
  let n = 0; for (let cx = -10; cx < 10; cx++) for (let cy = -10; cy < 10; cy++) { const o = {}; if (!skyCloudAt(cx, cy, 0, o)) continue; n++; assert.ok(o.x >= cx * SKY_CELL && o.x <= (cx + 1) * SKY_CELL && o.a >= 0 && o.a <= 1 && o.size >= 0.8 && o.size <= 1.3); }
  assert.ok(n >= 140 && n <= 220, `${n} clouds in 400 cells`);
  const p = {}, q = {}; skyCloudAt(cell[0], cell[1], 0, p); skyCloudAt(cell[0], cell[1], 10000, q); assert.ok(Math.abs(q.x - p.x - 80) < 1 || Math.abs(q.x - p.x + SKY_CELL - 80) < 1, 'eight world px a second');
  let faded = 0; for (let t = 0; t < 400000; t += 1000) { const o = {}; skyCloudAt(cell[0], cell[1], t, o); if (o.a < 0.05) faded++; } assert.ok(faded > 0, 'it fades out at the end of its crossing, so nothing pops at the cell\'s edge');
  const view = { x0: -4400, x1: 6300, y0: -200, y1: 5200 }, w = stubWorld({ cam: { x: 0, y: 0, z: 0.13 }, t: 30000, unlocked: new Set(LAYOUT.ids), env: { t: 30000, night: 0 } });
  const arcsAt = (z) => { w.cam.z = z; const r = recCtx(); setFlag('clouds', 'v2'); try { runLayer('clouds', w, r.ctx, view, new Set()); } finally { setFlag('clouds', 'legacy'); } return r.log.calls.filter((c) => c[0] === 'arc').length; };
  assert.ok(arcsAt(0.13) > 20, 'small clouds over the sea at the whole-island view'); assert.equal(arcsAt(1.2), 0, 'none at the working zoom: the player is looking at the ground'); assert.equal(arcsAt(0.13), arcsAt(0.13), 'deterministic');
});
