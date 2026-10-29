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
import { FLAGS, setFlag, setFlags } from '../js/world/stack.js';
// These tests pin the LEGACY ground and sea (the full-window ground cache, the sea's one strip): they run with every layer flagged legacy (?layers=all:legacy), a picture that is still supported.
// The V2 ground (chunks, the sea in world space) is pinned by tests/world-chunks.test.mjs and tests/world-water.test.mjs.
const withLegacy = async (fn) => { const was = { ...FLAGS }; setFlags('all:legacy'); try { await fn(); } finally { for (const [k, v] of Object.entries(was)) setFlag(k, v); } };

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

test('the whole-island view keeps every district\'s name tag, near its district and clear of the others; passing notes give way to the tags, and to every one on a phone', async () => {
  const g = newGame(3); // day 0: one district open, fifteen locked, so every district has a "Opens at" note and the island is as crowded as it gets
  for (const [W0, H0] of [[390, 844], [1024, 768], [1440, 900]]) {
    const { w } = await world(g, { zone: 1, sel: new Set() }, [W0, H0]);
    w.mode = 'world'; w.fit(false); w.draw(); assert.deepEqual(faults(w), []);
    assert.ok(w.cam.z < 0.45, 'the island is zoomed out past the pips: ' + w.cam.z);
    assert.equal(w.tagN, 16, `${W0}px: every district keeps its tag (none is left out)`);
    const rects = []; for (let i = 0; i < w.tagN; i++) { const t = w.tagPlan[i], wd = t.text.length * 6.7 + 14; rects.push({ t, x0: t.x - wd / 2, x1: t.x + wd / 2, y0: t.y - 9, y1: t.y + 9 }); }
    for (const a of rects) {
      assert.ok(a.x0 >= 0 && a.x1 <= W0, `${W0}px: tag ${a.t.id} is whole on the screen`);
      assert.ok(Math.abs(a.t.y - a.t.py) <= 38 && Math.abs(a.t.x - a.t.px) <= 68 + 70, `${W0}px: tag ${a.t.id} stays near its district`);
      let covered = 0; for (const b of rects) if (b !== a) { const ow = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oh = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); if (ow > 0 && oh > 0) covered += ow * oh; }
      assert.ok(covered <= 0.1 * (a.x1 - a.x0) * 18, `${W0}px: tag ${a.t.id} is covered ${Math.round(100 * covered / ((a.x1 - a.x0) * 18))}% by the others`);
    }
    const here = w.tagPlan[0]; assert.equal(here.id, w.player.zone, 'the district you are in is placed first'); assert.equal(here.k, 0, 'and stands exactly over its district'); assert.ok(here.text.startsWith('●'), 'and carries the marker that says you are there');
    const notes = w.overlay.filter((o) => o.lo); assert.ok(notes.length >= 10, 'the locked gates and the player each have a passing note: ' + notes.length);
    for (const o of notes.filter((n) => n.on)) { // a note that is shown never lies on a name tag
      const k = qs(Math.min(1.25, Math.max(0.75, w.cam.z))), wd = (o.n * 6.7 + 14) * k, x0 = o.px - wd / 2, x1 = o.px + wd / 2, y0 = o.py - 9 * k, y1 = o.py + 9 * k; // the size the placement works with
      for (const a of rects) assert.ok(!(x0 < a.x1 && x1 > a.x0 && y0 < a.y1 && y1 > a.y0), `${W0}px: a passing note lies on tag ${a.t.id}`);
    }
    if (W0 < 500) assert.equal(notes.filter((o) => o.on).length, 0, 'on a phone\'s island no passing note is shown (the tags carry the locks and the marker says where you are)');
    else assert.ok(notes.some((o) => o.on), `${W0}px: where there is room the notes that clear the tags stay`);
    const [wx, wy] = w.s2w(W0 - 60, 60), probe = { k: 'chip', lo: 1, n: 14, wx, wy, draw: () => {} }; // a note in an empty corner, where no tag stands
    w.overlay.push(probe); w.drawOverlay(w.ctx); assert.equal(probe.on, W0 >= 500, W0 < 500 ? 'on a phone\'s island even a note with room is left out' : 'with room, and clear of every tag, a note stays');
  }
});

