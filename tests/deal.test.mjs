// The Deal Room's glue (js/deal.js): parameters for every Background pair, Quick as par, expert beats Quick, determinism, hidden truth stays hidden,
// and the engine calls a finished deal makes. Pure Node: no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './bot.mjs';
import { PERK_IDS, ASSETS, ZONES } from '../js/config.js';
import { ANGLES } from '../js/data/schema.js';
import * as D from '../js/deal.js';
import { pos } from '../js/play/repair.js';

const PAIRS = PERK_IDS.flatMap((a, i) => PERK_IDS.slice(i + 1).map((b) => [a, b]));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const finite = (o, path = 'x') => {
  if (typeof o === 'number') assert.ok(Number.isFinite(o), `${path} is not finite: ${o}`);
  else if (Array.isArray(o)) o.forEach((v, i) => finite(v, `${path}[${i}]`));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) finite(v, `${path}.${k}`);
};
const HAS_HAGGLE = !!D.GAMES.haggle, HAS_AUCTION = !!D.GAMES.auction;

/** A game with districts 2-4 and 6 open, plenty of cash and a crate of every class that sells where it stands. */
function world(perks = ['grad', 'native'], seed = 7, { growth = 1, fintech = 1, hour = 0 } = {}) {
  const g = makeGame(perks, 'ops', seed);
  for (const z of [2, 3, 4, 6]) g._openZone(z);
  g.s.cash = 1e6; g.s.hour = hour; g.s.skills.growth = growth; g.s.skills.fintech = fintech;
  for (const z of g.s.zones) for (const cls of Object.keys(ASSETS).filter((c) => (ASSETS[c].dem?.[z] || 0) >= 4).slice(0, 4)) g.s.assets.push(g._mk(g.s, cls, { zone: z, basis: 1 }));
  return g;
}
/** Every sale the Deal Room could be asked for in a world: [spec] with a real fit, a buyer who is not rejecting. */
function sells(g, limit = 99) {
  const out = [];
  for (const z of g.s.zones) for (const lead of g.s.leads[z]) for (const a of g.s.assets.filter((x) => x.zone === z)) {
    const q = g.quotePitch(a.id, lead.id);
    if (q.ok && q.fit >= 0.15 && !q.rejected && out.length < limit) out.push({ kind: 'sell', assetId: a.id, leadId: lead.id });
  }
  return out;
}
const lots = (g, mode) => g.s.zones.flatMap((z) => g.s.lots[z].filter((l) => !mode || l.mode === mode).map((l) => ({ kind: 'buy', zone: z, lotId: l.id })));
const run = (g, spec, opts) => { const r = D.startRun(g, spec, opts); assert.ok(r.ok, r.msg); return r; };

test('the Haggle and Auction games are present (their branch is merged)', () => {
  assert.ok(HAS_HAGGLE && HAS_AUCTION, 'js/play/haggle.js and js/play/auction.js must be on this branch');
});

test('seedFor is deterministic and moves with the hour, the ids and the game seed', () => {
  const g = world(), spec = sells(g, 1)[0];
  assert.equal(D.seedFor(g, spec), D.seedFor(g, { ...spec }));
  const a = D.seedFor(g, spec); g.s.hour += 1;
  assert.notEqual(a, D.seedFor(g, spec));
  assert.notEqual(D.seedFor(world(['grad', 'native'], 8), spec), D.seedFor(world(['grad', 'native'], 7), spec));
  assert.ok(Number.isInteger(a) && a >= 0 && a < 2 ** 32);
  assert.notEqual(D.stageSeed(a, 'read'), D.stageSeed(a, 'close'));
});

