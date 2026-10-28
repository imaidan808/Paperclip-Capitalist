// REPAIR (the Fix stage). Teaches quality control and the ROI of repair: three steps, each a precision dial. Stop the marker in the
// green sweet zone and the part seats properly; miss and you pay for rework. Better work costs less AND returns more quality, so
// precision is money. The zone is as wide as your Ops allow, `assist` widens it, `difficulty` narrows it, and nothing is timing-only:
// `careful` pays a premium for a guaranteed middling result without touching the dial.
// Pure and deterministic: the marker is a function of (t, step, seed), state is plain JSON, no clocks or DOM here.
import { hash, step } from '../rng.js';

export const STEPS = 3;
/** The most a stop made with the reduced-motion slider can score. The slider is the accessible way to play the dial (nothing is timing-only), and a marker you can set to the middle of a zone you can see would
 *  score a flawless 0.98 on every step, better than the best timed play (an Expert at Ops 1 averages 0.86 to 0.92): so it is a par option, at the level of a good but not a perfect hand. */
export const SLIDER_CAP = 0.85;
export const STEP_NAMES = ['Strip and clean', 'Fit and tighten', 'Final tune'];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const num = (x, d) => (Number.isFinite(x) ? x : d);
const u = (seed, tag) => step(hash(seed + '|' + tag))[1];
const TAU = Math.PI * 2;

/** Marker position on the 0..1 dial `t` ms into step `n`: two sines, a slow wide one and a quick small one, each step faster than the last,
 *  with its own phase per seed. Smooth (no jumps), always inside 0..1, and at most about 0.0014 of the dial per ms. */
export function pos(t, n = 0, seed = 0) {
  const x = num(t, 0), p1 = (4200 - 600 * clamp(n, 0, 2)) * (0.9 + 0.2 * u(seed, 'p' + n)), p2 = p1 * (0.5 + 0.12 * u(seed, 'r' + n));
  return clamp(0.5 + 0.42 * Math.sin(TAU * x / p1 + TAU * u(seed, 'f' + n)) + 0.08 * Math.sin(TAU * x / p2 + TAU * u(seed, 'g' + n)), 0, 1);
}
/** Half-width of the sweet zone around 0.5: wider with Ops and assist, narrower with difficulty. */
export const zoneHalf = (ops, difficulty = 1, assist = false) => clamp((0.045 + 0.011 * clamp(num(ops, 1), 1, 10)) * (assist ? 1.6 : 1) / Math.max(0.25, num(difficulty, 1)), 0.03, 0.45);
const accuracy = (x, half) => clamp(1 - Math.abs(x - 0.5) / half, 0, 1);

const LINES = [[0.9, 'Dead centre. That part seats like it came from the factory.'], [0.65, 'Good. A hair off, but it will hold.'], [0.35, 'Acceptable. It works, but you can feel the slack.'],
  [0.001, 'Barely in the zone. That is going to rattle.'], [0, 'Missed the zone completely. That step is rework.']];

export function create(p = {}) {
  const half = zoneHalf(p.ops, p.difficulty, !!p.assist), careful = !!p.careful;
  const s = { kind: 'repair', seed: num(p.seed, 1) >>> 0, ops: clamp(Math.round(num(p.ops, 1)), 1, 10), difficulty: Math.max(0.25, num(p.difficulty, 1)), assist: !!p.assist, careful, half,
    step: careful ? STEPS : 0, steps: careful ? Array.from({ length: STEPS }, () => ({ acc: 0.5, careful: true })) : [], done: careful };
  return s;
}

/** Marker position for a state at `t` ms into its current step (what the UI draws every frame). */
export const markerAt = (s, t) => pos(t, s.step, s.seed);

const summary = (s) => {
  const r = result(s);
  return `Repair done at ${Math.round(r.precision * 100)}% precision: parts and labour ran x${r.costMult.toFixed(2)} of the quote `
    + `and the item came back at x${r.qualityMult.toFixed(2)} quality. Repair pays when the value it adds beats the bill.`;
};

