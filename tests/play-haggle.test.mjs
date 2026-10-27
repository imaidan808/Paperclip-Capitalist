// Haggle: the contract (section 6.1), the economics (calibration over hundreds of seeds) and the teaching behaviours.
// Calibration note: a closed deal can never pass the counterparty's hidden limit, so "skill 1 averages 1.15-1.30 x fair"
// needs buyers whose limit sits above fair. These tests draw the limit from 1.25-1.45 x fair (a buyer who values the thing
// a bit above the market) and a trained player (insight 3); the reserve-about-fair cases are tested as their own regime.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from '../js/play/haggle.js';
import { RNG } from '../js/rng.js';

const STYLES = H.STYLES;
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const ratio = (rng, lo = 1.25, hi = 1.45) => lo + (hi - lo) * rng.next();
/** n games per style: params for game i of a style. role 'buy' mirrors the limit about fair. */
function params(i, style, o = {}) {
  const rng = new RNG(i * 7919 + 13), r = ratio(rng, o.lo, o.hi), role = o.role || 'sell';
  return { role, fair: 100, reserve: role === 'sell' ? 100 * r : 100 * (2 - r), style, patience: 3 + (i % 5), insight: o.insight ?? 3, alt: o.alt ?? null, assist: !!o.assist, seed: i + 1000 };
}
function batch(n, o, play) { const out = []; for (let i = 0; i < n; i++) for (const style of STYLES) out.push(play(params(i, style, o), i, style)); return out; }
const dealsOf = (rs) => rs.filter((r) => r.deal), failRate = (rs) => 1 - dealsOf(rs).length / rs.length;
function randomPlay(p, seed) { let s = H.create(p); const rng = new RNG(seed + 5); for (let k = 0; k < 40 && !s.done; k++) s = H.act(s, rng.pick(H.legal(s))).state; return H.result(s); }
/** Run a hand-written policy: it gets the live state and returns an action (or null to stop). */
function play(p, policy) { let s = H.create(p); for (let k = 0; k < 40 && !s.done; k++) { const a = policy(s, H.view(s)); if (!a) break; const r = H.act(s, a); if (r.say === null) break; s = r.state; } return { s, r: H.result(s) }; }
const concedeAll = (level, size = 'medium') => (s, v) => (v.round === 0 ? { type: 'anchor', level } : { type: 'concede', size });
function* leaves(x, path = '') { if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) yield* leaves(v, path + '.' + k); else yield [path, x]; }

test('the module exports the contract and every function is pure and JSON-safe', () => {
  for (const f of ['create', 'act', 'result', 'autoplay', 'legal', 'view']) assert.equal(typeof H[f], 'function', f);
  const s = H.create(params(1, 'friendly'));
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  assert.equal(H.result(s).done, false);
  assert.deepEqual(H.legal(s).map((a) => a.type + (a.level || '')), ['anchorhigh', 'anchorfair', 'anchorlow', 'walk']);
  for (const k of ['done', 'score']) assert.ok(k in H.result(s));
  const r = H.autoplay(params(1, 'friendly'), 0.5);
  for (const k of ['done', 'score', 'deal', 'price', 'mult', 'rounds', 'log']) assert.ok(k in r, k);
  assert.ok(r.log.every((l) => l.action && typeof l.say === 'string'));
});

test('act never mutates its input, and a state saved as JSON plays on identically', () => {
  for (let i = 0; i < 60; i++) {
    const style = STYLES[i % 4];
    let a = H.create(params(i, style, { alt: i % 2 ? 110 : null })), b = JSON.parse(JSON.stringify(a));
    const rng = new RNG(i + 77);
    for (let k = 0; k < 40 && !a.done; k++) {
      const choice = rng.pick(H.legal(a)), frozen = JSON.stringify(a);
      const ra = H.act(a, choice), rb = H.act(JSON.parse(JSON.stringify(b)), choice);
      assert.equal(JSON.stringify(a), frozen, 'input untouched');
      assert.equal(JSON.stringify(ra), JSON.stringify(rb), 'same after a JSON round trip');
      a = ra.state; b = JSON.parse(JSON.stringify(rb.state));
    }
  }
  const p = params(3, 'hard');
  assert.equal(JSON.stringify(H.autoplay(p, 1)), JSON.stringify(H.autoplay(p, 1)), 'autoplay is deterministic');
  assert.notEqual(JSON.stringify(H.create({ ...p, seed: 1 })), JSON.stringify(H.create({ ...p, seed: 2 })), 'the seed matters');
});

