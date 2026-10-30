// The sixth round's wiring half (docs/AUDIO.md Appendix I): what js/audio/wire.js does with the engine and the settings, through a page stand-in (a document that hands events to the listeners the
// wiring installs), the real engine under a fake clock and a recording fake context. Node only. The pure half of each item is in tests/audio-r6.test.mjs.
//   WA-1  a real game's mount starts a run and its unmount ends one; an Academy lesson's sandbox neither starts nor ends one
// Run: node --test tests/audio-r6-wire.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeContext, fakeClock } from './helpers/fakeaudio.mjs';

// ---------------------------------------------------------------- a page stand-in (before the app's modules are imported)
const listeners = new Map();
const fire = (type, ev) => { for (const fn of [...(listeners.get(type) || [])]) fn(ev); };
globalThis.innerWidth = 1000;
globalThis.addEventListener = () => {};
globalThis.document = {
  hidden: false,
  addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
  removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter((f) => f !== fn)); },
  getElementById: () => null,
  querySelectorAll: () => [],
  querySelector: () => null,
};

const { audio: page } = await import('../js/audio/instance.js');
const { createAudio } = await import('../js/audio/engine.js');
const { audioDefaults } = await import('../js/audio/settings.js');
const wire = await import('../js/audio/wire.js');
const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

// ---------------------------------------------------------------- the rig: an engine under a fake clock, standing in for the page's engine
const rngOf = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
/** Puts the real engine behind the page's `audio` (the wiring calls the singleton) and keeps a log of the two calls that end and start a run. */
function rig(settings = {}, { unlocked = true } = {}) {
  const ctx = fakeContext(), clk = fakeClock(), s = { ...audioDefaults(), ...settings };
  const E = createAudio({ get: () => s, now: clk.now, factory: () => ctx, timers: clk.timers_, random: rngOf(7), measure: false });
  if (unlocked) E.unlock();
  const log = [], calls = { unlock: 0, touch: 0 }, saved = {}, names = ['play', 'request', 'playMix', 'setEnv', 'hold', 'ambient', 'countUp', 'touch', 'release', 'newRun', 'sync', 'unlock', 'stopAll', 'setHidden'];
  for (const k of names) { saved[k] = page[k]; page[k] = (...a) => { if (k === 'release' || k === 'newRun') log.push(k); if (k in calls) calls[k]++; return E[k](...a); }; }
  const was = { env: Object.getOwnPropertyDescriptor(page, 'env'), state: Object.getOwnPropertyDescriptor(page, 'state'), supported: Object.getOwnPropertyDescriptor(page, 'supported'), perf: Object.getOwnPropertyDescriptor(globalThis, 'performance') };
  Object.defineProperty(page, 'env', { value: E.env, configurable: true, writable: true });
  Object.defineProperty(page, 'state', { get: () => E.state, configurable: true });
  Object.defineProperty(page, 'supported', { get: () => true, configurable: true });
  Object.defineProperty(globalThis, 'performance', { value: { now: clk.now }, configurable: true, writable: true });
  return {
    E, ctx, clk, s, log, calls,
    played: () => ({ ...E.stats().played }),
    /** Let the collector flush and the clock run for `ms`. */
    settle: (ms = 40) => clk.advance(ms),
    restore() {
      for (const k of names) page[k] = saved[k];
      for (const [k, d] of Object.entries(was)) { const target = k === 'perf' ? globalThis : page, name = k === 'perf' ? 'performance' : k; if (d) Object.defineProperty(target, name, d); else delete target[name]; }
    },
  };
}
/** Runs fn(rig) and always puts the page back. */
async function withRig(fn, settings, o) { const r = rig(settings, o); try { return await fn(r); } finally { r.restore(); } }

/**
 * The page-wide layer (initAudio) with stand-in deps, installed over the document stand-in: the settings object the page owns, a save, the announcements and toasts it made, and a key-value store.
 * Returns what it was asked and a way to put it away. The earlier listeners are dropped, so a test hears only its own.
 */
