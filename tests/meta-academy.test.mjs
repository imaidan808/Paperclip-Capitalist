// The Academy (js/meta/academy.js): shape, limits, reachability, and the numbers behind every lesson, all read from the REAL game.
// Run: node --test tests/meta-academy.test.mjs
//
// How this file keeps a lesson true:
//  1. `sandbox(m)` rebuilds a mission's scripted Game from its `setup` the way the Academy's sandbox builder does (a Game with the mission's Backgrounds,
//     skills, cash, assets, leads, lots with hidden truth, scripted events and the cohort's ghosts, seeded 'academy-<id>'; spawns off).
//  2. Each mission's test (`m01`..`m10`) recomputes every number its lesson quotes with the real engine calls (quotePitch, repairQuote, forecast, draw,
//     deRatio, poolQuote, eei and the Deal Room games) at par, a Deal Room multiplier of 1.00, formats them the way the screen rounds, and requires the
//     text to contain exactly those strings; `onlyEngineDollars` then fails on any dollar figure the text carries that the engine did not give.
//  3. `PLAYS` wins every mission by scripted engine play alone, feeding the steps the same events the screen would, and the margin tests assert that the
//     right choice earns clearly more than the tempting wrong one, also against the worst a Deal Room multiplier can do (the engine clamps it to 0.6..1.4).
//  4. The Deal Room's parameters (`inspectParams`, `pitchParams`, `auctionParams`, the haggle seeds) mirror the glue on the v2/ui-deal branch (js/deal.js),
//     and `sandbox` mirrors js/ui/academy-sandbox.js on v2/ui-academy; neither is in this tree. If either moves, the exact-seed checks say so.
// If the economy, the content or a lesson drifts, a test here names the number that moved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMY } from '../js/meta/academy.js';
import { CODEX } from '../js/meta/codex.js';
import { REQUIRED_CODEX, DOCK_IDS, EVENT_TYPES, EVENT_PAYLOAD, BACKGROUND_IDS } from '../js/meta/ids.js';
import { matchEvent } from '../js/meta/match.js';
import { ZONE_COUNT, TAGS } from '../js/data/schema.js';
import { ASSETS, BUYERS, ZONES, PERKS, SKILLS, MIL_ZONE, EVENTS, ALGO_EVENTS, EEI_FLOOR_DEFAULT, DEBT, TOTAL_DAYS, PIPE } from '../js/config.js';
import { Game } from '../js/engine.js';
import { Cohort } from '../js/cohort.js';
import { hash, hash01 } from '../js/rng.js';
import { demandOf, eei as eeiCalc, FAKE_VALUE } from '../js/market.js';
import * as haggle from '../js/play/haggle.js';
import * as inspect from '../js/play/inspect.js';
import * as pitchGame from '../js/play/pitch.js';
import * as repairGame from '../js/play/repair.js';
import * as auctionGame from '../js/play/auction.js';

const M = (id) => ACADEMY.find((m) => m.id === id);
const isStr = (x) => typeof x === 'string' && x.trim().length > 0;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isInt = (x) => Number.isInteger(x);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const keysOf = (o, allowed, where) => { for (const k of Object.keys(o)) assert.ok(allowed.includes(k), `${where}: unexpected field "${k}"`); };
function* strings(v, path = '') { // every string in a value, with its path
  if (typeof v === 'string') yield [path, v];
  else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* strings(v[i], `${path}[${i}]`);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) yield* strings(x, `${path}.${k}`);
}
const text = (v) => JSON.stringify(v);
const near = (a, b, eps = 0.006) => Math.abs(a - b) <= eps;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

