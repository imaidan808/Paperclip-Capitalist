// Regression tests for the audit of the mini-games and the Deal Room glue (js/play/haggle.js, auction.js, inspect.js, js/deal.js).
// Each test names the finding it closes (n and id from the audit) and fails on the commit before the fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './bot.mjs';
import { ASSETS } from '../js/config.js';
import * as D from '../js/deal.js';
import * as H from '../js/play/haggle.js';
import * as A from '../js/play/auction.js';
import * as I from '../js/play/inspect.js';
import { RNG } from '../js/rng.js';

const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

/** A game with districts 2-4 and 6 open and a lot of cash, plus a crate of each class that sells. */
function world(perks = ['grad', 'roots'], seed = 7, cash = 1e6) {
  const g = makeGame(perks, 'ops', seed);
  for (const z of [2, 3, 4, 6]) g._openZone(z);
  g.s.cash = cash;
  for (const z of g.s.zones) for (const cls of Object.keys(ASSETS).filter((c) => (ASSETS[c].dem?.[z] || 0) >= 4).slice(0, 3)) g.s.assets.push(g._mk(g.s, cls, { zone: z, basis: 1 }));
  return g;
}
const run = (g, spec, opts) => { const r = D.startRun(g, spec, opts); assert.ok(r.ok, r.msg); return r; };
const fixedLot = (g, zone = 4) => g.s.lots[zone].find((l) => l.mode === 'fixed');
const brokenCrate = (g) => { const a = g.s.assets.find((x) => ASSETS[x.cls].repair); a.cond = 'broken'; return a; };

// ------------------------------------------------------------------ games: haggle
function hp(i, style, o = {}) {
  const rng = new RNG(i * 7919 + 13), r = 1.25 + 0.2 * rng.next(), role = o.role || 'sell';
  return { role, fair: 100, reserve: role === 'sell' ? 100 * r : 100 * (2 - r), style, patience: 3 + (i % 5), insight: o.insight ?? 3, alt: o.alt ?? null, seed: i + 1000 };
}

test('F3 (#58): the read\'s width does not depend on the hidden limit, so it cannot be turned back into the limit', () => {
  for (const role of ['sell', 'buy']) for (let insight = 0; insight <= 5; insight++) {
    const widths = [];
    for (const reserve of [70, 85, 100, 110, 125, 140, 160]) {
      const v = H.view(H.create({ role, fair: 100, reserve, style: 'friendly', insight, seed: 77 }));
      widths.push(v.read.hi - v.read.lo);
    }
    assert.ok(Math.max(...widths) - Math.min(...widths) < 1e-3, `${role} insight ${insight}: widths ${widths}`); // (the old width was 2 x the half-width x the limit: 20 points apart here)
  }
  // and the width still tightens with insight, and the read still holds the limit
  const w = (insight) => { const v = H.view(H.create({ role: 'sell', fair: 100, reserve: 130, style: 'hard', insight, seed: 5 })); return v.read.hi - v.read.lo; };
  for (let i = 1; i <= 5; i++) assert.ok(w(i) < w(i - 1));
  for (let i = 0; i < 100; i++) { const v = H.view(H.create({ ...hp(i, 'friendly'), insight: i % 6 })); assert.ok(v.read.lo < Math.min(140, Math.max(60, hp(i, 'friendly').reserve)) && Math.min(140, Math.max(60, hp(i, 'friendly').reserve)) < v.read.hi); }
});

