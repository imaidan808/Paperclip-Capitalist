// Third round, track X: experience and discoverability (docs/AUDIO.md Appendix F). Three findings, each with a test that fails on the earlier code:
//   A1  a class that joins by room code heard the Draft's loud fanfare at full volume: the Classroom rule applies from the Draft on (a pending join), the instructor's student link can carry
//       ?sound=quiet, the instructor's settings button is called what every other one is, and the docs say so.
//   A4  the repair dial tone had no word anywhere in the room: a line under the dial, a switch beside Sound, a description on Stop, one announcement per run, and `announce()` that is heard
//       while a modal sheet is open (an inert live region is not in the accessibility tree).
//   (A3, the audition page, is in tests/audio-r2x-page.test.mjs: it needs a clock of its own.)
// Node only: the HTML builders, the real Deal Room session, the real wiring and the real engine under a recording fake context. Run: node --test tests/audio-r2x.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeContext, fakeClock } from './helpers/fakeaudio.mjs';
import { makeGame } from './bot.mjs';
import { fakeCtx } from './helpers/ctx.mjs';
import { ASSETS } from '../js/config.js';
import { Session } from '../js/session.js';
import * as D from '../js/deal.js';
import * as UI from '../js/ui/deal.js';
import { audio as page } from '../js/audio/index.js';
import { createAudio } from '../js/audio/engine.js';
import { audioDefaults, migrateAudio, audioSettingsHTML } from '../js/audio/settings.js';
import * as wire from '../js/audio/wire.js';
import { dialInfo, dialEarText, dialShortText, dialAnnounceText, dialSwitchHTML, toggleDial, tellOnce, _resetTold } from '../js/audio/dialtone.js';
import { instructorParts } from '../js/ui/instructor.js';
import { settings as appSettings } from '../js/ui/common.js';

const HAS = !!(D.GAMES.haggle && D.GAMES.auction);
const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ================================================================================ A1: a class that joins by code
const deps = (over = {}) => {
  const store = new Map(), toasts = [];
  return { settings: { audio: { ...audioDefaults(), ...over } }, kv: { get: (k) => (store.has(k) ? store.get(k) : null), set: (k, v) => { store.set(k, v); return true; }, del: (k) => { store.delete(k); } }, save: () => {}, toast: (m, l) => toasts.push([m, l]), toasts, store };
};

test('A1: a pending join (the Draft with a room code) is a room for sound: Classroom at once, one note, the earlier values back on the way out', () => {
  const d = deps({ master: 55 }), before = { ...d.settings.audio };
  assert.equal(typeof wire.pendingRoom, 'function', 'wire.js exports the helper');
  assert.equal(wire.pendingRoom({ code: 'ABCD' }, d), 'joined');
  const a = d.settings.audio;
  assert.equal(a.quiet, true, 'the Classroom rule is on while the Draft is open'); assert.equal(a.master, 55, 'a preset is not a volume: the player\'s own stays'); assert.equal(a.clockSounds, false);
  assert.deepEqual(d.toasts, [[wire.ROOM_TOAST, 'info']], 'one note, in the Draft, where the loud sound is');
  assert.deepEqual(d.kv.get(wire.BEFORE_ROOM), before, 'the earlier values are kept');
  assert.equal(wire.pendingRoom({ code: 'ABCD' }, d), null, 'idempotent: the Draft drawn again says nothing more'); assert.equal(d.toasts.length, 1);
  // then Begin: the game mounts, the session says the student is in a room, and the rule meets a state it is already in
  assert.equal(wire.applyRoomRule(d, true), null, 'the game\'s own check does not toast again'); assert.equal(d.toasts.length, 1);
  // Back out of the Draft before joining: nothing was joined, so the earlier values come back
  assert.equal(wire.pendingRoom(null, d), 'left'); assert.deepEqual(d.settings.audio, before); assert.equal(d.kv.get(wire.BEFORE_ROOM), null);
  // joining again after Back: told again, because the rule changed again
  assert.equal(wire.pendingRoom({ code: 'ABCD' }, d), 'joined'); assert.equal(d.toasts.length, 2);
});
test('A1: a player who has changed a sound setting by hand keeps it, and a player already in Classroom is told once per room', () => {
  const mine = deps({ touched: true, master: 90 });
  assert.equal(wire.pendingRoom({ code: 'ABCD' }, mine), null); assert.equal(mine.settings.audio.quiet, false); assert.equal(mine.settings.audio.master, 90); assert.equal(mine.toasts.length, 0);
  const q = deps({ quiet: true, touched: true }); // the link said ?sound=quiet, or they chose it
  assert.equal(wire.pendingRoom({ code: 'ABCD' }, q), 'told'); assert.deepEqual(q.toasts, [[wire.ROOM_TOAST, 'info']], 'a quiet game is never an unexplained one');
  assert.equal(wire.pendingRoom({ code: 'ABCD' }, q), null, 'once for this room'); assert.equal(q.toasts.length, 1);
  assert.equal(wire.pendingRoom({ code: 'WXYZ' }, q), 'told', 'another room is another note'); assert.equal(q.toasts.length, 2);
  const m = deps({ mute: true, quiet: true, touched: true }); assert.equal(wire.pendingRoom({ code: 'ABCD' }, m), null, 'a muted player is told nothing about a sound they cannot hear'); assert.equal(m.toasts.length, 0);
  assert.equal(wire.pendingRoom({ code: 'ABCD' }, null), null, 'before the page layer is installed it does nothing, and never throws');
  assert.equal(wire.pendingRoom(undefined, deps()), null); assert.equal(wire.pendingRoom({}, deps()), null, 'no code, no room');
});