test('parameters stay in range for every Background pair (66)', () => {
  assert.equal(PAIRS.length, 66);
  for (const perks of PAIRS) {
    const g = world(perks, 11), P = g.P, ops = g.lvl('ops');
    const lot = g.s.lots[4].find((l) => l.mode === 'fixed') || g.s.lots[4][0];
    const ip = D.inspectParams(g, 4, lot);
    assert.equal(ip.budget, 3 + Math.floor(ops / 2) + P.probeBonus, `${perks} probes`);
    assert.ok(ip.accuracy >= 0.3 && ip.accuracy <= 0.95, `${perks} accuracy ${ip.accuracy}`);
    assert.equal(ip.fakeDetect, !!P.fakeDetect);
    assert.ok(ip.prior.fake >= 0.005 && ip.prior.fake <= 0.6);
    assert.ok(ip.truth.quality >= 0.6 && ip.truth.quality <= 1.2);
    finite(ip, 'inspect');
    const spec = sells(g, 1)[0], asset = g.s.assets.find((a) => a.id === spec.assetId), lead = g.s.leads[asset.zone].find((l) => l.id === spec.leadId);
    const pp = D.pitchParams(g, asset, lead);
    assert.ok(pp.insight >= 0 && pp.insight <= 5 && Number.isInteger(pp.insight));
    assert.ok(ANGLES.includes(pp.buyer.bias) && pp.buyer.needs.length >= 1 && pp.buyer.needs.length <= 4);
    assert.deepEqual(pp.asset.features, []);
    const r = run(g, spec), hp = r.paramsFor('close');
    assert.equal(hp.role, 'sell'); assert.equal(hp.handicap, P.haggleHandicap || 0); assert.equal(hp.assist, (P.haggleAssist || 0) > 0);
    assert.ok(hp.reserve >= hp.fair * 1.099 || hp.reserve <= r.plan.budget + 1e-9, 'reserve is the budget or at least 10% over fair');
    assert.ok(hp.reserve <= r.plan.budget + 1e-9 && hp.reserve <= hp.fair * 1.35 * 1.5, `${perks} reserve`);
    finite(hp, 'haggle');
    const b = run(g, { kind: 'buy', zone: 4, lotId: g.s.lots[4].find((l) => l.mode === 'fixed').id }), bp = b.paramsFor('close');
    assert.equal(bp.role, 'buy'); assert.ok(bp.reserve >= b.plan.lot.price * 0.72 - 1e-9 && bp.reserve <= b.plan.lot.price * 0.9 + 1e-9, `${perks} seller minimum`);
    assert.equal(bp.fair, b.plan.lot.price);
    finite(bp, 'haggle buy');
    const au = g.s.lots[4].find((l) => l.mode === 'auction');
    if (au) {
      const ap = D.auctionParams(g, 4, au);
      assert.ok(Math.abs(ap.reserve - au.price * 0.6) < 1e-9 && ap.budget <= au.price * 1.4 + 1e-9 && ap.budget <= g.s.cash);
      assert.ok(ap.bidders.length >= 2 && ap.bidders.length <= 5 && ap.estimate > 0 && ap.trueValue > 0); finite(ap, 'auction');
    }
    const brk = g.s.assets.find((a) => ASSETS[a.cls].repair); if (brk) { brk.cond = 'broken'; const rp = D.repairParams(g, brk); assert.equal(rp.ops, ops); finite(rp); }
  }
});

test('Backgrounds reach the games: Seasoned Pro and Second-Chance read better, Tradesperson haggles harder', () => {
  const lotOf = (g) => g.s.lots[4].find((l) => l.mode === 'fixed');
  const base = world(['connected', 'roots'], 3), pro = world(['pro', 'roots'], 3), sc = world(['second', 'roots'], 3), tr = world(['trades', 'roots'], 3);
  assert.ok(D.inspectParams(pro, 4, lotOf(pro)).accuracy > D.inspectParams(base, 4, lotOf(base)).accuracy);
  assert.ok(D.inspectParams(sc, 4, lotOf(sc)).budget > D.inspectParams(base, 4, lotOf(base)).budget);
  assert.equal(D.inspectParams(sc, 4, lotOf(sc)).fakeDetect, true);
  const h = (g) => run(g, { kind: 'buy', zone: 4, lotId: lotOf(g).id }).paramsFor('close');
  assert.equal(h(tr).handicap, 1); assert.equal(h(base).handicap, 0); assert.equal(h(pro).assist, true);
  const flea = world(['connected', 'roots'], 3), lot2 = flea.s.lots[2][0];
  const p2 = run(flea, { kind: 'buy', zone: 2, lotId: lot2.id }).paramsFor('close'), p4 = run(flea, { kind: 'buy', zone: 4, lotId: lotOf(flea).id });
  assert.ok(ZONES[2].rules.haggle && !ZONES[4].rules.haggle);
  assert.ok(p2.patience > 0 && p4.paramsFor('close').patience > 0);
  const g = world(['grad', 'roots'], 3, { growth: 1 }), g5 = world(['grad', 'roots'], 3, { growth: 8 });
  assert.ok(D.insightOf(g5) > D.insightOf(g));
});

test('Growth, Ops and Capital Sourcing change the difficulty: insight, probes and the quality of your estimate', () => {
  const lo = world(['connected', 'roots'], 5), hi = world(['connected', 'roots'], 5, { growth: 8, fintech: 8 });
  hi.s.skills.ops = 8;
  assert.ok(D.insightOf(hi) > D.insightOf(lo));
  const lot = (g) => g.s.lots[6].find((l) => l.mode === 'auction') || g.s.lots[6][0];
  assert.ok(D.inspectParams(hi, 6, lot(hi)).budget > D.inspectParams(lo, 6, lot(lo)).budget);
  assert.ok(D.inspectParams(hi, 6, lot(hi)).accuracy > D.inspectParams(lo, 6, lot(lo)).accuracy);
});

