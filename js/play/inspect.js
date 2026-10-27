// INSPECT (the Read stage when buying). Teaches the value of information and due diligence: every probe buys a noisy look
// at a lot's hidden condition and authenticity, points are scarce, and the real question is which probe is worth its price.
// Beliefs move like a Bayesian's: Gaussian precision-weighting for condition, log-odds for "is it counterfeit".
// Pure and deterministic: no DOM, no clocks; every draw is a hash of the seed through js/rng.js, so state is plain JSON.
import { hash, step } from '../rng.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const num = (x, d) => (Number.isFinite(x) ? x : d);
const round = (x, k = 100) => Math.round(x * k) / k;
const u = (seed, tag) => step(hash(seed + '|' + tag))[1];
const gauss = (seed, tag) => Math.sqrt(-2 * Math.log(Math.max(u(seed, tag + 'a'), 1e-9))) * Math.cos(2 * Math.PI * u(seed, tag + 'b'));

/** cost in points; q = sd of the condition reading; d = separation of the counterfeit signal (higher = surer); def = chance to spot a defect.
 *  The expert is the only probe that ignores your own accuracy: dear, but the answer when your Ops are low. */
export const PROBES = {
  look:   { cost: 1, q: 0.20, d: 0.9, def: 0.30 },
  serial: { cost: 1, q: 0.32, d: 2.6, def: 0.05 },
  power:  { cost: 2, q: 0.075, d: 1.0, def: 0.45 },
  papers: { cost: 1, q: 0.22, d: 1.6, def: 0.20 },
  expert: { cost: 3, q: 0.09, d: 2.4, def: 0.85, fixed: true },
};
const IDS = Object.keys(PROBES);
const skillOf = (s, id) => (PROBES[id].fixed ? 1 : 0.55 + 0.9 * s.accuracy);
const qSd = (s, id) => PROBES[id].q / skillOf(s, id);
const dOf = (s, id) => PROBES[id].d * (PROBES[id].fixed ? (s.fakeDetect ? 1.2 : 1) : skillOf(s, id) * (s.fakeDetect ? 1.5 : 1));
const probFrom = (odds) => clamp(1 / (1 + Math.exp(-odds)), 0.01, 0.99);

// What each probe says: how you do it, five readings of condition (worst to best), three readings on authenticity (clean, unsure, suspect).
const SAY = {
  look: { a: 'You turn it over under the lamp:', b: ['it is badly beaten up', 'it shows plenty of wear', 'it has ordinary wear, nothing alarming', 'it looks well kept', 'it looks almost unused'],
    f: ['The finish looks honest.', 'Nothing odd on the surface.', 'The finish is oddly even and the print a shade soft.'] },
  serial: { a: 'You check the serial against the maker\'s format:', b: ['it comes from the roughest batch', 'it is an old unit', 'it is a middle-of-the-run unit', 'it is a recent unit', 'it is a very recent unit'],
    f: ['The stamp and prefix are right.', 'The stamp is half worn off; wear, or a re-stamp.', 'The font is wrong and that prefix was never made.'] },
  power: { a: 'You power it up and run it through its paces:', b: ['it barely works, faults at every turn', 'it works but struggles', 'it runs fine', 'it runs smoothly', 'it runs like new'],
    f: ['It behaves like the real thing.', 'Hard to say from how it runs.', 'It runs, but not the way a genuine one does.'] },
  papers: { a: 'You go through the paperwork:', b: ['the service history is grim', 'the history shows rough use', 'it is a plain, ordinary history', 'it is a tidy service history', 'it is a spotless history'],
    f: ['The receipts and provenance hold together.', 'There is a gap or two in the trail.', 'The dates do not add up and one stamp looks copied.'] },
  expert: { a: 'The expert takes it to the bench:', b: ['"a wreck, honestly"', '"tired, but serviceable"', '"fair condition for its age"', '"in good shape"', '"excellent, barely touched"'],
    f: ['"It is genuine."', '"I cannot say for certain."', '"It is a fake. Look at these tool marks."'] },
};
const OPEN = ['The seller shrugs: "Look all you like, I have nothing to hide."', '"Take your time," says the seller, a little too quickly.', 'The seller leans on the counter: "It is what it is."'];

function fresh(s) { // recompute the derived fields after any change
  const t = { ...s, belief: { quality: s.belief.quality, fakeProb: probFrom(s.odds) } };
  t.done = s.done || !IDS.some((id) => !s.used.includes(id) && s.spent + PROBES[id].cost <= s.budget);
  return t;
}

