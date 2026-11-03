// The base of the V2 ground painted off the main thread (js/world/basework.js, js/world/baseclient.js, the hook in js/world/chunkcache.js and groundcache.js). A profile of a chunk bake at four times slower than a Mac
// (scripts/perf-moves.mjs) put two thirds of it in rasterbase.js's per-pixel painting (about 26 of 40 ms), which is typed-array arithmetic and needs no canvas: a worker paints it while the main thread draws frames, and
// the main thread only puts the pixels into the chunk, draws the vector layers over them and stamps the bitmap. What must hold: the pixels are the very pixels the main thread would have painted (a scene sent to the
// worker is the scene itself as far as the bake reads it), the protocol is small and fails safe (a worker that errors or goes silent is given up and the main thread paints as it always did), and the cache asks for a base
// without waiting for it.
import test from 'node:test';
import assert from 'node:assert/strict';

const { sceneOf } = await import('../js/world/scene.js');
const { LAYOUT } = await import('../js/world/layout.js');
const { bakeBase } = await import('../js/world/rasterbase.js');
const { baseSceneOf, paintBase } = await import('../js/world/basework.js');

/** A coast, a beach, a cliff and a lookout in 192 x 192 pixels at half a pixel to the world pixel: what a chunk of the starting view holds. */
const JOB = { N: 192, S: 0.5, ox: -3400, oy: 2000, maxZ: LAYOUT.maxZ };

test('a base painted from the scene as the worker receives it is the base painted from the scene itself, byte for byte', () => {
  const sc = sceneOf([2, 3]);
  const want = new Uint8ClampedArray(JOB.N * JOB.N * 4); bakeBase(want, JOB.N, JOB.N, JOB.S, JOB.ox, JOB.oy, sc, { maxZ: JOB.maxZ });
  const sent = structuredClone(baseSceneOf(sc)); // (what postMessage does: a copy of typed arrays and plain data, and nothing that is a function)
  const got = paintBase(JOB, sent);
  assert.equal(got.length, want.length); assert.ok(got instanceof Uint8ClampedArray);
  let diff = 0; for (let i = 0; i < want.length; i++) if (got[i] !== want[i]) diff++;
  assert.equal(diff, 0, `${diff} of ${want.length} bytes differ`);
  const seen = new Set(); for (let i = 0; i < want.length; i += 4 * 37) seen.add((want[i] << 16) | (want[i + 1] << 8) | want[i + 2]); assert.ok(seen.size > 200, `the picture is not a flat field (${seen.size} colours): the comparison means something`);
  for (let i = 3; i < got.length; i += 4) if (got[i] !== 255) assert.fail('opaque everywhere');
});

test('what is sent to the worker is only data: no function, and not the coast\'s rings (a bake reads neither)', () => {
  const sent = baseSceneOf(sceneOf([2, 3])); const fn = [];
  const walk = (o, p) => { for (const [k, v] of Object.entries(o)) { if (typeof v === 'function') fn.push(p + k); else if (v && typeof v === 'object' && !ArrayBuffer.isView(v)) walk(v, p + k + '.'); } };
  walk(sent, ''); assert.deepEqual(fn, []); assert.doesNotThrow(() => structuredClone(sent));
  assert.equal(sent.coast.rings, undefined, 'the rings are for building the cliff walls, which are built already');
  let bytes = 0; const sum = (o) => { for (const v of Object.values(o)) { if (ArrayBuffer.isView(v)) bytes += v.byteLength; else if (v && typeof v === 'object') sum(v); } }; sum(sent);
  assert.ok(bytes < 8e6, `${(bytes / 1e6).toFixed(1)} MB: copied once to the worker for each set of locked districts`);
});

// ---------------------------------------------------------------- the client: the main thread's side of the protocol
const { BaseClient, BASE_TIMEOUT_MS } = await import('../js/world/baseclient.js');
const fakeWorker = () => { const w = { posted: [], transfers: [], terminated: false, onmessage: null, onerror: null, postMessage(m, tr) { w.posted.push(m); w.transfers.push(tr || []); }, terminate() { w.terminated = true; } }; return w; };
const reply = (w, k, bytes) => w.onmessage({ data: { id: w.posted.filter((m) => m.t === 'bake')[k].id, buf: new ArrayBuffer(bytes) } });
const JOBN = { N: 8, S: 1, ox: 0, oy: 0, maxZ: 5 };

