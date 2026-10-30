import { boot, view, SCEN, OUT } from './lib.mjs';
for (const gpu of [false, true]) {
  const app = await boot({ dsf: 2, gpu }); const { p } = app;
  try {
    await view(p, { z: 2.4, wx: SCEN.finest[0], wy: SCEN.finest[1] });
    await p.shot(`${OUT}/dprblur-${gpu ? 'gpu-dpr2' : 'software-dpr1.5'}.png`);
    console.log(gpu, await p.eval('JSON.stringify({dpr:pc.world.dpr, cv:[pc.world.cv.width,pc.world.cv.height], css:[pc.world.W,pc.world.H]})'));
  } finally { app.close(); await new Promise(r => setTimeout(r, 1200)); }
}
