// Content audit, what was left open (docs/V2_DESIGN.md sections 4, 7.1, 12; tests/audit-content.test.mjs is the first round).
// Three things live here: (1) every Codex entry that audit-content.test.mjs does not already recompute is recomputed here, from the engine, the data or the
// arithmetic it states, so that no entry quotes a number, a buyer, a good or a rule the game does not have; (2) the spelling and the word "district" are checked
// over every player-facing string the game can show, not only the tables the first round walked; (3) the audit's "fixed" items that the content cluster owns
// are played again with other seeds, Backgrounds and parameters than the tests that guard them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { Game } from '../js/engine.js';
import { startRun } from '../js/deal.js';
import { Progress } from '../js/meta/progress.js';
import { QUESTS, ACHIEVEMENTS, DAILIES } from '../js/meta/quests.js';
import { goalDelta, goalDone } from '../js/meta/match.js';
import { CODEX } from '../js/meta/codex.js';
import { ACADEMY } from '../js/meta/academy.js';
import {
  ASSETS, BUYERS, ZONES, ECON, LOANS, AUDIT, AUDIT_THEMES, CLIENTS, DEBT, FEES, EVENTS, ALGO_EVENTS, PERKS, SKILLS, SKILL_MAX, PIPE, UPGRADES, MIL, FMV_BAND,
  EEI_FLOOR_DEFAULT, CM, PIPE_RULES, FRESH,
} from '../js/config.js';
import { creativity, eei as eeiOf, fitOf } from '../js/market.js';
import { demandOf } from '../js/data/schema.js';
import { PROBES } from '../js/play/inspect.js';
import * as haggle from '../js/play/haggle.js';
import { RNG } from '../js/rng.js';

