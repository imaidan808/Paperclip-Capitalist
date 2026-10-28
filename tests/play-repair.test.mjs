// Repair (the Fix stage): a precision dial in three steps. Precision is money: better work costs less and returns more quality.
import test from 'node:test';
import assert from 'node:assert/strict';
import { create, act, result, autoplay, legal, view, pos, zoneHalf, markerAt, STEPS } from '../js/play/repair.js';

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
/** The first time (ms) after `from` that the marker of step `n` is within `tol` of `target`. */
function findT(n, seed, target, from = 0, tol = 0.002) {
  for (let t = from; t < from + 30000; t++) if (Math.abs(pos(t, n, seed) - target) < tol) return t;
  throw new Error('marker never reaches ' + target);
}
/** Play all three steps, stopping each when the marker reads `aim` (0.5 = dead center, 0 / 1 = as far from the sweet spot as it goes). */
function playAt(params, aim) {
  let s = create(params);
  while (!s.done) s = act(s, { type: 'stop', t: findT(s.step, s.seed, aim, 500, aim === 0.5 ? 0.002 : 0.03) }).state;
  return s;
}

test('the API surface exists; three steps; a fresh game is well formed', () => {
  const s = create({ ops: 5, seed: 1 });
  for (const f of [create, act, result, autoplay, legal, view, pos]) assert.equal(typeof f, 'function');
  assert.equal(STEPS, 3);
  assert.equal(s.done, false);
  assert.equal(view(s).steps, 3);
  assert.equal(result(s).done, false);
  assert.ok(legal(s).some((a) => a.type === 'stop') && legal(s).some((a) => a.type === 'careful'));
});

test('pos(t) is continuous, smooth in speed, and always inside 0..1', () => {
  let worst = 0, lo = 1, hi = 0;
  for (let seed = 0; seed < 30; seed++) for (let n = 0; n < 3; n++) {
    let prev = pos(0, n, seed);
    for (let t = 1; t <= 12000; t += 1) {
      const x = pos(t, n, seed);
      assert.ok(x >= 0 && x <= 1 && Number.isFinite(x), `pos out of range ${x}`);
      worst = Math.max(worst, Math.abs(x - prev)); lo = Math.min(lo, x); hi = Math.max(hi, x); prev = x;
    }
  }
  assert.ok(worst < 0.0015, `no jumps: the largest move in one ms is ${worst}`);
  assert.ok(lo < 0.15 && hi > 0.85, 'the marker uses the whole dial');
  assert.ok(Number.isFinite(pos(NaN)) && Number.isFinite(pos(Infinity, 1, 3)) && pos(-500, 2, 9) >= 0, 'odd times are tamed');
});

test('pos differs per step and per seed, deterministically, and later steps move faster', () => {
  const trace = (n, seed) => Array.from({ length: 40 }, (_, i) => pos(i * 150, n, seed));
  assert.deepEqual(trace(1, 5), trace(1, 5));
  assert.notDeepEqual(trace(0, 5), trace(1, 5));
  assert.notDeepEqual(trace(1, 5), trace(1, 6));
  const speed = (n) => mean(Array.from({ length: 20 }, (_, seed) => { let tot = 0; for (let t = 0; t < 8000; t += 10) tot += Math.abs(pos(t + 10, n, seed) - pos(t, n, seed)); return tot; }));
  assert.ok(speed(0) < speed(1) && speed(1) < speed(2), `each step is quicker than the last: ${[0, 1, 2].map(speed).map((x) => x.toFixed(2))}`);
  assert.equal(markerAt(create({ ops: 3, seed: 77 }), 1234), pos(1234, 0, 77));
});

test('perfect timing beats missing', () => {
  const perfect = playAt({ ops: 5, seed: 3 }, 0.5), miss = playAt({ ops: 5, seed: 3 }, 0.0);
  const p = result(perfect), m = result(miss);
  assert.ok(p.precision > 0.9 && m.precision < 0.02, `${p.precision} vs ${m.precision}`);
  assert.ok(p.qualityMult > m.qualityMult + 0.2 && p.costMult < m.costMult - 0.3);
  assert.ok(p.score > m.score && p.done && m.done);
  // and it works step by step, with the buyer's say telling you which way you missed
  let s = create({ ops: 5, seed: 3 });
  const hit = act(s, { type: 'stop', t: findT(0, 3, 0.5) });
  assert.ok(hit.state.steps[0].acc > 0.97);
  assert.match(hit.say, /Dead center/);
  const low = act(s, { type: 'stop', t: findT(0, 3, 0.05) }), high = act(s, { type: 'stop', t: findT(0, 3, 0.95) });
  assert.match(low.say, /Missed the zone/);
  assert.match(low.say, /low side/);
  assert.match(high.say, /high side/);
});

