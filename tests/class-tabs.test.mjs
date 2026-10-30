// The classroom between the tabs of one browser (docs/ARCHITECTURE.md, "A tab is a founder"). The instructor's "Copy student link" gives origin + path + ?room=CODE and nothing else, the title screen and the faculty kit
// say students can join as other tabs of the browser, and until this round it did not work: every tab was the same founder (one Founder ID, one saved run), so the instructor took a student's messages for its own,
// counted nobody, and two student tabs wrote over each other's save.
//
// Part 1 is js/identity.js on its own (pure: the storages are handed in). Part 2 is whole Sessions over the real in-process BroadcastChannel, one fake tab each: its own sessionStorage, one localStorage shared by the whole
// "browser", exactly what a tab of Chrome has. Part 3 is the words. The real browser, with three tabs of one profile, is tests/class-tabs-browser.test.mjs.
// Run: node --test tests/class-tabs.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openTab, makeKv, sweepTabs, isFounderName, isTabSlot, MAIN, TAB_RECORD, CLAIM_MS, TOUCH_MS, KEEP_MS, KEEP_MAX } from '../js/identity.js';
import { Session, Clock, describeSave } from '../js/session.js';

// the page's own localStorage is looked up when it is used; the instructor dashboard module reads its settings from it as it loads
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { instructorParts, gradebookCSV } = await import('../js/ui/instructor.js');

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const until = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 20)); } throw new Error('timed out: ' + fn); };

