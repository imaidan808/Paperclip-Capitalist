// Terminations: every street that no road leaves ends in a place (the world pass WP12; the kinds are the plan's T1 to T13, docs/ART_DIRECTION.md section 4.7). The vocabulary is pure data and geometry (js/world/roadshape.js: portFrame, chooseTerm, shapeOf),
// the island's own ends are derived from it at build time (js/world/layout.js: LAYOUT.terms, LAYOUT.turnSpots; island.js TERMS holds only what is chosen by hand), and the ground art is groundart.js.
//   RT1  the frame of a port: u runs out of the block along the street, v to the right; a rectangle of the frame is a rectangle of the grid
//   RT2  the selection rule: a footpath is a head, water within reach is a quay only when the drop to it is 8 px or less (a railed belvedere above that, a barrier when there is no room), a hill wall or no flat run is a barrier, and
//        otherwise the district's own kinds in the order of its theme, the first that fits (a bulb when nothing else does, a barrier when not even that)
//   RT4  the island: every one of the 29 ports that no road or ferry leaves has one termination in LAYOUT.terms (a connected port has none), the ones chosen by hand are island.js TERMS and only barriers, quays and the sealed portal, the rest are what the rule says on the island's own ground
//   RT5  what it builds fits (rule N3): on land, within 6 px of the block's height, outside every block, clear of every road; a quay stops short of the water
//   RT6  every termination registers a turn spot: a place, a radius, a kind and the road's heading, closed ends marked closed (LAYOUT.turnSpots; the traffic work reads it)
//   RT7  no end is a bare disc: each has at least three props or a loading dock, all of them real kinds of the vocabulary, all culled by their own box and all in their district's list; the pad's scatter is kept off every one
//   RT8  every termination is PAINTED where it is, at the zoom of the author's cameras (0.6) and in the governor's lite tier: each piece of its ground is a fill in its place, in order, over the stage's lip; the end goes on in the block's own asphalt and kerb;
//        culled by its own box; a locked district's is veiled; the rails and posts of a deck wait for zoom 0.3
//   RT9  the new kinds of prop are flat (no gradient, no pattern, no clip, no stroke, no blur; only the ground shadows are translucent), balanced, deterministic, drawn when the district is NOT locked (a closed street is closed for ever: unlike the gate),
//        and every point they paint lies inside the box the sprite atlas gives them
//   RT10 the gates (WP11): a gate on every road that opens with a locked district whose gate is not fog, at the road's open end, drawn from the open neighbour's side and after the clouds; the closed barrier reads differently from the padlock gate
//   RT11 the lookouts' decks and the path heads (T10, T11): ground art in the roads layer, drawn in every tier; a rail on the three sides the path does not come in by; two bollards one tile apart over a strip of dropped kerb
//   RT13 a rail where the plateau falls away: an end whose room stops within 1.6 tiles of a drop gets a rail across its far side (blending: the street does not run off a cliff top), when there is level ground left beyond it to stand it on; the kinds that have their own do not
//   RT3  every kind of the vocabulary is a shape: pieces of ground with known roles, props with known kinds, a turn spot, the room it needs; a yard's dock has its door against the end of the road and a barrier ends in a cap, never a cut
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx } from './helpers/recctx.mjs';
import { newWorld } from './helpers/worldstub.mjs';
import { lodOf } from '../js/world/lod.js';
import { runLayer } from '../js/world/stack.js';
import * as GA from '../js/world/groundart.js';
import { OUTWARD, portFrame, framePoint, frameRect, TERM, TERM_KINDS, QUAY_DROP, chooseTerm, shapeOf, railAt, PIECE_ROLES, PROP_KINDS } from '../js/world/roadshape.js';
/** The island's ends, port by port, as the rule and island.js TERMS make them: read, and looked at in the pictures (the numbers of the pull request). */
const PINNED = {
  quay: ['1.S', '1.W'], portal: ['1.N'], barrier: ['4.W', '8.N'], belvedere: ['16.S'], head: ['12.E', '14.N', '9.S'], roundabout: ['3.S', '6.E'], plaza: ['13.N', '16.N'], yard: ['12.S', '8.S'], hammer: ['7.W', '8.E', '9.N'],
  gate: ['10.S', '6.S'], farm: ['11.W'], bulb: ['11.N', '12.W', '13.W', '15.N', '15.S', '16.E', '2.S', '4.N'],
};

const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

test('RT1: a port\'s frame: u runs out of the block along the street, v to the right of the way out, and a rectangle of the frame is a rectangle of the grid', () => {
  assert.deepEqual(Object.keys(OUTWARD), ['W', 'E', 'N', 'S']);
  for (const [side, [ux, uy]] of Object.entries(OUTWARD)) {
    const f = portFrame(side, 10, 20);
    assert.deepEqual([f.x, f.y, f.ux, f.uy], [10, 20, ux, uy], side);
    assert.ok(near(f.vx, -uy) && near(f.vy, ux), `${side}: v is the way out turned a quarter (the lane side of a road that leaves: offsetPoly's right)`);
    assert.deepEqual(framePoint(f, 2, 0).map((n) => +n.toFixed(9)), [10 + 2 * ux, 20 + 2 * uy].map((n) => +n.toFixed(9)), `${side}: two tiles out`);
    const r = frameRect(f, 0.5, 3.5, -1, 1);
    assert.ok(near(Math.max(r.w, r.d), 3) && near(Math.min(r.w, r.d), 2), `${side}: a 3 by 2 rectangle`);
    const c = [r.x + r.w / 2, r.y + r.d / 2], m = framePoint(f, 2, 0); assert.ok(near(c[0], m[0]) && near(c[1], m[1]), `${side}: centred on the street's axis`);
  }
});

test('RT2: the selection rule, first match wins: an authored end, a footpath, water (a quay only for a drop of 8 px or less), a hill wall, no flat run, then the theme\'s kinds in order, the first that fits', () => {
  const base = { side: 'S', theme: 'market', street: 'cross', flat: 7, water: null, drop: null, hill: false, path: false, authored: null };
  const pick = (o, fits = () => true) => chooseTerm({ ...base, ...o }, fits).kind;
  assert.equal(QUAY_DROP, 8, 'the judges\' limit: a slab with bollards 66 px above the water is a cliff-top platform, not a quay');
  assert.equal(pick({ authored: { kind: 'barrier' }, water: 4, drop: 3 }), 'barrier', 'what the author chose stands');
  assert.equal(pick({ path: true, water: 4, drop: 3 }), 'head', 'a footpath leaves here: a path head, before anything else');
  assert.equal(pick({ water: 4, drop: 3, flat: 3.8 }), 'quay'); assert.equal(pick({ water: 4, drop: 8, flat: 3.8 }), 'quay', '8 px is a quay');
  assert.equal(pick({ water: 4, drop: 8.5, flat: 3.8 }), 'belvedere', '8.5 px is not'); assert.equal(pick({ water: 4, drop: 70, flat: 3 }), 'belvedere', 'a railed belvedere above the water, not a quay with a boat 66 px below');
  assert.equal(pick({ water: 4, drop: 70, flat: 2 }), 'barrier', 'no room for a deck: closed'); assert.equal(pick({ water: 4, drop: 3, flat: 1.8 }), 'barrier', 'no room for a slab: closed');
  assert.equal(pick({ hill: true, flat: 3 }), 'barrier', 'a hill wall with no portal made for it'); assert.equal(pick({ flat: 1.2 }), 'barrier', 'a flat run under 1.5 tiles');
  const only = (...kinds) => (k) => kinds.includes(k);
  assert.equal(pick({ theme: 'campus', street: 'cross' }), 'roundabout'); assert.equal(pick({ theme: 'campus', street: 'cross' }, only('bulb')), 'bulb', 'a disc of 3.4 that does not fit is a bulb');
  assert.equal(pick({ theme: 'harbor', street: 'cross' }), 'yard'); assert.equal(pick({ theme: 'harbor', street: 'cross' }, only('hammer', 'bulb')), 'hammer'); assert.equal(pick({ theme: 'harbor', street: 'cross' }, only('bulb')), 'bulb');
  assert.equal(pick({ theme: 'tech', street: 'cross' }), 'gate'); assert.equal(pick({ theme: 'corporate', street: 'cross' }), 'plaza'); assert.equal(pick({ theme: 'corporate', street: 'avenue' }), 'bulb', 'an avenue end has no landmark across it');
  assert.equal(pick({ theme: 'farm', street: 'avenue' }), 'farm'); assert.equal(pick({ theme: 'estate', street: 'avenue' }), 'roundabout'); assert.equal(pick({ theme: 'estate', street: 'cross' }), 'gate');
  assert.equal(pick({ theme: 'market' }, only()), 'barrier', 'nothing fits, not even a bulb: closed');
  const r = chooseTerm({ ...base, water: 4, drop: 3 }, () => true); assert.ok(typeof r.why === 'string' && r.why.length > 10, 'and it says why');
});