test('dealFrom combines stage results and clamps; no deal is null', () => {
  assert.deepEqual(D.dealFrom('sell', { pitch: { mult: 1.1 }, close: { deal: true, mult: 1.05 } }), { mult: 1.05 });
  assert.deepEqual(D.dealFrom('sell', { pitch: { mult: 1.1 }, close: { skipped: true, mult: 1 } }), { mult: 1.1 });
  assert.deepEqual(D.dealFrom('sell', { pitch: { mult: 1.1 } }), { mult: 1.1 });
  assert.deepEqual(D.dealFrom('buy', { close: { deal: true, mult: 0.8 } }), { mult: 0.8 });
  assert.equal(D.dealFrom('buy', { close: { deal: false, mult: null } }), null);
  assert.equal(D.dealFrom('buy', { bid: { won: false } }), null);
  assert.equal(D.dealFrom('buy', { bid: { won: true, mult: 0.9 } }).mult, 0.9);
  assert.equal(D.dealFrom('sell', { close: { deal: true, mult: 9 } }).mult, 1.4);
  assert.equal(D.dealFrom('sell', { close: { deal: true, mult: 0.01 } }).mult, 0.6);
  assert.deepEqual(D.dealFrom('repair', { fix: { qualityMult: 1.1, costMult: 0.95, precision: 0.8 } }), { qualityMult: 1.1, costMult: 0.95, precision: 0.8 });
  assert.deepEqual(D.dealFrom('repair', {}), { qualityMult: 1, costMult: 1, precision: 0.5 });
  assert.equal(D.dealFrom('repair', { fix: { qualityMult: NaN, costMult: 99, precision: -4 } }).costMult, 1.3);
});

test('tForPos puts the dial where the slider was set', () => {
  for (const seed of [1, 99, 123456]) for (const step of [0, 1, 2]) for (const x of [0.1, 0.35, 0.5, 0.62, 0.9]) {
    const t = D.tForPos(x, step, seed);
    assert.ok(Math.abs(pos(t, step, seed) - x) < 0.01, `x ${x} step ${step} seed ${seed}: got ${pos(t, step, seed)}`);
  }
});

// ------------------------------------------------------------------ Quick is par, an expert does better
test('Quick keeps the economy where it was: the average sale lands at about 1.0 of the Quick price (200 seeds)', { skip: !HAS_HAGGLE }, () => {
  const mults = [], rates = [];
  for (let seed = 1; seed <= 200; seed++) {
    const g = world(PAIRS[seed % 66], seed * 31 + 5, { growth: 1 + (seed % 5), hour: seed % 160 }), z = [2, 3, 4][seed % 3];
    const specs = sells(g).filter((s) => g.s.assets.find((a) => a.id === s.assetId).zone === z);
    if (!specs.length) continue;
    const r = run(g, specs[seed % specs.length]), c = r.compare();
    rates.push(c.quick.done ? 1 : 0);
    if (c.quick.done) mults.push(c.quick.mult);
  }
  assert.ok(mults.length >= 150, `only ${mults.length} sales`);
  const m = mean(mults);
  assert.ok(Math.abs(m - 1) <= 0.08, `Quick sell mult ${m.toFixed(3)}`);
  assert.equal(mean(rates), 1, 'Quick always closes');
});

test('Quick buying lands near the posted price (fixed lots) and near the guide price when it wins (auctions)', { skip: !HAS_HAGGLE || !HAS_AUCTION }, () => {
  const fixed = [], auc = [], wins = [];
  for (let seed = 1; seed <= 200; seed++) {
    const g = world(PAIRS[seed % 66], seed * 13 + 1, { fintech: 1 + (seed % 5), hour: seed % 160 });
    for (let k = 0; k < 4; k++) for (const z of g.s.zones) g._spawnLot(z);
    const specs = lots(g).filter((s) => s.zone >= 2);
    const spec = specs[seed % specs.length], lot = g.s.lots[spec.zone].find((l) => l.id === spec.lotId), r = run(g, spec);
    if (r.plan.blocker) continue;
    const c = r.compare();
    if (lot.mode === 'fixed') fixed.push(c.quick.mult); else { wins.push(c.quick.done ? 1 : 0); if (c.quick.done) auc.push(c.quick.mult); }
  }
  assert.ok(fixed.length >= 100 && auc.length >= 5, `${fixed.length} fixed, ${auc.length} auctions won`);
  assert.ok(Math.abs(mean(fixed) - 1) <= 0.08, `fixed buy mult ${mean(fixed).toFixed(3)}`);
  assert.ok(Math.abs(mean(auc) - 1) <= 0.1, `auction mult when won ${mean(auc).toFixed(3)}`);
  assert.ok(mean(wins) > 0.3 && mean(wins) < 0.9, `Quick wins ${mean(wins).toFixed(2)} of auctions`);
});

