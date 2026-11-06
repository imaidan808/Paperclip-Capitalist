// The goods on the world's canvas (Icons part 4, docs/ART_DIRECTION.md 3.6): a crate's round icon and a lot's price tag paint the good's glyph where their emoji was (js/world/labels.js for the cached sprite,
// js/world/overlay.js for the label drawn directly where there is no OffscreenCanvas), and the gavel on an auction lot's tag is a drawn mark in the tag's own gold, not a character. The sprites are cached by glyph id.
// The two layers that put the labels over the world (js/world/stock.js, the V2 drawers; js/world/ents-stock.js, the legacy ones) hand the label a glyph id and no character.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)), read = (p) => readFileSync(join(ROOT, p), 'utf8');
const { recCtx } = await import('./helpers/recctx.mjs'), { shapesOf, PAL, has } = await import('../js/art/glyph.js');
const { ASSETS } = await import('../js/config.js');

/** A fake OffscreenCanvas that records what is painted on it. */
const withOffscreen = async (fn) => {
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; this.rec = recCtx(); } getContext() { return this.rec.ctx; } };
  try { return await fn(); } finally { delete globalThis.OffscreenCanvas; }
};
const tonesPainted = (log) => new Set(log.fills.map((f) => f.style));
const texts = (log) => log.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);

test('a crate\'s round icon paints the good\'s glyph on its dark disc, cached by glyph id, with no character in it; a selected crate keeps the dark disc (the drawings are made for it) and takes a gold rim', async () => {
  await withOffscreen(async () => {
    const { Labels } = await import('../js/world/labels.js'), l = new Labels(); l.setDpr(1);
    for (const cls of ['paperclip', 'sedan', 'diamondParcel', 'cheeseWheels']) {
      const sp = l.icon('good-' + cls, false, 1), log = sp.c.rec.log, tones = tonesPainted(log);
      for (const sh of shapesOf('good-' + cls)) assert.ok(tones.has(PAL[sh[1]]), `${cls}: the icon paints the tone ${sh[1]} of its glyph`);
      assert.deepEqual(texts(log), [], `${cls}: no character in the icon`); assert.equal(log.depth, 0, 'save and restore balance');
      assert.ok(tones.has('rgba(16,20,28,.93)'), `${cls}: on its dark disc`); assert.ok(!tones.has('#ffd36e'), `${cls}: not on a gold one`);
    }
    const a = l.icon('good-radio', false, 1), b = l.icon('good-radio', false, 1), c = l.icon('good-bike', false, 1), sel = l.icon('good-radio', true, 1);
    assert.strictEqual(a, b, 'the same good is the same sprite'); assert.notStrictEqual(a, c, 'another good is another sprite'); assert.notStrictEqual(a, sel, 'a selected crate is another sprite');
    const rim = sel.c.rec.log.strokes.map((s) => s.style), flat = a.c.rec.log.strokes.map((s) => s.style);
    assert.ok(rim.includes('#ffd36e') && !flat.includes('#ffd36e'), 'the selected disc has a gold rim, and only it'); assert.ok(!tonesPainted(sel.c.rec.log).has('#ffd36e'), 'and the disc stays dark under the drawing');
    assert.ok(Math.max(...sel.c.rec.log.strokes.map((s) => s.lw)) > Math.max(...a.c.rec.log.strokes.map((s) => s.lw)), 'a thicker rim than the plain one');
    assert.equal(l.icon('good-radio', false, 1.125).w > a.w, true, 'it grows with the zoom, in eighths');
  });
});

