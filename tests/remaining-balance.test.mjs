// The balance contract after the audit fixes (docs/BALANCE.md, docs/V2_DESIGN.md sections 3 and 11), held on a small sample so that a change that breaks it fails a test and not only a table.
// The full table is `node tests/balance.mjs` (66 pairs, 5 seeds, a decision every 4 hours; add `2` seeds-and-hours arguments or --no-managers for the other cuts); this file plays 12 pairs on 2 seeds, which is
// noisy, so every bound has room (about 20% on a median, a little more on a deviation) and says what it replaces. What each test would have said on commit 0d66995, before the retune, is in its comment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../js/engine.js';
import { ECON, PIPE_RULES, EVENTS, ALGO_EVENTS, AUDIT_THEMES, UPGRADES, CLIENTS, LOANS, PIPE, BROKEN_FACTOR } from '../js/config.js';
import { PERKS } from '../js/data/perks.js';
import { assetFMV, restoreQuality } from '../js/market.js';
import { balance, lateGame } from './balance.mjs';

const doc = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
// Twelve pairs: the ones the table has put outside the 35% band at one time or another (Grad, Heir and Pro with a partner), the strongest (Trades with Native), and a spread of the rest.
const SAMPLE = ['grad+pro', 'grad+heir', 'heir+roots', 'trades+native', 'trades+pro', 'connected+gigger', 'immigrant+second', 'veteran+creator', 'native+second', 'gigger+roots', 'grad+native', 'heir+pro'].map((x) => x.split('+'));
const memo = new Map();
/** One cut of the sample, played once per file: every = hours between the bot's decisions, managers = whether it may hire. */
const cut = (every, managers = true, seeds = 2) => {
  const key = `${every}/${managers}/${seeds}`;
  if (!memo.has(key)) memo.set(key, balance({ seeds, every, pairs: SAMPLE, managers }));
  return memo.get(key);
};
const worst = (r) => Math.max(...r.rows.flatMap((x) => x.dev.map(Math.abs)));
// Day-90 median net worth of commit 816e7c4 (before the audit fixes) on the same harness, 66 pairs on 5 seeds (docs/BALANCE.md): the level the retune brings the game back to.
const NW_816 = { 2: 1494012, 4: 994045, 8: 405602 };

test('a broken lot is priced for what it can become: dearer as your Ops grows, so a repair flip still pays but is no longer the whole game [open items 30, 31]', () => {
  // On commit 0d66995 a wreck cost 0.985 down to 0.9 of its as-is value, so a restored crate (about 3.3 times the as-is price from Ops 5) returned about +200% to a bot with Ops 4 and the same bot
  // with managers forbidden ended 5 to 27 times richer than with them. The posted price now follows ECON.brokenLo and ECON.brokenSlope (see js/config.js).
  const ratio = (ops, perks = [], z = 7) => {
    const out = [];
    for (let seed = 1; seed <= 120 && out.length < 12; seed++) {
      const g = new Game({ perks, seed, handle: 'T', pid: 'T-' + seed }); g.env.algo = false; g.s.skills.ops = ops;
      g._openZone(z); g.s.lots[z] = [];
      for (let i = 0; i < 40 && !(g.s.lots[z][0] && g.s.lots[z][0].cond === 'broken'); i++) { g.s.lots[z] = []; g._spawnLot(z); }
      const lot = g.s.lots[z][0];
      if (!lot || lot.cond !== 'broken' || lot.price < 20) continue;
      const asIs = assetFMV({ cls: lot.cls, cond: 'broken', quality: 1, wear: 1 }, z, g.mods(), g.crowd(lot.cls, z));
      out.push({ x: lot.price / asIs, lvl: g.lvl('ops') });
    }
    assert.ok(out.length >= 8, `${out.length} broken lots found`);
    return out;
  };
  const flip = (ops) => restoreQuality(ops) / (BROKEN_FACTOR * Math.max(ECON.brokenLo, 1 - ECON.brokenSlope * (ops - 1))); // restored value over the posted price, before repair, friction and fees
  for (const ops of [1, 3, 5, 8]) for (const { x, lvl } of ratio(ops)) assert.ok(Math.abs(x - Math.max(ECON.brokenLo, 1 - ECON.brokenSlope * (lvl - 1))) < 0.012, `Ops ${lvl}: a wreck posted at ${x.toFixed(3)} of its as-is value`);
  assert.ok(ECON.brokenSlope < 0 && ECON.brokenLo >= 1, 'the slope is meant to be negative: better repairers pay more for a wreck');
  for (const x of ratio(5, ['trades'])) assert.ok(Math.abs(x.x / Math.max(ECON.brokenLo, 1 - ECON.brokenSlope * (x.lvl - 1)) - 0.8) < 0.012, 'the Tradesperson still pays 20% less for a wreck');
  assert.ok(flip(4) > 1.5 && flip(4) < 2.0, `a flip at Ops 4 returns ${((flip(4) - 1) * 100).toFixed(0)}% before costs (it was +205%)`);
  assert.ok(flip(8) > 1.2 && flip(8) < 1.5, `a flip at Ops 8 returns ${((flip(8) - 1) * 100).toFixed(0)}% before costs, so mastery still pays`);
});

