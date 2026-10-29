// Raster quality measured on the real world in headless Chrome (T5, docs/RENDER_PLAN.md section 5): cracks, rigid pans, settling, memory.
//
//   PORT=8515 node scripts/world-raster.mjs [--base http://localhost:8515] [--cdp 9915] [--only cracks,pan,settle,memory] [--dsf 1,1.25,1.5,2] [--out raster.json]
//
//   cracks   the ground drawn at every zoom (0.13 to 2.4) and every density (1, 1.25, 1.5, 2): the gaps between opaque regions (js/world/seal.js countGaps: what a closing would fill) and the broader count of partial pixels
//            inside an opaque field (countCracks: it also finds the one-pixel tips of a wedge of sea between two coasts, which are geometry), in the ground as the OLD path drew it (straight onto a transparent surface: `direct`)
//            and in the chunks the world stamps now (`chunks`), summed over the window's cells. The gaps in the chunks must read 0.
//   pan      a camera that pans by a quarter of a device pixel a frame for 4 pixels, with the clock frozen and motion reduced: every frame must be the first frame moved by the whole pixels the camera's translation moved (the
//            ground, the sprites and the labels share one raster phase). `rigidShare` is the share of pixels (any channel off by more than 12 of 255) that are not; the old build's ground glides by sub-pixels while its sprites
//            tick by whole ones, so its share is high. Three scenes: the coast, a district at the working zoom, the finest zoom.
//   settle   the picture while a pan is in progress against the same camera at rest: the share of pixels that differ by more than 12 (the sealing of cracks, nothing else).
//   memory   canvas pixels the world holds after a walk through the scenes, by holder (the pixel ledger), at the density it is judged at (2): the ceiling is 160 MB.
//
// Exit code 1 when the build under test fails a hard gate (a crack in a chunk, a rigid share over 0.5%, a ledger over 160 MB); the numbers are printed either way. Pointing --base at a build without the chunk cache
// (the baseline) prints its numbers and skips the gates (`direct` is all it has).
import { writeFileSync } from 'node:fs';
import { countCracks, closeAlpha, OPAQUE } from '../js/world/seal.js';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[i + 1]); };
const BASE = String(arg('base', process.env.DIAG_BASE || 'http://localhost:8090')); process.env.DIAG_BASE = BASE; process.env.DIAG_CDP = String(arg('cdp', process.env.DIAG_CDP || 9333));
const ONLY = new Set(String(arg('only', 'cracks,pan,settle,memory')).split(',')), DSFS = String(arg('dsf', '1,1.25,1.5,2')).split(',').map(Number), OUT = arg('out', null);
const { boot, view, SCEN } = await import('./diag/lib.mjs'); // (after the environment is set: the harness reads its base and port when it loads)
const ZOOMS = [0.13, 0.3, 0.5, 0.9, 1.4, 2.4];
const result = { base: BASE, cracks: [], pan: [], settle: [], memory: null, verdict: 'pass', failed: [] };

