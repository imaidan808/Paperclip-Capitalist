// Inspect (the Read stage): information has a price, probes differ, the budget is a wall, and view() never leaks the truth.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RNG } from '../js/rng.js';
import { create, act, result, autoplay, legal, view, PROBES } from '../js/play/inspect.js';

const POOL = [{ id: 'crack', label: 'hairline crack in the casing' }, { id: 'pin', label: 'bent contact pin' }, { id: 'rust', label: 'rust under the label' }, { id: 'glue', label: 'glued-on repair' }];
/** A lot drawn the way the default prior expects: condition even over 0.6..1.2, one in five counterfeit, up to three flaws. */
function lot(i, over = {}) {
  const r = new RNG(i * 7919 + 13);
  const defects = POOL.filter(() => r.chance(0.4)).slice(0, 3);
  return { truth: { quality: r.range(0.6, 1.2), fake: r.chance(0.2), defects }, budget: 6, accuracy: 0.5, seed: i + 1, ...over };
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const play = (params, ids) => ids.reduce((s, id) => act(s, { type: 'probe', id }).state, create(params));
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const N = 1500;

test('the API surface exists and a fresh game is well formed', () => {
  const s = create(lot(1));
  for (const f of [create, act, result, autoplay, legal, view]) assert.equal(typeof f, 'function');
  assert.equal(s.done, false);
  assert.equal(result(s).spent, 0);
  assert.equal(result(s).done, false);
  assert.deepEqual(Object.keys(s.belief).sort(), ['fakeProb', 'quality']);
  assert.deepEqual(Object.keys(PROBES).map((k) => PROBES[k].cost), [1, 1, 2, 1, 3]);
});

test('view() leaks no hidden truth: not the quality, the fake flag, the seed or an unfound defect', () => {
  const params = lot(5, { truth: { quality: 0.8137, fake: true, defects: [{ id: 'z9', label: 'SECRETFLAW unfound' }] } });
  let s = create(params);
  const check = (st) => {
    const text = JSON.stringify(view(st));
    assert.ok(!text.includes('truth'), 'no truth key');
    assert.ok(!text.includes('SECRETFLAW'), 'unfound defect label hidden');
    assert.ok(!text.includes('0.8137'), 'exact quality hidden');
    assert.ok(!('seed' in view(st)) && !('reveal' in view(st)), 'no seed, no reveal before the end');
  };
  check(s);
  s = act(s, { type: 'probe', id: 'serial' }).state; // cheap probes rarely find the flaw; the label must stay hidden while unfound
  if (!s.found.length) check(s);
  const done = act(s, { type: 'conclude' }).state;
  assert.equal(view(done).reveal.fake, true, 'the truth is shown once the game is over');
  assert.equal(view(done).reveal.quality, 0.8137);
});

test('state is plain JSON and a round trip plays identically', () => {
  const params = lot(11, { fakeDetect: true });
  let a = create(params), b = JSON.parse(JSON.stringify(a));
  assert.deepEqual(a, b);
  for (const action of [{ type: 'probe', id: 'power' }, { type: 'probe', id: 'serial' }, { type: 'probe', id: 'papers' }, { type: 'conclude' }]) {
    const ra = act(a, action), rb = act(b, action);
    assert.deepEqual(ra, rb);
    a = ra.state; b = JSON.parse(JSON.stringify(rb.state));
    assert.deepEqual(a, b);
  }
  assert.deepEqual(result(a), result(b));
});

test('act never mutates its input and is deterministic for a seed', () => {
  const s = deepFreeze(create(lot(3)));
  const r1 = act(s, { type: 'probe', id: 'power' }), r2 = act(s, { type: 'probe', id: 'power' });
  assert.deepEqual(r1, r2);
  assert.notEqual(r1.state, s);
  assert.equal(s.spent, 0);
  const other = act(create(lot(3, { seed: 999 })), { type: 'probe', id: 'power' });
  assert.notEqual(other.state.evidence[0].reading, r1.state.evidence[0].reading, 'a different seed gives different noise');
  assert.deepEqual(autoplay(lot(8), 0.7), autoplay(lot(8), 0.7));
});

test('invalid actions return the same state with say null', () => {
  const s = create(lot(4, { budget: 2 }));
  const bad = [null, undefined, {}, { type: 'nope' }, { type: 'probe' }, { type: 'probe', id: 'psychic' }, { type: 'probe', id: 'expert' }, { type: 'probe', id: 'constructor' }, 'probe'];
  for (const a of bad) { const r = act(s, a); assert.equal(r.state, s); assert.equal(r.say, null); assert.equal(r.done, false); }
  const after = act(s, { type: 'probe', id: 'look' });
  const again = act(after.state, { type: 'probe', id: 'look' });
  assert.equal(again.state, after.state);
  assert.equal(again.say, null, 'a probe can only be bought once');
  const done = act(s, { type: 'conclude' }).state;
  const late = act(done, { type: 'probe', id: 'look' });
  assert.equal(late.state, done);
  assert.equal(late.say, null);
  assert.equal(late.done, true);
});

test('the budget is never exceeded, and the game ends when nothing is affordable', () => {
  const ids = Object.keys(PROBES);
  for (let i = 0; i < 300; i++) {
    const r = new RNG(i + 1), budget = r.int(0, 8);
    let s = create(lot(i, { budget }));
    for (let n = 0; n < 12; n++) {
      const a = r.chance(0.1) ? { type: 'conclude' } : { type: 'probe', id: r.pick(ids) };
      s = act(s, a).state;
      assert.ok(result(s).spent <= budget, `spent ${result(s).spent} over budget ${budget}`);
    }
  }
  const s = act(create(lot(2, { budget: 3 })), { type: 'probe', id: 'expert' });
  assert.equal(s.done, true, 'three points spent on the expert leaves nothing to buy');
  assert.equal(create(lot(2, { budget: 0 })).done, true);
  assert.deepEqual(legal(s.state), []);
});

test('legal() lists only affordable, unused probes plus conclude, and every one is accepted', () => {
  let s = create(lot(6, { budget: 4 }));
  assert.deepEqual(legal(s).map((a) => a.id ?? a.type), ['look', 'serial', 'power', 'papers', 'expert', 'conclude'].filter((x) => x !== 'expert' || PROBES.expert.cost <= 4));
  s = act(s, { type: 'probe', id: 'power' }).state; // 2 points left
  assert.deepEqual(legal(s).map((a) => a.id ?? a.type), ['look', 'serial', 'papers', 'conclude']);
  for (const a of legal(s)) assert.notEqual(act(s, a).say, null);
});

test('more probes, lower expected error (condition and counterfeit)', () => {
  const plans = [[], ['look'], ['look', 'papers'], ['look', 'papers', 'power']];
  const qerr = plans.map((ids) => mean(Array.from({ length: N }, (_, i) => { const p = lot(i, { budget: 20 }); return Math.abs(result(play(p, ids)).estimate.quality - p.truth.quality); })));
  for (let i = 1; i < qerr.length; i++) assert.ok(qerr[i] < qerr[i - 1], `condition error should fall with each probe: ${qerr.map((x) => x.toFixed(3))}`);
  const fplans = [[], ['look'], ['look', 'papers'], ['look', 'papers', 'serial']];
  const brier = fplans.map((ids) => mean(Array.from({ length: N }, (_, i) => { const p = lot(i, { budget: 20 }); return (result(play(p, ids)).estimate.fakeProb - (p.truth.fake ? 1 : 0)) ** 2; })));
  for (let i = 1; i < brier.length; i++) assert.ok(brier[i] < brier[i - 1], `counterfeit error should fall with each probe: ${brier.map((x) => x.toFixed(3))}`);
});

test('serial finds fakes best, power finds condition best', () => {
  const ids = Object.keys(PROBES), M = 3000;
  const sep = {}, rms = {};
  for (const id of ids) {
    const fake = [], real = [], err = [];
    for (let i = 0; i < M; i++) {
      const p = lot(i, { budget: 20, truth: { ...lot(i).truth, fake: i % 2 === 0 } }), s = play(p, [id]);
      (p.truth.fake ? fake : real).push(result(s).estimate.fakeProb);
      err.push(s.evidence[0].reading - p.truth.quality);
    }
    sep[id] = mean(fake) - mean(real); rms[id] = Math.sqrt(mean(err.map((e) => e * e)));
  }
  for (const id of ids) if (id !== 'serial') assert.ok(sep.serial > sep[id], `serial should separate fakes best, got ${JSON.stringify(sep)}`);
  for (const id of ids) if (id !== 'power') assert.ok(rms.power < rms[id], `power should read condition best, got ${JSON.stringify(rms)}`);
  assert.ok(sep.serial / PROBES.serial.cost > sep.expert / PROBES.expert.cost, 'and serial is far cheaper per point than the expert');
  assert.ok(sep.look < sep.papers, 'look is cheap and shallow: papers say more about provenance');
  assert.ok(rms.look < rms.serial, 'but a look at least beats a serial number for condition');
});

test('accuracy lowers the noise, except for the expert, who is the same for everyone', () => {
  const rmsOf = (id, accuracy) => Math.sqrt(mean(Array.from({ length: 2000 }, (_, i) => { const p = lot(i, { budget: 20, accuracy }); return (play(p, [id]).evidence[0].reading - p.truth.quality) ** 2; })));
  assert.ok(rmsOf('power', 0.9) < rmsOf('power', 0.5) && rmsOf('power', 0.5) < rmsOf('power', 0.1));
  assert.ok(Math.abs(rmsOf('expert', 0.9) - rmsOf('expert', 0.1)) < 0.006, 'the expert ignores your accuracy');
  assert.ok(rmsOf('expert', 0.1) < rmsOf('power', 0.1), 'with poor Ops, the dear expert is the better read');
  assert.ok(rmsOf('power', 0.9) < rmsOf('expert', 0.9), 'with good Ops, do it yourself');
});

test('fakeDetect (Second-Chance) raises detection and gives a free warning', () => {
  const M = 3000, run = (fakeDetect, ids) => {
    const fake = [], real = [], warned = [];
    for (let i = 0; i < M; i++) {
      const p = lot(i, { budget: 20, fakeDetect, truth: { ...lot(i).truth, fake: i % 2 === 0 } }), s = play(p, ids);
      (p.truth.fake ? fake : real).push(result(s).estimate.fakeProb); warned.push(s.warning);
    }
    return { gap: mean(fake) - mean(real), hit: mean(fake), warned };
  };
  for (const ids of [[], ['look'], ['serial']]) {
    const off = run(false, ids), on = run(true, ids);
    assert.ok(on.gap > off.gap, `fakeDetect should widen the gap with probes ${ids}: ${off.gap.toFixed(3)} vs ${on.gap.toFixed(3)}`);
    assert.ok(on.hit > off.hit, 'and push fakeProb higher on real counterfeits');
    assert.ok(off.warned.every((w) => w === null) && on.warned.every((w) => typeof w === 'string' && w.length > 10), 'a free warning only with fakeDetect');
  }
});

test('fakeDetect also sharpens every probe, not only the opening warning', () => {
  // what one serial-number check adds to the log-odds of "fake": the gap between a counterfeit and a genuine lot should widen
  const gap = (fakeDetect) => {
    const fake = [], real = [];
    for (let i = 0; i < 2000; i++) {
      const p = lot(i, { budget: 20, fakeDetect, truth: { ...lot(i).truth, fake: i % 2 === 0 } }), before = create(p), after = act(before, { type: 'probe', id: 'serial' }).state;
      (p.truth.fake ? fake : real).push(after.odds - before.odds);
    }
    return mean(fake) - mean(real);
  };
  assert.ok(gap(true) > gap(false) * 1.8, `${gap(true).toFixed(2)} vs ${gap(false).toFixed(2)}`);
});

test('defects are named when found, never when not; the expert finds the most', () => {
  const found = (id) => mean(Array.from({ length: 800 }, (_, i) => { const p = lot(i, { budget: 20, truth: { quality: 0.9, fake: false, defects: POOL } }); return result(play(p, [id])).defects.length; }));
  assert.ok(found('expert') > found('power') && found('power') > found('look') && found('look') > found('serial'));
  const p = lot(1, { truth: { quality: 0.9, fake: false, defects: POOL } }), s = play(p, ['expert']), r = result(s);
  for (const label of r.defects) assert.ok(POOL.some((d) => d.label === label));
  assert.deepEqual(view(s).found, r.defects);
  assert.ok(s.evidence[0].text.length > 20 && Array.isArray(view(s).evidence));
});

test('an informed buyer (budget 6) makes better buy decisions than an uninformed one', () => {
  const D = 100, junk = 0.1; // described value 100; a counterfeit is worth 10
  const worth = (t) => (t.fake ? junk : t.quality) * D;
  const profit = (autoSkill) => {
    let total = 0;
    for (let i = 0; i < 800; i++) {
      const p = lot(i, { budget: autoSkill === null ? 0 : 6 }), price = D * (0.55 + 0.5 * new RNG(i + 5).next());
      const e = (autoSkill === null ? autoplay(p, 0) : autoplay(p, autoSkill)).estimate;
      const ev = (1 - e.fakeProb) * e.quality * D + e.fakeProb * junk * D;
      if (ev > price) total += worth(p.truth) - price; // buy if the expected value after the estimate exceeds the price
    }
    return total;
  };
  const blind = profit(null), informed = profit(1), typical = profit(0.5);
  assert.ok(informed > blind, `informed ${informed.toFixed(0)} should beat uninformed ${blind.toFixed(0)}`);
  assert.ok(informed > blind + 800, 'by a clear margin per lot (more than a dollar a lot on a $100 good)');
  assert.ok(informed > typical && typical > blind, 'and the skill gradient holds: expert > typical > blind');
});

test('autoplay: log, bounds, and skill ordering', () => {
  const r = autoplay(lot(2), 0.5);
  assert.equal(r.done, true);
  assert.ok(Array.isArray(r.log) && r.log.length > 0 && r.log.every((l) => l.action && typeof l.say === 'string'));
  assert.equal(autoplay(lot(2), 0).spent, 0, 'a careless player buys no information');
  const score = (k) => mean(Array.from({ length: 400 }, (_, i) => autoplay(lot(i), k).score));
  const s0 = score(0), s5 = score(0.5), s1 = score(1);
  assert.ok(s0 < s5 && s5 < s1, `skill ordering ${s0.toFixed(3)} < ${s5.toFixed(3)} < ${s1.toFixed(3)}`);
  for (let i = 0; i < 200; i++) {
    const x = autoplay(lot(i, { budget: i % 8, fakeDetect: i % 2 === 0 }), (i % 5) / 4);
    for (const v of [x.score, x.spent, x.confidence, x.estimate.quality, x.estimate.fakeProb]) assert.ok(Number.isFinite(v));
    assert.ok(x.score >= 0 && x.score <= 1 && x.confidence >= 0 && x.confidence <= 1 && x.spent <= (i % 8));
    assert.ok(x.estimate.quality >= 0.6 && x.estimate.quality <= 1.2 && x.estimate.fakeProb > 0 && x.estimate.fakeProb < 1);
  }
});

test('confidence grows with evidence, and an honest catch is recognised', () => {
  const p = lot(7, { budget: 20, truth: { quality: 0.9, fake: true, defects: [] } });
  const c = [[], ['look'], ['look', 'serial'], ['look', 'serial', 'power']].map((ids) => result(play(p, ids)).confidence);
  for (let i = 1; i < c.length; i++) assert.ok(c[i] > c[i - 1], `confidence ${c}`);
  const done = act(play(p, ['serial', 'expert']), { type: 'conclude' }).state;
  assert.equal(result(done).fake, true);
  assert.equal(result(done).caught, true);
  assert.ok(result(done).score > 0.6);
});

test('bad parameters are tamed instead of throwing', () => {
  const s = create({ truth: { quality: NaN, fake: 'yes', defects: [null, { id: 3 }] }, budget: -4, accuracy: 9, seed: 'x' });
  assert.equal(s.budget, 0);
  assert.equal(s.done, true);
  assert.ok(Number.isFinite(result(s).estimate.quality));
  assert.doesNotThrow(() => autoplay({}, 0.3));
});
