// D-BUDGET: per-stage frame cost in the software-raster headless Chrome (the perf.mjs baseline), still camera vs moving camera.
// node scripts/diag/stages.mjs [sw|gpu] [dsf] [bot days]     sw is the perf.mjs baseline (software raster); each stage is followed by a one-pixel readback, which costs about 0.8 ms a stage, so small stages read high.
import { boot, view, SCEN, OUT } from './lib.mjs';
import { writeFileSync } from 'node:fs';
const gpu = process.argv[2] === 'gpu'; const dsf = +(process.argv[3] || 2);
const app = await boot({ dsf, gpu, days: +(process.argv[4] || 0) }); const { p } = app;
const rows = [];
try {
  await p.eval(`(async()=>{ const S=await import('/js/world/sprites.js'); window.__S=S; const W=pc.world.constructor; window.__T={}; const names=['drawWater','groundPass','drawStatic','drawEnt','drawPlayer','drawCar','drawFog','drawHover','drawGrade','drawWeather','drawField','drawOverlay','drawParticles','drawMini'];
    for(const n of names){ const f=W.prototype[n]; W.prototype[n]=function(...a){ const t=performance.now(); const r=f.apply(this,a); const FL=${gpu ? 'true' : 'true'}; if(FL) try{ this.ctx.getImageData(0,0,1,1); }catch{} window.__T[n]=(window.__T[n]||0)+(performance.now()-t); window.__T['n_'+n]=(window.__T['n_'+n]||0)+1; return r; }; } })()`);
  console.log(await p.eval('JSON.stringify({dpr:pc.world.dpr, cv:[pc.world.cv.width,pc.world.cv.height], unlocked:[...pc.world.unlocked], builds:__S.stats.builds})'));
  const plan = [['fit', 0.13], ['fit', 0.3], ['lockedA', 0.5], ['lockedA', 0.9], ['lockedA', 1.2], ['finest', 2.4], ['coast', 0.9]];
  for (const [sc, z] of plan) {
    const [wx, wy] = SCEN[sc]; await view(p, { z, wx, wy });
    // let sprites build: real time must pass after the zoom stops (90 ms) and the build budget is 3 ms a frame
    await p.eval(`(async()=>{ let last=-1, same=0; for(let i=0;i<400 && same<12;i++){ pc.world.draw(); await new Promise(r=>setTimeout(r,25)); const b=__S.stats.builds+__S.stats.hits*0; if(b===last) same++; else {same=0; last=b;} } })()`);
    for (const mode of ['still', 'moving']) {
      const r = await p.eval(`(()=>{ const w=pc.world, T=window.__T; for(const k in T) T[k]=0; const x0=w.cam.x; const N=40, tot=[]; const g=w.ctx; for(let i=0;i<N;i++){ ${mode === 'moving' ? 'w.cam.x = x0 + i*0.37/w.cam.z;' : ''} const a=performance.now(); w.draw(); try{ g.getImageData(0,0,1,1);}catch{} tot.push(performance.now()-a);} w.cam.x=x0; tot.sort((a,b)=>a-b); const out={total_med:+tot[N>>1].toFixed(2), total_p95:+tot[Math.floor(N*.95)].toFixed(2)}; let sum=0; for(const k in T) if(!k.startsWith('n_')){ out[k]=+(T[k]/N).toFixed(2); sum+=T[k]/N; } out.stages_sum=+sum.toFixed(2); out.items_other=+(tot[N>>1]-sum).toFixed(2); out.stats=JSON.stringify({b:__S.stats.builds,h:__S.stats.hits,d:__S.stats.direct,st:__S.stats.stale}); return out; })()`);
      rows.push({ sc, z, mode, ...r });
    }
  }
  console.table(rows.map(({ stats, ...r }) => r));
  console.log(rows.map((r) => r.stats).join(' | '));
  writeFileSync(`${OUT}/stages-${gpu ? 'gpu' : 'sw'}-dsf${dsf}-d${process.argv[4] || 0}.json`, JSON.stringify(rows, null, 1));
} catch (e) { console.log('ERR', e.stack); } finally { app.close(); }
