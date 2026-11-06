// Placement guards: nothing stands on water (the island's props are placed before its land exists, and the bays and the lake are carved out of the land afterwards).
// The survey of 2026-11-04 (docs/RENDER_PLAN.md section 9) found, in the late districts, three trees, a planter, three topiaries and two houses standing in the sea at the north bay of 14 and 15 (the teal house of Real Estate Row with its plinth in the water);
// the guard found the same in 2, 3 and 5. A pad's scenery is a hashed scatter at 0.045 props a tile (layout.js, kits.js FILL): it knows the block's rectangles and the roads, not the coast.
//   PL1  the whole island: in none of the sixteen districts does a prop stand on water, except the water class (docks, piers, jetties, boats, ships, barges, buoys, and the ferry's gate): sampled every quarter tile over each footprint (the test's own sampling, not the guard's tile loop)
//   PL2  the water class is defined (WATER_PROPS, WATER_REACH, isWaterProp) and its one member today, the ferry's gate, stands on the strait and is kept; a water prop belongs to a shore: within WATER_REACH tiles of land
//   PL3  what the guard does is REMOVE, and only the drowned: the island without the guard (buildLayout(zones, { water: false })) has fourteen props on water (sixteen before WP10), all pad scenery; the guarded island is that one without exactly those sixteen, every other prop where it was; the list is pinned
//   PL4  the guard is deterministic, and standsOnWater / keepDry do what they say on a made-up coast: a prop on the line between two tiles is not on the tile beyond it, a sliver counts, a hot prop is never removed, a water prop out in the open sea is
// Why REMOVE and not move (the brief asks to say): the sixteen are all pad scenery (a tree, a crate, a planter), the filler the plans retire district by district (rule P3, no scatter); a moved one would be a new random placement that needs a free spot clear of the roads, the block and the other props
// and the coast, and the search can fail or crowd the shore; removing one leaves every other prop exactly where it was, so the golden moves by those rows and nothing else (tests/world-static.test.mjs), and no new random number is spent.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Lay from '../js/world/layout.js';
import { buildLayout, LAYOUT, DIST } from '../js/world/layout.js';

/** The kinds of the water class, and the ferry's gate, as the brief names them: the test's own list, so a guard that quietly grew its exemptions is seen (PL2 holds the module's list to it). */
const WATER_KINDS = ['dock', 'pier', 'jetty', 'boat', 'ship', 'barge', 'buoy'];
const inWaterClass = (p) => WATER_KINDS.includes(p.t) || (p.t === 'gate' && p.gk === 'ferry');
const wetAt = (x, y) => !LAYOUT.isLand(Math.floor(x), Math.floor(y));
/** The sample points of a footprint: every quarter tile across it, inset by a hair so a footprint that ends on a tile line is not counted on the tile beyond. */
function samples(p) { const E = 1e-6, out = []; for (let i = 0; i <= Math.ceil(p.w / 0.25); i++) for (let j = 0; j <= Math.ceil(p.d / 0.25); j++) out.push([p.gx + Math.min(p.w - E, Math.max(E, i * 0.25)), p.gy + Math.min(p.d - E, Math.max(E, j * 0.25))]); return out; }
const wet = (p) => samples(p).some(([x, y]) => wetAt(x, y));
const row = (p) => `${p.zone} ${p.t} ${p.gx.toFixed(1)},${p.gy.toFixed(1)}`;

test('PL1: no prop but the water class stands on water, in any of the sixteen districts', () => {
  const drowned = LAYOUT.props.filter((p) => !inWaterClass(p) && wet(p));
  assert.deepEqual(drowned.map(row), [], `${drowned.length} props stand in the sea: ${drowned.map((p) => `${row(p)} (${p.pad ? 'pad scenery' : 'placed by its kit'})`).join('; ')}`);
  assert.equal(LAYOUT.ids.length, 16);
  for (const id of LAYOUT.ids) assert.ok(DIST[id].props.length > 20, `district ${id} still has its props (${DIST[id].props.length})`);
});

test('PL2: the water class is defined, its one member today is the ferry\'s gate on the strait, and a water prop belongs to a shore', () => {
  assert.ok(Lay.WATER_PROPS instanceof Set, 'WATER_PROPS is a set of kinds'); for (const k of WATER_KINDS) assert.ok(Lay.WATER_PROPS.has(k), `${k} is a water prop`);
  assert.equal(Lay.WATER_PROPS.size, WATER_KINDS.length, 'and the class holds nothing else: a tree, a house and a planter are not on it');
  assert.ok(Number.isFinite(Lay.WATER_REACH) && Lay.WATER_REACH > 0 && Lay.WATER_REACH <= 8, 'a water prop stands at most WATER_REACH tiles from land');
  assert.ok(Lay.isWaterProp({ t: 'gate', gk: 'ferry' }) && !Lay.isWaterProp({ t: 'gate', gk: 'barrier' }) && !Lay.isWaterProp({ t: 'tree' }) && Lay.isWaterProp({ t: 'boat' }), 'the ferry\'s gate is a boat with a plaque; a barrier\'s gate is not');
  const ferry = DIST[16].props.find((p) => p.t === 'gate' && p.gk === 'ferry');
  assert.ok(ferry && Lay.standsOnWater(ferry, LAYOUT.isLand), 'the ferry\'s gate stands on the strait, and the guard kept it');
  const near = (p) => { for (let r = 0; r <= Lay.WATER_REACH; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && LAYOUT.isLand(Math.floor(p.gx + p.w / 2) + dx, Math.floor(p.gy + p.d / 2) + dy)) return true; return false; };
  for (const p of LAYOUT.props.filter((q) => inWaterClass(q) && wet(q))) assert.ok(near(p), `${row(p)} is on water, within ${Lay.WATER_REACH} tiles of land`);
});

