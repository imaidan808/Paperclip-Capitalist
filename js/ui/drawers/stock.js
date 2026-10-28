// Stock drawer (docs/V2_DESIGN.md section 8): what you hold, as crates grouped by district.
// Contract: see the header of ../shell.js. Acts are named "stock-...". Amounts go through ctx.money; copy says "district", never "zone".
//
// Hidden truth: a crate bought from a lot carries `truth` (its real quality and whether it is a fake). The player earns that by looking things over
// in the Deal Room, so nothing here reads `truth` until the crate is `known` (a buyer spotted it). Everything else shown (value, belief,
// condition) is public. The pool's quote is also truth-weighted, so the confirmation shows an "as described" figure and the player's own read,
// never the pool's exact offer; the toast after the sale tells the real number.
import { ASSETS, ZONES } from '../../config.js';
import { FAKE_VALUE } from '../../market.js';
import { benchQuote } from '../../deal.js';

const UP = '▲', DOWN = '▼', FLAT = '▬';

// ---- small helpers, shared with market.js
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const dur = (h) => (!Number.isFinite(h) ? '' : h >= 48 ? `${(h / 24).toFixed(1)} days` : `${Math.max(0, Math.round(h))} h`);
export const nameOf = (cls, cond) => `${ASSETS[cls]?.name || 'Crate'}${cond === 'broken' ? ' (broken)' : ''}`;
export const knownFake = (a) => !!a.known && !!a.truth?.fake;
/** The district the drawers are focused on: the player's pick if it is open, else the furthest open one. */
export function focusZone(ctx) {
  const open = ctx.g().s.zones, z = ctx.U.zone;
  return open.includes(z) ? z : Math.max(...open);
}
/** Crates in a district the way the engine counts storage: on the shelf, on the road to it, and in escrow there. */
export function heldIn(g, zone) {
  const s = g.s;
  return s.assets.filter((a) => a.zone === zone).length
    + s.freight.reduce((n, f) => n + (f.to === zone ? f.items.length : 0), 0)
    + s.escrow.reduce((n, e) => n + e.assets.filter((a) => a.zone === zone).length, 0);
}
/** "Your read" for an inspected crate or lot: { quality, fakeProb, confidence } -> one plain sentence, or null when it was never inspected. */
export function beliefLine(ctx, b) {
  if (!b || !Number.isFinite(b.quality)) return null;
  const fp = Number.isFinite(b.fakeProb) ? Math.max(0, Math.min(1, b.fakeProb)) : 0;
  const sure = Number.isFinite(b.confidence) ? (b.confidence >= 0.75 ? 'a firm read' : b.confidence >= 0.45 ? 'a fair read' : 'a rough read') : 'a rough read';
  const q = (Math.round(b.quality * 10) / 10).toFixed(1);
  return { fake: fp >= 0.6, text: `Your read: looks ${q} quality, ${Math.round(fp * 100)}% chance it is fake (${sure}).${fp >= 0.6 ? ' Likely a fake.' : ''}` };
}
const bar = (cls, now, max, label, w) => `<div class="bar ${cls}" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${now}"><i style="width:${w}%"></i></div>`;
/** What follows the bench's own reason when the cash does not reach it. */
export const NEED_CASH = 'Sell a crate or wait for more cash, and the bench will open.';
const pctOf = (x, y) => (y > 0 ? Math.max(0, Math.min(100, (x / y) * 100)) : 0);