test('the client sends a scene once and a bake once, answers nothing while the worker paints, and hands the pixels over once', () => {
  const w = fakeWorker(), c = new BaseClient(() => w); let built = 0; const scene = () => { built++; return { s: 1 }; };
  assert.equal(c.ask('a', JOBN, 'k1', scene, 0), null);
  assert.deepEqual(w.posted.map((m) => m.t), ['scene', 'bake']); assert.equal(built, 1); assert.deepEqual(w.posted[1], { t: 'bake', id: w.posted[1].id, scene: 'k1', ...JOBN });
  assert.equal(c.ask('a', JOBN, 'k1', scene, 1), null); assert.equal(w.posted.length, 2, 'a job that is being painted is not asked for again');
  assert.equal(c.ask('b', JOBN, 'k1', scene, 2), null); assert.deepEqual(w.posted.map((m) => m.t), ['scene', 'bake', 'bake']); assert.equal(built, 1, 'and the scene is built and sent once for every job of its set of locked districts');
  reply(w, 0, JOBN.N * JOBN.N * 4);
  const px = c.ask('a', JOBN, 'k1', scene, 3); assert.ok(px instanceof Uint8ClampedArray); assert.equal(px.length, JOBN.N * JOBN.N * 4);
  assert.equal(c.pending, 1, 'the pixels were taken: what is still out is the other job'); assert.equal(c.done.size, 0);
  c.ask('c', JOBN, 'k2', scene, 4); assert.equal(w.posted.filter((m) => m.t === 'scene').map((m) => m.key).join(), 'k1,k2', 'a new set of locked districts sends its own scene');
  c.dispose(); assert.equal(w.terminated, true);
});

test('the client keeps at most so many jobs out and waiting, and drops pixels nobody took', () => {
  const w = fakeWorker(), c = new BaseClient(() => w); c.cap = 3; let n = 0; const ask = (k, now) => c.ask(k, JOBN, 'k', () => ({}), now);
  for (let i = 0; i < 6; i++) ask('j' + i, i); assert.equal(w.posted.filter((m) => m.t === 'bake').length, 3, 'the cap');
  reply(w, 0, 256); reply(w, 1, 256); reply(w, 2, 256); assert.equal(c.pending, 0); assert.equal(c.done.size, 3);
  assert.equal(ask('x', 10), null); assert.equal(w.posted.filter((m) => m.t === 'bake').length, 3, 'results nobody took count against the cap too');
  c.prune(10 + 5000); assert.equal(c.done.size, 0, 'pixels older than a few seconds are of ground the camera has left');
  ask('x', 5011); assert.equal(w.posted.filter((m) => m.t === 'bake').length, 4);
});

test('a worker that errors, answers with an error or goes silent is given up, and the cache paints the base itself again', () => {
  let w = fakeWorker(), c = new BaseClient(() => w); c.ask('a', JOBN, 'k', () => ({}), 0); w.onerror({}); assert.equal(c.live, false); assert.equal(w.terminated, true);
  assert.equal(c.ask('a', JOBN, 'k', () => ({}), 1), null); assert.equal(w.posted.length, 2, 'nothing more is posted to a dead worker');
  w = fakeWorker(); c = new BaseClient(() => w); c.ask('a', JOBN, 'k', () => ({}), 0); w.onmessage({ data: { id: w.posted[1].id, err: 'boom' } }); assert.equal(c.live, false, 'an error from the bake');
  w = fakeWorker(); c = new BaseClient(() => w); c.ask('a', JOBN, 'k', () => ({}), 0); c.ask('b', JOBN, 'k', () => ({}), BASE_TIMEOUT_MS - 1); assert.equal(c.live, true);
  c.ask('c', JOBN, 'k', () => ({}), BASE_TIMEOUT_MS + 1); assert.equal(c.live, false, 'a job that has been out for ' + BASE_TIMEOUT_MS + ' ms: the worker never started (a script that did not load, a page that forbids workers)');
  assert.equal(new BaseClient(() => { throw new Error('no workers here'); }).ask('a', JOBN, 'k', () => ({}), 0), null);
});

// ---------------------------------------------------------------- the cache and the ground layer: the base comes from the worker
const { recCtx } = await import('./helpers/recctx.mjs');
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; this.ctx = recCtx(); } getContext() { return this.ctx.ctx; } };
globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
const { ChunkCache } = await import('../js/world/chunkcache.js');
const { CHUNK_FULL, CHUNK_PX, BLEED, scaleKey, chunkKey } = await import('../js/world/chunks.js');
const { groundCacheMethods } = await import('../js/world/groundcache.js');
const { groundMethods } = await import('../js/world/ground.js');
const { lodOf } = await import('../js/world/lod.js');
const { runLayer, registerLayer } = await import('../js/world/stack.js');

