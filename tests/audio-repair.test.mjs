// Regression tests for the audio repair round (docs/AUDIO.md 11.5): each one fails on the code before the round. Engine and palette first (a fake clock and a recording fake context), then the
// settings section, the wiring tables, the shell's call sites and the page's observers (a small stand-in for the document, with the dialog and the toasts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeContext, fakeClock } from './helpers/fakeaudio.mjs';

// ---------------------------------------------------------------- a page stand-in (before the app's modules are imported)
const listeners = new Map(), els = {};
let observers = [];
globalThis.innerWidth = 1000;
globalThis.addEventListener = () => {};
globalThis.MutationObserver = class { constructor(fn) { this.fn = fn; observers.push(this); } observe(el) { this.el = el; } };
globalThis.document = {
  hidden: false,
  addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
  removeEventListener() {},
  getElementById: (id) => els[id] || null,
  querySelectorAll: () => [],
};
const dlg = { open: false, classList: { contains: () => false }, querySelector: () => null };
const toasts = {};
els.dlg = dlg; els.toasts = toasts;
const pageKv = new Map();
const kv = { get: (k) => (pageKv.has(k) ? JSON.parse(pageKv.get(k)) : null), set: (k, v) => { pageKv.set(k, JSON.stringify(v)); return true; }, del: (k) => { pageKv.delete(k); } };

const { createAudio, LIMITS } = await import('../js/audio/engine.js');
const { audioDefaults, applyPreset, presetOf, statusText, whyQuiet, audible, audioSettingsHTML, syncAudioSettings, bindAudioSettings, joinRoom, TEST_STEPS, migrateAudio, HINT_PAGE_TEXT } = await import('../js/audio/settings.js');
const { RECIPES, IDS, variantsOf, layersFor, durationComp, tierComp, trimDbOf, sentenceRank, TIER_TARGET } = await import('../js/audio/recipes.js');
const { voice, hz, PAN_COMP_DB } = await import('../js/audio/palette.js');
const { createResolverState, resolveBurst, gateClock, RULES } = await import('../js/audio/resolve.js');
const wire = await import('../js/audio/wire.js');
const { audio: page } = await import('../js/audio/instance.js');
const { createWorldSound } = await import('../js/ui/worldsound.js');

const rngOf = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
function rig(settings = {}, o = {}) {
  const ctx = fakeContext(o.ctx), clock = fakeClock(), s = { ...audioDefaults(), ...settings };
  let made = 0;
  const factory = () => { made++; return ctx; };
  const audio = createAudio({ get: () => s, now: clock.now, factory, timers: clock.timers_, random: rngOf(7), measure: false });
  if (o.unlock !== false) audio.unlock();
  return { audio, ctx, clock, s, made: () => made };
}

// ================================================================================ M1 (render): pan
/** Total power of both channels for one voice: its gain squared times the panner's two equal-power gains. */
function totalPower(ctx) {
  const g = ctx.nodes.find((n) => n.kind === 'gain'), p = ctx.nodes.find((n) => n.kind === 'pan');
  const gain = g.gain.value;
  if (!p) return 2 * gain * gain; // no panner: the voice feeds both sides at unity
  const th = (p.pan.value + 1) * Math.PI / 4;
  return gain * gain * (Math.cos(th) ** 2 + Math.sin(th) ** 2);
}
test('a panned voice is as loud as a centred one: the equal-power panner is always there and its -3 dB is made up in the voice gain', () => {
  const layers = layersFor('sale.win', 'w');
  const power = (pan) => { const ctx = fakeContext(); voice(ctx, ctx.destination, layers, 0, { seed: 1, noJitter: true, pan }); return totalPower(ctx); };
  const ref = power(0);
  for (const pan of [undefined, 0.02, 0.3, 0.6, 1, -0.6]) assert.ok(Math.abs(10 * Math.log10(power(pan) / ref)) < 0.1, `pan ${pan}`);
  const bare = fakeContext(); delete bare.createStereoPanner; // a browser with no panner: straight to the bus, no compensation
  voice(bare, bare.destination, layers, 0, { seed: 1, noJitter: true, pan: 0.3 });
  assert.ok(Math.abs(10 * Math.log10(totalPower(bare) / ref)) < 0.1, 'the same total with no panner at all');
  assert.ok(Math.abs(PAN_COMP_DB - 3.0103) < 0.001);
});
test('the engine pans every voice, an unknown place included (hooks.pan answers 0, not undefined)', () => {
  const t = rig();
  t.audio.play('ui.ok');
  assert.equal(t.ctx.count('pan'), 1, 'one panner for the one voice, with no pan asked');
  assert.equal(t.ctx.nodes.find((n) => n.kind === 'pan').pan.value, 0);
  const src = readFileSync(new URL('../js/audio/wire.js', import.meta.url), 'utf8');
  assert.ok(/if \(!r\) return 0;/.test(src) && !/return undefined; \} catch \{ return undefined/.test(src), 'a thing whose place is unknown is centred');
});

