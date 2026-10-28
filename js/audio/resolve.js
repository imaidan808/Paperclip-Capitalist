// The collector and the resolver (docs/AUDIO.md 3.4): the engine delivers a burst of events in the order it computed them, which is consequence before cause (a sale's XP levels you up
// before the sale is announced), so sound is not made in arrival order. It is made from what the burst contains: at most two audible sentences, the cause first and then the single best
// reward. Pure functions over a small state object, so a fake clock tests them without a context. The constants are the first estimates of 11.3 item 8; tune them after a ten-minute listen.
import { RECIPES, RANKED, variantRank, sentenceRank, BUDGET_EXEMPT, CLOCK_IDS, tierOf } from './recipes.js';
import { moneySize } from './palette.js';

export const RULES = {
  REWARD_WINDOW: 10000, REWARD_WINDOW_FAST: 20000, // one full reward sentence per window of real time (20 s at 16x and above)
  TICK_GAP: 3000, DAILY_GAP: 60000, LEVEL_FULL_GAP: 90000, STATE_GAP: 45000,
  SECOND_MIN: 350, SECOND_MAX: 500, SECOND_GAIN_DB: -4, TICK_GAIN_DB: -6,
  CATCHUP_MS: 600, PRESS_MS: 1500, MERGE_CYCLE: 400, BUYER_GAP: 30000, BUYER_GAP_4X: 45000, URGENT_GAP: 20000, CYCLE_GAP_4X: 3000, FAST_COIN_GAP: 8000, FAST_COIN_JITTER: 2000,
};

export function createResolverState() {
  return { lastFull: -Infinity, lastTick: -Infinity, lastDaily: -Infinity, lastFullLevel: -Infinity, lastBuyer: -Infinity, lastUrgent: -Infinity, lastCycle: -Infinity, buyers: 0, days: 0,
    holdNet: 0, holdAny: false, fastNet: 0, nextFast: 0, states: {}, sentences: 0, bursts: 0, maxSentences: 0 };
}

/** The player flag's window: a press or a world activation in the last 1500 ms. */
export const recentPress = (env, now) => now - (env.lastPress ?? -Infinity) < RULES.PRESS_MS;
/** Catch-up is lateness in real time, not virtual hours (3.4.5): more than 600 ms of game still to replay, a tab just back from hidden, or a rewind. A press in the last 1500 ms lifts it. */
export function catchingUp(env, now) {
  if (recentPress(env, now)) return false;
  return (env.lagMs ?? 0) > RULES.CATCHUP_MS || !!env.justVisible || !!env.rewound;
}

const no = (reason) => ({ ok: false, reason });
const YES = { ok: true };
/**
 * The clock gates (3.4.5) for a clock-class request: the speed table, the hold while a dialog is open, the standing-coin rule at 16x and above. `r` = { id, opts, meta }.
 * Returns { ok } or { ok: false, reason }; may leave a sum behind (`holdNet`, `fastNet`) that comes out as one coin later. env: { speed, paused, busy, hold, classroom }.
 */
