// node scripts/audio-r5-check.mjs   (PORT and CDP as scripts/audio-r2x-check.mjs: 8605 and 9605 by default)
// The fifth repair round's browser half (docs/AUDIO.md Appendix H), in headless Chrome with the real page, the real engine and a real AudioContext. tests/audio-r5.test.mjs holds the logic on
// stand-ins; this holds what only a browser shows:
//   W2-1  Copy student link where the page has no async clipboard (the clipboard removed here, as on plain http at a LAN address): it copies by the older command, plays a tick and then the toast's ok,
//         and when nothing can copy it shows the link and rings nothing.
//   U1    through the real UI: join by ?room=, move the volume, Start over: Full at the student's volume, one note, and nothing left over for the solo Draft.
//   U2    the test button in Classroom plays its click, its warning and its coins, and the announcement says what a room leaves out.
//   U3    key M raises a toast on the Draft, the dashboard and the game (and the speaker button does), and says it inside an open Deal Room instead.
//   U4    a repair that cannot be afforded has no dial and spends no explanation; the first two dials say where the switch is; the third is short.
//   U5    at the largest text size the Deal Room's header (Sound, Dial tone) is on the screen at the first paint and at the end of the scroll; a phone's is not sticky.
// Prints ok / FAIL per check and exits 1 if any failed.
import { createServer } from 'node:http';
import { handler } from '../server/static.mjs';
import { launch, open } from './cdp.mjs';
const PORT = +process.env.PORT || 8605, CDP = +process.env.CDP || 9605;
const srv = createServer(handler).listen(PORT, '127.0.0.1');
const b = await launch(CDP);
const fails = [];
const ok = (cond, msg) => { console.log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) fails.push(msg); };
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = (p) => p.logs.filter((l) => /^(error|EXC)/.test(l) && !/favicon|Failed to load resource/.test(l));
const settingsOf = `(async()=>{ const c = await import('/js/ui/common.js'); return c.settings.audio; })()`;
const playedOf = (p) => p.eval(`(async()=>{ const { audio } = await import('/js/audio/index.js'); const s = audio.stats(); return { played: { ...s.played }, dropped: { ...s.dropped } }; })()`);
const added = (a, c) => { const o = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(c)])) { const d = (c[k] || 0) - (a[k] || 0); if (d) o[k] = d; } return o; };
const toasts = (p) => p.eval(`[...document.querySelectorAll('#toasts .toast')].map(t=>t.textContent)`);
/** One walk. A fault inside it is one failed check (and the page is closed), not the end of the script: the next walk still runs. */
async function walk(name, fn) { let p = null; try { await fn((x) => (p = x)); } catch (e) { ok(false, `${name}: the walk stopped: ${(e && e.message) || e}`); } finally { try { await p?.close(); } catch { /* gone */ } } }

/** A page on its own storage slot, with the Academy done, optionally with settings in place before the first paint, and optionally with a run started through the real draft. */
async function page(query, { w = 1366, h = 768, settings = null, play = false, mobile = false } = {}) {
  const slot = 'r5' + Math.floor(Math.random() * 1e6), url = `${BASE}/?slot=${slot}${query}`;
  const p = await open(b, url, { w, h, mobile });
  await p.eval(`localStorage.setItem('pc.academyDone.${slot}', 'true')`);
  if (settings) { await p.eval(`localStorage.setItem('pc.settings.${slot}', JSON.stringify(${JSON.stringify(settings)}))`); await p.send('Page.navigate', { url }); await sleep(1000); }
  if (play) {
    await p.eval(`(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)); [...document.querySelectorAll('button')].find(b=>/Play solo/i.test(b.textContent)).click(); await wait(500);
      for (const id of ['trades','pro']) { document.querySelector('.dr-in[value="'+id+'"]')?.click(); await wait(100); }
      [...document.querySelectorAll('button')].find(b=>/^Begin/i.test(b.textContent.trim())).click(); await wait(1800); })()`);
  }
  return { p, slot };
}
/** A broken radio in the player's hands and some cash, then the repair room opened through the Stock drawer as a player does it. */
const give = (p, cash) => p.eval(`(()=>{ const g = pc.S.game; if (!g.s.assets.some(a => a.cond === 'broken')) { const a = g._mk(g.s, 'radio', { cond: 'broken', zone: g.s.zones[0], basis: 12 }); g.s.assets.push(a); } g.s.cash = ${cash}; pc.S.emit('change'); })()`);
async function openRepair(p) {
  if (!(await p.eval(`!!document.querySelector('#drawer button')`))) { await p.eval(`document.querySelector('[data-anchor="dock-stock"]').click()`); await sleep(600); }
  await p.eval(`[...document.querySelectorAll('#drawer button')].find(b=>/^Repair/.test(b.textContent.trim()))?.click()`); await sleep(900);
}
const sayInSheet = (p) => p.eval(`[...document.querySelectorAll('#dlg [data-say]')].map(e=>e.textContent).join(' / ')`);

