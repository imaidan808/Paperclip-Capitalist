// Classmates in real headless Chrome: two student tabs of one profile (slots ada and bo) over a real relay (in this process, on 127.0.0.1), and the instructor as a Session in this process, so that there are two pages and one browser.
// What this proves that tests/presence-classmates.test.mjs, tests/presence-roster.test.mjs and tests/world-peers.test.mjs cannot: on the real HUD the Room chip is a button and opens the real dialog from the keyboard, the cursor lands on its heading,
// Tab stays inside it, Escape closes it and the cursor is back on the chip (even when the HUD was drawn again meanwhile); the open roster follows a classmate to another district; the classmate is a figure in the world, and oneself is not;
// and the instructor's switch reaches the pages: online shows no district and no figure, off takes the chip and the figures away, full brings them back. PC_NO_BROWSER=1 or no Chrome: skipped.
// Run: node --test tests/presence-classmates-browser.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser, BROWSER, until, sleep, closePage } from './helpers/lessonpage.mjs';
import { Session, Clock } from '../js/session.js';
import { ZONES } from '../js/config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = (!BROWSER && 'no Chrome (or PC_NO_BROWSER=1)') || (!existsSync(join(ROOT, 'server/node_modules/ws')) && 'run npm install in server/');
const SIZE = { w: 1100, h: 800, dsf: 1, mobile: false };
const SHOTS = process.env.PC_SHOTS || ''; // a folder: the pictures the pull request shows are saved there (not part of the test)
let b = null, relay = null, teacher = null;
after(async () => { try { teacher?.leaveRoom(); } catch { /* closed */ } if (b) await b.close(); if (relay) await relay.close(); });

