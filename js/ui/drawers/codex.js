// Codex drawer (docs/V2_DESIGN.md sections 8 and 12): the concepts the player has unlocked, grouped by category with a search box; locked ones are
// silhouettes that say how to unlock them. Each opens to its full page (summary, body, formula, worked example, common mistakes, a "Try it" prompt and
// related pages). A second tab lists the ten Academy lessons with a Replay button. Contract: see the header of ../shell.js.
//
// UI state on ctx.U: codexTab ('concepts' | 'academy'), codexCat, codexQ, codexOpenId, codexSeen (Set of ids the player has been shown),
// codexNew (the ids that were new when the drawer was opened; they carry the "New" chip until it is closed).
import { kv } from '../../session.js';
import { ZONES, MIL, EVENTS, ASSETS, PIPE, LOANS, CLIENTS, UPGRADES } from '../../config.js';
import { esc } from '../common.js';
import { readAcademy } from '../academy-sandbox.js';

let MISSIONS = [];
try { ({ ACADEMY: MISSIONS } = await import('../../meta/academy.js')); } catch { /* TEMPORARY: academy.js merges from its own branch; this guard goes at the merge */ }

export const CATEGORIES = ['Value', 'Markets', 'Operations', 'Finance', 'Risk', 'People', 'Strategy'];

// ------------------------------------------------------------------ pure helpers (tested)
const PHRASE = {
  pitch: 'Sell something to a buyer', buy: 'Buy a lot', 'sell-pool': 'Sell to a district pool', repair: 'Repair a broken crate', ship: 'Ship a crate to another district', hire: 'Hire a manager',
  upgrade: 'Install an upgrade', 'pipe-level': 'Level up a manager', cycle: 'Finish a manager cycle', draw: 'Take out a loan', repay: 'Repay a loan', client: 'Sign a client', audit: 'Answer an audit',
  zone: 'Open a new district', milestone: 'Reach a milestone', shock: 'Live through a market shock', p2p: 'Swap with a classmate', skill: 'Spend a skill point', level: 'Reach a new level',
  inspect: 'Inspect a lot before you buy', haggle: 'Haggle a deal', auction: 'Bid in an auction', streak: 'Win deals in a row', day: 'Play on', 'margin-call': 'Survive a margin call',
  insolvent: 'Run out of money', exit: 'Exit your company', perk: 'Use your Background',
};
const PITCH_OUT = { win: 'Win a pitch', pioneer: 'Make a pioneer pitch (a niche few others use)', herd: 'Pitch into a crowded niche', flat: 'Make a pitch that only breaks even', rejected: 'Have a pitch turned down' };
const a = (name) => (/^[aeiou]/i.test(name) ? 'an ' : 'a ') + name;

/** "Reach Pawn District", "Win a pitch": how a locked page tells you what to do, from its `unlock`. Always says district, never zone. */
export function unlockHint(unlock) {
  if (unlock === 'start') return '';
  if (!unlock || typeof unlock !== 'object' || !unlock.event) return 'Keep playing';
  const { event, match = {} } = unlock, num = (v) => (v && typeof v === 'object' ? v.gte ?? v.gt ?? v.eq : v);
  if (event === 'zone') return ZONES[match.id] ? `Reach ${ZONES[match.id].name}` : 'Open a new district';
  if (event === 'milestone') { const n = num(match.n); return MIL['m' + n] ? `Reach Milestone ${n} ($${MIL['m' + n].toLocaleString('en-US')} net worth)` : 'Reach a milestone'; }
  let base = event === 'pitch' && PITCH_OUT[match.outcome] ? PITCH_OUT[match.outcome] : PHRASE[event] || 'Keep playing';
  if (event === 'buy' && match.fake === true) base = 'Buy a counterfeit lot (it happens to everyone)';
  else if (event === 'buy' && match.cond === 'broken') base = 'Buy a broken lot';
  else if (event === 'shock') base = EVENTS[match.kind] ? `Live through ${EVENTS[match.kind].name}` : base;
  else if (event === 'hire' && PIPE[match.kind]) base = `Hire ${a(PIPE[match.kind].name)}`;
  else if (event === 'draw' && LOANS[match.prod]) base = `Draw on the ${LOANS[match.prod].name}`;
  else if (event === 'client' && CLIENTS[match.tier]) base = `Sign ${a(CLIENTS[match.tier].name)}`;
  else if (event === 'upgrade' && UPGRADES[match.id]) base = `Install ${UPGRADES[match.id].name}`;
  else if (event === 'audit') base = match.ok === true ? 'Pass an audit' : base;
  else if (event === 'auction') base = match.won === true ? 'Win an auction' : base;
  else if (event === 'haggle') base = match.role === 'buy' ? 'Haggle a price down when buying' : match.role === 'sell' ? 'Haggle a price up when selling' : base;
  else if (event === 'streak' && num(match.n)) base = `Win ${num(match.n)} deals in a row`;
  else if (event === 'level' && num(match.level)) base = `Reach level ${num(match.level)}`;
  else if (event === 'cycle' && match.net) base = 'Finish a manager cycle in profit';
  if ((event === 'pitch' || event === 'buy' || event === 'repair') && ASSETS[match.cls]) base += ` with ${a(ASSETS[match.cls].name)}`;
  return base;
}

