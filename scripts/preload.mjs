// node scripts/preload.mjs [--json]
// Walks the import graph of the app from js/main.js and prints one <link rel="modulepreload"> line per module.
//
// Why: a browser can only discover a module's imports after it has fetched and parsed that module, so a tree of ES modules loads one depth at a time
// (main.js, then what it imports, then what those import...). Naming every module in the page's head lets the browser fetch them all at once.
// scripts/stage.mjs puts these lines into the STAGED index.html, never the source one, so `npm start` and the tests see the plain page.
//
// No bundler and no parser dependency: a small scanner reads the code the way JavaScript does (comments, strings, templates and regular expressions are skipped),
// and finds `import ... from 'x'`, `import 'x'`, `export ... from 'x'` and `import('x')`. A dynamic import whose argument is a template with a hole, such as
// import(`./play/${name}.js`), is read as a pattern (`./play/*.js`) and every file in that folder that fits it is part of the graph, because any of them may be asked for.
// An import that cannot be resolved to a file, or a dynamic import the scanner cannot read, is an error: a staged site must never miss a module.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, sep, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
export const ENTRY = 'js/main.js';

const ID_START = /[A-Za-z_$]/, ID_PART = /[A-Za-z0-9_$]/;
// after these a slash starts a regular expression, not a division
const REGEX_AFTER = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', '']);
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do', 'instanceof', 'yield', 'await']);

/**
 * What a module imports, read from its source. Pure.
 * Returns { statics: [specifier], dynamics: [specifier], patterns: [template with ${} holes], unreadable: [text] }.
 */
export function scanImports(src) {
  const out = { statics: [], dynamics: [], patterns: [], unreadable: [] };
  const n = src.length;
  let i = 0, prev = '', prevWord = '';
  const skipSpace = (k) => { while (k < n) { const c = src[k]; if (c === ' ' || c === '\t' || c === '\n' || c === '\r') k++; else if (c === '/' && src[k + 1] === '/') { while (k < n && src[k] !== '\n') k++; } else if (c === '/' && src[k + 1] === '*') { const e = src.indexOf('*/', k + 2); k = e < 0 ? n : e + 2; } else break; } return k; };
  /** The string literal that starts at k (a quote): { value, end } with the usual escapes of a module specifier read. */
  const readString = (k) => { const q = src[k]; let v = '', j = k + 1; while (j < n && src[j] !== q) { if (src[j] === '\\') { v += src[j + 1]; j += 2; } else v += src[j++]; } return { value: v, end: j + 1 }; };
  /** A template literal's raw text from the backtick at k to its closing backtick, and whether it has a ${ } hole. Holes may nest strings and templates. */
  const readTemplate = (k) => { let j = k + 1, raw = '', hole = false; while (j < n && src[j] !== '`') { if (src[j] === '\\') { raw += src[j] + (src[j + 1] || ''); j += 2; } else if (src[j] === '$' && src[j + 1] === '{') { hole = true; raw += '${}'; j = skipCode(j + 2, true); } else raw += src[j++]; } return { raw, hole, end: j + 1 }; };
  /** Skip code up to the `}` that closes a hole (inBrace) or to the end of the template/string it is in; returns the index after it. */
  const skipCode = (k, inBrace) => {
    let depth = 0, j = k, p = '';
    while (j < n) {
      const c = src[j];
      if (c === '\'' || c === '"') { j = readString(j).end; p = 'x'; continue; }
      if (c === '`') { j = readTemplate(j).end; p = 'x'; continue; }
      if (c === '/' && src[j + 1] === '/') { while (j < n && src[j] !== '\n') j++; continue; }
      if (c === '/' && src[j + 1] === '*') { const e = src.indexOf('*/', j + 2); j = e < 0 ? n : e + 2; continue; }
      if (c === '/' && REGEX_AFTER.has(p)) { j = skipRegex(j); p = 'x'; continue; }
      if (c === '{') depth++;
      if (c === '}') { if (inBrace && depth === 0) return j + 1; depth--; }
      if (!/\s/.test(c)) p = c;
      j++;
    }
    return j;
  };
  const skipRegex = (k) => { let j = k + 1, cls = false; while (j < n) { const c = src[j]; if (c === '\\') { j += 2; continue; } if (c === '[') cls = true; else if (c === ']') cls = false; else if (c === '/' && !cls) break; else if (c === '\n') break; j++; } j++; while (j < n && ID_PART.test(src[j])) j++; return j; };

  while (i < n) {
    const c = src[i];
    if (c === '\'' || c === '"') { i = readString(i).end; prev = 'x'; prevWord = ''; continue; }
    if (c === '`') { i = readTemplate(i).end; prev = 'x'; prevWord = ''; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '/') {
      if (REGEX_AFTER.has(prev) || REGEX_KEYWORDS.has(prevWord)) { i = skipRegex(i); prev = 'x'; prevWord = ''; continue; }
      prev = c; prevWord = ''; i++; continue;
    }
    if (ID_START.test(c)) {
      let j = i + 1; while (j < n && ID_PART.test(src[j])) j++;
      const word = src.slice(i, j), before = src[i - 1];
      if (before !== '.' && (word === 'import' || word === 'export')) {
        const k = skipSpace(j), nx = src[k];
        if (word === 'import' && nx === '(') {
          const a = skipSpace(k + 1), q = src[a];
          if (q === '\'' || q === '"') { const s = readString(a); const after = src[skipSpace(s.end)]; if (after === ')' || after === ',') out.dynamics.push(s.value); else out.unreadable.push(src.slice(i, a + 40).split('\n')[0]); }
          else if (q === '`') { const t = readTemplate(a); if (t.hole) out.patterns.push(t.raw); else out.dynamics.push(t.raw); }
          else out.unreadable.push(src.slice(i, a + 40).split('\n')[0]);
        } else if (word === 'import' && nx === '.') { /* import.meta */ }
        else if (word === 'import' && (nx === '\'' || nx === '"')) out.statics.push(readString(k).value);
        else if (word === 'import' && (nx === '{' || nx === '*' || ID_START.test(nx || ''))) {
          // import a, { b } from 'x' / import * as a from 'x': the first string literal after the keyword is the specifier
          let a = k; while (a < n && src[a] !== '\'' && src[a] !== '"' && src[a] !== ';') a++;
          if (src[a] === '\'' || src[a] === '"') out.statics.push(readString(a).value);
        } else if (word === 'export' && (nx === '*' || nx === '{')) {
          let a = k;
          if (nx === '{') { while (a < n && src[a] !== '}') a++; a++; } else { a++; a = skipSpace(a); if (src.startsWith('as', a) && !ID_PART.test(src[a + 2] || '')) { a += 2; a = skipSpace(a); while (a < n && ID_PART.test(src[a])) a++; } }
          a = skipSpace(a);
          if (src.startsWith('from', a) && !ID_PART.test(src[a + 4] || '')) { a = skipSpace(a + 4); if (src[a] === '\'' || src[a] === '"') out.statics.push(readString(a).value); }
        }
      }
      prev = 'x'; prevWord = word; i = j; continue;
    }
    if (!/\s/.test(c)) { prev = c; prevWord = ''; }
    i++;
  }
  return out;
}

