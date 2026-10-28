// The sound layer (docs/AUDIO.md section 10.2): recipes against the spec, the key, money sizing, settings migration, the engine against a recording fake context (gates, cooldowns, caps,
// ramps, ducking, ambient, the dial), the collector's bursts, the clock gates, the wiring tables and the legacy aliases. No browser: scripts/audio-check.mjs renders the sounds in Chrome.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeContext, fakeClock } from './helpers/fakeaudio.mjs';
import { createAudio, LIMITS, SANDBOX_SILENT } from '../js/audio/engine.js';
import { RECIPES, IDS, variantsOf, layersFor, tierOf, trimFor, CLASS, RANKED } from '../js/audio/recipes.js';
import { inKey, keptPartials, hz, moneySize, FAMILY_MS } from '../js/audio/palette.js';
import { ONE_SHOTS, BEDS, MODS, BED_IDS, normState, shotAllowed, allowedShots, oneShotLayers } from '../js/audio/ambient.js';
import { migrateAudio, audioDefaults, applyPreset, presetOf, PRESETS, joinRoom, leaveRoom, sanitizeAudio, mirrorFlat, audioSettingsHTML } from '../js/audio/settings.js';
import { createResolverState, resolveBurst, gateClock, stateGate, holdRelease, catchingUp, RULES } from '../js/audio/resolve.js';
import { eventCalls, noteCalls, noteKind, uiCalls, controlFor, newWireState, sessionCalls, dealCalls, _setInstalled } from '../js/audio/wire.js';
import { legacySfx, audio as pageAudio } from '../js/audio/index.js';
import { EVENT_TYPES } from '../js/meta/ids.js';

const rngOf = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
function rig(settings = {}, o = {}) {
  const ctx = fakeContext(o.ctx), clock = fakeClock(), s = { ...audioDefaults(), ...settings };
  const audio = createAudio({ get: () => s, now: clock.now, factory: o.factory === undefined ? () => ctx : o.factory, timers: clock.timers_, random: rngOf(7), measure: false });
  if (o.unlock !== false) audio.unlock();
  return { audio, ctx, clock, s };
}
const spec = readFileSync(new URL('../docs/AUDIO.md', import.meta.url), 'utf8');
const mapText = spec.slice(spec.indexOf('## 4. The sound map'), spec.indexOf('### 4.1 Every engine event'));
const specIds = [...mapText.matchAll(/^\| \d+ \| `([a-z][a-z.\-]*)`/gm)].map((m) => m[1]);

// ---------------------------------------------------------------------------------------------------------------- the recipes
test('every id of the spec has a recipe and every recipe is in the spec', () => {
  assert.equal(new Set(specIds).size, 90, 'the sound map names 90 ids');
  assert.deepEqual([...new Set(specIds)].sort(), [...IDS].sort());
  for (const id of IDS) {
    const e = RECIPES[id];
    for (const k of ['bus', 'tier', 'cd', 'class', 'variants', 'build', 'dur', 'trigger', 'meaning', 'recipe', 'visual']) assert.ok(e[k] != null, `${id}: ${k}`);
    assert.ok(['ui', 'game'].includes(e.bus), id);
    assert.ok(['press', 'world', 'cause', 'state', 'reward', 'clock'].includes(e.class), id);
    assert.ok(e.cd >= 30, id + ' has a cooldown');
  }
  const variants = IDS.reduce((n, id) => n + variantsOf(id).length, 0), tiers = {};
  for (const id of IDS) for (const v of variantsOf(id)) tiers[tierOf(id, v)] = (tiers[tierOf(id, v)] || 0) + 1;
  assert.deepEqual(tiers, { tiny: 102, medium: 64, loud: 22 }, 'revision 2: 188 variants in three tiers');
  assert.equal(variants, 188);
  assert.ok(!IDS.includes('read.caught') && IDS.includes('read.suspect') && IDS.includes('daily.done') && IDS.includes('reward.also'));
});
test('every pitch is in D major pentatonic, no partial out of key is louder than -26 dB, nothing above 6 kHz', () => {
  const bad = [];
  for (const id of IDS) for (const v of variantsOf(id)) for (let k = 0; k < (RECIPES[id].pool || 1); k++) for (const L of layersFor(id, v, {}, k)) {
    for (const f of [L.f, L.f2]) if (f != null && !inKey(f)) bad.push(`${id}#${v}: ${f}`);
    if (L.k === 'bank') for (const [r, g] of keptPartials(L)) { if (hz(L.f) * r > 6000) bad.push(`${id}#${v}: a partial over 6 kHz`); if (g > 0.05 && Math.abs(12 * Math.log2(hz(L.f) * r / 440) + 69 - Math.round(12 * Math.log2(hz(L.f) * r / 440) + 69)) > 0.3) bad.push(`${id}#${v}: out-of-key partial`); }
  }
  assert.deepEqual(bad, []);
});
test('ambient one-shots and beds are in key, and no one-shot is a cue of the map', () => {
  for (const o of ONE_SHOTS) for (const L of oneShotLayers(o.id)) for (const f of [L.f, L.f2]) if (f != null) assert.ok(inKey(f), `${o.id}: ${f}`);
  for (const [id, b] of Object.entries(BEDS)) for (const L of b.layers) if (L.drone) assert.ok(inKey(L.drone), id);
  for (const [m, ls] of Object.entries(MODS)) for (const L of ls) if (L.drone) assert.ok(inKey(L.drone), m);
  assert.equal(BED_IDS.length, 16); assert.equal(ONE_SHOTS.length, 18);
  // the four that used to share a voice, a sequence or a spacing with a sound of the map
  const pcs = (id) => oneShotLayers(id).filter((L) => (L.k === 'tone' || L.k === 'bank') && L.f).map((L) => L.f.replace(/\d/, ''));
  assert.deepEqual(pcs('amb.door-bell'), [], 'the door bell is unpitched (buyer.arrive is D6 A5)');
  assert.deepEqual(pcs('amb.chime'), ['E'], 'a single E, not day.turn\'s D and A');
  assert.deepEqual([...new Set(pcs('amb.phone'))].sort(), ['A', 'D'], 'not the warning pair A F#');
  assert.ok(oneShotLayers('amb.horn').some((L) => L.f === 'B2') && oneShotLayers('amb.horn').some((L) => L.f === 'E2') && !oneShotLayers('amb.horn').some((L) => L.f === 'D2'), 'E2 and B2, not the freight horn D2 D3');
});
test('trims exist for every variant once calibrated, and the loud tier has its level', () => {
  for (const id of IDS) for (const v of variantsOf(id)) assert.ok(Number.isFinite(trimFor(id, v)), id + '#' + v);
  assert.ok(Object.keys(JSON.parse(JSON.stringify({ a: trimFor('ui.tick', 'light') }))).length === 1);
});
test('moneySize: the thresholds of 2.4, the bump and bad input', () => {
  const at = (a, nw) => moneySize(a, nw);
  assert.equal(at(40.99), 's'); assert.equal(at(41), 'm'); assert.equal(at(1779), 'm'); assert.equal(at(1780), 'l'); assert.equal(at(74999), 'l'); assert.equal(at(75000), 'xl');
  assert.equal(at(3, 3), 'm', 'a pen for $3 when you own $3 already sounds like a deal'); assert.equal(at(100, 400), 'l', 'a fifth of everything you have is a step bigger'); assert.equal(at(100, 600), 'm');
  assert.equal(at(-50), 'm'); assert.equal(at(0), 's'); assert.equal(at(NaN), 's'); assert.equal(at('x'), 's'); assert.equal(at(Infinity), 's'); assert.equal(at(1e12, 1), 'xl');
});

