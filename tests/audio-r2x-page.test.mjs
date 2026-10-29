// Third round, track X, A3: the audition page (dev/sounds.html). Its own file because it needs a clock of its own: the page's real code (dev/sounds.js) runs on a small page stand-in, the real
// engine behind a recording fake context, and a virtual clock that the test moves, so "press every button, wait a minute" takes milliseconds. The one rule it holds:
//     EVERY button either sounds, or says on the status line exactly which rule held it back (or, for Stop and Reset, what it did).
// The author will not know the engine's rules; a silent button must never look like a broken one. Run: node --test tests/audio-r2x-page.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeContext } from './helpers/fakeaudio.mjs';

const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

// ---------------------------------------------------------------- the virtual clock (installed for the page's life, put back at the end)
const V = { now: 5000, q: [], id: 0 };
const real = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, perf: Object.getOwnPropertyDescriptor(globalThis, 'performance'), AudioContext: globalThis.AudioContext, document: globalThis.document, location: globalThis.location, window: globalThis.window, raf: globalThis.requestAnimationFrame };
const tick = () => new Promise((r) => setImmediate(r));
/** Move virtual time forward by `ms`, running every timer that falls inside it in order, and letting promises settle between them. */
async function advance(ms) {
  const end = V.now + ms;
  for (;;) {
    await tick();
    V.q.sort((a, b) => a.at - b.at || a.h - b.h);
    const t = V.q[0];
    if (!t || t.at > end) break;
    V.q.shift(); V.now = t.at; t.fn();
  }
  V.now = end; await tick();
}

