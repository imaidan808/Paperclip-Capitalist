// The presence table the instructor's dashboard reads (js/presence.js; docs/ARCHITECTURE.md, "Presence (relay version 2)"): who is in a room, where, and what just happened. Pure: a clock is handed in, nothing else.
//   U1  a here and an act are checked again on arrival as everything from a room is (a district that is not a whole number, a state that is not a word, a value that is not a number: dropped; an alias cleaned and cut)
//   U2  a hello puts a member in the table and makes a "joined" row; a bye takes them out and makes a "left" row; a here moves them; a returning member says so
//   U3  what the relay replays to a joiner (it carries its age) fills the table and makes no row: nobody is told that the whole class "joined" because the dashboard was opened late
//   U4  an act makes a row in words the page chooses (a district by its own name for the number, a shock by the config's name for the kind), never from the sender's text where the page has the word
//   U5  counts: students online only, by state and by district; the instructor and a member who left are not students here
//   U6  the table and the feed are bounded; a full table gives its place to the member gone longest, never to the newcomer's detriment of someone present
//   U7  nothing a room can say makes it throw
//   U8  an engine event becomes the line a student reports (a district opened, a shock, a milestone, insolvency, an exit) and nothing else does
//   U9  presence is not the game: the engine, the market, the cohort, the deal room, the skill games and the meta layer do not import it, and it imports only the config
// Run: node --test tests/presence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Presence, cleanHere, cleanAct, actOf, describeAct } from '../js/presence.js';
import { ZONES, EVENTS } from '../js/config.js';

const NUL = String.fromCodePoint(0), RLO = String.fromCodePoint(0x202e); // written as code points: nothing that handles this file may turn them into the characters themselves
const clock = (t = 1e12) => { const c = { t, now: () => c.t }; return c; };
const mk = (c = clock(), o = {}) => ({ c, p: new Presence({ now: c.now, ...o }) });
const here = (pid, z, s, o = {}) => ({ t: 'here', z, s, handle: o.handle ?? pid, from: pid, role: o.role ?? 'student', ...(o.age != null ? { age: o.age } : {}) });
const hello = (pid, o = {}) => ({ t: 'hello', from: pid, role: o.role ?? 'student', handle: o.handle ?? pid, ...(o.age != null ? { age: o.age } : {}) });
const bye = (pid) => ({ t: 'bye', from: pid, role: 'student' });
const act = (pid, a, o = {}) => ({ t: 'act', ...a, handle: o.handle ?? pid, from: pid, role: 'student' });

test('U1: a here and an act are checked again on arrival: a district that is not a whole number, a state that is not a word, a value that is not a number are dropped, an alias is cleaned and cut', () => {
  assert.deepEqual(cleanHere({ t: 'here', z: 5, s: 'play', handle: 'Ada' }), { z: 5, s: 'play', handle: 'Ada' });
  for (const bad of [{ z: '5', s: 'play' }, { z: 5.5, s: 'play' }, { z: -1, s: 'play' }, { z: 100, s: 'play' }, { z: 5 }, { z: 5, s: 'Play' }, { z: 5, s: 'two words' }, { z: 5, s: 'x'.repeat(13) }, { z: null, s: 'play' }, null, undefined, 'here', [], 7]) assert.equal(cleanHere(bad), null, JSON.stringify(bad));
  assert.equal(cleanHere({ z: 7, s: 'play', handle: 'A' + NUL + 'd' + RLO + 'a\n ' }).handle, 'Ada', 'control and direction characters go');
  assert.equal(cleanHere({ z: 7, s: 'play', handle: 'x'.repeat(40) }).handle.length, 24, 'an alias is cut at 24');
  assert.equal(cleanHere({ z: 7, s: 'play', handle: { x: 1 } }).handle, '', 'an alias that is not text is none');
  assert.deepEqual(Object.keys(cleanHere({ z: 7, s: 'play', handle: 'a', x: 1, snap: {}, from: 'EVIL' })).sort(), ['handle', 's', 'z'], 'nothing else rides along');
  assert.deepEqual(cleanAct({ t: 'act', k: 'swap', v: -3, d: '  Bike ', h: 0.5, handle: 'Ada' }), { k: 'swap', v: -3, d: 'Bike', h: 0.5, handle: 'Ada' });
  assert.deepEqual(cleanAct({ k: 'exit' }), { k: 'exit', handle: '' }, 'a value, a note and an hour are each optional');
  for (const bad of [{}, { k: 'Swap' }, { k: 'two words' }, { k: 'x'.repeat(17) }, { k: 5 }, { k: 'swap', v: '9' }, { k: 'swap', v: 1e13 }, { k: 'swap', v: Infinity }, { k: 'swap', h: -1 }, { k: 'swap', h: 5000 }, null, [], 'act']) assert.equal(cleanAct(bad), null, JSON.stringify(bad));
  assert.equal(cleanAct({ k: 'swap', d: 'x'.repeat(100) }).d.length, 48, 'a note is cut at 48');
});

