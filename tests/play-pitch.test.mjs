// Pitch (the Pitch stage): persona alignment. Lead with what the buyer cares about AND what your goods can back up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RNG } from '../js/rng.js';
import { TAGS, ANGLES } from '../js/data/schema.js';
import { create, act, result, autoplay, legal, view, QUIRKS, TAG_ANGLES, quirkFor } from '../js/play/pitch.js';

/** A random but reproducible scenario: any bias, two needs, 2-4 features, a quirk half the time. */
function scen(i, over = {}) {
  const r = new RNG(i * 977 + 3), feats = [...ANGLES].sort(() => r.next() - 0.5).slice(0, r.int(2, 4)).map((angle) => ({ angle, strength: r.range(0.25, 1) }));
  return { buyer: { needs: [r.pick(TAGS), r.pick(TAGS)], bias: r.pick(ANGLES), quirk: r.chance(0.5) ? QUIRKS[r.int(0, QUIRKS.length - 1)].phrase : null },
    asset: { tags: [], features: feats }, insight: r.int(0, 5), seed: i, ...over };
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const outcome = (p, angles) => act(create(p), { type: 'pick', angles }).state.outcome;
const fitOfPair = (p, a, b) => outcome(p, [a, b]).fitDelta;
const N = 800;

test('the API surface exists; the five angles and the tag table are complete', () => {
  const s = create(scen(1));
  for (const f of [create, act, result, autoplay, legal, view]) assert.equal(typeof f, 'function');
  assert.deepEqual(s.angles, ANGLES);
  assert.deepEqual(view(s).angles, ANGLES);
  for (const t of TAGS) assert.ok(Object.hasOwn(TAG_ANGLES, t), `tag ${t} pulls toward an angle`);
  for (const spec of Object.values(TAG_ANGLES)) for (const a of spec.split(' ')) assert.ok(ANGLES.includes(a));
  assert.equal(legal(s).length, 10, 'ten unordered pairs');
  assert.ok(QUIRKS.length >= 8 && QUIRKS.every((q) => q.phrase && q.me && Object.keys(q.fx).every((a) => ANGLES.includes(a))));
});

test('pick takes exactly two distinct angles; anything else returns the same state with say null', () => {
  const s = create(scen(2));
  const bad = [null, undefined, {}, { type: 'pick' }, { type: 'pick', angles: [] }, { type: 'pick', angles: ['price'] }, { type: 'pick', angles: ['price', 'price'] }, { type: 'pick', angles: ['price', 'story', 'utility'] },
    { type: 'pick', angles: ['price', 'charm'] }, { type: 'pick', angles: 'price,story' }, { type: 'sell', angles: ['price', 'story'] }, { type: 'pick', angles: ['constructor', 'price'] }];
  for (const a of bad) { const r = act(s, a); assert.equal(r.state, s); assert.equal(r.say, null); assert.equal(r.done, false); }
  const r = act(s, { type: 'pick', angles: ['story', 'price'] });
  assert.equal(r.done, true);
  assert.deepEqual(r.state.pick, ['price', 'story'], 'the pair is stored in the angles\' own order');
  const again = act(r.state, { type: 'pick', angles: ['utility', 'price'] });
  assert.equal(again.state, r.state);
  assert.equal(again.say, null);
  assert.deepEqual(legal(r.state), []);
  assert.deepEqual(fitOfPair(scen(2), 'story', 'price'), fitOfPair(scen(2), 'price', 'story'), 'order does not matter');
});

test('deterministic for a seed, JSON-safe, and act never mutates its input', () => {
  const p = scen(9), s = deepFreeze(create(p));
  const r1 = act(s, { type: 'pick', angles: ['prestige', 'utility'] }), r2 = act(JSON.parse(JSON.stringify(s)), { type: 'pick', angles: ['prestige', 'utility'] });
  assert.deepEqual(r1, r2);
  assert.deepEqual(JSON.parse(JSON.stringify(r1.state)), r1.state);
  assert.deepEqual(create(p), create(p));
  assert.deepEqual(autoplay(p, 0.6), autoplay(p, 0.6));
  assert.deepEqual(view(r1.state), view(JSON.parse(JSON.stringify(r1.state))));
});

test('fitDelta stays in [-0.3, 0.3] and mult in [0.85, 1.2], and mult follows fitDelta', () => {
  const pairs = [];
  for (let i = 0; i < N; i++) {
    const s = create(scen(i));
    for (const a of legal(s)) {
      const o = act(s, a).state.outcome;
      assert.ok(o.fitDelta >= -0.3 && o.fitDelta <= 0.3 && o.mult >= 0.85 && o.mult <= 1.2 && Number.isFinite(o.fitDelta + o.mult), JSON.stringify(o));
      pairs.push([o.fitDelta, o.mult]);
    }
  }
  pairs.sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < pairs.length; i++) assert.ok(pairs[i][1] >= pairs[i - 1][1] - 1e-12, 'mult never falls as fitDelta rises');
  assert.ok(pairs[0][0] < -0.2 && pairs[pairs.length - 1][0] > 0.2, 'the whole range is reachable');
  assert.ok(Math.abs(Math.max(...pairs.map((x) => x[1])) - 1.2) < 0.02 && Math.min(...pairs.map((x) => x[1])) < 0.9);
});

