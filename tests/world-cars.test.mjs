// The traffic of the island's roads (js/world/ents-actors.js `cars`, js/world/vehicles.js, js/world/orient.js). A recording of the live site and a look at the code found cars that slid: a lane was a fixed offset
// from a line that turned in one point (so a car jumped sideways at every bend), a car had two pictures (along one axis of the grid or the other: on a diagonal road it faced the wrong way), and its speed was a
// share of the road's length, so one on a long road flew and one on a short road crawled.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx } from './helpers/recctx.mjs';

const { actorMethods, CARS, CAR_SPEED, CAR_EDGES } = await import('../js/world/ents-actors.js');
const { headingBucket, carSprite, HEADINGS, CAR_RECT } = await import('../js/world/vehicles.js');
const { visibleFaces, footprint } = await import('../js/world/orient.js');

const world = (open = Array.from({ length: 16 }, (_, i) => i + 1)) => ({ ...actorMethods, t: 0, unlocked: new Set(open), carList: Array.from({ length: CARS }, () => ({ gx: 0, gy: 0, i: 0, key: 0, horiz: true, fade: 1, ang: 0 })) });
const at = (w, t) => { w.t = t; return w.cars().map((c) => ({ ...c })); };
const edgeOf = (c) => CAR_EDGES[(c.i * 7) % CAR_EDGES.length];
const nearest = (e, x, y) => { let best = Infinity, q = null, dir = null; for (let i = 0; i + 1 < e.pts.length; i++) { const [ax, ay] = e.pts[i], [bx, by] = e.pts[i + 1], l2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1, k = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2)), px = ax + (bx - ax) * k, py = ay + (by - ay) * k, d = Math.hypot(x - px, y - py); if (d < best) { best = d; q = [px, py]; dir = [bx - ax, by - ay]; } } return { d: best, q, dir }; };
const deg = (a) => (a * 180) / Math.PI;
const turn = (a, b) => { let d = Math.abs(a - b) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; return deg(d); };

test('one car to each of the eighteen roads: no footpath, no ferry and no fork\'s stem carries one (a fork is three edges now, and with them `(i * 7) % 21` would have put eighteen cars on three roads), and every car has a road of its own', () => {
  assert.equal(CAR_EDGES.length, CARS, 'as many roads as cars');
  assert.ok(CAR_EDGES.every((e) => !e.path && !e.ferry && !e.stem), 'the roads between districts, not the stem of a fork');
  assert.equal(new Set(Array.from({ length: CARS }, (_, i) => (i * 7) % CAR_EDGES.length)).size, CARS, 'no two cars on one road: 7 and the number of roads share no factor');
  const w = world(); w.t = 12345; assert.equal(new Set(w.cars().map((c) => edgeOf(c).n)).size, CARS, 'and eighteen roads are driven');
});

test('a car keeps to its lane through every bend: half a tile from the middle of the road, on the same side of its heading, whatever the road and the moment', () => {
  const w = world(), sides = new Set(); let worst = 0, n = 0;
  for (let t = 0; t < 60000; t += 250) for (const c of at(w, t)) {
    const e = edgeOf(c), r = nearest(e, c.gx, c.gy); worst = Math.max(worst, Math.abs(r.d - 0.5)); n++;
    const hx = Math.cos(c.ang), hy = Math.sin(c.ang); sides.add(Math.sign(hx * (c.gy - r.q[1]) - hy * (c.gx - r.q[0])));
  }
  assert.ok(n > 3000, `${n} samples`); assert.ok(worst < 0.09, `the lane is ${worst.toFixed(3)} tile off its half tile at worst`);
  assert.deepEqual([...sides], [sides.has(1) ? 1 : -1], 'every car on the same side of its heading (the same hand of traffic)');
});

test('a car faces the way it goes: its heading is the direction of its own motion within 14 degrees, and turns by at most 35 degrees in a tenth of a second', () => {
  const w = world(); let worstFace = 0, worstTurn = 0, moved = 0;
  for (let t = 0; t < 60000; t += 100) {
    const a = at(w, t), b = at(w, t + 50), c = at(w, t + 100);
    for (let i = 0; i < a.length; i++) {
      const dx = b[i].gx - a[i].gx, dy = b[i].gy - a[i].gy; if (Math.hypot(dx, dy) > 0.5 || Math.hypot(dx, dy) < 0.02 || Math.hypot(c[i].gx - a[i].gx, c[i].gy - a[i].gy) > 0.6) continue; // (a lap that wrapped, in the frames where the car is faded out at the end of its lane, or no motion)
      moved++; worstFace = Math.max(worstFace, turn(Math.atan2(dy, dx), a[i].ang)); worstTurn = Math.max(worstTurn, turn(a[i].ang, c[i].ang));
    }
  }
  assert.ok(moved > 3000, `${moved} samples`); assert.ok(worstFace < 14, `it faced ${worstFace.toFixed(1)} degrees off its motion at worst`); assert.ok(worstTurn < 35, `it turned ${worstTurn.toFixed(1)} degrees in a tenth of a second at worst`);
});

