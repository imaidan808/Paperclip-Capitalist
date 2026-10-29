// Zooming the world with the wheel and the trackpad: the pure rules (js/world/camera-input.js: what a wheel event is, what it does to the zoom, how a notch eases, how Safari's
// gestures are read) and the World's use of them (one non-passive listener on the canvas, a zoom about the pointer, the ease cancelled by a drag, a button or a camera move).
// The DOM tests run the real World against the same recording-canvas stand-ins as tests/world.test.mjs, with event listeners kept as lists (as a page keeps them).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/engine.js';
import {
  LINE_PX, MOUSE_STEP, TRACKPAD_RATE, PINCH_RATE, MAX_EVENT_FACTOR, ZOOM_TAU, SETTLE_LN, MOUSE, PINCH, TRACKPAD,
  STREAM_GAP_MS, clampFactor, normalizeWheel, wheelZoomFactor, zoomFactor, gestureZoomFactor, easeZoom, ZoomInput,
} from '../js/world/camera-input.js';

const near = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const SOURCE = (e, h) => normalizeWheel(e, h).source;

// ================================================================ the pure module: what a wheel event is
test('a wheel event becomes one pixel delta: pixels as they are, a line is 16 px, a page is the viewport height', () => {
  assert.equal(normalizeWheel({ deltaY: 7.5 }).delta, 7.5);
  assert.equal(normalizeWheel({ deltaMode: 1, deltaY: 3 }).delta, 3 * LINE_PX);
  assert.equal(LINE_PX, 16);
  assert.equal(normalizeWheel({ deltaMode: 2, deltaY: 1 }, 600).delta, 600);
  assert.equal(normalizeWheel({ deltaMode: 2, deltaY: -2 }, 600).delta, -1200);
  assert.equal(normalizeWheel({ deltaMode: 2, deltaY: 1 }).delta, 800, 'a page without a viewport height is a default one');
  assert.equal(normalizeWheel({ deltaMode: 2, deltaY: 1 }, NaN).delta, 800);
  assert.equal(normalizeWheel({ deltaMode: 2, deltaY: 1 }, -5).delta, 800);
});

test('the source is told from the event: a mouse notch, a pinch, a trackpad scroll', () => {
  // mouse notches: Firefox by lines; Chrome and Edge by a whole, large deltaY with no deltaX; a page-by-page wheel
  for (const e of [{ deltaMode: 1, deltaY: 3 }, { deltaMode: 1, deltaY: -1 }, { deltaMode: 0, deltaY: 100 }, { deltaMode: 0, deltaY: -100 }, { deltaY: 120 }, { deltaY: -50 }, { deltaMode: 2, deltaY: 1 }]) {
    assert.equal(SOURCE(e), MOUSE, JSON.stringify(e));
  }
  assert.equal(SOURCE({ ctrlKey: true, deltaMode: 0, deltaY: -100 }), MOUSE, 'Ctrl held on a mouse wheel is still a notch');
  assert.equal(SOURCE({ ctrlKey: true, deltaMode: 1, deltaY: -3 }), MOUSE);
  // pinch: ctrlKey with a small or fractional delta
  for (const e of [{ ctrlKey: true, deltaY: -1.5 }, { ctrlKey: true, deltaY: 7 }, { ctrlKey: true, deltaY: 49 }, { ctrlKey: true, deltaY: 0.2 }, { ctrlKey: true, deltaY: -64.25 }]) {
    assert.equal(SOURCE(e), PINCH, JSON.stringify(e));
  }
  // trackpad scroll: everything else
  for (const e of [{ deltaY: 3.7 }, { deltaY: -0.4 }, { deltaY: 4 }, { deltaY: 49 }, { deltaY: 100.5 }, { deltaY: 100, deltaX: 3 }, { deltaY: -120, deltaX: -0.5 }, { deltaY: 300.25 }, {}]) {
    assert.equal(SOURCE(e), TRACKPAD, JSON.stringify(e));
  }
});

// ================================================================ the pure module: what an event does to the zoom
test('one mouse notch is a clear step in either direction, about 1.12 to 1.2 times', () => {
  for (const e of [{ deltaMode: 1, deltaY: -3 }, { deltaY: -100 }, { deltaY: -120 }, { deltaMode: 1, deltaY: -1 }, { deltaMode: 2, deltaY: -1 }]) {
    const f = wheelZoomFactor(e);
    assert.ok(f >= 1.12 && f <= 1.2 || e.deltaMode === 2, `${JSON.stringify(e)} zooms by ${f}`);
    const back = wheelZoomFactor({ ...e, deltaY: -e.deltaY });
    near(back, 1 / f, 1e-12, 'wheel down undoes wheel up');
    assert.ok(f > 1 && back < 1, 'wheel up zooms in, wheel down zooms out');
  }
  near(wheelZoomFactor({ deltaY: -100 }), MOUSE_STEP, 1e-12);
  assert.ok(MOUSE_STEP >= 1.12 && MOUSE_STEP <= 1.2);
  // a fast-spun wheel's big event counts for more, up to three notches, and no further
  near(wheelZoomFactor({ deltaY: -240 }), MOUSE_STEP ** 2, 1e-12);
  near(wheelZoomFactor({ deltaY: -360 }), MOUSE_STEP ** 3, 1e-12);
  near(wheelZoomFactor({ deltaY: -100000 }), MOUSE_STEP ** 3, 1e-12);
  assert.ok(MOUSE_STEP ** 3 <= MAX_EVENT_FACTOR);
});

test('a pinch follows the fingers 1:1: the factor is a pure exponential of the delta, so events add up', () => {
  const f = (dy) => wheelZoomFactor({ ctrlKey: true, deltaY: dy });
  near(f(-10), Math.exp(0.1), 1e-12); near(f(10), Math.exp(-0.1), 1e-12);
  near(f(-2.5) * f(-2.5) * f(-2.5) * f(-2.5), f(-10), 1e-12, 'four small events are one big one');
  near(f(-3.3) * f(3.3), 1, 1e-12, 'out and back is where it began');
  assert.ok(f(-0.3) > 1 && f(-0.3) < 1.004, 'a hair of a pinch is a hair of a zoom');
});

test('a two-finger scroll zooms smoothly and gently: small deltas make small steps', () => {
  const f = (dy, extra = {}) => wheelZoomFactor({ deltaY: dy, ...extra });
  assert.ok(f(-3.7) > 1 && f(-3.7) < 1.012, 'one frame of a scroll moves the zoom by about a percent at most');
  assert.ok(f(3.7) < 1 && f(3.7) > 0.988);
  near(f(-3.7) * f(3.7), 1, 1e-12);
  assert.ok(f(-30.5) < 1.1, 'a quick scroll frame is still not a jump');
  // what a hand makes of it: a gentle slide is a clear but modest zoom, a medium swipe with its momentum about three times, a hard flick nearly everything the range has
  const dist = (px, n = 40) => { let z = 1; for (let i = 0; i < n; i++) z *= f(-px / n); return z; };
  assert.ok(dist(150) > 1.15 && dist(150) < 1.6, `150 px: ${dist(150)}`); assert.ok(dist(800) > 2 && dist(800) < 5, `800 px: ${dist(800)}`); assert.ok(dist(2000) > 8, `2000 px: ${dist(2000)}`);
  assert.ok(TRACKPAD_RATE >= 0.001 && TRACKPAD_RATE <= 0.003 && PINCH_RATE === 0.01);
  // the same distance of scrolling is much gentler than a pinch of the same delta, and than a notch of 100 px
  assert.ok(wheelZoomFactor({ deltaY: -48.5 }) < MOUSE_STEP);
  assert.ok(f(-5.5) < wheelZoomFactor({ ctrlKey: true, deltaY: -5.5 }));
});

