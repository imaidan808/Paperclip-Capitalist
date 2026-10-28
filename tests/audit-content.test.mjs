// Content audit: the facts the game's words and numbers promise, checked against the real engine and data (docs/V2_DESIGN.md sections 4, 7.1, 12).
// Every section here failed on the commit before the fixes it guards: yield assets that lose net worth, an epic nobody can earn, haggle
// achievements Quick earns by accident, daily bounties that are always neighbours in the list, Codex examples that quote goods and buyers
// that do not exist, blurbs that promise what the rules do not do, and docs and commands from v1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../js/engine.js';
import { startRun } from '../js/deal.js';
import { Progress } from '../js/meta/progress.js';
import { QUESTS, ACHIEVEMENTS, DAILIES } from '../js/meta/quests.js';
import { goalDelta, goalDone } from '../js/meta/match.js';
import { CODEX } from '../js/meta/codex.js';
import { ACADEMY } from '../js/meta/academy.js';
import { ASSETS, BUYERS, ZONES, ECON, LEVEL_XP, SKILL_MAX, SKILLS, PERKS } from '../js/config.js';
import { assetFMV, fitOf, FAKE_VALUE, creativity } from '../js/market.js';
import { demandOf, fitTags } from '../js/data/schema.js';
import * as haggle from '../js/play/haggle.js';
import * as pitchGame from '../js/play/pitch.js';
import { makeGame } from './bot.mjs';
import { parsePerks, DEFAULT_PERKS } from './calibrate.mjs';
import { DEFAULT_SEEDS, balance, wipedOut } from './balance.mjs';

const text = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
const codex = (id) => CODEX.find((e) => e.id === id);
const prose = (id) => { const e = codex(id); return JSON.stringify([e.formula, e.example, e.body, e.summary]); };
const usd = (x, d = 2) => '$' + (Math.round((Math.abs(x) + 1e-9) * 10 ** d) / 10 ** d).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
const quest = (id) => QUESTS.find((q) => q.id === id);
const ach = (id) => ACHIEVEMENTS.find((a) => a.id === id);
const daily = (id) => DAILIES.find((d) => d.id === id);

/** A game with every district up to `zone` open (and its bonuses), nothing else happening: the world of a hold-and-wait experiment. */
function quietGame(zone, { perks = [], seed = 5 } = {}) {
  const g = new Game({ perks, seed });
  g.env.algo = false; g.s.events = []; g.s.assets = []; g.s.cash = 0;
  for (let z = 1; z <= zone; z++) if (!g.s.zones.includes(z)) { g.s.zones.push(z); g.s.leads[z] = []; g.s.lots[z] = []; g.s.pool[z] = ZONES[z].pool; }
  g._bn = null;
  return g;
}
/** Let `days` midnights pass over what is held (wear, rent, perishing) without anything else moving. */
function pass(g, days) { for (let d = 0; d < days; d++) { for (let h = 0; h < 24; h++) { g.s.hour++; g._m = null; if (g.s.hour % 24 === 0) g._dayTick(); } } }
const crate = (g, cls, zone, o = {}) => { const a = g._mk(g.s, cls, { zone, basis: 0, ...o }); g.s.assets.push(a); return a; };

// ===================================================================================================================================
// C1: assets that pay while you hold them must pay more than they lose

const YIELD = Object.entries(ASSETS).filter(([, a]) => a.yield);

test('every yield asset out-earns its wear, even digital goods held in the fads district', () => {
  assert.ok(YIELD.length >= 14, 'the royalty and rent assets are still there');
  for (const [id, a] of YIELD) {
    const worst = a.dep * 0.002 * (a.tags.includes('digital') ? 2 : 1) + (a.perish ? 0.8 / a.perish : 0); // the engine's _dayTick: dep x 0.002, doubled for digital in fads districts, plus spoilage
    assert.ok(a.yield - worst >= 0.0015 - 1e-12, `${id}: yields ${pct(a.yield, 2)} a day but loses up to ${pct(worst, 2)} to wear`);
  }
});

test('holding any yield asset for 30 days raises net worth, in every district it is wanted and in the fads district too', () => {
  for (const [id, a] of YIELD) {
    const zones = new Set(Object.keys(a.dem).map(Number).filter((z) => demandOf(a, z) >= 3));
    if (a.tags.includes('digital')) zones.add(10);
    for (const z of zones) {
      const g = quietGame(z), held = crate(g, id, z), nw0 = g.netWorth();
      pass(g, 30);
      const grew = g.netWorth() / nw0 - 1;
      assert.ok(grew > 0.03, `${id} held in ${ZONES[z].short} for 30 days changes net worth by ${pct(grew)}`);
      assert.ok(g.s.cash > 0 && g.val(held) < nw0, `${id}: the income arrives as cash while the asset wears`);
    }
  }
  const g = quietGame(15); crate(g, 'apartmentBlock', 15); g.s.upg.jit = true; const nw0 = g.netWorth(); pass(g, 30);
  assert.ok(g.netWorth() > nw0, 'and with the JIT upgrade (half the wear) too');
});

test('Real Estate Row\'s quest chain can be finished: a founder who buys property the day the district opens collects its income target', () => {
  const q = quest('q15b'), need = q.goal.count;
  assert.equal(q.goal.sum, 'net');
  for (const openDay of [60, 76, 82]) { // the bot opens district 15 between days 63 and 80
    const g = new Game({ perks: [], seed: 5 }); g.env.algo = false;
    const pr = new Progress(g); g.onEvent = (e) => pr.onEvent(e);
    g.advanceTo((openDay - 1) * 24);
    g.s.cash = 1.2e6; g._unlock(); // $1.2M of net worth: districts 1 to 15 are open
    assert.ok(g.s.zones.includes(15) && !g.s.zones.includes(16));
    pr.m.q.q15a = { p: 2, done: true }; // the arrival quest: two sales on the Row
    for (let i = 0; i < 2; i++) { const a = crate(g, 'apartmentBlock', 15); a.basis = g.val(a); g.s.cash -= a.basis; } // two blocks, bought at fair value
    for (let h = g.s.hour; h < 2160; h++) { g.advanceTo(h + 1); if (g.s.auditPending) { g.s.cash += 1e5; g.resolveAudit('A'); } }
    assert.ok(pr.isDone('q15b'), `opened on day ${openDay}: collected ${Math.round(pr.m.q.q15b?.p || 0)} of ${need}`);
    assert.ok(pr.active(quest('q16a')), 'the Global Exchange chain opens behind it');
  }
});

// ===================================================================================================================================
// Achievements: nothing may ask for more than a default run can give

/** Plays 90 days with Industrial Park opened on `openDay`, every audit answered the hour it appears. */
function auditRun(openDay, { perks = [], difficulty = 1 } = {}) {
  const g = new Game({ perks, seed: 5 }); g.env.algo = false; g.env.difficulty.audit = difficulty;
  const pr = new Progress(g); g.onEvent = (e) => pr.onEvent(e);
  let passed = 0;
  for (let h = 0; h < 2160; h++) {
    g.advanceTo(g.s.hour + 1);
    if (g.s.hour === (openDay - 1) * 24) { g.s.cash = 1e9; g._unlock(); }
    if (g.s.auditPending && !g.s.over) { g.s.cash = Math.max(g.s.cash, 1e6); if (g.resolveAudit('A').ok) passed++; }
  }
  return { passed, done: (id) => !!pr.m.a[id]?.done };
}

test('Audit-Proof can be earned at the default audit pace; no audit achievement asks for more than a run can produce', () => {
  const most = auditRun(2).passed; // district 9 open on day 2 and every audit answered at once: the ceiling for anyone but the Immigrant
  assert.equal(most, 6, 'an audit every 15 days: six in a 90-day run at best');
  for (const a of ACHIEVEMENTS.filter((x) => x.goal.event === 'audit' && !x.goal.match.choice)) assert.ok(a.goal.count <= most, `${a.id} asks for ${a.goal.count} audits, a run gives at most ${most}`);
  const run = auditRun(20);
  assert.equal(run.passed, 5);
  assert.ok(run.done('a-audit-proof'), 'district 9 open on day 20: five audits, Audit-Proof earned');
  assert.ok(run.done('a-clean-books'));
  assert.ok(!auditRun(34).done('a-audit-proof'), 'but not for a founder who reaches Industrial Park late: the epic is still an epic');
});

