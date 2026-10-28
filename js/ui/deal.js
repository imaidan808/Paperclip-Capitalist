// The Deal Room (docs/V2_DESIGN.md section 6): one modal sheet that plays a deal in up to three stages (Read, Pitch, Close / Bid / Fix),
// with a character, a speech bubble, a scoreboard and a result screen that says what Quick and an expert would have got.
//
// Everything that decides anything is in ../deal.js (pure, tested). This file has two halves:
//   * HTML builders, (model) -> string, exported so they can be tested without a DOM. They only ever see modelOf(run), which never holds a lot's truth.
//   * createSession(ctx, run): the thin DOM half. It forwards clicks (data-deal="...") to the run, repaints the sheet, runs the repair dial and
//     plays the sounds. openDeal(ctx, spec) is the one function the shell calls.
import { esc } from './common.js';
import { kv } from '../session.js';
import { fmtMoney as money, fmtPct } from '../market.js';
import { startRun, modelOf, tForPos, STAGE_LABEL } from '../deal.js';
import { pos as dialPos } from '../play/repair.js';
import { countUp } from './polish.js';

const num = (x, d = 0) => (Number.isFinite(x) ? x : d);
const pc = (x) => `${Math.round(num(x) * 100)}%`;
const at = (v, lo, hi) => `${Math.max(0, Math.min(100, ((num(v) - lo) / Math.max(1e-9, hi - lo)) * 100)).toFixed(1)}%`;
/** "+12% vs fair": a price against the fair price, for the offer cards. Empty when there is nothing to compare with. */
const vsFair = (price, fair) => (Number.isFinite(price) && fair > 0 ? `${price >= fair ? '+' : '-'}${Math.abs(Math.round((price / fair - 1) * 100))}% vs fair` : '');
/** Where a concession of size k leaves your number. view().steps holds the SIZE of each move (a distance, not a price), so it is taken from your
 *  number when you ask (sell) and added to it when you offer (buy); the last step stops at the floor, as the haggle itself does (js/play/haggle.js, concede).
 *  Null when there is no number of yours yet. Exported so the card and its test read the one rule. */
export function concedeTo(v, k) {
  const step = v && v.steps ? v.steps[k] : null;
  if (!v || !Number.isFinite(v.yours) || !Number.isFinite(step)) return null;
  const buy = v.role === 'buy', to = buy ? v.yours + step : v.yours - step;
  return Number.isFinite(v.floor) ? (buy ? Math.min(to, v.floor) : Math.max(to, v.floor)) : to;
}
const flip = (v, lo, hi) => ((num(v) - lo) / Math.max(1e-9, hi - lo) > 0.8 ? ' flip' : ''); // a label near the right edge hangs to the left of its line
const ANGLE = { prestige: ['👑', 'Prestige', 'status, standing, how it looks to others'], utility: ['🔧', 'Utility', 'what it does and how well'], scarcity: ['⏳', 'Scarcity', 'rare, now or never'], price: ['🏷️', 'Price', 'a bargain, good value'], story: ['📖', 'Story', 'where it came from, why it matters'] };
const PROBE = { look: ['👀', 'Look it over', 'Cheap. Catches obvious wear.'], serial: ['🔎', 'Check the serial', 'The best test for a counterfeit.'], power: ['⚡', 'Power it up', 'The sharpest read on condition.'], papers: ['📄', 'Read the paperwork', 'A cheap second opinion on both.'], expert: ['🧑‍🔧', 'Hire an expert', 'Dear, but needs no skill of yours.'] };
const TELL = { far: 'far apart', reach: 'getting closer', near: 'very close' };
const MOOD = { steady: 'steady', loud: 'loud', quiet: 'quiet' };

