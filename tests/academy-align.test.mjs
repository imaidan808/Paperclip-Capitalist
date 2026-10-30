// The Academy against the audit-fixed engine and the real Deal Room glue (js/deal.js): the regression tests for the re-alignment.
// Run: node --test tests/academy-align.test.mjs
//
// tests/meta-academy.test.mjs recomputes every number a lesson quotes; this file holds the three things that went wrong when the engine and the glue changed under lessons written for the old ones:
//  1. THE ORDER OF A DEAL'S EVENTS. js/deal.js `finish` sends a sale's `pitch` BEFORE its `haggle`, and a purchase's `inspect`, then `buy`, then `haggle` or `auction` (each once per buyer or lot). A lesson whose last
//     step waited for the haggle and whose win was the pitch after it could no longer be won, and a step on the pitch followed by one on a haggle was finished by the first deal's own stray haggle.
//  2. THE ROUTES. Every way into a deal (Quick all the way, the stage's Quick and Quick again, by hand, Pass after a read) has to move the coach by what was designed and no further.
//  3. THE DOLLARS. A lot is posted at 84% to 97% of its described value, and a sale is paid at the crate's real condition: the lesson and the Deal Room's result card must show the same money.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMY } from '../js/meta/academy.js';
import { ASSETS, BUYERS, ECON, ZONES } from '../js/config.js';
import * as D from '../js/deal.js';
import * as pitchGame from '../js/play/pitch.js';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const A = await import('../js/ui/academy-sandbox.js');

const M = (id) => ACADEMY.find((m) => m.id === id);
const text = (v) => JSON.stringify(v);
const ui = (x) => (Math.abs(x) < 100 ? `${x < 0 ? '-' : ''}$${Math.abs(x).toFixed(2)}` : `${x < 0 ? '-' : ''}$${Math.round(Math.abs(x) + 1e-9).toLocaleString('en-US')}`);
const sandbox = (m, over = {}) => A.makeSandboxSession({ ...m.setup, ...over }, { id: m.id, zone: m.zone }).game;
const idOf = (g, cls) => g.s.assets.find((a) => a.cls === cls).id;
const buyRun = (g, zone, lotId) => D.startRun(g, { kind: 'buy', zone, lotId });
const sellRun = (g, assetId, leadId) => D.startRun(g, { kind: 'sell', assetId, leadId });
const fixRun = (g, assetId) => D.startRun(g, { kind: 'repair', assetId });
const probes = (run, ids) => { for (const id of ids) assert.ok(run.act({ type: 'probe', id }).ok, `probe ${id}`); assert.ok(run.act({ type: 'conclude' }).ok); };
const bid = (run, ceiling) => { for (let i = 0; i < 400 && !run.stageDone(); i++) { const v = run.view(); if (!run.act({ type: v.yourTurn && v.nextBid <= ceiling + 1e-9 ? 'bid' : 'drop' }).ok) break; } };
const bestPair = (run) => { const p = run.paramsFor('pitch'); return pitchGame.legal(pitchGame.create(p)).map((l) => ({ angles: l.angles, mult: pitchGame.result(pitchGame.act(pitchGame.create(p), l).state).mult })).reduce((a, b) => (b.mult > a.mult ? b : a)).angles; };

/** A lesson as a runner sees it: the game's events fed to feedRun one by one, in the order the engine sends them. */
function lesson(m) {
  const g = sandbox(m), c = { m, g, i: 0, won: false, seen: [] };
  g.onEvent = (e) => { c.seen.push(e.type); const r = A.feedRun(m, { i: c.i, n: m.steps.length, won: c.won }, e); c.i = r.run.i; c.won = r.run.won; };
  return c;
}
/** The events a deal sends when it is over, in order, and how far the coach moved. */
function playOut(c, deal) { const before = c.seen.length, i0 = c.i; deal(); return { events: c.seen.slice(before), moved: c.i - i0 }; }