const hay = (d) => [d.title, d.summary, d.category, ...(d.body || [])].join(' ').toLowerCase();
/** Does an unlocked page match the search words (every word must appear in its title, summary, category or body)? */
export const matchesQuery = (d, q) => { const w = String(q || '').toLowerCase().split(/\s+/).filter(Boolean); if (!w.length) return true; const h = hay(d); return w.every((x) => h.includes(x)); };
/** Entries grouped by category in the Codex's own order; categories with nothing are left out. */
export function groupByCategory(entries) {
  const by = new Map(CATEGORIES.map((c) => [c, []]));
  for (const e of entries) { const c = by.has(e.def.category) ? e.def.category : CATEGORIES[CATEGORIES.length - 1]; by.get(c).push(e); }
  return [...by.entries()].filter(([, l]) => l.length).map(([category, items]) => ({ category, items }));
}
const dayOf = (ctx, id) => { const v = ctx.progress?.m?.cx?.[id]; return typeof v === 'number' ? v : 0; };
const listOf = (ctx) => (ctx.progress?.codexList?.() || []).filter((e) => e?.def?.id);
const seenOf = (U) => {
  if (!U.codexSeen) { const saved = kv.get('codexSeen'); U.codexSeen = new Set(Array.isArray(saved) ? saved : []); }
  return U.codexSeen;
};
/** Ids unlocked by play (not the ones the Codex starts with) that the player has not been shown yet. */
export function unseenIds(ctx) { const seen = seenOf(ctx.U); return listOf(ctx).filter((e) => e.unlocked && dayOf(ctx, e.def.id) > 0 && !seen.has(e.def.id)).map((e) => e.def.id); }
function markSeen(U, ids) { const s = seenOf(U); let ch = false; for (const id of ids) if (!s.has(id)) { s.add(id); ch = true; } if (ch) kv.set('codexSeen', [...s]); }

// ------------------------------------------------------------------ html
const zoneChip = (d) => (d.zone && ZONES[d.zone] ? `<span class="chip">${esc(ZONES[d.zone].name)}</span>` : '');