// ------------------------------------------------------------------ the frame
export const titleOf = (m) => {
  const p = m.plan;
  return p.kind === 'sell' ? `Sell ${p.asset.name} to ${p.buyer.name}` : p.kind === 'buy' ? `${p.auction ? 'Bid on' : 'Buy'} ${p.lot.name}` : `Repair ${p.asset.name}`;
};
export function stepperHTML(m) {
  const word = { done: 'done', now: 'now', todo: 'to come', skipped: 'skipped' };
  return `<ol class="deal-steps" aria-label="Deal stages">${m.steps.map((s, i) => `<li class="ds ${s.status}"${s.status === 'now' ? ' aria-current="step"' : ''}><span class="n" aria-hidden="true">${s.status === 'done' ? '✓' : i + 1}</span><span class="t">${esc(s.label)}</span><span class="sr"> (${word[s.status]})</span></li>`).join('')}</ol>`;
}
export function castHTML(m) {
  const c = m.cast, bubble = m.say || c.hello, role = { buyer: 'Buyer', seller: 'Seller', bench: 'Workbench' }[c.role] || '';
  const talk = m.says.length > 1 ? `<details class="deal-log"><summary>Talk so far</summary><ol>${m.says.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></details>` : '';
  return `<section class="deal-cast" aria-label="${esc(c.name)}">
    <div class="cast-floor"><div class="cast-icon" aria-hidden="true">${c.icon}</div></div>
    <h3 class="cast-name">${esc(c.name)}</h3>
    <p class="cast-role"><span class="cast-tag">${esc(role)}</span>${c.style && c.style !== 'steady' ? `<span class="cast-mood">${esc(c.style)}</span>` : ''}</p>
    <div class="bubble" role="status" aria-live="polite"><p>${esc(bubble)}</p></div>${talk}
  </section>`;
}
export function scoreHTML(m) {
  const v = m.view, p = m.plan, chips = [['Cash', money(m.cash)]]; // a third entry marks the figure to watch at this stage
  if (p.kind === 'sell') chips.push(['Fair price', money(p.fair)], ['Their budget', money(p.budget)]);
  if (p.kind === 'buy') chips.push([p.auction ? 'Guide price' : m.stage === 'close' ? 'Fair price' : 'Listed price', money(p.lot.price)]);
  if (p.kind === 'repair') chips.push(['Quote', money(p.quote.cost)], ['Worth after', money(p.quote.after)]);
  if (m.stage === 'read' && v) chips.push(['Points left', `${v.left} of ${v.budget}`, 1]);
  if (m.stage === 'close' && v) chips.push(['Rounds left', v.roundsLeft == null ? '-' : `${v.roundsLeft} of ${v.rounds}`], [p.kind === 'buy' ? 'Your offer' : 'Your ask', v.yours == null ? '-' : money(v.yours), 1], [p.kind === 'buy' ? 'Their ask' : 'Their offer', v.theirs == null ? '-' : money(v.theirs), 1]);
  if (m.stage === 'bid' && v) chips.push(['Price', v.price == null ? 'no bids' : money(v.price), 1], ['Next bid', money(v.nextBid), 1]);
  if (m.stage === 'fix' && v) chips.push(['Step', `${Math.min(v.step + 1, v.steps)} of ${v.steps}`, 1]);
  return `<dl class="deal-score" aria-label="Scoreboard">${chips.map(([k, x, hot]) => `<div${hot ? ' class="hot"' : ''}><dt>${esc(k)}</dt><dd>${esc(x)}</dd></div>`).join('')}</dl>`;
}
const advice = (m, extra = '') => (m.advice && m.assist ? `<div class="callout deal-hint" role="note"><b>Assist.</b> ${esc(m.advice.text)}${extra}</div>` : '');
const quickBtn = (label, anchor = true) => `<button class="btn ghost" data-deal="quick-stage"${anchor ? ' data-anchor="deal-quick"' : ''} data-fid="dq">${esc(label)}</button>`;
export const QUICK_LABEL = 'Quick: auto-play at average skill';
function footHTML(m) {
  if (m.stage === 'result') return '';
  const bits = [];
  if (m.stageDone) bits.push(m.last ? '<button class="btn big" data-deal="finish" data-fid="go" autofocus>See the result</button>' : '<button class="btn big" data-deal="next" data-fid="go" autofocus>Continue</button>');
  else if (m.canQuick) bits.push(quickBtn(QUICK_LABEL));
  if (m.first && m.steps.length > 1 && m.canQuick) bits.push('<button class="btn ghost" data-deal="quick-all" data-anchor="deal-quick" data-fid="qa">Quick deal</button>');
  return bits.length ? `<footer class="deal-foot">${bits.join('')}</footer>` : '';
}
const panel = (m, key, title, lede, body) => `<section class="deal-stage" data-anchor="deal-stage-${key}" aria-labelledby="ds-title"><h3 id="ds-title" tabindex="-1" data-stage-head>${esc(title)}</h3>${lede ? `<p class="lede">${esc(lede)}</p>` : ''}${m.blocker ? `<div class="callout warn" role="alert">${esc(m.blocker)}</div>` : ''}${body}</section>`;
const quickNote = (m) => (m.quickRes ? `<div class="callout ${m.quickRes.ok ? '' : 'warn'}"><b>Quick.</b> ${esc(m.quickRes.text)}</div>` : '');

// ------------------------------------------------------------------ Read (Inspect)
export function readHTML(m) {
  const v = m.view, p = m.plan.lot;
  const lot = `<div class="lotcard"><span class="ic" aria-hidden="true">${p.icon}</span><div><b>${esc(p.name)}</b><div class="small mute">${p.cond === 'broken' ? 'Sold as broken' : 'Sold as working'} · ${p.mode === 'auction' ? 'guide' : 'listed at'} ${money(p.price)}</div></div></div>`;
  if (!v) return panel(m, 'read', 'Read the lot', 'Spend a few probes to learn what the seller will not tell you.', `${lot}${m.stageDone ? quickNote(m) : ''}`);
  const probes = v.probes.map((x) => {
    const [ic, nm, why] = PROBE[x.id];
    return `<button class="probe${x.used ? ' used' : ''}${m.advice && m.advice.probe === x.id ? ' rec' : ''}" data-deal="probe" data-id="${x.id}" data-fid="pr-${x.id}" ${x.affordable && !m.stageDone ? '' : 'disabled'}><span class="pic" aria-hidden="true">${ic}</span><span class="pnm">${esc(nm)}</span><span class="pco">${x.used ? 'done' : `${x.cost} pt${x.cost > 1 ? 's' : ''}`}</span><span class="pwh">${esc(why)}</span></button>`;
  }).join('');
  const pips = Array.from({ length: v.budget }, (_, i) => `<i class="${i < v.spent ? 'spent' : ''}"></i>`).join('');
  const q = v.belief.quality, sd = v.doubt;
  const ev = v.evidence.map((e) => `<li><span><span class="evi" aria-hidden="true">${PROBE[e.id][0]}</span><b>${esc(PROBE[e.id][1])}.</b> ${esc(e.text)}</span></li>`).join('');
  const belief = `<div class="belief" aria-label="Your current read">
      <div><span class="bl">Condition, as a share of what the seller describes</span><b>about ${pc(q)}</b> <span class="mute small">(give or take ${Math.round(sd * 100)} points)</span>
        <div class="meter" aria-hidden="true"><i class="rng" style="left:${at(q - sd, 0.6, 1.2)};width:${at(q + sd, 0.6, 1.2) === at(q - sd, 0.6, 1.2) ? '2%' : `calc(${at(q + sd, 0.6, 1.2)} - ${at(q - sd, 0.6, 1.2)})`}"></i><i class="mk" style="left:${at(q, 0.6, 1.2)}"></i></div></div>
      <div><span class="bl">Chance it is a counterfeit</span><b>${pc(v.belief.fakeProb)}</b>
        <div class="meter fake" aria-hidden="true"><i class="fill" style="width:${pc(v.belief.fakeProb)}"></i></div></div></div>`;
  const done = m.stageDone
    ? `<div class="callout good"><b>You have read the lot.</b> Whatever you could not check, you will pay for. Continue when you are ready.</div>`
    : `<div class="row"><button class="btn" data-deal="read-done" data-fid="rd">Done reading</button><button class="btn ghost" data-deal="pass" data-fid="pass">Pass on this lot</button></div>`;
  return panel(m, 'read', 'Read the lot', 'Every probe is a noisy look. Points are scarce, so the question is which probe is worth its price.', `${lot}
    ${m.blocker ? '' : `<p class="seller-line">${esc(v.opening)}</p>${v.warning ? `<div class="callout info" role="note">${esc(v.warning)}</div>` : ''}`}
    <div class="pts" role="img" aria-label="${v.left} of ${v.budget} points left"><span class="small mute">Points</span><span class="pips">${pips}</span></div>
    <div class="probes">${probes}</div>${ev ? `<ul class="evidence">${ev}</ul>` : ''}${belief}${m.stageDone ? '' : advice(m)}${quickNote(m)}${done}`);
}