const ROOT = new URL('../', import.meta.url);
const text = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const codex = (id) => { const e = CODEX.find((x) => x.id === id); assert.ok(e, `Codex entry ${id}`); return e; };
/** Every string an entry shows, in one piece. */
const prose = (id) => { const e = codex(id); return [e.title, e.summary, ...e.body, e.formula || '', e.example.setup, ...e.example.steps, e.example.result, ...e.mistakes, e.tryIt].join('\n'); };
/** The figures each test has named for an entry (recomputed, or declared as the entry's own assumption): the last test of the file holds the examples to them. */
const NAMED = new Map();
const name = (id, parts) => { const set = NAMED.get(id) || NAMED.set(id, new Set()).get(id); for (const p of parts) set.add(p); };
const says = (id, ...parts) => { const t = prose(id); for (const p of parts) assert.ok(t.includes(p), `${id} should say "${p}"`); name(id, parts); };
/** What an entry assumes ("Say you borrow $20,000"): nothing to recompute, but named, so that a figure nobody named cannot slip into an example. */
const given = (id, ...parts) => { const t = prose(id); for (const p of parts) assert.ok(t.includes(p), `${id} should say "${p}"`); name(id, parts); };
const usd = (x, d = 2) => '$' + (Math.round((Math.abs(x) + 1e-9) * 10 ** d) / 10 ** d).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} is not within ${tol} of ${b}`);

/** A game with districts 1 to `zone` open and nothing else going on (no events, no stock, no cash, no algorithmic shocks). */
function quietGame(zone, { perks = [], seed = 5 } = {}) {
  const g = new Game({ perks, seed });
  g.env.algo = false; g.s.events = []; g.s.assets = []; g.s.cash = 0;
  for (let z = 1; z <= zone; z++) if (!g.s.zones.includes(z)) { g.s.zones.push(z); g.s.leads[z] = []; g.s.lots[z] = []; g.s.pool[z] = ZONES[z].pool; }
  g._bn = null;
  return g;
}
/** Let `days` midnights pass over what is held (wear, interest, contracts) without anything else moving. */
function pass(g, days) { for (let d = 0; d < days; d++) { for (let h = 0; h < 24; h++) { g.s.hour++; g._m = null; if (g.s.hour % 24 === 0) g._dayTick(); } } }
const crate = (g, cls, zone, o = {}) => { const a = g._mk(g.s, cls, { zone, basis: 0, ...o }); g.s.assets.push(a); return a; };
/** A crate of `cls` in `zone` whose fair value there is exactly `worth`. */
const crateWorth = (g, cls, zone, worth) => { const a = crate(g, cls, zone); a.quality = worth / g.val(a); return a; };
/** A manager as the engine keeps one (only the fields the money rules read). */
const manager = (g, o = {}) => ({ id: 'P' + g.s.nid++, kind: 'broker', zone: 5, level: 1, status: 'running', inflight: 0, basis: 0, ...o });
const open = (g, ms = ['m1']) => { for (const m of ms) g.s.mil[m] = true; return g; };

/** The game's own numbers: one cash-rich founder with every district open. */
function rich() { const g = new Game({ perks: [], seed: 5, specialty: 'ops' }); g.env.algo = false; g.s.events = []; g.s.cash = 1e8; g._unlock(); g.s.cash = 0; return g; }

// ===================================================================================================================================
// Which entries are recomputed where: audit-content.test.mjs has the first twenty-four, the thirty-two others are below

const FIRST_ROUND = ['utility-fit', 'negotiation', 'saturation-herd', 'information-asymmetry', 'repair-roi', 'supply-chain', 'obsolescence', 'inventory-risk', 'recurring-revenue', 'asset-cash-flow',
  'arbitrage-at-scale', 'fair-market-value', 'asset-utility-score', 'creativity-multiplier', 'persona-fit', 'urgency-premium', 'depreciation', 'opportunity-cost', 'cash-flow-velocity', 'tariffs',
  'demand-shock', 'anchoring', 'specialization', 'economies-of-scale'];
const HERE = ['working-capital', 'winners-curse', 'scale-compliance', 'enterprise-sales', 'leverage-risk', 'margin', 'compounding', 'interest-and-compounding', 'market-saturation', 'debt-to-equity',
  'margin-call', 'collateral', 'cac-vs-ltv', 'sla', 'audit-compliance', 'credit-crunch', 'diversification', 'hedging', 'batna-zopa', 'adverse-selection', 'due-diligence', 'comparative-advantage',
  'network-effects', 'risk-of-ruin', 'expected-value', 'eei-score', 'reputation', 'exit-valuation', 'supply-and-demand', 'net-worth', 'liquidity', 'sunk-cost'];

test('every Codex entry is recomputed by one of the two audit files, and the first round\'s list is still true', () => {
  const ids = CODEX.map((e) => e.id);
  assert.deepEqual([...FIRST_ROUND, ...HERE].filter((id) => !ids.includes(id)), [], 'no list names an entry that is gone');
  assert.deepEqual(ids.filter((id) => !FIRST_ROUND.includes(id) && !HERE.includes(id)), [], 'a new Codex entry needs a recomputation of its example');
  const first = text('tests/audit-content.test.mjs');
  for (const id of FIRST_ROUND) assert.ok(first.includes(`'${id}'`), `${id} is named in tests/audit-content.test.mjs`);
  const mine = text('tests/remaining-content.test.mjs');
  for (const id of HERE) assert.ok(mine.split(`'${id}'`).length > 2, `${id} is checked in this file, not only listed`);
});

// ===================================================================================================================================
// Finance and risk: loans, audits, clients, the Bank

test('Codex working-capital: the bridge is the Micro-Business Line, 3% up front and 12% per 30 days, and the example adds up', () => {
  assert.equal(LOANS.micro.fee, 0.03);
  const g = open(quietGame(5)); g.s.cash = 5000;
  assert.equal(pct(g.loanRate('micro'), 0), '12%');
  const cash0 = g.s.cash;
  assert.ok(g.draw('micro', 1000).ok);
  const fee = 1000 - (g.s.cash - cash0);
  pass(g, 3);
  const interest = g.debt() - 1000;
  assert.equal(usd(fee, 0), '$30'); assert.equal(usd(interest, 0), '$12', 'three days of 12% per 30 days');
  assert.equal(usd(fee + interest, 0), '$42'); assert.equal(usd(300 - fee - interest, 0), '$258');
  says('working-capital', '3% fee', '12% per 30 days', '$30', '$12', '$42', '$300', '$258');
  // money allocated to managers is still yours: moving $1,800 of $2,000 into managers leaves net worth where it was
  const h = quietGame(5); h.s.cash = 2000; const nw = h.netWorth(); h.s.cash -= 1800; h.s.pipes.push(manager(h, { basis: 1800 }));
  assert.equal(h.netWorth(), nw);
  says('working-capital', '$2,000', '$1,800', '$200');
});

test('Codex winners-curse: the winning guess of five runs 13.3% over, Estate Sales sends 55% of its lots to auction, and Fintech sharpens the estimate', () => {
  const a = 0.2, n = 5;
  assert.equal(pct(a * (n - 1) / (n + 1)), '13.3%');
  const rng = new RNG(7); let sum = 0; const T = 60000; // the entry's model: five guesses, each even within +/-20% of the truth
  for (let t = 0; t < T; t++) { let top = -1; for (let i = 0; i < n; i++) top = Math.max(top, rng.range(-a, a)); sum += top; }
  near(sum / T, 0.1333, 0.003, 'the mean of the top guess');
  assert.equal(usd(1000 * (1 + 0.2 * 4 / 6), 0), '$1,133'); assert.equal(usd(1000 * 0.2 * 4 / 6, 0), '$133');
  assert.equal(((1 - 1 / 1.1333) * 100).toFixed(0), '12', 'dividing by 1.133 shades the bid about 12% under the estimate');
  assert.equal(usd(1133.33 / 1.1333, 0), '$1,000');
  says('winners-curse', '13.3%', '$1,133', '-$133', '12%', '$1,000');
  // Estate Sales: the rule is 55% of the lots, and the page says so
  assert.equal(ZONES[6].rules.auction, 0.55);
  const g = quietGame(6); let auctions = 0; const N = 3000;
  for (let i = 0; i < N; i++) { g.s.lots[6] = []; g._spawnLot(6, false); if (g.s.lots[6][0]?.mode === 'auction') auctions++; }
  near(auctions / N, 0.55, 0.04, 'Estate Sales auction share');
  assert.match(codex('winners-curse').body[0], /55%/);
  // Fintech sharpens the estimate: the auction's own noise falls with the skill
  assert.match(text('js/deal.js'), /sdEst\s*=\s*clamp\([^)]*fintech/);
  assert.match(codex('winners-curse').body[2], /Fintech/);
});

test('Codex scale-compliance and audit-compliance: the fee, the clock, the fines and the odds are the engine\'s', () => {
  assert.deepEqual([AUDIT.fee, AUDIT.fine, AUDIT.passChance, AUDIT.velocityHit, AUDIT.pauseHours, AUDIT.everyDays, AUDIT.deadlineHours], [1200, 5000, 0.15, 0.85, 120, 15, 72]);
  assert.equal(MIL.m2, 25000); assert.equal(ZONES[9].gate, 25000); assert.equal(ZONES[9].rules.audits, true);
  assert.equal(usd(AUDIT.fee / AUDIT.everyDays, 0), '$80', 'compliance runs $80 a day');
  assert.equal(pct(80 / 750), '10.7%'); assert.equal(pct(80 / 7500), '1.1%');
  const g = open(quietGame(9), ['m1', 'm2']); g.s.cash = 100000; g.s.auditNext = 0;
  g._audits();
  const a = g.s.auditPending; assert.ok(a, 'the audit arrives the hour the milestone is passed'); assert.equal(a.due - g.s.hour, 72, 'you have 72 virtual hours');
  const fines = []; for (const n of [0, 1, 2]) { g.s.auditFail = n; fines.push(g.auditFine()); } g.s.auditFail = 0;
  assert.deepEqual(fines, [5000, 7500, 11250], 'each failure makes the next fine 1.5 times bigger');
  // ignoring it: the fine, the permanent 15% slow-down, and the next audit 15 days later
  const cash0 = g.s.cash; g.s.hour = a.due; g._audits();
  assert.equal(cash0 - g.s.cash, 5000); assert.equal(g.s.velPenalty, 0.85); assert.equal(g.s.auditFail, 1); assert.equal(g.s.auditIgnored, 1);
  assert.equal(g.s.auditNext - g.s.hour, 15 * 24);
  // the three answers: the consultant, a manager for five days, skipping the filing
  g.s.auditFail = 0; g.s.auditPending = { id: 'x', due: g.s.hour + 72 }; const c1 = g.s.cash; assert.ok(g.resolveAudit('A').ok); assert.equal(c1 - g.s.cash, 1200);
  const p = manager(g); g.s.pipes.push(p); g.s.auditPending = { id: 'y', due: g.s.hour + 72 }; assert.ok(g.resolveAudit('B', p.id).ok); assert.equal(p.pausedUntil - g.s.hour, 5 * 24);
  let slipped = 0; const N = 3000;
  for (let i = 0; i < N; i++) { g.s.auditPending = { id: 'z', due: g.s.hour + 72 }; g.s.auditFail = 0; g.s.cash = 1e6; const before = g.s.auditPass; g.resolveAudit('C'); if (g.s.auditPass > before) slipped++; }
  near(slipped / N, 0.15, 0.025, 'skipping the filing');
  assert.equal(pct(0.15 ** 3), '0.3%');
  says('scale-compliance', '15 days', '$1,200', '$80 a day', '10.7%', '1.1%', '$5,000', '$7,500', '$11,250', '$25,000');
  says('audit-compliance', '15 days', '72 virtual hours', '$1,200', 'five days', '15%', '85%', '$5,000', '$4,250', '$3,050', '$7,500', '$11,250', '0.3%', '1.5');
  // the bank offers the third path as "Skip the filing and hope", and the entry uses the game's words for it
  assert.match(text('js/ui/drawers/bank.js'), /C\. Skip the filing and hope/);
  assert.match(codex('audit-compliance').body[0], /skip the filing and hope/i);
  assert.doesNotMatch(codex('audit-compliance').body[0], /ignore it and hope/i);
});

test('Codex cac-vs-ltv, sla and enterprise-sales: the accounts, their taxes, their penalties and their end are the engine\'s', () => {
  const g = open(quietGame(13), ['m1', 'm2', 'm3']);
  assert.equal(ZONES[5].tax, 0.05); assert.equal(ZONES[13].tax, 0.126);
  // CAC versus LTV: an SMB account in Metro Hub, then at Growth 3 (CAC 8% a level cheaper)
  assert.deepEqual([CLIENTS.smb.cac, CLIENTS.smb.perDay, CLIENTS.smb.days, CLIENTS.smb.zone], [450, 55, 30, 5]);
  const q1 = g.clientQuote('smb'); g.s.skills.growth = 3; const q3 = g.clientQuote('smb'); g.s.skills.growth = 1;
  assert.deepEqual([usd(55 * 0.95), usd(q1.ltv)], ['$52.25', '$1,567.50']);
  assert.deepEqual([q1.ratio.toFixed(1), q1.payback.toFixed(1)], ['3.5', '8.6']);
  assert.deepEqual([usd(q3.cac, 0), q3.ratio.toFixed(1), q3.payback.toFixed(1)], ['$378', '4.1', '7.2'], 'Growth 3 takes 16% off the CAC');
  assert.deepEqual([(q1.ltv / 1200).toFixed(1), (1200 / 52.25).toFixed(0)], ['1.3', '23'], 'the same account at $1,200 CAC');
  says('cac-vs-ltv', '$450', '$55 a day', '30 days', '5%', '$52.25', '$1,567.50', '3.5', '8.6 days', '$378', '4.1', '7.2 days', '1.3', '23-day', '8% a level');
  // SLA: a corporate account pays $380 ($361 after tax) while two managers run, and costs twice the fee for each day under that
  assert.deepEqual([CLIENTS.corp.perDay, CLIENTS.corp.days, CLIENTS.corp.minRunning], [380, 45, 2]);
  const h = open(quietGame(9), ['m1', 'm2']); h.s.cash = 50000;
  h.s.pipes = [manager(h), manager(h)]; h.s.clients.push({ id: 'C1', tier: 'corp', cac: 4000, until: 1e9, earned: 0, breaches: 0 });
  h.s.hour = 12 * 24; let c0 = h.s.cash; h._dayTick();
  assert.equal(usd(h.s.cash - c0), '$361.00', 'paid after Metro Hub\'s 5% tax');
  h.s.pipes[1].status = 'audit'; // a manager on compliance duty is not running
  c0 = h.s.cash; h.s.hour += 24; h._dayTick(); assert.equal(c0 - h.s.cash, 760, 'the first missed day costs 2 x $380'); assert.equal(h.s.clients.length, 1);
  c0 = h.s.cash; h.s.hour += 24; h._dayTick(); assert.equal(c0 - h.s.cash, 760); assert.equal(h.s.clients.length, 0, 'the second miss ends the contract');
  assert.equal(usd(760 * 2, 0), '$1,520'); assert.equal(usd(32 * 361, 0), '$11,552'); assert.equal(usd(1520 + 11552, 0), '$13,072');
  says('sla', '$380', '$361', '45 days', 'two managers', '$760', '$1,520', '$11,552', '2 x');
  // Enterprise: $3,200 a day, $2,797 after Corporate Valley's 12.6%, three managers, the penalty is $6,400
  assert.deepEqual([CLIENTS.ent.cac, CLIENTS.ent.perDay, CLIENTS.ent.days, CLIENTS.ent.minRunning, CLIENTS.ent.zone], [40000, 3200, 60, 3, 13]);
  const net = 3200 * (1 - ZONES[13].tax);
  assert.deepEqual([usd(net, 0), usd(net * 60, 0), (net * 60 / 40000).toFixed(1), (40000 / net).toFixed(1), pct(net / (net + 1000))], ['$2,797', '$167,808', '4.2', '14.3', '73.7%']);
  assert.equal(usd(Math.round(net * 50 / 1000) * 1000, 0), '$140,000', 'the contract with 50 of its 60 days still to run');
  const e = open(quietGame(13), ['m1', 'm2', 'm3']); e.s.cash = 1e5; e.s.pipes = [manager(e), manager(e), manager(e, { status: 'idle' })]; e.s.clients.push({ id: 'C2', tier: 'ent', cac: 40000, until: 1e9, earned: 0, breaches: 0 });
  c0 = e.s.cash; e._dayTick(); assert.equal(c0 - e.s.cash, 6400, 'two managers where three are needed: twice the daily fee');
  says('enterprise-sales', '$2,797', '$40,000', '$3,200 a day', '60 days', '12.6%', '$167,808', '4.2', '14.3 days', '73.7%', '$6,400', '$140,000', 'three managers');
});

test('Codex credit-crunch: the Fed Taper moves the index, the fee, the overhead and the freeze exactly as the entry says', () => {
  const g = open(quietGame(5)); g.s.cash = 5000;
  assert.equal(pct(g.loanRate('pipeline')), '7.0%', 'a 2.5% index plus a 4.5% spread');
  const t0 = 44 * 24; g.injectEvent('fed', t0);
  const at = (h) => { g.s.hour = h; g._m = null; return { rate: g.loanRate('pipeline'), fee: g.instFee('pitch'), ovh: g.mods().overhead, freeze: !!g.mods().freeze }; };
  const before = at(t0 - 1), during = at(t0 + 1), thawed = at(t0 + 241), over = at(t0 + 361);
  assert.deepEqual([pct(before.rate), pct(during.rate), before.fee, during.fee, during.ovh], ['7.0%', '13.0%', 0.025, 0.12, 1.2]);
  assert.deepEqual([during.freeze, thawed.freeze, thawed.rate === during.rate, over.rate === before.rate], [true, false, true, true], 'the freeze is 10 days, the rates last 15');
  assert.equal(EVENTS.fed.day, 45); assert.match(EVENTS.fed.alert.vars[0], /2\.5% to 8\.5% \(\+600 bps\)/); assert.match(EVENTS.fed.alert.vars[1], /2\.5% to 12\.0%/); assert.match(EVENTS.fed.alert.vars[2], /20%/);
  const d = (rate) => 2000 * rate / 30;
  assert.deepEqual([usd(d(before.rate)), usd(d(during.rate)), pct(d(during.rate) / d(before.rate) - 1, 0)], ['$4.67', '$8.67', '86%']);
  assert.equal(usd((d(during.rate) - d(before.rate)) * 15, 0), '$60', 'over the 15 days the rate lasts');
  assert.deepEqual([usd(1000 * before.fee, 0), usd(1000 * during.fee, 0)], ['$25', '$120']);
  says('credit-crunch', '2.5% to 8.5%', '+600 bps', '2.5% to 12%', '20%', '10 days', '7.0%', '13.0%', '$4.67', '$8.67', '86%', '$60', '$25', '$120', '15 days');
});

test('Codex debt-to-equity, margin-call, collateral and leverage-risk: the limits, the trigger, the fire sale and the loan limit are the engine\'s', () => {
  assert.deepEqual(DEBT, { maxDE: 3, callDE: 4.5, fireSale: 0.35 });
  // debt-to-equity: the worked balance sheet, its room to borrow and the 20% fall
  const g = open(quietGame(5)); g.s.cash = 300; const stock = crateWorth(g, 'pen', 1, 1900); g.s.pipes.push(manager(g, { basis: 1200 }));
  g.s.loans.push({ id: 'D1', prod: 'micro', principal: 1500, accr: 30, last: 0, next: 24 });
  assert.equal(usd(g.netWorth(), 0), '$1,870'); assert.equal(g.deRatio().toFixed(2), '0.82'); assert.equal(usd(g.loanRoom('micro').de, 0), '$4,080', 'room to borrow = 3.0 x net worth - debt');
  stock.quality *= 0.8; assert.equal(usd(g.netWorth(), 0), '$1,490'); assert.equal(g.deRatio().toFixed(2), '1.03');
  says('debt-to-equity', '$1,870', '0.82', '$4,080', '$380', '$1,490', '1.03', '4.5', '3.0');
  // margin-call: $4,000 of assets against $3,000 of debt is D/E 3.0; the call fires below $3,667 (an 8.3% fall)
  const call = (assets) => {
    const h = open(quietGame(5)); const half = assets / 2; crateWorth(h, 'pen', 1, half); crateWorth(h, 'scrap', 1, half);
    h.s.loans.push({ id: 'D1', prod: 'micro', principal: 3000, accr: 0, last: 0, next: 1e9 });
    const de = h.deRatio(); h._marginCall(); return { de, sales: h.s.ledger.filter((e) => e.type === 'margin').map((e) => e.amt) };
  };
  near(call(4000).de, 3, 1e-9, 'D/E at $4,000 of assets'); assert.deepEqual(call(4000).sales, []);
  assert.equal(usd(3000 * (1 + 1 / 4.5), 0), '$3,667'); assert.equal(pct(1 - 3000 * (1 + 1 / 4.5) / 4000), '8.3%');
  assert.deepEqual(call(3700).sales, [], 'above the trigger nothing happens'); assert.ok(call(3660).sales.length > 0, 'below it the Bank sells');
  const c = call(3600);
  near(c.de, 5, 1e-9, 'D/E at $3,600'); assert.equal(usd(c.sales[0], 0), '$1,170', 'an $1,800 asset sold at 35% off'); assert.equal(c.sales.length, 2, 'at net worth -$30 the Bank sells again');
  assert.equal(usd(1800 * DEBT.fireSale, 0), '$630', 'the discount alone destroyed more than the dip'); assert.equal(usd(3000 - 1170, 0), '$1,830');
  says('margin-call', '35%', '4.5', '$3,667', '8.3%', '5.0', '$1,170', '$1,830', '-$30', '$630');
  // collateral: 50% of stock plus managers at cost; a 35% fire sale recovers 65%
  const k = open(quietGame(5)); k.s.cash = 10000; crateWorth(k, 'pen', 1, 4000); k.s.pipes.push(manager(k, { basis: 2000 }));
  assert.equal(LOANS.pipeline.limitPct, 0.5); assert.equal(usd(k.loanRoom('pipeline').limit, 0), '$3,000');
  assert.deepEqual([usd(3000 / 0.65, 0), pct(1 - 3000 / 0.65 / 6000, 0)], ['$4,615', '23%']);
  says('collateral', '50%', '$6,000', '$3,000', '65%', '$4,615', '23%', '35%');
  // leverage-risk: return on equity = asset return x (1 + D/E) - interest x D/E
  const roe = (r, de, i) => r * (1 + de) - i * de;
  assert.deepEqual([pct(roe(0.06, 2, 0.012)), pct(roe(-0.15, 2, 0.012)), usd(10000 * (1 + roe(-0.15, 2, 0.012)), 0), usd(20000 / 4.5, 0)], ['15.6%', '-47.4%', '$5,260', '$4,444']);
  assert.equal(pct((10000 - 20000 / 4.5) / 30000), '18.5%', 'the asset drop that brings equity down to the trigger');
  assert.equal(ZONES[14].bonus.spreadMult, 0.8); assert.equal(ZONES[13].bonus.creditLimitMult, 1.5);
  says('leverage-risk', '15.6%', '-47.4%', '$5,260', '$4,444', '18.5%', '4.5', '35%');
});

test('Codex exit-valuation and eei-score: the quote, the brokerage, the audit record and the score are the engine\'s', () => {
  const g = open(quietGame(13), ['m1', 'm2', 'm3']); g.s.cash = 20000; g.s.pipes = [manager(g, { basis: 90000 })];
  g.s.loans = [{ id: 'D1', prod: 'micro', principal: 30000, accr: 0, last: 0, next: 24 }]; g.s.dp = Array(14).fill(4000);
  const trade = g.exitQuote('trade'), ipo = g.exitQuote('ipo');
  assert.deepEqual([trade.premium, trade.brokerage, trade.proceeds, trade.hours], [24000, 13680, 90320, 48]);
  assert.deepEqual([ipo.premium, ipo.brokerage, ipo.proceeds], [40000, 15600, 104400]);
  assert.equal(ipo.proceeds - trade.proceeds, 14080); assert.equal(FEES.exitBrokerage, 0.12);
  g.s.auditFail = 2; const t2 = g.exitQuote('trade');
  assert.deepEqual([t2.premium, t2.proceeds, trade.proceeds - t2.proceeds], [16800, 83984, 6336]);
  assert.equal(pct(t2.premium / trade.premium, 0), '70%', 'two failed audits leave 70% of the premium'); says('exit-valuation', '70%');
  assert.equal(g.exitQuote('ipo').ok, false, 'an IPO is closed to a founder with a failed audit');
  g.s.auditFail = 1; assert.equal(Math.round(g.exitQuote('trade').premium / 24000 * 100), 85, 'each failed audit cuts the premium by 15%');
  const m = quietGame(16); assert.equal(m.B.exitMult, 1.1, 'the Global Exchange makes exit multiples 10% richer');
  assert.equal(ZONES[13].gate, 250000); assert.equal(MIL.m3, 250000);
  says('exit-valuation', '$250,000', '6 times', '14 days', '10 times', '12%', '48 hours', '15%', '10% richer', '$24,000', '$13,680', '$90,320', '$40,000', '$15,600', '$104,400', '$16,800', '$83,984', '$14,080', '$6,336');
  // the score: net worth over the stake (never under $1,000), times one plus the share of the 90 days left
  assert.equal(EEI_FLOOR_DEFAULT, 1000);
  const ada = eeiOf(40000, ASSETS.paperclip.base, 0, EEI_FLOOR_DEFAULT), bo = eeiOf(36000, ASSETS.paperclip.base, 28, EEI_FLOOR_DEFAULT);
  assert.deepEqual([ada.toFixed(1), bo.toFixed(1), pct(bo / ada - 1, 0), pct(28 / 90, 0)], ['40.0', '47.2', '18%', '31%']);
  assert.equal(usd(40000 - 36000, 0), '$4,000');
  // an exit begun in the last hour of day 60 settles 48 hours later with 28 days left
  const x = open(quietGame(13), ['m1', 'm2', 'm3']); x.s.cash = 36000; x.s.hour = 60 * 24 - 1; x.s.startCapital = ASSETS.paperclip.base;
  assert.ok(x.exit('trade').ok); for (let i = 0; i < 48; i++) x.stepHour();
  assert.ok(x.s.over && x.s.exit, 'the exit has settled'); assert.equal(Math.round(x.s.exit.daysLeft), 28);
  says('eei-score', '90 days', '$1,000', '12%', '48 hours', '40.0', '47.2', '18%', '31%', '28 days');
});

// ===================================================================================================================================
// Markets: saturation, supply and demand, the pool, net worth

test('Codex market-saturation: the 48-hour window, the cap on S, the pool\'s share and the worked multipliers are creativity()', () => {
  const cm = (n, t) => creativity(n, t);
  assert.deepEqual([cm(4, 20).toFixed(2), cm(8, 24).toFixed(2), pct(1 - cm(8, 24) / cm(4, 20), 0)], ['1.51', '0.97', '35%']);
  assert.equal((4 / 20).toFixed(2), '0.20'); assert.equal((8 / 24).toFixed(2), '0.33');
  says('market-saturation', '1.51', '0.97', '35%', 'S = 4 / 20 = 0.20', 'V_niche = 8, V_total = 24', '48 hours');
  const g = quietGame(3); const s0 = g.cmFor(3, 'courseBooks', 'bookstore');
  assert.deepEqual([s0.vN, s0.vT, s0.S], [0, 0, 0]);
  for (let i = 0; i < 2; i++) g.logNiche(3, 'courseBooks', 'npc-pool', 1.68); // pool sales add to the total and to nobody's share
  for (let i = 0; i < 3; i++) g.logNiche(3, 'courseBooks', 'bookstore', 1.68);
  const s1 = g.cmFor(3, 'courseBooks', 'bookstore'), s2 = g.cmFor(3, 'courseBooks', 'student');
  assert.deepEqual([s1.vN, s1.vT], [3, 5]); assert.deepEqual([s2.vN, s2.vT], [0, 5]);
  g.s.hour += 49; // the window is 48 virtual hours: an old crowd clears
  assert.deepEqual([g.cmFor(3, 'courseBooks', 'bookstore').vN, g.cmFor(3, 'courseBooks', 'bookstore').vT], [0, 0]);
  assert.equal(creativity(5, 5), 0.4, 'S is capped at 1, which leaves the floor');
  // saturation-herd's crowd: 45 of the last 60 textbook pitches went to the Bookstore, S = 0.75, and the multiplier sits on its floor, about a quarter of a balanced 1.68
  assert.deepEqual([45 / 60, creativity(45, 60), (0.4 / 1.68).toFixed(2)], [0.75, 0.4, '0.24']); says('saturation-herd', '45 of the last 60', 'S = 0.75', '0.40 floor', 'a quarter');
  // creativity-multiplier: whatever the arithmetic, a buyer never pays more than their stated budget
  const h = rich(); const a = crate(h, 'pen', 1), l = { id: 'LB1', zone: 1, seg: 'marguerite', budget: 0.5, born: 0, exp: 99 }; h.s.leads[1].push(l);
  const capped = h.quotePitch(a.id, l.id, { mult: 1.4 }); assert.equal(capped.price, 0.5); assert.equal(capped.capped, true);
  assert.match(codex('creativity-multiplier').body[2], /never pays more than their stated budget/);
});

test('Codex supply-and-demand: every 55 trades take roughly 5% off, up to 40% at 220, as the entry\'s radio shows', () => {
  const g = quietGame(2); const radio = crate(g, 'radio', 2);
  const price = (n) => { g.s.niche = Array.from({ length: n }, () => [g.s.hour, 2, 'radio', 'collector']); return g.val(radio); };
  const p0 = price(0), p55 = price(55), p110 = price(110), p220 = price(220);
  assert.deepEqual([usd(p0), usd(p55), usd(p110), usd(p220)], ['$11.52', '$10.94', '$10.37', '$9.22']);
  assert.deepEqual([pct(1 - p110 / p0, 0), pct(1 - p220 / p0, 0)], ['10%', '20%']);
  assert.equal(ASSETS.radio.base, 12); assert.deepEqual([ASSETS.radio.sc, demandOf(ASSETS.radio, 2), ASSETS.radio.dep], [6, 8, 2]);
  assert.deepEqual([g.crowd('radio', 2)], [0.6]);
  for (const [n, factor, demand, utility, index] of [[55, '0.90', '7.2', '41.2', '0.912'], [110, '0.80', '6.4', '36.4', null], [220, '0.60', '4.8', '26.8', null]]) {
    price(n); const c = g.crowd('radio', 2), d = 8 * c, u = 6 * d - 2;
    assert.deepEqual([c.toFixed(2), d.toFixed(1), u.toFixed(1)], [factor, demand, utility]); says('supply-and-demand', factor, demand, utility);
    if (index) { assert.equal((0.5 + u / 100).toFixed(3), index); says('supply-and-demand', index); }
  }
  near((p0 - p55) / p0, 0.05, 0.002); near((p55 - p110) / p55, 0.052, 0.002); assert.equal(pct((p0 - p55) / p0, 0), '5%'); says('supply-and-demand', '5%');
  says('supply-and-demand', '$12', '$11.52', '$10.94', '$10.37', '$9.22', '10%', '20%', '220');
});

test('Codex liquidity and net-worth: the pool pays 87.5% in the Scrap Yard, holds $5,000, refills 35% a day, and the worked balance sheet adds up', () => {
  const g = open(quietGame(5)); const a = crateWorth(g, 'pen', 1, 3000);
  const q = g.poolQuote([a.id]);
  assert.deepEqual([q.fric, q.total, q.room], [0.125, 2625, 5000]);
  assert.equal(ZONES[1].pool, 5000); assert.equal(ZONES[1].friction, 0.1); assert.equal(FEES.base, 0.025);
  assert.ok(g.sellPool([a.id]).ok); assert.equal(g.s.pool[1], 2375);
  const b = crateWorth(g, 'pen', 1, 3000), refused = g.sellPool([b.id]); assert.equal(refused.ok, false, 'a second $3,000 batch pays $2,625, more than the pool has');
  g.s.pool[1] = 2375; g.stepHour();
  near(g.s.pool[1] - 2375, 5000 * 0.35 / 24, 1e-6, 'the hourly refill'); assert.equal(usd(5000 * 0.35 / 24), '$72.92'); assert.equal((250 / (5000 * 0.35 / 24)).toFixed(1), '3.4');
  assert.deepEqual([usd(3000 - 2625, 0), pct(375 / 3000)], ['$375', '12.5%']);
  says('liquidity', '87.5%', '10% friction', '2.5% fee', '$5,000', '35%', '$2,625', '$2,375', '$72.92', '3.4 hours', '$375', '12.5%');
  // net worth
  const h = open(quietGame(5)); h.s.cash = 300; const r = crate(h, 'radio', 2); h.s.pipes.push(manager(h, { basis: 600 })); h.s.loans.push({ id: 'D1', prod: 'micro', principal: 500, accr: 0, last: 0, next: 24 });
  assert.equal(usd(h.netWorth()), '$411.52'); h.repay('D1', 200); assert.equal(usd(h.netWorth()), '$411.52', 'repaying debt leaves net worth alone');
  assert.ok(h.sellPool([r.id]).ok); assert.equal(usd(h.netWorth()), '$410.03'); assert.equal(usd(11.52 - 10.03), '$1.49');
  says('net-worth', '$300', '$11.52', '$600', '$500', '$411.52', '$200', '$410.03', '$1.49', '12.9%');
});

test('Codex interest-and-compounding, compounding, margin: the loan grows as the arithmetic says, and the fee is the game\'s 2.5%', () => {
  const g = open(quietGame(5)); g.s.cash = 5000;
  const cash0 = g.s.cash; assert.ok(g.draw('micro', 2000).ok);
  assert.deepEqual([usd(2000 * LOANS.micro.fee, 0), usd(g.s.cash - cash0 + 60, 0)], ['$60', '$2,000']); assert.equal(usd(2000 - 60, 0), '$1,940');
  assert.equal(usd(2000 * g.loanRate('micro') / 30), '$8.00');
  pass(g, 30); const d30 = g.debt(); pass(g, 60); const d90 = g.debt();
  assert.deepEqual([usd(d30, 0), usd(d90, 0)], ['$2,254', '$2,865'], 'the micro line adds its interest daily');
  assert.deepEqual([usd(2000 * 1.12, 0), usd(2000 * 1.12 ** 3, 0), usd(2000 * 1.12 ** 3 - 2000, 0), usd(d90 - 2000, 0)], ['$2,240', '$2,810', '$810', '$865']);
  assert.equal(LOANS.micro.every, 24); assert.equal(LOANS.pipeline.every, 168); assert.equal(LOANS.enterprise.every, 720);
  says('interest-and-compounding', '12% per 30 days', '3% fee', '$60', '$1,940', '$8.00', '$2,240', '$2,254', '$2,810', '$2,865', '$810', '$865', 'daily for a micro line', 'weekly for a pipeline loan', 'monthly for enterprise');
  // compounding: $50 at 3% a cycle
  const grow = (r, n) => 50 * (1 + r) ** n;
  assert.deepEqual([usd(grow(0.03, 24)), usd(grow(0.03, 48)), usd(grow(0.015, 48)), usd(50 + 0.03 * 50 * 48 - 50, 0)], ['$101.64', '$206.61', '$102.17', '$72'].map((x) => x));
  assert.equal((72 / 3), 24); assert.equal((((grow(0.03, 48) - 50) / (grow(0.015, 48) - 50))).toFixed(1), '3.0', 'half the reinvestment bought a third of the growth');
  says('compounding', '$101.64', '$206.61', '$102.17', '$72', '24 cycles', 'rule of 72');
  // margin: a pen bought at $9 and sold at $12 through the game's 2.5% fee
  const m = quietGame(1); assert.equal(m.instFee('pitch'), 0.025);
  assert.deepEqual([pct(3 / 9), pct(3 / 12), usd(12 * 0.025), usd(12 - 12 * 0.025), usd(12 - 12 * 0.025 - 9), pct((12 - 12 * 0.025 - 9) / 12)], ['33.3%', '25.0%', '$0.30', '$11.70', '$2.70', '22.5%']);
  says('margin', '33.3%', '25.0%', '$0.30', '$11.70', '$2.70', '22.5%', '2.5%');
  // the entry sends the player to the line the result card really shows
  assert.match(text('js/deal.js'), /You received \$\{money\([^)]*\)\} after tax and fees/);
  assert.match(codex('margin').tryIt, /after tax and fees/);
  assert.doesNotMatch(codex('margin').tryIt, /receipt/i);
});

// ===================================================================================================================================
// People and information: haggling, the Pawn District's counterfeits

/** The share of a district's lots of one class that are counterfeit, measured on the real lot generator at a given net worth. */
function fakeShare(zone, cls, cash, want = 600) {
  const g = new Game({ perks: [], seed: 11 }); g.env.algo = false; g.s.events = []; g.s.cash = 1e8; g._unlock(); g.s.assets = []; g.s.cash = cash;
  let n = 0, fake = 0;
  for (let i = 0; i < 120000 && n < want; i++) { g.s.lots[zone] = []; g._spawnLot(zone, false); const l = g.s.lots[zone][0]; if (!l || l.cls !== cls) continue; n++; if (l.truth.fake) fake++; }
  return { n, share: fake / n };
}

test('Codex information-asymmetry, adverse-selection and due-diligence: they agree with the lot generator about how often a Pawn District watch is a fake', () => {
  assert.equal(ZONES[4].rules.fakes, 0.22);
  const early = fakeShare(4, 'pawnWatch', 0, 900), later = fakeShare(4, 'pawnWatch', 1000, 900), bike = fakeShare(4, 'bike', 0, 900);
  near(early.share, 0.316, 0.045, 'a watch at the start'); near(later.share, 0.356, 0.045, 'a watch later');
  near(bike.share, 0.095, 0.035, 'a road bike (a bike is sometimes broken instead of fake)');
  assert.equal(demandOf(ASSETS.pen, 4) < 3, true, 'a fountain pen is not a Pawn District lot at all, so no page may count its fake rate there');
  const info = prose('information-asymmetry');
  assert.doesNotMatch(info, /fountain pen/i); assert.match(codex('information-asymmetry').body[0], /road bike/); assert.match(codex('information-asymmetry').body[0], /32% at the start/);
  // adverse-selection: the same watch, 32 fakes in 100, deep discounts on half the fakes and a tenth of the genuine ones
  const a = prose('adverse-selection');
  assert.doesNotMatch(a, /22 are fake|22 x 0\.50|78 x 0\.10/);
  assert.deepEqual([32 * 0.5, (68 * 0.1).toFixed(1), pct(16 / (16 + 6.8))], [16, '6.8', '70.2%']);
  says('adverse-selection', '32 are fake', '32 x 0.50 = 16', '68 x 0.10 = 6.8', '70.2%', '32% risk', '70% risk');
  // due-diligence: $90 lot, $100 genuine, $10 fake; 22% of the counter's lots are fake; the serial check catches 80%
  const blind = 0.78 * (100 - 90) + 0.22 * (10 - 90), checked = 0.78 * 10 + 0.22 * 0.2 * (10 - 90);
  assert.deepEqual(['-' + usd(blind), usd(checked), usd(checked - blind), usd(0.22 * 0.2, 3)], ['-$9.80', '$4.28', '$14.08', '$0.044']);
  const d = codex('due-diligence');
  assert.doesNotMatch(d.example.setup, /as with a watch/); assert.match(d.example.setup, /across the Pawn District/);
  assert.deepEqual(Object.keys(PROBES), ['look', 'serial', 'power', 'papers', 'expert']); assert.deepEqual(Object.values(PROBES).map((p) => p.cost), [1, 1, 2, 1, 3]);
  says('due-diligence', '$90', '$100', '$10', '22%', '80%', '$9.80', '$4.28', '$14.08', '0.044');
});

test('Codex batna-zopa, anchoring and negotiation use Road Bike, radio and Aiko as the data has them', () => {
  const aiko = BUYERS.cyclist; assert.equal(aiko.zone, 3); assert.match(aiko.name, /^Aiko/); assert.ok(aiko.budget[0] <= 34 && 34 <= aiko.budget[1], 'a $34.00 limit is inside Aiko\'s budget');
  assert.equal(fitOf('bike', 'cyclist'), 1, 'a road bike is exactly what the weekend cyclist wants');
  const g = open(quietGame(3)); const bike = crate(g, 'bike', 3);
  const pool = g.poolQuote([bike.id]), fair = g.val(bike);
  assert.deepEqual([usd(fair), usd(pool.total), pct(pool.total / fair), pct(pool.fric)], ['$31.28', '$27.12', '86.7%', '13.3%']);
  assert.equal(ZONES[3].friction + FEES.base, pool.fric);
  assert.deepEqual([usd(34 - 27.12), usd((27.12 + 34) / 2), usd((29.5 + 34) / 2), usd(29.5 - 27.12), usd(((29.5 + 34) / 2) - (27.12 + 34) / 2)], ['$6.88', '$30.56', '$31.75', '$2.38', '$1.19']);
  says('batna-zopa', '$31.28', '86.7%', '10.8% friction', '2.5% fee', '$27.12', '$34.00', '$6.88', '$30.56', '$29.50', '$31.75', '$2.38', '$1.19', 'Aiko');
  assert.equal(ZONES[3].friction, 0.108);
  assert.equal(FMV_BAND, 0.4); says('network-effects', '40%');
});

test('Codex hedging: the pool\'s cost and the break-even odds are the game\'s', () => {
  const g = quietGame(5); const a = crate(g, 'gadgets', 5), q = g.poolQuote([a.id]);
  assert.equal(pct(q.fric), '14.1%'); assert.deepEqual([ZONES[5].friction, FEES.base], [0.116, 0.025]);
  const half = 1500, cost = 0.141 * half, saved = 0.5 * half;
  assert.deepEqual([usd(cost), usd(saved, 0), pct(cost / saved)], ['$211.50', '$750', '28.2%']); assert.equal(pct(cost / saved, 0), '28%'); says('hedging', '28%');
  assert.deepEqual([usd(3000 - 3000 * 0.5, 0), usd(3000 - (1500 * (1 - 0.141) + 1500 * 0.5), 2), usd(1500 - (3000 - (1500 * (1 - 0.141) + 1500 * 0.5)), 2)], ['$1,500', '$961.50', '$538.50']);
  says('hedging', '14.1%', '$211.50', '$750', '28.2%', '$961.50', '$538.50', '15%');
});

test('Codex reputation, diversification, risk-of-ruin, expected-value, sunk-cost, comparative-advantage and network-effects: the arithmetic is right', () => {
  // reputation
  assert.deepEqual([5 * 60, pct(40 / 300, 0)], [300, '13%']); says('reputation', '$300', '13%', '$40', '$60', '0 to 100', 'two days');
  const rep = new Game({ perks: [], seed: 1 }).s.rep; assert.ok(rep >= 0 && rep <= 100, 'the meter runs from 0 to 100');
  assert.equal(PERKS.roots.mods.loyalty, 0.2, 'Small-Town Roots: loyal buyers return with 20% bigger budgets'); assert.ok(PERKS.creator.mods.flopRep > 0);
  assert.match(text('js/engine.js'), /goodwillUntil = s\.hour \+ 48/, 'a Creator\'s failed pitch costs goodwill for 48 hours, which is two days');
  // diversification
  assert.deepEqual([usd(4000 * 0.3, 0), (0.3 / Math.sqrt(4) * 100).toFixed(0), usd(4000 * 0.15, 0), usd(4000 * 0.5, 0), usd(2 * 1000 * 0.5, 0)], ['$1,200', '15', '$600', '$2,000', '$1,000']);
  says('diversification', '$4,000', '30%', '$1,200', '15%', '$600', '$2,000', '$1,000', 'sqrt');
  // risk-of-ruin
  const surv = (n) => 0.95 ** n, bin = (n, k, p) => { let c = 1; for (let i = 0; i < k; i++) c = c * (n - i) / (i + 1); return c * p ** k * (1 - p) ** (n - k); };
  assert.deepEqual([10, 20, 40].map((n) => pct(surv(n), 0)), ['60%', '36%', '13%']);
  assert.deepEqual([pct(1 - bin(20, 0, 0.05) - bin(20, 1, 0.05) - bin(20, 2, 0.05)), pct(0.75 ** 3, 0), pct(1 - surv(20), 0)], ['7.5%', '42%', '64%']);
  says('risk-of-ruin', '60%', '36%', '13%', '42%', '7.5%', '64%', '25%', '95%');
  // expected-value: the exact odds of a loss over n boxes (profits -$10, +$5, +$40 with chances .50, .35, .15)
  assert.equal(0.5 * 10 + 0.35 * 25 + 0.15 * 60, 22.75);
  const lossOdds = (n) => { let d = new Map([[0, 1]]); for (let i = 0; i < n; i++) { const nd = new Map(); for (const [k, p] of d) for (const [x, q] of [[-10, 0.5], [5, 0.35], [40, 0.15]]) nd.set(k + x, (nd.get(k + x) || 0) + p * q); d = nd; } let l = 0; for (const [k, p] of d) if (k < 0) l += p; return l; };
  assert.deepEqual([1, 20, 100].map((n) => pct(lossOdds(n), 0)), ['50%', '23%', '5%']);
  assert.equal(usd(22.75 - 20), '$2.75'); assert.equal(ASSETS.fleaBox.name, 'Sealed Mystery Box');
  says('expected-value', '$22.75', '$2.75', '50%', '23%', '5%', 'Sealed Mystery Box', '15%');
  // sunk-cost: $620 losing 1.6% of itself a day (depreciation 8), or $600 put to work at 1% a day
  assert.equal(ASSETS.gadgets.dep * 0.002, 0.016);
  const hold = 620 * (1 - 0.016) ** 10, sell = 600 * 1.01 ** 10;
  assert.deepEqual([usd(hold, 0), usd(620 - hold, 0), usd(sell, 0), usd(sell - hold, 0)], ['$528', '$92', '$663', '$135']);
  says('sunk-cost', '$900', '$620', '$600', '1.6%', '$528', '$92', '$663', '$135', '$300');
  // comparative-advantage: one day of Ana (10 repairs or 5 sales) and Ben (2 repairs or 4 sales), two days of each
  const best = (sales) => { // the most repairs the pair can make when the pair makes exactly `sales` sales over two days
    let top = -1;
    for (let anaSales = 0; anaSales <= 10; anaSales += 0.5) { const benSales = sales - anaSales; if (benSales < 0 || benSales > 8) continue; top = Math.max(top, (2 - anaSales / 5) * 10 + (2 - benSales / 4) * 2); }
    return top;
  };
  assert.equal(best(9), 18, 'the best the pair can do with 9 sales is 18 repairs'); assert.equal(best(9) - 12, 6, 'and the even split gives 12');
  assert.equal((2 - 1 / 5) * 10, 18, 'Ana sells one (a fifth of a day) and repairs the rest'); assert.deepEqual([10 / 5, 2 / 4], [2, 0.5], 'a sale costs Ana 2 repairs and Ben half of one');
  says('comparative-advantage', '10 radios', '5 sales', '2 repairs', '4 sales', '12 repairs and 9 sales', '18 repairs and 9 sales', '2 repairs', 'half of one');
  // network-effects
  assert.deepEqual([5, 10, 20].map((n) => n * (n - 1) / 2), [10, 45, 190]); says('network-effects', '10 possible pairs', '45 pairs', '190 pairs');
});

// ===================================================================================================================================
// What the bodies say about the districts and the leads

test('Codex bodies: the district facts they quote (storage, freight time, customs, rent, exit, spreads, urgent leads) are the data\'s and the engine\'s', () => {
  assert.equal(ZONES[11].bonus.storeBonus, 4); assert.match(codex('inventory-risk').body[0], /four extra crates/);
  assert.equal(ZONES[15].rules.auction, 0.25); assert.equal(ZONES[15].bonus.rentMult, 1.25); assert.match(codex('asset-cash-flow').body[0], /a quarter of the lots are foreclosure auctions/);
  assert.deepEqual([ZONES[8].rules.customs, ZONES[8].bonus.freightMult], [0.25, 0.7]); assert.match(codex('supply-chain').body[1], /12-hour delay and a 2% fee/);
  assert.equal(ZONES[3].rules.season.period, 28); assert.match(codex('saturation-herd').body[0], /28-day/);
  // freight: six hours to the next district, a little longer for each district further on
  const g = open(quietGame(9)); const van = crate(g, 'van', 7);
  assert.deepEqual([8, 9, 6, 5].map((to) => g.freightQuote([van.id], to).hours), [6, 7, 6, 7]);
  assert.match(codex('supply-chain').body[0], /next district takes six hours/);
  assert.match(codex('supply-chain').tryIt, /^Pick a crate in your Stock, then open the Travel drawer/);
  assert.ok(text('js/ui/drawers/stock.js').includes('shipIds') && text('js/ui/drawers/travel.js').includes('shipIds'), 'the crates are picked in the Stock drawer and read by the Travel drawer');
  // economies-of-scale: a manager's capacity doubles with each level, and each upgrade costs 2.5 times the last
  const m1 = { kind: 'broker', zone: 5, level: 1 }, m2 = { ...m1, level: 2 }, m3 = { ...m1, level: 3 };
  assert.equal(g.pipeCap(m2) / g.pipeCap(m1), 2); assert.equal(g.pipeUpCost(m2) / g.pipeUpCost(m1), 2.5); assert.equal(g.pipeUpCost(m3) / g.pipeUpCost(m2), 2.5);
  assert.match(codex('economies-of-scale').body[1], /capacity doubles with each level, but each upgrade costs 2\.5 times the last/);
  // urgent leads: a buyer stays 18 to 36 virtual hours, not "a day or two"
  const h = quietGame(1); const life = new Set();
  for (let i = 0; i < 2500; i++) { h.s.leads[1] = []; h._spawnLead(1, false, true); const l = h.s.leads[1][0]; if (l) life.add(l.exp - l.born); }
  assert.deepEqual([Math.min(...life), Math.max(...life)], [18, 36]);
  assert.match(codex('urgency-premium').body[1], /18 to 36 virtual hours/); assert.doesNotMatch(codex('urgency-premium').body[1], /a day or two/);
  // Industrial Park: the audits begin and corporate accounts open at Milestone 2; the game has no bulk lots in multiples
  assert.equal(CLIENTS.corp.needs, 'm2');
  assert.doesNotMatch(prose('scale-compliance'), /bulk lots/i);
  assert.ok(!/rules\.bulk|\.bulk\b/.test(text('js/engine.js')), 'nothing in the engine makes lots in multiples, so no page may say they come that way');
});

// ===================================================================================================================================
// What the worked examples start from, and the figures that follow from it

test('Codex: the starting points of the worked examples are the ones the entries state, and the small figures derived from them add up', () => {
  // assumptions: nothing in the game to recompute them from, so each is named here with the entry that makes it
  given('adverse-selection', '40%', '50%', '10%');
  given('collateral', '$4,000', '$2,000');
  given('compounding', '$50', '3%', '1.5%');
  given('credit-crunch', '$2,000', '$1,000');
  given('debt-to-equity', '$300', '$1,900', '$1,200', '$1,530', '20%');
  given('due-diligence', '20%', '$80', '$5');
  given('eei-score', '$40,000', '$36,000');
  given('enterprise-sales', '$1,000');
  given('exit-valuation', '$20,000', '$90,000', '$30,000', '$4,000');
  given('expected-value', '$20', '$10', '$25', '$60', '35%');
  given('hedging', '$3,000', '50%', '$1,500');
  given('interest-and-compounding', '$2,000');
  given('leverage-risk', '$10,000', '$20,000', '$30,000', '1.2%', '15%');
  given('liquidity', '$3,000');
  given('margin-call', '$4,000', '$3,000', '$3,600');
  given('margin', '$9.00', '$12.00');
  given('scale-compliance', '$750', '$250,000');
  given('sunk-cost', '1%');
  given('winners-curse', '20%');
  given('working-capital', '$1,200', '$1,500', '$1,000');
  given('cac-vs-ltv', '$1,200');
  // figures taken from the game's own tables
  assert.equal(pct(ZONES[4].rules.fakes, 0), '22%'); given('adverse-selection', '22%');
  assert.equal(pct(LOANS.pipeline.spread), '4.5%'); says('credit-crunch', '4.5%');
  assert.equal(pct(ZONES[5].friction), '11.6%'); assert.equal(pct(FEES.base), '2.5%'); says('hedging', '11.6%', '2.5%');
  assert.equal(pct(ZONES[5].tax, 0), '5%'); says('sla', '5%');
  // plain figures: the game's own constants and the factors the entries multiply by
  assert.deepEqual([(1 - AUDIT.passChance).toFixed(2), AUDIT.passChance.toFixed(2), (7500 / 5000).toFixed(1)], ['0.85', '0.15', '1.5']); says('audit-compliance', '0.85', '0.15'); says('scale-compliance', '1.5');
  assert.equal((1 - DEBT.fireSale).toFixed(2), '0.65'); says('collateral', '0.65');
  assert.deepEqual([DEBT.maxDE.toFixed(1), (1 + 1 / DEBT.callDE).toFixed(3)], ['3.0', '1.222']); says('margin-call', '3.0', '1.222');
  assert.equal((1 + 28 / 90).toFixed(3), '1.311'); says('eei-score', '1.311');
  assert.equal((1 + 0.2 * 4 / 6).toFixed(3), '1.133'); says('winners-curse', '1.133');
  assert.equal((1 - 0.125).toFixed(3), '0.875'); says('liquidity', '0.875');
  assert.equal((1 - ASSETS.gadgets.dep * 0.002).toFixed(3), '0.984'); says('sunk-cost', '0.984');
  assert.deepEqual([CM.min.toFixed(2), (1 - 4 / 20).toFixed(2), (8 / 24).toFixed(2), (1 - 8 / 24).toFixed(2)], ['0.40', '0.80', '0.33', '0.67']); says('market-saturation', '0.40', '0.80', '0.33', '0.67');
  assert.equal((1 - 0.22).toFixed(2), '0.78'); says('due-diligence', '0.78', '0.22');
  given('compounding', '1.03', '1.015'); given('expected-value', '0.50', '0.35', '0.15'); given('leverage-risk', '2.0'); given('risk-of-ruin', '0.95'); given('sunk-cost', '1.01'); given('comparative-advantage', '0.5');
  // figures derived from the starting points
  const g = quietGame(5);
  assert.equal((1 + g.loanRate('micro') / 30).toFixed(3), '1.004'); says('interest-and-compounding', '1.004');
  assert.equal(pct(1 - g.clientQuote('smb').cac * 0.84 / g.clientQuote('smb').cac, 0), '16%'); says('cac-vs-ltv', '16%');
  assert.deepEqual([usd(50 * 0.03), usd(50 * 1.03 ** 48, 0)], ['$1.50', '$207']); says('compounding', '$1.50', '$207');
  assert.deepEqual([usd(0.78 * 10), usd(0.22 * 80), usd(0.044 * 80)], ['$7.80', '$17.60', '$3.52']); says('due-diligence', '$7.80', '$17.60', '$3.52', '$80');
  assert.equal(usd(40000 - 36000, 0), '$4,000'); says('eei-score', '$4,000');
  assert.equal(usd(3200 * (1 - ZONES[13].tax) + 1000, 0), '$3,797'); says('enterprise-sales', '$3,797');
  assert.deepEqual([usd(0.5 * 10, 0), usd(0.35 * 25), usd(0.15 * 60, 0)], ['$5', '$8.75', '$9']); says('expected-value', '$5', '$8.75', '$9');
  assert.equal(usd(3000 * 0.875 - 2375, 0), '$250'); says('liquidity', '$250');
  assert.deepEqual([usd(4000 - 3000, 0), usd(3600 - 3000, 0), usd(3600 / 2, 0), usd(4000 - 3600, 0)], ['$1,000', '$600', '$1,800', '$400']); says('margin-call', '$1,000', '$600', '$1,800', '$400');
  assert.deepEqual([usd(12 - 9), pct((12 - 9) / 12, 0)], ['$3.00', '25%']); says('margin', '$3.00', '25%');
  assert.deepEqual([usd(300 - 200, 0)], ['$100']); says('net-worth', '$100', '$10.03');
  assert.equal(usd(Math.round((1520 + 11552) / 1000) * 1000, 0), '$13,000'); says('sla', '$13,000');
  assert.deepEqual([usd(1000 * 0.8, 0), usd(1000 * 1.2, 0)], ['$800', '$1,200']); says('winners-curse', '$800', '$1,200');
});

// ===================================================================================================================================
// The first round's examples: the constants, ratios and rates their own checks leave out

test('Codex first round: the likes, anchors, wave, rates, wear and margins their examples multiply by are the data\'s and the engine\'s', () => {
  const g = rich(), fmv = (cls, z) => g.val({ cls, cond: 'ok', quality: 1, wear: 1, zone: z });
  // utility-fit: who likes what, and the capped second like
  assert.deepEqual([BUYERS.student.like.tool, BUYERS.student.like.office, BUYERS.barista.like.office, BUYERS.dmitri.like.tool], [1, 0.7, 0.8, 0.4]);
  assert.deepEqual([1 + 0.15, fitOf('paperclip', 'student'), fitOf('paperclip', 'barista'), fitOf('paperclip', 'dmitri')], [1.15, 1, 0.8, 0.4]);
  says('utility-fit', 'tool 1.0, office 0.7', '(office 0.8)', '(tool 0.4)', 'is 1.15', 'fit 0.40');
  // negotiation and anchoring: the Close stage's anchors and steps
  assert.deepEqual([haggle.ANCHORS.high, haggle.ANCHORS.fair, haggle.ANCHORS.low, haggle.STEPS.small, haggle.STEPS.medium, haggle.STEPS.large], [1.4, 1, 0.7, 0.04, 0.09, 0.16]);
  says('negotiation', '1.4x, 1.0x and 0.7x', '0.04x, 0.09x and 0.16x'); says('anchoring', '1.4x, 1.0x and 0.7x');
  // saturation-herd: the textbooks, the wave and the balanced reference
  const cb = ASSETS.courseBooks, wave = ZONES[3].rules.season.amp;
  assert.deepEqual([cb.base, cb.sc, demandOf(cb, 3), cb.dep, wave, 1 + wave, 1 - wave], [28, 4, 9, 4, 0.35, 1.35, 0.65]);
  assert.equal((4 * (9 * (1 - wave)) - 4).toFixed(1), '19.4'); assert.equal(CM.ref, 1.68);
  says('saturation-herd', '$28', '35%', '0.35', '1.35', '0.65', '19.4', '1.68');
  // information-asymmetry: the fake's worth, the posted share and the weights
  assert.deepEqual([pct(0.08, 0), pct(ECON.lotDiscHi, 0), (1 - 0.32).toFixed(2), (0.32).toFixed(2)], ['8%', '97%', '0.68', '0.32']); says('information-asymmetry', '8%', '97%', '0.68', '0.32');
  // repair-roi and specialization: the discounts and the restored quality
  assert.deepEqual([1 - ZONES[7].rules.repair, ZONES[7].bonus.repairMult, (0.75 * 0.9).toFixed(3), (0.5 + 0.5 * 3 / 4).toFixed(3)], [0.75, 0.9, '0.675', '0.875']); says('repair-roi', '0.75 x 0.9 = 0.675', '0.875');
  const car = g._mk(g.s, 'classicCar', { zone: 7, cond: 'broken' }); g.s.assets.push(car); g.s.skills.ops = 1; const q1 = g.repairQuote(car.id);
  assert.deepEqual([usd(q1.before), usd(ASSETS.classicCar.repair, 0), usd(q1.cost, 0)], ['$1,814.40', '$2,000', '$1,350']); says('specialization', '$1,814.40', '$2,000', '0.675'); says('repair-roi', '$2,000');
  assert.deepEqual([usd(ASSETS.classicCar.repair * 0.42 ** 4 * 0.675, 0), (0.5 + 0.5 * Math.min(1, (3 - 1) / 4)).toFixed(2)], ['$42', '0.75']); says('specialization', '$42', '0.75');
  // supply-chain: freight, damage per level of Ops, the discount
  assert.deepEqual([FRESH.freightCost, FRESH.damageBase, (FRESH.damageBase - 0.05 * 3).toFixed(2), (1 - ZONES[8].bonus.freightMult).toFixed(1), ZONES[8].rules.customs], [0.045, 0.3, '0.15', '0.3', 0.25]);
  assert.match(text('js/engine.js'), /a\.quality \*= 0\.8/, 'damage costs 20% of the crate'); assert.match(text('js/engine.js'), /\(f\.book \|\| 0\) \* 0\.02/, 'customs charge 2%');
  says('supply-chain', '4.5%', '30% - 5% x 3 = 15%', '0.7', '25%', '20%', '2%', '5%', '15%', '30%');
  // obsolescence, depreciation, inventory-risk, recurring-revenue: the wear rate per point of depreciation, and the spoilage
  assert.deepEqual([ASSETS.mobileApp.dep * 0.002, ASSETS.mobileApp.dep * 0.002 * 2, 1 - ASSETS.mobileApp.dep * 0.002 * 2], [0.02, 0.04, 0.96]);
  assert.equal(pct(1 / 0.96 ** 10 - 1, 0), '50%', 'to be made whole after ten days the buyer pays about 50% more'); says('obsolescence', '0.002', '2%', '4%', '0.96', '50%');
  assert.deepEqual([(1 - 8 * 0.002).toFixed(3), (1 - 3 * 0.002).toFixed(3), (1 - 1 * 0.002).toFixed(3)], ['0.984', '0.994', '0.998']); says('depreciation', '0.984', '0.994', '0.998'); given('depreciation', '5%');
  assert.deepEqual([ASSETS.produceReefer.perish, (0.8 / 6 * 100).toFixed(1), pct(ASSETS.produceReefer.dep * 0.002), ((1 - 0.8 / 6) * (1 - 0.004)).toFixed(4)], [6, '13.3', '0.4%', '0.8632']); says('inventory-risk', '0.8', '0.4%', '0.8632');
  assert.deepEqual([pct(ASSETS.musicRights.dep * 0.002), 'yield ' + ASSETS.musicRights.yield], ['0.2%', 'yield 0.004']); says('recurring-revenue', '0.002'); given('recurring-revenue', '1.5%');
  // asset-cash-flow: a month of rent and wear, and the carry
  const rent = 0.004 * ZONES[15].bonus.rentMult, wear = ASSETS.apartmentBlock.dep * 0.002;
  assert.deepEqual([pct(rent), pct(wear), pct(rent * 30, 0), pct(wear * 30, 0), pct((rent - wear) * 30, 0), (9 - 6.1).toFixed(1), (9 - 12.1).toFixed(1)], ['0.5%', '0.2%', '15%', '6%', '9%', '2.9', '-3.1']);
  says('asset-cash-flow', '0.5%', '0.2%', '15%', '6%', '9%', '2.9', '3.1');
  // arbitrage-at-scale: the exchange's tax and fee, the freight factor, the gap
  assert.deepEqual([pct(ZONES[16].tax, 2), pct(FEES.base), pct(ZONES[16].tax + FEES.base, 2), (0.045 * 1.5 * 0.7).toFixed(5), (ZONES[16].tax + FEES.base).toFixed(4), pct(624000 / 499200 - 1, 0), pct(694200 / 499200 - 1, 0)], ['15.45%', '2.5%', '17.95%', '0.04725', '0.1795', '25%', '39%']);
  says('arbitrage-at-scale', '15.45%', '2.5%', '17.95%', '0.04725', '0.1795', '25%', '39%');
  // asset-utility-score and demand-shock: the indices
  assert.deepEqual([(0.5 + 53 / 100).toFixed(2), pct(3.09 / 2.28 - 1, 1), (0.5 + 46 / 100).toFixed(2)], ['1.03', '35.5%', '0.96']); says('asset-utility-score', '1.03', '35.5%'); says('demand-shock', '0.96'); given('asset-utility-score', '100%');
  // creativity-multiplier and urgency-premium: the pieces of the formula
  assert.deepEqual([BUYERS.marguerite.like.retro, CM.beta, 0.4 + 0.95 * 0.7, ((0.4 + Math.log(102 / 11)) * 0.9).toFixed(2), (1 - 10 / 100).toFixed(2), ((0.4 + Math.log(102 / 61)) * 0.4).toFixed(2), (0.4 + Math.log(2)).toFixed(3), (0.55 + 0.45 * 0.5).toFixed(3)], [0.7, 0.4, 1.065, '2.36', '0.90', '0.37', '1.093', '0.775']);
  says('creativity-multiplier', '0.7', '0.4', '0.95', '0.10', '0.90', '0.37'); says('urgency-premium', '0.40', '1.093', '0.775'); given('urgency-premium', '0.50');
  // cash-flow-velocity and economies-of-scale: the managers
  assert.deepEqual([ZONES[5].speed, PIPE.logistics.cycle, PIPE.student.cycle, PIPE.broker.margin, PIPE_RULES.marginBase, PIPE.broker.overhead, 0.002, PIPE_RULES.levelGrowth], [2.2, 0.8, 1.3, 0.068, 1.15, 6, 0.002, 2.5]);
  assert.deepEqual([(1.0782 ** 4).toFixed(2), (1.0633 ** 5).toFixed(2), (1.0598 ** (240 / 78)).toFixed(2)], ['1.35', '1.36', '1.20']); says('cash-flow-velocity', '2.2', '0.8', '1.3', '1.0782', '1.0633', '1.0598');
  assert.deepEqual([pct(6.2 / 100), pct(7 / 500), pct(8 / 1000), pct(0.002), pct(0.068, 1), pct(32.1 / 500), pct(70.2 / 1000)], ['6.2%', '1.4%', '0.8%', '0.2%', '6.8%', '6.4%', '7.0%']); says('economies-of-scale', '6.2%', '1.4%', '0.8%', '0.2%', '6.8%', '6.4%', '7.0%', '1.15', '$500', '$5,000'); given('economies-of-scale', '$100', '$1,000');
  // the base prices and the worth of the goods the examples name, and the figures that follow from them
  assert.deepEqual([ASSETS.pen.base, ASSETS.scrap.base, ASSETS.bike.base, ASSETS.gadgets.base, usd(fmv('gadgets', 5), 0), usd(fmv('paperclip', 1)), usd(fmv('pawnWatch', 4), 0)], [3.2, 3, 34, 760, '$730', '$0.05', '$315']);
  says('asset-utility-score', '$3.20', '$3.00'); says('fair-market-value', '$34'); says('demand-shock', '$760'); says('depreciation', '$730'); says('urgency-premium', '$0.05'); says('information-asymmetry', '$315', '$25.17');
  assert.deepEqual([usd(fmv('pawnWatch', 4) * 0.08), pct(0.8 / 6), pct((1 - 0.8 / 6) * (1 - 0.004))], ['$25.17', '13.3%', '86.3%']); says('inventory-risk', '13.3%', '86.3%'); says('recurring-revenue', '0.2%');
  const surge = 760 * 2.5, base = fmv('gadgets', 5);
  assert.deepEqual([pct(surge / base - 1, 0), usd(surge - base, 0), usd(base - base * 0.5, 0)], ['160%', '$1,170', '$365']); says('demand-shock', '160%', '$1,170', '$365');
  assert.deepEqual([usd(516.04 - 368.6)], ['$147.44']); says('anchoring', '$147.44'); given('anchoring', '$295', '$390'); given('negotiation', '$9.21');
  const book = 499200, atExchange = 694200, tax = 0.1545 + 0.025, net = atExchange * (1 - tax);
  assert.deepEqual([usd(atExchange * tax, 0), usd(net, 0), pct(1 - (net - book - 23587) / (atExchange - book), 0)], ['$124,609', '$569,591', '76%']); says('arbitrage-at-scale', '$124,609', '$569,591', '76%'); given('arbitrage-at-scale', '$624,000');
  assert.equal(usd(6048 * 0.75, 0), '$4,536'); assert.equal(usd(5292 - 1814.4 - 100.02, 0), '$3,378'); says('repair-roi', '$3,378'); says('specialization', '$4,536');
});

// ===================================================================================================================================
// Every dollar figure and every percentage in a worked example has been named by a check above

const FIGURE = /\$\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:,\d{3})*(?:\.\d+)?%|(?<![\d.$,])\d+\.\d+(?![\d%])/g;
test('Codex: no worked example holds a dollar figure or a percentage that no check names', () => {
  // the first thirty-two entries: every figure, decimals too, must be named above; the first round's twenty-four: every dollar figure and percentage must be named above
  // or be spelled out in the expected values of the first round's own two files (tests/audit-content.test.mjs and tests/meta-codex.test.mjs)
  const firstRoundFiles = text('tests/audit-content.test.mjs') + text('tests/meta-codex.test.mjs');
  const stray = [];
  for (const id of [...HERE, ...FIRST_ROUND]) {
    const e = codex(id), named = [...(NAMED.get(id) || [])].join('\n'), mine = HERE.includes(id);
    const figures = new Set([e.example.setup, ...e.example.steps, e.example.result].join('\n').match(FIGURE) || []);
    for (const f of figures) {
      if (named.includes(f)) continue;
      if (!mine && (!/^\$|%$/.test(f) || firstRoundFiles.includes(f))) continue;
      stray.push(`${id}: ${f}`);
    }
  }
  assert.deepEqual(stray, [], 'a figure in a worked example that no check names (recompute it, or declare it a given)');
});

// ===================================================================================================================================
// Spelling: one English, over every string the game can show

/** The text of every string literal in a JavaScript source (comments skipped; a template gives its static parts and the literals inside its `${}`). */
function literals(src) {
  const out = [], n = src.length;
  const KW = /(?:^|[^\w$.])(?:return|typeof|case|in|of|delete|void|throw|else|do|yield|await|new)$/;
  const quoted = (i) => { const q = src[i]; let j = i + 1, s = ''; while (j < n && src[j] !== q && src[j] !== '\n') { if (src[j] === '\\') { s += src[j + 1] ?? ''; j += 2; } else s += src[j++]; } return [s, j + 1]; };
  const template = (i) => {
    let j = i + 1, s = '';
    while (j < n && src[j] !== '`') {
      if (src[j] === '\\') { s += src[j + 1] ?? ''; j += 2; }
      else if (src[j] === '$' && src[j + 1] === '{') { out.push(s); s = ''; j = scan(j + 2, true); }
      else s += src[j++];
    }
    out.push(s); return j + 1;
  };
  function scan(i, inBrace = false) {
    let depth = 0, prev = '', j = i;
    while (j < n) {
      const c = src[j], d = src[j + 1];
      if (c === '/' && d === '/') { while (j < n && src[j] !== '\n') j++; continue; }
      if (c === '/' && d === '*') { const e = src.indexOf('*/', j + 2); j = e < 0 ? n : e + 2; continue; }
      if (c === '"' || c === "'") { const [s, k] = quoted(j); out.push(s); j = k; prev = c; continue; }
      if (c === '`') { j = template(j); prev = '`'; continue; }
      if (c === '/') {
        const before = src.slice(Math.max(0, j - 12), j).replace(/\s+$/, '');
        if (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev) || KW.test(before)) { // a regular expression: skip it whole, quotes inside it included
          let k = j + 1, cls = false;
          while (k < n && src[k] !== '\n') { if (src[k] === '\\') k += 2; else { if (src[k] === '[') cls = true; else if (src[k] === ']') cls = false; else if (src[k] === '/' && !cls) break; k++; } }
          k++; while (/[a-z]/i.test(src[k] || '')) k++;
          j = k; prev = '/'; continue;
        }
      }
      if (c === '{') depth++;
      if (c === '}') { if (inBrace && depth === 0) return j + 1; depth--; }
      if (!/\s/.test(c)) prev = c;
      j++;
    }
    return j;
  }
  scan(0);
  return out;
}

