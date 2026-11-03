// The V2 ground's chunk made off the main thread (js/world/basework.js, js/world/baseclient.js, the hook in js/world/chunkcache.js and groundcache.js). A chunk is the per-pixel base (rasterbase.js) with the vector layers
// over it, and the raster of those paths, on a CPU canvas, was 13 to 19 ms of every chunk of a busy district on the thread that draws the frames (scripts/perf-moves.mjs): a worker owns a chunk store and the ground layers
// and makes the whole chunk, and the main thread only stamps its bitmap. What must hold: the worker bakes with the code the main thread bakes with and hands the layers what a World hands them (so the pixels are the same
// ones), the base does not depend on what its buffer held before (the pixels of a chunk are the same whichever thread, whichever chunk was painted before), the protocol is small and fails safe (a worker that errors, has no
// canvas or goes silent is given up and the main thread makes the chunks as it always did), and the cache asks for a chunk without waiting for it.
import test from 'node:test';
import assert from 'node:assert/strict';

const { recCtx } = await import('./helpers/recctx.mjs');
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; this.ctx = recCtx(); } getContext() { return this.ctx.ctx; } };
globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
const { sceneOf } = await import('../js/world/scene.js');
const { LAYOUT } = await import('../js/world/layout.js');
const { bakeBase } = await import('../js/world/rasterbase.js');
const { ChunkCache } = await import('../js/world/chunkcache.js');
const { CHUNK_FULL, CHUNK_PX, BLEED, OVERVIEW_A, scaleKey, chunkKey } = await import('../js/world/chunks.js');
const { groundCacheMethods } = await import('../js/world/groundcache.js');
const { groundMethods } = await import('../js/world/ground.js');
const { lodOf } = await import('../js/world/lod.js');
const { runLayer, registerLayer, slotFor, setFlag } = await import('../js/world/stack.js');
const { ChunkMaker } = await import('../js/world/basework.js');
const { BaseClient, BASE_TIMEOUT_MS, BASE_PER, BASE_KEEP_MS, makeBaseClient } = await import('../js/world/baseclient.js');

const GROUND = ['shore', 'terrain', 'roads', 'blocks'];
const world = (cam = { x: -2944, y: 2153, z: 1 }, dpr = 1.5, W = 1440, H = 900, unlocked = [1]) => ({
  ...groundCacheMethods, ...groundMethods,
  cam, dpr, W, H, cv: { width: Math.floor(W * dpr), height: Math.floor(H * dpr) }, unlockHash: 7, unlocked: new Set(unlocked), gnd: { zoom: 1, far: false, mode: 0, see: null, chunk: null }, gcKey: [NaN, NaN, NaN, 0, 0, 0, 0, 0], gcSeen: 0, gcValid: false,
  env: { t: 0, night: 0, dim: 0, far: false, lite: false, lod: lodOf(cam.z), lights: [] }, reveal: {}, hits: [], decals: new Map(),
  toWorld() {}, toScreen() {}, revealing() { return !!this.reveal.on; }, reduced() { return true; }, fxOf() { return { dim: 0 }; }, bounds() { return LAYOUT.bounds; },
  gcBudget: [1e-6, 1e-6], gcRest: 0,
});
/** A factory of stand-in surfaces that remembers them (and their recorded calls) in `list`. */
const makeIn = (list) => (w, h) => { const f = { c: { width: w, height: h }, g: null }; const r = recCtx(); f.g = r.ctx; f.log = r.log; list.push(f); return f; };
const FNV = (a) => { let h = 2166136261; for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 16777619); return h >>> 0; };
const arg = (x) => (x === null || ['number', 'string', 'boolean', 'undefined'].includes(typeof x) ? x : x.data && x.data.length ? { w: x.width, h: x.height, px: FNV(x.data) } : Array.isArray(x) ? x.map(arg) : 'obj');
/** What a surface was asked to draw, as one string: every call with its arguments (the pixels of an image put into it by their hash), and the style and alpha of every fill. */
const sig = (f) => JSON.stringify([f.log.calls.map((c) => c.map(arg)), f.log.fills]);
/** The bake the main thread makes of chunk (i, j) at scale `a` for the world `w`: the camera's zoom, or the overview's own (groundcache.js overviewStep). */
const mainBake = (w, store, a, i, j, dpr, pin = false) => {
  const draw = (g, v, info) => w.drawGround(g, v, 1, info), keep = w.env.lod; w.env.lod = lodOf(pin ? OVERVIEW_A / Math.max(dpr, 1e-3) : w.cam.z);
  try { return store.bake(draw, a, i, j, dpr, false, pin); } finally { w.env.lod = keep; }
};
const jobOf = (w, a, i, j, dpr, pin = false) => ({ world: 'k', a, i, j, dpr, coarse: false, pin, zoom: w.cam.z });

