// T5 raster quality: the crisp-edge tools (js/world/crisp.js) and the quality governor's rules (js/world/governor.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/world/crisp.js';
import * as G from '../js/world/governor.js';
import { recCtx, thinnestStroke } from './helpers/recctx.mjs';

const ctxAt = (a, e = 0, f = 0) => { const r = recCtx(); r.ctx.getTransform = () => ({ a, b: 0, c: 0, d: a, e, f }); return r; };

test('lineFor: never thinner than 1.5 world pixels and never thinner than 1.25 device pixels, at any scale', () => {
  for (const a of [0.26, 0.5, 1, 1.8, 2.4, 4.8]) { const w = C.lineFor(ctxAt(a).ctx, 1); assert.ok(w >= 1.5 - 1e-9 && w * a >= 1.25 - 1e-9, `scale ${a}: ${w}`); }
  assert.equal(C.lineFor(1.8, 3), 3, 'a line that is already thick is left as it is'); assert.equal(C.lineFor(ctxAt(2).ctx, 3), 3);
  assert.ok(C.lineFor(0.26, 1.5) >= 4.8 - 1e-9, 'at the far zoom a 1.5 world pixel line would be 0.4 of a device pixel: it is widened to 1.25');
});

test('snapWorld and snapRect put edges on whole device pixels, and a rect never collapses', () => {
  for (const a of [0.9, 1.8, 2.4, 1.33]) for (const e of [0, 17, -203]) {
    for (const v of [3.3, -41.7, 1234.567]) { const s = C.snapWorld(v, a, e); assert.ok(Math.abs((s * a + e) - Math.round(s * a + e)) < 1e-9, 'a whole pixel'); assert.ok(Math.abs(s - v) <= 0.5 / a + 1e-9, 'and within half a pixel of where it was'); }
    const r = C.snapRect(10.2, 20.7, 0.01, 0.01, a, e, e); assert.ok(r[2] >= 1 / a - 1e-9 && r[3] >= 1 / a - 1e-9, 'a sliver is one device pixel at least');
    for (const x of [r[0], r[0] + r[2]]) assert.ok(Math.abs(x * a + e - Math.round(x * a + e)) < 1e-6);
  }
  assert.equal(C.strokeShift(1), 0.5); assert.equal(C.strokeShift(2), 0); assert.equal(C.strokeShift(3), 0.5); assert.equal(C.strokeShift(4), 0);
});

test('crispRect fills a rectangle whose edges are on the device grid of the current transform', () => {
  const { ctx, log } = ctxAt(1.8, 11, -7); C.crispRect(ctx, 10.2, 5.5, 20.3, 9.9);
  const q = log.calls.find((c) => c[0] === 'fillRect').slice(1);
  for (const [v, off] of [[q[0], 11], [q[0] + q[2], 11], [q[1], -7], [q[1] + q[3], -7]]) assert.ok(Math.abs(v * 1.8 + off - Math.round(v * 1.8 + off)) < 1e-6, 'an edge at ' + v);
});

test('inflate grows a convex polygon outward by d and keeps its winding, so two tiles that abut overlap by 2 d', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]], g = C.inflate(sq, 1);
  assert.deepEqual(g.map((p) => p.map((v) => +v.toFixed(6))), [[-1, -1], [11, -1], [11, 11], [-1, 11]], 'a square grows by 1 on every side');
  const dia = [[0, 0], [32, 16], [0, 32], [-32, 16]], gd = C.inflate(dia, 0.6), area = (p) => Math.abs(p.reduce((s, q, i) => s + q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1], 0)) / 2;
  assert.ok(area(gd) > area(dia) * 1.03 && area(gd) < area(dia) * 1.12, 'an iso tile grows a little: ' + (area(gd) / area(dia)).toFixed(3));
  const cw = [[0, 10], [10, 10], [10, 0], [0, 0]], gc = C.inflate(cw, 1); assert.deepEqual(gc.map((p) => p.map((v) => +v.toFixed(6))), [[-1, 11], [11, 11], [11, -1], [-1, -1]], 'either winding');
});