test('the step accuracy is 1 at the center, falls to 0 at the zone edge and stays 0 beyond', () => {
  const half = zoneHalf(5), s = create({ ops: 5, seed: 8 });
  const acc = (target) => act(s, { type: 'stop', t: findT(0, 8, target, 0, 0.0008) }).state.steps[0].acc;
  assert.ok(acc(0.5) > 0.99);
  assert.ok(Math.abs(acc(0.5 + half / 2) - 0.5) < 0.03, 'half way to the edge is half marks');
  assert.ok(Math.abs(acc(0.5 - half / 2) - 0.5) < 0.03, 'and it is symmetrical');
  assert.ok(acc(0.5 + half + 0.02) === 0 && acc(0.5 - half - 0.02) === 0);
  assert.deepEqual(view(s).zone, { lo: 0.5 - half, hi: 0.5 + half, half });
});

test('assist widens the zone and a higher Ops widens it too; difficulty narrows it', () => {
  const half = (p) => view(create({ seed: 1, ...p })).zone.half;
  assert.ok(half({ ops: 5, assist: true }) > half({ ops: 5 }) * 1.4);
  for (let ops = 1; ops < 10; ops++) assert.ok(half({ ops: ops + 1 }) > half({ ops }), `ops ${ops + 1} wider than ${ops}`);
  assert.ok(half({ ops: 5, difficulty: 2 }) < half({ ops: 5 }) && half({ ops: 5, difficulty: 0.5 }) > half({ ops: 5 }));
  assert.ok(half({ ops: 1, difficulty: 3 }) >= 0.03 && half({ ops: 10, assist: true, difficulty: 0.25 }) <= 0.45);
  // the same stop scores better with a wider zone
  const t = findT(0, 4, 0.58);
  const acc = (p) => act(create({ seed: 4, ...p }), { type: 'stop', t }).state.steps[0].acc;
  assert.ok(acc({ ops: 5, assist: true }) > acc({ ops: 5 }) && acc({ ops: 8 }) > acc({ ops: 5 }) && acc({ ops: 5 }) > acc({ ops: 2 }));
  assert.ok(acc({ ops: 5, difficulty: 2 }) < acc({ ops: 5 }));
});

test('careful is deterministic: a guaranteed 50% at the top price, no dial needed', () => {
  const seen = new Set();
  for (const p of [{ ops: 1, seed: 1 }, { ops: 10, seed: 99, assist: true }, { ops: 5, seed: 7, difficulty: 3 }]) {
    const s = create({ ...p, careful: true }), r = result(s);
    assert.equal(s.done, true);
    assert.equal(r.done, true);
    seen.add(JSON.stringify([r.precision, r.qualityMult, r.costMult, r.score]));
    assert.equal(act(s, { type: 'stop', t: 100 }).say, null, 'nothing left to do');
    assert.equal(autoplay({ ...p, careful: true }, 1).precision, 0.5);
  }
  assert.equal(seen.size, 1, 'the same for every Ops, seed, assist and difficulty');
  const r = result(create({ careful: true, ops: 3 }));
  assert.deepEqual([r.precision, r.costMult], [0.5, 1.3]);
  assert.ok(Math.abs(r.qualityMult - 1.0) < 1e-12);
});

test('careful can also be chosen mid-game: the steps already played keep their score', () => {
  let s = act(create({ ops: 5, seed: 3 }), { type: 'stop', t: findT(0, 3, 0.5) }).state;
  const r = act(s, { type: 'careful' });
  assert.equal(r.done, true);
  assert.deepEqual(r.state.steps.map((x) => x.careful), [false, true, true]);
  const res = result(r.state);
  assert.ok(res.precision > 0.5 && res.precision < 0.75);
  assert.ok(res.costMult > 1.1 && res.costMult <= 1.3 && res.careful);
  assert.match(r.say, /Repair done/);
  // before the end, the result is the floor you are already guaranteed
  assert.ok(Math.abs(result(create({ ops: 5, seed: 3 })).precision - 0.5) < 1e-12);
});

test('outcomes stay inside the bounds, and precision is money', () => {
  for (let i = 0; i < 300; i++) {
    const r = autoplay({ ops: 1 + (i % 10), difficulty: [0.5, 1, 2][i % 3], assist: i % 2 === 0, seed: i }, (i % 7) / 6);
    assert.ok(r.qualityMult >= 0.85 && r.qualityMult <= 1.15 && r.costMult >= 0.9 && r.costMult <= 1.3 && r.score >= 0 && r.score <= 1, JSON.stringify(r));
    assert.ok(Math.abs(r.qualityMult - (0.85 + 0.3 * r.precision)) < 1e-12 && Math.abs(r.costMult - (1.3 - 0.4 * r.precision)) < 1e-12, 'the suggested formulas');
    for (const v of [r.precision, r.qualityMult, r.costMult, ...r.steps]) assert.ok(Number.isFinite(v));
  }
  const worst = result(playAt({ ops: 5, seed: 2 }, 0)), best = result(playAt({ ops: 5, seed: 2 }, 0.5)), careful = result(create({ careful: true }));
  assert.ok(best.qualityMult > careful.qualityMult && careful.qualityMult > worst.qualityMult);
  assert.ok(best.costMult < careful.costMult && Math.abs(worst.costMult - careful.costMult) < 0.03, 'careful costs what a total miss costs, but buys a sound repair');
  assert.ok(best.qualityMult > 1.14 && best.costMult < 0.92);
});

