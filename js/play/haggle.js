// HAGGLE: a negotiation against a counterparty with a hidden limit. Teaches anchoring (the first number pulls the talk),
// the ZOPA (the zone between your floor and their limit), the BATNA (a real alternative is leverage, a fake one is not)
// and that people differ: hard bargainers punish insults, analytical ones punish low-balls and ignore noise, friendly ones
// trade concessions in kind, impulsive ones pay for excitement and cool off with time. Pure logic: no DOM, timers or globals.
//
// Internally everything lives in the SELLER's frame, in units of `fair` (u = price / fair). A buyer's game is the mirror
// image (u = 2 - price / fair), so one model serves both roles. Anchor levels are literal in the real world: for role
// 'buy', 'low' is the aggressive opening offer and 'high' the generous one. A deal can never pass the hidden limit, and
// every closed deal lands in [0.6, 1.4] x fair. Each exchange the counterparty answers with a number (`theirs`) and a tell:
// 'far' (well out of reach), 'reach' (close) or 'near' (almost); a hard bargainer never shows 'near', an impulsive one is noisy.
// The temperaments' numbers are the textbook knowledge a good player builds up; the expert policy (skill 1) uses them, the
// read of their limit (tightened by `insight`) and the pace of their offers, never the hidden limit itself.
import { RNG, hash } from '../rng.js';

const LO = 0.6, HI = 1.4, MKT = 1.15, LEV_CAP = 0.985;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sig = (x) => Number(Number(x).toPrecision(6));
const num = (x) => typeof x === 'number' && Number.isFinite(x);
export const STYLES = ['hard', 'friendly', 'impulsive', 'analytical'];
export const ANCHORS = { high: 1.4, fair: 1, low: 0.7 }; // seller frame, times fair
export const STEPS = { small: 0.04, medium: 0.09, large: 0.16 }; // times fair
const RECIP = { small: 1, medium: 0.5, large: 0.2 }; // how much of a concession a friendly counterparty returns
// tau0/grow/cap: the share of their limit they accept now / change per round / never exceed. open: first bid (share of limit).
// gap: how far under their accept line they bid. speed: how fast the bid chases it. slack: extra they allow for a split.
const P = {
  hard: { tau0: 0.8, grow: 0.04, cap: 0.97, open: 0.52, gap: 0.1, speed: 0.35, slack: 0 },
  friendly: { tau0: 0.84, grow: 0.015, cap: 0.96, open: 0.68, gap: 0.05, speed: 0.55, slack: 0.03 },
  impulsive: { tau0: 0.84, grow: -0.045, cap: 0.98, open: 0.74, gap: 0.06, speed: 0.65, slack: 0.02 },
  analytical: { tau0: 0.88, grow: 0, cap: 0.9, open: 0.78, gap: 0.04, speed: 0.5, slack: 0 },
};
const LINES = {
  hard: { far: "We're nowhere near. %t. I'm in no hurry.", reach: 'Still not it. %t, and not a cent more yet.', near: 'Hm. %t. Think about it.', yes: 'Fine. Done.', bye: "I'm finished here. Goodbye.", walk: 'Suit yourself.', mad: "You can't be serious. That number ends the friendly part.", levYes: "Another offer? ...Fine, %t.", levNo: 'Then take it. I still say %t.', splitNo: "I don't split." },
  friendly: { far: "Ha, ambitious! How about %t?", reach: 'Getting there, friend. %t?', near: 'So close! Meet me at %t and we shake on it.', yes: 'Deal! Pleasure doing business.', bye: "I'd love to, but I have to run. Another time!", walk: 'Aw, shame. Take care.', mad: "That's a bit steep, friend. Let's be sensible.", levYes: "Oh, someone else is interested? Then let me do %t.", levNo: "Honestly, %t is better than that offer.", splitNo: 'Not quite yet. Move a little more?' },
  impulsive: { far: 'Whoa, too much! %t!', reach: 'Hmm, hmm... %t?', near: "Ooh, tempting! %t, quick, before I change my mind!", yes: 'Yes! Done, done!', bye: 'Ugh, never mind, I lost the mood.', walk: 'Wait, really? Fine!', levYes: 'Someone else wants it?! No way, %t!', levNo: "Meh. %t, that's still better.", splitNo: "Splitting? Not feeling it." },
  analytical: { far: "That is off by my numbers. %t is defensible.", reach: 'Closer. My model says %t.', near: 'Within tolerance. %t.', yes: 'Acceptable. Agreed.', bye: 'We have exhausted the useful rounds. Goodbye.', walk: 'Noted.', mad: 'That is outside any reasonable range.', sus: "That is far under market. What is wrong with it? %t, at most.", levYes: 'A comparable offer is evidence. Revising to %t.', levNo: "That offer is below mine. %t stands.", splitNo: 'The midpoint is not supported by my numbers.' },
};
const money = (x) => '$' + (x >= 100 ? String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : x >= 1 ? x.toFixed(2) : x >= 0.01 ? x.toFixed(3) : Number(x.toPrecision(2)));
const flip = (role, level) => (role === 'sell' ? level : level === 'high' ? 'low' : level === 'low' ? 'high' : level); // literal <-> frame
const real = (s, u) => sig((s.role === 'sell' ? u : 2 - u) * s.fair);
const line = (s, key) => (LINES[s.style][key] || LINES[s.style].far).replace('%t', s.bid == null ? '' : money(real(s, s.bid)));