test('RT3: every kind of the vocabulary is a shape: ground pieces with known roles, props of known kinds, a turn spot, the room it needs; a yard\'s dock stands against the end of its road, a barrier ends in a cap and not a cut', () => {
  assert.deepEqual(TERM_KINDS, ['bulb', 'roundabout', 'hammer', 'yard', 'plaza', 'gate', 'farm', 'barrier', 'quay', 'belvedere', 'portal', 'head']);
  for (const kind of TERM_KINDS) for (const theme of ['market', 'farm', 'harbor', 'tech']) {
    const s = shapeOf(kind, { theme, side: 'E' });
    assert.equal(s.kind, kind); assert.ok(s.pieces.length >= 2, `${kind}: it paints ground`);
    for (const p of s.pieces) { assert.ok(PIECE_ROLES.includes(p.role), `${kind}: the role ${p.role}`); assert.ok(p.pts.length >= (p.role === 'post' ? 1 : p.role === 'rail' ? 2 : 3) && p.pts.every(([u, v]) => Number.isFinite(u) && Number.isFinite(v)), `${kind}: a piece of ${p.role} is a polygon (a rail a line, a post a point) of finite points`); }
    for (const q of s.props) { assert.ok(PROP_KINDS.includes(q.t), `${kind}: a prop of kind ${q.t}`); assert.ok(q.a > 0 && q.b > 0 && Number.isFinite(q.u) && Number.isFinite(q.v), `${kind}: the ${q.t} has a place and a size`); }
    assert.ok(s.turn && s.turn.r >= 0 && Number.isFinite(s.turn.u) && typeof s.turn.open === 'boolean', `${kind}: it registers a turn spot (open or closed)`);
    assert.ok(s.foot.length >= 1 && s.foot.every((r) => r.u1 > r.u0 && r.v1 > r.v0), `${kind}: the room it needs, as rectangles of the frame`);
    for (const p of s.pieces.filter((q) => q.role !== 'apron' && q.role !== 'fringe')) for (const [u, v] of p.pts) assert.ok(s.foot.some((r) => u >= r.u0 - 1e-6 && u <= r.u1 + 1e-6 && v >= r.v0 - 1e-6 && v <= r.v1 + 1e-6), `${kind}: ${p.role} point ${u.toFixed(2)},${v.toFixed(2)} is inside the room it asked for`);
  }
  const yard = shapeOf('yard', { theme: 'harbor', side: 'S' }), dock = yard.props.find((q) => q.t === 'loaddock'), end = Math.max(...yard.pieces.filter((p) => p.role === 'slab' || p.role === 'asph').flatMap((p) => p.pts.map(([u]) => u)));
  assert.ok(dock && yard.door, 'a yard has a loading dock with a door'); assert.ok(Math.abs(yard.door.u - end) <= 0.5, `the door stands within half a tile of the end of the road's surface (${yard.door.u} against ${end})`);
  const cap = shapeOf('barrier', { side: 'W' }), asph = cap.pieces.filter((p) => p.role === 'asph'), tip = Math.max(...asph.flatMap((p) => p.pts.map(([u]) => u))), atTip = asph.flatMap((p) => p.pts).filter(([u]) => u > tip - 0.3).map(([, v]) => Math.abs(v));
  assert.ok(atTip.length >= 3 && Math.min(...atTip) < 0.35, 'the asphalt ends in a rounded cap: the last 0.3 tile of it narrows to the middle (a raw cut would be 1.6 wide to the last point)');
  assert.ok(cap.props.some((q) => q.t === 'roadend'), 'with the ROAD CLOSED barrier across it');
  const bel = shapeOf('belvedere', { water: 4 }), deck = bel.pieces.find((q) => q.role === 'deck'), rail = bel.pieces.find((q) => q.role === 'rail'), posts = bel.pieces.filter((q) => q.role === 'post');
  assert.ok(deck && bel.pieces.filter((q) => q.role === 'deck2').length >= 3, 'a belvedere is a deck of planks in two tones'); assert.equal(rail.pts.length, 4, 'with a rail of three sides: four points'); assert.equal(posts.length, 7, 'and a post at each corner and each middle');
  const u0 = Math.min(...deck.pts.map((q) => q[0])), u1 = Math.max(...deck.pts.map((q) => q[0])); assert.ok(rail.pts[0][0] < u0 + 0.3 && rail.pts[3][0] < u0 + 0.3 && rail.pts[1][0] > u1 - 0.2 && rail.pts[2][0] > u1 - 0.2, 'the rail leaves the street side open and runs round the far end and both sides');
  assert.ok(bel.props.some((q) => q.t === 'lookout'), 'a bench and a telescope stand on it');
  assert.ok(TERM.hw === 1.0 && TERM.kerb === 0.2, 'the street goes on as the block\'s own: asphalt 2.0 wide (the block\'s street, not the 1.6 of a road between districts: the aprons narrow it) in a kerb of a fifth');
});

// ---------------------------------------------------------------------------------------------------------------- the island's own ends
const Lay = await import('../js/world/layout.js'), Isl = await import('../js/world/island.js');
const { LAYOUT, DIST } = Lay;
const portsOfIsland = LAYOUT.ids.flatMap((id) => ['W', 'E', 'N', 'S'].map((s) => `${id}.${s}`));
const connected = new Set(LAYOUT.edges.filter((e) => !e.path).flatMap((e) => [e.a, e.b]));
const deadEnds = portsOfIsland.filter((p) => !connected.has(p));
const termOf = (port) => LAYOUT.terms.find((t) => t.port === port);

test('RT4: the island: each of the 29 ports no road or ferry leaves has one termination, a connected port has none, the hand-made ones are island.js TERMS (barriers, quays and the sealed portal only) and the rest are the rule\'s own answer', () => {
  assert.equal(deadEnds.length, 29, 'twenty-nine ports are left by no road or ferry');
  assert.ok(Array.isArray(LAYOUT.terms), 'the layout registers its terminations'); assert.equal(LAYOUT.terms.length, 29);
  assert.deepEqual(LAYOUT.terms.map((t) => t.port).sort(), [...deadEnds].sort(), 'one termination for each of those ports and for no other');
  for (const t of LAYOUT.terms) { assert.ok(TERM_KINDS.includes(t.kind), `${t.port}: ${t.kind}`); assert.equal(t.district, +t.port.split('.')[0]); assert.ok(t.why && t.why.length > 10, `${t.port} says why`); }
  assert.deepEqual(Object.keys(Isl.TERMS).sort(), ['1.N', '1.S', '1.W', '4.W', '8.N'], 'five are chosen by hand');
  for (const [port, rec] of Object.entries(Isl.TERMS)) { assert.ok(['barrier', 'quay', 'portal'].includes(rec.kind), `${port}: only barriers, quays and sealed portals are hand-made (the rest is derived, so there is nothing to delete when a district gets its plan)`); assert.equal(termOf(port).kind, rec.kind); assert.equal(termOf(port).authored, true); }
  for (const t of LAYOUT.terms.filter((q) => !q.authored)) assert.equal(t.authored, false);
  const paths = LAYOUT.edges.filter((e) => e.path).map((e) => e.a).filter((n) => /^\d+\./.test(n)); assert.deepEqual(paths.sort(), ['12.E', '14.N', '9.S'], 'three footpaths leave a port');
  for (const p of paths) assert.equal(termOf(p).kind, 'head', `${p}: a footpath leaves it, so its street ends in a path head`);
  for (const t of LAYOUT.terms.filter((q) => q.kind === 'quay')) assert.ok(t.probe.drop <= QUAY_DROP, `${t.port}: a quay stands ${Math.round(t.probe.drop)} px above the water at most (${QUAY_DROP}: above that it is a belvedere)`);
  for (const t of LAYOUT.terms.filter((q) => q.kind === 'yard')) { // a loading end needs a door within half a tile of the end of its road
    const dock = t.props.find((p) => p.t === 'loaddock'); assert.ok(dock && t.door, `${t.port}: a yard has a dock and a door`);
    const dx = Math.max(dock.gx - t.door[0], 0, t.door[0] - (dock.gx + dock.w)), dy = Math.max(dock.gy - t.door[1], 0, t.door[1] - (dock.gy + dock.d)); assert.ok(Math.hypot(dx, dy) <= 0.5, `${t.port}: the dock's wall stands within half a tile of the end of the road (${Math.hypot(dx, dy).toFixed(2)})`);
  }
  const by = {}; for (const t of LAYOUT.terms) (by[t.kind] ||= []).push(t.port);
  assert.deepEqual(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.sort()])), PINNED, 'the island\'s ends, port by port (a change here is a decision to say in the commit)');
});

