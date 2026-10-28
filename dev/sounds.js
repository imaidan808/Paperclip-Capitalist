// The audition page (dev only): every sound on a button, the master controls, a live level meter, the collector's bursts and the ambient beds. It runs the real engine.
import { audio, bindSettings, migrateAudio } from '../js/audio/index.js';
import { RECIPES, IDS, variantsOf, tierOf } from '../js/audio/recipes.js';
import { BED_IDS, ONE_SHOTS } from '../js/audio/ambient.js';

const settings = { audio: migrateAudio({}, location.search) };
bindSettings(settings);
const $ = (id) => document.getElementById(id);
const A = () => settings.audio;
const sync = () => { Object.assign(A(), { master: +$('vol').value, mute: $('mute').checked, ui: $('ui').checked, game: $('game').checked, ambient: $('amb').checked, ambientLevel: +$('ambvol').value, quiet: $('quiet').checked }); audio.sync(); };
for (const id of ['vol', 'mute', 'ui', 'game', 'amb', 'ambvol', 'quiet']) $(id).addEventListener('input', () => { audio.unlock(); sync(); });
const press = () => audio.unlock();
document.addEventListener('pointerdown', press); document.addEventListener('keydown', press);
const status = () => { $('state').textContent = 'engine: ' + audio.state; }; audio.on(status); status();

const app = $('app');
const groups = {};
for (const id of IDS) (groups[id.split('.')[0]] ||= []).push(id);
for (const [g, ids] of Object.entries(groups)) {
  const h = document.createElement('h2'); h.textContent = g; app.append(h);
  const row = document.createElement('div'); row.className = 'row'; app.append(row);
  for (const id of ids) for (const v of variantsOf(id)) {
    const b = document.createElement('button'); b.textContent = id + (variantsOf(id).length > 1 ? ' / ' + v : ''); b.dataset.tier = tierOf(id, v); b.title = RECIPES[id].meaning;
    b.onclick = () => { audio.unlock(); sync(); audio.play(id, { variant: v, noCooldown: true, player: true }); };
    row.append(b);
  }
}
// the collector: a recorded burst goes through the resolver, which makes at most two sentences of it
const bursts = {
  'a sale that levels you up and finishes a quest': () => { audio.request('level.up', { meta: { level: 3 } }); audio.request('quest.complete'); audio.request('sale.win', { variant: 'w', with: [['cash.in', { size: 'm', gainDb: -4 }], ['streak', { params: { n: 3 } }]] }); },
  'five levels in one go': () => { for (let i = 1; i <= 5; i++) audio.request('level.up', { meta: { level: i } }); },
  'four Codex pages and an achievement': () => { for (let i = 0; i < 4; i++) audio.request('codex.unlock'); audio.request('achievement', { variant: 'rare' }); },
  'a margin call during a fanfare': () => { audio.request('milestone', { variant: 'm2' }); setTimeout(() => audio.request('alert.margin-call'), 200); },
  'a busy minute': () => { audio.request('sale.pioneer', { variant: 'p', with: [['cash.in', { size: 'l' }]] }); audio.request('level.up', { meta: { level: 5 } }); audio.request('achievement', { variant: 'epic' }); audio.request('daily.done'); },
};
{ const h = document.createElement('h2'); h.textContent = 'bursts through the collector'; app.append(h); const row = document.createElement('div'); row.className = 'row'; app.append(row);
  for (const [name, fn] of Object.entries(bursts)) { const b = document.createElement('button'); b.textContent = name; b.onclick = () => { audio.unlock(); sync(); audio.setEnv({ lastPress: performance.now() }); fn(); }; row.append(b); } }
// the ambient bed: pick a district, then night, rain and wealth
{ const h = document.createElement('h2'); h.textContent = 'ambient beds (turn Ambient on in the bar)'; app.append(h); const row = document.createElement('div'); row.className = 'row'; app.append(row);
  const st = { theme: 'scrap', tier: 1, night: 0, rain: false, surge: false, tariff: false, paused: false, speed: 1 };
  const push = () => { audio.unlock(); sync(); audio.ambient({ ...st }); };
  for (const id of BED_IDS) { const b = document.createElement('button'); b.textContent = 'bed ' + id; b.onclick = () => { st.theme = id; push(); }; row.append(b); }
  const row2 = document.createElement('div'); row2.className = 'row'; app.append(row2);
  for (const [label, fn] of [['night', () => { st.night = st.night ? 0 : 1; }], ['rain', () => { st.rain = !st.rain; }], ['tariff', () => { st.tariff = !st.tariff; }], ['wealth tier 3', () => { st.tier = st.tier >= 3 ? 1 : 3; }], ['wealth tier 4', () => { st.tier = st.tier >= 4 ? 1 : 4; }]]) { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { fn(); push(); }; row2.append(b); }
  const row3 = document.createElement('div'); row3.className = 'row'; app.append(row3);
  for (const o of ONE_SHOTS) { const b = document.createElement('button'); b.textContent = o.id; b.title = o.recipe; b.onclick = () => { audio.unlock(); sync(); audio.playOneShot?.(o.id); }; row3.append(b); }
}
// the meter
const meter = $('meter').firstElementChild, dbEl = $('db'), buf = new Float32Array(1024);
let peakHold = -99;
function tick() {
  const an = audio.meter?.();
  if (an) { an.getFloatTimeDomainData(buf); let pk = 0; for (const v of buf) pk = Math.max(pk, Math.abs(v)); const db = 20 * Math.log10(Math.max(1e-6, pk)); peakHold = Math.max(db, peakHold - 0.8); meter.style.width = Math.max(0, Math.min(100, (peakHold + 60) / 60 * 100)) + '%'; dbEl.textContent = (peakHold < -59 ? '-inf' : peakHold.toFixed(1)) + ' dB'; $('meter').setAttribute('aria-valuenow', Math.round(peakHold)); }
  requestAnimationFrame(tick);
}
if (!new URLSearchParams(location.search).has('check')) requestAnimationFrame(tick);
window.audioAudition = { audio, settings };
