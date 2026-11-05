// Travel drawer: the journey through the sixteen districts, and the freight that moves goods between them (docs/V2_DESIGN.md sections 4 and 8).
// Contract: see the header of ../shell.js. State this drawer keeps on the shared UI object U:
//   U.shipIds        crate ids picked in the Stock drawer (read here, cleared after a shipment)
//   U.travel         { tab: 'path' | 'freight', sig, to }  the open tab (only while sig matches the crates picked) and the chosen destination
//   U.fold           the folds the reader opened (stock.js fold): a locked district shows one line, and its rule, reward and lesson open under it
//   U.codexFocus     the Codex entry id the player asked to read (the Codex drawer may use it to open that entry)
// A district's words (rule, reward, lesson) come from ./districttext.js, which the Market drawer reads too.
// Every control is a real button with a stable data-fid, so the shell can give back focus after it redraws the drawer.
import { ZONES, ZONE_IDS, ASSETS } from '../../config.js';
import { esc } from '../common.js';
import { fmtMoney as money } from '../../market.js';
import { lessonTitle, lessonGist, rulePhrases, rewardPhrases } from './districttext.js';
import { fold, flip } from './stock.js';
import { gl } from '../glyphs.js';

export const TIERS = [
  { n: 1, name: 'The Streets', line: 'Barter, haggle and learn to read a buyer.' },
  { n: 2, name: 'The Town', line: 'Managers, the Bank, repairs and freight.' },
  { n: 3, name: 'The Region', line: 'Contracts, fads, spoilage and royalties.' },
  { n: 4, name: 'The World', line: 'Enterprise, credit, property and arbitrage.' },
];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pctN = (x) => Math.round(x * 100);
const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const hoursText = (h) => { h = Math.max(0, Math.round(h)); return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h`; };

// ------------------------------------------------------------------ state helpers (pure reads)
const T = (ctx) => ctx.U.travel || {};
/** Crate ids picked in Stock that still exist. */
export function pickedCrates(ctx) {
  const have = new Set(ctx.g().s.assets.map((a) => a.id));
  return (Array.isArray(ctx.U.shipIds) ? ctx.U.shipIds : []).filter((id) => have.has(id));
}
function tabNow(ctx, ids) {
  const t = T(ctx);
  if (t.tab && t.sig === ids.join(',')) return t.tab;
  return ids.length ? 'freight' : 'path';
}
/** Every open destination with its freight quote, the price gap and whether the shipment could go. */
export function shipPlan(ctx) {
  const g = ctx.g(), s = g.s, ids = pickedCrates(ctx);
  const items = ids.map((id) => s.assets.find((a) => a.id === id));
  const from = items[0]?.zone ?? null;
  const mixed = items.some((a) => a.zone !== from);
  const rows = [];
  if (items.length && !mixed) {
    for (const to of s.zones) {
      if (to === from) continue;
      const q = g.freightQuote(ids, to);
      if (!q.ok) continue;
      const gap = items.reduce((x, a) => x + g.val(a, to) - g.val(a), 0);
      rows.push({ to, q, gap, net: gap - q.cost, cashOk: s.cash >= q.cost, roomOk: q.items.length <= q.room });
    }
  }
  const feasible = rows.filter((r) => r.cashOk && r.roomOk);
  const best = feasible.reduce((b, r) => (!b || r.net > b.net ? r : b), null);
  const want = T(ctx).to;
  const chosen = rows.find((r) => r.to === want) || best || rows[0] || null;
  return { ids, items, from, mixed, rows, best, chosen };
}

// ------------------------------------------------------------------ html
/** One district. An open one shows its rule, the lesson it teaches (a button to the Codex page) and the way in; the next one adds how far net worth has to go and what opening it gives;
 *  every other locked one is a line with its gate, and the rest opens under it (the same words are its hover). */
function distCard(ctx, id, nextId) {
  const g = ctx.g(), s = g.s, Z = ZONES[id], open = s.zones.includes(id), next = id === nextId, here = ctx.U.zone === id && open;
  const state = open ? 'open' : next ? 'next' : 'locked';
  const rule = rulePhrases(Z)[0], reward = rewardPhrases(Z).join(' '), lesson = lessonTitle(Z.teaches), gist = lessonGist(Z.teaches);
  const pal = Array.isArray(Z.palette) && /^#[0-9a-f]{6}$/i.test(Z.palette[1]) ? ` style="--za:${Z.palette[1]}"` : '';
  const node = `<span class="tv-node" aria-hidden="true">${open ? gl('mark-tick', 'gl-pip') : id}</span>`;
  if (state === 'locked') {
    const body = `<p class="tv-meta">Opens at ${money(Z.gate)} net worth.</p><p class="tv-rule">${esc(rule)}</p>${reward ? `<p class="tv-meta">Opening it: ${esc(reward)}</p>` : ''}<p class="tv-meta">Teaches <b>${esc(lesson)}</b></p>`;
    const tip = `Opens at ${money(Z.gate)} net worth. ${rule}${reward ? ` Opening it: ${reward}` : ''} Teaches ${lesson}.`;
    return `<li class="tv-d locked"${pal}>${node}${fold(ctx, 'travel', 'd' + id, `<span aria-hidden="true">${Z.icon}</span> <b>${esc(Z.name)}</b> <span class="chip">Opens at ${money(Z.gate)}</span>`, body, tip)}</li>`;
  }
  const nw = g.netWorth(), frac = clamp(nw / Z.gate, 0, 1), missing = Math.max(0, Z.gate - nw);
  const chip = open ? '<span class="chip good">Open</span>' : '<span class="chip warn">→ Next stop</span>';
  const gate = open ? '' : `<div class="tv-gate"><span class="bar gold" role="progressbar" aria-label="Net worth toward ${esc(Z.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(frac * 100)}"><i style="width:${Math.floor(frac * 100)}%"></i></span>
      <p class="tv-meta"><b>${money(nw)}</b> of ${money(Z.gate)} net worth. <b>${money(missing)}</b> to go.</p></div>`;
  const go = open ? `<button class="btn ${here ? 'ghost' : ''}" data-act="travel-go" data-dist="${id}" data-fid="tv-go-${id}">${here ? 'Look around' : `Go to ${esc(Z.short)}`}</button>` : '';
  // an open district's lesson is a page the player has: its title opens it; the next one's is only named (the page is still locked in the Codex)
  const teach = open ? `<button class="btn ghost sm" data-act="travel-codex" data-id="${esc(Z.teaches)}" data-fid="tv-cx-${id}" title="${esc(gist)}" aria-label="Read about ${esc(lesson)} in the Codex">${esc(lesson)}</button>` : `<b>${esc(lesson)}</b>`;
  return `<li class="tv-d ${state}${here ? ' here' : ''}"${pal}>${node}
    <header class="tv-dh"><span class="tv-ic" aria-hidden="true">${Z.icon}</span><h4${open && reward ? ` title="${esc(`Opening it gave you: ${reward}`)}"` : ''}>${esc(Z.name)}</h4>${chip}${here ? '<span class="chip info">You are here</span>' : ''}</header>
    <p class="tv-rule">${esc(rule)}</p>
    ${gate}${open || !reward ? '' : `<p class="tv-meta">Opening it: ${esc(reward)}</p>`}
    <div class="tv-acts"><span class="tv-lsn"><span class="tv-meta">Teaches</span> ${teach}</span>${go}</div>
  </li>`;
}

function pathHTML(ctx) {
  const s = ctx.g().s, nextId = ZONE_IDS.find((id) => !s.zones.includes(id));
  return TIERS.map((tier) => {
    const ids = ZONE_IDS.filter((id) => ZONES[id].tier === tier.n);
    const n = ids.filter((id) => s.zones.includes(id)).length;
    return `<section class="sect tv-tier"><h3 title="${esc(tier.line)}"><span>Tier ${tier.n}: ${esc(tier.name)}</span><span>${n} of ${ids.length} open</span></h3>
      <ol class="tv-path">${ids.map((id) => distCard(ctx, id, nextId)).join('')}</ol></section>`;
  }).join('');
}

function summaryHTML(ctx) {
  const g = ctx.g(), s = g.s, here = ZONES[ctx.U.zone] || ZONES[Math.max(...s.zones)];
  const nextId = ZONE_IDS.find((id) => !s.zones.includes(id)), N = ZONE_IDS.length, open = s.zones.length;
  const pips = ZONE_IDS.map((id, i) => `<span class="tv-pip ${s.zones.includes(id) ? 'open' : id === nextId ? 'next' : 'locked'}${i && i % 4 === 0 ? ' gap' : ''}"></span>`).join('');
  return `<section class="tv-sum"><div class="tv-here"><span class="tv-ic" aria-hidden="true">${here.icon}</span><div><small>You are in</small><b>${esc(here.name)}</b></div></div>
    <div class="tv-pips" role="img" aria-label="${open} of ${N} districts open">${pips}</div>
    <p class="tv-meta">${open} of ${N} districts open.${nextId ? ` Next stop: <b>${esc(ZONES[nextId].name)}</b>. <b>${money(Math.max(0, ZONES[nextId].gate - g.netWorth()))}</b> to go.` : ' Every district is open.'}</p></section>`;
}

function crateNames(items) {
  const names = items.map((a) => (ASSETS[a.cls] ? `${ASSETS[a.cls].icon} ${ASSETS[a.cls].name}` : a.cls));
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : list(names);
}

function destRow(ctx, r, plan) {
  const Z = ZONES[r.to], sel = plan.chosen?.to === r.to, q = r.q, cu = Z.rules?.customs;
  const riskWord = q.risk < 0.1 ? 'low' : q.risk < 0.2 ? 'medium' : 'high';
  const gapLine = Math.abs(r.gap) < 0.005 ? 'Same price there'
    : r.gap > 0 ? `▲ Worth ${money(r.gap)} more there (${r.net >= 0 ? '+' : '-'}${money(Math.abs(r.net))} after freight)`
      : `▼ Worth ${money(-r.gap)} less there`;
  const warn = [];
  if (cu) warn.push(`Customs may inspect it: a ${pctN(cu)}% chance of a 12-hour delay and a fee of about ${money(q.book * 0.02)}.`);
  if (!r.roomOk) warn.push(`Only room for ${plural(Math.max(0, q.room), 'more crate')} there.`);
  if (!r.cashOk) warn.push(`You need ${money(q.cost - ctx.g().s.cash)} more cash for freight.`);
  return `<button class="tv-dest${sel ? ' sel' : ''}" data-act="travel-pick" data-dist="${r.to}" data-fid="tv-pick-${r.to}" aria-pressed="${sel}">
    <span class="tv-dn"><span aria-hidden="true">${Z.icon}</span> <b>${esc(Z.name)}</b> ${plan.best?.to === r.to && r.net > 0 ? '<span class="chip good">Best price</span>' : ''}${sel ? '<span class="chip info">Chosen</span>' : ''}</span>
    <span class="tv-q">Freight <b>${money(q.cost)}</b> · ${hoursText(q.hours)} · <span title="Ops and a Logistics Agent lower the risk of damage.">damage risk <b>${pctN(q.risk)}%</b> (${riskWord})</span> · room for ${Math.max(0, q.room)}</span>
    <span class="tv-gap ${Math.abs(r.gap) < 0.005 ? '' : r.gap > 0 ? 'up' : 'down'}">${gapLine}</span>
    ${warn.map((w) => `<span class="tv-warn">${esc(w)}</span>`).join('')}
  </button>`;
}

function shipHTML(ctx) {
  const plan = shipPlan(ctx), s = ctx.g().s;
  if (!plan.ids.length) {
    return `<section class="sect"><h3><span>Ship crates</span></h3><div class="tv-empty">
      <p><b>No crates picked.</b> Tick crates in Stock, then choose a destination here.</p>
      <button class="btn" data-act="travel-stock" data-fid="tv-stock">Pick crates in Stock</button></div></section>`;
  }
  const from = ZONES[plan.from];
  const head = `<div class="tv-crates"><p class="small"><b>${plural(plan.items.length, 'crate')}</b> in ${esc(from?.name || 'your district')}: ${esc(crateNames(plan.items))}.</p>
    <div class="tv-acts"><button class="btn ghost" data-act="travel-stock" data-fid="tv-stock">Change crates</button><button class="btn ghost" data-act="travel-clear" data-fid="tv-clear">Clear</button></div></div>`;
  if (plan.mixed) {
    return `<section class="sect"><h3><span>Ship crates</span></h3>${head}<div class="callout warn"><b>These crates sit in different districts.</b> Pick crates from one district in Stock.</div></section>`;
  }
  if (!plan.rows.length) {
    return `<section class="sect"><h3><span>Ship crates</span></h3>${head}<div class="callout">You have no other district to ship to yet.</div></section>`;
  }
  const c = plan.chosen;
  let why = '';
  if (!c.roomOk) why = `Only room for ${plural(Math.max(0, c.q.room), 'more crate')} in ${ZONES[c.to].name}. Ship fewer crates or pick another district.`;
  else if (!c.cashOk) why = `You need ${money(c.q.cost - s.cash)} more cash to pay for freight.`;
  const btn = `<button class="btn big" data-act="travel-ship" data-dist="${c.to}" data-fid="tv-ship"${why ? ' aria-disabled="true"' : ''}>Ship ${plural(plan.items.length, 'crate')} to ${esc(ZONES[c.to].short)} for ${money(c.q.cost)}</button>`;
  return `<section class="sect"><h3><span>Ship crates</span><span>${plan.rows.length} destination${plan.rows.length === 1 ? '' : 's'}</span></h3>${head}
    ${plan.rows.some((r) => r.net > 0) ? '' : '<div class="callout warn"><b>No district pays more after freight.</b></div>'}
    <div class="tv-dests" role="group" aria-label="Choose a destination">${plan.rows.map((r) => destRow(ctx, r, plan)).join('')}</div>
    <div class="tv-shiprow" data-stuck="bottom">${btn}${why ? `<p class="small tv-why">${esc(why)}</p>` : `<p class="small mute">Arrives in about ${hoursText(c.q.hours)}.</p>`}</div></section>`;
}

function transitHTML(ctx) {
  const g = ctx.g(), s = g.s, hf = s.hour;
  if (!s.freight.length) {
    return `<section class="sect"><h3><span>On the road</span><span>nothing in transit</span></h3></section>`;
  }
  const cards = s.freight.map((f) => {
    const to = ZONES[f.to], from = ZONES[f.from], left = Math.max(0, f.arrive - hf), span = Math.max(1, f.arrive - (f.sent ?? f.arrive - 6));
    const now = Math.round(clamp(1 - left / span, 0, 1) * 100);
    const worth = f.items.reduce((x, a) => x + g.val(a, f.to), 0);
    const cu = to?.rules?.customs;
    const note = f.checked ? '<p class="tv-warn">Held at customs: the inspection added 12 hours.</p>'
      : cu ? `<p class="tv-warn">Customs may inspect it on arrival (${pctN(cu)}% chance).</p>` : '';
    return `<article class="tv-fr"><header><h4>${plural(f.items.length, 'crate')} to ${esc(to?.name || 'a district')}</h4><span class="chip info">Arrives in ${hoursText(left)}</span></header>
      <p class="tv-meta">${esc(crateNames(f.items))}. From ${esc(from?.name || 'another district')}, worth about ${money(worth)} on arrival.</p>
      <span class="bar green" role="progressbar" aria-label="Freight to ${esc(to?.name || 'a district')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${now}" aria-valuetext="${now} percent of the way, arrives in ${hoursText(left)}"><i data-bar="freight:${esc(f.id)}"></i></span>
      ${note}</article>`;
  }).join('');
  return `<section class="sect"><h3><span>On the road</span><span>${plural(s.freight.length, 'shipment')}</span></h3><div class="tv-frs">${cards}</div></section>`;
}

function html(ctx) {
  const ids = pickedCrates(ctx), tab = tabNow(ctx, ids), n = ctx.g().s.freight.length;
  const tabs = `<div class="dtabs tv-tabs" role="group" aria-label="Travel views">
    <button class="btn sm ${tab === 'path' ? '' : 'ghost'}" data-act="travel-tab" data-tab="path" data-fid="tv-tab-path" aria-pressed="${tab === 'path'}">Districts</button>
    <button class="btn sm ${tab === 'freight' ? '' : 'ghost'}" data-act="travel-tab" data-tab="freight" data-fid="tv-tab-freight" aria-pressed="${tab === 'freight'}">Freight${n ? ` · ${n} on the road` : ''}</button></div>`;
  return `<div class="tv">${summaryHTML(ctx)}${tabs}${tab === 'freight' ? `${shipHTML(ctx)}${transitHTML(ctx)}` : pathHTML(ctx)}</div>`;
}

// ------------------------------------------------------------------ actions
function focusWorld(ctx, id) {
  const w = ctx.world?.();
  const target = typeof w?.focusZone === 'function' ? w : w?.world;
  try { target?.focusZone?.(id, true); } catch { /* the camera is a nicety, never a reason to fail */ }
}
/** Move the player to an open district, aim the camera and close the drawer. Also used by the Quests drawer. */
export function goToDistrict(ctx, id) {
  const Z = ZONES[id];
  if (!Z || !ctx.g().s.zones.includes(id)) { ctx.toast('That district is still locked. Net worth opens it.', 'warn'); return false; }
  ctx.U.zone = id;
  focusWorld(ctx, id);
  ctx.closeDrawer({ quiet: true }); // the arrival has its own sound (zone.enter): the drawer is not heard closing under it
  ctx.announce?.(`You are now in ${Z.name}.`);
  return true;
}

/**
 * The shell rebuilds a drawer's body whenever its html changes (every game hour, and after every click), which sends the scroll back to the top of a long
 * list. This remembers where the drawers named in `ids` were scrolled and puts it back after each rebuild. Opening another drawer starts at the top.
 * It is a no-op without a drawer element (tests), and safe to call from both drawers: one observer serves them all.
 */
export function keepScroll(ctx, ids) {
  const host = ctx.el?.drawer;
  if (!host || typeof host.addEventListener !== 'function' || typeof MutationObserver === 'undefined') return;
  const st = (host._keep ||= { top: 0, id: '', ids: new Set(), on: false });
  for (const i of ids) st.ids.add(i);
  if (st.on) return;
  st.on = true;
  host.addEventListener('scroll', (e) => { const db = e.target; if (db?.classList?.contains('db')) { st.top = db.scrollTop; st.id = db.dataset.drawer; } }, true);
  new MutationObserver(() => {
    const db = host.querySelector('.db');
    if (!db) { st.top = 0; st.id = ''; return; }
    if (db.dataset.drawer !== st.id) { st.id = db.dataset.drawer; st.top = 0; return; }
    if (st.ids.has(st.id) && st.top && Math.abs(db.scrollTop - st.top) > 1) db.scrollTop = st.top;
  }).observe(host, { childList: true });
}
/** Forget the remembered place, so the next rebuild starts at the top (a change of tab, not of detail). */
export const scrollToTop = (ctx) => { if (ctx.el?.drawer?._keep) ctx.el.drawer._keep.top = 0; };
/** Take the list's place as it is now as the remembered one: for a jump that moved it by script, so a rebuild in the same frame cannot put the old place back. */
export const rememberScroll = (ctx) => { const k = ctx.el?.drawer?._keep, db = ctx.el?.drawer?.querySelector?.('.db'); if (k && db) { k.top = db.scrollTop; k.id = db.dataset.drawer; } };

function acts(ctx) {
  const set = (patch) => { ctx.U.travel = { ...(ctx.U.travel || {}), ...patch }; };
  keepScroll(ctx, ['travel']);
  return {
    'travel-tab'(el) { set({ tab: el.dataset.tab === 'freight' ? 'freight' : 'path', sig: pickedCrates(ctx).join(',') }); scrollToTop(ctx); ctx.render(); },
    'travel-go'(el) { goToDistrict(ctx, +el.dataset.dist); },
    'travel-fold'(el) { flip(ctx, 'travel', el.dataset.k); },
    'travel-codex'(el) { ctx.U.codexFocus = el.dataset.id; ctx.openDrawer('codex'); },
    'travel-stock'() { ctx.openDrawer('stock'); },
    'travel-clear'() { ctx.U.shipIds = []; set({ tab: 'freight', sig: '' }); ctx.render(); },
    'travel-pick'(el) { set({ to: +el.dataset.dist, tab: 'freight', sig: pickedCrates(ctx).join(',') }); ctx.render(); },
    'travel-ship'(el) {
      const ids = pickedCrates(ctx), to = +el.dataset.dist || shipPlan(ctx).chosen?.to;
      if (!ids.length) { ctx.toast('Pick crates in Stock first.', 'warn'); return; }
      const res = ctx.g().ship(ids, to);
      // the engine's success message is overwritten by the quote it spreads in, so say what happened here
      if (res.ok && !res.msg) res.msg = `Shipped ${plural(ids.length, 'crate')} to ${ZONES[to]?.name || 'the district'}. They arrive in about ${hoursText(res.hours)}.`;
      const r = ctx.say(res);
      if (r.ok) {
        for (const id of ids) ctx.U.sel?.delete?.(id);
        ctx.U.shipIds = [];
        set({ tab: 'freight', sig: '', to: undefined });
        ctx.sfx?.blip?.();
      }
      ctx.render();
    },
  };
}

export default {
  id: 'travel', label: 'Travel',
  visible: (ctx) => ctx.g().s.zones.length > 1,
  badge: () => null,
  html,
  acts,
};
