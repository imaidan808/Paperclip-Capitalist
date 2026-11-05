// A World without a browser, for tests that ask what the world DRAWS or what it PICKS (the depth-sorted list, the hits) and not how it looks: the page, the canvas, the observers and the media query it touches are stand-ins,
// every canvas call is counted and dropped, and nothing waits for a frame. The same stand-ins tests/world-fx.test.mjs uses for the frame loop, here for the tests that move the camera by hand.
//   const { w } = await newWorld();            // a world of 800 x 520 css pixels, district 1 open, the player placed, the frame loop not started
//   w.goTo(x, y, zoom, false); w.draw();       // the camera, instantly, and one frame: w.items is the depth-sorted list (records { key, k: 's' | 'e' | 'p' | 'c', a }), w.hits what a click can land on, w.view the culling box
import { Game } from '../../js/engine.js';

const noop = () => {};
const grad = { addColorStop: noop };
const fakeCtx = (log) => new Proxy({ measureText: (s) => ({ width: String(s).length * 6 }), createLinearGradient: () => grad, createRadialGradient: () => grad, getTransform: () => ({}) }, {
  get(o, k) { if (k in o) return o[k]; if (typeof k === 'symbol') return undefined; return (...a) => { log.n++; log.by[k] = (log.by[k] || 0) + 1; }; },
  set(o, k, v) { o[k] = v; return true; },
});
/** The globals a World reads, as stand-ins (a canvas whose context records, a resize observer that never fires, no reduced motion). Returns the log of canvas calls. */
export function stubDom(w = 800, h = 520) {
  const log = { n: 0, by: {} };
  const el = () => ({ style: {}, dataset: {}, width: 0, height: 0, addEventListener: noop, setAttribute: noop, getContext: () => fakeCtx(log), getBoundingClientRect: () => ({ width: w, height: h, left: 0, top: 0 }), replaceChildren: noop, append: noop });
  globalThis.document = { createElement: el, documentElement: { dataset: {} }, hidden: false };
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = noop;
  return log;
}
/** A world on a real game (district 1 open), `size` css pixels wide and high. */
export async function newWorld({ size = [800, 520], seed = 3 } = {}) {
  const log = stubDom(...size), game = new Game({ perks: ['connected', 'grad'], handle: 'Test', pid: 'T-1', seed });
  const { World } = await import('../../js/world/world.js');
  const session = { game, clock: { now: () => game.s.hour, paused: true, speed: 1 } };
  const w = new World({ session, ui: { zone: 1, sel: new Set() }, activate: noop, hover: noop });
  w.host = { getBoundingClientRect: () => ({ width: size[0], height: size[1] }) };
  w.resize(); w.sync(); w.placePlayer();
  return { w, log, game };
}
