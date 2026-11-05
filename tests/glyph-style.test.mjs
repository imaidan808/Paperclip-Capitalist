// The style of the drawn icons (docs/ART_DIRECTION.md 3.6), held the way tests/world-people-style.test.mjs and tests/world-nature-style.test.mjs hold the people and the nature: the drawings are measured, and painted into a recording
// canvas that notes every stroke, gradient, clip, blur, text or translucent fill asked of it. A glyph is flat shapes on a 24 grid (js/art/glyph.js says how a shape is written); every set is js/art/g-*.js, found here by its name.
//   shapes ......... five kinds, numbers on the grid with a half unit of margin, closed absolute M L Q C Z paths, one decimal or two, at most 10 shapes (6 in a mark), no shape as big as a tile (a plate)
//   tones .......... only the palette; a mark is one tone (currentColor), a picture at most four; every tone is 3:1 or better on every dark surface of css/styles.css (the tile, the callouts, the high-contrast theme) and on black;
//                    there is no ink tone: a dark part is a hole (an even-odd path) or the slate `k`; a dark step is 1.3:1 or more from its main tone
//   what is shown .. measured on a raster: the coverage, the centre, what each shape leaves uncovered, and how much is narrower than a pixel at 16 px; a detail that lies on a body differs from it by 1.15:1 (not by hue alone)
//   the renderers .. canvas: fills only, whole alpha, balanced; SVG: fills only, decorative or named; data URI: the same drawing
//   the stylesheets  the marks CSS draws as masks (--gl-* in css/styles.css) are the glyphs' own data URIs; a mask is painted in the system's text colour in forced-colors mode; no two marks share a silhouette
//   the weight ..... the core is under 1.2 KB gzipped; the sets and the painter are lazy (tests/page-budget.test.mjs, LATER) and a set imports nothing but the core
// The rules are plain functions of a drawing (tests/helpers/glyph-rules.mjs: dataProblems, toneProblems, sizeProblems, shownProblems, detailProblems), run on every registered glyph and, last, on drawings made to break them, so a rule that went soft would fail here.
// scripts/glyph-draw.mjs runs the same functions on what a drawing script writes.
// Run: node --test tests/glyph-style.test.mjs. The pictures: node scripts/glyph-sheet.mjs (the numbers say a glyph is within the rules, only an eye says it is a good drawing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { recCtx } from './helpers/recctx.mjs';
import { dataProblems, toneProblems, sizeProblems, shownProblems, detailProblems, isMark } from './helpers/glyph-rules.mjs';
import { rasterise } from './helpers/glyph-raster.mjs';
import { block as marksBlock, CSS_MARKS, BEGIN, END } from '../scripts/glyph-css.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url)), ART = join(ROOT, 'js/art'), read = (p) => readFileSync(join(ROOT, p), 'utf8');
const { PAL, has, idsOf, shapesOf, svg, body } = await import('../js/art/glyph.js');
const { paint, uri } = await import('../js/art/paint.js');

// ---- the sets: every js/art/g-*.js, loaded in turn (a clash of ids throws when the second one loads, and is reported here with the file)
const SETS = [], loadErrors = [];
for (const f of readdirSync(ART).filter((n) => /^g-.+\.js$/.test(n)).sort()) {
  const before = new Set(idsOf());
  try { const m = await import(pathToFileURL(join(ART, f)).href); SETS.push({ file: f, name: f.slice(2, -3), exports: m, ids: idsOf().filter((id) => !before.has(id)) }); } catch (e) { loadErrors.push(`${f}: ${e.message}`); }
}
const ALL = idsOf(), HEX = /^#[0-9a-f]{6}$/;

