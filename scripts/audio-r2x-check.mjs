// node scripts/audio-r2x-check.mjs   (PORT and CDP as scripts/audio-lessons.mjs: 8602 and 9602 by default)
// The third repair round's browser half (docs/AUDIO.md Appendix F), in headless Chrome with the real page, the real engine and a real AudioContext. The Node tests (tests/audio-r2x*.test.mjs) hold the
// logic on stand-ins; this holds what only a browser shows:
//   A1  a student who joins by room code is in Classroom from the Draft on, told once, put back by Back; the instructor's dashboard says Display and sound and its link takes ?sound=quiet.
//   A4  the repair room: the switch, the line under the dial, the description on Stop, the announcement inside the sheet (and that the page's own live region is not in the accessibility tree while
//       the sheet is open: the reason `announce()` writes inside it), and that pressing the switch starts the real tone at once.
//   A3  the audition page, pressed for real: the bursts in the author's order, a bed with Ambient off, a one-shot under a mute, the dial tone in Classroom.
//   Fourth round (Appendix G): the Academy's first lesson in a room keeps Classroom (W-1); a student who types the code is told one thing (U3/W-5); the Draft has its Display and sound button and the note
//   is not on Begin (U7/U8); the Deal Room's switches are named by their words (U10) and the tone comes back after M, M and after a hidden tab (U1); a press that closes the dialog plays one voice (W-4);
//   a script-made event creates no context (B2); the audition page's new tools run (U4, U5, U12).
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
async function page(query, { reduced = false, play = true, academy = false, w = 1280, h = 900 } = {}) {
  const slot = 'r2x' + Math.floor(Math.random() * 1e6);
  const p = await open(b, `${BASE}/?slot=${slot}${query}`, { w, h, reduced });
  if (!academy) await p.eval(`localStorage.setItem('pc.academyDone.${slot}', 'true')`);
  if (play) {
    await p.eval(`(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)); [...document.querySelectorAll('button')].find(b=>/Play solo/i.test(b.textContent)).click(); await wait(500);
      for (const id of ['trades','pro']) { document.querySelector('.dr-in[value="'+id+'"]')?.click(); await wait(100); }
      [...document.querySelectorAll('button')].find(b=>/^Begin/i.test(b.textContent.trim())).click(); await wait(1500); })()`);
  }
  return { p, slot };
}
const toasts = (p) => p.eval(`[...document.querySelectorAll('#toasts .toast')].map(t=>t.textContent)`);
/** What the engine has played so far, by id, and what a stretch of the page added to it: the integration check that nothing plays twice (a click, a toast and the code that raised it are three ways to ring one sound). */
const playedOf = (p) => p.eval(`(async()=>{ const { audio } = await import('/js/audio/index.js'); return { ...audio.stats().played }; })()`);
const added = (a, c) => { const o = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(c)])) { const d = (c[k] || 0) - (a[k] || 0); if (d) o[k] = d; } return o; };

