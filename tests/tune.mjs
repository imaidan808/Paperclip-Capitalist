// node tests/tune.mjs '{"lotSlots":4,"cycleBase":72}' [perkA,perkB] [every]  -> days to reach districts 5, 9, 13 and 16 over three seeds, for a given set of economy knobs.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ECON } from '../js/config.js';
import { makeGame, run } from './bot.mjs';
import { parsePerks } from './calibrate.mjs';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Object.assign(ECON, JSON.parse(process.argv[2] || '{}'));
  let perks;
  try { perks = parsePerks(process.argv[3]); } catch (e) { console.error(e.message); process.exit(1); }
  const every = +(process.argv[4] || 4);
  const rows = [];
  for (const seed of [7, 8, 9]) {
    const g = makeGame(perks, 'ops', seed);
    const m = run(g, { every });
    rows.push([5, 9, 13, 16].map((z) => m[z] ?? '-').join(' / ') + `  NW ${Math.round(g.netWorth()).toLocaleString()}`);
  }
  console.log(JSON.stringify(ECON) + ` ${perks.join('+')} every=${every}\n  days to d5/d9/d13/d16: ` + rows.join('\n                        '));
}
