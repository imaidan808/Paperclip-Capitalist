// Regression tests for the second audio repair round (docs/AUDIO.md 11.6): each one fails on the code before the round. The oscillator budget (A1), the pan of a mix (P1), the fall of a loss in the
// band a laptop plays (S1), the toast fallback over a reward the resolver keeps quiet (W1), and the controls of the player: presets and the volume (U1), the speaker button and key M at volume 0 (U2),
// the Sound section following the settings (U3) and the audition page saying why a press was silent (U4). A fake clock, a recording fake context and a small stand-in for the page.
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
const { audioDefaults, applyPreset, presetOf, statusText, toggleMute, speakerState, whyDropped, audible, audioSettingsHTML, syncAudioSettings, bindAudioSettings } = await import('../js/audio/settings.js');
const { layersFor, RECIPES, variantsOf } = await import('../js/audio/recipes.js');
const { hz, layerSpans } = await import('../js/audio/palette.js');
const wire = await import('../js/audio/wire.js');
const { audio: page } = await import('../js/audio/instance.js');
const { speakerHTML } = await import('../js/ui/hud.js');
const { settings: pageSettings } = await import('../js/ui/common.js');

const rngOf = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
function rig(settings = {}) {
  const ctx = fakeContext(), clock = fakeClock(), s = { ...audioDefaults(), ...settings };
  const audio = createAudio({ get: () => s, now: clock.now, factory: () => ctx, timers: clock.timers_, random: rngOf(7), measure: false });
  audio.unlock();
  return { audio, ctx, clock, s };
}
const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
/** The most oscillators and noise sources the fake context has alive at one instant: the ground truth the engine's own count is held to (a node is alive from its start to its stop). */
function alivePeak(ctx) {
  const ev = [];
  for (const n of ctx.nodes) if ((n.kind === 'osc' || n.kind === 'buf') && n.started != null) ev.push([n.started, 1], [n.stopped ?? n.started, -1]);
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let c = 0, m = 0;
  for (const [, d] of ev) { c += d; m = Math.max(m, c); }
  return m;
}
const sources = (ctx) => ctx.count('osc') + ctx.count('buf');

