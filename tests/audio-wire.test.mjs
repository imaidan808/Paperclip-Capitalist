// The sound layer wired to the game (docs/AUDIO.md 4 and 8.3): what the shell, the world, the HUD, the Draft and the page's controls ask of the engine, in what order, and what the engine does with it
// under a fake clock and a recording fake AudioContext. No browser: the page is a small stand-in (a document that dispatches to the listeners js/audio/wire.js installs), the game is a real Game
// driven by the bot, and the engine behind the page's `audio` is an instance built for the test. scripts (not tests) play the same things in headless Chrome.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fakeContext, fakeClock } from './helpers/fakeaudio.mjs';
import { makeGame, run } from './bot.mjs';

// ---------------------------------------------------------------- a page stand-in (before the app's modules are imported)
const listeners = new Map(), els = {};
const fire = (type, ev) => { for (const fn of listeners.get(type) || []) fn(ev); };
const ticked = [];
globalThis.innerWidth = 1000;
globalThis.addEventListener = () => {};
globalThis.document = {
  hidden: false,
  addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
  removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter((f) => f !== fn)); },
  getElementById: (id) => els[id] || null,
  querySelectorAll: () => ticked,
};
const CONTROLS = 'button, [data-act], [data-deal], [data-wv], .btn, .ibtn, a[href], [role=button]';
/** A control as the table reads it: data-*, aria-*, class, type, value, checked, and the few selectors js/audio/wire.js asks of it (matched by their exact text). */
function el({ tag = 'button', data = {}, aria = {}, classes = [], attrs = [], type, value = '', checked = false, min, max, text = '', parent = null, field = false } = {}) {
  const e = {
    tagName: tag.toUpperCase(), dataset: data, type, value, checked, min, max, textContent: text, parentElement: parent, disabled: false, isContentEditable: false,
    classList: { contains: (c) => classes.includes(c) },
    getAttribute: (k) => aria[k] ?? null,
    hasAttribute: (k) => attrs.includes(k) || (k === 'data-close' && data.close != null),
    matches(sel) {
      if (sel === 'input, select, textarea') return field || /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName);
      if (sel === 'input:not([type=checkbox]):not([type=radio]), textarea') return (e.tagName === 'INPUT' && !/^(checkbox|radio)$/.test(type)) || e.tagName === 'TEXTAREA';
      if (sel === '[data-snd], #s-preset') return attrs.includes('data-snd');
      return false;
    },
    closest(sel) { if (sel === CONTROLS) return e; if (sel === '[data-snd]') return attrs.includes('data-snd') ? e : null; return null; },
  };
  return e;
}
const click = (target) => fire('click', { type: 'click', target });
const change = (target) => fire('change', { type: 'change', target });
const input = (target) => fire('input', { type: 'input', target });

const { audio: page } = await import('../js/audio/instance.js');
const { audioDefaults } = await import('../js/audio/settings.js');
const { createAudio } = await import('../js/audio/engine.js');
const { RECIPES } = await import('../js/audio/recipes.js');
const wire = await import('../js/audio/wire.js');
const { createCues, SPEAK_GAP, URGENT_GAP, HINT_TEXT, INSOLVENT_TEXT } = await import('../js/ui/audiocues.js');
const { createWorldSound, REST_MS, HOVER_GAP, STEPS_MAX } = await import('../js/ui/worldsound.js');
const { speakerHTML } = await import('../js/ui/hud.js');
const { settings: pageSettings } = await import('../js/ui/common.js');

const S0 = { audio: audioDefaults() }; // the page's `settings`, shared by initAudio and the engine under test
let current = null;
const notes = { announced: [], toasts: [] };
wire.initAudio({ settings: S0, save: () => current?.E.sync(S0.audio), announce: (m, a) => notes.announced.push([m, !!a]), toast: (m, l) => notes.toasts.push([m, l]) });

// ---------------------------------------------------------------- the rig: an engine under a fake clock, standing in for the page's engine
const rngOf = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
function rig(settings = {}) {
  const ctx = fakeContext(), clk = fakeClock();
  S0.audio = { ...audioDefaults(), ...settings };
  const E = createAudio({ get: () => S0.audio, now: clk.now, factory: () => ctx, timers: clk.timers_, random: rngOf(7), measure: false });
  E.unlock();
  const asked = [], saved = {}, names = ['play', 'request', 'playMix', 'setEnv', 'hold', 'ambient', 'countUp', 'touch', 'release', 'sync', 'unlock', 'stopAll', 'setHidden'];
  for (const k of names) { saved[k] = page[k]; page[k] = (...a) => { if (['play', 'request', 'playMix', 'countUp'].includes(k)) asked.push([k, ...a]); return E[k](...a); }; }
  const was = { env: Object.getOwnPropertyDescriptor(page, 'env'), state: Object.getOwnPropertyDescriptor(page, 'state'), supported: Object.getOwnPropertyDescriptor(page, 'supported'), perf: Object.getOwnPropertyDescriptor(globalThis, 'performance') };
  Object.defineProperty(page, 'env', { value: E.env, configurable: true, writable: true });
  Object.defineProperty(page, 'state', { get: () => E.state, configurable: true });
  Object.defineProperty(page, 'supported', { get: () => true, configurable: true });
  Object.defineProperty(globalThis, 'performance', { value: { now: clk.now }, configurable: true, writable: true });
  notes.announced.length = 0; notes.toasts.length = 0; ticked.length = 0;
  const r = {
    E, ctx, clk, asked, s: () => S0.audio, notes,
    ids: () => asked.map((a) => (a[0] === 'playMix' ? a[1].map((m) => m[0]).join('+') : a[1])),
    played: () => ({ ...E.stats().played }),
    dropped: () => ({ ...E.stats().dropped }),
    /** Let the collector flush and the clock run for `ms`. */
    settle: (ms = 40) => clk.advance(ms),
    restore() {
      for (const k of names) page[k] = saved[k];
      for (const [k, d] of Object.entries(was)) { const target = k === 'perf' ? globalThis : page, name = k === 'perf' ? 'performance' : k; if (d) Object.defineProperty(target, name, d); else delete target[name]; }
      current = null;
    },
  };
  current = r;
  return r;
}
/** Runs fn(rig) and always puts the page back. */
async function withRig(settings, fn) { const r = rig(settings); try { return await fn(r); } finally { r.restore(); } }

