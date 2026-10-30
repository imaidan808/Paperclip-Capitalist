// Did the art change what a click lands on? Compares two folders of hit grids made by scripts/world-shots.mjs --hits N.
//
//   node scripts/world-hits.mjs BEFORE_DIR AFTER_DIR [--max-share 0] [--only a,b] [--show 5] [--ignore lead,lot,asset]
//   node scripts/world-hits.mjs --pack DIR --build adcd991 [--skip tod-] > tests/fixtures/hits-adcd991.json     (the golden file tests/world-hits.test.mjs compares a build with)
//
// For each shot present in both folders (NAME.hits.json), world.pick() was asked at every Nth css pixel of the picture; a point that answers a different thing in the two builds (or nothing in one and something in the
// other) is a difference. The same camera, the same seed and the same clock: a presentation change that is only presentation leaves every point as it was (docs/RENDER_PLAN.md rule 1).
// Prints one line a shot (points, differing points, share) and the first few differences (the point and the two answers); exit 0 when the share of differing points is at most --max-share (default 0), 1 otherwise,
// 2 when there is nothing to compare.
import { readFileSync, readdirSync, existsSync } from 'node:fs';

/** The grid of answers of one hit file: [row][col] of `kind:id` strings ('-' for nothing). */
export function decode(h) {
  return h.rows.map((row) => row.flatMap(([i, n]) => Array(n).fill(h.legend[i])));
}

/**
 * Compare two decoded hit files. Returns { points, differing, share, first: [{ x, y, a, b }] } (x, y in css pixels), or { mismatch } when the grids are not the same shape.
 * `ignore` is a list of kinds ('lead', 'lot', 'asset'): a point where either side answers one of them is left out (those exist only where the game's state puts them, so a change to the engine's opening moves them).
 */
export function compare(a, b, show = 5, ignore = []) {
  const ga = decode(a), gb = decode(b), skip = new Set(ignore);
  if (a.step !== b.step || ga.length !== gb.length || ga.some((r, i) => r.length !== gb[i].length)) return { mismatch: `grid ${a.w}x${a.h} step ${a.step} against ${b.w}x${b.h} step ${b.step}` };
  let points = 0, differing = 0, left = 0; const first = [];
  ga.forEach((row, y) => row.forEach((k, x) => {
    const m = gb[y][x];
    if (skip.size && (skip.has(k.split(':')[0]) || skip.has(m.split(':')[0]))) { left++; return; }
    points++;
    if (k !== m) { differing++; if (first.length < show) first.push({ x: Math.round((x + 0.5) * a.step), y: Math.round((y + 0.5) * a.step), a: k, b: m }); }
  }));
  return { points, differing, left, share: points ? differing / points : 0, first };
}

/** The golden file: every hit file of a folder (but those whose name starts with `skip`), as { build, step, shots: { NAME: hit file } }. */
export function pack(dir, build, skip = '') {
  const shots = {}; let step = 0;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.hits.json')).sort()) {
    const name = f.slice(0, -'.hits.json'.length); if (skip && name.startsWith(skip)) continue;
    const h = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')); step = step || h.step; if (h.step !== step) throw new Error(`${name} has step ${h.step}, the others ${step}`);
    delete h.exact; shots[name] = h;
  }
  return { build, step, shots };
}

const argv = process.argv.slice(2), pos = [];
for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith('--')) i++; else pos.push(argv[i]); }
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const isMain = () => { try { return process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]; } catch { return false; } };
if (isMain() && argv.includes('--pack')) {
  const dir = arg('pack', ''), build = String(arg('build', ''));
  if (!dir || !existsSync(dir) || !build || build === 'true') { console.error('usage: node scripts/world-hits.mjs --pack DIR --build COMMIT [--skip tod-]'); process.exit(2); }
  process.stdout.write(JSON.stringify(pack(dir, build, arg('skip', '') === true ? '' : String(arg('skip', '')))) + '\n');
} else if (isMain()) {
  const [A, B] = pos;
  if (!A || !B || !existsSync(A) || !existsSync(B)) { console.error('usage: node scripts/world-hits.mjs BEFORE_DIR AFTER_DIR [--max-share 0] [--only a,b] [--show 5] [--ignore lead,lot,asset]'); process.exit(2); }
  const names = (d) => readdirSync(d).filter((f) => f.endsWith('.hits.json')).map((f) => f.slice(0, -'.hits.json'.length));
  const only = arg('only', null) ? new Set(String(arg('only')).split(',')) : null, inB = new Set(names(B));
  const shared = names(A).filter((n) => inB.has(n) && (!only || only.has(n)));
  if (!shared.length) { console.error('no shot has hit grids in both folders (shoot with --hits 24)'); process.exit(2); }
  const max = +arg('max-share', 0), show = +arg('show', 5), ignore = arg('ignore', '') && arg('ignore', '') !== true ? String(arg('ignore')).split(',') : [];
  let bad = 0, total = 0, diff = 0;
  for (const n of shared) {
    const r = compare(JSON.parse(readFileSync(`${A}/${n}.hits.json`, 'utf8')), JSON.parse(readFileSync(`${B}/${n}.hits.json`, 'utf8')), show, ignore);
    if (r.mismatch) { console.log(`${n.padEnd(26)} NOT COMPARABLE: ${r.mismatch}`); bad++; continue; }
    total += r.points; diff += r.differing;
    console.log(`${n.padEnd(26)} ${String(r.points).padStart(5)} points, ${String(r.differing).padStart(4)} differ (${(r.share * 100).toFixed(2)}%)`);
    for (const f of r.first) console.log(`    at ${f.x},${f.y}: before ${f.a}, after ${f.b}`);
    if (r.share > max) bad++;
  }
  console.log(`\n${shared.length} shots, ${total} points, ${diff} differ (${total ? ((diff / total) * 100).toFixed(3) : 0}%)${bad ? `: ${bad} shot(s) over the limit of ${(max * 100).toFixed(2)}%` : ''}`);
  process.exitCode = bad ? 1 : 0;
}