test('the cache asks for a chunk\'s base and makes no chunk until the pixels are there; then it makes it, handing the layers the pixels instead of painting them', () => {
  const surfaces = []; const make = (w, h) => { const f = { c: { width: w, height: h, transferToImageBitmap: () => ({ close() {} }) }, g: recCtx().ctx }; surfaces.push(f); return f; };
  const store = new ChunkCache('test.base', make), asked = []; let ready = null; const seen = [];
  store.base = (job) => { asked.push({ ...job }); return ready; };
  const draw = (g, view, info) => seen.push({ base: info.base, k: info.k, n: info.n });
  assert.equal(store.bake(draw, 1.8, 3, 4, 2), null, 'nothing yet: the chunk is not made, and nothing was drawn'); assert.equal(seen.length, 0); assert.equal(surfaces.length, 0, 'not even a surface was made for it');
  const a = 1.8, J = asked[0]; assert.equal(J.key, chunkKey(scaleKey(a), 3, 4) + '|' + CHUNK_FULL); assert.equal(J.N, CHUNK_FULL); assert.equal(J.S, a); assert.equal(J.ox, (3 * CHUNK_PX - BLEED) / a); assert.equal(J.oy, (4 * CHUNK_PX - BLEED) / a);
  ready = new Uint8ClampedArray(CHUNK_FULL * CHUNK_FULL * 4);
  const c = store.bake(draw, a, 3, 4, 2); assert.ok(c && c.img, 'made'); assert.equal(seen.length, 1); assert.equal(seen[0].base, ready, 'the layers were handed the worker\'s pixels'); assert.equal(store.stats.baked, 1);
  const old = store.bake(draw, a, 3, 4, 2); assert.equal(old, c, 'a chunk that exists is not asked for again'); assert.equal(asked.length, 2);
  store.base = null; store.bake(draw, a, 5, 5, 2); assert.equal(seen.at(-1).base, null, 'without the hook the layers paint the base themselves, as they always did');
  const ss = new ChunkCache('test.base2', make); ss.base = (job) => (asked.push({ ...job }), ready); ss.bake(draw, 1.2, 0, 0, 1); assert.equal(asked.at(-1).N, CHUNK_FULL * 2, 'under density 1.5 a chunk is baked at twice the pixels and drawn down: the worker paints that many'); assert.equal(asked.at(-1).S, 1.2 * 2);
  ss.release(); store.release();
});

test('the V2 shore layer puts the worker\'s pixels into the chunk and paints nothing itself', async () => {
  await import('../js/world/ground.js');
  const main = recCtx(), px = new Uint8ClampedArray(4 * 4 * 4).fill(7);
  const chunk = { base: px, N: 4, S: 1, ox: 0, oy: 0, buf: null, img: null, scene: null }; // (no scene: a bake from it would throw)
  runLayer('shore', { env: {} }, main.ctx, { x0: 0, x1: 4, y0: 0, y1: 4 }, { chunk, zoom: 1, far: false, see: () => true, mode: 1 });
  const put = main.log.calls.find((c) => c[0] === 'putImageData'); assert.ok(put, 'the pixels were put into the chunk'); assert.equal(put[1].data, px); assert.equal(put[1].width, 4); assert.equal(put[1].height, 4); assert.deepEqual(put.slice(2), [0, 0]);
});

