// The keyboard and Academy flow, finished (branch v2/fin-flow). Held in Node against the real engine and the real glue, with a stand-in sheet where a layout is needed:
//   1  the Deal Room: after EVERY paint the control the cursor is on is brought just into sight (under the sticky foot, above the top of a sheet that was scrolled for the last stage),
//      a new stage opens at its head, a resize and the keyboard's own Tab are looked at too, and nothing here moves the cursor or animates (common.js: scrollDelta, bandOf, keepInView)
//   2  the Academy's sheets after a lesson: Tab never stops on the heading (tabindex -1), so the trap wraps among the buttons and no stop lacks a ring
//   3  the Academy's coach card: a thing that is not on screen says what to do to bring it up, never claims a gold frame there is none of, and follows into any open window
//   4  the Deal Room's result prints "kept back", not "walks away", for Quick and the expert when the table was never sat at
// The browser half (real keyboard walks at 390x844, 360x640, 844x390, 1024x768 and 200% zoom through sell, buy, repair and auction deals; all ten lessons played through the UI) is described in
// the commit. Run: node --test tests/finish-flow.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, activeElement: null };

const { makeGame } = await import('./bot.mjs');
const { fakeCtx } = await import('./helpers/ctx.mjs');
const D = await import('../js/deal.js');
const UI = await import('../js/ui/deal.js');
const { scrollDelta, bandOf, keepInView, RING_REACH } = await import('../js/ui/common.js');
const A = await import('../js/ui/academy-sandbox.js');
const AC = await import('../js/ui/academy.js');
const { ACADEMY } = await import('../js/meta/academy.js');

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const assertBand = (box, band) => assert.ok(box.top - RING_REACH >= band.top - 1e-9 && box.bottom + RING_REACH <= band.bottom + 1e-9, `${JSON.stringify(box)} (and its ring) inside ${JSON.stringify(band)}`);

// ------------------------------------------------------------------ 1: the cursor is always in sight
test('scrollDelta: nothing when a control and its ring are in the band, the nearest edge when not, the top edge when it is taller than the band', () => {
  const band = { top: 0, bottom: 300 };
  assert.equal(scrollDelta({ top: 50, bottom: 90 }, band), 0, 'in sight: not moved');
  assert.equal(scrollDelta({ top: RING_REACH, bottom: 300 - RING_REACH }, band), 0, 'a ring that just fits is in sight');
  assert.equal(scrollDelta({ top: 280, bottom: 320 }, band), 320 + RING_REACH - 300, 'under the foot: the content goes up until its ring clears it');
  assert.equal(scrollDelta({ top: -60, bottom: -20 }, band), -60 - RING_REACH, 'above the top: the content comes down until its ring clears the edge');
  assert.equal(scrollDelta({ top: 40, bottom: 700 }, band), 40 - RING_REACH, 'taller than the band: its top (the name) is what is kept');
  assert.equal(scrollDelta({ top: 296, bottom: 330 }, band, 0), 30, 'the ring reach is a parameter');
  for (const bad of [null, undefined, {}, { top: NaN, bottom: 10 }, { top: 0, bottom: Infinity }]) assert.equal(scrollDelta(bad, band), 0, 'a box that is not numbers moves nothing');
  assert.equal(scrollDelta({ top: 1, bottom: 2 }, null), 0); assert.equal(scrollDelta({ top: 1, bottom: 2 }, { top: NaN, bottom: 3 }), 0);
  assert.equal(RING_REACH, 5, 'a ring is 3px wide and drawn 2px out (css/styles.css)');
});

/** A scrolling sheet of `height` px on the screen at `top`, drawn at scale `k`, with a sticky foot of `foot` px, and a way to add controls by their place in the sheet's own content. */
function sheet({ top = 0, height = 400, foot = 70, scroll = 0, k = 1 } = {}) {
  const d = { scrollTop: scroll, clientTop: 0, clientHeight: height, offsetHeight: height, kids: [], listeners: {} };
  d.getBoundingClientRect = () => ({ top, bottom: top + height * k, height: height * k, left: 0, right: 600, width: 600 });
  d.contains = (e) => e === d || d.kids.includes(e);
  d.querySelectorAll = (sel) => (/data-fid/.test(sel) ? d.kids.filter((e) => e.dataset?.fid) : d.kids.filter((e) => e.sticky));
  d.add = (name, at, h, o = {}) => {
    const e = { name, dataset: o.fid ? { fid: o.fid } : {}, offsetTop: at, offsetHeight: h, offsetParent: d, parentElement: d, sticky: !!o.sticky, drawnAs: o.drawnAs, disabled: !!o.disabled,
      style: { position: o.sticky ? 'sticky' : 'static', display: 'block' }, getAttribute: () => null, contains: (x) => x === e, focused: [], matches: (s) => (o.visible ?? true) && s === ':focus-visible',
      focus(opts) { this.focused.push(opts); globalThis.document.activeElement = this; }, scrollIntoView() { throw new Error('scrollIntoView must not be used'); } };
    e.getBoundingClientRect = () => {
      const lay = e.sticky ? { top: top + (height - e.offsetHeight) * k, h: e.offsetHeight * k } : { top: top + (e.offsetTop - d.scrollTop) * k, h: e.offsetHeight * k };
      const drawn = e.drawnAs ? e.drawnAs(lay) : lay; // an animation: the control is drawn smaller than its layout box for a moment
      return { top: drawn.top, bottom: drawn.top + drawn.h, height: drawn.h, left: 10, right: 110, width: 100 };
    };
    d.kids.push(e); return e;
  };
  d.foot = d.add('foot', 0, foot, { sticky: true });
  d.addEventListener = (t, f) => { (d.listeners[t] ||= []).push(f); }; d.removeEventListener = (t, f) => { d.listeners[t] = (d.listeners[t] || []).filter((x) => x !== f); };
  return d;
}
const style = (e) => e.style;
globalThis.getComputedStyle = style; // the sheet's stand-ins carry their own computed style
const boxOf = (e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; };

