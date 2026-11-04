// Copy pass, part 2: the handlers that mountInstructor and mountDebrief wire, pressed on a stand-in page (no browser). tests/copy2-debrief.test.mjs D6 holds `shockSchedule` against the engine with a record it builds
// by hand; these hold what Deploy, Inject Credit Crunch now and Close room really store, what the page then says, what the toasts say, that a fold stays open, and what the Debrief does for the print.
// Run: node --test tests/copy2-debrief-mount.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };
const win = {};                                                    // the window's `beforeprint` and `afterprint` listeners
globalThis.addEventListener = (t, f) => { (win[t] ||= []).push(f); };
globalThis.removeEventListener = (t, f) => { win[t] = (win[t] || []).filter((x) => x !== f); };
const el = () => ({ children: [], innerHTML: '', _l: {}, contains: () => false, hasAttribute: () => false, querySelector: () => null, querySelectorAll: () => [],
  addEventListener(t, f) { (this._l[t] ||= []).push(f); }, removeEventListener(t, f) { this._l[t] = (this._l[t] || []).filter((x) => x !== f); } });
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (f, ms, ...a) => (ms === 4200 ? 0 : realTimeout(f, ms, ...a));   // a toast takes its leave after 4.2 s, which would hold this process open for nothing
const page = Object.fromEntries(['#ih', '#ikeep', '#icol1', '#icol2', '#igrade', '#dlg', '#wc', '#wc-say'].map((id) => [id, el()]));
const toasts = [];                                                 // the messages the page shows (js/ui/common.js `toast`)
page['#toasts'] = { children: [], appendChild(t) { this.children.push(t); toasts.push(t.textContent); } };
globalThis.document = { querySelector: (s) => page[s], activeElement: null, createElement: () => ({ dataset: {}, classList: { add() {} }, remove() {}, className: '', textContent: '' }) };

const { Session, Clock } = await import('../js/session.js');
const { EVENTS } = await import('../js/config.js');
const C = await import('../js/cohort.js');
const I = await import('../js/ui/instructor.js');
const D = await import('../js/ui/debrief.js');
const { makeGame, run } = await import('./bot.mjs');

