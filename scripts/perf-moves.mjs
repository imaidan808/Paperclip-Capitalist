// node scripts/perf-moves.mjs '{"base":"http://localhost:8801/Paperclip-Capitalist","cpu":4}'
// How fast the ground comes back sharp after the camera moves, and what the frames are like while it does. The player's window (1512 x 860 css pixels at 2x), the town at rest, then a four-notch zoom out, glides to three
// districts and a three-notch zoom in, with every frame the world draws recorded (its own draw is wrapped: the time between two draws and what a draw cost, not the page's requestAnimationFrame ticks, which say nothing
// about frames the world skipped). One block a move:
//   rest -> whole   ms from the last frame the camera moved to the first frame from which the exact ground is whole and stays so (`>` the window of the move when it is not whole by then): until then the picture is a
//                   mosaic of exact chunks and the soft stand-ins under them (`soft` frames are the drawn ones in which part of the window was not exact)
//   frames          the frames the world drew from the first input until the ground was whole (or the window ended): how many, the gap between two of them (p50, p95, max) and what a draw cost
//   bakes           chunks baked in that time and what they cost on the main thread (`ms` is the world's own timer round the bake)
//   governor        the highest tier the quality governor reached and the lowest canvas density it drew at
// With `holes`, `gcHoles` (pieces of the window that nothing covers) is counted too.
//
//   node scripts/stage.mjs _site --serve --port 8801        serve the staged site as Pages does, or point `base` at the real one
//   options (JSON, all optional): base, w 1512, h 860, dsf 2, cpu 1 (the CPU slowdown: 4 is the budget laptop of docs/RENDER_PLAN.md), port 9760, only '' (a word of the move's name), shots '' (a path prefix: the world's own canvas, copied in the frame at `at` ms
//   (default 150, 400, 800, 1400, 2200 and 3500) into each move, is saved there as a jpg, which costs the frame it is taken in: the numbers of that run are not to be read), json false (one JSON line per move)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { open } from './cdp.mjs';
import { findChrome, chromeReady } from './chrome.mjs';

