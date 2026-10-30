// The core economy, migrated from v1 to the v2 engine (Backgrounds instead of profiles, sixteen districts, skill points instead of cash training).
// Intent kept from v1: creativity maths, EEI, peer variance and the 40% guardrail, audits, margin calls, shocks, freight, pool friction, escrow, rewind, determinism, public snapshots.
// Dropped because the thing no longer exists: the three starting profiles (Bootstrapper/Midtier/Venture and the Venture "Bureaucracy Drag"), cash training (`train`), the barter-fee holiday.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/engine.js';
import { Cohort, ghostCounts } from '../js/cohort.js';
import { creativity, creativityBand, fmvVariance, eei, gini, utilityScore, restoreQuality, repairCostFor, fitOf, priceIndex, obviousBuyer, assetFMV, demandOf } from '../js/market.js';
import { ASSETS, BUYERS, ZONES, ZONE_IDS, TOTAL_HOURS, EVENTS, WARN_LEAD, DEBT, FMV_BAND, FRESH } from '../js/config.js';
import { makeGame, run } from './bot.mjs';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
/** A bare game: no cohort (crowding off), no algorithmic events, so a number in a test means one thing. */
const mk = (perks = [], seed = 1, extra = {}) => { const g = new Game({ perks, seed, handle: 'T', pid: 'T-' + seed, ...extra }); g.env.algo = false; return g; };
/** Give the player cash and let one hour pass, which opens every district whose gate the net worth now clears. */
const rich = (g, cash) => { g.s.cash = cash; g.advanceTo(g.s.hour + 1); return g; };
const lane = (g, zone) => { const r = g.radar(zone, 1)[0]; return { cls: r.cls, buyer: r.seg }; };
const bad = (x, path = 's') => { // first non-finite number anywhere in a state
  if (typeof x === 'number') return Number.isFinite(x) ? null : path;
  if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { const r = bad(v, path + '.' + k); if (r) return r; }
  return null;
};

test('Asset Utility Score reproduces the tutorial: (9 x 10) - 1 = 89, and prices follow it', () => {
  assert.equal(utilityScore(9, 10, 1), 89);
  // the Rusty Pen at the Scrap Yard is base x priceIndex(scarcity x demand - depreciation): the same chain the Academy teaches
  const pen = ASSETS.pen;
  const fmv = assetFMV({ cls: 'pen', cond: 'ok', quality: 1, wear: 1 }, 1, { demand: [], price: [] });
  near(fmv, pen.base * priceIndex(utilityScore(pen.sc, pen.dem[1], pen.dep)), 1e-9);
  near(fmv, 2.848, 0.001);
});

