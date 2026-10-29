// What `scripts/stage.mjs` publishes, measured the way docs/ARCHITECTURE.md says: the page, every sheet it links and every module, each gzipped on its own. 1 KB is 1,024 bytes. `first` is what the first screen fetches
// (the page, the sheets and the static graph); the rest of the modules are fetched when a screen opens or the browser is idle.
// Shared by tests/finish-repair.test.mjs (F2: the document's figures are the tree's) and scripts/arch-figures.mjs (which prints them, and rewrites the document's three lines on request).
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { walk } from '../../scripts/preload.mjs';
import { stage } from '../../scripts/stage.mjs';

export function measured() {
  const out = join(mkdtempSync(join(tmpdir(), 'pc-size-')), 'site');
  try {
    stage({ out, lastmod: '2026-10-28' });
    const g = walk(), html = readFileSync(join(out, 'index.html'));
    const sheets = [...html.toString().matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
    const of = (files) => files.reduce((a, f) => { const b = readFileSync(join(out, f)); return [a[0] + b.length, a[1] + gzipSync(b).length]; }, [0, 0]);
    const js = of(g.modules), css = of(sheets), page = gzipSync(html).length;
    // the title screen alone: the static graph of js/main.js, which is what the staged page preloads and all it fetches before the first screen (the later screens are loaded by import(), and by the idle prefetch once the page is up)
    const seen = new Set(g.static), title = of(g.static), first = page + css[1] + title[1];
    return { requests: 1 + sheets.length + g.modules.length, modules: g.modules.length, js, css, total: page + js[1] + css[1], title: { n: seen.size, raw: title[0], gz: title[1] }, rest: { n: g.modules.length - seen.size, raw: js[0] - title[0], gz: js[1] - title[1] },
      first: { requests: 1 + sheets.length + g.static.length, gz: first }, world: g.modules.filter((f) => f.startsWith('js/world/')).length, staticWorld: g.static.filter((f) => f.startsWith('js/world/')).length };
  } finally { rmSync(join(out, '..'), { recursive: true, force: true }); }
}