// ---------------------------------------------------------------- the worker's side: a chunk made as the main thread makes it
test('the base does not depend on what its buffer held before: the pixels of a chunk are the same whichever chunk was painted into the buffer last (the sea pass left the coast\'s partly covered pixels of two overview chunks blended over whatever was there)', () => {
  const sc = sceneOf([2, 3]), N = CHUNK_FULL, a = OVERVIEW_A;
  const paint = (i, j, fill) => { const b = new Uint8ClampedArray(N * N * 4).fill(fill); bakeBase(b, N, N, a, (i * CHUNK_PX - BLEED) / a, (j * CHUNK_PX - BLEED) / a, sc, { maxZ: LAYOUT.maxZ }); return b; };
  const B = LAYOUT.bounds, s = CHUNK_PX / a; let chunks = 0;
  for (let j = Math.floor(B.y0 / s); j <= Math.floor(B.y1 / s); j++) for (let i = Math.floor(B.x0 / s); i <= Math.floor(B.x1 / s); i++) {
    const x = paint(i, j, 0), y = paint(i, j, 77), z = paint(i, j, 255); chunks++;
    let d = 0; for (let q = 0; q < x.length; q++) if (x[q] !== y[q] || x[q] !== z[q]) d++;
    assert.equal(d, 0, `overview chunk (${i}, ${j}): ${d} values depend on the buffer's old contents`);
  }
  assert.ok(chunks >= 4, 'the whole island: ' + chunks);
  const a2 = 1.8, x = new Uint8ClampedArray(N * N * 4).fill(3), y = new Uint8ClampedArray(N * N * 4).fill(200); // an exact chunk of the coast
  for (const b of [x, y]) bakeBase(b, N, N, a2, (-2 * CHUNK_PX - BLEED) / a2, (1 * CHUNK_PX - BLEED) / a2, sc, { maxZ: LAYOUT.maxZ });
  assert.deepEqual([...x.slice(0, 4000)], [...y.slice(0, 4000)]); assert.equal(FNV(x), FNV(y));
});

test('the worker\'s maker hands the ground layers what a World hands them: the districts that are open, the zoom a chunk stands for and its level of detail, the descriptor and the surface', () => {
  const real = GROUND.map((id) => [id, slotFor(id).draw]);
  try {
    for (const [unlocked, zoom, dpr, a, i, j, pin] of [[[1], 0.9, 2, 1.8, 3, 4, false], [[1, 2, 5], 1.6, 1, 1.6, -1, 2, false], [[1], 0.9, 2, OVERVIEW_A, -1, 0, true], [[2], 0.45, 1.5, 0.675, 0, 1, false]]) {
      const log = (tag) => (ctx, view, env, w, an) => seen.push(JSON.stringify([tag.id, env.lod.detail, [...w.unlocked], an.zoom, an.far, an.chunk && [an.chunk.S, an.chunk.ox, an.chunk.oy, an.chunk.N, an.chunk.bleed, !!an.chunk.buf, !!an.chunk.scene], view]));
      let seen = [], tag = { id: '' };
      for (const id of GROUND) registerLayer(id, (...x) => log({ id })(...x), 'inherit', () => 1);
      const w = world({ x: 0, y: 0, z: zoom }, dpr, 1440, 900, unlocked), main = []; const store = new ChunkCache('t.main', makeIn(main)); store.opaque = true;
      mainBake(w, store, a, i, j, dpr, pin); const want = seen; seen = [];
      const maker = new ChunkMaker(makeIn([])); maker.world('k', unlocked); maker.chunk(jobOf(w, a, i, j, dpr, pin));
      assert.equal(want.length, 4, 'the four layers ran'); assert.deepEqual(seen, want, `zoom ${zoom} at density ${dpr}${pin ? ' (the overview)' : ''}: the layers saw other things than the main thread's give them`);
    }
  } finally { for (const [id, draw] of real) registerLayer(id, draw, 'inherit', () => 1); }
});

