// The instructor dashboard's "Right now" panel (js/ui/instructor.js `liveHTML`): who is here and where, and what students just did, as it happens; and the roster's "Now" column.
//   D1  a live room shows the count by state, the districts students are in now, and the last dozen things that happened, newest first, with the page's own words
//   D2  an alias or a note that is markup is shown as text, in the panel and in the roster
//   D3  a room that cannot carry presence (a relay of before it, a room between tabs, a table not yet loaded) says it updates every 4 seconds and shows no feed it does not have
//   D4  a live room nobody is in says so
//   D5  the age of a row is in words
//   D6  the roster has a "Now" column (the district a student is in, or Academy, or away), and the empty row spans the table
//   D7  a presence event patches the panel alone, once for a burst; a tick repaints everything as it did; nothing is patched after the page is gone
// Run: node --test tests/presence-dashboard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
const el = () => ({ children: [], innerHTML: '', _l: {}, contains: () => false, hasAttribute: () => false, querySelector: () => null, querySelectorAll: () => [],
  addEventListener(t, f) { (this._l[t] ||= []).push(f); }, removeEventListener(t, f) { this._l[t] = (this._l[t] || []).filter((x) => x !== f); } });
const page = Object.fromEntries(['#ih', '#ikeep', '#ilive', '#icol1', '#icol2', '#igrade', '#dlg', '#wc', '#wc-say'].map((id) => [id, el()]));
page['#toasts'] = { children: [], appendChild() {} };
globalThis.document = { querySelector: (s) => page[s], activeElement: null, createElement: () => ({ dataset: {}, classList: { add() {} }, remove() {}, className: '', textContent: '' }) };

const { Session, Clock } = await import('../js/session.js');
const { Presence } = await import('../js/presence.js');
const C = await import('../js/cohort.js');
const I = await import('../js/ui/instructor.js');
const { ZONES } = await import('../js/config.js');

const clock = (t = 1e12) => { const c = { t, now: () => c.t }; return c; };
const hello = (pid, handle = pid) => ({ t: 'hello', from: pid, role: 'student', handle });
const here = (pid, z, s, handle = pid) => ({ t: 'here', z, s, handle, from: pid, role: 'student' });
const act = (pid, a, handle = pid) => ({ t: 'act', ...a, handle, from: pid, role: 'student' });
/** An instructor's session as the dashboard reads it: a room that can carry presence (or not), a table with a clock the test holds. */
function dash({ can = true, kind = 'relay', table = true } = {}) {
  store.clear();
  const S = new Session(); S.pid = 'TEACH'; S.mode = 'instructor'; S.clock = new Clock({ hour: 24 * 4, paused: true });
  S.roomInfo = { code: 'LIVE', relay: kind === 'relay' ? 'wss://r.example.edu' : '', role: 'instructor' };
  S.room = { kind, state: 'open', can: (t) => can && (t === 'here' || t === 'act'), send() {}, close() {}, on() {} };
  const c = clock(); if (table) S.presence = new Presence({ now: c.now });
  return { S, c };
}
const fill = (S, rows) => { for (const [pid, z, s, handle] of rows) { S.presence.apply(hello(pid, handle || pid), pid); S.presence.apply(here(pid, z, s, handle || pid), pid); } };
const items = (html, cls) => { const m = new RegExp(`<ol class="${cls}[^"]*"[^>]*>([\\s\\S]*?)</ol>`).exec(html); return m ? [...m[1].matchAll(/<li[ >][\s\S]*?<\/li>/g)].map((x) => x[0]) : null; };

test('D1: a live room shows the count by state, the districts students are in now, and the last dozen things that happened, newest first, in the page\'s own words', () => {
  const { S, c } = dash();
  fill(S, [['A', 5, 'play', 'Ada'], ['B', 5, 'play', 'Bo'], ['C', 0, 'academy', 'Cy'], ['D', 5, 'away', 'Di'], ['E', 1, 'play', 'Ed']]);
  c.t += 1000; S.presence.apply(act('A', { k: 'zone', v: 5, h: 96 }, 'Ada'), 'A');
  c.t += 1000; S.presence.apply(act('B', { k: 'swap', d: 'Ada', h: 97 }, 'Bo'), 'B');
  c.t += 20000;
  const html = I.liveHTML(S, {});
  assert.match(html, /<span class="chip good"[^>]*>Live<\/span>/);
  assert.doesNotMatch(html, /Updates every 4 s/);
  assert.match(html, /5 students here: 3 playing, 1 in the Academy, 1 away/);
  const cols = items(html, 'in-dist');
  assert.equal(cols.length, 16, 'sixteen districts');
  assert.match(html, /aria-label="Students by the district they are in now"/);
  assert.ok(cols[4].includes('data-n="2"') && cols[4].includes(`aria-label="District 5, ${ZONES[5].name}: 2 students"`), 'Ada and Bo are in district 5; Di is away and stands in none');
  assert.ok(cols[0].includes('data-n="1"') && cols[0].includes('1 student"'), 'one student is singular');
  assert.match(html, /<div role="log" aria-live="off" aria-label="What students just did"><ol class="in-feed">/, 'a log that is a region of its own, with a list inside it');
  const feed = items(html, 'in-feed');
  assert.match(feed[0], /Bo<\/b> <span class="tiny mute">B<\/span> swapped with Ada/, 'the alias and, beside it, the Founder ID: two students called Sam are told apart'); assert.match(feed[0], /20 s ago/);
  assert.match(feed[1], new RegExp(`Ada</b> <span class="tiny mute">A</span> opened ${ZONES[5].name}`)); assert.match(feed[1], /Day 5/, 'the game day it happened on (hour 96 is the start of day 5)');
  assert.ok(feed.length === 7 && /joined the room/.test(feed[6]), 'five students joined, two things happened: seven rows');
  for (let i = 0; i < 40; i++) S.presence.apply(act('E', { k: 'milestone', v: 1 }, 'Ed'), 'E');
  assert.equal(items(I.liveHTML(S, {}), 'in-feed').length, 12, 'the last dozen');
});