test('the sellers of wrecks in the top districts know what a repaired crate fetches: from district 13 a wreck is posted brokenTop dearer for each district past 12, and nothing below changes [open items 30, 31, M1]', () => {
  // Without the premium the same bot with hiring forbidden flipped wrecks in districts 15 and 16 (+60% to +100% a flip, five a day) and ended 4.7 times richer than with managers at a decision every 2 hours,
  // in district 16 in 72% of its runs; with it 0.70 times, 2% (docs/BALANCE.md, Managers and hand play). The premium is on the posted price of a broken lot and on nothing else.
  assert.equal(ECON.brokenFrom, 12); assert.ok(ECON.brokenTop > 0 && ECON.brokenTop <= 0.2, `brokenTop ${ECON.brokenTop}`);
  const sample = (z, ops = 4) => {
    const out = [];
    for (let seed = 1; seed <= 150 && out.length < 8; seed++) {
      const g = new Game({ perks: [], seed, handle: 'T', pid: 'T-' + seed }); g.env.algo = false; g.s.skills.ops = ops; g._openZone(z); g.s.lots[z] = [];
      for (let i = 0; i < 40 && !(g.s.lots[z][0] && g.s.lots[z][0].cond === 'broken'); i++) { g.s.lots[z] = []; g._spawnLot(z); }
      const lot = g.s.lots[z][0];
      if (!lot || lot.cond !== 'broken' || lot.price < 20) continue;
      out.push(lot.price / assetFMV({ cls: lot.cls, cond: 'broken', quality: 1, wear: 1 }, z, g.mods(), g.crowd(lot.cls, z)) / Math.max(ECON.brokenLo, 1 - ECON.brokenSlope * (g.lvl('ops') - 1)));
    }
    assert.ok(out.length >= 5, `${out.length} broken lots found in district ${z}`);
    return out;
  };
  for (const z of [9, 12, 13, 14, 15, 16]) {
    const want = 1 + ECON.brokenTop * Math.max(0, z - ECON.brokenFrom);
    for (const x of sample(z)) assert.ok(Math.abs(x / want - 1) < 0.012, `district ${z}: a wreck is posted at ${x.toFixed(3)} times the price Ops alone gives, not ${want.toFixed(2)}`);
  }
  const flipAt = (ops, z) => restoreQuality(ops) / (BROKEN_FACTOR * Math.max(ECON.brokenLo, 1 - ECON.brokenSlope * (ops - 1)) * (1 + ECON.brokenTop * Math.max(0, z - ECON.brokenFrom)));
  assert.ok(flipAt(6, 13) > 1.35 && flipAt(6, 13) < 1.6 && flipAt(6, 16) > 1.05 && flipAt(6, 16) < 1.3, `a flip at Ops 6 returns ${((flipAt(6, 13) - 1) * 100).toFixed(0)}% in district 13 and ${((flipAt(6, 16) - 1) * 100).toFixed(0)}% in 16 before costs`);
  assert.ok(flipAt(8, 16) < 1.05, 'at Ops 8 a wreck in the Global Exchange is bought for about what it fetches: that is what the premium is');
  // the sound lots are untouched
  const g = new Game({ perks: [], seed: 3, handle: 'T', pid: 'T-3' }); g.env.algo = false; g._openZone(16); g.s.lots[16] = [];
  for (let i = 0; i < 60 && !(g.s.lots[16][0] && g.s.lots[16][0].cond === 'ok'); i++) { g.s.lots[16] = []; g._spawnLot(16); }
  const sound = g.s.lots[16][0]; assert.equal(sound.cond, 'ok');
  assert.ok(Math.abs(sound.price / assetFMV({ cls: sound.cls, cond: 'ok', quality: 1, wear: 1 }, 16, g.mods(), g.crowd(sound.cls, 16)) - Math.max(ECON.lotDiscLo, ECON.lotDiscHi - 0.025 * (g.lvl('ops') - 1))) < 0.012, 'a sound lot is posted as before');
});

