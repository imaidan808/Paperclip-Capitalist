// AUCTION: an ascending English auction against rivals with hidden limits and moods. Teaches the winner's curse: when
// every bidder holds a noisy estimate of the same thing, the winner is usually the one whose estimate ran highest, so
// winning at your own estimate loses money on average. The cure is to shade your ceiling below your estimate (more
// with more rivals), to read what rivals' drops tell you, and to drop without shame. Pure logic: no DOM, timers or globals.
//
// A bid raises the price by one increment. Rivals may raise by one, or jump by several; a bidder never bids past its limit.
// Each bid of yours is answered by at most one rival (the keenest to speak). The auction ends when one bidder remains or when
// nobody answers the hammer; dropping is always free and the room then plays on to the end so you see what it fetched.
// Moods the player sees: steady (patient), loud (aggressive or a bluffer: you cannot tell until it folds), quiet (a sniper).
// view(s): { estimate, opening, price (null before the first bid), nextBid, increment, budget, high (a name or null), youHigh, youIn,
//   round, yourTurn, rivals: [{ id, name, mood, active, droppedAt, high }], events (the last 12: { kind: bid|jump|drop|wait|sold|nosale,
//   who, price }), done, actions, advice? }. field() builds a realistic room for an item; ceiling() is the textbook stopping price.
import { RNG, hash } from '../rng.js';

export const STYLES = ['steady', 'aggressive', 'sniper', 'bluffer'];
const NAMES = ['Marla', 'Dev', 'Okafor', 'Ines', 'Bo', 'Kit', 'Rue', 'Sol'];
const MOOD = { steady: 'steady', aggressive: 'loud', sniper: 'quiet', bluffer: 'loud' }; // a bluffer looks like an aggressive bidder until it folds
const SHADE = { steady: 0.88, aggressive: 1.05, sniper: 0.9, bluffer: 0.7 }; // how far a style's limit sits from its own estimate (see field())
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const pos = (x, d) => (num(x) && x > 0 ? x : d);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sig = (x) => Number(Number(x).toPrecision(8));
const money = (x) => '$' + (x >= 100 ? String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : x >= 1 ? x.toFixed(2) : Number(x.toPrecision(2)));

/** A realistic field of rivals for an item: everyone sees the truth through noise. `noise` is the std-dev of an estimate (about 0.18 for a beginner, 0.08 with a sharp eye). */
export function field({ trueValue = 100, rivals = 4, noise = 0.18, seed = 1, reserve, increment, shade = {} } = {}) {
  const rng = new RNG(hash('field' + seed)), V = pos(trueValue, 100);
  const z = () => Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next());
  const bidders = [];
  for (let i = 0; i < clamp(Math.round(rivals), 0, 8); i++) { const style = STYLES[i === 0 ? 0 : rng.int(0, 3)]; bidders.push({ style, limit: sig(Math.max(0.05 * V, V * (1 + noise * z())) * (shade[style] ?? SHADE[style])) }); }
  return { estimate: sig(Math.max(0.1 * V, V * (1 + noise * z()))), trueValue: V, reserve: sig(reserve ?? 0.45 * V), increment: sig(increment ?? V / 25), bidders, seed };
}

export function create(p = {}) {
  // budget: only a missing one (null, undefined, NaN) means no cap. 0 is a real cap (a player with no cash bids nothing); negative counts as 0.
  const V = pos(p.trueValue, 100), seed = (num(p.seed) ? p.seed : 1) >>> 0, rng = new RNG(hash('auction' + seed));
  const s = {
    v: 1, seed, rs: rng.s, estimate: pos(p.estimate, V), trueValue: V, reserve: Math.max(0, num(p.reserve) ? p.reserve : 0.5 * V), inc: pos(p.increment, V / 25),
    budget: num(p.budget) ? Math.max(0, p.budget) : null, assist: !!p.assist, price: 0, high: null, youIn: true, round: 0, quiet: 0, done: false, winner: null, sold: null, events: [],
    bots: (Array.isArray(p.bidders) ? p.bidders : []).slice(0, 8).map((b, i) => ({ id: i, name: NAMES[i], style: STYLES.includes(b && b.style) ? b.style : 'steady', limit: Math.max(0, num(b && b.limit) ? b.limit : 0), active: true, droppedAt: null, raises: 0 })),
  };
  s.price = s.reserve;
  advance(s, rng); // the room warms up before the player's first look
  s.rs = rng.s;
  return s;
}

const nextBid = (s) => (s.high == null ? s.reserve : s.price + s.inc);
const who = (s, h) => (h === 'you' ? 'You' : h == null ? 'Nobody' : s.bots[h].name);
const ev = (s, kind, h, price) => s.events.push({ kind, who: who(s, h), price: price == null ? null : sig(price) });