// ------------------------------------------------------------------ Pitch
export function pitchHTML(m) {
  const v = m.view, p = m.plan;
  const head = `<div class="lotcard"><span class="ic" aria-hidden="true">${p.asset.icon}</span><div><b>${esc(p.asset.name)}</b><div class="small mute">to ${esc(p.buyer.name)} · ${esc(p.quote.fitLabel)} (${pc(p.quote.fit)})${p.need ? ` · needs something ${esc(p.need)}` : ''}</div></div></div>`;
  const verify = p.canVerify && !p.verified ? `<div class="callout warn"><b>Scam magnet.</b> Online buyers are sometimes fraudulent. <button class="btn sm" data-deal="verify" data-fid="vf">Verify this buyer (${money(p.verifyCost)})</button></div>` : p.verified ? `<div class="callout ${p.scam ? 'bad' : 'good'}">${p.scam ? 'Fraud confirmed. Skip this buyer.' : 'Verified: this buyer is genuine.'}</div>` : '';
  if (!v) return panel(m, 'pitch', 'Pitch', 'Choose the two angles that match this buyer.', `${head}${verify}${m.stageDone ? quickNote(m) : ''}`);
  const feat = Object.fromEntries(v.angles.map((a) => [a, 0]));
  for (const f of v.asset.features) feat[f.angle] = Math.max(feat[f.angle], f.strength);
  const hinted = new Set([...(v.likely ? v.likely.angles : [])]), sel = m.pick || [], lock = m.stageDone || !!m.blocker;
  const btns = v.angles.map((a) => {
    const [ic, nm, why] = ANGLE[a], on = sel.includes(a), rec = m.assist && m.advice && m.advice.angles.includes(a), backed = feat[a] >= 0.6 ? 'strongly' : feat[a] >= 0.3 ? 'somewhat' : 'barely';
    return `<button class="angle${on ? ' on' : ''}${rec ? ' rec' : ''}" data-deal="angle" data-angle="${a}" aria-pressed="${on}" data-fid="an-${a}" ${lock ? 'disabled' : ''}>
      ${on ? `<span class="apick" aria-hidden="true">${sel.indexOf(a) + 1}</span>` : ''}<span class="aic" aria-hidden="true">${ic}</span><span class="anm">${nm}</span><span class="awh">${esc(why)}</span>
      <span class="abar" role="img" aria-label="Your goods back this up: ${backed}"><i style="width:${pc(feat[a])}"></i></span><span class="atag" aria-hidden="true">Backed ${backed}</span>${hinted.has(a) ? '<span class="ahint">Buyer leans this way</span>' : ''}</button>`;
  }).join('');
  const hints = v.hints.length ? `<ul class="hints">${v.hints.map((h) => `<li>${esc(h.text)}</li>`).join('')}</ul>` : '';
  const needs = v.buyer.needs.length ? `<p class="small mute">They are looking for: ${v.buyer.needs.map((t) => `<span class="chip">${esc(t)}</span>`).join(' ')}</p>` : '';
  const out = v.outcome ? `<div class="callout ${v.outcome.fitDelta >= 0.05 ? 'good' : v.outcome.fitDelta <= -0.03 ? 'warn' : ''}"><b>${v.outcome.fitDelta >= 0 ? '+' : ''}${v.outcome.fitDelta.toFixed(2)} fit.</b> The buyer is x${v.outcome.mult.toFixed(2)} as keen. ${esc(v.outcome.say)}</div>` : '';
  const go = m.stageDone ? '' : `<div class="row"><button class="btn" data-deal="pitch-go" data-fid="pg" ${sel.length === 2 && !m.blocker ? '' : 'disabled'}>${sel.length === 2 ? `Pitch ${ANGLE[sel[0]][1]} and ${ANGLE[sel[1]][1]}` : `Pick ${2 - sel.length} more angle${sel.length === 1 ? '' : 's'}`}</button></div>`;
  return panel(m, 'pitch', 'Pitch', 'Lead with the two angles this buyer responds to AND your goods can honestly back up. A claim you cannot back is worse than silence.',
    `${head}${verify}${needs}${hints}<div class="angles" role="group" aria-label="Pitch angles, choose two">${btns}</div>${m.stageDone ? '' : advice(m)}${out}${quickNote(m)}${go}`);
}

