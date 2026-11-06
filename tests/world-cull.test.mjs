// Culling by a prop's OWN box: a gate, a barrier, a portal or a path-end deck belongs to the district it guards (it is locked and opened with that district, and it is in that district's list of props), but it does not always stand in that district's
// box: the gate of a locked road stands on the road (10 tiles from the guarded district today, and WP11 puts it at the open end, up to 74 tiles away on the longest), the bridge's and the ferry's gate stand at the water, a lookout stands at the end of a
// footpath that leaves its district. World.draw skipped every prop of a district whose box was off the screen, and a lookout (a small prop) in the governor's lite tier below zoom 0.6: a padlock on the road could not be drawn from the open neighbour's end,
// and the footpath ended in the air in the author's screenshots 4 and 6 (docs/RENDER_PLAN.md section 9; the survey's cause C3).
//   CU1  at a camera that has the prop on the screen and its district's box off it (the view from the open neighbour), the prop is in the draw list: the island's gates and lookouts, at least six of which have such a camera; and at a camera over the prop
//   CU2  the district itself is still culled by its own box: with only the gate in view, its other props, its entities and its clouds are not drawn
//   CU3  in the governor's lite tier (below zoom 0.6, where small props are dropped) the path-end decks are still drawn, and the lamps and the other small props are still dropped: the exemption is the decks'
//   CU4  a prop is culled by its own box in both directions: a camera away from the gate does not draw it
// The depth-sorted list is `world.items` after a frame (tests/helpers/worldstub.mjs: a world without a browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, DIST } from '../js/world/layout.js';
import { newWorld } from './helpers/worldstub.mjs';

/** The props that are culled by their own box: a gate or a lookout; a termination's props say `own` too (WP12: tests/world-roadterm.test.mjs RT12 draws those). */
const OWN = (p) => p.own || p.t === 'gate' || p.t === 'lookout';
const ownProps = LAYOUT.ids.flatMap((id) => DIST[id].props.filter((p) => OWN(p) && !p.term).map((p) => ({ id, p })));
const centre = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const sees = (view, b) => b[2] > view.x0 && b[0] < view.x1 && b[3] > view.y0 && b[1] < view.y1;
const drawn = (w, p) => w.items.some((it) => (it.k === 's' || it.k === 'g') && it.a === p); // ('g': a gate, which is drawn after the clouds)
/**
 * The camera of a visitor at the open neighbour: the prop's box is on the screen and its district's box is not. Starts over the prop and slides the camera away from the district, a little at a time, until the district's box leaves the screen
 * (a view is the screen and 80 px round it, a district's box is its footprint and 40 px round it); null when the prop stands so far inside the district's box that no view has one and not the other.
 */
function fromTheNeighbour(w, id, p, z = 1.0) {
  const [px, py] = centre(p.bb), [dx, dy] = centre(DIST[id].bb), len = Math.hypot(px - dx, py - dy) || 1, ux = (px - dx) / len, uy = (py - dy) / len;
  for (let t = 0; t <= 1200; t += 20) { w.goTo(px + ux * t, py + uy * t, z, false); w.draw(); if (sees(w.view, p.bb) && !sees(w.view, DIST[id].bb)) return t; }
  return null;
}

test('CU1: at the view from the open neighbour (the prop on the screen, its district\'s box off it) the prop is in the draw list, and so it is at a camera over it', async () => {
  const { w } = await newWorld({ size: [800, 520] });
  assert.ok(ownProps.length >= 23, `the island's gates and lookouts (${ownProps.length}: 17 gates and 6 lookouts)`);
  let from = 0; const missed = [];
  for (const { id, p } of ownProps) {
    const name = `${p.t}${p.gk ? ' (' + p.gk + ')' : ''} of district ${id} at ${p.gx.toFixed(1)},${p.gy.toFixed(1)}`;
    if (fromTheNeighbour(w, id, p) !== null) { from++; if (!drawn(w, p)) missed.push(name + ', seen from the neighbour'); }
    const [x, y] = centre(p.bb); w.goTo(x, y, 1.0, false); w.draw(); if (!drawn(w, p)) missed.push(name + ', seen from over it');
  }
  assert.ok(from >= 6, `at least six of them (the bridge's and the ferry's gate, the lookouts of 4, 5, 10 and 12) have a view in which their district is off the screen (${from}): the test is about them`);
  assert.deepEqual(missed, [], 'a gate or a deck that is on the screen is drawn');
});

test('CU2: the guarded district is still culled by its own box: with only its gate in view, nothing else of it is drawn', async () => {
  const { w } = await newWorld({ size: [800, 520] });
  let n = 0;
  for (const { id, p } of ownProps) {
    if (fromTheNeighbour(w, id, p) === null) continue; n++;
    assert.ok(!w.vz.has(id), `district ${id} is not in view (its box is off the screen): its entities and its cloud stay culled`);
    assert.deepEqual(w.items.filter((it) => (it.k === 's' || it.k === 'g') && it.a.zone === id && !OWN(it.a)).map((it) => it.a.t), [], `nothing else of district ${id} is drawn`);
  }
  assert.ok(n >= 6, 'six or more such views');
});

test('CU3: in the lite tier the path-end decks are still drawn below zoom 0.6, and the lamps and the other small props are dropped as before', async () => {
  const { w } = await newWorld({ size: [800, 520] });
  w.slow = 3; w.lite = true;
  const decks = ownProps.filter(({ p }) => p.t === 'lookout');
  assert.equal(decks.length, 6, 'six footpaths, six lookouts (the bench and the telescope on each deck; the deck itself is ground art: tests/world-roadterm.test.mjs RT11)');
  for (const { id, p } of decks) { const [x, y] = centre(p.bb); w.goTo(x, y, 0.57, false); w.draw(); assert.ok(w.env.lite && w.cam.z < 0.6, 'lite, below 0.6'); assert.ok(drawn(w, p), `the deck of district ${id} at ${p.gx.toFixed(1)},${p.gy.toFixed(1)} is drawn in lite at zoom ${w.cam.z.toFixed(2)}`); }
  const lamp = DIST[1].props.find((p) => p.t === 'lamp' && p.sm && !p.own); assert.ok(lamp, 'the first district has lamps of its own (small props; the lamps of a termination are `own`, always drawn: they stand where a street ends)');
  const [lx, ly] = centre(lamp.bb); w.goTo(lx, ly, 0.57, false); w.draw();
  assert.ok(!drawn(w, lamp), 'a lamp is a small prop: not drawn in lite below zoom 0.6'); assert.ok(w.items.some((it) => it.k === 's' && it.a.t !== 'lamp'), 'and the rest of the district is');
  w.lite = false; w.slow = 0; w.draw(); assert.ok(drawn(w, lamp), 'out of lite it is drawn');
});

test('CU4: a prop is culled by its own box in both directions: a camera away from a gate does not draw it', async () => {
  const { w } = await newWorld({ size: [800, 520] });
  const gate = DIST[16].props.find((p) => p.t === 'gate' && p.gk === 'ferry'), far = DIST[1];
  const [fx, fy] = centre(far.bb); w.goTo(fx, fy, 1.0, false); w.draw();
  assert.ok(!sees(w.view, gate.bb) && !drawn(w, gate), 'the ferry\'s gate is not drawn from the first district');
  const [gx, gy] = centre(gate.bb); w.goTo(gx, gy, 1.0, false); w.draw(); assert.ok(drawn(w, gate), 'and is drawn from where it stands');
});
