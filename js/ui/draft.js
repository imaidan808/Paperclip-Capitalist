// The Background draft (docs/V2_DESIGN.md sections 2 and 3). Everyone starts with one paperclip and $0; the only difference between players is the
// build: two of twelve Backgrounds and one specialty. This file is two layers:
//   1. pure: draftInit, draftReduce, draftChoice, summaryOf, suggestPair and the HTML builders (draftHTML and its parts). No DOM, so Node tests them.
//   2. mountDraft: wires the form (keyboard, live announcements, focus) and hands the finished choice to the router.
import { PERKS, PERK_IDS, perkMods, SKILLS } from '../config.js';
import { PERK_PAIRS } from '../data/perks.js';
import { hash } from '../rng.js';
import { $, $$, esc, setHTML, delegate, announce } from './common.js';

export const MAX_PICKS = 2;
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const cleanIds = (ids) => [...new Set((Array.isArray(ids) ? ids : []).filter((id) => own(PERKS, id)))].slice(0, MAX_PICKS);
const finite = (x) => (Number.isFinite(x) ? x : 0);
const list = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---------------------------------------------------------------- what a build is good and bad at
// Ten plain-language traits, each a weighted sum of the aggregated mods (perkMods). The weights say roughly how much a mod matters in play; they are
// not balance numbers. A trait at +0.10 or more reads as a strength, at -0.10 or less as a weakness; mods that pull the same way net out.
const TRAITS = [
  { id: 'buyers', name: 'buyer flow', fn: (m) => (m.leadMult - 1) + (m.leadBudget - 1) + m.loyalty + 0.6 * m.trendBuyers + (m.digitalBuyers ? 0.25 : 0) - 0.6 * (1 - m.farLeadMult) },
  { id: 'prices', name: 'selling prices', fn: (m) => (m.pitchMult - 1) + (m.trendMult - 1) + (m.digitalMult - 1) + 0.08 * m.haggleAssist - 0.08 * m.haggleHandicap },
  { id: 'sourcing', name: 'stock costs', fn: (m) => 0.12 * m.opsBonus + (1 - m.repairMult) + m.brokenDiscount + m.lotDiscount + 0.6 * m.lotDiscountGray + 0.8 * m.lotRefresh },
  { id: 'steady', name: 'steady demand', fn: (m) => -2 * m.volatility - 1.5 * m.scamRate - (m.burnout ? 0.1 : 0) - 0.005 * m.flopRep },
  { id: 'costs', name: 'running costs', fn: (m) => (1 - m.overheadMult) - (m.managerCost - 1) - 3 * finite(m.familyTax?.rate) - 2 * finite(m.garnish?.rate) - 8 * finite(m.subscription?.rate) },
  { id: 'credit', name: 'bank credit', fn: (m) => -m.spreadAdj + 2 * finite(m.circle?.pct) + 0.1 * m.fintechBonus - 0.5 * (m.bankMinNW / 10000) },
  { id: 'shocks', name: 'risk cover', fn: (m) => m.shockSoften + 0.8 * finite(m.bailout?.fraction) + 0.15 * m.fineWaive - 0.6 * (m.auditMult - 1) - 0.6 * (m.fineMult - 1) },
  { id: 'reach', name: 'far markets', fn: (m) => (1 - m.freightMult) + m.freightSpeed + 1.5 * m.intlBonus },
  { id: 'learning', name: 'learning speed', fn: (m) => 1.2 * (m.xpMult - 1) - (m.noSpecialty ? 0.12 : 0) },
  { id: 'insight', name: 'reading the market', fn: (m) => (m.radar ? 0.3 : 0) + (m.mentor ? 0.2 : 0) + (m.fakeDetect ? 0.2 : 0) + 0.06 * m.inspectBonus + 0.1 * m.probeBonus },
];
export const TRAIT_EDGE = 0.1;

/** Score of every trait for a set of Backgrounds (0, 1 or 2 ids). Always finite numbers. */
export function traitScores(ids) {
  const m = perkMods(cleanIds(ids));
  return TRAITS.map((t) => ({ id: t.id, name: t.name, score: finite(t.fn(m)) }));
}