// ---- the header strip: storage in the focused district and what the stock adds to net worth
function stripHTML(ctx, z) {
  const g = ctx.g(), s = g.s, m = ctx.money, Z = ZONES[z];
  const held = heldIn(g, z), cap = g.storeCap(z), full = held >= cap;
  const inv = g.invValue(), nw = g.netWorth(), share = nw > 0.005 ? Math.max(0, Math.min(1, inv / nw)) : 0;
  return `<section class="stk-strip" aria-label="Storage and value">
    <div class="row stk-strip-top"><b><span aria-hidden="true">${Z.icon}</span> ${ctx.esc(Z.short)}</b>
      <span class="grow"></span><span class="stk-storetext">Storage ${held} of ${cap}${full ? ' <span class="badge red">Full</span>' : ''}</span></div>
    ${bar(full ? 'red' : 'gold', held, cap, `Storage used in ${ctx.esc(Z.short)}`, pctOf(held, cap).toFixed(0))}
    <p class="small stk-worth">${s.assets.length ? `Your stock is worth <b class="mono">${m(inv)}</b>${nw > 0.005 ? `, about <b>${Math.round(share * 100)}%</b> of your net worth of <span class="mono">${m(nw)}</span>` : ''}. ${plural(s.assets.length, 'crate')} in all.` : 'Nothing on your shelves right now.'}</p>
  </section>`;
}

// ---- one crate
function crateHTML(ctx, a, sel) {
  const g = ctx.g(), s = g.s, m = ctx.money, e = ctx.esc, def = ASSETS[a.cls], Z = ZONES[a.zone];
  const fake = knownFake(a), broken = a.cond === 'broken';
  const val = g.val(a), paid = Number.isFinite(a.basis) ? a.basis : 0, delta = val - paid;
  const dPct = paid > 0.0001 ? delta / paid : null;
  const flat = Math.abs(delta) < Math.max(0.005, paid * 0.005);
  const dir = flat ? 'flat' : delta > 0 ? 'up' : 'down';
  const result = dir === 'flat' ? `<span class="mute"><span aria-hidden="true">${FLAT}</span> About even</span>`
    : `<span class="${dir === 'up' ? 'green' : 'red'}"><span aria-hidden="true">${dir === 'up' ? UP : DOWN}</span><span class="sr">${dir === 'up' ? 'Gain of' : 'Loss of'}</span> ${dir === 'up' ? '+' : '-'}${m(Math.abs(delta))}${dPct == null || Math.abs(dPct) < 0.01 ? '' : ` (${dir === 'up' ? '+' : '-'}${Math.round(Math.abs(dPct) * 100)}%)`}</span>`;
  const held = Number.isFinite(a.got) ? s.hour - a.got : null;
  const badge = fake ? '<span class="badge red">Counterfeit</span>' : broken ? '<span class="badge red">Broken</span>' : '<span class="badge cyan">Working</span>';
  const bel = !fake && !a.known ? beliefLine(ctx, a.belief) : null;
  let read;
  if (fake) read = '<p class="stk-read stk-fake"><span aria-hidden="true">⚠</span> <b>Worth almost nothing.</b> A buyer spotted that it is a fake. The pool will still take it, and next time look it over before you pay.</p>';
  else if (a.known) read = '<p class="stk-read"><span aria-hidden="true">✓</span> Checked: this one is genuine.</p>';
  else if (bel) read = `<p class="stk-read${bel.fake ? ' stk-warnline' : ''}">${bel.fake ? '<span aria-hidden="true">⚠</span> ' : ''}${e(bel.text)}</p>`;
  else read = '<p class="stk-read mute">Not inspected. It looks fine on the label, but you have not looked inside.</p>';
  // small facts: quality, wear, and what the district's rule does to it
  const chips = [];
  if (Math.abs((a.quality ?? 1) - 1) > 0.004) chips.push(`<span class="chip ${a.quality < 1 ? 'warn' : 'good'}">Quality ${Math.round(a.quality * 100)}%</span>`);
  if (a.wear < 0.97) chips.push(`<span class="chip ${a.wear < 0.7 ? 'warn' : ''}">Condition ${Math.round(a.wear * 100)}%</span>`);
  if (def.perish) chips.push(`<span class="chip warn">Spoils: about ${(((0.8 / def.perish) + def.dep * 0.002) * 100).toFixed(0)}% a day</span>`);
  if (def.yield) chips.push(`<span class="chip good">Pays about ${m(val * def.yield)} a day</span>`);
  if (Z.rules.fads && def.tags.includes('digital')) chips.push('<span class="chip warn">Fad risk: loses value twice as fast here</span>');
  let fix = '';
  if (broken) {
    // The estimate is the repair bench's own (deal.js benchQuote): the Deal Room opens only when the cash reaches the most a bill can run to, so the drawer says that figure and does not offer a
    // repair "for about $486" to a founder with $462 whom the bench then turns away.
    const bq = benchQuote(g, a.id);
    if (bq.ok) {
      const net = bq.after - bq.before - bq.cost, why = bq.affordable ? '' : `<p class="stk-fixwhy small" id="st-fixwhy-${a.id}"><span aria-hidden="true">⚠</span> ${e(bq.blocker)} ${e(NEED_CASH)}</p>`;
      fix = `<p class="stk-fix small">Repair costs about <b class="mono">${m(bq.cost)}</b>, up to <b class="mono">${m(bq.most)}</b> if the marker slips, and restores it to about ${Math.round(bq.quality * 100)}% quality, worth <span class="mono">${m(bq.after)}</span> afterwards (now <span class="mono">${m(bq.before)}</span>). ${net >= 0 ? `<b class="green"><span aria-hidden="true">${UP}</span> Worth it: +${m(net)}</b>` : `<b class="red"><span aria-hidden="true">${DOWN}</span> Loses ${m(-net)}</b>`}</p>
        ${why}
        <button class="btn sm" data-act="stock-repair" data-id="${a.id}" data-fid="st-fix-${a.id}"${bq.affordable ? '' : ` aria-disabled="true" aria-describedby="st-fixwhy-${a.id}"`}>Repair ${e(def.name)}</button>`;
    } else fix = '<p class="stk-fix small mute">This cannot be repaired. Sell it to a buyer who works with scrap and spares.</p>';
  }
  return `<li class="stk-crate ${fake ? 'is-fake' : broken ? 'is-broken' : 'is-ok'}${sel ? ' is-sel' : ''}">
    <span class="stk-ic" aria-hidden="true">${def.icon}</span>
    <div class="stk-body">
      <div class="stk-head"><label class="stk-name"><input type="checkbox" data-change="stock-pick" data-id="${a.id}" data-fid="st-${a.id}"${sel ? ' checked' : ''}> <span>${e(def.name)}<span class="sr">, worth ${m(val)}</span></span></label> ${badge}</div>
      <dl class="stk-vals"><dt>Worth now</dt><dd class="mono">${m(val)}</dd>${a.from === 'start' ? '<dt>Where from</dt><dd>Your starting crate</dd>' : `<dt>${a.from === 'barter' || a.from === 'p2p' ? 'Worth when you got it' : 'You paid'}</dt><dd class="mono">${m(paid)}</dd><dt>Result</dt><dd class="mono">${result}</dd>`}${held == null ? '' : `<dt>Held</dt><dd>${held < 1 ? 'just got it' : dur(held)}</dd>`}</dl>
      ${read}
      ${chips.length ? `<div class="row stk-chips">${chips.join('')}</div>` : ''}
      ${fix}
    </div></li>`;
}