test('no single event can move the zoom by more than 1.6 times, whatever it carries', () => {
  assert.equal(MAX_EVENT_FACTOR, 1.6);
  const cases = [{ deltaY: 50000.5 }, { deltaY: -50000.5 }, { ctrlKey: true, deltaY: -49.9 }, { ctrlKey: true, deltaY: 1e9 + 0.5 }, { deltaMode: 1, deltaY: -1e6 }, { deltaMode: 2, deltaY: 1e6 }, { deltaY: -1e308 }, { deltaY: 1e308 }];
  for (const e of cases) {
    const f = wheelZoomFactor(e);
    assert.ok(f >= 1 / MAX_EVENT_FACTOR - 1e-12 && f <= MAX_EVENT_FACTOR + 1e-12 && Number.isFinite(f) && f > 0, `${JSON.stringify(e)} gave ${f}`);
  }
  near(wheelZoomFactor({ deltaY: -50000.5 }), 1.6, 1e-12); near(wheelZoomFactor({ deltaY: 50000.5 }), 1 / 1.6, 1e-12);
  assert.equal(clampFactor(9), 1.6); near(clampFactor(0.01), 1 / 1.6, 1e-12); assert.equal(clampFactor(1.3), 1.3);
});

test('a missing field, NaN or Infinity is no movement, and nothing throws', () => {
  const junk = [undefined, null, 0, 'x', [], {}, { deltaY: NaN }, { deltaY: Infinity }, { deltaY: -Infinity, deltaMode: 1 }, { deltaY: '12' }, { deltaY: null }, { deltaY: {}, ctrlKey: true },
    { deltaY: 5, deltaMode: NaN }, { deltaMode: 1 }, { deltaMode: 2, deltaY: Infinity }, { ctrlKey: true }, { deltaY: NaN, deltaX: Infinity, deltaMode: 'a' }];
  for (const e of junk) {
    assert.doesNotThrow(() => wheelZoomFactor(e), JSON.stringify(e));
    assert.equal(wheelZoomFactor(e), e && e.deltaY === 5 ? wheelZoomFactor({ deltaY: 5 }) : 1, JSON.stringify(e));
    assert.doesNotThrow(() => normalizeWheel(e));
    assert.ok(Number.isFinite(normalizeWheel(e).delta));
  }
  assert.equal(wheelZoomFactor({ deltaY: 0 }), 1); assert.equal(wheelZoomFactor({ deltaY: -0 }), 1);
  assert.equal(wheelZoomFactor({ deltaY: 5, deltaX: NaN }), wheelZoomFactor({ deltaY: 5 }), 'a bad deltaX is no deltaX');
  for (const [a, b] of [[NaN, 1], [1, NaN], [Infinity, 1], [1, Infinity], [undefined, 1], [1, undefined], [null, 1], [0, 1], [1, 0], [-1, 2], [2, -1], ['1', 1.1], [1, '1.1']]) {
    assert.equal(gestureZoomFactor(a, b), 1, `${a} -> ${b}`);
  }
  assert.equal(gestureZoomFactor(), 1);
  for (const f of [NaN, Infinity, -Infinity, 0, -2, undefined, null, '3', {}]) assert.equal(clampFactor(f), 1);
});

test('Safari\'s gesture scale is turned into the growth since the last event, bounded like a wheel event', () => {
  near(gestureZoomFactor(1, 1.1), 1.1, 1e-12);
  near(gestureZoomFactor(1.1, 1.21), 1.1, 1e-12);
  near(gestureZoomFactor(1.21, 1.1), 1.1 / 1.21, 1e-12);
  // a chain of events multiplies back up to the scale the gesture has now
  let z = 1, prev = 1; for (const s of [1.02, 1.07, 1.15, 1.3, 1.52, 1.4, 1.1, 0.9]) { z *= gestureZoomFactor(prev, s); prev = s; } near(z, 0.9, 1e-12);
  assert.equal(gestureZoomFactor(1, 10), 1.6); near(gestureZoomFactor(10, 1), 1 / 1.6, 1e-12);
});

test('a momentum tail of ever smaller deltas cannot run the zoom away', () => {
  const lo = 0.5, hi = 2.4, clamp = (z) => Math.min(hi, Math.max(lo, z));
  // macOS keeps sending scroll events for a second or more after the fingers lift: here 600 of them, decaying, all one way, so far more than the range allows
  let z = 1, worst = 1;
  for (let i = 0; i < 600; i++) {
    const f = wheelZoomFactor({ deltaY: -(180.25 * 0.96 ** i) }); worst = Math.max(worst, f);
    assert.ok(f <= MAX_EVENT_FACTOR, `event ${i} zoomed by ${f}`); z = clamp(z * f); assert.ok(Number.isFinite(z) && z >= lo && z <= hi);
  }
  assert.equal(z, hi, 'it stops at the end of the range and stays there'); assert.ok(worst <= MAX_EVENT_FACTOR);
  for (let i = 0; i < 500; i++) z = clamp(z * wheelZoomFactor({ deltaY: -0.3 * 0.99 ** i }));
  assert.equal(z, hi, 'and a long tail of fractions of a pixel does not move it off');
  assert.ok(clamp(z * wheelZoomFactor({ deltaY: 6.5 })) < hi, 'one opposite event moves it at once: nothing wound up behind the end');
  // a short tail that does not reach the end adds up to exactly what its distance says: a total scroll of D px is a zoom of e^(-D * rate), no more
  let zz = 1, total = 0; for (let i = 0; i < 80; i++) { const dy = -(6.25 * 0.9 ** i); total += dy; zz *= wheelZoomFactor({ deltaY: dy }); }
  near(zz, Math.exp(-total * TRACKPAD_RATE), 1e-9, 'a gentle tail is exactly proportional'); assert.ok(zz > 1 && zz < 1.2);
  // a fuzz of random events, junk included, never leaves the range
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  z = 1; const pick = [NaN, Infinity, -Infinity, undefined, 1e308, -1e308, 0];
  for (let i = 0; i < 5000; i++) {
    const e = { deltaY: rnd() < 0.1 ? pick[Math.floor(rnd() * pick.length)] : (rnd() - 0.5) * 400 * (rnd() < 0.5 ? 1 : 0.01), ctrlKey: rnd() < 0.3, deltaMode: Math.floor(rnd() * 3), deltaX: rnd() < 0.5 ? 0 : rnd() };
    z = clamp(z * wheelZoomFactor(e)); assert.ok(Number.isFinite(z) && z >= lo && z <= hi);
  }
});

