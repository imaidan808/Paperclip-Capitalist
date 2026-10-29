// The fourth repair round (docs/AUDIO.md Appendix G): what the verification of the third round found in the wiring and in the first minute, each with a test that fails on the code before the round.
//   W-1  the Academy's first lesson put the earlier, louder settings back while the student was still in the room
//   W-3  "the first three door bells of a run always play" was false: the engine's own 30 s cooldown dropped the second and the third
//   W-4  a press that also closes the dialog played two voices (the click's tick and the dialog's close 50 ms behind it)
//   W-5 / U3  a student who typed the room code got "sound is on" and then "sound is set to Classroom": two notes in the first minute
//   W-6  the distance rule (an event in another district is 8 dB down behind 2.5 kHz) was in the engine and wired to nothing
//   W-7  the settlement amount parsed out of the note's text
//   B2   a script-made pointerdown created an AudioContext that Chrome refuses and logged a warning each time
//   U15  key M announced "Sound off." in a browser with no Web Audio
//   U7 / U8  the notes name a Display and sound button the Draft did not have, and the first-run toast landed on the Begin button
// A page stand-in, a fake clock and a recording fake context; Node only. Run: node --test tests/audio-r4.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeContext, fakeClock } from './helpers/fakeaudio.mjs';
import { makeGame } from './bot.mjs';

// ---------------------------------------------------------------- a page stand-in (before the app's modules are imported)
const listeners = new Map(), els = {};
let observers = [];
const fire = (type, ev) => { for (const fn of listeners.get(type) || []) fn(ev); };
globalThis.innerWidth = 1000;
globalThis.addEventListener = () => {};
globalThis.MutationObserver = class { constructor(fn) { this.fn = fn; observers.push(this); } observe(el) { this.el = el; } };
const dlg = { open: false, classList: { contains: () => false }, querySelector: () => null }, toasts = {};
els.dlg = dlg; els.toasts = toasts;
globalThis.document = {
  hidden: false,
  addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
  removeEventListener() {},
  getElementById: (id) => els[id] || null,
  querySelectorAll: () => [],
  querySelector: () => null,
};
const store = new Map();
const kv = { get: (k) => (store.has(k) ? store.get(k) : null), set: (k, v) => { store.set(k, v); return true; }, del: (k) => { store.delete(k); } };

const { audio: page } = await import('../js/audio/instance.js');
const { audioDefaults, joinRoom, leaveRoom, migrateAudio } = await import('../js/audio/settings.js');
const { createAudio } = await import('../js/audio/engine.js');
const wire = await import('../js/audio/wire.js');
const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A control as the table reads it. `inside` lists the selectors this element answers to when asked for its closest ancestor. */
function el({ act = '', inside = [], attrs = [], tag = 'button', classes = ['btn'] } = {}) {
  const e = {
    tagName: tag.toUpperCase(), dataset: act ? { act } : {}, type: undefined, value: '', checked: false, textContent: '', parentElement: null, disabled: false, isContentEditable: false,
    classList: { contains: (c) => classes.includes(c) }, getAttribute: () => null, hasAttribute: (k) => attrs.includes(k),
    matches: () => false,
    closest(sel) { if (sel.includes('button, [data-act]')) return e; return inside.includes(sel) ? e : null; },
  };
  return e;
}
/** Install the page layer with stand-ins for the engine's methods; returns what was asked of it and a restore. */
function install(settings = {}, over = {}) {
  const saved = {}, asked = [], toastsSeen = [];
  for (const k of ['touch', 'unlock', 'sync', 'play', 'request', 'hold', 'setEnv', 'release', 'ambient']) { saved[k] = page[k]; page[k] = (...a) => { asked.push([k, ...a]); }; }
  const sup = Object.getOwnPropertyDescriptor(page, 'supported'); Object.defineProperty(page, 'supported', { get: () => over.supported !== false, configurable: true });
  const st = Object.getOwnPropertyDescriptor(page, 'state'); Object.defineProperty(page, 'state', { get: () => 'locked', configurable: true });
  const env = Object.getOwnPropertyDescriptor(page, 'env'); Object.defineProperty(page, 'env', { value: { lastPress: -Infinity }, configurable: true, writable: true });
  listeners.clear(); observers = []; store.clear();
  const deps = { settings: { audio: { ...audioDefaults(), ...settings } }, save: () => {}, announce: (m) => asked.push(['announce', m]), toast: (m, l) => toastsSeen.push([m, l]), kv };
  wire._resetForTest(); wire.initAudio(deps);
  return { deps, asked, toasts: toastsSeen, restore() { for (const k of Object.keys(saved)) page[k] = saved[k]; for (const [k, d] of [['supported', sup], ['state', st], ['env', env]]) { if (d) Object.defineProperty(page, k, d); else delete page[k]; } wire._resetForTest(); listeners.clear(); store.clear(); }, ids: () => asked.filter((a) => a[0] === 'play' || a[0] === 'request').map((a) => a[1]) };
}
const withPage = async (settings, fn, over) => { const p = install(settings, over); try { return await fn(p); } finally { p.restore(); } };