// ================================================================================ M2, M3 (render): the buckets and the moment queue
test('a sale with an xl coin still has its second sentence: the bucket is the cause\'s own tier and the burst\'s level-up does not queue behind the burst\'s own coin', () => {
  for (const pressed of [false, true]) { // the deal that made the sale was a press a moment ago, or the clock made it long after
    for (const level of [10, 3]) {
      const t = rig();
      if (pressed) t.audio.setEnv({ lastPress: t.clock.now() });
      t.audio.request('sale.win', { variant: 'w', cause: 'money', with: [['cash.in', { size: 'xl', cause: 'money', gainDb: -4 }], ['streak', { params: { n: 3 }, gainDb: 5 }]] });
      t.audio.request('level.up', { meta: { level } });
      t.clock.flush();
      const st = t.audio.stats(), tag = `pressed ${pressed}, level ${level}`;
      assert.equal(st.played['sale.win'], 1, tag); assert.equal(st.played['cash.in'], 1, tag);
      assert.equal(st.played['level.up'], 1, tag + ': the second sentence plays');
      assert.equal(st.dropped.bucket, undefined, tag + ': nothing is dropped for the loud bucket'); assert.equal(st.dropped.budget, undefined, tag);
      assert.equal(st.maxSentences, 2, tag);
    }
  }
});
test('a pioneer sale with an xl coin plus a milestone plays both, and the milestone is not the one dropped', () => {
  const t = rig();
  t.audio.request('sale.pioneer', { variant: 'p', cause: 'money', with: [['cash.in', { size: 'xl', cause: 'money', gainDb: -4 }]] });
  t.audio.request('milestone', { variant: 'm2' }); t.audio.request('level.up', { meta: { level: 5 } });
  t.clock.flush();
  const p = t.audio.stats().played;
  assert.equal(p['sale.pioneer'], 1); assert.equal(p.milestone, 1, 'the best reward is the second sentence'); assert.equal(p['level.up'], undefined, 'the rest is an also tick, not a sentence');
});
test('the bucket still limits a stream of loud sounds from different bursts', () => {
  const t = rig();
  t.audio.request('milestone', { variant: 'm1' }); t.clock.flush();
  t.clock.advance(200); t.audio.request('zone.open', { variant: 't4' }); t.clock.flush();
  assert.equal(t.audio.stats().played['zone.open'], undefined, 'a second loud burst 200 ms after the first is held back');
});
test('alert.insolvent and alert.margin-call always play, even a second after another loud sound, and stop a moment in progress', () => {
  for (const [first, firstOpts, alertId] of [['alert.shock', { variant: 'fed' }, 'alert.insolvent'], ['level.up', { variant: 'big' }, 'alert.margin-call'], ['alert.shock', { variant: 'tariff' }, 'alert.margin-call']]) {
    const t = rig();
    t.audio.request(first, firstOpts); t.clock.flush(); t.clock.advance(500);
    t.audio.request(alertId, {}); t.clock.flush();
    const st = t.audio.stats();
    assert.equal(st.played[alertId], 1, `${alertId} after ${first}`); assert.equal(st.dropped.bucket, undefined);
  }
  const t = rig();
  t.audio.request('level.up', { variant: 'big' }); t.clock.flush(); t.clock.advance(600);
  const before = t.ctx.count('gain');
  t.audio.request('alert.margin-call', {}); t.clock.flush();
  assert.ok(t.ctx.count('gain') > before);
  assert.ok(t.audio._voices.some((v) => v.id === 'alert.margin-call'));
});

// ================================================================================ M5, m6, m11 (render): contours and ladders
/** The first and the last salient note of a variant (tones and banks above 250 Hz, no sawtooth, at least half the loudest note's gain), in semitones apart. */
function contour(layers) {
  const it = [];
  for (const L of layers) { if ((L.k !== 'tone' && L.k !== 'bank') || L.type === 'sawtooth') continue; const f = hz(L.f); if (f >= 250) it.push({ t: L.t || 0, f, g: L.g ?? 1 }); }
  const mx = Math.max(...it.map((x) => x.g)), sal = it.filter((x) => x.g >= mx * 0.5).sort((a, b) => a.t - b.t || a.f - b.f);
  return Math.round(12 * Math.log2(sal[sal.length - 1].f / sal[0].f));
}
test('a gain climbs: the last salient note of every gain is at least 1.5 semitones above the first (cash.in l ended a fifth below where it began)', () => {
  const GAINS = ['cash.in#m', 'cash.in#l', 'cash.in#xl', 'cash.in#settle', 'sale.win#w', 'sale.pioneer#p', 'streak#n6', 'pitch.fit#up', 'deal.verify#ok', 'audit.result#pass', 'bank.repay#half', 'bank.repay#full', 'bank.repay#free', 'level.up#s', 'level.up#l', 'quest.complete#quest', 'milestone#m1', 'zone.open#t4', 'skill.up#s', 'repair.done#great', 'bid.hammer#won', 'hire.manager#logistics', 'inst.cue#deploy'];
  for (const k of GAINS) { const [id, v] = k.split('#'); assert.ok(contour(layersFor(id, v)) >= 1.5, `${k} climbs`); }
});
test('a loss or a refusal does not climb', () => {
  for (const k of ['cash.out#m', 'cash.out#l', 'ui.toggle#off', 'bid.rival#out', 'pitch.fit#down']) { const [id, v] = k.split('#'); const c = contour(layersFor(id, v)); assert.ok(c <= 0, `${k} falls or stays (${c})`); }
});
test('the insolvent slide stops above 150 Hz and the rival\'s dropout falls a fourth, not a tone', () => {
  const slide = layersFor('alert.insolvent', 'i').find((L) => L.k === 'tone' && L.f2);
  assert.ok(hz(slide.f2) >= 146 && hz(slide.f2) < hz(slide.f), 'A4 to D3');
  const out = layersFor('bid.rival', 'out').find((L) => L.f2);
  assert.equal(Math.round(12 * Math.log2(hz(out.f) / hz(out.f2))), 5, 'D5 to A4, a fourth');
});
test('the duration compensation is a smooth curve: +5.5 dB for the shortest tick down to -1 dB for the longest, never a step', () => {
  assert.equal(durationComp(30), 5.5); assert.equal(durationComp(360), 0); assert.ok(durationComp(900) <= -0.9);
  let last = null; for (let ms = 30; ms <= 900; ms += 10) { const c = durationComp(ms); if (last != null) { assert.ok(c <= last + 1e-9, 'never rises with length'); assert.ok(last - c < 0.6, `no step at ${ms} ms`); } last = c; }
  assert.equal(tierComp('loud', 100), 0); assert.equal(tierComp('medium', 800), 0, 'a long medium sound is not touched, the gap to the loud tier holds'); assert.ok(tierComp('medium', 140) > 2);
  assert.ok(durationComp(60) >= 4.5, 'under-60 ms ticks were 3 dB low');
});
test('a refusal is no louder than a confirmation, and every loss twin is softer than its gain', () => {
  assert.equal(trimDbOf('ui.refuse', 'r'), 0); assert.equal(trimDbOf('world.locked', 'l'), 0);
  for (const k of ['cash.out#l', 'sale.herd#h', 'sale.scam#s', 'ui.toggle#off', 'sale.reject#fake', 'bank.draw#b']) { const [id, v] = k.split('#'); assert.ok(trimDbOf(id, v) <= -1.5, k); }
  const src = readFileSync(new URL('../scripts/audio-check.mjs', import.meta.url), 'utf8');
  assert.match(src, /LOSS_TWINS/); assert.match(src, /share250 < 0\.4/); assert.match(src, /LAPTOP_TOL/); assert.match(src, /panPower/);
});
test('every sound of the map but the beds has a mid body: the recipes of the former bass-heavy group carry a layer above 250 Hz', () => {
  const MID = ['ui.slider#zero', 'world.step#a', 'world.step#b', 'buy.lot#ok', 'buy.lot#broken', 'deal.result#info', 'haggle.close#accept', 'alert.shock#fed', 'alert.shock#tariff', 'alert.margin-call#m', 'ship.depart#s', 'repair.stop#ok', 'bid.rival#in', 'inst.cue#deploy', 'inst.cue#start'];
  for (const k of MID) { const [id, v] = k.split('#'); assert.ok(layersFor(id, v).some((L) => ((L.k === 'tone' || L.k === 'bank') && hz(L.f) >= 292 && (L.g ?? 1) >= 0.12) || (L.k === 'noise' && L.bp && L.bp[0] >= 400 && (L.g ?? 0) >= 0.25)), `${k} has a tone at D4 or higher, or a band of noise above 400 Hz`); }
});