test('no shock achievement asks for more shocks than the three scheduled ones', () => {
  const g = new Game({ perks: [], seed: 5 }); g.env.algo = false;
  let shocks = 0; g.onEvent = (e) => { if (e.type === 'shock') shocks++; };
  g.advanceTo(2160);
  assert.equal(shocks, 3);
  for (const a of ACHIEVEMENTS.filter((x) => x.goal.event === 'shock')) assert.ok(a.goal.count <= shocks, `${a.id}: ${a.goal.count} shocks`);
});

test('Legacy Heir\'s achievement is the Heir\'s own safety net: nobody else can earn it, and ignoring an audit does not', () => {
  const a = ach('a-bg-heir');
  assert.deepEqual(a.goal.match, { id: 'heir', effect: 'bailout' });
  assert.equal(a.hidden, true, 'hidden until earned, so the other eleven Backgrounds are not shown an impossible badge');
  assert.match(a.desc, /Only the Heir/);
  const margin = (perks) => {
    const g = new Game({ perks, seed: 5 }); const pr = new Progress(g); const events = []; g.onEvent = (e) => { events.push(e); pr.onEvent(e); };
    g.s.assets = [g._mk(g.s, 'paperclip', { zone: 1 })]; g.s.assets[0].quality = 1e3; g.s.cash = 0; // a thin base...
    g.s.loans.push({ id: 'D1', prod: 'micro', principal: 4 * g.netWorth(), accr: 0, last: 0, next: 1e9, drawn: 0 }); // ...under heavy debt: past 4.5
    g._marginCall();
    return { perk: events.filter((e) => e.type === 'perk'), done: !!pr.m.a['a-bg-heir']?.done, called: events.some((e) => e.type === 'margin-call') };
  };
  const heir = margin(['heir', 'pro']), other = margin(['trades', 'pro']);
  assert.ok(heir.called && other.called, 'both founders are called');
  assert.deepEqual(heir.perk.map((e) => e.effect), ['bailout']);
  assert.ok(heir.done, 'the Heir earns it at the margin call');
  assert.deepEqual(other.perk, []);
  assert.ok(!other.done, 'anyone else never does');
  const g = new Game({ perks: ['heir', 'pro'], seed: 5 }); const pr = new Progress(g); g.onEvent = (e) => pr.onEvent(e);
  g._auditFail(true); // the family lawyer waives the first fine: a 'perk' event, but not the safety net
  assert.ok(!pr.m.a['a-bg-heir']?.done, 'ignoring the first audit is not the safety net');
});

test('Last Day is claimed only for reaching day 90, which is all the engine reports', () => {
  const a = ach('a-day-90');
  assert.doesNotMatch(a.desc + a.title, /whole|through|complete|finish|full/i);
  const g = new Game({ perks: [], seed: 5 }); g.env.algo = false; const pr = new Progress(g); g.onEvent = (e) => pr.onEvent(e);
  g.advanceTo(2135); assert.ok(!pr.m.a['a-day-90']?.done);
  g.advanceTo(2136); assert.ok(pr.m.a['a-day-90']?.done, 'it fires as day 90 begins');
  assert.ok(!g.s.over);
});

// ===================================================================================================================================
// Skill points: a founder can spend 19, so the authored ones fit inside that

test('the skill points quests, achievements and the Academy hand out fit what three skills can absorb', () => {
  const g = new Game({ perks: [], seed: 1, specialty: 'ops' });
  const capacity = Object.keys(SKILLS).reduce((n, k) => n + SKILL_MAX - g.s.skills[k], 0);
  assert.equal(capacity, 19);
  const sum = (list) => list.reduce((n, x) => n + (x.reward?.points || 0), 0);
  const q = sum(QUESTS), a = sum(ACHIEVEMENTS), lessons = sum(ACADEMY);
  assert.ok(q + a + lessons <= capacity, `quests ${q} + achievements ${a} + Academy ${lessons} = ${q + a + lessons}, capacity ${capacity}`);
  assert.ok(ACHIEVEMENTS.filter((x) => x.rarity === 'epic').length > ACHIEVEMENTS.filter((x) => x.reward.points).length, 'some epics pay experience only');
  assert.ok(ACHIEVEMENTS.filter((x) => x.reward.points).every((x) => x.rarity === 'epic'));
});

test('Progress banks a skill point through game.grantPoints when the engine has it, and straight into points when it does not', () => {
  const q = quest('q04b'), want = q.reward.points;
  const calls = [];
  const g = { day: 1, s: { seed: 1, points: 0, meta: {} }, xp() {}, grantPoints(n) { calls.push(n); } };
  const pr = new Progress(g); pr._reward('quest', q);
  assert.deepEqual(calls, [want]);
  assert.equal(g.s.points, 0, 'the engine decides what is banked');
  const old = { day: 1, s: { seed: 1, points: 0, meta: {} }, xp() {} };
  new Progress(old)._reward('quest', q);
  assert.equal(old.s.points, want);
});

// ===================================================================================================================================
// Daily bounties

test('daily bounties: three different templates, picked independently, on day 1 as well', () => {
  const stub = (seed) => ({ day: 1, s: { seed, points: 0, meta: {} }, xp() {} });
  const pr = new Progress(stub('x'));
  assert.equal(pr.dailies().length, 3, 'day 1 has bounties already (the first day event only comes at hour 24)');
  const n = DAILIES.length, uses = Object.fromEntries(DAILIES.map((d) => [d.id, 0])), index = Object.fromEntries(DAILIES.map((d, i) => [d.id, i]));
  let days = 0, neighbours = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const p = new Progress(stub(seed));
    for (let day = 2; day <= 90; day++) {
      p.onEvent({ type: 'day', day });
      const ids = p.dailies().map((d) => d.id);
      assert.equal(new Set(ids).size, 3, 'three different bounties');
      for (const id of ids) uses[id]++;
      const at = ids.map((id) => index[id]).sort((a, b) => a - b);
      days++; if (at[2] - at[0] === 2) neighbours++; // three templates that sit side by side in DAILIES
    }
  }
  assert.ok(neighbours / days < 0.12, `${(100 * neighbours / days).toFixed(1)}% of days hand out three neighbours (chance alone: about 4.5%)`);
  for (const [id, k] of Object.entries(uses)) assert.ok(Math.abs(k / days - 3 / n) < 0.05, `${id} turns up on ${(100 * k / days).toFixed(1)}% of days (fair share ${(300 / n).toFixed(1)}%)`);
});

// ===================================================================================================================================
// Haggle achievements and dailies: Quick earns the common ones, only skilled play the rare ones

function haggles(skill, role, n) {
  const out = [];
  for (let seed = 1; out.length < n && seed < 8000; seed++) {
    const g = new Game({ perks: [], seed, handle: 'x', pid: 'P' }); const evs = []; g.onEvent = (e) => evs.push(e);
    g.s.cash = 5e4; g._unlock(); g.advanceTo(1);
    if (role === 'sell') {
      const Z = 2 + (seed % 4), seg = Object.keys(BUYERS).filter((b) => BUYERS[b].zone === Z)[seed % 5];
      const cls = Object.keys(ASSETS).find((c) => demandOf(ASSETS[c], Z) >= 4 && fitOf(c, seg) >= 0.5);
      if (!seg || !cls) continue;
      const a = g._mk(g.s, cls, { zone: Z, basis: 1 }); g.s.assets.push(a);
      g.s.leads[Z].push({ id: 'LX' + seed, zone: Z, seg, budget: ASSETS[cls].base * 3, born: g.s.hour, exp: g.s.hour + 30 });
      const run = startRun(g, { kind: 'sell', assetId: a.id, leadId: 'LX' + seed }); if (!run.ok) continue;
      run.quickAll(skill); run.finish();
    } else {
      const Z = 2 + (seed % 3); g.s.lots[Z] = []; g._spawnLot(Z);
      const lot = g.s.lots[Z][0]; if (!lot || lot.mode === 'auction') continue;
      const run = startRun(g, { kind: 'buy', zone: Z, lotId: lot.id }); if (!run.ok) continue;
      run.quickAll(skill); run.finish();
    }
    out.push(...evs.filter((e) => e.type === 'haggle' && e.role === role));
  }
  return out;
}
const reaches = (def, events) => goalDone(def.goal, events.reduce((p, e) => p + goalDelta(def.goal, e), 0));