test('F7 (#60): the haggle score tells Quick from an expert for every temperament, and never saturates', () => {
  for (const role of ['sell', 'buy']) for (const style of H.STYLES) {
    const at = (k) => Array.from({ length: 250 }, (_, i) => H.autoplay(hp(i, style, { role }), k)), quick = at(0.5), expert = at(1);
    assert.ok(mean(expert.map((r) => r.score)) > mean(quick.map((r) => r.score)) + 0.05, `${role} ${style}: expert ${mean(expert.map((r) => r.score))} vs quick ${mean(quick.map((r) => r.score))}`);
    for (const [name, rs] of [['quick', quick], ['expert', expert]]) assert.ok(rs.filter((r) => r.score >= 0.999).length / rs.length < 0.05, `${role} ${style} ${name}: most closes read exactly 1`);
    assert.ok(quick.filter((r) => r.score >= 0.95).length === 0, 'Quick is never close to full marks');
  }
  // the scenario of the audit: an impulsive buyer with a 130 limit and patience 7. Plain "anchor fair and accept" (1.00 x fair) and a low anchor are not full marks.
  const p = { role: 'sell', fair: 100, reserve: 130, style: 'impulsive', patience: 7, insight: 3, seed: 1000 };
  const plain = H.result(H.act(H.act(H.create(p), { type: 'anchor', level: 'fair' }).state, { type: 'accept' }).state), expert = H.autoplay(p, 1);
  assert.ok(plain.deal && expert.deal && expert.mult > plain.mult);
  assert.ok(expert.score > plain.score + 0.05 && plain.score < 0.9, `plain ${plain.score} expert ${expert.score}`);
  const low = H.result(H.act(H.create(p), { type: 'anchor', level: 'low' }).state);
  assert.ok(low.deal && low.score < 0.4, `a low anchor closed at ${low.mult} scored ${low.score}`);
});

test('F9 (#61): in the buy role a generous opening is generous, whatever the seller\'s temperament', () => {
  // the analytical seller used to hear a GENEROUS offer as a low-ball: suspicion flag, "what is wrong with it?", and a demand for more than was offered
  for (let seed = 1; seed <= 20; seed++) {
    const p = { role: 'buy', fair: 100, reserve: 80, style: 'analytical', patience: 5, insight: 3, seed };
    const open = H.act(H.create(p), { type: 'anchor', level: 'high' }), v = H.view(open.state);
    assert.equal(v.anchors.high, 130, 'for a buyer "high" says 130');
    assert.notEqual(v.flag, 'sus', 'a generous offer raises no suspicion');
    assert.ok(!/far under market|what is wrong/i.test(open.say), open.say);
    const done = open.done ? open.state : H.act(open.state, { type: 'accept' }).state, r = H.result(done);
    assert.ok(r.deal && r.price <= 130 + 1e-9, `the seller never asks for more than the 130 offered (paid ${r.price})`);
    assert.ok(!/low-ball|suspicious/i.test(r.lesson.text), r.lesson.text);
  }
  for (const style of H.STYLES) for (let seed = 1; seed <= 10; seed++) {
    const s = H.act(H.create({ role: 'buy', fair: 100, reserve: 80, style, patience: 5, insight: 3, seed }), { type: 'anchor', level: 'high' }).state;
    assert.notEqual(H.view(s).flag, 'sus', `${style}: generous is never suspicious`);
  }
  // the seller's frame is unchanged: an analytical BUYER still suspects a low ASK
  const sus = H.act(H.create({ role: 'sell', fair: 100, reserve: 130, style: 'analytical', patience: 5, insight: 3, seed: 2 }), { type: 'anchor', level: 'low' }).state;
  assert.equal(H.view(sus).flag, 'sus');
  // and an absurdly low offer from a buyer is still dismissed by an analytical seller (the mirror of "mad")
  assert.equal(H.view(H.act(H.create({ role: 'buy', fair: 100, reserve: 80, style: 'analytical', patience: 5, insight: 3, seed: 2 }), { type: 'anchor', level: 'low' }).state).flag, null, 'a 70 offer to a seller whose minimum is 80 is merely low');
  const tooLow = H.act(H.create({ role: 'buy', fair: 100, reserve: 110, style: 'analytical', patience: 5, insight: 3, seed: 2 }), { type: 'anchor', level: 'low' }).state;
  assert.equal(H.view(tooLow).flag, 'mad', 'an offer 40% under what they will take is dismissed');
});

