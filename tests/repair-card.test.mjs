// The repair round after the browser audit of the coach card at phone sizes (844x390, 360x640 and 640x360, which is a desktop window at 200% zoom). Every test here fails on the fault it names.
//   F1  the hire dialog (lesson 6, hint showing): a tap on the Supply-Chain Student's card closed the dialog and picked nothing. Pressing the card moved the keyboard's cursor to it (focusin), the cursor is the first
//       thing the coach card keeps off, so the card, a one-line bar at the foot, grew to the full card over the control being pressed; the release landed on the card, and the click, whose target was then the
//       dialog, closed it. Fixed twice: the card does not move, change shape or change its words while a press is in flight, and a click closes the dialog only if the press began on the dialog itself.
//   F2  Tab and Shift+Tab in the hire dialog left a manager card 44% to 75% under the lesson card (manager cards are 252px tall in a 360px window and no card stands clear of them): the hire dialog folds the card to
//       its tab, as the Deal Room does.
//   F3  lesson 9, steps 4 and 5 ("pause the clock"): the card stood over the whole HUD, the clock with it. The HUD's buttons are controls the card keeps off, as the dock's are.
//   F4  the news line with a drawer open at 640x360 was a 92px strip whose text box was 24px wide ("Li...", "Day 2 T..."): it steps aside while a panel is open in a narrow short window, as it does in the bottom sheet.
//   F5  the two toasts after Borrow stood over the card's words and buttons for four seconds: a toast gives way to the card.
//   F6  the card with its hint is as tall as a 390px window and its buttons were cut by the card's own scroll: they stay at the card's foot while the words scroll above.
//   S1  the intro's "Start the lesson" carried an `autofocus` the page ignored (it logged "Autofocus processing was blocked").
//   R1  two behaviours of the card the tests could not tell from their absence: the place kept while a scroll moves the sheet (keepsPlace) and the cursor's rescue when a fold hides its button (rescueButton).
// Pure half: the rules. Browser half (skipped without Chrome or with PC_NO_BROWSER=1): real mouse presses and real Tab keys in headless Chrome (tests/helpers/lessonpage.mjs).
// Run: node --test tests/repair-card.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const noDoc = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, activeElement: null };
globalThis.document = noDoc;

