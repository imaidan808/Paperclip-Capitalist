// Bank drawer: the debt-to-equity gauge, loan products, open loans, the audit, the exit and the ledger (docs/V2_DESIGN.md section 8).
// Contract: see the header of ../shell.js. State that must survive a redraw lives in ctx.U.bank; the HTML is rebuilt from the engine every time.
// The game teaches leverage here, so the rules of the margin call are always on the page, before the player ever feels one.
import { LOANS, DEBT, AUDIT, BASE_RATE, FEES, PIPE, ZONES, ASSETS, BUYERS, MIL } from '../../config.js';
import { esc } from '../common.js';

// ---------------------------------------------------------------- helpers
const ST = (ctx) => {
  const B = (ctx.U.bank ||= {});
  B.pct ||= {}; B.logf ||= 'all'; B.ledger ??= false; B.pipe ??= null;
  return B;
};
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const dur = (h) => { h = Math.max(0, Math.round(h)); const d = Math.floor(h / 24), r = h % 24; return d ? (r ? `${d}d ${r}h` : `${d}d`) : `${r}h`; };
const view = (ctx) => { const g = ctx.g(); return { ctx, g, s: g.s, m: ctx.money, B: ST(ctx) }; };
const tone = (x) => (x >= 0 ? 'green' : 'red');
const SCALE = 6; // the gauge runs 0 to 6; anything higher pins to the right edge
const PRODUCT = {
  micro: { icon: '💳', line: 'Small and fast. Interest builds up every day.' },
  pipeline: { icon: '🏗️', line: 'Borrow against what you own: stock and manager capital. Interest builds up every week.' },
  circle: { icon: '🤝', line: 'People who trust you lend with no interest and no fee.' },
  enterprise: { icon: '🏛️', line: 'A large revolving credit line. You pay a small monthly fee on the part you do not use.' },
};
const every = (h) => (h <= 24 ? 'daily' : h <= 168 ? 'weekly' : 'monthly');
const products = (v) => Object.keys(LOANS).filter((id) => (id !== 'circle' || v.g.P.circle) && (id !== 'enterprise' || v.s.zones.includes(LOANS.enterprise.zone)));

/** What the bank would show for a ratio, in words. */
function zoneOf(de, debt) {
  if (!isFinite(de)) return { key: 'call', glyph: '⛔', tone: 'bad', label: 'Insolvent', say: 'You owe more than you own.' };
  if (!debt) return { key: 'none', glyph: '✓', tone: 'good', label: 'No debt', say: 'You are running on your own money.' };
  if (de > DEBT.callDE) return { key: 'call', glyph: '⛔', tone: 'bad', label: 'Margin call', say: 'The bank is selling your managers to cover the loans.' };
  if (de > DEBT.maxDE) return { key: 'cap', glyph: '⚠', tone: 'warn', label: 'Over the cap', say: 'No new loans until you repay or grow.' };
  if (de > DEBT.maxDE * 0.75) return { key: 'near', glyph: '◐', tone: 'warn', label: 'Near the cap', say: 'Careful: a bad week could freeze your borrowing.' };
  return { key: 'safe', glyph: '✓', tone: 'good', label: 'Safe', say: 'You can still borrow, and a dip will not hurt you.' };
}

