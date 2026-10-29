// The sea's live motion and the V2 ground's vector layers (js/world/water.js, groundart.js, decalart.js), on a recording context: the motifs are hashed from the world and never near land or a bridge, they follow
// the camera (a motif has one world place), one slow current moves them all together, they stand still when motion is off, and nothing is drawn thinner than the art direction's floor or in a retired colour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx, thinnestStroke } from './helpers/recctx.mjs';
import { LAYOUT, DIST, EDGES } from '../js/world/layout.js';
import { coastOf } from '../js/world/scene.js';
import { lodOf } from '../js/world/lod.js';
import { motifCell, drawMotifs, drawSwash, leanClamp, beachRuns } from '../js/world/water.js';
import { crestOutline, CREST_N, foamChain, ringState, sparkle, ribbon } from '../js/world/waves.js';
import { tone } from '../js/world/decalart.js';
import { slotFor, runLayer } from '../js/world/stack.js';
import { luma } from '../js/world/iso.js';
import { PAVE } from '../js/world/palette.js';
import '../js/world/groundart.js'; // registers the V2 ground layers

const coast = coastOf(), RETIRED = ['#121826', '#4b7a4e', '#2f3644', '#1b3b5c', '#cdbb8e'];

test('motifs are hashed from the world: the same cell gives the same motifs, they stay two tiles from the coast and out of the bridges\' corridors, and a crest lies within 34 degrees of the screen\'s horizontal (CHANGED: it was "perpendicular to the distance\'s gradient": the new crests are bold capsules that lie on the water)', () => {
  assert.strictEqual(motifCell(3, -2), motifCell(3, -2)); let crests = 0, curls = 0, glints = 0, rings = 0;
  for (let cj = -8; cj < 30; cj++) for (let ci = -8; ci < 40; ci++) {
    const m = motifCell(ci, cj);
    for (let q = 0; q < m.crest.length; q += 7) {
      crests++; const gx = m.crest[q], gy = m.crest[q + 1], d = coast.dist(gx, gy); assert.ok(d >= 2.0, `a crest ${d.toFixed(2)} tiles from the coast`);
      for (const b of LAYOUT.bridges) for (const p of b.pts) assert.ok(Math.hypot(p[0] - gx, p[1] - gy) >= 3.6, 'a crest in a bridge\'s corridor');
      const ux = m.crest[q + 2], uy = m.crest[q + 3], sx = (ux - uy) * 32, sy = (ux + uy) * 16, ang = Math.abs(Math.atan2(Math.abs(sy), Math.abs(sx))); assert.ok(ang <= 0.5934 + 1e-3, `a crest leans ${(ang * 57.3).toFixed(1)} degrees`);
    }
    curls += m.curl.length / 6; glints += m.glint.length / 5; rings += m.ring.length / 5;
  }
  assert.ok(crests > 300 && curls > 150 && glints > 300 && rings > 60, `${crests} crests, ${curls} curls, ${rings} ripples, ${glints} sparkles`);
});
test('leanClamp turns a grid direction to lean no more than 34 degrees from the screen\'s horizontal and leaves a flatter one alone', () => {
  const lean = (u) => Math.abs(Math.atan2(Math.abs((u[0] + u[1]) * 16), Math.abs((u[0] - u[1]) * 32)));
  assert.deepEqual(leanClamp(R2, -R2), [R2, -R2], 'the screen\'s horizontal stays'); assert.ok(lean(leanClamp(1, 0)) <= 0.5935, 'an iso axis leans 26.6 degrees and stays'); assert.ok(lean(leanClamp(R2, R2)) <= 0.5935, 'straight down the screen is turned');
  for (let a = 0; a < 6.28; a += 0.2) { const u = leanClamp(Math.cos(a), Math.sin(a)); assert.ok(lean(u) <= 0.5935 + 1e-6); assert.ok(Math.abs(Math.hypot(u[0], u[1]) - 1) < 1e-6 || lean([Math.cos(a), Math.sin(a)]) <= 0.5934); }
});
const R2 = Math.SQRT1_2;