test('Quick (autoplay at average skill) earns the common haggle goals and none of the rare ones; a skilled player earns them', () => {
  const quick = [...haggles(0.5, 'sell', 80), ...haggles(0.5, 'buy', 80)];
  assert.ok(quick.length >= 140);
  for (const id of ['a-haggle-first', 'a-haggle-ten']) assert.ok(reaches(ach(id), quick), `${id} is common: Quick gets it`);
  for (const id of ['d-haggle-day', 'd-buy-low']) assert.ok(reaches(daily(id), quick), `${id} is a daily: Quick gets it`);
  for (const id of ['a-silver-tongue', 'a-bargain-hunter', 'a-bg-pro', 'a-poker-face']) assert.ok(!reaches(ach(id), quick), `${id} is rare: 160 Quick haggles do not earn it`);
  const expert = [...haggles(1, 'sell', 120), ...haggles(1, 'buy', 120)], skilled = haggles(0.75, 'sell', 120);
  for (const id of ['a-silver-tongue', 'a-bargain-hunter', 'a-bg-pro', 'a-poker-face']) assert.ok(reaches(ach(id), expert), `${id}: an expert earns it`);
  for (const id of ['a-silver-tongue', 'a-bg-pro', 'a-poker-face']) assert.ok(reaches(ach(id), skilled), `${id}: so does a player at 0.75`);
});

test('the words of the haggle goals say what is measured: sales against fair price, purchases against the asking price', () => {
  for (const id of ['a-bargain-hunter']) assert.match(ach(id).desc, /asking price/);
  assert.match(daily('d-buy-low').desc, /asking price/);
  const buys = haggles(1, 'buy', 40);
  assert.ok(buys.every((e) => e.mult >= 0.6 && e.mult <= 1.4));
  assert.ok(buys.some((e) => e.mult < 1), 'mult is a share of the posted price: an expert gets below 1.0 of it');
});

// ===================================================================================================================================
// The words of districts, quests and the Codex against the rules

/** Lots made in a district with a given amount of cash, to measure the shares a blurb quotes. */
function lotShares(zone, cash, n = 12000) {
  const g = new Game({ perks: [], seed: 11 }); g.env.algo = false; g.s.events = []; g.s.cash = cash; g._unlock();
  if (!g.s.zones.includes(zone)) { g.s.zones.push(zone); g.s.leads[zone] = []; g.s.lots[zone] = []; g.s.pool[zone] = ZONES[zone].pool; }
  const s = { n: 0, fake: 0, broken: 0, auction: 0, repairable: 0, repairableBroken: 0, qMin: 9, qMax: 0, boxes: 0 };
  for (let i = 0; i < n; i++) {
    g.s.lots[zone] = []; g._spawnLot(zone, false);
    const l = g.s.lots[zone][0]; if (!l) continue;
    s.n++; if (l.truth.fake) s.fake++; if (l.cond === 'broken') s.broken++; if (l.mode === 'auction') s.auction++;
    if (ASSETS[l.cls].repair) { s.repairable++; if (l.cond === 'broken') s.repairableBroken++; }
    if (l.cls === 'fleaBox') { s.boxes++; s.qMin = Math.min(s.qMin, l.truth.q); s.qMax = Math.max(s.qMax, l.truth.q); }
  }
  return s;
}

test('district blurbs promise only what the rules do', () => {
  const pawn = lotShares(4, 1000), estate = lotShares(6, 3000), auto = lotShares(7, 8000), row = lotShares(15, 1.1e6), flea = lotShares(2, 100);
  assert.ok(pawn.fake / pawn.n > 0.19 && pawn.fake / pawn.n < 0.25, `Pawn District: ${pct(pawn.fake / pawn.n)} of lots are fakes (the rule is 22%, the blurb says about one lot in five)`);
  assert.match(ZONES[4].blurb, /one lot in five/);
  assert.ok(Math.abs(pawn.auction / pawn.n - 1 / 3) < 0.04, 'a third of the Pawn District goes to auction');
  assert.match(ZONES[4].blurb, /a third of the stock goes to auction/);
  assert.ok(Math.abs(estate.auction / estate.n - 0.5) < 0.08, 'Estate Sales: about half at auction');
  assert.ok(Math.abs(auto.broken / auto.n - 0.6) < 0.04, `Auto Row: ${pct(auto.broken / auto.n)} of all lots arrive broken (the rule is 60%)`);
  assert.match(ZONES[7].blurb, /Six in ten cars/);
  assert.ok(Math.abs(row.auction / row.n - 0.25) < 0.05, 'Real Estate Row: a quarter of the lots are foreclosure auctions');
  assert.match(ZONES[15].blurb, /a quarter of the lots are foreclosure auctions/);
  // Flea Market Row: a sealed box is no wilder than any other lot there, so the blurb says gamble on condition, not "junk to treasure"
  assert.ok(flea.fake === 0 && flea.boxes > 100 && flea.qMin >= 0.85 && flea.qMax <= 1.15, 'a sealed box is worth 85% to 115% of what it looks like and is never fake');
  assert.doesNotMatch(ZONES[2].blurb, /treasure|junk/);
  assert.match(ZONES[2].blurb, /gamble on condition/);
});

test('no blurb or quest calls cycles long where managers get faster', () => {
  const g = new Game({ perks: [], seed: 1 });
  const len = (z) => g.cycleLen({ kind: 'broker', zone: z, alloc: 1000, level: 1 });
  assert.ok(len(13) < len(5) && len(15) < len(5), 'a broker\'s cycle is shorter in Corporate Valley and on Real Estate Row than in Metro Hub');
  for (const z of Object.values(ZONES)) assert.doesNotMatch(z.blurb, /long (sales )?cycles|cycles are long/i, z.name);
  for (const t of [...QUESTS, ...ACHIEVEMENTS]) assert.doesNotMatch(t.desc, /long cycles/i, t.id);
  assert.doesNotMatch(JSON.stringify(CODEX), /long cycles|Cycles are long/);
});

test('quest and achievement words that quote a rate or a rule are the rate and the rule', () => {
  assert.match(quest('q04a').desc, /1 in 5/);
  assert.match(quest('q07a').desc, /6 in 10 lots here are broken/);
  const auto = lotShares(7, 8000);
  assert.ok(auto.broken / auto.n > 0.56 && auto.broken / auto.n < 0.64, `Auto Row: ${pct(auto.broken / auto.n)} of all lots are broken`);
  assert.match(quest('q06a').desc, /About half/);
  assert.match(quest('q08b').desc, /2% fee/);
  assert.ok(text('js/engine.js').includes('(f.book || 0) * 0.02'), 'customs charge 2% of the crates\' value');
});

// ===================================================================================================================================
// Codex worked examples run through the engine

/** The game's own numbers: one cash-rich founder with every district open, optionally with Ops set. */
function rich({ ops = 1, open = 16 } = {}) {
  const g = new Game({ perks: [], seed: 5, specialty: 'ops' });
  g.env.algo = false; g.s.events = []; g.s.cash = 1e8; g._unlock();
  assert.ok(g.s.zones.length >= open);
  g.s.skills.ops = ops; g.s.cash = 0;
  return g;
}
const lead = (g, zone, seg, budget = 1e9, extra = {}) => { const l = { id: 'LT' + g.s.nid++, zone, seg, budget, born: g.s.hour, exp: g.s.hour + 99, ...extra }; g.s.leads[zone].push(l); return l; };