const isRelative = (s) => s.startsWith('./') || s.startsWith('../');

/**
 * Does `rel` (posix, relative to `root`, as a list of steps or a string) name something on the disk with every step spelled exactly as the disk spells it? `statSync` alone answers by the disk's own
 * rules, and a disk that does not tell upper case from lower (macOS, Windows) finds js/main.js under JS/main.js, where GitHub Pages, on Linux, finds nothing: a spelling slip would pass here and 404 there.
 * Each step is looked up in its folder's own listing, so the answer is the host's.
 */
export function existsExactly(root, rel) {
  let at = root;
  for (const part of Array.isArray(rel) ? rel : String(rel).split('/')) {
    if (part === '' || part === '.') continue;
    let names;
    try { names = readdirSync(at); } catch { return false; }
    if (!names.includes(part)) return false;
    at = join(at, part);
  }
  return true;
}

/** A pattern like './play/${}.js' as a RegExp over the file name in its folder, or null when the hole is not confined to one path segment. */
function patternParts(pattern) {
  const slash = pattern.lastIndexOf('/');
  const dir = pattern.slice(0, slash + 1), file = pattern.slice(slash + 1);
  if (dir.includes('${}')) return null;
  const re = new RegExp('^' + file.split('${}').map((p) => p.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')).join('[^/]+') + '$');
  return { dir, re };
}

/**
 * The whole graph from an entry module. Paths are posix-style and relative to `root` ('js/main.js').
 * Returns { modules, static, dynamic, edges }: `static` is every module the entry reaches through static imports alone (the browser needs all of them before the entry
 * can run), in breadth-first order; `dynamic` is what only an import() brings in (also breadth first); `modules` is both, static first; `edges[path]` is { statics, dynamics }.
 * Throws an Error that lists every problem (a missing file, a bare specifier, an import the scanner cannot read, a pattern that matches nothing).
 */
export function walk(root = ROOT, entry = ENTRY) {
  const problems = [], edges = {};
  const exists = (p) => { try { return statSync(join(root, p)).isFile() && existsExactly(root, p); } catch { return false; } };
  const resolveSpec = (from, spec) => {
    if (!isRelative(spec)) { problems.push(`${from}: "${spec}" is not a relative path (a browser cannot resolve it)`); return null; }
    const p = posix.normalize(posix.join(posix.dirname(from), spec));
    if (p.startsWith('..') || p.startsWith('/')) { problems.push(`${from}: "${spec}" leaves the project`); return null; }
    if (!exists(p)) { problems.push(`${from}: "${spec}" is not a file (${p})`); return null; }
    return p;
  };
  const read = (file) => {
    const { statics, dynamics, patterns, unreadable } = scanImports(readFileSync(join(root, file), 'utf8'));
    for (const u of unreadable) problems.push(`${file}: a dynamic import the scanner cannot read: ${u}`);
    const e = { statics: [], dynamics: [] };
    for (const s of statics) { const p = resolveSpec(file, s); if (p && !e.statics.includes(p)) e.statics.push(p); }
    for (const s of dynamics) { const p = resolveSpec(file, s); if (p && !e.dynamics.includes(p)) e.dynamics.push(p); }
    for (const pat of patterns) {
      const parts = patternParts(pat);
      if (!parts || !isRelative(parts.dir)) { problems.push(`${file}: the dynamic import \`${pat}\` has a hole in its folder or is not relative`); continue; }
      const dir = posix.normalize(posix.join(posix.dirname(file), parts.dir));
      let names = [];
      try { names = readdirSync(join(root, dir)).filter((f) => parts.re.test(f) && exists(posix.join(dir, f))).sort(); } catch { /* reported below */ }
      if (!names.length) problems.push(`${file}: the dynamic import \`${pat}\` matches no file in ${dir}`);
      for (const f of names) { const p = posix.join(dir, f); if (!e.dynamics.includes(p)) e.dynamics.push(p); }
    }
    edges[file] = e;
    return e;
  };
  /** Breadth first from `starts` along the edges `pick` names; every module is read once. */
  const bfs = (starts, pick, skip = new Set()) => {
    const seen = new Set(starts.filter((s) => !skip.has(s))), order = [...seen];
    for (let k = 0; k < order.length; k++) { const e = edges[order[k]] || read(order[k]); for (const p of pick(e)) if (!seen.has(p) && !skip.has(p)) { seen.add(p); order.push(p); } }
    return order;
  };
  if (!exists(entry)) throw new Error(`The entry module ${entry} is not a file`);
  const statics = bfs([entry], (e) => e.statics);
  // modules only an import() reaches: from every dynamic target of a module already known, and from what those import in turn (statically or not)
  const dynamic = [], known = new Set(statics);
  for (let again = true; again;) {
    again = false;
    const targets = [...known].flatMap((m) => (edges[m] || read(m)).dynamics).filter((p) => !known.has(p));
    if (targets.length) { for (const m of bfs(targets, (e) => [...e.statics, ...e.dynamics], known)) { known.add(m); dynamic.push(m); } again = true; }
  }
  if (problems.length) throw new Error('The import graph has problems:\n  ' + problems.join('\n  '));
  return { modules: [...statics, ...dynamic], static: statics, dynamic, edges };
}

/**
 * The <link> lines for a page whose script is `entry`: the static graph only (all of it is needed before the entry can run). The modules that only an import() brings in are the later screens' (the game, the Academy, the
 * dashboard, the debrief): preloading them here would make the title screen wait for them, so the page lists them apart (`lazyManifest`) and js/main.js asks for them once the browser is idle.
 */
export function preloadLines(graph, { indent = '  ' } = {}) {
  return graph.static.map((m) => `${indent}<link rel="modulepreload" href="${m}">`).join('\n');
}
/** The modules that only import() reaches, as the JSON the staged page carries (`<script type="application/json" id="pc-lazy">`): a flat list of paths, breadth first. */
export function lazyManifest(graph) {
  return JSON.stringify(graph.dynamic);
}

const isMain = () => { try { return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const g = walk();
  if (process.argv.includes('--json')) console.log(JSON.stringify({ static: g.static, dynamic: g.dynamic }, null, 1));
  else console.log(preloadLines(g) + (g.dynamic.length ? `\n  <script type="application/json" id="pc-lazy">${lazyManifest(g)}</script>` : ''));
}
