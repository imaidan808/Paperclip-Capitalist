#!/usr/bin/env node
// Prints the island's road catalog: what is wrong with the roads, the footpaths and the locked entries, as the detector of scripts/lib/road-audit.mjs reads it from js/world/layout.js. Read-only; built-ins only; run by hand.
//
//   node scripts/road-audit.mjs                   the summary: the ratchet counts, the defect classes, every dead end, seam, crossing, footpath and locked entry (about 0.6 s)
//   node scripts/road-audit.mjs --json [FILE]     the whole catalog as JSON, to FILE (`-` or nothing: to the standard output). 170 KB, with the plan's proposals, the district matrix and ten minutes of traffic
//   node scripts/road-audit.mjs --fast            leave out the proposals, the connectivity and the traffic (what the ratchet test runs)
//   node scripts/road-audit.mjs --root DIR        audit another checkout (a worktree of another commit); PC_ROOT does the same
//
// tests/world-roads-audit.test.mjs holds the counts printed under "ratchet": they may only go down. When a change lowers one, this prints it and the test says which constant to lower.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadWorld, auditRoads, ROOT } from './lib/road-audit.mjs';

const argv = process.argv.slice(2), has = (k) => argv.includes('--' + k), val = (k) => { const i = argv.indexOf('--' + k); return i < 0 || argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? null : argv[i + 1]; };
if (has('help') || has('h')) { console.log(process.argv[1] + ': see the head of this file'); process.exit(0); }
const root = resolve(val('root') || process.env.PC_ROOT || ROOT), full = !has('fast');
const catalog = auditRoads(await loadWorld(root), { full });

if (has('json')) {
  const file = val('json'), text = JSON.stringify(catalog, null, 1) + '\n';
  if (!file || file === '-') process.stdout.write(text); else { writeFileSync(file, text); console.error(`road catalog: ${(text.length / 1024).toFixed(0)} KB -> ${file}`); }
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n), T = catalog.counts.total;
console.log(`road audit of ${catalog.meta.checkout} at ${catalog.meta.head} (${catalog.meta.mode})`);
console.log(`looked at: ${catalog.scope.ports} ports, ${catalog.scope.edges} edges (${catalog.scope.roadEdges} roads, ${catalog.scope.pathEdges} footpaths, ${catalog.scope.ferryEdges} ferry), ${catalog.scope.edgePairs} pairs of edges, ${catalog.scope.samples} samples along them`);
console.log('\nratchet (tests/world-roads-audit.test.mjs: these may only go down)');
for (const [k, v] of Object.entries(catalog.ratchet)) console.log('  ' + pad(k, 24) + v);
console.log('\ndefect classes');
for (const c of catalog.defectClasses) console.log(`  ${pad(c.id, 4)}${pad(c.count + (typeof c.of === 'number' ? ' of ' + c.of : ''), 12)}${c.name}\n        ${c.detail}`);
console.log(`\ndead ends (${catalog.deadEnds.length}): the port, what lies beyond it, what stands in its way${full ? ', what the plan\'s rule would put there' : ''}`);
for (const d of catalog.deadEnds) console.log(`  ${pad(d.port, 6)}${pad(d.theme, 11)}${pad(d.beyond.kind + (d.beyond.at ? ' at ' + d.beyond.at : ''), 18)}${pad(d.terminator, 18)}${d.continuesAs ? d.continuesAs + ' ' : ''}${d.proposal ? '-> ' + d.proposal.kind : ''}`);
console.log(`\nterminations (${catalog.terminations.length}): the end of every street no road leaves: the port, what stands there, why, how many props, where a car turns`);
for (const t of catalog.terminations) console.log(`  ${pad(t.port, 6)}${pad(t.kind, 11)}${pad(t.authored ? 'by hand' : 'derived', 9)}${pad(t.props.length + ' props' + (t.door ? ', a dock door' : ''), 18)}${t.turnSpot ? (t.turnSpot.open ? 'turn r ' + t.turnSpot.r : 'closed') : 'NO TURN SPOT'}  ${t.why}`);
console.log(`\ngates (${T.gates}): ${T.gatesAwayFromOpenEnd} more than 3.5 tiles from the open end of their road`);
for (const g of catalog.gatesAwayFromOpenEnd) console.log(`  ${pad(g.road, 10)}district ${g.district} (${g.gateKind}), ${g.tilesFromOpenEnd} tiles from the open end`);
console.log(`\nseam runs (${T.seamRuns}, and ${T.coincidentStems} stems drawn twice)`);
for (const s of catalog.seams.filter((x) => x.kind !== 'coincident')) console.log(`  ${pad(s.a, 10)}x ${pad(s.b, 10)}${pad(s.kind, 9)}${pad(s.pair, 10)}${pad(s.lengthTiles + ' tiles', 11)}at (${s.mid.gx}, ${s.mid.gy})`);
console.log(`\ncrossings with no junction (${T.crossingsWithNoJunction})`);
for (const c of catalog.crossings) console.log(`  ${pad(c.a, 10)}x ${pad(c.b, 10)}${c.angle} degrees at (${c.at.gx}, ${c.at.gy})`);
console.log(`\nfootpaths (${T.footpaths}): the tiles over asphalt, where each ends`);
for (const f of catalog.footpaths) console.log(`  ${pad(f.from + ' > ' + f.to, 12)}${pad(f.lengthTiles + ' tiles', 11)}${pad(f.tilesOverAsphalt + ' over asphalt', 18)}ends on a ${f.end.kind} at (${f.end.gx}, ${f.end.gy}), ${f.end.lookoutProp ? 'a lookout prop' : 'no prop'}`);
console.log(`\nlocked roads with no barrier (${T.lockedRoadsWithNoBarrier})`);
for (const c of catalog.lockedRoadsWithNoBarrier) console.log(`  ${pad(c.road, 10)}opens with district ${c.opensWithDistrict} (${c.gateKind}); that district's gate stands on edge ${c.gatePropIsOnEdge}`);
console.log(`\nkinks at a port (${catalog.jointsWithAKink.length})`);
for (const k of catalog.jointsWithAKink) console.log(`  ${pad(k.edge, 10)}at ${k.port}: ${k.headingErrorAt1_5} degrees at 1.5 tiles, ${k.lateralAt1} tile off the axis at 1`);
