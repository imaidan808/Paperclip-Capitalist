// Shared harness for the render diagnostics (docs/RENDER_DIAGNOSIS.md): boot the real app in headless Chrome, start a game, freeze the world's own loop, and hand back helpers.
// Environment: DIAG_BASE (server, default http://localhost:8090), DIAG_CDP (Chrome debugging port, default 9333), DIAG_OUT (where pictures go, default <tmp>/render-diag).
// gpu:false is scripts/cdp.mjs's own Chrome (--disable-gpu: software raster, the scripts/perf.mjs baseline, and the world caps its pixel density at 1.5 there);
// gpu:true leaves the GPU on, which is what a real Mac browser has (the canvas then gets the full density, 2 at dsf 2).
import { newGame, draw } from '../boot.mjs';
import { open } from '../cdp.mjs';
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

export const BASE = process.env.DIAG_BASE || 'http://localhost:8090';
export const CDP = +(process.env.DIAG_CDP || 9333);
export const OUT = process.env.DIAG_OUT || tmpdir() + '/render-diag';
mkdirSync(OUT, { recursive: true });
const CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launchChrome(port, gpu) {
  const dir = mkdtempSync(tmpdir() + '/pl-chrome-');
  const args = ['--headless=new', '--hide-scrollbars', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank'];
  if (!gpu) args.splice(1, 0, '--disable-gpu');
  const proc = spawn(CH, args, { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) break; } catch {} await sleep(150); }
  return { port, pid: proc.pid, close: () => { // the browser's helpers outlive it: end every process of this one profile, by PID (never pkill)
    try { proc.kill('SIGKILL'); } catch {}
    try { for (const id of execSync(`pgrep -f ${dir}`, { encoding: 'utf8' }).split('\n').filter(Boolean)) { try { process.kill(+id, 'SIGKILL'); } catch {} } } catch {}
    setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} }, 700); } };
}
export async function boot({ dsf = 2, w = 1440, h = 900, days = 0, gpu = false } = {}) {
  const b = await launchChrome(CDP, gpu);
  const slot = 'shot' + (Date.now() % 1e6);
  const p = await open(b, `${BASE}/?slot=${slot}`, { w, h, dsf });
  await p.eval(`localStorage.setItem('pc.academyDone.${slot}', 'true')`);
  await newGame(p, { perks: 'trades,pro', days });
  await p.eval('pc.world.stop()'); // a picture is exactly what draw() paints: the loop would advance the clock under us
  return { b, p, close: () => b.close() };
}
/** Camera: focus a district (or fit), set the zoom, then optionally an exact world point and an offset in css px; draw twice (the ground cache arms on the second). */
export async function view(p, { zone = 1, z = 0.9, dx = 0, dy = 0, fit = false, wx, wy } = {}) {
  await p.eval(`(()=>{const w=pc.world; ${fit ? 'w.fit(false);' : `w.focusZone(${zone},false);`} w.zoomBy(${z}/w.cam.z); ${wx !== undefined ? `w.cam.x=${wx}; w.cam.y=${wy};` : ''} w.cam.x+=${dx}/w.cam.z; w.cam.y+=${dy}/w.cam.z; w.clampCam(); w.camTo=null; w.dirty=true;})()`);
  await p.eval('pc.world.draw()'); await p.eval('pc.world.draw()');
}
/** A region of the world canvas (device pixels, no HTML overlay), magnified by an integer with nearest-neighbour, saved as a PNG under OUT. */
export async function crop(p, name, { x = 0, y = 0, w = 400, h = 300, mag = 1 } = {}) {
  const url = await p.eval(`(()=>{const cv=pc.world.cv; const o=document.createElement('canvas'); o.width=${w}*${mag}; o.height=${h}*${mag}; const g=o.getContext('2d'); g.imageSmoothingEnabled=false; g.drawImage(cv, ${x}, ${y}, ${w}, ${h}, 0, 0, ${w}*${mag}, ${h}*${mag}); return o.toDataURL('image/png');})()`);
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(url.split(',')[1], 'base64')); return `${OUT}/${name}.png`;
}
/** The world canvas (or a region of it) as raw RGBA bytes in device pixels: { w, h, data }. */
export async function pixels(p, r = { x: 0, y: 0, w: 0, h: 0 }) {
  const j = await p.eval(`(()=>{const cv=pc.world.cv; const g=cv.getContext('2d'); const R=${JSON.stringify(r)}; const w=R.w||cv.width, h=R.h||cv.height; const a=g.getImageData(R.x,R.y,w,h).data; const parts=[]; for(let i=0;i<a.length;i+=8192) parts.push(String.fromCharCode.apply(null,a.subarray(i,i+8192))); return {w,h,b64:btoa(parts.join(''))};})()`);
  return { w: j.w, h: j.h, data: Buffer.from(j.b64, 'base64') };
}
/** Camera places the diagnosis used: world points in the island's own pixels. */
export const SCEN = { coast: [-3644, 2213], sea: [710.66, 2587], lockedA: [-800, 3154], lockedB: [1408, 1910], finest: [-2684, 2133], fit: [710.66, 2467.4] };
export const ZOOMS = [0.13, 0.3, 0.5, 0.9, 1.4, 2.4];
export { draw, sleep };
/** The whole world canvas, scaled to at most maxW wide, saved as a PNG under OUT. */
export async function full(p, name, maxW = 1600) {
  const url = await p.eval(`(()=>{const cv=pc.world.cv; const k=Math.min(1, ${maxW}/cv.width); const o=document.createElement('canvas'); o.width=Math.round(cv.width*k); o.height=Math.round(cv.height*k); const g=o.getContext('2d'); g.imageSmoothingQuality='high'; g.drawImage(cv,0,0,o.width,o.height); return o.toDataURL('image/png');})()`);
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
}
