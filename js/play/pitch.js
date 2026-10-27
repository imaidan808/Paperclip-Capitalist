// PITCH (the Pitch stage when selling). Teaches persona alignment: a pitch lands when the two angles you lead with are ones the
// buyer cares about AND your goods can honestly back up. The buyer has a bias (the angle they respond to), needs (tags they
// like) and sometimes a quirk (a past that twists the score). Growth buys `insight`, which turns vague hints into sharp ones.
// Pure and deterministic: JSON state, no clocks, randomness only through js/rng.js hashes of the seed.
import { ANGLES } from '../data/schema.js';
import { hash, step } from '../rng.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const u = (seed, tag) => step(hash(seed + '|' + tag))[1];
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const key = (a, b) => (ANGLES.indexOf(a) < ANGLES.indexOf(b) ? a + '|' + b : b + '|' + a);
const table = (rows) => Object.fromEntries(rows.map(([a, b, v]) => [key(a, b), v]));
const HEAD = ['utility', 'price'], HEART = ANGLES.filter((a) => !HEAD.includes(a));

// How far a buyer's bias spills onto the other angles, and which pairs ring true or false together.
const NEAR = table([['prestige', 'story', 0.35], ['prestige', 'scarcity', 0.30], ['prestige', 'utility', 0.10], ['utility', 'price', 0.35], ['utility', 'story', 0.15], ['scarcity', 'price', 0.25], ['scarcity', 'story', 0.15], ['utility', 'scarcity', 0.05]]);
const SYN = table([['prestige', 'scarcity', 0.10], ['prestige', 'story', 0.10], ['utility', 'price', 0.10], ['utility', 'story', 0.06], ['scarcity', 'price', 0.06], ['scarcity', 'story', 0.06], ['prestige', 'utility', 0.04], ['prestige', 'price', -0.12]]);
const PAIR = table([['prestige', 'utility', 'premium quality'], ['prestige', 'scarcity', 'an exclusive'], ['prestige', 'price', 'a luxury at a discount'], ['prestige', 'story', 'a heritage piece'], ['utility', 'scarcity', 'a useful rarity'],
  ['utility', 'price', 'plain good value'], ['utility', 'story', 'a tool with a track record'], ['scarcity', 'price', 'a now-or-never deal'], ['scarcity', 'story', 'a rare find with a tale'], ['price', 'story', 'a bargain with a backstory']]);

/** Every tag pulls a buyer toward one or two angles (first word full strength, second half). */
export const TAG_ANGLES = { tool: 'utility', office: 'utility price', prestige: 'prestige', paper: 'story utility', retro: 'story scarcity', electronics: 'utility scarcity', vehicle: 'utility prestige', consumer: 'price utility',
  trend: 'scarcity prestige', scrap: 'price utility', industrial: 'utility price', training: 'utility story', digital: 'utility scarcity', b2b: 'utility price', franchise: 'story prestige', infra: 'utility', food: 'price story',
  farm: 'story price', bulk: 'price', marine: 'utility story', collectible: 'scarcity story', luxury: 'prestige scarcity', fashion: 'prestige scarcity', ip: 'scarcity story', media: 'story prestige', realty: 'prestige price',
  finance: 'price utility', energy: 'utility price', medical: 'utility story', home: 'story utility', outdoor: 'story utility', gem: 'prestige scarcity' };

