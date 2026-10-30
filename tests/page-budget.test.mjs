// The page-weight budget: what the staged site asks of a browser before it can show its first screen, and that everything else waits for a screen to open or for the browser to be idle.
//   B1  the static graph of js/main.js (what the staged page preloads and fetches before the title screen) holds no module of the world, of a later screen or of the game's rules and content that only a later screen reads
//   B2  the first screen's requests and bytes are under the budget, and the whole site is under its own (a regression guard: the sound layer and the art took the page from 71 requests and 561 KB to 150 and 952 KB)
//   B3  the screens that need the game are import()s of js/main.js, named by a literal path (scripts/preload.mjs reads them), and a screen that has not loaded shows a Loading note
//   B4  in headless Chrome, served as Pages serves it: the first screen fetches no more than the budget before `load`, no module of the game is among them, and once the page is idle the rest is fetched, none fails, and the island's static scene is built before anyone presses Begin
// The numbers are in BUDGET, in one place. A change that moves one past its limit says which and by how much; raising a limit is a decision to write down in docs/ARCHITECTURE.md ("The first screen, and the rest").
// Chrome is needed for B4 (skipped without it, or with PC_NO_BROWSER=1). Run: node --test tests/page-budget.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as netServer } from 'node:net';
import { walk } from '../scripts/preload.mjs';
import { stage, servePages, BASE_PATH } from '../scripts/stage.mjs';
import { measured } from './helpers/staged-size.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const kb = (n) => n / 1024;

/** Limits, in the units of docs/ARCHITECTURE.md ("What was measured"): requests, and KB gzipped (1 KB is 1,024 bytes). */
export const BUDGET = {
  firstRequests: 45,   // the page, the 12 stylesheets and the static modules
  firstKB: 300,        // all of it gzipped: the page, the sheets, the modules
  totalRequests: 165,  // everything the site ever fetches
  totalKB: 1000,
};

