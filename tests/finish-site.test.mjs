// The launch pass: the page a visitor (or a crawler, or a link preview) meets at https://imaidan808.github.io/Paperclip-Capitalist/, and the pipeline that builds exactly what is served.
// Pure parts first (the import scanner, the staging, the Pages stand-in, the workflow), then the source pages, then the docs, then one real run of the staged site in headless Chrome
// (skipped where there is no Chrome, as every Chrome-driven check of this repository is: PC_NO_BROWSER=1 skips it too).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { request } from 'node:http';
import { createServer as netServer } from 'node:net';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, posix, resolve, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { scanImports, walk, preloadLines, ENTRY, ROOT } from '../scripts/preload.mjs';
import { stage, verify, servePages, injectPreload, withLastmod, pageRefs, stylesheetsOf, pngSize, SITE_URL, BASE_PATH, TOP_FILES, TOP_DIRS } from '../scripts/stage.mjs';
import { ZONES, PERKS, ASSETS, BUYERS, TOTAL_DAYS, ECON, SWAPS, FMV_BAND, LEVEL_XP, EVENTS, DEBT, SKILL_MAX, PIPE_RULES } from '../js/config.js';
import { LOCK_MS, RECALL_WAIT_MS } from '../js/session.js';
import { ACADEMY } from '../js/meta/academy.js';
import { CODEX } from '../js/meta/codex.js';
import { QUESTS, ACHIEVEMENTS, DAILIES } from '../js/meta/quests.js';
import { REQUIRED_CODEX } from '../js/meta/ids.js';

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const exists = (p) => existsSync(join(ROOT, p));
const temps = [];
const tmp = (label = 'pc-site-') => { const d = mkdtempSync(join(tmpdir(), label)); temps.push(d); return d; };
after(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }); });
const walkDir = (dir, base = dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walkDir(p, base) : [p.slice(base.length + 1).split(sep).join('/')]; });
const TODAY = new Date().toISOString().slice(0, 10);

// ====================================================================================================================================
// 1. The import scanner: what a module imports, read the way JavaScript reads it
// ====================================================================================================================================

test('the scanner finds every form of static import and re-export, over several lines too', () => {
  const src = `
    import a from './a.js';
    import { b, c as d } from "./b.js";
    import * as e from './e.js'
    import f, { g } from './f.js';
    import './side.js';
    import {
      h,
      i,
    } from './multi.js';
    export * from './x.js';
    export * as ns from './ns.js';
    export { j, k as l } from './re.js';
    export { local };
    export const z = 1;
  `;
  assert.deepEqual(scanImports(src).statics, ['./a.js', './b.js', './e.js', './f.js', './side.js', './multi.js', './x.js', './ns.js', './re.js']);
});

test('the scanner reads import() with a string, finds a template with a hole as a pattern, and refuses what it cannot read', () => {
  const s = scanImports("const m = await import('./one.js'); const n = () => import(\"../two.js\"); const o = import(`./play/${name}.js`); const p = import(`./plain.js`);");
  assert.deepEqual(s.dynamics, ['./one.js', '../two.js', './plain.js']);
  assert.deepEqual(s.patterns, ['./play/${}.js']);
  assert.deepEqual(s.unreadable, []);
  assert.equal(scanImports('const x = import(somewhere);').unreadable.length, 1);
  assert.equal(scanImports("const x = import('./a.js' + b);").unreadable.length, 1);
});

test('the scanner skips comments, strings, templates and regular expressions, and what only looks like an import', () => {
  const src = `
    // import nope from './line-comment.js';
    /* import nope from './block-comment.js'; import('./block-dynamic.js') */
    const s = "import x from './in-a-string.js'", t = 'import("./in-another.js")';
    const u = \`import y from './in-a-template.js' \${ 'import z from "./nested.js"' }\`;
    const re = /import 'not-a-module'/g, d = a / b / c, e = x.import('./method.js');
    const o = { import: 1, export: 2 };
    const meta = import.meta.url;
    import real from './real.js';
  `;
  const r = scanImports(src);
  assert.deepEqual(r.statics, ['./real.js']);
  assert.deepEqual(r.dynamics, []);
});

test('the walk follows static imports first, then import(), expands a pattern to the files that fit it, and marks what only import() brings in', () => {
  const root = tmp('pc-walk-');
  const w = (p, text) => { mkdirSync(join(root, p, '..'), { recursive: true }); writeFileSync(join(root, p), text); };
  w('js/main.js', "import './a.js';\nimport { b } from './sub/b.js';\nconst opt = async (n) => import(`./games/${n}.js`);\nawait import('./lazy.js');\n");
  w('js/a.js', "import './b2.js';\nexport const a = 1;\n");
  w('js/b2.js', "import './a.js'; // a cycle is not a problem\n");
  w('js/sub/b.js', "export const b = 1;\n");
  w('js/games/one.js', "import '../deep.js';\n");
  w('js/games/two.js', '');
  w('js/games/readme.txt', 'not a module');
  w('js/deep.js', '');
  w('js/lazy.js', "import './sub/b.js';\n");
  w('js/unused.js', '');
  const g = walk(root, 'js/main.js');
  assert.deepEqual(g.static, ['js/main.js', 'js/a.js', 'js/sub/b.js', 'js/b2.js']);
  assert.deepEqual(g.dynamic.sort(), ['js/deep.js', 'js/games/one.js', 'js/games/two.js', 'js/lazy.js']);
  assert.ok(!g.modules.includes('js/unused.js') && !g.modules.some((m) => m.endsWith('.txt')));
  assert.equal(preloadLines(g).split('\n').length, g.modules.length);
  assert.match(preloadLines(g).split('\n')[0], /^ {2}<link rel="modulepreload" href="js\/main\.js">$/);
});

test('the walk fails loudly, and lists everything wrong, instead of staging a site that misses a module', () => {
  const root = tmp('pc-walk-bad-');
  const w = (p, text) => { mkdirSync(join(root, p, '..'), { recursive: true }); writeFileSync(join(root, p), text); };
  w('js/main.js', "import './missing.js';\nimport 'lodash';\nimport('/abs.js');\nconst x = import(`./nothing/${n}.js`);\nconst y = import(where);\nimport '../../outside.js';\n");
  assert.throws(() => walk(root, 'js/main.js'), (e) => {
    for (const part of ['./missing.js', '"lodash" is not a relative path', 'cannot read', 'matches no file', 'leaves the project']) assert.ok(e.message.includes(part), part + '\n' + e.message);
    return true;
  });
  assert.throws(() => walk(root, 'js/nope.js'), /entry module/);
});

test('the real app: every module main.js reaches exists, deal.js\'s optional games are in the graph, and only the one module the tests alone use is left out', () => {
  const g = walk();
  assert.equal(g.modules[0], ENTRY);
  for (const m of g.modules) assert.ok(exists(m), m);
  for (const m of ['js/session.js', 'js/engine.js', 'js/play/haggle.js', 'js/play/auction.js', 'js/meta/academy.js', 'js/world/world.js']) assert.ok(g.modules.includes(m), m);
  // haggle.js and auction.js are loaded by deal.js with import(`./play/${name}.js`): the page needs them, so they are staged and preloaded; academy.js is a static import of ui/academy.js and of the Codex drawer
  assert.ok(g.dynamic.includes('js/play/haggle.js') && g.dynamic.includes('js/play/auction.js') && !g.dynamic.includes('js/meta/academy.js'), 'the lessons are a static import now (tests/finish-repair.test.mjs V5)');
  const all = walkDir(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f);
  assert.deepEqual(all.filter((f) => !g.modules.includes(f)), ['js/meta/ids.js'], 'a module nothing imports is either dead or the tests\' alone: say which in this list');
  assert.ok(!/js\/meta\/ids\.js/.test(Object.values(g.edges).flatMap((e) => [...e.statics, ...e.dynamics]).join(' ')));
});

