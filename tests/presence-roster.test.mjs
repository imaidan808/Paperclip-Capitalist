// The student's roster (js/ui/roster.js): who is in the room with them, opened from the Room chip. Part 3 of the presence work (docs/ARCHITECTURE.md, "Presence").
//   R1  rows: a name is escaped wherever it came from, a district is named from this page's own table, the states are words, here comes before away, and there is no money in it
//   R2  the switch: "full" names the district, "online" says only here or away (even if a district is handed in), "off" names nobody and says it is off
//   R3  the words: no question, no dash, no emoji, no "zone", no "free", American spelling; the markup is sound (no duplicate ids, every control has a name)
//   R4  the Room chip is a button only where there is a roster to open; everywhere else it is the span it always was
//   R5  Session.rosterOn(): a student in a relay room that took part in presence and has not been switched off; nobody else
//   R6  the dialog: named, focused on its heading, closable, kept up to date while it is open (calmly), and it lets go of the session when it closes
// The relay tests need `npm install` in server/ (skipped without it). Run: node --test tests/presence-roster.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session, Clock } from '../js/session.js';
import { rosterHTML, openRoster } from '../js/ui/roster.js';
import { hudHTML } from '../js/ui/hud.js';
import { ZONES } from '../js/config.js';
import { fakeCtx, checkHTML } from './helpers/ctx.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = !existsSync(join(ROOT, 'server/node_modules/ws')) && 'run npm install in server/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, ms = 6000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) assert.fail(`timed out waiting for ${what}`); await sleep(10); } };
const stub = (people, o = {}) => ({ presenceMode: 'full', handle: 'Ada', classmates: () => people, ...o });
const live = [];
async function startRelay() {
  const { createRelay } = await import('../server/relay.mjs');
  const relay = createRelay({ env: { PORT: '0' }, log: () => {} });
  const port = await relay.listen(0, '127.0.0.1');
  return Object.assign(relay, { url: `ws://127.0.0.1:${port}` });
}
const teacher = (relay, code) => { const t = new Session(); t.pid = 'TEACH'; t.clock = new Clock({ hour: 0, paused: true }); live.push(t); t.joinRoom({ code, relay: relay.url, role: 'instructor', handle: 'Prof' }); return t; };
const student = (relay, code, pid, handle = pid) => { const s = new Session(); s.pid = pid; live.push(s); s.joinRoom({ code, relay: relay.url, role: 'student', handle }); s.startGame({ perks: ['trades', 'pro'], specialty: 'ops', handle }); return s; };
const done = async (relay) => { for (const s of live.splice(0)) { try { s.leaveRoom(); } catch { /* closed */ } } await relay.close(); };

const PEOPLE = [
  { pid: 'P3', name: 'Cy', z: 0, s: 'away' },
  { pid: 'P1', name: 'Zed', z: 5, s: 'play' },
  { pid: 'P2', name: 'bea', z: 0, s: 'academy' },
  { pid: 'P4', name: 'Ann', z: 16, s: 'play' },
  { pid: 'P5', name: 'Dee', z: 0, s: 'debrief' },
];
const ALLOWED_TAGS = new Set(['button', 'h2', 'h3', 'p', 'b', 'span', 'ul', 'li', 'table', 'caption', 'thead', 'tbody', 'tr', 'th', 'td', 'div']);
const tagsOf = (html) => [...html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1].toLowerCase());
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

