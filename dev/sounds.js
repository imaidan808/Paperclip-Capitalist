// The audition page (dev only), for the author's ears. Every sound of docs/AUDIO.md on a button, grouped by what it MEANS (gain, loss, neutral, warning, refusal, size, progress, the Deal Room...), each
// with its tier as a word, its meaning and its trigger in plain sight. Beside the buttons: gain and loss side by side, the size ladders in sequence, every timbre of a pooled sound, the repair dial
// tone on a slider, the collector's bursts, a minute of ordinary play replayed through the real wiring at 1x or 4x, and the ambient beds. It runs the real engine.
import { audio, bindSettings, migrateAudio } from '../js/audio/index.js';
import { RECIPES, IDS, variantsOf, tierOf } from '../js/audio/recipes.js';
import { BED_IDS, ONE_SHOTS } from '../js/audio/ambient.js';
import { eventCalls, noteCalls, uiCalls, controlFor, newWireState } from '../js/audio/wire.js';
import { explainDrop, ambientWhy, oneShotWhy, dialWhy, pressBurst, describeMinute, blindDeck, blindScore, BLIND_KINDS } from '../js/audio/audition.js';
import { SECTIONS, PAIRS, LADDERS, MINUTE } from './sections.js';

const settings = { audio: migrateAudio({}, location.search) };
bindSettings(settings);
const $ = (id) => document.getElementById(id);
const A = () => settings.audio;
const sync = () => { Object.assign(A(), { master: +$('vol').value, mute: $('mute').checked, ui: $('ui').checked, game: $('game').checked, worldTicks: $('world').checked, ambient: $('amb').checked, ambientLevel: +$('ambvol').value, quiet: $('quiet').checked, dial: true }); audio.sync(); };
for (const id of ['vol', 'mute', 'ui', 'game', 'world', 'amb', 'ambvol', 'quiet']) $(id).addEventListener('input', () => { audio.unlock(); sync(); });
// The listening checklist asks for two things the engine does not do: the mono fold (10.5 item 5) and the laptop speaker (the premise of the loudness models, 3.2). They sit between the end of the master
// chain (the soft clip) and the destination, so they change what is heard and nothing the engine does: the level meter still reads the chain's own output.
const route = { nodes: [], ctx: null };
function reroute() {
  const ctx = audio.context, ch = audio.chain; if (!ctx || !ch || !ch.clip) return false;
  for (const n of route.nodes) { try { n.disconnect(); } catch { /* not connected */ } }
  try { ch.clip.disconnect(ctx.destination); } catch { /* already apart */ }
  route.nodes = []; route.ctx = ctx;
  let tail = ch.clip;
  const add = (n) => { tail.connect(n); route.nodes.push(n); tail = n; };
  if ($('lap').checked) { // two high-pass stages (a 4th-order, 24 dB per octave) and a low-pass: what a small speaker plays of the output
    for (const q of [0.54, 1.31]) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 220; f.Q.value = q; add(f); }
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000; lp.Q.value = 0.7; add(lp);
  }
  if ($('mono').checked) { const m = ctx.createGain(); m.channelCount = 1; m.channelCountMode = 'explicit'; m.channelInterpretation = 'speakers'; add(m); } // a mono input mixes L and R to one channel, which the destination plays on both
  tail.connect(ctx.destination);
  return true;
}
for (const id of ['mono', 'lap']) $(id).addEventListener('input', () => { audio.unlock(); sync(); if (!reroute()) { $(id).checked = false; say('the audio engine is not running yet: press anywhere once, then tick this again.'); } else say($(id).checked ? (id === 'mono' ? 'output folded to mono: listen for two sounds that cancel or blur together.' : 'laptop speaker: nothing under 220 Hz and a roll-off above 9 kHz, as a small speaker plays it.') : (id === 'mono' ? 'stereo again.' : 'full range again.')); });
const press = () => audio.unlock();
document.addEventListener('pointerdown', press); document.addEventListener('keydown', press);
// What the last press said about itself: a press the engine drops (Mute, Classroom, a bus off, the world's ticks off, the reward budget...) is silent, and a page built for listening must not leave it
// to be taken for a broken button. EVERY button either sounds or says here, in words, which rule held it back (or, for Stop and Reset, what it did).
let lastWhy = '';
const status = () => { $('state').textContent = 'engine: ' + audio.state + (lastWhy ? ' \u00b7 ' + lastWhy : ''); }; audio.on(status); status();
const say = (text) => { lastWhy = text || ''; status(); }; // a plain statement, or '' to clear
const silent = (why) => say(why ? 'silent: ' + why : '');
const dropped = () => ({ ...audio.stats().dropped });
const gone = (before) => { const now = dropped(); return Object.keys(now).find((k) => now[k] > (before[k] || 0)); }; // the reason the engine counted since `before`
const world = () => ({ rs: audio._resolver, now: performance.now(), speed: audio.env.speed, voices: audio._voices, sandbox: audio.env.sandbox });
/** After a press: if nothing was heard, say which rule held it back, on the status line and on the card. */
function said(heard, id, before, mark) {
  lastWhy = heard ? '' : 'silent: ' + explainDrop(gone(before), A(), { id, bus: RECIPES[id]?.bus, ...world() });
  said.last = { heard, why: lastWhy };
  if (mark) { mark.classList.toggle('silent', !heard); const w = mark.querySelector('.why'); if (w) w.textContent = lastWhy; }
  status();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const el = (tag, cls, text, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.append(e); return e; };
const app = $('app');

// ---- one sound
const keyOf = (id, v) => id + '#' + v;
const split = (k) => { const i = k.indexOf('#'); return i < 0 ? [k, null] : [k.slice(0, i), k.slice(i + 1)]; };
const expand = (item) => { const [id, v] = split(item); if (!RECIPES[id]) return []; return v ? [[id, v]] : variantsOf(id).map((x) => [id, x]); };
const hear = (id, v, o = {}, mark = null) => { audio.unlock(); sync(); const before = dropped(), r = audio.play(id, { variant: v, noCooldown: true, player: true, preempt: true, ...o }); said(!!r, id, before, mark); return r; }; // preempt: a card pressed while a fanfare still rings cuts it (the game plays big moments one at a time; an audition is a listener moving from card to card, and a silent card is taken for a broken one)
/** Play a list of [id, variant] one after the other, each given the room of its own length (and a breath). */
let seqToken = 0;
/** A run of sounds one after another: each press speaks for itself while it plays, and at the end the status line says how many did not sound and why (the last one heard must not hide the ones before). */
async function sequence(list, gap = 350) {
  const token = ++seqToken; let miss = 0, why = '';
  for (const [id, v] of list) { if (token !== seqToken) return; hear(id, v); if (!said.last.heard) { miss++; why = said.last.why; } await sleep(Math.max(500, (RECIPES[id].dur || 0.5) * 1000) + gap); }
  if (token === seqToken) say(miss ? `${why} (${miss} of ${list.length} did not sound)` : '');
}
$('stop').onclick = () => { seqToken++; audio.stopAll(60); audio.dial.stop(); $('amb').checked = false; sync(); say('stopped every sound, the repair dial tone and the ambient bed (Ambient is unticked: tick it to hear a bed again).'); }; // the bed is a sound too: it kept playing under a status line that said everything had stopped
// Back to the settings of a first visit, in one press: a bar left on Mute or on the Classroom rule from an earlier test is the likeliest reason for a silent card.
$('reset').onclick = () => { for (const [id, on] of [['mute', false], ['ui', true], ['game', true], ['world', true], ['amb', false], ['quiet', false], ['mono', false], ['lap', false]]) $(id).checked = on; $('vol').value = 70; $('ambvol').value = 70; audio.unlock(); sync(); reroute(); say('settings are back to a first visit: volume 70, Interface, Game and World ticks on, Ambient off, no Classroom rule, stereo, full range.'); };

// ---- the cards: a sound with its tier (a word, not only a colour), its meaning and its trigger
/** The clause of the id's recipe that is about one variant ("on: ...; off: ..." -> the one for `on`), or '' when the recipe does not name it. */
function variantLine(e, v) {
  if (!v || !e.recipe || variantsOf(e.id).length < 2) return '';
  const seg = String(e.recipe).split(/;\s+/).find((t) => t.startsWith(v + ': ') || t.startsWith(v + ' '));
  return seg ? v + ': ' + seg.replace(/^[^:]*:\s*/, '') : '';
}
function card(parent, id, v) {
  const e = RECIPES[id], tier = tierOf(id, v), c = el('div', 'card', null, parent);
  const b = el('button', null, id + (variantsOf(id).length > 1 ? ' / ' + v : ''), c); b.dataset.tier = tier;
  b.onclick = () => hear(id, v, {}, c);
  el('span', 'chip ' + tier, tier, c);
  el('p', 'why', '', c); // filled when a press is held back
  el('div', 'meaning', e.meaning, c);
  const vl = variantLine(e, v); if (vl) el('div', 'mute', vl, c).style.fontSize = '.85rem'; // what THIS variant is (the meaning above is the id's, shared by all its variants)
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
  for (const [a, b] of PAIRS) { const [ia, va] = split(a), [ib, vb] = split(b), btn = el('button', 'pair', `${a}  then  ${b}`, row); btn.onclick = async () => { const t = ++seqToken; hear(ia, va); const first = said.last; await sleep(Math.max(500, RECIPES[ia].dur * 1000) + 300); if (t === seqToken) { hear(ib, vb); if (!first.heard && said.last.heard) say(first.why + ' (A did not sound)'); } }; } }
// ---- ladders
{ const sec = el('section', 'grp', null, app); el('h2', null, 'Ladders, smallest first', sec); el('p', 'mute', 'Bigger is brighter, longer and fuller; each step should be heard as a step.', sec);
  const row = el('div', 'row', null, sec);
  for (const lad of LADDERS) { const btn = el('button', 'pair', lad.map((k) => k.split('#')[1]).join(' > ') + '   (' + lad[0].split('#')[0] + ')', row); btn.onclick = () => sequence(lad.map(split), 250); } }
// ---- every timbre of a pooled sound
{ const sec = el('section', 'grp', null, app); el('h2', null, 'Pool members: each timbre of the frequent sounds', sec); el('p', 'mute', 'In the game one of these plays at random, never the same one twice in a row. Here you can hear each by name.', sec);
  const row = el('div', 'row', null, sec);
  for (const id of IDS) { const e = RECIPES[id]; if (!e.pool) continue; for (const v of variantsOf(id)) for (let k = 0; k < e.pool; k++) { const b = el('button', null, `${id} / ${v} / member ${k + 1}`, row); b.dataset.tier = tierOf(id, v); b.onclick = () => hear(id, v, { poolIndex: k }, b); } } }
// ---- the repair dial tone
{ const sec = el('section', 'grp', null, app); el('h2', null, 'Repair dial tone', sec); el('p', 'mute', 'The marker\'s place is the pitch (low left, high right); inside the green zone (40 to 60%) the tone gains an octave and a shimmer and rises (by up to 2.5 dB). Each note has a level of its own: the low ones are lifted over the high ones because a quiet laptop takes 9 dB more off D4 than off D6 (docs/AUDIO.md 4.5).', sec);
  const row = el('div', 'row', null, sec); const s = el('input', null, null, row); s.type = 'range'; s.min = 0; s.max = 100; s.value = 20; s.setAttribute('aria-label', 'Marker place');
  const on = el('button', null, 'Start the tone', row), off = el('button', null, 'Stop', row);
  const note = el('p', 'why', '', sec);
  on.onclick = () => { // the engine starts one tone at a time, as a game-bus voice, never in Classroom or through a mute
    audio.unlock(); sync();
    const why = dialWhy(A(), audio.state), ok = !why && (audio.dial.active || audio.dial.start());
    if (ok) audio.dial.update(s.value / 100, 0.4, 0.6);
    on.classList.toggle('silent', !ok); note.textContent = ok ? '' : 'silent: ' + (why || 'the tone did not start.');
    silent(ok ? '' : why || 'the tone did not start.');
  };
  s.oninput = () => { if (!audio.dial.active) { silent('the tone is not running: press Start the tone first.'); return; } audio.dial.update(s.value / 100, 0.4, 0.6); };
  off.onclick = () => { audio.dial.stop(); on.classList.remove('silent'); note.textContent = ''; say('the repair dial tone stopped.'); }; }

// ---- the collector: a recorded burst goes through the resolver, which makes at most two sentences of it
// Each burst is a function of `req`, the page's `audio.request` (with a fresh press it asks to skip cooldowns and to draw from the player's bucket: see pressBurst).
const bursts = {
  'a sale that levels you up and finishes a quest': (req) => { req('level.up', { meta: { level: 3 } }); req('quest.complete'); req('sale.win', { variant: 'w', with: [['cash.in', { size: 'm', gainDb: -4 }], ['streak', { params: { n: 3 } }]] }); },
  'a sale with an xl coin that levels you up': (req) => { req('sale.win', { variant: 'w', with: [['cash.in', { size: 'xl', gainDb: -4 }], ['streak', { params: { n: 3 }, gainDb: 5 }]] }); req('level.up', { meta: { level: 3 } }); },
  'five levels in one go': (req) => { for (let i = 1; i <= 5; i++) req('level.up', { meta: { level: i } }); },
  'four Codex pages and an achievement': (req) => { for (let i = 0; i < 4; i++) req('codex.unlock'); req('achievement', { variant: 'rare' }); },
  'a margin call during a fanfare': (req) => { req('milestone', { variant: 'm2' }); setTimeout(() => req('alert.margin-call'), 200); },
  'a busy minute': (req) => { req('sale.pioneer', { variant: 'p', with: [['cash.in', { size: 'l' }]] }); req('level.up', { meta: { level: 5 } }); req('achievement', { variant: 'epic' }); req('daily.done'); },
};
{ const sec = el('section', 'grp', null, app); el('h2', null, 'Bursts through the collector', sec);
  el('p', 'mute', 'Each button sends a recorded burst through the real collector, which plays at most two sentences of it. The real reward budget allows one full reward every 10 s and the big moments play one at a time, so pressed in a row the later bursts would lose their rewards: with the box ticked (the default) each press puts the budget back and waits out the last big moment; untick it to hear the budget as the game does, and the status line names what it held back.', sec);
  const fresh = el('label', null, null, sec), fb = el('input', null, null, fresh); fb.type = 'checkbox'; fb.id = 'fresh'; fb.checked = true; fresh.append(' Fresh budget before each burst');
  const row = el('div', 'row', null, sec); let chain = Promise.resolve();
  for (const [name, fn] of Object.entries(bursts)) {
    const b = el('button', null, name, row);
    b.onclick = () => { // presses queue one behind another, so two quick presses are two bursts in order, never one on top of the other
      audio.unlock(); sync();
      chain = chain.then(async () => {
        const r = await pressBurst(audio, fn, { fresh: fb.checked, a: A(), speed: 1, say });
        b.classList.toggle('silent', !r.heard.length); say(r.text);
      }).catch((e) => say('the burst failed: ' + (e && e.message)));
    };
  } }

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
    const s0 = audio.stats(), at0 = { played: { ...s0.played }, dropped: { ...s0.dropped } };
    say(`playing a minute at ${speed}x`);
    timers.push(setTimeout(() => { const s1 = audio.stats(); say(describeMinute(at0.played, at0.dropped, s1.played, s1.dropped, A(), { ...world(), speed })); }, MINUTE[MINUTE.length - 1][0] * 1000 / speed + 3000)); // when it is over: how many sounds, and what the rules held back
  };
  el('button', null, 'Play the minute at 1x', row).onclick = () => play(1); el('button', null, 'Play it at 4x', row).onclick = () => play(4); el('button', null, 'Stop the minute', row).onclick = () => { stop(); say('the minute was stopped.'); }; }