/** A Storage, with the parts of the real one that the code uses (length and key() let a sweep list it). */
class Mem {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
/** The keys a browser holds for one slot, as { name: text }. */
const keysOf = (local, slot) => Object.fromEntries([...local.m].filter(([k]) => k.startsWith('pc.') && k.endsWith('.' + slot)).map(([k, v]) => [k.slice(3, -(slot.length + 1)), v]));
const names = (local, slot) => Object.keys(keysOf(local, slot)).sort();
const clockOf = (t0 = 1.7e12) => { const c = { t: t0, now: () => c.t }; return c; };
/** A tab of a browser: its own sessionStorage and page (`instance`), the browser's localStorage and clock. */
function tabOf(browser, { search = '', session = new Mem(), instance } = {}) {
  const t = openTab({ search, local: browser.local, session, now: browser.clock.now, ...(instance ? { instance } : {}) });
  return { t, session, search, browser, kv: makeKv(t, browser.local) };
}
const newBrowser = () => ({ local: new Mem(), clock: clockOf() });

// ===================================================================================================================================== 1. which keyspace a name is in
test('the names a founder owns are listed, and nothing else is: the browser keeps its settings, the Academy, the Codex, the relay address and an instructor\'s room', () => {
  for (const n of ['pid', 'key', 'handle', 'save', 'ckdays', 'reflection', 'ck.0', 'ck.7', 'ck.90']) assert.equal(isFounderName(n), true, n);
  for (const n of ['settings', 'academyDone', 'academy', 'academyRewards', 'codexSeen', 'assist', 'relay', 'owners', 'instr', 'roster', 'ck', 'ck.', 'ck.x', 'ck.1.2', 'constructor', '__proto__', '', undefined, null, 5]) assert.equal(isFounderName(n), false, String(n));
  assert.equal(isTabSlot('t-abcdefgh'), true);
  for (const s of ['main', 'run1', 't-', 't-abc', 'T-ABCDEFGH', 't-abcdefgh/x', 't-ab cdefgh', undefined, null, 7, 't-' + 'a'.repeat(13)]) assert.equal(isTabSlot(s), false, String(s));
});

test('a tab with no slot in its address keeps every name where the game has always put it (pc.<name>.main); ?slot=name puts them all in that slot, as before', () => {
  const br = newBrowser(), a = tabOf(br);
  assert.deepEqual([a.t.base, a.t.own, a.t.explicit, a.t.isOwn()], [MAIN, MAIN, false, false]);
  for (const n of ['pid', 'save', 'settings', 'ck.3', 'academyDone', 'owners']) a.kv.set(n, n + '!');
  assert.deepEqual(names(br.local, 'main'), ['academyDone', 'ck.3', 'owners', 'pid', 'save', 'settings']);
  assert.equal(a.kv.get('save'), 'save!'); a.kv.setRaw('ck.4', '{"x":1}'); assert.equal(a.kv.getRaw('ck.4'), '{"x":1}'); a.kv.del('save'); assert.equal(a.kv.get('save'), null);
  const named = tabOf(br, { search: '?slot=run1&room=ABCD' });
  assert.deepEqual([named.t.base, named.t.own, named.t.explicit], ['run1', 'run1', true]);
  for (const n of ['pid', 'save', 'settings']) named.kv.set(n, 'x');
  assert.deepEqual(names(br.local, 'run1'), ['pid', 'save', 'settings']);
  assert.equal(named.t.take(), false, 'the person named a slot: nothing takes another');
  assert.equal(named.t.canTake(), false);
});

// ===================================================================================================================================== 2. taking a slot, refreshing, copying
test('a tab that takes a slot moves the founder\'s names there and leaves the rest where they were; the browser\'s own slot is never written by it', () => {
  const br = newBrowser(), solo = tabOf(br);
  for (const n of ['pid', 'key', 'handle', 'save', 'ckdays', 'ck.2', 'reflection']) solo.kv.set(n, 'main-' + n);
  for (const n of ['settings', 'academyDone', 'relay', 'owners']) solo.kv.set(n, 'main-' + n);
  const before = JSON.stringify(keysOf(br.local, 'main'));
  const stu = tabOf(br);
  assert.equal(stu.kv.get('pid'), 'main-pid', 'a fresh tab starts as the browser\'s founder');
  assert.equal(stu.t.canTake(), true);
  assert.equal(stu.t.take(), true);
  assert.match(stu.t.own, /^t-[a-z0-9]{8}$/); assert.equal(stu.t.base, MAIN); assert.equal(stu.t.isOwn(), true); assert.equal(stu.t.canTake(), false);
  assert.equal(stu.session.getItem(TAB_RECORD), stu.t.own, 'the tab remembers its slot for a refresh');
  assert.equal(stu.kv.get('pid'), null, 'the new founder has no Founder ID yet');
  for (const n of ['pid', 'key', 'handle', 'save', 'ckdays', 'ck.2', 'reflection']) { assert.equal(stu.kv.get(n), null, n); stu.kv.set(n, 'tab-' + n); }
  for (const n of ['settings', 'academyDone', 'relay', 'owners']) assert.equal(stu.kv.get(n), 'main-' + n, n + ' is the browser\'s');
  stu.kv.set('settings', 'changed');
  assert.equal(solo.kv.get('settings'), 'changed', 'a setting changed in the tab is the browser\'s');
  solo.kv.set('settings', 'main-settings');
  assert.equal(solo.kv.get('pid'), 'main-pid'); assert.equal(solo.kv.get('save'), 'main-save');
  assert.deepEqual(names(br.local, stu.t.own), ['ck.2', 'ckdays', 'claim', 'handle', 'key', 'pid', 'reflection', 'save'].sort());
  assert.equal(JSON.stringify(keysOf(br.local, 'main')), before, 'every other key of the browser\'s slot is byte for byte what it was');
  assert.equal(stu.t.take(), false, 'a second take changes nothing');
});

test('two tabs never share a slot, even when the dice give the same one twice', () => {
  const br = newBrowser(), seq = [0.11, 0.11, 0.11, 0.11, 0.11, 0.11, 0.11, 0.11, 0.7, 0.2, 0.9, 0.4, 0.5, 0.6, 0.3, 0.8];
  const rand = () => { const v = seq[i++ % seq.length]; return v; };
  let i = 0;
  const open = () => openTab({ local: br.local, session: new Mem(), now: br.clock.now, rand });
  const a = open(), b = open();
  assert.ok(a.take()); i = 0; assert.ok(b.take());
  assert.notEqual(a.own, b.own);
  a.take(); b.take();
  const slots = new Set(); for (let n = 0; n < 40; n++) { const t = openTab({ local: br.local, session: new Mem(), now: br.clock.now }); t.take(); slots.add(t.own); }
  assert.equal(slots.size, 40);
});

test('a refresh of the tab is the same founder; a tab with nothing in its sessionStorage is a new one', () => {
  const br = newBrowser(), a = tabOf(br); a.t.take();
  a.kv.set('pid', 'PC-AAAA');
  // the page goes away the usual way (pagehide lets the claim go) and the same tab opens the address again
  a.t.release();
  const again = tabOf(br, { session: a.session });
  assert.equal(again.t.own, a.t.own); assert.equal(again.kv.get('pid'), 'PC-AAAA');
  // the page is killed (no pagehide): the claim goes stale in a few seconds and the tab, refreshed, is still that founder
  br.clock.t += CLAIM_MS + 1;
  const later = tabOf(br, { session: a.session });
  assert.equal(later.t.own, a.t.own);
  // a new tab has an empty sessionStorage: the browser's founder until it takes a slot, and then another
  const fresh = tabOf(br); assert.equal(fresh.t.own, MAIN); fresh.t.take(); assert.notEqual(fresh.t.own, a.t.own);
  // the sessionStorage of a closed tab that comes back (Reopen closed tab) is the same founder
  fresh.t.release();
  const reopened = tabOf(br, { session: fresh.session }); assert.equal(reopened.t.own, fresh.t.own);
});

test('a copy of a tab that is still open (Duplicate tab hands over its sessionStorage) is not that founder; it is a new tab and takes its own slot', () => {
  const br = newBrowser(), a = tabOf(br); a.t.take();
  a.kv.set('pid', 'PC-AAAA');
  br.clock.t += TOUCH_MS; a.t.touch();                                   // the open tab keeps its claim fresh
  const copy = new Mem(); copy.setItem(TAB_RECORD, a.session.getItem(TAB_RECORD));
  br.clock.t += 1500;
  const dup = tabOf(br, { session: copy });
  assert.equal(dup.t.own, MAIN, 'the slot is claimed by a tab that is alive');
  assert.equal(copy.getItem(TAB_RECORD), null, 'the copy forgets it');
  assert.equal(dup.t.take(), true); assert.notEqual(dup.t.own, a.t.own);
  // the original is untouched, and a refresh of it is still it
  a.t.release(); const re = tabOf(br, { session: a.session }); assert.equal(re.t.own, a.t.own); assert.equal(re.kv.get('pid'), 'PC-AAAA');
  // a copy opened after the original closed is simply the next page of that founder
  const last = new Mem(); last.setItem(TAB_RECORD, a.t.own); re.t.release();
  assert.equal(tabOf(br, { session: last }).t.own, a.t.own);
});

test('touch keeps a claim fresh at most every TOUCH_MS and writes nothing for a tab that is not a founder of its own; release marks the claim gone', () => {
  const br = newBrowser(), plain = tabOf(br);
  plain.t.touch(); plain.t.release();
  assert.equal(br.local.length, 0, 'the browser\'s founder claims nothing');
  const a = tabOf(br); a.t.take();
  const claim = () => JSON.parse(br.local.getItem('pc.claim.' + a.t.own));
  const t0 = claim().at;
  br.clock.t += TOUCH_MS - 1; a.t.touch(); assert.equal(claim().at, t0);
  br.clock.t += 1; a.t.touch(); assert.equal(claim().at, br.clock.t);
  a.t.release(); assert.equal(claim().gone, true);
  br.clock.t += 5; a.t.touch(); assert.equal(claim().gone, undefined, 'a page that comes back from the cache claims again');
});

test('slots of tabs gone for a month are swept with everything in them, and never the browser\'s, a named slot, a live tab or the tab asking', () => {
  const br = newBrowser(), now = br.clock.now;
  const old = tabOf(br), mid = tabOf(br), live = tabOf(br);
  for (const x of [old, mid, live]) { x.t.take(); for (const n of ['pid', 'key', 'handle', 'save', 'ck.1', 'ckdays', 'reflection']) x.kv.set(n, 'v'); }
  old.t.release(); mid.t.release();
  br.clock.t += KEEP_MS - 1000; live.t.touch(); mid.t.touch(); mid.t.release();
  br.clock.t += 2000;                                                      // old: 30 days and a second; mid: a second less; live: touched a moment ago
  br.local.setItem('pc.save.main', 'solo'); br.local.setItem('pc.pid.run1', 'named'); br.local.setItem('pc.save.t-zzzzzzzz', 'a named slot that looks like a tab\'s but made no claim');
  const asking = tabOf(br);
  assert.deepEqual(sweepTabs(br.local, 'nobody', now()), [old.t.own], 'it names what it removed');
  assert.deepEqual(names(br.local, old.t.own), [], 'every key of it, its claim included');
  asking.t.take();
  assert.ok(names(br.local, mid.t.own).length >= 7 && names(br.local, live.t.own).length >= 7);
  assert.equal(br.local.getItem('pc.save.main'), 'solo'); assert.equal(br.local.getItem('pc.pid.run1'), 'named'); assert.equal(br.local.getItem('pc.save.t-zzzzzzzz'), 'a named slot that looks like a tab\'s but made no claim');
  assert.deepEqual(sweepTabs(br.local, asking.t.own, now()), [], 'nothing more to sweep');
  // beyond the newest KEEP_MAX the oldest go, even when they are young; a live one never does
  const many = newBrowser(); const made = [];
  for (let i = 0; i < KEEP_MAX + 5; i++) { const x = tabOf(many); x.t.take(); x.kv.set('save', i); x.t.release(); made.push(x.t.own); many.clock.t += 60000; }
  const own = tabOf(many); own.t.take();
  const left = [...many.local.m.keys()].filter((k) => k.startsWith('pc.claim.')).length;
  assert.equal(left, KEEP_MAX, 'the newest KEEP_MAX slots, the asking tab\'s among them');
  assert.equal(many.local.getItem('pc.save.' + made[0]), null); assert.equal(many.local.getItem('pc.save.' + made[made.length - 1]), '' + (KEEP_MAX + 4));
});

test('a storage that cannot be listed (a stand-in with no key()) sweeps nothing; one that throws on every call costs no throw anywhere', () => {
  const bare = new Map(), thin = { getItem: (k) => (bare.has(k) ? bare.get(k) : null), setItem: (k, v) => bare.set(k, String(v)), removeItem: (k) => bare.delete(k) };
  const t = openTab({ local: thin, session: new Mem() }); assert.ok(t.take()); makeKv(t, thin).set('pid', 'P'); assert.equal(makeKv(t, thin).get('pid'), 'P');
  assert.deepEqual(sweepTabs(thin, t.own), []);
  const boom = () => { throw new Error('private window'); };
  const dead = { getItem: boom, setItem: boom, removeItem: boom, key: boom, get length() { return boom(); } };
  const deadSession = { getItem: boom, setItem: boom, removeItem: boom };
  const u = openTab({ local: dead, session: deadSession });
  assert.equal(u.take(), true, 'the tab is a founder of its own for as long as the page lives, though nothing can be remembered');
  u.touch(); u.release();
  const kv = makeKv(u, dead);
  assert.equal(kv.get('pid'), null); assert.equal(kv.set('pid', 'P'), false); assert.equal(kv.setRaw('ck.1', 'x'), false); assert.equal(kv.getRaw('ck.1'), null); assert.doesNotThrow(() => kv.del('pid'));
  assert.doesNotThrow(() => openTab({ local: () => { throw new Error('blocked'); }, session: () => undefined }).take());
  assert.doesNotThrow(() => openTab({ search: 'slot=%E0%A4%A', local: null, session: null }));
});

// ===================================================================================================================================== 3. whole sessions over the room
const sessions = [];
const sessionOf = (tb) => { const S = new Session({ kv: tb.kv }); sessions.push(S); tb.S = S; return S; };
after(() => { for (const S of sessions) { try { S.room?.transport.close(); } catch { /* closed */ } } });
let seq = 0;
const roomCode = () => 'TAB' + (++seq) + Math.random().toString(36).slice(2, 6).toUpperCase();
/** What main.js does when an instructor creates a room. */
function instructorOf(browser, code) {
  const tb = tabOf(browser), S = sessionOf(tb);
  S.mode = 'instructor'; S.clock = new Clock({ hour: 0, paused: true, speed: 1 });
  S.joinRoom({ code, relay: '', role: 'instructor', handle: 'Instructor' });
  return tb;
}
/** What main.js does when a student presses Join, picks two Backgrounds and presses Begin (the address carries no slot). */
function studentOf(browser, code, handle, { session } = {}) {
  const tb = tabOf(browser, session ? { session } : {}), S = sessionOf(tb), room = { code, relay: '' };
  S.takeTabIdentity(room);
  S.joinRoom({ ...room, role: 'student', handle });
  S.startGame({ perks: ['trades', 'pro'], specialty: 'ops', handle });
  return tb;
}
/** A refresh: the old page goes (no 'bye': a page that is closing does not say anything), the same tab loads the address again and presses Resume. */
function refresh(tb) {
  tb.S.save(true); tb.S.room?.transport.close(); tb.t.release();
  const next = tabOf(tb.browser, { session: tb.session, search: tb.search }), S = sessionOf(next);
  return { tb: next, ok: S.restore() };
}
const realStudents = (S) => S.students().filter((s) => !s.synth);

test('the advertised flow: an instructor and two students, each in a tab of one browser, the students opened with the plain student link. Both are counted, with their own IDs and names, and messages go both ways', async () => {
  const br = newBrowser(), code = roomCode();
  const inst = instructorOf(br, code);
  const ada = studentOf(br, code, 'Ada'), grace = studentOf(br, code, 'Grace');
  const ids = [inst.S.pid, ada.S.pid, grace.S.pid];
  assert.equal(new Set(ids).size, 3, 'three founders: ' + ids);
  assert.equal(inst.S.pid, br.local.getItem('pc.pid.main') && JSON.parse(br.local.getItem('pc.pid.main')), 'the instructor is the browser\'s founder, as always');
  assert.notEqual(ada.t.own, grace.t.own);
  await until(() => realStudents(inst.S).length === 2);
  const rows = realStudents(inst.S).sort((a, b) => a.handle.localeCompare(b.handle));
  assert.deepEqual(rows.map((r) => [r.handle, r.pid, r.online]), [['Ada', ada.S.pid, true], ['Grace', grace.S.pid, true]]);
  // the dashboard the instructor sees
  const head = instructorParts(inst.S, {}).head;
  assert.match(head, /<b>2<\/b> students online/);
  assert.match(head, /data-link="\?room=[A-Z0-9]+"/, 'Copy student link is origin + path + ?room=CODE and no slot (location is empty here)');
  assert.doesNotMatch(head, /slot/);
  // instructor -> students: the pace; a student -> the instructor: the snapshot (names, worth); student <-> student: the roster
  inst.S.setSpeed(16);
  await until(() => ada.S.clock.speed === 16 && grace.S.clock.speed === 16 && !ada.S.clock.paused);
  assert.equal(ada.S.instructorPid, inst.S.pid, 'the students hear the instructor under its own ID');
  ada.S.game.s.cash += 250; ada.S._sendSnap(true);
  await until(() => realStudents(inst.S).find((r) => r.pid === ada.S.pid)?.cash >= 250 || realStudents(inst.S).find((r) => r.pid === ada.S.pid)?.nw > 0);
  await until(() => ada.S.roster().some((r) => r.pid === grace.S.pid && !r.npc) && grace.S.roster().some((r) => r.pid === ada.S.pid && !r.npc));
  inst.S.inject('tariff', { when: 0, replace: true });
  await until(() => ada.S.game.s.events.some((e) => e.kind === 'tariff' && e.injected) && grace.S.game.s.events.some((e) => e.kind === 'tariff' && e.injected));
  // the figures keyed by Founder ID: the gradebook, its CSV, the cohort and the saved roster each hold two distinct founders
  inst.S.tick(Date.now() + 10000);
  const gb = inst.S.gradebook().filter((r) => !r.synth);
  assert.deepEqual(gb.map((r) => r.pid).sort(), [ada.S.pid, grace.S.pid].sort());
  const csv = gradebookCSV(inst.S).split('\n').slice(1).map((l) => l.split(',')[0].replace(/"/g, ''));
  assert.deepEqual(csv.sort(), [ada.S.pid, grace.S.pid].sort());
  assert.deepEqual([...inst.S.cohort.peers.keys()].sort(), [ada.S.pid, grace.S.pid].sort());
  assert.deepEqual(JSON.parse(br.local.getItem('pc.roster.main')).peers.map((p) => p.pid).sort(), [ada.S.pid, grace.S.pid].sort());
});

test('a student who refreshes is the same founder: the same ID, name and run, resumed into the same room, and the instructor still counts two, not three', async () => {
  const br = newBrowser(), code = roomCode();
  const inst = instructorOf(br, code), ada = studentOf(br, code, 'Ada'), grace = studentOf(br, code, 'Grace');
  await until(() => realStudents(inst.S).length === 2);
  const pidAda = ada.S.pid, slotAda = ada.t.own, cash = ada.S.game.s.cash;
  ada.S.game.s.cash += 77; ada.S.save(true);
  const { tb: back, ok } = refresh(ada);
  assert.equal(ok, true, 'Resume your run finds the run');
  assert.equal(back.t.own, slotAda); assert.equal(back.S.pid, pidAda); assert.equal(back.S.handle, 'Ada');
  assert.equal(back.S.game.s.cash, cash + 77); assert.equal(back.S.mode, 'student'); assert.equal(back.S.roomInfo.code, code);
  assert.equal(back.S.game.s.pid, pidAda);
  assert.equal(back.S.draftHandle({ code }), 'Ada', 'its own alias, once it is a founder');
  await until(() => back.S.clockHeard && back.S.instructorPid === inst.S.pid);
  back.S._sendSnap(true);
  await until(() => realStudents(inst.S).find((r) => r.pid === pidAda)?.online);
  const rows = realStudents(inst.S);
  assert.equal(rows.length, 2, 'Ada is not counted twice');
  assert.deepEqual(rows.map((r) => r.pid).sort(), [pidAda, grace.S.pid].sort());
  assert.equal(new Set(rows.map((r) => r.handle)).size, 2);
  assert.match(instructorParts(inst.S, {}).head, /<b>2<\/b> students online/);
  // a second refresh, and one while the first page's claim is still fresh (nothing said pagehide yet is not what a browser does, so it is the normal path): still her
  const again = refresh(back); assert.equal(again.ok, true); assert.equal(again.tb.S.pid, pidAda);
});

test('each tab\'s saved run, alias, key, checkpoints and notes are its own; the browser\'s own slot is not written by a student tab, and an old save there is intact and still loads', async () => {
  const br = newBrowser();
  // an old save, written the way the game wrote it before this round: a solo player in a plain tab, no sessionStorage anywhere
  const solo = tabOf(br), old = sessionOf(solo);
  old.startGame({ perks: ['grad', 'veteran'], specialty: 'growth', handle: 'Olivia' });
  old.game.s.cash += 1234; old.save(true);
  const oldPid = old.pid, oldKeys = keysOf(br.local, MAIN), oldSave = oldKeys.save;
  assert.ok(oldSave && oldKeys.pid && oldKeys.key && oldKeys.handle, 'a solo run wrote its names under main: ' + Object.keys(oldKeys));
  assert.deepEqual(names(br.local, 't-none'), []);
  const code = roomCode();
  const inst = instructorOf(br, code);                                       // (it is the same browser, and the instructor is the browser's founder: Olivia)
  assert.equal(inst.S.pid, oldPid);
  const ada = studentOf(br, code, 'Ada'), grace = studentOf(br, code, 'Grace');
  ada.S.game.s.cash += 100; ada.S.save(true); grace.S.save(true); ada.S.tick(); grace.S.tick(); // (a tick keeps the daily checkpoints of a student's run)
  ada.kv.set('reflection', 'Ada\'s notes'); grace.kv.set('reflection', 'Grace\'s notes');
  const A = keysOf(br.local, ada.t.own), G = keysOf(br.local, grace.t.own);
  for (const n of ['pid', 'key', 'handle', 'save', 'ckdays', 'reflection']) { assert.ok(A[n] && G[n], n); assert.notEqual(A[n], G[n], n + ' differs between the two tabs'); assert.notEqual(A[n], oldKeys[n], n + ' is not the browser\'s'); }
  assert.deepEqual(Object.keys(A).filter((k) => /^ck\.\d/.test(k)).length > 0 && Object.keys(G).filter((k) => /^ck\.\d/.test(k)).length > 0, true, 'their daily checkpoints are their own');
  assert.equal(JSON.parse(A.save).state.handle, 'Ada'); assert.equal(JSON.parse(G.save).state.handle, 'Grace');
  assert.equal(JSON.parse(A.save).state.pid, ada.S.pid); assert.equal(JSON.parse(G.save).state.pid, grace.S.pid);
  assert.equal(JSON.parse(A.save).mode, 'student'); assert.equal(JSON.parse(A.save).room.code, code);
  // Ada plays on and saves: Grace's run is not touched, and the browser's is the same bytes
  const graceBefore = br.local.getItem('pc.save.' + grace.t.own);
  ada.S.game.s.cash += 5; ada.S.save(true);
  assert.equal(br.local.getItem('pc.save.' + grace.t.own), graceBefore);
  assert.notEqual(br.local.getItem('pc.save.' + ada.t.own), JSON.stringify({ x: 1 }));
  const nowKeys = keysOf(br.local, MAIN);
  for (const n of Object.keys(oldKeys)) assert.equal(nowKeys[n], oldKeys[n], `pc.${n}.main is byte for byte what the solo run wrote`);
  // ...and the instructor's room records are the browser's, written beside them
  assert.ok(nowKeys.owners && nowKeys.instr === undefined);
  // a new tab, with nothing in its sessionStorage, finds the old run and plays it: the same founder, the same run
  const next = tabOf(br), resumed = sessionOf(next);
  assert.equal(next.kv.get('save') != null, true);
  assert.equal(describeSave(next.kv.get('save')).handle, 'Olivia');
  assert.equal(resumed.restore(), true); assert.equal(resumed.pid, oldPid); assert.equal(resumed.game.s.cash, old.game.s.cash); assert.equal(resumed.mode, 'solo');
  // a tab that was a student has no solo run of the browser's in its way, and does not offer one: its own save is what Resume finds
  const aBack = refresh(ada); assert.equal(aBack.ok, true); assert.equal(aBack.tb.S.mode, 'student'); assert.equal(aBack.tb.S.handle, 'Ada');
  // Start over in a student tab deletes its own run and notes of the founder, not the browser's
  aBack.tb.S.reset();
  assert.equal(br.local.getItem('pc.save.' + ada.t.own), null);
  assert.equal(keysOf(br.local, MAIN).save, oldSave);
});

test('a page whose address names a slot keeps everything in it (the old way to run two players in one browser); a relay room keeps the browser\'s ID', () => {
  const br = newBrowser(), code = roomCode();
  const plain = tabOf(br), P = sessionOf(plain);
  const named = tabOf(br, { search: `?slot=s2&room=${code}` }), N = sessionOf(named);
  assert.notEqual(N.pid, P.pid);
  assert.equal(N.takeTabIdentity({ code, relay: '' }), false);
  assert.equal(N.pid, JSON.parse(br.local.getItem('pc.pid.s2')));
  N.joinRoom({ code, relay: '', role: 'student', handle: 'Slot' }); N.startGame({ perks: ['trades', 'pro'], specialty: 'ops', handle: 'Slot' });
  assert.ok(br.local.getItem('pc.save.s2') && !br.local.getItem('pc.save.main'));
  assert.equal([...br.local.m.keys()].filter((k) => /\.t-/.test(k)).length, 0, 'no tab slot was made');
  assert.equal(named.session.length, 0, 'and nothing was put in its sessionStorage');
  // a relay room: the relay binds an ID to its browser\'s key, so the same ID in a new tab must be the same student
  const r = tabOf(br), R = sessionOf(r), id = R.pid, key = R.key;
  assert.equal(R.willTakeTab({ code, relay: 'wss://relay.example.edu' }), false);
  assert.equal(R.takeTabIdentity({ code, relay: 'wss://relay.example.edu' }), false);
  assert.deepEqual([R.pid, R.key, r.t.own], [id, key, MAIN]);
  // no room (a solo run), or a room with no code: nothing to take
  assert.equal(R.takeTabIdentity(null), false); assert.equal(R.takeTabIdentity(undefined), false);
});

test('only before a run: a tab with a run or a room open keeps its ID (the Founder ID inside a running game does not change under it)', () => {
  const br = newBrowser(), code = roomCode(), tb = tabOf(br), S = sessionOf(tb);
  S.startGame({ perks: ['trades', 'pro'], specialty: 'ops', handle: 'Solo' });
  const id = S.pid;
  assert.equal(S.takeTabIdentity({ code, relay: '' }), false);
  assert.equal(S.pid, id); assert.equal(tb.t.own, MAIN);
  S.reset();                                                                  // (Join a room from inside a game resets first, then opens the draft)
  assert.equal(S.takeTabIdentity({ code, relay: '' }), true); assert.notEqual(S.pid, id);
});

test('the alias the draft starts with: none for a tab about to become a founder of its own, the player\'s own everywhere else', () => {
  const br = newBrowser(), code = roomCode();
  const solo = tabOf(br), A = sessionOf(solo); A.startGame({ perks: ['trades', 'pro'], specialty: 'ops', handle: 'Pat' });
  const tb = tabOf(br), S = sessionOf(tb);
  assert.equal(S.handle, 'Pat', 'a fresh tab is the browser\'s founder');
  assert.equal(S.draftHandle({ code, relay: '' }), '', 'but a student tab joining a local room is not Pat');
  assert.equal(S.draftHandle(null), 'Pat'); assert.equal(S.draftHandle(undefined), 'Pat');
  assert.equal(S.draftHandle({ code, relay: 'wss://r.example' }), 'Pat', 'a relay room keeps the browser\'s founder');
  S.takeTabIdentity({ code, relay: '' });
  assert.equal(S.handle, ''); assert.equal(S.draftHandle({ code, relay: '' }), '');
  const named = sessionOf(tabOf(br, { search: '?slot=s9' })); assert.equal(named.draftHandle({ code, relay: '' }), '');
  const named2 = tabOf(br, { search: '?slot=s8' }); named2.kv.set('handle', 'Sam'); assert.equal(sessionOf(named2).draftHandle({ code, relay: '' }), 'Sam');
});

test('the instructor stays the browser\'s founder across a refresh, and its room and recovery code stay in the browser\'s slot whatever the student tabs do', async () => {
  const br = newBrowser(), code = roomCode();
  const inst = instructorOf(br, code), id = inst.S.pid, key = inst.S.recoveryCode();
  assert.match(key, /^([0-9a-f]{4}-){7}[0-9a-f]{4}$/);
  const ada = studentOf(br, code, 'Ada');
  assert.equal(ada.S.recoveryCodeFor(code), key, 'the recovery code is the browser\'s: any tab of it can show it (as before)');
  assert.equal(JSON.parse(br.local.getItem('pc.owners.main'))[code].length, 32);
  assert.equal(names(br.local, ada.t.own).includes('owners'), false);
  const again = tabOf(br), S = sessionOf(again);
  assert.equal(S.pid, id, 'a tab opened later as the instructor is the same founder');
  await until(() => realStudents(inst.S).length === 1);
});

// ===================================================================================================================================== 4. the words
test('the words: the dashboard, the title screen, the faculty kit, the README and the site\'s notes say what works and where it stops', () => {
  const dash = read('js/ui/instructor.js'), main = read('js/main.js'), kit = read('docs/FACULTY_KIT.md'), readme = read('README.md'), arch = read('docs/ARCHITECTURE.md'), llms = read('llms.txt'), comp = read('docs/COMPLIANCE.md');
  assert.doesNotMatch(dash, /open other tabs with \?room=/, 'the hint no longer tells the instructor to open tabs by hand with a code in the address');
  assert.match(dash, /this browser only \(students join from other tabs of this browser with Copy student link; other devices need a relay\)/);
  assert.match(main, /With no relay, students join from other tabs of this browser \(each tab is its own founder\); students on other devices need a relay\./);
  assert.doesNotMatch(main, /as extra tabs/);
  assert.match(kit, /Copy student link/); assert.match(kit, /own tab/); assert.match(kit, /different browser/); assert.match(kit, /relay/);
  assert.doesNotMatch(readme, /use `\?slot=name` to keep saves apart\)/, 'the README no longer sends a classroom to ?slot');
  assert.match(readme, /Copy student link/); assert.match(readme, /sessionStorage/);
  assert.match(arch, /## A tab is a founder/); assert.match(arch, /js\/identity\.js/);
  assert.match(llms, /sessionStorage/); assert.match(comp, /sessionStorage/);
});
