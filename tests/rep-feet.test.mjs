// Sticky bars and the keyboard (branch v2/rep-feet). A bar that sticks to an edge of what scrolls (the Crew hire dialog's foot, the Stock selection bar, the Travel ship row, the
// Quests jump bar, the world list's heading, the draft's actions bar) stands over whatever Tab scrolls to that edge, unless the scroller is told how far the bar reaches. Real Tab sweeps
// found it: the hire dialog hid 3 stops at 1024x768, 8 at 844x390, 5 at 360x640 and 7 at 640x360 (twice the device pixels), the Stock bar 3 to 14, the Ship row 2 to 6, the world list 1 to 7 (Shift+Tab, to a heading at the top), the draft 6 to 18.
//   1  common.js: stuckReach and fitStuck, the one measure every one of them uses (a bar's reach, the bar that is too tall to stick, what is written and when), and where dlg calls it
//   2  every `position: sticky` in the sheets is accounted for (a bar this mechanism measures, the Deal Room's own, or a column): a new one that is neither fails here
//   3  the real keyboard, in a real browser: every stop of every one of those surfaces at 1024x768, 844x390 (3x), 360x640 (3x) and 640x360 (2x) is clear of the bar, and the same sweep
//      with the mechanism switched off in the page fails (so the check can fail). Needs Google Chrome (scripts/cdp.mjs); PC_NO_BROWSER=1 skips it; PC_FEET_VIEWPORTS=844x390@3,360x640@3 narrows it.
// Run: node --test tests/rep-feet.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const noDoc = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, activeElement: null };
globalThis.document = noDoc;
const { stuckReach, fitStuck, FREE, FOCUSABLE, SLACK, dlg, initDialog } = await import('../js/ui/common.js');
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

// ------------------------------------------------------------------ 1: the measure
/** A sticky bar as the page reports it: its edge, height and sticky offset (px), and whether it has already let go (data-free). */
function bar(edge, { h = 58, off = 0, free = false } = {}) {
  const attrs = new Set(free ? ['data-free'] : []);
  return { dataset: { stuck: edge }, offsetHeight: h, css: { top: edge === 'top' ? off + 'px' : 'auto', bottom: edge === 'bottom' ? off + 'px' : 'auto' }, attrs,
    hasAttribute: (n) => attrs.has(n), toggleAttribute(n, on) { if (on) attrs.add(n); else attrs.delete(n); } };
}
/** A scrolling box: its padding (px), its visible height and the bars inside it; its custom properties are kept and counted. */
function box({ pt = 0, pb = 0, h = 600, bars = [], controls = [] } = {}) {
  const props = {}; let writes = 0;
  return { clientHeight: h, css: { paddingTop: pt + 'px', paddingBottom: pb + 'px' }, bars, controls, querySelectorAll: (s) => (s === '[data-stuck]' ? bars : s === FOCUSABLE ? controls : []), props,
    style: { getPropertyValue: (k) => props[k] ?? '', setProperty: (k, v) => { props[k] = v; writes++; } }, get writes() { return writes; } };
}
const style = (e) => e.css;