/** A game context as the shell gives it to wireGame: the event bus, the session's events, a world that knows where things are, a dialog. */
function gameCtx(r, { game = makeGame(['trades', 'pro'], 'ops', 13), zone = 1, speed = 1, paused = false, pan = () => ({ x: 800, y: 0, w: 40, h: 40 }), sandbox = false } = {}) {
  const ev = new Set(), ss = new Set();
  game.sandbox = sandbox;
  const S = { game, clock: { paused, speed, now: () => game.s.hour }, roomInfo: null, on(fn) { ss.add(fn); return () => ss.delete(fn); }, emit(t, d) { for (const f of [...ss]) f(t, d); } };
  const ctx = { S, U: { zone, sel: new Set() }, g: () => game, on(fn) { ev.add(fn); return () => ev.delete(fn); }, emit(e) { for (const f of [...ev]) f(e); }, world: () => ({ night: 0, rectOf: pan }), dlg: { el: { open: false } }, listeners: () => ev.size + ss.size };
  game.onEvent = (e) => ctx.emit(e); game.onNote = (n) => S.emit('note', n);
  return ctx;
}
const hoursToMs = (h, speed = 1) => (h * 7000) / speed;

// ---------------------------------------------------------------- the control table against the whole app
function sources(dir) { const out = []; for (const f of readdirSync(dir)) { const p = dir + '/' + f; if (statSync(p).isDirectory()) out.push(...sources(p)); else if (f.endsWith('.js') && !p.includes('/audio/')) out.push(p); } return out; }
test('every control of the app maps to a sound that exists, a sound of its own, or the neutral tick; nothing maps to a variant that does not', () => {
  const src = sources(new URL('../js', import.meta.url).pathname).map((p) => readFileSync(p, 'utf8')).join('\n');
  const acts = new Set([...src.matchAll(/data-(?:act|change|deal|wv)="([a-z0-9-]+)"/g)].map((m) => m[1]));
  assert.ok(acts.size > 120, 'found the controls (' + acts.size + ')');
  const bad = [], seen = {};
  for (const act of acts) for (const deal of [false, true]) for (const kind of ['click', 'change']) {
    const c = wire.controlFor({ act, kind, deal, count: 2, id: 'look', angle: 'story', level: 'fair', size: 'medium', move: true, label: 'pause', checkbox: kind === 'change' && /pick|assist/.test(act) });
    if (c === null) continue;
    const [m, id, o] = c;
    if (m !== 'play' || !RECIPES[id]) { bad.push(`${act}: ${id}`); continue; }
    if (o?.variant && !RECIPES[id].variants[o.variant]) bad.push(`${act}: ${id}#${o.variant}`);
    seen[id] = (seen[id] || 0) + 1;
  }
  assert.deepEqual(bad, []);
  for (const id of ['ui.tick', 'ui.select', 'ui.toggle', 'ui.crate', 'ui.drawer-open', 'ui.slider', 'ui.dialog-open', 'ui.ok', 'ui.ask', 'ui.dialog-close', 'clock', 'cam', 'read.probe', 'pitch.angle', 'haggle.anchor', 'haggle.move', 'haggle.close', 'bid.raise', 'bid.drop', 'inst.cue', 'deal.quick']) assert.ok(seen[id], id + ' is the sound of some control');
});
test('the controls with a sound of their own, or an outcome that always speaks, are silent at the click; the others tick', () => {
  const c = (act, o = {}) => wire.controlFor({ act, kind: 'click', ...o });
  for (const act of ['confirm-go', 'drop', 'clear', 'reroll', 'sound', 'crew-up', 'crew-upg', 'crew-client', 'bank-draw', 'bank-repay', 'bank-audit', 'travel-ship', 'quests-spend', 'market-accept']) assert.equal(c(act), null, act);
  assert.equal(wire.controlFor({ act: 'pick', kind: 'change', checkbox: true }), null, 'a Draft card is heard by the Draft');
  for (const act of ['stock-sellpool', 'market-sell', 'market-look', 'travel-go', 'quests-go', 'crew-hgo', 'crew-rel', 'bank-exit']) assert.equal(c(act)[1], 'ui.tick', act + ' can refuse: its click is a tick');
  for (const act of ['resume', 'solo', 'join', 'instr', 'instr-resume', 'instr-recover']) assert.deepEqual(c(act), ['play', 'ui.tick', { variant: 'full' }], 'the title: ' + act);
  assert.equal(c('a11y')[1], 'ui.dialog-open'); assert.equal(c('close')[1], 'ui.dialog-close'); assert.equal(c('back')[1], 'ui.dialog-close'); assert.equal(c('copylink')[1], 'ui.ok');
  assert.deepEqual([c('start')[2].variant, c('deploy')[2].variant, c('squeeze')[2].variant, c('rewind')[2].variant], ['start', 'deploy', 'deploy', 'rewind']);
});
test('the state of a toggle is read as it was before the press: pressed, expanded, or the word on a Pause button', () => {
  const v = (act, o) => wire.controlFor({ act, kind: 'click', ...o })[2].variant;
  assert.equal(v('bank-ledger', { expanded: false }), 'on'); assert.equal(v('bank-ledger', { expanded: true }), 'off'); assert.equal(v('quests-done', { expanded: true }), 'off');
  assert.equal(v('crew-pause', { label: 'pause' }), 'off', 'pausing falls'); assert.equal(v('crew-pause', { label: 'resume' }), 'on', 'resuming rises');
  assert.equal(v('market-want', { pressed: true }), 'off');
});
test('the Deal Room moves: each plays its own sound at the click, a pressed angle is a drop, a Pass is left to the result', () => {
  const d = (act, o = {}) => wire.controlFor({ act, kind: 'click', deal: true, ...o });
  assert.deepEqual(d('probe', { id: 'serial' }), ['play', 'read.probe', { variant: 'serial' }]); assert.equal(d('probe', { id: 'nonsense' })[2].variant, 'look');
  assert.equal(d('angle', { angle: 'prestige' })[2].variant, 'prestige'); assert.equal(d('angle', { angle: 'prestige', pressed: true })[2].variant, 'drop');
  assert.equal(d('anchor', { level: 'low' })[2].variant, 'low'); assert.equal(d('hold')[2].variant, 'hold'); assert.equal(d('concede', { size: 'small' })[2].variant, 'small'); assert.equal(d('concede', { size: 'large' })[2].variant, 'large');
  assert.equal(d('split')[1], 'haggle.move'); assert.equal(d('leverage')[1], 'haggle.leverage'); assert.equal(d('accept')[2].variant, 'accept');
  assert.equal(d('walk', { move: true })[2].variant, 'walk'); assert.equal(d('walk', { move: false }), null, 'a Pass before the first round: the result card speaks');
  assert.equal(d('bid', { bids: 2 })[2].params.n, 2); assert.equal(d('bid', { bids: 9 })[2].params.n, 4); assert.equal(d('drop')[1], 'bid.drop', 'the Deal Room\'s Drop out is not the Draft\'s Remove');
  assert.equal(d('quick-all')[1], 'deal.quick'); assert.equal(d('quick-stage')[1], 'deal.quick');
  assert.equal(d('next')[1], 'ui.tick', 'Continue is a plain press'); assert.equal(wire.controlFor({ act: 'drop', kind: 'click', deal: false }), null);
});

