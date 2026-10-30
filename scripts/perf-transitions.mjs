// node scripts/perf-transitions.mjs '{"base":"http://localhost:8791/Paperclip-Capitalist","cpu":4}'
// The three things that make the picture change while a player watches, frame by frame: ZOOMING (four mouse notches in, four out), TIME PASSING (the clock at 8x for 14 s, across the light changing) and a MAP UPDATE (a
// district opens). For each, from the page's own frames: the gap between frames (the median, the worst, how many were over 50 and over 100 ms), how many frames filled a cache (ground chunks, sprites, atlas entries) and
// how much of that was the ground's bake, the quality governor's tiers it went through, and how much of the picture changed from one frame to the next (a 64 x 48 look at the canvas: more than a quarter in one frame is a pop).
//
//   node scripts/stage.mjs _site --serve --port 8791        serve the staged site as Pages does, or point `base` at the real one
//   options (JSON, all optional): base, w 1024, h 768, dsf 2, cpu 1 (slow the page's CPU that many times: 4 is an ordinary student laptop), port 9740, json false
//
// Why it exists. On the build before the governor stopped judging cache fills, the tier went to 4 and 6 from a zoom on a Mac and the picture took ten seconds to come back; it is the first thing to look at when zooming
// or a district opening feels choppy. What it shows at 4x is what is left: the ground bake, 20 to 70 ms for each of the chunks a zoom or a district opening asks for.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { open } from './cdp.mjs';
import { findChrome, chromeReady } from './chrome.mjs';

