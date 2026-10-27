// node tests/calibrate.mjs [perkA,perkB] [specialty] [seed]  -> prints a pacing table for a heuristic player.
import { makeGame, run } from './bot.mjs';

const [perks = '', specialty = 'ops', seed = '7'] = process.argv.slice(2);
const g = makeGame(perks ? perks.split(',') : [], specialty, +seed);
const rows = [];
const t0 = Date.now();
const marks = run(g, { onDay: (d, nw) => { if ([3, 5, 8, 10, 15, 20, 25, 30, 40, 45, 50, 60, 70, 75, 80, 90].includes(d)) rows.push(`day ${String(d).padStart(2)}  NW $${Math.round(nw).toLocaleString().padStart(11)}  cash $${Math.round(g.s.cash).toLocaleString().padStart(10)}  debt $${Math.round(g.debt()).toLocaleString()}  pipes ${g.s.pipes.length}  zones ${g.s.zones.length}`); } });
console.log(rows.join('\n'));
console.log('district reached on day:', JSON.stringify(marks));
console.log('trades', g.s.trades, '| level', g.level(), '| audits fail/pass', g.s.auditFail, g.s.auditPass, '| EEI', g.eei().toFixed(1), '| creativity', g.creativityScore().toFixed(0), '| ms', Date.now() - t0);