test('an expert (skill 1.0) beats Quick (0.5): 8-35% on sale price (the two games own calibration puts it near 10%), a few percent on a haggle, a lot on the net of an auction or a repair', { skip: !HAS_HAGGLE || !HAS_AUCTION }, () => {
  const q = [], e = [], bq = [], be = [], rq = [], re = [], aq = [], ae = [];
  for (let seed = 1; seed <= 200; seed++) {
    const g = world(['grad', 'native'], seed * 17 + 3, { growth: 4, fintech: 3, hour: seed % 160 }), z = [2, 3, 4][seed % 3];
    const specs = sells(g).filter((s) => g.s.assets.find((a) => a.id === s.assetId).zone === z);
    if (specs.length) { const c = run(g, specs[seed % specs.length]).compare(); if (c.quick.done && c.expert.done) { q.push(c.quick.price); e.push(c.expert.price); } }
    for (let k = 0; k < 3; k++) g._spawnLot(4);
    const fixed = g.s.lots[4].filter((l) => l.mode === 'fixed');
    if (fixed.length) { const c = run(g, { kind: 'buy', zone: 4, lotId: fixed[seed % fixed.length].id }).compare(); if (c.quick.done && c.expert.done) { bq.push(c.quick.price / fixed[0].price); be.push(c.expert.price / fixed[0].price); } }
    const brk = g.s.assets.filter((a) => ASSETS[a.cls].repair);
    if (brk.length) { const a = brk[seed % brk.length]; a.cond = 'broken'; const c = run(g, { kind: 'repair', assetId: a.id }).compare(); rq.push(c.quick.net / c.quick.price); re.push(c.expert.net / c.quick.price); }
    const au = g.s.lots[6].filter((l) => l.mode === 'auction');
    if (au.length) { const l = au[seed % au.length], c = run(g, { kind: 'buy', zone: 6, lotId: l.id }).compare(); aq.push(c.quick.net / l.price); ae.push(c.expert.net / l.price); }
  }
  const sellGain = mean(e) / mean(q) - 1, buyGain = mean(bq) / mean(be) - 1;
  assert.ok(q.length >= 120);
  assert.ok(sellGain >= 0.08 && sellGain <= 0.35, `expert sells ${(sellGain * 100).toFixed(1)}% higher`);
  assert.ok(buyGain >= 0.02 && buyGain <= 0.35, `expert buys ${(buyGain * 100).toFixed(1)}% cheaper`);
  assert.ok(mean(re) > mean(rq) * 1.1, 'repair: expert nets more');
  assert.ok(mean(ae) > mean(aq), 'auctions: expert nets more');
});

test('random play loses to Quick', { skip: !HAS_HAGGLE }, () => {
  const H = D.GAMES.haggle;
  let rand = 0, quick = 0, n = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const g = world(['connected', 'roots'], seed * 7 + 2, { growth: 3 }), specs = sells(g);
    const r = run(g, specs[seed % specs.length]); if (r.plan.capped) continue;
    const p = r.paramsFor('close'), c = H.autoplay(p, 0.5), z = H.autoplay(p, 0); // skill 0 is the careless player
    quick += c.deal ? c.mult : 0; rand += z.deal ? z.mult : 0; n++;
  }
  assert.ok(n > 60 && quick > rand, `quick ${quick / n} vs random ${rand / n}`);
});

test('a replay is identical: the same deal in the same hour plays out the same, bit for bit', { skip: !HAS_HAGGLE || !HAS_AUCTION }, () => {
  const g = world(['veteran', 'gigger'], 21, { growth: 3 });
  for (const spec of [...sells(g, 3), ...lots(g).slice(0, 6)]) {
    const a = run(g, spec).compare(), b = run(g, { ...spec }).compare();
    assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  }
  const brk = g.s.assets.find((x) => ASSETS[x.cls].repair); brk.cond = 'broken';
  assert.deepEqual(run(g, { kind: 'repair', assetId: brk.id }).compare(), run(g, { kind: 'repair', assetId: brk.id }).compare());
  const spec = sells(g, 1)[0], a = run(g, spec); a.quick(); a.next(); a.quick();
  const b = run(g, spec); b.quickAll();
  assert.deepEqual(a.res, b.res, 'stage by stage equals all at once');
});

