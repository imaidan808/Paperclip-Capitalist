// A person is a flat disc with an initial, not an emoji (docs/COPY.md rule 7, docs/ART_DIRECTION.md 3.6). One shape for every buyer, one calm matte tone per style.
// The tones live twice: as --ava-* tokens in css/styles.css (the screens) and as AVATAR_TONE in js/avatar.js (the canvas, which cannot read a token). This file keeps the two equal,
// holds the letter and the disc to the contrast the rest of the interface keeps, and checks the helpers that draw it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUYERS } from '../js/config.js';
import { BUYER_STYLES } from '../js/data/schema.js';
import { AVATAR_TONE, initialOf, avatarHTML, marksOf } from '../js/avatar.js';

const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
const block = (re) => { const m = css.match(re); const o = {}; for (const [, k, v] of (m?.[1] || '').matchAll(/--([\w-]+):\s*([^;]+);/g)) o[k] = v.trim(); return o; };
const base = block(/:root\s*\{([^}]*)\}/);
const high = { ...base, ...block(/:root\[data-contrast="high"\]\s*\{([^}]*)\}/) };
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return [16, 8, 0].map((s) => (n >> s) & 255).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const STYLES = [...BUYER_STYLES, 'steady']; // the auctioneer and the repair bench are steady

test('one tone per style: the four buyer styles and the steady of the auctioneer and the bench, all different, and the canvas draws the screens\' tones', () => {
  assert.deepEqual(Object.keys(AVATAR_TONE).sort(), [...STYLES].sort());
  assert.equal(new Set(Object.values(AVATAR_TONE)).size, STYLES.length, 'no two styles share a tone');
  for (const k of STYLES) {
    assert.equal(base[`ava-${k}`], AVATAR_TONE[k], `--ava-${k} in css/styles.css is AVATAR_TONE.${k} in js/avatar.js`);
    assert.equal(high[`ava-${k}`], AVATAR_TONE[k], `and the high-contrast theme keeps it`);
  }
  assert.ok(Object.isFrozen(AVATAR_TONE));
  for (const k of BUYER_STYLES) assert.match(css, new RegExp(`\\.ava\\[data-style=${k}\\] \\{ background: var\\(--ava-${k}\\); \\}`), `${k}: the sheet tints a disc of that style`);
  assert.match(css, /\.ava \{[^}]*background: var\(--ava-steady\);/, 'a disc with no style (or an unknown one) is the steady tone');
  assert.match(css, /@media \(forced-colors: active\) \{ \.ava \{ forced-color-adjust: none; \} \}/, 'forced colors keep the tone: it is the only thing that tells the styles apart');
});

for (const [name, T] of [['standard', base], ['high contrast', high]]) {
  test(`the initial is legible on every tone (4.5:1) and every tone stands out from the surfaces it sits on (3:1) (${name})`, () => {
    for (const k of STYLES) {
      assert.ok(ratio(T['on-ava'], T[`ava-${k}`]) >= 4.5, `${k}: the letter on its disc is ${ratio(T['on-ava'], T[`ava-${k}`]).toFixed(2)}:1`);
      for (const surface of ['bg', 'bg2', 'panel', 'panel2', 'good-bg', 'warn-bg', 'info-bg']) assert.ok(ratio(T[`ava-${k}`], T[surface]) >= 3, `${k} on ${surface}: ${ratio(T[`ava-${k}`], T[surface]).toFixed(2)}:1`);
    }
    for (const k of STYLES) assert.ok(ratio(AVATAR_TONE[k], '#0d1117') >= 3, `${k}: the canvas draws its disc on the bubble's dark plate`);
  });
}