// ---------------------------------------------------------------- the hero: the gauge
function gaugeHTML(v) {
  const { g, s, m } = v, nw = g.netWorth(), debt = g.debt(), de = g.deRatio(), z = zoneOf(de, debt), mods = g.mods();
  const pos = Math.min(100, (isFinite(de) ? de : SCALE) / SCALE * 100);
  const headroom = nw > 0 ? Math.max(0, DEBT.maxDE * nw - debt) : 0;
  const cushion = debt > 0 && nw > 0 ? Math.max(0, nw - debt / DEBT.callDE) : null;
  const stress = debt > 0 && nw > 0 ? debt / (nw * 0.7) : null;
  const shown = isFinite(de) ? de.toFixed(2) : 'over 6';
  const base = (BASE_RATE + mods.rateBps / 10000) * 100;
  const aria = `Debt to equity ${isFinite(de) ? de.toFixed(2) : 'above 6'}, ${z.label}. Safe up to ${DEBT.maxDE.toFixed(1)}, no new loans from ${DEBT.maxDE.toFixed(1)}, margin call above ${DEBT.callDE.toFixed(1)}.`;
  return `<section class="bk-hero" aria-label="Debt-to-equity"><div class="bk-hero-h"><h3>Debt-to-equity</h3><span class="chip ${z.tone}"><span aria-hidden="true">${z.glyph}</span> ${z.label}</span></div>
    <p class="bk-big"><b class="mono">${shown}</b> <span class="small mute">${debt ? `You owe ${isFinite(de) ? '$' + de.toFixed(2) : 'more than $6'} for every $1 you own.` : 'No debt yet.'}</span></p>
    <div class="bk-gauge" role="img" aria-label="${esc(aria)}">
      <div class="bk-track"><span class="bk-seg safe" style="width:${DEBT.maxDE / SCALE * 100}%"></span><span class="bk-seg cap" style="width:${(DEBT.callDE - DEBT.maxDE) / SCALE * 100}%"></span><span class="bk-seg call" style="width:${(SCALE - DEBT.callDE) / SCALE * 100}%"></span>
        <span class="bk-needle" style="left:${pos.toFixed(1)}%"><i></i></span></div>
      <div class="bk-scale" aria-hidden="true"><span style="left:0">0</span><span style="left:${DEBT.maxDE / SCALE * 100}%">${DEBT.maxDE.toFixed(1)} cap</span><span style="left:${DEBT.callDE / SCALE * 100}%">${DEBT.callDE.toFixed(1)} margin call</span></div></div>
    <p class="small">${z.say}</p>
    <dl class="bk-stats"><div><dt>Net worth (your equity)</dt><dd class="mono">${m(nw)}</dd></div><div><dt>Debt</dt><dd class="mono ${debt ? 'red' : ''}">${m(debt)}</dd></div>
      <div><dt>Room to borrow</dt><dd class="mono">${m(headroom)}</dd></div><div><dt>Cushion before a margin call</dt><dd class="mono">${cushion == null ? 'None needed' : m(cushion)}</dd></div></dl>
    ${stress != null ? `<p class="small mute"><b>Stress test:</b> if your net worth fell 30% tomorrow, this ratio would jump to <b class="${stress > DEBT.callDE ? 'red' : stress > DEBT.maxDE ? 'gold' : ''}">${stress.toFixed(2)}</b>${stress > DEBT.callDE ? ', which is a margin call' : stress > DEBT.maxDE ? ', which freezes new loans' : ', which is still fine'}.</p>` : ''}
    <ul class="bk-rules small"><li><b>Up to ${DEBT.maxDE.toFixed(1)}:</b> the bank lends while your debt stays under ${DEBT.maxDE.toFixed(1)} times your net worth.</li>
      <li><b>${DEBT.maxDE.toFixed(1)} to ${DEBT.callDE.toFixed(1)}:</b> no new loans. Interest keeps building.</li>
      <li><b>Above ${DEBT.callDE.toFixed(1)}:</b> margin call. The bank sells your biggest manager (or, with none, your most valuable stock) at ${Math.round(DEBT.fireSale * 100)}% off, again and again, until you are back at ${DEBT.maxDE.toFixed(1)}.${s.ps.bailout > 0 ? ` Your family will clear ${Math.round(g.P.bailout.fraction * 100)}% of your debt once, first.` : ''}</li></ul>
    <p class="small mute">The bank's base rate is ${base.toFixed(1)}% per 30 days${mods.rateBps ? ' (a credit crunch is pushing it up)' : ''}. Your Capital Sourcing level ${g.lvl('fintech')} trims every spread.</p></section>`;
}

// ---------------------------------------------------------------- loan products
/** Dollars for a slider position: a share of the room, whole dollars once the sum is big enough to afford it. */
function amountFor(room, pct) {
  const raw = room * Math.max(0, Math.min(100, pct)) / 100;
  return raw >= 100 ? Math.floor(raw) : Math.floor(raw * 100) / 100;
}
function drawPreview(v, id, amount) {
  const { g, m } = v, L = LOANS[id], nw = g.netWorth(), debt = g.debt(), fee = amount * L.fee;
  if (amount <= 0) return '<span class="mute">Slide to pick an amount.</span>';
  const after = nw - fee > 0 ? (debt + amount) / (nw - fee) : Infinity, rate = g.loanRate(id), z = zoneOf(after, debt + amount);
  return `You receive <b>${m(amount - fee)}</b>${fee ? ` after a ${m(fee)} fee` : ' with no fee'}. Interest costs about <b>${m(amount * rate)}</b> over 30 days. Debt-to-equity goes from <b>${isFinite(g.deRatio()) ? g.deRatio().toFixed(2) : 'over 6'}</b> to <b>${isFinite(after) ? after.toFixed(2) : 'over 6'}</b> (${z.label.toLowerCase()}).`;
}