test('F9 (#61): the lesson names the opening the player actually made', () => {
  const play = (p, level) => { let s = H.act(H.create(p), { type: 'anchor', level }).state; for (let i = 0; i < 12 && !s.done; i++) s = H.act(s, H.legal(s).find((l) => l.type === 'concede' && l.size === 'medium') || { type: 'accept' }).state; return H.result(s); };
  let said = 0;
  for (const style of ['hard', 'friendly', 'impulsive']) for (let seed = 1; seed <= 40; seed++) {
    const buyer = play({ role: 'buy', fair: 100, reserve: 85, style, patience: 7, insight: 3, seed }, 'low'), seller = play({ role: 'sell', fair: 100, reserve: 115, style, patience: 7, insight: 3, seed }, 'high');
    assert.ok(!/Your high opening/.test(buyer.lesson.text), `a buyer opened LOW: ${buyer.lesson.text}`);
    assert.ok(!/Your low opening/.test(seller.lesson.text), seller.lesson.text);
    if (/Your low opening set the frame/.test(buyer.lesson.text)) said++;
  }
  assert.ok(said > 0, 'the buyer\'s lesson can say "Your low opening set the frame."');
});

// ------------------------------------------------------------------ games: auction
test('F6 (#59): an auction budget of 0 is a real cap, not "unlimited"; only a missing budget means no cap', () => {
  const base = A.field({ trueValue: 100, rivals: 3, noise: 0.18, seed: 4 });
  for (const [budget, want] of [[undefined, null], [null, null], [NaN, null], [0, 0], [-25, 0], [30, 30]]) {
    const s = A.create({ ...base, budget }), v = A.view(s);
    assert.equal(v.budget, want, `budget ${budget}`);
    if (want === 0) assert.ok(!A.legal(s).some((a) => a.type === 'bid'), 'a player with no money cannot bid');
    if (want === null) assert.ok(A.legal(s).some((a) => a.type === 'bid'));
  }
  let s = A.create({ ...base, budget: 0 }), bids = 0;
  while (!s.done && bids < 50) { if (!A.legal(s).some((a) => a.type === 'bid')) { s = A.act(s, { type: 'drop' }).state; break; } s = A.act(s, { type: 'bid' }).state; bids++; }
  assert.equal(bids, 0); assert.equal(A.result(s).won, false);
});

test('F6 (#59): Assist never advises a bid the budget makes illegal', () => {
  let steps = 0, overBudget = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const f = A.field({ trueValue: 100, rivals: 1 + (seed % 5), seed });
    for (const budget of [0, 30, 45, 60, 75]) {
      let s = A.create({ ...f, budget, assist: true });
      for (let k = 0; k < 100 && !s.done; k++) {
        const v = A.view(s); if (!v.advice) break;
        steps++;
        assert.ok(A.legal(s).some((l) => l.type === v.advice.action.type), `budget ${budget} seed ${seed}: advice ${v.advice.action.type} next ${v.nextBid} legal ${JSON.stringify(A.legal(s))}`);
        if (v.nextBid > budget + 1e-9 && v.nextBid <= v.advice.ceiling) { overBudget++; assert.equal(v.advice.action.type, 'drop'); assert.match(v.advice.text, /budget/); }
        const r = A.act(s, v.advice.action); assert.notEqual(r.say, null, 'following the advice always moves'); s = r.state;
      }
    }
  }
  assert.ok(steps > 500 && overBudget > 0, `${steps} steps, ${overBudget} past the budget but inside the ceiling`);
});

// ------------------------------------------------------------------ the Deal Room: replay farming, free re-reads, walks
/** Does this engine pay a res.key once (contract e)? Detected from a scratch game, so the end-to-end tests below run against the real engine when it does
 *  and against a faithful stand-in for contract (e) when it does not yet. */
function engineDedupes() {
  const g = world(['grad', 'roots'], 3), lot = fixedLot(g);
  const xp0 = g.s.xp; g.recordInspect(4, lot.id, { estimate: { quality: 1, fakeProb: 0.1 }, score: 1, key: lot.id }); const a = g.s.xp - xp0;
  g.recordInspect(4, lot.id, { estimate: { quality: 1, fakeProb: 0.1 }, score: 1, key: lot.id });
  return g.s.xp - xp0 === a;
}
/** Contract (e) as a wrapper: a key pays once per game and kind, repeats are allowed and pay nothing. Applied only when the engine lacks it. */
function withOncePerKey(g) {
  if (engineDedupes()) return g;
  const seen = new Set(), ri = g.recordInspect.bind(g), rp = g.recordPlay.bind(g);
  g.recordInspect = (zone, id, res) => { const k = res?.key != null ? `inspect|${res.key}` : null; if (k && seen.has(k)) return { ok: true, msg: 'Recorded.' }; if (k) seen.add(k); return ri(zone, id, res); };
  g.recordPlay = (kind, res) => { const k = res?.key != null ? `${kind}|${res.key}` : null; if (k && seen.has(k)) return; if (k) seen.add(k); return rp(kind, res); };
  return g;
}

