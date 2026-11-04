// The ground is made on the CPU (js/world/gfx.js `surface`, js/world/groundart.js `grainPattern`). A canvas the GPU holds, drawn into a CPU canvas or used as a pattern on one, is a SYNCHRONOUS GPU readback that
// waits for the whole GPU queue: 0.7 ms on an idle GPU, 37 to 53 ms behind a busy one. The chunk workers made one per chunk that held a district block (the ground's grain tile was a GPU canvas), 268 readbacks in 36 seconds
// of a recording of the night replay, and each one stalled the GPU process's main thread and with it the page's frames (the lag in a zoom out and the long wait for a sharp ground after it; docs/ARCHITECTURE.md, "The world").
// A measurement cannot be a test, so what holds here is the cause: in a worker every surface is asked for as a CPU one, the grain tile is a CPU tile wherever it is made, and nothing a chunk worker loads makes a canvas
// of its own (it would not be a CPU one).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recCtx } from './helpers/recctx.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const made = [], tiles = []; // every canvas asked for (its size and the options it was asked for with), and every image-data tile made for a pattern (the ground's grain)
globalThis.ImageData = class ImageData {};
globalThis.OffscreenCanvas = class OffscreenCanvas {
  constructor(w, h) { this.width = w; this.height = h; }
  getContext(kind, opts) {
    made.push({ w: this.width, h: this.height, kind, opts }); const r = recCtx();
    return new Proxy(r.ctx, { get: (t, k) => (k === 'createImageData' ? (w, h) => { tiles.push({ w, h, opts }); return { data: new Uint8ClampedArray(w * h * 4) }; } : t[k]) });
  }
};
const { surface, inWorker } = await import('../js/world/gfx.js');
const { runLayer } = await import('../js/world/stack.js');
const { DIST } = await import('../js/world/layout.js');
const { lodOf } = await import('../js/world/lod.js');
await import('../js/world/groundart.js'); // registers the V2 ground layers
const { enableAtlas } = await import('../js/world/atlas.js'); enableAtlas(false); // (the plants of a block are drawn directly: this test is about the grain, not the atlas)

test('on the page a surface is made with the options the caller gave (the browser chooses where it lives); in a worker it is always a CPU canvas, whatever else was asked for', () => {
  assert.equal(inWorker(), false, 'the tests run on a page');
  made.length = 0; surface(8, 8); surface(8, 8, { alpha: false }); surface(8, 8, { willReadFrequently: true });
  assert.deepEqual(made.map((m) => m.opts), [undefined, { alpha: false }, { willReadFrequently: true }], 'on the page: nothing is added');
  const had = { W: globalThis.WorkerGlobalScope, S: globalThis.self };
  globalThis.WorkerGlobalScope = class WorkerGlobalScope {}; globalThis.self = new globalThis.WorkerGlobalScope();
  try {
    assert.equal(inWorker(), true);
    made.length = 0; surface(8, 8); surface(8, 8, { alpha: false }); surface(8, 8, { willReadFrequently: false });
    assert.deepEqual(made.map((m) => m.opts), [{ willReadFrequently: true }, { willReadFrequently: true, alpha: false }, { willReadFrequently: false }], 'in a worker: CPU, and the caller\'s own word on it is kept');
  } finally {
    if (had.W === undefined) delete globalThis.WorkerGlobalScope; else globalThis.WorkerGlobalScope = had.W;
    if (had.S === undefined) delete globalThis.self; else globalThis.self = had.S;
  }
  assert.equal(inWorker(), false, 'and the page is a page again');
});

test('the ground\'s grain tile (the weathering laid over every district\'s block) is a CPU canvas, made once, wherever it is made: a GPU one is read back for every chunk that holds a block', () => {
  made.length = 0; tiles.length = 0;
  const D1 = DIST[1], view = { x0: (D1.ox - D1.oy - 6) * 32, x1: (D1.ox + 22 - D1.oy + 6) * 32, y0: (D1.ox + D1.oy) * 16 - 400, y1: (D1.ox + D1.oy + 40) * 16 + 200 };
  const w = { unlocked: new Set([1]), env: { lod: lodOf(1), t: 0 }, cam: { z: 1 }, toWorld() {}, toScreen() {} };
  for (let n = 0; n < 2; n++) { const r = recCtx(); runLayer('blocks', w, r.ctx, view, { zoom: 1, far: false, mode: 1, see: () => true }); }
  assert.equal(tiles.length, 1, `one grain tile, made once (${tiles.length} tiles of image data, ${made.length} canvases)`);
  assert.deepEqual([tiles[0].w, tiles[0].h], [256, 256]);
  assert.equal(tiles[0].opts && tiles[0].opts.willReadFrequently, true, 'a CPU tile: willReadFrequently');
});

test('nothing the chunk worker loads makes a canvas of its own: they all go through gfx.js surface(), which makes them CPU canvases in a worker (a canvas made by hand would be a GPU one)', () => {
  const seen = new Set(), todo = ['js/world/basework.js'];
  while (todo.length) {
    const f = todo.pop(); if (seen.has(f)) continue; seen.add(f); const src = readFileSync(join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/(?:^|[;\n])\s*(?:import|export)\s*(?:[^;'"]*?\sfrom\s*)?['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) todo.push(join(dirname(f), m[1] || m[2]).replace(/\\/g, '/'));
  }
  assert.ok(seen.size >= 30 && seen.has('js/world/groundart.js') && seen.has('js/world/shadow.js') && seen.has('js/world/chunkcache.js'), `the worker\'s graph: ${seen.size} modules`);
  const own = [...seen].filter((f) => f !== 'js/world/gfx.js' && /new OffscreenCanvas|document\.createElement\(\s*['"]canvas|new HTMLCanvasElement/.test(readFileSync(join(ROOT, f), 'utf8')));
  assert.deepEqual(own, [], 'these make a canvas by hand: use surface() from gfx.js');
  assert.match(readFileSync(join(ROOT, 'js/world/groundart.js'), 'utf8'), /surface\(256, 256, \{ willReadFrequently: true \}\)/, 'and the grain tile asks for a CPU canvas itself, since the main thread makes chunks too when it has no workers');
});