function productCard(v, id) {
  const { g, m, B } = v, L = LOANS[id], P = PRODUCT[id], r = g.loanRoom(id), block = g.loanBlock(id), rate = g.loanRate(id);
  let why = block;
  if (!why && r.room <= 0) why = r.limit - r.owed <= 0.005 ? 'You have drawn this line to its limit. Repay some to borrow again.' : `Borrowing is capped at ${DEBT.maxDE.toFixed(1)} times your net worth. Repay something or grow first.`;
  const pct = B.pct[id] || 0, amount = amountFor(r.room, pct);
  const facts = [['Limit', m(r.limit)], ['Rate', id === 'circle' ? '0%' : `${(rate * 100).toFixed(1)}% per 30 days`], ['Fee', L.fee ? `${(L.fee * 100).toFixed(0)}% upfront` : 'None'], ['Compounds', id === 'circle' ? 'Never' : every(L.every)]];
  if (L.commit) facts.push(['Unused part', `${(L.commit * 100).toFixed(1)}% a month`]);
  facts.push(['You can borrow', m(r.room)]);
  return `<article class="bk-prod${why ? ' off' : ''}" aria-label="${esc(L.name)}"><header class="bk-ph"><span class="bk-ic" aria-hidden="true">${P.icon}</span><div class="grow"><h4>${esc(L.name)}</h4><p class="small mute">${P.line}</p></div></header>
    <dl class="bk-facts">${facts.map(([k, x]) => `<div><dt>${k}</dt><dd class="mono">${x}</dd></div>`).join('')}</dl>
    ${why ? `<p class="bk-why small"><span aria-hidden="true">🔒</span> ${esc(why)}</p>` : `<label for="bk-amt-${id}">Borrow <output data-amt="${id}" class="mono">${m(amount)}</output> of ${m(r.room)}</label>
      <input id="bk-amt-${id}" type="range" min="0" max="100" step="5" value="${pct}" data-input="bank-amt" data-p="${id}" data-fid="ba-${id}">
      <div class="row"><button class="btn ghost" data-act="bank-pct" data-p="${id}" data-v="25" data-fid="bq-${id}-25">25%</button><button class="btn ghost" data-act="bank-pct" data-p="${id}" data-v="50" data-fid="bq-${id}-50">Half</button><button class="btn ghost" data-act="bank-pct" data-p="${id}" data-v="100" data-fid="bq-${id}-100">All of it</button></div>
      <p class="small bk-out" data-out="${id}" aria-live="polite">${drawPreview(v, id, amount)}</p>
      <button class="btn" data-act="bank-draw" data-p="${id}" data-fid="bd-${id}" ${amount <= 0 ? 'aria-disabled="true"' : ''}>Borrow ${m(amount)}</button><p class="bk-why small" data-hint ${amount > 0 ? 'hidden' : ''}>Slide to an amount first.</p>`}</article>`;
}

