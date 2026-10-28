// The finishing balance round (docs/BALANCE.md: "The Digital Native pocket", "The mild laggards: Legacy Heir and Seasoned Pro", "Managers and hand play").
// What it settled, and what this file holds so that a change that undoes it fails a test instead of drifting:
//   1. Digital Native: digital goods +10% (it was +20%) and 12% of buyers fraudulent (it was 18%). With +20% the bot that never hires out-earned its own managers on every Digital Native pair at a decision every 8 hours
//      (1.17x) and tied them at 2 and 4; now every Background is under 1 at 2, 4 and 8 hours (ten seeds, `node tests/balance.mjs 10 4 --compare`).
//   2. Legacy Heir: family friends send buyers who bring 5% bigger budgets. Seasoned Pro: digital goods -15% (it was -25%). Both were mild laggards (0.86 and 0.77 of the median pair's net worth, and Heir with Pro 60% late
//      to district 5) because the part of them a Quick-playing bot can use is only their costs.
//   3. The 2-hour rhythm stays documented as a known limit, with its measured ratio.
// The long measurements are the tables in docs/BALANCE.md (66 pairs, 5 and 10 seeds); this file plays one seed of the eleven Digital Native pairs (44 runs, about 25 seconds) and the rest is arithmetic on the data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../js/engine.js';
import { PERKS, PERK_IDS, perkMods } from '../js/data/perks.js';
import { balance, handOverManagers } from './balance.mjs';

const doc = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b)), `${a} vs ${b}`);
const mk = (perks = [], seed = 1) => { const g = new Game({ perks, seed, handle: 'T', pid: 'T-' + seed }); g.env.algo = false; return g; };
/** The percentages a text names, unsigned, in order: "digital goods -15%, managers cost 10% more" gives ["10%", "15%"]. */
const percents = (t) => [...t.matchAll(/\d+(?:\.\d+)?%/g)].map((m) => m[0]).sort();
/** The row of section 3 of the design for a Background: [strength, cost]. */
const designRow = (id) => {
  const line = doc('docs/V2_DESIGN.md').split('\n').find((l) => l.startsWith('| `' + id + '` |'));
  assert.ok(line, `section 3 has a row for ${id}`);
  const c = line.split('|').map((x) => x.trim());
  return { strength: c[4], cost: c[5] };
};

test('the three retuned Backgrounds carry the numbers the finishing round chose, and say them in words', () => {
  const n = PERKS.native, h = PERKS.heir, p = PERKS.pro;
  // Digital Native: the digital premium is the lever on hand play (+15% left 8 hours at 1.28x, +10% at 0.95x, +5% at 0.97x); the rest is as it was
  assert.equal(n.mods.digitalMult, 1.1); assert.equal(n.mods.scamRate, 0.12);
  assert.equal(n.mods.lotRefresh, 0.25); assert.equal(n.mods.digitalBuyers, true); assert.deepEqual(n.mods.subscription, { rate: 0.015 });
  assert.match(n.strength, /Digital goods \+10% value/); assert.match(n.strength, /lots refresh 25% faster/); assert.match(n.cost, /12% of buyers are fraudulent/); assert.match(n.cost, /1\.5% of your cash a month/);
  // Legacy Heir: a small strength the bot can feel (family friends bring bigger budgets); the costs and the rest are as they were
  assert.equal(h.mods.leadBudget, 1.05); assert.equal(h.mods.xpMult, 0.9); assert.equal(h.mods.noSpecialty, true); assert.equal(h.mods.spreadAdj, -0.25); assert.equal(h.mods.bailout.fraction, 0.6);
  assert.match(h.strength, /family friends send buyers who bring 5% bigger budgets/); assert.match(h.cost, /learn 10% slower/);
  // Seasoned Pro: digital goods -15% instead of -25%; the other costs and the strengths are as they were
  assert.equal(p.mods.digitalMult, 0.85); assert.equal(p.mods.xpMult, 0.85); assert.equal(p.mods.managerCost, 1.1); assert.equal(p.mods.inspectBonus, 2); assert.equal(p.mods.haggleAssist, 1);
  assert.match(p.cost, /digital goods -15%/); assert.match(p.cost, /learn 15% slower/); assert.match(p.cost, /managers cost 10% more/);
  // brackets, not pins: the Native premium above +15% put hand play ahead of managers at 8 hours (1.28x on its pairs), below +5% the pair is only the median; Pro and Heir stay small boosts
  assert.ok(n.mods.digitalMult > 1.04 && n.mods.digitalMult <= 1.15, 'Digital Native: a digital premium between +5% and +15%');
  assert.ok(n.mods.scamRate >= 0.1 && n.mods.scamRate <= 0.18, 'Digital Native: a scam rate that is still a cost');
  assert.ok(h.mods.leadBudget > 1 && h.mods.leadBudget <= 1.08, 'Legacy Heir: a small budget bonus, under half the Grad\'s');
  assert.ok(p.mods.digitalMult > 0.75 && p.mods.digitalMult < 1, 'Seasoned Pro: digital goods still sell lower, by less than before');
});