test('stuckReach: how far a stuck bar stands into its box is the box\'s padding, plus the bar\'s own offset, plus its height, the numbers the real page gave', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is ${b}`);
  // the Crew hire dialog: padding 17.6 (1.1rem), sticky offset -1.1rem so the foot is flush with the dialog's edge, 58px tall
  near(stuckReach(box({ pb: 17.6, h: 370, bars: [bar('bottom', { off: -17.6, h: 58 })] }), style).bottom, 58);
  // the Quests jump bar: drawer padding 12, offset -12 (it bleeds to the drawer's edge), 59px
  near(stuckReach(box({ pt: 12, pb: 12, bars: [bar('top', { off: -12, h: 59 })] }), style).top, 59);
  // the Stock selection bar sticks at the padding's inner edge (offset 0): the 12px of padding are in front of it
  near(stuckReach(box({ pt: 12, pb: 12, bars: [bar('top', { off: 0, h: 100 })] }), style).top, 112);
  // the Travel ship row, bottom: 149px with the offset that cancels the padding
  near(stuckReach(box({ pt: 12, pb: 12, bars: [bar('bottom', { off: -12, h: 149 })] }), style).bottom, 149 - 0);
  // the draft's actions bar on the page itself: no padding, offset 0
  near(stuckReach(box({ h: 768, bars: [bar('bottom', { off: 0, h: 73 })] }), style).bottom, 73);
  // the world list's heading: no padding on top, offset 0, 34px
  near(stuckReach(box({ h: 209, bars: [bar('top', { off: 0, h: 34 })] }), style).top, 34);
});

test('stuckReach: edges are separate, the deepest bar on an edge counts, a hidden bar counts for nothing, anything that is not a box answers nothing', () => {
  const both = box({ pt: 12, pb: 12, bars: [bar('top', { off: -12, h: 40 }), bar('top', { off: 0, h: 20 }), bar('bottom', { off: -12, h: 50 })] });
  assert.deepEqual(stuckReach(both, style), { top: 40, bottom: 50 }, 'top: the deeper of 40 and 12+20; bottom 50');
  const hidden = bar('bottom', { h: 0 }), b = box({ bars: [hidden] });
  assert.deepEqual(stuckReach(b, style), { top: 0, bottom: 0 }); assert.equal(hidden.attrs.size, 0, 'a bar with no box is left alone: nothing to measure, nothing to let go of');
  // in a PADDED box a hidden bar would still make a reach out of nothing (the box's 12px of padding, plus an offset of 0, plus a height of 0): only the guard on its height keeps it at 0
  const padded = box({ pt: 12, pb: 12, h: 400, bars: [bar('top', { h: 0, off: 0 }), bar('bottom', { h: 0, off: 0 })] });
  assert.deepEqual(stuckReach(padded, style), { top: 0, bottom: 0 }, 'a hidden bar in a padded box stands over nothing');
  assert.deepEqual(stuckReach(box({ pt: 12, pb: 12, h: 400, bars: [bar('bottom', { h: 0, off: 4 })] }), style), { top: 0, bottom: 0 }, 'whatever its offset');
  assert.deepEqual(stuckReach(null, style), { top: 0, bottom: 0 }); assert.deepEqual(stuckReach({}, style), { top: 0, bottom: 0 }); assert.deepEqual(stuckReach(box({ bars: [] }), style), { top: 0, bottom: 0 });
  const odd = { dataset: { stuck: 'sideways' }, offsetHeight: 30, css: { top: 'auto', bottom: 'auto' }, hasAttribute: () => false, toggleAttribute() {} };
  assert.deepEqual(stuckReach(box({ pb: 10, bars: [odd] }), style), { top: 0, bottom: 40 }, 'an edge that is not "top" is the bottom; "auto" is no offset');
});

test('a bar that would stand over most of its box lets go: data-free, no reach, and it comes back when the box grows, with nothing flipping in between', () => {
  assert.equal(FREE, 0.4, 'more than two fifths of the box');
  const ship = bar('bottom', { off: -12, h: 149 }), phone = box({ pt: 12, pb: 12, h: 203, bars: [ship] });  // a phone on its side: the drawer's body is 203px high, the Ship row 149
  assert.deepEqual(stuckReach(phone, style), { top: 0, bottom: 0 }, 'it reaches nothing: no padding could make room for a control beside 149px of 203');
  assert.ok(ship.attrs.has('data-free'), 'it scrolls with the content instead (css: [data-stuck][data-free] is static)');
  assert.deepEqual(stuckReach(phone, style), { top: 0, bottom: 0 }); assert.ok(ship.attrs.has('data-free'), 'looked at again, nothing changes');
  phone.clientHeight = 600;                                  // the window grew: 149 of 600 is a quarter
  assert.equal(stuckReach(phone, style).bottom, 149); assert.ok(!ship.attrs.has('data-free'), 'it sticks again');
  assert.equal(stuckReach(phone, style).bottom, 149);
  const edge = bar('bottom', { h: 240 }), fits = box({ h: 600, bars: [edge] });
  stuckReach(fits, style); assert.ok(!edge.attrs.has('data-free'), 'exactly two fifths still sticks');
  const over = bar('bottom', { h: 241 }); stuckReach(box({ h: 600, bars: [over] }), style); assert.ok(over.attrs.has('data-free'), 'one pixel more does not');
});

test('a bar also lets go when the tallest control would not fit beside it: a 253px manager card, an 83px foot, a 340px dialog (the hire dialog short of cash, on a phone on its side)', () => {
  assert.equal(SLACK, 16, 'half a rem on each side of the control, for its ring');
  assert.match(FOCUSABLE, /\[tabindex\]:not\(\[tabindex="-1"\]\)/, 'a tabindex of -1 is not a Tab stop: the page\'s <main> has one and is 2,000px tall (it once made every bar of the draft let go)');
  assert.doesNotMatch(FOCUSABLE.replace('[tabindex]:not([tabindex="-1"])', ''), /tabindex/);
  const ctl = (h, onBar = false) => ({ offsetHeight: h, closest: () => (onBar ? {} : null) });
  const foot = bar('bottom', { off: -17.6, h: 83 }), d = box({ pb: 17.6, h: 340, bars: [foot], controls: [ctl(253), ctl(44, true), ctl(500, true)] });
  assert.deepEqual(stuckReach(d, style), { top: 0, bottom: 0 }, '253 + 83 + 16 is 352 of 340: no padding can bring that card clear of the foot'); assert.ok(foot.attrs.has('data-free'));
  foot.offsetHeight = 58; assert.equal(stuckReach(d, style).bottom, 58, '253 + 58 + 16 is 327 of 340: the foot sticks, and the sweep of it finds nothing under it'); assert.ok(!foot.attrs.has('data-free'));
  foot.offsetHeight = 71; assert.equal(stuckReach(d, style).bottom, 71, '253 + 71 + 16 is exactly 340: it still fits'); foot.offsetHeight = 72; assert.deepEqual(stuckReach(d, style), { top: 0, bottom: 0 }, 'one pixel more does not');
  assert.ok(foot.attrs.has('data-free'), 'and the controls ON a bar (500px here) were never counted: they stay in sight beside it by being the bar');
  const none = box({ pb: 17.6, h: 340, bars: [bar('bottom', { off: -17.6, h: 83 })] }); assert.equal(stuckReach(none, style).bottom, 83, 'a box with no controls has nothing that could be covered');
});

test('fitStuck writes --stuck-t and --stuck-b in whole pixels, only when they changed, and answers nothing for a thing that is not a box', () => {
  const foot = bar('bottom', { off: -17.6, h: 57.8 }), b = box({ pb: 17.6, h: 370, bars: [foot] });
  const r = fitStuck(b, style);
  assert.deepEqual(b.props, { '--stuck-t': '0px', '--stuck-b': '58px' }); assert.equal(Math.round(r.bottom), 58);
  const n = b.writes; fitStuck(b, style); assert.equal(b.writes, n, 'looked at again: nothing is written (a drawer is looked at after every redraw)');
  foot.offsetHeight = 93;                                       // the reason line came in: a taller foot
  fitStuck(b, style); assert.equal(b.props['--stuck-b'], '93px'); assert.equal(b.writes, n + 1, 'only the property that moved');
  foot.offsetHeight = 0; fitStuck(b, style); assert.equal(b.props['--stuck-b'], '0px', 'a foot that is gone leaves no padding');
  assert.equal(fitStuck(null), null); assert.equal(fitStuck({}), null); assert.equal(fitStuck(undefined), null);
});

test('dlg: every dialog is measured when it opens and when the window changes size; dlg.fit() measures the open one again, and a closed dialog is left alone', () => {
  const on = {}, foot = bar('bottom', { off: -17.6, h: 58 }), d = box({ pb: 17.6, h: 370, bars: [foot] });
  Object.assign(d, { open: false, tabIndex: 0, scrollTop: 5, className: '', innerHTML: '', setAttribute() {}, addEventListener: (k, f) => { on[k] = f; }, showModal() { this.open = true; }, close() { this.open = false; }, querySelector: () => null, contains: () => false });
  globalThis.getComputedStyle = style;                           // the stand-ins carry their own computed style
  globalThis.document = { ...noDoc, activeElement: null, querySelector: (q) => (q === '#dlg' ? d : null) };
  const wins = {}; globalThis.addEventListener = (k, f) => { wins[k] = f; };
  try {
    initDialog(); assert.equal(typeof wins.resize, 'function', 'a window that changes size wraps a foot onto more lines: it is heard');
    wins.resize(); assert.equal(d.writes, 0, 'a closed dialog is not measured (it has no boxes)'); assert.equal(dlg.fit(), null);
    dlg.open('<p>x</p>', { label: 'x' }); assert.equal(d.props['--stuck-b'], '58px', 'opened: measured once it is on the screen');
    foot.offsetHeight = 93; assert.equal(dlg.fit().bottom, 93 - 0); assert.equal(d.props['--stuck-b'], '93px', 'a dialog that repainted its foot says so');
    foot.offsetHeight = 70; wins.resize(); assert.equal(d.props['--stuck-b'], '70px', 'and a resize measures it again');
    d.close(); foot.offsetHeight = 11; wins.resize(); assert.equal(d.props['--stuck-b'], '70px', 'a closed dialog keeps what it had until it opens again');
  } finally { delete globalThis.addEventListener; delete globalThis.getComputedStyle; globalThis.document = noDoc; }
});

// ------------------------------------------------------------------ 2: every sticky bar in the sheets is accounted for
/** `position: sticky` rules of every sheet: [selector, file]. Comments are taken out first; a rule inside a media block is found as the rule it is. */
function stickyRules() {
  const out = [];
  for (const f of readdirSync(new URL('../css/', import.meta.url)).filter((n) => n.endsWith('.css'))) {
    const css = read('css/' + f).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)) if (/position:\s*sticky/.test(m[2])) for (const sel of m[1].split(',')) out.push([sel.trim(), f]);
  }
  return out;
}
/** Each sticky selector, and who answers for it. `bar`: this file's markup carries data-stuck on it, and fitStuck measures it for its scroller. `deal`: the Deal Room's own fixed
 *  scroll-padding and keepInView (tests/finish-flow.test.mjs). `column`: a column beside its neighbours, not a bar over them: nothing scrolls under it. `card`: the coach card's own foot of buttons,
 *  in a box that holds words and nothing else a keyboard stops on (the buttons ARE the bar), pinned so a window shorter than the words does not cut them (tests/repair-card.test.mjs). */
const STICKY = {
  '.cr-foot': { how: 'bar', file: 'js/ui/drawers/crew.js', edge: 'bottom', tag: 'div class="cr-foot"' },
  '.stk-selbar': { how: 'bar', file: 'js/ui/drawers/stock.js', edge: 'top', tag: 'div class="stk-selbar"' },
  '.tv-shiprow': { how: 'bar', file: 'js/ui/drawers/travel.js', edge: 'bottom', tag: 'div class="tv-shiprow"' },
  '.qs-nav': { how: 'bar', file: 'js/ui/drawers/quests.js', edge: 'top', tag: 'nav class="qs-nav"' },
  '.dr-actions': { how: 'bar', file: 'js/ui/draft.js', edge: 'bottom', tag: 'div class="dr-actions" id="dr-actions"' },
  '.wvlist > summary': { how: 'bar', file: 'js/ui/worldview.js', edge: 'top', tag: 'summary' },
  '.deal-dock': { how: 'deal' }, '.deal-foot': { how: 'deal' }, '.deal-top': { how: 'deal' }, // .deal-top: the header from 761 px up (the sound branch's U5: at XL text it kept scrolling out of view; scroll-padding-top in css/ui-deal.css keeps a focused control clear of it)
  '.deal-result > .row:last-child': { how: 'deal' },
  '.dr-side': { how: 'column' },
  '.ac-coach:not(.handle) .ac-btns': { how: 'card' },
};

test('every position: sticky in the sheets is a bar that is measured, the Deal Room\'s own, or a column: a new one fails here until it is one of them', () => {
  const found = new Map(); for (const [sel, f] of stickyRules()) found.set(sel, f);
  const unknown = [...found].filter(([sel]) => !(sel in STICKY)).map(([sel, f]) => `${sel} (${f})`);
  assert.deepEqual(unknown, [], 'a sticky bar nobody accounted for stands over the control Tab scrolls to: mark it data-stuck="top" or "bottom" in its markup, call fitStuck on its scroller (see common.js), and add it to STICKY here');
  const stale = Object.keys(STICKY).filter((sel) => !found.has(sel));
  assert.deepEqual(stale, [], 'a row of STICKY whose rule is gone');
});

test('each measured bar carries data-stuck on the right edge, and each kind of scroller turns --stuck-t and --stuck-b into its scroll-padding', () => {
  for (const [sel, o] of Object.entries(STICKY)) {
    if (o.how !== 'bar') continue;
    const src = read(o.file), i = src.indexOf('<' + o.tag);
    assert.ok(i >= 0, `${sel}: its markup is in ${o.file}`);
    assert.match(src.slice(i, src.indexOf('>', i)), new RegExp(`data-stuck="${o.edge}"`), `${sel} says which edge it sticks to`);
  }
  const base = read('css/styles.css'), shell = read('css/shell.css'), pad = (edge) => `calc\\(\\.5rem \\+ var\\(--stuck-${edge}, 0px\\)\\)`;
  assert.match(base, new RegExp(`\\ndialog \\{ scroll-padding-block: ${pad('t')} ${pad('b')};`), 'a dialog: half a rem for the ring, and the bars');
  assert.match(base, new RegExp(`\\nhtml \\{[^}]*scroll-padding-block: ${pad('t')} ${pad('b')};`), 'the page (the draft)');
  assert.match(shell, /\.db \{[^}]*scroll-padding: calc\(var\(--sp-2\) \+ var\(--stuck-t, 0px\)\) var\(--sp-2\) calc\(var\(--sp-2\) \+ var\(--stuck-b, 0px\)\);/, 'a drawer\'s body');
  assert.match(shell, /\.wvlist\[open\] \{[^}]*scroll-padding: calc\(var\(--sp-2\) \+ var\(--stuck-t, 0px\)\) var\(--sp-2\) var\(--sp-2\);/, 'the world list');
  assert.match(base, /\n\[data-stuck\]\[data-free\] \{ position: static; \}/, 'a bar that has let go is static (two classes, so it beats every bar\'s own rule)');
  assert.doesNotMatch(shell, /\.db:has\(\.(qs-nav|tv-shiprow)\)/, 'the drawers\' guessed numbers (4.4rem, 5.6rem) are gone: a bar wraps, so its height is measured');
  // the Deal Room keeps its own, which is more specific than the dialog rule above
  assert.match(read('css/ui-deal.css'), /dialog\.deal \{[^}]*scroll-padding: \.5rem \.5rem 8rem/);
});

test('who measures: dlg on open and on resize, the Crew dialog after it repaints, the shell after a drawer is drawn and when anything resizes, the world list when it is built, the draft when it changes', () => {
  const common = read('js/ui/common.js'), crew = read('js/ui/drawers/crew.js'), shell = read('js/ui/shell.js'), wv = read('js/ui/worldview.js'), draft = read('js/ui/draft.js');
  assert.match(common, /d\.showModal\(\);[\s\S]{0,220}fitStuck\(d\);/, 'dlg.open'); assert.match(common, /addEventListener\?\.\('resize', \(\) => \{ if \(d\.open\) fitStuck\(d\); \}\)/, 'a resize');
  assert.match(crew, /body\.innerHTML = hireBody\(ctx\);\s*ctx\.dlg\.fit\?\.\(\);/, 'the hire dialog repaints its foot (the reason line comes and goes)');
  assert.match(shell, /if \(redrawn\) \{ collectBars\(\); fitDrawer\(\); \}/, 'a drawer that was drawn'); assert.match(shell, /new ResizeObserver\(\(\) => \{ measure\(\); fitToasts\(\); fitDrawer\(\); \}\)/, 'and a window that changed size');
  assert.match(shell, /function fitDrawer\(\) \{ const db = el\.drawer\.hidden \? null : el\.drawer\.querySelector\('\.db'\); if \(db\?\.querySelector\('\[data-stuck\]'\)\) fitStuck\(db\); \}/, 'only a body that has a bar is looked at: the rest cost nothing');
  assert.match(wv, /fitStuck\(box\);/); assert.match(wv, /addEventListener\('resize', onResize\)/); assert.match(wv, /removeEventListener\('resize', onResize\)/, 'and lets go of the window when the world is torn down');
  assert.match(draft, /fit\(\); \/\/ a notice makes the bar a line taller/); assert.match(draft, /destroy\(\) \{ globalThis\.removeEventListener\?\.\('resize', fit\);[^}]*removeProperty\('--stuck-b'\)/, 'and gives the page back its padding when the screen goes');
});

// ------------------------------------------------------------------ 3: the real keyboard
const { CHROME } = await import('../scripts/chrome.mjs');
const BROWSER = !process.env.PC_NO_BROWSER && existsSync(CHROME);
const ALL = [{ name: '1024x768', w: 1024, h: 768, dsf: 1, mobile: false }, { name: '844x390@3', w: 844, h: 390, dsf: 3, mobile: true }, { name: '360x640@3', w: 360, h: 640, dsf: 3, mobile: true }, { name: '640x360@2', w: 640, h: 360, dsf: 2, mobile: true }];
const VIEWPORTS = process.env.PC_FEET_VIEWPORTS ? ALL.filter((v) => process.env.PC_FEET_VIEWPORTS.split(',').includes(v.name)) : ALL;
const freePort = async () => { const { createServer } = await import('node:net'); return new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); }); };
let shared = null;
/** One static server and one headless Chrome for every browser test of this file; each test opens a page of its own (its own save slot). */
async function browser() {
  if (shared) return shared;
  const { createServer } = await import('node:http'), { handler } = await import('../server/static.mjs'), { launch, open } = await import('../scripts/cdp.mjs');
  const server = createServer(handler); await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const chrome = await launch(await freePort()), base = `http://127.0.0.1:${server.address().port}`;
  shared = { base, chrome, open, close: async () => { chrome.close(); await new Promise((ok) => server.close(ok)); shared = null; } };
  return shared;
}
test.after(async () => { if (shared) await shared.close(); });

const until = async (p, expr, what, ms = 20000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await p.eval(expr); if (last) return last; } catch { /* between screens */ } await p.sleep(80); } assert.fail(`timed out waiting for ${what}`); };
const click = (p, expr) => p.eval(`(()=>{ const b=${expr}; if(!b) return false; b.click(); return true; })()`);
const text = (re, root = 'document') => `[...${root}.querySelectorAll('button')].find(b=>b.getClientRects().length&&${re}.test(b.textContent.trim().replace(/\\s+/g,' ')))`;

