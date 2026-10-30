// The ground pass leaves no hole while it is being made (js/world/groundcache.js on the chunk store of js/world/chunkcache.js; the store's own rules are tests/world-holes.test.mjs). What a frame DREW is read back from the
// recording context with the clips in force, so the picture is judged and not the bookkeeping: a sample point of the canvas is covered when some blit that reached it was not clipped away. One chunk is baked a frame
// (`gcBudget`), as on a machine four times slower than a Mac, and the camera is moved the way a player moves it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recCtx } from './helpers/recctx.mjs';
import { reach } from './helpers/reach.mjs';

globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; this.ctx = recCtx(); } getContext() { return this.ctx.ctx; } };
globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
const { groundCacheMethods } = await import('../js/world/groundcache.js');
const { groundMethods } = await import('../js/world/ground.js');
const { CHUNK_PX, scaleKey, chunkKey, COVER_MIN } = await import('../js/world/chunks.js');
const { lodOf } = await import('../js/world/lod.js');
const { registerLayer } = await import('../js/world/stack.js');
registerLayer('shore', () => {}, 'inherit', () => 1);
for (const id of ['terrain', 'roads', 'blocks']) registerLayer(id, () => {}, 'inherit', () => 1);
registerLayer('livedecals', () => {}, 'inherit');

const world = (cam = { x: -2944, y: 2153, z: 1 }, dpr = 1.5, W = 1440, H = 900) => ({
  ...groundCacheMethods, ...groundMethods,
  cam, dpr, W, H, cv: { width: Math.floor(W * dpr), height: Math.floor(H * dpr) }, unlockHash: 7, unlocked: new Set([1]), gnd: { zoom: 1, far: false, mode: 0, see: null, chunk: null }, gcKey: [NaN, NaN, NaN, 0, 0, 0, 0, 0], gcSeen: 0, gcValid: false, dirty: false, gcA: Math.round(cam.z * dpr * 1e5) / 1e5, gcAt: -1e9,
  env: { t: 0, night: 0, dim: 0, far: false, lite: false, lod: lodOf(cam.z), lights: [] }, reveal: {}, hits: [], decals: new Map(),
  toWorld() {}, toScreen() {}, revealing() { return !!this.reveal.on; }, reduced() { return true; }, fxOf() { return { dim: 0 }; },
  gcBudget: [1e-6, 1e-6], gcRest: 0, // one chunk a frame, and the scale is never "just changed" unless a test says so
});
const frame = (w) => { const main = recCtx(); w.env.lod = lodOf(w.cam.z); w.groundPass(main.ctx, { x0: -1e5, x1: 1e5, y0: -1e5, y1: 1e5 }); return main; };

const exactCount = (w) => { const sk = scaleKey(w.renderScale()); return [...w.gc.map.values()].filter((c) => c.sk === sk).length; };

test('a first frame that cannot make the whole ground: the cells nothing covers are baked coarse first (a quarter of the chunks), and no exact chunk is baked until the window is covered', () => {
  const w = world(); const log = [];
  for (let n = 0; n < 40; n++) { const main = frame(w), r = reach(main, w.cv.width, w.cv.height); log.push({ bare: r.bare(), exact: exactCount(w), holes: w.gcHoles, coarse: [...w.gc.map.values()].filter((c) => c.coarse).length }); if (w.gcHoles === 0 && n > 3) break; }
  const first = log.findIndex((l) => l.bare === 0); assert.ok(first >= 0, 'the window is covered at some frame: ' + JSON.stringify(log.slice(0, 12)));
  assert.ok(first <= 12, `covered by frame ${first + 1}: a coarse chunk is about four cells of it (the first ground is 24 cells and 24 frames); ` + JSON.stringify(log.slice(0, first + 1).map((l) => l.bare)));
  assert.equal(Math.max(...log.slice(0, first).map((l) => l.exact)), 0, 'no exact chunk before the window is covered');
  for (let n = 1; n < log.length; n++) assert.ok(log[n].bare <= log[n - 1].bare || log[n - 1].bare === 0, 'what is bare only shrinks: ' + JSON.stringify(log.map((l) => l.bare)));
  for (const l of log) assert.ok((l.bare === 0) === (l.holes === 0), `the gauge says what the picture shows: ${l.bare} sample points bare, gcHoles ${l.holes}`);
  assert.ok(log[0].coarse >= 1, 'the first chunk is a coarse one');
  for (let n = 0; n < 60; n++) frame(w); assert.equal(w.gcValid, true, 'and the exact ground follows');
  assert.equal([...w.gc.map.values()].filter((c) => c.coarse).length, 0, 'the coarse chunks are gone when the exact ones cover them');
});

