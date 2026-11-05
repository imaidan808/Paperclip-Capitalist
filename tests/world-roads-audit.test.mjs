// The road detector as a ratchet: the island's road defects, as scripts/lib/road-audit.mjs reads them from js/world/layout.js, may only go down.
// The survey of 2026-11-04 (docs/RENDER_PLAN.md, "The author's cameras") found that every district is the same 22 by 18 crossroads: 29 of the island's 64 street ends stop at nothing, a fork is two ribbons laid over each other, a footpath
// lies on top of asphalt, four locked roads carry no barrier. None of it was held by a test. Each pull request that fixes one LOWERS its constant below, in the same commit, and never raises it; this test fails on any count above its constant
// and fails on a count BELOW it too, until the constant is lowered in the same commit (so the gain cannot come back unseen).
//   RA1  the detector still looks at the whole island: floors on what it examined (ports, edges, pairs of edges, samples), so a count cannot fall because the detector looked at less
//   RA2  the ratchet: every defect count equals its baseline: a worse count fails, and so does a better one until the constant is lowered (29 dead ends, no seam run, no crossing without a junction, no footpath over asphalt, 4 locked roads without a barrier, no kink, no split bridge, 1 road through another district)
//   RA3  the defect classes are all listed, with their ids, names, counts and causes, and the ratchet's counts are the classes' own
//   RA4  the detector can see: on a world made worse in four ways (a road taken away, a road laid twice, a footpath laid on a road, a gate taken away) it finds each of the four, so an all-clear is not a blind detector's
//   RA8  a junction is an exemption with edges: two roads that meet at one may overlap within 6 tiles of it and nowhere else (a second road laid along a branch is found), a crossing a long way from it is a crossing, and the stem of a fork is not a road into the district
//   RA5  it is quick: under 2 s of CPU (it was 0.05 s when this was written; the whole catalog the CLI prints is 0.6 s)
//   RA6  the whole catalog, with the plan's proposals, the district matrix and the traffic, is complete (what `node scripts/road-audit.mjs` prints)
//   RA7  nothing of this is shipped to the site: scripts/ is never staged (scripts/stage.mjs), and no module of the app imports it
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorld, auditRoads, ratchetCounts } from '../scripts/lib/road-audit.mjs';
import { walk } from '../scripts/preload.mjs';

/**
 * What the detector found on main at 0ab9bf8 (the survey's own run, which this module reproduces exactly): deadEnds 29, seamRuns 7, crossings 1, pathTilesOverAsphalt 13.8, lockedWithoutBarrier 4, kinks 2, splitBridges 1, footprintThroughRoads 1.
 * LOWER a constant in the pull request that fixes the defect; the plan's WP numbers say which one does:
 *   deadEnds 29 (WP12 and each district's plan), lockedWithoutBarrier 4 (WP11), footprintThroughRoads 1 (WP22a, when the island is laid again: 6.N to 7.E runs through the south pad of 8).
 * WP10 (one road surface) took seamRuns 7 to 0 (a fork is a stem and two branches that meet at a junction: three forks, and the detector lets the edges of one overlap within 6 tiles of it and nowhere else), crossings 1 to 0 (the road of 4 to 3 no
 * longer crosses the road of 4 to 5: it leaves the fork on its own side), pathTilesOverAsphalt 13.8 to 0 (the three footpaths that left a road start from path heads two tiles to its side), kinks 2 to 0 (10.W to 11.E arrives along the axis of
 * 11's avenue, and the footpath of 14 starts outside its block) and splitBridges 1 to 0 (8.W to 9.E is one bridge).
 */
const BASELINE = { deadEnds: 29, seamRuns: 0, crossings: 0, pathTilesOverAsphalt: 0, lockedWithoutBarrier: 4, kinks: 0, splitBridges: 0, footprintThroughRoads: 1 };
/**
 * What the detector must still examine. A plan that changes the island changes these on purpose: raise or lower them in that pull request, saying why. WP10: three forks became three edges each (25 edges to 28: 21 roads, 6 footpaths, the ferry),
 * so 351 pairs of edges and 30,000 samples, three junctions and three path heads.
 */