// ---- the ambient bed: pick a district, then night, rain and wealth
{ const sec = el('section', 'grp', null, app); el('h2', null, 'Ambient beds (turn Ambient on in the bar)', sec); const row = el('div', 'row', null, sec);
  const st = { theme: 'scrap', tier: 1, night: 0, rain: false, surge: false, tariff: false, paused: false, speed: 1 };
  // A bed plays only when the settings let it: Ambient ticked in the bar, no Classroom rule, no mute, a level above 0. Pressed with Ambient off a button used to do nothing and say nothing; now it is marked
  // silent and the status line says why. (A first press may find the engine still starting: the bed is looked for again after a moment before anything is claimed.)
  const push = (btn) => {
    audio.unlock(); sync(); audio.ambient({ ...st });
    const why = ambientWhy(A(), audio.state); btn.classList.toggle('silent', !!why); silent(why);
    if (why && /^The audio engine is not running/.test(why)) setTimeout(() => { const w = ambientWhy(A(), audio.state), ok = !w && audio.stats().ambient.playing; btn.classList.toggle('silent', !ok); silent(ok ? '' : w || 'the bed did not start.'); }, 450);
  };
  for (const id of BED_IDS) { const b = el('button', null, 'bed ' + id, row); b.onclick = () => { st.theme = id; push(b); }; }
  const row2 = el('div', 'row', null, sec);
  // A modifier is a switch: it says whether it is on (aria-pressed, and a style that does not depend on colour), since pressing 'night' twice is the only way back and nothing else showed which were set.
  const mods = [['night', () => { st.night = st.night ? 0 : 1; }, () => !!st.night], ['rain', () => { st.rain = !st.rain; }, () => st.rain], ['tariff', () => { st.tariff = !st.tariff; }, () => st.tariff], ['wealth tier 3', () => { st.tier = st.tier === 3 ? 1 : 3; }, () => st.tier === 3], ['wealth tier 4', () => { st.tier = st.tier === 4 ? 1 : 4; }, () => st.tier === 4]], modBtns = [];
  const paintMods = () => { for (const [b, on] of modBtns) b.setAttribute('aria-pressed', String(!!on())); };
  for (const [label, fn, on] of mods) { const b = el('button', null, label, row2); b.setAttribute('aria-pressed', 'false'); modBtns.push([b, on]); b.onclick = () => { fn(); paintMods(); push(b); }; }
  const row3 = el('div', 'row', null, sec);
  for (const o of ONE_SHOTS) {
    const b = el('button', null, o.id, row3); b.title = o.recipe;
    b.onclick = () => { audio.unlock(); sync(); const v = audio.playOneShot?.(o.id), why = oneShotWhy(A(), audio.state) || (v ? '' : 'the engine is not running yet (press anywhere once), or the tab is hidden.'); b.classList.toggle('silent', !!why); silent(why); };
  }
}
// ---- the blind round (docs/AUDIO.md 10.5 item 2): twenty unlabelled sounds, five gains, five losses, five warnings and five neutral, in a shuffled order; the listener names each, and the score on gain against loss
// (the target is 90% right) and the key to every sound come at the end. Names, tiers and meanings are not on the page while it runs.
{ const sec = el('section', 'grp', null, app); el('h2', null, 'Blind round: gain or loss?', sec);
  el('p', 'mute', 'Twenty sounds with no names: press Play, then say what it is. The target of the listening checklist is at least 90% right on gain against loss. Nothing on this page names a sound until the round is over.', sec);
  const box = el('div', 'blind', null, sec), live = el('div', null, null, box); let deck = [], answers = [], at = 0;
  const start = () => { deck = blindDeck(); answers = []; at = 0; show(); };
  const show = () => {
    live.replaceChildren();
    if (!deck.length) { const b = el('button', 'all', 'Start a round', live); b.onclick = start; return; }
    if (at >= deck.length) return finish();
    el('div', 'big', `Sound ${at + 1} of ${deck.length}`, live);
    const row = el('div', 'row', null, live), p = el('button', null, 'Play (again)', row); p.onclick = () => { const [id, v] = deck[at].key.split('#'); hear(id, v, { preempt: true }); }; p.dataset.blind = 'play';
    const row2 = el('div', 'row', null, live); row2.style.marginTop = '6px';
    for (const k of BLIND_KINDS) { const b = el('button', null, k[0].toUpperCase() + k.slice(1), row2); b.dataset.kind = k; b.onclick = () => { answers[at] = k; at++; show(); }; }
    p.focus({ preventScroll: true });
  };
  const finish = () => {
    live.replaceChildren();
    const r = blindScore(deck, answers), pc = Math.round(r.gainLoss.share * 100);
    el('div', 'big ' + (pc >= 90 ? 'good' : 'bad'), `Gain against loss: ${r.gainLoss.right} of ${r.gainLoss.of} right (${pc}%; the target is 90%). All four kinds: ${r.all.right} of ${r.all.of}.`, live);
    const t = el('table', null, null, live), hd = el('tr', null, null, t); for (const h of ['#', 'sound', 'it is', 'you said']) el('th', null, h, hd);
    r.rows.forEach((x, i) => { const tr = el('tr', x.right ? 'good' : 'bad', null, t); el('td', null, String(i + 1), tr); el('td', null, x.key, tr); el('td', null, x.kind, tr); el('td', null, x.said || '-', tr); });
    const again = el('button', 'all', 'Another round', live); again.onclick = start; again.style.marginTop = '8px';
  };
  show();
}

