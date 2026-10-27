// node tests/balance.mjs [seeds=2] [every=4]  -> plays all 66 pairs of Backgrounds with the heuristic bot and reports the day each pair reaches districts 5, 9 and 13
// (docs/V2_DESIGN.md section 11: no pair may deviate from the median milestone day by more than 35%).
import { PERK_PAIRS } from '../js/data/perks.js';
import { makeGame, run } from './bot.mjs';

const seeds = +(process.argv[2] || 2), every = +(process.argv[3] || 4);
const gates = [5, 9, 13];
const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const rows = [];
for (const [a, b] of PERK_PAIRS) {
  const days = gates.map(() => []);
  let nw = 0;
  for (let k = 0; k < seeds; k++) {
    const g = makeGame([a, b], ['ops', 'growth', 'fintech'][k % 3], 100 + k * 17);
    const m = run(g, { every });
    gates.forEach((z, i) => days[i].push(m[z] ?? 91));
    nw += g.netWorth() / seeds;
  }
  rows.push({ pair: a + '+' + b, d: days.map(med), nw });
}
const base = gates.map((_, i) => med(rows.map((r) => r.d[i])));
const out = rows.map((r) => ({ ...r, dev: r.d.map((x, i) => x / base[i] - 1) })).sort((x, y) => Math.max(...y.dev.map(Math.abs)) - Math.max(...x.dev.map(Math.abs)));
console.log('median day to districts 5 / 9 / 13:', base.join(' / '));
for (const r of out.slice(0, 14)) console.log(r.pair.padEnd(22), r.d.map((x) => String(x).padStart(3)).join(' / '), ' dev', r.dev.map((x) => (x * 100).toFixed(0).padStart(4) + '%').join(' '), ' NW', Math.round(r.nw).toLocaleString());
const bad = out.filter((r) => r.dev.some((x) => Math.abs(x) > 0.35));
console.log(`${bad.length} of ${rows.length} pairs deviate more than 35% from the median on some milestone`);