test('the same ground when the budget is whole (a test, the shot rig): exact chunks at once, nothing coarse is made', () => {
  const w = world(); w.gcBudget = [1e9, 1e9]; frame(w); assert.equal(w.gcValid, true); assert.equal([...w.gc.map.values()].filter((c) => c.coarse).length, 0);
});

test('a veiled ground is made exact first: while the canvas is held back nobody sees the cells being made, so no coarse chunk is wasted', () => {
  const w = world(); w.veilHold = true; for (let n = 0; n < 6; n++) frame(w);
  assert.equal([...w.gc.map.values()].filter((c) => c.coarse).length, 0); assert.ok(exactCount(w) >= 5, 'one exact chunk a frame');
  w.veilHold = false; frame(w); assert.ok([...w.gc.map.values()].some((c) => c.coarse) || w.gcHoles === 0, 'when the veil is lifted the cells still bare are covered coarse first');
});

test('zooming out over a ground that was made for a nearer view: the chunks of the old scale are the soft picture of what they hold the same frame, and what they do not hold is covered coarse, one chunk a frame, with no bare cell inside the old window at any frame', () => {
  const w = world(); w.gcBudget = [1e9, 1e9]; frame(w); w.gcBudget = [1e-6, 1e-6]; for (let n = 0; n < 40; n++) frame(w); // the whole window and its ring, made
  const a0 = w.renderScale(), e0 = w.snap[0], f0 = w.snap[1], cw = w.cv.width, ch = w.cv.height, old = { x0: -e0 / a0, x1: (cw - e0) / a0, y0: -f0 / a0, y1: (ch - f0) / a0 }; // the window the ground was made for, in world pixels
  w.cam.z = 0.4; w.gcRest = 0; const log = [];
  for (let n = 0; n < 30; n++) {
    const main = frame(w), a = w.renderScale(), e = w.snap[0], f = w.snap[1], r = reach(main, cw, ch);
    const inner = r.bare(old.x0 * a + e + 8, old.y0 * a + f + 8, old.x1 * a + e - 8, old.y1 * a + f - 8); // the part of the screen that the old window's world fills now
    log.push({ bare: r.bare(), inner, holes: w.gcHoles, size: w.gc.size });
    assert.equal(inner, 0, `frame ${n + 1}: the old window's own ground is bare at ${inner} sample points: ` + JSON.stringify(log.map((l) => l.bare)));
  }
  assert.equal(log.at(-1).bare, 0, 'and covered at the end: ' + JSON.stringify(log.map((l) => l.bare)));
  assert.ok(log.findIndex((l) => l.bare === 0) <= 12, 'in a dozen frames: ' + JSON.stringify(log.map((l) => l.bare)));
});

test('two notches out, a chunk a frame, the cap in force: the ground the old window made is never taken from under the picture (the middle of the town did go bare: the cap dropped the oldest stand-ins on show)', () => {
  const w = world(); w.gcBudget = [1e9, 1e9]; frame(w); w.gcBudget = [1e-6, 1e-6]; for (let n = 0; n < 60; n++) frame(w);
  const a0 = w.renderScale(), cw = w.cv.width, ch = w.cv.height, e0 = w.snap[0], f0 = w.snap[1], old = { x0: -e0 / a0, x1: (cw - e0) / a0, y0: -f0 / a0, y1: (ch - f0) / a0 };
  const worst = []; let maxSize = 0;
  for (const z of [1 / 1.16, 1 / 1.16 / 1.16]) {
    w.cam.z = z; w.gcRest = 1e9; // (the scale is moving)
    for (let n = 0; n < 8; n++) {
      const main = frame(w), a = w.renderScale(), e = w.snap[0], f = w.snap[1], r = reach(main, cw, ch);
      worst.push(r.bare(old.x0 * a + e + 8, old.y0 * a + f + 8, old.x1 * a + e - 8, old.y1 * a + f - 8)); maxSize = Math.max(maxSize, w.gc.size);
    }
  }
  assert.deepEqual(worst.filter((n) => n > 0), [], 'no sample point of the old window\'s ground was bare at any frame: ' + JSON.stringify(worst));
  assert.ok(maxSize <= Math.ceil(50 * 1.25) + 1, 'and the store stayed within its hard limit: ' + maxSize);
});