const VIEW = { x0: -700, x1: 700, y0: 1800, y1: 2700 };
const draw = (view, zoom, t, lod = lodOf(zoom).detail) => { const r = recCtx(); drawMotifs(r.ctx, view, zoom, t, lod); return r; };
/** The closed polygons of a recording (the points of each beginPath to its fill): each as the list of [x, y] it moved and lined to. */
const polygons = (r) => { const out = []; let cur = null; for (const c of r.log.calls) { if (c[0] === 'beginPath') cur = []; else if (cur && (c[0] === 'moveTo' || c[0] === 'lineTo')) cur.push([c[1], c[2]]); else if (c[0] === 'fill' && cur) { if (cur.length) out.push(cur); cur = null; } else if (c[0] === 'arc' || c[0] === 'ellipse') cur = null; } return out; };
const crestsOf = (r) => polygons(r).filter((p) => p.length === 2 * CREST_N - 2); // the capsules (a sparkle has 8 points, a ribbon hundreds)
const startsOf = (r) => crestsOf(r).map((p) => `${p[0][0].toFixed(2)},${p[0][1].toFixed(2)}`);

test('motifs are drawn in world space: two views that overlap draw the same motifs at the same world places, so a pan moves them with the island', () => {
  const a = startsOf(draw(VIEW, 1, 0)), b = startsOf(draw({ x0: VIEW.x0 + 300, x1: VIEW.x1 + 300, y0: VIEW.y0 + 160, y1: VIEW.y1 + 160 }, 1, 0));
  assert.ok(a.length > 12, `${a.length} crests`); const inB = new Set(b); const shared = a.filter((p) => inB.has(p)); assert.ok(shared.length > a.length * 0.2, 'the overlap draws the same crests');
  const sa = new Set(a); for (const p of b) { const [x, y] = p.split(',').map(Number); if (x > VIEW.x0 + 380 && x < VIEW.x1 - 80 && y > VIEW.y0 + 240 && y < VIEW.y1 - 40) assert.ok(sa.has(p), 'a crest well inside both views is in both pictures'); }
});

test('the current is one slow drift for every motif (at most 0.04 tile a second), and under motion off the motifs stand at their resting pose, drawn the same every time', () => {
  const rest = startsOf(draw(VIEW, 1, 0)), again = startsOf(draw(VIEW, 1, 0)); assert.deepEqual(rest, again);
  const moved = startsOf(draw(VIEW, 1, 1.0)); assert.equal(moved.length, rest.length, 'the same crests');
  const d = rest.map((p, i) => { const [x0, y0] = p.split(',').map(Number), [x1, y1] = moved[i].split(',').map(Number); return [x1 - x0, y1 - y0]; });
  for (const q of d) { assert.ok(Math.abs(q[0] - d[0][0]) < 0.05 && Math.abs(q[1] - d[0][1]) < 0.05, 'every crest moved by the same amount'); }
  const later = startsOf(draw(VIEW, 1, 7.0)); const [x0] = moved[0].split(',').map(Number), [x1] = later[0].split(',').map(Number); assert.ok(Math.abs(x1 - x0) < 6 * 0.04 * 45.3 + 5, 'the drift is slow');
});

test('crests are not drawn at the far zoom, the rest only from the near band, the count is bounded, a ripple ring is never a hairline, and the state is left as it was found', () => {
  assert.equal(draw(VIEW, 0.15, 0).log.calls.length, 0, 'nothing at far zoom (the baked swell carries it)');
  const mid = draw({ x0: -3000, x1: 3000, y0: 500, y1: 4500 }, 0.5, 0), near = draw(VIEW, 1.2, 0), fills = (r) => r.log.calls.filter((c) => c[0] === 'fill' || c[0] === 'stroke').length;
  assert.ok(fills(mid) > 0 && fills(mid) <= 2200, `${fills(mid)} marks at the mid zoom`); assert.ok(crestsOf(mid).length > 0 && !mid.log.calls.some((c) => c[0] === 'ellipse'), 'the mid band draws crests only: ripples and curls are near-band marks');
  assert.ok(near.log.calls.some((c) => c[0] === 'ellipse') && near.log.calls.some((c) => c[0] === 'arc'), 'the near band adds ripples and curls');
  assert.equal(mid.log.depth, 0, 'save and restore balance'); assert.equal(near.state.globalAlpha, 1);
  assert.ok(thinnestStroke(near.log) >= 1.8, `no hairline: the ripple rings are at least 1.8 world pixels (${thinnestStroke(near.log)})`);
  for (const f of near.log.fills) for (const c of RETIRED) assert.notEqual(f.style, c);
});