test('a car travels at a steady speed of about two and a half tiles a second on every road, a long one or a short one (it was a share of the road\'s length: 8 tiles a second on the long road)', () => {
  const w = world(), speed = new Map();
  for (let t = 0; t < 30000; t += 200) { const a = at(w, t), b = at(w, t + 200); for (let i = 0; i < a.length; i++) { const d = Math.hypot(b[i].gx - a[i].gx, b[i].gy - a[i].gy); if (d > 0.9 || d < 1e-6) continue; (speed.get(a[i].i) || speed.set(a[i].i, []).get(a[i].i)).push(d / 0.2); } }
  assert.equal(speed.size, CARS, 'every car was seen');
  const mean = [...speed.values()].map((v) => v.reduce((s, x) => s + x, 0) / v.length);
  for (const m of mean) assert.ok(m > CAR_SPEED * 0.8 && m < CAR_SPEED * 1.2, `a mean speed of ${m.toFixed(2)} tiles a second`);
  assert.ok(Math.max(...mean) / Math.min(...mean) < 1.35, 'and no car is much faster than another');
  assert.ok(CAR_SPEED >= 2.2 && CAR_SPEED <= 2.9, 'about two and a half');
});

test('a car fades in and out at the ends of its lane and is whole between, and only the open roads have traffic', () => {
  const w = world(); let whole = 0, faded = 0;
  for (let t = 0; t < 60000; t += 300) for (const c of at(w, t)) { assert.ok(c.fade >= 0 && c.fade <= 1); if (c.fade === 1) whole++; else faded++; }
  assert.ok(whole > faded && faded > 0, `${whole} frames whole, ${faded} fading`);
  assert.equal(at(world([1]), 5000).length, 0, 'with only the first district open no road is open');
  const some = at(world([1, 2, 3, 4]), 5000); assert.ok(some.length > 0 && some.every((c) => [1, 2, 3, 4].includes(edgeOf(c).gate)), 'a road is open when its district is');
});

test('a heading is one of sixteen: the bucket of an angle wraps round the circle and each of the sixteen is reachable', () => {
  assert.equal(HEADINGS, 16);
  assert.equal(headingBucket(0), 0); assert.equal(headingBucket(Math.PI / 2), 4); assert.equal(headingBucket(Math.PI), 8); assert.equal(headingBucket(-Math.PI / 2), 12); assert.equal(headingBucket(2 * Math.PI), 0); assert.equal(headingBucket(-0.01), 0);
  assert.equal(new Set(Array.from({ length: 64 }, (_, i) => headingBucket((i / 64) * 2 * Math.PI))).size, 16);
});

test('a box turned to any heading shows only what the camera sees: the top and the sides facing the lower half of the screen, each in one flat tone', () => {
  const counts = Array.from({ length: 8 }, (_, k) => visibleFaces(0, 0, 1.1, 0.56, (k * Math.PI) / 4).sides.length);
  assert.deepEqual(counts, [2, 1, 2, 1, 2, 1, 2, 1], 'two sides when the box is square to the grid, one when it is diagonal');
  for (let k = 0; k < 16; k++) { const F = visibleFaces(3, -2, 1.1, 0.56, (k * Math.PI) / 8); let a = 0; for (let i = 0; i < 4; i++) { const [x0, y0] = F.top[i], [x1, y1] = F.top[(i + 1) % 4]; a += x0 * y1 - x1 * y0; } assert.ok(Math.abs(Math.abs(a / 2) - 1.1 * 0.56) < 1e-9, 'the footprint keeps its area at every turn'); assert.ok(F.sides.every((s) => s.shade >= 0 && s.shade <= 1)); }
  const f0 = visibleFaces(0, 0, 1, 1, 0).sides; assert.ok(f0.find((s) => s.i === 1).shade > f0.find((s) => s.i === 0).shade, 'the side that faces +gy is in the sun, the one that faces +gx in the shade');
  assert.equal(footprint(0, 0, 2, 1, 0).length, 4);
});

test('the car sprite is drawn for every heading, inside the rectangle the atlas keeps for it, and the sixteen pictures differ', () => {
  const pics = new Set(); const [x0, y0, x1, y1] = CAR_RECT;
  for (let b = 0; b < HEADINGS; b++) {
    const rec = recCtx(); carSprite(rec.ctx, '#c0392b', b); const calls = rec.log.calls; pics.add(JSON.stringify(calls));
    for (const [name, ...a] of calls) {
      let pts = [];
      if (name === 'moveTo' || name === 'lineTo') pts = [[a[0], a[1]]]; else if (name === 'ellipse') pts = [[a[0] - a[2], a[1] - a[3]], [a[0] + a[2], a[1] + a[3]]]; else if (name === 'arc') pts = [[a[0] - a[2], a[1] - a[2]], [a[0] + a[2], a[1] + a[2]]]; else if (name === 'fillRect') pts = [[a[0], a[1]], [a[0] + a[2], a[1] + a[3]]];
      for (const [x, y] of pts) assert.ok(x >= x0 - 0.5 && x <= x1 + 0.5 && y >= y0 - 0.5 && y <= y1 + 0.5, `heading ${b}: ${name} reaches ${x.toFixed(1)}, ${y.toFixed(1)} outside ${CAR_RECT}`);
    }
    assert.ok(calls.length > 12, 'something was drawn');
  }
  assert.equal(pics.size, HEADINGS, 'every heading is its own picture');
});
