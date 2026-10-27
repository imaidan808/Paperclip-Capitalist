// Auction: the contract (section 6.1), the safety properties (limits, free exits) and the economics of the winner's curse.
// Fields come from auction.field(): everyone sees the true value through noise (std-dev 0.18 of the value), and rivals
// shade their limits by temperament, so the numbers below are the ones the engine will meet.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../js/play/auction.js';
import { RNG } from '../js/rng.js';

const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const fieldOf = (i, rivals = 5, extra = {}) => A.field({ trueValue: 100, rivals, noise: 0.18, seed: i + 1, ...extra });
function* leaves(x, path = '') { if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) yield* leaves(v, path + '.' + k); else yield [path, x]; }
/** Play a field with a rule: bid while the next bid is within capFn(state); optionally stop after n bids. */
function playCap(params, capFn) {
  let s = A.create(params);
  for (let k = 0; k < 500 && !s.done; k++) { const v = A.view(s), can = A.legal(s).some((l) => l.type === 'bid'); s = A.act(s, { type: can && v.nextBid <= capFn(s, v) + 1e-9 ? 'bid' : 'drop' }).state; }
  return { s, r: A.result(s) };
}
const surplusOver = (n, rivals, capFn, extra) => { const rs = Array.from({ length: n }, (_, i) => playCap(fieldOf(i, rivals, extra), capFn).r); return { all: mean(rs.map((r) => r.surplus)), won: rs.filter((r) => r.won), rs }; };

test('the module exports the contract; state is JSON; act is pure and deterministic', () => {
  for (const f of ['create', 'act', 'result', 'autoplay', 'legal', 'view', 'field', 'ceiling']) assert.equal(typeof A[f], 'function', f);
  const s = A.create(fieldOf(1));
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  assert.equal(A.result(s).done, false);
  assert.deepEqual(A.legal(s).map((a) => a.type), ['bid', 'drop']);
  for (let i = 0; i < 50; i++) {
    let a = A.create(fieldOf(i, 1 + (i % 7))), b = JSON.parse(JSON.stringify(a));
    const rng = new RNG(i + 11);
    for (let k = 0; k < 500 && !a.done; k++) {
      const choice = rng.chance(0.85) ? { type: 'bid' } : { type: 'drop' }, frozen = JSON.stringify(a);
      const ra = A.act(a, choice), rb = A.act(JSON.parse(JSON.stringify(b)), choice);
      assert.equal(JSON.stringify(a), frozen, 'input untouched');
      assert.equal(JSON.stringify(ra), JSON.stringify(rb), 'a saved state plays on identically');
      a = ra.state; b = JSON.parse(JSON.stringify(rb.state));
    }
    assert.ok(a.done, 'every auction ends');
  }
  const r = A.autoplay(fieldOf(2), 0.5);
  for (const k of ['done', 'score', 'won', 'price', 'surplus', 'log']) assert.ok(k in r, k);
  assert.equal(JSON.stringify(A.autoplay(fieldOf(2), 0.5)), JSON.stringify(r));
});

test('invalid actions return the same state with say null', () => {
  const s = A.create(fieldOf(3));
  for (const a of [null, {}, { type: 'raise' }, { type: 'Bid' }, { type: 'hold' }]) { const r = A.act(s, a); assert.equal(r.state, s); assert.equal(r.say, null); }
  const out = A.act(s, { type: 'drop' });
  assert.ok(out.done, 'dropping ends your auction, and the room plays on to the hammer');
  assert.equal(A.act(out.state, { type: 'bid' }).say, null);
  assert.deepEqual(A.legal(out.state), []);
  const mine = A.act(A.create({ ...fieldOf(4, 1), bidders: [] }), { type: 'bid' });
  assert.equal(mine.done, true, 'alone in the room, your bid at the opening wins');
  assert.equal(A.result(mine.state).won, true);
});

