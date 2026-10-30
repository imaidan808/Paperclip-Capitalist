// The first screen of the world is shown when the ground is made, not before (js/world/veil.js, World.attach and World.frame). On a laptop four times slower than a Mac the first frame is up in 0.75 s and the ground is whole at
// 2.5 s: for the seconds between, the town stood on bare blue sea with a few rectangles of ground. The canvas is held clear (opacity 0) until the window's ground is whole, or 2.5 s after the first frame (and then as soon as
// nothing is bare), and brought in over 250 ms. Nothing is held for the rig (it bakes the whole window at once and reads pixels), for a stopped world, or for a player who asked for less motion (shown at once, not faded).
import test from 'node:test';
import assert from 'node:assert/strict';
import { veilAt, VEIL_MS, VEIL_MAX_MS, VEIL_FADE_MS } from '../js/world/veil.js';
import { Game } from '../js/engine.js';

const noop = () => {};
const grad = { addColorStop: noop };
const fakeCtx = () => new Proxy({ measureText: (s) => ({ width: String(s).length * 6 }), createLinearGradient: () => grad, createRadialGradient: () => grad, getTransform: () => ({}) }, {
  get(o, k) { if (k in o) return o[k]; if (typeof k === 'symbol') return undefined; return noop; }, set() { return true; } });
function stubDom(size, motion = false) {
  const el = () => ({ style: {}, dataset: {}, width: 0, height: 0, addEventListener: noop, setAttribute: noop, getContext: () => fakeCtx(), getBoundingClientRect: () => ({ width: size[0], height: size[1], left: 0, top: 0 }), replaceChildren: noop });
  globalThis.document = { createElement: el, documentElement: { dataset: motion ? { motion: 'reduce' } : {} }, hidden: false };
  globalThis.window = { devicePixelRatio: 1 }; globalThis.ResizeObserver = class { observe() {} disconnect() {} }; globalThis.matchMedia = () => ({ matches: false });
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = noop; globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return fakeCtx(); } }; // (a browser: there are surfaces to make the ground in, so there is something to wait for)
}
async function attached({ motion = false, rig = false } = {}) {
  stubDom([800, 520], motion); if (rig) window.__rig = {};
  const { World } = await import('../js/world/world.js'); const g = new Game({ perks: ['connected', 'grad'], handle: 'Test', pid: 'T-1', seed: 7 });
  const session = { game: g, clock: { now: () => g.s.hour, paused: true, speed: 1 } };
  const w = new World({ session, ui: { zone: 1, sel: new Set() }, activate: noop, hover: noop }), host = document.createElement('div');
  w.attach(host); w.draw = () => {}; // (the frames below are about the veil: what they draw is not)
  return { w, cv: w.cv };
}
let ts = performance.now() + 1000; const tick = (w, ms) => { ts += ms; w.frame(ts); };

test('veilAt: the cells are made exact while the canvas is held, coarse once the first 2.5 s are over, and the veil goes when the ground is whole, when it is covered after 2.5 s, or after 5 s whatever', () => {
  assert.equal(VEIL_MS, 2500); assert.equal(VEIL_FADE_MS, 250); assert.equal(VEIL_MAX_MS, 5000);
  assert.equal(veilAt(0, false, false), 'hold'); assert.equal(veilAt(2499, false, true), 'hold', 'covered is not enough before 2.5 s: the exact chunks are on their way');
  assert.equal(veilAt(100, true, true), 'show', 'whole: shown at once, however early'); assert.equal(veilAt(2500, false, true), 'show', 'after 2.5 s, covered: shown');
  assert.equal(veilAt(2500, false, false), 'cover', 'after 2.5 s with a bare piece: held on, and the bare cells are covered coarse'); assert.equal(veilAt(4999, false, false), 'cover');
  assert.equal(veilAt(5000, false, false), 'show', 'never held for longer than 5 s');
});