test('the close band adds a second helping: more marks at 2.2 than at 1.0, none of them popping in (a mark of the extra helping has the alpha of the close band)', () => {
  const lo = draw(VIEW, 1.0, 0), hi = draw({ x0: VIEW.x0, x1: VIEW.x1, y0: VIEW.y0, y1: VIEW.y1 }, 2.2, 0, lodOf(2.2).detail), n = (r) => r.log.calls.filter((c) => c[0] === 'fill' || c[0] === 'stroke').length;
  assert.ok(n(hi) > n(lo) * 1.2, `${n(hi)} marks close against ${n(lo)} at the working zoom`);
  const half = lodOf(1.3).detail; assert.ok(half[3] > 0 && half[3] < 1, 'the close band is part way in at 1.3'); const mid = draw(VIEW, 1.3, 0, half); assert.ok(n(mid) >= n(lo) && n(mid) <= n(hi) + 5, 'between the two');
});

test('the sea\'s motifs have a screen-space minimum: a crest (and the trough under it, 94% of it) is at least 22 screen pixels long at any zoom', () => {
  for (const z of [0.4, 0.5, 1]) {
    const r = draw({ x0: -700 / z * 0.6, x1: 700 / z * 0.6, y0: 1800, y1: 2300 }, z, 0), cs = crestsOf(r); let shortest = 1e9;
    for (const p of cs) { let w = 0; for (const a of p) for (const b of p) w = Math.max(w, Math.hypot(a[0] - b[0], a[1] - b[1])); shortest = Math.min(shortest, w * z); }
    assert.ok(cs.length === 0 || shortest >= 22.4, `at ${z} the shortest crest is ${shortest.toFixed(1)} screen pixels`);
  }
});

// ---------------------------------------------------------------------------------------------------------------------------- the shapes of the sea (waves.js)
test('a crest outline is one closed rounded form: 2 x CREST_N - 2 points, fattest in the middle, round at the ends, bowed to its left, never thicker than asked', () => {
  const out = new Float32Array(64), n = crestOutline(out, 100, 50, 1, 0, 30, 8, 0); assert.equal(n, 2 * CREST_N - 2);
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9; for (let i = 0; i < n; i++) { minX = Math.min(minX, out[2 * i]); maxX = Math.max(maxX, out[2 * i]); minY = Math.min(minY, out[2 * i + 1]); maxY = Math.max(maxY, out[2 * i + 1]); }
  assert.ok(Math.abs(minX - 70) < 1e-3 && Math.abs(maxX - 130) < 1e-3, 'it is 2 x half long'); assert.ok(Math.abs(maxY - minY - 8) < 1e-3, 'it is `thick` through at the middle');
  assert.ok(Math.abs(out[1] - 50) < 1e-3, 'it ends on its axis (a rounded end, not a corner): the first point is the tip');
  const bowed = new Float32Array(64); crestOutline(bowed, 100, 50, 1, 0, 30, 8, 6); let by = 0; for (let i = 0; i < n; i++) by += bowed[2 * i + 1]; let ay = 0; for (let i = 0; i < n; i++) ay += out[2 * i + 1]; assert.ok(Math.abs(by - ay) > 1, 'a bow moves the middle');
});
test('a foam chain is a row of overlapping discs along an arc that swell to the middle; a ring is whole at rest and grows and fades with the clock; a sparkle has four arms', () => {
  const ch = new Float32Array(30), n = foamChain(ch, 0, 0, 0, 20, 4, 7, 1.9); assert.equal(n, 7); assert.ok(ch[3 * 3 + 2] > ch[2] && ch[3 * 3 + 2] > ch[3 * 6 + 2], 'the middle disc is the biggest'); assert.ok(Math.abs(ch[2] - 4 * 0.55) < 1e-6, 'the end discs are 0.55');
  for (let i = 0; i + 1 < n; i++) assert.ok(Math.hypot(ch[3 * i] - ch[3 * i + 3], (ch[3 * i + 1] - ch[3 * i + 4]) * 2) < ch[3 * i + 2] + ch[3 * i + 5] + 2.5, 'neighbours overlap or touch, so the edge is scalloped, not beaded');
  const r0 = ringState(0.3, 0, 0), r1 = ringState(0.3, 0, 0); assert.deepEqual(r0, r1, 'still at rest'); assert.ok(r0.r > 0.2 && r0.a > 0, 'a ring stands at its resting radius');
  let grow = true, prev = -1; for (let t = 0; t < 7; t += 0.5) { const s = ringState(0.1, t, 0); if (prev > s.r && s.r > 0.3) grow = false; prev = s.r; assert.ok(s.a >= 0 && s.a <= 1 && s.r >= 0.22 && s.r <= 1); } assert.ok(grow, 'a ring only grows through its cycle');
  const sp = new Float32Array(16); assert.equal(sparkle(sp, 10, 10, 5, 0.25), 8); assert.equal(sp[1], 5); assert.equal(sp[9], 15); assert.equal(sp[12], 10 - 5 * 0.85);
});
test('a ribbon is one polygon: the run\'s own points out, the same points pushed to the sea by the width back, so a tapering width ends in a point', () => {
  const pts = Float32Array.from([0, 0, 10, 0, 20, 0, 30, 0]), nrm = Float32Array.from([0, 1, 0, 1, 0, 1, 0, 1]), out = new Float32Array(32), k = ribbon(out, pts, nrm, 4, (i) => [0, 3, 3, 0][i]);
  assert.equal(k, 8); assert.deepEqual([...out.slice(0, 8)], [0, 0, 10, 0, 20, 0, 30, 0]); assert.deepEqual([...out.slice(8, 16)], [30, 0, 20, 3, 10, 3, 0, 0], 'the far edge comes back, pinched at both ends');
});