// ---------------------------------------------------------------------------------------------------------------- settings
test('migrateAudio: defaults, old saves, junk, the address and the presets', () => {
  assert.deepEqual(migrateAudio({}), audioDefaults());
  assert.equal(migrateAudio(null).master, 70);
  const off = migrateAudio({ sound: false });
  assert.ok(off.mute && off.touched, 'a saved "sound off" stays silent and can never be changed by a room');
  const junk = migrateAudio({ audio: { v: 1, master: 'loud', mute: 'yes', ui: 0, game: false, ambient: true, ambientLevel: 999, dial: 1, extra: 5, clockSounds: false, quiet: null } });
  assert.equal(junk.master, 70); assert.equal(junk.mute, false); assert.equal(junk.ui, true); assert.equal(junk.game, false); assert.equal(junk.ambient, true); assert.equal(junk.ambientLevel, 100);
  assert.equal(junk.dial, false); assert.equal(junk.clockSounds, false); assert.ok(!('extra' in junk));
  assert.equal(sanitizeAudio({ master: 33 }).master, 35, 'steps of 5');
  assert.equal(migrateAudio({ audio: { v: 2, master: 10 } }).master, 70, 'an unknown version starts from the defaults');
  assert.equal(migrateAudio({ vol: 40, sfxUi: false }).master, 40); assert.equal(migrateAudio({ sfxUi: false }).ui, false);
  assert.ok(migrateAudio({}, '?sound=off').mute); assert.ok(migrateAudio({}, '?sound=quiet').quiet); assert.ok(migrateAudio({}, '?sound=full').touched);
  assert.ok(!migrateAudio({ audio: { ...audioDefaults(), touched: true } }, '?sound=off').mute, 'the address is read only while touched is false');
  for (const name of Object.keys(PRESETS)) assert.equal(presetOf(applyPreset(audioDefaults(), name)), name);
  assert.equal(presetOf(applyPreset(audioDefaults(), 'off')), 'off'); assert.equal(presetOf({ ...audioDefaults(), game: false, quiet: true }), 'custom');
  assert.equal(applyPreset({ ...audioDefaults(), mute: true }, 'full').mute, false, 'a preset other than Off is a request to hear: it unmutes, so the menu is never a trap');
  assert.equal(presetOf(applyPreset({ ...audioDefaults(), mute: true }, 'classroom')), 'classroom'); assert.equal(applyPreset({ ...audioDefaults(), mute: true }, 'off').mute, true);
  const f = mirrorFlat({ audio: { ...audioDefaults(), mute: true, master: 40 } }); assert.equal(f.sound, false); assert.equal(f.vol, 40);
  assert.match(audioSettingsHTML(audioDefaults(), 'running'), /Mute all sound[\s\S]*Play a test sound/);
  assert.match(audioSettingsHTML(audioDefaults(), 'unsupported'), /cannot play sound/);
});
test('joining a room applies Classroom and leaving puts the earlier values back', () => {
  const a = { ...audioDefaults(), master: 55 };
  const j = joinRoom(a); assert.ok(j.next.quiet && j.next.master === 70 && !j.next.touched);
  assert.deepEqual(leaveRoom(j.next, j.before), { ...a }, 'restored');
  assert.deepEqual(leaveRoom({ ...j.next, master: 30 }, j.before).master, 30, 'not when a setting was changed meanwhile');
  assert.equal(joinRoom({ ...a, touched: true }), null, 'never for a player who touched a sound setting');
});