/** British spellings (and the few British words) that this game spells the American way. District names are Harbor and Center. */
const BRITISH = new RegExp([
  '\\b\\w*(?:colou|favou|behaviou|honou|labou|neighbou|rumou|flavou|harbou|humou|vapou|armou|saviou|odou)r\\w*',
  '\\b\\w*(?:organis|realis|recognis|apologis|specialis|summaris|authoris|capitalis|finalis|minimis|maximis|optimis|prioritis|utilis|criticis|customis|normalis|standardis|categoris|synchronis|monetis|visualis|memoris|penalis|centralis|localis|stabilis|digitis|generalis|personalis|randomis|rationalis)(?:e|es|ed|er|ers|ing|ation|ations|ational)\\b',
  '\\banalys(?:e|ed|ing)\\b', '\\bcentr(?:e|es|ed)\\b', '\\b(?:metre|litre|theatre|fibre|calibre|sombre|lustre)s?\\b', '\\b(?:licences?|defences?|offences?|pretences?|catalogues?|analogues?)\\b',
  '\\b\\w*(?:travell|labell|modell|cancell|signall|fuell|levell|counsell)(?:ed|ing|er|ers)\\b', '\\bjewell\\w+', '\\b(?:instalments?|enrolments?|skilful|wilful|fulfil)\\b', '\\bgrey\\w*',
  '\\b(?:tyres?|cheques?|programmes?|pyjamas|aluminium|whilst|amongst|learnt|spelt|burnt|dreamt|sceptic\\w*|aeroplane|plough\\w*|draughts?|kerb|storeys?|moustache|practis(?:e|ed|es|ing)|ageing|cosy',
  'mould\\w*|smoulder\\w*|manoeuvr\\w+|oestro\\w*|paediatric\\w*|anaesthet\\w+|encyclopaedia|haemo\\w+|judgement|acknowledgement|maths|tonnes?|lorry|lorries|petrol|rubbish|fortnight\\w*)\\b',
].join('|'), 'gi');
const britishIn = (s) => (s.replace(/\bGrey\b(?=-market)/g, '').match(BRITISH) || []).map((w) => w.toLowerCase());

