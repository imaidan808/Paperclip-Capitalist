// The Academy (js/meta/academy.js): shape, limits, reachability, and the numbers behind every lesson, all read from the REAL game.
// Run: node --test tests/meta-academy.test.mjs
//
// How this file keeps a lesson true:
//  1. `sandbox(m)` builds a mission's scripted Game with the Academy's own builder (js/ui/academy-sandbox.js `makeSandboxSession`: the mission's Backgrounds,
//     skills, cash, assets, leads, lots with hidden truth, scripted events and the cohort's ghosts, seeded 'academy-<id>'; spawns off). Nothing is mirrored.
//  2. Every Deal Room game is played through the REAL glue (js/deal.js `startRun`/`DealRun`): the same parameters, seeds and order of events the screen has.
//     In particular the engine hears about a deal only when it is over (`finish`: Pass, See the result or Quick), so steps and wins are checked against
//     that order (inspect, haggle, auction, then buy or pitch), never against the moment a stage is concluded.
//  3. Each mission's test (`m01`..`m10`) recomputes every number its lesson quotes with the real engine calls (quotePitch, repairQuote, forecast, draw,
//     deRatio, poolQuote, eei and the Deal Room games) at an average Deal Room result (a multiplier of exactly 1.00), formats them the way the screen rounds,
//     and requires the text to contain exactly those strings; `onlyEngineDollars` then fails on any dollar figure the text carries that the engine did not give.
//  4. `PLAYS` wins every mission by scripted play alone, feeding the steps the same events the screen would, `ROUTES` plays the other ways a player can finish
//     a deal (Quick, by hand, Pass) and `STRANDED` shows the few mistakes no data can undo, with `stillPossible`, the check a runner needs to offer a restart.
//  5. A step never waits for a tap that opens a Deal Room. The screen offers three routes into one (a world sprite, a Market card's "Sell ... to ...", a Stock
//     row's "Repair"), the runner hears a click on the first and on the HUD only, and a wait that one route cannot satisfy stalls the lesson while the deal is
//     played anyway (the audited blockers of m01, m03, m04, m05 and m08). So a click wait is on the HUD, a deal is waited for by what the finished deal sends
//     (the "other ways" test below plays the Market card's way, Stock's Repair button, Quick and by hand), a wait on `haggle` is only used where the Close
//     stage is really played, and a step after a deal never waits for a click inside the Deal Room (the Continue press on the result screen would satisfy it
//     at once). The browser half of this was walked in the real app (headless Chrome, 1440x900) for m01, m03, m04, m05, m06, m08, m09 and m10.
// If the economy, the content or a lesson drifts, a test here names the number that moved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMY } from '../js/meta/academy.js';
import { CODEX } from '../js/meta/codex.js';
import { REQUIRED_CODEX, DOCK_IDS, EVENT_TYPES, EVENT_PAYLOAD, BACKGROUND_IDS } from '../js/meta/ids.js';
import { matchEvent } from '../js/meta/match.js';
import { ZONE_COUNT, TAGS } from '../js/data/schema.js';
import { ASSETS, BUYERS, ZONES, PERKS, SKILLS, EVENTS, ALGO_EVENTS, EEI_FLOOR_DEFAULT, DEBT, TOTAL_DAYS, SEC_PER_HOUR, FEES } from '../js/config.js';
import { Game } from '../js/engine.js';
import { demandOf, eei as eeiCalc, FAKE_VALUE, fitOf, fitMult } from '../js/market.js';
import * as D from '../js/deal.js';
import * as haggle from '../js/play/haggle.js';
import * as inspect from '../js/play/inspect.js';
import * as pitchGame from '../js/play/pitch.js';

// The session's kv reads localStorage; the Academy's sandbox builds a Session around its Game. Give it a memory one.
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const A = await import('../js/ui/academy-sandbox.js');

const M = (id) => ACADEMY.find((m) => m.id === id);
const isStr = (x) => typeof x === 'string' && x.trim().length > 0;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isInt = (x) => Number.isInteger(x);
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
const n2 = (x) => x.toFixed(2);
const pc = (x) => `${Math.round(x * 100 + 1e-9)}%`;

// ---------------------------------------------------------------------------------------------------------------------------------------
// The sandbox: a mission's `setup` made into a Game by the Academy's own builder, wrapped in its Session (which wires the cohort and the lesson's clock).
/** `over` replaces fields of the mission's setup (a lesson sometimes asks "what if Ops were 1?"). */
function lessonSession(m, over = {}) { return A.makeSandboxSession({ ...m.setup, ...over }, { id: m.id, zone: m.zone }); }
function sandbox(m, over = {}) {
  const g = lessonSession(m, over).game;
  assert.deepEqual(g.sandbox.warnings, [], `${m.id}: the sandbox skipped something the lesson names`);
  return g;
}
const withSkills = (m, skills) => ({ skills: { ...m.setup.skills, ...skills } });
const idOf = (g, cls) => g.s.assets.find((a) => a.cls === cls).id;
const working = (g, cls, zone) => g.val({ cls, cond: 'ok', quality: 1, wear: 1, zone });
const effective = (g) => ({ ops: g.lvl('ops'), growth: g.lvl('growth'), fintech: g.lvl('fintech') });
const rawPrice = D.rawPrice;

// ---------------------------------------------------------------------------------------------------------------------------------------
// The Deal Room, played through its real glue. A run is opened the way a tap opens it; the helpers press what a player presses.
const buyRun = (g, zone, lotId, opts) => D.startRun(g, { kind: 'buy', zone, lotId }, opts);
const sellRun = (g, assetId, leadId, opts) => D.startRun(g, { kind: 'sell', assetId, leadId }, opts);
const fixRun = (g, assetId, opts) => D.startRun(g, { kind: 'repair', assetId }, opts);
/** Read stage by hand: probes, then Done reading. */
function readBy(run, probes) { for (const id of probes) assert.ok(run.act({ type: 'probe', id }).ok, `probe ${id}`); assert.ok(run.act({ type: 'conclude' }).ok); return run.res.read; }
/** Every pair of angles in the Pitch stage, with the keenness each gives. */
const anglePairs = (run) => { const p = run.paramsFor('pitch'); return pitchGame.legal(pitchGame.create(p)).map((l) => ({ angles: l.angles, mult: pitchGame.result(pitchGame.act(pitchGame.create(p), l).state).mult })); };
const bestPair = (run) => anglePairs(run).reduce((a, b) => (b.mult > a.mult ? b : a));
const worstPair = (run) => anglePairs(run).reduce((a, b) => (b.mult < a.mult ? b : a));
/** Close stage by hand. careless: open at fair, take the first answer. patient: open at fair, then hold. careful: do what the Assist coach advises at every move. */
function closeBy(run, how) {
  if (how === 'careless') { run.act({ type: 'anchor', level: 'fair' }); if (!run.stageDone()) run.act({ type: 'accept' }); return; }
  if (how === 'patient') { run.act({ type: 'anchor', level: 'fair' }); for (let i = 0; i < 12 && !run.stageDone(); i++) if (!run.act({ type: 'hold' }).ok) break; return; }
  run.setAssist(true);
  for (let i = 0; i < 40 && !run.stageDone(); i++) { const a = run.view()?.advice?.action; if (!a || !run.act(a).ok) break; }
}
/** A whole sale: Pitch (quick | best | worst | an explicit pair), then Close (quick | careless | patient | careful), then See the result. */
function sellDeal(g, assetId, leadId, { pitch = 'quick', close = 'quick' } = {}) {
  const run = sellRun(g, assetId, leadId);
  if (pitch === 'quick') run.quick(); else run.act({ type: 'pick', angles: Array.isArray(pitch) ? pitch : (pitch === 'worst' ? worstPair(run) : bestPair(run)).angles });
  if (run.next()) { if (close === 'quick') run.quick(); else closeBy(run, close); }
  return { run, summary: run.finish() };
}
/** A whole purchase of a fixed-price lot: Quick all the way (Read and Close), See the result. */
const quickBuy = (g, zone, lotId) => { const run = buyRun(g, zone, lotId); run.quickAll(); return { run, summary: run.finish() }; };
/** Bid stage: raise while the next price is within the ceiling, else drop out. */
function bidUpTo(run, ceiling) { for (let i = 0; i < 400 && !run.stageDone(); i++) { const v = run.view(); if (!run.act({ type: v.yourTurn && v.nextBid <= ceiling + 1e-9 ? 'bid' : 'drop' }).ok) break; } }
/** An auction lot, Read then Bid then See the result. */
function auctionDeal(g, zone, lotId, { probes = ['serial', 'papers'], ceiling = 616 } = {}) {
  const run = buyRun(g, zone, lotId); readBy(run, probes); run.next(); bidUpTo(run, ceiling);
  return { run, summary: run.finish() };
}
/** Fix stage at its safe setting, then the engine repairs. */
function fixDeal(g, assetId) { const run = fixRun(g, assetId); run.act({ type: 'careful' }); return { run, summary: run.finish() }; }