// ================================================================ the pure module: the ease
test('a notch eases in about its pointer: smooth, monotonic, 86% done in 180 ms, landing exactly, whatever the frame rate', () => {
  assert.ok(ZOOM_TAU >= 0.08 && ZOOM_TAU <= 0.1, 'a time constant of about 90 ms');
  const run = (from, to, dt) => { let z = from, t = 0, prev = from; const trace = []; while (z !== to && t < 2) { z = easeZoom(z, to, dt); t += dt; trace.push([t, z]); assert.ok(to > from ? z >= prev && z <= to : z <= prev && z >= to, 'monotonic, no overshoot'); prev = z; } return { z, t, trace }; };
  for (const [from, to] of [[1, 1 * MOUSE_STEP], [1.5, 1.5 / MOUSE_STEP], [0.6, 2.2], [2.2, 0.6]]) {
    const a = run(from, to, 1 / 60), b = run(from, to, 1 / 30), c = run(from, to, 1 / 144);
    for (const r of [a, b, c]) { assert.equal(r.z, to, 'lands exactly on the target'); assert.ok(r.t < 1.2, `settled in ${r.t} s`); }
    const at = (r, sec) => r.trace.filter(([t]) => t <= sec + 1e-9).at(-1)?.[1] ?? from;
    const share = (r) => Math.log(at(r, 0.18) / from) / Math.log(to / from);
    if (Math.abs(Math.log(to / from)) < 0.2) { assert.ok(share(a) > 0.8 && share(a) < 0.95, `${(share(a) * 100).toFixed(0)}% by 180 ms`); }
    near(share(a), share(b), 0.02, 'the frame rate does not change the curve'); near(share(a), share(c), 0.02);
  }
  // one frame of any length is the same ease as the same time in two frames (an exponential, in the zoom's own log)
  near(easeZoom(easeZoom(1, 2, 0.01), 2, 0.01), easeZoom(1, 2, 0.02), 1e-12);
  assert.equal(easeZoom(1, 1 + 0.5 * SETTLE_LN, 0.016), 1 + 0.5 * SETTLE_LN, 'within half a percent it just lands');
  assert.equal(easeZoom(1.7, 1.7, 0.016), 1.7);
});

test('the ease never throws and never invents a zoom', () => {
  assert.equal(easeZoom(1, 2, 0), 1, 'no time passed, no movement'); assert.equal(easeZoom(1, 2, -1), 1); assert.equal(easeZoom(1, 2, NaN), 1); assert.equal(easeZoom(1, 2, Infinity), 1);
  assert.equal(easeZoom(NaN, 2, 0.016), 2); assert.equal(easeZoom(0, 2, 0.016), 2); assert.equal(easeZoom(-1, 2, 0.016), 2);
  assert.equal(easeZoom(1, NaN, 0.016), 1); assert.equal(easeZoom(1, 0, 0.016), 1); assert.equal(easeZoom(1, Infinity, 0.016), 1); assert.equal(easeZoom(1, -3, 0.016), 1);
  assert.equal(easeZoom(NaN, NaN, 0.016), 1);
  assert.equal(easeZoom(1, 2, 0.016, 0), 2, 'a time constant of nothing is no ease'); assert.equal(easeZoom(1, 2, 0.016, NaN), 2);
  assert.equal(easeZoom(), 1);
});

// ================================================================ the pure module: ZoomInput against a stand-in host
function fakeHost(over = {}) {
  const h = { z: 1, range: [0.5, 2.4], size: [800, 520], instantNow: false, touchingNow: false, applied: [], ...over };
  h.zoom = () => h.z;
  h.apply = (z, px, py) => { h.applied.push([z, px, py]); h.z = Math.min(h.range[1], Math.max(h.range[0], z)); };
  h.rangeFn = () => h.range;
  return { h, host: { zoom: h.zoom, apply: h.apply, range: () => h.range, size: () => h.size, instant: () => h.instantNow, touching: () => h.touchingNow } };
}
const settle = (zi, host, dt = 1 / 60, max = 200) => { let n = 0; while (zi.pending && n++ < max) zi.tick(dt); return n; };

test('ZoomInput: a mouse notch sets a goal and eases to it about the pointer; the zoom does not jump', () => {
  const { h, host } = fakeHost(); const zi = new ZoomInput(host);
  assert.equal(zi.wheel({ deltaY: -100, offsetX: 300, offsetY: 120 }), true);
  assert.equal(h.z, 1, 'nothing has moved yet'); assert.equal(zi.pending, true); assert.equal(h.applied.length, 0);
  zi.tick(1 / 60); assert.ok(h.z > 1 && h.z < MOUSE_STEP, 'one frame is part of the way');
  assert.deepEqual(h.applied[0].slice(1), [300, 120], 'about the pointer');
  const frames = settle(zi, host); assert.equal(h.z, MOUSE_STEP, 'and exactly there'); assert.equal(zi.pending, false); assert.ok(frames < 30, `${frames} frames`);
  assert.ok(h.applied.every(([, x, y]) => x === 300 && y === 120));
  assert.equal(zi.tick(1 / 60), false, 'nothing pending, nothing to do');
});

test('ZoomInput: quick notches add up from the goal, not from where the ease has got to, and the goal stays in range', () => {
  const { h, host } = fakeHost(); const zi = new ZoomInput(host);
  for (let i = 0; i < 3; i++) { zi.wheel({ deltaMode: 1, deltaY: -3, offsetX: 100, offsetY: 100 }); zi.tick(1 / 60); }
  settle(zi, host); near(h.z, MOUSE_STEP ** 3, 1e-9);
  zi.wheel({ deltaY: 100, offsetX: 100, offsetY: 100 }); zi.tick(1 / 60); zi.wheel({ deltaY: 100, offsetX: 100, offsetY: 100 }); settle(zi, host); near(h.z, MOUSE_STEP, 1e-9, 'two notches back');
  for (let i = 0; i < 40; i++) zi.wheel({ deltaY: -100 }); settle(zi, host); assert.equal(h.z, 2.4, 'spun to the top');
  for (let i = 0; i < 80; i++) zi.wheel({ deltaY: 100 }); settle(zi, host); assert.equal(h.z, 0.5, 'and straight down to the bottom');
  for (let i = 0; i < 60; i++) zi.wheel({ deltaY: -100 }); zi.wheel({ deltaY: 100 }); settle(zi, host);
  near(h.z, 2.4 / MOUSE_STEP, 1e-9, 'sixty notches up past the top and one back: one notch below the top, nothing wound up beyond it');
});

test('ZoomInput: with easing off (reduced motion, or no loop to drive it) a notch zooms at once, and nothing is left pending', () => {
  const { h, host } = fakeHost({ instantNow: true }); const zi = new ZoomInput(host);
  zi.wheel({ deltaY: -100, offsetX: 50, offsetY: 60 });
  assert.equal(zi.pending, false); near(h.z, MOUSE_STEP, 1e-12); assert.deepEqual(h.applied.at(-1).slice(1), [50, 60]);
  // and turning motion down in the middle of an ease arrives at once
  const b = fakeHost(); const zb = new ZoomInput(b.host);
  zb.wheel({ deltaY: -100, offsetX: 5, offsetY: 6 }); zb.tick(1 / 60); assert.ok(zb.pending);
  b.h.instantNow = true; zb.tick(1 / 60); assert.equal(zb.pending, false); near(b.h.z, MOUSE_STEP, 1e-12);
});