// ---------------------------------------------------------------- the ground pass with a worker
const { LAYOUT: LAY } = await import('../js/world/layout.js');
const stubLayers = () => { for (const id of ['shore', 'terrain', 'roads', 'blocks']) registerLayer(id, () => {}, 'inherit', () => 1); registerLayer('livedecals', () => {}, 'inherit'); }; // (the layers draw nothing in these tests: what is under test is what the pass asks for and makes; after the test of the real shore layer)
const world = (cam = { x: -2944, y: 2153, z: 1 }, dpr = 1.5, W = 1440, H = 900) => ({
  ...groundCacheMethods, ...groundMethods,
  cam, dpr, W, H, cv: { width: Math.floor(W * dpr), height: Math.floor(H * dpr) }, unlockHash: 7, unlocked: new Set([1]), gnd: { zoom: 1, far: false, mode: 0, see: null, chunk: null }, gcKey: [NaN, NaN, NaN, 0, 0, 0, 0, 0], gcSeen: 0, gcValid: false,
  env: { t: 0, night: 0, dim: 0, far: false, lite: false, lod: lodOf(cam.z), lights: [] }, reveal: {}, hits: [], decals: new Map(),
  toWorld() {}, toScreen() {}, revealing() { return !!this.reveal.on; }, reduced() { return true; }, fxOf() { return { dim: 0 }; }, bounds() { return LAY.bounds; },
  gcBudget: [1e-6, 1e-6], gcRest: 0,
});
const frame = (w) => { const main = recCtx(); w.env.lod = lodOf(w.cam.z); w.groundPass(main.ctx, { x0: -1e5, x1: 1e5, y0: -1e5, y1: 1e5 }); return main; };
class FakeClient { constructor() { this.live = true; this.asks = []; this.ready = false; this.pruned = 0; this.disposed = false; } ask(key, job, sceneKey, scene, now) { this.asks.push({ key, sceneKey, ...job }); return this.ready ? new Uint8ClampedArray(job.N * job.N * 4) : null; } prune() { this.pruned++; } dispose() { this.disposed = true; this.live = false; } }

test('the real ground layers run over a base a worker painted (the first live build threw in the terrain\'s dressing, which reads the scene, and drew no ground at all)', () => {
  const w = world(), fake = new FakeClient(); fake.ready = true; w.baseWorker = () => fake; w.gcBudget = [1e9, 1e9];
  assert.doesNotThrow(() => frame(w)); assert.doesNotThrow(() => frame(w)); assert.ok(w.gc.size >= 6, 'chunks were made with every layer over them: ' + w.gc.size);
  assert.equal(w.gcValid, true, 'and the ground is whole');
});

test('with a worker the pass asks for the window\'s chunks, nearest the middle first, makes none and is not whole until the pixels come, then makes them (no coarse cover: the exact ones are what is asked for)', () => {
  stubLayers(); const w = world(), fake = new FakeClient(); w.baseWorker = () => fake;
  frame(w); assert.equal(w.gc.size, 0, 'nothing is made without pixels'); assert.equal(w.gcValid, false); assert.equal(w.gcMore, true, 'and the loop is asked for the next frame');
  assert.ok(fake.asks.length >= 6, 'it asked for the window\'s chunks: ' + fake.asks.length);
  const a = w.renderScale(); assert.ok(fake.asks.every((j) => j.S === a), 'all at the frame\'s own scale: no coarse chunk was asked for');
  assert.ok(fake.asks.every((j) => j.maxZ === LAY.maxZ && j.sceneKey === [...LAY.ids].filter((id) => id === 1 ? false : true).join(',')), 'with the island\'s height and the set of locked districts');
  const cx = w.cam.x, cy = w.cam.y, d = fake.asks.slice(0, 6).map((j) => Math.hypot(j.ox + CHUNK_PX / a / 2 - cx, j.oy + CHUNK_PX / a / 2 - cy)); for (let n = 1; n < d.length; n++) assert.ok(d[n] >= d[n - 1] - 400, 'the nearest the middle first: ' + d.map(Math.round));
  assert.ok(fake.pruned >= 1, 'pixels nobody took are dropped each frame');
  fake.ready = true; w.gcBudget = [1e9, 1e9]; frame(w); assert.ok(w.gc.size >= 6, 'made from the pixels: ' + w.gc.size); w.gcBudget = [1e-6, 1e-6]; for (let n = 0; n < 40; n++) frame(w);
  assert.equal(w.gcValid, true, 'whole'); assert.equal(w.gcMore, false);
});