test('Codex: utility and fit are the data\'s own (the Scrap Yard buyers, the paperclip)', () => {
  const t = prose('utility-fit');
  for (const id of ['student', 'barista', 'dmitri']) assert.equal(BUYERS[id].zone, 1, `${id} is a Scrap Yard regular`);
  assert.equal(BUYERS.collector.zone, 2, 'the collector is on Flea Market Row, not in the Scrap Yard');
  assert.equal(fitOf('paperclip', 'student'), 1);
  assert.equal(fitOf('paperclip', 'barista'), 0.8);
  assert.equal(fitOf('paperclip', 'dmitri'), 0.4);
  assert.equal(fitOf('paperclip', 'collector'), 0);
  for (const [seg, mult] of [['student', '1.35x'], ['barista', '1.16x'], ['dmitri', '0.78x']]) assert.ok(t.includes(mult), `${seg} ${mult}`);
  assert.ok(codex('utility-fit').body[0].includes('as much as eight dollars'), 'a student\'s budget tops out at $8');
  assert.equal(BUYERS.student.budget[1], 8);
  const g = rich(); const l = lead(g, 2, 'collector'), a = crate(g, 'paperclip', 2);
  assert.equal(g.quotePitch(a.id, l.id, undefined).rejected, true, 'a fit under 0.15 is turned down');
});

test('Codex: the pitch price examples are what quotePitch returns (Creativity Multiplier, urgency premium)', () => {
  const g = rich();
  const quote = (cls, seg, niche, o = {}) => {
    g.s.niche = niche; const a = crate(g, cls, 1), l = lead(g, 1, seg, o.budget ?? 1e9, o.need ? { need: o.need } : {});
    const q = g.quotePitch(a.id, l.id, { mult: 1 }); g.s.assets = g.s.assets.filter((x) => x !== a); return q;
  };
  const cell = (n, own, total) => Array.from({ length: total }, (_, i) => [g.s.hour, 1, 'pen', i < own ? 'marguerite' : 'student']).slice(0, total);
  const t = prose('creativity-multiplier');
  const pioneer = quote('pen', 'marguerite', cell(0, 0, 40)), light = quote('pen', 'marguerite', cell(0, 10, 100)), herd = quote('pen', 'marguerite', cell(0, 60, 100));
  assert.equal(pioneer.fit, 0.7);
  for (const [q, price] of [[pioneer, '$5.09'], [light, '$3.64'], [herd, '$0.61']]) { assert.equal(usd(q.price), price); assert.ok(t.includes(price)); }
  assert.ok(Math.abs(pioneer.ci.cm - 3.14) < 1e-9 && Math.abs(light.ci.cm - creativity(10, 100)) < 1e-9 && herd.ci.cm === 0.4);
  assert.equal(ECON.pitchK, 0.92); assert.ok(t.includes('0.92'), 'the pitch factor is on the page');
  // recent pitches press the pen's own price (the crowd factor counts them, yours included): $2.85 with nobody about (the fair-value test below), $2.75 with 40 pitches, $2.62 with 100
  for (const x of ['$2.85', '$2.75', '$2.62', '$1.62', '$1.54']) assert.ok(t.includes(x), x);
  assert.equal(usd(pioneer.parts.ref), '$2.75'); assert.equal(usd(light.parts.ref), '$2.62'); assert.equal(usd(herd.parts.ref), '$2.62');
  assert.equal(usd(pioneer.parts.ref * pioneer.parts.term * 0.6 * ECON.pitchK), '$1.62', 'the base pitch price before the multiplier');
  assert.equal(usd(light.parts.ref * light.parts.term * 0.6 * ECON.pitchK), '$1.54');
  // urgency premium: the lead names a budget of $6 and a need
  const u = prose('urgency-premium');
  const withTag = quote('paperclip', 'student', [], { budget: 6, need: 'tool' }), without = quote('paperclip', 'student', [], { budget: 6, need: 'prestige' });
  assert.equal(usd(withTag.price), '$3.62'); assert.ok(u.includes('$3.62') && u.includes('1.093'));
  assert.equal(without.fit, 0.5); assert.equal(usd(without.price), '$2.81'); assert.ok(u.includes('$2.81') && u.includes('0.775'));
  assert.equal(Math.round(Number(usd(withTag.price).slice(1)) / 0.05), 72, 'the markup over the clip\'s five cents, as the numbers on the page read'); assert.ok(u.includes('72x'));
  assert.ok(withTag.price <= 6, 'never above the stated budget');
});

test('Codex: fair value, utility and price examples are assetFMV on the real goods', () => {
  const fmv = (cls, z) => assetFMV({ cls, cond: 'ok', quality: 1, wear: 1 }, z, {}, 1);
  assert.equal(usd(fmv('bike', 3)), '$31.28'); assert.ok(prose('fair-market-value').includes('$31.28'));
  assert.equal(usd(assetFMV({ cls: 'bike', cond: 'ok', quality: 0.9, wear: 0.95 }, 3, {}, 1)), '$26.74');
  assert.equal(usd(assetFMV({ cls: 'bike', cond: 'broken', quality: 1, wear: 1 }, 3, {}, 1)), '$9.38');
  assert.equal(usd(fmv('pen', 1)), '$2.85'); assert.equal(usd(fmv('scrap', 1)), '$2.28');
  const t = prose('asset-utility-score');
  for (const x of ['$2.85', '$2.28', '$3.09', '35.5%']) assert.ok(t.includes(x), x);
  const g = rich(); // the radio, the sneakers and the gadgets at the fair values the Codex quotes
  assert.equal(usd(g.val({ cls: 'radio', cond: 'ok', quality: 1, wear: 1, zone: 2 })), '$11.52');
  assert.equal(usd(fmv('sneakers', 5)), '$368.60'); assert.equal(usd(fmv('gadgets', 5)), '$729.60'); assert.equal(usd(fmv('pawnWatch', 4)), '$314.60');
});

test('Codex: the Pawn District watch example (fake value, posted price) comes from the lot generator', () => {
  const g = rich(); const t = prose('information-asymmetry');
  assert.equal(FAKE_VALUE, 0.08);
  const fair = assetFMV({ cls: 'pawnWatch', cond: 'ok', quality: 1, wear: 1 }, 4, {}, 1);
  const prices = new Set(); let fakes = 0, watches = 0;
  for (let i = 0; i < 40000 && watches < 700; i++) {
    g.s.lots[4] = []; g._spawnLot(4, false);
    const l = g.s.lots[4][0]; if (!l || l.cls !== 'pawnWatch') continue;
    watches++; if (l.truth.fake) fakes++; prices.add(l.price);
  }
  assert.ok(watches >= 500);
  assert.deepEqual([...prices], [305.16], 'posted at 97% of the described value at Ops 1');
  // the district's 22% is a share of ALL its lots, so each good's chance is the rule x its fakeRisk over the district's mean fakeRisk and the working share: 0.22 x 1 / (0.87 x 0.8) = 31.6% for a watch
  assert.ok(Math.abs(fakes / watches - 0.316) < 0.04, `a watch is fake ${pct(fakes / watches)} of the time (expected 31.6%)`);
  for (const x of [usd(fair), usd(fair * FAKE_VALUE), '$221.98', '$305.16', '$83.18', '$222']) assert.ok(t.includes(x), x);
  assert.equal(usd(0.68 * fair + 0.32 * fair * FAKE_VALUE), '$221.98', 'the example works with the rate rounded to 32%');
  assert.equal(usd(305.16 - (0.68 * fair + 0.32 * fair * FAKE_VALUE)), '$83.18');
  assert.ok(t.includes('22% fake rate') && t.includes('one lot in five') && t.includes('32%'));
});