test('U2: a hello puts a member in the table and makes a "joined" row; a bye makes a "left" row; a here moves them; a member who comes back says so', () => {
  const { c, p } = mk();
  assert.ok(p.apply(hello('ADA', { handle: 'Ada' }), 'ADA'));
  assert.deepEqual([...p.members.keys()], ['ADA']);
  assert.equal(p.members.get('ADA').online, true);
  assert.deepEqual(p.feed.map((r) => [r.kind, r.handle, r.text]), [['joined', 'Ada', 'joined the room']]);
  assert.equal(p.feed[0].at, c.t);
  assert.ok(p.apply(here('ADA', 3, 'play', { handle: 'Ada' }), 'ADA'));
  assert.deepEqual([p.members.get('ADA').z, p.members.get('ADA').s], [3, 'play']);
  assert.equal(p.feed.length, 1, 'a move is the strip\'s news, not the feed\'s');
  assert.equal(p.apply(here('ADA', 3, 'play', { handle: 'Ada' }), 'ADA'), null, 'what changes nothing is no news');
  c.t += 5000;
  assert.ok(p.apply(bye('ADA'), 'ADA'));
  assert.equal(p.members.get('ADA').online, false);
  assert.deepEqual(p.feed.map((r) => r.kind), ['left', 'joined'], 'newest first');
  assert.equal(p.apply(bye('ADA'), 'ADA'), null, 'a second goodbye changes nothing');
  c.t += 5000;
  assert.ok(p.apply(here('ADA', 4, 'play', { handle: 'Ada' }), 'ADA'));
  assert.equal(p.members.get('ADA').online, true);
  assert.deepEqual(p.feed.map((r) => r.kind), ['back', 'left', 'joined'], 'a here from a member who left is a member who came back');
  assert.ok(p.apply(here('BO', 1, 'play', { handle: 'Bo' }), 'BO'));
  assert.equal(p.feed[0].kind, 'joined', 'a here from a pid never seen is a member who joined (a hello may have been missed)');
  assert.equal(p.apply(bye('NOBODY'), 'NOBODY'), null, 'a goodbye from one never seen is nothing');
});

test('U3: what the relay replays to a joiner carries its age: it fills the table, seen that long ago, and makes no row', () => {
  const { c, p } = mk();
  assert.ok(p.apply(here('ADA', 5, 'play', { handle: 'Ada', age: 12000 }), 'ADA'));
  assert.ok(p.apply(here('BO', 2, 'academy', { handle: 'Bo', age: 0 }), 'BO'));
  assert.deepEqual(p.feed, [], 'nobody is told that the whole class joined because the dashboard was opened late');
  assert.equal(p.members.get('ADA').seen, c.t - 12000);
  assert.equal(p.members.get('BO').seen, c.t);
  const ancient = mk().p; ancient.apply(here('X', 1, 'play', { age: 9e9 }), 'X');
  assert.ok(ancient.members.get('X').seen >= 1e12 - 6e5, 'an age is believed up to ten minutes, as a snapshot\'s is');
  assert.deepEqual(p.apply(hello('CY', { age: 3 }), 'CY') && p.feed, [], 'a replayed hello makes no row either');
});

test('U4: an act makes a row in words the page chooses: a district by its own name for the number, a shock by the config\'s name for the kind, never the sender\'s text where the page has the word', () => {
  const { p } = mk();
  p.apply(hello('ADA', { handle: 'Ada' }), 'ADA');
  p.apply(act('ADA', { k: 'zone', v: 5, d: 'Hacked' }, { handle: 'Ada' }), 'ADA');
  assert.equal(p.feed[0].text, `opened ${ZONES[5].name}`, 'the page names the district from its number');
  assert.equal(p.feed[0].kind, 'zone'); assert.equal(p.feed[0].handle, 'Ada');
  p.apply(act('ADA', { k: 'swap', d: 'Bo' }), 'ADA'); assert.equal(p.feed[0].text, 'swapped with Bo');
  p.apply(act('ADA', { k: 'swap' }), 'ADA'); assert.equal(p.feed[0].text, 'swapped with a classmate');
  p.apply(act('ADA', { k: 'shock', d: 'fed' }), 'ADA'); assert.equal(p.feed[0].text, `felt a shock: ${EVENTS.fed.name}`);
  p.apply(act('ADA', { k: 'shock', d: 'made-up' }), 'ADA'); assert.equal(p.feed[0].text, 'felt a market shock');
  p.apply(act('ADA', { k: 'milestone', v: 2 }), 'ADA'); assert.equal(p.feed[0].text, 'reached milestone 2');
  p.apply(act('ADA', { k: 'insolvent' }), 'ADA'); assert.equal(p.feed[0].text, 'went insolvent');
  p.apply(act('ADA', { k: 'exit', d: 'ipo' }), 'ADA'); assert.equal(p.feed[0].text, 'launched an IPO');
  p.apply(act('ADA', { k: 'exit', d: 'trade' }), 'ADA'); assert.equal(p.feed[0].text, 'began a trade sale');
  p.apply(act('ADA', { k: 'wizardry' }), 'ADA'); assert.equal(p.feed[0].text, 'reported wizardry', 'a kind a newer page sends is shown by its word, not dropped');
  assert.equal(describeAct({ k: 'zone', v: 99 }), 'opened a new district');
  assert.equal(p.members.get('ADA').online, true, 'an act is a sign of life');
  assert.equal(p.apply(act('ADA', { k: 'Bad Kind' }), 'ADA'), null, 'an act that does not pass is nothing');
});

