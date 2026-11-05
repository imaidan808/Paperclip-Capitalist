// Hot spots, by construction (no browser): what a click can land on is the hit polygons a prop's drawer returns (js/world/statics.js turns them into hits at the prop's elevation; World.pick tests them back to front). The survey of the late districts
// (2026-11-04, finding S04) found that the red outline of "Property row" in Real Estate Row covers the middle house of its three-house terrace only: 54% of the row's width, so a click on the red house on the left or the purple one on the right found nothing.
// The fixture of tests/world-hits.test.mjs (made in Chrome) holds the whole picture's hits to a golden file; this holds each hot prop to its own footprint, which no picture says: adapted from the survey's hitcheck.mjs (it compared the hit polygons' extent with the
// footprint's in Chrome, for districts 12 to 16), for all sixteen districts and in Node.
//   HS1  every hot prop of every district has exactly one hit; the vertical line through its footprint centre is picked, and so is the line through each of nine points spread over the footprint (a third, a half and two thirds across it each way);
//        World.pick answers a hit there; and nothing a hot prop leaves is outside its district's box (a hit outside it would be culled while it is on the screen)
//   HS2  Property row: the hit covers the whole terrace, not the middle house: at least 98% of the footprint's width in the picture, and a click on each of the three houses answers "rent"
import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, DIST } from '../js/world/layout.js';
import { P } from '../js/world/iso.js';
import { newWorld } from './helpers/worldstub.mjs';

const inPoly = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
/** Is there a height, from the ground to the top of the prop, at which the point (gx, gy) is inside one of the polygons? (A hit is the prop's body, not its footprint: a board's hit is its panel, high on its posts.) */
const picked = (polys, p, gx, gy) => { for (let z = 0; z <= p.h; z += 2) { const [x, y] = P(gx, gy, p.z + z); if (polys.some((q) => inPoly(q, x, y))) return true; } return false; };
const spread = [1 / 6, 0.5, 5 / 6];

/** A world with every district open (the sweep's state) and one prop's hit made as the draw makes it: statics.js drawStatic pushes it onto world.hits. */
async function hitsOf(w, D) { w.hits.length = 0; for (const p of D.props.filter((q) => q.hot)) w.drawStatic(w.ctx, p); return w.hits.filter((h) => h.kind === 'static'); }

test('HS1: every hot prop of the sixteen districts is picked on the line through its footprint centre and through nine points of it, and leaves nothing outside its district\'s box', async () => {
  const { w } = await newWorld(); w.unlocked = new Set(LAYOUT.ids);
  let n = 0; const bad = [];
  for (const id of LAYOUT.ids) {
    const D = DIST[id], hits = await hitsOf(w, D), hot = D.props.filter((q) => q.hot);
    assert.equal(hits.length, hot.length, `district ${id}: a hit for each of its ${hot.length} hot props`);
    for (const p of hot) {
      const mine = hits.filter((h) => h.id === p.hot); n++;
      if (mine.length !== 1) { bad.push(`${p.hot}: ${mine.length} hits`); continue; }
      const polys = mine[0].polys, name = `${p.hot} (${p.t}, district ${id})`;
      if (!picked(polys, p, p.gx + p.w / 2, p.gy + p.d / 2)) bad.push(`${name}: its footprint centre is not picked`);
      const missed = spread.flatMap((fu) => spread.map((fv) => [fu, fv])).filter(([fu, fv]) => !picked(polys, p, p.gx + p.w * fu, p.gy + p.d * fv));
      if (missed.length) bad.push(`${name}: ${missed.length} of 9 points of its footprint are not picked (${missed.map(([fu, fv]) => `${(fu * 100).toFixed(0)}%,${(fv * 100).toFixed(0)}%`).join(' ')})`);
      const pts = polys.flat();
      if (pts.some(([x, y]) => x < D.bb[0] || x > D.bb[2] || y < D.bb[1] || y > D.bb[3])) bad.push(`${name}: a hit outside the district's box`);
      const c = P(p.gx + p.w / 2, p.gy + p.d / 2, p.z + p.h / 2), [sx0, sy0] = w.w2s(c[0], c[1]), h = w.pick(sx0, sy0);
      if (!(h && h.kind === 'static')) bad.push(`${name}: World.pick finds no hot spot at the middle of its body (${h ? h.kind : 'nothing'})`);
    }
  }
  assert.equal(n, 53, 'sixteen headquarters, depots and boards, and the district features: 53 hot props');
  assert.deepEqual(bad, []);
});

test('HS2: Property row: the hit covers the whole three-house terrace, and a click on each house answers "rent"', async () => {
  const { w } = await newWorld(); w.unlocked = new Set(LAYOUT.ids);
  const D = DIST[15], p = D.props.find((q) => q.hot === 'rent'); assert.equal(p.t, 'rentrow'); assert.ok(p.w > 7 && p.d > 3, 'the terrace is 8 tiles wide');
  const hits = await hitsOf(w, D), rent = hits.find((h) => h.id === 'rent');
  const xs = rent.polys.flat().map((q) => q[0]), hit = [Math.min(...xs), Math.max(...xs)], foot = [P(p.gx, p.gy + p.d)[0], P(p.gx + p.w, p.gy)[0]];
  const cover = (Math.min(foot[1], hit[1]) - Math.max(foot[0], hit[0])) / (foot[1] - foot[0]);
  assert.ok(cover >= 0.98, `the hit spans ${(cover * 100).toFixed(0)}% of the footprint's width in the picture (${hit.map(Math.round)} of ${foot.map(Math.round)}): it was 54%, the middle house`);
  w.goTo(...P(p.gx + p.w / 2, p.gy + p.d / 2, p.z + 20), 1.0, false); w.resize();
  for (const [name, u] of [['left', 1 / 6], ['middle', 0.5], ['right', 5 / 6]]) {
    const c = P(p.gx + p.w * u, p.gy + p.d / 2, p.z + 14), [x, y] = w.w2s(c[0], c[1]), h = w.pick(x, y);
    assert.ok(h && h.id === 'rent', `a click on the ${name} house answers Property row (${h ? h.id : 'nothing'})`);
  }
  assert.equal(w.pick(...w.w2s(...P(p.gx - 2, p.gy + p.d + 2, p.z))), null, 'and beside the terrace nothing is picked');
});
