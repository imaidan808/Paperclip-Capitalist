// The fifth repair round (docs/AUDIO.md Appendix H). Six findings of the fourth verification, each reproduced on the earlier code (113accd) before anything was changed, each with a test here that fails on it:
//   W2-1  Copy student link did nothing, and chimed "ok", where the page has no async clipboard (plain http on a LAN address): it copies by the older command, and says so when it cannot.
//   U1    a student who touched the volume in a room stayed in Classroom for good after leaving it: leaving puts back what the room changed, not what the student did.
//   U2    the test button said "then coins" and the Classroom rule left the coins out: the gate judged a request by its size as if it were the first (tiny) variant.
//   U3    key M and the speaker button changed nothing a sighted player could see: they say so in a toast (and inside an open sheet, where a toast is under the backdrop, aloud).
//   U4    the repair dial's one-time explanation was spent by a repair the player could not start, and a later one only said "Dial tone is off": the explanation waits for a dial, and the first two say where the switch is.
//   U5    at the largest text size the Deal Room's header, which holds Sound and Dial tone, scrolled off the top: it stays in view.
// Node only: the HTML builders, the real Deal Room session, the real wiring and the real engine under a recording fake context. The browser half is scripts/audio-r5-check.mjs. Run: node --test tests/audio-r5.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeContext, fakeClock } from './helpers/fakeaudio.mjs';
import { makeGame } from './bot.mjs';
import { fakeCtx } from './helpers/ctx.mjs';
import { ASSETS } from '../js/config.js';
import * as D from '../js/deal.js';
import * as UI from '../js/ui/deal.js';
import { audio as page } from '../js/audio/index.js';
import { createAudio } from '../js/audio/engine.js';
import { audioDefaults, joinRoom, leaveRoom, presetOf, toggleMute, TEST_STEPS, TEST_MS, testSaid, leftRoomText, PRESET_NAMES } from '../js/audio/settings.js';
import * as wire from '../js/audio/wire.js';
import { dialInfo, dialEarText, dialShortText, dialAnnounceText, dialsDrawn, DIAL_SWITCH_DIALS, _resetTold } from '../js/audio/dialtone.js';
import { copyText } from '../js/ui/instructor.js';
import { settings as appSettings } from '../js/ui/common.js';

const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const HAS = !!(D.GAMES.haggle && D.GAMES.auction);
const kvOf = () => { const store = new Map(); return { get: (k) => (store.has(k) ? store.get(k) : null), set: (k, v) => { store.set(k, v); return true; }, del: (k) => { store.delete(k); }, store }; };