/** "Strong on X and Y, weak on Z." derived from the mods, never hand-written per pair. */
export function summaryOf(ids) {
  const picks = cleanIds(ids);
  if (!picks.length) return { strong: [], weak: [], text: 'Pick two Backgrounds to see what your build is good and bad at.' };
  const sc = traitScores(picks);
  const strong = sc.filter((t) => t.score >= TRAIT_EDGE).sort((a, b) => b.score - a.score).slice(0, 2).map((t) => t.name);
  const weak = sc.filter((t) => t.score <= -TRAIT_EDGE).sort((a, b) => a.score - b.score).slice(0, 2).map((t) => t.name);
  let text;
  if (strong.length && weak.length) text = `Strong on ${list(strong)}, weak on ${list(weak)}.`;
  else if (strong.length) text = `Strong on ${list(strong)}, with no clear weakness.`;
  else if (weak.length) text = `No standout strength, weak on ${list(weak)}.`;
  else text = 'An even build: no standout strength and no clear weakness.';
  return { strong, weak, text };
}

// ---------------------------------------------------------------- the suggestion
let BALANCED = null;
/** The pairs where one Background makes up for a weak spot of the other, most complementary first (the best 20 of the 66). */
function balancedPairs() {
  if (BALANCED) return BALANCED;
  const one = Object.fromEntries(PERK_IDS.map((id) => [id, traitScores([id]).map((t) => t.score)]));
  const rows = PERK_PAIRS.map((pair) => {
    const [A, B] = pair.map((id) => one[id]);
    let covered = 0;
    A.forEach((x, i) => { if (x <= -TRAIT_EDGE && B[i] >= TRAIT_EDGE) covered++; if (B[i] <= -TRAIT_EDGE && x >= TRAIT_EDGE) covered++; });
    const sc = traitScores(pair).map((t) => t.score);
    return { pair, covered, left: sc.reduce((a, x) => a + Math.min(0, x), 0), strong: sc.filter((x) => x >= TRAIT_EDGE).length };
  }).filter((r) => r.covered > 0);
  rows.sort((a, b) => b.covered - a.covered || b.left - a.left || b.strong - a.strong || a.pair.join().localeCompare(b.pair.join()));
  BALANCED = rows.slice(0, 20).map((r) => r.pair);
  return BALANCED;
}
/** A balanced (complementary) pair, chosen by the alias hash (no Math.random): the same alias and count always give the same pair, and `n` walks the list. */
export function suggestPair(seed = '', n = 0, avoid = []) {
  const pool = balancedPairs(), start = hash(String(seed || 'founder')) % pool.length;
  const key = (p) => [...p].sort().join('+'), skip = avoid.length === MAX_PICKS ? key(avoid) : '';
  for (let i = 0; i < pool.length; i++) {
    const p = pool[(start + Math.max(0, n) + i) % pool.length];
    if (key(p) !== skip) return [...p];
  }
  return [...pool[0]];
}

// ---------------------------------------------------------------- state
export function draftInit({ handle = '', specialty = 'ops', room = null, picks = [] } = {}) {
  return { picks: cleanIds(picks), specialty: own(SKILLS, specialty) ? specialty : 'ops', handle: String(handle || '').slice(0, 20), room: room?.code ? { code: String(room.code) } : null, rerolls: 0, suggested: false, added: null, notice: '' };
}
export const noSpecialty = (picks) => !!perkMods(cleanIds(picks)).noSpecialty;