test('Codex: the repair examples are the engine\'s repair quote on a broken Barn-Find Classic Roadster in Auto Row', () => {
  const t = prose('repair-roi'), s = prose('specialization');
  const gain = (ops) => { const g = rich({ ops }); const a = crate(g, 'classicCar', 7, { cond: 'broken' }); const q = g.repairQuote(a.id); return { ...q, gain: q.after - q.before - q.cost, before: q.before }; };
  const o1 = gain(1), o3 = gain(3), o4 = gain(4), o5 = gain(5);
  assert.equal(usd(o1.before), '$1,814.40'); assert.equal(usd(o1.cost), '$1,350.00'); assert.equal(usd(o1.after, 0), '$3,024'); assert.equal('-' + usd(-o1.gain), '-$140.40');
  assert.equal(usd(o4.cost), '$100.02'); assert.equal(usd(o4.after, 0), '$5,292'); assert.equal(usd(o4.gain), '$3,377.58');
  for (const x of ['$1,814.40', '$1,350', '$3,024', '-$140.40', '$100.02', '$5,292', '$3,377.58', '$148.18', '0.675']) assert.ok(t.includes(x), 'repair-roi ' + x);
  assert.equal(usd(o5.cost, 0), '$42'); assert.equal(usd(o5.gain, 0), '$4,192'); assert.equal(usd(o3.cost, 0), '$238'); assert.equal(usd(o3.gain, 0), '$2,483');
  assert.equal(usd(o5.gain - o3.gain, 0), '$1,708');
  for (const x of ['$4,192', '$238', '$2,483', '$1,708', '$6,048']) assert.ok(s.includes(x), 'specialization ' + x);
  assert.equal(ZONES[7].rules.repair, 0.25); assert.equal(ZONES[7].bonus.repairMult, 0.9);
});

test('Codex: freight, customs and the arbitrage example are freightQuote and the destination\'s taxes', () => {
  const g = rich({ ops: 3 });
  const a = crate(g, 'van', 7); a.quality = 2000 / g.val(a); // exactly $2,000 of book value
  const q = g.freightQuote([a.id], 8);
  assert.equal(usd(q.book, 0), '$2,000'); assert.equal(usd(q.cost, 0), '$63', 'freight to Harbor Docks, with the district\'s own 30% discount'); assert.ok(Math.abs(q.risk - 0.15) < 1e-9);
  assert.equal(ZONES[8].rules.customs, 0.25);
  const t = prose('supply-chain');
  for (const x of ['$63', '$60', '$10', '$133', '$160', '6.65%', '8.0%', '25% of crates']) assert.ok(t.includes(x) || codex('supply-chain').example.setup.includes(x), x);
  assert.equal(pct((2000 * 0.045 + 60 + 10) / 2000), '8.0%', 'before the discount'); assert.equal(pct((q.cost + 60 + 10) / 2000, 2), '6.65%'); assert.equal(usd(q.cost + 60 + 10, 0), '$133');
  // arbitrage: Copper Cathode Cargo from Corporate Valley to the Global Exchange
  const c = crate(g, 'copperCargo', 13), ship = g.freightQuote([c.id], 16), at16 = g.val(c, 16);
  const tax = g.zoneTax(16) + g.instFee('pitch'), profit = at16 * (1 - tax) - ship.book - ship.cost;
  const A = prose('arbitrage-at-scale');
  assert.equal(usd(ship.book, 0), '$499,200'); assert.equal(usd(at16, 0), '$694,200'); assert.equal(usd(ship.cost, 0), '$23,587');
  assert.equal(usd(profit, 0), '$46,804'); assert.equal(pct(profit / ship.book), '9.4%');
  assert.equal(pct((1 + ship.cost / ship.book) / (1 - tax) - 1), '27.6%');
  for (const x of ['$499,200', '$694,200', '$23,587', '$46,804', '9.4%', '27.6%', '39.1%']) assert.ok(A.includes(x), x);
  assert.equal(usd(1.25 * ship.book * (1 - tax) - ship.book - ship.cost, 0), '$10,795'); assert.ok(A.includes('$10,795'));
});

test('Codex: manager cycles, margins and overhead are the forecast of a real broker in Metro Hub', () => {
  const g = new Game({ perks: [], seed: 1 });
  g.s.skills.ops = 1; // the Codex works the examples at Ops 1 (a level of Ops trims overhead 4%)
  const f = (kind, extra = {}, alloc = 1000) => { const p = { kind, zone: 5, alloc, level: 1, cycles: 0, ...extra }; return { len: g.cycleLen(p), ...g.forecast(p) }; };
  const b = f('broker'), l = f('logistics'), s = f('student');
  assert.deepEqual([b.len, l.len, s.len], [60, 48, 78]);
  assert.deepEqual([b, l, s].map((x) => (x.margin * 100).toFixed(2)), ['7.82', '6.33', '5.98'], '6.8%, 5.5% and 5.2% a cycle x the 1.15 every district shares');
  assert.deepEqual([b.margin * 24 / b.len, l.margin * 24 / l.len, s.margin * 24 / s.len].map((x) => (x * 100).toFixed(2)), ['3.13', '3.16', '1.84']);
  const v = prose('cash-flow-velocity');
  for (const x of ['60 hours', '48 hours', '78 hours', '7.82%', '6.33%', '5.98%', '3.13%', '3.16%', '1.84%', '1.35x', '1.36x', '1.20x', '42%']) assert.ok(v.includes(x), x);
  for (const [m, h, grown] of [[0.0782, 60, 1.35], [0.0633, 48, 1.36], [0.0598, 78, 1.20]]) assert.equal(Math.pow(1 + m, 240 / h).toFixed(2), grown.toFixed(2), 'ten days of reinvesting');
  assert.equal(Math.round((1 - (s.margin * 24 / s.len) / (l.margin * 24 / l.len)) * 100), 42, 'the Student earns 42% less a day than the Logistics Agent');
  // economies of scale
  const e = prose('economies-of-scale');
  for (const [alloc, over, left] of [[100, 6.2, 1.62], [500, 7, 32.1], [1000, 8, 70.2]]) {
    const x = f('broker', {}, alloc);
    assert.ok(Math.abs(x.overhead - over) < 1e-9, `overhead at ${alloc}`);
    assert.ok(Math.abs(x.gross - x.overhead - left) < 1e-9, `left at ${alloc}`);
  }
  for (const x of ['$7.82', '$6.20', '$1.62', '$39.10', '$7.00', '$32.10', '$78.20', '$8.00', '$70.20', '7.5%', '0.3%']) assert.ok(e.includes(x), x);
  const big = f('broker', {}, 5000); assert.equal(((big.gross - big.overhead) / big.alloc * 100).toFixed(1), '7.0', 'the manager\'s own cap stops a level-1 Broker at $1,000, so the $5,000 line is the formula, not a forecast');
  assert.equal((((0.068 * 1.15 * 5000) - (6 + 0.002 * 5000)) / 5000 * 100).toFixed(1), '7.5');
  // the game's own cycle base is 132 hours (it was 80 until the late game was seen to run away, docs/BALANCE.md), not the 48 of PIPE_RULES that nothing reads
  assert.equal(ECON.cycleBase, 132);
  assert.ok(codex('opportunity-cost').example.setup.includes('132 / 2.2 = 60 hours'));
  // the example's manager nets what a real Broker nets on $1,000 per cycle, after fee, tax, royalty and overhead
  assert.equal(usd(b.net), '$31.52'); assert.ok(codex('opportunity-cost').example.setup.includes('$31.50'));
  assert.ok(prose('opportunity-cost').includes('earns $63') && prose('opportunity-cost').includes('-$43') && prose('opportunity-cost').includes('lost $43'));
  assert.equal(Math.round(2 * b.net), 63);
});

