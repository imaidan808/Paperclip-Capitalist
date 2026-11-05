// The road detector: an audit of the island's road network, its footpaths, its locked entries and (in full mode) its traffic, read from js/world/layout.js. READ-ONLY: it imports the layout and measures; it changes nothing.
// Shared by tests/world-roads-audit.test.mjs (the ratchet: the counts below may only go down) and scripts/road-audit.mjs (the CLI, which prints the catalog). Built-ins only; scripts/ is never staged (scripts/stage.mjs), so none of this is shipped to the site.
//
//   const world = await loadWorld();              // the layout, the island's plan, the road shapes and the cars of a checkout (default: this one)
//   const catalog = auditRoads(world);             // everything below; auditRoads(world, { full: false }) leaves out what a test does not need (the proposals, the district matrix and the traffic: 50 ms of CPU against 550)
//
// What it measures (every number is read from the layout, none is typed in):
//   ports         the four structural ports of each district's block (the middle of a side, where the block's avenue or cross street meets the block's edge), and which of them an edge leaves
//   deadEnds      every port that no road or ferry leaves AND no termination was registered for (LAYOUT.terms, WP12): the block street runs to the plateau's edge and stops. With world and screen coordinates, the district, the street, what lies beyond
//                 (land, slope, cliff, water, a prop in the way) and whether anything TERMINATES it (a gate, a barrier, a bridge, a roundabout, a building) or nothing does.
//   terminations  the ports that no road leaves and that have one: what stands there (kind, why, its props, its turn spot, whether it fits the ground), so a termination that draws nothing, has no turn spot or is a bare disc is counted.
//   seams         places where two DIFFERENT edges lie within one road width of each other (their ribbons overlap, and each paints its own kerb across the other's asphalt), as runs, with the separation and the angle. Two edges that share a
//                 JUNCTION (island.js JUNCTIONS: a fork is a node where a stem and two branches meet) may overlap within JUNCTION_REACH tiles of it, as a fork does (3.0 tiles at the most today); anything beyond that, or at no junction, is a seam.
//   crossings     places where two different edges cross with no junction (the meeting of edges at a junction node is not a crossing).
//   footpaths     the six footpaths: where each runs over asphalt (a tan ribbon over grey), where it ends (a lookout on the meadow, at a cliff, at a pier on the water), where it hugs a drop.
//   joints        how every edge meets the block street at its port (heading error, lateral offset, grade); a kink is a joint more than 8 degrees or 0.1 tile off the street's axis.
//   aprons        the ports where a road leaves and no apron is drawn (the ground art's own list: groundart.js aprons(); an apron with no band to paint is none): the block's street and the road beyond it meeting in one straight cut.
//   lockedEntries roads that enter a locked district with no barrier, leaf or ferry standing on them, and roads that open with a later district but enter an earlier one with none.
//   counts        the above per district and in total; `ratchet` is the handful of them a test holds (see ratchetCounts).
//   scope         how much the detector looked at (ports, edges, pairs of edges, samples along them): a ratchet that can be "improved" by looking at less is held by floors on these (tests/world-roads-audit.test.mjs).
// In full mode, besides:
//   proposals     for each dead end what could end it (the room beyond it, the neighbouring dead ends a road could join, and a termination the survey's rule would choose: a PROPOSAL, not a fact)
//   connectivity  the district-to-district matrix (direct road, hops, tiles, the gate a trip needs), the components with and without the ferry, the cut-off test the game already holds
//   traffic       what the cars do today: how many, where they fade, how much of each lane is seen, and ten minutes of cars() sampled at four frames a second
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';

/** The checkout this file belongs to. */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The modules the detector reads, from a checkout's folder (a worktree of another commit can be audited the same way). `Art` is the ground art (groundart.js): where it draws its aprons. */
export async function loadWorld(root = ROOT) {
  const mod = (p) => import(pathToFileURL(join(root, p)).href);
  const [Lay, Isl, Shape, Act, Art] = await Promise.all([mod('js/world/layout.js'), mod('js/world/island.js'), mod('js/world/roadshape.js'), mod('js/world/ents-actors.js'), mod('js/world/groundart.js')]);
  return { root, Lay, Isl, Shape, Act, Art };
}

/** The counts a test holds, named as the ratchet names them, out of a catalog (one place says what each one means). */
export function ratchetCounts(catalog) {
  const T = catalog.counts.total;
  return {
    deadEnds: T.deadEnds,                                              // ports that no road or ferry leaves
    seamRuns: T.seamRuns,                                              // runs where two different edges lie within one road width of each other, not counting a stem drawn twice
    crossings: T.crossingsWithNoJunction,                              // two edges that cross with no junction
    pathTilesOverAsphalt: T.footpathTilesOverAsphalt,                  // tiles of footpath that run over a road's asphalt
    lockedWithoutBarrier: T.lockedRoadsWithNoBarrier,                  // roads that open with a district but carry no gate on them
    kinks: catalog.jointsWithAKink.length,                             // edges that meet their block street off its axis
    splitBridges: catalog.defectClasses.find((c) => c.id === 'R9').count, // a bridge drawn as two runs that touch
    footprintThroughRoads: T.roadsThroughAnotherFootprint,             // roads that run through another district's ground
    portsWithoutApron: catalog.defectClasses.find((c) => c.id === 'R7').count, // ports where a road leaves and the ground art draws no apron
    scatterAtEnds: catalog.defectClasses.find((c) => c.id === 'R12').count,    // street ends with a hashed scatter prop standing in the strip beyond the port
    endsWithoutTurnSpot: T.endsWithoutTurnSpot,                        // terminations that registered no place to turn round
    bareEnds: T.bareEnds,                                              // terminations with fewer than three props and no loading dock
    gatesAwayFromOpenEnd: T.gatesAwayFromOpenEnd,                      // gates that stand more than 3.5 tiles from the open end of their road (a bridge's leaf at its bank excepted)
    pathEndsWithoutDeck: catalog.defectClasses.find((c) => c.id === 'R4').count, // footpaths whose end has no deck of ground art
    pathStartsWithoutHead: T.pathStartsWithoutHead,                    // footpaths whose start has no path head
  };
}

/** How far from a junction two of its edges may overlap (WORLD_PASS rule N4 gave 6 tiles; the three forks overlap 3.0, 2.2 and 1.9 tiles from their nodes at the most, tests/world-roads.test.mjs holds them to 3.5, and so the exemption is 3.5: a road laid along a branch for 5 tiles is a seam). */
export const JUNCTION_REACH = 3.5;
/** Two bridges of one road that start within this many tiles of where the other ended are one crossing drawn twice. */
const BRIDGE_TOUCH = 1.6;
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const OUT = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };
const kindOf = (e) => (e.ferry ? 'ferry' : e.path ? 'path' : 'road');
const isRoad = (e) => kindOf(e) === 'road';
const edgeName = (e) => `${e.a}>${e.b}`;
const sxy = (x, y, z) => [Math.round((x - y) * 32), Math.round((x + y) * 16 - z)];
const deg = (rad) => (rad * 180) / Math.PI;
/** The angle between two headings, ignoring which way each is travelled (0 to 90 degrees). */
const axisAngle = (ax, ay, bx, by) => { const c = Math.abs(ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1); return deg(Math.acos(Math.min(1, c))); };
/** The nearest point of a polyline to (x, y): distance, the point, the heading there and the arc length of it. */
function nearest(e, x, y) {
  let best = { d: Infinity }; const P = e.pts, L = e.lens;
  for (let i = 0; i + 1 < P.length; i++) {
    const ax = P[i][0], ay = P[i][1], bx = P[i + 1][0], by = P[i + 1][1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)), qx = ax + dx * t, qy = ay + dy * t, d = Math.hypot(x - qx, y - qy);
    if (d < best.d) best = { d, qx, qy, dx, dy, s: L[i] + Math.hypot(qx - ax, qy - ay) };
  }
  return best;
}
const rectHit = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
const runsOf = (flags, minLen) => { const runs = []; let a = -1; for (let i = 0; i <= flags.length; i++) { const on = i < flags.length && flags[i]; if (on && a < 0) a = i; if (!on && a >= 0) { if (i - a >= minLen) runs.push([a, i - 1]); a = -1; } } return runs; };
/** The point where two segments cross, with the angle they cross at (null when they do not). */
const segX = (p, p2, q, q2) => { const d = (p2[0] - p[0]) * (q2[1] - q[1]) - (p2[1] - p[1]) * (q2[0] - q[0]); if (Math.abs(d) < 1e-9) return null; const t = ((q[0] - p[0]) * (q2[1] - q[1]) - (q[1] - p[1]) * (q2[0] - q[0])) / d, u = ((q[0] - p[0]) * (p2[1] - p[1]) - (q[1] - p[1]) * (p2[0] - p[0])) / d; return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: p[0] + (p2[0] - p[0]) * t, y: p[1] + (p2[1] - p[1]) * t, ang: axisAngle(p2[0] - p[0], p2[1] - p[1], q2[0] - q[0], q2[1] - q[1]) } : null; };