/** Pure reducer: (state, action) -> new state. Actions: toggle {id}, drop {id}, clear, set {picks}, specialty {id}, handle {value}, reroll, submit. */
export function draftReduce(state, a) {
  const s = { ...state, picks: [...state.picks], notice: '' };
  switch (a?.type) {
    case 'toggle': {
      if (!own(PERKS, a.id)) return state;
      if (s.picks.includes(a.id)) { s.picks = s.picks.filter((x) => x !== a.id); s.added = null; s.suggested = false; return s; }
      if (s.picks.length >= MAX_PICKS) { s.notice = `You can hold ${MAX_PICKS === 2 ? 'two' : MAX_PICKS} Backgrounds. Remove one first (${list(s.picks.map((id) => PERKS[id].name))}).`; return s; }
      s.picks.push(a.id); s.added = a.id; s.suggested = false; return s;
    }
    case 'drop': s.picks = s.picks.filter((x) => x !== a.id); s.added = null; s.suggested = false; return s;
    case 'clear': s.picks = []; s.added = null; s.suggested = false; return s;
    case 'set': s.picks = cleanIds(a.picks); s.added = null; return s;
    case 'specialty': if (own(SKILLS, a.id)) s.specialty = a.id; return s;
    case 'handle': s.handle = String(a.value ?? '').slice(0, 20); return s;
    case 'reroll': {
      s.picks = suggestPair(s.handle || s.room?.code || 'founder', s.rerolls, s.picks);
      s.rerolls = s.rerolls + 1; s.suggested = true; s.added = null; return s;
    }
    case 'submit': if (s.picks.length < MAX_PICKS) s.notice = `Pick ${plural(MAX_PICKS - s.picks.length, 'more Background')} to begin.`; return s;
    default: return state;
  }
}
/** What Begin hands to Session.startGame. `ok` is false until two Backgrounds are chosen. */
export function draftChoice(state) {
  const picks = cleanIds(state.picks), none = noSpecialty(picks);
  return { ok: picks.length === MAX_PICKS, perks: picks, specialty: none ? undefined : state.specialty, handle: String(state.handle || '').trim().slice(0, 20) };
}
/** The sentence read out after a change (and shown as the build's count). */
export function statusText(state) {
  const n = state.picks.length, names = list(state.picks.map((id) => PERKS[id].name));
  const head = !n ? `0 of ${MAX_PICKS} Backgrounds chosen.` : n < MAX_PICKS ? `${n} of ${MAX_PICKS} Backgrounds chosen: ${names}. Pick one more.` : `Your build is complete: ${names}.`;
  return (state.notice ? state.notice + ' ' : '') + head + (n ? ' ' + summaryOf(state.picks).text : '');
}

// ---------------------------------------------------------------- HTML (pure)
const lineHTML = (kind, text) => `<span class="dr-line dr-${kind === '+' ? 'plus' : 'minus'}"><b aria-hidden="true">${kind}</b><span class="dr-t"><span class="sr">${kind === '+' ? 'Strength' : 'Cost'}: </span>${esc(text)}</span></span>`;

export function cardHTML(id, st) {
  const p = PERKS[id], on = st.picks.includes(id);
  return `<label class="dr-card" for="dr-in-${id}" data-id="${id}" data-on="${on ? 1 : 0}">
    <input type="checkbox" class="dr-in" id="dr-in-${id}" name="perk" value="${id}" data-change="pick" data-fid="pk-${id}" aria-labelledby="dr-nm-${id}" aria-describedby="dr-ds-${id}"${on ? ' checked' : ''}>
    <span class="dr-top"><span class="dr-ic" aria-hidden="true">${p.icon}</span><b class="dr-nm" id="dr-nm-${id}">${esc(p.name)}</b><span class="dr-box" aria-hidden="true"></span></span>
    <span class="dr-body" id="dr-ds-${id}"><em class="dr-basis">${esc(p.basis)}</em>${lineHTML('+', p.strength)}${lineHTML('-', p.cost)}</span>
  </label>`;
}

export function trayHTML(st) {
  const slots = [0, 1].map((i) => {
    const id = st.picks[i];
    if (!id) return `<li class="dr-slot dr-empty"><span class="dr-slotn" aria-hidden="true">${i + 1}</span><span class="dr-slotb"><b>Open slot</b><span class="small mute">Pick a Background from the cards.</span></span></li>`;
    const p = PERKS[id];
    return `<li class="dr-slot dr-full${st.added === id ? ' popin' : ''}"><span class="dr-ic" aria-hidden="true">${p.icon}</span><span class="dr-slotb"><b>${esc(p.name)}</b>${lineHTML('+', p.strength)}${lineHTML('-', p.cost)}</span><button type="button" class="btn ghost sm" data-act="drop" data-id="${id}" data-fid="drop-${id}" aria-label="Remove ${esc(p.name)} from your build">Remove</button></li>`;
  }).join('');
  const sum = summaryOf(st.picks), done = st.picks.length === MAX_PICKS;
  return `<h2 id="dr-tray-h">Your build</h2>
    <ol class="dr-slots" role="list" aria-labelledby="dr-tray-h">${slots}</ol>
    <p class="dr-sum"><b class="gold">${done ? 'In short' : st.picks.length ? 'So far' : 'In short'}</b> ${esc(sum.text)}</p>
    <div class="row"><button type="button" class="btn ghost sm" data-act="reroll" data-fid="dr-reroll">Reroll suggestion</button>${st.picks.length ? '<button type="button" class="btn ghost sm" data-act="clear" data-fid="dr-clear">Clear</button>' : ''}</div>
    <p class="small mute dr-why">${st.suggested ? 'Suggested for balance: one Background makes up for a weak spot of the other. Keep it or swap either card.' : 'Not sure? A suggestion is a balanced pair, picked from your alias, not at random.'}</p>`;
}