/**
 * What is allowed to stay, and why. A word is listed here only because the file is not the content cluster's to edit (docs/V2_DESIGN.md section 10: the engine, config, perks,
 * the mini-games, the UI and the Academy have owners of their own) or because the spelling is deliberate. Each is a one-word change for its owner to make. Nothing else may
 * carry a British spelling: a new one anywhere fails, and a fixed one needs no change here (the diagnostic below lists what is still waiting).
 */
const HANDED_OVER = {
  'js/config.js': ['labour'], // AUDIT_THEMES: "the labour board"
  'js/data/perks.js': ['labour'], // the Licensed Tradesperson's basis line
  'js/data/schema.js': ['colours'], // the validator's own error message (nobody but an author reads it)
  'js/deal.js': ['centre'], // FIX_ADVICE
  'js/meta/academy.js': ['practise'], // lesson m08's hint (the Academy has its own owner)
  'js/play/pitch.js': ['neighbours', 'maths'], // a buyer's quirk and a buyer's line
  'js/play/repair.js': ['centre', 'labour'], // the dial's lines and the result
  'js/ui/deal.js': ['offence'], // "They took offence at that number."
  'js/ui/debrief.js': ['instalment'], // the workbook's garnishment line
  'docs/BALANCE.md': ['normalise', 'centre'], // the balance track's document
};
const DELIBERATE = {
  'js/play/pitch.js': ['sceptic'], // a quirk id and the words that recognise the player's own typing (both spellings are accepted)
  'js/data/tier4.js': ['harbourlinepe'], // a buyer's id (the name beside it is Harborline Capital): ids are saved in games and in classmates' snapshots, so an id keeps its first spelling
};