/** @param {{truth:{quality:number,fake:boolean,defects:{id:string,label:string}[]},budget:number,accuracy:number,fakeDetect?:boolean,seed:number,prior?:{quality?:number,sd?:number,fake?:number}}} p */
export function create(p = {}) {
  const t = p.truth || {};
  const truth = { quality: clamp(num(t.quality, 1), 0.6, 1.2), fake: !!t.fake,
    defects: (Array.isArray(t.defects) ? t.defects : []).filter((d) => d && d.id != null).map((d) => ({ id: String(d.id), label: String(d.label ?? d.id) })) };
  const pr = { quality: 0.9, sd: 0.17, fake: 0.2, ...(p.prior || {}) }; // a lot drawn evenly over 0.6..1.2, one in five counterfeit
  const seed = num(p.seed, 1) >>> 0, fake0 = clamp(num(pr.fake, 0.2), 0.001, 0.999);
  const s = { kind: 'inspect', seed, truth, budget: clamp(Math.floor(num(p.budget, 0)), 0, 30), spent: 0, accuracy: clamp(num(p.accuracy, 0.5), 0, 1), fakeDetect: !!p.fakeDetect,
    used: [], evidence: [], found: [], warning: null, done: false, sd: clamp(num(pr.sd, 0.17), 0.02, 1), sd0: clamp(num(pr.sd, 0.17), 0.02, 1), d2: 0, odds: Math.log(fake0 / (1 - fake0)),
    belief: { quality: num(pr.quality, 0.9), fakeProb: fake0 }, opening: OPEN[seed % OPEN.length] };
  if (s.fakeDetect) { // the Second-Chance gut feeling: a free, noisy counterfeit signal before any probe
    const d = 1.5, llr = d * ((truth.fake ? d / 2 : -d / 2) + gauss(seed, 'warn'));
    s.odds += llr; s.d2 = d * d;
    s.warning = llr > 1 ? 'Your street sense snags on this one: something about it feels counterfeit.'
      : llr < -1 ? 'Your street sense stays quiet. It feels like the real thing.' : 'Your street sense pings faintly, nothing you can name.';
  }
  return fresh(s);
}

function observe(s, id) {
  const P = PROBES[id], g = skillOf(s, id), sd = qSd(s, id), d = dOf(s, id), seed = s.seed;
  const y = s.truth.quality + sd * gauss(seed, id + 'q'); // the noisy reading of condition
  const p0 = 1 / (s.sd * s.sd), p1 = 1 / (sd * sd);        // Gaussian prior x Gaussian reading = precision-weighted average
  const llr = d * ((s.truth.fake ? d / 2 : -d / 2) + gauss(seed, id + 'f')); // counterfeit evidence as a log likelihood ratio
  const labels = [], found = [...s.found];
  for (const x of s.truth.defects) if (!found.includes(x.id) && u(seed, id + '|def|' + x.id) < clamp(P.def * g, 0.02, 0.95)) { found.push(x.id); labels.push(x.label); }
  const band = y < 0.72 ? 0 : y < 0.86 ? 1 : y < 0.98 ? 2 : y < 1.08 ? 3 : 4, lvl = llr > 1 ? 2 : llr < -1 ? 0 : 1;
  const text = `${SAY[id].a} ${SAY[id].b[band]}. ${SAY[id].f[lvl]}` + (labels.length ? ` You spot ${labels.length > 1 ? 'problems' : 'a problem'}: ${labels.join('; ')}.` : '');
  const ev = { id, cost: P.cost, reading: round(y), pm: round(sd), flag: ['clean', 'unsure', 'suspect'][lvl], found: labels, text };
  const n = { ...s, spent: s.spent + P.cost, used: [...s.used, id], evidence: [...s.evidence, ev], found, odds: s.odds + llr, d2: s.d2 + d * d, sd: 1 / Math.sqrt(p0 + p1),
    belief: { quality: (s.belief.quality * p0 + y * p1) / (p0 + p1), fakeProb: s.belief.fakeProb } };
  return { state: fresh(n), say: text };
}

function verdict(s) {
  const q = Math.round(clamp(s.belief.quality, 0.6, 1.2) * 100), f = Math.round(s.belief.fakeProb * 100);
  return `You settle on about ${q}% of the described value and a ${f}% chance it is counterfeit` + (s.found.length ? `, with ${s.found.length} known flaw${s.found.length > 1 ? 's' : ''}.` : '.');
}