// ---- crates that are away from the shelf: on the road, or held in escrow for a classmate
function awayHTML(ctx) {
  const g = ctx.g(), s = g.s, e = ctx.esc;
  const road = s.freight.map((f) => `<li class="stk-away"><div class="row"><b>On the road to ${e(ZONES[f.to].short)}</b><span class="grow"></span><span class="small">arrives in ${dur(f.arrive - s.hour)}</span></div>
      <div class="bar" aria-hidden="true"><i data-bar="freight:${f.id}"></i></div><p class="small mute">${f.items.map((a) => e(nameOf(a.cls, a.cond))).join(', ')}</p></li>`);
  const held = s.escrow.filter((x) => x.assets.length).map((x) => `<li class="stk-away"><b>Offered to a classmate</b><p class="small mute">${x.assets.map((a) => e(nameOf(a.cls, a.cond))).join(', ')} wait in escrow until they answer. Check the Exchange in the Market.</p></li>`);
  if (!road.length && !held.length) return '';
  return `<section class="sect"><h3>Away from the shelf</h3><ul class="stk-list">${road.join('')}${held.join('')}</ul></section>`;
}

// ---- the actions for whatever is ticked
function selBarHTML(ctx, sel) {
  const g = ctx.g(), s = g.s, m = ctx.money, e = ctx.esc;
  if (!sel.length) return '<p class="small mute stk-hint">Tick crates to sell them to the pool, repair them, ship them or offer them to a classmate. A buyer in the Market usually pays more than the pool does.</p>';
  const ids = sel.map((a) => a.id), oneDistrict = new Set(sel.map((a) => a.zone)).size === 1;
  const worth = sel.reduce((x, a) => x + g.val(a), 0), paid = sel.reduce((x, a) => x + (a.basis || 0), 0);
  const pq = oneDistrict ? g.poolQuote(ids) : null; // used for "can it be done" and the delay only: its total is truth-weighted
  const digital = sel.every((a) => ASSETS[a.cls].tags.includes('digital')) && s.zones.length > 1;
  const rq = digital ? g.poolQuote(ids, true) : null;
  const broken = sel.filter((a) => a.cond === 'broken' && ASSETS[a.cls].repair);
  const bench = broken.length ? benchQuote(g, broken[0].id) : null, benchShut = !!bench && bench.ok && !bench.affordable; // the button repairs the first broken crate ticked, so it asks about that one
  const why = [];
  const btn = (act, label, ok, cls = 'ghost') => `<button class="btn sm ${cls}" data-act="${act}" data-fid="st-${act}"${ok ? '' : ' aria-disabled="true"'}>${label}</button>`;
  if (!oneDistrict) why.push('Pick crates from one district to sell or ship them together.');
  else if (pq && !pq.ok) why.push(pq.msg);
  if (oneDistrict && s.zones.length < 2) why.push('Shipping needs a second district. Net worth opens the next one.');
  if (benchShut) why.push(`${bench.blocker} ${NEED_CASH}`);
  return `<div class="stk-selbar" role="region" aria-label="Actions for the ticked crates">
    <div class="row"><b>${plural(sel.length, 'crate')} ticked</b><span class="small">worth <span class="mono">${m(worth)}</span>, you paid <span class="mono">${m(paid)}</span></span><span class="grow"></span><button class="btn sm ghost" data-act="stock-clear" data-fid="st-clear">Clear</button></div>
    <div class="row stk-acts">
      ${btn('stock-sellpool', 'Sell to the pool', !!(pq && pq.ok), '')}
      ${rq && rq.ok ? btn('stock-route', 'Route digital', true) : ''}
      ${broken.length ? btn('stock-repair', broken.length > 1 ? `Repair first of ${broken.length}` : 'Repair', !benchShut) : ''}
      ${btn('stock-ship', 'Ship', oneDistrict && s.zones.length > 1)}
      ${btn('stock-offer', 'Offer to a classmate', true)}
    </div>
    ${why.map((w) => `<p class="tiny mute">${e(w)}</p>`).join('')}
    ${pq && pq.ok && pq.delay ? `<p class="tiny mute">Money from the pool arrives after ${pq.delay} virtual hours here.</p>` : ''}
    ${rq && rq.ok ? `<p class="tiny mute">Digital routing sends them to ${e(ZONES[rq.zone].short)}, where they pay most. It costs a ${Math.round(rq.fric * 100)}% fee and pays after ${rq.delay} hours.</p>` : ''}
  </div>`;
}

