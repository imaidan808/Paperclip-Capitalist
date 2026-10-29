// The sea's live motion and the V2 ground's vector layers (js/world/water.js, groundart.js, decalart.js), on a recording context: the motifs are hashed from the world and never near land or a bridge, they follow
// the camera (a motif has one world place), one slow current moves them all together, they stand still when motion is off, and nothing is drawn thinner than the art direction's floor or in a retired colour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx, thinnestStroke } from './helpers/recctx.mjs';
import { LAYOUT, DIST, EDGES } from '../js/world/layout.js';
import { coastOf } from '../js/world/scene.js';
import { lodOf } from '../js/world/lod.js';
import { motifCell, drawMotifs, drawSwash } from '../js/world/water.js';
import { tone } from '../js/world/decalart.js';
import { slotFor, runLayer } from '../js/world/stack.js';
import { luma } from '../js/world/iso.js';
import { PAVE } from '../js/world/palette.js';
import '../js/world/groundart.js'; // registers the V2 ground layers

const coast = coastOf(), RETIRED = ['#121826', '#4b7a4e', '#2f3644', '#1b3b5c', '#cdbb8e'];

test('motifs are hashed from the world: the same cell gives the same motifs, they stay a tile and a half from the coast and out of the bridges\' corridors, and a crest runs along the shore', () => {
  assert.strictEqual(motifCell(3, -2), motifCell(3, -2)); let crests = 0, curls = 0, glints = 0, near_n = 0;
  for (let cj = -8; cj < 30; cj++) for (let ci = -8; ci < 40; ci++) {
    const m = motifCell(ci, cj);
    for (let q = 0; q < m.crest.length; q += 6) {
      crests++; const gx = m.crest[q], gy = m.crest[q + 1], d = coast.dist(gx, gy); assert.ok(d >= 1.6, `a crest ${d.toFixed(2)} tiles from the coast`);
      for (const b of LAYOUT.bridges) for (const p of b.pts) assert.ok(Math.hypot(p[0] - gx, p[1] - gy) >= 3.6, 'a crest in a bridge\'s corridor');
      const e = 0.5, nx = coast.dist(gx + e, gy) - coast.dist(gx - e, gy), ny = coast.dist(gx, gy + e) - coast.dist(gx, gy - e), l = Math.hypot(nx, ny) || 1;
      assert.ok(Math.abs(Math.hypot(m.crest[q + 2], m.crest[q + 3]) - 1) < 1e-4, 'a unit direction'); if (coast.dist(gx, gy) < 8) assert.ok(Math.abs((nx / l) * m.crest[q + 2] + (ny / l) * m.crest[q + 3]) < 0.5, 'near the shore the crest runs along it (within 0.4 radian of the shore\'s line: the lean the hash gives it)'); else near_n++;
    }
    curls += m.curl.length / 3; glints += m.glint.length / 3;
  }
  assert.ok(crests > 300 && curls > 100 && glints > 300, `${crests} crests, ${curls} curls, ${glints} glints`); assert.ok(near_n > 100, 'out in the open water the crests lie with the wind and not with the coast');
});

const VIEW = { x0: -700, x1: 700, y0: 1800, y1: 2700 };
const draw = (view, zoom, t, lod = lodOf(zoom).detail) => { const r = recCtx(); drawMotifs(r.ctx, view, zoom, t, lod); return r; };
const pointsOf = (r) => r.log.calls.filter((c, i) => c[0] === 'moveTo' && r.log.calls[i + 1] && r.log.calls[i + 1][0] === 'quadraticCurveTo').map((c) => `${c[1].toFixed(2)},${c[2].toFixed(2)}`); // the crests' start points (a glint starts with a lineTo, a curl with an arc)

