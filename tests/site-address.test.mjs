// The site's address, which is case-sensitive.
//
// The repository is Paperclip-Capitalist and GitHub Pages serves it at https://imaidan808.github.io/Paperclip-Capitalist/. The same address with the repository in lower case answers
// 404 on the real host (checked with curl on 2026-10-28), and a copy of that lower-case address was once written into the page, the sitemap and the docs, where nothing could notice it:
// the local stand-in answered under whatever path the script said. These tests close that hole from three sides.
//
//   1. A reading of every text file of the repository (the staged site and the docs among them) for the repository's name written as the last step of an address or path in any
//      spelling but the real one. The list of files allowed to do so is empty, and a test holds it empty.
//   2. The stager's own gate (`verify`, which the workflow runs and which exits 1), proved on planted faults in every kind of staged file.
//   3. The staged site served under /Paperclip-Capitalist/ by the Pages stand-in, with every absolute address the pages declare fetched from it: all 200, the share picture the size its
//      tags say, the lower-case twin of each a 404.
//
// The lower-case spelling is built from pieces here on purpose: this file is read by the first test too, and a file that writes the fault out would be the fault.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, existsSync, rmSync, cpSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../scripts/preload.mjs';
import { stage, verify, servePages, addressProblems, pngSize, SITE_URL, REPO_URL, REPO_NAME, BASE_PATH } from '../scripts/stage.mjs';
import { KIT_URL } from '../js/ui/instructor.js';

const REAL = 'Paperclip-Capitalist';
const LOWER = ['paperclip', 'capitalist'].join('-');
const HALF = ['P', LOWER.slice(1)].join(''), OTHER_HALF = LOWER.replace('-c', '-C'), SHOUTED = LOWER.toUpperCase();   // the name with only its first word capitalised, only its second, and all of it
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const temps = [], children = [];
const tmp = (label = 'pc-addr-') => { const d = mkdtempSync(join(tmpdir(), label)); temps.push(d); return d; };
after(() => { for (const c of children) { try { c.kill('SIGTERM'); } catch { /* gone */ } } for (const d of temps) rmSync(d, { recursive: true, force: true }); });

// ---------------------------------------------------------------------------------------------------------------- the reading
/** Where the repository's name stands as a step of an address or a path ("/name" followed by the end of the word), whatever the case. Not read: the name inside a longer word (the npm package, a channel). */
const STEP = new RegExp(`(?<=/)${LOWER}(?![\\w-])`, 'gi');
/** The spellings of the name in `text` that are not the real one, with a little of what is around each. */
const offences = (text) => [...text.matchAll(STEP)].filter((m) => m[0] !== REAL).map((m) => text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 10).replace(/\s+/g, ' '));

/** Every text file under `dir` as [relative path, text]. .git (a folder, or the file a worktree has in its place) and node_modules are not the repository's; a file with a NUL in its head is a picture. */
function textFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name === '.git' || name.name === 'node_modules') continue;
    const p = join(dir, name.name), rel = p.slice(base.length + 1);
    if (name.isDirectory()) out.push(...textFiles(p, base));
    else if (name.isFile()) { const buf = readFileSync(p); if (!buf.subarray(0, 8000).includes(0)) out.push([rel, buf.toString('utf8')]); }
  }
  return out;
}

/** Files that may write the address in another spelling. Empty, and it stays empty: a lower-case address is a 404 online, and an exception here is a page nobody can open. */
const ALLOW = [];

test('an exception to the address rule has to be earned: a file allowed another spelling exists and really writes one (the list is empty today, and a stale entry fails here)', () => {
  // ALLOW is the very list the scan of the repository below consults, so an entry is a hole in it; one that names no file, or a file that spells the address right, is a hole for nothing
  for (const f of ALLOW) {
    assert.ok(existsSync(join(ROOT, f)), `${f} is allowed another spelling and is not a file`);
    assert.ok(offences(read(f)).length > 0, `${f} is allowed another spelling and writes none: take it off the list`);
  }
});

