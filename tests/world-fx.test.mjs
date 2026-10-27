// The world's presentation layer: the particle pool, rain, the light grade, label placement, the ground cache, the sale celebration,
// and the quality governor's steadiness. None of it may change a game object's place or the game: these tests hold the layer to that.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Fx, COIN, SPARK, PUFF, RING } from '../js/world/fx.js';
import { dayTargets, tintOf, Lighting } from '../js/world/lighting.js';
import { Labels, qs, readable } from '../js/world/labels.js';
import { ZONES } from '../js/data/index.js';
import { Game } from '../js/engine.js';
import { DIST } from '../js/world/layout.js';

const noop = () => {};
const grad = { addColorStop: noop };
function fakeCtx(log) {
  const t = { measureText: (s) => ({ width: String(s).length * 6 }), createLinearGradient: () => grad, createRadialGradient: () => grad, getTransform: () => ({}) };
  return new Proxy(t, {
    get(o, k) { if (k in o) return o[k]; if (typeof k === 'symbol') return undefined; return (...a) => { log.n++; (log.by[k] = (log.by[k] || 0) + 1); if (log.trace) log.trace.push(k); }; },
    set(o, k, v) { o[k] = v; return true; },
  });
}
function stubDom(w = 800, h = 520) {
  const log = { n: 0, by: {} };
  const el = () => ({ style: {}, dataset: {}, width: 0, height: 0, addEventListener: noop, setAttribute: noop, getContext: () => fakeCtx(log), getBoundingClientRect: () => ({ width: w, height: h, left: 0, top: 0 }), replaceChildren: noop, append: noop });
  globalThis.document = { createElement: el, documentElement: { dataset: {} }, hidden: false };
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = noop;
  return log;
}
/** A stand-in for OffscreenCanvas so the cached paths run in Node; every surface shares the one log. */
function installOffscreen(log) { globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; log.surfaces = (log.surfaces || 0) + 1; } getContext() { return fakeCtx(log); } }; }
const newGame = (seed = 7) => new Game({ perks: ['connected', 'grad'], handle: 'Test', pid: 'T-1', seed });
function openTo(g, n) { g.s.auditFirst = true; g.s.cash = ZONES[n].gate + 50; g._unlock(); return g; }
async function world(game, ui, size = [800, 520]) {
  const log = stubDom(...size);
  const { World } = await import('../js/world/world.js');
  const session = { game, clock: { now: () => game.s.hour, paused: true, speed: 1 } };
  const w = new World({ session, ui, activate: noop, hover: noop });
  w.host = { getBoundingClientRect: () => ({ width: size[0], height: size[1] }) };
  w.resize(); w.sync(); w.placePlayer();
  return { w, log };
}
const faults = (w) => [...(w.faults || [])];

// ---------------------------------------------------------------- particles
test('the particle pool is fixed: bursts reuse slots, nothing grows, and every particle ends', () => {
  const fx = new Fx(), arrays = [fx.kind, fx.x, fx.y, fx.vx, fx.vy, fx.age, fx.life, fx.size, fx.seed], len = fx.kind.length;
  for (let i = 0; i < 40; i++) { fx.coins(10, 10, 9, i); fx.sparks(0, 0, 12, i); fx.puff(1, 1); fx.ring(0, 0, 4, 40); }
  assert.ok(fx.live <= len && fx.live > 0, 'live never passes the pool size: ' + fx.live + ' of ' + len);
  assert.ok([fx.kind, fx.x, fx.y, fx.vx, fx.vy, fx.age, fx.life, fx.size, fx.seed].every((a, i) => a === arrays[i] && a.length === len), 'the same typed arrays, never reallocated');
  for (let i = 0; i < 100; i++) fx.update(0.05, false);
  assert.equal(fx.live, 0, 'every particle ends'); assert.equal(fx.kind.reduce((a, b) => a + b, 0), 0); assert.equal(fx.active, false);
});

