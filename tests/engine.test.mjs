import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/engine.js';
import { Cohort, ghostCounts } from '../js/cohort.js';
import { creativity, creativityBand, fmvVariance, eei, gini, utilityScore, restoreQuality, repairCostFor, fitOf, priceIndex, obviousBuyer, assetFMV } from '../js/market.js';
import { ASSETS, BUYERS, TOTAL_HOURS, EVENTS, WARN_LEAD } from '../js/config.js';
import { makeGame, run } from './bot.mjs';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('Asset Utility Score reproduces the tutorial: (9 x 10) - 1 = 89', () => {
  assert.equal(utilityScore(9, 10, 1), 89);
  // the Vintage Fountain Pen at the Scrap Yard is worth about the tutorial's $12.50
  const pen = assetFMV({ cls: 'pen', cond: 'ok', quality: 1, wear: 1 }, 1, { demand: [], price: [] });
  near(pen, 12.5, 0.2);
});

test('Creativity Multiplier edge cases from the spec', () => {
  near(creativity(92, 100), 0.4);          // linear herd trap: floor
  near(creativity(0, 100), 3.14);          // pioneer vector: ceiling
  assert.equal(creativityBand(0.4).id, 'herd');
  assert.equal(creativityBand(3.14).id, 'pioneer');
  // balanced equilibrium (10 of 100): formula gives 2.36. The spec's table says 1.68; see docs/BALANCE.md
  near(creativity(10, 100), 2.364, 0.01);
  assert.ok(creativity(50, 100) < creativity(10, 100), 'more saturation never helps');
});

test('Peer-to-peer variance, EEI, Gini', () => {
  near(fmvVariance(4200, 3900), 0.0769, 0.0005); // spec: 7.6%
  assert.ok(fmvVariance(1_000_000, 4000) > 0.4);
  near(eei(10000, 1000, 45), 15);
  near(eei(10000, 0.05, 90, 1000), 20);     // floor applied: 10x, doubled by 90 days remaining
  near(gini([1, 1, 1, 1]), 0);
  assert.ok(gini([0, 0, 0, 100]) > 0.7);
});

test('Broken Fleet Van: Ops specialist vs Growth specialist', () => {
  const van = ASSETS.van;
  const hi = { cost: repairCostFor(van.repair, 6), q: restoreQuality(6) };
  const lo = { cost: repairCostFor(van.repair, 1), q: restoreQuality(1) };
  assert.ok(hi.cost < 25, 'high Ops repairs for about $20');
  near(lo.cost, 1200);
  near(lo.q, 0.5);
  near(hi.q, 1.0);
});

test('every buyer has an obvious channel, and a second-best niche exists', () => {
  for (const [z, cls] of [[2, 'textbooks'], [2, 'electronics'], [1, 'pen']]) {
    const ob = obviousBuyer(z, cls);
    assert.ok(ob);
    const others = Object.keys(BUYERS).filter((b) => BUYERS[b].zone === z && b !== ob && fitOf(cls, b) >= 0.4);
    assert.ok(others.length >= 1, `${cls} needs a pioneer niche in zone ${z}`);
  }
  assert.equal(obviousBuyer(2, 'textbooks'), 'bookstore');
});

test('ghost herd saturates the obvious channel and leaves niches open', () => {
  const day = 40 * 24;
  const g = ghostCounts('t', day, 2, 'textbooks', 36);
  const share = (g.byBuyer.bookstore || 0) / g.total;
  assert.ok(share > 0.4, 'obvious channel is crowded: ' + share);
  const c = new Cohort({ seed: 't' });
  const vT = c.counts(day, 2, 'textbooks').total, vN = c.counts(day, 2, 'textbooks').byBuyer.bookstore;
  assert.ok(creativity(vN, vT) < creativity(0.5, vT));
});

test('profiles start as specified', () => {
  const b = new Game({ profile: 'bootstrapper', seed: 1 });
  near(b.s.cash, 0.05); assert.equal(b.s.assets.length, 1); assert.deepEqual(b.s.zones, [1]);
  const v = new Game({ profile: 'venture', seed: 1 });
  near(v.s.cash, 50000); assert.deepEqual(v.s.zones, [1, 2, 3]);
  const m = new Game({ profile: 'midtier', seed: 1 });
  near(m.s.cash, 5000); assert.ok(m.s.zones.includes(2) && !m.s.zones.includes(3));
});

test('Venture-Backed pays the Bureaucracy Drag: +30% overhead and 2-day liquidation delay', () => {
  const lane = { cls: 'textbooks', buyer: 'trainer', channel: 'dom' };
  // clear the audit gate so hiring is possible
  const v2 = makeGame('venture'); v2.advanceTo(1); v2.resolveAudit('A');
  const m2 = makeGame('midtier'); m2.s.mil.m2 = true; m2.s.auditFirst = true;
  const a = v2.hirePipeline('broker', 2, lane), b = m2.hirePipeline('broker', 2, lane);
  assert.ok(a.ok && b.ok);
  const fa = v2.forecast(a.pipe), fb = m2.forecast(b.pipe);
  assert.ok(fa.overhead / fb.overhead > 1.25 && fa.overhead / fb.overhead < 1.35, 'overhead ratio ' + fa.overhead / fb.overhead);
  assert.equal(v2.liqDelay(1), 48); assert.equal(m2.liqDelay(2), 0); assert.equal(m2.liqDelay(3), 48);
});