const FREEZE = `(async()=>{ const w=pc.world; w.stop(); document.documentElement.dataset.motion='reduce'; const S=await import('/js/world/sprites.js'); S.setBuildBudget(1e9,6,100); if (S.setSpriteFade) S.setSpriteFade(0); w.gcBudget=[1e9,1e9]; w.gcRest=0; w.gcFade=0; w.t=w.vt=1.2e6; try { await import('/js/world/chunkcache.js'); return true; } catch { return false; } })()`; // (true: this build has the chunk cache)
const SETTLE = `(()=>{ const w=pc.world; for(let i=0;i<30;i++){ w.draw(); } return {chunks: !!(w.gc && w.gc.map), valid: w.gcValid}; })()`;
const CRACKS = `(async()=>{
  const OPAQUE = ${OPAQUE}, BLOCK = 16, countCracks = ${countCracks.toString()}, closeAlpha = ${closeAlpha.toString()}, countGaps = (d, w, h) => closeAlpha(Uint8ClampedArray.from(d), w, h, {}); // (the same function, shipped to the page: the build under test need not have it)
  const w=pc.world, {cv,W,H,dpr,cam}=w;
  // the old path: the ground drawn straight onto a transparent surface the size of the canvas
  // (the old path is the LEGACY ground, tile by tile: the V2 ground is a base painted per pixel into chunks and has no direct drawing, so the four ground layers are flagged legacy for this one drawing)
  const ST=await import('/js/world/stack.js').catch(()=>null), GL=['shore','terrain','roads','blocks'], was=ST?GL.map((id)=>ST.FLAGS[id]):[]; if (ST) GL.forEach((id)=>ST.setFlag(id,'legacy'));
  const oc=new OffscreenCanvas(cv.width,cv.height), g=oc.getContext('2d',{willReadFrequently:true}); w.toWorld(g); try { w.drawGround(g, w.view, 0); } finally { if (ST) GL.forEach((id,i)=>ST.setFlag(id,was[i])); }
  const id=g.getImageData(0,0,oc.width,oc.height); const direct=countCracks(id.data, oc.width, oc.height), directGaps=countGaps(id.data, oc.width, oc.height);
  let chunks=null, chunkGaps=null, cells=0; const gc=w.gc;
  if (gc && gc.map) { chunks=0; chunkGaps=0; for (const c of gc.map.values()) { if (c.empty || !c.img) continue; const t=new OffscreenCanvas(c.img.width||384,c.img.height||384), tg=t.getContext('2d',{willReadFrequently:true}); tg.drawImage(c.img,0,0); const d=tg.getImageData(0,0,t.width,t.height); chunks+=countCracks(d.data,t.width,t.height); chunkGaps+=countGaps(d.data,t.width,t.height); cells++; } }
  return { direct, directGaps, chunks, chunkGaps, cells, opaqueMpx:+(cv.width*cv.height/1e6).toFixed(2), dpr };
})()`;
/** In the page: draw k frames of a quarter-pixel pan and compare each with the first frame moved by the camera's own whole-pixel shift. */
const PAN = (steps) => `(()=>{
  const w=pc.world, cv=w.cv, g=cv.getContext('2d', {willReadFrequently:true}), N=cv.width, M=cv.height, dpr=w.dpr;
  const read=()=>{ w.draw(); w.draw(); return g.getImageData(0,0,N,M).data; };
  const x0=w.cam.x, y0=w.cam.y, a=w.cam.z*dpr, out=[]; const A=read(); const e0=Math.round(dpr*(w.W/2-w.cam.x*w.cam.z)), f0=Math.round(dpr*(w.H/2-w.cam.y*w.cam.z));
  for (let k=1;k<=${steps};k++) {
    const dx=0.25*k, dy=0.15*k; w.cam.x=x0-dx/a; w.cam.y=y0-dy/a; w.dirty=true; const B=read();
    const sx=Math.round(dpr*(w.W/2-w.cam.x*w.cam.z))-e0, sy=Math.round(dpr*(w.H/2-w.cam.y*w.cam.z))-f0;
    // B(x,y) should equal A(x - sx, y - sy), away from the borders (a margin for what scrolls in) and not under the screen-space layers that are fixed to the window (the map's minimap)
    let n=0,bad=0; const m=60;
    for (let y=m;y<M-m;y+=1) for (let x=m;x<N-m;x+=1) { const ax=x-sx, ay=y-sy; if (ax<0||ay<0||ax>=N||ay>=M) continue; const i=(y*N+x)*4, j=(ay*N+ax)*4; n++; const d=Math.max(Math.abs(B[i]-A[j]),Math.abs(B[i+1]-A[j+1]),Math.abs(B[i+2]-A[j+2])); if (d>12) bad++; }
    out.push({k, shift:[sx,sy], share:+(bad/n).toFixed(5)});
  }
  w.cam.x=x0; w.cam.y=y0; return out;
})()`;

const SETTLED = `(()=>{ const w=pc.world, cv=w.cv, g=cv.getContext('2d',{willReadFrequently:true}); w.gcBudget=[2,2]; w.gcRest=90;
  // a pan in progress: move the camera and draw once (cells the pan reveals are baked a few ms a frame, the rest stamped), then settle and compare
  const x0=w.cam.x; w.cam.x+=40/(w.cam.z); w.cam.y+=18/(w.cam.z); w.dirty=true; w.draw(); const A=g.getImageData(0,0,cv.width,cv.height).data;
  w.gcBudget=[1e9,1e9]; w.gcRest=0; for(let i=0;i<30;i++) w.draw(); const B=g.getImageData(0,0,cv.width,cv.height).data;
  let bad=0; for (let i=0;i<A.length;i+=4) if (Math.max(Math.abs(A[i]-B[i]),Math.abs(A[i+1]-B[i+1]),Math.abs(A[i+2]-B[i+2]))>12) bad++;
  return { share:+(bad/(A.length/4)).toFixed(5), valid:w.gcValid };
})()`;