test('coin bursts are deterministic: the same cycle gives the same coins', () => {
  const run = () => { const fx = new Fx(); fx.coins(100, 50, 8, 41); for (let i = 0; i < 6; i++) fx.update(0.05, false); return [...fx.x.slice(0, 8), ...fx.y.slice(0, 8)].map((v) => +v.toFixed(3)); };
  assert.deepEqual(run(), run());
  const other = new Fx(); other.coins(100, 50, 8, 42); for (let i = 0; i < 6; i++) other.update(0.05, false);
  assert.notDeepEqual([...other.x.slice(0, 8)].map((v) => +v.toFixed(3)), run().slice(0, 8), 'another cycle throws them differently');
});

test('a coin follows the arc the world always drew: up fast, then down under 160 of gravity', () => {
  const fx = new Fx(); fx.coins(0, 0, 1, 3); const vy0 = fx.vy[0], x0 = fx.x[0], vx = fx.vx[0];
  fx.update(0.5, false);
  assert.ok(Math.abs(fx.x[0] - (x0 + vx * 0.5)) < 1e-3, 'sideways is steady');
  assert.ok(Math.abs(fx.y[0] - vy0 * 0.5) < 1e-3, 'up by the first speed'); assert.ok(Math.abs(fx.vy[0] - (vy0 + 80)) < 1e-3, 'gravity pulls 160 a second');
});

test('text pops use a fixed ring of records and fade out', () => {
  const fx = new Fx(), texts = fx.texts;
  for (let i = 0; i < 30; i++) fx.pop('+$' + i, 0, 0);
  assert.equal(fx.texts, texts); assert.equal(fx.texts.length, 8); assert.equal(fx.liveTexts, 8);
  for (let i = 0; i < 50; i++) fx.update(0.05, false);
  assert.equal(fx.liveTexts, 0); assert.equal(fx.active, false);
});

test('rain falls in three depth layers, wraps from a fixed sequence, and stays on screen', () => {
  const a = new Fx(), b = new Fx();
  for (let i = 0; i < 600; i++) { a.rainStep(0.033); b.rainStep(0.033); }
  assert.deepEqual([...a.rx], [...b.rx]); assert.deepEqual([...a.ry], [...b.ry]);
  for (let i = 0; i < a.drops; i++) assert.ok(a.rx[i] > -0.2 && a.rx[i] < 1.4 && a.ry[i] > -0.2 && a.ry[i] < 1.1, `drop ${i} is inside the window: ${a.rx[i].toFixed(2)}, ${a.ry[i].toFixed(2)}`);
  const y = [...a.ry]; a.rainStep(0.1); const moved = [0, 1, 2].map((l) => { let d = 0, n = 0; for (let i = l; i < a.drops; i += 3) if (a.ry[i] > y[i]) { d += a.ry[i] - y[i]; n++; } return d / n; });
  assert.ok(moved[0] < moved[1] && moved[1] < moved[2], 'near drops fall faster than far ones: ' + moved.map((m) => m.toFixed(3)));
});

// ---------------------------------------------------------------- light
test('the sun: day at 08:00, deep night in the small hours, the golden hour between, reduced motion always plain day, a fast clock held part way', () => {
  assert.equal(dayTargets(0, 1, false).night, 0, '08:00 is bright'); assert.equal(dayTargets(0, 1, false).dusk, 0);
  assert.equal(dayTargets(17, 1, false).night, 1, '01:00 is night');
  let peak = 0, at = 0; for (let h = 0; h < 24; h += 0.1) { const t = dayTargets(h, 1, false); if (t.dusk > peak) { peak = t.dusk; at = t.night; } }
  assert.ok(peak > 0.95, 'the golden hour reaches its peak'); assert.ok(at > 0.1 && at < 0.45, 'it comes while the night is still a quarter dark, so the warm light is not muddied by the blue: ' + at.toFixed(2));
  for (const h of [0, 5, 9.8, 17, 20]) { const c = dayTargets(h, 1, true); assert.equal(c.night, 0); assert.equal(c.dusk, 0); }
  assert.equal(dayTargets(3, 16, false).night, 0.3); assert.equal(dayTargets(3, 16, false).dusk, 0, 'a clock at 16x or more never strobes');
  const out = { night: -1, dusk: -1 }; assert.equal(dayTargets(3, 1, false, out), out, 'it can fill a record it is given (no allocation in the frame)');
});

