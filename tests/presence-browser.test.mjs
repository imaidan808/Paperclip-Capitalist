// The live dashboard in real headless Chrome with two tabs of one profile, over a real relay (in this process, on 127.0.0.1): an instructor (slot ins) and a student (slot ada).
// What this proves that tests/presence-session.test.mjs and tests/presence-dashboard.test.mjs cannot: the real screens say where the student is (the Academy, then the world, then the district they travel to, then away),
// the real engine's events reach the instructor's feed, and the page the instructor looks at changes as it happens, on its own panel. PC_NO_BROWSER=1 or no Chrome: skipped.
// Run: node --test tests/presence-browser.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser, BROWSER, until, sleep, closePage } from './helpers/lessonpage.mjs';
import { ZONES } from '../js/config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = (!BROWSER && 'no Chrome (or PC_NO_BROWSER=1)') || (!existsSync(join(ROOT, 'server/node_modules/ws')) && 'run npm install in server/');
const SIZE = { w: 1100, h: 800, dsf: 1, mobile: false };
let b = null, relay = null;
after(async () => { if (b) await b.close(); if (relay) await relay.close(); });

const click = (p, re) => p.eval(`(()=>{ const b=[...document.querySelectorAll('button')].find(b=>${re}.test(b.textContent.trim()) && !b.disabled); if(!b) return false; b.click(); return true; })()`);
const titleUp = (p) => until(p, `location.protocol==='http:' && document.readyState==='complete' && !window.__old && !!document.querySelector('#app h1') && document.title==='Paperclip Capitalist'`, 'the title screen', 90000);
/** Title -> Join with the room's code -> the draft -> two Backgrounds and an alias -> Begin. */
async function begin(p, { room, alias }) {
  await titleUp(p);
  await p.eval(`document.querySelector('#jc').value = ${JSON.stringify(room)}`);
  assert.ok(await click(p, /^Join$/), 'Join');
  await until(p, `document.title === 'Draft your build | Paperclip Capitalist'`, 'the draft');
  for (const id of ['trades', 'pro']) await until(p, `(() => { const c=[...document.querySelectorAll('input[type=checkbox]')].find(c=>c.value==='${id}'); if(!c) return false; if(!c.checked) c.click(); return c.checked; })()`, 'the Background ' + id);
  await p.eval(`(()=>{ const i=document.querySelector('#handle'); i.value=${JSON.stringify(alias)}; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await until(p, `(() => { const b=[...document.querySelectorAll('button')].find(b=>/^Begin/i.test(b.textContent.trim()) && !b.disabled); b && b.click(); return !!b; })()`, 'Begin');
}
/** The text of the instructor's "Right now" panel, and the roster's. */
const live = (p) => p.eval(`document.querySelector('#ilive').innerText`);
const roster = (p) => p.eval(`document.querySelector('#igrade').innerText`);
/** An expression for the page: what the roster's Now column says of the student with this alias (the fourth cell of their row), or null. */
const nowOf = (alias) => `(() => { const tr = [...document.querySelectorAll('#igrade tbody tr')].find((r) => r.cells[0] && r.cells[0].innerText.startsWith(${JSON.stringify(alias)})); return tr && tr.cells[3] ? tr.cells[3].innerText.trim() : null; })()`;

test('over a real relay the dashboard says Live and follows a student through the Academy, the world, a trip to another district and a hidden tab, with what they do in its feed', { skip: SKIP, timeout: 300000 }, async () => {
  const { createRelay } = await import('../server/relay.mjs');
  relay = createRelay({ env: { PORT: '0' }, log: () => {} });
  const port = await relay.listen(0, '127.0.0.1'), url = `ws://127.0.0.1:${port}`;
  b = await browser();
  const tabs = [], open = async (u) => { const p = await b.open(b.chrome, u, SIZE); tabs.push(p); return p; };
  try {
    // ---- 1. the instructor opens a room on the relay, and the panel says Live
    const inst = await open(`${b.base}/?slot=ins`);
    await titleUp(inst);
    await inst.eval(`document.querySelector('#ir').value = ${JSON.stringify(url)}`);
    assert.ok(await click(inst, /^Create a room$/), 'Create a room');
    await until(inst, `document.title.startsWith('Instructor dashboard') && document.querySelector('dialog#dlg').open`, 'the dashboard');
    await inst.eval(`document.querySelector('dialog#dlg [data-close]').click()`);
    const code = await inst.eval('pc.S.roomInfo.code');
    await until(inst, `pc.S.room.state === 'open' && pc.S.room.can('here') && !!pc.S.presence`, 'the relay to welcome the dashboard', 30000);
    await until(inst, `/Live/.test(document.querySelector('#ilive').innerText) && /No student is here yet/.test(document.querySelector('#ilive').innerText)`, 'the empty Live panel');
    assert.doesNotMatch(await live(inst), /Updates every 4 s/);

    // ---- 2. a student joins from the link; the Academy opens after Begin, and the dashboard says so
    const ada = await open(`${b.base}/?slot=ada&room=${code}&relay=${encodeURIComponent(url)}`);
    await begin(ada, { room: code, alias: 'Ada' });
    await until(ada, `!!document.querySelector('[data-act="ac-leave"]')`, 'the Academy', 60000);
    await until(inst, `pc.S.presence.counts().academy === 1`, 'the dashboard to put Ada in the Academy', 30000);
    await until(inst, `/1 student here: 1 in the Academy/.test(document.querySelector('#ilive').innerText) && /Ada\\s+joined the room/.test(document.querySelector('#ilive').innerText)`, 'the panel to say so, and that Ada joined');
    await until(inst, `${nowOf('Ada')} === 'Academy'`, 'the roster to say Academy in its Now column', 30000);

    // ---- 3. she leaves the Academy: the world, district 1
    await ada.eval(`document.querySelector('[data-act="ac-leave"]').click()`);
    await until(ada, `document.title==='The world | Paperclip Capitalist' && !!document.querySelector('canvas') && !!window.pc.S.game`, 'the world', 60000);
    await until(inst, `pc.S.presence.counts().play === 1 && pc.S.presence.counts().zones[1] === 1`, 'the dashboard to put Ada in district 1', 30000);
    await until(inst, `/1 student here: 1 playing/.test(document.querySelector('#ilive').innerText)`, 'the panel to say she is playing');

    // ---- 4. what the engine does reaches the feed: a purse big enough opens the next districts, and each is an event
    await ada.eval(`pc.S.game.s.cash = 20000; pc.S.game._unlock(); pc.S.save(true)`);
    await until(inst, `pc.S.presence.feed.some(r => r.kind === 'zone')`, 'a district row in the feed', 30000);
    await until(inst, `/Ada\\s+opened /.test(document.querySelector('#ilive').innerText)`, 'the feed on the page');
    const opened = await inst.eval(`pc.S.presence.feed.filter(r => r.kind === 'zone').map(r => r.text)`);
    assert.ok(opened.length >= 1 && opened.every((t) => /^opened [A-Z]/.test(t)), JSON.stringify(opened));

    // ---- 5. she travels to district 2 through the real Travel drawer; the dashboard follows, and so does the roster
    await until(ada, `!!document.querySelector('[data-act="dock"][data-d="travel"]')`, 'the Travel icon, shown once a second district is open', 30000);
    await ada.eval(`document.querySelector('[data-act="dock"][data-d="travel"]').click()`);
    await until(ada, `!!document.querySelector('[data-act="travel-go"][data-dist="2"]')`, 'the way to district 2');
    await ada.eval(`document.querySelector('[data-act="travel-go"][data-dist="2"]').click()`);
    await until(inst, `pc.S.presence.members.get(pc.S.presence.list()[0].pid).z === 2`, 'the dashboard to put Ada in district 2', 30000);
    await until(inst, `(() => { const li = document.querySelectorAll('#ilive .in-dist li')[1]; return !!li && li.dataset.n === '1'; })()`, 'the chart to show one student in district 2');
    await until(inst, `${nowOf('Ada')} === ${JSON.stringify(ZONES[2].short)}`, 'the roster to name district 2 in its Now column', 30000);

    // ---- 6. her tab is hidden: away; and shown again: playing
    await ada.eval(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))`);
    await until(inst, `pc.S.presence.counts().away === 1 && pc.S.presence.counts().play === 0`, 'the dashboard to say Ada is away', 30000);
    await until(inst, `/1 student here: 1 away/.test(document.querySelector('#ilive').innerText)`, 'the panel to say it');
    await ada.eval(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))`);
    await until(inst, `pc.S.presence.counts().play === 1 && pc.S.presence.counts().zones[2] === 1`, 'Ada to be playing in district 2 again', 30000);

    // ---- 7. she closes the tab: the dashboard says she left
    await closePage(ada); tabs.splice(tabs.indexOf(ada), 1);
    await until(inst, `pc.S.presence.counts().here === 0 && pc.S.presence.feed[0].kind === 'left'`, 'the dashboard to say Ada left', 30000);
    await until(inst, `/Ada\\s+left/.test(document.querySelector('#ilive').innerText) && /No student is here yet/.test(document.querySelector('#ilive').innerText)`, 'the panel to say it');
    assert.match(await roster(inst), /Ada/, 'her row stays in the roster as away, with her last numbers');
  } finally { for (const p of tabs) await closePage(p); await sleep(200); }
});