test('ZoomInput: a notch-sized event inside a trackpad\'s gesture belongs to the gesture; after a pause it is a notch', () => {
  assert.equal(normalizeWheel({ deltaY: 96 }).guess, true, 'a whole 96 is a notch by its size'); assert.equal(normalizeWheel({ deltaMode: 1, deltaY: 3 }).guess, false, 'by line the device is certain');
  assert.equal(zoomFactor(-96, TRACKPAD), Math.exp(96 * TRACKPAD_RATE)); assert.equal(zoomFactor(NaN, MOUSE), 1); assert.equal(zoomFactor(undefined, PINCH), 1);
  let t = 1000; const ev = (dy, extra = {}) => ({ deltaY: dy, offsetX: 100, offsetY: 100, timeStamp: (t += 16), ...extra });
  // a flick: it ramps up through small deltas, then sends whole numbers over 50 with no deltaX, which alone look like notches
  const a = fakeHost({ z: 0.5 }); const za = new ZoomInput(a.host);
  za.wheel(ev(-6.5)); za.wheel(ev(-31.25)); const z1 = a.h.z; assert.equal(za.pending, false);
  za.wheel(ev(-96)); assert.equal(za.pending, false, 'applied at once, not eased'); near(a.h.z, z1 * Math.exp(96 * TRACKPAD_RATE), 1e-12, 'by the scroll rule');
  const z2 = a.h.z; za.wheel(ev(-120)); za.wheel(ev(-104)); near(a.h.z, z2 * Math.exp(224 * TRACKPAD_RATE), 1e-12, 'and the rest of the flick'); assert.equal(za.pending, false);
  za.wheel(ev(-3, { deltaMode: 1 })); assert.equal(za.pending, true, 'a wheel that scrolls by lines is a wheel, even then');
  // a pause ends the gesture
  const b = fakeHost(); const zb = new ZoomInput(b.host);
  zb.wheel(ev(-6.5)); const zs = b.h.z; t += STREAM_GAP_MS * 5; zb.wheel(ev(-100)); assert.equal(zb.pending, true, 'after a pause a notch is a notch'); assert.equal(b.h.z, zs);
  settle(zb, b.host); near(b.h.z, zs * MOUSE_STEP, 1e-9);
  zb.wheel(ev(-6.5)); zb.wheel(ev(-100)); assert.equal(zb.pending, false, 'but straight after a scroll event it is the scroll');
  // a pinch's big event stays a pinch (it is held to 1.6 times, a scroll of the same size would be 1.13)
  const c = fakeHost(); const zc = new ZoomInput(c.host);
  zc.wheel(ev(-2.5, { ctrlKey: true })); const z4 = c.h.z; zc.wheel(ev(-50, { ctrlKey: true })); near(c.h.z, z4 * 1.6, 1e-12); assert.equal(zc.pending, false);
  // a run of real notches, close together, stays a run of notches
  const w = fakeHost(); const zw = new ZoomInput(w.host); let u = 5000; for (let i = 0; i < 3; i++) zw.wheel({ deltaY: -100, timeStamp: (u += 12) });
  assert.equal(zw.pending, true); settle(zw, w.host); near(w.h.z, MOUSE_STEP ** 3, 1e-9);
  // events without a clock (or out of order) are judged one at a time, as the plain rule says
  const x = fakeHost(); const zx = new ZoomInput(x.host); zx.wheel({ deltaY: -3.5 }); zx.wheel({ deltaY: -100 }); assert.equal(zx.pending, true);
  const y = fakeHost(); const zy = new ZoomInput(y.host); zy.wheel({ deltaY: -3.5, timeStamp: 900 }); zy.wheel({ deltaY: -100, timeStamp: 800 }); assert.equal(zy.pending, true, 'a clock that runs backwards is no gesture');
});

test('ZoomInput: a pinch and a trackpad scroll are applied at once, and end an ease that was under way', () => {
  const { h, host } = fakeHost(); const zi = new ZoomInput(host);
  zi.wheel({ ctrlKey: true, deltaY: -4.5, offsetX: 10, offsetY: 20 }); near(h.z, Math.exp(0.045), 1e-12); assert.equal(zi.pending, false);
  zi.wheel({ deltaY: -3.5, offsetX: 10, offsetY: 20 }); near(h.z, Math.exp(0.045) * Math.exp(3.5 * TRACKPAD_RATE), 1e-12);
  zi.wheel({ deltaY: -100, offsetX: 1, offsetY: 2 }); assert.ok(zi.pending);
  const before = h.z; zi.wheel({ ctrlKey: true, deltaY: 2.2, offsetX: 1, offsetY: 2 });
  assert.equal(zi.pending, false, 'the pinch took over'); near(h.z, before * Math.exp(-0.022), 1e-12);
  zi.tick(1 / 60); near(h.z, before * Math.exp(-0.022), 1e-12, 'and the dropped notch does not come back');
});

test('ZoomInput: the ease stops when the camera\'s own clamp holds it short of the goal, instead of pushing for ever', () => {
  const { h, host } = fakeHost(); const zi = new ZoomInput(host);
  zi.wheel({ deltaY: -100 }); h.range = [0.5, 1.05]; // the window was resized and the highest zoom came down
  for (let i = 0; i < 5; i++) zi.tick(1 / 60);
  assert.equal(zi.pending, false); assert.equal(h.z, 1.05);
});

test('ZoomInput: a bad range, a missing pointer and junk events are harmless', () => {
  const { h, host } = fakeHost({ range: [NaN, NaN] }); const zi = new ZoomInput(host);
  assert.doesNotThrow(() => { zi.wheel(undefined); zi.wheel(null); zi.wheel({}); zi.wheel({ deltaY: NaN }); zi.wheel({ deltaY: -100, offsetX: NaN, offsetY: undefined }); });
  assert.deepEqual([zi.pending], [true]);
  assert.doesNotThrow(() => settle(zi, host));
  assert.equal(zi.pending, false);
  const c = fakeHost({ instantNow: true }); const zc = new ZoomInput(c.host);
  zc.wheel({ deltaY: -3.5 }); assert.deepEqual(c.h.applied.at(-1).slice(1), [400, 260], 'no pointer: the middle of the canvas');
  const d = new ZoomInput({ ...c.host, instant: () => { throw new Error('boom'); } });
  assert.doesNotThrow(() => d.wheel({ deltaY: -100 })); assert.equal(d.pending, false, 'a host that cannot say is a host that cannot ease');
});