// ---------------------------------------------------------------------------------------------------------------------------------------
// Money, the way the screen rounds it (js/deal.js `money`: under $100 two decimals, else whole dollars with commas) and with cents where a worked
// example does arithmetic on them.
const whole = (x) => Math.round(Math.abs(x) + 1e-9).toLocaleString('en-US');
const ui = (x) => (Math.abs(x) < 100 ? `${x < 0 ? '-' : ''}$${Math.abs(x).toFixed(2)}` : `${x < 0 ? '-' : ''}$${whole(x)}`);
const cents = (x) => `${x < 0 ? '-' : ''}$${Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const w$ = (x) => `${x < 0 ? '-' : ''}$${whole(x)}`; // whole dollars, where a worked example rounds a small amount to read cleanly
const r2 = (x) => Math.round(x * 100 + 1e-9) / 100;
const plus = (s) => (s.startsWith('-') ? s : '+' + s);
const n2 = (x) => x.toFixed(2);
const pc = (x) => `${Math.round(x * 100 + 1e-9)}%`;

// ---------------------------------------------------------------------------------------------------------------------------------------
// The sandbox: a mission's `setup` made into a Game (the Academy's sandbox builder does exactly this, plus a Session around it).
const DEFECT_LABELS = ['worn finish', 'loose fittings', 'faded markings', 'missing parts', 'failing seal', 'hairline cracks'];
function lotTruthFrom(truth = {}) {
  const q = Math.round(clamp(isNum(truth.quality) ? truth.quality : 1, 0.3, 1.3) * 100) / 100, fake = !!truth.fake;
  const n = Math.max(0, Math.round((1 - q) * 8 + (fake ? 1 : 0)));
  return { q, fake, defects: DEFECT_LABELS.filter((_, i) => i < n).map((label, i) => ({ id: 'd' + i, label })) };
}
/** `over` replaces fields of the mission's setup (a lesson sometimes asks "what if Ops were 1?"). */
function sandbox(m, over = {}) {
  const setup = { ...m.setup, ...over }, home = m.zone;
  const zones = [...new Set([...setup.zones, home])].sort((a, b) => a - b);
  const worldSeed = 'academy-' + m.id;
  const g = new Game({ perks: (setup.perks || []).filter((p) => PERKS[p]).slice(0, 2), specialty: null, handle: 'You', pid: 'ACADEMY', seed: hash('academy:' + m.id), startHour: 0, worldSeed });
  g._spawnLead = () => {}; g._spawnLot = () => {}; g._algoEvent = () => {};
  g.env.algo = false;
  const s = g.s;
  s.specialty = null;
  s.skills = { ops: 1, growth: 1, fintech: 1 };
  for (const k of Object.keys(SKILLS)) if (setup.skills && isNum(setup.skills[k])) s.skills[k] = clamp(Math.round(setup.skills[k]), 1, 8);
  s.cash = Math.max(0, setup.cash || 0);
  s.events = []; s.news = []; g.evq = [];
  s.zones = []; s.leads = {}; s.lots = {}; s.pool = {};
  for (const z of zones) g._openZone(z);
  for (const [k, z] of Object.entries(MIL_ZONE)) s.mil[k] = s.zones.includes(z);
  s.nid = 100;
  s.assets = [];
  for (const a of setup.assets) {
    const asset = g._mk(s, a.cls, { cond: a.cond === 'broken' ? 'broken' : 'ok', quality: a.quality ?? 1, zone: home });
    asset.basis = Math.round(g.val(asset) * 100) / 100;
    s.assets.push(asset);
  }
  s.peak = Math.max(s.peak, g.netWorth());
  s.startCapital = Math.max(0.05, s.peak);
  for (const l of setup.leads) s.leads[home].push({ id: l.id, zone: home, seg: l.seg, budget: l.budget, need: l.need || null, born: 0, exp: 24 * 365 });
  for (const l of setup.lots) s.lots[home].push({ id: l.id, zone: home, cls: l.cls, cond: l.cond === 'broken' ? 'broken' : 'ok', price: l.price, exp: 24 * 365, mode: l.auction || l.mode === 'auction' ? 'auction' : 'fixed', truth: lotTruthFrom(l.truth || {}) });
  for (const ev of setup.events || []) g.injectEvent(ev.kind, ev.atHour, { id: `lesson-${ev.kind}-${ev.atHour}`, cls: ev.cls });
  g._m = null;
  g.ckpt.clear(); g._checkpoint();
  g.env.cohort = new Cohort({ seed: worldSeed, ghosts: setup.cohort?.ghosts || 0 });
  return g;
}
const withSkills = (m, skills) => ({ skills: { ...m.setup.skills, ...skills } });
const idOf = (g, cls) => g.s.assets.find((a) => a.cls === cls).id;
const working = (g, cls, zone) => g.val({ cls, cond: 'ok', quality: 1, wear: 1, zone });

// ---------------------------------------------------------------------------------------------------------------------------------------
// The Deal Room's glue, as the v2/ui-deal branch writes it (js/deal.js): the parameters the screen gives each game. The scripted players below use them so
// that "can be won" means "can be won on the screen". If that glue changes, the exact-seed checks say so; the statistical ones keep standing.
const stageSeed = (seed, key) => hash(`${seed}|${key}`) >>> 0;
const seedFor = (g, spec) => hash(`${g.s.seed}|deal|${spec.kind}|${spec.kind === 'sell' ? `${spec.assetId}>${spec.leadId}` : `${spec.zone}:${spec.lotId}`}|${g.s.hour}`) >>> 0;
const insightOf = (g) => clamp(Math.floor(g.lvl('growth') * 0.65), 0, 5);
const needsOf = (seg, need) => [...new Set([...(need ? [need] : []), ...Object.entries(BUYERS[seg].like).filter(([, w]) => w >= 0.5).sort((a, b) => b[1] - a[1]).map(([t]) => t)])].slice(0, 4);
const rawPrice = (q) => { const p = q.parts; return p.ref * p.term * p.base * 1 * p.cm * p.growth * p.hustle * (q.lead.need ? p.quality : 1); }; // pitchK is 1: asserted below
function inspectParams(g, zone, lot, seed) {
  const t = g.lotTruth(zone, lot.id), ops = g.lvl('ops'), P = g.P, early = zone <= 2;
  const rate = lot.cond === 'ok' ? clamp((ZONES[zone].rules.fakes || 0) * (ASSETS[lot.cls].fakeRisk ?? 1), 0, 0.6) : 0;
  return { truth: { quality: t.q, fake: !!t.fake, defects: t.defects }, budget: 3 + Math.floor(ops / 2) + (P.probeBonus || 0), accuracy: clamp(0.45 + 0.07 * ops + 0.05 * (P.inspectBonus || 0), 0.3, 0.95),
    fakeDetect: !!P.fakeDetect, prior: { quality: early ? 1.0 : 0.925, sd: early ? 0.09 : 0.13, fake: Math.max(0.005, rate) }, seed };
}
function pitchParams(g, asset, lead, seed) {
  const B = BUYERS[lead.seg], quirk = hash01(lead.id + '|quirk') < 0.4 ? pitchGame.quirkFor(hash(lead.id + '|q')) : null;
  return { buyer: { needs: needsOf(lead.seg, lead.need), bias: B.bias, quirk }, asset: { tags: [...ASSETS[asset.cls].tags], features: [] }, insight: insightOf(g), seed };
}
function auctionParams(g, zone, lot, read, seed) {
  const t = g.lotTruth(zone, lot.id), M0 = lot.price / 0.9, qbar = zone <= 2 ? 1.0 : 0.925, fintech = g.lvl('fintech'), rivals = clamp(2 + Math.floor(zone / 4), 2, 5);
  const gaussU = (tag) => Math.sqrt(-2 * Math.log(Math.max(hash01(`${seed}|${tag}a`), 1e-9))) * Math.cos(2 * Math.PI * hash01(`${seed}|${tag}b`));
  const sdEst = clamp(0.18 - 0.012 * (fintech - 1), 0.08, 0.18), looks = M0 * qbar, own = Math.max(0.1 * looks, looks * (1 + sdEst * gaussU('est')));
  let estimate = own;
  if (read && read.estimate) { const w = clamp(0.25 + 0.6 * (read.confidence || 0), 0, 0.85), q = read.estimate.quality, p = read.estimate.fakeProb; estimate = (1 - w) * own + w * M0 * (q * (1 - p) + FAKE_VALUE * p); }
  const field = auctionGame.field({ trueValue: looks, rivals, noise: 0.15, seed, reserve: lot.price * 0.6, increment: lot.price / 20 });
  return { estimate: Math.max(0.01, estimate), trueValue: Math.max(0.01, M0 * (t.fake ? FAKE_VALUE : t.q)), reserve: lot.price * 0.6, increment: lot.price / 20, bidders: field.bidders, budget: Math.max(0.01, Math.min(lot.price * 1.4, g.s.cash)), assist: false, seed };
}

// ---- the scripted players: each does what a good player does, through the engine's own API
function readLot(g, zone, lotId, probes) { // Read stage, then the engine is told what was learned (the screen calls recordInspect when the deal is over)
  const lot = g.s.lots[zone].find((l) => l.id === lotId);
  let st = inspect.create(inspectParams(g, zone, lot, stageSeed(seedFor(g, { kind: 'buy', zone, lotId }), 'read')));
  for (const id of probes) st = inspect.act(st, { type: 'probe', id }).state;
  st = inspect.act(st, { type: 'conclude' }).state;
  const res = inspect.result(st);
  g.recordInspect(zone, lotId, res);
  return res;
}
function bestPitch(g, asset, lead) { // the best pair of angles in the Pitch stage, found by trying them all (a player finds it from the hints)
  const params = pitchParams(g, asset, lead, stageSeed(seedFor(g, { kind: 'sell', assetId: asset.id, leadId: lead.id }), 'pitch'));
  let best = null;
  for (const l of pitchGame.legal(pitchGame.create(params))) { const r = pitchGame.result(pitchGame.act(pitchGame.create(params), l).state); if (!best || r.mult > best.mult) best = { pair: l.angles, mult: r.mult }; }
  return best;
}
const haggleSell = (g, { fair, lead, zone, alt, seed, insight = insightOf(g), reserveMult = null }) => {
  const B = BUYERS[lead.seg], u = hash01(`${seed}|reserve`);
  return { role: 'sell', fair, reserve: reserveMult ? fair * reserveMult : Math.min(lead.budget, fair * (1.1 + 0.25 * u)), style: B.style, patience: B.patience + (ZONES[zone]?.rules?.haggle ? 1 : 0), handicap: g.P.haggleHandicap || 0, insight, alt: alt > 0 ? alt : null, assist: false, seed };
};
/** careless: open at fair, take the first answer. careful: do what the Assist coach advises at every move (anchor, hold, concede, leverage, accept). */
function haggleRun(params, how) {
  let s = haggle.create({ ...params, assist: how === 'careful' });
  const log = [];
  if (how === 'careless') {
    s = haggle.act(s, { type: 'anchor', level: 'fair' }).state;
    log.push({ do: 'anchor fair', yours: s.log.at(-1).yours, theirs: s.log.at(-1).theirs });
    if (!s.done) { s = haggle.act(s, { type: 'accept' }).state; log.push({ do: 'accept' }); }
  } else {
    for (let i = 0; i < 30 && !s.done; i++) {
      const a = haggle.view(s).advice.action, r = haggle.act(s, a);
      if (r.say === null) break;
      s = r.state;
      log.push({ do: a.type + (a.level ? ' ' + a.level : '') + (a.size ? ' ' + a.size : ''), yours: s.log.at(-1).yours, theirs: s.log.at(-1).theirs });
    }
  }
  return { res: haggle.result(s), log, state: s };
}
function sellDeal(g, assetId, leadId, how) { // one haggled sale, the way the Deal Room ends it: the haggle is recorded, then the engine is asked to pitch
  const q = g.quotePitch(assetId, leadId), lead = g.s.leads[q.zone].find((l) => l.id === leadId), zone = q.zone;
  const fair = Math.min(rawPrice(q), lead.budget);
  let alt = 0;
  for (const l of g.s.leads[zone]) { if (l.id === leadId) continue; const o = g.quotePitch(assetId, l.id), p = o.ok && !o.rejected ? Math.min(rawPrice(o), l.budget) : 0; if (p >= fair * 0.8 && p <= fair * 1.3) alt = Math.max(alt, p); }
  const seed = stageSeed(seedFor(g, { kind: 'sell', assetId, leadId }), 'close');
  const run = haggleRun(haggleSell(g, { fair, lead, zone, alt, seed }), how);
  g.recordPlay('haggle', { ...run.res, role: 'sell' });
  const out = run.res.deal ? g.pitch(assetId, leadId, { mult: run.res.mult }) : null;
  return { ...run, fair, alt, out };
}
function bidUpTo(g, zone, lotId, ceiling, read) { // Bid stage: raise while the next price is within the ceiling, else drop
  const lot = g.s.lots[zone].find((l) => l.id === lotId);
  let s = auctionGame.create(auctionParams(g, zone, lot, read, stageSeed(seedFor(g, { kind: 'buy', zone, lotId }), 'bid')));
  for (let i = 0; i < 400 && !s.done; i++) { const v = auctionGame.view(s); const r = auctionGame.act(s, { type: v.yourTurn && v.nextBid <= ceiling + 1e-9 ? 'bid' : 'drop' }); if (r.say === null) break; s = r.state; }
  return auctionGame.result(s);
}
function fixIt(g, assetId, seedKey = 'fix') { // Fix stage at full skill, then the engine repairs with what the dial gave
  const a = g.s.assets.find((x) => x.id === assetId);
  const res = repairGame.autoplay({ ops: g.lvl('ops'), difficulty: 1, assist: false, careful: false, seed: stageSeed(seedFor(g, { kind: 'repair', assetId }), seedKey) }, 1);
  return g.repair(a.id, { qualityMult: res.qualityMult, costMult: res.costMult, precision: res.precision });
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// The runner: a mission's steps fed with the events the screen would send (js/ui/academy-sandbox.js feedRun: one event advances at most one step, and
// the win counts once every step is done).
const waitMatches = (w, e) => (w.type === 'event' ? e.type === w.event && matchEvent(w.match, e) : w.type === 'ui' ? e.type === 'ui' && e.ui === w.ui && e.id === w.id : e.type === 'click' && e.anchor === w.anchor);
function lesson(m, over) {
  const g = sandbox(m, over), c = { m, g, i: 0, won: false, seen: [] };
  c.feed = (e) => {
    c.seen.push(e);
    if (c.won) return;
    const step = m.steps[c.i];
    let i = c.i;
    if (step && waitMatches(step.wait, e)) i++;
    c.won = i >= m.steps.length && e.type === m.win.event && matchEvent(m.win.match, e);
    c.i = i;
  };
  g.onEvent = c.feed;
  return c;
}
function playMission(m, script) {
  const c = lesson(m);
  m.steps.forEach((s, idx) => {
    assert.equal(c.i, idx, `${m.id}: should be on step ${idx + 1} (${s.id})`);
    if (s.wait.type === 'ui') c.feed({ type: 'ui', ui: 'open-drawer', id: s.wait.id });
    else if (s.wait.type === 'click') c.feed({ type: 'click', anchor: s.wait.anchor });
    script[s.id]?.(c);
    assert.equal(c.i, idx + 1, `${m.id}/${s.id}: the scripted player did not complete the step "${s.wait.event || s.wait.type}"`);
    assert.equal(c.won, false, `${m.id}/${s.id}: the win fired before the last step was done`);
  });
  script.win(c);
  assert.equal(c.won, true, `${m.id}: the scripted player did not win (saw ${c.seen.map((e) => e.type).join(', ')})`);
  return c;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
test('the economy the lessons are written against: pitch price rule, Quick par, EEI floor', () => {
  // quotePitch must stay reference x fit term x 0.60 x Cm x Growth x Background x deal, with pitchK 1 (rawPrice above rebuilds it)
  const g = sandbox(M('m01')), a = g.s.assets[0], q = g.quotePitch(a.id, 'cafe-barista');
  assert.ok(near(q.price, rawPrice(q), 1e-9), 'pitchK must be 1, or every worked example moves');
  assert.equal(q.parts.base, 0.6);
  assert.equal(EEI_FLOOR_DEFAULT, 1000);
  assert.equal(DEBT.maxDE, 3.0); assert.equal(DEBT.callDE, 4.5); assert.equal(DEBT.fireSale, 0.35);
  // a Deal Room multiplier is clamped by the engine to 0.6..1.4, which bounds how far noise can hide a lesson
  const lo = g.quotePitch(a.id, 'cafe-barista', { mult: 0.01 }), hi = g.quotePitch(a.id, 'cafe-barista', { mult: 99 });
  assert.ok(near(lo.deal, 0.6, 1e-12) && near(hi.deal, 1.4, 1e-12));
});

test('exactly ten missions m01..m10, in the order of section 9', () => {
  assert.ok(Array.isArray(ACADEMY));
  assert.deepEqual(ACADEMY.map((m) => m.id), ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10']);
  assert.equal(new Set(ACADEMY.map((m) => m.title)).size, 10, 'titles are distinct');
  assert.deepEqual(ACADEMY.map((m) => m.title), ['First Swap', 'Read the Room', 'Know Your Buyer', 'Haggle 101', 'Fix It', 'Cash Is Not Sleeping', "Other People's Money", "Don't Follow the Herd", 'Storm Warning', 'Deal Day']);
});

const MISSION_KEYS = ['id', 'title', 'icon', 'zone', 'concept', 'minutes', 'intro', 'setup', 'steps', 'win', 'why', 'teachBack', 'reward'];
const SETUP_KEYS = ['clock', 'assets', 'leads', 'lots', 'cash', 'zones', 'features', 'skills', 'perks', 'cohort', 'events'];
test('mission fields, types and limits', () => {
  for (const m of ACADEMY) {
    keysOf(m, MISSION_KEYS, m.id);
    for (const k of MISSION_KEYS) assert.ok(k in m, `${m.id}: missing ${k}`);
    assert.ok(isStr(m.title) && m.title.length <= 40, `${m.id}: title`);
    assert.ok(isStr(m.icon) && [...m.icon].length <= 3, `${m.id}: icon is a single emoji`);
    assert.ok(isInt(m.zone) && m.zone >= 1 && m.zone <= ZONE_COUNT, `${m.id}: district 1..16`);
    assert.ok(REQUIRED_CODEX.includes(m.concept), `${m.id}: concept "${m.concept}" is not a required codex id`);
    assert.ok(isNum(m.minutes) && m.minutes >= 1.5 && m.minutes <= 2.5, `${m.id}: minutes must keep a mission at 90-150 seconds`);
    assert.ok(isStr(m.intro) && m.intro.length >= 80 && m.intro.length <= 260, `${m.id}: intro is a scene of 80..260 characters (has ${m.intro.length})`);
  }
  assert.equal(new Set(ACADEMY.map((m) => m.concept)).size, 10, 'ten different concepts');
  assert.ok(new Set(ACADEMY.map((m) => m.zone)).size >= 7, 'the missions visit at least seven different districts');
});

test('setup is well formed and uses real content: districts, assets, buyers, perks and events that exist in the mission\'s own district', () => {
  for (const m of ACADEMY) {
    const s = m.setup, w = `${m.id} setup`, z = ZONES[m.zone];
    keysOf(s, SETUP_KEYS, w);
    assert.ok(['paused', 'running'].includes(s.clock), `${w}: clock`);
    assert.ok(Array.isArray(s.assets) && Array.isArray(s.leads) && Array.isArray(s.lots) && Array.isArray(s.zones) && Array.isArray(s.features), `${w}: arrays`);
    if (s.cash != null) assert.ok(isNum(s.cash) && s.cash >= 0 && s.cash < 1e7, `${w}: cash`);
    const tradeable = (cls, where) => {
      const a = ASSETS[cls];
      assert.ok(a, `${where}: "${cls}" is not an asset class in js/data`);
      assert.ok(demandOf(a, m.zone) >= 4, `${where}: "${cls}" has demand ${demandOf(a, m.zone)} in ${z.name}; it must be a tradeable class here (>= 4) or the lesson prices are wrong`);
      assert.ok(a.base >= z.scale * 0.05 && a.base <= z.scale * 4, `${where}: "${cls}" base $${a.base} is not a plausible price in ${z.name} (scale $${z.scale})`);
    };
    for (const a of s.assets) { keysOf(a, ['cls', 'cond', 'quality'], `${w} asset`); tradeable(a.cls, w); if (a.cond != null) assert.ok(['ok', 'broken'].includes(a.cond), `${w}: asset cond`); if (a.quality != null) assert.ok(isNum(a.quality) && a.quality > 0 && a.quality <= 1.5, `${w}: asset quality`); }
    for (const l of s.leads) {
      keysOf(l, ['id', 'seg', 'budget', 'need'], `${w} lead`);
      assert.ok(/^[a-z][a-z0-9-]*$/.test(l.id), `${w}: lead id "${l.id}" is kebab-case`);
      const b = BUYERS[l.seg];
      assert.ok(b, `${w}: buyer "${l.seg}" is not in js/data`);
      assert.equal(b.zone, m.zone, `${w}: buyer ${l.seg} lives in district ${b.zone}, not in ${z.name}`);
      assert.ok(isNum(l.budget) && l.budget >= b.budget[0] && l.budget <= b.budget[1], `${w}: ${l.seg} budget $${l.budget} is outside the buyer's real range ${b.budget}`);
      if (l.need != null) assert.ok(TAGS.includes(l.need) && s.assets.some((a) => ASSETS[a.cls].tags.includes(l.need)), `${w}: need "${l.need}" is not a tag of anything the player holds`);
    }
    for (const l of s.lots) {
      keysOf(l, ['id', 'cls', 'cond', 'price', 'truth', 'auction', 'mode'], `${w} lot`);
      assert.ok(/^[a-z][a-z0-9-]*$/.test(l.id), `${w}: lot id "${l.id}" is kebab-case`);
      tradeable(l.cls, w);
      assert.ok(['ok', 'broken'].includes(l.cond), `${w}: lot cond`);
      assert.ok(isNum(l.price) && l.price > 0, `${w}: lot price`);
      if (l.cond === 'broken') assert.ok(ASSETS[l.cls].repair, `${w}: a broken "${l.cls}" cannot be repaired`);
      if (l.auction != null) assert.equal(typeof l.auction, 'boolean', `${w}: lot.auction`);
      if (l.mode != null) assert.equal(l.mode, 'auction', `${w}: lot.mode`);
      assert.equal(!!l.auction, l.mode === 'auction', `${w}: lot.auction and lot.mode say the same thing`);
      if (l.truth != null) { keysOf(l.truth, ['quality', 'fake'], `${w} truth`); assert.ok(isNum(l.truth.quality) && l.truth.quality >= 0.3 && l.truth.quality <= 1.3 && typeof l.truth.fake === 'boolean', `${w}: truth`); }
    }
    for (const a of s.assets) if (a.cond === 'broken') assert.ok(ASSETS[a.cls].repair, `${w}: a broken "${a.cls}" cannot be repaired`);
    const ids = [...s.leads.map((l) => l.id), ...s.lots.map((l) => l.id)];
    assert.equal(new Set(ids).size, ids.length, `${w}: lead and lot ids are unique`);
    assert.ok(s.zones.length >= 1 && s.zones.every((x) => isInt(x) && ZONES[x]) && new Set(s.zones).size === s.zones.length, `${w}: districts`);
    assert.deepEqual([...s.zones].sort((a, b) => a - b), s.zones, `${w}: districts are sorted`);
    assert.ok(s.zones.includes(m.zone), `${w}: the mission's own district must be unlocked`);
    assert.ok(s.features.length >= 2 && s.features.every((f) => DOCK_IDS.includes(f)) && new Set(s.features).size === s.features.length, `${w}: features are dock ids`);
    if (s.skills) { keysOf(s.skills, ['ops', 'growth', 'fintech'], `${w} skills`); assert.ok(Object.values(s.skills).every((v) => isInt(v) && v >= 1 && v <= 8), `${w}: skills 1..8`); }
    if (s.perks) assert.ok(s.perks.length <= 2 && s.perks.every((p) => BACKGROUND_IDS.includes(p) && PERKS[p]), `${w}: perks are Background ids`);
    if (s.cohort) { keysOf(s.cohort, ['ghosts'], `${w} cohort`); assert.ok(isInt(s.cohort.ghosts) && s.cohort.ghosts >= 0 && s.cohort.ghosts <= 200, `${w}: ghosts`); }
    for (const e of s.events || []) {
      keysOf(e, ['kind', 'atHour', 'cls'], `${w} event`);
      assert.ok((EVENTS[e.kind] || ALGO_EVENTS[e.kind]) && isInt(e.atHour) && e.atHour >= 1 && e.atHour <= 96, `${w}: event kind and hour`);
      if (e.cls != null) { assert.ok(ASSETS[e.cls], `${w}: event class`); assert.ok(s.assets.some((a) => a.cls === e.cls) || s.lots.some((l) => l.cls === e.cls), `${w}: the ${e.kind} should hit something the player trades`); }
      if (EVENTS[e.kind]?.alert) assert.equal(e.cls, undefined, `${w}: ${e.kind} is a named shock and takes no class`);
    }
    // the scripted sandbox must be playable on its own: something to sell, buy or do
    assert.ok(s.assets.length + s.lots.length > 0 || s.cash > 0, `${w}: the player needs a stake`);
    assert.equal(sandbox(m).s.leads[m.zone].length, s.leads.length, `${w}: every lead reaches the sandbox`);
  }
});

