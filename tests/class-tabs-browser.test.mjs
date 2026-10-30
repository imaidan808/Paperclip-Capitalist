// The classroom between the tabs of ONE browser, in real headless Chrome with three tabs of one profile: an instructor and two students, the students opened with the plain "Copy student link" (origin + path + ?room=CODE).
// What this proves that tests/class-tabs.test.mjs cannot: the page's own sessionStorage and localStorage, the real title screen and draft, a real refresh (pagehide, then a new document), the dashboard the instructor reads,
// and a copied tab (Duplicate tab hands over the sessionStorage). PC_NO_BROWSER=1 or no Chrome: skipped.
// Run: node --test tests/class-tabs-browser.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { browser, BROWSER, until, sleep, closePage } from './helpers/lessonpage.mjs';

const SIZE = { w: 1100, h: 800, dsf: 1, mobile: false };
let b = null;
after(async () => { if (b) await b.close(); });

const click = (p, re) => p.eval(`(()=>{ const b=[...document.querySelectorAll('button')].find(b=>${re}.test(b.textContent.trim()) && !b.disabled); if(!b) return false; b.click(); return true; })()`);
const titleUp = (p) => until(p, `location.protocol==='http:' && document.readyState==='complete' && !window.__old && !!document.querySelector('#app h1') && document.title==='Paperclip Capitalist'`, 'the title screen', 90000);
const inWorld = (p) => until(p, `document.title==='The world | Paperclip Capitalist' && !!document.querySelector('canvas') && !!window.pc.S.game`, 'the world', 60000);
/** The page asks the browser to load the address again, and is waited for as the NEW document (a marker on the old one). */
async function reload(p) { await p.eval(`window.__old = 1; location.reload()`); await sleep(300); await titleUp(p); }
/** Title -> (Join with the room's code | Play solo) -> the draft -> two Backgrounds and an alias -> Begin. */
async function begin(p, { room, alias }) {
  await titleUp(p);
  if (room) { await p.eval(`document.querySelector('#jc').value = ${JSON.stringify(room)}`); assert.ok(await click(p, /^Join$/), 'Join'); } else assert.ok(await click(p, /^(Play solo|New solo run)$/), 'Play solo');
  await until(p, `document.title === 'Draft your build | Paperclip Capitalist'`, 'the draft');
  const shown = await p.eval(`document.querySelector('#handle').value`);
  for (const id of ['trades', 'pro']) await until(p, `(() => { const c=[...document.querySelectorAll('input[type=checkbox]')].find(c=>c.value==='${id}'); if(!c) return false; if(!c.checked) c.click(); return c.checked; })()`, `the ${id} Background`);
  await p.eval(`(()=>{ const i=document.querySelector('#handle'); i.value=${JSON.stringify(alias)}; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await until(p, `(() => { const b=[...document.querySelectorAll('button')].find(b=>/^Begin/i.test(b.textContent.trim()) && !b.disabled); b && b.click(); return !!b; })()`, 'Begin');
  return { aliasShown: shown };
}
const local = (p, key) => p.eval(`localStorage.getItem(${JSON.stringify(key)})`);
const pidOf = (p) => p.eval('pc.S.pid');
const students = (p) => p.eval(`JSON.stringify(pc.S.students().filter(s=>!s.synth).map(s=>({pid:s.pid, handle:s.handle, online:s.online})))`).then(JSON.parse);

test('a same-browser classroom works as the dashboard says: the plain student link, one tab each, both counted, a message each way, a refresh keeps the student, saves apart, an old save intact', { skip: !BROWSER && 'no Chrome here (the same flow is walked on the in-process channel in class-tabs.test.mjs)', timeout: 300000 }, async () => {
  b = await browser();
  const open = (url) => b.open(b.chrome, url, SIZE);
  const tabs = [];
  const mk = async (url) => { const p = await open(url); tabs.push(p); return p; };
  try {
    // ---- 0. a solo player who used this browser before: a run saved in the browser's own slot (what every earlier build wrote)
    const solo = await mk(b.base + '/');
    await titleUp(solo);
    await solo.eval(`localStorage.setItem('pc.academyDone.main', 'true')`);          // (the Academy is the browser's: not what is being proved)
    await begin(solo, { alias: 'Olivia' }); await inWorld(solo);
    await solo.eval(`pc.S.save(true)`);
    await closePage(solo); tabs.splice(tabs.indexOf(solo), 1);

    // ---- 1. the instructor creates a room in a plain tab
    const inst = await mk(b.base + '/');
    await titleUp(inst);
    assert.ok(await click(inst, /^Create a room$/));
    await until(inst, `document.title.startsWith('Instructor dashboard') && document.querySelector('dialog#dlg').open`, 'the dashboard');
    await inst.eval(`document.querySelector('dialog#dlg [data-close]').click()`);
    const code = await inst.eval('pc.S.roomInfo.code'), link = await inst.eval(`document.querySelector('[data-act=copylink]').dataset.link`);
    assert.equal(link, `${b.base}/?room=${code}`, 'Copy student link is origin + path + ?room=CODE, with no slot');
    const instPid = await pidOf(inst);
    assert.equal(instPid, JSON.parse(await local(inst, 'pc.pid.main')), 'the instructor is the browser\'s founder');
    const oldKeys = Object.fromEntries(await Promise.all(['pid', 'key', 'handle', 'save'].map(async (n) => [n, await local(inst, `pc.${n}.main`)])));
    assert.ok(oldKeys.save && JSON.parse(oldKeys.save).state.handle === 'Olivia', 'the solo run is still saved in the browser\'s slot');

    // ---- 2. two student tabs, opened with the link exactly as the dashboard gives it
    const ada = await mk(link), grace = await mk(link);
    for (const p of [ada, grace]) { await titleUp(p); assert.equal(await p.eval(`document.querySelector('#jc').value`), code, 'the link fills in the room code'); }
    const draftAda = await begin(ada, { room: code, alias: 'Ada' });
    assert.equal(draftAda.aliasShown, '', 'a student tab does not start with the alias another founder of this browser used (Olivia)');
    await begin(grace, { room: code, alias: 'Grace' });
    assert.equal(await ada.eval(`document.querySelector('dialog#dlg').open`), false, 'no "replace your saved run?" for a run that is another founder\'s');
    await inWorld(ada); await inWorld(grace);
    const [pidAda, pidGrace] = [await pidOf(ada), await pidOf(grace)];
    assert.equal(new Set([instPid, pidAda, pidGrace]).size, 3, `three founders: ${instPid} ${pidAda} ${pidGrace}`);
    const slotAda = await ada.eval(`sessionStorage.getItem('pc.tab')`), slotGrace = await grace.eval(`sessionStorage.getItem('pc.tab')`);
    assert.match(slotAda, /^t-[a-z0-9]{8}$/); assert.match(slotGrace, /^t-[a-z0-9]{8}$/); assert.notEqual(slotAda, slotGrace);
    assert.equal(await inst.eval(`sessionStorage.getItem('pc.tab')`), null, 'the instructor\'s tab took no slot');

    // ---- 3. the instructor counts them, by name, and the banner says so
    await until(inst, `pc.S.students().filter(s=>!s.synth).length === 2 && /<b>2<\\/b> students online/.test(document.querySelector('#ih').innerHTML)`, 'two students online on the dashboard', 30000);
    const rows = (await students(inst)).sort((x, y) => x.handle.localeCompare(y.handle));
    assert.deepEqual(rows, [{ pid: pidAda, handle: 'Ada', online: true }, { pid: pidGrace, handle: 'Grace', online: true }]);
    assert.match(await inst.eval(`document.querySelector('#igrade').innerText`), /Ada[\s\S]*Grace|Grace[\s\S]*Ada/);
    const head = await inst.eval(`document.querySelector('#ih .small').textContent`);
    assert.match(head, /this browser only \(students join from other tabs of this browser with Copy student link; other devices need a relay\)/);
    assert.doesNotMatch(head, /\?room=|slot/);

    // ---- 4. a message each way, and between the students
    await inst.eval(`pc.S.setSpeed(16)`);
    await until(ada, `pc.S.clock.speed === 16 && !pc.S.clock.paused`, 'the instructor\'s pace in Ada\'s tab');
    await until(grace, `pc.S.clock.speed === 16`, 'the instructor\'s pace in Grace\'s tab');
    assert.equal(await ada.eval('pc.S.instructorPid'), instPid, 'the students hear the instructor under its own ID');
    await ada.eval(`pc.S.game.s.cash += 250; pc.S._sendSnap(true)`);
    await until(inst, `(pc.S.students().find(s=>s.pid==='${pidAda}')||{}).cash >= 250 || (pc.S.students().find(s=>s.pid==='${pidAda}')||{}).nw > 0`, 'Ada\'s snapshot with her cash');
    await until(ada, `pc.S.roster().some(r=>r.pid==='${pidGrace}' && !r.npc)`, 'Grace in Ada\'s roster');
    await until(grace, `pc.S.roster().some(r=>r.pid==='${pidAda}' && !r.npc)`, 'Ada in Grace\'s roster');
    await inst.eval(`pc.S.inject('tariff', { when: 0, replace: true })`);
    for (const p of [ada, grace]) await until(p, `pc.S.game.s.events.some(e=>e.kind==='tariff' && e.injected)`, 'the instructor\'s shock in a student\'s world');

    // ---- 5. each tab's saved run is its own
    for (const p of [ada, grace]) await p.eval(`pc.S.save(true)`);
    const saveOf = async (slot) => JSON.parse(await local(inst, `pc.save.${slot}`));
    const sa = await saveOf(slotAda), sg = await saveOf(slotGrace);
    assert.deepEqual([sa.state.handle, sa.state.pid, sa.mode, sa.room.code], ['Ada', pidAda, 'student', code]);
    assert.deepEqual([sg.state.handle, sg.state.pid, sg.mode, sg.room.code], ['Grace', pidGrace, 'student', code]);
    assert.notEqual(await local(inst, `pc.key.${slotAda}`), await local(inst, `pc.key.${slotGrace}`));
    const graceRaw = await local(inst, `pc.save.${slotGrace}`);
    await ada.eval(`pc.S.game.s.cash += 321; pc.S.save(true)`);
    assert.equal(await local(inst, `pc.save.${slotGrace}`), graceRaw, 'Ada\'s play does not touch Grace\'s saved run');
    assert.equal((await saveOf(slotAda)).state.cash > sa.state.cash, true);
    for (const n of ['pid', 'key', 'handle', 'save']) assert.equal(await local(inst, `pc.${n}.main`), oldKeys[n], `the browser's own pc.${n}.main is byte for byte what the solo run left`);

    // ---- 6. a student who refreshes is the same student, and the instructor still counts two
    await reload(ada);
    assert.equal(await pidOf(ada), pidAda, 'the same Founder ID after a refresh');
    assert.equal(await ada.eval(`sessionStorage.getItem('pc.tab')`), slotAda);
    assert.ok(await click(ada, /^Resume your run$/), 'the tab\'s own run is offered');
    await inWorld(ada);
    assert.deepEqual([await pidOf(ada), await ada.eval('pc.S.handle'), await ada.eval('pc.S.mode'), await ada.eval('pc.S.roomInfo.code')], [pidAda, 'Ada', 'student', code]);
    await until(inst, `(pc.S.students().find(s=>s.pid==='${pidAda}')||{}).online === true`, 'Ada online again');
    await sleep(1500);
    const again = (await students(inst)).sort((x, y) => x.handle.localeCompare(y.handle));
    assert.deepEqual(again.map((r) => r.pid), [pidAda, pidGrace], 'two students, not three');
    assert.match(await inst.eval(`document.querySelector('#ih').innerHTML`), /<b>2<\/b> students online/);
    await reload(ada); assert.equal(await pidOf(ada), pidAda, 'and again');        // (no Resume: the tab only has to stay the same founder)

    // ---- 7. a copy of an open tab (Duplicate tab) is not that student
    const dup = await mk(link);
    await titleUp(dup);
    await dup.eval(`sessionStorage.setItem('pc.tab', ${JSON.stringify(slotGrace)})`);      // what Duplicate tab hands the copy
    await sleep(2500);                                                                       // (Grace's tab has touched its claim by now)
    await reload(dup);
    assert.equal(await dup.eval(`sessionStorage.getItem('pc.tab')`), null, 'the copy let the slot go');
    assert.notEqual(await pidOf(dup), pidGrace);
    assert.equal(await pidOf(grace), pidGrace, 'Grace is still Grace');
    await begin(dup, { room: code, alias: 'Heidi' }); await inWorld(dup);
    const slotDup = await dup.eval(`sessionStorage.getItem('pc.tab')`);
    assert.match(slotDup, /^t-/); assert.notEqual(slotDup, slotGrace); assert.notEqual(slotDup, slotAda);
    await until(inst, `pc.S.students().filter(s=>!s.synth && s.online).length === 3`, 'three students online');

    // ---- 8. the old save is intact and still loads; a page with ?slot=name is the old way
    for (const n of ['pid', 'key', 'handle', 'save']) assert.equal(await local(inst, `pc.${n}.main`), oldKeys[n], `pc.${n}.main still the same bytes`);
    const back = await mk(b.base + '/');
    await titleUp(back);
    assert.ok(await click(back, /^Resume your run$/), 'the solo run is offered to a new tab');
    await inWorld(back);
    assert.deepEqual([await pidOf(back), await back.eval('pc.S.handle'), await back.eval('pc.S.mode')], [instPid, 'Olivia', 'solo']);
    const named = await mk(`${b.base}/?slot=pal7&room=${code}`);
    await titleUp(named);
    await named.eval(`localStorage.setItem('pc.academyDone.pal7', 'true')`);
    await begin(named, { room: code, alias: 'Pal' }); await inWorld(named);
    assert.equal(await named.eval(`sessionStorage.length`), 0, 'a named slot takes no tab slot');
    assert.equal(await pidOf(named), JSON.parse(await local(named, 'pc.pid.pal7')));
    assert.notEqual(await pidOf(named), instPid);
    assert.ok(await local(named, 'pc.save.pal7'));
    // ---- nothing the page did was an error
    for (const p of tabs) assert.deepEqual(p.logs.filter((l) => /^(EXC|error)/.test(l) && !/favicon|Failed to load resource/.test(l)), [], 'no console error');
  } finally {
    for (const p of tabs) await closePage(p);
  }
});