function walkFiles(dir, ext) { const out = []; for (const f of readdirSync(new URL(dir, ROOT))) { const rel = dir + f; if (statSync(new URL(rel, ROOT)).isDirectory()) out.push(...walkFiles(rel + '/', ext)); else if (rel.endsWith(ext)) out.push(rel); } return out; }

test('the string finder that the spelling test stands on reads quotes, templates, comments and regular expressions the way JavaScript does', () => {
  const src = [
    "const a = 'one', b = \"two \\\"x\\\"\"; // 'not this'",
    '/* "nor this" */ const c = `three ${`four ${"five"}`} six`;',
    "const re = /['\"]+/g; const d = x.replace(/\"/g, '\"\"') + 'seven'; const e = a / b / 2, f = 'eight';",
    "const g = (1) / 2; if (a) { h = `nine ${a ? 'ten' : \"eleven\"}`; }",
  ].join('\n');
  assert.deepEqual(literals(src), ['one', 'two "x"', 'three ', 'four ', 'five', '', ' six', '""', 'seven', 'eight', 'nine ', 'ten', 'eleven', '']);
  const all = walkFiles('js/', '.js'); let total = 0;
  for (const f of all) { const lits = literals(text(f)); total += lits.length; assert.ok(lits.every((s) => s.length < 2000), `${f}: no literal swallows the file after a misread quote`); }
  assert.ok(total > 10000, `the finder reads the whole game: ${total} literals`);
  assert.ok(literals(text('js/ui/deal.js')).some((s) => s.includes('They are suspicious of a price that low')));
  assert.ok(britishIn('the labour board and a tonne of grey plough').length === 4 && britishIn('the labor board, a ton of gray plow').length === 0 && britishIn('Grey-market').length === 0);
});