export function create(p = {}) {
  const role = p.role === 'buy' ? 'buy' : 'sell';
  const fair = num(p.fair) && p.fair > 0 ? p.fair : 1;
  const style = STYLES.includes(p.style) ? p.style : 'friendly';
  const seed = (num(p.seed) ? p.seed : 1) >>> 0;
  const insight = clamp(Math.round(num(p.insight) ? p.insight : 0), 0, 5);
  const n = clamp(Math.round((num(p.patience) ? p.patience : 5) - (num(p.handicap) ? p.handicap : 0)), 2, 7);
  const f = (price) => clamp(role === 'sell' ? price / fair : 2 - price / fair, LO, HI);
  const R = f(num(p.reserve) ? p.reserve : fair);
  const altRaw = p.alt && typeof p.alt === 'object' ? p.alt.price : p.alt;
  const alt = num(altRaw) && altRaw > 0 ? f(altRaw) : null;
  const rng = new RNG(hash('haggle' + seed));
  const tau0 = P[style].tau0 + (rng.next() * 2 - 1) * 0.03;
  const hw = [0.22, 0.18, 0.14, 0.1, 0.07, 0.04][insight], off = (rng.next() * 2 - 1) * hw * 0.7; // the read always contains the truth
  return {
    v: 1, role, fair, style, seed, rs: rng.s, insight, assist: !!p.assist, n, R, alt, tau0, tau: tau0,
    readLo: R * (1 + off - hw), readHi: R * (1 + off + hw), round: 0, ask: null, bid: null, tell: null, holds: 0,
    levUsed: false, lift: 0, susp: null, flag: null, anchor: null, done: false, end: null, price: null, log: [],
  };
}

function aLine(s) { // the most they accept right now (hidden)
  let a = s.R * clamp(s.tau, 0.3, P[s.style].cap);
  if (s.style === 'analytical') a = Math.min(a, MKT);
  if (s.susp != null) a = Math.min(a, s.susp);
  return Math.max(a, s.lift);
}
function ceilOf(s) { // the best price this counterparty could ever have been brought to
  const st = P[s.style];
  let a = s.R * clamp(s.tau0 + st.grow * (s.n - 1), 0.3, st.cap);
  if (s.style === 'analytical') a = Math.min(a, MKT);
  return Math.max(a, s.lift, LO + 0.05);
}

export function legal(s) {
  if (!s || s.done) return [];
  if (s.round === 0) return [...['high', 'fair', 'low'].map((level) => ({ type: 'anchor', level })), { type: 'walk' }];
  const out = [{ type: 'hold' }];
  if (s.ask > LO + 1e-9) for (const size of ['small', 'medium', 'large']) out.push({ type: 'concede', size }); // the last step stops at the floor
  if (s.ask - s.bid > 1e-6) out.push({ type: 'split' });
  if (s.alt != null && !s.levUsed) out.push({ type: 'leverage' });
  return out.concat([{ type: 'accept' }, { type: 'walk' }]);
}