// ================================================================================ W5, m10 (resolver)
const env = (o = {}) => ({ speed: 1, durOf: (id) => (RECIPES[id].dur) * 1000, ...o });
const R = (id, opts = {}, meta = {}) => ({ id, opts, meta });
test('the new day outranks a manager\'s coin and a freight ding of the same step: the chime is not lost on every day a manager runs', () => {
  assert.ok(sentenceRank('day.turn') > sentenceRank('manager.cycle')); assert.ok(sentenceRank('day.turn') > sentenceRank('ship.arrive'));
  const out = resolveBurst(createResolverState(), [R('manager.cycle', {}, { net: 20 }), R('day.turn', { clock: true })], env(), 100000);
  assert.equal(out.plays[0].mix[0][0], 'day.turn'); assert.deepEqual(out.dropped.map((d) => d.id), ['manager.cycle']);
  const order = resolveBurst(createResolverState(), [R('day.turn'), R('manager.cycle', {}, { net: 20 })], env(), 100000);
  assert.equal(order.plays[0].mix[0][0], 'day.turn', 'whichever the engine emitted first');
});
test('the also tick waits for the tail of the last full sentence and is 3 dB under a full sound', () => {
  const st = createResolverState(), now = 100000;
  const out = resolveBurst(st, [R('milestone', { variant: 'm1' }), R('level.up', {}, { level: 3 }), R('quest.complete'), R('daily.done')], env(), now);
  const also = out.plays.find((p) => p.role === 'also'), s2 = out.plays.find((p) => p.role === 's2');
  assert.ok(also, 'a tick plays'); assert.equal(also.mix[0][1].gainDb, -3);
  assert.ok(also.delay >= s2.delay + 0.65 * RECIPES['level.up'].dur * 1000 - 5 || also.delay >= RULES.TICK_WAIT_MAX - 5, `the tick (${also.delay} ms) follows the tail of the reward (${s2.delay} ms)`);
  assert.ok(also.delay <= s2.delay + RULES.TICK_WAIT_MAX);
  const alone = resolveBurst(createResolverState(), [R('sale.win', { variant: 'w' }), R('quest.complete'), R('daily.done')], env(), now);
  assert.ok(alone.plays.find((p) => p.role === 'also').delay >= 140);
});
test('a buyer does not ring while the Market drawer is open', () => {
  const st = createResolverState();
  assert.equal(gateClock(st, { id: 'buyer.arrive', opts: {}, meta: {} }, { speed: 1, market: true }, 1000).ok, false);
  assert.equal(gateClock(st, { id: 'buyer.arrive', opts: {}, meta: {} }, { speed: 1, market: false }, 1000).ok, true);
  const t = rig(); t.audio.setEnv({ market: true });
  assert.equal(t.audio.request('buyer.arrive', { clock: true }), false);
});

