// The road detector as a ratchet: the island's road defects, as scripts/lib/road-audit.mjs reads them from js/world/layout.js, may only go down.
// The survey of 2026-11-04 (docs/RENDER_PLAN.md, "The author's cameras") found that every district is the same 22 by 18 crossroads: 29 of the island's 64 street ends stop at nothing, a fork is two ribbons laid over each other, a footpath
// lies on top of asphalt, four locked roads carry no barrier. None of it was held by a test. Each pull request that fixes one LOWERS its constant below, in the same commit, and never raises it; this test fails on any count above its constant
// and fails on a count BELOW it too, until the constant is lowered in the same commit (so the gain cannot come back unseen).
//   RA1  the detector still looks at the whole island: floors on what it examined (ports, edges, pairs of edges, samples), so a count cannot fall because the detector looked at less
//   RA2  the ratchet: every defect count equals its baseline: a worse count fails, and so does a better one until the constant is lowered (no dead end: every street end has a termination registered, no seam run, no crossing without a junction, no footpath over asphalt, no locked road without a gate at its open end, no kink, no split bridge, 1 road through another district, no scatter at a street end, no termination without a turn spot or a bare disc, no footpath without a head and a deck)
//   RA3  the defect classes are all listed, with their ids, names, counts and causes, and the ratchet's counts are the classes' own
//   RA4  the detector can see: on a world made worse in four ways (a road taken away, a road laid twice, a footpath laid on a road, a gate taken away) it finds each of the four, so an all-clear is not a blind detector's
//   RA10 and it sees the terminations (WP12): a termination taken from the registry makes its port a dead end again, a turn spot taken away, a termination stripped of its props, a gate moved away from its road's open end, a deck or a head taken away, and a scatter prop put back in front of an end are each counted
//   RA8  a junction is an exemption with edges: two roads that meet at one may overlap within 3.5 tiles of it (the real overlap is at most 3.0) and nowhere else (a second road laid along a branch is found, even one that runs along it for 5 tiles), a crossing a long way from it is a crossing, and the stem of a fork is not a road into the district
//   RA9  the detector sees an apron: a port where a road leaves and no apron is drawn is counted (R7), and an apron with nothing to paint is no apron
//   RA5  it is quick: under 2 s of CPU (it was 0.05 s when this was written; the whole catalog the CLI prints is 0.6 s)
//   RA6  the whole catalog, with the plan's proposals, the district matrix and the traffic, is complete (what `node scripts/road-audit.mjs` prints)
//   RA7  nothing of this is shipped to the site: scripts/ is never staged (scripts/stage.mjs), and no module of the app imports it
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorld, auditRoads, ratchetCounts, JUNCTION_REACH } from '../scripts/lib/road-audit.mjs';
import { walk } from '../scripts/preload.mjs';

/**
 * What the detector found on main at 0ab9bf8 (the survey's own run, which this module reproduces exactly): deadEnds 29, seamRuns 7, crossings 1, pathTilesOverAsphalt 13.8, lockedWithoutBarrier 4, kinks 2, splitBridges 1, footprintThroughRoads 1.
 * LOWER a constant in the pull request that fixes the defect; the plan's WP numbers say which one does:
 *   footprintThroughRoads 1 (WP22a, when the island is laid again: 6.N to 7.E runs through the south pad of 8).
 * WP10 (one road surface) took seamRuns 7 to 0 (a fork is a stem and two branches that meet at a junction: three forks, and the detector lets the edges of one overlap within 3.5 tiles of it and nowhere else: the real overlap is at most 3.0), crossings 1 to 0 (the road of 4 to 3 no
 * longer crosses the road of 4 to 5: it leaves the fork on its own side), pathTilesOverAsphalt 13.8 to 0 (the three footpaths that left a road start from path heads two tiles to its side), kinks 2 to 0 (10.W to 11.E arrives along the axis of
 * 11's avenue, and the footpath of 14 starts outside its block) and splitBridges 1 to 0 (8.W to 9.E is one bridge), and it added portsWithoutApron: the ports where a road leaves and no apron is drawn (R7, which counted all 33 connected ports until
 * each got its apron; it is 0 and stays 0).
 * WP11 and WP12 (every road ends in a place) took deadEnds 29 to 0 (a dead end is now a port no road or ferry leaves and no termination is registered for: LAYOUT.terms, which layout.js derives from the ground and the theme and island.js TERMS chooses by hand), lockedWithoutBarrier 4 to 0
 * (a gate stands on every road that opens with a locked district, at the road's open end) and added what they now hold at 0: scatterAtEnds (a hashed pad prop in front of a street end: 13 of the 29 before; R12), endsWithoutTurnSpot, bareEnds (a termination with fewer than three props and no
 * loading dock), gatesAwayFromOpenEnd (a gate more than 3.5 tiles from the open end of its road, a bridge's leaf at its bank excepted: 9 of the 16 stood ten tiles from the district they guard), pathEndsWithoutDeck (the six lookouts were small props, dropped in the lite tier before WP02; R4) and
 * pathStartsWithoutHead (the six footpaths began in a cut or at a bare strip of sand).
 * The verifier's pass on WP11 and WP12 added what it found the nets blind to, held at 0: endsWithoutGround (a termination with no asphalt, slab or plaza), propsFarFromPort (a prop over 8 tiles from its port: the farthest today is 7.5), turnSpotsOffAxis (a turn spot not on its street's axis within 8
 * tiles of the port), boxesTooSmall (a cull box that does not hold the end's ground) and kindsWithoutTheirParts (a yard with no slab, bays or dock, a barrier with no boom): each had a mutant or an in-memory canary the detector did not count (RA10 holds them now).
 */