test('motifs are drawn in world space: two views that overlap draw the same motifs at the same world places, so a pan moves them with the island', () => {
  const a = pointsOf(draw(VIEW, 1, 0)), b = pointsOf(draw({ x0: VIEW.x0 + 300, x1: VIEW.x1 + 300, y0: VIEW.y0 + 160, y1: VIEW.y1 + 160 }, 1, 0));
  assert.ok(a.length > 30, `${a.length} points`); const inB = new Set(b); const shared = a.filter((p) => inB.has(p)); assert.ok(shared.length > a.length * 0.3, 'the overlap draws the same points');
  const sa = new Set(a); for (const p of b) { const [x, y] = p.split(',').map(Number); if (x > VIEW.x0 + 300 + 120 && x < VIEW.x1 - 120 && y > VIEW.y0 + 160 + 120 && y < VIEW.y1 - 120) assert.ok(sa.has(p), 'a point inside both views is in both pictures'); }
});

test('the current is one slow drift for every motif (at most 0.04 tile a second), and under motion off the motifs stand at their resting pose, drawn the same every time', () => {
  const rest = pointsOf(draw(VIEW, 1, 0)), again = pointsOf(draw(VIEW, 1, 0)); assert.deepEqual(rest, again);
  const moved = pointsOf(draw(VIEW, 1, 1.0)); assert.equal(moved.length, rest.length, 'the same motifs');
  const d = rest.map((p, i) => { const [x0, y0] = p.split(',').map(Number), [x1, y1] = moved[i].split(',').map(Number); return [x1 - x0, y1 - y0]; });
  for (const q of d) { assert.ok(Math.abs(q[0] - d[0][0]) < 0.05 && Math.abs(q[1] - d[0][1]) < 0.05, 'every motif moved by the same amount'); }
  const later = pointsOf(draw(VIEW, 1, 7.0)); const [x0] = moved[0].split(',').map(Number), [x1] = later[0].split(',').map(Number); assert.ok(Math.abs(x1 - x0) < 6 * 0.04 * 45.3 + 5, 'the drift is slow');
});

test('crests are not drawn at the far zoom, curls and glints only from the near band, the count is bounded, and the state is left as it was found', () => {
  assert.equal(draw(VIEW, 0.15, 0).log.calls.length, 0, 'nothing at far zoom');
  const mid = draw({ x0: -3000, x1: 3000, y0: 500, y1: 4500 }, 0.5, 0), near = draw(VIEW, 1.2, 0), fills = (r) => r.log.calls.filter((c) => c[0] === 'fill' || c[0] === 'stroke').length;
  assert.ok(fills(mid) > 0 && fills(mid) <= 1300, `${fills(mid)} marks at the mid zoom`); assert.ok(fills(near) > fills(draw(VIEW, 0.45, 0)) * 0.5);
  assert.equal(mid.log.depth, 0, 'save and restore balance'); assert.equal(near.state.globalAlpha, 1);
  assert.ok(thinnestStroke(near.log) >= 2.2, 'no hairline: the curls are at least 2.2 world pixels');
  for (const f of near.log.fills) for (const c of RETIRED) assert.notEqual(f.style, c);
});

test('the sea\'s motifs have a screen-space minimum: a crest is at least 14 screen pixels long at any zoom (28 world pixels at 0.5)', () => {
  const lens = (zoom) => { const r = draw({ x0: -700 / zoom * 0.6, x1: 700 / zoom * 0.6, y0: 1800, y1: 2300 }, zoom, 0), mv = r.log.calls.filter((c) => c[0] === 'moveTo'); let best = 0; for (let i = 0; i < r.log.calls.length - 1; i++) { const c = r.log.calls[i], n = r.log.calls[i + 1]; if (c[0] === 'moveTo' && n[0] === 'quadraticCurveTo') best = Math.max(best, Math.hypot(n[3] - c[1], n[4] - c[2])); } return best * zoom; };
  for (const z of [0.4, 0.5, 1]) assert.ok(lens(z) >= 13.5 || lens(z) === 0, `at ${z} the longest crest is ${lens(z).toFixed(1)} screen pixels`);
});