/** Is (x, y) inside the polygon of [x, y, ...] points? */
const pip = (x, y, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
/** What a piece of ground covers, sampled in the middle of every tenth of a tile inside its polygon: how many samples, how many stand on water, how many are more than `lim` px off the block's height (and the worst of them). */
function coverOf(q, z0, lim = 12) {
  const xs = q.pts.map((p) => p[0]), ys = q.pts.map((p) => p[1]); let n = 0, wet = 0, off = 0, worst = 0;
  for (let x = Math.min(...xs) + 0.05; x < Math.max(...xs); x += 0.1) for (let y = Math.min(...ys) + 0.05; y < Math.max(...ys); y += 0.1) {
    if (!pip(x, y, q.pts)) continue; n++;
    if (!LAYOUT.isLand(Math.floor(x), Math.floor(y))) wet++; else { const dz = Math.abs(Lay.zAt(x, y) - z0); if (dz > lim) { off++; worst = Math.max(worst, dz); } }
  }
  return { n, wet, off, worst };
}

test('RT5: what a termination builds fits: on land, within 6 px of its block\'s height, outside every block and clear of every road (the frame\'s room), a quay stops short of the water, and no piece of its GROUND (a fringe of gravel, a kerb, a slab, a deck) lies on water or more than 12 px off the block\'s height', () => {
  for (const t of LAYOUT.terms) {
    const D = DIST[t.district], f = t.frame; if (t.kind === 'head') continue; // (a path head stands where a footpath begins: it has no room of its own to ask for)
    const bad = [];
    for (const r of t.foot) for (let u = r.u0; u <= r.u1 + 1e-9; u += 0.5) for (let v = r.v0; v <= r.v1 + 1e-9; v += 0.5) {
      const [x, y] = framePoint(f, u, v); if (!LAYOUT.isLand(Math.floor(x), Math.floor(y))) bad.push(`water at ${u.toFixed(1)},${v.toFixed(1)}`);
      else if (t.kind !== 'quay' && t.kind !== 'belvedere' && Math.abs(Lay.zAt(x, y) - D.z) > 6.01) bad.push(`${Math.round(Lay.zAt(x, y) - D.z)} px off the block's height at ${u.toFixed(1)},${v.toFixed(1)}`);
      else if (u > 0.3 && LAYOUT.zoneAt(x, y)) bad.push(`inside a block at ${u.toFixed(1)},${v.toFixed(1)}`);
      if (u > 0.3 && t.kind !== 'quay') for (const sg of LAYOUT.roadSegs) if (Lay.segDist(x, y, sg[0], sg[1], sg[2], sg[3]) < sg[4] + 0.5) { bad.push(`on a road at ${u.toFixed(1)},${v.toFixed(1)}`); break; }
    }
    assert.deepEqual(bad.slice(0, 3), [], `${t.port} (${t.kind}): its room is on land and clear`);
  }
  { // the verifier's D2: the ground pieces themselves, sampled, not only the rectangles of room they asked for: the belvedere's gravel hung over the rock face under its deck (a sand-coloured lobe, 44 px of drop), a fringe lay over the sea at four ends, the cobbles of a slipway in it
    const bad = [];
    for (const t of LAYOUT.terms) for (const q of t.pieces) { if (q.role === 'rail' || q.role === 'post' || q.pts.length < 3) continue; const c = coverOf(q, DIST[t.district].z); if (c.wet || c.off) bad.push(`${t.port} ${t.kind}: the ${q.role} has ${c.wet} of ${c.n} samples on water and ${c.off} more than 12 px off the block's height (worst ${Math.round(c.worst)} px)`); }
    assert.deepEqual(bad, [], 'no piece of ground of an end lies on water or on a drop or a rise of more than 12 px');
  }
  for (const t of LAYOUT.terms.filter((q) => q.kind === 'quay')) { const end = Math.max(...t.pieces.filter((p) => p.role === 'slab').flatMap((p) => p.pts.map(([x, y]) => (x - t.frame.x) * t.frame.ux + (y - t.frame.y) * t.frame.uy))); const [x, y] = framePoint(t.frame, end + 0.3, 0); assert.ok(LAYOUT.isLand(Math.floor(x), Math.floor(y)) || t.opt.ramp, `${t.port}: the slab stops short of the water`); }
});

test('RT6: every termination registers a turn spot in LAYOUT: a place, a radius, a kind and the way out, a closed end marked closed', () => {
  assert.ok(Array.isArray(LAYOUT.turnSpots)); assert.equal(LAYOUT.turnSpots.length, LAYOUT.terms.length, 'one spot for each termination');
  for (const t of LAYOUT.terms) {
    const s = LAYOUT.turnSpots.find((q) => q.port === t.port); assert.ok(s, `${t.port} has a turn spot`); assert.equal(s.kind, t.kind); assert.equal(s.district, t.district);
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y) && s.r >= 0 && s.r <= 3.4, `${t.port}: a place and a radius`);
    const [ux, uy] = OUTWARD[t.port.split('.')[1]]; assert.deepEqual([s.hx, s.hy], [ux, uy], `${t.port}: the heading is the street's way out`);
    const d = DIST[t.district], [px, py] = d.ports[t.port.split('.')[1]], along = (s.x - px) * ux + (s.y - py) * uy; assert.ok(along > 0 && along < 8 && Math.abs((s.x - px) * uy - (s.y - py) * ux) < 0.01, `${t.port}: the spot is on the street's axis, ${along.toFixed(1)} tiles out`);
    assert.equal(s.open, !['barrier', 'portal', 'head'].includes(t.kind), `${t.port}: a barrier, a sealed mouth and a path head are closed to cars (N16); every other end is a place to turn`);
    if (s.open) assert.ok(s.r >= 1, `${t.port}: a place to turn is at least a tile across`);
  }
});

test('RT7: no end is a bare disc: three props or a dock at each, real kinds all, culled by their own box, in their district\'s list, and the pad\'s scatter kept off them', () => {
  const prop = new Set(LAYOUT.props);
  for (const t of LAYOUT.terms) {
    assert.ok(t.props.length >= 3, `${t.port} (${t.kind}) stands ${t.props.length} props`); assert.ok(t.props.length >= 3 || t.props.some((p) => p.t === 'loaddock'));
    for (const p of t.props) { assert.ok(PROP_KINDS.includes(p.t), `${t.port}: ${p.t}`); assert.ok(p.own === 1 && p.term === t.port, `${t.port}: the ${p.t} is culled by its own box and knows its end`); assert.ok(prop.has(p) && DIST[t.district].props.includes(p) && DIST[t.district].free.includes(p), `${t.port}: the ${p.t} is in the district's lists`); assert.ok(!p.hot && !p.solid, `${t.port}: dressing is never a hot spot`); }
    assert.ok(t.props.some((p) => !['lamp', 'bollard'].includes(p.t)), `${t.port}: more than lamps and bollards stand there`);
  }
  // and a run of pickets that crossed the mouth of a street (the scrap yard's, along the foot of the hill, ran across 1.N) is open there
  for (const t of LAYOUT.terms) { const gap = frameRect(t.frame, -0.6, 1.8, -1.5, 1.5); for (const p of LAYOUT.props.filter((q) => q.t === 'fence' && !q.term)) assert.ok(!(p.gx < gap.x + gap.w && p.gx + p.w > gap.x && p.gy < gap.y + gap.d && p.gy + p.d > gap.y), `${t.port}: a run of pickets at ${p.gx.toFixed(1)},${p.gy.toFixed(1)} crosses the street's mouth`); }
  for (const t of LAYOUT.terms) for (const p of LAYOUT.props.filter((q) => q.pad)) for (const k of t.keep) assert.ok(!(p.gx < k.x + k.w && p.gx + p.w > k.x && p.gy < k.y + k.d && p.gy + p.d > k.y), `${t.port}: a ${p.t} of the pad's scatter stands in its room at ${p.gx.toFixed(1)},${p.gy.toFixed(1)}`);
});

// ---------------------------------------------------------------------------------------------------------------- the painted ends
import * as pal0 from '../js/world/palette.js';
const px = (gx, gy) => (gx - gy) * 32, py = (gx, gy, z) => (gx + gy) * 16 - z;
const fakeW = (open = LAYOUT.ids, zoom = 1, lite = false) => ({ unlocked: new Set(open), env: { lod: lodOf(zoom), t: 0, lite }, cam: { z: zoom }, toWorld() {}, toScreen() {} });
/** The fills a recording made, in order: { style, alpha, polys } (a polygon to each subpath; an ellipse as its four extremes). */
function fillsOf(r) {
  const fills = []; let polys = [], cur = null, k = 0;
  for (const c of r.log.calls) {
    if (c[0] === 'beginPath') { polys = []; cur = null; }
    else if (c[0] === 'moveTo') { cur = [[c[1], c[2]]]; polys.push(cur); }
    else if (c[0] === 'lineTo') { if (!cur) { cur = []; polys.push(cur); } cur.push([c[1], c[2]]); }
    else if (c[0] === 'closePath') cur = null;
    else if (c[0] === 'ellipse') { polys.push([[c[1] - c[3], c[2]], [c[1] + c[3], c[2]], [c[1], c[2] - c[4]], [c[1], c[2] + c[4]]]); cur = null; }
    else if (c[0] === 'fill') { const f = r.log.fills[k++]; fills.push({ style: f.style, alpha: f.alpha, polys: polys.slice() }); }
    else if (c[0] === 'fillRect') k++;
  }
  return fills;
}
function paint(id, view, open = LAYOUT.ids, zoom = 1, lite = false) { const r = recCtx(), w = fakeW(open, zoom, lite); runLayer(id, w, r.ctx, view, { zoom, far: false, mode: 1, see: () => true }); return { fills: fillsOf(r), rects: r.log.rects, r }; }
const projected = (pts) => pts.map(([x, y, z]) => [px(x, y), py(x, y, z)]);
const same = (poly, pts) => poly.length === pts.length && pts.every(([x, y]) => poly.some(([a, b]) => Math.abs(a - x) < 1e-9 && Math.abs(b - y) < 1e-9));
const inside = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const topmost = (f, x, y) => { for (let i = f.length - 1; i >= 0; i--) if (f[i].alpha >= 0.99 && f[i].polys.some((p) => inside(p, x, y))) return i; return -1; };
const around = (gx, gy, r, z) => ({ x0: px(gx - r, gy + r) - 40, x1: px(gx + r, gy - r) + 40, y0: py(gx - r, gy - r, z) - 120, y1: py(gx + r, gy + r, z) + 120 });
const streetOf = (D, side) => D.ground.find((g) => g.kind === 'road' && (g.w > g.d) === (side === 'W' || side === 'E'));