test('every player-facing string the game can show is spelled the American way (tables, quests, Codex, mini-games and screens)', (t) => {
  const strings = [];
  const walk = (v, where) => { if (typeof v === 'string') strings.push([where, v]); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, where + '.' + k); };
  walk(ZONES, 'ZONES'); walk(ASSETS, 'ASSETS'); walk(BUYERS, 'BUYERS'); walk(PERKS, 'PERKS'); walk(SKILLS, 'SKILLS'); walk(PIPE, 'PIPE'); walk(UPGRADES, 'UPGRADES'); walk(CLIENTS, 'CLIENTS'); walk(LOANS, 'LOANS');
  walk(AUDIT_THEMES, 'AUDIT_THEMES'); walk(EVENTS, 'EVENTS'); for (const [k, e] of Object.entries(ALGO_EVENTS)) walk({ name: e.name, ...e.mk('pen') }, 'ALGO_EVENTS.' + k);
  walk(QUESTS, 'QUESTS'); walk(ACHIEVEMENTS, 'ACHIEVEMENTS'); walk(DAILIES, 'DAILIES'); walk(CODEX, 'CODEX'); walk(ACADEMY, 'ACADEMY');
  // a table read from a file this cluster does not own may carry the words HANDED_OVER names for that file, and only those
  const allowed = new Set(['js/config.js', 'js/data/perks.js', 'js/meta/academy.js'].flatMap((f) => HANDED_OVER[f]));
  const stray = strings.filter(([, s]) => britishIn(s).some((w) => !allowed.has(w)));
  assert.deepEqual(stray.map(([w, s]) => `${w}: ${britishIn(s).join(', ')} | ${s.slice(0, 70)}`), [], 'tables');

  // every string literal of every source file (comments are not read: they are not shown)
  const stray2 = [], handedOver = [];
  for (const f of walkFiles('js/', '.js')) {
    if (f.startsWith('js/world/')) continue; // the world's drawing code has no words for a player
    for (const s of literals(text(f))) for (const w of britishIn(s)) {
      if ((DELIBERATE[f] || []).includes(w)) continue;
      if ((HANDED_OVER[f] || []).includes(w)) { handedOver.push(`${f}: ${w}`); continue; }
      stray2.push(`${f}: ${w} | ${s.slice(0, 70)}`);
    }
  }
  assert.deepEqual(stray2, [], 'source literals');
  if (handedOver.length) t.diagnostic(`British spellings still waiting for their owners: ${[...new Set(handedOver)].join('; ')}`);
});