test('the beaches of a ring are runs of consecutive beach points with sea-side normals that point to the water, and none wraps the ring\'s start', () => {
  let runs = 0, pts = 0, away = 0;
  for (const ring of coastOf().rings) for (const run of beachRuns(ring)) { runs++; assert.ok(run.n >= 6); for (let i = 0; i < run.n; i += 4) { pts++; const gx = run.grid[2 * i], gy = run.grid[2 * i + 1], d = coast.dist(gx + run.nrm[2 * i] * 0.3, gy + run.nrm[2 * i + 1] * 0.3); if (!(d > 0)) away++; } }
  assert.ok(runs >= 6 && pts > 40, `${runs} runs, ${pts} points`); assert.ok(away <= pts * 0.04, `${away} of ${pts} normals point at the land`);
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

test('the swash breathes on the beaches only while motion is on: nothing at rest, ONE filled polygon along each beach (CHANGED from short stroked stretches whose butt ends stepped every 0.7 tile), its width a smooth function of the arc that tapers to a point at both ends, none at tier 3, none far out', () => {
  const view = { x0: -4800, x1: -3000, y0: 1800, y1: 3200 };
  const sw = (t, zoom = 1, tier = 0) => { const r = recCtx(); drawSwash(r.ctx, view, zoom, t, tier); return r; };
  assert.equal(sw(0).log.calls.length, 0, 'at rest the baked foam is the picture'); assert.equal(sw(3, 1, 3).log.calls.length, 0); assert.equal(sw(3, 0.3).log.calls.length, 0);
  const r = sw(2.5); assert.equal(r.log.strokes.length, 0, 'nothing is stroked: a stroke has ends'); assert.ok(r.log.fills.length >= 4 && r.log.fills.length % 2 === 0, `${r.log.fills.length} fills: two ribbons (shoal, foam) a run`); assert.equal(r.log.depth, 0);
  const polys = polygons(r); assert.ok(polys.length >= 4 && polys.every((p) => p.length >= 12), 'a polygon a run, each of many points'); for (const p of polys) { const n = p.length / 2; assert.ok(Math.hypot(p[0][0] - p[2 * n - 1][0], p[0][1] - p[2 * n - 1][1]) < 1e-6 || n > 3, 'it closes where it began'); }
  // the run's two ends are pinched: the far edge meets the coast edge at the first and last point
  for (const p of polys.slice(0, 2)) { const n = p.length / 2; assert.ok(Math.hypot(p[0][0] - p[2 * n - 1][0], p[0][1] - p[2 * n - 1][1]) < 0.01, 'the first coast point is the last far point: the width is 0 at the start'); assert.ok(Math.hypot(p[n - 1][0] - p[n][0], p[n - 1][1] - p[n][1]) < 0.01, 'and at the end'); }
  const a = sw(2.5).log.fills.map((s) => s.alpha.toFixed(3)).join(), b = sw(2.5 + 6.5).log.fills.map((s) => s.alpha.toFixed(3)).join(); assert.equal(a, b, 'the breath has a period of 6.5 seconds');
});