// ---------------------------------------------------------------------------------------------------------------------------------------
test('the engine sends a deal\'s events in the order the lessons lean on, each once per buyer or lot', () => {
  const m = M('m03'), g = sandbox(m), got = [];
  g.onEvent = (e) => { if (['pitch', 'haggle', 'inspect', 'buy', 'auction'].includes(e.type)) got.push(e.type); };
  { const run = sellRun(g, g.s.assets[0].id, 'thrift-flipper'); run.quickAll(); run.finish(); }
  assert.deepEqual(got, ['pitch', 'haggle'], 'a sale: the pitch first, then the haggle that closed it');
  const m2 = M('m10'), g2 = sandbox(m2), got2 = [];
  g2.onEvent = (e) => { if (['pitch', 'haggle', 'inspect', 'buy', 'auction'].includes(e.type)) got2.push(e.type + (e.won === undefined ? '' : ':' + e.won)); };
  { const r = buyRun(g2, 6, 'estate-lot-d'); r.quickAll(); r.finish(); }
  assert.deepEqual(got2, ['inspect', 'buy', 'auction:true'], 'a won auction: the read, the buy, then the auction');
  { const r = buyRun(g2, 6, 'estate-lot-a'); probes(r, ['serial']); r.next(); bid(r, 100); r.finish(); }
  assert.deepEqual(got2.slice(3), ['inspect', 'auction:false'], 'a lost auction sends the auction alone, after the read');
  const m4 = M('m02'), g3 = sandbox(m4), got3 = [];
  g3.onEvent = (e) => { if (['haggle', 'inspect', 'buy'].includes(e.type)) got3.push(e.type); };
  { const r = buyRun(g3, 4, 'second-watch'); probes(r, ['serial']); r.next(); r.quick(); r.finish(); }
  assert.deepEqual(got3, ['inspect', 'buy', 'haggle'], 'a fixed lot: the read, the buy, then the haggle');
  { const r = buyRun(g3, 4, 'signed-ball'); probes(r, ['serial']); r.next(); r.walkAway(); }
  { const r = buyRun(g3, 4, 'signed-ball'); assert.ok(r.act({ type: 'conclude' }).ok); r.next(); r.walkAway(); }
  assert.deepEqual(got3.slice(3), ['inspect'], 'a lot is read once as far as the engine is told: the second sitting sends nothing');
});

test('a lesson that ends in a deal ends on that deal\'s own event: the shape that waited for the haggle can no longer be won', () => {
  // the deals that end each lesson, brought to their last deal by the earlier steps, played the way the coach says and by Quick
  const ENDS = {
    m03: (g) => { const [s1] = g.s.assets.map((a) => a.id); const r1 = sellRun(g, s1, 'thrift-flipper'); r1.quickAll(); r1.finish(); return () => { const r = sellRun(g, g.s.assets[0].id, 'pageturner'); r.quickAll(); r.finish(); }; },
    m05: (g) => { const r1 = fixRun(g, idOf(g, 'van')); r1.act({ type: 'careful' }); r1.finish(); return () => { const r = sellRun(g, idOf(g, 'van'), 'fleet-buyer'); r.quickAll(); r.finish(); }; },
    m08: (g) => { const r1 = sellRun(g, g.s.assets[0].id, 'trend-boutique'); r1.quickAll(); r1.finish(); return () => { const r = sellRun(g, g.s.assets[0].id, 'popup-stall'); r.quickAll(); r.finish(); }; },
    m10: (g) => { const r1 = buyRun(g, 6, 'estate-lot-d'); r1.quickAll(); r1.finish(); const r2 = fixRun(g, idOf(g, 'antiqueFurniture')); r2.act({ type: 'careful' }); r2.finish(); return () => { const r = sellRun(g, idOf(g, 'antiqueFurniture'), 'antique-dealer'); r.quickAll(); r.finish(); }; },
  };
  for (const [id, setup] of Object.entries(ENDS)) {
    const m = M(id), last = m.steps.at(-1);
    // as authored: the last step and the win are the deal's pitch, so the finished deal wins
    { const c = lesson(m), deal = setup(c.g); c.i = m.steps.length - 1; c.won = false; deal(); assert.equal(c.won, true, `${id}: the finished last deal wins (${c.seen.join(', ')})`); }
    // the old shape: the last step waited for the haggle and the win was the pitch before it: the haggle comes after the pitch, so the lesson is never won by any finished deal
    { const old = { ...m, steps: [...m.steps.slice(0, -1), { ...last, wait: { type: 'event', event: 'haggle', match: { role: 'sell' } } }] };
      const c = lesson(old), deal = setup(c.g); c.i = old.steps.length - 1; c.won = false; deal();
      assert.equal(c.won, false, `${id}: waiting for the haggle and winning on the pitch is the shape that can no longer be won (${c.seen.join(', ')})`); assert.equal(c.i, old.steps.length, 'the haggle finished the step after the pitch had gone by'); }
  }
});