// ================================================================================ W11, W12, A5, M3/M4 (browser): the engine's gates
test('burnout\'s nudge is a state sound: it plays on entering, then once per 45 s, and not while the engine is catching up', () => {
  const t = rig();
  assert.equal(t.audio.request('ui.nudge', { state: 'burnout' }), true);
  t.clock.advance(1000); assert.equal(t.audio.request('ui.nudge', { state: 'burnout' }), false, 'a second one a second later is dropped');
  t.clock.advance(46000); assert.equal(t.audio.request('ui.nudge', { state: 'burnout' }), true, 'and it plays again after 45 s');
  t.audio.setEnv({ justVisible: true, lastPress: -Infinity }); t.clock.advance(46000);
  assert.equal(t.audio.request('ui.nudge', { state: 'burnout' }), false, 'a tab just back from hidden is catching up');
  assert.equal(t.audio.stats().dropped.catchup, 1);
});
test('the repair dial tone is a game-bus voice: with Game sounds off it does not start, and it stops when Game sounds go off', () => {
  const off = rig({ dial: true, game: false });
  assert.equal(off.audio.dial.start(), false); assert.equal(off.audio.play('cash.in', { size: 'm' }), null);
  const on = rig({ dial: true, game: true });
  assert.equal(on.audio.dial.start(), true); on.s.game = false; on.audio.sync(); assert.equal(on.audio.dial.active, false, 'sync stops it');
});
test('the world\'s ticks have a switch: hover and footsteps off, the locked gate and everything else on', () => {
  const t = rig({ worldTicks: false });
  assert.equal(t.audio.play('world.hover', {}), null); assert.equal(t.audio.play('world.step', {}), null);
  assert.ok(t.audio.play('world.locked', {}), 'a refusal is not a tick'); assert.ok(t.audio.play('ui.tick', {}));
  assert.equal(t.audio.stats().dropped.bus, 2);
  const on = rig({}); assert.ok(on.audio.play('world.hover', {})); assert.equal(audioDefaults().worldTicks, true);
  assert.equal(migrateAudio({ audio: { v: 1, worldTicks: false } }).worldTicks, false); assert.equal(migrateAudio({ audio: { v: 1, worldTicks: 'no' } }).worldTicks, true);
});
test('volume 0 is silence: no voice is built, no oscillator is made', () => {
  const t = rig({ master: 0 });
  const before = t.ctx.nodes.length;
  assert.equal(t.audio.play('cash.in', { size: 'xl' }), null); assert.equal(t.audio.play('ui.tick'), null);
  assert.equal(t.ctx.nodes.length, before, 'nothing built'); assert.ok(t.audio.stats().dropped.mute >= 2);
  t.s.master = 70; t.audio.sync(); assert.ok(t.audio.play('ui.tick'), 'and sound is back when the volume is');
});
test('a muted page makes no context and runs none; unmuting after a gesture makes it', () => {
  const t = rig({ mute: true }, { unlock: false });
  const press = () => t.audio.unlock();
  press(); press();
  assert.equal(t.made(), 0, 'the first gesture on a muted page makes no AudioContext'); assert.equal(t.audio.state, 'locked');
  assert.equal(t.clock.pending(), 0, 'and no timer');
  t.s.mute = false; t.audio.sync();
  assert.equal(t.made(), 1, 'unmuting makes it'); assert.equal(t.audio.state, 'running'); assert.ok(t.audio.play('ui.ok'));
  const fresh = rig({ mute: true }, { unlock: false });
  fresh.s.mute = false; fresh.audio.sync(); assert.equal(fresh.made(), 0, 'before any gesture nothing is made either');
  const vol = rig({ master: 0 }, { unlock: false }); vol.audio.unlock(); assert.equal(vol.made(), 0, 'volume 0 is silent too'); vol.s.master = 40; vol.audio.sync(); assert.equal(vol.made(), 1);
});
test('a preset other than Off unmutes (the select was a trap once Off was chosen)', () => {
  const t = rig({ mute: true });
  t.audio.applyPreset('classroom'); assert.equal(t.s.mute, false); assert.equal(presetOf(t.s), 'classroom');
  t.audio.applyPreset('off'); assert.equal(t.s.mute, true);
});

