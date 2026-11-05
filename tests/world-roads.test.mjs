// The roads between the districts, as geometry (js/world/island.js is the hand-authored plan, js/world/layout.js turns it into polylines and ground, js/world/roadshape.js is the arithmetic). A recording of the live site
// and a close look at every road found: corners that were sharp (the dashes of a bend came out as arrows, a car jumped sideways at one), a footpath that ran out over the lake to a lookout standing on the water,
// and steps in the ground under the road (10 world pixels in half a tile at the cliff before a bridge) that read as a road cut off.
import test from 'node:test';
import assert from 'node:assert/strict';

const { LAYOUT, EDGES, zAt, roadZ, polyAt, polyInfo } = await import('../js/world/layout.js');
const { VIEWPOINTS, ROADS, JUNCTIONS, HEADS } = await import('../js/world/island.js');
const { fillet } = await import('../js/world/roadshape.js');

const STEP = 0.5;
/** An edge sampled every half tile: [{ x, y, s, dx, dy, z, wet }]. */
const samples = (e) => { const out = []; for (let s = 0; s <= e.len + 1e-6; s += STEP) { const p = polyAt(e, Math.min(s, e.len)); out.push({ x: p.x, y: p.y, s, dx: p.dx, dy: p.dy, z: zAt(p.x, p.y), wet: !LAYOUT.isLand(Math.floor(p.x), Math.floor(p.y)) }); } return out; };
/** The height a road is drawn at: its graded surface, and over a bridge the deck. */
const surface = (e, p) => (inBridge(e, p.s) ? p.z : roadZ(e, p.s));
const inBridge = (e, s) => LAYOUT.bridges.some((b) => b.edge === e && s >= b.s0 - 1e-6 && s <= b.s1 + 1e-6);
const deg = (a, b) => { let d = Math.abs(Math.atan2(a.dy, a.dx) - Math.atan2(b.dy, b.dx)); if (d > Math.PI) d = 2 * Math.PI - d; return (d * 180) / Math.PI; };
const road = (e) => !e.ferry;
const name = (e) => `${e.a} -> ${e.b}`;

test('fillet: a corner becomes an arc that leaves and joins its two legs along them, the ends are kept, and a straight line is left alone', () => {
  const sq = fillet([[0, 0], [10, 0], [10, 10]], 2);
  assert.deepEqual(sq[0], [0, 0]); assert.deepEqual(sq.at(-1), [10, 10]);
  assert.ok(sq.length > 6, 'the corner has points of its own');
  assert.ok(sq.every(([x, y]) => x <= 10 + 1e-9 && y >= -1e-9), 'it stays inside the corner it rounds');
  assert.ok(sq.some(([x, y]) => Math.abs(y) < 1e-9 && x > 7.9 && x < 8.1), 'it leaves the first leg two tiles before the corner (a radius of 2 on a right angle)');
  const near = sq.filter(([x, y]) => x > 8 && y < 2).map(([x, y]) => Math.hypot(x - 8, y - 2));
  assert.ok(near.every((d) => Math.abs(d - 2) < 0.06), 'and the arc is round, of that radius');
  assert.deepEqual(fillet([[0, 0], [5, 0], [10, 0]], 2), [[0, 0], [5, 0], [10, 0]], 'a straight line has no corner to round');
  assert.deepEqual(fillet([[0, 0], [3, 0]], 2), [[0, 0], [3, 0]], 'two points are a line');
  const tight = fillet([[0, 0], [1, 0], [1, 1]], 5); assert.ok(tight.every(([x, y]) => x >= -1e-9 && x <= 1 + 1e-9 && y >= -1e-9 && y <= 1 + 1e-9), 'a radius too big for the legs is cut to what they allow');
});

test('every road and footpath bends in arcs: the heading changes by at most 40 degrees between samples half a tile apart (a sharp corner is 90 in one, a hairpin 150)', () => {
  const worst = [];
  for (const e of EDGES.filter(road)) { const S = samples(e); let w = 0, at = 0; for (let i = 2; i < S.length; i++) { const d = deg(S[i - 1], S[i]); if (d > w) { w = d; at = S[i].s; } } if (w > 40) worst.push(`${name(e)}: ${w.toFixed(0)} degrees at s=${at}`); }
  assert.deepEqual(worst, []);
});

