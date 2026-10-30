// node scripts/stage.mjs [out] [--lastmod YYYY-MM-DD] [--verify] [--serve [--port N] [--latency MS]]
// Builds the exact artifact GitHub Pages serves, into a folder (default: paperclip-capitalist-site in the system's temp folder; the workflow passes _site).
//
//   index.html     the source page with one <link rel="modulepreload"> per module added to its head (scripts/preload.mjs); the source page is not touched
//   404.html, robots.txt, sitemap.xml, llms.txt
//   assets/        the share image and the icons (assets/src/, the scene the share image is drawn from, stays out)
//   css/           the sheets index.html links, and nothing else
//   js/            the modules the app imports from js/main.js (statically, or with import()), and nothing else
//
// Never staged: tests/, server/, docs/, scripts/, dev/, package files, .git, .github, any dotfile. The list is an allowlist, so a new folder is not published by accident.
// --verify re-reads a staged folder and checks it hangs together (every reference resolves, no module is missing or left over, no source map).
// --serve stages and serves the folder the way GitHub Pages does (under /Paperclip-Capitalist/, 404.html for a path that is not a file, gzip, a ten-minute cache),
// so a path that only works at the root of a server fails here before it fails online. --latency adds a round trip to every answer, to feel what the host would.
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve, sep, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { ENTRY, ROOT, existsExactly, preloadLines, lazyManifest, walk } from './preload.mjs';

// The address of the published site, spelled exactly as GitHub spells the repository. A Pages address is case-sensitive: https://imaidan808.github.io/Paperclip-Capitalist/ is the site
// and the same address in lower case is a 404 on the real host. This line is the one source of the spelling: BASE_PATH (where the stand-in below mounts the site), REPO_NAME and
// REPO_URL are read from it, and every other place that writes the address (the pages, robots.txt, sitemap.xml, llms.txt, the docs) is held to it by `verify` and the tests.
export const SITE_URL = 'https://imaidan808.github.io/Paperclip-Capitalist/';
export const BASE_PATH = new URL(SITE_URL).pathname;           // '/Paperclip-Capitalist/', the folder the site is mounted at (the stand-in below serves nothing outside it)
export const REPO_NAME = BASE_PATH.slice(1, -1);               // 'Paperclip-Capitalist'
export const REPO_URL = `https://github.com/imaidan808/${REPO_NAME}/`;
export const PAGES = ['index.html', '404.html'];
export const TOP_FILES = ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'llms.txt'];
export const TOP_DIRS = ['assets', 'css', 'js'];
export const DEFAULT_OUT = join(tmpdir(), 'paperclip-capitalist-site');

const SOURCE_DIRS = ['js', 'css', 'assets', 'docs', 'tests', 'scripts', 'server', 'dev', 'node_modules'];
const MARK = '<!-- modulepreload: added by scripts/stage.mjs, not in the source page -->';
const read = (root, p) => readFileSync(join(root, p), 'utf8');

