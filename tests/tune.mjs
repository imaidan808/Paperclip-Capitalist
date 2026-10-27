// node tests/tune.mjs '{"lotSlots":4,"cycleBase":72}' [perks] [every]  -> days to reach districts 5, 9, 13 and 16 over three seeds, for a given set of economy knobs.
import { ECON } from '../js/config.js';
import { makeGame, run } from './bot.mjs';
Object.assign(ECON, JSON.parse(process.argv[2] || '{}'));
const perks = (process.argv[3] || 'trades,pro').split(',').filter(Boolean), every = +(process.argv[4] || 4);
const rows = [];
for (const seed of [7, 8, 9]) {
  const g = makeGame(perks, 'ops', seed);
  const m = run(g, { every });
  rows.push([5, 9, 13, 16].map((z) => m[z] ?? '-').join(' / ') + `  NW ${Math.round(g.netWorth()).toLocaleString()}`);
}
console.log(JSON.stringify(ECON) + ` every=${every}\n  days to d5/d9/d13/d16: ` + rows.join('\n                        '));