function install(settings = {}, over = {}) {
  listeners.clear(); wire._resetForTest();
  const store = new Map(), toasts = [], announced = [], saves = [];
  const kv = { get: (k) => (store.has(k) ? store.get(k) : null), set: (k, v) => { store.set(k, v); return true; }, del: (k) => { store.delete(k); } };
  const deps = { settings: { audio: { ...audioDefaults(), ...settings } }, save: () => saves.push(structuredClone(deps.settings.audio)), announce: (m, a) => announced.push([m, !!a]), toast: (m, l) => toasts.push([m, l]), kv, ...over };
  wire.initAudio(deps);
  return { deps, kv, store, toasts, announced, saves, a: () => deps.settings.audio, done() { listeners.clear(); wire._resetForTest(); } };
}

/** A game context as the shell gives it to wireGame: the event bus and the session's. `sandbox` makes it an Academy lesson's. */
function gameCtx({ sandbox = false, zone = 1 } = {}) {
  const ev = new Set(), ss = new Set(), game = { sandbox: sandbox ? { warnings: [] } : undefined, s: { hour: 0 }, netWorth: () => 10000 };
  const S = { game, clock: { paused: false, speed: 1, now: () => 0 }, roomInfo: null, on(fn) { ss.add(fn); return () => ss.delete(fn); }, emit(t, d) { for (const f of [...ss]) f(t, d); } };
  return { S, U: { zone }, g: () => game, on(fn) { ev.add(fn); return () => ev.delete(fn); }, emit(e) { for (const f of [...ev]) f(e); }, world: () => ({ night: 0 }), dlg: { el: { open: false } }, listeners: () => ev.size + ss.size };
}

// ================================================================================ WA-1: a run's resolver state
const lead = (c) => c.emit({ type: 'ui', ui: 'lead', ids: [1] }); // a buyer arrives (the shell's `ui` event): the door bell
const spendThree = (r, c) => { for (let i = 0; i < 3; i++) { lead(c); r.settle(3500); } };