// ---- the colours of the surfaces a glyph sits on, read from the real stylesheet (the first :root block is the standard theme, the next block the high-contrast one)
const css = read('css/styles.css');
const block = (re) => { const o = {}; for (const [, k, v] of (css.match(re)?.[1] || '').matchAll(/--([\w-]+):\s*([^;]+);/g)) o[k] = v.trim(); return o; };
const base = block(/:root\s*\{([^}]*)\}/), high = { ...base, ...block(/:root\[data-contrast="high"\]\s*\{([^}]*)\}/) };
const SURFACES = ['bg', 'bg2', 'panel', 'panel2', 'good-bg', 'bad-bg', 'warn-bg', 'info-bg'];
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => { if (hex.length === 4) hex = '#' + [...hex.slice(1)].map((c) => c + c).join(''); const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// ================================================================================================ the rules (tests/helpers/glyph-rules.mjs), run on every registered glyph
/** Runs a rule on every glyph and fails once with the whole list of what is wrong (an artist fixes a set at a time). */
const everyGlyph = (rule, what) => { const bad = []; for (const id of ALL) for (const m of rule(shapesOf(id))) bad.push(`${id}: ${m}`); assert.deepEqual(bad, [], `${what}:\n${bad.join('\n')}`); };

// ================================================================================================ the sets
test('the sets load and register without a clash: each js/art/g-*.js exports its table as GLYPHS, no id is drawn twice, an id is a word of letters, digits and hyphens, and every glyph has a drawing', () => {
  assert.deepEqual(loadErrors, [], 'a set that would not load (a clash of ids names the id):\n' + loadErrors.join('\n'));
  for (const n of ['ui', 'codex', 'deal', 'places']) assert.ok(SETS.some((s) => s.name === n), `js/art/g-${n}.js is a set of this part`);
  for (const s of SETS) {
    assert.ok(s.exports.GLYPHS && typeof s.exports.GLYPHS === 'object', `${s.file} exports GLYPHS`);
    assert.deepEqual(s.ids, Object.keys(s.exports.GLYPHS), `${s.file} registers its own table, all of it`);
    assert.match(read(`js/art/${s.file}`), /^register\(GLYPHS\);$/m, `${s.file} registers itself`);
  }
  const bad = ALL.filter((id) => !/^[a-z][A-Za-z0-9-]*$/.test(id)).map((id) => `${id}: an id is a word, lower case first, then letters, digits and hyphens`);
  for (const id of ALL) if (!(Array.isArray(shapesOf(id)) && shapesOf(id).length)) bad.push(`${id}: no drawing`);
  assert.deepEqual(bad, []);
});

test('every glyph is a list of flat shapes on the 24 grid: five kinds, finite numbers of at most two decimals, closed absolute paths, every point inside the grid with a half unit of margin, no round corner larger than half the shape', () => everyGlyph(dataProblems, 'shape data'));
test('tones: only the palette; a mark is one tone (currentColor, so it takes the text colour in every theme) and never mixed with colours; a picture has at most four tones', () => {
  assert.ok('cc' in PAL && PAL.cc === 'currentColor');
  assert.ok(!('K' in PAL) && !Object.values(PAL).includes('#2c2a56'), 'there is no ink tone: a dark part would sink into the bare tile (use a hole, or the slate k)');
  everyGlyph(toneProblems, 'tones');
});
test('bounded: a picture has at most 10 shapes and a mark 6; nothing as small as a speck; a picture fills at least 14 units of the grid and a mark 8; no shape is as big as a tile (a plate behind the picture is the pale-sticker look the author did not choose)', () => everyGlyph(sizeProblems, 'size and parts'));
test('what is shown, measured on a raster: a glyph covers a sensible part of the grid, sits near its centre, leaves every one of its shapes visible, and is not made of lines thinner than a pixel at 16 px', () => everyGlyph(shownProblems, 'what a glyph shows'));

test('no two glyphs are the same drawing, in the same tones or in others (an exemplar, ex-*, may be copied under its real id: the exemplars go when their part lands)', () => {
  const full = new Map(), geo = new Map(), bad = [];
  for (const id of ALL.filter((x) => !/^ex-/.test(x))) {
    const f = JSON.stringify(shapesOf(id)), g = JSON.stringify(shapesOf(id).map((s) => [s[0], ...s.slice(2)]));
    if (full.has(f)) bad.push(`${id} is the drawing of ${full.get(f)}`); else if (geo.has(g)) bad.push(`${id} has the shapes of ${geo.get(g)} in other tones: one drawing, one id (a colour for a state is the text colour of a mark)`);
    full.set(f, id); geo.set(g, id);
  }
  assert.deepEqual(bad, []);
});

test('the palette: hex tones, all different, each 3:1 or better on every dark surface of the stylesheet (the tile, the four callouts, in both themes) and on black; a dark step is 1.3:1 or more from its main tone', () => {
  const tones = Object.entries(PAL).filter(([k]) => k !== 'cc'), bad = [];
  assert.equal(new Set(tones.map(([, v]) => v)).size, tones.length, 'no two tones are the same colour');
  const tiles = [...SURFACES.map((n) => [n, base[n]]), ...SURFACES.map((n) => [`${n} (high contrast)`, high[n]]), ['black', '#000000']];
  for (const [n, hex] of tiles) assert.match(hex, /^#[0-9a-f]{3}([0-9a-f]{3})?$/, `the surface ${n} is a hex colour in the stylesheet`);
  for (const [k, v] of tones) {
    assert.match(v, HEX, `${k}: ${v}`);
    for (const [n, tile] of tiles) if (ratio(v, tile) < 3) bad.push(`${k} ${v} is ${ratio(v, tile).toFixed(2)}:1 on ${n} ${tile} (3:1 is the least a part may have)`);
  }
  for (const [a, b] of [['n', 'nd'], ['sk', 'skd'], ['r', 'rd'], ['o', 'od'], ['y', 'yd'], ['g', 'gd'], ['t', 'td'], ['b', 'bd'], ['v', 'vd'], ['p', 'pd'], ['s', 'sd'], ['sd', 'k']]) if (ratio(PAL[a], PAL[b]) < 1.3) bad.push(`${a} and ${b} are ${ratio(PAL[a], PAL[b]).toFixed(2)}:1 apart: the dark step would not show (1.3 at least)`);
  assert.deepEqual(bad, [], bad.join('\n'));
});

// ================================================================================================ the renderers
const BANNED = new Set(['stroke', 'strokeRect', 'strokeText', 'fillText', 'fillRect', 'clip', 'drawImage', 'createLinearGradient', 'createRadialGradient', 'createConicGradient', 'createPattern', 'setLineDash']);
/** A recording context that notes every stroke, gradient, clip, text, image, blur and filter asked of it: a flat glyph asks for none. */
function flatCtx() {
  const r = recCtx(), bad = [];
  const ctx = new Proxy(r.ctx, { get(o, k) { if (BANNED.has(k)) bad.push(k); return o[k]; }, set(o, k, v) { if ((k === 'shadowBlur' && v) || (k === 'filter' && v && v !== 'none') || k === 'strokeStyle' || k === 'lineWidth') bad.push(k); o[k] = v; return true; } });
  return { ...r, ctx, bad };
}
test('painted on a canvas a glyph is fills only: no stroke, gradient, pattern, clip, blur, text or image; one whole fill a shape in a palette colour (a mark takes the tint); the same transform every time; save and restore balance; an undrawn id paints nothing', () => {
  for (const id of ALL) for (const size of [12, 16, 24, 40]) {
    const r = flatCtx(); assert.equal(paint(r.ctx, id, 3, 4, size, '#e8eef6'), true, id); assert.deepEqual(r.bad, [], `${id} at ${size}: ${r.bad}`); assert.equal(r.log.depth, 0, `${id}: save and restore balance`); assert.equal(r.log.minDepth, 0);
    const sh = shapesOf(id); assert.equal(r.log.fills.length, sh.length, `${id}: one fill a shape`);
    r.log.fills.forEach((f, i) => { assert.equal(f.alpha, 1, `${id}: a translucent fill`); assert.equal(f.style, sh[i][1] === 'cc' ? '#e8eef6' : PAL[sh[i][1]], `${id}: shape ${i} is filled in its tone`); });
    assert.deepEqual(r.log.calls.find((c) => c[0] === 'scale').slice(1), [size / 24, size / 24], `${id}: drawn at ${size}`); assert.deepEqual(r.log.calls.find((c) => c[0] === 'translate').slice(1), [3, 4]);
    assert.equal(r.log.calls.filter((c) => c[0] === 'fill' && c[1] === 'evenodd').length, sh.filter((s) => s[0] === 'd' && s[3]).length, `${id}: the paths with holes are filled even-odd, and only they`);
    assert.equal(r.log.calls.filter((c) => c[0] === 'beginPath').length, sh.length, `${id}: one path a shape`);
  }
  const r = flatCtx(); assert.equal(paint(r.ctx, 'no-such-glyph', 0, 0, 20), false); assert.equal(r.log.calls.length, 0, 'nothing is drawn for an id nobody drew');
  const mark = ALL.find((id) => isMark(shapesOf(id))); if (mark) { const t = flatCtx(); paint(t.ctx, mark, 0, 0, 24); assert.equal(t.log.fills[0].style, '#ffffff', 'a mark without a tint is white'); }
});

test('as SVG a glyph is shapes with a fill: only svg, circle, ellipse, rect, polygon and path; no stroke, opacity, filter, gradient, style, mask, clip or text; a mark is currentColor and a picture is not marked as one; decorative ones are aria-hidden, a named one is an img with its label', () => {
  const ALLOWED = new Set(['svg', 'circle', 'ellipse', 'rect', 'polygon', 'path']);
  for (const id of ALL) for (const out of [svg(id), svg(id, { label: 'A name', size: 40 }), svg(id, { cls: 'gl-sm extra' })]) {
    for (const m of out.matchAll(/<([a-zA-Z]+)\b([^>]*)>/g)) { assert.ok(ALLOWED.has(m[1]), `${id}: <${m[1]}>`); assert.ok(!/\b(stroke|opacity|filter|style|mask|clip-path|fill-opacity|href|xlink)[-a-z]*=/.test(m[2]), `${id}: ${m[2]}`); }
    for (const m of out.matchAll(/ fill="([^"]+)"/g)) assert.ok(m[1] === 'currentColor' || HEX.test(m[1]), `${id}: fill ${m[1]}`);
    assert.equal((out.match(/<(circle|ellipse|rect|polygon|path)\b/g) || []).length, shapesOf(id).length, `${id}: one element a shape`);
    assert.match(out, /^<svg class="gl( gl-c)?[^"]*" viewBox="0 0 24 24"/); assert.equal(/ class="gl gl-c/.test(out), !isMark(shapesOf(id)), `${id}: gl-c marks a picture (forced-colors keeps its tones) and a mark is plain gl`);
  }
  const id = ALL[0]; assert.match(svg(id), / aria-hidden="true">/); assert.doesNotMatch(svg(id), /role=|aria-label/); assert.match(svg(id, { label: 'Done' }), /role="img" aria-label="Done"/); assert.doesNotMatch(svg(id, { label: 'Done' }), /aria-hidden/);
  const root = (out) => out.match(/^<svg [^>]*>/)[0]; // (a rect has a width of its own: only the svg element is looked at)
  assert.match(root(svg(id, { size: 20 })), / width="20" height="20"/); assert.doesNotMatch(root(svg(id)), / width=/, 'without a size the stylesheet sizes it');
  assert.match(svg(id, { label: 'Buyer "Q" & Co' }), /aria-label="Buyer &#34;Q&#34; &#38; Co"/, 'a label cannot break out of its attribute');
  assert.equal(svg('no-such-glyph'), '', 'an unknown id is nothing, never an emoji or a broken box'); assert.equal(has('no-such-glyph'), false); assert.equal(shapesOf('no-such-glyph'), null);
  assert.equal(svg(id), svg(id), 'the same markup every time'); assert.equal(body(id), body(id, 'currentColor'));
});

test("as a data URI a glyph is the same drawing for a CSS mask or background: the mark takes the tint, there is no currentColor left, and the shapes are the SVG's", () => {
  for (const id of ALL) {
    const u = uri(id), tinted = uri(id, '#123456'); assert.match(u, /^data:image\/svg\+xml,/); const text = decodeURIComponent(u.slice('data:image/svg+xml,'.length));
    assert.match(text, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24">/); assert.ok(!/currentColor/.test(text), `${id}: a data URI cannot inherit a colour`);
    assert.equal(text.replace(/^<svg [^>]*>/, '').replace(/<\/svg>$/, ''), body(id, '#000'), `${id}: the same shapes as the DOM's`);
    assert.equal(decodeURIComponent(tinted).includes('#123456'), isMark(shapesOf(id)), `${id}: the tint paints a mark and only a mark`);
  }
  assert.equal(uri('no-such-glyph'), '');
});

test("css/styles.css sizes a glyph in rem (24 px, 16 px for .gl-sm, 40 px for .gl-lg at the default text size), lets a width attribute win, keeps a picture's tones in forced-colors mode on a dark chip, and leaves a mark to the text colour", () => {
  assert.match(css, /\.gl:not\(\[width\]\)\s*\{[^}]*width:\s*1\.5rem;[^}]*height:\s*1\.5rem/);
  assert.match(css, /\.gl-sm:not\(\[width\]\)\s*\{[^}]*width:\s*1rem;[^}]*height:\s*1rem/);
  assert.match(css, /\.gl-lg:not\(\[width\]\)\s*\{[^}]*width:\s*2\.5rem;[^}]*height:\s*2\.5rem/);
  const forced = css.match(/@media \(forced-colors: active\) \{ \.gl-c \{([^}]*)\} \}/)?.[1] || ''; assert.match(forced, /forced-color-adjust:\s*none/); assert.match(forced, new RegExp(`background:\\s*${base.panel2}`), "on the dark tile's own colour");
  assert.doesNotMatch(css, /\.gl\s*\{[^}]*forced-color-adjust/, 'a mark (plain .gl) is left to the system colours');
});

