// The closeout of the polish branch: the Deal Room's closed sheet, the repair dial's Stop in view, the Academy's coach card (the clock anchor, the lesson's own HUD, the card standing
// where it covers nothing it must not) and the focus rings of the skip link and the world canvas. Presentation only: nothing here reads or changes the game's numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeCtx } from './helpers/ctx.mjs';
import { hudHTML, playerCard, tickerHTML } from '../js/ui/hud.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('A4: the clock anchor is the play button alone, so a lesson step that says "press the clock" is not done by Help, the speed list or the menu', () => {
  const html = hudHTML(fakeCtx());
  const anchors = [...html.matchAll(/<(\w+)[^>]*data-anchor="hud-clock"[^>]*>/g)];
  assert.equal(anchors.length, 1, 'one element carries it');
  assert.match(anchors[0][0], /^<button[^>]*data-act="pause"/, 'and it is the pause and play button');
  assert.doesNotMatch(html, /<div class="ctl"[^>]*data-anchor/, 'the cluster round the clock is no longer the anchor');
  assert.match(html, /data-act="help"[^>]*>\?<\/button>/); assert.doesNotMatch(html.match(/<button[^>]*data-act="help"[^>]*>/)[0], /data-anchor/);
});

test('A5: a lesson shows no level, XP or skill point of its own, and its pretend level-up is not news; a real run shows both', () => {
  const ctx = fakeCtx(), g = ctx.g();
  g.s.xp = 120; g.s.points = 1;
  g.s.news = [{ h: 3, level: 2, text: 'Level 2. You earned a skill point.' }, { h: 2, level: 'info', text: 'A buyer walked in.' }];
  const real = playerCard(ctx), realNews = tickerHTML(ctx);
  assert.match(real, /XP/); assert.match(real, /point to spend/); assert.match(real, /class="lv"/); assert.match(realNews, /Level 2\./, 'in a real run the level-up is the news line');
  g.sandbox = { id: 'm01', warnings: [] }; // what buildSandboxGame sets: only a lesson's game has one
  const lesson = playerCard(ctx), lessonNews = tickerHTML(ctx);
  assert.doesNotMatch(lesson, /XP|point to spend|class="lv"|class="pip"/, 'no XP line, no points, no level badge: ' + lesson);
  assert.match(lesson, /Practice, nothing here is saved/); assert.match(lesson, /data-anchor="player-card"/, 'the card is still the anchor a step can name');
  assert.doesNotMatch(lessonNews, /Level 2/); assert.match(lessonNews, /A buyer walked in\./, 'the next line is shown instead');
  assert.match(lessonNews, /data-i="1"/, 'and its index is its place in the whole list, so an alert opens the right one');
  g.s.news = [{ h: 3, level: 2, text: 'Level 2. You earned a skill point.' }];
  assert.equal(tickerHTML(ctx), '', 'a lesson with only the pretend level-up has no news');
});

test('the Deal Room: the focused Stop is brought into view, and the short window keeps the foot clear of the ring', () => {
  const src = read('js/ui/deal.js');
  // DESIGN CHANGE on purpose (tests/finish-flow.test.mjs): the one scrollIntoView for the Stop that was focused on arrival became a scroll after EVERY paint, for wherever the cursor is (the
  // next probe, Bid after a bid, the Stop of the second repair step, a stage's head), measured against the real foot instead of a guessed scroll-padding.
  assert.match(src, /const reveal = \(d\) => \{ const a = doc\.activeElement; if \(a && a !== d && d\.contains\(a\)\) keepInView\(d, a, \{ sticky: STICKY \}\); \};/, 'a control the cursor is on is scrolled just into view (never the foot, which is sticky)');
  assert.match(src, /else keepFocus\(d\);\n    reveal\(d\);/, 'after the cursor has been put back, whichever way it went');
  const css = read('css/ui-deal.css'), short = css.slice(css.indexOf('@media (max-height: 520px) and (min-width: 761px)'));
  const pad = short.match(/scroll-padding-bottom: ([\d.]+)rem/);
  assert.ok(pad && +pad[1] * 16 >= 55.4 + 5, `the room kept under a scrolled-to control (${pad && +pad[1] * 16}px) is the foot (55.4px at 844 x 390) and the ring's 5px`);
});