function emptyHTML() {
  return `<section class="stk-empty" aria-label="Nothing in stock">
    <span class="stk-empty-ic" aria-hidden="true">📦</span>
    <h3>Your shelves are empty</h3>
    <p>Nothing to sell yet. Buy your first lot in the Market, and it will show up here as a crate you can sell, repair or ship.</p>
    <button class="btn big" data-act="stock-gomarket" data-fid="st-go">Buy your first lot</button>
  </section>`;
}

// ---- the pool's confirmation (the real figure is truth-weighted, so show the as-described one and the player's own read)
function poolConfirm(ctx, ids, route) {
  const g = ctx.g(), m = ctx.money, e = ctx.esc, U = ctx.U;
  const q = g.poolQuote(ids, route);
  if (!q.ok) { ctx.toast(q.msg, 'warn'); return; }
  const described = q.per.reduce((x, p) => x + g.val(p.a, q.zone) * (1 - q.fric), 0);
  const read = q.per.reduce((x, p) => {
    const b = p.a.belief;
    if (p.a.known || !b || !Number.isFinite(b.quality)) return x + g.val(p.a, q.zone) * (1 - q.fric);
    const fp = Number.isFinite(b.fakeProb) ? b.fakeProb : 0;
    return x + g.val(p.a, q.zone) * (1 - q.fric) * (fp * FAKE_VALUE + (1 - fp) * b.quality);
  }, 0);
  const inspected = q.per.some((p) => !p.a.known && p.a.belief && Number.isFinite(p.a.belief.quality));
  const unknown = q.per.some((p) => !p.a.known);
  const where = route ? `the ${e(ZONES[q.zone].short)} pool, the district that pays most for digital goods` : `the ${e(ZONES[q.zone].short)} pool`;
  const body = `<p>${plural(q.per.length, 'crate')} to ${where}.</p>
    <dl class="kv"><dt>Worth as described</dt><dd>${m(q.per.reduce((x, p) => x + g.val(p.a, q.zone), 0))}</dd><dt>${route ? 'Routing fee' : 'Pool fees and friction'}</dt><dd>-${Math.round(q.fric * 1000) / 10}%</dd><dt>You get about</dt><dd class="gold">${m(described)}</dd>${inspected ? `<dt>Going by your own read</dt><dd>${m(read)}</dd>` : ''}</dl>
    ${unknown ? '<p class="small">The pool checks what it buys. A crate that is worn or fake fetches less than the figure above, and you will see the real total when it is done.</p>' : ''}
    ${q.delay ? `<p class="small">The money arrives after <b>${q.delay} virtual hours</b>.</p>` : ''}
    ${described > q.room ? `<p class="callout warn small">The pool only has ${m(q.room)} left. It refills 35% a day, so a smaller batch may be needed.</p>` : `<p class="small mute">The pool has ${m(q.room)} left. A buyer in the Market usually pays more.</p>`}`;
  ctx.confirmBox(route ? 'Route to the pool?' : 'Sell to the pool?', body, 'Sell', () => {
    const r = g.sellPool(ids, route);
    for (const id of ids) U.sel.delete(id);
    if (!r.ok) { ctx.say(r); return; }
    // the engine's own message is empty here (the quote's blank one wins the spread), so say the real total, which is the first time the player sees it
    ctx.toast(`Sold ${plural(q.per.length, 'crate')} for ${m(r.total)}.${r.delay ? ` The money arrives in ${r.delay} virtual hours.` : ''}`, 'good');
    ctx.sfx?.kaching?.();
  });
}