export function gateClock(st, r, env, now) {
  const id = r.id, speed = env.speed ?? 1, net = Number(r.meta?.net ?? r.meta?.amount ?? 0) || 0;
  if (env.paused) return no('hold');
  if (env.hold) { // a dialog, the Deal Room or a lesson is open: nothing the clock causes plays; the cycle nets are summed and come out as one coin when the sheet closes
    if (id === 'manager.cycle' || (id === 'cash.in' && r.opts?.clock)) { st.holdNet += net; st.holdAny = true; }
    return no('hold');
  }
  if (id === 'manager.cycle' || (id === 'cash.in' && r.opts?.clock)) {
    if (speed >= 16) { // no standing coin: one cash.in sized from the sum since the last, at most every 8 s
      st.fastNet += net;
      if (now < st.nextFast) return no('budget');
      st.nextFast = now + RULES.FAST_COIN_GAP + (Math.random() * 2 - 1) * RULES.FAST_COIN_JITTER;
      r.sum = st.fastNet; st.fastNet = 0;
      return YES;
    }
    if (speed >= 4) { if (now - st.lastCycle < RULES.CYCLE_GAP_4X) return no('budget'); }
    st.lastCycle = now;
    return YES;
  }
  if (id === 'day.turn') {
    if (speed >= 16) return no('budget');
    if (speed >= 4 && (st.days++ % 3) !== 0) return no('budget');
    return YES;
  }
  if (id === 'buyer.arrive' || id === 'buyer.urgent') {
    if (speed >= 16 || env.busy || env.classroom) return no('budget');
    if (id === 'buyer.urgent') { if (now - st.lastUrgent < RULES.URGENT_GAP) return no('budget'); st.lastUrgent = now; return YES; }
    const gap = speed >= 4 ? RULES.BUYER_GAP_4X : RULES.BUYER_GAP;
    if (st.buyers >= 3 && now - st.lastBuyer < gap) return no('budget'); // the first three of a run always play
    st.buyers++; st.lastBuyer = now;
    return YES;
  }
  return YES;
}
/** When the sheet closes: the net of the held cycles as one coin (a negative sum is cash.out). Returns null when nothing was held. */
export function holdRelease(st, netWorth) {
  if (!st.holdAny) return null;
  const net = st.holdNet; st.holdNet = 0; st.holdAny = false;
  if (!net) return null;
  const size = moneySize(net, netWorth);
  return net > 0 ? ['cash.in', { size, clock: true }] : ['cash.out', { size: size === 'xl' ? 'l' : size }];
}
/** A state sound (an SLA breach, an overdraft, burnout, market fatigue) re-announces every virtual day while it lasts: it plays on entering the state, then at most once per 45 s. */
export function stateGate(st, key, amount, now) {
  const s = st.states[key] ||= { last: -Infinity, sum: 0 };
  s.sum += Math.abs(Number(amount) || 0);
  if (now - s.last < RULES.STATE_GAP) return { play: false, amount: 0 };
  const sum = s.sum; s.sum = 0; s.last = now;
  return { play: true, amount: sum };
}
export const stateExit = (st, key) => { if (st.states[key]) st.states[key].last = -Infinity; };

// ---- the burst
const classOf = (id) => RECIPES[id]?.class;
const isReward = (r) => classOf(r.id) === 'reward';
const variantOf = (r) => r.opts?.variant ?? r.variant;
function rankOf(r) { return sentenceRank(r.id, variantOf(r)); }

/** Requests of one id collapse: the highest level, the highest district tier, the rarest achievement, one Codex page, one manager coin (3.4.2 step 2). */
export function merge(reqs, st, now) {
  const out = [], seen = new Map();
  for (const r of reqs) {
    const id = r.id;
    if (id === 'level.up') {
      const lv = Number(r.meta?.level) || 0, prev = seen.get(id);
      if (prev) { if (lv > (Number(prev.meta?.level) || 0)) { prev.meta = r.meta; } continue; }
      const c = { ...r, meta: { ...r.meta } }; seen.set(id, c); out.push(c); continue;
    }
    if (id === 'zone.open' || id === 'achievement') {
      const prev = seen.get(id), v = variantOf(r);
      if (prev) { if (variantRank(id, v) > variantRank(id, variantOf(prev))) { prev.opts = { ...prev.opts, ...r.opts, variant: v }; prev.meta = r.meta; } continue; }
      const c = { ...r, opts: { ...r.opts } }; seen.set(id, c); out.push(c); continue;
    }
    if (id === 'codex.unlock' || id === 'manager.cycle' || id === 'daily.done') {
      const prev = seen.get(id);
      if (prev) { if (id === 'manager.cycle') prev.meta = { ...prev.meta, net: (Number(prev.meta?.net) || 0) + (Number(r.meta?.net) || 0) }; continue; }
      const c = { ...r, meta: { ...r.meta } }; seen.set(id, c); out.push(c); continue;
    }
    out.push(r);
  }
  for (const r of out) { // a level has three voices: big on every fifth, the full fanfare when 90 s have passed since the last, else the everyday run
    if (r.id === 'level.up' && !r.opts?.variant) {
      const lv = Number(r.meta?.level) || 0;
      r.opts = { ...r.opts, variant: lv > 0 && lv % 5 === 0 ? 'big' : now - st.lastFullLevel >= RULES.LEVEL_FULL_GAP ? 'l' : 's' };
    }
    if (r.id === 'manager.cycle' && !r.opts?.variant) r.opts = { ...r.opts, variant: (Number(r.meta?.net) || 0) < 0 ? 'loss' : 'gain' };
  }
  return out;
}

