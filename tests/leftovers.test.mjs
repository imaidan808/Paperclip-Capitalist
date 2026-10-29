// The leftovers round (branch v2/rep-left, on adcd991): seven small things earlier tracks left, each held by a test that fails on the fault.
//   L1  the Ops blurb says what Ops does (cheaper working lots, a dearer wreck, less pipeline overhead), and each claim is true in the engine
//   L2  docs/BALANCE.md: the old "Open" note is closed, and what it still says is the code's (the draft screen's figures, the suggested pairs, the wreck prices of the Codex and the Academy)
//   L3  docs/V2_DESIGN.md section 11 quotes the managers-against-hand-play figures of the build as it is
//   L4  docs/FACULTY_KIT.md names the controls the screens really have
//   L5  Session.rewind and Session.inject refuse while a room taken back is still waiting to hear the class's hour
//   L6  the draft screen's stock-cost trait reads the engine's lot-price rule: a working lot cheaper, a wreck dearer
//   L7  Begin asks before it replaces a saved run (pure parts, the source, and one walk in headless Chrome: skipped without Chrome or with PC_NO_BROWSER=1)
// Run: node --test tests/leftovers.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer as netServer } from 'node:net';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const { Game } = await import('../js/engine.js');
const { SKILLS, ECON, FRESH, BROKEN_FACTOR, PERKS, PERK_IDS, ASSETS } = await import('../js/config.js');
const { lotShare, LOT_STEP, repairCostFor } = await import('../js/market.js');
const { Session, describeSave } = await import('../js/session.js');
const D = await import('../js/ui/draft.js');
const { traitScores, summaryOf, suggestPair, opsStockEffect, OPS_REF, REPAIR_SHARE, TRAIT_EDGE, replaceRunHTML } = D;
const { CODEX } = await import('../js/meta/codex.js');

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const sourcing = (ids) => traitScores(ids).find((t) => t.id === 'sourcing').score;

// ============================================================================================================================ L1. the Ops blurb
/** A world with one lot of each kind posted in a district at a given Ops level, from the same seed: the random stream does not depend on Ops, so the lots are the same lots. */
function lotsAt(ops, seed, zone = 7) {
  const g = new Game({ perks: [], seed, handle: 'T', pid: 'T-' + seed }); g.env.algo = false; g.s.skills.ops = ops; g._openZone(zone);
  const out = {};
  for (let i = 0; i < 80 && !(out.ok && out.broken); i++) {
    g.s.lots[zone] = []; g._spawnLot(zone);
    const lot = g.s.lots[zone][0];
    if (lot && !out[lot.cond]) out[lot.cond] = { cls: lot.cls, price: lot.price, id: lot.id };
  }
  return out;
}