const SCENES = [['coast 0.9', 'coast', 0.9], ['district 1.0', 'lockedA', 1.0], ['finest 2.4', 'finest', 2.4]];
const ledgerOf = `(async()=>{ const G=await import('/js/world/gfx.js'); pc.world.ledgerSync && pc.world.ledgerSync(); return { total:+(G.ledger.total()/1e6).toFixed(1), entries:G.ledger.entries().map(([n,b])=>[n,+(b/1e6).toFixed(1)]) }; })()`;

for (const dsf of DSFS) {
  const app = await boot({ dsf, gpu: true }); const { p } = app;
  try {
    const hasChunks = await p.eval(FREEZE);
    if (ONLY.has('cracks')) for (const z of ZOOMS) for (const sc of ['coast', 'lockedA']) {
      if (z < 0.5 && sc === 'coast') continue;
      const [wx, wy] = SCEN[sc]; await view(p, { z, wx, wy }); await p.eval(SETTLE);
      const r = await p.eval(CRACKS); result.cracks.push({ dsf, zoom: z, scene: sc, ...r });
      if (r.chunkGaps) { result.failed.push(`cracks: ${r.chunkGaps} gaps left in the chunks at dsf ${dsf}, zoom ${z}, ${sc}`); }
    }
    if (ONLY.has('pan') && (dsf === 2 || dsf === 1.5)) for (const [label, sc, z] of SCENES) {
      const [wx, wy] = SCEN[sc]; await view(p, { z, wx, wy }); await p.eval(SETTLE);
      const r = await p.eval(PAN(16)), mean = r.reduce((s, q) => s + q.share, 0) / r.length, worst = Math.max(...r.map((q) => q.share));
      result.pan.push({ dsf, scene: label, rigidShare: +mean.toFixed(5), worst: +worst.toFixed(5), steps: r.length });
      if (hasChunks && mean > 0.005) result.failed.push(`pan: ${(mean * 100).toFixed(2)}% of the pixels are not rigid at dsf ${dsf}, ${label}`);
    }
    if (ONLY.has('settle') && dsf === 2 && hasChunks) for (const [label, sc, z] of SCENES) {
      const [wx, wy] = SCEN[sc]; await view(p, { z, wx, wy }); await p.eval(SETTLE); const r = await p.eval(SETTLED); result.settle.push({ dsf, scene: label, ...r });
    }
    if (ONLY.has('memory') && dsf === 2) {
      for (const [, sc, z] of SCENES) { const [wx, wy] = SCEN[sc]; await view(p, { z, wx, wy }); await p.eval(SETTLE); }
      result.memory = await p.eval(ledgerOf); if (result.memory.total > 160) result.failed.push(`memory: ${result.memory.total} MB held at dsf 2`);
    }
  } finally { app.close(); await new Promise((r) => setTimeout(r, 1200)); }
}
if (result.failed.length) result.verdict = 'FAIL';
const sum = (rows, k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
result.summary = { cracksDirect: sum(result.cracks, 'direct'), gapsDirect: sum(result.cracks, 'directGaps'), cracksChunks: result.cracks.some((r) => r.chunks != null) ? sum(result.cracks, 'chunks') : null, gapsChunks: result.cracks.some((r) => r.chunkGaps != null) ? sum(result.cracks, 'chunkGaps') : null, panRigidShareMean: result.pan.length ? +(sum(result.pan, 'rigidShare') / result.pan.length).toFixed(5) : null, memoryMb: result.memory?.total ?? null };
console.log(JSON.stringify(result, null, 1));
if (OUT && OUT !== true) writeFileSync(String(OUT), JSON.stringify(result, null, 1) + '\n');
process.exit(result.failed.length ? 1 : 0);