test('the ends of every road are the ports, junctions, path heads and lookouts they were drawn between (a junction and a head are names like a port: the layout knows them): rounding the corners moves nothing else', () => {
  const planned = (r) => { const A = LAYOUT.nodes.get(r.a), B = LAYOUT.nodes.get(r.b); return [A, B]; };
  for (const e of EDGES) { const [A, B] = planned(e), p0 = e.pts[0], p1 = e.pts.at(-1); assert.ok(A && B, name(e) + ' is drawn between two places the layout knows'); assert.ok(Math.hypot(p0[0] - A[0], p0[1] - A[1]) < 1e-6 && Math.hypot(p1[0] - B[0], p1[1] - B[1]) < 1e-6, name(e) + ' starts and ends where it was drawn to'); }
  assert.equal(EDGES.length, ROADS.length, 'and none was lost');
  for (const [j, { at }] of Object.entries(JUNCTIONS || {})) { assert.deepEqual(LAYOUT.nodes.get(j), at, j + ' is where island.js puts it'); assert.equal(EDGES.filter((e) => e.a === j || e.b === j).length, 3, j + ' is where three edges meet'); }
  for (const [h, { at }] of Object.entries(HEADS || {})) { assert.deepEqual(LAYOUT.nodes.get(h), at, h + ' is where island.js puts it'); assert.equal(EDGES.filter((e) => e.a === h || e.b === h).length, 1, h + ' is the start of one footpath'); }
});

test('no road or footpath runs over water except on its bridge (the footpath to the third lookout ran 16 samples out over the lake)', () => {
  const wet = [];
  for (const e of EDGES.filter(road)) { const n = samples(e).filter((p) => p.wet && !inBridge(e, p.s)).length; if (n) wet.push(`${name(e)}: ${n} samples on water`); }
  assert.deepEqual(wet, []);
});

test('a road is drawn at a graded height: its surface changes by at most 2 world pixels between samples half a tile apart (10 at the cliff before the bridge to the ninth district, and the ground dipped at every bank), a bridge deck apart', () => {
  const steep = [];
  for (const e of EDGES.filter(road)) { const S = samples(e); let w = 0, at = 0; for (let i = 1; i < S.length; i++) { if (inBridge(e, S[i].s) || inBridge(e, S[i - 1].s)) continue; const d = Math.abs(surface(e, S[i]) - surface(e, S[i - 1])); if (d > w) { w = d; at = S[i].s; } } if (w > 2) steep.push(`${name(e)}: ${w.toFixed(1)} px at s=${at}`); }
  assert.deepEqual(steep, []);
});

test('the ground under a road follows the road: away from the water it is within 2.5 pixels of the road\'s surface (a road does not float over a cliff or sink into a hill)', () => {
  const off = [];
  for (const e of EDGES.filter(road)) for (const p of samples(e)) {
    if (inBridge(e, p.s) || p.wet) continue;
    const nearWater = [[-2, 0], [2, 0], [0, -2], [0, 2], [-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]].some(([dx, dy]) => !LAYOUT.isLand(Math.floor(p.x + dx), Math.floor(p.y + dy))); if (nearWater) continue; // (two tiles on the axes and a tile and a half on the diagonals: the ground at a bank dips or climbs, and which half tile of the road the samples land on is no business of the test)
    const d = Math.abs(p.z - roadZ(e, p.s)); if (d > 2.5) off.push(`${name(e)} s=${p.s}: ground ${p.z.toFixed(1)} against road ${roadZ(e, p.s).toFixed(1)}`);
  }
  assert.deepEqual(off.slice(0, 6), []);
});

test('a road enters its district without a step: the ground at the port and one tile inside the block differ by at most 1.5 pixels', () => {
  for (const e of EDGES.filter((q) => road(q) && !q.path)) for (const [pt, port] of [[e.pts[0], e.a], [e.pts.at(-1), e.b]]) {
    const id = Number(port.split('.')[0]), D = LAYOUT.districts[id]; if (!D) continue;
    const dx = D.cx - pt[0], dy = D.cy - pt[1], l = Math.hypot(dx, dy) || 1, inside = [pt[0] + (dx / l), pt[1] + (dy / l)];
    assert.ok(Math.abs(zAt(pt[0], pt[1]) - zAt(inside[0], inside[1])) <= 1.5, `${name(e)} at ${port}: ${zAt(pt[0], pt[1]).toFixed(1)} against ${zAt(inside[0], inside[1]).toFixed(1)} one tile in`);
  }
});