test('the files the content cluster owns are American from the first comment to the last, and so are the documents (comments, ids, tables)', () => {
  const own = ['js/data/tier1.js', 'js/data/tier2.js', 'js/data/tier3.js', 'js/data/tier4.js', 'js/data/index.js', 'js/meta/codex.js', 'js/meta/quests.js', 'js/meta/progress.js', 'js/meta/ids.js', 'js/meta/match.js',
    'docs/V2_DESIGN.md', 'docs/ARCHITECTURE.md', 'docs/COMPLIANCE.md', 'docs/FACULTY_KIT.md', 'README.md', 'docs/BALANCE.md'];
  const stray = [];
  for (const f of own) for (const w of new Set(britishIn(text(f)))) if (!(HANDED_OVER[f] || []).includes(w) && !(DELIBERATE[f] || []).includes(w)) stray.push(`${f}: ${w}`);
  assert.deepEqual(stray, []);
  // what a player sees of a buyer or a good is its name, never its id; every name is American, and the only British id left is the one that was saved first
  assert.deepEqual(Object.keys(BUYERS).filter((id) => britishIn(id).length && id !== 'harbourlinePE'), []);
  assert.deepEqual(Object.keys(ASSETS).filter((id) => britishIn(id).length), []);
  assert.equal(BUYERS.harbourlinePE.name, 'Rhea Nair, Harborline Capital');
  assert.deepEqual(britishIn(text('index.html')), [], 'the page a student opens');
});