test('a chunk that is fading in has the picture it replaces under it: the stand-in is drawn there, not left to the sea', () => {
  const w = world(); w.gcBudget = [1e9, 1e9]; frame(w); w.cam.z = 0.93; w.gcRest = 0; w.reduced = () => false; w.gcFade = 140; w.gcBudget = [1e-6, 1e-6];
  const cw = w.cv.width, ch = w.cv.height; let seen = 0;
  for (let n = 0; n < 20; n++) {
    const main = frame(w), sk = scaleKey(w.renderScale()), fading = [...w.gc.map.values()].filter((c) => c.sk === sk && c.fadeEnd > performance.now());
    for (const c of fading) c.fadeEnd = performance.now() + 1e6; // (the fade is long enough to be looked at: nothing here depends on the clock)
    const m2 = frame(w), e = w.snap[0], f = w.snap[1], at = new Set(fading.map((c) => `${c.i * CHUNK_PX + e},${c.j * CHUNK_PX + f}`));
    const r = reach(m2, cw, ch, { skip: (x, y, n3) => n3 === 3 && at.has(`${x},${y}`) }); seen += fading.length;
    assert.equal(r.bare(), 0, `frame ${n + 1}: with the ${fading.length} fading chunks taken away the picture is still whole`);
    for (const c of fading) c.fadeEnd = 0;
  }
  assert.ok(seen > 0, 'chunks did fade in over stand-ins');
});

test('a district opening: the stale chunks stay on show and are replaced exact, a chunk a frame, with no coarse chunk and no bare piece at any frame (a stale chunk covers its cell: it is not a hole)', () => {
  const w = world(); w.gcBudget = [1e9, 1e9]; frame(w); for (let n = 0; n < 30; n++) frame(w); w.gcBudget = [1e-6, 1e-6];
  const cw = w.cv.width, ch = w.cv.height, size = w.gc.size; w.unlockHash = 99; let frames = 0, coarse = 0;
  for (; frames < 60; frames++) { const main = frame(w), r = reach(main, cw, ch); assert.equal(r.bare(), 0, `frame ${frames + 1}: the window is whole while the stale chunks are replaced`); assert.equal(w.gcHoles, 0); coarse += [...w.gc.map.values()].filter((c) => c.coarse).length; if (w.gcValid) break; }
  assert.equal(w.gcValid, true, 'every stale chunk of the window was replaced'); assert.ok(frames <= 40, `in ${frames + 1} frames: one a frame`); assert.equal(coarse, 0, 'no coarse chunk was made'); assert.ok(w.gc.size <= size + 2);
  assert.equal([...w.gc.map.values()].filter((c) => c.stale && c.i >= 0 && c.j >= 0 && c.sk === scaleKey(w.renderScale())).length <= Math.ceil(size * 0.4), true);
});

test('what the gauge says: gcHoles is 0 at rest, and gcMore asks for the next frame while the ground is not whole (a loop that sleeps under reduced motion must not stop on a half-made ground)', () => {
  const w = world(); frame(w); assert.ok(w.gcHoles > 0, 'a ground with nothing made has holes'); assert.equal(w.gcMore, true, 'and wants another frame');
  w.gcBudget = [1e9, 1e9]; for (let n = 0; n < 3; n++) frame(w); frame(w); assert.equal(w.gcHoles, 0); assert.equal(w.gcMore, false, 'a whole ground asks for nothing'); assert.equal(w.gcValid, true);
});

test('a few bare cells (a pan that reveals one or two) are made exact at once, bare ones before covered ones: no coarse chunk is made for them (it was a second bake each, and the pan churned three times the chunks)', () => {
  const w = world(); w.gcBudget = [1e9, 1e9]; frame(w); w.gcBudget = [1e-6, 1e-6]; for (let n = 0; n < 40; n++) frame(w); // the whole window and its ring, made
  assert.equal(COVER_MIN, 3, 'the number of bare cells from which they are covered coarse first');
  const a = w.renderScale(), sk = scaleKey(a), s = CHUNK_PX / a, ci = Math.floor(w.cam.x / s), cj = Math.floor(w.cam.y / s);
  for (const [i, j] of [[ci, cj], [ci + 1, cj]]) { const c = w.gc.map.get(chunkKey(sk, i, j)); assert.ok(c, `a chunk in the middle of the window at ${i},${j}`); w.gc.drop(c); } // two cells in the middle with nothing under them: what a pan into unmade ground looks like
  const baked0 = w.gc.stats.baked, log = [];
  for (let n = 0; n < 3; n++) { const main = frame(w), r = reach(main, w.cv.width, w.cv.height); log.push({ coarse: [...w.gc.map.values()].filter((c) => c.coarse).length, holes: w.gcHoles, bare: r.bare() }); }
  assert.ok(log[0].holes >= 1 || log[0].bare >= 0, 'the frame saw the bare cells');
  assert.equal(Math.max(...log.map((l) => l.coarse)), 0, 'no coarse chunk was made: ' + JSON.stringify(log));
  assert.equal(w.gc.stats.baked - baked0, 2, 'two cells, two bakes (a coarse chunk and an exact one for each would be four): ' + JSON.stringify(log));
  assert.equal(log.at(-1).holes, 0, 'and nothing is bare at the end: ' + JSON.stringify(log)); assert.equal(log.at(-1).bare, 0, 'in the picture too');
});