test('R1: a name is escaped, a district is named from our own table, states are words, here comes before away, and no money is in it', () => {
  const html = rosterHTML(stub(PEOPLE));
  const text = textOf(html);
  assert.match(text, /Zed\s+Metro Hub/, 'a student playing in district 5 is shown in Metro Hub');
  assert.match(text, /Ann\s+Global Exchange/, 'and in district 16, Global Exchange');
  assert.match(text, /bea\s+In the Academy/);
  assert.match(text, /Dee\s+In the Debrief/);
  assert.match(text, /Cy\s+Away/);
  const order = ['Ann', 'bea', 'Dee', 'Zed', 'Cy'].map((n) => html.indexOf('>' + n + '<'));
  assert.ok(order.every((i) => i > 0), 'every name is there: ' + order);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'the ones who are here first, by name (not case-sensitive), then the one who is away');
  assert.match(text, /4 here, 1 away/);
  // nothing the page does not know how to draw gets in, whatever the table holds
  const hostile = [
    { pid: 'H1', name: '<img src=x onerror=alert(1)>', z: 5, s: 'play' }, { pid: 'H2', name: '"><script>alert(2)</script>', z: 0, s: 'away' },
    { pid: 'H3', name: "O'Neil & <b>Sons</b>", z: 99, s: 'play' }, { pid: 'H4', name: 'Eve', z: '5', s: 'play<b>' }, { pid: 'H5', name: 'Fay', z: 5.5, s: 'play', nw: 123456, cash: 7777, money: 99, __proto__: { x: 1 } },
  ];
  const h = rosterHTML(stub(hostile));
  assert.deepEqual([...new Set(tagsOf(h))].filter((t) => !ALLOWED_TAGS.has(t)), [], 'no tag the page did not write');
  assert.ok(!/<img|<script/i.test(h), 'a name is text: the angle bracket of a tag it holds is written as one');
  assert.ok(h.includes('&lt;img src=x onerror=alert(1)&gt;'), 'a name is shown as typed: escaped, not removed');
  assert.ok(textOf(h).includes("O'Neil & <b>Sons</b>"), 'quotes, ampersands and brackets come out as the characters they are');
  assert.match(textOf(h), /Eve\s+Here/, 'a district that is not a whole number in range, or a state that is not a word, is only "here"');
  assert.match(textOf(h), /Fay\s+Here/);
  assert.ok(!/\$|123456|7777|\bnw\b|\bcash\b|\bmoney\b/i.test(h.replace(/<[^>]+>/g, ' ')), 'no money, whatever else the entry carries');
  assert.match(textOf(rosterHTML(stub([]))), /No classmates are here yet/);
});

test('R2: the switch: full names the district, online says here or away only (even if a district is handed in), off names nobody and says it is off', () => {
  const online = rosterHTML(stub(PEOPLE, { presenceMode: 'online' }));
  assert.ok(!/Metro Hub|Global Exchange|Academy|Debrief/.test(online), 'no place in "online"');
  const t = textOf(online);
  assert.match(t, /Zed\s+Here/); assert.match(t, /bea\s+Here/); assert.match(t, /Cy\s+Away/);
  assert.match(t, /shows who is here, not where/, 'and says what the instructor chose');
  const off = rosterHTML(stub(PEOPLE, { presenceMode: 'off' }));
  assert.ok(!/Zed|bea|Cy|Ann|Dee/.test(off), 'nobody is named when it is off');
  assert.match(textOf(off), /Your instructor has turned this off/);
  const full = rosterHTML(stub(PEOPLE));
  assert.match(textOf(full), /Classmates see your alias, the district you are in and whether you are here or away/);
  assert.match(textOf(online), /Classmates see your alias and whether you are here or away/);
  assert.match(textOf(full), /You are Ada/, 'and the student is told which name they appear under');
  for (const mode of ['full', 'online', 'off']) assert.ok(!/<b>Ada<\/b>.*<b>Ada<\/b>/.test(rosterHTML(stub(PEOPLE, { presenceMode: mode }))), 'once');
  assert.match(textOf(rosterHTML(stub(PEOPLE, { handle: '' }))), /You are Founder/, 'a student who has not chosen an alias is shown the placeholder, not a hole');
});