test('no page, goal or table says "zone" where the game says district', () => {
  const ok = (s) => s.replace(/Zone Of Possible Agreement|danger zone|green zone|zone of agreement/gi, '');
  const bad = [];
  const walk = (v, where) => {
    if (typeof v === 'string') { if (/\bzones?\b/i.test(ok(v))) bad.push(`${where}: ${v.slice(0, 70)}`); }
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (['unlock', 'goal', 'related', 'teaches', 'theme', 'palette', 'icon', 'id', 'category'].includes(k)) continue; walk(x, where + '.' + k); }
  };
  walk(CODEX, 'CODEX'); walk(QUESTS, 'QUESTS'); walk(ACHIEVEMENTS, 'ACHIEVEMENTS'); walk(DAILIES, 'DAILIES'); walk(ZONES, 'ZONES'); walk(ASSETS, 'ASSETS'); walk(BUYERS, 'BUYERS'); walk(PERKS, 'PERKS');
  walk(AUDIT_THEMES, 'AUDIT_THEMES'); walk(EVENTS, 'EVENTS'); walk(CLIENTS, 'CLIENTS'); walk(LOANS, 'LOANS'); walk(UPGRADES, 'UPGRADES'); walk(PIPE, 'PIPE');
  assert.deepEqual(bad, []);
  // what the formula, title and the tag lines of every entry say counts too
  for (const e of CODEX) assert.doesNotMatch(ok([e.title, e.formula || '', ...e.mistakes, e.tryIt].join(' ')), /\bzones?\b/i, e.id);
  for (const f of ['docs/FACULTY_KIT.md', 'docs/ARCHITECTURE.md', 'docs/COMPLIANCE.md', 'README.md']) assert.doesNotMatch(text(f), /\bzones?\b/i, f);
});

// ===================================================================================================================================
// The audit's "fixed" content items, played again

/** Plays 90 days with Industrial Park opened on `openDay`, every audit answered the hour it appears. */
function auditRun(openDay, { perks = [], seed = 5 } = {}) {
  const g = new Game({ perks, seed }); g.env.algo = false;
  const pr = new Progress(g); g.onEvent = (e) => pr.onEvent(e);
  let passed = 0;
  for (let h = 0; h < 2160; h++) {
    g.advanceTo(g.s.hour + 1);
    if (g.s.hour === (openDay - 1) * 24) { g.s.cash = 1e9; g._unlock(); }
    if (g.s.auditPending && !g.s.over) { g.s.cash = Math.max(g.s.cash, 1e6); if (g.resolveAudit('A').ok) passed++; }
  }
  return { passed, done: (id) => !!pr.m.a[id]?.done };
}

test('re-check: Audit-Proof is earned at the default audit pace on any seed and by any Background that is not slowed, and still asks for district 9 by about day 30', () => {
  const need = ACHIEVEMENTS.find((a) => a.id === 'a-audit-proof').goal.count;
  assert.equal(need, 5); assert.match(ACHIEVEMENTS.find((a) => a.id === 'a-audit-proof').desc, /about day 30/);
  for (const seed of [1, 9, 23]) {
    const early = auditRun(22, { seed }), late = auditRun(34, { seed });
    assert.ok(early.passed >= 5 && early.done('a-audit-proof'), `seed ${seed}: district 9 on day 22 gives ${early.passed} audits`);
    assert.ok(!late.done('a-audit-proof'), `seed ${seed}: district 9 on day 34 is too late for an epic`);
  }
  for (const perks of [['heir', 'creator'], ['second', 'pro'], ['native', 'roots']]) assert.ok(auditRun(25, { perks }).done('a-audit-proof'), perks.join('+'));
  const slow = auditRun(25, { perks: ['immigrant', 'pro'] }); // audits come 1.4x as often for the Immigrant: more of them, never fewer
  assert.ok(slow.passed >= 6 && slow.done('a-audit-proof'));
});

test('re-check: the daily bounties are three different templates, present on day 1 for a real game, kept across a reload, and no two templates travel together', () => {
  const g = new Game({ perks: [], seed: 77 }); const pr = new Progress(g);
  assert.equal(g.day, 1); assert.equal(pr.dailies().length, 3, 'bounties on day 1');
  assert.equal(new Set(pr.dailies().map((d) => d.id)).size, 3); assert.equal(pr.m.d.day, 1);
  const again = new Progress(g); assert.deepEqual(again.dailies().map((d) => d.id), pr.dailies().map((d) => d.id), 'a second Progress on the same game keeps the day\'s bounties');
  const mid = new Game({ perks: [], seed: 3, startHour: 40 * 24 }); assert.equal(new Progress(mid).m.d.day, 41, 'a game that starts mid-run rolls for its own day');
  const n = DAILIES.length, together = new Map(); let days = 0;
  for (let seed = 200; seed < 330; seed++) {
    const p = new Progress({ day: 1, s: { seed, points: 0, meta: {} }, xp() {} });
    for (let day = 2; day <= 90; day++) {
      p.onEvent({ type: 'day', day }); days++;
      const ids = p.dailies().map((d) => d.id).sort();
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) together.set(ids[i] + '|' + ids[j], (together.get(ids[i] + '|' + ids[j]) || 0) + 1);
    }
  }
  const expected = days * 6 / (n * (n - 1)); // a pair of templates is in the day's three with chance 6 / (n x (n - 1))
  assert.equal(together.size, n * (n - 1) / 2, 'every pair of templates meets sometime');
  for (const [pair, k] of together) assert.ok(k > expected * 0.6 && k < expected * 1.5, `${pair} are together on ${k} days, fair share ${expected.toFixed(0)}`);
});

/** Haggles through the real Deal Room glue, as audit-content.test.mjs does, from another run of seeds. */
function haggleEvents(skill, role, n, from) {
  const out = [];
  for (let seed = from; out.length < n && seed < from + 6000; seed++) {
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

test('re-check: on other seeds Quick still earns the common haggle goals and none of the rare ones, and a skilled player still earns every one of them', () => {
  const ach = (id) => ACHIEVEMENTS.find((a) => a.id === id), reaches = (def, evs) => goalDone(def.goal, evs.reduce((p, e) => p + goalDelta(def.goal, e), 0));
  const share = (evs, f) => evs.filter(f).length / evs.length;
  const quickSell = haggleEvents(0.5, 'sell', 120, 31000), quickBuy = haggleEvents(0.5, 'buy', 120, 31000), quick = [...quickSell, ...quickBuy];
  assert.ok(quickSell.length >= 100 && quickBuy.length >= 100);
  for (const id of ['a-haggle-first', 'a-haggle-ten']) assert.ok(reaches(ach(id), quick), id);
  assert.ok(reaches(DAILIES.find((d) => d.id === 'd-buy-low'), quick) && reaches(DAILIES.find((d) => d.id === 'd-haggle-day'), quick));
  for (const id of ['a-silver-tongue', 'a-bargain-hunter', 'a-bg-pro', 'a-poker-face']) assert.ok(!reaches(ach(id), quick), `${id} is rare: Quick does not earn it`);
  assert.equal(share(quickSell, (e) => e.deal && e.mult >= 1.2), 0, 'Quick never sells 20% above fair'); assert.equal(share(quickBuy, (e) => e.deal && e.mult <= 0.95), 0, 'Quick never buys 5% under the asking price');
  assert.ok(share(quickBuy, (e) => e.deal && e.mult <= 1) > 0.35, 'but it gets the asking price or lower about half the time, so Buy Low is a day\'s work');
  const expertSell = haggleEvents(1, 'sell', 100, 31000), expertBuy = haggleEvents(1, 'buy', 140, 31000), midSell = haggleEvents(0.75, 'sell', 100, 31000);
  for (const id of ['a-silver-tongue', 'a-bg-pro', 'a-poker-face']) assert.ok(reaches(ach(id), expertSell), `${id}: an expert earns it`);
  assert.ok(reaches(ach('a-bargain-hunter'), expertBuy), 'an expert buyer earns Bargain Hunter');
  for (const id of ['a-silver-tongue', 'a-bg-pro']) assert.ok(reaches(ach(id), midSell), `${id}: so does a player at 0.75`);
  assert.ok(share(expertSell, (e) => e.deal && e.score >= 0.95 && e.mult >= 1.1) > 0.12, 'Poker Face is common enough among experts to be fair');
});

test('re-check: skill-point grants go through game.grantPoints, never past what the three skills can use, and the surplus pays XP', () => {
  const g = new Game({ perks: [], seed: 1, specialty: 'ops' });
  const room = () => Object.keys(SKILLS).reduce((n, k) => n + SKILL_MAX - g.s.skills[k], 0);
  assert.equal(room(), 19); assert.equal(g.pointRoom(), 19);
  const authored = [...QUESTS, ...ACHIEVEMENTS, ...ACADEMY].reduce((n, x) => n + (x.reward?.points || 0), 0);
  assert.ok(authored <= 19, `authored points ${authored}`);
  // everything the quest, achievement and Academy files pay in points, paid to a real game at once, banks no more than the skills can absorb
  const pr = new Progress(g); const xp0 = g.s.xp, levels = () => g.s.skills.ops + g.s.skills.growth + g.s.skills.fintech, top = 3 * SKILL_MAX;
  for (const def of [...QUESTS, ...ACHIEVEMENTS]) pr._reward('x', def); // the levels these rewards reach pay points too, through the same door
  assert.ok(g.s.points >= 0 && g.s.points + levels() <= top, `${g.s.points} points banked on skills at ${levels()} of ${top}`);
  const r = g.grantPoints(100); // far more than there is room for
  assert.equal(g.pointRoom(), 0, 'the room is full'); assert.equal(g.s.points + levels(), top, 'and exactly full: nothing is banked that no skill can use');
  assert.equal(r.points + r.xp / ECON.pointXp, 100, 'every point is either banked or paid as XP');
  assert.ok(g.s.xp - xp0 >= r.xp, 'the spare points came back as experience');
  // a founder who has spent points and one who has mastered a skill: the room is what is left
  const h = new Game({ perks: [], seed: 2, specialty: 'ops' }); h.s.skills = { ops: 8, growth: 8, fintech: 7 };
  assert.equal(h.pointRoom(), 1); assert.deepEqual(h.grantPoints(4), { points: 1, xp: 3 * ECON.pointXp });
  assert.equal(h.spendPoint('ops').ok, false, 'a skill at mastery takes no more'); assert.ok(h.spendPoint('fintech').ok); assert.equal(h.pointRoom(), 0);
  assert.deepEqual(h.grantPoints(0), { points: 0, xp: 0 }); assert.deepEqual(h.grantPoints(-5), { points: 0, xp: 0 }); assert.deepEqual(h.grantPoints(NaN), { points: 0, xp: 0 });
  // Progress uses the engine's rule and its numbers, including for a game whose skills are nearly full
  const q = QUESTS.find((x) => x.reward.points); const k = new Game({ perks: [], seed: 3 }); k.s.skills = { ops: 8, growth: 8, fintech: 8 };
  new Progress(k)._reward('quest', q); assert.equal(k.s.points, 0, 'no room, so no point is banked'); assert.ok(k.s.xp >= q.reward.xp + ECON.pointXp * q.reward.points);
});

test('re-check: every yield asset out-earns its wear for every Background, in every district it is wanted (and the fads district for digital goods)', () => {
  const YIELD = Object.entries(ASSETS).filter(([, a]) => a.yield);
  assert.ok(YIELD.length >= 14);
  let worst = { grew: Infinity };
  for (const perk of Object.keys(PERKS)) {
    for (const [id, a] of YIELD) {
      const zones = new Set(Object.keys(a.dem).map(Number).filter((z) => demandOf(a, z) >= 3)); if (a.tags.includes('digital')) zones.add(10);
      for (const z of zones) {
        const g = quietGame(z, { perks: [perk] }); const held = crate(g, id, z), nw0 = g.netWorth();
        pass(g, 30);
        const grew = g.netWorth() / nw0 - 1;
        if (grew < worst.grew) worst = { grew, id, z, perk };
        assert.ok(grew > 0, `${id} in ${ZONES[z].short} with ${perk}: net worth moves ${pct(grew)} in 30 days`);
        assert.ok(g.s.cash > 0, `${id}: the income arrives as cash`);
        void held;
      }
    }
  }
  assert.ok(worst.grew > 0.005, `the weakest hold (${worst.id} in district ${worst.z} with ${worst.perk}) still gains ${pct(worst.grew, 2)} in 30 days`);
});
