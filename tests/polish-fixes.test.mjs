// The fixes after the review of the polish branch: the camera fit and the tags keeping clear of the camera buttons, a CPU-drawn canvas capped at 1.5x, one full-size light layer
// a frame, the sprite cache standing a scaled sprite in for a zoom in motion, the world letting go of its bitmaps, and the rules of the stylesheets and the shell that the
// visual and accessibility reviews asked for. Presentation only: nothing here reads or changes the game's numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../js/engine.js';
import { Lighting } from '../js/world/lighting.js';
import * as sprites from '../js/world/sprites.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const noop = () => {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const grad = { addColorStop: noop };

/** A canvas context that does nothing and answers gradients; `log` counts what a test asks about. */
function fakeCtx(log) {
  const t = { measureText: (s) => ({ width: String(s).length * 6 }), createLinearGradient: () => grad, createRadialGradient: () => grad, getTransform: () => ({}) };
  return new Proxy(t, { get(o, k) { if (k in o) return o[k]; if (typeof k === 'symbol') return undefined; return (...a) => { log.n++; log.by[k] = (log.by[k] || 0) + 1; }; }, set(o, k, v) { o[k] = v; return true; } });
}
/** The page, as the world needs it. `webgl: false` is a browser whose GPU is off: it answers no WebGL context. */
function stubDom(w = 800, h = 520, { webgl = true, dpr = 1 } = {}) {
  const log = { n: 0, by: {}, lost: 0 };
  const gl = { getExtension: () => ({ loseContext: () => { log.lost++; } }) };
  const el = () => ({ style: {}, dataset: {}, width: 0, height: 0, addEventListener: noop, setAttribute: noop, getContext: (kind) => (kind === 'webgl' ? (webgl ? gl : null) : fakeCtx(log)), getBoundingClientRect: () => ({ width: w, height: h, left: 0, top: 0 }), replaceChildren: noop, append: noop });
  globalThis.document = { createElement: el, documentElement: { dataset: {} }, hidden: false };
  globalThis.window = { devicePixelRatio: dpr };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = noop;
  return log;
}
async function makeWorld(size, o = {}) {
  const log = stubDom(...size, o.dom);
  const { World } = await import('../js/world/world.js');
  const g = new Game({ perks: ['connected', 'grad'], handle: 'Test', pid: 'T-1', seed: 3 });
  const session = { game: g, clock: { now: () => g.s.hour, paused: true, speed: 1 } };
  const w = new World({ session, ui: { zone: 1, sel: new Set() }, activate: noop, hover: noop, insets: o.insets });
  w.host = { getBoundingClientRect: () => ({ width: size[0], height: size[1] }) };
  w.resize(); w.sync(); w.placePlayer();
  return { w, log };
}

// ---------------------------------------------------------------- the camera fit and the buttons over it
test('the island is fitted to the part of the window the camera buttons leave free; tags and cards keep clear of them', async () => {
  const plain = (await makeWorld([390, 844])).w;
  const right = (await makeWorld([390, 844], { insets: () => ({ l: 0, r: 56 }) })).w;
  const left = (await makeWorld([1440, 900], { insets: () => ({ l: 99, r: 0 }) })).w;
  const edges = (w) => { const b = w.bounds(); return [w.w2s(b.x0, 0)[0], w.w2s(b.x1, 0)[0]]; };
  plain.fit(false); right.fit(false); left.fit(false);
  let [a, b] = edges(plain); assert.ok(a >= -0.5 && b <= 390.5 && Math.abs(a - (390 - b)) < 1, 'with nothing over it the island is centred, as ever');
  [a, b] = edges(right); assert.ok(a >= -0.5 && b <= 390 - 56 + 0.5, `the buttons on the right: the island ends at ${b.toFixed(1)}, before 334`); assert.ok(Math.abs(a - (334 - b)) < 1, 'and stands in the middle of what is left');
  assert.ok(right.fitZoom() < plain.fitZoom(), 'a narrow window zooms out to make the room');
  [a, b] = edges(left); assert.ok(a >= 99 - 0.5 && b <= 1440 + 0.5, 'the buttons on the left: the island starts right of them');
  // the camera clamp follows the free part: zoomed in, the island can be dragged to each of its ends, and its far edge stops at the free part's edge
  right.cam.z = 1; right.cam.x = -1e6; right.clampCam(); assert.ok(Math.abs(edges(right)[0]) < 0.5, 'dragged to one end, the island\'s edge is at the window\'s');
  right.cam.x = 1e6; right.clampCam(); assert.ok(Math.abs(edges(right)[1] - (390 - 56)) < 0.5, 'dragged to the other, its edge stops at the buttons');
  const out = {}; right.tagSpan(100, 40, out); assert.ok(out.hi <= 390 - 56 - 40 - 4 + 1e-9, 'a name tag stops short of the buttons'); assert.equal(out.lo, 40 + 4);
  left.tagSpan(500, 40, out); assert.equal(out.lo, 99 + 40 + 4, 'and short of buttons on the left');
});