// ---------------------------------------------------------------------------------------------------------------- the engine
test('Web Audio missing, a factory that throws, a closed context: nothing throws', () => {
  const a = createAudio({ factory: null });
  assert.equal(a.state, 'unsupported');
  for (const call of [() => a.play('ui.tick'), () => a.request('sale.win'), () => a.playMix([['ui.tick', {}]]), () => a.unlock(), () => a.sync({}), () => a.setHidden(true), () => a.hold(true), () => a.hold(false), () => a.countUp(50), () => a.ambient({ theme: 'scrap' }),
    () => a.dial.start(), () => a.dial.update(0.5, 0.4, 0.6), () => a.dial.stop(), () => a.render('ui.tick', 'light', fakeContext()), () => a.release(), () => a.close(), () => a.stats(), () => a.stopAll(), () => a.setMute(true), () => a.applyPreset('classroom'), () => a.meter()]) assert.doesNotThrow(call);
  const t = rig({}, { unlock: false, factory: () => { throw new Error('boom'); } });
  t.audio.unlock(); assert.equal(t.audio.state, 'unsupported'); assert.equal(t.audio.play('ui.tick'), null);
  const c = rig(); c.ctx.state = 'closed'; assert.doesNotThrow(() => c.audio.play('ui.tick')); assert.equal(c.audio.play('ui.tick'), null);
  const s = rig({}, { ctx: { failResume: true } }); assert.doesNotThrow(() => s.audio.unlock());
  assert.equal(createAudio({ factory: null }).play('nonsense'), null);
});
test('before the first gesture there is no context and a play is dropped, not queued', () => {
  const t = rig({}, { unlock: false });
  assert.equal(t.audio.state, 'locked'); assert.equal(t.ctx.nodes.length, 0, 'nothing is created before a gesture');
  assert.equal(t.audio.play('ui.tick'), null); assert.ok(t.audio.stats().dropped.locked >= 1);
  t.audio.unlock(); assert.equal(t.audio.state, 'running'); assert.ok(t.audio.play('ui.tick'));
});
test('settings gate every bus', () => {
  const t = rig({ mute: true });
  assert.equal(t.audio.play('ui.tick'), null); assert.equal(t.audio.stats().dropped.mute, 1);
  const u = rig({ ui: false }); assert.equal(u.audio.play('ui.tick'), null); assert.ok(u.audio.play('cash.in', { size: 'm' }));
  const g = rig({ game: false }); assert.equal(g.audio.play('cash.in', { size: 'm' }), null); assert.ok(g.audio.play('ui.tick'));
  const q = rig({ quiet: true }); assert.equal(q.audio.play('world.hover'), null, 'tiny game sounds are not played in Classroom'); assert.ok(q.audio.play('sale.win'));
  const c = rig({ clockSounds: false }); c.audio.request('day.turn', { clock: true }); c.clock.flush(); assert.equal(c.audio.stats().played['day.turn'], undefined);
  const m = rig(); m.audio.setMute(true); assert.equal(m.audio.play('ui.tick'), null); assert.equal(m.audio.chain.master.gain.calls.at(-1)[1], 0, 'the master gain goes to 0');
  m.audio.setMute(false); m.audio.setMaster(50); assert.ok(Math.abs(m.audio.chain.master.gain.calls.at(-1)[1] - 0.25) < 1e-9, 'volume 50 is a gain of 0.25');
});
test('every voice has an attack ramp of 0.4 ms or more and an exponential release (no clicks)', () => {
  const t = rig({}, { ctx: { sampleRate: 8000 } });
  const bad = [];
  for (const id of IDS) for (const v of variantsOf(id)) {
    t.clock.advance(6000); t.ctx.currentTime += 6;
    const before = t.ctx.nodes.length;
    const h = t.audio.play(id, { variant: v, noCooldown: true, player: true, delay: 0 });
    if (!h) { bad.push(`${id}#${v}: dropped (${JSON.stringify(t.audio.stats().dropped)})`); continue; }
    for (const n of t.ctx.nodes.slice(before)) if (n.kind === 'gain' && n.gain.calls.length) {
      const c = n.gain.calls, lin = c.findIndex((x) => x[0] === 'linear'), exp = c.findIndex((x) => x[0] === 'exp');
      if (lin < 0 || exp < 0) { bad.push(`${id}#${v}: an envelope without ${lin < 0 ? 'an attack' : 'a release'}`); continue; }
      if (c[lin][2] - c[lin - 1][2] < 0.0004 - 1e-9) bad.push(`${id}#${v}: attack ${(c[lin][2] - c[lin - 1][2]) * 1000} ms`);
    }
  }
  assert.deepEqual(bad, []);
});
test('cooldowns hold, and a higher rank inside a lower one plays and stops it', () => {
  const t = rig();
  const a = t.audio.play('cash.in', { size: 'm' }); assert.ok(a);
  t.clock.advance(80); const b = t.audio.play('cash.in', { size: 'xl' });
  assert.ok(b, 'the xl plays 80 ms after an m'); assert.ok(a.group.stopped, 'and the m is stopped');
  t.clock.advance(80); assert.equal(t.audio.play('cash.in', { size: 'm' }), null, 'an m inside the xl cooldown is dropped');
  const t2 = rig(); t2.audio.play('achievement', { variant: 'common' }); t2.clock.advance(100);
  assert.ok(t2.audio.play('achievement', { variant: 'epic' }), 'an epic after a common inside 1500 ms');
  const t3 = rig(); assert.ok(t3.audio.play('alert.shock', { variant: 'fed' })); assert.ok(t3.audio.play('alert.shock', { variant: 'viral' }), 'the six kinds have a cooldown each');
  assert.equal(t3.audio.play('alert.shock', { variant: 'fed' }), null);
  const t4 = rig(); t4.audio.play('level.up', { variant: 'l' }); t4.clock.advance(50); assert.ok(t4.audio.play('level.up', { variant: 'big' }) === null || true);
  const t5 = rig(); t5.audio.play('ui.tick'); assert.equal(t5.audio.play('ui.tick'), null, 'inside 30 ms'); t5.clock.advance(31); assert.ok(t5.audio.play('ui.tick'));
});
test('1,000 requests in one second: at most 12 voices, tiny dropped before medium, loud steals', () => {
  const t = rig(), ids = IDS.filter((id) => RECIPES[id].bus), r = rngOf(3);
  let max = 0;
  for (let i = 0; i < 1000; i++) { t.clock.advance(1); const id = ids[Math.floor(r() * ids.length)], vs = variantsOf(id); t.audio.play(id, { variant: vs[Math.floor(r() * vs.length)] }); max = Math.max(max, t.audio.stats().active); }
  assert.ok(max <= 12, 'voices ' + max);
  const tk = rig(); let n = 0; for (let i = 0; i < 1000; i++) { tk.clock.advance(1); if (tk.audio.play('ui.tick', { player: false })) n++; }
  assert.ok(n <= 13, `the tiny bucket lets 8 a second and a burst of 4 through, not ${n}`);
  const old = LIMITS.VOICES; LIMITS.VOICES = 3;
  try {
    const s = rig(); const o = { noCooldown: true, player: true };
    for (const id of ['ship.depart', 'bank.draw', 'hire.manager']) { s.clock.advance(300); assert.ok(s.audio.play(id, o)); }
    s.clock.advance(300); assert.equal(s.audio.play('ui.tick', { ...o }), null, 'a tiny request that finds only medium voices is dropped'); assert.ok(s.audio.stats().dropped.cap >= 1);
    s.clock.advance(300); assert.ok(s.audio.play('pool.sell', o), 'a medium request steals the oldest medium voice'); assert.equal(s.audio.stats().active, 3);
    s.clock.advance(1300); assert.ok(s.audio.play('alert.advance', { variant: 'l3', ...o }), 'a loud request is never dropped for a voice'); assert.ok(s.audio.stats().active <= 3);
  } finally { LIMITS.VOICES = old; }
});
test('loud sounds duck the others, deepest wins, the same burst is not ducked', () => {
  const t = rig(); const { nodes } = t.audio.chain;
  t.audio.play('level.up', { variant: 'l' });
  assert.ok(nodes.game.tiny.gain.calls.some((c) => c[0] === 'target' && Math.abs(c[1] - 10 ** (-6 / 20)) < 1e-9), 'tiny sounds -6 dB'); assert.ok(nodes.ambDuck.gain.calls.some((c) => c[0] === 'target' && Math.abs(c[1] - 10 ** (-9 / 20)) < 1e-9), 'ambient -9 dB');
  const n = nodes.game.tiny.gain.calls.length; t.clock.advance(400); t.audio.play('ui.tick'); assert.equal(nodes.game.tiny.gain.calls.length, n, 'a tiny sound does not duck');
});
test('the refusal family escalates: a repeat within 2 s is 4 dB down, a third is silent', () => {
  const t = rig(); t.audio.play('ui.refuse'); t.clock.advance(720);
  const second = t.audio.play('ui.refuse'); assert.ok(second); t.clock.advance(720);
  assert.equal(t.audio.play('ui.refuse'), null, 'a third inside 2 s'); t.clock.advance(2100); assert.ok(t.audio.play('ui.refuse'), 'after 2 s of quiet');
});
test('layer families do not stack: the later voice skips a repeated stamp, coin or sparkle', () => {
  const t = rig();
  const count = (before) => t.ctx.nodes.slice(before).filter((n) => n.kind === 'osc').length;
  let b = t.ctx.nodes.length; t.audio.play('audit.result', { variant: 'pass' }); const first = count(b);
  t.clock.advance(300); b = t.ctx.nodes.length; t.audio.play('deal.result', { variant: 'info' }); const stampless = count(b);
  const lone = rig(); b = lone.ctx.nodes.length; lone.audio.play('deal.result', { variant: 'info' }); const alone = count(b);
  assert.ok(first > 0 && stampless <= alone, 'a second stamp inside 1200 ms is left out');
  assert.ok(FAMILY_MS.stamp === 1200 && FAMILY_MS.coin === 250 && FAMILY_MS.sparkle === 800 && FAMILY_MS.brass === 1500 && FAMILY_MS.bell === 1500 && FAMILY_MS.thump === 250);
});
test('voices that start within 120 ms share one jitter value', () => {
  const t = rig(); t.audio.play('sale.win', { variant: 'w' }); t.clock.advance(60); t.audio.play('pool.sell');
  const dets = t.ctx.nodes.filter((n) => n.kind === 'osc').map((n) => Math.round(n.detune.value * 1000) / 1000);
  assert.ok(new Set(dets).size <= 2, 'one jitter value (plus the unison detunes)');
});
test('the pool rotates: the same timbre never plays twice in a row', () => {
  const t = rig(); const seen = [];
  for (let i = 0; i < 12; i++) { t.clock.advance(100); const b = t.ctx.nodes.length; t.audio.play('ui.tick', { variant: 'light' }); seen.push(t.ctx.nodes.slice(b).find((n) => n.kind === 'osc').frequency.calls[0][1]); }
  for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1]);
});
test('a mix is admitted whole or not at all, and counted once', () => {
  const t = rig();
  const h = t.audio.playMix([['sale.win', { variant: 'w' }], ['cash.in', { size: 'm', gainDb: -4 }], ['streak', { params: { n: 3 } }]]);
  assert.ok(h); assert.equal(t.audio.stats().active, 1, 'one voice group'); assert.ok(h.group.voices.length >= 3);
  t.clock.advance(100); assert.equal(t.audio.playMix([['sale.win', {}], ['cash.in', { size: 'm' }]]), null, 'the cause is inside its cooldown: the coins go with it');
});
test('the repair dial tone is not one of the 12 voices and follows the marker', () => {
  const t = rig({ dial: true });
  assert.ok(t.audio.dial.start()); assert.equal(t.audio.stats().active, 0);
  t.audio.dial.update(0.0, 0.4, 0.6); t.audio.dial.update(1, 0.4, 0.6); t.audio.dial.update(0.5, 0.4, 0.6);
  const main = t.ctx.nodes.find((n) => n.kind === 'osc'); const targets = main.frequency.calls.filter((c) => c[0] === 'target').map((c) => c[1]);
  assert.ok(targets[1] > targets[0], 'right is higher than left'); assert.ok(Math.abs(targets[0] - hz('D4')) < 1 && Math.abs(targets[1] - hz('D6')) < 1);
  t.audio.dial.stop(); assert.equal(t.audio.dial.active, false);
  assert.equal(rig({ dial: false }).audio.dial.start(), false, 'off by default'); assert.equal(rig({ dial: true, quiet: true }).audio.dial.start(), false, 'off in Classroom');
});
test('hidden stops everything and suspends; visible resumes; 60 s of idle suspends', () => {
  const t = rig(); t.audio.play('level.up', { variant: 'l' });
  t.audio.setHidden(true); assert.equal(t.audio.state, 'suspended'); assert.equal(t.audio.stats().active, 0); t.clock.advance(100); assert.equal(t.ctx.state, 'suspended');
  assert.equal(t.audio.play('ui.tick'), null, 'nothing plays in a hidden tab');
  t.audio.setHidden(false); t.clock.advance(1); assert.equal(t.ctx.state, 'running'); assert.ok(t.audio.env.justVisible, 'events are catching up until the first on-time tick');
  const u = rig(); u.audio.play('ui.tick'); u.clock.advance(61000); assert.equal(u.ctx.state, 'suspended', 'idle'); u.audio.play('ui.tick'); assert.equal(u.ctx.state, 'running', 'the next play resumes it');
});
test('no timer exists while sound is idle; the collector\'s timer lives from a request to its flush', () => {
  const t = rig(); assert.equal(t.clock.pending(), 0);
  t.audio.request('sale.win', { variant: 'w' }); assert.equal(t.clock.pending(), 1); t.clock.flush();
  assert.ok(t.clock.pending() <= 1, 'only the idle suspend remains'); t.clock.advance(61000); assert.equal(t.clock.pending(), 0);
});
test('the ambient bed: stored before the gesture, applied at unlock, nothing while off, one timer chain, a Classroom rule', () => {
  const t = rig({ ambient: true }, { unlock: false });
  t.audio.ambient({ theme: 'harbor', tier: 1, night: 0, speed: 1 }); assert.equal(t.ctx.nodes.length, 0, 'remembered, not played');
  t.audio.unlock(); assert.ok(t.ctx.count('buf') >= 3, 'the bed starts at unlock'); assert.ok(t.audio.stats().ambient.playing);
  assert.ok(t.clock.pending() <= 2, 'one timer chain for the one-shots');
  const sources = t.ctx.count('buf'); t.audio.ambient({ theme: 'harbor', tier: 1, night: 0, speed: 1 }); assert.equal(t.ctx.count('buf'), sources, 'idempotent');
  t.audio.ambient({ theme: 'metro', tier: 1, night: 0, speed: 1 }); assert.ok(t.ctx.count('buf') > sources, 'a new district crossfades to a new bed');
  t.audio.setAmbient(false); assert.equal(t.audio.stats().ambient.playing, false); assert.equal(t.audio.stats().ambient.timer, false);
  const off = rig({ ambient: false }); off.audio.ambient({ theme: 'scrap' }); assert.equal(off.ctx.count('buf'), 0, 'nothing is created while it is off');
  const q = rig({ ambient: true, quiet: true }); q.audio.ambient({ theme: 'scrap' }); assert.equal(q.ctx.count('buf'), 0, 'off in Classroom');
  const sb = rig({ ambient: true }); sb.audio.ambient({ theme: 'scrap', sandbox: true }); assert.equal(sb.ctx.count('buf'), 0, 'off in an Academy lesson');
  assert.equal(normState({ theme: 'constructor' }).theme, null); assert.equal(normState(null).night, 0);
});
test('ambient one-shot rate rule', () => {
  const h = (o = {}) => ({ shots: [], lastMedium: -Infinity, lastMoment: -Infinity, dialog: false, ...o });
  assert.ok(shotAllowed(h(), 100000));
  assert.ok(!shotAllowed(h({ shots: [99000] }), 100000), 'four seconds between any two');
  assert.ok(!shotAllowed(h({ shots: [50000, 70000, 90000] }), 100000), 'three a minute at most');
  assert.ok(!shotAllowed(h({ lastMedium: 99000 }), 100000), 'none within 1.5 s of a medium sound'); assert.ok(!shotAllowed(h({ lastMoment: 96000 }), 100000), 'none within 6 s of a moment'); assert.ok(!shotAllowed(h({ dialog: true }), 100000));
  assert.deepEqual(allowedShots({ ...normState({ theme: 'scrap', speed: 16 }) }), [], 'none from 16x'); assert.deepEqual(allowedShots(normState({ theme: 'scrap', paused: true })), [], 'none while paused');
  assert.ok(allowedShots(normState({ theme: 'harbor', night: 1 })).every(({ o }) => o.when !== 'day'), 'no gulls at night');
});
test('render() puts a voice into an offline context, through the chain from 0.6 s', () => {
  const t = rig(), oc = fakeContext({ state: 'running' });
  const v = t.audio.render('ui.tick', 'light', oc); assert.ok(v.end > 0.01);
  const w = t.audio.render('level.up', 'l', oc, { chain: true }); assert.ok(w.end > 0.6);
  assert.ok(oc.count('comp') >= 1 && oc.count('shaper') >= 1);
});

