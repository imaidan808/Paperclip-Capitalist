// Does the quality governor already step down in the default day-1 state? Run the real loop for 8 s per view and read its tier.
import { boot, view, SCEN } from './lib.mjs';
const gpu = process.argv[2] === 'gpu';
const app = await boot({ dsf: 2, gpu }); const { p } = app;
try {
  const rows = [];
  for (const [sc, z] of [['fit', 0.13], ['fit', 0.3], ['lockedA', 0.9], ['lockedA', 1.2], ['finest', 2.4]]) {
    const [wx, wy] = SCEN[sc]; await view(p, { z, wx, wy });
    const r = await p.eval(`(async()=>{ const w=pc.world; w.slow=0; w.dprDown=false; w.gov.cost=0; w.gov.bad=0; w.gov.good=0; w.warm=0; w.start(); const iv=[]; let last=performance.now(); const costs=[]; const t0=performance.now(); const tiers=[]; while(performance.now()-t0<8000){ await new Promise(r=>requestAnimationFrame(r)); const n=performance.now(); iv.push(n-last); last=n; tiers.push(w.slow); } w.stop(); iv.sort((a,b)=>a-b); return {slowEnd:w.slow, slowMax:Math.max(...tiers), govCost:+w.gov.cost.toFixed(1), fps:w.fps, dpr:w.dpr, lite:w.lite, frames:iv.length, medIntervalMs:+iv[iv.length>>1].toFixed(1), p95:+iv[Math.floor(iv.length*0.95)].toFixed(1)}; })()`);
    rows.push({ mode: gpu ? 'gpu' : 'sw', sc, z, ...r });
  }
  console.table(rows);
} catch (e) { console.log('ERR', e.stack); } finally { app.close(); }