function loansHTML(v) {
  const { g, s, m } = v;
  if (!s.loans.length) return '';
  const poor = s.cash <= 0;
  return `<section class="bk-sec" aria-label="Open loans"><h3 class="bk-h3">What you owe</h3><div class="bk-grid">${s.loans.map((l) => {
    const L = LOANS[l.prod], rate = g.loanRate(l.prod), owed = l.principal + l.accr;
    return `<article class="bk-loan"><header class="row"><span class="bk-ic" aria-hidden="true">${PRODUCT[l.prod].icon}</span><b class="grow">${esc(L.name)}</b><span class="chip">${l.prod === 'circle' ? '0%' : (rate * 100).toFixed(1) + '% per 30 days'}</span></header>
      <dl class="bk-facts"><div><dt>Balance</dt><dd class="mono">${m(l.principal)}</dd></div><div><dt>Interest so far</dt><dd class="mono ${l.accr > 0.005 ? 'red' : ''}">+${m(l.accr)}</dd></div><div><dt>Total owed</dt><dd class="mono"><b>${m(owed)}</b></dd></div></dl>
      <p class="small mute">${rate ? `Costs about ${m(l.principal * rate / 30)} a day. ` : ''}Interest joins the balance in ${dur(l.next - s.hour)}.</p>
      <div class="row"><button class="btn ghost" data-act="bank-repay" data-anchor="bank-repay" data-id="${l.id}" data-f="half" data-fid="rh-${l.id}" ${poor ? 'aria-disabled="true"' : ''}>Repay half</button><button class="btn" data-act="bank-repay" data-anchor="bank-repay" data-id="${l.id}" data-f="all" data-fid="ra-${l.id}" ${poor ? 'aria-disabled="true"' : ''}>${s.cash < owed && !poor ? `Repay ${m(s.cash)}` : 'Repay all'}</button></div>
      ${poor ? '<p class="bk-why small">You have no cash to repay with.</p>' : s.cash < owed ? `<p class="small mute">You have ${m(s.cash)}, so this repays what you can.</p>` : ''}</article>`;
  }).join('')}</div></section>`;
}

// ---------------------------------------------------------------- audit and exit
function defaultPipe(g) {
  const list = g.s.pipes.filter((p) => p.status !== 'audit');
  return (list.length ? list : g.s.pipes).map((p) => ({ p, d: g.forecast(p).perDay })).sort((a, b) => a.d - b.d)[0]?.p || null;
}
function auditHTML(v) {
  const { g, s, m, B } = v, a = s.auditPending, fine = g.auditFine();
  const hist = `<dl class="bk-facts"><div><dt>Filings passed</dt><dd class="mono">${s.auditPass}</dd></div><div><dt>Failures</dt><dd class="mono ${s.auditFail ? 'red' : ''}">${s.auditFail}</dd></div><div><dt>Manager speed</dt><dd class="mono">${(s.velPenalty * 100).toFixed(0)}%</dd></div><div><dt>Next fine if caught</dt><dd class="mono">${m(fine)}</dd></div></dl>`;
  if (!a) return `<section class="bk-sec" aria-label="Audit"><h3 class="bk-h3">Audits</h3><div class="callout good"><b>No audit waiting.</b>${s.auditNext != null ? ` The next review lands in ${dur(s.auditNext - s.hour)}.` : ''}</div>
    <p class="small mute">Past ${m(MIL.m2)} regulators start asking questions. Each one costs time or money, and ignoring one costs more. Hiring and upgrades stay locked until you have answered your first.</p>${hist}</section>`;
  const fee = AUDIT.fee * Math.max(0.7, 1 - 0.03 * (g.lvl('fintech') - 1)), pick = s.pipes.find((p) => p.id === B.pipe) || defaultPipe(g);
  const lost = pick ? Math.max(0, g.forecast(pick).perDay) * (AUDIT.pauseHours / 24) : 0, canFile = s.cash >= fee;
  const waive = s.ps.fineWaive > 0 ? ' Your family lawyer would make the first fine disappear.' : '';
  return `<section class="bk-sec" aria-label="Audit"><h3 class="bk-h3">Audit: ${esc(a.title)}</h3>
    <div class="callout warn"><b>${esc(a.text)}</b><br>Respond within <b>${dur(a.due - s.hour)}</b>. Doing nothing counts as failing it. Hiring and upgrades stay locked until you answer.</div>
    <div class="bk-choices">
      <div class="bk-choice"><button class="btn" data-act="bank-audit" data-c="A" data-fid="au-a" ${canFile ? '' : 'aria-disabled="true"'}>A. Hire a consultant for ${m(fee)}</button><p class="small">Costs ${m(fee)} once. Nothing else stops. The safe, boring choice.</p>${canFile ? '' : `<p class="bk-why small">You have ${m(s.cash)}; the consultant costs ${m(fee)}.</p>`}</div>
      <div class="bk-choice"><button class="btn" data-act="bank-audit" data-c="B" data-fid="au-b" ${pick ? '' : 'aria-disabled="true"'}>B. Pull a manager off the line</button>
        ${pick ? `<label for="bk-apipe">Who does the paperwork?</label><select id="bk-apipe" data-change="bank-apipe" data-fid="bk-apipe">${s.pipes.map((p) => `<option value="${p.id}" ${p.id === pick.id ? 'selected' : ''}>${esc(PIPE[p.kind].name)} in ${esc(ZONES[p.zone].short)}: ${esc(ASSETS[p.cls]?.name || 'no lane')} to ${esc(BUYERS[p.buyer]?.name || '?')}</option>`).join('')}</select>` : ''}
        <p class="small">No cash, but that manager stops for ${AUDIT.pauseHours / 24} days. That costs you about ${m(lost)} in profit.</p>${pick ? '' : '<p class="bk-why small">You have no manager to spare. Choose another path.</p>'}</div>
      <div class="bk-choice"><button class="btn danger" data-act="bank-audit" data-c="C" data-fid="au-c">C. Skip the filing and hope</button><p class="small">${Math.round(AUDIT.passChance * 100)}% chance nobody notices. ${Math.round((1 - AUDIT.passChance) * 100)}% chance of a ${m(fine)} fine and every manager running ${Math.round((1 - AUDIT.velocityHit) * 100)}% slower for good. Each failure makes the next fine 50% bigger.${waive}</p></div></div>${hist}</section>`;
}