test('keepInView: a control under the sticky foot is brought up clear of it, a control above the top is brought down, a control in sight is left alone', () => {
  const d = sheet();
  const probe = d.add('probe', 350, 40);        // the next probe after one is used: drawn at 350..390 of a sheet that shows 0..330 above its foot
  const band = bandOf(d, probe, { style });
  assert.deepEqual([band.top, band.bottom, band.k], [0, 330, 1], 'the band ends where the foot begins');
  const moved = keepInView(d, probe, { style });
  assert.equal(d.scrollTop, 65); assert.equal(moved, 65);
  assertBand(boxOf(probe), bandOf(d, probe, { style }));
  const sight = d.add('in sight', 120, 40); d.scrollTop = 65;
  assert.equal(keepInView(d, sight, { style }), 0, 'in sight: not moved'); assert.equal(d.scrollTop, 65);
  d.scrollTop = 400; const head = d.add('head', 100, 28); // a stage head left above the top of a sheet scrolled for the last stage (y = -300)
  assert.ok(boxOf(head).top < 0);
  keepInView(d, head, { style }); assertBand(boxOf(head), bandOf(d, head, { style })); assert.equal(d.scrollTop, 95, 'scrolled up just far enough, its ring on the edge');
});

test('keepInView: the foot\'s own controls, hidden or empty boxes, strangers and a missing sheet are left alone; nothing is focused', () => {
  const d = sheet({ scroll: 30 }), own = d.add('Continue', 0, 40), stranger = { getBoundingClientRect: () => ({ top: 900, bottom: 940, width: 10, height: 40 }), parentElement: null };
  own.parentElement = d.foot; d.foot.contains = (x) => x === d.foot || x === own;
  assert.equal(keepInView(d, own, { style }), 0, 'a control on the sticky foot is always in sight (the foot is not what scrolls)');
  const gone = d.add('hidden', 700, 0); assert.equal(keepInView(d, gone, { style }), 0, 'no box, nothing to keep in sight');
  assert.equal(keepInView(d, stranger, { style }), 0, 'not in the sheet'); assert.equal(keepInView(d, d, { style }), 0); assert.equal(keepInView(null, own), 0); assert.equal(keepInView(d, null), 0);
  const low = d.add('low', 700, 40); keepInView(d, low, { style });
  assert.deepEqual([own.focused.length, low.focused.length], [0, 0], 'keepInView scrolls and never moves the cursor');
});

test('keepInView: a control caught half way through an animation is kept where its LAYOUT puts it (the result\'s head pops in at a scale of .7), and a scaled sheet is read as it is drawn', () => {
  // the head is drawn at .7 of its box for a moment, centred: 4px smaller each side. Measured then, it was 4px short of its place and the ring was left under the foot (found at 640x360, 200% zoom).
  const pop = ({ top, h }) => ({ top: top + h * 0.15, h: h * 0.7 });
  const a = sheet(), b = sheet();
  const still = a.add('head', 310, 28), popping = b.add('head', 310, 28, { drawnAs: pop });
  keepInView(a, still, { style }); keepInView(b, popping, { style });
  assert.equal(b.scrollTop, a.scrollTop, 'the same scroll whether or not it was caught mid-animation'); assert.ok(a.scrollTop > 0);
  // a sheet drawn at .98 (it arrives small): a distance read off the screen is turned back into scroll pixels
  const k = 0.98, c = sheet({ k }), ctl = c.add('probe', 350, 40);
  const delta = scrollDelta(boxOf(ctl), bandOf(c, ctl, { style })); keepInView(c, ctl, { style });
  assert.ok(Math.abs(c.scrollTop - delta / k) < 1e-9, 'scrollTop moves by the screen distance over the scale');
  assert.ok(Math.abs(boxOf(ctl).bottom + RING_REACH - bandOf(c, ctl, { style }).bottom) < 1e-6, 'and the ring then rests on the foot, not past it');
});

// a Deal Room painted into a stand-in sheet: the real session, the real run, the real HTML
const world = (seed = 9) => {
  const g = makeGame(['grad', 'native'], 'ops', seed);
  for (const z of [2, 3, 4]) g._openZone(z);
  g.s.cash = 1e6; for (const z of g.s.zones) for (let k = 0; k < 3; k++) g._spawnLot(z);
  return g;
};
function liveDeal() {
  const g = world(), zone = g.s.zones.find((z) => g.s.lots[z].some((l) => l.mode === 'fixed')), spec = { kind: 'buy', zone, lotId: g.s.lots[zone].find((l) => l.mode === 'fixed').id };
  const run = D.startRun(g, spec, {}); assert.ok(run.ok, run.msg);
  const d = sheet(); d.open = true; d.className = 'deal'; d.classList = { contains: (c) => d.className.split(' ').includes(c) };
  d.head = d.add('head', 80, 28); d.querySelector = (sel) => (sel === '[data-stage-head]' ? d.head : null);
  const ctx = fakeCtx(); ctx.g = () => g; ctx.dlg = { open() { d.open = true; }, close() { d.open = false; }, el: d }; ctx.setHTML = (el, html) => { el._html = html; return true; };
  const resize = []; globalThis.window = { addEventListener: (t, f) => { if (t === 'resize') resize.push(f); }, removeEventListener() {} };
  globalThis.requestAnimationFrame = (f) => f();
  const ses = UI.createSession(ctx, run); ses.show(); lastSes = ses;
  return { d, ses, resize, ctx };
}
let lastSes = null;
const cleanup = () => { try { lastSes?.dispose(); } catch { /* already closed */ } lastSes = null; globalThis.document.activeElement = null; delete globalThis.window; delete globalThis.requestAnimationFrame; };