test('autoplay: skill 0 below 0.3, skill 0.5 about 0.5, skill 1 above 0.85', () => {
  const at = (k, p = {}) => mean(Array.from({ length: 400 }, (_, i) => autoplay({ ops: 5, seed: i + 1, ...p }, k).precision));
  const s0 = at(0), s5 = at(0.5), s1 = at(1);
  assert.ok(s0 < 0.3, `careless ${s0.toFixed(3)}`);
  assert.ok(s5 > 0.42 && s5 < 0.62, `typical ${s5.toFixed(3)}`);
  assert.ok(s1 > 0.85, `expert ${s1.toFixed(3)}`);
  assert.ok(at(0.25) > s0 && at(0.75) > s5 && at(0.75) < s1);
  // the same player does better with more Ops or assist, and worse on a hard job
  assert.ok(at(0.5, { ops: 9 }) > s5 && s5 > at(0.5, { ops: 2 }));
  assert.ok(at(0.5, { assist: true }) > s5 + 0.1 && at(0.5, { difficulty: 2 }) < s5);
  assert.ok(at(1, { ops: 1 }) > 0.8, 'even Ops 1 gets a good result from an expert hand');
});

test('autoplay logs every move with a line of feedback and ends done', () => {
  const r = autoplay({ ops: 4, seed: 12 }, 0.6);
  assert.equal(r.done, true);
  assert.equal(r.log.length, 3);
  for (const [i, l] of r.log.entries()) { assert.equal(l.action.type, 'stop'); assert.ok(Number.isFinite(l.action.t) && l.action.t >= 0); assert.equal(typeof l.say, 'string'); assert.ok(l.say.length > 20, `step ${i}`); }
  assert.match(r.log[2].say, /Repair done at \d+% precision/);
  assert.deepEqual(autoplay({ ops: 4, seed: 12 }, 0.6), r, 'deterministic');
});

test('state is plain JSON, a round trip plays identically, and act never mutates its input', () => {
  let a = deepFreeze(create({ ops: 6, assist: true, seed: 21 })), b = JSON.parse(JSON.stringify(a));
  assert.deepEqual(a, b);
  for (const n of [0, 1, 2]) {
    const t = findT(n, 21, 0.47 + n * 0.02, 600);
    const ra = act(a, { type: 'stop', t }), rb = act(b, { type: 'stop', t });
    assert.deepEqual(ra, rb);
    a = deepFreeze(ra.state); b = JSON.parse(JSON.stringify(rb.state));
  }
  assert.deepEqual(result(a), result(b));
  assert.equal(a.done, true);
});

test('invalid actions return the same state with say null', () => {
  const s = create({ ops: 5, seed: 2 });
  const bad = [null, undefined, {}, { type: 'stop' }, { type: 'stop', t: -1 }, { type: 'stop', t: NaN }, { type: 'stop', t: Infinity }, { type: 'stop', t: '500' }, { type: 'wait', t: 5 }, 'stop'];
  for (const a of bad) { const r = act(s, a); assert.equal(r.state, s); assert.equal(r.say, null); assert.equal(r.done, false); }
  const done = playAt({ ops: 5, seed: 2 }, 0.5);
  const late = act(done, { type: 'stop', t: 100 });
  assert.equal(late.state, done);
  assert.equal(late.say, null);
  assert.equal(late.done, true);
  assert.deepEqual(legal(done), []);
  for (const a of legal(s)) assert.notEqual(act(s, a).say, null);
});

test('view shows the zone, the step and what the UI needs to draw the dial, and nothing else', () => {
  let s = create({ ops: 5, assist: true, seed: 5 });
  const v = view(s);
  assert.deepEqual(Object.keys(v).sort(), ['assist', 'careful', 'done', 'kind', 'name', 'ops', 'results', 'seed', 'step', 'steps', 'zone']);
  assert.equal(v.name, 'Strip and clean');
  assert.equal(pos(777, v.step, v.seed), markerAt(s, 777));
  s = act(s, { type: 'stop', t: findT(0, 5, 0.5) }).state;
  assert.equal(view(s).step, 1);
  assert.equal(view(s).name, 'Fit and tighten');
  assert.equal(view(s).results.length, 1);
  assert.equal(pos(777, view(s).step, view(s).seed), markerAt(s, 777), 'the dial changes with the step');
  assert.equal(view(playAt({ ops: 5, seed: 5 }, 0.5)).name, null);
  assert.equal(JSON.stringify(view(s)), JSON.stringify(JSON.parse(JSON.stringify(view(s)))));
});

test('odd parameters are tamed', () => {
  const s = create({ ops: 99, difficulty: -3, seed: 'abc', assist: 1 });
  assert.equal(s.ops, 10);
  assert.ok(Number.isFinite(s.half) && s.half >= 0.03 && s.half <= 0.45);
  assert.doesNotThrow(() => autoplay({}, 0.5));
  assert.equal(autoplay({}, 0.5).done, true);
  assert.ok(Number.isFinite(autoplay({ ops: NaN }, NaN).precision));
});