/** A quirk shifts how each angle lands (fx), and says why in the buyer's own words (me). Buyer data may use any `phrase` or `id`. */
export const QUIRKS = [
  { id: 'flashy', phrase: 'was burned by a flashy pitch last year', me: 'I was burned by a flashy pitch last year', fx: { prestige: -0.55, story: -0.3, utility: 0.2 }, words: ['flashy'] },
  { id: 'penny', phrase: 'counts every penny', me: 'I count every penny', fx: { price: 0.4, prestige: -0.3, story: -0.15 }, words: ['penny', 'pennies'] },
  { id: 'heart', phrase: 'buys with the heart and loves a backstory', me: 'I buy with my heart', fx: { story: 0.4, price: -0.2 }, words: ['heart', 'backstory'] },
  { id: 'fomo', phrase: 'cannot stand missing out', me: 'I hate missing out', fx: { scarcity: 0.45, utility: -0.1 }, words: ['missing out', 'fomo'] },
  { id: 'rushed', phrase: 'hates being rushed', me: 'I hate being rushed', fx: { scarcity: -0.55, utility: 0.15 }, words: ['rush'] },
  { id: 'specs', phrase: 'reads every spec sheet twice', me: 'I read every spec sheet twice', fx: { utility: 0.4, story: -0.3, prestige: -0.15 }, words: ['spec'] },
  { id: 'neighbours', phrase: 'wants to impress the neighbours', me: 'I want to impress the neighbours', fx: { prestige: 0.4, price: -0.25 }, words: ['neighbo', 'impress'] },
  { id: 'bargain', phrase: 'was stung by a bargain that fell apart', me: 'a bargain once fell apart on me', fx: { price: -0.5, utility: 0.2 }, words: ['bargain', 'stung'] },
  { id: 'sceptic', phrase: 'distrusts any sales story', me: 'I distrust sales stories', fx: { story: -0.55, utility: 0.2 }, words: ['distrust', 'sceptic', 'skeptic'] },
  { id: 'collector', phrase: 'chases rare things', me: 'I chase rare things', fx: { scarcity: 0.4, price: -0.15 }, words: ['rare', 'collect'] },
];
export const quirkFor = (seed) => QUIRKS[u(seed, 'quirk') * QUIRKS.length | 0].phrase;
function quirkOf(x) {
  if (x == null) return null;
  const t = String(typeof x === 'object' ? x.id ?? x.phrase : x).toLowerCase();
  return QUIRKS.find((q) => q.id === t || q.phrase === t) || QUIRKS.find((q) => q.words.some((w) => t.includes(w))) || null;
}

function featuresFromTags(tags) {
  const m = {};
  for (const t of tags) (own(TAG_ANGLES, t) ? TAG_ANGLES[t] : '').split(' ').filter(Boolean).forEach((a, i) => { m[a] = Math.max(m[a] || 0, i ? 0.4 : 0.7); });
  return ANGLES.filter((a) => m[a]).map((angle) => ({ angle, strength: m[angle] }));
}
const near = (b, a) => (a === b ? 1 : NEAR[key(a, b)] || 0);
function pull(needs) { // the angles a buyer's needs point to, strongest = 1
  const w = Object.fromEntries(ANGLES.map((a) => [a, 0]));
  for (const t of needs) (own(TAG_ANGLES, t) ? TAG_ANGLES[t] : '').split(' ').filter(Boolean).forEach((a, i) => { w[a] += i ? 0.5 : 1; });
  const m = Math.max(...Object.values(w));
  return m ? Object.fromEntries(ANGLES.map((a) => [a, w[a] / m])) : w;
}
/** Per angle: R how well it lands on this buyer, C how well the asset backs it, c the two together (a claim you cannot back is worse than silence). */
function analyse(s) {
  const N = pull(s.buyer.needs), fx = QUIRKS.find((q) => q.id === s.buyer.quirk)?.fx || {}, feat = Object.fromEntries(ANGLES.map((a) => [a, 0]));
  for (const f of s.asset.features) feat[f.angle] = Math.max(feat[f.angle], f.strength);
  return ANGLES.map((a) => {
    const R = clamp(0.6 * near(s.buyer.bias, a) + 0.4 * N[a] + (fx[a] || 0), -1, 1), C = feat[a];
    return { a, R, C, c: R >= 0 ? R * clamp(1.25 * C - 0.25, -0.25, 1) : R * (0.5 + 0.5 * C) };
  });
}
function pairRaw(an, a, b) {
  const x = an[ANGLES.indexOf(a)], y = an[ANGLES.indexOf(b)], sy = SYN[key(a, b)] || 0;
  return (x.c + y.c) / 2 + sy * clamp(Math.min(x.c, y.c) / 0.6, 0, 1); // a pair rings true (or false) only as far as the buyer takes BOTH claims seriously
}
const ranked = (an) => pairs().sort((p, q) => pairRaw(an, q[0], q[1]) - pairRaw(an, p[0], p[1])); // every pair, best first
const pairs = () => ANGLES.flatMap((a, i) => ANGLES.slice(i + 1).map((b) => [a, b]));
const fitOf = (raw) => 0.3 * Math.tanh(raw * (raw >= 0 ? 2.2 : 2.8)); // smooth and bounded: a miss stings a little more than a hit rewards
const multOf = (fd) => 1 + (fd >= 0 ? 0.2 : 0.15) * (fd / 0.3);
const gauss = (seed, tag) => Math.sqrt(-2 * Math.log(Math.max(u(seed, tag + 'a'), 1e-9))) * Math.cos(2 * Math.PI * u(seed, tag + 'b'));
const mood = (s) => (u(s.seed, 'mood') - 0.5) * 0.06; // the buyer's day: a little luck that never decides alone