// ------------------------------------------------------------------ Close (Haggle)
const can = (v, type, k, val) => v.actions.some((a) => a.type === type && (k == null || a[k] === val));
export function closeHTML(m) {
  const v = m.view, p = m.plan, buy = p.kind === 'buy';
  if (m.auto) return panel(m, 'close', 'Close', '', `<div class="callout">${esc(m.auto)}</div>`);
  if (!v) return panel(m, 'close', 'Close', buy ? 'Agree a price with the seller.' : 'Agree a price with the buyer.', `${m.stageDone ? quickNote(m) : ''}`);
  const lo = v.fair * 0.55, hi = v.fair * 1.45, rec = m.advice && m.advice.action;
  const recIf = (type, k, val) => (rec && rec.type === type && (k == null || rec[k] === val) ? ' rec' : '');
  const track = `<div class="neg-track" aria-hidden="true"><i class="band" style="left:${at(v.read.lo, lo, hi)};width:calc(${at(v.read.hi, lo, hi)} - ${at(v.read.lo, lo, hi)})"></i><i class="fair" style="left:${at(v.fair, lo, hi)}"></i>
    ${v.yours != null && v.theirs != null && v.yours !== v.theirs ? `<i class="gap" style="left:${at(Math.min(v.yours, v.theirs), lo, hi)};width:calc(${at(Math.max(v.yours, v.theirs), lo, hi)} - ${at(Math.min(v.yours, v.theirs), lo, hi)})"></i>` : ''}${v.yours != null ? `<i class="you${flip(v.yours, lo, hi)}" style="left:${at(v.yours, lo, hi)}"><b>You</b></i>` : ''}${v.theirs != null ? `<i class="them${flip(v.theirs, lo, hi)}" style="left:${at(v.theirs, lo, hi)}"><b>Them</b></i>` : ''}</div>
    <div class="neg-scale" aria-hidden="true"><span>${money(lo)}</span><span>fair ${money(v.fair)}</span><span>${money(hi)}</span></div>`;
  const pips = `<span class="pips" role="img" aria-label="${v.roundsLeft} round${v.roundsLeft === 1 ? '' : 's'} left of ${v.rounds}">${Array.from({ length: v.rounds }, (_, i) => `<i class="${i < v.round ? 'spent' : ''}"></i>`).join('')}</span>`;
  const read = `<p class="small">Your read of their limit: <b>${money(Math.min(v.read.lo, v.read.hi))} to ${money(Math.max(v.read.lo, v.read.hi))}</b>. ${m.plan.alt ? `Your other option: <b>${money(m.plan.alt)}</b>.` : ''}</p>`;
  const flag = v.flag === 'mad' ? '<div class="callout warn">They took offence at that number.</div>' : v.flag === 'sus' ? '<div class="callout warn">They are suspicious of a price that low.</div>' : '';
  let moves;
  if (m.stageDone) moves = '';
  else if (v.round === 0) {
    const L = buy ? { high: ['Generous', 'offer'], fair: ['Fair', 'offer'], low: ['Lowball', 'offer'] } : { high: ['Aim high', 'ask'], fair: ['Fair', 'ask'], low: ['Quick sale', 'ask'] }, G = { high: '\u25b2', fair: '\u25c6', low: '\u25bc' };
    moves = `<p class="small">Your first number pulls the whole talk toward it. ${buy ? 'Offering' : 'Asking'}:</p><div class="moves anchors">${['high', 'fair', 'low'].map((lv) => `<button class="move${recIf('anchor', 'level', lv)}" data-deal="anchor" data-level="${lv}" data-fid="mv-${lv}" ${can(v, 'anchor', 'level', lv) ? '' : 'disabled'}><span><span aria-hidden="true">${G[lv]}</span> ${L[lv][0]}</span><b>${money(v.anchors[lv])}</b><small class="mv-d">${vsFair(v.anchors[lv], v.fair)}</small></button>`).join('')}</div>
      <div class="row"><button class="btn ghost sm" data-deal="walk" data-fid="walk">${buy ? 'Pass on this lot' : 'Walk away'}</button></div>`;
  } else {
    const verb = buy ? 'Raise your offer' : 'Come down', landNote = (w, k) => { const to = concedeTo(w, k), d = to == null ? '' : vsFair(to, w.fair); return d && `lands ${d}`; }, sz = (k) => `<button class="move${recIf('concede', 'size', k)}" data-deal="concede" data-size="${k}" data-fid="mv-${k}" ${can(v, 'concede', 'size', k) ? '' : 'disabled'}><span>${verb}</span><b>${money(v.steps[k])}</b><small class="mv-d">${landNote(v, k)}</small></button>`;
    moves = `<div class="moves">
      <button class="move${recIf('hold')}" data-deal="hold" data-fid="mv-hold"><span>Hold</span><b>${money(v.yours)}</b><small class="mv-d">${vsFair(v.yours, v.fair)}</small></button>${sz('small')}${sz('medium')}${sz('large')}
      <button class="move${recIf('split')}" data-deal="split" data-fid="mv-split" ${can(v, 'split') ? '' : 'disabled'}><span>Split the difference</span><b>${v.yours != null && v.theirs != null ? money((v.yours + v.theirs) / 2) : '-'}</b><small class="mv-d">${v.yours != null && v.theirs != null ? vsFair((v.yours + v.theirs) / 2, v.fair) : ''}</small></button>
      ${v.alt != null ? `<button class="move${recIf('leverage')}" data-deal="leverage" data-fid="mv-lev" ${v.canLeverage ? '' : 'disabled'}><span>Mention your other option</span><b>${money(v.alt)}</b></button>` : ''}
      <button class="move good${recIf('accept')}" data-deal="accept" data-fid="mv-acc"><span>Accept their ${buy ? 'price' : 'offer'}</span><b>${money(v.theirs)}</b><small class="mv-d">${vsFair(v.theirs, v.fair)}</small></button>
      <button class="move bad" data-deal="walk" data-fid="walk"><span>Walk away</span><b>no deal</b></button></div>`;
  }
  const last = v.history.length ? '' : '';
  const status = v.tell && !m.stageDone ? `<p class="small">They are <b>${TELL[v.tell]}</b>. ${v.final ? '<b>Final round.</b>' : ''}</p>` : '';
  const end = m.stageDone ? `<div class="callout ${m.res && m.res.deal ? 'good' : 'warn'}">${esc(m.res && m.res.deal ? `Agreed at ${money(m.res.price)}.` : 'No deal was struck.')}</div>` : '';
  return panel(m, 'close', 'Close', buy ? 'Haggle with the seller. The listed price is the fair price; sellers open higher, and they have a minimum you cannot see.' : 'Haggle with the buyer. They have a limit you cannot see; your read narrows it.',
    `<div class="negrow"><span class="small mute">Rounds</span>${pips}</div>${track}${read}${status}${flag}${m.stageDone ? '' : advice(m)}${moves}${quickNote(m)}${end}`);
}