/** The local files a page links to: stylesheets, scripts, icons and images by href or src. Absolute URLs under SITE_URL count as local; other absolute URLs are returned apart. */
export function pageRefs(html) {
  const local = new Set(), remote = new Set();
  const add = (u) => {
    if (!u || u.startsWith('#') || /^(data|mailto|tel|javascript):/i.test(u)) return;
    if (u.startsWith(SITE_URL)) { const p = u.slice(SITE_URL.length).split(/[?#]/)[0]; if (p) local.add(p); return; }
    if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(u)) { remote.add(u); return; }
    local.add(u.split(/[?#]/)[0]);
  };
  for (const m of html.matchAll(/<(link|script|img|source|iframe|video|audio)\b[^>]*>/gi)) {
    const tag = m[0];
    // a <link> is a request only for these relations; rel="canonical" and rel="alternate" are addresses, not fetches
    if (/^<link\b/i.test(tag) && !/\brel\s*=\s*["']?(stylesheet|icon|apple-touch-icon|modulepreload|preload|manifest|shortcut icon|mask-icon)\b/i.test(tag)) continue;
    for (const a of tag.matchAll(/\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) add(a[1] ?? a[2]);
  }
  for (const m of html.matchAll(/<meta\b[^>]*\b(?:property|name)\s*=\s*["'](?:og:image|twitter:image)["'][^>]*>/gi)) { const c = m[0].match(/\bcontent\s*=\s*"([^"]*)"/i); if (c) add(c[1]); }
  return { local: [...local], remote: [...remote] };
}

const AS_A_PATH = new RegExp(`(?<=/)${REPO_NAME}(?![\\w-])`, 'gi');   // the name as the last step of an address or path; inside a longer word (an npm package, a channel name) it is not an address
const A_PAGES_ADDRESS = /https?:\/\/[a-z0-9-]+\.github\.io[^\s"'<>)`\\]*/gi;
const THE_SITE_IN_ANY_CASE = new RegExp(`^${SITE_URL.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'i');   // the site's own address, its last slash or not, in any case: its case is judged above
/**
 * What `text` gets wrong about the site's address, as a list of sentences (empty when it is right): the repository named in a path (a Pages address, a GitHub address, a local mount)
 * in any spelling but GitHub's own, and any github.io address that is not under SITE_URL. The name inside a longer word (the npm package, a broadcast channel) is not an address and is not read.
 */
export function addressProblems(text) {
  const bad = [];
  for (const m of text.matchAll(AS_A_PATH)) {
    if (m[0] === REPO_NAME) continue;
    const written = text.slice(Math.max(0, m.index - 80), m.index).match(/[^\s"'<>(`]*$/)[0] + m[0];   // the address as far back as it goes: https://host/name
    bad.push(`writes "${written}" but GitHub Pages is case-sensitive and the repository is ${REPO_NAME}`);
  }
  // an address on the host that is not the site's at all (another repository, the bare host); one that is the site's in a wrong case is said above, once
  for (const m of text.matchAll(A_PAGES_ADDRESS)) if (!THE_SITE_IN_ANY_CASE.test(m[0])) bad.push(`writes ${m[0]}, which is not under ${SITE_URL}`);
  return bad;
}

/** The stylesheets index.html links, in order, as paths relative to the project. */
export function stylesheetsOf(html) {
  return [...html.matchAll(/<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/gi)].map((m) => (m[0].match(/\bhref\s*=\s*"([^"]*)"/i) || [])[1]).filter(Boolean);
}

/**
 * index.html with the preload lines before </head> and, when some modules are only loaded later (`lazy`, a JSON list of paths), the list in a data block that js/main.js reads once the page is idle. Throws if the
 * page already carries some (a staged page is never staged again) or has no head to put them in.
 */
export function injectPreload(html, lines, lazy = '') {
  if (html.includes(MARK) || /rel\s*=\s*["']modulepreload["']/i.test(html)) throw new Error('index.html already has modulepreload links: stage the source page, not a staged one');
  const at = html.indexOf('</head>');
  if (at < 0) throw new Error('index.html has no </head>');
  const list = lazy && lazy !== '[]' ? `\n  <script type="application/json" id="pc-lazy">${lazy}</script>` : '';
  return `${html.slice(0, at)}  ${MARK}\n${lines}${list}\n${html.slice(at)}`;
}

/** sitemap.xml with every <lastmod> set to `day` (YYYY-MM-DD). */
export function withLastmod(xml, day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`--lastmod wants YYYY-MM-DD, got "${day}"`);
  return xml.replace(/<lastmod>[^<]*<\/lastmod>/g, `<lastmod>${day}</lastmod>`);
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f), st = statSync(p);
    if (st.isDirectory()) out.push(...listFiles(p, base)); else out.push(relative(base, p).split(sep).join('/'));
  }
  return out;
}

/** Stage the site. Returns { out, files: [relative path], graph, preload }. */
export function stage({ root = ROOT, out = DEFAULT_OUT, lastmod } = {}) {
  out = resolve(out); root = resolve(root);
  // out is emptied first, so it must be nothing but a folder this script made (or a new one): never the project, a folder of it, a folder that holds it, or somebody's other files
  const inside = relative(root, out);
  if (!inside || root.startsWith(out + sep) || out === dirname(out)) throw new Error(`Refusing to stage into ${out}: it is the project or holds it`);
  if (!inside.startsWith('..') && (SOURCE_DIRS.includes(inside.split(sep)[0]) || inside.split(sep)[0].startsWith('.'))) throw new Error(`Refusing to stage into ${out}: it is a folder of the project`);
  if (existsSync(out)) {
    const made = existsSync(join(out, 'index.html')) && readFileSync(join(out, 'index.html'), 'utf8').includes(MARK);
    if (!made && readdirSync(out).length) throw new Error(`Refusing to stage into ${out}: it is not empty and is not a folder this script staged`);
  }

  const graph = walk(root, ENTRY);
  const html = read(root, 'index.html');
  const sheets = stylesheetsOf(html);
  const problems = [];
  for (const s of sheets) { if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(s) || s.startsWith('/')) problems.push(`index.html links a stylesheet that is not in the project: ${s}`); else if (!existsSync(join(root, s))) problems.push(`index.html links ${s}, which does not exist`); }
  for (const f of TOP_FILES) if (!existsSync(join(root, f))) problems.push(`${f} is missing`);
  if (problems.length) throw new Error(problems.join('\n'));

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const put = (p, text) => { mkdirSync(dirname(join(out, p)), { recursive: true }); writeFileSync(join(out, p), text); };
  const copy = (p) => { mkdirSync(dirname(join(out, p)), { recursive: true }); cpSync(join(root, p), join(out, p)); };

  const preload = preloadLines(graph);
  put('index.html', injectPreload(html, preload, lazyManifest(graph)));
  for (const f of ['404.html', 'robots.txt', 'llms.txt']) copy(f);
  put('sitemap.xml', lastmod ? withLastmod(read(root, 'sitemap.xml'), lastmod) : read(root, 'sitemap.xml'));
  for (const s of new Set(sheets)) {
    copy(s);
    // a sheet may name files of its own (fonts, images); they go along if they are in the project, and a missing one is an error here and not a 404 online
    for (const m of read(root, s).matchAll(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g)) {
      const u = m[2].trim();
      if (/^(data:|#)/i.test(u)) continue;
      if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(u)) throw new Error(`${s} fetches ${u}: the site makes no request outside itself`);
      const p = posix.normalize(posix.join(posix.dirname(s), u.split(/[?#]/)[0]));
      if (!existsSync(join(root, p))) throw new Error(`${s} names ${u}, which does not exist (${p})`);
      copy(p);
    }
    if (/@import/.test(read(root, s).replace(/\/\*[\s\S]*?\*\//g, ''))) throw new Error(`${s} uses @import, which is fetched only after the sheet that holds it: link the sheet in index.html instead`);
  }
  for (const m of graph.modules) copy(m);
  if (existsSync(join(root, 'assets'))) {
    for (const f of listFiles(join(root, 'assets'))) {
      if (f.startsWith('src/') || f.split('/').some((seg) => seg.startsWith('.')) || f.endsWith('.map')) continue; // the scene the share image is drawn from is a source, not a page
      copy('assets/' + f);
    }
  }
  const files = listFiles(out);
  return { out, files, graph, preload };
}

const TEXT_FILES = /\.(html|css|m?js|json|svg|txt|xml|webmanifest)$/;
const PNG_SIG = '89504e470d0a1a0a';
/** Width and height of a PNG, from its header. */
export function pngSize(buf) {
  if (buf.subarray(0, 8).toString('hex') !== PNG_SIG) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** Check that a staged folder hangs together. Returns the list of problems (empty when it is sound). */
export function verify(out) {
  out = resolve(out);
  const bad = [];
  if (!existsSync(out)) return [`${out} does not exist`];
  const files = listFiles(out);
  const top = readdirSync(out);
  for (const t of top) { if (!TOP_FILES.includes(t) && !TOP_DIRS.includes(t)) bad.push(`${t} is not part of the site`); }
  for (const f of TOP_FILES) if (!top.includes(f)) bad.push(`${f} is missing`);
  for (const f of files) {
    if (f.split('/').some((s) => s.startsWith('.'))) bad.push(`${f}: a dotfile`);
    if (f.endsWith('.map')) bad.push(`${f}: a source map`);
    if (/\.(js|css|html)$/.test(f) && /sourceMappingURL/.test(readFileSync(join(out, f), 'utf8'))) bad.push(`${f}: names a source map`);
  }
  // the address, in every file that is text: the one spelling GitHub Pages answers to (a lower-case leftover is a 404 online and nowhere else)
  for (const f of files) if (TEXT_FILES.test(f)) for (const p of addressProblems(readFileSync(join(out, f), 'utf8'))) bad.push(`${f}: ${p}`);
  // every page: its local references exist, and it fetches nothing from another host
  for (const page of PAGES) {
    if (!files.includes(page)) continue;
    const html = readFileSync(join(out, page), 'utf8');
    const { local, remote } = pageRefs(html);
    for (const r of remote) bad.push(`${page}: asks another host for ${r}`);
    for (const r of local) if (page === 'index.html' && !files.includes(posix.normalize(r))) bad.push(`index.html: ${r} is not in the site`);
  }
  // the module graph of the staged tree is the js/ folder, exactly
  if (files.includes(ENTRY)) {
    let g = null;
    try { g = walk(out, ENTRY); } catch (e) {
      // the walk lists every import that leads nowhere; here that means a module the site needs and does not have
      for (const line of String(e.message).split('\n').slice(1)) { const m = line.match(/is not a file \((.+)\)$/); const msg = m ? `${m[1]}: imported but not staged` : line.trim(); if (!bad.includes(msg)) bad.push(msg); }
    }
    if (g) {
      const inJs = files.filter((f) => f.startsWith('js/'));
      for (const m of g.modules) if (!files.includes(m)) bad.push(`${m}: imported but not staged`);
      for (const f of inJs) if (!g.modules.includes(f)) bad.push(`${f}: staged but nothing imports it`);
      const html = existsSync(join(out, 'index.html')) ? readFileSync(join(out, 'index.html'), 'utf8') : '';
      const pre = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]);
      if (pre.join('\n') !== g.static.join('\n')) bad.push('index.html: the modulepreload lines are not the static module graph of js/ (what the first screen needs)');
      const lazy = (html.match(/<script type="application\/json" id="pc-lazy">([^<]*)<\/script>/) || [])[1] || '[]';
      if (lazy !== lazyManifest(g)) bad.push('index.html: the list of modules loaded later (pc-lazy) is not the modules only import() reaches');
    }
  } else bad.push(`${ENTRY} is missing`);
  // the css folder is the sheets index.html links
  if (files.includes('index.html')) {
    const sheets = stylesheetsOf(readFileSync(join(out, 'index.html'), 'utf8'));
    for (const f of files.filter((f) => f.startsWith('css/'))) if (!sheets.includes(f)) bad.push(`${f}: staged but index.html does not link it`);
    for (const s of sheets) if (!files.includes(s)) bad.push(`${s}: linked but not staged`);
  }
  const share = join(out, 'assets/share.png');
  if (existsSync(share)) { const sz = pngSize(readFileSync(share)); if (!sz || sz.w !== 1200 || sz.h !== 630) bad.push('assets/share.png is not a 1200 x 630 PNG'); }
  return bad;
}

// ---------------------------------------------------------------------------------------------------------------- the Pages mimic
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const GZIP = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt', '.xml', '.webmanifest']);
const GENERIC_404 = '<!doctype html><meta charset="utf-8"><title>Site not found</title><h1>404</h1><p>There isn\'t a GitHub Pages site here.</p>';

/**
 * A static server that answers the way GitHub Pages does for a project site. Returns the http.Server (not yet listening) with `server.hits`, an array of
 * { url, status, bytes, encoded } for every request (bytes = what was sent, encoded = whether it was gzip), for a test or a measurement to read.
 */
export function servePages(dir, { base = BASE_PATH, latency = 0, gzip = true } = {}) {
  dir = resolve(dir);
  const hits = [], zipped = new Map();
  const send = (req, res, status, type, body, extra = {}) => {
    const ext = extname(extra.name || '');
    let data = body, enc = false;
    if (gzip && GZIP.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && body.length > 150) {
      const key = extra.name + ':' + body.length;
      if (!zipped.has(key)) zipped.set(key, gzipSync(body, { level: 6 }));
      data = zipped.get(key); enc = true;
    }
    const headers = { 'content-type': type, 'content-length': data.length, 'cache-control': 'max-age=600', 'access-control-allow-origin': '*', vary: 'Accept-Encoding', ...(enc ? { 'content-encoding': 'gzip' } : {}), ...(extra.location ? { location: extra.location } : {}) };
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : data);
    hits.push({ url: req.url, status, bytes: data.length, encoded: enc });
  };
  const server = createServer((req, res) => {
    const go = () => {
      try {
        if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }); res.end(); return; }
        let path;
        try { path = decodeURIComponent(req.url.split(/[?#]/, 1)[0]); } catch { res.writeHead(400); res.end(); return; }
        if (path.includes('\0') || path.includes('\\')) { res.writeHead(400); res.end(); return; }
        const notFound = () => {
          const f = join(dir, '404.html');
          if (path.startsWith(base) && existsSync(f)) send(req, res, 404, TYPES['.html'], readFileSync(f), { name: '404.html' });
          else send(req, res, 404, TYPES['.html'], Buffer.from(GENERIC_404), { name: '404.html' });
        };
        if (path === base.slice(0, -1)) { send(req, res, 301, TYPES['.html'], Buffer.alloc(0), { location: base, name: 'redirect' }); return; }
        if (!path.startsWith(base)) { notFound(); return; }
        const parts = path.slice(base.length).split('/').filter((p) => p !== '');
        if (parts.some((p) => p === '..' || p === '.')) { notFound(); return; }
        let file = join(dir, ...parts);
        if (file !== dir && !file.startsWith(dir + sep)) { notFound(); return; }
        if (!existsExactly(dir, parts)) { notFound(); return; } // the host's disk tells JS/ from js/; this one may not (macOS), and a path that only works there must fail here
        let st = null;
        try { st = statSync(file); } catch { /* not there */ }
        if (st?.isDirectory()) {
          if (!path.endsWith('/')) { send(req, res, 301, TYPES['.html'], Buffer.alloc(0), { location: path + '/', name: 'redirect' }); return; }
          file = join(file, 'index.html');
          try { st = existsExactly(dir, [...parts, 'index.html']) ? statSync(file) : null; } catch { st = null; }
        } else if (st?.isFile() && path.endsWith('/')) st = null;
        if (!st?.isFile()) { notFound(); return; }
        const ext = extname(file);
        send(req, res, 200, TYPES[ext] || 'application/octet-stream', readFileSync(file), { name: relative(dir, file) });
      } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
    };
    latency ? setTimeout(go, latency) : go();
  });
  server.hits = hits;
  return server;
}

// ---------------------------------------------------------------------------------------------------------------- command line
const isMain = () => { try { return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const args = process.argv.slice(2), flag = (n) => { const i = args.indexOf(n); return i < 0 ? null : (args.splice(i, 1), true); }, opt = (n) => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v ?? null; };
  const lastmod = opt('--lastmod'), port = opt('--port'), latency = opt('--latency'), verifyOnly = flag('--verify'), serve = flag('--serve');
  const out = args[0] ? resolve(args[0]) : DEFAULT_OUT;
  try {
    if (!verifyOnly) {
      const r = stage({ out, lastmod: lastmod || undefined });
      console.log(`Staged ${r.files.length} files (${r.graph.modules.length} modules, ${r.graph.static.length} of them needed before the first screen) into ${r.out}`);
    }
    const bad = verify(out);
    if (bad.length) { console.error('The staged site has problems:\n  ' + bad.join('\n  ')); process.exit(1); }
    console.log('The staged site is sound.');
    if (serve) {
      const server = servePages(out, { latency: +latency || 0 });
      server.listen(port != null ? +port : 8081, '127.0.0.1', () => console.log(`Serving it as GitHub Pages would: http://localhost:${server.address().port}${BASE_PATH}`));
    }
  } catch (e) { console.error(e.message); process.exit(1); }
}