test('the grade: nothing at noon, warm at the golden hour, blue at night, greyer in a crunch; an unchanged colour is the same string', () => {
  assert.equal(tintOf(0, 0, false), '', 'plain daylight needs no pass');
  const rgb = (s) => s.match(/\d+/g).map(Number), gold = rgb(tintOf(0.2, 1, false)), night = rgb(tintOf(1, 0, false)), rain = rgb(tintOf(0, 0, true));
  assert.ok(gold[0] > gold[2] + 30, 'gold: red over blue'); assert.ok(night[2] > night[0] + 40, 'night: blue over red'); assert.ok(rain.every((v) => v < 250) && Math.abs(rain[0] - rain[2]) < 70, 'a crunch dims and greys');
  assert.deepEqual(night, [105, 125, 185], 'full night is the colour the world always used');
  assert.strictEqual(tintOf(1, 0, false), tintOf(1, 0, false), 'the same colour is the same string: a still sky allocates nothing');
});

test('lights stamp from sprites where there are surfaces, and fall back to a gradient where there are none', async () => {
  const log = stubDom(); const lit = new Lighting();
  const w = { W: 800, H: 520, cam: { x: 0, y: 0, z: 1 }, lights: [{ wx: 0, wy: 0, r: 40, c: '255,222,140', a: 0.5, gy: 28 }, { wx: 5000, wy: 0, r: 40, c: '255,222,140', a: 0.5 }] };
  const ctx = document.createElement('canvas').getContext('2d');
  lit.lights(ctx, w, 160); assert.equal(log.by.fillRect, 1, 'no sprites: one gradient fill for the light on screen, none for the one far away');
  const log2 = stubDom(); installOffscreen(log2); const lit2 = new Lighting(); const c2 = document.createElement('canvas').getContext('2d');
  lit2.lights(c2, w, 160); assert.equal(log2.by.drawImage, 2, 'a halo and a ground pool for the lamp, nothing for the one off screen');
  const fills = log2.by.fillRect; lit2.lights(c2, w, 160); assert.equal(log2.by.drawImage, 4); assert.equal(log2.by.fillRect, fills, 'the sprite was drawn once; stamping it again draws no gradient');
  delete globalThis.OffscreenCanvas;
});

// ---------------------------------------------------------------- labels
test('labels are sprites at the device pixel density, cached by their content, and the district colour is lifted until it reads', () => {
  const log = stubDom(); installOffscreen(log);
  const L = new Labels(); L.setDpr(2);
  const a = L.chip('Opens at $500k', '#ffd36e', 1), b = L.chip('Opens at $500k', '#ffd36e', 1);
  assert.strictEqual(a, b, 'the same label is the same sprite'); assert.equal(a.c.width, Math.ceil(a.w * 2), 'drawn at twice the pixels');
  assert.notStrictEqual(L.chip('Opens at $600k', '#ffd36e', 1), a); L.setDpr(1); assert.notStrictEqual(L.chip('Opens at $500k', '#ffd36e', 1), a, 'a change of density draws them again');
  assert.equal(qs(1.0625), 1.125); assert.equal(qs(0.93), 0.875); assert.equal(qs(1.0001), 1, 'a zoom is rounded to eighths so sprites are not made afresh at every frame of a zoom');
  assert.notEqual(readable('#0a0f14'), '#0a0f14', 'a near-black district colour is lifted'); assert.equal(readable('#ffd36e'), '#ffd36e', 'a light one is left alone'); assert.equal(readable('rgba(1,2,3,.5)'), 'rgba(1,2,3,.5)');
  const tag = L.tag('📦', '$12', '#46e38e', false, 1), bub = L.bubble('🎓', '$40', true, false, 1);
  assert.ok(tag.w > 40 && tag.h > 20, 'a tag has the size of its text'); assert.equal(bub.ay, 22, 'a bubble is anchored where its tail begins, on its lower edge'); assert.ok(bub.ax > 10 && bub.ax < bub.w / 2 + 1);
  delete globalThis.OffscreenCanvas;
  const L2 = new Labels(); L2.setDpr(1); assert.equal(L2.chip('x', '#fff', 1), null, 'without OffscreenCanvas a label is not a sprite: the world draws it directly');
});

