// The pictures docs/RENDER_DIAGNOSIS.md points at: the same camera places, density 2 with the GPU on (canvas density 2), saved as PNGs under DIAG_OUT (default <tmp>/render-diag).
// node scripts/diag/evidence.mjs      (DIAG_BASE / DIAG_CDP / DIAG_OUT as in lib.mjs)
import { boot, view, crop, SCEN } from './lib.mjs';
const app = await boot({ dsf: 2, gpu: true }); const { p } = app;
const once = async (name, v, c) => { await view(p, v); await crop(p, name, c); console.log('saved', name); };
try {
  await once('E-sea-squiggles-0.9-x2', { z: 0.9, wx: SCEN.sea[0], wy: SCEN.sea[1] }, { x: 900, y: 650, w: 700, h: 360, mag: 2 });
  await once('E-coast-stairs-0.9', { z: 0.9, wx: SCEN.coast[0], wy: SCEN.coast[1] }, { x: 260, y: 380, w: 1100, h: 760, mag: 1 });
  await crop(p, 'E-coast-stairs-0.9-x3', { x: 380, y: 760, w: 520, h: 280, mag: 3 });
  await once('E-cliff-plinth-0.5-x2', { z: 0.5, wx: 710.66, wy: 2587 }, { x: 1300, y: 420, w: 700, h: 420, mag: 2 });
  await once('E-collage-0.3', { z: 0.3, wx: SCEN.fit[0], wy: SCEN.fit[1] }, { x: 0, y: 0, w: 1500, h: 1000, mag: 1 });
  for (const z of [0.4999, 0.5001, 0.8499, 0.8501]) await once(`stride-${z}`, { z, wx: SCEN.coast[0], wy: SCEN.coast[1] }, { x: 200, y: 300, w: 1000, h: 700, mag: 1 }); // zoom 0.4999 and 0.5001 differ only in the mesh stride
  await view(p, { z: 2.4, wx: SCEN.finest[0], wy: SCEN.finest[1] });
  await crop(p, 'E-finest-crates-x2', { x: 1380, y: 600, w: 640, h: 520, mag: 2 }); await crop(p, 'E-finest-person-x4', { x: 880, y: 1050, w: 300, h: 260, mag: 4 }); await crop(p, 'E-finest-fence-x3', { x: 1850, y: 300, w: 560, h: 330, mag: 3 });
  const W = { x: 700, y: 500, w: 1100, h: 700, mag: 1 };
  await once('fog-lockedA-0.9-AS-SHIPPED', { z: 0.9, wx: SCEN.lockedA[0], wy: SCEN.lockedA[1] }, W);
  await p.eval(`(()=>{ const w=pc.world; w.__keep={f:w.drawFog,x:w.fxOf,g:w.drawGrade}; w.drawFog=()=>{}; w.fxOf=()=>({dim:0,fog:0,lights:0}); w.drawGrade=()=>{}; w.gcValid=false; w.draw(); w.draw(); })()`);
  await crop(p, 'fog-lockedA-0.9-RAW-PALETTE-no-fog-no-dim-no-grade', W);
  await p.eval(`(()=>{ const w=pc.world; w.drawFog=w.__keep.f; w.fxOf=w.__keep.x; w.drawGrade=w.__keep.g; w.unlocked=new Set([1,2,3]); w.unlockHash=12345; w.gcValid=false; w.draw(); w.draw(); })()`);
  await crop(p, 'fog-lockedA-0.9-district-open', W);
} catch (e) { console.log('ERR', e.stack); } finally { app.close(); }