/** In the page: where the cursor is, and what is wrong with where it is. `scope` is the surface being walked (a selector, or 'html' for the page itself). A sticky bar is found by what the browser says it is
 *  (computed position: sticky), never by the mark the fix puts on it, so the walk sees the same bars on a page that has none of the fix. */
const stopJs = (scope) => `(()=>{
  const a=document.activeElement, sc=document.querySelector(${JSON.stringify(scope)});
  if(!a||a===document.body||a===document.documentElement) return {none:true};
  if(${JSON.stringify(scope)}!=='html'&&!(sc&&sc.contains(a))) return {left:true};
  const r=a.getBoundingClientRect(), vw=document.documentElement.clientWidth, vh=innerHeight, why=[];
  let ix=0; for(const e of document.getElementsByTagName('*')){ if(e===a) break; ix++; }
  const name=(e)=>String(e.className||e.tagName).split(' ')[0]||e.tagName;
  let stuck=0, bars=0, freed=0;
  for(const b of (sc||document).querySelectorAll('[data-stuck]')){ if(b.getBoundingClientRect().height>0){ bars++; if(b.hasAttribute('data-free')) freed++; } }
  for(const b of (sc||document).querySelectorAll('*')){ const cs=getComputedStyle(b); if(cs.position!=='sticky'||cs.display==='contents'||b.contains(a)) continue; const q=b.getBoundingClientRect(); if(!(q.height>0&&q.width>0)) continue; stuck++;
    if(r.bottom>q.top+.5&&r.top<q.bottom-.5&&r.right>q.left+.5&&r.left<q.right-.5) why.push('under '+name(b)+' '+Math.round(q.top)+'..'+Math.round(q.bottom));
    else if(r.bottom+5>q.top+.5&&r.top-5<q.bottom-.5&&r.right>q.left+.5&&r.left<q.right-.5) why.push('its ring is under '+name(b)+' '+Math.round(q.top)+'..'+Math.round(q.bottom)); } // the ring is 3px, drawn 2px out
  for(let e=a.parentElement;e&&e!==document.body&&e!==document.documentElement;e=e.parentElement){ if(!/(auto|scroll|hidden|clip)/.test(getComputedStyle(e).overflowY)) continue; const q=e.getBoundingClientRect(), T=q.top+e.clientTop, B=T+e.clientHeight; if(r.bottom>B+.75||r.top<T-.75) why.push('cut by '+name(e)+' '+Math.round(T)+'..'+Math.round(B)); }
  if(r.top<-.5||r.bottom>vh+.5||r.left<-.5||r.right>vw+.5) why.push('outside the window');
  const hit=document.elementFromPoint(Math.min(vw-1,Math.max(0,r.left+r.width/2)),Math.min(vh-1,Math.max(0,r.top+r.height/2)));
  if(!hit||!(hit===a||a.contains(hit)||hit.contains(a)||(a.closest('label')&&a.closest('label').contains(hit)))) why.push('covered by '+(hit?name(hit):'nothing'));
  return {ix, label:(a.getAttribute('aria-label')||a.textContent||a.value||a.tagName).replace(/\\s+/g,' ').trim().slice(0,30), top:Math.round(r.top), bottom:Math.round(r.bottom), stuck, bars, freed, why};
})()`;
/** Tab through a surface (then back with Shift+Tab when `back`), measuring every stop. Returns { n, faults, stuck, bars, freed }: how many stops, what was wrong, the most bars seen
 *  stuck at once, how many bars the surface has (marked data-stuck) and how many of them had let go (data-free: they scroll with the content, so nothing sticks over a control). */