test('price tags that pile up are nudged apart, nearest label first, and name tags stand clear of them', async () => {
  const g = newGame(3); openTo(g, 3);
  const { w } = await world(g, { zone: 1, sel: new Set() });
  w.cam = { x: 0, y: 0, z: 1 }; w.overlay.length = 0; w.mode = 'world';
  const seen = [];
  for (let i = 0; i < 4; i++) w.overlay.push({ k: 'tag', n: 6, wx: i * 20 - 30, wy: i * 9 - 20, draw: (g2, px, py) => seen.push({ x: px, y: py, i }) });
  w.drawOverlay(w.ctx);
  assert.equal(seen.length, 4, 'all four are drawn');
  const rect = (o) => ({ x0: o.x - 35.4, x1: o.x + 35.4, y0: o.y - 10, y1: o.y + 10 }); // the size the placement works with for a six-character tag
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) { const a = rect(seen[i]), b = rect(seen[j]); assert.ok(!(a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0), `tags ${i} and ${j} do not overlap`); }
  assert.ok(Math.abs(seen[3].y - (w.H / 2 + 7)) < 0.5, 'the nearest tag stays where it is');
  assert.ok(seen[0].y < w.H / 2 - 20 - 5, 'the farthest was nudged up: ' + seen[0].y);
});

test('on the map, cards that would overlap are pushed apart and kept on the screen; region names find a free place', async () => {
  const g = newGame(3); openTo(g, 3);
  const { w } = await world(g, { zone: 1, sel: new Set() }, [390, 700]);
  const cards = [0, 1, 2, 3, 4].map((i) => ({ x: 100 + i * 4, y: 200 + i * 3, w: 150, h: 24 }));
  w.spreadCards(cards);
  for (const c of cards) { assert.ok(c.x >= 4 && c.x + c.w <= w.W - 4 && c.y >= 4 && c.y + c.h <= w.H - 4, 'inside the screen'); }
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) { const a = cards[i], b = cards[j]; assert.ok(!(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y), `cards ${i} and ${j} are apart`); }
  w.mode = 'map'; w.fit(false); w.draw();
  assert.deepEqual(faults(w), []); const rects = Object.values(w.hitsLabel);
  assert.equal(rects.length, 16, 'every district has a card to click');
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = rects[i], b = rects[j]; assert.ok(!(a[0] < b[0] + b[2] - 1 && a[0] + a[2] > b[0] + 1 && a[1] < b[1] + b[3] - 1 && a[1] + a[3] > b[1] + 1), `map cards ${i} and ${j} do not overlap on a phone`); }
});