// ================================================================================ the settings section
/** A section made of stand-ins, one element for each id the markup has: enough to see what syncAudioSettings and bindAudioSettings do. */
function section(a, state = 'running') {
  const html = audioSettingsHTML(a, state), made = {};
  const ids = [...html.matchAll(/id="(s-[a-z-]+)"/g)].map((m) => m[1]);
  const keyOf = { 's-preset': 'preset', 's-vol': 'master', 's-mute': 'mute', 's-ui': 'ui', 's-game': 'game', 's-world': 'worldTicks', 's-clock': 'clockSounds', 's-amb': 'ambient', 's-ambvol': 'ambientLevel', 's-dial': 'dial', 's-mkey': 'mKey' };
  for (const id of ids) {
    const type = /vol$/.test(id) ? 'range' : id === 's-preset' ? 'select' : id === 's-sample' ? 'button' : /-h$/.test(id) || id === 's-status' ? 'span' : 'checkbox';
    const e = { id, type, checked: false, value: '', disabled: false, textContent: '', dataset: {}, attrs: {}, children: [], setAttribute(k, v) { e.attrs[k] = v; }, querySelector: () => null, appendChild(o) { e.children.push(o); }, ownerDocument: { createElement: () => ({}) }, remove() {} };
    if (keyOf[id]) e.dataset.snd = keyOf[id];
    if (id.endsWith('-h')) e.dataset.h = id.slice(0, -2);
    made[id] = e;
  }
  const sec = { querySelector: (sel) => (sel.startsWith('#') ? made[sel.slice(1)] || null : null), querySelectorAll: (sel) => (sel === '[data-h]' ? Object.values(made).filter((e) => e.dataset.h) : []) };
  const root = { isConnected: true, querySelector: (sel) => (sel === 'fieldset.snd' ? sec : sel.startsWith('#') ? made[sel.slice(1)] || null : null), querySelectorAll: (sel) => (sel === '[data-snd]' ? Object.values(made).filter((e) => e.dataset.snd) : []) };
  syncAudioSettings(root, a, state);
  return { root, made, html };
}
test('the Sound section is updated in place: the Classroom rule disables its rows, nothing is replaced, and the status line is true', () => {
  const a = audioDefaults(), s = section(a);
  const before = s.made['s-clock'];
  syncAudioSettings(s.root, { ...a, quiet: true }, 'running');
  assert.equal(s.made['s-clock'], before, 'the same element, so the cursor stays on it');
  assert.equal(s.made['s-clock'].disabled, true); assert.equal(s.made['s-amb'].disabled, true); assert.equal(s.made['s-dial'].disabled, true);
  assert.equal(s.made['s-clock-h'].textContent, 'Off in Classroom.'); assert.equal(s.made['s-world'].disabled, true);
  syncAudioSettings(s.root, { ...a, mute: true, master: 0 }, 'running');
  assert.match(s.made['s-status'].textContent, /^Sound is off/); assert.equal(s.made['s-ui-h'].textContent, 'Muted.');
  assert.equal(s.made['s-vol'].value, '0'); assert.equal(s.made['s-vol'].attrs['aria-valuetext'], '0 percent');
});
test('the markup names each reason: aria-describedby on the rows, no disabled option selected, a Custom entry only while the mix is custom', () => {
  const quiet = audioSettingsHTML({ ...audioDefaults(), quiet: true, clockSounds: false }, 'running');
  for (const id of ['s-ui', 's-game', 's-world', 's-clock', 's-amb', 's-dial']) assert.match(quiet, new RegExp(`id="${id}"[^>]*aria-describedby="${id}-h"`), id);
  assert.match(quiet, /id="s-clock-h"[^>]*>Off in Classroom\./);
  assert.ok(!/<option value="custom"[^>]*disabled/.test(audioSettingsHTML({ ...audioDefaults(), game: false, quiet: true }, 'running')), 'Custom is not "unavailable"');
  assert.ok(/<option value="custom" selected>/.test(audioSettingsHTML({ ...audioDefaults(), game: false, quiet: true }, 'running')));
  assert.ok(!/value="custom"/.test(audioSettingsHTML(audioDefaults(), 'running')));
  assert.match(audioSettingsHTML(audioDefaults(), 'running'), /World sounds \(hover ticks and footsteps\)[\s\S]*Keyboard shortcut: M/);
});
test('the status line never says sound is on when nothing can be heard, and says what is off', () => {
  const a = audioDefaults();
  assert.match(statusText({ ...a, master: 0 }, 'running'), /Volume is at 0/); assert.match(statusText({ ...a, ui: false, game: false }, 'running'), /both off/);
  assert.match(statusText({ ...a, game: false }, 'running'), /Game sounds are off: coins and alerts are silent/); assert.match(statusText({ ...a, ui: false }, 'locked'), /Interface sounds are off/);
  assert.match(statusText(a, 'locked'), /^Sound is on\. Your browser starts audio/); assert.match(statusText({ ...a, mute: true }, 'running'), /^Sound is off/);
  assert.equal(audible({ ...a, master: 0 }), false); assert.equal(audible({ ...a, ui: false, game: false }), false); assert.equal(audible(a), true);
  assert.match(whyQuiet({ ...a, mute: true }), /muted/); assert.match(whyQuiet({ ...a, master: 0 }), /Volume is at 0/); assert.equal(whyQuiet(a), '');
});
test('the section\'s controls: a preset unmutes and says so truthfully, a slider moves the engine and is stored once when let go, the test refuses when nothing can be heard and cannot stack', async () => {
  const calls = [], said = [];
  const settings = { audio: { ...audioDefaults(), mute: true, touched: true } };
  const audio = { state: 'running', sync: () => calls.push('sync'), play: (id, o) => calls.push(['play', id, o]), unlock: () => calls.push('unlock'), on: () => () => {} };
  const s = section(settings.audio);
  let saves = 0;
  bindAudioSettings(s.root, { audio, settings, save: () => { saves++; }, announce: (m) => said.push(m) });
  // the preset
  const pre = s.made['s-preset']; pre.value = 'full'; pre.onchange();
  assert.equal(settings.audio.mute, false); assert.equal(presetOf(settings.audio), 'full'); assert.match(said.at(-1), /Sound preset: Full\. Sound is on\./);
  pre.value = 'off'; pre.onchange(); assert.equal(settings.audio.mute, true); assert.equal(said.at(-1), 'Sound preset: Off.');
  // the slider
  settings.audio = { ...audioDefaults() }; saves = 0; calls.length = 0;
  const vol = s.made['s-vol']; vol.value = '40'; vol.oninput(); vol.value = '45'; vol.oninput();
  assert.equal(settings.audio.master, 45); assert.equal(saves, 0, 'dragging stores nothing and redraws nothing'); assert.ok(calls.includes('sync'), 'but the engine follows the thumb');
  vol.onchange(); assert.equal(saves, 1, 'let go: stored once');
  assert.equal(s.made['s-vol'].attrs['aria-valuetext'], '45 percent');
  // the test button
  const btn = s.made['s-sample'];
  settings.audio = { ...audioDefaults(), master: 0 }; said.length = 0; calls.length = 0; btn.onclick();
  assert.match(said[0], /Volume is at 0/); assert.ok(!calls.some((c) => c[0] === 'play'), 'no claim of a sound that cannot be heard');
  settings.audio = { ...audioDefaults() }; said.length = 0; btn.onclick(); btn.onclick();
  assert.equal(said.length, 1, 'a second press while it plays does nothing');
  assert.match(said[0], /a click, a warning, then coins/);
  assert.deepEqual(TEST_STEPS.map((x) => x[1]), ['ui.tick', 'alert.advance', 'cash.in'], 'the last thing heard is the coins, not the warning');
  await new Promise((r) => setTimeout(r, TEST_STEPS.at(-1)[0] + 100));
  assert.equal(calls.filter((c) => c[0] === 'play').length, 3, 'three sounds, once');
});
test('M can be switched off; the speaker button stays', () => {
  const src = readFileSync(new URL('../js/audio/wire.js', import.meta.url), 'utf8');
  assert.match(src, /a\.mKey === false\) return/); assert.equal(audioDefaults().mKey, true);
});