test('replay-farm (#27): every record carries the lot, lead or crate id as its key, the same on every visit', () => {
  const g = world(['grad', 'roots'], 21), lot = fixedLot(g), calls = [];
  const ri = g.recordInspect.bind(g), rp = g.recordPlay.bind(g);
  g.recordInspect = (zone, id, res) => { calls.push(['inspect', res.key]); return ri(zone, id, res); };
  g.recordPlay = (kind, res) => { calls.push([kind, res.key]); return rp(kind, res); };
  const r = run(g, { kind: 'buy', zone: 4, lotId: lot.id }); r.quickAll(); r.finish();
  assert.ok(calls.some(([k]) => k === 'inspect') && calls.some(([k]) => k === 'haggle'));
  for (const [kind, key] of calls) assert.equal(key, lot.id, `${kind} is keyed by the lot`);
  // selling: keyed by the lead; repair: by the crate
  const g2 = world(['grad', 'roots'], 23); let spec = null;
  for (const z of g2.s.zones) for (const lead of g2.s.leads[z]) for (const a of g2.s.assets.filter((x) => x.zone === z)) { const q = g2.quotePitch(a.id, lead.id); if (!spec && q.ok && q.fit >= 0.2 && !q.rejected) spec = { kind: 'sell', assetId: a.id, leadId: lead.id }; }
  const calls2 = [], rp2 = g2.recordPlay.bind(g2); g2.recordPlay = (kind, res) => { calls2.push([kind, res.key]); return rp2(kind, res); };
  const s = run(g2, spec); s.quickAll(); s.finish();
  assert.ok(calls2.length >= 1); for (const [kind, key] of calls2) assert.equal(key, spec.leadId, `${kind} is keyed by the lead`);
  const g3 = world(['grad', 'roots'], 25), b = brokenCrate(g3), calls3 = [], rp3 = g3.recordPlay.bind(g3); g3.recordPlay = (kind, res) => { calls3.push([kind, res.key]); return rp3(kind, res); };
  const f = run(g3, { kind: 'repair', assetId: b.id }); f.quickAll(); f.finish();
  assert.deepEqual(calls3, [['repair', b.id]]);
});

test('replay-farm (#27): fifteen visits to one counterfeit lot, and ten Quick haggles on one lot that is never bought, pay once and complete nothing', () => {
  const g = withOncePerKey(world(['grad', 'roots'], 31)), lot = fixedLot(g), events = [];
  lot.truth = { q: 0.9, fake: true, defects: [{ id: 'd0', label: 'worn finish' }] };
  g.onEvent = (e) => events.push(e);
  const xp0 = g.s.xp;
  for (let i = 0; i < 15; i++) { const r = run(g, { kind: 'buy', zone: 4, lotId: lot.id }); r.quickAll(); r.walkAway(); }
  assert.ok(g.s.lots[4].some((l) => l.id === lot.id), 'the lot is still on the shelf');
  assert.equal(events.filter((e) => e.type === 'inspect').length, 1, 'one read of one lot is one inspect event');
  assert.equal(events.filter((e) => e.type === 'haggle').length, 0, 'a haggle that ended in a walk is not a closed deal');
  assert.ok(g.s.xp - xp0 < 40, `xp ${g.s.xp - xp0} for fifteen visits of one lot`);
  assert.equal(g.s.meta.inspect.n, 1);
  assert.ok(!g.s.meta.haggle, 'no haggle was ever tallied');
});