function close(s, u, key) { s.done = true; s.end = 'deal'; s.price = clamp(u, LO, HI); return line(s, key); }

function anchorEffect(s, level) { // the first number pulls the talk, or insults it
  const rho = s.ask / s.R;
  if (s.style === 'hard') { if (rho > 1.25) { s.tau -= 0.1; s.n = Math.max(2, s.n - 2); s.flag = 'mad'; } else if (rho > 1) s.tau += 0.03; }
  else if (s.style === 'friendly') { if (rho > 1.25) { s.tau -= 0.04; s.flag = 'mad'; } else if (rho > 1) s.tau += 0.02; }
  else if (s.style === 'impulsive') s.tau += 0.12 * (level === 'high' ? 1 : level === 'fair' ? 0.3 : -0.3) * (rho > 1.5 ? 0 : rho > 1.25 ? 0.5 : 1);
  else if (level === 'low') { s.tau -= 0.1; s.susp = 0.92 * s.ask; s.flag = 'sus'; } // "if it is that cheap, what is wrong with it?"
  else if (rho > 1.25) { s.tau -= 0.04; s.n = Math.max(2, s.n - 1); s.flag = 'mad'; }
}

function step(s, a, rng) {
  const st = P[s.style], R = s.R, noise = rng.next() * 2 - 1;
  if (a.type === 'walk') { s.done = true; s.end = 'walk'; return line(s, 'walk'); }
  if (a.type === 'accept') return close(s, s.bid, 'yes');
  let key = null, c = 0;
  if (a.type === 'anchor') { s.anchor = flip(s.role, a.level); s.ask = ANCHORS[s.anchor]; anchorEffect(s, s.anchor); s.bid = st.open * R; key = s.flag; }
  else if (a.type === 'concede') {
    const to = Math.max(LO, s.ask - STEPS[a.size]); c = s.ask - to; s.ask = to; s.holds = 0;
    if (s.style === 'hard') s.tau -= (0.25 * c) / R; // a hard bargainer smells weakness
    if (s.style === 'friendly') s.tau += (RECIP[a.size] * c) / R; // small steps are met in kind
  } else if (a.type === 'hold') { s.holds++; if (s.style === 'friendly' && s.holds >= 2) s.tau -= 0.03; }
  else if (a.type === 'leverage') {
    s.levUsed = true; key = 'levNo';
    if (s.alt > s.bid + 0.005) { // only an alternative better than their offer counts
      const m = { hard: 0.97, friendly: 1, impulsive: 1.06, analytical: 1 }[s.style];
      s.lift = Math.max(s.lift, Math.min(R * LEV_CAP, s.alt * m)); s.susp = null; key = 'levYes';
    }
  }
  s.round++;
  if (s.round > 1) s.tau += st.grow;
  const A = aLine(s);
  if (a.type === 'anchor') s.bid = Math.min(s.bid, A - 0.02);
  if (a.type === 'split') {
    const mid = (s.ask + s.bid) / 2;
    if (mid <= Math.min(R, A + st.slack * R) + 1e-9) return close(s, mid, 'yes');
    key = 'splitNo';
  } else if (s.ask <= Math.max(A, s.bid) + 1e-9) return close(s, s.ask, 'yes');
  let b = s.bid + st.speed * Math.max(0, A - st.gap * R - s.bid);
  if (s.style === 'friendly' && c) b = Math.max(b, Math.min(A - 0.01, s.bid + RECIP[a.size] * c));
  s.bid = Math.max(s.bid, Math.min(b, A));
  const gap = (s.ask - Math.max(A, s.bid)) / R + (s.style === 'impulsive' ? 0.06 * noise : 0);
  s.tell = gap > 0.12 ? 'far' : gap > 0.05 || s.style === 'hard' ? 'reach' : 'near'; // a hard bargainer shows no "near"
  if (s.round >= s.n) { s.done = true; s.end = 'left'; return line(s, 'bye'); }
  return line(s, key || s.tell);
}

