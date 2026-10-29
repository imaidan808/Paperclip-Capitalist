// node scripts/audio-r2x-check.mjs   (PORT and CDP as scripts/audio-lessons.mjs: 8602 and 9602 by default)
// The third repair round's browser half (docs/AUDIO.md Appendix F), in headless Chrome with the real page, the real engine and a real AudioContext. The Node tests (tests/audio-r2x*.test.mjs) hold the
// logic on stand-ins; this holds what only a browser shows:
//   A1  a student who joins by room code is in Classroom from the Draft on, told once, put back by Back; the instructor's dashboard says Display and sound and its link takes ?sound=quiet.
//   A4  the repair room: the switch, the line under the dial, the description on Stop, the announcement inside the sheet (and that the page's own live region is not in the accessibility tree while
//       the sheet is open: the reason `announce()` writes inside it), and that pressing the switch starts the real tone at once.
//   A3  the audition page, pressed for real: the bursts in the author's order, a bed with Ambient off, a one-shot under a mute, the dial tone in Classroom.
// Prints ok / FAIL per check and exits 1 if any failed.
import { createServer } from 'node:http';
import { handler } from '../server/static.mjs';
import { launch, open } from './cdp.mjs';
const PORT = +process.env.PORT || 8602, CDP = +process.env.CDP || 9602;
const srv = createServer(handler).listen(PORT, '127.0.0.1');
const b = await launch(CDP);
const fails = [];
const ok = (cond, msg) => { console.log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) fails.push(msg); };
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = (p) => p.logs.filter((l) => /^(error|EXC)/.test(l) && !/favicon|Failed to load resource/.test(l));
const settingsOf = `(async()=>{ const c = await import('/js/ui/common.js'); return c.settings.audio; })()`;

/** A page on its own storage slot, past the title, with a run started through the real draft (or left at the title). */
async function page(query, { reduced = false, play = true } = {}) {
  const slot = 'r2x' + Math.floor(Math.random() * 1e6);
  const p = await open(b, `${BASE}/?slot=${slot}${query}`, { w: 1280, h: 900, reduced });
  await p.eval(`localStorage.setItem('pc.academyDone.${slot}', 'true')`);
  if (play) {
    await p.eval(`(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)); [...document.querySelectorAll('button')].find(b=>/Play solo/i.test(b.textContent)).click(); await wait(500);
      for (const id of ['trades','pro']) { document.querySelector('.dr-in[value="'+id+'"]')?.click(); await wait(100); }
      [...document.querySelectorAll('button')].find(b=>/^Begin/i.test(b.textContent.trim())).click(); await wait(1500); })()`);
  }
  return { p, slot };
}
const toasts = (p) => p.eval(`[...document.querySelectorAll('#toasts .toast')].map(t=>t.textContent)`);