// ------------------------------------------------------------------ whole deals through the engine
test('SELL: Quick deal plays every stage and the engine pays the haggled price', { skip: !HAS_HAGGLE }, () => {
  const g = world(['grad', 'native'], 41), spec = sells(g, 1)[0], r = run(g, spec);
  const events = []; g.onEvent = (e) => events.push(e.type);
  const cash = g.s.cash;
  assert.equal(r.key, 'pitch'); assert.deepEqual(r.stages.map((s) => s.key).slice(0, 1), ['pitch']);
  assert.ok(r.quickAll() && r.ready());
  const sm = r.finish();
  assert.equal(sm.ok, true); assert.ok(['good', 'warn', 'bad'].includes(sm.tone));
  assert.ok(!g.s.assets.some((a) => a.id === spec.assetId), 'the crate is sold');
  assert.ok(g.s.cash > cash, 'cash went up');
  assert.ok(events.includes('pitch'));
  assert.ok(g.s.meta.pitch.n === 1 && g.s.meta.quick >= 1, 'recorded as a Quick play');
  assert.ok(Math.abs(sm.numbers.you - sm.numbers.quick) < 0.011, 'Quick deal: you == what Quick would get');
  finite(sm);
  assert.equal(r.finish(), sm, 'finishing twice changes nothing');
});

test('SELL by hand: the pitch picks the keenness, the haggle splits it, and the hand-played games are tallied', { skip: !HAS_HAGGLE }, () => {
  const g = world(['grad', 'roots'], 43, { growth: 4 }), spec = sells(g)[2], r = run(g, spec);
  const bad = r.act({ type: 'pick', angles: ['price', 'price'] }); assert.equal(bad.ok, false);
  const v = r.view(); assert.ok(!('reveal' in v));
  assert.equal(r.act({ type: 'pick', angles: ['prestige', 'story'] }).ok, true);
  assert.ok(r.stageDone('pitch') && r.next() && r.key === 'close');
  const first = r.plan.stages[1].auto ? null : r.act({ type: 'anchor', level: 'fair' });
  if (first) { for (let i = 0; i < 12 && !r.stageDone(); i++) r.act({ type: 'accept' }) || r.act({ type: 'walk' }); }
  const sm = r.finish();
  assert.ok(g.s.meta.pitch.n === 1 && g.s.meta.played >= 1 && !g.s.meta.quick);
  finite(sm); assert.ok(sm.lesson.text.length > 10);
});

test('SELL: a haggle that ends without a deal sells nothing and leaves the crate and the buyer alone', { skip: !HAS_HAGGLE }, () => {
  const g = world(['grad', 'roots'], 47, { growth: 2 });
  const spec = sells(g).find((s) => !run(g, s).plan.stages[1].auto), r = run(g, spec), asset = r.plan.asset.id;
  r.quick(); r.next(); r.act({ type: 'anchor', level: 'fair' }); r.act({ type: 'walk' });
  assert.ok(r.stageDone()); const sm = r.finish();
  assert.equal(sm.title, 'No deal'); assert.ok(g.s.assets.some((a) => a.id === asset)); assert.equal(sm.numbers.you, null);
});

test('SELL: a buyer with a tight budget has nothing to haggle over; the sale goes through at the pitch price', { skip: !HAS_HAGGLE }, () => {
  const g = world(['grad', 'roots'], 49), spec = sells(g, 1)[0], lead = g.s.leads[g.s.assets.find((a) => a.id === spec.assetId).zone].find((l) => l.id === spec.leadId);
  lead.budget = 0.0001 + g.quotePitch(spec.assetId, spec.leadId).price; // exactly what they would pay: no headroom
  const r = run(g, spec); assert.ok(r.plan.capped && r.plan.stages[1].auto);
  r.quick(); assert.equal(r.next(), true); assert.equal(r.key, 'close'); assert.ok(r.stageDone());
  const sm = r.finish(); assert.equal(sm.ok, true); assert.ok(r.plan.stages[1].auto);
});