test('every strength and cost the design table of section 3 prints names the same percentages as the data does, for all twelve Backgrounds', () => {
  for (const id of PERK_IDS) {
    const row = designRow(id), p = PERKS[id];
    assert.deepEqual(percents(row.strength), percents(p.strength), `${id}: strength, design table against data`);
    assert.deepEqual(percents(row.cost), percents(p.cost), `${id}: cost, design table against data`);
  }
  // and the three rows of this round say what the data says
  assert.match(designRow('native').strength, /Digital goods \+10% value/); assert.match(designRow('native').cost, /12% of buyers are fraudulent/);
  assert.match(designRow('heir').strength, /5% bigger budgets/); assert.match(designRow('pro').cost, /digital goods -15%/);
});

test('the engine applies the new numbers: Native sells digital goods 10% over, Pro 15% under, together 6.5% under; Heir meets buyers with 5% bigger budgets', () => {
  const val = (x, cls) => x.val({ cls, cond: 'ok', quality: 1, wear: 1, zone: 10 }, 10);
  const plain = mk([]), native = mk(['native']), pro = mk(['pro']), both = mk(['native', 'pro']);
  near(val(native, 'saas') / val(plain, 'saas'), 1.1); near(val(pro, 'saas') / val(plain, 'saas'), 0.85); near(val(both, 'saas') / val(plain, 'saas'), 0.935);
  near(val(native, 'fleet'), val(plain, 'fleet')); near(val(pro, 'fleet'), val(plain, 'fleet')); // goods that are not digital are untouched
  near(perkMods(['native', 'pro']).digitalMult, 1.1 * 0.85);
  // the same buyer, drawn in two worlds that differ only in the Background: the Heir's budget is 5% bigger unless the buyer's own ceiling stops it, and never smaller
  let up = 0, capped = 0, n = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const a = mk(['heir'], seed), b = mk([], seed);
    a._openZone(5); b._openZone(5); a.s.leads[5] = []; b.s.leads[5] = [];
    a._spawnLead(5); b._spawnLead(5);
    const la = a.s.leads[5][0], lb = b.s.leads[5][0];
    if (!la || !lb || la.seg !== lb.seg) continue; // the stream is the same, so this is rare; skip the draw rather than compare two buyers
    n++;
    const x = la.budget / lb.budget;
    assert.ok(x >= 1 - 1e-6 && x <= 1.05 + 0.002, `budget ratio ${x}`);
    if (Math.abs(x - 1.05) < 0.002) up++; else capped++;
  }
  assert.ok(n >= 100, `${n} buyers compared`); assert.ok(up > capped * 3, `most buyers carry the full 5%: ${up} against ${capped} held by their ceiling`);
  // a Native meets a fraudulent buyer in about one in eight, from the third trade on (audit F3 keeps the first two trades safe)
  let scams = 0, leads = 0;
  for (let seed = 1; seed <= 40; seed++) { const g = mk(['native'], seed); g.s.trades = 3; for (let i = 0; i < 40; i++) { g.s.leads[1] = []; g._spawnLead(1); leads++; if (g.s.leads[1][0].scam) scams++; } }
  assert.ok(scams / leads > 0.09 && scams / leads < 0.16, `${scams} of ${leads} buyers fraudulent`);
});