// ================================================================================ A1: the oscillator budget
const SALE = (id, v, coin, rung) => [id, { variant: v, cause: 'money', with: [['cash.in', { size: coin, cause: 'money', gainDb: -4 }], ['streak', { params: { n: rung }, gainDb: coin === 'xl' ? 5 : 0 }]] }];
test('a pioneer sale with an xl coin, a district opening and a level-up plays all three of its parts: the tick that the resolver planned is heard (it was dropped with no counter)', () => {
  const t = rig();
  t.audio.request(...SALE('sale.pioneer', 'p', 'xl', 3));
  t.audio.request('zone.open', { variant: 't4', params: { t: 4 } }); t.audio.request('level.up', { meta: { level: 4 } }); t.audio.request('quest.complete', {});
  t.clock.flush();
  const st = t.audio.stats();
  assert.deepEqual(st.lastBurst.plays.map((p) => p.role), ['s1', 's2', 'also'], 'the resolver planned a sentence, a second sentence and a tick');
  for (const id of ['sale.pioneer', 'cash.in', 'streak', 'zone.open', 'reward.also']) assert.equal(st.played[id], 1, id + ' plays');
  assert.equal(st.dropped.osc, undefined); assert.deepEqual(st.dropped, {});
  assert.ok(alivePeak(t.ctx) < LIMITS.OSCILLATORS, 'and the real peak is far from the limit');
});
test('no ordinary two-sentence burst reaches the oscillator budget: every planned part plays, nothing is counted as dropped, and the context never has more than the limit alive', () => {
  const causes = [SALE('sale.win', 'w', 'xl', 6), SALE('sale.pioneer', 'p', 'xl', 3), SALE('sale.win', 'w', 'm', 3)];
  const rewards = [['level.up', { variant: 's', meta: { level: 3 } }], ['level.up', { variant: 'l', meta: { level: 4 } }], ['level.up', { meta: { level: 5 } }], ['achievement', { variant: 'common' }], ['achievement', { variant: 'rare' }], ['achievement', { variant: 'epic' }],
    ['quest.complete', {}], ['milestone', { variant: 'm1' }], ['milestone', { variant: 'm2' }], ['milestone', { variant: 'm3' }], ['zone.open', { variant: 't1', params: { t: 1 } }], ['zone.open', { variant: 't4', params: { t: 4 } }], ['daily.done', {}], ['codex.unlock', {}]];
  let n = 0;
  for (const c of causes) for (const r of rewards) for (const also of [false, true]) {
    const t = rig();
    t.audio.request(...c); t.audio.request(...r);
    if (also) { t.audio.request('codex.unlock', {}); t.audio.request('daily.done', {}); }
    t.clock.flush();
    const st = t.audio.stats(), tag = `${c[0]} + ${r[0]}${r[1].variant ? '#' + r[1].variant : ''}${also ? ' + also' : ''}`;
    const planned = st.lastBurst.plays.flatMap((p) => p.mix.map((m) => m[0]));
    assert.deepEqual(planned.filter((id) => !st.played[id]), [], tag + ': every planned part plays');
    assert.equal(st.dropped.osc, undefined, tag); assert.ok(alivePeak(t.ctx) <= LIMITS.OSCILLATORS, tag);
    n++;
  }
  assert.equal(n, 84);
});
test('the budget counts what is alive at the same instant: a tick that starts after the others have ended does not share it, one that starts with them does and is dropped, and the loss is counted', () => {
  const was = LIMITS.OSCILLATORS; LIMITS.OSCILLATORS = 8;
  try {
    const apart = rig();
    const a = apart.audio.playMix([['reward.also', { params: { n: 2 } }], ['reward.also', { params: { n: 1 }, delay: 1 }]], {});
    assert.ok(a); assert.equal(apart.audio.stats().played['reward.also'], 2, 'the second starts a second later, when the first is long silent');
    assert.equal(apart.audio.stats().dropped.osc, undefined);
    const together = rig();
    together.audio.playMix([['reward.also', { params: { n: 2 } }], ['reward.also', { params: { n: 1 } }]], {});
    assert.equal(together.audio.stats().played['reward.also'], 1, 'together they would have more than the limit alive');
    assert.equal(together.audio.stats().dropped.osc, 1, 'and the stats say so');
    assert.ok(alivePeak(together.ctx) <= LIMITS.OSCILLATORS);
  } finally { LIMITS.OSCILLATORS = was; }
});
test('over the budget a sound loses its optional sparkle, and the oscillators it counts are those it builds, not those it would have built', () => {
  const was = LIMITS.OSCILLATORS; LIMITS.OSCILLATORS = 30;
  try {
    const full = rig(); const h0 = full.audio.play('zone.open', { variant: 't4', params: { t: 4 } });
    const lean = rig(); LIMITS.OSCILLATORS = 1000; const h1 = lean.audio.play('zone.open', { variant: 't4', params: { t: 4 } }); LIMITS.OSCILLATORS = 30;
    assert.ok(h0 && h1, 'a loud sound is never dropped for the budget');
    assert.ok(sources(full.ctx) < sources(lean.ctx), 'the sparkle layers are left out when the sound would pass the limit');
    assert.equal(h0.group.osc, sources(full.ctx), 'and what the group counts is what it built');
    assert.equal(h1.group.osc, sources(lean.ctx));
  } finally { LIMITS.OSCILLATORS = was; }
});
test('layerSpans: a bank ends each partial at its own time and a layer counts every source it starts', () => {
  const spans = layerSpans({ k: 'bank', f: 'D5', a: 0.001, p: [[1, 1, 0.4], [2.01, 0.42, 0.24], [3.02, 0.24, 0.16]] });
  assert.equal(spans.length, 3); assert.ok(spans[0][1] > spans[1][1] && spans[1][1] > spans[2][1], 'a partial that decays faster is silent sooner');
  assert.equal(layerSpans({ k: 'tone', f: 'D3', uni: [3, 9], vib: [5, 4] })[0][2], 4, 'three unison oscillators and the vibrato');
  assert.equal(layerSpans({ k: 'noise', am: [29, 0.6] })[0][2], 3, 'a noise source and its two low-rate oscillators');
});
test('the document no longer says the budget is reached only by several fanfares at once, and the engine names the loss', () => {
  const doc = src('docs/AUDIO.md');
  assert.ok(!/reached only by several fanfares at once/.test(doc), 'that sentence was untrue');
  assert.match(doc, /alive at the same instant/); assert.match(doc, /dropped\.osc/);
});

