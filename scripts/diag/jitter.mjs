// D-SNAP: sprites are blitted on whole device pixels while the ground moves smoothly: how far does a sprite sit from where the camera says it should while panning?
import { boot, view, SCEN } from './lib.mjs';
const rows = [];
for (const dsf of [1, 2]) {
  const app = await boot({ dsf, gpu: true }); const { p } = app;
  try {
    await p.eval(`(async()=>{ window.__S=await import('/js/world/sprites.js'); })()`);
    const [wx, wy] = SCEN.lockedA; await view(p, { z: 0.9, wx, wy });
    await p.eval(`(async()=>{ let last=-1, same=0; for(let i=0;i<300 && same<10;i++){ pc.world.draw(); await new Promise(r=>setTimeout(r,25)); const b=__S.stats.builds; if(b===last) same++; else {same=0; last=b;} } })()`);
    const r = await p.eval(`(()=>{
      const w=pc.world, P=CanvasRenderingContext2D.prototype, orig=P.drawImage; let log=null;
      P.drawImage=function(img,...a){ if(log && img instanceof ImageBitmap && a.length<=4){ const m=this.getTransform(); if(m.a===1&&m.d===1&&!m.b&&!m.c) log.push([img,a[0],a[1]]); } return orig.call(this,img,...a); };
      const a=w.dpr*w.cam.z, x0=w.cam.x, y0=w.cam.y, N=24, step=0.2; const frames=[]; // pan 0.2 device px a frame, along both axes
      for(let k=0;k<N;k++){ w.cam.x=x0+k*step/a; w.cam.y=y0+k*step*0.6/a; log=[]; w.draw(); frames.push(log); }
      P.drawImage=orig; w.cam.x=x0; w.cam.y=y0;
      const by=new Map(); frames.forEach((f,k)=>{ for(const [img,X,Y] of f){ if(!by.has(img)) by.set(img,[]); by.get(img)[k]=[X,Y]; } });
      let n=0, sum=0, mx=0, stuck=0, steps=0; const res=[];
      for(const [img,pos] of by){ if(!pos[0]) continue; for(let k=1;k<N;k++){ if(!pos[k]) continue; const ex=-(k*step), ey=-(k*step*0.6); const rx=(pos[k][0]-pos[0][0])-ex, ry=(pos[k][1]-pos[0][1])-ey; const e=Math.hypot(rx,ry); sum+=e; n++; if(e>mx) mx=e; } for(let k=1;k<N;k++){ if(pos[k]&&pos[k-1]){ steps++; if(pos[k][0]===pos[k-1][0]&&pos[k][1]===pos[k-1][1]) stuck++; } } }
      return {sprites:by.size, samples:n, meanErrDevPx:+(sum/n).toFixed(3), maxErrDevPx:+mx.toFixed(3), framesWhereSpriteDidNotMove:+(stuck/steps*100).toFixed(1), dpr:w.dpr, zoom:w.cam.z};
    })()`);
    rows.push({ dsf, ...r, maxErrCssPx: +(r.maxErrDevPx / r.dpr).toFixed(3), meanErrCssPx: +(r.meanErrDevPx / r.dpr).toFixed(3) });
  } catch (e) { console.log('ERR', e.stack); } finally { app.close(); await new Promise(r => setTimeout(r, 1000)); }
}
console.table(rows);