// ================================================================================ the Classroom rule (W3)
test('a student who joins a room gets Classroom with one toast, the earlier values are kept, and leaving puts back what the room changed and keeps what the player did', () => {
  const toastsSeen = [], d = { settings: { audio: { ...audioDefaults(), master: 55 } }, kv, save: () => {}, toast: (m, l) => toastsSeen.push([m, l]) };
  pageKv.clear();
  assert.equal(wire.applyRoomRule(d, true), 'joined');
  assert.equal(d.settings.audio.quiet, true); assert.equal(d.settings.audio.master, 55, 'the volume stays where the player put it'); assert.equal(d.settings.audio.touched, false);
  assert.deepEqual(toastsSeen, [[wire.ROOM_TOAST, 'info']]); assert.ok(kv.get(wire.BEFORE_ROOM));
  assert.equal(wire.applyRoomRule(d, true), null, 'once'); assert.equal(toastsSeen.length, 1);
  assert.equal(wire.applyRoomRule(d, false), 'left');
  assert.equal(d.settings.audio.master, 55); assert.equal(d.settings.audio.quiet, false); assert.equal(kv.get(wire.BEFORE_ROOM), null);
  // touched by hand: never
  const t = { settings: { audio: { ...audioDefaults(), touched: true } }, kv, save: () => {}, toast: () => { throw new Error('no toast'); } };
  assert.equal(wire.applyRoomRule(t, true), null); assert.equal(t.settings.audio.quiet, false);
  // changed meanwhile: the player's change stands, and the room's rule is still released (fifth round, U1: any change at all used to leave the student in Classroom for good)
  const c = { settings: { audio: { ...audioDefaults() } }, kv, save: () => {}, toast: () => {} };
  wire.applyRoomRule(c, true); c.settings.audio = { ...c.settings.audio, master: 30, touched: true };
  wire.applyRoomRule(c, false); assert.equal(c.settings.audio.master, 30, 'the player\'s own change stands'); assert.equal(c.settings.audio.quiet, false, 'and what the room changed goes back');
  const e = { settings: { audio: { ...audioDefaults() } }, kv, save: () => {}, toast: () => {} };
  wire.applyRoomRule(e, true); e.settings.audio = { ...e.settings.audio, ui: false, touched: true };
  wire.applyRoomRule(e, false); assert.equal(e.settings.audio.ui, false, 'a choice of the mix stands'); assert.equal(e.settings.audio.quiet, false); assert.equal(e.settings.audio.clockSounds, true);
  pageKv.clear();
});
test('wireGame applies the rule for a student in a room and again when the room is left', () => {
  pageKv.clear();
  const keep = page.env; // the page engine: wireGame reads its own deps from initAudio below
  const dep = { settings: { audio: { ...audioDefaults() } }, kv, save: () => {}, announce: () => {}, toast: () => {} };
  wire._resetForTest?.();
  wire.initAudio(dep);
  const S = { roomInfo: { code: 'ABC', role: 'student' }, clock: { paused: false, speed: 1 }, on(fn) { this.fn = fn; return () => {}; }, game: null };
  const ctx = { S, U: { zone: 1 }, g: () => null, on: () => () => {} };
  const unwire = wire.wireGame(ctx);
  assert.equal(dep.settings.audio.quiet, true, 'joined at mount');
  S.roomInfo = null; S.fn('tick', {});
  assert.equal(dep.settings.audio.quiet, false, 'put back when a tick finds no room');
  unwire(); pageKv.clear(); void keep;
});

// ================================================================================ the wiring tables
test('a pool sale whose cash lands later plays no coin at the sale; the ledger row says so; an immediate one keeps its coin', () => {
  const later = { ledger: [{ type: 'pool', text: 'Sold 2 asset(s) to the Metro liquidity pool (settles in 24h)', amt: 900 }] }, now = { ledger: [{ type: 'pool', text: 'Sold 2 asset(s) to the Metro liquidity pool', amt: 900 }] };
  assert.equal(wire.poolDelayed(later), true); assert.equal(wire.poolDelayed(now), false); assert.equal(wire.poolDelayed({}), false); assert.equal(wire.poolDelayed({ ledger: [] }), false);
  const ev = { type: 'sell-pool', zone: 9, total: 2000, count: 2 };
  assert.deepEqual(wire.eventCalls(ev, wire.newWireState(), { poolDelayed: () => true })[0][2].with, []);
  assert.equal(wire.eventCalls(ev, wire.newWireState(), { poolDelayed: () => false })[0][2].with[0][0], 'cash.in');
  assert.deepEqual(wire.eventCalls({ ...ev, delay: 24 }, wire.newWireState(), {})[0][2].with, [], 'and the engine\'s own delay, when it sends one, is read first');
});
test('a hire, a level, an upgrade and a client play their cash.out at size l or larger, from the ledger row the engine wrote a line before', () => {
  const s = { hour: 40, ledger: [{ h: 40, type: 'hire', text: 'Hired', amt: -8000 }] };
  assert.equal(wire.lastSpend(s, 'hire'), 8000); assert.equal(wire.lastSpend(s, 'client'), 0, 'not another kind\'s row'); assert.equal(wire.lastSpend({ ...s, hour: 41 }, 'hire'), 0, 'not an old one'); assert.equal(wire.lastSpend({ hour: 1, ledger: [{ h: 1, type: 'hire', amt: 5 }] }, 'hire'), 0, 'not a gain');
  const hooks = { cost: (k) => wire.lastSpend(s, k), netWorth: () => 1e6 };
  const hire = wire.eventCalls({ type: 'hire', kind: 'broker' }, wire.newWireState(), hooks)[0][2];
  assert.equal(hire.with[0][0], 'cash.out'); assert.equal(hire.with[0][1].size, 'l');
  const cl = { hour: 9, ledger: [{ h: 9, type: 'client', amt: -40000 }] };
  const client = wire.eventCalls({ type: 'client', tier: 'ent' }, wire.newWireState(), { cost: (k) => wire.lastSpend(cl, k), netWorth: () => 1e6 })[0][2];
  assert.equal(client.with[0][0], 'cash.out');
  const small = wire.eventCalls({ type: 'client', tier: 'smb' }, wire.newWireState(), { cost: () => 450, netWorth: () => 1e6 })[0][2];
  assert.deepEqual(small.with, [], 'the HUD flash carries the small ones');
  const up = { hour: 5, ledger: [{ h: 5, type: 'upgrade', amt: -4000 }] };
  assert.equal(wire.eventCalls({ type: 'upgrade', id: 'research' }, wire.newWireState(), { cost: (k) => wire.lastSpend(up, k), netWorth: () => 1e6 })[0][2].with.length, 1);
});
test('a streak under an xl coin is 5 dB up so the coin shower does not bury it', () => {
  const st = wire.newWireState(), hooks = { now: () => 1000, netWorth: () => 0 };
  const sale = wire.eventCalls({ type: 'pitch', outcome: 'win', price: 90000, gain: 0.2 }, st, hooks)[0][2];
  wire.eventCalls({ type: 'streak', n: 3 }, st, hooks);
  const rung = sale.with.find((w) => w[0] === 'streak'); assert.equal(rung[1].gainDb, 5);
  const st2 = wire.newWireState(), s2 = wire.eventCalls({ type: 'pitch', outcome: 'win', price: 900, gain: 0.2 }, st2, hooks)[0][2];
  wire.eventCalls({ type: 'streak', n: 3 }, st2, hooks); assert.equal(s2.with.find((w) => w[0] === 'streak')[1].gainDb, undefined);
});
test('the control table: outcomes that can be refused tick at the click; the ticker\'s alert, a Pass, the instructor\'s pause and speeds, the question buttons', () => {
  const c = wire.controlFor;
  for (const act of ['market-send', 'crew-fill']) assert.deepEqual(c({ act, kind: 'click' }), ['play', 'ui.tick', { variant: 'light' }], `${act} ticks, the outcome speaks`);
  assert.equal(c({ act: 'alert', kind: 'click' }), null, 'the shell plays the alert');
  assert.equal(c({ act: 'pass', kind: 'click', deal: true }), null); assert.equal(c({ act: 'walk', kind: 'click', deal: true, move: true })[1], 'haggle.close');
  assert.equal(c({ act: 'pause', kind: 'click', pressed: false, label: 'resume' })[2].variant, 'resume'); assert.equal(c({ act: 'pause', kind: 'click', pressed: false, label: 'pause' })[2].variant, 'pause');
  assert.equal(c({ act: 'pause', kind: 'click', pressed: true, label: '' })[2].variant, 'resume');
  assert.deepEqual(c({ act: 'speed', kind: 'click', v: '4' }), ['play', 'clock', { variant: 'speed4', params: { i: 2 } }]); assert.equal(c({ act: 'speed', kind: 'click', v: '64' })[2].params.i, 4);
  assert.deepEqual(c({ act: 'ac-skip', kind: 'click' }), ['play', 'ui.ask', { variant: 'normal' }]); assert.equal(c({ act: 'ac-skip-yes', kind: 'click' })[2].variant, 'danger');
  assert.deepEqual(wire.uiCalls({ type: 'ui', ui: 'close-drawer', id: 'travel', quiet: true }), []); assert.equal(wire.uiCalls({ type: 'ui', ui: 'close-drawer', id: 'travel' })[0][1], 'ui.drawer-close');
});
test('the shell and the drawers speak for the sounds the table leaves to them', () => {
  const read = (f) => readFileSync(new URL('../js/ui/' + f, import.meta.url), 'utf8');
  const shell = read('shell.js'), common = read('common.js');
  assert.match(shell, /refusal: true/); assert.match(common, /dataset\.refusal = '1'/);
  assert.match(shell, /audio\.request\('alert\.advance'/, 'the ticker\'s alert has its sound');
  assert.match(shell, /function closeDrawer\(o\)/); assert.match(shell, /quiet: true \} : \{\}\)/);
  assert.match(read('drawers/travel.js'), /closeDrawer\(\{ quiet: true \}\)/);
  assert.match(read('drawers/market.js'), /deal\.verify/); assert.match(read('drawers/bank.js'), /refusal: true/);
  assert.match(common, /initAudio\(\{ settings, save: applySettings, announce, toast, kv \}\)/);
});