// ------------------------------------------------------------------ Bid (Auction)
const EV = { bid: (e) => `${e.who} bid ${money(e.price)}`, jump: (e) => `${e.who} jumped to ${money(e.price)}`, drop: (e) => `${e.who} dropped out at ${money(e.price)}`, wait: (e) => `${e.who} said nothing`, sold: (e) => `Sold to ${e.who} for ${money(e.price)}`, nosale: () => 'No sale' };
export function bidHTML(m) {
  const v = m.view, p = m.plan.lot;
  if (!v) return panel(m, 'bid', 'Bid', 'Raise or drop out. Never bid past what you think it is worth.', m.stageDone ? quickNote(m) : '');
  const lo = v.opening, hi = Math.max(v.budget || p.price * 1.4, v.nextBid, lo + 0.01), rec = m.advice && m.advice.action;
  const riv = v.rivals.map((r) => `<li class="${r.active ? 'in' : 'out'}${r.high ? ' top' : ''}"><b>${esc(r.name)}</b> <span class="mute small">${MOOD[r.mood] || r.mood}</span> <span class="small">${r.active ? (r.high ? 'high bidder' : 'in') : `out at ${money(r.droppedAt)}`}</span></li>`).join('');
  const ladder = `<div class="neg-track auc" aria-hidden="true">${v.price != null ? `<i class="them${flip(v.price, lo, hi)}" style="left:${at(v.price, lo, hi)}"><b>${esc(v.high || '')}</b></i>` : ''}<i class="fair" style="left:${at(v.estimate, lo, hi)}"></i></div>
    <div class="neg-scale" aria-hidden="true"><span>${money(lo)}</span><span>your estimate ${money(v.estimate)}</span><span>${money(hi)}</span></div>`;
  const ev = v.events.slice(-6).map((e) => `<li>${esc((EV[e.kind] || EV.bid)(e))}</li>`).join('');
  const act = m.stageDone ? '' : `<div class="moves auc-moves"><button class="move paddle${rec && rec.type === 'bid' ? ' rec' : ''}" data-deal="bid" data-fid="bid" ${can(v, 'bid') ? '' : 'disabled'}><span>${v.price == null ? 'Open the bidding' : 'Bid'}</span><b>${money(v.nextBid)}</b></button>
      <button class="move bad${rec && rec.type === 'drop' ? ' rec' : ''}" data-deal="drop" data-fid="drop"><span>Drop out</span><b>keep your cash</b></button></div>`;
  const end = m.stageDone ? `<div class="callout ${m.res && m.res.won ? 'good' : ''}">${esc(m.res && m.res.won ? `You won at ${money(m.res.price)}.` : 'You are out. The lot goes to someone else.')}</div>` : '';
  const budget = v.budget != null && v.nextBid > v.budget ? '<div class="callout warn">The next bid is past your budget. All you can do is drop.</div>' : '';
  return panel(m, 'bid', 'Bid', 'Rivals bid with their own estimates, and the winner is usually whoever guessed highest. Your estimate is a guess too.',
    `<p class="small">Your estimate: <b>${money(v.estimate)}</b> (it could be off). ${v.price == null ? `Opening bid ${money(v.opening)}.` : `Price ${money(v.price)}, held by ${esc(v.high)}.`}</p>${ladder}<ul class="rivals">${riv}</ul>${ev ? `<ul class="evlog">${ev}</ul>` : ''}${budget}${m.stageDone ? '' : advice(m)}${act}${quickNote(m)}${end}`);
}