test('sealedFaces fills the union as one path first, then each face', () => {
  const { ctx, log } = recCtx(); C.sealedFaces(ctx, [{ pts: [[0, 0], [10, 0], [10, 10]], fill: '#111' }, { pts: [[0, 0], [10, 10], [0, 10]], fill: '#222' }], '#333');
  const fills = log.calls.filter((c) => c[0] === 'fill'); assert.equal(fills.length, 3, 'one for the union, one a face');
  const firstPath = log.calls.slice(0, log.calls.findIndex((c) => c[0] === 'fill')); assert.equal(firstPath.filter((c) => c[0] === 'moveTo').length, 2, 'both faces are in the first path');
  assert.equal(log.calls.filter((c) => c[0] === 'beginPath').length, 3);
});

test('contourFill draws the line under the fill, twice as wide, so it is wholly outside; and nothing at far zoom', () => {
  const { ctx, log } = recCtx(); C.contourFill(ctx, (g) => { g.moveTo(0, 0); g.lineTo(5, 0); g.lineTo(5, 5); g.closePath(); }, '#8fd68a', C.contourWidth(2.4, 'close'));
  const names = log.calls.map((c) => c[0]); assert.ok(names.indexOf('stroke') < names.lastIndexOf('fill'), 'the line comes first'); assert.ok(thinnestStroke(log) >= 1.6 * 2 / 2.4 - 1e-9, 'its width is twice the contour');
  const far = recCtx(); C.contourFill(far.ctx, (g) => { g.moveTo(0, 0); g.lineTo(5, 0); g.closePath(); }, '#8fd68a', C.contourWidth(0.2, 'far')); assert.equal(far.log.calls.filter((c) => c[0] === 'stroke').length, 0);
  assert.ok(C.contourWidth(2.4, 'close') >= 0.8 && C.contourWidth(0.4, 'mid') <= 3); assert.match(C.contourColor('#8fd68a'), /^#[0-9a-f]{6}$/);
  assert.ok(C.dashFor(0.3) >= 10 - 1e-9, 'a dash is 3 device pixels at least'); assert.ok(C.dashFor(2.4, 1) >= C.MIN_DASH);
});

test('audit finds the strokes under the floor and the rectangles off the grid', () => {
  const r = recCtx(); r.ctx.lineWidth = 1; r.ctx.beginPath(); r.ctx.moveTo(0, 0); r.ctx.lineTo(9, 0); r.ctx.stroke(); r.ctx.fillRect(0.3, 0.3, 5, 5);
  const a = C.audit(r.log, { scale: 1.8, e: 0, f: 0 }); assert.equal(a.thin, 1, 'a 1 px stroke at scale 1.8'); assert.ok(a.loose >= 1, 'a rectangle at 0.3');
  const ok = recCtx(); ok.ctx.lineWidth = 3; ok.ctx.beginPath(); ok.ctx.moveTo(0, 0); ok.ctx.lineTo(9, 0); ok.ctx.stroke(); assert.equal(C.audit(ok.log, { scale: 1 }).thin, 0);
});

// ---------------------------------------------------------------- the governor's rules
test('judge: a late frame counts as slow however cheap its drawing was; a frame on time is judged by its own cost', () => {
  assert.equal(G.judge(5, 0, 30), 5, 'no gap (a pause): the cost'); assert.equal(G.judge(5, 40, 30), 5, 'a gap near the target interval: the cost');
  assert.ok(G.judge(5, 70, 30) >= 56 - 1e-9, 'a frame 2.1 intervals late: the gap, mostly'); assert.ok(G.judge(5, 100, 30) >= G.SLOW_MS + 4, 'very late: never under slow + 4');
  assert.ok(G.judge(5, 40, 60) >= 32 - 1e-9, 'the same gap is late for a 60 fps loop'); assert.equal(G.judge(30, 100, 30) >= 80, true);
});

test('fpsFor: the 30 fps cap is for a still camera; a camera that moves draws every refresh while the tiers are low', () => {
  for (const [slow, moving, want] of [[0, false, 30], [0, true, 60], [2, true, 60], [3, true, 20], [3, false, 20], [4, true, 20], [5, true, 15], [6, false, 15], [1, false, 30]]) assert.equal(G.fpsFor(slow, moving), want, `tier ${slow}, moving ${moving}`);
});

test('the tier table: one row a tier, each drops at least what the row before dropped, and the base is never blurred (the density is the only softening, from tier 4)', () => {
  assert.equal(G.TIER_TABLE.length, G.GOV_TOP + 1); const order = ['close', 'near', 'mid'];
  for (let i = 0; i < G.TIER_TABLE.length; i++) {
    const r = G.TIER_TABLE[i]; assert.equal(r.tier, i); assert.ok(r.dpr === 1 || r.dpr === 0.75); assert.equal(r.dpr === 0.75, i >= 4, 'the density drop is from tier 4');
    if (i) { const p = G.TIER_TABLE[i - 1]; assert.ok(order.indexOf(r.lod) >= order.indexOf(p.lod), 'the band never rises with the tier'); assert.ok(r.sea.length >= p.sea.length && r.clouds.length >= p.clouds.length); assert.ok(r.fps <= p.fps); }
  }
  assert.equal(G.bandBuilt(2, 'close'), true); assert.equal(G.bandBuilt(3, 'close'), false); assert.equal(G.bandBuilt(4, 'near'), true); assert.equal(G.bandBuilt(5, 'near'), false); assert.equal(G.bandBuilt(6, 'base'), true);
  for (const r of G.TIER_TABLE) assert.equal(G.bandBuilt(r.tier, 'close'), r.lod === 'close'), assert.equal(G.bandBuilt(r.tier, 'near'), r.lod === 'close' || r.lod === 'near', 'the table and the rule say the same');
  assert.equal(G.tierRow(99).tier, 6); assert.equal(G.tierRow(-3).tier, 0);
});

test('the world: tiers rise under slow frames, fall again under fast ones, and the LOD band follows (feeds slow costs, then fast)', async () => {
  const { World } = await import('../js/world/world.js');
  const w = Object.create(World.prototype); w.gov = { cost: 0, bad: 0, good: 0, wait: G.GOV_WAIT, upAt: -1e9, prev: 0 }; w.warm = 0; w.slow = 0; w.fps = 30; w.t = 0;
  for (let i = 0; i < 60; i++) w.govern(40, 0); assert.ok(w.slow >= 4, 'slow frames step the tier down: ' + w.slow);
  const top = w.slow; for (let i = 0; i < 400; i++) { w.t += 40; w.govern(4, 0); } assert.ok(w.slow < top && w.slow === 0, 'fast frames bring it back: ' + w.slow);
  w.slow = 0; w.fps = 60; w.gov.cost = 8; for (let i = 0; i < 30; i++) w.govern(6, 90); assert.ok(w.slow >= 3, 'cheap JavaScript but a raster that cannot keep up (the interval is 90 ms against 16.7) steps down too: ' + w.slow);
});

// ---------------------------------------------------------------- labels: whole device pixels
test('labels: a rule is a whole number of device pixels and a text baseline is on a device pixel, at every density', async () => {
  const { Labels } = await import('../js/world/labels.js');
  for (const d of [1, 1.25, 1.5, 1.75, 2]) {
    const l = new Labels(); l.dpr = d;
    for (const n of [1, 1.33, 2]) { const w = l.lw(n) * d; assert.ok(Math.abs(w - Math.round(w)) < 1e-9 && w >= 1, `dpr ${d}, rule ${n}: ${w} device px`); }
    const seen = []; const g = { textAlign: 'left', fillText: (s, x, y) => seen.push([x, y]) }; l.text(g, 'abc', 10.3, 9.37); assert.ok(Math.abs(seen[0][1] * d - Math.round(seen[0][1] * d)) < 1e-9 && Math.abs(seen[0][0] * d - Math.round(seen[0][0] * d)) < 1e-9, `dpr ${d}: the baseline is on a pixel`);
    const c = { textAlign: 'center', fillText: (s, x, y) => seen.push([x, y]) }; l.text(c, 'abc', 10.3, 9.37); assert.equal(seen[1][0], 10.3, 'a centred run keeps its anchor');
  }
  const two = new Labels(); two.dpr = 2; assert.equal(two.lw(), 1.5, 'the 2x rule is unchanged: three device pixels');
});
