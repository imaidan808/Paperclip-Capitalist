// node tests/calibrate.mjs [perkA,perkB] [specialty] [seed]  -> prints a pacing table for a heuristic player.
// A v2 player always starts with exactly two Backgrounds (docs/V2_DESIGN.md section 2), so the default is a legal pair, not an empty list.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PERKS } from '../js/data/perks.js';
import { makeGame, run } from './bot.mjs';

export const DEFAULT_PERKS = ['trades', 'pro'];
/** 'a,b' -> ['a', 'b']. Throws on anything the engine would silently drop: an unknown Background id, a repeat, or not exactly two. */
export function parsePerks(arg) {
  const ids = String(arg ?? DEFAULT_PERKS.join(',')).split(',').map((x) => x.trim()).filter(Boolean);
  const bad = ids.filter((id) => !Object.prototype.hasOwnProperty.call(PERKS, id));
  if (bad.length) throw new Error(`Unknown Background id${bad.length > 1 ? 's' : ''}: ${bad.join(', ')}. Choose two of: ${Object.keys(PERKS).join(', ')}.`);
  if (ids.length !== 2 || new Set(ids).size !== 2) throw new Error(`A start needs exactly two different Backgrounds, got "${ids.join(',')}". Example: ${DEFAULT_PERKS.join(',')}.`);
  return ids;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let perks;
  try { perks = parsePerks(process.argv[2]); } catch (e) { console.error(e.message); process.exit(1); }
  const [, specialty = 'ops', seed = '7'] = process.argv.slice(2);
  const g = makeGame(perks, specialty, +seed);
  const rows = [];
  const t0 = Date.now();
  console.log(`Backgrounds ${perks.join(' + ')} | specialty ${specialty} | seed ${seed}`);
  const marks = run(g, { onDay: (d, nw) => { if ([3, 5, 8, 10, 15, 20, 25, 30, 40, 45, 50, 60, 70, 75, 80, 90].includes(d)) rows.push(`day ${String(d).padStart(2)}  NW $${Math.round(nw).toLocaleString().padStart(11)}  cash $${Math.round(g.s.cash).toLocaleString().padStart(10)}  debt $${Math.round(g.debt()).toLocaleString()}  pipes ${g.s.pipes.length}  districts ${g.s.zones.length}`); } });
  console.log(rows.join('\n'));
  console.log('district reached on day:', JSON.stringify(marks));
  console.log('trades', g.s.trades, '| level', g.level(), '| audits fail/pass', g.s.auditFail, g.s.auditPass, '| EEI', g.eei().toFixed(1), '| creativity', g.creativityScore().toFixed(0), '| ms', Date.now() - t0);
}
