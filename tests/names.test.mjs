// The one cleaner for a name a classmate gave (js/names.js, used by Session.nameOf: the roster, the tags in the world, the Market's Exchange). Pure; no relay, no browser.
//   N1  it is the table's own (js/presence.js), every code point: nothing a name may not hold gets through, nothing it may hold is cut
//   N2  what a name keeps and what it loses: blank fillers, overrides, zero-width text, half of a pair; an emoji sequence, a long text, a cut that falls between characters
//   N3  every screen that shows a classmate shows the cleaned name, and the placeholder when nothing visible is left
// Invisible characters are written as code points, not as escapes, so that nothing that handles this file can turn them into the characters themselves. Run: node --test tests/names.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanName } from '../js/names.js';
import { cleanHere, Presence } from '../js/presence.js';
import { Session } from '../js/session.js';
import { rosterBody } from '../js/ui/roster.js';

const cp = (...c) => String.fromCodePoint(...c);

test('N1: the cleaner is the presence table\'s, every code point: nothing a name may not hold gets through, nothing it may hold is cut', () => {
  const bad = [];
  for (let c = 0; c <= 0x10ffff; c++) {
    const x = 'a' + cp(c) + 'b';
    if (cleanName(x) !== cleanHere({ z: 0, s: 'x', handle: x }).handle) bad.push(c.toString(16));
  }
  assert.deepEqual(bad.slice(0, 20), [], 'names.js and presence.js disagree about these code points (' + bad.length + ' in all)');
});

test('N2: what a name keeps and what it loses', () => {
  assert.equal(cleanName('  Ada Lovelace  '), 'Ada Lovelace');
  assert.equal(cleanName('Ada' + cp(0x200b)), 'Ada', 'a trailing zero-width space does not make a second Ada');
  assert.equal(cleanName(cp(0x202e) + 'tobor'), 'tobor', 'a right-to-left override is cut, so the text is not shown backwards');
  for (const blank of [cp(0x3164), cp(0x2800), cp(0x200b, 0x200b), cp(0xffa0), '   ', cp(0x200d), cp(0xfe0f), cp(0x2800, 0x3164, 0xffa0)]) assert.equal(cleanName(blank), '', 'a name of nothing that can be seen is none: ' + [...blank].map((ch) => ch.codePointAt(0).toString(16)).join(' '));
  assert.equal(cleanName('a' + cp(0xd83d) + 'b'), 'ab', 'half of a pair is no character'); assert.equal(cleanName(cp(0xde00)), '');
  assert.equal(cleanName(cp(0x1f468, 0x200d, 0x1f469)), cp(0x1f468, 0x200d, 0x1f469), 'an emoji sequence keeps its joiner');
  assert.equal(cleanName('é'.repeat(40)), 'é'.repeat(24), 'cut at 24 characters');
  assert.equal(cleanName('a'.repeat(23) + cp(0x1f600) + 'zzz'), 'a'.repeat(23) + cp(0x1f600), 'the cut falls between characters: the emoji is the 24th, whole');
  assert.equal(cleanName('Ada' + cp(0x200b).repeat(5000) + 'Lovelace'), 'Ada', 'a flood is cut before it is looked at');
  for (const x of [null, undefined, 5, {}, [], true]) assert.equal(cleanName(x), '', 'what is not text is no text');
  assert.equal(cleanName('Ada Lovelace', 3), 'Ada');
});

test('N3: every screen that shows a classmate shows the cleaned name, and the placeholder when nothing visible is left', () => {
  const a = new Session(); a.pid = 'ADA'; a.mode = 'student'; a.presence = new Presence({ now: () => 0 }); a.room = { kind: 'relay', can: () => true };
  const hostile = [['PC-0001', cp(0x200b, 0x200b)], ['PC-0002', cp(0x2800)], ['PC-0003', cp(0x3164)], ['PC-0004', cp(0x202e) + 'tobor'], ['PC-0005', 'Vic' + cp(0x200b)], ['PC-0006', 'a'.repeat(23) + cp(0xd83d)], ['PC-0007', '<b>x</b>']];
  for (const [pid, handle] of hostile) { a._onMsg({ t: 'hello', from: pid, role: 'student', handle }); a._onMsg({ t: 'here', from: pid, role: 'student', z: 1, s: 'play' }); }
  assert.deepEqual(['PC-0001', 'PC-0002', 'PC-0003'].map((p) => a.nameOf(p)), ['Founder-0001', 'Founder-0002', 'Founder-0003'], 'nothing visible is left: the placeholder every player starts with');
  assert.equal(a.nameOf('PC-0004'), 'tobor'); assert.equal(a.nameOf('PC-0005'), 'Vic'); assert.equal(a.nameOf('PC-0006'), 'a'.repeat(23), 'half of a pair is cut out, not shown as a replacement character'); assert.equal(a.nameOf('PC-0007'), '<b>x</b>');
  const html = rosterBody(a), unseen = new RegExp('[' + cp(0x200b, 0x2800, 0x3164, 0x202e, 0xd83d) + ']');
  assert.doesNotMatch(html, unseen, 'the roster holds nothing invisible and nothing that reorders the text');
  assert.match(html, /<th scope="row">tobor<\/th>/); assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/, 'markup is escaped where it is shown');
  assert.doesNotMatch(html, /<b>x<\/b>/);
});