// What the buyer says back, built from parts: an opener by how it went, a clause per angle, and a note on the pair.
const OPEN = [['Now we are talking.', 'Exactly what I came for.'], ['That is decent.', 'I like most of that.'], ['Hm, I am not moved.', 'That did not land much.'], ['That rubbed me the wrong way.', 'No. That is not for me.']];
const CLOSE = ['I will pay a premium for that.', 'I would pay a little extra for that.', 'I will pay what it is worth, no more.', 'You will have to come down on price.'];
const SAY = { // per angle: [backed and wanted, wanted but not backed, not wanted, wanted a little]
  prestige: ['It has real standing; I would be proud to own it.', 'You are dressing it up as high-end, and it is not.', 'I do not care how it looks to other people.', 'The status angle is nice, but it does not move me.'],
  utility: ['It does the job, and you showed me it does.', 'You say it is practical, but nothing backs that up.', 'I am not buying it for what it does.', 'It works, sure, but that is not my main question.'],
  scarcity: ['Not many of these around, so I should move now.', '"Rare", you say? I have seen a dozen of these.', 'A deadline does not move me; I will wait for another.', 'Hard to find, maybe, but I am in no rush.'],
  price: ['The numbers work; that is a fair deal.', 'You call it cheap, but I can do the maths.', 'I am not shopping on price.', 'The price is fine, but it does not decide it.'],
  story: ['I love where it came from; that part sold me.', 'That backstory sounds made up.', 'Spare me the history; I just want the thing.', 'Nice tale, but it does not change my mind.'],
};
const TALK = { prestige: 'talk of status', utility: 'a list of features', scarcity: 'pressure to hurry', price: 'talk of discounts', story: 'a long story' };
function clause(s, x) {
  const q = QUIRKS.find((k) => k.id === s.buyer.quirk), f = q && q.fx[x.a];
  if (f <= -0.25 && x.R < 0.5) return `${q.me}, so ${TALK[x.a]} puts me off.`;
  if (f >= 0.25 && x.c > 0.3) return `${q.me}, so ${TALK[x.a]} suits me.`;
  return SAY[x.a][x.c >= 0.5 ? 0 : x.R >= 0.45 && x.C < 0.3 ? 1 : x.R < 0.3 ? 2 : 3];
}
function voice(s, an, a, b, fd) {
  const t = fd >= 0.2 ? 0 : fd >= 0.08 ? 1 : fd >= -0.03 ? 2 : 3, sy = SYN[key(a, b)] || 0, nm = PAIR[key(a, b)];
  const both = Math.min(an[ANGLES.indexOf(a)].c, an[ANGLES.indexOf(b)].c) >= 0.2; // a remark on the pair only when both claims actually landed
  const note = both && sy >= 0.05 ? ` Together it is ${nm}, and that holds together.` : both && sy <= -0.1 ? ` ${nm[0].toUpperCase() + nm.slice(1)} does not hold together.` : '';
  return `${OPEN[t][u(s.seed, 'open') < 0.5 ? 0 : 1]} ${clause(s, an[ANGLES.indexOf(a)])} ${clause(s, an[ANGLES.indexOf(b)])}${note} ${CLOSE[t]}`;
}