export function specHTML(st) {
  const off = noSpecialty(st.picks), who = st.picks.map((id) => PERKS[id]).find((p) => p.mods.noSpecialty);
  const why = off && who
    ? `${esc(who.name)} has no specialty (${esc(who.cost.split(':')[0].toLowerCase())}), so all three skills start at level 1. Your choice is kept in case you swap that Background out.`
    : 'One skill starts at level 3 and the other two at level 1. Every level you earn gives a skill point to raise any of them.';
  const cards = Object.values(SKILLS).map((k) => `<label class="card pick dr-skill"><input type="radio" name="spec" value="${k.id}" data-change="spec" data-fid="sp-${k.id}"${st.specialty === k.id && !off ? ' checked' : ''}${off ? ' disabled' : ''}> <b>${esc(k.name)}</b><span class="small mute dr-sd">${esc(k.blurb)}</span></label>`).join('');
  return `<fieldset class="dr-spec"${off ? ' disabled' : ''} aria-describedby="dr-spec-why"><legend>Specialty</legend><p class="small mute" id="dr-spec-why">${why}</p><div class="dr-skills">${cards}</div></fieldset>`;
}

export function actionsHTML(st) {
  const left = MAX_PICKS - st.picks.length, ok = left === 0;
  const chip = (id) => `<span aria-hidden="true">${PERKS[id].icon}</span> ${esc(PERKS[id].name)}`;
  const text = ok ? `Ready: ${st.picks.map(chip).join(' + ')}. You start with one paperclip and $0.`
    : `${st.picks.length ? chip(st.picks[0]) + ' chosen. ' : ''}Pick ${plural(left, 'more Background')} to begin.`;
  return `<span class="small ${ok ? 'green' : 'mute'} dr-need" id="dr-need">${text}</span>
    ${st.notice ? `<span class="small gold dr-notice">${esc(st.notice)}</span>` : ''}
    <span class="grow"></span>
    <button class="btn ghost" type="button" data-act="back" data-fid="dr-back">Back</button>
    <button class="btn big" type="submit" id="dr-begin" data-fid="dr-begin" aria-disabled="${ok ? 'false' : 'true'}" aria-describedby="dr-need">Begin</button>`;
}