test('the buyer\'s bias plus the asset\'s strongest feature beats the worst pair', () => {
  // The rule holds when the bias is something the asset can honestly back (strength >= 0.4) and the buyer's quirk is not a sore spot on it.
  // Leading with an angle you cannot back is a bluff, and bluffs are penalised, so a bluff on the bias is outside the claim.
  let checked = 0, quirky = 0;
  for (let i = 0; i < 3000; i++) {
    const p = scen(i), { bias } = p.buyer, bf = p.asset.features.find((f) => f.angle === bias), q = QUIRKS.find((k) => k.phrase === p.buyer.quirk);
    if (!bf || bf.strength < 0.4 || (q && (q.fx[bias] || 0) <= -0.25)) continue;
    const ranked = [...p.asset.features].sort((a, b) => b.strength - a.strength).filter((f) => f.angle !== bias);
    const strongest = p.asset.features.reduce((m, f) => (f.strength > m.strength ? f : m)).angle === bias ? ranked[0] : ranked.sort((a, b) => b.strength - a.strength)[0];
    if (!strongest) continue;
    const s = create(p), good = fitOfPair(p, bias, strongest.angle), worst = Math.min(...legal(s).map((a) => act(s, a).state.outcome.fitDelta));
    assert.ok(good > worst, `scenario ${i}: ${bias}+${strongest.angle} = ${good} should beat the worst pair ${worst}`);
    checked++; if (q) quirky++;
  }
  assert.ok(checked > 800 && quirky > 300, `enough scenarios checked (${checked}, ${quirky} with quirks)`);
});

test('the best-aligned pair clearly beats the average and the worst', () => {
  const best = [], avg = [], worst = [];
  for (let i = 0; i < N; i++) {
    const s = create(scen(i)), fs = legal(s).map((a) => act(s, a).state.outcome.fitDelta);
    best.push(Math.max(...fs)); avg.push(mean(fs)); worst.push(Math.min(...fs));
  }
  assert.ok(mean(best) > mean(avg) + 0.08 && mean(avg) > mean(worst) + 0.06, `${mean(best).toFixed(3)} ${mean(avg).toFixed(3)} ${mean(worst).toFixed(3)}`);
});

