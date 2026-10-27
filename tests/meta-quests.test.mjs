// Quests, achievements and dailies (js/meta/quests.js): shape, ids, reachability and scaling (docs/V2_DESIGN.md section 12).
// Every goal is evaluated here with the real matcher (js/meta/match.js) against an event built from the goal itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTS, ACHIEVEMENTS, DAILIES } from '../js/meta/quests.js';
import { EVENT_TYPES, EVENT_PAYLOAD, BACKGROUND_IDS } from '../js/meta/ids.js';
import { matchEvent, goalDelta, goalDone } from '../js/meta/match.js';

const ALL = [...QUESTS, ...ACHIEVEMENTS, ...DAILIES];
const OPS = ['gte', 'lte', 'gt', 'lt', 'eq', 'in'];
const NUMERIC_OPS = ['gte', 'lte', 'gt', 'lt'];
const GOAL_KEYS = ['event', 'match', 'count', 'sum'];
/** Numeric payload fields per event: the only fields a range test or a `sum` may use. */
const NUMERIC = {
  pitch: ['zone', 'gain', 'cm', 'S', 'fit', 'price', 'mult'], buy: ['zone', 'price'], 'sell-pool': ['zone', 'total', 'count'], repair: ['cost', 'quality', 'precision'],
  ship: ['from', 'to', 'count'], hire: ['zone'], 'pipe-level': ['level'], cycle: ['zone', 'net'], draw: ['amount'], repay: ['amount'], zone: ['id'], milestone: ['n'],
  skill: ['level'], level: ['level'], inspect: ['score'], haggle: ['mult', 'score'], auction: ['price', 'surplus'], streak: ['n'], day: ['day'], p2p: ['variance'],
};
const BG_NAMES = {
  connected: 'Well-Connected', grad: 'Business-School Grad', trades: 'Licensed Tradesperson', immigrant: 'Immigrant Hustler', veteran: 'Veteran', heir: 'Legacy Heir',
  creator: 'Creator', gigger: 'Side-Hustler', roots: 'Small-Town Roots', native: 'Digital Native', second: 'Second-Chance Hustler', pro: 'Seasoned Pro',
};
const pad = (n) => String(n).padStart(2, '0');
const canon = (g) => JSON.stringify(g, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const isPlain = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/** A payload value that satisfies `want` (a literal or an operator object). */
function satisfy(want) {
  if (!isPlain(want)) return want;
  if ('eq' in want) return want.eq;
  if ('in' in want) return want.in[0];
  let lo = null, loStrict = false, hi = null, hiStrict = false;
  for (const [op, v] of Object.entries(want)) {
    if ((op === 'gte' || op === 'gt') && (lo === null || v >= lo)) { lo = v; loStrict = op === 'gt'; }
    if ((op === 'lte' || op === 'lt') && (hi === null || v <= hi)) { hi = v; hiStrict = op === 'lt'; }
  }
  const eps = (x) => Math.max(0.01, Math.abs(x) * 0.01);
  if (lo !== null && hi !== null) return (lo + hi) / 2;
  if (lo !== null) return loStrict ? lo + eps(lo) : lo;
  return hiStrict ? hi - eps(hi) : hi;
}
/** A payload value that breaks `want`. */
function violate(want) {
  if (!isPlain(want)) return typeof want === 'boolean' ? !want : typeof want === 'number' ? want + 1 : `${want}-x`;
  if ('eq' in want) return typeof want.eq === 'number' ? want.eq + 1 : `${want.eq}-x`;
  if ('in' in want) return '__not-listed__';
  if ('gte' in want) return want.gte - Math.max(1, Math.abs(want.gte));
  if ('gt' in want) return want.gt;
  if ('lte' in want) return want.lte + Math.max(1, Math.abs(want.lte));
  return want.lt;
}
function eventFor(goal) {
  const evt = { type: goal.event, day: 1 };
  for (const [k, want] of Object.entries(goal.match || {})) evt[k] = satisfy(want);
  if (goal.sum) evt[goal.sum] = goal.count;
  return evt;
}

test('counts, ids and shape', () => {
  assert.ok(QUESTS.length >= 32, 'at least 32 quests');
  assert.ok(ACHIEVEMENTS.length >= 40, 'at least 40 achievements');
  assert.ok(DAILIES.length >= 10, 'at least 10 daily templates');
  const ids = ALL.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique across quests, achievements and dailies');
  assert.deepEqual(JSON.parse(JSON.stringify([QUESTS, ACHIEVEMENTS, DAILIES])), [QUESTS, ACHIEVEMENTS, DAILIES], 'plain JSON data: no functions, no undefined fields');
  for (const q of QUESTS) assert.deepEqual(Object.keys(q).sort(), ['after', 'desc', 'goal', 'icon', 'id', 'reward', 'title', 'zone'].filter((k) => k !== 'after' || 'after' in q).sort(), `${q.id} keys`);
  for (const a of ACHIEVEMENTS) {
    const extra = Object.keys(a).filter((k) => !['id', 'title', 'desc', 'icon', 'rarity', 'goal', 'hidden', 'reward', 'bg'].includes(k));
    assert.deepEqual(extra, [], `${a.id}: unexpected fields`);
    if ('hidden' in a) assert.equal(a.hidden, true, `${a.id}: hidden is true when present`);
  }
  for (const d of DAILIES) assert.deepEqual(Object.keys(d).sort(), ['desc', 'goal', 'icon', 'id', 'reward', 'title'], `${d.id} keys`);
  assert.ok(QUESTS.every((q) => /^q(0[1-9]|1[0-6])[ab]$/.test(q.id)), 'quest ids are qNNa / qNNb');
  assert.ok(ACHIEVEMENTS.every((a) => /^a-[a-z0-9-]+$/.test(a.id)), 'achievement ids start with a-');
  assert.ok(DAILIES.every((d) => /^d-[a-z0-9-]+$/.test(d.id)), 'daily ids start with d-');
});

test('exactly two quests per district: an arrival (a) and a mastery (b)', () => {
  assert.equal(QUESTS.length, 32);
  for (let z = 1; z <= 16; z++) {
    const here = QUESTS.filter((q) => q.zone === z);
    assert.deepEqual(here.map((q) => q.id), [`q${pad(z)}a`, `q${pad(z)}b`], `district ${z}`);
  }
  for (const q of QUESTS) assert.equal(q.id.slice(1, 3), pad(q.zone), `${q.id}: id matches zone`);
});

test('after chains the story in order and has no cycle', () => {
  const byId = new Map(QUESTS.map((q) => [q.id, q]));
  for (const q of QUESTS) {
    const n = q.zone, arrival = q.id.endsWith('a');
    const want = arrival ? (n === 1 ? undefined : `q${pad(n - 1)}b`) : `q${pad(n)}a`;
    assert.equal(q.after, want, `${q.id}: after`);
    if (q.after) assert.ok(byId.has(q.after), `${q.id}: after resolves`);
  }
  for (const q of QUESTS) {
    const seen = new Set();
    for (let cur = q; cur; cur = byId.get(cur.after)) { assert.ok(!seen.has(cur.id), `${q.id}: cycle through ${cur.id}`); seen.add(cur.id); }
    assert.ok(seen.has('q01a'), `${q.id}: chain reaches the first quest`);
  }
});

test('text: short playful titles, exact descriptions, one emoji icon, no em dashes', () => {
  const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
  for (const x of ALL) {
    for (const k of ['id', 'title', 'desc', 'icon']) assert.ok(typeof x[k] === 'string' && x[k].trim() === x[k] && x[k].length > 0, `${x.id}.${k} is a trimmed non-empty string`);
    assert.ok(x.title.length <= 32, `${x.id}: title over 32 characters`);
    assert.ok(!/[.!?]$/.test(x.title), `${x.id}: title has no end punctuation`);
    assert.ok(x.desc.length >= 12 && x.desc.length <= 200, `${x.id}: desc length ${x.desc.length}`);
    assert.ok(/[.!?]$/.test(x.desc), `${x.id}: desc ends with a full stop`);
    assert.ok(!/ {2}/.test(x.desc + x.title), `${x.id}: no double spaces`);
    assert.equal([...seg.segment(x.icon)].length, 1, `${x.id}: icon is one symbol`);
    assert.ok(/\p{Extended_Pictographic}/u.test(x.icon), `${x.id}: icon is an emoji`);
  }
  const strings = [];
  (function walk(v) { if (typeof v === 'string') strings.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); })(ALL);
  for (const s of strings) assert.ok(!/—/.test(s), `em dash in "${s}"`);
  for (const list of [QUESTS, ACHIEVEMENTS, DAILIES]) {
    for (const key of ['title', 'icon']) {
      const vals = list.map((x) => x[key]);
      assert.equal(new Set(vals).size, vals.length, `${key}s are distinct within a list`);
    }
  }
});