const start = (kind) => (EVENTS[kind].day - 1) * 24, day = (h) => Math.floor(h / 24) + 1;
const NOTE = ' Algorithmic surprise events, drawn from the room code and the day, are not listed.';   // shown while the room has them on, which is the default
function instructor(hour, nets = []) {
  store.clear();
  const S = new Session(); S.pid = 'TEACH'; S.mode = 'instructor'; S.clock = new Clock({ hour, paused: true });
  S.roomInfo = { code: 'GRADE', relay: '', role: 'instructor' }; S.sent = []; S.room = { kind: 'local', state: 'open', send: (m) => S.sent.push(m), close() {}, on() {} };
  nets.forEach((nw, i) => S.peers.set('P' + i, { pid: 'P' + i, handle: 'P' + i, role: 'student', clean: true, seen: Date.now(), snap: C.cleanSnap({ handle: 'P' + i, hour, flags: {}, nw }, 'P' + i) }));
  return S;
}
const line = () => (page['#icol1']._html.match(/<p class="tiny mute" title="[^"]*">((?:Scheduled|No shock)[^<]*)<\/p>/) || [])[1];
/** The shocks a student's game still has to come: it is at `from` when the messages arrive and at `now` after them (the way D6 plays it; js/engine.js `injectEvent`). */
const held = (S, from, now) => { const g = makeGame([], 'ops', 3); g.env.algo = false; g.advanceTo(from); for (const m of S.sent.filter((x) => x.t === 'inject')) g.injectEvent(m.kind, m.atHour, { id: m.id, replace: m.replace, injected: true }); g.advanceTo(now); return g.s.events.filter((e) => !e.started).map((e) => `${e.kind}@${e.start}`).sort(); };
/** What a button press shows the user: the toast texts it adds. */
function shown(press) {
  const before = toasts.length;
  page['#toasts'].children.length = 0;
  press();
  return toasts.slice(before);
}

test('M1: Deploy stores what the schedule line needs, the line is what the student\'s game holds, and Close room forgets it', () => {
  const sentAt = start('tariff') - 26, at = sentAt + 72;           // the scheduled Tariff Lock begins inside the 72 hours
  const S = instructor(sentAt), root = el(); let closed = 0;
  I.mountInstructor(root, S, { onClose: () => { closed++; } });
  const acts = root._acts; acts.evsel({ value: 'tariff' }); acts.evwhen({ value: '72' }); acts.evrep({ checked: true });
  assert.equal(line(), `Scheduled: Tariff Lock day ${EVENTS.tariff.day}.${NOTE}`);
  acts.deploy();
  const sent = S.sent.find((x) => x.t === 'inject');
  assert.deepEqual(S.kv.get('shocksent'), { code: 'GRADE', list: [{ id: sent.id, kind: 'tariff', at, from: sentAt, replace: true }] }, 'what was sent, when it was sent, and that it replaced');
  assert.equal(line(), `Scheduled: Tariff Lock day ${day(at)}.${NOTE}`, 'the scheduled copy had not begun when it was sent: it is replaced');
  assert.deepEqual(held(S, sentAt, sentAt), [`tariff@${at}`], 'and that is what the student\'s game holds');
  acts.close();
  assert.equal(closed, 1); assert.equal(S.kv.get('shocksent'), null, 'closing the room forgets what it sent');
});
test('M2: Deploy without Replace adds to the schedule', () => {
  const sentAt = start('tariff') - 26, at = sentAt + 72, S = instructor(sentAt), root = el(); I.mountInstructor(root, S, { onClose() {} });
  root._acts.evsel({ value: 'tariff' }); root._acts.evwhen({ value: '72' }); root._acts.evrep({ checked: false }); root._acts.deploy();
  assert.equal(S.kv.get('shocksent').list[0].replace, false);
  assert.equal(line(), `Scheduled: Tariff Lock day ${EVENTS.tariff.day}, Tariff Lock day ${day(at)}.${NOTE}`);
  assert.deepEqual(held(S, sentAt, sentAt), [`tariff@${start('tariff')}`, `tariff@${at}`]);
});
test('M3: Inject Credit Crunch now replaces the scheduled Credit Crunch, and the line says so', () => {
  const now = start('fed') - 100, S = instructor(now), root = el(); I.mountInstructor(root, S, { onClose() {} });
  assert.equal(line(), `Scheduled: Credit Crunch day ${EVENTS.fed.day}, Tariff Lock day ${EVENTS.tariff.day}.${NOTE}`);
  root._acts.squeeze();
  assert.deepEqual(S.kv.get('shocksent').list.map((x) => [x.kind, x.at, x.from, x.replace]), [['fed', now, now, true]]);
  assert.equal(line(), `Scheduled: Tariff Lock day ${EVENTS.tariff.day}.${NOTE}`);
  assert.deepEqual(held(S, now - 1, now), [`tariff@${start('tariff')}`]);
});
test('M4: a rewind and a shock tell the instructor whom they reached: the students who are online', () => {
  const S = instructor(24 * 30), root = el(); I.mountInstructor(root, S, { onClose() {} });
  assert.deepEqual(shown(() => root._acts.rewind({ dataset: { d: '3' } })), ['Rewind sent to the students who are online.']);
  assert.ok(S.sent.some((m) => m.t === 'rewind'), 'and it was sent');
  root._acts.evsel({ value: 'tariff' }); root._acts.evwhen({ value: '24' });
  assert.deepEqual(shown(() => root._acts.deploy()), ['Event deployed to the students who are online.']);
  assert.ok(S.sent.some((m) => m.t === 'inject'));
});
test('M5: a fold the instructor opened stays open when the panel is drawn again', () => {
  const S = instructor(24 * 5), root = el(); I.mountInstructor(root, S, { onClose() {} });
  assert.ok(!/data-fold="points" open/.test(page['#igrade']._html) && !/data-fold="controls" open/.test(page['#icol1']._html));
  for (const f of root._l.toggle) { f({ target: { dataset: { fold: 'points' }, open: true } }); f({ target: { dataset: { fold: 'controls' }, open: true } }); }
  root._acts.hzsel({ value: '1' });                                // any action that draws the panels again
  assert.ok(/data-fold="points" open/.test(page['#igrade']._html) && /data-fold="controls" open/.test(page['#icol1']._html), 'the grade fold and the controls fold');
});
test('M6: a skewed room raises the Inequality alert, with the button that sends the Credit Crunch', () => {
  const c2 = I.instructorParts(instructor(24 * 5, [1e6, 10, 10, 10]), {}).c2;
  assert.ok(c2.includes('<b>Inequality alert.</b> Gini is above 0.65: a few founders are pulling away. <button class="btn sm" data-act="squeeze">Inject Credit Crunch now</button>'));
});
test('M7: the debrief opens its folds for the print and shuts the ones it opened, and the word count names the range', () => {
  const g = makeGame(['native', 'heir'], 'growth', 11); run(g, { days: 30 });
  const S = new Session(); S.game = g; S.synth = C.makeSynth(11, 'test');
  const folds = [{ open: false }, { open: false }, { open: true }];   // the third was open already
  const root = { ...el(), querySelector: () => ({ focus() {} }), querySelectorAll: (sel) => (sel === 'details[data-print]:not([open])' ? folds.filter((d) => !d.open) : []) };
  const m = D.mountDebrief(root, S, { onBack() {} });
  for (const f of win.beforeprint) f();
  assert.deepEqual(folds.map((d) => d.open), [true, true, true], 'every fold is open for the print');
  for (const f of win.afterprint ?? []) f();
  assert.deepEqual(folds.map((d) => d.open), [false, false, true], 'and the ones it opened are shut again');
  const typed = (n) => { root._acts.notes({ value: Array(n).fill('w').join(' ') }); return page['#wc'].innerHTML; };
  assert.equal(typed(999), '999 words'); assert.equal(typed(1000), '1000 words <span class="green">in range</span>');
  assert.equal(typed(1500), '1500 words <span class="green">in range</span>'); assert.equal(typed(1501), '1501 words <span class="gold">over target</span>');
  m.destroy();
  assert.deepEqual([win.beforeprint, win.afterprint], [[], []], 'leaving the screen takes both listeners off');
});
test('M7: the word count changes silently at every word and is said to a screen reader when the typing pauses or the box is left', () => {
  const g = makeGame(['native', 'heir'], 'growth', 11); run(g, { days: 30 });
  const S = new Session(); S.game = g; S.synth = C.makeSynth(11, 'test');
  const root = { ...el(), querySelector: () => ({ focus() {} }), querySelectorAll: () => [] }, queued = [], realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
  globalThis.setTimeout = (f, ms) => { const t = { f, ms, off: false }; queued.push(t); return t; }; globalThis.clearTimeout = (t) => { if (t) t.off = true; };
  try {
    const m = D.mountDebrief(root, S, { onBack() {} }), say = () => page['#wc-say'].textContent, type = (n) => root._acts.notes({ value: Array(n).fill('w').join(' ') });
    assert.match(root.innerHTML, /<span id="wc" class="mono small">\d+ words?(?: <span class="[a-z]+">[^<]*<\/span>)?<\/span><span id="wc-say" class="sr" aria-live="polite"><\/span>/, 'the count on the page is not a live region; a hidden one beside it is');
    assert.ok(!/id="wc"[^>]*aria-live/.test(root.innerHTML));
    assert.match(root.innerHTML, /<textarea id="notes"[^>]* data-input="notes" data-change="notes-end">/, 'and the box says when it is left');
    page['#wc-say'].textContent = '';
    type(1); assert.equal(page['#wc'].innerHTML, '1 word', 'one word is not "1 words"');
    type(2); type(3); assert.equal(page['#wc'].innerHTML, '3 words', 'the page counts at every word'); assert.equal(say(), '', 'and says nothing while the typing goes on');
    const live = queued.filter((t) => !t.off); assert.equal(live.length, 1, 'one pending announcement, the last: each word cancels the one before'); assert.equal(live[0].ms, D.COUNT_PAUSE_MS);
    live[0].f(); assert.equal(say(), '3 words', 'a pause says the count');
    type(1000); root._acts['notes-end'](); assert.equal(say(), '1000 words in range', 'leaving the box says it at once, in words (no markup)');
    assert.equal(queued.filter((t) => !t.off).length, 0, 'and the pause that was waiting is cancelled');
    type(1501); root._acts['notes-end'](); assert.equal(say(), '1501 words over target');
    page['#wc-say'].textContent = 'changed by nobody'; root._acts['notes-end'](); assert.equal(say(), 'changed by nobody', 'the same count is not said twice');
    type(5); assert.equal(queued.filter((t) => !t.off).length, 1); m.destroy(); assert.equal(queued.filter((t) => !t.off).length, 0, 'leaving the screen cancels a count that was waiting');
  } finally { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; }
});
