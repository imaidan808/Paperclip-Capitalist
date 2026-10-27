// The Academy (js/meta/academy.js): shape, limits, reachability and the numbers behind every lesson.
// Run: node --test tests/meta-academy.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { ACADEMY } from '../js/meta/academy.js';
import { REQUIRED_CODEX, DOCK_IDS, EVENT_TYPES, EVENT_PAYLOAD, BACKGROUND_IDS } from '../js/meta/ids.js';
import { matchEvent } from '../js/meta/match.js';
import { TAGS, KEEP_ASSETS, KEEP_BUYERS, ZONE_COUNT, demandOf, fitTags } from '../js/data/schema.js';

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

// ---------------------------------------------------------------------------------------------------------------------------------------
// The reference economy the lessons are written against (js/config.js and js/market.js at the contract commit, docs/BALANCE.md).
// If the engine refactor retunes any of these, the numbers in academy.js must be revisited; these tests will say which.
const REF = { cmMin: 0.4, cmMax: 3.14, beta: 0.4, pitchBase: 0.6, maxDE: 3.0, callDE: 4.5, brokenFactor: 0.3, loanFee: 0.03, eeiFloor: 1000, totalDays: 90 };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const saturation = (vN, vT) => Math.min(1, vN / (vT + 1e-9));
const cmRaw = (vN, vT) => (REF.beta + Math.log((vT + 2) / (vN + 1))) * (1 - saturation(vN, vT));
const cm = (vN, vT) => clamp(cmRaw(vN, vT), REF.cmMin, REF.cmMax);
const fitTerm = (fit) => 0.4 + 0.95 * fit;
const urgentTerm = (fit) => 0.55 + 0.45 * fit;
const offer = (ref, term, cmv) => ref * term * REF.pitchBase * cmv;
const priceIndex = (u) => 0.5 + clamp(u, 0, 200) / 100;
const restoreQuality = (ops) => 0.5 + 0.5 * Math.min(1, (ops - 1) / 4);
const repairCost = (base, ops, mult = 1) => base * Math.pow(0.42, ops - 1) * mult;
const eei = (nw, start, daysLeft) => (nw / Math.max(start, REF.eeiFloor)) * (1 + daysLeft / REF.totalDays);
const usd = (x, d = 2) => '$' + x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const near = (a, b, eps = 0.006) => Math.abs(a - b) <= eps;
const mentions = (m, ...bits) => { const t = text(m.why); for (const b of bits) assert.ok(t.includes(b), `${m.id}: the worked example must say "${b}"`); };

// ---------------------------------------------------------------------------------------------------------------------------------------
const ANCHORS = ['hud-cash', 'hud-networth', 'hud-day', 'hud-clock', 'player-card', 'tracker', 'ticker', 'dock-stock', 'dock-market', 'dock-crew', 'dock-bank', 'dock-travel', 'dock-codex',
  'dock-quests', 'world', 'drawer', 'deal-room', 'deal-stage-read', 'deal-stage-pitch', 'deal-stage-close', 'deal-quick'];
const OUTCOMES = ['win', 'pioneer', 'herd', 'flat', 'rejected'];
const SHOCK_KINDS = ['tiktok', 'fed', 'tariff', 'viral', 'glut', 'scare'];
const AUCTION_ZONES = [4, 6]; // docs/V2_DESIGN.md 4.1: rules.auction lives in Pawn District and Estate Sales
const MISSION_KEYS = ['id', 'title', 'icon', 'zone', 'concept', 'minutes', 'intro', 'setup', 'steps', 'win', 'why', 'teachBack', 'reward'];
const SETUP_KEYS = ['clock', 'assets', 'leads', 'lots', 'cash', 'zones', 'features', 'skills', 'perks', 'cohort', 'events'];
const parseAnchor = (a) => { const m = /^world:(lead|lot|asset|plot|static):(.+)$/.exec(a); return m ? { kind: m[1], ref: m[2] } : null; };
const rolesOf = (m) => ({
  leads: new Set(m.setup.leads.map((l) => l.id)), lots: new Set(m.setup.lots.map((l) => l.id)),
  assets: new Set([...m.setup.assets.map((a) => a.cls), ...m.setup.lots.map((l) => l.cls)]), // a won lot becomes an asset of its class
});
const stepsOf = (m) => m.steps.map((s, i) => ({ ...s, i }));