// ---- contents: the page is 14,000 px of cards in seventeen groups
{ const toc = $('toc'); let n = 0; for (const sec of app.querySelectorAll('section.grp')) { const h = sec.querySelector('h2'); if (!h) continue; if (!sec.id) sec.id = 'g-x' + (++n); const a = el('a', null, h.textContent.replace(/\s*\(.*$/, ''), toc); a.href = '#' + sec.id; } }
// ---- the meter
const meter = $('meter').firstElementChild, dbEl = $('db'), buf = new Float32Array(1024);
let peakHold = -99;
function tick() {
  const an = audio.meter?.();
  if (an) { an.getFloatTimeDomainData(buf); let pk = 0; for (const v of buf) pk = Math.max(pk, Math.abs(v)); const db = 20 * Math.log10(Math.max(1e-6, pk)); peakHold = Math.max(db, peakHold - 0.8); meter.style.width = Math.max(0, Math.min(100, (peakHold + 60) / 60 * 100)) + '%'; dbEl.textContent = (peakHold < -59 ? '-inf' : peakHold.toFixed(1)) + ' dB'; $('meter').setAttribute('aria-valuenow', Math.round(peakHold)); }
  requestAnimationFrame(tick);
}
if (!new URLSearchParams(location.search).has('check')) requestAnimationFrame(tick);
window.audioAudition = { audio, settings, say }; // (the tests of the page press its buttons through this)