test('replay-farm (#27): a lot read before and read again with nothing new to buy is not recorded as a new read, whatever the engine does with keys', () => {
  const g = world(['grad', 'roots'], 35), lot = fixedLot(g), events = [];
  g.onEvent = (e) => events.push(e.type);
  for (let i = 0; i < 15; i++) { const r = run(g, { kind: 'buy', zone: 4, lotId: lot.id }); r.quick(); r.walkAway(); }
  assert.equal(events.filter((t) => t === 'inspect').length, 1);
  assert.equal(g.s.meta.inspect.n, 1);
  // a visit that does buy a new probe is a new read (by hand: the first visit bought one probe and left without finishing)
  const g2 = world(['grad', 'roots'], 37), lot2 = fixedLot(g2), ev2 = [];
  g2.onEvent = (e) => ev2.push(e.type);
  const a = run(g2, { kind: 'buy', zone: 4, lotId: lot2.id }); a.act({ type: 'probe', id: 'look' }); // Leave: no finish, nothing recorded yet
  assert.equal(ev2.filter((t) => t === 'inspect').length, 0);
  const b = run(g2, { kind: 'buy', zone: 4, lotId: lot2.id }); b.walkAway(); // nothing new this time, but nothing was ever recorded: it counts once
  assert.equal(ev2.filter((t) => t === 'inspect').length, 1);
  const c = run(g2, { kind: 'buy', zone: 4, lotId: lot2.id }); c.walkAway();
  assert.equal(ev2.filter((t) => t === 'inspect').length, 1, 'and not again');
});

test('replay-farm (#27): a walk records no pitch, haggle, auction or repair, and never a haggle with deal: true', () => {
  const g = world(['grad', 'roots'], 33), events = [];
  g.onEvent = (e) => events.push(e);
  for (const lot of g.s.lots[4].concat(g.s.lots[6]).slice(0, 6)) { const r = run(g, { kind: 'buy', zone: lot.zone, lotId: lot.id }); r.quickAll(); r.walkAway(); }
  let spec = null;
  for (const z of g.s.zones) for (const lead of g.s.leads[z]) for (const a of g.s.assets.filter((x) => x.zone === z)) { const q = g.quotePitch(a.id, lead.id); if (!spec && q.ok && q.fit >= 0.2 && !q.rejected) spec = { kind: 'sell', assetId: a.id, leadId: lead.id }; }
  const s = run(g, spec); s.quickAll(); s.walkAway();
  const b = run(g, { kind: 'repair', assetId: brokenCrate(g).id }); b.quickAll(); b.walkAway();
  for (const t of ['haggle', 'auction', 'pitch', 'repair']) assert.equal(events.filter((e) => e.type === t).length, 0, `${t} events after walks`);
  assert.ok(!(g.s.meta?.haggle || g.s.meta?.auction || g.s.meta?.pitch || g.s.meta?.repair), 'nothing tallied');
});

test('free re-read (#27/E7): a lot remembers the probes paid for; the second Read shows the first run\'s evidence and the points already spent', () => {
  const g = world(['grad', 'roots'], 41), lot = fixedLot(g), spec = { kind: 'buy', zone: 4, lotId: lot.id };
  const r1 = run(g, spec), budget = r1.view().budget;
  assert.equal(r1.act({ type: 'probe', id: 'look' }).ok, true); assert.equal(r1.act({ type: 'probe', id: 'serial' }).ok, true);
  const first = r1.view(); r1.walkAway();
  const r2 = run(g, spec), v2 = r2.view();
  assert.deepEqual(v2.evidence, first.evidence, 'the same evidence, not a fresh roll');
  assert.equal(D.modelOf(r2).view.evidence.length, first.evidence.length, 'and the screen model carries it');
  assert.equal(v2.spent, first.spent); assert.equal(v2.left, budget - first.spent);
  assert.ok(v2.probes.find((p) => p.id === 'look').used && v2.probes.find((p) => p.id === 'serial').used);
  assert.equal(r2.act({ type: 'probe', id: 'look' }).ok, false, 'a probe paid for last time is not offered again');
  // leaving without finishing keeps the points too, and five visits can never buy more than the budget
  const g2 = world(['grad', 'roots'], 43), lot2 = fixedLot(g2), total = new Set();
  let spent = 0;
  for (let visit = 0; visit < 6; visit++) {
    const r = run(g2, { kind: 'buy', zone: 4, lotId: lot2.id }), v = r.view();
    for (const p of v.probes.filter((x) => x.affordable)) { r.act({ type: 'probe', id: p.id }); break; } // one probe a visit, then Leave (no finish at all)
    spent = r.view().spent; for (const p of r.view().probes.filter((x) => x.used)) total.add(p.id);
  }
  assert.ok(spent <= budget, `spent ${spent} of ${budget}`);
  assert.ok(total.size <= 5 && spent === [...total].reduce((n, id) => n + I.PROBES[id].cost, 0));
});

