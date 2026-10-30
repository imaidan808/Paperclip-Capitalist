// The build stamp: which commit and which deploy a browser is running, shown in the menu and on the title screen. GitHub Pages lets a browser keep files for ten minutes, so a page can run
// the build before the one that is live and nothing on the screen says so; "is it the cache again?" had no answer. scripts/stage.mjs writes the stamp into the staged js/build.js (what
// runs) and into assets/build.json (what is live, read with no cache); the app shows the first and says when the second is later.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stage, verify } from '../scripts/stage.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const STAMP = { sha: '57726ef', at: '2026-10-30T19:16:05Z' };
const LATER = { sha: 'aaaaaaa', at: '2026-10-30T20:02:00Z' };
const NY = { locale: 'en-US', timeZone: 'America/New_York' };
const plain = (s) => s.replace(/[\u202f\u00a0]/g, ' '); // newer ICU puts a narrow no-break space before AM and PM
const live = (calls, body, ok = true) => async (url, opts) => { calls.push([url, opts]); return { ok, json: async () => body }; };

test('the label names the commit and the time of the deploy in the reader\'s own zone, and says so for a development copy', async () => {
  const { buildLabel } = await import('../js/build.js');
  assert.equal(plain(buildLabel(STAMP, NY)), 'Version 57726ef, deployed Oct 30, 3:16 PM');
  assert.equal(buildLabel({ sha: 'dev', at: '' }), 'Version: a development copy, not a published build');
  assert.equal(plain(buildLabel({ sha: '57726ef0123456789', at: STAMP.at }, NY)), 'Version 57726ef, deployed Oct 30, 3:16 PM', 'a long hash is cut to seven characters');
  assert.equal(buildLabel({ sha: '57726ef', at: 'yesterday' }, NY), 'Version 57726ef', 'a time that is not a time is left out, not shown as "Invalid Date"');
});

test('the source tree never carries a real stamp: js/build.js says dev, and the stage is what writes the rest', () => {
  assert.match(read('js/build.js'), /^export const BUILD = Object\.freeze\(\{ sha: 'dev', at: '' \}\);$/m);
});

test('newerBuild asks the site and never the cache, and answers only for a build later than the one running', async () => {
  const { newerBuild, BUILD_URL } = await import('../js/build.js');
  const calls = [], force = { force: true };
  assert.deepEqual(await newerBuild(STAMP, live(calls, LATER), force), LATER);
  assert.deepEqual(calls[0], [BUILD_URL, { cache: 'no-store' }], 'with no-store: a cached answer would say the page is current whatever is live');
  assert.equal(await newerBuild(STAMP, live([], STAMP), force), null, 'the same build is not news');
  assert.equal(await newerBuild(STAMP, live([], { sha: 'bbbbbbb', at: '2026-10-30T18:00:00Z' }), force), null, 'an older answer (the host still catching up after a deploy) is not news either');
  assert.equal(await newerBuild(STAMP, live([], LATER, false), force), null, 'no file');
  assert.equal(await newerBuild(STAMP, async () => { throw new Error('offline'); }, force), null, 'offline');
  assert.equal(await newerBuild(STAMP, live([], { sha: 'zzz', at: 'nope' }), force), null, 'an answer that is not a stamp');
  const before = calls.length;
  assert.equal(await newerBuild({ sha: 'dev', at: '' }, live(calls, LATER), force), null);
  assert.equal(calls.length, before, 'a development copy asks nobody');
});

test('newerBuild asks at most once a minute', async () => {
  const { newerBuild } = await import('../js/build.js');
  const calls = []; let t = 1e6; const now = () => t;
  await newerBuild(STAMP, live(calls, LATER), { force: true, now });
  await newerBuild(STAMP, live(calls, LATER), { now }); t += 30000; await newerBuild(STAMP, live(calls, LATER), { now });
  assert.equal(calls.length, 1, 'the menu opened three times in half a minute is one request');
  t += 31000; await newerBuild(STAMP, live(calls, LATER), { now });
  assert.equal(calls.length, 2, 'and a minute later it asks again');
});

