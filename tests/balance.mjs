// node tests/balance.mjs [seeds=5] [every=4]  -> plays all 66 pairs of Backgrounds with the heuristic bot and reports the day each pair reaches districts 5, 9 and 13
// (docs/V2_DESIGN.md section 11: no pair may deviate from the median milestone day by more than 35%).
// Five seeds is the least that tells a slow pair from a bad draw: with two, the median is the mean of two runs and one wipe-out reads as "200% slow".
// A run that ends with no cash, no stock and no managers is a wipe-out. It is counted in its own column and left out of the days, because it did not run slowly, it stopped.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PERK_PAIRS } from '../js/data/perks.js';
import { makeGame, run } from './bot.mjs';

export const DEFAULT_SEEDS = 5, DEFAULT_EVERY = 4, GATES = [5, 9, 13];
const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const wipedOut = (g) => g.s.cash < 1 && !g.s.assets.length && !g.s.pipes.length;

/** Plays `pairs` (default: all 66) and returns the rows, sorted worst deviation first, plus the totals the last line prints. */
export function balance({ seeds = DEFAULT_SEEDS, every = DEFAULT_EVERY, pairs = PERK_PAIRS } = {}) {
  const rows = [];
  for (const [a, b] of pairs) {
    const days = GATES.map(() => []);
    let nw = 0, wiped = 0;
    for (let k = 0; k < seeds; k++) {
      const g = makeGame([a, b], ['ops', 'growth', 'fintech'][k % 3], 100 + k * 17);
      const m = run(g, { every });
      if (wipedOut(g)) { wiped++; continue; }
      GATES.forEach((z, i) => days[i].push(m[z] ?? 91)); // 91: never got there in 90 days
      nw += g.netWorth();
    }
    const live = seeds - wiped;
    rows.push({ pair: a + '+' + b, d: days.map((x) => (x.length ? med(x) : null)), nw: live ? nw / live : 0, wiped });
  }
  const base = GATES.map((_, i) => med(rows.map((r) => r.d[i]).filter((x) => x != null)));
  const out = rows.map((r) => ({ ...r, dev: r.d.map((x, i) => (x == null ? 0 : x / base[i] - 1)) }))
    .sort((x, y) => Math.max(...y.dev.map(Math.abs)) - Math.max(...x.dev.map(Math.abs)));
  const bad = out.filter((r) => r.dev.some((x) => Math.abs(x) > 0.35));
  return { rows: out, base, bad, wipedRuns: out.reduce((n, r) => n + r.wiped, 0), wipedPairs: out.filter((r) => r.wiped).length, runs: rows.length * seeds };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const seeds = +(process.argv[2] || DEFAULT_SEEDS), every = +(process.argv[3] || DEFAULT_EVERY);
  const r = balance({ seeds, every });
  console.log(`${seeds} seeds, a decision every ${every} hours. Median day to districts 5 / 9 / 13:`, r.base.join(' / '));
  console.log('pair'.padEnd(22), 'day d5 / d9 / d13', '  deviation from the median'.padEnd(34), ' mean NW'.padEnd(12), 'wipe-outs');
  for (const x of r.rows.slice(0, 14)) console.log(x.pair.padEnd(22), x.d.map((d) => (d == null ? '  -' : String(d).padStart(3))).join(' / '), ' dev', x.dev.map((d) => (d * 100).toFixed(0).padStart(4) + '%').join(' '), ' NW', Math.round(x.nw).toLocaleString().padStart(10), ' ', x.wiped ? `${x.wiped} of ${seeds}` : '0');
  console.log(`${r.bad.length} of ${r.rows.length} pairs deviate more than 35% from the median on some milestone`);
  console.log(`${r.wipedRuns} of ${r.runs} runs were wipe-outs (${r.wipedPairs} pairs), counted apart from the days above`);
}