/** Folders and modules that belong to a later screen. None may be in the static graph. */
const LATER = [/^js\/world\//, /^js\/ui\/(shell|academy|academy-sandbox|instructor|debrief|worldview|deal|hud|polish)\.js$/, /^js\/ui\/drawers\//, /^js\/play\//, /^js\/deal\.js$/, /^js\/meta\/(academy|quests|progress|codex)\.js$/];

test('B1: the static graph of js/main.js holds nothing that only a later screen needs', () => {
  const g = walk(), early = g.static.filter((m) => LATER.some((re) => re.test(m)));
  assert.deepEqual(early, [], 'these are fetched before the title screen can be shown; load them with import() when their screen opens (js/main.js LOAD)');
  assert.ok(g.static.includes('js/ui/draft.js') && g.static.includes('js/session.js'), 'the title screen and the Draft are the static graph');
  assert.ok(g.dynamic.length > 90, `the later screens are the bulk of the modules (${g.dynamic.length})`);
});

test('B2: the first screen\'s requests and bytes, and the whole site\'s, are under the budget', () => {
  const m = measured();
  assert.ok(m.first.requests <= BUDGET.firstRequests, `the first screen makes ${m.first.requests} requests (budget ${BUDGET.firstRequests}): the page, ${m.first.requests - 1 - m.title.n} stylesheets and ${m.title.n} modules`);
  assert.ok(kb(m.first.gz) <= BUDGET.firstKB, `the first screen is ${kb(m.first.gz).toFixed(1)} KB gzipped (budget ${BUDGET.firstKB})`);
  assert.ok(m.requests <= BUDGET.totalRequests, `the site makes ${m.requests} requests in all (budget ${BUDGET.totalRequests})`);
  assert.ok(kb(m.total) <= BUDGET.totalKB, `the site is ${kb(m.total).toFixed(1)} KB gzipped in all (budget ${BUDGET.totalKB})`);
  assert.equal(m.staticWorld, 0, 'no module of the world is fetched before the first screen');
});

test('B3: the screens that need the game are import()s with literal paths, and a screen that is loading says so', () => {
  const main = read('js/main.js');
  for (const [name, file] of [['academy', 'academy'], ['game', 'shell'], ['instructor', 'instructor'], ['debrief', 'debrief']]) {
    assert.match(main, new RegExp(`${name}: \\(\\) => import\\('\\./ui/${file}\\.js'\\)`), `${name} is loaded with import()`);
    assert.doesNotMatch(main, new RegExp(`^import .* from '\\./ui/${file}\\.js';$`, 'm'), `and has no static import`);
  }
  assert.match(main, /role="status">Loading&hellip;<\/p>/, 'a screen waiting for its modules says Loading, in a live region');
  assert.match(main, /if \(mine === route\) show\(screen, arg, mine\)/, 'and a second request while it waits wins');
  assert.match(main, /document\.getElementById\('pc-lazy'\)/, 'the rest is prefetched from the list the staged page carries');
  assert.match(main, /navigator\.connection\?\.saveData/, 'and not on a connection that asks for less data');
  assert.match(main, /const warmWorld = \(\) => \{ import\('\.\/world\/scene\.js'\)\.catch\(\(\) => \{\}\); \};/, 'the island\'s static scene is built while the title is on screen, by an import() with a literal path');
  assert.match(main, /if \(list\.length\) idle\(pump\); else idle\(warmWorld\);/, 'once the last batch of modules is asked for, in idle time');
  assert.ok(main.indexOf('navigator.connection?.saveData') < main.indexOf('const warmWorld'), 'and never on a connection that asks for less data');
});

// ====================================================================================================================================
// B4. In headless Chrome, served as GitHub Pages serves it
// ====================================================================================================================================
const { CHROME } = await import('../scripts/chrome.mjs');
const freePort = () => new Promise((res) => { const s = netServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

test('B4: in Chrome the first screen fetches only the static graph before load, then the browser fetches the rest while idle, and nothing fails', { timeout: 180000 }, async (t) => {
  if (process.env.PC_NO_BROWSER || !CHROME || !existsSync(CHROME)) { t.skip('no Chrome here (B1 to B3 hold the budget without a browser)'); return; }
  const { launch, open } = await import('../scripts/cdp.mjs');
  const dir = join(mkdtempSync(join(tmpdir(), 'pc-budget-')), 'site'); stage({ out: dir, lastmod: '2026-10-29' });
  const server = servePages(dir); await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}${BASE_PATH}`, g = walk(), b = await launch(await freePort());
  try {
    const p = await open(b, base + '?slot=budget', { w: 1280, h: 800 });
    const until = async (expr, what, ms = 60000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await p.eval(expr); if (last) return last; } catch { /* between loads */ } await p.sleep(100); } assert.fail(`timed out waiting for ${what} (last: ${JSON.stringify(last)})`); };
    await until(`document.readyState === 'complete' && !!document.querySelector('#app h1')`, 'the title screen');
    // what was fetched before the load event fired: the page, the sheets, the static graph (the idle prefetch starts after it)
    const first = JSON.parse(await p.eval(`(() => { const nav = performance.getEntriesByType('navigation')[0], cut = nav.loadEventStart || nav.domComplete;
      const rows = performance.getEntriesByType('resource').filter((e) => e.startTime < cut).map((e) => [new URL(e.name).pathname.slice(${JSON.stringify(BASE_PATH.length)}), e.encodedBodySize]);
      return JSON.stringify({ page: nav.encodedBodySize, rows }); })()`));
    const jsFirst = first.rows.filter(([n]) => n.startsWith('js/')).map(([n]) => n), sheets = first.rows.filter(([n]) => n.startsWith('css/'));
    assert.deepEqual(jsFirst.filter((n) => !g.static.includes(n)), [], 'before the load event only the static graph is fetched');
    assert.ok(jsFirst.length >= g.static.length - 1, `and all of it is (${jsFirst.length} of ${g.static.length})`);
    const requests = 1 + first.rows.length, bytes = first.page + first.rows.reduce((a, [, n]) => a + n, 0);
    assert.ok(requests <= BUDGET.firstRequests, `the first screen made ${requests} requests (budget ${BUDGET.firstRequests})`);
    assert.ok(kb(bytes) <= BUDGET.firstKB, `and ${kb(bytes).toFixed(1)} KB gzipped on the wire (budget ${BUDGET.firstKB}); the sheets were ${sheets.length}`);
    // then the browser is idle and fetches the rest, low priority, and every module of the site is in the page's resource list
    await until(`(() => { const have = new Set(performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname.slice(${JSON.stringify(BASE_PATH.length)}))); return ${JSON.stringify(g.modules)}.every((m) => have.has(m)); })()`, 'the idle prefetch of every other module', 90000);
    // and the island's static scene (its layout, the coast, the opening ground's colours) is built meanwhile, while the title is on screen: a player who presses Begin later finds it made
    await until(`performance.getEntriesByName('pc:coast').length > 0 && performance.getEntriesByName('pc:scene').length > 0 && !window.pc.world`, 'the scene built while the title is still on screen', 30000);
    // and a player who then presses Play solo finds the Draft, and Begin finds the game, without a failure
    const bad = await p.eval(`performance.getEntriesByType('resource').filter((e) => e.responseStatus >= 400).map((e) => e.name + ' ' + e.responseStatus)`);
    assert.deepEqual(bad, [], 'no request failed');
    assert.deepEqual(p.logs.filter((l) => /^(error|EXC)/.test(l)), [], 'and the console is clean');
    await p.close();
  } finally { b.close(); server.closeAllConnections?.(); await new Promise((ok) => server.close(ok)); }
});