async function walk(p, { scope, start = null, back = false, max = 60 }) {
  if (start) await p.eval(`document.querySelector(${JSON.stringify(start)})?.focus({preventScroll:true})`);
  const stops = [], faults = []; let first = null, stuck = 0, bars = 0, freed = 0;
  const look = async (dir) => {
    await p.sleep(40);
    const f = await p.eval(stopJs(scope)); if (f.none) return 'none'; if (f.left) return 'left';
    const key = f.ix; if (dir > 0) { if (first === null) first = key; else if (key === first && stops.length > 1) return 'wrap'; }
    stops.push(f); stuck = Math.max(stuck, f.stuck); bars = Math.max(bars, f.bars); freed = Math.max(freed, f.freed); if (f.why.length) faults.push(`${dir > 0 ? 'Tab' : 'Shift+Tab'} #${stops.length} "${f.label}" ${f.top}..${f.bottom}: ${f.why.join('; ')}`);
    return 'ok';
  };
  for (let i = 0; i < max; i++) { await p.key('Tab', { wait: 0 }); if ((await look(1)) !== 'ok') break; }
  if (back) { const n = stops.length; for (let i = 0; i < n + 1; i++) { await p.key('Tab', { mod: 8, wait: 0 }); if ((await look(-1)) === 'left') break; } }
  return { n: stops.length, faults, stuck, bars, freed };
}
/** A walk that went through a bar: the surface has one, and it is either stuck (and the walk was clear of it) or has let go (and nothing is over any control). Never a walk of nothing. */
const sawABar = (r) => r.bars >= 1 && (r.freed >= r.bars || r.stuck >= 1);
/** A fresh page with a game started through the real draft screen, the clock paused, three districts open and a few crates of our own. */
async function gamePage(b, vp, { cash = 3000 } = {}) {
  const slot = 'rf' + (Date.now() % 1e6), p = await b.open(b.chrome, `${b.base}/?slot=${slot}`, { w: vp.w, h: vp.h, dsf: vp.dsf, mobile: vp.mobile });
  await p.eval(`localStorage.setItem('pc.academyDone.${slot}', 'true')`);
  await until(p, text('/^Play solo/i'), 'the title screen'); await click(p, text('/^Play solo/i'));
  await until(p, `!!document.querySelector('input.dr-in[value="trades"]')`, 'the draft');
  await p.eval(`for (const v of ['trades','pro']) document.querySelector('input.dr-in[value="'+v+'"]').click()`);
  await click(p, text('/^Begin/i')); await until(p, `!!pc.S.game && !!document.querySelector('.stage')`, 'the game');
  await p.eval(`try{pc.S.setPaused(true)}catch(e){}`);
  for (let i = 0; i < 6; i++) { await p.eval(`(()=>{const d=document.querySelector('dialog#dlg'); if(d.open) d.close();})()`); await p.sleep(150); } // the news and the welcome queue their own windows: let them all come and go
  await state(p, cash); return p;
}
const state = (p, cash) => p.eval(`(()=>{const g=pc.S.game,s=g.s; for(const z of [2,3,4,5]) g._openZone(z); s.cash=${cash}; s.zone=5; s.mil.m1=true; s.skills.ops=2;
  s.assets=s.assets.filter(a=>a.cls==='paperclip'); for (const cls of ['pawnWatch','textbooks','radio','gadgets']) { try { s.assets.push(g._mk(s,cls,{zone:5,basis:12,from:'start'})); } catch(e){} }
  pc.S.emit('change'); return s.assets.length})()`).then(() => p.sleep(300));