// ---------------------------------------------------------------- the page's listeners, through the stand-in document
test('a first press unlocks the context and plays its own tick; Escape and a bare modifier are not a press', async () => withRig({}, async (r) => {
  // the rig unlocks at once, so look at the listener's rule itself
  const before = r.E.state; fire('keydown', { type: 'keydown', key: 'Escape', target: { tagName: 'BODY' } }); fire('keydown', { type: 'keydown', key: 'Shift', target: { tagName: 'BODY' } });
  assert.equal(r.E.state, before);
  click(el({ data: { act: 'solo' }, classes: ['btn', 'big'] }));
  assert.deepEqual(r.asked.map((a) => a.slice(1, 3)), [['ui.tick', { variant: 'full' }]]);
}));
const real = (ms) => new Promise((res) => setTimeout(res, ms));
test('a crate box is heard by how many are ticked; Tick all by how many are ticked after the list is drawn again', async () => withRig({}, async (r) => {
  const box = el({ tag: 'input', type: 'checkbox', data: { change: 'stock-pick', id: 'A1' }, checked: true });
  ticked.push(box); change(box); r.settle(60);
  assert.deepEqual(r.asked.at(-1).slice(1), ['ui.crate', { variant: 'pick1', params: { n: 1 } }]);
  ticked.push(el({ tag: 'input', type: 'checkbox' })); r.clk.advance(100); change(box);
  assert.equal(r.asked.at(-1)[2].params.n, 2, 'the second box is the second note');
  ticked.length = 0; r.clk.advance(100); box.checked = false; change(box);
  assert.deepEqual(r.asked.at(-1).slice(1), ['ui.crate', { variant: 'clear' }], 'none ticked is the clearing');
  const all = el({ data: { act: 'stock-pickzone' }, classes: ['btn', 'sm', 'ghost'] }), n0 = r.asked.length;
  r.clk.advance(100); click(all); assert.equal(r.asked.length, n0, 'nothing at the click: the count is not known yet');
  ticked.push(box, box, box); await real(20);
  assert.equal(r.asked.at(-1)[2].params.n, 3, 'three boxes ticked after the handlers ran');
}));
test('a toggle control and a disclosure button: the click names the state it was in', async () => withRig({}, async (r) => {
  click(el({ data: { act: 'bank-ledger' }, aria: { 'aria-expanded': 'false' }, classes: ['btn', 'ghost'] }));
  assert.deepEqual(r.asked.at(-1).slice(1), ['ui.toggle', { variant: 'on' }]);
  r.settle(100); click(el({ data: { act: 'crew-pause' }, text: 'Resume', classes: ['btn', 'ghost'] }));
  assert.equal(r.asked.at(-1)[2].variant, 'on');
}));
test('data-close is the dialog closing, and a control marked data-snd (Begin, the speaker) is left alone by the table', async () => withRig({}, async (r) => {
  click(el({ data: { close: '' }, classes: ['btn', 'ghost', 'sm'] }));
  assert.equal(r.asked.at(-1)[1], 'ui.dialog-close');
  const n = r.asked.length; r.settle(200);
  click(el({ attrs: ['data-snd'], classes: ['btn', 'big'] })); assert.equal(r.asked.length, n, 'Begin plays its own');
  const form = { tagName: 'FORM', closest: (s) => (s === '[data-snd]' ? form : null) };
  fire('submit', { type: 'submit', target: form }); assert.equal(r.asked.length, n, 'a form marked data-snd');
  fire('submit', { type: 'submit', target: { closest: () => null } }); assert.equal(r.asked.at(-1)[1], 'ui.tick', 'any other form is a full tick');
}));
test('100 rapid slider moves: a note per 10% of the travel, none of them faster than the engine lets a sound in, never more than 12 voices', async () => withRig({}, async (r) => {
  const range = el({ tag: 'input', type: 'range', value: 0, min: 0, max: 100 });
  let top = 0;
  for (let i = 0; i <= 100; i++) { range.value = i; input(range); r.clk.advance(5); top = Math.max(top, r.E._voices.length); }
  r.settle(300);
  const asked = r.asked.filter((a) => a[1] === 'ui.slider'), vs = asked.map((a) => a[2].params.v);
  assert.deepEqual(vs, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'one request per detent, rising with the value');
  assert.equal(asked[0][2].variant, 'zero'); assert.equal(asked.at(-1)[2].variant, 'top');
  assert.ok(r.played()['ui.slider'] <= 8, 'played ' + r.played()['ui.slider'] + ' of 11 in 0.5 s');
  assert.ok(top <= 12);
  const again = r.asked.length; input(range); assert.equal(r.asked.length, again, 'no move, no note');
}));
test('a disclosure opened by a press is a toggle; one drawn open by a redraw is not', async () => withRig({}, async (r) => {
  const d = { tagName: 'DETAILS', open: true, hasAttribute: () => false };
  r.E.env.lastPress = -Infinity; fire('toggle', { target: d }); assert.equal(r.asked.length, 0, 'no press, no sound');
  r.E.touch(); fire('toggle', { target: d }); assert.deepEqual(r.asked.at(-1).slice(1), ['ui.toggle', { variant: 'on' }]);
}));
test('key M mutes silently, unmutes with an ok, announces both, and does nothing inside a field', async () => withRig({}, async (r) => {
  const key = (target) => fire('keydown', { type: 'keydown', key: 'm', target });
  key({ tagName: 'INPUT', type: 'text' }); assert.equal(S0.audio.mute, false, 'typing an m');
  key({ tagName: 'BODY' }); assert.equal(S0.audio.mute, true); assert.deepEqual(notes.announced.at(-1), ['Sound off.', false]);
  r.settle(100); const n = r.asked.length; click(el({ data: { act: 'dock', d: 'stock' } })); assert.equal(r.played()['ui.drawer-open'], undefined, 'muted: ' + n);
  key({ tagName: 'BODY' }); assert.equal(S0.audio.mute, false); assert.deepEqual(notes.announced.at(-1), ['Sound on.', false]); assert.equal(r.asked.at(-1)[1], 'ui.ok');
}));
test('the dock button names the drawer that is really open, so the player card of an open drawer is a close', async () => withRig({}, async (r) => {
  els.stage = { dataset: { drawer: 'quests' } };
  try {
    click(el({ data: { act: 'dock', d: 'quests' }, classes: ['pcard'] })); assert.equal(r.asked.at(-1)[1], 'ui.drawer-close');
    r.settle(300); click(el({ data: { act: 'dock', d: 'stock' }, classes: ['pcard'] })); assert.equal(r.asked.at(-1)[1], 'ui.drawer-open');
  } finally { delete els.stage; }
}));