function cardHTML(ctx, e) {
  const d = e.def;
  if (e.unlocked) {
    const isNew = ctx.U.codexNew?.has(d.id);
    return `<li><button class="cx-card" data-act="codex-open" data-id="${esc(d.id)}" data-fid="cx-${esc(d.id)}"><span class="cx-ic" aria-hidden="true">${esc(d.icon)}</span><span class="cx-tx"><b>${esc(d.title)}</b>${isNew ? ' <span class="chip info cx-new">New</span>' : ''}<small>${esc(d.summary)}</small></span></button></li>`;
  }
  const hint = unlockHint(d.unlock);
  return `<li><div class="cx-card locked" role="group" aria-label="Locked concept. Unlocks when you: ${esc(hint)}"><span class="cx-ic sil" aria-hidden="true">${esc(d.icon)}</span><span class="cx-tx"><b class="cx-bar" aria-hidden="true"></b><small>${esc(d.category)}${d.zone && ZONES[d.zone] ? ' &middot; ' + esc(ZONES[d.zone].name) : ''}</small><small class="cx-hint"><span class="sr">Unlocks when you: </span>${esc(hint)}</small></span></div></li>`;
}
/** The list under the search box: this is what typing replaces in place. */
export function resultsHTML(ctx) {
  const U = ctx.U, q = (U.codexQ || '').trim(), cat = U.codexCat || '', all = listOf(ctx);
  const pool = all.filter((e) => !cat || e.def.category === cat);
  const shown = q ? pool.filter((e) => e.unlocked && matchesQuery(e.def, q)) : pool;
  const groups = groupByCategory(shown);
  if (!shown.length) return `<p class="mute cx-none" role="status">${q ? `Nothing unlocked matches &ldquo;${esc(q)}&rdquo;.` : 'Nothing here yet.'}${q ? ' Locked pages are not searched.' : ''}</p>`;
  return groups.map((g) => {
    const open = g.items.filter((e) => e.unlocked).length;
    return `<section class="sect cx-group"><h3><span>${esc(g.category)}</span><span class="mono">${open} / ${g.items.length}</span></h3><ul class="cx-list">${g.items.map((e) => cardHTML(ctx, e)).join('')}</ul></section>`;
  }).join('');
}
function conceptsHTML(ctx) {
  const U = ctx.U, all = listOf(ctx), got = all.filter((e) => e.unlocked).length;
  const cats = CATEGORIES.filter((c) => all.some((e) => e.def.category === c));
  return `<div class="cx-bar2"><label class="sr" for="cx-q">Search the Codex</label><input id="cx-q" type="search" data-input="codex-search" data-fid="cx-q" placeholder="Search what you have unlocked" value="${esc(U.codexQ || '')}" autocomplete="off"></div>
    <div class="dtabs cx-cats" role="group" aria-label="Categories"><button class="btn sm ghost" data-act="codex-cat" data-cat="" aria-pressed="${!U.codexCat}">All</button>${cats.map((c) => `<button class="btn sm ghost" data-act="codex-cat" data-cat="${esc(c)}" aria-pressed="${U.codexCat === c}">${esc(c)}</button>`).join('')}</div>
    <p class="small mute cx-count">${got} of ${all.length} unlocked. Play to unlock the rest.</p>
    <div data-cx-results>${resultsHTML(ctx)}</div>`;
}

