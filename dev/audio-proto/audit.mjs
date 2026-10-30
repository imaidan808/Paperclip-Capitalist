// node dev/audio-proto/audit.mjs (after run.mjs). Node-only audits of the recipe data: every pitch in key; the direction of each gain and loss; unique ids; fields present.
import { SOUNDS } from './sounds.js';
import { ONE_SHOTS, BEDS, MODS } from './ambient.js';
import { hz, inKey, inKeyHz, keptPartials } from './synth.js';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const flat = (x) => x.flat(Infinity).filter(Boolean);
const res = JSON.parse(readFileSync(process.env.AUDIO_OUT || join(tmpdir(), 'audio-proto-result.json'), 'utf8'));
const cent = Object.fromEntries(res.rows.map((r) => [r.key, r.centroid]));
const problems = [];
const ids = new Set();
let variants = 0;
const contour = (layers) => {
  const pts = [];
  for (const L of layers) {
    if (!L.f || L.k === 'noise' || L.th || L.tx) continue; // thumps are felt, not heard as a note
    if (hz(L.f) < 100) continue;
    pts.push([L.t || 0, Math.log2(hz(L.f))]);
    if (L.f2 && hz(L.f2) >= 100) pts.push([(L.t || 0) + (L.gl ?? L.d ?? 0.2), Math.log2(hz(L.f2))]);
  }
  if (!pts.length) return 0;
  pts.sort((a, b) => a[0] - b[0]);
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0], mean = (a) => a.reduce((s, p) => s + p[1], 0) / a.length;
  const first = pts.filter((p) => p[0] - t0 < 0.03), last = pts.filter((p) => t1 - p[0] < 0.03);
  return Math.round((mean(last) - mean(first)) * 12 * 10) / 10; // semitones, last onset group against the first
};
const UP = ['ui.toggle#on', 'clock#resume', 'cam#in', 'pitch.fit#up', 'deal.result#good', 'audit.result#pass', 'bank.repay#full', 'bank.repay#free', 'level.up#l', 'quest.complete#quest', 'achievement#common', 'achievement#rare', 'achievement#epic', 'perk.bailout#bailout', 'zone.open#t1', 'zone.open#t4', 'acad.teach#right', 'skill.up#s', 'ui.ok#o', 'streak#n6', 'buyer.urgent#u', 'draft.begin#b', 'milestone#m1', 'milestone#m3', 'haggle.leverage#l', 'read.caught#c', 'ui.slider#top', 'repair.done#great'];
const DOWN = ['ui.toggle#off', 'clock#pause', 'cam#out', 'pitch.fit#down', 'deal.result#bad', 'deal.result#warn', 'audit.result#fail', 'alert.insolvent#i', 'ship.trouble#damage', 'bid.rival#out', 'ui.refuse#r', 'sale.reject#fake', 'sale.scam#s', 'sale.herd#h', 'acad.teach#wrong', 'haggle.move#large', 'ui.ask#danger', 'deal.verify#bad', 'alert.advance#l1', 'alert.shock#glut', 'ui.crate#clear', 'bid.hammer#lost', ];
let pruned = 0, kept = 0;
const rows = [], costs = [];
const oscs = (layers) => layers.reduce((n, L) => n + (L.k === 'tone' ? (L.uni ? L.uni[0] : 1) + (L.vib ? 1 : 0) : L.k === 'bank' ? keptPartials(L).length : 1 + (L.am ? 2 : 0)), 0);
for (const e of SOUNDS) {
  if (ids.has(e.id)) problems.push('duplicate id ' + e.id); ids.add(e.id);
  for (const k of ['bus', 'tier', 'cd', 'pan', 'trigger', 'meaning', 'recipe', 'visual', 'variants', 'build', 'dur']) if (e[k] == null) problems.push(`${e.id}: missing ${k}`);
  if (!['ui', 'game'].includes(e.bus)) problems.push(e.id + ': bus');
  for (const [vn, v] of Object.entries(e.variants)) {
    variants++;
    const layers = flat(e.build(v));
    for (const L of layers) if (L.k === 'bank') { const k = keptPartials(L); kept += k.length; pruned += L.p.length - k.length; for (const [r, pg] of k) if (pg > 0.05 && !inKeyHz(hz(L.f) * r)) problems.push(`${e.id}#${vn}: partial ${r} of ${L.f} is out of key and louder than -26 dB`); }
    for (const L of layers) for (const f of [L.f, L.f2]) if (f != null && typeof f === 'string' && !inKey(f)) problems.push(`${e.id}#${vn}: ${f} is not in D major pentatonic`); else if (typeof f === 'number') problems.push(`${e.id}#${vn}: a raw frequency ${f}`);
    const c = contour(layers), key = e.id + '#' + vn;
    costs.push([key, oscs(layers), layers.length]);
    rows.push({ key, c });
    if (UP.includes(key) && c < 1.5) problems.push(`${key}: should rise, contour ${c} st`);
    if (DOWN.includes(key) && c > -1.5) problems.push(`${key}: should fall, contour ${c} st`);
  }
}
for (const o of ONE_SHOTS) for (const L of flat(o.build())) for (const f of [L.f, L.f2]) if (typeof f === 'string' && !inKey(f)) problems.push(`${o.id}: ${f} not in key`);
for (const [id, b] of Object.entries(BEDS)) for (const L of b.layers) if (L.drone && !inKey(L.drone)) problems.push(`bed ${id}: drone ${L.drone}`);
for (const [m, ls] of Object.entries(MODS)) for (const L of ls) if (L.drone && !inKey(L.drone)) problems.push(`mod ${m}: drone ${L.drone}`);
// brightness: a gain is brighter than its loss
const PAIRS = [['cash.in#m', 'cash.out#m'], ['cash.in#l', 'cash.out#l'], ['cash.in#s', 'cash.out#s'], ['sale.win#w', 'sale.reject#nofit'], ['sale.win#w', 'sale.herd#h'], ['cam#in', 'cam#out'], ['deal.result#good', 'deal.result#bad'], ['pitch.fit#up', 'pitch.fit#down'], ['audit.result#pass', 'audit.result#fail'], ['level.up#l', 'alert.insolvent#i'], ['quest.complete#quest', 'sale.scam#s'], ['acad.teach#right', 'acad.teach#wrong'], ['clock#resume', 'clock#pause'], ['bank.repay#free', 'bank.draw#b']];
const bright = PAIRS.map(([a, b]) => ({ a, b, ca: cent[a], cb: cent[b], ok: cent[a] > cent[b] }));
for (const p of bright) if (!p.ok) problems.push(`brightness: ${p.a} (${p.ca}) is not brighter than ${p.b} (${p.cb})`);
// size ladders get brighter and longer
const dur = Object.fromEntries(res.rows.map((r) => [r.key, r.ms]));
for (const [a, b] of [['cash.in#s', 'cash.in#m'], ['cash.in#m', 'cash.in#l'], ['cash.in#l', 'cash.in#xl'], ['alert.advance#l1', 'alert.advance#l2'], ['alert.advance#l2', 'alert.advance#l3'], ['achievement#common', 'achievement#rare'], ['achievement#rare', 'achievement#epic'], ['zone.open#t1', 'zone.open#t4']]) if (!(dur[b] > dur[a])) problems.push(`ladder: ${b} (${dur[b]} ms) is not longer than ${a} (${dur[a]} ms)`);
costs.sort((a, b) => b[1] - a[1]);
const med = costs.map((c) => c[1]).sort((a, b) => a - b)[Math.floor(costs.length / 2)];
console.log(JSON.stringify({ partials: { kept, pruned }, checks: { up: UP.length, down: DOWN.length, pairs: PAIRS.length }, costTop: costs.slice(0, 5), costMedian: med, ids: ids.size, variants, oneShots: ONE_SHOTS.length, beds: Object.keys(BEDS).length, problems, bright, contours: Object.fromEntries(rows.filter((r) => UP.includes(r.key) || DOWN.includes(r.key)).map((r) => [r.key, r.c])) }, null, 1));