// ================================================================================ P1: the members of a mix share the cause's place
const pans = (ctx) => ctx.nodes.filter((n) => n.kind === 'pan').map((n) => n.pan.value);
test('a sale at the buyer\'s place carries its coin shower and its streak with it: every voice of the mix is panned alike, and a reward sentence stays centred', () => {
  for (const pan of [0.6, -0.6, 1]) {
    const t = rig();
    t.audio.request('sale.win', { variant: 'w', cause: 'money', pan, with: [['cash.in', { size: 'xl', cause: 'money', gainDb: -4 }], ['streak', { params: { n: 6 }, gainDb: 5 }]] });
    t.audio.request('level.up', { meta: { level: 5 } });
    t.clock.flush();
    const p = pans(t.ctx);
    assert.equal(p.length, 4, 'sale, coin, streak, level-up');
    assert.deepEqual(p.slice(0, 3), [pan, pan, pan], `the three members at ${pan}`); assert.equal(p[3], 0, 'the level-up is the player\'s, not the buyer\'s');
    // the law: an equal-power pan puts tan((pan + 1) pi / 4) between the right channel and the left
    const th = (pan + 1) * Math.PI / 4, rl = 20 * Math.log10(Math.sin(th) / Math.cos(th));
    assert.ok(Math.abs(rl) > 3 || pan === 0, 'a pan this wide is heard as one');
  }
  const t = rig();
  t.audio.request('buy.lot', { variant: 'ok', cause: 'money', pan: -0.4, with: [['cash.out', { size: 'm', cause: 'money', gainDb: -4 }]] }); t.clock.flush();
  assert.deepEqual(pans(t.ctx), [-0.4, -0.4], 'a purchase and its coin');
});
test('a member that must stay centred says so with pan 0, and the wiring\'s sale reaches the engine with the buyer\'s place on its cause', () => {
  const t = rig();
  t.audio.playMix([['sale.win', { variant: 'w', pan: 0.5 }], ['cash.in', { size: 's', pan: 0 }], ['streak', { params: { n: 2 } }]], {});
  assert.deepEqual(pans(t.ctx), [0.5, 0, 0.5]);
  const st = wire.newWireState(), hooks = { now: () => 1000, netWorth: () => 0, pan: () => 0.6 };
  const [call] = wire.eventCalls({ type: 'pitch', outcome: 'win', price: 90000, gain: 0.2, zone: 2 }, st, hooks);
  assert.equal(call[2].pan, 0.6); assert.equal(call[2].with[0][1].pan, undefined, 'the cause carries the place; the engine gives it to the rest');
  const u = rig(); u.audio.request(call[1], call[2]); u.clock.flush();
  assert.ok(pans(u.ctx).every((p) => p === 0.6), 'every voice of the sale: ' + pans(u.ctx));
});