// ================================================================================ the page's observers
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
function observerRig() {
  const played = [], saved = {};
  for (const k of ['play', 'hold', 'setEnv', 'sync', 'touch', 'unlock']) { saved[k] = page[k]; page[k] = (...a) => { if (k === 'play') played.push([a[0], a[1]]); }; }
  const settings = { audio: audioDefaults() };
  wire._resetForTest?.();
  observers = [];
  wire.initAudio({ settings, save: () => {}, announce: () => {}, toast: () => {}, kv });
  return { played, restore() { for (const k of Object.keys(saved)) page[k] = saved[k]; } };
}
test('the dialog\'s own sound waits behind the sound of what closed it: Sell to the pool, Release and Hire play their outcome first', async () => {
  const r = observerRig();
  try {
    const mo = observers.find((o) => o.el === dlg);
    assert.ok(mo, 'the dialog is observed');
    dlg.open = true; mo.fn([]);
    assert.deepEqual(r.played, [], 'nothing at the instant the dialog changes: the outcome\'s request has not been played yet');
    await tick(); assert.equal(r.played.at(-1)[0], 'ui.dialog-open');
    r.played.length = 0; dlg.open = false; mo.fn([]);
    assert.deepEqual(r.played, [], 'closing waits too'); await tick();
    assert.deepEqual(r.played.map((p) => p[0]), ['ui.dialog-close']); assert.equal(r.played[0][1].cause, 'dialog');
  } finally { r.restore(); }
});
test('only a toast raised for a refused action plays the refusal; an SLA penalty after a click does not', async () => {
  const r = observerRig();
  try {
    const mo = observers.find((o) => o.el === toasts);
    assert.ok(mo, 'the toasts are observed');
    const toast = (cls, dataset = {}) => ({ classList: { contains: (c) => c === 'toast' || cls.includes(c) }, dataset });
    mo.fn([{ addedNodes: [toast(['bad'])] }]); await tick();
    assert.deepEqual(r.played, [], 'a bad toast that nothing refused (a state, the news) is silent however recently something was pressed');
    mo.fn([{ addedNodes: [toast(['bad'], { refusal: '1' })] }]); await tick();
    assert.deepEqual(r.played.map((p) => p[0]), ['ui.refuse']);
    mo.fn([{ addedNodes: [toast(['good'])] }, { addedNodes: [toast(['warn'])] }]); await tick();
    assert.deepEqual(r.played.map((p) => p[0]), ['ui.refuse', 'ui.ok', 'ui.nudge']);
  } finally { r.restore(); }
});

