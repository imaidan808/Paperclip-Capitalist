// node scripts/perf.mjs '{"days":60,"perks":"trades,pro","w":1440,"h":900,"base":"http://localhost:8090","cdp":9444}'
// Frame cost of the world in headless Chrome: milliseconds per draw at the whole-island and focused views, real requestAnimationFrame intervals for three seconds, and heap growth.
import { startApp, newGame, draw } from './boot.mjs';
const o = { days: 60, perks: 'trades,pro', w: 1440, h: 900, base: 'http://localhost:8090', cdp: 9444, dsf: 1, ...JSON.parse(process.argv[2] || '{}') };
const app = await startApp(o);
const { p } = app;
try {
  await newGame(p, o);
  const bench = (label) => p.eval(`(()=>{ const w=pc.world; const t=[]; for (let i=0;i<120;i++){ const a=performance.now(); w.draw(); t.push(performance.now()-a);} t.sort((a,b)=>a-b); return {view:${JSON.stringify(label)}, medianMs:+t[60].toFixed(2), p95Ms:+t[113].toFixed(2), maxMs:+t[119].toFixed(2)}; })()`);
  const out = { viewport: [o.w, o.h], dsf: o.dsf, days: o.days };
  await p.eval('pc.world.fit(false)'); await draw(p); out.island = await bench('island');
  await p.eval('pc.world.focusZone(pc.S.game.s.zones.at(-1), false)'); await draw(p); out.focus = await bench('focus');
  await p.send('Performance.enable'); const h0 = (await p.send('Performance.getMetrics')).metrics.find((m) => m.name === 'JSHeapUsedSize').value;
  out.frames = await p.eval(`new Promise((res)=>{ const iv=[]; let last=performance.now(), n=0; const f=(t)=>{ iv.push(t-last); last=t; if(++n<180) requestAnimationFrame(f); else { iv.shift(); iv.sort((a,b)=>a-b); res({count:iv.length, medianMs:+iv[iv.length>>1].toFixed(1), p95Ms:+iv[Math.floor(iv.length*0.95)].toFixed(1), over33:iv.filter(x=>x>33).length}); } }; requestAnimationFrame(f); })`);
  const h1 = (await p.send('Performance.getMetrics')).metrics.find((m) => m.name === 'JSHeapUsedSize').value;
  out.heapGrowthMB = +((h1 - h0) / 1048576).toFixed(2);
  out.worldSlow = await p.eval('pc.world.slow ?? null');
  console.log(JSON.stringify(out, null, 1));
} finally { app.close(); }
