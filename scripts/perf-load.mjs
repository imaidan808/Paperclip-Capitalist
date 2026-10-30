// node scripts/perf-load.mjs '{"base":"http://localhost:8791/Paperclip-Capitalist","cpu":4,"idle":6000}'
// The load of the world as a player meets it, on a machine as slow as you say. Opens the page in headless Chrome, takes the title, the draft and Begin (pressed `idle` ms into the draft, as a player who reads for that long
// would), then watches the world for `observe` ms and prints: the milestones (the world object, the first frame, the ground fully baked), the long tasks, the worst gaps between frames, every change of the quality
// governor (tier, fps, lite, canvas density) and whether a buyer was ever missing from a frame in between. `profile` adds a CPU profile of the first two seconds after Begin (self time, then who called it).
//
//   node scripts/stage.mjs _site --serve --port 8791        serve the staged site as Pages does (its address is http://localhost:8791/Paperclip-Capitalist), or point `base` at the real one
//   options (JSON, all optional): base, w 1024, h 768, dsf 2, mode "gpu" (the machine's own GPU) or "soft" (--disable-gpu, the software raster of the test rig), cpu 1 (slow the page's CPU that many times:
//   4 is an ordinary student laptop beside an M-series Mac, 6 a poor one), idle 1500, observe 12000, perks 2, profile false, port 9478, json false
//
// Why the CPU is slowed. The frame budget (scripts/world-budget.mjs) is judged on a software raster, which is a slow machine for the canvas and a fast one for JavaScript; a Mac with the GPU on is fast at both and
// shows nothing. The governor's flapping, the load that blocked the page for seconds and the half second of the island's static scene were all invisible at 1x and plain at 4x.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { open } from './cdp.mjs';
import { findChrome, chromeReady } from './chrome.mjs';

