// Classmates in the world (js/world/peers.js, docs/RENDER_PLAN.md): the flat figures of the other students who are playing in a district, standing round that district's home spot with a name tag over the head.
//   A  the hook and the way in: World.setPeers keeps a bounded, re-checked copy; the layer's module is loaded by import() when the first figure is given and is in no static graph; the layer's row in the stack
//   B  where a classmate stands (a ring round the home spot, inside the district, on level ground, nobody on another's place) and what a classmate looks like (a function of the pid alone)
//   C  what is drawn: one figure for each, at most 24 a district and a quiet "+N more", the fade in and out (a cut under reduced motion), the name tags as canvas text, nothing at all for an empty list
// No browser: the canvas stub of tests/helpers/worldstub.mjs and the recording context of tests/helpers/recctx.mjs. Run: node --test tests/world-peers.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recCtx } from './helpers/recctx.mjs';
import { newWorld } from './helpers/worldstub.mjs';
import { walk } from '../scripts/preload.mjs';
import { LAYERS, FLAGS, setFlag, slotFor, layerInfo } from '../js/world/stack.js';
import { ZONES } from '../js/data/index.js';
import { DIST, SPOTS, PLOTS, LAYOUT, BW, BD, zAt, zoneAt } from '../js/world/layout.js';
import { strHash, P, clamp } from '../js/world/iso.js';
import { PEOPLE, TOY, personLook } from '../js/world/palette.js';
import { BUILDS, LEGS, MARKS, STYLES } from '../js/world/figure.js';
import { lookV2 } from '../js/world/characters.js';

const peers = () => import('../js/world/peers.js');
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ok = (pid, name, z) => ({ pid, name, z });
const ids = (n, from = 0) => Array.from({ length: n }, (_, i) => 'PC-' + String(from + i).padStart(4, '0'));
const crowd = (n, z, from = 0) => ids(n, from).map((pid, i) => ok(pid, 'Pal ' + (from + i), z));
/** Every district open, so that no classmate stands under cloud. */
const openAll = (w, game) => { game.s.auditFirst = true; game.s.cash = ZONES[16].gate + 50; game._unlock(); w.sync(); };
const loaded = async (w) => { await w.peerLoad; return w.peerLayer; };

// ====================================================================================================================================
// A. The hook and the way in
// ====================================================================================================================================

test('A1 laziness: the layer\'s module is in no static graph, only the world imports it, and the world loads it when the first figure is given and not before', async () => {
  const g = walk();
  assert.ok(g.dynamic.includes('js/world/peers.js'), 'it is one more lazy module of the site');
  assert.ok(!g.static.includes('js/world/peers.js'), 'and the first screen does not reach it');
  const by = Object.entries(g.edges).filter(([, e]) => [...e.statics, ...e.dynamics].includes('js/world/peers.js')).map(([f, e]) => [f, e.statics.includes('js/world/peers.js')]);
  assert.deepEqual(by, [['js/world/world.js', false]], 'imported by the world alone, with import() and never statically');
  const { w } = await newWorld();
  assert.equal(w.peerLayer, null); assert.equal(w.peerLoad, null);
  w.setPeers([]); w.setPeers(null); w.setPeers([{ pid: 5, name: 'x', z: 2 }]);
  assert.equal(w.peerLoad, null, 'an empty list, no list and a list of nothing valid load nothing');
  assert.equal(slotFor('peers').impl, 'legacy', 'and the layer has no drawer yet');
  w.setPeers([ok('PC-0001', 'Ada', 2)]);
  assert.ok(w.peerLoad instanceof Promise, 'the first figure starts the import');
  const mod = await loaded(w);
  assert.equal(typeof mod.queue, 'function'); assert.equal(typeof mod.set, 'function');
  assert.equal(slotFor('peers').impl, 'v2', 'and the module registered the layer\'s drawer when it loaded');
});

test('A2 setPeers keeps a fresh copy of what is valid: pid a string, name a string cut to 24, z a district 1 to 16; anything else is dropped', async () => {
  const { w } = await newWorld();
  const mine = [ok('A1', 'Ada', 3), ok('B2', 'Bo', 16), ok('C3', 'x'.repeat(40), 1)];
  w.setPeers(mine);
  assert.deepEqual(w.peerList, [{ pid: 'A1', name: 'Ada', z: 3 }, { pid: 'B2', name: 'Bo', z: 16 }, { pid: 'C3', name: 'x'.repeat(24), z: 1 }]);
  assert.notEqual(w.peerList[0], mine[0], 'a copy, not the caller\'s records');
  mine[0].name = 'changed'; mine.length = 0;
  assert.equal(w.peerList[0].name, 'Ada', 'whatever the caller does with its list afterwards');
  const bad = [
    ok('p', 'n', 0), ok('p', 'n', 17), ok('p', 'n', 3.5), ok('p', 'n', '3'), ok('p', 'n', NaN), ok('p', 'n', Infinity), ok('p', 'n', -1), ok('p', 'n', null), ok('p', 'n', undefined), ok('p', 'n', 1e9), ok('p', 'n', [3]), ok('p', 'n', { valueOf: () => 3 }),
    ok(undefined, 'n', 3), ok('', 'n', 3), ok(5, 'n', 3), ok({}, 'n', 3), ok([], 'n', 3), ok(null, 'n', 3), ok('x'.repeat(49), 'n', 3),
    ok('p', undefined, 3), ok('p', 5, 3), ok('p', null, 3), ok('p', {}, 3), ok('p', ['Ada'], 3), ok('p', new String('Ada'), 3),
    null, undefined, 5, 'Ada', true, [], () => {}, Symbol('s'),
  ];
  w.setPeers(bad);
  assert.deepEqual(w.peerList, [], 'every one of these is dropped');
  w.setPeers([ok('x'.repeat(48), 'n', 3), ...bad, ok('z', 'n', 16)]);
  assert.deepEqual(w.peerList.map((p) => p.pid.length), [48, 1], 'a pid of 48 is a pid, one of 49 is not; the good ones among the bad are kept');
});