test('no stray event of a finished deal finishes the next step: the haggle that follows a pitch, the buy and the auction that follow a read', () => {
  // m04: the careless deal's own haggle arrives right after its pitch, with the careful step now current: it must not move it
  { const m = M('m04'), c = lesson(m); c.i = 1;
    const out = playOut(c, () => { const r = sellRun(c.g, c.g.s.assets[0].id, 'stall-collector'); r.quick(); r.next(); r.act({ type: 'anchor', level: 'fair' }); if (!r.stageDone()) r.act({ type: 'accept' }); r.finish(); });
    assert.deepEqual(out.events.filter((t) => ['pitch', 'haggle'].includes(t)), ['pitch', 'haggle']); assert.equal(c.i, 2, 'the pitch finished the careless step and the haggle that came after it finished nothing'); assert.equal(c.won, false); }
  // m03: Bree's haggle must not finish the Delphine step
  { const m = M('m03'), c = lesson(m); c.i = 1; playOut(c, () => { const r = sellRun(c.g, c.g.s.assets[0].id, 'thrift-flipper'); r.quickAll(); r.finish(); }); assert.equal(c.i, 2); assert.equal(c.won, false); }
  // m08: the boutique's haggle must not finish the popup step, and the popup sale (S under 0.5) is the step and the win at once
  { const m = M('m08'), c = lesson(m); c.i = 1; playOut(c, () => { const r = sellRun(c.g, c.g.s.assets[0].id, 'trend-boutique'); r.quickAll(); r.finish(); }); assert.equal(c.i, 2); assert.equal(c.won, false);
    playOut(c, () => { const r = sellRun(c.g, c.g.s.assets[0].id, 'popup-stall'); r.quickAll(); r.finish(); }); assert.equal(c.won, true); }
  // m10: one deal that reads and wins a lot sends inspect, buy and auction: it finishes the read step and the auction step together and nothing after them
  { const m = M('m10'), c = lesson(m); const out = playOut(c, () => { const r = buyRun(c.g, 6, 'estate-lot-d'); probes(r, ['serial']); r.next(); bid(r, 500); r.finish(); });
    assert.deepEqual(out.events.filter((t) => ['inspect', 'buy', 'auction'].includes(t)), ['inspect', 'buy', 'auction']); assert.equal(c.i, 2, 'read and auction together, and the fix step is still to come'); assert.equal(c.won, false); }
  // m02: reading the genuine watch and buying it in one deal finishes the read step and the buy step together, and wins
  { const m = M('m02'), c = lesson(m); c.i = 3;
    playOut(c, () => { const r = buyRun(c.g, 4, 'second-watch'); probes(r, ['serial', 'power']); r.next(); r.quick(); r.finish(); }); assert.equal(c.i, 5); assert.equal(c.won, true, `the read and the buy arrive together (${c.seen.join(', ')})`); }
});

