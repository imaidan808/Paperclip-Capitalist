// The presentation layer of the panels: the count-up helper, the result's verdict stamp, and the rules that keep the new motion honest (reduced motion, one card system).
// Nothing here touches the game: it reads the markup builders and the stylesheets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countUp } from '../js/ui/polish.js';
import * as UI from '../js/ui/deal.js';

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

test('one card system: the panels import the kit first, and the kit draws only from tokens and states its motion in one place', () => {
  const stock = read('css/ui-stock.css'), kit = read('css/ui-kit.css');
  assert.ok(stock.startsWith('@import url("ui-kit.css");'), 'the kit comes before every panel sheet');
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