test('a nonsense reading of the buttons is no reading: the fit stays the plain one', async () => {
  const bad = (await makeWorld([390, 844], { insets: () => ({ l: 300, r: 300 }) })).w, plain = (await makeWorld([390, 844])).w;
  bad.fit(false); plain.fit(false); assert.deepEqual([bad.inset.l, bad.inset.r], [0, 0]); assert.equal(bad.cam.z, plain.cam.z);
});

// ---------------------------------------------------------------- a canvas drawn on the CPU
test('a CPU-drawn canvas is capped at 1.5x; the governor takes a quarter off at its fourth tier and gives it back only below its second', async () => {
  const { w } = await makeWorld([800, 520], { dom: { webgl: false, dpr: 2 } });
  assert.equal(w.targetDpr(), 1.5, 'no WebGL means the 2D canvas is on the CPU: 1.5, not 2');
  assert.equal(w.dpr, 1.5);
  w.slow = 4; assert.equal(w.targetDpr(), 1.125);
  w.slow = 2; assert.equal(w.targetDpr(), 1.125, 'a tier or two back up does not reallocate the canvas');
  w.slow = 1; assert.equal(w.targetDpr(), 1.5);
});

test('softwareRaster asks once, only for a hardware-refusing browser, and lets go of its probe context', async () => {
  const log = stubDom(800, 520, { webgl: true });
  const hw = await import('../js/world/gfx.js?hardware');
  assert.equal(hw.softwareRaster(), false); assert.equal(hw.softwareRaster(), false); assert.equal(log.lost, 1, 'one probe, released at once');
  stubDom(800, 520, { webgl: false });
  const sw = await import('../js/world/gfx.js?software');
  assert.equal(sw.softwareRaster(), true);
  delete globalThis.document; const none = await import('../js/world/gfx.js?nodocument'); assert.equal(none.softwareRaster(), false, 'no page, no answer: capable');
});

// ---------------------------------------------------------------- reduced motion is read live, through one media query
test('the world reads reduced motion through one media query, live, and asks again of a different matchMedia', async () => {
  const { w } = await makeWorld([800, 520]);
  let made = 0, matches = false; globalThis.matchMedia = () => { made++; return { get matches() { return matches; } }; };
  for (let i = 0; i < 6; i++) assert.equal(w.reduced(), false); assert.equal(made, 1, 'six asks, one query');
  matches = true; assert.equal(w.reduced(), true, 'and it follows the system');
  globalThis.matchMedia = () => ({ matches: false }); assert.equal(w.reduced(), false, 'a different matchMedia is asked afresh');
  document.documentElement.dataset.motion = 'reduce'; assert.equal(w.reduced(), true, 'the page\'s own setting wins'); delete document.documentElement.dataset.motion;
});