// ---------------------------------------------------------------- the ground cache
test('the ground is drawn once for a still camera and stamped after that; anything that changes it draws it again', async () => {
  const g = newGame(3); openTo(g, 3);
  const log = stubDom(1000, 640); installOffscreen(log);
  const { World } = await import('../js/world/world.js');
  const session = { game: g, clock: { now: () => g.s.hour, paused: true, speed: 1 } };
  const w = new World({ session, ui: { zone: 1, sel: new Set() }, activate: noop, hover: noop });
  w.host = { getBoundingClientRect: () => ({ width: 1000, height: 640 }) }; w.resize(); w.sync(); w.placePlayer();
  let direct = 0, cachedPart = 0, live = 0; const dg = w.drawGround.bind(w); w.drawGround = (c, v, mode = 0) => { if (mode === 0) direct++; else if (mode === 1) cachedPart++; else live++; dg(c, v, mode); };
  w.focusZone(1, false); w.draw(); assert.equal(direct, 1, 'the first frame at a camera is drawn directly (the camera may be moving)'); assert.equal(cachedPart, 0);
  w.draw(); assert.equal(cachedPart, 1, 'the second, with the camera still, builds the copy'); assert.equal(live, 1, 'and draws what moves on top');
  w.draw(); w.draw(); assert.equal(cachedPart, 1, 'later frames only stamp it'); assert.equal(live, 3); assert.equal(direct, 1);
  const ops = (n) => { log.n = 0; for (let i = 0; i < n; i++) w.draw(); return log.n / n; };
  const stamped = ops(3); w.cam.x += 1; const moving = ops(1);
  assert.ok(stamped < moving * 0.8, `a stamped frame issues fewer drawing calls than a moving one: ${stamped} against ${moving}`);
  w.draw(); w.draw(); const before = cachedPart; w.cam.z *= 1.01; w.draw(); w.draw(); assert.equal(cachedPart, before + 1, 'a zoom makes a new copy');
  const b2 = cachedPart; document.documentElement.dataset.motion = 'reduce'; openTo(g, 4); w.sync(); w.draw(); w.draw(); assert.equal(cachedPart, b2 + 1, 'a district opening makes a new copy'); document.documentElement.dataset.motion = 'auto';
  const b3 = cachedPart; w.resize(); w.draw(); w.draw(); assert.equal(cachedPart, b3 + 1, 'a resize makes a new copy');
  const b4 = cachedPart, d4 = direct; document.documentElement.dataset.motion = 'auto'; w.reveal[2] = { t0: w.t, dur: 2600 }; w.draw(); w.draw(); assert.equal(cachedPart, b4, 'no copy while a district is opening (its fog is moving)'); assert.ok(direct > d4, 'it is drawn directly then');
  delete w.reveal[2];
  assert.deepEqual(faults(w), []); delete globalThis.OffscreenCanvas;
});

test('a reveal nobody is looking at does not hold the ground cache off: one that has finished is swept', async () => {
  const g = newGame(3); openTo(g, 3); const { w } = await world(g, { zone: 1, sel: new Set() });
  w.t = 10000; w.reveal[16] = { t0: 1000, dur: 2600 }; w.reveal[2] = { t0: 9000, dur: 2600 };
  assert.equal(w.revealing(), true, 'one is still opening'); assert.equal(w.reveal[16], undefined, 'the finished one, far out of view, was swept'); assert.ok(w.reveal[2]);
  w.t = 12000; assert.equal(w.revealing(), false); assert.deepEqual(Object.keys(w.reveal), []);
});

test('the cached ground puts every moving decal on top: water and pulses are drawn live, not stamped', async () => {
  const g = newGame(3); openTo(g, 16);
  const log = stubDom(1000, 640); installOffscreen(log);
  const { World } = await import('../js/world/world.js');
  const session = { game: g, clock: { now: () => g.s.hour, paused: true, speed: 1 } };
  const w = new World({ session, ui: { zone: 1, sel: new Set() }, activate: noop, hover: noop });
  w.host = { getBoundingClientRect: () => ({ width: 1000, height: 640 }) }; w.resize(); w.sync(); w.placePlayer();
  const kinds = []; const dd = w.drawDecal.bind(w); w.drawDecal = (c, d, z, k, part = 0) => { kinds.push(d.k + ':' + part); dd(c, d, z, k, part); };
  let id = 0; for (const z of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) if (DIST[z].decals.some((d) => d.k === 'water' || d.k === 'pulse')) { id = z; break; }
  assert.ok(id, 'some district has a moving decal'); w.focusZone(id, false); w.draw(); w.draw(); kinds.length = 0; w.draw();
  assert.ok(kinds.length > 0 && kinds.every((k) => k.endsWith(':2')), 'a stamped frame draws only the live part of the moving decals: ' + [...new Set(kinds)].join());
  delete globalThis.OffscreenCanvas;
});