// ---------------------------------------------------------------------------------------------------------------------------------------
// The runner: a mission's steps fed with the events the screen would send (js/ui/academy-sandbox.js feedRun: one event advances at most one step, and
// the win counts once every step is done; the event that finishes the last step may itself be the win's predecessor, never the win).
function lesson(m, over) {
  const g = sandbox(m, over), c = { m, g, i: 0, won: false, seen: [] };
  c.feed = (e) => {
    c.seen.push(e);
    const r = A.feedRun(m, { i: c.i, n: m.steps.length, won: c.won }, e);
    c.i = r.run.i; c.won = r.run.won;
  };
  g.onEvent = c.feed;
  return c;
}
const click = (c, anchor) => c.feed({ type: 'click', anchor });
function playMission(m, script) {
  const c = lesson(m);
  m.steps.forEach((s, idx) => {
    assert.equal(c.i, idx, `${m.id}: should be on step ${idx + 1} (${s.id})`);
    if (s.wait.type === 'ui') c.feed({ type: 'ui', ui: 'open-drawer', id: s.wait.id });
    else if (s.wait.type === 'click') click(c, s.wait.anchor);
    script[s.id]?.(c);
    assert.equal(c.i, idx + 1, `${m.id}/${s.id}: the scripted player did not complete the step "${s.wait.event || s.wait.type}"`);
    if (idx < m.steps.length - 1) assert.equal(c.won, false, `${m.id}/${s.id}: the win fired before the last step was done`);
  });
  if (!c.won) script.win(c);
  assert.equal(c.won, true, `${m.id}: the scripted player did not win (saw ${c.seen.map((e) => e.type).join(', ')})`);
  return c;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
test('the economy the lessons are written against: pitch price rule, Quick par, EEI floor, the Deal Room glue', () => {
  // quotePitch must stay reference x fit term x 0.60 x Cm x Growth x Background x deal, with pitchK 1 (D.rawPrice rebuilds it)
  const g = sandbox(M('m01')), a = g.s.assets[0], q = g.quotePitch(a.id, 'cafe-barista');
  assert.ok(near(q.price, rawPrice(q), 1e-9), 'pitchK must be 1, or every worked example moves');
  assert.equal(q.parts.base, 0.6);
  assert.equal(EEI_FLOOR_DEFAULT, 1000);
  assert.equal(DEBT.maxDE, 3.0); assert.equal(DEBT.callDE, 4.5); assert.equal(DEBT.fireSale, 0.35);
  assert.equal(FEES.base, 0.025); assert.equal(FEES.exitBrokerage, 0.12);
  // a Deal Room multiplier is clamped by the engine to 0.6..1.4, which bounds how far noise can hide a lesson
  const lo = g.quotePitch(a.id, 'cafe-barista', { mult: 0.01 }), hi = g.quotePitch(a.id, 'cafe-barista', { mult: 99 });
  assert.ok(near(lo.deal, 0.6, 1e-12) && near(hi.deal, 1.4, 1e-12));
  // the glue the lessons are checked against: Quick is the stage played at average skill, and the engine hears a deal only when it is over
  assert.equal(D.QUICK, 0.5); assert.equal(D.TUNE.guide, 0.8); assert.equal(D.TUNE.rival, 0.85);
  const events = [], g2 = sandbox(M('m02')); g2.onEvent = (e) => events.push(e.type);
  const run = buyRun(g2, 4, 'second-watch'); readBy(run, ['serial']); run.next(); run.quick();
  assert.deepEqual(events, [], 'nothing reaches the engine while the stages are played');
  run.finish();
  assert.deepEqual(events.filter((t) => ['inspect', 'haggle', 'buy'].includes(t)), ['inspect', 'haggle', 'buy'], 'a finished purchase sends inspect, then haggle, then buy');
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
    const g = sandbox(m);
    assert.equal(g.s.leads[m.zone].length, s.leads.length, `${w}: every lead reaches the sandbox`);
    assert.equal(g.s.lots[m.zone].length, s.lots.length, `${w}: every lot reaches the sandbox`);
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

test('skills never go down from one mission to the next, Background bonuses included (the Quests drawer shows them from mission 5)', () => {
  let prev = { ops: 0, growth: 0, fintech: 0 };
  for (const m of ACADEMY) {
    const e = effective(sandbox(m));
    for (const k of Object.keys(SKILLS)) assert.ok(e[k] >= prev[k], `${m.id}: ${k} is ${e[k]} here after ${prev[k]} in the mission before (a Background's bonus counts: grad is -1 Ops, +1 Fintech)`);
    prev = e;
  }
  assert.deepEqual(effective(sandbox(M('m10'))), { ops: 2, growth: 2, fintech: 2 }, 'Deal Day: the toolkit the lessons have been building');
});

test('a clock mission opens every district its wealth already qualifies for, so the ticker never announces them and nothing buries the lesson\'s own headline', () => {
  for (const id of ['m06', 'm07', 'm09']) {
    const m = M(id), g = sandbox(m), got = [];
    assert.equal(m.setup.clock, 'paused');
    g.onEvent = (e) => { if (e.type === 'zone' || e.type === 'milestone') got.push(e.type + ':' + (e.id ?? e.n)); };
    g.advanceTo(80);
    assert.deepEqual(got, [], `${id}: the engine opened ${got.join(', ')} while the lesson ran; list those districts in setup.zones`);
    const open = new Set(m.setup.zones);
    for (const [k, z] of Object.entries(ZONES)) if (+k <= m.zone && z.gate <= 1000 && m.zone >= 5) assert.ok(open.has(+k), `${id}: district ${k} (${z.name}, gate $${z.gate}) is within reach of a Metro Hub founder and should be open already`);
  }
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

test('steps: 3 to 9 per mission, each with a coach line, a real anchor, a wait and a hint', () => {
  for (const m of ACADEMY) {
    assert.ok(Array.isArray(m.steps) && m.steps.length >= 3 && m.steps.length <= 9, `${m.id}: 3-9 steps (has ${m.steps?.length})`);
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
        // a Deal Room is on screen for such a step if an earlier step opened one, or if this very step tells the player to tap what opens it (the coach card floats
        // above the dock until the room is there and is carried into it after: js/ui/academy.js hostFor)
        if (s.anchor.startsWith('deal-')) assert.ok(dealSeen || /\btap\b/i.test(s.say), `${w}: "${s.anchor}" needs a Deal Room opened by an earlier step, or a coach line that says to tap what opens it`);
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
        // The runner hears a click on the HUD and on a world sprite, but not on the Market card's Sell button, a lot's Look it over or a Stock row's Repair, and the coach
        // points players at those. A click on anything in the Deal Room is heard, but the first one after a finished deal is its Continue button. So a click wait is on the HUD.
        assert.equal(wt.anchor, s.anchor, `${w}: a click wait is on the step's own anchor`);
        assert.ok(wt.anchor.startsWith('hud-'), `${w}: a click wait on "${wt.anchor}" is not a thing every route to it feeds; wait for the event the finished deal sends`);
      } else assert.fail(`${w}: wait type "${wt.type}"`);
      if (pa || s.anchor.startsWith('deal-')) assert.equal(wt.type, 'event', `${w}: a step that points into the world or the Deal Room waits for what the finished deal sends, whichever way the player got there`);
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

test('a step that waits for a sale or a purchase waits for the haggle, and the Close stage is really played there (the buyer is not capped by a thin budget)', () => {
  // js/deal.js planSell: when the fair price is within 12% of the buyer's whole budget there is nothing to haggle over, the Close is "auto" and the engine never hears a haggle,
  // so a step that waits for one would never end. None of the sales a lesson sets up is like that; this holds each of them to it, with the crates the lesson can offer
  // (the starting ones, a broken one once repaired, a lot once won).
  const played = (run) => run.plan.stages.some((x) => x.key === 'close' && !x.auto);
  let checked = 0;
  for (const m of ACADEMY) {
    const steps = m.steps.filter((x) => x.wait.type === 'event' && x.wait.event === 'haggle');
    if (!steps.length) continue;
    const g = sandbox(m);
    const won = g.s.lots[m.zone].find((l) => l.mode === 'auction'); if (won) assert.ok(g.buyLot(m.zone, won.id, { mult: 0.9 }).ok); // the lot a player has won
    for (const a of g.s.assets) if (a.cond === 'broken') assert.ok(g.repair(a.id, {}).ok);
    for (const st of steps) {
      if (st.wait.match.role === 'buy') { for (const l of g.s.lots[m.zone].filter((x) => x.mode !== 'auction')) { assert.ok(played(buyRun(g, m.zone, l.id)), `${m.id}/${st.id}: the Close of ${l.id} is not played`); checked++; } continue; }
      for (const a of g.s.assets) for (const l of g.s.leads[m.zone]) {
        const q = g.quotePitch(a.id, l.id, undefined, { blind: true }); if (!q.ok || q.rejected || q.fit < 0.15) continue;
        const run = sellRun(g, a.id, l.id); assert.ok(played(run), `${m.id}/${st.id}: selling ${a.cls} to ${l.id} has no Close to haggle in (capped ${run.plan.capped}), so the step would never hear its haggle`); checked++;
      }
    }
  }
  assert.ok(checked >= 20, `${checked} sales checked`);
  // the order the engine sends them in is what the steps lean on: a sale is haggle then pitch, a purchase is inspect, haggle (or auction), buy
  { const m = M('m03'), g = sandbox(m), got = []; g.onEvent = (e) => { if (['haggle', 'pitch', 'inspect', 'buy', 'auction'].includes(e.type)) got.push(e.type); }; sellDeal(g, g.s.assets[0].id, 'bookstore-buyer'); assert.deepEqual(got, ['haggle', 'pitch']); }
  { const m = M('m02'), g = sandbox(m), got = []; g.onEvent = (e) => { if (['haggle', 'pitch', 'inspect', 'buy', 'auction'].includes(e.type)) got.push(e.type); }; const r = buyRun(g, 4, 'second-watch'); readBy(r, ['serial']); r.next(); r.quick(); r.finish(); assert.deepEqual(got, ['inspect', 'haggle', 'buy']); }
  // and in every mission the last deal's step is the first event of its finish, so the win is a LATER event: the step's event is never the win's
  for (const m of ACADEMY) { const last = m.steps.at(-1); if (last.wait.type === 'event') assert.notEqual(last.wait.event, m.win.event, `${m.id}: the last step and the win are the same event`); }
});

test('every coach line names the control it points at', () => {
  const NAME = { 'hud-cash': 'cash', 'hud-clock': 'clock', 'hud-networth': 'net worth', ticker: 'ticker', 'deal-quick': 'quick', 'deal-stage-read': 'read', 'deal-stage-pitch': 'pitch', 'deal-stage-close': 'close' };
  for (const m of ACADEMY) for (const s of m.steps) {
    const want = s.anchor.startsWith('dock-') ? s.anchor.slice(5) : NAME[s.anchor] || (s.anchor.startsWith('world:plot') ? 'plot' : null);
    if (want) assert.ok(s.say.toLowerCase().includes(want), `${m.id}/${s.id}: the coach line should name "${want}", the control it points at`);
  }
});

test('coach and hints use the names on the screen: Done reading, Bid, Drop out, Mention your other option, Borrow, Pass on this lot', async () => {
  // the labels are read from the Deal Room's and the drawers' sources, so a rename there fails here
  const { readFile } = await import('node:fs/promises'), { fileURLToPath } = await import('node:url');
  const read = (p) => readFile(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  const deal = await read('../js/ui/deal.js'), bank = await read('../js/ui/drawers/bank.js'), stock = await read('../js/ui/drawers/stock.js'), crew = await read('../js/ui/drawers/crew.js'), hud = await read('../js/ui/hud.js');
  for (const label of ['Done reading', 'Pass on this lot', 'Open the bidding', 'Drop out', 'Mention your other option', 'See the result', 'Continue', 'Quick deal']) assert.ok(deal.includes(label), `the Deal Room no longer says "${label}"`);
  assert.ok(deal.includes('>Bid<') || deal.includes("'Bid'"), 'the Deal Room no longer says "Bid"');
  assert.ok(bank.includes('Borrow'), 'the Bank no longer says "Borrow"');
  assert.ok(stock.includes('Sell to the pool') && stock.includes('Tick crates'), 'Stock no longer says "Sell to the pool" and "Tick crates"');
  for (const label of ['Hire a manager', 'Use what I can afford', 'Capital per cycle']) assert.ok(crew.includes(label), `the Crew drawer no longer says "${label}"`);
  assert.ok(stock.includes('>Repair ${e(def.name)}<') || stock.includes('Repair ${'), 'Stock no longer has a Repair button on a broken crate'); assert.ok(hud.includes('data-anchor="hud-networth"'), 'the HUD no longer anchors the net worth');
  for (const m of ACADEMY) {
    const talk = text(m.steps); // what the coach and the hints tell a player to press
    for (const bad of ['Conclude', 'Leverage', 'press Draw', 'Raise', 'Drop and', 'Drop when']) assert.ok(!talk.includes(bad), `${m.id}: "${bad}" is not a control on the screen`);
  }
  assert.ok(text(M('m02').steps).includes('Done reading') && text(M('m02').steps).includes('Pass on this lot'));
  assert.ok(text(M('m04').steps).includes('Mention your other option'));
  assert.ok(text(M('m06').steps).includes('Hire a manager') && text(M('m06').steps).includes('Capital per cycle') && text(M('m06').steps).includes('Use what I can afford'));
  assert.ok(text(M('m05').steps.find((x) => x.id === 'repair')).includes('Repair'));
  assert.ok(text(M('m07').steps).includes('Borrow'));
  assert.ok(text(M('m10').steps).includes('Drop out') && text(M('m10').steps).includes('Bid'));
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

test('worked examples say how they were read: an average Deal Room result, never a bare "at par"', () => {
  for (const m of ACADEMY) {
    const t = text(m);
    assert.ok(!/\bat par\b/i.test(t), `${m.id}: "at par" is finance jargon with another meaning; say what is assumed`);
    const s = m.why.example.setup;
    if (['m01', 'm03', 'm05', 'm07', 'm08'].includes(m.id)) assert.ok(/average Deal Room result/.test(s), `${m.id}: the example setup should say its numbers assume an average Deal Room result`);
  }
  assert.ok(!/Why a five-cent clip sold/.test(text(M('m01').why.title)), 'the price is a Quick result, which may land a little either side, so the title says "fetched", not "sold for"');
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

test('teach-back: no test-taking tells (absolutes in an option) and every question applies the idea to a new case instead of restating the card', () => {
  const ABSOLUTE = /\b(always|never|only|simply|any|mostly|pure|purely|ignore|everything|nothing)\b/i;
  for (const m of ACADEMY) {
    for (const o of m.teachBack.options) assert.ok(!ABSOLUTE.test(o.text), `${m.id}: the option "${o.text}" carries an absolute word; wrong answers should be hedged misconceptions, not strawmen`);
    // the right answer must not be the one option with figures in it (it was in m02, m05, m06, m07, m09 and m10, and a student could pass by spotting the numbers): the case's own
    // figures are in the question, the options are reasons, and the proof (the arithmetic) is in the reason that follows the pick
    const figured = m.teachBack.options.filter((o) => /[$%×=]|\d[\d,.]*\d/.test(o.text)); // a figure is an amount, a percentage, a product or a number of two digits ("Job 2" is a name)
    assert.ok(figured.length === 0 || figured.length === 3, `${m.id}: ${figured.length} of 3 options carry a figure; either every option has one or none does (${figured.map((o) => o.text).join(' | ')})`);
    // a fresh case: no run of 40 characters of the question may be a run of the card (the body, the formula, the worked example)
    const card = text({ body: m.why.body, formula: m.why.formula, example: m.why.example }), q = m.teachBack.q;
    for (let i = 0; i + 40 <= q.length; i += 8) assert.ok(!card.includes(q.slice(i, i + 40)), `${m.id}: the question restates the card ("${q.slice(i, i + 40)}")`);
  }
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
  // a coach line may not promise a "first" skill point after an earlier mission has paid one (m05 did: "your first point when this mission ends", after m02 and m03)
  ACADEMY.forEach((m, i) => { if (/\bfirst (skill )?point/i.test(text(m.steps))) assert.ok(!ACADEMY.slice(0, i).some((x) => x.reward.points), `${m.id} promises a first skill point, but an earlier mission already paid one`); });
  // the Codex pages the coach and the cards point at by name must exist under that name
  const titles = new Set(CODEX.map((e) => e.title));
  assert.ok(titles.has('Urgency Premium') && M('m02').steps[0].say.includes('Urgency Premium'), 'mission 2 sends the player to a real Codex page');
});

test('every skill is met by mission 10, and mission 10 uses them all', () => {
  const evs = (m) => new Set([...m.steps.filter((s) => s.wait.type === 'event').map((s) => s.wait.event), m.win.event]);
  const anchors = (m) => new Set(m.steps.map((s) => s.anchor));
  assert.ok(evs(M('m02')).has('inspect'), 'Inspect in mission 2');
  assert.ok(anchors(M('m03')).has('deal-stage-pitch') && evs(M('m03')).has('pitch'), 'Pitch in mission 3');
  assert.ok(M('m04').steps.every((st) => st.id === 'market' || /\bClose\b/.test(st.say)) && !!M('m04').steps.find((st) => st.id === 'careful').say.match(/anchor HIGH/), 'the Close stage in mission 4');
  assert.ok(evs(M('m04')).has('haggle'), 'Haggle in mission 4');
  assert.ok(evs(M('m05')).has('repair'), 'Repair in mission 5');
  assert.ok(evs(M('m06')).has('hire') && evs(M('m06')).has('cycle'), 'Managers in mission 6');
  assert.ok(evs(M('m07')).has('draw') && evs(M('m07')).has('repay'), 'The Bank in mission 7');
  const ten = M('m10'), e = evs(ten);
  for (const ev of ['inspect', 'auction', 'repair', 'pitch']) assert.ok(e.has(ev), `Deal Day uses ${ev}`);
  const talk = ten.steps.map((s) => s.say).join(' ');
  for (const word of ['READ', 'AUCTION', 'FIX', 'PITCH', 'CLOSE']) assert.ok(talk.includes(word), `and its coach names the ${word} stage`);
  const events = new Set(ACADEMY.flatMap((m) => [...evs(m)]));
  for (const ev of ['pitch', 'buy', 'inspect', 'haggle', 'repair', 'auction', 'hire', 'cycle', 'draw', 'repay', 'shock', 'sell-pool']) assert.ok(events.has(ev), `the Academy exercises "${ev}"`);
});

test('pacing: the play of a mission, by a rough clock, fits 90-150 seconds with the Why card and teach-back (about 30 s)', () => {
  // A first-time player, playing most stages by hand. Quick is always allowed, so a hurried player is faster. The clock steps assume a fast speed.
  const EV = { pitch: 14, buy: 12, inspect: 18, auction: 22, repair: 22, haggle: 8, hire: 14, draw: 10, repay: 8, shock: 8, 'sell-pool': 12, cycle: 14 };
  const CLICK = { 'hud-cash': 4, 'hud-clock': 4, 'hud-networth': 6 };
  const WIN = { pitch: 6, buy: 4, haggle: 20, cycle: 14, repay: 8, 'sell-pool': 12 }; // the work between the last click and the win event
  // a deal done by hand costs more than its event says (the Close of mission 4 is the lesson; mission 2 buys by hand), and a step that opens its own Deal Room
  // is also the tap on the card (6 s) that used to be a step of its own
  const HAND = { 'm02/buy': 16, 'm04/careless': 16, 'm04/careful': 16 };
  const act = (m, st) => { const w = st.wait; return (HAND[`${m.id}/${st.id}`] || 0) + (w.type === 'ui' ? 5 : w.type === 'click' ? CLICK[w.anchor] ?? 4 : EV[w.event] ?? 15) + (['pitch', 'haggle'].includes(w.event) && st.anchor.startsWith('deal-') && /\btap\b/i.test(st.say) ? 6 : 0); };
  for (const m of ACADEMY) {
    const play = m.steps.reduce((t, st) => t + 2 + st.say.length / 28 + act(m, st), 0) + (WIN[m.win.event] ?? 10);
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

test('terms are glossed where the player first meets them: the three skills, a lane, a made-up buyer', () => {
  const first = (re) => ACADEMY.findIndex((m) => re.test(text({ intro: m.intro, steps: m.steps, why: m.why })));
  assert.equal(first(/Operational Engineering/), 1, 'Ops is spelled out in mission 2, where it first matters');
  assert.equal(first(/Customer Acquisition Velocity/), 3, 'Growth is spelled out in mission 4, where it first matters');
  assert.equal(first(/Capital Sourcing/), 5, 'Fintech is spelled out in mission 6, where it first matters');
  assert.ok(M('m06').steps.find((s) => s.id === 'hire').say.includes('a lane is the goods and buyer'), 'a lane is explained where the player first hires on one');
  assert.ok(/made-up/.test(M('m04').why.example.setup) && /other people/.test(M('m04').why.example.setup), 'mission 4 says its example buyer is made up');
});

// ---------------------------------------------------------------------------------------------------------------------------------------
// The numbers behind each lesson, from the real engine. A helper to say "this text must carry these strings".
const has = (where, hay, ...bits) => { for (const b of bits) assert.ok(hay.includes(b), `${where} should say "${b}"`); };
const whyHas = (m, ...bits) => has(`${m.id} why card`, text(m.why), ...bits);
const stepHas = (m, i, ...bits) => has(`${m.id} example step ${i + 1} ("${m.why.example.steps[i]}")`, m.why.example.steps[i], ...bits);
const teachHas = (m, ...bits) => has(`${m.id} teach-back`, text(m.teachBack), ...bits);
const sayHas = (m, id, ...bits) => has(`${m.id}/${id} coach line`, m.steps.find((s) => s.id === id).say, ...bits);
const exampleSteps = (m, n) => assert.equal(m.why.example.steps.length, n, `${m.id}: the facts below cover ${n} example steps`);
// Every dollar figure a player reads in a mission (intro, coach lines, hints, the why card, the teach-back) must be a number the engine gave above
// (or a figure of a made-up case the test names itself as a string).
const DOLLAR = /\$\d+(?:,\d{3})*(?:\.\d+)?/g;
function onlyEngineDollars(m, known) {
  const ok = new Set(known.flatMap((x) => (typeof x === 'string' ? [x] : [ui(x), cents(x), w$(x)])).map((t) => t.replace(/^[-+]/, '')));
  const read = { intro: m.intro, steps: m.steps.map((x) => [x.say, x.hint]), why: m.why, teachBack: m.teachBack };
  for (const [p, str] of strings(read)) for (const t of str.match(DOLLAR) || []) assert.ok(ok.has(t), `${m.id}${p}: "${t}" is not a figure the engine gives for this lesson (known: ${[...ok].join(' ')})`);
}

test('m01: need beats budget by a mile, and the first swap earns the first dollar', () => {
  const m = M('m01'), g = sandbox(m), a = g.s.assets[0], q = (id) => g.quotePitch(a.id, id);
  const wen = q('sim-student'), mech = q('yard-mechanic'), bar = q('cafe-barista');
  assert.ok(near(g.val(a), 0.0504, 1e-6) && ui(g.val(a)) === '$0.05', 'the clip is worth about five cents');
  assert.ok(near(wen.ci.cm, 0.4 + Math.log(2), 1e-9) && n2(wen.ci.cm) === '1.09', 'with nobody pitching, the market factor (Cm) = 0.40 + ln 2');
  assert.ok(wen.fit === 1 && near(wen.parts.term, 1) && near(wen.price, 4 * 0.6 * wen.ci.cm, 1e-9), 'urgent: budget x (0.55 + 0.45 x fit) x 0.60 x Cm');
  assert.equal(n2(bar.fit), '0.80'); assert.equal(n2(bar.parts.term), '1.16'); assert.equal(n2(mech.fit), '0.60'); assert.equal(n2(mech.parts.term), '0.97');
  // the student pays part in the barter goods her stall holds, and the rest in cash after the engine's 2.5% fee
  assert.equal(wen.goods.cls, 'paperbacks'); assert.ok(near(wen.fee, 0.025, 1e-9));
  assert.ok(wen.change > 1, 'the first swap puts more than a dollar of cash in the wallet');
  assert.equal(ui(wen.price), '$2.62'); assert.equal(ui(bar.price), '$0.04'); assert.equal(ui(mech.price), '$0.03');
  // one idea at a time: urgency and fit. The utility score and its price index belong to the Codex page this mission unlocks
  assert.ok(!/Utility Score|price index|2 × 7|0\.63|\bniche\b/.test(text({ b: m.why.body, f: m.why.formula, e: m.why.example })), 'the first card does not carry the utility-score arithmetic or the word niche');
  whyHas(m, ui(wen.price), ui(bar.price), ui(mech.price), '$14.00', 'about five cents', 'urgency premium', 'budget becomes the starting price', 'only a ceiling', 'market factor');
  has('m01 example setup', m.why.example.setup, '$4.00', '1.09', 'ordinary', 'mission 8 explains it'); assert.ok(/Mission 8 shows how far/.test(text(M('m03').why)), 'and mission 3 points forward to the same mission');
  stepHas(m, 0, `$4.00 × 1.00 × 0.60 × ${n2(wen.ci.cm)} = ${ui(wen.price)}`, ui(wen.goods.value), ui(wen.change), '2.5% fee');
  stepHas(m, 1, `$0.05 × ${n2(bar.parts.term)} × 0.60 × ${n2(wen.ci.cm)} = ${ui(bar.price)}`, '0.80');
  stepHas(m, 2, `$0.05 × ${n2(mech.parts.term)} × 0.60 × ${n2(wen.ci.cm)} = ${ui(mech.price)}`, '0.60', '$14.00');
  exampleSteps(m, 3);
  // "65 to 70 times" holds for the dollars on screen (2.62 / 0.04) and for the unrounded offers; "65 to 87" is the same against the mechanic
  const onScreen = 2.62 / 0.04, unrounded = wen.price / bar.price;
  assert.ok(onScreen >= 65 && onScreen < 66 && unrounded > 68 && unrounded <= 71, `Wen's offer is ${onScreen.toFixed(1)} (on screen) to ${unrounded.toFixed(1)} times the barista's`);
  assert.equal(Math.round(2.62 / 0.03), 87);
  whyHas(m, 'about 65 to 70 times', 'by about 20% (1.16 against 0.97)', '65 to 87 times', `first ${ui(wen.change)}`);
  assert.ok(bar.parts.term / mech.parts.term > 1.15 && bar.parts.term / mech.parts.term < 1.25, 'fit moves the calm buyers\' offers by about 20%');
  // the card's two ideas do not contradict each other: urgency turned Wen's budget into her reference; the mechanic's budget only capped him
  assert.ok(near(wen.parts.ref, 4, 1e-9) && near(mech.parts.ref, g.val(a), 1e-9) && mech.price < 0.1, 'an urgent buyer starts from the budget, a calm one from fair value');
  assert.ok(m.why.title.includes(ui(wen.price)) && m.why.title.includes('fetched'), 'the card is titled with the first sale');
  // the tempting wrong choice (the biggest wallet) pays a few cents; even the weakest pitch (x0.85) still earns the first dollar
  assert.ok(wen.price * 0.85 >= m.win.match.price.gte, 'even the weakest pitch (x0.85) clears the win');
  assert.ok(wen.price / mech.price >= 50 && wen.price / bar.price >= 50, 'the urgent offer is worth at least fifty times the others');
  // the real Deal Room: Quick sells the clip to Wen for the first dollar, the barter goods arrive in Stock, and the decoys would have paid cents
  const g2 = sandbox(m), sale = sellDeal(g2, idOf(g2, 'paperclip'), 'sim-student');
  assert.equal(sale.summary.title, 'Sold at a gain'); assert.ok(sale.run.res.close === undefined || sale.run.res.close.skipped || sale.run.res.close.mult >= 0.6);
  assert.ok(g2.s.cash >= 1 && g2.s.assets.some((x) => x.cls === 'paperbacks'), 'cash above a dollar, and the paperbacks are in Stock');
  assert.ok(sale.summary.numbers.you >= 1 && sale.summary.numbers.you < 4, 'Quick pays Wen a price in the same league as the card');
  // the teach-back is a fresh case (an umbrella), about hurry, not cost or budget; its two numbers are the question's own
  teachHas(m, 'in a hurry', 'cost never set', 'biggest budget');
  // one thing changes between the two offers (who is asking), so the market-wide answer ("the rain made umbrellas worth more") is false for THIS case and the reason says why:
  // mission 9 is where a whole market moves, and an answer true of it must not be marked wrong here
  assert.ok(/pouring/.test(m.teachBack.q) && /tourist/.test(m.teachBack.q) && /commuter/.test(m.teachBack.q), 'the weather is held constant and the two buyers are the only difference');
  teachHas(m, 'The rain was the same for both', 'the tourist would pay more too');
  onlyEngineDollars(m, [0, g.val(a), wen.price, mech.price, bar.price, wen.goods.value, wen.change, 4, 14, 6, '$1', '$8']);
});

test('m02: a look is worth more than a discount, because here the price does not warn you', () => {
  const m = M('m02'), g = sandbox(m), lots = m.setup.lots;
  const [first, second, ball] = lots;
  assert.equal(first.cls, second.cls); assert.equal(first.price, second.price, 'the two watches carry one price');
  assert.ok(first.truth.fake && !second.truth.fake && !ball.truth.fake, 'exactly one counterfeit, and it is the first watch');
  assert.ok(second.truth.quality === 1 && ball.truth.quality === 1, 'a genuine lot is worth its described value, so the quoted gains are the real ones');
  const V = working(g, 'pawnWatch', 4), B = working(g, 'signedBall', 4);
  const Pw = ZONES[4].rules.fakes * ASSETS.pawnWatch.fakeRisk, Pb = ZONES[4].rules.fakes * ASSETS.signedBall.fakeRisk;
  assert.equal(Pw, 0.22); assert.equal(Pb, 0.22); assert.equal(FAKE_VALUE, 0.08);
  const rates = Object.values(ASSETS).map((a) => ZONES[4].rules.fakes * (a.fakeRisk ?? 1));
  assert.ok(Math.max(...rates) === 0.22 && Math.max(...rates) >= 0.2, 'no good here is more than 22% counterfeit: "up to about one lot in five of the riskiest goods"');
  // the worked example does its arithmetic on the cents the card shows, so a reader who redoes it gets the same cents
  const row = (v, p, price) => { const fv = r2(v * FAKE_VALUE), blind = (1 - p) * v + p * fv - price, checked = (1 - p) * (v - price); assert.ok(near(fv, v * FAKE_VALUE, 0.005)); return { v, fv, blind, checked, worth: checked - blind, risk: p * (price - fv) }; };
  const w = row(V, Pw, first.price), b = row(B, Pb, ball.price);
  assert.ok(near(w.worth, w.risk, 1e-9) && near(b.worth, b.risk, 1e-9), 'value of a perfect check = P(fake) x (price - fake value)');
  // the lots really are listed near their value (the generator lists fakes at full price): between 84% and 97%, the real lot discount
  for (const [l, v] of [[first, V], [second, V], [ball, B]]) assert.ok(l.price / v >= 0.84 && l.price / v <= 0.97, `${l.id} lists at ${n2(l.price / v)} of its value, like a real lot`);
  // Quick haggles at average skill, so it can pay up to 9% over the list; the genuine lots must still end ahead then, or the lesson's last step is a loss
  assert.ok(second.price * 1.09 < V * second.truth.quality && ball.price * 1.09 < B * ball.truth.quality, 'a genuine lot bought at the Deal Room\'s usual +9% is still a gain');
  assert.ok(m.setup.cash >= 1.09 * (first.price + second.price + ball.price), 'a mistake never bricks the sandbox: cash covers every lot, even at +9%');
  assert.ok(m.setup.skills.ops >= 2, 'enough Ops for a few probes');
  // Ops gives probe points to EACH lot (the budget is not a pool shared across lots), and sharper answers
  const budgets = lots.map((l) => D.inspectParams(g, 4, g.s.lots[4].find((x) => x.id === l.id)).budget);
  assert.deepEqual(budgets, [4, 4, 4]); assert.equal(D.inspectParams(sandbox(m, withSkills(m, { ops: 4 })), 4, g.s.lots[4][0]).budget, 5);
  assert.ok(D.inspectParams(sandbox(m, withSkills(m, { ops: 4 })), 4, g.s.lots[4][0]).accuracy > D.inspectParams(g, 4, g.s.lots[4][0]).accuracy);
  whyHas(m, 'more probe points on each lot');
  assert.equal(cents(V), '$314.60'); assert.equal(cents(w.fv), '$25.17'); assert.equal(cents(B), '$147.00'); assert.equal(cents(b.fv), '$11.76');
  assert.equal(ui(first.price), '$277'); assert.equal(ui(ball.price), '$128');
  whyHas(m, '22% for a watch', 'one lot in five of the riskiest goods', 'about 8%', 'price tells you nothing', 'Operational Engineering', 'lower risk, not zero', 'second look');
  has('m02 example setup', m.why.example.setup, cents(V), cents(w.fv), `$${first.price}`, cents(B), cents(b.fv), `$${ball.price}`, '22%');
  stepHas(m, 0, `Blind buy at $${first.price}`, `0.78 × ${cents(V)} + 0.22 × ${cents(w.fv)} - $${first.price} = ${cents(w.blind)}`);
  stepHas(m, 1, 'If a check were perfect', `0.78 × (${cents(V)} - $${first.price}) = ${plus(cents(w.checked))}`);
  stepHas(m, 2, 'A perfect check would be worth', `${cents(w.checked)} + ${cents(-w.blind)} = ${cents(w.worth)}`, `0.22 × ($${first.price} - ${cents(w.fv)})`);
  stepHas(m, 4, `blind ${cents(b.blind)}`, `perfect check ${plus(cents(b.checked))}`, cents(b.worth));
  exampleSteps(m, 5);
  whyHas(m, `${cents(w.blind)} bet`, `${plus(cents(w.checked))} deal`);
  // a real probe is noisy: the serial number alone catches about four fakes in five and wrongly flags about 3% of genuine watches (the real Read stage, Ops 2)
  let caught = 0, alarms = 0; const N = 6000, ids = ['first-watch', 'second-watch'];
  for (let seed = 1; seed <= N; seed++) for (const id of ids) {
    const lot = g.s.lots[4].find((x) => x.id === id);
    let st = inspect.create(D.inspectParams(g, 4, lot, { seed }));
    st = inspect.act(st, { type: 'probe', id: 'serial' }).state; st = inspect.act(st, { type: 'conclude' }).state;
    if (inspect.result(st).estimate.fakeProb >= 0.6) { if (id === 'first-watch') caught++; else alarms++; }
  }
  const c = caught / N, a = alarms / N;
  assert.ok(c >= 0.75 && c <= 0.85, `one serial probe catches the fake ${pc(c)} of the time ("about four in five")`);
  assert.ok(a >= 0.015 && a <= 0.045, `and wrongly flags a genuine watch ${pc(a)} of the time ("about 3%")`);
  const blindEV = 0.78 * V + 0.22 * w.fv - first.price, checkedEV = 0.78 * (1 - a) * (V - first.price) + 0.22 * (1 - c) * (w.fv - first.price), realWorth = checkedEV - blindEV;
  assert.ok(Math.round(realWorth) === 43 && realWorth < w.worth && realWorth > 0.7 * w.worth, `a real serial check is worth $${realWorth.toFixed(2)} here, most of the perfect $${w.worth.toFixed(2)}`);
  stepHas(m, 3, 'about four fakes in five', 'about 3%', 'about $43', `perfect ${w$(w.worth)}`);
  whyHas(m, 'a real one still adds about $43');
  // reading first beats buying the counterfeit blind by hundreds, through the real glue: Quick on the fake loses, Quick on the genuine lots wins
  const quick = Object.fromEntries(lots.map((l) => { const g2 = sandbox(m), { run, summary } = quickBuy(g2, 4, l.id); return [l.id, { paid: run.res.close.price, mult: run.res.close.mult, net: summary.numbers.net, title: summary.title }]; }));
  assert.ok(quick['first-watch'].net < -200 && quick['first-watch'].title === 'It was a counterfeit', 'a blind Quick buy of the fake loses most of the price');
  for (const id of ['second-watch', 'signed-ball']) {
    const l = lots.find((x) => x.id === id);
    assert.ok(quick[id].mult >= 1 && quick[id].mult <= 1.1 && quick[id].paid >= l.price && quick[id].paid <= l.price * 1.1, `${id}: Quick pays ${n2(quick[id].mult)} of the list`);
    assert.ok(quick[id].net > 0, `${id}: Quick on a genuine lot ends ahead (net ${quick[id].net}), so "press Quick to buy it" is not a lesson in losing money`);
  }
  has('m02 buy step', M('m02').steps.find((s) => s.id === 'buy').say, 'may land a little over the list');
  // the teach-back is a fresh case: a jersey at $150, genuine $170, fake about $14, one in five fake
  const jersey = { price: 150, v: 170, fv: 14, p: 0.2 }, jBlind = (1 - jersey.p) * jersey.v + jersey.p * jersey.fv - jersey.price, jWorth = jersey.p * (jersey.price - jersey.fv);
  assert.ok(Math.round(jBlind) === -11 && Math.round(jWorth) === 27 && jersey.price < jersey.v, 'a blind buy at a price below the genuine value still loses about $11; a perfect look is worth about $27');
  teachHas(m, 'about $11', 'about $27', '$14');
  // the stem states the decisive fact (a fake carries the same price), so the answer can be worked out from it, and every option answers its question (spend it, or not)
  assert.ok(/a fake would carry the same price/.test(m.teachBack.q) && /Spend it\?$/.test(m.teachBack.q), 'the stem says that a fake is listed at the same price and asks the yes-or-no question');
  assert.ok(m.teachBack.options.every((o) => /^(Yes|No)\. /.test(o.text)), 'each option is a yes or a no with its reason'); assert.deepEqual(m.teachBack.options.map((o) => o.correct), [true, false, false]);
  assert.ok(jBlind < 0 && jWorth > 0, 'blind the jersey loses money on average and a look is worth more than its one point');
  onlyEngineDollars(m, [V, w.fv, first.price, B, b.fv, ball.price, w.blind, w.checked, w.worth, b.blind, b.checked, b.worth, Math.round(realWorth), 150, 170, 14, 11, 27]);
});
const plus = (s) => (s.startsWith('-') ? s : '+' + s);

test('m03: know the buyer: the right two angles keep the full price, the wrong two cost about 9%, and the crowd is a different lesson', () => {
  const m = M('m03'), g = sandbox(m), a = g.s.assets[0], q = (id) => g.quotePitch(a.id, id);
  assert.ok(m.setup.perks.includes('grad') && g.P.radar, 'a borrowed Niche Radar');
  assert.equal(m.setup.assets.filter((x) => x.cls === 'enamelPins').length, 2, 'two sets: one for the crowd, one for the quiet buyer');
  const bree = q('thrift-flipper'), del = q('bookstore-buyer');
  assert.ok(bree.ci.band.id === 'herd' && del.ci.band.id === 'pioneer', 'the crowded buyer sits on the floor and the quiet one on the ceiling (foreshadowing mission 8)');
  assert.equal(n2(bree.fit), '1.00'); assert.equal(n2(del.fit), '0.50');
  assert.equal(cents(bree.fmv), '$5.30');
  // the lesson is the Pitch stage: what Bree is told, what the pins can back, and what every pair does at an average close
  const probe = sellRun(g, a.id, 'thrift-flipper'), view = probe.view();
  assert.equal(probe.plan.fair, bree.price); assert.equal(ui(probe.plan.fair), '$1.72');
  assert.deepEqual(view.hints.map((h) => h.kind), ['temper']); assert.deepEqual(view.hints[0].angles, ['prestige', 'scarcity', 'story']); assert.match(view.hints[0].text, /feeling/);
  assert.deepEqual(Object.fromEntries(view.asset.features.map((f) => [f.angle, f.strength])), { prestige: 0.4, scarcity: 0.7, story: 0.4 }, 'the pins back prestige, scarcity and story, scarcity best');
  const outcomeOf = (lead, angles) => { const g2 = sandbox(m), { run, summary } = sellDeal(g2, g2.s.assets[0].id, lead, { pitch: angles, close: 'quick' }); return { keen: run.res.pitch.mult, closeMult: run.res.close.mult, price: summary.numbers.you, fair: run.plan.fair }; };
  const pairsFor = (lead) => { const g2 = sandbox(m); return anglePairs(sellRun(g2, g2.s.assets[0].id, lead)); };
  const result = {};
  for (const [name, lead] of [['bree', 'thrift-flipper'], ['delphine', 'bookstore-buyer']]) {
    const pairs = pairsFor(lead);
    assert.ok(pairs.every((p) => p.mult >= 0.85 - 1e-9 && p.mult <= 1.2 + 1e-9), `${name}: every pair stays inside the Pitch game's x0.85..x1.20`);
    const best = pairs.reduce((x, y) => (y.mult > x.mult ? y : x)), worst = pairs.reduce((x, y) => (y.mult < x.mult ? y : x));
    result[name] = { best: { ...best, ...outcomeOf(lead, best.angles) }, worst: { ...worst, ...outcomeOf(lead, worst.angles) } };
  }
  const B = result.bree, Dl = result.delphine;
  assert.deepEqual([...B.best.angles].sort(), ['prestige', 'scarcity'], 'Bree: scarcity with prestige is the best pair'); assert.deepEqual([...B.worst.angles].sort(), ['price', 'utility'], 'and utility with price the worst');
  assert.deepEqual([...Dl.best.angles].sort(), ['scarcity', 'story']); assert.deepEqual([...Dl.worst.angles].sort(), ['price', 'utility']);
  assert.equal(n2(B.best.keen), '1.13'); assert.equal(n2(B.worst.keen), '0.98'); assert.equal(n2(Dl.best.keen), '1.07'); assert.equal(n2(Dl.worst.keen), '0.94');
  assert.ok(near(B.best.closeMult, 1, 1e-3)); assert.equal(ui(B.best.price), '$1.72'); assert.equal(n2(B.worst.closeMult), '0.91'); assert.equal(ui(B.worst.price), '$1.56');
  assert.ok(near(Dl.best.closeMult, 1, 1e-3)); assert.equal(ui(Dl.best.price), '$8.74'); assert.equal(ui(Dl.worst.price), '$7.95'); assert.equal(ui(Dl.best.price - Dl.worst.price), '$0.79');
  assert.ok(near(1 - B.worst.price / B.best.price, 0.09, 0.01) && near(1 - Dl.worst.price / Dl.best.price, 0.09, 0.01), 'the wrong pair costs about 9% at an average close');
  // the bounds the card quotes belong to the Pitch game, and a keen buyer (x1.00 or more) is the one that accepts fair
  assert.equal(Math.max(...pairsFor('thrift-flipper').map((p) => p.mult)) <= 1.2, true);
  assert.ok(B.best.keen >= 1 && Dl.best.keen >= 1 && B.worst.keen < 1 && Dl.worst.keen < 1);
  assert.equal((bree.parts.term).toFixed(2), '1.35'); assert.equal(del.parts.term, 0.875);
  // the crowd is the other lesson: it stays on the cards, and the price gap it makes is mission 8's to quantify
  assert.ok(del.price / bree.price > 5, 'the quiet buyer pays about five times more, whatever the angles');
  const cmf = g.cmFor(3, 'enamelPins', 'bree'); assert.ok(near(cmf.cm, bree.ci.cm, 1e-12) && near(cmf.S, bree.ci.S, 1e-12), 'the card shows what cmFor says');
  assert.ok(!/Cm =|V_total|V_niche|409/.test(text(m.why)), 'the saturation formula and its 409% belong to mission 8');
  whyHas(m, '1.00', '0.50', '0.40 + 0.95 × fit', '0.15', 'x0.85', 'x1.20', 'about 9% off', 'Mission 8 shows how far');
  has('m03 example setup', m.why.example.setup, cents(bree.fmv), ui(B.best.price), ui(Dl.best.price), 'Quick');
  stepHas(m, 0, 'Scarcity with prestige', 'x1.13', 'fair price', ui(B.best.price));
  stepHas(m, 1, 'Utility with price', 'x0.98', 'about 9% off', ui(B.worst.price));
  stepHas(m, 2, 'scarcity with story (x1.07)', ui(Dl.best.price), 'utility with price (x0.94)', ui(Dl.worst.price), ui(Dl.best.price - Dl.worst.price));
  exampleSteps(m, 3);
  whyHas(m, 'about 9%');
  // the Quick route skips the angles (Quick is an average pitch), and the coach says so
  has('m03 hint', M('m03').steps.find((s) => s.id === 'bree').hint, 'skips the practice'); has('m03 hint', M('m03').steps.find((s) => s.id === 'delphine').hint, 'Quick skips the angles');
  // the price gap the player sees between the two sales is the crowd's (Cm 0.40 against 3.14), not the angles': the steps and the card both say which is which
  sayHas(m, 'delphine', 'mostly the crowd'); whyHas(m, 'the gap between Bree\'s price and Delphine\'s is the crowd', 'smaller, steadier 9%');
  assert.ok(del.price / bree.price > 4 * (B.best.price / B.worst.price), `the crowd moves the price x${(del.price / bree.price).toFixed(1)}, the angles x${(B.best.price / B.worst.price).toFixed(2)}`);
  // the teach-back's pair is the one its stem supports (rare, with a story): scarcity with story keeps Bree keen and the price at fair
  const ss = outcomeOf('thrift-flipper', ['scarcity', 'story']);
  assert.equal(n2(ss.keen), '1.12'); assert.ok(near(ss.closeMult, 1, 1e-3) && ui(ss.price) === '$1.72', 'scarcity with story keeps Bree keen and the price at fair');
  assert.ok(!/prestige/i.test(m.teachBack.q), 'the stem does not ask for an angle it never mentions');
  teachHas(m, 'feeling', 'rare', 'story', 'Scarcity with story', 'x1.12', 'x0.98', '9% off');
  onlyEngineDollars(m, [bree.fmv, B.best.price, B.worst.price, Dl.best.price, Dl.worst.price, Dl.best.price - Dl.worst.price]);
});

/** The Haggle game played on its own parameters. careless: open at fair, take the first answer. patient: open at fair, then hold. careful: what the Assist coach advises at every move. */
function hagglePlay(params, how) {
  let s = haggle.create({ ...params, assist: how === 'careful' });
  const log = [], note = (d) => log.push({ do: d, yours: s.log.at(-1).yours, theirs: s.log.at(-1).theirs });
  if (how === 'careless') { s = haggle.act(s, { type: 'anchor', level: 'fair' }).state; note('anchor fair'); if (!s.done) { s = haggle.act(s, { type: 'accept' }).state; log.push({ do: 'accept' }); } }
  else if (how === 'patient') { s = haggle.act(s, { type: 'anchor', level: 'fair' }).state; note('anchor fair'); for (let i = 0; i < 12 && !s.done; i++) { const r = haggle.act(s, { type: 'hold' }); if (r.say === null) break; s = r.state; note('hold'); } }
  else for (let i = 0; i < 30 && !s.done; i++) { const a = haggle.view(s).advice.action, r = haggle.act(s, a); if (r.say === null) break; s = r.state; note(a.type + (a.level ? ' ' + a.level : '') + (a.size ? ' ' + a.size : '')); }
  return { res: haggle.result(s), log };
}

test('m04: the first number is worth money, patience more, and an alternative makes walking away real', () => {
  const m = M('m04'), g = sandbox(m), a = g.s.assets[0], q = (id) => g.quotePitch(a.id, id);
  assert.equal(m.zone, 2); assert.ok(ZONES[2].rules.haggle, 'Flea Market Row, where every deal can be haggled');
  assert.equal(m.setup.assets.length, 2, 'two radios'); assert.equal(m.setup.leads.length, 3, 'two buyers to haggle with and a third left over as the alternative');
  assert.ok(m.setup.skills.growth >= 2 && g.lvl('growth') >= 2, 'a fuzzy read of the limit (Growth)');
  const col = q('stall-collector'), dol = q('stall-dolores'), tar = q('stall-tariq');
  assert.deepEqual([BUYERS.collector.style, BUYERS.dolores.style], ['hard', 'friendly'], 'Dolores is friendlier than Mr. Abernathy, as the coach says');
  assert.ok(near(col.price, dol.price, 1e-9), 'both buyers fit the radio at 1.00 and the same fair price');
  const fair = rawPrice(col), alt = rawPrice(tar);
  assert.ok(alt >= 0.8 * fair && alt <= 1.3 * fair, `the busker's offer (${n2(alt / fair)} of fair) counts as the alternative the Deal Room offers`);
  assert.equal(ui(fair), '$10.61'); assert.equal(ui(alt), '$8.74');
  // the worked example is NOT a deal of this sandbox: one made-up hard buyer with a hidden limit of 1.21 x fair, met three times with the same seed through the real Haggle game
  const made = { role: 'sell', fair, reserve: fair * 1.21, style: BUYERS.collector.style, patience: BUYERS.collector.patience + 1, handicap: 0, insight: D.insightOf(g), alt, seed: 1 };
  const cl = hagglePlay(made, 'careless'), pa = hagglePlay(made, 'patient'), cf = hagglePlay(made, 'careful');
  assert.ok(cl.res.deal && pa.res.deal && cf.res.deal);
  const limit = fair * 1.21, firstCounter = cl.log[0].theirs, careless = cl.res.price, patient = pa.res.price, careful = cf.res.price;
  assert.equal(ui(limit), '$12.84'); assert.equal(ui(firstCounter), '$7.47'); assert.equal(ui(careless), '$7.47'); assert.equal(n2(careless / fair), '0.70');
  assert.equal(ui(patient), '$10.61'); assert.equal(pa.res.mult, 1, 'opening at fair and holding closes at exactly fair: the most opening at fair can ever earn');
  assert.equal(cf.log[0].do, 'anchor high'); assert.equal(ui(cf.log[0].yours), '$14.85'); assert.equal(n2(cf.log[0].yours / fair), '1.40');
  const concessions = cf.log.filter((x) => x.do.startsWith('concede')).map((x) => ui(x.yours));
  assert.deepEqual(concessions, ['$13.15', '$12.20', '$11.78']); assert.equal(ui(careful), '$11.78'); assert.equal(n2(careful / fair), '1.11');
  // where the gap comes from: patience (the first answer is not the limit) is most of it, the high anchor the rest, in dollars as the card shows them
  assert.equal(ui(patient - careless), '$3.14'); assert.equal(ui(careful - patient), '$1.17');
  assert.ok(patient - careless > careful - patient, 'patience is worth more than the anchor in this scenario, as the card says');
  assert.ok(careless < alt && careful > alt, 'the careless price is below the alternative, so the BATNA says refuse it; the careful one is above');
  has('m04 example setup', m.why.example.setup, ui(fair), ui(limit), ui(alt), 'made-up');
  stepHas(m, 0, `Open at fair (${ui(fair)})`, `first counter, ${ui(firstCounter)}`, `you sell at ${ui(careless)}`, `${n2(careless / fair)} × fair`);
  stepHas(m, 1, 'hold your ground', `they come up to ${ui(patient)}`, `worth ${ui(patient - careless)}`);
  stepHas(m, 2, `Open high (${ui(cf.log[0].yours)}, 1.40 × fair)`, concessions.join(', '), `agree at ${ui(careful)}`, `${n2(careful / fair)} × fair`, `added another ${ui(careful - patient)}`);
  stepHas(m, 3, `${ui(alt)} is your BATNA`, ui(careless));
  exampleSteps(m, 4);
  whyHas(m, `${ui(careless)}, ${ui(patient)} and ${ui(careful)}`, `Patience was worth ${ui(patient - careless)} and the high anchor ${ui(careful - patient)} more`, `the ${ui(alt)} alternative`, 'Mention your other option', 'Customer Acquisition Velocity');
  has('m04 formula', m.why.formula, '1.40 × fair', '4%, 9% or 16%');
  assert.deepEqual([haggle.ANCHORS.high, haggle.STEPS.small, haggle.STEPS.medium, haggle.STEPS.large], [1.4, 0.04, 0.09, 0.16]);
  // the win is the sale that follows the last step's haggle, and the pitch event's mult is the Close's (js/deal.js dealFrom): 10% over fair is what opening at fair can never do
  assert.deepEqual(m.win, { event: 'pitch', match: { mult: { gte: 1.1 } } }, 'the win is selling 10% over fair');
  assert.deepEqual(m.steps.map((x) => [x.id, x.wait.event, JSON.stringify(x.wait.match || {})]), [['market', undefined, '{}'], ['careless', 'pitch', '{"seg":"collector"}'], ['careful', 'haggle', '{"role":"sell"}']], 'the first deal ends on its pitch, the last waits for the haggle that comes first in the same finish');

  // over many hidden limits and seeds, with the real parameters the screen gives each buyer: patience pays, the anchor pays more, and the win is reachable
  const seeds = Array.from({ length: 400 }, (_, i) => i + 1);
  for (const [who, lead, seg] of [['the collector', 'stall-collector', 'collector'], ['Dolores', 'stall-dolores', 'dolores']]) {
    const L = g.s.leads[2].find((l) => l.id === lead);
    const runs = (how) => seeds.map((seed) => hagglePlay(D.haggleParams(g, { role: 'sell', fair, buyer: BUYERS[seg], lead: L, zone: 2, alt, warmth: 1.13, seed }), how).res);
    const cls = runs('careless'), pas = runs('patient'), cfs = runs('careful');
    const mc = mean(cls.filter((r) => r.deal).map((r) => r.mult)), mp = mean(pas.filter((r) => r.deal).map((r) => r.mult)), mf = mean(cfs.filter((r) => r.deal).map((r) => r.mult));
    assert.ok(cls.every((r) => r.deal && r.mult <= 1 + 1e-9), `${who}: opening at fair never earns more than fair`);
    assert.ok(pas.every((r) => r.deal && r.mult <= 1 + 1e-9) && mp >= mc, `${who}: patience at fair (x${mp.toFixed(2)}) is never worse than the first answer (x${mc.toFixed(2)})`);
    assert.ok(mf - mp >= 0.05 && mf - mc >= 0.1, `${who}: the careful way averages x${mf.toFixed(2)}, patient x${mp.toFixed(2)}, careless x${mc.toFixed(2)}`);
    assert.ok(cfs.filter((r) => r.deal && r.mult >= 1.1).length / seeds.length >= 0.5, `${who}: the 10%-over-fair win is reachable by Assist-advised play on at least half the seeds`);
    assert.equal(cls.filter((r) => r.deal && r.mult >= 1.1).length, 0, `${who}: and by nobody who takes the first answer`);
  }

  // the deals the player really meets (Quick for the Pitch): Mr. Abernathy, then Dolores
  const first = () => { const g1 = sandbox(m); const d = sellDeal(g1, g1.s.assets[0].id, 'stall-collector', { pitch: 'quick', close: 'careless' }); return { g1, d }; };
  const { g1, d: d1 } = first();
  assert.ok(near(d1.run.plan.fair, fair, 1e-9) && d1.run.res.close.deal, 'the first sale is at the card\'s fair price');
  assert.ok(near(d1.run.res.close.mult, 1, 1e-3), 'a careless close with the real collector says "Fine. Done." at fair: x1.00, not the card\'s x0.70 (the card\'s buyer is made up)');
  const a2 = g1.s.assets[0], plan2 = sellRun(g1, a2.id, 'stall-dolores').plan;
  assert.equal(ui(plan2.fair), '$14.54'); assert.equal(ui(plan2.alt), '$11.98');
  const tryClose = (how, pitch = 'quick') => { const { g1: gx } = first(), d = sellDeal(gx, gx.s.assets[0].id, 'stall-dolores', { pitch, close: how }); return { mult: d.run.res.close.mult, deal: d.run.res.close.deal, keen: d.run.res.pitch.mult }; };
  const won = (r) => r.deal && r.mult >= 1.1;
  assert.ok(!won(tryClose('quick')) && !won(tryClose('careless')) && !won(tryClose('patient')), 'Quick, taking the first answer, and holding at fair all stop at x1.00');
  assert.ok(won(tryClose('careful')), 'Assist-advised play with the Quick pitch wins');
  // and across every pair of angles: a warm pitch (x1.03 or more) always lets careful play win, no pair lets a careless close win
  const pairs = anglePairs(sellRun(first().g1, first().g1.s.assets[0].id, 'stall-dolores'));
  const warm = pairs.filter((p) => p.mult >= 1.03);
  assert.ok(warm.length >= 4, 'at least four of the ten pairs are warm for Dolores');
  for (const p of pairs) { assert.ok(!won(tryClose('careless', p.angles)), `${p.angles}: a careless close never wins`); if (p.mult >= 1.03) assert.ok(won(tryClose('careful', p.angles)), `${p.angles} (x${p.mult.toFixed(2)}): careful play wins`); }
  // ...and a cool Pitch can put 10% over fair out of reach for ANY play: the buyer's hidden limit scales with the Pitch's keenness (js/deal.js haggleParams), so for the
  // two coolest pairs the best Close of all (every legal move sequence of the real Haggle game) stays under x1.10, and a retry with the same pair is the same deal.
  // This is why both Dolores steps say "press Quick for the Pitch" and the hint says to pick again when the Close stalls.
  const exhaustive = (angles) => {
    const gx = first().g1, rx = sellRun(gx, gx.s.assets[0].id, 'stall-dolores'); rx.act({ type: 'pick', angles }); rx.next();
    let top = 0; const walk = (st) => { if (st.done) { const r = haggle.result(st); if (r.deal && r.mult > top) top = r.mult; return; } for (const a of haggle.legal(st)) { const r = haggle.act(st, a); if (r.say !== null) walk(r.state); } };
    walk(haggle.create({ ...rx.paramsFor('close'), assist: false })); return top;
  };
  const cool = pairs.filter((p) => !won(tryClose('careful', p.angles)));
  assert.ok(cool.length >= 4 && cool.every((p) => p.mult < 1.03), `${cool.length} of the ten pairs cannot be won with Assist-advised play, and all of them are cool pitches (below x1.03)`);
  for (const angles of [['prestige', 'scarcity'], ['prestige', 'price']]) assert.ok(exhaustive(angles) < 1.1, `${angles}: no sequence of moves reaches x1.10`);
  assert.ok(exhaustive(['scarcity', 'story']) >= 1.1 && won(tryClose('careful')), 'a warm pitch, and the Quick pitch the steps ask for (tryClose pitches with Quick), can');
  assert.deepEqual(tryClose('careful', ['prestige', 'scarcity']), tryClose('careful', ['prestige', 'scarcity']), 'the same pair at the same hour is the same deal');
  sayHas(m, 'careless', 'Quick for the Pitch'); sayHas(m, 'careful', 'Quick for the Pitch again', 'Mention your other option');
  // "Leave and tap Dolores again to retry": the same deal at the same hour is the same deal
  const again = sellRun(g1, a2.id, 'stall-dolores');
  assert.equal(again.plan.seed, plan2.seed); assert.deepEqual(again.paramsFor('close', undefined, { pitch: { mult: 1.1 } }), sellRun(g1, a2.id, 'stall-dolores').paramsFor('close', undefined, { pitch: { mult: 1.1 } }));
  has('m04 final hint', M('m04').steps[2].hint, '1.10 × fair', 'weak Pitch', 'Leave and tap Dolores again');
  // the teach-back's wrong answer is the real finding made false by its wording: a buyer never pays past their limit (js/play/haggle.js: an offer over it is refused)
  teachHas(m, 'forces the buyer to pay more than their limit', 'walk away');
  assert.ok(!/believe the goods are worth more/.test(text(m.teachBack)), 'the real anchoring effect (the first number shifts what people think a thing is worth) is not the distractor');
  has('m04 why', m.why.body[0], 'Real anchors also shift what people think a thing is worth');
  teachHas(m, ui(firstCounter), ui(limit), ui(patient - careless));
  onlyEngineDollars(m, [fair, limit, alt, careless, patient, firstCounter, cf.log[0].yours, ...concessions.map((c) => Number(c.slice(1))), careful, patient - careless, careful - patient]);
});

test('m05: the same repair is a thin gain at Ops 1 and a windfall at Ops 2, even with a bad marker', () => {
  const m = M('m05');
  assert.equal(m.setup.skills.ops, 2, 'the sandbox runs at Ops 2');
  const at = (ops, deal) => { const g = sandbox(m, withSkills(m, { ops })), a = g.s.assets[0], r = g.repairQuote(a.id, deal), net = r.after - r.before - r.cost; return { g, a, ...r, net, roi: net / r.cost }; };
  const o1 = at(1), o2 = at(2), o3 = at(3), best = at(2, { qualityMult: 1.15, costMult: 0.9 }), worst = at(2, { qualityMult: 0.85, costMult: 1.3 });
  const van = ASSETS.van, g2 = o2.g;
  assert.equal(g2.repairMultFor(7), 0.75 * 0.9, 'Auto Row takes 25% off, and opening it takes another 10% off');
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
  assert.equal(ui(worst.net), '$498'); assert.equal(ui(best.net), '$1,335'); assert.ok(worst.net > 0, 'even the worst marker pays at Ops 2');
  assert.ok(m.setup.cash >= worst.cost, 'cash covers the worst marker');
  // what Delgado pays for the van as it stands and repaired (the buyer accepts broken goods, so the comparison is real)
  const lead = o2.g.s.leads[7][0], qb = o2.g.quotePitch(o2.a.id, lead.id);
  assert.ok(!qb.rejected && BUYERS.smelog.like.vehicle >= 0.8, 'Delgado Delivery takes a broken van');
  o2.g.repair(o2.a.id, {});
  const qa = o2.g.quotePitch(o2.a.id, lead.id);
  assert.equal(ui(qb.price), '$1,058'); assert.equal(ui(qa.price), '$2,203');
  assert.ok(!qa.capped && qa.price < lead.budget, 'the buyer can afford the repaired van');
  has('m05 example setup', m.why.example.setup, ui(w), ui(o2.before), '$1,050', '0.675', 'average Deal Room result', 'perfectly average marker');
  stepHas(m, 0, 'Ops 1', `$1,050 × 0.675 = ${ui(o1.cost)}`, 'Quality 0.50', ui(o1.after), `Gain ${ui(o1.after - o1.before)} minus ${ui(o1.cost)} cost = ${w$(o1.net)}`, `ROI ${pc(o1.roi)}`);
  stepHas(m, 1, 'Ops 2', `$1,050 × 0.42 × 0.675 = ${ui(o2.cost)}`, 'Quality 0.625', `value ${ui(o2.after)}`, `Gain ${ui(o2.after - o2.before)} minus ${ui(o2.cost)} = ${ui(o2.net)}`, `ROI ${pc(o2.roi)}`);
  stepHas(m, 2, 'Ops 3', `cost ${ui(o3.cost)}`, 'quality 0.75', `value ${ui(o3.after)}`, `+${ui(o3.net)}`, `ROI ${whole(o3.roi * 100)}%`);
  stepHas(m, 3, 'quality -15%, cost +30%', `+${ui(worst.net)}`, `+${ui(best.net)}`);
  assert.ok(qa.price > 2 * qb.price, 'more than double');
  stepHas(m, 4, ui(qb.price), ui(qa.price), 'more than double', ui(o2.cost));
  exampleSteps(m, 5);
  whyHas(m, 'Three things set the price of a fix', '0.42', '0.50 at Ops 1 to 1.00 at Ops 5', '25% off', '10% more', '0.75 × 0.90 = 0.675', '-10% to +30%', 'timing on the marker', `${w$(o1.net)} scrape into a ${ui(o2.net)} profit`);
  sayHas(m, 'fleet', ui(qb.price), 'Quick', 'fleet buyer\'s card'); sayHas(m, 'quests', 'another one at the end');
  assert.equal(m.reward.points, 1, 'the point the Quests step promises is the one this mission pays');
  assert.ok(M('m02').reward.points === 1 && M('m03').reward.points === 1, 'and it is not the first: missions 2 and 3 already paid one each, so the coach says "another"');
  // the repair is waited for by its event, so it does not matter whether the player reached it from the van in the yard (which opens Stock) or from Stock's own Repair button
  assert.deepEqual(m.steps.map((x) => x.id), ['quests', 'stock', 'repair', 'market', 'fleet']);
  assert.equal(m.steps[2].wait.event, 'repair'); sayHas(m, 'repair', 'Stock', 'Repair', 'green band');
  // the teach-back is a fresh case, judged by gain after cost against the cash tied up
  const job1 = { cost: 500, lift: 600 }, job2 = { cost: 200, lift: 500 };
  assert.ok(job1.lift - job1.cost === 100 && job2.lift - job2.cost === 300 && (job2.lift - job2.cost) / job2.cost === 1.5 && (job1.lift - job1.cost) / job1.cost === 0.2);
  teachHas(m, '$300 on $200', '$100 on $500', '150%', '20%');
  // the tempting wrong choices: value added is not profit, and "either" ignores the margin; and one skill point on Ops is worth $946 - $57
  assert.ok(o1.roi < 0.15 && o2.roi > 2 && o2.net - o1.net >= 800, 'one skill point on Ops turns a thin gain into a windfall');
  assert.ok(o3.cost < o2.cost && o3.net > o2.net && o2.cost < o1.cost, 'Ops makes a repair cheaper and better at every level');
  // the Fix stage: the dial's result stays inside the engine's bounds, and a scripted player completes it
  const g5 = sandbox(m), fx = fixDeal(g5, g5.s.assets[0].id);
  assert.ok(fx.summary.title === 'Repaired, and it pays' && g5.s.assets[0].cond === 'ok', 'the Fix stage repairs the van');
  onlyEngineDollars(m, [van.repair, w, o2.before, o1.cost, o1.after, o1.after - o1.before, o1.net, o2.cost, o2.after, o2.after - o2.before, o2.net, o3.cost, o3.after, o3.net, worst.net, best.net, qb.price, qa.price, 500, 600, 200, 300, 100]);
});

test('m06: the fee and the fuel both come out of the wallet, a starved manager earns nothing, and a hire has a payback', () => {
  const m = M('m06'), sess = lessonSession(m), g = sess.game, cash = m.setup.cash;
  const lane = { cls: 'laptops', buyer: 'trainer' };
  const fc = (kind, g0 = g) => { const p = { kind, zone: 5, level: 1, ...lane, channel: 'dom', alloc: 0, cycles: 0 }; p.alloc = g0.pipeCap(p); return { p, ...g0.forecast(p), hire: g0.pipeCost(kind, 5) }; };
  const stu = fc('student'), bro = fc('broker');
  assert.equal(cash, 620); assert.ok(m.zone >= 5 && m.setup.features.includes('crew') && m.setup.clock === 'paused');
  assert.equal(g.s.hour, 0, 'the forecast is read at the moment of the hire, hour 0, and the card says so');
  assert.deepEqual([stu.hire, stu.cap, bro.hire, bro.cap], [120, 450, 600, 1000]);
  assert.equal(cash - bro.hire, 20); assert.ok(cash - bro.hire < bro.cap, 'the Broker leaves too little to work with: starved');
  assert.ok(cash - stu.hire >= stu.cap && cash - stu.hire === 500, 'the Student leaves enough to feed his full allocation');
  assert.equal(stu.len, 41); assert.equal(bro.len, 32);
  assert.equal(cents(stu.gross), '$16.43'); assert.equal(cents(stu.fee), '$10.96'); assert.equal(cents(stu.tax), '$0.82'); assert.equal(cents(stu.roy), '$0.49'); assert.equal(cents(stu.overhead), '$2.78'); assert.equal(cents(stu.net), '$1.37'); assert.equal(cents(stu.perDay), '$0.80');
  assert.equal(cents(bro.net), '$8.28'); assert.equal(cents(bro.perDay), '$6.21');
  assert.ok(near(stu.gross - stu.fee - stu.tax - stu.roy - stu.overhead, stu.net, 1e-9), 'net = gross - fee - tax - royalty - overhead');
  assert.ok(stu.ci.S < 0.05 && stu.ci.cm > 2.5, 'the laptop lane to Brightpath is the quiet one');
  // the lesson runs the clock at 16x, so a 41-hour cycle takes about 18 real seconds, and a payback of the fee at the forecast rate is 150 days
  assert.equal(sess.clock.speed, 16); assert.equal(Math.round(stu.len * SEC_PER_HOUR / sess.clock.speed), 18);
  assert.equal(Math.round(stu.hire / stu.perDay), 150);
  // most lanes lose money after fees, which is why the coach names the lane and the card says "read the forecast first"
  const lanes = [];
  for (const cls of Object.keys(ASSETS)) for (const buyer of Object.keys(BUYERS)) if (g.validLane(5, cls, buyer).ok) lanes.push(g.forecast({ kind: 'student', zone: 5, level: 1, cls, buyer, channel: 'dom', alloc: 450, cycles: 0 }).net);
  assert.ok(lanes.filter((x) => x <= 0).length / lanes.length >= 0.7 && Math.max(...lanes) === stu.net, `a thin lane can lose money: ${lanes.filter((x) => x <= 0).length} of ${lanes.length} lanes do not pay the Student, and the coach's lane is the best`);
  has('m06 example setup', m.why.example.setup, '$620', '$120', '$450', '$600', '$1,000', 'level 2', 'Capital Sourcing', 'at the moment you hire');
  stepHas(m, 0, `$620 - $600 = ${w$(cash - bro.hire)}`, '$1,000', 'Starved', '$600 fee has left your wallet');
  stepHas(m, 1, `$620 - $120 = ${w$(cash - stu.hire)}`, `$${stu.cap}`, `${stu.len} hours`);
  const fees = stu.fee + stu.tax + stu.roy + stu.overhead;
  assert.ok(near(r2(stu.gross) - r2(fees), r2(stu.net), 0.005), 'the displayed gross, the fees and the net add up to the cent');
  stepHas(m, 2, `gross ${ui(stu.gross)}`, `less ${ui(fees)} of costs`, `platform fee alone is ${ui(stu.fee)}`, `leaves ${ui(stu.net)}`, `${ui(stu.perDay)} a day`, 'more or less');
  stepHas(m, 3, ui(bro.net), `${bro.len} hours`, `${ui(bro.perDay)} a day`, '$0 a day');
  exampleSteps(m, 4);
  whyHas(m, 'Profit per day', 'the fee is already spent', 'wallet is $600 lighter', 'only 60%', 'about 150 days', `${ui(stu.perDay)} a day`, 'wallet $600 lighter');
  assert.ok(!/Return per day|exactly what idle cash earns/.test(text(m.why)), 'a starved manager is NOT the same as idle cash: its fee is spent');
  sayHas(m, 'hire', '$450', 'a lane is the goods and buyer'); sayHas(m, 'cash', '$620'); sayHas(m, 'clock', '16x', '18 seconds', '$450');
  assert.ok(!/\b(he|him|his)\b/i.test(text({ steps: m.steps, why: { b: m.why.body, e: m.why.example } })), 'managers have no gender in the data; say the manager, it or they');
  // played: the fed Student runs cycles, the starved Broker never starts one and ends $600 poorer than idle cash
  const first = [];
  const run = (kind) => { const g2 = sandbox(m); g2.onEvent = (e) => { if (e.type === 'cycle') first.push(e.net); }; assert.ok(g2.hirePipeline(kind, 5, lane).ok); assert.equal(g2.s.cash, kind === 'student' ? 500 : 20, 'the fee leaves the wallet at the hire; the working capital leaves when time runs'); g2.advanceTo(100); return { p: g2.s.pipes[0], cash: g2.s.cash, nw: g2.netWorth() }; };
  const fed = run('student'), starved = run('broker'), idle = sandbox(m); idle.advanceTo(100);
  assert.ok(fed.p.cycles >= 2 && !fed.p.starved && fed.p.profit > 0, 'the fed Student finishes cycles and earns');
  assert.ok(first.length >= 2 && Math.abs(first[0] - stu.net) > 0.01, `the first cycle the player watches ($${first[0].toFixed(2)}) is not the hour-0 forecast to the cent: the card calls it a forecast and says later cycles move`);
  assert.equal(starved.p.cycles, 0); assert.ok(starved.p.starved && starved.p.profit === 0 && starved.cash === 20, 'the starved Broker never starts a cycle');
  assert.equal(idle.s.cash - starved.cash, bro.hire, 'a starved Broker leaves your wallet exactly its fee lighter than idle cash');
  const g3 = sandbox(m); g3.hirePipeline('broker', 5, lane); g3.releasePipeline(g3.s.pipes[0].id);
  assert.equal(g3.s.cash, 20 + 0.6 * bro.hire, 'and releasing the manager brings back only 60% of what the hire cost');
  // capital is a cap the dialog lets you lower ("Use what I can afford"), so "starved" is true of the default (full) capital, and the lesson says what lowering it costs:
  // an expensive manager running on pennies earns next to nothing (here it even loses a little to the fee on its tiny cycle)
  const small = sandbox(m); assert.ok(small.hirePipeline('broker', 5, { ...lane, alloc: 20 }).ok); small.advanceTo(100);
  assert.ok(small.s.pipes[0].alloc === 20 && small.s.pipes[0].profit < 1 && small.s.pipes[0].profit < fed.p.profit, `a Broker lowered to $20 earns ${small.s.pipes[0].profit.toFixed(2)} against the fed Student's ${fed.p.profit.toFixed(2)}`);
  whyHas(m, 'Lowering its capital to fit leaves you with an expensive manager earning next to nothing'); stepHas(m, 0, 'capital per cycle it is set to use');
  // the teach-back is a plan, not a premise: $700, put $500 behind A or $450 behind B, with their fees
  assert.deepEqual([700 - 300, 700 - 150, 700 - 300 - 150], [400, 550, 250]); assert.ok(400 < 500 && 550 >= 450 && 250 < 450, 'only B can start a cycle, and both together starve both');
  teachHas(m, '$500 per cycle', '$450 per cycle', 'Both', '$250', '$550');
  // the lesson tells the player up front that the payback is long and why they hire anyway
  sayHas(m, 'crew', 'we hire only to watch the loop run'); sayHas(m, 'hire', 'Expect a long payback'); has('m06 result', m.why.example.result, 'training wheel', 'longer than a 90-day run', 'read the payback');
  assert.ok(stu.hire / stu.perDay > TOTAL_DAYS, `the Student's payback (${Math.round(stu.hire / stu.perDay)} days) is longer than the 90-day run, as the card says`);
  onlyEngineDollars(m, [cash, 0, stu.cap, stu.hire, bro.hire, bro.cap, cash - bro.hire, cash - stu.hire, stu.gross, fees, stu.fee, stu.net, stu.perDay, bro.net, bro.perDay, 700, 300, 500, 150, 400, 550, 100, 250]);
});

test('m07: the same fall leaves one loan nowhere near a margin call and the other 18% away from one, whatever the Deal Room does to the price', () => {
  const m = M('m07'), E = m.setup.cash, price = m.setup.lots[0].price;
  const g0 = sandbox(m), f0 = working(g0, 'sneakers', 5);
  assert.ok(m.setup.lots.length === 4 && m.setup.lots.every((l) => l.price === price && l.cls === 'sneakers'));
  assert.ok(E >= price && E < 2 * price, 'cash buys one lot, not two');
  assert.equal(ui(f0), '$369'); assert.ok(price / f0 < 0.7 && price / f0 > 0.6, 'lots are priced about a third under their value');
  assert.equal(pc(f0 / price - 1), '47%', 'and are worth 47% more than you pay');
  const room = g0.loanRoom('micro').room;
  assert.equal(room, 1200, 'the bank caps a draw at D/E 3.0 of the equity you have, so the maximum is $1,200');
  assert.equal(Math.floor(room * 15 / 100), 180, 'the Bank drawer\'s slider moves in steps of 5% of the room, so 15% is $180');
  // the gauge reads above 3.0 right after a maximum draw: the 3% fee comes out of equity after the room was counted
  const gm = sandbox(m); assert.ok(gm.draw('micro', 1200).ok);
  assert.equal(n2(gm.deRatio()), '3.30'); assert.ok(gm.deRatio() > DEBT.maxDE);
  const go = (L, lots, mult = 1) => {
    const g = sandbox(m); assert.ok(g.draw('micro', L).ok);
    for (const id of lots) assert.ok(g.buyLot(5, id, { mult }).ok, `${id} is affordable`);
    const r = { fee: L * 0.03, cash: g.s.cash, nw0: g.netWorth(), de0: g.deRatio(), debt: g.debt(), hold0: g.invValue() };
    let call = false; g.onEvent = (e) => { if (e.type === 'margin-call') call = true; };
    g.advanceTo(7);
    return { ...r, nw1: g.netWorth(), de1: g.deRatio(), hold1: g.invValue(), call, g };
  };
  const SMALL = ['bargain-b', 'bargain-c'], ALL = ['bargain-a', 'bargain-b', 'bargain-c', 'bargain-d'];
  const small = go(180, SMALL), big = go(1200, ALL);
  const glut = small.hold1 / small.hold0 - 1;
  assert.ok(near(glut, -0.25, 0.005), `the glut cuts sneaker values by ${pc(-glut)}`);
  assert.equal(ui(small.nw0), '$632'); assert.equal(n2(small.de0), '0.28'); assert.equal(ui(small.nw1), '$447'); assert.equal(n2(small.de1), '0.40');
  assert.equal(ui(big.nw0), '$838'); assert.equal(n2(big.de0), '1.43'); assert.equal(ui(big.nw1), '$469'); assert.equal(n2(big.de1), '2.56');
  assert.ok(small.cash < 100, 'the small loan is spent on the lots, not left idle at 11% interest');
  // how far would prices have to fall to trip the call? (hold at the call = debt / 4.5 - cash + debt)
  const fall = (r) => { const holdCall = r.debt / DEBT.callDE - r.cash + r.debt; return { total: 1 - holdCall / r.hold0, beyond: 1 - holdCall / r.hold1 }; };
  const fs = fall(small), fb = fall(big);
  assert.equal(pc(fb.total), '39%'); assert.equal(pc(fb.beyond), '18%'); assert.equal(pc(fs.total), '80%');
  // check the threshold on the engine itself: a total fall a hair under it survives, a hair over it trips the call
  const trips = (r0, total) => { const g = r0.g, f = (r0.hold0 * (1 - total)) / r0.hold1; for (const a of g.s.assets) a.wear *= f; g._m = null; g.evq.length = 0; g._marginCall(); return g.evq.some((e) => e.type === 'margin-call'); };
  assert.ok(!trips(go(1200, ALL), fb.total - 0.01) && trips(go(1200, ALL), fb.total + 0.01), 'the 39% line is where the engine really calls the loan');
  // the Deal Room's Quick buys at list or up to 9% over: even then, neither scenario trips the call at the glut (the lesson cannot dead-end in a forced sale)
  for (const mult of [1, 1.09]) for (const [L, lots] of [[180, SMALL], [1200, ALL]]) { const r = go(L, lots, mult); assert.ok(!r.call && r.de1 < DEBT.callDE - 0.8 && r.cash > -1, `loan ${L}, lots at x${mult}: D/E ${n2(r.de1)} after the glut, no forced sale`); }
  // what Quick really pays for each lot through the real Deal Room: list for b, c and d; a little over for a, which is why the coach points at bargain-b
  const quick = Object.fromEntries(ALL.map((id) => { const g = sandbox(m); g.draw('micro', 1200); const { run } = quickBuy(g, 5, id); return [id, run.res.close.mult]; }));
  assert.ok(near(quick['bargain-b'], 1, 1e-3) && near(quick['bargain-c'], 1, 1e-3) && near(quick['bargain-d'], 1, 1e-3), `Quick pays the list for b, c and d (${JSON.stringify(quick)})`);
  assert.ok(quick['bargain-a'] > 1 && quick['bargain-a'] <= 1.1, 'and a little over for a');
  assert.equal(M('m07').steps.find((s) => s.id === 'buy').anchor, 'world:lot:bargain-b', 'the buy step points at a lot Quick buys at the list price');
  has('m07 example setup', m.why.example.setup, 'average Deal Room result', 'a few dollars either way');
  // the interest: the engine's rate at Capital Sourcing 2
  assert.equal(n2(g0.loanRate('micro')), '0.11'); assert.equal(n2(600 * g0.loanRate('micro') / 30), '2.23');
  has('m07 example setup', m.why.example.setup, '$400', `$${price}`, ui(f0), '25%');
  stepHas(m, 0, 'Borrow only what you will spend, $180, and buy 2 lots', `net worth ${ui(small.nw0)}, D/E ${n2(small.de0)}`, `net worth ${ui(small.nw1)}, D/E ${n2(small.de1)}`);
  stepHas(m, 1, 'maximum $1,200, buy 4 lots', `net worth ${ui(big.nw0)}, D/E ${n2(big.de0)}`, `net worth ${ui(big.nw1)}, D/E ${n2(big.de1)}`);
  stepHas(m, 2, `fall ${pc(fb.total)}`, `${pc(fb.beyond)} beyond the glut`, `${pc(fs.total)} fall`);
  exampleSteps(m, 3);
  whyHas(m, '4.5', '35%', '11% per 30 days', '$2.23 a day on $600', 'near D/E 1', 'counted before its 3% fee', 'about 3.3', '47% more');
  has('m07 result', m.why.example.result, `${w$(big.nw1 - small.nw1)} ahead`, `${pc(fb.beyond)} of a fall away`, 'forced sale', 'worst day');
  sayHas(m, 'draw', `$${price}`, ui(f0), '15% is $180', '$1,200'); sayHas(m, 'bank', '$400', '3.0', '4.5', 'margin call'); sayHas(m, 'bank-again', '4.5');
  sayHas(m, 'clock', '16x', 'about 3 seconds', 'about 30');
  // the clock runs at 16x: the glut (hour 6, 72 hours long) lands in 2.6 s and lasts 31 s
  const sess = lessonSession(m);
  assert.equal(sess.clock.speed, 16); assert.equal(Math.round(6 * SEC_PER_HOUR / 16), 3); assert.equal(Math.round(72 * SEC_PER_HOUR / 16 / 10) * 10, 30);
  assert.equal(ALGO_EVENTS.glut.mk('sneakers').phases[0].to, 72);
  // the headline the shock step points at is the newest note when the glut lands
  const gg = sandbox(m); gg.advanceTo(6); assert.match(gg.s.news.find((n) => n.level !== 'info').text, /glut/i, 'the ticker shows the glut, not a district opening');
  // the teach-back is a fresh case: two borrowers, the same 20% fall, D/E before and after
  const P = { own: 1000, debt: 1000 }, T = { own: 1000, debt: 3000 }, goods = (x) => x.own + x.debt;
  const after = (x) => x.debt / (goods(x) * 0.8 - x.debt), callFall = (x) => 1 - (x.debt / DEBT.callDE + x.debt) / goods(x);
  assert.equal(n2(P.debt / P.own), '1.00'); assert.equal(n2(T.debt / T.own), '3.00'); assert.equal(n2(after(P)), '1.67'); assert.equal(after(T), 15);
  assert.equal(pc(callFall(T)), '8%'); assert.equal(pc(callFall(P)), '39%');
  teachHas(m, 'D/E 1.0', 'D/E 3.0', 'About an 8% fall', 'about 39%', 'D/E to 15', '$2,000 of goods against $1,000', '$4,000 against $3,000');
  assert.ok(big.nw1 > small.nw1 && fs.beyond / fb.beyond >= 4, `the big loan had ${pc(fb.beyond)} of room beyond the glut, the small one ${pc(fs.beyond)}`);
  onlyEngineDollars(m, [E, price, f0, 600 * g0.loanRate('micro') / 30, 600, 180, 1200, small.nw0, small.nw1, big.nw0, big.nw1, big.nw1 - small.nw1, 1000, 3000, 2000, 4000]);
});

test('m08: the same sneakers sell for $130 in the herd and $686 in the open', () => {
  const m = M('m08'), g = sandbox(m), a = g.s.assets[0];
  assert.ok(m.setup.perks.includes('grad') && g.P.radar && m.setup.cohort.ghosts >= 20);
  assert.equal(m.setup.assets.filter((x) => x.cls === 'sneakers').length, 2);
  assert.deepEqual(m.setup.leads.map((l) => l.seg).sort(), ['boutique', 'popup']);
  const herd = g.quotePitch(a.id, 'trend-boutique'), open0 = g.quotePitch(a.id, 'popup-stall');
  assert.equal(herd.fit, 1); assert.equal(open0.fit, 1); assert.equal(herd.parts.term, 1.35, 'both buyers fit the sneakers at 1.00');
  assert.equal(n2(herd.parts.growth), '1.04', 'Growth 2 adds the 1.04 the card names');
  const base = herd.fmv * 1.35 * 0.6 * herd.parts.growth;
  assert.equal(ui(herd.fmv), '$364'); assert.equal(ui(base), '$307');
  assert.equal(n2(herd.ci.S), '0.57'); assert.equal(n2(herd.ci.cm), '0.42'); assert.ok(herd.ci.cm >= 0.4 && herd.ci.cm < 0.55, 'the herd is on the floor, in the herd-trap band');
  assert.equal(herd.ci.band.id, 'herd');
  const cmf = g.cmFor(5, 'sneakers', 'popup'); assert.ok(near(cmf.cm, open0.ci.cm, 1e-12) && cmf.vN < 1.5 && cmf.vT > 10, 'the stall is a quiet niche in a real herd (cmFor)');
  assert.equal(ui(herd.price), '$130'); assert.equal(pc(herd.price / base), '42%');
  g.pitch(a.id, 'trend-boutique', { mult: 1 });
  const open = g.quotePitch(g.s.assets[0].id, 'popup-stall');
  assert.equal(n2(open.ci.S), '0.07'); assert.equal(n2(open.ci.cm), '2.24'); assert.equal(ui(open.price), '$686'); assert.equal((open.price / base).toFixed(1), '2.2');
  assert.equal(ui(open.price - herd.price), '$556'); assert.equal((open.price / herd.price).toFixed(1), '5.3');
  for (const l of m.setup.leads) assert.ok(open.price < l.budget && herd.price < l.budget, `${l.id}: the budget never caps the lesson`);
  assert.ok(open.ci.cm > 2 && open.price / herd.price > 1.4 / 0.6, `the open niche beats the herd by x${(open.price / herd.price).toFixed(2)}, more than the worst a Deal Room multiplier can hide (x${(1.4 / 0.6).toFixed(2)})`);
  assert.ok(m.win.match.S.lt === 0.5 && open.ci.S < 0.5, 'win is a pitch into a niche that is not crowded');
  // what the player really gets by pressing Quick through the real Deal Room: the quotes, to the dollar
  const g2 = sandbox(m), s1 = sellDeal(g2, g2.s.assets[0].id, 'trend-boutique'), s2 = sellDeal(g2, g2.s.assets[0].id, 'popup-stall');
  assert.equal(ui(s1.summary.numbers.you), '$130'); assert.equal(ui(s2.summary.numbers.you), '$686'); assert.equal(s1.summary.title, 'Sold into the herd');
  has('m08 example setup', m.why.example.setup, `${ui(herd.fmv)} × 1.35 × 0.60 × 1.04 = ${ui(base)}`, 'Growth bonus', 'average Deal Room result');
  stepHas(m, 0, 'S = 0.57', 'Cm = 0.42', '0.40 floor', ui(herd.price), '42%');
  stepHas(m, 1, 'S = 0.07', 'Cm = 2.24', ui(open.price), '2.2 times');
  stepHas(m, 2, '1.00', ui(open.price - herd.price), '5.3 times');
  exampleSteps(m, 3);
  whyHas(m, '0.40', '3.14', 'your cohort', 'simulated classmates', '48 hours');
  assert.equal(text(m.why).split('Cm = [0.40 + ln').length - 1, 1, 'the formula is written once, in the formula line');
  has('m08 result', m.why.example.result, ui(herd.price), ui(open.price));
  sayHas(m, 'popup', 'almost nobody'); has('m08 intro', m.intro, 'last two days');
  // the radar's whole point: the same sandbox without the herd has no contrast, so the lesson's contrast is the cohort's doing
  const calm = sandbox(m, { cohort: { ghosts: 0 } }), c1 = calm.quotePitch(calm.s.assets[0].id, 'trend-boutique'), c2 = calm.quotePitch(calm.s.assets[0].id, 'popup-stall');
  assert.ok(near(c1.ci.cm, c2.ci.cm, 1e-9), 'with no herd both buyers pay the same');
  teachHas(m, '6 in 10', '1 in 10', '0.40 floor', '3.14');
  onlyEngineDollars(m, [herd.fmv, base, herd.price, open.price, open.price - herd.price]);
});

test('m09: concentration is what the shock punishes, and the warning arrives 12 hours ahead', () => {
  const m = M('m09'), g = sandbox(m);
  const gadgets = m.setup.assets.filter((a) => a.cls === 'gadgets').length;
  assert.equal(gadgets, 2); assert.equal(m.setup.assets.length, 3); assert.deepEqual(m.setup.assets.map((a) => a.cls).sort(), ['gadgets', 'gadgets', 'textbooks'], 'two gadget pallets and a textbook pallet: a real, if lopsided, spread');
  assert.ok(ASSETS.gadgets.tags.includes('trend') && !ASSETS.textbooks.tags.includes('trend'), 'gadgets are the trend, textbooks are not');
  const ev = m.setup.events[0];
  assert.equal(ev.kind, 'tiktok'); assert.ok(ev.atHour >= 12 && ev.atHour <= 48, 'a warning comes before the shock');
  assert.equal(g.warnLead(), 12, 'the ticker warns 12 hours ahead at Capital Sourcing 2');
  assert.ok(EVENTS.tiktok.alert.vars.some((v) => /every district/.test(v)), 'the craze really does hit every district, so travelling would not save the pallets');
  assert.ok(m.setup.features.includes('travel') && m.setup.zones.length >= 2, 'the map shows somewhere else');
  const ids = g.s.assets.filter((a) => a.cls === 'gadgets').map((a) => a.id), gadgetsValue = (gg = g) => gg.s.assets.filter((a) => a.cls === 'gadgets').reduce((t, a) => t + gg.val(a), 0);
  const tb = working(g, 'textbooks', 5), today = gadgetsValue(), stock0 = g.invValue(), nw0 = g.netWorth();
  assert.equal(nw0, stock0, 'no cash: everything you own is stock');
  let shocked = false; g.onEvent = (e) => { if (e.type === 'shock') shocked = true; };
  g.advanceTo(23); assert.ok(!shocked && Math.abs(gadgetsValue() - today) < 1e-9);
  g.advanceTo(24); assert.ok(shocked, 'the craze lands at hour 24');
  assert.match(g.s.news.find((n) => n.level !== 'info').text, /TikTok/, 'the ticker shows the craze, not a district opening');
  const peak = gadgetsValue(), pool = g.poolQuote(ids), nwPeak = g.netWorth();
  assert.ok(nwPeak < ZONES[7].gate, 'net worth at the spike stays under the next district\'s gate, so nothing else opens');
  g.advanceTo(48); const pool48 = g.poolQuote(ids).total;
  g.advanceTo(73);
  const fatigue = gadgetsValue(), fall = 1 - fatigue / today, share = today / (today + tb);
  assert.equal(ui(today / 2), '$730'); assert.equal(ui(tb), '$427'); assert.equal(ui(today + tb), '$1,886'); assert.equal(ui(peak / 2), '$1,870'); assert.equal(ui(fatigue / 2), '$348'); assert.equal(pc(fall), '52%');
  // had all three pallets been gadgets (the comparison the card draws), and the real mix
  const three = sandbox(m, { assets: [{ cls: 'gadgets' }, { cls: 'gadgets' }, { cls: 'gadgets' }] }), today3 = gadgetsValue(three), at3 = three.netWorth();
  three.advanceTo(73); const fat3 = gadgetsValue(three);
  assert.equal(ui(today3 - fat3), '$1,146'); assert.equal(ui(today3), '$2,189'); assert.equal(pc(1 - fat3 / today3), '52%'); assert.equal(at3, today3);
  assert.equal(pc(share), '77%'); assert.equal(pc(0.77 * 0.52), '40%'); assert.ok(Math.abs(share * fall - 0.4) < 0.01, 'loss = share in the shock x size of the fall, about 40%'); assert.equal(ui(today - fatigue), '$764');
  assert.ok(share * fall < 1 - fat3 / today3 - 0.1, 'spreading trimmed the loss by more than ten points');
  // the pool pays at once, "about $3,200" in both phases of the craze, and holding is "about $700" at the bottom; selling beats holding by "about $2,500"
  assert.ok(pool.delay === 0 && pool.total <= pool.room, 'the pool pays at once and has room for both');
  const approx = (x, n, tol = 0.03) => Math.abs(x - n) / n <= tol;
  assert.ok(approx(pool.total, 3200) && approx(pool48, 3200), `the pool pays $${Math.round(pool.total)} at hour 24 and $${Math.round(pool48)} at hour 48: "about $3,200" holds for both`);
  assert.ok(approx(fatigue, 700), `held, the pallets are worth $${Math.round(fatigue)}: "about $700"`); assert.ok(approx(pool.total - fatigue, 2500), `selling beats holding by $${Math.round(pool.total - fatigue)}: "about $2,500"`);
  g.advanceTo(100); assert.ok(approx(gadgetsValue(), 700, 0.05) && approx(pool.total - gadgetsValue(), 2500, 0.05), 'and still do at hour 100');
  assert.equal(pc(pool.fric), '14%');
  has('m09 example setup', m.why.example.setup, ui(today / 2), ui(tb), ui(today + tb), ui(peak / 2), ui(fatigue / 2), pc(fall));
  stepHas(m, 0, `100% × ${pc(fall)} = ${pc(fall)} of what you own`, `${ui(today3 - fat3)} of ${ui(today3)}`);
  stepHas(m, 1, `${pc(share)} of ${ui(today + tb)}`, `${pc(share)} × ${pc(fall)} = 40%`, ui(today - fatigue));
  stepHas(m, 2, 'about $3,200', '14% haircut'); stepHas(m, 3, 'about $700', 'about $2,500');
  exampleSteps(m, 4);
  whyHas(m, 'five times', 'halves trend prices for 72', '12 hours ahead', 'about 14%', 'Capital Sourcing', 'Spreading trimmed the loss; selling in time avoided it');
  has('m09 result', m.why.example.result, 'spread and lose 40%', 'about $3,200', 'sell what it points at');
  // the clock runs at 16x: the craze lands in 10.5 s and lasts 21 s; the coach names that speed and does not ask for a faster one
  const sess = lessonSession(m);
  assert.equal(sess.clock.speed, 16); assert.equal(Math.round(ev.atHour * SEC_PER_HOUR / 16), 11); assert.equal(Math.round(48 * SEC_PER_HOUR / 16 / 10) * 10, 20);
  // ...and the coach says what the player will see, in order, so that nobody pauses before the craze is real: the warning headline at hour 12 (5 s), the craze at hour 24 (10 s)
  assert.equal(Math.round((ev.atHour - g.warnLead()) * SEC_PER_HOUR / 16), 5);
  sayHas(m, 'clock', '16x', 'about 5 seconds', 'about 10', 'about 20', 'speed alone', 'do not pause yet'); sayHas(m, 'travel', 'selling in time');
  sayHas(m, 'shock', 'Watch the ticker', 'first the warning', 'now in effect', 'When it is live, pause'); assert.ok(!/has landed|There it is/.test(text(m.steps.map((x) => x.say))), 'no coach line says the craze has landed before it has');
  { const gn = sandbox(m), seen = []; for (let h = 1; h <= 24; h++) { gn.advanceTo(h); for (const n of gn.s.news) if (!seen.includes(n.text)) seen.push(n.text); }
    assert.ok(/effective in 12 hours/.test(seen.find((x) => /TikTok/.test(x))) && /now in effect/.test(seen.filter((x) => /TikTok/.test(x))[1]), `the ticker says the warning first, then "now in effect": ${seen.filter((x) => /TikTok/.test(x)).join(' | ')}`); }
  assert.ok(!/64x/.test(text(m.steps)) && !/hedge/i.test(text(m.steps.map((s) => s.say))), 'no step sends the player to a faster speed, and the textbooks are diversification, not a hedge');
  // the right choice against the tempting one: act on the warning and you bank thousands; hold and you hold a halved asset
  const hold = sandbox(m), sell = sandbox(m);
  hold.advanceTo(100);
  sell.advanceTo(24); assert.ok(sell.sellPool(sell.s.assets.filter((a) => a.cls === 'gadgets').map((a) => a.id)).ok); sell.advanceTo(100);
  assert.ok(sell.netWorth() - hold.netWorth() >= 2000, `selling into the spike leaves net worth $${Math.round(sell.netWorth() - hold.netWorth())} above holding`);
  assert.ok(hold.invValue() < 0.65 * stock0, 'holding rides it up and all the way back down, to under two thirds of today');
  // the teach-back is a fresh case: $1,000 of trend goods, tripled for two days, then half of today's price; the pool's haircut is the one on the card
  const spike = 1000 * 3 * (1 - 0.14), bottom = 1000 * 0.5; assert.equal(Math.round(spike), 2580); assert.equal(bottom, 500);
  // prices DO come back after the fatigue (about a day and a half short of five days after the craze began), so holding is not "ending at $500": its cost is the spike and the wait
  { const gr = sandbox(m), val = () => gr.s.assets.filter((a) => a.cls === 'gadgets').reduce((t, a) => t + gr.val(a), 0); gr.advanceTo(96); const bottom = val() / today; gr.advanceTo(150); const back = val() / today;
    assert.ok(bottom < 0.55 && back > 0.85, `held gadgets are worth x${bottom.toFixed(2)} of today at hour 96 and x${back.toFixed(2)} at hour 150: they recover`); assert.equal((24 + 48 + 72 - 24) / 24, 4 + 1, 'from the craze to the end of the fatigue is five days'); }
  teachHas(m, '$2,580', '$500', '14% haircut', '72 hours', 'five days', 'recover', 'before recovering');
  assert.ok(!/ends at \$500/.test(text(m.teachBack)), 'holding does not "end at $500": the price comes back');
  onlyEngineDollars(m, [today / 2, tb, peak / 2, fatigue / 2, today + tb, today3 - fat3, today3, today - fatigue, 3200, 700, 2500, 1000, spike, bottom]);
});

test('m10: every skill, then the score', () => {
  const m = M('m10'), g = sandbox(m), lot = m.setup.lots[0];
  assert.equal(m.setup.lots.length, 3, 'three lots, so losing one auction (or two) does not end the lesson');
  for (const l of m.setup.lots) assert.ok(l.auction === true && l.mode === 'auction' && l.cond === 'broken' && l.cls === lot.cls && l.price === lot.price && l.truth && l.truth.fake === false && l.truth.quality === lot.truth.quality, 'identical broken auction lots with a hidden truth');
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
  // The lot "as it stands" is the figure the player can SEE: Stock lists the crate at $490 once it is theirs, and the repair quote's "before" is the same number. The Deal
  // Room has two others for the same lot, neither of them a good one to quote: the auction game's hidden worth ($534, the guide price over 0.8 times the real condition, which
  // its winner's-curse line prints after a win) and, on the result screen, "really 90% of the described condition, worth about $441". The card used to call $534 the room's
  // value as it stands; a player who read Stock and the result screen had three numbers for one lot.
  const lotA = g.s.lots[6].find((l) => l.id === 'estate-lot-a'), params = D.auctionParams(g, 6, lotA);
  assert.equal(ui(params.trueValue), '$534');
  const gs = sandbox(m), wonStock = auctionDeal(gs, 6, 'estate-lot-d', { ceiling }), stock = gs.val(gs.s.assets[0]);
  assert.equal(ui(stock), '$490'); assert.equal(stock, gs.repairQuote(gs.s.assets[0].id).before, 'Stock and the repair quote agree');
  assert.match(wonStock.summary.lines.join(' '), /90% of the described condition, worth about \$441/);
  assert.ok(stock < ceiling && lot.price < stock, 'the lot as it stands is worth less than the all-in value, so the repair is the edge');
  has('m10 why', m.why.body[2], ui(stock), 'the figure Stock shows', 'fix and resell', 'sale price is an estimate too', ui(ceiling));
  assert.ok(!/\$534|\$441/.test(text(m)), 'the card quotes neither of the Deal Room\'s other two numbers for the lot');
  // at the sandbox's own seeds: bidding to the ceiling loses lot A to a rival at about the ceiling, and wins lot D well short of it, under what the lot is worth as it stands
  const lostA = auctionDeal(sandbox(m), 6, 'estate-lot-a', { ceiling }), wonB = auctionDeal(sandbox(m), 6, 'estate-lot-d', { ceiling });
  assert.equal(lostA.run.res.bid.won, false); assert.ok(lostA.run.res.bid.reveal.rivals.some((r) => r.limit >= ceiling - 1), 'a loud rival goes to about the ceiling on lot A');
  assert.equal(wonB.run.res.bid.won, true); assert.equal(ui(wonB.run.res.bid.price), '$428'); assert.ok(wonB.run.res.bid.price < stock && stock < ceiling);
  assert.match(wonB.run.res.bid.lesson.text, /Shading below your estimate paid/);
  // and a player who ignores the ceiling and goes to the budget on lot A wins at a price above what the lot is worth and is told it is the winner's curse
  const curse = auctionDeal(sandbox(m), 6, 'estate-lot-a', { ceiling: 665 });
  assert.equal(curse.run.res.bid.won, true); assert.ok(curse.run.res.bid.price > stock && curse.run.res.bid.price < 640); assert.match(curse.run.res.bid.lesson.text, /winner's curse/);
  // A cautious player is not locked out. What each lot clears at, whatever the ceiling (the clearing price is the opening bid plus whole increments of the rivals' limits):
  // A $618, D $428, H $380, so a ceiling of $380 wins H, $430 wins H or D, $620 wins any, and under $380 loses all three. The hints name $450, which wins D or H and not A.
  const cleared = (id, c) => { const r = auctionDeal(sandbox(m), 6, id, { ceiling: c }).run.res.bid; return r.won ? r.price : null; };
  const IDS = m.setup.lots.map((l) => l.id);
  assert.deepEqual(IDS.map((id) => Math.round(cleared(id, 700))), [618, 428, 380]);
  for (let c = 380; c <= 700; c += 5) assert.ok(IDS.some((id) => cleared(id, c) != null), `a ceiling of $${c} wins one of the three lots`);
  assert.ok(IDS.every((id) => cleared(id, 375) == null), 'and only a ceiling under $380 loses all three');
  assert.deepEqual(IDS.map((id) => cleared(id, 450) != null), [false, true, true], '$450 loses the loud lot A and wins the other two');
  has('m10 read hint', m.steps[0].hint, '$450', '$616', 'a read with no probe does not count');
  // a read with no probe records no inspect event (js/deal.js finish: "reading nothing earns nothing"), so the step that asks for the read says a probe is needed, and the
  // auction that comes with it is not lost: the 'auction' step still hears the other lot's
  { const gn = sandbox(m), evs = []; gn.onEvent = (e) => evs.push(e.type); const rn = buyRun(gn, 6, 'estate-lot-d'); readBy(rn, []); rn.next(); bidUpTo(rn, 616); rn.finish();
    assert.deepEqual(evs.filter((t) => ['inspect', 'auction', 'buy'].includes(t)), ['auction', 'buy'], 'no probe, no inspect'); }
  has('m10 example setup', m.why.example.setup, ui(sale.price), ui(sale.received), ui(rq.cost), '$20,000', 'floored to $1,000');
  stepHas(m, 0, `${ui(sale.received)} from the sale - ${ui(rq.cost)} repair = ${ui(ceiling)}`, ui(stock), 'Stock shows the lot', 'repair is your edge');
  sayHas(m, 'read', ui(ceiling), 'READ', 'AUCTION', 'stop well short');
  // the score is something the player does: the 'score' step has them open their net worth, the one place the sandbox shows what EEI is made of. Their stake was $1,000
  // (cash only), and after the repair their net worth is above it, so "over $1,000" is a number they can read
  assert.deepEqual(m.steps.map((x) => x.id), ['read', 'auction', 'fix', 'score', 'close']);
  assert.deepEqual([m.steps[3].anchor, m.steps[3].wait], ['hud-networth', { type: 'click', anchor: 'hud-networth' }]);
  { const gn = sandbox(m); assert.equal(gn.s.startCapital, 1000, 'the lesson stake is the $1,000 floor'); assert.equal(gn.netWorth(), 1000);
    auctionDeal(gn, 6, 'estate-lot-d', { ceiling }); fixDeal(gn, idOf(gn, 'antiqueFurniture'));
    assert.ok(gn.netWorth() > gn.s.startCapital, `after the repair the net worth is $${Math.round(gn.netWorth())}, over the $1,000 stake: the first half of EEI is above 1`);
    assert.ok(near(eeiCalc(gn.netWorth(), gn.s.startCapital, 89, EEI_FLOOR_DEFAULT), gn.netWorth() / 1000 * (1 + 89 / TOTAL_DAYS), 1e-9), 'EEI = net worth over the stake, times the time bonus'); }
  sayHas(m, 'score', '$1,000', 'net worth', 'EEI', 'time bonus');
  // (the sale lowers net worth a little, 846 minus tax and fees against the repaired crate's fair value, so the coach does not promise the sale lifts the score)
  assert.ok(!/lifts|raises/.test(m.steps[3].say));
  // the score: the real EEI function, with the real floor
  const ana = eeiCalc(20000, 0.05, 30, EEI_FLOOR_DEFAULT), ben = eeiCalc(20000, 0.05, 0, EEI_FLOOR_DEFAULT), need = 20000 * (1 + 30 / TOTAL_DAYS), before = 20000 / (1 - FEES.exitBrokerage);
  assert.ok(near(ana, 26.67, 0.005) && near(ben, 20, 1e-9));
  assert.equal(n2(1 + 30 / TOTAL_DAYS), '1.33'); assert.equal(ui(need), '$26,667'); assert.equal(ui(before), '$22,727');
  assert.equal(eeiCalc(20000, 0.05, 0, EEI_FLOOR_DEFAULT), eeiCalc(20000, 1000, 0, EEI_FLOOR_DEFAULT), 'a start worth pennies is floored to $1,000');
  assert.ok(near(eeiCalc(need, 0.05, 0, EEI_FLOOR_DEFAULT), ana, 1e-6), 'Ben would need $26,667 to match Ana');
  stepHas(m, 1, '$20,000 / $1,000 = 20', 'Time bonus 1 + 30/90 = 1.33', `EEI = ${n2(ana)}`);
  stepHas(m, 2, '20 × (1 + 0/90)', n2(ben));
  stepHas(m, 3, ui(need), '12% exit brokerage', ui(before));
  exampleSteps(m, 4);
  whyHas(m, `${n2(ana)} against ${n2(ben)}`, '$1,000', 'worth pennies', '12% brokerage', 'your ceiling capped what you would pay', 'the net worth you checked');
  assert.ok(!/\$0\.05/.test(text(m)), 'the real starting capital is the paperclip\'s $0.08; the card says "pennies", not a number the engine does not hold');
  assert.equal(new Game().s.startCapital, ASSETS.paperclip.base, 'the engine starts a founder with the paperclip\'s price');
  assert.equal(m.reward.points, 1);
  assert.ok(sale.price < m.setup.leads[0].budget, 'the dealer\'s budget never caps the sale');
  // the teach-back is about the score, with a fresh case: a bigger result late against a smaller one early
  const mia = eeiCalc(30000, 0.05, 0, EEI_FLOOR_DEFAULT), raj = eeiCalc(24000, 0.05, 45, EEI_FLOOR_DEFAULT);
  assert.equal(mia, 30); assert.equal(raj, 36); assert.ok(raj > mia, 'less money in half the days scores higher');
  teachHas(m, '$30,000', '$24,000', '$1,000 floor', '24 × 1.50 = 36', '30 × 1.00 = 30.0', '36.0');
  assert.equal(M('m10').concept, 'eei-score'); assert.ok(/EEI/.test(m.teachBack.q), 'the graded question tests the mission\'s concept');
  onlyEngineDollars(m, [ceiling, stock, 450, EEI_FLOOR_DEFAULT, 20000, sale.price, sale.received, rq.cost, need, before, 30000, 24000]);
});

// ---------------------------------------------------------------------------------------------------------------------------------------
// What a runner needs and no lesson data can give: from the sandbox state alone (spawns are off, so nothing refills), can every remaining wait and the win
// still happen? A lesson whose one scarce thing was spent on the wrong buyer, or whose scripted shock fired before its step, can only be restarted.
function stillPossible(m, g, from) {
  const s = g.s, assets = s.assets, leads = Object.values(s.leads).flat(), lots = Object.values(s.lots).flat();
  // something to sell: an asset a buyer of the right kind will take (a broken one once it is fixed), or a lot still on the shelf that can become one
  const sells = (mt = {}) => assets.some((a) => (mt.cls == null || a.cls === mt.cls) && leads.some((l) => (mt.seg == null || l.seg === mt.seg) && (() => { if (a.cond === 'broken' && ASSETS[a.cls].repair) return true; const q = g.quotePitch(a.id, l.id); return q.ok && !q.rejected; })()))
    || (lots.some((l) => mt.cls == null || l.cls === mt.cls) && leads.some((l) => mt.seg == null || l.seg === mt.seg));
  const can = (w) => {
    if (w.type === 'ui') return true;
    if (w.type === 'click') {
      const x = /^world:(lead|lot|asset|plot|static):(.+)$/.exec(w.anchor);
      if (x) { const [, k, id] = x; return k === 'lead' ? leads.some((l) => l.id === id) : k === 'lot' ? lots.some((l) => l.id === id) : k === 'asset' ? assets.some((a) => a.cls === id || a.id === id) : true; }
      return w.anchor === 'deal-room' ? assets.length > 0 || lots.length > 0 : true;
    }
    const mt = w.match || {};
    switch (w.event) {
      case 'pitch': return sells(mt);
      case 'buy': case 'inspect': return lots.some((l) => (mt.fake == null || l.truth.fake === mt.fake) && (mt.cls == null || l.cls === mt.cls));
      case 'auction': return lots.some((l) => l.mode === 'auction');
      case 'haggle': return mt.role === 'buy' ? lots.some((l) => l.mode !== 'auction') : mt.role === 'sell' ? sells() : sells() || lots.length > 0;
      case 'repair': return assets.some((a) => a.cond === 'broken') || lots.some((l) => l.cond === 'broken');
      case 'sell-pool': return assets.length > 0;
      case 'shock': return s.events.some((e) => !e.started && (!mt.kind || e.kind === mt.kind));
      case 'hire': case 'cycle': return s.cash >= g.pipeCost('student', m.zone) || s.pipes.length > 0;
      default: return true;
    }
  };
  return [...m.steps.slice(from).map((st) => st.wait), { type: 'event', event: m.win.event, match: m.win.match }].every(can);
}

// The steps of a lesson are finished by what a finished deal sends, so the scripted player plays the whole deal at the step that asks for it. The last step of a
// lesson that ends in a sale is finished by that sale's haggle, and the pitch that follows it in the same finish is the win.
const PLAYS = {
  m01: { student: (c) => sellDeal(c.g, idOf(c.g, 'paperclip'), 'sim-student') },
  m02: { // read both watches and pass on them, keeping what was learned; then tap the genuine one again and Quick it
    'first-watch': (c) => { const run = buyRun(c.g, 4, 'first-watch'); readBy(run, ['serial']); run.next(); run.walkAway(); },
    'second-watch': (c) => { const run = buyRun(c.g, 4, 'second-watch'); readBy(run, ['serial', 'power']); run.next(); run.walkAway(); },
    buy: (c) => { quickBuy(c.g, 4, 'second-watch'); },
  },
  m03: {
    bree: (c) => { sellDeal(c.g, c.g.s.assets[0].id, 'thrift-flipper', { pitch: 'best', close: 'quick' }); },
    delphine: (c) => { sellDeal(c.g, c.g.s.assets[0].id, 'bookstore-buyer', { pitch: 'best', close: 'quick' }); },
  },
  m04: {
    careless: (c) => { const d = sellDeal(c.g, c.g.s.assets[0].id, 'stall-collector', { pitch: 'quick', close: 'careless' }); assert.ok(d.run.res.close.deal); },
    careful: (c) => { const d = sellDeal(c.g, c.g.s.assets[0].id, 'stall-dolores', { pitch: 'quick', close: 'careful' }); assert.ok(d.run.res.close.mult >= 1.1); },
  },
  m05: {
    repair: (c) => { const d = fixDeal(c.g, idOf(c.g, 'van')); assert.equal(d.summary.title, 'Repaired, and it pays'); },
    fleet: (c) => { sellDeal(c.g, idOf(c.g, 'van'), 'fleet-buyer'); },
  },
  m06: {
    hire: (c) => assert.ok(c.g.hirePipeline('student', 5, { cls: 'laptops', buyer: 'trainer' }).ok),
    win: (c) => { for (let i = 0; i < 80 && !c.won; i++) c.g.stepHour(); },
  },
  m07: {
    draw: (c) => assert.ok(c.g.draw('micro', 180).ok),
    buy: (c) => { quickBuy(c.g, 5, 'bargain-b'); quickBuy(c.g, 5, 'bargain-c'); },
    shock: (c) => { c.g.advanceTo(7); assert.ok(c.g.deRatio() < 2, 'the small loan is nowhere near the call'); },
    win: (c) => assert.ok(c.g.repay(c.g.s.loans[0].id, 100).ok),
  },
  m08: {
    boutique: (c) => { sellDeal(c.g, c.g.s.assets[0].id, 'trend-boutique'); },
    popup: (c) => { const d = sellDeal(c.g, c.g.s.assets[0].id, 'popup-stall'); assert.ok(d.run.res.close.deal); },
  },
  m09: {
    shock: (c) => c.g.advanceTo(24),
    win: (c) => assert.ok(c.g.sellPool(c.g.s.assets.filter((a) => a.cls === 'gadgets').map((a) => a.id)).ok),
  },
  m10: { // lot A goes to a rival at the ceiling (dropping out costs nothing), lot D is won well short of it
    read: (c) => { const d = auctionDeal(c.g, 6, 'estate-lot-a'); assert.equal(d.run.res.bid.won, false); },
    auction: (c) => { const d = auctionDeal(c.g, 6, 'estate-lot-d'); assert.equal(d.run.res.bid.won, true); c.paid = d.run.res.bid.price; },
    fix: (c) => { fixDeal(c.g, idOf(c.g, 'antiqueFurniture')); },
    close: (c) => { sellDeal(c.g, idOf(c.g, 'antiqueFurniture'), 'antique-dealer', { pitch: 'best', close: 'careful' }); },
  },
};

for (const m of ACADEMY) {
  test(`${m.id} ${m.title}: scripted play completes every step and wins, and is never stranded on the way`, () => {
    // wrap each step's script so the reference check runs between steps
    const script = { ...PLAYS[m.id] };
    for (const s of m.steps) { const f = script[s.id]; script[s.id] = (c) => { assert.ok(stillPossible(m, c.g, c.i), `${m.id}: stranded before "${s.id}"`); f?.(c); }; }
    const c = playMission(m, script);
    assert.ok(c.g.netWorth() > 0 && !c.g.s.insolvent, 'the sandbox is still solvent');
    assert.ok(!c.seen.some((e) => e.type === 'margin-call' || e.type === 'insolvent'), 'no forced sale along the way');
    assert.ok(!c.seen.some((e) => e.type === 'zone' || e.type === 'milestone'), 'no district opens and no milestone lands while the lesson runs');
  });
}

// What the Market card's "Sell ... to ..." button does with two crates in the district: it sells "Best of mine" (the crate with the best score for that buyer), so the
// card route needs no tick in Stock, which the world sprite route does (js/ui/drawers/market.js card(), js/ui/worldview.js activate()). Rebuilt here from the same public
// functions so the lessons that start with two identical crates (m03, m04, m08) can be played the way the coach tells the player to, by the card.
const cardPick = (g, zone, leadId) => {
  const lead = g.s.leads[zone].find((l) => l.id === leadId); let best = null;
  for (const a of g.s.assets.filter((x) => x.zone === zone)) {
    const def = ASSETS[a.cls]; if (!(def.dem?.[zone] > 0)) continue; if (a.cond === 'broken' && !g.acceptsBroken(lead.seg)) continue;
    let fit = fitOf(a.cls, lead.seg); if (lead.need) fit = def.tags.includes(lead.need) ? 1 : fit * 0.5; if (fit < 0.15) continue;
    const score = Math.min(lead.budget, g.val(a) * fitMult(fit) * g.cmFor(zone, a.cls, lead.seg).cm);
    if (!best || score > best.score) best = { a, score };
  }
  return best.a.id;
};

test('the other ways to finish a deal: Quick or by hand, Pass or See the result, by the Market card or the sprite, in any order the coach cannot rule out', () => {
  const play = (m, steps) => { const c = lesson(m); for (const f of steps) f(c); return c; };
  const ui0 = (c, id) => c.feed({ type: 'ui', ui: 'open-drawer', id });
  const card = (c, zone, lead) => cardPick(c.g, zone, lead);
  // m01: by hand instead of Quick (Pitch by hand, Close by hand) still wins, because the step waits for what the finished deal sends and not for a button
  { const m = M('m01'), c = play(m, [(c) => click(c, 'hud-cash'), (c) => ui0(c, 'stock'), (c) => ui0(c, 'market')]);
    assert.equal(c.i, 3); sellDeal(c.g, idOf(c.g, 'paperclip'), 'sim-student', { pitch: 'best', close: 'careful' }); assert.ok(c.won, 'm01 by hand'); }
  // m01 again, the Market card's way: the card sells "Best of mine" to Wen, the step hears the sale exactly as it does after a tap on the sprite
  { const m = M('m01'), c = play(m, [(c) => click(c, 'hud-cash'), (c) => ui0(c, 'stock'), (c) => ui0(c, 'market')]);
    assert.equal(card(c, 1, 'sim-student'), idOf(c.g, 'paperclip')); sellDeal(c.g, card(c, 1, 'sim-student'), 'sim-student'); assert.ok(c.won, 'm01 by the card'); }
  // m02 B: read both watches the way the coach says and buy the second one in the same deal (Continue, Quick on the Close stage, See the result)
  { const m = M('m02'), c = play(m, [(c) => ui0(c, 'codex'), (c) => ui0(c, 'market')]);
    const r1 = buyRun(c.g, 4, 'first-watch'); readBy(r1, ['serial']); r1.next(); r1.walkAway();
    const r2 = buyRun(c.g, 4, 'second-watch'); readBy(r2, ['serial', 'power']); r2.next(); r2.quick(); r2.finish();
    assert.ok(c.won && c.seen.map((e) => e.type).join() .includes('inspect,inspect,haggle,buy'), 'm02 B: the read, the haggle and the buy arrive together and finish the lesson'); }
  // m02 C: Quick deal on everything, the fake included: the lesson still ends, the player is just poorer
  { const m = M('m02'), c = play(m, [(c) => ui0(c, 'codex'), (c) => ui0(c, 'market')]);
    quickBuy(c.g, 4, 'first-watch'); quickBuy(c.g, 4, 'second-watch');
    assert.ok(c.won, 'm02 C'); assert.ok(c.g.s.cash > 0, 'still solvent after buying the fake blind'); }
  // m02 D: the genuine watch read before the fake: the early inspect is not lost, the lesson goes on
  { const m = M('m02'), c = play(m, [(c) => ui0(c, 'codex'), (c) => ui0(c, 'market')]);
    const r0 = buyRun(c.g, 4, 'second-watch'); readBy(r0, ['serial']); r0.next(); r0.walkAway();
    assert.equal(c.i, 2, 'the genuine read is ignored by the step that asks for the fake');
    const r1 = buyRun(c.g, 4, 'first-watch'); readBy(r1, ['serial']); r1.next(); r1.walkAway(); assert.equal(c.i, 3);
    quickBuy(c.g, 4, 'second-watch'); assert.ok(c.won, 'm02 D'); }
  // m02 E: the second watch bought at once, before the fake was read: the signed baseball, genuine too, finishes the lesson
  { const m = M('m02'), c = play(m, [(c) => ui0(c, 'codex'), (c) => ui0(c, 'market')]);
    quickBuy(c.g, 4, 'second-watch'); assert.equal(c.i, 2, 'a genuine read is no credit for the fake step');
    const r1 = buyRun(c.g, 4, 'first-watch'); readBy(r1, ['serial']); r1.next(); r1.walkAway();
    assert.ok(stillPossible(M('m02'), c.g, c.i), 'a genuine lot is still on the shelf');
    quickBuy(c.g, 4, 'signed-ball'); assert.ok(c.won, 'm02 E'); }
  // m03 and m08: Quick for everything wins, by the card (which picks the crate) or by hand: the first sale ends on its pitch, the second on its haggle, then the pitch is the win
  { const m = M('m03'), c = play(m, [(c) => ui0(c, 'market')]);
    sellDeal(c.g, card(c, 3, 'thrift-flipper'), 'thrift-flipper'); assert.equal(c.i, 2, 'the first sale finishes its step');
    click(c, 'deal-room'); assert.equal(c.i, 2, 'the Continue press on its result screen is a click in the Deal Room and moves nothing');
    sellDeal(c.g, card(c, 3, 'bookstore-buyer'), 'bookstore-buyer'); assert.ok(c.won, 'm03 Quick'); }
  { const m = M('m08'), c = play(m, [(c) => ui0(c, 'market')]);
    sellDeal(c.g, card(c, 5, 'trend-boutique'), 'trend-boutique'); assert.equal(c.i, 2); click(c, 'deal-room'); assert.equal(c.i, 2);
    sellDeal(c.g, card(c, 5, 'popup-stall'), 'popup-stall', { pitch: 'best', close: 'careless' }); assert.ok(c.won, 'm08 by hand on the stall'); }
  // m04 by hand all the way (Pitch best); the card picks the radio for Dolores even though the barter records are in Stock too
  { const m = M('m04'), c = play(m, [(c) => ui0(c, 'market')]);
    sellDeal(c.g, card(c, 2, 'stall-collector'), 'stall-collector', { pitch: 'best', close: 'careless' }); assert.equal(c.i, 2);
    assert.equal(c.g.s.assets.find((a) => a.id === card(c, 2, 'stall-dolores')).cls, 'radio', 'the card sells the radio, not the barter records');
    click(c, 'deal-room'); assert.equal(c.i, 2, 'Continue on the result screen moves nothing');
    sellDeal(c.g, card(c, 2, 'stall-dolores'), 'stall-dolores', { pitch: 'best', close: 'careful' }); assert.ok(c.won, 'm04 by hand'); }
  // m04 a cool Pitch with the best Close there is does not win, and the step is done anyway (the haggle came), so the retry is just another sale: Dolores is gone, the
  // barter records and the busker are what is left, as the stranded test below says
  { const m = M('m04'), c = play(m, [(c) => ui0(c, 'market')]);
    sellDeal(c.g, c.g.s.assets[0].id, 'stall-collector', { pitch: 'quick', close: 'careless' });
    sellDeal(c.g, c.g.s.assets[0].id, 'stall-dolores', { pitch: ['prestige', 'price'], close: 'careful' });
    assert.equal(c.i, 3); assert.equal(c.won, false, 'x0.94 keen: not 10% over fair'); assert.ok(stillPossible(m, c.g, c.i), 'a sale of the records to the busker is still on offer'); }
  // m05: Fix by hand (from Stock's Repair button, or from the van's own row) then sell by hand
  { const m = M('m05'), c = play(m, [(c) => ui0(c, 'quests'), (c) => ui0(c, 'stock')]);
    fixDeal(c.g, idOf(c.g, 'van')); assert.equal(c.i, 3); ui0(c, 'market'); sellDeal(c.g, idOf(c.g, 'van'), 'fleet-buyer', { pitch: 'best', close: 'careful' }); assert.ok(c.won, 'm05 by hand'); }
  // m06: hiring through the Crew drawer's button or by tapping the plot is the same hire
  { const m = M('m06'), c = play(m, [(c) => click(c, 'hud-cash'), (c) => ui0(c, 'crew')]);
    assert.ok(c.g.hirePipeline('student', 5, { cls: 'laptops', buyer: 'trainer' }).ok); assert.equal(c.i, 3); click(c, 'hud-clock'); for (let i = 0; i < 80 && !c.won; i++) c.g.stepHour(); assert.ok(c.won, 'm06'); }
  // m10: Quick all the way through (the Bid stage, the Fix stage and the dealer): lot A goes to a rival, lot D to Quick's cautious bid, and no step is skipped
  { const m = M('m10'), c = lesson(m);
    for (const id of ['estate-lot-a', 'estate-lot-d']) { const run = buyRun(c.g, 6, id); run.quickAll(); run.finish(); }
    assert.equal(c.g.s.assets.length, 1, 'Quick loses lot A to the loud rival and wins lot D'); assert.equal(c.i, 2, 'the read and the auction both count');
    const f = fixRun(c.g, idOf(c.g, 'antiqueFurniture')); f.quickAll(); f.finish(); assert.equal(c.i, 3, 'the Fix step is done after Quick');
    click(c, 'hud-networth'); assert.equal(c.i, 4, 'looking at the net worth is the score step');
    click(c, 'deal-room'); assert.equal(c.i, 4, 'a stray click in a Deal Room is not the sale');
    sellDeal(c.g, idOf(c.g, 'antiqueFurniture'), 'antique-dealer'); assert.ok(c.won, 'm10 Quick on the dealer'); }
});

test('mistakes no data can undo are caught by the reference check a runner needs, and the recoverable ones are not', () => {
  const stuck = (id, from, mistake) => { const m = M(id), g = sandbox(m); assert.ok(stillPossible(m, g, from), `${id}: the start is fine`); mistake(g); return stillPossible(m, g, from); };
  const at = (id, stepId) => M(id).steps.findIndex((s) => s.id === stepId);
  // m01: the one clip sold to a decoy is gone; walking away from Wen keeps it. The same goes for a sale made BEFORE the coach reaches the step (by the Market card, say): the
  // step now hears it, but if it went to the mechanic or the barista the clip is gone all the same, and only a restart helps.
  assert.equal(stuck('m01', at('m01', 'student'), (g) => sellDeal(g, idOf(g, 'paperclip'), 'yard-mechanic')), false, 'm01: the clip went to the mechanic');
  assert.equal(stuck('m01', at('m01', 'student'), (g) => sellDeal(g, idOf(g, 'paperclip'), 'cafe-barista')), false, 'm01: the clip went to the barista');
  assert.equal(stuck('m01', at('m01', 'student'), (g) => sellRun(g, idOf(g, 'paperclip'), 'sim-student').walkAway()), true, 'm01: walking away keeps the clip');
  // m03: a pin set sold to the wrong buyer leaves nothing for the bookstore buyer; selling to Delphine first leaves Bree's step without a win to finish on
  assert.equal(stuck('m03', at('m03', 'delphine'), (g) => { sellDeal(g, g.s.assets[0].id, 'dorm-ra'); sellDeal(g, g.s.assets[0].id, 'thrift-flipper'); }), false, 'm03: both pin sets gone');
  assert.equal(stuck('m03', at('m03', 'delphine'), (g) => sellDeal(g, g.s.assets[0].id, 'thrift-flipper')), true, 'm03: one set sold to Bree is the plan');
  assert.equal(stuck('m03', at('m03', 'bree'), (g) => sellDeal(g, g.s.assets[0].id, 'bookstore-buyer')), false, 'm03: Delphine first leaves the win with no buyer');
  // m04: both radios sold is NOT the end: the buyers paid part in goods (the barter ladder), and the busker still buys those, so a haggle is still on offer
  assert.equal(stuck('m04', at('m04', 'careful'), (g) => { sellDeal(g, g.s.assets[0].id, 'stall-collector'); sellDeal(g, g.s.assets[0].id, 'stall-dolores'); }), true, 'm04: the barter goods are still to sell');
  // m05: the broken van sold before the fix, or fixed before its step
  assert.equal(stuck('m05', at('m05', 'repair'), (g) => sellDeal(g, idOf(g, 'van'), 'fleet-buyer')), false, 'm05: the van went broken');
  assert.equal(stuck('m05', at('m05', 'quests'), (g) => fixDeal(g, idOf(g, 'van'))), false, 'm05: the van was fixed before the coach asked');
  // m07 and m09: the clock tapped before its step spends the scripted shock early (the coach now says "do not pause yet" and "watch the ticker", so a literal follower waits)
  assert.equal(stuck('m07', at('m07', 'draw'), (g) => g.advanceTo(8)), false, 'm07: the glut fired before the player reached it');
  assert.equal(stuck('m09', at('m09', 'travel'), (g) => g.advanceTo(30)), false, 'm09: the craze fired before the player reached it');
  assert.equal(stuck('m07', at('m07', 'draw'), (g) => g.advanceTo(3)), true, 'm07: three hours of clock spend nothing');
  assert.equal(stuck('m09', at('m09', 'travel'), (g) => g.advanceTo(11)), true, 'm09: eleven hours are before the warning and the craze, so nothing is spent');
  // m08: the stall first and the boutique second leaves no sneakers for the stall's S check
  assert.equal(stuck('m08', at('m08', 'popup'), (g) => { sellDeal(g, g.s.assets[0].id, 'popup-stall'); sellDeal(g, g.s.assets[0].id, 'trend-boutique'); }), false, 'm08: both lots sold');
  // m10: the three lots clear at $618, $428 and $380, so a player who is outbid on one is not stranded, nor on two; only losing all three leaves nothing to win
  const lose = (...ids) => (g) => { for (const id of ids) auctionDeal(g, 6, id, { ceiling: 100 }); };
  assert.equal(stuck('m10', at('m10', 'auction'), lose('estate-lot-a')), true, 'm10: one lot lost still leaves two');
  assert.equal(stuck('m10', at('m10', 'auction'), lose('estate-lot-a', 'estate-lot-d')), true, 'm10: two lots lost still leave the third');
  assert.equal(stuck('m10', at('m10', 'auction'), lose('estate-lot-a', 'estate-lot-d', 'estate-lot-h')), false, 'm10: all three lost');
});