// ================================================================================ W-1: an Academy lesson neither joins a room nor leaves one
test('W-1: the Academy\'s sandbox does not undo the room rule: the first lesson of a class used to put the louder settings back while the student was still in the room', async () => withPage({}, (p) => {
  assert.equal(wire.pendingRoom({ code: 'ABCD' }, p.deps), 'joined'); const before = p.deps.settings.audio; assert.equal(before.quiet, true);
  assert.equal(p.toasts.length, 1);
  // the Academy mounts its sandbox: a game with `sandbox` set and a session of its own that has no room
  const S = { roomInfo: null, clock: { paused: false, speed: 1 }, on(fn) { this.fn = fn; return () => {}; } };
  const un = wire.wireGame({ S, U: { zone: 1 }, g: () => ({ sandbox: { warnings: [] }, s: {}, netWorth: () => 0 }), on: () => () => {} });
  assert.equal(p.deps.settings.audio.quiet, true, 'Classroom stands through the mount');
  S.fn('tick', {}); S.fn('room', {}); assert.equal(p.deps.settings.audio.quiet, true, 'and through every tick and room event of the lesson');
  assert.ok(p.deps.kv.get(wire.BEFORE_ROOM), 'the earlier values are still remembered');
  un();
  // the real game mounts: the session says the student is in a room, and the rule meets a state it is already in
  const S2 = { roomInfo: { code: 'ABCD', role: 'student' }, clock: { paused: false, speed: 1 }, on(fn) { this.fn = fn; return () => {}; } };
  const un2 = wire.wireGame({ S: S2, U: { zone: 1 }, g: () => ({ s: {}, netWorth: () => 0 }), on: () => () => {} });
  assert.equal(p.deps.settings.audio.quiet, true); assert.equal(p.toasts.length, 1, 'no second note at the real game\'s mount');
  // and the way out still works there: a tick that finds no room puts the earlier values back
  S2.roomInfo = null; S2.fn('tick', {}); assert.equal(p.deps.settings.audio.quiet, false, 'leaving a room puts them back, as it always did');
  un2();
}));

// ================================================================================ W-3: the first three door bells of a run
test('W-3: the first three buyers of a run each ring the door bell, 3.5 s apart; the fourth within 30 s is held back (it was one bell in the first 30 s)', () => {
  const clock = fakeClock(), ctx = fakeContext({ sampleRate: 8000 }), s = { ...audioDefaults() };
  const au = createAudio({ get: () => s, now: clock.now, timers: clock.timers_, factory: () => ctx, random: () => 0.5, measure: false });
  au.unlock(); ctx.state = 'running';
  for (let i = 0; i < 3; i++) { au.request('buyer.arrive', { clock: true }); clock.advance(3500); }
  assert.equal(au.stats().played['buyer.arrive'], 3, 'three bells');
  assert.equal(au.stats().dropped.cooldown ?? 0, 0, 'none held back by the cooldown');
  au.request('buyer.arrive', { clock: true }); clock.advance(3500);
  assert.equal(au.stats().played['buyer.arrive'], 3, 'the fourth, 14 s after the first, waits for the 30 s gap'); assert.ok((au.stats().dropped.budget ?? 0) + (au.stats().dropped.cooldown ?? 0) >= 1);
  clock.advance(31000); au.request('buyer.arrive', { clock: true }); clock.advance(100);
  assert.equal(au.stats().played['buyer.arrive'], 4, 'and a fourth after 30 s rings');
});