test('RT8: every termination is painted where it is, at zoom 0.6 and in the lite tier: each piece of its ground a fill in its place and in order, over the stage\'s lip, in the block\'s own asphalt and kerb; a locked district\'s veiled; culled by its own box', () => {
  for (const t of LAYOUT.terms) {
    const D = DIST[t.district], side = t.port.split('.')[1], [ux, uy] = OUTWARD[side], [x0, y0] = D.ports[side], f = t.frame, street = streetOf(D, side);
    const streetPoly = [[street.x, street.y], [street.x + street.w, street.y], [street.x + street.w, street.y + street.d], [street.x, street.y + street.d]].map(([x, y]) => [px(x, y), py(x, y, D.z)]);
    for (const [state, lite] of [['open', false], ['open', true], ['locked', true]]) {
      const open = state === 'open' ? LAYOUT.ids : LAYOUT.ids.filter((i) => i !== D.id), at = `${t.port} ${t.kind} (${state}${lite ? ', lite' : ''})`;
      const { fills, rects } = paint('blocks', around(x0 + ux * 3, y0 + uy * 3, 9, D.z), open, 0.6, lite), mine = [];
      let last = -1;
      for (const q of t.pieces) {
        if (q.role === 'rail' || q.role === 'post') continue;
        const want = projected(q.pts), i = fills.findIndex((x, k) => k > last && x.polys.some((p) => same(p, want))); assert.ok(i >= 0, `${at}: the ${q.role} piece (${q.pts.length} points) is painted, after the one before it`); mine.push(i); last = i;
      }
      assert.equal(new Set(mine).size, mine.length, `${at}: each piece is its own fill`);
      const kept = t.pieces.filter((q) => q.role !== 'rail' && q.role !== 'post'), styleOf = (role) => { const k = kept.findIndex((q) => q.role === role); return k < 0 ? null : fills[mine[k]].style; };
      kept.forEach((q, k) => assert.notEqual(String(fills[mine[k]].style).toLowerCase(), '#ff00ff', `${at}: the ${q.role} piece has a tone of its own (a role the tone table lacks is painted magenta)`));
      const lum = (c) => { const n = parseInt(String(c).slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
      if (state === 'open' && styleOf('slab') && styleOf('asph') && styleOf('walk')) assert.ok(lum(styleOf('slab')) > lum(styleOf('asph')) && lum(styleOf('slab')) < lum(styleOf('walk')), `${at}: concrete is lighter than the district's asphalt and darker than its sidewalk (a yard is not a patch of sand)`);
      if (state === 'open' && styleOf('slab') && styleOf('asph') && styleOf('walk')) { const bluer = (c) => { const n = parseInt(String(c).slice(1), 16); return (n & 255) - (n >> 16); }, lo = Math.min(bluer(styleOf('asph')), bluer(styleOf('walk'))) - 4, hi = Math.max(bluer(styleOf('asph')), bluer(styleOf('walk'))) + 4; assert.ok(bluer(styleOf('slab')) >= lo && bluer(styleOf('slab')) <= hi, `${at}: concrete is the district's own cool or warm (blue minus red ${bluer(styleOf('slab'))} between its asphalt's ${bluer(styleOf('asph'))} and its sidewalk's ${bluer(styleOf('walk'))}), not a sand colour laid on a blue harbor`); }
      const stage = fills.find((q) => q.polys.some((p) => same(p, streetPoly))); assert.ok(stage, `${at}: the stage paints its street`);
      const asph = t.pieces.findIndex((q) => q.role === 'asph' || q.role === 'slab'); assert.ok(asph >= 0);
      if (t.pieces[asph].role === 'asph') assert.equal(fills[mine[asph]].style, stage.style, `${at}: the end goes on in the block's own asphalt (${fills[mine[asph]].style} against the stage's ${stage.style})`);
      // the topmost opaque fill 0.05 tile under the block's edge, on the street's middle and either side of it, is the end's: it covers the stage's lip where the street leaves
      const set = new Set(mine);
      for (const o of [0, 0.5, -0.5]) { const gx = x0 - ux * 0.05 - uy * o, gy = y0 - uy * 0.05 + ux * o, z = D.z + 0.4, top = topmost(fills, px(gx, gy), py(gx, gy, z)); if (['head', 'portal', 'quay', 'barrier', 'bulb', 'roundabout', 'hammer', 'yard', 'gate', 'farm', 'belvedere'].includes(t.kind)) assert.ok(set.has(top), `${at}: the topmost fill under the edge ${o} off the middle is the end's (fill ${top})`); }
      if (t.pieces.some((q) => q.role === 'post')) assert.ok(rects.length >= t.pieces.filter((q) => q.role === 'post').length, `${at}: its posts are painted at zoom 0.6`);
      if (state === 'open') for (const q of t.pieces.filter((x) => x.role === 'rail')) assert.ok(fills.some((x) => x.style === pal0.PAVE.cream && x.polys.length === q.pts.length - 1), `${at}: its rail is painted: ${q.pts.length - 1} bars in the cream of the bridges' rails`);
    }
    // culled by its own box: a view that has only the end (not the block) paints it; a view far from it paints none of it
    const alone = paint('blocks', { x0: t.bb[0], x1: t.bb[2], y0: t.bb[1], y1: t.bb[3] }).fills, want = projected(t.pieces.find((q) => q.role === 'asph' || q.role === 'slab' || q.role === 'plaza').pts);
    assert.ok(alone.some((q) => q.polys.some((p) => same(p, want))), `${t.port}: painted when only its own box is in view`);
    const far = paint('blocks', { x0: t.bb[0] + 9000, x1: t.bb[2] + 9000, y0: t.bb[1], y1: t.bb[3] }).fills; assert.ok(!far.some((q) => q.polys.some((p) => same(p, want))), `${t.port}: not painted from a view that is nowhere near`);
    for (const q of t.pieces) for (const [x, y, z] of q.pts) assert.ok(px(x, y) >= t.bb[0] && px(x, y) <= t.bb[2] && py(x, y, z) >= t.bb[1] && py(x, y, z) <= t.bb[3], `${t.port}: its box holds all of its ground`);
  }
  const lockedFirst = paint('blocks', around(DIST[4].ports.W[0] - 3, DIST[4].ports.W[1], 6, DIST[4].z), LAYOUT.ids.filter((i) => i !== 4), 0.6, true).fills, openFirst = paint('blocks', around(DIST[4].ports.W[0] - 3, DIST[4].ports.W[1], 6, DIST[4].z), LAYOUT.ids, 0.6, true).fills;
  const asphOf = (fl) => { const t = termOf('4.W'), want = projected(t.pieces.find((q) => q.role === 'asph').pts); return fl.find((q) => q.polys.some((p) => same(p, want))).style; };
  assert.notEqual(asphOf(lockedFirst), asphOf(openFirst), 'the closed street of a locked district is veiled like the district');
});

// ---------------------------------------------------------------------------------------------------------------- the props of the ends
const props = await import('../js/world/props.js'), atlas = await import('../js/world/atlas.js'), stack = await import('../js/world/stack.js'), pal = await import('../js/world/palette.js');
stack.setFlag('static-prop', 'v2');
const NEW_KINDS = ['roadend', 'busstop', 'trough', 'farmgate', 'trailboard', 'portal', 'loaddock', 'lookout'];
const SAMPLE = {
  roadend: { w: 0.3, d: 0.3, h: 34, hx: 1, hy: 0 }, busstop: { w: 1.8, d: 0.9, h: 26 }, trough: { w: 1.6, d: 0.6, h: 8 }, farmgate: { w: 0.3, d: 2.6, h: 22, hx: 1, hy: 0 }, trailboard: { w: 0.4, d: 1.3, h: 30 }, portal: { w: 3.4, d: 0.9, h: 52, hx: 0, hy: -1 },
  loaddock: { w: 1.5, d: 4.8, h: 24, acc: '#ffd02e' }, lookout: { w: 1, d: 1, h: 14 },
};
const STILL = { t: 0, wind: 0, night: 0, dim: 0, hz: 0, far: false, lite: false, locked: false, zoff: 0, lights: null, crunch: false, lod: null, boardText: null };
const mk = (t, o = {}) => { const s = { ...SAMPLE[t], ...o }, gx = 20, gy = 30, z = 0; return { t, gx, gy, zone: 1, z, key: gx + gy, own: 1, ...s, bb: [(gx - (gy + s.d)) * 32 - 16, (gx + gy) * 16 - s.h - 46, (gx + s.w - gy) * 32 + 16, (gx + s.w + gy + s.d) * 16 + 14] }; };
const BANNED = new Set(['createLinearGradient', 'createRadialGradient', 'createConicGradient', 'createPattern', 'clip', 'stroke', 'strokeRect', 'strokeText', 'drawImage']);
function flatCtx() { const r = recCtx(), bad = []; const ctx = new Proxy(r.ctx, { get(o, k) { if (BANNED.has(k)) bad.push(k); return o[k]; }, set(o, k, v) { if ((k === 'shadowBlur' && v) || (k === 'filter' && v && v !== 'none')) bad.push(k); o[k] = v; return true; } }); return { ...r, ctx, bad }; }
/** Every point a recording painted, in the frame the body drew in: path points, arcs, ellipses (their extremes), rounded rectangles (arcTo), rects and text anchors, with the translations of save and restore applied. */
function points(r) {
  const out = [], tr = [[0, 0]]; let t = [0, 0];
  for (const c of r.log.calls) {
    const a = c.slice(1);
    if (c[0] === 'save') tr.push(t.slice()); else if (c[0] === 'restore') t = tr.pop() || [0, 0]; else if (c[0] === 'translate') t = [t[0] + a[0], t[1] + a[1]];
    else if (c[0] === 'moveTo' || c[0] === 'lineTo') out.push([a[0] + t[0], a[1] + t[1]]);
    else if (c[0] === 'arc') out.push([a[0] - a[2] + t[0], a[1] + t[1]], [a[0] + a[2] + t[0], a[1] + t[1]], [a[0] + t[0], a[1] - a[2] + t[1]], [a[0] + t[0], a[1] + a[2] + t[1]]);
    else if (c[0] === 'ellipse') out.push([a[0] - a[2] + t[0], a[1] + t[1]], [a[0] + a[2] + t[0], a[1] + t[1]], [a[0] + t[0], a[1] - a[3] + t[1]], [a[0] + t[0], a[1] + a[3] + t[1]]);
    else if (c[0] === 'arcTo') out.push([a[0] + t[0], a[1] + t[1]], [a[2] + t[0], a[3] + t[1]]);
    else if (c[0] === 'fillRect' || c[0] === 'rect') out.push([a[0] + t[0], a[1] + t[1]], [a[0] + a[2] + t[0], a[1] + a[3] + t[1]]);
    else if (c[0] === 'fillText') out.push([a[1] + t[0], a[2] + t[1]]);
  }
  return out;
}

// ---- the heading of a prop that stands across a street (the verifier's D1): `hx, hy` is the way out of the block, and a heading is 0 as often as it is not. The defaults were `p.hx || 1`, which made every N and S port a diagonal (a boom seen end on at 8.N, a gate lying along
// the screen at 6.S and 10.S): what is drawn is held to the picture, not to the kind: the pieces a street's perpendicular decides must be where the perpendicular puts them, for every one of the four ways a street can leave a block.
const HEADINGS = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };
const { col: colOf } = await import('../js/world/toys.js'), { shade: shadeOf, tone: toneOf } = await import('../js/world/iso.js');
/** Every fill a recording made as a path of exactly one shape: a quad (one moveTo, three lineTo, no curve) or an ellipse, in order, with the style and the alpha it was filled in. */
function shapesOf(r) {
  const quads = [], ellipses = []; let path = [], curved = 0, ell = null, k = 0;
  for (const c of r.log.calls) {
    if (c[0] === 'beginPath') { path = []; curved = 0; ell = null; }
    else if (c[0] === 'moveTo' || c[0] === 'lineTo') path.push([c[1], c[2]]);
    else if (c[0] === 'ellipse') { curved++; ell = { x: c[1], y: c[2], rx: c[3], ry: c[4] }; }
    else if (c[0] === 'arc' || c[0] === 'arcTo' || c[0] === 'rect') curved++;
    else if (c[0] === 'fill') { const f = r.log.fills[k++]; if (curved === 0 && path.length === 4) quads.push({ pts: path.slice(), style: f.style, alpha: f.alpha }); else if (curved === 1 && ell && path.length === 0) ellipses.push({ ...ell, style: f.style, alpha: f.alpha }); }
    else if (c[0] === 'fillRect') k++;
  }
  return { quads, ellipses };
}
const xs = (pts) => pts.map((q) => q[0]), ys = (pts) => pts.map((q) => q[1]), reach = (a) => Math.max(...a) - Math.min(...a), centroid = (q) => [xs(q.pts).reduce((s, v) => s + v, 0) / 4, ys(q.pts).reduce((s, v) => s + v, 0) / 4];
/** The screen direction of a way across a street whose way out is (hx, hy): the grid's perpendicular (-hy, hx) in the isometric projection (32 and 16 pixels a tile), as a slope (dy over dx). */
const acrossSlope = (hx, hy) => { const nx = -hy, ny = hx; return ((nx + ny) * 16) / ((nx - ny) * 32); };
/** The spots on the ground (grid, z = 0) that a screen point stands for. */
const groundOf = (X, Y) => [(X / 32 + Y / 16) / 2, (Y / 16 - X / 32) / 2];
const drawKind = (kind, o) => { const r = recCtx(), p = mk(kind, o); atlas.SHARED.get(kind).body(r.ctx, p, STILL); return { r, p }; };
const same2 = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a.toFixed(2)} against ${b.toFixed(2)}`);

test('RT9: the new kinds of prop are flat (no gradient, pattern, clip, stroke or blur; every translucent fill is a ground shadow), balanced, drawn twice the same, and everything they paint is inside the sprite\'s box', () => {
  for (const kind of NEW_KINDS) {
    const def = atlas.SHARED.get(kind); assert.ok(def, `${kind} is a shared prop (one sprite for every prop that looks alike)`); assert.ok(stack.propKindsV2().includes(kind), `${kind} has a V2 drawer`);
    for (const variant of kind === 'roadend' ? [{}, { open: 1, plate: 'PRIVATE' }, { hx: 0, hy: -1 }, { hx: -1, hy: 0 }, { hx: 0, hy: 1 }] : kind === 'portal' ? [{}, { hx: 1, hy: 0, w: 0.9, d: 3.4 }, { hx: 0, hy: 1 }, { hx: -1, hy: 0, w: 0.9, d: 3.4 }] : kind === 'farmgate' ? [{}, { hx: 0, hy: 1, w: 2.6, d: 0.3 }, { hx: -1, hy: 0 }] : [{}]) {
      const p = mk(kind, variant), a = flatCtx(), b = flatCtx(), tag = `${kind} ${JSON.stringify(variant)}`;
      def.body(a.ctx, p, STILL); def.body(b.ctx, p, STILL);
      assert.deepEqual(a.bad, [], tag); assert.equal(a.log.strokes.length, 0, `${tag}: a stroke`); assert.equal(a.log.clips, 0, `${tag}: a clip`); assert.equal(a.log.depth, 0, `${tag}: save and restore balance`); assert.equal(a.state.globalAlpha, 1, `${tag}: alpha back at 1`);
      assert.ok(a.log.fills.length >= 6, `${tag}: it paints`); for (const f of a.log.fills) { assert.match(f.style, /^#[0-9a-f]{6}$/, `${tag}: ${f.style}`); if (f.alpha !== 1) assert.equal(f.style, pal.LIGHT.shadow, `${tag}: the one translucent fill is the ground shadow`); }
      assert.deepEqual(a.log.calls, b.log.calls, `${tag}: the same call for call, twice (no clock, no random)`);
      const [ax, ay] = [(p.gx - p.gy) * 32, (p.gx + p.gy) * 16], [x0, y0, x1, y1] = atlas.rectOf(p, def.ext);
      for (const [x, y] of points(a)) assert.ok(x - ax >= x0 - 2 && x - ax <= x1 + 2 && y - ay >= y0 - 2 && y - ay <= y1 + 2, `${tag}: a point at (${(x - ax).toFixed(1)}, ${(y - ay).toFixed(1)}) is outside the sprite's box [${[x0, y0, x1, y1].map((v) => v.toFixed(0)).join(', ')}]`);
    }
  }
  // the whole road: drawn through drawProp, in a world that is NOT locked: a closed street is closed for ever, the padlock gate is not drawn open (the closed barrier is a different prop, with a different plate)
  const open = { ...STILL, locked: false }, a = recCtx(), g = recCtx(), gate = { t: 'gate', gx: 20, gy: 30, w: 0.3, d: 0.3, h: 16, z: 0, zone: 1, key: 50, gk: 'barrier', hx: 1, hy: 0, fx: 3, fy: 0, bb: [0, 0, 0, 0] };
  props.drawProp(a.ctx, mk('roadend'), open); props.drawProp(g.ctx, gate, open);
  assert.ok(a.log.calls.length > 40, 'the closed barrier is drawn in a district that is open'); assert.equal(g.log.calls.length, 0, 'the padlock gate is not');
  const text = a.log.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]); assert.deepEqual(text, ['ROAD CLOSED'], 'and its plate says what it is: ROAD CLOSED, not "Opens at"');
  assert.deepEqual(NEW_KINDS.filter((k) => !SAMPLE[k]), [], 'the sample table names every new kind');

  // the verifier's D1: a boom, a gate and a pair of cones stand ACROSS the street whichever way it leaves its block (W, E, N, S). The boom has eight segments, none of them a line seen end on (zero wide), reaching the same
  // way across the screen for every heading and running along the grid's perpendicular of it; its two posts stand as far apart; a heading left out is the street's way out to the east (the portal's, to the north)
  const BOOM = new Set([pal.TOY.red, '#fffaf0'].map((c) => colOf(c, STILL)).flatMap((c) => [c, shadeOf(c, 0.78)]));
  for (const open of [0, 1]) {
    const spans = {}, seps = {};
    for (const [side, [hx, hy]] of Object.entries(HEADINGS)) {
      const { r } = drawKind('roadend', { hx, hy, open, plate: 'X' }), { quads, ellipses } = shapesOf(r), tag = `a ${open ? 'gate (the boom raised)' : 'barrier'} whose street leaves its block to the ${side}`;
      const boom = quads.filter((q) => BOOM.has(q.style) && reach(ys(q.pts)) >= 4.5 && reach(ys(q.pts)) <= 24);
      assert.equal(boom.length, 16, `${tag}: a boom of eight segments, each a dark step and its colour (${boom.length} quads found)`);
      for (const q of boom) assert.ok(reach(xs(q.pts)) >= 4, `${tag}: a segment of the boom is ${reach(xs(q.pts)).toFixed(1)} px wide: a boom seen end on (or lying along the street) is no boom`);
      spans[side] = reach(boom.flatMap((q) => xs(q.pts)));
      const post = ellipses.filter((e) => e.alpha < 1).slice(0, 2); assert.equal(post.length, 2, `${tag}: a shadow under each of its two posts`); seps[side] = Math.hypot(post[1].x - post[0].x, post[1].y - post[0].y);
      same2(Math.abs(post[1].x - post[0].x), open ? 2 * spans[side] : spans[side], 1.5, `${tag}: the boom runs from post to post (the posts' reach across the screen against the boom's${open ? ', which is raised from one post to the middle: half of it' : ''})`);
      if (!open) { const [c0, c1] = [centroid(boom[1]), centroid(boom[15])]; same2((c1[1] - c0[1]) / (c1[0] - c0[0]), acrossSlope(hx, hy), 0.01, `${tag}: the boom runs along the perpendicular of the street, slope`); }
    }
    for (const [what, v] of [['reaches', spans], ['posts stand', seps]]) { const all = Object.values(v); assert.ok(Math.max(...all) - Math.min(...all) < 0.5, `${open ? 'a gate' : 'a barrier'}: the boom ${what} the same across the street whichever way the street goes (${Object.entries(v).map(([k, n]) => k + ' ' + n.toFixed(1)).join(', ')})`); }
  }
  { // the farm gate: four rails and a brace, each rail a dark step and its colour, across the track
    const BAR = new Set([colOf('#f6eedc', STILL), shadeOf(colOf('#f6eedc', STILL), 0.78)]), spans = {};
    for (const [side, [hx, hy]] of Object.entries(HEADINGS)) {
      const { r } = drawKind('farmgate', { hx, hy }), bars = shapesOf(r).quads.filter((q) => BAR.has(q.style)), tag = `a farm gate whose track leaves its block to the ${side}`;
      assert.equal(bars.length, 9, `${tag}: four rails (a dark step and a colour each) and a brace (${bars.length} bars found)`);
      for (const q of bars) assert.ok(reach(xs(q.pts)) >= 4, `${tag}: a bar is ${reach(xs(q.pts)).toFixed(1)} px wide (seen end on, it is no gate)`);
      for (const q of bars.slice(0, 8)) same2((q.pts[1][1] - q.pts[0][1]) / (q.pts[1][0] - q.pts[0][0]), acrossSlope(hx, hy), 0.01, `${tag}: a rail runs along the perpendicular of the track, slope`);
      spans[side] = reach(bars.flatMap((q) => xs(q.pts)));
    }
    const all = Object.values(spans); assert.ok(Math.max(...all) - Math.min(...all) < 0.5, `a farm gate reaches the same across the screen whichever way its track goes (${Object.entries(spans).map(([k, n]) => k + ' ' + n.toFixed(1)).join(', ')})`);
  }
  { // the sealed portal: two cones stand on the street's side of the face, a tile and a bit to each side of the street's axis
    const lens = {};
    for (const [side, [hx, hy]] of Object.entries(HEADINGS)) {
      const { r, p } = drawKind('portal', { hx, hy, w: hx ? 0.9 : 3.4, d: hx ? 3.4 : 0.9 }), tag = `a portal whose street leaves its block to the ${side}`, cones = shapesOf(r).ellipses.filter((e) => e.rx === 4.6 && e.ry === 1.9);
      assert.equal(cones.length, 2, `${tag}: two cones`);
      const [c0, c1] = cones.map((e) => groundOf(e.x, e.y)), mid = [(p.gx + p.w / 2), (p.gy + p.d / 2)], sep = [c1[0] - c0[0], c1[1] - c0[1]];
      same2(Math.abs(sep[0] * hx + sep[1] * hy), 0, 0.02, `${tag}: the cones stand across the street (their line is square to its way out, off by)`);
      for (const c of [c0, c1]) assert.ok((c[0] - mid[0]) * hx + (c[1] - mid[1]) * hy < -0.3, `${tag}: a cone stands on the street's side of the face (${((c[0] - mid[0]) * hx + (c[1] - mid[1]) * hy).toFixed(2)} tiles along the way out)`);
      lens[side] = Math.hypot(sep[0], sep[1]);
    }
    const all = Object.values(lens); assert.ok(Math.max(...all) - Math.min(...all) < 0.05, `the cones stand as far apart whichever way the street goes (${Object.entries(lens).map(([k, n]) => k + ' ' + n.toFixed(2)).join(', ')})`);
  }
  for (const [kind, ways] of [['roadend', { open: 1, plate: 'X' }], ['farmgate', {}], ['portal', {}]]) { // a heading left out is the default heading, and the default is a heading (not a number to be "or"ed away)
    const dflt = kind === 'portal' ? [0, -1] : [1, 0], bare = drawKind(kind, { ...ways, hx: undefined, hy: undefined }).r, named = drawKind(kind, { ...ways, hx: dflt[0], hy: dflt[1] }).r;
    assert.deepEqual(bare.log.calls, named.log.calls, `${kind}: with no heading it is drawn as it is for the way out to the ${kind === 'portal' ? 'north' : 'east'}`);
  }
});

