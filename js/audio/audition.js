// What the audition page (dev/sounds.html) tells its listener (docs/AUDIO.md Appendix F). A page built for listening must never leave a silent button to be taken for a broken one: every press
// either sounds or says, on the status line, which rule held it back. The engine counts its drops by reason (`audio.stats().dropped`) and the collector names the sounds it dropped
// (`lastBurst.dropped`); this file turns those into words and runs the bursts the page offers. No DOM here, and the engine is a parameter, so a Node test runs it on a fake clock.
import { whyDropped } from './settings.js';
import { RECIPES } from './recipes.js';
import { RULES, createResolverState } from './resolve.js';
import { SANDBOX_SILENT } from './engine.js';

const secs = (ms) => Math.max(1, Math.ceil(ms / 1000));

/** How long the big moment in progress has still to run, in ms: the longest of the moment voices alive (the engine plays big moments one at a time, 3.4.7). `voices` is `audio._voices`. */
export function momentLeft(voices, now) {
  let left = 0;
  for (const g of Array.isArray(voices) ? voices : []) if (g && g.moment && !g.stopped && g.endMs > now) left = Math.max(left, g.endMs - now);
  return left;
}

/**
 * Why a press was not heard, in one sentence: the engine's drop reason `reason` ('budget', 'collector', 'catchup', 'hold', 'unknown' and every reason `whyDropped` knows), from the settings that caused
 * it. info: { id, bus, rs (the resolver's state), now, speed, voices, sandbox }. `budget` is a reason the engine uses for four different rules, so the sentence looks at the state to name the one.
 */
export function explainDrop(reason, a, info = {}) {
  const A = a && typeof a === 'object' ? a : {};
  switch (reason) {
    case 'budget': {
      const id = info.id, now = Number.isFinite(info.now) ? info.now : 0, speed = info.speed ?? 1, rs = info.rs, e = id ? RECIPES[id] : null, reward = !!e && e.class === 'reward';
      if (id && info.sandbox && SANDBOX_SILENT.has(id)) return 'An Academy lesson rehearses its rewards silently.';
      if (reward && rs) {
        const win = speed >= 16 ? RULES.REWARD_WINDOW_FAST : RULES.REWARD_WINDOW, left = (rs.lastFull ?? -Infinity) + win - now;
        if (left > 0) return `Reward budget: the game rings one full reward every ${win / 1000} s, the last was ${secs(now - rs.lastFull)} s ago, so the next full one is ${secs(left)} s away. A reward that misses it is a small tick, at most one every ${RULES.TICK_GAP / 1000} s.`;
      }
      const m = momentLeft(info.voices, now);
      if (m > 0) return `A big moment is still playing (${secs(m)} s more): the game plays them one at a time, and a reward queued behind it falls to its tick.`;
      if (reward) return `Reward budget: it was left out as a small tick, because ticks come at most one every ${RULES.TICK_GAP / 1000} s (or it is one the speed silences).`;
      if (e && e.class === 'clock') return 'At 4x and faster the clock\'s sounds are thinned out (a day turn every third, a coin every few seconds), and a dialog or a paused clock holds them.';
      return 'A budget held it back (a reward every 10 s, a tick every 3 s, a state sound every 45 s, the clock\'s sounds thinned at speed).';
    }
    case 'collector': return 'The collector keeps two sentences of a burst, the cause and the one best reward; this was neither, so only its toast and ledger row would speak.';
    case 'catchup': return 'The game is catching up (a tab just back, or a rewind), so what the clock caused is not rung. A press lifts it for 1.5 s.';
    case 'hold': return 'A dialog is open or the clock is paused: sounds the clock causes wait.';
    case 'unknown': return 'No sound has that id.';
    default: return whyDropped(reason, A, info);
  }
}

/** Why the ambient bed buttons are silent, or '' when a press will start it. `state` is `audio.state`. */
export function ambientWhy(a, state) {
  const A = a && typeof a === 'object' ? a : {};
  if (state === 'unsupported') return 'This browser cannot play sound.';
  if (!A.ambient) return 'Ambient is off: tick Ambient in the bar.';
  if (A.quiet) return 'The Classroom rule turns the ambient bed off.';
  if (A.mute) return 'Mute is on.';
  if (!(A.master > 0)) return 'Volume is at 0.';
  if (!(A.ambientLevel > 0)) return 'Ambient level is at 0.';
  if (state !== 'running') return 'The audio engine is not running yet (press anywhere once), or the tab is hidden.';
  return '';
}
/** Why a one-shot of the bed (a gull, a chime, a ship horn) is silent: it plays whatever Ambient says (the page asks for it by name) but not through a mute, a zero volume or a zero ambient level. */
export function oneShotWhy(a, state) {
  const A = a && typeof a === 'object' ? a : {};
  if (state === 'unsupported') return 'This browser cannot play sound.';
  if (A.mute) return 'Mute is on.';
  if (!(A.master > 0)) return 'Volume is at 0.';
  if (!(A.ambientLevel > 0)) return 'Ambient level is at 0.';
  if (state !== 'running') return 'The audio engine is not running yet (press anywhere once), or the tab is hidden.';
  return '';
}
/** Why the repair dial tone buttons are silent, or ''. The tone is a game-bus voice, off in Classroom, and the engine starts one at a time. */
export function dialWhy(a, state) {
  const A = a && typeof a === 'object' ? a : {};
  if (state === 'unsupported') return 'This browser cannot play sound.';
  if (A.quiet) return 'The Classroom rule turns the dial tone off.';
  if (A.mute) return 'Mute is on.';
  if (!(A.master > 0)) return 'Volume is at 0.';
  if (A.game === false) return 'Game sounds are off: the dial tone is a game-bus voice.';
  if (state !== 'running') return 'The audio engine is not running yet (press anywhere once), or the tab is hidden.';
  return '';
}

