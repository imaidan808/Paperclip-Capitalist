// D-FOG and D-GRADE: what the fog layer is made of, where its edges are hard, and what darkens and greys the picture.
import { boot, view, SCEN } from './lib.mjs';
const app = await boot({ dsf: 2, gpu: true }); const { p } = app;
try {
  await view(p, { z: 0.9, wx: SCEN.lockedA[0], wy: SCEN.lockedA[1] });
  // 1. the fog pass alone on a transparent canvas, with every blit recorded
  const fog = await p.eval(`(()=>{
    const w=pc.world, {cv,W,H,dpr,cam}=w; const oc=new OffscreenCanvas(cv.width,cv.height), g=oc.getContext('2d',{willReadFrequently:true});
    g.setTransform(dpr*cam.z,0,0,dpr*cam.z,dpr*(W/2-cam.x*cam.z),dpr*(H/2-cam.y*cam.z));
    const log=[]; const px=new Proxy(g,{get(t,k){ if(k==='drawImage') return (img,...a)=>{ const m=t.getTransform(); log.push({iw:img.width,ih:img.height,a:+t.globalAlpha.toFixed(3),dw:+(a[a.length-2]*m.a).toFixed(0),dh:+(a[a.length-1]*m.d).toFixed(0),n:a.length}); return t.drawImage(img,...a); }; const v=t[k]; return typeof v==='function'?v.bind(t):v; }, set(t,k,v){t[k]=v; return true;}});
    w.drawFog(px, w.vz);
    const id=g.getImageData(0,0,oc.width,oc.height).data; let covered=0, strong=0, sum=0; const N=oc.width*oc.height; for(let i=0;i<N;i++){const al=id[i*4+3]; if(al>10){covered++; sum+=al;} if(al>60) strong++;}
    // hardest edge anywhere in the layer: the largest alpha step between two neighbouring device pixels
    const M=oc.width; let maxStep=0, hard=0; for(let y=1;y<oc.height-1;y++) for(let x=1;x<M-1;x++){ const a=id[(y*M+x)*4+3]; const d=Math.max(Math.abs(a-id[(y*M+x+1)*4+3]),Math.abs(a-id[((y+1)*M+x)*4+3])); if(d>maxStep) maxStep=d; if(d>=10) hard++; }
    // sprite edges
    const sprites=[]; const seen=new Set();
    return {log, vz:[...w.vz], covered:+(covered/N).toFixed(3), strongShare:+(strong/N).toFixed(3), meanAlpha:+(sum/Math.max(1,covered)/255).toFixed(3), maxStep, hardEdgePx:hard, W:oc.width,H:oc.height};
  })()`);
  const byKind = {}; for (const l of fog.log) { const k = l.iw + 'x' + l.ih; (byKind[k] ||= []).push(l); }
  console.log('fog blits', Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, { count: v.length, dest: v[0].dw + 'x' + v[0].dh, alphaMax: Math.max(...v.map((x) => x.a)) }])), 'districts', fog.vz.join());
  console.log('fog layer: covered', fog.covered, 'strong(a>0.24)', fog.strongShare, 'meanAlpha', fog.meanAlpha, 'max neighbouring-pixel alpha step /255:', fog.maxStep, 'pixels with step>=10:', fog.hardEdgePx);
  // 2. the cloud sprite itself: where its own border is not empty
  const spr = await p.eval(`(()=>{ const w=pc.world; const out=[]; const g=new OffscreenCanvas(10,10).getContext('2d'); let imgs=[]; const px=new Proxy(g,{get(t,k){ if(k==='drawImage') return (img)=>{ if(!imgs.includes(img)) imgs.push(img); }; const v=t[k]; return typeof v==='function'?v.bind(t):v; }, set(t,k,v){t[k]=v; return true;}}); w.light.fog(px, 300, 1, 5000, false);
    for(const im of imgs){ const c=im.getContext('2d'); const d=c.getImageData(0,0,im.width,im.height).data, N=im.width, M=im.height; let mx=0; for(let i=0;i<N*M;i++) mx=Math.max(mx,d[i*4+3]); const edge=(f)=>{let m=0; for(let k=0;k<(f==='t'||f==='b'?N:M);k++){ const x=f==='l'?0:f==='r'?N-1:k, y=f==='t'?0:f==='b'?M-1:k; m=Math.max(m,d[(y*N+x)*4+3]);} return m;}; out.push({w:N,h:M,maxAlpha:mx,edgeAlpha:{top:edge('t'),bottom:edge('b'),left:edge('l'),right:edge('r')}}); }
    return out; })()`);
  console.log('sprite borders (alpha 0-255; anything > 0 on a border is a hard cut):', JSON.stringify(spr));
  // 3. what darkens it: mean luma, saturation and contrast with each pass removed, over the district rectangle
  const variants = await p.eval(`(()=>{
    const w=pc.world; const g=w.cv.getContext('2d',{willReadFrequently:true}); const cw=w.cv.width, ch=w.cv.height;
    const stat=()=>{ const d=g.getImageData(Math.floor(cw*0.2),Math.floor(ch*0.2),Math.floor(cw*0.6),Math.floor(ch*0.6)).data; let L=0,S=0,L2=0,n=0; for(let i=0;i<d.length;i+=16){ const r=d[i]/255,gg=d[i+1]/255,b=d[i+2]/255,mx=Math.max(r,gg,b),mn=Math.min(r,gg,b),l=(mx+mn)/2,s=mx===mn?0:(mx-mn)/(1-Math.abs(2*l-1)); L+=l; L2+=l*l; S+=s; n++; } const m=L/n; return {meanL:+m.toFixed(3), sd:+Math.sqrt(L2/n-m*m).toFixed(3), meanS:+(S/n).toFixed(3)}; };
    const keep={drawGrade:w.drawGrade, drawFog:w.drawFog, fxOf:w.fxOf, drawWater:w.drawWater, drawField:w.drawField, drawWeather:w.drawWeather};
    const run=(label,patch)=>{ Object.assign(w,keep); patch(); w.gcValid=false; w.draw(); w.draw(); const r=stat(); Object.assign(w,keep); return {label,...r}; };
    const NOFX={dim:0,fog:0,lights:0}; const res=[];
    res.push(run('as shipped',()=>{}));
    res.push(run('no grade pass (tint, lights, air, vignette)',()=>{ w.drawGrade=()=>{}; }));
    res.push(run('no fog sprites (dim stays)',()=>{ w.drawFog=()=>{}; }));
    res.push(run('no fog sprites and no dim (district open)',()=>{ w.drawFog=()=>{}; w.fxOf=()=>NOFX; }));
    res.push(run('no fog, no dim, no grade (the raw palette)',()=>{ w.drawFog=()=>{}; w.fxOf=()=>NOFX; w.drawGrade=()=>{}; }));
    return {res, night:w.night, dusk:w.dusk, hour:w.env.hour};
  })()`);
  console.table(variants.res); console.log('light state', variants.night, variants.dusk, variants.hour);
  // 4. the ambient layers' own colour: what one layer lays over a mid-grey (vignette and air)
  const amb = await p.eval(`(()=>{ const w=pc.world; const o=new OffscreenCanvas(300,200); const g=o.getContext('2d',{willReadFrequently:true}); const out=[]; for(const bg of ['#808080','#c8a050','#3a8a4a']){ g.setTransform(1,0,0,1,0,0); g.fillStyle=bg; g.fillRect(0,0,300,200); const L=w.light; L.release(); const fake={W:300,H:200,night:0,dusk:0,reduced:()=>false,lite:false,env:{crunch:false},t:0,cv:{width:300,height:200},dpr:1}; L.perFrame=9; L.ambient(g,fake); const d=g.getImageData(0,0,300,200).data; const at=(x,y)=>{const i=(y*300+x)*4; return [d[i],d[i+1],d[i+2]]}; out.push({bg, centre:at(150,100), topCentre:at(150,6), corner:at(6,6), footCentre:at(150,194)}); } return out; })()`);
  console.log('ambient day layer over three grounds:'); for (const a of amb) console.log(JSON.stringify(a));
} catch (e) { console.log('ERR', e.stack); } finally { app.close(); }