test('every goal uses a real event and only payload keys that event carries', () => {
  for (const x of ALL) {
    const g = x.goal, w = x.id;
    assert.deepEqual(Object.keys(g).filter((k) => !GOAL_KEYS.includes(k)), [], `${w}: unknown goal keys`);
    assert.ok(EVENT_TYPES.includes(g.event), `${w}: unknown event "${g.event}"`);
    const payload = EVENT_PAYLOAD[g.event];
    assert.ok(Array.isArray(payload), `${w}: event has a payload table`);
    if (g.match !== undefined) assert.ok(isPlain(g.match), `${w}: match is an object`);
    for (const [k, want] of Object.entries(g.match || {})) {
      assert.ok(payload.includes(k), `${w}: match key "${k}" is not in ${g.event}'s payload (${payload.join(', ') || 'none'})`);
      if (isPlain(want)) {
        const ops = Object.keys(want);
        assert.ok(ops.length > 0 && ops.every((o) => OPS.includes(o)), `${w}: operators of "${k}" are known`);
        if (ops.some((o) => NUMERIC_OPS.includes(o))) {
          assert.ok((NUMERIC[g.event] || []).includes(k), `${w}: range test on non-numeric field "${k}"`);
          for (const o of ops) assert.ok(Number.isFinite(want[o]), `${w}: ${k}.${o} is a finite number`);
        }
        if ('in' in want) assert.ok(Array.isArray(want.in) && want.in.length > 0, `${w}: ${k}.in is a non-empty list`);
      } else assert.ok(want !== null && ['string', 'number', 'boolean'].includes(typeof want), `${w}: literal for "${k}"`);
    }
    if (g.sum !== undefined) {
      assert.ok(payload.includes(g.sum), `${w}: sum field "${g.sum}" is not in ${g.event}'s payload`);
      assert.ok((NUMERIC[g.event] || []).includes(g.sum), `${w}: sum field "${g.sum}" is not numeric`);
      assert.ok(Number.isFinite(g.count) && g.count > 0, `${w}: a sum goal's count is a positive number`);
    } else assert.ok(Number.isInteger(g.count) && g.count > 0, `${w}: count is a positive integer`);
  }
});