const A = await import('../js/ui/academy-sandbox.js');
const AC = await import('../js/ui/academy.js');
const { initDialog } = await import('../js/ui/common.js');
const { ACADEMY } = await import('../js/meta/academy.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// ====================================================================================================================================
// F1: a click closes the dialog only when the press began on the dialog
// ====================================================================================================================================
test('F1: a click whose target is the dialog closes it only if the press began on the dialog: a press on a control that ends on the dialog (a card moved under the finger) closes nothing', () => {
  const on = {}, d = { open: true, tabIndex: 0, addEventListener(k, f) { (on[k] ||= []).push(f); }, close() { this.open = false; } };
  globalThis.document = { ...noDoc, querySelector: (q) => (q === '#dlg' ? d : null) };
  try {
    initDialog();
    const fire = (k, target) => { for (const f of on[k] || []) f({ target }); };
    const button = { name: 'a manager card' }, card = { name: 'the coach card, inside the dialog' };
    fire('pointerdown', button); fire('mousedown', button); fire('click', d); // down on the card of a manager, up on the coach card that stood over it: the click is the dialog's
    assert.equal(d.open, true, 'a press that began on a control does not close the dialog');
    fire('pointerdown', card); fire('mousedown', card); fire('click', d);
    assert.equal(d.open, true, 'nor one that began on the lesson card');
    fire('click', d); // a click made by script has no press at all
    assert.equal(d.open, false, 'a click on the dialog with no press before it (a script) still closes it, as it always did');
    d.open = true; fire('pointerdown', d); fire('mousedown', d); fire('click', d);
    assert.equal(d.open, false, 'a press on the backdrop, released on it, closes it: that is what the backdrop is for');
    d.open = true; fire('click', button);
    assert.equal(d.open, true, 'a click on a control is the control\'s');
  } finally { globalThis.document = noDoc; }
});

// ====================================================================================================================================
// R1: the place kept while the sheet scrolls, and the cursor's rescue
// ====================================================================================================================================
test('R1 keepsPlace: a crowded place is kept while it is about as good as the new one, never when the new one covers nothing, the target or fewer buttons', () => {
  const size = { w: 100, h: 100 }, btn = (x, y, w = 50, h = 50) => ({ x, y, w, h, wt: 1, ctl: true });
  const A2 = btn(0, 0), B2 = btn(50, 0), C = btn(0, 100, 100, 100);
  // the old place is over two buttons (5,000 square px); the new one is over one (6,000): the old one scores no worse than a quarter above, but it is over MORE BUTTONS, so it is not kept
  assert.equal(A.keepsPlace({ x: 0, y: 0 }, { x: 0, y: 60 }, size, null, [A2, B2, C]), false, 'a place over more buttons than the new one is not kept, however the areas compare');
  assert.equal(A.keepsPlace({ x: 0, y: 60 }, { x: 0, y: 0 }, size, null, [A2, B2, C]), true, 'a place over fewer buttons is kept (6,000 against 5,000 is within a quarter)');
  assert.equal(A.keepsPlace({ x: 0, y: 0 }, { x: 0, y: 0 }, size, null, [A2, B2, C]), true, 'the same place is kept');
  assert.equal(A.keepsPlace({ x: 0, y: 0 }, { x: 300, y: 300 }, size, null, [A2, B2, C]), false, 'a new place that covers nothing is simply better');
  assert.equal(A.keepsPlace({ x: 0, y: 0 }, { x: 0, y: 40 }, size, null, [{ ...A2, ctl: false }, { ...B2, ctl: false }, { x: 0, y: 100, w: 100, h: 100, wt: 1, ctl: false }]), true, 'rects that are not buttons weigh by area only (4,000 against 5,000... within a quarter): the old place stays');
  // the control the step names: an old place over it is not kept when the new one is clear of it
  const spot = { x: 0, y: 0, w: 40, h: 40 };
  assert.equal(A.keepsPlace({ x: 0, y: 0 }, { x: 200, y: 0 }, size, spot, [{ x: 200, y: 0, w: 100, h: 10, wt: 1 }]), false, 'over the target while the new place is not: not kept');
  // a place far worse than the new one (beyond a quarter and 400 square px) is left
  assert.equal(A.keepsPlace({ x: 0, y: 0 }, { x: 0, y: 99 }, size, null, [btn(0, 99, 100, 1), { x: 0, y: 0, w: 100, h: 100, wt: 5 }]), false, 'a place that scores far worse is left');
});

test('R1 rescueButton: the cursor on a button the card\'s shape now hides goes to the first button the card still shows, and nowhere when it was not on the card or is still shown', () => {
  const btn = (name, shown) => ({ name, getClientRects: () => (shown ? [1] : []) });
  const restart = btn('restart', false), grab = btn('grab', true), later = btn('later', true), outside = btn('outside', false);
  const card = { contains: (e) => [restart, grab, later].includes(e), querySelectorAll: () => [restart, grab, later] };
  assert.equal(A.rescueButton(card, restart), grab, 'Restart is hidden by a smaller shape: the first button the card shows');
  assert.equal(A.rescueButton(card, later), null, 'a button that is still shown keeps the cursor');
  assert.equal(A.rescueButton(card, outside), null, 'a control outside the card is not the card\'s to move');
  assert.equal(A.rescueButton(card, card), null, 'nor is the card itself'); assert.equal(A.rescueButton(card, null), null); assert.equal(A.rescueButton(null, restart), null);
  assert.equal(A.rescueButton({ contains: () => true, querySelectorAll: () => [btn('x', false)] }, restart), null, 'with no button shown there is nowhere to go');
});

// ====================================================================================================================================
// S1, F4, F6, R8: the words and the sheets
// ====================================================================================================================================
test('S1: the intro\'s Start button has no autofocus (the page has already put the cursor on the heading, so the attribute was ignored and logged "Autofocus processing was blocked")', () => {
  const m = ACADEMY[0], html = AC.introHTML(m, { index: 0, total: ACADEMY.length, st: { done: [], skipped: [] }, concept: null, replay: false, missions: ACADEMY });
  assert.match(html, /<button class="btn big" data-act="ac-start">Start the lesson<\/button>/);
  assert.doesNotMatch(html, /autofocus/, 'the cursor goes to the heading by script, where it is read out');
  assert.doesNotMatch(AC.introHTML(m, { index: 0, total: ACADEMY.length, st: { done: [m.id], skipped: [] }, concept: null, replay: true, missions: ACADEMY }), /autofocus/, 'a replay too');
});

test('F4: the ticker\'s note says an open panel can cover the line, and says it only when a panel is open; the news line is gone while a panel is open in a narrow short window', () => {
  const plain = A.unseenNote('ticker', null, {}), open = A.unseenNote('ticker', null, { drawer: true });
  assert.match(plain, /news line shows up when there is news/); assert.doesNotMatch(plain, /panel/);
  assert.match(open, /news line shows up when there is news/); assert.match(open, /A panel that is open can cover it on a small screen: close the panel to read it\./);
  const css = read('css/shell.css');
  assert.match(css, /@media \(max-height: 520px\) and \(max-width: 720px\) \{\s*\.stage\[data-drawer\]:not\(\[data-drawer=""\]\) \.tickerhost \{ display: none; \}\s*\}/, 'a narrow window on its side steps the line aside while a drawer is open (display: none, so the toasts come down and nothing frames a line nobody sees)');
});

test('F6, F5, R8: the card\'s buttons stick to its foot, a toast gives way to the card, and the folded tab\'s caret is hidden by specificity, not by !important', () => {
  const css = read('css/ui-academy.css');
  assert.match(css, /\.ac-coach:not\(\.handle\) \.ac-btns \{ position: sticky; bottom: 0;/, 'the buttons stay at the foot of the card while its words scroll above them');
  assert.doesNotMatch(css.match(/\.ac-coach:not\(\.handle\) \.ac-btns \{[^}]*\}/)[0], /padding|margin/, 'and the row has no padding and no margin of its own: the card is the size it was, which the placement rules were measured against');
  assert.match(css, /\.toast\.ac-under \{ opacity: 0; \}/, 'a toast the card stands over is let go dim');
  assert.match(css, /\.ac-coach\.handle\[data-side\]::before \{ display: none; \}/, 'the folded card has no caret: one more attribute than the caret\'s own rule beats it');
  assert.equal((css.match(/!important/g) || []).length, 0, 'css/ui-academy.css has no !important: a rule is made to win by what it names');
  for (const f of readdirSync(join(ROOT, 'css')).filter((n) => n.endsWith('.css'))) { const t = read('css/' + f); assert.equal(t.split('/*').length, t.split('*/').length, `css/${f}: every comment is closed (one that is not swallows the rules after it: the folded tab's rules went that way once)`); }
  const src = read('js/ui/academy.js');
  assert.match(src, /toastsYield\(host === dlg\.el \? null : \{ x: at\.x, y: at\.y, w: size\.w, h: size\.h \}\);/, 'the card tells the toasts where it stands (a card in a window is over none)');
  assert.match(src, /classList\.contains\('bad'\)/, 'a toast that says an action failed is never dimmed');
});

test('F2, F3: the hire dialog may fold the card to its tab (as every window may), and the HUD\'s buttons are controls the card keeps off, as the dock\'s are', () => {
  const src = read('js/ui/academy.js');
  assert.match(src, /const foldable = !confirm;/, 'a Deal Room, the hire dialog, a panel and the plain screen fold; only the question "Skip this lesson?" never does');
  assert.match(src, /root = inDlg \? host : ctx\.el\.stage/); assert.match(src, /for \(const e of root\.querySelectorAll\(CONTROL_SELECTOR\)\)/, 'every button of the HUD (it is in the stage) is a ctl, with the dock\'s and the drawer\'s');
  assert.doesNotMatch(src, /for \(const part of \[ctx\.el\.tracker, ctx\.el\.ticker, ctx\.el\.hud,/, 'the HUD is not among the parts that count by area alone');
  assert.match(src, /if \(holding\(\) && layer\?\.isConnected\) \{ owed = true; return; \}/, 'F1: nothing about the card changes while a press is in flight, nor in the moment between a finger lifting and the click it makes');
  assert.match(src, /const holding = \(\) => pressing \|\| Date\.now\(\) < graceTo;/); assert.match(src, /document\.addEventListener\('click', pressClick, true\);/, 'the click lifts the hold before the handlers that follow it');
  assert.match(src, /const PRESS_ON = \['pointerdown', 'mousedown', 'touchstart'\], PRESS_OFF = \['pointerup', 'pointercancel', 'mouseup', 'touchend', 'touchcancel', 'dragend', 'contextmenu'\];/);
  assert.match(src, /for \(const t of PRESS_OFF\) document\.removeEventListener\(t, pressUp, true\);/); assert.match(src, /document\.removeEventListener\('click', pressClick, true\);[^\n]*clearTimeout\(graceT\)/, 'and the listeners and the timer go with the lesson');
});

// ====================================================================================================================================
// the browser: a real mouse, real Tab keys
// ====================================================================================================================================
const { BROWSER, SIZES, browser, until, lessonPage, atStep, hint, aim, tapAt, closeCash, closePage, sleep } = await import('./helpers/lessonpage.mjs');
let b = null;
const getBrowser = async () => (b ||= await browser());
test.after(async () => { if (b) await b.close(); });
const SUITE = { skip: !BROWSER, timeout: 900000 };
const TO_HIRE = async (p) => {
  await tapAt(p, '[data-anchor="hud-cash"]'); await closeCash(p); await atStep(p, 2);
  await tapAt(p, '[data-anchor="dock-crew"]'); await atStep(p, 3);
  await tapAt(p, '[data-act="crew-hire"]'); await until(p, `document.querySelector('dialog#dlg').open && !!document.querySelector('dialog#dlg [data-anchor="hire-go"]')`, 'the hire dialog');
  await p.sleep(700);
};
const COVER = `(()=>{ const f=document.activeElement, card=document.querySelector('.ac-coach'); if(!f||f===document.body||!card) return null; const r=f.getBoundingClientRect(), c=card.getBoundingClientRect(), ox=Math.max(0,Math.min(r.right,c.right)-Math.max(r.left,c.left)), oy=Math.max(0,Math.min(r.bottom,c.bottom)-Math.max(r.top,c.top));
  return { who: f.dataset.anchor || f.dataset.act || f.tagName, inCard: card.contains(f), cover: r.width*r.height ? ox*oy/(r.width*r.height) : 0, shape: card.className.replace('ac-coach','').replace('lift','').trim() || 'full' } })()`;

test('browser, lesson 6, the hire dialog: a real tap on a manager card picks it, with the hint showing or not, and the dialog stays open (F1)', SUITE, async () => {
  const br = await getBrowser();
  for (const sz of SIZES) {
    const p = await lessonPage(br, 'm06', sz);
    try {
      await TO_HIRE(p);
      // the press is held down for a moment (a finger is), first without the hint, then with it; the card is where it was while the finger is down, and the tap picks the manager and keeps the dialog
      for (const [withHint, kind, gap] of [[false, 'broker', 0], [true, 'logistics', 300], [true, 'student', 0]]) {
        if (withHint && !(await p.eval(`!!document.querySelector('.ac-coach .ac-hint, .ac-coach.handle .ac-grab')`))) await hint(p);
        const m = await tapAt(p, `[data-anchor="hire-${kind}"]`, '.', { gap });
        const after = await p.eval(`(()=>{ const d=document.querySelector('dialog#dlg'), e=d.querySelector('[data-anchor="hire-${kind}"]'); return { open: d.open, pressed: e && e.getAttribute('aria-pressed') } })()`);
        assert.ok(m.during.lands, `${sz.name} ${kind} (hint ${withHint}, held ${gap}ms): while the finger is down the control is still what is under it, not the card (${m.during.hit})`);
        assert.equal(after.open, true, `${sz.name} ${kind} (hint ${withHint}): the dialog is still open after the tap`);
        assert.equal(after.pressed, 'true', `${sz.name} ${kind} (hint ${withHint}): the tap picked the manager`);
      }
    } finally { await closePage(p); }
  }
});

test('browser, lesson 6, the hire dialog: Tab and Shift+Tab never leave a manager card under the lesson card, plain and with the hint (F2)', SUITE, async () => {
  const br = await getBrowser();
  for (const sz of SIZES) {
    const p = await lessonPage(br, 'm06', sz);
    try {
      await TO_HIRE(p);
      for (const withHint of [false, true]) {
        if (withHint) await hint(p);
        await p.eval(`document.activeElement && document.activeElement.blur && document.activeElement.blur(); document.querySelector('dialog#dlg').focus()`);
        const stops = [];
        for (let i = 0; i < 6; i++) { await p.key('Tab', { wait: 450 }); stops.push(await p.eval(COVER)); }
        for (let i = 0; i < 6; i++) { await p.key('Tab', { mod: 8, wait: 450 }); stops.push(await p.eval(COVER)); }
        const seenManagers = new Set(stops.filter((s) => s && /^hire-(student|broker|logistics)$/.test(s.who)).map((s) => s.who));
        assert.equal(seenManagers.size, 3, `${sz.name} (hint ${withHint}): the sweep reached all three manager cards (${stops.map((s) => s && s.who).join(', ')})`);
        for (const s of stops) if (s && !s.inCard) assert.ok(s.cover <= 0.05, `${sz.name} (hint ${withHint}): ${s.who} is ${Math.round(s.cover * 100)}% under the lesson card (shape ${s.shape})`);
      }
    } finally { await closePage(p); }
  }
});

const CLOCK_FREE = async (p, sz, what) => { // the craze's alert is a window over the game (and over the clock): a tap on the clock means the window is closed first, which is what the lesson asks of the player
  if (await p.eval(`document.querySelector('dialog#dlg').open`)) await p.key('Escape', { wait: 900 });
  const m = await aim(p, '[data-act="pause"]'); assert.ok(m.lands, `${sz.name}, ${what}: a tap at the clock lands on it (it lands on ${m.hit})`);
};
const TO_CLOCK = async (p) => { await tapAt(p, '[data-anchor="dock-stock"]'); await atStep(p, 2); await tapAt(p, '[data-anchor="dock-travel"]'); await atStep(p, 3); await tapAt(p, '[data-act="pause"]'); await atStep(p, 4); };

test('browser, lesson 9: the clock is never under the card at steps 4 and 5, plain and with the hint (F3)', SUITE, async () => {
  const br = await getBrowser();
  for (const sz of [SIZES[1], SIZES[2]]) { // 360x640 and 640x360
    const p = await lessonPage(br, 'm09', sz);
    try {
      await TO_CLOCK(p);
      await CLOCK_FREE(p, sz, 'step 4'); // the card told the player to pause the clock and stood over all of the HUD
      await hint(p); await CLOCK_FREE(p, sz, 'step 4 with the hint');
      await until(p, `/STEP 5 OF/i.test((document.querySelector('.ac-coach .ac-eyebrow')||{}).innerText||'')`, 'step 5', 40000); // the craze lands and an alert opens over the game
      await p.sleep(600); await CLOCK_FREE(p, sz, 'step 5');
      await p.eval(`window.__skew += 30000`); await p.sleep(800); await CLOCK_FREE(p, sz, 'step 5 with the hint');
    } finally { await closePage(p); }
  }
});

test('browser, lesson 9 at 640x360: with a panel open the news line is not a sliver (F4)', SUITE, async () => {
  const br = await getBrowser(), sz = SIZES[2], p = await lessonPage(br, 'm09', sz);
  try {
    await TO_CLOCK(p); // the Travel drawer is open and the clock runs: the first headline comes within a few seconds
    await until(p, `!!document.querySelector('.tickerhost .tick')`, 'the first headline', 30000);
    const line = await p.eval(`(()=>{ const t=document.querySelector('.tickerhost .tick .tk-t'), h=document.querySelector('.tickerhost'); return { shown: !!h.getClientRects().length, width: t.clientWidth, drawer: !document.querySelector('#drawer').hidden } })()`);
    assert.equal(line.drawer, true, 'the Travel drawer is open');
    assert.ok(!line.shown || line.width >= 128, `with a panel open the news line is gone or its words have room (they had ${line.width}px)`);
    assert.equal(line.shown, false, 'it steps aside for the panel');
    // and it is back, with room for its words, when the panel is shut (the alert of the craze may be open over the game by now)
    if (await p.eval(`document.querySelector('dialog#dlg').open`)) await p.key('Escape', { wait: 900 });
    await p.eval(`document.querySelector('[data-act="drawer-close"]').click()`); await p.sleep(600);
    const back = await p.eval(`(()=>{ const t=document.querySelector('.tickerhost .tick .tk-t'), h=document.querySelector('.tickerhost'); return { shown: !!h.getClientRects().length, width: t ? t.clientWidth : 0 } })()`);
    assert.equal(back.shown, true, 'the line is back when the panel is shut'); assert.ok(back.width >= 128, `with room for its words (${back.width}px)`);
  } finally { await closePage(p); }
});

test('browser, lesson 7: after Borrow the toasts give way to the card, at 844x390 and 360x640', SUITE, async () => {
  const br = await getBrowser();
  for (const sz of [SIZES[0], SIZES[1]]) {
    const p = await lessonPage(br, 'm07', sz);
    try {
      await tapAt(p, '[data-anchor="dock-bank"]'); await atStep(p, 2);
      await p.eval(`(()=>{const i=document.querySelector('[data-anchor="drawer"] input[type=range]'); i.scrollIntoView({block:'center'}); i.focus();})()`);
      for (let k = 0; k < 3; k++) await p.key('ArrowRight', { wait: 120 });
      // The toasts are watched from inside the page, every 50 ms, and kept in a log. A toast is up for four seconds and a runner under load can be slower than that between two looks from outside: the test used to
      // wait for "two toasts" and timed out on the runner having missed them (it passed alone). A toast is read from the age of 500 ms: it slides in for 250 ms (animation: slidein, which outranks the card's
      // opacity: 0 while it runs) and fades for 200 (transition), and the old test could not look sooner either, since a tap ends 350 ms after the click.
      await p.eval(`(()=>{ const first = new Map(), log = (window.__toastLog = []); window.__toastWatch = setInterval(() => { const c = document.querySelector('.ac-coach'); if (!c) return; const r = c.getBoundingClientRect(), now = Date.now();
        for (const t of document.querySelectorAll('#toasts .toast')) { if (!first.has(t)) first.set(t, now); const q = t.getBoundingClientRect(), ox = Math.max(0, Math.min(r.right, q.right) - Math.max(r.left, q.left)), oy = Math.max(0, Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top));
          log.push({ text: t.textContent.slice(0, 16), bad: t.classList.contains('bad'), age: now - first.get(t), opacity: +getComputedStyle(t).opacity, over: q.width * q.height ? ox * oy / (q.width * q.height) : 0 }); } }, 50); })()`);
      await tapAt(p, '[data-act="bank-draw"]');
      await until(p, `window.__toastLog.some((x) => !x.bad && x.age >= 1300)`, 'a toast of the Borrow that has been up for 1.3 s', 20000);
      const seen = await p.eval(`(clearInterval(window.__toastWatch), window.__toastLog.filter((x) => x.age >= 500 && !x.bad))`);
      assert.ok(seen.length > 0, `${sz.name}: a toast was looked at after it had settled`);
      for (const x of seen) assert.ok(x.over < 0.01 || x.opacity < 0.05, `${sz.name}: "${x.text}" stands ${Math.round(x.over * 100)}% over the card at full strength (opacity ${x.opacity}, ${x.age} ms old): its words and its buttons cannot be read`);
      // After a Borrow the layout no longer meets the two (the card is a one-line bar at the foot, the toasts stand above it: with the rule taken out this test used to pass all the same), so the rule is tried where
      // they do meet: the stack is put over the card, as a small window or a big text size leaves it. A toast the card stands over is let go dim, a toast that says an action failed never is, and the dim one is seen again when the card is off it.
      const meet = await p.eval(`(async () => {
        const box = document.getElementById('toasts'), saved = box.getAttribute('style') || '', wait = (ms) => new Promise((r) => setTimeout(r, ms)), read = (t) => ({ under: t.classList.contains('ac-under'), opacity: +getComputedStyle(t).opacity });
        const over = async (cls, text) => { const c = document.querySelector('.ac-coach').getBoundingClientRect(); box.textContent = '';
          box.style.cssText = saved + ';left:' + Math.round(c.left) + 'px;right:auto;top:' + Math.round(c.top + 4) + 'px;bottom:auto;width:' + Math.round(c.width) + 'px';
          const t = document.createElement('div'); t.className = 'toast ' + cls; t.textContent = text; box.appendChild(t); await wait(900); return t; };
        const warn = await over('warn', 'Over the card'), a = read(warn);
        box.setAttribute('style', saved); box.appendChild(Object.assign(document.createElement('div'), { className: 'toast info', textContent: 'A toast comes' })); await wait(900); // the card looks again at a toast that comes
        const back = read(warn), bad = await over('bad', 'Refused over the card'), b = read(bad);
        box.setAttribute('style', saved); box.textContent = '';
        return { a, back, b };
      })()`);
      assert.equal(meet.a.under, true, `${sz.name}: a toast the card stands over is let go dim`); assert.ok(meet.a.opacity < 0.05, `${sz.name}: and it cannot be seen (opacity ${meet.a.opacity})`);
      assert.equal(meet.back.under, false, `${sz.name}: and it is seen again when the card is off it`); assert.ok(meet.back.opacity > 0.9, `${sz.name}: at full strength (opacity ${meet.back.opacity})`);
      assert.equal(meet.b.under, false, `${sz.name}: a toast that says an action failed is never dimmed, whoever stands over it`); assert.ok(meet.b.opacity > 0.9, `${sz.name}: it is seen (opacity ${meet.b.opacity})`);
    } finally { await closePage(p); }
  }
});

// PF: the Borrow tap the runner lost. The player slides the amount (the drawer is not redrawn while the slider has the keyboard, common.js setHTML) and presses Borrow, which moves the keyboard off the slider:
// the shell's next redraw (every 230 ms, the sandbox's tick) then wrote everything it had held back, 22 ms into the press, and the button under the finger was a new one. The release landed on it, the
// click went to neither, and nothing was borrowed: 3 taps in 6 at 844x390. A press held for 700 ms crosses three redraws, so it fails every time on the fault (tests/press-in-flight.test.mjs has the rule).
test('browser, lesson 7: a press held while the clock redraws the drawer still clicks the button it began on (Borrow, after the amount was slid), at 844x390 and 360x640', SUITE, async () => {
  const br = await getBrowser();
  for (const sz of [SIZES[0], SIZES[1]]) {
    const p = await lessonPage(br, 'm07', sz);
    try {
      await tapAt(p, '[data-anchor="dock-bank"]'); await atStep(p, 2);
      await p.eval(`(()=>{const i=document.querySelector('[data-anchor="drawer"] input[type=range]'); i.scrollIntoView({block:'center'}); i.focus();})()`);
      for (let k = 0; k < 3; k++) await p.key('ArrowRight', { wait: 120 });
      await p.eval(`window.__clicks = []; addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('[data-act]'); window.__clicks.push(a ? a.dataset.act : e.target.tagName); }, true)`);
      const tap = await tapAt(p, '[data-act="bank-draw"]', '.', { gap: 700 });
      assert.equal(tap.during.lands, true, `${sz.name}: 0.7 s into the press the button under the finger is still the one that was pressed (it was drawn again under it: ${tap.during.hit})`);
      const clicks = await p.eval(`window.__clicks`);
      assert.ok(clicks.includes('bank-draw'), `${sz.name}: the press on Borrow made its click (clicks: ${JSON.stringify(clicks)})`);
      await until(p, `document.querySelectorAll('#toasts .toast').length >= 1`, 'the Borrow\'s toast', 12000);
    } finally { await closePage(p); }
  }
});

test('browser, the card\'s buttons stay in sight when its words scroll (844x390), and a smaller shape\'s hidden button gives the cursor to a button that is shown', SUITE, async () => {
  const br = await getBrowser();
  { // F6: a window too short for the words: the card's own scroll must not cut the buttons
    const p = await lessonPage(br, 'm06', SIZES[0]);
    try {
      // a card whose words would scroll is not a card the runner shows (it is the tab: `cut`), so the window that is too short for the words is the card the player OPENS from the tab: capped, opened, and the buttons must still be in sight
      await p.eval(`document.querySelector('.ac-coach-in').style.maxHeight = '92px'`); await p.sleep(700);
      assert.ok(await p.eval(`document.querySelector('.ac-coach').classList.contains('handle')`), 'a card whose words would scroll folds to its tab');
      await p.eval(`document.querySelector('.ac-grab').click()`); await p.sleep(600);
      await p.eval(`document.querySelector('.ac-coach-in').scrollTop = 0`);
      const g = await p.eval(`(()=>{ const ci=document.querySelector('.ac-coach-in'), q=ci.getBoundingClientRect(); return { scrolls: ci.scrollHeight > ci.clientHeight + 4, top: ci.scrollTop, buttons: [...ci.querySelectorAll('.ac-btns button')].map(x=>{ const r=x.getBoundingClientRect(); return { name:x.textContent.trim(), cut: r.bottom > q.bottom + 1 || r.top < q.top - 1 } }) } })()`);
      assert.ok(g.scrolls && g.top === 0, 'the card\'s words scroll inside it, from the top');
      assert.ok(g.buttons.length >= 2 && g.buttons.every((x) => !x.cut), `Show me and Skip lesson are inside the card's visible part, not below its scroll: ${JSON.stringify(g.buttons)}`);
    } finally { await closePage(p); }
  }
  { // R1: the cursor is on Show me when the sheet scrolls and the card folds to its tab, which has no Show me: the cursor goes to the tab and is not lost to the page
    const p = await lessonPage(br, 'm03', SIZES[2]);
    try {
      await tapAt(p, '[data-anchor="dock-market"]'); await atStep(p, 2);
      await tapAt(p, '[data-act="market-sell"]', 'Bree'); await until(p, `document.querySelector('dialog#dlg').open && !!document.querySelector('#dlg .deal')`, 'the Deal Room'); await p.sleep(800);
      const shape = () => p.eval(`(()=>{ const c=document.querySelector('.ac-coach'); return c.classList.contains('handle') ? 'handle' : 'card' })()`);
      const scrollTo = async (st) => { await p.eval(`document.querySelector('dialog#dlg').scrollTop = ${st}`); await p.sleep(420); };
      // where the sheet's controls leave the card a place it is the card; where they do not, it is the tab (in the strip). Find a position of each, the card first
      let at = -1;
      for (let st = 0; st <= 1200 && at < 0; st += 40) { await scrollTo(st); if ((await shape()) === 'card') at = st; }
      assert.ok(at >= 0, 'the sheet has a position where the card is a card');
      await p.eval(`document.activeElement && document.activeElement.blur && document.activeElement.blur(); document.querySelector('dialog#dlg').focus()`); await p.key('c', { wait: 250 });
      assert.equal(await p.eval(`document.activeElement && document.activeElement.dataset.act`), 'ac-showme', 'C puts the cursor on the first button of the card');
      let folded = false;
      for (let st = at + 40; st <= 1200 && !folded; st += 40) { await scrollTo(st); folded = (await shape()) === 'handle'; }
      assert.ok(folded, 'the sheet has a position where the card is folded to its tab');
      await p.sleep(300);
      assert.equal(await p.eval(`document.activeElement && document.activeElement.dataset.act`), 'ac-expand', 'the cursor that was on Show me is on the tab, the one button the card shows: not on the page');
    } finally { await closePage(p); }
  }
});
