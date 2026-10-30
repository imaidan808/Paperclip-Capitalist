// D-ELEM and D-HAIR: what each prop type draws (flat fills, gradients, strokes), how many colours it ends up with, and whether its faces leave cracks.
// node scripts/diag/elements.mjs  one instance of every prop type drawn at scale 2.4 on a transparent canvas; prints a table (ops, gradient share, colours, flat share, cracks).
import { boot, OUT } from './lib.mjs';
import { writeFileSync } from 'node:fs';
const app = await boot({ dsf: 2, gpu: true }); const { p } = app;
const CODE = `(async()=>{
  const L=await import('/js/world/layout.js'), PR=await import('/js/world/props.js'), SP=await import('/js/world/sprites.js'), ISO=await import('/js/world/iso.js');
  const seen=new Set(), list=[]; for(const q of L.SCENERY) if(!seen.has(q.t)){ seen.add(q.t); list.push(q); }
  const cracksOf=(a,N,M)=>{ const op=new Uint8Array(N*M); let opaque=0; for(let i=0;i<N*M;i++) if(a[i*4+3]>=250){op[i]=1;opaque++;} const S=new Int32Array((N+1)*(M+1)); for(let y=0;y<M;y++){let row=0; for(let x=0;x<N;x++){row+=op[y*N+x]; S[(y+1)*(N+1)+x+1]=S[y*(N+1)+x+1]+row;}} const R=3; let c=0, c225=0; for(let y=R;y<M-R;y++) for(let x=R;x<N-R;x++){ const al=a[(y*N+x)*4+3]; if(al===0||al>=250) continue; const k=S[(y+R+1)*(N+1)+x+R+1]-S[(y-R)*(N+1)+x+R+1]-S[(y+R+1)*(N+1)+x-R]+S[(y-R)*(N+1)+x-R]; if(k>=42){ c++; if(al<225) c225++; } } return {c,c225,opaque}; };
  const colourStats=(a,N,M)=>{ const set=new Set(); let flat=0, op=0; for(let y=1;y<M-1;y++) for(let x=1;x<N-1;x++){ const i=(y*N+x)*4; if(a[i+3]<250) continue; op++; set.add(((a[i]>>3)<<10)|((a[i+1]>>3)<<5)|(a[i+2]>>3)); const same=(j)=>a[j]===a[i]&&a[j+1]===a[i+1]&&a[j+2]===a[i+2]; if(same(i-4)&&same(i+4)&&same(i-N*4)&&same(i+N*4)) flat++; } return {colours:set.size, flatPct: op? +(flat/op*100).toFixed(1):0, op}; };
  const out=[]; const env0={ t:0, night:0, wind:0, dim:0, lights:null, zoff:0, locked:false, far:false, lite:false, hz:0, boardText:null, surge:false, alertAudit:false, crunch:false, tariff:false };
  for(const s of [2.4]) for(const q of list){
    const layer=PR.layerOf(q.t); const B=SP.spriteBounds(q, layer); const w=Math.ceil((B.x1-B.x0)*s), h=Math.ceil((B.y1-B.y0)*s); if(w>3000||h>3000||w<2) { out.push({t:q.t, skipped:true}); continue; }
    const oc=new OffscreenCanvas(w,h), g=oc.getContext('2d',{willReadFrequently:true}); g.setTransform(s,0,0,s,-B.x0*s,-B.y0*s);
    const cnt={fill:0,stroke:0,fillRect:0,gradFill:0,clip:0,image:0,text:0,shadow:0,path:0,blur:0}; let fs=null;
    const px=new Proxy(g,{get(t,k){ const v=t[k]; if(typeof v!=='function') return v; if(k==='fill'||k==='fillRect'||k==='stroke'||k==='clip'||k==='fillText'||k==='strokeText'||k==='drawImage'||k==='beginPath'||k==='stroke'){ return (...a)=>{ if(k==='fill'){cnt.fill++; if(t.fillStyle && typeof t.fillStyle==='object') cnt.gradFill++;} else if(k==='fillRect'){cnt.fillRect++; if(typeof t.fillStyle==='object') cnt.gradFill++;} else if(k==='stroke') cnt.stroke++; else if(k==='clip') cnt.clip++; else if(k==='drawImage') cnt.image++; else if(k==='beginPath') cnt.path++; else cnt.text++; return v.apply(t,a); }; } return v.bind(t); }, set(t,k,v){ if(k==='shadowBlur'&&v>0) cnt.shadow++; if(k==='filter'&&v&&v!=='none') cnt.blur++; t[k]=v; return true; }});
    const env={...env0, lights:[]}; env.hz=0;
    try{ if(layer) layer.body(px,q,env); else if(PR.DRAW[q.t]) PR.DRAW[q.t](px,q,env); else { out.push({t:q.t, skipped:'nodraw'}); continue; } }catch(e){ out.push({t:q.t, err:String(e.message)}); continue; }
    const d=g.getImageData(0,0,w,h).data; const cr=cracksOf(d,w,h), cs=colourStats(d,w,h);
    out.push({t:q.t, layer:!!layer, ...cnt, ops:cnt.fill+cnt.fillRect+cnt.stroke, grad:cnt.gradFill, gradPct: cnt.fill+cnt.fillRect? +(cnt.gradFill/(cnt.fill+cnt.fillRect)*100).toFixed(1):0, colours:cs.colours, flatPct:cs.flatPct, opaquePx:cs.op, cracks:cr.c, c225:cr.c225, cracksPer10k: cr.opaque? +(cr.c/cr.opaque*1e4).toFixed(1):0});
  }
  // plain box(): cracks vs phase and scale
  const box=[]; for(const sc of [1,1.25,1.5,2,2.4]) { let worst=0, tot=0, n=0; for(let ph=0; ph<8; ph++){ const oc=new OffscreenCanvas(260,260), g=oc.getContext('2d',{willReadFrequently:true}); g.setTransform(sc,0,0,sc,ph*0.125+10.3,ph*0.0625+20.1); ISO.box(g, 2,0.5, 2,2, 50, ISO.tone('#c9ad7a')); const d=g.getImageData(0,0,260,260).data; const r=cracksOf(d,260,260); worst=Math.max(worst,r.c225); tot+=r.c225; n++; } box.push({scale:sc, worstVisibleCracks:worst, meanVisibleCracks:+(tot/n).toFixed(1)}); }
  return {out, box};
})()`;
try {
  const r = await p.eval(CODE);
  const rows = r.out.filter((x) => !x.skipped && !x.err);
  console.log('skipped/err:', JSON.stringify(r.out.filter((x) => x.skipped || x.err)));
  rows.sort((a, b) => b.cracksPer10k - a.cracksPer10k);
  console.table(rows.map((x) => ({ t: x.t, L: x.layer ? 'y' : '', ops: x.ops, fill: x.fill + x.fillRect, stroke: x.stroke, grad: x.grad, gradPct: x.gradPct, clip: x.clip, shadow: x.shadow, colours: x.colours, flatPct: x.flatPct, opaquePx: x.opaquePx, cracks: x.cracks, vis225: x.c225, per10k: x.cracksPer10k })));
  console.log('box():', JSON.stringify(r.box));
  const tot = rows.reduce((a, x) => ({ ops: a.ops + x.ops, grad: a.grad + x.grad, cracks: a.cracks + x.cracks, op: a.op + x.opaquePx }), { ops: 0, grad: 0, cracks: 0, op: 0 });
  console.log('totals over', rows.length, 'types:', JSON.stringify(tot), 'cracks/10k opaque px:', (tot.cracks / tot.op * 1e4).toFixed(1));
  writeFileSync(OUT + '/elements.json', JSON.stringify(r, null, 1));
} catch (e) { console.log('ERR', e.stack); } finally { app.close(); }