test('counts stay small: quests 1-5, achievements up to 25 (sum goals are money)', () => {
  for (const q of QUESTS) if (!q.goal.sum) assert.ok(q.goal.count <= 5, `${q.id}: count ${q.goal.count}`);
  for (const q of QUESTS) if (q.goal.sum === 'count') assert.ok(q.goal.count <= 10, `${q.id}: crate sum ${q.goal.count}`);
  for (const a of ACHIEVEMENTS) if (!a.goal.sum) assert.ok(a.goal.count <= 25 || a.goal.event === 'zone', `${a.id}: count ${a.goal.count}`);
  for (const d of DAILIES) assert.ok(d.goal.count >= 1 && d.goal.count <= 3 && !d.goal.sum, `${d.id}: dailies are 1-3 events`);
  for (const a of ACHIEVEMENTS) if (a.goal.event === 'zone' && !a.goal.match) assert.ok(a.goal.count <= 15, `${a.id}: zone unlocks cannot exceed 15`);
});

test('goalDelta is positive for an event built from each goal, zero for one that breaks it', () => {
  for (const x of ALL) {
    const g = x.goal, evt = eventFor(g);
    assert.ok(matchEvent(g.match, evt), `${x.id}: the built event matches`);
    const d = goalDelta(g, evt);
    assert.ok(Number.isFinite(d) && d > 0, `${x.id}: delta ${d} for ${JSON.stringify(evt)}`);
    assert.equal(d, g.sum ? g.count : 1, `${x.id}: delta`);
    assert.ok(goalDone(g, d * (g.sum ? 1 : g.count)), `${x.id}: finishes`);
    assert.equal(goalDelta(g, { ...evt, type: EVENT_TYPES.find((t) => t !== g.event) }), 0, `${x.id}: another event type does not count`);
    for (const [k, want] of Object.entries(g.match || {})) {
      assert.equal(goalDelta(g, { ...evt, [k]: violate(want) }), 0, `${x.id}: breaking "${k}" must not count`);
      const without = { ...evt }; delete without[k];
      assert.equal(goalDelta(g, without), 0, `${x.id}: a missing "${k}" must not count`);
    }
  }
});