test('Codex: the tariff lock slows international lanes, which is all the example claims', () => {
  const g = new Game({ perks: [], seed: 1 });
  const domestic = { kind: 'broker', zone: 5, alloc: 1000, level: 1 }, intl = { ...domestic, channel: 'intl' };
  assert.equal(Math.round(g.forecast(intl).margin * 1e4), 1017, '7.82% x 1.3');
  assert.equal(g.cycleLen(intl), 60, 'before the lock');
  g.s.hour = 74 * 24 + 1; g._m = null; // day 75, the lock is on
  assert.equal(g.cycleLen(intl), 156); assert.equal(g.cycleLen(domestic), 60);
  const t = prose('tariffs');
  for (const x of ['7.82%', '10.17%', '4.07%', '3.13%', '156 hours', '1.56%', '30%', '50%', '96 hours']) assert.ok(t.includes(x), x);
  const day = (p) => g.forecast(p).margin * 24 / g.cycleLen(p);
  assert.equal((day(domestic) * 100).toFixed(2), '3.13'); assert.equal((day(intl) * 100).toFixed(2), '1.56'); assert.equal(Math.round((day(intl) / day(domestic) - 1) * 100), -50, 'from 30% ahead to 50% behind');
  assert.equal(g.mods().repair, 1.45, 'repairs cost 45% more'); assert.ok(codex('tariffs').body[0].includes('outside the four starter districts'));
  const gg = rich(); const a = crate(gg, 'sedan', 3, { cond: 'broken' }); gg.s.hour = 74 * 24 + 1; gg._m = null; const inStarter = gg.repairMultFor(3); assert.equal(inStarter, (1 - (ZONES[3].rules.repair || 0)) * gg.P.repairMult * gg.B.repairMult, 'the lock does not touch the starter districts');
  void a;
});

test('Codex: the shock, pool and loan examples use the live rules (surge cap, fatigue, pool friction, loan rates)', () => {
  const g = rich(); g.injectEvent('tiktok', 14 * 24); g.injectEvent('fed', 44 * 24);
  const gadget = () => g.val({ cls: 'gadgets', cond: 'ok', quality: 1, wear: 1, zone: 5 });
  assert.equal(usd(gadget()), '$729.60');
  g.s.hour = 14 * 24 + 1; g._m = null; assert.equal(usd(gadget(), 0), '$1,900', 'the surge: demand x5 caps at index 2.5');
  g.s.hour = 14 * 24 + 49; g._m = null; assert.equal(usd(gadget()), '$364.80', 'fatigue halves the price');
  const d = prose('demand-shock'); for (const x of ['$729.60', '$1,900', '$364.80', '262', '$1,535']) assert.ok(d.includes(x), x);
  g.s.hour = 0; g._m = null;
  const a = crate(g, 'gadgets', 5), pool = g.poolQuote([a.id]);
  assert.equal(pct(pool.fric), '14.1%'); assert.ok(prose('hedging').includes('14.1%'));
  const bike = crate(g, 'bike', 3), bq = g.poolQuote([bike.id]); assert.equal(usd(bq.total), '$27.12'); assert.equal(pct(1 - bq.fric), '86.7%');
  const radio = crate(g, 'radio', 2), rq = g.poolQuote([radio.id]); assert.equal(usd(rq.total), '$10.03'); assert.equal(pct(rq.fric), '12.9%');
  assert.ok(prose('batna-zopa').includes('$27.12') && prose('net-worth').includes('$10.03'));
  // the Real Estate Row loan: the Financial District's discount is already in the spread
  assert.equal(pct(g.loanRate('pipeline')), '6.1%');
  g.s.hour = 44 * 24 + 1; g._m = null; assert.equal(pct(g.loanRate('pipeline')), '12.1%', 'a credit crunch adds six points');
  const r = prose('asset-cash-flow'); for (const x of ['6.1%', '12.1%', '$504,000', '$2,520', '$45,360', '$14,600', '$15,600']) assert.ok(r.includes(x) || codex('asset-cash-flow').example.setup.includes(x), x);
});

test('Codex: wear, spoilage and obsolescence examples are what a day\'s tick does to the goods', () => {
  const check = (cls, z, days, expect) => { const g = quietGame(z), a = crate(g, cls, z), v0 = g.val(a); pass(g, days); return g.val(a) / v0; };
  const gadgets = check('gadgets', 5, 30), textbooks = check('textbooks', 5, 30), pen = check('pen', 1, 30);
  assert.deepEqual([gadgets, textbooks, pen].map((x) => x.toFixed(3)), ['0.616', '0.835', '0.942']);
  for (const x of ['0.616', '0.835', '0.942', '$450', '$280']) assert.ok(prose('depreciation').includes(x), x);
  const app = (days) => { const g = quietGame(10), a = crate(g, 'mobileApp', 10); pass(g, days); return g.val(a); };
  assert.equal(usd(app(5), 0), '$13,698'); assert.equal(usd(app(10), 0), '$11,169');
  for (const x of ['$16,800', '$13,698', '$11,169', '17 days', '$5,631']) assert.ok(prose('obsolescence').includes(x), x);
  // the harvest wave moves the price too; the example is about spoilage, so it follows the crate's wear against its neutral fair value
  const neutral = assetFMV({ cls: 'produceReefer', cond: 'ok', quality: 1, wear: 1 }, 11, {}, 1);
  const reefer = (days) => { const g = quietGame(11), a = crate(g, 'produceReefer', 11); pass(g, days); return neutral * a.wear; };
  assert.equal(usd(reefer(0), 0), '$20,160'); assert.equal(usd(reefer(1), 0), '$17,402'); assert.equal(usd(reefer(4), 0), '$11,193'); assert.equal(usd(reefer(8), 0), '$6,214');
  assert.equal(Math.round(100 * reefer(10) / reefer(0)), 23); assert.equal(Math.round(100 * reefer(8) / reefer(0)), 31);
  for (const x of ['$17,402', '$11,193', '$6,214', '31%', '23%']) assert.ok(prose('inventory-risk').includes(x), x);
});

test('Codex: the royalty and rent examples are a real 30-day hold', () => {
  const run = (cls, z) => { const g = quietGame(z), a = crate(g, cls, z), nw0 = g.netWorth(), v0 = g.val(a); pass(g, 30); return { yieldPerDay: v0 * ASSETS[cls].yield, nw: g.netWorth() / nw0 - 1, cash: g.s.cash, lost: v0 - g.val(a) }; };
  const m = run('musicRights', 12);
  assert.equal(usd(m.yieldPerDay), '$377.52');
  assert.ok(m.cash > 10500 && m.cash < 11500 && m.lost > 5300 && m.lost < 5700 && Math.round(m.nw * 100) === 6, `about $11,000 paid, about $5,500 lost, about 6% up: ${Math.round(m.cash)} / ${Math.round(m.lost)} / ${pct(m.nw)}`);
  for (const x of ['$94,380', '$377.52', '250 days', '0.4%', '$11,000', '$5,500', '6%']) assert.ok(prose('recurring-revenue').includes(x), x);
  const row = quietGame(15), apt = crate(row, 'apartmentBlock', 15); row.s.hour = 0;
  assert.equal(usd(row.val(apt) * ASSETS.apartmentBlock.yield * row.B.rentMult, 0), '$2,520');
});