test('R3: the words are plain and the markup is sound', () => {
  for (const mode of ['full', 'online', 'off']) {
    const html = rosterHTML(stub(PEOPLE, { presenceMode: mode }));
    const text = textOf(html);
    assert.ok(!/\?/.test(text), mode + ': a statement, not a question');
    assert.ok(!/[–—]/.test(html), mode + ': no em or en dash');
    assert.ok(!/\bzones?\b/i.test(html) && !/\bfree\b/i.test(text), mode + ': district, never zone; never free');
    assert.ok(!/\b(simply|basically|truly|great|welcome|let's|oops|sorry)\b/i.test(text), mode + ': no filler, no cheer');
    assert.ok(!/[\u{1F000}-\u{1FFFF}☀-➿]/u.test(html), mode + ': no emoji');
    assert.deepEqual(checkHTML(html, 'roster ' + mode), []);
    assert.match(html, /<h2[^>]*autofocus/, 'the heading takes the cursor when the dialog opens (dlg.open)');
    assert.match(html, /<button[^>]*data-close[^>]*>Close<\/button>/, 'and there is a Close');
  }
  assert.match(rosterHTML(stub(PEOPLE)), /<table[^>]*>\s*<caption class="sr">[^<]+<\/caption>/, 'a table with a caption for a screen reader');
  assert.match(rosterHTML(stub(PEOPLE)), /<th scope="col">Classmate<\/th>\s*<th scope="col">Now<\/th>/);
});

test('R4: the Room chip is a button only where there is a roster to open', () => {
  const chip = (patch) => {
    const ctx = fakeCtx();
    Object.assign(ctx.S, { roomInfo: { code: 'ABCD', relay: 'wss://x' }, room: { state: 'open', kind: 'relay' } }, patch);
    return hudHTML(ctx);
  };
  const plain = chip({});
  assert.match(plain, /<span class="chip good">Room ABCD<\/span>/, 'unchanged where there is no roster: solo, instructor, a room between tabs, a relay of the old kind');
  assert.ok(!/data-act="roster"/.test(plain));
  assert.ok(!/data-act="roster"/.test(chip({ rosterOn: () => false })));
  const on = chip({ rosterOn: () => true });
  assert.match(on, /<button class="chip good" data-act="roster" data-fid="room"[^>]*aria-haspopup="dialog"[^>]*>Room ABCD<\/button>/);
  assert.match(on, /aria-label="Room ABCD, who is here"/, 'the name a screen reader says says what it opens');
  assert.ok(!/data-act="roster"/.test(chip({ rosterOn: () => true, room: { state: 'refused', kind: 'relay' } })), 'a room that refused this device has no roster');
  assert.match(chip({ rosterOn: () => true, room: { state: 'connecting', kind: 'relay' } }), /class="chip warn" data-act="roster"/, 'the chip keeps its colors');
  assert.deepEqual(checkHTML(on, 'hud with roster'), []);
});

test('R5: rosterOn() is for a student in a relay room that took part in presence, and not switched off', { skip: SKIP, timeout: 30000 }, async () => {
  const relay = await startRelay();
  try {
    const t = teacher(relay, 'PR05'), a = student(relay, 'PR05', 'ADA', 'Ada');
    assert.equal(a.rosterOn(), false, 'not before the relay has promised the channel and the module has loaded');
    await until(() => a.room.can('here') && a.presence && t.room.can('here') && t.presence, 'both to be welcomed');
    assert.equal(a.rosterOn(), true);
    const caps = a.room.transport.caps, had = [...caps]; caps.delete('here');
    assert.equal(a.rosterOn(), false, 'a relay that has not promised the channel (an old one) has no roster, though the module is loaded');
    for (const c of had) caps.add(c);
    assert.equal(t.rosterOn(), false, 'the instructor has the dashboard');
    t.setPresenceMode('off');
    await until(() => a.presenceMode === 'off', 'the switch to reach Ada');
    assert.equal(a.rosterOn(), false, 'switched off: no roster');
    t.setPresenceMode('online');
    await until(() => a.presenceMode === 'online', 'online');
    assert.equal(a.rosterOn(), true, 'online keeps the roster (who is here)');
    const solo = new Session(); solo.pid = 'SOLO'; live.push(solo);
    assert.equal(solo.rosterOn(), false);
    a.leaveRoom();
    assert.equal(a.rosterOn(), false, 'and a student who has left has none');
  } finally { await done(relay); }
});

/** A dialog the size of what roster.js needs: open(html, opts) keeps what it was given, `el.querySelector` finds the list's body. */
function fakeDlg() {
  let html = '', writes = 0;
  const body = { get innerHTML() { return html; }, set innerHTML(v) { html = v; writes++; }, get writes() { return writes; } };
  const d = { opened: [], closed: 0, body, el: { open: false, querySelector: (q) => (q === '#ro-body' && d.el.open && !d.other ? body : null) }, open(html, o) { d.opened.push([html, o]); d.el.open = true; body.innerHTML = (/id="ro-body">([\s\S]*)<\/div>\s*$/.exec(html) || [])[1] || ''; return d.el; }, close() { if (!d.el.open) return; d.el.open = false; d.closed++; d.opened.at(-1)?.[1]?.onClose?.(); } };
  return d;
}
function fakeSession(people) {
  const S = stub(people, { listeners: new Set(), on(fn) { S.listeners.add(fn); return () => S.listeners.delete(fn); }, emit(type) { for (const fn of [...S.listeners]) fn(type); } });
  return S;
}

test('R6: the dialog is named, kept up to date calmly while it is open, and lets go of the session when it closes', async () => {
  const S = fakeSession([{ pid: 'P1', name: 'Zed', z: 5, s: 'play' }]), dlg = fakeDlg();
  openRoster({ S, dlg });
  assert.equal(dlg.opened.length, 1);
  const [html, o] = dlg.opened[0];
  assert.equal(o.label, 'Who is here', 'the dialog is named for a screen reader');
  assert.match(html, /Zed/);
  assert.equal(S.listeners.size, 1, 'it listens while it is open');
  // a burst of news is one redraw, a little later, and it shows the newest
  const people = S.classmates();
  people.push({ pid: 'P2', name: 'Bo', z: 0, s: 'away' }, { pid: 'P3', name: 'Al', z: 0, s: 'academy' });
  for (let i = 0; i < 20; i++) S.emit('presence');
  S.emit('tick'); S.emit('change');
  const w0 = dlg.body.writes;
  await sleep(250);
  assert.ok(!/Bo/.test(dlg.body.innerHTML), 'not at once: a screen reader going down the list is not interrupted by every frame');
  await until(() => /Bo/.test(dlg.body.innerHTML) && /Al/.test(dlg.body.innerHTML), 'the list to catch up', 3000);
  assert.equal(dlg.body.writes, w0 + 1, 'a burst of twenty is one redraw');
  const seen = dlg.body.innerHTML;
  S.presenceMode = 'off'; S.emit('presence');
  await until(() => /turned this off/.test(dlg.body.innerHTML), 'the off notice', 3000);
  assert.notEqual(dlg.body.innerHTML, seen);
  openRoster({ S, dlg });                                       // asked again while it is still listening: the first lets go, the second is the only one
  assert.equal(dlg.opened.length, 2);
  assert.equal(S.listeners.size, 1, 'one listener, not two');
  const chip = { focused: 0, focus() { this.focused++; } };
  globalThis.document = { querySelector: (q) => (q === '[data-act="roster"]' ? chip : null) };   // the page the chip is in
  try { dlg.close(); } finally { delete globalThis.document; }
  assert.equal(chip.focused, 1, 'closed by the student: the cursor goes back to the chip, whichever copy of it the HUD has drawn by now');
  assert.equal(S.listeners.size, 0, 'closed: nothing is listening, nothing is held');
  const after = dlg.body.innerHTML;
  S.classmates().push({ pid: 'P9', name: 'Late', z: 0, s: 'play' }); S.emit('presence'); await sleep(1300);   // a late event after the close does not touch a dialog that is not there
  assert.equal(dlg.body.innerHTML, after);
  assert.equal(dlg.opened.length, 2);
});

test('R6b: when another dialog has taken the place of the roster, it lets go at the next draw and draws nothing into it', async () => {
  const S = fakeSession([{ pid: 'P1', name: 'Zed', z: 5, s: 'play' }]), dlg = fakeDlg();
  openRoster({ S, dlg });
  assert.equal(S.listeners.size, 1);
  dlg.other = true;                                              // the dialog is open and holds something else (the roster's own onClose was replaced by that dialog's)
  S.classmates().push({ pid: 'P2', name: 'Bo', z: 0, s: 'away' });
  S.emit('presence');
  const chip = { focused: 0, focus() { this.focused++; } };
  globalThis.document = { querySelector: () => chip };
  try { await until(() => S.listeners.size === 0, 'the roster to let go', 3000); } finally { delete globalThis.document; }
  assert.ok(!/Bo/.test(dlg.body.innerHTML), 'and it wrote nothing into the other dialog');
  assert.equal(chip.focused, 0, 'and took the cursor from no one: letting go is not a close');
});
