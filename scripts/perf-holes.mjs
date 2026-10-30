// node scripts/perf-holes.mjs '{"base":"http://localhost:8791/Paperclip-Capitalist","cpu":4,"out":"/tmp/holes"}'
// What a player SEES while the ground is still being drawn, on a CPU slowed as much as you say: the window's canvas at fixed times after Begin, after the second notch of a zoom out, after the second notch of a zoom
// in and after a district opens, and, for every frame, what each cell of the window was drawn from. A cell with no picture at all over land is a flat rectangle of sea, and that is what a player calls "bits of the
// map glitching in". The frame gaps are scripts/perf-transitions.mjs's business; this is about what the frames show.
//
//   node scripts/stage.mjs _site --serve --port 8791        serve the staged site as Pages does, or point `base` at the real one
//   options (JSON, all optional): base, w 1024, h 768, dsf 2, cpu 4, idle 6000 (ms the draft is on screen before Begin), out (the folder for the pictures: a new one in the temp folder), port 9741,
//   load [600, 1300, 2200] (ms after Begin), zoom [200, 700, 1600] (ms after the second notch, and after a district opens), json false
//
// The pictures are the page's own canvas, copied in the frame (not a screenshot, which blocks a slowed page for a second and is late): load-0600.jpg, out-0200.jpg, in-0700.jpg, open-1600.jpg and so on, and
// `settled-*.jpg` is the same window at rest (what the frames above should look like). The page's time at each picture is printed with it.
// The table counts, per phase, the frames shown to the player in which part of the window is filled by nothing but the sea: with `World.gcHoles` (the pieces of the window that no chunk, stand-in or soft chunk covers) when the build
// has it, else by a count of the cells that no chunk of any scale holds the middle of. The timeline under each phase is `E` exact cells, `S` stale ones, `i` stand-ins, `a` cells under a chunk the ratio window refuses, `n` cells under
// none (middles of cells: a cell is not a hole where it is only sea), and a `v` marks a frame the canvas was held back for.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { open } from './cdp.mjs';
import { findChrome, chromeReady } from './chrome.mjs';