test('managers earn at least as much as hand play for the Digital Native pairs at a decision every 4 and 8 hours [the pocket: 1.06x and 1.16x before]', () => {
  // Digital Native's eleven pairs, the first seed of the table (specialty Operations, seed 100), with and without managers. The ratio is taken run by run (the same pair, the same seed), the median over the pairs.
  // Before the round this sample read 1.06 at 4 hours and 1.16 at 8 (the full table: 1.01x and 1.17x of the medians); after it 0.72 and 0.86 (the full table, ten seeds: 0.70x and 0.92x). The bounds sit between the two.
  const pairs = PERK_IDS.filter((x) => x !== 'native').map((x) => ['native', x]);
  const ratios = (every) => {
    const m = balance({ seeds: 1, every, pairs, managers: true }), h = balance({ seeds: 1, every, pairs, managers: false });
    const mm = new Map(m.rows.map((r) => [r.pair, r.nw]));
    const xs = h.rows.filter((r) => r.nw > 0 && mm.get(r.pair) > 0).map((r) => r.nw / mm.get(r.pair));
    return { paired: median(xs), n: xs.length, wiped: m.wipedRuns + h.wipedRuns };
  };
  const four = ratios(4), eight = ratios(8);
  assert.equal(four.wiped + eight.wiped, 0); assert.equal(four.n, 11); assert.equal(eight.n, 11);
  assert.ok(four.paired <= 0.9, `every 4 hours: hand play ends ${four.paired.toFixed(2)}x as rich as the managers on the Digital Native pairs (the design: under 1; before the round 1.06)`);
  assert.ok(eight.paired <= 1.0, `every 8 hours: hand play ends ${eight.paired.toFixed(2)}x as rich as the managers on the Digital Native pairs (the design: under 1; before the round 1.16)`);
});

test('handOverManagers reports a ratio for every Background and for the whole sample, from the same runs the rest of the harness plays', () => {
  const pairs = [['native', 'trades'], ['grad', 'pro'], ['heir', 'roots']];
  const c = handOverManagers({ seeds: 1, every: 8, pairs });
  assert.deepEqual(c.families.map((f) => f.id).sort(), [...new Set(pairs.flat())].sort());
  for (const f of c.families) { assert.ok(f.ratio > 0 && Number.isFinite(f.ratio), `${f.id}: ${f.ratio}`); assert.ok(f.hand > 0 && f.managers > 0 && f.runs >= 1); }
  assert.ok(c.all.runs === 3 && c.all.ratio > 0 && c.all.paired > 0);
  assert.ok(c.families.every((f, i, a) => i === 0 || a[i - 1].ratio >= f.ratio), 'sorted, highest ratio first');
  // a family is the pairs that hold the Background: Pro's runs are the Grad-Pro pair's alone here
  const pro = c.families.find((f) => f.id === 'pro'), grad = c.families.find((f) => f.id === 'grad');
  assert.equal(pro.runs, 1); near(pro.ratio, grad.ratio);
  // the whole sample is the median over its three runs, so it sits between the lowest and the highest family
  assert.ok(c.all.ratio >= Math.min(...c.families.map((f) => f.ratio)) - 1e-9 && c.all.ratio <= Math.max(...c.families.map((f) => f.ratio)) + 1e-9);
});