test('invalid actions return the same state with say null', () => {
  const s0 = H.create(params(2, 'friendly'));
  const bad = [{ type: 'hold' }, { type: 'accept' }, { type: 'concede', size: 'small' }, { type: 'leverage' }, { type: 'split' }, { type: 'anchor', level: 'huge' }, { type: 'anchor' }, { type: 'dance' }, null, {}];
  for (const a of bad) { const r = H.act(s0, a); assert.equal(r.state, s0); assert.equal(r.say, null); assert.equal(r.done, false); }
  const s1 = H.act(s0, { type: 'anchor', level: 'high' }).state;
  assert.equal(H.act(s1, { type: 'anchor', level: 'fair' }).say, null, 'the anchor is the first move only');
  assert.equal(H.act(s1, { type: 'leverage' }).say, null, 'no alternative, no leverage');
  assert.ok(!H.legal(s1).some((a) => a.type === 'leverage'));
  const done = H.act(s1, { type: 'walk' });
  assert.equal(done.done, true);
  assert.equal(H.act(done.state, { type: 'hold' }).say, null, 'nothing happens after the end');
  assert.deepEqual(H.legal(done.state), []);
});

test('every number is finite and a closed deal stays inside [0.6, 1.4] x fair and the limit, whatever the inputs', () => {
  const weird = [
    { fair: 0.05, reserve: 0.08 }, { fair: 1e7, reserve: 1.3e7 }, { fair: 100, reserve: 10000 }, { fair: 100, reserve: 0.01 }, { fair: 100, reserve: NaN },
    { fair: -5, reserve: 3 }, { fair: 100, reserve: 130, patience: 99, handicap: 50 }, { fair: 100, reserve: 130, patience: 0, handicap: -3 }, { fair: 100, reserve: 130, alt: 5000 }, { fair: 100, reserve: 130, alt: 0.001 }, { fair: 100, reserve: 130, style: 'nonsense', seed: -9 }, {},
  ];
  for (const role of ['sell', 'buy']) for (const w of weird) for (let seed = 1; seed <= 12; seed++) {
    const p = { role, style: STYLES[seed % 4], insight: seed % 7, alt: seed % 2 ? 120 : null, ...w, seed };
    for (const mode of ['random', 'auto']) {
      const r = mode === 'auto' ? H.autoplay(p, (seed % 5) / 4) : randomPlay(p, seed);
      for (const [path, v] of leaves(r)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${mode} ${role} ${JSON.stringify(w)} ${path}`);
      const fair = Number.isFinite(w.fair) && w.fair > 0 ? w.fair : 1;
      if (r.deal) {
        assert.ok(r.mult >= 0.6 - 1e-9 && r.mult <= 1.4 + 1e-9, `mult ${r.mult}`);
        assert.ok(Math.abs(r.price / fair - r.mult) < 1e-4);
        if (Number.isFinite(w.reserve)) { // never a price past their limit (unless the limit itself was out of bounds and clamped)
          const lim = Math.min(1.4, Math.max(0.6, role === 'sell' ? w.reserve / fair : 2 - w.reserve / fair));
          assert.ok(role === 'sell' ? r.mult <= lim + 1e-4 : r.mult >= 2 - lim - 1e-4, `${role} mult ${r.mult} vs limit ${lim}`);
        }
      } else { assert.equal(r.price, null); assert.equal(r.mult, null); assert.ok(r.score <= 0.3); }
      assert.ok(r.score >= 0 && r.score <= 1);
    }
    for (const x of [H.create(p), H.view(H.create({ ...p, assist: true }))]) for (const [path, v] of leaves(x)) if (typeof v === 'number') assert.ok(Number.isFinite(v), path);
  }
});

test('calibration (seller): expert 1.15-1.30, Quick about 1.00, random at most 0.92 and fails more', () => {
  const N = 300, at = (skill) => batch(N, {}, (p) => H.autoplay(p, skill));
  const expert = at(1), quick = at(0.5), careless = at(0), mid = at(0.75), rnd = batch(N, {}, (p, i) => randomPlay(p, i));
  const m = (rs) => mean(dealsOf(rs).map((r) => r.mult));
  assert.ok(m(expert) >= 1.15 && m(expert) <= 1.3, `expert ${m(expert)}`);
  assert.ok(Math.abs(m(quick) - 1) <= 0.06, `quick ${m(quick)}`);
  assert.ok(m(rnd) <= 0.92, `random ${m(rnd)}`);
  assert.ok(failRate(rnd) > failRate(quick) + 0.1, 'random fails to close far more often than Quick');
  assert.ok(failRate(expert) <= 0.03, `an expert almost always closes (${failRate(expert)})`);
  assert.ok(m(expert) > m(mid) && m(mid) > m(quick) && m(quick) > m(careless) && m(careless) > m(rnd) - 0.05, 'skill is monotone');
  assert.ok(m(expert) / m(quick) >= 1.15, 'Deal Room play beats Quick by at least 15%');
  assert.ok(mean(expert.map((r) => r.score)) > mean(quick.map((r) => r.score)) + 0.1 && mean(quick.map((r) => r.score)) > mean(rnd.map((r) => r.score)));
  for (const style of STYLES) { // the edge shows against every temperament, never by luck alone
    const e = batch(N, {}, (p) => (p.style === style ? H.autoplay(p, 1) : null)).filter((r) => r && r.deal), q = batch(N, {}, (p) => (p.style === style ? H.autoplay(p, 0.5) : null)).filter((r) => r && r.deal);
    assert.ok(mean(e.map((r) => r.mult)) > mean(q.map((r) => r.mult)) + 0.05, style);
  }
});

test('calibration (buyer): the mirror image pays 0.75-0.88 of fair at best, about 1.0 on Quick', () => {
  const N = 300, o = { role: 'buy' }, at = (k) => batch(N, o, (p) => H.autoplay(p, k)), m = (rs) => mean(dealsOf(rs).map((r) => r.mult));
  const expert = at(1), quick = at(0.5), rnd = batch(N, o, (p, i) => randomPlay(p, i));
  assert.ok(m(expert) >= 0.75 && m(expert) <= 0.88, `expert pays ${m(expert)}`);
  assert.ok(Math.abs(m(quick) - 1) <= 0.06, `quick pays ${m(quick)}`);
  assert.ok(m(rnd) >= 1.08 && failRate(rnd) > failRate(quick) + 0.1, `random pays ${m(rnd)}`);
  for (const r of dealsOf(expert)) assert.ok(r.price >= 60 - 1e-6 && r.price <= 140 + 1e-6);
});

test('always conceding gives the surplus away: at or below fair for a seller when the limit is about fair', () => {
  for (const level of ['high', 'fair', 'low']) for (const size of ['small', 'medium', 'large']) {
    const rs = batch(120, { lo: 0.9, hi: 1.0 }, (p) => play(p, concedeAll(level, size)).r);
    for (const r of dealsOf(rs)) assert.ok(r.mult <= 1.0 + 1e-9, `${level}/${size} ${r.mult}`);
    assert.ok(mean(dealsOf(rs).map((r) => r.mult)) <= 0.97, `${level}/${size}`);
  }
  const rich = batch(120, {}, (p) => play(p, concedeAll('high', 'large')).r), best = batch(120, {}, (p) => H.autoplay(p, 1));
  assert.ok(mean(dealsOf(best).map((r) => r.mult)) > mean(dealsOf(rich).map((r) => r.mult)) + 0.06, 'conceding every round is worse than reading the zone');
});

test('an absurd anchor against a hard buyer fails more often (past 1.25 x their limit they dig in)', () => {
  const o = { lo: 0.95, hi: 1.05 }; // the high anchor (1.4 x fair) is then about 1.4 x their limit
  const run = (level, style) => batch(150, o, (p) => (p.style === style ? play(p, concedeAll(level, 'medium')).r : null)).filter(Boolean);
  const hardHigh = failRate(run('high', 'hard')), hardFair = failRate(run('fair', 'hard')), friendlyHigh = failRate(run('high', 'friendly'));
  assert.ok(hardHigh >= hardFair + 0.2, `hard: high ${hardHigh} vs fair ${hardFair}`);
  assert.ok(hardHigh > friendlyHigh + 0.15, `a friendly buyer forgives it far more (${friendlyHigh})`);
  const insulted = H.act(H.create({ ...params(5, 'hard'), reserve: 100 }), { type: 'anchor', level: 'high' });
  const polite = H.act(H.create({ ...params(5, 'hard'), reserve: 120 }), { type: 'anchor', level: 'high' });
  assert.equal(H.view(insulted.state).flag, 'mad');
  assert.ok(H.view(insulted.state).rounds < H.view(polite.state).rounds, 'they lose patience');
  assert.equal(H.view(polite.state).flag, null);
});

test('leverage helps only when an alternative exists (and only if it beats their offer)', () => {
  const lev = (s, v) => (v.round === 0 ? { type: 'anchor', level: 'high' } : v.canLeverage && v.round === 1 ? { type: 'leverage' } : { type: 'concede', size: 'medium' });
  const withAlt = batch(150, { alt: 130 }, (p) => play(p, lev).r), noAlt = batch(150, {}, (p) => play(p, lev).r), unused = batch(150, { alt: 130 }, (p) => play(p, concedeAll('high')).r);
  const m = (rs) => mean(dealsOf(rs).map((r) => r.mult));
  assert.ok(m(withAlt) > m(unused) + 0.04, `leverage ${m(withAlt)} vs not using it ${m(unused)}`);
  assert.equal(m(noAlt), m(batch(150, {}, (p) => play(p, concedeAll('high')).r)), 'with no alternative the move does not exist');
  // a weak alternative is a wasted card: the counterparty's numbers do not move any more than they do on a plain hold
  const base = (a) => H.act(H.act(H.create({ ...params(9, 'hard'), alt: 60 }), { type: 'anchor', level: 'high' }).state, a);
  assert.equal(H.view(base({ type: 'leverage' }).state).theirs, H.view(base({ type: 'hold' }).state).theirs);
  assert.match(base({ type: 'leverage' }).say, /./);
  // the engine may hand over the offer as an object
  assert.ok(H.legal(H.act(H.create({ ...params(9, 'hard'), alt: { price: 110 } }), { type: 'anchor', level: 'high' }).state).some((a) => a.type === 'leverage'));
  // walking away with an alternative is a legitimate end, scored low-ish but not zero
  const walked = play({ ...params(4, 'hard'), alt: 110 }, (s, v) => (v.round === 0 ? { type: 'anchor', level: 'high' } : { type: 'walk' })).r;
  assert.equal(walked.deal, false); assert.equal(walked.walkedToAlt, true); assert.ok(walked.score > 0.05 && walked.score < 0.5);
});

test('temperaments: analytical punish low-balls, impulsive reward high anchors, friendly answer small steps in kind', () => {
  // analytical: "if it is that cheap, what is wrong with it?" - a low-ball closes under your own number; others take it at face value
  const lowball = (style) => batch(120, {}, (p) => (p.style === style ? play(p, (s, v) => (v.round === 0 ? { type: 'anchor', level: 'low' } : { type: 'concede', size: 'small' })).r : null)).filter((r) => r && r.deal);
  const lowPrice = H.ANCHORS.low;
  assert.ok(mean(lowball('analytical').map((r) => r.mult)) < lowPrice * 0.95, 'analytical pays under the low ask');
  for (const style of ['friendly', 'impulsive', 'hard']) assert.ok(mean(lowball(style).map((r) => r.mult)) >= lowPrice - 1e-9, style);
  const sus = H.act(H.create({ ...params(2, 'analytical'), reserve: 130 }), { type: 'anchor', level: 'low' }).state;
  assert.equal(H.view(sus).flag, 'sus');
  // impulsive: a high anchor makes them keener (they accept more); analytical do not care about the number; low-balls cool everyone but analytical
  const lift = (style, level, R = 130) => { const s0 = H.create({ ...params(3, style), reserve: R, patience: 7 }); return H.act(s0, { type: 'anchor', level }).state.tau - s0.tau; };
  assert.ok(lift('impulsive', 'high') >= 0.1 && lift('impulsive', 'fair') > 0 && lift('impulsive', 'low') < 0, 'impulsive: the bigger the number, the keener');
  assert.equal(lift('analytical', 'high'), 0, 'analytical do not care about the number');
  assert.ok(lift('analytical', 'low') <= -0.099);
  assert.ok(lift('hard', 'high') > 0 && lift('hard', 'high') < 0.05, 'a hard buyer respects confidence a little');
  // friendly: a small concession is matched at least step for step; a large one is not
  const move = (size) => mean(Array.from({ length: 60 }, (_, i) => {
    let s = H.create({ ...params(i, 'friendly', { lo: 1.3, hi: 1.45 }), patience: 7 });
    s = H.act(s, { type: 'anchor', level: 'high' }).state; s = H.act(s, { type: 'hold' }).state;
    const before = H.view(s), after = H.view(H.act(s, { type: 'concede', size }).state);
    return (after.theirs - before.theirs) / (before.yours - after.yours);
  }));
  assert.ok(move('small') >= 1 - 1e-6, `small: ${move('small')}`);
  assert.ok(move('large') < move('small') * 0.7, `large ${move('large')} vs small ${move('small')}`);
});

test('a counterparty runs out of patience: handicap shortens the talk, and the talk never outlasts it', () => {
  const p = { ...params(6, 'hard'), patience: 7 };
  assert.equal(H.view(H.create(p)).rounds, 7);
  assert.equal(H.view(H.create({ ...p, handicap: 2 })).rounds, 5);
  assert.equal(H.view(H.create({ ...p, patience: 3, handicap: 5 })).rounds, 2, 'never fewer than two');
  for (let i = 0; i < 80; i++) {
    const q = { ...params(i, STYLES[i % 4]), reserve: 150 + i }, r = play(q, (s, v) => (v.round === 0 ? { type: 'anchor', level: 'high' } : { type: 'hold' }));
    assert.ok(r.s.round <= H.view(H.create(q)).rounds && r.s.done, 'holding forever ends in no deal at the latest when patience is spent');
  }
  const stall = play({ ...params(6, 'hard'), reserve: 140, patience: 3 }, (s, v) => (v.round === 0 ? { type: 'anchor', level: 'high' } : { type: 'hold' }));
  assert.equal(stall.r.deal, false); assert.ok(stall.r.score <= 0.1);
});

test('view hides the limit and the temperament numbers; insight tightens a read that always holds the truth', () => {
  const hiddenKeys = /reserve|^R$|tau|lift|susp|readLo|readHi|\.rs$|seed/i;
  const width = (ins) => mean(Array.from({ length: 150 }, (_, i) => { const v = H.view(H.create({ ...params(i, 'friendly'), insight: ins })); return (v.read.hi - v.read.lo) / 100; }));
  for (let i = 1; i < 6; i++) assert.ok(width(i) < width(i - 1), `insight ${i} tighter than ${i - 1}`);
  for (const role of ['sell', 'buy']) for (let i = 0; i < 120; i++) {
    const p = { ...params(i, STYLES[i % 4], { role }), insight: i % 6, alt: 100, assist: true };
    let s = H.create(p); const rng = new RNG(i + 3), truth = Math.min(140, Math.max(60, p.reserve)); // the engine's limit, clamped to the allowed band
    for (let k = 0; k < 40; k++) {
      const v = H.view(s);
      assert.ok(v.read.lo < truth && truth < v.read.hi, `the read holds the limit (${role} ${v.read.lo} ${truth} ${v.read.hi})`);
      for (const [path, val] of leaves(v)) {
        assert.ok(!hiddenKeys.test(path.replace(/^\./, '')), `leaked key ${path}`);
        if (typeof val === 'number' && !/^\.(anchors|steps|floor|yours)|\.yours$/.test(path)) assert.ok(Math.abs(val - truth) > 1e-9, `leaked the limit at ${path}`); // your own numbers and the menu you may say are public by design; what THEY say must never equal their limit
      }
      if (s.done) break;
      s = H.act(s, rng.pick(H.legal(s))).state;
    }
    const r = H.result(s);
    if (s.done) assert.ok(Math.abs(r.reveal.reserve - truth) < 0.01, 'after the end the limit is shown');
    else assert.ok(!r.reveal);
  }
});

test('assist teaches: it names the zone, the anchor and the alternative, and only appears when asked', () => {
  const p = { ...params(8, 'hard'), alt: 125, insight: 3 };
  assert.ok(!('advice' in H.view(H.create(p))));
  const s0 = H.create({ ...p, assist: true }), a0 = H.view(s0).advice;
  assert.equal(a0.action.type, 'anchor'); assert.match(a0.text, /zone of possible agreement/); assert.match(a0.text, /\$/); assert.equal(a0.concept, 'anchoring');
  assert.ok(H.legal(s0).some((l) => l.type === a0.action.type && l.level === a0.action.level), 'the advice is a legal move');
  assert.match(H.view(H.create({ ...p, style: 'hard', assist: true })).advice.text, /1\.25 times their limit/);
  const concepts = new Set();
  for (let i = 0; i < 60; i++) {
    let s = H.create({ ...params(i, STYLES[i % 4]), alt: 118, assist: true });
    for (let k = 0; k < 40 && !s.done; k++) {
      const adv = H.view(s).advice; concepts.add(adv.concept);
      assert.ok(adv.text.length > 20 && adv.text.length < 400);
      assert.ok(H.legal(s).some((l) => l.type === adv.action.type && l.level === adv.action.level && l.size === adv.action.size), JSON.stringify(adv.action));
      s = H.act(s, adv.action).state;
    }
    assert.ok(s.done);
  }
  assert.ok(['anchoring', 'batna', 'zopa'].every((c) => concepts.has(c)), [...concepts].join());
  // following the advice is expert play: it beats Quick
  const followed = batch(80, { assist: true, alt: null }, (p) => { let s = H.create(p); while (!s.done) s = H.act(s, H.view(s).advice.action).state; return H.result(s); });
  assert.ok(mean(dealsOf(followed).map((r) => r.mult)) > 1.12);
});

test('result teaches: score is 0..1, a deal beyond the alternative scores higher, the lesson names a concept', () => {
  for (let i = 0; i < 40; i++) {
    const r = H.autoplay(params(i, STYLES[i % 4]), (i % 5) / 4);
    assert.ok(r.score >= 0 && r.score <= 1); assert.ok(r.lesson.text.length > 10); assert.ok(['anchoring', 'zopa', 'batna'].includes(r.lesson.concept));
    if (r.deal) assert.ok(r.reveal.reserve >= r.price - 1e-6 || r.role === 'buy');
  }
  const good = play({ ...params(1, 'friendly'), alt: 100 }, (s, v) => (v.round === 0 ? { type: 'anchor', level: 'high' } : { type: 'concede', size: 'small' })).r;
  const poor = play({ ...params(1, 'friendly'), alt: 140 }, (s, v) => (v.round === 0 ? { type: 'anchor', level: 'fair' } : { type: 'accept' })).r;
  assert.ok(good.score > poor.score);
});