test('PL3: the guard REMOVES, and only the drowned: the island without it has thirteen props on water (sixteen until the world pass WP10 moved the roads at three forks and three footpaths, which reshuffled the scatter of the pads of 3 and 14; fourteen until WP12 kept the pad\'s scatter off the ends of the streets: the planter at 93.1, 1.5 stood where 14.N\'s path head is), the island with it is that one without them, and the list is pinned', () => {
  const raw = buildLayout(undefined, { water: false }), rawWet = raw.props.filter((p) => !inWaterClass(p) && wet(p));
  assert.equal(rawWet.length, 13, `the island as it was has thirteen props in the sea (${rawWet.length})`);
  assert.ok(rawWet.every((p) => p.pad && !p.hot), 'all of them pad scenery, none placed by a kit and none a hot spot');
  assert.deepEqual(rawWet.map(row).sort(), [ // district, kind and the footprint's corner (the survey's S01 and S02 name the centres: the planter (93.4, 1.8), the trees (103.4, 4.1), (106.2, 4.0), (111.3, 2.3), the teal house (109.6, 4.5))
    '14 topiary 100.2,2.3', '14 topiary 101.7,1.6',
    '15 bldg 105.3,5.8', '15 bldg 108.4,3.2', '15 tree 103.1,3.8', '15 tree 106.0,3.7', '15 tree 111.1,2.0',
    '2 crates 37.9,131.0', '2 crates 39.5,130.7',
    '3 bench 102.5,109.0', '3 tree 100.4,100.7', '3 tree 101.6,103.7', '5 planter 110.9,105.4',
  ], 'the drowned, pinned');
  const key = (p) => [p.t, p.gx, p.gy, p.w, p.d, p.h, p.z, p.zone, p.hot || '', p.key].join(',');
  const kept = new Set(LAYOUT.props.map(key)), gone = raw.props.filter((p) => !kept.has(key(p)));
  assert.deepEqual(gone.map(key).sort(), rawWet.map(key).sort(), 'exactly the drowned are gone');
  assert.equal(LAYOUT.props.length, raw.props.length - 13);
  assert.ok(LAYOUT.props.every((p) => raw.props.some((q) => key(q) === key(p))), 'and nothing was added or moved');
  assert.deepEqual(LAYOUT.drowned.map((r) => `${r.zone} ${r.t} ${r.gx.toFixed(1)},${r.gy.toFixed(1)}`).sort(), rawWet.map(row).sort(), 'the layout lists what the guard removed');
  assert.ok(!raw.drowned || raw.drowned.length === 0, 'with the guard off nothing is removed');
});

test('PL4: the guard is deterministic, and standsOnWater and keepDry do what they say on a made-up coast', () => {
  const again = buildLayout();
  assert.deepEqual(again.drowned, LAYOUT.drowned, 'the same island, the same drowned'); assert.equal(again.props.length, LAYOUT.props.length);
  const land = (x, y) => x < 10 && x >= 0 && y >= 0 && y < 10, mk = (o) => ({ t: 'tree', gx: 5, gy: 5, w: 0.5, d: 0.5, h: 30, pad: true, ...o });
  assert.equal(Lay.standsOnWater(mk({ gx: 9.4, w: 0.5 }), land), false, 'on the last tile of land: dry');
  assert.equal(Lay.standsOnWater(mk({ gx: 9.8, w: 0.5 }), land), true, 'a sliver over the line is on the sea');
  assert.equal(Lay.standsOnWater(mk({ gx: 9, w: 1 }), land), false, 'a footprint that ends on the tile line is not on the tile beyond it');
  assert.equal(Lay.standsOnWater(mk({ gx: 8, w: 2.4, d: 2.6 }), land), true, 'a house across the coast: a tile of it is wet');
  const { keep, drowned } = Lay.keepDry([mk({ gx: 3 }), mk({ gx: 9.8 }), mk({ t: 'planter', gx: 14, gy: 2 }), mk({ t: 'bldg', hot: 'hq:1', gx: 12, gy: 2, w: 3, d: 3 }), mk({ t: 'boat', gx: 12, gy: 4, pad: false }), mk({ t: 'boat', gx: 40, gy: 4, pad: false }), mk({ t: 'dock', gx: 9.2, gy: 3, w: 1.6, d: 1, pad: false })], land);
  assert.deepEqual(keep.map((p) => `${p.t}@${p.gx}`), ['tree@3', 'bldg@12', 'boat@12', 'dock@9.2'], 'dry things stay, a hot spot is never removed (a kit that put one in the sea is a test failure, not a missing building), a boat by the shore stays');
  assert.deepEqual(drowned.map((r) => `${r.t}@${r.gx}`), ['tree@9.8', 'planter@14', 'boat@40'], 'a tree and a planter in the sea go, and so does a boat out in open water (it belongs to a shore)');
});