test('the table in docs/BALANCE.md keeps the targets of the round: the median net worth within 15% of commit 816e7c4, the milestones within 15% of days 16, 30 and 55, at most 6 pairs outside 35%, one run in six in district 16 at most', () => {
  // The rows of "this round" in the table of Where the table stands are what `node tests/balance.mjs 5 <hours>` printed for the committed files (66 pairs, 5 seeds); the long run is not repeated here,
  // so a re-measured table that leaves the bounds fails this file when it is written into the doc. Commit 816e7c4's medians are the same table's rows for that build.
  const B = doc('docs/BALANCE.md');
  const row = (hours, build) => {
    const line = B.split('\n').find((l) => l.startsWith(`| ${hours} hours | ${build} |`));
    assert.ok(line, `a row for ${build} at ${hours} hours`);
    const c = line.split('|').map((x) => x.trim()), num = (t) => t.split('/').map((x) => +x.replace(/,/g, '').trim());
    return { days: num(c[3]), outside: +c[4], d16: c[5].match(/(\d+) of (\d+)/), nw: num(c[6]), spread: parseFloat(c[7]) };
  };
  for (const hours of [2, 4, 8]) {
    const now = row(hours, 'this round'), then = row(hours, '816e7c4');
    assert.ok(Math.abs(now.nw[1] / then.nw[1] - 1) <= 0.15, `every ${hours} hours: median ${now.nw[1]} against ${then.nw[1]} on commit 816e7c4`);
    assert.ok(now.outside <= 6, `every ${hours} hours: ${now.outside} pairs outside 35%`);
    const share = d16 => (d16 ? +d16[1] / +d16[2] : 0);
    assert.ok(share(now.d16) <= 1 / 6, `every ${hours} hours: district 16 in ${(share(now.d16) * 100).toFixed(0)}% of the runs`);
    assert.ok(now.spread <= 3.2, `every ${hours} hours: a spread of ${now.spread}`);
  }
  const four = row(4, 'this round');
  [16, 30, 55].forEach((d, i) => assert.ok(Math.abs(four.days[i] / d - 1) <= 0.15, `district ${[5, 9, 13][i]} on day ${four.days[i]} against day ${d}`));
});

test('docs/BALANCE.md records the round with measurements: the audit changes, the pocket, the laggards, the by-Background table, and the 2-hour rhythm as a known limit', () => {
  const B = doc('docs/BALANCE.md');
  for (const h of ['### What the audit round changed in the economy', '### The Digital Native pocket', '### The mild laggards: Legacy Heir and Seasoned Pro', '### Managers and hand play']) assert.ok(B.includes(h), h);
  // the numbers the data has, in the words of the doc
  for (const s of ['`digitalMult` 1.10', '`scamRate` 0.12', '`leadBudget` 1.05', '`digitalMult` 0.85', '`handOverManagers()`', '--compare']) assert.ok(B.includes(s), s);
  // the audit round: the knobs it moved, with the numbers of the build before
  for (const s of ['`brokenSlope`', '`urgentK`', '`lotEvery`', '`cycleBase`', '`pitchK`', '`warnMiss`', '`pointXp`', '816e7c4', '0d66995', '52340f0']) assert.ok(B.includes(s), s);
  // the rhythm of 2 hours: a known limit, in real seconds, with its ratio
  assert.match(B, /\*\*A known limit: the decision every 2 hours\.\*\*/); assert.match(B, /every 14 real seconds at 1x/); assert.match(B, /hand play over managers is 0\.68x over the 66 pairs/);
  // every Background has a row in the by-Background table
  const section = B.slice(B.indexOf('**By Background.**'), B.indexOf('**A known limit'));
  for (const id of PERK_IDS) assert.ok(section.includes(`| ${PERKS[id].name} |`), `${PERKS[id].name} is in the by-Background table`);
  // the ratios the table prints are all under 1 (the "After" column is the last of each row)
  const rows = section.split('\n').filter((l) => /^\| [A-Z]/.test(l) && !/^\| Background /.test(l));
  assert.equal(rows.length, 12);
  for (const r of rows) for (const x of r.split('|').slice(-2)[0].match(/\d\.\d\d/g)) assert.ok(+x < 1, `${r}: ${x}`);
  // and nothing is said in British English or with a dash that the rest of the docs avoid
  assert.doesNotMatch(B, /\b(colour|neighbour|behaviour|labour|favour|analyse|organis)/i); assert.ok(!B.includes(String.fromCharCode(0x2014)), 'no em dash');
});