test('ZoomInput: Safari gestures zoom about the point between the fingers, by the growth of the scale', () => {
  const { h, host } = fakeHost(); const zi = new ZoomInput(host); const rect = { left: 10, top: 20, width: 800, height: 520 };
  zi.gestureStart({ clientX: 210, clientY: 120 }, rect); assert.equal(h.applied.length, 0, 'starting zooms nothing');
  assert.equal(zi.gestureChange({ scale: 1.1, clientX: 210, clientY: 120 }, rect), true);
  zi.gestureChange({ scale: 1.21, clientX: 230, clientY: 140 }, rect);
  near(h.z, 1.21, 1e-12); assert.deepEqual(h.applied[0].slice(1), [200, 100], 'a client point is a canvas point'); assert.deepEqual(h.applied[1].slice(1), [220, 120], 'and the point follows the fingers');
  assert.equal(zi.gestureChange({ scale: 1.21, clientX: 230, clientY: 140 }, rect), false, 'no change in scale, no zoom');
  zi.gestureEnd(); assert.equal(zi.gest, null);
  zi.gestureStart({ clientX: 0, clientY: 0 }, rect); zi.gestureChange({ scale: 0.8, clientX: 210, clientY: 120 }, rect); near(h.z, 1.21 * 0.8, 1e-12, 'a new gesture begins at scale 1');
  zi.gestureEnd(); zi.gestureStart({ clientX: 0, clientY: 0 }, rect); zi.gestureChange({ scale: 0.1, clientX: 210, clientY: 120 }, rect); near(h.z, 1.21 * 0.8 / 1.6, 1e-12, 'one event is held to 1.6 times, as a wheel event is');
  assert.doesNotThrow(() => { zi.gestureChange({}, rect); zi.gestureChange({ scale: NaN }, undefined); zi.gestureChange(null); zi.gestureStart(null, null); zi.gestureEnd(); zi.gestureEnd(); });
  // a gesture that was not started (a dropped event) still works; one that began with fingers on the glass is the pointer events' business
  const g = fakeHost(); const zg = new ZoomInput(g.host); zg.gestureChange({ scale: 1.5, clientX: 50, clientY: 50 }, rect); near(g.h.z, 1.5, 1e-12);
  const t = fakeHost({ touchingNow: true }); const zt = new ZoomInput(t.host); zt.gestureStart({ clientX: 1, clientY: 1 }, rect); zt.gestureChange({ scale: 1.5, clientX: 1, clientY: 1 }, rect);
  assert.equal(t.h.z, 1, 'two fingers down zoom through pointer events; the gesture events must not zoom them twice');
});

test('ZoomInput: a gesture event with no usable point goes about the pointer, then about the point the gesture last had', () => {
  const rect = { left: 10, top: 20, width: 800, height: 520 };
  const { h, host } = fakeHost(); const zi = new ZoomInput(host);
  zi.seen(333, 222); zi.seen(NaN, 5); // a move with no number is no move
  zi.gestureStart({ clientX: 0, clientY: 0 }, rect); // Safari has been seen to report the corner of the window: that is off the canvas
  zi.gestureChange({ scale: 1.1, clientX: 0, clientY: 0 }, rect); assert.deepEqual(h.applied.at(-1).slice(1), [333, 222], 'the pointer\'s place');
  zi.gestureChange({ scale: 1.2, clientX: 410, clientY: 320 }, rect); assert.deepEqual(h.applied.at(-1).slice(1), [400, 300], 'a point on the canvas is the gesture\'s own');
  zi.gestureChange({ scale: 1.3 }, rect); assert.deepEqual(h.applied.at(-1).slice(1), [400, 300], 'and when it drops out the gesture keeps its last');
  zi.gestureChange({ scale: 1.4, clientX: 5000, clientY: 20 }, rect); assert.deepEqual(h.applied.at(-1).slice(1), [400, 300], 'a point far off the canvas is no point');
  zi.gestureEnd(); zi.gestureStart({ clientX: -50, clientY: 100 }, rect); zi.gestureChange({ scale: 1.1, clientX: -50, clientY: 100 }, rect); assert.deepEqual(h.applied.at(-1).slice(1), [333, 222]);
  const n = fakeHost(); const zn = new ZoomInput(n.host); zn.gestureStart({}, rect); zn.gestureChange({ scale: 1.1 }, rect); assert.deepEqual(n.h.applied.at(-1).slice(1), [400, 260], 'no pointer seen yet: the middle');
});

test('ZoomInput: starting a gesture ends an ease, so the two never fight over the camera', () => {
  const { h, host } = fakeHost(); const zi = new ZoomInput(host);
  zi.wheel({ deltaY: -100 }); assert.ok(zi.pending); zi.gestureStart({ clientX: 5, clientY: 5 }, { left: 0, top: 0 }); assert.equal(zi.pending, false); assert.equal(h.z, 1);
});