const closeDlg = (p) => p.eval(`(()=>{const d=document.querySelector('dialog#dlg'); if(d.open) d.close();})()`).then(() => p.sleep(250));
const drawer = async (p, id) => { if (await p.eval(`(()=>{const w=document.querySelector('#drawer'); return !!w && !w.hidden && w.dataset.d==='${id}'})()`)) return; await click(p, `document.querySelector('[data-anchor="dock-${id}"]')`); await until(p, `!!document.querySelector('#drawer:not([hidden]) .db')`, `the ${id} drawer`); await p.sleep(250); };
const closeAll = (p) => p.eval(`(()=>{const d=document.querySelector('dialog#dlg'); if(d.open) d.close(); const w=document.querySelector('#drawer'); if(w&&!w.hidden) document.querySelector('[data-act="drawer-close"]')?.click(); const l=document.querySelector('.wvlist'); if(l&&l.open) l.querySelector('summary').click();})()`).then(() => p.sleep(250));
/** What the same walk finds with the mechanism taken out of the page: the sheets' own rules put back as they were, every bar sticky again. */
const NOFIX = `(()=>{const s=document.createElement('style'); s.id='nofix'; s.textContent='dialog{scroll-padding-block:auto !important} html{scroll-padding-block:.5rem !important} .db{scroll-padding:var(--sp-2) !important} .wvlist[open]{scroll-padding:0 !important} [data-stuck][data-free]{position:sticky !important}'; document.head.append(s);})()`;

