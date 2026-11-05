// What the ground's vector layers (`roads` and `blocks`) cost to bake into one chunk, by class of chunk, in headless Chrome: the number a pull request that changes the road surface, the stage or the pads reports before and after (the world
// pass, docs/RENDER_PLAN.md section 17). The base (the per-pixel sea, cliffs and land) and the terrain are the same before and after such a change, so they are left out; a layer is drawn with no chunk, so the plants, which need the base's scene, are skipped.
//   node scripts/diag/layerbake.mjs [--repo DIR] [--json FILE] [--reps 15] [--zoom 0.6] [--dpr 1.5] [--cdp 9581]
//   --repo DIR   the checkout that is measured (default: this one; a worktree of the commit before gives the "before": run the two in turn, under `nice -n 10`, and compare)
// Method: the page serves DIR, one headless Chrome (software raster, scripts/diag/lib.mjs: the world's own CPU surfaces); the layers are called through `runLayer` on a chunk-sized surface at the transform ChunkCache.bake sets, for the chunk that holds
// each place below (a place of today's island: sea, meadow, a plain road, the three forks, a block, two ports, a farm pad, a harbor pad); the page's clock is coarse (0.1 ms), so a measurement is a batch of 25 draws, each read back, and the median of `--reps`
// batches is the answer. Also the number of fills and of canvas calls the two layers make there. Chrome is ended by PID at the end.
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; }, HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(arg('repo', join(HERE, '..', '..'))), OUT = arg('json', null);
const REPS = +arg('reps', 9), ZOOM = +arg('zoom', 0.6), DPR = +arg('dpr', 1.5);
process.env.DIAG_CDP = String(arg('cdp', 9581));
const { handler } = await import(pathToFileURL(join(REPO, 'server/static.mjs')).href);
const server = createServer(handler); await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
process.env.DIAG_BASE = `http://127.0.0.1:${server.address().port}`;
const { boot } = await import(pathToFileURL(join(HERE, 'lib.mjs')).href); // (lib.mjs reads DIAG_BASE and DIAG_CDP when it loads)
const app = await boot({ dsf: 2, gpu: false, days: 0 }); const { p } = app;
try {
  const res = await p.eval(`(async () => {
    const [S, L, LOD, CH, GFX] = await Promise.all([import('/js/world/stack.js'), import('/js/world/layout.js'), import('/js/world/lod.js'), import('/js/world/chunks.js'), import('/js/world/gfx.js')]);
    await import('/js/world/groundart.js');
    const dpr = ${DPR}, zoom = ${ZOOM}, a = Math.round(zoom * dpr * 1e5) / 1e5, ss = CH.superSample(dpr), N = CH.CHUNK_FULL * ss, k = a * ss;
    const px = (gx, gy) => (gx - gy) * 32, py = (gx, gy, z) => (gx + gy) * 16 - z;
    const f = GFX.surface(N, N, { willReadFrequently: true }); const g = f.g;
    const w = { unlocked: new Set(L.LAYOUT.ids), env: { lod: LOD.lodOf(zoom), t: 0, far: false, lite: false, lights: [] }, cam: { z: zoom }, toWorld() {}, toScreen() {} };
    const places = {
      'sea (no roads, no blocks)': [190, 30, 0],
      'meadow': [120, 72, 40],
      'plain road': [30, 52, 82],
      'fork j4 (Pawn)': [72, 94, 16],
      'fork j8 (Harbor)': [156, 52, 20],
      'fork j12 (T north of 12)': [18, 70, 54],
      'block (centre of 5)': [126, 100, 24],
      'port with apron (13.E)': [61, 22, 84],
      'port with apron (4.E, a fork)': [67, 94, 15],
      'farm pad with a road (11 west)': [28, 70, 49],
      'harbor pad band (8 west)': [157, 52, 18],
    };
    const out = {};
    for (const [name, [gx, gy, z]] of Object.entries(places)) {
      const wx = px(gx, gy), wy = py(gx, gy, z), i = Math.floor(wx * a / CH.CHUNK_PX), j = Math.floor(wy * a / CH.CHUNK_PX);
      const view = { x0: (i * CH.CHUNK_PX - CH.BLEED) / a, x1: ((i + 1) * CH.CHUNK_PX + CH.BLEED) / a, y0: (j * CH.CHUNK_PX - CH.BLEED) / a, y1: ((j + 1) * CH.CHUNK_PX + CH.BLEED) / a };
      const G = { zoom, far: false, see: (x0, y0, x1, y1) => x1 > view.x0 && x0 < view.x1 && y1 > view.y0 && y0 < view.y1, mode: 1, chunk: null };
      const time = (id) => { // the timer of a page is coarse (0.1 ms): time batches of 25 draws, each with its readback, and take the median batch
        const one = () => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, N, N); g.setTransform(k, 0, 0, k, -(i * CH.CHUNK_PX - CH.BLEED) * ss, -(j * CH.CHUNK_PX - CH.BLEED) * ss); S.runLayer(id, w, g, view, G); g.setTransform(1, 0, 0, 1, 0, 0); g.getImageData(0, 0, 1, 1); };
        for (let r = 0; r < 15; r++) one();
        const t = []; for (let b = 0; b < ${REPS}; b++) { const t0 = performance.now(); for (let r = 0; r < 25; r++) one(); t.push((performance.now() - t0) / 25); }
        t.sort((x, y) => x - y); return +t[t.length >> 1].toFixed(3); };
      // how many fills the two layers make there (a recording would do; the real context counts nothing, so wrap it for one pass)
      let fills = 0, calls = 0; const proxy = new Proxy(g, { get(o, key) { const v = o[key]; if (typeof v !== 'function') return v; return (...args) => { calls++; if (key === 'fill') fills++; return v.apply(o, args); }; }, set(o, key, v) { o[key] = v; return true; } });
      g.setTransform(k, 0, 0, k, -(i * CH.CHUNK_PX - CH.BLEED) * ss, -(j * CH.CHUNK_PX - CH.BLEED) * ss); S.runLayer('roads', w, proxy, view, G); S.runLayer('blocks', w, proxy, view, G);
      out[name] = { chunk: [i, j], roadsMs: time('roads'), blocksMs: time('blocks'), fills, calls };
    }
    return JSON.stringify({ dpr, zoom, ss, N, reps: ${REPS}, out });
  })()`);
  if (OUT) writeFileSync(OUT, res); const r = JSON.parse(res);
  console.log(`dpr ${r.dpr}, zoom ${r.zoom}, supersample ${r.ss}, ${r.N} px, ${r.reps} reps (median ms of the roads layer and of the blocks layer into one chunk; fills and canvas calls of both)`);
  for (const [k, v] of Object.entries(r.out)) console.log(k.padEnd(34), 'roads', String(v.roadsMs).padStart(7), 'blocks', String(v.blocksMs).padStart(7), 'fills', String(v.fills).padStart(5), 'calls', String(v.calls).padStart(6));
} finally { app.close(); server.close(); setTimeout(() => process.exit(0), 900); }
