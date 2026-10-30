// What one ground chunk costs to bake, in Node (no browser): the whole base (land rasterised, sea, cliff walls, land shaded) into a 388 x 388 buffer at a scale, at six places of the island.
//   node scripts/diag/chunkbake.mjs [scale = 1.35]      (1.35 is density 1.5 at zoom 0.9; the cost of a chunk is the same at every density: it is 384 device pixels whatever the zoom)
// Written for the T1 pass (docs/TERRAIN.md): a chunk is 1.5 to 6 ms, a cliff coast 13. Each place is baked 25 times to warm the JIT, then timed over 30.
import { LAYOUT } from '../../js/world/layout.js';
import { sceneOf } from '../../js/world/scene.js';
import { bakeBase } from '../../js/world/rasterbase.js';

const sc = sceneOf(LAYOUT.ids.filter((i) => i !== 1)), S = +(process.argv[2] || 1.35), N = 388, buf = new Uint8ClampedArray(N * N * 4), view = { maxZ: LAYOUT.maxZ };
const places = { sea: [0, 112], beach: [22, 116], meadow: [60, 100], cliff: [170, 30], 'deep land': [95, 70], strait: [150, 40] };
for (const [name, [gx, gy]] of Object.entries(places)) {
  const cx = (gx - gy) * 32, cy = (gx + gy) * 16, ox = cx - N / 2 / S, oy = cy - N / 2 / S;
  for (let r = 0; r < 25; r++) bakeBase(buf, N, N, S, ox, oy, sc, view);
  const t = performance.now(); for (let r = 0; r < 30; r++) bakeBase(buf, N, N, S, ox, oy, sc, view);
  console.log(name.padEnd(10), ((performance.now() - t) / 30).toFixed(1).padStart(5), 'ms a chunk');
}