const SURFACES = {
  async hire(p) { await drawer(p, 'crew'); await click(p, text('/^Hire a manager/i', "document.querySelector('#drawer')")); await until(p, `document.querySelector('dialog#dlg').open && !!document.querySelector('dialog#dlg .cr-foot')`, 'the hire dialog'); return { scope: '#dlg' }; },
  async 'hire, short of cash'(p) { await closeDlg(p); await state(p, 300); await click(p, text('/^Hire a manager/i', "document.querySelector('#drawer')")); await until(p, `document.querySelector('dialog#dlg').open`, 'the hire dialog'); await click(p, `document.querySelector('dialog#dlg [data-act="crew-hkind"][data-k="broker"]')`); await until(p, `!!document.querySelector('dialog#dlg .cr-why')`, 'the line that says it cannot be afforded'); return { scope: '#dlg' }; },
  async 'stock, crates ticked'(p) { await closeAll(p); await state(p, 3000); await drawer(p, 'stock'); await until(p, `[...document.querySelectorAll('#drawer input[type=checkbox]')].filter(c=>c.getClientRects().length).length>=2`, 'crates to tick'); await p.eval(`[...document.querySelectorAll('#drawer input[type=checkbox]')].filter(c=>c.getClientRects().length).slice(0,3).forEach(c=>c.click())`); await until(p, `!!document.querySelector('#drawer .stk-selbar')`, 'the selection bar'); return { scope: '#drawer', start: '#dh-title', back: true }; },
  async 'travel, a ship row'(p) { await click(p, `document.querySelector('#drawer [data-act="stock-ship"]')`); await until(p, `!!document.querySelector('#drawer [data-act="travel-tab"]')`, 'the Travel drawer'); await click(p, `document.querySelector('#drawer [data-act="travel-tab"][data-tab="freight"]')`); await until(p, `!!document.querySelector('#drawer .tv-shiprow')`, 'the ship row'); return { scope: '#drawer', start: '#dh-title', back: true }; },
  async quests(p) { await closeAll(p); await drawer(p, 'quests'); await until(p, `!!document.querySelector('#drawer .qs-nav')`, 'the jump bar'); return { scope: '#drawer', start: '#dh-title', back: true }; },
  async 'the world list'(p) { await closeAll(p); await click(p, `document.querySelector('.wvlist > summary')`); await until(p, `document.querySelector('.wvlist').open && document.querySelectorAll('.wvlist .wvul button').length>=3`, 'the list'); return { scope: '.wvlist', start: '.wvlist > summary', back: true }; },
};