test('progress accumulates to the goal and a rejected or partial run is not done', () => {
  for (const x of ALL) {
    const g = x.goal, evt = eventFor(g);
    if (g.sum) {
      const half = { ...evt, [g.sum]: g.count / 2 };
      let p = goalDelta(g, half);
      assert.ok(!goalDone(g, p), `${x.id}: half the sum is not done`);
      p += goalDelta(g, half);
      assert.ok(goalDone(g, p), `${x.id}: two halves are done`);
    } else {
      let p = 0;
      for (let i = 0; i < g.count - 1; i++) p += goalDelta(g, evt);
      if (g.count > 1) assert.ok(!goalDone(g, p), `${x.id}: one short is not done`);
      p += goalDelta(g, evt);
      assert.ok(goalDone(g, p), `${x.id}: ${g.count} matching events are done`);
    }
  }
});

test('quests are location-true: a zone in the match is the quest\'s district', () => {
  for (const q of QUESTS) {
    const m = q.goal.match || {};
    if ('zone' in m && typeof m.zone === 'number') assert.equal(m.zone, q.zone, `${q.id}: match.zone`);
    if (q.goal.event === 'ship' && 'to' in m) assert.equal(m.to, q.zone, `${q.id}: match.to`);
    assert.notEqual(q.goal.event, 'zone', `${q.id}: a one-shot unlock event can be missed if the quest activates late`);
    assert.notEqual(q.goal.event, 'milestone', `${q.id}: a one-shot event can be missed if the quest activates late`);
  }
  // Each district's quests exercise its signature rule (docs/V2_DESIGN.md section 4).
  const sig = { 2: 'pitch', 3: 'pitch', 4: 'inspect', 5: 'hire', 6: 'auction', 7: 'repair', 8: 'ship', 9: 'audit', 10: 'pitch', 12: 'cycle', 13: 'client', 14: 'repay', 15: 'cycle', 16: 'pitch' };
  for (const [z, event] of Object.entries(sig)) assert.equal(QUESTS.find((q) => q.id === `q${pad(z)}b`).goal.event, event, `district ${z} mastery`);
  assert.equal(QUESTS.find((q) => q.id === 'q10b').goal.match.outcome, 'pioneer', 'Tech Corridor rewards first movers');
  assert.equal(QUESTS.find((q) => q.id === 'q04b').goal.match.caught, true, 'Pawn District: catch a fake');
  assert.deepEqual(QUESTS.find((q) => q.id === 'q06b').goal.match, { won: true, surplus: { gt: 0 } }, 'Estate Sales: win without the winner\'s curse');
});

