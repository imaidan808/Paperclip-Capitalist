// node tests/tune.mjs '{"lotSlots":4,"brokenLo":1.5,"pipe":{"scaleExp":0.7}}' [perkA,perkB] [every] [--no-managers]
// -> days to reach districts 5, 9, 13 and 16 and the day-90 net worth over three seeds, for a given set of economy knobs.
// Keys of the JSON are ECON knobs; the key "pipe" holds overrides of PIPE_RULES (the manager formulas' constants). --no-managers forbids hiring (the hand-play side of docs/BALANCE.md's comparison).
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ECON, PIPE_RULES } from '../js/config.js';
import { makeGame, run } from './bot.mjs';
import { parsePerks } from './calibrate.mjs';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { pipe, ...econ } = JSON.parse(process.argv[2] || '{}');
  Object.assign(ECON, econ); Object.assign(PIPE_RULES, pipe || {});
  const managers = !process.argv.includes('--no-managers');
  const args = process.argv.slice(3).filter((x) => !x.startsWith('--'));
  let perks;
  try { perks = parsePerks(args[0]); } catch (e) { console.error(e.message); process.exit(1); }
  const every = +(args[1] || 4);
  const rows = [];
  for (const seed of [7, 8, 9]) {
    const g = makeGame(perks, 'ops', seed);
    if (!managers) g.hirePipeline = () => ({ ok: false, msg: 'managers are forbidden in this run' });
    const m = run(g, { every });
    rows.push([5, 9, 13, 16].map((z) => m[z] ?? '-').join(' / ') + `  NW ${Math.round(g.netWorth()).toLocaleString()}`);
  }
  console.log(JSON.stringify({ ECON, PIPE_RULES }) + ` ${perks.join('+')} every=${every}${managers ? '' : ' no managers'}\n  days to d5/d9/d13/d16: ` + rows.join('\n                        '));
}