test('the skip link is placed so that its ring is not cut by the window, and the scrims leave the canvas ring alone', () => {
  const base = read('css/styles.css'), skip = base.match(/\.skip \{[^}]*top: (\d+)px/), focus = base.match(/\.skip:focus \{ left: (\d+)px; \}/);
  assert.ok(skip && focus, 'the link has a top and a left on focus'); assert.ok(+skip[1] >= 5 && +focus[1] >= 5, 'each is at least the ring\'s reach (3px line, 2px out)');
  const shell = read('css/shell.css');
  assert.match(shell, /\.stage:has\(\.worldcv:focus-visible\)::before \{ top: 6px; \}/); assert.match(shell, /\.stage:has\(\.worldcv:focus-visible\)::after \{ bottom: 6px; \}/);
  assert.match(shell, /\.worldcv \{[^}]*outline-offset: -4px/, 'the ring is drawn 4px inside the canvas, 3px wide: rows 1 to 4 from the edge, under the 6px the scrims leave');
});

test('setHTML leaves a child marked data-keep where it is, so a layer put into the dialog survives a repaint of its markup', async () => {
  const { setHTML } = await import('../js/ui/common.js');
  globalThis.document = { activeElement: null };
  const keep = { hasAttribute: (k) => k === 'data-keep' }, other = { hasAttribute: () => false };
  const el = { _html: '', children: [keep, other], contains: () => false, appendChild(c) { this.children.push(c); }, querySelector: () => null };
  Object.defineProperty(el, 'innerHTML', { set(v) { this.children = []; this.written = v; }, get() { return this.written; } });
  assert.equal(setHTML(el, '<p>new</p>'), true);
  assert.equal(el.written, '<p>new</p>'); assert.deepEqual(el.children, [keep], 'the marked child is back, the rest is the new markup\'s');
  delete globalThis.document;
});

test('the Academy card: the layer is marked to be kept, the runner keeps clear of what the keyboard is on, and follows into any open window', () => {
  const src = read('js/ui/academy.js');
  assert.match(src, /layer\.dataset\.keep = ''/);
  // DESIGN CHANGE on purpose (tests/finish-flow.test.mjs): the card follows into ANY open window, not only the Deal Room and a dialog that holds its anchor, so a lesson's hint is never under a modal
  assert.match(src, /const hostFor = \(\) => \(dlg\.el\.open \? dlg\.el : ctx\.el\.overlay\)/);
  assert.match(src, /host === dlg\.el && !inDialog\(found\) \? null : found/, 'a step whose thing is not in the sheet gets no ring there');
  assert.match(src, /document\.addEventListener\('focusin', onFocus\)/); assert.match(src, /document\.removeEventListener\('focusin', onFocus\)/, 'and lets the listener go with the lesson');
  assert.match(src, /compact: 'compact', min: 'compact min'/, 'and where no place is clear of it, the card shrinks (to its words, then to its head and buttons, then to its head and two buttons: tests/finish-repair.test.mjs)'); assert.match(src, /for \(const t of \['slim', 'compact', 'min'\]\)/); assert.match(read('css/ui-academy.css'), /\.ac-coach\.compact :is\(\.ac-say, \.ac-hint, \.ac-look, \.ac-lost\) \{ display: none; \}/);
  assert.match(src, /add\(f, 1000, 7, true\)/, 'the focused control outweighs everything else together, with room for its ring');
});