test('WA-1: the second run\'s first three door bells ring, however soon after the first run\'s: the three that teach the cue belong to a run, not to the page', () => withRig((r) => {
  const bells = () => r.played()['buyer.arrive'] || 0;
  const run1 = gameCtx(), unwire1 = wire.wireGame(run1);
  spendThree(r, run1);
  assert.equal(bells(), 3, 'a run begins with three bells');
  lead(run1); r.settle(3500); assert.equal(bells(), 3, 'a fourth buyer, 10 s after the first, waits for the 30 s gap');
  unwire1();
  const run2 = gameCtx(), unwire2 = wire.wireGame(run2);
  spendThree(r, run2);
  assert.equal(bells(), 6, 'the next run, 14 s after the last bell of the first, begins with its own three (they were dropped as "budget": the first run had counted them)');
  lead(run2); r.settle(3500); assert.equal(bells(), 6, 'and its fourth waits for the 30 s as ever');
  unwire2();
}));
test('WA-1: a lesson of the Academy that has rung the bells does not take the real run\'s three: the real game\'s mount begins a run', () => withRig((r) => {
  const bells = () => r.played()['buyer.arrive'] || 0;
  const lesson = gameCtx({ sandbox: true }), unwireLesson = wire.wireGame(lesson);
  spendThree(r, lesson); unwireLesson();
  assert.equal(bells(), 3, 'a lesson rings its bells (buyer.arrive is not one of the rewards it rehearses in silence)');
  const real = gameCtx(), unwire = wire.wireGame(real);
  spendThree(r, real);
  assert.equal(bells(), 6, 'the real game\'s own three ring, 3.5 s after the lesson\'s last');
  unwire();
}));
test('WA-1: a coin held under a dialog of one real game does not ring at the first dialog of the next: leaving the game takes it with it', () => withRig((r) => {
  const coins = () => (r.played()['cash.in'] || 0) + (r.played()['cash.out'] || 0);
  const run1 = gameCtx(), unwire1 = wire.wireGame(run1);
  page.hold(true);
  run1.emit({ type: 'cycle', zone: 1, net: 4000 }); run1.emit({ type: 'cycle', zone: 1, net: 2500 }); r.settle(60);
  assert.equal(coins(), 0, 'held under the dialog');
  page.hold(false); r.settle(60);
  assert.equal(coins(), 1, 'the control: closed in the same game, the dialog lets the one summed coin out');
  r.settle(5000); // (long after the coin's own cooldown: a second coin that is held back must be held back by the fix, not by that)
  page.hold(true); run1.emit({ type: 'cycle', zone: 1, net: 4000 }); r.settle(60);
  unwire1(); // the player goes to the debrief while a dialog is open: the sheet is gone with the game
  const run2 = gameCtx(), unwire2 = wire.wireGame(run2);
  page.hold(true); page.hold(false); r.settle(60);
  assert.equal(coins(), 1, 'the next game\'s first dialog plays nothing (it rang the other run\'s money as a coin)');
  unwire2();
}));
test('WA-1: an Academy sandbox neither starts a run nor ends one: its mount and its unmount leave a real run\'s state alone', () => withRig((r) => {
  const bells = () => r.played()['buyer.arrive'] || 0;
  const real = gameCtx(), unwire = wire.wireGame(real);
  assert.deepEqual(r.log, ['newRun'], 'a real game\'s mount starts a run');
  spendThree(r, real);
  const lesson = gameCtx({ sandbox: true }), unwireLesson = wire.wireGame(lesson);
  assert.deepEqual(r.log, ['newRun'], 'a sandbox mounted beside it does not');
  unwireLesson();
  assert.deepEqual(r.log, ['newRun', 'release'], 'and leaves as it always did, with the engine released (its sounds fade), but no run ended');
  lead(real); r.settle(3500);
  assert.equal(bells(), 3, 'the real run still counts its three: a fourth, 10 s after the first, waits');
  unwire();
  assert.deepEqual(r.log, ['newRun', 'release', 'release', 'newRun'], 'the real game that is left ends its run');
}));
test('WA-1: wire.js starts a run for a game that is not a sandbox only, and only through the engine\'s own newRun (a page without one still wires)', () => {
  const s = src('js/audio/wire.js'), i = s.indexOf('export function wireGame'), body = s.slice(i, s.indexOf('export function wireAudio'));
  assert.equal((body.match(/audio\.newRun\?\.\(\)/g) || []).length, 2, 'once at the mount and once at the unmount');
  assert.equal((body.match(/if \(!sandboxed\) audio\.newRun\?\.\(\)/g) || []).length, 2, 'both for a real game only');
  const saved = page.newRun; page.newRun = undefined;
  try { const un = wire.wireGame(gameCtx()); un(); } finally { page.newRun = saved; }
});