test('exactly ten missions m01..m10, in the order of section 9', () => {
  assert.ok(Array.isArray(ACADEMY));
  assert.deepEqual(ACADEMY.map((m) => m.id), ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10']);
  assert.equal(new Set(ACADEMY.map((m) => m.title)).size, 10, 'titles are distinct');
  assert.deepEqual(ACADEMY.map((m) => m.title), ['First Swap', 'Read the Room', 'Know Your Buyer', 'Haggle 101', 'Fix It', 'Cash Is Not Sleeping', "Other People's Money", "Don't Follow the Herd", 'Storm Warning', 'Deal Day']);
});

test('mission fields, types and limits', () => {
  for (const m of ACADEMY) {
    keysOf(m, MISSION_KEYS, m.id);
    for (const k of MISSION_KEYS) assert.ok(k in m, `${m.id}: missing ${k}`);
    assert.ok(isStr(m.title) && m.title.length <= 40, `${m.id}: title`);
    assert.ok(isStr(m.icon) && [...m.icon].length <= 3, `${m.id}: icon is a single emoji`);
    assert.ok(isInt(m.zone) && m.zone >= 1 && m.zone <= ZONE_COUNT, `${m.id}: zone 1..16`);
    assert.ok(REQUIRED_CODEX.includes(m.concept), `${m.id}: concept "${m.concept}" is not a required codex id`);
    assert.ok(isNum(m.minutes) && m.minutes >= 1.5 && m.minutes <= 2.5, `${m.id}: minutes must keep a mission at 90-150 seconds`);
    assert.ok(isStr(m.intro) && m.intro.length >= 80 && m.intro.length <= 260, `${m.id}: intro is a scene of 80..260 characters (has ${m.intro.length})`);
  }
  assert.equal(new Set(ACADEMY.map((m) => m.concept)).size, 10, 'ten different concepts');
  assert.ok(ACADEMY.map((m) => m.zone).every((z, i, a) => new Set(a).size >= 7), 'the missions visit at least seven different districts');
});

test('setup is well formed and gives the sandbox everything it needs', () => {
  for (const m of ACADEMY) {
    const s = m.setup, w = `${m.id} setup`;
    keysOf(s, SETUP_KEYS, w);
    assert.ok(['paused', 'running'].includes(s.clock), `${w}: clock`);
    assert.ok(Array.isArray(s.assets) && Array.isArray(s.leads) && Array.isArray(s.lots) && Array.isArray(s.zones) && Array.isArray(s.features), `${w}: arrays`);
    if (s.cash != null) assert.ok(isNum(s.cash) && s.cash >= 0 && s.cash < 1e7, `${w}: cash`);
    for (const a of s.assets) {
      keysOf(a, ['cls', 'cond', 'quality'], `${w} asset`);
      assert.ok(KEEP_ASSETS.includes(a.cls), `${w}: asset class "${a.cls}" must be one of the v1 ids every tier keeps`);
      if (a.cond != null) assert.ok(['ok', 'broken'].includes(a.cond), `${w}: asset cond`);
      if (a.quality != null) assert.ok(isNum(a.quality) && a.quality > 0 && a.quality <= 1.5, `${w}: asset quality`);
    }
    for (const l of s.leads) {
      keysOf(l, ['id', 'seg', 'budget', 'need'], `${w} lead`);
      assert.ok(/^[a-z][a-z0-9-]*$/.test(l.id), `${w}: lead id "${l.id}" is kebab-case`);
      assert.ok(KEEP_BUYERS.includes(l.seg), `${w}: lead segment "${l.seg}" must be one of the v1 buyer ids every tier keeps`);
      assert.ok(isNum(l.budget) && l.budget > 0, `${w}: lead budget`);
      if (l.need != null) assert.ok(TAGS.includes(l.need), `${w}: need "${l.need}" is not a tag`);
    }
    for (const l of s.lots) {
      keysOf(l, ['id', 'cls', 'cond', 'price', 'truth', 'auction'], `${w} lot`);
      assert.ok(/^[a-z][a-z0-9-]*$/.test(l.id), `${w}: lot id "${l.id}" is kebab-case`);
      assert.ok(KEEP_ASSETS.includes(l.cls), `${w}: lot class "${l.cls}"`);
      assert.ok(['ok', 'broken'].includes(l.cond), `${w}: lot cond`);
      assert.ok(isNum(l.price) && l.price > 0, `${w}: lot price`);
      if (l.auction != null) assert.equal(typeof l.auction, 'boolean', `${w}: lot.auction`);
      if (l.truth != null) { keysOf(l.truth, ['quality', 'fake'], `${w} truth`); assert.ok(isNum(l.truth.quality) && l.truth.quality >= 0 && l.truth.quality <= 1.5 && typeof l.truth.fake === 'boolean', `${w}: truth`); }
    }
    const ids = [...s.leads.map((l) => l.id), ...s.lots.map((l) => l.id)];
    assert.equal(new Set(ids).size, ids.length, `${w}: lead and lot ids are unique`);
    assert.ok(s.zones.length >= 1 && s.zones.every((z) => isInt(z) && z >= 1 && z <= ZONE_COUNT) && new Set(s.zones).size === s.zones.length, `${w}: zones`);
    assert.deepEqual([...s.zones].sort((a, b) => a - b), s.zones, `${w}: zones are sorted`);
    assert.ok(s.zones.includes(m.zone), `${w}: the mission's own district must be unlocked`);
    assert.ok(s.features.length >= 2 && s.features.every((f) => DOCK_IDS.includes(f)) && new Set(s.features).size === s.features.length, `${w}: features are dock ids`);
    if (s.skills) { keysOf(s.skills, ['ops', 'growth', 'fintech'], `${w} skills`); assert.ok(Object.values(s.skills).every((v) => isInt(v) && v >= 1 && v <= 8), `${w}: skills 1..8`); }
    if (s.perks) assert.ok(s.perks.length <= 2 && s.perks.every((p) => BACKGROUND_IDS.includes(p)), `${w}: perks are Background ids`);
    if (s.cohort) { keysOf(s.cohort, ['ghosts'], `${w} cohort`); assert.ok(isInt(s.cohort.ghosts) && s.cohort.ghosts >= 0 && s.cohort.ghosts <= 200, `${w}: ghosts`); }
    for (const e of s.events || []) {
      keysOf(e, ['kind', 'atHour', 'cls'], `${w} event`);
      assert.ok(SHOCK_KINDS.includes(e.kind) && isInt(e.atHour) && e.atHour >= 1 && e.atHour <= 96, `${w}: event kind and hour`);
      if (e.cls != null) assert.ok(KEEP_ASSETS.includes(e.cls), `${w}: event class`);
    }
    // the scripted sandbox must be playable on its own: something to sell, buy or do
    assert.ok(s.assets.length + s.lots.length > 0 || s.cash > 0, `${w}: the player needs a stake`);
  }
});

test('mission 1 is the promise of the whole game: one paperclip, no money', () => {
  const s = M('m01').setup;
  assert.deepEqual(s.assets, [{ cls: 'paperclip' }]);
  assert.ok(!s.cash, 'cash is zero');
  assert.deepEqual(s.features, ['stock', 'market'], 'only the Stock and Market icons');
  assert.equal(s.leads.filter((l) => l.need).length, 1, 'exactly one urgent buyer');
  const urgent = s.leads.find((l) => l.need);
  assert.ok(s.leads.some((l) => l.budget > urgent.budget), 'a bigger budget is on offer, so the lesson is a real choice');
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
      assert.ok(isStr(s.hint) && s.hint.length >= 20 && s.hint.length <= 200 && s.hint !== s.say, `${w}: hint is 20..200 characters and says something new`);
      // anchors
      const pa = parseAnchor(s.anchor);
      if (pa) {
        if (pa.kind === 'lead') assert.ok(who.leads.has(pa.ref), `${w}: anchor lead "${pa.ref}" is not in the setup`);
        if (pa.kind === 'lot') assert.ok(who.lots.has(pa.ref), `${w}: anchor lot "${pa.ref}" is not in the setup`);
        if (pa.kind === 'asset') assert.ok(who.assets.has(pa.ref), `${w}: anchor asset "${pa.ref}" is not in the setup`);
        if (pa.kind === 'plot') { assert.ok(/^[1-4]$/.test(pa.ref) && m.zone >= 5, `${w}: plots are 1..4 and exist from district 5`); }
        if (pa.kind === 'static') assert.ok(/^[a-z][a-z0-9-]*$/.test(pa.ref), `${w}: static id`);
      } else {
        assert.ok(ANCHORS.includes(s.anchor), `${w}: unknown anchor "${s.anchor}"`);
        if (s.anchor.startsWith('dock-')) assert.ok(m.setup.features.includes(s.anchor.slice(5)), `${w}: points at a dock icon that is not visible yet`);
        if (s.anchor === 'drawer') assert.ok(drawerSeen, `${w}: "drawer" needs a drawer opened by an earlier step`);
        if (s.anchor.startsWith('deal-')) assert.ok(dealSeen, `${w}: "${s.anchor}" needs a Deal Room opened by an earlier step`);
        if (s.anchor === 'hud-clock' || s.anchor === 'ticker') assert.ok(true);
      }
      // waits
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
    if (['fake', 'caught', 'deal', 'won'].includes(k)) assert.equal(typeof v, 'boolean', `${w}: ${k} is a boolean`);
    if (k === 'zone') for (const x of vals) assert.ok(m.setup.zones.includes(x), `${w}: zone`);
  }
}

/** Can the player make this event happen with what the setup gives them? */
function reachable(m, event) {
  const s = m.setup, has = (f) => s.features.includes(f), heldBroken = s.assets.some((a) => a.cond === 'broken') || s.lots.some((l) => l.cond === 'broken');
  switch (event) {
    case 'pitch': return s.leads.length > 0 && (s.assets.length > 0 || s.lots.length > 0);
    case 'buy': return s.lots.length > 0;
    case 'inspect': return s.lots.some((l) => l.truth);
    case 'haggle': return s.leads.length > 0 || s.lots.length > 0;
    case 'auction': return s.lots.some((l) => l.auction) || AUCTION_ZONES.includes(m.zone);
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
  }
});