test('the milestones of the default rhythm are the design\'s: districts 5, 9 and 13 around days 16, 30 and 55, and the pairs stay within the band [open items 29, 32, 34]', () => {
  const r = cut(4);
  // 0d66995 on this sample: 18.75 / 29 / 52.25 and 5 of the 12 pairs outside 35%; the full table (66 pairs, 5 seeds) was 17.5 / 31 / 50.5 with 5 of 66
  assert.ok(r.base[0] >= 11 && r.base[0] <= 20, `district 5 on day ${r.base[0]} (the design: 14 to 22, about 16)`);
  assert.ok(r.base[1] >= 22 && r.base[1] <= 36, `district 9 on day ${r.base[1]} (the design: 30 to 40, about 30)`);
  assert.ok(r.base[2] >= 45 && r.base[2] <= 66, `district 13 on day ${r.base[2]} (the design: 55 to 70, about 55)`);
  assert.ok(r.bad.length <= 4, `${r.bad.length} of 12 pairs outside 35%: ${r.bad.map((x) => x.pair).join(', ')}`);
  assert.ok(worst(r) <= 0.8, `the worst pair is ${(worst(r) * 100).toFixed(0)}% off the median on some milestone`);
  assert.equal(r.wipedRuns, 0);
  const grad = r.rows.filter((x) => x.pair.startsWith('grad+'));
  assert.ok(grad.every((x) => x.nw > 400000), 'no Grad pair is left behind in net worth: ' + grad.map((x) => x.pair + ' ' + Math.round(x.nw)).join(', '));
});

test('the day-90 net worth is back near the level of commit 816e7c4 at a decision every 2, 4 and 8 hours, and the late game does not run away at the fast end [open items 30, 31]', () => {
  // 0d66995 on this sample: 1.98M (every 2), 1.26M (every 4), 0.51M (every 8), 25% of the runs in district 16 and a spread of 3.4 at every 2; 816e7c4: 1.49M, 0.99M, 0.41M, 9% and 2.6.
  for (const every of [2, 4, 8]) {
    const L = lateGame(cut(every).rows), ref = NW_816[every];
    assert.ok(L.nwP50 >= ref * 0.8 && L.nwP50 <= ref * 1.2, `every ${every} hours: median ${Math.round(L.nwP50)} against ${ref} on commit 816e7c4`);
    assert.ok(L.d16Share <= 1 / 6, `every ${every} hours: district 16 in ${(L.d16Share * 100).toFixed(0)}% of ${L.runs} runs (the design: about one in six at most)`);
    assert.ok(L.spread <= (every === 8 ? 4.5 : 3.2), `every ${every} hours: the 90th percentile is ${L.spread.toFixed(2)}x the 10th`);
  }
  const fast = lateGame(cut(2).rows);
  assert.ok(fast.spread <= 3.0, `every 2 hours: the 90th percentile is ${fast.spread.toFixed(2)}x the 10th (the design bound, which held only at every 4 before)`);
});

test('the slow rhythm gets its early weeks back: a player who acts every 8 hours reaches district 5 in about three weeks, and nobody is left past day 28 [open item 32]', () => {
  const r = cut(8);
  // 0d66995 on this sample: median district 5 on day 26 and a pair at 32 (19% of the runs reached it after day 30 on the full table; 816e7c4: 20.5 and 5%)
  assert.ok(r.base[0] <= 22, `district 5 on day ${r.base[0]}`);
  assert.ok(r.rows.every((x) => x.d[0] <= 28), 'the slowest pair reaches district 5 on day ' + Math.max(...r.rows.map((x) => x.d[0])));
  assert.ok(r.base[2] >= 62, `district 13 on day ${r.base[2]}: a slow player is not early either`);
});