const o = { base: 'http://localhost:8791/Paperclip-Capitalist', w: 1024, h: 768, dsf: 2, mode: 'gpu', cpu: 1, idle: 1500, observe: 12000, perks: 2, profile: false, port: 9478, json: false, ...JSON.parse(process.argv[2] || '{}') };
const dir = mkdtempSync(tmpdir() + '/pl-perf-');
const proc = spawn(findChrome(), ['--headless=new', ...(o.mode === 'soft' ? ['--disable-gpu'] : []), '--hide-scrollbars', '--no-first-run', '--mute-audio', `--remote-debugging-port=${o.port}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const done = () => { try { proc.kill('SIGKILL'); } catch { /* gone */ } setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } }, 700); };

// In the page: the title, the draft; stops at the Begin button.
const toDraft = async ({ perks, idle }) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (f, what) => { for (let i = 0; i < 600; i++) { const v = f(); if (v) return v; await wait(25); } throw new Error('timed out: ' + what); };
  (await until(() => document.querySelector('button[data-act="solo"]'), 'the title screen')).click();
  await until(() => document.querySelector('input[type=checkbox]'), 'the draft');
  const cbs = [...document.querySelectorAll('input[type=checkbox]')]; for (let i = 0; i < perks; i++) cbs[i].click(); await wait(200);
  await until(() => [...document.querySelectorAll('button')].find((b) => /^Begin/i.test(b.textContent.trim())), 'the Begin button');
  await wait(idle); // the player reads the draft: the page is idle meanwhile (the prefetch of the rest of the modules, and the island's scene)
};
// In the page: press Begin and watch.
const begin = async ({ observe }) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { ev: [] }; let T0 = performance.now(); const mark = (n) => out.ev.push([n, Math.round(performance.now() - T0)]);
  const longs = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push([Math.round(e.startTime - T0), Math.round(e.duration)]); }).observe({ entryTypes: ['longtask'] }); } catch { /* no long-task timing */ }
  const gaps = []; let last = 0, run = true; const f = (t) => { if (last) gaps.push([Math.round(t - T0), +(t - last).toFixed(1)]); last = t; if (run) requestAnimationFrame(f); }; requestAnimationFrame(f);
  const btn = [...document.querySelectorAll('button')].find((b) => /^Begin/i.test(b.textContent.trim()));
  T0 = performance.now(); out.ev.push(['Begin pressed', 0]); btn.click();
  const until = async (fn, what, ms = 30000) => { const t = performance.now(); while (performance.now() - t < ms) { const v = fn(); if (v) return v; await wait(10); } out.ev.push(['NEVER: ' + what, Math.round(performance.now() - T0)]); return false; };
  if (await until(() => window.pc && pc.S && pc.S.game, 'the game')) mark('game created');
  if (await until(() => pc.world, 'the world object')) mark('world object exists');
  if (await until(() => pc.world.t > 0, 'a first frame')) mark('first world frame');
  const w = pc.world;
  // what the figures do frame by frame: which buyers are drawn in which frames, and every change of the governor
  let frameNo = 0; const drawn = new Map();
  const od = w.draw.bind(w); w.draw = function () { frameNo++; return od(); };
  const oe = w.drawEnt.bind(w); w.drawEnt = function (ctx, e) { if (e.type === 'lead') { let a = drawn.get(e.id); if (!a) drawn.set(e.id, a = []); a.push(frameNo); } return oe(ctx, e); };
  const tiers = [], t1 = performance.now(); let valid = false, lastKey = '';
  while (performance.now() - t1 < observe) {
    const key = w.slow + '/' + (w.lite ? 1 : 0) + '/' + w.fps + '/' + w.dpr.toFixed(2);
    if (key !== lastKey) { lastKey = key; tiers.push([Math.round(performance.now() - T0), frameNo, w.slow, w.fps, w.lite ? 1 : 0, +w.dpr.toFixed(2)]); }
    if (w.gcValid && !valid) { valid = true; mark('ground fully baked'); }
    await wait(10);
  }
  run = false;
  const flick = []; for (const [id, fr] of drawn) { let miss = 0; for (let i = 1; i < fr.length; i++) if (fr[i] - fr[i - 1] > 1) miss += fr[i] - fr[i - 1] - 1; if (miss) flick.push({ id: String(id).slice(0, 14), missingFrames: miss }); }
  out.tiers = tiers; out.canvas = [w.cv.width, w.cv.height]; out.frames = gaps.length; out.over50 = gaps.filter((g) => g[1] > 50).length;
  out.worst = [...gaps].sort((a, b) => b[1] - a[1]).slice(0, 6); out.longtasks = longs.filter((l) => l[1] >= 50).slice(0, 24); out.blockedMs = longs.reduce((s, l) => s + l[1], 0);
  out.buyers = drawn.size; out.buyersMissingFrames = flick;
  out.marks = performance.getEntriesByType('mark').filter((m) => m.name.startsWith('pc:')).map((m) => [m.name, Math.round(m.startTime - T0)]);
  return out;
};

try {
  await chromeReady(proc, o.port);
  const slot = 'perf' + (Date.now() % 1e6);
  const p = await open({ port: o.port }, `${o.base}/?slot=${slot}`, { w: o.w, h: o.h, dsf: o.dsf });
  await p.eval(`localStorage.setItem('pc.academyDone.${slot}', 'true')`); // no Academy between the draft and the world
  const nav = await p.eval(`(() => { const n = performance.getEntriesByType('navigation')[0] || {}, paint = Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, Math.round(e.startTime)])); return { domContentLoaded: Math.round(n.domContentLoadedEventEnd || 0), load: Math.round(n.loadEventEnd || 0), firstContentfulPaint: paint['first-contentful-paint'] }; })()`);
  if (o.cpu > 1) await p.send('Emulation.setCPUThrottlingRate', { rate: o.cpu });
  await p.eval(`(${toDraft})(${JSON.stringify({ perks: o.perks, idle: o.idle })})`);
  if (o.profile) { await p.send('Profiler.enable'); await p.send('Profiler.setSamplingInterval', { interval: 250 }); await p.send('Profiler.start'); }
  const r = await p.eval(`(${begin})(${JSON.stringify({ observe: o.observe })})`);
  const prof = o.profile ? (await p.send('Profiler.stop')).profile : null;
  if (o.json) { console.log(JSON.stringify({ options: o, title: nav, result: r })); } else {
    const line = (k, v) => console.log(k.padEnd(24) + v);
    console.log(`${o.base}  ${o.w}x${o.h} at ${o.dsf}x, ${o.mode}, CPU slowed ${o.cpu}x, Begin pressed ${o.idle} ms into the draft`);
    line('title screen', `DOMContentLoaded ${nav.domContentLoaded} ms, first contentful paint ${nav.firstContentfulPaint} ms`);
    line('milestones (ms)', r.ev.map(([n, ms]) => `${n} ${ms}`).join(' | '));
    line('scene built (marks)', r.marks.map(([n, ms]) => `${n} at ${ms}`).join(' | ') + '  (negative: before Begin)');
    line('main thread blocked', `${r.blockedMs} ms in long tasks; the longest: ${r.longtasks.slice().sort((a, b) => b[1] - a[1]).slice(0, 4).map(([at, d]) => `${d} ms at ${at}`).join(', ')}`);
    line('frame gaps', `${r.frames} frames, ${r.over50} over 50 ms; worst ${r.worst.slice(0, 4).map(([at, g]) => `${g} ms at ${at}`).join(', ')}`);
    line('governor changes', `${r.tiers.length} (ms, frame, tier, fps, lite, density): ${r.tiers.slice(0, 8).map((t) => `[${t.join(' ')}]`).join(' ')}${r.tiers.length > 8 ? ' ...' : ''}`);
    line('buyers', `${r.buyers} drawn; ${r.buyersMissingFrames.length ? 'MISSING FROM FRAMES: ' + JSON.stringify(r.buyersMissingFrames) : 'none was ever missing from a frame'}`);
  }
  if (prof) {
    const nodes = new Map(prof.nodes.map((n) => [n.id, n])), parent = new Map();
    for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);
    const keyOf = (n) => { const cf = n.callFrame; return (cf.functionName || '(anon)') + ' ' + (cf.url ? cf.url.split('/').slice(-2).join('/') : '(native)') + ':' + (cf.lineNumber + 1); };
    const self = new Map(), incl = new Map(); let t = 0, total = 0;
    for (let i = 0; i < prof.samples.length; i++) {
      const dt = (prof.timeDeltas[i] || 0) / 1000, t0 = t; t += dt; if (t0 >= 2000) continue; total += dt;
      const id = prof.samples[i], k = keyOf(nodes.get(id)); self.set(k, (self.get(k) || 0) + dt);
      const seen = new Set(); for (let q = id; q != null; q = parent.get(q)) { const kk = keyOf(nodes.get(q)); if (!seen.has(kk)) { seen.add(kk); incl.set(kk, (incl.get(kk) || 0) + dt); } }
    }
    const top = (m, n) => [...m].filter(([k]) => !/^\(idle\)|^\(root\)|^\(program\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(0).padStart(6)} ms  ${k}`).join('\n');
    console.log(`\nCPU profile of the first 2000 ms after Begin (${total.toFixed(0)} ms sampled, idle included)\n--- self time\n${top(self, 20)}\n--- including what each calls\n${top(incl, 20)}`);
  }
} finally { done(); }