test('the reading itself: it finds every spelling but the real one, in every kind of address, and leaves words that only contain the name alone', () => {
  const bad = [
    `https://imaidan808.github.io/${LOWER}/`, `<link rel="canonical" href="https://imaidan808.github.io/${LOWER}/">`, `https://imaidan808.github.io/${LOWER}`,
    `https://github.com/imaidan808/${LOWER}/blob/main/README.md`, `http://localhost:8081/${LOWER}/`, `under '/${LOWER}/', with the site's own 404`, `Sitemap: https://imaidan808.github.io/${LOWER}/sitemap.xml`,
    `https://imaidan808.github.io/${HALF}/`, `https://imaidan808.github.io/${OTHER_HALF}/`, `https://imaidan808.github.io/${SHOUTED}/`, `see github.com/imaidan808/${LOWER}.`, `"url": "https:\\/\\/imaidan808.github.io\\/${LOWER}\\/"`,
  ];
  for (const s of bad) { assert.equal(offences(s).length, 1, `the test's reading finds it: ${s}`); assert.equal(addressProblems(s).length, 1, `the stager's reading finds it: ${s}`); }
  const fine = [
    `https://imaidan808.github.io/${REAL}/`, `https://github.com/imaidan808/${REAL}/blob/main/README.md`, `http://localhost:8081/${REAL}/`, `/${REAL}`,
    `"name": "${LOWER}"`, `"name": "${LOWER}-relay"`, `new BroadcastChannel('${LOWER}-' + code)`, `${LOWER}-site`, 'Paperclip Capitalist', 'a paperclip capitalist',
  ];
  for (const s of fine) { assert.deepEqual(offences(s), [], `the test's reading leaves it: ${s}`); assert.deepEqual(addressProblems(s), [], `the stager's reading leaves it: ${s}`); }
  // an address on the host that is not under the site is a fault whatever the spelling
  assert.equal(addressProblems('https://imaidan808.github.io/other-repo/').length, 1);
  assert.equal(addressProblems('https://imaidan808.github.io/').length, 1);
  assert.deepEqual(addressProblems(`https://imaidan808.github.io/${REAL}/assets/share.png#x`), []);
  assert.equal(REPO_NAME, REAL); assert.equal(SITE_URL, `https://imaidan808.github.io/${REAL}/`); assert.equal(REPO_URL, `https://github.com/imaidan808/${REAL}/`); assert.equal(BASE_PATH, `/${REAL}/`);
});

test('no file of the repository writes the address in a spelling GitHub Pages does not answer to', () => {
  const files = textFiles(ROOT);
  assert.ok(files.length > 150, `the reading reached the repository (${files.length} text files)`);
  for (const must of ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'llms.txt', 'README.md', 'scripts/stage.mjs', '.github/workflows/pages.yml', 'docs/FACULTY_KIT.md', 'docs/COMPLIANCE.md', 'docs/V2_DESIGN.md', 'docs/ARCHITECTURE.md', 'js/ui/instructor.js', 'tests/finish-site.test.mjs'])
    assert.ok(files.some(([f]) => f === must), `${must} is among the files read`);
  const found = [];
  for (const [f, text] of files) if (!ALLOW.includes(f)) for (const o of offences(text)) found.push(`${f}: ...${o}`);
  assert.deepEqual(found, [], `these write the repository's name in a spelling that is a 404 on GitHub Pages (it is ${REAL}):\n  ${found.join('\n  ')}`);
});

test('the address is written, and in the real spelling, where it has to be', () => {
  const need = { 'index.html': 7, '404.html': 1, 'robots.txt': 1, 'sitemap.xml': 1, 'llms.txt': 1, 'README.md': 1, 'docs/FACULTY_KIT.md': 1, 'docs/COMPLIANCE.md': 1 };
  for (const [f, n] of Object.entries(need)) assert.ok(read(f).split(`imaidan808.github.io/${REAL}/`).length - 1 >= n, `${f} names the site ${n} time(s) at ${SITE_URL}`);
  // the GitHub address of the repository, which GitHub resolves in any case, is written in the real one too
  assert.equal(KIT_URL, `${REPO_URL}blob/main/docs/FACULTY_KIT.md`);
  const links = [...read('llms.txt').matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map((m) => m[1]);
  assert.ok(links.length >= 6);
  for (const l of links) assert.ok(l.startsWith(SITE_URL) || l.startsWith(REPO_URL + 'blob/main/'), `llms.txt: ${l}`);
  for (const l of links.filter((l) => l.startsWith(REPO_URL))) assert.ok(existsSync(join(ROOT, l.slice((REPO_URL + 'blob/main/').length))), `llms.txt links a file that is there: ${l}`);
});

// ---------------------------------------------------------------------------------------------------------------- the gate
let stagedOnce = null;
const staged = () => stagedOnce ||= stage({ out: join(tmp('pc-addr-site-'), 'site'), lastmod: '2026-10-28' });
const copyOfStaged = () => { const d = join(tmp('pc-addr-copy-'), 'site'); cpSync(staged().out, d, { recursive: true }); return d; };

test('the staged site, every text file of it, writes the address in the real spelling only', () => {
  const { out, files } = staged();
  assert.deepEqual(verify(out), []);
  const text = textFiles(out);
  for (const f of files.filter((f) => !text.some(([n]) => n === f))) assert.match(f, /\.(png|ico|woff2?)$/, `${f} was not read as text, so it must be a picture or a font`);
  assert.ok(text.length >= 70, `the modules and sheets were read (${text.length} files)`);
  for (const [f, t] of text) assert.deepEqual(offences(t), [], f);
  // and it does write it: the pages, the sitemap, robots.txt, llms.txt and the module that links the faculty kit
  for (const f of ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'llms.txt', 'js/ui/instructor.js']) assert.ok(text.some(([n, t]) => n === f && t.includes(`/${REAL}/`)), `${f} carries the address`);
});