export function act(state, action) {
  if (!state || state.done || !action || !legal(state).some((l) => l.type === action.type && l.level === action.level && l.size === action.size)) return { state, say: null, done: !!(state && state.done) };
  const s = JSON.parse(JSON.stringify(state)), rng = new RNG(s.rs);
  const say = step(s, action, rng);
  s.rs = rng.s;
  s.log.push({ action: { ...action }, say, yours: s.ask == null ? null : real(s, s.ask), theirs: s.bid == null ? null : real(s, s.bid) });
  return { state: s, say, done: s.done };
}

// ---- what the player may know, and what a good player does with it -------------------------------------------------
function pubOf(s) {
  const bid = s.bid, bids = s.log.map((l) => l.theirs).filter((x) => x != null).map((x) => (s.role === 'sell' ? x / s.fair : 2 - x / s.fair));
  return { style: s.style, round: s.round, n: s.n, left: s.n - s.round, ask: s.ask, bid, bids, tell: s.tell, rl: Math.max(s.readLo, bid ?? 0), rh: s.readHi, alt: s.alt, lev: s.alt != null && !s.levUsed };
}

function expert(p) { // frame actions only; the caller maps anchor levels back to real ones
  const rc = p.rl + 0.35 * (p.rh - p.rl), st = P[p.style]; // lean to the low side of the read: guessing their limit too high costs the deal
  if (p.round === 0) return { type: 'anchor', level: ANCHORS.high <= (p.style === 'friendly' ? 1.3 : 1.25) * (p.rl + 0.15 * (p.rh - p.rl)) ? 'high' : ANCHORS.fair <= 1.25 * p.rl || p.rh >= 0.85 ? 'fair' : 'low' };
  const cap = (p.style === 'analytical' ? Math.min(MKT, st.cap * p.rh) : st.cap * p.rh) + (p.lev ? 0.02 : 0), w = p.style === 'impulsive' ? 0.06 : 0;
  let lo = Math.max(p.bid, (st.tau0 - 0.04 + st.grow * (p.round - 1) + (p.style === 'impulsive' ? 0.12 : 0)) * p.rl), hi = Math.min(p.ask, cap);
  if (p.style === 'analytical') lo = Math.max(p.bid, Math.min(lo, MKT - 0.1));
  const [gLo, gHi] = p.tell === 'near' ? [0, 0.05 + w] : p.tell === 'reach' ? [p.style === 'hard' ? 0 : Math.max(0, 0.05 - w), 0.12 + w] : [0.12 - w, 1]; // what the tell says about ask - A
  lo = Math.max(lo, p.ask - gHi * rc); hi = Math.min(hi, p.ask - gLo * rc);
  if (hi < lo + 0.01) hi = lo + 0.01;
  const k = p.bids.length, pace = k >= 2; // their pace gives them away: a bid chases (A - gap) at a speed that belongs to their temperament
  if (!pace && p.left >= 3 && p.tell !== 'near' && p.style !== 'impulsive') return { type: 'hold' }; // watch one more bid first (not an impulsive buyer: they cool)
  const est = pace ? clamp(p.bids[k - 2] + (p.bids[k - 1] - p.bids[k - 2]) / st.speed + st.gap * rc, lo, hi) : p.tell === 'far' ? clamp(p.ask - 0.16 * rc, lo, hi) : (lo + hi) / 2;
  const t = est + st.grow * rc - (p.left === 1 ? 0.025 : 0.012), need = p.ask - t;
  if (p.lev && p.alt > p.bid + 0.03 && (p.alt > t + 0.02 || p.left === 1)) return { type: 'leverage' };
  if (p.left === 1 && p.alt != null && p.alt > p.bid + 0.01 && p.alt > t) return { type: 'walk' }; // never settle below your alternative
  if (est - p.bid < 0.03 || (p.left === 1 && (need > 0.17 || t - p.bid < 0.03))) return { type: 'accept' };
  if (need <= 0.01) return { type: 'hold' };
  const sizes = ['small', 'medium', 'large'], up = sizes.find((z) => STEPS[z] >= need - 0.005) || 'large', down = sizes.filter((z) => STEPS[z] <= need + 0.012).pop() || 'small';
  return { type: 'concede', size: p.left === 1 ? up : p.style === 'friendly' && need <= 0.12 ? 'small' : down }; // probe from above while there are rounds left; the last step must land
}
const quick = (p) => (p.round === 0 ? { type: 'anchor', level: 'fair' } : p.bid >= 0.92 || p.left === 1 ? { type: 'accept' } : { type: 'concede', size: 'medium' });
function careless(p, rng) {
  if (p.round === 0) return { type: 'anchor', level: rng.pick(['low', 'low', 'fair', 'high']) };
  const r = rng.next();
  return r < 0.06 ? { type: 'walk' } : r < 0.35 && p.bid >= 0.6 ? { type: 'accept' } : { type: 'concede', size: 'large' };
}
const toReal = (s, a) => (a.type === 'anchor' ? { type: 'anchor', level: flip(s.role, a.level) } : a);