// ================================================================================ W2-1: Copy student link
/** A page stand-in with exactly what copyText touches. `command`: what document.execCommand('copy') answers (or throws). */
function fakeEnv({ clipboard, command = true, throws = false } = {}) {
  const made = [], log = [];
  const body = { appended: [], appendChild(n) { this.appended.push(n); log.push('append'); return n; } };
  const button = { focus: (o) => log.push(['focus', o && o.preventScroll]) };
  const doc = {
    body, activeElement: button,
    createElement: (tag) => { const t = { tag, attrs: {}, style: {}, value: '', selected: false, setAttribute(k, v) { this.attrs[k] = v; }, select() { this.selected = true; }, setSelectionRange(a, b) { this.range = [a, b]; }, remove() { log.push('remove'); } }; made.push(t); return t; },
    execCommand: (c) => { log.push(['exec', c, made[0] && made[0].value]); if (throws) throw new Error('blocked'); return command; },
  };
  return { navigator: { clipboard }, document: doc, made, log, button };
}
test('W2-1: Copy student link copies where the page has no async clipboard (plain http on a LAN address) by the older command, and the field it makes is gone again', async () => {
  const link = 'http://192.168.1.20:8000/?room=ABCD&sound=quiet';
  const e = fakeEnv({ clipboard: undefined });
  assert.equal(await copyText(link, e), true, 'it copied');
  assert.equal(e.made.length, 1); assert.equal(e.made[0].value, link, 'the link is what was selected'); assert.equal(e.made[0].selected, true); assert.deepEqual(e.made[0].range, [0, link.length]);
  assert.deepEqual(e.log.filter((x) => x === 'append' || x === 'remove' || x[0] === 'exec' || x[0] === 'focus').map((x) => (typeof x === 'string' ? x : x[0])), ['append', 'exec', 'remove', 'focus'], 'a field, the command, the field removed, and the cursor back on the button');
  const field = e.document.body.appended[0]; assert.equal(field.attrs.readonly, '', 'a read-only field: no keyboard pops up on a tablet'); assert.equal(field.attrs['aria-hidden'], 'true');
});
test('W2-1: and says it did not when nothing can copy: the page has neither the clipboard nor the command, the command says no, or it throws', async () => {
  const link = 'http://x/?room=ABCD';
  assert.equal(await copyText(link, { navigator: {}, document: undefined }), false);
  assert.equal(await copyText(link, fakeEnv({ clipboard: undefined, command: false })), false, 'the command answered no');
  assert.equal(await copyText(link, fakeEnv({ clipboard: undefined, throws: true })), false, 'and a command that throws is a no, not a fault');
  assert.equal(await copyText(link, { navigator: { clipboard: { writeText: () => { throw new Error('sync'); } } }, document: undefined }), false, 'a clipboard that throws at once');
  assert.equal(await copyText(link, null), false, 'no environment at all');
});
test('W2-1: the async clipboard is used when there is one; when it refuses (permission denied) the command is tried, and when it works nothing else is touched', async () => {
  const link = 'http://x/?room=ABCD', wrote = [];
  const ok = fakeEnv({ clipboard: { writeText: (t) => { wrote.push(t); return Promise.resolve(); } } });
  assert.equal(await copyText(link, ok), true); assert.deepEqual(wrote, [link]); assert.equal(ok.made.length, 0, 'no field was made');
  const denied = fakeEnv({ clipboard: { writeText: () => Promise.reject(new Error('NotAllowedError')) } });
  assert.equal(await copyText(link, denied), true, 'refused by the permission, copied by the command'); assert.equal(denied.made.length, 1);
  const both = fakeEnv({ clipboard: { writeText: () => Promise.reject(new Error('denied')) }, command: false });
  assert.equal(await copyText(link, both), false);
});
test('W2-1: Copy student link plays only the tick at the click: it can fail, so its outcome speaks (the good toast is the ok); the gradebook download cannot fail that way and keeps its ok', () => {
  assert.deepEqual(wire.controlFor({ act: 'copylink', kind: 'click' }).slice(0, 2), ['play', 'ui.tick'], 'the click is a tick, never the ok of a copy that may not have happened');
  assert.deepEqual(wire.controlFor({ act: 'gradecsv', kind: 'click' }), ['play', 'ui.ok', {}]);
  const w = src('js/audio/wire.js'), ok = w.match(/const OK = new Set\(L\('([^']*)'\)\)/)[1];
  assert.ok(!/\bcopylink\b/.test(ok), 'copylink is not in the OK set');
});
test('W2-1: the instructor\'s button copies, says it did, and when it could not shows the link for nine seconds', () => {
  const s = src('js/ui/instructor.js');
  assert.match(s, /copylink\(b\) \{[^}]*copyText\(b\.dataset\.link\)/, 'one way to copy');
  assert.match(s, /Student link copied, with quiet sound\./, 'the toast still says what the link carries');
  assert.match(s, /Could not copy it by itself\. The student link is \$\{b\.dataset\.link\}/, 'and when it cannot, the link is in the words');
  assert.match(s, /9000/);
  assert.ok(!/navigator\.clipboard\?\.writeText\(b\.dataset\.link\)\.then/.test(s), 'the optional chain that made the whole line vanish with the clipboard is gone');
});

// ================================================================================ U1: leaving a room
const room = (over = {}) => { const j = joinRoom({ ...audioDefaults(), ...over }); return { ...j, room: j.next }; };
test('U1: a student who moved the volume in a room is back in Full at their own volume when they leave (they were left in Classroom for good, and the earlier values were deleted unused)', () => {
  const { before, room: inRoom } = room();
  const volume = { ...inRoom, master: 50, touched: true }; // the commonest thing a student does in a lab
  const left = leaveRoom(volume, before);
  assert.equal(left.quiet, false, 'the room\'s rule is released'); assert.equal(left.clockSounds, true); assert.equal(left.master, 50, 'and the volume is the student\'s');
  assert.equal(presetOf(left), 'full');
  assert.equal(left.touched, false, 'a volume is not a choice about the mix: the next room is a room again');
});
test('U1: what the student chose in the room stands, and the rest goes back', () => {
  const { before, room: inRoom } = room();
  const ui = leaveRoom({ ...inRoom, ui: false, touched: true }, before); assert.equal(ui.ui, false, 'Interface sounds off by hand stays off'); assert.equal(ui.quiet, false, 'but the room\'s Classroom is gone'); assert.equal(ui.clockSounds, true); assert.equal(ui.touched, true, 'a choice of the mix is a choice');
  const full = leaveRoom({ ...inRoom, quiet: false, clockSounds: true, touched: true }, before); assert.equal(full.quiet, false); assert.equal(full.touched, true, 'Full chosen under Display and sound in the room: theirs');
  const mute = leaveRoom({ ...inRoom, mute: true, touched: true }, before); assert.equal(mute.mute, true, 'a mute is theirs'); assert.equal(mute.quiet, false); assert.equal(mute.touched, true);
  const iface = leaveRoom({ ...inRoom, ...{ ui: true, game: false, ambient: false, dial: false, clockSounds: true, quiet: false }, touched: true }, before); assert.equal(presetOf(iface), 'interface', 'Interface only chosen in the room stands');
  const own = leaveRoom({ ...inRoom, ambientLevel: 30, worldTicks: false, mKey: false, hinted: true, touched: true }, before);
  assert.equal(own.ambientLevel, 30); assert.equal(own.worldTicks, false); assert.equal(own.mKey, false); assert.equal(own.hinted, true); assert.equal(own.quiet, false, 'the player\'s own levels and switches are carried over, and the room is left');
  assert.equal(leaveRoom(inRoom, before).quiet, false, 'nothing touched: all of it back'); assert.deepEqual({ ...leaveRoom(inRoom, before) }, { ...before, hinted: false }, 'exactly the earlier values');
  assert.equal(leaveRoom(inRoom, null), inRoom, 'nothing remembered, nothing to put back');
});
test('U1: the link\'s quiet room (a laptop that opened ?room=ABCD&sound=quiet) goes back the same way, a volume included', () => {
  const link = { ...audioDefaults(), quiet: true, clockSounds: false, touched: false }, j = joinRoom(link);
  assert.equal(j.before.quiet, false); const left = leaveRoom({ ...j.next, master: 45, touched: true }, j.before);
  assert.equal(left.quiet, false); assert.equal(left.master, 45); assert.equal(left.touched, false);
});
test('U1: through the rule the game runs: join, change the volume, leave: Full at 50, one note, the remembered values used and then gone', () => {
  const kv = kvOf(), toasts = [], saves = [], d = { settings: { audio: { ...audioDefaults() } }, kv, save: () => saves.push(JSON.stringify(d.settings.audio)), toast: (m, l) => toasts.push([m, l]) };
  assert.equal(wire.applyRoomRule(d, true), 'joined'); assert.equal(d.settings.audio.quiet, true);
  d.settings.audio = { ...d.settings.audio, master: 50, touched: true }; // Display and sound, the volume slider
  assert.equal(wire.applyRoomRule(d, false), 'left');
  const a = d.settings.audio;
  assert.equal(a.quiet, false, 'solo play has its tiny game sounds, its clock sounds and its choice of ambience'); assert.equal(a.clockSounds, true); assert.equal(a.master, 50);
  assert.equal(kv.get(wire.BEFORE_ROOM), null, 'forgotten once they were used');
  assert.equal(toasts.length, 2, 'the room\'s note on the way in, one note on the way out'); assert.deepEqual(toasts[1], [leftRoomText(a), 'info']);
  assert.match(toasts[1][0], /^Sound is back to Full: Classroom sound applies only in a room\.$/, 'it says what changed, to what, and why');
  assert.equal(wire.applyRoomRule(d, false), null, 'once'); assert.equal(toasts.length, 2);
});
test('U1: the note on the way out is said only when the room\'s rule was released and something can be heard', () => {
  const quietRoom = (patch) => { const kv = kvOf(), toasts = [], d = { settings: { audio: { ...audioDefaults() } }, kv, save: () => {}, toast: (m) => toasts.push(m) }; wire.applyRoomRule(d, true); toasts.length = 0; d.settings.audio = { ...d.settings.audio, ...patch, touched: true }; wire.applyRoomRule(d, false); return { d, toasts }; };
  assert.equal(quietRoom({ mute: true }).toasts.length, 0, 'a muted student is told nothing about a sound they cannot hear');
  assert.equal(quietRoom({ quiet: false, clockSounds: true }).toasts.length, 0, 'Full chosen in the room: nothing was put back');
  assert.equal(quietRoom({ master: 50 }).toasts.length, 1);
  assert.match(leftRoomText({ ...audioDefaults(), ui: true, game: false }), /^Sound is back to Interface only:/); assert.match(leftRoomText({ ...audioDefaults(), ui: false }), /^Sound is back to how you had it: Classroom sound applies only in a room\./);
  assert.equal(PRESET_NAMES.full, 'Full');
});
test('U1: Start over from a game in a room lets the Classroom rule go at once, not at the next Draft', () => {
  const m = src('js/main.js');
  assert.match(m, /onReset: \(\) => \{ S\.reset\(\); pending = null; pendingRoom\(null\); go\('title'\); \}/, 'the one place that certainly leaves a room is where the settings are given back');
});

// ================================================================================ U2: the test button in Classroom
const rig = (settings = {}) => {
  const clock = fakeClock(), ctx = fakeContext({ sampleRate: 8000 }), s = { ...audioDefaults(), ...settings };
  const audio = createAudio({ get: () => s, now: clock.now, timers: clock.timers_, factory: () => ctx, random: () => 0.5, measure: false });
  audio.unlock(); ctx.state = 'running';
  return { audio, ctx, clock, s };
};
test('U2: in Classroom the test button plays all three of its sounds, the coins last (the coins were dropped: a request by size was judged as the first, tiny, variant)', () => {
  const t = rig({ quiet: true });
  for (const [ms, id, o] of TEST_STEPS) { t.clock.advance(ms === TEST_STEPS[0][0] ? 0 : 700); assert.ok(t.audio.play(id, o), `${id} ${JSON.stringify(o)} is played in Classroom`); }
  const st = t.audio.stats();
  assert.deepEqual(Object.keys(st.dropped), [], 'nothing was dropped: ' + JSON.stringify(st.dropped));
  assert.deepEqual(Object.keys(st.played).sort(), ['alert.advance', 'cash.in', 'ui.tick']);
  assert.equal(TEST_STEPS.at(-1)[1], 'cash.in', 'the last thing heard is still the good news'); assert.ok(TEST_MS > TEST_STEPS.at(-1)[0]);
});
test('U2: the Classroom gate reads a request the way the engine plays it: by variant, else by size, else the first variant', () => {
  const q = () => rig({ quiet: true }).audio;
  assert.ok(q().play('cash.in', { size: 'm' }), 'size m is a medium coin'); assert.ok(q().play('cash.in', { variant: 'm' }), 'as it always was by variant');
  assert.ok(q().play('cash.in', { size: 'l' })); assert.ok(q().play('cash.in', { size: 'xl' }));
  assert.equal(q().play('cash.in', { size: 's' }), null, 'a small coin is a tiny sound and is left out of a room, however it is asked for'); assert.equal(q().play('cash.in'), null, 'and so is the first variant');
  assert.ok(q().play('cash.out', { size: 'l' }), 'a large payment is a medium sound, asked for by size'); assert.equal(q().play('cash.out', { size: 'm' }), null, 'a middling one is tiny (an SLA penalty, an overdraft)'); assert.equal(q().play('cash.out', { size: 's' }), null);
  assert.ok(q().play('cash.out', { size: 'xl' }), 'xl cash.out plays as its l (variantFor), and is judged as it');
  assert.ok(q().play('cash.in', { size: 'nonsense' }) === null, 'an unknown size is the first variant, as variantFor plays it');
  const a = rig({ quiet: true }), b = rig({ quiet: false }); a.audio.play('cash.in', { size: 'm' }); b.audio.play('cash.in', { size: 'm' });
  assert.equal(a.audio.stats().played['cash.in'], 1); assert.equal(b.audio.stats().played['cash.in'], 1);
  const solo = rig({ quiet: false }); assert.ok(solo.audio.play('cash.in', { size: 's' }), 'outside a room nothing changes');
});
test('U2: the announcement says what a room leaves out, and says it only in a room', () => {
  const plain = testSaid(audioDefaults()), room2 = testSaid({ ...audioDefaults(), quiet: true }), off = testSaid({ ...audioDefaults(), game: false });
  assert.equal(plain, 'Playing a test: a click, a warning, then coins.');
  assert.equal(room2, 'Playing a test: a click, a warning, then coins. Classroom leaves out the smallest game sounds and the clock sounds.');
  assert.equal(off, 'Playing a test click. Game sounds are off, so the warning and the coins are silent.');
  assert.match(src('js/audio/settings.js'), /announce\?\.\(testSaid\(a\)\)/, 'the button says what testSaid says');
  assert.deepEqual(TEST_STEPS.map((x) => x[1]), ['ui.tick', 'alert.advance', 'cash.in']);
  assert.deepEqual(TEST_STEPS.at(-1)[2], { variant: 'm' }, 'the coin is asked for by its variant: it does not depend on the gate');
});

// ================================================================================ U3: key M and the speaker say what they did
test('U3: toggleMute gives the words to show: "Sound off. Press M to turn it back on." when M is how it comes back, the speaker button when it is not', () => {
  const a = audioDefaults(), off = toggleMute(a);
  assert.equal(off.said, 'Sound off.'); assert.equal(off.shown, 'Sound off. Press M to turn it back on.');
  assert.equal(toggleMute({ ...a, mKey: false }).shown, 'Sound off. Use the speaker button to turn it back on.', 'M is switched off: it is not promised');
  const on = toggleMute(off.next); assert.equal(on.shown, 'Sound on.'); assert.equal(on.shown, on.said);
  const zero = toggleMute({ ...a, mute: true, master: 0 }); assert.equal(zero.shown, 'Sound on at 70 percent.');
  const both = toggleMute({ ...a, ui: false, game: false }); assert.equal(both.changed, false); assert.equal(both.shown, both.said);
});
function installPage({ dialogOpen = false, over = {} } = {}) {
  const listeners = new Map(), settings = { audio: { ...audioDefaults(), ...over } }, toasts = [], said = [], saved = [];
  globalThis.addEventListener = () => {};
  globalThis.document = { hidden: false, addEventListener(t, fn) { if (!listeners.has(t)) listeners.set(t, []); listeners.get(t).push(fn); }, removeEventListener() {}, getElementById: (id) => (id === 'dlg' ? { open: dialogOpen } : null), querySelectorAll: () => [], querySelector: () => null };
  const was = {}; for (const k of ['touch', 'unlock', 'sync', 'play']) { was[k] = page[k]; page[k] = () => {}; }
  const sup = Object.getOwnPropertyDescriptor(page, 'supported'); Object.defineProperty(page, 'supported', { get: () => true, configurable: true });
  wire._resetForTest(); wire.initAudio({ settings, save: () => saved.push(JSON.stringify(settings.audio)), announce: (m) => said.push(m), toast: (m, l) => toasts.push([m, l]), kv: kvOf() });
  const press = (key, target = { tagName: 'BODY' }) => { for (const fn of listeners.get('keydown') || []) fn({ type: 'keydown', key, target, isTrusted: true }); };
  return { settings, toasts, said, saved, press, done() { for (const k of Object.keys(was)) page[k] = was[k]; if (sup) Object.defineProperty(page, 'supported', sup); else delete page.supported; wire._resetForTest(); } };
}
test('U3: key M raises a toast, so a sighted player sees that it worked on the title, the Draft and the dashboard (the only feedback was a live region nobody sees)', () => {
  const P = installPage();
  try {
    P.press('m'); assert.equal(P.settings.audio.mute, true);
    assert.deepEqual(P.toasts, [['Sound off. Press M to turn it back on.', 'info']], 'one toast; toast() itself speaks it, so there is no second announcement');
    assert.deepEqual(P.said, [], 'announce() is not also called: the same words would be read twice');
    P.press('M'); assert.equal(P.settings.audio.mute, false); assert.deepEqual(P.toasts.at(-1), ['Sound on.', 'info']); assert.equal(P.toasts.length, 2);
    P.press('m', { tagName: 'INPUT', type: 'text' }); assert.equal(P.toasts.length, 2, 'typing an m in a field is not the shortcut');
  } finally { P.done(); }
});
test('U3: inside an open sheet (the Deal Room, the settings) a toast is under the backdrop, so the words are spoken there and no toast is raised', () => {
  const P = installPage({ dialogOpen: true });
  try { P.press('m'); assert.deepEqual(P.toasts, [], 'no ghost toast under the sheet'); assert.deepEqual(P.said, ['Sound off. Press M to turn it back on.']); } finally { P.done(); }
});
test('U3: with the shortcut switched off M does nothing, and a page with no toast falls back to the announcement', () => {
  const off = installPage({ over: { mKey: false } });
  try { off.press('m'); assert.equal(off.settings.audio.mute, false); assert.equal(off.toasts.length + off.said.length, 0); } finally { off.done(); }
  const listeners = [], settings = { audio: audioDefaults() }, said = [];
  globalThis.document = { hidden: false, addEventListener(t, fn) { if (t === 'keydown') listeners.push(fn); }, removeEventListener() {}, getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
  const sup = Object.getOwnPropertyDescriptor(page, 'supported'); Object.defineProperty(page, 'supported', { get: () => true, configurable: true });
  const keep = { touch: page.touch, unlock: page.unlock, sync: page.sync, play: page.play }; for (const k of Object.keys(keep)) page[k] = () => {};
  try { wire._resetForTest(); wire.initAudio({ settings, save: () => {}, announce: (m) => said.push(m) }); for (const fn of listeners) fn({ type: 'keydown', key: 'm', target: { tagName: 'BODY' }, isTrusted: true }); assert.deepEqual(said, ['Sound off. Press M to turn it back on.']); }
  finally { Object.assign(page, keep); if (sup) Object.defineProperty(page, 'supported', sup); else delete page.supported; wire._resetForTest(); }
});
test('U3: the speaker button says the same, in a toast', () => {
  const s = src('js/ui/shell.js');
  assert.match(s, /sound\(\) \{[^]*?toast\(r\.shown, 'info'\);[^]*?\n    \},/, 'the HUD\'s speaker raises the toast');
  assert.ok(!/announce\(r\.said\);\s*\n\s*if \(r\.changed && !r\.next\.mute\)/.test(s), 'and does not also announce it');
  const w = src('js/audio/wire.js'); assert.match(w, /getElementById\('dlg'\)/, 'M asks whether a sheet is open at the press');
});

// ================================================================================ U4: the repair dial's explanation
const world = (perks = ['grad', 'native'], seed = 9) => {
  const g = makeGame(perks, 'ops', seed);
  for (const z of [2, 3, 4, 6]) g._openZone(z);
  g.s.cash = 1e6; g.s.skills.growth = 4; g.s.skills.fintech = 3;
  for (const z of g.s.zones) for (const cls of Object.keys(ASSETS).filter((c) => (ASSETS[c].dem?.[z] || 0) >= 4).slice(0, 4)) g.s.assets.push(g._mk(g.s, cls, { zone: z, basis: 1 }));
  for (const z of g.s.zones) for (let k = 0; k < 4; k++) g._spawnLot(z);
  return g;
};
const brokenCrate = (g) => { const a = g.s.assets.find((x) => ASSETS[x.cls].repair); a.cond = 'broken'; return { kind: 'repair', assetId: a.id }; };
function deskRig({ reduced = false } = {}) {
  const keepDoc = globalThis.document; globalThis.document = undefined; // the room's DOM half is not drawn here: the session sees no page
  const g = world(), ctx = fakeCtx(); ctx.g = () => g; ctx.S.clock = { paused: false, speed: 1, now: () => g.s.hour }; ctx.S.setPaused = (p) => { ctx.S.clock.paused = p; };
  ctx.dlg.el.querySelector = () => null; ctx.reduced = () => reduced;
  const said = []; ctx.announce = (m) => said.push(m);
  const was = { play: page.play, request: page.request, countUp: page.countUp, dial: page.dial };
  page.play = () => null; page.request = () => true; page.countUp = () => null;
  page.dial = { start: () => true, update() {}, stop() {}, get active() { return false; } };
  return { g, ctx, said, end() { Object.assign(page, was); globalThis.document = keepDoc; } };
}
async function withDesk(opts, fn) {
  const R = deskRig(opts), keep = JSON.stringify(appSettings.audio); _resetTold();
  try { await fn(R); } finally { R.ses?.dispose?.(); R.end(); appSettings.audio = JSON.parse(keep); _resetTold(); }
}
test('U4: a repair the player cannot afford has no dial, so it does not spend the one-time explanation, and says what is true', { skip: !HAS }, async () => {
  await withDesk({}, async (R) => {
    appSettings.audio = { ...audioDefaults() };
    R.g.s.cash = 0;
    R.ses = UI.openDeal(R.ctx, brokenCrate(R.g)); await Promise.resolve();
    assert.equal(R.ses.longEar, false, 'no dial was drawn: nothing was explained');
    assert.ok(!/A marker moves/.test(R.said[0]), 'the room does not describe a dial that is not there: ' + R.said[0]);
    assert.match(R.said[0], /A repair here can run to .* and you have \$0/, 'what is true: the repair cannot be afforded'); assert.ok(!/ Or turn on Repair dial tone/.test(R.said[0]));
    R.ses.dispose(); R.said.length = 0;
    R.g.s.cash = 1e6;
    R.ses = UI.openDeal(R.ctx, brokenCrate(R.g)); await Promise.resolve();
    assert.equal(R.ses.longEar, true, 'the first repair that CAN be started is the first one explained');
    assert.match(R.said[0], /Fix\. A marker moves across a bar by itself/); assert.match(R.said[0], /Or turn on Repair dial tone, with the Dial tone button, to follow it by ear\.$/);
    assert.equal(UI.viewModel(R.ses).dialLong, true); assert.match(UI.fixHTML(UI.viewModel(R.ses)), /id="dial-ear">Prefer to listen\?/);
  });
});
test('U4: the first two dials of a run say where the tone\'s switch is while it is off; the third is the short line', { skip: !HAS }, async () => {
  await withDesk({}, async (R) => {
    appSettings.audio = { ...audioDefaults() };
    const open = async () => { R.ses = UI.openDeal(R.ctx, brokenCrate(R.g)); await Promise.resolve(); const m = UI.viewModel(R.ses); R.ses.dispose(); return m; };
    const m1 = await open(), m2 = await open(), m3 = await open();
    assert.equal(m1.dialLong, true); assert.equal(m1.dialSwitch, true, 'the first: the long line, which names the switch');
    assert.equal(m2.dialLong, false); assert.equal(m2.dialSwitch, true, 'the second: the short line, with the switch');
    assert.equal(m3.dialLong, false); assert.equal(m3.dialSwitch, false, 'the third onwards: the short line');
    const g = world(), r = D.startRun(g, brokenCrate(g));
    const html = (m) => UI.fixHTML({ ...D.modelOf(r, { reduced: false }), pick: [], slider: 0.2, sound: true, tone: false, dialInfo: dialInfo({}), ...m });
    assert.match(html({ dialLong: false, dialSwitch: true }), /id="dial-ear">Dial tone is off: use the Dial tone switch next to Sound to follow it by ear\. Careful needs no timing\.<\/p>/);
    assert.match(html({ dialLong: false, dialSwitch: false }), /id="dial-ear">Dial tone is off\. Careful needs no timing\.<\/p>/);
    assert.match(html({ dialLong: false, dialSwitch: true, dialInfo: dialInfo({ dial: true }) }), /id="dial-ear">Dial tone is on\. Careful needs no timing\.<\/p>/, 'a tone that is on needs no pointer to its switch');
    assert.match(html({ dialLong: false, dialSwitch: true, dialInfo: dialInfo({ quiet: true }) }), /Dial tone is off in Classroom\. Careful needs no timing\./, 'and in Classroom there is no switch to point at');
  });
});
test('U4: the words, and the count of dials a run has drawn', () => {
  assert.equal(DIAL_SWITCH_DIALS, 2);
  _resetTold(); assert.deepEqual([dialsDrawn('r1'), dialsDrawn('r1'), dialsDrawn('r1')], [1, 2, 3]); assert.equal(dialsDrawn('r2'), 1, 'a new run starts again'); assert.equal(dialsDrawn(undefined), 1); assert.equal(dialsDrawn(null), 2, 'no seed is one run');
  assert.match(dialEarText(dialInfo({})), /^Prefer to listen\? Turn on Repair dial tone with the Dial tone switch next to Sound, or in Display and sound\. /, 'the copy does not depend on where the header is on the screen');
  assert.ok(!/top of this window/.test(dialEarText(dialInfo({}))));
  assert.equal(dialShortText(dialInfo({}), true), 'Dial tone is off: use the Dial tone switch next to Sound to follow it by ear. Careful needs no timing.');
  assert.equal(dialShortText(dialInfo({}), false), 'Dial tone is off. Careful needs no timing.'); assert.equal(dialShortText(dialInfo({})), 'Dial tone is off. Careful needs no timing.', 'no second argument: as before');
  assert.ok(dialShortText(dialInfo({}), true).split(/\s+/).length <= 22);
  assert.match(dialAnnounceText(dialInfo({})), /Or turn on Repair dial tone, with the Dial tone button, to follow it by ear\.$/);
  const d = src('js/ui/deal.js');
  assert.match(d, /const dialUp = run\.key === 'fix' && !run\.res\.fix && !ses\.reduced\(\) && !!run\.view\(\);\s*\n\s*ses\.longEar = dialUp && tellOnce\(kv, S && S\.worldSeed\);/, 'the explanation is spent only when a dial is drawn');
  _resetTold();
});

// ================================================================================ U5: the header stays in view
test('U5: the Deal Room\'s header, which holds the Sound and Dial tone switches, is sticky from a laptop up, so the largest text size cannot scroll it away', () => {
  const css = src('css/ui-deal.css'), at = css.indexOf('@media (min-width: 761px) and (min-height: 561px) {'); // and 561 px high: a landscape phone (844x390) has no room to lose a fifth of its height, and the card test found the Hold button under the header there
  assert.ok(at > 0, 'a rule for the header at laptop width and height and up');
  const block = css.slice(at, css.indexOf('\n}\n', at));
  assert.match(block, /\.deal-top \{[^}]*position: sticky;[^}]*top: 0;[^}]*z-index: 2;/, 'sticky at the top of the sheet');
  assert.match(block, /\.deal-top::before \{[^}]*background: var\(--panel\);/, 'on the sheet\'s own ground, so what scrolls under it is hidden, not shown through it');
  assert.match(block, /dialog\.deal \{[^}]*scroll-padding-top:/, 'a control scrolled into view rests under it, not behind it');
  assert.ok(!/@media \(max-width: 760px\) \{[^@]*\.deal-top \{[^}]*sticky/.test(css), 'a phone\'s header is three rows tall and scrolls');
});

// ================================================================================ the documents say what the code does
test('Appendix H exists and answers every finding; the rows the code changed say what it now does', () => {
  const doc = src('docs/AUDIO.md'), h = doc.slice(doc.indexOf('## Appendix H.'));
  for (const id of ['W2-1', 'U1', 'U2', 'U3', 'U4', 'U5']) assert.ok(h.includes('**' + id + '**'), id + ' is answered in Appendix H');
  assert.match(h, /### H\.2 What this round leaves open/); assert.match(doc, /Revision 7 \(2026-10-29, the fifth repair round\)/);
  assert.match(doc, /\| Copy student link \| `ui\.tick` at the click/, '4.3: the control table');
  assert.match(doc, /`leaveRoom\(a, before\)` \(`settings\.js`\) goes field by field/, '7.1: leaving a room');
  assert.match(doc, /\*\*A mute is also seen\*\* \(fifth round, U3\)/, '7.3: key M');
  assert.match(doc, /\*\*The Deal Room's header stays on the screen\*\* \(fifth round, U5\)/, '7.6');
  assert.match(src('docs/FACULTY_KIT.md'), /what the room changed goes back/, 'the faculty kit says what leaving a room does');
});