test('no two goals are the same, across quests, achievements and dailies', () => {
  const seen = new Map();
  for (const x of ALL) {
    const key = canon(x.goal);
    assert.ok(!seen.has(key), `${x.id} repeats the goal of ${seen.get(key)}: ${key}`);
    seen.set(key, x.id);
  }
});

test('rarities are valid and rewards are positive and scale with difficulty', () => {
  const RARITIES = ['common', 'rare', 'epic'];
  for (const a of ACHIEVEMENTS) assert.ok(RARITIES.includes(a.rarity), `${a.id}: rarity`);
  for (const r of RARITIES) assert.ok(ACHIEVEMENTS.filter((a) => a.rarity === r).length >= 8, `at least 8 ${r} achievements`);
  for (const x of ALL) {
    assert.ok(isPlain(x.reward), `${x.id}: reward`);
    assert.ok(Number.isInteger(x.reward.xp) && x.reward.xp > 0, `${x.id}: xp is a positive integer`);
    if ('points' in x.reward) assert.ok(Number.isInteger(x.reward.points) && x.reward.points > 0, `${x.id}: points is a positive integer`);
    assert.deepEqual(Object.keys(x.reward).filter((k) => !['xp', 'points'].includes(k)), [], `${x.id}: reward keys`);
  }
  const xp = (r) => ACHIEVEMENTS.filter((a) => a.rarity === r).map((a) => a.reward.xp);
  assert.ok(mean(xp('epic')) > mean(xp('rare')) && mean(xp('rare')) > mean(xp('common')), 'epic > rare > common on average');
  assert.ok(Math.min(...xp('rare')) > Math.max(...xp('common')), 'every rare pays more than every common');
  assert.ok(Math.min(...xp('epic')) > Math.max(...xp('rare')), 'every epic pays more than every rare');
  for (const a of ACHIEVEMENTS.filter((x) => x.rarity === 'epic')) assert.ok(a.reward.points >= 1, `${a.id}: epics pay a skill point`);
  for (const a of ACHIEVEMENTS.filter((x) => x.rarity !== 'epic')) assert.ok(!a.reward.points, `${a.id}: only epics pay skill points`);

  // quests: the mastery quest pays more than its arrival quest, and later tiers pay more
  for (let z = 1; z <= 16; z++) {
    const a = QUESTS.find((q) => q.id === `q${pad(z)}a`), b = QUESTS.find((q) => q.id === `q${pad(z)}b`);
    assert.ok(b.reward.xp > a.reward.xp, `district ${z}: mastery pays more than arrival`);
    if (z > 1) assert.ok(a.reward.xp > QUESTS.find((q) => q.id === `q${pad(z - 1)}a`).reward.xp, `district ${z}: arrival pays more than the one before`);
    if (z > 1) assert.ok(b.reward.xp > QUESTS.find((q) => q.id === `q${pad(z - 1)}b`).reward.xp, `district ${z}: mastery pays more than the one before`);
  }
  const tierMean = (t) => mean(QUESTS.filter((q) => Math.ceil(q.zone / 4) === t).map((q) => q.reward.xp));
  assert.ok(tierMean(1) < tierMean(2) && tierMean(2) < tierMean(3) && tierMean(3) < tierMean(4), 'quest rewards rise by tier');
  const pts = QUESTS.filter((q) => q.reward.points);
  assert.ok(pts.length >= 6 && pts.length <= 10, 'skill points are rare quest rewards');
  assert.ok(pts.every((q) => q.id.endsWith('b')), 'only mastery quests pay skill points');
  const dailyMax = Math.max(...DAILIES.map((d) => d.reward.xp));
  assert.ok(dailyMax < QUESTS.find((q) => q.id === 'q04b').reward.xp, 'a daily is smaller than a story payoff');
});