test('the scanner agrees with a plain regular expression over every static import of the real app', () => {
  // the regular expression reads one line at a time, so it can only see `from '...'` at the end of a line: join the lines of a multi-line import first
  for (const f of walkDir(join(ROOT, 'js')).filter((f) => f.endsWith('.js'))) {
    const src = read('js/' + f);
    const flat = src.replace(/(import|export)\s*(\*\s*(as\s+\w+\s*)?|\{[^}]*\})\s*from/g, (m) => m.replace(/\s+/g, ' '));
    const want = new Set([...flat.matchAll(/^\s*(?:import|export)\b[^;'"\n]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)].map((m) => m[1] || m[2]));
    assert.deepEqual([...new Set(scanImports(src).statics)].sort(), [...want].sort(), f);
  }
});

// ====================================================================================================================================
// 2. Staging: the exact artifact
// ====================================================================================================================================

const staged = (() => { let r = null; return () => (r ||= stage({ out: join(tmp('pc-stage-'), 'site'), lastmod: '2026-01-02' })); })();

test('the staged site holds the page, the four small files, assets, the linked sheets and the modules of the graph, and nothing else', () => {
  const r = staged();
  assert.deepEqual(readdirSync(r.out).sort(), [...TOP_FILES, ...TOP_DIRS].sort());
  assert.deepEqual(verify(r.out), []);
  const files = r.files;
  const js = files.filter((f) => f.startsWith('js/')), css = files.filter((f) => f.startsWith('css/')), assets = files.filter((f) => f.startsWith('assets/'));
  assert.deepEqual(js.sort(), walk().modules.slice().sort(), 'js/ is the module graph, exactly');
  assert.deepEqual(css.sort(), stylesheetsOf(read('index.html')).sort(), 'css/ is what index.html links, exactly');
  assert.deepEqual(assets.sort(), ['assets/apple-touch-icon.png', 'assets/favicon.svg', 'assets/share.png']);
  assert.equal(files.length, js.length + css.length + assets.length + TOP_FILES.length);
  for (const never of ['tests', 'server', 'docs', 'scripts', 'dev', '.git', '.github', 'package.json', 'README.md', '.nojekyll', 'node_modules']) assert.ok(!existsSync(join(r.out, never)), never + ' is not published');
  assert.ok(!files.some((f) => /(^|\/)\./.test(f) || f.endsWith('.map') || f.startsWith('assets/src/')), 'no hidden file, no source map, no scene source');
  for (const f of files) if (/\.(js|css|html)$/.test(f)) assert.ok(!/sourceMappingURL/.test(readFileSync(join(r.out, f), 'utf8')), f + ' names no source map');
  // every file is the source file byte for byte, except the two that are made: the page (preload lines) and the sitemap (the date)
  for (const f of files.filter((f) => !['index.html', 'sitemap.xml'].includes(f))) assert.ok(readFileSync(join(r.out, f)).equals(readFileSync(join(ROOT, f))), f);
});

test('the staged page has one modulepreload line for each module, in graph order, and the source page has none', () => {
  const r = staged();
  const html = readFileSync(join(r.out, 'index.html'), 'utf8'), src = read('index.html');
  assert.ok(!/modulepreload/.test(src), 'the source page is plain: npm start and the tests see it as it is');
  const links = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(links, walk().modules);
  assert.equal(links[0], 'js/main.js');
  // nothing else of the page changed: take the preload block out and it is the source page again
  assert.equal(html.replace(/ {2}<!-- modulepreload[^\n]*\n(?: {2}<link rel="modulepreload"[^\n]*\n)+/, ''), src);
  assert.ok(html.indexOf('modulepreload') > html.lastIndexOf('rel="stylesheet"'), 'the sheets are asked for first: they are what blocks the first paint');
  assert.ok(html.indexOf('modulepreload') < html.indexOf('</head>'));
  assert.throws(() => injectPreload(html, '  <link rel="modulepreload" href="js/x.js">'), /already has modulepreload/);
  assert.throws(() => injectPreload('<html><body></body></html>', 'x'), /no <\/head>/);
});

test('the sitemap takes the date it is given, and only a real date', () => {
  const r = staged();
  assert.match(readFileSync(join(r.out, 'sitemap.xml'), 'utf8'), /<lastmod>2026-01-02<\/lastmod>/);
  assert.equal(withLastmod('<lastmod>x</lastmod><lastmod>y</lastmod>', '2026-03-04'), '<lastmod>2026-03-04</lastmod><lastmod>2026-03-04</lastmod>');
  for (const bad of ['', 'yesterday', '2026-3-4', '20260304', '2026-03-04T00:00']) assert.throws(() => withLastmod('<lastmod>x</lastmod>', bad), /YYYY-MM-DD/);
  const again = stage({ out: join(tmp(), 'plain') });
  assert.equal(readFileSync(join(again.out, 'sitemap.xml'), 'utf8'), read('sitemap.xml'), 'with no date given the source sitemap goes up as it is');
});

test('stage refuses to empty a folder that is not its own, or the project', () => {
  const foreign = tmp('pc-foreign-'); writeFileSync(join(foreign, 'precious.txt'), 'mine');
  assert.throws(() => stage({ out: foreign }), /not empty and is not a folder this script staged/);
  assert.ok(existsSync(join(foreign, 'precious.txt')));
  // (against a scratch project, so that a guard that failed one day would empty a scratch folder and not the checkout or the machine)
  const base = tmp('pc-base-'), proj = join(base, 'proj');
  for (const d of ['js', 'css', 'docs', 'assets', '.git']) mkdirSync(join(proj, d), { recursive: true });
  writeFileSync(join(proj, 'docs/keep.md'), 'kept');
  for (const bad of [proj, join(proj, 'js'), join(proj, 'css'), join(proj, 'docs'), join(proj, 'assets'), join(proj, '.git'), base]) assert.throws(() => stage({ root: proj, out: bad }), /Refusing to stage/, bad);
  assert.ok(existsSync(join(proj, 'docs/keep.md')) && existsSync(join(proj, 'js')), 'nothing was emptied');
  // an empty folder, a new one and its own earlier output are fine
  const out = join(tmp(), 'again');
  stage({ out }); stage({ out });
  assert.deepEqual(verify(out), []);
});

test('verify finds a module missing, a module left over, a stray file, a source map, a changed preload list and a wrong share image', () => {
  const base = staged().out;
  const broken = (mutate) => { const d = join(tmp('pc-broken-'), 'site'); cpSync(base, d, { recursive: true }); mutate(d); return verify(d).join('\n'); };
  assert.match(broken((d) => rmSync(join(d, 'js/engine.js'))), /js\/engine\.js: imported but not staged/);
  assert.match(broken((d) => writeFileSync(join(d, 'js/extra.js'), 'export {};')), /js\/extra\.js: staged but nothing imports it/);
  assert.match(broken((d) => writeFileSync(join(d, 'notes.txt'), 'x')), /notes\.txt is not part of the site/);
  assert.match(broken((d) => writeFileSync(join(d, 'js/rng.js.map'), '{}')), /a source map/);
  assert.match(broken((d) => writeFileSync(join(d, 'js/rng.js'), readFileSync(join(d, 'js/rng.js'), 'utf8') + '\n//# sourceMappingURL=rng.js.map\n')), /names a source map/);
  assert.match(broken((d) => writeFileSync(join(d, 'index.html'), readFileSync(join(d, 'index.html'), 'utf8').replace('  <link rel="modulepreload" href="js/net.js">\n', ''))), /modulepreload lines are not the module graph/);
  assert.match(broken((d) => writeFileSync(join(d, 'assets/share.png'), readFileSync(join(d, 'assets/apple-touch-icon.png')))), /not a 1200 x 630 PNG/);
  assert.match(broken((d) => writeFileSync(join(d, 'index.html'), readFileSync(join(d, 'index.html'), 'utf8').replace('<link rel="stylesheet" href="css/styles.css">', '<link rel="stylesheet" href="https://fonts.example.com/x.css">'))), /asks another host for https:\/\/fonts\.example\.com/);
  assert.match(broken((d) => rmSync(join(d, '404.html'))), /404\.html is missing/);
  assert.match(verify(join(tmp(), 'nowhere')).join(), /does not exist/);
});

test('page references: a stylesheet, a script, an icon and the share image count as local files; a canonical address and another host do not', () => {
  const html = `<link rel="canonical" href="${SITE_URL}"><link rel="stylesheet" href="css/a.css"><script src="js/x.js"></script><link rel="icon" href="data:image/svg+xml,xx"><link rel="icon" href="assets/f.svg">
    <link rel="apple-touch-icon" href="assets/t.png"><meta property="og:image" content="${SITE_URL}assets/share.png"><img src="https://cdn.example.com/p.png" alt=""><a href="#app">skip</a><script type="module" src="js/main.js"></script>`;
  const { local, remote } = pageRefs(html);
  assert.deepEqual(local.sort(), ['assets/f.svg', 'assets/share.png', 'assets/t.png', 'css/a.css', 'js/main.js', 'js/x.js']);
  assert.deepEqual(remote, ['https://cdn.example.com/p.png']);
  assert.deepEqual(stylesheetsOf(read('index.html')), ['css/styles.css', 'css/shell.css', 'css/ui-stock.css', 'css/ui-market.css', 'css/ui-crew.css', 'css/ui-bank.css', 'css/ui-travel.css', 'css/ui-codex.css', 'css/ui-quests.css', 'css/ui-deal.css', 'css/ui-academy.css', 'css/ui-draft.css']);
});

test('no stylesheet reaches another file or another host (an @import is fetched only after the sheet that holds it, a url() is a second request)', () => {
  for (const f of readdirSync(join(ROOT, 'css'))) {
    const css = read('css/' + f).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/@import/.test(css), f + ' has no @import');
    for (const m of css.matchAll(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g)) assert.match(m[2], /^(data:|#)/, `${f}: url(${m[2]}) must be a data: address or a fragment`);
  }
});

// ====================================================================================================================================
// 3. The Pages stand-in
// ====================================================================================================================================

const listen = (server) => new Promise((res) => server.listen(0, '127.0.0.1', () => res(server.address().port)));
const get = (port, path, { method = 'GET', headers = {} } = {}) => new Promise((res, rej) => {
  const rq = request({ host: '127.0.0.1', port, path, method, headers }, (r) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks) })); });
  rq.on('error', rej); rq.end();
});

