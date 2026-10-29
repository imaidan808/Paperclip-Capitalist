// D-SEAM: count crack pixels (partly transparent pixels inside an opaque field) in the ground pass, on a transparent offscreen canvas, at every zoom and density.
// node scripts/diag/seams.mjs     alpha below 250 inside an opaque field is a crack; "visible" is alpha below 225 (a tenth or more of the ground shows through), "strong" below 192.
import { boot, view, SCEN, ZOOMS, OUT } from './lib.mjs';
import { writeFileSync } from 'node:fs';
const FN = `(()=>{ // returns {cracks, partial, opaque, w, h, sample:[{x,y}]} for the ground pass drawn onto a transparent canvas the size of the world canvas
  const w=pc.world, {cv,W,H,dpr,cam}=w; const oc=new OffscreenCanvas(cv.width,cv.height), g=oc.getContext('2d',{willReadFrequently:true});
  g.setTransform(dpr*cam.z,0,0,dpr*cam.z,dpr*(W/2-cam.x*cam.z),dpr*(H/2-cam.y*cam.z));
  const v=w.view; w.drawGround(g, v, 0);
  const id=g.getImageData(0,0,oc.width,oc.height), a=id.data, N=oc.width, M=oc.height;
  const op=new Uint8Array(N*M); let opaque=0, partial=0; for(let i=0;i<N*M;i++){const al=a[i*4+3]; if(al>=250){op[i]=1;opaque++;} else if(al>0) partial++;}
  const S=new Int32Array((N+1)*(M+1)); for(let y=0;y<M;y++){let row=0; for(let x=0;x<N;x++){row+=op[y*N+x]; S[(y+1)*(N+1)+x+1]=S[y*(N+1)+x+1]+row;}}
  const R=3; let cracks=0, c225=0, c192=0; const sample=[];
  for(let y=R;y<M-R;y++) for(let x=R;x<N-R;x++){ const i=y*N+x, al=a[i*4+3]; if(al===0||al>=250) continue;
    const c=S[(y+R+1)*(N+1)+x+R+1]-S[(y-R)*(N+1)+x+R+1]-S[(y+R+1)*(N+1)+x-R]+S[(y-R)*(N+1)+x-R]; if(c>=42){cracks++; if(al<225) c225++; if(al<192) c192++; if(sample.length<6 && (cracks%37===0)) sample.push({x,y});} }
  return {cracks, c225, c192, partial, opaque, w:N, h:M, sample};
})()`;
const rows = [];
for (const dsf of [1, 1.25, 1.5, 2]) {
  const app = await boot({ dsf, gpu: true }); const { p } = app;
  try {
    for (const z of ZOOMS) for (const sc of ['coast', 'lockedA']) {
      if (z < 0.5 && sc === 'coast') continue;
      const [wx, wy] = SCEN[sc]; await view(p, { z, wx, wy });
      const r = await p.eval(FN);
      rows.push({ dsf, sc, z, any: r.cracks, visible_a225: r.c225, strong_a192: r.c192, opaqueMpx: +(r.opaque / 1e6).toFixed(2), strongPer100k: +(r.c192 / (r.opaque / 1e5)).toFixed(1) });
    }
  } finally { app.close(); await new Promise(r => setTimeout(r, 1000)); }
}
console.table(rows);
writeFileSync(OUT + '/seams2.json', JSON.stringify(rows, null, 1));