function advise(s) { // the textbook move and the reason, from public information only
  const p = pubOf(s), a = expert(p), $ = (u) => money(real(s, u)), sell = s.role === 'sell', fair = s.fair;
  const zone = `${$(sell ? p.rl : p.rh)} and ${$(sell ? p.rh : p.rl)}`, edge = `${sell ? 'The most they will pay' : 'The least they will take'} is probably between ${zone}`;
  let text, concept = 'zopa';
  if (a.type === 'anchor') {
    concept = 'anchoring';
    text = `Open ${flip(s.role, a.level)} at ${$(ANCHORS[a.level])}. The first number pulls the whole talk toward it. ${edge}, so this stays inside the zone of possible agreement (ZOPA) without insulting them.` +
      (s.style === 'hard' ? ' Hard bargainers dig in if you open past about 1.25 times their limit.' : s.style === 'analytical' ? ' They know the market price: a number far from fair makes them suspicious.' : s.style === 'impulsive' ? ' A big first number excites them.' : '');
  } else if (a.type === 'leverage') { concept = 'batna'; text = `Mention your alternative (${$(p.alt)}). It is your BATNA, the best you can do without this deal: a real competing offer makes walking away credible and lifts what they will accept.`; }
  else if (a.type === 'walk') { concept = 'batna'; text = `Their best (${$(p.bid)}) is worse than your alternative (${$(p.alt)}). Never settle below your BATNA: walk away and take the alternative.`; }
  else if (a.type === 'accept') text = `Their number, ${$(p.bid)}, is already near the edge of their range. ${edge}. Pushing further risks the whole deal. Take it.`;
  else if (a.type === 'hold') { concept = 'patience'; text = s.style === 'hard' ? 'Hold your number. Hard bargainers give ground slowly, but their patience also wears thin; wait, then close the gap in the last rounds.' : "Hold your number for a round and watch how fast their offers move: the pace of a counterparty's numbers shows where they are heading."; }
  else {
    concept = s.style === 'friendly' ? 'reciprocity' : 'zopa';
    const to = $(Math.max(LO, p.ask - STEPS[a.size]));
    text = `${sell ? 'Lower your ask' : 'Raise your offer'} by a ${a.size} step (${money(STEPS[a.size] * fair)}, to ${to}). ${s.style === 'friendly' ? (a.size === 'small' ? 'Friendly counterparties answer small steps in kind.' : 'That closes the gap fast, but friendly counterparties only match small steps.') : s.style === 'impulsive' ? 'Impulsive buyers cool off: close while they are keen.' : `They look ${p.tell || 'close'}: step toward the zone, not past it.`}`;
  }
  return { action: toReal(s, a), text, concept };
}