test('the canvas is clear from the moment it is attached, and comes in over 250 ms when the ground is whole', async () => {
  const { w, cv } = await attached(); assert.equal(cv.style.opacity, '0', 'held back'); assert.equal(w.veilHold, true);
  w.gcValid = false; w.gcHoles = 4; tick(w, 40); tick(w, 400); assert.equal(cv.style.opacity, '0', 'the ground is not whole: still clear');
  w.gcValid = true; w.gcHoles = 0; tick(w, 40); assert.equal(cv.style.opacity, '1'); assert.match(cv.style.transition, new RegExp(`opacity ${VEIL_FADE_MS}ms`), 'a fade of 250 ms'); assert.equal(w.veilHold, false);
  const later = cv.style.transition; tick(w, 40); assert.equal(cv.style.transition, later, 'once shown it is left alone');
});

test('after 2.5 s from the first frame the canvas is shown as soon as nothing is bare, never before the first frame is counted, and at the latest at 5 s', async () => {
  const a = await attached(); a.w.gcValid = false; a.w.gcHoles = 3; tick(a.w, 40); // the first frame
  tick(a.w, 2400); assert.equal(a.cv.style.opacity, '0', '2.44 s: held, and the cells are still made exact'); assert.equal(a.w.veilHold, true);
  tick(a.w, 100); assert.equal(a.cv.style.opacity, '0', 'over 2.5 s but a piece is bare: held on'); assert.equal(a.w.veilHold, false, 'and the cells are covered coarse now');
  a.w.gcHoles = 0; tick(a.w, 40); assert.equal(a.cv.style.opacity, '1', 'covered: shown');
  const b = await attached(); b.w.gcValid = false; b.w.gcHoles = 3; tick(b.w, 40); tick(b.w, 4900); assert.equal(b.cv.style.opacity, '0', '4.9 s: still held, a piece bare'); tick(b.w, 100); assert.equal(b.cv.style.opacity, '1', 'five seconds is the longest it is held, bare or not');
  const c = await attached(); c.w.gcValid = false; c.w.gcHoles = 0; tick(c.w, 40); tick(c.w, 2000); assert.equal(c.cv.style.opacity, '0', 'covered before 2.5 s is not enough: the exact ground is on its way');
});

test('under reduced motion the canvas is shown at once, without a fade (the hold is not motion; the fade would be)', async () => {
  const { w, cv } = await attached({ motion: true }); assert.equal(cv.style.opacity, '0'); w.gcValid = true; w.gcHoles = 0; tick(w, 40); assert.equal(cv.style.opacity, '1'); assert.equal(cv.style.transition, 'none');
});

test('the rig and a stopped world are never held: the rig reads pixels, and a stopped loop would never show it', async () => {
  const r = await attached({ rig: true }); assert.notEqual(r.cv.style.opacity, '0', 'with window.__rig the canvas is not held'); assert.equal(r.w.veilHold, false); delete window.__rig;
  const { w, cv } = await attached(); assert.equal(cv.style.opacity, '0'); w.stop(); assert.equal(cv.style.opacity, '1', 'stop() shows it'); assert.equal(cv.style.transition, 'none'); assert.equal(w.veilHold, false);
});

test('a world attached again (its bitmaps were given back) is held again; the loop does not sleep while the veil is up or the ground is not whole', async () => {
  const { w, cv } = await attached(); w.gcValid = true; w.gcHoles = 0; tick(w, 40); assert.equal(cv.style.opacity, '1');
  w.detach(); w.attach(document.createElement('div')); w.draw = () => {}; assert.equal(cv.style.opacity, '0', 'held again');
  const calm = await attached({ motion: true }); calm.w.dirty = false; calm.w.gcMore = false; calm.w.veil.on = true; let asked = 0; globalThis.requestAnimationFrame = () => { asked++; return 1; };
  calm.w.raf = 0; calm.w.frame(ts += 40); assert.ok(asked >= 1, 'a veiled world under reduced motion still asks for its next frame');
  calm.w.veil.on = false; calm.w.gcMore = true; calm.w.raf = 0; asked = 0; calm.w.frame(ts += 40); assert.ok(asked >= 1, 'and so does a ground that is not whole');
  calm.w.gcMore = false; calm.w.dirty = false; calm.w.raf = 0; asked = 0; calm.w.frame(ts += 40); assert.equal(asked, 0, 'a whole ground at rest asks for nothing');
});