// ---------------------------------------------------------------- one full-size layer a frame
test('the light layers are made one a frame at a dusk, and every frame still stamps something', () => {
  const made = [], main = { imgs: [], calls: {} };
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; made.push(this); this.g = fakeCtx({ n: 0, by: {} }); } getContext() { return this.g; } };
  const mainCtx = new Proxy(main, { get(o, k) { if (k in o) return o[k]; if (typeof k === 'symbol') return undefined; return (...a) => { if (k === 'drawImage') o.imgs.push(a); }; }, set(o, k, v) { o[k] = v; return true; } });
  const lit = new Lighting(); lit.perFrame = 1;
  const big = () => made.filter((c) => c.width === 1600).length;
  const frame = (night, dusk) => { const before = big(); main.imgs.length = 0; lit.ambient(mainCtx, { W: 800, H: 520, dpr: 2, cv: { width: 1600, height: 1040 }, night, dusk, lite: false, t: 0, env: { crunch: false }, reduced: () => false }); return { made: big() - before, stamps: main.imgs.length }; };
  assert.deepEqual(frame(0, 0), { made: 1, stamps: 1 }, 'a daylit frame makes the day\'s layer and stamps it');
  const seq = [frame(0.3, 1), frame(0.3, 1), frame(0.3, 1), frame(0.3, 1)];
  for (const f of seq) { assert.ok(f.made <= 1, 'never two full-size layers in one frame'); assert.ok(f.stamps >= 1, 'and never a frame with no air'); }
  assert.deepEqual(seq[3], { made: 0, stamps: 2 }, 'by the fourth frame the night, the mix and the shafts are all there: the crossfade and the shafts, two stamps');
  assert.equal(frame(0.3, 1).made, 0, 'and nothing is made again while the light holds');
  lit.release(); assert.deepEqual(Object.values(lit.big), [null, null, null, null], 'release lets go of every layer'); assert.equal(lit.size, '');
  const free = new Lighting(); assert.equal(free.perFrame, Infinity, 'a Lighting used alone makes what it needs at once, as it always did');
  delete globalThis.OffscreenCanvas;
});

// ---------------------------------------------------------------- a day and a night allocate nothing new
/** Count every OffscreenCanvas the page makes, with its size; each answers a context that does nothing. */
function countCanvases() {
  const made = [];
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; made.push([w, h]); this.g = fakeCtx({ n: 0, by: {} }); } getContext() { return this.g; } transferToImageBitmap() { return { width: this.width, height: this.height, close() {} }; } };
  return made;
}
test('a whole day and night turn makes no bitmap of the sea: one strip for the life of the world, and no full-window layer beyond the light\'s own four', async () => {
  const made = countCanvases();
  const { w } = await makeWorld([1440, 900], { dom: { dpr: 2 } }); // 1.5 or 2 by what an earlier test taught the module about the GPU: either way a canvas of millions of pixels
  assert.ok(w.dpr >= 1.5 && w.cv.width >= 2160);
  const { dayTargets } = await import('../js/world/lighting.js');
  w.focusZone(1, false); w.light.perFrame = 1;
  const FULL = [w.cv.width, w.cv.height], isFull = (c) => c[0] === FULL[0] && c[1] === FULL[1], strips = () => made.filter((c) => c[0] === 1 && c[1] === 256).length;
  const T = { night: 0, dusk: 0 }, steps = new Set();
  // one frame at every tenth of a virtual hour through 24 hours, the way the clock would walk the light, then the same again: two turns
  const turn = (t0) => { for (let h = 0; h < 24; h += 0.1) { dayTargets(h, 1, false, T); w.night = T.night; w.dusk = T.dusk; steps.add(Math.round(T.night * 24) * 100 + Math.round(T.dusk * 12)); w.t = t0 + h * 800; w.draw(); } };
  turn(0); const afterFirst = made.length;
  assert.ok(steps.size >= 25, `the walk crosses many light steps (${steps.size}): the old build made a full-window bitmap for each`);
  turn(30000);
  const full = made.filter(isFull).length;
  assert.ok(full <= 8, `at most the ground cache and the light's day, night, crossfade and shafts, once each (${full} full-window bitmaps in two turns; the old build made 132)`);
  assert.ok(made.length - afterFirst <= 2, `a second turn makes next to nothing new (${made.length - afterFirst}; the old build made 63)`);
  assert.ok(made.length <= 40, `and the whole of two turns stays a small constant (the sprites and glows of the first look: 31), not a count that grows with the steps of the light (${made.length}; the old build made 157)`);
  assert.equal(strips(), 1, 'the sea is one strip, made once and painted again at each step');
  w.release(); assert.equal(w.seaStrip, undefined, 'release gives the strip back too'); w.draw(); assert.equal(strips(), 2, 'and a world drawn again makes it again, once');
  delete globalThis.OffscreenCanvas;
});

