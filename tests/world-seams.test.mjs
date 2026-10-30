// The seams of the first repair round (docs/RENDER_PLAN.md section 13): four repair branches (the water pass, the atmosphere, the elements and the overall one) were laid over the same files, so what each keeps of
// the others is held here: the mixing hash the scattered marks use, the neon strips of the districts' decals, the lamps of the night under the clouds, and the palette the ground and the veil share.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx } from './helpers/recctx.mjs';
import { hz } from '../js/world/noise.js';
import { decalV2 } from '../js/world/decalart.js';
import { dressingOf } from '../js/world/groundart.js';
import { groundSet, veiled, DISTRICT_DAY } from '../js/world/palette.js';
import { luma, rgb } from '../js/world/iso.js';
import { DIST } from '../js/world/layout.js';
import { underCloud } from '../js/world/ambient.js';

test('hz: a well-mixed hash in [0, 1) that leaves no rows (the meadow\'s tufts and trees stand at hashed places, not on a lattice)', () => {
  let min = 1, max = 0, sum = 0; const n = 4000;
  for (let i = 0; i < n; i++) { const v = hz(i % 64, (i / 64) | 0, 7); assert.ok(v >= 0 && v < 1); min = Math.min(min, v); max = Math.max(max, v); sum += v; }
  assert.ok(min < 0.01 && max > 0.99 && Math.abs(sum / n - 0.5) < 0.03, 'uniform'); assert.equal(hz(3, 4, 5), hz(3, 4, 5)); assert.notEqual(hz(3, 4, 5), hz(4, 3, 5));
  let close = 0; for (let i = 0; i < 2000; i++) if (Math.abs(hz(i, 5, 1) - hz(i + 1, 5, 1)) < 0.02) close++; assert.ok(close < 2000 * 0.06, `${close} neighbours alike`);
});

test('the meadow\'s dressing is the mixing hash\'s: the same tile always holds the same thing, and the shares of bushes, rocks and trees hold over a large field', () => {
  assert.equal(dressingOf(10, 20, 0.5), dressingOf(10, 20, 0.5));
  const count = [0, 0, 0, 0]; for (let j = 0; j < 120; j++) for (let i = 0; i < 120; i++) count[dressingOf(i, j, 0)]++;
  const tiles = 120 * 120; assert.ok(count[1] / tiles > 0.03 && count[1] / tiles < 0.09, `bushes ${count[1]}`); assert.ok(count[3] / tiles > 0.004 && count[3] / tiles < 0.03, `trees ${count[3]}`);
  let rows = 0; for (let j = 0; j < 120; j++) { let k = 0; for (let i = 0; i < 120; i++) if (dressingOf(i, j, 0) === 1) k++; if (k === 0 || k > 18) rows++; } assert.ok(rows < 12, `${rows} rows that are empty or full: the marks are scattered, not laid in lines`);
});

test('a long thin opaque rect (a neon strip, a painted line) is a glow under a core of 0.26 tile, never a hairline; a short or a translucent one keeps its own width', () => {
  const S = groundSet('tech'), run = (d) => { const r = recCtx(); decalV2(r.ctx, { k: 'rect', ...d }, 10, 0, S, [1, 1, 1, 1]); return r; };
  const thin = run({ x: 2, y: 3, w: 12, d: 0.08, fill: '#22d9ee' }); assert.equal(thin.log.fills.length, 2, 'a glow and a core'); assert.ok(thin.log.fills[0].alpha < 0.3 && thin.log.fills[1].alpha === 1, 'a faint glow under a full core');
  const xs = (r) => r.log.calls.filter((c) => c[0] === 'moveTo' || c[0] === 'lineTo' || c[0] === 'quadraticCurveTo' || c[0] === 'arc').length; assert.ok(xs(thin) > 8, 'rounded');
  const short = run({ x: 2, y: 3, w: 3, d: 0.08, fill: '#22d9ee' }); assert.equal(short.log.fills.length, 1, 'a short mark is one fill');
  const fat = run({ x: 2, y: 3, w: 12, d: 0.6, fill: '#22d9ee' }); assert.equal(fat.log.fills.length, 1, 'a strip wider than the floor is drawn as it is');
  const ghost = run({ x: 2, y: 3, w: 12, d: 0.08, fill: 'rgba(34,217,238,0.3)' }); assert.equal(ghost.log.fills.length, 1, 'a translucent one keeps its alpha and its width');
});

test('the scrap yard is one warm sand and the pad is lighter than it was; the cool districts are saturated enough that the map is one palette (none of the sixteen is a pale grey)', () => {
  const g = groundSet('scrap'), sat = (h) => { const [r, gg, b] = rgb(h); return (Math.max(r, gg, b) - Math.min(r, gg, b)) / Math.max(1, Math.max(r, gg, b)); };
  assert.ok(rgb(g.ground)[0] > rgb(g.ground)[2] + 40, 'warm: red well above blue'); assert.ok(luma(g.pad) > luma(g.ground) - 0.16, 'the pad stays close to the ground');
  for (const [theme, row] of Object.entries(DISTRICT_DAY)) assert.ok(sat(row.ground) > 0.07, `${theme} ground is a pale grey (${row.ground})`);
});

test('a locked district keeps three fifths of its saturation under the veil: the cloud is the cue, the ground is not a grey wash', () => {
  const g = groundSet('metro').ground, v = veiled(g, 1), sat = (h) => { const [r, gg, b] = rgb(h); return (Math.max(r, gg, b) - Math.min(r, gg, b)) / Math.max(1, Math.max(r, gg, b)); };
  assert.ok(sat(v) > sat(g) * 0.45, `${sat(v).toFixed(3)} of ${sat(g).toFixed(3)}`); assert.ok(luma(v) >= luma(g) - 0.06, 'never darker than the source by more than a hair');
});

test('a gull is not drawn over the cloud of a locked district, and is over an open one', () => {
  const D = DIST[3], mid = [(D.bb[0] + D.bb[2]) / 2, (D.bb[1] + D.bb[3]) / 2];
  assert.equal(underCloud({ unlocked: new Set([1]) }, mid[0], mid[1]), true); assert.equal(underCloud({ unlocked: new Set([1, 3]) }, mid[0], mid[1]), false); assert.equal(underCloud({}, mid[0], mid[1]), false, 'no state: nothing is locked');
});