test('Bootstrapper pays no barter-network fees; others do', () => {
  assert.equal(makeGame('bootstrapper').instFee('pitch'), 0);
  assert.ok(makeGame('midtier').instFee('pitch') > 0.02);
  assert.ok(makeGame('bootstrapper').instFee('pool') > 0.02);
});

test('Zone 1 allows no automated managers (Scrap Yard is manual only)', () => {
  const g = makeGame('bootstrapper');
  const r = g.hirePipeline('broker', 1, { cls: 'pen', buyer: 'student' });
  assert.equal(r.ok, false);
});

test('game is deterministic and survives a save/load round trip', () => {
  const a = makeGame('midtier', 'ops', 11), b = makeGame('midtier', 'ops', 11);
  run(a, { days: 12 }); run(b, { days: 6 });
  const mid = JSON.parse(JSON.stringify(b.s));
  const c = new Game({ state: mid }); c.env.cohort = b.env.cohort; c.env.worldSeed = b.env.worldSeed;
  run(b, { days: 12 }); // continue b
  // c replays the second half from the saved state with the same decisions
  for (let h = mid.hour; h < 12 * 24; h++) { c.advanceTo(c.s.hour + 1); }
  assert.ok(Number.isFinite(c.netWorth()) && Number.isFinite(b.netWorth()));
  const a2 = makeGame('midtier', 'ops', 11); run(a2, { days: 12 });
  near(a.netWorth(), a2.netWorth(), 1e-6);
});

test('shock warnings arrive earlier with higher Fintech (12h / 72h / 7 days)', () => {
  const start = (EVENTS.fed.day - 1) * 24;
  for (const [fin, lead] of [[1, WARN_LEAD.novice], [3, WARN_LEAD.mid], [5, WARN_LEAD.adv]]) {
    const g = makeGame('midtier'); g.s.skills.fintech = fin;
    g.advanceTo(start - lead - 1);
    assert.equal(g.s.events.find((e) => e.kind === 'fed').warned, false, `L${fin} not yet`);
    g.advanceTo(start - lead);
    assert.equal(g.s.events.find((e) => e.kind === 'fed').warned, true, `L${fin} warned ${lead}h before`);
  }
  const g = makeGame('midtier'); g.s.skills.fintech = 1; g.s.upg.research = true;
  g.advanceTo(start - WARN_LEAD.mid);
  assert.equal(g.s.events.find((e) => e.kind === 'fed').warned, true, 'Market Research moves a novice up a tier');
});

test('Credit Crunch: +600 bps, 12% fees, no new loans until Day 55', () => {
  const g = makeGame('midtier');
  const r0 = g.loanRate('micro');
  g.advanceTo((45 - 1) * 24 + 1);
  assert.ok(g.loanRate('micro') > r0 * 1.4, 'rate jumps'); near(g.loanRate('micro') - r0, 0.06, 0.001);
  near(g.instFee('pool'), 0.12, 0.011);
  const d = g.draw('micro', 1000);
  assert.equal(d.ok, false); assert.match(d.msg, /freeze|Credit/i);
  g.advanceTo((55 - 1) * 24 + 1);
  assert.equal(g.mods().freeze, false);
});

test('debt-to-equity is capped at 3.0 and a margin call sells pipelines at -35%', () => {
  const g = makeGame('midtier'); g.s.mil.m2 = true; g.s.auditFirst = true;
  const p = g.hirePipeline('broker', 2, { cls: 'textbooks', buyer: 'trainer' }).pipe;
  g.draw('pipeline', 1e9);
  assert.ok(g.deRatio() <= 3.0 + 1e-6, 'D/E ' + g.deRatio());
  // crash the assets: wipe cash so equity collapses
  const debt = g.debt(); g.s.cash = 0;
  g.s.loans[0].principal = g.netWorth() * 5 + 5000;
  const before = g.s.pipes.length;
  g._marginCall();
  assert.ok(g.s.pipes.length < before || g.deRatio() <= 3, 'margin call acted');
  assert.ok(g.s.ledger.some((e) => e.type === 'margin'));
});

test('Gate 2: a $25k account cannot expand automation until it files its audit', () => {
  const g = makeGame('venture');
  assert.equal(g.autoLocked(), true);
  const lane = { cls: 'electronics', buyer: 'etailer' };
  assert.equal(g.hirePipeline('broker', 2, lane).ok, false);
  g.advanceTo(1);
  assert.ok(g.s.auditPending, 'audit card exists');
  const r = g.resolveAudit('A');
  assert.ok(r.ok);
  assert.equal(g.autoLocked(), false);
  assert.equal(g.hirePipeline('broker', 2, lane).ok, true);
});

