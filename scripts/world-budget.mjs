// The frame budget as a command: time the world at the plan's budget scenes by the plan's one method, and say which are over their ceiling (docs/RENDER_PLAN.md section 6, the render-budget block).
//
//   PORT=8781 node server/static.mjs &                                  (serve the worktree you are judging)
//   DIAG_BASE=http://localhost:8781 DIAG_CDP=9781 node scripts/world-budget.mjs [options]
//
// The method (the contract, one only): headless Chrome with --disable-gpu (the software raster of scripts/cdp.mjs, the stricter machine), a 1440 x 900 window at device scale 2, a real game started through the
// draft screen at day 0 (`--days 60` for the late game), `pc.world` as the handle, the world's own frame loop stopped; the camera set by the scene, three draws to settle and the sprites built; then the median of
// `--draws` (120) timed draws, each followed by a one-pixel readback of the canvas so the raster is counted (without it a draw reads 0.4 to 3.4 ms and means nothing). "Still" is a camera that does not move (the
// ground cache is valid); "moving" adds `cam.x += 0.7` before every draw (the ground is drawn directly: what a pan costs). The canvas density is the world's own choice, 1.5 on a CPU-drawn canvas (what
// `softwareRaster()` says), which is what the ceilings are in. `--canvas-dpr 2` pins it to 2 instead (what a GPU Mac draws): the SAME scenes read about 1.8 times dearer, so never compare that to a ceiling.
// Judge pictures at dsf 2 (scripts/world-shots.mjs pins 2); judge milliseconds here.
//
// Options: --scene id,id (default: all)  --days 0|60  --draws 120  --canvas-dpr app|2  --check (exit 1 when a median is over its ceiling, 2 when a scene could not be timed)  --json FILE  --verbose
// What it prints: one row per scene: still and moving medians, the ceiling from the block (1.25 x the baseline measured the same way, same session, noise about 10%), and OVER or ok. `--baseline` prints rows for
// the block instead of checking: run it on the commit the ceilings are relative to (adcd991 for the art work) in the same session as the build you judge, and compare the two columns.
import { readFileSync, writeFileSync } from 'node:fs';
import { boot, view, SCEN } from './diag/lib.mjs';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[i + 1]); };
const DOC = readFileSync(new URL('../docs/RENDER_PLAN.md', import.meta.url), 'utf8');
const BLOCK = JSON.parse(DOC.match(/<!-- render-budget -->\s*```json\n([\s\S]*?)\n```/)[1]);
const O = { scene: arg('scene', null), days: +arg('days', 0), draws: +arg('draws', 120), dpr: String(arg('canvas-dpr', 'app')), check: !!arg('check', false), baseline: !!arg('baseline', false), json: arg('json', null), verbose: !!arg('verbose', false) };
const scenes = BLOCK.scenes.filter((s) => !O.scene || String(O.scene).split(',').includes(s.id));
if (!scenes.length) { console.error('no such scene; the block has: ' + BLOCK.scenes.map((s) => s.id).join(', ')); process.exit(2); }

/** Where a scene's camera stands: the plan names a district to focus, a named place from the diagnosis, or the fit view. */
const camera = (s) => (s.at === 'fit' ? { fit: true, z: s.zoom } : s.at.startsWith('zone:') ? { zone: +s.at.slice(5), z: s.zoom } : { wx: SCEN[s.at][0], wy: SCEN[s.at][1], z: s.zoom });

const app = await boot({ dsf: 2, gpu: false, days: O.days });
const { p } = app, rows = [];
let failed = false, over = false;
try {
  await p.eval(`(async()=>{ const S = await import('/js/world/sprites.js'); window.__S = S; })()`);
  if (O.dpr === '2') await p.eval('(()=>{ const w = pc.world; w.targetDpr = () => 2; w.resize(); })()');
  const info = await p.eval('JSON.stringify({ dpr: pc.world.dpr, canvas: [pc.world.cv.width, pc.world.cv.height], unlocked: [...(pc.world.unlocked || [])] })');
  console.log(`method: software raster, window 1440 x 900 at dsf 2, ${O.days ? 'day ' + O.days : 'day 0'}, ${O.draws} draws, density ${O.dpr === '2' ? 'pinned to 2' : 'the world\'s own'}: ${info}`);
  for (const s of scenes) {
    try {
      await view(p, camera(s));
      // let the sprites build: real time has to pass after the zoom stops (90 ms) and building is a few milliseconds a frame
      await p.eval(`(async()=>{ let last=-1, same=0; for(let i=0;i<400 && same<12;i++){ pc.world.draw(); await new Promise(r=>setTimeout(r,25)); const b=__S.stats.builds; if(b===last) same++; else {same=0; last=b;} } })()`);
      const r = {};
      for (const mode of ['still', 'moving']) {
        r[mode] = await p.eval(`(()=>{ const w=pc.world, g=w.ctx, x0=w.cam.x, N=${O.draws}, t=[]; for(let i=0;i<3;i++) w.draw(); for(let i=0;i<N;i++){ ${mode === 'moving' ? 'w.cam.x = x0 + (i + 1) * 0.7;' : ''} const a=performance.now(); w.draw(); g.getImageData(0,0,1,1); t.push(performance.now()-a);} w.cam.x=x0; t.sort((a,b)=>a-b); return { median:+t[N>>1].toFixed(2), p10:+t[Math.floor(N*0.1)].toFixed(2), p90:+t[Math.floor(N*0.9)].toFixed(2) }; })()`);
      }
      const row = { id: s.id, zoom: s.zoom, still: r.still.median, moving: r.moving.median, ceilingStill: s.ceiling?.[0] ?? null, ceilingMoving: s.ceiling?.[1] ?? null, baselineStill: s.baseline?.[0] ?? null, baselineMoving: s.baseline?.[1] ?? null, spread: [r.still.p10, r.still.p90] };
      row.verdict = O.baseline ? '' : (row.ceilingStill != null && row.still > row.ceilingStill) || (row.ceilingMoving != null && row.moving > row.ceilingMoving) ? 'OVER' : 'ok';
      if (row.verdict === 'OVER') over = true;
      rows.push(row);
    } catch (e) { failed = true; rows.push({ id: s.id, error: String(e.message || e) }); }
  }
  console.table(rows.map((r) => (r.error ? { id: r.id, error: r.error } : { scene: r.id, zoom: r.zoom, still: r.still, moving: r.moving, 'ceiling still': r.ceilingStill, 'ceiling moving': r.ceilingMoving, 'baseline still': r.baselineStill, 'baseline moving': r.baselineMoving, verdict: r.verdict })));
  if (O.baseline) console.log('rows for the block:\n' + rows.filter((r) => !r.error).map((r) => `    { "id": ${JSON.stringify(r.id)}, "baseline": [${r.still}, ${r.moving}] }`).join(',\n'));
  if (O.json) writeFileSync(String(O.json), JSON.stringify({ options: O, rows }, null, 1));
} catch (e) { console.error('ERR', e.stack); failed = true; } finally { app.close(); }
process.exit(failed ? 2 : O.check && over ? 1 : 0);