function relatedHTML(ctx, d) {
  const by = Object.fromEntries(listOf(ctx).map((e) => [e.def.id, e]));
  const links = (d.related || []).filter((id) => by[id]).map((id) => (by[id].unlocked
    ? `<button class="btn sm ghost cx-link" data-act="codex-open" data-id="${esc(id)}" data-fid="cxr-${esc(id)}"><span aria-hidden="true">${esc(by[id].def.icon)}</span> ${esc(by[id].def.title)}</button>`
    : `<span class="chip cx-lockchip" title="Locked">Locked: ${esc(unlockHint(by[id].def.unlock))}</span>`));
  return links.length ? `<section class="cx-sec"><h4>Related</h4><div class="cx-rel">${links.join('')}</div></section>` : '';
}
/** One page in full. */
export function entryHTML(ctx, d) {
  const ex = d.example;
  return `<div class="cx-page"><button class="btn sm ghost" data-act="codex-back" data-fid="cx-back">&larr; All concepts</button>
    <header class="cx-head"><span class="cx-ic big" aria-hidden="true">${esc(d.icon)}</span><div><h3 id="cx-t" tabindex="-1">${esc(d.title)}</h3><p class="cx-meta"><span class="chip">${esc(d.category)}</span> ${zoneChip(d)}</p></div></header>
    <p class="cx-sum">${esc(d.summary)}</p>
    ${(d.body || []).map((p) => `<p>${esc(p)}</p>`).join('')}
    ${d.formula ? `<pre class="cx-formula mono" aria-label="Formula">${esc(d.formula)}</pre>` : ''}
    ${ex ? `<section class="cx-sec cx-ex" aria-label="Worked example"><h4>Worked example</h4><p>${esc(ex.setup)}</p><ol>${(ex.steps || []).map((s) => `<li>${esc(s)}</li>`).join('')}</ol><p class="cx-result"><b>Result:</b> ${esc(ex.result)}</p></section>` : ''}
    ${(d.mistakes || []).length ? `<section class="cx-sec"><h4>Common mistakes</h4><ul>${d.mistakes.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></section>` : ''}
    ${d.tryIt ? `<section class="cx-sec callout cx-try"><h4>Try it</h4><p>${esc(d.tryIt)}</p></section>` : ''}
    ${relatedHTML(ctx, d)}</div>`;
}

/** The Academy tab: the lessons, whether each is done, and a Replay button. */
export function academyHTML(ctx, st = readAcademy(kv), missions = MISSIONS) {
  if (!missions.length) return '<p class="mute">The Academy lessons are not in this build yet.</p>';
  const done = missions.filter((m) => st.done.includes(m.id)).length, next = missions.find((m) => !st.done.includes(m.id) && !st.skipped.includes(m.id));
  const byId = Object.fromEntries(listOf(ctx).map((e) => [e.def.id, e.def]));
  const rows = missions.map((m, i) => {
    const state = st.done.includes(m.id) ? 'done' : st.skipped.includes(m.id) ? 'skipped' : 'todo', chip = { done: '<span class="chip good">Done</span>', skipped: '<span class="chip warn">Skipped</span>', todo: '<span class="chip">Not played</span>' }[state];
    const teach = byId[m.concept] ? ` &middot; teaches ${esc(byId[m.concept].title)}` : '';
    return `<li class="card cx-lesson"><span class="cx-ic" aria-hidden="true">${esc(m.icon || '')}</span><div class="grow"><b>${i + 1}. ${esc(m.title)}</b><small class="mute">${ZONES[m.zone] ? esc(ZONES[m.zone].name) + ' &middot; ' : ''}about ${Math.max(1, Math.round(+m.minutes || 2))} min${teach}</small></div>${chip}<button class="btn sm ${state === 'todo' ? '' : 'ghost'}" data-act="codex-replay" data-id="${esc(m.id)}" data-fid="cx-ac-${esc(m.id)}" aria-label="${state === 'todo' ? 'Play' : 'Replay'} lesson ${i + 1}: ${esc(m.title)}">${state === 'todo' ? 'Play' : 'Replay'}</button></li>`;
  }).join('');
  return `<div class="cx-ac"><p class="small">${done} of ${missions.length} lessons done. A replay pays no new XP, but it is the quickest way to refresh an idea.</p>${next ? `<button class="btn" data-act="codex-replay" data-id="">Continue with lesson ${missions.indexOf(next) + 1}</button>` : ''}<ol class="cx-lessons">${rows}</ol></div>`;
}

export default {
  id: 'codex', icon: '📖', label: 'Codex',
  visible: () => true,
  /** A number while there are pages you have not been shown; nothing while the drawer is open (and opening it is what shows them). */
  badge(ctx) {
    if (ctx.U.drawer !== 'codex') ctx.U.codexOpen = false; else return null;
    const n = unseenIds(ctx).length;
    return n > 0 ? n : null;
  },
  html(ctx) {
    const U = ctx.U;
    U.codexTab ||= 'concepts';
    if (!U.codexOpen) { U.codexOpen = true; const fresh = unseenIds(ctx); U.codexNew = new Set(fresh); markSeen(U, fresh); }
    const open = U.codexOpenId && listOf(ctx).find((e) => e.def.id === U.codexOpenId && e.unlocked);
    const tabs = `<div class="dtabs cx-tabs" role="group" aria-label="Codex sections"><button class="btn sm ghost" data-act="codex-tab" data-tab="concepts" aria-pressed="${U.codexTab === 'concepts'}">Concepts</button><button class="btn sm ghost" data-act="codex-tab" data-tab="academy" aria-pressed="${U.codexTab === 'academy'}">Academy</button></div>`;
    if (U.codexTab === 'academy') return `${tabs}${academyHTML(ctx)}`;
    return `${tabs}${open ? entryHTML(ctx, open.def) : conceptsHTML(ctx)}`;
  },
  acts(ctx) {
    const U = ctx.U, find = (sel) => (typeof ctx.$ === 'function' ? ctx.$(sel) : null);
    return {
      'codex-tab'(el) { U.codexTab = el.dataset.tab === 'academy' ? 'academy' : 'concepts'; U.codexOpenId = null; ctx.render(); },
      'codex-cat'(el) { U.codexCat = el.dataset.cat || ''; U.codexOpenId = null; ctx.render(); },
      'codex-search'(el) {
        U.codexQ = el.value || '';
        const box = el.closest?.('[data-drawer]')?.querySelector?.('[data-cx-results]');
        if (box) box.innerHTML = resultsHTML(ctx); else ctx.render();
      },
      'codex-open'(el) { U.codexOpenId = el.dataset.id; markSeen(U, [el.dataset.id]); ctx.render(); find('#cx-t')?.focus?.({ preventScroll: true }); },
      'codex-back'() { const id = U.codexOpenId; U.codexOpenId = null; ctx.render(); (find(`[data-fid="cx-${id}"]`) || find('#cx-q'))?.focus?.({ preventScroll: true }); },
      'codex-replay'(el) {
        const id = el.dataset.id || undefined;
        if (ctx.hooks?.onAcademy) ctx.hooks.onAcademy(id);
        else ctx.toast('Open the menu and choose Academy to play a lesson.', 'info');
      },
    };
  },
};
