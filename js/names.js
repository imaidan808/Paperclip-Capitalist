// A name a person gave (an alias, as a classmate gave it) made safe to show: the one cleaner every screen that shows a classmate's name goes through (js/session.js `nameOf`: the roster, the tags in the world, the Market's
// Exchange). Pure: no imports. The list of unseen characters is the one of js/presence.js and of server/relay.mjs; it is written as code points and not as escapes, so that nothing that handles this file can turn them into
// the characters themselves (tests/presence-classmates.test.mjs holds it equal to presence.js's for every code point).
//
// Control, zero-width, direction-changing and blank-rendering characters (the fillers, the blank braille cell, the soft hyphen, the invisible operators, the tag characters) and half of a surrogate pair that has lost the
// other half are no part of a name. The joiners and the variation selectors stay, since an emoji sequence needs them, and a name of nothing else is none.
const UNSEEN = new RegExp('[' + [[0, 0x1f], [0x7f, 0x9f], [0xad], [0x34f], [0x61c], [0x115f, 0x1160], [0x17b4, 0x17b5], [0x180b, 0x180e], [0x200b], [0x200e, 0x200f], [0x2028, 0x2029], [0x202a, 0x202e], [0x2060, 0x2064], [0x2066, 0x2069], [0x2800], [0x3164], [0xfeff], [0xffa0], [0xd800, 0xdfff], [0xe0000, 0xe007f]].map(([a, b]) => String.fromCodePoint(a) + (b ? '-' + String.fromCodePoint(b) : '')).join('') + ']', 'gu');
const JOINERS = new RegExp('^[' + String.fromCodePoint(0x200c) + String.fromCodePoint(0x200d) + String.fromCodePoint(0xfe00) + '-' + String.fromCodePoint(0xfe0f) + ']*$', 'u');

/** A name as it may be shown: no unseen characters, trimmed, at most `n` characters (counted as characters, so an emoji is never cut in half). What has nothing left to see is none, and anything that is not text is no text. */
export const cleanName = (x, n = 24) => {
  if (typeof x !== 'string') return '';
  const t = (x.length > 4 * n ? x.slice(0, 4 * n) : x).replace(UNSEEN, '').trim(); // (no more than four times the length of the name is looked at: a hello may be 32 KB)
  return JOINERS.test(t) ? '' : Array.from(t).slice(0, n).join('').trimEnd();
};