test('stamp writes the label, then says when a newer build is live and how to get it, and leaves an element that has gone alone', async () => {
  const { stamp } = await import('../js/build.js');
  const opts = (get) => ({ current: STAMP, get, force: true, ...NY });
  const same = { textContent: '', isConnected: true };
  await stamp(same, opts(live([], STAMP)));
  assert.equal(plain(same.textContent), 'Version 57726ef, deployed Oct 30, 3:16 PM');
  const behind = { textContent: '', isConnected: true };
  await stamp(behind, opts(live([], LATER)));
  const t = plain(behind.textContent);
  assert.match(t, /^Version 57726ef, deployed Oct 30, 3:16 PM\. A newer version is live \(aaaaaaa, deployed Oct 30, 4:02 PM\)/, t);
  assert.match(t, /Cmd\+Shift\+R/, 'it says how to get it: a hard reload');
  assert.match(t, /Ctrl\+Shift\+R/);
  // a build that is behind is not fine print: the line leaves the muted style; a current one stays as it was
  const classes = () => { const set = new Set(['tiny', 'mute']); return { set, classList: { remove: (...a) => a.forEach((c) => set.delete(c)), add: (...a) => a.forEach((c) => set.add(c)) } }; };
  const a = classes(), b = classes();
  await stamp({ textContent: '', isConnected: true, classList: a.classList }, opts(live([], STAMP)));
  await stamp({ textContent: '', isConnected: true, classList: b.classList }, opts(live([], LATER)));
  assert.deepEqual([...a.set].sort(), ['mute', 'tiny'], 'a current build keeps its fine print');
  assert.deepEqual([...b.set].sort(), ['small'], 'a build that is behind is plain small text, not muted');
  const gone = { textContent: '', isConnected: true };
  const p = stamp(gone, opts(live([], LATER))); gone.isConnected = false; await p;
  assert.doesNotMatch(gone.textContent, /newer/, 'an element that left the page is not written to');
});

test('the staged site carries the stamp twice, the same: in js/build.js (what runs) and in assets/build.json (what is live), and verify holds them to it', async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'pc-build-')), 'site');
  stage({ out, lastmod: '2026-10-30', build: STAMP });
  assert.deepEqual(JSON.parse(readFileSync(join(out, 'assets/build.json'), 'utf8')), STAMP);
  const m = await import(pathToFileURL(join(out, 'js/build.js')).href);
  assert.deepEqual({ ...m.BUILD }, STAMP, 'the module the page runs says the same');
  assert.deepEqual(verify(out), []);
  writeFileSync(join(out, 'assets/build.json'), JSON.stringify({ sha: 'bbbbbbb', at: STAMP.at }));
  assert.ok(verify(out).some((p) => /js\/build\.js and assets\/build\.json do not agree/.test(p)), 'two stamps that differ are a problem: ' + JSON.stringify(verify(out)));
  writeFileSync(join(out, 'assets/build.json'), JSON.stringify(STAMP)); assert.deepEqual(verify(out), [], 'and mended they are not');
});

test('with no stamp given the stage takes the commit the workflow is running (GITHUB_SHA) and the time now', () => {
  const was = process.env.GITHUB_SHA;
  process.env.GITHUB_SHA = 'abcdef0123456789abcdef0123456789abcdef01';
  try {
    const out = join(mkdtempSync(join(tmpdir(), 'pc-build-')), 'site');
    stage({ out, lastmod: '2026-10-30' });
    const b = JSON.parse(readFileSync(join(out, 'assets/build.json'), 'utf8'));
    assert.equal(b.sha, 'abcdef0');
    assert.ok(Math.abs(Date.parse(b.at) - Date.now()) < 120000, 'the time is now: ' + b.at);
    assert.match(b.at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    assert.match(readFileSync(join(out, 'js/build.js'), 'utf8'), /sha: 'abcdef0'/);
  } finally { if (was === undefined) delete process.env.GITHUB_SHA; else process.env.GITHUB_SHA = was; }
});

test('the menu and the title screen show the stamp', () => {
  const shell = read('js/ui/shell.js'), main = read('js/main.js');
  assert.match(shell, /import \{[^}]*\bstamp\b[^}]*\} from '\.\.\/build\.js'/);
  assert.match(shell, /id="m-build"/);
  assert.match(shell, /stamp\(\$\('#m-build', dlg\.el\)\)/);
  assert.doesNotMatch(main, /^import [^\n]*'\.\/build\.js'/m, 'the title screen does not import it statically: it is not needed for the first paint, and the first screen is at its budget');
  assert.match(main, /afterLoad\(\(\) => import\('\.\/build\.js'\)\.then\(\(\{ stamp \}\) => stamp\(\$\('#build-note', root\)\)\)/, 'and asks for it after the load event');
  assert.match(main, /id="build-note"/);
});