test('the stager refuses a staged site that spells the address another way: planted in a page, the sitemap, robots.txt, llms.txt and a module, each is named', () => {
  const plant = (file, change) => { const d = copyOfStaged(); writeFileSync(join(d, file), change(readFileSync(join(d, file), 'utf8'))); return verify(d); };
  const lower = (s) => s.split(REAL).join(LOWER);
  for (const f of ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'llms.txt', 'js/ui/instructor.js']) {
    const bad = plant(f, lower);
    assert.ok(bad.length >= 1 && bad.every((b) => b.startsWith(f + ': ')), `${f}: ${bad.join(' | ')}`);
    assert.ok(bad.some((b) => b.includes(LOWER) && b.includes(REAL)), `${f}: the problem says what was written and what the name is`);
  }
  // one leftover among correct addresses is still found, and said once
  const one = plant('sitemap.xml', (s) => s.replace(`<loc>${SITE_URL}</loc>`, `<loc>https://imaidan808.github.io/${LOWER}/</loc>`));
  assert.equal(one.length, 1, one.join(' | ')); assert.ok(one[0].includes(`"https://imaidan808.github.io/${LOWER}"`), 'it quotes the whole address: ' + one[0]);
  // the host's other addresses too: a path that is not the site's
  assert.match(plant('index.html', (s) => s.replace('rel="canonical" href="' + SITE_URL + '"', 'rel="canonical" href="https://imaidan808.github.io/other/"')).join('\n'), /not under https:\/\/imaidan808\.github\.io\/Paperclip-Capitalist\//);
  // and the stager as a program exits 1 on it, which is what stops the workflow before anything is uploaded
  const d = copyOfStaged(); writeFileSync(join(d, 'robots.txt'), lower(readFileSync(join(d, 'robots.txt'), 'utf8')));
  const cli = spawnSync(process.execPath, [join(ROOT, 'scripts/stage.mjs'), '--verify', d], { encoding: 'utf8' });
  assert.equal(cli.status, 1); assert.match(cli.stderr, /robots\.txt: writes ".*" but GitHub Pages is case-sensitive/);
});

// ---------------------------------------------------------------------------------------------------------------- the stand-in and the workflow
const listen = (server) => new Promise((res) => server.listen(0, '127.0.0.1', () => res(server.address().port)));
const lowerTwin = (u) => u.replace(`/${REAL}/`, `/${LOWER}/`).replace(new RegExp(`/${REAL}$`), `/${LOWER}`);

test('the stand-in mounts the site at the real spelling only: the lower-case path is a 404 on it, as it is online', async () => {
  const server = servePages(staged().out), port = await listen(server);
  try {
    const at = (path) => fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual' });
    assert.equal((await at(BASE_PATH)).status, 200);
    assert.equal((await at(BASE_PATH + 'index.html')).status, 200);
    assert.equal((await at(`/${REAL}`)).status, 301, 'the bare folder redirects to the slash, as on Pages');
    for (const p of [`/${LOWER}/`, `/${LOWER}/index.html`, `/${LOWER}/assets/share.png`, `/${LOWER}/sitemap.xml`, `/${LOWER}`, `/${SHOUTED}/`, `/${HALF}/`]) {
      const r = await at(p); assert.equal(r.status, 404, p);
      assert.ok(!(await r.text()).includes('Back to the game'), `${p}: not even the game's own 404 page, which lives under the real folder`);
    }
    assert.equal((await at('/')).status, 404);
  } finally { server.close(); }
});