/** Put the collector's reward budget back to a first visit's, in place (the engine keeps the one object). Returns it. */
export function resetBudget(audio) {
  if (audio && audio._resolver) Object.assign(audio._resolver, createResolverState());
  return audio && audio._resolver;
}

/** The words of a burst's outcome for the status line: '' when everything was heard. `heard`: the sound ids that played; `dropped`: [{ id, reason }] (the id may be unknown for a gate's drop). */
export function describeBurst(heard, dropped, a, info = {}) {
  const lines = [], seen = new Set();
  for (const d of dropped) {
    const why = explainDrop(d.reason, a, { ...info, id: d.id, bus: d.bus ?? info.bus });
    const key = (d.id || '') + '|' + why;
    if (seen.has(key)) continue; seen.add(key);
    lines.push(d.id ? `${d.id}: ${why}` : heard.length || dropped.some((x) => x.id) ? `another sound of the burst: ${why}` : why); // a drop the engine counted without naming the sound
  }
  if (!lines.length) return '';
  return heard.length ? `partly silent: heard ${heard.join(', ')}. Held back: ${lines.join(' ')}` : `silent: ${lines.join(' ')}`;
}

/** What a typical minute came to: how many sounds played, and for each rule that held something back, how many it held and in words why. The counts are the engine's, before and after the minute. */
export function describeMinute(playedBefore, droppedBefore, playedAfter, droppedAfter, a, info = {}) {
  const played = delta(playedBefore || {}, playedAfter || {}), held = delta(droppedBefore || {}, droppedAfter || {});
  const n = Object.values(played).reduce((x, y) => x + y, 0), parts = Object.entries(held).map(([r, c]) => `${c} by ${r}: ${explainDrop(r, a, info)}`);
  return `the minute played ${n} sound${n === 1 ? '' : 's'}.${parts.length ? ' Held back: ' + parts.join(' ') : ''}`;
}

const delta = (before, after) => { const out = {}; for (const [k, v] of Object.entries(after)) if (v > (before[k] || 0)) out[k] = v - (before[k] || 0); return out; };
/**
 * Press one burst through the collector, as the page's button does, and say what became of it. fn(req) sends the burst through `req`, which is `audio.request`; o: { fresh (reset the reward budget, wait out the last big moment and skip the per-sound cooldown), speed, a (the settings),
 * now(), sleep(ms), settle (ms to let the collector and a burst's delayed part finish), say(text) (progress, e.g. while waiting) }. Returns { heard, dropped, text, waited }.
 * The collector flushes one macrotask after the requests, and a burst may send a part later (a margin call 200 ms into a fanfare), so the outcome is read after `settle`, from the counts and
 * from every collector result seen meanwhile.
 */