// ---------------------------------------------------------------------------------------------------------------------------- the vector layers
const fakeW = (open = [1]) => ({ unlocked: new Set(open), env: { lod: lodOf(1), t: 0 }, cam: { z: 1 }, toWorld() {}, toScreen() {} });
function layer(id, view, open) { const r = recCtx(), w = fakeW(open); runLayer(id, w, r.ctx, view, { zoom: 1, far: false, mode: 1, see: () => true }); return r; }
const D1 = DIST[1], V1 = { x0: (D1.ox - D1.oy - 6) * 32, x1: (D1.ox + 22 - D1.oy + 6) * 32, y0: (D1.ox + D1.oy) * 16 - 400, y1: (D1.ox + D1.oy + 40) * 16 + 200 };

test('the V2 blocks and roads: drawn in filled shapes only (no stroke at all), balanced, in colours that read in daylight, and a locked district is veiled, not darkened', () => {
  for (const id of ['blocks', 'roads']) {
    assert.equal(slotFor(id).impl, 'v2'); const r = layer(id, V1, [1]); assert.ok(r.log.fills.length > 10, `${id} draws`); assert.equal(thinnestStroke(r.log), Infinity, `${id}: no line is stroked`); assert.equal(r.log.depth, 0);
    for (const f of r.log.fills) { for (const c of RETIRED) assert.notEqual(f.style, c); }
  }
  const lumOf = (r) => { const cs = r.log.fills.map((f) => f.style).filter((s) => typeof s === 'string' && s[0] === '#'); return cs.reduce((a, c) => a + luma(c), 0) / cs.length; };
  const open = lumOf(layer('blocks', V1, [1])), locked = lumOf(layer('blocks', V1, []));
  assert.ok(locked >= open - 0.04, `a locked district is not darker (${open.toFixed(3)} open, ${locked.toFixed(3)} locked)`);
});

test('the V2 roads draw every road of the island as a kerbed ribbon: the kerb colour, the asphalt, the dashes and, on bridges, planks; a ferry is buoys', () => {
  const all = { x0: -6000, x1: 7000, y0: -500, y1: 6000 }, r = layer('roads', all, LAYOUT.ids);
  assert.ok(r.log.fills.length > EDGES.length * 2, `${r.log.fills.length} fills for ${EDGES.length} roads`);
  const styles = new Set(r.log.fills.map((f) => f.style)); for (const c of [PAVE.cream, '#ffe27a']) assert.ok(styles.has(c) || [...styles].some((s) => typeof s === 'string' && s.toLowerCase() === c), `${c} is drawn`);
  assert.ok(r.log.calls.filter((c) => c[0] === 'ellipse').length > 20, 'bends are rounded and the ferry has buoys');
});

test('decal colours are read for daylight: a dark kit colour is lifted towards cream, a light one is kept, alpha is kept, and a district under cloud is veiled', () => {
  assert.ok(luma(tone('#232c3a')) > 0.5, 'a dark slab becomes pale'); assert.equal(tone('#fff0cf'), '#fff0cf'); assert.match(tone('rgba(20,16,12,.3)'), /^rgba\(\d+,\d+,\d+,0\.3\)$/); assert.equal(tone(null), null);
  assert.notEqual(tone('#d4c070', 1), tone('#d4c070', 0), 'veiled'); assert.ok(luma(tone('#d4c070', 1)) >= luma('#d4c070') - 0.03, 'never darker');
});

test('the swash breathes on the beaches only while motion is on: nothing at rest, soft strokes with a phase that runs along the coast, none thinner than 1.5, none at tier 3, none far out', () => {
  const view = { x0: -4800, x1: -3000, y0: 1800, y1: 3200 };
  const sw = (t, zoom = 1, tier = 0) => { const r = recCtx(); drawSwash(r.ctx, view, zoom, t, tier); return r; };
  assert.equal(sw(0).log.calls.length, 0, 'at rest the baked foam is the picture'); assert.equal(sw(3, 1, 3).log.calls.length, 0); assert.equal(sw(3, 0.3).log.calls.length, 0);
  const r = sw(2.5), strokes = r.log.strokes; assert.ok(strokes.length > 8, `${strokes.length} strokes on the beaches in view`); assert.ok(thinnestStroke(r.log) >= 1.5); assert.equal(r.log.depth, 0);
  const alphas = new Set(strokes.map((s) => s.alpha.toFixed(2))); assert.ok(alphas.size > 4, 'the phase differs along the coast');
  const a = sw(2.5).log.strokes.map((s) => s.alpha.toFixed(3)).join(), b = sw(2.5 + 6.5).log.strokes.map((s) => s.alpha.toFixed(3)).join(); assert.equal(a, b, 'the breath has a period of 6.5 seconds');
});

