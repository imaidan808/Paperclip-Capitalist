// Rounded solids (js/world/solids.js): the shapes the art direction builds the toy island from, against a recording canvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx, thinnestStroke, callNames } from './helpers/recctx.mjs';
import { bevelRadius, minLine, roundedPoly, roundedBox, capsule, puff, outlineOf } from '../js/world/solids.js';
import { EDGE_WPX } from '../js/world/shadow.js';
import { box, P, mix } from '../js/world/iso.js';
import { faceTone, LIGHT } from '../js/world/palette.js';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} is not ${b}`);

test('the bevel radius is a tenth of the shorter side in world pixels, never under 3 and never over 12: a crate is a 3.6 pixel fillet, a hall 9, a tower 11', () => {
  near(EDGE_WPX, Math.hypot(32, 16)); near(bevelRadius(1, 1), 3.5777, 1e-3); assert.equal(bevelRadius(0.2, 0.2), 3); near(bevelRadius(3, 3), 10.733, 1e-3); assert.equal(bevelRadius(4, 4), 12); assert.equal(bevelRadius(5, 0.5), bevelRadius(0.5, 5));
  near(bevelRadius(2.4, 2.7), 8.587, 1e-3);
  for (let w = 0.1; w < 6; w += 0.1) for (const d of [0.2, 1, 3]) { const r = bevelRadius(w, d); assert.ok(r >= 3 && r <= 12); }
});

test('the thinnest line is 1.5 world pixels, and never under 1.25 screen pixels', () => {
  assert.equal(minLine(1), 1.5); assert.equal(minLine(2.4), 1.5); near(minLine(0.5), 2.5); near(minLine(0.129), 1.25 / 0.129); assert.ok(minLine(0) > 1000, 'a zero zoom does not divide by zero');
});

test('roundedPoly rounds every corner of a convex outline with a curve and closes the path', () => {
  const { ctx, log } = recCtx(), hexagon = outlineOf(0, 0, 2, 2, 20);
  assert.equal(roundedPoly(ctx, hexagon, 3), 6);
  const names = callNames(log); assert.equal(names.filter((n) => n === 'quadraticCurveTo').length, 6); assert.equal(names.at(-1), 'closePath'); assert.equal(names[0], 'beginPath');
  const { ctx: c2, log: l2 } = recCtx(); assert.equal(roundedPoly(c2, [[0, 0], [10, 0], [10, 10], [0, 10]], 0.001), 0, 'a radius too small to see leaves the corners square (and cannot divide by zero)');
  assert.equal(roundedPoly(recCtx().ctx, [[0, 0], [10, 0], [10, 10], [0, 10]], 0.5), 4);
  const { ctx: c3, log: l3 } = recCtx(); roundedPoly(c3, [[0, 0], [2, 0], [2, 2], [0, 2]], 50); assert.equal(callNames(l3).filter((n) => n === 'quadraticCurveTo').length, 4, 'a radius bigger than the edges shrinks to fit');
  for (const [, ...a] of l3.calls) for (const v of a) assert.ok(Number.isFinite(v), 'no NaN in the path');
  void l2;
});

test('roundedBox answers the faces box() answers for the same prism, so hit shapes and window grids are unchanged', () => {
  const { ctx } = recCtx(), { ctx: c2 } = recCtx(), t = faceTone('#e1d4f3');
  for (const [gx, gy, w, d, h, z] of [[3, 4, 2.4, 1.6, 36, 0], [10, 10, 1, 1, 12, 6], [0, 0, 3, 3, 80, 0]]) {
    const a = roundedBox(ctx, gx, gy, w, d, h, '#e1d4f3', { z }), b = box(c2, gx, gy, w, d, h, t, { z });
    for (const k of ['left', 'right', 'top']) assert.deepEqual(a[k], b[k], k);
    near(a.r, bevelRadius(w, d));
  }
});

test('roundedBox clips to a rounded outline, balances save and restore, rounds the three inner edges (a fillet down the front, a chamfer along the top, an AO band at the foot) and no stroke is under 1.5 world pixels', () => {
  const { ctx, log } = recCtx(); roundedBox(ctx, 2, 2, 2, 2, 30, '#ffc8d0');
  assert.equal(log.clips, 1); assert.equal(log.depth, 0); assert.equal(log.minDepth, 0);
  assert.ok(callNames(log).filter((n) => n === 'quadraticCurveTo').length >= 6);
  const styles = log.strokes.map((s) => s.style), t = faceTone('#ffc8d0'); assert.ok(styles.includes(LIGHT.rim) && styles.includes(LIGHT.ao), 'the sun streak and the AO band');
  assert.ok(styles.includes(mix(t.t, t.l, 0.5)) && styles.includes(mix(t.t, t.r, 0.5)), 'a chamfer band on each front top edge, in the colour between the top and the wall');
  assert.ok(callNames(log).includes('fillRect') && log.rects.some((r) => r.w > 4 && r.h > 20), 'a fillet strip down the front corner, as wide as the corner is round');
  assert.ok(thinnestStroke(log) >= 1.5, `a stroke of ${thinnestStroke(log)}`);
  // the bevel is a band as wide as the radius, not a hairline: the chamfer strokes are at least a pixel and a half and scale with the fillet, and every band is wider than the old 1.5 and 3 pixel ones
  const wide = (r) => { const q = recCtx(); roundedBox(q.ctx, 2, 2, 3.3, 3.3, 90, '#ffc8d0', r ? { r } : {}); return q.log.strokes.map((s) => s.lw); };
  assert.ok(Math.max(...wide()) >= 12, 'at a hall\'s radius the widest band is 12 world pixels or more'); assert.ok(Math.max(...wide(3)) < Math.max(...wide(12)), 'the bands follow the radius');
  const none = recCtx(); roundedBox(none.ctx, 2, 2, 2, 2, 30, '#ffc8d0', { rim: false, ao: false, edge: false }); assert.equal(none.log.strokes.length, 0, 'the extras can be switched off'); assert.equal(none.log.rects.length, 0);
  const flat = recCtx(); roundedBox(flat.ctx, 2, 2, 2, 2, 5, '#ffc8d0'); assert.equal(flat.log.rects.length, 0, 'a prism under 8 pixels tall (a kerb) has no fillet and no foot band'); assert.equal(flat.log.depth, 0);
  const alphaIn = recCtx(); alphaIn.ctx.globalAlpha = 0.5; roundedBox(alphaIn.ctx, 2, 2, 2, 2, 30, '#ffc8d0'); near(alphaIn.state.globalAlpha, 0.5);
  for (const s of alphaIn.log.strokes) assert.ok(s.alpha <= 0.5 + 1e-9, 'extras are drawn under the caller\'s own alpha');
});

test('no colour a solid draws is black or ink; the darkest face is a lit violet-blue', () => {
  const { ctx, log } = recCtx(); roundedBox(ctx, 1, 1, 2, 2, 40, '#cdeedc');
  for (const s of [...log.fills.map((f) => f.style), ...log.strokes.map((s) => s.style)]) assert.ok(typeof s !== 'string' || !/^#0|^rgba?\(0,0,0|^rgba?\(8,10,20/.test(s), `${s} is black or ink`);
});

test('a capsule and a puff: round-capped, never thinner than 3 world pixels across; a puff is a body and two crescents', () => {
  const { ctx, log } = recCtx(); capsule(ctx, 0, 0, 10, 10, 0.2, '#cc8f50');
  assert.equal(log.strokes[0].lw, 3); assert.equal(log.depth, 0); assert.ok(log.calls.some((c) => c[0] === 'lineCap') === false, 'the cap is set as state, not called');
  const big = recCtx(); capsule(big.ctx, 0, 0, 10, 10, 4, '#cc8f50'); assert.equal(big.log.strokes[0].lw, 8);
  const p = recCtx(); puff(p.ctx, 10, 10, 8); assert.equal(p.log.depth, 0); assert.equal(p.log.clips, 1); assert.equal(p.log.fills.length, 3, 'body, belly, highlight'); near(p.state.globalAlpha, 1);
  assert.equal(callNames(p.log).filter((n) => n === 'arc').length, 3);
  const tiny = recCtx(); puff(tiny.ctx, 0, 0, 0.1); assert.ok(tiny.log.calls.find((c) => c[0] === 'arc')[3] >= 1.5, 'a puff is at least 1.5 across its radius');
});