test('the worker draws the very pictures the main thread draws: every call the real ground layers make into the chunk, and the pixels of its base, for an exact chunk, a supersampled one and the overview', () => {
  for (const [unlocked, zoom, dpr, a, i, j, pin] of [[[1], 1, 2, 2, -2, 1, false], [[1, 2], 1, 1, 1, -1, 2, false], [[1], 1, 2, OVERVIEW_A, -1, 0, true]]) {
    const w = world({ x: 0, y: 0, z: zoom }, dpr, 1440, 900, unlocked), main = [], work = [];
    const store = new ChunkCache('t.main', makeIn(main)); store.opaque = true; mainBake(w, store, a, i, j, dpr, pin);
    const maker = new ChunkMaker(makeIn(work)); maker.world('k', unlocked); maker.chunk(jobOf(w, a, i, j, dpr, pin));
    assert.equal(work.length, main.length, 'the same surfaces'); assert.ok(main.length >= 2);
    main.forEach((f, n) => assert.equal(sig(work[n]), sig(f), `surface ${n} of the chunk at ${a}, density ${dpr}`));
    assert.ok(main.some((f) => f.log.calls.length > 40), 'and it drew something: the comparison means something');
    assert.ok(main.some((f) => f.log.calls.some((c) => c[0] === 'putImageData' && c[1].width >= CHUNK_FULL)), 'the base was put into the chunk');
  }
});

test('the maker keeps no chunk (its bitmap leaves with the message), answers an error for a world it was not told of or a surface it cannot make, and keeps the last two worlds', () => {
  const made = [], maker = new ChunkMaker(makeIn(made)); const w = world(); maker.world('a', [1]);
  assert.throws(() => maker.chunk(jobOf(w, 1.8, 3, 4, 2)), /no world k/);
  maker.world('k', [1]); const img = maker.chunk(jobOf(w, 1.8, 3, 4, 2)); assert.ok(img, 'a bitmap (here the stand-in canvas of the cell)');
  assert.equal(maker.store.size, 0); assert.equal(maker.store.ov.size, 0, 'no chunk kept, nor its bytes'); assert.equal(maker.store.bytes, 0);
  const ov = maker.chunk(jobOf(w, OVERVIEW_A, -1, 0, 2, true)); assert.ok(ov); assert.equal(maker.store.ov.size, 0);
  maker.world('b', null); maker.world('c', [1, 2]); assert.deepEqual([...maker.worlds.keys()], ['b', 'c']); assert.equal(maker.worlds.get('b'), null, 'a world that does not know its districts has every one open');
  assert.throws(() => maker.chunk(jobOf(w, 1.8, 3, 4, 2)), /no world k/);
  const none = new ChunkMaker(() => null); none.world('k', [1]); assert.throws(() => none.chunk(jobOf(w, 1.8, 3, 4, 2)), /no surface/);
});