test('A3 setPeers: a name is text of at most 24 characters with no control characters, bidi marks or lone surrogates; a blank one stays a figure without a tag', async () => {
  const { w } = await newWorld();
  const C1 = String.fromCharCode(0x85, 0x9f), RLO = String.fromCodePoint(0x202e), LS = String.fromCodePoint(0x2028), ZWSP = String.fromCodePoint(0x200b), BOMB = String.fromCodePoint(0xfeff), GRIN = String.fromCodePoint(0x1f600);
  const names = ['Ada\x00Lo\x1fve\x7f', 'Ad' + C1 + 'a', 'Ada' + RLO + 'live', 'two' + LS + 'lines', 'a' + ZWSP + 'b' + BOMB + 'c', '  Ada Lovelace  ', GRIN.repeat(20), 'x'.repeat(5e6), 'a'.repeat(30) + GRIN, '\x00\x01\x02', '   ', '<img src=x onerror=alert(1)>', '"><script>alert(1)</script>', String.fromCodePoint(0x3164), String.fromCodePoint(0x2800, 0x2800), 'x' + String.fromCodePoint(0xd83d) + 'y'];
  w.setPeers(names.map((n, i) => ok('P' + i, n, 2)));
  const got = w.peerList.map((p) => p.name);
  assert.deepEqual(got.slice(0, 6), ['AdaLove', 'Ada', 'Adalive', 'twolines', 'abc', 'Ada Lovelace']);
  assert.equal(got[6], GRIN.repeat(12), 'the cut falls between characters: twelve of an emoji that takes two units, never half of one');
  assert.equal(got[7], 'x'.repeat(24)); assert.equal(got[8], 'a'.repeat(24));
  assert.deepEqual(got.slice(9, 11), ['', ''], 'a name of nothing is an empty name');
  assert.equal(got[11], '<img src=x onerror=alert(1)>'.slice(0, 24), 'markup is text: it is kept as the letters it is made of (and drawn as canvas text, C)');
  assert.deepEqual(got.slice(13), ['', '', 'xy'], 'the blank fillers are no name (a blank chip is a tag that says nothing), and half of a pair is cut out');
  for (const n of got) { assert.ok(n.length <= 24, n); assert.doesNotThrow(() => encodeURIComponent(n), 'no lone surrogate'); assert.ok(!/[\x00-\x1f\x7f]/.test(n)); }
  assert.equal(w.peerList.length, names.length, 'a blank name does not cost the figure');
});

test('A4 setPeers: at most 400 entries, and the work is bounded: ten thousand entries are not even looked at', async () => {
  const { w } = await newWorld();
  const big = Array.from({ length: 10000 }, (_, i) => ok('P' + i, 'n' + i, 1 + (i % 16)));
  let touched = 0;
  const watched = new Proxy(big, { get(t, k) { if (typeof k === 'string' && /^\d+$/.test(k)) touched++; return t[k]; } });
  w.setPeers(watched);
  assert.equal(w.peerList.length, 400); assert.deepEqual(w.peerList.map((p) => p.pid), big.slice(0, 400).map((p) => p.pid), 'the first 400 stay');
  assert.ok(touched <= 801, `the loop looks at no more than twice the cap (${touched})`);
  const sparse = new Array(1e9); sparse[5] = ok('S5', 'five', 4); w.setPeers(sparse);
  assert.deepEqual(w.peerList.map((p) => p.pid), ['S5'], 'a sparse array of a billion holes is read in bounded time');
  w.setPeers(Array.from({ length: 450 }, (_, i) => (i % 2 ? null : ok('Q' + i, 'q', 5))));
  assert.equal(w.peerList.length, 225, 'bad entries do not count against the cap');
});

test('A5 setPeers: not a list is no list; a hostile one (a __proto__ key, a throwing getter, holes, doubles, extra fields) changes nothing outside itself', async () => {
  const { w } = await newWorld();
  for (const x of [undefined, null, 'Ada', 42, true, {}, { length: 3, 0: ok('a', 'b', 1) }, new Set([ok('a', 'b', 1)]), () => [ok('a', 'b', 1)], Symbol('s')]) { w.setPeers([ok('keep', 'k', 2)]); w.setPeers(x); assert.deepEqual(w.peerList, [], String(typeof x)); }
  const hostile = JSON.parse('[{"pid":"__proto__","name":"__proto__","z":2},{"pid":"constructor","name":"toString","z":2},{"pid":"a","name":"b","z":2,"__proto__":{"polluted":true},"extra":{"deep":1},"s":"play"}]');
  w.setPeers(hostile);
  assert.deepEqual(w.peerList.map((p) => p.pid), ['__proto__', 'constructor', 'a'], 'names that are properties of every object are names');
  for (const p of w.peerList) { assert.equal(Object.getPrototypeOf(p), Object.prototype); assert.deepEqual(Object.keys(p), ['pid', 'name', 'z'], 'three fields and no more'); assert.equal(p.polluted, undefined); }
  assert.equal({}.polluted, undefined, 'nothing reached Object.prototype');
  const loop = { get pid() { throw new Error('a getter that throws'); }, name: 'n', z: 3 };
  const bare = Object.assign(Object.create(null), ok('bare', 'No prototype', 6));
  w.setPeers([loop, undefined, ok('d', 'one', 3), , ok('d', 'two', 3), ok('d', 'elsewhere', 9), bare]); // eslint-disable-line no-sparse-arrays
  assert.deepEqual(w.peerList, [{ pid: 'd', name: 'one', z: 3 }, { pid: 'bare', name: 'No prototype', z: 6 }], 'the getter that throws and the hole are dropped, a pid counts once (the first), a record without a prototype is read like any other');
});