test('every route into a deal moves the coach by what was designed (Quick all the way, the stage Quick, by hand, Pass after a read), and the lesson stays winnable', () => {
  // the deal a step asks for, by route: the number of steps the finished deal completes. Quick all the way and the stage's Quick then See the result are the same deal.
  const quickAll = (mk) => () => { const r = mk(); r.quickAll(); r.finish(); };
  const stageQuick = (mk) => () => { const r = mk(); r.quick(); r.next(); r.quick(); r.finish(); };
  const byHand = (mk) => () => { const r = mk(); r.act({ type: 'pick', angles: bestPair(r) }); r.next(); r.setAssist(true); for (let i = 0; i < 40 && !r.stageDone(); i++) { const a = r.view()?.advice?.action; if (!a || !r.act(a).ok) break; } r.finish(); };
  const ROUTES = { quickAll, stageQuick, byHand };
  // m01 and m05's sale, m08's two sales, m03's two, m04's first
  for (const [route, play] of Object.entries(ROUTES)) {
    { const c = lesson(M('m01')); c.i = 3; const out = playOut(c, play(() => sellRun(c.g, idOf(c.g, 'paperclip'), 'sim-student'))); assert.equal(c.won, true, `m01 by ${route}: ${out.events.join(', ')}`); }
    { const c = lesson(M('m03')); c.i = 1; playOut(c, play(() => sellRun(c.g, c.g.s.assets[0].id, 'thrift-flipper'))); assert.equal(c.i, 2, `m03 Bree by ${route}`);
      playOut(c, play(() => sellRun(c.g, c.g.s.assets[0].id, 'pageturner'))); assert.equal(c.won, true, `m03 Delphine by ${route}`); }
    { const c = lesson(M('m04')); c.i = 1; playOut(c, play(() => sellRun(c.g, c.g.s.assets[0].id, 'stall-collector'))); assert.equal(c.i, 2, `m04 collector by ${route}`);
      playOut(c, play(() => sellRun(c.g, c.g.s.assets[0].id, 'stall-dolores'))); // a Quick Close is par, never 10% over fair: only played Close can win, and the lesson says so
      assert.equal(c.won, route === 'byHand', `m04 Dolores by ${route}`); }
    { const c = lesson(M('m05')); c.i = 2; const f = fixRun(c.g, idOf(c.g, 'van')); f.act({ type: 'careful' }); f.finish(); assert.equal(c.i, 3); c.i = 4;
      playOut(c, play(() => sellRun(c.g, idOf(c.g, 'van'), 'fleet-buyer'))); assert.equal(c.won, true, `m05 by ${route}`); }
    { const c = lesson(M('m08')); c.i = 1; playOut(c, play(() => sellRun(c.g, c.g.s.assets[0].id, 'trend-boutique'))); assert.equal(c.i, 2); playOut(c, play(() => sellRun(c.g, c.g.s.assets[0].id, 'popup-stall'))); assert.equal(c.won, true, `m08 by ${route}`); }
  }
  // m10: the auction by Quick (both stages), by hand, and a read passed on
  { const c = lesson(M('m10')); const out = playOut(c, quickAll(() => buyRun(c.g, 6, 'estate-lot-d'))); assert.equal(c.i, 2, `Quick wins the lot: ${out.events.join(', ')}`); }
  { const c = lesson(M('m10')); playOut(c, () => { const r = buyRun(c.g, 6, 'estate-lot-a'); probes(r, ['serial', 'papers']); r.next(); r.walkAway(); }); assert.equal(c.i, 1, 'a read passed on finishes the read step and nothing else'); assert.equal(c.g.s.assets.length, 0);
    playOut(c, () => { const r = buyRun(c.g, 6, 'estate-lot-d'); probes(r, ['serial']); r.next(); bid(r, 500); r.finish(); }); assert.equal(c.i, 2); }
  // m04's win by the route the coach describes, Quick pitch and then Aim high, Hold, Come down small again and again (no Assist)
  { const c = lesson(M('m04')); c.i = 1; playOut(c, quickAll(() => sellRun(c.g, c.g.s.assets[0].id, 'stall-collector')));
    playOut(c, () => { const r = sellRun(c.g, c.g.s.assets[0].id, 'stall-dolores'); r.quick(); r.next(); r.act({ type: 'anchor', level: 'high' }); r.act({ type: 'hold' }); for (let i = 0; i < 12 && !r.stageDone(); i++) if (!r.act({ type: 'concede', size: 'small' }).ok) break; r.finish(); });
    assert.equal(c.won, true, 'the coach\'s own routine wins mission 4'); }
});

// ---------------------------------------------------------------------------------------------------------------------------------------
test('every lot a lesson posts is priced inside the engine\'s band (84% to 97% of its described value), so the Deal Room\'s result card never contradicts the lesson (mission 7\'s bargain is the declared exception)', () => {
  const BARGAIN = { m07: 'the intro says the sneakers are priced about a third under their value: that is the premise of borrowing to buy them' };
  let seen = 0;
  for (const m of ACADEMY) {
    const g = sandbox(m);
    for (const l of m.setup.lots) {
      const v = g.val({ cls: l.cls, cond: l.cond, quality: 1, wear: 1, zone: m.zone }), ratio = l.price / v; seen++;
      if (BARGAIN[m.id]) { assert.ok(ratio > 0.6 && ratio < 0.72, `${m.id}/${l.id}: priced at ${ratio.toFixed(2)} of its value, a third under it as the intro says`); assert.ok(/a third under/.test(m.intro), `${m.id}: the intro owns up to the bargain`); continue; }
      assert.ok(ratio >= ECON.lotDiscLo - 1e-9 && ratio <= ECON.lotDiscHi + 1e-9, `${m.id}/${l.id}: priced at ${ratio.toFixed(2)} of its described value $${v.toFixed(2)}; the engine posts a lot at ${ECON.lotDiscLo} to ${ECON.lotDiscHi}`);
    }
  }
  assert.ok(seen >= 10, `${seen} lots checked`);
  // and the result card agrees with the lesson about a lot bought at Quick: a genuine fixed-price lot is a good buy (mission 2) and the sneakers are (mission 7)
  for (const [id, zone] of [['m02', 4], ['m07', 5]]) {
    const m = M(id);
    for (const l of m.setup.lots.filter((x) => !(x.truth && x.truth.fake))) { const g = sandbox(m); if (id === 'm07') g.draw('micro', 1200); const r = buyRun(g, zone, l.id); r.quickAll(); const s = r.finish(); assert.equal(s.title, 'Good buy', `${id}/${l.id}: the card says "${s.title}" for a genuine lot bought at Quick`); }
  }
});