// What a rival does when it is its turn: raise k increments, wait, or drop. Never past its limit.
function decide(s, b, rng) {
  const nb = nextBid(s), room = Math.floor((b.limit - nb) / s.inc + 1e-9) + 1;
  if (b.limit < nb - 1e-9) return { drop: true };
  if (b.style === 'steady') return s.high != null && s.price >= 0.75 * b.limit && rng.chance(0.08) ? { drop: true } : { k: 1 }; // loses its nerve now and then
  if (b.style === 'aggressive') return { k: Math.min(room, s.price < 0.6 * b.limit ? rng.int(2, 3) : 1) }; // jump bids to scare people off
  if (b.style === 'sniper') return s.quiet === 0 && nb < 0.8 * b.limit ? { wait: true } : { k: 1 }; // says nothing until the hammer is near
  return s.high != null && s.price >= 0.9 * b.limit ? { drop: true } : { k: Math.min(room, b.raises < 2 ? 2 : 1) }; // bluffer: loud at first, folds before its limit
}

const EAGER = { aggressive: 4, bluffer: 3, steady: 2, sniper: 1 }; // who speaks first when several want to raise
function sweep(s, rng) { // every rival looks; those who cannot go on drop, and one of those who can raises
  const keen = [];
  for (const b of s.bots) {
    if (!b.active || s.high === b.id) continue;
    const d = decide(s, b, rng);
    if (d.drop) { b.active = false; b.droppedAt = sig(s.price); ev(s, 'drop', b.id, s.price); }
    else if (d.wait) ev(s, 'wait', b.id, null);
    else keen.push([b, d.k]);
  }
  if (!keen.length) return false;
  const [b, k] = rng.weighted(keen, ([x]) => EAGER[x.style]);
  s.price = nextBid(s) + (k - 1) * s.inc; s.high = b.id; b.raises++; ev(s, k > 1 ? 'jump' : 'bid', b.id, s.price);
  return true;
}

function hammer(s) { s.done = true; s.winner = s.high; s.sold = s.high == null ? null : sig(s.price); ev(s, s.high == null ? 'nosale' : 'sold', s.high, s.price); }
function advance(s, rng) { // run the room until it is the player's turn again, or the hammer falls
  for (let i = 0; i < 20000 && !s.done; i++) {
    if (sweep(s, rng)) { s.quiet = 0; if (s.youIn && s.high !== 'you') return; continue; }
    if (s.youIn && s.high !== 'you') return;
    const others = s.bots.filter((b) => b.active && s.high !== b.id).length + (s.youIn && s.high !== 'you' ? 1 : 0);
    if (others === 0 || ++s.quiet >= 2) hammer(s);
  }
  if (!s.done && !s.youIn) hammer(s); // a ladder of absurdly small steps: call it rather than loop for ever
}

export function legal(s) {
  if (!s || s.done || !s.youIn || s.high === 'you') return [];
  return (s.budget == null || nextBid(s) <= s.budget + 1e-9 ? [{ type: 'bid' }] : []).concat([{ type: 'drop' }]);
}

const LINE = { bid: '%w bids %p.', jump: '%w jumps to %p!', drop: '%w drops out at %p.', wait: 'Someone is watching and says nothing.', sold: 'Sold to %w for %p.', nosale: 'No sale: nobody met the opening price.' };
export function act(state, action) {
  if (!state || !action || !legal(state).some((l) => l.type === action.type)) return { state, say: null, done: !!(state && state.done) };
  const s = JSON.parse(JSON.stringify(state)), rng = new RNG(s.rs), mark = s.events.length;
  if (action.type === 'bid') { s.price = nextBid(s); s.high = 'you'; s.quiet = 0; s.round++; ev(s, 'bid', 'you', s.price); }
  else { s.youIn = false; s.round++; ev(s, 'drop', 'you', s.price); }
  advance(s, rng);
  s.rs = rng.s;
  const lines = s.events.slice(mark + 1).filter((e) => e.kind !== 'wait').map((e) => LINE[e.kind].replace('%w', e.kind === 'sold' && e.who === 'You' ? 'you' : e.who).replace('%p', money(e.price ?? 0)));
  const say = lines.length ? lines.slice(-2).join(' ') : action.type === 'drop' ? 'You step back.' : 'The room is quiet.';
  return { state: s, say, done: s.done };
}

// ---- what the player may know -----------------------------------------------------------------------------------
function pubOf(s) {
  return { estimate: s.estimate, rivals: s.bots.length, active: s.bots.filter((b) => b.active).length, drops: s.bots.filter((b) => b.droppedAt != null).map((b) => b.droppedAt), price: s.price, next: nextBid(s), inc: s.inc, reserve: s.reserve, budget: s.budget, round: s.round };
}
/** The textbook ceiling: your estimate less a margin that grows with the number of rivals (the winner's curse). With one or two rivals there is almost nothing to shade. */
export function ceiling(pub) { return pub.estimate * (1 - clamp(0.05 * (pub.rivals - 2), 0, 0.3)); }