try {
  // ============================================================ A1: a class that joins by code
  {
    const { p, slot } = await page('&room=ABCD', { play: false });
    ok(JSON.stringify(await p.eval(settingsOf)).includes('"quiet":false'), 'A1: a first visit is not in Classroom');
    await p.clickSel('[data-act="join"]'); await sleep(700);
    ok(await p.eval(`!!document.querySelector('#sf')`), 'A1: Join opens the Draft');
    const a = await p.eval(settingsOf);
    ok(a.quiet === true, 'A1: the Classroom rule is on while the Draft is open (before Begin, where the loud fanfare is)');
    const t = await toasts(p);
    ok(t.length === 1 && /Classroom \(quieter\) in this room/.test(t[0]), 'A1: exactly one note, and it is the room\'s: ' + JSON.stringify(t));
    ok(!!(await p.eval(`localStorage.getItem('pc.audioBeforeRoom.${slot}')`)), 'A1: the earlier values are kept');
    await p.clickSel('[data-act="back"]'); await sleep(500);
    ok((await p.eval(settingsOf)).quiet === false, 'A1: Back out of the Draft puts the earlier settings back');
    ok(!(await p.eval(`localStorage.getItem('pc.audioBeforeRoom.${slot}')`)), 'A1: and forgets them');
    await p.clickSel('[data-act="join"]'); await sleep(500);
    for (const id of ['trades', 'pro']) { await p.eval(`document.querySelector('.dr-in[value="${id}"]').click()`); await sleep(100); }
    const before = await p.eval(`(async()=>{ const {audio}=await import('/js/audio/index.js'); return audio.stats().played['draft.begin']||0; })()`);
    await p.clickSel('#dr-begin'); await sleep(2500);
    ok(await p.eval(`!!document.querySelector('#stage')`), 'A1: Begin starts the run (a room: the Academy is already done here)');
    ok((await p.eval(settingsOf)).quiet === true, 'A1: still Classroom in the game');
    const t2 = await toasts(p);
    ok(!t2.some((x) => /Sound effects are on/.test(x)), 'A1: no "sound effects are on" note in a room: ' + JSON.stringify(t2));
    ok(t2.filter((x) => /Classroom \(quieter\)/.test(x)).length <= 1, 'A1: the room\'s note is not said twice');
    const drafted = await p.eval(`(async()=>{ const {audio}=await import('/js/audio/index.js'); const s=audio.stats(); return { played: s.played['draft.begin']||0, dropped: s.dropped }; })()`);
    ok(drafted.played - before === 1, 'A1: draft.begin did play (quietly, 10 dB down: tests/audio-r2x.test.mjs measures the gain): ' + JSON.stringify(drafted));
    ok(!errors(p).length, 'A1: no console error: ' + errors(p).join(' | ').slice(0, 200));
    await p.close();
  }
  {
    const { p } = await page('', { play: false });
    await p.clickSel('[data-act="instr"]'); await sleep(900);
    await p.eval(`document.querySelector('#dlg [data-close]')?.click()`); await sleep(300);
    const btn = await p.eval(`document.querySelector('#ih [data-act="settings"]').textContent.trim()`);
    ok(btn === 'Display and sound', 'A1: the instructor\'s settings button says Display and sound: ' + btn);
    const link0 = await p.eval(`document.querySelector('[data-act="copylink"]').dataset.link`);
    ok(/\?room=[A-Z0-9]+/.test(link0) && !/sound=/.test(link0), 'A1: the student link is the link it was: ' + link0);
    await p.clickSel('input[data-change="linkquiet"]'); await sleep(300);
    const link1 = await p.eval(`document.querySelector('[data-act="copylink"]').dataset.link`);
    ok(/&sound=quiet$/.test(link1), 'A1: with Quiet sound link ticked the link carries ?sound=quiet: ' + link1);
    ok(await p.eval(`document.querySelector('input[data-change="linkquiet"]').checked && document.activeElement === document.querySelector('input[data-change="linkquiet"]')`), 'A1: the box keeps the cursor through the redraw');
    await p.clickSel('[data-act="settings"]'); await sleep(400);
    ok(await p.eval(`document.querySelector('#dlg h2')?.textContent`) === 'Display and sound', 'A1: the dialog it opens is titled Display and sound');
    ok(!errors(p).length, 'A1: no console error (instructor): ' + errors(p).join(' | ').slice(0, 200));
    await p.close();
  }
  {
    // a student who opens the instructor's quiet link starts in Classroom, and a student who had chosen their own sound does not
    const { p } = await page('&room=ABCD&sound=quiet', { play: false });
    ok((await p.eval(settingsOf)).quiet === true, 'A1: ?sound=quiet at boot: Classroom from the first click');
    await p.close();
    const slot = 'r2x' + Math.floor(Math.random() * 1e6);
    const q = await open(b, `${BASE}/?slot=${slot}`, { w: 1000, h: 700 });
    await q.eval(`(async()=>{ const c = await import('/js/ui/common.js'); c.settings.audio = { ...c.settings.audio, master: 90, touched: true }; c.applySettings(); })()`);
    await q.close();
    const r = await open(b, `${BASE}/?slot=${slot}&sound=quiet`, { w: 1000, h: 700 });
    const a = await r.eval(settingsOf);
    ok(a.quiet === false && a.master === 90, 'A1: the link never overrides a sound setting the student made: ' + JSON.stringify({ quiet: a.quiet, master: a.master }));
    await r.close();
  }

  // ============================================================ A4: the repair room
  {
    const { p } = await page('');
    const open1 = (reduced) => p.eval(`(async()=>{
      const { openDeal } = await import('/js/ui/deal.js'); const common = await import('/js/ui/common.js'); const { ASSETS } = await import('/js/config.js');
      const g = pc.S.game, cls = Object.keys(ASSETS).find(c => ASSETS[c].repair);
      const a = g._mk(g.s, cls, { zone: g.s.zones[0], basis: 1 }); a.cond = 'broken'; g.s.assets.push(a); g.s.cash = 5000;
      const ctx = { S: pc.S, g: () => g, toast: common.toast, announce: common.announce, dlg: common.dlg, setHTML: common.setHTML, reduced: () => ${reduced}, emit(){}, on: () => () => {}, render(){}, sfx: {}, burst(){}, confirmBox(){} };
      window.__ses = openDeal(ctx, { kind: 'repair', assetId: a.id }); await new Promise(r => setTimeout(r, 400)); return window.__ses.ok !== false; })()`);
    ok(await open1(false), 'A4: a repair room opens');
    ok(await p.eval(`document.querySelector('.deal[data-kind]').dataset.kind`) === 'repair', 'A4: it is a repair');
    const sw = await p.eval(`(()=>{ const x = document.querySelector('[data-deal="dialtone"]'); return x && { name: x.getAttribute('aria-label'), pressed: x.getAttribute('aria-pressed'), text: x.textContent.trim(), after: x.previousElementSibling && x.previousElementSibling.dataset.fid, next: x.nextElementSibling && x.nextElementSibling.dataset.fid }; })()`);
    ok(sw && sw.name === 'Repair dial tone' && sw.pressed === 'false' && /Dial tone off/.test(sw.text), 'A4: the Dial tone switch is in the room, off: ' + JSON.stringify(sw));
    ok(sw && sw.after === 'deal-sound' && sw.next === 'leave', 'A4: beside Sound, before Leave');
    const ear = await p.eval(`document.getElementById('dial-ear')?.textContent`);
    ok(/^Prefer to listen\? Turn on Repair dial tone/.test(ear || '') && /Careful: pay more, no timing/.test(ear || ''), 'A4: the line under the dial: ' + ear);
    ok(await p.eval(`document.querySelector('[data-deal="stop"]').getAttribute('aria-describedby') === 'dial-ear' && document.activeElement === document.querySelector('[data-deal="stop"]')`), 'A4: the cursor lands on Stop, which is described by that line');
    const say = await p.eval(`document.querySelector('#dlg [data-say="status"]')?.textContent`);
    ok(/Fix\. A marker moves across a bar by itself/.test(say || '') && /choose Careful: pay more, no timing/.test(say || ''), 'A4: the room\'s own live region, inside the sheet, says it: ' + (say || '').slice(0, 140));
    // the accessibility tree: the page's live region is ignored while the sheet is open, the one inside is not
    await p.send('DOM.enable');
    const axOf = async (expr) => { const r = await p.send('Runtime.evaluate', { expression: expr }); const d = await p.send('DOM.describeNode', { objectId: r.result.objectId }); const t = await p.send('Accessibility.getPartialAXTree', { backendNodeId: d.node.backendNodeId, fetchRelatives: false }); return t.nodes[0]; };
    const live = await axOf(`document.getElementById('live')`), mine = await axOf(`document.querySelector('#dlg [data-say="status"]')`), stopN = await axOf(`document.querySelector('[data-deal="stop"]')`);
    ok(live.ignored === true && (live.ignoredReasons || []).some((r) => r.name === 'activeModalDialog'), 'A4: (the finding) #live is not in the accessibility tree while the modal sheet is open: ' + JSON.stringify((live.ignoredReasons || []).map((r) => r.name)));
    ok(mine.ignored === false && mine.role.value === 'status', 'A4: the region inside the sheet is in the tree, as a status');
    ok(/Prefer to listen/.test((stopN.description && stopN.description.value) || ''), 'A4: Stop\'s accessible description is the line: ' + ((stopN.description && stopN.description.value) || '').slice(0, 80));
    // the switch, for real: a click turns the tone on and the real tone starts at once
    await p.clickSel('[data-deal="dialtone"]'); await sleep(400);
    const on = await p.eval(`(async()=>{ const { audio } = await import('/js/audio/index.js'); const c = await import('/js/ui/common.js'); const x = document.querySelector('[data-deal="dialtone"]'); return { pressed: x.getAttribute('aria-pressed'), text: x.textContent.trim(), dial: c.settings.audio.dial, active: audio.dial.active, state: audio.state, focus: document.activeElement === x, ear: document.getElementById('dial-ear')?.textContent, said: document.querySelector('#dlg [data-say="status"]')?.textContent }; })()`);
    ok(on.pressed === 'true' && /Dial tone on/.test(on.text) && on.dial === true, 'A4: the switch is pressed and the setting is on: ' + JSON.stringify({ pressed: on.pressed, dial: on.dial }));
    ok(on.active === true, 'A4: the real tone is running, started at once while the marker moves (engine ' + on.state + ')');
    ok(on.focus, 'A4: the switch keeps the cursor through the redraw');
    ok(/^Repair dial tone is on: low on the left/.test(on.ear || ''), 'A4: the line now says what the tone does: ' + (on.ear || '').slice(0, 70));
    ok(/Repair dial tone on\. Low is left, high is right/.test(on.said || ''), 'A4: and the sheet\'s live region says so: ' + (on.said || '').slice(0, 80));
    await p.clickSel('[data-deal="dialtone"]'); await sleep(300);
    ok(await p.eval(`(async()=>{ const { audio } = await import('/js/audio/index.js'); return !audio.dial.active; })()`), 'A4: pressing it again lets the tone go');
    // Classroom: the switch explains and changes nothing
    await p.eval(`(async()=>{ const c = await import('/js/ui/common.js'); c.settings.audio = { ...c.settings.audio, quiet: true }; })()`);
    await p.clickSel('[data-deal="dialtone"]'); await sleep(300);
    ok(/off in Classroom/.test(await p.eval(`document.querySelector('#dlg [data-say="status"]').textContent`)) && await p.eval(`(async()=>{ const c = await import('/js/ui/common.js'); return c.settings.audio.dial === false; })()`), 'A4: in Classroom the switch says why and changes nothing');
    await p.eval(`document.querySelector('#dlg [data-close]').click()`); await sleep(300);
    ok(!errors(p).length, 'A4: no console error: ' + errors(p).join(' | ').slice(0, 200));
    await p.close();
  }
  {
    const { p } = await page('', { reduced: true });
    await p.eval(`(async()=>{
      const { openDeal } = await import('/js/ui/deal.js'); const common = await import('/js/ui/common.js'); const { ASSETS } = await import('/js/config.js');
      const g = pc.S.game, cls = Object.keys(ASSETS).find(c => ASSETS[c].repair); const a = g._mk(g.s, cls, { zone: g.s.zones[0], basis: 1 }); a.cond = 'broken'; g.s.assets.push(a); g.s.cash = 5000;
      const ctx = { S: pc.S, g: () => g, toast: common.toast, announce: common.announce, dlg: common.dlg, setHTML: common.setHTML, reduced: common.reduced, emit(){}, on: () => () => {}, render(){}, sfx: {}, burst(){}, confirmBox(){} };
      window.__ses = openDeal(ctx, { kind: 'repair', assetId: a.id }); await new Promise(r => setTimeout(r, 400)); })()`);
    ok(await p.eval(`!!document.querySelector('#dial-in') && !document.getElementById('dial-ear')`), 'A4: under reduced motion the dial is the slider, with its own words, and nobody is pushed');
    ok(!/A marker moves/.test(await p.eval(`document.querySelector('#dlg [data-say="status"]')?.textContent || ''`)), 'A4: and nothing is announced about a marker');
    ok(!!(await p.eval(`document.querySelector('[data-deal="dialtone"]')`)), 'A4: the switch is still there (the tone follows the slider)');
    await p.close();
  }

  // ============================================================ A3: the audition page, pressed for real
  {
    const p = await open(b, `${BASE}/dev/sounds.html`, { w: 1280, h: 900 });
    const status = () => p.eval(`document.getElementById('state').textContent`);
    const press = async (txt, wait = 600) => { await p.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(txt)}).click()`); await sleep(wait); };
    await p.click(10, 10); await sleep(300); // a first press, so the engine may start
    const bursts = await p.eval(`[...document.querySelectorAll('button')].filter(b => b.parentElement.previousElementSibling && b.parentElement.previousElementSibling.querySelector && b.parentElement.previousElementSibling.querySelector('#fresh')).map(b => b.textContent)`);
    ok(bursts.length === 6, 'A3: the six bursts are on the page: ' + bursts.length);
    ok(await p.eval(`document.getElementById('fresh').checked`), 'A3: "Fresh budget before each burst" is ticked by default');
    const played = () => p.eval(`Object.values(audioAudition.audio.stats().played).reduce((a,b)=>a+b,0)`);
    for (const name of bursts) {
      const n0 = await played();
      await press(name, 1000); await sleep(3500); // the next press queues behind the last big moment, so this is the author pressing about as fast as they like
      const n1 = await played(), s = await status();
      ok(n1 > n0 && !/silent/.test(s), `A3: burst "${name}" sounds (${n1 - n0} voices) and claims nothing: ${s.slice(0, 90)}`);
    }
    // unticked: the real budget, and the page says which rule
    await p.eval(`document.getElementById('fresh').checked = false`);
    await press(bursts[0], 700); await sleep(1500); await press(bursts[2], 900); await sleep(1200);
    const s3 = await status();
    ok(/Reward budget: the game rings one full reward every 10 s/.test(s3) && /next full one is \d+ s away/.test(s3), 'A3: with the box unticked a silent burst says "Reward budget" and the seconds left: ' + s3.slice(0, 160));
    await p.eval(`document.getElementById('fresh').checked = true`);
    await p.eval(`audioAudition.audio.stopAll(40)`);
    // a bed with Ambient off
    await press('bed scrap', 500);
    ok(/silent: Ambient is off: tick Ambient in the bar\./.test(await status()), 'A3: a bed with Ambient off: ' + (await status()));
    ok(await p.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'bed scrap').classList.contains('silent')`), 'A3: and the button is marked silent');
    await p.eval(`document.getElementById('amb').checked = true`); await press('bed scrap', 1200);
    ok(await p.eval(`audioAudition.audio.stats().ambient.playing`) && !/silent/.test(await status()), 'A3: with Ambient ticked the bed plays: ' + (await status()));
    await p.eval(`document.getElementById('amb').checked = false; audioAudition.audio.setAmbient(false)`);
    // a one-shot under a mute, the dial tone in Classroom
    await p.eval(`document.getElementById('mute').checked = true`); await press('amb.door-bell', 400);
    ok(/silent: Mute is on\./.test(await status()), 'A3: a one-shot under a mute says so: ' + (await status()));
    await p.eval(`document.getElementById('mute').checked = false; document.getElementById('quiet').checked = true`); await press('Start the tone', 400);
    ok(/silent: The Classroom rule turns the dial tone off\./.test(await status()), 'A3: the dial tone in Classroom says so: ' + (await status()));
    await p.eval(`document.getElementById('quiet').checked = false`); await press('Start the tone', 400);
    ok(await p.eval(`audioAudition.audio.dial.active`) && !/silent/.test(await status()), 'A3: the dial tone sounds otherwise');
    await press('Stop', 200); ok(/dial tone stopped/.test(await status()), 'A3: its Stop says what it did: ' + (await status()));
    await press('Stop everything', 200); ok(/stopped every sound/.test(await status()), 'A3: Stop everything says what it did');
    ok(!errors(p).length, 'A3: no console error: ' + errors(p).join(' | ').slice(0, 200));
    await p.close();
  }
} catch (e) { fails.push('script: ' + (e.stack || e.message)); console.log('FAIL script:', e.stack || e.message); } finally { b.close(); srv.close(); }
if (fails.length) { console.log('\n' + fails.length + ' problem(s):'); for (const f of fails) console.log(' -', f); process.exitCode = 1; } else console.log('\nall checks passed');