test('result.score rates the choice against the best and worst pair of the scenario', () => {
  for (let i = 0; i < 100; i++) {
    const s = create(scen(i)), scores = legal(s).map((a) => result(act(s, a).state).score);
    assert.ok(Math.abs(Math.max(...scores) - 1) < 1e-9 && Math.abs(Math.min(...scores)) < 1e-9);
    assert.ok(scores.every((x) => x >= 0 && x <= 1));
  }
  assert.deepEqual([result(create(scen(1))).done, result(create(scen(1))).score], [false, 0]);
});

test('needs matter: the same bias sells differently to a buyer who needs different things', () => {
  const asset = { tags: [], features: [{ angle: 'utility', strength: 0.9 }, { angle: 'prestige', strength: 0.9 }, { angle: 'scarcity', strength: 0.9 }, { angle: 'price', strength: 0.9 }] };
  const base = { buyer: { needs: ['luxury', 'gem'], bias: 'utility', quirk: null }, asset, insight: 0, seed: 4 };
  const toolBuyer = { ...base, buyer: { ...base.buyer, needs: ['tool', 'industrial'] } };
  assert.ok(fitOfPair(base, 'prestige', 'scarcity') > fitOfPair(toolBuyer, 'prestige', 'scarcity') + 0.1, 'luxury needs favour prestige and scarcity');
  assert.ok(fitOfPair(toolBuyer, 'utility', 'price') > fitOfPair(base, 'utility', 'price'), 'tool needs favour utility with price');
  assert.ok(fitOfPair(base, 'prestige', 'scarcity') > fitOfPair(base, 'utility', 'price') - 0.2, 'yet the bias is not everything');
});

test('credibility: an angle the asset cannot back is a bluff and costs you', () => {
  const buyer = { needs: ['luxury'], bias: 'prestige', quirk: null };
  const backed = { buyer, asset: { tags: [], features: [{ angle: 'prestige', strength: 0.9 }, { angle: 'story', strength: 0.5 }] }, insight: 0, seed: 3 };
  const bluff = { ...backed, asset: { tags: [], features: [{ angle: 'story', strength: 0.5 }] } };
  assert.ok(fitOfPair(backed, 'prestige', 'story') > fitOfPair(bluff, 'prestige', 'story') + 0.05);
  const say = act(create(bluff), { type: 'pick', angles: ['prestige', 'story'] }).say;
  assert.match(say, /dressing it up as high-end, and it is not/);
});

test('quirks twist the score in a way a good hint reveals', () => {
  const asset = { tags: [], features: ANGLES.map((angle) => ({ angle, strength: 0.8 })) };
  const mk = (quirk, bias = 'prestige') => ({ buyer: { needs: ['luxury', 'fashion'], bias, quirk }, asset, insight: 4, seed: 6 });
  const flashy = 'was burned by a flashy pitch last year';
  assert.ok(fitOfPair(mk(flashy), 'prestige', 'story') < fitOfPair(mk(null), 'prestige', 'story') - 0.1, 'a flashy pitch to the burned buyer falls flat');
  assert.ok(fitOfPair(mk('counts every penny', 'price'), 'price', 'utility') > fitOfPair(mk(null, 'price'), 'price', 'utility'), 'a penny-counter warms to price');
  const say = act(create(mk(flashy)), { type: 'pick', angles: ['prestige', 'scarcity'] }).say;
  assert.match(say, /I was burned by a flashy pitch last year, so talk of status puts me off\./);
  // the hint at insight 4 names the angle and the direction; insight 5 gives the words; insight 0 gives nothing
  const h4 = view(create(mk(flashy))).hints.find((h) => h.kind === 'quirk-angle');
  assert.deepEqual([h4.angle, h4.sign], ['prestige', -1]);
  assert.match(h4.text, /prestige/);
  assert.ok(view(create({ ...mk(flashy), insight: 5 })).hints.some((h) => h.text.includes(flashy)));
  assert.ok(!JSON.stringify(view(create({ ...mk(flashy), insight: 0 }))).includes('flashy'));
  // the same phrase works as an id, in other words, or as free text that changes nothing
  assert.deepEqual(create(mk('flashy')).buyer.quirk, create(mk(flashy)).buyer.quirk);
  assert.equal(create(mk('a very flashy salesman burned them')).buyer.quirk, 'flashy');
  assert.equal(fitOfPair(mk('likes tuesdays'), 'prestige', 'scarcity'), fitOfPair(mk(null), 'prestige', 'scarcity'));
  assert.ok(view(create({ ...mk('likes tuesdays'), insight: 5 })).hints.some((h) => h.text.includes('likes tuesdays')), 'free text is still shown at the top level of insight');
  assert.ok(QUIRKS.map((q) => q.phrase).includes(quirkFor(7)));
});