try {
  // ============================================================ W2-1: Copy student link with no clipboard
  await walk('W2-1', async (keep) => {
    const { p } = await page(''); keep(p);
    await p.clickSel('[data-act="instr"]'); await sleep(1100);
    await p.eval(`document.querySelector('#dlg [data-close]')?.click()`); await sleep(400); // the room's recovery code is shown first, in a modal sheet
    await p.eval(`window.__sel = null; document.addEventListener('copy', () => { const a = document.activeElement; window.__sel = String(getSelection()) || (a && a.value ? a.value.slice(a.selectionStart, a.selectionEnd) : ''); }, true); Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); 1`);
    const link = await p.eval(`document.querySelector('[data-act="copylink"]').dataset.link`);
    let a = await playedOf(p);
    await p.clickSel('[data-act="copylink"]'); await sleep(500);
    let d = added(a.played, (await playedOf(p)).played);
    const t1 = await toasts(p);
    ok(t1.includes('Student link copied.'), 'W2-1: with no navigator.clipboard the link is copied by the older command, and the toast says so: ' + JSON.stringify(t1));
    ok(await p.eval(`window.__sel`) === link, 'W2-1: the text that was selected for the copy is the link: ' + (await p.eval(`window.__sel`)));
    ok(await p.eval(`document.activeElement === document.querySelector('[data-act="copylink"]') && !document.querySelector('textarea[aria-hidden="true"][readonly]')`), 'W2-1: the cursor is back on the button and the field it made is gone');
    ok(d['ui.tick'] === 1 && d['ui.ok'] === 1 && Object.keys(d).length === 2, 'W2-1: a tick at the click and the copy\'s own ok after it (it was one ok, before anything was copied): ' + JSON.stringify(d));
    // nothing can copy: the command says no
    await p.eval(`document.execCommand = () => false; document.querySelector('.toast')?.remove(); 1`); await sleep(100);
    a = await playedOf(p);
    await p.clickSel('[data-act="copylink"]'); await sleep(500);
    d = added(a.played, (await playedOf(p)).played);
    const t2 = await toasts(p);
    ok(t2.some((x) => x === `Could not copy it by itself. The student link is ${link}`), 'W2-1: when nothing can copy, the toast carries the link: ' + JSON.stringify(t2));
    ok(JSON.stringify(d) === '{"ui.tick":1}', 'W2-1: and only the tick rings (no ok for a copy that did not happen): ' + JSON.stringify(d));
    // the quiet box: the toast says what the link carries
    await p.eval(`document.execCommand = Document.prototype.execCommand; 1`);
    await p.clickSel('input[data-change="linkquiet"]'); await sleep(300);
    await p.clickSel('[data-act="copylink"]'); await sleep(400);
    ok((await toasts(p)).includes('Student link copied, with quiet sound.'), 'W2-1: with the quiet box ticked the toast says what the link carries: ' + JSON.stringify(await toasts(p)));
    ok(await p.eval(`window.__sel`) === link + '&sound=quiet', 'W2-1: and the link that was copied has the flag');
    // a clipboard that refuses (permission denied): the command is tried after it
    await p.eval(`Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true }); window.__sel = null; 1`);
    await p.clickSel('[data-act="copylink"]'); await sleep(400);
    ok(await p.eval(`window.__sel`) === link + '&sound=quiet', 'W2-1: a clipboard that refuses is followed by the command: ' + (await p.eval(`window.__sel`)));
    ok(!errors(p).length, 'W2-1: no console error: ' + errors(p).join(' | ').slice(0, 200));
    await p.close();
  });

  // ============================================================ U1: leaving a room with the volume moved
  await walk('U1', async (keep) => {
    const { p, slot } = await page('&room=ABCD'); keep(p);
    await p.clickSel('[data-act="join"]'); await sleep(700);
    await p.eval(`document.querySelectorAll('.dr-in')[0].click(); document.querySelectorAll('.dr-in')[1].click(); 1`); await sleep(200);
    await p.clickSel('#dr-begin'); await sleep(2600);
    ok((await p.eval(settingsOf)).quiet === true, 'U1: in the game, in the room: Classroom');
    await p.clickSel('[data-act="menu"]'); await sleep(300);
    await p.eval(`[...document.querySelectorAll('#dlg button')].find(b=>/display and sound/i.test(b.textContent)).click()`); await sleep(400);
    await p.eval(`(()=>{ const e = document.querySelector('#s-vol'); e.value = 50; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(300);
    let a = await p.eval(settingsOf);
    ok(a.master === 50 && a.touched === true && a.quiet === true, 'U1: the volume is 50 and the room is still Classroom: ' + JSON.stringify({ master: a.master, touched: a.touched, quiet: a.quiet }));
    await p.key('Escape'); await sleep(300);
    await p.clickSel('[data-act="menu"]'); await sleep(300);
    await p.clickSel('#dlg [data-act="reset"]'); await sleep(400);
    await p.eval(`[...document.querySelectorAll('#dlg button')].find(b=>/Delete and restart/i.test(b.textContent)).click()`); await sleep(1500);
    a = await p.eval(settingsOf);
    ok(a.quiet === false && a.clockSounds === true && a.master === 50 && a.touched === false, 'U1: after Start over, at the title: Full at the student\'s own volume, and the next room is a room again: ' + JSON.stringify({ quiet: a.quiet, clock: a.clockSounds, master: a.master, touched: a.touched }));
    ok(!(await p.eval(`localStorage.getItem('pc.audioBeforeRoom.${slot}')`)), 'U1: the remembered values were used and are gone');
    const t = await toasts(p);
    ok(t.some((x) => x === 'Sound is back to Full: Classroom sound applies only in a room.'), 'U1: one note says what the sound is now: ' + JSON.stringify(t));
    await p.clickSel('[data-act="a11y"]'); await sleep(500);
    ok(await p.eval(`document.querySelector('#s-preset').value`) === 'full', 'U1: Display and sound says Full, not Classroom (quieter)');
    await p.close();
  });

  // ============================================================ U2: the test button in Classroom
  await walk('U2', async (keep) => {
    const { p } = await page('&room=ABCD&sound=quiet'); keep(p);
    await p.clickSel('[data-act="a11y"]'); await sleep(500);
    ok(await p.eval(`document.querySelector('#s-preset').value`) === 'classroom', 'U2: the preset is Classroom');
    const a = await playedOf(p);
    await p.eval(`document.querySelector('#s-sample').click()`); await sleep(2400);
    const c = await playedOf(p), d = added(a.played, c.played), dr = added(a.dropped, c.dropped);
    ok(d['ui.tick'] === 1 && d['alert.advance'] === 1 && d['cash.in'] === 1, 'U2: the click, the warning and the coins all play in Classroom: ' + JSON.stringify(d));
    ok(!dr.quiet, 'U2: and nothing is dropped as "quiet": ' + JSON.stringify(dr));
    const say = await sayInSheet(p);
    ok(/Playing a test: a click, a warning, then coins\. Classroom leaves out the smallest game sounds and the clock sounds\./.test(say), 'U2: the announcement says what a room leaves out: ' + say);
    ok(!errors(p).length, 'U2: no console error: ' + errors(p).join(' | ').slice(0, 200));
    await p.close();
  });

  // ============================================================ U3: key M and the speaker say what they did
  await walk('U3 (Draft)', async (keep) => {
    const { p } = await page(''); keep(p);
    await p.clickSel('[data-act="solo"]'); await sleep(900); // the Draft: no speaker button here
    await p.eval(`document.getElementById('toasts').innerHTML = ''; 1`);
    await p.key('m'); await sleep(400);
    let t = await toasts(p);
    ok((await p.eval(settingsOf)).mute === true && t.includes('Sound off. Press M to turn it back on.'), 'U3: on the Draft, M mutes and a toast says so: ' + JSON.stringify(t));
    const vis = await p.eval(`(()=>{ const e = [...document.querySelectorAll('#toasts .toast')].find(x => /Sound off/.test(x.textContent)); const r = e.getBoundingClientRect(), f = document.querySelector('.dr-actions'); const fr = f && f.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight, w: r.width, op: getComputedStyle(e).opacity, overlap: !!(fr && r.bottom > fr.top + 1 && r.top < fr.bottom) }; })()`);
    ok(vis.w > 0 && vis.top >= 0 && vis.bottom <= vis.h && !vis.overlap, 'U3: it is on the screen and not over the Draft\'s footer: ' + JSON.stringify(vis));
    ok(/Sound off\. Press M to turn it back on\./.test(await p.eval(`document.querySelector('#live').textContent`)), 'U3: and it is said once, by the toast (the live region holds the same words)');
    await p.key('m'); await sleep(400);
    t = await toasts(p);
    ok((await p.eval(settingsOf)).mute === false && t.includes('Sound on.'), 'U3: M again: unmuted and said: ' + JSON.stringify(t));
    await p.close();
  });
  await walk('U3 (dashboard)', async (keep) => {
    const { p } = await page(''); keep(p);
    await p.clickSel('[data-act="instr"]'); await sleep(1100);
    await p.eval(`document.querySelector('#dlg [data-close]')?.click()`); await sleep(400);
    await p.eval(`document.getElementById('toasts').innerHTML = ''; 1`);
    await p.key('m'); await sleep(400);
    ok((await toasts(p)).includes('Sound off. Press M to turn it back on.'), 'U3: on the instructor dashboard, which has no speaker button, M is seen too: ' + JSON.stringify(await toasts(p)));
    await p.close();
  });
  await walk('U3 (game and Deal Room)', async (keep) => {
    const { p } = await page('', { play: true }); keep(p);
    await p.eval(`document.getElementById('toasts').innerHTML = ''; 1`);
    await p.clickSel('[data-act="sound"]'); await sleep(400);
    let t = await toasts(p);
    ok(t.includes('Sound off. Press M to turn it back on.') && await p.eval(`document.querySelector('[data-act="sound"]').getAttribute('aria-pressed')`) === 'false', 'U3: the HUD\'s speaker button mutes, changes its icon and raises the same toast: ' + JSON.stringify(t));
    await p.clickSel('[data-act="sound"]'); await sleep(400);
    ok((await toasts(p)).includes('Sound on.'), 'U3: and again: Sound on.');
    // inside the Deal Room a toast would be under the backdrop: the words are spoken in the sheet, and no toast is raised
    await give(p, 100); await openRepair(p);
    ok(await p.eval(`document.querySelector('#dlg').open && !!document.querySelector('.deal')`), 'U3: the Deal Room is open');
    await p.eval(`document.getElementById('toasts').innerHTML = ''; 1`);
    await p.key('m'); await sleep(500);
    ok((await toasts(p)).length === 0, 'U3: in the open Deal Room M raises no toast (it would be under the sheet): ' + JSON.stringify(await toasts(p)));
    ok(/Sound off\. Press M to turn it back on\./.test(await sayInSheet(p)), 'U3: it is said inside the sheet: ' + (await sayInSheet(p)));
    ok((await p.eval(settingsOf)).mute === true, 'U3: and sound is muted');
    ok(!errors(p).length, 'U3: no console error: ' + errors(p).join(' | ').slice(0, 200));
    await p.close();
  });

  // ============================================================ U4: the dial's explanation waits for a dial
  await walk('U4', async (keep) => {
    const { p } = await page('', { play: true }); keep(p);
    await give(p, 0); await openRepair(p);
    ok(await p.eval(`!!document.querySelector('.deal[data-kind="repair"]') && !document.querySelector('.dial')`), 'U4: with no cash the repair room opens and draws no dial');
    let say = await sayInSheet(p);
    ok(!/A marker moves/.test(say) && /A repair here can run to .* and you have \$0/.test(say), 'U4: and says what is true, not a dial that is not there: ' + say.slice(-170));
    await p.key('Escape'); await sleep(500);
    await give(p, 100); await openRepair(p);
    ok(await p.eval(`!!document.querySelector('.dial')`), 'U4: with cash the dial is drawn');
    say = await sayInSheet(p);
    ok(/Fix\. A marker moves across a bar by itself/.test(say) && /Dial tone button, to follow it by ear/.test(say), 'U4: and now the room explains it, once: ' + say.slice(-190));
    let ear = await p.eval(`document.getElementById('dial-ear')?.textContent`);
    ok(/^Prefer to listen\? Turn on Repair dial tone with the Dial tone switch next to Sound, or in Display and sound\./.test(ear || ''), 'U4: the line under the dial does not depend on where the header is: ' + ear);
    await p.key('Escape'); await sleep(500);
    await openRepair(p);
    ear = await p.eval(`document.getElementById('dial-ear')?.textContent`);
    ok(ear === 'Dial tone is off: use the Dial tone switch next to Sound to follow it by ear. Careful needs no timing.', 'U4: the second dial of the run says where the switch is: ' + ear);
    ok(!/A marker moves/.test(await sayInSheet(p)), 'U4: and does not announce the whole explanation again');
    await p.key('Escape'); await sleep(500);
    await openRepair(p);
    ear = await p.eval(`document.getElementById('dial-ear')?.textContent`);
    ok(ear === 'Dial tone is off. Careful needs no timing.', 'U4: the third is the short line: ' + ear);
    ok(!errors(p).length, 'U4: no console error: ' + errors(p).join(' | ').slice(0, 200));
    await p.close();
  });

  // ============================================================ U5: the header stays in view
  for (const [size, w, h] of [['xl', 1366, 768], ['l', 1366, 768], ['m', 1366, 768]]) await walk(`U5 (${size})`, async (keep) => {
    const { p } = await page('', { play: true, w, h, settings: { contrast: 'normal', motion: 'auto', size } }); keep(p);
    await give(p, 100); await openRepair(p);
    const m = await p.eval(`(()=>{ const d = document.querySelector('#dlg'), q = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }; return { scroll: d.scrollTop, whole: d.scrollHeight, client: d.clientHeight, dtop: d.getBoundingClientRect().top, head: q('.deal-top'), sound: q('[data-deal="sound"]'), dial: q('[data-deal="dialtone"]'), stop: q('[data-deal="stop"]'), size: document.documentElement.dataset.size, pos: getComputedStyle(document.querySelector('.deal-top')).position, h: innerHeight }; })()`);
    const inView = (r) => r && r.top >= 0 && r.bottom <= m.h;
    ok(m.size === size, `U5 (${size}): the text size is set: ` + m.size);
    ok(inView(m.head) && inView(m.sound) && inView(m.dial), `U5 (${size}): at the first paint the header, Sound and Dial tone are on the screen (scrolled ${Math.round(m.scroll)} of ${m.whole - m.client}): ` + JSON.stringify({ head: m.head, sound: m.sound }));
    ok(m.stop && m.stop.top >= m.head.bottom - 1 && m.stop.bottom <= m.h, `U5 (${size}): Stop is below the header and on the screen, so the header does not hide what the cursor lands on: ` + JSON.stringify({ headBottom: m.head.bottom, stop: m.stop }));
    ok(m.pos === 'sticky', `U5 (${size}): the header is sticky`);
    await p.eval(`document.querySelector('#dlg').scrollTop = 0`); await sleep(150);
    const top = await p.eval(`(()=>{ const r = document.querySelector('.deal-top').getBoundingClientRect(), d = document.querySelector('#dlg').getBoundingClientRect(); return { y: r.top - d.top }; })()`);
    ok(top.y > 4 && top.y < 60, `U5 (${size}): at the very top of the sheet the header is where it always was, not moved: y=${Math.round(top.y)}`);
    await p.eval(`document.querySelector('#dlg').scrollTop = 99999`); await sleep(150);
    const end = await p.eval(`(()=>{ const r = document.querySelector('.deal-top').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight }; })()`);
    ok(end.top >= 0 && end.bottom <= end.h, `U5 (${size}): and at the end of the scroll it is still there: ` + JSON.stringify(end));
    ok(!errors(p).length, `U5 (${size}): no console error: ` + errors(p).join(' | ').slice(0, 200));
    await p.close();
  });
  await walk('U5 (phone)', async (keep) => {
    const { p } = await page('', { play: true, w: 390, h: 844, mobile: true, settings: { contrast: 'normal', motion: 'auto', size: 'xl' } }); keep(p);
    await give(p, 100); await openRepair(p);
    const pos = await p.eval(`getComputedStyle(document.querySelector('.deal-top')).position`);
    ok(pos !== 'sticky', 'U5: a phone\'s header, three rows tall, is not sticky: ' + pos);
    await p.close();
  });
} catch (e) { fails.push('script: ' + (e.stack || e.message)); console.log('FAIL script:', e.stack || e.message); } finally { b.close(); srv.close(); }
if (fails.length) { console.log('\n' + fails.length + ' problem(s):'); for (const f of fails) console.log(' -', f); process.exitCode = 1; } else console.log('\nall checks passed');