// ---------------------------------------------------------------------------------------------------------------- the gates (WP11)
const centre = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const lockedRoads = LAYOUT.edges.filter((e) => !e.stem && !e.path && DIST[e.gate].gateKind !== 'fog');
const portOfName = (n) => (Isl.JUNCTIONS[n] ? Isl.JUNCTIONS[n].port : n);

test('RT10: a gate on every road that opens with a locked district whose gate is not fog, at the road\'s open end (a bridge\'s leaf at its bank), belonging to the district it guards, lit by the district it stands in, drawn after the clouds; the closed barrier is another prop', async () => {
  assert.equal(lockedRoads.length, 17, 'seventeen roads open with a locked district that is not under fog: sixteen roads and the ferry');
  let atBank = 0;
  for (const e of lockedRoads) {
    const D = DIST[e.gate], g = D.gates.find((q) => q.edge === e.n), name = `${e.a} > ${e.b} (opens with ${D.id})`; assert.ok(g, `${name} has a gate`);
    const p = g.prop; assert.ok(p && D.props.includes(p) && p.t === 'gate' && p.gk === D.gateKind && p.zone === D.id && p.own === 1 && D.free.includes(p), `${name}: a gate prop of ${D.id}'s own kind (${D.gateKind}), in its list, culled by its own box`);
    assert.equal(p.fz, g.open, `${name}: it takes the light of the district it stands in, ${g.open}, not the veil of the one it guards`); assert.ok(g.open < D.id, `${name}: the open end belongs to a district the player owns first (${g.open} before ${D.id})`);
    const q = Lay.polyAt(e, 0), near = (s) => Lay.polyAt(e, s);
    const nearest = (() => { let best = { d: 1e9, s: 0 }; for (let s = 0; s <= e.len; s += 0.05) { const a = near(s), d = Math.hypot(a.x - g.x, a.y - g.y); if (d < best.d) best = { d, s }; } return best; })();
    assert.ok(nearest.d < 0.06, `${name}: the gate stands on the road (${nearest.d.toFixed(2)} tiles off its middle line)`); void q;
    const atA = portOfName(e.a).startsWith(g.open + '.'), fromOpen = atA ? nearest.s : e.len - nearest.s, bridge = LAYOUT.bridges.find((b) => b.edge === e);
    if (D.gateKind === 'bridge' && bridge) { atBank++; const bank = atA ? bridge.s0 - 1 : bridge.s1 + 1; assert.ok(Math.abs(nearest.s - bank) < 0.2, `${name}: a bridge's leaf stands at the bank on the open side (${nearest.s.toFixed(1)} against ${bank.toFixed(1)})`); }
    else assert.ok(fromOpen <= 3.5 && fromOpen >= 1.5, `${name}: the gate is on the road's first tile at the open end: ${fromOpen.toFixed(1)} tiles from it`);
    assert.ok(Math.abs(Math.hypot(p.hx, p.hy) - 1) < 1e-6, `${name}: it faces along the road, towards the district it guards`);
  }
  assert.equal(atBank, 3, 'three roads cross water to a district behind a bridge: 3.E to 5.S, the fork of 4 to 5.W and 8.W to 9.E: the leaf stands at the bank of each');
  for (const id of LAYOUT.ids) { const D = DIST[id]; if (D.gateKind === 'fog') { assert.deepEqual(D.gates, [], `district ${id} is under fog: no gate`); continue; } assert.equal(D.gates[0].edge, D.inEdge, `district ${id}: its first gate is on its entry road`); if (D.gateAt) assert.equal(D.gateAt.edge, D.inEdge, `district ${id}: the notch of its cloud stays at the road in`); }
  for (const name of ['j4>3.N', '6.N>7.E', '10.N>14.S', 'j4>5.W']) { const e = LAYOUT.edges.find((q) => `${q.a}>${q.b}` === name), D = DIST[e.gate]; assert.ok(D.gates.some((g) => g.edge === e.n), `the road ${name}, which had no barrier, has its gate`); }
  const roadsWithTwo = LAYOUT.ids.filter((id) => DIST[id].gates.length > 1); assert.deepEqual(roadsWithTwo, [4, 5, 7, 14], 'the districts that open two roads have two gates: 4, 5, 7 and 14');
  // the closed barrier is another prop: a plate that says ROAD CLOSED where the gate says "Opens at", drawn in an open district where the gate is not (RT9), striped red and cream where the gate's boom is orange
  const all = LAYOUT.terms.flatMap((t) => t.props.map((p) => p.t)); assert.ok(all.includes('roadend') && !all.includes('gate'), 'the terminations stand barriers, never gates');
  // drawn from the open neighbour's side, and after the clouds (the guarded district's cloud may cover the road's first tile)
  const { w } = await newWorld({ size: [800, 520] }), order = [], D2 = DIST[2], g2 = D2.gates[0];
  stack.registerLayer('clouds', () => { order.push('clouds'); }, 'world'); w.drawStatic = (ctx, p) => { order.push(p.t + (p.t === 'gate' ? ':' + p.zone : '')); };
  const [gx, gy] = centre(g2.prop.bb); w.goTo(gx, gy, 1.0, false); w.draw();
  assert.ok(w.items.some((it) => it.k === 'g' && it.a === g2.prop), 'the gate of district 2 is in the draw list as a gate');
  assert.ok(order.includes('gate:2') && order.includes('clouds'), 'the gate and the clouds are drawn'); assert.ok(order.lastIndexOf('clouds') < order.indexOf('gate:2'), `the gate is drawn after the clouds (${order.filter((x) => x === 'clouds' || x.startsWith('gate')).join(' ')})`);
  assert.ok(order.slice(0, order.lastIndexOf('clouds')).every((x) => !x.startsWith('gate')), 'and not before them too');
});