test('hints are truthful at every level and sharper as insight grows; the bias stays hidden until earned', () => {
  const sizes = [[], [], [], [], [], []];
  for (let i = 0; i < 500; i++) {
    for (let ins = 0; ins <= 5; ins++) {
      const p = scen(i, { insight: ins }), s = create(p), v = view(s), set = v.likely?.angles ?? v.hints[0].angles;
      assert.ok(set.includes(p.buyer.bias), `insight ${ins} hint set ${set} must contain the true bias ${p.buyer.bias}`);
      sizes[ins].push(set.length);
      assert.ok(!('bias' in v) && !('bias' in v.buyer) && !JSON.stringify(v).includes('"quirk":"') || ins === 5, 'no bias or quirk keys leaked');
      if (ins === 0) assert.equal(v.likely, null);
    }
  }
  const m = sizes.map(mean);
  assert.ok(m[0] > m[1] && m[1] > m[2], `candidate sets narrow with insight: ${m.map((x) => x.toFixed(2))}`);
  assert.deepEqual(m.slice(2), [1, 1, 1, 1], 'from insight 2 the bias is named');
  assert.deepEqual(view(create(scen(3, { insight: 0 }))).hints.map((h) => h.kind), ['temper']);
  assert.ok(view(create(scen(3, { insight: 5 }))).hints.length >= 3);
  for (let ins = 3; ins <= 5; ins++) assert.ok(view(create(scen(3, { insight: ins }))).hints.length >= 3, 'every level from 3 says something about the history');
});

test('before the pitch view hides the quirk and the outcome; after it, the lesson is revealed', () => {
  const p = scen(12, { insight: 1, buyer: { needs: ['collectible'], bias: 'story', quirk: 'counts every penny' } });
  const s = create(p), v0 = view(s);
  assert.ok(!JSON.stringify(v0).includes('penny') && !('reveal' in v0) && !('outcome' in v0) && !('pick' in v0));
  const r = act(s, { type: 'pick', angles: ['story', 'scarcity'] }), v1 = view(r.state);
  assert.equal(v1.reveal.bias, 'story');
  assert.equal(v1.reveal.quirk, 'counts every penny');
  assert.equal(v1.outcome.say, r.say);
  assert.ok(v1.reveal.best.fitDelta >= v1.outcome.fitDelta - 1e-12);
});

