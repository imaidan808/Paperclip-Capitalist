// The sixth round, UX4: the audition page's sticky bar (dev/sounds.html). Every contents link scrolled its section so that the heading, the blurb and the "Play all" button sat under the sticky bar (160px of a
// 1366x768 window, 302px of a 390x844 phone), the author landed on card tails with no title, the contents list scrolled away with no way back, and the bar could not be folded. This holds, in headless Chrome with
// real mouse clicks (the browser half is skipped without Chrome or with PC_NO_BROWSER=1, as the other browser tests are; the page half below needs none):
//   - after EVERY contents link, at both sizes and with the bar's options open and folded, the section's heading, its blurb and its "Play all" button are fully below the bar, and the offset is the bar's own height;
//   - the bar has a Contents link back to the list, and the options fold with a native button (aria-expanded) that keeps the volume, Mute and Stop in view.
// Run: node --test tests/audio-r6-page.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

// ================================================================================ the page, without a browser
test('UX4: the offset is read from the bar, never a number: scroll-padding-top is calc(var(--bar-h) + 8px) and sounds.js writes --bar-h from the bar\'s own height, again when it resizes', () => {
  const html = src('dev/sounds.html'), js = src('dev/sounds.js');
  assert.match(html, /html \{ scroll-padding-top: calc\(var\(--bar-h, 0px\) \+ 8px\); \}/);
  assert.ok(!/scroll-(margin|padding)-top:\s*\d/.test(html), 'no pixel offset written into the page (it was 160px of a laptop and 302px of a phone)');
  assert.match(js, /setProperty\('--bar-h', Math\.ceil\(bar\.getBoundingClientRect\(\)\.height\) \+ 'px'\)/);
  assert.match(js, /new ResizeObserver\(fit\)\.observe\(bar\)/, 'and it follows the bar when its options fold, its status line wraps or the window narrows');
});
test('UX4: the bar has a way back to the contents and folds its options with a native button; every control it had is still there once', () => {
  const html = src('dev/sounds.html'), bar = html.slice(html.indexOf('<div id="bar">'), html.indexOf('<nav id="toc"'));
  assert.match(bar, /<a id="to-toc" href="#toc">Contents<\/a>/, 'a Contents link in the bar');
  assert.match(bar, /<button id="opts-toggle" type="button" aria-expanded="true" aria-controls="opts">Options<\/button>/, 'a native button, its state in aria-expanded');
  assert.match(bar, /<div class="row" id="opts">/); assert.match(html, /#opts\[hidden\] \{ display: none; \}/, '(.row is display:flex, which would beat the attribute)');
  const inOpts = bar.slice(bar.indexOf('id="opts"'), bar.indexOf('id="meter"')), before = bar.slice(0, bar.indexOf('id="opts"'));
  for (const id of ['vol', 'mute', 'stop', 'reset']) assert.ok(before.includes(`id="${id}"`), `${id} stays in view when the options are folded`);
  for (const id of ['ui', 'game', 'world', 'amb', 'ambvol', 'quiet', 'mono', 'lap']) assert.ok(inOpts.includes(`id="${id}"`), `${id} is in the options`);
  for (const id of ['vol', 'mute', 'ui', 'game', 'world', 'amb', 'ambvol', 'quiet', 'mono', 'lap', 'stop', 'reset', 'state', 'meter', 'db', 'toc', 'app']) assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `#${id} exists once`);
  assert.match(src('dev/sounds.js'), /toggle\.onclick = \(\) => \{ open = !open; apply\(\); \}/);
});

// ================================================================================ the page, in Chrome
const { BROWSER, browser, until, closePage } = await import('./helpers/lessonpage.mjs');
let b = null;
const getBrowser = async () => (b ||= await browser());
test.after(async () => { if (b) await b.close(); });
const SUITE = { skip: !BROWSER, timeout: 900000 };
const SIZES = [{ name: '1366x768', w: 1366, h: 768 }, { name: '390x844', w: 390, h: 844, dsf: 2, mobile: true }];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** After clicking contents link number k with a real mouse: where the section's heading, blurb and first "Play all" button are, against the bar and the window. */
const WHERE = `(()=>{ const sec = document.getElementById(location.hash.slice(1)), h = sec && sec.querySelector('h2'), bar = document.getElementById('bar').getBoundingClientRect(),
  top = (e) => (e ? e.getBoundingClientRect().top : null), r = h && h.getBoundingClientRect(), pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
  return { id: sec && sec.id, h2Top: r && r.top, h2Bottom: r && r.bottom, barBottom: bar.bottom, barHeight: bar.height, pad, blurb: top(sec && sec.querySelector('p')), all: top(sec && sec.querySelector('button.all')), win: innerHeight, scrollY, max: document.documentElement.scrollHeight - innerHeight }; })()`;

async function toContents(p, k) {
  await p.eval(`window.scrollTo(0, 0)`); await sleep(60);
  await p.clickSel(`#toc a:nth-child(${k})`); await sleep(260);
  return p.eval(WHERE);
}
async function ready(p) {
  await until(p, `document.readyState === 'complete' && document.querySelectorAll('#toc a').length > 10`, 'the audition page and its contents');
  return p.eval(`document.querySelectorAll('#toc a').length`);
}
const barState = (p) => p.eval(`(()=>{ const t = document.getElementById('opts-toggle'), o = document.getElementById('opts'), bar = document.getElementById('bar').getBoundingClientRect(); return { expanded: t ? t.getAttribute('aria-expanded') : 'none', hidden: o ? o.hidden : null, shown: o ? o.getBoundingClientRect().height > 0 : null, height: bar.height, pad: parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop), css: getComputedStyle(document.documentElement).getPropertyValue('--bar-h') }; })()`);