// ================================================================ the World: stand-ins (as in tests/world.test.mjs, with listeners kept as lists)
const noop = () => {};
const grad = { addColorStop: noop };
function fakeCtx(log) {
  const t = { measureText: (s) => ({ width: String(s).length * 6 }), createLinearGradient: () => grad, createRadialGradient: () => grad, getTransform: () => ({}) };
  return new Proxy(t, {
    get(o, k) { if (k in o) return o[k]; if (typeof k === 'symbol') return undefined; return () => { log.n++; }; },
    set(o, k, v) { o[k] = v; return true; },
  });
}
function stubDom(w = 800, h = 520) {
  const log = { n: 0, docListeners: [], winListeners: [] };
  const el = () => ({ style: {}, dataset: {}, width: 0, height: 0, _l: {}, addEventListener(type, fn, opts) { (this._l[type] ||= []).push({ fn, opts }); }, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getContext: () => fakeCtx(log), getBoundingClientRect: () => ({ width: w, height: h, left: 0, top: 0 }), replaceChildren: noop, append: noop });
  globalThis.document = { createElement: el, documentElement: { dataset: {} }, hidden: false, addEventListener: (t) => log.docListeners.push(t) };
  globalThis.window = { devicePixelRatio: 1, addEventListener: (t) => log.winListeners.push(t) };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = noop;
  return log;
}
const newGame = (seed = 7) => new Game({ perks: ['connected', 'grad'], handle: 'Test', pid: 'T-1', seed });
async function world(size = [800, 520]) {
  const log = stubDom(...size);
  const { World } = await import('../js/world/world.js');
  const game = newGame(3), session = { game, clock: { now: () => game.s.hour, paused: true, speed: 1 } };
  const w = new World({ session, ui: { zone: 1, sel: new Set() }, activate: noop, hover: noop });
  w.host = { getBoundingClientRect: () => ({ width: size[0], height: size[1] }) };
  w.resize(); w.sync(); w.placePlayer();
  const b = w.bounds(); w.goTo((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 1.2, false); // room to zoom both ways, nowhere near a clamp
  return { w, log };
}
/** Dispatch an event to every listener the canvas holds for its type (as a page does). */
function fire(w, type, props = {}) {
  let prevented = false; const e = { type, target: w.cv, preventDefault() { prevented = true; }, ...props };
  for (const l of w.cv._l[type] || []) l.fn(e);
  return { prevented, e };
}
const wheel = (w, props) => fire(w, 'wheel', { deltaMode: 0, deltaX: 0, ctrlKey: false, metaKey: false, altKey: false, ...props });
/** Run the world's own update (the loop's step) until no ease is pending. Returns the steps taken. */
function settleWorld(w, dt = 1 / 60, max = 300) { let n = 0; while (w.zin.pending && n++ < max) w.update(dt); return n; }
const worldAt = (w, px, py) => w.s2w(px, py);
const screenOf = (w, p) => w.w2s(p[0], p[1]);
const press = (w, id, x, y, type = 'pointerdown') => fire(w, type, { pointerId: id, offsetX: x, offsetY: y, clientX: x, clientY: y, button: 0 });

// ================================================================ the World: the wheel
test('a plain scroll wheel zooms the map about the pointer, and the point under the pointer stays put', async () => {
  const { w } = await world(); w.running = true;
  const px = 250, py = 150, p = worldAt(w, px, py), z0 = w.cam.z;
  const r = wheel(w, { deltaMode: 1, deltaY: -3, offsetX: px, offsetY: py }); // one notch up
  assert.equal(r.prevented, true); assert.ok(w.zin.pending, 'a notch eases in');
  for (let i = 0; w.zin.pending && i < 300; i++) {
    w.update(1 / 60);
    const [sx, sy] = screenOf(w, p); assert.ok(Math.abs(sx - px) < 1 && Math.abs(sy - py) < 1, `step ${i}: the point under the pointer moved to ${sx.toFixed(2)},${sy.toFixed(2)}`);
  }
  near(w.cam.z, z0 * MOUSE_STEP, 1e-9, 'one notch is one step'); assert.ok(w.cam.z > z0);
  wheel(w, { deltaMode: 1, deltaY: 3, offsetX: 600, offsetY: 400 }); const q = worldAt(w, 600, 400); settleWorld(w);
  near(w.cam.z, z0, 1e-9, 'a notch down undoes it'); const [qx, qy] = screenOf(w, q); assert.ok(Math.abs(qx - 600) < 1 && Math.abs(qy - 400) < 1, 'and about the new pointer');
});

test('a trackpad\'s two-finger scroll and a pinch zoom about the pointer at once', async () => {
  const { w } = await world(); w.running = true;
  const px = 640, py = 90, p = worldAt(w, px, py); let z = w.cam.z;
  let r = wheel(w, { deltaY: -12.75, offsetX: px, offsetY: py }); assert.equal(r.prevented, true);
  near(w.cam.z, z * Math.exp(12.75 * TRACKPAD_RATE), 1e-12, 'a scroll of 12.75 px'); assert.equal(w.zin.pending, false, 'applied the moment it arrives'); z = w.cam.z;
  r = wheel(w, { ctrlKey: true, deltaY: -3.25, offsetX: px, offsetY: py }); assert.equal(r.prevented, true);
  near(w.cam.z, z * Math.exp(0.0325), 1e-12, 'a pinch of 3.25'); assert.equal(w.zin.pending, false);
  const [sx, sy] = screenOf(w, p); assert.ok(Math.abs(sx - px) < 1 && Math.abs(sy - py) < 1, 'the point under the fingers stayed');
  z = w.cam.z; wheel(w, { deltaY: 8.5, offsetX: px, offsetY: py }); assert.ok(w.cam.z < z, 'fingers the other way zoom out');
});

test('Ctrl and scroll still zooms (the old way), now with the same rules as every other wheel', async () => {
  const { w } = await world(); const z = w.cam.z;
  const r = wheel(w, { ctrlKey: true, deltaY: -100, deltaMode: 0, offsetX: 400, offsetY: 260 }); // a mouse notch with Ctrl held: a notch
  assert.equal(r.prevented, true); near(w.cam.z, z * MOUSE_STEP, 1e-12, 'not running, so no ease: at once');
  wheel(w, { metaKey: true, altKey: true, deltaY: 100, offsetX: 400, offsetY: 260 }); near(w.cam.z, z, 1e-12, 'Cmd and Alt change nothing about it');
});

test('a Safari gesture sequence zooms about the point between the fingers, and the page never sees it', async () => {
  const { w } = await world(); w.cv.getBoundingClientRect = () => ({ left: 30, top: 70, width: 800, height: 520 });
  const z0 = w.cam.z, cx = 330, cy = 230, p = worldAt(w, cx, cy); // the canvas point is the client point less the canvas's own corner
  const a = fire(w, 'gesturestart', { scale: 1, clientX: cx + 30, clientY: cy + 70 });
  assert.equal(a.prevented, true, 'the page does not zoom'); assert.equal(w.cam.z, z0, 'starting a gesture moves nothing');
  const steps = [1.05, 1.12, 1.25, 1.4];
  for (const s of steps) { const r = fire(w, 'gesturechange', { scale: s, clientX: cx + 30, clientY: cy + 70 }); assert.equal(r.prevented, true); }
  near(w.cam.z, z0 * 1.4, 1e-9, 'the camera is zoomed by the scale the gesture reached');
  const [sx, sy] = screenOf(w, p); assert.ok(Math.abs(sx - cx) < 1 && Math.abs(sy - cy) < 1, 'about the gesture point');
  assert.equal(fire(w, 'gestureend', { scale: 1.4 }).prevented, true);
  fire(w, 'gesturestart', { scale: 1, clientX: cx + 30, clientY: cy + 70 }); fire(w, 'gesturechange', { scale: 0.8, clientX: cx + 30, clientY: cy + 70 });
  near(w.cam.z, z0 * 1.4 * 0.8, 1e-9, 'a second gesture starts again from scale 1');
});

test('a Safari gesture that reports no point goes about the pointer, which the world has been watching', async () => {
  const { w } = await world(); w.cv.getBoundingClientRect = () => ({ left: 30, top: 70, width: 800, height: 520 });
  fire(w, 'pointermove', { pointerId: 1, offsetX: 222, offsetY: 111, clientX: 252, clientY: 181 });
  const p = worldAt(w, 222, 111), z0 = w.cam.z;
  fire(w, 'gesturestart', { scale: 1, clientX: 0, clientY: 0 }); fire(w, 'gesturechange', { scale: 1.3, clientX: 0, clientY: 0 });
  near(w.cam.z, z0 * 1.3, 1e-9); const [sx, sy] = screenOf(w, p); assert.ok(Math.abs(sx - 222) < 1 && Math.abs(sy - 111) < 1, 'about the pointer, not the corner of the window');
});

test('a pinch with two fingers on the screen is zoomed by pointer events alone: Safari\'s gesture events must not double it', async () => {
  const { w } = await world();
  press(w, 1, 300, 250); press(w, 2, 500, 250); const z = w.cam.z;
  fire(w, 'gesturestart', { scale: 1, clientX: 400, clientY: 250 }); const r = fire(w, 'gesturechange', { scale: 1.5, clientX: 400, clientY: 250 });
  assert.equal(r.prevented, true, 'the page still must not zoom'); assert.equal(w.cam.z, z);
  fire(w, 'pointerup', { pointerId: 1, offsetX: 300, offsetY: 250, button: 0 }); fire(w, 'pointerup', { pointerId: 2, offsetX: 500, offsetY: 250, button: 0 });
});

test('every wheel and gesture event over the canvas is cancelled, and the listeners are not passive', async () => {
  const { w, log } = await world();
  for (const props of [{ deltaY: -100 }, { deltaY: 3.5 }, { ctrlKey: true, deltaY: -2.5 }, { deltaMode: 1, deltaY: 3 }, { deltaY: 0 }, { deltaY: NaN }, { deltaX: 40, deltaY: 0 }, {}, { deltaY: -100, offsetX: NaN }]) {
    assert.equal(wheel(w, props).prevented, true, JSON.stringify(props));
  }
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) assert.equal(fire(w, t, { scale: 1 }).prevented, true, t);
  for (const t of ['wheel', 'gesturestart', 'gesturechange', 'gestureend']) {
    assert.ok(w.cv._l[t]?.length === 1, `one ${t} listener on the canvas`);
    assert.equal(w.cv._l[t][0].opts?.passive, false, `${t} must be registered non-passive so preventDefault is honoured`);
  }
  assert.deepEqual(log.docListeners.concat(log.winListeners).filter((t) => /wheel|gesture/.test(t)), [], 'nothing listens for wheels on the document or the window');
});