test('the Pages stand-in answers as a project site does: under its folder, 404.html for anything that is not a file, redirects for a folder, gzip, a cache lifetime', async () => {
  const dir = staged().out, server = servePages(dir), port = await listen(server);
  try {
    const home = await get(port, BASE_PATH);
    assert.equal(home.status, 200);
    assert.match(home.headers['content-type'], /^text\/html/);
    assert.equal(home.body.toString(), readFileSync(join(dir, 'index.html'), 'utf8'));
    assert.equal(home.headers['cache-control'], 'max-age=600');
    const noSlash = await get(port, BASE_PATH.slice(0, -1));
    assert.equal(noSlash.status, 301); assert.equal(noSlash.headers.location, BASE_PATH);
    const idx = await get(port, BASE_PATH + 'index.html');
    assert.equal(idx.status, 200);
    for (const [path, type] of [['js/main.js', /javascript/], ['css/styles.css', /^text\/css/], ['assets/share.png', /^image\/png/], ['assets/favicon.svg', /^image\/svg/], ['robots.txt', /^text\/plain/], ['sitemap.xml', /xml/], ['llms.txt', /^text\/plain/]]) {
      const r = await get(port, BASE_PATH + path);
      assert.equal(r.status, 200, path); assert.match(r.headers['content-type'], type, path);
    }
    // a path that is not a file: the status is 404 and the body is the site's own 404.html, at any depth
    for (const path of ['nope', 'no/such/page', 'js', 'js/', 'css/missing.css', 'index.html/', '%2e%2e/etc/passwd', 'js/../../x']) {
      const r = await get(port, BASE_PATH + path);
      assert.equal(r.status, path === 'js' ? 301 : 404, path);
      if (r.status === 404) assert.equal(r.body.toString(), readFileSync(join(dir, '404.html'), 'utf8'), path);
    }
    assert.equal((await get(port, '/')).status, 404);
    assert.equal((await get(port, '/other-repo/')).status, 404);
    assert.equal((await get(port, '/Paperclip-Capitalist/%')).status, 400);
    assert.equal((await get(port, BASE_PATH, { method: 'POST' })).status, 405);
    const head = await get(port, BASE_PATH + 'js/main.js', { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(head.body.length, 0);
    // gzip only when asked for, and the bytes are the file
    const zipped = await get(port, BASE_PATH + 'js/engine.js', { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(zipped.headers['content-encoding'], 'gzip');
    assert.ok(zipped.body.length < statSync(join(dir, 'js/engine.js')).size / 3);
    assert.equal(gunzipSync(zipped.body).toString(), readFileSync(join(dir, 'js/engine.js'), 'utf8'));
    assert.equal((await get(port, BASE_PATH + 'js/engine.js')).headers['content-encoding'], undefined);
    assert.equal((await get(port, BASE_PATH + 'assets/share.png', { headers: { 'accept-encoding': 'gzip' } })).headers['content-encoding'], undefined, 'a picture is not compressed again');
    assert.ok(server.hits.length > 20 && server.hits.every((h) => typeof h.status === 'number' && typeof h.bytes === 'number'));
  } finally { server.close(); }
});

// ====================================================================================================================================
// 4. The workflow
// ====================================================================================================================================

/** A reader for the part of YAML the workflow uses: block maps and sequences, flow maps and sequences, quoted and plain scalars, block scalars, comments. It throws on what it does not understand. */
function parseYaml(text) {
  const L = text.split('\n').map((s) => s.replace(/\r$/, ''));
  let i = 0;
  const indentOf = (s) => s.match(/^ */)[0].length;
  const fail = (m) => { throw new Error(`YAML line ${i + 1}: ${m}`); };
  const skip = () => { while (i < L.length && /^\s*(#.*)?$/.test(L[i])) i++; };
  const stripComment = (s) => { let q = null; for (let k = 0; k < s.length; k++) { const c = s[k]; if (q) { if (c === q) q = null; } else if (c === '"' || c === '\'') q = c; else if (c === '#' && (k === 0 || /\s/.test(s[k - 1]))) return s.slice(0, k).trimEnd(); } return s; };
  const splitTop = (s) => { const out = []; let depth = 0, q = null, cur = ''; for (const c of s) { if (q) { if (c === q) q = null; } else if (c === '"' || c === '\'') q = c; else if (c === '{' || c === '[') depth++; else if (c === '}' || c === ']') depth--; if (c === ',' && depth === 0 && !q) { out.push(cur); cur = ''; } else cur += c; } if (cur.trim()) out.push(cur); return out; };
  const scalar = (raw) => {
    const s = raw.trim();
    if (s === '' || s === 'null' || s === '~') return null;
    if (s[0] === '"') { if (s.at(-1) !== '"' || s.length < 2) fail('an unclosed double quote'); return JSON.parse(s); }
    if (s[0] === '\'') { if (s.at(-1) !== '\'' || s.length < 2) fail('an unclosed single quote'); return s.slice(1, -1).replace(/''/g, '\''); }
    if (s[0] === '{') { if (s.at(-1) !== '}') fail('an unclosed {'); const o = {}; for (const part of splitTop(s.slice(1, -1))) { const m = part.match(/^\s*("[^"]*"|'[^']*'|[^:]+?)\s*:\s*(.*)$/s); if (!m) fail('a flow map entry without a colon: ' + part); o[m[1].replace(/^["']|["']$/g, '')] = scalar(m[2]); } return o; }
    if (s[0] === '[') { if (s.at(-1) !== ']') fail('an unclosed ['); return splitTop(s.slice(1, -1)).map(scalar); }
    if (s === 'true' || s === 'false') return s === 'true';
    if (/^-?\d+(\.\d+)?$/.test(s)) return +s;
    return s;
  };
  const KEY = /^("[^"]*"|'[^']*'|[^\s:'"{[#-][^:]*?)\s*:(\s+(.*))?$/;
  const looksLikeKey = (s) => KEY.test(stripComment(s)) && !/^[{[]/.test(s);
  function block(minIndent) {
    skip();
    if (i >= L.length || indentOf(L[i]) < minIndent) return null;
    return /^-(\s|$)/.test(L[i].trimStart()) ? seq(indentOf(L[i])) : map(indentOf(L[i]));
  }
  function seq(ind) {
    const out = [];
    for (;;) {
      skip();
      if (i >= L.length || indentOf(L[i]) !== ind || !/^-(\s|$)/.test(L[i].trimStart())) break;
      const rest = L[i].trimStart().slice(1), after = rest.replace(/^ +/, '');
      if (after === '') { i++; out.push(block(ind + 1)); }
      else if (looksLikeKey(after)) { const at = ind + 1 + (rest.length - after.length); L[i] = ' '.repeat(at) + after; out.push(map(at)); }
      else { i++; out.push(scalar(stripComment(after))); }
    }
    return out;
  }
  function blockScalar(parent, head) {
    const lines = [];
    while (i < L.length && (L[i].trim() === '' || indentOf(L[i]) > parent)) lines.push(L[i++]);
    const first = lines.find((l) => l.trim() !== ''), width = first ? indentOf(first) : 0;
    let body = lines.map((l) => l.slice(width)).join('\n').replace(/\n+$/, '');
    if (head === '|' || head === '|+') body += '\n';
    return body;
  }
  function map(ind) {
    const o = {};
    for (;;) {
      skip();
      if (i >= L.length || indentOf(L[i]) !== ind || /^-(\s|$)/.test(L[i].trimStart())) break;
      const line = stripComment(L[i].trim()), m = line.match(KEY);
      if (!m) fail('not a "key: value" line: ' + line);
      const key = m[1].replace(/^["']|["']$/g, ''), val = (m[3] ?? '').trim();
      if (Object.prototype.hasOwnProperty.call(o, key)) fail('the key ' + key + ' is given twice');
      i++;
      if (val === '') { skip(); o[key] = i < L.length && (indentOf(L[i]) > ind || (indentOf(L[i]) === ind && /^-(\s|$)/.test(L[i].trimStart()))) ? block(indentOf(L[i])) : null; }
      else if (/^[|>][+-]?$/.test(val)) o[key] = blockScalar(ind, val);
      else o[key] = scalar(val);
    }
    return o;
  }
  const doc = block(0);
  skip();
  if (i < L.length) fail('unexpected indentation or content: ' + L[i].trim());
  return doc;
}

test('the YAML reader of this test understands what it must, and refuses what is not YAML', () => {
  const y = parseYaml(`# top
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
jobs:
  a:
    steps:
      - uses: x/y@v1
        with: { path: _site, n: 22 }
      - name: Run  # a comment
        run: |
          echo "# not a comment"
          if [ -f x ]; then
            echo ok
          fi
      - 'quoted'
      - plain
`);
  assert.deepEqual(y, { name: 'Deploy', on: { push: { branches: ['main'] }, workflow_dispatch: null }, jobs: { a: { steps: [{ uses: 'x/y@v1', with: { path: '_site', n: 22 } }, { name: 'Run', run: 'echo "# not a comment"\nif [ -f x ]; then\n  echo ok\nfi\n' }, 'quoted', 'plain'] } } });
  for (const bad of ['a: 1\n  b: 2\n', 'a: {b: 1\n', 'a: 1\na: 2\n', 'a:\n  - x\n y: 1\n', '- a\nb: 1\n', 'a: "x\n']) assert.throws(() => parseYaml(bad), /YAML line/, JSON.stringify(bad));
});

test('the Pages workflow is valid YAML that runs the tests, stages the site with scripts/stage.mjs and uploads only that folder', () => {
  const text = read('.github/workflows/pages.yml'), wf = parseYaml(text);
  // a real YAML parser, where there is one, must read it the same way (it reads the key `on` as true, as YAML 1.1 does)
  const py = spawnSync('python3', ['-I', '-c', 'import sys, json, yaml\nd = yaml.safe_load(sys.stdin.read())\nd["on"] = d.pop(True)\nprint(json.dumps(d))'], { input: text, encoding: 'utf8' });
  if (py.status === 0) assert.deepEqual(wf, JSON.parse(py.stdout), 'this test\'s reader and PyYAML agree on the workflow'); else console.log('(PyYAML is not available here; the workflow was read by this test\'s own reader only)');
  assert.equal(wf.name, 'Deploy to GitHub Pages');
  assert.deepEqual(wf.on.push.branches, ['main']); assert.ok('workflow_dispatch' in wf.on);
  assert.deepEqual(wf.permissions, { contents: 'read', pages: 'write', 'id-token': 'write' });
  assert.deepEqual(Object.keys(wf.jobs), ['test', 'deploy']);
  assert.equal(wf.jobs.deploy.needs, 'test');
  for (const [name, job] of Object.entries(wf.jobs)) { assert.ok(job['runs-on'], name + ' runs on something'); for (const s of job.steps) assert.ok(s.uses || s.run, 'a step does something'); }
  // the actions keep the versions the workflow was written with
  const uses = Object.values(wf.jobs).flatMap((j) => j.steps.map((s) => s.uses).filter(Boolean));
  for (const u of uses) assert.match(u, /^[\w.-]+\/[\w.-]+@v\d+$/, u);
  assert.deepEqual([...new Set(uses)].sort(), ['actions/checkout@v7', 'actions/configure-pages@v6', 'actions/deploy-pages@v5', 'actions/setup-node@v7', 'actions/upload-pages-artifact@v5']);
  // the test job runs the whole suite and stops on a test marked todo
  const testRuns = wf.jobs.test.steps.map((s) => s.run || '').join('\n');
  assert.match(testRuns, /npm ci --prefix server/); assert.match(testRuns, /npm test/); assert.match(testRuns, /todo \[1-9\]/);
  // the deploy job stages with the script, from the commit's date, and uploads what the script staged: one folder, the one the script was told
  const run = wf.jobs.deploy.steps.map((s) => s.run || '').join('\n');
  const m = run.match(/node scripts\/stage\.mjs (\S+)( --lastmod "\$\(git log -1 --format=%cs\)")?/);
  assert.ok(m, 'the deploy job runs scripts/stage.mjs'); assert.ok(m[2], 'with the date of the commit');
  const up = wf.jobs.deploy.steps.find((s) => /upload-pages-artifact/.test(s.uses || ''));
  assert.equal(up.with.path, m[1], 'it uploads the folder stage.mjs wrote');
  assert.ok(!/\bcp\b|\bcp -r\b|mkdir/.test(run), 'no hand-made copy: the script is the one list of what is published');
  assert.ok(wf.jobs.deploy.steps.findIndex((s) => /stage\.mjs/.test(s.run || '')) < wf.jobs.deploy.steps.indexOf(up));
  assert.equal(wf.jobs.deploy.environment.name, 'github-pages');
  assert.ok(existsSync(join(ROOT, 'scripts/stage.mjs')));
});

test('package.json gives the pipeline its commands, and the test command still runs every test file', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.test, 'node --test tests/*.test.mjs');
  assert.equal(pkg.scripts.stage, 'node scripts/stage.mjs'); assert.equal(pkg.scripts.preview, 'node scripts/stage.mjs --serve'); assert.equal(pkg.scripts.preload, 'node scripts/preload.mjs');
  for (const [name, cmd] of Object.entries(pkg.scripts)) { const f = cmd.match(/^node (\S+)/)?.[1]; if (f && !f.includes('*') && !f.startsWith('--')) assert.ok(exists(f), `npm run ${name} runs ${f}`); }
  assert.ok(!pkg.dependencies && !pkg.devDependencies, 'no dependencies: no bundler, no build step');
});

test('npm run preload and npm run stage work as programs', () => {
  const lines = spawnSync(process.execPath, [join(ROOT, 'scripts/preload.mjs')], { encoding: 'utf8' });
  assert.equal(lines.status, 0, lines.stderr);
  assert.equal(lines.stdout.trimEnd(), preloadLines(walk()));
  const out = join(tmp(), 'cli'), r = spawnSync(process.execPath, [join(ROOT, 'scripts/stage.mjs'), out, '--lastmod', '2026-05-06'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /Staged \d+ files \(\d+ modules, \d+ of them needed before the first screen\)/); assert.match(r.stdout, /The staged site is sound\./);
  assert.deepEqual(verify(out), []);
  const bad = spawnSync(process.execPath, [join(ROOT, 'scripts/stage.mjs'), '--lastmod', 'soon', join(tmp(), 'x')], { encoding: 'utf8' });
  assert.equal(bad.status, 1); assert.match(bad.stderr, /YYYY-MM-DD/);
  const v = spawnSync(process.execPath, [join(ROOT, 'scripts/stage.mjs'), '--verify', out], { encoding: 'utf8' });
  assert.equal(v.status, 0, v.stderr);
  rmSync(join(out, 'js/rng.js'));
  const v2 = spawnSync(process.execPath, [join(ROOT, 'scripts/stage.mjs'), '--verify', out], { encoding: 'utf8' });
  assert.equal(v2.status, 1); assert.match(v2.stderr, /imported but not staged/);
});

// ====================================================================================================================================
// 5. The pages themselves: the launch checklist
// ====================================================================================================================================

const head = (html) => html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
const meta = (html, key, attr = 'name') => (html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`)) || [])[1];
const unescapeHtml = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

test('index.html: a real title and description, a canonical address, theme color, language and viewport', () => {
  const html = read('index.html'), h = head(html);
  assert.match(html, /^<!doctype html>\n<html lang="en"/);
  assert.match(h, /<meta name="viewport" content="width=device-width, initial-scale=1/);
  const title = h.match(/<title>([^<]+)<\/title>/)[1];
  assert.ok(title.length >= 20 && title.length <= 60, `a title that fits a result line: ${title.length}`);
  assert.ok(title.startsWith('Paperclip Capitalist'));
  const desc = meta(h, 'description');
  assert.ok(desc.length >= 70 && desc.length <= 160, `a description that fits a result: ${desc.length}`);
  assert.ok(!/\bTODO\b|lorem|placeholder|coming soon|untitled/i.test(title + desc));
  assert.deepEqual([...h.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map((m) => m[1]), [SITE_URL], 'one canonical address, the site\'s');
  assert.equal(meta(h, 'theme-color'), '#0d1117');
  assert.equal(meta(h, 'color-scheme'), 'dark');
  assert.equal((h.match(/<title>/g) || []).length, 1); assert.equal((h.match(/name="description"/g) || []).length, 1);
});

test('index.html: Open Graph and Twitter cards with an absolute share image that is a real 1200 x 630 picture', () => {
  const h = head(read('index.html')), desc = meta(h, 'description');
  const og = (k) => meta(h, 'og:' + k, 'property'), tw = (k) => meta(h, 'twitter:' + k);
  assert.equal(og('type'), 'website'); assert.equal(og('url'), SITE_URL); assert.equal(og('site_name'), 'Paperclip Capitalist'); assert.equal(og('locale'), 'en_US');
  assert.equal(og('description'), desc); assert.equal(tw('description'), desc);
  assert.ok(og('title').length <= 70 && tw('title') === og('title'));
  const img = SITE_URL + 'assets/share.png';
  assert.equal(og('image'), img); assert.equal(tw('image'), img); assert.equal(tw('card'), 'summary_large_image'); assert.equal(og('image:type'), 'image/png');
  assert.equal(og('image:width'), '1200'); assert.equal(og('image:height'), '630');
  for (const alt of [og('image:alt'), tw('image:alt')]) assert.ok(alt && alt.length > 30 && /paperclip/i.test(alt) && /sixteen districts/i.test(alt), 'the picture is described');
  const png = readFileSync(join(ROOT, 'assets/share.png'));
  assert.deepEqual(pngSize(png), { w: 1200, h: 630 });
  assert.ok(png.length > 10e3 && png.length < 400e3, `a share picture of a sensible weight: ${png.length}`);
  assert.deepEqual(pngSize(readFileSync(join(ROOT, 'assets/apple-touch-icon.png'))), { w: 180, h: 180 });
  assert.ok(pngSize(Buffer.from('not a png')) === null);
});

test('index.html: icons. The inline favicon stays, the file icons are the same mark, and the touch icon is linked', () => {
  const h = head(read('index.html'));
  const inline = h.match(/<link rel="icon" href="(data:image\/svg\+xml,[^"]+)"/)[1];
  const svg = decodeURIComponent(inline.slice('data:image/svg+xml,'.length));
  assert.match(svg, /^<svg xmlns='http:\/\/www\.w3\.org\/2000\/svg' viewBox='0 0 32 32'>/);
  const file = read('assets/favicon.svg').trim();
  const pathOf = (s) => (s.match(/<path d=['"]([^'"]+)['"]/) || [])[1];
  assert.ok(pathOf(svg) && pathOf(svg) === pathOf(file), 'the file favicon draws the inline one\'s paperclip');
  assert.equal((file.match(/stroke=['"]([^'"]+)['"]/) || [])[1], '#ffc247'); assert.equal((svg.match(/stroke='([^']+)'/) || [])[1], '#ffc247');
  assert.ok(file.length < 400, 'a small file');
  assert.match(h, /<link rel="icon" href="assets\/favicon\.svg" type="image\/svg\+xml">/);
  assert.match(h, /<link rel="apple-touch-icon" href="assets\/apple-touch-icon\.png">/);
  assert.equal(read('404.html').match(/<link rel="icon" href="(data:[^"]+)"/)[1], inline, 'the 404 page wears the same icon, inline');
});

test('index.html: JSON-LD is valid, describes a free educational web application, and says what the code says', () => {
  const html = read('index.html');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1);
  const ld = JSON.parse(blocks[0][1]);
  assert.equal(ld['@context'], 'https://schema.org'); assert.equal(ld['@type'], 'WebApplication');
  assert.equal(ld.name, 'Paperclip Capitalist'); assert.equal(ld.url, SITE_URL); assert.equal(ld['@id'], SITE_URL + '#app');
  assert.equal(ld.applicationCategory, 'EducationalApplication');
  assert.ok(ld.operatingSystem && ld.browserRequirements && ld.inLanguage === 'en-US' && ld.isAccessibleForFree === true);
  assert.deepEqual(ld.offers, { '@type': 'Offer', price: '0', priceCurrency: 'USD' });
  assert.equal(ld.audience['@type'], 'EducationalAudience'); assert.ok(ld.audience.educationalRole && ld.audience.audienceType);
  assert.equal(ld.image, SITE_URL + 'assets/share.png');
  assert.equal(ld.description.length > 80, true);
  // the facts it states are the game's: sixteen districts, twelve Backgrounds, a 90-day run, five skill games, ten Academy missions
  const num = { 5: 'five', 10: 'ten', 12: 'twelve', 16: 'sixteen' };
  assert.equal(Object.keys(ZONES).length, 16); assert.equal(Object.keys(PERKS).length, 12); assert.equal(TOTAL_DAYS, 90); assert.equal(ACADEMY.length, 10);
  const games = readdirSync(join(ROOT, 'js/play')).length; assert.equal(games, 5);
  const text = JSON.stringify(ld).toLowerCase();
  for (const need of [`${num[16]} districts`, `${num[12]} backgrounds`, '90-day', `${num[5]} skill games`, `${num[10]} academy missions`]) assert.ok(text.includes(need), need);
  assert.ok(JSON.stringify(ld).includes('a virtual 90-day run'));
  // it is JSON and nothing that closes the script early
  assert.ok(!/<\/script/i.test(blocks[0][1]));
  // the page's own descriptions agree with the facts: "90 virtual days", "$0"
  assert.match(meta(head(html), 'description'), /\$0 into a business in 90 virtual days/);
});

test('index.html: a noscript message that says what the page is and why it needs JavaScript, and the script is a module loaded last', () => {
  const html = read('index.html');
  const ns = html.match(/<noscript>([\s\S]*?)<\/noscript>/)[1];
  assert.match(ns, /<h1>Paperclip Capitalist<\/h1>/); assert.match(ns, /needs JavaScript/); assert.match(ns, /one paperclip and \$0/); assert.match(ns, /classroom room/);
  assert.ok(ns.replace(/<[^>]+>/g, '').trim().length > 200);
  assert.ok(html.indexOf('<noscript>') < html.indexOf('<script type="module" src="js/main.js"></script>'));
  assert.ok(html.trimEnd().endsWith('</html>') && html.lastIndexOf('<script type="module"') > html.indexOf('<main id="app"'));
});

test('index.html makes no request to another host, has no image without alt text and no placeholder text, and the 404 page is as clean', () => {
  for (const page of ['index.html', '404.html']) {
    const html = read(page), { remote } = pageRefs(html);
    assert.deepEqual(remote, [], page + ' asks no other host for anything');
    for (const img of html.matchAll(/<img\b[^>]*>/gi)) assert.match(img[0], /\balt="/, `${page}: ${img[0]}`);
    for (const svg of html.matchAll(/<svg\b[^>]*>/gi)) assert.match(svg[0], /aria-hidden="true"|role="img"[^>]*aria-label=|aria-label=[^>]*role="img"/, `${page}: an svg is hidden or named`);
    assert.ok(!/lorem ipsum|\bTODO\b|\bFIXME\b|\bTBD\b|coming soon|placeholder text|your text here|example\.com/i.test(html), page + ': no placeholder text');
    assert.ok(!/\u2014/.test(html), page + ': no em dash');
  }
  // every image the game itself can put on a page has alt text too
  for (const f of walkDir(join(ROOT, 'js')).filter((f) => f.endsWith('.js'))) for (const m of read('js/' + f).matchAll(/<img\b[^>]*>/gi)) assert.match(m[0], /\balt=/, `js/${f}: ${m[0].slice(0, 80)}`);
  // the share-image scene describes its picture
  assert.match(read('assets/src/share.html'), /<svg[^>]*role="img"[^>]*aria-label="[^"]{30,}"/);
});

test('the share-image scenes are static: no script, no request, no external font', () => {
  for (const f of ['assets/src/share.html', 'assets/src/icon.html']) {
    const html = read(f);
    assert.ok(!/<script|@import|<link\b/i.test(html), f + ' has no script and links nothing');
    assert.deepEqual(pageRefs(html).remote, [], f);
    for (const m of html.matchAll(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g)) assert.match(m[2], /^(data:|#)/, f);
  }
  assert.match(read('assets/src/share.html'), /One paperclip\. Sixteen districts\./);
  assert.match(read('assets/src/share.html'), /<title>[^<]*1200 x 630/);
});

test('404.html: friendly, in the game\'s look, needs no script and no other file, and links home with an absolute address', () => {
  const html = read('404.html');
  assert.match(html, /<title>Page not found \| Paperclip Capitalist<\/title>/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.ok(!/<script/i.test(html), 'no script');
  assert.ok(!/<link rel="stylesheet"/i.test(html) && /<style>/.test(html), 'its look is inline');
  const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(links, [SITE_URL], 'one link, home, absolute (this page is served at any depth)');
  assert.match(html, /404/); assert.match(html, /Back to the game/); assert.match(html, /<main>/);
  assert.match(html, /<html lang="en">/); assert.match(html, /name="viewport"/);
  // the game's own tokens: the dark ground and the gold of css/styles.css
  const css = read('css/styles.css'), tok = (n) => css.match(new RegExp(`--${n}: (#[0-9a-f]{6})`))[1];
  for (const n of ['bg', 'panel', 'line', 'ink', 'mute', 'gold', 'on-gold', 'focus']) assert.ok(html.includes(tok(n)), `--${n} (${tok(n)}) is the game's`);
  assert.ok(!/zone/i.test(html.replace(/<style>[\s\S]*?<\/style>/, '')), 'a district, never a zone');
});

test('the site\'s address is the same everywhere it is written', () => {
  assert.equal(SITE_URL, 'https://imaidan808.github.io/Paperclip-Capitalist/');
  assert.equal(BASE_PATH, '/Paperclip-Capitalist/');
  for (const f of ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'llms.txt', 'README.md', 'docs/FACULTY_KIT.md', 'docs/COMPLIANCE.md', 'scripts/stage.mjs']) {
    const found = [...read(f).matchAll(/https?:\/\/imaidan808\.github\.io[^\s"'<>)`]*/g)].map((m) => m[0]);
    for (const u of found) assert.ok(u.startsWith(SITE_URL), `${f}: ${u} is not under ${SITE_URL}`);
  }
  for (const f of ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'llms.txt']) assert.ok(read(f).includes(SITE_URL), `${f} names the site`);
});

test('robots.txt, sitemap.xml and llms.txt', () => {
  const robots = read('robots.txt');
  assert.match(robots, /^User-agent: \*\nAllow: \/\n/);
  assert.ok(!/Disallow: *\S/.test(robots), 'allow all');
  assert.deepEqual([...robots.matchAll(/^Sitemap: (\S+)$/gm)].map((m) => m[1]), [SITE_URL + 'sitemap.xml']);
  const xml = read('sitemap.xml');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  assert.equal(urls.length, 1, 'the one page');
  assert.equal(urls[0].match(/<loc>([^<]+)<\/loc>/)[1], SITE_URL);
  const lastmod = urls[0].match(/<lastmod>([^<]+)<\/lastmod>/)[1];
  assert.match(lastmod, /^\d{4}-\d{2}-\d{2}$/); assert.ok(Date.parse(lastmod) <= Date.now() + 2 * 864e5 && lastmod >= '2026-10-28', `a real date, not in the future (a day of slack for time zones): ${lastmod}`);
  assert.ok(!Number.isNaN(Date.parse(lastmod)));
  const llms = read('llms.txt');
  assert.match(llms, /^# Paperclip Capitalist\n\n> /);
  for (const need of ['one paperclip and $0', 'twelve Backgrounds', 'sixteen districts', '90-day', 'static web app', 'no build step', 'What stays on the device', 'Privacy model', 'no accounts', 'no analytics', 'no third-party requests', 'unless a student joins a classroom room', 'BroadcastChannel', 'relay', 'writes nothing to disk', 'ten short guided missions']) assert.ok(llms.includes(need), need);
  for (const link of llms.matchAll(/\]\((https?:\/\/[^)]+)\)/g)) assert.ok(link[1].startsWith(SITE_URL) || link[1].startsWith('https://github.com/imaidan808/Paperclip-Capitalist/blob/main/'), link[1]);
  for (const m of llms.matchAll(/blob\/main\/([^)]+)\)/g)) assert.ok(exists(m[1]), 'llms.txt links ' + m[1]);
  for (const f of ['robots.txt', 'sitemap.xml', 'llms.txt']) assert.ok(!/\u2014/.test(read(f)), f + ': no em dash');
  assert.ok(!/zone/i.test(llms) && !/lorem|TODO/i.test(llms));
});

test('every screen has its own title, and the title screen\'s is the game\'s name (js/main.js)', () => {
  const main = read('js/main.js');
  const T = new Function('return ' + main.match(/const TITLES = (\{[^}]+\});/)[1])();
  const screens = [...main.slice(main.indexOf('const screens = {')).matchAll(/^  (\w+)\(\) \{/gm)].map((m) => m[1]);
  assert.deepEqual(screens.sort(), Object.keys(T).sort(), 'a title for every screen, and no title for a screen that is gone');
  assert.equal(new Set(Object.values(T)).size, Object.keys(T).length, 'no two screens share a title');
  for (const [k, v] of Object.entries(T)) assert.ok(v.length >= 5 && !/\bTODO\b|undefined/.test(v), k);
  assert.equal(T.title, 'Paperclip Capitalist');
  assert.match(main, /document\.title = TITLES\[screen\] \+ \(screen === 'title' \? '' : ' \| Paperclip Capitalist'\)/);
  assert.ok(read('index.html').includes('<title>' + T.title), 'the page\'s own title starts with the same name');
});

test('no production source maps and no placeholder text anywhere the site is built from', () => {
  for (const f of [...walkDir(join(ROOT, 'js')).map((f) => 'js/' + f), ...walkDir(join(ROOT, 'css')).map((f) => 'css/' + f)]) {
    const t = read(f);
    assert.ok(!/sourceMappingURL/.test(t), f);
    assert.ok(!f.endsWith('.map'), f);
    assert.ok(!/lorem ipsum/i.test(t), f + ' has lorem ipsum');
  }
  assert.ok(!walkDir(ROOT).some((f) => !f.startsWith('.git/') && !f.includes('node_modules') && f.endsWith('.map')));
  assert.ok(!exists('vite.config.js') && !exists('webpack.config.js') && !exists('rollup.config.js'), 'no bundler: there is no build step');
});

test('the pages and the docs are spelled the American way and use no em dash', () => {
  const BRITISH = /\b(?:colour|favour|behaviour|honour|labour|neighbour|organis(?:e|ed|es|ing|ation)|realis(?:e|ed|es|ing)|recognis(?:e|ed|es|ing)|centre|metre|licence|defence|offence|catalogue|analyse|practise|maths|programme|whilst|amongst|grey|instalment|normalis(?:e|ed|es|ing)|summaris(?:e|ed|es|ing)|prioritis(?:e|ed|es|ing)|minimis(?:e|ed|es|ing)|optimis(?:e|ed|es|ing)|customis(?:e|ed|es|ing)|cancelled|travelled|labelled)\b/i;
  for (const f of ['index.html', '404.html', 'llms.txt', 'README.md', 'docs/FACULTY_KIT.md', 'docs/ARCHITECTURE.md', 'docs/COMPLIANCE.md', 'assets/src/share.html', 'scripts/stage.mjs', 'scripts/preload.mjs']) {
    const t = read(f).replace(/\bGrey-market\b/g, '');
    assert.ok(!BRITISH.test(t), `${f}: ${(t.match(BRITISH) || [])[0]}`);
    assert.ok(!/\u2014/.test(t), `${f}: an em dash`);
  }
  assert.ok(!/\u2014/.test(read('docs/V2_DESIGN.md')) && !/\u2014/.test(read('docs/BALANCE.md')));
});

// ====================================================================================================================================
// 6. The documents
// ====================================================================================================================================

/** The relative links of a markdown file that point at files of this repository. */
const mdLinks = (text) => [...text.matchAll(/\]\(((?!https?:|mailto:|#)[^)\s]+)\)/g)].map((m) => m[1].split('#')[0]).filter(Boolean);

test('every relative link in the README and the docs reaches a file, and every command they name is a real script', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const f of ['README.md', 'docs/FACULTY_KIT.md', 'docs/ARCHITECTURE.md', 'docs/COMPLIANCE.md', 'docs/V2_DESIGN.md']) {
    const text = read(f), dir = posix.dirname(f);
    for (const l of mdLinks(text)) assert.ok(exists(posix.normalize(posix.join(dir, l))), `${f} links ${l}`);
    for (const m of text.matchAll(/`npm run (\w+)/g)) assert.ok(m[1] in pkg.scripts, `${f}: npm run ${m[1]}`);
    for (const m of text.matchAll(/`node ((?:scripts|tests|server)\/[\w.-]+\.mjs)/g)) assert.ok(exists(m[1]), `${f}: node ${m[1]}`);
  }
});

test('the README is the v2 README: what it is, three promises, play, run, test, balance, Pages, layout and privacy', () => {
  const md = read('README.md');
  const heads = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  for (const h of ['What it is', 'Three promises', 'Play', 'Run it', 'Test it', 'The balance harness', 'Put it on GitHub Pages', 'Multiplayer', 'For instructors', 'Project layout', 'Privacy']) assert.ok(heads.includes(h), `a section "${h}": ${heads.join(', ')}`);
  assert.ok(md.startsWith('# Paperclip Capitalist\n'));
  assert.ok(md.includes(SITE_URL), 'the address it is served at');
  for (const cmd of ['npm start', 'npm test', 'npm run balance', 'npm run calibrate', 'npm run tune', 'npm run stage', 'npm run preview', 'npm run preload', 'npm run relay', 'node assets/src/render.mjs']) assert.ok(md.includes(cmd), cmd);
  for (const word of ['Backgrounds', 'Academy', 'Deal Room', 'Quick', 'Assist', 'Codex', 'Quests', 'recovery code', 'modulepreload', 'GitHub Actions', 'localStorage']) assert.ok(md.includes(word), word);
  assert.ok(!/\bv1\b.*profiles|three profiles/i.test(md.split('## Project layout')[0]), 'the README does not teach the old three Profiles');
  // the facts in it are the game's
  assert.equal(Object.keys(PERKS).length, 12); assert.equal(Object.keys(ZONES).length, 16);
  const layout = md.slice(md.indexOf('## Project layout'), md.indexOf('## Privacy'));
  for (const f of ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'llms.txt', 'assets/', 'css/', 'js/', 'server/', 'scripts/', 'tests/', 'docs/', '.github/workflows/pages.yml']) assert.ok(layout.includes(f), `the layout names ${f}`);
  assert.ok(!/\bzones?\b/i.test(md));
  // the 66 pairs of the balance harness are 12 choose 2
  assert.ok(md.includes('66 pairs') && 12 * 11 / 2 === 66);
});

test('the faculty kit walks the v2 flow: Backgrounds, the Academy, the dashboard\'s controls, shocks, the recovery code and the seat grace period, the gradebook and the debrief', () => {
  const md = read('docs/FACULTY_KIT.md');
  for (const h of ['Five-minute setup', 'Backgrounds', 'The Academy', 'The dashboard', 'Shocks', 'Recovery code', 'Grading', 'Reflection rubric', 'The debrief']) assert.ok([...md.matchAll(/^#{1,3} (.+)$/gm)].some((m) => m[1].includes(h)), `a heading with "${h}"`);
  // the pace presets of the dashboard, word for word
  for (const m of read('js/ui/instructor.js').matchAll(/^  \['((?:Demo|One|Four)[^']+)', /gm)) assert.ok(md.includes(m[1]), `the preset "${m[1]}"`);
  for (const control of ['Start simulation', 'Pause', 'Rewind', 'Copy student link', 'Close room', 'Deploy to cohort', 'Transaction friction', 'Compliance audit frequency', 'Synthetic classmates', 'EEI starting-capital floor', 'Algorithmic surprise events', 'Export gradebook CSV']) assert.ok(md.includes(control), control);
  assert.ok(read('js/ui/instructor.js').includes('Export gradebook CSV') || read('js/ui/instructor.js').includes('gradecsv'));
  // the shocks and their days are the engine's
  for (const e of Object.values(EVENTS)) { assert.ok(md.includes(e.name.replace(/^The /, '')) || md.includes(e.short || e.name), e.name); assert.ok(md.includes(`Day ${e.day}`), `Day ${e.day}`); }
  // the recovery code and the seat
  for (const need of ['32 letters and digits', 'Resume as instructor', 'SEAT_GRACE_MS', 'Reopen room', 'first connection']) assert.ok(md.includes(need), need);
  assert.equal(JSON.parse(JSON.stringify({ g: 0 })).g, 0);
  // the grade: weights and the swap limits are the code's
  for (const need of ['30%', '20%', '10%', '40%']) assert.ok(md.includes(need), need);
  assert.ok(md.includes(`${SWAPS.perDay} a day`) && md.includes(`${FMV_BAND * 100}%`));
  assert.ok(md.includes('Demo students count in everyone\'s percentile') && /percentile/i.test(md), 'it says the demo students are in the percentile (they are rows of the roster)');
  assert.match(read('js/session.js'), /rows\.filter\(\(x\) => x\.eei < r\.eei\)\.length/, 'the percentile is over every row of students(), the demo students included');
  for (const need of ['Prompt A', 'Prompt B', 'Prompt C', 'reflection-', 'Download workbook']) assert.ok(md.includes(need), need);
  assert.ok(!/\bzones?\b/i.test(md));
});

test('the architecture notes carry the royalty row, the 155-second swap lock, the published-stock check, the owner token and the staged-site pipeline', () => {
  const md = read('docs/ARCHITECTURE.md');
  assert.equal(LOCK_MS, 155000, 'the lock is 155 seconds');
  assert.ok(md.includes('155 seconds') && md.includes(`${RECALL_WAIT_MS / 1000} seconds`), 'the lock and the recall wait, in seconds');
  // the royalty row says how it is paced and capped, with the code's own numbers
  const row = md.split('\n').find((l) => l.startsWith('| `royalty`'));
  assert.ok(row, 'a royalty row in the protocol table');
  for (const need of ['a day\'s rate', 'never faster than the days go by', 'arrears', 'cap', `${FMV_BAND * 100}%`, 'a tenth', 'twelve messages']) assert.ok(row.includes(need), `the royalty row says "${need}"`);
  assert.ok(/ROYALTY_MSGS|twelve messages a day/.test(read('js/engine.js') + row));
  assert.equal(read('js/engine.js').match(/const ROYALTY_MSGS = (\d+)/)[1], '12'); assert.equal(read('js/engine.js').match(/const ROYALTY_NW = ([\d.]+)/)[1], '0.1');
  // the offer-versus-published-stock check
  for (const need of ['published stock', 'same id, class and condition', '1.5 times', 'a bound and not a proof']) assert.ok(md.includes(need), need);
  assert.match(read('js/session.js'), /\* 1\.5 \+ 5/);
  // the owner token under who is who on the relay
  const who = md.slice(md.indexOf('## Who is who on the relay'), md.indexOf('## Moving to a scalable'));
  for (const need of ['owner token', '`owner`', 'recovery code', 'SEAT_GRACE_MS', 'hash', 'sha256']) assert.ok(who.includes(need), `who is who says "${need}"`);
  assert.match(read('server/relay.mjs'), /createHash\('sha256'\)\.update\(code \+ '\|owner\|' \+ token\)/);
  // the pipeline
  const pipe = md.slice(md.indexOf('## The staged site'));
  assert.ok(pipe.length > 1500, 'a section of its own');
  for (const need of ['scripts/stage.mjs', 'scripts/preload.mjs', 'modulepreload', 'import(`./play/${name}.js`)', 'allowlist', '404.html', 'robots.txt', 'sitemap.xml', 'llms.txt', 'assets/src/', 'npm run preview', '/Paperclip-Capitalist/', 'tests/finish-site.test.mjs', 'js/meta/ids.js']) assert.ok(pipe.includes(need), `the pipeline section says "${need}"`);
  assert.ok(!/\bzones?\b/i.test(md));
});

test('the compliance notes say what the launch adds and what it does not', () => {
  const md = read('docs/COMPLIANCE.md');
  for (const need of ['robots.txt', 'llms.txt', 'No cookies', 'No third-party requests', 'a custom domain']) assert.ok(md.includes(need), need);
  assert.ok(!/\bzones?\b/i.test(md));
});

test('V2_DESIGN.md keeps the contract and adds an "As built" appendix whose numbers are the code\'s', () => {
  const md = read('docs/V2_DESIGN.md');
  const at = md.indexOf('## 15. As built');
  assert.ok(at > 0, 'the appendix is section 15');
  assert.ok(md.slice(0, at).startsWith('# Paperclip Capitalist v2: design contract') && md.includes('## 14. Procedure for parallel authors'), 'the contract above it is untouched');
  const app = md.slice(at);
  assert.ok(app.length > 6000);
  // each of these is a figure the appendix quotes: it must be what the code has
  const fig = (name, v) => assert.ok(app.includes(String(v)), `the appendix quotes ${name} = ${v}`);
  fig('ECON.cycleBase', ECON.cycleBase); fig('ECON.brokenTop', ECON.brokenTop); fig('ECON.brokenFrom', ECON.brokenFrom); fig('ECON.pitchK', ECON.pitchK); fig('ECON.lotSlots', ECON.lotSlots);
  fig('ECON.lotEvery', ECON.lotEvery); fig('ECON.leadEvery', ECON.leadEvery); fig('ECON.urgentK', ECON.urgentK); fig('LEVEL_XP', LEVEL_XP); fig('FMV_BAND', `${FMV_BAND * 100}%`);
  fig('SWAPS.perDay', SWAPS.perDay); fig('SWAPS.appraisal', `${SWAPS.appraisal * 100}%`); fig('LOCK_MS', `${LOCK_MS / 1000} seconds`);
  fig('DEBT.maxDE', DEBT.maxDE); fig('DEBT.callDE', DEBT.callDE); fig('DEBT.fireSale', DEBT.fireSale); fig('SKILL_MAX', SKILL_MAX); fig('ECON.brokenSlope', ECON.brokenSlope); fig('PIPE_RULES.marginBase', PIPE_RULES.marginBase); fig('PIPE_RULES.scaleExp', PIPE_RULES.scaleExp); fig('PIPE_RULES.overheadExp', PIPE_RULES.overheadExp);
  fig('assets', `${Object.keys(ASSETS).length} assets`); fig('buyers', `${Object.keys(BUYERS).length} buyers`); fig('Codex', `${CODEX.length} Codex entries`); fig('required Codex ids', `the ${REQUIRED_CODEX.length} required ids`);
  fig('quests', `${QUESTS.length} quests`); fig('achievements', `${ACHIEVEMENTS.length} achievements`); fig('dailies', `${DAILIES.length} daily templates`); fig('SKILL_XP_DAY', `${read('js/engine.js').match(/const SKILL_XP_DAY = (\d+)/)[1]} XP a kind`);
  for (const k of ['brokenLo', 'brokenSlope', 'brokenTop', 'brokenFrom', 'lotSlots', 'lotEvery', 'leadEvery', 'urgentK', 'pitchK', 'cycleBase']) assert.ok(app.includes(`\`${k}\` ${ECON[k]}`), `the appendix says \`${k}\` ${ECON[k]}`);
  assert.equal(ACADEMY.length, 10); assert.ok(app.includes('`QUICK` is 0.5') && /export const QUICK = 0\.5/.test(read('js/deal.js')));
  assert.ok(app.includes('Rhea Nair') && app.includes('Harborline Capital') && BUYERS.harbourlinePE.name === 'Rhea Nair, Harborline Capital', 'the one id with its first spelling is real (the word itself stays out of the docs: the spelling test reads them)');
  // the draft's buyer-flow trait reads leadBudget now (the stale note in BALANCE.md)
  assert.match(read('js/ui/draft.js'), /m\.leadBudget - 1/);
  assert.match(read('js/play/pitch.js'), /impress the neighbors/);
  // the mods the appendix says the data uses and does not use
  const used = new Set(Object.values(PERKS).flatMap((p) => Object.keys(p.mods)));
  for (const k of ['growthBonus', 'feeMult', 'trendBonus', 'specialtyBonus']) assert.ok(!used.has(k), `${k} is unused`);
  for (const k of ['fineWaive', 'noSpecialty', 'trendBuyers', 'digitalBuyers', 'flopRep', 'probeBonus']) assert.ok(used.has(k), `${k} is used`);
  assert.equal(PERKS.creator.mods.flopRep, 8);
  assert.ok(app.includes('Differences from the contract') || app.includes('differs from it'), 'it says what it is');
  assert.ok(!/\u2014/.test(app));
  for (const row of app.split('\n').filter((l) => /^\| \d/.test(l))) assert.equal(row.split('|').length, 6, 'each table row has a section, what the contract says, what is built and why: ' + row.slice(0, 60));
});

// ====================================================================================================================================
// 7. The staged site, run in headless Chrome
// ====================================================================================================================================

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'; // the path scripts/cdp.mjs launches
const freePort = () => new Promise((res) => { const s = netServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

test('the staged site, served as Pages serves it, boots in Chrome: no console error, no failed request, the title screen, a game, the Academy, and the 404 page', { timeout: 150000 }, async (t) => {
  if (process.env.PC_NO_BROWSER || !existsSync(CHROME)) { t.skip('no Chrome here (the staged site is also checked without a browser above)'); return; }
  const { launch, open } = await import('../scripts/cdp.mjs');
  const dir = join(tmp('pc-run-'), 'site'); stage({ out: dir, lastmod: TODAY });
  const server = servePages(dir), port = await listen(server), base = `http://127.0.0.1:${port}${BASE_PATH}`;
  const b = await launch(await freePort());
  const until = async (p, expr, what, ms = 20000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await p.eval(expr); if (last) return last; } catch { /* the page is between screens */ } await p.sleep(100); } assert.fail(`timed out waiting for ${what}`); };
  const click = (p, re) => p.eval(`(()=>{ const b=[...document.querySelectorAll('button')].find(b=>${re}.test(b.textContent.trim())); if(!b) return false; b.click(); return true; })()`);
  try {
    // 1. the title screen, from a fresh browser profile
    const p = await open(b, base + '?slot=run1', { w: 1280, h: 800 });
    await until(p, `!!document.querySelector('#app h1')`, 'the title screen');
    assert.equal(await p.eval('document.title'), 'Paperclip Capitalist');
    assert.match(await p.eval(`document.querySelector('#app h1').textContent`), /PAPERCLIP\s*CAPITALIST/);
    const seen = await p.eval(`JSON.stringify({ lang: document.documentElement.lang, ld: document.querySelectorAll('script[type="application/ld+json"]').length, preloads: document.querySelectorAll('link[rel=modulepreload]').length, canon: document.querySelector('link[rel=canonical]').href })`);
    assert.deepEqual(JSON.parse(seen), { lang: 'en', ld: 1, preloads: walk().modules.length, canon: SITE_URL });
    // 2. the Academy runs: its first lesson opens in the real interface with the coach beside it
    await until(p, `(() => { const b=[...document.querySelectorAll('button')].find(b=>/Academy/.test(b.textContent)); b && b.click(); return !!b; })()`, 'the Academy button');
    await until(p, `document.title.startsWith('Academy')`, 'the Academy screen');
    assert.match(await p.eval(`document.querySelector('#app').innerText`), /LESSON 1 OF 10/);
    await until(p, `(() => { const b=[...document.querySelectorAll('button')].find(b=>/Start the lesson/.test(b.textContent)); b && b.click(); return !!b; })()`, 'Start the lesson');
    await until(p, `!!document.querySelector('.ac-coach') && !!document.querySelector('canvas')`, 'the lesson\'s coach card over the world');
    // 3. a game starts: the draft, two Backgrounds, Begin, the world
    await p.eval(`localStorage.setItem('pc.academyDone.run1', 'true')`);
    await p.eval(`location.href = ${JSON.stringify(base + '?slot=run1')}`);
    await until(p, `!!document.querySelector('#app h1') && document.title === 'Paperclip Capitalist'`, 'the title screen again');
    assert.ok(await click(p, '/Play solo/i'));
    await until(p, `document.title === 'Draft your build | Paperclip Capitalist'`, 'the draft');
    for (const id of ['trades', 'pro']) await until(p, `(() => { const c=[...document.querySelectorAll('input[type=checkbox]')].find(c=>c.value==='${id}'); if(!c) return false; if(!c.checked) c.click(); return c.checked; })()`, `the ${id} Background`);
    await until(p, `(() => { const b=[...document.querySelectorAll('button')].find(b=>/^Begin/i.test(b.textContent.trim()) && !b.disabled); b && b.click(); return !!b; })()`, 'Begin');
    await until(p, `document.title === 'The world | Paperclip Capitalist' && !!document.querySelector('canvas') && document.querySelector('[data-anchor="dock-stock"]')`, 'the world and its dock', 30000);
    await p.sleep(1500);
    assert.equal(await p.eval(`document.querySelectorAll('[data-anchor^="dock-"]').length > 0`), true);
    // 3b. the instructor's side: a new room shows its recovery code once (32 characters in groups of four, as the faculty kit says), then the dashboard with the controls the kit names
    const pi = await open(b, base + '?slot=run3', { w: 1280, h: 800 });
    await until(pi, `!!document.querySelector('#app h1')`, 'the title screen for the instructor');
    assert.ok(await click(pi, '/^Create a room$/'));
    await until(pi, `document.title === 'Instructor dashboard | Paperclip Capitalist' && document.querySelector('dialog#dlg').open && !!document.querySelector('#rk')`, 'the recovery code dialog');
    assert.match(await pi.eval(`document.querySelector('#rk').textContent`), /^([0-9a-f]{4}-){7}[0-9a-f]{4}$/);
    await pi.eval(`document.querySelector('dialog#dlg [data-close]').click()`);
    const kit = read('docs/FACULTY_KIT.md');
    for (const label of ['Start simulation', 'Copy student link', 'Close room', 'Deploy to cohort', 'Export gradebook CSV', 'Rewind 1 day']) {
      assert.ok(await until(pi, `[...document.querySelectorAll('#app button')].some(b => b.textContent.trim() === ${JSON.stringify(label)})`, `the ${label} button`), label);
      assert.ok(kit.includes(label), `the faculty kit names ${label}`);
    }
    const piLogs = pi.logs.slice();
    await pi.close();
    // 4. a path that is not a file is the 404 page, with the status 404, and its link goes home
    const nf = await p.eval(`fetch(${JSON.stringify(base + 'no/such/page')}).then(async r => ({ status: r.status, text: await r.text() }))`);
    assert.equal(nf.status, 404); assert.match(nf.text, /That road does not lead to a district/);
    const p2 = await open(b, base + 'definitely/not/here', { w: 900, h: 700 });
    await until(p2, `document.title.startsWith('Page not found')`, 'the 404 page');
    assert.equal(await p2.eval(`document.querySelector('h1').textContent`), '404');
    assert.equal(await p2.eval(`document.querySelector('a.btn').href`), SITE_URL);
    assert.equal(await p2.eval(`getComputedStyle(document.body).backgroundColor`), 'rgb(13, 17, 23)');
    // 5. nothing failed: no console error, no exception, no request answered with an error except the one 404 asked for on purpose
    // (a browser extension that the machine installs into every profile can throw inside the page's context: a stack that is all chrome-extension:// is not the site's)
    const bad = p.logs.concat(p2.logs, piLogs).filter((l) => /^(error|warning|EXC)/.test(l) && !/Failed to load resource: the server responded with a status of 404/.test(l) && !/chrome-extension:\/\//.test(l));
    assert.deepEqual(bad, [], 'no console error');
    const failed = server.hits.filter((h) => h.status >= 400 && !/no\/such\/page|definitely\/not\/here/.test(h.url));
    assert.deepEqual(failed, [], 'no failed request');
    const asked = new Set(server.hits.filter((h) => h.status === 200).map((h) => h.url.split('?')[0].slice(BASE_PATH.length)));
    for (const m of walk().modules) assert.ok(asked.has(m), `the page asked for ${m}`);
    for (const f of stylesheetsOf(read('index.html'))) assert.ok(asked.has(f), `the page asked for ${f}`);
    assert.ok(![...asked].some((u) => /^(tests|docs|server|scripts|dev)\//.test(u)), 'nothing outside the staged site was asked for');
    await p.close(); await p2.close();
  } finally { b.close(); server.close(); }
});