const o = { base: 'http://localhost:8801/Paperclip-Capitalist', w: 1512, h: 860, dsf: 2, cpu: 1, port: 9760, only: '', shots: '', json: false, settle: 5000, at: [150, 400, 800, 1400, 2200, 3500], ...JSON.parse(process.argv[2] || '{}') };
const dir = mkdtempSync(tmpdir() + '/pl-moves-');
const proc = spawn(findChrome(), ['--headless=new', '--hide-scrollbars', '--no-first-run', '--mute-audio', `--remote-debugging-port=${o.port}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const r0 = (x) => Math.round(x);

try {
  await chromeReady(proc, o.port);
  const slot = 'pm' + (Date.now() % 1e6);
  const p = await open({ port: o.port }, `${o.base}/?slot=${slot}`, { w: o.w, h: o.h, dsf: o.dsf });
  await p.sleep(1200);
  await p.eval(`localStorage.setItem('pc.academyDone.${slot}', 'true')`);
  // In the page: the title, the draft, Begin, and then the ground made and left to settle; the recorder wraps the world's own draw.
  await p.eval(`(async () => { const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const until = async (f, w) => { for (let i = 0; i < 1500; i++) { const v = f(); if (v) return v; await wait(20); } throw new Error('timed out: ' + w); };
    (await until(() => document.querySelector('button[data-act="solo"]'), 'title')).click(); await until(() => document.querySelector('input[type=checkbox]'), 'draft');
    const cbs = [...document.querySelectorAll('input[type=checkbox]')]; cbs[0].click(); cbs[1].click(); await wait(300);
    [...document.querySelectorAll('button')].find((b) => /^Begin/i.test(b.textContent.trim())).click();
    await until(() => window.pc && pc.world && pc.world.gcValid, 'the ground'); await wait(${o.settle});
    const w = pc.world, od = w.draw.bind(w), R = window.__mv = { on: false, f: [], t0: 0, jobs: [], snaps: [] }; let cx = NaN, cy = NaN, cz = NaN, cc = null;
    w.draw = function () { const t = performance.now(); od(); if (!R.on) return; if (R.jobs.length && t - R.t0 >= R.jobs[0]) { const at = R.jobs.shift(); cc = cc || document.createElement('canvas'); cc.width = w.cv.width; cc.height = w.cv.height; cc.getContext('2d').drawImage(w.cv, 0, 0); R.snaps.push([at, cc.toDataURL('image/jpeg', 0.9)]); } const moved = cx !== w.cam.x || cy !== w.cam.y || cz !== w.cam.z; cx = w.cam.x; cy = w.cam.y; cz = w.cam.z; R.f.push([t, performance.now() - t, moved ? 1 : 0, w.gcValid ? 1 : 0, w.gcHoles | 0, w.slow, w.dpr, w.gc ? w.gc.stats.baked : 0, w.gc ? w.gc.stats.ms : 0]); }; })()`);
  if (o.cpu > 1) await p.send('Emulation.setCPUThrottlingRate', { rate: o.cpu });
  const wheel = (dy) => p.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: o.w / 2, y: o.h / 2, deltaX: 0, deltaY: dy });
  const go = (gx, gy, gz, z) => p.eval(`pc.world.goTo((${gx} - ${gy}) * 32, (${gx} + ${gy}) * 16 - ${gz}, ${z}, true)`);
  const moves = [
    ['zoom out x4', async () => { for (let i = 0; i < 4; i++) { await wheel(100); await p.sleep(600); } }, 9000],
    ['glide to district 9', async () => { await go(116, 46, 46, 1); }, 9000],
    ['glide to district 3', async () => { await go(87, 112, 10, 1); }, 9000],
    ['zoom in x3', async () => { for (let i = 0; i < 3; i++) { await wheel(-100); await p.sleep(500); } }, 8000],
    ['glide to district 13', async () => { await go(50, 22, 84, 0.8); }, 9000],
  ];
  let n = 0;
  for (const [name, run, ms] of moves) {
    if (o.only && !name.includes(o.only)) continue;
    await p.eval(`window.__mv.f.length = 0; window.__mv.snaps.length = 0; window.__mv.jobs = ${JSON.stringify(o.shots ? o.at : [])}; window.__mv.t0 = performance.now(); window.__mv.on = true`);
    const t0 = Date.now(); await run();
    const left = ms - (Date.now() - t0); if (left > 0) await p.sleep(left);
    const f = await p.eval(`(window.__mv.on = false, window.__mv.f.slice())`); n++;
    if (o.shots) for (const [at, url] of await p.eval(`window.__mv.snaps.slice()`)) writeFileSync(`${o.shots}-${n}-${String(at).padStart(4, '0')}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
    if (f.length < 3) { console.log(`${name}: no frames`); continue; }
    let lastMoved = 0; for (let i = 0; i < f.length; i++) if (f[i][2]) lastMoved = i;
    let whole = -1; for (let i = f.length - 1; i > lastMoved; i--) { if (!f[i][3]) break; whole = i; } // the first frame of the run of whole frames that ends the window
    const end = whole < 0 ? f.length - 1 : whole, span = f.slice(0, end + 1), gaps = span.slice(1).map((r, i) => r[0] - span[i][0]), cost = span.map((r) => r[1]);
    const restMs = whole < 0 ? '>' + r0(f[f.length - 1][0] - f[lastMoved][0]) : String(r0(f[whole][0] - f[lastMoved][0]));
    const soft = span.filter((r) => !r[3]).length, bakes = f[end][7] - f[0][7], bakeMs = f[end][8] - f[0][8], tier = Math.max(...span.map((r) => r[5])), dpr = Math.min(...span.map((r) => r[6])), holes = span.filter((r) => r[4] > 0).length;
    const row = { move: name, restToWholeMs: restMs, movedMs: r0(f[lastMoved][0] - f[0][0]), frames: span.length, soft, gapP50: r0(q(gaps, 0.5)), gapP95: r0(q(gaps, 0.95)), gapMax: r0(Math.max(0, ...gaps)), costP50: +q(cost, 0.5).toFixed(1), costP95: +q(cost, 0.95).toFixed(1), costMax: r0(Math.max(0, ...cost)), bakes, bakeMs: r0(bakeMs), tierMax: tier, dprMin: dpr, holeFrames: holes };
    if (o.json) { console.log(JSON.stringify(row)); continue; }
    console.log(`${name.padEnd(22)} rest -> whole ${restMs.padStart(6)} ms   (the camera moved for ${row.movedMs} ms)`);
    console.log(`${''.padEnd(22)} frames ${String(row.frames).padStart(4)} (${soft} soft): gap p50 ${row.gapP50} p95 ${row.gapP95} max ${row.gapMax} ms, draw p50 ${row.costP50} p95 ${row.costP95} max ${row.costMax} ms${holes ? `, ${holes} with holes` : ''}`);
    console.log(`${''.padEnd(22)} bakes ${bakes} costing ${row.bakeMs} ms (${bakes ? r0(bakeMs / bakes) : 0} each); governor: tier up to ${tier}, density down to ${dpr}`);
    const worst = span.map((r, i) => [r[1], i ? r[8] - span[i - 1][8] : 0, i ? r[7] - span[i - 1][7] : 0]).sort((a, b) => b[0] - a[0]).slice(0, 3); // (the dearest draws: what they cost, how much of it was chunks, how many chunks)
    console.log(`${''.padEnd(22)} dearest draws: ${worst.map(([c, b, k]) => `${r0(c)} ms (${r0(b)} in ${k} chunks)`).join(', ')}`);
  }
} finally { try { proc.kill('SIGKILL'); } catch {} setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} }, 700); }