// ================================================================================ the world (A1 browser)
test('the footsteps do not throw before the world has drawn its first frame (Academy lessons 6, 7 and 9 could not start)', async () => {
  const emitted = [], made = [];
  try {
    const w = { player: { x: 10, y: 10, moving: true, path: [[20, 10]] }, view: undefined, reduced: () => false, onView() { return this.view.x0 < 1e9; } }; // as World: onView reads view.x0 of nothing
    const ws = createWorldSound({ emit: (e) => emitted.push(e), dlg: { el: { open: false } } }, { world: () => w, audio: { play() {} }, now: () => performance.now(), random: () => 0.5 }); made.push(ws);
    assert.doesNotThrow(() => ws.poll());
    assert.equal(emitted.length, 0, 'no foot before there is a view');
    w.view = { x0: 0, x1: 4000, y0: 0, y1: 4000 };
    await tick(520);
    assert.ok(emitted.filter((e) => e.ui === 'step').length >= 1, 'and the feet land once there is a view');
    const w2 = { player: { x: 1, y: 1, moving: true, path: [[2, 2]] }, view: {}, reduced: () => false, onView() { throw new Error('boom'); } };
    const ws2 = createWorldSound({ emit: (e) => emitted.push(e), dlg: { el: { open: false } } }, { world: () => w2, audio: { play() {} } }); made.push(ws2);
    assert.doesNotThrow(() => ws2.poll());
  } finally { for (const x of made) x.destroy(); }
});

// ================================================================================ the audition page (A4)
test('the audition page groups every sound by meaning, none is left to the fallback, and the pairs, ladders and the minute name sounds that exist', async () => {
  const { SECTIONS, PAIRS, LADDERS, MINUTE } = await import('../dev/sections.js');
  const keyOK = (k) => { const i = k.indexOf('#'), id = i < 0 ? k : k.slice(0, i), v = i < 0 ? null : k.slice(i + 1); return !!RECIPES[id] && (!v || variantsOf(id).includes(v)); };
  const placed = new Set();
  for (const S of SECTIONS) { assert.ok(S.title && S.blurb && S.items.length, S.id); for (const it of S.items) { assert.ok(keyOK(it), `${S.id}: ${it} exists`); placed.add(it.split('#')[0]); } }
  assert.deepEqual(IDS.filter((id) => !placed.has(id)), [], 'every sound is in a group of meaning, not left to the prefix fallback');
  assert.ok(['gain', 'loss', 'neutral', 'warning', 'refusal', 'ladders', 'progress'].every((g) => SECTIONS.some((S) => S.id === g)), 'the grammar of 2.2 is the grouping');
  for (const [a, b] of PAIRS) { assert.ok(keyOK(a) && keyOK(b), `${a} / ${b}`); }
  for (const lad of LADDERS) for (const k of lad) assert.ok(keyOK(k), k);
  assert.ok(MINUTE.length >= 35 && MINUTE.at(-1)[0] <= 60 && MINUTE.every(([t, kind]) => t >= 0 && ['event', 'note', 'ui', 'control'].includes(kind)));
  // the minute is replayed through the real tables: every line yields a call or a documented silence, and every id it names exists
  const st = wire.newWireState(), hooks = { now: () => 1000, netWorth: () => 900, pan: () => 0, loansLeft: () => 1, cost: () => 0, poolDelayed: () => false };
  let n = 0;
  for (const [, kind, p] of MINUTE) {
    const calls = kind === 'event' ? wire.eventCalls(p, st, hooks) : kind === 'note' ? wire.noteCalls(p, st, hooks) : kind === 'ui' ? wire.uiCalls({ type: 'ui', ...p }, st, hooks) : [wire.controlFor(p)].filter(Boolean);
    for (const [m, id] of calls) if (m !== 'countUp') { assert.ok(RECIPES[id], `${kind} ${JSON.stringify(p)} names ${id}`); n++; }
  }
  assert.ok(n >= 25, 'and most lines make a sound');
  const html = readFileSync(new URL('../dev/sounds.html', import.meta.url), 'utf8'), js = readFileSync(new URL('../dev/sounds.js', import.meta.url), 'utf8');
  assert.match(html, /id="world"/); assert.match(html, /id="stop"/); assert.match(js, /poolIndex/); assert.match(js, /audio\.dial\.start\(\)/); assert.match(js, /Play all/);
});
test('a pool member can be asked for by name, and the same member twice is allowed there', () => {
  const t = rig(); const k = [];
  for (const i of [0, 1, 2, 2]) { t.clock.advance(100); const r = t.audio.play('ui.tick', { variant: 'light', poolIndex: i, noCooldown: true }); assert.ok(r); k.push(t.ctx.nodes.filter((n) => n.kind === 'osc').at(-1).frequency.calls[0][1]); }
  assert.equal(k[2], k[3], 'member 3 twice is the same pitch'); assert.notEqual(k[0], k[1]);
});

// ================================================================================ the first minute (A6)
test('the first press on the title says that sound is on, once, and says it in words that fit a page with no speaker button', async () => {
  const toastsSeen = [], settings = { audio: audioDefaults() }, saved = {};
  for (const k of ['touch', 'unlock', 'sync']) { saved[k] = page[k]; page[k] = () => {}; }
  const sup = Object.getOwnPropertyDescriptor(page, 'supported'); Object.defineProperty(page, 'supported', { get: () => true, configurable: true });
  try {
    wire._resetForTest(); observers = [];
    wire.initAudio({ settings, save: () => {}, announce: () => {}, toast: (m, l) => toastsSeen.push([m, l]), kv });
    const press = () => { for (const fn of listeners.get('pointerdown').slice(-1)) fn({ type: 'pointerdown' }); };
    press(); press();
    assert.equal(toastsSeen.length, 1, 'once'); assert.equal(toastsSeen[0][0], HINT_PAGE_TEXT); assert.ok(!/speaker button/.test(HINT_PAGE_TEXT), 'no speaker button on the title');
    assert.equal(settings.audio.hinted, true);
    const quiet = { audio: { ...audioDefaults(), quiet: true } }; wire._resetForTest(); toastsSeen.length = 0;
    wire.initAudio({ settings: quiet, save: () => {}, announce: () => {}, toast: (m) => toastsSeen.push(m), kv }); press(); assert.equal(toastsSeen.length, 0, 'not in Classroom');
  } finally { for (const k of Object.keys(saved)) page[k] = saved[k]; if (sup) Object.defineProperty(page, 'supported', sup); else delete page.supported; wire._resetForTest(); }
});