// ================================================================================================ the stylesheets
/** The style rules of a stylesheet as { sel (the selector list on one line), body, media (the @media / @supports headers around it) }. Enough CSS for these sheets: comments skipped, no nesting inside a rule, the blocks of @keyframes and @font-face skipped. */
function rulesOf(text) {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, ''), out = [], stack = [];
  let head = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === ';' && !stack.length) { head = ''; continue; }
    if (c === '}') { stack.pop(); head = ''; continue; }
    if (c !== '{') { head += c; continue; }
    const h = head.trim().replace(/\s+/g, ' '); head = '';
    if (/^@(media|supports|layer|container)\b/.test(h)) { stack.push(h); continue; }
    if (h.startsWith('@')) { let depth = 1; while (depth && ++i < src.length) depth += src[i] === '{' ? 1 : src[i] === '}' ? -1 : 0; continue; }
    const end = src.indexOf('}', i); out.push({ sel: h, body: src.slice(i + 1, end), media: [...stack] }); i = end;
  }
  return out;
}
const CSS_FILES = readdirSync(join(ROOT, 'css')).filter((n) => n.endsWith('.css')).sort();

test('the marks that CSS draws are the glyphs: the block of css/styles.css between its two markers is what scripts/glyph-css.mjs writes from js/art/g-ui.js (run it with --write after a mark changes), one --gl-<name> for each mark-<name>', async () => {
  const text = css, i = text.indexOf(BEGIN), j = text.indexOf(END);
  assert.ok(i > 0 && j > i, 'css/styles.css has the block');
  assert.equal(text.slice(i, j + END.length), await marksBlock(), 'the block is stale: node scripts/glyph-css.mjs --write');
  for (const n of CSS_MARKS) { assert.ok(has('mark-' + n), `--gl-${n} needs a glyph mark-${n}`); assert.ok(isMark(shapesOf('mark-' + n)), `mark-${n} is a mark (one tone)`); }
  const used = new Set(), all = {};
  for (const f of CSS_FILES) { all[f] = read(`css/${f}`); for (const m of all[f].matchAll(/var\(--gl-([a-z-]+)\)/g)) used.add(m[1]); }
  for (const n of used) assert.ok(CSS_MARKS.includes(n), `a sheet uses var(--gl-${n}) and no such mark is written`);
  for (const n of CSS_MARKS) assert.ok(used.has(n), `--gl-${n} is written and no sheet uses it: delete it from CSS_MARKS (scripts/glyph-css.mjs), or use it`);
});