// ---------------------------------------------------------------- the wiring of a mounted game: scripted event sequences
const sale = (g = 'win') => ({ type: 'pitch', zone: 1, cls: 'tool', seg: 'x', outcome: g, gain: 0.2, price: 120, day: 3 });
test('wireGame: a full sale plays the sale and its coins and streak as one, the level after it, and the quest as a tick', async () => withRig({}, async (r) => {
  const c = gameCtx(r), un = wire.wireGame(c);
  // the order the engine computes: the level the XP bought, then the quest it completed (the shell's Progress hook), then the sale, then the streak
  c.emit({ type: 'level', level: 4, day: 3 }); page.request('quest.complete'); c.emit(sale()); c.emit({ type: 'streak', n: 3, day: 3 });
  r.settle(60);
  assert.deepEqual(r.ids().filter((i) => i !== 'quest.complete'), ['level.up', 'sale.win']);
  const mix = r.asked.find((a) => a[1] === 'sale.win')[2];
  assert.deepEqual(mix.with.map((w) => w[0]), ['cash.in', 'streak'], 'coins and the streak ride in the sale');
  r.settle(900);
  const p = r.played();
  assert.equal(p['sale.win'], 1); assert.equal(p['level.up'], 1); assert.equal(p['quest.complete'], undefined); assert.equal(p['reward.also'], 1, 'the quest is a tick');
  assert.ok(r.E.stats().maxSentences <= 2); assert.ok(r.E._voices.length <= 12);
  un();
}));
test('wireGame: hidden information never reaches the engine (a fake crate, a fraud, a caught fake)', async () => withRig({}, async (r) => {
  const c = gameCtx(r), un = wire.wireGame(c), shape = [];
  for (const secret of [false, true]) {
    r.asked.length = 0; r.clk.advance(30000);
    c.emit({ type: 'buy', zone: 1, cls: 'tool', price: 50, fake: secret, cond: 'ok', day: 1 }); c.emit({ type: 'inspect', score: 0.9, fake: secret, caught: secret, repeat: false }); c.emit({ type: 'auction', won: true, price: 40, surplus: secret ? 99 : 1 });
    r.settle(60); shape.push(JSON.stringify(r.asked));
  }
  assert.equal(shape[0], shape[1], 'the same sounds whatever the truth');
  un();
}));
test('wireGame: a day of manager cycles at 1x is a few coins, one new day; a burst of cycles at once is one coin', async () => withRig({}, async (r) => {
  const c = gameCtx(r), un = wire.wireGame(c);
  c.emit({ type: 'day', day: 2 }); r.settle(60);
  for (const h of [3, 3, 3, 9, 14, 20]) { r.clk.advance(hoursToMs(0.4)); c.emit({ type: 'cycle', zone: 1, net: 8, day: 2 }); r.settle(10); void h; }
  r.settle(400);
  const p = r.played();
  assert.equal(p['day.turn'], 1);
  assert.ok(p['manager.cycle'] >= 1 && p['manager.cycle'] <= 6, 'coins: ' + p['manager.cycle']);
  r.asked.length = 0; r.clk.advance(60000);
  for (let i = 0; i < 5; i++) c.emit({ type: 'cycle', zone: 1, net: 5, day: 3 });
  r.settle(60); const merged = r.E.stats().played['manager.cycle'] - p['manager.cycle'];
  assert.equal(merged, 1, 'five cycles in one step: one coin');
  un();
}));
test('wireGame: at 16x nothing stands at the tick rate: no cycle coin, no new day, one summed coin every 8 s at most', async () => withRig({}, async (r) => {
  const c = gameCtx(r, { speed: 16 }), un = wire.wireGame(c);
  for (let i = 0; i < 60; i++) { r.clk.advance(500); c.emit({ type: 'cycle', zone: 1, net: 6, day: 1 }); if (i % 4 === 0) c.emit({ type: 'day', day: i }); r.settle(10); }
  const p = r.played();
  assert.equal(p['manager.cycle'], undefined); assert.equal(p['day.turn'], undefined);
  assert.ok((p['cash.in'] || 0) <= 5, 'summed coins in 30 s: ' + p['cash.in']);
  un();
}));
test('wireGame: a shock, its warning note and a margin call: at most two sentences a burst, the margin call over everything', async () => withRig({}, async (r) => {
  const c = gameCtx(r), un = wire.wireGame(c);
  c.emit({ type: 'shock', kind: 'tiktok', day: 5 }); c.S.emit('note', { h: 100, level: 'warn', text: 'The Fed Tightens: effective in 2 days.', alert: { name: 'The Fed Tightens', level: 2, start: 150 } });
  r.settle(60);
  assert.ok(r.played()['alert.shock'] >= 1); assert.ok(r.E.stats().maxSentences <= 2);
  r.clk.advance(6000); const before = r.played()['alert.margin-call'] || 0;
  c.emit({ type: 'margin-call' }); c.S.emit('note', { h: 120, level: 'bad', text: 'MARGIN CALL: debt-to-equity passed 4.5. The bank is liquidating assets at a 35% fire-sale discount.', alert: { code: 'X', name: 'Margin Liquidation Protocol', level: 3 } }); c.emit({ type: 'insolvent' });
  r.settle(100);
  assert.equal(r.played()['alert.margin-call'] - before, 1);
  assert.ok(r.E._voices.length <= 12);
  un();
}));
test('wireGame: a district opening: the milestone and the district are two sentences at most, the district is panned to where it is', async () => withRig({}, async (r) => {
  const c = gameCtx(r, { pan: (k, id) => (k === 'zone' && id === 4 ? { x: 900, y: 0, w: 100, h: 50 } : null) }), un = wire.wireGame(c);
  c.emit({ type: 'zone', id: 4, day: 9 }); c.emit({ type: 'milestone', n: 1, day: 9 }); c.S.emit('note', { h: 200, level: 'good', text: 'Pawn Row is open.', zone: 4 });
  r.settle(80);
  const ask = r.asked.find((a) => a[1] === 'zone.open');
  assert.ok(ask && ask[2].pan > 0.3, 'panned right: ' + ask?.[2].pan);
  r.settle(1500);
  assert.equal(r.played().milestone, 1); assert.ok(r.E.stats().maxSentences <= 2);
  un();
}));
test('wireGame: an Academy lesson keeps the money and silences the pretend rewards', async () => withRig({}, async (r) => {
  const c = gameCtx(r, { sandbox: true }), un = wire.wireGame(c);
  c.emit({ type: 'level', level: 2 }); c.emit({ type: 'zone', id: 2 }); c.emit(sale()); r.settle(100);
  const p = r.played();
  assert.equal(p['level.up'], undefined); assert.equal(p['zone.open'], undefined); assert.equal(p['sale.win'], 1);
  un();
}));
test('wireGame: paused plays no clock sound, and the settings buses gate everything (Interface only, Classroom, mute)', async () => {
  await withRig({}, async (r) => { const c = gameCtx(r, { paused: true }), un = wire.wireGame(c); c.emit({ type: 'cycle', zone: 1, net: 4 }); c.emit({ type: 'day', day: 2 }); r.settle(60); assert.deepEqual(r.played(), {}); un(); });
  await withRig({ game: false }, async (r) => { const c = gameCtx(r), un = wire.wireGame(c); c.emit(sale()); r.settle(60); assert.equal(r.played()['sale.win'], undefined, 'game sounds off'); click(el({ data: { act: 'help' } })); assert.equal(r.played()['ui.dialog-open'], 1, 'interface sounds on'); un(); });
  await withRig({ mute: true }, async (r) => { const c = gameCtx(r), un = wire.wireGame(c); c.emit(sale()); click(el({ data: { act: 'help' } })); r.settle(60); assert.deepEqual(r.played(), {}); un(); });
  await withRig({ quiet: true, clockSounds: false }, async (r) => { const c = gameCtx(r), un = wire.wireGame(c); c.emit({ type: 'day', day: 2 }); c.emit({ type: 'cycle', zone: 1, net: 4 }); r.settle(60); assert.deepEqual(r.played(), {}, 'Classroom: no clock sounds'); un(); });
});
test('wireGame: a refusal repeated is quieter, the third is silent; and the listeners go when the game does', async () => withRig({}, async (r) => {
  const c = gameCtx(r), un = wire.wireGame(c);
  assert.equal(wire.wired(), true);
  for (let i = 0; i < 4; i++) { page.play('ui.refuse', { cause: 'toast' }); r.clk.advance(800); }
  assert.equal(r.played()['ui.refuse'], 2, 'the first and the second at -4 dB; the others wait for two quiet seconds');
  un(); un();
  assert.equal(wire.wired(), false); assert.equal(c.listeners(), 0, 'every listener was taken off');
  c.emit(sale()); r.settle(60); assert.equal(r.played()['sale.win'], undefined, 'a game that is gone makes no sound');
}));
test('wireGame: a game that throws is switched off for sound, not for play', async () => withRig({}, async (r) => {
  const c = gameCtx(r), un = wire.wireGame(c);
  const real = page.request; page.request = () => { throw new Error('boom'); };
  const warn = console.warn; console.warn = () => {};
  try { assert.doesNotThrow(() => c.emit(sale())); assert.doesNotThrow(() => c.emit({ type: 'level', level: 3 })); } finally { page.request = real; console.warn = warn; }
  un();
}));
test('a real 30-day bot run, replayed at 1x: the voice cap holds, no burst has more than two sentences, and the game is not a metronome', async () => withRig({}, async (r) => {
  const game = makeGame(['trades', 'pro'], 'ops', 13), rec = [];
  game.onEvent = (e) => rec.push({ h: game.s.hour, e }); game.onNote = (n) => rec.push({ h: game.s.hour, n });
  run(game, { days: 30 });
  const g2 = makeGame(['trades', 'pro'], 'ops', 13), c = gameCtx(r, { game: g2 }), un = wire.wireGame(c);
  let top = 0, t0 = r.clk.t;
  for (const { h, e, n } of rec) {
    r.clk.advance(Math.max(0, t0 + hoursToMs(h) - r.clk.t)); g2.s.hour = h;
    if (e) c.emit(e); else c.S.emit('note', n);
    r.clk.advance(30); top = Math.max(top, r.E._voices.length);
  }
  r.settle(5000);
  const st = r.E.stats(), played = Object.values(st.played).reduce((a, b) => a + b, 0), events = rec.length, minutes = hoursToMs(30 * 24) / 60000;
  const clockIds = ['day.turn', 'manager.cycle', 'ship.arrive', 'mentor.tip', 'buyer.arrive', 'buyer.urgent'], clockPlays = clockIds.reduce((n, id) => n + (st.played[id] || 0), 0);
  assert.ok(top <= 12, 'voices ' + top);
  assert.ok(st.maxSentences <= 2, 'sentences ' + st.maxSentences);
  assert.ok(st.sentences <= st.bursts * 2, 'two sentences a burst at most');
  assert.ok(st.sentences / minutes < 8, `a bot that acts every two hours still makes under 8 sentences a minute: ${(st.sentences / minutes).toFixed(1)} for ${events} events`);
  assert.ok(clockPlays / minutes < 2, `what the clock causes is under 2 sounds a minute: ${(clockPlays / minutes).toFixed(2)}`);
  assert.ok((st.played['manager.cycle'] || 0) < rec.filter((x) => x.e?.type === 'cycle').length, 'cycles are merged');
  assert.ok(st.played['day.turn'] >= 25, 'the new day is heard on most days at 1x: ' + st.played['day.turn']);
  assert.ok(played > 0 && Object.keys(st.played).length >= 15, 'and it is not silent: ' + Object.keys(st.played).length + ' different sounds');
  un();
}));