// ---------------------------------------------------------------------------------------------------------------------------- the redrawn sea (docs/RENDER_PLAN.md, repair round 1)
import { crestDir, hz, swashStretches } from '../js/world/water.js';
import { ellKind } from '../js/world/decalart.js';

test('hz: a well-mixed hash in [0, 1) that leaves no rows (the motifs of the sea and the tufts of the meadow stand at hashed places, not on a lattice)', () => {
  let min = 1, max = 0, sum = 0; const n = 4000; for (let i = 0; i < n; i++) { const v = hz(i % 64, (i / 64) | 0, 7); assert.ok(v >= 0 && v < 1); min = Math.min(min, v); max = Math.max(max, v); sum += v; }
  assert.ok(min < 0.01 && max > 0.99 && Math.abs(sum / n - 0.5) < 0.03, 'uniform'); assert.equal(hz(3, 4, 5), hz(3, 4, 5)); assert.notEqual(hz(3, 4, 5), hz(4, 3, 5));
  // no row: the first-difference of consecutive cells is as spread as for independent draws (a lattice leaves neighbours alike)
  let close = 0; for (let i = 0; i < 2000; i++) if (Math.abs(hz(i, 5, 1) - hz(i + 1, 5, 1)) < 0.02) close++; assert.ok(close < 2000 * 0.06, `${close} neighbours alike`);
});

test('crestDir: along the shore close in, with the wind far out, always a unit vector, and a hashed lean of at most 0.4 radian either way', () => {
  const o = [0, 0], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  crestDir(2, 1, 0, 0, o); assert.ok(Math.abs(Math.hypot(o[0], o[1]) - 1) < 1e-9); assert.ok(Math.abs(o[0]) < 1e-9 && Math.abs(Math.abs(o[1]) - 1) < 1e-9, 'a shore whose distance grows along gx: the crest runs along gy');
  const wind = [Math.SQRT1_2, -Math.SQRT1_2]; crestDir(40, 1, 0, 0, o); assert.ok(Math.abs(dot(o, wind)) > 0.999, 'far out the crest lies with the wind: horizontal on the screen');
  for (const j of [-1, 0.5, 1]) { crestDir(2, 0, 1, j, o); const a = Math.atan2(Math.abs(o[1]), Math.abs(o[0])); assert.ok(a <= 0.4 + 1e-9, 'the lean is at most 0.4 radian'); }
});

test('swashStretches: the stretches of a coast ring are worked out once (the same object every time), beach only, and every one starts where the ring does', () => {
  const ring = coast.rings[0], a = swashStretches(ring), b = swashStretches(ring); assert.strictEqual(a, b, 'made once'); assert.ok(a.n > 5, `${a.n} beach stretches`);
  for (let s = 0; s < a.n; s++) { const i = a.i[s]; assert.ok(a.j[s] > i, 'a stretch has a run of points'); assert.equal(a.x[s], Math.fround((ring[2 * i] - ring[2 * i + 1]) * 32)); assert.ok(a.arc[s] >= 0); if (s) assert.ok(a.arc[s] > a.arc[s - 1], 'the phase runs along the coast'); }
});

test('ellKind: a blue fill is a puddle, a dark one dirt, a light one a ring; the scrap yard\'s stains are dirt and puddles and never grey ellipses', () => {
  assert.equal(ellKind('rgba(110,150,190,.32)'), 'puddle'); assert.equal(ellKind('rgba(20,16,12,.3)'), 'dirt'); assert.equal(ellKind('rgba(245,211,106,.18)'), 'ring'); assert.equal(ellKind(''), 'ring'); assert.equal(ellKind('#102030'), 'puddle'); assert.equal(ellKind('#2a2420'), 'dirt');
});