test('A6 setPeers: the same list again is no work; a changed list is, and wakes the loop', async () => {
  const { w } = await newWorld();
  const list = () => [ok('A', 'Ada', 3), ok('B', 'Bo', 4)];
  w.setPeers(list()); await loaded(w);
  const kept = w.peerList; w.dirty = false;
  w.setPeers(list()); assert.equal(w.peerList, kept, 'the stored copy is the one it was'); assert.equal(w.dirty, false, 'and the picture is not out of date');
  w.setPeers([ok('A', 'Ada', 3), ok('B', 'Bo', 5)]); assert.equal(w.dirty, true, 'a classmate who changed district is news');
  w.dirty = false; w.setPeers([ok('A', 'Ada', 3), ok('B', 'Bob', 5)]); assert.equal(w.dirty, true, 'and so is a new alias');
  w.dirty = false; w.setPeers([]); assert.equal(w.dirty, true, 'and so is everybody leaving'); assert.deepEqual(w.peerList, []);
});

test('A7 the stack has the layer: a row owned by T4 in the things, lazy, whose legacy drawer is the old picture\'s (no classmates) and draws nothing', async () => {
  const L = layerInfo('peers');
  assert.ok(L, 'a row called peers'); assert.equal(L.owner, 'T4'); assert.equal(L.space, 'inherit'); assert.equal(L.stage, 'things'); assert.equal(L.lazy, true, 'its V2 drawer is registered by a module that loads later');
  assert.equal(LAYERS.at(LAYERS.findIndex((l) => l.id === 'player') + 1).id, 'peers', 'drawn in the list of the things, after the player');
  assert.equal(FLAGS.peers, 'v2', 'on by default, like every layer');
  const { w } = await newWorld(); const r = recCtx();
  assert.equal(typeof w.drawPeer, 'function'); L.legacy(r.ctx, {}, {}, w, { pid: 'x' });
  assert.equal(r.log.calls.length, 0, 'the legacy picture has no classmates');
  setFlag('peers', 'v2');
});