test('free re-read (#27/E7): Quick carries on from the lot\'s reading and pays for no probe twice; a second Quick gives the same estimate', () => {
  const g = world(['grad', 'roots'], 45), lot = fixedLot(g), spec = { kind: 'buy', zone: 4, lotId: lot.id };
  const r1 = run(g, spec); r1.quick(); r1.walkAway();
  const a = r1.res.read, r2 = run(g, spec); r2.quick(); r2.walkAway();
  assert.deepEqual(r2.res.read.estimate, a.estimate, 'reading again changes nothing');
  assert.equal(r2.res.read.spent, a.spent);
  const g2 = world(['grad', 'roots'], 47), lot2 = fixedLot(g2), r = run(g2, { kind: 'buy', zone: 4, lotId: lot2.id });
  r.act({ type: 'probe', id: 'power' }); r.quick();
  const spent = r.res.read.spent, budget = r.paramsFor('read').budget;
  assert.ok(spent <= budget && spent >= I.PROBES.power.cost, `spent ${spent} of ${budget}`);
  assert.ok(r.res.read.quick && g2.s.lots[4].find((l) => l.id === lot2.id).probed.includes('power'), 'the hand-bought probe is kept and counted');
  const used = g2.s.lots[4].find((l) => l.id === lot2.id).probed;
  assert.equal(new Set(used).size, used.length, 'no probe is on the lot twice');
});

test('free re-read (#27): walking away from a lot does not tell the player what it really was', () => {
  const g = world(['grad', 'roots'], 51), lot = fixedLot(g), FLAW = 'SECRETFLAW-zz';
  lot.truth = { q: 0.8137, fake: true, defects: [{ id: 'd0', label: FLAW }] };
  for (const how of ['at once', 'after a Quick read and haggle', 'after a probe']) {
    const r = run(g, { kind: 'buy', zone: 4, lotId: lot.id });
    if (how === 'after a Quick read and haggle') r.quickAll(); else if (how === 'after a probe') r.act({ type: 'probe', id: 'look' });
    const sm = r.walkAway(), text = JSON.stringify(sm);
    assert.equal(sm.title, 'No deal');
    assert.equal(sm.reveal, null, `${how}: no reveal`);
    for (const bad of ['0.8137', FLAW, 'It was a counterfeit', 'genuine', 'worth about', 'Walking away was the right call']) assert.ok(!text.includes(bad), `${how}: the summary leaks ${bad}`);
    assert.equal(sm.numbers.net, null); assert.equal(sm.numbers.quickNet, null); assert.equal(sm.numbers.expertNet, null);
  }
  // bought, the lot is yours and the truth is shown
  const r = run(g, { kind: 'buy', zone: 4, lotId: lot.id }); r.quickAll(); const sm = r.finish();
  assert.equal(sm.reveal.fake, true); assert.ok(JSON.stringify(sm).includes(FLAW));
});

test('free re-read (#27): a haggle that ends with no deal does not hand over the other side\'s limit while the same deal can be played again', () => {
  const g = world(['grad', 'roots'], 53), lot = fixedLot(g), r = run(g, { kind: 'buy', zone: 4, lotId: lot.id });
  r.quick(); r.next(); r.act({ type: 'anchor', level: 'low' }); r.act({ type: 'walk' }); // (a buyer's low offer is the aggressive one; walking from the table ends the talk)
  const sm = r.finish();
  assert.equal(sm.title, 'No deal');
  assert.ok(!/limit was|Their limit/i.test(sm.lesson.text), sm.lesson.text);
  assert.ok(sm.lesson.text.length > 30);
});