test('the real keyboard: every stop of the hire dialog, the Stock bar, the Ship row, the Quests bar and the world list is clear of the sticky bars, at four window sizes, forward and back', { skip: !BROWSER, timeout: 1_200_000 }, async () => {
  const b = await browser(), faults = [], seen = [];
  for (const vp of VIEWPORTS) {
    const p = await gamePage(b, vp);
    try {
      for (const [name, open] of Object.entries(SURFACES)) {
        const o = await open(p), r = await walk(p, o);
        seen.push(`${vp.name} ${name}: ${r.n} stops${r.stuck ? ', a bar stuck' : r.freed ? ', the bar scrolls with the content' : ''}`);
        assert.ok(r.n >= 3, `${vp.name} ${name}: the walk went through ${r.n} stops`);
        for (const f of r.faults) faults.push(`${vp.name} ${name} | ${f}`);
        if (!sawABar(r)) faults.push(`${vp.name} ${name} | the walk met no sticky bar (${r.bars} marked, ${r.stuck} stuck, ${r.freed} let go): else it walks nothing`);
      }
    } finally { await p.close(); }
  }
  assert.deepEqual(faults, [], `every control the keyboard reaches is in sight, clear of the bars:\n${faults.join('\n')}\n${seen.join('\n')}`);
});

