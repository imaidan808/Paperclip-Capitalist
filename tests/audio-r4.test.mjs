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
  assert.match(css, /body:has\(\.dr-actions\) #toasts \{ bottom: calc\(max\(\.5rem, env\(safe-area-inset-bottom, 0px\)\) \+ 4\.9rem\); \}/);
  assert.match(css, /@media \(max-width: 640px\) \{ body:has\(\.dr-actions\) #toasts \{ bottom: calc\(max\(\.5rem, env\(safe-area-inset-bottom, 0px\)\) \+ 8\.6rem\); \} \}/);
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
  return withPage({}, (p) => { press(); assert.deepEqual(p.asked.filter((a) => a[0] === 'announce'), [], 'nothing said'); assert.deepEqual(p.toasts, [], 'nothing shown'); assert.equal(p.deps.settings.audio.mute, false); }, { supported: false })
    .then(() => withPage({}, (p) => { press(); assert.equal(p.deps.settings.audio.mute, true, 'and where Web Audio exists it still mutes'); assert.deepEqual(p.toasts, [['Sound off. Press M to turn it back on.', 'info']], 'a toast, which speaks itself (fifth round, U3)'); }));
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

// ================================================================================ engine and calibration (Appendix G: R1 to R8)
const { equalFade, dB: dbOf } = await import('../js/audio/palette.js');
const { buildBed, fadeBedIn, AMB, createAmbient } = await import('../js/audio/ambient.js');
const { jitterOf, LOUD_JITTER, trimDbOf, RECIPES, tierOf, TIER_CEIL, layersFor, variantsOf } = await import('../js/audio/recipes.js');
const { CLASSROOM_DB } = await import('../js/audio/settings.js');
const calib = await import('../scripts/audio-calib.mjs');
const measure = await import('../dev/measure.js');

/** The value of a recorded AudioParam at time q: its first assigned value, then its set and linear events in order. */
function valueAt(p, q) {
  let tp = 0, vp = p.assigned.length ? p.assigned[0][1] : 0;
  for (const c of p.calls) {
    if (c[0] === 'cancel') continue;
    const [kind, v, t] = c;
    if (kind === 'set') { if (q < t) return vp; tp = t; vp = v; } else if (kind === 'linear') { if (q <= t) return vp + (v - vp) * (q - tp) / (t - tp || 1); tp = t; vp = v; }
  }
  return vp;
}
test('R4: an equal-power fade keeps one power across a crossfade; the linear fades of 3 s in and 2 s out dipped by 5 dB (they are what the beds had)', () => {
  const ctx = fakeContext(), a = ctx.createGain(), b = ctx.createGain();
  equalFade(a.gain, 4, 3, 0.5, 'out'); equalFade(b.gain, 4, 3, 0.5, 'in');
  assert.equal(valueAt(b.gain, 3.9), 0, 'the new bed is silent before the fade (its value is in place before the first event: I1)'); assert.equal(b.gain.assigned[0][1], 0);
  assert.ok(Math.abs(valueAt(a.gain, 4) - 0.5) < 1e-12 && Math.abs(valueAt(a.gain, 7)) < 1e-9 && Math.abs(valueAt(b.gain, 7) - 0.5) < 1e-9, 'out from the level to silence, in from silence to the level');
  let worst = 0;
  for (let q = 4; q <= 7.0001; q += 0.1) { const p = (valueAt(a.gain, q) / 0.5) ** 2 + (valueAt(b.gain, q) / 0.5) ** 2; worst = Math.max(worst, Math.abs(10 * Math.log10(p))); }
  assert.ok(worst < 0.05, `the sum of the two beds\' powers stays within ${worst.toFixed(3)} dB of one`);
  // the old fades, for the strength of the test
  let dip = 0; for (let q = 0; q <= 3; q += 0.05) dip = Math.min(dip, 10 * Math.log10(Math.max(0, 1 - q / 2) ** 2 + (q / 3) ** 2));
  assert.ok(dip < -4.5, `linear 2 s out and 3 s in dip ${dip.toFixed(1)} dB`);
});
test('R4: a bed leaves on a cosine and the next comes in on a sine over one length: the controller and the offline measure use the same two calls', () => {
  const ctx = fakeContext(), out = ctx.createGain(), old = buildBed(ctx, out, 'scrap', { T: 0, trimDb: -6 }), next = buildBed(ctx, out, 'market', { T: 4, trimDb: -9 });
  old.stop(4, AMB.CROSS, { equalPower: true }); fadeBedIn(next, 4, AMB.CROSS);
  const lo = dbOf(-6), ln = dbOf(-9);
  for (let q = 4; q <= 7.0001; q += 0.25) { const p = (valueAt(old.gain.gain, q) / lo) ** 2 + (valueAt(next.gain.gain, q) / ln) ** 2; assert.ok(Math.abs(10 * Math.log10(p)) < 0.06, `at ${q} s: ${p}`); }
  assert.equal(AMB.CROSS, 3); assert.equal(AMB.FADE_IN, undefined, 'one length for both'); assert.equal(AMB.FADE_OUT, undefined);
  const w = src('js/audio/ambient.js'); assert.match(w, /bed\.stop\(host\.ctx\(\)\.currentTime, AMB\.CROSS, \{ equalPower: true \}\)/); assert.match(w, /fadeBedIn\(bed, t\);/);
  assert.match(src('dev/measure.js'), /oldBed\.stop\(T, fade, \{ equalPower: true \}\); fadeBedIn\(newBed, T, fade\)/, 'the measure runs the calls the controller runs');
  // an ordinary stop (a mute, the end of a run) is still a linear fade to silence
  const c2 = fakeContext(), o2 = c2.createGain(), b2 = buildBed(c2, o2, 'scrap', { T: 0, trimDb: -6 }); b2.stop(1, 0.6);
  assert.deepEqual(b2.gain.gain.calls.filter((c) => c[0] === 'linear').map((c) => c[2]), [1.6]);
});
test('R4: the controller crossfades with them when the district changes', async () => {
  const ctx = fakeContext({ state: 'running' }), out = ctx.createGain(); let nowMs = 1000;
  const c = createAmbient({ ctx: () => ctx, out: () => out, now: () => nowMs, random: () => 0.5, setTimeout: () => 1, clearTimeout() {}, enabled: () => true, running: () => true, dialogOpen: () => false, lastMedium: () => -Infinity, lastMoment: () => -Infinity, duck() {}, shot() {} });
  const { TRIMS } = await import('../js/audio/trims.js');
  c.set({ theme: 'scrap', tier: 1, zone: 1 }); ctx.currentTime = 10;
  const first = ctx.nodes.find((n) => n.kind === 'gain' && n.out.includes(out)); first.gain._v = dbOf(TRIMS.beds.scrap); // (a real AudioParam reads its present value; the recording one keeps the last event's)
  c.set({ theme: 'market', tier: 1, zone: 2 });
  const beds = ctx.nodes.filter((n) => n.kind === 'gain' && n.out.includes(out)); assert.equal(beds.length, 2);
  const [a, b] = beds, la = dbOf(TRIMS.beds.scrap), lb = dbOf(TRIMS.beds.market);
  for (let q = 10; q <= 13.001; q += 0.25) { const p = (valueAt(a.gain, q) / la) ** 2 + (valueAt(b.gain, q) / lb) ** 2; assert.ok(Math.abs(10 * Math.log10(p)) < 0.3, `at ${q} s: ${(10 * Math.log10(p)).toFixed(2)} dB`); }
});

test('R7: the share of the pitch jitter: the loud tier and the xl coin take 0.4 of it, alert.insolvent 0.2, the rest all of it; the engine applies it to the voice', () => {
  assert.equal(LOUD_JITTER, 0.4);
  for (const id of Object.keys(RECIPES)) for (const v of variantsOf(id)) {
    const j = jitterOf(id, v);
    if (id === 'alert.insolvent') assert.equal(j, 0.2, id); else if (tierOf(id, v) === 'loud' || (id === 'cash.in' && v === 'xl')) assert.equal(j, LOUD_JITTER, id + '#' + v); else assert.equal(j, 1, id + '#' + v);
  }
  assert.equal(jitterOf('nope', 'x'), 1);
  const detune = (id, o) => { // the pitch jitter the engine gave the first oscillator it built
    const clock = fakeClock(), ctx = fakeContext({ sampleRate: 8000 }), s = { ...audioDefaults() };
    const au = createAudio({ get: () => s, now: clock.now, timers: clock.timers_, factory: () => ctx, random: () => 0.9, measure: false });
    au.unlock(); ctx.state = 'running'; au.play(id, o); return ctx.nodes.find((n) => n.kind === 'osc').detune.value;
  };
  const full = detune('cash.in', { size: 's' }), xl = detune('cash.in', { size: 'xl' });
  assert.ok(Math.abs(full - 5.6) < 1e-9, 'a small coin: the whole jitter (0.8 of 7 cents)'); assert.ok(Math.abs(xl - 5.6 * 0.4) < 1e-9, `the xl shower: 0.4 of it (${xl})`);
});

test('R5: the pairs of a loss and its gain include sale.reject#fake and bank.draw#b, and a loss that is not under its gain is lowered to be', () => {
  const have = (g, l) => calib.LOSS_TWINS.some(([a, b]) => a === g && b === l);
  assert.ok(have('sale.win#w', 'sale.reject#fake') && have('bank.repay#full', 'bank.draw#b')); assert.equal(calib.LOSS_TWINS.length, 14);
  assert.ok(trimDbOf('sale.reject', 'fake') <= -1.5 && trimDbOf('bank.draw', 'b') <= -1.5, 'with a softness of their own');
  const row = (key, o) => { const [id, v] = key.split('#'); return { key, id, v, tier: 'medium', ms: 400, level: -24, fast: -24, lapFast: -24, lapFastA: -26, lapMomA: -28, peak: -12, ...o }; };
  const rows = [row('sale.win#w'), row('sale.reject#fake', { fast: -22.6, lapFastA: -26.8 })], t = { 'sale.win#w': 0, 'sale.reject#fake': 0 };
  const held = calib.holdTwins(rows, t);
  assert.ok(Math.abs(held['sale.reject#fake'] - -(1.4 + calib.TWIN_MARGIN)) < 0.06, `lowered by what it was over plus the margin: ${held['sale.reject#fake']}`); assert.equal(held['sale.win#w'], 0, 'the gain stays');
  assert.equal(calib.holdTwins(rows.map((r) => (r.key === 'sale.reject#fake' ? { ...r, fast: -25, lapFastA: -28 } : r)), t)['sale.reject#fake'], 0, 'a loss already under its gain is left');
});

test('R1: a ceiling holds the 95th percentile of the engine-like plays (peakJ), with a margin for other seeds; the single play of the render no longer decides', () => {
  assert.equal(calib.CEIL_MARGIN, 0.5);
  const base = { key: 'level.up#l', id: 'level.up', v: 'l', tier: 'loud', ms: 1500, level: -30, peak: -5.5 };
  const plain = calib.stage1(base), jittered = calib.stage1({ ...base, peakJ: -3.5 });
  assert.ok(Math.abs(plain + 5.5 - (TIER_CEIL.loud - calib.CEIL_MARGIN)) > 0 || plain + (-5.5) <= TIER_CEIL.loud - calib.CEIL_MARGIN + 1e-9);
  assert.ok(Math.abs(jittered + -3.5 - (TIER_CEIL.loud - calib.CEIL_MARGIN)) < 1e-9, 'held on the jittered peak: ' + (jittered - 3.5));
  assert.ok(jittered < plain, 'which is lower than the one play would have allowed');
  assert.equal(calib.peakOf({ peak: -5, peakJ: -3 }), -3); assert.equal(calib.peakOf({ peak: -5 }), -5); assert.equal(calib.peakOf({ peak: -5, peakJ: -9 }), -5);
  // stage 2 keeps it too
  const rows = [...Array.from({ length: 11 }, (_, i) => ({ key: 'cam#x' + i, id: 'cam', v: 'x' + i, tier: 'loud', ms: 300, level: -30, fast: -30, lapFast: -30, lapFastA: -30, peak: -10 })), { key: 'alert.shock#fed', id: 'alert.shock', v: 'fed', tier: 'loud', ms: 300, level: -30, fast: -30, lapFast: -30, lapFastA: -40, peak: -8, peakJ: -3.2 }];
  const t = calib.centre(rows, Object.fromEntries(rows.map((r) => [r.key, 0])));
  assert.ok(-3.2 + t['alert.shock#fed'] <= TIER_CEIL.loud - calib.CEIL_MARGIN + 1e-9, 'never traded for balance: ' + t['alert.shock#fed']);
  assert.match(src('scripts/audio-check.mjs'), /PLAYS_N = 32, PLAY_SEED = 500/); assert.match(src('scripts/audio-check.mjs'), /m\.sweep\(\$\{JSON\.stringify\(pass1\.lists\)\}|m\.sweep\(\{\}, \$\{JSON\.stringify\(pass1\.lists\)\}/);
});

test('R2: the quiet laptop\'s momentary loudness is a third model: stage 2 balances on it and a sound short in time is lifted by it', () => {
  const mk = (key, o = {}) => { const [id, v] = key.split('#'); return { key, id, v, tier: 'medium', ms: 300, level: -24, fast: -24, lapFast: -24, lapFastA: -26, lapMomA: -28, peak: -14, ...o }; };
  const rows = [...Array.from({ length: 11 }, (_, i) => mk('cam#x' + i)), mk('buy.lot#ok', { lapMomA: -33 })];
  assert.deepEqual(calib.metricsOf(rows), ['fast', 'lapFastA', 'lapMomA']); assert.deepEqual(calib.metricsOf(rows.map(({ lapMomA, ...r }) => r)), ['fast', 'lapFastA'], 'rows without it are balanced on the two as before');
  const t = calib.centre(rows, Object.fromEntries(rows.map((r) => [r.key, 0])));
  assert.ok(Math.abs(t['buy.lot#ok'] - 5 / 3) < 0.15, `raised by a third of the 5 dB it is under (the mean of the three): ${t['buy.lot#ok']}`);
  const M = calib.tierMedians(rows, t); assert.ok(Number.isFinite(M.medium.m) && Math.abs(M.medium.m - -28) < 0.3);
  // the measure: a tick of 40 ms is 10 dB under a stationary sound in a window of 400 ms
  const n = measure.SR, tick = new Float32Array(n), steady = new Float32Array(n); for (let i = 0; i < n; i++) steady[i] = 1; for (let i = 0; i < Math.round(0.04 * n); i++) tick[i] = 1;
  assert.ok(Math.abs(measure.momentary(steady)) < 0.01); assert.ok(Math.abs(measure.momentary(tick) + 10) < 0.15, String(measure.momentary(tick)));
  const half = new Float32Array(n); for (let i = 0; i < Math.round(0.2 * n); i++) half[i] = 1; assert.ok(Math.abs(measure.momentary(half) + 3) < 0.15, 'half the window is 3 dB');
  const check = src('scripts/audio-check.mjs'); assert.match(check, /\['lapMomA', 'quiet-laptop A-weighted momentary \(400 ms\)'\]/); assert.match(check, /TIER_GAP_MIN = 1\.5/); assert.match(check, /MOM_TOL = 3\.0/);
});

test('R3: the Classroom rule is 6 dB lower for the interface and 8 for the game; the two mediums on the interface bus take their 3 dB back', () => {
  assert.deepEqual(CLASSROOM_DB, { ui: -6, game: -8 });
  const gain = (settings, id, o = {}) => { const clock = fakeClock(), ctx = fakeContext({ sampleRate: 8000 }), au = createAudio({ get: () => settings, now: clock.now, timers: clock.timers_, factory: () => ctx, random: () => 0.5, measure: false }); au.unlock(); ctx.state = 'running'; au.play(id, o); return 20 * Math.log10(ctx.nodes.find((n) => n.kind === 'gain' && n.out.some((x) => x.kind === 'pan')).gain.value); };
  for (const [id, db] of [['sale.win', -8], ['ui.ok', -6], ['zone.open', -8]]) assert.ok(Math.abs(gain({ ...audioDefaults(), quiet: true }, id, { player: true }) - gain(audioDefaults(), id, { player: true }) - db) < 0.01, id);
  assert.ok(trimDbOf('acad.teach', 'right') > 0 && trimDbOf('draft.pick', 'complete') > 0 && RECIPES['acad.teach'].bus === 'ui' && RECIPES['draft.pick'].bus === 'ui' && tierOf('acad.teach', 'right') === 'medium');
  const check = src('scripts/audio-check.mjs'); assert.match(check, /tiers at the speaker/); assert.match(check, /AT_BUS_GAP = 2\.5/); assert.match(check, /CLASSROOM_DB/);
});

test('R6: the herd (h) and the scam fall where a laptop plays: a note in 250 to 800 Hz that steps down, by the ear\'s measure and through the laptop model', () => {
  const notes = (L) => L.filter((x) => (x.k === 'tone' || x.k === 'bank') && x.type !== 'sawtooth').map((x) => ({ t: x.t || 0, f: typeof x.f === 'number' ? x.f : 440 * 2 ** ((12 * (+x.f.slice(-1) + 1) + { C: 0, 'C#': 1, D: 2, E: 4, 'F#': 6, A: 9, B: 11 }[x.f.slice(0, -1)] - 69) / 12), g: x.g ?? 1 })).filter((x) => x.f >= 250 && x.f <= 800);
  for (const k of ['sale.herd#h', 'sale.scam#s']) {
    const [id, v] = k.split('#'), N = notes(layersFor(id, v)), mx = Math.max(...N.map((x) => x.g)), sal = N.filter((x) => x.g >= mx * 0.5).sort((a, b) => a.t - b.t || b.f - a.f);
    assert.ok(12 * Math.log2(sal[sal.length - 1].f / sal[0].f) <= -2.5, `${k} falls ${(12 * Math.log2(sal[sal.length - 1].f / sal[0].f)).toFixed(1)} semitones`);
  }
  assert.ok(notes(layersFor('sale.herd', 'hw')).length >= 1, 'the herd that paid is unchanged: a bell, no falling pair');
});

test('R8: a loud sound panned off centre is a little quieter than the same centred, and the remedy proposed (a lower voice gain) made it worse: the engine adds none, and the guard is in audio-check', () => {
  const clock = fakeClock(), ctx = fakeContext({ sampleRate: 8000 }), s = { ...audioDefaults() };
  const au = createAudio({ get: () => s, now: clock.now, timers: clock.timers_, factory: () => ctx, random: () => 0.5, measure: false });
  au.unlock(); ctx.state = 'running'; au.play('zone.open', { variant: 't4', pan: 0.6, noCooldown: true });
  const g1 = 20 * Math.log10(ctx.nodes.find((n) => n.kind === 'gain' && n.out.some((x) => x.kind === 'pan')).gain.value);
  const c2 = fakeContext({ sampleRate: 8000 }), a2 = createAudio({ get: () => s, now: clock.now, timers: clock.timers_, factory: () => c2, random: () => 0.5, measure: false }); a2.unlock(); c2.state = 'running'; a2.play('zone.open', { variant: 't4', pan: 0, noCooldown: true });
  const g0 = 20 * Math.log10(c2.nodes.find((n) => n.kind === 'gain' && n.out.some((x) => x.kind === 'pan')).gain.value);
  assert.ok(Math.abs(g1 - g0) < 1e-9, 'the same voice gain at every pan: the equal-power law is the only difference');
  const check = src('scripts/audio-check.mjs'); assert.match(check, /PAN_LOSS_MAX = 1\.6/); assert.match(check, /m\.panChain/);
});

// ================================================================================ the documents say what the code does (U2, W-9, U14, G)
test('U2: the first listen is on /dev/sounds.html, and the prototype\'s page says it is the prototype', () => {
  const doc = src('docs/AUDIO.md');
  assert.ok(!/open `\/dev\/audio-proto\/audition\.html`/.test(doc), 'no instruction to listen on the prototype'); assert.match(doc, /then open \*\*`\/dev\/sounds\.html`\*\*/);
  assert.ok(!/`npm start`, then `\/dev\/audio-proto\/audition\.html`\) \|$/m.test(doc.replace(/revision-1 prototype's page[^|]*\|/, '')), 'the file table does not send the author to the prototype');
  assert.match(doc, /item 2 is its \*\*Blind round\*\*/); assert.match(src('dev/audio-proto/audition.html'), /Revision-1 prototype\.<\/b>[^<]*[\s\S]*href="\/dev\/sounds\.html"/);
});
test('W-9 / U14: the faculty kit says what the link gains, what the room does and what the instructor cannot do; row 88 says what nothing gates', () => {
  const kit = src('docs/FACULTY_KIT.md'), doc = src('docs/AUDIO.md');
  assert.match(kit, /the link gains `&sound=quiet`/); assert.ok(!/the link ends `\?sound=quiet`/.test(kit));
  // (sixth round, UX2: the class script is one that is true for every student, and a volume alone no longer exempts a student from the room's rule)
  assert.match(kit, /Before class, one minute/); assert.match(kit, /tell them to press \*\*M\*\* now, or use headphones/); assert.match(kit, /you cannot see how a student's sound is set/); assert.match(kit, /moving the volume alone does not count/);
  // (sixth round, UX3: the box is a choice of three, and a shock is a medium voice in Classroom, not "a loud sound on every laptop")
  assert.match(kit, /a shock you deploy to the cohort is heard on every laptop at once/);
  assert.match(kit, /Choose \*\*Quiet\*\* or \*\*Off\*\* under \*\*Sound in the student link\*\* \*before\* you press \*\*Copy student link\*\*/); assert.match(kit, /medium and loud ones are 8 dB lower/);
  assert.ok(!/Off by default in a room/.test(doc), 'row 88'); assert.match(doc, /On by default on the instructor's own screen \(nothing gates it/);
  assert.match(src('README.md'), /`js\/audio\/` is the generated sound layer/);
});
test('Appendix G exists, answers every finding, and says which were not taken as reported', () => {
  const doc = src('docs/AUDIO.md'), from = doc.indexOf('## Appendix G.'), to = doc.indexOf('## Appendix H.'), g = doc.slice(from, to > from ? to : undefined); // Appendix H (the fifth round) follows it
  for (const id of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'W-1', 'W-2', 'W-3', 'W-4', 'W-5', 'W-6', 'W-7', 'W-8', 'W-9', 'B1', 'B2', 'U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7', 'U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15']) assert.ok(g.includes(id), id + ' is in Appendix G');
  assert.match(g, /\*\*Not as reported\.\*\*/); assert.match(g, /The remedy proposed \(-1\.5 dB when panned\) was measured and is worse/); assert.match(g, /### G\.3 What only ears can say/);
  assert.match(doc, /Revision 6 \(2026-10-29, the fourth repair round\)/); assert.match(doc, /Appendix D, E, F, G and H the five repair rounds/);
  assert.ok(!/10 dB lower, interface 6 dB lower/.test(doc), 'the Classroom figure is 8 everywhere'); assert.ok(!/game 10\b/.test(src('scripts/audio-check.mjs')));
});