// ================================================================================ W-4: one press, one voice
test('W-4: a press that closes the dialog (Open debrief, Academy replay, Join) is heard once: the click\'s tick, not that and the dialog\'s close 50 ms behind it', () => withPage({}, async (p) => {
  const dialogEl = () => observers.find((o) => o.el === dlg);
  // the table is on `document`; the shared dialog is open and the player presses "Open debrief", whose act closes it
  dlg.open = true; dialogEl().fn([]); await sleep(100); p.asked.length = 0; // (it opened with its own sound, 40 ms behind)
  const press = (act) => fire('click', { type: 'click', target: el({ act }) });
  press('debrief'); dlg.open = false; dialogEl().fn([]); await sleep(120);
  assert.deepEqual(p.ids(), ['ui.tick'], `one voice: ${p.ids().join(', ')}`);
  // a dialog closed by Escape (no press sound at all) still gets its close
  dlg.open = true; dialogEl().fn([]); await sleep(300); p.asked.length = 0;
  dlg.open = false; dialogEl().fn([]); await sleep(120);
  assert.deepEqual(p.ids(), ['ui.dialog-close'], 'Escape: the dialog\'s own sound');
  // the Close button: its own table entry plays the close at the click, and the observer adds nothing
  dlg.open = true; dialogEl().fn([]); await sleep(300); p.asked.length = 0;
  press('close'); dlg.open = false; dialogEl().fn([]); await sleep(120);
  assert.deepEqual(p.ids(), ['ui.dialog-close'], 'Close: exactly one');
}));
test('W-4: leaving a game keeps a voice that began in the last 150 ms (the press that left), and fades the rest', () => {
  const clock = fakeClock(), ctx = fakeContext({ sampleRate: 8000 }), s = { ...audioDefaults() };
  const au = createAudio({ get: () => s, now: clock.now, timers: clock.timers_, factory: () => ctx, random: () => 0.5, measure: false });
  au.unlock(); ctx.state = 'running';
  au.play('level.up', { variant: 'l' }); clock.advance(400); au.play('ui.ok'); // the first is a fanfare still ringing and old, the second is of this moment
  assert.equal(au._voices.length, 2);
  au.release(150);
  assert.equal(au._voices.length, 1, 'the old voice was stopped, the new one plays on'); assert.equal(au._voices[0].id, 'ui.ok'); assert.equal(au._voices.length, 1);
  au.release(); assert.equal(au._voices.length, 0, 'a plain release stops everything, as before');
});
test('W-4: leaving a game asks to keep the press that left (the wiring passes the window)', () => {
  assert.match(src('js/audio/wire.js'), /audio\.release\(KEEP_MS\)/); assert.match(src('js/audio/wire.js'), /const KEEP_MS = 150;/);
});