test('BUY a fixed lot: Read then Close, recorded, bought at the haggled price, and the crate remembers what you read', { skip: !HAS_HAGGLE }, () => {
  const g = world(['grad', 'roots'], 51), lot = g.s.lots[4].find((l) => l.mode === 'fixed'), spec = { kind: 'buy', zone: 4, lotId: lot.id }, r = run(g, spec);
  assert.deepEqual(r.stages.map((s) => s.key), ['read', 'close']);
  const cash = g.s.cash, xp = g.s.xp;
  assert.equal(r.act({ type: 'probe', id: 'serial' }).ok, true); assert.equal(r.act({ type: 'probe', id: 'serial' }).ok, false, 'a probe is used once');
  r.act({ type: 'conclude' }); assert.ok(r.stageDone('read')); assert.ok(r.next());
  const m = D.modelOf(r); assert.equal(m.stage, 'close');
  r.quick(); const sm = r.finish();
  assert.equal(sm.ok, true);
  assert.ok(cash - g.s.cash > lot.price * 0.55, 'paid'); assert.ok(!g.s.lots[4].some((l) => l.id === lot.id));
  const crate = g.s.assets.find((a) => a.from === 'lot' && a.cls === lot.cls); assert.ok(crate && crate.belief, 'the belief went with the crate');
  assert.ok(g.s.xp > xp && g.s.meta.inspect.n === 1 && g.s.meta.haggle.n === 1);
  assert.ok(sm.reveal && sm.reveal.truth.length > 5 && sm.numbers.better === 'low');
  finite(sm);
});

test('BUY: reading nothing earns nothing, and passing keeps the lot on the shelf', { skip: !HAS_HAGGLE }, () => {
  const g = world(['grad', 'roots'], 53), lot = g.s.lots[4].find((l) => l.mode === 'fixed'), r = run(g, { kind: 'buy', zone: 4, lotId: lot.id });
  const xp = g.s.xp; r.act({ type: 'conclude' }); const sm = r.walkAway();
  assert.equal(g.s.xp, xp, 'no probes, no XP'); assert.ok(g.s.lots[4].some((l) => l.id === lot.id)); assert.equal(sm.title, 'No deal');
  const r2 = run(g, { kind: 'buy', zone: 4, lotId: lot.id }); r2.act({ type: 'probe', id: 'look' }); r2.walkAway();
  assert.equal(g.s.lots[4].find((l) => l.id === lot.id).belief.confidence >= 0, true, 'what you learned stays on the lot');
});

test('BUY at auction: Bid stage, a won lot is bought at the auction price, a lost one is gone (passLot)', { skip: !HAS_AUCTION }, () => {
  let won = 0, lost = 0;
  for (let seed = 1; seed <= 40 && (!won || !lost); seed++) {
    const g = world(['grad', 'roots'], seed * 3 + 1, { fintech: 3 });
    for (let k = 0; k < 4; k++) g._spawnLot(6);
    const lot = g.s.lots[6].find((l) => l.mode === 'auction'); if (!lot) continue;
    const r = run(g, { kind: 'buy', zone: 6, lotId: lot.id });
    assert.deepEqual(r.stages.map((s) => s.key), ['read', 'bid']);
    r.quick(); r.next(); assert.equal(r.key, 'bid');
    const v = r.view(); assert.ok(!('reveal' in v) && !('trueValue' in v)); assert.ok(v.rivals.length >= 2);
    if (seed % 2) r.act({ type: 'drop' }); else for (let i = 0; i < 80 && !r.stageDone(); i++) r.act({ type: 'bid' }).ok || r.act({ type: 'drop' }); // half the seeds bid to the budget, half step out at once
    const cash = g.s.cash, sm = r.finish();
    if (r.res.bid.won) { won++; assert.ok(cash - g.s.cash > 0 || sm.ok === false); assert.ok(r.res.bid.mult >= 0.6 - 1e-9 && r.res.bid.mult <= 1.4 + 1e-9, `mult ${r.res.bid.mult}`); assert.ok(g.s.meta.auction.n >= 1); }
    else { lost++; assert.ok(!g.s.lots[6].some((l) => l.id === lot.id), 'the lot went to another bidder'); assert.equal(g.s.cash, cash); }
    finite(sm);
  }
  assert.ok(won && lost, `won ${won}, lost ${lost}`);
});

test('REPAIR: the precision dial feeds the engine; Careful is a fixed result; Quick plays at average skill', () => {
  const g = world(['trades', 'roots'], 61), a = g.s.assets.find((x) => ASSETS[x.cls].repair); a.cond = 'broken';
  const r = run(g, { kind: 'repair', assetId: a.id });
  assert.deepEqual(r.stages.map((s) => s.key), ['fix']);
  const v = r.view(); assert.equal(v.step, 0); assert.ok(v.zone.hi > v.zone.lo);
  const half = (v.zone.hi - v.zone.lo) / 2;
  r.setAssist(true); assert.ok(r.view().zone.hi - r.view().zone.lo > half * 2 * 1.3, 'Assist widens the sweet spot mid-run');
  for (let i = 0; i < 3; i++) { const vv = r.view(); r.act({ type: 'stop', t: D.tForPos(0.5, vv.step, vv.seed) }); }
  assert.ok(r.stageDone('fix') && r.res.fix.precision > 0.9, `precision ${r.res.fix.precision}`);
  const cash = g.s.cash, sm = r.finish();
  assert.equal(a.cond, 'ok'); assert.ok(g.s.cash < cash); assert.ok(g.s.meta.repair.n === 1);
  finite(sm); assert.equal(sm.lesson.concept, 'repair-roi');
  const b = g.s.assets.find((x) => ASSETS[x.cls].repair && x.id !== a.id); if (b) {
    b.cond = 'broken'; const r2 = run(g, { kind: 'repair', assetId: b.id }); assert.equal(r2.act({ type: 'careful' }).ok, true);
    assert.equal(r2.res.fix.careful, true); assert.ok(Math.abs(r2.res.fix.precision - 0.5) < 1e-9);
  }
});

