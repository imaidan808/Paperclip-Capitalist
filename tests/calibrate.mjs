// node tests/calibrate.mjs [profile] [specialty] [seed]  -> prints a pacing table for a heuristic player.
import { makeGame, run } from './bot.mjs';

const [profile = 'bootstrapper', specialty = 'ops', seed = '7'] = process.argv.slice(2);
const g = makeGame(profile, specialty, +seed);
const rows = [];
const t0 = Date.now();
const marks = run(g, { onDay: (d, nw) => { if ([5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 70, 75, 80, 90].includes(d)) rows.push(`day ${String(d).padStart(2)}  NW $${Math.round(nw).toLocaleString().padStart(11)}  cash $${Math.round(g.s.cash).toLocaleString().padStart(10)}  debt $${Math.round(g.debt()).toLocaleString()}  pipes ${g.s.pipes.length}`); } });
console.log(rows.join('\n'));
console.log('milestones (day reached):', JSON.stringify(marks), '| trades', g.s.trades, '| audits fail/pass', g.s.auditFail, g.s.auditPass, '| EEI', g.eei().toFixed(1), '| creativity', g.creativityScore().toFixed(0), '| ms', Date.now() - t0);