test('a mask paints the element\'s background, which forced-colors mode turns to the canvas colour: every rule that masks a box has, in a forced-colors block of its sheet, the same selector with forced-color-adjust: none and a system text colour (measured in Chrome: the mask was black on black)', () => {
  const bad = [];
  assert.deepEqual(rulesOf('a { mask: x; } @media (forced-colors: active) { a, b { forced-color-adjust: none; } } @keyframes k { from { mask: y; } }').map((r) => [r.sel, r.media.length]), [['a', 0], ['a, b', 1]], 'the reader of the sheets sees a rule, a rule inside a media block, and skips a keyframe');
  for (const f of CSS_FILES) {
    const rules = rulesOf(read(`css/${f}`)), forced = rules.filter((r) => r.media.some((m) => /forced-colors:\s*active/.test(m)));
    for (const r of rules.filter((x) => /(^|[;\s])(-webkit-)?mask(-image)?\s*:/.test(x.body) && !x.media.length)) for (const sel of r.sel.split(',').map((x) => x.trim())) {
      const twin = forced.find((q) => q.sel.split(',').map((x) => x.trim()).includes(sel));
      if (!twin) bad.push(`${f}: ${sel} masks a box and has no forced-colors rule`);
      else if (!/forced-color-adjust:\s*none/.test(twin.body) || !/background-color:\s*(CanvasText|ButtonText)\b/.test(twin.body)) bad.push(`${f}: ${sel}: its forced-colors rule needs forced-color-adjust: none and a system background-color (CanvasText, ButtonText)`);
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(CSS_FILES.some((f) => /(^|[;\s])mask\s*:/.test(read(`css/${f}`))), 'and the rule is looked for in sheets that mask');
});

test('a picture printed keeps its dark chip (the page prints white with every colour black, and 18 of the 24 tones are under 3:1 on white)', () => {
  const m = css.match(/@media print \{ \.gl-c \{([^}]*)\} \}/)?.[1] || '';
  assert.match(m, /print-color-adjust:\s*exact/); assert.ok(m.includes(`background: ${base.panel2}`), 'on the dark tile\'s own colour');
});

test('no two marks share a silhouette: the overlap of any two (intersection over union, on a raster of 2 samples a unit) stays under 0.85, so a rarity, a verdict and a control that sit near each other are told apart by their shape (rarity-epic was a mark-star with round tips: 0.09 apart in Chrome at 11, 12 and 16 px)', () => {
  const marks = ALL.filter((id) => isMark(shapesOf(id))), mask = Object.fromEntries(marks.map((id) => [id, rasterise(shapesOf(id), 2).owner]));
  const iou = (a, b) => { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { const x = a[k] >= 0, y = b[k] >= 0; if (x && y) i++; if (x || y) u++; } return i / u; };
  const bad = []; for (let a = 0; a < marks.length; a++) for (let b = a + 1; b < marks.length; b++) { const o = iou(mask[marks[a]], mask[marks[b]]); if (o >= 0.85) bad.push(`${marks[a]} and ${marks[b]} overlap ${o.toFixed(2)}`); }
  assert.deepEqual(bad, [], 'draw one of them differently (a different silhouette, not a rounder tip)');
  assert.ok(iou(mask['mark-star'], mask['mark-star']) === 1 && iou(mask['mark-star'], mask['mark-dot']) < 0.5, 'and the measure tells a star from itself and from a ring');
});

test("the kit's weight: the core is under 1.2 KB gzipped; the painter and every set are lazy (the list LATER of tests/page-budget.test.mjs holds them, and its B1 keeps them out of the first screen); a set imports nothing but the core", () => {
  const core = gzipSync(readFileSync(join(ART, 'glyph.js'))).length; assert.ok(core <= 1200, `js/art/glyph.js is ${core} bytes gzipped (1,200 at most: all of it is on the first screen once the Draft draws a glyph)`);
  assert.ok(read('tests/page-budget.test.mjs').includes(String.raw`/^js\/art\/(paint|g-[\w-]+)\.js$/`), 'LATER in tests/page-budget.test.mjs holds the painter and every set');
  for (const f of readdirSync(ART).filter((n) => /^g-.+\.js$/.test(n))) { const imports = [...read(`js/art/${f}`).matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]); assert.deepEqual(imports, ['./glyph.js'], `${f} imports only the core`); }
  assert.deepEqual([...read('js/art/paint.js').matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]), ['./glyph.js'], 'the painter imports only the core');
});