const BASELINE = { deadEnds: 0, seamRuns: 0, crossings: 0, pathTilesOverAsphalt: 0, lockedWithoutBarrier: 0, kinks: 0, splitBridges: 0, footprintThroughRoads: 1, portsWithoutApron: 0, scatterAtEnds: 0, endsWithoutTurnSpot: 0, bareEnds: 0, gatesAwayFromOpenEnd: 0, pathEndsWithoutDeck: 0, pathStartsWithoutHead: 0, endsWithoutGround: 0, propsFarFromPort: 0, turnSpotsOffAxis: 0, boxesTooSmall: 0, kindsWithoutTheirParts: 0 };
/**
 * What the detector must still examine. A plan that changes the island changes these on purpose: raise or lower them in that pull request, saying why. WP10: three forks became three edges each (25 edges to 28: 21 roads, 6 footpaths, the ferry),
 * so 351 pairs of edges and 30,000 samples, three junctions and three path heads. WP12: 29 terminations, 6 decks, 3 side heads (the other three path heads are terminations) and 17 gates.
 */
const SCOPE_FLOOR = { districts: 16, ports: 64, edges: 28, roadEdges: 21, pathEdges: 6, ferryEdges: 1, edgePairs: 351, samples: 30000, junctions: 3, heads: 3, terms: 29, decks: 6, pathHeads: 3 };
const CLASSES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13'];
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
  assert.deepEqual(catalog.defectClasses.map((c) => c.id), CLASSES, 'R1 to R13, in order: a class does not disappear from the detector');
  for (const c of catalog.defectClasses) { assert.ok(c.name.length > 10, c.id + ' has a name'); assert.ok(Number.isFinite(c.count), c.id + ' has a count'); assert.ok(/js\/world\//.test(c.cause) || /ROADS|footpaths/.test(c.cause), c.id + ' says where it comes from'); }
  const by = Object.fromEntries(catalog.defectClasses.map((c) => [c.id, c.count])), r = ratchetCounts(catalog);
  assert.equal(by.R1, r.deadEnds); assert.equal(by.R4, r.pathEndsWithoutDeck); assert.equal(by.R12, r.scatterAtEnds); assert.equal(by.R2, r.seamRuns); assert.equal(by.R5, r.kinks); assert.equal(by.R6, r.lockedWithoutBarrier); assert.equal(by.R9, r.splitBridges); assert.equal(by.R10, r.crossings); assert.equal(by.R11, r.footprintThroughRoads); assert.equal(by.R7, r.portsWithoutApron);
  const R7 = catalog.defectClasses.find((c) => c.id === 'R7'); assert.ok(/apron/.test(R7.name + R7.detail), 'R7 says what it counts: a road that leaves a block with no apron at the port (it counted all 33 connected ports before each had one)'); assert.ok(R7.of === catalog.counts.total.portsWithRoad - 2, 'out of the 33 ports a road leaves (35 with the ferry\'s two)');
  assert.ok(by.R3 <= 3 && by.R3 >= 0, 'R3 counts footpaths that run over asphalt, the ratchet counts the tiles');
  assert.deepEqual([catalog.counts.total.roundabouts, catalog.counts.total.culDeSacs, catalog.counts.total.parkingLots], [2, 8, 0], 'the island has two roundabouts (3.S and 6.E), eight turning bulbs and no parking lot yet (a bay or two beside a bulb is not a lot: WP14)');
  assert.equal(catalog.counts.total.terminations, 29); assert.equal(catalog.counts.total.gates, 17, 'a gate on every road that opens with a locked district: 16 of the 21 roads and the ferry (the roads of 2, 3, 4 twice, 5 twice, 6, 7 twice, 8, 9, 10, 12, 13, 14 twice and 16)');
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
  assert.ok(D2.gates && D2.gates.length === 1 && D2.gateKind !== 'fog', 'district 2 is locked behind a gate that stands on a road');
  assert.equal(run({ DIST: { ...Lay.DIST, 2: { ...D2, gates: [] } } }).lockedWithoutBarrier, base.lockedWithoutBarrier + 1, 'district 2\'s gate taken away leaves its road with no barrier');
  assert.equal(run({ DIST: { ...Lay.DIST, 2: { ...D2, props: D2.props.filter((q) => q.t !== 'gate') } } }).lockedWithoutBarrier, base.lockedWithoutBarrier + 1, 'the gate PROP taken away (its recorded place kept) leaves the road with no barrier too: the detector does not trust the data alone');
});