// ---------------------------------------------------------------- the client: the main thread's side of the protocol
const fakeWorker = () => { const w = { posted: [], terminated: false, onmessage: null, onerror: null, postMessage(m) { w.posted.push(m); }, terminate() { w.terminated = true; }, say(m) { w.onmessage({ data: m }); } }; return w; };
const bitmap = () => ({ closed: false, close() { this.closed = true; } });
const pool = (n = 1, up = true) => { const ws = [], c = new BaseClient(() => { const w = fakeWorker(); ws.push(w); return w; }, n); const go = () => ws.forEach((w) => w.say({ t: 'hello', ok: true })); if (up) { c.ask('start', JOB, 'k', null, 0); go(); } return { c, ws, go }; };
const JOB = { sk: 111, a: 1.8, i: 3, j: 4, dpr: 2, coarse: false, pin: false, zoom: 0.9 };
const chunks = (w) => w.posted.filter((m) => m.t === 'chunk');
const reply = (w, k, bmp = bitmap()) => { w.say({ id: chunks(w)[k].id, bmp }); return bmp; };

test('the client gives a worker that is still loading nothing, sends the world once and a chunk once, answers nothing while the worker makes it and hands the bitmap over once', () => {
  const { c, ws, go } = pool(1, false); assert.equal(c.ask('a', JOB, 'k1', [1, 2], 0), null); assert.equal(ws.length, 1, 'made on the first ask'); assert.deepEqual(ws[0].posted, [], 'nothing posted while it loads');
  go(); assert.equal(c.ask('a', JOB, 'k1', [1, 2], 1), null);
  assert.deepEqual(ws[0].posted.map((m) => m.t), ['world', 'chunk']); assert.deepEqual(ws[0].posted[0], { t: 'world', key: 'k1', unlocked: [1, 2] });
  assert.deepEqual(ws[0].posted[1], { t: 'chunk', id: ws[0].posted[1].id, world: 'k1', a: 1.8, i: 3, j: 4, dpr: 2, coarse: false, pin: false, zoom: 0.9 });
  assert.equal(c.ask('a', JOB, 'k1', [1, 2], 2), null); assert.equal(ws[0].posted.length, 2, 'a chunk that is being made is not asked for again');
  c.ask('b', JOB, 'k1', [1, 2], 3); assert.deepEqual(ws[0].posted.map((m) => m.t), ['world', 'chunk', 'chunk'], 'and the world is sent once for every chunk of it');
  const bmp = reply(ws[0], 0); assert.equal(c.ask('a', JOB, 'k1', [1, 2], 4), bmp); assert.equal(c.pending, 1, 'taken: what is still out is the other chunk'); assert.equal(c.done.size, 0); assert.equal(bmp.closed, false);
  c.ask('c', JOB, 'k2', null, 5); assert.deepEqual(ws[0].posted.filter((m) => m.t === 'world').map((m) => m.key), ['k1', 'k2'], 'a new set of open districts sends its own world'); assert.equal(ws[0].posted.at(-2).unlocked, null);
  c.fail(); assert.equal(ws[0].terminated, true);
});

test('a pool gives each chunk to the worker with the most room, no worker more than BASE_PER chunks, and the client no more than its cap out and waiting', () => {
  const { c, ws } = pool(3); const ask = (k, now = 1) => c.ask(k, JOB, 'k', [1], now);
  for (let n = 0; n < 9; n++) ask('j' + n);
  assert.deepEqual(ws.map((w) => chunks(w).length), [BASE_PER, BASE_PER, BASE_PER], 'two each, and no seventh: every worker is busy with a chunk and has another waiting');
  assert.ok(ws.every((w) => w.posted.filter((m) => m.t === 'world').length === 1), 'each worker is told the world once');
  reply(ws[1], 0); ask('j9'); assert.equal(chunks(ws[1]).length, 3, 'the worker that finished one is given the next'); assert.equal(chunks(ws[0]).length, 2);
  const b = new BaseClient(() => fakeWorker(), 1); b.cap = 2; b.ask('s', JOB, 'k', [1], 0); b.ws[0].say({ t: 'hello', ok: true }); const w = b.ws[0];
  b.ask('x', JOB, 'k', [1], 1); reply(w, 0); b.ask('y', JOB, 'k', [1], 2); b.ask('z', JOB, 'k', [1], 3); assert.equal(chunks(w).length, 2, 'a bitmap nobody took counts against the cap too'); assert.equal(b.done.size, 1);
});

