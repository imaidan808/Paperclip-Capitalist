// No emoji, and no symbol that stands in for an icon, in anything the site ships (js/, css/, index.html, 404.html): the interface draws its icons or goes without (docs/COPY.md rule 7,
// docs/ART_DIRECTION.md 3.6). A system emoji looks different on every platform, can show as an empty box on an old device, is glossy against the flat art, and is read aloud by its name.
// The scanner finds a pictograph or an icon symbol however it is written: the character itself, a JS escape (\u{1F512}, ⏸, a surrogate pair), a CSS escape (content: "\2713"),
// an HTML entity (&#10003; or &check;) or String.fromCodePoint. Ordinary typography stays: the allowlist below is the whole list.
//
// It is a RATCHET. The count may not rise above BASELINE; each part of the icons work lowers BASELINE to what it leaves, and the last part makes the test strict (zero, ALLOW unchanged).
// Where the rest are, and which part draws them (2026-11-05, after "Icons 1: remove the decorative emoji", which took the count from 535 to 148, "Icons 2: the glyph kit", which took it from 148 to 102, and "Icons 3", which took it from 102 to 74):
//   Icons 2, done: the dock and the seven drawer tabs, the ticks, carets, play and pause, the menu, close and the camera, the Deal Room's verdict marks, the Draft's tick, the pressed toggles and the world's
//   lock, "you are here" dot and manager status marks are glyphs (js/art/g-*.js, js/ui/glyphs.js), and so are the pictures part 1 took away (the Codex's categories, the badges and bounties, the probes and angles, the managers, clients and loans).
//   Icons 3, done: the sixteen districts and the twelve Backgrounds are glyphs (js/art/g-places.js: zone-<theme> and bg-<id>), found by id through js/ui/glyphs.js; the data carries no icon for either, and the world's cards of the map paint them.
//   Icons 4, part, done: the gavel on an auction lot's tag in the world is a drawn mark (mark-gavel, js/art/g-ui.js), twice (js/world/stock.js and ents-stock.js).
//   Icons 4, the goods .......................................................... 72  the 72 goods' icons
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUYERS, PIPE, CLIENTS, ASSETS, ZONES, PERKS } from '../js/config.js';
import { QUESTS, ACHIEVEMENTS, DAILIES } from '../js/meta/quests.js';
import { CODEX } from '../js/meta/codex.js';
import { ACADEMY } from '../js/meta/academy.js';
import { sellerFor } from '../js/deal.js';
import { has, zoneGlyph, bgGlyph } from '../js/ui/glyphs.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/** The characters that may stay: the two plain arrows and the multiplication sign of ordinary text, the middle dot, the minus, the ellipsis, and the two plain triangles of a price going up or down (no emoji form: Emoji=No in Unicode). */
const ALLOW = new Set(['←', '→', '×', '·', '−', '…', '▲', '▼']);
/** The named entities that draw a symbol (the HTML ones that draw a letter, a quote or a space are not icons). */
const NAMED = { larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', check: '✓', cross: '✗', star: '☆', starf: '★', bigstar: '★', hearts: '♥', diams: '♦', spades: '♠', clubs: '♣', phone: '☎', female: '♀', male: '♂', sung: '♪' };
/** What the shipped sources hold today. A pull request may only lower it, and says so here. STRICT=1 asks for zero. */
const BASELINE = 72;

const PICTO = /\p{Extended_Pictographic}/u;
const SYMBOL = /[←-⇿⌀-⏿■-◿☀-➿⬀-⯿⤀-⥿]/u; // arrows, technical, geometric shapes, miscellaneous symbols, dingbats
const isBad = (ch) => !ALLOW.has(ch) && (PICTO.test(ch) || SYMBOL.test(ch));
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const shipped = () => [...walk(join(ROOT, 'js')), ...walk(join(ROOT, 'css')), join(ROOT, 'index.html'), join(ROOT, '404.html')].filter((f) => /\.(js|css|html)$/.test(f));

/** Every pictograph or icon symbol in a source text, in whatever form it was written. */
function findings(src) {
  const out = [];
  src.split('\n').forEach((ln, i) => {
    const push = (ch, form) => { if (isBad(ch)) out.push({ line: i + 1, ch, form }); };
    for (const ch of ln.replace(/️|‍/g, '')) push(ch, 'literal');                                                                                                        // the character itself (VS16 and ZWJ ignored: the emoji they join is found)
    for (const m of ln.matchAll(/\\u\{([0-9a-fA-F]{1,6})\}/g)) push(String.fromCodePoint(parseInt(m[1], 16)), 'js escape');                                                       // \u{1F512}
    for (const m of ln.matchAll(/\\u([dD][89abAB][0-9a-fA-F]{2})\\u([dD][c-fC-F][0-9a-fA-F]{2})/g)) push(String.fromCodePoint(((parseInt(m[1], 16) - 0xD800) << 10) + (parseInt(m[2], 16) - 0xDC00) + 0x10000), 'js escape'); // a surrogate pair
    for (const m of ln.matchAll(/\\u([0-9a-fA-F]{4})/g)) push(String.fromCodePoint(parseInt(m[1], 16)), 'js escape');                                                             // ⏸
    for (const m of ln.matchAll(/&#x([0-9a-fA-F]+);/g)) push(String.fromCodePoint(parseInt(m[1], 16)), 'entity');                                                                  // &#x2713;
    for (const m of ln.matchAll(/&#(\d+);/g)) push(String.fromCodePoint(parseInt(m[1], 10)), 'entity');                                                                            // &#10003;
    for (const m of ln.matchAll(/&([a-z]+);/g)) if (NAMED[m[1]]) push(NAMED[m[1]], 'entity');                                                                                      // &check;
    for (const m of ln.matchAll(/\\([0-9a-fA-F]{4,6})(?![0-9a-fA-F])/g)) push(String.fromCodePoint(parseInt(m[1], 16)), 'css escape');                                             // content: "\2713" (a backslash and hex digits)
    for (const m of ln.matchAll(/fromCodePoint\(\s*(0x[0-9a-fA-F]+|\d+)\s*\)/g)) push(String.fromCodePoint(Number(m[1])), 'fromCodePoint');
  });
  return out;
}

test('the scanner finds every form: a character, a ZWJ sequence, a variation selector, a JS escape, a surrogate pair, a CSS escape, an HTML entity, a code point', () => {
  const forms = (s) => findings(s).map((f) => `${f.form}:${f.ch}`);
  assert.deepEqual(forms("const a = '📎';"), ['literal:📎']);
  assert.deepEqual(forms('x = "🧑‍🔧"'), ['literal:🧑', 'literal:🔧']);
  assert.deepEqual(forms("g = '⚠️'"), ['literal:⚠']);
  assert.deepEqual(forms("t = '\\u{1F512} '"), ['js escape:🔒']);
  assert.deepEqual(forms("t = '\\uD83D\\uDD12'"), ['js escape:🔒']);
  assert.deepEqual(forms("t = '\\u23F8'"), ['js escape:⏸']);
  assert.deepEqual(forms('.a::after { content: "\\2713"; }'), ['css escape:✓']);
  assert.deepEqual(forms('<i>&#10003;</i>'), ['entity:✓']);
  assert.deepEqual(forms('<i>&#x1F512;</i>'), ['entity:🔒']);
  assert.deepEqual(forms('<i>&check;</i> <i>&starf;</i>'), ['entity:✓', 'entity:★']);
  assert.deepEqual(forms('s = String.fromCodePoint(0x1F512)'), ['fromCodePoint:🔒']);
  assert.deepEqual(forms('3 × 4 → 5 ← 6 · ▲ ▼ − … &larr; &rarr; &middot; &hellip; &ldquo;x&rdquo; and a \\d+ regex, \\n, &#39; and &amp;'), [], 'ordinary typography, the plain arrows, an apostrophe entity and regular expressions are not findings');
});

test('no emoji or icon symbol in anything the site ships, beyond what the icons work has not drawn yet (a ratchet: it only goes down)', () => {
  const all = [], byFile = {};
  for (const f of shipped()) for (const x of findings(readFileSync(f, 'utf8'))) { all.push(`${f.slice(ROOT.length)}:${x.line} ${x.ch} (${x.form})`); byFile[f.slice(ROOT.length)] = (byFile[f.slice(ROOT.length)] || 0) + 1; }
  const where = Object.entries(byFile).sort((p, q) => q[1] - p[1]).map(([f, n]) => `${f} ${n}`).join(', ');
  if (process.env.STRICT) assert.deepEqual(all, [], `${all.length} emoji or icon symbols in shipped sources: ${where}`);
  else assert.ok(all.length <= BASELINE, `${all.length} findings, the ratchet says ${BASELINE}: a change may only lower it. Count by file: ${where}`);
  assert.ok(all.length >= BASELINE - 20 || process.env.STRICT, `${all.length} findings is far under the ratchet's ${BASELINE}: lower BASELINE to ${all.length}, so the next change cannot spend the difference`);
});

test('the emoji that were decoration are gone for good: buyers, managers, clients, districts, Backgrounds, quests, badges, bounties, Codex pages, Academy lessons and the Deal Room\'s cards and cast carry no icon', () => {
  const has = (list, name) => { for (const x of Object.values(list)) assert.ok(!('icon' in x), `${name} ${x.id ?? x.name}: no icon field`); };
  has(BUYERS, 'buyer'); has(PIPE, 'manager kind'); has(CLIENTS, 'client kind'); has(QUESTS, 'quest'); has(ACHIEVEMENTS, 'badge'); has(DAILIES, 'bounty'); has(CODEX, 'Codex page'); has(ACADEMY, 'Academy lesson'); has(ZONES, 'district'); has(PERKS, 'Background');
  assert.equal(Object.keys(BUYERS).length, 101); assert.equal(QUESTS.length, 32); assert.equal(ACHIEVEMENTS.length, 78); assert.equal(DAILIES.length, 12); assert.equal(CODEX.length, 56); assert.equal(ACADEMY.length, 10); assert.equal(Object.keys(ZONES).length, 16); assert.equal(Object.keys(PERKS).length, 12);
  const seen = new Set(); for (let i = 0; i < 60; i++) { const sl = sellerFor('guard' + i, 'Clip', 10); seen.add(sl.style); assert.ok(!('icon' in sl), 'a seller has no icon'); } assert.equal(seen.size, 4, 'all four styles of seller were looked at');
  // the sources that build the rest: the Deal Room's seller kinds, auctioneer and bench, and the cards of the Read and Pitch stages; the Bank's loan products
  assert.doesNotMatch(read('js/deal.js').replace(/^\s*\/\/.*$/gm, ''), /\bicon\b/, 'js/deal.js: the model of a deal carries the good\'s class and a district\'s id, no picture (the screens look the drawing up: js/ui/glyphs.js)');
  assert.ok(!/\bicon\b/.test(read('js/ui/deal.js').replace(/\.icon\b/g, '').replace(/^\/\/.*$/gm, '')), 'js/ui/deal.js: the angle and probe cards have no icon (goods are read as .icon)');
  assert.deepEqual([...read('js/ui/drawers/bank.js').matchAll(/\bicon:\s*('[^']*')/g)].map((m) => m[1]), [], 'the Bank has no icon of its own: its tab is the glyph dock-bank, and its loan products are drawn by id (js/ui/glyphs.js)');
});

test('what part 4 draws is still there: the goods keep their icon (72 of them); a district and a Background carry none, and each has its drawn glyph; every dock and drawer tab is a drawn glyph (dock-<id>) and no drawer carries an emoji', () => {
  for (const [id, x] of Object.entries(ASSETS)) assert.ok(typeof x.icon === 'string' && x.icon.trim(), `good ${id}: icon`);
  assert.equal(Object.keys(ASSETS).length, 72);
  for (const id of Object.keys(ZONES)) assert.ok(zoneGlyph(id), `district ${id}: a drawn glyph (js/art/g-places.js)`);
  for (const id of Object.keys(PERKS)) assert.ok(bgGlyph(id), `Background ${id}: a drawn glyph (js/art/g-places.js)`);
  for (const d of ['stock', 'market', 'crew', 'bank', 'travel', 'codex', 'quests']) {
    assert.match(read(`js/ui/drawers/${d}.js`), new RegExp(`id: '${d}', label:`), `${d}: the tab is its id and its label`);
    assert.doesNotMatch(read(`js/ui/drawers/${d}.js`), /\bicon:\s*'/, `${d}: no icon field (the picture is dock-${d} in js/art/g-ui.js)`);
    assert.ok(has('dock-' + d), `${d}: dock-${d} is drawn`);
  }
});