test('the dollars on the card are the Deal Room\'s: the price a Quick sale really pays appears in the lesson that quotes it', () => {
  const g1 = sandbox(M('m01')), s1 = sellRun(g1, idOf(g1, 'paperclip'), 'sim-student'); s1.quickAll(); const r1 = s1.finish();
  assert.ok(text(M('m01').why).includes(ui(r1.numbers.you)), `Wen's Quick price ${ui(r1.numbers.you)} is on the m01 card`);
  const g5 = sandbox(M('m05')); { const f = fixRun(g5, idOf(g5, 'van')); f.act({ type: 'careful' }); f.finish(); }
  const s5 = sellRun(g5, idOf(g5, 'van'), 'fleet-buyer'); s5.quickAll(); const r5 = s5.finish();
  assert.ok(text(M('m05').why).includes(ui(r5.numbers.you)), `Delgado's Quick price ${ui(r5.numbers.you)} for the repaired van is on the m05 card`);
  const g8 = sandbox(M('m08')); const a8 = (leadId) => { const r = sellRun(g8, g8.s.assets[0].id, leadId); r.quickAll(); return r.finish().numbers.you; };
  const herd = a8('trend-boutique'), open = a8('popup-stall'); assert.ok(text(M('m08').why).includes(ui(herd)) && text(M('m08').why).includes(ui(open)), `m08: $${herd} and $${open} are on the card`);
  const g3 = sandbox(M('m03')); const bree = (() => { const r = sellRun(g3, g3.s.assets[0].id, 'thrift-flipper'); r.quickAll(); return r.finish().numbers.you; })();
  assert.ok(text(M('m03').why).includes(ui(bree)), `m03: Bree's ${ui(bree)} is on the card`);
  // mission 10: the lot is sold at its real condition (90%), not as described
  const g10 = sandbox(M('m10')); { const r = buyRun(g10, 6, 'estate-lot-d'); r.quickAll(); r.finish(); const f = fixRun(g10, idOf(g10, 'antiqueFurniture')); f.act({ type: 'careful' }); f.finish(); }
  const s10 = sellRun(g10, idOf(g10, 'antiqueFurniture'), 'antique-dealer'); s10.quickAll(); const r10 = s10.finish();
  assert.ok(text(M('m10').why).includes(ui(r10.numbers.you)), `m10: the dealer's Quick price ${ui(r10.numbers.you)} is on the card, not the ${ui(s10.plan.fair)} of a perfect lot`);
  assert.ok(Math.abs(r10.numbers.you - s10.plan.fair * M('m10').setup.lots[0].truth.quality) < 0.01, 'a 90% lot fetches 90% of what the Pitch stage shows as fair');
});

test('the district rules the lessons teach still hold in the engine: Pawn District fakes, Estate Sales auctions, Auto Row repairs, and the 8% buyers take off a pitch', () => {
  assert.equal(ZONES[4].rules.fakes * ASSETS.pawnWatch.fakeRisk, 0.22, 'a watch is fake 22% of the time in the Pawn District (mission 2)');
  assert.ok(ZONES[6].rules.auction >= 0.5, 'Estate Sales run auctions (mission 10)');
  assert.equal(ZONES[7].rules.repair, 0.25, 'Auto Row takes 25% off the bill (mission 5)');
  assert.equal(ECON.pitchK, 0.92, 'mission 1 and 8 print 0.92'); assert.equal(BUYERS.collector.style, 'hard', 'mission 4: Mr. Abernathy is the hard bargainer');
});