test('RA8: a junction is an exemption with edges: roads that meet at one may overlap within 3.5 tiles of it (the real overlap is 3.0 at the most) and nowhere else, a crossing beyond it is a crossing, and the stem of a fork is no road into its district', () => {
  const { Lay, Isl } = world, base = ratchetCounts(catalog), run = (changes) => ratchetCounts(auditRoads({ ...world, Lay: { ...Lay, ...changes } }, { full: false }));
  assert.equal(Object.keys(Isl.JUNCTIONS).length, 3, 'three forks');
  const branch = Lay.EDGES.find((e) => e.a === 'j4' && e.b === '3.N'), other = Lay.EDGES.find((e) => e.a === 'j4' && e.b === '5.W'), stem = Lay.EDGES.find((e) => e.stem && e.b === 'j4');
  assert.ok(branch && other && stem, 'the fork of 4 is a stem and two branches');
  assert.ok(JUNCTION_REACH >= 3.0 && JUNCTION_REACH <= 3.5, `the exemption is as long as the fork's own overlap (3.0 tiles at the most) and not much longer (${JUNCTION_REACH}; it was 6)`);
  // a branch laid again 0.3 tile beside itself, from the same junction: the two run together for 19 tiles, and only the first 3.5 are the fork's
  const twin = { ...branch, b: 'x.N', pts: branch.pts.map(([x, y]) => [x + 0.2, y - 0.2]) };
  assert.ok(run({ EDGES: [...Lay.EDGES, twin] }).seamRuns > base.seamRuns, 'a road that runs along a branch of a fork for 19 tiles is a seam beyond the first 3.5');
  // and one that runs along it for 5 tiles and leaves: the last 1.5 of them are past the node's reach (with the old 6 tiles it hid in the exemption)
  const along = Array.from({ length: 11 }, (_, k) => { const p = Lay.polyAt(branch, k * 0.5); return [p.x + 0.2, p.y - 0.2]; }), spur = { ...branch, b: 'x.N', ...Lay.polyInfo(along) };
  assert.ok(run({ EDGES: [...Lay.EDGES, spur] }).seamRuns > base.seamRuns, 'a road laid along a branch for 5 tiles is a seam from the 3.5th tile on');
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

test('RA9: the detector sees an apron: a port where a road leaves and no apron is drawn is counted, all 33 when there are none, and an apron with nothing to paint is no apron', () => {
  const { Art } = world, base = ratchetCounts(catalog), run = (aprons) => ratchetCounts(auditRoads({ ...world, Art: { ...Art, aprons } }, { full: false })).portsWithoutApron;
  assert.equal(typeof Art.aprons, 'function', 'the ground art says where its aprons are'); const all = Art.aprons();
  assert.equal(all.length, 33, 'a road leaves 33 ports'); assert.equal(base.portsWithoutApron, 0, 'and each has an apron');
  assert.equal(run(() => all.filter((a) => a.port !== '12.N')), 1, 'the apron of 12.N taken away leaves one port with a road and none');
  assert.equal(run(() => []), 33, 'and with none at all every connected port is one');
  assert.equal(run(() => all.map((a) => ({ ...a, pieces: { ...a.pieces, bands: [] } }))), 33, 'an apron with no band to paint is not one');
  assert.equal(ratchetCounts(auditRoads({ ...world, Art: {} }, { full: false })).portsWithoutApron, 33, 'a checkout whose ground art has no aprons (the commit before WP10) has 33 ports without one');
});

test('RA10: the detector sees the terminations: a termination taken away makes its port a dead end, a turn spot taken away, a bare termination, a gate moved off its open end, a deck or a head taken away, and a scatter prop put back at an end are each counted', () => {
  const { Lay } = world, base = ratchetCounts(catalog), L = Lay.LAYOUT, run = (changes) => ratchetCounts(auditRoads({ ...world, Lay: { ...Lay, LAYOUT: { ...L, ...changes } } }, { full: false }));
  assert.equal(L.terms.length, 29, 'twenty-nine terminations');
  assert.equal(run({ terms: L.terms.filter((t) => t.port !== '6.E') }).deadEnds, base.deadEnds + 1, 'the roundabout of 6.E taken from the registry leaves its port a dead end');
  assert.equal(run({ terms: [] }).deadEnds, 29, 'with none registered (a checkout before WP12) every one of the 29 ends is a dead end');
  assert.equal(run({ turnSpots: L.turnSpots.filter((s) => s.port !== '3.S') }).endsWithoutTurnSpot, base.endsWithoutTurnSpot + 1, 'a termination that registered no turn spot is counted');
  assert.equal(run({ terms: L.terms.map((t) => (t.port === '13.N' ? { ...t, props: t.props.slice(0, 2) } : t)) }).bareEnds, base.bareEnds + 1, 'a plaza with two props is a bare disc: the end must read as a place');
  assert.equal(run({ terms: L.terms.map((t) => (t.port === '8.S' ? { ...t, props: t.props.filter((p) => p.t === 'loaddock').slice(0, 1) } : t)) }).bareEnds, base.bareEnds, 'a yard with a loading dock is a place with one prop: the dock is the building');
  assert.equal(run({ decks: L.decks.slice(1) }).pathEndsWithoutDeck, base.pathEndsWithoutDeck + 1, 'a lookout with no deck of ground art');
  assert.equal(run({ heads: L.heads.slice(1) }).pathStartsWithoutHead, base.pathStartsWithoutHead + 1, 'a footpath that leaves a road with no path head');
  assert.equal(run({ terms: L.terms.filter((t) => t.kind !== 'head') }).pathStartsWithoutHead, base.pathStartsWithoutHead + 3, 'and the three that leave a street\'s end');
  // a scatter prop put back where a termination keeps it clear: the first end's strip, a crate of the pad
  const D = Lay.DIST[8], strip = L.terms.find((t) => t.port === '8.S'), [x, y] = [strip.frame.x, strip.frame.y + 2.5], crate = { t: 'crates', gx: x - 0.5, gy: y, w: 1, d: 1, h: 20, zone: 8, pad: true, solid: true, key: x + y };
  assert.equal(run({ props: [...L.props, crate] }).scatterAtEnds, base.scatterAtEnds + 1, 'a hashed pad prop in the strip beyond a port is counted again');
  // a gate moved down its road, away from the open end (its prop with it: the detector finds the prop where the record says)
  const D13 = Lay.DIST[13], g = D13.gates[0], e = Lay.EDGES[g.edge], q = Lay.polyAt(e, e.len * 0.4), moved = { ...g, x: q.x, y: q.y }, prop = { ...g.prop, gx: q.x - 0.15, gy: q.y - 0.15 };
  assert.equal(ratchetCounts(auditRoads({ ...world, Lay: { ...Lay, DIST: { ...Lay.DIST, 13: { ...D13, gates: [moved], props: [...D13.props, prop] } } } }, { full: false })).gatesAwayFromOpenEnd, base.gatesAwayFromOpenEnd + 1, 'a gate at 40% of an 84-tile road is a road that looks open at its open end (screenshot 1)');
  void D;
  // the verifier's D8: what the nets held was the structure of the registry, not what the picture shows. An end with no ground pieces, a prop moved 30 tiles off, a cull box the size of a point, a kind its pieces are not and a turn spot 40 tiles away were all counted as fine
  const only = (port, f) => L.terms.map((t) => (t.port === port ? f(t) : t));
  assert.equal(run({ terms: only('8.S', (t) => ({ ...t, pieces: [] })) }).endsWithoutGround, base.endsWithoutGround + 1, 'a yard with its ground pieces taken away has no asphalt, slab or plaza (its dock and its bay lines go with them)');
  assert.equal(run({ terms: only('13.N', (t) => ({ ...t, pieces: t.pieces.filter((q) => q.role !== 'plaza' && q.role !== 'asph') })) }).endsWithoutGround, base.endsWithoutGround + 1, 'a plaza with its square and its drive taken away is the same');
  assert.equal(run({ terms: only('13.W', (t) => ({ ...t, props: t.props.map((p) => ({ ...p, gx: p.gx + 30 })) })) }).propsFarFromPort, base.propsFarFromPort + 1, 'the dressing of a bulb moved 30 tiles away is a termination with props far from its port');
  assert.equal(run({ terms: only('2.S', (t) => ({ ...t, bb: [0, 0, 1, 1] })) }).boxesTooSmall, base.boxesTooSmall + 1, 'a cull box shrunk to a point does not hold the ground of its end');
  assert.equal(run({ terms: only('4.N', (t) => ({ ...t, kind: 'barrier' })) }).kindsWithoutTheirParts, base.kindsWithoutTheirParts + 1, 'a bulb called a barrier has no boom');
  assert.equal(run({ terms: only('8.S', (t) => ({ ...t, props: t.props.filter((p) => p.t !== 'loaddock') })) }).kindsWithoutTheirParts, base.kindsWithoutTheirParts + 1, 'a yard whose dock is gone is a hammerhead called a yard');
  assert.equal(run({ terms: only('12.S', (t) => ({ ...t, pieces: t.pieces.filter((q) => q.role !== 'bay') })) }).kindsWithoutTheirParts, base.kindsWithoutTheirParts + 1, 'and with no bay lines too');
  assert.equal(run({ turnSpots: L.turnSpots.map((s) => (s.port === '3.S' ? { ...s, x: s.x + 40 } : s)) }).turnSpotsOffAxis, base.turnSpotsOffAxis + 1, 'a turn spot 40 tiles away is off the axis of its street');
  assert.equal(run({ turnSpots: L.turnSpots.map((s) => (s.port === '6.E' ? { ...s, y: s.y + 0.4 } : s)) }).turnSpotsOffAxis, base.turnSpotsOffAxis + 1, 'and so is one 0.4 tile to the side');
  const class13 = auditRoads({ ...world, Lay: { ...Lay, LAYOUT: { ...L, terms: only('8.S', (t) => ({ ...t, pieces: [] })) } } }, { full: false }).defectClasses.find((c) => c.id === 'R13'); assert.ok(class13.count >= 2 && /1 with no asphalt/.test(class13.detail), 'and the class says it: R13 counts them');
});

test('RA5: it is quick: the audit the ratchet runs is under 2 s of CPU', () => {
  assert.ok(fastMs < CPU_BUDGET_MS, `the audit took ${fastMs.toFixed(0)} ms of CPU (budget ${CPU_BUDGET_MS} ms; the machine's load does not count, only the work done)`);
});

test('RA6: the whole catalog is complete: a proposal for each dead end, a row of the matrix for each district, the cars and ten minutes of them', () => {
  const full = auditRoads(world), T = full.counts.total;
  assert.deepEqual(ratchetCounts(full), ratchetCounts(catalog), 'the full and the fast audit agree on every count the ratchet holds');
  assert.equal(full.deadEnds.length, T.deadEnds); assert.equal(full.terminations.length, 29, 'the catalog lists the 29 terminations'); assert.ok(full.terminations.every((t) => t.kind && t.why && t.turnSpot && t.props.length >= 3), 'each says what it is, why, where a car turns, and what stands there');
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