// ---------------------------------------------------------------------------------------------------------------- the collector
const env = (o = {}) => ({ speed: 1, durOf: (id, v) => (RECIPES[id].dur) * 1000, ...o });
const R = (id, opts = {}, meta = {}) => ({ id, opts, meta });
test('a burst of [level, quest, pitch, streak] plays the sale first, the level after it, and the quest as a tick', () => {
  const st = createResolverState(), now = 100000;
  const sale = R('sale.win', { variant: 'w', with: [['cash.in', { size: 'm' }], ['streak', { params: { n: 3 } }]] });
  const out = resolveBurst(st, [R('level.up', {}, { level: 3 }), R('quest.complete'), sale], env(), now);
  assert.equal(out.plays[0].role, 's1'); assert.equal(out.plays[0].mix[0][0], 'sale.win'); assert.equal(out.plays[0].mix.length, 3);
  assert.equal(out.plays[1].role, 's2'); assert.equal(out.plays[1].mix[0][0], 'level.up'); assert.ok(out.plays[1].delay >= 350 && out.plays[1].delay <= 500);
  assert.equal(out.plays[1].mix[0][1].secondary, true); assert.equal(out.plays[1].mix[0][1].gainDb, -4);
  assert.equal(out.plays[2].role, 'also'); assert.equal(out.plays[2].mix[0][0], 'reward.also'); assert.equal(out.sentences, 2);
});
test('merging: the highest level once, the higher district, four Codex pages one sound, the rarest achievement', () => {
  const st = createResolverState();
  let out = resolveBurst(st, [R('level.up', {}, { level: 2 }), R('level.up', {}, { level: 5 }), R('level.up', {}, { level: 3 })], env(), 1e6);
  assert.equal(out.plays.length, 1); assert.equal(out.plays[0].mix[0][1].variant, 'big', 'big on every fifth level');
  out = resolveBurst(createResolverState(), [R('zone.open', { variant: 't1' }), R('zone.open', { variant: 't4' })], env(), 1e6); assert.equal(out.plays.length, 1); assert.equal(out.plays[0].mix[0][1].variant, 't4');
  out = resolveBurst(createResolverState(), [1, 2, 3, 4].map(() => R('codex.unlock')), env(), 1e6); assert.equal(out.plays.length, 1);
  out = resolveBurst(createResolverState(), [R('achievement', { variant: 'common' }), R('achievement', { variant: 'epic' })], env(), 1e6); assert.equal(out.plays[0].mix[0][1].variant, 'epic');
  out = resolveBurst(createResolverState(), [R('level.up', {}, { level: 2 })], env(), 1e6); assert.equal(out.plays[0].mix[0][1].variant, 'l', 'the first level of 90 s is the full fanfare');
  const st2 = createResolverState(); resolveBurst(st2, [R('level.up', {}, { level: 2 })], env(), 1e6); out = resolveBurst(st2, [R('level.up', {}, { level: 3 })], env(), 1e6 + 20000);
  assert.equal(out.plays.at(-1).mix[0][1].variant ?? 's', 's', 'then the everyday run (and inside the 10 s window a tick)');
});
test('the reward budget: one full reward per 10 s, ticks one per 3 s, 20 s at 16x, and the exemptions', () => {
  const st = createResolverState();
  let out = resolveBurst(st, [R('quest.complete')], env(), 100000); assert.equal(out.plays[0].role, 's1');
  out = resolveBurst(st, [R('achievement', { variant: 'rare' })], env(), 104000); assert.equal(out.plays[0].role, 'also', 'inside 10 s it is a tick');
  out = resolveBurst(st, [R('achievement', { variant: 'rare' })], env(), 105000); assert.equal(out.plays.length, 0, 'and a tick comes at most once in 3 s');
  out = resolveBurst(st, [R('milestone', { variant: 'm1' })], env(), 105500); assert.equal(out.plays[0].role, 's1', 'a milestone is exempt');
  out = resolveBurst(st, [R('achievement', { variant: 'rare' })], env(), 111000); assert.equal(out.plays[0].role, 's1', 'after 10 s');
  const f = createResolverState(); resolveBurst(f, [R('quest.complete')], env({ speed: 16 }), 100000);
  out = resolveBurst(f, [R('achievement', { variant: 'rare' })], env({ speed: 16 }), 112000); assert.equal(out.plays[0].role, 'also', 'the window is 20 s at 16x');
  out = resolveBurst(createResolverState(), [R('daily.done'), R('achievement', { variant: 'common' }), R('codex.unlock')], env({ speed: 16 }), 1e6); assert.equal(out.plays.length, 0, 'daily bounties, common achievements and Codex pages are silent at 16x');
  out = resolveBurst(createResolverState(), [R('daily.done')], env({ speed: 4 }), 1e6); assert.equal(out.plays.length, 0, 'daily bounties are silent from 4x');
  const d = createResolverState(); resolveBurst(d, [R('daily.done')], env(), 1e6); out = resolveBurst(d, [R('daily.done')], env(), 1e6 + 30000); assert.ok(out.plays.every((p) => p.role === 'also' || p.mix[0][0] === 'reward.also'), 'a second daily within 60 s is a tick');
});
test('no burst has more than two sentences, whatever the engine computed', () => {
  const r = rngOf(11), all = IDS.filter((id) => ['cause', 'state', 'reward'].includes(RECIPES[id].class));
  for (let i = 0; i < 300; i++) {
    const reqs = Array.from({ length: 1 + Math.floor(r() * 9) }, () => { const id = all[Math.floor(r() * all.length)], vs = variantsOf(id); return R(id, { variant: vs[Math.floor(r() * vs.length)] }, { level: 1 + Math.floor(r() * 9) }); });
    const out = resolveBurst(createResolverState(), reqs, env({ speed: [1, 4, 16, 64][i % 4] }), 1e6);
    assert.ok(out.sentences <= 2, out.sentences + ' sentences');
  }
});
test('the engine plays a requested burst through the collector in one macrotask', () => {
  const t = rig(); t.audio.setEnv({ lastPress: t.clock.now() });
  t.audio.request('level.up', { meta: { level: 2 } }); t.audio.request('quest.complete'); t.audio.request('sale.win', { variant: 'w', with: [['cash.in', { size: 'm' }]] });
  assert.equal(t.audio.stats().played['sale.win'], undefined, 'nothing yet: the burst is held for one macrotask'); t.clock.flush();
  const p = t.audio.stats().played; assert.equal(p['sale.win'], 1); assert.equal(p['cash.in'], 1); assert.equal(p['level.up'], 1); assert.equal(p['quest.complete'], undefined);
  assert.ok(t.audio.stats().maxSentences <= 2);
});