/** The real engine under a recording context: the gain of the first voice it builds, in dB (the voice's own gain node is the one that feeds the panner). */
function firstVoiceDb(settings, play) {
  const clock = fakeClock(), ctx = fakeContext({ sampleRate: 8000 });
  const audio = createAudio({ get: () => settings.audio, now: clock.now, timers: clock.timers_, factory: () => ctx, random: () => 0.5, measure: false });
  audio.unlock(); ctx.state = 'running';
  play(audio); clock.flush();
  const g = ctx.nodes.find((n) => n.kind === 'gain' && n.out.some((o) => o.kind === 'pan'));
  assert.ok(g, 'a voice was built');
  return 20 * Math.log10(g.gain.value);
}
test('A1: the Draft\'s begin fanfare is 8 dB quieter on the bus for a student who has typed a room code than for anyone else (the loudest sound of the first minute; it was 10 until the fourth round, R3: see CLASSROOM_DB)', () => {
  const solo = { audio: audioDefaults() }, room = deps();
  const a = firstVoiceDb(solo, (au) => au.request('draft.begin'));
  assert.equal(wire.pendingRoom({ code: 'ABCD' }, room), 'joined');
  const b = firstVoiceDb(room.settings, (au) => au.request('draft.begin'));
  assert.ok(Math.abs((a - b) - 8) < 0.05, `Classroom is 8 dB down on the game bus: ${a.toFixed(2)} dB solo, ${b.toFixed(2)} dB in the Draft of a room`);
  // and the Draft's other game sounds that are tiny are left out altogether, as in the room
  const t = { audio: audioDefaults() }; wire.pendingRoom({ code: 'ABCD' }, { ...deps(), settings: t });
  assert.equal(t.audio.quiet, true);
});
test('A1: main.js applies the rule when the Draft opens with a room and lets it go when the Draft is left without joining', () => {
  const m = src('js/main.js');
  assert.match(m, /import \{ pendingRoom \} from '\.\/audio\/index\.js';/);
  assert.match(m, /setup\(\) \{\s*pendingRoom\(pending\?\.room\);[^\n]*\n\s*const m = mountDraft\(/, 'before the Draft is drawn, so its first sound is already the room\'s');
  assert.match(m, /cleanup = \(\) => \{ m\.destroy\(\); if \(S\.roomInfo\?\.role !== 'student'\) pendingRoom\(null\); \};/, 'a Back puts the earlier settings back; a Begin leaves them to the game\'s own check');
  assert.match(src('js/audio/index.js'), /pendingRoom/);
});

// the press that joins a classroom does not also say "sound effects are on": the room's own note follows
const listeners = new Map();
globalThis.addEventListener = () => {};
globalThis.document = { hidden: false, addEventListener(t, fn) { if (!listeners.has(t)) listeners.set(t, []); listeners.get(t).push(fn); }, removeEventListener() {}, getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
test('A1: the first press on the title says "sound is on", except the press on Join, which is followed by the room\'s note instead', () => {
  const settings = { audio: audioDefaults() }, toasts = [];
  const saved = {}; for (const k of ['touch', 'unlock', 'sync']) { saved[k] = page[k]; page[k] = () => {}; }
  const sup = Object.getOwnPropertyDescriptor(page, 'supported'); Object.defineProperty(page, 'supported', { get: () => true, configurable: true });
  try {
    wire._resetForTest(); wire.initAudio({ settings, save: () => {}, announce: () => {}, toast: (m) => toasts.push(m), kv: deps().kv });
    const press = (target) => { for (const fn of listeners.get('pointerdown').slice(-1)) fn({ type: 'pointerdown', target }); };
    const join = { closest: (s) => (s === '[data-act="join"]' ? join : null) }, other = { closest: () => null };
    press(join);
    assert.deepEqual(toasts, [], 'no hint on Join'); assert.equal(settings.audio.hinted, false, 'and it is not spent: the next press says it');
    press(other); assert.equal(toasts.length, 1); assert.equal(settings.audio.hinted, true);
  } finally { for (const k of Object.keys(saved)) page[k] = saved[k]; if (sup) Object.defineProperty(page, 'supported', sup); else delete page.supported; wire._resetForTest(); }
});

// ---- the instructor's side
function roomSession() {
  const S = new Session(); S.mode = 'instructor'; S.roomInfo = { code: 'ABCD', relay: '', role: 'instructor' }; S.room = { kind: 'local', state: 'open' };
  return S;
}
test('A1: the instructor\'s settings button says Display and sound, and Copy student link has a quiet-sound option that puts ?sound=quiet in the link', () => {
  const S = roomSession(), off = instructorParts(S, {}).head, on = instructorParts(S, { quietLink: true }).head;
  assert.ok(!/>Access</.test(off), 'the button was called Access, which no one looks under for sound');
  assert.match(off, /data-act="settings">Display and sound</, 'what every other entry point to the same dialog says');
  const link = (h) => (h.match(/data-link="([^"]+)"/) || [])[1].replace(/&amp;/g, '&'), qs = (l) => new URLSearchParams(l.slice(l.indexOf('?')));
  assert.equal(qs(link(off)).get('room'), 'ABCD'); assert.equal(qs(link(off)).get('sound'), null, 'by default the link is the link it always was');
  assert.equal(qs(link(on)).get('room'), 'ABCD'); assert.equal(qs(link(on)).get('sound'), 'quiet');
  assert.match(on, /<input type="checkbox" data-change="linkquiet"[^>]* checked>/); assert.ok(!/data-change="linkquiet"[^>]* checked>/.test(off));
  assert.match(on, /<label[^>]*>[^<]*<input type="checkbox" data-change="linkquiet"[^>]*> Quiet sound link<\/label>/, 'a labelled native checkbox');
  assert.match(src('js/ui/instructor.js'), /linkquiet\(b\) \{ U\.quietLink = !!b\.checked; render\(\); \}/, 'and the box redraws the link');
  const S2 = roomSession(); S2.roomInfo = { code: 'ABCD', relay: 'wss://r.example.edu', role: 'instructor' };
  const relay = instructorParts(S2, { quietLink: true }).head;
  assert.equal(qs(link(relay)).get('relay'), 'wss://r.example.edu'); assert.equal(qs(link(relay)).get('sound'), 'quiet', 'with a relay too');
});
test('A1: the link flag is read at boot and never over a sound setting the student has made; with none, it is what they start with', () => {
  const search = '?room=ABCD&sound=quiet';
  const mine = { audio: { ...audioDefaults(), touched: true, master: 90 } };
  assert.deepEqual(migrateAudio(mine, search), { ...audioDefaults(), touched: true, master: 90 }, 'a saved choice of the student\'s stands');
  const none = migrateAudio({}, search);
  assert.equal(none.quiet, true); assert.equal(none.touched, false, 'with a room in the link it is the room\'s rule applied early, not a choice the student made (fourth round, U6): joining remembers the earlier values'); assert.equal(none.master, 70, 'the volume is the student\'s own');
  assert.equal(migrateAudio({}, '?sound=quiet').touched, true, 'a quiet link with no room is a choice made for the student, and stays one');
  assert.equal(migrateAudio({ sound: false }, search).mute, true, 'a student who turned sound off stays silent');
  assert.equal(migrateAudio({}, '?room=ABCD').quiet, false, 'no flag, no change');
  assert.equal(migrateAudio({}, '?room=ABCD&sound=full').quiet, false);
});
test('A1: the dialog is titled by the name every button, toast and doc line uses for it', () => {
  const c = src('js/ui/common.js');
  assert.match(c, /<h2 tabindex="-1" autofocus>Display and sound<\/h2>/); assert.ok(!/Accessibility and sound/.test(c));
  for (const f of ['js/ui/shell.js', 'js/ui/academy.js', 'js/ui/instructor.js']) assert.match(src(f), /data-act="settings">Display and sound</, f);
});
test('A1: the docs tell an instructor what the room does with sound, what the link can add and what is never the only cue', () => {
  const kit = src('docs/FACULTY_KIT.md'), comp = src('docs/COMPLIANCE.md');
  for (const [name, t] of [['FACULTY_KIT', kit], ['COMPLIANCE', comp]]) {
    assert.match(t, /^#{2,3} Sound/m, `${name} has a Sound section`);
    for (const w of [/Classroom/, /\bM\b/, /opt-in|switched on by the player|off until/i, /dial tone/i, /never the only cue|never the only way/i]) assert.match(t, w, `${name}: ${w}`);
  }
  assert.match(kit, /\?sound=quiet/); assert.match(kit, /Quiet sound link/); assert.match(kit, /Display and sound/);
  assert.match(comp, /1\.4\.2/);
});

// ================================================================================ A4: the repair dial tone
test('A4: the words about the tone, for every state it can be in', () => {
  assert.deepEqual(dialInfo(undefined), { setting: false, quiet: false, on: false, heard: false, why: '' });
  const on = dialInfo({ dial: true, master: 70 }); assert.equal(on.on, true); assert.equal(on.heard, true);
  assert.equal(dialInfo({ dial: true, quiet: true }).on, false, 'Classroom holds it off'); assert.equal(dialInfo({ dial: true, quiet: true }).quiet, true);
  assert.match(dialInfo({ dial: true, mute: true }).why, /sound is off/); assert.match(dialInfo({ dial: true, master: 0 }).why, /volume is at 0/); assert.match(dialInfo({ dial: true, game: false }).why, /game sounds are off/);
  assert.equal(dialInfo({ dial: true, mute: true }).heard, false); assert.equal(dialInfo({ dial: true, mute: true }).on, true, 'it is on, and it is not heard');
  const off = dialEarText(dialInfo({}));
  assert.match(off, /^Prefer to listen\? Turn on Repair dial tone with the Dial tone button at the top of this window, or in Display and sound\./); assert.match(off, /Careful: pay more, no timing/);
  assert.match(dialEarText(dialInfo({ dial: true })), /^Repair dial tone is on: low on the left, high on the right, and brighter inside the green zone\./);
  assert.match(dialEarText(dialInfo({ dial: true, mute: true })), /is on, but you will not hear it because sound is off \(press Sound\)\./);
  assert.match(dialEarText(dialInfo({ dial: true, quiet: true })), /^Repair dial tone is off in Classroom\./);
  for (const i of [dialInfo({}), dialInfo({ dial: true }), dialInfo({ quiet: true }), dialInfo({ dial: true, mute: true })]) assert.match(dialEarText(i), /Careful: pay more, no timing/, 'the way that needs no timing is always named');
  assert.match(dialAnnounceText(dialInfo({})), /^Fix\. A marker moves across a bar by itself: press Stop when it is in the green zone\. If you cannot see it, choose Careful: pay more, no timing\. Or turn on Repair dial tone/);
  assert.ok(!/Repair dial tone/.test(dialAnnounceText(dialInfo({ quiet: true }))), 'in Classroom it does not offer what is not there');
  assert.match(dialAnnounceText(dialInfo({ dial: true })), /follow the marker by ear/);
});
test('A4: the switch is one rule: flips the box, says what it did and never claims a tone that cannot be heard; Classroom changes nothing and says why', () => {
  const a = { ...audioDefaults() };
  const r = toggleDial(a); assert.equal(r.changed, true); assert.equal(r.next.dial, true); assert.equal(r.next.touched, true); assert.equal(r.hears, true); assert.match(r.said, /^Repair dial tone on\. Low is left, high is right/);
  assert.equal(a.dial, false, 'the input is not changed');
  const back = toggleDial(r.next); assert.equal(back.next.dial, false); assert.equal(back.said, 'Repair dial tone off.');
  const mute = toggleDial({ ...a, mute: true }); assert.equal(mute.next.dial, true); assert.match(mute.said, /but you will not hear it because sound is off/); assert.equal(mute.hears, false, 'a muted click is silent');
  const q = toggleDial({ ...a, quiet: true }); assert.equal(q.changed, false); assert.equal(q.next.dial, false); assert.match(q.said, /off in Classroom/);
  assert.equal(toggleDial(undefined).next.dial, true, 'never throws');
});
test('A4: once per run: the long announcement is for the first Fix stage of a run, and a reload does not say it again', () => {
  _resetTold();
  const mem = new Map(), kv = { get: (k) => mem.get(k) ?? null, set: (k, v) => { mem.set(k, v); return true; } };
  assert.equal(tellOnce(kv, 'solo-123'), true); assert.equal(tellOnce(kv, 'solo-123'), false);
  _resetTold(); assert.equal(tellOnce(kv, 'solo-123'), false, 'a reload of the same run (memory gone, kv kept)');
  assert.equal(tellOnce(kv, 'solo-999'), true, 'a new run is told');
  _resetTold(); assert.equal(tellOnce({ get() { throw new Error('private window'); }, set() { throw new Error('private window'); } }, 'x'), true, 'no storage: once per page load');
  assert.equal(tellOnce(null, 'x'), false);
});

// ---- the markup
const world = (perks = ['grad', 'native'], seed = 9) => {
  const g = makeGame(perks, 'ops', seed);
  for (const z of [2, 3, 4, 6]) g._openZone(z);
  g.s.cash = 1e6; g.s.skills.growth = 4; g.s.skills.fintech = 3;
  for (const z of g.s.zones) for (const cls of Object.keys(ASSETS).filter((c) => (ASSETS[c].dem?.[z] || 0) >= 4).slice(0, 4)) g.s.assets.push(g._mk(g.s, cls, { zone: z, basis: 1 }));
  for (const z of g.s.zones) for (let k = 0; k < 4; k++) g._spawnLot(z);
  return g;
};
const brokenCrate = (g) => { const a = g.s.assets.find((x) => ASSETS[x.cls].repair); a.cond = 'broken'; return { kind: 'repair', assetId: a.id }; };
const fixedLot = (g, z = 4) => ({ kind: 'buy', zone: z, lotId: g.s.lots[z].find((l) => l.mode === 'fixed').id });
const model = (run, extra = {}) => ({ ...D.modelOf(run, { reduced: !!extra.reduced }), pick: [], slider: 0.2, sound: true, tone: false, dialInfo: extra.dialInfo ?? null, ...(extra.dialLong !== undefined ? { dialLong: extra.dialLong } : {}) });

test('A4: the animated Fix stage tells a player who cannot see the dial what to press, where the tone is, and that Careful needs no timing', { skip: !HAS }, () => {
  const g = world(), r = D.startRun(g, brokenCrate(g)), h = UI.fixHTML(model(r));
  assert.match(h, /<div class="dial" role="group" aria-label="Repair timing"><div class="dial-track" aria-hidden="true">/, 'the track is a picture; the group around it is named');
  assert.match(h, /<p class="small mute" id="dial-ear">Prefer to listen\? Turn on Repair dial tone with the Dial tone button at the top of this window, or in Display and sound\. Prefer not to time it\? Choose Careful: pay more, no timing\.<\/p>/);
  assert.match(h, /<button class="btn big" data-deal="stop" data-snd data-fid="stop" aria-describedby="dial-short" autofocus>Stop<\/button>/, 'the cursor lands on Stop, which reads the SHORT line (fourth round, U9: forty words at every cursor stop of every step were too many)');
  assert.match(h, /<span class="sr" id="dial-short">Dial tone is off\. Careful needs no timing\.<\/span>/);
  assert.match(h, /Watch the marker\. Press <b>Stop<\/b> \(or Space, or Enter\)/); assert.match(h, /data-deal="careful"[^>]*>Careful: pay more, no timing</);
  assert.equal([...h.matchAll(/ id="dial-ear"/g)].length, 1, 'one id');
  const on = UI.fixHTML(model(r, { dialInfo: dialInfo({ dial: true }) })), muted = UI.fixHTML(model(r, { dialInfo: dialInfo({ dial: true, mute: true }) })), cls = UI.fixHTML(model(r, { dialInfo: dialInfo({ dial: true, quiet: true }) }));
  assert.match(on, /Repair dial tone is on: low on the left/); assert.match(muted, /you will not hear it because sound is off/); assert.match(cls, /off in Classroom/);
  for (const x of [on, muted, cls]) assert.match(x, /Careful: pay more, no timing/);
  assert.ok(!/dial-ear|Prefer to listen/.test(UI.fixHTML(model(r, { reduced: true }))), 'under reduced motion the dial is a slider with its own words and nobody is pushed');
  assert.match(UI.fixHTML(model(r, { reduced: true })), /aria-valuetext="Dial at 20%/);
});
test('A4: a repair room has a Dial tone switch beside Sound; no other room has one, and neither has the result', { skip: !HAS }, () => {
  const g = world(), r = D.startRun(g, brokenCrate(g));
  const off = UI.sheetHTML(model(r)), on = UI.sheetHTML(model(r, { dialInfo: dialInfo({ dial: true }) }));
  assert.match(off, /<button class="btn ghost sm deal-tog" data-deal="dialtone" data-snd data-fid="deal-dial" aria-pressed="false" title="Repair dial tone"><span class="tn">Dial tone<\/span> <span class="tb" aria-hidden="true">off<\/span><\/button>/);
  assert.match(on, /aria-pressed="true" title="Repair dial tone"><span class="tn">Dial tone<\/span> <span class="tb" aria-hidden="true">on</);
  assert.ok(!/aria-label="Repair dial tone"/.test(off + on), 'the name is the words on the button (Dial tone), not another phrase that voice control cannot find (fourth round, U10)');
  assert.ok(off.indexOf('data-fid="deal-sound"') < off.indexOf('data-fid="deal-dial"') && off.indexOf('data-fid="deal-dial"') < off.indexOf('data-fid="leave"'), 'beside Sound, before Leave');
  assert.ok(!/data-deal="dialtone"/.test(UI.sheetHTML(model(D.startRun(g, fixedLot(g))))), 'a purchase has no dial');
  assert.equal(dialSwitchHTML(null), '');
  assert.equal(dialSwitchHTML({ kind: 'repair', stage: 'result' }), '', 'and the result of a repair has finished with it');
  assert.match(dialSwitchHTML({ kind: 'repair', stage: 'fix' }), /aria-pressed="false"/, 'a model that does not know has it off');
  const q = UI.sheetHTML(model(r, { dialInfo: dialInfo({ dial: true, quiet: true }) })); assert.match(q, /aria-pressed="false" title="Repair dial tone"/, 'in Classroom it is not pressed');
});

// ---- the session
const REAL = { set: globalThis.setTimeout, clear: globalThis.clearTimeout };
function rig({ reduced = false } = {}) {
  const keepDoc = globalThis.document; globalThis.document = undefined; // the room's DOM half is not drawn here (no frame loop, no listeners): the session sees no page
  const g = world(), ctx = fakeCtx(); ctx.g = () => g; ctx.S.clock = { paused: false, speed: 1, now: () => g.s.hour }; ctx.S.setPaused = (p) => { ctx.S.clock.paused = p; };
  ctx.dlg.el.querySelector = () => null; ctx.reduced = () => reduced;
  const said = []; ctx.announce = (m) => said.push(m);
  const dial = [], was = { play: page.play, request: page.request, countUp: page.countUp, dial: page.dial };
  page.play = () => null; page.request = () => true; page.countUp = () => null;
  page.dial = { start: () => { dial.push('start'); return true; }, update: () => dial.push('update'), stop: () => dial.push('stop'), get active() { return false; } };
  return { g, ctx, said, dial, end() { Object.assign(page, was); globalThis.document = keepDoc; } };
}
async function withRig(opts, fn) {
  const R = rig(opts), keep = JSON.stringify(appSettings.audio); _resetTold();
  try { await fn(R); } finally { R.ses?.dispose?.(); R.end(); appSettings.audio = JSON.parse(keep); _resetTold(); }
}
test('A4: the first repair of a run says, politely and in words, what the dial is and the two ways round it; the second repair, a slider and Classroom do not', { skip: !HAS }, async () => {
  await withRig({}, async (R) => {
    appSettings.audio = { ...appSettings.audio, dial: false, quiet: false, mute: false };
    R.ses = UI.openDeal(R.ctx, brokenCrate(R.g)); await Promise.resolve();
    assert.equal(R.said.length, 1); const m = R.said[0];
    assert.match(m, /^Repair .+\. The repair bench says: Three steps/); assert.match(m, /Fix\. A marker moves across a bar by itself: press Stop when it is in the green zone\. If you cannot see it, choose Careful: pay more, no timing\./);
    assert.match(m, /Or turn on Repair dial tone, with the Dial tone button, to follow it by ear\.$/);
    R.ses.dispose(); R.said.length = 0;
    R.ses = UI.openDeal(R.ctx, brokenCrate(R.g)); assert.equal(R.said.length, 1); assert.ok(!/Fix\. A marker/.test(R.said[0]), 'once per run: the second repair gets the room\'s opening and no more');
  });
  await withRig({ reduced: true }, async (R) => {
    R.ses = UI.openDeal(R.ctx, brokenCrate(R.g)); assert.ok(!/A marker moves/.test(R.said[0]), 'a slider has its own words: not pushed under reduced motion');
  });
  await withRig({}, async (R) => {
    appSettings.audio = { ...appSettings.audio, quiet: true };
    R.ses = UI.openDeal(R.ctx, brokenCrate(R.g)); assert.match(R.said[0], /choose Careful: pay more, no timing\.$/); assert.ok(!/Repair dial tone/.test(R.said[0]), 'in Classroom the tone is not offered');
  });
  await withRig({}, async (R) => {
    R.ses = UI.openDeal(R.ctx, { kind: 'buy', zone: 4, lotId: R.g.s.lots[4].find((l) => l.mode === 'fixed').id }); assert.ok(!/Fix\./.test(R.said[0]) && !/marker/.test(R.said[0]), 'only a repair has a dial');
    _resetTold();
  });
});
test('A4: pressing the room\'s switch turns the tone on, starts it at once while the dial runs, says so, and presses again to let it go', { skip: !HAS }, async () => {
  await withRig({}, async (R) => {
    appSettings.audio = { ...appSettings.audio, dial: false, quiet: false, mute: false, master: 70, ui: true, game: true, touched: false };
    R.ses = UI.openDeal(R.ctx, brokenCrate(R.g)); await Promise.resolve(); R.said.length = 0;
    const model0 = UI.viewModel(R.ses); assert.equal(model0.dialInfo.on, false);
    R.ses.raf = 7; // the dial is running
    R.ses.acts.dialtone();
    assert.equal(appSettings.audio.dial, true); assert.equal(appSettings.audio.touched, true, 'a choice by hand');
    assert.deepEqual(R.said, ['Repair dial tone on. Low is left, high is right, and the tone brightens in the green zone.']);
    assert.deepEqual(R.dial, ['start'], 'the tone follows the marker from this moment, not from the next stage');
    assert.equal(UI.viewModel(R.ses).dialInfo.on, true); assert.match(UI.sheetHTML(UI.viewModel(R.ses)), /aria-pressed="true" title="Repair dial tone"/, 'the sheet shows it');
    R.said.length = 0; R.ses.acts.dialtone();
    assert.equal(appSettings.audio.dial, false); assert.deepEqual(R.said, ['Repair dial tone off.']); assert.deepEqual(R.dial, ['start', 'stop']);
    R.ses.raf = 0;
  });
  await withRig({}, async (R) => { // muted: it is on and it is not heard, and the words say so
    appSettings.audio = { ...appSettings.audio, dial: false, quiet: false, mute: true };
    R.ses = UI.openDeal(R.ctx, brokenCrate(R.g)); await Promise.resolve(); R.said.length = 0; R.ses.raf = 7; R.ses.acts.dialtone();
    assert.equal(appSettings.audio.dial, true); assert.match(R.said[0], /you will not hear it because sound is off/); assert.deepEqual(R.dial, [], 'no tone is started under a mute'); R.ses.raf = 0;
  });
  await withRig({}, async (R) => { // Classroom: nothing changes and the words say why
    appSettings.audio = { ...appSettings.audio, dial: false, quiet: true };
    R.ses = UI.openDeal(R.ctx, brokenCrate(R.g)); await Promise.resolve(); R.said.length = 0; R.ses.acts.dialtone();
    assert.equal(appSettings.audio.dial, false); assert.match(R.said[0], /off in Classroom/);
  });
  assert.match(src('js/ui/deal.js'), /dialtone\(\) \{ const r = toggleDial\(appSettings\.audio \|\| \{\}\);/);
});

// ---- the words are heard while a modal sheet is open
function fakePage() {
  const mk = (tag) => ({ tagName: tag, children: [], dataset: {}, attrs: {}, className: '', textContent: '', open: false, setAttribute(k, v) { this.attrs[k] = v; if (k.startsWith('data-')) this.dataset[k.slice(5)] = v; }, appendChild(c) { this.children.push(c); return c; } });
  const els = { '#live': mk('div'), '#alert-live': mk('div'), '#dlg': mk('dialog') };
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {}, getElementById: () => null, querySelectorAll: () => [], querySelector: (s) => els[s] || null, createElement: mk };
  return els;
}
test('A4: announce() speaks inside an open modal dialog (an inert live region is not in the accessibility tree), and as it always did when none is open', async () => {
  const { announce } = await import('../js/ui/common.js'), els = fakePage();
  announce('Sound off.'); await sleep(60);
  assert.equal(els['#live'].textContent, 'Sound off.'); assert.equal(els['#dlg'].children.length, 0, 'no dialog open: nothing is added to it');
  els['#dlg'].open = true;
  announce('Repair dial tone on.'); await sleep(60);
  const r = els['#dlg'].children.find((c) => c.dataset.say === 'status');
  assert.ok(r, 'a polite region inside the dialog'); assert.equal(r.textContent, 'Repair dial tone on.'); assert.equal(r.attrs.role, 'status'); assert.equal(r.attrs['aria-live'], 'polite'); assert.equal(r.className, 'sr'); assert.equal(r.attrs['data-keep'], '', 'setHTML keeps it across the sheet\'s redraws');
  announce('Sound on.'); await sleep(60);
  assert.equal(els['#dlg'].children.filter((c) => c.dataset.say === 'status').length, 1, 'one region, written again'); assert.equal(r.textContent, 'Sound on.');
  announce('Not done.', true); await sleep(60);
  const a = els['#dlg'].children.find((c) => c.dataset.say === 'alert'); assert.ok(a); assert.equal(a.attrs.role, 'alert'); assert.equal(a.attrs['aria-live'], 'assertive'); assert.equal(a.textContent, 'Not done.');
  assert.equal(els['#live'].textContent, 'Sound on.', 'the page-wide region is written too, for when the dialog closes');
});
test('A4: the docs say the default stays off and why, and the toast that could not be seen is replaced by what can', () => {
  const doc = src('docs/AUDIO.md');
  assert.match(doc, /Appendix F\. The third repair round/);
  assert.match(doc, /Decision \(third round\): the default stays off/);
  assert.match(doc, /painted over by the sheet and its backdrop/); assert.match(doc, /activeModalDialog/);
  assert.ok(!/the first Fix stage of a run shows one info toast/.test(doc), '4.5 no longer promises the toast');
  assert.match(doc, /Dial tone button/);
});

// ================================================================================ fourth round (docs/AUDIO.md Appendix G)
test('U1: the repair tone comes back when sound is unmuted, when Game sounds are switched off and on, and when the tab is shown again; the room used to say it was on and the tone was gone for the rest of the stage', { skip: !HAS }, async () => {
  await withRig({}, async (R) => {
    appSettings.audio = { ...audioDefaults(), dial: false };
    const clock = fakeClock(), fctx = fakeContext({ sampleRate: 8000 });
    const au = createAudio({ get: () => appSettings.audio, now: clock.now, timers: clock.timers_, factory: () => fctx, random: () => 0.5, measure: false });
    au.unlock(); fctx.state = 'running'; R.ctx.audio = au; // the room's own engine: the real one, under a recording context
    R.ses = UI.openDeal(R.ctx, brokenCrate(R.g)); await Promise.resolve();
    R.ses.raf = 7; // the animated dial is running
    R.ses.acts.dialtone(); assert.equal(au.dial.active, true, 'the switch starts the tone');
    const set = (patch) => { appSettings.audio = { ...appSettings.audio, ...patch }; au.sync(); };
    set({ mute: true }); assert.equal(au.dial.active, false, 'key M: the engine ended it');
    set({ mute: false }); assert.equal(au.dial.active, true, 'and unmuting brings it back (it did not: the flag said it was on, the tone was never started again)');
    set({ game: false }); assert.equal(au.dial.active, false); set({ game: true }); assert.equal(au.dial.active, true, 'Game sounds off and on');
    au.setHidden(true); assert.equal(au.dial.active, false, 'a tab put away'); au.setHidden(false); clock.flush(); assert.equal(au.dial.active, true, 'and shown again');
    assert.equal(UI.viewModel(R.ses).dialInfo.on, true, 'the room says on, and it is');
    set({ dial: false }); assert.equal(au.dial.active, false, 'the setting switched off by another door: the tone lets go');
    R.ses.raf = 0;
  });
});
test('U1: the tone is not started for a room whose dial is not running (reduced motion, or the stage is over), and is let go with the room', { skip: !HAS }, async () => {
  await withRig({}, async (R) => {
    appSettings.audio = { ...audioDefaults(), dial: true };
    const clock = fakeClock(), fctx = fakeContext({ sampleRate: 8000 });
    const au = createAudio({ get: () => appSettings.audio, now: clock.now, timers: clock.timers_, factory: () => fctx, random: () => 0.5, measure: false });
    au.unlock(); fctx.state = 'running'; R.ctx.audio = au;
    R.ses = UI.openDeal(R.ctx, brokenCrate(R.g)); await Promise.resolve();
    appSettings.audio = { ...appSettings.audio, mute: true }; au.sync(); appSettings.audio = { ...appSettings.audio, mute: false }; au.sync();
    assert.equal(au.dial.active, false, 'no dial running (raf 0): an engine event starts nothing');
    R.ses.raf = 7; appSettings.audio = { ...appSettings.audio, mute: true }; au.sync(); appSettings.audio = { ...appSettings.audio, mute: false }; au.sync(); assert.equal(au.dial.active, true);
    R.ses.raf = 0; R.ses.dispose(); assert.equal(au.dial.active, false, 'closing the room lets go of the tone'); appSettings.audio = { ...appSettings.audio, mute: true }; au.sync(); appSettings.audio = { ...appSettings.audio, mute: false }; au.sync();
    assert.equal(au.dial.active, false, 'and a disposed room is not listening');
  });
});
test('U9: Stop is described by a short line, always; the long line is for the first repair of a run, and a later repair shows the short one under the dial', { skip: !HAS }, () => {
  const g = world(), r = D.startRun(g, brokenCrate(g));
  const first = UI.fixHTML(model(r, { dialLong: true })), later = UI.fixHTML(model(r, { dialLong: false })), unknown = UI.fixHTML(model(r));
  assert.match(first, /aria-describedby="dial-short"/); assert.match(first, /id="dial-ear">Prefer to listen\?/, 'the first says it all, where it can be read');
  assert.match(later, /aria-describedby="dial-ear"/); assert.match(later, /id="dial-ear">Dial tone is off\. Careful needs no timing\.<\/p>/); assert.ok(!/id="dial-short"/.test(later), 'one line, not two');
  assert.ok(!/Prefer to listen/.test(later), 'and the long one is not under every dial of every repair');
  assert.match(unknown, /aria-describedby="dial-short"/, 'a model that does not know is the first');
  assert.equal(dialShortText(dialInfo({ dial: true })), 'Dial tone is on. Careful needs no timing.'); assert.match(dialShortText(dialInfo({ dial: true, mute: true })), /you will not hear it/); assert.match(dialShortText(dialInfo({ dial: true, quiet: true })), /off in Classroom/);
  assert.ok(dialShortText(dialInfo({ dial: true })).split(/\s+/).length <= 12, 'a dozen words');
});
test('U9: the session says it all in the first repair of a run only, and the page shows the long line once', { skip: !HAS }, async () => {
  await withRig({}, async (R) => {
    appSettings.audio = { ...audioDefaults() };
    R.ses = UI.openDeal(R.ctx, brokenCrate(R.g)); await Promise.resolve();
    assert.equal(R.ses.longEar, true); assert.equal(UI.viewModel(R.ses).dialLong, true);
    R.ses.dispose();
    R.ses = UI.openDeal(R.ctx, brokenCrate(R.g)); assert.equal(R.ses.longEar, false, 'the second repair of the run'); assert.equal(UI.viewModel(R.ses).dialLong, false);
  });
});
test('U10: the Deal Room\'s switches are named by the words on them; their state is aria-pressed and a badge the name leaves out, with a pressed style that is not colour alone', { skip: !HAS }, () => {
  const g = world(), r = D.startRun(g, brokenCrate(g)), h = UI.sheetHTML(model(r));
  for (const [name, fid] of [['Sound', 'deal-sound'], ['Dial tone', 'deal-dial']]) {
    const b = h.match(new RegExp(`<button[^>]*data-fid="${fid}"[^>]*>[\\s\\S]*?</button>`))[0];
    assert.ok(!/aria-label=/.test(b), `${name}: no label that differs from the visible words`);
    const text = b.replace(/<span class="tb" aria-hidden="true">[^<]*<\/span>/, '').replace(/<[^>]+>/g, '').trim();
    assert.equal(text, name, 'the accessible name (the content without the aria-hidden badge) is the visible label');
    assert.match(b, /class="tb" aria-hidden="true">(on|off)</, 'the state is in a badge');
  }
  assert.match(src('css/ui-deal.css'), /\.deal-tog\[aria-pressed="true"\] \{ border-color: var\(--gold\); box-shadow: inset 0 0 0 1px var\(--gold\); \}/);
  assert.match(src('css/ui-deal.css'), /\.deal-tog\[aria-pressed="true"\] \.tb::before \{ content: "\\2713/, 'a tick on the pressed one');
});
test('U6: the dashboard\'s Quiet sound box comes before Copy student link, the copy says what it carries, and the link is the room\'s rule applied early (it is put back when the student leaves)', () => {
  const S = roomSession(), off = instructorParts(S, {}).head, on = instructorParts(S, { quietLink: true }).head;
  assert.ok(off.indexOf('data-change="linkquiet"') < off.indexOf('data-act="copylink"'), 'tick, then copy');
  assert.match(on, /data-act="copylink" data-link="[^"]+" data-quiet="1">/); assert.ok(!/data-quiet=/.test(off));
  assert.match(src('js/ui/instructor.js'), /b\.dataset\.quiet \? 'Student link copied, with quiet sound\.' : 'Student link copied\.'/);
  // the link with a room: untouched, quiet; joining remembers the earlier values and leaving puts them back
  const a = migrateAudio({ audio: { ...audioDefaults(), master: 55, v: 1 } }, '?room=ABCD&sound=quiet');
  assert.equal(a.quiet, true); assert.equal(a.touched, false); assert.equal(a.master, 55);
  const store = new Map(), toasts = [], d = { settings: { audio: a }, kv: { get: (k) => (store.has(k) ? store.get(k) : null), set: (k, v) => { store.set(k, v); return true; }, del: (k) => { store.delete(k); } }, save: () => {}, toast: (m) => toasts.push(m) };
  assert.equal(wire.pendingRoom({ code: 'ABCD' }, d), 'joined', 'the room is joined with the rule already on'); assert.equal(toasts.length, 1, 'and told once');
  const before = store.get(wire.BEFORE_ROOM); assert.equal(before.quiet, false); assert.equal(before.clockSounds, true); assert.equal(before.master, 55);
  assert.equal(wire.applyRoomRule(d, false), 'left'); assert.equal(d.settings.audio.quiet, false, 'a laptop is not left in Classroom for solo play at home'); assert.equal(d.settings.audio.clockSounds, true); assert.equal(d.settings.audio.master, 55);
  // a quiet link with no room, and a student who has changed a setting, are as they were
  assert.equal(migrateAudio({}, '?sound=quiet').touched, true);
  const mine = migrateAudio({ audio: { ...audioDefaults(), touched: true, master: 90, v: 1 } }, '?room=ABCD&sound=quiet'); assert.equal(mine.quiet, false); assert.equal(mine.master, 90);
});
test('U13: the test button and the line that says whether sound can be heard are the first things under the preset and the volume, not below nine controls', () => {
  const html = audioSettingsHTML(audioDefaults(), 'running');
  assert.ok(html.indexOf('id="s-sample"') < html.indexOf('id="s-mute"') && html.indexOf('id="s-status"') < html.indexOf('id="s-mute"'));
  assert.ok(html.indexOf('id="s-vol"') < html.indexOf('id="s-sample"'), 'after the preset and the volume');
  assert.match(html, /<span id="s-status" role="status"/);
});