export async function pressBurst(audio, fn, o = {}) {
  const now = o.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now())), sleep = o.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const settle = o.settle ?? 450, speed = o.speed ?? 1;
  let waited = 0;
  if (o.fresh) {
    resetBudget(audio);
    const m = momentLeft(audio._voices, now());
    if (m > 0) { waited = m; o.say?.(`waiting ${secs(m)} s for the last big moment to end (the game plays them one at a time)`); await sleep(m + 40); }
  }
  audio.setEnv({ speed, paused: false, lastPress: now() });
  const s0 = audio.stats(), before = { played: { ...s0.played }, dropped: { ...s0.dropped } }, bursts = new Set();
  // A fresh press is a clean slate: the budget is back and the last big moment has ended, and the sounds ask to skip the per-sound cooldown (a level-up rung 1 s ago by the last burst would otherwise be
  // dropped by its own 2 s cooldown) and to draw from the player's bucket, as a press does. Without the box the requests go to the collector exactly as the game sends them.
  const req = (id, opts = {}) => audio.request(id, o.fresh ? { noCooldown: true, player: true, ...opts } : opts);
  const w0 = o.fresh ? '' : explainDrop('budget', o.a || {}, { id: 'level.up', now: now(), speed, rs: audio._resolver, voices: [] }), closed = /^Reward budget: the game rings/.test(w0); // read before the burst spends it
  fn(req);
  for (let t = 0; t < settle; t += 50) { await sleep(Math.min(50, settle - t)); const b = audio.stats().lastBurst; if (b) bursts.add(b); }
  const s1 = audio.stats(), playedNow = delta(before.played, s1.played), droppedNow = delta(before.dropped, s1.dropped);
  const heard = Object.keys(playedNow);
  const named = []; // the sounds the collector named as dropped, with their reasons (a burst that was seen before this press is not this press's)
  for (const b of bursts) if (b && b !== s0.lastBurst) for (const d of b.dropped || []) named.push({ id: d.id, reason: d.reason });
  const counted = { ...droppedNow }; // reasons the engine counted without a name (a gate: mute, a bus, Classroom, locked)
  for (const d of named) if (counted[d.reason] > 0) counted[d.reason]--;
  const dropped = [...named];
  for (const [reason, n] of Object.entries(counted)) for (let i = 0; i < n; i++) dropped.push({ reason });
  let text = describeBurst(heard, dropped, o.a || {}, { now: now(), speed, rs: audio._resolver, voices: audio._voices });
  const ticked = [...bursts].some((b) => b && (b.plays || []).some((p) => p.role === 'also'));
  if (closed && ticked) text = `${text ? text + ' ' : ''}(Rewards past the budget played as a small tick: ${w0})`; // everything the burst asked for was "heard", but a fanfare became a tick
  return { heard, dropped, text, waited, ticked };
}

// ---- the listening checklist's tools (docs/AUDIO.md 10.5, fourth round): a blind round for gain against loss (item 2). The mono fold (item 5) and the laptop speaker (the premise of the loudness models)
// are routed in the page (dev/sounds.js: they need the context); what is pure is here, so a Node test holds it.
/** The four kinds a listener names in the blind round, and where each draws its sounds from. Every entry is `id#variant`. */
export const BLIND_KINDS = ['gain', 'loss', 'warning', 'neutral'];
export const BLIND_POOLS = {
  gain: ['cash.in#m', 'cash.in#l', 'sale.win#w', 'pitch.fit#up', 'audit.result#pass', 'bid.hammer#won', 'repair.done#great', 'bank.repay#full', 'deal.result#good', 'haggle.close#accept', 'sale.pioneer#p', 'deal.verify#ok'],
  loss: ['cash.out#m', 'cash.out#l', 'sale.herd#h', 'sale.scam#s', 'sale.reject#nofit', 'pitch.fit#down', 'audit.result#fail', 'bid.hammer#lost', 'repair.done#rough', 'deal.result#bad', 'bank.draw#b', 'sale.reject#fake'],
  warning: ['alert.advance#l1', 'alert.advance#l2', 'alert.advance#l3', 'ui.nudge#n', 'ui.ask#danger', 'audit.notice#a', 'read.suspect#s', 'alert.shock#fed', 'deal.verify#bad'],
  neutral: ['ui.tick#light', 'ui.tick#full', 'ui.select#i0', 'ui.drawer-open#stock', 'ui.dialog-open#d', 'ui.crate#pick1', 'cam#in', 'ui.slider#mid', 'day.turn#d', 'buyer.arrive#b', 'mentor.tip#t', 'ui.toggle#on'],
};
/** The deck of 10.5 item 2: 20 unlabelled sounds, five of each kind, in a shuffled order. `random` is any () => [0, 1) (a test gives a seeded one). Returns [{ key, kind }]. */
export function blindDeck(random = Math.random, per = 5) {
  const pick = (list) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, per); };
  const deck = BLIND_KINDS.flatMap((kind) => pick(BLIND_POOLS[kind]).map((key) => ({ key, kind })));
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}
/**
 * The score of a round: `answers[i]` is the kind the listener named for `deck[i]` (or nothing). The target of 10.5 is on gain against loss: of the sounds that were gains or losses, how many were named
 * the right one of the two (a gain called a warning is not a gain called a loss, and is counted wrong). Returns { gainLoss: { right, of, share }, all: { right, of }, rows: [{ key, kind, said, right }] }.
 */
export function blindScore(deck, answers) {
  const rows = deck.map((d, i) => ({ key: d.key, kind: d.kind, said: answers[i] || null, right: answers[i] === d.kind }));
  const gl = rows.filter((r) => r.kind === 'gain' || r.kind === 'loss'), right = gl.filter((r) => r.right).length;
  return { gainLoss: { right, of: gl.length, share: gl.length ? right / gl.length : 0 }, all: { right: rows.filter((r) => r.right).length, of: rows.length }, rows };
}