const list = (xs) => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' or ' + xs[xs.length - 1];
const CLEAN = { kind: 'history', text: 'No sore spots that you can find.' };
function hintsFor(s) { // truthful at every level, only vaguer when insight is low
  const { bias, quirk } = s.buyer, i = s.insight, group = HEAD.includes(bias) ? HEAD : HEART, q = QUIRKS.find((k) => k.id === quirk);
  const H = [{ kind: 'temper', angles: group, text: HEAD.includes(bias) ? 'Weighs things up with their head: proof and numbers count.' : 'Buys with feeling: how it makes them feel counts.' }];
  if (i === 1) {
    const other = ANGLES.filter((a) => a !== bias).sort((a, b) => u(s.seed, 'sl' + a) - u(s.seed, 'sl' + b))[0], set = ANGLES.filter((a) => a === bias || a === other);
    H.push({ kind: 'shortlist', angles: set, text: `Leans toward ${list(set)}.` });
  }
  if (i >= 2) H.push({ kind: 'bias', angles: [bias], text: `Responds most to ${bias}.` });
  if (i === 3) H.push(q ? { kind: 'history', text: 'There is some history here; tread carefully.' } : CLEAN);
  if (i === 4) {
    const top = q && Object.entries(q.fx).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))[0];
    H.push(top ? { kind: 'quirk-angle', angle: top[0], sign: Math.sign(top[1]), text: top[1] < 0 ? `Be careful with ${top[0]}; it is a sore spot.` : `Warms to ${top[0]} more than most.` } : CLEAN);
  }
  if (i >= 5) H.push(q || s.buyer.phrase ? { kind: 'quirk', quirk, text: `They say this buyer ${q ? q.phrase : s.buyer.phrase}.` } : CLEAN);
  return H;
}

/** @param {{buyer:{needs:string[],bias:string,quirk?:string},asset:{tags:string[],features:{angle:string,strength:number}[]},insight?:number,seed:number}} p */
export function create(p = {}) {
  const b = p.buyer || {}, a = p.asset || {}, seed = (Number.isFinite(p.seed) ? p.seed : 1) >>> 0;
  const q = quirkOf(b.quirk), tags = (Array.isArray(a.tags) ? a.tags : []).map(String);
  let feats = (Array.isArray(a.features) ? a.features : []).filter((f) => f && ANGLES.includes(f.angle) && Number.isFinite(f.strength))
    .map((f) => ({ angle: f.angle, strength: clamp(f.strength, 0, 1) }));
  if (!feats.length) feats = featuresFromTags(tags); // no features supplied: what an asset's tags can honestly claim
  const s = { kind: 'pitch', seed, insight: clamp(Math.round(Number.isFinite(p.insight) ? p.insight : 0), 0, 5), angles: [...ANGLES],
    buyer: { needs: (Array.isArray(b.needs) ? b.needs : []).map(String), bias: ANGLES.includes(b.bias) ? b.bias : ANGLES[hash(seed + 'bias') % 5],
      quirk: q ? q.id : null, phrase: typeof b.quirk === 'string' ? b.quirk : null },
    asset: { tags, features: feats }, hints: [], pick: null, outcome: null, done: false };
  s.hints = hintsFor(s);
  return s;
}

export function act(s, a) {
  const bad = { state: s, say: null, done: !!(s && s.done) };
  if (!s || !a || s.done || a.type !== 'pick' || !Array.isArray(a.angles) || a.angles.length !== 2) return bad;
  const [x, y] = a.angles;
  if (!ANGLES.includes(x) || !ANGLES.includes(y) || x === y) return bad;
  const pick = ANGLES.indexOf(x) < ANGLES.indexOf(y) ? [x, y] : [y, x], an = analyse(s), fitDelta = fitOf(pairRaw(an, pick[0], pick[1]) + mood(s)), mult = multOf(fitDelta);
  const say = voice(s, an, pick[0], pick[1], fitDelta);
  return { state: { ...s, pick, outcome: { fitDelta, mult, say }, done: true }, say, done: true };
}