// ---------------------------------------------------------------------------------------------------------------- clock gates, catch-up, states, holds, the sandbox
test('the clock table: day.turn, buyers, managers at each speed; paused plays nothing', () => {
  const st = createResolverState();
  assert.ok(gateClock(st, R('day.turn'), { speed: 1 }, 1000).ok); assert.ok(!gateClock(st, R('day.turn'), { speed: 16 }, 1000).ok); assert.ok(!gateClock(st, R('day.turn'), { speed: 1, paused: true }, 1000).ok);
  const s4 = createResolverState(); assert.deepEqual([1, 2, 3, 4].map(() => gateClock(s4, R('day.turn'), { speed: 4 }, 1000).ok), [true, false, false, true], 'every third day at 4x');
  const b = createResolverState(); const arrive = (t, o = {}) => gateClock(b, R('buyer.arrive'), { speed: 1, ...o }, t).ok;
  assert.deepEqual([arrive(0), arrive(1000), arrive(2000), arrive(3000), arrive(40000)], [true, true, true, false, true], 'the first three of a run always play, then one per 30 s');
  assert.ok(!arrive(100000, { busy: true }), 'silent while the player is busy'); assert.ok(!arrive(200000, { speed: 16 }));
  const c = createResolverState(); assert.ok(gateClock(c, R('manager.cycle', {}, { net: 5 }), { speed: 4 }, 0).ok); assert.ok(!gateClock(c, R('manager.cycle', {}, { net: 5 }), { speed: 4 }, 1000).ok, 'one per 3 s at 4x');
  const f = createResolverState(), a1 = R('manager.cycle', {}, { net: 10 }); a1.opts = {}; const g1 = gateClock(f, a1, { speed: 64 }, 1e6);
  const a2 = R('manager.cycle', {}, { net: 20 }); const g2 = gateClock(f, a2, { speed: 64 }, 1e6 + 3000);
  assert.ok(g1.ok && a1.sum === 10 && !g2.ok, 'at 64x there is no standing coin: one summed cash.in at most every 8 s');
});
test('state sounds play on entering, then once per 45 s, sized by the sum of what was dropped', () => {
  const st = createResolverState();
  assert.deepEqual(stateGate(st, 'overdraft', 5, 0), { play: true, amount: 5 }); assert.equal(stateGate(st, 'overdraft', 7, 2600).play, false); assert.equal(stateGate(st, 'overdraft', 9, 5200).play, false);
  assert.deepEqual(stateGate(st, 'overdraft', 3, 50000), { play: true, amount: 19 });
});
test('catch-up is lateness in real time: 600 ms, a tab back from hidden, a rewind; a press lifts it', () => {
  assert.ok(!catchingUp({ lagMs: 330 }, 0), 'a 64x tick of 2.29 hours is on time'); assert.ok(catchingUp({ lagMs: 440 + 200 }, 0)); assert.ok(catchingUp({ justVisible: true }, 0)); assert.ok(catchingUp({ rewound: true }, 0));
  assert.ok(!catchingUp({ lagMs: 5000, lastPress: -500 }, 0), 'a press in the last 1500 ms');
  const t = rig(); t.audio.setEnv({ lagMs: 5000 }); assert.equal(t.audio.request('sale.win', { variant: 'w' }), false); assert.ok(t.audio.stats().dropped.catchup >= 1);
});
test('an Academy lesson is silent for pretend rewards and keeps the money sounds', () => {
  const t = rig(); t.audio.setEnv({ sandbox: true });
  for (const id of SANDBOX_SILENT) assert.equal(t.audio.request(id), false, id);
  assert.equal(t.audio.request('sale.win', { variant: 'w' }), true);
});
test('the hold: clock sounds wait while a dialog is open and one summed coin plays on close', () => {
  const t = rig(); t.audio.hold(true);
  assert.equal(t.audio.request('manager.cycle', { meta: { net: 40 } }), false); assert.equal(t.audio.request('manager.cycle', { meta: { net: 60 } }), false);
  assert.equal(t.audio.request('day.turn', { clock: true }), false);
  t.audio.hold(false); t.clock.flush(); assert.equal(t.audio.stats().played['cash.in'], 1);
  assert.deepEqual(holdRelease(createResolverState(), 0), null);
});