/** The whole screen as one string. Parts are rebuilt by mountDraft without touching the cards or the alias field (typing is never interrupted). */
export function draftHTML(st) {
  const n = st.picks.length;
  return `<form class="panel dr" id="sf" novalidate aria-labelledby="dr-h">
    <header class="dr-head">
      <h1 id="dr-h" tabindex="-1">Draft your build</h1>
      <p class="dr-lede"><b class="gold">Everyone starts the same: one paperclip and $0.</b> The only difference between you and any other founder is the build you choose here, so draft the two Backgrounds that fit how you want to play. Each one has a real-world basis, a real strength and a real cost.</p>
      ${st.room ? `<div class="callout">Joining room <b class="mono">${esc(st.room.code)}</b>. Your run starts on the instructor's clock.</div>` : ''}
    </header>
    <div class="dr-layout">
      <div class="dr-main">
        <div class="dr-alias"><label for="handle">Alias <span class="mute">(a nickname, never your real name; your instructor sees only this and a random Founder ID)</span></label>
          <input id="handle" maxlength="20" autocomplete="off" spellcheck="false" value="${esc(st.handle)}" placeholder="e.g. PennyPincher" data-input="handle"></div>
        <fieldset class="dr-pool"><legend><span class="dr-lg">Pick two Backgrounds</span> <span class="mono small mute" id="dr-count">${n} of ${MAX_PICKS} chosen</span></legend>
          <div class="dr-grid" data-full="${n >= MAX_PICKS ? 1 : 0}">${PERK_IDS.map((id) => cardHTML(id, st)).join('')}</div>
        </fieldset>
        <div id="dr-spec">${specHTML(st)}</div>
      </div>
      <div class="dr-side"><section class="dr-tray" id="dr-tray" aria-label="Your build">${trayHTML(st)}</section></div>
    </div>
    <div class="dr-actions" id="dr-actions">${actionsHTML(st)}</div>
  </form>`;
}

// ---------------------------------------------------------------- the live screen
/** Mounts the draft into `root`. `onBegin({ perks, specialty, handle })` is called once; `onBack()` returns to the title. */
export function mountDraft(root, S, { room = null, onBegin, onBack } = {}) {
  let st = draftInit({ handle: S.handle, room });
  let begun = false;
  root.innerHTML = draftHTML(st);
  const form = $('#sf', root), grid = $('.dr-grid', root), tray = $('#dr-tray', root), spec = $('#dr-spec', root), bar = $('#dr-actions', root);

  function paint() {
    for (const id of PERK_IDS) {
      const inp = $(`#dr-in-${id}`, root), on = st.picks.includes(id);
      inp.checked = on;
      inp.closest('.dr-card').dataset.on = on ? '1' : '0';
    }
    grid.dataset.full = st.picks.length >= MAX_PICKS ? '1' : '0';
    $('#dr-count', root).textContent = `${st.picks.length} of ${MAX_PICKS} chosen`;
    setHTML(tray, trayHTML(st));
    setHTML(spec, specHTML(st));
    setHTML(bar, actionsHTML(st));
  }
  function send(action, say = true) {
    st = draftReduce(st, action);
    paint();
    if (say) announce(st.notice || statusText(st), !!st.notice);
  }

  const acts = {
    pick(el) { send({ type: 'toggle', id: el.value }); },
    spec(el) { send({ type: 'specialty', id: el.value }, false); },
    handle(el) { st = draftReduce(st, { type: 'handle', value: el.value }); },
    drop(el) { send({ type: 'drop', id: el.dataset.id }); $('[data-fid="dr-reroll"]', root)?.focus({ preventScroll: true }); },
    clear() { send({ type: 'clear' }); $('[data-fid="dr-reroll"]', root)?.focus({ preventScroll: true }); },
    reroll() { send({ type: 'reroll' }); },
    back() { onBack?.(); },
  };
  delegate(root, acts);

  // Enter toggles the focused card (it would otherwise submit the form); arrows move between cards like a hand of cards.
  form.addEventListener('keydown', (e) => {
    const t = e.target;
    if (!t?.matches?.('.dr-in')) return;
    if (e.key === 'Enter') { e.preventDefault(); send({ type: 'toggle', id: t.value }); return; }
    const cards = $$('.dr-in', grid), i = cards.indexOf(t);
    const cols = Math.max(1, cards.filter((c) => c.closest('.dr-card').offsetTop === cards[0].closest('.dr-card').offsetTop).length);
    const to = { ArrowRight: i + 1, ArrowDown: i + cols, ArrowLeft: i - 1, ArrowUp: i - cols, Home: 0, End: cards.length - 1 }[e.key];
    if (to != null && cards[to]) { e.preventDefault(); cards[to].focus(); }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (begun) return;
    const c = draftChoice(st);
    if (!c.ok) {
      send({ type: 'submit' });
      (grid.querySelector('.dr-in:not(:checked)') || grid.querySelector('.dr-in'))?.focus();
      return;
    }
    begun = true;
    $('#dr-begin', root)?.setAttribute('aria-busy', 'true');
    onBegin?.({ perks: c.perks, specialty: c.specialty, handle: c.handle });
  });
  return { destroy() {}, state: () => st };
}
