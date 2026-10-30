// The presentation layer of the panels: the count-up helper, the result's verdict stamp, and the rules that keep the new motion honest (reduced motion, one card system).
// Nothing here touches the game: it reads the markup builders and the stylesheets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countUp } from '../js/ui/polish.js';
import * as UI from '../js/ui/deal.js';
import * as H from '../js/play/haggle.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fake = (n, text, extra = {}) => ({ textContent: text, isConnected: true, dataset: { count: String(n), fmt: 'int', ...extra } });
const rootOf = (...els) => ({ querySelectorAll: () => els });

test('countUp: under reduced motion nothing is touched, so the number is the one in the markup', () => {
  const el = fake(96, '+96 XP', { pre: '+', post: ' XP' });
  assert.equal(countUp(rootOf(el), { reduced: true }), 0);
  assert.equal(el.textContent, '+96 XP');
});

test('countUp: with motion it starts from zero, ends on exactly the text the markup carried, and leaves a number that is no longer on the page alone', async () => {
  globalThis.requestAnimationFrame = (f) => setTimeout(f, 4);
  const el = fake(96, '+96 XP', { pre: '+', post: ' XP' }), gone = fake(5, '5'), bad = fake('x', 'keep');
  gone.isConnected = false;
  assert.equal(countUp(rootOf(el, gone, bad), { ms: 40, delay: 0 }), 2, 'a number that cannot be read is skipped');
  assert.equal(el.textContent, '+0 XP', 'it begins at zero, in the same words');
  await sleep(160);
  assert.equal(el.textContent, '+96 XP', 'and ends on the markup\'s own text');
  assert.equal(bad.textContent, 'keep');
  delete globalThis.requestAnimationFrame;
  assert.equal(countUp(rootOf(fake(1, '1'))), 0, 'no frame callback (a test, a print): nothing happens');
  assert.equal(countUp(null), 0); assert.equal(countUp({}), 0);
});

const result = (n, tone = 'good') => ({ plan: { kind: 'sell' }, summary: { tone, title: 'Sold', headline: 'Sold it.', lines: [], numbers: { unit: 'sale price', better: 'high', quick: 100, expert: 120, you: 100, ...n }, reasons: [], reveal: null, xp: 60, streak: 2, lesson: { concept: 'anchoring', text: 'Anchor first.' } } });

test('the result says where you stand against Quick, in words, and its numbers can count up', () => {
  assert.match(UI.resultHTML(result({ you: 130 })), /class="rver win">Better than Quick/);
  assert.match(UI.resultHTML(result({ you: 80 })), /class="rver lose">Quick would have done better/);
  assert.match(UI.resultHTML(result({ you: 100 })), /class="rver even">Same as Quick/);
  const low = UI.resultHTML({ ...result({ you: 80, better: 'low', quick: 100, expert: 70 }) });
  assert.match(low, /class="rver win">Better than Quick/, 'when lower is better, lower wins');
  const walked = UI.resultHTML(result({ you: null }));
  assert.ok(!/rver/.test(walked), 'a walk-away has nothing to compare');
  assert.match(walked, /walks away/);
  const h = UI.resultHTML(result({ you: 130 }));
  assert.match(h, /data-count="130" data-fmt="money"/); assert.match(h, /data-count="60" data-fmt="int" data-pre="\+" data-post=" XP">\+60 XP</, 'the text is whole before it counts');
  assert.match(h, /class="vs you/); assert.match(h, /<blockquote class="lesson">/);
});

test('every reveal that waits on a delay is also taken off by name under reduced motion', () => {
  const css = read('css/ui-deal.css');
  const delayed = [...css.matchAll(/([^{}]+)\{[^{}]*animation:[^;}]*\s\.\d+s\s\.?\d*s?[^;}]*;/g)].length + [...css.matchAll(/animation-delay/g)].length;
  assert.ok(delayed >= 3, 'the result is staged with delays');
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  for (const sel of ['.rver', '.vbar i', '.xp', '.lesson', '.rhead', '.rlines', 'dialog.deal']) assert.ok(reduced.includes(sel), `${sel} is switched off under reduced motion`);
  assert.match(reduced, /data-motion="reduce"/);
  const ac = read('css/ui-academy.css');
  for (const sel of ['.ac-sheet-in', '.ac-rw .chip']) assert.ok(ac.slice(ac.indexOf('@media (prefers-reduced-motion: reduce)')).includes(sel), sel);
});