test('the Deal Room brings the cursor into sight after every paint, without moving it', () => {
  const { d, ses } = liveDeal();
  try {
    assert.equal(globalThis.document.activeElement, d.head, 'a stage opens with the cursor on its head');
    const probe = d.add('Read the paperwork', 350, 40, { fid: 'pr-papers' });   // the control the cursor is left on after the probe before it was used: under the foot
    globalThis.document.activeElement = probe;
    ses.paint();
    assert.ok(d.scrollTop > 0, 'the repaint scrolled the sheet'); assertBand(boxOf(probe), bandOf(d, probe, { style }));
    assert.equal(globalThis.document.activeElement, probe, 'the cursor is where it was'); assert.deepEqual(probe.focused, [], 'never focused again, so a screen reader reads nothing twice');
    // the cursor in sight stays put: a paint moves nothing the player can see
    const was = d.scrollTop; ses.paint(); assert.equal(d.scrollTop, was);
    // a control the cursor was moved to by the paint itself (the one it was on is gone): its neighbour, wherever that is
    probe.disabled = true; const next = d.add('Hire an expert', 520, 40, { fid: 'pr-expert' }); d.scrollTop = 0; // the probe was used and is disabled: the cursor falls to its neighbour, which is further down still
    ses.paint(); assert.equal(globalThis.document.activeElement, next, 'the neighbour has the cursor'); assert.deepEqual(next.focused, [{ preventScroll: true }]); assertBand(boxOf(next), bandOf(d, next, { style }));
  } finally { cleanup(); }
});

test('a new stage opens at its head: the sheet is brought back to the top, then the head is kept in sight', () => {
  const { d, ses } = liveDeal();
  try {
    d.scrollTop = 300; ses.focusHead = true; globalThis.document.activeElement = null;
    ses.paint();
    assert.equal(d.scrollTop, 0, 'the last stage\'s scroll is not carried over (the head was 129px above the top at 844 x 390)'); assert.equal(globalThis.document.activeElement, d.head);
    assert.deepEqual(d.head.focused.at(-1), { preventScroll: true }, 'the page does not jump under a mouse: the head is focused where it is, then looked at');
    // a head that a short window leaves below the foot is brought up to it
    d.head.offsetTop = 340; d.scrollTop = 0; ses.focusHead = true; ses.paint();
    assertBand(boxOf(d.head), bandOf(d, d.head, { style })); assert.ok(d.scrollTop > 0);
  } finally { cleanup(); }
});

test('the keyboard\'s own moves and a resize are looked at too, and a click is not moved under the pointer', () => {
  const { d, ses, resize } = liveDeal();
  try {
    const rows = d.add('Summary', 360, 30, { fid: 'x', visible: true });
    // Tab put the ring one pixel under the foot (the browser scrolls by a guessed scroll-padding): looked at once the browser has scrolled
    globalThis.document.activeElement = rows; d.scrollTop = 0;
    for (const f of d.listeners.focusin) f({ target: rows });
    assertBand(boxOf(rows), bandOf(d, rows, { style }));
    // a mouse click focuses a half-seen control without a ring: it must not be scrolled before the button is released
    const half = d.add('half seen', 700, 40, { fid: 'y', visible: false }); globalThis.document.activeElement = half; d.scrollTop = 0;
    for (const f of d.listeners.focusin) f({ target: half });
    assert.equal(d.scrollTop, 0, 'no ring, no scroll');
    // a turned phone: the foot grew, the cursor is now under it
    globalThis.document.activeElement = rows; d.scrollTop = 0; d.foot.offsetHeight = 150; assert.ok(resize.length >= 1, 'a resize listener is bound');
    for (const f of resize) f(); assertBand(boxOf(rows), bandOf(d, rows, { style }));
    ses.dispose(); lastSes = null; assert.equal((d.listeners.focusin || []).length, 0, 'and every listener goes with the session');
  } finally { cleanup(); }
});