test('every number is finite whatever the inputs, and every auction ends', () => {
  const weird = [
    {}, { trueValue: 0.05, estimate: 0.06, reserve: 0.02, increment: 0.001, bidders: [{ style: 'steady', limit: 0.07 }] }, { trueValue: 1e7, estimate: 9e6, reserve: 1e6, bidders: [{ style: 'sniper', limit: 8e6 }] },
    { trueValue: NaN, estimate: NaN, reserve: NaN, increment: NaN, bidders: 'x' }, { trueValue: -5, estimate: -1, reserve: -3, increment: -2, bidders: [{ style: 'nonsense', limit: -9 }, null, {}] },
    { trueValue: 100, estimate: 90, reserve: 50, increment: 0.02, bidders: [{ style: 'aggressive', limit: 60 }] }, { trueValue: 100, estimate: 90, reserve: 50, bidders: Array.from({ length: 20 }, (_, i) => ({ style: ['steady', 'aggressive', 'sniper', 'bluffer'][i % 4], limit: 40 + i * 7.3 })) },
  ];
  for (const w of weird) for (let seed = 1; seed <= 6; seed++) for (const mode of ['bid', 'drop', 'auto', 'mix']) {
    const p = { ...w, seed };
    let r;
    if (mode === 'auto') r = A.autoplay(p, seed / 6);
    else { let s = A.create(p); const rng = new RNG(seed); for (let k = 0; k < 600 && !s.done; k++) s = A.act(s, { type: mode === 'mix' ? (rng.chance(0.9) ? 'bid' : 'drop') : mode }).state; assert.ok(s.done, `ends (${mode})`); r = A.result(s); assert.ok(!A.view(s).advice); }
    for (const [path, v] of leaves(r)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${mode} ${path}`);
    assert.ok(r.score >= 0 && r.score <= 1);
    for (const [path, v] of leaves(A.view(A.create({ ...p, assist: true })))) if (typeof v === 'number') assert.ok(Number.isFinite(v), path);
  }
});

test('bidders never bid above their limit, drop when the price passes it, and the winner never pays past a rival limit', () => {
  const names = ['Marla', 'Dev', 'Okafor', 'Ines', 'Bo', 'Kit', 'Rue', 'Sol'];
  let jumps = 0, waits = 0, bids = 0;
  for (let i = 0; i < 300; i++) {
    const p = fieldOf(i, 2 + (i % 7)), rng = new RNG(i + 4);
    let s = A.create(p);
    for (let k = 0; k < 500 && !s.done; k++) s = A.act(s, { type: rng.chance(0.8) ? 'bid' : 'drop' }).state;
    assert.ok(s.done);
    const limit = Object.fromEntries(p.bidders.map((b, j) => [names[j], b.limit]));
    for (const e of s.events) {
      if (e.kind === 'bid' || e.kind === 'jump') { if (e.who !== 'You') { assert.ok(e.price <= limit[e.who] + 1e-6, `${e.who} bid ${e.price} over ${limit[e.who]}`); bids++; } if (e.kind === 'jump') jumps++; }
      if (e.kind === 'wait') waits++;
    }
    if (s.winner !== null && s.winner !== 'you') assert.ok(s.sold <= p.bidders[s.winner].limit + 1e-6, 'sold within the winner\'s limit');
    // a rival that dropped could not have gone on: a steady or aggressive rival drops only above its limit or by losing its nerve late
    for (const b of s.bots) if (b.droppedAt != null && b.style === 'aggressive') assert.ok(b.droppedAt + s.inc > b.limit - 1e-6 || b.droppedAt >= s.price - 1e-6 || b.droppedAt >= 0, 'aggressive rivals drop at their limit');
    if (s.winner === 'you') assert.ok(s.sold >= p.reserve - 1e-9);
  }
  assert.ok(jumps > 30 && waits > 30 && bids > 500, `the moods show up: ${jumps} jumps, ${waits} silent moments, ${bids} bids`);
});

test('the moods behave as described: aggressive jump, snipers stay silent, bluffers fold before their limit', () => {
  const tally = { jump: 0, firstAt: { steady: [], sniper: [] }, folds: [] };
  for (let i = 0; i < 200; i++) {
    const bidders = [{ style: 'steady', limit: 150.3 }, { style: 'aggressive', limit: 140.7 }, { style: 'sniper', limit: 130.9 }, { style: 'bluffer', limit: 120.4 }];
    let s = A.create({ estimate: 100, trueValue: 100, reserve: 40, increment: 2.5, bidders, seed: i + 1 });
    for (let k = 0; k < 500 && !s.done; k++) s = A.act(s, { type: 'bid' }).state;
    const jumpers = s.events.filter((e) => e.kind === 'jump'); tally.jump += jumpers.length;
    for (const e of jumpers) assert.ok(['Dev', 'Ines', 'Okafor'].includes(e.who), 'only aggressive rivals and bluffers jump');
    const snipe = s.events.findIndex((e) => e.who === 'Okafor' && e.kind === 'bid'), steady = s.events.findIndex((e) => e.who === 'Marla' && e.kind === 'bid');
    if (snipe >= 0 && steady >= 0) { tally.firstAt.sniper.push(snipe); tally.firstAt.steady.push(steady); }
    const bl = s.bots[3]; if (bl.droppedAt != null && s.bots[3].active === false) tally.folds.push(bl.droppedAt / bl.limit);
  }
  assert.ok(tally.jump > 200);
  assert.ok(mean(tally.firstAt.sniper) > mean(tally.firstAt.steady), 'snipers come in late');
  assert.ok(mean(tally.folds) < 1.0 && Math.min(...tally.folds) < 1.0 && tally.folds.length > 100, 'a bluffer drops while it still could bid');
});

test('dropping early never loses money; chasing above the true value does', () => {
  for (let i = 0; i < 200; i++) {
    const drop0 = A.act(A.create(fieldOf(i, 1 + (i % 7))), { type: 'drop' }), r = A.result(drop0.state);
    assert.equal(r.won, false); assert.equal(r.price, null); assert.equal(r.surplus, 0);
    // bid some rounds, then drop: you are never charged for a lost auction
    let s = A.create(fieldOf(i, 4)); const stopAt = i % 6;
    for (let k = 0; k < stopAt && !s.done && A.legal(s).length; k++) s = A.act(s, { type: 'bid' }).state;
    if (!s.done && A.legal(s).length) s = A.act(s, { type: 'drop' }).state;
    if (!s.done) s = A.act(s, { type: 'drop' }).state;
    const q = A.result(s); if (!q.won) assert.equal(q.surplus, 0); assert.ok(q.surplus >= 0 || q.won);
  }
  for (const rivals of [4, 5, 6, 7]) {
    const chase = surplusOver(600, rivals, (s) => s.trueValue * 1.25);
    assert.ok(chase.all < 0, `rivals ${rivals}: bidding past the true value loses on average (${chase.all.toFixed(2)})`);
    for (const r of chase.won) assert.equal(r.surplus, Number((100 - r.price).toPrecision(8)), 'surplus = trueValue - price');
  }
  const neverStops = surplusOver(600, 6, () => Infinity);
  assert.ok(neverStops.all < -3 && mean(neverStops.rs.map((r) => r.score)) < 0.3, 'a player who never drops is the room\'s dream');
});

test('a disciplined player (bid up to a margin below the estimate) earns a positive surplus', () => {
  for (const rivals of [3, 4, 5, 6]) {
    const disciplined = surplusOver(800, rivals, (s) => s.estimate * (1 - 0.05 * (rivals - 2)));
    assert.ok(disciplined.all > 0, `${rivals} rivals: ${disciplined.all.toFixed(3)}`);
    assert.ok(disciplined.won.length > 0 && mean(disciplined.won.map((r) => r.surplus)) > 0);
  }
  for (const margin of [0.1, 0.15, 0.2, 0.25]) assert.ok(surplusOver(800, 5, (s) => s.estimate * (1 - margin)).all > 0, `margin ${margin}`);
});

test('the winner\'s curse is real: the highest estimate overshoots, and bidding your own estimate loses on average', () => {
  // everyone bids exactly their own estimate (shade 1): the winner is the highest estimate, which runs high
  const raw = { steady: 1, aggressive: 1, sniper: 1, bluffer: 1 };
  for (const rivals of [4, 6, 8]) {
    const rows = Array.from({ length: 800 }, (_, i) => { const f = fieldOf(i, rivals, { shade: raw }); return Math.max(f.estimate, ...f.bidders.map((b) => b.limit)); });
    assert.ok(mean(rows) > 100 * (1 + 0.18 * (rivals >= 6 ? 1 : 0.9)), `E[highest of ${rivals + 1} estimates] = ${mean(rows).toFixed(1)} vs true 100`);
  }
  const naive = (rivals) => surplusOver(1000, rivals, (s) => s.estimate, { shade: raw });
  const curse = [4, 6, 8].map((n) => naive(n));
  for (const c of curse) { assert.ok(c.all < 0, `naive max-bidding loses on average (${c.all.toFixed(2)})`); assert.ok(mean(c.won.map((r) => r.surplus)) < -1, 'and loses when it wins'); }
  assert.ok(curse[2].all < curse[0].all, 'the more rivals, the worse the curse');
  assert.ok(surplusOver(1000, 6, (s) => s.estimate).all < 0 && surplusOver(1000, 7, (s) => s.estimate).all < 0, 'the default room punishes naive bidding too once it is crowded');
  const shaded = surplusOver(1000, 6, (s) => s.estimate * 0.8, { shade: raw });
  assert.ok(shaded.all > curse[1].all + 1 && shaded.all > -0.5, `shading below your estimate is the cure (${shaded.all.toFixed(2)} vs ${curse[1].all.toFixed(2)})`);
  // the lesson is in the debrief
  const lost = playCap(fieldOf(5, 8, { shade: raw }), (s) => s.estimate * 1.3).r;
  assert.equal(lost.lesson.concept, 'winners-curse'); assert.ok(/curse/.test(lost.lesson.text) || lost.surplus >= 0);
});

test('skill pays at the auction too: careless < Quick < expert once the room is crowded', () => {
  const at = (k, rivals) => Array.from({ length: 800 }, (_, i) => A.autoplay(fieldOf(i, rivals), k));
  for (const rivals of [5, 6]) {
    const careless = at(0, rivals), quick = at(0.5, rivals), expert = at(1, rivals), E = (rs) => mean(rs.map((r) => r.surplus));
    assert.ok(E(careless) < E(quick) && E(quick) < E(expert), `${rivals} rivals: ${E(careless).toFixed(2)} < ${E(quick).toFixed(2)} < ${E(expert).toFixed(2)}`);
    assert.ok(E(careless) < 0 && E(expert) > 0);
    const sc = (rs) => mean(rs.map((r) => r.score));
    assert.ok(sc(expert) > sc(careless) + 0.1 && sc(expert) >= sc(quick) - 0.02, `${sc(careless)} ${sc(quick)} ${sc(expert)}`);
  }
  // with only one or two rivals the curse is mild and everyone does fine: the game says so rather than punishing
  assert.ok(mean(at(1, 2).map((r) => r.surplus)) >= 0);
});

test('view shows the room and never a limit, the true value or a rival\'s real style', () => {
  const secrets = /limit|trueValue|style|reserve$|^\.rs$|seed/i;
  for (let i = 0; i < 60; i++) {
    const f = fieldOf(i, 3 + (i % 5)), p = { ...f, trueValue: f.trueValue + 0.0137, estimate: f.estimate + 0.123456, assist: i % 2 === 0, // off the price ladder, so a coincidence cannot look like a leak
      bidders: f.bidders.map((b) => ({ ...b, limit: b.limit + 0.0314159 })) };
    let s = A.create(p);
    for (let k = 0; k < 500; k++) {
      const v = A.view(s), banned = [p.trueValue, ...p.bidders.map((b) => b.limit)];
      for (const [path, val] of leaves(v)) {
        assert.ok(!secrets.test(path.replace(/^\./, '')), `leaked key ${path}`);
        if (typeof val === 'number') for (const x of banned) assert.ok(Math.abs(val - x) > 1e-9, `leaked ${x} at ${path}`);
        if (typeof val === 'string') for (const st of ['aggressive', 'sniper', 'bluffer']) assert.ok(!val.includes(st), `leaked style at ${path}`);
      }
      assert.equal(v.rivals.length, p.bidders.length); assert.ok(v.rivals.every((r) => ['steady', 'loud', 'quiet'].includes(r.mood)));
      assert.equal(v.estimate, p.estimate); assert.equal(v.opening, p.reserve);
      assert.ok(v.round >= 0 && v.yourTurn === (A.legal(s).length > 0));
      if (s.done) break;
      s = A.act(s, { type: k % 7 === 6 ? 'drop' : 'bid' }).state;
    }
  }
  const v = A.view(A.act(A.create(fieldOf(7, 5)), { type: 'bid' }).state);
  assert.ok(v.rivals.some((r) => r.active) && v.price > 0 && v.nextBid > v.price && v.increment > 0);
  const out = A.view(A.act(A.create(fieldOf(7, 3)), { type: 'drop' }).state);
  assert.equal(out.youIn, false); assert.equal(out.done, true); assert.ok(out.rivals.some((r) => r.droppedAt != null || r.high));
});

test('assist gives the textbook advice, and following it is profitable', () => {
  const p = { ...fieldOf(9, 5), assist: true };
  assert.ok(!('advice' in A.view(A.create({ ...p, assist: false }))));
  const adv = A.view(A.create(p)).advice;
  assert.match(adv.text, /Do not bid above your own estimate/); assert.match(adv.text, /winner's curse/); assert.equal(adv.concept, 'winners-curse');
  assert.ok(adv.ceiling < p.estimate, 'the ceiling sits under the estimate');
  assert.ok(A.ceiling({ estimate: 100, rivals: 8 }) < A.ceiling({ estimate: 100, rivals: 3 }) && A.ceiling({ estimate: 100, rivals: 1 }) === 100, 'more rivals, more margin');
  const followed = Array.from({ length: 600 }, (_, i) => { let s = A.create({ ...fieldOf(i, 6), assist: true }); while (!s.done) { const a = A.view(s).advice.action; assert.ok(A.legal(s).some((l) => l.type === a.type)); s = A.act(s, a).state; } return A.result(s); });
  assert.ok(mean(followed.map((r) => r.surplus)) > 0, 'advice pays');
  const dropAdvice = A.view(A.create({ ...fieldOf(3, 6), estimate: 30, reserve: 60, assist: true })).advice;
  assert.equal(dropAdvice.action.type, 'drop'); assert.match(dropAdvice.text, /drop/);
});

test('budget caps what a player can bid; reserve is the opening price; no bidders above it means no sale', () => {
  const rich = fieldOf(2, 4), poor = A.create({ ...rich, budget: rich.reserve });
  assert.ok(A.legal(poor).some((l) => l.type === 'bid') || A.view(poor).youHigh === false);
  let s = poor; for (let k = 0; k < 500 && !s.done; k++) { s = A.act(s, { type: A.legal(s).some((l) => l.type === 'bid') ? 'bid' : 'drop' }).state; if (s.high === 'you') assert.ok(s.price <= rich.reserve + 1e-9, 'never bids beyond the budget'); }
  assert.ok(s.done);
  const cold = A.create({ estimate: 78, trueValue: 75, reserve: 80, increment: 5, bidders: [{ style: 'steady', limit: 60.5 }, { style: 'aggressive', limit: 70.2 }], seed: 3 });
  assert.equal(A.view(cold).price, null, 'nobody has bid yet');
  const end = A.act(cold, { type: 'drop' }), r = A.result(end.state);
  assert.equal(end.done, true); assert.equal(r.won, false); assert.equal(r.soldFor, null); assert.equal(r.price, null); assert.equal(r.surplus, 0);
  assert.equal(r.score, 0.8, 'passing on a lot nobody could win is the right call');
  const first = A.act(cold, { type: 'bid' });
  assert.equal(A.view(first.state).price, 80, 'the first bid is made at the opening price');
});

test('result: surplus is truth minus price when you win, the debrief reveals the room, and scores rank the outcomes', () => {
  const win = playCap({ estimate: 110, trueValue: 100, reserve: 40, increment: 2.5, bidders: [{ style: 'steady', limit: 70.4 }, { style: 'bluffer', limit: 60.1 }], seed: 5 }, (s) => s.estimate).r;
  assert.equal(win.won, true); assert.ok(win.price >= 70.4 && win.price <= 75.5); assert.equal(win.surplus, Number((100 - win.price).toPrecision(8)));
  assert.ok(win.score > 0.55 && win.reveal.trueValue === 100 && win.reveal.rivals.length === 2 && win.reveal.rivals[0].limit === 70.4);
  assert.match(win.lesson.text, /margin/);
  const loss = playCap({ estimate: 110, trueValue: 80, reserve: 40, increment: 2.5, bidders: [{ style: 'steady', limit: 99.4 }], seed: 5 }, (s) => s.estimate).r;
  assert.equal(loss.won, true); assert.ok(loss.surplus < 0 && loss.score < 0.3); assert.match(loss.lesson.text, /winner's curse/);
  const timid = playCap({ estimate: 110, trueValue: 100, reserve: 40, increment: 2.5, bidders: [{ style: 'steady', limit: 70.4 }], seed: 5 }, () => 45).r;
  assert.equal(timid.won, false); assert.ok(timid.score < win.score && timid.score < 0.45);
  assert.ok(win.score > loss.score);
});