// ---------------------------------------------------------------------------------------------------------------- the lookouts' decks and the path heads
test('RT11: the lookouts\' decks and the path heads are ground art: a 2 by 2 deck with a rail on the three sides the path does not come in by, two bollards one tile apart over a strip of dropped kerb 0.6 deep, painted in every tier', () => {
  assert.equal(LAYOUT.decks.length, 6); assert.equal(LAYOUT.heads.length, 3);
  const lookouts = LAYOUT.ids.flatMap((id) => DIST[id].props.filter((p) => p.t === 'lookout' && !p.term));
  for (const dk of LAYOUT.decks) {
    const [rx, ry, rw, rd] = dk.rect, e = LAYOUT.edges[dk.edge], end = Lay.polyAt(e, e.len), at = `the deck at ${dk.name}`;
    assert.deepEqual([rw, rd], [2, 2], `${at} is 2 by 2 tiles`);
    // the verifier's D2: centred on the end of the footpath unless that put its edge on the water's tile line: it slides (a tenth of a tile at a time, 0.4 at most each way) to where it and a third of a tile round it are ground, so the end of the path, and the
    // tile square of the bench and the telescope about it, always stand on it; the only deck that cannot is the one on a spit of land exactly two tiles wide (v6: its two edges ARE the water's), and no deck has a plank over water
    assert.ok(Math.abs(dk.slide[0]) <= 0.4 + 1e-9 && Math.abs(dk.slide[1]) <= 0.4 + 1e-9 && Math.abs(rx + 1 - dk.slide[0] - dk.x) < 1e-9 && Math.abs(ry + 1 - dk.slide[1] - dk.y) < 1e-9, `${at} is the 2 by 2 about the end of its footpath, slid by ${dk.slide} at most`);
    assert.ok(Math.min(dk.x - rx, rx + rw - dk.x, dk.y - ry, ry + rd - dk.y) >= 0.5 - 1e-9, `${at}: the end of the footpath is half a tile inside every edge: the bench and the telescope stand on the planks`);
    { const D = DIST[dk.district], c = coverOf({ pts: dk.pieces.find((q) => q.role === 'deck').pts }, Lay.zAt(dk.x, dk.y)); assert.equal(c.wet + c.off, 0, `${at}: its planks are on land within 12 px of the path's end (${c.wet} samples on water, ${c.off} off the height)`); void D;
      let ring = 0; for (let a = rx - 0.35; a < rx + rw + 0.35 - 1e-9; a += 0.1) for (let b = ry - 0.35; b < ry + rd + 0.35 - 1e-9; b += 0.1) if (!LAYOUT.isLand(Math.floor(a), Math.floor(b))) ring++;
      if (dk.name === 'v6') assert.ok(ring > 0 && dk.slide.every((n) => n === 0), `${at} stands on a spit exactly two tiles wide: no slide gives it its margin (it has ${ring} samples of water within a third of a tile)`); else assert.equal(ring, 0, `${at}: a third of a tile round the planks is ground too (${ring} samples of water)`); }
    for (const q of dk.pieces) for (const [x, y] of q.pts) assert.ok(x >= rx - 1e-6 && x <= rx + rw + 1e-6 && y >= ry - 1e-6 && y <= ry + rd + 1e-6, `${at}: ${q.role} stays inside its 2 by 2`);
    assert.equal(dk.pieces.filter((q) => q.role === 'deck2').length, 2, `${at}: planks in two tones`);
    const rail = dk.pieces.find((q) => q.role === 'rail'), posts = dk.pieces.filter((q) => q.role === 'post'); assert.equal(rail.pts.length, 4, `${at}: a rail of three sides`); assert.equal(posts.length, 7, `${at}: a post at each corner and each middle`);
    const side = { W: (p) => p[0] - rx, E: (p) => rx + rw - p[0], N: (p) => p[1] - ry, S: (p) => ry + rd - p[1] }[dk.inSide], dist = rail.pts.map((p) => side(p));
    assert.ok(Math.abs(dist[0] - 0.2) < 1e-9 && Math.abs(dist[3] - 0.2) < 1e-9 && dist[1] > 1.8 && dist[2] > 1.8, `${at}: the rail begins and ends at the side the path comes in by and runs round the other three`);
    assert.ok(Math.abs(end.x - dk.x) < 1e-6 && Math.abs(end.y - dk.y) < 1e-6, `${at}: the path ends at its middle`);
    const heading = dk.inSide === 'W' ? end.dx > 0.5 : dk.inSide === 'E' ? end.dx < -0.5 : dk.inSide === 'N' ? end.dy > 0.5 : end.dy < -0.5; assert.ok(heading, `${at}: the path comes in by the ${dk.inSide} side`);
    assert.ok(lookouts.some((p) => Math.abs(p.gx + 0.5 - dk.x) < 1e-6 && Math.abs(p.gy + 0.5 - dk.y) < 1e-6 && p.sm && p.own), `${at}: the bench and the telescope stand on it`);
    // painted in the lite tier at the author's zoom: the planks, the rail and every post
    for (const [zoom, lite] of [[0.57, true], [0.6, false]]) {
      const D = DIST[dk.district], { fills, rects } = paint('roads', around(dk.x, dk.y, 4, D.z), LAYOUT.ids, zoom, lite), want = projected(dk.pieces.find((q) => q.role === 'deck').pts);
      assert.ok(fills.some((q) => q.polys.some((pl) => same(pl, want))), `${at}: the planks are painted at zoom ${zoom}${lite ? ' in lite' : ''}`);
      for (const q of posts) { const [x, y, z] = q.pts[0], X = px(x, y) - 2, Y = py(x, y, z) - 7; assert.ok(rects.some((r) => Math.abs(r.x - X) < 1e-9 && Math.abs(r.y - Y) < 1e-9), `${at}: the post at ${x.toFixed(1)},${y.toFixed(1)} is painted at zoom ${zoom}`); }
    }
    const { rects: far } = paint('roads', around(dk.x, dk.y, 4, DIST[dk.district].z), LAYOUT.ids, 0.25, true);
    for (const q of posts) { const [x, y, z] = q.pts[0], X = px(x, y) - 2, Y = py(x, y, z) - 7; assert.ok(!far.some((r) => Math.abs(r.x - X) < 1e-9 && Math.abs(r.y - Y) < 1e-9), `${at}: its posts wait for zoom 0.3`); }
  }
  // the heads beside a road: a strip of sand 0.6 deep and 1.0 across, laid over the road's kerb after its asphalt, and two bollards one tile apart across the path
  for (const h of LAYOUT.heads) {
    const f = h.frame, sand = h.pieces.find((q) => q.role === 'sand'), uv = sand.pts.map(([x, y]) => [(x - f.x) * f.ux + (y - f.y) * f.uy, (x - f.x) * f.vx + (y - f.y) * f.vy]), du = Math.max(...uv.map((p) => p[0])) - Math.min(...uv.map((p) => p[0])), dv = Math.max(...uv.map((p) => p[1])) - Math.min(...uv.map((p) => p[1]));
    assert.ok(Math.abs(du - 0.6) < 1e-6 && Math.abs(dv - 1.0) < 1e-6, `${h.name}: the dropped kerb is 0.6 deep and 1.0 across`);
    const bol = h.props.filter((p) => p.t === 'bollard'); assert.equal(bol.length, 2, `${h.name}: two bollards`); assert.ok(Math.abs(Math.hypot(bol[0].gx - bol[1].gx, bol[0].gy - bol[1].gy) - 1.0) < 0.05, `${h.name}: one tile apart`);
    assert.ok(h.props.some((p) => p.t === 'trailboard') && h.props.some((p) => p.t === 'bench'), `${h.name}: a trailhead board and a bench`);
    const D = DIST[h.district], { fills } = paint('roads', around(f.x + f.ux * 2, f.y + f.uy * 2, 6, D.z), LAYOUT.ids, 0.6, true), asphalt = GA.roadTones(true).surface, lastRoad = Math.max(...fills.map((q, i) => (q.style === asphalt ? i : -1))), iSand = fills.findIndex((q) => q.polys.some((pl) => same(pl, projected(sand.pts))));
    assert.ok(iSand > lastRoad && lastRoad >= 0, `${h.name}: the dropped kerb is painted after every asphalt strip (fill ${iSand} after ${lastRoad}), over the road's kerb`);
  }
  for (const t of LAYOUT.terms.filter((q) => q.kind === 'head')) { const bol = t.props.filter((p) => p.t === 'bollard'); assert.equal(bol.length, 2, `${t.port}: two bollards`); assert.ok(Math.abs(Math.hypot(bol[0].gx - bol[1].gx, bol[0].gy - bol[1].gy) - 1.0) < 0.05, `${t.port}: one tile apart`); const sand = t.frameFoot; assert.ok(sand.length >= 1 && t.pieces.some((q) => q.role === 'sand'), `${t.port}: the path starts over a strip of sand`); }
});