test('a wheel aimed at anything but the canvas does not reach the zoom, and is not cancelled', async () => {
  const { w } = await world(); const z = w.cam.z, cam = { ...w.cam };
  const hud = { tagName: 'DIV' };
  for (const props of [{ deltaY: -100 }, { deltaY: -3.5 }, { ctrlKey: true, deltaY: -9.5 }]) {
    const r = wheel(w, { ...props, target: hud, offsetX: 300, offsetY: 200 });
    assert.equal(r.prevented, false, 'the drawer or the dialog keeps its own scroll'); assert.deepEqual(w.cam, cam);
  }
  for (const t of ['gesturestart', 'gesturechange']) assert.equal(fire(w, t, { target: hud, scale: 1.4, clientX: 5, clientY: 5 }).prevented, false);
  assert.equal(w.cam.z, z); assert.equal(w.zin.pending, false);
  assert.equal(wheel(w, { deltaY: -100, target: w.cv, offsetX: 300, offsetY: 200 }).prevented, true, 'the canvas itself is still the canvas');
});

// ================================================================ the World: the ease
test('a notch eases in over a fraction of a second, driven by the world\'s own loop, and stops asking for frames when it lands', async () => {
  const { w } = await world(); w.running = true; w.vis = true; const z0 = w.cam.z;
  wheel(w, { deltaMode: 1, deltaY: -3, offsetX: 400, offsetY: 260 });
  assert.equal(w.cam.z, z0, 'the notch has not moved the camera yet'); assert.equal(w.zin.pending, true);
  let ts = 1000, sawMid = false; w.last = 0;
  for (let i = 0; i < 40; i++) {
    w.frame(ts += 40); // the loop's own step, at 25 frames a second
    if (w.cam.z > z0 * 1.01 && w.cam.z < z0 * MOUSE_STEP * 0.99) sawMid = true;
    if (!w.zin.pending) break;
  }
  assert.ok(sawMid, 'the zoom passed through the steps between'); near(w.cam.z, z0 * MOUSE_STEP, 1e-9); assert.equal(w.zin.pending, false);
  const at = w.cam.z; for (let i = 0; i < 10; i++) w.frame(ts += 40); assert.equal(w.cam.z, at, 'and then it stands still');
  w.stop();
});

test('under reduced motion a notch zooms at once, with no ease and nothing pending', async () => {
  const { w } = await world(); w.running = true; const z0 = w.cam.z, px = 200, py = 100, p = worldAt(w, px, py);
  document.documentElement.dataset.motion = 'reduce';
  try {
    wheel(w, { deltaMode: 1, deltaY: -3, offsetX: px, offsetY: py });
    assert.equal(w.zin.pending, false); near(w.cam.z, z0 * MOUSE_STEP, 1e-12, 'zoomed the moment the notch arrived');
    const [sx, sy] = screenOf(w, p); assert.ok(Math.abs(sx - px) < 1 && Math.abs(sy - py) < 1);
    // the system setting says the same
    document.documentElement.dataset.motion = 'auto'; globalThis.matchMedia = () => ({ matches: true }); w.mmFn = null; const z1 = w.cam.z;
    wheel(w, { deltaY: -100, offsetX: px, offsetY: py }); assert.equal(w.zin.pending, false); near(w.cam.z, z1 * MOUSE_STEP, 1e-12);
  } finally { document.documentElement.dataset.motion = 'auto'; globalThis.matchMedia = () => ({ matches: false }); w.mmFn = null; }
  // and turning it on in the middle of an ease lands the ease on the next step
  const m = await world(); m.w.running = true; wheel(m.w, { deltaY: -100, offsetX: 10, offsetY: 10 }); const z2 = m.w.cam.z; assert.ok(m.w.zin.pending);
  document.documentElement.dataset.motion = 'reduce'; try { m.w.update(1 / 60); } finally { document.documentElement.dataset.motion = 'auto'; }
  assert.equal(m.w.zin.pending, false); near(m.w.cam.z, z2 * MOUSE_STEP, 1e-12);
  // the loop of a world in reduced motion draws only on change: a pending ease must still wake it, or it would wait for the next unrelated redraw to arrive
  const k = await world(); k.w.running = true; k.w.vis = true; wheel(k.w, { deltaY: -100, offsetX: 10, offsetY: 10 }); const z3 = k.w.cam.z; assert.ok(k.w.zin.pending);
  document.documentElement.dataset.motion = 'reduce'; k.w.dirty = false; k.w.camTo = null; k.w.last = 0;
  try { k.w.frame(5000); } finally { document.documentElement.dataset.motion = 'auto'; k.w.stop(); }
  assert.equal(k.w.zin.pending, false, 'the loop ran the step'); near(k.w.cam.z, z3 * MOUSE_STEP, 1e-12);
});

test('with no loop running there is nothing to drive an ease, so a notch zooms at once rather than being left pending', async () => {
  const { w } = await world(); w.running = false; const z0 = w.cam.z;
  wheel(w, { deltaY: -100, offsetX: 300, offsetY: 200 }); assert.equal(w.zin.pending, false); near(w.cam.z, z0 * MOUSE_STEP, 1e-12);
  w.running = true; wheel(w, { deltaY: -100, offsetX: 300, offsetY: 200 }); assert.ok(w.zin.pending); w.stop(); assert.equal(w.zin.pending, false, 'stopping the world drops a pending ease');
});