// ---------------------------------------------------------------- the shell's cues
function cuesRig(over = {}) {
  const game = over.game || makeGame(['trades', 'pro'], 'ops', 13), emitted = [];
  if (over.leads) game.s.leads[1] = over.leads;
  const ctx = { S: { clock: { paused: false, now: () => game.s.hour }, roomInfo: null, ...over.S }, U: { zone: 1 }, g: () => game, emit: (e) => emitted.push(e) };
  const spoken = [], toasts = [], saved = [];
  const settings = over.settings || { audio: audioDefaults() };
  const cues = createCues(ctx, { settings, save: () => saved.push(1), announce: (m, a) => spoken.push([m, !!a, Date.now()]), toast: (m, l) => toasts.push([m, l]), supported: () => over.supported !== false });
  return { cues, ctx, game, emitted, spoken, toasts, settings, saved };
}
const lead = (id, o = {}) => ({ id, zone: 1, seg: 'x', budget: 100, need: null, born: 0, exp: 30, ...o });
test('cues: a district change and new buyers are told to the sound layer only after a baseline; the first render and a change of district are silent', async () => withRig({}, async (r) => {
  const t = cuesRig({ leads: [lead('L1'), lead('L2')] });
  t.cues.render(); assert.deepEqual(t.emitted, [], 'buyers already there are not news');
  t.game.s.leads[1].push(lead('L3')); t.cues.render();
  assert.deepEqual(t.emitted, [{ type: 'ui', ui: 'lead', zone: 1, ids: ['L3'], urgent: false }]);
  t.cues.render(); assert.equal(t.emitted.length, 1, 'once');
  t.ctx.U.zone = 2; t.game.s.leads[2] = [lead('M1', { zone: 2 })]; t.cues.render();
  assert.deepEqual(t.emitted.at(-1), { type: 'ui', ui: 'zone', id: 2 }); assert.equal(t.emitted.length, 2, 'the buyers of the new district did not ring');
  t.game.s.leads[2].push(lead('M2', { zone: 2 })); t.cues.render(); assert.equal(t.emitted.at(-1).ids[0], 'M2');
  t.game.s.leads[2].push(lead('M3', { zone: 2 }), lead('M4', { zone: 2 })); t.cues.session('rewound'); t.cues.render(); assert.equal(t.emitted.length, 3, 'after a rewind the buyers that were there are not news');
  t.cues.destroy();
}));
test('cues: urgent only when a sound crate of the player\'s can serve the need; a broken one, another district or no need is a plain arrival; the fraud flag is never read', async () => withRig({}, async (r) => {
  const t = cuesRig(), tags = Object.entries((await import('../js/config.js')).ASSETS).find(([, a]) => a.tags.length)[1], need = tags.tags[0], cls = Object.entries((await import('../js/config.js')).ASSETS).find(([, a]) => a.tags.includes(need))[0];
  t.game.s.assets = [{ id: 'A1', cls, zone: 1, cond: 'broken' }]; t.cues.render();
  const urgentOf = () => t.emitted.at(-1).urgent;
  t.game.s.leads[1] = [lead('L1', { need })]; t.cues.render(); assert.equal(urgentOf(), false, 'the crate is broken');
  t.game.s.assets[0].cond = 'ok'; t.game.s.leads[1].push(lead('L2', { need })); t.cues.render(); assert.equal(urgentOf(), true);
  t.game.s.assets[0].zone = 2; t.game.s.leads[1].push(lead('L3', { need })); t.cues.render(); assert.equal(urgentOf(), false, 'the crate is elsewhere');
  t.game.s.assets[0].zone = 1; t.game.s.leads[1].push(lead('L4', { need, scam: true }), lead('L5', { need: null, scam: false })); t.cues.render();
  const a = t.emitted.at(-1); t.game.s.leads[1].push(lead('L6', { need, scam: false }), lead('L7', { need: null, scam: true })); t.cues.render();
  assert.deepEqual({ ...a, ids: 0 }, { ...t.emitted.at(-1), ids: 0 }, 'a buyer\'s scam flag changes nothing');
  assert.ok(!JSON.stringify(t.emitted).includes('scam'));
  t.cues.destroy();
}));
test('cues: a clock far behind the game (a tab back, a rewind) sets the baseline instead of ringing', async () => withRig({}, async (r) => {
  const t = cuesRig({ S: { clock: { paused: false, now: () => 100 } } }); t.game.s.hour = 10; t.cues.render();
  t.game.s.leads[1] = [lead('L1'), lead('L2')]; t.cues.render(); assert.deepEqual(t.emitted, []);
  t.game.s.hour = 99; t.game.s.leads[1].push(lead('L3')); t.cues.render(); assert.equal(t.emitted.length, 1, 'caught up: new buyers are news again');
  t.cues.destroy();
}));
test('cues: lines for the screen reader are queued at least 700 ms apart, a burst of settlements is one line, and urgent is once a minute', async () => withRig({}, async (r) => {
  const t = cuesRig(); const tick = (ms) => r.clk.advance(ms);
  // the cues use real timers for the queue (they are not the engine's): run them on the real clock
  const real = { st: globalThis.setTimeout }; void real;
  t.cues.note({ text: 'Freight arrived in Harbor.', level: 'info' });
  for (let i = 0; i < 3; i++) t.cues.note({ text: '$12.00 settled into cash.', level: 'info' });
  t.cues.session('offer', { fromHandle: 'Pat' });
  await new Promise((res) => setTimeout(res, 2400)); tick(0);
  const lines = t.spoken.map((s) => s[0]);
  assert.deepEqual(lines, ['Freight arrived in Harbor.', 'Pat sent you a swap offer.', '3 payments settled.'], 'in the order they were queued: the settlements wait 80 ms to be counted');
  assert.ok(t.spoken.every((s, i) => i === 0 || s[2] - t.spoken[i - 1][2] >= SPEAK_GAP - 5), 'a line every 700 ms at most');
  assert.ok(t.spoken.every((s) => s[1] === false), 'all polite');
  t.cues.destroy();
}));
test('cues: the mentor\'s tip gets a toast; the urgent buyer is announced once a minute, not every time', async () => withRig({}, async (r) => {
  const t = cuesRig(); t.cues.note({ text: 'Your mentor says: look at Radio for Students in Campus. Few people are selling there.', level: 'info' });
  assert.equal(t.toasts.length, 1); assert.equal(t.toasts[0][1], 'info');
  const cfg = await import('../js/config.js'), [cls, def] = Object.entries(cfg.ASSETS).find(([, a]) => a.tags.length), need = def.tags[0];
  t.game.s.assets = [{ id: 'A1', cls, zone: 1, cond: 'ok' }]; t.cues.render();
  t.game.s.leads[1] = [lead('L1', { need })]; t.cues.render(); await real(20); t.game.s.leads[1].push(lead('L2', { need })); t.cues.render();
  r.clk.advance(URGENT_GAP + 1); t.game.s.leads[1].push(lead('L3', { need })); t.cues.render();
  await real(1600);
  assert.equal(t.spoken.filter((s) => /needs an? /.test(s[0])).length, 2, 'two announcements for three urgent buyers over a minute and a bit');
  t.cues.destroy();
}));
test('cues: net worth at zero is a toast of its own when the engine sends only the event, and not twice when it also writes the note', async () => {
  await withRig({}, async (r) => { const t = cuesRig(); t.cues.event({ type: 'insolvent' }); await Promise.resolve(); await Promise.resolve(); assert.deepEqual(t.toasts, [[INSOLVENT_TEXT, 'bad']]); t.cues.destroy(); });
  await withRig({}, async (r) => { const t = cuesRig(); t.cues.event({ type: 'insolvent' }); t.cues.note({ level: 'bad', text: INSOLVENT_TEXT }); await Promise.resolve(); await Promise.resolve(); assert.deepEqual(t.toasts, [], 'the note is the toast'); t.cues.destroy(); });
  await withRig({}, async (r) => { const t = cuesRig(); t.cues.note({ level: 'bad', text: INSOLVENT_TEXT }); t.cues.event({ type: 'insolvent' }); await Promise.resolve(); await Promise.resolve(); assert.deepEqual(t.toasts, [], 'and either way round'); t.cues.destroy(); });
});
test('cues: the first-minute note is shown once, and not muted, quiet, in a lesson, in a room or where Web Audio does not exist', async () => withRig({}, async (r) => {
  const t = cuesRig(); assert.equal(t.cues.hint(), true); assert.deepEqual(t.toasts, [[HINT_TEXT, 'info']]); assert.equal(t.settings.audio.hinted, true); assert.equal(t.saved.length, 1); assert.equal(t.cues.hint(), false, 'once');
  for (const [name, o] of [['muted', { settings: { audio: { ...audioDefaults(), mute: true } } }], ['Classroom', { settings: { audio: { ...audioDefaults(), quiet: true } } }], ['unsupported', { supported: false }], ['in a room', { S: { roomInfo: { code: 'ABC' } } }]]) { const u = cuesRig(o); assert.equal(u.cues.hint(), false, name); assert.deepEqual(u.toasts, [], name); u.cues.destroy(); }
  const lesson = makeGame(['trades', 'pro'], 'ops', 3); lesson.sandbox = true; const u = cuesRig({ game: lesson }); assert.equal(u.cues.hint(), false, 'a lesson'); u.cues.destroy();
  t.cues.destroy();
}));
test('the speaker button is left out where Web Audio does not exist', () => { assert.equal(speakerHTML(), ''); });
test('the speaker button says Sound, is pressed when sound is on, and shows the slashed speaker when it is off', async () => withRig({}, async () => {
  const on = speakerHTML(); assert.match(on, /aria-label="Sound"/); assert.match(on, /aria-pressed="true"/); assert.match(on, /data-act="sound"/); assert.match(on, /data-fid="hud-sound"/);
  const was = pageSettings.audio; pageSettings.audio = { ...was, mute: true }; const off = speakerHTML(); pageSettings.audio = was; assert.match(off, /aria-pressed="false"/); assert.match(off, /aria-label="Sound"/, 'the name never changes'); assert.notEqual(on, off);
}));