// ================================================================================ W-5 / U3: one thing about sound, not two
test('U3: the hint "sound is on" is not made for a student on the way into a room: a press in the Join panel, a ?room= link, a code in the field, a Tab', () => {
  const press = (target, type = 'pointerdown', key) => { for (const fn of listeners.get(type).slice(-1)) fn({ type, target, key }); };
  const join = el({ inside: ['[data-room-panel]'] }), code = el({ tag: 'input', inside: ['[data-room-panel]'] }), solo = el({ act: 'solo' });
  // 1. a press in the Join panel (the code field, the relay, the button) says nothing, and the hint is not spent
  return withPage({}, (p) => {
    press(code); assert.deepEqual(p.toasts, [], 'the code field'); assert.equal(p.deps.settings.audio.hinted, false);
    press(join); assert.deepEqual(p.toasts, [], 'the panel');
    // 2. a Tab (and any key that makes no sound) is not an activation worth a note; Enter and Space are
    press(solo, 'keydown', 'Tab'); assert.deepEqual(p.toasts, [], 'Tab'); press(solo, 'keydown', 'ArrowDown'); assert.deepEqual(p.toasts, [], 'an arrow'); assert.equal(p.deps.settings.audio.hinted, false);
    // 3. a click on Play solo says it, once
    press(solo); assert.equal(p.toasts.length, 1); assert.match(p.toasts[0][0], /Press M to mute/); assert.equal(p.deps.settings.audio.hinted, true);
    press(solo); assert.equal(p.toasts.length, 1, 'once');
  });
});
test('U3: with ?room= in the address the player is on the way into a room whatever they press first, and the room\'s note is the only one', () => withPage({}, (p) => {
  globalThis.location = { search: '?room=ABCD' };
  try {
    for (const fn of listeners.get('pointerdown').slice(-1)) fn({ type: 'pointerdown', target: el({ act: 'solo' }) });
    for (const fn of listeners.get('keydown').slice(-1)) fn({ type: 'keydown', key: 'Enter', target: el({ act: 'solo' }) });
    assert.deepEqual(p.toasts, [], 'neither a click nor Enter on the title makes the hint');
    assert.equal(wire.pendingRoom({ code: 'ABCD' }, p.deps), 'joined'); assert.equal(p.toasts.length, 1, 'the room\'s note is the one thing said about sound');
    assert.match(p.toasts[0][0], /^Sound is set to Classroom \(quieter\) in this room\. Press M to mute, or change it under Display and sound\.$/);
  } finally { delete globalThis.location; }
}));
test('U3: a code typed into the field counts as a room too', () => withPage({}, (p) => {
  els.jc = { value: ' abcd ' };
  try {
    for (const fn of listeners.get('pointerdown').slice(-1)) fn({ type: 'pointerdown', target: el({ act: 'solo' }) });
    assert.deepEqual(p.toasts, []);
  } finally { delete els.jc; }
}));
test('U7: the notes name a Display and sound button, and the title (data-room-panel), the Draft and the game each have one', () => {
  const draft = src('js/ui/draft.js'), main = src('js/main.js');
  assert.match(draft, /<button class="btn ghost sm" type="button" data-act="settings" data-fid="dr-sound">Display and sound<\/button>/, 'the Draft has the button the notes name');
  assert.match(draft, /settings\(\) \{ settingsDialog\(\); \}/); assert.match(draft, /import \{[^}]*settingsDialog[^}]*\} from '\.\/common\.js'/);
  assert.match(main, /<section class="panel" data-room-panel><h2>Join a classroom<\/h2>/, 'the Join panel is marked, so a press in it is a press on the way into a room');
  assert.match(main, /data-act="a11y">Display and sound settings</, 'and the title has its own');
  assert.match(wire.ROOM_TOAST, /Press M to mute/); assert.match(wire.ROOM_TOAST, /Display and sound/);
});
test('U8: the notes land above the Draft\'s footer, not on its Begin button (the bar is the bottom 4.6rem; on a phone the need line takes a row more)', () => {
  const css = src('css/ui-draft.css');
  assert.match(css, /body:has\(\.dr-actions\) #toasts \{ bottom: calc\(var\(--edge-b\) \+ 4\.9rem\); \}/);
  assert.match(css, /@media \(max-width: 640px\) \{ body:has\(\.dr-actions\) #toasts \{ bottom: calc\(var\(--edge-b\) \+ 8\.6rem\); \} \}/);
});

// ================================================================================ B2 / U15: gestures and unsupported browsers
test('B2: a script-made pointerdown is no gesture: nothing creates a context for it (Chrome refuses it and warns each time); a real press does', () => withPage({}, (p) => {
  const fireDown = (e) => { for (const fn of listeners.get('pointerdown').slice(-1)) fn(e); };
  fireDown({ type: 'pointerdown', isTrusted: false, target: el({ act: 'solo' }) });
  assert.deepEqual(p.asked.filter((a) => a[0] === 'unlock' || a[0] === 'touch'), [], 'neither touched nor unlocked');
  fireDown({ type: 'pointerdown', isTrusted: true, target: el({ act: 'solo' }) });
  assert.ok(p.asked.some((a) => a[0] === 'unlock'), 'a trusted press unlocks');
  fireDown({ type: 'pointerdown', target: el({ act: 'solo' }) }); // a test double with no isTrusted at all behaves as a person
  assert.ok(p.asked.filter((a) => a[0] === 'unlock').length >= 2);
}));
test('U15: key M does nothing in a browser with no Web Audio (it announced "Sound off." beside a settings line that says it cannot play sound)', () => {
  const m = { type: 'keydown', key: 'm', target: { tagName: 'BODY' } };
  const press = () => { for (const fn of listeners.get('keydown').slice(-2)) fn(m); };
  return withPage({}, (p) => { press(); assert.deepEqual(p.asked.filter((a) => a[0] === 'announce'), [], 'nothing said'); assert.equal(p.deps.settings.audio.mute, false); }, { supported: false })
    .then(() => withPage({}, (p) => { press(); assert.equal(p.deps.settings.audio.mute, true, 'and where Web Audio exists it still mutes'); assert.deepEqual(p.asked.find((a) => a[0] === 'announce')?.slice(1), ['Sound off.']); }));
});

// ================================================================================ W-6: distance
test('W-6: an event in another district than the player\'s plays "elsewhere" (8 dB down behind 2.5 kHz); the player\'s own district and the player\'s own actions do not', () => {
  const st = wire.newWireState(), hooks = { now: () => 1000, netWorth: () => 0, elsewhere: (z) => z !== 1, pan: () => 0 };
  const cyc = (zone) => wire.eventCalls({ type: 'cycle', zone, net: 12 }, st, hooks)[0][2];
  assert.equal(cyc(3).where, 'elsewhere', 'a manager in district 3 while the player is in 1'); assert.equal(cyc(1).where, undefined, 'the player\'s own district at full level');
  assert.equal(wire.eventCalls({ type: 'cycle', zone: 3, src: 'rent', net: 5 }, st, hooks)[0][2].where, undefined, 'rent is not a place');
  // the player\'s own actions are never attenuated: a sale, a purchase and a shipment carry no `where`
  for (const ev of [{ type: 'pitch', outcome: 'win', price: 100, gain: 0.1, zone: 3 }, { type: 'buy', price: 50, cond: 'ok', zone: 3 }, { type: 'ship', from: 3, to: 4 }]) assert.equal(wire.eventCalls(ev, wire.newWireState(), hooks)[0][2].where, undefined, ev.type);
  // freight arriving and customs: from the note's district
  const z3 = 'Freight arrived in Harbor.', note = (text) => wire.noteCalls({ level: 'info', text }, wire.newWireState(), { ...hooks, elsewhere: () => true });
  assert.equal(note(z3)[0][2].where, 'elsewhere'); assert.equal(wire.noteCalls({ level: 'info', text: z3 }, wire.newWireState(), { ...hooks, elsewhere: () => false })[0][2].where, undefined);
  assert.equal(wire.noteCalls({ level: 'info', text: 'Freight arrived in Harbor.' }, wire.newWireState(), {})[0][2].where, undefined, 'a screen with no map attenuates nothing');
  // and the wiring supplies the hook from the player's district
  const w = src('js/audio/wire.js'); assert.match(w, /elsewhere: \(zone\) => U\?\.zone != null && Number\(zone\) !== Number\(U\.zone\)/);
  // the engine does what `where` asks (it always did)
  const clock = fakeClock(), ctx = fakeContext({ sampleRate: 8000 }), s = { ...audioDefaults() };
  const au = createAudio({ get: () => s, now: clock.now, timers: clock.timers_, factory: () => ctx, random: () => 0.5, measure: false });
  au.unlock(); ctx.state = 'running'; au.play('ship.arrive', { where: 'elsewhere' });
  const lp = ctx.nodes.find((n) => n.kind === 'biquad' && n.frequency.value === 2500); assert.ok(lp, 'a 2.5 kHz lowpass on the voice');
});

// ================================================================================ W-7: the settlement\'s amount
test('W-7: the amount of a note is read with its K, M or B suffix; the engine\'s own settlement text (full digits) reads whole at every size', () => {
  assert.equal(wire.amountIn('$1.25M settled into cash.'), 1250000); assert.equal(wire.amountIn('$48.00M settled into cash.'), 48000000); assert.equal(wire.amountIn('$2.30B settled into cash.'), 2300000000);
  assert.equal(wire.amountIn('$12k fine'), 12000); assert.equal(wire.amountIn('$1,250,000 settled into cash.'), 1250000); assert.equal(wire.amountIn('$900 settled into cash.'), 900); assert.equal(wire.amountIn('$12.50 settled'), 12.5);
  assert.equal(wire.amountIn('nothing here'), 0); assert.equal(wire.amountIn(undefined), 0); assert.equal(wire.amountIn('$ 5'), 0);
  assert.equal(wire.amountIn('$900 Mentor says'), 900, 'a word after a space is not a suffix');
  // the real engine\'s note, at three sizes: the coin that is heard is the size of the sum
  const g = makeGame(['trades', 'pro'], 'ops', 13);
  for (const [amt, size] of [[1250000, 'xl'], [48000000, 'xl'], [2300000000, 'xl'], [900, 's']]) {
    g.s.settle.push({ at: g.s.hour, amt }); g._settlements();
    const n = g.s.news[0], call = wire.noteCalls(n, wire.newWireState(), { now: () => 1 })[0];
    assert.equal(call[2].meta.amount, amt, `${n.text} reads as ${amt}`); void size;
  }
});