test('name tags that still touch are drawn shorter, never dropped, and the one placed first is on top; zoomed in, with room, each stands over its own district', async () => {
  const g = newGame(3);
  const { w } = await world(g, { zone: 1, sel: new Set() }, [390, 844]);
  w.mode = 'world'; w.fit(false); w.draw();
  assert.ok(w.tagPlan.slice(0, w.tagN).some((t) => !t.text.includes('  ')), 'on a phone some tags are drawn short (the lock and the number)');
  const order = []; const chip = w.chip.bind(w); w.chip = (c, x, y, text, ...r) => { order.push(text); chip(c, x, y, text, ...r); };
  w.draw(); const texts = order.filter((t) => /^(● |\u{1F512} )?\d+( |$)/u.test(t)); assert.equal(texts.length, 16, 'sixteen tags are drawn');
  assert.ok(texts.at(-1).startsWith('●'), 'the tag placed first (where you are) is drawn last, on top of any that still touch it');
  w.focusZone(1, false); w.draw(); assert.ok(w.tagN > 0 && w.tagN < 4, 'closed in on one district a phone has only a tag or two on it: ' + w.tagN);
  const [px, py] = w.s2w(330, 120), note = { k: 'chip', lo: 1, n: 14, wx: px, wy: py, draw: () => {} }; w.overlay.push(note); w.drawOverlay(w.ctx);
  assert.equal(note.on, true, 'with no crowd of tags a passing note shows again, even on a phone');
  w.focusZone(5, false); w.cam.z = 0.7; w.clampCam(); w.draw(); assert.deepEqual(faults(w), []);
  assert.ok(w.tagN > 0 && w.tagN < 16, 'zoomed in to one district only the tags near it are placed: ' + w.tagN);
  for (let i = 0; i < w.tagN; i++) { const t = w.tagPlan[i]; assert.ok(t.text.includes('  '), 'zoomed in, with room, no tag is short'); assert.equal(t.k, 0, 'and each stands over its own district'); }
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
test('the ground is stamped from chunks of the exact scale: a still camera bakes them, later frames only stamp, and anything that changes them bakes again (pins the chunk cache of docs/RENDER_PLAN.md section 5; it pinned the one full-window copy)', async () => { await withLegacy(async () => {
  const g = newGame(3); openTo(g, 3);
  const log = stubDom(1000, 640); installOffscreen(log);
  const { World } = await import('../js/world/world.js');
  const session = { game: g, clock: { now: () => g.s.hour, paused: true, speed: 1 } };
  const w = new World({ session, ui: { zone: 1, sel: new Set() }, activate: noop, hover: noop });
  w.host = { getBoundingClientRect: () => ({ width: 1000, height: 640 }) }; w.resize(); w.sync(); w.placePlayer();
  let direct = 0, still = 0, live = 0; const dg = w.drawGround.bind(w); w.drawGround = (c, v, mode = 0) => { if (mode === 0) direct++; else if (mode === 1) still++; else live++; dg(c, v, mode); };
  w.gcRest = 0; w.gcFade = 0; // (the scale must rest 90 ms before chunks are baked at it; a test that draws in a loop says it has)
  const settle = (n = 80) => { for (let i = 0; i < n; i++) { w.draw(); if (w.gcValid) break; } return w.gcValid; };
  w.focusZone(1, false); w.draw(); assert.ok(w.gc && w.gc.size > 0, 'the first frame bakes at least one chunk (progress is guaranteed)'); assert.equal(direct, 0, 'and no frame draws the whole ground directly while chunks can be made'); assert.equal(live, 1, 'what moves is drawn live over them');
  assert.ok(settle(), 'a still camera bakes every visible chunk'); const baked = w.gc.stats.baked, cells = w.gc.size;
  still = 0; w.draw(); w.draw(); w.draw(); assert.equal(w.gc.stats.baked, baked, 'later frames only stamp'); assert.equal(still, 0, 'the ground layers are not called'); assert.equal(live, live, '');
  w.cam.x += 1; w.draw(); w.draw(); assert.ok(w.gc.stats.baked - baked <= 3, 'a one pixel pan bakes at most the cells its edge uncovers: ' + (w.gc.stats.baked - baked));
  const snap0 = w.snap.slice(); assert.ok(Number.isInteger(snap0[0]) && Number.isInteger(snap0[1]), 'the camera translation is whole device pixels: ' + snap0);
  w.cam.x += 700; w.clampCam(); const b1 = w.gc.stats.baked; settle(); assert.ok(w.gc.stats.baked > b1, 'a pan of a window bakes the cells it reveals');
  const b2 = w.gc.stats.baked; w.gcBudget = [0, 0]; w.cam.z *= 1.01; w.draw(); assert.ok(w.gc.stats.stale > 0, 'a zoom is first shown from the chunks of the scale before (when the frame has no time to bake them all)'); w.gcBudget = null; settle(); assert.ok(w.gc.stats.baked > b2, 'and a new scale is baked once the zoom rests'); assert.equal(w.gc.size <= 80, true, 'the store is capped: ' + w.gc.size);
  const sizeBefore = w.gc.size; document.documentElement.dataset.motion = 'reduce'; openTo(g, 4); w.sync(); w.draw(); assert.ok(w.gc.size < sizeBefore, 'a district opening drops every chunk (the ground it shows has changed)'); settle(); document.documentElement.dataset.motion = 'auto';
  const b3 = w.gc.stats.baked; w.resize(); settle(); assert.equal(w.gc.stats.baked, b3, 'a resize keeps the chunks: they are cut by scale, not by window');
  const d4 = direct; w.reveal[2] = { t0: w.t, dur: 2600 }; w.draw(); w.draw(); assert.ok(direct > d4, 'a district that is opening is drawn directly (its fog moves)');
  delete w.reveal[2];
  assert.deepEqual(faults(w), []); w.release(); assert.equal(w.gc, null, 'release gives the chunks back'); delete globalThis.OffscreenCanvas;
  });
});

test('a reveal nobody is looking at does not hold the ground cache off: one that has finished is swept', async () => {
  const g = newGame(3); openTo(g, 3); const { w } = await world(g, { zone: 1, sel: new Set() });
  w.t = 10000; w.reveal[16] = { t0: 1000, dur: 2600 }; w.reveal[2] = { t0: 9000, dur: 2600 };
  assert.equal(w.revealing(), true, 'one is still opening'); assert.equal(w.reveal[16], undefined, 'the finished one, far out of view, was swept'); assert.ok(w.reveal[2]);
  w.t = 12000; assert.equal(w.revealing(), false); assert.deepEqual(Object.keys(w.reveal), []);
});

test('the cached ground puts every moving decal on top: water and pulses are drawn live, not stamped', async () => { await withLegacy(async () => {
  const g = newGame(3); openTo(g, 16);
  const log = stubDom(1000, 640); installOffscreen(log);
  const { World } = await import('../js/world/world.js');
  const session = { game: g, clock: { now: () => g.s.hour, paused: true, speed: 1 } };
  const w = new World({ session, ui: { zone: 1, sel: new Set() }, activate: noop, hover: noop });
  w.host = { getBoundingClientRect: () => ({ width: 1000, height: 640 }) }; w.resize(); w.sync(); w.placePlayer();
  const kinds = []; const dd = w.drawDecal.bind(w); w.drawDecal = (c, d, z, k, part = 0) => { kinds.push(d.k + ':' + part); dd(c, d, z, k, part); };
  let id = 0; for (const z of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) if (DIST[z].decals.some((d) => d.k === 'water' || d.k === 'pulse')) { id = z; break; }
  assert.ok(id, 'some district has a moving decal'); w.gcRest = 0; w.focusZone(id, false); for (let i = 0; i < 80 && !w.gcValid; i++) w.draw(); w.draw(); kinds.length = 0; w.draw();
  assert.ok(kinds.length > 0 && kinds.every((k) => k.endsWith(':2')), 'a stamped frame draws only the live part of the moving decals: ' + [...new Set(kinds)].join());
  delete globalThis.OffscreenCanvas;
  });
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

test('reduced motion is a still picture: a frame drawn on demand a quarter second after the last is never judged slow (the quality tier stays at 0), and with nothing animating and nothing changed the loop asks for no frame at all until something marks the picture dirty', async () => {
  const g = newGame(3); openTo(g, 3); const { w } = await world(g, { zone: 1, sel: new Set() });
  document.documentElement.dataset.motion = 'reduce';
  try {
    let asked = 0; const raf = globalThis.requestAnimationFrame; globalThis.requestAnimationFrame = () => { asked++; return asked; };
    w.running = true; w.raf = 0; w.vis = true; w.warm = 0; w.slow = 0; w.camTo = null; w.player.path.length = 0;
    let ts = 1000; w.last = 0; w.dirty = true; asked = 0; let draws = 0; const d = w.draw.bind(w); w.draw = () => { draws++; d(); };
    for (let i = 0; i < 40; i++) { w.dirty = true; w.last = 0; w.frame(ts += 240); w.gov.cost = Math.max(w.gov.cost, 0); } // the game's clock marks the picture dirty about four times a second: each redraw is a frame on demand, 240 ms after the one before
    assert.equal(draws, 40, 'each is drawn'); assert.equal(w.slow, 0, 'and none is slow: the gap between on-demand frames is not a late frame'); assert.equal(w.gov.prev, 0, 'the previous frame is not remembered as a continuous one');
    asked = 0; w.raf = 0; w.frame(ts += 16); assert.equal(asked, 0, 'nothing animates and nothing changed: no frame is asked for'); assert.equal(w.raf, 0);
    w.dirty = true; assert.equal(asked, 1, 'marking the picture dirty wakes the loop'); assert.ok(w.raf !== 0 || asked === 1);
    globalThis.requestAnimationFrame = raf; w.stop();
  } finally { delete document.documentElement.dataset.motion; }
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

// ---------------------------------------------------------------- baked layers at the canvas's own size, the sea, the pips
/** A recording stand-in for OffscreenCanvas: each surface keeps its own list of drawImage calls and path points, so a test can ask what was stamped where. */
function installRecording(log) {
  log.surfaces = 0; log.made = [];
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; log.surfaces++; log.made.push(this); this.g = recorder(this); } getContext() { return this.g; } };
}
function recorder(owner) {
  const rec = { owner, imgs: [], pts: [], calls: {}, measureText: (s) => ({ width: String(s).length * 6 }), getTransform: () => ({}) };
  for (const k of ['createLinearGradient', 'createRadialGradient']) rec[k] = () => { rec.calls[k] = (rec.calls[k] || 0) + 1; return grad; };
  return new Proxy(rec, {
    get(o, k) {
      if (k in o) return o[k]; if (typeof k === 'symbol') return undefined;
      return (...a) => { o.calls[k] = (o.calls[k] || 0) + 1; if (k === 'drawImage') o.imgs.push({ img: a[0], n: a.length, a }); if (k === 'moveTo' || k === 'lineTo') o.pts.push([k, a[0], a[1]]); if (k === 'setTransform') o.lastT = a; };
    },
    set(o, k, v) { o[k] = v; return true; },
  });
}
const light = (over = {}) => ({ W: 800, H: 520, dpr: 2, cv: { width: 1600, height: 1040 }, night: 0, dusk: 0, lite: false, t: 0, env: { crunch: false }, reduced: () => false, ...over });

test('the air is stamped one-to-one from bitmaps of the canvas\'s own size, made once; a dusk crossfades day and night in one stamp, remade only when the mix steps', () => {
  const log = stubDom(); installRecording(log); const lit = new Lighting(), main = recorder('main');
  const frame = (w) => { main.imgs.length = 0; lit.ambient(main, w); return main.imgs; };
  let s = frame(light());
  assert.equal(s.length, 1, 'a daylit frame is one stamp'); assert.equal(s[0].n, 3, 'a straight copy (image, x, y): no stretch'); assert.equal(s[0].img.width, 1600); assert.equal(s[0].img.height, 1040, 'the canvas\'s own pixels, not the window\'s');
  assert.deepEqual(main.lastT, [1, 0, 0, 1, 0, 0], 'drawn in device pixels (the identity transform; restore() gives the window transform back)');
  const made = log.surfaces; frame(light()); frame(light()); assert.equal(log.surfaces, made, 'later frames make no bitmap');
  s = frame(light({ night: 1 })); assert.equal(s.length, 1, 'a night is one stamp too'); assert.equal(s[0].img.width, 1600);
  const dusk = (n) => light({ night: n, dusk: 1 });
  s = frame(dusk(0.3)); assert.equal(s.length, 1, 'dusk: the crossfade of day and night with the shafts baked into it: one stamp, not three (the additive stamp of the shafts was 3.5 ms of a CPU-drawn frame)');
  const mix = s[0].img, into = (o) => o.g.imgs.length; const remade = into(mix); frame(dusk(0.3)); frame(dusk(0.3)); assert.equal(into(mix), remade, 'the same step is not made again');
  frame(dusk(0.302)); assert.equal(into(mix), remade, 'a hair of change stays in the same step (a twenty-fourth)');
  frame(dusk(0.45)); assert.equal(into(mix), remade + 3, 'a new step is the two airs and the shafts drawn into it again, once');
  frame(light({ lite: true, dusk: 1, night: 0.3 })); assert.equal(main.imgs.length, 1, 'the quiet tier: one stamp, no shafts');
  s = frame(light({ dusk: 1, reduced: () => true })); assert.equal(s.length, 1, 'reduced motion leaves out the shafts');
  const nightLayer = lit.big.night; assert.ok(nightLayer, 'the night\'s layer was made when it was wanted');
  frame(light({ t: 30000 })); assert.equal(lit.big.night, null, 'a layer nobody has stamped for twenty seconds is let go'); assert.equal(lit.big.mix, null); assert.ok(lit.big.day, 'the one in use stays');
  frame(light({ cv: { width: 1200, height: 780 } })); assert.equal(lit.big.day.width, 1200, 'a different canvas size makes the layers again at that size');
  delete globalThis.OffscreenCanvas;
  const log2 = stubDom(); const lit2 = new Lighting(), c2 = recorder('c2'); lit2.ambient(c2, light());
  assert.equal(c2.calls.drawImage, undefined, 'without surfaces there is no stamp'); assert.equal(c2.calls.fillRect, 1, 'one gradient fill, as the world always drew'); void log2;
});

test('the falloff toward the edge is part of the day and night layers: the centre is clear and the corners carry the air\'s colour', () => {
  const log = stubDom(); installRecording(log); const lit = new Lighting(); lit.bake(800, 520);
  assert.ok(lit.src.day && lit.src.night && lit.src.shafts, 'three small bakes');
  assert.equal(lit.src.day.width, 200); assert.equal(lit.src.day.height, 130, 'a quarter of the window');
  assert.ok(lit.src.day.g.calls.createRadialGradient >= 2, 'the day layer holds the falloff and the vignette: two radial gradients'); assert.ok(lit.src.night.g.calls.createRadialGradient >= 2);
  delete globalThis.OffscreenCanvas;
});

test('the sea is one strip of 256 samples, painted again in place at each light step and stretched over the canvas; the waves are one stroke and never streak across the window', async () => {
  const g = newGame(3); openTo(g, 3);
  const log = stubDom(1000, 640); installRecording(log);
  const { World } = await import('../js/world/world.js');
  const session = { game: g, clock: { now: () => g.s.hour, paused: true, speed: 1 } };
  const w = new World({ session, ui: { zone: 1, sel: new Set() }, activate: noop, hover: noop });
  w.host = { getBoundingClientRect: () => ({ width: 1000, height: 640 }) }; w.resize(); w.sync(); w.placePlayer();
  const main = recorder('main'); w.night = 0; w.dusk = 0; const s0 = log.surfaces;
  w.drawWater(main); assert.equal(log.surfaces, s0 + 1, 'the sea\'s strip was made'); const strip = log.made[log.made.length - 1];
  assert.equal(strip.width, 1); assert.equal(strip.height, 256, 'one pixel wide: the sea only changes from the top of the window to its foot');
  assert.equal(main.imgs[0].n, 9, 'and stamped stretched'); assert.deepEqual(main.imgs[0].a.slice(1, 5), [0, 0, 1, 256], 'the whole strip'); assert.deepEqual(main.imgs[0].a.slice(5), [0, 0, w.cv.width, w.cv.height], 'over the canvas\'s own pixels');
  const painted = () => strip.g.calls.fillRect || 0, p0 = painted();
  for (let i = 0; i < 3; i++) w.drawWater(main); assert.equal(log.surfaces, s0 + 1); assert.equal(painted(), p0, 'not painted again while the light stays in its step'); assert.equal(main.imgs.length, 4);
  w.night = 0.5; w.drawWater(main); assert.equal(log.surfaces, s0 + 1, 'a new light step makes no new bitmap'); assert.equal(painted(), p0 + 1, 'it paints the same strip again, once');
  w.dusk = 0.5; w.drawWater(main); w.drawWater(main); assert.equal(log.surfaces, s0 + 1); assert.equal(painted(), p0 + 2, 'the dusk steps likewise');
  assert.equal(main.calls.stroke, 7, 'the 26 wave lines are one stroke a frame');
  for (const t of [0, 5000, 90000]) { w.vt = t; main.pts.length = 0; w.drawWater(main); let prev = null; for (const [k, x] of main.pts) { if (k === 'lineTo') assert.ok(Math.abs(x - prev) < 80, `a wave line does not leap across the window (${prev} to ${x})`); prev = x; } }
  w.resize(); w.drawWater(main); assert.equal(log.made.filter((c) => c.width === 1 && c.height === 256).length, 1, 'a resize needs no new strip: it is stretched to whatever size the canvas has');
  assert.deepEqual(main.imgs[main.imgs.length - 1].a.slice(5), [0, 0, w.cv.width, w.cv.height]);
  delete globalThis.OffscreenCanvas;
});

test('at the whole-island zoom each district shows one pip per pipeline under its name; the building\'s own bar comes back when zoomed in', async () => {
  const g = newGame(8); openTo(g, 9); g.s.cash = 5e6;
  const log = stubDom(1440, 900); installRecording(log);
  const { World } = await import('../js/world/world.js');
  const session = { game: g, clock: { now: () => g.s.hour, paused: true, speed: 1 } };
  const w = new World({ session, ui: { zone: 5, sel: new Set() }, activate: noop, hover: noop });
  w.host = { getBoundingClientRect: () => ({ width: 1440, height: 900 }) }; w.resize();
  const lane = g.radar(5, 1)[0], cls = lane.cls, buyer = lane.seg;
  const a = g.hirePipeline('broker', 5, { cls, buyer }).pipe, b = g.hirePipeline('student', 5, { cls, buyer }).pipe, c = g.hirePipeline('logistics', 5, { cls, buyer }).pipe;
  b.status = 'paused'; c.starved = true; w.sync(); w.placePlayer(); void a;
  w.zonePips(); const k = 5 * 3; assert.deepEqual([w.zpip[k], w.zpip[k + 1], w.zpip[k + 2]], [1, 1, 1], 'one running, one paused, one starved');
  assert.equal([...w.zpip].reduce((x, y) => x + y, 0), 3, 'no other district has any');
  const sp = w.labels.pips(1, 1, 1); assert.strictEqual(w.labels.pips(1, 1, 1), sp, 'the row is a cached sprite'); assert.ok(sp.w > 20 && sp.h < 14, 'three short bars on a small plate');
  assert.notStrictEqual(w.labels.pips(2, 0, 0), sp); assert.equal(w.labels.pips(9, 9, 9).w, w.labels.pips(6, 0, 0).w, 'never more than six');
  w.fit(false); assert.ok(w.cam.z < 0.45, 'the whole island is zoomed out past the bar\'s zoom: ' + w.cam.z);
  const stamped = []; const blit = w.labels.blit.bind(w.labels); w.labels.blit = (c, spr, x, y, ...r) => { stamped.push(spr); blit(c, spr, x, y, ...r); };
  w.draw(); assert.ok(stamped.includes(sp), 'the district\'s name tag carries its pips'); assert.deepEqual(w.overlay.filter((o) => o.k === 'bar'), [], 'and no building bar is pushed at this zoom');
  stamped.length = 0; w.mode = 'map'; w.fit(false); w.draw(); assert.ok(stamped.includes(sp), 'on the map the card carries them');
  w.mode = 'world'; w.focusZone(5, false); w.draw(); assert.equal(w.overlay.filter((o) => o.k === 'bar').length, 3, 'zoomed in, each building has its bar again');
  assert.deepEqual(faults(w), []); delete globalThis.OffscreenCanvas;
});