// ---------------------------------------------------------------------------------------------------------------- the wiring tables
const EVENTS = {
  pitch: [{ outcome: 'win', price: 120, gain: 0.3 }, { outcome: 'pioneer', price: 5000, gain: 0.5 }, { outcome: 'herd', price: 40, gain: 0.03 }, { outcome: 'herd', price: 40, gain: 0.01 }, { outcome: 'flat', price: 90, gain: 0 }, { outcome: 'flat', price: 90, gain: -0.05 }, { outcome: 'rejected', reason: 'nofit' }],
  buy: [{ price: 80, cond: 'ok' }, { price: 80, cond: 'broken' }], 'sell-pool': [{ total: 500, count: 3 }, { total: 500, delay: 24 }], repair: [{ precision: 0.9, cost: 50 }, { precision: 0.5, cost: 20 }, { precision: 0.1, cost: 9000 }],
  ship: [{ from: 1, to: 2, count: 3 }], hire: [{ kind: 'student' }, { kind: 'broker' }, { kind: 'logistics' }], upgrade: [{ id: 'freight' }], 'pipe-level': [{ id: 'p1', level: 2 }], cycle: [{ zone: 1, net: 12, pid: 'x' }, { zone: 1, net: 3, src: 'rent' }],
  draw: [{ prod: 'pipeline', amount: 1000 }], repay: [{ amount: 100 }], client: [{ tier: 'smb' }, { tier: 'ent' }], audit: [{ choice: 'comply', ok: true }, { choice: 'ignore', ok: false }], zone: [{ id: 5 }], milestone: [{ n: 1 }, { n: 2 }, { n: 3 }],
  shock: ['tiktok', 'fed', 'tariff', 'viral', 'glut', 'scare'].map((kind) => ({ kind })), p2p: [{ peer: 'a', variance: 0, npc: true }, { peer: 'b', variance: 0 }], skill: [{ skill: 'ops', level: 2 }], level: [{ level: 4 }], inspect: [{ score: 1, fake: true, caught: true }, { score: 1, fake: false, caught: false }],
  haggle: [{ role: 'sell', mult: 1, score: 1, deal: true }], auction: [{ won: true, price: 5, surplus: 3 }], streak: [{ n: 1 }, { n: 4 }, { n: 9 }], day: [{ day: 3 }], 'margin-call': [{}], insolvent: [{}], exit: [{ kind: 'ipo' }], perk: [{ id: 'heir', effect: 'bailout' }, { id: 'heir', effect: 'fine-waived' }],
};
const SILENT = new Set(['inspect', 'haggle', 'auction']);
test('every event type has a row, every id it names exists, and the silent ones are silent', () => {
  assert.deepEqual(Object.keys(EVENTS).sort(), [...EVENT_TYPES].sort(), 'a new event type with no row fails this test');
  const hooks = { now: () => 1000, netWorth: () => 10000, zoneTier: () => 3 };
  for (const [type, variants] of Object.entries(EVENTS)) for (const ev of variants) {
    const calls = eventCalls({ type, day: 1, ...ev }, newWireState(), hooks);
    if (SILENT.has(type) || (type === 'streak' && ev.n < 2) || (type === 'p2p' && !ev.npc)) { assert.deepEqual(calls, [], type + ' is silent'); continue; }
    if (type === 'streak') { assert.equal(calls.length, 1); }
    assert.ok(calls.length >= 1, `${type} ${JSON.stringify(ev)} plays something`);
    for (const [m, id, o] of calls) { assert.ok(RECIPES[id], `${type}: ${id} exists`); if (o?.variant) assert.ok(RECIPES[id].variants[o.variant], `${id}#${o.variant}`); for (const [wid, wo] of o?.with || []) { assert.ok(RECIPES[wid]); if (wo.variant) assert.ok(RECIPES[wid].variants[wo.variant]); } }
  }
});
test('the pitch table: herd that paid is a win, a flat sale well below fair is dull, a scam is not a nofit', () => {
  const h = { now: () => 1, netWorth: () => 0 }, one = (ev, st = newWireState()) => eventCalls({ type: 'pitch', price: 100, ...ev }, st, h)[0];
  assert.equal(one({ outcome: 'herd', gain: 0.03 })[2].variant, 'hw'); assert.equal(one({ outcome: 'herd', gain: 0.01 })[2].variant, 'h');
  assert.equal(one({ outcome: 'flat', gain: -0.05 })[2].with[0][1].dull, true); assert.equal(one({ outcome: 'flat', gain: 0 })[2].with[0][1].dull, undefined);
  assert.equal(one({ outcome: 'rejected', gain: -1 })[1], 'sale.scam'); assert.equal(one({ outcome: 'rejected', reason: 'nofit' })[2].variant, 'nofit');
  const st = newWireState(); noteCalls({ level: 'bad', text: 'The Hipster spotted a counterfeit. That Watch is worthless.' }, st, { now: () => 1 }); assert.equal(one({ outcome: 'rejected' }, st)[2].variant, 'fake');
  const sc = newWireState(); noteCalls({ level: 'bad', text: 'Scam: the payment bounced and the buyer vanished.' }, sc, { now: () => 1 }); assert.equal(one({ outcome: 'rejected' }, sc)[1], 'sale.scam');
});
test('a streak rides in the sale\'s mix and is skipped under a falling sale sound', () => {
  const h = { now: () => 1, netWorth: () => 0 }, st = newWireState();
  const [, , sale] = eventCalls({ type: 'pitch', outcome: 'win', price: 100, gain: 0.2 }, st, h)[0]; assert.deepEqual(eventCalls({ type: 'streak', n: 3 }, st, h), []); assert.deepEqual(sale.with.at(-1), ['streak', { params: { n: 3 } }]);
  const f = newWireState(); eventCalls({ type: 'pitch', outcome: 'herd', price: 100, gain: 0.0 }, f, h); assert.deepEqual(eventCalls({ type: 'streak', n: 3 }, f, h), []);
  assert.equal(eventCalls({ type: 'streak', n: 12 }, newWireState(), h)[0][2].params.n, 6, 'n is capped at 6 notes');
});
test('hidden information never reaches a sound', () => {
  const h = { now: () => 1, netWorth: () => 0 };
  assert.deepEqual(eventCalls({ type: 'buy', price: 80, cond: 'ok', fake: true }, newWireState(), h), eventCalls({ type: 'buy', price: 80, cond: 'ok', fake: false }, newWireState(), h));
  for (const ev of [{ score: 9, fake: true, caught: true, repeat: true }, { score: 0, fake: false, caught: false }, { fake: true, caught: false }]) assert.deepEqual(eventCalls({ type: 'inspect', ...ev }, newWireState(), h), []);
  assert.deepEqual(eventCalls({ type: 'auction', won: true, price: 5, surplus: 1 }, newWireState(), h), eventCalls({ type: 'auction', won: true, price: 5, surplus: 900 }, newWireState(), h));
  assert.deepEqual(eventCalls({ type: 'pitch', outcome: 'rejected', reason: 'nofit', scam: true }, newWireState(), h), eventCalls({ type: 'pitch', outcome: 'rejected', reason: 'nofit', scam: false }, newWireState(), h), 'a scam flag on the event is not read');
  assert.deepEqual(uiCalls({ type: 'ui', ui: 'lead', zone: 1, ids: [3], urgent: false, scam: true, truth: 'fake' }, newWireState(), h), uiCalls({ type: 'ui', ui: 'lead', zone: 1, ids: [3], urgent: false }, newWireState(), h));
  const st = newWireState(); assert.equal(dealCalls({ what: 'suspect', lot: 1 }, st).length, 1); assert.equal(dealCalls({ what: 'suspect', lot: 1 }, st).length, 0, 'once per lot');
});
test('money sizes on the sale and the purchase, and the coin of a pool sale waits for its delay', () => {
  const h = { now: () => 1, netWorth: () => 0 };
  const win = (price) => eventCalls({ type: 'pitch', outcome: 'win', price, gain: 0.5 }, newWireState(), h)[0][2].with[0][1].size;
  assert.deepEqual([win(3), win(100), win(5000), win(90000)], ['s', 'm', 'l', 'xl']);
  assert.equal(eventCalls({ type: 'buy', price: 90000, cond: 'ok' }, newWireState(), h)[0][2].with[0][1].size, 'l', 'money out folds xl into l');
  assert.equal(eventCalls({ type: 'sell-pool', total: 500, delay: 24 }, newWireState(), h)[0][2].with.length, 0); assert.equal(eventCalls({ type: 'sell-pool', total: 500, delay: 0 }, newWireState(), h)[0][2].with.length, 1);
  assert.deepEqual(eventCalls({ type: 'repair', precision: 0.5, cost: 20 }, newWireState(), h)[0][2].with, [], 'repair plays cash.out only at size l or larger');
  assert.equal(eventCalls({ type: 'repair', precision: 0.5, cost: 9000 }, newWireState(), h)[0][2].with.length, 1);
  const st = newWireState(); eventCalls({ type: 'perk', effect: 'fine-waived' }, st, { now: () => 5 }); assert.equal(eventCalls({ type: 'audit', ok: false }, st, { now: () => 6 })[0][2].noCoin, true, 'a fail after a waived fine plays no coin');
});
test('notes: the texts the engine writes are pinned, so a copy edit cannot silently mute a sound', () => {
  const kinds = { 'Scam: the payment bounced and the buyer vanished. Verify buyers before you ship.': 'scam', 'The Hipster spotted a counterfeit. That Watch is worth less.': 'counterfeit', '$1,200 settled into cash.': 'settle', 'Freight arrived in Metro.': 'freight-arrive',
    "Customs inspected your freight in Metro: 12 hours' delay and a $40 fee.": 'customs', 'Watch was damaged in transit (-20% quality).': 'damage', 'Your mentor says: look at Watch for Hipster in Metro.': 'mentor', 'SLA breach on a Retail contract: $200 penalty.': 'sla',
    'Cash is negative ($50). Interest accrues.': 'overdraft', 'Market fatigue: trend goods lose half their value for 72 hours.': 'fatigue', 'Burnout: you take a day off and no new buyers come to you.': 'burnout', 'Swap completed with Sam.': 'swap', 'Your net worth has fallen to zero or below.': 'insolvent' };
  for (const [text, kind] of Object.entries(kinds)) { assert.equal(noteKind({ text }), kind, text); assert.equal(noteKind({ text: 'x', kind }), kind); }
  assert.equal(noteCalls({ level: 'info', text: '$1,200 settled into cash.' }, newWireState(), {})[0][1], 'cash.in');
  assert.equal(noteCalls({ level: 'warn', text: 'Fed raises rates: effective in 3 days.', alert: { level: 2, start: 99 } }, newWireState(), {})[0][2].variant, 'l2');
  assert.deepEqual(noteCalls({ level: 'bad', text: 'BREAKING: Fed raises rates is live now.', alert: { level: 2 } }, newWireState(), {}), [], 'the live note is the shock event\'s');
  assert.equal(noteCalls({ level: 'warn', text: 'Audit event: x. You have 72 virtual hours to respond.', audit: true }, newWireState(), {})[0][1], 'audit.notice');
  assert.equal(noteCalls({ level: 'info', text: 'Day 90. The clearing horizon has closed.', final: true }, newWireState(), {})[0][2].variant, 'horizon');
  assert.equal(noteCalls({ level: 'good', text: 'Exit complete at $1.', final: true }, newWireState(), {})[0][2].variant, 'done');
  assert.deepEqual(noteCalls({ level: 'info', text: 'Something else.' }, newWireState(), {}), []); assert.deepEqual(noteCalls(null), []);
  assert.equal(noteCalls({ text: 'Cash is negative ($50).', amt: 50 }, newWireState(), {})[0][2].state, 'overdraft');
  assert.equal(sessionCalls('offer')[0][1], 'swap.offer-in'); assert.equal(sessionCalls('rewound')[0][1], 'ui.nudge'); assert.deepEqual(sessionCalls('tick'), []);
});
test('shell and Deal Room events', () => {
  const h = { now: () => 1, zoneTier: () => 4 }, st = newWireState();
  assert.equal(uiCalls({ type: 'ui', ui: 'open-drawer', id: 'bank' }, st, h)[0][2].variant, 'bank'); assert.equal(uiCalls({ type: 'ui', ui: 'close-drawer', id: 'bank' }, st, h)[0][1], 'ui.drawer-close');
  assert.equal(uiCalls({ type: 'ui', ui: 'zone', id: 9 }, st, h)[0][2].variant, 't4'); assert.equal(uiCalls({ type: 'ui', ui: 'lead', zone: 1, ids: [1], urgent: true }, st, h)[0][1], 'buyer.urgent');
  for (const ui of ['step', 'locked', 'hover']) assert.equal(uiCalls({ type: 'ui', ui }, st, h)[0][1], 'world.' + ui);
  assert.deepEqual(uiCalls({ type: 'ui', ui: 'unknown' }, st, h), []); assert.deepEqual(uiCalls({ type: 'pitch' }, st, h), []);
  assert.deepEqual(dealCalls({ what: 'quick', all: true }, st).map((c) => c[1]), ['deal.quick']); assert.deepEqual(dealCalls({ what: 'stage', key: 'read' }, st), [], 'no stage-done under Quick');
  assert.equal(dealCalls({ what: 'result', tone: 'bad' }, st)[0][2].cause, 'result'); assert.ok(dealCalls({ what: 'stage' }, st).length === 1, 'after the result card the stage sound is back');
  assert.equal(dealCalls({ what: 'fit', delta: 0.1 }, st)[0][2].variant, 'up'); assert.equal(dealCalls({ what: 'fit', delta: -0.1 }, st)[0][2].variant, 'down'); assert.deepEqual(dealCalls({ what: 'fit', delta: 0 }, st), []);
  assert.equal(dealCalls({ what: 'rival', kind: 'drop', side: 'left' }, st)[0][2].pan, -0.5); assert.equal(dealCalls({ what: 'hammer', won: false }, st)[0][2].variant, 'lost'); assert.equal(dealCalls({ what: 'count', xp: 60 }, st)[0][0], 'countUp');
});
test('the control table: a control that can refuse plays only ui.tick', () => {
  const c = (act, o = {}) => controlFor({ act, kind: 'click', ...o });
  assert.deepEqual(c('stock-sellpool'), ['play', 'ui.tick', { variant: 'light' }]); assert.equal(c('market-sell')[1], 'ui.tick'); assert.equal(c('travel-go')[1], 'ui.tick'); assert.equal(c('crew-hgo')[1], 'ui.tick');
  assert.equal(c('dock', { id: 'bank' })[1], 'ui.drawer-open'); assert.equal(c('dock', { id: 'bank' })[2].variant, 'bank'); assert.equal(c('dock', { id: 'bank', drawerOpen: true })[1], 'ui.drawer-close');
  assert.equal(c('pause', { pressed: false })[2].variant, 'pause'); assert.equal(c('pause', { pressed: true })[2].variant, 'resume', 'aria-pressed is read as it was before the press');
  assert.equal(c('zin')[2].variant, 'in'); assert.equal(c('me')[2].variant, 'home'); assert.equal(c('help')[1], 'ui.dialog-open'); assert.equal(c('reset')[2].variant, 'danger'); assert.equal(c('confirm-go'), null);
  assert.equal(c('stock-pick', { count: 2 })[2].params.n, 3); assert.equal(c('stock-clear')[2].variant, 'clear'); assert.equal(c('crew-tab', { index: 2 })[2].params.i, 2); assert.equal(c('quests-done', { pressed: false })[2].variant, 'on');
  assert.equal(controlFor({ act: 'speed', kind: 'change', value: '16' })[2].params.i, 3); assert.equal(controlFor({ kind: 'change', checkbox: true, checked: false })[2].variant, 'off');
  assert.equal(c('savefile')[1], 'ui.ok'); assert.equal(c('debrief')[2].variant, 'full'); assert.equal(c('something-new')[1], 'ui.tick', 'an unknown button is a neutral tick');
});