test('blockers: no cash, no crate, a buyer who has left, fraud confirmed', () => {
  const g = world(['grad', 'roots'], 71), lot = g.s.lots[4][0];
  g.s.cash = 0.01; const r = run(g, { kind: 'buy', zone: 4, lotId: lot.id });
  assert.match(r.plan.blocker, /at least/); assert.equal(r.quick(), false); assert.equal(r.act({ type: 'conclude' }).ok, false);
  g.s.cash = 1e6;
  assert.equal(D.startRun(g, { kind: 'buy', zone: 4, lotId: 'nope' }).ok, false);
  assert.equal(D.startRun(g, { kind: 'sell', assetId: 'nope', leadId: 'nope' }).ok, false);
  assert.match(D.startRun(g, { kind: 'sell', assetId: g.s.assets[0].id, leadId: 'gone' }).msg, /left/);
  assert.equal(D.startRun(g, { kind: 'repair', assetId: g.s.assets[0].id }).ok, false, 'nothing to repair');
  assert.equal(D.startRun(g, { kind: 'dance' }).ok, false);
  const spec = sells(g, 1)[0], lead = g.s.leads[g.s.assets.find((a) => a.id === spec.assetId).zone].find((l) => l.id === spec.leadId);
  lead.scam = true; lead.verified = true;
  assert.match(run(g, spec).plan.blocker, /Fraud/);
});

// ------------------------------------------------------------------ hidden truth stays hidden
test('the screen model never carries a lot\'s truth or a lead\'s scam flag, at any stage', { skip: !HAS_HAGGLE || !HAS_AUCTION }, () => {
  const g = world(['native', 'second'], 81, { growth: 4 });
  const lot = g.s.lots[4].find((l) => l.mode === 'fixed');
  const FLAWS = ['SECRETFLAW-a', 'SECRETFLAW-b', 'SECRETFLAW-c', 'SECRETFLAW-d'];
  lot.truth = { q: 0.8137, fake: true, defects: FLAWS.map((label, i) => ({ id: 'd' + i, label })) };
  const au = g.s.lots[4].find((l) => l.mode === 'auction') || (g._spawnLot(4), g.s.lots[4].find((l) => l.mode === 'auction')); if (au) au.truth = { q: 0.8137, fake: true, defects: FLAWS.slice(0, 2).map((label, i) => ({ id: 'd' + i, label })) };
  const spec = sells(g, 1)[0], lead = g.s.leads[g.s.assets.find((a) => a.id === spec.assetId).zone].find((l) => l.id === spec.leadId); lead.scam = true;
  const scan = (r, where) => {
    for (let guard = 0; guard < 30; guard++) {
      const text = JSON.stringify(D.modelOf(r)); // everything the screen can ever print before the deal is over
      for (const bad of ['0.8137', '"truth"', '"scam"', '"reveal"', 'trueValue', '"limit"']) assert.ok(!text.includes(bad), `${where}: leaked ${bad} at ${r.key}`);
      const earned = new Set([...(r.res.read ? r.res.read.defects : []), ...(r.key === 'read' && r.view() ? r.view().found : [])]); // a probe that finds a flaw names it: that is the game
      for (const label of FLAWS) assert.ok(!text.includes(label) || earned.has(label), `${where}: leaked the unfound flaw ${label} at ${r.key}`);
      const k = r.key, view = r.view();
      if (k === 'read') { for (const id of ['look', 'serial', 'power', 'papers', 'expert']) r.act({ type: 'probe', id }); r.act({ type: 'conclude' }); }
      else if (k === 'pitch') r.act({ type: 'pick', angles: ['utility', 'story'] });
      else if (k === 'close') { r.act({ type: 'anchor', level: 'fair' }); for (let i = 0; i < 9 && !r.stageDone(); i++) r.act({ type: 'concede', size: 'medium' }) || r.act({ type: 'accept' }) || r.act({ type: 'walk' }); }
      else if (k === 'bid') { for (let i = 0; i < 60 && !r.stageDone(); i++) r.act({ type: 'bid' }).ok || r.act({ type: 'drop' }); }
      else if (k === 'fix') r.act({ type: 'careful' });
      assert.ok(!view || !('reveal' in view));
      if (r.key === 'result' || !r.next()) break;
    }
  };
  const r1 = run(g, { kind: 'buy', zone: 4, lotId: lot.id }); scan(r1, 'fixed lot');
  const s1 = r1.finish(); assert.ok(FLAWS.every((f) => JSON.stringify(s1).includes(f)), 'after the deal the summary names every flaw'); assert.equal(s1.reveal.fake, true);
  if (au) scan(run(g, { kind: 'buy', zone: 4, lotId: au.id }), 'auction');
  scan(run(g, spec), 'sale to an unverified scam buyer');
  const r = run(g, spec); assert.equal(r.plan.canVerify, !!g.P.scamRate); assert.ok(!('scam' in D.modelOf(r).plan));
  const v = r.verify(); assert.equal(v.ok, true); assert.equal(v.scam, true); assert.match(r.plan.blocker, /Fraud/);
  assert.equal(D.modelOf(r).plan.scam, true, 'after verification the player may know');
});

