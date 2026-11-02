// The roads between the districts, as geometry (js/world/island.js is the hand-authored plan, js/world/layout.js turns it into polylines and ground, js/world/roadshape.js is the arithmetic). A recording of the live site
// and a close look at every road found: corners that were sharp (the dashes of a bend came out as arrows, a car jumped sideways at one), a footpath that ran out over the lake to a lookout standing on the water,
// and steps in the ground under the road (10 world pixels in half a tile at the cliff before a bridge) that read as a road cut off.
import test from 'node:test';
import assert from 'node:assert/strict';

const { LAYOUT, EDGES, zAt, roadZ, polyAt } = await import('../js/world/layout.js');
const { VIEWPOINTS, ROADS } = await import('../js/world/island.js');
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

test('the ends of every road are the ports and lookouts they were drawn between: rounding the corners moves nothing else', () => {
  const planned = (r) => { const A = LAYOUT.nodes.get(r.a), B = LAYOUT.nodes.get(r.b); return [A, B]; };
  for (const e of EDGES) { const [A, B] = planned(e), p0 = e.pts[0], p1 = e.pts.at(-1); assert.ok(Math.hypot(p0[0] - A[0], p0[1] - A[1]) < 1e-6 && Math.hypot(p1[0] - B[0], p1[1] - B[1]) < 1e-6, name(e) + ' starts and ends where it was drawn to'); }
  assert.equal(EDGES.length, ROADS.length, 'and none was lost');
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
    const nearWater = [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5]].some(([dx, dy]) => !LAYOUT.isLand(Math.floor(p.x + dx), Math.floor(p.y + dy))); if (nearWater) continue;
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
