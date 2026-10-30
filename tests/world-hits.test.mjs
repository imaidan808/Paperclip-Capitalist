// Presentation work must not move what a click lands on (docs/RENDER_PLAN.md rule 1): world.pick() answers as it did at adcd991, at every point of a grid over the picture.
// tests/fixtures/hits-adcd991.json holds those answers (15 shots, every 24th css pixel, dsf 1, the rig's default seed and clock): made by serving a worktree of adcd991, shooting it with
//   node scripts/world-shots.mjs --base http://localhost:8503 --out DIR --dsf 1 --hits 24     and packing it with     node scripts/world-hits.mjs --pack DIR --build adcd991 --skip tod- > tests/fixtures/hits-adcd991.json
//   H1  the comparison: a grid against itself is the same, a moved point is one difference, kinds that only the game's state puts on the picture (buyers, lots, stock) can be left out, a different grid is not comparable
//   H2  the golden file is what it says (from adcd991, 15 shots, step 24) and is not empty: it has the props, the district gates, the plots, and the buyers, lots and stock
//   H3  in Chrome: this build's shots, asked with the camera's own numbers (--exact-hits, as adcd991 asked), answer the same at every point; only the game's own state (a buyer, a lot) is left out
//   H4  and asked as the page asks (from the drawn picture's origin, which is rounded to whole device pixels so a click lands on what is drawn) at most 0.5% of the points answer differently: a point within half a device pixel of
//       a shape's edge. A shape that moved or changed size would flip far more.
// If the game's opening state changes on purpose (the engine's first buyers), the buyers, lots and stock are left out here, so this test does not move with it. If a hit shape changes on purpose (not presentation work), shoot the new
// build the same way and pack it again, and say so in the commit.
// Chrome is needed for H3 and H4 (skipped without it, or with PC_NO_BROWSER=1). Run: node --test tests/world-hits.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { createServer as netServer } from 'node:net';
import { decode, compare, pack } from '../scripts/world-hits.mjs';
import { BROWSER } from './helpers/lessonpage.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GOLD = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/hits-adcd991.json'), 'utf8'));
const STATE_KINDS = ['lead', 'lot', 'asset'];
const SHOTS = ['start-mid', 'start-close', 'city-close', 'island-mid', 'fog-near', 'fog-far'];

/** A hit file from rows of text: '.' is nothing, letters are things. */
const grid = (rows, step = 24) => { const legend = ['-']; const idx = new Map([['-', 0]]); const out = rows.map((r) => { const row = []; let last = -1, n = 0; for (const ch of r) { const k = ch === '.' ? '-' : 'static:' + ch; if (!idx.has(k)) { idx.set(k, legend.length); legend.push(k); } const i = idx.get(k); if (i === last) n++; else { if (n) row.push([last, n]); last = i; n = 1; } } if (n) row.push([last, n]); return row; }); return { step, w: rows[0].length * step, h: rows.length * step, legend, rows: out }; };

test('H1: compare() counts the points that answer differently, leaves out what the game\'s state puts on the picture, and refuses a grid of another shape', () => {
  const a = grid(['..aa..', '.bbbb.', '......']), same = grid(['..aa..', '.bbbb.', '......']), moved = grid(['..aa..', '.bbbb.', '..c...']);
  assert.deepEqual(decode(a)[1], ['-', 'static:b', 'static:b', 'static:b', 'static:b', '-'], 'runs are expanded to one answer a point');
  const same0 = compare(a, same); assert.equal(same0.points, 18); assert.equal(same0.differing, 0);
  const m = compare(a, moved); assert.equal(m.differing, 1); assert.deepEqual(m.first, [{ x: 60, y: 60, a: '-', b: 'static:c' }], 'and says where, in css pixels');
  const skipped = compare(a, moved, 5, ['static']);
  assert.equal(skipped.differing, 0, 'a kind that is left out is left out from either side'); assert.equal(skipped.left, 7, '(the 6 points of a and b, and the one that only the moved grid answers)'); assert.equal(skipped.points, 11, 'and the rest are compared');
  const bigger = grid(['..aa..', '.bbbb.']); assert.ok(compare(a, bigger).mismatch, 'a grid of another size is not comparable');
  const coarse = grid(['..aa..', '.bbbb.', '......'], 12); assert.ok(compare(a, coarse).mismatch, 'nor one of another step');
  // pack(): the golden file of a folder of hit files, leaving out the shots whose name starts with `skip`, and the note of how the grid was asked
  const dir = mkdtempSync(join(tmpdir(), 'pc-pack-'));
  for (const [n, g] of [['one', a], ['tod-two', moved], ['three', { ...same, exact: true }]]) writeFileSync(join(dir, `${n}.hits.json`), JSON.stringify(g));
  const p = pack(dir, 'abc1234', 'tod-'); assert.deepEqual(Object.keys(p.shots), ['one', 'three']); assert.equal(p.build, 'abc1234'); assert.equal(p.step, 24); assert.ok(!('exact' in p.shots.three), 'how the grid was asked is not part of the answers');
});