function exitCard(v, kind) {
  const { g, m } = v, q = g.exitQuote(kind), name = kind === 'ipo' ? 'IPO' : 'Trade sale', line = kind === 'ipo' ? 'Go public. Pays more per dollar of daily profit, and needs a clean audit record.' : 'Sell the whole business to a buyer. Quicker, and no record needed.';
  return `<article class="bk-exit"><h4>${name}</h4><p class="small mute">${line}</p>${q.ok
    ? `<p class="small">You would walk away with about <b class="gold">${m(q.proceeds)}</b> in 48 hours. Your score would lock at <b class="green">${q.eeiIfNow.toFixed(2)}</b>.</p><button class="btn" data-act="bank-exit" data-k="${kind}" data-fid="ex-${kind}">See the numbers</button>`
    : `<p class="bk-why small">${esc(q.msg)}</p><button class="btn" data-act="bank-exit" data-k="${kind}" data-fid="ex-${kind}" aria-disabled="true">See the numbers</button>`}</article>`;
}
function exitHTML(v) {
  const { g, s, m } = v;
  let body;
  if (s.exiting) body = `<div class="callout good"><b>Your exit is settling.</b> ${dur(s.exiting.at - s.hour)} to go. The sale money lands then.</div>`;
  else if (s.exit) body = `<div class="callout good"><b>You exited.</b> Your score is locked at ${m(s.exit.nw)} with ${Math.round(s.exit.daysLeft)} days to spare.</div>`;
  else if (s.over) body = `<p class="small mute">The run is over. Your score is locked at <b>${g.eei().toFixed(2)}</b>.</p>`;
  else body = `<p class="small mute">Exiting ends your run early and locks your score. The score multiplier is 1 plus the days you have left over 90, so leaving early only wins if you could not have grown more than that by playing on. If you stopped now your score would be <b>${g.eei().toFixed(2)}</b>.</p><div class="bk-grid">${exitCard(v, 'sale')}${exitCard(v, 'ipo')}</div>`;
  return `<section class="bk-sec" aria-label="Exit"><h3 class="bk-h3">Exit</h3>${body}</section>`;
}