test('the zoom range holds at both ends, for every kind of wheel, and the camera stays on the island', async () => {
  const { w } = await world(); w.running = true; const [lo, hi] = w.zoomRange(), b = w.bounds();
  for (let i = 0; i < 60; i++) wheel(w, { deltaMode: 1, deltaY: -3, offsetX: 700, offsetY: 480 }); settleWorld(w);
  assert.equal(w.cam.z, hi, 'notches up stop at the top'); assert.equal(w.zin.pending, false);
  for (let i = 0; i < 400; i++) wheel(w, { deltaY: -(90.5 * 0.97 ** i), offsetX: 700, offsetY: 480 }); assert.equal(w.cam.z, hi, 'a long scroll and its momentum tail stay at the top');
  for (let i = 0; i < 400; i++) wheel(w, { ctrlKey: true, deltaY: -(3.5 * 0.99 ** i), offsetX: 700, offsetY: 480 }); assert.equal(w.cam.z, hi);
  wheel(w, { deltaY: 5.5, offsetX: 700, offsetY: 480 }); assert.ok(w.cam.z < hi, 'and one step back moves at once');
  for (let i = 0; i < 80; i++) wheel(w, { deltaMode: 1, deltaY: 3, offsetX: 5, offsetY: 5 }); settleWorld(w);
  assert.equal(w.cam.z, lo, 'notches down stop at the bottom');
  for (let i = 0; i < 400; i++) wheel(w, { deltaY: 90.5 * 0.97 ** i, offsetX: 5, offsetY: 5 }); assert.equal(w.cam.z, lo);
  for (let i = 0; i < 400; i++) wheel(w, { ctrlKey: true, deltaY: 3.5, offsetX: 5, offsetY: 5 }); assert.equal(w.cam.z, lo);
  assert.ok(w.cam.x >= b.x0 && w.cam.x <= b.x1 && w.cam.y >= b.y0 && w.cam.y <= b.y1, 'on the island');
  // the range is read each time: another mode, another range
  w.mode = 'map'; const [mlo, mhi] = w.zoomRange(); for (let i = 0; i < 60; i++) wheel(w, { deltaMode: 1, deltaY: -3 }); settleWorld(w); assert.equal(w.cam.z, mhi); assert.ok(mhi < hi);
  void mlo;
});

test('a drag, a camera button, a key and a camera move each end a pending ease', async () => {
  const start = async () => { const { w } = await world(); w.running = true; wheel(w, { deltaMode: 1, deltaY: -3, offsetX: 400, offsetY: 260 }); w.update(1 / 60); assert.ok(w.zin.pending, 'an ease is on its way'); return w; };
  // a drag: pending once the pointer has moved past the click slop
  let w = await start(); press(w, 1, 400, 260); fire(w, 'pointermove', { pointerId: 1, offsetX: 402, offsetY: 261, clientX: 402, clientY: 261 });
  assert.ok(w.zin.pending, 'a click that has not moved is not a drag');
  fire(w, 'pointermove', { pointerId: 1, offsetX: 460, offsetY: 300, clientX: 460, clientY: 300 });
  assert.equal(w.zin.pending, false, 'the drag took the camera'); const z = w.cam.z; for (let i = 0; i < 30; i++) w.update(1 / 60); assert.equal(w.cam.z, z, 'the zoom stays where the drag found it');
  // a camera button (zoomBy is what worldview.js calls)
  w = await start(); w.zoomBy(1.25); assert.equal(w.zin.pending, false);
  const zb = w.cam.z; for (let i = 0; i < 30; i++) w.update(1 / 60); assert.equal(w.cam.z, zb);
  w = await start(); w.zoomBy(0.8); assert.equal(w.zin.pending, false);
  // the camera's own tween starts: Fit, Show me, a minimap click, a district change
  w = await start(); w.fit(true); assert.ok(w.camTo, 'the tween is running'); assert.equal(w.zin.pending, false);
  w = await start(); w.focusZone(2, true); assert.equal(w.zin.pending, false);
  w = await start(); w.goTo(0, 0, 1, false); assert.equal(w.zin.pending, false);
  // the keyboard
  w = await start(); fire(w, 'keydown', { key: 'ArrowLeft' }); assert.equal(w.zin.pending, false);
  w = await start(); fire(w, 'keydown', { key: '+' }); assert.equal(w.zin.pending, false);
  // a keystroke that does nothing to the camera leaves it
  w = await start(); fire(w, 'keydown', { key: 'q' }); assert.ok(w.zin.pending, 'a key the map does not use');
  // and another kind of wheel
  w = await start(); wheel(w, { ctrlKey: true, deltaY: -2.5, offsetX: 1, offsetY: 1 }); assert.equal(w.zin.pending, false);
});

// ================================================================ the World: one path for every zoom
test('the wheel, the keyboard, the camera buttons, a touch pinch and a gesture all zoom through the same function', async () => {
  const { w } = await world(); const calls = []; const real = w.zoomAbout.bind(w);
  w.zoomAbout = (z, px, py) => { calls.push([z, px, py]); return real(z, px, py); };
  const z0 = w.cam.z;
  wheel(w, { deltaY: -3.5, offsetX: 111, offsetY: 122 }); assert.equal(calls.length, 1); assert.deepEqual(calls[0].slice(1), [111, 122]);
  wheel(w, { ctrlKey: true, deltaY: -2.5, offsetX: 211, offsetY: 222 }); assert.equal(calls.length, 2);
  fire(w, 'keydown', { key: '+' }); assert.equal(calls.length, 3);
  fire(w, 'keydown', { key: '-' }); assert.equal(calls.length, 4);
  w.zoomBy(1.25); assert.equal(calls.length, 5, 'the camera buttons');
  fire(w, 'gesturestart', { scale: 1, clientX: 5, clientY: 5 }); fire(w, 'gesturechange', { scale: 1.2, clientX: 5, clientY: 5 }); assert.equal(calls.length, 6);
  press(w, 1, 100, 100); press(w, 2, 300, 100); fire(w, 'pointermove', { pointerId: 2, offsetX: 340, offsetY: 100, clientX: 340, clientY: 100 }); assert.ok(calls.length >= 7, 'a two-finger touch pinch');
  fire(w, 'pointerup', { pointerId: 2, offsetX: 340, offsetY: 100, button: 0 }); fire(w, 'pointerup', { pointerId: 1, offsetX: 100, offsetY: 100, button: 0 });
  w.running = true; wheel(w, { deltaMode: 1, deltaY: -3, offsetX: 1, offsetY: 2 }); const n = calls.length; w.update(1 / 60); assert.equal(calls.length, n + 1, 'and an ease step');
  w.stop(); void z0;
});

test('the buttons and keys keep their steps: +, - and the camera buttons jump by 1.2 and 1.25', async () => {
  const { w } = await world(); const z0 = w.cam.z;
  fire(w, 'keydown', { key: '+' }); near(w.cam.z, z0 * 1.2, 1e-12); fire(w, 'keydown', { key: '-' }); near(w.cam.z, z0, 1e-12);
  w.zoomBy(1.25); near(w.cam.z, z0 * 1.25, 1e-12); w.zoomBy(0.8); near(w.cam.z, z0, 1e-12);
});

test('the canvas says how to zoom: scroll or pinch, no longer Ctrl and scroll', async () => {
  const { w } = await world(); const label = w.cv.attrs['aria-label'];
  assert.match(label, /Drag to look around, scroll or pinch to zoom, arrow keys to pan\./); assert.ok(!/ctrl/i.test(label));
});