test('bitmaps nobody took are closed and dropped: after some seconds, and at once when the scale is one the camera has left (after a zoom they were six results nobody would take, and nothing new was asked for)', () => {
  const { c, ws } = pool(1); c.cap = 3; const ask = (k, sk, now) => c.ask(k, { ...JOB, sk }, 'k', [1], now), w = ws[0];
  for (let i = 0; i < 3; i++) ask('old' + i, 111, i + 1); const olds = [0, 1].map((k) => reply(w, k)); const third = reply(w, 2);
  assert.equal(c.done.size, 3); assert.equal(ask('new0', 222, 10), null); assert.equal(chunks(w).length, 3, 'with the old scale\'s bitmaps waiting, the cap is full');
  c.prune(11, (sk) => sk === 222); assert.equal(c.done.size, 0, 'the scale is gone: its bitmaps are too'); assert.ok([...olds, third].every((b) => b.closed), 'and closed: a bitmap is memory of the GPU\'s side too');
  ask('new0', 222, 12); assert.equal(chunks(w).length, 4, 'the new scale is asked for at once');
  const keep = reply(w, 3); c.prune(13, (sk) => sk === 222); assert.equal(c.done.size, 1, 'a bitmap of the scale in view stays until it is taken'); assert.equal(keep.closed, false);
  c.prune(13 + BASE_KEEP_MS + 1, (sk) => sk === 222); assert.equal(c.done.size, 0, 'or for a few seconds'); assert.equal(keep.closed, true);
});

test('a worker that errors, answers with an error, has no canvas or goes silent is given up (and its bitmaps closed), and the cache makes the chunks itself again', () => {
  let { c, ws } = pool(2); ws[1].onerror({}); assert.equal(c.live, false); assert.ok(ws.every((w) => w.terminated), 'every worker of the pool goes'); assert.equal(c.ask('a', JOB, 'k', [1], 1), null); assert.equal(ws[0].posted.length, 1, 'nothing more is posted to a dead client');
  ({ c, ws } = pool(1)); c.ask('a', JOB, 'k', [1], 1); ws[0].say({ id: chunks(ws[0])[0].id, err: 'boom' }); assert.equal(c.live, false, 'an error from the bake');
  ({ c, ws } = pool(1, false)); c.ask('a', JOB, 'k', [1], 0); ws[0].say({ t: 'hello', ok: false }); assert.equal(c.live, false, 'a worker that cannot make a canvas');
  ({ c, ws } = pool(1, false)); c.ask('a', JOB, 'k', [1], 0); c.ask('b', JOB, 'k', [1], BASE_TIMEOUT_MS - 1); assert.equal(c.live, true); c.ask('c', JOB, 'k', [1], BASE_TIMEOUT_MS + 1); assert.equal(c.live, false, 'a script that never loaded (a path that does not resolve, a page that forbids workers)');
  ({ c, ws } = pool(1)); c.ask('a', JOB, 'k', [1], 1); c.ask('b', JOB, 'k', [1], BASE_TIMEOUT_MS + 2); assert.equal(c.live, false, 'a chunk that has been out for ' + BASE_TIMEOUT_MS + ' ms and nothing ever answered');
  assert.equal(new BaseClient(() => { throw new Error('no workers here'); }).ask('a', JOB, 'k', [1], 0), null);
  ({ c, ws } = pool(1)); c.ask('a', JOB, 'k', [1], 1); const b = reply(ws[0], 0); c.fail(); assert.equal(b.closed, true, 'a bitmap waiting to be taken is closed with the client');
});