test('the sheet\'s way of scrolling is set, not animated, so reduced motion has nothing to switch off', () => {
  const css = read('css/ui-deal.css'), src = read('js/ui/deal.js'), common = read('js/ui/common.js');
  assert.match(css, /dialog\.deal \{[^}]*scroll-behavior: auto;/, 'the one scroller of the sheet states its behavior');
  assert.match(common, /d\.scrollTop = before \+ delta \/ band\.k/, 'a scrollTop assignment, never scrollTo({ behavior }) or scrollIntoView');
  assert.ok(!/scrollIntoView/.test(src), 'the old native scroll is gone from the Deal Room'); assert.ok(!/scroll-behavior:\s*smooth/.test(read('css/styles.css') + read('css/shell.css') + css));
  assert.match(src, /const ringShows = \(t\) => \{ try \{ return !!t\.matches\(':focus-visible'\); \} catch \{ return true; \} \};/); assert.match(src, /const onFocusIn = \(e\) => \{ const t = e\.target; if \(!t \|\| !ringShows\(t\)\) return;/, 'the keyboard\'s ring is the only focus that is chased');
});

// ------------------------------------------------------------------ 4: kept back, not "walks away"
const lite = (n) => ({ plan: { kind: 'buy' }, summary: { tone: 'info', title: 'No deal', headline: 'You passed.', lines: [], numbers: { unit: 'price paid', better: 'low', quick: null, expert: null, you: null, ...n }, reasons: [], reveal: null, xp: 0, streak: 0, lesson: { concept: 'anchoring', text: 'x' } } });

test('a table never sat at: Quick and the expert are "kept back" and the box says why, while your own row still says you walked away', () => {
  const h = UI.resultHTML(lite({ hidden: true }));
  assert.equal((h.match(/kept back/g) || []).length, 3, 'two rows and the sentence');
  assert.match(h, /<dt>Quick<\/dt><dd>kept back<\/dd>/); assert.match(h, /<dt>Expert<\/dt><dd>kept back<\/dd>/); assert.match(h, /<dt>You<\/dt><dd>walks away<\/dd>/, 'you did walk: that row is true');
  assert.match(h, /kept back until you have sat at the table/);
  const shown = UI.resultHTML(lite({ quick: 100, expert: 90, you: null }));
  assert.ok(!/kept back/.test(shown), 'a table that was sat at shows its figures'); assert.match(shown, /<dt>You<\/dt><dd>walks away<\/dd>/);
  const plain = UI.resultHTML(lite({}));
  assert.ok(!/kept back/.test(plain), 'nothing hidden, nothing said'); assert.equal((plain.match(/walks away/g) || []).length, 3, 'a deal nobody did reads as it always did');
  const net = UI.resultHTML({ ...lite({ hidden: true, net: 0, quickNet: null, expertNet: null }) });
  assert.ok(!/Against what it was really worth/.test(net), 'no "$0" for figures that are not there');
});

test('the engine marks it: walking away from a Read never sat at the Close hides the figures, and sitting at it shows them', () => {
  const g = world(), zone = g.s.zones.find((z) => g.s.lots[z].some((l) => l.mode === 'fixed')), spec = { kind: 'buy', zone, lotId: g.s.lots[zone].find((l) => l.mode === 'fixed').id };
  const r1 = D.startRun(g, spec, {}); r1.walkAway(); const s1 = r1.finish();
  assert.equal(s1.numbers.hidden, true, 'the table was never sat at'); assert.match(UI.resultHTML({ plan: r1.plan, summary: s1 }), /kept back until you have sat at the table/);
  assert.ok(!/walks away.*walks away.*walks away/s.test(UI.resultHTML({ plan: r1.plan, summary: s1 })), 'and it does not call the others walkers');
  const r2 = D.startRun(g, spec, {}); r2.quick(); r2.next(); r2.walkAway(); const s2 = r2.finish();
  assert.ok(!s2.numbers.hidden, 'a table sat at and left shows what Quick and an expert would have got');
});

// ------------------------------------------------------------------ 2: the sheets' Tab trap
const el = (o) => ({ offsetParent: o.hidden ? null : {}, tag: o.tag, ...o });
test('tabStops: the heading (tabindex -1) is never a stop, an answered option (aria-disabled) still is, a hidden control is not, the cursor is kept where it is', () => {
  const heading = el({ tag: 'h2', id: 'ac-sh' }), a = el({ tag: 'button', n: 'A', ariaDisabled: true }), b = el({ tag: 'button', n: 'B' }), gone = el({ tag: 'button', n: 'gone', hidden: true });
  const root = { querySelectorAll: (sel) => { assert.ok(!/tabindex="-1"\]/.test(sel.replace(/\[tabindex\]:not\(\[tabindex="-1"\]\)/, '')), 'the selector does not ask for tabindex -1'); return [a, b, gone]; } };
  assert.deepEqual(AC.tabStops(root, null), [a, b], 'hidden is not a stop'); assert.deepEqual(AC.tabStops(root, gone), [a, b, gone], 'but the control the cursor is on always is');
  assert.ok(!AC.TAB_STOP.split(',').some((s) => s.trim() === '[tabindex="-1"]'), 'tabindex -1 is not a stop'); assert.match(AC.TAB_STOP, /\[tabindex\]:not\(\[tabindex="-1"\]\)/);
  assert.match(AC.TAB_STOP, /button:not\(\[disabled\]\)/); assert.ok(!/aria-disabled/.test(AC.TAB_STOP), 'an answered option is read by Tab, so it is a stop');
  assert.ok(heading);
});
test('the sheet\'s trap wraps among the stops and takes the cursor off the heading with Shift+Tab', () => {
  const src = read('js/ui/academy.js'), at = src.indexOf("sheet.addEventListener('keydown'");
  const trap = src.slice(at, src.indexOf('ctx.el.overlay.appendChild(sheet)', at));
  assert.ok(!/\[tabindex="-1"\]/.test(trap), 'the old list that put the heading first is gone');
  assert.match(trap, /const f = tabStops\(sheet, document\.activeElement\)/); assert.match(trap, /away = !f\.includes\(on\)/);
  assert.match(trap, /e\.shiftKey && \(on === first \|\| away\)\) \{ lastEl\.focus\(\)/, 'Shift+Tab from the first stop, or from the heading, goes to the last');
  assert.match(trap, /!e\.shiftKey && on === lastEl\) \{ first\.focus\(\)/, 'Tab from the last goes to the first button, never to the heading');
  // the pure trap, played: a sheet of three stops and a heading
  const stops = ['A', 'B', 'C'], heading = 'H', next = (on, shift) => { const away = !stops.includes(on); if (shift && (on === stops[0] || away)) return stops.at(-1); if (!shift && on === stops.at(-1)) return stops[0]; return null; };
  assert.equal(next('C', false), 'A'); assert.equal(next('A', true), 'C'); assert.equal(next(heading, true), 'C'); assert.equal(next(heading, false), null, 'Tab from the heading goes where the page goes: the first button');
});