// ================================================================================ S1: a loss falls in the band a laptop plays
/** The notes of a variant a small speaker plays: tones and banks (no sawtooth) between 250 and 800 Hz, the loudest at least half the gain of the loudest, in order of onset (the higher of two together first). */
function mid(layers) {
  const it = [];
  for (const L of layers) { if ((L.k !== 'tone' && L.k !== 'bank') || L.type === 'sawtooth') continue; const f = hz(L.f); if (f >= 250 && f <= 800) it.push({ t: L.t || 0, f, g: L.g ?? 1 }); }
  if (!it.length) return null;
  const mx = Math.max(...it.map((x) => x.g)), sal = it.filter((x) => x.g >= mx * 0.5).sort((a, b) => a.t - b.t || b.f - a.f);
  return 12 * Math.log2(sal[sal.length - 1].f / sal[0].f);
}
/** The same through the project's laptop model (a 2nd-order high-pass at 220 Hz): each note's gain is weighed by what the filter lets through, lows from 90 Hz up included. */
function laptop(layers) {
  const H = (f) => { const r = (f / 220) ** 4; return Math.sqrt(r / (1 + r)); };
  const it = [];
  for (const L of layers) { if ((L.k !== 'tone' && L.k !== 'bank') || L.type === 'sawtooth') continue; const f = hz(L.f); if (f >= 90) it.push({ t: L.t || 0, f, w: (L.g ?? 1) * H(f) }); }
  const mx = Math.max(...it.map((x) => x.w)), sal = it.filter((x) => x.w >= mx * 0.5).sort((a, b) => a.t - b.t || b.f - a.f);
  return 12 * Math.log2(sal[sal.length - 1].f / sal[0].f);
}
const LOSS_BODY = ['clock#pause', 'pitch.fit#down', 'audit.result#fail', 'world.locked#l', 'repair.stop#miss', 'repair.done#rough', 'ship.trouble#damage', 'alert.insolvent#i', 'bid.rival#out', 'bid.hammer#lost', 'haggle.close#walk',
  'alert.shock#fed', 'sale.reject#nofit', 'ui.refuse#r', 'deal.result#bad', 'bank.draw#b', 'acad.teach#wrong', 'sale.reject#fake'];
test('the eighteen losses whose fall lived under 250 Hz now fall where a laptop plays: the body steps down inside 250 to 800 Hz, by the ear\'s measure and through the laptop model', () => {
  for (const k of LOSS_BODY) {
    const [id, v] = k.split('#'); assert.ok(variantsOf(id).includes(v === 'r' ? 'r' : v) || variantsOf(id).length, k);
    const vv = variantsOf(id).includes(v) ? v : variantsOf(id)[0], L = layersFor(id, vv);
    const a = mid(L), b = laptop(L);
    assert.ok(a != null && a <= -1.5, `${k} falls ${a == null ? '(no note in the band)' : a.toFixed(1)} semitones in 250 to 800 Hz`);
    assert.ok(b <= -1.5, `${k} falls ${b.toFixed(1)} semitones through the laptop model`);
  }
});
test('the gains the fall is measured against still climb, and the losses that fell before still do', () => {
  for (const k of ['cash.in#m', 'sale.win#w', 'clock#resume', 'ui.toggle#on', 'audit.result#pass']) { const [id, v] = k.split('#'); const a = mid(layersFor(id, v)); assert.ok(a == null || a >= 0, `${k} does not fall (${a})`); }
  for (const k of ['ui.toggle#off', 'ui.crate#clear', 'haggle.move#large', 'ui.ask#danger', 'alert.shock#glut', 'deal.verify#bad']) { const [id, v] = k.split('#'); assert.ok(mid(layersFor(id, v)) <= -1.5, k); }
});
test('every variant of the map still has its notes in key (the body\'s new step is D major pentatonic) and a unison body is still available for the sounds that are not losses', () => {
  const body = layersFor('ui.refuse', 'r').filter((L) => L.k === 'tone' && hz(L.f) >= 250);
  assert.deepEqual(body.map((L) => L.f).sort(), ['A4', 'D5'], 'the body steps from D5 to A4: a quiet laptop plays 440 and 587 Hz 3 and 5 dB better than 294 (Appendix F, I2)');
  const held = layersFor('deal.result', 'info').filter((L) => L.k === 'tone' && hz(L.f) >= 250);
  assert.deepEqual(held.map((L) => L.f), ['A4'], 'a neutral card keeps its held body');
});