// ================================================================================ UX1: a bare click is a gesture
/** A control as the table reads it (the few properties js/audio/wire.js asks of a button). */
function button(act = 'solo') {
  const e = {
    tagName: 'BUTTON', dataset: { act }, type: undefined, value: '', checked: false, textContent: '', parentElement: null, disabled: false, isContentEditable: false,
    classList: { contains: (c) => c === 'btn' }, getAttribute: () => null, hasAttribute: () => false, matches: () => false,
    closest: (sel) => (sel.includes('button, [data-act]') ? e : null),
  };
  return e;
}
test('UX1: a bare trusted click creates the context, as a screen reader, a voice-control program or a switch presses a button; a script-made click and the keys that are no activation do not', () => withRig((r) => {
  const p = install(), target = button();
  fire('click', { type: 'click', isTrusted: false, target }); fire('pointerup', { type: 'pointerup', isTrusted: false, target });
  fire('keydown', { type: 'keydown', key: 'Escape', target }); fire('keydown', { type: 'keydown', key: 'Shift', target });
  assert.equal(r.E.state, 'locked', 'a script\'s click, a script\'s pointerup, Escape and a bare modifier: no gesture');
  assert.equal(r.calls.unlock, 0); assert.equal(p.toasts.length, 0, 'and no note about sound either');
  fire('click', { type: 'click', isTrusted: true, target });
  assert.equal(r.E.state, 'running', 'a trusted click with no pointer or key event before it is a gesture');
  assert.equal(r.calls.unlock, 1);
  r.settle(200);
  assert.equal(r.played()['ui.tick'], 1, 'and that same press plays its tick (the first sound of the page, 160 ms in)');
  assert.equal(p.toasts.length, 1, 'the player who pressed that way is told about sound once, as any other is (7.4)');
  p.done();
}, {}, { unlocked: false }));
test('UX1: pointerup, the activation of a touch or a pen, creates the context too, once; the events that follow it ask for nothing more', () => withRig((r) => {
  const p = install(), target = button();
  fire('pointerup', { type: 'pointerup', pointerType: 'pen', isTrusted: true, target });
  assert.equal(r.E.state, 'running'); assert.equal(r.calls.unlock, 1);
  fire('click', { type: 'click', isTrusted: true, target }); fire('pointerup', { type: 'pointerup', isTrusted: true, target }); fire('pointerdown', { type: 'pointerdown', isTrusted: true, target });
  assert.equal(r.calls.unlock, 1, 'a context that runs is not asked again by every pointerup and click');
  p.done();
}, {}, { unlocked: false }));
test('UX1: the gesture events are the five of UNLOCK_EVENTS, each listened to once on the document, and the script-made rule stays', () => {
  const p = install();
  assert.deepEqual(wire.UNLOCK_EVENTS, ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click']);
  for (const t of wire.UNLOCK_EVENTS) assert.ok((listeners.get(t) || []).length >= 1, `${t} is listened to`);
  const s = src('js/audio/wire.js');
  assert.match(s, /if \(e\.isTrusted === false\) return;/, 'the rule of B2 (a script-made event is no gesture) is still the first line of the listener');
  assert.match(s, /for \(const t of UNLOCK_EVENTS\) document\.addEventListener\(t, unlock, opts\);/);
  p.done();
});

// ================================================================================ UX3: a link that is opened, with the real wiring
const S = await import('../js/audio/settings.js');
/** A page that booted on an instructor's link (what common.js does: remember the rule the address applies, then read the settings through the address). */
function onLink(search) {
  const p = install(), saved = { audio: { ...audioDefaults(), master: 80, v: 1 } };
  wire.rememberLinkRule(p.kv, saved, search); p.deps.settings.audio = S.migrateAudio(saved, search);
  p.before = S.migrateAudio(saved, '');
  return p;
}
for (const [link, muted] of [['&sound=quiet', false], ['&sound=off', true]]) {
  test(`UX3: a student who opens a ${link.slice(7)} link and never joins gets their own sound back at the first screen that is not the room's (a solo game)`, () => withRig(() => {
    const p = onLink('?room=ABCD' + link);
    assert.deepEqual([p.a().quiet, p.a().mute], [true, muted], 'the title is the link\'s: the instructor asked for it from the first screen');
    const un = wire.wireGame(gameCtx()); // a game with no room: the first screen that is not the room's
    assert.deepEqual(p.a(), p.before, 'exactly the sound they had'); assert.equal(p.kv.get(wire.BEFORE_ROOM), null);
    assert.equal(p.toasts.length, 1, 'with one note'); assert.match(p.toasts[0][0], muted ? /^Sound is back to Full: the room turned it off only while you were in it\.$/ : /^Sound is back to Full: Classroom sound applies only in a room\.$/);
    un(); p.done();
  }));
  test(`UX3: and at the Draft of a solo run (pendingRoom with no room); in a room the game leaves the link's rule alone, and the tick that finds the room gone gives it back`, () => withRig(() => {
    const solo = onLink('?room=ABCD' + link);
    assert.equal(wire.pendingRoom(undefined, solo.deps), 'left'); assert.deepEqual(solo.a(), solo.before); solo.done();
    const p = onLink('?room=ABCD' + link), ctx = gameCtx(); ctx.S.roomInfo = { code: 'ABCD', role: 'student' };
    const un = wire.wireGame(ctx);
    assert.deepEqual([p.a().quiet, p.a().mute], [true, muted], 'in the room: the rule stays, nothing more is said'); assert.equal(p.toasts.length, 0);
    ctx.S.roomInfo = null; ctx.S.emit('tick', {});
    assert.deepEqual(p.a(), p.before, 'the room is gone: the sound is back'); assert.equal(p.toasts.length, 1);
    un(); p.done();
  }));
}