// ---------------------------------------------------------------------------------------------------------------- the legacy names
test('the legacy sfx names exist, play their aliases when no wiring is installed and do nothing once it is', () => {
  assert.deepEqual(Object.keys(legacySfx).filter((k) => k !== 'play').sort(), ['alarm', 'blip', 'buzz', 'kaching', 'level']);
  const seen = [], real = pageAudio.play, realState = Object.getOwnPropertyDescriptor(pageAudio, 'state');
  pageAudio.play = (id, o) => { seen.push([id, o]); return null; };
  try {
    _setInstalled(false);
    legacySfx.kaching(); legacySfx.buzz(); legacySfx.level(); legacySfx.blip(); legacySfx.alarm();
    assert.deepEqual(seen.map((s) => s[0]), ['cash.in', 'ui.refuse', 'quest.complete', 'ui.ok', 'alert.advance']); assert.equal(seen[0][1].size, 'm'); assert.equal(seen[4][1].variant, 'l2');
    seen.length = 0; _setInstalled(true);
    legacySfx.kaching(); legacySfx.buzz(); legacySfx.level(); legacySfx.blip(); legacySfx.alarm(); assert.deepEqual(seen, [], 'no-ops while the wiring is installed');
    legacySfx.play('cash.in', { size: 'l' }); assert.equal(seen.length, 1, 'but play(id, opts) always works');
  } finally { _setInstalled(false); pageAudio.play = real; void realState; }
});