function advise(s) {
  const p = pubOf(s), c = ceiling(p), over = p.budget != null && p.next > p.budget + 1e-9, ok = p.next <= c + 1e-9 && !over, curse = `With ${p.rivals} rival${p.rivals === 1 ? '' : 's'}, the winner is usually whoever guessed highest, and that guess is usually too high (the winner's curse).`;
  const seen = p.drops.length ? ` ${p.drops.length} rival${p.drops.length === 1 ? '' : 's'} already dropped near ${money(Math.max(...p.drops))}; that is evidence.` : '';
  return { action: { type: ok ? 'bid' : 'drop' }, ceiling: sig(c), concept: 'winners-curse', text: `${curse} Do not bid above your own estimate (${money(p.estimate)}) less a margin: stop near ${money(c)}.${seen} ${ok ? `The next bid, ${money(p.next)}, is still inside that.` : over ? `The next bid, ${money(p.next)}, is past your budget (${money(p.budget)}): drop.` : `The next bid, ${money(p.next)}, is past it: drop and keep your cash.`}` };
}

export function view(s) { // never the rivals' limits, the true value or their styles, only moods and what they have done
  const v = {
    estimate: s.estimate, opening: s.reserve, price: s.high == null ? null : sig(s.price), nextBid: sig(nextBid(s)), increment: sig(s.inc), budget: s.budget,
    high: s.high == null ? null : who(s, s.high), youHigh: s.high === 'you', youIn: s.youIn, round: s.round, yourTurn: !s.done && s.youIn && s.high !== 'you',
    rivals: s.bots.map((b) => ({ id: b.id, name: b.name, mood: MOOD[b.style], active: b.active, droppedAt: b.droppedAt, high: s.high === b.id })),
    events: s.events.slice(-12), done: s.done, actions: legal(s),
  };
  if (s.assist && !s.done) v.advice = advise(s);
  return v;
}

export function result(s) {
  const base = { done: s.done, won: false, price: null, surplus: 0, score: 0, rounds: s.round };
  if (!s.done) return base;
  const V = s.trueValue, won = s.winner === 'you', price = won ? s.sold : null, surplus = won ? sig(V - price) : 0;
  const top = Math.max(0, ...s.bots.map((b) => b.limit * (b.style === 'bluffer' ? 0.9 : 1))), best = Math.max(0, V - Math.max(s.reserve, top + s.inc)); // the best a perfect hindsight could have done
  const score = won ? (surplus < 0 ? clamp(0.3 + surplus / (0.33 * V), 0, 0.3) : clamp(0.55 + (0.45 * surplus) / Math.max(best, surplus, 1e-9), 0.55, 1)) : best <= 0.01 * V ? 0.8 : clamp(0.45 - 2 * (best / V), 0.1, 0.45);
  const text = won && surplus < 0 ? `You won at ${money(price)}, but it was worth ${money(V)}. That is the winner's curse: the winning bid comes from the rosiest estimate, so it is usually too high.`
    : won ? `You won at ${money(price)} against a true value of ${money(V)}: a margin of ${money(surplus)}. Shading below your estimate paid.`
    : best <= 0.01 * V ? 'You dropped and kept your cash. Nobody could have won this one at a profit.' : `You dropped, but a win at a profit was possible. Your estimate (${money(s.estimate)}) was probably too cautious.`;
  return { ...base, won, price, surplus, score, soldFor: s.sold, winner: s.winner == null ? null : who(s, s.winner), reveal: { trueValue: V, rivals: s.bots.map((b) => ({ name: b.name, style: b.style, limit: b.limit, droppedAt: b.droppedAt })) }, lesson: { concept: 'winners-curse', text } };
}

export function autoplay(params, skill = 0.5) {
  let s = create(params);
  const k = clamp(num(skill) ? skill : 0.5, 0, 1), rng = new RNG(hash('autoplay' + s.seed));
  const mode = k >= 0.5 ? (rng.next() < (k - 0.5) * 2 ? 'expert' : 'quick') : rng.next() < (0.5 - k) * 2 ? 'careless' : 'quick';
  const log = [];
  for (let i = 0; i < 500 && !s.done; i++) {
    const p = pubOf(s), cap = mode === 'expert' ? ceiling(p) : mode === 'quick' ? p.estimate * 0.95 : p.estimate * 1.15;
    const a = { type: p.next <= cap + 1e-9 && legal(s).some((l) => l.type === 'bid') ? 'bid' : 'drop' }, r = act(s, a);
    log.push({ action: a, say: r.say }); s = r.state;
  }
  return { ...result(s), log };
}
