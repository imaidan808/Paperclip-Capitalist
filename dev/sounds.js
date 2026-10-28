// The audition page (dev only), for the author's ears. Every sound of docs/AUDIO.md on a button, grouped by what it MEANS (gain, loss, neutral, warning, refusal, size, progress, the Deal Room...), each
// with its tier as a word, its meaning and its trigger in plain sight. Beside the buttons: gain and loss side by side, the size ladders in sequence, every timbre of a pooled sound, the repair dial
// tone on a slider, the collector's bursts, a minute of ordinary play replayed through the real wiring at 1x or 4x, and the ambient beds. It runs the real engine.
import { audio, bindSettings, migrateAudio } from '../js/audio/index.js';
import { RECIPES, IDS, variantsOf, tierOf } from '../js/audio/recipes.js';
import { BED_IDS, ONE_SHOTS } from '../js/audio/ambient.js';
import { eventCalls, noteCalls, uiCalls, controlFor, newWireState } from '../js/audio/wire.js';
import { SECTIONS, PAIRS, LADDERS, MINUTE } from './sections.js';

const settings = { audio: migrateAudio({}, location.search) };
bindSettings(settings);
const $ = (id) => document.getElementById(id);
const A = () => settings.audio;
const sync = () => { Object.assign(A(), { master: +$('vol').value, mute: $('mute').checked, ui: $('ui').checked, game: $('game').checked, worldTicks: $('world').checked, ambient: $('amb').checked, ambientLevel: +$('ambvol').value, quiet: $('quiet').checked, dial: true }); audio.sync(); };
for (const id of ['vol', 'mute', 'ui', 'game', 'world', 'amb', 'ambvol', 'quiet']) $(id).addEventListener('input', () => { audio.unlock(); sync(); });
const press = () => audio.unlock();
document.addEventListener('pointerdown', press); document.addEventListener('keydown', press);
const status = () => { $('state').textContent = 'engine: ' + audio.state; }; audio.on(status); status();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const el = (tag, cls, text, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.append(e); return e; };
const app = $('app');

// ---- one sound
const keyOf = (id, v) => id + '#' + v;
const split = (k) => { const i = k.indexOf('#'); return i < 0 ? [k, null] : [k.slice(0, i), k.slice(i + 1)]; };
const expand = (item) => { const [id, v] = split(item); if (!RECIPES[id]) return []; return v ? [[id, v]] : variantsOf(id).map((x) => [id, x]); };
const hear = (id, v, o = {}) => { audio.unlock(); sync(); return audio.play(id, { variant: v, noCooldown: true, player: true, ...o }); };
/** Play a list of [id, variant] one after the other, each given the room of its own length (and a breath). */
let seqToken = 0;
async function sequence(list, gap = 350) {
  const token = ++seqToken;
  for (const [id, v] of list) { if (token !== seqToken) return; hear(id, v); await sleep(Math.max(500, (RECIPES[id].dur || 0.5) * 1000) + gap); }
}
$('stop').onclick = () => { seqToken++; audio.stopAll(60); audio.dial.stop(); };

// ---- the cards: a sound with its tier (a word, not only a colour), its meaning and its trigger
function card(parent, id, v) {
  const e = RECIPES[id], tier = tierOf(id, v), c = el('div', 'card', null, parent);
  const b = el('button', null, id + (variantsOf(id).length > 1 ? ' / ' + v : ''), c); b.dataset.tier = tier;
  b.onclick = () => hear(id, v);
  el('span', 'chip ' + tier, tier, c);
  el('div', 'meaning', e.meaning, c);
  const d = el('details', 'trig', null, c); el('summary', null, 'when it plays', d); el('p', null, e.trigger, d);
  return c;
}
const placed = new Set();
for (const S of SECTIONS) {
  const sec = el('section', 'grp', null, app); sec.id = 'g-' + S.id;
  el('h2', null, S.title, sec); el('p', 'mute', S.blurb, sec);
  const all = []; for (const item of S.items) for (const [id, v] of expand(item)) { if (!all.some(([a, b]) => a === id && b === v)) all.push([id, v]); placed.add(id); }
  const bar = el('div', 'row', null, sec); const pa = el('button', 'all', `Play all ${all.length}, one after the other`, bar); pa.onclick = () => sequence(all);
  const grid = el('div', 'cards', null, sec);
  for (const [id, v] of all) card(grid, id, v);
}
{ const rest = IDS.filter((id) => !placed.has(id)); // nothing is left off the page: a sound that no group names appears here
  if (rest.length) { const sec = el('section', 'grp', null, app); el('h2', null, 'Everything else', sec); const grid = el('div', 'cards', null, sec); for (const id of rest) for (const v of variantsOf(id)) card(grid, id, v); } }