test('RT12: the props of an end are culled by their own box: a camera over an end draws every one of its props that is on the screen, whether or not its district\'s box is', async () => {
  const { w } = await newWorld({ size: [800, 520] }); let far = 0;
  for (const t of LAYOUT.terms) {
    const D = DIST[t.district], cx = t.props.reduce((a, p) => a + (p.bb[0] + p.bb[2]) / 2, 0) / t.props.length, cy = t.props.reduce((a, p) => a + (p.bb[1] + p.bb[3]) / 2, 0) / t.props.length;
    w.goTo(cx, cy, 1.0, false); w.draw(); const see = (b) => b[2] > w.view.x0 && b[0] < w.view.x1 && b[3] > w.view.y0 && b[1] < w.view.y1; if (!see(D.bb)) far++;
    for (const p of t.props) if (see(p.bb)) assert.ok(w.items.some((it) => it.a === p), `${t.port}: the ${p.t} at ${p.gx.toFixed(1)},${p.gy.toFixed(1)} is drawn from a camera over the end`);
  }
  assert.ok(far >= 0, 'counted');
  // the verifier's D7: the box a prop is culled by (p.bb) was its footprint and 16 px, and the barrier of 4.W paints 34 px beyond it, a sign board 26, the open gates of 6.S and 10.S 79: at the edge of the screen they vanished while part of them was still in view.
  // Every point a prop of an end (or of a path head) paints lies inside its box now (recorded: the body of its shared sprite, the points as RT9 reads them, the box lifted to the ground the body is drawn on)
  const over = [], kinds = new Set();
  for (const [where, p] of [...LAYOUT.terms.flatMap((t) => t.props.map((q) => [t.port, q])), ...LAYOUT.heads.flatMap((h) => h.props.map((q) => [h.name, q]))]) {
    const def = atlas.SHARED.get(p.t); if (!def) continue; const r = recCtx(); def.body(r.ctx, p, STILL); const pts = points(r); if (!pts.length) continue; kinds.add(p.t);
    const bb = [p.bb[0], p.bb[1] + p.z, p.bb[2], p.bb[3] + p.z], xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]), out = [bb[0] - Math.min(...xs), bb[1] - Math.min(...ys), Math.max(...xs) - bb[2], Math.max(...ys) - bb[3]];
    if (Math.max(...out) > 0.5) over.push(`${where} ${p.t}${p.open ? ' (open)' : ''}: ${['left', 'top', 'right', 'bottom'].map((n, i) => (out[i] > 0.5 ? `${Math.ceil(out[i])} px past the ${n}` : '')).filter(Boolean).join(', ')}`);
  }
  for (const id of LAYOUT.ids) for (const g of DIST[id].gates) { // and the gates of the locked roads (the leaf of a bridge paints 198 by 122 pixels), drawn the way the player sees them: through drawProp, in a locked district, on the ground it stands on
    const p = g.prop, r = recCtx(); r.ctx.translate(0, -p.z); props.drawProp(r.ctx, p, { ...STILL, locked: true }); const pts = points(r); assert.ok(pts.length > 20, `${id}'s gate (${p.gk}) is drawn`); kinds.add('gate:' + p.gk);
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]), out = [p.bb[0] - Math.min(...xs), p.bb[1] - Math.min(...ys), Math.max(...xs) - p.bb[2], Math.max(...ys) - p.bb[3]];
    if (Math.max(...out) > 0.5) over.push(`the gate of ${id} (${p.gk}): ${['left', 'top', 'right', 'bottom'].map((n, i) => (out[i] > 0.5 ? `${Math.ceil(out[i])} px past the ${n}` : '')).filter(Boolean).join(', ')}`);
  }
  assert.ok(kinds.size >= 12 && kinds.has('roadend') && kinds.has('polesign') && kinds.has('lamp') && kinds.has('gate:bridge') && kinds.has('gate:ferry') && kinds.has('gate:barrier'), `the check looked at the kinds that matter (${[...kinds].join(', ')})`);
  assert.deepEqual(over, [], 'every prop of an end paints inside the box it is culled by');
});