test('every lookout stands on dry ground that is level under its platform (a footprint of a tile and four fifths): land at its centre and corners, and the ground within 4 pixels', () => {
  for (const [id, [x, y]] of Object.entries(VIEWPOINTS)) {
    for (const [dx, dy] of [[0, 0], [-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) assert.ok(LAYOUT.isLand(Math.floor(x + dx), Math.floor(y + dy)), `${id}: land at ${dx},${dy} from it`);
    const zs = [[0, 0], [0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]].map(([dx, dy]) => zAt(x + dx, y + dy)); assert.ok(Math.max(...zs) - Math.min(...zs) < 4, `${id}: the ground under its platform is level (${zs.map((v) => v.toFixed(1)).join(', ')})`);
  }
});

test('a bridge is straight over the water: its deck turns by at most 12 degrees from one bank to the other', () => {
  for (const b of LAYOUT.bridges) { const e = b.edge; let w = 0; for (let s = b.s0 + STEP; s <= b.s1; s += STEP) w = Math.max(w, deg(polyAt(e, s - STEP), polyAt(e, s))); assert.ok(w <= 12, `${name(e)}: the deck turns ${w.toFixed(0)} degrees between two samples`); }
});

// ---------------------------------------------------------------------------------------------------------------- the world pass WP10: one road surface (the data half; tests/world-roadsurface.test.mjs paints it)
const JUNC = JUNCTIONS || {}, OUT = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };
const nearestOn = (e, x, y) => { let best = Infinity; for (let i = 0; i + 1 < e.pts.length; i++) { const [ax, ay] = e.pts[i], [bx, by] = e.pts[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)); best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t)); } return best; };
const nameOf = (e) => `${e.a} > ${e.b}`;

test('a fork is a node: three edges meet at each junction, a stem straight out of its port for 3 to 6 tiles and two branches that part by 35 degrees or more and overlap no further than 3.5 tiles from the node, the three roads at one height there', () => {
  assert.deepEqual(Object.keys(JUNC), ['j4', 'j8', 'j12'], 'three forks: the road from 4 to 3 and 5, from 7 and 9 to 8, from 11 and 13 to 12');
  for (const j of Object.keys(JUNC)) {
    const { port, at } = JUNC[j], es = EDGES.filter((e) => e.a === j || e.b === j), stem = es.find((e) => e.stem), branches = es.filter((e) => !e.stem);
    assert.equal(es.length, 3, j + ' joins three edges'); assert.ok(stem && branches.length === 2, 'a stem and two branches');
    assert.equal(stem.a, port, 'the stem leaves the port the fork is of'); assert.equal(stem.b, j);
    assert.ok(stem.len >= 3 && stem.len <= 6, `the node is 3 to 6 tiles out (${stem.len.toFixed(1)})`);
    const D = LAYOUT.districts[+port.split('.')[0]], [ux, uy] = OUT[port.split('.')[1]], [x0, y0] = D.ports[port.split('.')[1]];
    for (const [x, y] of stem.pts) assert.ok(Math.abs((x - x0) * uy - (y - y0) * ux) < 1e-6 && (x - x0) * ux + (y - y0) * uy > -1e-6, 'the stem runs straight out of the port along the street\'s axis');
    assert.deepEqual(stem.pts.at(-1), at, 'and ends at the node');
    for (const b of branches) assert.deepEqual(b.a === j ? b.pts[0] : b.pts.at(-1), at, nameOf(b) + ' meets the node');
    const [A, B] = branches, dir = (e) => { const p = polyAt(e, e.a === j ? 3 : e.len - 3); return Math.atan2(p.y - at[1], p.x - at[0]); };
    let ang = Math.abs(dir(A) - dir(B)) * 180 / Math.PI; if (ang > 180) ang = 360 - ang;
    assert.ok(ang >= 35, `${j}: the branches part by ${ang.toFixed(0)} degrees at 3 tiles out`);
    let far = 0; for (let s = 0; s <= A.len; s += 0.1) { const p = polyAt(A, s); if (nearestOn(B, p.x, p.y) < 2.0) far = Math.max(far, Math.hypot(p.x - at[0], p.y - at[1])); }
    assert.ok(far <= 3.5, `${j}: the two branches overlap ${far.toFixed(1)} tiles out from the node at most`);
    const z = (e) => roadZ(e, e.a === j ? 0 : e.len); assert.ok(Math.max(...es.map(z)) - Math.min(...es.map(z)) < 0.5, `${j}: the three roads are at one height at the node (${es.map((e) => z(e).toFixed(1)).join(', ')})`);
  }
});

