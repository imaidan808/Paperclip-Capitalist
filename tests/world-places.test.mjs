// The map's district cards (Icons part 3, docs/ART_DIRECTION.md 3.6): a card paints the district's own glyph before its name, on the dark card, where its emoji was (js/world/labels.js for the sprite, js/world/mapmode.js for the card drawn
// directly where there is no OffscreenCanvas); the layout's district record carries no icon; a theme nobody drew paints no picture and no stand-in character.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)), read = (p) => readFileSync(join(ROOT, p), 'utf8');
const { ZONES, ZONE_IDS } = await import('../js/config.js');

test('a district\'s card on the map paints the district\'s own glyph before its name, on the dark card, where the emoji was; the words on it are words alone', async () => {
  const labels = read('js/world/labels.js'), mapmode = read('js/world/mapmode.js'), layout = read('js/world/layout.js');
  for (const [name, src] of [['labels.js', labels], ['mapmode.js', mapmode]]) { assert.match(src, /import '\.\.\/art\/g-places\.js';/, `${name} loads the places set`); assert.doesNotMatch(src, /\bD\.icon\b/, `${name} reads no emoji`); }
  assert.match(labels, /paint\(g, 'zone-' \+ D\.theme, 8, h \/ 2 - 9, 18\);/, 'the card\'s sprite'); assert.match(mapmode, /paint\(ctx, 'zone-' \+ D\.theme, x \+ 8, y \+ h \/ 2 - 9, 18\);/, 'and the card drawn directly (no OffscreenCanvas)');
  assert.doesNotMatch(layout, /icon:\s*Z\.icon/, 'the layout\'s district record carries no icon');
  const { recCtx } = await import('./helpers/recctx.mjs'), { shapesOf, PAL } = await import('../js/art/glyph.js');
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; this.rec = recCtx(); } getContext() { return this.rec.ctx; } };
  try {
    const { Labels } = await import('../js/world/labels.js'), l = new Labels(); l.setDpr(1);
    for (const z of ZONE_IDS) {
      const D = { id: z, short: ZONES[z].short, theme: ZONES[z].theme, pal: ZONES[z].palette }, l1 = `${z}  ${ZONES[z].short}`, sp = l.card(D, l1, '3 buyers, 2 crates', false, true, false, false), log = sp.c.rec.log, fills = log.fills.map((f) => f.style);
      for (const sh of shapesOf('zone-' + D.theme)) assert.ok(fills.includes(PAL[sh[1]]), `${ZONES[z].name}: the card paints the tone ${sh[1]} of its glyph`);
      assert.deepEqual(log.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]), [l1, '3 buyers, 2 crates'], `${ZONES[z].name}: the only text is its two lines`);
      assert.equal(log.depth, 0, 'save and restore balance');
    }
    const none = l.card({ id: 99, short: 'X', theme: 'nowhere', pal: ['#111111', '#eeeeee'] }, '99  X', 'x', true, true, false, false);
    assert.deepEqual(none.c.rec.log.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]), ['99  X'], 'a theme nobody drew paints no picture and no stand-in character');
  } finally { delete globalThis.OffscreenCanvas; }
});