// ================================================================================ W1: a reward the resolver keeps quiet is not rung by its toast
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
function observerRig() {
  const played = [], saved = {};
  for (const k of ['play', 'hold', 'setEnv', 'sync', 'touch', 'unlock']) { saved[k] = page[k]; page[k] = (...a) => { if (k === 'play') played.push([a[0], a[1]]); }; }
  const settings = { audio: audioDefaults() }, said = [];
  wire._resetForTest?.();
  observers = [];
  wire.initAudio({ settings, save: () => {}, announce: (m) => said.push(m), toast: () => {}, kv });
  return { played, said, settings, restore() { for (const k of Object.keys(saved)) page[k] = saved[k]; wire._resetForTest?.(); } };
}
const toastEl = (cls, dataset = {}) => ({ classList: { contains: (c) => c === 'toast' || cls.includes(c) }, dataset });
test('a toast that owns its sound is never rung over: the daily bounty a resolver keeps silent at 4x, the common achievement and the Codex page at 16x', async () => {
  const r = observerRig();
  try {
    const mo = observers.find((o) => o.el === toasts);
    mo.fn([{ addedNodes: [toastEl(['good'], { snd: 'own' })] }, { addedNodes: [toastEl(['info'], { snd: 'own' })] }]); await tick();
    assert.deepEqual(r.played, [], 'nothing at all');
    mo.fn([{ addedNodes: [toastEl(['good'])] }]); await tick();
    assert.deepEqual(r.played.map((p) => p[0]), ['ui.ok'], 'while a good toast with no sound of its own still gets its ok');
  } finally { r.restore(); }
});
test('the reward toasts of the shell say they own their sound, and the toast function writes it down', () => {
  const sh = src('js/ui/shell.js'), common = src('js/ui/common.js');
  assert.match(sh, /toast\(msg, 'good', undefined, \{ own: true \}\)/, 'quest, achievement and daily bounty');
  assert.match(sh, /Codex unlocked: \$\{entry\.title\}`, 'info', undefined, \{ own: true \}\)/);
  assert.match(common, /o\.own\) t\.dataset\.snd = 'own'/); assert.match(src('js/audio/wire.js'), /n\.dataset\.snd\) continue/);
});
test('a daily bounty the resolver keeps silent stays silent through the whole path (resolver, then the toast observer)', async () => {
  const r = observerRig();
  try {
    for (const speed of [4, 16, 64]) {
      const t = rig(); t.audio.setEnv({ speed });
      t.audio.request('daily.done'); t.clock.flush();
      assert.equal(t.audio.stats().played['daily.done'], undefined, `silent at ${speed}x`);
      const mo = observers.find((o) => o.el === toasts); r.played.length = 0;
      mo.fn([{ addedNodes: [toastEl(['good'], { snd: 'own' })] }]); await tick(50);
      assert.deepEqual(r.played, [], `and its toast adds nothing at ${speed}x`);
    }
  } finally { r.restore(); }
});

// ================================================================================ U1: a preset leaves the volume where the player put it
test('a preset other than Off keeps the volume; only a volume of 0, which would make it silent, goes to 70', () => {
  const a = { ...audioDefaults(), master: 30, touched: true };
  for (const name of ['full', 'classroom', 'interface']) { const n = applyPreset(a, name); assert.equal(n.master, 30, name + ' keeps 30'); assert.equal(n.mute, false); assert.equal(presetOf(n), name); }
  assert.equal(applyPreset({ ...a, mute: true }, 'full').master, 30, 'Off to Full keeps it too'); assert.equal(applyPreset({ ...a, mute: true }, 'full').mute, false);
  assert.equal(applyPreset({ ...a, master: 0 }, 'full').master, 70, 'at 0 it would be silent');
  assert.equal(applyPreset({ ...a, master: 0, mute: true }, 'classroom').master, 70);
  assert.equal(applyPreset(a, 'off').master, 30); assert.equal(applyPreset(a, 'off').mute, true);
  const t = rig({ master: 30 }); t.audio.applyPreset('interface'); assert.equal(t.s.master, 30, 'the engine\'s own copy of the rule');
  const z = rig({ master: 0, mute: true }); z.audio.applyPreset('full'); assert.equal(z.s.master, 70); assert.equal(z.s.mute, false);
});
test('the select in the Sound section leaves the slider where it was', () => {
  const settings = { audio: { ...audioDefaults(), master: 30, touched: true } }, calls = [];
  const audio = { state: 'running', sync() {}, play: (id) => calls.push(id), unlock() {}, on: () => () => {} };
  const s = section(settings.audio);
  bindAudioSettings(s.root, { audio, settings, save: () => {}, announce: () => {} });
  s.made['s-preset'].value = 'interface'; s.made['s-preset'].onchange();
  assert.equal(settings.audio.master, 30); assert.equal(s.made['s-vol'].value, '30', 'the slider the player sees');
  assert.equal(presetOf(settings.audio), 'interface');
});

// ================================================================================ U2: the speaker button and M never claim a sound nobody can hear
test('toggleMute: sound that can be heard is muted; muted or silent sound is turned on, and at volume 0 that brings the volume back and says so', () => {
  const a = { ...audioDefaults(), touched: true };
  const off = toggleMute(a); assert.equal(off.next.mute, true); assert.equal(off.said, 'Sound off.'); assert.equal(off.hears, false); assert.equal(off.changed, true);
  const on = toggleMute(off.next); assert.equal(on.next.mute, false); assert.equal(on.next.master, 70); assert.equal(on.said, 'Sound on.'); assert.equal(on.hears, true);
  const quiet = toggleMute({ ...a, master: 40, mute: true }); assert.equal(quiet.next.master, 40, 'the volume the player chose'); assert.equal(quiet.said, 'Sound on.');
  const zero = toggleMute({ ...a, master: 0 }); assert.equal(zero.next.mute, false); assert.equal(zero.next.master, 70); assert.equal(zero.said, 'Sound on at 70 percent.'); assert.equal(zero.hears, true);
  const zeroMuted = toggleMute({ ...a, master: 0, mute: true }); assert.equal(zeroMuted.next.master, 70); assert.equal(zeroMuted.said, 'Sound on at 70 percent.');
  const none = toggleMute({ ...a, ui: false, game: false }); assert.equal(none.changed, false, 'there is nothing to mute'); assert.match(none.said, /both off/); assert.equal(none.next.mute, false);
  const nonMuted = toggleMute({ ...a, ui: false, game: false, mute: true }); assert.equal(nonMuted.next.mute, false); assert.match(nonMuted.said, /both off/); assert.equal(nonMuted.hears, false);
  assert.equal(toggleMute({}).next.mute, true, 'a missing field is the default: sound on, so a press mutes');
  assert.equal(toggleMute(toggleMute(a).next).next.mute, false, 'twice is back where it was');
});
test('the speaker button is pressed only when something can be heard, and its title says what a press does', () => {
  const a = audioDefaults();
  assert.deepEqual(speakerState(a), { on: true, title: 'Sound is on. Press to mute (M)' });
  assert.equal(speakerState({ ...a, mute: true }).on, false); assert.match(speakerState({ ...a, mute: true }).title, /turn on/);
  const z = speakerState({ ...a, master: 0 }); assert.equal(z.on, false); assert.match(z.title, /Volume is at 0/); assert.doesNotMatch(z.title, /Sound is on/);
  const b = speakerState({ ...a, ui: false, game: false }); assert.equal(b.on, false); assert.match(b.title, /both off/);
  const sup = Object.getOwnPropertyDescriptor(page, 'supported'); Object.defineProperty(page, 'supported', { get: () => true, configurable: true });
  const was = pageSettings.audio;
  try {
    pageSettings.audio = { ...audioDefaults(), master: 0 };
    const html = speakerHTML(); assert.match(html, /aria-pressed="false"/); assert.match(html, /Volume is at 0/); assert.match(html, /aria-label="Sound"/);
    pageSettings.audio = { ...audioDefaults() }; assert.match(speakerHTML(), /aria-pressed="true"/);
  } finally { pageSettings.audio = was; if (sup) Object.defineProperty(page, 'supported', sup); else delete page.supported; }
});
test('key M at volume 0 turns the volume up and says so; at a heard volume it mutes; with both buses off it changes nothing and says why', async () => {
  const r = observerRig();
  try {
    const press = () => { for (const fn of listeners.get('keydown').slice(-2)) fn({ type: 'keydown', key: 'm', target: { tagName: 'BODY' } }); };
    r.settings.audio = { ...audioDefaults(), master: 0 };
    press();
    assert.equal(r.settings.audio.master, 70); assert.equal(r.settings.audio.mute, false); assert.equal(r.said.at(-1), 'Sound on at 70 percent.'); assert.deepEqual(r.played.map((p) => p[0]), ['ui.ok'], 'the ok plays: it can be heard');
    r.played.length = 0; press();
    assert.equal(r.settings.audio.mute, true); assert.equal(r.said.at(-1), 'Sound off.'); assert.deepEqual(r.played, []);
    press(); assert.equal(r.settings.audio.mute, false); assert.equal(r.said.at(-1), 'Sound on.'); assert.equal(r.settings.audio.master, 70);
    r.settings.audio = { ...audioDefaults(), ui: false, game: false }; r.played.length = 0; const before = r.settings.audio;
    press();
    assert.equal(r.settings.audio, before, 'the settings are left as they were'); assert.match(r.said.at(-1), /both off/); assert.deepEqual(r.played, [], 'no ok that nobody can hear');
  } finally { r.restore(); }
});
test('the shell\'s speaker button and the Deal Room\'s switch use the same rule as key M', () => {
  const sh = src('js/ui/shell.js'), deal = src('js/ui/deal.js');
  assert.match(sh, /const r = toggleMute\(a\)/); assert.ok(!/mute: !a\.mute/.test(sh), 'the shell no longer flips the flag by hand');
  assert.match(deal, /sound\(\) \{ const r = toggleMute\(/); assert.ok(!/mute = a\.mute !== true/.test(deal));
  assert.match(deal, /ses\.sound = \(\) => \{ const a = appSettings\.audio; return !a \|\| audible\(a\)/);
  assert.match(src('js/ui/hud.js'), /speakerState\(/);
});

// ================================================================================ U3: the Sound section follows the settings
/** A section made of stand-ins, one element for each id the markup has (as in audio-repair.test.mjs). */
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
test('key M, the speaker button or the Deal Room\'s switch while the dialog is open: the Mute box, the preset and the slider follow, not only the status line', () => {
  const settings = { audio: { ...audioDefaults(), touched: true } };
  let listener = null;
  const audio = { state: 'running', sync() {}, play() {}, unlock() {}, on: (fn) => { listener = fn; return () => {}; } };
  const s = section(settings.audio);
  bindAudioSettings(s.root, { audio, settings, save: () => {}, announce: () => {} });
  assert.equal(s.made['s-mute'].checked, false); assert.equal(s.made['s-preset'].value, 'full');
  settings.audio = { ...settings.audio, mute: true }; listener('mute');
  assert.equal(s.made['s-mute'].checked, true, 'the box says what the status line says'); assert.equal(s.made['s-preset'].value, 'off'); assert.equal(s.made['s-status'].textContent, 'Sound is off.');
  assert.equal(s.made['s-ui-h'].textContent, 'Muted.');
  settings.audio = { ...settings.audio, mute: false, master: 70 }; listener('settings');
  assert.equal(s.made['s-mute'].checked, false); assert.equal(s.made['s-preset'].value, 'full'); assert.match(s.made['s-status'].textContent, /^Sound is on/);
  settings.audio = { ...settings.audio, master: 45 }; listener('state');
  assert.equal(s.made['s-vol'].value, '45'); assert.equal(s.made['s-vol'].attrs['aria-valuetext'], '45 percent');
  const gone = { ...s.root, isConnected: false }; bindAudioSettings(gone, { audio, settings, save: () => {}, announce: () => {} });
  assert.doesNotThrow(() => listener('mute'), 'a dialog that has closed is left alone');
  // and ticking the box afterwards does what it says
  s.made['s-mute'].checked = false; s.made['s-mute'].onchange?.();
  assert.equal(settings.audio.mute, false);
});

// ================================================================================ U4: the audition page says why a press was silent
test('whyDropped: each reason the engine counts has its own words, and the settings name which switch is the one', () => {
  const a = audioDefaults();
  assert.match(whyDropped('mute', { ...a, mute: true }), /Mute is on/); assert.match(whyDropped('mute', { ...a, master: 0 }), /Volume is at 0/);
  assert.match(whyDropped('bus', { ...a, ui: false }, { id: 'ui.tick', bus: 'ui' }), /Interface sounds are off/); assert.match(whyDropped('bus', { ...a, game: false }, { id: 'cash.in', bus: 'game' }), /Game sounds are off/);
  assert.match(whyDropped('bus', { ...a, worldTicks: false }, { id: 'world.step', bus: 'game' }), /World ticks are off/);
  assert.match(whyDropped('quiet', { ...a, quiet: true }), /Classroom/); assert.match(whyDropped('locked', a), /not running/); assert.match(whyDropped('bucket', a), /Too many/);
  assert.match(whyDropped('budget', a), /budget/); assert.match(whyDropped(undefined, a), /nothing/);
});
test('a card pressed while a switch holds the engine back is answered in words: Classroom, a bus off, the world\'s ticks, Mute and volume 0 are each named by what the engine counted', () => {
  const cases = [[{ quiet: true }, 'world.step', 'quiet', /Classroom/], [{ ui: false }, 'ui.tick', 'bus', /Interface sounds are off/], [{ game: false }, 'cash.in', 'bus', /Game sounds are off/],
    [{ worldTicks: false }, 'world.hover', 'bus', /World ticks are off/], [{ mute: true }, 'ui.tick', 'mute', /Mute is on/], [{ master: 0 }, 'ui.tick', 'mute', /Volume is at 0/]];
  for (const [set, id, reason, words] of cases) {
    const t = rig(set), before = { ...t.audio.stats().dropped };
    const heard = t.audio.play(id, { noCooldown: true, player: true });
    assert.equal(heard, null, id + ' is silent');
    const now = t.audio.stats().dropped, key = Object.keys(now).find((k) => now[k] > (before[k] || 0));
    assert.equal(key, reason); assert.match(whyDropped(key, t.s, { id, bus: RECIPES[id].bus }), words);
  }
});
test('the audition page reports a silent press on the status line and on the card, and has a way back to the settings of a first visit', () => {
  const js = src('dev/sounds.js'), html = src('dev/sounds.html');
  assert.match(js, /explainDrop/); // (third round: the page's reasons come from js/audio/audition.js, which delegates the plain gates to whyDropped) assert.match(js, /function said\(heard, id, before, mark\)/); assert.match(js, /'silent: '/); assert.match(js, /classList\.toggle\('silent', !heard\)/);
  assert.match(js, /const hear = \(id, v, o = \{\}, mark = null\)[^\n]*said\(!!r, id, before, mark\)/, 'every card\'s press asks what became of it');
  assert.match(js, /b\.onclick = \(\) => hear\(id, v, \{\}, c\)/); assert.match(js, /el\('p', 'why', '', c\)/);
  assert.match(html, /id="reset"[^>]*>Reset to Full</); assert.match(js, /\$\('reset'\)\.onclick/); assert.match(html, /\.why:empty/);
  assert.match(js, /\$\('state'\)\.textContent = 'engine: ' \+ audio\.state \+ \(lastWhy/, 'the status line keeps the last reason beside the engine\'s state');
});
test('statusText still never says sound is on when nothing can be heard (the dialog and the speaker agree)', () => {
  const a = audioDefaults();
  for (const x of [{ ...a, master: 0 }, { ...a, mute: true }, { ...a, ui: false, game: false }]) { assert.equal(audible(x), false); assert.doesNotMatch(statusText(x, 'running'), /^Sound is on/); assert.equal(speakerState(x).on, false); }
});