/** Build an event that satisfies a match (the cheapest honest player). */
function synth(event, match = {}) {
  const evt = { type: event, day: 1 };
  for (const [k, v] of Object.entries(match)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      if ('eq' in v) evt[k] = v.eq; else if ('in' in v) evt[k] = v.in[0];
      else evt[k] = v.gte ?? v.lte ?? (v.gt != null ? v.gt + 0.5 : v.lt != null ? v.lt - 0.001 : 0);
    } else evt[k] = v;
  }
  return evt;
}

test('a scripted perfect player completes every mission: each wait and the win are satisfiable, and the win comes after the last step', () => {
  for (const m of ACADEMY) {
    let done = 0;
    const log = [];
    for (const s of m.steps) {
      if (s.wait.type === 'event') { const e = synth(s.wait.event, s.wait.match); assert.ok(matchEvent(s.wait.match, e), `${m.id}/${s.id}: wait is satisfiable`); log.push(e); }
      done++;
    }
    assert.equal(done, m.steps.length);
    const win = synth(m.win.event, m.win.match);
    assert.ok(matchEvent(m.win.match, win), `${m.id}: the win match is satisfiable`);
    const last = m.steps[m.steps.length - 1];
    // the contract says the mission completes when the win event arrives after the last step. A win that is the very event the last step waits on
    // would be consumed by that step and never seen again by a runner that waits for it afterwards, so it must be a different, later event.
    assert.ok(!(last.wait.type === 'event' && last.wait.event === m.win.event), `${m.id}: the win event "${m.win.event}" is also the last step's wait; make the last step a click on the control that causes it`);
    // and no earlier event wait may already be the win (it would fire before the mission is over)
    for (const s of m.steps.slice(0, -1)) if (s.wait.type === 'event' && s.wait.event === m.win.event) {
      const e = synth(s.wait.event, s.wait.match);
      assert.ok(!matchEvent(m.win.match, e), `${m.id}/${s.id}: an earlier step's own event already satisfies the win`);
    }
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
    assert.ok(isStr(y.formula) && y.formula.length <= 220, `${w}: formula`);
    keysOf(y.example, ['setup', 'steps', 'result'], `${w} example`);
    assert.ok(isStr(y.example.setup) && y.example.setup.length <= 360, `${w}: example setup`);
    assert.ok(Array.isArray(y.example.steps) && y.example.steps.length >= 2 && y.example.steps.length <= 5, `${w}: 2-5 example steps`);
    for (const st of y.example.steps) assert.ok(isStr(st) && st.length <= 260 && /\d/.test(st), `${w}: each example step is short and has numbers: ${st}`);
    assert.ok(isStr(y.example.result) && y.example.result.length <= 300 && /\d/.test(y.example.result), `${w}: result`);
    assert.ok(!/\bTODO\b|\bTBD\b|lorem/i.test(text(y)), `${w}: placeholders`);
  }
});