test('U5: counts are of students online: by state and by district; the instructor and a member who left are not counted', () => {
  const { p } = mk();
  p.apply(hello('TEACH', { role: 'instructor', handle: 'Prof' }), 'TEACH'); p.apply(here('TEACH', 0, 'dash', { role: 'instructor' }), 'TEACH');
  for (const [pid, z, s] of [['A', 1, 'play'], ['B', 1, 'play'], ['C', 5, 'play'], ['D', 0, 'academy'], ['E', 5, 'away'], ['F', 2, 'sleepy'], ['G', 3, 'play']]) { p.apply(hello(pid), pid); p.apply(here(pid, z, s), pid); }
  p.apply(bye('G'), 'G');
  const k = p.counts();
  assert.equal(k.here, 6, 'six students online; not the instructor, not G who left');
  assert.deepEqual([k.play, k.academy, k.away, k.other], [3, 1, 1, 1]);
  assert.equal(k.zones[1], 2); assert.equal(k.zones[5], 1, 'only a member who is playing stands in a district: E is away'); assert.equal(k.zones[3], 0);
  assert.equal(k.zones.length, 17, 'index 0 is unused: districts are 1 to 16');
  assert.deepEqual(p.list().map((m) => m.pid), ['A', 'B', 'C', 'D', 'E', 'F', 'G'], 'the roster: online first, then by alias; the instructor is not in it');
  assert.equal(p.list().find((m) => m.pid === 'G').online, false);
});

test('U6: the table and the feed are bounded; a full table gives its place to the member gone longest, and refuses a newcomer when everyone is present', () => {
  const { c, p } = mk(clock(), { maxMembers: 5, maxFeed: 7 });
  for (let i = 0; i < 5; i++) { p.apply(hello('M' + i), 'M' + i); c.t += 10; }
  assert.equal(p.members.size, 5);
  assert.equal(p.apply(hello('NEW'), 'NEW'), null, 'everyone is present: a sixth is not taken');
  assert.equal(p.members.has('NEW'), false);
  p.apply(bye('M2'), 'M2'); c.t += 10; p.apply(bye('M3'), 'M3'); c.t += 10;
  assert.ok(p.apply(hello('NEW'), 'NEW'), 'a member who has left makes room');
  assert.equal(p.members.has('M2'), false, 'the one gone longest');
  assert.equal(p.members.has('M3'), true);
  assert.equal(p.members.size, 5);
  for (let i = 0; i < 50; i++) p.apply(act('NEW', { k: 'swap', v: i }), 'NEW');
  assert.equal(p.feed.length, 7, 'the feed keeps the last few');
  assert.equal(p.feed[0].v, 49, 'the newest first');
  const ids = p.feed.map((r) => r.id); assert.equal(new Set(ids).size, ids.length, 'every row has its own id');
});