test('D2: an alias or a note that is markup is shown as text, in the panel and in the roster', () => {
  const { S } = dash();
  const evil = '<img src=x onerror=a()>', quote = '"><script>alert(2)</script>'; // (an alias is cut at 24 characters: the first fits whole)
  fill(S, [['A', 5, 'play', evil], ['B', 2, 'play', quote]]);
  S.presence.apply(act('A', { k: 'swap', d: '<b>Bo</b>' }, evil), 'A');
  const html = I.liveHTML(S, {});
  assert.doesNotMatch(html, /<img src=x|<script|<b>Bo/, 'no markup of theirs reaches the page');
  assert.match(html, /&lt;img src=x onerror=a\(\)&gt;/);
  assert.match(html, /swapped with &lt;b&gt;Bo&lt;\/b&gt;/, 'a note is text too');
  S.peers.set('A', { pid: 'A', handle: evil, role: 'student', clean: true, seen: Date.now(), snap: C.cleanSnap({ handle: evil, hour: 96, flags: {}, nw: 500 }, 'A') });
  const grade = I.instructorParts(S, {}).grade;
  assert.doesNotMatch(grade, /<img src=x/);
});

test('D3: a room that cannot carry presence says it updates every 4 seconds and shows no feed it does not have', () => {
  for (const [name, o] of [['a relay of before presence', { can: false }], ['a room between tabs', { kind: 'local', can: false }], ['a table that has not loaded yet', { table: false }]]) {
    const { S } = dash(o);
    const html = I.liveHTML(S, {});
    assert.match(html, /<span class="chip warn"[^>]*>Updates every 4 s<\/span>/, name);
    assert.doesNotMatch(html, />Live</, name);
    assert.doesNotMatch(html, /in-feed|in-dist/, name + ': no feed and no chart it has no data for');
    assert.match(html, /relay|load/i, name + ': it says what is needed');
    assert.match(html, /<span class="sr">[^<]*(relay|load)[^<]*<\/span>/i, name + ': and a reader who has no hover is told too');
  }
  assert.match(I.liveHTML(dash({ table: false }).S), /did not load[^"<]*tries again/i, 'a table that failed to load is said to be loading, not blamed on the relay');
  assert.doesNotMatch(I.liveHTML(dash({ can: false }).S), /did not load/, 'and an older relay is said to be one');
  const S = new Session(); S.mode = 'instructor'; S.roomInfo = { code: 'OLD', relay: '', role: 'instructor' }; S.room = { kind: 'local', state: 'open' }; // a room object with no `can` at all (what earlier tests build)
  assert.doesNotThrow(() => I.liveHTML(S, {}));
  assert.match(I.liveHTML(S, {}), /Updates every 4 s/);
  assert.match(I.instructorParts(S, {}).live, /Updates every 4 s/, 'and the dashboard hands the panel on');
  const grade = I.instructorParts(S, {}).grade;
  assert.doesNotMatch(grade, /<th scope="col">Now<\/th>/, 'no Now column where nothing says where anyone is');
  assert.match(grade, /colspan="10"/, 'and the empty row spans the ten columns it has');
});

test('D4: a live room nobody is in says so', () => {
  const { S } = dash();
  const html = I.liveHTML(S, {});
  assert.match(html, /No student is here yet\./); assert.match(html, /Nothing yet\./);
  assert.equal(items(html, 'in-dist').length, 16); assert.ok(items(html, 'in-dist').every((li) => li.includes('data-n="0"')));
});

test('D5: the age of a row is in words', () => {
  const t = I.ageText;
  assert.deepEqual([0, 4999, 5000, 59999, 60000, 3599999, 3600000, 7200000, -50, NaN, undefined].map(t), ['just now', 'just now', '5 s ago', '59 s ago', '1 min ago', '59 min ago', '1 h ago', '2 h ago', 'just now', 'just now', 'just now']);
});

test('D6: the roster has a "Now" column: the district a student is in, or Academy, or away; and the empty row spans the table', () => {
  const { S } = dash();
  const hour = 24 * 4;
  const peer = (pid, nw) => S.peers.set(pid, { pid, handle: pid, role: 'student', clean: true, seen: Date.now(), snap: C.cleanSnap({ handle: pid, hour, flags: {}, nw }, pid) });
  for (const [pid, nw] of [['A', 900], ['B', 800], ['C', 700], ['D', 600], ['E', 500], ['F', 400]]) peer(pid, nw);
  fill(S, [['A', 5, 'play'], ['B', 0, 'academy'], ['C', 3, 'away'], ['F', 4, 'play']]);
  S.presence.apply({ t: 'bye', from: 'F', role: 'student' }, 'F'); // F was in district 4 and has left: nobody is where they were
  const grade = I.instructorParts(S, {}).grade;
  const head = [...grade.matchAll(/<th scope="col">([^<]*)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(head.slice(0, 5), ['Founder', 'Backgrounds', 'District', 'Now', 'Net worth']);
  const row = (pid) => (new RegExp(`<tr><td>${pid} [\\s\\S]*?</tr>`).exec(grade) || [''])[0];
  assert.match(row('A'), new RegExp(`<td[^>]*>${ZONES[5].short}</td>`), 'district 5 by its short name');
  assert.match(row('B'), /<td[^>]*>Academy<\/td>/); assert.match(row('C'), /<td[^>]*>away<\/td>/);
  assert.match(row('D'), /<td[^>]*class="mute"[^>]*>-<\/td>/, 'a student the table has not heard from');
  assert.match(row('F'), /<td[^>]*class="mute"[^>]*>-<\/td>/, 'and one who has left is not shown where they were');
  const empty = dash().S;
  const g2 = I.instructorParts(empty, {}).grade;
  assert.match(g2, new RegExp(`<td colspan="${[...g2.matchAll(/<th scope="col">/g)].length}" class="mute">Waiting for students`), 'the empty row spans every column');
  assert.equal(I.gradebookCSV(S).split('\n')[0], ['founder_id', 'alias', 'background_1', 'background_2', 'district_reached', 'level', 'net_worth', 'eei', 'economic_percentile', 'economic_points_of_30', 'adaptability_points_of_20', 'peer_market_points_of_10', 'auto_subtotal_of_60', 'reflection_points_of_40', 'p2p_swaps', 'flagged_trades', 'virtual_days_played', 'adaptability_graded'].map((h) => `"${h}"`).join(','), 'the export is as it was: where a student is now is not a grade');
});

test('D8: a student reading the Debrief is counted and shown as that', () => {
  const { S } = dash();
  fill(S, [['A', 3, 'debrief', 'Ada'], ['B', 3, 'play', 'Bo']]);
  assert.match(I.liveHTML(S, {}), /2 students here: 1 playing, 1 in the Debrief/);
  S.peers.set('A', { pid: 'A', handle: 'Ada', role: 'student', clean: true, seen: Date.now(), snap: C.cleanSnap({ handle: 'Ada', hour: 96, flags: {}, nw: 500 }, 'A') });
  assert.match(I.instructorParts(S, {}).grade, /<td>Debrief<\/td>/);
});

test('D7: a presence event patches the panel alone, once for a burst; a tick repaints everything as it did; nothing is patched after the page is gone', async () => {
  const { S, c } = dash();
  let students = 0; const real = S.students.bind(S); S.students = (...a) => { students++; return real(...a); };
  const live = page['#ilive']; let sets = 0; let html = '';
  Object.defineProperty(live, 'innerHTML', { configurable: true, get: () => html, set: (v) => { sets++; html = v; } });
  const root = el(); const dashboard = I.mountInstructor(root, S, { onClose() {} });
  assert.ok(sets >= 1 && /Right now/.test(html), 'the first paint includes the panel');
  let built = 0; const realCounts = S.presence.counts.bind(S.presence); S.presence.counts = () => { built++; return realCounts(); }; // (the panel is worked out from the table: once for a burst)
  const fullBefore = students, setsBefore = sets, builtBefore = built;
  fill(S, [['A', 5, 'play', 'Ada']]);
  for (let i = 0; i < 50; i++) { S.presence.apply(act('A', { k: 'milestone', v: 1 }, 'Ada'), 'A'); S.emit('presence'); }
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(students, fullBefore, 'no full repaint: the gradebook was not worked out again');
  assert.equal(built - builtBefore, 1, 'fifty events, the panel worked out once');
  assert.equal(sets - setsBefore, 1, 'fifty events, one patch');
  assert.match(html, /Ada<\/b> <span class="tiny mute">A<\/span> reached milestone 1/); // (the Founder ID stands beside the alias: two students can call themselves the same)
  c.t += 1000; S.emit('change');
  assert.ok(students > fullBefore, 'any other event repaints the whole dashboard, as it did (a tick is held to one in 0.9 s, as before)');
  dashboard.destroy();
  const after = sets;
  S.presence.apply(act('A', { k: 'insolvent' }, 'Ada'), 'A'); S.emit('presence');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(sets, after, 'nothing is patched once the dashboard has been destroyed');
});