// ---------------------------------------------------------------- the sprite cache in a zoom
const prop = (o = {}) => ({ t: 'bldg', gx: 10, gy: 10, w: 3, d: 2, h: 30, z: 5, bb: [-96, 300, 96, 420], ...o });
function rec(a = 1, calls = []) {
  const t = { getTransform: () => ({ a, b: 0, c: 0, d: a, e: 0, f: 0 }), createLinearGradient: () => grad, createRadialGradient: () => grad, measureText: (s) => ({ width: s.length * 6 }) };
  const ctx = new Proxy(t, { get(o, k) { if (k in o) return o[k]; if (typeof k === 'symbol') return undefined; return (...args) => { calls.push([k, ...args]); }; }, set(o, k, v) { o[k] = v; return true; } });
  return { ctx, calls };
}
const env = (o = {}) => ({ t: 0, night: 0, wind: 1, dim: 0, far: false, lite: false, lights: [], zoff: 0, ...o });
test('a zoom that is moving shows the prop\'s sprite of the zoom before, scaled by the ratio; a far zoom draws the prop directly', async () => {
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return (this.g ||= fakeCtx({ n: 0, by: {} })); } transferToImageBitmap() { return { width: this.width, height: this.height, close() {} }; } };
  sprites.setBuildBudget(Infinity); sprites.clearSprites(); Object.assign(sprites.stats, { builds: 0, stale: 0, direct: 0, deferred: 0 });
  const layer = { body: () => [[[0, 0]]] }, p = prop(), at1 = rec(1);
  sprites.drawSprite(at1.ctx, p, env(), layer); await sleep(120);
  assert.deepEqual(sprites.drawSprite(at1.ctx, p, env(), layer), [[[0, 0]]]); assert.equal(sprites.stats.builds, 1);
  const moving = rec(1.2), polys = sprites.drawSprite(moving.ctx, p, env(), layer);
  assert.deepEqual(polys, [[[0, 0]]], 'the zoom has just changed: the sprite of the zoom before is shown, with its hit shapes');
  const blit = moving.calls.find((c) => c[0] === 'drawImage'); assert.equal(blit.length, 6, 'drawImage(image, x, y, w, h): a scaled copy');
  assert.ok(Math.abs(blit[4] / blit[1].width - 1.2) < 0.01, 'scaled by the ratio of the two zooms'); assert.equal(sprites.stats.builds, 1, 'nothing was built, and nothing was drawn directly'); assert.equal(sprites.stats.stale, 1);
  const direct0 = sprites.stats.direct, far = rec(3), none = sprites.drawSprite(far.ctx, p, env(), layer);
  assert.equal(none, undefined, 'a zoom more than half an octave off is no stand-in: the caller draws the prop directly'); assert.equal(sprites.stats.direct, direct0 + 1);
  delete globalThis.OffscreenCanvas;
});

test('a big sprite is built only once the scale has rested; the sprite budget grows with the pixel density', async () => {
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return (this.g ||= fakeCtx({ n: 0, by: {} })); } transferToImageBitmap() { return { width: this.width, height: this.height, close() {} }; } };
  sprites.setBuildBudget(); sprites.clearSprites(); Object.assign(sprites.stats, { builds: 0, deferred: 0, direct: 0, stale: 0 });
  const layer = { body: () => null }, big = prop({ bb: [0, 0, 2600, 2600], h: 0 }), c = rec(1);
  sprites.drawSprite(c.ctx, big, env(), layer); await sleep(120); // the scale has rested past the zoom's own wait, but not past a big sprite's
  assert.equal(sprites.drawSprite(c.ctx, big, env(), layer), undefined, 'seven million pixels wait for a longer rest'); assert.equal(sprites.stats.builds, 0); assert.ok(sprites.stats.deferred >= 1);
  await sleep(220); assert.notEqual(sprites.drawSprite(c.ctx, big, env(), layer), undefined); assert.equal(sprites.stats.builds, 1, 'and then it is built');
  sprites.setBuildBudget(); sprites.clearSprites();
  sprites.setSpriteBudget(2); const room = rec(1.1); sprites.drawSprite(room.ctx, prop(), env(), layer); // a dense screen holds more; the one thing visible from here is that the cache still works
  sprites.setSpriteBudget(1);
  delete globalThis.OffscreenCanvas;
});