const SCOPE_FLOOR = { districts: 16, ports: 64, edges: 28, roadEdges: 21, pathEdges: 6, ferryEdges: 1, edgePairs: 351, samples: 30000, junctions: 3, heads: 3 };
const CLASSES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12'];
const CPU_BUDGET_MS = 2000;

const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
/** The keys of `counts` that are above their baseline. */
const over = (counts, baseline = BASELINE) => Object.keys(baseline).filter((k) => !(counts[k] <= baseline[k]));

const world = await loadWorld();
const t0 = cpu(), catalog = auditRoads(world, { full: false }), fastMs = cpu() - t0;

test('RA1: the detector still looks at the whole island: ports, edges, pairs of edges and samples are at their floors', () => {
  for (const [k, floor] of Object.entries(SCOPE_FLOOR)) assert.ok(catalog.scope[k] >= floor, `it examined ${catalog.scope[k]} ${k} and must examine at least ${floor}: a count that falls because the detector looked at less is not an improvement`);
  assert.equal(catalog.scope.ports, catalog.scope.districts * 4, 'every district has its four structural ports, and the detector counts each');
  assert.equal(catalog.scope.edges, catalog.scope.roadEdges + catalog.scope.pathEdges + catalog.scope.ferryEdges, 'every edge is a road, a footpath or the ferry');
  assert.ok(catalog.counts.total.portsWithRoad >= 35, `35 of the 64 ports have a road or the ferry (${catalog.counts.total.portsWithRoad}): a graph that read as empty would call all 64 dead ends, and a count of dead ends below the baseline means roads, not blindness`);
  assert.deepEqual(Object.keys(ratchetCounts(catalog)).sort(), Object.keys(BASELINE).sort(), 'the ratchet holds exactly the counts the baseline names');
});

test('RA2: the ratchet: every defect count equals its baseline (a worse count fails; a better one fails until the constant is lowered in the same commit)', () => {
  const counts = ratchetCounts(catalog);
  assert.deepEqual(over(counts), [], `a road defect got worse: ${over(counts).map((k) => `${k} is ${counts[k]} (baseline ${BASELINE[k]})`).join(', ')}`);
  const better = Object.keys(BASELINE).filter((k) => counts[k] < BASELINE[k]);
  assert.deepEqual(better, [], `a road defect was fixed: lower the constant in this file, in the same commit, so it cannot come back: ${better.map((k) => `BASELINE.${k} = ${counts[k]} (was ${BASELINE[k]})`).join(', ')}`);
  assert.ok(over({ ...counts, deadEnds: BASELINE.deadEnds + 1 }).includes('deadEnds') && over({ ...counts, pathTilesOverAsphalt: BASELINE.pathTilesOverAsphalt + 0.1 }).includes('pathTilesOverAsphalt'), 'the comparison itself fires on a count one over (and on a tenth of a tile over)');
});