test('mission 1 is the promise of the whole game: one paperclip, no money', () => {
  const s = M('m01').setup;
  assert.deepEqual(s.assets, [{ cls: 'paperclip' }]);
  assert.ok(!s.cash, 'cash is zero');
  assert.deepEqual(s.features, ['stock', 'market'], 'only the Stock and Market icons');
  assert.equal(s.leads.filter((l) => l.need).length, 1, 'exactly one urgent buyer');
  const urgent = s.leads.find((l) => l.need);
  assert.ok(s.leads.filter((l) => l !== urgent).every((l) => l.budget > urgent.budget), 'both decoys have the bigger wallet, so the lesson is a real choice');
});

test('features: only dock ids, growing mission by mission, introduced on schedule', () => {
  let prev = new Set();
  for (const m of ACADEMY) {
    const cur = new Set(m.setup.features);
    for (const f of prev) assert.ok(cur.has(f), `${m.id}: dock icon "${f}" disappeared (features never shrink)`);
    prev = cur;
  }
  const first = (f) => ACADEMY.findIndex((m) => m.setup.features.includes(f)) + 1;
  assert.equal(first('crew'), 6, 'Crew arrives with mission 6');
  assert.equal(first('bank'), 7, 'Bank arrives with mission 7');
  assert.ok(first('codex') <= 2, 'Codex is introduced by mission 2');
  assert.ok(first('quests') <= 5, 'Quests is introduced by mission 5 (skill points, right before Ops pays off)');
  assert.ok(first('travel') <= 9, 'Travel is introduced by mission 9');
  assert.deepEqual([...M('m10').setup.features].sort(), [...DOCK_IDS].sort(), 'Deal Day has the whole dock');
});

// ---------------------------------------------------------------------------------------------------------------------------------------
const ANCHORS = ['hud-cash', 'hud-networth', 'hud-day', 'hud-clock', 'player-card', 'tracker', 'ticker', 'dock-stock', 'dock-market', 'dock-crew', 'dock-bank', 'dock-travel', 'dock-codex',
  'dock-quests', 'world', 'drawer', 'deal-room', 'deal-stage-read', 'deal-stage-pitch', 'deal-stage-close', 'deal-quick'];
const OUTCOMES = ['win', 'pioneer', 'herd', 'flat', 'rejected'];
const parseAnchor = (a) => { const x = /^world:(lead|lot|asset|plot|static):(.+)$/.exec(a); return x ? { kind: x[1], ref: x[2] } : null; };
const rolesOf = (m) => ({
  leads: new Set(m.setup.leads.map((l) => l.id)), lots: new Set(m.setup.lots.map((l) => l.id)),
  assets: new Set([...m.setup.assets.map((a) => a.cls), ...m.setup.lots.map((l) => l.cls)]), // a won lot becomes an asset of its class
});
const stepsOf = (m) => m.steps.map((s, i) => ({ ...s, i }));

/** A match object may only use payload fields of its event, and values that can really occur. */
function checkMatch(match, event, m, w) {
  if (match == null) return;
  assert.ok(match && typeof match === 'object' && !Array.isArray(match), `${w}: match is an object`);
  const fields = EVENT_PAYLOAD[event];
  const who = rolesOf(m);
  for (const [k, v] of Object.entries(match)) {
    assert.ok(fields.includes(k), `${w}: "${k}" is not a payload field of "${event}" (${fields.join(', ')})`);
    const ops = v !== null && typeof v === 'object' && !Array.isArray(v);
    if (ops) { for (const [op, x] of Object.entries(v)) { assert.ok(['gte', 'lte', 'gt', 'lt', 'eq', 'in'].includes(op), `${w}: operator "${op}"`); if (op === 'in') assert.ok(Array.isArray(x) && x.length, `${w}: in needs a list`); else assert.ok(isNum(x) || typeof x === 'string' || typeof x === 'boolean', `${w}: operand`); } }
    const vals = ops ? (v.in || [v.eq].filter((x) => x !== undefined)) : [v];
    if (k === 'seg') for (const x of vals) assert.ok(m.setup.leads.some((l) => l.seg === x), `${w}: seg "${x}" is not a buyer in this mission`);
    if (k === 'cls') for (const x of vals) assert.ok(who.assets.has(x), `${w}: cls "${x}" is not an asset or lot class in this mission`);
    if (k === 'outcome') for (const x of vals) assert.ok(OUTCOMES.includes(x), `${w}: outcome "${x}"`);
    if (k === 'role') for (const x of vals) assert.ok(['buy', 'sell'].includes(x), `${w}: role`);
    if (k === 'kind' && event === 'shock') for (const x of vals) assert.ok((m.setup.events || []).some((e) => e.kind === x), `${w}: shock "${x}" is not scripted in this mission`);
    if (['fake', 'caught', 'deal', 'won'].includes(k)) assert.equal(typeof v, 'boolean', `${w}: ${k} is a boolean`);
    if (k === 'zone') for (const x of vals) assert.ok(m.setup.zones.includes(x), `${w}: district`);
  }
}

test('steps: 4 to 9 per mission, each with a coach line, a real anchor, a wait and a hint', () => {
  for (const m of ACADEMY) {
    assert.ok(Array.isArray(m.steps) && m.steps.length >= 4 && m.steps.length <= 9, `${m.id}: 4-9 steps (has ${m.steps?.length})`);
    const ids = m.steps.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `${m.id}: step ids are unique`);
    const who = rolesOf(m);
    let drawerSeen = false, dealSeen = false;
    for (const s of stepsOf(m)) {
      const w = `${m.id} step ${s.i + 1} (${s.id})`;
      keysOf(s, ['id', 'say', 'anchor', 'wait', 'hint', 'i'], w);
      assert.ok(/^[a-z][a-z0-9-]*$/.test(s.id), `${w}: id is kebab-case`);
      assert.ok(isStr(s.say) && s.say.length >= 30 && s.say.length <= 220, `${w}: say is 30..220 characters (has ${s.say?.length})`);
      assert.ok(isStr(s.hint) && s.hint.length >= 20 && s.hint.length <= 200 && s.hint !== s.say, `${w}: hint is 20..200 characters and says something new (has ${s.hint?.length})`);
      const pa = parseAnchor(s.anchor);
      if (pa) {
        if (pa.kind === 'lead') assert.ok(who.leads.has(pa.ref), `${w}: anchor lead "${pa.ref}" is not in the setup`);
        if (pa.kind === 'lot') assert.ok(who.lots.has(pa.ref), `${w}: anchor lot "${pa.ref}" is not in the setup`);
        if (pa.kind === 'asset') assert.ok(who.assets.has(pa.ref), `${w}: anchor asset "${pa.ref}" is not in the setup`);
        if (pa.kind === 'plot') assert.ok(/^[1-4]$/.test(pa.ref) && m.zone >= 5, `${w}: plots are 1..4 and exist from district 5`);
        if (pa.kind === 'static') assert.ok(/^[a-z][a-z0-9-]*$/.test(pa.ref), `${w}: static id`);
      } else {
        assert.ok(ANCHORS.includes(s.anchor), `${w}: unknown anchor "${s.anchor}"`);
        if (s.anchor.startsWith('dock-')) assert.ok(m.setup.features.includes(s.anchor.slice(5)), `${w}: points at a dock icon that is not visible yet`);
        if (s.anchor === 'drawer') assert.ok(drawerSeen, `${w}: "drawer" needs a drawer opened by an earlier step`);
        if (s.anchor.startsWith('deal-')) assert.ok(dealSeen, `${w}: "${s.anchor}" needs a Deal Room opened by an earlier step`);
      }
      const wt = s.wait;
      assert.ok(wt && typeof wt === 'object', `${w}: wait`);
      if (wt.type === 'event') {
        keysOf(wt, ['type', 'event', 'match'], `${w} wait`);
        assert.ok(EVENT_TYPES.includes(wt.event), `${w}: unknown event "${wt.event}"`);
        checkMatch(wt.match, wt.event, m, w);
      } else if (wt.type === 'ui') {
        keysOf(wt, ['type', 'ui', 'id'], `${w} wait`);
        assert.equal(wt.ui, 'open-drawer', `${w}: only open-drawer is a ui wait`);
        assert.ok(DOCK_IDS.includes(wt.id) && m.setup.features.includes(wt.id), `${w}: drawer "${wt.id}" is not visible in this mission`);
        assert.equal(s.anchor, `dock-${wt.id}`, `${w}: an open-drawer step points at that drawer's dock icon`);
        drawerSeen = true;
      } else if (wt.type === 'click') {
        keysOf(wt, ['type', 'anchor'], `${w} wait`);
        assert.equal(wt.anchor, s.anchor, `${w}: a click wait is on the step's own anchor`);
      } else assert.fail(`${w}: wait type "${wt.type}"`);
      if (pa && ['lead', 'lot', 'asset'].includes(pa.kind)) dealSeen = true; // a step that points at a thing in the world has the player tap it, which opens its Deal Room
      if (wt.type === 'event' && (wt.event === 'repair' || wt.event === 'hire')) drawerSeen = true;
      if (s.anchor.startsWith('deal-')) dealSeen = true;
    }
  }
});

/** Can the player make this event happen with what the setup gives them? */
function reachable(m, event) {
  const s = m.setup, has = (f) => s.features.includes(f), heldBroken = s.assets.some((a) => a.cond === 'broken') || s.lots.some((l) => l.cond === 'broken');
  switch (event) {
    case 'pitch': return s.leads.length > 0 && (s.assets.length > 0 || s.lots.length > 0);
    case 'buy': return s.lots.length > 0;
    case 'inspect': return s.lots.some((l) => l.truth);
    case 'haggle': return s.leads.length > 0 || s.lots.length > 0;
    case 'auction': return s.lots.some((l) => l.auction && l.mode === 'auction');
    case 'repair': return heldBroken;
    case 'hire': case 'cycle': return m.zone >= 5 && has('crew');
    case 'draw': case 'repay': return m.zone >= 5 && has('bank');
    case 'shock': return (s.events || []).length > 0;
    case 'sell-pool': return s.assets.length > 0 || s.lots.length > 0;
    default: return false;
  }
}

test('wait and win events are real, carry real payload fields and can be reached from the setup', () => {
  for (const m of ACADEMY) {
    assert.ok(m.win && typeof m.win === 'object', `${m.id}: win`);
    keysOf(m.win, ['event', 'match'], `${m.id} win`);
    assert.ok(EVENT_TYPES.includes(m.win.event), `${m.id}: win event "${m.win.event}"`);
    checkMatch(m.win.match, m.win.event, m, `${m.id} win`);
    assert.ok(reachable(m, m.win.event), `${m.id}: the win event "${m.win.event}" cannot happen in this sandbox`);
    for (const s of m.steps) if (s.wait.type === 'event') assert.ok(reachable(m, s.wait.event), `${m.id}/${s.id}: "${s.wait.event}" cannot happen in this sandbox`);
    const last = m.steps[m.steps.length - 1];
    // the contract says the mission completes when the win event arrives after the last step. A win that is the very event the last step waits on
    // would be consumed by that step and never seen again by a runner that waits for it afterwards, so it must be a different, later event.
    assert.ok(!(last.wait.type === 'event' && last.wait.event === m.win.event), `${m.id}: the win event "${m.win.event}" is also the last step's wait; make the last step a click on the control that causes it`);
  }
});