// ---- gain beside loss
{ const sec = el('section', 'grp', null, app); el('h2', null, 'Gain and loss, side by side (A then B)', sec); el('p', 'mute', 'Each pair is played A, a pause, B. The loss twin should be lower, darker and no louder.', sec);
  const row = el('div', 'row', null, sec);
  for (const [a, b] of PAIRS) { const [ia, va] = split(a), [ib, vb] = split(b), btn = el('button', 'pair', `${a}  then  ${b}`, row); btn.onclick = async () => { const t = ++seqToken; hear(ia, va); await sleep(Math.max(500, RECIPES[ia].dur * 1000) + 300); if (t === seqToken) hear(ib, vb); }; } }
// ---- ladders
{ const sec = el('section', 'grp', null, app); el('h2', null, 'Ladders, smallest first', sec); el('p', 'mute', 'Bigger is brighter, longer and fuller; each step should be heard as a step.', sec);
  const row = el('div', 'row', null, sec);
  for (const lad of LADDERS) { const btn = el('button', 'pair', lad.map((k) => k.split('#')[1]).join(' > ') + '   (' + lad[0].split('#')[0] + ')', row); btn.onclick = () => sequence(lad.map(split), 250); } }
// ---- every timbre of a pooled sound
{ const sec = el('section', 'grp', null, app); el('h2', null, 'Pool members: each timbre of the frequent sounds', sec); el('p', 'mute', 'In the game one of these plays at random, never the same one twice in a row. Here you can hear each by name.', sec);
  const row = el('div', 'row', null, sec);
  for (const id of IDS) { const e = RECIPES[id]; if (!e.pool) continue; for (const v of variantsOf(id)) for (let k = 0; k < e.pool; k++) { const b = el('button', null, `${id} / ${v} / member ${k + 1}`, row); b.dataset.tier = tierOf(id, v); b.onclick = () => hear(id, v, { poolIndex: k }); } } }
// ---- the repair dial tone
{ const sec = el('section', 'grp', null, app); el('h2', null, 'Repair dial tone', sec); el('p', 'mute', 'The marker\'s place is the pitch (low left, high right); inside the green zone (40 to 60%) the tone gains an octave and a shimmer and rises 3 dB.', sec);
  const row = el('div', 'row', null, sec); const s = el('input', null, null, row); s.type = 'range'; s.min = 0; s.max = 100; s.value = 20; s.setAttribute('aria-label', 'Marker place');
  const on = el('button', null, 'Start the tone', row), off = el('button', null, 'Stop', row);
  on.onclick = () => { audio.unlock(); sync(); audio.dial.start(); audio.dial.update(s.value / 100, 0.4, 0.6); };
  s.oninput = () => audio.dial.update(s.value / 100, 0.4, 0.6); off.onclick = () => audio.dial.stop(); }

// ---- the collector: a recorded burst goes through the resolver, which makes at most two sentences of it
const bursts = {
  'a sale that levels you up and finishes a quest': () => { audio.request('level.up', { meta: { level: 3 } }); audio.request('quest.complete'); audio.request('sale.win', { variant: 'w', with: [['cash.in', { size: 'm', gainDb: -4 }], ['streak', { params: { n: 3 } }]] }); },
  'a sale with an xl coin that levels you up': () => { audio.request('sale.win', { variant: 'w', with: [['cash.in', { size: 'xl', gainDb: -4 }], ['streak', { params: { n: 3 }, gainDb: 5 }]] }); audio.request('level.up', { meta: { level: 3 } }); },
  'five levels in one go': () => { for (let i = 1; i <= 5; i++) audio.request('level.up', { meta: { level: i } }); },
  'four Codex pages and an achievement': () => { for (let i = 0; i < 4; i++) audio.request('codex.unlock'); audio.request('achievement', { variant: 'rare' }); },
  'a margin call during a fanfare': () => { audio.request('milestone', { variant: 'm2' }); setTimeout(() => audio.request('alert.margin-call'), 200); },
  'a busy minute': () => { audio.request('sale.pioneer', { variant: 'p', with: [['cash.in', { size: 'l' }]] }); audio.request('level.up', { meta: { level: 5 } }); audio.request('achievement', { variant: 'epic' }); audio.request('daily.done'); },
};
{ const sec = el('section', 'grp', null, app); el('h2', null, 'Bursts through the collector', sec); const row = el('div', 'row', null, sec);
  for (const [name, fn] of Object.entries(bursts)) { const b = el('button', null, name, row); b.onclick = () => { audio.unlock(); sync(); audio.setEnv({ lastPress: performance.now() }); fn(); }; } }