test('L1: the Ops blurb says what Ops does, and each part of it is true in the engine', () => {
  const b = SKILLS.ops.blurb;
  assert.equal(b, 'Cheaper repairs, better restorations, lower prices on working lots (wrecks ask more as your Ops rises) and less pipeline overhead.');
  assert.doesNotMatch(b, /sourcing/i, 'Ops does not lower every sourcing price');
  assert.doesNotMatch(b, /friction/i, 'friction is the pool haircut and the taxes, which Ops does not touch; what it lowers is a manager\'s overhead');
  assert.ok(b.length < 160, 'it fits a Draft card');
  // 1. the same lots at Ops 1 and Ops 4: a working lot costs less, a wreck costs more, by exactly the shared rule
  let sound = 0, wreck = 0;
  for (let seed = 1; seed <= 12 && (sound < 3 || wreck < 3); seed++) {
    const low = lotsAt(1, seed), high = lotsAt(4, seed);
    if (low.ok && high.ok && low.ok.cls === high.ok.cls && low.ok.price > 1) {
      sound++; assert.ok(high.ok.price < low.ok.price, `a working lot is cheaper at Ops 4 (${high.ok.price} against ${low.ok.price})`);
      near(high.ok.price / low.ok.price, lotShare(4, 'ok') / lotShare(1, 'ok'), 0.01);
    }
    if (low.broken && high.broken && low.broken.cls === high.broken.cls && low.broken.price > 1) {
      wreck++; assert.ok(high.broken.price > low.broken.price, `a wreck is dearer at Ops 4 (${high.broken.price} against ${low.broken.price})`);
      near(high.broken.price / low.broken.price, lotShare(4, 'broken') / lotShare(1, 'broken'), 0.01);
    }
  }
  assert.ok(sound >= 3 && wreck >= 3, `found ${sound} working lots and ${wreck} wrecks to compare`);
  // 2. the repair bill falls and the restoration rises (the blurb's first two claims are the Codex's formula)
  assert.ok(repairCostFor(100, 4) < repairCostFor(100, 1));
  // 3. a manager's overhead falls with Ops, and so does the chance a shipment is damaged
  const over = (ops) => { const g = new Game({ perks: [], seed: 3, handle: 'T', pid: 'T-3' }); g.s.skills.ops = ops; for (let z = 1; z <= 5; z++) g._openZone(z); return g.forecast({ kind: 'broker', zone: 5, level: 1, alloc: 500 }).overhead; };
  assert.ok(over(5) < over(1), `overhead at Ops 5 is ${over(5)}, at Ops 1 ${over(1)}`);
  near(over(5) / over(1), 1 - 0.04 * 4, 1e-9);
  const risk = (ops) => {
    const g = new Game({ perks: [], seed: 3, handle: 'T', pid: 'T-3' }); g.s.skills.ops = ops; g._openZone(2);
    const a = g._mk(g.s, 'pen', { zone: 1, basis: 1 }); g.s.assets.push(a); return g.freightQuote([a.id], 2).risk;
  };
  near(risk(1), FRESH.damageBase - 0.05); near(risk(5), FRESH.damageBase - 0.25);
  // 4. the document the blurb's claims live in says the same, once
  const bal = read('docs/BALANCE.md');
  assert.match(bal, /\| Ops \(the Skills blurb, `SKILLS\.ops\.blurb`\) \|/);
  assert.match(bal, /posts a working lot 2\.5 points cheaper/); assert.match(bal, /0\.21 of its as-is value dearer/); assert.match(bal, /takes 4% off a manager's overhead/);
});

test('L1: the one lot-price rule is a function the lot generator and the draft screen both call, and it is the rule BALANCE.md and the Codex state', () => {
  assert.match(read('js/engine.js'), /let disc = lotShare\(ops, cond\);/);
  assert.match(read('js/ui/draft.js'), /import \{ lotShare, repairCostFor \} from '\.\.\/market\.js';/);
  assert.equal(LOT_STEP, 0.025);
  // 97% of the fair value at Ops 1, 2.5 points less a level, never under 84%; a wreck 1.00 at Ops 1 and 1 + 0.21 a level after
  near(lotShare(1, 'ok'), ECON.lotDiscHi); near(lotShare(3, 'ok'), 0.92); near(lotShare(40, 'ok'), ECON.lotDiscLo);
  near(lotShare(1, 'broken'), 1); near(lotShare(2, 'broken'), 1.21); near(lotShare(3, 'broken'), 1.42); near(lotShare(4, 'broken'), 1.63); near(lotShare(6, 'broken'), 2.05); near(lotShare(0, 'broken'), 1);
  const codex = JSON.stringify(CODEX);
  assert.ok(codex.includes('1.00 times its as-is value at Ops 1, 1.42 at Ops 3, 1.63 at Ops 4 and 2.05 at Ops 6'), 'the Codex states those wreck prices');
  assert.ok(read('js/meta/academy.js').includes('a wreck is asked at 1.00 times its as-is value at Ops 1 and 1.21 times at Ops 2'), 'and the Academy states the two it plays');
});

// ============================================================================================================================ L6. the draft screen's stock-cost trait
test('L6: a free level of Ops is no longer 0.12 of cheaper stock: the trait adds up one working lot (cheaper), one wreck (dearer) and its repair (cheaper), read from the engine\'s rules', () => {
  assert.equal(OPS_REF, 3, 'read where a specialty starts');
  near(opsStockEffect(0), 0); near(opsStockEffect(NaN), 0); near(opsStockEffect(undefined), 0);
  // one level up from Ops 3, by hand from the constants: lots 2.5 points cheaper, a wreck 0.21 of its as-is value (x0.3) dearer, a repair bill x0.42 smaller
  const sound = 0.025, wreck = ECON.brokenSlope * BROKEN_FACTOR, repair = REPAIR_SHARE * (0.42 ** 2 - 0.42 ** 3);
  assert.ok(sound > 0 && wreck < 0 && repair > 0, 'the three move in different directions');
  near(wreck, -0.063);
  near(opsStockEffect(1), sound + wreck + repair, 1e-9);
  // the sum is small, nowhere near the flat 0.12 a level that the trait used to count
  for (const bonus of [-1, 1, 2]) assert.ok(Math.abs(opsStockEffect(bonus)) < 0.06, `${bonus}: ${opsStockEffect(bonus)}`);
  assert.ok(opsStockEffect(2) < 0 && opsStockEffect(-1) < 0, 'two free levels make the stock a little dearer in all (wrecks), and so does losing one (repairs)');
  assert.ok(Math.abs(REPAIR_SHARE - 0.2489) < 0.001, 'a typical repair bill is a quarter of a crate\'s worth: the median of the classes that can be repaired');
  // the trait: the Backgrounds' own repair and wreck discounts, plus that
  near(sourcing(['trades']), opsStockEffect(2) + 0.5 + 0.2, 1e-9);
  near(sourcing(['grad']), opsStockEffect(-1), 1e-9);
  near(sourcing(['trades']), 0.66, 0.005); near(sourcing(['grad']), -0.0226, 0.0005);
  assert.ok(sourcing(['trades']) < 0.5 + 0.2, 'Ops adds nothing on top of the Tradesperson\'s half-price repairs and cheaper wrecks (it used to add 0.24)');
  // what a player reads
  assert.ok(summaryOf(['trades']).strong.includes('stock costs') && summaryOf(['trades', 'pro']).strong.includes('stock costs'), 'the Tradesperson is still strong on stock costs');
  assert.ok(!summaryOf(['grad']).weak.includes('stock costs'), 'a Grad build is not sold as weak on stock costs (it was, for a -1 Ops that no longer raises every price)');
  assert.ok(summaryOf(['grad']).weak.includes('running costs'), 'its weakness is the garnishment');
  assert.ok(!/0\.12 \* m\.opsBonus/.test(read('js/ui/draft.js')), 'the flat term is gone');
  // the Backgrounds that never touch Ops or stock read as before
  for (const id of ['connected', 'heir', 'creator', 'veteran', 'immigrant', 'roots', 'pro']) near(sourcing([id]), 0);
  near(sourcing(['native']), 0.8 * 0.25, 1e-9); near(sourcing(['gigger']), 0.08, 1e-9); near(sourcing(['second']), 0.6 * 0.12, 1e-9);
  for (const id of PERK_IDS) for (const t of traitScores([id])) assert.ok(Number.isFinite(t.score));
});

test('L6: the pairs the Reroll button suggests are the twenty BALANCE.md lists', () => {
  const pool = new Set();
  for (let n = 0; n < 20; n++) pool.add([...suggestPair('x', n)].sort().join('+'));
  assert.equal(pool.size, 20);
  const bal = read('docs/BALANCE.md'), a = bal.indexOf('the twenty pairs where one Background covers a weak spot of the other): '), b = bal.indexOf('. Nothing else is open here.', a);
  assert.ok(a > 0 && b > a, 'the list is there');
  const idOf = Object.fromEntries(PERK_IDS.map((id) => [PERKS[id].name, id]));
  const said = bal.slice(a + 'the twenty pairs where one Background covers a weak spot of the other): '.length, b).split('; ').map((pair) => pair.split(' with ').map((n) => idOf[n]).sort().join('+'));
  assert.ok(said.every((k) => k.split('+').every(Boolean)), 'every name is a Background\'s');
  assert.deepEqual(said.sort(), [...pool].sort(), 'the list in the document is the list in the code');
  // and the two pairs the new trait moved out of it
  assert.ok(!pool.has('grad+native') && !pool.has('grad+trades') && pool.has('grad+second') && pool.has('pro+roots'));
});

// ============================================================================================================================ L2. the Open note
test('L2: BALANCE.md\'s old "Open" note is closed: what it still says is the code\'s, and the one thing left open is named', () => {
  const md = read('docs/BALANCE.md'), i = md.indexOf('The Draft screen and the wreck price: closed'), p = md.slice(i, md.indexOf('## Decisions the spec left open'));
  assert.ok(i > 0); assert.doesNotMatch(md, /Open, and for the owner of the file named/);
  assert.match(p, /one question left for the author/);
  // its figures against the code
  near(traitScores(['grad']).find((t) => t.id === 'buyers').score, 0.096); near(traitScores(['heir']).find((t) => t.id === 'buyers').score, 0.04);
  near(traitScores(['native']).find((t) => t.id === 'prices').score, 0.1); near(traitScores(['pro']).find((t) => t.id === 'prices').score, -0.07);
  near(traitScores(['native']).find((t) => t.id === 'steady').score, -0.18);
  assert.match(p, /Grad's alumni network reads \+0\.096 and Legacy Heir's family friends \+0\.04/);
  assert.match(p, /Digital Native \+0\.10, exactly at that edge, from \+0\.20; Seasoned Pro -0\.07/);
  assert.match(p, /Digital Native -0\.18, from -0\.27/);
  assert.match(p, /reads -0\.04 of stock costs \(it read \+0\.24\), so its stock costs are 0\.66 \(they were 0\.94/);
  assert.match(p, /Grad's -1 Ops reads -0\.02 \(it read -0\.12/);
  near(opsStockEffect(2), -0.04, 0.001); near(opsStockEffect(-1), -0.02, 0.005);
  assert.match(p, /the median of the 30 classes that can be repaired/);
  assert.equal(Object.values(ASSETS).filter((a) => a.repair > 0).length, 30);
  assert.ok(TRAIT_EDGE === 0.1);
  // the Codex and the Academy state a wreck's price, at the levels the note says
  assert.match(p, /1\.00 times its as-is value at Ops 1, 1\.42 at Ops 3, 1\.63 at Ops 4 and 2\.05 at Ops 6/);
  assert.match(p, /1\.00 at Ops 1 and 1\.21 at Ops 2/);
  assert.doesNotMatch(p, /price the wreck at its as-is value, which is the price at Ops 1/);
  // V2_DESIGN 15.3 agrees
  const v2 = read('docs/V2_DESIGN.md'), s = v2.slice(v2.indexOf('### 15.3'));
  assert.match(s, /The Draft screen and the wreck price/); assert.doesNotMatch(s, /keeps one open item/);
});

// ============================================================================================================================ L3. section 11 of the design
test('L3: V2_DESIGN section 11 quotes the managers-against-hand-play figures that BALANCE.md measured on this build, and the table says when it was measured again', () => {
  const v2 = read('docs/V2_DESIGN.md'), bal = read('docs/BALANCE.md');
  const sec = v2.slice(v2.indexOf('## 11. Balance targets'), v2.indexOf('## 4.1 District numbers'));
  assert.match(sec, /it ends 0\.68, 0\.65 and 0\.76 times as rich: docs\/BALANCE\.md/);
  assert.doesNotMatch(sec, /0\.69/); assert.doesNotMatch(sec, /0\.78 times/);
  // the BALANCE.md table row of this round
  const row = (h) => bal.split('\n').find((l) => l.startsWith(`| ${h} hours |`) && l.includes(' against '));
  assert.match(row('2'), /1\.45M against 978,000 \(0\.68x\)/); assert.match(row('4'), /1\.05M against 684,000 \(0\.65x\)/); assert.match(row('8'), /450,000 against 344,000 \(0\.76x\)/);
  assert.match(bal, /Re-measured on the build of the leftovers round/);
});

// ============================================================================================================================ L4. the faculty kit against the screens
test('L4: every control and label the faculty kit names is one a screen really has', () => {
  const kit = read('docs/FACULTY_KIT.md'), ui = read('js/ui/instructor.js') + read('js/main.js') + read('js/ui/debrief.js');
  const names = ['Create a room', 'Join a classroom', 'Copy student link', 'Access', 'Close room', 'Start simulation', 'Pause', 'Resume', 'Rewind 1 day', 'Pace preset', 'Deploy to cohort',
    'Transaction friction', 'Compliance audit frequency', 'Synthetic classmates filling the market', 'Demo students on this dashboard', 'EEI starting-capital floor', 'Algorithmic surprise events',
    'Inject Credit Crunch now', 'Export gradebook CSV', 'Keep this room', 'Show the recovery code', 'Copy the recovery code', 'Resume as instructor', 'Take the room back', 'Reopen room', 'Download workbook (.md)',
    'Global engine step controls', 'Manual black swan trigger', 'Asymmetric risk scaling', 'Live cohort metrics', 'Operational bottlenecks', 'Flagged peer trades', 'Roster and gradebook',
    'Demo: 1 virtual day = 30 s', 'One class session: 90 days in 90 min', 'One week: 90 days in 7 days', 'Four-week module: 90 days in 28 days', 'Replace the scheduled copy (pull it forward instead of stacking)'];
  for (const n of names) { assert.ok(kit.includes(n), `the kit names "${n}"`); assert.ok(ui.includes(n), `and a screen has "${n}"`); }
  // "Instructor, Take back a room" was the old name of "Resume as instructor: take back a room"
  assert.doesNotMatch(kit, /Instructor, Take back a room/);
  assert.ok(ui.includes('Resume as instructor: take back a room'));
  assert.match(kit, /the game itself also refuses a rewind or a shock until it has heard the hour/);
  assert.match(kit, /asks before \*\*Begin\*\* replaces it, and names that run/);
  // the gradebook's columns, in order, are the ones the kit lists
  const head = /const rows = \[\[([^\]]+)\]/.exec(read('js/ui/instructor.js'))[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(head.slice(0, 7), ['founder_id', 'alias', 'background_1', 'background_2', 'district_reached', 'level', 'net_worth']);
  assert.equal(head.at(-1), 'virtual_days_played');
  assert.equal(head.length, 17);
});

// ============================================================================================================================ L5. rewind and inject while the room is taking itself back
test('L5: a room taken back refuses a rewind or a shock until it has heard the class\'s hour: a reason, nothing sent, nothing changed, no throw', () => {
  store.clear();
  const sent = [];
  const mkInstr = (opts) => {
    const s = new Session(); s.pid = 'TEACH'; s.mode = 'instructor';
    s.joinRoom({ code: 'ROOMX', relay: '', role: 'instructor', handle: 'Instructor', ...opts });
    s.room.close(); s.room = { kind: 'local', send: (m) => sent.push(m), close() {}, on() {} };
    return s;
  };
  const first = mkInstr({}), code = first.recoveryCode();
  // an ordinary room: both go, and say so
  first.clock.set({ hour: 24 * 10, paused: true });
  let r = first.rewind(3); assert.equal(r.ok, true); assert.ok(sent.some((m) => m.t === 'rewind' && m.toHour === 24 * 7));
  r = first.inject('fed', { when: 0 }); assert.equal(r.ok, true); assert.ok(sent.some((m) => m.t === 'inject' && m.kind === 'fed'));
  // the same room, taken back from another device
  store.clear(); sent.length = 0;
  const back = mkInstr({ owner: code, recover: true });
  assert.equal(back.recovering, true);
  const before = back.clock.toJSON(), shocks = back.injected.size;
  for (const call of [() => back.rewind(1), () => back.rewind(7), () => back.inject('fed', { when: 0 }), () => back.inject('tiktok', { when: 24 }), () => back.inject('fed')]) {
    let res; assert.doesNotThrow(() => { res = call(); });
    assert.equal(res.ok, false, 'refused'); assert.match(res.msg, /waiting to hear the class's clock/); assert.match(res.msg, /again in a few seconds/);
  }
  assert.deepEqual(sent.filter((m) => m.t === 'rewind' || m.t === 'inject'), [], 'nothing went to the class (a rewind from the made-up hour 0 would have been a rewind to Day 1)');
  assert.equal(back.injected.size, shocks, 'no shock is recorded for a room that has not heard the hour');
  assert.equal(back.clock.now(), before.hour); assert.equal(back.clock.paused, true, 'and its own clock was not set to a rewound hour');
  // a student or a solo player never had these controls, and still return nothing
  const solo = new Session(); assert.equal(solo.rewind(1), undefined); assert.equal(solo.inject('fed'), undefined);
  // once the class's hour is heard the room goes back to working
  back._onMsg(JSON.parse(JSON.stringify({ t: 'clock', from: 'PC-STUD', role: 'student', hour: 24 * 40 + 3, speed: 16, paused: false, age: 0 })));
  assert.equal(back.recovering, false);
  sent.length = 0;
  r = back.rewind(2); assert.equal(r.ok, true); assert.ok(sent.some((m) => m.t === 'rewind' && m.toHour === 24 * 38), 'two days back from the class\'s own hour: ' + JSON.stringify(sent.find((m) => m.t === 'rewind')));
  r = back.inject('fed', { when: 0 }); assert.equal(r.ok, true); assert.ok(sent.some((m) => m.t === 'inject'));
  // the dashboard reports a refusal as one
  assert.match(read('js/ui/instructor.js'), /rewind\(b\) \{ const r = S\.rewind\(\+b\.dataset\.d\); toast\(r && r\.ok === false \? r\.msg : 'Rewind sent to all students\.'/);
  assert.match(read('js/ui/instructor.js'), /deploy\(\) \{ const r = S\.inject\([^\n]*toast\(r && r\.ok === false \? r\.msg : 'Event deployed to the cohort\.'/);
});

// ============================================================================================================================ L7. Begin asks before it replaces a saved run
const save = (over = {}) => {
  const g = new Game({ perks: ['trades', 'pro'], seed: 5, handle: 'Ada', pid: 'PC-AAAA' }); g.advanceTo(24 * 12 + 5);
  return { v: 1, mode: 'solo', worldSeed: 'solo-1', clock: { hour: g.s.hour, wall: Date.now(), speed: 1, paused: true }, state: g.s, savedAt: Date.now(), ...over };
};

test('L7: describeSave names a saved run that can be played, and nothing else; it never throws', () => {
  const run = describeSave(save());
  assert.deepEqual(run, { handle: 'Ada', day: 13, perks: ['trades', 'pro'], room: '' });
  // a classroom's run carries its room; a solo run's room is not one
  assert.equal(describeSave(save({ mode: 'student', room: { code: 'abcd', relay: '' } })).room, 'ABCD');
  assert.equal(describeSave(save({ room: { code: 'ZZZZ' } })).room, '', 'a solo save names no room');
  assert.equal(describeSave(save({ mode: 'student', room: { code: '!!' } })).room, '');
  // the three-profile game's save, and everything that is not a save
  const old = save(); old.state.v = 1;
  for (const x of [null, undefined, 0, 7, 'x', [], {}, { v: 1 }, { v: 2, state: { v: 2, perks: [] } }, { v: 1, state: null }, { v: 1, state: { v: 2 } }, { v: 1, state: { v: 2, perks: 'trades' } }, old, save({ v: 2 })]) assert.equal(describeSave(x), null, JSON.stringify(x)?.slice(0, 60));
  // text from storage is cleaned and bounded
  const odd = save(); odd.state.handle = '\u0007Ada<img src=x>' + 'y'.repeat(40); odd.state.hour = 1e9; odd.state.perks = ['trades', 7, 'pro', 'native'];
  const d = describeSave(odd); assert.ok(d.handle.length <= 20 && !/[\u0000-\u001f]/.test(d.handle)); assert.equal(d.day, 90); assert.deepEqual(d.perks, ['trades', 'pro']);
  const hostile = save(); hostile.state.hour = NaN; hostile.state.handle = {}; assert.doesNotThrow(() => describeSave(hostile)); assert.equal(describeSave(hostile).day, 1);
  assert.equal(describeSave(JSON.parse(JSON.stringify(save()))).day, 13, 'the same after a round trip through storage');
});

test('L7: the question names the saved run and the run that would replace it, the safe answer has the cursor, and nothing in it can inject markup', () => {
  const html = replaceRunHTML({ handle: 'Ada', day: 13, perks: ['trades', 'pro'], room: '' });
  assert.match(html, /Replace your saved run\?/); assert.match(html, /<b>Ada<\/b>, day 13 \(Licensed Tradesperson and Seasoned Pro\)/);
  assert.match(html, /Beginning a new solo run replaces it, and it cannot be brought back\./);
  const keep = html.indexOf('data-close'), replace = html.indexOf('data-replace');
  assert.ok(keep > 0 && replace > keep, 'Keep my saved run comes first'); assert.match(html, /<button class="btn ghost" data-close autofocus>Keep my saved run<\/button>/);
  assert.match(html, /<button class="btn danger" data-replace>Replace it and begin<\/button>/); assert.equal((html.match(/autofocus/g) || []).length, 1, 'one place for the cursor');
  const room = replaceRunHTML({ handle: 'Ada', day: 13, perks: ['trades'], room: 'KLMN' }, { code: 'ROOMX' });
  assert.match(room, /in room <b class="mono">KLMN<\/b>/); assert.match(room, /Beginning a new run in room <b class="mono">ROOMX<\/b> replaces it/);
  const evil = replaceRunHTML({ handle: '<img src=x onerror=alert(1)>', day: 'x', perks: ['__proto__', 'constructor', 'trades'], room: '<b>' }, { code: '"><script>' });
  assert.doesNotMatch(evil, /<img|<script/); assert.match(evil, /&lt;img src=x/); assert.match(evil, /&lt;b&gt;/); assert.match(evil, /day 0/); assert.match(evil, /\(Licensed Tradesperson\)/);
  assert.match(replaceRunHTML({ handle: '', day: 1, perks: [], room: '' }), /your founder, day 1\./);
});

test('L7: main.js asks before it starts a run over a saved one, and the draft\'s Begin works again when it was only a question', () => {
  const main = read('js/main.js'), fn = main.slice(main.indexOf('onBegin({ perks, specialty, handle }) {'), main.indexOf('cleanup = () => m.destroy();', main.indexOf('onBegin({ perks, specialty, handle }) {')));
  assert.match(fn, /const old = describeSave\(kv\.get\('save'\)\);\n\s+if \(!old\) \{ begin\(\); return; \}\n\s+askReplace\(old, room, begin\);\n\s+return false;/);
  assert.ok(fn.indexOf('const begin = () =>') < fn.indexOf('describeSave(') && fn.indexOf('S.startGame(') < fn.indexOf('describeSave('), 'the run starts only inside begin(), which askReplace calls on the second answer');
  assert.equal((fn.match(/S\.startGame\(/g) || []).length, 1); assert.equal((fn.match(/S\.joinRoom\(/g) || []).length, 1);
  assert.match(main, /d\.querySelector\('\[data-close\]'\)\.onclick = \(\) => dlg\.close\(\);\n\s+d\.querySelector\('\[data-replace\]'\)\.onclick = \(\) => \{ dlg\.close\(\); begin\(\); \};/);
  const draft = read('js/ui/draft.js');
  assert.match(draft, /if \(onBegin\?\.\(\{ perks: c\.perks, specialty: c\.specialty, handle: c\.handle \}\) === false\) \{ begun = false; \$\('#dr-begin', root\)\?\.removeAttribute\('aria-busy'\); \}/);
  // a run that is begun without a saved one, or after the in-game menu's Join (which deleted the save already), starts at once: nothing to name
  assert.match(read('docs/ARCHITECTURE.md'), /## Open decisions[\s\S]*One save slot: Begin replaces a saved run/);
  assert.match(read('docs/ARCHITECTURE.md'), /Keep both: park the solo run under a second key/);
});

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const freePort = () => new Promise((res) => { const s = netServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

test('L7: in Chrome, Join then Begin over a saved solo run asks first; Keep leaves the save and the draft; Replace begins in the room and writes the new run', { timeout: 120000 }, async (t) => {
  if (process.env.PC_NO_BROWSER || !existsSync(CHROME)) { t.skip('no Chrome here'); return; }
  const { launch, open } = await import('../scripts/cdp.mjs');
  const port = await freePort(), cdp = await freePort();
  const srv = spawn(process.execPath, ['server/static.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  const b = await launch(cdp);
  const until = async (p, expr, what, ms = 20000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await p.eval(expr); if (last) return last; } catch { /* between screens */ } await p.sleep(100); } assert.fail(`timed out waiting for ${what}`); };
  const base = `http://127.0.0.1:${port}/?slot=lv1`;
  try {
    const p = await open(b, base, { w: 1280, h: 800 });
    await until(p, `!!document.querySelector('#app h1')`, 'the title screen');
    const blob = JSON.stringify(save());
    await p.eval(`localStorage.setItem('pc.save.lv1', ${JSON.stringify(blob)}); localStorage.setItem('pc.academyDone.lv1', 'true')`);
    await p.eval(`location.href = ${JSON.stringify(base)}`);
    await until(p, `[...document.querySelectorAll('button')].some(b => /Resume your run/.test(b.textContent))`, 'Resume your run (a run is saved)');
    // Join a classroom, then the draft
    await p.eval(`document.querySelector('#jc').value = 'roomx'; [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Join').click(); true`);
    await until(p, `document.title === 'Draft your build | Paperclip Capitalist'`, 'the draft');
    for (const id of ['native', 'roots']) await until(p, `(() => { const c=[...document.querySelectorAll('input[type=checkbox]')].find(c=>c.value==='${id}'); if(!c) return false; if(!c.checked) c.click(); return c.checked; })()`, `the ${id} Background`);
    const begin = `(() => { const b = document.querySelector('#dr-begin'); b.click(); return true; })()`;
    await p.eval(begin);
    await until(p, `document.querySelector('dialog#dlg').open && /Replace your saved run\\?/.test(document.querySelector('dialog#dlg').textContent)`, 'the question');
    const said = await p.eval(`document.querySelector('dialog#dlg').textContent`); // (textContent: the sheet sets headings and buttons in capitals, which innerText returns)
    assert.match(said, /Ada, day 13 \(Licensed Tradesperson and Seasoned Pro\)/); assert.match(said, /new run in room ROOMX/);
    assert.equal(await p.eval(`document.activeElement && document.activeElement.textContent.trim()`), 'Keep my saved run', 'the cursor is on the safe answer');
    assert.equal(await p.eval(`localStorage.getItem('pc.save.lv1')`), blob, 'nothing has been written');
    // keep it: the dialog goes, the draft stays as it was, the save is untouched
    await p.eval(`document.querySelector('dialog#dlg [data-close]').click(); true`);
    await until(p, `!document.querySelector('dialog#dlg').open`, 'the dialog to close');
    assert.equal(await p.eval(`document.title`), 'Draft your build | Paperclip Capitalist');
    assert.equal(await p.eval(`document.querySelectorAll('input[type=checkbox]:checked').length`), 2, 'the two picks are kept');
    assert.equal(await p.eval(`document.querySelector('#dr-begin').getAttribute('aria-busy')`), null, 'Begin is not stuck busy');
    assert.equal(await p.eval(`localStorage.getItem('pc.save.lv1')`), blob);
    // Begin works again, asks again, and this time it is replaced
    await p.eval(begin);
    await until(p, `document.querySelector('dialog#dlg').open`, 'the question again');
    await p.eval(`document.querySelector('dialog#dlg [data-replace]').click(); true`);
    await until(p, `document.title === 'The world | Paperclip Capitalist' && !!document.querySelector('canvas')`, 'the world', 30000);
    const now = JSON.parse(await p.eval(`localStorage.getItem('pc.save.lv1')`));
    assert.deepEqual([...now.state.perks].sort(), ['native', 'roots']); assert.equal(now.mode, 'student'); assert.equal(now.room.code, 'ROOMX'); assert.notEqual(now.state.pid, undefined);
    // with nothing saved there is nothing to ask: a solo run over an empty slot starts at once
    await p.eval(`window.pc.S.reset(); location.href = ${JSON.stringify(base)}`); // (reset drops the run in memory too: the page saves it again as it unloads, otherwise)
    await until(p, `[...document.querySelectorAll('button')].some(b => /Play solo/.test(b.textContent))`, 'Play solo (nothing is saved)');
    await p.eval(`[...document.querySelectorAll('button')].find(b => /Play solo/.test(b.textContent)).click(); true`);
    await until(p, `document.title === 'Draft your build | Paperclip Capitalist'`, 'the draft');
    for (const id of ['trades', 'pro']) await until(p, `(() => { const c=[...document.querySelectorAll('input[type=checkbox]')].find(c=>c.value==='${id}'); if(!c) return false; if(!c.checked) c.click(); return c.checked; })()`, `the ${id} Background`);
    await p.eval(begin);
    await until(p, `document.title === 'The world | Paperclip Capitalist'`, 'the world with no question asked', 30000);
    const bad = p.logs.filter((l) => /^(error|EXC)/.test(l) && !/chrome-extension:\/\//.test(l));
    assert.deepEqual(bad, [], 'no console error');
    await p.close();
  } finally { b.close(); srv.kill('SIGTERM'); }
});