// ------------------------------------------------------------------ 3: the coach card
const STEP = (m, id) => m.steps.find((s) => s.id === id);
const M = (id) => ACADEMY.find((m) => m.id === id);
const note = (anchor, wait, s) => A.unseenNote(anchor, wait, s);
const when = (m, id) => { const s = STEP(M(m), id); return [s.anchor, s.wait]; };

test('unseenNote: a control that does not exist yet says what to do to make it appear', () => {
  const [qa, qw] = when('m01', 'student');   // deal-quick, before any deal is open
  assert.match(note(qa, qw, {}), /Deal Room is not open yet\. Open a deal first, from a buyer's card in Market or a lot in the world/);
  for (const [m, id] of [['m03', 'bree'], ['m04', 'careless'], ['m05', 'fleet'], ['m08', 'boutique']]) assert.match(note(...when(m, id), {}), /Open a deal first/, `${m} ${id}`);
  assert.match(note('hire-student', { type: 'event', event: 'hire' }, {}), /Open Crew and press Hire a manager/);
  assert.match(note(...when('m07', 'shock'), {}), /news line shows up when there is news/); assert.match(note('drawer', null, {}), /Open a panel from the dock/);
  assert.match(note('world:lot:second-watch', { type: 'event', event: 'inspect' }, {}), /cannot put a frame on it from here.*list under the world/, 'a thing in the world the world cannot place');
  assert.equal(note('hud-cash', null, {}), '', 'a control that is always there has nothing to add'); assert.equal(note('', null, {}), ''); assert.equal(note(null, null, {}), ''); assert.equal(note('Bad Anchor!', null, {}), '');
  assert.equal(note(qa, qw, { exists: true }), '', 'a thing that is on screen (framed, or too big to frame) needs no note');
});

test('unseenNote: a window over the game says so; the Deal Room tells the very deal the step asks for from another one, a finished one and one on the wrong stage', () => {
  assert.match(note('dock-stock', { type: 'ui', ui: 'open-drawer' }, { modal: 'dialog' }), /A window is open over the game\. Finish with it, or close it with Escape/);
  assert.match(note('dock-stock', null, { modal: 'hire' }), /close it with Escape/); assert.match(note('drawer', { type: 'event', event: 'hire' }, { modal: 'hire' }), /Pick a manager in this window, then press Hire/);
  const second = ['world:lot:second-watch', { type: 'event', event: 'inspect', match: { fake: false } }];
  assert.match(note(...second, { modal: 'deal', deal: { kind: 'buy', lot: 'first-watch' } }), /behind the Deal Room\. Close this deal, then tap it in the world/, 'the deal on the table is for the other watch');
  assert.equal(note(...second, { modal: 'deal', deal: { kind: 'buy', lot: 'second-watch' } }), '', 'the deal on the table IS the second watch: play it');
  assert.equal(note('world:asset:van', { type: 'event', event: 'repair' }, { modal: 'deal', deal: { kind: 'repair', asset: 'A1', assetCls: 'van' } }), '', 'a crate is named by its class too');
  assert.equal(note('drawer', { type: 'event', event: 'repair' }, { modal: 'deal', deal: { kind: 'repair' } }), '', 'a Repair opened from Stock is the step being done in this room');
  assert.match(note('dock-bank', { type: 'ui', ui: 'open-drawer' }, { modal: 'deal', deal: { kind: 'buy' } }), /Deal Room is open over the game\. Finish this deal, or close it/);
  assert.match(note('deal-quick', null, { modal: 'deal', deal: { kind: 'sell' } }), /not on this stage of the deal/, 'Quick lives on a stage you have not played');
  assert.match(note('deal-stage-pitch', null, { modal: 'deal', deal: { kind: 'sell', done: true } }), /That deal is finished\. Press Continue to close it/, 'the result is up: Continue closes it');
  assert.match(note(...second, { modal: 'deal', deal: { kind: 'buy', lot: 'second-watch', done: true } }), /finished/, 'even the right lot, once its deal is over');
  for (const text of [qaNote(), ...['dialog', 'hire', 'deal'].map((modal) => note('dock-stock', null, { modal, deal: { kind: 'sell' } }))]) { assert.ok(!/\bzone\b/i.test(text), 'district, never zone'); assert.ok(!/[–—]/.test(text), 'no dash for a pause'); }
});
const qaNote = () => note('deal-quick', null, {});

test('every lesson step that points at a Deal Room control or a thing under a window gets a note, and none is told it has a frame when it has none', () => {
  let n = 0;
  for (const m of ACADEMY) for (const s of m.steps) {
    const a = A.parseAnchor(s.anchor), text = note(s.anchor, s.wait, {});
    if (a?.kind === 'dom' && a.name.startsWith('deal-')) { n++; assert.match(text, /Open a deal first/, `${m.id} ${s.id}`); }
    for (const modal of ['dialog', 'deal']) if (a) assert.notEqual(note(s.anchor, s.wait, { modal, deal: { kind: 'none', done: true } }), '', `${m.id} ${s.id} under a ${modal}`);
  }
  assert.ok(n >= 7, `${n} steps are anchored on Deal Room controls (m01, m03, m04 x2, m05, m08 x2, m10)`);
});

test('coachHTML is honest about the frame: it says what to do, never claims a frame that is not there, and keeps its old words when it is not told', () => {
  const c = A.coachFor(M('m01'), { i: 3, n: 4 });
  const plain = AC.coachHTML(c, { title: 'First Swap', showMe: true });
  assert.match(plain, /It is the control with the gold frame\./, 'a card made without the runner\'s facts says what it always said');
  const framed = AC.coachHTML(c, { title: 'First Swap', showMe: true, framed: true, exists: true });
  assert.match(framed, /gold frame/); assert.ok(!/ac-where/.test(framed));
  const none = AC.coachHTML(c, { title: 'First Swap', showMe: true, framed: false, exists: false, where: "The Deal Room is not open yet. Open a deal first." });
  assert.match(none, /<p class="ac-where" role="note">The Deal Room is not open yet\. Open a deal first\.<\/p>/); assert.match(none, /Nothing to frame yet\./); assert.ok(!/gold frame/.test(none), 'no frame, none claimed');
  const big = AC.coachHTML(c, { title: 'First Swap', showMe: true, framed: false, exists: true });
  assert.match(big, /too big for a frame/); assert.ok(!/gold frame|Nothing to frame/.test(big));
  const quiet = AC.coachHTML(c, { title: 'First Swap', framed: false, where: 'Open a deal first.' });
  assert.match(quiet, /ac-where/); assert.ok(!/ac-look/.test(quiet), 'the note is always shown, the "look" line only on Show me');
  const hint = AC.coachHTML(c, { title: 'First Swap', hint: true, where: 'w', framed: false });
  assert.match(hint, /Hint:/); assert.match(hint, /ac-where/);
  const evil = AC.coachHTML(c, { title: 't', where: '<evil1>' }); assert.ok(!/<evil1>/.test(evil) && evil.includes('&lt;evil1&gt;'), 'what the note says is text');
});

test('the card follows into ANY open window, says what is behind it, and its hint stays on screen in a crowded one', () => {
  const src = read('js/ui/academy.js'), css = read('css/ui-academy.css');
  assert.match(src, /const hostFor = \(\) => \(dlg\.el\.open \? dlg\.el : ctx\.el\.overlay\)/, 'a Cash breakdown, an alert, a confirmation: the card is in it, so its hint is never under a modal');
  assert.match(src, /const modalKind = \(\) => \(!dlg\.el\.open \? null : dealOpen\(\) \? 'deal' : dlg\.el\.querySelector\('\[data-anchor\^="hire-"\]'\) \? 'hire' : 'dialog'\)/);
  assert.match(src, /unseenNote\(c\.anchor, c\.wait, \{ exists, clipped, modal, drawer: !ctx\.el\.drawer\.hidden, deal: modal === 'deal' \? dealOf\?\.\(\) : null \}\)/, 'and whether a panel is open (the news line steps aside for it on a small screen)');
  assert.match(src, /where, spot \? 1 : 0, exists \? 1 : 0, clipped \? 1 : 0\]\.join\('\|'\)/, 'the card is drawn again when the note or the frame changes');
  assert.match(src, /framed: !!spot, exists/, 'the card is told what the player can really see');
  assert.match(src, /announce\(`\$\{c\.finishing \? c\.say : `Step \$\{c\.index \+ 1\} of \$\{c\.total\}\. \$\{c\.say\}`\}\$\{said \? ` \$\{said\}` : ''\}`\)/, 'and so is a screen reader');
  assert.match(src, /if \(showMe && a\?\.kind === 'dom' && !ringEl\.hidden\) domEls\(a\.name\)\[0\]\?\.focus/, 'Show me moves the cursor only onto a control that has a frame');
  assert.match(src, /\(dlg\.el\.open && !\(cardEl && dlg\.el\.contains\(cardEl\)\)\)/, 'C reaches a card that lives in a window');
  assert.match(css, /\.ac-coach\.slim :is\(\.ac-look, \.ac-where\) \{ display: none; \}/, 'a slim card keeps the words and the hint, and drops the notes under them'); assert.doesNotMatch(css, /\.ac-coach\.(compact|min)\b/, 'no card is drawn without the words');
  assert.match(css, /\.ac-coach-in \{ max-height: calc\(100vh - 1rem\); max-height: calc\(100dvh - 1rem\); overflow: auto;/, 'the card is as tall as its words, up to the window, so the hint and its buttons are not cut by the card\'s own scroll');
  assert.match(css, /\.ac-coach \.ac-where \{/);
  assert.match(src, /Promise\.all\(\[import\('\.\/shell\.js'\), import\('\.\/deal\.js'\)\]\)/, 'the card asks the Deal Room what is on the table');
});

test('openDealOf: what is on the table, as ids, for the card; null when no Deal Room is open', () => {
  assert.equal(UI.openDealOf(), null, 'none open');
  const { ses } = liveDeal();
  try {
    const of = UI.openDealOf(); assert.equal(of.kind, 'buy'); assert.equal(of.lot, ses.run.plan.lot.id); assert.equal(of.done, false);
    ses.run.walkAway(); ses.run.finish(); assert.equal(UI.openDealOf().done, true, 'its result is showing');
    ses.dispose(); lastSes = null; assert.equal(UI.openDealOf(), null, 'closed');
  } finally { cleanup(); }
});

// ------------------------------------------------------------------ the real keyboard, in a real browser (opt in: PC_BROWSER=1 node --test tests/finish-flow.test.mjs)
// Walks sell, buy, auction and repair deals with Tab, Shift+Tab, Enter and Space at 390x844, 360x640, 844x390, 1024x768 and 200% zoom (640x360 at two device pixels to the CSS pixel), and checks
// after EVERY press that the control the cursor is on is fully visible: its ring inside the sheet's visible band (above the sticky foot, below the top edge), inside the viewport, and not
// covered. PC_VIEWPORTS=844x390,640x360@2 narrows it; PC_CDP is the DevTools port (default 9801). Needs Google Chrome (scripts/cdp.mjs). It takes a few minutes for the whole matrix.
const { CHROME } = await import('../scripts/chrome.mjs');
const BROWSER = process.env.PC_BROWSER === '1' && existsSync(CHROME);
const VIEWPORTS = (process.env.PC_VIEWPORTS || '390x844,360x640,844x390,1024x768,640x360@2').split(',').map((v) => { const [wh, dsf = '1'] = v.split('@'), [w, h] = wh.split('x'); return { w: +w, h: +h, dsf: +dsf, name: v }; });
/** In the page: where the cursor is, and whether it is fully visible. Anything but { ok: true } is a fault; the Tab that wraps past the dialog to the browser's own chrome is not one. */
const FOCUS_STOP = `(()=>{
  const d=document.getElementById('dlg'), a=document.activeElement, iw=innerWidth, ih=innerHeight;
  if(!d.open) return {err:'closed'};
  if(!a||a===document.body) return {wrap:true};
  if(a===d) return {err:'the dialog itself has the cursor'};
  if(!d.contains(a)) return {err:'focus outside the dialog'};
  const r=a.getBoundingClientRect(), R=5, ring={l:r.left-R,t:r.top-R,r:r.right+R,b:r.bottom+R};
  const dr=d.getBoundingClientRect(), port={l:dr.left+d.clientLeft,t:dr.top+d.clientTop}; port.r=port.l+d.clientWidth; port.b=port.t+d.clientHeight;
  let top=Math.max(0,port.t), bottom=Math.min(ih,port.b), left=Math.max(0,port.l), right=Math.min(iw,port.r), by=null;
  for(const e of d.querySelectorAll('*')){ const cs=getComputedStyle(e); if(cs.position!=='sticky'||cs.display==='contents'||e.contains(a)) continue; const q=e.getBoundingClientRect(); if(q.height>0&&q.width>0&&q.top>(port.t+port.b)/2&&q.top<bottom){bottom=q.top;by=e.className||e.tagName} }
  const why=[];
  if(ring.t<top-0.5) why.push('above the top by '+Math.round(top-ring.t));
  if(ring.b>bottom+0.5) why.push('under '+(by||'the foot')+' by '+Math.round(ring.b-bottom));
  if(ring.l<left-0.5||ring.r>right+0.5) why.push('past a side');
  if(ring.t<0||ring.b>ih||ring.l<0||ring.r>iw) why.push('ring outside the viewport');
  const hit=document.elementFromPoint(Math.min(iw-1,Math.max(0,r.left+r.width/2)),Math.min(ih-1,Math.max(0,r.top+r.height/2)));
  if(!hit||!(a.contains(hit)||(hit.closest('label')&&hit.closest('label')===a.closest('label')))) why.push('covered by '+(hit?(hit.className||hit.tagName):'nothing'));
  return {ok:!why.length, why, text:(a.textContent||a.dataset.fid||a.tagName).trim().slice(0,28), stage:d.querySelector('.deal')?.dataset.stage};
})()`;

test('keyboard walks through sell, buy, auction and repair deals: every stop and every press leaves the cursor and its ring fully in sight', { skip: !BROWSER, timeout: 3_600_000 }, async () => {
  const { createServer } = await import('node:http'), { handler } = await import('../server/static.mjs'), { launch, open } = await import('../scripts/cdp.mjs'), { newGame } = await import('../scripts/boot.mjs');
  const server = createServer(handler); await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`, chrome = await launch(+process.env.PC_CDP || 9801), faults = [];
  try {
    for (const vp of VIEWPORTS) for (const kind of ['sell', 'buy', 'auction', 'repair']) {
      const label = `${vp.name} ${kind}`, slot = 'ff' + Date.now() % 1e6, p = await open(chrome, `${base}/?slot=${slot}`, { w: vp.w, h: vp.h, dsf: vp.dsf });
      try {
        await p.eval(`localStorage.setItem('pc.academyDone.${slot}', 'true')`);
        await newGame(p, { days: 3 });
        // three crates of our own (one broken for the bench), plenty of cash, then the deal through the real drawers
        await p.eval(`(()=>{const g=pc.S.game,s=g.s; s.cash=900; const z=s.zones[0]; s.assets=[]; for(const [cls,cond] of [['bike','broken'],['radio','ok'],['dormFridge','ok']]){ const x=g._mk(s,cls,{cond,quality:1,zone:z}); x.basis=g.val(x); s.assets.push(x);} pc.S.emit('change')})()`);
        const click = (sel) => p.eval(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}); if(!b||b.disabled) return false; b.click(); return true})()`);
        let opened;
        if (kind === 'repair') { await click('[data-anchor="dock-stock"]'); await p.sleep(500); opened = await click('[data-act="stock-repair"]'); } else {
          await click('[data-anchor="dock-market"]'); await p.sleep(500);
          if (kind === 'sell') { await click(`[data-act="market-zone"][data-z="${await p.eval('pc.S.game.s.zones[0]')}"]`); await click('[data-act="market-tab"][data-t="buyers"]'); await p.sleep(250); opened = await click('[data-act="market-sell"]'); } else {
            const lot = await p.eval(`(()=>{const s=pc.S.game.s; for(const z of s.zones){ const l=(s.lots[z]||[]).find(l=>l.cond==='ok'); if(l){ ${kind === 'auction' ? "l.mode='auction';" : ''} return {z,id:l.id}; } } return null})()`);
            await click(`[data-act="market-zone"][data-z="${lot.z}"]`); await click('[data-act="market-tab"][data-t="lots"]'); await p.sleep(300); opened = await click(`[data-act="market-look"][data-lot="${lot.id}"]`);
          }
        }
        await p.sleep(700); assert.ok(opened && await p.eval("document.getElementById('dlg').open"), `${label}: the Deal Room opened`);
        let stops = 0; const stages = new Set();
        const stop = async (what) => { const c = await p.eval(FOCUS_STOP); stops++; if (!c.wrap && !c.ok) faults.push(`${label} | ${what}: ${JSON.stringify(c)}`); return c; };
        const tab = async (shift) => { await p.key('Tab', { mod: shift ? 8 : 0, wait: 60 }); return stop(shift ? 'Shift+Tab' : 'Tab'); };
        const here = (sel) => p.eval(`!!document.activeElement && document.activeElement.matches(${JSON.stringify(sel)})`);
        const press = async (sel, what, key = 'Enter') => {
          let ok = false; for (let i = 0; i < 40 && !(ok = await here(sel)); i++) await tab(false);
          for (let i = 0; i < 40 && !ok; i++) { await tab(true); ok = await here(sel); }
          if (!ok) { faults.push(`${label} | could not reach ${sel}`); return false; }
          await p.key(key, { wait: 160 }); await stop(`${key} ${what}`); return true;
        };
        const has = (sel) => p.eval(`!![...document.querySelectorAll('#dlg ${sel}')].find(e=>!e.disabled && e.getAttribute('aria-disabled')!=='true')`);
        await stop('open'); let bids = 0;
        for (let guard = 0; guard < 60; guard++) {
          const st = await p.eval(`document.querySelector('#dlg .deal')?.dataset.stage || null`); stages.add(st);
          if (st === 'result') { for (let i = 0; i < 4; i++) await tab(true); for (let i = 0; i < 4; i++) await tab(false); await p.eval(`document.querySelector('[data-close][data-fid="done"]').focus()`); await p.key('Enter', { wait: 300 }); break; }
          if (await has('.deal-foot [data-deal="next"], .deal-foot [data-deal="finish"]')) { await press('.deal-foot [data-deal="next"], .deal-foot [data-deal="finish"]', 'Continue'); continue; }
          if (st === 'pitch') { if ((await p.eval(`document.querySelectorAll('#dlg .angle.on').length`)) < 2) await press('[data-deal="angle"]:not(.on)', 'angle'); else await press('[data-deal="pitch-go"]', 'Pitch'); continue; }
          if (st === 'read') { if (await has('.probe:not(.used)')) await press('.probe:not(.used):not(:disabled)', 'probe'); else await press('[data-deal="read-done"]', 'Done reading'); continue; }
          if (st === 'close') {
            if (await has('[data-deal="anchor"]')) await press('[data-deal="anchor"][data-level="fair"]', 'anchor');
            else if (guard % 3 === 0 && await has('[data-deal="hold"]')) await press('[data-deal="hold"]', 'hold');
            else if (guard % 3 === 1 && await has('[data-deal="concede"][data-size="small"]')) await press('[data-deal="concede"][data-size="small"]', 'concede');
            else if (await has('[data-deal="accept"]')) await press('[data-deal="accept"]', 'accept'); else await press('[data-deal="walk"]', 'walk');
            continue;
          }
          if (st === 'bid') { if (bids++ < 4 && await has('[data-deal="bid"]')) await press('[data-deal="bid"]', 'bid'); else await press('[data-deal="drop"]', 'drop'); continue; }
          if (st === 'fix') { await press('[data-deal="stop"]', 'Stop', ' '); continue; }
          break;
        }
        // the walk really went through the deal: its own stage was played and the result was reached, with a good many presses and stops checked on the way
        const own = { sell: 'pitch', buy: 'read', auction: 'bid', repair: 'fix' }[kind];
        assert.ok(stages.has(own) && stages.has('result') && stops >= 12, `${label}: walked ${[...stages].join(', ')} with ${stops} stops checked`);
      } finally { await p.close(); }
    }
  } finally { chrome.close(); await new Promise((ok) => server.close(ok)); }
  assert.deepEqual(faults, [], `every focus stop and every press is fully in sight:\n${faults.join('\n')}`);
});