// ---- a typical minute, through the real wiring at 1x or 4x
{ const sec = el('section', 'grp', null, app); el('h2', null, 'A typical minute of play', sec);
  el('p', 'mute', 'About 40 events (clicks, steps, a sale that levels you up, a pool sale, the day, freight, a shock and its warning, a hire, a pioneer sale with a milestone...) replayed through the real tables and the real collector. Listen for repetition, for anything that stands at the tick rate, and for a moment that is buried.', sec);
  const row = el('div', 'row', null, sec); let timers = [];
  const stop = () => { for (const t of timers) clearTimeout(t); timers = []; };
  const run = (calls) => { for (const [m, id, o] of calls) { if (m === 'countUp') audio.countUp(o ?? 0); else if (m === 'play') audio.play(id, o); else audio.request(id, o); } };
  const play = (speed) => {
    stop(); audio.unlock(); sync(); const st = newWireState(); audio.setEnv({ speed, paused: false, netWorth: 900 });
    const hooks = { now: () => performance.now(), netWorth: () => 900, pan: () => 0, loansLeft: () => 1, cost: () => 0, poolDelayed: () => false };
    for (const [at, kind, p] of MINUTE) timers.push(setTimeout(() => {
      try {
        if (kind === 'control') { audio.touch(); const c = controlFor(p); if (c) run([c]); } else if (kind === 'event') run(eventCalls(p, st, hooks)); else if (kind === 'note') run(noteCalls(p, st, hooks)); else if (kind === 'ui') run(uiCalls({ type: 'ui', ...p }, st, hooks));
      } catch (e) { console.warn('minute:', e); }
    }, at * 1000 / speed));
    $('state').textContent = `engine: ${audio.state}; playing a minute at ${speed}x`;
  };
  el('button', null, 'Play the minute at 1x', row).onclick = () => play(1); el('button', null, 'Play it at 4x', row).onclick = () => play(4); el('button', null, 'Stop the minute', row).onclick = () => { stop(); status(); }; }

// ---- the ambient bed: pick a district, then night, rain and wealth
{ const sec = el('section', 'grp', null, app); el('h2', null, 'Ambient beds (turn Ambient on in the bar)', sec); const row = el('div', 'row', null, sec);
  const st = { theme: 'scrap', tier: 1, night: 0, rain: false, surge: false, tariff: false, paused: false, speed: 1 };
  const push = () => { audio.unlock(); sync(); audio.ambient({ ...st }); };
  for (const id of BED_IDS) { const b = el('button', null, 'bed ' + id, row); b.onclick = () => { st.theme = id; push(); }; }
  const row2 = el('div', 'row', null, sec);
  for (const [label, fn] of [['night', () => { st.night = st.night ? 0 : 1; }], ['rain', () => { st.rain = !st.rain; }], ['tariff', () => { st.tariff = !st.tariff; }], ['wealth tier 3', () => { st.tier = st.tier >= 3 ? 1 : 3; }], ['wealth tier 4', () => { st.tier = st.tier >= 4 ? 1 : 4; }]]) { const b = el('button', null, label, row2); b.onclick = () => { fn(); push(); }; }
  const row3 = el('div', 'row', null, sec);
  for (const o of ONE_SHOTS) { const b = el('button', null, o.id, row3); b.title = o.recipe; b.onclick = () => { audio.unlock(); sync(); audio.playOneShot?.(o.id); }; }
}
// ---- the meter
const meter = $('meter').firstElementChild, dbEl = $('db'), buf = new Float32Array(1024);
let peakHold = -99;
function tick() {
  const an = audio.meter?.();
  if (an) { an.getFloatTimeDomainData(buf); let pk = 0; for (const v of buf) pk = Math.max(pk, Math.abs(v)); const db = 20 * Math.log10(Math.max(1e-6, pk)); peakHold = Math.max(db, peakHold - 0.8); meter.style.width = Math.max(0, Math.min(100, (peakHold + 60) / 60 * 100)) + '%'; dbEl.textContent = (peakHold < -59 ? '-inf' : peakHold.toFixed(1)) + ' dB'; $('meter').setAttribute('aria-valuenow', Math.round(peakHold)); }
  requestAnimationFrame(tick);
}
if (!new URLSearchParams(location.search).has('check')) requestAnimationFrame(tick);
window.audioAudition = { audio, settings };