// ---------------------------------------------------------------- the dusk draw on a CPU-drawn canvas
/** OffscreenCanvas stand-ins whose context records every drawImage with the alpha and composite operation in force; `main` is the same for the window's own context. */
function recording() {
  const rec = () => { const o = { draws: [], ga: 1, op: 'source-over' }; return { o, g: new Proxy(o, { get(t, k) { if (k === 'globalAlpha') return t.ga; if (k === 'globalCompositeOperation') return t.op; if (k === 'drawImage') return (img) => { t.draws.push({ img, ga: t.ga, op: t.op }); }; if (typeof k === 'symbol') return undefined; return () => ({ addColorStop() {} }); }, set(t, k, v) { if (k === 'globalAlpha') t.ga = v; else if (k === 'globalCompositeOperation') t.op = v; return true; } }) }; };
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; const r = rec(); this.log = r.o; this.g = r.g; } getContext() { return this.g; } };
  return rec();
}
test('the shafts are baked into the crossfade: a step of their strength makes it again once, a morning with no night left has them too, rain and reduced motion have none', async () => {
  const main = recording(), { Lighting } = await import('../js/world/lighting.js'), lit = new Lighting(); // perFrame is Infinity: everything a frame needs is made at once
  const frame = (o) => { main.o.draws.length = 0; lit.ambient(main.g, { W: 800, H: 520, dpr: 2, cv: { width: 1600, height: 1040 }, night: 0, dusk: 0, lite: false, t: 0, env: { crunch: false }, reduced: () => false, ...o }); return main.o.draws.slice(); };
  let s = frame({ night: 0.43, dusk: 0.91 }); assert.equal(s.length, 1, 'a dusk is one stamp: no shafts of their own, and no additive stamp in the frame');
  assert.ok(s.every((d) => d.op === 'source-over'), 'and that one is a plain stamp');
  const mix = lit.big.mix, d1 = mix.log.draws.slice(); assert.deepEqual(d1.map((d) => d.op), ['source-over', 'source-over', 'lighter'], 'the mix is the day, the night and, additively, the shafts');
  assert.ok(Math.abs(d1[2].ga - (7 / 8) * 0.38) < 1e-9, 'at the strength of their step (dusk .91 is seven eighths)');
  frame({ night: 0.43, dusk: 0.93 }); assert.equal(mix.log.draws.length, 3, 'a hair of change is in the same step: nothing made again');
  frame({ night: 0.43, dusk: 1 }); assert.equal(mix.log.draws.length, 6, 'the next step of their strength makes the mix again, once');
  // morning: the night is gone but the sun's low and the shafts remain; the mix is the day and the shafts alone
  const day = new Lighting(); main.o.draws.length = 0; day.ambient(main.g, { W: 800, H: 520, dpr: 2, cv: { width: 1600, height: 1040 }, night: 0, dusk: 0.44, lite: false, t: 0, env: { crunch: false }, reduced: () => false });
  assert.equal(main.o.draws.length, 1); assert.deepEqual(day.big.mix.log.draws.map((d) => d.op), ['source-over', 'lighter'], 'a morning is the day and the shafts');
  // rain and reduced motion: no shafts at all (rain greys the grade, reduced motion stills the light)
  const rain = new Lighting(); rain.ambient(main.g, { W: 800, H: 520, dpr: 2, cv: { width: 1600, height: 1040 }, night: 0.2, dusk: 1, lite: false, t: 0, env: { crunch: true }, reduced: () => false });
  assert.deepEqual(rain.big.mix.log.draws.map((d) => d.op), ['source-over', 'source-over'], 'no shafts in a credit crunch');
  const still = new Lighting(); main.o.draws.length = 0; still.ambient(main.g, { W: 800, H: 520, dpr: 2, cv: { width: 1600, height: 1040 }, night: 0, dusk: 1, lite: false, t: 0, env: { crunch: false }, reduced: () => true });
  assert.equal(still.big.mix, null, 'reduced motion: the day alone, no crossfade, no shafts'); assert.equal(main.o.draws.length, 1);
  delete globalThis.OffscreenCanvas;
});