// ---------------------------------------------------------------- the world lets go of its bitmaps
test('detach gives back the ground cache, the sea, the light layers, the label sprites and the scenery sprites', async () => {
  const { w } = await makeWorld([800, 520]);
  w.gc = { c: {}, g: {} }; w.gcValid = true; w.waterGr = { key: 1 }; w.seaStrip = { c: {}, g: {} }; w.seaKey = 1; w.light.big.day = {}; w.light.big.mix = {}; w.light.src.day = {}; w.labels.cache.set('x', { c: {} });
  w.detach();
  assert.equal(w.gc, null); assert.equal(w.waterGr, null); assert.equal(w.seaStrip, undefined, 'the sea\'s strip'); assert.deepEqual(Object.values(w.light.big), [null, null, null, null]); assert.equal(w.light.src.day, null); assert.equal(w.labels.cache.size, 0);
  assert.equal(sprites.stats.pixels, 0, 'the scenery sprites are gone too');
});

// ---------------------------------------------------------------- the stylesheets
test('Crew: a summary tile is never narrower than a six-figure sum, and a phone on its side lays two and two', () => {
  const css = read('css/ui-crew.css');
  assert.match(css, /\.cr-sum \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(6\.2rem, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 480px\), \(max-height: 520px\) \{ \.cr-sum \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \} \}/);
});
test('Academy: a short window tightens the lesson card so its buttons are on the first screen', () => {
  const css = read('css/ui-academy.css'), block = css.slice(css.indexOf('@media (max-height: 520px)'));
  assert.ok(css.includes('@media (max-height: 520px)'), 'a short-window block'); assert.match(block, /\.ac-intro \{[^}]*margin: \.5rem auto/); assert.match(block, /\.ac-pips \{[^}]*flex-wrap: nowrap/); assert.match(block, /\.ac-pip \{[^}]*max-width: 1\.8rem/);
});
test('Dock: a badge is anchored to its icon, not to a button that a tablet\'s dock has stretched', () => {
  const css = read('css/shell.css'), rule = css.match(/\.dk \.bd \{[^}]*\}/)[0];
  assert.match(rule, /left: min\(calc\(50% \+ \.5rem\), calc\(100% - 1\.4rem\)\)/); assert.ok(!/right:/.test(rule), 'no right edge: the button\'s corner is not where the icon is');
});
test('Deal Room: the result\'s Continue rides the foot of the sheet, and every scroller keeps a focused control inside its edge', () => {
  const css = read('css/ui-deal.css');
  assert.match(css, /\.deal-result > \.row:last-child \{ position: sticky; bottom: 0;[^}]*background: var\(--panel2\)/);
  assert.match(css, /dialog\.deal \{[^}]*scroll-padding: \.5rem \.5rem 8rem/, 'a ring is never cut by the dialog\'s edge');
  const shell = read('css/shell.css');
  assert.match(shell, /\.db \{[^}]*scroll-padding: var\(--sp-2\)/, 'nor by a drawer\'s');
  assert.match(shell, /\.db:has\(\.qs-nav\) \{ scroll-padding-top: 4\.4rem; \}/, 'and a drawer\'s sticky bar never stands over the control Shift+Tab lands on');
  assert.match(shell, /\.db:has\(\.tv-shiprow\) \{ scroll-padding-bottom: /);
});
test('Deal Room: the sticky Continue row leaves room for the focus ring at the foot of the sheet, and the phone clears the home indicator', () => {
  const css = read('css/ui-deal.css'), base = read('css/styles.css');
  const ring = base.match(/:focus-visible \{ outline: (\d+)px solid var\(--focus\); outline-offset: (\d+)px; \}/), reach = +ring[1] + +ring[2];
  assert.equal(reach, 5, 'a ring reaches 5px past its control: 3px line, 2px out');
  const row = css.match(/\.deal-result > \.row:last-child \{ position: sticky; bottom: 0; z-index: 1; padding: ([\d.]+)rem 0 ([\d.]+)rem;/);
  assert.ok(row, 'the sticky row keeps its place at the foot of the sheet');
  assert.ok(+row[2] * 16 > reach, `its bottom padding (${+row[2] * 16}px) is more than the ring's reach (${reach}px): the row is flush with the sheet's edge when it sticks, and the sheet clips what passes it`);
  assert.ok(+row[1] * 16 > reach, 'and so is its top padding');
  const phone = css.slice(css.indexOf('@media (max-width: 760px)'));
  assert.match(phone, /\.deal-result > \.row:last-child \{ padding-bottom: calc\(\.5rem \+ env\(safe-area-inset-bottom, 0px\)\); \}/, 'on a phone the row clears the home indicator, as the foot does');
});
test('the shared dialog is never a Tab stop of its own: tabindex -1 from the first start, still focused by script, and the cursor goes back to the opener on close', async () => {
  const on = {}; let focused = null; const opener = { focus: () => { focused = 'opener'; } };
  const d = { open: false, tabIndex: 0, scrollTop: 5, className: '', innerHTML: '', setAttribute() {}, addEventListener: (k, f) => { on[k] = f; }, showModal() { this.open = true; }, close() { this.open = false; on.close?.(); }, querySelector: () => null, focus: () => { focused = 'dialog'; } };
  globalThis.document = { querySelector: (q) => (q === '#dlg' ? d : null), activeElement: opener, documentElement: { dataset: {} } };
  const { initDialog, dlg } = await import('../js/ui/common.js');
  initDialog(); assert.equal(d.tabIndex, -1, 'a scrolling dialog would otherwise get a Tab stop of its own in Chrome, whose ring lies off the screen when the dialog fills it');
  dlg.open('<p>plain</p>', { label: 'x' }); assert.equal(d.open, true); assert.equal(d.tabIndex, -1, 'opening leaves it so'); assert.equal(focused, 'dialog', 'with nothing to focus, the dialog itself takes the cursor: tabindex -1 still allows that');
  d.close(); assert.equal(focused, 'opener', 'and closing hands the cursor back to what opened it');
  const css = read('css/ui-deal.css'); assert.match(css, /dialog\.deal:focus-visible \{ outline-offset: -4px; \}/, 'should script ever give the Deal Room the cursor, its ring is drawn inside the sheet');
  delete globalThis.document;
});
test('toasts: when there is no room beside a side drawer the stack is the newest one, and every toast is still announced', () => {
  const css = read('css/shell.css'), src = read('js/ui/shell.js');
  assert.match(css, /body:has\(\.stage\[data-toasts="tight"\]\) #toasts \.toast:nth-last-child\(n\+2\) \{ display: none; \}/);
  assert.match(src, /dataset\.toasts = 'tight'/); assert.match(src, /14 \* rem/); assert.match(src, /sizer\?\.observe\(el\.stage\)/);
});

// ---------------------------------------------------------------- the shell
test('shell: the dialog\'s close handler and action table do not keep a mount alive; a hidden tab asks for no timer; Escape closes the drawer from a field', () => {
  const src = read('js/ui/shell.js'), mount = src.indexOf('export function mountGame');
  assert.ok(src.indexOf('function closeOnClick') > -1 && src.indexOf('function closeOnClick') < mount, 'the close handler is made once, outside any mount');
  assert.ok(!/_closer/.test(src), 'and the one-time flag that pinned the first mount is gone');
  assert.match(src, /dlg\.el\._acts === acts\) dlg\.el\._acts = null/, 'a mount that ends lets go of the shared dialog\'s action table');
  assert.match(src, /barT = 0; if \(dead \|\| document\.hidden\) return;/, 'the bar loop does not re-arm itself while the tab is hidden');
  assert.match(src, /paintBars\(true\); if \(!barT\) barLoop\(\);/, 'and starts again when the tab is shown');
  const esc = src.indexOf("e.key === 'Escape' && U.drawer"), guard = src.indexOf('if (field) return;');
  assert.ok(esc > -1 && guard > esc, 'Escape is handled before the fields are left alone (the 1 to 7 shortcuts stay out of them)');
  assert.match(src, /select:open/, 'a select\'s open list keeps its own Escape');
  const wv = read('js/ui/worldview.js'); assert.match(wv, /window\.pc\.world === world\) window\.pc\.world = null/, 'the debugging handle lets go of the world too');
});
test('Deal Room: a paint that removes or disables the focused control puts the cursor on its neighbour, never on the page', () => {
  const src = read('js/ui/deal.js');
  assert.match(src, /const keepFocus = \(d\) =>/); assert.match(src, /else keepFocus\(d\);/); assert.match(src, /noteFocus\(\)/);
  assert.match(src, /\.deal-stage \[data-fid\], \.deal-foot \[data-fid\]/, 'the controls of the stage and its foot, not the head');
});