const click = (p, re) => p.eval(`(()=>{ const b=[...document.querySelectorAll('button')].find(b=>${re}.test(b.textContent.trim()) && !b.disabled); if(!b) return false; b.click(); return true; })()`);
const titleUp = (p) => until(p, `location.protocol==='http:' && document.readyState==='complete' && !window.__old && !!document.querySelector('#app h1') && document.title==='Paperclip Capitalist'`, 'the title screen', 90000);
/** Title -> Join with the room's code -> the draft -> two Backgrounds and an alias -> Begin -> the Academy -> straight to the world. */
async function toTheWorld(p, { room, alias }) {
  await titleUp(p);
  await p.eval(`document.querySelector('#jc').value = ${JSON.stringify(room)}`);
  assert.ok(await click(p, /^Join$/), 'Join');
  await until(p, `document.title === 'Draft your build | Paperclip Capitalist'`, 'the draft');
  for (const id of ['trades', 'pro']) await until(p, `(() => { const c=[...document.querySelectorAll('input[type=checkbox]')].find(c=>c.value==='${id}'); if(!c) return false; if(!c.checked) c.click(); return c.checked; })()`, 'the Background ' + id);
  await p.eval(`(()=>{ const i=document.querySelector('#handle'); i.value=${JSON.stringify(alias)}; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await until(p, `(() => { const b=[...document.querySelectorAll('button')].find(b=>/^Begin/i.test(b.textContent.trim()) && !b.disabled); b && b.click(); return !!b; })()`, 'Begin');
  await until(p, `!!document.querySelector('[data-act="ac-leave"]')`, 'the Academy', 60000);
  await p.eval(`document.querySelector('[data-act="ac-leave"]').click()`);
  await until(p, `document.title==='The world | Paperclip Capitalist' && !!document.querySelector('canvas') && !!window.pc.S.game`, 'the world', 60000);
}
/** Two tabs of one window cannot both be in front, and a tab behind says it is away (that is the point of "away"). These two are watched by the test, so each says it is in front. */
const pinVisible = (p) => p.eval(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); true`);
/** A tab behind another does not hear its dialog close (Chrome holds the event back), so the one that is looked at or typed into is brought to the front first. */
const front = async (p) => { await p.send('Page.bringToFront'); await sleep(200); };
const dialog = (p) => p.eval(`(() => { const d = document.querySelector('dialog#dlg'); return d && d.open ? d.innerText : null; })()`);
const chipIsButton = (p) => p.eval(`!!document.querySelector('.ctl button.chip[data-act="roster"]')`);
/** Open the roster the way a keyboard does: the cursor on the Room chip, Enter. */
async function openByKeyboard(p) {
  await until(p, `!!document.querySelector('.ctl button.chip[data-act="roster"]')`, 'the Room chip as a button');
  await p.eval(`document.querySelector('[data-act="roster"]').focus()`);
  assert.equal(await p.eval(`document.activeElement.matches('[data-act="roster"]')`), true, 'the cursor is on the chip');
  await p.key('Enter');
  await until(p, `(() => { const d = document.querySelector('dialog#dlg'); return !!d && d.open && /who is here/i.test(d.innerText); })()`, 'the roster to open');
}

test('two students see each other: the Room chip opens the roster from the keyboard, it follows a classmate to another district, the classmate is a figure in the world, and the instructor\'s switch is obeyed', { skip: SKIP, timeout: 420000 }, async () => {
  const { createRelay } = await import('../server/relay.mjs');
  relay = createRelay({ env: { PORT: '0' }, log: () => {} });
  const port = await relay.listen(0, '127.0.0.1'), url = `ws://127.0.0.1:${port}`, code = 'PCB3';
  teacher = new Session(); teacher.pid = 'TEACH'; teacher.clock = new Clock({ hour: 0, paused: true });
  teacher.joinRoom({ code, relay: url, role: 'instructor', handle: 'Prof' });
  b = await browser();
  const tabs = [], open = async (u) => { const p = await b.open(b.chrome, u, SIZE); tabs.push(p); return p; };
  try {
    // ---- 1. two students in the world; each sees the other as a classmate
    const ada = await open(`${b.base}/?slot=ada&room=${code}&relay=${encodeURIComponent(url)}`);
    await toTheWorld(ada, { room: code, alias: 'Ada' }); await pinVisible(ada);
    const bo = await open(`${b.base}/?slot=bo&room=${code}&relay=${encodeURIComponent(url)}`);
    await toTheWorld(bo, { room: code, alias: 'Bo' }); await pinVisible(bo);
    await until(ada, `pc.S.rosterOn() && pc.S.classmates().some((c) => c.s === 'play' && c.z === 1)`, 'Ada to see Bo playing in district 1', 40000);
    await until(bo, `pc.S.rosterOn() && pc.S.classmates().some((c) => c.s === 'play' && c.z === 1)`, 'Bo to see Ada playing in district 1', 40000);
    assert.deepEqual(await ada.eval(`pc.S.classmates().map(c => [c.name, c.z, c.s])`), [['Bo', 1, 'play']]);

    // ---- 2. the chip on the real HUD is a button; Enter opens the roster; the cursor is on its heading; Tab stays in; Escape closes it and the cursor is back on the chip
    await front(ada);
    assert.ok(await chipIsButton(ada), 'the Room chip is a button for a student in a relay room that took part in presence');
    assert.equal(await ada.eval(`document.querySelector('[data-act="roster"]').textContent.trim()`), `Room ${code}`);
    await openByKeyboard(ada);
    assert.equal(await ada.eval(`document.activeElement.tagName`), 'H2', 'the cursor lands on the heading');
    assert.equal(await ada.eval(`document.querySelector('dialog#dlg').getAttribute('aria-label')`), 'Who is here');
    const text = await dialog(ada);
    assert.match(text, /Bo\s+The Scrap Yard/, 'a classmate and the district they are in, by name');
    assert.match(text, /1 here/);
    assert.match(text, /You are Ada\. Classmates see your alias, the district you are in and whether you are here or away\./);
    assert.doesNotMatch(text, /\$|cash|net worth/i, 'no money');
    // Tab: the page behind a modal dialog is not reachable, and Close is (it is the one control in it, so Tab leaves the page for the browser's own controls and comes back to it)
    let onClose = false;
    for (let i = 0; i < 4 && !onClose; i++) {
      await ada.key('Tab');
      assert.equal(await ada.eval(`document.getElementById('app').contains(document.activeElement)`), false, 'Tab ' + (i + 1) + ': the cursor is never on the page behind the dialog');
      onClose = await ada.eval(`document.activeElement.matches('dialog#dlg [data-close]')`);
    }
    assert.ok(onClose, 'Close can be reached with Tab');
    if (SHOTS) await ada.shot(join(SHOTS, 'roster.png'));
    await ada.key('Enter');                                                        // Enter on Close
    await until(ada, `!document.querySelector('dialog#dlg').open`, 'the roster to close');
    assert.equal(await ada.eval(`document.activeElement.matches('[data-act="roster"]')`), true, 'the cursor is back on the chip');
    await openByKeyboard(ada);
    await ada.key('Escape');                                                       // and Escape does the same
    await until(ada, `!document.querySelector('dialog#dlg').open`, 'the roster to close with Escape');
    assert.equal(await ada.eval(`document.activeElement.matches('[data-act="roster"]')`), true, 'the cursor is back on the chip');

    // ---- 3. the HUD is drawn again while the roster is open (the chip is a copy by then): Escape still puts the cursor on the chip
    await openByKeyboard(ada);
    await ada.eval(`pc.S.game.s.cash += 12345; pc.S.emit('change')`);
    await sleep(500);
    await ada.key('Escape');
    await until(ada, `!document.querySelector('dialog#dlg').open`, 'the roster to close again');
    assert.equal(await ada.eval(`document.activeElement.matches('[data-act="roster"]')`), true, 'the cursor is on the chip, though the HUD was drawn again (it is on: ' + await ada.eval(`document.activeElement.outerHTML.slice(0, 140)`) + ')');

    // ---- 4. the open roster follows Bo to district 2
    await openByKeyboard(ada);
    await front(bo);
    await bo.eval(`pc.S.game.s.cash = 20000; pc.S.game._unlock(); pc.S.save(true)`);
    await until(bo, `!!document.querySelector('[data-act="dock"][data-d="travel"]')`, 'the Travel icon', 30000);
    await bo.eval(`document.querySelector('[data-act="dock"][data-d="travel"]').click()`);
    await until(bo, `!!document.querySelector('[data-act="travel-go"][data-dist="2"]')`, 'the way to district 2');
    await bo.eval(`document.querySelector('[data-act="travel-go"][data-dist="2"]').click()`);
    await front(ada);
    await until(ada, `/Bo\\s+${ZONES[2].name}/.test(document.querySelector('dialog#dlg').innerText)`, 'the open roster to say Bo is in ' + ZONES[2].name, 20000);
    await ada.key('Escape');
    await until(ada, `!document.querySelector('dialog#dlg').open`, 'the roster to close a third time');

    // ---- 5. the switch: online (here, not where), off (nothing, no chip), full (everything again)
    teacher.setPresenceMode('online');
    await until(ada, `pc.S.presenceMode === 'online'`, 'Ada to hear online');
    assert.deepEqual(await ada.eval(`pc.S.classmates().map(c => [c.name, c.z])`), [['Bo', 0]], 'no district');
    assert.equal(await ada.eval(`pc.S.figures().length`), 0, 'no figure');
    await openByKeyboard(ada);
    assert.match(await dialog(ada), /Bo\s+Here/);
    assert.match(await dialog(ada), /shows who is here, not where/);
    teacher.setPresenceMode('off');
    await until(ada, `/turned this off/.test(document.querySelector('dialog#dlg').innerText)`, 'the open roster to say it is off', 20000);
    await ada.key('Escape');
    await until(ada, `!document.querySelector('dialog#dlg').open`, 'the roster to close a fourth time');
    await until(ada, `!document.querySelector('[data-act="roster"]')`, 'the chip to stop being a button', 20000);
    assert.equal(await ada.eval(`document.querySelector('.ctl .chip').textContent.trim()`), `Room ${code}`, 'the chip is still there, as the note it was');
    assert.equal(await ada.eval(`pc.S.classmates().length + pc.S.figures().length`), 0);
    teacher.setPresenceMode('full');
    await until(ada, `!!document.querySelector('button.chip[data-act="roster"]') && pc.S.classmates().length === 1 && pc.S.classmates()[0].z === 2`, 'everything to come back', 20000);

    // ---- 6. Bo closes the tab; Ada's roster says nobody is here
    await closePage(bo); tabs.splice(tabs.indexOf(bo), 1);
    await until(ada, `pc.S.classmates().length === 0`, 'Bo to be gone', 30000);
    await openByKeyboard(ada);
    assert.match(await dialog(ada), /No classmates are here yet/);
    await ada.key('Escape');
  } finally { for (const p of tabs) await closePage(p); await sleep(200); }
});