test('A8 the screen that owns the world gives it the classmates on every update, once, and guards a session without figures', () => {
  const src = read('js/ui/worldview.js');
  assert.match(src, /world\.sync\(\);\s*\n\s*world\.setPeers\(S\.figures\?\.\(\) \?\? \[\]\);/, 'update() brings the world up to date from the session: the game, then the classmates');
  assert.equal((src.match(/setPeers\(/g) || []).length, 1, 'one call');
  assert.doesNotMatch(src, /import\(['"]\.\.\/world\/peers\.js/, 'the screen does not load the layer: the world does');
});

// ====================================================================================================================================
// B. Where a classmate stands, and what a classmate looks like
// ====================================================================================================================================

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const minGap = (pts) => { let m = Infinity; for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) m = Math.min(m, dist(pts[i], pts[j])); return m; };
const inside = (r, [x, y], m = 0) => x > r[0] - m && x < r[0] + r[2] + m && y > r[1] - m && y < r[1] + r[3] + m;

test('B1 the places round a home spot: in every district at least 30, inside its block, on level ground, nearest first, clear of the buildings, the plots, the stash yard and the places where buyers and lots stand', async () => {
  const { slotsOf, PEER_CAP } = await peers();
  assert.equal(PEER_CAP, 24);
  for (const z of LAYOUT.ids) {
    const D = DIST[z], S = SPOTS[z], slots = slotsOf(z);
    assert.ok(slots.length >= PEER_CAP + 6, `district ${z} has ${slots.length} places`);
    for (const p of slots) {
      assert.equal(zoneAt(p[0], p[1]), z, `district ${z}: ${p} is in its block`);
      assert.ok(p[0] > D.ox + 0.9 && p[0] < D.ox + BW - 0.9 && p[1] > D.oy + 0.9 && p[1] < D.oy + BD - 0.9, `district ${z}: ${p} keeps off the edge of the block`);
      assert.ok(Math.abs(zAt(p[0], p[1]) - D.z) <= 2, `district ${z}: ${p} is on the level ground of the plateau`);
      assert.ok(dist(p, S.home) >= 1.9, `district ${z}: ${p} leaves the player's own spot clear`);
      for (const q of D.props) if (q.solid) assert.ok(!inside([q.gx, q.gy, q.w, q.d], p, 0.3), `district ${z}: ${p} is inside a ${q.t}`);
      for (const q of PLOTS[z]) assert.ok(!inside([q[0], q[1], 3, 3], p, 0.3), `district ${z}: ${p} is on a plot`);
      assert.ok(!inside(D.stashRect, p, 0.3), `district ${z}: ${p} is in the stash yard`);
      for (const q of S.leads) assert.ok(dist(p, q) >= 1.0, `district ${z}: ${p} stands on a buyer's place`);
      for (const q of S.lots) assert.ok(dist(p, q) >= 0.8, `district ${z}: ${p} stands on a lot's place`);
    }
    assert.ok(minGap(slots) >= 1.2, `district ${z}: no two places closer than 1.2 tiles (${minGap(slots).toFixed(2)})`);
    const radii = slots.map((p) => dist(p, S.home)); assert.deepEqual(radii, radii.slice().sort((a, b) => a - b), `district ${z}: nearest first`);
    assert.equal(slotsOf(z), slotsOf(z), 'worked out once');
  }
});

test('B2 placeIn: every classmate gets a place of his own, the same one every time, whoever is in the other districts and in whatever order they are listed', async () => {
  const { placeIn, slotsOf, PEER_CAP } = await peers();
  for (const z of [1, 7, 12, 16]) {
    const pool = slotsOf(z), pids = ids(PEER_CAP, z * 100), at = placeIn(z, pids);
    assert.ok(at instanceof Map); assert.equal(at.size, PEER_CAP);
    const places = pids.map((p) => at.get(p));
    for (const p of places) assert.ok(pool.some((q) => q[0] === p[0] && q[1] === p[1]), `district ${z}: a place from the ring`);
    assert.equal(new Set(places.map(String)).size, PEER_CAP, `district ${z}: no two on the same place`);
    assert.ok(minGap(places) >= 1.2, `district ${z}: and none closer than 1.2 tiles`);
    placeIn(z === 1 ? 2 : 1, ids(9, 5000));                                                // another district being worked out in between
    assert.deepEqual([...placeIn(z, pids)], [...at], 'the same list gives the same places');
    assert.deepEqual(pids.map((p) => placeIn(z, pids.slice().reverse()).get(p)), places, 'in whatever order they are listed');
    assert.deepEqual(pids.map((p) => placeIn(z, [...pids.slice(7), ...pids.slice(0, 7)]).get(p)), places);
  }
});

test('B3 placeIn: a place is a function of the pid (alone it is the same every time, and pids are spread over the ring, nearer the home spot more often), and more people than places are not put on top of each other', async () => {
  const { placeIn, slotsOf } = await peers();
  const z = 5, S = SPOTS[z], pool = slotsOf(z), lone = ids(200, 900).map((p) => [p, placeIn(z, [p]).get(p)]);
  for (const [p, at] of lone.slice(0, 20)) assert.deepEqual(placeIn(z, [p]).get(p), at, 'the same alone, every time');
  assert.ok(new Set(lone.map(([, a]) => String(a))).size >= pool.length * 0.6, 'the pids are spread over the places');
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  assert.ok(mean(lone.map(([, a]) => dist(a, S.home))) < mean(pool.map((a) => dist(a, S.home))) * 0.85, 'and stand nearer the home spot than the ring is wide on average: a small class gathers round it');
  const many = placeIn(z, ids(pool.length + 40, 7000));
  assert.equal(many.size, pool.length, 'more people than places: the places are all there are'); assert.equal(new Set([...many.values()].map(String)).size, many.size);
  const odd = placeIn(z, ['__proto__', 'constructor', 'toString', 'hasOwnProperty']);
  assert.equal(odd.size, 4, 'a pid that is a property of every object is a pid'); assert.equal(Object.getPrototypeOf({}), Object.prototype);
  assert.equal(placeIn(z, []).size, 0);
});

test('B4 peerLook: a classmate looks the same on every screen: personLook of the pid\'s hash and a build, legs, mark and hair from the lists of figure.js, as a buyer does, and no hat or accessory', async () => {
  const { peerLook } = await peers();
  for (const pid of ['PC-A1B2', 'Ada', '__proto__', 'x'.repeat(48)]) {
    const a = peerLook(pid), b = peerLook(pid), h = strHash(pid), base = personLook(h);
    assert.deepEqual(a, b, 'a function of the pid alone');
    for (const k of ['shirt', 'hair', 'skin', 'pants', 'accent', 'shoe', 'sole']) assert.equal(a[k], base[k], `${k} is the palette's, from the pid's hash`);
    const buyer = lookV2({ id: pid, seg: '' });
    for (const k of ['style', 'build', 'legs', 'mark', 'ph', 'blinkEvery']) assert.equal(a[k], buyer[k], `${k} is chosen as lookV2 chooses it`);
    assert.ok(STYLES.includes(a.style) && BUILDS.includes(a.build) && LEGS.includes(a.legs) && MARKS.includes(a.mark));
    assert.ok(!a.role.head && !a.role.torso && !a.role.item && !a.role.face, 'nothing worn by role');
    assert.ok(a.dir === 1 || a.dir === -1);
  }
  const looks = ids(300, 0).map(peerLook);
  assert.ok(new Set(looks.map((l) => l.shirt)).size >= 10 && new Set(looks.map((l) => l.hair)).size >= 5 && new Set(looks.map((l) => l.skin)).size >= 5, 'the palette of 2.6 is in use');
  assert.equal(new Set(looks.map((l) => l.build)).size, BUILDS.length); assert.equal(new Set(looks.map((l) => l.style)).size, STYLES.length);
  for (const l of looks) { assert.ok(PEOPLE.shirts.includes(l.shirt)); assert.notEqual(l.shirt.toLowerCase(), TOY.red.toLowerCase(), 'no classmate wears the player\'s jacket'); }
  assert.ok(new Set(ids(60).map((p) => JSON.stringify(peerLook(p)))).size >= 55, 'and two people rarely look alike');
});

// ====================================================================================================================================
// C. What is drawn
// ====================================================================================================================================

/** The world the way the frame loop leaves it at time t (the visual clock, 0 for reduced motion): one frame, and the classmates' items of the depth-sorted list. */
const frame = (w, t) => { w.t = t; w.vt = t; w.env.t = t; w.dirty = true; w.draw(); return w.items.filter((i) => i.k === 'q').map((i) => i.a); };
/** The camera on a district's home spot at a zoom, instantly. */
const lookAt = (w, z, zoom) => { const [hx, hy] = SPOTS[z].home, [x, y] = P(hx, hy, zAt(hx, hy)); w.cam.x = x; w.cam.y = y; w.cam.z = zoom; w.clampCam(); w.camTo = null; w.dirty = true; };
/** A world, every district open, a big window, the camera at a district's home spot, the module loaded and the list given; the clock stands still until a test moves it. */
async function stage(list, { z = 3, zoom = 1, size = [1600, 1000] } = {}) {
  const { w, game } = await newWorld({ size }); openAll(w, game); w.setPeers(list); await loaded(w); lookAt(w, z, zoom); return w;
}
const qs8 = (s) => Math.round(s * 8) / 8;
/** The peers' name tags (and counts) of the last frame: { o, text, x0, x1, y0, y1 } on the screen. The layer marks its own entries of the overlay; the world's other chips ("You", "+ Hire", a gate's note) are not these. Each tag is made to draw itself on a recording context, so what it says is what it would paint. */
function tags(w) {
  const s = qs8(clamp(w.cam.z, 0.75, 1.25)), sq = qs8(Math.max(0.75, s * 0.85)), out = [];
  for (const o of w.overlay) {
    if (o.k !== 'chip' || !o.peer) continue;
    const r = recCtx(); o.draw(r.ctx, 200, 200, s); const text = (r.log.calls.find((c) => c[0] === 'fillText') || [])[1]; if (text === undefined) continue;
    const hw = ((o.n * 6.7 + 14) * sq) / 2, hh = (18 * sq) / 2; out.push({ o, text, on: o.on, x0: o.px - hw, x1: o.px + hw, y0: o.py - hh, y1: o.py + hh, log: r.log });
  }
  return out;
}
const apart = (a, b) => a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;
/** A canvas that keeps its alpha as Safari does (a 32-bit float; a value out of range is ignored, restore gives back the saved one), recording the alpha of every paint. */
function f32Ctx() {
  const t = { globalAlpha: 1, measureText: (s) => ({ width: String(s).length * 6 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), getTransform: () => ({}) }, saved = [], alphas = [];
  const ctx = new Proxy(t, {
    get(o, k) { if (k in o) return o[k]; if (typeof k === 'symbol') return undefined; return () => { if (k === 'save') saved.push(o.globalAlpha); else if (k === 'restore') { if (saved.length) o.globalAlpha = saved.pop(); } else if (k === 'fill' || k === 'fillRect' || k === 'fillText' || k === 'drawImage' || k === 'stroke') alphas.push(o.globalAlpha); }; },
    set(o, k, v) { if (k === 'globalAlpha') { if (v >= 0 && v <= 1) o.globalAlpha = Math.fround(v); } else o[k] = v; return true; },
  });
  return { ctx, alphas };
}

test('C1 one figure for each classmate, standing on the place its pid asks for, in its own district only, sorted into the depth list with the props, and no hit: a classmate is not a thing to click', async () => {
  const { placeIn } = await peers();
  const list = [...crowd(7, 3, 0), ...crowd(4, 12, 100)], w = await stage(list, { z: 3, zoom: 1 });
  assert.equal(frame(w, 1000).length, 0, 'a figure that has just come is not there yet: it comes in over half a second');
  const got = frame(w, 1600);
  assert.equal(got.length, 7, 'seven in the district in view, none of the four in the district far away');
  const at = placeIn(3, ids(7, 0));
  for (const r of got) {
    assert.equal(r.z, 3); assert.deepEqual([r.gx, r.gy], at.get(r.pid)); const [x, y] = P(r.gx, r.gy, zAt(r.gx, r.gy)); assert.deepEqual([r.x, r.y], [x, y], 'on the ground, at its height');
    assert.equal(r.k, r.gx + r.gy + 0.5, 'sorted like a buyer: just in front of a prop on its tile'); assert.equal(zoneAt(r.gx, r.gy), 3);
  }
  const keys = w.items.map((i) => i.key); assert.deepEqual(keys, keys.slice().sort((a, b) => a - b), 'and the list is in depth order with the props and the player');
  assert.equal(w.hits.filter((h) => /peer|classmate/i.test(String(h.kind))).length, 0, 'no hit shape'); assert.deepEqual([...(w.faults || [])], [], 'and nothing was reported');
  lookAt(w, 12, 1); assert.equal(frame(w, 1700).length, 4, 'the camera on the other district: those four');
});

test('C2 at most 24 are drawn in a district, chosen by pid, and a quiet "+N more" near the home spot counts the rest', async () => {
  const list = crowd(31, 4, 0).reverse(), w = await stage(list, { z: 4, zoom: 1 });
  frame(w, 1000); const got = frame(w, 1600);
  assert.equal(got.length, 24); assert.deepEqual(got.map((r) => r.pid).sort(), ids(24, 0), 'the first 24 pids, whatever the order the list came in');
  const more = tags(w).filter((t) => /more/.test(t.text)); assert.equal(more.length, 1); assert.equal(more[0].text, '+7 more');
  const [hx, hy] = SPOTS[4].home, [x, y] = P(hx, hy, zAt(hx, hy)); assert.ok(Math.abs(more[0].o.wx - x) < 1 && more[0].o.wy > y, 'under the home spot');
  w.setPeers(crowd(24, 4, 0)); frame(w, 1700); assert.equal(tags(w).filter((t) => /more/.test(t.text)).length, 1, 'it fades out, it does not blink out');
  frame(w, 2300); assert.equal(tags(w).filter((t) => /more/.test(t.text)).length, 0, 'and with 24 there is nothing to count');
  w.setPeers(crowd(24, 4, 0).concat(crowd(1, 9, 50))); frame(w, 2400); assert.equal(tags(w).filter((t) => /more/.test(t.text)).length, 0, 'a classmate in another district is counted in that one');
});

test('C3 appearing and leaving fade over about half a second; a classmate who moves to another district leaves one and arrives in the other', async () => {
  const w = await stage(crowd(3, 3, 0), { z: 3, zoom: 1 });
  frame(w, 1000); const a1 = frame(w, 1250); assert.equal(a1.length, 3); for (const r of a1) { assert.ok(Math.abs(r.a - 0.5) < 1e-9 && Math.abs(r.da - 0.5) < 1e-9, `half in at 250 ms (${r.a})`); }
  const a2 = frame(w, 1500); for (const r of a2) assert.equal(r.a, 1);
  frame(w, 1700); w.setPeers(crowd(2, 3, 0)); frame(w, 1700);                                  // one leaves at 1700
  const half = frame(w, 1950); assert.equal(half.length, 3, 'still there while it fades'); const gone = half.find((r) => r.pid === ids(3, 0)[2]); assert.ok(Math.abs(gone.a - 0.5) < 1e-9, 'half out at 250 ms');
  assert.equal(frame(w, 2300).length, 2, 'and gone after 500');
  w.setPeers([ok(ids(3, 0)[0], 'Pal 0', 3), ok(ids(3, 0)[1], 'Pal 1', 5)]); frame(w, 2400);
  const mid = frame(w, 2650); assert.deepEqual(mid.map((r) => r.z + ':' + r.pid).sort(), ['3:' + ids(3, 0)[0], '3:' + ids(3, 0)[1]].sort(), 'the one who left is fading out at his old place, and the one who arrived is not in view (another district)');
  assert.equal(mid.find((r) => r.pid === ids(3, 0)[1]).a < 1, true); lookAt(w, 5, 1); assert.deepEqual(frame(w, 3300).map((r) => r.z + ':' + r.pid), ['5:' + ids(3, 0)[1]], 'seen from the other district: he is there, whole, and the old place is empty');
});

test('C4 under reduced motion there is no fade and nothing moves: a classmate is there or not at once, and the picture is the same at any time', async () => {
  const w = await stage(crowd(4, 3, 0), { z: 3, zoom: 1 });
  w.setPeers(crowd(5, 3, 0));                                                                  // (the world's clock is 0 in a frame: that is what reduced motion means to a layer)
  assert.equal(frame(w, 0).length, 5, 'on the first frame, at full strength'); for (const r of frame(w, 0)) assert.equal(r.a, 1);
  w.setPeers(crowd(2, 3, 0)); assert.equal(frame(w, 0).length, 2, 'and gone at once');
  const still = frame(w, 0), rec = still[0], A = recCtx(), B = recCtx();
  slotFor('peers').draw(A.ctx, w.view, w.env, w, rec); w.t = 987654; slotFor('peers').draw(B.ctx, w.view, w.env, w, rec);
  assert.ok(A.log.calls.length > 40); assert.deepEqual(A.log.calls, B.log.calls, 'no bob, no blink: the same calls whenever it is drawn');
  const M1 = recCtx(), M2 = recCtx(); w.env.t = 1000; slotFor('peers').draw(M1.ctx, w.view, w.env, w, rec); w.env.t = 2100; slotFor('peers').draw(M2.ctx, w.view, w.env, w, rec);
  assert.notDeepEqual(M1.log.calls, M2.log.calls, 'with the clock running a classmate breathes');
});

test('C5 a figure is flat fills only, balanced, whole in alpha afterwards (on a float canvas too), a pill when far, the same twice, and fading draws at the fade', async () => {
  const w = await stage(crowd(2, 3, 0), { z: 3, zoom: 1 }); frame(w, 1000); const rec = frame(w, 1600)[0], env = w.env;
  const a = recCtx(); slotFor('peers').draw(a.ctx, w.view, env, w, rec);
  assert.ok(a.log.calls.length > 40 && a.log.fills.length > 30, 'dozens of flat fills'); assert.equal(a.log.strokes.length, 0, 'no outline'); assert.equal(a.log.depth, 0, 'save and restore balance'); assert.equal(a.state.globalAlpha, 1);
  const b = recCtx(); slotFor('peers').draw(b.ctx, w.view, env, w, rec); assert.deepEqual(a.log.calls, b.log.calls, 'the same picture twice');
  const look = rec.look; assert.ok(a.log.fills.some((f) => f.style === look.shirt) && a.log.fills.some((f) => f.style === look.skin), 'in the colors of its look');
  const far = recCtx(); slotFor('peers').draw(far.ctx, w.view, { ...env, far: true }, { cam: { z: 0.2 } }, rec); assert.ok(far.log.calls.length < a.log.calls.length / 4 && far.log.calls.length > 3, 'far: the pill the buyers use, a shirt and a head');
  rec.da = 0.37; const f = f32Ctx(); slotFor('peers').draw(f.ctx, w.view, env, w, rec);
  assert.equal(f.ctx.globalAlpha, 1, 'the alpha is exactly 1 again on a canvas that keeps it as a float'); assert.ok(f.alphas.length > 30 && f.alphas.every((x) => x > 0 && x <= 0.37 + 1e-6), 'and everything was painted at the fade or under it');
  rec.da = 0; const nothing = recCtx(); slotFor('peers').draw(nothing.ctx, w.view, env, w, rec); assert.equal(nothing.log.calls.length, 0, 'a figure with no strength draws nothing');
});

test('C6 a name tag is canvas text over each figure, the alias as it is and never markup; none far away; none for a blank name', async () => {
  const names = ['<b>Ada</b>', '"><img src=x onerror=alert(1)>', 'Bo', 'Cy', 'Di', 'Ed', 'Flo', 'Gus', 'Hal', 'Ivy', 'Jo', 'Kit', 'Lu', 'Moe', 'Nia', 'Oz', 'Pia', 'Quin', 'Rex', 'Sol', 'Tam', 'Uma', 'Vic', 'Wes'];
  const list = names.map((n, i) => ok(ids(24)[i], n, 3)), given = names.map((n) => n.slice(0, 24)), byPid = new Map(list.map((p, i) => [p.pid, given[i]]));
  for (const zoom of [0.7, 1, 1.4, 2.4]) {
    const w = await stage(list, { z: 3, zoom }); frame(w, 1000); const figs = frame(w, 1600);
    const T = tags(w).filter((t) => t.on); assert.ok(T.length > 0, `tags at zoom ${zoom}`);
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) assert.ok(apart(T[i], T[j]), `zoom ${zoom}: "${T[i].text}" and "${T[j].text}" do not touch`);
    for (const t of T) { assert.ok(given.includes(t.text), `"${t.text}" is a name as it was given`); assert.equal(t.log.calls.filter((c) => c[0] === 'fillText').length, 1, 'one run of canvas text'); }
    if (zoom === 2.4) for (const r of figs) { const [sx, sy] = w.w2s(r.x, r.y - 20); if (sx > 100 && sx < w.W - 100 && sy > 100 && sy < w.H - 100 && byPid.get(r.pid).length <= 10) assert.ok(T.some((t) => t.text === byPid.get(r.pid)), `zoomed in, ${r.pid} on the screen has his tag`); }
  }
  const w = await stage(list, { z: 3, zoom: 1 }); frame(w, 1000); frame(w, 1600); assert.ok(tags(w).some((t) => t.text === '<b>Ada</b>' || t.text === given[1]), 'markup is shown as the letters it is made of, as canvas text');
  lookAt(w, 3, 0.3); frame(w, 1700); assert.equal(tags(w).length, 0, 'far away there are pills and no tags'); assert.equal(w.items.filter((i) => i.k === 'q').length, 24);
  const blank = await stage([ok('B1', '', 3), ok('B2', 'Bo', 3)], { z: 3, zoom: 2 }); frame(blank, 1000); frame(blank, 1600); assert.deepEqual(tags(blank).map((t) => t.text), ['Bo'], 'a blank name is a figure with no tag');
});

test('C6b the tags never sit on one another: a crowd of long names shows the figures in front their tags and the rest wait for room, and zooming in brings them', async () => {
  const long = ['Alexandria Ocasio-Corte', 'Bartholomew Featherstone', 'Cassandra Wilhelmina Ro', 'Demetrius Papadopoulos', 'Evangeline Montgomery', 'Ferdinand von Habsburg', 'Genevieve Delacroix III', 'Hieronymus Bosch-Lee', 'Isabella Fitzgerald-Wu', 'Jonathan Livingston Sea', 'Kristoffer Magnusson', 'Leopoldina Hernandez', 'Maximilian Oppenheimer', 'Nathaniel Hawthorne Jr', 'Ophelia Montague-Reyes', 'Percival Wigglesworth', 'Quentin Tarantino-Diaz', 'Rosalind Franklin-Bose', 'Sebastian Vettel-Okafor', 'Theodora Vanderbilt', 'Ulysses Grant-Mbeki', 'Valentina Tereshkova', 'Wolfgang Amadeus Mozart', 'Xiomara Castellanos'];
  const list = long.map((n, i) => ok(ids(24)[i], n, 3)), shownAt = {};
  for (const zoom of [0.7, 1, 1.4, 2.4]) {
    const w = await stage(list, { z: 3, zoom }); frame(w, 1000); const figs = frame(w, 1600), T = tags(w).filter((t) => t.on);
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) assert.ok(apart(T[i], T[j]), `zoom ${zoom}: "${T[i].text}" and "${T[j].text}" do not touch`);
    const frontmost = figs.reduce((a, b) => (b.k > a.k ? b : a)); assert.equal(frontmost.tag, true, `zoom ${zoom}: the figure in front has its tag`);
    shownAt[zoom] = T.length;
    if (zoom === 0.7 || zoom === 1) assert.ok(T.length > 0 && T.length < figs.length, `zoom ${zoom}: ${T.length} tags for ${figs.length} figures: wide names in a crowd do not all fit`);
  }
  assert.ok(shownAt[1.4] >= shownAt[1] && shownAt[2.4] > shownAt[1] && shownAt[2.4] >= 0.75 * 21, `zooming in brings the tags (${JSON.stringify(shownAt)})`);
});

test('C6d a tag is as wide as its text: a wide character (CJK, full-width, emoji) takes the room of two letters in the layout, a Latin one of one', async () => {
  const { cells } = await import('../js/world/peers.js');
  const cp = (...c) => String.fromCodePoint(...c);
  assert.equal(cells('Ada'), 3); assert.equal(cells(''), 0);
  assert.equal(cells(cp(0x5c71, 0x7530, 0x592a, 0x90ce)), 8, 'four wide characters');
  assert.equal(cells('Ada' + cp(0xff21)), 5, 'a full-width letter is wide'); assert.equal(cells(cp(0xac00, 0xd55c)), 4, 'Hangul syllables');
  assert.equal(cells(cp(0x1f600) + 'x'), 3, 'an emoji is wide (it was two units, and is two cells)');
  const names = ['Ada', cp(0x5c71, 0x7530, 0x592a, 0x90ce), 'Bo'];
  const w = await stage(names.map((n, i) => ok(ids(3)[i], n, 3)), { z: 3, zoom: 1.4 }); frame(w, 1000); frame(w, 1600);
  const wide = [...w.peerState.recs.values()].filter((r) => r.ov);
  assert.ok(wide.length === 3, 'all three tags fit at this zoom');
  for (const r of wide) assert.equal(r.ov.n, cells(r.name), 'the overlay is told the same width the layout used: ' + r.name);
});

test('C6c a tag fades in with the zoom like every added detail (half in at 0.7, whole from 0.8), and with its figure when it comes and goes', async () => {
  const strength = (w) => { const T = tags(w); assert.ok(T.length > 0); return Math.max(...T.flatMap((t) => t.log.fills.map((f) => f.alpha))); };
  const w = await stage(crowd(3, 3, 0), { z: 3, zoom: 0.7 }); frame(w, 1000); frame(w, 1600);
  assert.ok(Math.abs(strength(w) - 0.5) < 0.01, `half a tag at 0.7 (${strength(w)})`);
  lookAt(w, 3, 1); frame(w, 1700); assert.equal(strength(w), 1, 'a whole one at working zoom');
  lookAt(w, 3, 0.55); frame(w, 1800); assert.equal(tags(w).length, 0, 'and none while the figures are too small to carry one');
  lookAt(w, 3, 1); w.setPeers(crowd(2, 3, 0)); frame(w, 1800); frame(w, 2050);
  const half = tags(w).filter((t) => t.text === 'Pal 2'); assert.equal(half.length, 1, 'the tag of the one who is leaving goes with him'); assert.ok(Math.abs(Math.max(...half[0].log.fills.map((f) => f.alpha)) - 0.5) < 0.01, 'at his strength: half out after a quarter of a second');
});

test('C7 an empty list draws nothing and costs nothing: no item, no label, no work, once the last one has faded', async () => {
  const w = await stage(crowd(3, 3, 0), { z: 3, zoom: 1 }); frame(w, 1000); frame(w, 1600);
  w.setPeers([]); frame(w, 1700); assert.equal(frame(w, 2300).length, 0, 'half a second after the last one left');
  assert.equal(w.peerState.recs.size, 0); assert.equal(w.peerState.zones.size, 0, 'nothing is kept');
  const { queue, live } = await peers(); assert.equal(live(w), false);
  const calls = [], fake = new Proxy({ peerState: w.peerState }, { get: (o, k) => (k in o ? o[k] : (...a) => { calls.push(String(k)); }), set: (o, k) => { calls.push('set ' + String(k)); return true; } });
  queue(fake, { x0: 0, x1: 1, y0: 0, y1: 1 }, new Set([3])); assert.deepEqual(calls, [], 'the queue touches nothing of the world when there is nothing to show');
  frame(w, 2400); assert.equal(w.items.filter((i) => i.k === 'q').length, 0); assert.equal(tags(w).length, 0, 'no figure, no tag, no count');
  const fresh = (await newWorld()).w; assert.equal(fresh.peerLayer, null); frame(fresh, 1000); assert.equal(fresh.peerState, undefined, 'a world that never had a classmate has no layer state, and its frame does not mention the layer');
  w.setPeers(crowd(1, 3, 0)); assert.equal(live(w), true, 'and one classmate is something to draw');
});

test('C8 a classmate in a district that is still under cloud for you is not drawn, and the flag on legacy draws none either', async () => {
  const { w, game } = await newWorld({ size: [1600, 1000] }); w.setPeers([ok('P1', 'Ada', 1), ok('P2', 'Bo', 9)]); await loaded(w);
  lookAt(w, 1, 1); frame(w, 1000); assert.deepEqual(frame(w, 1600).map((r) => r.z), [1], 'district 1 is open and has its classmate');
  lookAt(w, 9, 1); assert.deepEqual(frame(w, 1700), [], 'district 9 is under cloud: nobody is drawn there, and no tag');
  assert.equal(tags(w).length, 0);
  openAll(w, game); lookAt(w, 9, 1); assert.deepEqual(frame(w, 1800).map((r) => r.z), [9], 'and once it is open the classmate is there');
  setFlag('peers', 'legacy'); try { assert.equal(frame(w, 1900).length, 0, 'the old picture has no classmates'); assert.equal(tags(w).length, 0, 'and no tags'); } finally { setFlag('peers', 'v2'); }
  assert.equal(frame(w, 2000).length, 1, 'the flag back on, he is back');
});

test('C9 a figure that cannot be drawn does not stop the others, and a corrupt record does not stop the frame', async () => {
  const w = await stage(crowd(5, 3, 0), { z: 3, zoom: 1 }); frame(w, 1000); frame(w, 1600);
  const real = slotFor('peers').draw, seen = [], boom = ids(5, 0)[2], { registerLayer } = await import('../js/world/stack.js'), err = console.error; console.error = () => {};
  try {
    registerLayer('peers', (ctx, view, env, ww, r) => { seen.push(r.pid); if (r.pid === boom) throw new Error('boom'); return real(ctx, view, env, ww, r); }, 'inherit');
    frame(w, 1700); assert.deepEqual(seen.slice().sort(), ids(5, 0), 'all five were asked for, the one that threw among them'); assert.ok([...w.faults].some((f) => /q:peer.*boom/.test(f)), 'and it was reported once');
    registerLayer('peers', real, 'inherit'); const rec = w.peerState.recs.values().next().value, look = rec.look, name = rec.name;
    rec.look = null; assert.doesNotThrow(() => frame(w, 1800), 'a figure whose look is gone');
    rec.look = look; rec.name = null; assert.doesNotThrow(() => frame(w, 1900), 'and a name that is gone'); assert.ok([...w.faults].length >= 2, 'both were reported');
    rec.name = name; assert.equal(frame(w, 2000).length, 5, 'and when it is whole again all five are back');
  } finally { registerLayer('peers', real, 'inherit'); console.error = err; }
});

test('C10 a name that changes changes the tag, and a classmate stays where he is when another arrives who does not take his place', async () => {
  const { placeIn } = await peers(); const A = ids(3, 0), w = await stage([ok(A[0], 'Ada', 3), ok(A[1], 'Bo', 3)], { z: 3, zoom: 2 });
  frame(w, 1000); frame(w, 1600); assert.deepEqual(tags(w).map((t) => t.text).sort(), ['Ada', 'Bo']);
  const at0 = frame(w, 1600).map((r) => [r.pid, r.gx, r.gy]); w.setPeers([ok(A[0], 'Ada L', 3), ok(A[1], 'Bo', 3)]); frame(w, 1700); assert.deepEqual(tags(w).map((t) => t.text).sort(), ['Ada L', 'Bo']);
  assert.deepEqual(frame(w, 1700).map((r) => [r.pid, r.gx, r.gy]), at0, 'a new alias moves nobody');
  const three = placeIn(3, A); w.setPeers([ok(A[0], 'Ada L', 3), ok(A[1], 'Bo', 3), ok(A[2], 'Cy', 3)]); const got = frame(w, 1800);
  for (const r of got) assert.deepEqual([r.gx, r.gy], three.get(r.pid), 'everybody is where the set puts him');
});

test('C11 facing: a classmate looks towards the home spot, and the picture of a figure is a function of its pid and the clock', async () => {
  const w = await stage(crowd(24, 3, 0), { z: 3, zoom: 1 }); frame(w, 1000); const got = frame(w, 1600), [hx, hy] = SPOTS[3].home, hx0 = (hx - hy) * 32;
  for (const r of got) { if (Math.abs(r.x - hx0) > 1) assert.equal(r.dir, r.x < hx0 ? 1 : -1, `${r.pid} faces the home spot`); }
  assert.ok(got.some((r) => r.dir === 1) && got.some((r) => r.dir === -1), 'a ring has both sides');
  const w2 = await stage(crowd(24, 3, 0), { z: 3, zoom: 1 }); frame(w2, 1000); const got2 = frame(w2, 1600);
  assert.deepEqual(got2.map((r) => [r.pid, r.x, r.y, r.dir, r.a]), got.map((r) => [r.pid, r.x, r.y, r.dir, r.a]), 'the same list and the same clock give the same figures');
  const x = recCtx(), y = recCtx(); slotFor('peers').draw(x.ctx, w.view, w.env, w, got[3]); slotFor('peers').draw(y.ctx, w2.view, w2.env, w2, got2[3]); assert.deepEqual(x.log.calls, y.log.calls, 'and the same calls');
});

test('C12 the module is plain: canvas text and fills, no markup in the DOM, no \\u escapes, no alpha scaled in place, no emoji, no Math.random, no clock of its own', () => {
  const src = read('js/world/peers.js'), code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|createElement|\bdocument\b|\bwindow\b/, 'a name is never put into the page');
  assert.doesNotMatch(src, /\\u[0-9a-fA-F]{4}|\\u\{/, 'no unicode escapes in the source'); assert.doesNotMatch(src, /globalAlpha\s*[*/]=/);
  assert.doesNotMatch(code, /Math\.random|Date\.now|performance\.now/, 'a function of the pid, the list and the clock the world gives');
  assert.doesNotMatch(src, /\p{Extended_Pictographic}/u, 'no emoji'); assert.ok(!src.includes(String.fromCodePoint(0x2014)), 'no em dash');
  assert.match(src, /Owner: T4/); assert.match(src, /registerLayer\('peers'/);
});