try {
  // ============================================================ A1: a class that joins by code
  {
    const { p, slot } = await page('&room=ABCD', { play: false });
    ok(JSON.stringify(await p.eval(settingsOf)).includes('"quiet":false'), 'A1: a first visit is not in Classroom');
    const pl0 = await playedOf(p);
    await p.clickSel('[data-act="join"]'); await sleep(700);
    ok(await p.eval(`!!document.querySelector('#sf')`), 'A1: Join opens the Draft');
    const joined = added(pl0, await playedOf(p));
    ok(JSON.stringify(joined) === '{"ui.tick":1}', 'A1: the Join press and the room\'s note play one tick between them, and the note (info) rings nothing: ' + JSON.stringify(joined));
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
    const pl1 = await playedOf(p);
    await p.clickSel('#dr-begin'); await sleep(2500);
    const begun = added(pl1, await playedOf(p));
    ok(begun['draft.begin'] === 1 && !begun['ui.ok'] && !begun['ui.nudge'] && !begun['ui.tick'], 'A1: Begin plays the fanfare once and nothing over it (no click tick, no toast ok): ' + JSON.stringify(begun));
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
    await p.clickSel('input[data-change="linksound"][value="quiet"]'); await sleep(300);
    const link1 = await p.eval(`document.querySelector('[data-act="copylink"]').dataset.link`);
    ok(/&sound=quiet$/.test(link1), 'A1: with Quiet chosen under Sound in the student link the link carries ?sound=quiet: ' + link1);
    ok(await p.eval(`(()=>{ const q = document.querySelector('input[data-change="linksound"][value="quiet"]'); return q.checked && document.activeElement === q; })()`), 'A1: the radio keeps the cursor through the redraw');
    // sixth round, UX3: the arrow key moves through the group (a native radio group), the link follows, and the cursor is still on the chosen radio after the redraw
    await p.key('ArrowRight'); await sleep(300);
    const link2 = await p.eval(`document.querySelector('[data-act="copylink"]').dataset.link`);
    ok(/&sound=off$/.test(link2), 'UX3: ArrowRight chooses Off and the link carries ?sound=off: ' + link2);
    ok(await p.eval(`(()=>{ const o = document.querySelector('input[data-change="linksound"][value="off"]'); return o.checked && document.activeElement === o && document.querySelector('[data-act="copylink"]').dataset.sound === 'off'; })()`), 'UX3: the chosen radio keeps the cursor, and the copy knows what it carries');
    await p.key('ArrowLeft'); await sleep(200); await p.key('ArrowLeft'); await sleep(300);
    ok(!/sound=/.test(await p.eval(`document.querySelector('[data-act="copylink"]').dataset.link`)), 'UX3: back on Normal the link carries nothing');
    await p.clickSel('input[data-change="linksound"][value="quiet"]'); await sleep(300);
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
    ok(sw && sw.name === null && sw.pressed === 'false' && /Dial tone off/.test(sw.text), 'A4: the Dial tone switch is in the room, off, named by its words (no other label): ' + JSON.stringify(sw));
    ok(sw && sw.after === 'deal-sound' && sw.next === 'leave', 'A4: beside Sound, before Leave');
    const ear = await p.eval(`document.getElementById('dial-ear')?.textContent`);
    ok(/^Prefer to listen\? Turn on Repair dial tone/.test(ear || '') && /Careful: pay more, no timing/.test(ear || ''), 'A4: the line under the dial: ' + ear);
    ok(await p.eval(`document.querySelector('[data-deal="stop"]').getAttribute('aria-describedby') === 'dial-short' && document.activeElement === document.querySelector('[data-deal="stop"]')`), 'A4: the cursor lands on Stop, which is described by the short line');
    const say = await p.eval(`document.querySelector('#dlg [data-say="status"]')?.textContent`);
    ok(/Fix\. A marker moves across a bar by itself/.test(say || '') && /choose Careful: pay more, no timing/.test(say || ''), 'A4: the room\'s own live region, inside the sheet, says it: ' + (say || '').slice(0, 140));
    // the accessibility tree: the page's live region is ignored while the sheet is open, the one inside is not
    await p.send('DOM.enable');
    const axOf = async (expr) => { const r = await p.send('Runtime.evaluate', { expression: expr }); const d = await p.send('DOM.describeNode', { objectId: r.result.objectId }); const t = await p.send('Accessibility.getPartialAXTree', { backendNodeId: d.node.backendNodeId, fetchRelatives: false }); return t.nodes[0]; };
    const live = await axOf(`document.getElementById('live')`), mine = await axOf(`document.querySelector('#dlg [data-say="status"]')`), stopN = await axOf(`document.querySelector('[data-deal="stop"]')`);
    ok(live.ignored === true && (live.ignoredReasons || []).some((r) => r.name === 'activeModalDialog'), 'A4: (the finding) #live is not in the accessibility tree while the modal sheet is open: ' + JSON.stringify((live.ignoredReasons || []).map((r) => r.name)));
    ok(mine.ignored === false && mine.role.value === 'status', 'A4: the region inside the sheet is in the tree, as a status');
    ok(/^Dial tone is off\. Careful needs no timing\.$/.test((stopN.description && stopN.description.value) || ''), 'A4: Stop\'s accessible description is the short line (a dozen words, not forty): ' + ((stopN.description && stopN.description.value) || '').slice(0, 80));
    const names = await p.eval(`(()=>{ const nm = (f) => document.querySelector('[data-fid="'+f+'"]'); return { sound: nm('deal-sound').querySelector('.tn').textContent, dial: nm('deal-dial').querySelector('.tn').textContent, badge: nm('deal-dial').querySelector('.tb').getAttribute('aria-hidden') }; })()`);
    const soundAX = await axOf(`document.querySelector('[data-fid="deal-sound"]')`), dialAX = await axOf(`document.querySelector('[data-fid="deal-dial"]')`);
    const nm = (x) => x.name.value.trim().toLowerCase(); // (the sheet draws buttons in capitals, and the name is computed from what is drawn)
    ok(nm(soundAX) === 'sound' && nm(dialAX) === 'dial tone' && names.badge === 'true', 'U10: the accessible names are the visible words (Sound, Dial tone); the state is aria-pressed and a badge the name leaves out: ' + nm(soundAX) + ' / ' + nm(dialAX));
    // the switch, for real: a click turns the tone on and the real tone starts at once
    const pl2 = await playedOf(p);
    await p.clickSel('[data-deal="dialtone"]'); await sleep(400);
    const switched = added(pl2, await playedOf(p));
    ok(JSON.stringify(switched) === '{"ui.toggle":1}', 'A4: one press of the Dial tone switch plays its own toggle once (the page-wide click table leaves it alone): ' + JSON.stringify(switched));
    const on = await p.eval(`(async()=>{ const { audio } = await import('/js/audio/index.js'); const c = await import('/js/ui/common.js'); const x = document.querySelector('[data-deal="dialtone"]'); return { pressed: x.getAttribute('aria-pressed'), text: x.textContent.trim(), dial: c.settings.audio.dial, active: audio.dial.active, state: audio.state, focus: document.activeElement === x, ear: document.getElementById('dial-ear')?.textContent, said: document.querySelector('#dlg [data-say="status"]')?.textContent }; })()`);
    ok(on.pressed === 'true' && /Dial tone on/.test(on.text) && on.dial === true, 'A4: the switch is pressed and the setting is on: ' + JSON.stringify({ pressed: on.pressed, dial: on.dial }));
    ok(on.active === true, 'A4: the real tone is running, started at once while the marker moves (engine ' + on.state + ')');
    ok(on.focus, 'A4: the switch keeps the cursor through the redraw');
    {
      const dial = () => p.eval(`(async()=>{ const { audio } = await import('/js/audio/index.js'); return { active: audio.dial.active, state: audio.state, mute: (await import('/js/ui/common.js')).settings.audio.mute }; })()`);
      await p.key('m'); await sleep(300); const muted = await dial();
      ok(muted.mute === true && muted.active === false, 'U1: key M mutes: the engine ends the tone: ' + JSON.stringify(muted));
      ok(/Dial tone/.test(await p.eval(`document.querySelector('[data-deal="dialtone"]').textContent`)), 'U1: and the room still says what it said');
      await p.key('m'); await sleep(500); const back = await dial();
      ok(back.mute === false && back.active === true, 'U1: M again: the tone is running again, while the marker moves (it stayed silent for the rest of the stage): ' + JSON.stringify(back));
      await p.eval(`(async()=>{ const { audio } = await import('/js/audio/index.js'); audio.setHidden(true); })()`); await sleep(200);
      ok((await dial()).active === false, 'U1: a tab put away ends the tone');
      await p.eval(`(async()=>{ const { audio } = await import('/js/audio/index.js'); audio.setHidden(false); })()`); await sleep(500);
      ok((await dial()).active === true, 'U1: and shown again it comes back');
    }
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

  // ============================================================ fourth round (Appendix G)
  {
    // W-1: the Academy's first lesson, played in a room, keeps Classroom (it put the earlier settings back, and the class played every lesson at full volume)
    const { p, slot } = await page('&room=ABCD', { play: false, academy: true });
    await p.clickSel('[data-act="join"]'); await sleep(600);
    for (const id of ['trades', 'pro']) { await p.eval(`document.querySelector('.dr-in[value="${id}"]').click()`); await sleep(100); }
    await p.clickSel('#dr-begin'); await sleep(2500);
    ok(await p.eval(`!!document.querySelector('[data-act="ac-start"]')`), 'W-1: Begin in a room opens the Academy on a first run');
    ok((await p.eval(settingsOf)).quiet === true, 'W-1: Classroom on the Academy\'s intro');
    const toasts0 = (await toasts(p)).length;
    await p.clickSel('[data-act="ac-start"]'); await sleep(1800);
    const a = await p.eval(settingsOf);
    ok(a.quiet === true && a.clockSounds === false, 'W-1: Classroom through lesson 1 (the sandbox is not a room it can leave): ' + JSON.stringify({ quiet: a.quiet, clock: a.clockSounds }));
    ok(!!(await p.eval(`localStorage.getItem('pc.audioBeforeRoom.${slot}')`)), 'W-1: the earlier values are still remembered, to be put back on leaving the room');
    ok((await toasts(p)).filter((x) => /Classroom \(quieter\)/.test(x)).length <= 1 && (await toasts(p)).length <= toasts0 + 1, 'W-1: no second note of the room\'s: ' + JSON.stringify(await toasts(p)));
    ok(!errors(p).length, 'W-1: no console error: ' + errors(p).join(' | ').slice(0, 200));
    await p.close();
  }
  {
    // U3 / W-5: a student who types the code is told one thing about sound; U7: the Draft has the button the notes name
    const { p } = await page('', { play: false });
    await p.clickSel('#jc'); await sleep(300);
    ok((await toasts(p)).length === 0, 'U3: a press in the code field makes no "sound effects are on": ' + JSON.stringify(await toasts(p)));
    await p.eval(`document.querySelector('#jc').value = 'ABCD'`);
    await p.clickSel('[data-act="join"]'); await sleep(700);
    const t = await toasts(p);
    ok(t.length === 1 && /Classroom \(quieter\) in this room\. Press M to mute, or change it under Display and sound\./.test(t[0]), 'U3: Join then says one thing, and the room\'s: ' + JSON.stringify(t));
    const rects = await p.eval(`(()=>{ const t = document.querySelector('#toasts .toast')?.getBoundingClientRect(), b = document.querySelector('#dr-begin')?.getBoundingClientRect(); return t && b && { t: [t.left, t.top, t.right, t.bottom], b: [b.left, b.top, b.right, b.bottom] }; })()`);
    const overlap = (r) => !(r.t[2] <= r.b[0] || r.t[0] >= r.b[2] || r.t[3] <= r.b[1] || r.t[1] >= r.b[3]);
    ok(rects && !overlap(rects), 'U8: the note is not on the Begin button (1280x900): ' + JSON.stringify(rects));
    ok(await p.eval(`!!document.querySelector('[data-act="settings"][data-fid="dr-sound"]')`), 'U7: the Draft has a Display and sound button');
    await p.clickSel('[data-fid="dr-sound"]'); await sleep(400);
    ok(await p.eval(`document.querySelector('#dlg h2')?.textContent`) === 'Display and sound', 'U7: and it opens the dialog the notes name');
    await p.eval(`document.querySelector('#dlg [data-close]')?.click()`); await sleep(300);
    ok(!errors(p).length, 'U3: no console error: ' + errors(p).join(' | ').slice(0, 200));
    await p.close();
  }
  for (const [w, h] of [[1366, 768], [1280, 720], [390, 844]]) {
    // U8: at the sizes the report measured, and on a phone
    const { p } = await page('&room=ABCD', { play: false, w, h });
    await p.clickSel('[data-act="join"]'); await sleep(700);
    const r = await p.eval(`(()=>{ const t = document.querySelector('#toasts .toast')?.getBoundingClientRect(), b = document.querySelector('#dr-begin')?.getBoundingClientRect(); return t && b && { t: [t.left, t.top, t.right, t.bottom].map(Math.round), b: [b.left, b.top, b.right, b.bottom].map(Math.round), h: innerHeight }; })()`);
    const hit = r && !(r.t[2] <= r.b[0] || r.t[0] >= r.b[2] || r.t[3] <= r.b[1] || r.t[1] >= r.b[3]);
    ok(r && !hit, `U8: ${w}x${h}: the note is not on Begin: ` + JSON.stringify(r));
    await p.close();
  }
  {
    // W-4: a press that closes the dialog plays its own tick and nothing behind it; B2: a script-made event is no gesture
    const { p } = await page('');
    await p.clickSel('[data-act="menu"]'); await sleep(600);
    const pl = await playedOf(p);
    await p.clickSel('#dlg [data-act="debrief"]'); await sleep(900);
    const d = added(pl, await playedOf(p));
    ok(JSON.stringify(d) === '{"ui.tick":1}', 'W-4: Open debrief (the menu closes, the screen changes) plays one tick, not a tick and a dialog close: ' + JSON.stringify(d));
    await p.close();
    const q = await page('', { play: false });
    await q.p.eval(`document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); document.querySelector('button').click();`); await sleep(500);
    const ctxs = await q.p.eval(`(async()=>{ const { audio } = await import('/js/audio/index.js'); return { ctx: !!audio.context, state: audio.state }; })()`);
    ok(ctxs.ctx === false, 'B2: a script-made pointerdown and click create no AudioContext: ' + JSON.stringify(ctxs));
    await q.p.click(10, 10); await sleep(400);
    ok(await q.p.eval(`(async()=>{ const { audio } = await import('/js/audio/index.js'); return !!audio.context; })()`), 'B2: a real press does');
    await q.p.close();
  }
  {
    // U6: the dashboard's order, and the link a student gets
    const { p } = await page('', { play: false });
    await p.clickSel('[data-act="instr"]'); await sleep(900);
    await p.eval(`document.querySelector('#dlg [data-close]')?.click()`); await sleep(300);
    ok(await p.eval(`(()=>{ const a = document.querySelector('input[data-change="linksound"]'), c = document.querySelector('[data-act="copylink"]'); return !!(a.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING); })()`), 'U6: the Sound in the student link choice comes before Copy student link');
    await p.clickSel('input[data-change="linksound"][value="quiet"]'); await sleep(300);
    ok(await p.eval(`document.querySelector('[data-act="copylink"]').dataset.sound === 'quiet'`), 'U6: and the copy knows what it carries');
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
    // fourth round: the bed stops with it (U4), a card pressed over a fanfare is heard (U5), the tools of the listening checklist run (U12)
    await p.eval(`document.getElementById('amb').checked = true`); await press('bed harbor', 1000);
    ok(await p.eval(`audioAudition.audio.stats().ambient.playing`), 'U4: a bed plays');
    await press('Stop everything', 600);
    ok(!(await p.eval(`audioAudition.audio.stats().ambient.playing`)) && !(await p.eval(`document.getElementById('amb').checked`)) && /ambient bed/.test(await status()), 'U4: Stop everything stopped the bed too, unticked Ambient and said so: ' + (await status()));
    await press('level.up / big', 300); await press('milestone / m3', 500);
    ok(!/silent/.test(await status()), 'U5: a card pressed 300 ms after a fanfare is heard (it was silent with the moment-queue reason): ' + (await status()));
    await p.eval(`audioAudition.audio.stopAll(40)`);
    ok(await p.eval(`document.querySelectorAll('#toc a').length`) >= 15 && await p.eval(`document.querySelector('#toc a').getAttribute('href').startsWith('#g-')`), 'U12: the contents list jumps between the groups');
    await p.eval(`document.getElementById('amb').checked = true`); await press('night', 200);
    ok(await p.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'night').getAttribute('aria-pressed')`) === 'true', 'U12: a modifier says it is on');
    await p.eval(`document.getElementById('mono').click()`); await sleep(300);
    ok(/mono/.test(await status()) && await p.eval(`document.getElementById('mono').checked`), 'U12: the Mono box folds the output: ' + (await status()));
    await p.eval(`document.getElementById('lap').click()`); await sleep(300);
    ok(/laptop speaker/.test(await status()), 'U12: and the Laptop speaker box filters it: ' + (await status()));
    await press('night', 100); await press('ui.tick / full', 300);
    await p.eval(`document.getElementById('mono').click(); document.getElementById('lap').click()`); await sleep(200);
    {
      await press('Start a round', 100);
      for (let i = 0; i < 20; i++) { await p.eval(`document.querySelector('.blind [data-blind="play"]').click()`); await sleep(120); await p.eval(`document.querySelector('.blind [data-kind="gain"]').click()`); }
      const txt = await p.eval(`document.querySelector('.blind').textContent`);
      ok(/Gain against loss: \d+ of 10 right/.test(txt) && /All four kinds: \d+ of 20/.test(txt), 'U12: the Blind round: twenty sounds, a score on gain against loss and a key: ' + txt.slice(0, 120));
    }
    ok(!errors(p).length, 'A3: no console error: ' + errors(p).join(' | ').slice(0, 200));
    await p.close();
  }
} catch (e) { fails.push('script: ' + (e.stack || e.message)); console.log('FAIL script:', e.stack || e.message); } finally { b.close(); srv.close(); }
if (fails.length) { console.log('\n' + fails.length + ' problem(s):'); for (const f of fails) console.log(' -', f); process.exitCode = 1; } else console.log('\nall checks passed');
