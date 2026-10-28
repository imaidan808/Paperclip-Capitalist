// node tests/balance.mjs [seeds=5] [every=4] [--no-managers]  -> plays all 66 pairs of Backgrounds with the heuristic bot and reports the day each pair reaches districts 5, 9 and 13
// (--no-managers plays the same bot with hiring forbidden: the hand-play side of the managers-versus-hand comparison in docs/BALANCE.md)
// (docs/V2_DESIGN.md section 11: the target is that no pair deviates from the median milestone day by more than 35%; this script REPORTS the pairs that do, it is not a CI gate).
// It also reports where the whole table ends up: how many runs reach district 16, the day-90 net worth percentiles, and how far apart the pairs' net worths are. The milestone days alone cannot see a late game
// that runs away (most runs in district 16 and a spread of net worth far past three passed it unnoticed once): `lateGame()` is what tests/audit-repair.test.mjs and tests/remaining-balance.test.mjs hold to bounds on a sample of the pairs.
// Five seeds is the least that tells a slow pair from a bad draw: with two, the median is the mean of two runs and one wipe-out reads as "200% slow".
// A run that ends with no cash, no stock and no managers is a wipe-out. It is counted in its own column and left out of the days, because it did not run slowly, it stopped.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PERK_PAIRS } from '../js/data/perks.js';
import { makeGame, run } from './bot.mjs';

export const DEFAULT_SEEDS = 5, DEFAULT_EVERY = 4, GATES = [5, 9, 13];
export const pctile = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const wipedOut = (g) => g.s.cash < 1 && !g.s.assets.length && !g.s.pipes.length;

/** Plays `pairs` (default: all 66) and returns the rows, sorted worst deviation first, plus the totals the last line prints. */
export function balance({ seeds = DEFAULT_SEEDS, every = DEFAULT_EVERY, pairs = PERK_PAIRS, managers = true } = {}) {
  const rows = [];
  for (const [a, b] of pairs) {
    const days = GATES.map(() => []);
    let nw = 0, wiped = 0;
    const ends = [];
    for (let k = 0; k < seeds; k++) {
      const g = makeGame([a, b], ['ops', 'growth', 'fintech'][k % 3], 100 + k * 17);
      if (!managers) g.hirePipeline = () => ({ ok: false, msg: 'managers are forbidden in this run' }); // an own property shadows the method for this game only
      const m = run(g, { every });
      if (wipedOut(g)) { wiped++; continue; }
      GATES.forEach((z, i) => days[i].push(m[z] ?? 91)); // 91: never got there in 90 days
      nw += g.netWorth();
      ends.push({ nw: g.netWorth(), d16: m[16] ?? 91 });
    }
    const live = seeds - wiped;
    rows.push({ pair: a + '+' + b, d: days.map((x) => (x.length ? med(x) : null)), nw: live ? nw / live : 0, wiped, ends });
  }
  const base = GATES.map((_, i) => med(rows.map((r) => r.d[i]).filter((x) => x != null)));
  const out = rows.map((r) => ({ ...r, dev: r.d.map((x, i) => (x == null ? 0 : x / base[i] - 1)) }))
    .sort((x, y) => Math.max(...y.dev.map(Math.abs)) - Math.max(...x.dev.map(Math.abs)));
  const bad = out.filter((r) => r.dev.some((x) => Math.abs(x) > 0.35));
  return { rows: out, base, bad, late: lateGame(out), wipedRuns: out.reduce((n, r) => n + r.wiped, 0), wipedPairs: out.filter((r) => r.wiped).length, runs: rows.length * seeds };
}

/** The late game of a set of rows: the share of runs that reach district 16 by day 90, the day-90 net worth percentiles over all runs, and how many pairs' mean net worth sits outside half to double the median pair's. */
export function lateGame(rows) {
  const ends = rows.flatMap((r) => r.ends), nws = ends.map((e) => e.nw), pairNw = rows.filter((r) => r.nw > 0).map((r) => r.nw), mid = med(pairNw);
  return {
    runs: ends.length, d16: ends.filter((e) => e.d16 <= 90).length, d16Share: ends.length ? ends.filter((e) => e.d16 <= 90).length / ends.length : 0,
    nwP10: pctile(nws, 0.1), nwP50: med(nws), nwP90: pctile(nws, 0.9), spread: nws.length ? pctile(nws, 0.9) / Math.max(1, pctile(nws, 0.1)) : 0,
    pairsOutsideNw: pairNw.filter((x) => x < mid * 0.5 || x > mid * 2).length, pairs: pairNw.length,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const nums = process.argv.slice(2).filter((x) => !x.startsWith('--'));
  const seeds = +(nums[0] || DEFAULT_SEEDS), every = +(nums[1] || DEFAULT_EVERY), managers = !process.argv.includes('--no-managers');
  const r = balance({ seeds, every, managers });
  console.log(`${seeds} seeds, a decision every ${every} hours${managers ? '' : ', managers forbidden'}. Median day to districts 5 / 9 / 13:`, r.base.join(' / '));
  console.log('pair'.padEnd(22), 'day d5 / d9 / d13', '  deviation from the median'.padEnd(34), ' mean NW'.padEnd(12), 'wipe-outs');
  for (const x of r.rows.slice(0, 14)) console.log(x.pair.padEnd(22), x.d.map((d) => (d == null ? '  -' : String(d).padStart(3))).join(' / '), ' dev', x.dev.map((d) => (d * 100).toFixed(0).padStart(4) + '%').join(' '), ' NW', Math.round(x.nw).toLocaleString().padStart(10), ' ', x.wiped ? `${x.wiped} of ${seeds}` : '0');
  console.log(`${r.bad.length} of ${r.rows.length} pairs deviate more than 35% from the median on some milestone`);
  console.log(`${r.wipedRuns} of ${r.runs} runs were wipe-outs (${r.wipedPairs} pairs), counted apart from the days above`);
  const L = r.late, $ = (x) => Math.round(x).toLocaleString();
  console.log(`late game: ${L.d16} of ${L.runs} runs reached district 16 (${(L.d16Share * 100).toFixed(0)}%; the design says only strong play gets there by day 85); day-90 net worth p10 / p50 / p90 = ${$(L.nwP10)} / ${$(L.nwP50)} / ${$(L.nwP90)} (${L.spread.toFixed(1)}x apart); ${L.pairsOutsideNw} of ${L.pairs} pairs have a mean net worth outside half to double the median pair's`);
}