test('a worker that has answered before and then keeps a chunk out for long (a hidden tab paused it) loses that chunk, not the client, and a late answer is closed; a message that cannot be sent gives the client up instead of throwing in the frame', () => {
  let { c, ws } = pool(1); const w = ws[0]; c.ask('a', JOB, 'k', [1], 1); reply(w, 0); c.ask('b', JOB, 'k', [1], 2); c.ask('c', JOB, 'k', [1], 3);
  assert.equal(c.pending, 2); c.ask('d', JOB, 'k', [1], BASE_TIMEOUT_MS + 5); assert.equal(c.live, true, 'it answered before: it is alive, a tab that was hidden paused it');
  assert.equal(c.out.has('b'), false, 'the chunk that waited too long is forgotten (its place is free again)'); assert.equal(c.out.has('d'), true, 'and the new one was asked for');
  const late = bitmap(); w.say({ id: chunks(w)[1].id, bmp: late }); assert.equal(late.closed, true); assert.equal(c.done.size, 1, 'only the chunk of `a` waits (taken or not)');
  ({ c, ws } = pool(1, false)); ws.length = 0; const bad = fakeWorker(); bad.postMessage = () => { throw new Error('DataCloneError'); }; c.spawn = () => bad; c.ask('a', JOB, 'k', [1], 0); bad.say({ t: 'hello', ok: true });
  assert.doesNotThrow(() => c.ask('a', JOB, 'k', [1], 1)); assert.equal(c.live, false); assert.equal(bad.terminated, true);
});

test('workers are made where there are some and cores to run them on: a pool of at most three, none on one core, none without Worker', () => {
  const made = []; const was = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const nav = (n) => Object.defineProperty(globalThis, 'navigator', { value: { hardwareConcurrency: n }, configurable: true });
  try {
    delete globalThis.Worker; assert.equal(makeBaseClient(), null, 'no Worker');
    globalThis.Worker = class { constructor(url, opt) { made.push({ url: String(url), opt }); } postMessage() {} terminate() {} };
    nav(1); assert.equal(makeBaseClient(), null, 'one core: the worker would only compete with the frames');
    nav(2); let c = makeBaseClient(); assert.equal(c.size, 1); nav(4); c = makeBaseClient(); assert.equal(c.size, 3); nav(16); c = makeBaseClient(); assert.equal(c.size, 3);
    c.start(); assert.equal(made.length, 3); assert.ok(made.every((m) => m.url.endsWith('/js/world/basework.js') && m.opt.type === 'module'), JSON.stringify(made[0]));
  } finally { delete globalThis.Worker; if (was) Object.defineProperty(globalThis, 'navigator', was); else delete globalThis.navigator; }
});

// ---------------------------------------------------------------- the cache: a chunk comes from the workers
test('the cache asks for a chunk and makes none (nor a surface for it) until its bitmap is there; then it keeps the bitmap as the chunk, drawing nothing; a stale chunk stays on show until its replacement is back', () => {
  const surfaces = [], store = new ChunkCache('test.whole', makeIn(surfaces)), asked = []; let ready = null; const drawn = [];
  store.whole = (job) => { asked.push({ ...job }); return ready; }; const draw = (g, view, info) => drawn.push(info);
  const a = 1.8; assert.equal(store.bake(draw, a, 3, 4, 2), null, 'nothing yet: no chunk, and nothing drawn'); assert.equal(drawn.length, 0); assert.equal(surfaces.length, 0, 'not even a surface was made for it');
  const J = asked[0]; assert.equal(J.key, chunkKey(scaleKey(a), 3, 4) + '|2'); assert.deepEqual([J.sk, J.a, J.i, J.j, J.dpr, J.coarse, J.pin], [scaleKey(a), a, 3, 4, 2, false, false]);
  ready = bitmap(); const c = store.bake(draw, a, 3, 4, 2); assert.ok(c); assert.equal(c.img, ready, 'the worker\'s bitmap is the chunk'); assert.equal(drawn.length, 0); assert.equal(surfaces.length, 0); assert.equal(c.empty, false);
  assert.equal(c.bytes, CHUNK_PX * CHUNK_PX * 4); assert.equal(store.stats.baked, 1); assert.equal(store.size, 1); assert.equal(store.bytes, c.bytes, 'the ledger knows it');
  assert.equal(store.bake(draw, a, 3, 4, 2), c, 'a chunk that exists is not asked for again'); assert.equal(asked.length, 2);
  store.bake(draw, OVERVIEW_A, -1, 0, 2, false, true); assert.ok(asked.at(-1).key.endsWith('|2o') && asked.at(-1).pin === true && store.ov.size === 1, 'the overview has a store of its own and a key of its own');
  store.bake(draw, 0.9, 0, 0, 1, true); assert.ok(asked.at(-1).key.endsWith('|1c') && asked.at(-1).coarse === true);
  store.markStale(99); ready = null; assert.equal(store.bake(draw, a, 3, 4, 2), null, 'a stale chunk is not replaced before its bitmap is back'); assert.equal(store.get(scaleKey(a), 3, 4), c, 'and is still there to be stamped');
  const next = bitmap(); ready = next; const c2 = store.bake(draw, a, 3, 4, 2); assert.equal(c2.img, next); assert.equal(store.size, 2); assert.equal(c.img.closed, true, 'the stale one\'s bitmap is let go');
  store.whole = null; assert.ok(store.bake(draw, a, 5, 5, 2), 'without the hook the chunk is drawn here, as it always was'); assert.equal(drawn.length, 1); store.release();
});