export function auditRoads({ root, Lay, Isl, Shape, Act, Art }, { full = true } = {}) {
  const { LAYOUT, EDGES, DIST, zAt, polyAt } = Lay;
  const { ROADS, ANCHORS, BW, BD, GW, GH } = Isl;
  const ids = LAYOUT.ids;
  const HEADS = Isl.HEADS || {}, NODEOF = { ...(Isl.JUNCTIONS || {}), ...HEADS }, JUNC = Isl.JUNCTIONS || {}, portOf = (nm) => (NODEOF[nm] ? NODEOF[nm].port : nm), districtOf = (nm) => +portOf(nm).split('.')[0]; // a junction or a path head stands for the port of the road it is on
  const wpt = (x, y) => ({ gx: r1(x), gy: r1(y), z: r1(zAt(x, y)), screen: sxy(x, y, zAt(x, y)), footprintOf: LAYOUT.footAt(x, y) || null });
  const sample = (e, step = 0.25) => { const out = []; for (let s = 0; s <= e.len + 1e-9; s += step) { const p = polyAt(e, Math.min(s, e.len)); out.push({ x: p.x, y: p.y, s, dx: p.dx, dy: p.dy }); } return out; };
  const roads = EDGES.filter(isRoad), paths = EDGES.filter((e) => e.path), ferries = EDGES.filter((e) => e.ferry);
  const scope = { terms: (LAYOUT.terms || []).length, decks: (LAYOUT.decks || []).length, pathHeads: (LAYOUT.heads || []).length, junctions: Object.keys(JUNC).length, heads: Object.keys(Isl.HEADS || {}).length, districts: ids.length, edges: EDGES.length, roadEdges: roads.length, pathEdges: paths.length, ferryEdges: ferries.length, edgePairs: 0, ports: 0, samples: 0 };

  // ---------------------------------------------------------------------------------------------- 1. the graph and the ports
  const TERMS = (LAYOUT.terms || []), termOf = (nm) => TERMS.find((t) => t.port === nm) || null, SPOTS = LAYOUT.turnSpots || [];
  const useOf = {}; // '12.N' -> the edges that start or end there
  for (const e of EDGES) for (const nm of [e.a, e.b]) if (/^\d+\./.test(nm)) (useOf[nm] ||= []).push(e);
  const ports = [];
  for (const id of ids) {
    const D = DIST[id];
    for (const P of ['W', 'E', 'N', 'S']) {
      const nm = `${id}.${P}`, es = useOf[nm] || [], rd = es.filter((e) => kindOf(e) !== 'path'), pa = es.filter((e) => e.path), [x, y] = D.ports[P];
      ports.push({ id: nm, district: id, port: P, street: P === 'W' || P === 'E' ? 'avenue' : 'cross street', ...wpt(x, y), roadEdges: rd.map((e) => e.n), pathEdges: pa.map((e) => e.n), roadDegree: 1 + rd.length, fork: rd.length > 1, termination: termOf(nm)?.kind || null, status: rd.length ? (rd.some((e) => e.ferry) ? 'ferry' : 'road') : pa.length ? 'footpath-only' : 'dead-end' });
    }
  }
  scope.ports = ports.length;

  // ---------------------------------------------------------------------------------------------- 2. dead ends: a block street with nothing beyond it
  const props = LAYOUT.props;
  const FURNITURE = new Set(['gate', 'bollard', 'fence', 'planter', 'hedge', 'lamp', 'flag', 'lantern', 'neonlamp', 'neonpole', 'pillar', 'barrel']);
  const deadEnds = [], plateauEdges = [], ends = [];
  for (const q of ports.filter((p) => p.status !== 'road' && p.status !== 'ferry')) {
    const D = DIST[q.district], [ux, uy] = OUT[q.port], [px, py] = D.ports[q.port], z0 = D.z;
    // the ground beyond the block's rim: tile by tile
    const profile = [];
    for (const t of [1, 2, 3, 4, 5, 6, 8]) { const x = px + ux * t, y = py + uy * t; profile.push({ t, land: LAYOUT.isLand(Math.floor(x), Math.floor(y)), z: r1(zAt(x, y)), dz: r1(zAt(x, y) - z0), inFootprint: LAYOUT.footAt(x, y) === q.district, otherRoad: roads.some((e) => nearest(e, x, y).d < 1.0) }); }
    const waterAt = profile.find((p) => !p.land), maxDrop = Math.min(...profile.filter((p) => p.t <= 4 && p.land).map((p) => p.dz), 0), maxRise = Math.max(...profile.filter((p) => p.t <= 4 && p.land).map((p) => p.dz), 0);
    const beyond = waterAt && waterAt.t <= 4 ? { kind: 'water', at: waterAt.t } : maxDrop < -20 ? { kind: 'cliff-down', at: profile.find((p) => p.dz < -20).t, drop: maxDrop } : maxRise > 20 ? { kind: 'hill-wall', at: profile.find((p) => p.dz > 20).t, rise: maxRise } : maxDrop < -6 ? { kind: 'slope-down', at: profile.find((p) => p.dz < -6).t, drop: maxDrop } : { kind: 'open-ground', at: null };
    // what stands in the strip the street would run along (3 tiles wide, 4 long)
    const strip = [Math.min(px, px + ux * 4) + (ux === 0 ? -1.5 : 0), Math.min(py, py + uy * 4) + (uy === 0 ? -1.5 : 0), ux === 0 ? 3 : 4, uy === 0 ? 3 : 4];
    const inStrip = props.filter((p) => p.zone === q.district && rectHit([p.gx, p.gy, p.w || 0.3, p.d || 0.3], strip)).map((p) => `${p.t}${p.solid ? '' : '(deco)'}`);
    const solidInStrip = props.filter((p) => p.zone === q.district && p.solid && rectHit([p.gx, p.gy, p.w || 0.3, p.d || 0.3], strip)).map((p) => p.t);
    const gateNear = props.some((p) => p.t === 'gate' && Math.hypot(p.gx - px, p.gy - py) < 6), T0 = termOf(q.id);
    const scatterInStrip = props.filter((p) => p.zone === q.district && p.pad && rectHit([p.gx, p.gy, p.w || 0.3, p.d || 0.3], strip)).map((p) => p.t); // (the pad's hashed scatter: what a termination keeps away)
    const terminator = T0 ? 'termination:' + T0.kind : gateNear ? 'gate' : solidInStrip.some((t) => !FURNITURE.has(t)) ? 'building-or-prop' : solidInStrip.length ? 'furniture-only' : 'none';
    const padSide = ANCHORS[q.district].pad[{ W: 0, N: 1, E: 2, S: 3 }[q.port]];
    const end = { id: 'DE-' + q.id, port: q.id, district: q.district, theme: D.theme, name: D.name, street: q.street, ...wpt(px, py), outward: [ux, uy], continuesAs: q.status === 'footpath-only' ? 'footpath (edge ' + q.pathEdges.join(',') + ')' : null, blockZ: z0, padTiles: padSide, beyond, propsInStrip: inStrip, scatterInStrip, terminator, termination: T0 ? T0.kind : null, severity: T0 ? 'none' : terminator === 'none' ? 'high' : 'medium' };
    ends.push(end); if (!T0) deadEnds.push(end);
    plateauEdges.push({ id: 'PE-' + q.id, port: q.id, district: q.district, blockZ: z0, padTiles: padSide, profile, beyond: beyond.kind });
  }

  // ---------------------------------------------------------------------------------------------- 2b. (full) what could end each dead end: the room, the neighbours, and the rule's answer (a PROPOSAL, not a fact)
  let connectors = [];
  if (full) {
    const nearRoad = (x, y, within) => roads.some((e) => nearest(e, x, y).d < within);
    const discFits = (cx, cy, r, z0, id) => { for (let k = 0; k < 16; k++) for (const f of [0.35, 0.7, 1]) { const x = cx + Math.cos((k / 16) * 6.2832) * r * f, y = cy + Math.sin((k / 16) * 6.2832) * r * f; if (!LAYOUT.isLand(Math.floor(x), Math.floor(y)) || Math.abs(zAt(x, y) - z0) > 6) return false; const zo = LAYOUT.zoneAt(x, y); if (zo && zo !== id) return false; if (nearRoad(x, y, 1.5)) return false; } return true; };
    for (const d of ends) {
      const D = DIST[d.district], [ux, uy] = d.outward, px = d.gx, py = d.gy; let flat = 0;
      for (let t = 0.25; t <= 14; t += 0.25) { const x = px + ux * t, y = py + uy * t; if (!LAYOUT.isLand(Math.floor(x), Math.floor(y)) || Math.abs(zAt(x, y) - D.z) > 6) break; flat = t; }
      const first = (r) => { for (let c = r; c <= r + 8; c += 0.5) if (discFits(px + ux * c, py + uy * c, r, D.z, d.district)) return r1(c - r); return null; }; // how far from the block's edge the disc has to stand (0: against it); the disc is wholly beyond the port, since the block's own ground is full (plots, stash yard, walks)
      const rectFits = (depth, half) => { for (let u = 0.5; u <= depth; u += 0.5) for (let v = -half; v <= half; v += 0.5) { const x = px + ux * u - uy * v, y = py + uy * u + ux * v; if (!LAYOUT.isLand(Math.floor(x), Math.floor(y)) || Math.abs(zAt(x, y) - D.z) > 6 || LAYOUT.zoneAt(x, y) || nearRoad(x, y, 1.5)) return false; } return true; };
      d.rects = { gatehouse6x8: rectFits(6, 4), yard6_5x6: rectFits(6.5, 3), lot6_5x7: rectFits(6.5, 3.5), plaza7_4x7_4: rectFits(7.4, 3.7) };
      d.room = { padTiles: d.padTiles, flatRunBeyondPortTiles: r1(flat), bulbR2_4GapFromBlockEdge: first(2.4), roundaboutR3_4GapFromBlockEdge: first(3.4), note: 'flat = land within 6 px of the block height; a disc fits when every sample of it is flat, land, outside every block and 1.5 tiles clear of every road. The number is the gap between the block edge and the disc (0: it stands against the edge); null = none within 8 tiles' };
    }
    // the dead end of another district that a road could join: straight-line distance, land under the line, the climb, and whether the two ports face each other (not away)
    const mateOf = (a, b) => { const dx = b.gx - a.gx, dy = b.gy - a.gy, dist = Math.hypot(dx, dy); let land = 0, n = 0; for (let t = 0; t <= 1; t += 0.02) { land += LAYOUT.isLand(Math.floor(a.gx + dx * t), Math.floor(a.gy + dy * t)) ? 1 : 0; n++; } const face = (p, ex, ey) => (p.outward[0] * ex + p.outward[1] * ey) / (dist || 1); let steep = 0; for (let t = 0; t + 0.1 <= 1; t += 0.5 / (dist || 1)) { const t2 = Math.min(1, t + 2 / (dist || 1)); steep = Math.max(steep, Math.abs(zAt(a.gx + dx * t2, a.gy + dy * t2) - zAt(a.gx + dx * t, a.gy + dy * t)) / (2 * (t2 - t) * (dist || 1) / 2)); } return { port: b.port, district: b.district, distTiles: r1(dist), landShare: r2(land / n), climbPx: Math.round(Math.abs(a.z - b.z)), gradePxPerTile: r1(Math.abs(a.z - b.z) / dist), steepestTwoTileWindowPxPerTile: r1(steep), facing: [r2(face(a, dx, dy)), r2(face(b, -dx, -dy))] }; };
    for (const a of ends) a.mates = ends.filter((b) => b.district !== a.district).map((b) => mateOf(a, b)).filter((m) => m.distTiles <= 30).sort((p, q) => p.distTiles - q.distTiles).slice(0, 3);
    const goodMate = (m) => m.landShare >= 0.95 && m.gradePxPerTile <= 6 && m.facing[0] >= -0.25 && m.facing[1] >= -0.25 && (m.gradePxPerTile <= 4 || (m.facing[0] > 0.8 && m.facing[1] > 0.8)); // (4 px a tile is the steepest a road may be: tests/world-roads.test.mjs allows 2 px in half a tile; a pair that faces each other square and climbs 4 to 6 px a tile is a tunnel)
    const taken = new Set(), cand = [];
    for (const a of ends) for (const m of a.mates) if (goodMate(m) && a.port < m.port) cand.push({ a: a.port, ...m });
    cand.sort((p, q) => p.distTiles - q.distTiles);
    for (const c of cand) if (!taken.has(c.a) && !taken.has(c.port)) { taken.add(c.a); taken.add(c.port); connectors.push({ a: c.a, b: c.port, as: c.gradePxPerTile > 4 ? 'tunnel' : 'road', distTiles: c.distTiles, gradePxPerTile: c.gradePxPerTile, steepestTwoTileWindowPxPerTile: c.steepestTwoTileWindowPxPerTile, gate: Math.max(+c.a.split('.')[0], +c.port.split('.')[0]) }); }
    const HARBOUR = new Set(['harbor', 'exchange', 'finance', 'scrap', 'market']), CIVIC = new Set(['campus', 'pawn', 'metro', 'creative', 'corporate', 'realty', 'market']);
    for (const d of ends) {
      const D = DIST[d.district], link = connectors.find((c) => c.a === d.port || c.b === d.port), th = D.theme, pad = d.padTiles, bulb = d.room.bulbR2_4GapFromBlockEdge, rb = d.room.roundaboutR3_4GapFromBlockEdge;
      let kind, why;
      if (link) { kind = link.as === 'tunnel' ? 'T8 tunnel-connector' : 'T12 connector'; why = `joins ${link.a === d.port ? link.b : link.a} (${link.distTiles} tiles, ${link.gradePxPerTile} px a tile, gate ${link.gate}${link.as === 'tunnel' ? ', a portal in the rock' : ''})` + (d.continuesAs ? '; the footpath then leaves the new road at a path head' : ''); }
      else if (d.continuesAs) { kind = 'T10 path-head'; why = 'a footpath leaves here: the asphalt ends in a kerb return and a bollard pair, the path starts at the bollards and never runs over the road'; }
      else if (d.beyond.kind === 'water') { kind = HARBOUR.has(th) || th === 'exchange' ? 'T7 quay-end' : 'T3 barrier'; why = `water ${d.beyond.at} tiles beyond the port: a quay with bollards and a boat, or a barrier and a rail`; }
      else if (d.beyond.kind === 'hill-wall') { kind = 'T8 tunnel-portal'; why = `the ground rises ${d.beyond.rise} px within ${d.beyond.at} tiles: a portal in the rock, or a barrier`; }
      else if (d.room.flatRunBeyondPortTiles < 1.5 || pad < 1.5) { kind = 'T3 barrier'; why = `only ${pad} tiles of pad: shorten the street by 1.5 and stand a barrier with a CLOSED sign inside the block`; }
      else if (rb !== null && rb <= 1 && (CIVIC.has(th) || th === 'estate') && d.street === 'avenue') { kind = (th === 'corporate' || th === 'finance') && d.rects.plaza7_4x7_4 ? 'T6 plaza-forecourt' : 'T1 roundabout'; why = 'a flat disc of 3.4 tiles stands against the block edge, on an avenue of a civic district'; }
      else if ((th === 'harbor' || th === 'industrial' || th === 'scrap' || th === 'farm') && d.rects.yard6_5x6) { kind = 'T5 loading-yard'; why = th === 'farm' ? 'a farm track ends in the barn yard: a field gate, hay bales and a turning apron' : 'a working street ends at a loading face: apron, bays, a dock wall'; }
      else if ((th === 'tech' || th === 'estate') && d.rects.gatehouse6x8) { kind = 'T4 gatehouse'; why = th === 'estate' ? 'manor gates with pillars and a booth' : 'a guarded gate into a fenced compound'; }
      else if (th === 'auto' && d.rects.lot6_5x7) { kind = 'T9 parking-lot-end'; why = 'a dealer street ends in a forecourt lot'; }
      else if (bulb !== null && bulb <= 1) { kind = 'T2 cul-de-sac'; why = 'a flat disc of 2.4 tiles stands against the block edge'; }
      else { kind = 'T3 barrier'; why = 'no room for a turning circle or a yard'; }
      d.proposal = { kind, why, connector: link || null };
    }
  }

  // ---------------------------------------------------------------------------------------------- 3. seams: two different roads within one road width
  const seams = [];
  for (let i = 0; i < EDGES.length; i++) for (let j = i + 1; j < EDGES.length; j++) {
    const A = EDGES[i], B = EDGES[j]; if (A.ferry || B.ferry) continue;
    scope.edgePairs++;
    const reach = (A.w + B.w) / 2, S = sample(A, 0.25), near = S.map((p) => nearest(B, p.x, p.y)), flags = near.map((n) => n.d < reach);
    scope.samples += S.length;
    const sharedPorts = [A.a, A.b].filter((n) => n === B.a || n === B.b);
    const nodesShared = sharedPorts.filter((n) => JUNC[n]).map((n) => LAYOUT.nodes.get(n));
    if (nodesShared.length) for (let i = 0; i < S.length; i++) if (flags[i] && nodesShared.some(([jx, jy]) => Math.hypot(S[i].x - jx, S[i].y - jy) <= JUNCTION_REACH)) flags[i] = false; // a fork: the roads of a junction overlap near it, as the three ribbons of a Y do
    for (const [a0, a1] of runsOf(flags, 4)) {
      const seg = S.slice(a0, a1 + 1), nr = near.slice(a0, a1 + 1), seps = nr.map((n) => n.d), len = (a1 - a0) * 0.25, ang = seg.map((p, k) => axisAngle(p.dx, p.dy, nr[k].dx, nr[k].dy)), meanSep = seps.reduce((a, b) => a + b, 0) / seps.length;
      const first = seps[0], last = seps.at(-1), mid = seg[Math.floor(seg.length / 2)];
      const atShared = sharedPorts.length > 0 && [seg[0], mid, seg.at(-1)].some((p) => sharedPorts.some((n) => { const [px, py] = LAYOUT.nodes.get(n); return Math.hypot(p.x - px, p.y - py) < 9; }));
      const kind = meanSep < 0.2 && Math.max(...seps) < 0.4 ? 'coincident' : (first < 0.3 && last > reach - 0.4) || (last < 0.3 && first > reach - 0.4) ? 'merge' : len > 3 && Math.max(...ang) < 25 ? 'parallel' : 'cross';
      const pair = (A.path || B.path) ? 'road-path' : 'road-road';
      seams.push({ id: `SEAM-${A.n}x${B.n}-${seams.length}`, a: edgeName(A), b: edgeName(B), aEdge: A.n, bEdge: B.n, pair, kind, sharedPort: sharedPorts[0] || null, atSharedPort: atShared, lengthTiles: r1(len), meanSep: r2(meanSep), maxSep: r2(Math.max(...seps)), meanAngle: r1(ang.reduce((a, b) => a + b, 0) / ang.length), from: wpt(seg[0].x, seg[0].y), mid: wpt(mid.x, mid.y), to: wpt(seg.at(-1).x, seg.at(-1).y), sOnA: [r1(seg[0].s), r1(seg.at(-1).s)], districts: [...new Set([seg[0], mid, seg.at(-1)].map((p) => LAYOUT.footAt(p.x, p.y)).filter(Boolean))] });
    }
  }

  // ---------------------------------------------------------------------------------------------- 4. crossings with no junction
  const crossings = [];
  for (let i = 0; i < EDGES.length; i++) for (let j = i + 1; j < EDGES.length; j++) {
    const A = EDGES[i], B = EDGES[j]; if (A.ferry || B.ferry) continue; const shared = [A.a, A.b].filter((n) => n === B.a || n === B.b), hits = [];
    for (let a = 0; a + 1 < A.pts.length; a++) for (let b = 0; b + 1 < B.pts.length; b++) { const h = segX(A.pts[a], A.pts[a + 1], B.pts[b], B.pts[b + 1]); if (h) hits.push(h); }
    // a crossing right at a shared port is the fork itself, and a run of hits inside a coincident stem is one meeting
    const real = hits.filter((h) => !shared.some((n) => { const [px, py] = LAYOUT.nodes.get(n); return Math.hypot(h.x - px, h.y - py) < (JUNC[n] ? 1 : 9); })); // (at a junction the edges meet in a point and nowhere else: a crossing beyond it is a real one)
    if (real.length) { const h = real[0]; crossings.push({ id: `X-${A.n}x${B.n}`, a: edgeName(A), b: edgeName(B), kind: (A.path || B.path) ? 'road-path' : 'road-road', hits: real.length, angle: r1(h.ang), at: wpt(h.x, h.y) }); }
  }

  // ---------------------------------------------------------------------------------------------- 5. footpaths
  const footpaths = paths.map((e) => {
    const S = sample(e, 0.25), lay = LAYOUT.nodes.get(e.b), end = S.at(-1);
    const hit = S.map((p) => { let best = null; for (const R of roads) { const n = nearest(R, p.x, p.y); if (n.d < (R.w + e.w) / 2 && (!best || n.d < best.d)) best = { edge: R, d: n.d, dx: n.dx, dy: n.dy }; } return best; });
    const runs = runsOf(hit.map(Boolean), 2).map(([a, b]) => {
      const seg = S.slice(a, b + 1), edgesUnder = [...new Set(hit.slice(a, b + 1).map((h) => edgeName(h.edge)))], ang = seg.map((p, k) => axisAngle(p.dx, p.dy, hit[a + k].dx, hit[a + k].dy)), mid = seg[Math.floor(seg.length / 2)];
      const len = (b - a) * 0.25, kind = a === 0 && len < 4 ? 'leaves-its-own-road' : Math.max(...ang) > 30 && len < 3.5 ? 'crosses' : 'runs-along';
      return { kind, lengthTiles: r1(len), sOnPath: [r1(seg[0].s), r1(seg.at(-1).s)], over: edgesUnder, meanAngle: r1(ang.reduce((x, y) => x + y, 0) / ang.length), from: wpt(seg[0].x, seg[0].y), mid: wpt(mid.x, mid.y), to: wpt(seg.at(-1).x, seg.at(-1).y) };
    });
    scope.samples += S.length;
    // the end: what is round the lookout (water within 3 tiles, a drop in the ground, whether the platform's tiles are land)
    const ring = []; for (let k = 0; k < 16; k++) for (const rad of [1, 2, 3]) { const x = end.x + Math.cos((k / 16) * 6.2832) * rad, y = end.y + Math.sin((k / 16) * 6.2832) * rad; ring.push({ rad, wet: !LAYOUT.isLand(Math.floor(x), Math.floor(y)), dz: zAt(x, y) - zAt(end.x, end.y) }); }
    const wetAt = ring.filter((r) => r.wet).map((r) => r.rad), waterWithin = wetAt.length ? Math.min(...wetAt) : null, drop = Math.min(...ring.map((r) => r.dz));
    const endKind = drop < -12 ? 'cliff-top' : waterWithin !== null && waterWithin <= 2 ? 'shore' : 'meadow'; // (cliff-top: the ground falls more than 12 px within 3 tiles; shore: water within 2 tiles and a low bank; every lookout in the island is one of the three)
    // along the path: stretches that hug a drop (the ground falls more than 8 px within 1.5 tiles at the side)
    const lip = S.map((p) => { const nx = -p.dy, ny = p.dx; return [-1.5, 1.5].some((o) => { const x = p.x + nx * o, y = p.y + ny * o; return !LAYOUT.isLand(Math.floor(x), Math.floor(y)) || zAt(x, y) - zAt(p.x, p.y) < -8; }); });
    const lipRuns = runsOf(lip, 4).map(([a, b]) => ({ lengthTiles: r1((b - a) * 0.25), from: wpt(S[a].x, S[a].y), to: wpt(S[b].x, S[b].y) }));
    const lookout = props.find((p) => p.t === 'lookout' && Math.hypot(p.gx + 0.5 - lay[0], p.gy + 0.5 - lay[1]) < 1);
    const onAsphalt = runs.filter((r) => r.kind !== 'leaves-its-own-road').reduce((s, r) => s + r.lengthTiles, 0);
    return { id: 'FP-' + e.b, edge: e.n, from: e.a, to: e.b, gate: e.gate, lengthTiles: r1(e.len), runsOverAsphalt: runs, tilesOverAsphalt: r1(onAsphalt), end: { ...wpt(end.x, end.y), kind: endKind, waterWithinTiles: waterWithin, worstDropPx: r1(drop), lookoutProp: !!lookout }, hugsDrop: lipRuns, connectsTo: 'nothing (a leaf: it ends at its lookout)' };
  });

  // ---------------------------------------------------------------------------------------------- 5b. joints: how an edge meets the block street at its port
  const joints = [];
  for (const e of roads.concat(paths)) for (const [end, port] of [[0, e.a], [1, e.b]]) {
    if (!/^\d+\./.test(port)) continue;
    const [id, P] = [+port.split('.')[0], port.split('.')[1]], [px, py] = DIST[id].ports[P], [ux, uy] = OUT[P], at = (d) => polyAt(e, end ? Math.max(0, e.len - d) : Math.min(e.len, d));
    const lat = (p) => (ux ? Math.abs(p.y - py) : Math.abs(p.x - px)), a1 = at(1.5), a3 = at(3), a5 = at(5);
    const head = axisAngle(a1.dx, a1.dy, ux, uy), gradePx = r1((zAt(a5.x, a5.y) - zAt(px, py)) / 5);
    joints.push({ edge: edgeName(e), n: e.n, kind: kindOf(e), port, headingErrorAt1_5: r1(head), lateralAt1: r2(lat(at(1))), lateralAt3: r2(lat(a3)), lateralAt5: r2(lat(a5)), gradePxPerTileOver5: gradePx, kink: head > 8 || lat(at(1)) > 0.1 });
  }
  const kinked = joints.filter((j) => j.kink);

  // ---------------------------------------------------------------------------------------------- 6. roads through other districts, bridges, tidy notes
  const through = [];
  for (const e of roads) {
    const S = sample(e, 0.5), own = new Set([districtOf(e.a), districtOf(e.b)]), seen = S.map((p) => LAYOUT.footAt(p.x, p.y)), blocks = S.map((p) => LAYOUT.zoneAt(p.x, p.y));
    for (const id of ids) { if (own.has(id)) continue; const f = seen.filter((v) => v === id).length * 0.5, b = blocks.filter((v) => v === id).length * 0.5; if (f > 0.4) through.push({ road: edgeName(e), district: id, tilesInFootprint: r1(f), tilesInBlock: r1(b) }); }
  }
  const bridges = LAYOUT.bridges.map((b, i) => ({ id: 'BR-' + i, road: edgeName(b.edge), gate: b.gate, s0: r1(b.s0), s1: r1(b.s1), lengthTiles: r1(b.s1 - b.s0), from: wpt(b.pts[0][0], b.pts[0][1]), to: wpt(b.pts.at(-1)[0], b.pts.at(-1)[1]), deckZ: [r1(b.z0), r1(b.z1)] }));
  const authoring = EDGES.map((e) => { const kept = Shape.tidy(e.plan).length, dropped = e.plan.length - kept; const via = (ROADS[e.n] || {}).via || []; const onPort = via.filter((v) => [e.a, e.b].some((n) => { const p = LAYOUT.nodes.get(n); return p && Math.hypot(p[0] - v[0], p[1] - v[1]) < 1e-6; })); return { edge: edgeName(e), n: e.n, planPoints: e.plan.length, droppedByTidy: dropped, viaOnItsOwnPort: onPort.length, finalPoints: e.pts.length }; }).filter((a) => a.droppedByTidy > 0 || a.viaOnItsOwnPort > 0);
  // roads that run along a drop: the ground falls more than 12 px, or the sea lies, within 1.8 tiles of the centre line on one side (no verge, no rail: screenshot 1's road on the lip of the cliff)
  const cliffEdgeRuns = [];
  for (const e of roads) {
    const S = sample(e, 0.5), side = (p, o) => { const x = p.x - p.dy * o, y = p.y + p.dx * o; return !LAYOUT.isLand(Math.floor(x), Math.floor(y)) || zAt(x, y) - zAt(p.x, p.y) < -12; };
    const flags = S.map((p) => !(LAYOUT.bridges.some((b) => b.edge === e && p.s >= b.s0 && p.s <= b.s1)) && (side(p, 1.8) || side(p, -1.8)));
    for (const [a, b] of runsOf(flags, 6)) cliffEdgeRuns.push({ road: edgeName(e), lengthTiles: r1((b - a) * 0.5), from: wpt(S[a].x, S[a].y), to: wpt(S[b].x, S[b].y) });
  }
  const edgeTable = EDGES.map((e) => ({ n: e.n, a: e.a, b: e.b, kind: kindOf(e), gate: e.gate, lengthTiles: r1(e.len), width: e.w, points: e.pts.length, planPoints: e.plan.length, bridges: LAYOUT.bridges.filter((b) => b.edge === e).length }));

  // ---------------------------------------------------------------------------------------------- 7. gates: locked entries with nothing standing on them
  // a gate counts only when its PROP stands where layout.js recorded it (D.gates, one for each road that opens with the district: WP11; a checkout before it has one gate a district, D.gateAt, ten tiles from its port): the data is a record, the prop is
  // what the player sees, so a kit that stopped making the prop must not pass
  const gatesOf = (D) => D.gates || (D.gateAt ? [D.gateAt] : []);
  const gateOn = (D, e) => gatesOf(D).find((g) => g.edge === e.n && (D.props || []).some((q) => q.t === 'gate' && q.gk === D.gateKind && Math.hypot(q.gx + 0.15 - g.x, q.gy + 0.15 - g.y) < 1)) || null;
  const lockedEntries = [];
  for (const id of ids) {
    const D = DIST[id], entering = roads.concat(ferries).filter((e) => !e.stem && (districtOf(e.a) === id || districtOf(e.b) === id) && e.gate === id); // (a fork's stem is the district's own front yard, not a road into it: the roads that come to the fork are)
    for (const e of entering) { const marked = gateOn(D, e); lockedEntries.push({ district: id, gateKind: D.gateKind, road: edgeName(e), edge: e.n, hasGateProp: !!marked, defect: D.gateKind !== 'fog' && !marked ? 'a locked road with no barrier, leaf or ferry on it' : null }); }
  }
  // every district also holds roads of OTHER gates: a road that opens with district g but enters h < g is drawn closed with no gate prop either
  const closedUnmarked = [], gatesFar = [], GATE_REACH = 3.5; // (WP11: the gate stands at the road's OPEN end, its first tile; a bridge's leaf stands at the bank on the open side)
  for (const e of roads.concat(ferries)) {
    if (e.stem) continue; const g = e.gate, D = DIST[g]; if (!D || D.gateKind === 'fog') continue;
    const gate = gateOn(D, e);
    if (!gate) { closedUnmarked.push({ road: edgeName(e), edge: e.n, opensWithDistrict: g, gateKind: D.gateKind, gatePropIsOnEdge: gatesOf(D)[0] ? gatesOf(D)[0].edge : null }); continue; }
    const da = districtOf(e.a), db = districtOf(e.b), atA = da !== g ? (db !== g ? da < db : true) : false, s = nearest(e, gate.x, gate.y).s, away = atA ? s : e.len - s; // tiles from the open end along the road
    const onBridge = D.gateKind === 'bridge' && LAYOUT.bridges.some((b) => b.edge === e);
    if (away > GATE_REACH && !onBridge) gatesFar.push({ road: edgeName(e), edge: e.n, district: g, gateKind: D.gateKind, tilesFromOpenEnd: r1(away) });
  }

  // ---------------------------------------------------------------------------------------------- 8. (full) connectivity
  const roadGraph = []; for (const e of roads.concat(ferries)) { if (e.stem) continue; const a = districtOf(e.a), b = districtOf(e.b); if (a && b) roadGraph.push({ edge: e.n, a, b, ports: `${e.a} > ${e.b}`, gate: e.gate, kind: kindOf(e), lengthTiles: r1(e.len) }); }
  const nDistEdges = roadGraph.length;
  const degree = {}; for (const g of roadGraph) { degree[g.a] = (degree[g.a] || 0) + 1; degree[g.b] = (degree[g.b] || 0) + 1; }
  let connectivity = null, cycles = null;
  const dijkstra = (from, open, withFerry = true, kinds = ['road']) => {
    const dist = new Map([[from, 0]]), via = new Map(), todo = new Set([from]);
    const adj = new Map(), add = (a, b, len, gate, e) => { (adj.get(a) || adj.set(a, []).get(a)).push({ to: b, len, gate, e }); (adj.get(b) || adj.set(b, []).get(b)).push({ to: a, len, gate, e }); };
    for (const id of ids) for (const P of ['W', 'E', 'N', 'S']) { const c = DIST[id]; add(id + '.C', id + '.' + P, Math.hypot(c.cx - c.ports[P][0], c.cy - c.ports[P][1]), id, null); }
    for (const e of EDGES) { if (e.ferry && !withFerry) continue; if (!e.ferry && !kinds.includes(kindOf(e))) continue; add(e.a, e.b, e.len, e.gate, e); }
    while (todo.size) { let u = null; for (const n of todo) if (u === null || dist.get(n) < dist.get(u)) u = n; todo.delete(u); for (const k of adj.get(u) || []) { if (open && !open.has(k.gate)) continue; const nd = dist.get(u) + k.len; if (!dist.has(k.to) || nd < dist.get(k.to)) { dist.set(k.to, nd); via.set(k.to, { from: u, k }); todo.add(k.to); } } }
    return { dist, via };
  };
  const comps = (withFerry) => { const seen = new Set(), out = []; for (const a of ids) { if (seen.has(a)) continue; const R = dijkstra(a + '.C', null, withFerry), c = ids.filter((b) => R.dist.has(b + '.C')); c.forEach((x) => seen.add(x)); out.push(c); } return out; };
  if (full) {
    const matrix = { direct: {}, hops: {}, tiles: {}, gateNeeded: {} };
    const direct = new Set(); for (const e of roads.concat(ferries)) { if (e.stem) continue; const a = districtOf(e.a), b = districtOf(e.b); if (a && b) direct.add(Math.min(a, b) + '-' + Math.max(a, b)); }
    for (const a of ids) {
      matrix.direct[a] = {}; matrix.hops[a] = {}; matrix.tiles[a] = {}; matrix.gateNeeded[a] = {};
      const R = dijkstra(a + '.C', null);
      for (const b of ids) {
        matrix.direct[a][b] = a === b ? 0 : direct.has(Math.min(a, b) + '-' + Math.max(a, b)) ? 1 : 0;
        const d = R.dist.get(b + '.C'); matrix.tiles[a][b] = d === undefined ? null : r1(d);
        let hops = 0, gmax = 0; for (let n = b + '.C'; n !== a + '.C' && R.via.get(n);) { const v = R.via.get(n); if (v.k.e) { hops++; gmax = Math.max(gmax, v.k.e.gate); } n = v.from; }
        matrix.hops[a][b] = d === undefined ? null : hops; matrix.gateNeeded[a][b] = d === undefined ? null : Math.max(gmax, a, b);
      }
    }
    const cutOff = {}; for (let d = 2; d <= 16; d++) { const o = new Set(ids.filter((z) => z < d)); cutOff[d] = { routeWhileLocked: LAYOUT.route(1, d, o) === null ? 'none (cut off)' : 'REACHABLE', routeWhenOpen: LAYOUT.route(1, d, new Set([...o, d])) ? 'ok' : 'NONE' }; }
    cycles = nDistEdges - ids.length + comps(true).length;
    connectivity = { graph: roadGraph, componentsWithFerry: comps(true), componentsWithoutFerry: comps(false), cutOffWhileLocked: cutOff, matrix };
  }

  // ---------------------------------------------------------------------------------------------- 9. (full) traffic as it is
  let traffic = null;
  if (full) {
    const CARS = Act.CARS, CAR_SPEED = Act.CAR_SPEED, LANE = Act.LANE, carRoads = Act.CAR_EDGES || roads; // (the roads that carry a car: not a fork's stem)
    const trafficEdges = carRoads.map((e) => { const fade = Math.min(6, e.len * 0.25), laneLen = e.len; return { road: edgeName(e), edge: e.n, gate: e.gate, lengthTiles: r1(e.len), carsOnIt: 1, lapSeconds: r1(laneLen / CAR_SPEED), fadeTilesEachEnd: r1(fade), shareOfLaneWhereCarIsWhole: r2(Math.max(0, (laneLen - 2 * fade) / laneLen)), laneTilesPerCar: r1(laneLen * 2) }; });
    const totalRoadTiles = roads.reduce((s, e) => s + e.len, 0), blockStreetTiles = ids.length * (BW + BD);
    traffic = {
      model: 'js/world/ents-actors.js cars(): CARS=' + CARS + ', one car per road (CAR_EDGES[(i*7)%18], a permutation; the stem of a fork has none), lane = the road polyline offset ' + LANE + ' tile to the right, speed ' + CAR_SPEED + ' tiles/s (x0.9..1.1), s = (phase + t*v) mod len, so it laps its own road forever; fade = min(s, len-s)/min(6, len/4); open roads only (unlocked.has(e.gate)); none in reduced motion; no car ever enters a district block (the avenue and cross street have none)',
      cars: CARS, roadsWithACar: carRoads.length, roadTiles: r1(totalRoadTiles), blockStreetTiles, shareOfStreetsWithTraffic: r2(totalRoadTiles / (totalRoadTiles + blockStreetTiles)), perRoad: trafficEdges,
      vanishPoints: carRoads.length * 2,
      vanishAt: 'both ends of every road: the port on the block edge (the fade is to 0 alpha there and the car re-appears at the other end of the same road, so a car never reaches a district)',
      freightTrucks: 'a truck is a game entity (one per freight run) that follows LAYOUT.truckRoute: depot door, down or along the block street to a port, the roads, the far block; it does drive through districts; offsetPoly(mid, 0.5)',
    };
    // the same cars, run: ten minutes of the world's own cars() at 4 frames a second (what the code does, not what its comment says)
    const world = { ...Act.actorMethods, t: 0, unlocked: new Set(ids), carList: Array.from({ length: CARS }, () => ({ gx: 0, gy: 0, i: 0, key: 0, horiz: true, ang: 0, fade: 1 })) }, CE = carRoads;
    let frames = 0, close = 0, whole = 0, fading = 0, gone = 0, inBlock = 0, n = 0; const pairs = {};
    for (let t = 0; t < 600000; t += 250) {
      world.t = t; const cs = world.cars().map((c) => ({ ...c })); frames++;
      for (const c of cs) { n++; if (LAYOUT.zoneAt(c.gx, c.gy)) inBlock++; if (c.fade >= 1) whole++; else if (c.fade > 0.02) fading++; else gone++; }
      for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) if (cs[a].fade >= 0.5 && cs[b].fade >= 0.5 && Math.hypot(cs[a].gx - cs[b].gx, cs[a].gy - cs[b].gy) < 1.1) { close++; const k = CE[(cs[a].i * 7) % CE.length].a + ' & ' + CE[(cs[b].i * 7) % CE.length].a; pairs[k] = (pairs[k] || 0) + 1; }
    }
    const w1 = { ...world, unlocked: new Set([1]) }; w1.t = 5000;
    traffic.measuredTenMinutes = { frames, carSamples: n, samplesInsideAnyDistrictBlock: inBlock, shareOfCarFramesNotFullyVisible: r2((fading + gone) / n), framesWithTwoVisibleCarsCloserThan1_1Tiles: close, whichRoads: pairs, carsDrawnWithOnlyDistrictOneOpen: w1.cars().length };
  }

  // ---------------------------------------------------------------------------------------------- 9b. terminations, deck and heads (WP11 and WP12): what stands at the ends, and whether it is a place
  const spotOf = (nm) => SPOTS.find((q) => q.port === nm) || null, DECKS = LAYOUT.decks || [], HEADS_ = LAYOUT.heads || [];
  const terminations = TERMS.map((t) => ({ port: t.port, district: t.district, kind: t.kind, why: t.why, authored: !!t.authored, props: t.props.map((p) => p.t), door: !!t.door, turnSpot: spotOf(t.port) ? { kind: spotOf(t.port).kind, r: spotOf(t.port).r, open: spotOf(t.port).open } : null }));
  const endsWithoutTurnSpot = TERMS.filter((t) => !spotOf(t.port)).length, bareEnds = TERMS.filter((t) => t.props.length < 3 && !t.props.some((p) => p.t === 'loaddock')).length;
  const startHead = (e) => (HEADS[e.a] ? HEADS_.some((h) => h.edge === e.n) : /^\d+\./.test(e.a) ? termOf(e.a)?.kind === 'head' : false), pathStartsWithoutHead = paths.filter((e) => !startHead(e)).length;
  const pathEndsWithoutDeck = paths.filter((e) => !DECKS.some((d) => d.edge === e.n)).length, scatterAtEnds = ends.filter((d) => d.scatterInStrip.length).length;

  // ---------------------------------------------------------------------------------------------- 10. counts, per district and in total
  const counts = { perDistrict: {}, total: {} }, districtsGates = () => ids.reduce((n, id) => n + gatesOf(DIST[id]).length, 0);
  for (const id of ids) {
    const D = DIST[id], p = ports.filter((q) => q.district === id), de = deadEnds.filter((d) => d.district === id);
    counts.perDistrict[id] = {
      name: D.name, theme: D.theme, gateKind: D.gateKind, padWENS: ANCHORS[id].pad,
      ports: 4, portsWithRoad: p.filter((q) => q.status === 'road' || q.status === 'ferry').length, deadEnds: de.length, deadEndsWithNothing: de.filter((d) => d.terminator === 'none').length, deadEndsFootpathOnly: de.filter((d) => d.continuesAs).length,
      forkPorts: p.filter((q) => q.fork).length, roadEdgesTouching: roads.filter((e) => !e.stem && (districtOf(e.a) === id || districtOf(e.b) === id)).length, footpaths: paths.filter((e) => districtOf(e.a) === id).length, bridgesOnRoads: bridges.filter((b) => EDGES.find((e) => edgeName(e) === b.road && (districtOf(e.a) === id || districtOf(e.b) === id))).length,
      seamRuns: seams.filter((s) => s.kind !== 'coincident' && s.districts.includes(id)).length, otherRoadsThroughFootprint: through.filter((t) => t.district === id).length,
      lockedEntriesWithoutBarrier: lockedEntries.filter((l) => l.district === id && l.defect).length,
    };
  }
  const sum = (k) => ids.reduce((s, id) => s + counts.perDistrict[id][k], 0);
  const totalRoadTiles = roads.reduce((s, e) => s + e.len, 0);
  counts.total = {
    districts: ids.length, ports: ports.length, portsWithRoad: sum('portsWithRoad'), deadEnds: deadEnds.length, deadEndsWithNothing: deadEnds.filter((d) => d.terminator === 'none').length, deadEndsFootpathOnly: deadEnds.filter((d) => d.continuesAs).length, forkPorts: ports.filter((q) => q.fork).length, junctions: Object.keys(JUNC).length,
    roadEdges: roads.length, footpaths: paths.length, ferries: ferries.length, bridges: bridges.length, totalRoadTiles: r1(totalRoadTiles),
    roadTilesAlongADrop: r1(cliffEdgeRuns.reduce((a, r) => a + r.lengthTiles, 0)), seamRuns: seams.filter((s) => s.kind !== 'coincident').length, seamRunsRoadRoad: seams.filter((s) => s.kind !== 'coincident' && s.pair === 'road-road').length, coincidentStems: seams.filter((s) => s.kind === 'coincident').length, crossingsWithNoJunction: crossings.length,
    footpathTilesOverAsphalt: r1(footpaths.reduce((s, f) => s + f.tilesOverAsphalt, 0)), footpathsThatCrossOrRunOverAsphalt: footpaths.filter((f) => f.tilesOverAsphalt > 0).length, footpathEnds: { 'cliff-top': footpaths.filter((f) => f.end.kind === 'cliff-top').length, shore: footpaths.filter((f) => f.end.kind === 'shore').length, meadow: footpaths.filter((f) => f.end.kind === 'meadow').length },
    lockedRoadsWithNoBarrier: closedUnmarked.length, roadsThroughAnotherFootprint: through.length, roundabouts: TERMS.filter((t) => t.kind === 'roundabout').length, culDeSacs: TERMS.filter((t) => t.kind === 'bulb').length, parkingLots: 0, terminations: TERMS.length, endsWithoutTurnSpot, bareEnds, gatesAwayFromOpenEnd: gatesFar.length, pathStartsWithoutHead, pathEndsWithoutDeck, scatterAtEnds, gates: districtsGates(), decks: DECKS.length, pathHeads: HEADS_.length + TERMS.filter((t) => t.kind === 'head').length, crosswalksOutsideBlockCentres: 0, trafficLightsOrStopSigns: 0, junctionsWithRoadMarkings: 0,
    districtGraph: { edges: nDistEdges, independentCycles: cycles ?? nDistEdges - ids.length + comps(true).length, degrees: degree, leafDistricts: ids.filter((i) => (degree[i] || 0) <= 1) },
  };

  // ---------------------------------------------------------------------------------------------- the defect classes, with where each lives in the code
  const T = counts.total, scatterInStrip = T.scatterAtEnds;
  // the ports a road leaves (not the ferry's: it ends in buoys) and which of them the ground art draws an apron at (its own list: an apron with no band to paint is none)
  const connected = ports.filter((q) => q.status === 'road'), apronPorts = new Set((Art && typeof Art.aprons === 'function' ? Art.aprons() : []).filter((a) => a.pieces && a.pieces.bands && a.pieces.bands.length).map((a) => a.port)), noApron = connected.filter((q) => !apronPorts.has(q.id));
  const defectClasses = [
    { id: 'R1', name: 'a block street runs to the plateau edge and stops', count: T.deadEnds, of: T.ports, detail: `${T.deadEnds} of the ${ends.length} ports no road or ferry leaves have no termination registered (${T.terminations} do: ${Object.entries(TERMS.reduce((m, t) => ({ ...m, [t.kind]: (m[t.kind] || 0) + 1 }), {})).map(([k, v]) => v + ' ' + k).join(', ')}); of the ${T.deadEnds}, ${T.deadEndsWithNothing} have nothing in the strip beyond the port (${T.deadEndsFootpathOnly} are the start of a footpath)`, cause: 'js/world/layout.js (every block is the same plus of streets to its edge, a port on all four sides; the terminations are derived there from the ground and the theme: roadshape.js chooseTerm), js/world/island.js (only 18 roads, 1 ferry and 6 paths are authored; TERMS holds the ends chosen by hand)' },
    { id: 'R2', name: 'a fork is two full ribbons laid over each other', count: T.seamRuns, detail: `${T.seamRunsRoadRoad} road-road, ${T.seamRuns - T.seamRunsRoadRoad} road-footpath, at ${new Set(seams.filter((x) => x.kind !== 'coincident').map((x) => x.sharedPort)).size} ports; the longest is ${Math.max(0, ...seams.map((x) => x.lengthTiles))} tiles`, cause: 'js/world/groundart.js (until WP10 each edge painted its kerb strip and then its asphalt strip, in ROADS order, so the later road\'s kerb crossed the earlier road\'s asphalt); js/world/island.js (a fork is a stem and two branches that meet at a JUNCTIONS node)' },
    { id: 'R3', name: 'a footpath runs over asphalt', count: T.footpathsThatCrossOrRunOverAsphalt, of: T.footpaths, detail: `${T.footpathTilesOverAsphalt} tiles in all; no crossing marks anywhere outside a block's own junction`, cause: 'footpaths are the last six ROADS entries, so groundart.js paints them last (on top); each starts at the same port as a road with the same first leg (layout.js, A + OUT * 3)' },
    { id: 'R4', name: 'a footpath ends in nothing: no deck of ground art at its lookout', count: T.pathEndsWithoutDeck, of: T.footpaths, detail: `${footpaths.filter((f) => f.end.kind === 'cliff-top').length} end on a cliff top (${Math.min(...footpaths.filter((f) => f.end.kind === 'cliff-top').map((f) => f.end.z))} to ${Math.max(...footpaths.filter((f) => f.end.kind === 'cliff-top').map((f) => f.end.z))} px over the sea), ${footpaths.filter((f) => f.end.kind === 'meadow').length} on a meadow; ${DECKS.length} of the ${T.footpaths} have a deck of ground art (T11: planks and a rail on three sides, drawn in every tier), the lookout prop is a bench and a telescope on it`, cause: 'js/world/layout.js (LAYOUT.decks), js/world/groundart.js (the deck), js/world/yard.js (the bench and the telescope)' },
    { id: 'R5', name: 'a road meets its block street off the axis', count: kinked.length, detail: kinked.map((k) => `${k.edge} at ${k.port}: ${k.headingErrorAt1_5} degrees at 1.5 tiles, ${k.lateralAt1} tile off the axis at 1 tile`).join('; '), cause: 'js/world/island.js (the via list of 10.W > 11.E contains its own port 11.E, so after tidy() the last leg arrives on a diagonal; the path 14.N > v5 starts inside the block)' },
    { id: 'R6', name: 'a locked road with no barrier on it', count: closedUnmarked.length, detail: closedUnmarked.map((c) => c.road).join(', '), cause: 'js/world/layout.js (until WP11 a district got ONE gate prop, on the first road whose gate is its id, ten tiles before the district; the other roads into it, and every road that opens with a later district, stood open-looking; now every locked road has its gate at its open end)' },
    { id: 'R7', name: 'a road leaves a block with no apron at the port: the street and the road beyond it meet in one cut', count: noApron.length, of: connected.length, detail: noApron.length ? `${noApron.length} of the ${connected.length} ports where a road leaves have no apron (${noApron.map((q) => q.id).join(', ')}): the block's asphalt changes tone and width in one straight cut across the road, the sidewalk and the kerb stop, the stage's rim and shadow run across the mouth` : `every one of the ${connected.length} ports where a road leaves has its apron (roadshape.js APRON: 2 tiles beyond the block's edge in which the street's asphalt narrows from 2 to 1.6 and takes the road's tone, the sidewalk tapers to nothing, the kerb stays a flat fifth, the road's dashes go on; it starts 0.1 tile under the edge)`, cause: 'js/world/groundart.js (drawAprons: WP10; until then drawStage in js/world/groundmat.js painted over the road end), js/world/roadshape.js (apronPieces)' },
    { id: 'R8', name: 'cars vanish at the port, never enter a district, overlap at forks', count: T.roadEdges, detail: traffic ? `one car a road (${traffic.cars}), none in a block (0 of ${traffic.measuredTenMinutes.carSamples} samples), ${Math.round(traffic.measuredTenMinutes.shareOfCarFramesNotFullyVisible * 100)}% of car frames not fully visible, ${traffic.measuredTenMinutes.framesWithTwoVisibleCarsCloserThan1_1Tiles} frames in ten minutes with two visible cars within 1.1 tiles (at forks), none at all while only district 1 is open` : 'one car a road, none in a block, a fade over min(6, len/4) tiles at both ends of every road (measured in full mode)', cause: 'js/world/ents-actors.js (cars(): one car a road, a lane of the road\'s own polyline, a lap, a fade at both ends)' },
    { id: 'R9', name: 'a bridge in two runs', count: bridges.filter((b, i) => bridges.some((c, j) => j !== i && c.road === b.road && Math.abs(c.s0 - b.s1) < BRIDGE_TOUCH)).length, detail: 'a road that crosses the water in two runs with a sandbar of a tile or less between them is drawn as two bridges with their own posts and piers (8.W > 9.E was: 5.5 and 1.0 tiles, touching at s = 22); layout.js BRIDGE_GAP joins them', cause: 'js/world/layout.js (a run ended at the first dry half-tile sample)' },
    { id: 'R10', name: 'two roads cross with no junction', count: crossings.length, detail: crossings.map((c) => `${c.a} x ${c.b} at (${c.at.gx}, ${c.at.gy}), ${c.angle} degrees`).join('; '), cause: 'js/world/island.js (4.E > 3.N via (76, 92) and 4.E > 5.W via (78, 92) share a stem and then cross)' },
    { id: 'R11', name: 'a road runs through another district\'s ground', count: through.length, detail: through.map((t) => `${t.road} through district ${t.district}'s footprint for ${t.tilesInFootprint} tiles`).join('; '), cause: 'js/world/island.js (6.N > 7.E via (168, 70) and (158, 68) follows the south pad of district 8)' },
    { id: 'R12', name: 'scatter props stand in front of a street end, unrelated to any street', count: scatterInStrip, of: ends.length, detail: 'the pad is filled by a per-theme hash scatter at 0.045 props a tile that keeps off roads but not off a street\'s extension (14 silos in the pad of Farmland, 12 LIVE billboards and 9 spotlights in the pad of Creative Quarter); a termination keeps its room clear of it (layout.js prunes the pad props that stand in a termination\'s room)', cause: 'js/world/layout.js (the pad scatter), js/world/kits.js (FILL)' },
  ];
  defectClasses.sort((a, b) => +a.id.slice(1) - +b.id.slice(1));

  let head = ''; try { head = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { head = 'unknown'; }
  const catalog = {
    meta: { script: 'scripts/lib/road-audit.mjs', mode: full ? 'full' : 'fast', checkout: root, head, grid: { GW, GH, BW, BD }, road: { width: 2, half: 1, laneOffset: Act?.LANE, filletRadius: Lay.ROAD_RADIUS, pathWidth: 1 }, roads: roads.length, footpaths: paths.length, ferries: ferries.length, definitions: {
      deadEnd: 'a port (the middle of a block side, where a block street meets the block edge) that no road or ferry leaves: the block street runs to the plateau edge and stops',
      seam: 'two different edges whose centre lines are closer than the sum of their half widths (2.0 road-road, 1.5 road-footpath) for at least 1 tile',
      coincident: 'a seam whose mean separation is under 0.2 tile: the same stem drawn twice',
      footpathOverAsphalt: 'footpath samples within (road half width + footpath half width) = 1.5 tiles of a road centre line' } },
    scope, defectClasses, counts, edges: edgeTable, cliffEdgeRuns, deadEnds, terminations, gatesAwayFromOpenEnd: gatesFar, plateauEdges, ...(full ? { connectorsProposed: connectors } : {}), joints, jointsWithAKink: kinked, ports, seams, crossings, footpaths, throughOtherDistricts: through, bridges, authoringNotes: authoring, lockedEntries, lockedRoadsWithNoBarrier: closedUnmarked,
    ...(full ? { connectivity, traffic } : {}),
  };
  catalog.ratchet = ratchetCounts(catalog);
  return catalog;
}