// ================================================================================================ the rules, on drawings made to break them
test('the rules catch what they are for: an unknown kind, an open or relative path, a point off the grid, too many decimals, an ink tone, five tones, a mark mixed with colours, eleven parts, a hairline, a plate, a speck, a covered part, a thin diagonal, a drawing off its centre', () => {
  const found = (list, re, what) => assert.ok(list.some((m) => re.test(m)), `${what}: ${JSON.stringify(list)}`);
  found(dataProblems([['x', 'r', 1, 2, 3]]), /unknown kind/, 'unknown kind');
  found(dataProblems([['d', 'r', 'M2 2l4 4z']]), /absolute M L Q C Z/, 'relative path');
  found(dataProblems([['d', 'r', 'M2 2L8 2L8 8']]), /not closed/, 'open path');
  found(dataProblems([['d', 'r', 'M2 2L8 2L8 8M9 9L12 9L12 12Z']]), /sub-path is not closed/, 'two sub-paths, the first open');
  found(dataProblems([['d', 'r', 'M2 2L8Z']]), /takes 2 numbers/, 'a command with too few numbers');
  found(dataProblems([['r', 'g', -3, 4, 40, 8, 1]]), /margin/, 'off the grid');
  found(dataProblems([['r', 'g', 3, 4, 8, 8, 5]]), /half of the shorter side/, 'a corner bigger than half');
  found(dataProblems([['c', 'g', 12.123, 12, 5]]), /decimals/, 'decimals');
  found(dataProblems([['p', 'g', 2, 2, 8, 8]]), /three points/, 'two points');
  found(toneProblems([['c', 'K', 12, 12, 5]]), /not in the palette/, 'the retired ink tone');
  found(toneProblems([['c', 'r', 6, 6, 3], ['c', 'g', 12, 6, 3], ['c', 'b', 18, 6, 3], ['c', 'y', 6, 16, 3], ['c', 'p', 18, 16, 3]]), /at most four/, 'five tones');
  found(toneProblems([['c', 'cc', 6, 6, 3], ['c', 'g', 12, 6, 3]]), /mixes cc/, 'a mark with a colour');
  found(sizeProblems(Array.from({ length: 11 }, (_, i) => ['r', 'r', 1 + (i % 4) * 5, 1 + Math.floor(i / 4) * 5, 4, 4])), /11 shapes/, 'eleven parts');
  found(sizeProblems([['r', 's', 3, 11, 18, 1], ['c', 'r', 12, 12, 8]]), /hairline/, 'a hairline bar');
  found(sizeProblems([['r', 'n', 2, 2, 20, 20, 3], ['c', 'r', 12, 12, 4]]), /plate/, 'a plate');
  found(sizeProblems([['c', 'r', 12, 12, 3]]), /too small to read/, 'a drawing 6 units across');
  found(sizeProblems([['c', 'r', 12, 12, 0.5], ['r', 's', 2, 2, 20, 10]]), /speck/, 'a dot half a unit wide');
  found(shownProblems([['r', 'n', 3, 3, 18, 18], ['r', 'r', 6, 6, 5, 5], ['r', 'g', 2, 2, 20, 20]]), /covered by the shapes after it/, 'a shape under another');
  found(shownProblems([['p', 'r', 3, 20, 20, 3, 21, 4, 4, 21]]), /narrower than a pixel/, 'a diagonal bar a unit wide');
  found(shownProblems([['c', 'r', 4, 4, 2.4]]), /speck|centre/, 'a drawing in a corner');
  found(shownProblems([['r', 'r', 1, 1, 22, 22]]), /a tile/, 'a tile');
  found(detailProblems([['c', 's', 10, 10, 8], ['c', 's', 10, 10, 5.4], ['p', 'n', 13.9, 16.5, 16.5, 13.9, 21.8, 19.3, 19.3, 21.8]]), /lies on shape 0 \(s\) at 1\.00:1/, 'a lens of the rim\'s own tone');
  found(detailProblems([['r', 's', 4, 2, 16, 20, 3], ['c', 'sk', 12, 10, 4], ['r', 'b', 6, 15, 12, 5, 1]]), /shape 1 \(c sk\) lies on shape 0 \(s\) at 1\.0\d:1/, 'a head that is the card\'s luminance');
  assert.deepEqual(detailProblems([['r', 's', 4, 2, 16, 20, 3], ['c', 'k', 12, 10, 4], ['r', 'W', 6, 15, 12, 5, 1]]), [], 'a detail a step darker or lighter than its body is fine');
  assert.deepEqual(detailProblems([['c', 'cc', 10, 10, 8], ['c', 'cc', 10, 10, 4]]), [], 'a mark is one tone and exempt');
  const good = [['r', 'n', 2.5, 8.4, 19, 12.6, 2], ['r', 'nd', 2.5, 15.4, 19, 5.6, 2], ['r', 'nd', 1.5, 4.6, 21, 5.4, 1.8], ['r', 'W', 9, 11.8, 6, 4, 1]];
  assert.deepEqual([...dataProblems(good), ...toneProblems(good), ...sizeProblems(good), ...shownProblems(good)], [], 'and a good drawing has nothing against it');
});