// ---------------------------------------------------------------- the ground pass with workers
class FakeClient { constructor() { this.live = true; this.asks = []; this.ready = false; this.pruned = 0; } ask(key, job, wk, unlocked, now) { this.asks.push({ key, wk, unlocked, ...job }); return this.ready ? bitmap() : null; } prune() { this.pruned++; } fail() { this.live = false; } }
const stubLayers = () => { for (const id of GROUND) registerLayer(id, () => {}, 'inherit', () => 1); registerLayer('livedecals', () => {}, 'inherit'); }; // (the layers draw nothing in these tests: what is under test is which chunks are asked for and made)
const frame = (w) => { const main = recCtx(); w.env.lod = lodOf(w.cam.z); w.groundPass(main.ctx, { x0: -1e5, x1: 1e5, y0: -1e5, y1: 1e5 }); return main; };

test('with workers the pass asks for the window\'s chunks, nearest the middle first, makes none and is not whole until the bitmaps come, then makes them (no coarse cover: the exact ones are what is asked for)', () => {
  stubLayers(); const w = world(), fake = new FakeClient(); w.baseWorker = () => fake;
  frame(w); assert.equal(w.gc.size, 0, 'nothing is made without bitmaps'); assert.equal(w.gcValid, false); assert.equal(w.gcMore, true, 'and the loop is asked for the next frame');
  assert.ok(fake.asks.length >= 6, 'it asked for the window\'s chunks: ' + fake.asks.length);
  const a = w.renderScale(); assert.ok(fake.asks.every((j) => j.a === a || j.pin), 'all at the frame\'s own scale: no coarse chunk was asked for'); assert.ok(fake.asks.every((j) => j.zoom === w.cam.z && j.dpr === w.dpr), 'for the camera\'s zoom and density');
  assert.ok(fake.asks.every((j) => j.wk === '1' && j.unlocked.join() === '1'), 'and the districts that are open'); assert.ok(w.gc.whole && w.gc.opaque, 'the cache takes the chunks whole, and knows they are opaque');
  const cx = w.cam.x, cy = w.cam.y, d = fake.asks.slice(0, 6).map((j) => Math.hypot((j.i + 0.5) * CHUNK_PX / a - cx, (j.j + 0.5) * CHUNK_PX / a - cy)); for (let n = 1; n < d.length; n++) assert.ok(d[n] >= d[n - 1] - 400, 'the nearest the middle first: ' + d.map(Math.round));
  assert.ok(fake.pruned >= 1, 'bitmaps nobody took are dropped each frame');
  fake.ready = true; w.gcBudget = [1e9, 1e9]; frame(w); assert.ok(w.gc.size >= 6, 'made from the bitmaps: ' + w.gc.size); w.gcBudget = [1e-6, 1e-6]; for (let n = 0; n < 40; n++) frame(w);
  assert.equal(w.gcValid, true, 'whole'); assert.equal(w.gcMore, false);
  const un = new Set([1, 2]); w.unlocked = un; w.unlockHash = 8; fake.asks.length = 0; fake.ready = false; frame(w); assert.ok(fake.asks.length > 0 && fake.asks.every((j) => j.wk === '1,2' && j.unlocked.join() === '1,2'), 'a district that opens is a new world for the workers'); assert.ok(w.gc.size >= 6, 'and the chunks of the old state stay on show, stale, until their replacements come');
});

