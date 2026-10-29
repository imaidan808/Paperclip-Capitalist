// What `scripts/stage.mjs` publishes, measured the way docs/ARCHITECTURE.md says: the page, every sheet it links and every module, each gzipped on its own. 1 KB is 1,024 bytes.
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
    // the title screen alone: main.js and what it needs without the five screens it imports (the game's shell, the draft, the Academy, the instructor's dashboard, the debrief)
    const SCREENS = new Set(['js/ui/draft.js', 'js/ui/academy.js', 'js/ui/shell.js', 'js/ui/instructor.js', 'js/ui/debrief.js']), seen = new Set(), q = ['js/main.js'];
    while (q.length) { const f = q.shift(); if (seen.has(f)) continue; seen.add(f); for (const d of [...(g.edges[f]?.statics || []), ...(g.edges[f]?.dynamics || [])]) if (!SCREENS.has(d)) q.push(d); }
    const title = of([...seen]);
    return { requests: 1 + sheets.length + g.modules.length, modules: g.modules.length, js, css, total: page + js[1] + css[1], title: { n: seen.size, raw: title[0], gz: title[1] }, rest: { n: g.modules.length - seen.size, raw: js[0] - title[0], gz: js[1] - title[1] }, world: g.modules.filter((f) => f.startsWith('js/world/')).length };
  } finally { rmSync(join(out, '..'), { recursive: true, force: true }); }
}