test('the footpaths that left a road start from path heads two tiles to its side and keep 1.5 tiles from every road all the way; the footpath of 14 starts outside its block', () => {
  assert.deepEqual(Object.keys(HEADS || {}), ['h1', 'h2', 'h6'], 'three footpaths leave a road: the lookouts of 10, 3 and 4');
  const roads = EDGES.filter((e) => !e.path && !e.ferry);
  for (const [h, { at, port }] of Object.entries(HEADS || {})) {
    const path = EDGES.filter((e) => e.path && e.a === h); assert.equal(path.length, 1, h + ' starts one footpath');
    const near = Math.min(...roads.map((r) => nearestOn(r, at[0], at[1])));
    assert.ok(Math.abs(near - 2.0) < 0.05, `${h} is 2.0 tiles from the nearest road's middle line (${near.toFixed(2)})`);
    assert.ok(Math.hypot(at[0] - LAYOUT.nodes.get(port)[0], at[1] - LAYOUT.nodes.get(port)[1]) <= 5, `${h} stands beside ${port}`);
  }
  for (const e of EDGES.filter((q) => q.path)) for (let s = 0; s <= e.len; s += 0.25) { const p = polyAt(e, s), d = Math.min(...roads.map((r) => nearestOn(r, p.x, p.y))); assert.ok(d >= 1.5, `${nameOf(e)} at ${s}: ${d.toFixed(2)} tiles from a road's middle line (a path is 1 wide, a road 2: they touch at 1.5)`); }
  const D14 = LAYOUT.districts[14], v5 = EDGES.find((e) => e.b === 'v5');
  assert.ok(v5.pts.every(([, y]) => y <= D14.oy + 1e-6) && v5.pts.at(-1)[1] < D14.oy - 1, 'the footpath of 14 runs from its port north, out of the block, to its lookout');
});

test('a bridge is one run to a crossing and at least 3 tiles: 8.W to 9.E is one bridge (a sandbar of a tile between two wet stretches did not end the first and start another)', () => {
  const by = new Map(); for (const b of LAYOUT.bridges) (by.get(b.edge) || by.set(b.edge, []).get(b.edge)).push(b);
  assert.equal(LAYOUT.bridges.length, 3, 'three crossings: the river at 3 to 5, the mouth of the river at 8 to 9, the river at 4 to 5');
  for (const [e, bs] of by) { bs.sort((a, b) => a.s0 - b.s0); for (let i = 0; i < bs.length; i++) { assert.ok(bs[i].s1 - bs[i].s0 >= 3, `${nameOf(e)}: a bridge of ${(bs[i].s1 - bs[i].s0).toFixed(1)} tiles`); if (i) assert.ok(bs[i].s0 - bs[i - 1].s1 > 1.5, `${nameOf(e)}: two bridges ${(bs[i].s0 - bs[i - 1].s1).toFixed(1)} tiles apart`); } }
  const nine = LAYOUT.bridges.filter((b) => b.edge.b === '9.E'); assert.equal(nine.length, 1, 'one bridge from 8 to 9'); assert.ok(nine[0].s1 - nine[0].s0 >= 6, 'and it covers both stretches of water (' + (nine[0].s1 - nine[0].s0).toFixed(1) + ' tiles)');
  for (const e of EDGES.filter((q) => !q.path && !q.ferry)) for (let s = 0; s <= e.len; s += 0.25) { const p = polyAt(e, s); if (LAYOUT.isLand(Math.floor(p.x), Math.floor(p.y))) continue; assert.ok(LAYOUT.bridges.some((b) => b.edge === e && s >= b.s0 - 1e-6 && s <= b.s1 + 1e-6), `${nameOf(e)} runs over water at ${s} with no bridge under it`); }
});

test('the gate of a district stands ten tiles from its port along the road in, through a fork too (the stem counts in the ten)', () => {
  const portOf = (n) => (JUNC[n] ? JUNC[n].port : n);
  for (const id of [4, 8, 9, 12, 13]) {
    const D = LAYOUT.districts[id], g = D.gateAt, e = EDGES[g.edge]; assert.ok(e && e.gate === id && !e.stem && !e.path, `district ${id}: the gate is on a road that opens with it, not on a stem`);
    if (D.gateKind !== 'barrier') continue;
    // the road in, as a line from the district's port outward: the edge of its gate from its end at the district (or at the fork), with the stem in front of it where the road comes to a fork
    const atA = portOf(e.a).startsWith(id + '.'), outward = atA ? e.pts : [...e.pts].reverse(), node = atA ? e.a : e.b, stem = JUNC[node] ? EDGES.find((q) => q.stem && q.b === node) : null;
    const walk = polyInfo(stem ? [...stem.pts, ...outward.slice(1)] : outward), q = polyAt(walk, 10);
    assert.ok(Math.hypot(q.x - g.x, q.y - g.y) < 0.35, `district ${id}: the gate (${g.x.toFixed(1)}, ${g.y.toFixed(1)}) stands ten tiles out from the port along the road in (${q.x.toFixed(1)}, ${q.y.toFixed(1)})`);
  }
  assert.equal(LAYOUT.districts[8].entryPort, '8.W'); assert.equal(LAYOUT.districts[12].entryPort, '12.N'); assert.equal(LAYOUT.districts[9].entryPort, '9.E');
  const w = LAYOUT.nodes.get('8.W'); assert.ok(Math.hypot(LAYOUT.districts[8].entry[0] - (w[0] + 0.8), LAYOUT.districts[8].entry[1] - w[1]) < 1e-9, 'a buyer comes in at the port of the district, 0.8 tile inside it, not at the node');
});
