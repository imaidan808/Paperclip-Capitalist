// What does a frame cost while the zoom itself is changing every frame (a trackpad pinch)? Day-1 state and 60 bot days, software raster, flush-inclusive.
import { boot, view, SCEN } from './lib.mjs';
const days = +(process.argv[2] || 0);
const app = await boot({ dsf: 2, gpu: false, days }); const { p } = app;
try {
  await p.eval(`(async()=>{ window.__S=await import('/js/world/sprites.js'); })()`);
  const rows = [];
  for (const [sc, z0, dir, label] of [['lockedA', 0.9, 1.006, 'zoom in from 0.9'], ['lockedA', 1.6, 0.994, 'zoom out from 1.6'], ['fit', 0.3, 1.01, 'zoom in from 0.3']]) {
    const [wx, wy] = SCEN[sc]; await view(p, { z: z0, wx, wy });
    await p.eval(`(async()=>{ let last=-1, same=0; for(let i=0;i<300 && same<10;i++){ pc.world.draw(); await new Promise(r=>setTimeout(r,25)); const b=__S.stats.builds; if(b===last) same++; else {same=0; last=b;} } })()`);
    const r = await p.eval(`(()=>{ const w=pc.world, S=__S.stats, g=w.ctx; const s0={...S}; const t=[]; for(let i=0;i<40;i++){ const bx=w.s2w(w.W/2,w.H/2); w.cam.z*=${dir}; w.clampCam(); const ax=w.s2w(w.W/2,w.H/2); w.cam.x+=bx[0]-ax[0]; w.cam.y+=bx[1]-ax[1]; const a=performance.now(); w.draw(); try{g.getImageData(0,0,1,1);}catch{} t.push(performance.now()-a); } t.sort((a,b)=>a-b); return {med:+t[20].toFixed(1), p95:+t[38].toFixed(1), max:+t[39].toFixed(1), zEnd:+w.cam.z.toFixed(2), direct:S.direct-s0.direct, stale:S.stale-s0.stale, builds:S.builds-s0.builds}; })()`);
    rows.push({ days, label, ...r });
  }
  console.table(rows);
} catch (e) { console.log('ERR', e.stack); } finally { app.close(); }