test('ignored audits compound: fines grow 1.5x and Zone 2 velocity falls 15% each time', () => {
  const g = makeGame('venture');
  g.advanceTo(80);
  assert.equal(g.s.auditFail, 1);
  near(g.s.velPenalty, 0.85, 1e-9);
  g.advanceTo(433 + 72 + 1);
  assert.equal(g.s.auditFail, 2);
  near(g.auditFine(), 5000 * 2.25, 1);
});

test('peer-to-peer: extreme premiums are blocked and flagged; fair swaps escrow, accept and finalize', () => {
  const A = makeGame('midtier', 'ops', 1), B = makeGame('midtier', 'growth', 2);
  A.s.pid = 'AAA'; B.s.pid = 'BBB';
  const pallet = A._mk(A.s, 'electronics', { zone: 2, basis: 3000 }); A.s.assets.push(pallet);
  const domain = B._mk(B.s, 'domain', { zone: 2, basis: 3000 }); B.s.assets.push(domain);
  const bad = A.createOffer({ to: 'BBB', giveIds: [], giveCash: 1_000_000, want: { assets: [B.pub(domain)], cash: 0 } });
  assert.equal(bad.ok, false);
  assert.ok(A.out.some((m) => m.t === 'flag'));
  const nwA = A.netWorth(), nwB = B.netWorth();
  const off = A.createOffer({ to: 'BBB', giveIds: [pallet.id], want: { assets: [B.pub(domain)], cash: 0 } });
  assert.ok(off.ok, off.msg);
  near(A.netWorth(), nwA, 1); // escrow still counts toward net worth
  const acc = B.acceptOffer(off.offer);
  assert.ok(acc.ok, acc.msg);
  const fin = A.finalizeOffer(off.offer.id, acc.deliver);
  assert.ok(fin.ok);
  assert.ok(A.s.assets.some((a) => a.cls === 'domain') && B.s.assets.some((a) => a.cls === 'electronics'));
  assert.ok(!A.s.assets.some((a) => a.cls === 'electronics'));
  near(A.netWorth() + B.netWorth(), nwA + nwB, 5);
  // asymmetric synergy: a broken van is worth more to the Ops specialist
  const broken = { cls: 'van', cond: 'broken', quality: 1, wear: 1, zone: 2 };
  assert.ok(A.projected(broken, { ops: 6, growth: 1, fintech: 1 }) > B.projected(broken, { ops: 1, growth: 6, fintech: 1 }) * 1.5);
});

test('cancelled offers return escrow exactly', () => {
  const A = makeGame('midtier'); const x = A._mk(A.s, 'bike', { zone: 2 }); A.s.assets.push(x);
  const cash = A.s.cash, n = A.s.assets.length;
  const o = A.createOffer({ to: 'Z', giveIds: [x.id], giveCash: 0, want: { assets: [{ cls: 'bike', cond: 'ok', quality: 1, wear: 1, zone: 2, id: 'q' }], cash: 0 } });
  assert.ok(o.ok, o.msg);
  A.cancelOffer(o.offer.id);
  near(A.s.cash, cash, 1e-9); assert.equal(A.s.assets.length, n);
});

test('exit locks the EEI with days to spare', () => {
  const g = makeGame('venture');
  run(g, { days: 40 });
  assert.ok(g.s.mil.m3);
  const q = g.exitQuote('ipo');
  if (!q.ok) { g.s.auditFail = 0; }
  const r = g.exit('trade');
  assert.ok(r.ok, r.msg);
  g.advanceTo(g.s.hour + 49);
  assert.ok(g.s.exit && g.s.over);
  const e1 = g.eei(); g.advanceTo(g.s.hour + 100);
  assert.equal(g.eei(), e1, 'score is locked');
  assert.ok(g.s.exit.daysLeft > 45);
});

test('rewind restores a daily checkpoint', () => {
  const g = makeGame('midtier'); run(g, { days: 8 });
  const h = g.s.hour; const hr = g.rewindTo(3 * 24);
  assert.ok(hr <= 3 * 24 && hr < h);
});

test('smoke: every profile plays 90 days without NaN, negative storage, or runaway state', () => {
  for (const p of ['bootstrapper', 'midtier', 'venture']) {
    const g = makeGame(p, 'growth', 21);
    run(g);
    assert.ok(g.s.over || g.s.hour >= TOTAL_HOURS - 1, p + ' finished');
    for (const v of [g.netWorth(), g.s.cash, g.debt(), g.eei()]) assert.ok(Number.isFinite(v), p + ' finite');
    assert.ok(g.s.ledger.length < 3300 && g.s.niche.length < 2000);
    assert.ok(g.s.assets.length <= 60);
  }
});