export function act(s, a) {
  const bad = { state: s, say: null, done: !!(s && s.done) };
  if (!s || !a || s.done) return bad;
  let steps, say;
  if (a.type === 'stop') {
    if (!Number.isFinite(a.t) || a.t < 0) return bad;
    const x = pos(a.t, s.step, s.seed), acc = Math.min(accuracy(x, s.half), a.slider === true ? SLIDER_CAP : 1);
    steps = [...s.steps, { acc, careful: false }];
    const line = LINES.find(([lo]) => acc >= lo)[1], side = acc >= 0.9 ? '' : x < 0.5 ? ' You stopped it on the low side.' : ' You stopped it on the high side.';
    say = `${STEP_NAMES[s.step]}: ${line}${side}`;
  } else if (a.type === 'careful') { // finish the remaining steps by the book: 50% precision each, at the careful price
    steps = [...s.steps, ...Array.from({ length: STEPS - s.step }, () => ({ acc: 0.5, careful: true }))];
    say = 'You slow down and do the rest by the book: a steady result, for a higher bill.';
  } else return bad;
  const n = { ...s, steps, step: steps.length, done: steps.length >= STEPS };
  if (n.done) say += ' ' + summary(n);
  return { state: n, say, done: n.done };
}

export function legal(s) { return !s || s.done ? [] : [{ type: 'stop', t: 0 }, { type: 'careful' }]; } // a stop may carry any finite t >= 0

/** Missing steps count as careful, so a half-finished game shows the floor you are already guaranteed. */
export function result(s) {
  const all = [...s.steps, ...Array.from({ length: Math.max(0, STEPS - s.steps.length) }, () => ({ acc: 0.5, careful: true }))].slice(0, STEPS);
  const precision = all.reduce((t, x) => t + x.acc, 0) / STEPS, costMult = all.reduce((t, x) => t + (x.careful ? 1.3 : 1.3 - 0.4 * x.acc), 0) / STEPS;
  return { done: s.done, score: precision, precision, qualityMult: 0.85 + 0.3 * precision, costMult, steps: s.steps.map((x) => x.acc), careful: s.steps.some((x) => x.careful) };
}

/** Everything is visible in this game (the dial is the game), so the view is the zone, the steps so far and what the UI needs to draw the marker. */
export function view(s) {
  return { kind: 'repair', done: s.done, step: s.step, steps: STEPS, name: s.done ? null : STEP_NAMES[s.step], seed: s.seed, assist: s.assist, careful: s.careful, ops: s.ops,
    zone: { lo: 0.5 - s.half, hi: 0.5 + s.half, half: s.half }, results: s.steps.map((x) => ({ ...x })) };
}

// The heuristic player: wait a moment, then stop when the marker crosses where it thinks the centre is. Its aim error (in dial units)
// is what skill changes, so the same player does better with a wider zone (more Ops, assist) and worse with a narrower one.
const aimSd = (k) => 0.008 + 0.292 * (1 - k) ** 2.5;
function stopTime(n, seed, target, from) {
  const side = (t) => pos(t, n, seed) - target;
  for (let t = from; t < from + 16000; t += 4) {
    const a = side(t), b = side(t + 4);
    if (a * b <= 0) return Math.round(t + (4 * Math.abs(a)) / (Math.abs(a) + Math.abs(b) || 1)); // interpolate inside the 4 ms bracket
  }
  return from;
}
export function autoplay(params, skill = 0.5) {
  const k = clamp(num(skill, 0.5), 0, 1);
  let s = create(params);
  const log = [];
  const go = (action) => { const r = act(s, action); if (r.say !== null) { s = r.state; log.push({ action, say: r.say }); } };
  if (s.done) log.push({ action: { type: 'careful' }, say: 'You do it by the book. ' + summary(s) });
  while (!s.done) {
    const z = Math.sqrt(-2 * Math.log(Math.max(u(s.seed, 'ez' + s.step), 1e-9))) * Math.cos(TAU * u(s.seed, 'ew' + s.step));
    go({ type: 'stop', t: stopTime(s.step, s.seed, clamp(0.5 + aimSd(k) * z, 0.02, 0.98), 300 + 900 * u(s.seed, 'wait' + s.step)) });
  }
  return { ...result(s), log };
}