// ---------------------------------------------------------------- the game's own news, read
test('a sale in the ledger throws coins from the buyer who left; a ledger the world cannot place is not celebrated; reduced motion stays still', async () => {
  const g = newGame(3); openTo(g, 3);
  const { w } = await world(g, { zone: 1, sel: new Set() });
  w.sync(); const before = w.fx.live;
  g.s.ledger.push({ h: g.s.hour, type: 'pitch', text: 'x', amt: 50, z: 1, seg: 'collector', recv: 200, fmv: 100 });
  w.sync(); assert.ok(w.fx.live > before + 8, 'coins, sparks and a ring: ' + (w.fx.live - before)); const kinds = new Set(w.fx.kind.filter(Boolean)); assert.ok(kinds.has(COIN) && kinds.has(SPARK) && kinds.has(RING));
  const live = w.fx.live; w.sync(); assert.equal(w.fx.live, live, 'the same entry is not celebrated twice');
  w.fx.clear(); g.s.ledger.length = 0; for (let i = 0; i < 5; i++) g.s.ledger.push({ h: g.s.hour, type: 'pitch', text: 'new game', amt: 9, z: 1, seg: 'collector', recv: 1 }); w.sync(); assert.equal(w.fx.live, 0, 'a ledger it has not seen before is not a sale');
  w.fx.clear(); document.documentElement.dataset.motion = 'reduce'; g.s.ledger.push({ h: g.s.hour, type: 'pitch', text: 'x', amt: 50, z: 1, seg: 'collector', recv: 200 }); w.sync(); assert.equal(w.fx.live, 0, 'nothing flies under reduced motion');
  document.documentElement.dataset.motion = 'auto';
  w.fx.clear(); g.s.ledger.push({ h: g.s.hour, type: 'pitch', text: 'x', amt: -5, z: 1, seg: 'collector', recv: 90 }); w.sync(); assert.ok(!new Set(w.fx.kind.filter(Boolean)).has(COIN) && w.fx.live > 0, 'a sale at a loss gets sparks, no coins');
  w.fx.clear(); g.s.ledger.push({ h: g.s.hour, type: 'buy', text: 'x', amt: -90, z: 1 }); w.sync(); assert.equal(w.fx.live, 0, 'only a sale is celebrated');
  assert.deepEqual(faults(w), []);
});

test('a crate that lands raises dust, a district that opens throws rings and sparks, and the dust and fireflies and rain draw without a fault', async () => {
  const g = newGame(5); openTo(g, 2);
  const { w } = await world(g, { zone: 1, sel: new Set(g.s.assets.slice(0, 1).map((a) => a.id)) });
  w.focusZone(1, false); w.draw(); w.fx.clear();
  const e = [...w.ents.values()].find((x) => x.type === 'asset' || x.type === 'lot'); e.drop = 5; w.update(0.5);
  assert.ok(new Set(w.fx.kind.filter(Boolean)).has(PUFF), 'dust at the landing');
  w.fx.clear(); document.documentElement.dataset.motion = 'auto'; w.startReveal(3); assert.ok(w.fx.live >= 28 && new Set(w.fx.kind.filter(Boolean)).has(RING), 'the opening throws rings and sparks');
  w.fx.clear(); document.documentElement.dataset.motion = 'reduce'; w.startReveal(4); assert.equal(w.fx.live, 0, 'and nothing under reduced motion'); document.documentElement.dataset.motion = 'auto';
  for (const night of [0, 0.6, 1]) for (const crunch of [false, true]) { w.night = night; w.env.crunch = crunch; w.update(0.05); w.draw(); }
  assert.deepEqual(faults(w), []);
});

