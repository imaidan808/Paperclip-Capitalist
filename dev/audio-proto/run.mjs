// node dev/audio-proto/run.mjs
// Serves this folder, drives headless Chrome (scripts/cdp.mjs), renders every recipe offline twice (trim 0, then calibrated), writes trims.json here and the full result to $AUDIO_OUT
// (default: the OS temp folder, audio-proto-result.json). audit.mjs then checks the recipe data against that result. docs/AUDIO.md, "Test plan", says what each number means.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
const here = fileURLToPath(new URL('.', import.meta.url));
const { launch, open } = await import(new URL('../../scripts/cdp.mjs', import.meta.url).href);
const RESULT = process.env.AUDIO_OUT || join(tmpdir(), 'audio-proto-result.json');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };
const PORT = 8791, CDP = 9361;
const srv = createServer(async (q, r) => { try { const p = q.url.split('?')[0]; const f = join(here, p === '/' ? 'audition.html' : p); const b = await readFile(f); r.writeHead(200, { 'content-type': types[extname(f)] || 'text/plain', 'cache-control': 'no-store' }); r.end(b); } catch { r.writeHead(404); r.end(); } }).listen(PORT, '127.0.0.1');
const b = await launch(CDP);
let out = {};
try {
  const p = await open(b, `http://127.0.0.1:${PORT}/audition.html`);
  const call = (expr) => p.eval(`(async()=>{const m=await import('/measure.js');return JSON.stringify(await (${expr}))})()`).then(JSON.parse);
  const TARGET = { tiny: -30, medium: -24, loud: -19, amb: -32 }, CEILS = { tiny: -6, medium: -6, loud: -5, amb: -6 };
  let rows = await call('m.run({})'.replace('m.', 'm.'));
  // (the arrow above is evaluated inside the page where `m` is the module)
  const trims = {};
  for (const r of rows) { let t = TARGET[r.tier] - r.level; if (r.peak + t > CEILS[r.tier]) { t = CEILS[r.tier] - r.peak; r.limited = true; } trims[r.key] = Math.round(t * 10) / 10; }
  const rows2 = await call(`m.run(${JSON.stringify(trims)})`);
  for (const r of rows2) r.limited = rows.find((x) => x.key === r.key).limited || false;
  const beds0 = await call('m.runBeds({})');
  const btrims = {}; for (const r of beds0) btrims[r.key] = Math.round((-28 - r.level) * 10) / 10;
  const beds = await call(`m.runBeds({}, ${JSON.stringify(btrims)})`);
  const worstSets = { all: ['level.up#l','milestone#m3','alert.margin-call#m','zone.open#t4','achievement#epic','cash.in#xl','sale.pioneer#p','run.end#done','acad.graduate#g','alert.shock#tiktok','bank.repay#free','draft.begin#b'], two: ['level.up#l','achievement#epic'], pair: ['alert.margin-call#m','alert.insolvent#i'], mix: ['level.up#l','sale.win#w','cash.in#m','ui.tick#full','manager.cycle#gain','deal.result#good','quest.complete#quest','streak#n6'] };
  const mk = await call('m.makeupGain()'); const worst = { makeup: mk };
  for (const [k, names] of Object.entries(worstSets)) { worst[k] = { master1: await call(`m.worst(${JSON.stringify(names)}, { trims: ${JSON.stringify(trims)}, master: 1, makeup: ${1 / mk} })`), master49: await call(`m.worst(${JSON.stringify(names)}, { trims: ${JSON.stringify(trims)}, master: 0.49, makeup: ${1 / mk} })`), raw: await call(`m.worst(${JSON.stringify(names)}, { trims: ${JSON.stringify(trims)}, master: 1, makeup: ${1 / mk}, noclip: true })`), n: names.length }; }
  const bal = await call('m.balance()');
  const fp = await call('m.fingerprints()');
  const pairs = []; for (let i = 0; i < fp.length; i++) for (let j = i + 1; j < fp.length; j++) { if (fp[i].key.split('#')[0] === fp[j].key.split('#')[0]) continue; let d = 0; for (let k = 0; k < fp[i].f.length; k++) d += (fp[i].f[k] - fp[j].f[k]) ** 2; pairs.push([Math.sqrt(d / fp[i].f.length), fp[i].key, fp[j].key]); }
  pairs.sort((a, b) => a[0] - b[0]);
  out = { closest: pairs.slice(0, 14), rows: rows2, trims, beds, btrims, rows0: rows, bal, worst };
  await writeFile(RESULT, JSON.stringify(out, null, 1));
  await writeFile(join(here, 'trims.json'), JSON.stringify({ makeup: worst.makeup, sounds: trims, beds: Object.fromEntries(Object.entries(btrims).filter(([k]) => !k.includes('+'))) }, null, 1) + '\n');
  console.log('rows', rows2.length, 'beds', beds.length, '->', RESULT);
} catch (e) { console.error('FAILED', e.message); process.exitCode = 1; } finally { b.close(); srv.close(); }
