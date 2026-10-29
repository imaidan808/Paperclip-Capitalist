// D-MEM: how many canvas pixels does the world hold at dsf 2 with the GPU on (dpr 2), by owner, by day and at dusk.
import { boot, view, SCEN } from './lib.mjs';
const app = await boot({ dsf: 2, gpu: true, days: 0 }); const { p } = app;
try {
  await p.eval(`(async()=>{ window.__S=await import('/js/world/sprites.js'); })()`);
  const settle = `(async()=>{ let last=-1, same=0; for(let i=0;i<300 && same<10;i++){ pc.world.draw(); await new Promise(r=>setTimeout(r,25)); const b=__S.stats.builds; if(b===last) same++; else {same=0; last=b;} } })()`;
  const snap = (label) => p.eval(`(()=>{ const w=pc.world, S=__S.stats; const px=(c)=>c?c.width*c.height:0; const lab=[...w.labels.cache.m.values()].reduce((a,s)=>a+(s?s.c.width*s.c.height:0),0);
    const L=w.light; const o={label:${JSON.stringify(label)}, dpr:w.dpr, mainMpx:+(px(w.cv)/1e6).toFixed(2), groundCacheMpx:+(px(w.gc&&w.gc.c)/1e6).toFixed(2), light_day:+(px(L.big.day)/1e6).toFixed(2), light_night:+(px(L.big.night)/1e6).toFixed(2), light_shafts:+(px(L.big.shafts)/1e6).toFixed(2), light_mix:+(px(L.big.mix)/1e6).toFixed(2), spritesMpx:+(S.pixels/1e6).toFixed(2), spriteBuilds:S.builds, labelsMpx:+(lab/1e6).toFixed(2)};
    o.totalMpx=+(o.mainMpx+o.groundCacheMpx+o.light_day+o.light_night+o.light_shafts+o.light_mix+o.spritesMpx+o.labelsMpx).toFixed(2); o.totalMB=+(o.totalMpx*4).toFixed(0); return o; })()`);
  const rows = [];
  const [wx, wy] = SCEN.lockedA;
  await view(p, { z: 0.9, wx, wy }); await p.eval(settle); rows.push(await snap('day, 0.9, one district settled'));
  for (const [z, sc] of [[1.4, 'lockedA'], [2.4, 'finest'], [0.5, 'sea'], [0.9, 'coast'], [1.2, 'lockedB']]) { const [x, y] = SCEN[sc]; await view(p, { z, wx: x, wy: y }); await p.eval(settle); }
  rows.push(await snap('day, after visiting 5 views'));
  await p.eval(`(async()=>{ const w=pc.world; w.night=0.5; w.dusk=0.5; for(let i=0;i<14;i++){ w.draw(); await new Promise(r=>setTimeout(r,30)); } })()`); rows.push(await snap('dusk (night .5, dusk .5) after 14 frames'));
  console.table(rows);
  console.log('SPRITE_BUDGET at dpr 2:', await p.eval(`Math.round(22e6*Math.max(1,Math.min(1.5,1+(2-1)*0.7)))/1e6`), 'Mpx');
} catch (e) { console.log('ERR', e.stack); } finally { app.close(); }