// ---------------------------------------------------------------- ledger
export function ledgerCsv(rows) {
  const out = [['day', 'hour', 'type', 'description', 'amount', 'creativity_multiplier'], ...rows.map((e) => [Math.floor(e.h / 24) + 1, e.h, e.type, e.text, e.amt.toFixed(2), e.cm ? e.cm.toFixed(3) : ''])];
  return out.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
}
function ledgerHTML(v) {
  const { s, m, B } = v, open = B.ledger;
  const types = ['all', ...[...new Set(s.ledger.map((e) => e.type))].sort()];
  const f = types.includes(B.logf) ? B.logf : 'all', head = s.ledger[0]?.type === 'summary' && (f === 'all' || f === 'summary') ? s.ledger[0] : null;
  // newest first, and the summary of what was folded away (the oldest line there is) is always at the foot of the list, never cut off by the forty
  const body = [...s.ledger].reverse().filter((e) => e !== head && (f === 'all' || e.type === f)).slice(0, 40), rows = head ? [...body, head] : body;
  return `<section class="bk-sec" aria-label="Ledger"><button class="btn ghost bk-lt" data-act="bank-ledger" aria-expanded="${open}" data-fid="bk-ledger"><span aria-hidden="true">${open ? '▾' : '▸'}</span> Ledger: what you did, and what it gained or cost you</button>
    ${open ? `<div class="row bk-lf"><label for="bk-logf">Show</label><select id="bk-logf" data-change="bank-logf" data-fid="bk-logf">${types.map((t) => `<option value="${esc(t)}" ${t === f ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select><span class="grow"></span><button class="btn ghost" data-act="bank-csv" data-fid="bk-csv">Download CSV</button></div>
      <p class="small mute">The last ${body.length} of ${plural(s.ledger.length, 'line')}. A line is a gain or a cost, not always a cash payment (a sale is booked against its fair value, a swap by what it was worth), so the lines do not add up to your cash.${s.ledgerDropped ? ` The ${plural(s.ledgerDropped, 'oldest line')} ${s.ledgerDropped === 1 ? 'is' : 'are'} folded into one summary line at the foot of the list, with their totals by type; the download has that line and every other.` : ' The download holds all of them.'}</p>
      <div class="scroll bk-scroll"><table class="tbl"><thead><tr><th scope="col">Day</th><th scope="col">Type</th><th scope="col">What</th><th scope="col" class="right">Amount</th></tr></thead><tbody>${rows.map((e) => `<tr><td class="mono">${Math.floor(e.h / 24) + 1}</td><td>${esc(e.type)}</td><td>${esc(e.text)}</td><td class="right mono ${e.amt >= 0 ? 'green' : 'red'}">${e.amt ? m(e.amt, { plus: true }) : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="mute">Nothing yet.</td></tr>'}</tbody></table></div>` : ''}</section>`;
}

// ---------------------------------------------------------------- the drawer
function keepScroll(ctx) {
  const db = ctx.el?.drawer?.querySelector?.('.db');
  if (!db || db.dataset.drawer !== 'bank' || !db.scrollTop) return;
  const top = db.scrollTop;
  queueMicrotask(() => { const n = ctx.el.drawer.querySelector('.db'); if (n && n.dataset.drawer === 'bank') n.scrollTop = top; });
}

export default {
  id: 'bank', icon: '🏦', label: 'Bank',
  visible: (ctx) => !!ctx.g().s.mil.m1,
  badge: (ctx) => { const g = ctx.g(), s = g.s; const n = (s.auditPending ? 1 : 0) + (g.debt() > 0 && g.deRatio() > DEBT.maxDE ? 1 : 0); return n || null; },
  html(ctx) {
    keepScroll(ctx);
    const v = view(ctx), { g, s, m } = v, mods = g.mods(), ids = products(v);
    const gate = s.mil.m1
      ? `${mods.freeze ? '<div class="callout bad"><b>Credit freeze.</b> No new loans until it lifts. Your open loans are re-rating at the new rate.</div>' : ''}
         <section class="bk-sec" aria-label="Loans"><h3 class="bk-h3">Borrow</h3><div class="bk-grid">${ids.map((id) => productCard(v, id)).join('')}</div></section>${loansHTML(v)}`
      : `<div class="callout warn"><b>The Commercial Bank opens at ${m(MIL.m1)} net worth.</b> You are at ${m(g.netWorth())}. Read the rules above first: borrowing is a lever, and levers cut both ways.</div>`;
    return `<div class="bk">${gaugeHTML(v)}${gate}${s.mil.m2 ? auditHTML(v) : ''}${s.mil.m3 ? exitHTML(v) : ''}${ledgerHTML(v)}</div>`;
  },
  acts(ctx) {
    const g = () => ctx.g();
    return {
      'bank-amt'(el) {
        const id = el.dataset.p, v = view(ctx); v.B.pct[id] = Math.max(0, Math.min(100, +el.value || 0));
        const amount = amountFor(g().loanRoom(id).room, v.B.pct[id]), card = el.closest?.('.bk-prod');
        const out = card?.querySelector?.('[data-out]'), amt = card?.querySelector?.('[data-amt]'), btn = card?.querySelector?.('[data-act="bank-draw"]'), hint = card?.querySelector?.('[data-hint]');
        if (hint) hint.hidden = amount > 0;
        if (out) out.innerHTML = drawPreview(v, id, amount);
        if (amt) amt.textContent = v.m(amount);
        if (btn) { btn.textContent = 'Borrow ' + v.m(amount); btn.setAttribute('aria-disabled', String(amount <= 0)); }
      },
      'bank-pct'(el) { ST(ctx).pct[el.dataset.p] = +el.dataset.v; ctx.render(); },
      'bank-draw'(el) {
        const id = el.dataset.p, v = view(ctx), amount = amountFor(g().loanRoom(id).room, v.B.pct[id] || 0);
        if (amount <= 0) { ctx.toast('Slide to an amount first.', 'warn'); return; }
        const r = ctx.say(g().draw(id, amount), 'info');
        if (r.ok) { v.B.pct[id] = 0; ctx.sfx.blip(); }
        ctx.render();
      },
      'bank-repay'(el) {
        const game = g(), l = game.s.loans.find((x) => x.id === el.dataset.id); if (!l) return;
        const owed = l.principal + l.accr, r = ctx.say(game.repay(l.id, el.dataset.f === 'half' ? owed / 2 : owed));
        if (r.ok && !game.s.loans.length) { ctx.toast('Debt-free. Every loan is paid off.', 'good'); ctx.sfx.level(); ctx.burst({ power: 0.8 }); } else if (r.ok) ctx.sfx.blip();
        ctx.render();
      },
      'bank-apipe'(el) { ST(ctx).pipe = el.value; },
      'bank-audit'(el) {
        const game = g(), B = ST(ctx), choice = el.dataset.c;
        const pid = choice === 'B' ? (game.s.pipes.find((p) => p.id === B.pipe) || defaultPipe(game))?.id : undefined;
        ctx.say(game.resolveAudit(choice, pid), 'info'); ctx.render();
      },
      'bank-exit'(el) {
        const game = g(), k = el.dataset.k, q = game.exitQuote(k), m = ctx.money;
        if (!q.ok) { ctx.toast(q.msg, 'bad', undefined, { refusal: true }); return; }
        ctx.confirmBox(k === 'ipo' ? 'Go public (IPO)?' : 'Sell the business?', `<dl class="kv"><dt>Cash</dt><dd>${m(game.s.cash)}</dd><dt>Assets and managers (book)</dt><dd>${m(q.hard)}</dd><dt>Going-concern premium (${+((k === 'ipo' ? 10 : 6) * game.B.exitMult).toFixed(1)}x average daily profit of ${m(q.avg)})</dt><dd>${m(q.premium)}</dd><dt>Brokerage ${Math.round(FEES.exitBrokerage * 100)}%</dt><dd class="red">-${m(q.brokerage)}</dd><dt>Debt repaid</dt><dd class="red">-${m(game.debt())}</dd><div class="sep"></div><dt>You receive in 48 hours</dt><dd class="gold">${m(q.proceeds)}</dd><dt>Score locked at</dt><dd class="green">${q.eeiIfNow.toFixed(2)}</dd><dt>Score if you play on (today)</dt><dd>${game.eei().toFixed(2)}</dd></dl><p class="small mute">This ends your run and locks the score. Nothing is undone.</p>`, 'Exit now', () => { ctx.say(game.exit(k)); }, true);
      },
      'bank-ledger'() { const B = ST(ctx); B.ledger = !B.ledger; ctx.render(); },
      // a focused select blocks the shell's redraw, so let go of it, draw, then take it back
      'bank-logf'(el) { ST(ctx).logf = el.value; el.blur?.(); ctx.render(); ctx.el?.drawer?.querySelector?.('[data-fid="bk-logf"]')?.focus?.({ preventScroll: true }); },
      'bank-csv'() {
        if (typeof document === 'undefined') return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([ledgerCsv(g().s.ledger)], { type: 'text/csv' })); a.download = `paperclip-ledger-${g().s.pid}.csv`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      },
    };
  },
};
