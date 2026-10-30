// The Deal Room (docs/V2_DESIGN.md section 6): one modal sheet that plays a deal in up to three stages (Read, Pitch, Close / Bid / Fix),
// with a character, a speech bubble, a scoreboard and a result screen that says what Quick and an expert would have got.
//
// Everything that decides anything is in ../deal.js (pure, tested). This file has two halves:
//   * HTML builders, (model) -> string, exported so they can be tested without a DOM. They only ever see modelOf(run), which never holds a lot's truth.
//   * createSession(ctx, run): the thin DOM half. It forwards clicks (data-deal="...") to the run, repaints the sheet, runs the repair dial and
//     plays the sounds. openDeal(ctx, spec) is the one function the shell calls.
import { esc, keepInView } from './common.js';
import { kv } from '../session.js';
import { fmtMoney as money, fmtPct } from '../market.js';
import { startRun, modelOf, tForPos, STAGE_LABEL } from '../deal.js';
import { pos as dialPos } from '../play/repair.js';
import { countUp } from './polish.js';
import { audio, toggleMute, audible } from '../audio/index.js';
import { dialInfo, dialEarText, dialShortText, dialAnnounceText, dialSwitchHTML, toggleHTML, toggleDial, tellOnce, dialsDrawn, DIAL_SWITCH_DIALS } from '../audio/dialtone.js';
import { settings as appSettings, applySettings } from './common.js';

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
const quickBtn = (label, anchor = true) => `<button class="btn ghost" data-deal="quick-stage" data-snd${anchor ? ' data-anchor="deal-quick"' : ''} data-fid="dq">${esc(label)}</button>`;
export const QUICK_LABEL = 'Quick: auto-play at average skill';
function footHTML(m) {
  if (m.stage === 'result') return '';
  const bits = [];
  if (m.stageDone) bits.push(m.last ? '<button class="btn big" data-deal="finish" data-fid="go" autofocus>See the result</button>' : '<button class="btn big" data-deal="next" data-fid="go" autofocus>Continue</button>');
  else if (m.canQuick) bits.push(quickBtn(QUICK_LABEL, !(m.first && m.steps.length > 1))); // two Quick buttons on a deal's first stage: the Academy's frame (data-anchor deal-quick) goes on the whole deal's, the one its lessons mean by "Quick deal"
  if (m.first && m.steps.length > 1 && m.canQuick) bits.push('<button class="btn ghost" data-deal="quick-all" data-snd data-anchor="deal-quick" data-fid="qa">Quick deal</button>');
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
    return `<button class="probe${x.used ? ' used' : ''}${m.advice && m.advice.probe === x.id ? ' rec' : ''}" data-deal="probe" data-snd data-id="${x.id}" data-fid="pr-${x.id}" ${x.affordable && !m.stageDone ? '' : 'disabled'}><span class="pic" aria-hidden="true">${ic}</span><span class="pnm">${esc(nm)}</span><span class="pco">${x.used ? 'done' : `${x.cost} pt${x.cost > 1 ? 's' : ''}`}</span><span class="pwh">${esc(why)}</span></button>`;
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
  const verify = p.canVerify && !p.verified ? `<div class="callout warn"><b>Scam magnet.</b> Online buyers are sometimes fraudulent. <button class="btn sm" data-deal="verify" data-snd data-fid="vf">Verify this buyer (${money(p.verifyCost)})</button></div>` : p.verified ? `<div class="callout ${p.scam ? 'bad' : 'good'}">${p.scam ? 'Fraud confirmed. Skip this buyer.' : 'Verified: this buyer is genuine.'}</div>` : '';
  if (!v) return panel(m, 'pitch', 'Pitch', 'Choose the two angles that match this buyer.', `${head}${verify}${m.stageDone ? quickNote(m) : ''}`);
  const feat = Object.fromEntries(v.angles.map((a) => [a, 0]));
  for (const f of v.asset.features) feat[f.angle] = Math.max(feat[f.angle], f.strength);
  const hinted = new Set([...(v.likely ? v.likely.angles : [])]), sel = m.pick || [], lock = m.stageDone || !!m.blocker;
  const btns = v.angles.map((a) => {
    const [ic, nm, why] = ANGLE[a], on = sel.includes(a), rec = m.assist && m.advice && m.advice.angles.includes(a), backed = feat[a] >= 0.6 ? 'strongly' : feat[a] >= 0.3 ? 'somewhat' : 'barely';
    return `<button class="angle${on ? ' on' : ''}${rec ? ' rec' : ''}" data-deal="angle" data-snd data-angle="${a}" aria-pressed="${on}" data-fid="an-${a}" ${lock ? 'disabled' : ''}>
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
  const flag = v.flag === 'mad' ? '<div class="callout warn">They took offense at that number.</div>' : v.flag === 'sus' ? '<div class="callout warn">They are suspicious of a price that low.</div>' : '';
  let moves;
  if (m.stageDone) moves = '';
  else if (v.round === 0) {
    const L = buy ? { high: ['Generous', 'offer'], fair: ['Fair', 'offer'], low: ['Lowball', 'offer'] } : { high: ['Aim high', 'ask'], fair: ['Fair', 'ask'], low: ['Quick sale', 'ask'] }, G = { high: '\u25b2', fair: '\u25c6', low: '\u25bc' };
    moves = `<p class="small">Your first number pulls the whole talk toward it. ${buy ? 'Offering' : 'Asking'}:</p><div class="moves anchors">${['high', 'fair', 'low'].map((lv) => `<button class="move${recIf('anchor', 'level', lv)}" data-deal="anchor" data-snd data-level="${lv}" data-fid="mv-${lv}" ${can(v, 'anchor', 'level', lv) ? '' : 'disabled'}><span><span aria-hidden="true">${G[lv]}</span> ${L[lv][0]}</span><b>${money(v.anchors[lv])}</b><small class="mv-d">${vsFair(v.anchors[lv], v.fair)}</small></button>`).join('')}</div>
      <div class="row"><button class="btn ghost sm" data-deal="walk" data-fid="walk">${buy ? 'Pass on this lot' : 'Walk away'}</button></div>`;
  } else {
    const verb = buy ? 'Raise your offer' : 'Come down', landNote = (w, k) => { const to = concedeTo(w, k), d = to == null ? '' : vsFair(to, w.fair); return d && `lands ${d}`; }, sz = (k) => `<button class="move${recIf('concede', 'size', k)}" data-deal="concede" data-snd data-size="${k}" data-fid="mv-${k}" ${can(v, 'concede', 'size', k) ? '' : 'disabled'}><span>${verb}</span><b>${money(v.steps[k])}</b><small class="mv-d">${landNote(v, k)}</small></button>`;
    moves = `<div class="moves">
      <button class="move${recIf('hold')}" data-deal="hold" data-snd data-fid="mv-hold"><span>Hold</span><b>${money(v.yours)}</b><small class="mv-d">${vsFair(v.yours, v.fair)}</small></button>${sz('small')}${sz('medium')}${sz('large')}
      <button class="move${recIf('split')}" data-deal="split" data-snd data-fid="mv-split" ${can(v, 'split') ? '' : 'disabled'}><span>Split the difference</span><b>${v.yours != null && v.theirs != null ? money((v.yours + v.theirs) / 2) : '-'}</b><small class="mv-d">${v.yours != null && v.theirs != null ? vsFair((v.yours + v.theirs) / 2, v.fair) : ''}</small></button>
      ${v.alt != null ? `<button class="move${recIf('leverage')}" data-deal="leverage" data-snd data-fid="mv-lev" ${v.canLeverage ? '' : 'disabled'}><span>Mention your other option</span><b>${money(v.alt)}</b></button>` : ''}
      <button class="move good${recIf('accept')}" data-deal="accept" data-snd data-fid="mv-acc"><span>Accept their ${buy ? 'price' : 'offer'}</span><b>${money(v.theirs)}</b><small class="mv-d">${vsFair(v.theirs, v.fair)}</small></button>
      <button class="move bad" data-deal="walk" data-snd data-fid="walk"><span>Walk away</span><b>no deal</b></button></div>`;
  }
  const last = v.history.length ? '' : '';
  const status = v.tell && !m.stageDone ? `<p class="small">They are <b>${TELL[v.tell]}</b>. ${v.final ? '<b>Final round.</b>' : ''}</p>` : '';
  // A buyer checks what is sold, so the price paid follows the crate's real condition, which a quote cannot show: said once the price is agreed, and only for a crate that came from a lot, whose condition is not in the figures
  const checks = m.stageDone && m.res && m.res.deal && !buy && p.asset && p.asset.unchecked ? ' The buyer checks the crate before paying, so the price you are paid follows its real condition and can come out below this.' : '';
  const end = m.stageDone ? `<div class="callout ${m.res && m.res.deal ? 'good' : 'warn'}">${esc(m.res && m.res.deal ? `Agreed at ${money(m.res.price)}.${checks}` : 'No deal was struck.')}</div>` : '';
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
  const act = m.stageDone ? '' : `<div class="moves auc-moves"><button class="move paddle${rec && rec.type === 'bid' ? ' rec' : ''}" data-deal="bid" data-snd data-fid="bid" ${can(v, 'bid') ? '' : 'disabled'}><span>${v.price == null ? 'Open the bidding' : 'Bid'}</span><b>${money(v.nextBid)}</b></button>
      <button class="move bad${rec && rec.type === 'drop' ? ' rec' : ''}" data-deal="drop" data-snd data-fid="drop"><span>Drop out</span><b>keep your cash</b></button></div>`;
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
          <input id="dial-in" type="range"${m.tone ? ' class="snd"' : ''} min="0" max="100" step="1" value="${Math.round((m.slider ?? 0.2) * 100)}" data-deal-input="slider" data-fid="dial-in" aria-valuetext="${dialWord(m.slider ?? 0.2, z)}">
          <p class="small mute" id="dial-say">${dialWord(m.slider ?? 0.2, z)}</p>
          <div class="row"><button class="btn" data-deal="stop" data-snd data-fid="stop" autofocus>Stop here</button></div></div>`
      : `<div class="dial" role="group" aria-label="Repair timing"><div class="dial-track" aria-hidden="true">${zone}<i class="dial-mark" style="left:50%"></i></div>
          <p class="small mute" id="dial-help">Watch the marker. Press <b>Stop</b> (or Space, or Enter) when it is inside the green zone.</p>
          <p class="small mute" id="dial-ear">${esc(m.dialLong === false ? dialShortText(m.dialInfo, !!m.dialSwitch) : dialEarText(m.dialInfo))}</p>
          ${m.dialLong === false ? '' : `<span class="sr" id="dial-short">${esc(dialShortText(m.dialInfo))}</span>`}
          <div class="row"><button class="btn big" data-deal="stop" data-snd data-fid="stop" aria-describedby="${m.dialLong === false ? 'dial-ear' : 'dial-short'}" autofocus>Stop</button></div></div>`; // the long line is for the first repair of a run, and even then Stop is described by the short one: forty words read at every cursor stop of every step were too many
    dial += `<div class="row"><button class="btn ghost" data-deal="careful" data-snd data-fid="care">Careful: pay more, no timing</button></div>`;
  }
  const cost = !m.stageDone && !m.blocker ? '' : '';
  const end = m.stageDone && m.res ? `<div class="callout good"><b>${pc(m.res.precision)} precise.</b> Quality x${num(m.res.qualityMult, 1).toFixed(2)}, cost x${num(m.res.costMult, 1).toFixed(2)}.</div>` : '';
  return panel(m, 'fix', `Fix: ${v.done ? 'done' : v.name}`, v.done ? 'All three steps are done.' : 'Stop the marker inside the green zone three times, or choose Careful.', `${info}<ol class="fsteps">${steps}</ol>${m.stageDone ? '' : dial}${cost}${m.stageDone ? '' : advice(m)}${quickNote(m)}${end}`);
}
const dialWord = (x, z) => (x < z.lo ? `Dial at ${pc(x)}: below the green zone` : x > z.hi ? `Dial at ${pc(x)}: above the green zone` : `Dial at ${pc(x)}: inside the green zone`);

// ------------------------------------------------------------------ the result
export function resultHTML(m) {
  const s = m.summary, n = s.numbers, f = (x) => (x == null ? 'walks away' : money(x));
  // Quick's and the expert's figures at a table never sat at are withheld (numbers.hidden, js/deal.js): they would be the next sitting's answers. A blank there is not "walks away"
  // (they would have sat down and played); it is "kept back", and the box says why. Your own row is still your own: you did walk.
  const kept = !!n.hidden, g = (x) => (x == null && kept ? 'kept back' : f(x));
  const better = n.better === 'low' ? Math.min : Math.max;
  const vals = [n.quick, n.expert, n.you].filter((x) => x != null && x > 0), top = Math.max(1e-9, ...vals.map(Math.abs)), best = vals.length ? better(...vals) : null;
  const tied = [n.quick, n.expert, n.you].filter((x) => x != null && x === best).length; // a three-way tie has no best row to mark
  const row = (label, x, cls, say = f) => `<div class="vs ${cls}${x != null && x === best && tied < 3 ? ' best' : ''}"><dt>${label}</dt><dd${x == null ? '' : ` data-count="${x}" data-fmt="money"`}>${say(x)}</dd><span class="vbar" aria-hidden="true"><i style="width:${x == null ? 0 : Math.max(2, (Math.abs(x) / top) * 100).toFixed(1)}%"></i></span></div>`;
  const net = m.plan.kind === 'buy' && n.net != null && !kept ? `<p class="small mute">Against what it was really worth: Quick ${money(n.quickNet)}, expert ${money(n.expertNet)}${n.net !== undefined && s.reveal ? `, you ${money(n.net)}` : ''}.</p>` : '';
  const rev = s.reveal ? `<div class="reveal"><h4>What the lot really was</h4><p><b>${esc(s.reveal.truth)}.</b> ${s.reveal.total ? `You found ${s.reveal.found} of its ${s.reveal.total} flaw${s.reveal.total === 1 ? '' : 's'}${s.reveal.defects.length ? `: ${esc(s.reveal.defects.join(', '))}` : ''}.` : 'It had no flaws to find.'} <span class="mute">Your read: ${esc(s.reveal.estimate)}.</span></p></div>` : '';
  const why = s.reasons.length ? `<div class="why"><h4>Why</h4><ul>${s.reasons.map((r) => `<li><b>${esc(r.label)}.</b> ${esc(r.text)}</li>`).join('')}</ul></div>` : '';
  const labels = { 'due-diligence': 'Due diligence', anchoring: 'Anchoring', 'persona-fit': 'Persona fit', 'winners-curse': "The winner's curse", 'repair-roi': 'Quality control', zopa: 'The zone of agreement', batna: 'Your alternative', reciprocity: 'Reciprocity', patience: 'Patience', 'saturation-herd': 'The herd' };
  // the one-line verdict: where you stand against Quick (a stamp, so it never rests on color alone)
  const gain = n.you == null || n.quick == null ? null : (n.better === 'low' ? n.quick - n.you : n.you - n.quick), tiny = Math.max(1e-9, top * 0.005);
  const verdict = gain == null ? '' : gain > tiny ? '<p class="rver win">Better than Quick</p>' : gain < -tiny ? '<p class="rver lose">Quick would have done better</p>' : '<p class="rver even">Same as Quick</p>';
  return `<section class="deal-result ${s.tone}${m.revealed ? ' revealed' : ''}" data-anchor="deal-result" aria-labelledby="ds-title">
    <h3 id="ds-title" class="rtitle" tabindex="-1" data-stage-head>${esc(s.title)}</h3><p class="rhead">${esc(s.headline)}</p>
    ${s.lines.length ? `<ul class="rlines">${s.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
    <div class="vsbox" role="group" aria-label="How you compare"><h4>${esc(cap(n.unit))}: Quick, expert, you</h4>${verdict}
      <dl>${row('Quick', n.quick, 'quick', g)}${row('Expert', n.expert, 'expert', g)}${row('You', n.you, 'you')}</dl>
      ${kept ? `<p class="small kept" role="note">Quick's and the expert's figures are kept back until you have sat at the table: they would be this table's answers, and you can still sit at it.</p>` : ''}<p class="small mute">Quick plays every stage for you at average skill. Expert plays the same deal, with the same luck, at full skill${n.expertVia ? ` (here by selling to ${esc(n.expertVia)})` : ''}. ${n.better === 'low' ? 'Lower is better.' : 'Higher is better.'}</p>${net}</div>
    ${why}${rev}
    <p class="xp"><b data-count="${num(s.xp)}" data-fmt="int" data-pre="+" data-post=" XP">+${s.xp} XP</b>${m.plan.kind === 'sell' ? ` · deal streak ${s.streak}` : ''}</p>
    <blockquote class="lesson"><b>${esc(labels[s.lesson.concept] || 'Lesson')}.</b> ${esc(s.lesson.text)}</blockquote>
    <div class="row"><button class="btn big" data-close data-snd data-fid="done" autofocus>Continue</button></div></section>`;
}
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

// ------------------------------------------------------------------ the whole sheet
const BODY = { read: readHTML, pitch: pitchHTML, close: closeHTML, bid: bidHTML, fix: fixHTML, result: resultHTML };
/** The scoreboard and the buttons, one band along the foot of the sheet (the result has neither). */
function dockHTML(m) {
  const parts = (m.stage === 'result' ? '' : scoreHTML(m)) + footHTML(m);
  return parts ? `<div class="deal-dock">${parts}</div>` : '';
}
/** The room's own sound switch (docs/AUDIO.md 4.5 and 7.3): the repair tone is a continuous sound, so whoever turns it on can turn it off without leaving the room. The label never changes, aria-pressed says whether sound is on. */
export const soundHTML = (m) => toggleHTML({ act: 'sound', fid: 'deal-sound', name: 'Sound', on: m.sound !== false }); // the name is the visible word; on and off are the pressed state and a badge (dialtone.js)
export function sheetHTML(m) {
  const z = m.zone, style = z && z.palette ? ` style="--zg:${esc(z.palette[0])};--za:${esc(z.palette[1])}"` : '';
  const lock = m.assistLocked ? ' disabled' : '';
  return `<div class="deal" data-anchor="deal-room" data-kind="${m.kind}" data-stage="${m.stage}"${style}>
    <header class="deal-top"><h2 id="deal-title" tabindex="-1" autofocus>${esc(titleOf(m))}</h2>
      ${z && z.name ? `<span class="deal-zone"><span aria-hidden="true">${z.icon || ''}</span> ${esc(z.short || z.name)}</span>` : ''}
      <label class="deal-assist"><input type="checkbox" data-change-deal="assist" data-fid="assist" ${m.assist ? 'checked' : ''}${lock}> <span>Assist</span></label>
      ${soundHTML(m)}${dialSwitchHTML(m)}<button class="btn ghost sm" data-close data-snd data-fid="leave">${m.stage === 'result' ? 'Close' : 'Leave'}</button></header>
    ${m.stage === 'result' ? '' : stepperHTML(m)}
    <div class="deal-scene">${castHTML(m)}<div class="deal-main">${(BODY[m.stage] || resultHTML)(m)}</div></div>
    ${dockHTML(m)}</div>`;
}
/** modelOf plus the little the screen itself remembers (picked angles, the slider). */
export function viewModel(session) {
  const m = modelOf(session.run, { reduced: session.reduced() });
  m.pick = session.pick; m.slider = session.slider;
  m.revealed = !!session.revealed; // the result has been staged once: a later paint (Assist toggled) shows it at rest
  m.sound = session.sound ? session.sound() : true;
  m.tone = !!(session.toneWanted && session.toneWanted()); // the repair tone is on: the slider's own detents are silent (docs/AUDIO.md 4.5)
  m.dialLong = session.longEar !== false; // the first repair of a run says it all (dialtone.js tellOnce), a later one a short line
  m.dialSwitch = !!session.dialSwitch; // and the first two dials of a run, while the tone is off, say where its switch is
  m.dialInfo = session.dialInfo ? session.dialInfo() : null; // what the room says about the tone: on or off, held off by Classroom, heard or not (js/audio/dialtone.js)
  return m;
}

// ------------------------------------------------------------------ sound (docs/AUDIO.md 4.2 and 4.3)
// One rule decides every sound of the room, and it is the one the screen is drawn by: a sound is chosen from the stage's own view() (the numbers the player may see) and from what
// the run answered to a move. It never reads a lot's truth, a buyer's scam flag, a rival's limit or the auction's surplus, so a sound can only say what the screen already says.
// Two roads, and each sound takes one:
//   say(what, data)  {type:'ui', ui:'deal', what, ...} on the drawer context's bus. js/audio/wire.js turns these (stage, result, suspect, fit, tell, rival, hammer, quick, count) into sounds
//                    through the collector, so a result card, an engine sale and a level-up are decided together and are never doubled.
//   hear(id, opts)   the room's own press sounds (open, probe, angle, anchor, a move, leverage, close, bid, drop, stop, verify) are played straight away through the engine. Their buttons carry
//                    data-snd, which the page-wide click table leaves alone, so no tick sits under them. Everything else (Continue, Done reading, Pitch) keeps the tick the page gives a button.
// soundsFor() is pure: it returns the plan as [{ at (ms after the move), hear: [id, opts] | say: [what, data] }], and the session plays it. Tested in tests/audio-deal.test.mjs.
export const SOUND = Object.freeze({
  PROBE_MS: 320,   // a probe's own sound is heard before the warning it may carry
  TELL_AT: 260,    // their stance answers your number a beat after it
  LEVER_AT: 520,   // the leverage sting is longer, so is the wait for the answer
  RIVAL_AT: 200,   // the room answers a raise after the paddle has been heard
  RIVAL_GAP: 240,  // one rival at a time, never more than three (the collector would keep only the first of a burst)
  RIVALS: 3,
  HAMMER_GAP: 100, // the gavel follows the last rival
  COUNT_AT: 250,   // the numbers start counting 250 ms after the card is drawn (polish.js countUp)
  VERDICT_AT: 650, // the stamp against Quick lands after the sale and the count have been heard
  HOLLOW: Object.freeze({ lp: 1500, gainDb: -2 }), // a probe that finds nothing: the same sound, rounder and a little quieter
});
/** Where a result stands against Quick, by the one rule the card's stamp uses ("Better than Quick", "Quick would have done better", "Same as Quick"): 'win', 'lose', 'even', or null when there is nothing to compare. */
export function verdictOf(n) {
  if (!n || n.you == null || n.quick == null) return null;
  const vals = [n.quick, n.expert, n.you].filter((x) => x != null && x > 0), top = Math.max(1e-9, ...vals.map(Math.abs)), tiny = Math.max(1e-9, top * 0.005);
  const gain = n.better === 'low' ? n.quick - n.you : n.you - n.quick;
  return gain > tiny ? 'win' : gain < -tiny ? 'lose' : 'even';
}
/** The three voices the room opens with: a buyer's shop door, a seller's stall, the repair bench. */
export const openVariant = (kind) => (kind === 'buy' ? 'buy' : kind === 'repair' ? 'fix' : 'sell');
/** How well a stop landed, in the four words of the sound map (docs/AUDIO.md 4: perfect from 90%, good from 65%, ok above nothing, miss). */
export const stopTier = (acc) => (!Number.isFinite(acc) || acc <= 0 ? 'miss' : acc >= 0.9 ? 'perfect' : acc >= 0.65 ? 'good' : 'ok');
/** The repair tone follows the marker through 11 notes: it only needs a word when the note, or whether the marker is in the green zone, changes (at most ten times in a pass of the dial, never once a frame). */
export function toneStep(prev, pos, lo, hi) {
  const p = Math.min(1, Math.max(0, Number.isFinite(+pos) ? +pos : 0)), note = Math.round(p * 10), zone = p >= lo && p <= hi;
  return prev && prev.note === note && prev.zone === zone ? null : { note, zone, pos: p };
}
/** What the room did after a bid or a drop, from the log entries it added, as sounds: at most three rivals, one at a time and each on its own side, then the gavel. `names` is the rivals' order. */
export function auctionSounds(fresh, names = []) {
  const out = [], list = Array.isArray(fresh) ? fresh : [];
  const rivals = list.filter((e) => e && e.who !== 'You' && (e.kind === 'bid' || e.kind === 'jump' || e.kind === 'drop')).slice(-SOUND.RIVALS);
  rivals.forEach((e, i) => out.push({ at: SOUND.RIVAL_AT + i * SOUND.RIVAL_GAP, say: ['rival', { kind: e.kind === 'drop' ? 'drop' : 'bid', side: Math.max(0, names.indexOf(e.who)) % 2 === 0 ? 'left' : 'right' }] }));
  const end = list.find((e) => e && (e.kind === 'sold' || e.kind === 'nosale'));
  if (end) out.push({ at: SOUND.RIVAL_AT + rivals.length * SOUND.RIVAL_GAP + SOUND.HAMMER_GAP, say: ['hammer', { won: end.kind === 'sold' && end.who === 'You' }] });
  return out;
}
/**
 * The sounds one move makes. `key` is the stage, `action` the run's action (or one of the room's own: angle, verify, quick-stage, quick-all, stop, result), `o` what the screen knew:
 *   b, a  the stage's view() before and after (plain data)     r    run.act's answer { ok, done, gone }     res  the stage's result once it is done
 *   fresh the log entries an auction added                      lot  the lot's id (the suspicion cue is once per lot)
 */
export function soundsFor(key, action, o = {}) {
  const out = [], hear = (id, opts = {}, at = 0) => out.push({ at, hear: [id, opts] }), say = (what, data = {}, at = 0) => out.push({ at, say: [what, data] });
  const b = o.b || null, a = o.a || null, r = o.r || { ok: true }, res = o.res || null, done = !!r.done, type = action && action.type;
  if (r.ok === false && type !== 'result' && type !== 'verify') { hear('ui.refuse'); return out; } // the engine said no: a short "no", never the sound of the move (a refused verify has its warn toast)
  const close = () => hear('haggle.close', { variant: res && res.deal ? 'accept' : 'walk' }); // a deal is shaken on, or the table is left (by you, or by them when their patience ran out)
  const tellNow = () => (a && !done && a.tell && (!b || b.tell !== a.tell) ? a.tell : null); // their stance, when this move changed it (the screen's own "They are very close")
  const stance = (at) => { const t = tellNow(); if (t) say('tell', { tell: t }, at); };
  switch (type) {
    case 'probe': {
      const ev = a && a.evidence && a.evidence.length ? a.evidence[a.evidence.length - 1] : null;
      const spotted = !!(ev && ev.id === action.id && ev.found && ev.found.length); // the evidence line says "You spot a problem": the sound says it too
      hear('read.probe', spotted ? { variant: action.id } : { variant: action.id, ...SOUND.HOLLOW });
      const p0 = b && b.belief ? b.belief.fakeProb : 0, p1 = a && a.belief ? a.belief.fakeProb : 0; // the counterfeit meter the screen draws, and nothing else
      if (spotted || (p0 < 0.6 && p1 >= 0.6)) say('suspect', { lot: o.lot, p: p1 }, SOUND.PROBE_MS);
      else if (done) say('stage', { key }, SOUND.PROBE_MS);
      break;
    }
    case 'conclude': if (done) say('stage', { key }); break;
    case 'pick': { // the pitch: how well the angles fit this buyer, or only that the stage is over
      const d = a && a.outcome ? Number(a.outcome.fitDelta) : NaN;
      if (d >= 0.05 || d <= -0.03) say('fit', { delta: d }); else if (done) say('stage', { key });
      break;
    }
    case 'angle': hear('pitch.angle', { variant: o.on ? action.angle : 'drop' }); break;
    case 'verify': if (r.ok !== false) hear('deal.verify', { variant: o.scam ? 'bad' : 'ok' }); break; // the answer the player paid for
    case 'anchor': if (done) close(); else { hear('haggle.anchor', { variant: action.level }); stance(SOUND.TELL_AT); } break;
    case 'hold': if (done) close(); else { hear('haggle.move', { variant: 'hold' }); stance(SOUND.TELL_AT); } break;
    case 'split': if (done) close(); else { hear('haggle.move', { variant: 'split' }); stance(SOUND.TELL_AT); } break;
    case 'concede': {
      if (done) { close(); break; }
      const tap = !!tellNow(), size = action.size; // when their stance follows, the move is one tap: the tell carries the news (docs/AUDIO.md 3.4.6)
      hear('haggle.move', tap || size === 'small' ? { variant: 'small' } : size === 'large' ? { variant: 'large' } : { variant: 'small', params: { n: 2 } });
      stance(SOUND.TELL_AT);
      break;
    }
    case 'leverage': if (done) close(); else { hear('haggle.leverage'); stance(SOUND.LEVER_AT); } break;
    case 'accept': case 'walk': close(); break;
    case 'bid': case 'drop': {
      hear(type === 'bid' ? 'bid.raise' : 'bid.drop', type === 'bid' ? { params: { n: Math.min(4, b ? num(b.round) : 0) } } : {});
      for (const s of auctionSounds(o.fresh, a && Array.isArray(a.rivals) ? a.rivals.map((x) => x.name) : [])) out.push(s);
      break;
    }
    case 'stop': hear('repair.stop', { variant: stopTier(o.acc) }); break;
    case 'careful': hear('repair.stop', { variant: 'ok' }); break; // three steps by the book are 50% each: an ok
    case 'quick-stage': hear('deal.quick'); break;
    case 'quick-all': say('quick', { all: true }); break;
    case 'count': say('count', { xp: num(o.xp) }, SOUND.COUNT_AT); break; // the card's numbers tick up (ui.count-up: 25 XP or more, and only in a quiet moment)
    case 'result': { // the card: the engine's own sale, purchase or repair has been heard in the same burst and outranks this
      const s = o.summary || {}, v = s.quick ? null : verdictOf(s.numbers);
      say('result', { tone: s.tone, xp: s.xp });
      if (v === 'win' && s.tone !== 'bad') hear('ui.ok', {}, SOUND.VERDICT_AT); // the stamp "Better than Quick" (a bad card is never answered with a chime: valence does not contradict itself)
      else if (v === 'lose') hear('ui.nudge', {}, SOUND.VERDICT_AT); // "Quick would have done better": a gentle look-again, never a buzzer
      break;
    }
    default: break;
  }
  return out;
}

// ------------------------------------------------------------------ the DOM half
let active = null;
export function createSession(ctx, run) {
  const S = ctx.S, doc = typeof document !== 'undefined' ? document : null;
  const ses = { ctx, run, pick: [], slider: 0.2, shown: false, raf: 0, t0: 0, paused: false, disposed: false, reduced: () => !!(ctx.reduced && ctx.reduced()), focusHead: true };
  const el = () => ctx.dlg.el;
  const live = !!(doc && el() && el().querySelector);

  // ---- sound (the section above says what and why). The engine is the drawer context's (ctx.audio) when the shell gives one, else the page's own. Every call is guarded: sound is never worth a broken deal.
  const eng = () => (ctx.audio && typeof ctx.audio.play === 'function' ? ctx.audio : audio);
  const timers = new Set();
  const emit = (what, data) => { try { if (ctx.emit) ctx.emit({ type: 'ui', ui: 'deal', what, ...data }); } catch { /* a listener must not break the room */ } };
  const one = (item) => { try { if (item.hear) eng().play(item.hear[0], item.hear[1]); else emit(item.say[0], item.say[1]); } catch { /* sound is optional */ } };
  const play = (list) => { for (const item of list) { if (item.at > 0) { const h = setTimeout(() => { timers.delete(h); if (!ses.disposed) one(item); }, item.at); timers.add(h); } else one(item); } };
  /** Chooses the sounds of a move and plays them. A fault in choosing them is the sound's, never the deal's. */
  const plan = (key, action, o) => { try { play(soundsFor(key, action, o)); } catch { /* sound is optional */ } };
  const stopSounds = () => { for (const h of timers) clearTimeout(h); timers.clear(); clearTimeout(ses.toneT); if (typeof ses.offMute === 'function') ses.offMute(); ses.offMute = null; };
  ses.sound = () => { const a = appSettings.audio; return !a || audible(a); }; // on only when something can be heard (a volume of 0 is not "on")
  ses.toneWanted = () => { const a = appSettings.audio || {}; return a.dial === true && a.mute !== true && a.quiet !== true; };
  ses.dialInfo = () => dialInfo(appSettings.audio);
  const tone = (p, z) => { const st = toneStep(ses.tone, p, z.lo, z.hi); if (st) { ses.tone = st; try { eng().dial.update(st.pos, z.lo, z.hi); } catch { /* the tone is an addition */ } } };
  /** The tone's switch was pressed while the animated dial runs: start following the marker at once, or let go of it. (A slider's tone is made per move.) */
  // The engine owns the tone and ends it by itself when sound is muted, Game sounds go off or the tab is hidden, and says so only through its events: the room's own `toneOn` flag went stale, `dial.update`
  // does nothing without a tone, and a Fix stage that was muted and unmuted (key M, the room's Sound switch, a tab put away and back) never heard the tone again while the room went on saying it was on.
  // So the flag is checked against the engine (`dial.active`, false only when it really is not running) and the tone is started again as soon as it can be heard.
  const toneGone = () => { try { return eng().dial.active === false; } catch { return false; } };
  const retone = () => {
    if (!ses.raf || ses.reduced()) return;
    if (ses.toneWanted()) { if (!ses.toneOn || toneGone()) { ses.toneOn = false; toneOn(); } }
    else if (ses.toneOn) { ses.toneOn = false; ses.tone = null; try { eng().dial.stop(); } catch { /* gone */ } }
  };
  const toneOn = () => { try { const d = eng().dial; ses.toneOn = !!(d && typeof d.start === 'function' && d.start()); } catch { ses.toneOn = false; } ses.tone = null; return ses.toneOn; };
  /** What the screen shows now, for the sound to be chosen from: the stage's key, its view, and how many log entries an auction has. */
  const look = () => { const k = run.key; return { k, v: run.view(), n: k === 'bid' && run.st.bid && run.st.bid.events ? run.st.bid.events.length : 0 }; };
  const lastAcc = () => { const st = run.st.fix, steps = st && st.steps; return steps && steps.length ? steps[steps.length - 1].acc : NaN; };

  // Where the keyboard was in the sheet before a paint (the control's name and its place among the sheet's controls), so a paint that removes or disables that control can
  // put the cursor on its neighbor instead of letting it fall to the page (a used probe is disabled, the Pitch button goes once the pitch is made, the anchor row is replaced).
  const fids = (d) => [...d.querySelectorAll('.deal-stage [data-fid], .deal-foot [data-fid]')];
  const noteFocus = () => { const d = el(), a = doc.activeElement; ses.was = a && d.contains(a) && a.dataset && a.dataset.fid ? { fid: a.dataset.fid, at: fids(d).indexOf(a) } : null; };
  const keepFocus = (d) => {
    const a = doc.activeElement, lost = !a || a === doc.body || a === d || !d.contains(a) || a.disabled; // setHTML has already put it back on a control that still stands
    if (!lost || !ses.was) { ses.was = null; return; }
    const ok = fids(d).filter((x) => !x.disabled && x.getAttribute('aria-disabled') !== 'true'), same = ok.find((x) => x.dataset.fid === ses.was.fid);
    const near = same || ok.reduce((best, x) => (!best || Math.abs(fids(d).indexOf(x) - ses.was.at) < Math.abs(fids(d).indexOf(best) - ses.was.at) ? x : best), null);
    (near || d.querySelector('[data-stage-head]'))?.focus?.({ preventScroll: true });
    ses.was = null;
  };

  const paint = () => {
    if (live && ses.shown) noteFocus();
    const html = sheetHTML(viewModel(ses));
    if (!ses.shown) { ctx.dlg.open(html, { cls: 'deal', label: titleOf(modelOf(run)) }); ses.shown = true; if (live) el()._html = html; bind(); }
    else if (live && ctx.setHTML) ctx.setHTML(el(), html); else ctx.dlg.open(html, { cls: 'deal', label: titleOf(modelOf(run)) });
    if (live) after();
  };
  // Where the cursor is after a paint must be somewhere it can be seen. Every paint puts it back with preventScroll (a page that jumps under a mouse is worse), so a control that sits under
  // the sticky foot, or above the top of a sheet that was scrolled for the last stage, was never brought into view: the next probe after one is used, the Stop of the second repair step,
  // Bid after a bid, a stage's own head after Continue. One scroll after every paint, wherever the cursor went (kept, moved to its neighbour or put on the stage head), brings it just in.
  const STICKY = '.deal-dock, .deal-foot, .deal-result > .row:last-child';
  const reveal = (d) => { const a = doc.activeElement; if (a && a !== d && d.contains(a)) keepInView(d, a, { sticky: STICKY }); revealFoot(d); };
  // The result's Continue row sticks to the foot of the sheet, but a sticky row is held inside the block it is in (css `.deal-result > .row:last-child`): while that block's top is still below the fold the row is
  // cut off by the sheet's edge until the sheet has scrolled (it was half a Continue button at 640x360 once the Academy's strip made the sheet 50px shorter, and one that is off the bottom at the top of the sheet).
  // keepInView leaves a sticky control alone as always in sight, which is true of a foot and not of this row, so the sheet is scrolled just far enough that the whole row is in.
  const revealFoot = (d) => {
    const row = d.querySelector('.deal-result > .row:last-child'); if (!row) return;
    const q = row.getBoundingClientRect(), r = d.getBoundingClientRect(), k = d.offsetHeight > 0 && r.height > 0 ? r.height / d.offsetHeight : 1, foot = r.top + (d.clientTop + d.clientHeight) * k;
    if (q.width > 0 && q.height > 0 && q.bottom > foot + 1) d.scrollTop += (q.bottom - foot) / k;
  };
  const after = () => {
    const d = el();
    if (ses.focusHead) {
      ses.focusHead = false; ses.was = null;
      d.scrollTop = 0; // a new stage, or the result, is a new page: it opens at its head, not half way down the last one
      const h = d.querySelector('[data-stage-head]'), f = d.querySelector('.deal-foot [autofocus], .deal-stage [autofocus]');
      (f || h)?.focus?.({ preventScroll: true });
    }
    else keepFocus(d);
    reveal(d);
    // the sheet arrives drawn a little small and low (deal-in): measured then, a control is a few pixels off, so it is looked at again when the arrival is over
    const arriving = (d.getAnimations?.() || []).filter((x) => x.playState === 'running');
    if (arriving.length) Promise.all(arriving.map((x) => x.finished)).then(() => { if (!ses.disposed) reveal(d); }, () => {});
    if (run.key === 'fix' && !run.res.fix && !ses.reduced()) startDial(); else stopDial();
    // presentation only: the result is staged (numbers tick up, the stamp lands, the bars grow) the first time it is painted and never again, so a later paint
    // of the same screen, such as the Assist box being toggled, shows it at rest instead of replaying it
    if (d.querySelector('[data-anchor="deal-result"]')) { if (!ses.revealed) { ses.revealed = true; countUp(d, { reduced: ses.reduced() }) && plan('result', { type: 'count' }, { xp: run.summary ? run.summary.xp : 0 }); } } else ses.revealed = false; // (countUp says how many numbers it started: none under reduced motion, so no sound for a count nobody sees)
  };

  // ---- the repair dial: the marker is a function of time, so a frame only moves one element
  function startDial() {
    if (ses.raf || !doc) return;
    ses.t0 = performance.now();
    toneOn(); // the opt-in repair tone follows the marker through 11 notes (docs/AUDIO.md 4.5); with the setting off this is false and a frame costs nothing more
    const tick = () => {
      const v = run.view(), mark = el().querySelector('.dial-mark');
      if (!v || !mark) { ses.raf = 0; return; }
      const p = dialPos(performance.now() - ses.t0, v.step, v.seed);
      mark.style.left = `${(p * 100).toFixed(2)}%`;
      if (ses.toneOn && toneGone()) retone(); // the engine ended it behind the room's back: start it again, or let the flag go
      if (ses.toneOn) tone(p, v.zone);
      ses.raf = requestAnimationFrame(tick);
    };
    ses.raf = requestAnimationFrame(tick);
  }
  function stopDial() { if (ses.raf) cancelAnimationFrame(ses.raf); ses.raf = 0; if (ses.toneOn) { ses.toneOn = false; ses.tone = null; clearTimeout(ses.toneT); try { eng().dial.stop(); } catch { /* gone */ } } }
  const stopAt = () => {
    const v = run.view(); if (!v) return { ok: false };
    const t = ses.reduced() ? tForPos(ses.slider, v.step, v.seed) : performance.now() - ses.t0;
    stopDial(); ses.t0 = 0;
    return run.act(ses.reduced() ? { type: 'stop', t, slider: true } : { type: 'stop', t }); // the slider is a par option (play/repair.js SLIDER_CAP), not a free perfect score
  };

  const say = (r) => { if (r && r.ok && r.say) ctx.announce?.(r.say); };
  const go = (action) => {
    const b = look(), r = run.act(action); say(r); if (r.ok) after1();
    if (r.gone) { result(); return r; } // what the table was about has left: the result card says so, and closes it
    const a = look(), made = a.n - b.n; // the sound is chosen from the screen's own view before and after the move, before the stage moves on
    plan(b.k, action, { b: b.v, a: a.v, r, res: run.res[b.k], fresh: made > 0 && a.v && a.v.events ? a.v.events.slice(-made) : [], lot: run.plan.lot && run.plan.lot.id });
    paint(); return r;
  };
  const after1 = () => { if (run.stageDone()) ctx.announce?.(`${STAGE_LABEL[run.key] || 'Stage'} complete.`); };
  const result = () => {
    const s = run.finish(), good = s.tone === 'good', bad = s.tone === 'bad';
    ses.focusHead = true; stopDial();
    plan('result', { type: 'result' }, { summary: s }); // the engine's own sale, purchase or repair was heard in this burst and outranks the card's stamp
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
    'quick-stage'() { if (run.quick()) plan(run.key, { type: 'quick-stage' }); ses.focusHead = true; ctx.announce?.('Played at average skill.'); paint(); },
    'quick-all'() { ses.quicked = true; plan(run.key, { type: 'quick-all' }); run.quickAll(); result(); },
    next: advance,
    finish: result,
    pass() { run.walkAway(); result(); },
    probe(b) { go({ type: 'probe', id: b.dataset.id }); },
    'read-done'() { go({ type: 'conclude' }); },
    angle(b) { const a = b.dataset.angle, i = ses.pick.indexOf(a); if (i >= 0) ses.pick.splice(i, 1); else { if (ses.pick.length >= 2) ses.pick.shift(); ses.pick.push(a); } plan('pitch', { type: 'angle', angle: a }, { on: i < 0 }); paint(); },
    'pitch-go'() { if (ses.pick.length === 2) go({ type: 'pick', angles: [...ses.pick] }); },
    verify() { const r = run.verify(); plan('pitch', { type: 'verify' }, { r, scam: !!r.scam }); ctx.toast?.(r.msg, r.ok && !r.scam ? 'good' : 'warn'); if (r.ok) ctx.announce?.(r.msg); ctx.render?.(); paint(); },
    anchor(b) { go({ type: 'anchor', level: b.dataset.level }); },
    hold() { go({ type: 'hold' }); },
    concede(b) { go({ type: 'concede', size: b.dataset.size }); },
    split() { go({ type: 'split' }); },
    leverage() { go({ type: 'leverage' }); },
    accept() { go({ type: 'accept' }); },
    walk() { if (run.key === 'close' && run.view() && run.view().round > 0) go({ type: 'walk' }); else { run.walkAway(); result(); } },
    bid() { go({ type: 'bid' }); },
    drop() { go({ type: 'drop' }); },
    stop() { const r = stopAt(); if (r.gone) { result(); return; } plan('fix', { type: 'stop' }, { r, acc: r.ok ? lastAcc() : NaN }); say(r); after1(); paint(); },
    careful() { stopDial(); go({ type: 'careful' }); },
    dialtone() { const r = toggleDial(appSettings.audio || {}); if (r.changed) { appSettings.audio = r.next; try { applySettings(); } catch { /* no page: a test */ } } ctx.announce?.(r.said); retone(); if (r.changed && r.hears) one({ hear: ['ui.toggle', { variant: r.next.dial ? 'on' : 'off' }] }); paint(); }, // the room's switch for the repair tone (docs/AUDIO.md 4.5)
    sound() { const r = toggleMute(appSettings.audio || {}); if (r.changed) { appSettings.audio = r.next; try { applySettings(); } catch { /* no page: a test */ } } ctx.announce?.(r.said); if (r.changed && r.hears) one({ hear: ['ui.toggle', { variant: 'on' }] }); paint(); }, // the room's own switch; key M does the same anywhere
  };
  const changes = {
    assist(b) { const on = !!b.checked; kv.set('assist', on); run.setAssist(on); paint(); },
  };
  const inputs = {
    slider(b) { ses.slider = Math.max(0, Math.min(1, num(+b.value) / 100)); const d = el(), v = run.view(); if (!d || !v) return; const mark = d.querySelector('.dial-mark'), say2 = d.querySelector('#dial-say'); if (mark) mark.style.left = `${ses.slider * 100}%`; if (say2) say2.textContent = dialWord(ses.slider, v.zone); b.setAttribute('aria-valuetext', dialWord(ses.slider, v.zone)); slideTone(ses.slider, v.zone); },
  };
  // the slider (reduced motion) drives the same opt-in tone while it is being moved, and lets it go half a second after the last move (docs/AUDIO.md 4.5)
  const slideTone = (p, z) => { if (!ses.toneWanted()) return; if (!ses.toneOn && !toneOn()) return; tone(p, z); clearTimeout(ses.toneT); ses.toneT = setTimeout(stopDial, 500); };
  ses.acts = acts; ses.changes = changes; ses.inputs = inputs;

  // ---- listeners on the shared dialog: one set per session, removed when it closes
  const DOUBLE_MS = 350; // the same button pressed again this soon is a double-click, not a second decision (the stage under the pointer often changes to another button in the same place, which is a new move)
  const onClick = (e) => { const b = e.target.closest?.('[data-deal]'); if (b && !b.disabled && el().classList.contains('deal')) { e.preventDefault(); if (!run.over && run.gone?.()) { result(); return; } const name = b.dataset.deal, at = performance.now(); if (ses.lastAct && ses.lastAct.name === name && at - ses.lastAct.at < DOUBLE_MS) return; /* the second press of a double-click is not a second move: the same move again within a third of a second (a different button in the same place is another move) */ ses.lastAct = { name, at }; acts[name]?.(b, e); } };
  const onChange = (e) => { const b = e.target.closest?.('[data-change-deal]'); if (b) changes[b.dataset.changeDeal]?.(b, e); };
  const onInput = (e) => { const b = e.target.closest?.('[data-deal-input]'); if (b) inputs[b.dataset.dealInput]?.(b, e); };
  const onKey = (e) => {
    if (e.repeat && e.target.closest?.('[data-deal]')) { e.preventDefault(); return; } // a key held on a button repeats its click: one press is one move
    if (run.key !== 'fix' || run.res.fix || ses.reduced() || e.repeat || !(e.key === ' ' || e.key === 'Enter')) return;
    if (e.target.closest?.('button, input, select, a, textarea, summary')) return;
    e.preventDefault(); acts.stop();
  };
  const onClose = () => { if (el().open) return; dispose(); }; // a deal shown over this one has already reopened the dialog
  // The keyboard's own moves (Tab, Shift+Tab, a ring showing): the browser scrolls the control in by the sheet's scroll-padding, which is a guess at the foot's height and can leave the
  // ring a pixel under it. Looked at once the browser has scrolled, and only where a ring shows: a click that focused a half-seen button must not move it before the button is released.
  const ringShows = (t) => { try { return !!t.matches(':focus-visible'); } catch { return true; } }; // a browser without :focus-visible shows a ring for every focus
  const onFocusIn = (e) => { const t = e.target; if (!t || !ringShows(t)) return; requestAnimationFrame(() => { if (!ses.disposed && el().open && el().contains(t)) reveal(el()); }); };
  const onResize = () => { if (el().open && el().classList.contains('deal')) reveal(el()); }; // a turned phone, a window made smaller: the foot changed its height
  function bind() {
    if (!live) return;
    const d = el();
    d.addEventListener('click', onClick); d.addEventListener('change', onChange); d.addEventListener('input', onInput); d.addEventListener('keydown', onKey); d.addEventListener('close', onClose); d.addEventListener('focusin', onFocusIn);
    window.addEventListener('resize', onResize);
  }
  function dispose() {
    if (ses.disposed) return; ses.disposed = true; stopDial(); stopSounds();
    if (live) { const d = el(); d.removeEventListener('click', onClick); d.removeEventListener('change', onChange); d.removeEventListener('input', onInput); d.removeEventListener('keydown', onKey); d.removeEventListener('close', onClose); d.removeEventListener('focusin', onFocusIn); window.removeEventListener('resize', onResize); }
    if (ses.paused && S && S.clock && S.clock.paused) S.setPaused(false);
    if (active === ses) active = null;
    ctx.render?.();
  }
  ses.dispose = dispose;
  ses.show = () => {
    if (active && active !== ses) active.dispose(); // one Deal Room at a time: the old one's listeners must not answer the new one's clicks
    active = ses;
    // The room opens with the voice of what it is about (a shop door, a stall, the bench). A microtask, queued before the sheet opens: the page's dialog observer plays deal.open too, with no way to know
    // which room this is, and this one comes first, so its sound is the one that stands. Quick buy takes the sheet over in this same task and plays deal.quick instead (docs/AUDIO.md 4.3).
    Promise.resolve().then(() => { if (!ses.disposed && !ses.quicked) one({ hear: ['deal.open', { variant: openVariant(run.plan.kind) }] }); });
    try { let was = ses.sound(); const off = eng().on && eng().on(() => { if (ses.disposed) return; retone(); const now = ses.sound(); if (now !== was) { was = now; paint(); } }); if (typeof off === 'function') ses.offMute = off; } catch { /* no engine to watch */ } // key M mutes from anywhere: the switch follows, and so does the repair tone (unmuting, or showing the tab again, starts it again)
    // the world waits while you deal (unless a classroom clock is in charge)
    if (S && S.clock && !S.clock.paused && (S.mode ? S.mode === 'solo' : S.canSetClock && S.canSetClock())) { S.setPaused(true); ses.paused = true; } // a solo run only: never the class's clock
    // a repair opens on a dial whose track is a picture: the first one of a run says in words what to press and how to do it without timing or sight (once per run: tellOnce), on the page and aloud
    // ...but only for a repair that HAS a dial: one the player cannot afford has none (the stage never starts), and it used to spend the once-per-run explanation on a dial that was not there (fifth round, U4)
    const dialUp = run.key === 'fix' && !run.res.fix && !ses.reduced() && !!run.view();
    ses.longEar = dialUp && tellOnce(kv, S && S.worldSeed);
    ses.dialSwitch = dialUp && dialsDrawn(S && S.worldSeed) <= DIAL_SWITCH_DIALS;
    paint();
    const dialSay = ses.longEar ? ` ${dialAnnounceText(ses.dialInfo())}` : '', blocked = run.key === 'fix' && run.plan.blocker ? ` ${run.plan.blocker}` : ''; // a repair that cannot be afforded says so instead
    ctx.announce?.(`${titleOf(modelOf(run))}. ${run.plan.cast.name} says: ${run.plan.cast.hello}${blocked}${dialSay}`);
  };
  ses.paint = paint;
  return ses;
}

/** What the open Deal Room is about, as ids ({ kind, lot, lead, asset, assetCls }; any may be missing), whether its result is showing (done) and what its foot offers (stageDone: the stage in play is finished, so the foot says
 *  Continue, or See the result when it is the `last` stage), or null when none is open. The Academy's coach card needs it to tell whether the thing a step points at is the very one on the table, and to name the button that is there. */
export function openDealOf() {
  const p = active && !active.disposed && active.run ? active.run.plan : null;
  if (!p) return null;
  const r = active.run;
  return { kind: p.kind, lot: p.lot?.id, lead: p.lead?.id, asset: p.asset?.id, assetCls: p.asset?.cls, done: !!r.over, stageDone: !r.over && !!r.res?.[r.key], last: Array.isArray(r.stages) && r.idx === r.stages.length - 1 };
}

/** The one function the shell calls (ctx.deal). Returns the session, or { ok:false, msg } when the deal cannot start. */
export function openDeal(ctx, spec) {
  const run = startRun(ctx.g(), spec, { assist: !!kv.get('assist') });
  if (!run.ok) { ctx.toast?.(run.msg, 'warn'); return run; }
  const ses = createSession(ctx, run);
  ses.show();
  return ses;
}
