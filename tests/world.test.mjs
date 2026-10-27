// The 2.5D world: projection maths, island layout invariants, and a headless draw smoke test with a recording canvas
// (this is what would have caught a missing import in a draw path before a human saw a half-painted scene).
import test from 'node:test';
import assert from 'node:assert/strict';
import { sx, sy, P, toGrid, hash, h2 } from '../js/world/iso.js';
import { LAND, ELEV, SPOTS, PLOTS, BUILD, SCENERY, zAt, zoneAt, isRoad, groundColor, stashPos, DOORS, DIST } from '../js/world/layout.js';
import { ZONES } from '../js/config.js';
import { makeGame, run } from './bot.mjs';

const noop = () => {};
const grad = { addColorStop: noop };
function fakeCtx(log) {
  const t = { measureText: (s) => ({ width: String(s).length * 6 }), createLinearGradient: () => grad, createRadialGradient: () => grad, getTransform: () => ({}) };
  return new Proxy(t, { get(o, k) { if (k in o) return o[k]; if (typeof k === 'symbol') return undefined; return (...a) => { log.n++; }; }, set(o, k, v) { o[k] = v; return true; } });
}
function stubDom() {
  const log = { n: 0 };
  const el = () => ({ style: {}, dataset: {}, width: 0, height: 0, addEventListener: noop, setAttribute: noop, getContext: () => fakeCtx(log), getBoundingClientRect: () => ({ width: 800, height: 520, left: 0, top: 0 }), replaceChildren: noop, append: noop });
  globalThis.document = { createElement: el, documentElement: { dataset: {} }, hidden: false };
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = noop;
  return log;
}

test('isometric projection is invertible and ordered back to front', () => {
  for (const [gx, gy, z] of [[0, 0, 0], [10.5, 3.25, 0], [20, 40, 12], [33, 49, 26]]) {
    const [x, y] = P(gx, gy, z), [bx, by] = toGrid(x, y, z);
    assert.ok(Math.abs(bx - gx) < 1e-9 && Math.abs(by - gy) < 1e-9, `round trip ${gx},${gy}`);
  }
  assert.ok(sy(5, 6) < sy(6, 6) && sy(5, 6) < sy(5, 7), 'screen y grows towards the viewer');
  assert.ok(hash(1) >= 0 && hash(1) < 1 && h2(3, 4) === h2(3, 4));
});

test('ground height is continuous: flat plateaus joined by ramps, never a step', () => {
  assert.equal(zAt(5), ELEV[3]); assert.equal(zAt(24), ELEV[2]); assert.equal(zAt(40), ELEV[1]);
  for (let y = 1; y < 49; y += 0.05) assert.ok(Math.abs(zAt(y + 0.05) - zAt(y)) < 5.5, `step at ${y.toFixed(2)}`);
  assert.ok(zAt(16.5) < zAt(15) && zAt(16.5) > zAt(18), 'ramp descends towards the front');
  assert.equal(zoneAt(5), 3); assert.equal(zoneAt(24), 2); assert.equal(zoneAt(40), 1);
});

const rect = ([x, y, w, d]) => ({ x0: x, y0: y, x1: x + w, y1: y + d });
const overlap = (a, b, m = 0) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.y0 < b.y1 + m && a.y1 > b.y0 - m;
const SOLID = new Set(['shack', 'depot', 'bank', 'office', 'shop', 'tower', 'ipo', 'fountain', 'helipad', 'junkcar']);

test('every object slot is on land, in its own district, and not buried inside scenery', () => {
  for (const z of [1, 2, 3]) {
    const sp = SPOTS[z], pts = [...sp.leads, ...sp.lots, sp.home, ...Array.from({ length: sp.stash.n }, (_, i) => stashPos(z, i))];
    for (const [x, y] of pts) {
      assert.ok(x >= LAND.x0 && x < LAND.x1 && y >= LAND.y0 && y < LAND.y1, `zone ${z} slot ${x},${y} is off the island`);
      assert.equal(zoneAt(y), z, `zone ${z} slot ${x},${y} is in zone ${zoneAt(y)}`);
      for (const p of SCENERY) if (SOLID.has(p.t) && overlap(rect([p.gx, p.gy, p.w, p.d]), { x0: x - 0.2, y0: y - 0.2, x1: x + 0.2, y1: y + 0.2 })) assert.fail(`zone ${z} slot ${x},${y} sits inside a ${p.t} at ${p.gx},${p.gy}`);
    }
    assert.equal(sp.leads.length, 8); assert.equal(sp.lots.length, 6);
    assert.equal(sp.stash.n, ZONES[z].store, 'a stash slot for every unit of storage');
  }
});

test('buildings and plots do not overlap each other or the roads', () => {
  const solids = SCENERY.filter((p) => SOLID.has(p.t) && p.t !== 'junkcar');
  for (let i = 0; i < solids.length; i++) {
    const a = solids[i];
    assert.ok(a.gx >= LAND.x0 && a.gx + a.w <= LAND.x1 && a.gy >= LAND.y0 && a.gy + a.d <= LAND.y1, `${a.t} at ${a.gx},${a.gy} leaves the island`);
    assert.ok(!(isRoad(a.gx + 0.1, a.gy + 0.1) && !['fountain', 'helipad'].includes(a.t)), `${a.t} at ${a.gx},${a.gy} stands on a road`);
    for (let j = i + 1; j < solids.length; j++) { const b = solids[j]; assert.ok(!overlap(rect([a.gx, a.gy, a.w, a.d]), rect([b.gx, b.gy, b.w, b.d])), `${a.t}@${a.gx},${a.gy} overlaps ${b.t}@${b.gx},${b.gy}`); }
    for (const z of [2, 3]) for (const pl of PLOTS[z]) assert.ok(!overlap(rect([a.gx, a.gy, a.w, a.d]), rect([pl[0], pl[1], 3, 3])), `${a.t} overlaps a plot`);
  }
  for (const z of [2, 3]) {
    assert.ok(PLOTS[z].length >= 4);
    for (const [x, y] of PLOTS[z]) assert.equal(zoneAt(y + 1.5), z, 'plot is in its district');
  }
  for (const z of [1, 2, 3]) { const [x, y] = DOORS[z]; assert.equal(zoneAt(y), z, 'depot door is in its district'); assert.ok(groundColor(Math.floor(x), Math.floor(y))); }
});

