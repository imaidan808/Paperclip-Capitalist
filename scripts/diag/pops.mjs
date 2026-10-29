// D-STRIDE and D-CACHE: do the coarse terrain meshes change what the land looks like at a threshold, and does the ground cache change a pixel?
import { boot, view, pixels, crop, SCEN, OUT } from './lib.mjs';
import { writeFileSync } from 'node:fs';
const app = await boot({ dsf: 2, gpu: true }); const { p } = app;
const cmp = (A, B, label) => { // A, B: {w,h,data} RGBA
  const n = A.w * A.h; let diff = 0, big = 0, landA = 0, landB = 0, sum = 0;
  for (let i = 0; i < n; i++) { const o = i * 4, d = Math.abs(A.data[o] - B.data[o]) + Math.abs(A.data[o + 1] - B.data[o + 1]) + Math.abs(A.data[o + 2] - B.data[o + 2]); if (d > 0) diff++; if (d > 48) big++; sum += d; }
  return { label, pixels: n, changed: diff, changedPct: +(diff / n * 100).toFixed(2), big_changed_pct: +(big / n * 100).toFixed(2), meanAbsDiff: +(sum / n / 3).toFixed(2) };
};
try {
  const rows = [];
  // E1: the stride thresholds (zoom within 0.0002 of each other, so scale is identical and only the mesh differs)
  for (const [lo, hi, name] of [[0.8499, 0.8501, 'stride 2 -> 1 at 0.85'], [0.4999, 0.5001, 'stride 4 -> 2 at 0.50'], [0.2799, 0.2801, 'stride 8 -> 4 at 0.28']]) {
    const [wx, wy] = SCEN.coast;
    await view(p, { z: lo, wx, wy }); const A = await pixels(p); await crop(p, `stride-${lo}`, { x: 200, y: 300, w: 1000, h: 700, mag: 1 });
    await view(p, { z: hi, wx, wy }); const B = await pixels(p); await crop(p, `stride-${hi}`, { x: 200, y: 300, w: 1000, h: 700, mag: 1 });
    rows.push(cmp(A, B, name));
  }
  // coverage of the land by transparent-canvas render at the two sides of each threshold
  const cov = await p.eval(`(()=>{ const w=pc.world; const res=[]; for(const z of [0.8499,0.8501,0.4999,0.5001,0.2799,0.2801]){ w.cam.z=z; w.clampCam(); w.camTo=null; w.draw(); const {cv,W,H,dpr,cam}=w; const oc=new OffscreenCanvas(cv.width,cv.height), g=oc.getContext('2d',{willReadFrequently:true}); g.setTransform(dpr*cam.z,0,0,dpr*cam.z,dpr*(W/2-cam.x*cam.z),dpr*(H/2-cam.y*cam.z)); w.drawGround(g,w.view,0); const d=g.getImageData(0,0,oc.width,oc.height).data; let n=0; for(let i=3;i<d.length;i+=4) if(d[i]>127) n++; res.push([z,n]); } return res; })()`);
  console.log('E1 land coverage px (alpha>0.5) either side of each threshold:', JSON.stringify(cov));
  // E2: ground cache: the frame drawn directly (camera just moved) vs the cached frame (camera still) must be the same pixels
  for (const [z, label] of [[0.9, 'cache pop at 0.9'], [2.4, 'cache pop at 2.4'], [0.5, 'cache pop at 0.5']]) {
    const [wx, wy] = SCEN.lockedA; await p.eval(`(()=>{const w=pc.world; w.focusZone(3,false); w.zoomBy(${z}/w.cam.z); w.cam.x+=37.3; w.cam.y+=11.7; w.clampCam(); w.camTo=null; w.gcSeen=0; w.gcValid=false; w.gcKey.fill(-1);})()`);
    await p.eval('pc.world.draw()'); const A = await pixels(p); // first frame at this camera: drawn directly
    await p.eval('pc.world.draw()'); const B = await pixels(p);  // second frame: through the cache
    rows.push(cmp(A, B, label));
  }
  console.table(rows);
} catch (e) { console.log('ERR', e.stack); } finally { app.close(); }