test('the initial is the first letter of the name, after a title or "The", in capitals; every buyer has one', () => {
  assert.equal(initialOf('Wen, stressed student'), 'W');
  assert.equal(initialOf('Mr. Abernathy, serious collector'), 'A');
  assert.equal(initialOf('Mrs. Okonkwo, school librarian'), 'O');
  assert.equal(initialOf('Dr. Imran Qureshi, Watch Collector'), 'I');
  assert.equal(initialOf('The auctioneer'), 'A');
  assert.equal(initialOf('The repair bench'), 'R');
  assert.equal(initialOf('  brightpath'), 'B');
  assert.equal(initialOf('9 Doors'), '9');
  assert.equal(initialOf(''), '?'); assert.equal(initialOf(null), '?'); assert.equal(initialOf(undefined), '?'); assert.equal(initialOf('--- ...'), '?');
  const all = Object.entries(BUYERS);
  assert.equal(all.length, 101);
  for (const [id, b] of all) assert.match(initialOf(b.name), /^[A-Z]$/, `${id}: ${b.name}`);
  for (const [id, b] of all) assert.ok(!('icon' in b), `${id}: a buyer has no emoji`);
});

test('avatarHTML: a hidden disc with the initial, the style as a data attribute, and nothing from a name that is markup', () => {
  assert.equal(avatarHTML('Wen, stressed student', 'impulsive', 'mkt-av'), '<span class="ava mkt-av" data-style="impulsive" aria-hidden="true">W</span>');
  assert.equal(avatarHTML('Dev', 'steady'), '<span class="ava" data-style="steady" aria-hidden="true">D</span>');
  assert.match(avatarHTML('Sal', 'nonsense'), /data-style="steady"/, 'a style that is not one of ours is steady, never printed');
  assert.match(avatarHTML('Sal', '"><img src=x>'), /data-style="steady"/);
  assert.equal(avatarHTML('<b>x</b>', 'hard'), '<span class="ava" data-style="hard" aria-hidden="true">B</span>', 'the initial is a letter or a digit: markup in a name is skipped, never printed');
  assert.equal(avatarHTML('&co', 'hard'), '<span class="ava" data-style="hard" aria-hidden="true">C</span>');
  assert.doesNotMatch(avatarHTML('"><img src=x onerror=alert(1)>', 'hard'), /<img|onerror=/);
  for (const k of BUYER_STYLES) assert.ok(avatarHTML('Zed', k).includes(`data-style="${k}"`));
});

test('marksOf: the first letter, or the shortest start that tells two names apart; the heat map reads them for its column heads and its key', () => {
  assert.deepEqual(marksOf(['Wen, stressed student', 'Lucia, barista']), ['W', 'L']);
  assert.deepEqual(marksOf(['Delgado Delivery Co.', 'DriveBoard Marketplace', 'Zed']), ['De', 'Dr', 'Z']);
  assert.deepEqual(marksOf(['Mrs. Adeyemi', 'Aldrin Family Office']), ['Ad', 'Al'], 'a title is not a letter of the name');
  assert.deepEqual(marksOf(['Dan', 'Daniel']), ['Dan', 'Dani'], 'a name that is the start of another keeps all its letters');
  assert.deepEqual(marksOf(['', null, 'x']), ['?', '?', 'X']);
  assert.deepEqual(marksOf([]), []);
  const byZone = {};
  for (const b of Object.values(BUYERS)) (byZone[b.zone] ||= []).push(b.name);
  for (const [z, names] of Object.entries(byZone)) {
    const m = marksOf(names);
    assert.equal(new Set(m).size, m.length, `district ${z}: every column head is different (${m})`);
    for (const x of m) assert.ok(x.length <= 3, `district ${z}: ${x} is short`);
    for (const [i, n] of names.entries()) assert.ok(m[i].startsWith(initialOf(n)), `district ${z}: the mark of ${n} starts with its initial`);
  }
});

test('avatarHTML with a mark: two letters or more say so, so the disc can widen to a pill; one letter is the plain disc', () => {
  assert.equal(avatarHTML('Delgado Delivery Co.', 'analytical', 'sm', 'De'), '<span class="ava sm" data-len="2" data-style="analytical" aria-hidden="true">De</span>');
  assert.equal(avatarHTML('Delgado Delivery Co.', 'analytical', 'sm', 'D'), '<span class="ava sm" data-style="analytical" aria-hidden="true">D</span>');
  assert.equal(avatarHTML('Delgado Delivery Co.', 'analytical', 'sm'), '<span class="ava sm" data-style="analytical" aria-hidden="true">D</span>');
});
