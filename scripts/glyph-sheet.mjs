// The contact sheet of the glyph kit: every registered glyph (or a chosen set) at 12, 14, 16, 22, 24 and 48 px (the marks' smallest, the Small text size, a list row, the dock, a card, a header), on the dark tile and on a black high-contrast tile, with its id under it, in one PNG.
// It is the page the game would draw (the real css/styles.css and the real svg()), shot by headless Chrome. Look at it: the style test holds the numbers, only an eye tells a good drawing.
//   node scripts/glyph-sheet.mjs                     every set of js/art/g-*.js, to <temp>/glyph-sheet.png
//   node scripts/glyph-sheet.mjs --set ui            one set (the file js/art/g-ui.js), or several: --set ui,codex
//   node scripts/glyph-sheet.mjs --ids check,stock   chosen ids only; --match '^probe-' the ids that fit a regular expression
//   node scripts/glyph-sheet.mjs --out file.png --cols 4 --sizes 16,24,48,96   (default 12,14,16,22,24,48)
//   node scripts/glyph-sheet.mjs --forced            emulate forced-colors: active (the system's own colours; a picture keeps its tones on its chip, a mark follows the text colour). Shot as the viewport, not as a full page: Chrome paints the authored colours in a captureBeyondViewport shot, which is not forced colours
// Machine courtesy: a run waits while the one-minute load average is above GLYPH_SHEET_LOAD (14), up to ten minutes (--no-wait skips it); one Chrome, started with the repository's flags and killed at the end.
import { readdirSync, writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir, loadavg } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { launch, open } from './cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), ART = join(ROOT, 'js/art');
const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i < 0 ? dflt : (process.argv[i + 1] ?? true); };
const flag = (name) => process.argv.includes('--' + name);
const out = arg('out', join(tmpdir(), 'glyph-sheet.png')), cols = +arg('cols', 5), sizes = String(arg('sizes', '12,14,16,22,24,48')).split(',').map(Number);
const wantSets = arg('set', null)?.split(','), wantIds = arg('ids', null)?.split(','), match = arg('match', null) && new RegExp(arg('match'));

/** The sets on disk, in name order, each with the ids it registered. */
async function sets() {
  const { idsOf } = await import(pathToFileURL(join(ART, 'glyph.js')));
  const found = [];
  for (const f of readdirSync(ART).filter((n) => /^g-.+\.js$/.test(n)).sort()) {
    const name = f.slice(2, -3), before = new Set(idsOf());
    await import(pathToFileURL(join(ART, f)));
    found.push({ name, ids: idsOf().filter((id) => !before.has(id)) });
  }
  return found;
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
async function calm() {
  if (flag('no-wait')) return;
  const limit = +(process.env.GLYPH_SHEET_LOAD || 14);
  for (let i = 0; i < 10 && loadavg()[0] > limit; i++) { console.log(`load average ${loadavg()[0].toFixed(1)} is above ${limit}: waiting a minute`); await new Promise((r) => setTimeout(r, 60000)); }
}
/** The tokens of the page's dark tile, read from the stylesheet (the same surface the test measures against). */
const tile = readFileSync(join(ROOT, 'css/styles.css'), 'utf8').match(/--panel2:\s*(#[0-9a-f]{6})/i)?.[1] || '#1d2634';

const all = await sets(), { svg, idsOf } = await import(pathToFileURL(join(ART, 'glyph.js')));
let ids = all.filter((s) => !wantSets || wantSets.includes(s.name)).flatMap((s) => s.ids.map((id) => [id, s.name]));
if (wantIds) ids = ids.filter(([id]) => wantIds.includes(id));
if (match) ids = ids.filter(([id]) => match.test(id));
if (!ids.length) { console.log(`nothing to draw: ${idsOf().length} glyphs registered in ${all.map((s) => `${s.name} ${s.ids.length}`).join(', ') || 'no sets'}`); process.exit(0); }

const cell = ([id, set]) => `<figure class="cell"><div class="tiles"><div class="tile dark">${sizes.map((px) => svg(id, { size: px })).join('')}</div><div class="tile hc">${sizes.map((px) => svg(id, { size: px })).join('')}</div></div><figcaption>${id}<small>${set}</small></figcaption></figure>`;
const tileW = sizes.reduce((a, b) => a + b, 0) + (sizes.length - 1) * 8 + 16, pageW = cols * (2 * tileW + 6 + 24) + 24;
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(join(ROOT, 'css/styles.css'))}">
<style>
html { font-size: 16px; } body { background: #0d1117; background-image: none; margin: 0; padding: 12px; width: ${pageW}px; min-height: 0; }
.sheet { display: grid; grid-template-columns: repeat(${cols}, auto); gap: 14px 12px; justify-content: start; }
.cell { margin: 0; } .tiles { display: flex; gap: 6px; }
.tile { display: flex; align-items: center; gap: 8px; padding: 8px; border: 1px solid #34445c; width: ${tileW}px; justify-content: center; }
.tile.dark { background: ${tile}; color: #e8eef6; } .tile.hc { background: #000; color: #fff; border-color: #fff; }
figcaption { font: 11px/1.3 ui-monospace, Menlo, monospace; color: #a3b3c9; margin-top: 3px; } figcaption small { color: #6b7f9c; margin-left: 6px; }
h1 { font: 12px ui-monospace, Menlo, monospace; color: #a3b3c9; margin: 0 0 10px; letter-spacing: 0; text-transform: none; }
</style>
<h1>${ids.length} glyphs at ${sizes.join(', ')} px: the dark tile (${tile}) and the black high-contrast tile${flag('forced') ? ', forced-colors: active' : ''}</h1>
<main class="sheet">${ids.map(cell).join('')}</main>`;

await calm();
const dir = mkdtempSync(join(tmpdir(), 'glyph-sheet-')), page = join(dir, 'sheet.html'); writeFileSync(page, html);
const b = await launch(await freePort());
try {
  const p = await open(b, 'about:blank', { w: pageW, h: 800 });
  if (flag('forced')) await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
  await p.send('Page.navigate', { url: pathToFileURL(page).href });
  for (let i = 0; i < 100; i++) { if (await p.eval(`document.readyState === 'complete' && document.querySelectorAll('svg').length > 0`)) break; await p.sleep(100); }
  await p.sleep(300);
  const h = await p.eval(`Math.ceil(document.querySelector('main').getBoundingClientRect().bottom + 12)`);
  await p.send('Emulation.setDeviceMetricsOverride', { width: pageW, height: h, deviceScaleFactor: +arg('dsf', 1), mobile: false });
  await p.sleep(200);
  await p.shot(out, flag('forced') ? {} : { full: true }); // (forced colours: the viewport is already the size of the page)
  console.log(`${ids.length} glyphs, ${pageW} x ${h} px -> ${out}`);
  await p.close();
} finally { b.close(); rmSync(dir, { recursive: true, force: true }); }
