// T5 raster quality, measured on the real world in headless Chrome (scripts/world-raster.mjs): no crack is left in the ground chunks at any zoom, a pan moves the ground, the sprites and the labels as one rigid
// picture, a picture settles to what it was, and the canvas pixels the world holds stay under the 160 MB ceiling. Skipped where there is no Chrome (PC_NO_BROWSER=1 skips it too), like every Chrome-driven check here.
// The numbers it holds are the build's own against the baseline's (docs/RENDER_PLAN.md section 9: `adcd991`): the old ground had 79,350 strict crack pixels and 616,613 closable gaps over this grid of zooms and
// densities, and its pan was 0.9 to 1.8% non-rigid at the coast and 0.8 to 1.1% at the finest zoom.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as net } from 'node:net';
import { fileURLToPath } from 'node:url';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', BROWSER = !process.env.PC_NO_BROWSER && existsSync(CHROME);
const freePort = () => new Promise((res) => { const s = net(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const SCRIPT = fileURLToPath(new URL('../scripts/world-raster.mjs', import.meta.url));

async function measure(args, ms = 420000) {
  const { handler } = await import('../server/static.mjs'), server = createServer(handler); await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const out = join(mkdtempSync(join(tmpdir(), 'pc-raster-')), 'r.json'), cdp = await freePort();
  try {
    const child = spawn(process.execPath, [SCRIPT, '--base', `http://127.0.0.1:${server.address().port}`, '--cdp', String(cdp), '--out', out, ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; child.stderr.on('data', (d) => { err += d; });
    const code = await new Promise((ok) => { const t = setTimeout(() => { child.kill('SIGKILL'); ok(-1); }, ms); child.on('exit', (c) => { clearTimeout(t); ok(c); }); });
    assert.ok(existsSync(out), `the measurement wrote nothing (exit ${code}): ${err.slice(-400)}`);
    return { code, json: JSON.parse(readFileSync(out, 'utf8')) };
  } finally { await new Promise((ok) => server.close(ok)); rmSync(join(out, '..'), { recursive: true, force: true }); }
}

test('cracks: the ground the old path draws has tens of thousands of gap pixels at the far zooms; the chunks the world stamps have none, at every density', { skip: !BROWSER, timeout: 500000 }, async () => {
  const { code, json } = await measure(['--only', 'cracks', '--dsf', '1,1.5,2']);
  assert.equal(code, 0, 'the gate: ' + json.failed.join('; '));
  const s = json.summary; assert.equal(s.gapsChunks, 0, 'no closable gap is left in any chunk'); assert.ok(s.gapsDirect > 100000, 'and the metric sees what it is meant to see in the unsealed ground: ' + s.gapsDirect);
  assert.ok(s.cracksChunks < s.cracksDirect * 0.2, `the strict crack count (any partial pixel inside an opaque field) falls to a fraction: ${s.cracksChunks} of ${s.cracksDirect}`);
  for (const r of json.cracks.filter((q) => q.zoom <= 0.5)) assert.equal(r.chunkGaps, 0, `dsf ${r.dsf}, zoom ${r.zoom}, ${r.scene}`);
});

test('pan, settle and memory: every frame of a quarter-pixel pan is the first frame moved by whole pixels; the picture while a pan is in progress is the picture at rest; the ledger is under 160 MB', { skip: !BROWSER, timeout: 500000 }, async () => {
  const { code, json } = await measure(['--only', 'pan,settle,memory', '--dsf', '2']);
  assert.equal(code, 0, 'the gate: ' + json.failed.join('; '));
  for (const r of json.pan) assert.ok(r.rigidShare < 0.005, `${r.scene} at dsf ${r.dsf}: ${(r.rigidShare * 100).toFixed(3)}% of the pixels are not rigid (the old build: 0.9% at the coast, 0.3% in a district, 0.8% at the finest zoom)`);
  const fin = json.pan.find((r) => /finest/.test(r.scene)); assert.ok(fin.rigidShare < 0.0005, 'the finest zoom is rigid to 0.05%: ' + fin.rigidShare);
  for (const r of json.settle) { assert.equal(r.valid, true, 'every visible chunk baked'); assert.ok(r.share < 0.01, `${r.scene}: ${(r.share * 100).toFixed(2)}% of the pixels change between the picture during a pan and the picture at rest`); }
  assert.ok(json.memory.total <= 160, 'the pixel ledger holds ' + json.memory.total + ' MB: ' + JSON.stringify(json.memory.entries));
});