// ---------------------------------------------------------------- the draw loop
test('a hidden canvas is not drawn, and the loop picks up again when it is seen', async () => {
  const g = newGame(3); openTo(g, 3); const { w } = await world(g, { zone: 1, sel: new Set() });
  let draws = 0; const d = w.draw.bind(w); w.draw = () => { draws++; d(); };
  w.running = true; let ts = 1000; const step = () => { w.dirty = true; w.last = 0; w.frame(ts += 40); };
  step(); assert.equal(draws, 1); w.vis = false; step(); step(); assert.equal(draws, 1, 'off screen: no drawing'); w.vis = true; step(); assert.equal(draws, 2);
  document.hidden = true; step(); assert.equal(draws, 2, 'a hidden tab: no drawing'); document.hidden = false; w.stop();
});

test('the governor is steady: a lone slow frame changes nothing, a late frame counts, and a machine on the edge settles instead of flickering', async () => {
  const g = newGame(3); openTo(g, 5); const { w } = await world(g, { zone: 2, sel: new Set() });
  const gov = (cost, gap = 0) => w.govern(cost, gap);
  w.warm = 0; w.slow = 0;
  for (let i = 0; i < 30; i++) gov(5); gov(60); for (let i = 0; i < 10; i++) gov(5); assert.equal(w.slow, 0, 'one hitch in forty frames is not a slow machine');
  for (let i = 0; i < 30; i++) gov(5, 200); assert.ok(w.slow >= 2, 'frames that arrive far too late step quality down however cheap the drawing: ' + w.slow);
  const was = w.slow; w.gov.cost = 10; for (let i = 0; i < 9; i++) gov(5); assert.equal(w.slow, was, 'a step back up waits for a long spell of good frames'); gov(5); assert.equal(w.slow, was - 1, 'then it comes');
  // the edge: tip over soon after stepping up and the wait for the next step up doubles
  w.t = 1000; w.slow = 2; w.gov.upAt = 900; w.gov.wait = 10; w.gov.cost = 40; w.gov.bad = 0; for (let i = 0; i < 3; i++) gov(40); assert.equal(w.slow, 3); assert.equal(w.gov.wait, 20, 'tipping over again within six seconds of a step up doubles the wait');
  for (let k = 0; k < 8; k++) { w.slow = 2; w.gov.upAt = w.t - 10; w.gov.cost = 40; for (let i = 0; i < 3; i++) gov(40); } assert.equal(w.gov.wait, 400, 'it doubles up to forty times the base wait and no further');
  w.warm = 5; const s0 = w.slow; for (let i = 0; i < 5; i++) gov(90); assert.equal(w.slow, s0, 'cold frames after a resize are never judged'); assert.equal(w.warm, 0);
});

test('the frame loop makes the same objects every frame: the depth list and the traffic are reused, never rebuilt', async () => {
  const g = newGame(3); openTo(g, 6); const { w } = await world(g, { zone: 1, sel: new Set() });
  w.focusZone(1, false); w.draw(); const items = w.items, pool = w.itemPool, cars = w.carList, vz = w.vz, view = w.view;
  const first = w.itemPool[0], n = w.itemPool.length;
  for (let i = 0; i < 5; i++) w.draw();
  assert.strictEqual(w.items, items); assert.strictEqual(w.itemPool, pool); assert.strictEqual(w.carList, cars); assert.strictEqual(w.vz, vz); assert.strictEqual(w.view, view); assert.strictEqual(w.itemPool[0], first);
  assert.equal(w.itemPool.length, n, 'the pool did not grow with the frames');
  const keys = w.items.map((it) => it.key); assert.deepEqual(keys, [...keys].sort((a, b) => a - b), 'still sorted back to front');
});