export function legal(s) { return !s || s.done ? [] : pairs().map((angles) => ({ type: 'pick', angles })); }

/** score = how good the choice was against the best and worst pair available in THIS scenario (1 = the best pair). */
export function result(s) {
  if (!s.done) return { done: false, score: 0, fitDelta: 0, mult: 1, pick: null };
  const an = analyse(s), raws = pairs().map(([a, b]) => pairRaw(an, a, b)), lo = Math.min(...raws), hi = Math.max(...raws), mine = pairRaw(an, s.pick[0], s.pick[1]);
  return { done: true, score: hi - lo < 1e-9 ? 1 : clamp((mine - lo) / (hi - lo), 0, 1), fitDelta: s.outcome.fitDelta, mult: s.outcome.mult, pick: [...s.pick] };
}

/** What the player may see: the buyer's visible needs, the asset's own strengths, the hints earned. Bias and quirk stay hidden until a hint names them. */
export function view(s) {
  const h = s.hints.filter((x) => x.angles && x.kind !== 'temper').pop(), likely = h ? { angles: [...h.angles], confidence: round2(1 / h.angles.length) } : null;
  const v = { kind: 'pitch', done: s.done, insight: s.insight, angles: [...s.angles], buyer: { needs: [...s.buyer.needs] },
    asset: { tags: [...s.asset.tags], features: s.asset.features.map((f) => ({ ...f })) }, hints: s.hints.map((x) => ({ ...x })), likely };
  if (s.done) {
    const an = analyse(s), best = ranked(an)[0], q = QUIRKS.find((k) => k.id === s.buyer.quirk);
    v.pick = [...s.pick]; v.outcome = { ...s.outcome };
    v.reveal = { bias: s.buyer.bias, quirk: q ? q.phrase : s.buyer.phrase,
      best: { angles: best, fitDelta: fitOf(pairRaw(an, best[0], best[1]) + mood(s)) } };
  }
  return v;
}
const round2 = (x) => Math.round(x * 100) / 100;

// The heuristic player reads only what view() shows. Skill 1 uses every hint and weighs backing against appeal; skill 0 guesses.
export function autoplay(params, skill = 0.5) {
  const k = clamp(Number.isFinite(skill) ? skill : 0.5, 0, 1), s0 = create(params), v = view(s0), N = pull(v.buyer.needs);
  const set = k >= 0.3 && v.likely ? v.likely.angles : (k >= 0.3 ? v.hints.find((x) => x.kind === 'temper').angles : ANGLES);
  const wb = Object.fromEntries(ANGLES.map((a) => [a, set.includes(a) ? 0.3 + N[a] : 0])), tot = ANGLES.reduce((t, a) => t + wb[a], 0);
  const qh = k >= 0.3 ? v.hints.find((x) => x.kind === 'quirk-angle') : null, qk = k >= 0.3 ? v.hints.find((x) => x.kind === 'quirk') : null;
  const qf = qk && QUIRKS.find((q) => q.id === qk.quirk)?.fx; // only what the hints named: the player never reads the hidden state
  const an = ANGLES.map((a) => {
    const R0 = 0.6 * ANGLES.reduce((t, b) => t + (wb[b] / tot) * near(b, a), 0) + 0.4 * N[a] + (qh && qh.angle === a ? qh.sign * 0.45 : 0) + (qf && qf[a] || 0);
    const R = clamp(R0 + (1 - k) ** 1.5 * gauss(s0.seed, 'ap' + a), -1, 1); // a careless player misjudges how each angle lands
    const C = Math.max(0, ...v.asset.features.filter((f) => f.angle === a).map((f) => f.strength));
    return { a, R, C, c: R >= 0 ? R * clamp(1.25 * C - 0.25, -0.25, 1) : R * (0.5 + 0.5 * C) };
  });
  const action = { type: 'pick', angles: ranked(an)[0] }, r = act(s0, action);
  return { ...result(r.state), log: [{ action, say: r.say }] };
}
