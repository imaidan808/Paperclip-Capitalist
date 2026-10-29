// The cloud bank's painting (js/world/cloudpaint.js, js/world/clouds.js): the crescent in closed form, the lobes a bank is painted in, the colours of the hour, the dissolve, the bank's shadow and padlock, the layer that draws
// them, and the veil that replaces the fog's darkening while the clouds are V2. The geometry the rules hold (coverage, structure, cost) is tests/world-cloudbank.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx } from './helpers/recctx.mjs';
import { DIST } from '../js/world/layout.js';
import { fogged, luma, mix, rgb, gray } from '../js/world/iso.js';
import { veiled, CLOUD } from '../js/world/palette.js';
import { FLAGS, setFlag, slotFor, runLayer } from '../js/world/stack.js';
import { crescent, crescentWidth, pathCrescent, lobesOf, bankOf, bankTones, lobeLift, paintBank, paintPuff, slideAt, bobAt, swellAt, MOTION, SHELLS, LOOK } from '../js/world/cloudpaint.js';
import { scalesAt, skyCloudAt, SKY_CELL, paintShadow, paintPadlock, FAR_SCALE, MID_SCALE, FINE_SCALE, REVEAL_MS } from '../js/world/clouds.js';
import { bankPuffs } from '../js/world/cloudbank.js';
import { FOG_DIM } from '../js/world/common.js';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} is not ${b}`);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('the crescent is two arcs in closed form: the corners of the cut lie on both circles, the width is r - r2 + d, and a cut that covers or misses the disc is said so', () => {
  const r = 10, ox = -2, oy = -3, r2 = 9.85, c = crescent(r, ox, oy, r2);
  assert.equal(c.kind, 'crescent');
  for (const side of [-1, 1]) {
    const p = [Math.cos(c.phi + side * c.beta) * r, Math.sin(c.phi + side * c.beta) * r]; near(dist(p, [ox, oy]), r2, 1e-9);                      // a corner of the outer arc lies on the cut circle too
    const q = [ox + Math.cos(c.phi + Math.PI + side * c.gamma) * r2, oy + Math.sin(c.phi + Math.PI + side * c.gamma) * r2]; near(Math.hypot(q[0], q[1]), r, 1e-9); // and one of the inner arc on the disc
  }
  near(crescentWidth(r, ox, oy, r2), r - r2 + Math.hypot(ox, oy)); assert.equal(crescent(10, 0, 0, 12).kind, 'none', 'a cut that covers the disc leaves nothing');
  assert.equal(crescent(10, 30, 0, 9).kind, 'disc', 'a cut that misses it leaves the whole disc'); assert.equal(crescentWidth(10, 30, 0, 9), 10);
  const { ctx, log } = recCtx(); assert.equal(pathCrescent(ctx, 5, 6, r, ox, oy, r2), true); assert.deepEqual(log.calls.filter((k) => k[0] === 'arc').length, 2); assert.equal(log.calls.at(-1)[0], 'closePath');
  const none = recCtx(); assert.equal(pathCrescent(none.ctx, 0, 0, 10, 0, 0, 12), false); assert.equal(none.log.calls.length, 0, 'nothing to fill: nothing drawn');
});

test('a point is inside the crescent exactly when it is in the disc and not in the cut: the arcs enclose that region (sampled)', () => {
  const r = 10, ox = -2.2, oy = -3.1, r2 = 9.8, c = crescent(r, ox, oy, r2);
  // the region between the two arcs, by angle: along the axis the crescent is thick on the far side from the cut and a point just inside the cut disc is outside it
  const axis = [Math.cos(c.phi), Math.sin(c.phi)];
  const far = [-axis[0] * (r - 0.5 * crescentWidth(r, ox, oy, r2)), -axis[1] * (r - 0.5 * crescentWidth(r, ox, oy, r2))]; // half way into the thickest part
  assert.ok(Math.hypot(far[0], far[1]) <= r && Math.hypot(far[0] - ox, far[1] - oy) >= r2, 'the thick middle of the crescent is in the disc and outside the cut');
  const near_ = [axis[0] * 3, axis[1] * 3]; assert.ok(Math.hypot(near_[0] - ox, near_[1] - oy) < r2, 'the side facing the cut is in the cut: it is not part of the crescent');
});

test('the bank is painted from lobes: the puffs the rules hold and, on the outline, small cusp lobes; the same bank every time, kept once, back to front, and every outline puff is marked', () => {
  for (const id of [1, 3, 11]) {
    const D = DIST[id], b = bankOf(D, 1), again = bankOf(D, 1); assert.strictEqual(b, again, 'made once');
    assert.deepEqual(b.puffs.map((p) => [p.x, p.y, p.r]), bankPuffs(D.fp, D.z, 1).map((p) => [p.x, p.y, p.r]), 'the puffs are cloudbank.js\'s, unchanged');
    const kids = b.lobes.filter((l) => l.kid), puffs = b.lobes.filter((l) => !l.kid); assert.equal(puffs.length, b.puffs.length); assert.ok(kids.length >= 6, `district ${id}: ${kids.length} cusp lobes`);
    for (const k of kids) assert.ok(k.r >= 0.38 * b.r0 * 0.85 && k.r <= 0.62 * b.r0 * 1.15, 'a cusp lobe is 0.4 to 0.6 of its puff');
    assert.ok(puffs.some((p) => p.rim) && puffs.some((p) => !p.rim), 'some puffs stand on the outline and some do not'); assert.deepEqual(b.lobes.map((l) => l.row), [...b.lobes.map((l) => l.row)].sort(), 'back to front');
    assert.deepEqual(lobesOf(bankPuffs(D.fp, D.z, 1)).map((l) => [l.x, l.y, l.r]), lobesOf(bankPuffs(D.fp, D.z, 1)).map((l) => [l.x, l.y, l.r]), 'deterministic');
  }
});

test('the colours of the hour: three tiers that recede (the back bluer and darker than the front), warm at the golden hour, cool at night, shared and frozen, the same record for the same eighth', () => {
  const day = bankTones(0, 0), eve = bankTones(1, 0), night = bankTones(0, 1);
  assert.equal(day.tiers.length, 3); assert.ok(Object.isFrozen(day)); assert.strictEqual(bankTones(0.01, 0.01), day, 'eighths: a hair of change is the same record');
  assert.ok(luma(day.tiers[0].body) < luma(day.tiers[2].body), 'the back tier recedes'); assert.ok(luma(day.tiers[2].body) > 0.9, 'the lit front is the lightest thing: a bright cloud');
  for (const t of day.tiers) { assert.equal(t.cols.length, 4); assert.ok(luma(t.cols[0]) < luma(t.cols[1]) && luma(t.cols[1]) <= luma(t.cols[3]) + 1e-9, 'the shaded edge is darker than the body, the crown lighter'); const [r, , b] = rgb(t.belly); assert.ok(b > r, 'a blue belly, never grey'); }
  const [er, , eb] = rgb(eve.tiers[2].top), [dr, , db] = rgb(day.tiers[2].top); assert.ok(er - eb > dr - db, 'the tops catch the low sun'); const [nr, , nb] = rgb(night.tiers[2].belly), [br, , bb] = rgb(day.tiers[2].belly); assert.ok(nb - nr >= bb - br, 'night leans blue');
});

test('the bank\'s motion is the art direction\'s and rests at zero: a bob of 1.6 world px over 7 to 11 s, a swell of 2%, a slide of 14 px over 48 s; none of it when the clock is 0', () => {
  assert.equal(slideAt(0, 1), 0); assert.equal(bobAt(0, 0.4), 0); assert.equal(swellAt(0, 1), 1);
  let maxBob = 0, maxSlide = 0, maxSwell = 0; for (let t = 0; t < 200000; t += 250) { maxBob = Math.max(maxBob, Math.abs(bobAt(t, 0.37))); maxSlide = Math.max(maxSlide, Math.abs(slideAt(t, 0.5))); maxSwell = Math.max(maxSwell, Math.abs(swellAt(t, 0.5) - 1)); }
  assert.ok(maxBob <= MOTION.bob + 1e-9 && maxBob > 1.5); assert.ok(maxSlide <= MOTION.slide + 1e-9 && maxSlide > 13.5); assert.ok(maxSwell <= MOTION.swell + 1e-9 && maxSwell > 0.019);
  const period = (k) => { let n = 0, prev = bobAt(0.01, k); for (let t = 50; t < 100000; t += 50) { const v = bobAt(t, k); if (prev < 0 && v >= 0) n++; prev = v; } return 100 / n; }; for (const k of [0.1, 0.5, 0.9]) assert.ok(period(k) >= 6.5 && period(k) <= 11.5, `bob period ${period(k)} s`);
});

test('painting a bank: only discs and one path a tier (no gradient, no blur, no clip, no stroke), the alpha it was given is given back, a pull-back draws fewer shells, and a still bank is the same picture each time', () => {
  const D = DIST[3], b = bankOf(D, 1), tones = bankTones(0, 0), view = { x0: b.box.x0, x1: b.box.x1, y0: b.box.y0, y1: b.box.y1 };
  const run = (o) => { const r = recCtx(); r.state.globalAlpha = 0.9; const n = paintBank(r.ctx, b, { tones, view, ...o }); return { ...r, n }; };
  const near1 = run({ zoom: 1 }), far = run({ zoom: 0.129 });
  assert.ok(near1.n > 50, `${near1.n} lobes`); near(near1.state.globalAlpha, 0.9); near(far.state.globalAlpha, 0.9);
  for (const k of ['stroke', 'clip', 'createRadialGradient', 'createLinearGradient', 'drawImage']) assert.ok(!near1.log.calls.some((c) => c[0] === k), `no ${k}`);
  assert.equal(near1.log.rects.length, 0, 'no fillRect: form is round'); assert.equal(near1.log.depth, 0);
  assert.ok(far.log.fills.length < near1.log.fills.length, `a pull-back skips the shoulders and crowns it cannot show (${far.log.fills.length} fills against ${near1.log.fills.length})`);
  const a = JSON.stringify(run({ zoom: 1 }).log.calls), c = JSON.stringify(run({ zoom: 1 }).log.calls); assert.equal(a, c, 'at rest the picture is the same every time');
  const quiet = run({ zoom: 1, lite: true }); assert.ok(quiet.log.fills.length < near1.log.fills.length * 0.8, `the quiet tier paints less (${quiet.log.fills.length} fills against ${near1.log.fills.length})`); assert.ok(quiet.n > 0 && quiet.n < near1.n + 1, 'but is still a bank');
  const lo = run({ zoom: 1, alpha: 0.5 }); assert.ok(lo.log.fills.every((f) => f.alpha <= 0.9 * 0.5 + 1e-9), 'the bank\'s own alpha scales every fill');
  const half = run({ zoom: 1, grow: 0.5 }), full = run({ zoom: 1 }); assert.ok(half.log.calls.filter((c) => c[0] === 'arc').every((c, i) => c[3] <= full.log.calls.filter((k) => k[0] === 'arc')[0][3] + 1), 'a half-grown bank has half-size puffs'); assert.equal(run({ zoom: 1, grow: 0 }).log.calls.length, 0, 'a bank that has not begun to grow paints nothing');
  const off = recCtx(); assert.equal(paintBank(off.ctx, b, { tones, view: { x0: 1e7, x1: 1e7 + 5, y0: 0, y1: 5 }, zoom: 1, floor: 0 }), 0, 'a bank out of view paints nothing');
  const sheet = run({ zoom: 1, floor: 0 }); assert.ok(sheet.log.fills.length < near1.log.fills.length, 'the floor is a fill a tier');
  assert.equal(LOOK.floor > 0 && LOOK.floor < 1, true); assert.equal(SHELLS.length, 4);
});

test('the dissolve: a lobe waits for the opening to reach it (near the gate first), then lifts and fades over 1.1 s, and the whole bank is gone by the end of REVEAL_MS', () => {
  const D = DIST[3], b = bankOf(D, 1), [gx, gy] = [b.cx, b.cy + b.r0 * 3], span = (D.fp[2] + D.fp[3]) * 32, dis = (ms) => ({ ms, gx, gy, span });
  let nearest = b.lobes[0], farthest = b.lobes[0]; for (const l of b.lobes) { if (Math.hypot(l.x - gx, (l.y - gy) * 2) < Math.hypot(nearest.x - gx, (nearest.y - gy) * 2)) nearest = l; if (Math.hypot(l.x - gx, (l.y - gy) * 2) > Math.hypot(farthest.x - gx, (farthest.y - gy) * 2)) farthest = l; }
  assert.equal(lobeLift(dis(0), nearest), 0); assert.ok(lobeLift(dis(400), nearest) > 0, 'the nearest lobe has begun'); assert.equal(lobeLift(dis(400), farthest), 0, 'the farthest has not');
  for (const l of [nearest, farthest]) { let prev = 0; for (let ms = 0; ms <= REVEAL_MS; ms += 100) { const q = lobeLift(dis(ms), l); assert.ok(q >= prev - 1e-12 && q >= 0 && q <= 1); prev = q; } assert.equal(lobeLift(dis(REVEAL_MS), l), 1, 'every lobe is gone when the opening ends'); }
  assert.equal(REVEAL_MS, 2600);
  const tones = bankTones(0, 0), view = { x0: b.box.x0, x1: b.box.x1, y0: b.box.y0, y1: b.box.y1 }, count = (ms) => { const r = recCtx(); return paintBank(r.ctx, b, { tones, view, zoom: 1, dis: dis(ms) }); };
  assert.ok(count(0) > 0 && count(1500) < count(0) && count(REVEAL_MS) === 0, 'the bank thins and ends with no cloud pixels left');
  const r = recCtx(); r.state.globalAlpha = 1; paintBank(r.ctx, b, { tones, view, zoom: 1, dis: dis(1800) }); near(r.state.globalAlpha, 1);
});

test('the layers: a puff is three fills; the bank\'s shadow is two quads of the cloud shadow violet and longer at dusk; the padlock is gold and draws nothing when faded out', () => {
  const p = recCtx(); paintPuff(p.ctx, 10, 10, 20, bankTones(0, 0).tiers[2], 0.8); assert.equal(p.log.fills.length, 3); near(p.state.globalAlpha, 1);
  const D = DIST[3], b = bankOf(D, 1), day = recCtx(), dusk = recCtx(); paintShadow(day.ctx, D, b, 1, 0, 0); paintShadow(dusk.ctx, D, b, 1, 0, 1);
  assert.equal(day.log.fills.length, 2); for (const f of day.log.fills) assert.equal(f.style, CLOUD.shadow); assert.ok(day.log.fills[0].alpha < day.log.fills[1].alpha, 'a pale penumbra under a core');
  const xs = (r) => r.log.calls.filter((c) => c[0] === 'lineTo').map((c) => c[1]); assert.ok(Math.max(...xs(dusk)) > Math.max(...xs(day)), 'the golden hour throws it further');
  const gone = recCtx(); paintShadow(gone.ctx, D, b, 0, 0, 0); assert.ok(gone.log.fills.every((f) => f.alpha === 0), 'a faded bank has no shadow');
  const lock = recCtx(); paintPadlock(lock.ctx, 0, 0, 0, 1); assert.ok(lock.log.fills.some((f) => f.style === '#ffd84d'), 'gold'); assert.ok(lock.log.strokes.every((s) => s.lw >= 3), 'no hairline'); assert.equal(lock.log.depth, 0);
  const none = recCtx(); paintPadlock(none.ctx, 0, 0, 0, 0.01); assert.equal(none.log.calls.length, 0);
});

test('which banks are drawn is a pure function of the zoom: the far bank to 0.18, the coarse one from 0.22 to 0.62, the fine one from 0.70, and between them a short band in which the finer one grows in as the coarser one shrinks (opaque, never a pop)', () => {
  assert.deepEqual(scalesAt(0.129), [FAR_SCALE, 1, 0, 0]); assert.deepEqual(scalesAt(0.5), [MID_SCALE, 1, 0, 0]); assert.deepEqual(scalesAt(0.9), [FINE_SCALE, 1, 0, 0]); assert.deepEqual(scalesAt(0.3), [MID_SCALE, 1, 0, 0]); assert.deepEqual(scalesAt(0.18), [FAR_SCALE, 1, 0, 0]); assert.deepEqual(scalesAt(0.22), [MID_SCALE, 1, 0, 0]);
  for (const [lo, hi, a, b] of [[0.62, 0.70, MID_SCALE, FINE_SCALE], [0.18, 0.22, FAR_SCALE, MID_SCALE]]) {
    let prevG = 0, prevS = 1; for (let z = lo + 0.001; z < hi; z += (hi - lo) / 40) { const s = scalesAt(z); assert.equal(s[0], a); assert.equal(s[2], b); assert.ok(s[3] >= prevG - 1e-12 && s[1] <= prevS + 1e-12, 'the finer grows, the coarser shrinks, monotonically'); assert.ok(s[1] >= 0.7 - 1e-9 && s[1] <= 1); near(s[1], 1 - 0.3 * s[3], 1e-12); prevG = s[3]; prevS = s[1]; }
    assert.ok(scalesAt(hi - 0.001)[3] > 0.99 && scalesAt(lo + 0.001)[3] < 0.01, 'it begins and ends at nothing and everything');
  }
  assert.deepEqual(scalesAt(0.129), scalesAt(0.129), 'a function of the zoom and nothing else');
});

test('the V2 layer: a locked district under cloud draws its bank, shadow and padlock; an open one draws nothing; the opening plays the dissolve; under reduced motion it is a 400 ms cross-fade of the whole bank', () => {
  const D = DIST[3], b = bankOf(D, 1), view = { x0: b.box.x0 - 50, x1: b.box.x1 + 50, y0: b.box.y0 - 50, y1: b.box.y1 + 50 }, vz = new Set([3]);
  const NOFX = { dim: 0, fog: 0, lights: 0 }; let fx = { dim: FOG_DIM, fog: 1, lights: 0 }, calm = false, T = 5000;
  const w = { cam: { z: 0.9 }, dusk: 0, env: { t: T, night: 0 }, reveal: {}, hits: [], overlay: [], lights: [], dirty: false, toWorld() {}, toScreen() {}, fxOf: (id) => (id === 3 ? fx : NOFX), reduced: () => calm, get t() { return T; } };
  const draw = () => { const r = recCtx(); r.state.globalAlpha = 1; w.env.t = T; setFlag('clouds', 'v2'); runLayer('clouds', w, r.ctx, view, vz); return r; };
  try {
    const locked = draw(); assert.equal(slotFor('clouds').impl, 'v2'); const arcs = (r) => r.log.calls.filter((c) => c[0] === 'arc').length; assert.ok(locked.log.fills.length >= 12 && arcs(locked) > 150, `${locked.log.fills.length} fills, ${arcs(locked)} arcs`); assert.ok(locked.log.fills.some((f) => f.style === '#ffd84d'), 'the padlock'); near(locked.state.globalAlpha, 1);
    assert.equal(locked.log.rects.length, 0); assert.equal(locked.log.depth, 0, 'save and restore balance'); assert.equal(w.hits.length, 0, 'nothing is pushed to the hit list');
    fx = NOFX; calm = false; const open = draw(); assert.equal(open.log.fills.length, 0, 'an open district under motion has no bank (the engine\'s reveal plays the dissolve while it is opening)');
    fx = { dim: FOG_DIM, fog: 1, lights: 0 }; draw(); // locked and seen
    w.reveal[3] = { t0: T, dur: REVEAL_MS }; fx = { dim: FOG_DIM * 0.7, fog: 0.7, lights: 0.3 }; T += 900; const mid = draw(); assert.ok(arcs(mid) > 20 && arcs(mid) < arcs(locked), `mid dissolve: some of the bank is left (${arcs(mid)} of ${arcs(locked)} arcs)`); assert.ok(!mid.log.fills.some((f) => f.style === '#ffd84d'), 'the padlock goes with the opening');
    delete w.reveal[3]; fx = { dim: FOG_DIM, fog: 1, lights: 0 }; draw(); calm = true; fx = NOFX; T += 10; const f0 = draw(); assert.ok(arcs(f0) > 150, 'reduced motion: the bank is still there at the first frame of the cross-fade'); assert.equal(w.dirty, true, 'and keeps the world drawing');
    T += 450; const f1 = draw(); assert.equal(f1.log.fills.length, 0, 'gone after 400 ms');
  } finally { setFlag('clouds', 'legacy'); }
});

test('while the clouds are V2 a colour under cloud is veiled, never darkened (a locked district is not darker than an open one); while legacy, fogged is what it always was', () => {
  const colours = ['#7cc65a', '#4b7a4e', '#e2704c', '#8c91b2', '#f9e1a6', '#a8cdf0'];
  const legacy = colours.map((c) => fogged(c, FOG_DIM)); for (let i = 0; i < colours.length; i++) assert.ok(luma(legacy[i]) < luma(colours[i]) + 1e-9, 'the old fog darkens');
  assert.equal(FLAGS.clouds, 'legacy'); assert.equal(fogged('#7cc65a', FOG_DIM), mix(mix('#7cc65a', gray('#7cc65a'), 0.75), '#121826', 0.25), 'unchanged while legacy');
  setFlag('clouds', 'v2');
  try { for (const c of colours) { const v = fogged(c, FOG_DIM); assert.equal(v, veiled(c, 1)); assert.ok(luma(v) >= luma(c) - 0.05, `${c} -> ${v}`); } assert.equal(fogged('#7cc65a', 0), '#7cc65a'); assert.equal(fogged('#7cc65a', FOG_DIM / 2), veiled('#7cc65a', 0.5), 'as a district opens the veil thins with the dim'); }
  finally { setFlag('clouds', 'legacy'); }
});


test('the sky\'s own clouds: a cell holds at most one, deterministic, drifting east at 8 world px a second inside its cell and fading in and out at its ends; they are drawn over the sea at the far and middle zooms and not close in', () => {
  const a = {}, b = {}; let cell = null; for (let cx = 0; cx < 8 && !cell; cx++) if (skyCloudAt(cx, 1, 5000, a)) cell = [cx, 1]; assert.ok(cell); skyCloudAt(cell[0], cell[1], 5000, b); assert.deepEqual(a, b);
  let n = 0; for (let cx = -10; cx < 10; cx++) for (let cy = -10; cy < 10; cy++) { const o = {}; if (!skyCloudAt(cx, cy, 0, o)) continue; n++; assert.ok(o.x >= cx * SKY_CELL && o.x <= (cx + 1) * SKY_CELL && o.a >= 0 && o.a <= 1 && o.size >= 0.8 && o.size <= 1.3); }
  assert.ok(n >= 140 && n <= 220, `${n} clouds in 400 cells`);
  const p = {}, q = {}; skyCloudAt(cell[0], cell[1], 0, p); skyCloudAt(cell[0], cell[1], 10000, q); assert.ok(Math.abs(q.x - p.x - 80) < 1 || Math.abs(q.x - p.x + SKY_CELL - 80) < 1, 'eight world px a second');
  let faded = 0; for (let t = 0; t < 400000; t += 1000) { const o = {}; skyCloudAt(cell[0], cell[1], t, o); if (o.a < 0.05) faded++; } assert.ok(faded > 0, 'it fades out at the end of its crossing, so nothing pops at the cell\'s edge');
  const view = { x0: -4400, x1: 6300, y0: -200, y1: 5200 }, w = { cam: { z: 0.13 }, dusk: 0, env: { t: 30000, night: 0 }, reveal: {}, hits: [], overlay: [], lights: [], dirty: false, toWorld() {}, toScreen() {}, fxOf: () => ({ dim: 0, fog: 0, lights: 0 }), reduced: () => false, t: 30000 };
  const arcs = (z) => { w.cam.z = z; const r = recCtx(); setFlag('clouds', 'v2'); try { runLayer('clouds', w, r.ctx, view, new Set()); } finally { setFlag('clouds', 'legacy'); } return r.log.calls.filter((c) => c[0] === 'arc').length; };
  assert.ok(arcs(0.13) > 20, 'small clouds over the sea at the whole-island view'); assert.equal(arcs(1.2), 0, 'none at the working zoom: the player is looking at the ground'); assert.equal(arcs(0.13), arcs(0.13), 'deterministic');
});