test('a lot\'s price tag paints the good\'s glyph before the price, and an auction lot\'s tag the gavel, a mark in the tag\'s gold; the only text is the price', async () => {
  await withOffscreen(async () => {
    const { Labels } = await import('../js/world/labels.js'), l = new Labels(); l.setDpr(1);
    const fixed = l.tag('good-sneakers', '$380', '#46e38e', false, 1), flog = fixed.c.rec.log;
    for (const sh of shapesOf('good-sneakers')) assert.ok(tonesPainted(flog).has(PAL[sh[1]]), `sneakers: the tag paints the tone ${sh[1]}`);
    assert.deepEqual(texts(flog), ['$380'], 'the price is the only text');
    assert.equal(has('mark-gavel'), true, 'the gavel is drawn (js/art/g-ui.js)'); assert.ok(shapesOf('mark-gavel').every((s) => s[1] === 'cc'), 'one tone: a mark, painted in the tag\'s colour');
    const auction = l.tag('mark-gavel', '$1,200', '#ffd36e', false, 1), alog = auction.c.rec.log;
    assert.deepEqual(texts(alog), ['$1,200']); assert.equal(alog.fills.filter((f) => f.style === '#ffd36e').length >= shapesOf('mark-gavel').length, true, 'the gavel is painted in the gold of the tag');
    assert.notStrictEqual(l.tag('good-sneakers', '$380', '#46e38e', false, 1), l.tag('good-radio', '$380', '#46e38e', false, 1), 'the sprite is keyed by the glyph: another good, another tag');
    assert.strictEqual(l.tag('good-sneakers', '$380', '#46e38e', false, 1), fixed, 'and the same one is cached');
    assert.notStrictEqual(l.tag('mark-gavel', '$380', '#ffd36e', false, 1), l.tag('good-sneakers', '$380', '#ffd36e', false, 1));
    for (const log of [flog, alog]) { assert.equal(log.depth, 0); assert.equal(log.minDepth, 0); }
  });
});

test('where there is no OffscreenCanvas the label is drawn directly, with the same glyph: the crate icon and the price tag paint the picture (no character), the gavel in the tag\'s colour', async () => {
  const { overlayMethods } = await import('../js/world/overlay.js');
  const run = (name, ...args) => { const { ctx, log } = recCtx(); overlayMethods[name].call({ labels: { icon: () => null, tag: () => null } }, ctx, ...args); return log; };
  const icon = run('icon', 100, 100, 1, 'good-van', false), tones = tonesPainted(icon);
  for (const sh of shapesOf('good-van')) assert.ok(tones.has(PAL[sh[1]]), `van: the direct icon paints the tone ${sh[1]}`);
  assert.deepEqual(texts(icon), [], 'no character'); assert.ok(!tonesPainted(run('icon', 100, 100, 1, 'good-van', true)).has('#ffd36e'), 'a selected crate\'s disc stays dark'); assert.ok(run('icon', 100, 100, 1, 'good-van', true).strokes.some((s) => s.style === '#ffd36e'), 'with a gold rim');
  const tag = run('tag', 100, 100, 1, 'good-van', '$4,400', '#46e38e', false);
  for (const sh of shapesOf('good-van')) assert.ok(tonesPainted(tag).has(PAL[sh[1]]), `van: the direct tag paints the tone ${sh[1]}`);
  assert.deepEqual(texts(tag), ['$4,400'], 'only the price is text');
  const auction = run('tag', 100, 100, 1, 'mark-gavel', '$900', '#ffd36e', false);
  assert.ok(tonesPainted(auction).has('#ffd36e') && auction.fills.some((f) => f.style === '#ffd36e'), 'the gavel in the tag\'s gold'); assert.deepEqual(texts(auction), ['$900']);
  assert.equal(icon.depth, 0); assert.equal(auction.depth, 0);
});

test('the layers that hang the labels over the world hand them a glyph id: the V2 crate layers and the legacy ones (stock.js and ents-stock.js) name the good\'s glyph, and an auction lot\'s tag the gavel; no character stands for either', () => {
  for (const f of ['js/world/stock.js', 'js/world/ents-stock.js']) {
    const s = read(f);
    assert.match(s, /auction \? 'mark-gavel' : 'good-' \+ l\.cls/, `${f}: the lot's tag is the gavel at auction and the good's glyph otherwise`);
    assert.match(s, /'good-' \+ a\.cls/, `${f}: the stock's icon is the good's glyph`);
    assert.doesNotMatch(s, /ASSETS\[[^\]]*\]\.icon\b|🔨/, `${f}: no emoji, no icon field`);
  }
  const overlay = read('js/world/overlay.js'), labels = read('js/world/labels.js');
  for (const [name, src] of [['overlay.js', overlay], ['labels.js', labels]]) { assert.match(src, /import '\.\.\/art\/g-goods\.js';/, `${name} loads the goods set`); assert.match(src, /import '\.\.\/art\/g-ui\.js';/, `${name} loads the interface set (the gavel is a mark)`); }
  assert.doesNotMatch(labels, /sans\(1[34] \* s\); g\.fillStyle = '#fff'; this\.text\(g, icon/, 'the label no longer writes the icon as text');
  assert.doesNotMatch(overlay, /fillText\(icon/, 'nor does the direct drawing');
  assert.equal(Object.keys(ASSETS).length, 72);
});