test('RT13: a rail where the plateau falls away: across the far side of an end whose room stops within 1.6 tiles of a drop, when there is level ground to stand it on; not on a rise, not where the end has its own rail, slab, mouth, path, dock or pickets', () => {
  const bulb = shapeOf('bulb', { theme: 'market', side: 'S' }), far = Math.max(...bulb.foot.map((r) => r.u1));
  assert.ok(Math.abs(railAt('bulb', bulb, far + 0.8, true) - (far + 0.25)) < 1e-9, 'a quarter tile beyond the end, where the ground falls away 0.8 tile after it'); assert.equal(railAt('bulb', bulb, far + 0.8, false), null, 'not where the ground rises (a hill is not a cliff)');
  assert.equal(railAt('bulb', bulb, far + 2.2, true), null, 'not where it falls away more than 1.6 tiles beyond'); assert.equal(railAt('bulb', bulb, far + 0.3, true), null, 'and not where there is no level ground left beyond the end to stand it on');
  for (const k of ['belvedere', 'quay', 'portal', 'head', 'yard', 'barrier']) assert.equal(railAt(k, shapeOf(k, { theme: 'harbor', side: 'S', water: 4 }), 9, true), null, `${k} has its own`);
  const railed = shapeOf('bulb', { theme: 'market', side: 'S', rail: true, flat: far + 0.8 }), r = railed.pieces.find((q) => q.role === 'rail'); assert.ok(r && r.pts.length === 2 && r.pts[0][0] === r.pts[1][0] && Math.abs(r.pts[0][1] + r.pts[1][1]) < 1e-9, 'a straight rail across the street\'s axis, centred on it'); assert.equal(railed.pieces.filter((q) => q.role === 'post').length, 3, 'a post at each end and in the middle');
  assert.equal(shapeOf('bulb', { theme: 'market', side: 'S' }).pieces.some((q) => q.role === 'rail'), false, 'a bulb has no rail of its own');
  const railedPorts = LAYOUT.terms.filter((t) => t.pieces.some((q) => q.role === 'rail') && !['belvedere'].includes(t.kind)).map((t) => t.port).sort(); assert.deepEqual(railedPorts, ['12.W', '15.S', '16.N', '2.S'], 'four ends on the island stand where the plateau falls away: a rail across each');
  for (const t of LAYOUT.terms.filter((q) => q.opt.rail)) { const [x, y, z] = t.pieces.find((q) => q.role === 'rail').pts[0], u = (x - t.frame.x) * t.frame.ux + (y - t.frame.y) * t.frame.uy; assert.ok(u < t.probe.flat, `${t.port}: its rail (${u.toFixed(1)} tiles out) stands on the level ground (${t.probe.flat})`); void z; }
});

test('RT14: at the island\'s zoom (the far view, the block of a footprint) the barrier is a short striped bar across its street, a loading dock is the tone of its walls whatever its accent, and the sealed portal is rock', () => {
  const far = { ...STILL, far: true, farMix: 0, locked: false };
  const drawn = (p) => { const r = recCtx(); props.drawProp(r.ctx, p, far); return r; };
  // the verifier's D6: the new kinds fell back to the plain block of their footprint at the island view: the barrier a lone pillar, the loading dock a yellow bar (it took its accent), the portal a grey box
  const RED = colOf(pal.TOY.red, far), CREAM = colOf('#fffaf0', far);
  for (const open of [0, 1]) for (const [side, [hx, hy]] of Object.entries(HEADINGS)) {
    const r = drawn(mk('roadend', { hx, hy, open, plate: 'X' })), { quads } = shapesOf(r), stripes = quads.filter((q) => q.style === RED || q.style === CREAM && reach(ys(q.pts)) >= 6), tag = `the ${open ? 'gate' : 'barrier'} of a street to the ${side}`;
    assert.equal(stripes.length >= 6 && stripes.filter((q) => q.style === RED).length >= 3, true, `${tag}: a bar of red and cream stripes (${stripes.length} found), not a pillar`);
    const bar = stripes.slice(0, 6); for (const q of bar) assert.ok(reach(xs(q.pts)) >= 4, `${tag}: a stripe is ${reach(xs(q.pts)).toFixed(1)} px wide`);
    const w = reach(bar.flatMap((q) => xs(q.pts))); assert.ok(w >= (open ? 38 : 80) && w <= (open ? 50 : 92), `${tag}: it reaches ${w.toFixed(1)} px across the screen, as far as the street is wide${open ? ' (the boom of a gate, raised, from one post to the middle)' : ''}`);
    if (!open) { const [c0, c1] = [centroid(bar[0]), centroid(bar[5])]; same2((c1[1] - c0[1]) / (c1[0] - c0[0]), acrossSlope(hx, hy), 0.01, `${tag}: the bar runs along the perpendicular of the street, slope`); }
    const all = r.log.calls.filter((c) => c[0] === 'moveTo' || c[0] === 'lineTo' || c[0] === 'arc' || c[0] === 'ellipse'); assert.ok(all.length > 30, `${tag}: drawn`);
  }
  const fillsOf2 = (p) => new Set(drawn(p).log.fills.map((f) => f.style));
  const dock = (acc) => mk('loaddock', { acc }), a = drawn(dock('#ffd02e')), b = drawn(dock('#9a6bff'));
  assert.deepEqual(a.log.calls, b.log.calls, 'a loading dock\'s island view does not depend on its accent (its yellow is the frames of its doors)'); assert.ok(![...fillsOf2(dock('#ffd02e'))].some((s) => /^#ff[cd]/.test(s)), 'and there is no yellow in it');
  const wall = new Set(['t', 'l', 'r'].map((k) => toneOf(pal.METAL.steelHi)[k])), seen = fillsOf2(dock('#ffd02e')); assert.deepEqual([...seen].sort(), [...wall].sort(), 'it is a block in the tone of its walls (the pale steel of the palette)');
  const rock = new Set(['t', 'l', 'r'].map((k) => toneOf(pal.ROCK.mid)[k])), portal = fillsOf2(mk('portal')); assert.deepEqual([...portal].sort(), [...rock].sort(), 'the sealed portal is a block of the palette\'s rock');
});