test('Creativity Multiplier edge cases from the spec', () => {
  near(creativity(92, 100), 0.4);          // linear herd trap: floor
  near(creativity(0, 100), 3.14);          // pioneer vector: ceiling
  assert.equal(creativityBand(0.4).id, 'herd');
  assert.equal(creativityBand(3.14).id, 'pioneer');
  near(creativity(10, 100), 2.364, 0.01);  // balanced equilibrium: the formula gives 2.36 (docs/BALANCE.md)
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

test('Broken Fleet Van: Ops decides what a repair costs and how good it is', () => {
  const van = ASSETS.van;
  const hi = { cost: repairCostFor(van.repair, 6), q: restoreQuality(6) };
  const lo = { cost: repairCostFor(van.repair, 1), q: restoreQuality(1) };
  assert.ok(hi.cost < 15, 'high Ops repairs for about $14: ' + hi.cost);
  near(lo.cost, van.repair);                // Ops 1 pays the full price...
  near(lo.q, 0.5);                          // ...and gets half the value back
  near(hi.q, 1.0);
});

test('every tradeable class has an obvious channel and a second-best (pioneer) niche in every district', () => {
  let checked = 0;
  for (const z of ZONE_IDS) {
    for (const cls of Object.keys(ASSETS)) {
      const d = ASSETS[cls];
      if (demandOf(d, z) < 4 || d.base < ZONES[z].scale * 0.05 || d.base > ZONES[z].scale * 4) continue;
      const ob = obviousBuyer(z, cls);
      assert.ok(ob, `${cls} in district ${z} has an obvious buyer`);
      const others = Object.keys(BUYERS).filter((b) => BUYERS[b].zone === z && b !== ob && fitOf(cls, b) >= 0.4);
      assert.ok(others.length >= 1, `${cls} needs a pioneer niche in district ${z}`);
      checked++;
    }
  }
  assert.ok(checked > 60, 'many niches were checked: ' + checked);
  assert.equal(obviousBuyer(5, 'textbooks'), 'trainer');
  assert.equal(obviousBuyer(1, 'pen'), 'student');
});

test('ghost herd saturates the obvious channel and leaves niches open', () => {
  const day = 40 * 24;
  const g = ghostCounts('t', day, 5, 'textbooks', 36);
  const share = (g.byBuyer.trainer || 0) / g.total;
  assert.ok(share > 0.4, 'obvious channel is crowded: ' + share);
  const c = new Cohort({ seed: 't' });
  const vT = c.counts(day, 5, 'textbooks').total, vN = c.counts(day, 5, 'textbooks').byBuyer.trainer;
  assert.ok(creativity(vN, vT) < creativity(0.5, vT));
});

test('everyone starts identical: one paperclip, $0, district 1, whatever the Backgrounds', () => {
  const starts = [[], ['trades', 'pro'], ['heir', 'creator'], ['immigrant', 'native']].map((p) => mk(p, 1));
  for (const g of starts) {
    assert.equal(g.s.cash, 0);
    assert.deepEqual(g.s.assets.map((a) => a.cls), ['paperclip']);
    assert.deepEqual(g.s.zones, [1]);
    assert.equal(g.s.startCapital, ASSETS.paperclip.base);
    assert.equal(g.s.xp, 0); assert.equal(g.s.points, 0); assert.equal(g.level(), 1);
    assert.equal(g.s.v, 2);
    assert.equal(g.s.loans.length, 0); assert.equal(g.s.pipes.length, 0);
  }
  for (const g of starts) assert.ok(g.netWorth() > 0.04 && g.netWorth() < 0.06, 'about five cents of value: ' + g.netWorth()); // a Background may nudge the paperclip's price (Creator whiplash), never the start
});

test('liquidation delay grows with the stakes: instant below district 9, 24h to 12, 48h from 13', () => {
  const g = mk();
  for (const z of ZONE_IDS) assert.equal(g.liqDelay(z), z >= 13 ? 48 : z >= 9 ? 24 : 0, 'district ' + z);
});

test('p2p swaps are fee-free; institutional channels are not', () => {
  const g = mk();
  assert.equal(g.instFee('p2p'), 0);
  assert.ok(g.instFee('pitch') > 0.02 && g.instFee('pool') > 0.02);
});

test('districts 1 to 4 allow no automated managers (everything is done by hand)', () => {
  const g = mk();
  for (const z of [1, 2, 3, 4]) {
    const r = g.hirePipeline('broker', z, { cls: 'pen', buyer: 'student' });
    assert.equal(r.ok, false, 'district ' + z);
  }
});

test('game is deterministic and survives a save/load round trip', () => {
  const a = makeGame(['trades', 'pro'], 'ops', 11), b = makeGame(['trades', 'pro'], 'ops', 11), other = makeGame(['trades', 'pro'], 'ops', 12);
  run(a, { days: 12 }); run(b, { days: 6 }); run(other, { days: 12 });
  const mid = JSON.parse(JSON.stringify(b.s));
  const c = new Game({ state: mid }); c.env.cohort = new Cohort({ seed: 'test', ghosts: 36 }); c.env.worldSeed = b.env.worldSeed;
  run(c, { days: 6 }); // the bot decides on even hours and 6 days is a whole number of them, so c plays exactly the second half
  assert.equal(JSON.stringify(c.s), JSON.stringify(a.s), 'save, load, continue = straight through');
  assert.notEqual(JSON.stringify(other.s), JSON.stringify(a.s), 'a different seed plays differently');
  assert.ok(Number.isFinite(c.netWorth()));
});

test('shock warnings arrive earlier with higher Fintech (12h / 72h / 7 days)', () => {
  const start = (EVENTS.fed.day - 1) * 24;
  for (const [fin, lead] of [[1, WARN_LEAD.novice], [3, WARN_LEAD.mid], [5, WARN_LEAD.adv]]) {
    const g = mk(); g.s.skills.fintech = fin;
    g.advanceTo(start - lead - 1);
    assert.equal(g.s.events.find((e) => e.kind === 'fed').warned, false, `L${fin} not yet`);
    g.advanceTo(start - lead);
    assert.equal(g.s.events.find((e) => e.kind === 'fed').warned, true, `L${fin} warned ${lead}h before`);
  }
  const g = mk(); g.s.skills.fintech = 1; g.s.upg.research = true;
  g.advanceTo(start - WARN_LEAD.mid);
  assert.equal(g.s.events.find((e) => e.kind === 'fed').warned, true, 'Market Research moves a novice up a tier');
});

test('Credit Crunch: +600 bps, 12% fees, no new loans until Day 55', () => {
  const g = rich(mk(), 5000); // opens the Bank
  assert.equal(g.s.mil.m1, true);
  const r0 = g.loanRate('micro');
  g.advanceTo((45 - 1) * 24 + 1);
  assert.ok(g.loanRate('micro') > r0 * 1.4, 'rate jumps'); near(g.loanRate('micro') - r0, 0.06, 0.001);
  near(g.instFee('pool'), 0.12, 0.011);
  const d = g.draw('micro', 1000);
  assert.equal(d.ok, false); assert.match(d.msg, /freeze|Credit/i);
  g.advanceTo((55 - 1) * 24 + 1);
  assert.equal(g.mods().freeze, false);
  assert.equal(g.draw('micro', 1000).ok, true, 'credit is back');
});

test('debt-to-equity caps borrowing at 3.0, and a margin call sells pipelines at -35%', () => {
  const g = rich(mk(), 1000); // exactly the Bank's gate
  g.s.cash = 400;
  const room = g.loanRoom('micro');
  near(room.room, 3 * g.netWorth(), 1e-6); // limited by D/E (3 x ~$400), not by the $2,500 line
  const d1 = g.draw('micro', 1e9);
  assert.ok(d1.ok);
  assert.equal(g.draw('micro', 1e9).ok, false, 'no room is left under D/E 3.0');
  // a pipeline, then crash the equity
  const g2 = rich(mk(), 6000);
  const p = g2.hirePipeline('broker', 5, lane(g2, 5)).pipe;
  g2.draw('pipeline', 1e9);
  g2.s.cash = 0;
  g2.s.loans[0].principal = g2.netWorth() * 5 + 5000;
  const before = g2.s.pipes.length;
  g2._marginCall();
  assert.ok(g2.s.pipes.length < before || g2.deRatio() <= 3, 'margin call acted');
  const m = g2.s.ledger.find((e) => e.type === 'margin');
  assert.ok(m, 'the liquidation is on the ledger');
  near(m.amt, p.basis * (1 - DEBT.fireSale) + (p.inflight || 0), 1e-6);
  assert.ok(g2.evq.some((e) => e.type === 'margin-call'));
});

test('Gate 2: a $25k account cannot expand automation until it files its audit', () => {
  const g = rich(mk(), 30000);
  assert.equal(g.autoLocked(), true);
  assert.ok(g.s.auditPending, 'audit card exists');
  const l = lane(g, 5);
  const locked = g.hirePipeline('broker', 5, l);
  assert.equal(locked.ok, false); assert.match(locked.msg, /Gate 2/);
  const r = g.resolveAudit('A');
  assert.ok(r.ok);
  assert.equal(g.autoLocked(), false);
  assert.equal(g.hirePipeline('broker', 5, l).ok, true);
});

test('ignored audits compound: fines grow 1.5x and pipeline velocity falls 15% each time', () => {
  const g = rich(mk(), 30000);
  g.advanceTo(74);
  assert.equal(g.s.auditFail, 1); assert.equal(g.s.auditIgnored, 1);
  near(g.s.velPenalty, 0.85, 1e-9);
  near(g.s.cash, 25000, 1e-6); // the first fine is $5,000
  g.advanceTo(433 + 72 + 1);
  assert.equal(g.s.auditFail, 2);
  near(g.s.velPenalty, 0.85 * 0.85, 1e-9);
  near(g.auditFine(), 5000 * 2.25, 1);
  near(g.s.cash, 25000 - 7500, 1e-6);
});

test('peer-to-peer: extreme premiums are blocked and flagged; fair swaps escrow, accept and finalize', () => {
  const A = mk([], 1), B = mk([], 2);
  A.s.pid = 'AAA'; B.s.pid = 'BBB';
  const pen = A._mk(A.s, 'pen', { zone: 1, basis: 1 }); A.s.assets.push(pen);
  const scrap = B._mk(B.s, 'scrap', { zone: 1, basis: 1 }); B.s.assets.push(scrap);
  const bad = A.createOffer({ to: 'BBB', giveIds: [], giveCash: 1_000_000, want: { assets: [B.pub(scrap)], cash: 0 } });
  assert.equal(bad.ok, false); assert.match(bad.msg, /Extreme Asymmetric Premium/);
  const flag = A.out.find((m) => m.t === 'flag');
  assert.ok(flag && flag.offer.variance > FMV_BAND, 'flagged for the instructor');
  const nwA = A.netWorth(), nwB = B.netWorth();
  const off = A.createOffer({ to: 'BBB', giveIds: [pen.id], want: { assets: [B.pub(scrap)], cash: 0 } });
  assert.ok(off.ok, off.msg);
  near(A.netWorth(), nwA, 1e-6); // escrow still counts toward net worth
  const acc = B.acceptOffer(off.offer);
  assert.ok(acc.ok, acc.msg);
  const fin = A.finalizeOffer(off.offer.id, acc.deliver);
  assert.ok(fin.ok);
  assert.ok(A.s.assets.some((a) => a.cls === 'scrap') && B.s.assets.some((a) => a.cls === 'pen'));
  assert.ok(!A.s.assets.some((a) => a.cls === 'pen'));
  near(A.netWorth() + B.netWorth(), nwA + nwB, 0.01);
  assert.equal(A.s.p2p, 1); assert.equal(B.s.p2p, 1);
  // asymmetric synergy: a broken van is worth more to the Ops specialist
  const broken = { cls: 'van', cond: 'broken', quality: 1, wear: 1, zone: 7 };
  assert.ok(A.projected(broken, { ops: 6, growth: 1, fintech: 1 }) > B.projected(broken, { ops: 1, growth: 6, fintech: 1 }) * 1.5);
});

test('the 40% guardrail is a hard line: 40% passes, just over is blocked, and it is measured from the lower side', () => {
  const A = mk([], 1);
  const pen = A._mk(A.s, 'pen', { zone: 1 }); A.s.assets.push(pen); A.s.cash = 100;
  const v = A.val(pen);
  const want = (cash) => ({ assets: [], cash });
  // offering the pen for cash: variance = |v - cash| / min(v, cash)
  assert.equal(A.checkOffer({ give: { assets: [pen], cash: 0 }, want: want(v * 1.39) }).ok, true);
  assert.equal(A.checkOffer({ give: { assets: [pen], cash: 0 }, want: want(v * 1.41) }).ok, false);
  assert.equal(A.checkOffer({ give: { assets: [pen], cash: 0 }, want: want(v / 1.39) }).ok, true);
  assert.equal(A.checkOffer({ give: { assets: [pen], cash: 0 }, want: want(v / 1.41) }).ok, false);
  assert.equal(A.checkOffer({ give: { assets: [pen], cash: 0 }, want: want(0) }).ok, false, 'a gift to oneself of nothing is not a trade');
});

test('cancelled offers return escrow exactly', () => {
  const A = mk(); const x = A._mk(A.s, 'bike', { zone: 1 }); A.s.assets.push(x); A.s.cash = 50;
  const cash = A.s.cash, n = A.s.assets.length;
  const o = A.createOffer({ to: 'Z', giveIds: [x.id], giveCash: 5, want: { assets: [{ cls: 'bike', cond: 'ok', quality: 1, wear: 1, zone: 1, id: 'q' }], cash: 0 } });
  assert.ok(o.ok, o.msg);
  assert.equal(A.s.escrow.length, 1);
  A.cancelOffer(o.offer.id);
  near(A.s.cash, cash, 1e-9); assert.equal(A.s.assets.length, n); assert.equal(A.s.escrow.length, 0);
});

test('an unanswered offer expires after 72 hours and the escrow comes back', () => {
  const A = mk(); const x = A._mk(A.s, 'bike', { zone: 1 }); A.s.assets.push(x);
  const o = A.createOffer({ to: 'Z', giveIds: [x.id], want: { assets: [{ cls: 'bike', cond: 'ok', quality: 1, wear: 1, zone: 1, id: 'q' }], cash: 0 } });
  assert.ok(o.ok);
  A.advanceTo(72); assert.equal(A.s.escrow.length, 1, 'still open at 72h');
  A.advanceTo(74);
  assert.equal(A.s.escrow.length, 0); assert.ok(A.s.assets.some((a) => a.id === x.id));
  assert.ok(A.out.some((m) => m.t === 'withdraw' && m.offer === o.offer.id));
});

test('exit locks the EEI with days to spare', () => {
  const g = rich(mk(), 300000); // Corporate Valley
  assert.ok(g.s.mil.m3);
  assert.equal(g.exitQuote('ipo').ok, true);
  const r = g.exit('trade');
  assert.ok(r.ok, r.msg);
  assert.deepEqual([g.s.assets.length, g.s.pipes.length, g.s.loans.length], [0, 0, 0], 'everything is sold into the exit');
  g.advanceTo(g.s.hour + 49);
  assert.ok(g.s.exit && g.s.over);
  const e1 = g.eei(); g.advanceTo(g.s.hour + 100);
  assert.equal(g.eei(), e1, 'score is locked');
  assert.ok(g.s.exit.daysLeft > 85);
  assert.ok(g.evq.some((e) => e.type === 'exit' && e.kind === 'trade'));
});

test('rewind restores a daily checkpoint', () => {
  const g = makeGame(['trades', 'pro']); run(g, { days: 8 });
  const h = g.s.hour; const hr = g.rewindTo(3 * 24);
  assert.ok(hr <= 3 * 24 && hr < h);
  assert.equal(g.s.hour, hr);
});

test('smoke: Background pairs play 90 days without NaN, negative storage, or runaway state', () => {
  for (const p of [['trades', 'pro'], ['heir', 'creator'], ['immigrant', 'native'], ['gigger', 'second']]) {
    const g = makeGame(p, 'growth', 21);
    run(g);
    assert.ok(g.s.over || g.s.hour >= TOTAL_HOURS - 1, p + ' finished');
    for (const v of [g.netWorth(), g.s.cash, g.debt(), g.eei()]) assert.ok(Number.isFinite(v), p + ' finite');
    assert.equal(bad(g.s), null, p + ': no NaN or Infinity anywhere in the state');
    assert.ok(g.s.ledger.length < 3300 && g.s.niche.length < 2000);
    assert.ok(g.s.assets.length <= 60);
    for (const z of g.s.zones) {
      const held = g.s.assets.filter((a) => a.zone === z).length;
      assert.ok(held <= g.storeCap(z), `${p}: district ${z} holds ${held} of ${g.storeCap(z)}`);
    }
  }
});

test('review: storage counts crates in escrow and in transit, so a withdrawn offer cannot overfill a district', () => {
  const g = mk([], 5); const z = 1, cap = g.storeCap(z);
  g.s.assets = []; for (let i = 0; i < cap; i++) g.s.assets.push(g._mk(g.s, 'bike', { zone: z }));
  const off = g.createOffer({ to: 'X', giveIds: [g.s.assets[0].id], want: { assets: [{ cls: 'bike', cond: 'ok', quality: 1, wear: 1, zone: 1, id: 'q' }], cash: 0 } });
  assert.ok(off.ok, off.msg);
  g.s.lots[z] = [{ id: 'T1', zone: z, cls: 'bike', cond: 'ok', price: 1, exp: g.s.hour + 50, mode: 'fixed', truth: { q: 1, fake: false, defects: [] } }]; g.s.cash = 1000;
  const r = g.buyLot(z, 'T1');
  assert.equal(r.ok, false, 'the crate in escrow still occupies its slot'); assert.match(r.msg, /escrow|transit|full/i);
});

test('review: an asset received from a peer lands in a district the founder can enter', () => {
  const g = mk([], 5); g.s.cash = 600;
  const book = { cls: 'textbooks', cond: 'ok', quality: 1, wear: 1, zone: 5, id: 'z' };
  const off = { id: 'Ox', from: 'P', fromHandle: 'P', give: { assets: [book], cash: 0, royalty: null }, want: { assets: [], cash: Math.round(g.sideValue({ assets: [book] }, { landing: true }) * 100) / 100 }, skills: {} }; // priced where it will sit (audit S5: the district-5 price was a 427% overpay in district 1)
  const r = g.acceptOffer(off); assert.ok(r.ok, r.msg);
  const got = g.s.assets.filter((x) => x.from === 'p2p');
  assert.ok(got.length === 1 && g.s.zones.includes(got[0].zone), 'delivered to district ' + got[0].zone + ' which this founder can enter');
  assert.equal(got[0].zone, 1);
});

// ---------------------------------------------------------------------------------------------------- freight, pool, shocks, snapshots
test('freight: cost follows book value and distance, the crates arrive after the run, and net worth counts them in transit', () => {
  const g = rich(mk(), 200); // opens districts 1 to 3
  const a = g._mk(g.s, 'bike', { zone: 1, basis: 20 }); g.s.assets.push(a);
  const q = g.freightQuote([a.id], 2);
  assert.ok(q.ok);
  near(q.cost, g.val(a) * FRESH.freightCost, 1e-9); // one hop: distance factor 1
  assert.equal(q.hours, FRESH.freightHours);
  const far = g.freightQuote([a.id], 3);
  near(far.cost, g.val(a) * FRESH.freightCost * 1.25, 1e-9); // two hops: 1 + 0.25
  assert.ok(far.hours > q.hours);
  const nw = g.netWorth(), cash = g.s.cash;
  const r = g.ship([a.id], 2);
  assert.ok(r.ok);
  near(g.s.cash, cash - q.cost, 1e-9);
  assert.equal(g.s.assets.some((x) => x.id === a.id), false); assert.equal(g.s.freight.length, 1);
  assert.ok(Math.abs(g.netWorth() - nw) < q.cost + g.val(a, 2) - g.val(a, 1) + 1e-6 + 1, 'goods in transit are still wealth');
  assert.equal(g.ship([a.id], 2).ok, false, 'a crate cannot be shipped twice');
  g.advanceTo(g.s.hour + q.hours + 1);
  assert.equal(g.s.freight.length, 0);
  assert.equal(g.s.assets.find((x) => x.id === a.id)?.zone, 2);
  assert.equal(g.freightQuote([a.id], 2).ok, false, 'already there');
  assert.equal(g.freightQuote([a.id], 4).ok, false, 'not yet open');
});

test('pool friction: the pool pays value less district friction and the fee, drains, and refills 35% a day', () => {
  const g = rich(mk(), 100);
  const a = g._mk(g.s, 'bike', { zone: 2, basis: 20 }), b = g._mk(g.s, 'bike', { zone: 1, basis: 20 });
  g.s.assets.push(a, b);
  assert.equal(g.sellPool([a.id, b.id]).ok, false, 'one district at a time');
  const q = g.poolQuote([a.id]);
  const fric = ZONES[2].friction + g.instFee('pool');
  near(q.total, g.val(a, 2) * (1 - fric), 1e-9);
  const room0 = g.s.pool[2], cash0 = g.s.cash;
  assert.ok(g.sellPool([a.id]).ok);
  near(g.s.pool[2], room0 - q.total, 1e-9); near(g.s.cash, cash0 + q.total, 1e-9);
  assert.ok(g.evq.some((e) => e.type === 'sell-pool' && e.zone === 2 && e.count === 1));
  g.s.pool[2] = 0;
  g.advanceTo(g.s.hour + 24);
  near(g.s.pool[2], ZONES[2].pool * 0.35, ZONES[2].pool * 0.001);
});

test('a dry liquidity pool refuses the sale (sellPool once returned ok:true with an empty message)', () => {
  // sellPool did `return fail(msg, q)` and fail() spread the quote AFTER ok:false, so q.ok (true) and q.msg ('') overwrote the failure.
  const g = rich(mk(), 100);
  const c = g._mk(g.s, 'bike', { zone: 2 }); g.s.assets.push(c);
  g.s.pool[2] = 0;
  const r = g.sellPool([c.id]);
  assert.equal(r.ok, false, 'a dry pool refuses');
  assert.match(r.msg, /liquidity pool/);
  assert.ok(g.s.assets.some((a) => a.id === c.id), 'the crate is still here');
});

test('shocks: TikTok surge multiplies trend demand, then fatigue halves trend prices; Tariff raises repair costs outside the starter districts', () => {
  const g = rich(mk(), 3000); // districts 1 to 5
  const t0 = (EVENTS.tiktok.day - 1) * 24;
  const sneak = { cls: 'sneakers', cond: 'ok', quality: 1, wear: 1 };
  const before = g.val({ ...sneak, zone: 5 }, 5);
  g.advanceTo(t0 + 5);
  assert.ok(g.mods().demand.some((e) => e.tags.includes('trend') && e.mult === 5));
  g.s.cash = 3000; // the market shock is under test, not the audit or the fed
  const surge = g.val({ ...sneak, zone: 5 }, 5);
  assert.ok(surge > before, 'trend demand spike lifts the price: ' + before + ' -> ' + surge);
  g.advanceTo(t0 + 60);
  assert.ok(g.mods().price.some((e) => e.mult === 0.5), 'market fatigue');
  assert.ok(g.val({ ...sneak, zone: 5 }, 5) < surge);
  // tariff: 45% dearer rehab outside the starter districts, none inside them
  const t = mk(); rich(t, 3000);
  const broken = t._mk(t.s, 'bike', { zone: 5, cond: 'broken' }); t.s.assets.push(broken);
  const c0 = t.repairQuote(broken.id).cost;
  t.injectEvent('tariff', t.s.hour, { id: 'x1' }); t.advanceTo(t.s.hour + 1);
  near(t.repairQuote(broken.id).cost / c0, 1.45, 1e-9);
  const early = t._mk(t.s, 'bike', { zone: 1, cond: 'broken' }); t.s.assets.push(early);
  near(t.repairQuote(early.id).cost, repairCostFor(ASSETS.bike.repair, t.lvl('ops'), 1), 1e-9);
});

test('instructor shocks: injectEvent is idempotent on id, and replace pulls the scheduled copy forward instead of stacking', () => {
  const g = mk();
  assert.equal(g.injectEvent('tariff', 100, { id: 'i1', injected: true }), true);
  assert.equal(g.injectEvent('tariff', 100, { id: 'i1', injected: true }), false);
  assert.equal(g.s.events.filter((e) => e.id === 'i1').length, 1);
  const n = g.s.events.filter((e) => e.kind === 'fed').length;
  assert.equal(g.injectEvent('fed', 10, { id: 'i2', replace: true }), true);
  assert.equal(g.s.events.filter((e) => e.kind === 'fed').length, n, 'the scheduled Fed is replaced, not stacked');
  assert.equal(g.s.events.find((e) => e.kind === 'fed').start, 10);
  assert.equal(g.injectEvent('nonsense', 10), false);
});

test('the public snapshot carries what classmates may see and none of what they may not', () => {
  const g = makeGame(['trades', 'pro'], 'ops', 7); run(g, { days: 4 });
  const snap = g.publicSnapshot();
  for (const k of ['pid', 'handle', 'perks', 'skills', 'level', 'hour', 'nw', 'cash', 'debt', 'startCap', 'eei', 'zones', 'pipelines', 'niches', 'p2p', 'trades', 'flags', 'shockLog', 'inventory', 'mil']) assert.ok(k in snap, 'snapshot has ' + k);
  assert.deepEqual(snap.perks, ['trades', 'pro']);
  assert.equal(snap.zones, Math.max(...g.s.zones));
  near(snap.nw, g.netWorth(), 1e-9); near(snap.eei, g.eei(), 1e-9);
  assert.ok(snap.inventory.length <= 24);
  assert.equal(bad(snap, 'snap'), null);
  const text = JSON.stringify(snap);
  assert.ok(!/"truth"|"fake"|"belief"|"known"/.test(text), 'hidden lot truth never leaves the player: ' + text.slice(0, 120));
  assert.ok(!/"seed"|"rng"/.test(text), 'no seeds');
  JSON.parse(text);
  snap.perks.push('x'); assert.deepEqual(g.s.perks, ['trades', 'pro'], 'a copy, not the live array');
});

test('net worth adds cash, stock, crates in transit and escrow, settlements and pipelines, and subtracts debt', () => {
  const g = rich(mk(), 3000);
  g.s.assets = [];
  g.s.cash = 1000;
  const a = g._mk(g.s, 'bike', { zone: 5 }); g.s.assets.push(a);
  const fr = g._mk(g.s, 'bike', { zone: 5 });
  g.s.freight.push({ id: 'F1', items: [fr], to: 5, arrive: g.s.hour + 99, risk: 0, book: 1, from: 5 });
  g.s.settle.push({ amt: 111, at: g.s.hour + 99, note: 't' });
  g.s.loans.push({ id: 'D1', prod: 'micro', principal: 250, accr: 10, last: 0, next: 99, drawn: 0 });
  near(g.netWorth(), 1000 + g.val(a) + g.val(fr, 5) + 111 - 260, 1e-9);
});