test('every coach line names the control it points at', () => {
  const NAME = { 'hud-cash': 'cash', 'hud-clock': 'clock', ticker: 'ticker', 'deal-quick': 'quick', 'deal-stage-read': 'read', 'deal-stage-pitch': 'pitch', 'deal-stage-close': 'close' };
  for (const m of ACADEMY) for (const s of m.steps) {
    const want = s.anchor.startsWith('dock-') ? s.anchor.slice(5) : NAME[s.anchor] || (s.anchor.startsWith('world:plot') ? 'plot' : null);
    if (want) assert.ok(s.say.toLowerCase().includes(want), `${m.id}/${s.id}: the coach line should name "${want}", the control it points at`);
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------------
test('why cards: title, 2-3 short paragraphs, a formula and a worked example', () => {
  for (const m of ACADEMY) {
    const y = m.why, w = `${m.id} why`;
    keysOf(y, ['title', 'body', 'formula', 'example'], w);
    assert.ok(isStr(y.title) && y.title.length <= 60, `${w}: title`);
    assert.ok(Array.isArray(y.body) && y.body.length >= 2 && y.body.length <= 3, `${w}: 2-3 paragraphs`);
    for (const p of y.body) assert.ok(isStr(p) && p.length >= 80 && p.length <= 420, `${w}: paragraph of 80..420 characters (has ${p.length}): ${p.slice(0, 40)}`);
    assert.ok(isStr(y.formula) && y.formula.length <= 220, `${w}: formula (${y.formula?.length})`);
    keysOf(y.example, ['setup', 'steps', 'result'], `${w} example`);
    assert.ok(isStr(y.example.setup) && y.example.setup.length <= 360, `${w}: example setup (${y.example.setup.length})`);
    assert.ok(Array.isArray(y.example.steps) && y.example.steps.length >= 2 && y.example.steps.length <= 5, `${w}: 2-5 example steps`);
    for (const st of y.example.steps) assert.ok(isStr(st) && st.length <= 260 && /\d/.test(st), `${w}: each example step is short and has numbers (${st.length}): ${st}`);
    assert.ok(isStr(y.example.result) && y.example.result.length <= 300 && /\d/.test(y.example.result), `${w}: result (${y.example.result.length})`);
    assert.ok(!/\bTODO\b|\bTBD\b|lorem/i.test(text(y)), `${w}: placeholders`);
  }
});

test('teach-back: three options, exactly one correct, a reason on every option, answers not always in the same place', () => {
  const pos = [];
  let longest = 0, shortest = 0;
  for (const m of ACADEMY) {
    const t = m.teachBack, w = `${m.id} teachBack`;
    keysOf(t, ['q', 'options'], w);
    assert.ok(isStr(t.q) && t.q.length >= 20 && t.q.length <= 200, `${w}: question (${t.q.length})`);
    assert.equal(t.options.length, 3, `${w}: exactly 3 options`);
    assert.equal(t.options.filter((o) => o.correct === true).length, 1, `${w}: exactly 1 correct`);
    assert.ok(t.options.every((o) => typeof o.correct === 'boolean'), `${w}: correct is a boolean`);
    for (const o of t.options) {
      keysOf(o, ['text', 'correct', 'why'], `${w} option`);
      assert.ok(isStr(o.text) && o.text.length >= 15 && o.text.length <= 160, `${w}: option text (${o.text.length}): ${o.text}`);
      assert.ok(isStr(o.why) && o.why.length >= 30 && o.why.length <= 260, `${w}: every option has a reason (${o.why.length}): ${o.why}`);
    }
    assert.equal(new Set(t.options.map((o) => o.text)).size, 3, `${w}: distinct options`);
    const idx = t.options.findIndex((o) => o.correct);
    pos.push(idx);
    const lens = t.options.map((o) => o.text.length);
    if (lens[idx] === Math.max(...lens)) longest++;
    if (lens[idx] === Math.min(...lens)) shortest++;
  }
  for (const p of [0, 1, 2]) { const n = pos.filter((x) => x === p).length; assert.ok(n >= 2 && n <= 5, `the correct answer sits in slot ${p + 1} in ${n} of 10 missions; spread it`); }
  assert.ok(longest >= 2 && longest <= 5, `the correct option is the longest in ${longest} of 10 missions; players learn to pick (or avoid) the long one`);
  assert.ok(shortest >= 2 && shortest <= 5, `the correct option is the shortest in ${shortest} of 10 missions; players learn to pick (or avoid) the short one`);
});

test('rewards: xp that grows, real codex ids that include the mission concept, skill points for skill missions', () => {
  let prev = 0, points = 0;
  const codexIds = new Set(CODEX.map((e) => e.id));
  for (const m of ACADEMY) {
    const r = m.reward, w = `${m.id} reward`;
    keysOf(r, ['xp', 'codex', 'points'], w);
    assert.ok(isInt(r.xp) && r.xp >= 50 && r.xp <= 600, `${w}: xp`);
    assert.ok(r.xp >= prev, `${w}: xp never drops from one mission to the next`);
    prev = r.xp;
    assert.ok(Array.isArray(r.codex) && r.codex.length >= 1 && r.codex.length <= 4 && new Set(r.codex).size === r.codex.length, `${w}: 1-4 distinct codex ids`);
    for (const id of r.codex) assert.ok(REQUIRED_CODEX.includes(id) && codexIds.has(id), `${w}: "${id}" is not a Codex page`);
    assert.ok(r.codex.includes(m.concept), `${w}: unlocks its own concept`);
    if (r.points != null) { assert.equal(r.points, 1, `${w}: points is 1 when present`); points++; }
  }
  assert.ok(points >= 4 && points <= 6, `skill points are rare (${points})`);
  assert.ok(M('m10').reward.xp >= 300, 'graduation pays the most');
  const all = new Set(ACADEMY.flatMap((m) => m.reward.codex));
  for (const id of ['utility-fit', 'information-asymmetry', 'persona-fit', 'anchoring', 'batna-zopa', 'repair-roi', 'working-capital', 'debt-to-equity', 'margin-call', 'creativity-multiplier', 'demand-shock', 'diversification', 'hedging', 'eei-score'])
    assert.ok(all.has(id), `the Academy unlocks "${id}"`);
  // the Codex pages the coach and the cards point at by name must exist under that name
  const titles = new Set(CODEX.map((e) => e.title));
  assert.ok(titles.has('Urgency Premium') && M('m02').steps[0].say.includes('Urgency Premium'), 'mission 2 sends the player to a real Codex page');
});

test('every skill is met by mission 10, and mission 10 uses them all', () => {
  const evs = (m) => new Set([...m.steps.filter((s) => s.wait.type === 'event').map((s) => s.wait.event), m.win.event]);
  const anchors = (m) => new Set(m.steps.map((s) => s.anchor));
  assert.ok(evs(M('m02')).has('inspect'), 'Inspect in mission 2');
  assert.ok(anchors(M('m03')).has('deal-stage-pitch') && evs(M('m03')).has('pitch'), 'Pitch in mission 3');
  assert.ok(anchors(M('m04')).has('deal-stage-close'), 'the Close stage in mission 4');
  assert.ok(evs(M('m04')).has('haggle'), 'Haggle in mission 4');
  assert.ok(evs(M('m05')).has('repair'), 'Repair in mission 5');
  assert.ok(evs(M('m06')).has('hire') && evs(M('m06')).has('cycle'), 'Managers in mission 6');
  assert.ok(evs(M('m07')).has('draw') && evs(M('m07')).has('repay'), 'The Bank in mission 7');
  const ten = M('m10'), e = evs(ten), a = anchors(ten);
  for (const ev of ['inspect', 'auction', 'repair', 'pitch']) assert.ok(e.has(ev), `Deal Day uses ${ev}`);
  assert.ok(a.has('deal-stage-close'), 'Deal Day points at the Close stage');
  const talk = ten.steps.map((s) => s.say).join(' ');
  for (const word of ['READ', 'AUCTION', 'FIX', 'PITCH', 'CLOSE']) assert.ok(talk.includes(word), `and its coach names the ${word} stage`);
  const events = new Set(ACADEMY.flatMap((m) => [...evs(m)]));
  for (const ev of ['pitch', 'buy', 'inspect', 'haggle', 'repair', 'auction', 'hire', 'cycle', 'draw', 'repay', 'shock', 'sell-pool']) assert.ok(events.has(ev), `the Academy exercises "${ev}"`);
});

test('pacing: the play of a mission, by a rough clock, fits 90-150 seconds with the Why card and teach-back (about 30 s)', () => {
  // A first-time player, playing most stages by hand. Quick is always allowed, so a hurried player is faster. The clock steps assume a fast speed.
  const EV = { pitch: 14, buy: 12, inspect: 18, auction: 22, repair: 22, haggle: 30, hire: 14, draw: 10, repay: 8, shock: 8, 'sell-pool': 12, cycle: 14 };
  const CLICK = { 'deal-quick': 8, 'deal-room': 6, 'deal-stage-pitch': 14, 'deal-stage-close': 22, 'deal-stage-read': 12 };
  const WIN = { pitch: 6, buy: 4, haggle: 20, cycle: 14, repay: 8, 'sell-pool': 12 }; // the work between the last click and the win event
  const act = (w) => (w.type === 'ui' ? 5 : w.type === 'click' ? CLICK[w.anchor] ?? (w.anchor.startsWith('world:') ? 6 : 4) : EV[w.event] ?? 15);
  for (const m of ACADEMY) {
    const play = m.steps.reduce((t, s) => t + 2 + s.say.length / 28 + act(s.wait), 0) + (WIN[m.win.event] ?? 10);
    const total = play + 30;
    assert.ok(total >= 90 && total <= 150, `${m.id}: about ${Math.round(total)} seconds in all (${Math.round(play)} of play); aim for 90..150`);
    assert.ok(Math.abs(m.minutes * 60 - total) <= 30, `${m.id}: minutes (${m.minutes}) should be near the estimate (${Math.round(total)} s)`);
  }
});

const DASH = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']'); // built from char codes so this file holds no dash itself
test('voice: no em dashes, no double spaces, no stray markup, no emoji in prose, and "district", never "zone", in what the player reads', () => {
  for (const m of ACADEMY) for (const [p, s] of strings(m)) {
    assert.ok(!DASH.test(s), `${m.id}${p}: has an em or en dash`);
    assert.ok(!/ {2}|\s$|^\s/.test(s), `${m.id}${p}: stray whitespace`);
    assert.ok(!/<[a-z/][^>]*>|\*\*|`/.test(s), `${m.id}${p}: markup in a plain string`);
    assert.ok(!/\bzones?\b/i.test(s), `${m.id}${p}: say "district", not "zone"`);
    if (!p.endsWith('.icon')) assert.ok(!/\p{Extended_Pictographic}/u.test(s), `${m.id}${p}: emoji in prose`);
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------------
// The numbers behind each lesson, from the real engine. A helper to say "this text must carry these strings".
const has = (where, hay, ...bits) => { for (const b of bits) assert.ok(hay.includes(b), `${where} should say "${b}"`); };
const whyHas = (m, ...bits) => has(`${m.id} why card`, text(m.why), ...bits);
const stepHas = (m, i, ...bits) => has(`${m.id} example step ${i + 1} ("${m.why.example.steps[i]}")`, m.why.example.steps[i], ...bits);
const teachHas = (m, ...bits) => has(`${m.id} teach-back`, text(m.teachBack), ...bits);
const sayHas = (m, id, ...bits) => has(`${m.id}/${id} coach line`, m.steps.find((s) => s.id === id).say, ...bits);
const exampleSteps = (m, n) => assert.equal(m.why.example.steps.length, n, `${m.id}: the facts below cover ${n} example steps`);
// Every dollar figure a player reads in a mission (intro, coach lines, hints, the why card, the teach-back) must be a number the engine gave above.
const DOLLAR = /\$\d+(?:,\d{3})*(?:\.\d+)?/g;
function onlyEngineDollars(m, known) {
  const ok = new Set(known.flatMap((x) => (typeof x === 'string' ? [x] : [ui(x), cents(x), w$(x)])).map((t) => t.replace(/^[-+]/, '')));
  const read = { intro: m.intro, steps: m.steps.map((x) => [x.say, x.hint]), why: m.why, teachBack: m.teachBack };
  for (const [p, str] of strings(read)) for (const t of str.match(DOLLAR) || []) assert.ok(ok.has(t), `${m.id}${p}: "${t}" is not a figure the engine gives for this lesson (known: ${[...ok].join(' ')})`);
}

test('m01: need beats budget by a mile, and the first swap earns the first dollar', () => {
  const m = M('m01'), g = sandbox(m), a = g.s.assets[0], q = (id) => g.quotePitch(a.id, id);
  const wen = q('sim-student'), mech = q('yard-mechanic'), bar = q('cafe-barista');
  const def = ASSETS.paperclip, util = def.sc * def.dem[1] - def.dep;
  assert.ok(near(g.val(a), 0.0504, 1e-6) && ui(g.val(a)) === '$0.05', 'the clip is worth about five cents');
  assert.equal(util, 13); assert.equal(n2(0.5 + util / 100), '0.63');
  assert.ok(near(wen.ci.cm, 0.4 + Math.log(2), 1e-9) && n2(wen.ci.cm) === '1.09', 'with nobody pitching, Cm = 0.40 + ln 2');
  assert.ok(wen.fit === 1 && near(wen.parts.term, 1) && near(wen.price, 4 * 0.6 * wen.ci.cm, 1e-9), 'urgent: budget x (0.55 + 0.45 x fit) x 0.60 x Cm');
  assert.equal(n2(bar.fit), '0.80'); assert.equal(n2(bar.parts.term), '1.16'); assert.equal(n2(mech.fit), '0.60'); assert.equal(n2(mech.parts.term), '0.97');
  // the student pays part in the barter goods her stall holds, and the rest in cash after the engine's 2.5% fee
  assert.equal(wen.goods.cls, 'paperbacks'); assert.ok(near(wen.fee, 0.025, 1e-9));
  assert.ok(wen.change > 1, 'the first swap puts more than a dollar of cash in the wallet');
  assert.equal(ui(wen.price), '$2.62'); assert.equal(ui(bar.price), '$0.04'); assert.equal(ui(mech.price), '$0.03');
  whyHas(m, ui(wen.price), ui(bar.price), ui(mech.price), '$14.00', 'about five cents', '2 × 7 - 1 = 13', '0.63');
  stepHas(m, 0, `$4.00 × 1.00 × 0.60 × ${n2(wen.ci.cm)} = ${ui(wen.price)}`, ui(wen.goods.value), ui(wen.change), '2.5% fee');
  stepHas(m, 1, `$0.05 × ${n2(bar.parts.term)} × 0.60 × ${n2(wen.ci.cm)} = ${ui(bar.price)}`, '0.80');
  stepHas(m, 2, `$0.05 × ${n2(mech.parts.term)} × 0.60 × ${n2(wen.ci.cm)} = ${ui(mech.price)}`, '0.60', '$14.00');
  exampleSteps(m, 3);
  assert.ok(Math.round(wen.price / bar.price / 10) * 10 === 70 && wen.price / mech.price > 70, 'about 70 times');
  whyHas(m, 'about 70 times', `first ${ui(wen.change)}`);
  teachHas(m, ui(wen.price), ui(mech.price));
  // the tempting wrong choice (the biggest wallet) pays a few cents; even the weakest pitch (x0.85) still earns the first dollar
  assert.ok(wen.price * 0.6 * 0.85 / 0.6 >= m.win.match.price.gte, 'even the weakest pitch (x0.85) clears the win');
  assert.ok(wen.price / mech.price >= 50 && wen.price / bar.price >= 50, 'the urgent offer is worth at least fifty times the others');
  assert.ok(m.why.title.includes(ui(wen.price)), 'the card is titled with the first sale');
  onlyEngineDollars(m, [0, g.val(a), wen.price, mech.price, bar.price, wen.goods.value, wen.change, 4, 14, 6]);
});

test('m02: a look is worth more than a discount, because here the price does not warn you', () => {
  const m = M('m02'), g = sandbox(m), lots = m.setup.lots;
  const [first, second, ball] = lots;
  assert.equal(first.cls, second.cls); assert.equal(first.price, second.price, 'the two watches carry one price');
  assert.ok(first.truth.fake && !second.truth.fake && !ball.truth.fake, 'exactly one counterfeit, and it is the first watch');
  const V = working(g, 'pawnWatch', 4), B = working(g, 'signedBall', 4);
  const Pw = ZONES[4].rules.fakes * ASSETS.pawnWatch.fakeRisk, Pb = ZONES[4].rules.fakes * ASSETS.signedBall.fakeRisk;
  assert.equal(Pw, 0.22); assert.equal(Pb, 0.22); assert.equal(FAKE_VALUE, 0.08);
  // the worked example does its arithmetic on the cents the card shows, so a reader who redoes it gets the same cents
  const row = (v, p, price) => { const fv = r2(v * FAKE_VALUE), blind = (1 - p) * v + p * fv - price, checked = (1 - p) * (v - price); assert.ok(near(fv, v * FAKE_VALUE, 0.005)); return { v, fv, blind, checked, worth: checked - blind, risk: p * (price - fv) }; };
  const w = row(V, Pw, first.price), b = row(B, Pb, ball.price);
  assert.ok(near(w.worth, w.risk, 1e-9) && near(b.worth, b.risk, 1e-9), 'value of a check = P(fake) x (price - fake value)');
  // the lots really are listed near their value (the generator lists fakes at full price): between 84% and 97%, the real lot discount
  for (const [l, v] of [[first, V], [second, V], [ball, B]]) assert.ok(l.price / v >= 0.84 && l.price / v <= 0.97, `${l.id} lists at ${n2(l.price / v)} of its value, like a real lot`);
  assert.ok(m.setup.cash >= 1.09 * (first.price + second.price + ball.price), 'a mistake never bricks the sandbox: cash covers every lot, even at the Deal Room\'s usual +9%');
  assert.ok(m.setup.skills.ops >= 2, 'enough Ops for a few probes');
  assert.equal(cents(V), '$314.60'); assert.equal(cents(w.fv), '$25.17'); assert.equal(cents(B), '$147.00'); assert.equal(cents(b.fv), '$11.76');
  whyHas(m, '22% for a watch', 'one lot in five', 'about 8%');
  has('m02 example setup', m.why.example.setup, cents(V), cents(w.fv), `$${first.price}`, cents(B), cents(b.fv), `$${ball.price}`, '22%');
  stepHas(m, 0, `Blind buy at $${first.price}`, `0.78 × ${cents(V)} + 0.22 × ${cents(w.fv)} - $${first.price} = ${cents(w.blind)}`);
  stepHas(m, 1, `0.78 × (${cents(V)} - $${first.price}) = ${plus(cents(w.checked))}`);
  stepHas(m, 2, `${cents(w.checked)} + ${cents(-w.blind)} = ${cents(w.worth)}`, `0.22 × ($${first.price} - ${cents(w.fv)})`);
  stepHas(m, 3, `blind ${cents(b.blind)}`, `checked ${plus(cents(b.checked))}`, cents(b.worth));
  exampleSteps(m, 4);
  whyHas(m, `${cents(w.blind)} bet`, `${plus(cents(w.checked))} deal`, cents(b.worth));
  teachHas(m, 'about $60', '8% of a real watch');
  assert.ok(Math.round(w.worth) === 60, 'the check was worth about $60 on the watch');
  // the tempting wrong choice, buying blind, against the right one, reading first: the same player, the same $297
  const fakeValue = w.fv, genuineValue = V * second.truth.quality;
  const blindFake = fakeValue - first.price, readFirst = genuineValue - second.price;
  assert.ok(readFirst - blindFake >= 250, `reading first beats buying the counterfeit blind by $${Math.round(readFirst - blindFake)}`);
  assert.ok(w.blind < 0 && w.checked > 0 && b.blind < 0 && b.checked > 0, 'a blind buy is a losing bet and a checked one a winning bet, on both lots');
  // one serial probe really does catch the fake, most of the time, and rarely cries wolf: the lesson is winnable with a single point
  let caught = 0, alarms = 0, N = 600;
  for (let seed = 1; seed <= N; seed++) {
    const run = (lot) => { let st = inspect.create(inspectParams(g, 4, g.s.lots[4].find((x) => x.id === lot.id), seed)); st = inspect.act(st, { type: 'probe', id: 'serial' }).state; st = inspect.act(st, { type: 'conclude' }).state; return inspect.result(st); };
    if (run(first).estimate.fakeProb >= 0.6) caught++;
    if (run(second).estimate.fakeProb >= 0.6) alarms++;
  }
  assert.ok(caught / N >= 0.75, `one serial probe catches the fake ${pc(caught / N)} of the time`);
  assert.ok(alarms / N <= 0.06, `and cries wolf on the genuine one ${pc(alarms / N)} of the time`);
  onlyEngineDollars(m, [V, w.fv, first.price, B, b.fv, ball.price, w.blind, w.checked, w.worth, b.blind, b.checked, b.worth, Math.round(w.worth)]);
});

test('m03: fit gets the deal, distance from the crowd sets the price', () => {
  const m = M('m03'), g = sandbox(m), a = g.s.assets[0], q = (id) => g.quotePitch(a.id, id);
  assert.ok(m.setup.perks.includes('grad') && g.P.radar, 'a borrowed Niche Radar');
  assert.equal(m.setup.assets.filter((x) => x.cls === 'enamelPins').length, 2, 'two sets: one for the crowd, one for the quiet buyer');
  const bree = q('thrift-flipper'), priya = q('dorm-ra'), del = q('bookstore-buyer');
  assert.ok(bree.ci.band.id === 'herd' && del.ci.band.id === 'pioneer', 'the crowded buyer sits on the floor and the quiet one on the ceiling');
  assert.equal(bree.ci.cm, 0.4); assert.equal(del.ci.cm, 3.14);
  const cmf = g.cmFor(3, 'enamelPins', 'bree'); assert.ok(near(cmf.cm, bree.ci.cm, 1e-12) && near(cmf.S, bree.ci.S, 1e-12), 'the card shows what cmFor says');
  assert.equal(n2(bree.fit), '1.00'); assert.equal(n2(del.fit), '0.50');
  assert.equal(n2(bree.parts.term), '1.35'); assert.equal(del.parts.term, 0.875);
  const S = [bree, priya, del].map((x) => n2(x.ci.S));
  assert.deepEqual(S, ['0.65', '0.34', '0.01']);
  const fmv = bree.fmv;
  assert.equal(cents(fmv), '$5.30');
  assert.equal(ui(bree.price), '$1.72'); assert.equal(ui(del.price), '$8.74');
  assert.ok(near(5.3 * 1.35 * 0.6 * 0.4, 1.7172, 1e-3) && near(5.3 * 0.875 * 0.6 * 3.14, 8.7374, 1e-3), 'the arithmetic in the text reproduces the prices');
  // selling to Bree first changes the others' numbers a little; the quiet buyer, on the ceiling, does not move
  const sold = g.pitch(a.id, 'thrift-flipper', { mult: 1 });
  assert.equal(ui(sold.price), '$1.72');
  const delAfter = g.quotePitch(g.s.assets[0].id, 'bookstore-buyer');
  assert.equal(ui(delAfter.price), '$8.74');
  const ratio = del.price / bree.price;
  assert.equal(ratio.toFixed(1), '5.1'); assert.equal(Math.round((ratio - 1) * 100), 409); assert.equal((bree.parts.term / del.parts.term).toFixed(1), '1.5');
  assert.ok(ratio > 1.4 / 0.6, `the crowd matters more than the worst a Deal Room multiplier can do (x${ratio.toFixed(2)} against ${(1.4 / 0.6).toFixed(2)})`);
  whyHas(m, 'up to 1.20', '0.85', '1.00', '0.50', '1.5 times', '0.40 + 0.95 × fit', '0.15');
  has('m03 example setup', m.why.example.setup, cents(fmv), 'S = 0.65', 'S = 0.34', 'S = 0.01');
  stepHas(m, 0, '0.40 + 0.95 × 1.00 = 1.35', '0.40 + 0.95 × 0.50 = 0.875');
  stepHas(m, 1, 'S = 0.65', '0.40 floor', `$5.30 × 1.35 × 0.60 × 0.40 = ${ui(bree.price)}`);
  stepHas(m, 2, 'S = 0.01', '3.14 ceiling', `$5.30 × 0.875 × 0.60 × 3.14 = ${ui(del.price)}`);
  exampleSteps(m, 3);
  whyHas(m, '5.1 times', ui(del.price), ui(bree.price), '409%', 'at most 20%');
  // the pitch stage: the best pair of angles lifts the price, the worst cuts it, within the engine's bounds (so persona fit is worth up to +20%)
  const params = pitchParams(g, { cls: 'enamelPins' }, { id: 'thrift-flipper', seg: 'bree' }, 7);
  const mults = pitchGame.legal(pitchGame.create(params)).map((l) => pitchGame.result(pitchGame.act(pitchGame.create(params), l).state).mult);
  assert.ok(Math.max(...mults) <= 1.2 + 1e-9 && Math.min(...mults) >= 0.85 - 1e-9 && Math.max(...mults) > Math.min(...mults), 'angles move the price between x0.85 and x1.20');
  onlyEngineDollars(m, [fmv, bree.price, del.price]);
});

test('m04: the first number is worth money, and an alternative makes walking away real', () => {
  const m = M('m04'), g = sandbox(m), a = g.s.assets[0], q = (id) => g.quotePitch(a.id, id);
  assert.equal(m.zone, 2); assert.ok(ZONES[2].rules.haggle, 'Flea Market Row, where every deal can be haggled');
  assert.equal(m.setup.assets.length, 2, 'two radios'); assert.equal(m.setup.leads.length, 3, 'two buyers to haggle with and a third left over as the alternative');
  assert.ok(m.setup.skills.growth >= 2, 'a fuzzy read of the limit (Growth)');
  const col = q('stall-collector'), dol = q('stall-dolores'), tar = q('stall-tariq');
  assert.deepEqual([BUYERS.collector.style, BUYERS.dolores.style], ['hard', 'friendly']);
  assert.ok(near(col.price, dol.price, 1e-9), 'both buyers fit the radio at 1.00 and the same fair price');
  const fair = rawPrice(col), alt = rawPrice(tar);
  assert.ok(alt >= 0.8 * fair && alt <= 1.3 * fair, `the busker's offer (${n2(alt / fair)} of fair) counts as the alternative the Deal Room offers`);
  assert.equal(ui(fair), '$10.61'); assert.equal(ui(alt), '$8.74');
  // the worked example: one hard buyer with a hidden limit of 1.21 x fair, played twice with the same seed (same buyer, same limit)
  const params = haggleSell(g, { fair, lead: { budget: 40, seg: 'collector' }, zone: 2, alt, seed: 1, reserveMult: 1.21 });
  const cl = haggleRun(params, 'careless'), cf = haggleRun(params, 'careful');
  assert.ok(cl.res.deal && cf.res.deal);
  const limit = fair * 1.21, firstCounter = cl.log[0].theirs, careless = cl.res.price, careful = cf.res.price;
  assert.equal(ui(limit), '$12.84'); assert.equal(ui(firstCounter), '$7.47'); assert.equal(ui(careless), '$7.47'); assert.equal(n2(careless / fair), '0.70');
  assert.equal(cf.log[0].do, 'anchor high'); assert.equal(ui(cf.log[0].yours), '$14.85'); assert.equal(ui(cf.log[0].theirs), '$7.61'); assert.equal(n2(cf.log[0].yours / fair), '1.40');
  const concessions = cf.log.filter((x) => x.do.startsWith('concede')).map((x) => ui(x.yours));
  assert.deepEqual(concessions, ['$13.15', '$12.20', '$11.78']); assert.equal(ui(careful), '$11.78'); assert.equal(n2(careful / fair), '1.11');
  assert.equal(pc((careful - careless) / fair), '41%');
  assert.ok(careless < alt && careful > alt, 'the careless price is below the alternative, so the BATNA says refuse it; the careful one is above');
  has('m04 example setup', m.why.example.setup, ui(fair), ui(limit), ui(alt));
  stepHas(m, 0, `Open at fair (${ui(fair)})`, `They counter ${ui(firstCounter)}`, `you sell at ${ui(careless)}`, `${n2(careless / fair)} × fair`);
  stepHas(m, 1, `Open high (${ui(cf.log[0].yours)}, 1.40 × fair)`, `They counter ${ui(cf.log[0].theirs)}`, concessions.join(', '), `They agree at ${ui(careful)}`, `${n2(careful / fair)} × fair`);
  stepHas(m, 2, `from ${ui(careless)} to ${ui(careful)}`, '41% of fair');
  stepHas(m, 3, `${ui(alt)} is your BATNA`, ui(careless));
  exampleSteps(m, 4);
  whyHas(m, `${ui(careless)} and the careful one at ${ui(careful)}`, `the ${ui(alt)} alternative`);
  has('m04 formula', m.why.formula, '1.40 × fair', '4%, 9% or 16%');
  assert.deepEqual([haggle.ANCHORS.high, haggle.STEPS.small, haggle.STEPS.medium, haggle.STEPS.large], [1.4, 0.04, 0.09, 0.16]);
  assert.equal(m.win.match.mult.gte, 1, 'the win is selling at or above fair');

  // the tempting wrong way against the right one, over many hidden limits and seeds, for both buyers the lesson uses
  const seeds = Array.from({ length: 400 }, (_, i) => i + 1);
  for (const [who, lead, gain, winRate] of [['the collector', 'stall-collector', 0.2, 0.7], ['Dolores', 'stall-dolores', 0.1, 0.65]]) {
    const L = g.s.leads[2].find((l) => l.id === lead), B = BUYERS[L.seg];
    const runs = (how) => seeds.map((seed) => haggleRun({ ...haggleSell(g, { fair, lead: L, zone: 2, alt, seed }), style: B.style, patience: B.patience + 1 }, how).res);
    const cls = runs('careless'), cfs = runs('careful');
    const mc = mean(cls.filter((r) => r.deal).map((r) => r.mult)), mf = mean(cfs.filter((r) => r.deal).map((r) => r.mult));
    assert.ok(cls.every((r) => r.deal && r.mult <= 1 + 1e-9), `${who}: opening at fair never earns more than fair`);
    assert.ok(mf - mc >= gain, `${who}: the careful way averages x${mf.toFixed(2)} of fair against x${mc.toFixed(2)} for the careless way; the gap must be at least ${gain}`);
    assert.ok(cfs.filter((r) => r.deal && r.mult >= 1).length / seeds.length >= winRate, `${who}: the win (at or above fair) is reachable by Assist-advised play on at least ${pc(winRate)} of seeds`);
  }
  // and the Collector really does punish a careless close: in most seeds he counters near x0.7 and takes the first yes, and when he says yes at once
  // (a limit so high that fair is already inside it) the reveal shows how much more he would have paid
  const L = g.s.leads[2].find((l) => l.id === 'stall-collector');
  const runs = seeds.map((seed) => haggleRun({ ...haggleSell(g, { fair, lead: L, zone: 2, alt, seed }), style: 'hard', patience: 5 }, 'careless'));
  const low = runs.filter((r) => r.res.mult < 0.8);
  assert.ok(low.length / seeds.length >= 0.5 && Math.min(...runs.map((r) => r.res.mult)) > 0.6, `a careless close with a hard buyer lands near x0.7 in ${pc(low.length / seeds.length)} of deals`);
  const instant = runs.filter((r) => r.log.length === 1);
  assert.ok(instant.every((r) => r.res.mult === 1 && r.res.reveal.reserve > fair * 1.2), 'a buyer who says yes at once was ready to pay at least 20% more');
  onlyEngineDollars(m, [fair, limit, alt, careless, firstCounter, cf.log[0].yours, cf.log[0].theirs, ...cf.log.filter((x) => x.do.startsWith('concede')).map((x) => x.yours), careful]);
});

test('m05: the same repair is a thin gain at Ops 1 and a windfall at Ops 2, even with a bad dial', () => {
  const m = M('m05');
  assert.equal(m.setup.skills.ops, 2, 'the sandbox runs at Ops 2');
  const at = (ops, deal) => { const g = sandbox(m, withSkills(m, { ops })), a = g.s.assets[0], r = g.repairQuote(a.id, deal), net = r.after - r.before - r.cost; return { g, a, ...r, net, roi: net / r.cost }; };
  const o1 = at(1), o2 = at(2), o3 = at(3), best = at(2, { qualityMult: 1.15, costMult: 0.9 }), worst = at(2, { qualityMult: 0.85, costMult: 1.3 });
  const van = ASSETS.van, g2 = o2.g;
  assert.equal(g2.repairMultFor(7), 0.75 * 0.9, 'Auto Row takes 25% off, and opening it takes 10% more');
  assert.ok(g2.s.zones.includes(6) && g2.s.zones.includes(7), 'two open districts, so the unlock bonus is counted (Game.B is cached by the number of open districts)');
  const w = working(g2, 'van', 7);
  assert.equal(ui(w), '$3,828'); assert.ok(near(o2.before, 0.3 * w, 1e-6) && ui(o2.before) === '$1,148', 'broken is 30% of working');
  assert.ok(near(o1.cost, van.repair * 0.675, 1e-6) && near(o2.cost, van.repair * 0.42 * 0.675, 1e-6));
  assert.deepEqual([o1.quality, o2.quality, o3.quality], [0.5, 0.625, 0.75]);
  assert.equal(at(5).quality, 1, 'quality climbs to 1.00 at Ops 5');
  assert.ok(near(o2.cost / o1.cost, 0.42, 1e-9) && near(o3.cost / o2.cost, 0.42, 1e-9), 'each level of Ops multiplies the cost by 0.42');
  assert.ok(near(o2.after, w * 0.625, 1e-6));
  assert.equal(ui(o1.cost), '$709'); assert.equal(ui(o1.after), '$1,914'); assert.equal(ui(o1.after - o1.before), '$766'); assert.equal(w$(o1.net), '$57'); assert.equal(pc(o1.roi), '8%');
  assert.equal(ui(o2.cost), '$298'); assert.equal(ui(o2.after), '$2,393'); assert.equal(ui(o2.after - o2.before), '$1,244'); assert.equal(ui(o2.net), '$946'); assert.equal(pc(o2.roi), '318%');
  assert.equal(ui(o3.cost), '$125'); assert.equal(ui(o3.after), '$2,871'); assert.equal(ui(o3.net), '$1,598'); assert.equal(whole(o3.roi * 100) + '%', '1,278%');
  assert.equal(ui(worst.net), '$498'); assert.equal(ui(best.net), '$1,335'); assert.ok(worst.net > 0, 'even the worst dial pays at Ops 2');
  assert.ok(m.setup.cash >= worst.cost, 'cash covers the worst dial');
  // what Delgado pays for the van as it stands and repaired (the buyer accepts broken goods, so the comparison is real)
  const lead = o2.g.s.leads[7][0], qb = o2.g.quotePitch(o2.a.id, lead.id);
  assert.ok(!qb.rejected && BUYERS.smelog.like.vehicle >= 0.8, 'Delgado Delivery takes a broken van');
  o2.g.repair(o2.a.id, {});
  const qa = o2.g.quotePitch(o2.a.id, lead.id);
  assert.equal(ui(qb.price), '$1,017'); assert.equal(ui(qa.price), '$2,118');
  assert.ok(!qa.capped && qa.price < lead.budget, 'the buyer can afford the repaired van');
  has('m05 example setup', m.why.example.setup, ui(w), ui(o2.before), '$1,050', '0.675');
  stepHas(m, 0, 'Ops 1', `$1,050 × 0.675 = ${ui(o1.cost)}`, 'Quality 0.50', ui(o1.after), `Gain ${ui(o1.after - o1.before)} minus ${ui(o1.cost)} cost = ${w$(o1.net)}`, `ROI ${pc(o1.roi)}`);
  stepHas(m, 1, 'Ops 2', `$1,050 × 0.42 × 0.675 = ${ui(o2.cost)}`, 'Quality 0.625', `value ${ui(o2.after)}`, `Gain ${ui(o2.after - o2.before)} minus ${ui(o2.cost)} = ${ui(o2.net)}`, `ROI ${pc(o2.roi)}`);
  stepHas(m, 2, 'Ops 3', `cost ${ui(o3.cost)}`, 'quality 0.75', `value ${ui(o3.after)}`, `+${ui(o3.net)}`, `ROI ${whole(o3.roi * 100)}%`);
  stepHas(m, 3, 'quality -15%, cost +30%', `+${ui(worst.net)}`, `+${ui(best.net)}`);
  assert.ok(qa.price > 2 * qb.price, 'more than double');
  stepHas(m, 4, ui(qb.price), ui(qa.price), 'more than double', ui(o2.cost));
  exampleSteps(m, 5);
  whyHas(m, '0.42', '0.50 at Ops 1 to 1.00 at Ops 5', '25% off', '10% more', '0.675', '-10% to +30%', `${w$(o1.net)} scrape into a ${ui(o2.net)} profit`);
  teachHas(m, ui(o1.cost), ui(o1.after - o1.before), w$(o1.net), pc(o2.roi));
  // the tempting wrong choices: always repair (loses the case at Ops 1 against its own risk) and never repair (leaves $946 on the table)
  assert.ok(o1.roi < 0.15 && o2.roi > 2 && o2.net - o1.net >= 800, 'one skill point on Ops turns a thin gain into a windfall');
  assert.ok(o3.cost < o2.cost && o3.net > o2.net && o2.cost < o1.cost, 'Ops makes a repair cheaper and better at every level');
  // the Fix stage: the dial's result stays inside the engine's bounds, and a scripted player completes it
  const g5 = sandbox(m), fx = fixIt(g5, g5.s.assets[0].id);
  assert.ok(fx.ok && fx.quality >= 0.5 && fx.cost > 0, 'the Fix stage repairs the van');
  onlyEngineDollars(m, [van.repair, w, o2.before, o1.cost, o1.after, o1.after - o1.before, o1.net, o2.cost, o2.after, o2.after - o2.before, o2.net, o3.cost, o3.after, o3.net, worst.net, best.net, qb.price, qa.price]);
});

test('m06: the fee and the fuel both come out of the wallet, and a starved manager earns what idle cash earns', () => {
  const m = M('m06'), g = sandbox(m), cash = m.setup.cash;
  const lane = { cls: 'laptops', buyer: 'trainer' };
  const fc = (kind, g0 = g) => { const p = { kind, zone: 5, level: 1, ...lane, channel: 'dom', alloc: 0, cycles: 0 }; p.alloc = g0.pipeCap(p); return { p, ...g0.forecast(p), hire: g0.pipeCost(kind, 5) }; };
  const stu = fc('student'), bro = fc('broker');
  assert.equal(cash, 620); assert.ok(m.zone >= 5 && m.setup.features.includes('crew') && m.setup.clock === 'paused');
  assert.deepEqual([stu.hire, stu.cap, bro.hire, bro.cap], [120, 450, 600, 1000]);
  assert.equal(cash - bro.hire, 20); assert.ok(cash - bro.hire < bro.cap, 'the Broker leaves too little to work with: starved');
  assert.ok(cash - stu.hire >= stu.cap && cash - stu.hire === 500, 'the Student leaves enough to feed his full allocation');
  assert.equal(stu.len, 41); assert.equal(bro.len, 32);
  assert.equal(cents(stu.gross), '$16.43'); assert.equal(cents(stu.fee), '$10.96'); assert.equal(cents(stu.tax), '$0.82'); assert.equal(cents(stu.roy), '$0.49'); assert.equal(cents(stu.overhead), '$2.78'); assert.equal(cents(stu.net), '$1.37'); assert.equal(cents(stu.perDay), '$0.80');
  assert.equal(cents(bro.net), '$8.28'); assert.equal(cents(bro.perDay), '$6.21');
  assert.ok(near(stu.gross - stu.fee - stu.tax - stu.roy - stu.overhead, stu.net, 1e-9), 'net = gross - fee - tax - royalty - overhead');
  assert.ok(stu.ci.S < 0.05 && stu.ci.cm > 2.5, 'the laptop lane to Brightpath is the quiet one');
  // most lanes lose money after fees, which is why the coach names the lane and the card says "read the forecast first"
  const lanes = [];
  for (const cls of Object.keys(ASSETS)) for (const buyer of Object.keys(BUYERS)) if (g.validLane(5, cls, buyer).ok) lanes.push(g.forecast({ kind: 'student', zone: 5, level: 1, cls, buyer, channel: 'dom', alloc: 450, cycles: 0 }).net);
  assert.ok(lanes.filter((x) => x <= 0).length / lanes.length >= 0.7 && Math.max(...lanes) === stu.net, `a thin lane can lose money: ${lanes.filter((x) => x <= 0).length} of ${lanes.length} lanes do not pay the Student, and the coach's lane is the best`);
  has('m06 example setup', m.why.example.setup, '$620', '$120', '$450', '$600', '$1,000', 'level 2');
  stepHas(m, 0, `$620 - $600 = ${w$(cash - bro.hire)}`, '$1,000', 'Starved');
  stepHas(m, 1, `$620 - $120 = ${w$(cash - stu.hire)}`, `$${stu.cap}`, `${stu.len} hours`);
  const fees = stu.fee + stu.tax + stu.roy + stu.overhead;
  assert.ok(near(r2(stu.gross) - r2(fees), r2(stu.net), 0.005), 'the displayed gross, the fees and the net add up to the cent');
  stepHas(m, 2, `gross ${ui(stu.gross)}`, `less ${ui(fees)} of fee, tax, royalty and overhead`, `the fee alone is ${ui(stu.fee)}`, `leaves ${ui(stu.net)}`, `${ui(stu.perDay)} a day`);
  stepHas(m, 3, ui(bro.net), `${bro.len} hours`, `${ui(bro.perDay)} a day`, '$0 a day');
  exampleSteps(m, 4);
  whyHas(m, `${ui(stu.perDay)} a day`);
  sayHas(m, 'hire', '$450'); sayHas(m, 'cash', '$620');
  teachHas(m, ui(bro.net), ui(stu.net));
  // played: the fed Student runs cycles, the starved Broker never starts one and earns exactly what idle cash earns
  const run = (kind) => { const g2 = sandbox(m); assert.ok(g2.hirePipeline(kind, 5, lane).ok); g2.advanceTo(100); return { p: g2.s.pipes[0], cash: g2.s.cash }; };
  const fed = run('student'), starved = run('broker');
  assert.ok(fed.p.cycles >= 2 && !fed.p.starved && fed.p.profit > 0, 'the fed Student finishes cycles and earns');
  assert.equal(starved.p.cycles, 0); assert.ok(starved.p.starved && starved.p.profit === 0 && starved.cash === 20, 'the starved Broker never starts a cycle');
  // and the fix the hint offers works: lower the allocation and the Broker runs
  const g3 = sandbox(m); g3.hirePipeline('broker', 5, lane); assert.ok(g3.configure(g3.s.pipes[0].id, { alloc: 20 }).ok); g3.advanceTo(60);
  assert.ok(g3.s.pipes[0].cycles >= 1, 'lowering the allocation unstarves a manager');
  onlyEngineDollars(m, [cash, 0, stu.cap, stu.hire, bro.hire, bro.cap, cash - bro.hire, cash - stu.hire, stu.gross, fees, stu.fee, stu.net, stu.perDay, bro.net, bro.perDay]);
});

test('m07: the same fall leaves one loan at D/E 1.4 and the other much nearer a margin call, whatever the Deal Room does to the price', () => {
  const m = M('m07'), E = m.setup.cash, price = m.setup.lots[0].price;
  const g0 = sandbox(m), f0 = working(g0, 'sneakers', 5);
  assert.ok(m.setup.lots.length === 4 && m.setup.lots.every((l) => l.price === price && l.cls === 'sneakers'));
  assert.ok(E >= price && E < 2 * price, 'cash buys one lot, not two');
  assert.equal(ui(f0), '$369'); assert.ok(price / f0 < 0.7 && price / f0 > 0.6, 'lots are priced about a third under their value');
  assert.equal(g0.loanRoom('micro').room, 1200, 'the bank caps a draw at D/E 3.0 of the equity you have, so the maximum is $1,200');
  const go = (L, n, mult = 1) => {
    const g = sandbox(m); assert.ok(g.draw('micro', L).ok);
    for (let i = 0; i < n; i++) assert.ok(g.buyLot(5, m.setup.lots[i].id, { mult }).ok, `lot ${i + 1} is affordable`);
    const r = { fee: L * 0.03, cash: g.s.cash, nw0: g.netWorth(), de0: g.deRatio(), debt: g.debt(), hold0: g.invValue() };
    let call = false; g.onEvent = (e) => { if (e.type === 'margin-call') call = true; };
    g.advanceTo(7);
    return { ...r, nw1: g.netWorth(), de1: g.deRatio(), hold1: g.invValue(), call, g };
  };
  const small = go(600, 2), big = go(1200, 4);
  const glut = small.hold1 / small.hold0 - 1;
  assert.ok(near(glut, -0.25, 0.005), `the glut cuts sneaker values by ${pc(-glut)}`);
  assert.equal(ui(small.nw0), '$619'); assert.equal(n2(small.de0), '0.97'); assert.equal(ui(small.nw1), '$435'); assert.equal(n2(small.de1), '1.38');
  assert.equal(ui(big.nw0), '$838'); assert.equal(n2(big.de0), '1.43'); assert.equal(ui(big.nw1), '$469'); assert.equal(n2(big.de1), '2.56');
  // how far would prices have to fall to trip the call? (hold at the call = debt / 4.5 - cash + debt)
  const fall = (r) => { const holdCall = r.debt / DEBT.callDE - r.cash + r.debt; return { total: 1 - holdCall / r.hold0, beyond: 1 - holdCall / r.hold1 }; };
  const fs = fall(small), fb = fall(big);
  assert.equal(pc(fb.total), '39%'); assert.equal(pc(fb.beyond), '18%'); assert.equal(pc(fs.total), '66%');
  // check the threshold on the engine itself: a total fall a hair under it survives, a hair over it trips the call
  const trips = (r0, total) => { const g = r0.g, f = (r0.hold0 * (1 - total)) / r0.hold1; for (const a of g.s.assets) a.wear *= f; g._m = null; g.evq.length = 0; g._marginCall(); return g.evq.some((e) => e.type === 'margin-call'); };
  assert.ok(!trips(go(1200, 4), fb.total - 0.01) && trips(go(1200, 4), fb.total + 0.01), 'the 39% line is where the engine really calls the loan');
  // the Deal Room's Quick buys at par or up to 9% over: even then, neither scenario trips the call at the glut (the lesson cannot dead-end in a forced sale)
  for (const mult of [1, 1.09]) for (const [L, n] of [[600, 2], [1200, 4]]) { const r = go(L, n, mult); assert.ok(!r.call && r.de1 < DEBT.callDE - 0.8 && r.cash > 0, `loan ${L}, lots at x${mult}: D/E ${n2(r.de1)} after the glut, no forced sale, cash left to repay`); }
  // the interest is the smaller worry
  assert.equal(n2(g0.loanRate('micro')), '0.12'); assert.equal(n2(600 * g0.loanRate('micro') / 30), '2.40');
  has('m07 example setup', m.why.example.setup, '$400', `$${price}`, ui(f0), '25%');
  stepHas(m, 0, 'Borrow $600, buy 2 lots', `net worth ${ui(small.nw0)}, D/E ${n2(small.de0)}`, `net worth ${ui(small.nw1)}, D/E ${n2(small.de1)}`);
  stepHas(m, 1, 'maximum $1,200, buy 4 lots', `net worth ${ui(big.nw0)}, D/E ${n2(big.de0)}`, `net worth ${ui(big.nw1)}, D/E ${n2(big.de1)}`);
  stepHas(m, 2, `fall ${pc(fb.total)}`, `${pc(fb.beyond)} beyond the glut`, `${pc(fs.total)} fall`);
  exampleSteps(m, 3);
  whyHas(m, '4.5', '35%', '12% per 30 days', '$2.40 a day on $600', 'near D/E 1');
  teachHas(m, n2(big.de1), n2(small.de1), pc(fb.beyond), '35%');
  sayHas(m, 'draw', `$${price}`, ui(f0)); sayHas(m, 'bank', '$400', '3.0', '4.5');
  // the right choice against the tempting one: the bigger loan earned a little more this time, with a fraction of the room for a worse day
  assert.ok(big.nw1 > small.nw1 && fs.beyond / fb.beyond >= 2.5, `the big loan had ${pc(fb.beyond)} of room beyond the glut, the small one ${pc(fs.beyond)}`);
  onlyEngineDollars(m, [E, price, f0, 600 * g0.loanRate('micro') / 30, 600, 1200, small.nw0, small.nw1, big.nw0, big.nw1]);
});

test('m08: the same sneakers sell for $125 in the herd and $660 in the open', () => {
  const m = M('m08'), g = sandbox(m), a = g.s.assets[0];
  assert.ok(m.setup.perks.includes('grad') && g.P.radar && m.setup.cohort.ghosts >= 20);
  assert.equal(m.setup.assets.filter((x) => x.cls === 'sneakers').length, 2);
  assert.deepEqual(m.setup.leads.map((l) => l.seg).sort(), ['boutique', 'popup']);
  const herd = g.quotePitch(a.id, 'trend-boutique'), open0 = g.quotePitch(a.id, 'popup-stall');
  assert.equal(herd.fit, 1); assert.equal(open0.fit, 1); assert.equal(herd.parts.term, 1.35, 'both buyers fit the sneakers at 1.00');
  const base = herd.fmv * 1.35 * 0.6;
  assert.equal(ui(herd.fmv), '$364'); assert.equal(ui(base), '$295');
  assert.equal(n2(herd.ci.S), '0.57'); assert.equal(n2(herd.ci.cm), '0.42'); assert.ok(herd.ci.cm >= 0.4 && herd.ci.cm < 0.55, 'the herd is on the floor, in the herd-trap band');
  assert.equal(herd.ci.band.id, 'herd');
  const cmf = g.cmFor(5, 'sneakers', 'popup'); assert.ok(near(cmf.cm, open0.ci.cm, 1e-12) && cmf.vN < 1.5 && cmf.vT > 10, 'the stall is a quiet niche in a real herd (cmFor)');
  assert.equal(ui(herd.price), '$125'); assert.equal(pc(herd.price / base), '42%');
  g.pitch(a.id, 'trend-boutique', { mult: 1 });
  const open = g.quotePitch(g.s.assets[0].id, 'popup-stall');
  assert.equal(n2(open.ci.S), '0.07'); assert.equal(n2(open.ci.cm), '2.24'); assert.equal(ui(open.price), '$660'); assert.equal((open.price / base).toFixed(1), '2.2');
  assert.equal(ui(open.price - herd.price), '$535'); assert.equal((open.price / herd.price).toFixed(1), '5.3');
  for (const l of m.setup.leads) assert.ok(open.price < l.budget && herd.price < l.budget, `${l.id}: the budget never caps the lesson`);
  assert.ok(open.ci.cm > 2 && open.price / herd.price > 1.4 / 0.6, `the open niche beats the herd by x${(open.price / herd.price).toFixed(2)}, more than the worst a Deal Room multiplier can hide (x${(1.4 / 0.6).toFixed(2)})`);
  assert.ok(m.win.match.S.lt === 0.5 && open.ci.S < 0.5, 'win is a pitch into a niche that is not crowded');
  has('m08 example setup', m.why.example.setup, `${ui(herd.fmv)} × 1.35 × 0.60 = ${ui(base)}`, 'at par');
  stepHas(m, 0, 'S = 0.57', 'Cm = 0.42', '0.40 floor', ui(herd.price), '42%');
  stepHas(m, 1, 'S = 0.07', 'Cm = 2.24', ui(open.price), '2.2 times');
  stepHas(m, 2, '1.00', ui(open.price - herd.price), '5.3 times');
  exampleSteps(m, 3);
  whyHas(m, ui(herd.price), ui(open.price), '0.40', '3.14');
  // the radar's whole point: the same sandbox without the herd has no contrast, so the lesson's contrast is the cohort's doing
  const calm = sandbox(m, { cohort: { ghosts: 0 } }), c1 = calm.quotePitch(calm.s.assets[0].id, 'trend-boutique'), c2 = calm.quotePitch(calm.s.assets[0].id, 'popup-stall');
  assert.ok(near(c1.ci.cm, c2.ci.cm, 1e-9), 'with no herd both buyers pay the same');
  onlyEngineDollars(m, [herd.fmv, base, herd.price, open.price, open.price - herd.price]);
});

test('m09: concentration is what the shock punishes, and the warning arrives 12 hours ahead', () => {
  const m = M('m09'), g = sandbox(m);
  const gadgets = m.setup.assets.filter((a) => a.cls === 'gadgets').length;
  assert.equal(gadgets, 3); assert.equal(m.setup.assets.length, 3, 'everything the player owns is one trend');
  assert.ok(ASSETS.gadgets.tags.includes('trend') && !ASSETS.textbooks.tags.includes('trend'), 'gadgets are the trend, textbooks are not');
  const lot = m.setup.lots[0];
  assert.deepEqual([lot.cls, lot.cond], ['textbooks', 'ok']); assert.ok(m.setup.cash >= 1.09 * lot.price, 'the player can afford the hedge, even at the Deal Room\'s usual +9%');
  const ev = m.setup.events[0];
  assert.equal(ev.kind, 'tiktok'); assert.ok(ev.atHour >= 12 && ev.atHour <= 48, 'a warning comes before the shock');
  assert.equal(g.warnLead(), 12, 'the ticker warns 12 hours ahead at Capital Sourcing 1');
  assert.ok(EVENTS.tiktok.alert.vars.some((v) => /every district/.test(v)), 'the craze really does hit every district, so travelling would not save the pallets');
  assert.ok(m.setup.features.includes('travel') && m.setup.zones.length >= 2, 'the map shows somewhere else');
  const ids = g.s.assets.map((a) => a.id), gadgetsValue = () => g.s.assets.filter((a) => a.cls === 'gadgets').reduce((t, a) => t + g.val(a), 0);
  const tb = working(g, 'textbooks', 5), today = gadgetsValue();
  let shocked = false; g.onEvent = (e) => { if (e.type === 'shock') shocked = true; };
  g.advanceTo(23); assert.ok(!shocked && Math.abs(gadgetsValue() - today) < 1e-9);
  g.advanceTo(24); assert.ok(shocked, 'the craze lands at hour 24');
  const peak = gadgetsValue(), pool = g.poolQuote(ids);
  g.advanceTo(73);
  const fatigue = gadgetsValue(), fall = 1 - fatigue / today;
  assert.equal(ui(today), '$2,189'); assert.equal(ui(today / 3), '$730'); assert.equal(ui(tb), '$427'); assert.equal(ui(peak / 3), '$1,870'); assert.equal(ui(fatigue / 3), '$348'); assert.equal(pc(fall), '52%');
  assert.equal(ui(today - fatigue), '$1,146'); assert.equal(pc(today / (today + tb)), '84%'); assert.equal(ui(today + tb), '$2,615'); assert.equal(pc((today / (today + tb)) * fall), '44%');
  assert.equal(ui(pool.total), '$4,818'); assert.equal((pool.fric * 100).toFixed(1), '14.1'); assert.equal(ui(fatigue), '$1,043'); assert.equal(ui(pool.total - fatigue), '$3,775');
  assert.ok(pool.delay === 0 && pool.total <= pool.room, 'the pool pays at once and has room for all three');
  has('m09 example setup', m.why.example.setup, ui(today), ui(today / 3), ui(tb), ui(peak / 3), ui(fatigue / 3), pc(fall));
  stepHas(m, 0, `100% × ${pc(fall)} = ${pc(fall)} of what you own`, `${ui(today - fatigue)} of ${ui(today)}`);
  stepHas(m, 1, `${pc(today / (today + tb))} of ${ui(today + tb)}`, `${pc(today / (today + tb))} × ${pc(fall)} = ${pc((today / (today + tb)) * fall)}`);
  stepHas(m, 2, ui(pool.total), '14.1% haircut');
  stepHas(m, 3, ui(fatigue), ui(pool.total - fatigue));
  exampleSteps(m, 4);
  whyHas(m, 'five times', 'halves trend prices for 72', '12 hours ahead', 'about 14%');
  has('m09 result', m.why.example.result, `lose ${pc((today / (today + tb)) * fall)}`, ui(pool.total), '12 hours');
  // the right choice against the tempting one: act on the warning and you bank thousands; hold and you hold a halved asset
  const hold = sandbox(m), sell = sandbox(m);
  hold.advanceTo(100);
  sell.advanceTo(24); assert.ok(sell.sellPool(sell.s.assets.filter((a) => a.cls === 'gadgets').map((a) => a.id)).ok); sell.advanceTo(100);
  assert.ok(sell.netWorth() - hold.netWorth() >= 3000, `selling into the spike leaves net worth $${Math.round(sell.netWorth() - hold.netWorth())} above holding`);
  assert.ok(hold.invValue() < 0.5 * today, 'holding rides it up and all the way back down, to under half of today');
  onlyEngineDollars(m, [today, today / 3, tb, peak / 3, fatigue / 3, today - fatigue, today + tb, pool.total, fatigue, pool.total - fatigue]);
});

test('m10: every skill, then the score', () => {
  const m = M('m10'), g = sandbox(m), lot = m.setup.lots[0];
  assert.equal(m.setup.lots.length, 2, 'two lots, so losing one auction does not end the lesson');
  for (const l of m.setup.lots) assert.ok(l.auction === true && l.mode === 'auction' && l.cond === 'broken' && l.cls === lot.cls && l.price === lot.price && l.truth && l.truth.fake === false && l.truth.quality === lot.truth.quality, 'twin broken auction lots with a hidden truth');
  assert.ok(g.s.lots[6].every((l) => l.mode === 'auction'), 'the sandbox makes them auctions');
  assert.ok(ZONES[6].rules.auction, 'Estate Sales run auctions');
  assert.ok(m.setup.cash >= 1.4 * lot.price, 'room to bid, up to the guide price plus 40%');
  assert.ok(Object.values(m.setup.skills).every((v) => v >= 2), 'a mid-level toolkit');
  assert.equal(m.setup.leads.length, 1);
  const asIs = g.val({ cls: 'antiqueFurniture', cond: 'broken', quality: 1, wear: 1, zone: 6 });
  assert.ok(lot.price < asIs && lot.price / asIs > 0.9, 'the guide price sits just under the as-is value');
  // what the lot is worth to the player once repaired (Ops 2) and sold to the dealer, after Estate Sales tax and the engine's fee
  const g2 = sandbox(m); assert.ok(g2.buyLot(6, lot.id, { mult: 1 }).ok);
  const a = g2.s.assets[0], rq = g2.repairQuote(a.id); g2.repair(a.id, {});
  const sale = g2.quotePitch(a.id, 'antique-dealer'), ceiling = sale.received - rq.cost;
  assert.ok(!sale.capped && !sale.rejected && sale.fit === 1);
  assert.equal(ui(sale.price), '$846'); assert.equal(ui(sale.received), '$776'); assert.equal(ui(rq.cost), '$160'); assert.equal(ui(ceiling), '$616');
  assert.ok(lot.price < ceiling, 'the opening price is under the all-in value, so the chain pays');
  has('m10 example setup', m.why.example.setup, ui(sale.price), ui(sale.received), ui(rq.cost), '$20,000', '$0.05', '$1,000');
  stepHas(m, 0, `${ui(sale.received)} from the sale - ${ui(rq.cost)} repair = ${ui(ceiling)}`);
  sayHas(m, 'auction', ui(ceiling));
  teachHas(m, ui(ceiling));
  // the score: the real EEI function, with the real floor
  const ana = eeiCalc(20000, 0.05, 30, EEI_FLOOR_DEFAULT), ben = eeiCalc(20000, 0.05, 0, EEI_FLOOR_DEFAULT), need = 20000 * (1 + 30 / TOTAL_DAYS);
  assert.ok(near(ana, 26.67, 0.005) && near(ben, 20, 1e-9));
  assert.equal(n2(1 + 30 / TOTAL_DAYS), '1.33'); assert.equal(ui(need), '$26,667');
  assert.equal(eeiCalc(20000, 0.05, 0, EEI_FLOOR_DEFAULT), eeiCalc(20000, 1000, 0, EEI_FLOOR_DEFAULT), 'a $0.05 start is floored to $1,000');
  assert.ok(near(eeiCalc(need, 0.05, 0, EEI_FLOOR_DEFAULT), ana, 1e-6), 'Ben would need $26,667 to match Ana');
  stepHas(m, 1, '$20,000 / $1,000 = 20', 'Time bonus 1 + 30/90 = 1.33', `EEI = ${n2(ana)}`);
  stepHas(m, 2, '20 × (1 + 0/90)', n2(ben));
  stepHas(m, 3, ui(need));
  exampleSteps(m, 4);
  whyHas(m, `${n2(ana)} against ${n2(ben)}`, '$1,000');
  assert.equal(m.reward.points, 1);
  assert.ok(sale.price < m.setup.leads[0].budget, 'the dealer\'s budget never caps the sale');
  const rival = [620, 640, 700]; // the teach-back's rival bids: each is above the ceiling, which is the whole point
  assert.ok(rival.every((x) => x > ceiling), 'the rival bids in the teach-back are all above the ceiling');
  onlyEngineDollars(m, [ceiling, EEI_FLOOR_DEFAULT, 0.05, 20000, sale.price, sale.received, rq.cost, need, ...rival]);
});

test('the Academy lines up with the content: each district\'s own rule, and the buyer a mission needs to pay really fits what it sells', () => {
  const NEED = { m02: 'fakes', m03: 'season', m04: 'haggle', m05: 'repair', m06: 'managers', m07: 'bank', m10: 'auction' };
  for (const m of ACADEMY) {
    const z = ZONES[m.zone], where = `${m.id} (${z.name})`;
    if (NEED[m.id]) assert.ok(z.rules?.[NEED[m.id]], `${where}: the district's rules should include "${NEED[m.id]}"`);
    const classes = [...new Set([...m.setup.assets.map((a) => a.cls), ...m.setup.lots.map((l) => l.cls)])];
    const seg = m.win.match?.seg;
    if (seg) for (const cls of classes) assert.ok(fitOfClass(cls, seg) >= 0.5, `${where}: the buyer the mission needs to pay (${seg}) fits "${cls}" at ${fitOfClass(cls, seg).toFixed(2)}, below 0.5`);
    for (const e of m.setup.events || []) if (e.cls) assert.ok(demandOf(ASSETS[e.cls], m.zone) >= 4, `${where}: the ${e.kind} should hit a class that trades here`);
  }
  // a lesson that needs the herd must be where the herd is on day 1: the ghosts start in the first districts and walk outward
  for (const id of ['m03', 'm06', 'm08']) { const g = sandbox(M(id)); assert.ok(g.env.cohort.counts(0, M(id).zone, M(id).setup.assets[0]?.cls || 'laptops').total >= 5, `${id}: the cohort has a real herd at hour 0`); }
  // the way the sandbox builds a Game caches Game.B by the number of open districts: a lesson that needs a district's unlock bonus lists two
  assert.ok(M('m05').setup.zones.length >= 2 && ZONES[7].bonus.repairMult === 0.9);
});
test('the people and goods the coach names are the ones on the cards', () => {
  const NAMES = { // [a name used in a mission's text, the card it comes from]
    m01: [['Wen', BUYERS.student.name]],
    m02: [['wristwatch', ASSETS.pawnWatch.name], ['baseball', ASSETS.signedBall.name]],
    m03: [['Bree', BUYERS.bree.name], ['Delphine', BUYERS.bookstore.name], ['Priya', BUYERS.priya.name], ['enamel pin', ASSETS.enamelPins.name]],
    m04: [['Abernathy', BUYERS.collector.name], ['Dolores', BUYERS.dolores.name], ['busker', BUYERS.tariq.name]],
    m05: [['Delgado Delivery', BUYERS.smelog.name]],
    m06: [['Brightpath Corporate Training', BUYERS.trainer.name], ['Off-Lease Laptop Pallet', ASSETS.laptops.name], ['Student', PIPE.student.name], ['Broker', PIPE.broker.name]],
    m08: [['Loft 9', BUYERS.boutique.name]],
  };
  for (const [id, pairs] of Object.entries(NAMES)) {
    const m = M(id), all = text({ intro: m.intro, steps: m.steps, why: m.why, teachBack: m.teachBack }).toLowerCase();
    for (const [used, card] of pairs) { assert.ok(all.includes(used.toLowerCase()), `${id}: the text should mention "${used}"`); assert.ok(card.toLowerCase().includes(used.toLowerCase()), `${id}: "${used}" is not part of the card name "${card}"`); }
  }
});
const fitOfClass = (cls, seg) => { const l = BUYERS[seg].like, ls = ASSETS[cls].tags.map((t) => l[t] || 0).filter((x) => x > 0).sort((a, b) => b - a); return ls.length ? Math.min(1, ls[0] + 0.15 * (ls.length - 1)) : 0; };

// ---------------------------------------------------------------------------------------------------------------------------------------
// Every mission is won by scripted engine play alone: the steps' actions, in order, through the engine's own API, with the Deal Room's games played by
// the same parameters the screen gives them.
const PLAYS = {
  m01: { win: (c) => c.g.pitch(idOf(c.g, 'paperclip'), 'sim-student', { mult: 1 }) },
  m02: {
    'first-watch': (c) => readLot(c.g, 4, 'first-watch', ['serial']),
    'second-watch': (c) => readLot(c.g, 4, 'second-watch', ['serial', 'power']),
    win: (c) => assert.ok(c.g.buyLot(4, 'second-watch', { mult: 1 }).ok),
  },
  m03: {
    'pitch-crowd': (c) => { const lead = c.g.s.leads[3].find((l) => l.id === 'thrift-flipper'), a = c.g.s.assets[0]; c.g.pitch(a.id, lead.id, { mult: bestPitch(c.g, a, lead).mult }); },
    win: (c) => { const lead = c.g.s.leads[3].find((l) => l.id === 'bookstore-buyer'), a = c.g.s.assets[0]; c.g.pitch(a.id, lead.id, { mult: bestPitch(c.g, a, lead).mult }); },
  },
  m04: {
    'haggle-fair': (c) => { const d = sellDeal(c.g, c.g.s.assets[0].id, 'stall-collector', 'careless'); assert.ok(d.out.ok); },
    win: (c) => { const d = sellDeal(c.g, c.g.s.assets[0].id, 'stall-dolores', 'careful'); c.careful = d; },
  },
  m05: {
    repair: (c) => { const r = fixIt(c.g, idOf(c.g, 'van')); assert.ok(r.ok); },
    win: (c) => assert.ok(c.g.pitch(idOf(c.g, 'van'), 'fleet-buyer', { mult: 1 }).ok),
  },
  m06: {
    hire: (c) => assert.ok(c.g.hirePipeline('student', 5, { cls: 'laptops', buyer: 'trainer' }).ok),
    win: (c) => { for (let i = 0; i < 80 && !c.won; i++) c.g.stepHour(); },
  },
  m07: {
    draw: (c) => assert.ok(c.g.draw('micro', 600).ok),
    buy: (c) => { assert.ok(c.g.buyLot(5, 'bargain-a', { mult: 1 }).ok); assert.ok(c.g.buyLot(5, 'bargain-b', { mult: 1 }).ok); },
    shock: (c) => { c.g.advanceTo(7); assert.ok(c.g.deRatio() < 2, 'the small loan is nowhere near the call'); },
    win: (c) => assert.ok(c.g.repay(c.g.s.loans[0].id, 100).ok),
  },
  m08: {
    'quick-herd': (c) => assert.ok(c.g.pitch(c.g.s.assets[0].id, 'trend-boutique', { mult: 1 }).ok),
    win: (c) => { const r = c.g.pitch(c.g.s.assets[0].id, 'popup-stall', { mult: 1 }); assert.ok(r.ok && r.ci.S < 0.5); },
  },
  m09: {
    hedge: (c) => assert.ok(c.g.buyLot(5, 'textbook-pallet', { mult: 1 }).ok),
    shock: (c) => c.g.advanceTo(24),
    win: (c) => assert.ok(c.g.sellPool(c.g.s.assets.filter((a) => a.cls === 'gadgets').map((a) => a.id)).ok),
  },
  m10: {
    read: (c) => { c.read = readLot(c.g, 6, 'estate-lot-a', ['serial', 'power']); }, // the screen keeps the Read result for the Bid stage
    auction: (c) => { // bid up to the ceiling; a lot lost to a rival is gone, and the twin is still on the shelf
      for (const id of ['estate-lot-a', 'estate-lot-b']) {
        const res = bidUpTo(c.g, 6, id, 616, id === 'estate-lot-a' ? c.read : readLot(c.g, 6, id, ['serial', 'power']));
        c.g.recordPlay('auction', res);
        if (res.won) { assert.ok(c.g.buyLot(6, id, { mult: res.price / 475 }).ok); c.paid = res.price; return; }
        c.g.passLot(6, id, 'You dropped out of the auction.');
      }
      assert.fail('both auctions were lost');
    },
    fix: (c) => assert.ok(fixIt(c.g, idOf(c.g, 'antiqueFurniture')).ok),
    win: (c) => { const d = sellDeal(c.g, idOf(c.g, 'antiqueFurniture'), 'antique-dealer', 'careful'); assert.ok(d.out?.ok, 'the dealer buys'); c.d = d; },
  },
};

for (const m of ACADEMY) {
  test(`${m.id} ${m.title}: scripted engine play completes every step and wins`, () => {
    const c = playMission(m, PLAYS[m.id]);
    assert.ok(c.g.netWorth() > 0 && !c.g.s.insolvent, 'the sandbox is still solvent');
    assert.ok(!c.seen.some((e) => e.type === 'margin-call' || e.type === 'insolvent'), 'no forced sale along the way');
  });
}

test('m04 and m10 are winnable on the screen\'s own seeds, and on almost any seed', () => {
  // exact: the haggle the screen will deal for Dolores after a careless first sale (diagnostic only: the screen's glue is a sibling branch)
  const m = M('m04'), c = playMission(m, PLAYS.m04);
  assert.ok(c.careful.res.deal && c.careful.res.mult >= 1, `Dolores' deal on the screen's seed closes at x${c.careful.res.mult?.toFixed(2)}`);
  assert.ok(c.careful.alt > 0, 'and the busker is still a real alternative in the second deal, so Leverage is on the table');
  // statistical: careful play wins (at or above fair) on most hidden limits and seeds, for the buyer the lesson sends the player to
  const g = sandbox(m), a = g.s.assets[0], fair = rawPrice(g.quotePitch(a.id, 'stall-collector')), alt = rawPrice(g.quotePitch(a.id, 'stall-tariq'));
  let won = 0, N = 500;
  const L = g.s.leads[2].find((l) => l.id === 'stall-dolores');
  for (let seed = 1; seed <= N; seed++) {
    const p = { ...haggleSell(g, { fair, lead: L, zone: 2, alt, seed }), style: 'friendly', patience: BUYERS.dolores.patience + 1 };
    // a player who misses with one approach replays the same deal with another (nothing is lost until a deal is struck): Assist's advice, the expert, or
    // opening at fair and simply holding until they say yes, which closes at exactly fair
    let s = haggle.create(p); s = haggle.act(s, { type: 'anchor', level: 'fair' }).state; for (let i = 0; i < 12 && !s.done; i++) { const r = haggle.act(s, { type: 'hold' }); if (r.say === null) break; s = r.state; }
    const tries = [haggleRun(p, 'careful').res, haggle.autoplay(p, 1), haggle.result(s)];
    if (tries.some((r) => r.deal && r.mult >= 1)) won++;
  }
  assert.ok(won / N >= 0.75, `a player can win Haggle 101 on ${pc(won / N)} of seeds (the rest have a buyer whose limit is too near fair)`);
  // m10: the ceiling bidder wins the auction on almost every seed, and pays well under its ceiling
  const t = M('m10'), g10 = sandbox(t), [lotA, lotB] = g10.s.lots[6];
  let wins = 0, either = 0, paid = [];
  for (let seed = 1; seed <= 400; seed++) {
    const a = auctionGame.result(runAuction(g10, lotA, seed, 616)), b = auctionGame.result(runAuction(g10, lotB, seed + 100003, 616)); // each lot has a seed of its own
    if (a.won) { wins++; paid.push(a.price); }
    if (a.won || b.won) either++;
  }
  assert.ok(wins / 400 >= 0.9, `the ceiling bidder wins ${pc(wins / 400)} of auctions for one lot`);
  assert.ok(either / 400 >= 0.99, `and one of the two lots ${pc(either / 400)} of the time`);
  assert.ok(Math.max(...paid) <= 616 + 1e-9 && mean(paid) < 616, `and never pays above the $616 ceiling (mean $${Math.round(mean(paid))})`);
});
function runAuction(g, lot, seed, ceiling) {
  let s = auctionGame.create(auctionParams(g, 6, lot, null, seed));
  for (let i = 0; i < 400 && !s.done; i++) { const v = auctionGame.view(s); const r = auctionGame.act(s, { type: v.yourTurn && v.nextBid <= ceiling + 1e-9 ? 'bid' : 'drop' }); if (r.say === null) break; s = r.state; }
  return s;
}