// ------------------------------------------------------------------ Fix (Repair)
export function fixHTML(m) {
  const v = m.view, q = m.plan.quote;
  const info = `<div class="lotcard"><span class="ic" aria-hidden="true">${m.plan.asset.icon}</span><div><b>${esc(m.plan.asset.name)}</b><div class="small mute">Quote ${money(q.cost)} (up to ${money(q.most)} if the work goes badly) · worth ${money(q.before)} now, about ${money(q.after)} repaired</div></div></div>`;
  if (!v) return panel(m, 'fix', 'Fix', 'Three steps. Better work costs less and returns more quality.', `${info}${m.stageDone ? quickNote(m) : ''}`);
  const z = v.zone, steps = ['Strip and clean', 'Fit and tighten', 'Final tune'].map((nm, i) => {
    const r = v.results[i], st = r ? (r.careful ? 'careful' : r.acc >= 0.65 ? 'good' : r.acc > 0 ? 'ok' : 'miss') : i === v.step ? 'now' : 'todo';
    return `<li class="fs ${st}"${i === v.step && !v.done ? ' aria-current="step"' : ''}><b>${i + 1}. ${nm}</b><span>${r ? (r.careful ? 'by the book' : r.acc > 0 ? `${pc(r.acc)} precise` : 'missed') : i === v.step ? 'now' : ''}</span></li>`;
  }).join('');
  const zone = `<i class="zone" style="left:${at(z.lo, 0, 1)};width:calc(${at(z.hi, 0, 1)} - ${at(z.lo, 0, 1)})"></i>`;
  let dial = '';
  if (!m.stageDone) {
    dial = m.reduced
      ? `<div class="dial slider"><div class="dial-track" aria-hidden="true">${zone}<i class="dial-mark" style="left:${at(m.slider ?? 0.2, 0, 1)}"></i></div>
          <label for="dial-in">Set the dial. The green zone is ${pc(z.lo)} to ${pc(z.hi)}.</label>
          <input id="dial-in" type="range" min="0" max="100" step="1" value="${Math.round((m.slider ?? 0.2) * 100)}" data-deal-input="slider" data-fid="dial-in" aria-valuetext="${dialWord(m.slider ?? 0.2, z)}">
          <p class="small mute" id="dial-say">${dialWord(m.slider ?? 0.2, z)}</p>
          <div class="row"><button class="btn" data-deal="stop" data-fid="stop" autofocus>Stop here</button></div></div>`
      : `<div class="dial"><div class="dial-track" aria-hidden="true">${zone}<i class="dial-mark" style="left:50%"></i></div>
          <p class="small mute">Watch the marker. Press <b>Stop</b> (or Space, or Enter) when it is inside the green zone.</p>
          <div class="row"><button class="btn big" data-deal="stop" data-fid="stop" autofocus>Stop</button></div></div>`;
    dial += `<div class="row"><button class="btn ghost" data-deal="careful" data-fid="care">Careful: pay more, no timing</button></div>`;
  }
  const cost = !m.stageDone && !m.blocker ? '' : '';
  const end = m.stageDone && m.res ? `<div class="callout good"><b>${pc(m.res.precision)} precise.</b> Quality x${num(m.res.qualityMult, 1).toFixed(2)}, cost x${num(m.res.costMult, 1).toFixed(2)}.</div>` : '';
  return panel(m, 'fix', `Fix: ${v.done ? 'done' : v.name}`, v.done ? 'All three steps are done.' : 'Stop the marker inside the green zone three times, or choose Careful.', `${info}<ol class="fsteps">${steps}</ol>${m.stageDone ? '' : dial}${cost}${m.stageDone ? '' : advice(m)}${quickNote(m)}${end}`);
}
const dialWord = (x, z) => (x < z.lo ? `Dial at ${pc(x)}: below the green zone` : x > z.hi ? `Dial at ${pc(x)}: above the green zone` : `Dial at ${pc(x)}: inside the green zone`);