test('Codex: the anchors, steps and the hard buyer\'s limit are the haggle game\'s own', () => {
  assert.deepEqual(haggle.ANCHORS, { high: 1.4, fair: 1, low: 0.7 }); assert.deepEqual(haggle.STEPS, { small: 0.04, medium: 0.09, large: 0.16 });
  const view = (fair) => haggle.view(haggle.create({ role: 'sell', fair, style: 'friendly', seed: 1 }));
  const radio = view(11.52), sneaker = view(368.6);
  assert.deepEqual([radio.anchors.high, radio.anchors.fair, radio.anchors.low].map((x) => usd(x)), ['$16.13', '$11.52', '$8.06']);
  assert.equal(usd(radio.steps.medium), '$1.04');
  assert.deepEqual([sneaker.anchors.high, sneaker.anchors.fair, sneaker.anchors.low].map((x) => usd(x)), ['$516.04', '$368.60', '$258.02']);
  for (const x of ['$16.13', '$1.04', '$15.09', '$12.15', '1.05x', '0.69x']) assert.ok(prose('negotiation').includes(x), x);
  for (const x of ['$516.04', '$368.60', '$405.52', '$331.80', '1.32', '$487.50', '$73.72']) assert.ok(prose('anchoring').includes(x) || codex('anchoring').example.setup.includes(x), x);
  const s = haggle.create({ role: 'sell', fair: 368.6, style: 'hard', reserve: 390, seed: 3 });
  assert.equal(haggle.act(s, { type: 'anchor', level: 'high' }).state.flag, 'mad', 'a hard buyer is insulted by an anchor past 1.25 x their limit');
  // the persona fit price multiplier: 1 + 0.2 x score / 0.3 (good) or 1 + 0.15 x score / 0.3 (bad)
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    for (const a of [['prestige', 'story'], ['price', 'utility'], ['scarcity', 'price']]) {
      const st = pitchGame.create({ buyer: { needs: ['prestige', 'retro'], bias: 'prestige' }, asset: { tags: ['prestige', 'retro'] }, seed });
      const o = pitchGame.act(st, { type: 'pick', angles: a }).state.outcome;
      assert.ok(Math.abs(o.fitDelta) <= 0.3 + 1e-12);
      assert.ok(Math.abs(o.mult - (1 + (o.fitDelta >= 0 ? 0.2 : 0.15) * (o.fitDelta / 0.3))) < 1e-12);
    }
  }
  assert.equal((1 + 0.2 * 0.2 / 0.3).toFixed(3), '1.133'); assert.equal((1 + 0.15 * -0.2 / 0.3).toFixed(2), '0.90');
  for (const x of ['1.133', '0.90', '1.26']) assert.ok(prose('persona-fit').includes(x), x);
});

test('Codex: the seasonal wave uses the district\'s own amplitude and goods', () => {
  const r = ZONES[3].rules.season; assert.deepEqual([r.period, r.amp], [28, 0.35]); assert.ok(r.tags.includes('paper') && r.tags.includes('training'));
  assert.deepEqual(ASSETS.courseBooks.tags, ['paper', 'training']); assert.equal(demandOf(ASSETS.courseBooks, 3), 9);
  const g = quietGame(3), a = crate(g, 'courseBooks', 3); g.s.hour = 6 * 24; g._m = null; const peak = g.val(a); g.s.hour = 20 * 24; g._m = null; const trough = g.val(a); // day 7 and day 21 of the 28-day wave
  assert.equal(usd(peak), '$26.49'); assert.equal(usd(trough), '$19.43'); assert.equal((peak / trough).toFixed(2), '1.36');
  for (const x of ['$26.49', '$19.43', '1.36', '36%', '12.15', '5.85']) assert.ok(prose('saturation-herd').includes(x), x);
});

test('Codex: no example names a buyer, good or district that is not in the game, and no entry says zone for a district', () => {
  const names = new Set([...Object.values(ASSETS).map((a) => a.name), ...Object.values(BUYERS).map((b) => b.name)]);
  const mentioned = ['Barn-Find Classic Roadster', 'Pawn-Shop Wristwatch', 'Breakout Mobile App', 'Reefer Load: Fresh Produce', 'Back-Catalog Music Rights', 'Apartment Block (24 Units)', 'Copper Cathode Cargo',
    'Road Bike', 'Vintage Fountain Pen', 'Vintage Tube Radio', 'Viral Gadget Pallet', 'Limited-Release Sneaker Lot', 'Bucket of Scrap Metal'];
  for (const m of mentioned) assert.ok([...names].some((n) => n.startsWith(m.split(' (')[0].replace(' Lot', ''))) || [...names].includes(m), `${m} is a good in the game`);
  const all = JSON.stringify(CODEX);
  for (const stale of ['Fleet Van', 'Vintage Wristwatch', 'Scrap Yard regulars', 'Collector (neither)', 'zone taxes', 'a 10% tariff', 'Fountain Pen is worth $12.51']) assert.ok(!all.includes(stale), `stale phrase: ${stale}`);
  for (const e of CODEX) for (const s of [e.summary, ...e.body, e.example.setup, ...e.example.steps, e.example.result, e.tryIt, ...e.mistakes]) assert.doesNotMatch(s.replace(/Zone Of Possible Agreement|danger zone|green zone/g, ''), /\bzones?\b/i, `${e.id}: "${s.slice(0, 50)}" says zone`);
  assert.ok(codex('margin').body[1].includes('district taxes'));
});

// ===================================================================================================================================
// Data: prices against gates and budgets, names, icons, spellings

test('the flagship goods can be bought at their district\'s gate and have a buyer who can pay for them', () => {
  const fmv = (cls, z) => assetFMV({ cls, cond: 'ok', quality: 1, wear: 1 }, z, {}, 1);
  for (const [cls, z] of [['postwarCanvas', 16], ['officeFloors', 15], ['classicCar', 7], ['watches', 6]]) {
    assert.ok(fmv(cls, z) * ECON.lotDiscHi <= ZONES[z].gate * 1.01, `${cls}: a lot costs ${usd(fmv(cls, z) * ECON.lotDiscHi, 0)}, the gate is ${usd(ZONES[z].gate, 0)}`);
  }
  // for every signature good, some buyer who really wants it (fit >= 0.5) can pay at least 1.5x its fair value
  for (const [cls, a] of Object.entries(ASSETS)) for (const z of Object.keys(a.dem).map(Number)) {
    if (demandOf(a, z) < 6 || a.base < ZONES[z].scale * 0.08 || a.base > ZONES[z].scale * 3.5) continue;
    const top = Math.max(0, ...Object.values(BUYERS).filter((b) => b.zone === z && fitTags(a.tags, b.like) >= 0.5).map((b) => b.budget[1]));
    assert.ok(top >= 1.5 * fmv(cls, z), `${cls} in ${ZONES[z].short}: the richest fitting buyer pays ${usd(top, 0)} against a fair value of ${usd(fmv(cls, z), 0)}`);
  }
});