test('U7: nothing a room can say makes it throw', () => {
  const { p } = mk();
  const junk = [null, undefined, 0, 1, 'x', [], {}, { t: 5 }, { t: 'here' }, { t: 'here', z: {}, s: [] }, { t: 'act', k: {} }, { t: 'hello', handle: { a: 1 } }, { t: 'bye' }, { t: 'here', z: 1, s: 'play', age: 'old' }, { t: 'here', z: 1, s: 'play', age: NaN }, { t: 'here', z: 1, s: 'play', age: -5 }, { t: '__proto__' }, { t: 'constructor' }];
  for (const m of junk) for (const from of [undefined, null, '', 'A', 5, {}, '__proto__', 'constructor']) assert.doesNotThrow(() => p.apply(m, from), JSON.stringify([m, from]));
  assert.doesNotThrow(() => { p.counts(); p.list(); });
  assert.equal({}.polluted, undefined);
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  for (let i = 0; i < 3000; i++) {
    const m = { t: pick(['here', 'act', 'hello', 'bye', 'snap']), z: pick([0, 1, 5, 16, 99, 100, -1, 1.5, '3', null]), s: pick(['play', 'away', 'academy', 'X', '', 7, null]), k: pick(['zone', 'swap', 'shock', 'milestone', 'exit', 'insolvent', 'Z', '', 3]), v: pick([1, -1, 5, 1e13, '2', null, NaN]), d: pick(['fed', 'Bo', '', 7, 'x'.repeat(80)]), h: pick([0, 100, -1, 9999, 'x']), handle: pick(['A', '', 'x'.repeat(50), 5, null]), age: pick([undefined, 0, 500, 1e9, -3, 'x']), role: pick(['student', 'instructor', 'x', undefined]) };
    assert.doesNotThrow(() => p.apply(m, pick(['A', 'B', 'C', 'D', 'E'])));
  }
  assert.ok(p.members.size <= 12 && p.feed.length <= 100, 'only the ids that were given (valid ones among them), and a feed that keeps its bound');
});

test('U8: an engine event becomes the line a student reports: a district opened, a shock, a milestone, insolvency, an exit; nothing else does', () => {
  assert.deepEqual(actOf({ type: 'zone', id: 5, day: 12 }, 300.7), { k: 'zone', v: 5, h: 300 });
  assert.deepEqual(actOf({ type: 'shock', kind: 'fed' }, 1080), { k: 'shock', d: 'fed', h: 1080 });
  assert.deepEqual(actOf({ type: 'milestone', n: 2 }, 5), { k: 'milestone', v: 2, h: 5 });
  assert.deepEqual(actOf({ type: 'insolvent' }, 40), { k: 'insolvent', h: 40 });
  assert.deepEqual(actOf({ type: 'exit', kind: 'ipo' }, 2000), { k: 'exit', d: 'ipo', h: 2000 });
  assert.deepEqual(actOf({ type: 'zone', id: 3 }), { k: 'zone', v: 3 }, 'with no hour there is none');
  for (const quiet of ['buy', 'sell-pool', 'pitch', 'level', 'day', 'hire', 'p2p', 'skill', 'perk', 'audit', 'margin-call', 'streak', 'inspect', 'haggle', 'auction', 'repair', 'ship', 'draw', 'repay', 'cycle', 'client', 'upgrade', 'pipe-level']) assert.equal(actOf({ type: quiet }, 10), null, quiet + ' is not news for the instructor');
  for (const junk of [null, undefined, 0, 'zone', [], {}, { type: 5 }, { type: '__proto__' }, { type: 'constructor' }, { type: 'toString' }]) assert.equal(actOf(junk, 1), null);
  assert.equal(actOf({ type: 'zone', id: 3 }, NaN).h, undefined);
  assert.equal(actOf({ type: 'zone', id: 3 }, 1e9).h, 3000, 'an hour is clamped to what the relay takes');
  // what it makes is what the relay and cleanAct take
  for (const evt of [{ type: 'zone', id: 16 }, { type: 'shock', kind: 'tiktok' }, { type: 'milestone', n: 3 }, { type: 'insolvent' }, { type: 'exit', kind: 'trade' }]) assert.ok(cleanAct(actOf(evt, 2000)), JSON.stringify(evt));
});

test('U9: presence is not the game: the engine, the market, the cohort, the deal room, the skill games and the meta layer do not import it, and it imports only the config', () => {
  const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const files = ['js/engine.js', 'js/market.js', 'js/cohort.js', 'js/deal.js', 'js/rng.js', 'js/config.js', ...['js/play', 'js/meta', 'js/data'].flatMap((d) => readdirSync(new URL('../' + d, import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => d + '/' + f))];
  for (const f of files) assert.ok(!/from\s+['"][^'"]*presence(\.js)?['"]|import\(\s*['"][^'"]*presence(\.js)?['"]\s*\)/.test(read(f)), `${f} does not import presence`);
  const src = read('js/presence.js'), code = src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  assert.deepEqual([...src.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]), ['./config.js'], 'it imports the config and nothing else: no engine, no cohort, no session, no DOM');
  assert.ok(!/\bimport\s*\(/.test(code), 'and loads nothing later');
  assert.ok(!/\b(document|window|localStorage|sessionStorage|WebSocket|fetch|Math\.random|Date\.now)\b/.test(code), 'no DOM, storage, network or clock of its own (the clock is handed in)');
});