test('H2: the golden file is adcd991\'s answers, 15 shots every 24th pixel, with the props, the gates, the plots and the game\'s own things in it', () => {
  assert.equal(GOLD.build, 'adcd991'); assert.equal(GOLD.step, 24);
  assert.equal(Object.keys(GOLD.shots).length, 15, Object.keys(GOLD.shots).join(' '));
  for (const [name, h] of Object.entries(GOLD.shots)) { assert.equal(h.step, 24, name); assert.equal(h.legend[0], '-', name); assert.equal(h.rows.length, Math.ceil((h.h - 12) / 24), `${name}: a row for every 24th pixel of the ${h.h} px picture`); }
  const kinds = {}; let points = 0;
  for (const h of Object.values(GOLD.shots)) for (const row of h.rows) for (const [i, n] of row) { const k = h.legend[i].split(':')[0]; kinds[k] = (kinds[k] || 0) + n; points += n; }
  assert.ok(points > 30000, `a grid of ${points} points`);
  for (const k of ['static', 'zone', 'plot', 'lead', 'lot', 'asset']) assert.ok(kinds[k] > 0, `${k} is in the golden file (${JSON.stringify(kinds)})`);
  assert.ok(kinds.static > 500 && kinds.zone > 100 && kinds.plot > 50, 'and enough of the layout\'s own shapes for a moved one to show');
});

// ====================================================================================================================================
// H3, H4. In Chrome: the rig draws this build and asks world.pick() at every 24th pixel
// ====================================================================================================================================
const serve = async () => { const { createServer } = await import('node:http'), { handler } = await import('../server/static.mjs'), server = createServer(handler); await new Promise((ok) => server.listen(0, '127.0.0.1', ok)); return { base: `http://127.0.0.1:${server.address().port}`, close: async () => { server.closeAllConnections?.(); await new Promise((ok) => server.close(ok)); } }; };
const freePort = () => new Promise((res) => { const s = netServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const run = (args) => new Promise((ok, no) => execFile(process.execPath, [join(ROOT, 'scripts/world-shots.mjs'), ...args], { cwd: ROOT, timeout: 540000, maxBuffer: 1 << 24 }, (err, out, errOut) => (err ? no(new Error(`${err.message}\n${out}\n${errOut}`)) : ok(out))));
const shoot = async (base, exact) => {
  const out = mkdtempSync(join(tmpdir(), 'pc-hits-'));
  await run(['--base', base, '--out', out, '--dsf', '1', '--set', SHOTS.join(','), '--hits', '24', ...(exact ? ['--exact-hits'] : []), '--cdp', String(await freePort())]);
  return out;
};
const against = (dir, ignore) => {
  let points = 0, differing = 0; const first = [];
  for (const name of SHOTS) {
    const f = join(dir, `${name}.hits.json`); assert.ok(existsSync(f), `${name} was shot`);
    const r = compare(GOLD.shots[name], JSON.parse(readFileSync(f, 'utf8')), 4, ignore); assert.ok(!r.mismatch, `${name}: ${r.mismatch}`);
    points += r.points; differing += r.differing; for (const d of r.first) first.push({ name, ...d });
  }
  return { points, differing, first };
};

test('H3: in Chrome this build answers as adcd991 did, point for point, from the camera\'s own numbers', { skip: !BROWSER && 'no Chrome here (H1 and H2 hold the tool and the file)', timeout: 600000 }, async () => {
  const b = await serve();
  try {
    const dir = await shoot(b.base, true), r = against(dir, STATE_KINDS);
    assert.ok(r.points > 10000, `${r.points} points compared`);
    assert.equal(r.differing, 0, `a hit shape is not where it was at adcd991: ${JSON.stringify(r.first)}`);
  } finally { await b.close(); }
});

test('H4: and as the page asks, from the drawn picture\'s whole-pixel origin, at most 0.5% of the points differ (an edge within half a device pixel)', { skip: !BROWSER && 'no Chrome here (H1 and H2 hold the tool and the file)', timeout: 600000 }, async () => {
  const b = await serve();
  try {
    const dir = await shoot(b.base, false), r = against(dir, STATE_KINDS);
    assert.ok(r.differing / r.points <= 0.005, `${r.differing} of ${r.points} points answer differently from adcd991 (${(100 * r.differing / r.points).toFixed(2)}%): ${JSON.stringify(r.first)}`);
  } finally { await b.close(); }
});
