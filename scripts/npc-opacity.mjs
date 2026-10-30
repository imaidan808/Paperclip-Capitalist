// node scripts/npc-opacity.mjs '{"base":"http://localhost:8791/Paperclip-Capitalist","speed":16,"seconds":25}'
// What the buyers (the NPCs) do to their own opacity, frame by frame. Opens the page in headless Chrome, starts a run, sets the game clock to `speed` and, for `seconds`, records every draw call of every buyer with the alpha it
// was made at. Prints how many buyers there were, how many POPPED IN (a buyer that arrived while the run was going and was drawn at half strength or more in its first frame), how many VANISHED while still above 15%, how
// many jumped by more than 0.3 between two frames, and the opacity levels a buyer was drawn at while its lead was still there. A buyer's opacity should be one rise, a plateau and one fall (js/world/common.js leadAlpha).
//
//   node scripts/stage.mjs _site --serve --port 8791        serve the staged site as Pages does, or point `base` at the real one
//   options (JSON, all optional): base, w 1024, h 768, dsf 2, speed 1, seconds 25, port 9640, json false
//
// The clock matters: a lead lives 18 to 36 game hours, so at 1x a buyer goes every ten seconds or so once the crowd has filled (about a minute in), at 4x every two or three seconds, and at 16x, where a class runs, the crowd turns over continuously.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { open } from './cdp.mjs';
import { findChrome, chromeReady } from './chrome.mjs';

const o = { base: 'http://localhost:8791/Paperclip-Capitalist', w: 1024, h: 768, dsf: 2, speed: 1, seconds: 25, port: 9640, json: false, ...JSON.parse(process.argv[2] || '{}') };
const dir = mkdtempSync(tmpdir() + '/pl-npc-');
const proc = spawn(findChrome(), ['--headless=new', '--hide-scrollbars', '--no-first-run', '--mute-audio', `--remote-debugging-port=${o.port}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });

// In the page: a run, then the recording.
const record = async ({ speed, seconds }) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (f, what) => { for (let i = 0; i < 1500; i++) { const v = f(); if (v) return v; await wait(20); } throw new Error('timed out: ' + what); };
  (await until(() => document.querySelector('button[data-act="solo"]'), 'the title screen')).click();
  await until(() => document.querySelector('input[type=checkbox]'), 'the draft');
  const cbs = [...document.querySelectorAll('input[type=checkbox]')]; cbs[0].click(); cbs[1].click(); await wait(200);
  (await until(() => [...document.querySelectorAll('button')].find((b) => /^Begin/i.test(b.textContent.trim())), 'the Begin button')).click();
  await until(() => window.pc && pc.world && pc.world.t > 0, 'the world'); await wait(2500);
  const w = pc.world, ctx = w.ctx, out = { faults: [] };
  const ofault = w.fault.bind(w); w.fault = (err, where) => { out.faults.push(where + ': ' + String(err && err.message)); return ofault(err, where); };
  let frameNo = 0, cur = null; const rec = new Map();
  const od = w.draw.bind(w); w.draw = function () { frameNo++; return od(); };
  const P = CanvasRenderingContext2D.prototype;
  for (const m of ['fill', 'stroke', 'drawImage', 'fillRect']) { const orig = P[m]; P[m] = function (...a) { if (cur && this === ctx) { cur.calls++; const al = this.globalAlpha; if (al > cur.maxA) cur.maxA = al; } return orig.apply(this, a); }; }
  const oe = w.drawEnt.bind(w);
  w.drawEnt = function (c, e) { if (e.type !== 'lead') return oe(c, e); cur = { f: frameNo, calls: 0, maxA: 0, leaving: e.leaving ? 1 : 0 }; const r = oe(c, e); let a = rec.get(e.id); if (!a) rec.set(e.id, a = []); a.push(cur); cur = null; return r; };
  if (speed !== 1) pc.S.clock.set({ speed });
  await wait(seconds * 1000);
  let popIns = 0, popOuts = 0, jumpers = 0, ghostFrames = 0, fullFrames = 0; const levels = new Set();
  for (const a of rec.values()) {
    const first = a[0], last = a[a.length - 1]; let maxJump = 0;
    for (let i = 1; i < a.length; i++) maxJump = Math.max(maxJump, Math.abs(a[i].maxA - a[i - 1].maxA));
    if (first.f > 5 && first.maxA >= 0.5) popIns++;
    if (last.f < frameNo - 1 && last.maxA > 0.15) popOuts++;
    if (maxJump > 0.3) jumpers++;
    for (const x of a) { if (x.leaving) ghostFrames++; else { fullFrames++; levels.add(+x.maxA.toFixed(2)); } }
  }
  return { ...out, frames: frameNo, buyers: rec.size, popIns, popOuts, jumpers, ghostFrames, fullFrames, levels: [...levels].sort((x, y) => x - y), days: +(pc.S.game.s.hour / 24).toFixed(1) };
};

try {
  await chromeReady(proc, o.port);
  const slot = 'npc' + (Date.now() % 1e6);
  const p = await open({ port: o.port }, `${o.base}/?slot=${slot}`, { w: o.w, h: o.h, dsf: o.dsf });
  await p.eval(`localStorage.setItem('pc.academyDone.${slot}', 'true')`); // no Academy between the draft and the world
  const r = await p.eval(`(${record})(${JSON.stringify({ speed: o.speed, seconds: o.seconds })})`);
  if (o.json) console.log(JSON.stringify({ options: o, result: r })); else {
    console.log(`${o.base}  game clock ${o.speed}x for ${o.seconds} s (${r.days} game days), ${o.w}x${o.h} at ${o.dsf}x`);
    console.log(`buyers seen ${r.buyers}; POPPED IN at half strength or more ${r.popIns}; VANISHED while still above 15% ${r.popOuts}; jumped by more than 0.3 between two frames ${r.jumpers}`);
    console.log(`frames at full strength ${r.fullFrames}, frames of a buyer that is going ${r.ghostFrames}; draw faults ${JSON.stringify(r.faults)}`);
    console.log(`opacity levels of a buyer whose lead is still there: ${r.levels.length > 4 ? r.levels.slice(0, 3).join(', ') + ' ... ' + r.levels.slice(-2).join(', ') + ` (${r.levels.length} levels: the way in)` : r.levels.join(', ')}`);
  }
} finally { try { proc.kill('SIGKILL'); } catch { /* gone */ } setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } }, 700); }