test('the buyer explains in character: varied, specific lines for every pair', () => {
  const p = scen(20, { buyer: { needs: ['retro', 'collectible'], bias: 'story', quirk: null } });
  const says = legal(create(p)).map((a) => act(create(p), a).say);
  assert.equal(new Set(says).size, 10, 'ten pairs, ten different replies');
  for (const t of says) assert.ok(t.length > 60 && /[.!]$/.test(t) && !/undefined|NaN|\[object/.test(t), t);
  const all = new Set(), perPair = {};
  for (let i = 0; i < 300; i++) {
    const s = create(scen(i));
    for (const a of legal(s)) { const t = act(s, a).say; all.add(t); (perPair[a.angles.join('+')] ||= new Set()).add(t); }
  }
  assert.ok(all.size > 600, `plenty of variety (${all.size} distinct replies)`);
  for (const [pair, set] of Object.entries(perPair)) assert.ok(set.size >= 25, `pair ${pair} has only ${set.size} different replies`);
  const backed = { ...p, asset: { tags: [], features: [{ angle: 'story', strength: 0.9 }, { angle: 'scarcity', strength: 0.8 }] } };
  const sayBacked = act(create(backed), { type: 'pick', angles: ['scarcity', 'story'] }).say;
  assert.match(sayBacked, /I love where it came from/);
  assert.match(sayBacked, /a rare find with a tale, and that holds together/);
  const bluff = { ...p, asset: { tags: [], features: [{ angle: 'price', strength: 0.9 }, { angle: 'utility', strength: 0.5 }] } };
  const sayBluff = act(create(bluff), { type: 'pick', angles: ['scarcity', 'story'] }).say;
  assert.match(sayBluff, /That backstory sounds made up/);
  assert.doesNotMatch(sayBluff, /holds together/, 'no praise for a pair whose claims did not land');
});

test('the buyer\'s mood is a little luck, never the deciding factor', () => {
  const diffs = [];
  for (let i = 0; i < 200; i++) {
    const a = fitOfPair(scen(i, { seed: 1 }), 'utility', 'price'), b = fitOfPair(scen(i, { seed: 2 }), 'utility', 'price');
    diffs.push(Math.abs(a - b));
  }
  assert.ok(Math.max(...diffs) < 0.07 && mean(diffs) > 0.001, `mood spread ${Math.max(...diffs)}`);
});

test('autoplay: skill and insight both matter, and it is a legal one-move game', () => {
  const by = (k, ins) => mean(Array.from({ length: N }, (_, i) => autoplay(scen(i, { insight: ins }), k).fitDelta));
  const s0 = by(0, 2), s5 = by(0.5, 2), s1 = by(1, 2);
  assert.ok(s0 < s5 && s5 < s1, `skill ordering ${s0.toFixed(3)} < ${s5.toFixed(3)} < ${s1.toFixed(3)}`);
  const sc = (k) => mean(Array.from({ length: N }, (_, i) => autoplay(scen(i), k).score));
  assert.ok(sc(0) < sc(0.5) && sc(0.5) < sc(1));
  assert.ok(by(0.5, 5) > by(0.5, 0), 'Growth (insight) turns hints into money for the same player');
  const r = autoplay(scen(1), 0.5);
  assert.equal(r.done, true);
  assert.equal(r.log.length, 1);
  assert.equal(r.log[0].action.type, 'pick');
  assert.equal(typeof r.log[0].say, 'string');
  assert.ok(r.score >= 0 && r.score <= 1 && r.mult >= 0.85 && r.mult <= 1.2);
});

test('odd inputs are tamed: no needs, no features, strange tags, a missing bias', () => {
  const s = create({ buyer: { needs: ['constructor', '__proto__', 42], bias: 'nonsense' }, asset: { features: [{ angle: 'story', strength: 7 }, { angle: 'bogus', strength: 1 }, null] }, insight: 99, seed: 'x' });
  assert.ok(ANGLES.includes(s.buyer.bias) && s.insight === 5 && s.asset.features.length === 1 && s.asset.features[0].strength === 1);
  for (const a of legal(s)) { const o = act(s, a).state.outcome; assert.ok(Number.isFinite(o.fitDelta) && o.mult >= 0.85 && o.mult <= 1.2); }
  const t = create({ buyer: { needs: ['luxury'], bias: 'prestige' }, asset: { tags: ['luxury', 'tool'] }, seed: 1 });
  assert.deepEqual(t.asset.features, [{ angle: 'prestige', strength: 0.7 }, { angle: 'utility', strength: 0.7 }, { angle: 'scarcity', strength: 0.4 }], 'with no features given, the tags say what the asset can claim');
  assert.doesNotThrow(() => autoplay({}, 0.4));
  assert.doesNotThrow(() => view(create()));
});