test('teach-back: three options, exactly one correct, a reason on every option, answers not always in the same place', () => {
  const pos = [];
  let longest = 0, shortest = 0;
  for (const m of ACADEMY) {
    const t = m.teachBack, w = `${m.id} teachBack`;
    keysOf(t, ['q', 'options'], w);
    assert.ok(isStr(t.q) && t.q.length >= 20 && t.q.length <= 200, `${w}: question`);
    assert.equal(t.options.length, 3, `${w}: exactly 3 options`);
    assert.equal(t.options.filter((o) => o.correct === true).length, 1, `${w}: exactly 1 correct`);
    assert.ok(t.options.every((o) => typeof o.correct === 'boolean'), `${w}: correct is a boolean`);
    for (const o of t.options) {
      keysOf(o, ['text', 'correct', 'why'], `${w} option`);
      assert.ok(isStr(o.text) && o.text.length >= 15 && o.text.length <= 160, `${w}: option text (${o.text.length})`);
      assert.ok(isStr(o.why) && o.why.length >= 30 && o.why.length <= 260, `${w}: every option has a reason (${o.why.length})`);
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
  for (const m of ACADEMY) {
    const r = m.reward, w = `${m.id} reward`;
    keysOf(r, ['xp', 'codex', 'points'], w);
    assert.ok(isInt(r.xp) && r.xp >= 50 && r.xp <= 600, `${w}: xp`);
    assert.ok(r.xp >= prev, `${w}: xp never drops from one mission to the next`);
    prev = r.xp;
    assert.ok(Array.isArray(r.codex) && r.codex.length >= 1 && r.codex.length <= 4 && new Set(r.codex).size === r.codex.length, `${w}: 1-4 distinct codex ids`);
    for (const id of r.codex) assert.ok(REQUIRED_CODEX.includes(id), `${w}: "${id}" is not a required codex id`);
    assert.ok(r.codex.includes(m.concept), `${w}: unlocks its own concept`);
    if (r.points != null) { assert.equal(r.points, 1, `${w}: points is 1 when present`); points++; }
  }
  assert.ok(points >= 4 && points <= 6, `skill points are rare (${points})`);
  assert.ok(ACADEMY.find((m) => m.id === 'm10').reward.xp >= 300, 'graduation pays the most');
  const all = new Set(ACADEMY.flatMap((m) => m.reward.codex));
  for (const id of ['utility-fit', 'information-asymmetry', 'persona-fit', 'anchoring', 'batna-zopa', 'repair-roi', 'working-capital', 'debt-to-equity', 'margin-call', 'creativity-multiplier', 'demand-shock', 'diversification', 'hedging', 'eei-score'])
    assert.ok(all.has(id), `the Academy unlocks "${id}"`);
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
  // A first-time player, playing most stages by hand. Quick is always allowed, so a hurried player is faster.
  const EV = { pitch: 14, buy: 12, inspect: 18, auction: 22, repair: 22, haggle: 30, hire: 14, draw: 10, repay: 8, shock: 8, 'sell-pool': 12, cycle: 14 };
  const CLICK = { 'deal-quick': 8, 'deal-room': 6, 'deal-stage-pitch': 14, 'deal-stage-close': 22, 'deal-stage-read': 12 };
  const WIN = { pitch: 6, buy: 4, haggle: 20, cycle: 14, repay: 8, 'sell-pool': 12 }; // the work between the last click and the win event
  const act = (w) => (w.type === 'ui' ? 5 : w.type === 'click' ? CLICK[w.anchor] ?? (w.anchor.startsWith('world:') ? 6 : 4) : EV[w.event] ?? 15);
  for (const m of ACADEMY) {
    const play = m.steps.reduce((t, s) => t + 2 + s.say.length / 28 + act(s.wait), 0) + (WIN[m.win.event] ?? 10);
    const total = play + 30;
    const cap = m.id === 'm10' ? 165 : 150; // the capstone plays five games in one scene; Quick on any stage brings it back under 150
    assert.ok(total >= 90 && total <= cap, `${m.id}: about ${Math.round(total)} seconds in all (${Math.round(play)} of play); aim for 90..${cap}`);
    assert.ok(Math.abs(m.minutes * 60 - total) <= 30, `${m.id}: minutes (${m.minutes}) should be near the estimate (${Math.round(total)} s)`);
  }
});

const DASH = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']'); // built from char codes so this file holds no dash itself

test('voice: no em dashes (or en dashes) anywhere, no double spaces, no stray markup, no emoji in prose', () => {
  for (const m of ACADEMY) for (const [p, s] of strings(m)) {
    assert.ok(!DASH.test(s), `${m.id}${p}: has an em or en dash`);
    assert.ok(!/ {2}|\s$|^\s/.test(s), `${m.id}${p}: stray whitespace`);
    assert.ok(!/<[a-z/][^>]*>|\*\*|`/.test(s), `${m.id}${p}: markup in a plain string`);
    if (!p.endsWith('.icon')) assert.ok(!/\p{Extended_Pictographic}/u.test(s), `${m.id}${p}: emoji in prose`);
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------------
// The numbers behind each lesson. Each test recomputes the worked example from the formulas and checks it against the setup (so the sandbox
// makes the lesson visible) and against the text (so the card says what the formulas say).
test('m01: need beats budget by a mile, and the first swap earns the first dollar', () => {
  const m = M('m01'), cm0 = cm(0, 0);
  assert.ok(near(cm0, 0.4 + Math.log(2), 1e-9) && near(cm0, 1.09, 0.005), 'with nobody pitching, Cm = 0.40 + ln 2');
  const L = Object.fromEntries(m.setup.leads.map((l) => [l.id, l]));
  const student = offer(L['sim-student'].budget, urgentTerm(1), cm0), barista = offer(0.05, fitTerm(0.5), cm0), mechanic = offer(0.05, fitTerm(0.2), cm0);
  assert.ok(near(student, 2.62) && near(barista, 0.03, 0.005) && near(mechanic, 0.02, 0.005), `offers ${student.toFixed(4)} ${barista.toFixed(4)} ${mechanic.toFixed(4)}`);
  assert.ok(student / barista >= 50 && student / mechanic >= 50, 'the urgent offer is worth at least fifty times the others');
  assert.ok(student * 0.85 >= m.win.match.price.gte, 'even the weakest pitch (x0.85) still earns the first dollar');
  assert.ok(L['yard-mechanic'].budget > L['sim-student'].budget && L['cafe-barista'].budget >= L['sim-student'].budget, 'both decoys have the bigger wallet');
  mentions(m, '$2.62', '$0.03', '$0.02', '1.09', '0.875', '0.59', 'about 90 times');
  assert.ok(near(student / barista, 91.4, 0.5), 'about 90 times');
});

test('m02: information has a price, and the cheap radio is the trap', () => {
  const m = M('m02'), lots = m.setup.lots, fair = 60;
  const fakes = lots.filter((l) => l.truth.fake);
  assert.equal(fakes.length, 1, 'exactly one counterfeit');
  const radios = lots.filter((l) => l.cls === 'radio');
  assert.ok(fakes[0].price === Math.min(...lots.map((l) => l.price)) || fakes[0].price <= 0.6 * Math.min(...radios.filter((l) => !l.truth.fake).map((l) => l.price)), 'the fake is the bargain');
  assert.ok(fakes[0].price / fair <= 0.45, 'priced under 45% of value');
  const honest = lots.find((l) => l.id === 'honest-radio');
  assert.ok(honest.price / fair >= 0.7 && honest.price / fair <= 0.8, 'the honest radio is at a normal lot discount (70-80% of value)');
  assert.ok(m.setup.cash >= lots.reduce((t, l) => t + l.price, 0), 'a mistake never bricks the sandbox: cash covers every lot');
  assert.ok(m.setup.skills.ops >= 2, 'enough Ops for a few probes');
  const blind = 0.5 * fair - fakes[0].price, checked = 0.5 * (fair - fakes[0].price);
  assert.equal(blind, 6); assert.equal(checked, 18); assert.equal(checked - blind, 0.5 * fakes[0].price);
  const blind2 = 0.78 * fair - honest.price, checked2 = 0.78 * (fair - honest.price);
  assert.ok(near(blind2, 0.8) && near(checked2, 10.92) && near(checked2 - blind2, 0.22 * honest.price));
  mentions(m, '$6.00', '$18.00', '$12', '+$0.80', '+$10.92', '$10.12', '22%');
});

test('m03: fit gets the deal, distance from the crowd sets the price', () => {
  const m = M('m03');
  assert.ok(m.setup.perks.includes('grad') && m.setup.cohort.ghosts >= 20, 'a borrowed Niche Radar and a real crowd');
  assert.equal(m.setup.assets.filter((a) => a.cls === 'pen').length, 2, 'two pens: one for the crowd, one for the quiet buyer');
  assert.ok(['student', 'collector'].every((s) => m.setup.leads.some((l) => l.seg === s)));
  assert.ok(near(fitTerm(0.5), 0.875, 1e-9) && near(fitTerm(0.7), 1.065, 1e-9));
  assert.ok(near(fitTerm(0.7) / fitTerm(0.5) - 1, 0.22, 0.006), 'a +0.20 pitch is worth about 22%');
  assert.ok(cmRaw(14, 20) < REF.cmMin && cm(14, 20) === REF.cmMin && near(saturation(14, 20), 0.7), 'the crowded student sits on the floor');
  assert.ok(near(cm(2, 20), 2.15, 0.005) && near(saturation(2, 20), 0.1), 'the quiet collector');
  assert.ok(near(cm(2, 20) / cm(14, 20), 5.4, 0.05));
  mentions(m, '0.875', '1.065', '22%', '0.70', '0.23', '0.10', '2.15', '5.4 times');
});

test('m04: the first number is worth money, and an alternative makes walking away real', () => {
  const m = M('m04'), fair = 9;
  assert.equal(m.zone, 2, 'Flea Market Row, where every deal can be haggled');
  assert.ok(m.setup.assets.length === 2 && m.setup.leads.length >= 3, 'two pens and a third buyer left over as the alternative');
  assert.ok(m.setup.skills.growth >= 2, 'a fuzzy read of the reserve price (Growth)');
  const careless = (fair + 7) / 2, bold = (13 + 7) / 2;
  assert.equal(careless, 8); assert.equal(bold, 10);
  assert.ok(near(careless / fair, 0.89, 0.005) && near(bold / fair, 1.11, 0.005));
  assert.ok(near((bold - careless) / fair, 0.22, 0.005), 'the anchor alone moved the price by 22% of fair');
  assert.ok(9.5 > 6 && 9.5 < 12, 'the barista alternative sits inside the zone of possible agreement');
  assert.equal(m.win.match.mult.gte, 1, 'the win is selling at or above fair');
  mentions(m, '$8.00', '0.89', '$10.00', '1.11', '$2.00', '22%', '$9.50');
});

test('m05: the same repair is a loss at Ops 1 and a windfall at Ops 2, even with a bad dial', () => {
  const m = M('m05'), working = 5000 * priceIndex(5 * 8 - 3), broken = working * REF.brokenFactor, auto = 0.75;
  assert.ok(near(working, 4350, 1e-6) && near(broken, 1305, 1e-6));
  const at = (ops, qm = 1, cmu = 1) => { const cost = repairCost(1200, ops, auto) * cmu, after = working * restoreQuality(ops) * qm, net = after - broken - cost; return { cost, after, net, roi: net / cost }; };
  const o1 = at(1), o2 = at(2), o3 = at(3), best = at(2, 1.15, 0.9), worst = at(2, 0.85, 1.3);
  assert.ok(near(o1.net, -30, 0.01) && near(o1.roi, -0.033, 0.001), 'Ops 1 loses $30');
  assert.ok(near(o2.cost, 378, 0.01) && near(o2.after, 2718.75, 0.01) && near(o2.net, 1035.75, 0.01) && near(o2.roi, 2.74, 0.005), 'Ops 2');
  assert.ok(near(o3.cost, 158.76, 0.01) && near(o3.net, 1798.74, 0.01) && near(o3.roi, 11.33, 0.01), 'Ops 3');
  assert.ok(near(best.net, 1481.36, 0.01) && near(worst.net, 514.54, 0.01) && worst.net > 0, 'even the worst dial pays at Ops 2');
  assert.equal(m.setup.skills.ops, 2, 'the sandbox runs at Ops 2');
  const van = m.setup.assets[0];
  assert.deepEqual([van.cls, van.cond], ['van', 'broken']);
  assert.ok(m.setup.cash >= worst.cost, 'cash covers the worst dial');
  assert.ok(offer(working * restoreQuality(2), fitTerm(1), cm(0, 0)) < m.setup.leads[0].budget, 'the buyer can afford the repaired van');
  mentions(m, '$900', '$870', '-$30', '-3%', '$378', '$2,719', '$1,414', '$1,036', '274%', '$159', '$3,263', '$1,799', '1,133%', '$515', '$1,481');
});

test('m06: the fee and the fuel both come out of the wallet, and velocity beats size', () => {
  const m = M('m06'), cash = m.setup.cash;
  assert.equal(cash, 620);
  assert.ok(cash - 600 < 450 && cash - 600 === 20, 'the Broker leaves $20: starved');
  assert.ok(cash - 120 >= 450, 'the Student manager leaves enough to feed its full allocation');
  assert.ok(m.zone >= 5 && m.setup.features.includes('crew') && m.setup.clock === 'paused');
  assert.ok(near(450 * 0.02, 9) && near(450 * 1.02 ** 30, 815.11, 0.01) && near(450 * 1.1 * 1.1, 544.5, 1e-9));
  assert.ok(450 * 1.02 ** 30 > 450 * 1.1 * 1.1 && 450 * 1.1 * 1.1 > 450);
  mentions(m, '$20', '$500', '$9.00', '$815', '$544.50', '$450');
});

test('m07: the same 25% drop leaves one loan at D/E 1.7 and the other a hair from a margin call', () => {
  const m = M('m07'), E = m.setup.cash, price = m.setup.lots[0].price, fmv = 416, drop = 0.25;
  assert.ok(m.setup.lots.length === 4 && m.setup.lots.every((l) => l.price === price && l.cls === 'sneakers'));
  assert.ok(price / fmv <= 0.8 && price / fmv >= 0.78, 'a lot discount of about a fifth');
  assert.ok(E >= price && E < 2 * price, 'cash buys one lot, not two');
  const lev = (loan, lots, d) => { const fee = REF.loanFee * loan, cash = E + loan - fee - lots * price, hold = lots * fmv * (1 - d), nw = cash + hold - loan; return { fee, cash, hold, nw, de: loan / nw }; };
  const safe0 = lev(600, 2, 0), safe1 = lev(600, 2, drop), max0 = lev(1200, 4, 0), max1 = lev(1200, 4, drop);
  assert.ok(near(safe0.nw, 554, 1e-9) && near(safe0.de, 1.08, 0.005) && near(safe1.nw, 346, 1e-9) && near(safe1.de, 1.73, 0.005));
  assert.ok(near(max0.nw, 708, 1e-9) && near(max0.de, 1.69, 0.005) && near(max1.nw, 292, 1e-9) && near(max1.de, 4.11, 0.005));
  assert.ok(max1.de < REF.callDE && REF.callDE - max1.de > 0.38 && REF.callDE - max1.de < 0.4, '0.39 from a margin call');
  assert.ok(lev(1200, 4, 0.27).de > REF.callDE, 'a 27% fall trips the call');
  const callDrop = (loan, lots) => { const cash = E + loan - REF.loanFee * loan - lots * price; return 1 - (loan / REF.callDE + loan - cash) / (lots * fmv); };
  assert.ok(near(callDrop(1200, 4), 0.265, 0.001), '26.5% trips the big loan');
  assert.ok(near(callDrop(600, 2), 0.51, 0.006), 'the small loan survives to about 51%');
  assert.equal(REF.maxDE * E, 1200, 'the bank caps a draw at D/E 3.0 of the equity you have before the draw (v1 loanRoom), so the maximum is $1,200');
  assert.ok(E + 1200 * (1 - REF.loanFee) >= 4 * price, 'the maximum loan really does buy all four lots');
  const glut = priceIndex(6 * 9 * 0.55 - 5) / priceIndex(6 * 9 - 5) - 1;
  assert.ok(near(glut, -0.245, 0.01), `a supply glut (demand x0.55) cuts a 6-scarcity, 5-depreciation good with demand 9 by ${(glut * 100).toFixed(1)}%`);
  const ev = m.setup.events[0];
  assert.deepEqual([ev.kind, ev.cls], ['glut', 'sneakers']);
  assert.ok(ev.atHour >= 4 && ev.atHour <= 12, 'the glut lands soon after the player starts the clock');
  assert.equal(m.setup.clock, 'paused');
  assert.ok(near(600 * (REF.beta * 0 + 0.025 + 0.095) / 30, 2.4), 'about $2.40 a day on $600 at 12% per 30 days');
  mentions(m, '1.08', '$554', '$346', '1.73', '$708', '$292', '4.11', '0.39', '26.5%', '51%', '$2.40');
});

test('m08: the same book sells for $9,396 in the herd and $70,739 in the open', () => {
  const m = M('m08');
  assert.ok(m.setup.perks.includes('grad') && m.setup.cohort.ghosts >= 20);
  assert.equal(m.setup.assets.filter((a) => a.cls === 'saas').length, 2);
  assert.deepEqual(m.setup.leads.map((l) => l.seg).sort(), ['entIT', 'vcstart']);
  const base = offer(29000, fitTerm(1), 1); // baseline offer at Cm = 1
  assert.ok(near(base, 23490, 1e-6));
  assert.ok(cmRaw(43, 45) < REF.cmMin && near(cmRaw(43, 45), 0.02, 0.005), 'the herd is on the floor');
  assert.ok(near(cm(2, 45), 3.01, 0.005) && near(cm(9, 45), 1.56, 0.005) && near(saturation(9, 45), 0.2, 1e-9));
  assert.ok(near(base * REF.cmMin, 9396, 0.5) && near(base * cm(2, 45), 70739, 1) && near(base * cm(9, 45), 36599, 1));
  for (const l of m.setup.leads) assert.ok(l.budget > base * cm(2, 45), `${l.id}: the budget never caps the lesson`);
  assert.ok(cm(2, 45) > 2.4, 'a pioneer vector');
  assert.ok(m.win.match.S.lt === 0.5, 'win is a pitch into a niche that is not crowded');
  mentions(m, '$23,490', '0.96', '0.02', '$9,396', '0.04', '3.01', '$70,739', '1.56', '$36,599');
});

test('m09: concentration is what the shock punishes', () => {
  const m = M('m09'), gadgets = m.setup.assets.filter((a) => a.cls === 'gadgets').length;
  assert.equal(gadgets, 3); assert.equal(m.setup.assets.length, 3, 'everything the player owns is one trend');
  const lot = m.setup.lots[0];
  assert.deepEqual([lot.cls, lot.cond], ['textbooks', 'ok']);
  assert.ok(m.setup.cash >= lot.price, 'the player can afford the hedge');
  const ev = m.setup.events[0];
  assert.equal(ev.kind, 'tiktok');
  assert.ok(ev.atHour >= 12 && ev.atHour <= 48, 'a warning comes before the shock');
  assert.ok(m.setup.features.includes('travel') && m.setup.zones.length >= 2, 'the map shows somewhere else');
  const loss = (share) => 2000 * share * 0.5;
  assert.deepEqual([loss(1), loss(0.5), loss(0.25), loss(0)], [1000, 500, 250, 0]);
  mentions(m, '$1,000', '$500', '$250', '$0', '$2,000');
});

test('m10: every skill, then the score', () => {
  const m = M('m10'), lot = m.setup.lots[0];
  assert.ok(lot.auction === true && lot.cond === 'broken' && lot.truth && lot.truth.fake === false, 'one broken auction box with a hidden truth');
  assert.ok(m.setup.cash >= 2 * lot.price, 'room to bid');
  assert.ok(Object.values(m.setup.skills).every((v) => v >= 2), 'a mid-level toolkit');
  assert.equal(m.setup.leads.length, 1);
  const ana = eei(20000, 0.05, 30), ben = eei(20000, 0.05, 0);
  assert.ok(near(ana, 26.67, 0.005) && near(ben, 20, 1e-9));
  assert.ok(near(eei(26700, 0.05, 0), 26.7, 1e-9) && eei(26700, 0.05, 0) >= ana);
  assert.equal(eei(20000, 0.05, 0), eei(20000, 1000, 0), 'a $0.05 start is floored to $1,000');
  // what the box is worth to the player once fixed (Ops 2) and sold to the boutique at Cm 1.09, after Estate Sales tax (0.05 + 0.0095) and the 2.5% fee
  const working = 900 * priceIndex(6 * 9 - 6), repaired = working * restoreQuality(2), sale = offer(repaired, fitTerm(1), cm(0, 0)) * (1 - (0.05 + 0.0095) - 0.025), worth = sale - repairCost(150, 2);
  assert.ok(near(worth, 385, 5), `the box is worth about $385 to the player after repair and sale (computed ${worth.toFixed(1)})`);
  assert.ok(lot.price < working * REF.brokenFactor && working * REF.brokenFactor < worth, 'the opening price is under the as-is value, which is under the all-in value');
  assert.ok(text(m.teachBack).includes('$385'), 'the teach-back uses the computed $385');
  assert.ok(offer(repaired, fitTerm(1), cm(0, 0)) < m.setup.leads[0].budget, 'the boutique can afford it');
  assert.equal(m.reward.points, 1);
  mentions(m, '26.67', '20.00', '$26,700', '1.33', '$1,000', '$20,000');
});

// The text of each worked-example step must carry the numbers the formulas give (the lesson tests above compute every one of them).
const STEP_FACTS = {
  m01: [['= $2.62'], ['= $0.03', '0.875'], ['= $0.02', '0.59']],
  m02: [['+$6.00'], ['+$18.00'], ['$12'], ['+$0.80', '+$10.92']],
  m03: [['0.875', '1.065', '22%'], ['0.70', '0.23'], ['0.10', '2.15']],
  m04: [['$8.00', '0.89'], ['$10.00', '1.11'], ['$2.00', '22%'], ['$9.50']],
  m05: [['$900', '$2,175', '$870', '-$30', '-3%'], ['$378', '0.625', '$2,719', '$1,414', '$1,036', '274%'], ['$159', '0.75', '$3,263', '$1,799', '1,133%'], ['$515', '$1,481']],
  m06: [['$20'], ['$500', '$9.00'], ['$815'], ['$544.50', '$450']],
  m07: [['$554', '1.08', '$346', '1.73'], ['$708', '1.69', '$292', '4.11'], ['0.39', '26.5%'], ['51%']],
  m08: [['0.96', '0.02', '$9,396'], ['0.04', '3.01', '$70,739'], ['0.20', '1.56', '$36,599']],
  m09: [['$1,000'], ['$500'], ['$250'], ['$0']],
  m10: [['26.67', '1.33'], ['20.00'], ['$26,700']],
};
test('each step of a worked example says what the formulas say', () => {
  for (const m of ACADEMY) {
    const facts = STEP_FACTS[m.id];
    assert.equal(m.why.example.steps.length, facts.length, `${m.id}: the facts table lists every example step`);
    facts.forEach((bits, i) => { for (const b of bits) assert.ok(m.why.example.steps[i].includes(b), `${m.id} example step ${i + 1} should contain "${b}": ${m.why.example.steps[i]}`); });
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------------
// Once the content tiers are merged, the Academy must still line up with them. Skipped while no tier file exists.
const tierUrls = [1, 2, 3, 4].map((t) => new URL(`../js/data/tier${t}.js`, import.meta.url)).filter((u) => existsSync(u));
const merged = { zones: {}, assets: {}, buyers: {} };
for (const u of tierUrls) { const t = await import(u.href); for (const k of ['zones', 'assets', 'buyers']) Object.assign(merged[k], t[k] || {}); }

test(`the Academy lines up with the content tiers (${tierUrls.length} present)`, { skip: !tierUrls.length && 'no tier files yet' }, (t) => {
  for (const m of ACADEMY) {
    const zone = merged.zones[m.zone], where = `${m.id} (district ${m.zone})`;
    const classes = [...new Set([...m.setup.assets.map((a) => a.cls), ...m.setup.lots.map((l) => l.cls)])];
    if (zone) {
      for (const cls of classes) { const a = merged.assets[cls]; if (a) assert.ok(demandOf(a, m.zone) >= 4, `${where}: "${cls}" has demand ${demandOf(a, m.zone)} here; it must be a tradeable class (>= 4) or the lesson prices are wrong`); }
      const need = { m02: 'fakes', m04: 'haggle', m05: 'repair', m06: 'managers', m07: 'bank', m10: 'auction' }[m.id];
      if (need) assert.ok(zone.rules?.[need], `${where}: the district's rules should include "${need}"`);
    }
    for (const l of m.setup.leads) {
      const b = merged.buyers[l.seg];
      if (!b) continue;
      if (b.zone !== m.zone) t.diagnostic(`${where}: buyer ${l.seg} lives in district ${b.zone}; the sandbox spawns it here anyway`);
      if (l.need) assert.ok(m.setup.assets.some((a) => merged.assets[a.cls]?.tags.includes(l.need)), `${where}: no held asset carries the need tag "${l.need}"`);
    }
    const seg = m.win.match?.seg;
    if (seg && merged.buyers[seg]) for (const cls of classes) { const a = merged.assets[cls]; if (a) assert.ok(fitTags(a.tags, merged.buyers[seg].like) >= 0.5, `${where}: the buyer the mission needs to pay (${seg}) fits "${cls}" at ${fitTags(a.tags, merged.buyers[seg].like).toFixed(2)}, below 0.5`); }
  }
});