// view(s): { role, style, fair, round, rounds, roundsLeft, final, yours, theirs, tell, flag: 'mad'|'sus'|null, read: {lo, hi},
//   anchors: {high, fair, low} (the number each level says), steps: {small, medium, large} (what each concession moves you by),
//   floor (the worst price you may close at), alt, canLeverage, history: [{say, yours, theirs, action}], done, actions, advice? }
export function view(s) { // everything the player may see; never the limit, the accept line or the temperament's numbers
  const R = (u) => real(s, u), p = pubOf(s), left = s.n - s.round;
  const v = {
    role: s.role, style: s.style, fair: s.fair, round: s.round, rounds: s.n, roundsLeft: left, final: !s.done && left === 1,
    yours: s.ask == null ? null : R(s.ask), theirs: s.bid == null ? null : R(s.bid), tell: s.tell, flag: s.flag,
    read: { lo: R(s.role === 'sell' ? p.rl : p.rh), hi: R(s.role === 'sell' ? p.rh : p.rl) }, // a fuzzy estimate of their limit
    anchors: { high: R(ANCHORS[flip(s.role, 'high')]), fair: R(ANCHORS.fair), low: R(ANCHORS[flip(s.role, 'low')]) }, // by the number you would say
    steps: { small: sig(STEPS.small * s.fair), medium: sig(STEPS.medium * s.fair), large: sig(STEPS.large * s.fair) },
    floor: sig((s.role === 'sell' ? LO : HI) * s.fair), alt: s.alt == null ? null : R(s.alt), canLeverage: p.lev,
    history: s.log.map((l) => ({ say: l.say, yours: l.yours, theirs: l.theirs, action: l.action.type })), done: s.done, actions: legal(s),
  };
  if (s.assist && !s.done) v.advice = advise(s);
  return v;
}

export function result(s) {
  const base = { done: s.done, role: s.role, rounds: s.round, deal: false, price: null, mult: null, score: 0 };
  if (!s.done) return base;
  if (s.end !== 'deal') {
    const toAlt = s.end === 'walk' && s.alt != null;
    return { ...base, score: toAlt ? 0.3 : 0.05, walkedToAlt: toAlt, altPrice: toAlt ? real(s, s.alt) : null, reveal: { reserve: real(s, s.R) }, lesson: { concept: toAlt ? 'batna' : 'zopa', text: toAlt ? 'You walked to your alternative. Knowing your BATNA is what makes walking away possible.' : `No deal. Their limit was ${money(real(s, s.R))}; ${s.end === 'left' ? 'they ran out of patience before you met' : 'you left the table'}. When a gap sits inside the zone of possible agreement, closing it beats a stalemate.` } };
  }
  const price = real(s, s.price), mult = clamp(sig(price / s.fair), LO, HI), ceil = ceilOf(s);
  let score = clamp((s.price - LO) / (ceil - LO), 0, 1);
  if (s.alt != null && s.price < s.alt - 1e-9) score *= 0.6; // took less than the alternative: should have walked
  const share = Math.round(100 * clamp((s.price - LO) / Math.max(0.05, s.R - LO), 0, 1));
  const why = s.flag === 'mad' ? 'Opening far past their limit soured the talk.' : s.flag === 'sus' ? 'A low-ball made them suspicious and capped what they would pay.' : s.anchor === 'high' && share >= 70 ? 'Your high opening set the frame.' : share < 50 ? 'You gave ground faster than they did.' : 'You read where the zone ended.';
  return { ...base, deal: true, price, mult, score, reveal: { reserve: real(s, s.R) }, lesson: { concept: s.flag ? 'anchoring' : 'zopa', text: `Closed at ${mult.toFixed(2)} times fair, ${share}% of the way to their limit (${money(real(s, s.R))}). ${why}` } };
}

export function autoplay(params, skill = 0.5) {
  let s = create(params);
  const k = clamp(num(skill) ? skill : 0.5, 0, 1), rng = new RNG(hash('autoplay' + s.seed));
  const mode = k >= 0.5 ? (rng.next() < (k - 0.5) * 2 ? 'expert' : 'quick') : rng.next() < (0.5 - k) * 2 ? 'careless' : 'quick';
  const log = [];
  for (let i = 0; i < 40 && !s.done; i++) {
    const p = pubOf(s), f = mode === 'expert' ? expert(p) : mode === 'careless' ? careless(p, rng) : quick(p);
    let a = toReal(s, f), r = act(s, a);
    if (r.say === null) { a = { type: s.round === 0 ? 'walk' : 'accept' }; r = act(s, a); }
    log.push({ action: a, say: r.say }); s = r.state;
  }
  return { ...result(s), log };
}