// ---------------------------------------------------------------- the world
function worldRig(over = {}) {
  const emitted = [], plays = [], player = { x: 10, y: 10, moving: false, path: [], ...over.player };
  const w = { player, drag: null, pointers: new Map(), calls: [], cv: { getBoundingClientRect: () => ({ left: over.left ?? 0, top: 0 }) },
    rectOf: (k, id) => (over.rects ? over.rects[k + '|' + id] ?? null : { x: 700, y: 100, w: 40, h: 40 }), w2s: (x, y) => [x * 40, y * 20], onView: () => over.onView !== false, reduced: () => !!over.reduced,
    zoomBy(f) { w.calls.push(['zoomBy', f]); }, fit(a) { w.calls.push(['fit', a]); } };
  const ctx = { emit: (e) => emitted.push(e), dlg: { el: { open: !!over.sheet } } };
  const out = { play: (id, o) => plays.push([id, o]) };
  const ws = createWorldSound(ctx, { world: () => w, audio: out, now: () => performance.now(), random: () => 0.5 });
  return { ws, w, emitted, plays, ctx };
}
test('world: the pointer must rest 120 ms on a thing; a sweep is silent, a touch is silent, a second tick waits a third of a second, a click quiets it', async () => withRig({}, async (r) => {
  const t = worldRig(), lot = { kind: 'lot', id: 'T3' }, buyer = { kind: 'lead', id: 'L4' };
  t.ws.hover(lot); t.ws.hover(buyer); t.ws.hover(null); t.ws.hover(lot); await real(40); t.ws.hover(buyer); await real(40); assert.deepEqual(t.emitted, [], 'moving over things is not resting');
  t.ws.hover(lot); await real(REST_MS + 60); assert.deepEqual(t.emitted, [{ type: 'ui', ui: 'hover', id: 'lot|T3' }]);
  t.ws.hover(buyer); await real(REST_MS + 20); assert.equal(t.emitted.length, 1, 'inside the 330 ms gap: ' + HOVER_GAP);
  r.clk.advance(2000); t.ws.hover(lot); await real(REST_MS + 20); assert.equal(t.emitted.length, 2, 'later it speaks again');
  r.clk.advance(2000); t.ws.hover(null); t.ws.hover(buyer, { pointerType: 'touch' }); await real(REST_MS + 20); assert.equal(t.emitted.length, 2, 'a finger is not a pointer');
  t.ws.hover(null); t.ws.clicked(lot); t.ws.hover(buyer); await real(REST_MS + 20); assert.equal(t.emitted.length, 2, 'never within 250 ms of a click');
  r.clk.advance(2000); t.ws.hover(null); t.w.drag = { moved: true }; t.ws.hover(lot); await real(REST_MS + 20); assert.equal(t.emitted.length, 2, 'not while the camera is dragged'); t.w.drag = null;
  t.ws.hover(null); t.ctx.dlg.el.open = true; t.ws.hover(buyer); await real(REST_MS + 20); assert.equal(t.emitted.length, 2, 'not under a sheet');
  t.ws.destroy();
}));
test('world: a click on a buyer or a lot is a full tick, on a truck a light one, on one of your crates the knock of how many are ticked now; a locked thing says so', async () => withRig({}, async () => {
  const t = worldRig({ rects: { 'lead|L1': { x: 100, y: 0, w: 20, h: 20 } } });
  t.ws.clicked({ kind: 'lead', id: 'L1' }); t.ws.clicked({ kind: 'lot', id: 'T1' }); t.ws.clicked({ kind: 'truck', id: 'F1' });
  assert.deepEqual(t.plays.map((p) => [p[0], p[1].variant]), [['ui.tick', 'full'], ['ui.tick', 'full'], ['ui.tick', 'light']]);
  assert.ok(t.plays[0][1].pan < -0.4, 'the buyer is on the left of a 1000 px window: ' + t.plays[0][1].pan);
  t.plays.length = 0; t.ws.clicked({ kind: 'asset', id: 'A1' }, { ticked: 3 }); t.ws.clicked({ kind: 'asset', id: 'A1' }, { ticked: 0 }); t.ws.clicked({ kind: 'asset', id: 'A1' });
  assert.deepEqual(t.plays, [['ui.crate', { variant: 'pick1', params: { n: 3 } }], ['ui.crate', { variant: 'clear' }]]);
  t.ws.locked({ kind: 'static', id: 'bank' }); assert.deepEqual(t.emitted.at(-1), { type: 'ui', ui: 'locked', id: 'static|bank' });
}));
test('world: footsteps begin with the first foot, come a step every 0.36 to 0.42 s, stop after eight, and are silent in Calm, under a sheet and off screen', async () => {
  for (const [name, o, want] of [['walking', {}, STEPS_MAX], ['Calm', { reduced: true }, 0], ['a sheet is open', { sheet: true }, 0], ['off screen', { onView: false }, 0]]) {
    await withRig({}, async (r) => {
      const t = worldRig({ player: { path: [[20, 10]], moving: true }, ...o });
      t.ws.poll(); const first = t.emitted.length; assert.equal(first, want ? 1 : 0, name + ': the first foot lands at once');
      await real(want ? 3700 : 800); t.ws.poll();
      assert.equal(t.emitted.filter((e) => e.ui === 'step').length, want, name);
      t.ws.destroy();
    });
  }
});
test('world: the footsteps listen only while there is a walk: no timer for a player standing still, and a new walk after an old one counts from one', async () => withRig({}, async () => {
  const t = worldRig({ player: { path: [], moving: false } });
  t.ws.poll(); await real(200); assert.deepEqual(t.emitted, []);
  t.w.player.path = [[1, 1]]; t.w.player.moving = true; t.ws.poll(); assert.equal(t.emitted.length, 1);
  await real(900); t.w.player.path = []; t.w.player.moving = false; await real(700);
  const n = t.emitted.length; t.w.player.moving = true; t.ws.poll(); assert.equal(t.emitted.length, n + 1, 'a new walk begins with its own first foot');
  t.ws.destroy();
}));
test('world: the camera on the wheel and the keys is heard once per 150 ms, a pinch is silent, and a camera button is left to the control table', async () => withRig({}, async (r) => {
  const t = worldRig(); t.ws.camera(t.w); t.ws.camera(t.w);
  t.w.zoomBy(1.2); assert.deepEqual(t.plays.at(-1), ['cam', { variant: 'in' }]); assert.deepEqual(t.w.calls.at(-1), ['zoomBy', 1.2], 'and the zoom still happens');
  t.w.zoomBy(1.2); t.w.zoomBy(1.2); assert.equal(t.plays.length, 1, 'a wheel turning is one sound');
  r.clk.advance(200); t.w.zoomBy(0.8); assert.equal(t.plays.at(-1)[1].variant, 'out');
  r.clk.advance(200); t.w.pointers.set(1, {}); t.w.pointers.set(2, {}); t.w.zoomBy(1.1); assert.equal(t.plays.length, 2, 'a pinch is silent'); t.w.pointers.clear();
  r.clk.advance(200); t.w.fit(true); assert.equal(t.plays.at(-1)[1].variant, 'fit'); r.clk.advance(200); t.w.fit(false); assert.equal(t.plays.length, 3, 'a fit made by the world itself is silent');
  r.clk.advance(200); t.ws.button(); t.w.zoomBy(1.25); assert.equal(t.plays.length, 3, 'the button was heard at its click');
  r.clk.advance(200); t.w.zoomBy(1); assert.equal(t.plays.length, 3, 'no change, no sound');
}));
test('world: where a thing is on the screen, in window pixels, for the pan; unknown things have none', async () => withRig({}, async () => {
  const t = worldRig({ left: 100, rects: { 'lead|L1': { x: 50, y: 10, w: 20, h: 20 }, 'zone|3': { x: 600, y: 0, w: 100, h: 40 } } });
  assert.deepEqual(t.ws.rectOf('thing', 'lead|L1'), { x: 150, y: 10, w: 20, h: 20 }); assert.deepEqual(t.ws.rectOf('zone', 3), { x: 700, y: 0, w: 100, h: 40 });
  assert.equal(t.ws.rectOf('thing', 'nonsense|1'), null); assert.equal(t.ws.rectOf('thing', 'lead|nobody'), null); assert.equal(t.ws.rectOf('thing', 'toString'), null);
  assert.ok(t.ws.rectOf('player', null).x > 0);
  assert.equal(t.ws.panOf({ x: 0, y: 0, w: 0, h: 0 }), -0.6); assert.equal(t.ws.panOf({ x: 1000, y: 0, w: 0, h: 0 }), 0.6); assert.ok(Math.abs(t.ws.panOf({ x: 480, y: 0, w: 40, h: 0 })) < 0.01);
}));