test('managers earn at least as much as the hand play they displace, at a decision every 2, 4 and 8 hours, and the same bot with hiring forbidden stays inside the late-game bounds too [open items 6, 30, M1]', () => {
  // The same bot with hiring forbidden (balance({ managers: false })), on the first seed alone (12 runs) against the 24 runs with managers. This sample before ECON.brokenTop: without managers 9.4x as much at every 2
  // hours, 6.9x at every 4 and 0.94x at every 8; on the full table (66 pairs, 5 seeds) 8.5x, 5.4x and 0.8x on 0d66995, 4.7x, 0.85x and 0.84x on f747048, and 27x, 27x and 2.4x on commit 816e7c4.
  const ratio = (every) => lateGame(cut(every, false, 1).rows).nwP50 / lateGame(cut(every).rows).nwP50;
  for (const every of [2, 4, 8]) assert.ok(ratio(every) <= 1.2, `every ${every} hours: without managers ${ratio(every).toFixed(2)}x as rich (the design: no richer; the district 13 to 16 wreck premium, ECON.brokenTop, is what holds it at every 2)`);
  assert.ok(ratio(4) >= 0.3, `every 4 hours: hand play is not worthless either (${ratio(4).toFixed(2)}x)`);
  // ...and the bot that never hires does not run away to district 16 either (f747048: 72% of its runs at every 2 hours, 23% at every 4, and a net worth 11 to 12 times apart from its 10th to its 90th percentile)
  for (const every of [2, 4]) {
    const L = lateGame(cut(every, false, 1).rows);
    assert.ok(L.d16Share <= 1 / 6, `every ${every} hours, managers forbidden: district 16 in ${(L.d16Share * 100).toFixed(0)}% of ${L.runs} runs`);
    assert.ok(L.spread <= 4.5, `every ${every} hours, managers forbidden: the 90th percentile is ${L.spread.toFixed(2)}x the 10th`);
  }
  assert.equal(cut(4, false, 1).wipedRuns, 0);
});

test('the docs quote the economy the config has, and the Backgrounds they describe are the ones in the data [open items 27, 33]', () => {
  const B = doc('docs/BALANCE.md'), V = doc('docs/V2_DESIGN.md');
  for (const [k, v] of Object.entries(ECON)) assert.ok(new RegExp(`\`${k}\` ${String(v).replace('.', '\\.')}(?![\\d.])`).test(B), `BALANCE.md says \`${k}\` ${v}`);
  for (const k of ['marginBase', 'marginSlope', 'scaleExp', 'overheadExp']) assert.ok(new RegExp(`\`${k}\` ${String(PIPE_RULES[k]).replace('.', '\\.')}(?![\\d.])`).test(B), `BALANCE.md says \`${k}\` ${PIPE_RULES[k]}`);
  const g = PERKS.grad;
  assert.equal(g.mods.leadBudget, 1.12);
  assert.ok(g.strength.includes(`${Math.round((g.mods.leadBudget - 1) * 100)}% bigger budgets`), 'the strength text says what the mod does');
  assert.ok(V.includes(`buyers bring ${Math.round((g.mods.leadBudget - 1) * 100)}% bigger budgets`) && B.includes('alumni network'), 'the design table and BALANCE.md describe Grad as the data does');
  assert.match(B, /commit [0-9a-f]{7}/, 'the measured figures say which commit they were measured on');
  assert.match(B, /decision every three hours/, 'the cadence paragraph that tests/audit-repair.test.mjs looks for');
  assert.doesNotMatch(B, /59%|5\.9M to 25M|20 of the 330/, 'the figures that did not reproduce are gone');
});

test('player-facing text is in American English: Backgrounds, shocks, audit notices, upgrades, clients, loans and managers [open item 28]', () => {
  const BRITISH = /\b(licences?|catalogues?|instalments?|fibre|favourites?|jewell(?:ery|ers)|pyjamas|modell(?:ed|ing)|harbourline|colours?|neighbours?|grey|centre|labour|behaviour|organis(?:e|ed|es|ing|ation)|analys(?:e|ed)|rumours?|specialis(?:e|ed|es|ing|ation)|travell(?:ed|er)|cheque|tyres?|programme|defences?|honour)\b/i;
  const strings = [];
  const walk = (x, path) => { if (typeof x === 'string') strings.push([path, x]); else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) walk(v, path + '.' + k); };
  walk(PERKS, 'PERKS'); walk(EVENTS, 'EVENTS'); walk(ALGO_EVENTS, 'ALGO_EVENTS'); walk(AUDIT_THEMES, 'AUDIT_THEMES'); walk(UPGRADES, 'UPGRADES'); walk(CLIENTS, 'CLIENTS'); walk(LOANS, 'LOANS'); walk(PIPE, 'PIPE');
  assert.ok(strings.length > 150, `${strings.length} strings walked`);
  const hits = strings.filter(([, s]) => BRITISH.test(s)).map(([p, s]) => `${p}: ${s.match(BRITISH)[0]}`);
  assert.deepEqual(hits, []);
});