test('the real keyboard: every stop of the Background draft, forward and back, is clear of its sticky actions bar, at four window sizes', { skip: !BROWSER, timeout: 600_000 }, async () => {
  const b = await browser(), faults = [];
  for (const vp of VIEWPORTS) {
    const slot = 'rd' + (Date.now() % 1e6), p = await b.open(b.chrome, `${b.base}/?slot=${slot}`, { w: vp.w, h: vp.h, dsf: vp.dsf, mobile: vp.mobile });
    try {
      await until(p, text('/^Play solo/i'), 'the title screen'); await click(p, text('/^Play solo/i')); await until(p, `!!document.querySelector('.dr-actions')`, 'the draft'); await p.sleep(300);
      // Begin with nothing picked puts a notice in the bar and the bar grows a line: the draft must measure its bar again after that repaint (fit() in paint), or every stop near the foot is left under it
      const before = await p.eval(`document.querySelector('.dr-actions').offsetHeight`);
      await click(p, `document.querySelector('#dr-begin')`); await until(p, `!!document.querySelector('.dr-notice')`, 'the notice that makes the bar a line taller'); await p.sleep(200);
      const grew = await p.eval(`document.querySelector('.dr-actions').offsetHeight`);
      assert.ok(grew > before, `${vp.name}: the notice made the actions bar taller (${before}px, then ${grew}px): the walk below is a walk under the taller bar`);
      const r = await walk(p, { scope: 'html', start: '.dr-head h1', back: true });
      assert.ok(r.n >= 14, `${vp.name}: the draft walk visited ${r.n} stops`);
      if (!sawABar(r)) faults.push(`${vp.name} draft | the walk met no actions bar (${r.bars} marked, ${r.stuck} stuck, ${r.freed} let go): else it walks nothing`);
      for (const f of r.faults) faults.push(`${vp.name} draft | ${f}`);
    } finally { await p.close(); }
  }
  assert.deepEqual(faults, [], `every stop of the draft is above the actions bar:\n${faults.join('\n')}`);
});

test('the real keyboard: a drawer is measured again when the window changes size (the shell\'s observer), so a bar that wraps differently is still cleared', { skip: !BROWSER, timeout: 600_000 }, async () => {
  const b = await browser(), faults = [], seen = [];
  // the Stock selection bar is a line at 1024x768 and wraps to several at 360x640: a walk at the new size under the padding the old size measured would leave stops under it
  for (const [from, to] of [[ALL[0], ALL[2]], [ALL[1], ALL[0]]]) {
    const p = await gamePage(b, from);
    try {
      const o = await SURFACES['stock, crates ticked'](p), first = await walk(p, o);
      assert.ok(first.n >= 3, `${from.name}: the first walk went through ${first.n} stops`);
      for (const f of first.faults) faults.push(`${from.name} | ${f}`);
      await p.send('Emulation.setDeviceMetricsOverride', { width: to.w, height: to.h, deviceScaleFactor: to.dsf, mobile: to.mobile }); await p.sleep(900);
      const reach = await p.eval(`(()=>{ const bar=document.querySelector('#drawer .stk-selbar'), db=document.querySelector('#drawer .db'); return { bar: bar ? bar.offsetHeight : 0, stuckT: parseFloat(db.style.getPropertyValue('--stuck-t')) || 0, free: !!bar && bar.hasAttribute('data-free') } })()`);
      seen.push(`${from.name} -> ${to.name}: bar ${reach.bar}px, --stuck-t ${reach.stuckT}px${reach.free ? ', let go' : ''}`);
      assert.ok(reach.free || Math.abs(reach.stuckT - reach.bar) <= 24, `${to.name}: after the window changed the drawer's padding follows the bar (${JSON.stringify(reach)})`);
      const second = await walk(p, o);
      assert.ok(second.n >= 3, `${to.name}: the walk after the resize went through ${second.n} stops`);
      for (const f of second.faults) faults.push(`${from.name} -> ${to.name} | ${f}`);
    } finally { await p.close(); }
  }
  assert.deepEqual(faults, [], `the keyboard clears the bar at the new size too:\n${faults.join('\n')}\n${seen.join('\n')}`);
});

test('the same walks fail with the mechanism taken out of the page (so the check above can fail): the hire dialog at 844x390, the draft at 844x390, the Stock bar at 360x640, the world list at 844x390', { skip: !BROWSER, timeout: 600_000 }, async () => {
  const b = await browser(), narrow = (n) => ALL.find((v) => v.name === n);
  const hit = {};
  { const vp = narrow('844x390@3'), p = await gamePage(b, vp); try { await p.eval(NOFIX); let o = await SURFACES.hire(p); hit.hire = (await walk(p, o)).faults.length; await closeAll(p); o = await SURFACES['the world list'](p); hit.list = (await walk(p, o)).faults.length; } finally { await p.close(); } }
  { const vp = narrow('360x640@3'), p = await gamePage(b, vp); try { await p.eval(NOFIX); const o = await SURFACES['stock, crates ticked'](p); hit.stock = (await walk(p, o)).faults.length; } finally { await p.close(); } }
  { const vp = narrow('844x390@3'), slot = 'rn' + (Date.now() % 1e6), p = await b.open(b.chrome, `${b.base}/?slot=${slot}`, { w: vp.w, h: vp.h, dsf: vp.dsf, mobile: vp.mobile });
    try { await until(p, text('/^Play solo/i'), 'the title screen'); await click(p, text('/^Play solo/i')); await until(p, `!!document.querySelector('.dr-actions')`, 'the draft'); await p.eval(NOFIX); await p.sleep(300); hit.draft = (await walk(p, { scope: 'html', start: '.dr-head h1', back: true })).faults.length; } finally { await p.close(); } }
  for (const [what, n] of Object.entries(hit)) assert.ok(n > 0, `${what}: with the scroll-padding and the let-go rule put back as they were, the walk finds ${n} stops under a bar (the fault that was there)`);
});