// ---------------------------------------------------------------- the shell's files
test('the shell wires the sound layer once, takes it down with the game, and says nothing that the sound layer says', () => {
  const sh = readFileSync(new URL('../js/ui/shell.js', import.meta.url), 'utf8');
  assert.equal((sh.match(/wireAudio\(ctx/g) || []).length, 1); assert.match(sh, /unwire\?\.\(\)/); assert.match(sh, /cues\?\.destroy\(\)/);
  assert.match(sh, /ui: 'close-drawer'/); assert.match(sh, /audio\.request\('quest\.complete'\)/); assert.match(sh, /audio\.request\('codex\.unlock'\)/); assert.match(sh, /M<\/b> to mute/);
  assert.match(sh, /sound\(\) \{/, 'the speaker button\'s act');
});
test('the Draft plays its own sounds and tells the control table so (cards and Remove/Clear/Reroll are own-sound acts; Begin is data-snd)', async () => {
  const d = await import('../js/ui/draft.js'), st = d.draftInit({ picks: ['trades'] }), html = d.draftHTML(st);
  assert.match(html, /id="dr-begin" data-snd/); assert.match(html, /<form[^>]* data-snd>/);
  for (const act of ['pick', 'drop', 'clear', 'reroll']) assert.equal(wire.controlFor({ act, kind: act === 'pick' ? 'change' : 'click', checkbox: true }), null, act);
  const src = readFileSync(new URL('../js/ui/draft.js', import.meta.url), 'utf8');
  for (const s of ["'draft.pick'", "'ui.refuse'", "request('draft.begin')", 'rattle']) assert.ok(src.includes(s), s);
});