test('every clickable building is unique and reachable from the list view', () => {
  const hot = SCENERY.filter((p) => p.hot).map((p) => p.hot);
  assert.equal(new Set(hot).size, hot.length, 'hotspot ids are unique');
  for (const need of ['bank', 'audit', 'ipo', 'hq:1', 'hq:2', 'hq:3', 'depot:1', 'depot:2', 'depot:3', 'board:1', 'board:2', 'board:3']) assert.ok(hot.includes(need), need);
});

async function world(game, ui) {
  const log = stubDom();
  const { World } = await import('../js/world/world.js');
  const session = { game, clock: { now: () => game.s.hour, paused: true, speed: 1 } };
  const w = new World({ session, ui, activate: noop, hover: noop });
  w.host = { getBoundingClientRect: () => ({ width: 800, height: 520 }) };
  w.resize(); w.sync(); w.placePlayer();
  return { w, log };
}
const faults = (w) => [...(w.faults || [])];

test('headless draw: every entity type in every zone and mode, day and night, without a single fault', async () => {
  const g = makeGame('venture', 'fintech', 21);
  run(g, { days: 24 });
  const crate = g.s.assets.find((a) => a.zone === 2) || g.s.assets[0]; if (crate) g.ship([crate.id], crate.zone === 3 ? 2 : 3);
  const ui = { zone: 3, sel: new Set(g.s.assets.slice(0, 2).map((a) => a.id)) };
  const { w, log } = await world(g, ui);
  const types = new Set([...w.ents.values()].map((e) => e.type));
  for (const t of ['lead', 'lot', 'asset', 'pipe', 'plot']) assert.ok(types.has(t), 'entity type present: ' + t);
  for (const mode of ['world', 'map']) for (const zone of [1, 2, 3]) for (const night of [0, 0.9]) {
    w.mode = mode; ui.zone = zone; w.focusZone(zone, false); w.sync(); w.night = night; w.update(0.03); w.night = night; w.draw();
  }
  assert.deepEqual(faults(w), [], 'no draw faults');
  assert.ok(log.n > 5000, 'the scene actually issued drawing calls: ' + log.n);
  assert.ok(w.hits.length > 10 && w.hotspots().length > 10, 'hit shapes and list view are populated');
});

test('headless draw under each macro shock and when paused, reduced-motion on and off', async () => {
  const g = makeGame('midtier', 'ops', 5);
  run(g, { days: 14 });
  const { w } = await world(g, { zone: 2, sel: new Set() });
  for (const kind of ['tiktok', 'fed', 'tariff']) {
    g.injectEvent(kind, g.s.hour + 1, { id: 'test-' + kind }); g.advanceTo(g.s.hour + 2);
    for (const reduce of [false, true]) { document.documentElement.dataset.motion = reduce ? 'reduce' : 'auto'; w.sync(); w.update(0.05); w.draw(); }
  }
  assert.equal(w.env.crunch || w.env.surge || w.env.tariff, true, 'weather flags follow the active events');
  assert.deepEqual(faults(w), []);
});

test('picking: a buyer\'s own screen position picks that buyer, empty water picks nothing', async () => {
  const g = makeGame('bootstrapper', 'ops', 3);
  const { w } = await world(g, { zone: 1, sel: new Set() });
  for (let i = 0; i < 40; i++) w.update(0.5); // buyers walk in from the entrance to their spots
  w.draw();
  const lead = w.hits.find((h) => h.kind === 'lead');
  assert.ok(lead, 'a buyer is hittable');
  const [px, py] = w.w2s(lead.circle[0], lead.circle[1]);
  assert.equal(w.pick(px, py)?.id, lead.id);
  assert.equal(w.pick(2, 2), null, 'the corner is open water');
});

test('entities follow the game: a sold-out lead leaves, a spent crate disappears, a hired manager takes a plot', async () => {
  const g = makeGame('midtier', 'ops', 8);
  g.s.mil.m2 = true; g.s.auditFirst = true;
  const ui = { zone: 2, sel: new Set() };
  const { w } = await world(g, ui);
  const live = (type) => [...w.ents.values()].filter((e) => e.type === type && !e.gone).length;
  const plots0 = live('plot');
  const r = g.hirePipeline('broker', 2, { cls: 'textbooks', buyer: 'trainer' }); assert.ok(r.ok, r.msg);
  w.sync();
  assert.equal(live('plot'), plots0 - 1, 'one plot became a building');
  assert.equal(live('pipe'), 1);
  const lead = g.s.leads[2][0]; g.s.leads[2] = g.s.leads[2].filter((l) => l !== lead); w.sync();
  assert.ok(w.ents.get('lead:' + lead.id).leaving, 'the buyer walks away instead of vanishing');
  const a = g.s.assets[0]; if (a) { g.s.assets = g.s.assets.filter((x) => x !== a); w.sync(); assert.ok(w.ents.get('asset:' + a.id)?.gone, 'the crate fades out'); }
});