test('a scam buyer who was not verified takes the crate, and the summary says why', { skip: !HAS_HAGGLE }, () => {
  const g = world(['native', 'second'], 83), spec = sells(g, 1)[0], lead = g.s.leads[g.s.assets.find((a) => a.id === spec.assetId).zone].find((l) => l.id === spec.leadId);
  lead.scam = true;
  const r = run(g, spec); r.quickAll(); const sm = r.finish();
  assert.equal(sm.title, 'Scammed'); assert.equal(sm.tone, 'bad'); assert.equal(sm.lesson.concept, 'due-diligence');
});

test('a counterfeit crate is rejected by the buyer, and the deal room tells the story calmly', { skip: !HAS_HAGGLE }, () => {
  const g = world(['grad', 'roots'], 85), spec = sells(g, 1)[0], a = g.s.assets.find((x) => x.id === spec.assetId);
  a.truth = { q: 1, fake: true, defects: [] }; a.known = false;
  const r = run(g, spec); assert.ok(r.plan.fair > 0, 'the fair price does not give the counterfeit away');
  r.quickAll(); const sm = r.finish();
  assert.equal(sm.title, 'Counterfeit spotted'); assert.equal(sm.tone, 'bad'); assert.equal(sm.numbers.you, null);
  assert.ok(g.s.assets.some((x) => x.id === a.id), 'the crate stays with you');
});

test('every deal kind, Quick and by hand, yields finite numbers and a lesson (500 mixed deals)', { skip: !HAS_HAGGLE || !HAS_AUCTION }, () => {
  let n = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const g = world(PAIRS[seed % 66], seed * 5 + 9, { growth: 1 + (seed % 6), fintech: 1 + (seed % 4), hour: seed % 120 });
    for (let k = 0; k < 3; k++) for (const z of g.s.zones) g._spawnLot(z);
    const brk = g.s.assets.find((x) => ASSETS[x.cls].repair); if (brk) brk.cond = 'broken';
    const specs = [...sells(g).slice(seed % 7, seed % 7 + 1), ...lots(g).filter((s) => g.s.lots[s.zone].find((l) => l.id === s.lotId)).slice(seed % 5, seed % 5 + 2), ...(brk ? [{ kind: 'repair', assetId: brk.id }] : [])];
    for (const spec of specs) {
      const r = D.startRun(g, spec); if (!r.ok) continue;
      const m0 = D.modelOf(r); finite(m0);
      if (!r.plan.blocker) { r.quickAll(); } else assert.ok(r.plan.blocker.length > 3);
      const sm = r.finish(); finite(sm, `${spec.kind}#${seed}`);
      assert.ok(sm.title && sm.headline && sm.lesson && sm.lesson.text && sm.numbers && ['good', 'bad', 'warn', 'info'].includes(sm.tone));
      assert.ok(sm.xp >= 0); n++;
    }
  }
  assert.ok(n >= 250, `${n} deals`);
});

test('without Haggle or Auction on the branch the glue still loads, and the missing stages are simply left out', () => {
  const g = world(['grad', 'roots'], 91), r = run(g, sells(g, 1)[0]);
  assert.ok(r.stages.length === (HAS_HAGGLE ? 2 : 1));
  const lot = g.s.lots[4].find((l) => l.mode === 'fixed'); assert.ok(run(g, { kind: 'buy', zone: 4, lotId: lot.id }).stages.length === (HAS_HAGGLE ? 2 : 1));
});