export default {
  id: 'stock', icon: '📦', label: 'Stock',
  visible: () => true,
  badge: (ctx) => ctx.g().s.assets.length || null,

  html(ctx) {
    const g = ctx.g(), s = g.s, U = ctx.U, e = ctx.esc;
    const z = focusZone(ctx);
    const strip = stripHTML(ctx, z);
    if (!s.assets.length) return strip + emptyHTML() + awayHTML(ctx);
    const by = new Map();
    for (const a of s.assets) { if (!by.has(a.zone)) by.set(a.zone, []); by.get(a.zone).push(a); }
    const order = [...by.keys()].sort((a, b) => (a === z ? -1 : b === z ? 1 : a - b));
    const sel = s.assets.filter((a) => U.sel.has(a.id));
    const groups = order.map((dz) => {
      const list = by.get(dz).sort((a, b) => g.val(b) - g.val(a)), Z = ZONES[dz], allOn = list.every((a) => U.sel.has(a.id));
      return `<section class="sect stk-group" data-district="${dz}" style="--za:${e(Z.palette?.[1] || '#5cd6ff')}">
        <div class="stk-ghead"><h3><span aria-hidden="true">${Z.icon}</span> ${e(Z.name)}${dz === z ? ' <span class="chip info">You are here</span>' : ''}</h3>
          <div class="row stk-gtools"><span class="tiny">${plural(list.length, 'crate')}, storage ${heldIn(g, dz)}/${g.storeCap(dz)}</span><button class="btn sm ghost" data-act="stock-pickzone" data-z="${dz}" data-fid="st-z-${dz}">${allOn ? 'Untick all' : 'Tick all'}<span class="sr"> in ${e(Z.short)}</span></button></div></div>
        <ul class="stk-list" aria-label="Crates in ${e(Z.short)}">${list.map((a) => crateHTML(ctx, a, U.sel.has(a.id))).join('')}</ul></section>`;
    }).join('');
    return `${strip}${selBarHTML(ctx, sel)}${groups}${awayHTML(ctx)}`;
  },

  acts(ctx) {
    const U = ctx.U, g = () => ctx.g();
    const chosen = () => g().s.assets.filter((a) => U.sel.has(a.id));
    const prune = () => { const have = new Set(g().s.assets.map((a) => a.id)); for (const id of [...U.sel]) if (!have.has(id)) U.sel.delete(id); };
    return {
      'stock-pick'(el) {
        const id = el.dataset.id, on = typeof el.checked === 'boolean' ? el.checked : !U.sel.has(id);
        if (on) U.sel.add(id); else U.sel.delete(id);
        prune(); ctx.render();
      },
      'stock-pickzone'(el) {
        const z = +el.dataset.z, ids = g().s.assets.filter((a) => a.zone === z).map((a) => a.id);
        const all = ids.length > 0 && ids.every((id) => U.sel.has(id));
        for (const id of ids) { if (all) U.sel.delete(id); else U.sel.add(id); }
        ctx.render();
      },
      'stock-clear'() { U.sel.clear(); ctx.render(); },
      'stock-sellpool'() {
        const sel = chosen();
        if (!sel.length) { ctx.toast('Tick a crate first.', 'warn'); return; }
        poolConfirm(ctx, sel.map((a) => a.id), false);
      },
      'stock-route'() {
        const sel = chosen();
        if (!sel.length) { ctx.toast('Tick a crate first.', 'warn'); return; }
        poolConfirm(ctx, sel.map((a) => a.id), true);
      },
      'stock-repair'(el) {
        const a = (el.dataset?.id && g().s.assets.find((x) => x.id === el.dataset.id)) || chosen().find((x) => x.cond === 'broken' && ASSETS[x.cls].repair);
        if (!a) { ctx.toast('Tick a broken crate to repair.', 'warn'); return; }
        const bq = benchQuote(g(), a.id);
        if (bq.ok && !bq.affordable) { ctx.toast(`${bq.blocker} ${NEED_CASH}`, 'warn'); return; } // (the button is aria-disabled then; this holds for any other way in)
        ctx.deal({ kind: 'repair', assetId: a.id });
      },
      'stock-ship'() {
        const sel = chosen();
        if (!sel.length) { ctx.toast('Tick a crate first.', 'warn'); return; }
        if (new Set(sel.map((a) => a.zone)).size > 1) { ctx.toast('Pick crates from one district to ship them together.', 'warn'); return; }
        if (g().s.zones.length < 2) { ctx.toast('Shipping needs a second district. Net worth opens the next one.', 'warn'); return; }
        U.shipIds = sel.map((a) => a.id);
        ctx.openDrawer('travel');
      },
      'stock-offer'() { U.marketTab = 'exchange'; ctx.openDrawer('market'); },
      'stock-gomarket'() { U.marketTab = 'lots'; ctx.openDrawer('market'); },
    };
  },
};