test('no two goods on one market share an icon, no two districts share one, and the names that sit side by side differ', () => {
  const icons = Object.entries(ASSETS).map(([id, a]) => [a.icon, id]);
  const dup = {}; for (const [i, id] of icons) (dup[i] ||= []).push(id);
  assert.deepEqual(Object.entries(dup).filter(([, ids]) => ids.length > 1), [], 'every asset has its own icon');
  const zi = {}; for (const z of Object.values(ZONES)) (zi[z.icon] ||= []).push(z.name);
  assert.deepEqual(Object.entries(zi).filter(([, n]) => n.length > 1), [], 'every district has its own icon');
  assert.equal(ZONES[4].short, 'Pawn', 'the short name is a shortening of the name');
  assert.ok(ZONES[4].name.startsWith(ZONES[4].short));
  for (const z of Object.values(ZONES)) assert.ok(z.name.replace(/^The /, '').startsWith(z.short) || z.name.includes(z.short.split(' ')[0]) || z.short.length <= z.name.length, z.name);
  // surnames and place names are not shared by two buyers (generic company words may be)
  const generic = new Set(['Mrs', 'Corporate', 'Daughters', 'Records', 'Sons', 'Freight', 'Office', 'Group', 'Mutual', 'Partners', 'Capital', 'Trading']);
  const tok = {};
  for (const [id, b] of Object.entries(BUYERS)) for (const w of b.name.replace(/[,().&']/g, ' ').split(/\s+/).filter((w) => /^[A-Z][a-z]{2,}/.test(w) && !generic.has(w))) (tok[w] ||= new Set()).add(id);
  assert.deepEqual(Object.entries(tok).filter(([, ids]) => ids.size > 1).map(([w, ids]) => w + ': ' + [...ids].join(', ')), [], 'a name belongs to one buyer');
  // one price ladder, one story: the asset pairs the audit found are told apart by name as well as icon
  const lead2 = (id) => ASSETS[id].name.split(' ').slice(0, 2).join(' ').toLowerCase();
  for (const [x, y] of [['courseBooks', 'textbooks'], ['pawnWatch', 'watches'], ['fleaBox', 'estateBox'], ['musicRights', 'royaltyNote'], ['pawnLaptop', 'laptops']]) assert.notEqual(lead2(x), lead2(y), `${x} and ${y} open with the same words`);
  assert.notEqual(ASSETS.pawnWatch.name, 'Vintage Wristwatch'); assert.ok(!/Wristwatch/.test(ASSETS.watches.name));
});

test('content spells in American English throughout (district names are Harbor and Center)', () => {
  const British = /\b(licences?|catalogues?|instalments?|fibre|favourites?|jewell(?:ery|ers)|pyjamas|modell(?:ed|ing)|harbourline|colours?|neighbours?|grey|centre|labour|behaviour|organis(?:e|ed|es|ing|ation)|analys(?:e|ed)|rumours?|specialis(?:e|ed|es|ing|ation)|travell(?:ed|er)|cheque|tyres?|programme|defences?|honour)\b/i;
  const strings = [];
  const walk = (v) => { if (typeof v === 'string') strings.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk([ZONES, ASSETS, BUYERS]); walk(QUESTS); walk(ACHIEVEMENTS); walk(DAILIES); walk(CODEX);
  const bad = strings.filter((s) => British.test(s.replace(/\bGrey\b(?=-market)/, '')));
  assert.deepEqual(bad.map((s) => s.slice(0, 70)), []);
  assert.ok(Object.values(ASSETS).some((a) => /License/.test(a.name)) && Object.values(ASSETS).some((a) => /Catalog\b/.test(a.name)));
  // the data files' comments too: one spelling inside one file
  for (const f of ['js/data/tier1.js', 'js/data/tier2.js', 'js/data/tier3.js', 'js/data/tier4.js']) assert.doesNotMatch(text(f), /\b(Catalogue|Licence|Instalment|fibre|favourite|jewellery|pyjamas|modelled|Harbourline|Grey-market)\b/, f);
  for (const [id, a] of Object.entries(ASSETS)) assert.ok(!(id === 'winterWheat' && a.icon === '🌽'), 'Winter Wheat is not an ear of corn, and the Co-op\'s own icon is the sheaf');
  assert.notEqual(ASSETS.gpuServer.icon, '🖲️');
});

// ===================================================================================================================================
// Scripts, docs and the Pages workflow

test('npm run calibrate starts a legal two-Background founder and says so when it cannot', () => {
  assert.deepEqual(parsePerks(undefined), DEFAULT_PERKS); assert.equal(DEFAULT_PERKS.length, 2);
  assert.deepEqual(parsePerks('trades,pro'), ['trades', 'pro']);
  assert.throws(() => parsePerks('midtier'), /Unknown Background id: midtier/, 'the README\'s old v1 example');
  assert.throws(() => parsePerks('trades,constructor'), /Unknown Background/, 'ids are own keys, not whatever a plain object inherits');
  assert.throws(() => parsePerks('trades'), /exactly two/);
  assert.throws(() => parsePerks('trades,trades'), /exactly two/);
  assert.throws(() => parsePerks('trades,pro,heir'), /exactly two/);
  assert.ok(DEFAULT_PERKS.every((id) => Object.prototype.hasOwnProperty.call(PERKS, id)));
  const g = makeGame(parsePerks(undefined), 'ops', 7); assert.deepEqual(g.s.perks, DEFAULT_PERKS, 'the default game really has both Backgrounds');
});

test('npm run balance plays five seeds by default and counts a wipe-out apart from the days', () => {
  assert.ok(DEFAULT_SEEDS >= 5);
  const pkg = JSON.parse(text('package.json')); assert.equal(pkg.scripts.balance, 'node tests/balance.mjs');
  const r = balance({ seeds: 5, every: 12, pairs: [['trades', 'pro'], ['native', 'pro']] });
  assert.equal(r.runs, 10);
  for (const row of r.rows) {
    assert.ok(row.wiped >= 0 && row.wiped <= 5);
    if (row.wiped < 5) assert.ok(row.d.every((d) => d == null || d <= 91), 'a wipe-out never shows up as a slow day');
  }
  // world seed 100 was a wipe-out for Native (every game of the pair; seeds 117 and 134 too, with the ops specialty): the old two-seed default folded that into a median of 91 and read it as "200% slow". Mended since (a founder
  // down to the last crate is vouched for), and held: a return of the fault is a wipe-out here, not only a column in a table
  const native = balance({ seeds: 3, every: 4, pairs: [['native', 'pro'], ['native', 'trades'], ['native', 'grad']] });
  assert.equal(native.wipedRuns, 0, 'no Native run is wiped out on seeds 100, 117 and 134: ' + native.rows.map((r) => r.pair + ' ' + r.wiped).join(', '));
  assert.ok(wipedOut({ s: { cash: 0, assets: [], pipes: [] } }) && !wipedOut({ s: { cash: 0, assets: [{}], pipes: [] } }) && !wipedOut({ s: { cash: 5, assets: [], pipes: [] } }));
});

test('the docs quote the numbers in js/config.js and the commands package.json has', () => {
  const B = text('docs/BALANCE.md'), R = text('README.md'), A = text('docs/ARCHITECTURE.md'), F = text('docs/FACULTY_KIT.md'), pkg = JSON.parse(text('package.json'));
  for (const k of ['pitchK', 'margin', 'cycleBase', 'lotDiscHi', 'lotDiscLo', 'lotSlots']) assert.ok(new RegExp(`${k}\`? ${ECON[k]}\\b`).test(B), `BALANCE.md says ${k} ${ECON[k]}`);
  assert.ok(new RegExp(`LEVEL_XP\`? ${LEVEL_XP}\\b`).test(B) && B.includes('floor(sqrt(xp / LEVEL_XP)) + 1'));
  assert.doesNotMatch(B, /pitchK 0\.9|margin 0\.45|sqrt\(xp\/100\)|78-95%/);
  assert.ok(B.includes(`${Math.round(ECON.lotDiscLo * 100)}`) && B.includes(`${Math.round(ECON.lotDiscHi * 100)}%`), 'the hidden-truth discount band');
  assert.doesNotMatch(R, /\b\d+ tests\b/, 'no test count that goes stale');
  assert.doesNotMatch(R, /pick a profile|midtier|Bootstrapper|Venture-Backed|all three profiles|Level 0/);
  for (const m of R.matchAll(/npm run (\w+)/g)) assert.ok(pkg.scripts[m[1]], `README: npm run ${m[1]} exists`);
  for (const m of R.matchAll(/npm run calibrate -- ([\w,]+)/g)) assert.doesNotThrow(() => parsePerks(m[1]));
  assert.match(A, /new Game\(\{perks: \[a, b\]/); assert.doesNotMatch(A, /\{profile/);
  assert.doesNotMatch(F, /Zone 2|\bprofile\b|all three/i);
  assert.match(F, /Metro Hub/);
  for (const f of [R, A, F, B]) assert.doesNotMatch(f, /\bZone \d\b/);
});

test('the Pages workflow runs the tests, then deploys, and is valid YAML', () => {
  const y = text('.github/workflows/pages.yml');
  assert.doesNotMatch(y, /\t/, 'YAML takes no tabs');
  assert.match(y, /^jobs:\n {2}test:\n/m);
  assert.match(y, /^ {2}deploy:\n {4}needs: test\n/m, 'deploy waits for the tests');
  assert.match(y, /^ +npm test\b/m);
  assert.match(y, /npm ci --prefix server/, 'the multiplayer tests need the relay\'s dependencies');
  assert.match(y, /todo/i, 'a test marked todo is a known fault: the deploy waits for it too');
  for (const line of y.split('\n')) assert.ok(!/^ +$/.test(line) && line.search(/\S|$/) % 2 === 0, `uneven indentation: "${line}"`);
});