test('the pass makes a worker of its own when the browser has one, gives it up when it cannot be made, never makes one for the shot rig, and lets it go with the ground', () => {
  stubLayers(); const made = []; globalThis.Worker = class { constructor(url, opt) { made.push({ url: String(url), opt }); this.terminated = false; } postMessage() {} terminate() { this.terminated = true; made.at(-1).t = true; } };
  try {
    let w = world(); frame(w); assert.equal(made.length, 1, 'one worker'); assert.ok(made[0].url.endsWith('/js/world/basework.js'), made[0].url); assert.equal(made[0].opt.type, 'module'); frame(w); assert.equal(made.length, 1, 'made once');
    w.releaseGround(); assert.equal(made[0].t, true, 'the worker went with the ground'); assert.equal(w.gcWorker, undefined, 'and a world that is attached again makes another');
    globalThis.window = { __rig: true }; made.length = 0; w = world(); frame(w); assert.equal(made.length, 0, 'the rig paints on the main thread, a whole window at once'); delete globalThis.window;
    globalThis.Worker = class { constructor() { throw new Error('no workers here'); } }; w = world(); w.gcBudget = [1e9, 1e9]; frame(w); frame(w); assert.ok(w.gc.size >= 6, 'a worker that cannot be made: the ground is made as ever (' + w.gc.size + ' chunks)'); assert.equal(w.gcWorker === null || !w.gcWorker.live, true);
  } finally { delete globalThis.Worker; delete globalThis.window; }
});

test('the chunk descriptor of a chunk whose base a worker painted still carries the scene: the layers over the base (the terrain\'s dressing, the roads, the blocks) read it, and the live site stopped drawing its ground on this', async () => {
  const { chunkDescriptor } = await import('../js/world/groundchunks.js');
  const px = new Uint8ClampedArray(8 * 8 * 4), d = chunkDescriptor({ unlocked: new Set([1]) }, { x0: 0, x1: 8, y0: 0, y1: 8 }, { k: 1, n: 8, ss: 1, zoom: 0, base: px });
  assert.equal(d.base, px); assert.equal(d.buf, null, 'no buffer to paint into'); assert.ok(d.scene && d.scene.terr, 'the scene is there'); assert.equal(d.N, 8);
  const own = chunkDescriptor({ unlocked: new Set([1]) }, { x0: 0, x1: 8, y0: 0, y1: 8 }, { k: 1, n: 8, ss: 1, zoom: 0, base: null }); assert.equal(own.base, null); assert.ok(own.buf && own.buf.length === 8 * 8 * 4); assert.ok(own.scene.terr);
});

test('pixels of a scale the camera has left are dropped at once and never hold the cap: after a zoom they were six results nobody would take, and nothing new was asked for until they aged out (four seconds of a half-made ground)', () => {
  const w = fakeWorker(), c = new BaseClient(() => w); c.cap = 3; const ask = (k, sk, now) => c.ask(k, { ...JOBN, sk }, 'k', () => ({}), now);
  for (let i = 0; i < 3; i++) ask('old' + i, 111, i); for (let i = 0; i < 3; i++) reply(w, i, 256);
  assert.equal(c.done.size, 3); assert.equal(ask('new0', 222, 10), null); assert.equal(w.posted.filter((m) => m.t === 'bake').length, 3, 'with the old scale\'s pixels waiting, the cap is full');
  c.prune(11, (sk) => sk === 222); assert.equal(c.done.size, 0, 'the scale is gone: its pixels are too');
  ask('new0', 222, 12); assert.equal(w.posted.filter((m) => m.t === 'bake').length, 4, 'and the new scale is asked for at once');
  reply(w, 3, 256); c.prune(13, (sk) => sk === 222); assert.equal(c.done.size, 1, 'pixels of the scale in view stay until they are taken'); c.prune(13 + 4001, (sk) => sk === 222); assert.equal(c.done.size, 0, 'or for a few seconds');
});

test('a worker that has answered before and then keeps a job out for long (a hidden tab that paused it) loses that job, not the worker; a message that cannot be sent gives the worker up instead of throwing in the frame', () => {
  let w = fakeWorker(), c = new BaseClient(() => w); c.ask('a', JOBN, 'k', () => ({}), 0); reply(w, 0, 256); c.ask('b', JOBN, 'k', () => ({}), 1); c.ask('c', JOBN, 'k', () => ({}), 2);
  assert.equal(c.pending, 2); c.ask('d', JOBN, 'k', () => ({}), BASE_TIMEOUT_MS + 5); assert.equal(c.live, true, 'it answered before: it is alive, a tab that was hidden paused it');
  assert.equal(c.out.has('b'), false, 'the job that waited too long is forgotten (its slot is free again)'); assert.equal(c.out.has('d'), true, 'and the new one was asked for');
  w = fakeWorker(); w.postMessage = () => { throw new Error('DataCloneError'); }; c = new BaseClient(() => w);
  assert.doesNotThrow(() => c.ask('a', JOBN, 'k', () => ({}), 0)); assert.equal(c.live, false); assert.equal(w.terminated, true);
});