// `skip` leaves phases out (['in', 'open']); `dump` is a list of ms after the second notch at which the ground cache is written out as rectangles (dump-out-0700.json).
// `patch` (a string of JavaScript run in the page before Begin, with `m` = { chunks, cache } the world's modules) is for experiments: switch a rule off and see what the pictures do.
const o = { patch: '', patchFile: '', base: 'http://localhost:8791/Paperclip-Capitalist', w: 1024, h: 768, dsf: 2, cpu: 4, idle: 6000, port: 9741, load: [600, 1300, 2200], zoom: [200, 700, 1600], dump: [], skip: [], json: false, ...JSON.parse(process.argv[2] || '{}') };
const dir = mkdtempSync(tmpdir() + '/pl-holes-');
const out = o.out || mkdtempSync(tmpdir() + '/holes-'); mkdirSync(out, { recursive: true });
const proc = spawn(findChrome(), ['--headless=new', '--hide-scrollbars', '--no-first-run', '--mute-audio', `--remote-debugging-port=${o.port}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeErr = '', chromeExit = null; proc.stderr.on('data', (d) => { chromeErr = (chromeErr + d).slice(-2500); }); proc.once('exit', (c, sig) => { chromeExit = c ?? sig; });
const pad = (n) => String(n).padStart(4, '0');

// In the page: the title, the draft; stops at the Begin button.
const toDraft = async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (f, what) => { for (let i = 0; i < 800; i++) { const v = f(); if (v) return v; await wait(25); } throw new Error('timed out: ' + what); };
  (await until(() => document.querySelector('button[data-act="solo"]'), 'the title screen')).click();
  await until(() => document.querySelector('input[type=checkbox]'), 'the draft');
  const cbs = [...document.querySelectorAll('input[type=checkbox]')]; cbs[0].click(); cbs[1].click(); await wait(200);
  await until(() => [...document.querySelectorAll('button')].find((b) => /^Begin/i.test(b.textContent.trim())), 'the Begin button');
};
// In the page: the recorder. It hooks the world's draw as soon as the world exists, and after every drawn frame notes the time, the gap, the cost, what each cell of the ground window was drawn from, and whether the canvas
// was shown; and it copies the canvas when a job is due.
const arm = async ({ w: W0, h: H0, patch }) => {
  const ch = await import('./js/world/chunks.js'), cache = await import('./js/world/chunkcache.js'), clouds = await import('./js/world/clouds.js'); // (before Begin: the hook must be in place the moment the world exists)
  if (patch) new Function('m', patch)({ chunks: ch, cache });
  const R = window.__holes = { t0: 0, frames: [], jobs: [], snaps: {}, taken: [], marks: [] };
  const small = document.createElement('canvas'); small.width = W0; small.height = H0; const sg = small.getContext('2d');
  addEventListener('wheel', () => R.marks.push([window.__phase, performance.now()]), { capture: true, passive: true });
  R.arm = (name, base, ms) => R.jobs.push({ name, at: base + ms, base }); R.dumps = {};
  // what the ground cache held at a frame, as rectangles on the screen (css pixels): every chunk of the store with its scale, what it is (exact, stale, stand-in, coarse, empty) and whether the frame's stand-in test hid it
  const dumpState = (w) => {
    const a = w.renderScale(), sk = ch.scaleKey(a), [e, f] = w.snap, d = w.dpr, cells = w.gcCells, gc = w.gc, rows = [];
    for (const c of gc.map.values()) {
      const k = a / c.a, exact = c.sk === sk, x = (exact ? c.i * ch.CHUNK_PX : c.i * ch.CHUNK_PX * k) + e, y = (exact ? c.j * ch.CHUNK_PX : c.j * ch.CHUNK_PX * k) + f, sz = exact ? ch.CHUNK_PX : ch.CHUNK_PX * k;
      let hid = null; if (!exact) { try { hid = gc.hidden(c, sk, cells.s); } catch { hid = 'err'; } }
      rows.push({ a: c.a, i: c.i, j: c.j, kind: exact ? 'exact' : ch.staleRatio(c.a, a, c.coarse) ? 'standin' : 'out-of-window', coarse: !!c.coarse, empty: !!c.empty, stale: !!c.stale, hidden: hid, fade: c.fadeEnd ? Math.round(c.fadeEnd - performance.now()) : 0, ratio: +k.toFixed(3), rect: [x / d, y / d, sz / d].map((v) => Math.round(v * 10) / 10) });
    }
    return { zoom: w.cam.z, a, dpr: d, e, f, cells: { ...cells }, rows };
  };
  const install = (w) => {
    let last = 0;
    const classify = () => {
      const gc = w.gc, cells = w.gcCells; if (!gc || !cells || !gc.map) return null;
      const a = w.renderScale(), sk = ch.scaleKey(a), s = cells.s, list = [...gc.map.values()]; let E = 0, S = 0, SI = 0, AN = 0, NO = 0;
      for (let j = cells.j0; j <= cells.j1; j++) for (let i = cells.i0; i <= cells.i1; i++) {
        const c = gc.map.get(ch.chunkKey(sk, i, j)); if (c) { if (c.stale) S++; else E++; continue; }
        const mx = (i + 0.5) * s, my = (j + 0.5) * s; let near = false, win = false;
        for (const c2 of list) { if (c2.sk === sk) continue; const s0 = ch.CHUNK_PX / c2.a; if (mx >= c2.i * s0 && mx < (c2.i + 1) * s0 && my >= c2.j * s0 && my < (c2.j + 1) * s0) { if (ch.staleRatio(c2.a, a, c2.coarse)) win = true; else near = true; } }
        if (win) SI++; else if (near) AN++; else NO++;
      }
      return [E, S, SI, AN, NO];
    };
    const od = w.draw.bind(w);
    w.draw = function () {
      const t = performance.now(), r = od(), cost = performance.now() - t;
      if (!R.t0) R.t0 = t;
      const k = classify() || [0, 0, 0, 0, 0], shown = +(w.cv.style.opacity === '' ? 1 : w.cv.style.opacity);
      R.frames.push([Math.round(t), last ? +(t - last).toFixed(1) : 0, +cost.toFixed(1), shown, w.gcValid ? 1 : 0, ...k, w.gc ? w.gc.stats.baked : 0, w.gcHoles ?? -1, (clouds.cloudStats && clouds.cloudStats(w) || {}).holes ?? -1]); last = t;
      for (const j of R.jobs) if (!j.done && t >= j.at) { j.done = true; if (j.name.startsWith('dump')) { R.dumps[j.name] = dumpState(w); continue; } sg.drawImage(w.cv, 0, 0, W0, H0); R.snaps[j.name] = small.toDataURL('image/jpeg', 0.85); R.taken.push([j.name, Math.round(t - j.base), Math.round(w.cam.z * 1000) / 1000, w.dpr]); }
      return r;
    };
  };
  const poll = () => { if (window.pc && pc.world && pc.world.draw && !pc.world.__hooked) { pc.world.__hooked = true; install(pc.world); } else if (!(window.pc && pc.world && pc.world.__hooked)) setTimeout(poll, 2); };
  poll();
};
const begin = () => {
  const btn = [...document.querySelectorAll('button')].find((b) => /^Begin/i.test(b.textContent.trim()));
  const t = performance.now(); window.__holes.marks.push(['begin', t]); window.__holes.t0 = 0; btn.click(); return t;
};

try {
  await chromeReady(proc, o.port);
  const slot = 'holes' + (Date.now() % 1e6);
  const p = await open({ port: o.port }, `${o.base}/?slot=${slot}`, { w: o.w, h: o.h, dsf: o.dsf });
  await p.eval(`localStorage.setItem('pc.academyDone.${slot}', 'true')`); // no Academy between the draft and the world
  if (o.cpu > 1) await p.send('Emulation.setCPUThrottlingRate', { rate: o.cpu });
  await p.eval(`(${toDraft})()`); await p.eval(`(${arm})(${JSON.stringify({ w: o.w, h: o.h, patch: o.patch + (o.patchFile ? ';\n' + readFileSync(o.patchFile, 'utf8') : '') })})`); await p.sleep(o.idle); // the player reads the draft: the page is idle meanwhile (the rest of the modules, and the island's scene)
  const nowPage = () => p.eval('performance.now()');
  const wheel = (dy) => p.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: o.w / 2, y: o.h / 2, deltaX: 0, deltaY: dy });
  const settle = async () => { await p.eval(`new Promise((r) => { const t = performance.now(); const i = setInterval(() => { if (pc.world.gcValid || performance.now() - t > 30000) { clearInterval(i); r(); } }, 50); })`); await p.sleep(2500); };
  const t0 = await p.eval(`(${begin})()`);
  for (const ms of o.load) await p.eval(`__holes.arm('load-${pad(ms)}', ${t0}, ${ms})`);
  await p.sleep(Math.max(...o.load) + 1500); await settle();
  await p.eval(`__holes.arm('settled-start', performance.now(), 0)`); await p.sleep(800);
  const phases = [['begin', t0]];
  const notches = async (dy, name) => {
    await p.eval(`window.__phase = '${name}1'`); phases.push([name + '1', await nowPage()]); await wheel(dy); await p.sleep(700);
    await p.eval(`window.__phase = '${name}2'`); await wheel(dy); const since = await nowPage(); phases.push([name + '2', since]);
    for (const ms of o.zoom) await p.eval(`__holes.arm('${name}-${pad(ms)}', ${since}, ${ms})`);
    for (const ms of o.dump) await p.eval(`__holes.arm('dump-${name}-${pad(ms)}', ${since}, ${ms})`);
    await p.sleep(Math.max(...o.zoom) + 800); await settle(); await p.eval(`__holes.arm('settled-${name}', performance.now(), 0)`); await p.sleep(800);
  };
  if (!o.skip.includes('out')) await notches(100, 'out');
  if (!o.skip.includes('in')) await notches(-100, 'in');
  if (!o.skip.includes('open')) {
  await p.eval('window.__phase = "open"');
  const since = await p.eval('(() => { const t = performance.now(); const g = pc.S.game; g.s.cash += 5000; if (g._unlock) g._unlock(); pc.S.emit && pc.S.emit("change"); return t; })()'); phases.push(['open', since]);
  for (const ms of o.zoom) await p.eval(`__holes.arm('open-${pad(ms)}', ${since}, ${ms})`);
  await p.sleep(Math.max(...o.zoom) + 1500); await settle();
  }
  const R = await p.eval('({ frames: __holes.frames, snaps: __holes.snaps, taken: __holes.taken, marks: __holes.marks, dumps: __holes.dumps, drops: window.__drops || null })');
  if (R.drops) writeFileSync(`${out}/drops.json`, JSON.stringify(R.drops));
  for (const [name, d] of Object.entries(R.dumps)) writeFileSync(`${out}/${name}.json`, JSON.stringify(d, null, 1));
  for (const [name, url] of Object.entries(R.snaps)) writeFileSync(`${out}/${name}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  // per phase: from its mark to the next
  const ends = phases.map((q, n) => (phases[n + 1] ? phases[n + 1][1] : Infinity)); const lines = [];
  const FIELDS = { shown: 3, valid: 4, E: 5, S: 6, standIn: 7, anyScale: 8, none: 9, baked: 10, holes: 11, cloudHoles: 12 }, gauge = R.frames.some((f) => f[11] >= 0); // (the library's own count of the pieces of the window nothing covers, when the build has it; else the cells that no chunk of any scale holds the middle of)
  for (let n = 0; n < phases.length; n++) {
    const [name, t] = phases[n], fr = R.frames.filter((f) => f[0] >= t && f[0] < ends[n]), vis = fr.filter((f) => f[FIELDS.shown] > 0.01);
    const gaps = fr.map((f) => f[1]).filter((g) => g > 0).sort((x, y) => x - y), cells = (f) => f[5] + f[6] + f[7] + f[8] + f[9];
    const hole = (f) => (gauge ? f[11] > 0 || f[12] > 0 : f[8] + f[9] > 0), shown = vis.filter(hole);
    lines.push(`${name.padEnd(6)} ${String(fr.length).padStart(3)} frames, median gap ${gaps[gaps.length >> 1]} ms, worst ${gaps.slice(-3).reverse().join(' ')} ms, over 50 ms: ${gaps.filter((g) => g > 50).length}; ` +
      `frames shown to the player with part of the window that only the sea fills: ${shown.length} (${gauge ? 'pieces of ground, most ' + Math.max(0, ...shown.map((f) => f[11])) + ', of cloud, most ' + Math.max(0, ...shown.map((f) => f[12])) : 'cells, most ' + Math.max(0, ...shown.map((f) => f[8] + f[9]))}; of ${Math.max(0, ...fr.map(cells))} cells), ` +
      `last such frame at ${shown.length ? shown[shown.length - 1][0] - t : '-'} ms, canvas hidden for ${fr.length - vis.length} frames`);
    if (name !== 'open' || true) { const tl = fr.filter((f, q) => hole(f) || q % 6 === 0).slice(0, 40).map((f) => `${f[0] - t}:${f[FIELDS.E]}E${f[FIELDS.S]}S${f[FIELDS.standIn]}i${f[FIELDS.anyScale]}a${f[FIELDS.none]}n${f[FIELDS.shown] > 0.01 ? '' : 'v'}`); lines.push('       ' + tl.join(' ')); }
  }
  lines.push('pictures: ' + R.taken.map(([nm, ms, z, d]) => `${nm} (page time ${ms} ms, zoom ${z}, density ${d})`).join('; '));
  if (o.json) console.log(JSON.stringify({ options: o, out, lines })); else console.log(`${o.base}  ${o.w}x${o.h} at ${o.dsf}x, CPU slowed ${o.cpu}x, Begin pressed ${o.idle} ms into the draft\npictures in ${out}\n${lines.join('\n')}`);
  await p.close();
} catch (e) { console.error(`${e.message}\nChrome: ${chromeExit == null ? 'still running' : 'exited with ' + chromeExit}; it wrote: ${chromeErr.trim().slice(-1200) || 'nothing'}`); process.exitCode = 1;
} finally { try { proc.kill('SIGKILL'); } catch { /* gone */ } setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } }, 700); }