test('npm run preview serves the site at the real spelling and says so', async () => {
  const child = spawn(process.execPath, [join(ROOT, 'scripts/stage.mjs'), join(tmp('pc-addr-preview-'), 'site'), '--serve', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  try {
    const said = await new Promise((res, rej) => {
      let buf = ''; const t = setTimeout(() => rej(new Error('the preview did not start: ' + buf)), 20000);
      child.stdout.on('data', (c) => { buf += c; const m = buf.match(/Serving it as GitHub Pages would: (http:\/\/localhost:(\d+)(\/\S*))/); if (m) { clearTimeout(t); res(m); } });
      child.on('exit', (code) => { clearTimeout(t); rej(new Error('the preview exited ' + code + ': ' + buf)); });
    });
    assert.equal(said[3], `/${REAL}/`, 'it names the real spelling');
    assert.equal((await fetch(`http://127.0.0.1:${said[2]}${said[3]}`)).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${said[2]}/${LOWER}/`)).status, 404);
  } finally { child.kill('SIGTERM'); }
});

test('the Pages workflow stages with the stager, which refuses a mis-spelt address, and carries no address of its own', () => {
  const text = read('.github/workflows/pages.yml');
  assert.deepEqual(offences(text), []);
  assert.ok(!/github\.io/i.test(text), 'the address is the stager\'s and the page\'s, never the workflow\'s: GitHub computes the deployment url from the repository');
  assert.match(text, /url: \$\{\{ steps\.deployment\.outputs\.page_url \}\}/);
  const cmd = text.match(/^\s*run: (node scripts\/stage\.mjs (\S+) --lastmod "\$\(git log -1 --format=%cs\)")$/m);
  assert.ok(cmd, 'it runs the stager with the date of the commit');
  assert.match(text, new RegExp(`path: ${cmd[2]}\\b`), 'and uploads the folder the stager wrote');
  // the command as the workflow runs it, into a folder of ours (the workflow's own, _site, would be made inside the project): it exits 0 only if the staged site is sound, the address included
  const git = spawnSync('git', ['log', '-1', '--format=%cs'], { cwd: ROOT, encoding: 'utf8' });
  const day = git.status === 0 && /^\d{4}-\d{2}-\d{2}$/.test(git.stdout.trim()) ? git.stdout.trim() : new Date().toISOString().slice(0, 10);
  const out = join(tmp('pc-addr-wf-'), cmd[2]);
  const run = spawnSync(process.execPath, [join(ROOT, 'scripts/stage.mjs'), out, '--lastmod', day], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr + run.stdout); assert.match(run.stdout, /The staged site is sound\./);
  assert.match(readFileSync(join(out, 'sitemap.xml'), 'utf8'), new RegExp(`<loc>${SITE_URL.replace(/[.]/g, '\\.')}</loc>\\s*<lastmod>${day}</lastmod>`));
});

// ---------------------------------------------------------------------------------------------------------------- every absolute address, fetched
const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i')) || [])[1];
/** Every absolute address the pages and files of the staged site declare, by where it is declared: { where, url }. */
function declared(dir) {
  const out = [], add = (where, url) => { assert.ok(url, `${where} is declared`); out.push({ where, url }); };
  const index = readFileSync(join(dir, 'index.html'), 'utf8'), notfound = readFileSync(join(dir, '404.html'), 'utf8');
  const meta = (html, key) => attr((html.match(new RegExp(`<meta\\b[^>]*\\b(?:property|name)="${key}"[^>]*>`)) || [''])[0], 'content');
  add('index.html canonical', attr((index.match(/<link\b[^>]*\brel="canonical"[^>]*>/) || [''])[0], 'href'));
  for (const k of ['og:url', 'og:image', 'twitter:image']) add(`index.html ${k}`, meta(index, k));
  const ld = JSON.parse(index.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  for (const k of ['url', '@id', 'image']) add(`JSON-LD ${k}`, ld[k]);
  add('404.html Back to the game', attr((notfound.match(/<a\b[^>]*\bclass="btn"[^>]*>/) || [''])[0], 'href'));
  for (const m of readFileSync(join(dir, 'robots.txt'), 'utf8').matchAll(/^Sitemap: (\S+)$/gm)) add('robots.txt Sitemap', m[1]);
  for (const m of readFileSync(join(dir, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) add('sitemap.xml loc', m[1]);
  for (const m of readFileSync(join(dir, 'llms.txt'), 'utf8').matchAll(/\]\((https?:\/\/[^)]+)\)/g)) add('llms.txt link', m[1]);
  return out;
}

test('every absolute address the staged pages declare, fetched from the stand-in under the real spelling: 200 for each, a 404 for its lower-case twin, and a share picture the size its tags say', async () => {
  const { out } = staged(), list = declared(out);
  for (const w of ['index.html canonical', 'index.html og:url', 'index.html og:image', 'index.html twitter:image', 'JSON-LD url', 'JSON-LD @id', 'JSON-LD image', '404.html Back to the game', 'robots.txt Sitemap', 'sitemap.xml loc'])
    assert.ok(list.some((d) => d.where === w), `${w} is among the addresses`);
  assert.ok(list.filter((d) => d.where === 'llms.txt link').length >= 6);
  const server = servePages(out), port = await listen(server);
  try {
    const local = (u) => `http://127.0.0.1:${port}${new URL(u).pathname}`;
    const seen = new Map();
    for (const { where, url } of list) {
      if (url.startsWith(REPO_URL)) {
        // on github.com, not served here: the file it names must be one the repository has, and the spelling the real one
        const path = url.slice(REPO_URL.length);
        assert.match(path, /^blob\/main\/[^#?]+$/, `${where}: ${url}`);
        assert.ok(existsSync(join(ROOT, path.slice('blob/main/'.length))), `${where}: ${url} names a file the repository has`);
        continue;
      }
      assert.ok(url.startsWith(SITE_URL), `${where}: ${url} is under ${SITE_URL}`);
      assert.ok(new URL(url).pathname.startsWith(`/${REAL}/`), `${where}: the path starts at /${REAL}/`);
      const r = await fetch(local(url));
      assert.equal(r.status, 200, `${where}: ${url}`);
      seen.set(url, Buffer.from(await r.arrayBuffer()));
      const twin = await fetch(local(lowerTwin(url)));
      assert.equal(twin.status, 404, `${where}: the lower-case twin of ${url} is a 404`);
    }
    // the picture: the same bytes behind og:image, twitter:image and JSON-LD, a PNG of the size the Open Graph tags say
    const index = readFileSync(join(out, 'index.html'), 'utf8');
    const w = +attr(index.match(/<meta\b[^>]*property="og:image:width"[^>]*>/)[0], 'content'), h = +attr(index.match(/<meta\b[^>]*property="og:image:height"[^>]*>/)[0], 'content');
    const type = attr(index.match(/<meta\b[^>]*property="og:image:type"[^>]*>/)[0], 'content');
    assert.deepEqual([w, h, type], [1200, 630, 'image/png']);
    const pics = list.filter((d) => /\b(?:og:image|twitter:image)$|JSON-LD image$/.test(d.where)).map((d) => d.url);
    assert.equal(pics.length, 3, 'og:image, twitter:image and the schema\'s image');
    assert.equal(new Set(pics).size, 1, 'one share picture for the cards and the schema');
    for (const u of new Set(pics)) {
      const r = await fetch(local(u)); assert.equal(r.headers.get('content-type'), type);
      assert.deepEqual(pngSize(Buffer.from(await r.arrayBuffer())), { w, h }, `${u} is ${w} x ${h}, as the tags say`);
    }
    // the 404 page's button leads home, and home is the page the canonical address names
    const home = seen.get(SITE_URL); assert.ok(home && home.toString().includes('<link rel="canonical" href="' + SITE_URL + '">'));
    // the 404 page itself, at a path that is not a file: the game's own page, with the same button
    const missing = await fetch(local(SITE_URL + 'no/such/page'));
    assert.equal(missing.status, 404); assert.ok((await missing.text()).includes(`href="${SITE_URL}"`));
    // robots.txt's Sitemap is the sitemap that is staged, and its loc is the site
    const sm = list.find((d) => d.where === 'robots.txt Sitemap').url; assert.equal(sm, SITE_URL + 'sitemap.xml');
    assert.ok(seen.get(sm).toString().includes(`<loc>${SITE_URL}</loc>`));
    // llms.txt's play link is the site
    assert.ok(list.some((d) => d.where === 'llms.txt link' && d.url === SITE_URL), 'llms.txt links the game at its address');
  } finally { server.close(); }
});