const o = { base: 'http://localhost:8791/Paperclip-Capitalist', w: 1024, h: 768, dsf: 2, cpu: 1, port: 9740, json: false, ...JSON.parse(process.argv[2] || '{}') };
const dir = mkdtempSync(tmpdir() + '/pl-trn-');
const proc = spawn(findChrome(), ['--headless=new', '--hide-scrollbars', '--no-first-run', '--mute-audio', `--remote-debugging-port=${o.port}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });

// In the page: a run, and the ground complete.
const toWorld = async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (f, what) => { for (let i = 0; i < 1500; i++) { const v = f(); if (v) return v; await wait(20); } throw new Error('timed out: ' + what); };
  (await until(() => document.querySelector('button[data-act="solo"]'), 'the title screen')).click();
  await until(() => document.querySelector('input[type=checkbox]'), 'the draft');
  const cbs = [...document.querySelectorAll('input[type=checkbox]')]; cbs[0].click(); cbs[1].click(); await wait(200);
  (await until(() => [...document.querySelectorAll('button')].find((b) => /^Begin/i.test(b.textContent.trim())), 'the Begin button')).click();
  await until(() => window.pc && pc.world && pc.world.t > 0, 'the world'); await until(() => pc.world.gcValid, 'the ground'); await wait(3000);
};
// In the page: the recorder (one record per frame).
const arm = async () => {
  const w = pc.world, spr = await import('./js/world/sprites.js'), atl = await import('./js/world/atlas.js');
  const fills = () => (w.gc ? w.gc.stats.baked : 0) + spr.stats.builds + atl.stats.builds;
  const R = window.__rec = { frames: [], marks: [] }; const small = document.createElement('canvas'); small.width = 64; small.height = 48; const sg = small.getContext('2d', { willReadFrequently: true });
  let last = 0, prev = null, b0 = fills(), g0 = w.gc ? w.gc.stats.ms : 0, s0 = spr.stats.builds;
  const f = (t) => {
    if (last) {
      sg.drawImage(w.cv, 0, 0, 64, 48); const d = sg.getImageData(0, 0, 64, 48).data; let ch = 0;
      if (prev) for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2]) > 60) ch++;
      prev = d; const gm = w.gc ? w.gc.stats.ms : 0;
      R.frames.push([Math.round(t), +(t - last).toFixed(1), fills() - b0, +(gm - g0).toFixed(1), spr.stats.builds - s0, +(ch / 3072).toFixed(3), +w.night.toFixed(2), w.slow]); b0 = fills(); g0 = gm; s0 = spr.stats.builds;
    }
    last = t; requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
  window.__mark = (n) => R.marks.push([n, Math.round(performance.now())]);
};
// In the page: what each stretch between two marks came to.
const sum = () => {
  const R = window.__rec, m = R.marks, out = {};
  for (const n of [...new Set(m.map((x) => x[0].replace(/ (start|end)$/, '')))]) {
    const t0 = m.find((x) => x[0] === n + ' start')[1], t1 = m.find((x) => x[0] === n + ' end')[1], fr = R.frames.filter((f) => f[0] >= t0 && f[0] <= t1), gaps = fr.map((f) => f[1]).sort((x, y) => x - y);
    out[n] = { frames: fr.length, median: gaps[gaps.length >> 1], worst: gaps.slice(-3).reverse(), over50: gaps.filter((g) => g > 50).length, over100: gaps.filter((g) => g > 100).length, fillFrames: fr.filter((f) => f[2] > 0).length, fills: fr.reduce((s, f) => s + f[2], 0), sprites: fr.reduce((s, f) => s + f[4], 0), groundBakeMs: Math.round(fr.reduce((s, f) => s + f[3], 0)), pops: fr.filter((f) => f[5] > 0.25).length, maxChange: Math.max(...fr.map((f) => f[5])), tiers: [...new Set(fr.map((f) => f[7]))] };
  }
  return out;
};

try {
  await chromeReady(proc, o.port);
  const slot = 'trn' + (Date.now() % 1e6);
  const p = await open({ port: o.port }, `${o.base}/?slot=${slot}`, { w: o.w, h: o.h, dsf: o.dsf });
  await p.eval(`localStorage.setItem('pc.academyDone.${slot}', 'true')`); // no Academy between the draft and the world
  await p.eval(`(${toWorld})()`);
  if (o.cpu > 1) await p.send('Emulation.setCPUThrottlingRate', { rate: o.cpu });
  await p.eval(`(${arm})()`); await p.sleep(500);
  const wheel = (dy) => p.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: o.w / 2, y: o.h / 2, deltaX: 0, deltaY: dy });
  const stretch = async (name, fn, rest) => { await p.eval(`window.__mark(${JSON.stringify(name + ' start')})`); await fn(); await p.sleep(rest); await p.eval(`window.__mark(${JSON.stringify(name + ' end')})`); };
  await stretch('zoom in, four notches', async () => { for (let i = 0; i < 4; i++) { await wheel(-100); await p.sleep(700); } }, 1500);
  await stretch('zoom out, four notches', async () => { for (let i = 0; i < 4; i++) { await wheel(100); await p.sleep(700); } }, 1500);
  await stretch('time passes (clock 8x, 14 s)', async () => { await p.eval('pc.S.clock.set({ speed: 8 })'); }, 14000);
  await p.eval('pc.S.clock.set({ speed: 1 })');
  await stretch('a district opens', async () => { await p.eval('(() => { const g = pc.S.game; g.s.cash += 5000; if (g._unlock) g._unlock(); pc.S.emit && pc.S.emit("change"); })()'); }, 4000);
  const r = await p.eval(`(${sum})()`);
  if (o.json) console.log(JSON.stringify({ options: o, result: r })); else {
    console.log(`${o.base}  ${o.w}x${o.h} at ${o.dsf}x, CPU slowed ${o.cpu}x`);
    for (const [n, v] of Object.entries(r)) {
      console.log(`\n${n}`);
      console.log(`  frames ${v.frames}, median gap ${v.median} ms, worst ${v.worst.join(', ')} ms; over 50 ms: ${v.over50}, over 100 ms: ${v.over100}`);
      console.log(`  frames that filled a cache ${v.fillFrames} (${v.fills} fills: ${v.sprites} sprites, ${v.groundBakeMs} ms of ground bake); a quarter of the picture changed in one frame ${v.pops} times (most: ${Math.round(v.maxChange * 100)}%); quality tiers ${JSON.stringify(v.tiers)}`);
    }
  }
} finally { try { proc.kill('SIGKILL'); } catch { /* gone */ } setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } }, 700); }