/**
 * Turns one collected burst into what plays. reqs: [{ id, opts, meta }] (an `opts.with` list rides with the cause as one playMix). env: { speed, sandbox, durOf(id, variant) -> ms }.
 * Returns { plays: [{ delay (ms), role: 's1' | 's2' | 'also', mix: [[id, opts], ...] }], sentences, dropped: [{ id, reason }] }.
 */
export function resolveBurst(st, reqs, env, now) {
  const dropped = [], list = merge(reqs, st, now);
  const causes = [], rewards = [];
  for (const r of list) (isReward(r) ? rewards : causes).push(r);
  const byRank = (a, b) => rankOf(b) - rankOf(a);
  causes.sort(byRank); rewards.sort(byRank);
  const fast = (env.speed ?? 1) >= 16, plays = [];
  let s1 = causes[0] || null;
  const budgetOpen = () => now - st.lastFull >= (fast ? RULES.REWARD_WINDOW_FAST : RULES.REWARD_WINDOW);
  const silentReward = (r) => { // daily bounties are silent from 4x, common achievements, Codex pages and daily bounties at 16x
    if (r.id === 'daily.done') return (env.speed ?? 1) >= 4;
    if (fast && (r.id === 'codex.unlock' || (r.id === 'achievement' && variantOf(r) === 'common'))) return true;
    return false;
  };
  const fullAllowed = (r) => BUDGET_EXEMPT(r.id) || (budgetOpen() && !(r.id === 'daily.done' && now - st.lastDaily < RULES.DAILY_GAP));
  let s2 = null;
  const ticks = [];
  const live = [];
  for (const r of rewards) { if (silentReward(r)) { dropped.push({ id: r.id, reason: 'budget' }); continue; } live.push(r); }
  if (!s1 && live.length) { // with no cause in the burst, the best reward is sentence 1
    const top = live.shift();
    if (fullAllowed(top)) s1 = top; else ticks.push(top);
  }
  for (const r of live) { if (s1 && !s2 && fullAllowed(r)) s2 = r; else ticks.push(r); }
  const claim = (r) => { // a full reward sentence spends the budget
    if (!isReward(r)) return;
    if (!BUDGET_EXEMPT(r.id)) st.lastFull = now;
    if (r.id === 'daily.done') st.lastDaily = now;
    if (r.id === 'level.up' && variantOf(r) !== 's') st.lastFullLevel = now;
  };
  let t1 = 0;
  if (s1) {
    const mix = [[s1.id, s1.opts || {}], ...(s1.opts?.with || [])];
    plays.push({ delay: 0, role: 's1', mix, req: s1 });
    claim(s1);
    t1 = Math.min(RULES.SECOND_MAX, Math.max(RULES.SECOND_MIN, env.durOf?.(s1.id, variantOf(s1)) ?? 0));
  }
  if (s2) {
    plays.push({ delay: s1 ? t1 : 0, role: 's2', mix: [[s2.id, { ...s2.opts, secondary: true, gainDb: (s2.opts?.gainDb || 0) + RULES.SECOND_GAIN_DB, noDuck: true }]], req: s2 });
    claim(s2);
  }
  // every other reward collapses into an "also" tick: a glass note each, rising, at most two, and at most one tick per 3 s over the whole run
  if (ticks.length && now - st.lastTick >= RULES.TICK_GAP) {
    st.lastTick = now;
    plays.push({ delay: (s2 ? t1 : 0) + (s1 || s2 ? 140 : 0), role: 'also', mix: [['reward.also', { params: { n: Math.min(2, ticks.length) }, gainDb: RULES.TICK_GAIN_DB, noDuck: true }]], req: ticks[0] });
  } else for (const r of ticks) dropped.push({ id: r.id, reason: 'budget' });
  for (const r of causes.slice(1)) dropped.push({ id: r.id, reason: 'collector' }); // anything else in the burst is silent: its toast and ledger row stay
  const sentences = plays.filter((p) => p.role !== 'also').length; // the cause and the best reward; the tick is an "and", not a sentence
  st.bursts++; st.sentences += sentences; st.maxSentences = Math.max(st.maxSentences, sentences);
  return { plays, sentences, dropped };
}
export { RANKED, CLOCK_IDS, tierOf };