// ---------------------------------------------------------------- the page stand-in: just what dev/sounds.js asks of a document
const all = [];
class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.children = []; this.dataset = {}; this.attrs = {}; this.className = ''; this._text = ''; this.parent = null; this.listeners = {}; this._cls = new Set();
    this.value = ''; this.checked = false; this.title = ''; this.type = ''; this.id = ''; this.onclick = null; this.oninput = null;
    const self = this;
    this.classList = { toggle(c, on) { const want = on === undefined ? !self._cls.has(c) : !!on; if (want) self._cls.add(c); else self._cls.delete(c); return want; }, add(c) { self._cls.add(c); }, remove(c) { self._cls.delete(c); }, contains: (c) => self._cls.has(c) };
    all.push(this);
  }
  get textContent() { return this._text + this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get firstElementChild() { return this.children.find((c) => typeof c !== 'string') || null; }
  append(...nodes) { for (const n of nodes) { if (typeof n !== 'string') n.parent = this; this.children.push(n); } }
  appendChild(n) { this.append(n); return n; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  querySelector(sel) { // a class selector, depth first
    const cls = sel.startsWith('.') ? sel.slice(1) : null;
    for (const c of this.children) { if (typeof c === 'string') continue; if (cls && (c.className.split(/\s+/).includes(cls))) return c; const d = c.querySelector(sel); if (d) return d; }
    return null;
  }
}
const bar = {}; // the elements dev/sounds.html declares
for (const [id, tag, o] of [['vol', 'input', { type: 'range', value: '70' }], ['mute', 'input', { type: 'checkbox' }], ['ui', 'input', { type: 'checkbox', checked: true }], ['game', 'input', { type: 'checkbox', checked: true }],
  ['world', 'input', { type: 'checkbox', checked: true }], ['amb', 'input', { type: 'checkbox' }], ['ambvol', 'input', { type: 'range', value: '70' }], ['quiet', 'input', { type: 'checkbox' }],
  ['stop', 'button', {}], ['reset', 'button', {}], ['state', 'span', {}], ['app', 'div', {}], ['meter', 'div', {}], ['db', 'span', {}]]) { const e = new El(tag); e.id = id; Object.assign(e, o); bar[id] = e; }
bar.meter.append(new El('i'));
let page; // the page's own handle: window.audioAudition = { audio, settings, say }
const press = async (btn, ms = 90000) => { assert.equal(typeof btn.onclick, 'function', 'a button with nothing behind it'); const r = btn.onclick(); await advance(ms); if (r && r.then) await Promise.race([r, tick()]); }; // (a run of sounds waits on the clock: it is the clock that is moved, not the promise that is waited for)
const status = () => bar.state.textContent;
const buttons = () => all.filter((e) => e.tagName === 'BUTTON' && e.onclick);
const label = (b) => b.textContent || b.id;
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

async function loadPage() {
  Object.defineProperty(globalThis, 'performance', { value: { now: () => V.now }, configurable: true, writable: true });
  globalThis.setTimeout = (fn, ms = 0, ...a) => { const h = ++V.id; V.q.push({ h, at: V.now + Math.max(0, +ms || 0), fn: () => fn(...a) }); return h; };
  globalThis.clearTimeout = (h) => { const i = V.q.findIndex((t) => t.h === h); if (i >= 0) V.q.splice(i, 1); };
  globalThis.AudioContext = function AudioContext() { return fakeContext({ sampleRate: 8000 }); };
  globalThis.location = { search: '?check=1' }; globalThis.window = globalThis; globalThis.requestAnimationFrame = () => 0;
  globalThis.document = { hidden: false, getElementById: (id) => bar[id] || null, createElement: (t) => new El(t), addEventListener() {} };
  await import('../dev/sounds.js');
  page = globalThis.audioAudition;
  return page;
}
function restore() {
  globalThis.setTimeout = real.setTimeout; globalThis.clearTimeout = real.clearTimeout;
  if (real.perf) Object.defineProperty(globalThis, 'performance', real.perf);
  for (const [k, v] of [['AudioContext', real.AudioContext], ['document', real.document], ['location', real.location], ['window', real.window], ['requestAnimationFrame', real.raf]]) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
}
const setBar = (o) => { const d = { vol: 70, mute: false, ui: true, game: true, world: true, amb: false, ambvol: 70, quiet: false }; for (const [k, v] of Object.entries({ ...d, ...o })) { if (k === 'vol' || k === 'ambvol') bar[k].value = String(v); else bar[k].checked = !!v; } };

test('the page is built, and every button on it has something behind it', async () => {
  try {
    await loadPage();
    const bs = buttons();
    assert.ok(bs.length > 250, `the page has ${bs.length} buttons: every sound, every pool member, the ladders, the bursts, the minute, the beds and the one-shots`);
    for (const b of bs) assert.ok(label(b), 'every button is named');
    assert.ok(bar.stop.onclick && bar.reset.onclick);
    const fresh = all.find((e) => e.id === 'fresh'); assert.ok(fresh, 'the burst section has a Fresh budget box'); assert.equal(fresh.type, 'checkbox'); assert.equal(fresh.checked, true, 'ticked by default');
    assert.match(fresh.parent.textContent, /Fresh budget before each burst/);
    assert.match(src('dev/sounds.html'), /id="state"/);
  } finally { /* the page lives on for the next tests of this file */ }
});

// ---------------------------------------------------------------- the bursts, pressed in the order of the page
const burstButtons = () => buttons().filter((b) => b.parent && b.parent.parent && /Bursts through the collector/.test(b.parent.parent.textContent) && !/Fresh budget/.test(b.textContent));
test('A3: the bursts, pressed one after another (the author\'s order), each sound: with a fresh budget (the default) not one of them is silent', async () => {
  setBar({}); page.say(''); await advance(60000);
  const bs = burstButtons(); assert.equal(bs.length, 6, 'the six bursts');
  const fresh = all.find((e) => e.id === 'fresh'); fresh.checked = true;
  const log = [];
  for (const b of bs) {
    const before = sum(page.audio.stats().played), tag = label(b);
    await press(b, 1200); // the author pressing them about a second apart: later presses queue behind the last big moment
    await advance(8000);
    const played = sum(page.audio.stats().played) - before;
    log.push([tag, played, status()]);
    assert.ok(played > 0, `"${tag}" sounded (it played ${played}); the status line says: ${status()}`);
    assert.ok(!/silent/.test(status()), `"${tag}": nothing was held back, so nothing is claimed: ${status()}`);
    assert.ok(!b._cls.has('silent'), 'and the button is not marked silent');
  }
});
test('A3: with the box unticked the real reward budget applies, a burst that is silent says so, with the reason and the seconds to the next one; and ticking it again fixes it', async () => {
  setBar({}); const fresh = all.find((e) => e.id === 'fresh'); page.say(''); await advance(60000);
  const bs = burstButtons(); fresh.checked = false;
  const out = [];
  for (const b of bs.slice(0, 4)) { await press(b, 1200); out.push([label(b), status(), b._cls.has('silent')]); }
  const silentOnes = out.filter(([, s]) => /silent|partly silent/.test(s));
  assert.ok(silentOnes.length >= 1, 'the later bursts lose their rewards to the budget, as in the author\'s report: ' + JSON.stringify(out.map((o) => o[1].slice(0, 60))));
  for (const [name, s] of silentOnes) { assert.match(s, /Reward budget/, `"${name}" says which rule: ${s}`); assert.match(s, /next full one is \d+ s away/, 'and when it ends'); }
  assert.ok(out.some(([, , marked]) => marked) || silentOnes.every(([, s]) => /partly/.test(s)), 'a burst that played nothing is marked silent');
  for (const [name, s, marked] of out) if (marked) assert.ok(/silent/.test(s), `"${name}" is marked silent and says why: ${s}`);
  // the box ticked again: the very same button sounds at once
  fresh.checked = true; await advance(20000);
  const before = sum(page.audio.stats().played); await press(bs[2], 1200); assert.ok(sum(page.audio.stats().played) > before, '"five levels in one go" sounds with a fresh budget');
});

// ---------------------------------------------------------------- every button, every configuration
const CONFIGS = {
  'a first visit': {},
  'muted': { mute: true },
  'Interface off': { ui: false },
  'Game off': { game: false },
  'World ticks off': { world: false },
  'the Classroom rule': { quiet: true },
  'volume 0': { vol: 0 },
  'Ambient on': { amb: true },
  'Ambient on and its level at 0': { amb: true, ambvol: 0 },
};
/** The things that make a sound, counted: voices played by the engine, one-shots started, the dial tone, the bed. */
function counters() {
  const st = page.audio.stats();
  return { played: sum(st.played), shots: page.shots, dial: page.audio.dial.active, bed: st.ambient.playing };
}
test('A3: EVERY button of the page, in every configuration of the bar, either sounds or says on the status line which rule held it back', async () => {
  // count the ambient one-shots that really start (they return nothing to the page's statistics)
  page.shots = 0; const orig = page.audio.playOneShot; page.audio.playOneShot = (id) => { const v = orig.call(page.audio, id); if (v) page.shots++; return v; };
  const problems = [];
  const skip = new Set(['stop', 'reset']); // checked on their own below
  for (const [cfg, set] of Object.entries(CONFIGS)) {
    const bs = buttons().filter((b) => !skip.has(b.id)), t0 = Date.now(); let n = 0;
    for (const b of bs) {
      if (process.env.R2X_LOG && n++ % 20 === 0) console.error(`[${cfg}] ${n}/${bs.length} ${Date.now() - t0} ms, ${V.q.length} timers, virtual ${Math.round((V.now - 5000) / 1000)} s`);
      setBar(set); page.audio.release(); page.audio.dial.stop(); page.say(''); page.audio.setEnv({ hold: false }); await advance(3000);
      const before = counters();
      await press(b, label(b).startsWith('Play') && /minute|it at 4x/.test(label(b)) ? 90000 : 40000);
      const after = counters(), st = status();
      const sounded = after.played > before.played || after.shots > before.shots || (after.dial && !before.dial) || (after.bed && !before.bed) || (after.bed && /^(bed|night|rain|tariff|wealth)/.test(label(b)));
      const said = /silent|partly silent|stopped|back to a first visit|was stopped|Held back/.test(st); // (a minute that played nothing says what held it all back)
      if (!sounded && !said) problems.push(`[${cfg}] "${label(b)}": no sound and nothing said (status: ${st})`);
      if (!sounded && /engine returned nothing|held it back \(undefined\)/.test(st)) problems.push(`[${cfg}] "${label(b)}": silent with no reason the page can name (${st})`);
      if (sounded && !said && /silent/.test(st)) problems.push(`[${cfg}] "${label(b)}": sounded but claims to be silent (${st})`);
    }
  }
  page.audio.playOneShot = orig;
  assert.deepEqual(problems.slice(0, 12), [], `${problems.length} silent button(s) with no word`);
});

test('A3: the ambient bed buttons say "Ambient is off: tick Ambient in the bar" and show as silent; ticked, they sound and say nothing', async () => {
  const bed = buttons().find((b) => /^bed scrap$/.test(label(b))); assert.ok(bed);
  setBar({ amb: false }); page.audio.release(); page.say(''); await press(bed, 2000);
  assert.match(status(), /silent: Ambient is off: tick Ambient in the bar\./); assert.equal(bed._cls.has('silent'), true); assert.equal(page.audio.stats().ambient.playing, false);
  setBar({ amb: true }); await press(bed, 2000);
  assert.equal(bed._cls.has('silent'), false); assert.equal(page.audio.stats().ambient.playing, true, 'the bed plays'); assert.ok(!/silent/.test(status()), status());
  setBar({ amb: true, quiet: true }); await press(bed, 2000); assert.match(status(), /Classroom rule turns the ambient bed off/);
  setBar({ amb: true, mute: true }); await press(bed, 2000); assert.match(status(), /Mute is on/);
  setBar({}); page.audio.release();
  const shot = buttons().find((b) => /^amb\./.test(label(b)) || /^(gull|chime|door|bell|horn|buoy)/.test(label(b))) || buttons().find((b) => b.title && b.parent && /amb|Ambient/.test(b.parent.parent?.textContent || ''));
  assert.ok(shot, 'an ambient one-shot button');
  setBar({ mute: true }); page.say(''); await press(shot, 1000); assert.match(status(), /silent: Mute is on\./);
});
test('A3: the dial tone buttons say why they are silent (Classroom, mute, Game off) and sound otherwise; Stop and Reset say what they did', async () => {
  const start = buttons().find((b) => /Start the tone/.test(label(b))), stopTone = buttons().find((b) => label(b) === 'Stop' && b.id === '');
  assert.ok(start && stopTone);
  for (const [set, re] of [[{ quiet: true }, /Classroom rule turns the dial tone off/], [{ mute: true }, /Mute is on/], [{ game: false }, /Game sounds are off/]]) { setBar(set); page.audio.dial.stop(); page.say(''); await press(start, 500); assert.match(status(), re); assert.equal(start._cls.has('silent'), true); }
  setBar({}); page.say(''); await press(start, 500); assert.equal(page.audio.dial.active, true); assert.ok(!/silent/.test(status())); assert.equal(start._cls.has('silent'), false);
  await press(stopTone, 100); assert.equal(page.audio.dial.active, false); assert.match(status(), /dial tone stopped/);
  await press(bar.stop, 100); assert.match(status(), /stopped every sound/);
  setBar({ mute: true, quiet: true, vol: 20 }); await press(bar.reset, 100);
  assert.equal(bar.mute.checked, false); assert.equal(bar.quiet.checked, false); assert.equal(String(bar.vol.value), '70'); assert.match(status(), /back to a first visit/);
});
test('A3: a run of sounds says at its end how many did not sound and why, and the minute says what the rules held back', async () => {
  setBar({ game: false }); page.say('');
  const playAll = buttons().find((b) => /^Play all \d+, one after the other$/.test(label(b))); assert.ok(playAll);
  await press(playAll, 60000);
  assert.match(status(), /did not sound\)/); assert.match(status(), /Game sounds are off|Interface sounds are off/);
  setBar({}); page.say('');
  const minute = buttons().find((b) => /Play the minute at 1x/.test(label(b))); await press(minute, 100000);
  assert.match(status(), /^engine: \S+ · the minute played \d+ sounds?\./, status());
  setBar({ mute: true }); await press(minute, 100000); assert.match(status(), /the minute played 0 sounds\. Held back: \d+ by mute: Mute is on\./);
  setBar({}); await press(buttons().find((b) => /Stop the minute/.test(label(b))), 100); assert.match(status(), /the minute was stopped/);
});

test('(clean up) the virtual clock is put back', () => { restore(); assert.equal(globalThis.setTimeout, real.setTimeout); });