export function act(s, a) {
  const bad = { state: s, say: null, done: !!(s && s.done) };
  if (!s || !a || s.done) return bad;
  if (a.type === 'conclude') { const n = { ...s, done: true }; return { state: n, say: verdict(n), done: true }; }
  if (a.type !== 'probe' || !IDS.includes(a.id) || s.used.includes(a.id) || s.spent + PROBES[a.id].cost > s.budget) return bad;
  const r = observe(s, a.id);
  return { state: r.state, say: r.say, done: r.state.done };
}

export function legal(s) {
  if (!s || s.done) return [];
  return [...IDS.filter((id) => !s.used.includes(id) && s.spent + PROBES[id].cost <= s.budget).map((id) => ({ type: 'probe', id })), { type: 'conclude' }];
}

/** The estimate, how reliable it is (0..1: condition doubt shrunk and counterfeit signal gathered, whatever the evidence said) and, once done, how close it was to the truth. */
export function result(s) {
  const est = { quality: clamp(s.belief.quality, 0.6, 1.2), fakeProb: s.belief.fakeProb };
  const confidence = clamp(0.5 * (1 - s.sd / s.sd0) + 0.5 * (1 - Math.exp(-s.d2 / 4)), 0, 1); // how much evidence stands behind the estimate
  const out = { done: s.done, score: 0, estimate: est, spent: s.spent, confidence, defects: s.truth.defects.filter((d) => s.found.includes(d.id)).map((d) => d.label), fake: null, caught: null };
  if (s.done) {
    const qe = Math.min(1, Math.abs(est.quality - s.truth.quality) / 0.25), fe = Math.abs(est.fakeProb - (s.truth.fake ? 1 : 0));
    out.score = clamp(1 - (s.truth.fake ? 0.2 * qe + 0.8 * fe : 0.6 * qe + 0.4 * fe), 0, 1);
    out.fake = s.truth.fake; out.caught = s.truth.fake && est.fakeProb >= 0.5;
  }
  return out;
}

/** Only what the player has earned: costs, the evidence so far, the belief and the warning. The truth shows once the game is done. */
export function view(s) {
  const v = { kind: 'inspect', done: s.done, budget: s.budget, spent: s.spent, left: s.budget - s.spent, accuracy: s.accuracy, fakeDetect: s.fakeDetect, opening: s.opening, warning: s.warning,
    probes: IDS.map((id) => ({ id, cost: PROBES[id].cost, used: s.used.includes(id), affordable: !s.used.includes(id) && s.spent + PROBES[id].cost <= s.budget })),
    evidence: s.evidence.map((e) => ({ ...e, found: [...e.found] })), belief: { ...s.belief }, doubt: round(s.sd), found: s.truth.defects.filter((d) => s.found.includes(d.id)).map((d) => d.label) };
  if (s.done) v.reveal = { quality: s.truth.quality, fake: s.truth.fake, defects: s.truth.defects.map((d) => d.label) };
  return v;
}

// The heuristic player. Skill 0 buys no information at all; skill 1 picks the subset of probes that most shrinks the doubt for the budget.
function plan(s, target, k) {
  const var0 = s.sd * s.sd, p = s.belief.fakeProb;
  let best = [], bv = -1, bc = 0;
  for (let m = 0; m < 1 << IDS.length; m++) {
    const ids = IDS.filter((_, i) => m & (1 << i)), cost = ids.reduce((a, id) => a + PROBES[id].cost, 0);
    if (cost > Math.min(target, s.budget - s.spent)) continue;
    const prec = ids.reduce((a, id) => a + 1 / qSd(s, id) ** 2, 0), d2 = ids.reduce((a, id) => a + dOf(s, id) ** 2, 0);
    const gain = 1 - 1 / (1 + var0 * prec) + 4 * p * (1 - p) * (1 - Math.exp(-d2 / 4));
    const val = gain * (1 + (1 - k) * 0.8 * (u(s.seed, 'plan' + m) * 2 - 1));
    if (val > bv + 1e-9 || (Math.abs(val - bv) <= 1e-9 && cost < bc)) { bv = val; best = ids; bc = cost; }
  }
  return best.sort((a, b) => PROBES[a].cost - PROBES[b].cost);
}

export function autoplay(params, skill = 0.5) {
  const k = clamp(num(skill, 0.5), 0, 1), log = [];
  let s = create(params);
  const go = (action) => { const r = act(s, action); if (r.say !== null) { s = r.state; log.push({ action, say: r.say }); } };
  for (const id of plan(s, Math.round(s.budget * clamp(1.25 * k - 0.05, 0, 1)), k)) go({ type: 'probe', id });
  go({ type: 'conclude' });
  return { ...result(s), log };
}