test('one card system: the kit heads the first panel sheet (no @import, so no second request), and it draws only from tokens and states its motion in one place', () => {
  const stock = read('css/ui-stock.css'), END = '/* ==== end of the shared card kit';
  assert.ok(stock.startsWith('/* ==== the shared card kit'), 'the kit comes before every panel rule');
  assert.ok(stock.includes(END), 'the kit has an end marker');
  const kit = stock.slice(0, stock.indexOf(END));
  for (const f of ['stock', 'market', 'crew', 'bank', 'travel', 'codex', 'quests', 'deal', 'academy', 'draft']) assert.ok(!/@import/.test(read(`css/ui-${f}.css`).replace(/\/\*[\s\S]*?\*\//g, '')), `ui-${f}.css fetches nothing else: an @import waits for the sheet that holds it`);
  const html = read('index.html');
  assert.ok(html.indexOf('css/ui-stock.css') < html.indexOf('css/ui-market.css'), 'the sheet that holds the kit is linked before the panels that lean on it');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(kit), 'no hard-coded hex colours');
  const base = read('css/styles.css');
  const defined = new Set([...base.matchAll(/--([\w-]+):/g)].map((m) => m[1]));
  for (const [, name] of kit.matchAll(/var\(--([\w-]+)/g)) assert.ok(defined.has(name), `--${name} is a token`);
  for (const cls of ['.stk-crate', '.mkt-lead', '.cr-card', '.bk-prod', '.tv-d', '.cx-card', '.qs-q']) assert.ok(kit.includes(cls), `${cls} wears the shared surface`);
  assert.match(kit, /\.db > \* \{ min-width: 0; \}/, 'a wide child can never make a drawer wider than the screen');
  assert.match(kit, /prefers-reduced-motion: reduce/);
});

test('the Deal Room sheet keeps the structure the screen reader and the keyboard rely on after the staging', () => {
  const m = { ...result({ you: 100 }), kind: 'sell', stage: 'result', zone: { name: 'The Scrap Yard', short: 'Scrap Yard', icon: 'S', palette: ['#112233', '#445566'] }, assistLocked: false, assist: false, steps: [], says: [], say: '', cast: { name: 'Wen', icon: 'W', role: 'buyer', hello: 'Hi', style: 'hard' }, plan: { kind: 'sell', asset: { name: 'Clip' }, buyer: { name: 'Wen' } } };
  const h = UI.sheetHTML(m);
  assert.match(h, /<span class="deal-zone">/); assert.match(h, /class="cast-tag">Buyer</); assert.match(h, /class="cast-mood">hard</);
  assert.match(h, /aria-labelledby="ds-title"/); assert.match(h, /data-stage-head/);
});

// ---- the review round: the 'best' marker, a tie, the talk log, the count-up's re-entrancy, a result staged once
const unescapeCss = (t) => t.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
const contentOf = (css, selector) => { const i = css.indexOf(selector + ' {'); assert.ok(i >= 0, selector); const m = /content:\s*"([^"]*)"/.exec(css.slice(i, css.indexOf('}', i))); assert.ok(m, `${selector} has a content string`); return unescapeCss(m[1]); };

test('the best marker prints "best" and nothing a hex escape swallowed', () => {
  const css = read('css/ui-deal.css');
  assert.equal(contentOf(css, '.vs.best dd::after'), '\u00a0\u2713\u00a0best', 'a hex escape takes up to six digits: the letters after it must be kept apart');
  // no generated string in the sheet holds a character from the far planes of Unicode (what a swallowed letter turns into)
  for (const [, raw] of css.matchAll(/content:\s*"([^"]*)"/g)) for (const ch of unescapeCss(raw)) assert.ok(ch.codePointAt(0) < 0x3000, `content "${raw}" holds U+${ch.codePointAt(0).toString(16)}`);
});

test('a row is marked best only when someone is behind it: a three-way tie marks none', () => {
  const rows = (h) => [...h.matchAll(/class="vs (quick|expert|you)( best)?"/g)].map((m) => [m[1], !!m[2]]);
  assert.deepEqual(rows(UI.resultHTML(result({ quick: 100, expert: 100, you: 100 }))), [['quick', false], ['expert', false], ['you', false]]);
  assert.deepEqual(rows(UI.resultHTML(result({ quick: 100, expert: 120, you: 90 }))), [['quick', false], ['expert', true], ['you', false]]);
  assert.deepEqual(rows(UI.resultHTML(result({ quick: 100, expert: 120, you: 120 }))), [['quick', false], ['expert', true], ['you', true]], 'a tie for the top between two rows is still a best');
  assert.deepEqual(rows(UI.resultHTML(result({ quick: 100, expert: 90, you: 80, better: 'low' }))), [['quick', false], ['expert', false], ['you', true]], 'lower is better for a purchase');
  assert.deepEqual(rows(UI.resultHTML(result({ quick: null, expert: null, you: null }))), [['quick', false], ['expert', false], ['you', false]]);
});

test('the talk log is never hidden: on a phone it is a collapsed line across the card, and a long one scrolls inside itself', () => {
  const css = read('css/ui-deal.css');
  assert.ok(!/\.deal-log\s*\{[^}]*display:\s*none/.test(css), 'no width removes the transcript from sight, from the keyboard or from the screen reader');
  assert.match(css.slice(css.indexOf('@media (max-width: 760px)')), /\.deal-log \{ grid-column: 1 \/ -1;/, 'across both columns of the phone card');
  assert.match(css, /\.deal-log\[open\] ol \{ max-height: [\d.]+rem; overflow-y: auto;/);
});

test('countUp leaves a number that is already ticking alone: a second call can never take the half-counted text for the final one', async () => {
  globalThis.requestAnimationFrame = (f) => setTimeout(f, 4);
  const el = fake(96, '+96 XP', { pre: '+', post: ' XP' });
  assert.equal(countUp(rootOf(el), { ms: 200, delay: 0 }), 1);
  await sleep(90);
  assert.equal(countUp(rootOf(el), { ms: 200, delay: 0 }), 0, 'the same node, mid-count: not started again');
  assert.notEqual(el.textContent, '+96 XP', 'it is still counting');
  await sleep(320);
  assert.equal(el.textContent, '+96 XP', 'and it ends on the markup\'s own text');
  assert.equal(countUp(rootOf(el), { ms: 20, delay: 0 }), 1, 'a finished number can be counted again by a later sheet');
  await sleep(120);
  assert.equal(el.textContent, '+96 XP');
  delete globalThis.requestAnimationFrame;
});

test('a result that has been staged once is drawn at rest: the builder marks it and the sheet takes every staged animation off it', () => {
  assert.ok(!/revealed/.test(UI.resultHTML(result({ you: 130 }))), 'the first paint is staged');
  const again = UI.resultHTML({ ...result({ you: 130 }), revealed: true });
  assert.match(again, /class="deal-result good revealed"/);
  const css = read('css/ui-deal.css'), rule = css.slice(css.indexOf('.deal-result.revealed'));
  for (const sel of ['.rtitle', '.rhead', '.rlines', '.rver', '.vbar i', '.xp', '.lesson']) assert.ok(rule.slice(0, rule.indexOf('}')).includes(sel), `${sel} is at rest on a repaint`);
  assert.match(rule.slice(0, rule.indexOf('}')), /animation: none/);
  const js = read('js/ui/deal.js');
  assert.match(js, /if \(!ses\.revealed\) \{ ses\.revealed = true; countUp/, 'the count-up starts once per result');
});

test('the Deal Room keeps the scoreboard and the buttons in one band along the foot, and the tablet and phone layouts keep the Pitch button and the log reachable', () => {
  const css = read('css/ui-deal.css');
  assert.match(css, /\.deal-dock \{ position: sticky;/);
  assert.match(css, /@media \(min-width: 761px\) and \(max-width: 1100px\) \{[\s\S]*\.angles \{ grid-template-columns: repeat\(5, minmax\(0, 1fr\)\);/, 'five angle cards in one row on a tablet');
  const phone = css.slice(css.indexOf('@media (max-width: 760px)'));
  assert.match(phone, /\.deal-dock \{ display: contents; \}/);
  assert.match(phone, /\.deal-foot \.btn \{[^}]*white-space: nowrap;/, 'a short button label never breaks in two');
  const m = { ...result({ you: 100 }), kind: 'sell', stage: 'read', zone: null, assistLocked: false, assist: false, steps: [], says: [], say: '', cast: { name: 'Wen', icon: 'W', role: 'buyer', hello: 'Hi', style: 'steady' }, plan: { kind: 'sell', asset: { name: 'Clip' }, buyer: { name: 'Wen' }, fair: 5, budget: 6 }, cash: 10, view: null, canQuick: true, first: true, stageDone: false };
  const h = UI.sheetHTML({ ...m, stage: 'result', plan: { kind: 'sell', asset: { name: 'Clip' }, buyer: { name: 'Wen' } } });
  assert.ok(!/deal-dock/.test(h), 'a result has neither a scoreboard nor buttons, so no band');
});

// ---- the concession cards: "lands" is where the step leaves your number, not the step read as a price
const pctVsFair = (price, fair) => `${price >= fair ? '+' : '-'}${Math.abs(Math.round((price / fair - 1) * 100))}% vs fair`;
const cardLine = (h, size) => { const m = h.match(new RegExp(`data-size="${size}"[^>]*>.*?<small class="mv-d">([^<]*)</small>`)); return m && m[1]; };

test('a concession card says where the step lands: what the haggle then shows against fair, for a buyer and a seller, at any price and any opening', () => {
  let checked = 0;
  for (const role of ['buy', 'sell']) for (const fair of [0.46, 4.6, 18.87, 250]) for (const style of ['friendly', 'hard']) for (const level of ['high', 'fair', 'low']) {
    const open = () => H.act(H.create({ role, fair, style, seed: 7 }), { type: 'anchor', level }).state;
    const v = H.view(open());
    if (v.done) continue; // a generous enough opening is taken at once: there is no Close stage left to draw
    const h = UI.closeHTML({ plan: { kind: role }, view: v, stageDone: false });
    for (const size of ['small', 'medium', 'large']) {
      if (!v.actions.some((x) => x.type === 'concede' && x.size === size)) continue;
      const after = H.view(H.act(open(), { type: 'concede', size }).state);
      assert.notEqual(after.yours, v.yours, 'the move moved the number');
      assert.equal(cardLine(h, size), `lands ${pctVsFair(after.yours, fair)}`, `${role} at ${fair}, ${style}, opened ${level}, a ${size} step`);
      assert.ok(Math.abs(UI.concedeTo(v, size) - after.yours) <= 1e-4 * fair, 'the card\'s number is the one the haggle then holds');
      checked++;
    }
  }
  assert.ok(checked >= 60, `enough openings were checked: ${checked}`);
});

test('a concession card never reads a step as a price: no "-96% vs fair" for a small step, whatever the deal', () => {
  for (const role of ['buy', 'sell']) for (const fair of [4.6, 18.87]) {
    const s = H.act(H.create({ role, fair, style: 'hard', seed: 3 }), { type: 'anchor', level: 'fair' }).state;
    assert.ok(!s.done);
    const h = UI.closeHTML({ plan: { kind: role }, view: H.view(s), stageDone: false });
    for (const size of ['small', 'medium', 'large']) {
      const n = Number((cardLine(h, size).match(/([+-]\d+)%/) || [])[1]);
      assert.ok(Math.abs(n) <= 40, `${size} reads ${n}%: the haggle's whole range is 40% either side of fair`);
    }
    assert.ok(!/-9[0-9]% vs fair/.test(h));
  }
});

test('the last step stops at the floor, as the haggle does: concedeTo never goes past it, and says nothing without a number of yours', () => {
  const v = { role: 'sell', fair: 100, yours: 62, floor: 60, steps: { small: 4, medium: 9, large: 16 } };
  assert.equal(UI.concedeTo(v, 'small'), 60, 'a seller stops at the floor');
  assert.equal(UI.concedeTo(v, 'large'), 60);
  const b = { ...v, role: 'buy', yours: 138, floor: 140 };
  assert.equal(UI.concedeTo(b, 'large'), 140, 'a buyer stops at the ceiling');
  assert.equal(UI.concedeTo({ ...v, yours: 80 }, 'medium'), 71);
  assert.equal(UI.concedeTo({ ...b, yours: 90 }, 'medium'), 99);
  assert.equal(UI.concedeTo({ ...v, yours: null }, 'small'), null);
  assert.equal(UI.concedeTo({ ...v, steps: {} }, 'small'), null);
  assert.equal(UI.concedeTo(null, 'small'), null);
  assert.equal(cardLine(UI.closeHTML({ plan: { kind: 'sell' }, view: { ...H.view(H.act(H.create({ role: 'sell', fair: 10, seed: 1 }), { type: 'anchor', level: 'fair' }).state), fair: 0 }, stageDone: false }), 'small'), '', 'no fair price, no comparison');
});

// ---- the foot on a short window
test('a short window (a phone on its side) docks only the buttons: the scoreboard scrolls with the stage, and the rule never overlaps the phone layout', () => {
  const css = read('css/ui-deal.css'), at = css.indexOf('@media (max-height: 520px) and (min-width: 761px)');
  assert.ok(at > 0, 'a rule for short windows that are wider than a phone');
  const block = css.slice(at, css.indexOf('\n}', at));
  assert.match(block, /\.deal-dock \{ display: contents; \}/, 'the board is no longer pinned');
  assert.match(block, /\.deal-foot \{ position: sticky; bottom: 0;[^}]*background: var\(--panel\);/, 'the buttons are, on the panel colour');
  assert.match(block, /dialog\.deal \{[^}]*max-height: calc\(100dvh - \.5rem\)/, 'the sheet takes the height the screen has');
  assert.ok(at > css.indexOf('min-width: 1800px'), 'it follows the big-screen block, so its padding is the one the foot\'s margin matches');
  assert.ok(!/@media \(max-height: 520px\)[^{]*\{[^]*?\.deal-dock \{ position: sticky/.test(block), 'and pins nothing but the foot');
  assert.match(css, /\.deal-dock \{ position: sticky; bottom: -1rem;/, 'a tall window keeps the docked scoreboard');
});