test('achievements cover the skill games, streaks, risk, the Creativity Engine, audits, peers, levels and money', () => {
  const has = (event, pred = () => true) => ACHIEVEMENTS.some((a) => a.goal.event === event && pred(a.goal.match || {}));
  for (const e of ['haggle', 'inspect', 'repair', 'auction']) assert.ok(ACHIEVEMENTS.filter((a) => a.goal.event === e).length >= 4, `${e}: achievements at several levels`);
  assert.ok(has('haggle', (m) => m.role === 'sell') && has('haggle', (m) => m.role === 'buy'), 'haggle: selling and buying');
  assert.ok(has('inspect', (m) => m.caught === true), 'inspect: catching fakes');
  assert.ok(has('auction', (m) => m.surplus && 'gt' in m.surplus) && has('auction', (m) => m.surplus && 'lt' in m.surplus), 'auction: surplus and the winner\'s curse');
  assert.ok(ACHIEVEMENTS.filter((a) => a.goal.event === 'streak').length >= 3, 'deal streaks at three levels');
  assert.ok(has('margin-call') && has('insolvent'), 'risk survived: margin call and insolvency');
  assert.ok(ACHIEVEMENTS.filter((a) => a.goal.event === 'shock').length >= 3, 'shocks');
  for (const o of ['pioneer', 'win', 'herd']) assert.ok(ACHIEVEMENTS.some((a) => a.goal.event === 'pitch' && JSON.stringify(a.goal.match?.outcome ?? '').includes(o)), `Creativity Engine: ${o}`);
  assert.ok(has('audit'), 'audits');
  assert.ok(has('p2p'), 'peer exchange');
  assert.ok(has('level') && has('skill'), 'levels and skill points');
  assert.ok(has('zone', (m) => m.id === 5) && has('zone', (m) => m.id === 9) && has('zone', (m) => m.id === 13) && has('zone', (m) => m.id === 16), 'each tier of districts');
  assert.ok(ACHIEVEMENTS.filter((a) => a.goal.sum).length >= 5, 'net-worth style milestones use sum goals');
  assert.ok(has('exit'), 'exits');
  assert.ok(ACHIEVEMENTS.filter((a) => a.hidden).length >= 4, 'a few hidden surprises');
});

test('each of the twelve Backgrounds has exactly one themed achievement that names it', () => {
  for (const bg of BACKGROUND_IDS) {
    const themed = ACHIEVEMENTS.filter((a) => a.bg === bg);
    assert.equal(themed.length, 1, `${bg}: one achievement carries bg "${bg}"`);
    const name = BG_NAMES[bg];
    assert.ok(name, `${bg}: test knows the Background's name`);
    assert.ok(`${themed[0].title} ${themed[0].desc}`.includes(name), `${bg}: "${themed[0].id}" mentions "${name}"`);
  }
  for (const a of ACHIEVEMENTS) if ('bg' in a) assert.ok(BACKGROUND_IDS.includes(a.bg), `${a.id}: bg is a Background id`);
});

test('dailies make sense in any district', () => {
  const ANYWHERE = ['pitch', 'buy', 'haggle', 'inspect', 'repair', 'streak'];
  for (const d of DAILIES) {
    assert.ok(ANYWHERE.includes(d.goal.event), `${d.id}: ${d.goal.event} is not available in every district`);
    assert.ok(!('zone' in (d.goal.match || {})), `${d.id}: no district in a daily`);
    assert.ok(d.reward.xp >= 30 && d.reward.xp <= 80 && !('points' in d.reward), `${d.id}: small xp-only reward`);
  }
  assert.ok(new Set(DAILIES.map((d) => d.goal.event)).size >= 5, 'dailies vary the skill they ask for');
});