test('UX4: after every contents link a section\'s heading, blurb and Play all button are fully below the bar, with the options open and folded, at 1366x768 and 390x844', SUITE, async () => {
  const br = await getBrowser();
  for (const sz of SIZES) {
    const p = await br.open(br.chrome, `${br.base}/dev/sounds.html?check=1`, { w: sz.w, h: sz.h, dsf: sz.dsf || 1, mobile: !!sz.mobile });
    try {
      const n = await ready(p);
      assert.ok(n >= 17, `${sz.name}: the contents list has its links (${n})`);
      const seen = {};
      for (const pass of [0, 1]) { // the page's default, then the other state of the options
        const st = await barState(p);
        for (let k = 1; k <= n; k++) {
          const w = await toContents(p, k);
          const why = `${sz.name}, options ${st.expanded === 'true' ? 'open' : st.expanded === 'false' ? 'folded' : 'with no fold'}, link ${k} (${w.id}): heading at ${w.h2Top?.toFixed(1)}..${w.h2Bottom?.toFixed(1)}, the bar ends at ${w.barBottom.toFixed(1)}`;
          assert.ok(w.h2Top >= w.barBottom - 0.5, `the heading is below the bar: ${why}`);
          assert.ok(w.h2Bottom <= w.win, `and inside the window: ${why}`);
          if (w.blurb != null) assert.ok(w.blurb >= w.barBottom - 0.5, `the blurb is below the bar: ${why}`);
          if (w.all != null) assert.ok(w.all >= w.barBottom - 0.5, `the Play all button is below the bar: ${why}`);
          assert.ok(Math.abs(w.pad - (Math.ceil(w.barHeight) + 8)) < 1, `the offset is the bar's own height (${w.barHeight}) plus 8: ${w.pad}`);
          if (w.scrollY < w.max - 2) assert.ok(w.h2Top - w.barBottom < 20, `and the heading sits just under the bar, not lost further down: ${why}`); // (the last sections cannot scroll that far: the page ends)
          (seen[st.expanded] ||= []).push(Math.round(w.barHeight));
        }
        if (pass === 0) { await p.eval(`window.scrollTo(0, 0)`); await p.clickSel('#opts-toggle'); await sleep(300); const after = await barState(p); assert.notEqual(after.expanded, st.expanded, 'the button folds and unfolds'); }
      }
      const heights = Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, [...new Set(v)]]));
      assert.ok(heights.true && heights.false && Math.max(...heights.true) > Math.max(...heights.false), `${sz.name}: folding the options makes the bar smaller (${JSON.stringify(heights)})`);
    } finally { await closePage(p); }
  }
});
test('UX4: a phone starts with the options folded; the toggle is a native button (Enter folds it); the bar\'s Contents link brings the list back from anywhere on the page, below the bar', SUITE, async () => {
  const br = await getBrowser();
  const phone = await br.open(br.chrome, `${br.base}/dev/sounds.html?check=1`, { w: 390, h: 844, dsf: 2, mobile: true });
  try {
    const n = await ready(phone);
    const st = await barState(phone);
    assert.deepEqual([st.expanded, st.hidden, st.shown], ['false', true, false], 'folded at 390px');
    assert.ok(st.height < 0.25 * 844, `and the bar is about a fifth of the phone's window, not a third or more (${st.height}px of 844; it was 302px, and 351px with the options open)`);
    assert.equal(st.css, `${Math.ceil(st.height)}px`, '--bar-h is the bar\'s own height'); assert.ok(Math.abs(st.pad - (Math.ceil(st.height) + 8)) < 1);
    await phone.eval(`document.getElementById('opts-toggle').focus()`); await phone.key('Enter', { wait: 250 }); await sleep(250);
    const open = await barState(phone);
    assert.deepEqual([open.expanded, open.hidden, open.shown], ['true', false, true], 'Enter on the focused button unfolds it'); assert.ok(open.height > st.height + 80, `the bar grew (${st.height} to ${open.height}) and the offset with it (${open.pad})`); assert.ok(Math.abs(open.pad - (Math.ceil(open.height) + 8)) < 1);
    // the controls kept their values while folded (the page reads them by id)
    await phone.eval(`document.getElementById('quiet').checked = true; document.getElementById('opts-toggle').click()`); await sleep(250);
    assert.equal(await phone.eval(`document.getElementById('quiet').checked`), true, 'a folded box is still a box with its value');
    // back to the list from the end of the page
    await toContents(phone, n);
    await phone.clickSel('#to-toc'); await sleep(300);
    const where = await phone.eval(`(()=>{ const t = document.getElementById('toc').getBoundingClientRect(), a = document.querySelector('#toc a').getBoundingClientRect(), bar = document.getElementById('bar').getBoundingClientRect(); return { tocTop: t.top, firstLink: a.top, barBottom: bar.bottom, hash: location.hash, scrollY }; })()`);
    assert.equal(where.hash, '#toc'); assert.ok(where.tocTop >= where.barBottom - 0.5 && where.firstLink >= where.barBottom - 0.5, `the contents list is below the bar after the bar's Contents link: ${JSON.stringify(where)}`);
  } finally { await closePage(phone); }
});