test('the real ground layers run over chunks the workers made, and the pass asks for the districts as they are, not as they were', () => {
  const w = world(), fake = new FakeClient(); fake.ready = true; w.baseWorker = () => fake; w.gcBudget = [1e9, 1e9];
  for (const [id, draw] of [['shore', slotFor('shore').draw]]) assert.equal(typeof draw, 'function', id);
  assert.doesNotThrow(() => frame(w)); assert.doesNotThrow(() => frame(w)); assert.ok(w.gc.size >= 6, 'chunks were made: ' + w.gc.size); assert.equal(w.gcValid, true, 'and the ground is whole');
});

test('the pass makes workers of its own when the browser has them, gives them up when they cannot be made, never makes any for the shot rig or for a layer flagged back to legacy, and lets them go with the ground', () => {
  stubLayers(); const made = []; globalThis.Worker = class { constructor(url, opt) { made.push({ url: String(url), opt, t: false }); this.i = made.length - 1; } postMessage() {} terminate() { made[this.i].t = true; } };
  try {
    let w = world(); frame(w); const n = made.length; assert.ok(n >= 1 && n <= 3 && w.gcWorker.size === n, 'a pool: ' + n); assert.ok(made.every((m) => m.url.endsWith('/js/world/basework.js') && m.opt.type === 'module')); frame(w); assert.equal(made.length, n, 'made once');
    w.releaseGround(); assert.ok(made.every((m) => m.t), 'the workers went with the ground'); assert.equal(w.gcWorker, undefined, 'and a world that is attached again makes more');
    globalThis.window = { __rig: true }; made.length = 0; w = world(); frame(w); assert.equal(made.length, 0, 'the rig makes its chunks on the main thread, a whole window at once'); delete globalThis.window;
    setFlag('roads', 'legacy'); try { made.length = 0; w = world(); w.gcBudget = [1e9, 1e9]; frame(w); assert.equal(made.length, 0, 'the workers draw the V2 layers: with one flagged back, the main thread draws the ground'); } finally { setFlag('roads', 'v2'); }
    globalThis.Worker = class { constructor() { throw new Error('no workers here'); } }; w = world(); w.gcBudget = [1e9, 1e9]; frame(w); frame(w); assert.ok(w.gc.size >= 6, 'workers that cannot be made: the ground is made as ever (' + w.gc.size + ' chunks)');
  } finally { delete globalThis.Worker; delete globalThis.window; setFlag('roads', 'v2'); }
});

test('the chunk descriptor always has a buffer to paint the base into and carries the scene: the layers over the base read it (the live site once stopped drawing its ground on this)', async () => {
  const { chunkDescriptor } = await import('../js/world/groundchunks.js');
  const d = chunkDescriptor({ unlocked: new Set([1]) }, { x0: 0, x1: 8, y0: 0, y1: 8 }, { k: 1, n: 8, ss: 1, zoom: 0 });
  assert.ok(d.buf && d.buf.length === 8 * 8 * 4); assert.ok(d.img && d.img.width === 8); assert.ok(d.scene && d.scene.terr, 'the scene is there'); assert.equal(d.N, 8); assert.equal(d.base, undefined, 'the base is painted by the layer, here or in a worker');
});