test('RA3: the defect classes are listed with their ids, names, counts and causes, and the ratchet counts are the classes\' own', () => {
  assert.deepEqual(catalog.defectClasses.map((c) => c.id), CLASSES, 'R1 to R12, in order: a class does not disappear from the detector');
  for (const c of catalog.defectClasses) { assert.ok(c.name.length > 10, c.id + ' has a name'); assert.ok(Number.isFinite(c.count), c.id + ' has a count'); assert.ok(/js\/world\//.test(c.cause) || /ROADS|footpaths/.test(c.cause), c.id + ' says where it comes from'); }
  const by = Object.fromEntries(catalog.defectClasses.map((c) => [c.id, c.count])), r = ratchetCounts(catalog);
  assert.equal(by.R1, r.deadEnds); assert.equal(by.R2, r.seamRuns); assert.equal(by.R5, r.kinks); assert.equal(by.R6, r.lockedWithoutBarrier); assert.equal(by.R9, r.splitBridges); assert.equal(by.R10, r.crossings); assert.equal(by.R11, r.footprintThroughRoads);
  assert.ok(by.R3 <= 3 && by.R3 >= 0, 'R3 counts footpaths that run over asphalt (3 of the 6), the ratchet counts the tiles');
  assert.equal(catalog.counts.total.roundabouts + catalog.counts.total.culDeSacs + catalog.counts.total.parkingLots, 0, 'the island has no roundabout, cul-de-sac or parking lot yet (the first one built raises these: WP12 and WP14)');
});

test('RA4: the detector can see: a road taken away, a road laid twice, a footpath laid on a road and a gate taken away are each found', () => {
  const { Lay } = world, base = ratchetCounts(catalog), run = (changes) => ratchetCounts(auditRoads({ ...world, Lay: { ...Lay, ...changes } }, { full: false }));
  // a road taken away: its two ports are dead ends
  const victim = Lay.EDGES.find((e) => e.a === '1.E' && !e.path && !e.ferry);
  assert.ok(victim, 'the road from 1.E is there');
  assert.equal(run({ EDGES: Lay.EDGES.filter((e) => e !== victim) }).deadEnds, base.deadEnds + 2, 'the road 1.E to 2.W taken away leaves both its ports a dead end');
  // a road laid twice, half a tile aside: a seam
  const roadE = Lay.EDGES.find((e) => e.a === '11.S' && !e.path), twin = { ...roadE, a: 'x.W', b: 'x.E', pts: roadE.pts.map(([x, y]) => [x + 0.5, y]) };
  assert.ok(run({ EDGES: [...Lay.EDGES, twin] }).seamRuns > base.seamRuns, 'a road laid half a tile beside another is a seam run');
  // a footpath laid along a road: tiles over asphalt
  const path = Lay.EDGES.find((e) => e.path && e.a === '12.E'), onRoad = { ...path, pts: roadE.pts, lens: roadE.lens, len: roadE.len };
  assert.ok(run({ EDGES: [...Lay.EDGES, onRoad] }).pathTilesOverAsphalt > base.pathTilesOverAsphalt + roadE.len * 0.5, 'a footpath along a road is tiles over asphalt');
  // a gate taken away: a locked road with nothing on it
  const D2 = Lay.DIST[2];
  assert.ok(D2.gateAt && D2.gateKind !== 'fog', 'district 2 is locked behind a gate that stands on a road');
  assert.equal(run({ DIST: { ...Lay.DIST, 2: { ...D2, gateAt: undefined } } }).lockedWithoutBarrier, base.lockedWithoutBarrier + 1, 'district 2\'s gate taken away leaves its road with no barrier');
  assert.equal(run({ DIST: { ...Lay.DIST, 2: { ...D2, props: D2.props.filter((q) => q.t !== 'gate') } } }).lockedWithoutBarrier, base.lockedWithoutBarrier + 1, 'the gate PROP taken away (its recorded place kept) leaves the road with no barrier too: the detector does not trust the data alone');
});

test('RA8: a junction is an exemption with edges: roads that meet at one may overlap within 6 tiles of it and nowhere else, a crossing beyond it is a crossing, and the stem of a fork is no road into its district', () => {
  const { Lay, Isl } = world, base = ratchetCounts(catalog), run = (changes) => ratchetCounts(auditRoads({ ...world, Lay: { ...Lay, ...changes } }, { full: false }));
  assert.equal(Object.keys(Isl.JUNCTIONS).length, 3, 'three forks');
  const branch = Lay.EDGES.find((e) => e.a === 'j4' && e.b === '3.N'), other = Lay.EDGES.find((e) => e.a === 'j4' && e.b === '5.W'), stem = Lay.EDGES.find((e) => e.stem && e.b === 'j4');
  assert.ok(branch && other && stem, 'the fork of 4 is a stem and two branches');
  // a branch laid again 0.3 tile beside itself, from the same junction: the two run together for 19 tiles, and only the first 6 are the fork's
  const twin = { ...branch, b: 'x.N', pts: branch.pts.map(([x, y]) => [x + 0.2, y - 0.2]) };
  assert.ok(run({ EDGES: [...Lay.EDGES, twin] }).seamRuns > base.seamRuns, 'a road that runs along a branch of a fork for 19 tiles is a seam beyond the first 6');
  // two edges that meet at a junction and then cross a long way from it
  const cross = { ...branch, a: 'j4', b: 'x.W', pts: [[72, 94], [78, 98], [82, 88]], lens: [0, 7.2, 18.8], len: 18.8, n: 99 };
  assert.ok(run({ EDGES: [...Lay.EDGES, cross] }).crossings > base.crossings, 'two roads that leave a junction and cross each other further out are a crossing');
  // the exemption is the junction's: the same overlap with no junction to share is a seam too
  const noJ = { ...other, a: 'y.E' }, noJ2 = { ...noJ, a: 'z.E', pts: noJ.pts.map(([x, y]) => [x, y + 0.5]) };
  assert.ok(run({ EDGES: [...Lay.EDGES, noJ, noJ2] }).seamRuns > base.seamRuns, 'the same overlap with no junction to share is a seam');
  // a stem is no road into its district: the fork of 8 holds 3 edges and the gate counts only the road that comes to it
  assert.equal(Lay.EDGES.filter((e) => !e.stem && !e.path && !e.ferry && e.gate === 8).length, 1, 'one road opens with 8 (the stem opens with it too, and is not counted)');
  assert.equal(catalog.counts.total.lockedRoadsWithNoBarrier, BASELINE.lockedWithoutBarrier, 'the stems of the three forks are not locked roads without a barrier');
});

test('RA5: it is quick: the audit the ratchet runs is under 2 s of CPU', () => {
  assert.ok(fastMs < CPU_BUDGET_MS, `the audit took ${fastMs.toFixed(0)} ms of CPU (budget ${CPU_BUDGET_MS} ms; the machine's load does not count, only the work done)`);
});

test('RA6: the whole catalog is complete: a proposal for each dead end, a row of the matrix for each district, the cars and ten minutes of them', () => {
  const full = auditRoads(world), T = full.counts.total;
  assert.deepEqual(ratchetCounts(full), ratchetCounts(catalog), 'the full and the fast audit agree on every count the ratchet holds');
  assert.equal(full.deadEnds.length, T.deadEnds); assert.ok(full.deadEnds.every((d) => d.proposal && d.proposal.kind && d.room && d.rects), 'each dead end has what could end it');
  assert.equal(Object.keys(full.connectivity.matrix.tiles).length, 16, 'a row of the matrix for each district');
  assert.equal(Object.keys(full.connectivity.cutOffWhileLocked).length, 15, 'the cut-off test, districts 2 to 16');
  assert.ok(Object.values(full.connectivity.cutOffWhileLocked).every((c) => c.routeWhileLocked === 'none (cut off)' && c.routeWhenOpen === 'ok'), 'a locked district cannot be reached, an open one can');
  assert.equal(full.traffic.cars, 18); assert.equal(full.traffic.measuredTenMinutes.frames, 2400); assert.equal(full.traffic.measuredTenMinutes.samplesInsideAnyDistrictBlock, 0, 'no car enters a block yet (WP13 and WP15 change this: lower the baseline of the cars then)');
  assert.ok(full.defectClasses.find((c) => c.id === 'R8').detail.includes('none in a block'), 'R8 says what the cars do');
  assert.equal(T.districtGraph.edges, 19); assert.deepEqual(T.districtGraph.leafDistricts, [1, 16]);
});

test('RA7: nothing of the detector is shipped to the site: scripts/ is never staged and no module of the app imports it', () => {
  const g = walk();
  assert.ok(g.modules.every((m) => /^js\//.test(m)), 'the site\'s modules are all under js/ (' + g.modules.filter((m) => !/^js\//.test(m)).join(', ') + ')');
  assert.ok(!g.modules.some((m) => m.startsWith('scripts/') || m.startsWith('tests/')), 'and none is a script or a test');
});