test('R3 (#53): a deal is not re-rolled by waiting: the same Fix or Close plays out the same at every hour', () => {
  const g = world(['trades', 'roots'], 61), a = brokenCrate(g), results = new Set(), closes = new Set();
  const lot = fixedLot(g);
  for (let h = 0; h < 24; h++) {
    g.s.hour = h;
    const r = run(g, { kind: 'repair', assetId: a.id }); r.quick();
    results.add(JSON.stringify([r.res.fix.precision, r.res.fix.costMult, r.res.fix.qualityMult]));
    const b = run(g, { kind: 'buy', zone: 4, lotId: lot.id }); b.quickAll();
    closes.add(JSON.stringify([b.res.close.mult, b.res.close.rounds, b.res.read.estimate]));
  }
  assert.equal(results.size, 1, 'one Fix result, however many hours pass');
  assert.equal(closes.size, 1, 'one Close and one Read');
  assert.equal(D.seedFor(g, { kind: 'repair', assetId: a.id }), (g.s.hour = 999, D.seedFor(g, { kind: 'repair', assetId: a.id })));
});

test('R5 (#88): walking away from a repair repairs nothing, charges nothing, throws nothing, and a second call changes nothing', () => {
  for (const [ops, cls] of [[1, 'sedan'], [3, 'van'], [5, 'bike'], [8, 'sedan']]) {
    const g = makeGame([], 'growth', 5); g._openZone(7); g.s.cash = 5000; g.s.skills.ops = ops;
    if (!ASSETS[cls]?.repair) continue;
    const a = g._mk(g.s, cls, { cond: 'broken', zone: 7 }); g.s.assets.push(a);
    const run1 = D.startRun(g, { kind: 'repair', assetId: a.id }), cash = g.s.cash, xp = g.s.xp, events = [];
    g.onEvent = (e) => events.push(e.type);
    let sm; assert.doesNotThrow(() => { sm = run1.walkAway(); }, `${cls} at Ops ${ops}`);
    assert.ok(sm && sm.ok, 'a summary comes back');
    assert.equal(g.s.cash, cash, 'nothing was charged'); assert.equal(a.cond, 'broken', 'the crate is as it was'); assert.equal(g.s.xp, xp, 'no XP for work not done');
    assert.equal(sm.tone, 'info'); assert.equal(sm.title, 'Left as it was'); assert.equal(sm.numbers.you, null);
    assert.ok(!events.includes('repair'));
    assert.equal(run1.walkAway(), sm, 'a second walk is the same summary'); assert.equal(run1.finish(), sm); assert.equal(g.s.cash, cash);
    // the bench still works afterwards
    const again = D.startRun(g, { kind: 'repair', assetId: a.id }); again.quickAll(); assert.equal(again.finish().title.startsWith('Repaired'), true);
  }
});

test('R8 (#89): the repair bench does not open for a player who cannot pay the dearest bill (1.3 x the quote)', () => {
  const g = makeGame([], 'growth', 5); g._openZone(7); g.s.skills.ops = 1;
  const a = g._mk(g.s, 'sedan', { cond: 'broken', zone: 7 }); g.s.assets.push(a);
  const q = g.repairQuote(a.id);
  for (const k of [0.95, 1.0, 1.2, 1.29]) {
    g.s.cash = q.cost * k;
    const r = D.startRun(g, { kind: 'repair', assetId: a.id });
    assert.ok(r.plan.blocker.length > 10, `cash ${k} x the quote: blocked`);
    assert.match(r.plan.blocker, /\$/); assert.equal(r.act({ type: 'careful' }).ok, false); assert.equal(r.quick(), false);
  }
  // with the whole bill covered every way of playing ends in a repair, Careful included
  g.s.cash = q.cost * 1.3 + 1;
  const ok = D.startRun(g, { kind: 'repair', assetId: a.id }); assert.equal(ok.plan.blocker, '');
  assert.equal(ok.act({ type: 'careful' }).ok, true);
  const sm = ok.finish(); assert.notEqual(sm.title, 'Not repaired'); assert.equal(a.cond, 'ok'); assert.ok(sm.xp > 0);
});