// ------------------------------------------------------------------ the result
export function resultHTML(m) {
  const s = m.summary, n = s.numbers, f = (x) => (x == null ? 'walks away' : money(x));
  const better = n.better === 'low' ? Math.min : Math.max;
  const vals = [n.quick, n.expert, n.you].filter((x) => x != null && x > 0), top = Math.max(1e-9, ...vals.map(Math.abs)), best = vals.length ? better(...vals) : null;
  const tied = [n.quick, n.expert, n.you].filter((x) => x != null && x === best).length; // a three-way tie has no best row to mark
  const row = (label, x, cls) => `<div class="vs ${cls}${x != null && x === best && tied < 3 ? ' best' : ''}"><dt>${label}</dt><dd${x == null ? '' : ` data-count="${x}" data-fmt="money"`}>${f(x)}</dd><span class="vbar" aria-hidden="true"><i style="width:${x == null ? 0 : Math.max(2, (Math.abs(x) / top) * 100).toFixed(1)}%"></i></span></div>`;
  const net = m.plan.kind === 'buy' && n.net != null ? `<p class="small mute">Against what it was really worth: Quick ${money(n.quickNet)}, expert ${money(n.expertNet)}${n.net !== undefined && s.reveal ? `, you ${money(n.net)}` : ''}.</p>` : '';
  const rev = s.reveal ? `<div class="reveal"><h4>What the lot really was</h4><p><b>${esc(s.reveal.truth)}.</b> ${s.reveal.total ? `You found ${s.reveal.found} of its ${s.reveal.total} flaw${s.reveal.total === 1 ? '' : 's'}${s.reveal.defects.length ? `: ${esc(s.reveal.defects.join(', '))}` : ''}.` : 'It had no flaws to find.'} <span class="mute">Your read: ${esc(s.reveal.estimate)}.</span></p></div>` : '';
  const why = s.reasons.length ? `<div class="why"><h4>Why</h4><ul>${s.reasons.map((r) => `<li><b>${esc(r.label)}.</b> ${esc(r.text)}</li>`).join('')}</ul></div>` : '';
  const labels = { 'due-diligence': 'Due diligence', anchoring: 'Anchoring', 'persona-fit': 'Persona fit', 'winners-curse': "The winner's curse", 'repair-roi': 'Quality control', zopa: 'The zone of agreement', batna: 'Your alternative', reciprocity: 'Reciprocity', patience: 'Patience', 'saturation-herd': 'The herd' };
  // the one-line verdict: where you stand against Quick (a stamp, so it never rests on colour alone)
  const gain = n.you == null || n.quick == null ? null : (n.better === 'low' ? n.quick - n.you : n.you - n.quick), tiny = Math.max(1e-9, top * 0.005);
  const verdict = gain == null ? '' : gain > tiny ? '<p class="rver win">Better than Quick</p>' : gain < -tiny ? '<p class="rver lose">Quick would have done better</p>' : '<p class="rver even">Same as Quick</p>';
  return `<section class="deal-result ${s.tone}${m.revealed ? ' revealed' : ''}" data-anchor="deal-result" aria-labelledby="ds-title">
    <h3 id="ds-title" class="rtitle" tabindex="-1" data-stage-head>${esc(s.title)}</h3><p class="rhead">${esc(s.headline)}</p>
    ${s.lines.length ? `<ul class="rlines">${s.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
    <div class="vsbox" role="group" aria-label="How you compare"><h4>${esc(cap(n.unit))}: Quick, expert, you</h4>${verdict}
      <dl>${row('Quick', n.quick, 'quick')}${row('Expert', n.expert, 'expert')}${row('You', n.you, 'you')}</dl>
      <p class="small mute">Quick plays every stage for you at average skill. Expert plays the same deal, with the same luck, at full skill${n.expertVia ? ` (here by selling to ${esc(n.expertVia)})` : ''}. ${n.better === 'low' ? 'Lower is better.' : 'Higher is better.'}</p>${net}</div>
    ${why}${rev}
    <p class="xp"><b data-count="${num(s.xp)}" data-fmt="int" data-pre="+" data-post=" XP">+${s.xp} XP</b>${m.plan.kind === 'sell' ? ` · deal streak ${s.streak}` : ''}</p>
    <blockquote class="lesson"><b>${esc(labels[s.lesson.concept] || 'Lesson')}.</b> ${esc(s.lesson.text)}</blockquote>
    <div class="row"><button class="btn big" data-close data-fid="done" autofocus>Continue</button></div></section>`;
}
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

// ------------------------------------------------------------------ the whole sheet
const BODY = { read: readHTML, pitch: pitchHTML, close: closeHTML, bid: bidHTML, fix: fixHTML, result: resultHTML };
/** The scoreboard and the buttons, one band along the foot of the sheet (the result has neither). */
function dockHTML(m) {
  const parts = (m.stage === 'result' ? '' : scoreHTML(m)) + footHTML(m);
  return parts ? `<div class="deal-dock">${parts}</div>` : '';
}
export function sheetHTML(m) {
  const z = m.zone, style = z && z.palette ? ` style="--zg:${esc(z.palette[0])};--za:${esc(z.palette[1])}"` : '';
  const lock = m.assistLocked ? ' disabled' : '';
  return `<div class="deal" data-anchor="deal-room" data-kind="${m.kind}" data-stage="${m.stage}"${style}>
    <header class="deal-top"><h2 id="deal-title" tabindex="-1" autofocus>${esc(titleOf(m))}</h2>
      ${z && z.name ? `<span class="deal-zone"><span aria-hidden="true">${z.icon || ''}</span> ${esc(z.short || z.name)}</span>` : ''}
      <label class="deal-assist"><input type="checkbox" data-change-deal="assist" data-fid="assist" ${m.assist ? 'checked' : ''}${lock}> <span>Assist</span></label>
      <button class="btn ghost sm" data-close data-fid="leave">${m.stage === 'result' ? 'Close' : 'Leave'}</button></header>
    ${m.stage === 'result' ? '' : stepperHTML(m)}
    <div class="deal-scene">${castHTML(m)}<div class="deal-main">${(BODY[m.stage] || resultHTML)(m)}</div></div>
    ${dockHTML(m)}</div>`;
}
/** modelOf plus the little the screen itself remembers (picked angles, the slider). */
export function viewModel(session) {
  const m = modelOf(session.run, { reduced: session.reduced() });
  m.pick = session.pick; m.slider = session.slider;
  m.revealed = !!session.revealed; // the result has been staged once: a later paint (Assist toggled) shows it at rest
  return m;
}

// ------------------------------------------------------------------ the DOM half
let active = null;
export function createSession(ctx, run) {
  const S = ctx.S, doc = typeof document !== 'undefined' ? document : null;
  const ses = { ctx, run, pick: [], slider: 0.2, shown: false, raf: 0, t0: 0, paused: false, disposed: false, reduced: () => !!(ctx.reduced && ctx.reduced()), focusHead: true };
  const el = () => ctx.dlg.el;
  const live = !!(doc && el() && el().querySelector);

  const paint = () => {
    const html = sheetHTML(viewModel(ses));
    if (!ses.shown) { ctx.dlg.open(html, { cls: 'deal', label: titleOf(modelOf(run)) }); ses.shown = true; if (live) el()._html = html; bind(); }
    else if (live && ctx.setHTML) ctx.setHTML(el(), html); else ctx.dlg.open(html, { cls: 'deal', label: titleOf(modelOf(run)) });
    if (live) after();
  };
  const after = () => {
    const d = el();
    if (ses.focusHead) { ses.focusHead = false; const h = d.querySelector('[data-stage-head]'); const f = d.querySelector('.deal-foot [autofocus], .deal-stage [autofocus]'); (f || h)?.focus?.({ preventScroll: true }); }
    if (run.key === 'fix' && !run.res.fix && !ses.reduced()) startDial(); else stopDial();
    // presentation only: the result is staged (numbers tick up, the stamp lands, the bars grow) the first time it is painted and never again, so a later paint
    // of the same screen, such as the Assist box being toggled, shows it at rest instead of replaying it
    if (d.querySelector('[data-anchor="deal-result"]')) { if (!ses.revealed) { ses.revealed = true; countUp(d, { reduced: ses.reduced() }); } } else ses.revealed = false;
  };

  // ---- the repair dial: the marker is a function of time, so a frame only moves one element
  function startDial() {
    if (ses.raf || !doc) return;
    ses.t0 = performance.now();
    const tick = () => {
      const v = run.view(), mark = el().querySelector('.dial-mark');
      if (!v || !mark) { ses.raf = 0; return; }
      mark.style.left = `${(dialPos(performance.now() - ses.t0, v.step, v.seed) * 100).toFixed(2)}%`;
      ses.raf = requestAnimationFrame(tick);
    };
    ses.raf = requestAnimationFrame(tick);
  }
  function stopDial() { if (ses.raf) cancelAnimationFrame(ses.raf); ses.raf = 0; }
  const stopAt = () => {
    const v = run.view(); if (!v) return { ok: false };
    const t = ses.reduced() ? tForPos(ses.slider, v.step, v.seed) : performance.now() - ses.t0;
    stopDial(); ses.t0 = 0;
    return run.act({ type: 'stop', t });
  };

  const say = (r) => { if (r && r.ok && r.say) ctx.announce?.(r.say); };
  const go = (action) => { const r = run.act(action); say(r); if (r.ok) after1(); paint(); return r; };
  const after1 = () => { if (run.stageDone()) ctx.announce?.(`${STAGE_LABEL[run.key] || 'Stage'} complete.`); };
  const result = () => {
    const s = run.finish(), good = s.tone === 'good', bad = s.tone === 'bad';
    ses.focusHead = true; stopDial();
    if (good) { ctx.sfx?.kaching?.(); ctx.burst?.({ power: s.xp > 80 ? 1.4 : 1 }); } else if (bad) ctx.sfx?.buzz?.(); else ctx.sfx?.blip?.();
    ctx.announce?.(`${s.title}. ${s.headline}`, bad);
    if (s.tone === 'warn' && s.title === 'Not done') ctx.toast?.(s.headline, 'warn');
    paint();
    ctx.render?.();
    return s;
  };
  const advance = () => { if (run.next()) { ses.focusHead = true; ctx.announce?.(`${STAGE_LABEL[run.key]} stage.`); } paint(); };

  // ---- the table of things a click can mean
  const acts = {
    'quick-stage'() { run.quick(); ses.focusHead = true; ctx.announce?.('Played at average skill.'); paint(); },
    'quick-all'() { run.quickAll(); result(); },
    next: advance,
    finish: result,
    pass() { run.walkAway(); result(); },
    probe(b) { go({ type: 'probe', id: b.dataset.id }); },
    'read-done'() { go({ type: 'conclude' }); },
    angle(b) { const a = b.dataset.angle, i = ses.pick.indexOf(a); if (i >= 0) ses.pick.splice(i, 1); else { if (ses.pick.length >= 2) ses.pick.shift(); ses.pick.push(a); } paint(); },
    'pitch-go'() { if (ses.pick.length === 2) go({ type: 'pick', angles: [...ses.pick] }); },
    verify() { const r = run.verify(); ctx.toast?.(r.msg, r.ok && !r.scam ? 'good' : 'warn'); if (r.ok) ctx.announce?.(r.msg); ctx.render?.(); paint(); },
    anchor(b) { go({ type: 'anchor', level: b.dataset.level }); },
    hold() { go({ type: 'hold' }); },
    concede(b) { go({ type: 'concede', size: b.dataset.size }); },
    split() { go({ type: 'split' }); },
    leverage() { go({ type: 'leverage' }); },
    accept() { go({ type: 'accept' }); },
    walk() { if (run.key === 'close' && run.view() && run.view().round > 0) go({ type: 'walk' }); else { run.walkAway(); result(); } },
    bid() { go({ type: 'bid' }); },
    drop() { go({ type: 'drop' }); },
    stop() { const r = stopAt(); say(r); after1(); paint(); },
    careful() { stopDial(); go({ type: 'careful' }); },
  };
  const changes = {
    assist(b) { const on = !!b.checked; kv.set('assist', on); run.setAssist(on); paint(); },
  };
  const inputs = {
    slider(b) { ses.slider = Math.max(0, Math.min(1, num(+b.value) / 100)); const d = el(), v = run.view(); if (!d || !v) return; const mark = d.querySelector('.dial-mark'), say2 = d.querySelector('#dial-say'); if (mark) mark.style.left = `${ses.slider * 100}%`; if (say2) say2.textContent = dialWord(ses.slider, v.zone); b.setAttribute('aria-valuetext', dialWord(ses.slider, v.zone)); },
  };
  ses.acts = acts; ses.changes = changes; ses.inputs = inputs;

  // ---- listeners on the shared dialog: one set per session, removed when it closes
  const onClick = (e) => { const b = e.target.closest?.('[data-deal]'); if (b && !b.disabled && el().classList.contains('deal')) { e.preventDefault(); acts[b.dataset.deal]?.(b, e); } };
  const onChange = (e) => { const b = e.target.closest?.('[data-change-deal]'); if (b) changes[b.dataset.changeDeal]?.(b, e); };
  const onInput = (e) => { const b = e.target.closest?.('[data-deal-input]'); if (b) inputs[b.dataset.dealInput]?.(b, e); };
  const onKey = (e) => {
    if (run.key !== 'fix' || run.res.fix || ses.reduced() || !(e.key === ' ' || e.key === 'Enter')) return;
    if (e.target.closest?.('button, input, select, a, textarea, summary')) return;
    e.preventDefault(); acts.stop();
  };
  const onClose = () => { if (el().open) return; dispose(); }; // a deal shown over this one has already reopened the dialog
  function bind() {
    if (!live) return;
    const d = el();
    d.addEventListener('click', onClick); d.addEventListener('change', onChange); d.addEventListener('input', onInput); d.addEventListener('keydown', onKey); d.addEventListener('close', onClose);
  }
  function dispose() {
    if (ses.disposed) return; ses.disposed = true; stopDial();
    if (live) { const d = el(); d.removeEventListener('click', onClick); d.removeEventListener('change', onChange); d.removeEventListener('input', onInput); d.removeEventListener('keydown', onKey); d.removeEventListener('close', onClose); }
    if (ses.paused && S && S.clock && S.clock.paused) S.setPaused(false);
    if (active === ses) active = null;
    ctx.render?.();
  }
  ses.dispose = dispose;
  ses.show = () => {
    if (active && active !== ses) active.dispose(); // one Deal Room at a time: the old one's listeners must not answer the new one's clicks
    active = ses;
    // the world waits while you deal (unless a classroom clock is in charge)
    if (S && S.clock && !S.clock.paused && (S.mode ? S.mode === 'solo' : S.canSetClock && S.canSetClock())) { S.setPaused(true); ses.paused = true; } // a solo run only: never the class's clock
    paint();
    ctx.announce?.(`${titleOf(modelOf(run))}. ${run.plan.cast.name} says: ${run.plan.cast.hello}`);
  };
  ses.paint = paint;
  return ses;
}

/** The one function the shell calls (ctx.deal). Returns the session, or { ok:false, msg } when the deal cannot start. */
export function openDeal(ctx, spec) {
  const run = startRun(ctx.g(), spec, { assist: !!kv.get('assist') });
  if (!run.ok) { ctx.toast?.(run.msg, 'warn'); return run; }
  const ses = createSession(ctx, run);
  ses.show();
  return ses;
}
