// The repair round that closed the finish review (branch v2/finish): every fault the reviewers found in the finished tree, held by a test that fails on the fault.
//   F1-F10  the documents, the comments and one player-facing word that said something the tree no longer does (spelling of a region, sizes, balance figures, the kit's recovery flow, a skill's blurb)
//   A1-A7   the Academy: a clock a lesson tells you to stop and cannot be stopped in time, a card that says money comes home when it goes straight out again, a Deal Room button that
//           does not exist, words the card never prints, a last step that frames the goal and not the control, a card over a button
//   B1-B2   the keyboard: a card over the Bid and Drop out buttons at 200% zoom, a focus ring cut by the window's edge
//   C1, V1-V6  the recovery wait, the privacy line, the licence, the grading link, the staged folder, the two guards of the Academy, the local server's icon
//   Round 2 (the browser reviewer's A1 and A2, tests named "round 2"): a coach card over the dock button it tells the player to press (at 200% zoom), and a sale that is paid 10% under the price the Close stage
//           agreed with nothing on screen to say why
// The browser half (real keys and real clicks in headless Chrome) is the last test; it is skipped without Chrome or with PC_NO_BROWSER=1. Run: node --test tests/finish-repair.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, activeElement: null };

const { ROOT, walk } = await import('../scripts/preload.mjs');
const { stage } = await import('../scripts/stage.mjs');
const A = await import('../js/ui/academy-sandbox.js');
const AC = await import('../js/ui/academy.js');
const UI = await import('../js/ui/deal.js');
const D = await import('../js/deal.js');
const { ACADEMY } = await import('../js/meta/academy.js');
const { REGIONS } = await import('../js/world/island.js');
const { SKILLS, ECON } = await import('../js/config.js');
const { traitScores, BUDGET_WEIGHT } = await import('../js/ui/draft.js');
const { instructorParts, RECOVER_WAIT_SECONDS, KIT_URL } = await import('../js/ui/instructor.js');
const { Session } = await import('../js/session.js');
const { makeGame } = await import('./bot.mjs');
const { fakeCtx } = await import('./helpers/ctx.mjs');
const { measured } = await import('./helpers/staged-size.mjs'); // what scripts/stage.mjs publishes, measured the way docs/ARCHITECTURE.md says (also printed by scripts/arch-figures.mjs). Every top-level await stays up here: one in the middle of the file lets the runner finish before the `test.after` at the foot of the file is registered, and the browser tests' Chrome is never closed

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const M = (id) => ACADEMY.find((m) => m.id === id);
const STEP = (m, id) => m.steps.find((s) => s.id === id);
const num = (s) => +String(s).replace(/,/g, '');

// ====================================================================================================================================
// F1 to F10: documents, comments and words
// ====================================================================================================================================

test('F1: the overworld map names its regions the American way, and the spelling test now reads the world\'s own strings', () => {
  assert.equal(REGIONS.find((r) => r.id === 'B').name, 'City and harbor', 'the map draws this name in capitals');
  for (const r of REGIONS) assert.doesNotMatch(r.name, /harbour|colour|centre|grey/i, r.name);
  const spelling = read('tests/remaining-content.test.mjs');
  assert.doesNotMatch(spelling, /startsWith\('js\/world\/'\)/, 'js/world/ is no longer skipped by the spelling test');
  assert.match(read('js/world/island.js'), /city and harbor, industry/, 'and the comment agrees');
});


// F2 holds the document's figures to the staged tree's. docs/ARCHITECTURE.md is the orchestrator's file (docs/RENDER_PLAN.md rule 11): the art tracks add modules to js/world/ and every module moves these figures, so on a
// track branch the test tolerates growth or shrinkage of js/world/ (at most 24 modules, every one of them under js/world/, and 10% of the sizes) and the title screen's own set must not change at all. With
// PC_STRICT_DOCS=1 the figures are exact (1% of the sizes, the module counts equal): the orchestrator runs that after `node scripts/arch-figures.mjs --write` at every merge, and so does the staged site's workflow.
const STRICT = process.env.PC_STRICT_DOCS === '1', ALLOW = 24;
test('F2: the sizes docs/ARCHITECTURE.md quotes are the shipped tree\'s, not the launch pass\'s', () => {
  const md = read('docs/ARCHITECTURE.md'), m = measured(), kb = (n) => n / 1024, slack = STRICT ? 0.01 : 0.10;
  const close = (said, real, what) => assert.ok(Math.abs(said - real) / real <= slack, `${what}: the document says ${said} KB and the staged tree measures ${real.toFixed(1)} KB (within ${slack * 100}%; \`node scripts/arch-figures.mjs --write\` refreshes the document)`);
  const t = /\| Transferred \| about ([\d,]+) KB gzipped \(([\d,]+) KB of JavaScript and ([\d,]+) KB of CSS before gzip/.exec(md);
  assert.ok(t, 'the Transferred row says its three figures');
  close(num(t[1]), kb(m.total), 'gzipped'); close(num(t[2]), kb(m.js[0]), 'JavaScript'); close(num(t[3]), kb(m.css[0]), 'CSS');
  const q = /\| Requests \| (\d+): the page, 12 stylesheets, (\d+) modules/.exec(md); assert.ok(q, 'the Requests row says its figures');
  const grew = m.modules - num(q[2]);
  assert.equal(m.requests - num(q[1]), grew, 'requests and modules move together');
  if (STRICT) assert.equal(grew, 0, `the document says ${q[2]} modules and the tree has ${m.modules} (node scripts/arch-figures.mjs --write)`);
  else assert.ok(Math.abs(grew) <= ALLOW && grew <= m.world, `the document says ${q[2]} modules and the tree has ${m.modules}: more than ${ALLOW} apart, or growth outside js/world/ (the orchestrator refreshes the document at a merge)`);
  const f1 = /\| Before the first screen \| (\d+) requests, ([\d,]+) KB gzipped: the page, 12 stylesheets and the (\d+) modules of the static graph \|/.exec(md); assert.ok(f1, 'the first screen\'s row is there');
  assert.equal(num(f1[3]), m.title.n, 'the static graph is the title screen\'s modules'); assert.equal(num(f1[1]), m.first.requests, 'and the first screen\'s requests are the page, the sheets and those'); close(num(f1[2]), kb(m.first.gz), 'the first screen, gzipped');
  const s = /needs (\d+) modules, ([\d,]+) KB of JavaScript \(([\d,]+) KB gzipped\); the other (\d+), ([\d,]+) KB \(([\d,]+) KB gzipped\)/.exec(md);
  assert.ok(s, 'the split of the title screen and the rest is quoted');
  assert.equal(num(s[1]), m.title.n, 'the title screen\'s own set of modules does not change with the art'); assert.equal(m.rest.n - num(s[4]), grew, 'the rest of the modules moved with the tree');
  close(num(s[2]), kb(m.title.raw), 'title screen JavaScript'); close(num(s[3]), kb(m.title.gz), 'title screen gzipped'); close(num(s[5]), kb(m.rest.raw), 'the rest, JavaScript'); close(num(s[6]), kb(m.rest.gz), 'the rest, gzipped');
});

test('F3: the closing paragraph of BALANCE.md holds only what is still open, with the draft screen\'s real figures (closed in the leftovers round, one question left: tests/leftovers.test.mjs)', () => {
  const md = read('docs/BALANCE.md'), i = md.indexOf('The Draft screen and the wreck price: closed'), p = md.slice(i, md.indexOf('## Decisions the spec left open'));
  assert.ok(i > 0, 'the paragraph is there');
  assert.doesNotMatch(p, /price the wreck at its as-is value, which is the price at Ops 1/, 'the Codex and the Academy now state the open market\'s price (commit 3940256)');
  assert.doesNotMatch(p, /British spelling of "neighbor"/, '"neighbor" is the American form');
  assert.ok(Math.abs(BUDGET_WEIGHT - 0.8) < 1e-9);
  const buyers = (ids) => traitScores(ids).find((t) => t.id === 'buyers').score;
  assert.ok(Math.abs(buyers(['grad']) - 0.096) < 1e-9 && Math.abs(buyers(['heir']) - 0.04) < 1e-9, 'the draft screen\'s buyer flow: Grad 0.096, Heir 0.04');
  assert.match(p, /Grad's alumni network reads \+0\.096 and Legacy Heir's family friends \+0\.04/);
  assert.doesNotMatch(p, /Grad 0\.12/, 'the unweighted figure is gone');
  assert.match(p, /Digital Native \+0\.10, exactly at that edge, from \+0\.20; Seasoned Pro -0\.07/, 'the other trait figures are still the code\'s');
  assert.ok(Math.abs(traitScores(['native']).find((t) => t.id === 'prices').score - 0.1) < 1e-9 && Math.abs(traitScores(['pro']).find((t) => t.id === 'prices').score + 0.07) < 1e-9);
  // the two documents the paragraph is about agree with the code
  assert.match(read('js/meta/codex.js'), /1\.00 times its as-is value at Ops 1, 1\.42 at Ops 3, 1\.63 at Ops 4 and 2\.05 at Ops 6/);
  assert.match(read('js/play/pitch.js'), /neighbors/);
  const v2 = read('docs/V2_DESIGN.md'), s = v2.slice(v2.indexOf('### 15.3'));
  assert.doesNotMatch(s, /was not re-checked/, 'V2_DESIGN 15.3 no longer says the item was not re-checked');
  assert.match(s, /Grad 0\.096, Heir 0\.04/);
});

test('F4: V2_DESIGN 15.1 says Heir and Pro got a small boost and Second-Chance is the one that still lags, as the data and BALANCE.md do', () => {
  const v2 = read('docs/V2_DESIGN.md'), row = v2.split('\n').find((l) => l.startsWith('| 3 | Every pair reaches the milestones'));
  assert.ok(row, 'the row is there');
  assert.doesNotMatch(row, /still lag a little and were left as they are/);
  assert.match(row, /Legacy Heir and Seasoned Pro a small boost/); assert.match(row, /`leadBudget` 1\.05/); assert.match(row, /`digitalMult` 0\.85/); assert.match(row, /Second-Chance Hustler is the one that still lags/);
  const perks = read('js/data/perks.js');
  assert.match(perks, /leadBudget: 1\.05, noSpecialty/); assert.match(perks, /digitalMult: 0\.85, xpMult: 0\.85/);
  assert.match(read('docs/BALANCE.md'), /Second-Chance Hustler is the one that still lags/);
});

test('F5: V2_DESIGN section 11 quotes the ratios of the finished build: those BALANCE.md\'s own "this round" column prints', () => {
  const v2 = read('docs/V2_DESIGN.md'), bal = read('docs/BALANCE.md');
  const said = /it ends ([\d.]+), ([\d.]+) and ([\d.]+) times as rich: docs\/BALANCE\.md/.exec(v2);
  assert.ok(said, 'section 11 quotes three ratios');
  const table = bal.slice(bal.indexOf('### Managers and hand play'), bal.indexOf('Every family is under 1'));
  const col = ['2 hours', '4 hours', '8 hours'].map((h) => { const line = table.split('\n').find((l) => l.startsWith(`| ${h} |`)); return /\((\d\.\d\d)x\) \|$/.exec(line)[1]; });
  assert.deepEqual([said[1], said[2], said[3]], col, `section 11 says ${said.slice(1, 4)}, the table's "this round" column says ${col}`);
  assert.deepEqual(col, ['0.68', '0.65', '0.76']);
  // the Tradesperson with Seasoned Pro range: the lowest and the highest of the twelve runs BALANCE.md prints for this round's build
  const range = /\(Tradesperson with Seasoned Pro\) ends ([\d.]+) to ([\d.]+) times as rich without managers/.exec(v2);
  const runs = /On this round's build the same four seeds give ([\s\S]*?)\. `tests\/remaining-repair/.exec(bal);
  assert.ok(range && runs, 'both quote the pair');
  const all = [...runs[1].matchAll(/(\d\.\d\d)x/g)].map((x) => +x[1]);
  assert.equal(all.length, 12, 'four seeds at three rhythms');
  assert.equal(+range[1], Math.round(Math.min(...all) * 10) / 10); assert.equal(+range[2], Math.max(...all));
});

test('F6: the faculty kit\'s recovery flow names the controls the dashboard and the title screen really have, and says what the dashboard does while it waits', () => {
  const kit = read('docs/FACULTY_KIT.md'), main = read('js/main.js'), ins = read('js/ui/instructor.js');
  assert.doesNotMatch(kit, /Take back a room/, 'the old control name');
  for (const label of ['Resume as instructor', 'Keep this room', 'Show the recovery code', 'Copy the recovery code', 'Take the room back', 'Reopen room']) {
    assert.ok(kit.includes(label), `the kit names "${label}"`);
    assert.ok(main.includes(label) || ins.includes(label), `and the page has it`);
  }
  assert.match(kit, /waits about 15 seconds/); assert.match(kit, /switched off and a note says so/); assert.match(kit, /wait about a minute/); assert.match(kit, /60 seconds/);
  assert.match(read('js/session.js'), /_isInstructor[\s\S]{0,200}60000/, 'the minute is the session\'s own');
  assert.match(ins, /export const FOLLOW_SECONDS = 60;/);
  // the dashboard does build the panel the kit describes
  const s = new Session(); s.pid = 'TEACH'; s.mode = 'instructor'; s.roomInfo = { code: 'ROOM', relay: '' }; s.recoveryCode = () => 'abcd-abcd-abcd-abcd-abcd-abcd-abcd-abcd';
  const parts = instructorParts(s, {});
  assert.match(parts.keep, /Keep this room/); assert.match(parts.keep, /Show the recovery code/); assert.match(parts.keep, /Copy the recovery code/);
});

test('F7: the Ops blurb promises what Ops does: cheaper working lots, but a dearer wreck (and the rest of it is held in tests/leftovers.test.mjs)', () => {
  assert.doesNotMatch(SKILLS.ops.blurb, /lower sourcing prices/);
  assert.match(SKILLS.ops.blurb, /lower prices on working lots \(wrecks ask more as your Ops rises\)/);
  // the engine: a sound lot gets cheaper with Ops (97% of its value at Ops 1, 2.5 points less each level, never under 84%), a wreck dearer (1.00 times its as-is value at Ops 1, 1.21 at Ops 2)
  const lot = (ops) => Math.max(ECON.lotDiscLo, ECON.lotDiscHi - 0.025 * (ops - 1)), wreck = (ops) => Math.max(ECON.brokenLo, 1 - ECON.brokenSlope * (ops - 1));
  assert.ok(lot(4) < lot(1) && wreck(4) > wreck(1), 'the two prices move opposite ways with Ops');
  // ...and that is the engine's own rule: since the leftovers round the lot generator and the draft screen both read it from one function (market.js `lotShare`)
  assert.match(read('js/engine.js'), /let disc = lotShare\(ops, cond\);/, 'the engine prices a lot with the shared rule');
  assert.match(read('js/market.js'), /Math\.max\(ECON\.lotDiscLo, ECON\.lotDiscHi - LOT_STEP \* \(ops - 1\)\) : Math\.max\(ECON\.brokenLo, 1 - ECON\.brokenSlope \* \(ops - 1\)\)/, 'and that is the rule');
});

test('F8: the README layout names every top-level folder the repository tracks, dev/ included', () => {
  const md = read('README.md'), layout = md.slice(md.indexOf('## Project layout'), md.indexOf('## Privacy'));
  assert.match(layout, /^dev\/ +world-harness/m);
  for (const f of ['world-harness.html', 'world-harness.js']) assert.ok(existsSync(join(ROOT, 'dev', f)), `dev/${f} exists`);
  for (const f of ['assets/', 'css/', 'js/', 'server/', 'scripts/', 'tests/', 'docs/', 'dev/']) assert.ok(layout.includes(f), f);
  assert.match(read('docs/ARCHITECTURE.md'), /Never staged: `tests\/`, `server\/`, `docs\/`, `scripts\/`, `dev\/`/, 'and ARCHITECTURE.md lists dev/ among the folders that are not published');
});

test('F9: the world\'s quality governor is described with all three of its tiers', () => {
  assert.match(read('js/world/world.js'), /this\.fps = this\.slow > 4 \? 15 : this\.slow > 2 \? 20 : 30/);
  assert.match(read('docs/ARCHITECTURE.md'), /\(30 to 20 to 15 fps, lower device-pixel ratio\)/);
});

test('F10: the comments that quote numbers agree with the engine and with the final balance table', () => {
  assert.match(read('js/market.js'), /condition multiplier 0\.7\.\.1\.15 \(0\.85\.\.1\.15 in districts 1 and 2\)/);
  assert.match(read('js/engine.js'), /const q = z <= 2 \? 0\.85 \+ this\.rand\(\) \* 0\.3 : 0\.7 \+ this\.rand\(\) \* 0\.45;/, 'the engine\'s range');
  const cohort = read('js/cohort.js'), said = /the 90th percentile of the day-90 net worth is about \$([\d.]+)e6 at the quickest cadence/.exec(cohort);
  assert.ok(said, 'cohort.js cites the 90th percentile'); assert.doesNotMatch(cohort, /\$2\.3e6/);
  const bal = read('docs/BALANCE.md'), table = bal.slice(bal.indexOf('| Decision every | Build'), bal.indexOf('Against commit 816e7c4, the level'));
  const p90 = table.split('\n').filter((l) => l.includes('| this round |')).map((l) => num(l.split('|')[6].split('/')[2]));
  assert.equal(p90.length, 3);
  assert.equal(+said[1], Math.round(Math.max(...p90) / 1e5) / 10, 'and it is the largest day-90 p90 of this round\'s three cuts');
});

// ====================================================================================================================================
// A1 to A7: the Academy
// ====================================================================================================================================

test('A1: Other People\'s Money stops its own clock when the glut lands, so the Bank step looks at the stress the card asked about', () => {
  const m = M('m07'), shock = STEP(m, 'shock'), again = STEP(m, 'bank-again');
  assert.equal(shock.pause, true, 'the step that waits for the glut says the clock stops with it');
  for (const other of ACADEMY.flatMap((x) => x.steps.map((s) => [x.id, s]))) if (!(other[0] === 'm07' && other[1].id === 'shock')) assert.equal(other[1].pause, undefined, `${other[0]} ${other[1].id} is played with the clock in the player's hands`);
  assert.doesNotMatch(shock.say, /pause the clock/i, 'the card no longer tells the player to do what cannot be done in time');
  assert.match(shock.say, /warning pops up at once/); assert.match(shock.say, /The clock stops itself then/); assert.match(shock.hint, /the clock stops itself when the glut is in effect/);
  assert.match(again.say, /the clock has stopped/);
  // the real engine and the real step resolver: the pause is asked for at the glut's event, not before, and not by any other event
  const S = A.makeSandboxSession(m.setup, { id: m.id, zone: m.zone }), g = S.game, events = [];
  let run = A.startRun(m), paused = [];
  g.onEvent = (evt) => { events.push(evt.type); const r = A.feedRun(m, run, evt); run = r.run; if (r.pause) paused.push(evt.type + '@' + g.s.hour); };
  for (const id of ['bank', 'draw', 'market', 'buy', 'clock']) { const w = STEP(m, id).wait; assert.equal(A.feedRun(m, run, w.type === 'event' ? { type: w.event } : w.type === 'ui' ? { type: 'ui', ui: w.ui, id: w.id } : { type: 'click', anchor: w.anchor }).pause, false, `${id} does not pause`); run = A.feedRun(m, run, w.type === 'event' ? { type: w.event } : w.type === 'ui' ? { type: 'ui', ui: w.ui, id: w.id } : { type: 'click', anchor: w.anchor }).run; }
  assert.equal(run.i, 5, 'five steps are done');
  g.advanceTo(5); assert.deepEqual(paused, [], 'the warning (hour 1) is not the glut');
  g.advanceTo(8); assert.deepEqual(paused.map((x) => x.split('@')[0]), ['shock'], 'the glut took hold and the runner is told to stop the clock');
  assert.equal(run.i, 6);
  assert.match(read('js/ui/academy.js'), /if \(r\.pause\) \{ try \{ sb\.setPaused\(true\); \}/, 'and the runner does');
});

test('A1 (the runner\'s rule): feedRun asks for a pause only when the step it just finished says so', () => {
  const m = { steps: [{ id: 'a', wait: { type: 'event', event: 'x' }, pause: true }, { id: 'b', wait: { type: 'event', event: 'y' } }], win: { event: 'z' } };
  let run = A.startRun(m);
  let r = A.feedRun(m, run, { type: 'y' }); assert.deepEqual([r.advanced, r.pause], [false, false], 'a wrong event neither advances nor pauses');
  r = A.feedRun(m, run, { type: 'x' }); assert.deepEqual([r.advanced, r.pause], [true, true]); run = r.run;
  r = A.feedRun(m, run, { type: 'y' }); assert.deepEqual([r.advanced, r.pause], [true, false], 'the next step does not');
  assert.equal(A.feedRun(m, { ...run, won: true }, { type: 'x' }).pause, false, 'a finished lesson pauses nothing');
});

test('A2: the card says the profit comes home and the capital goes straight out again, and the engine does exactly that', () => {
  const m = M('m06'), clock = STEP(m, 'clock');
  assert.doesNotMatch(clock.say, /go out and come home/); assert.match(clock.say, /only the profit stays in your wallet: the manager sends the \$450 straight out again/);
  assert.match(m.why.body[0], /The capital goes straight back out each cycle, so your wallet shows only the profit\./);
  const S = A.makeSandboxSession(m.setup, { id: m.id, zone: m.zone }), g = S.game;
  const hired = g.hirePipeline('student', 5, { cls: 'laptops', buyer: 'trainer' }), pipe = g.s.pipes[0];
  assert.ok(hired.ok !== false && pipe, 'the Student is hired in the lesson\'s own sandbox: ' + JSON.stringify(hired));
  {
    const fee = 620 - g.s.cash;
    assert.ok(fee > 100 && fee < 140, `the Student's fee left the wallet: $${fee.toFixed(2)}`);
    for (let h = 1; h <= 400 && !pipe.cycles; h++) g.advanceTo(g.s.hour + 1);
    assert.equal(pipe.cycles, 1, 'one cycle finished');
    assert.ok(pipe.inflight >= 400, `the capital is already out again ($${pipe.inflight})`);
    assert.ok(g.s.cash < 100 + (pipe.profit || 0), `the wallet holds ${g.s.cash.toFixed(2)}: what was left after the hire, plus the profit of ${(pipe.profit || 0).toFixed(2)}, and not the $450`);
  }
  assert.match(read('js/engine.js'), /s\.cash \+= p\.inflight \+ f\.net;[\s\S]{0,120}p\.inflight = 0;/, 'the engine pays the capital and the net home at the end of a cycle');
  assert.match(read('js/engine.js'), /if \(alloc > 0 && s\.cash >= alloc\) \{ s\.cash -= alloc; p\.inflight = alloc;/, 'and sends the capital out again at once while the wallet can pay it');
});

test('A3: the Deal Room\'s whole-deal Quick carries the lesson\'s frame, and the card names the button the room really shows', () => {
  // the room's own HTML, from a real sell deal in the lesson\'s sandbox
  const m = M('m01'), sb = A.makeSandboxSession(m.setup, { id: m.id, zone: m.zone }).game;
  const run = D.startRun(sb, { kind: 'sell', assetId: sb.s.assets[0].id, leadId: 'sim-student' }); assert.ok(run.ok, run.msg);
  const html = () => UI.sheetHTML({ ...D.modelOf(run, {}), pick: [], slider: 0.2 });
  const anchored = (h) => [...h.matchAll(/<button[^>]*data-anchor="deal-quick"[^>]*>([^<]*)<\/button>/g)].map((x) => x[1]);
  assert.deepEqual(anchored(html()), ['Quick deal'], 'two Quick buttons on the first stage: the frame goes on the one the lesson means');
  assert.match(html(), /Quick: auto-play at average skill/, 'the stage\'s Quick is still there');
  run.quick(); assert.deepEqual(anchored(html()), [], 'a stage that is done offers Continue');
  assert.ok(run.next()); assert.deepEqual(anchored(html()), ['Quick: auto-play at average skill'], 'the next stage has one Quick and it carries the frame');
  run.quick(); assert.deepEqual(anchored(html()), []); assert.match(html(), /See the result/, 'the last stage, done, offers See the result');
  // the card\'s note
  const note = (deal) => A.unseenNote('deal-quick', STEP(m, 'student').wait, { modal: 'deal', deal });
  assert.match(note({ kind: 'sell', stageDone: true, last: true }), /not on this stage of the deal\. Press See the result to finish the deal\./);
  assert.match(note({ kind: 'sell', stageDone: true, last: false }), /Press Continue to move on to the next stage\./);
  assert.match(note({ kind: 'sell', stageDone: false }), /Finish this stage, or press its Quick, and Continue moves on\. See the result ends the deal\./);
  assert.match(note({ kind: 'sell', done: true }), /That deal is finished\. Press Continue to close it/, 'the result sheet\'s own button is Continue');
  for (const d of [{ kind: 'sell', stageDone: true, last: true }, { kind: 'sell', stageDone: true }, { kind: 'sell' }]) assert.doesNotMatch(note(d), /closing the deal ends it/, 'the old sentence named a Continue that is not there');
  // openDealOf says what the foot offers, from a live session
  const ctx = fakeCtx(); ctx.dlg = { open() {}, close() {}, el: {} }; ctx.setHTML = () => true;
  const ses = UI.createSession(ctx, run); ses.show();
  try {
    const of = UI.openDealOf(); assert.deepEqual([of.kind, of.stageDone, of.last, of.done], ['sell', true, true, false]);
    run.finish(); assert.deepEqual([UI.openDealOf().done, UI.openDealOf().stageDone], [true, false]);
  } finally { ses.dispose(); }
  assert.equal(UI.openDealOf(), null);
});

test('A4: the Deal Room\'s card keeps off what the lessons ask the player to read', () => {
  const src = read('js/ui/academy.js');
  assert.match(src, /const READ = '\.deal \.bubble, \.deal-stage \.callout, \.deal-result \.rhead, \.deal-result \.rlines, \.deal-score > div';/);
  assert.match(src, /for \(const e of host\.querySelectorAll\(READ\)\) add\(e, 0\.4\);/, 'at a weight under a control\'s');
  // the selectors name things the room really draws
  const m = M('m01'), g = A.makeSandboxSession(m.setup, { id: m.id, zone: m.zone }).game, run = D.startRun(g, { kind: 'sell', assetId: g.s.assets[0].id, leadId: 'sim-student' });
  run.quick(); const h = UI.sheetHTML({ ...D.modelOf(run, {}), pick: [], slider: 0.2 });
  for (const part of ['class="bubble"', 'class="deal-score"', 'class="callout']) assert.ok(h.includes(part), part);
});

test('A5: a lesson that finishes on a control names it, the control carries the anchor, and a control below the drawer\'s fold is not framed where it cannot be seen', () => {
  const anchors = { m06: 'drawer', m07: 'bank-repay', m09: 'stock-sell-pool' };
  for (const [id, anchor] of Object.entries(anchors)) {
    const m = M(id), c = A.coachFor(m, { i: m.steps.length, n: m.steps.length, won: false });
    assert.equal(m.finish.anchor, anchor); assert.equal(c.anchor, anchor, `${id}: the last step frames ${anchor}, not the goal card`); assert.equal(c.finishing, true);
    assert.equal(A.parseAnchor(anchor).kind, 'dom'); if (anchor !== 'drawer') assert.ok(A.DOM_ANCHORS.includes(anchor), `${anchor} is a listed anchor`);
  }
  assert.equal(A.coachFor(M('m01'), { i: 4, n: 4 }).anchor, 'tracker', 'a lesson that names no control still frames its goal');
  assert.equal(A.coachFor({ steps: [{ id: 'a', say: 'x'.repeat(40), anchor: 'hud-cash', wait: null }], finish: { say: 'y', anchor: 'Bad Anchor!' } }, { i: 1, n: 1 }).anchor, 'tracker', 'an anchor that is not one falls back to the goal');
  // the controls carry them
  const bank = read('js/ui/drawers/bank.js'), stock = read('js/ui/drawers/stock.js');
  assert.equal((bank.match(/data-act="bank-repay" data-anchor="bank-repay"/g) || []).length, 2, 'Repay half and Repay all of every loan');
  assert.match(stock, /btn\('stock-sellpool', 'Sell to the pool', !!\(pq && pq\.ok\), '', 'stock-sell-pool'\)/);
  // a control that exists but has scrolled out of the drawer's body: the card says where it is and that Show me scrolls to it, and Show me says so
  const clipped = A.unseenNote('bank-repay', null, { exists: true, clipped: true });
  assert.match(clipped, /lower down this panel\. Press Show me and the panel scrolls to it\./);
  assert.equal(A.unseenNote('bank-repay', null, { exists: true }), '', 'a control in view needs no note');
  assert.match(A.unseenNote('bank-repay', null, {}), /Open the Bank from the dock below/); assert.match(A.unseenNote('stock-sell-pool', null, {}), /tick the crates to sell/);
  const c = A.coachFor(M('m07'), { i: 7, n: 7 });
  assert.match(AC.coachHTML(c, { title: 'x', showMe: true, framed: false, exists: true, clipped: true }), /It is lower down this panel\./);
  assert.doesNotMatch(AC.coachHTML(c, { title: 'x', showMe: true, framed: false, exists: true, clipped: true }), /too big for a frame/);
  const src = read('js/ui/academy.js');
  assert.match(src, /'ac-showme'\(\) \{ showMe = !showMe; if \(showMe\) bringIntoView\(\); paintCoach\(true\);/, 'Show me scrolls the control into view before the frame is placed');
  assert.match(src, /const spot = res && res\.via !== 'fallback' && !clipped &&/, 'a clipped control gets no frame (its 100vmax shadow would dim the whole window with the hole off screen)');
  assert.match(src, /if \(!\(el && body && body\.contains\(el\)\)\) return true;/, 'and only a control of the drawer\'s own body can be clipped: every other anchor is framed as it always was');
});

test('A6: the lesson about the herd speaks in the words the card and the result print', () => {
  const m = M('m08'), say = m.steps.map((s) => s.say).join(' ');
  assert.doesNotMatch(say, /Read its S and Cm on the card|result: price, S and Cm/);
  assert.match(STEP(m, 'market').say, /how crowded that buyer is \(S, the share of recent sales\) and shows the multiplier you would earn \(Cm, the Creativity Multiplier\)/);
  assert.match(STEP(m, 'boutique').say, /how crowded its card says it is \(S\) and its multiplier \(Cm\)/); assert.match(STEP(m, 'popup').say, /its crowd \(S\) and multiplier \(Cm\)/);
  // what the market card prints: the crowd in words with its share, and the multiplier as a chip
  const market = read('js/ui/drawers/market.js');
  assert.match(market, /recent sales, \$\{pc\(best\.ci\.S\)\}\)/); assert.match(market, /\$\{ci\.cm\.toFixed\(2\)\}x/);
  assert.match(read('js/ui/deal.js') + read('js/deal.js'), /Creativity multiplier/);
});

test('the Quick buttons the lessons mean are named "Quick deal" in every step that needs a finished deal', () => {
  for (const [id, step] of [['m01', 'student'], ['m05', 'fleet'], ['m07', 'buy'], ['m08', 'boutique'], ['m08', 'popup']]) assert.match(STEP(M(id), step).say, /Quick deal/, `${id} ${step}`);
});

test('A7: the card is placed again when the drawer scrolls, stays off every control of the drawer, and slims down to the words and the hint when it cannot', () => {
  const src = read('js/ui/academy.js'), css = read('css/ui-academy.css');
  assert.match(src, /ctx\.el\.drawer\.addEventListener\('scroll', later, true\)/); assert.match(src, /ctx\.el\.drawer\.removeEventListener\('scroll', later, true\)/, 'and lets go of it');
  assert.match(src, /for \(const e of root\.querySelectorAll\(CONTROL_SELECTOR\)\)/, 'every control of the screen counts: the drawer\'s title bar, its Close button and its tabs as much as the buttons in its body');
  assert.match(src, /if \(a !== e && k\.c\) \{ x0 = Math\.max\(x0, k\.c\.x0\)/, 'each cut to the part of the drawer\'s body it can be seen in: a control scrolled out of it counts for nothing');
  assert.match(src, /const TIERS = \{ full: '', slim: 'slim', narrow: 'slim narrow', handle: 'handle' \}/, 'the card, slim, narrow and the tab');
  assert.deepEqual(A.CARD_SIZES, ['full', 'slim'], 'the slim card is tried first: it keeps the step\'s words, and its hint once it is due');
  assert.match(src, /let pick = held === home && foldable && !open \? fit\(HANDLE_SIZE\) : chooseSize\(fit, \{ handle: foldable && !open, narrow: true, words: foldable && open \}\);/, 'and the runner asks for the size by one pure rule');
  assert.match(css, /\.ac-coach\.slim :is\(\.ac-look, \.ac-where\) \{ display: none; \}/); assert.doesNotMatch(css, /\.ac-coach\.slim[^{]*\.ac-(say|hint)/, 'the words and the hint stay');
});

// ====================================================================================================================================
// B1, B2: the keyboard
// ====================================================================================================================================

test('B1: no shape of the card drops its words, so at 200% zoom the card stands clear of the Bid and Drop out buttons or it is the tab', () => {
  const css = read('css/ui-academy.css');
  assert.doesNotMatch(css, /\.ac-coach\.(min|compact)\b/, 'the head-and-buttons shapes are gone: a card that said nothing left a player who is stuck with nothing to read');
  const sizes = (table, o = {}) => A.chooseSize((t) => ({ t, ...table[t] }), o);
  assert.equal(sizes({ full: { cursor: true, n: 0 }, slim: { cursor: false, n: 0 }, narrow: { cursor: false, n: 0 } }).t, 'slim', 'a size is taken when it clears the cursor');
  assert.equal(sizes({ full: { cursor: true, n: 0 }, slim: { cursor: true, n: 0 }, narrow: { cursor: true, n: 0 } }).t, 'full', 'every size covers the cursor: the full card, as before');
  assert.equal(sizes({ full: { cursor: true, n: 0 }, slim: { cursor: true, n: 0 }, narrow: { cursor: false, n: 2 }, handle: { n: 0 } }, { handle: true }).t, 'handle', 'a card that covers a button is not taken where the tab can be: it hides nothing');
  assert.equal(sizes({ full: { cursor: true, n: 0 }, slim: { cursor: true, n: 0 }, narrow: { cursor: false, n: 2 } }).t, 'narrow', 'a card that must be shown takes the size that clears the cursor');
});

test('B2: a control the keyboard scrolls into view rests inside the window\'s edge, so its 5px ring is never cut', () => {
  const base = read('css/styles.css'), ac = read('css/ui-academy.css');
  const html = /\nhtml \{[^}]*scroll-padding-block: calc\(\.5rem \+ var\(--stuck-t, 0px\)\) calc\(\.5rem \+ var\(--stuck-b, 0px\)\);/.exec(base); assert.ok(html, 'the page: half a rem, and clear of a sticky bar that stands over its edge (tests/rep-feet.test.mjs)');
  assert.match(ac, /\.ac-sheet \{[^}]*scroll-padding-block: \.5rem;/, 'the Academy\'s sheets scroll on their own');
  const reach = Number(/export const RING_REACH = (\d+)/.exec(read('js/ui/common.js'))[1]); assert.ok(0.5 * 16 > reach, `half a rem (8px) is more than the ${reach}px a ring reaches`);
  assert.match(read('css/shell.css'), /\.db \{[^}]*scroll-padding: calc\(var\(--sp-2\) \+ var\(--stuck-t, 0px\)\) var\(--sp-2\) calc\(var\(--sp-2\) \+ var\(--stuck-b, 0px\)\)/, 'the drawers already did the same, and stand clear of their sticky bars');
});

// ====================================================================================================================================
// C1, V1 to V6: the room, the privacy line, the licence, the grading link, the staged folder, the guards, the local server
// ====================================================================================================================================

test('C1: the copy says how long a taken-back room waits, and it is the session\'s own wait', () => {
  const wait = Number(/const RECOVER_WAIT_MS = (\d+);/.exec(read('js/session.js'))[1]);
  assert.equal(wait, 15000); assert.equal(RECOVER_WAIT_SECONDS * 1000, wait, 'one number, written twice');
  for (const f of ['js/main.js', 'js/ui/instructor.js']) assert.doesNotMatch(read(f), /a few seconds/, f);
  assert.match(read('js/main.js'), /This dashboard waits about \$\{RECOVER_WAIT_SECONDS\} seconds to hear the class's clock/);
  const s = new Session(); s.pid = 'TEACH'; s.mode = 'instructor'; s.roomInfo = { code: 'ROOM', relay: '' }; s.recovering = true;
  const parts = instructorParts(s, {});
  assert.match(parts.c1, /Taking the room back\.<\/b> This dashboard is waiting about 15 seconds to hear the class's clock/);
  assert.match(parts.c1, /aria-disabled="true"/, 'and the controls wait that long');
});

test('V1: the privacy lines say what "Start over" deletes: the run, not the Founder ID, the alias, the key, the settings or the Academy\'s progress', () => {
  const session = read('js/session.js'), reset = /\n  reset\(\) \{\n([^\n]+)\n/.exec(session)[1];
  assert.match(reset, /kv\.del\('save'\); this\._clearCkpt\(\)/); assert.doesNotMatch(reset, /kv\.del\('(handle|pid|key|settings|academyDone|academy|owners|instr)'\)/, 'Start over keeps all of these');
  for (const f of ['llms.txt', 'README.md', 'docs/COMPLIANCE.md']) {
    const t = read(f); assert.doesNotMatch(t, /"Start over" in the menu, or clearing the site's data, deletes (everything|it all)/, f);
    assert.match(t, /"Start over"[^.]*deletes the current run/, `${f} says what Start over deletes`);
    assert.match(t, /Founder ID, (the )?alias, (the )?identity key/, `${f} names what stays`);
  }
  const comp = read('docs/COMPLIANCE.md');
  assert.match(comp, /Clear site data \(Start over keeps them\); relay forgets on disconnect and restart/); assert.match(comp, /\| Game state and ledger \| Browser \| Until cleared \| Start over, or clear site data \|/);
  assert.match(read('js/ui/shell.js'), /This deletes your current run from this browser/, 'and the confirmation says the same');
});

test('V2: the licence the site declares is a file in the repository', () => {
  assert.ok(existsSync(join(ROOT, 'LICENSE')), 'LICENSE');
  const lic = read('LICENSE');
  assert.match(lic, /^MIT License\n\nCopyright \(c\) 2026 \S+\n/); assert.match(lic, /Permission is hereby granted, free of charge/); assert.match(lic, /THE SOFTWARE IS PROVIDED "AS IS"/);
  assert.equal(JSON.parse(read('package.json')).license, 'MIT'); assert.match(read('index.html'), /opensource\.org\/licenses\/MIT/); assert.match(read('llms.txt'), /MIT licensed/); assert.match(read('README.md'), /MIT licensed/);
  assert.ok(!/—/.test(lic), 'no em dash');
});

test('V3: the dashboard\'s grading line links to a rubric a visitor can open (docs/ is not published)', () => {
  assert.equal(KIT_URL, 'https://github.com/imaidan808/Paperclip-Capitalist/blob/main/docs/FACULTY_KIT.md');
  const s = new Session(); s.pid = 'TEACH'; s.mode = 'instructor'; s.roomInfo = { code: 'ROOM', relay: '' };
  const g = instructorParts(s, {}).grade;
  assert.ok(g.includes(`<a href="${KIT_URL}" target="_blank" rel="noopener noreferrer">faculty kit</a>`), 'a link, opened in its own tab, without the opener');
  assert.ok(existsSync(join(ROOT, 'docs/FACULTY_KIT.md')), 'the file the link names is in the repository');
  assert.match(read('llms.txt'), /blob\/main\/docs\/FACULTY_KIT\.md/, 'llms.txt links to the same file');
  assert.doesNotMatch(read('.github/workflows/pages.yml'), /docs\//, 'and the workflow publishes no docs/');
});

test('V4: the folder the workflow stages into is ignored by git', () => {
  const ignored = read('.gitignore').split('\n').map((l) => l.trim());
  assert.ok(ignored.includes('_site/'), '_site/'); for (const keep of ['node_modules/', '.DS_Store', '*.log']) assert.ok(ignored.includes(keep), keep);
  assert.match(read('.github/workflows/pages.yml'), /stage\.mjs _site/, 'the folder is the workflow\'s own');
});

test('V5: the Academy\'s lessons are imported statically: a bad deploy fails loudly and does not leave an empty Academy', () => {
  for (const f of ['js/ui/academy.js', 'js/ui/drawers/codex.js']) {
    const src = read(f);
    assert.doesNotMatch(src, /TEMPORARY/, `${f}: no marker of a guard that was to go at the merge`);
    assert.doesNotMatch(src, /await import\(/, `${f}: no top-level await of the lessons`);
  }
  assert.match(read('js/ui/academy.js'), /^import \{ ACADEMY as MISSIONS \} from '\.\.\/meta\/academy\.js';$/m);
  assert.match(read('js/ui/drawers/codex.js'), /^import \{ ACADEMY as MISSIONS \} from '\.\.\/\.\.\/meta\/academy\.js';$/m);
  assert.equal(AC.missionList().length, 10, 'and the Academy has its ten lessons');
  const g = walk(); assert.ok(g.modules.includes('js/meta/academy.js')); assert.ok(g.edges['js/ui/academy.js'].statics.includes('js/meta/academy.js') && !g.edges['js/ui/academy.js'].dynamics.includes('js/meta/academy.js'), 'the Academy has its lessons when it loads, in the same fetch');
  assert.ok(g.dynamic.includes('js/play/haggle.js') && g.dynamic.includes('js/play/auction.js') && g.dynamic.includes('js/ui/academy.js'), 'the Deal Room\'s games and the Academy come with the game, loaded when a screen opens');
});

test('V6: the local server serves the page\'s icon, and still never the scenes it is drawn from', async () => {
  const { route } = await import('../server/static.mjs');
  const index = read('index.html');
  const hrefs = [...index.matchAll(/<link[^>]+rel="(?:icon|apple-touch-icon)"[^>]+href="([^"]+)"/g)].map((m) => m[1]).filter((h) => !/^(https?:|data:)/.test(h));
  assert.ok(hrefs.length >= 1, 'the page links its icon: ' + hrefs);
  for (const h of hrefs) { assert.ok(route('/' + h).file, `${h} is served`); assert.ok(existsSync(join(ROOT, h)), `${h} exists`); }
  for (const f of ['assets/favicon.svg', 'assets/apple-touch-icon.png', 'assets/share.png']) assert.deepEqual(route('/' + f), { file: f }, f);
  for (const no of ['/assets/src/share.html', '/assets/src/render.mjs', '/assets/src/icon.html', '/assets/', '/assets']) assert.ok(route(no).status === 404, no);
  assert.equal(route('/assets/%2e%2e/package.json').status, 404); assert.equal(route('/assets/.hidden.png').status, 404);
  assert.match(read('server/static.mjs'), /assets\/ \(the page's icons; not assets\/src\//, 'the header says so');
});

// ====================================================================================================================================
// Round 2 of the finish review. A1: the card over the control it names. A2: the price agreed against the price paid.
// ====================================================================================================================================

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const DOCK_ORDER = ['stock', 'market', 'crew', 'bank', 'travel', 'codex', 'quests'];
/**
 * What the runner's keepRects sees on the lesson-1 page with a drawer open, at a window of w x h CSS pixels, from the page measured in headless Chrome at 200% zoom (640x360 and 640x400, DPR 2): the HUD across the top,
 * the camera buttons down the left, the drawer on the right down to the dock, and the dock's buttons (47 apart, 43 by 38.4, centred, 52.4 above the foot). `n` buttons in the dock; the keyboard is on the one just pressed.
 */
function pageModel(w, h, n = 2, pressedBtn = 'stock') {
  const dockW = 47 * n + 8, dock = { x: (w - dockW) / 2, y: h - 58.4, w: dockW, h: 50.4 };
  const btn = (i) => ({ x: dock.x + 6 + 47 * i, y: h - 52.4, w: 43, h: 38.4 });
  const buttons = Object.fromEntries(DOCK_ORDER.slice(0, n).map((name, i) => [name, btn(i)]));
  const hud = [[12, 8, 54, 54], [96, 12, 87, 46], [191, 12, 96, 46], [412, 16, 38, 38], [458, 16, 77, 38], [543, 16, 39, 38], [590, 16, 38, 38]].map(([x, y, bw, bh]) => ({ x, y, w: bw, h: bh, wt: 2 }));
  const cam = [[12, 139.6], [55.4, 139.6], [12, 182.6], [55.4, 182.6]].map(([x, y]) => ({ x, y, w: 37.4, h: 37.4, wt: 2 }));
  const pad = 7, f = buttons[pressedBtn];
  const keep = [{ ...{ x: 212, y: 66, w: w - 224, h: h - 128 }, wt: 3 }, { ...dock, wt: 3 }, ...Object.values(buttons).map((b) => ({ ...b, wt: 2, ctl: true })), ...hud, ...cam,
    ...(f ? [{ x: f.x - pad, y: f.y - pad, w: f.w + 2 * pad, h: f.h + 2 * pad, wt: 1000, focus: true }] : [])];
  return { view: { w, h }, keep, buttons };
}
/** The card's sizes at a window 640 wide (the page measured: 624 wide, full and slim 158.5 tall when the words run to three lines; the narrow column 240 wide and about 230 tall; the tab 123 by 44). */
const SIZES = { full: { w: 624, h: 158.5 }, slim: { w: 624, h: 158.5 }, narrow: { w: 240, h: 230 }, handle: { w: 123, h: 44 } };

test('round 2 A1: placeCard never puts the card over the target while any place in the view is clear of it', () => {
  // a drawer that fills the view above the target, and a strip under it that is clear of everything but the target: the old weights (the target six times over, the drawer three times over a big area) took the strip
  const view = { w: 200, h: 200 }, card = { w: 150, h: 150 }, target = { x: 60, y: 170, w: 80, h: 25 };
  const avoid = [{ x: 0, y: 0, w: 200, h: 168, wt: 3 }];
  const p = A.placeCard(target, card, view, 14, 8, avoid);
  assert.ok(!overlaps({ x: p.x, y: p.y, w: 150, h: 150 }, target), `the card at ${p.x},${p.y} is off the target`);
  // when the target is everything (no place is clear of it) the card still goes somewhere
  const all = A.placeCard({ x: 0, y: 0, w: 200, h: 200 }, card, view, 14, 8, []);
  assert.ok(Number.isFinite(all.x) && Number.isFinite(all.y));
  // the order of harm among the places that are clear of the target: not over the keyboard's cursor, then the fewest buttons, then the least area
  const wide = { w: 300, h: 100 }, c2 = { w: 100, h: 100 };
  const btns = [{ x: 0, y: 0, w: 100, h: 100, wt: 2, ctl: true }, { x: 100, y: 0, w: 100, h: 100, wt: 2, ctl: true }, { x: 200, y: 0, w: 100, h: 100, wt: 1, ctl: true }]; // a row of buttons filling the view: any place touches one
  const big = [{ x: 0, y: 0, w: 100, h: 100, wt: 1 }, { x: 100, y: 0, w: 100, h: 100, wt: 1 }, { x: 200, y: 0, w: 100, h: 100, wt: 1 }];
  const q = A.placeCard(null, c2, wide, 14, 0, btns);
  assert.ok(q.x >= 200 - 1e-6, `a card that must stand over a button picks the one the least is made of (the lightest, at x=${q.x}), which is the area rule among equals`);
  const focus = { x: 0, y: 0, w: 100, h: 100, wt: 1000, focus: true };
  const r = A.placeCard(null, c2, wide, 14, 0, [focus, { x: 100, y: 0, w: 200, h: 100, wt: 1, ctl: true }]);
  assert.ok(r.x >= 100 - 1e-6, `the keyboard's cursor outranks the buttons: the card is not over it (x=${r.x})`);
  assert.ok(A.placeCard(null, c2, wide, 14, 0, big), 'a view of covered ground still gets a card');
});

test('round 2 A1: chooseSize takes a smaller card before one that hides the control the step names, and weighs the cursor above the target above the buttons', () => {
  const pick = (table, o) => A.chooseSize((t) => ({ t, cursor: false, target: false, n: 0, ...table[t] }), o).t;
  assert.equal(pick({}), 'full', 'a clear card stays full');
  assert.equal(pick({ full: { target: true }, slim: { target: false } }), 'slim', 'over the target at full size: a smaller card that is clear of it');
  assert.equal(pick({ full: { target: true, n: 0 }, slim: { target: true, n: 0 }, narrow: { target: false, n: 3 } }), 'narrow', 'the target outranks the buttons');
  assert.equal(pick({ full: { target: true }, slim: { cursor: true }, narrow: { cursor: true } }), 'full', 'the cursor outranks the target: a card that hides the keyboard is wrong wherever else it lands');
  assert.equal(pick({ full: { n: 2 }, slim: { n: 2 }, narrow: { n: 2 } }), 'full', 'a tie goes to the larger card: more of the words');
  assert.equal(pick({ full: { target: true }, slim: { target: true }, narrow: { target: true } }), 'full', 'no size is clear: the full card, as it was');
  assert.equal(pick({ full: { target: true }, slim: { target: true }, narrow: { target: true }, handle: {} }, { handle: true }), 'handle', 'and where the card may fold, the tab');
});

test('round 2 A1: on the lesson-1 page at 640x360 and 640x400 the card stands clear of every dock button a step can name, with the drawer open and the keyboard on the button just pressed', () => {
  let n = 0;
  for (const [w, h] of [[640, 360], [640, 400], [640, 600]]) {
    for (const count of [2, 4, 7]) {
      for (const target of DOCK_ORDER.slice(0, count)) {
        for (const pressedBtn of [DOCK_ORDER[0], null]) { // the keyboard is on the first dock button (the last one pressed), or nowhere
          const L = pageModel(w, h, count, pressedBtn), spot = L.buttons[target];
          const sized = (t) => SIZES[t];
          const fit = (t) => { const s = sized(t), p = A.placeCard(spot, s, L.view, 14, 8, L.keep), box = { x: p.x, y: p.y, w: s.w, h: s.h }, cur = L.keep.find((r) => r.focus);
            return { t, s, p, cursor: !!cur && overlaps(box, cur), target: overlaps(box, spot), n: L.keep.filter((r) => r.ctl && overlaps(box, r)).length }; };
          const got = A.chooseSize(fit, { handle: true }), box = { x: got.p.x, y: got.p.y, w: got.s.w, h: got.s.h };
          assert.ok(!got.target, `${w}x${h}, ${count} dock buttons, the step names ${target}: the ${got.t} card at ${Math.round(got.p.x)},${Math.round(got.p.y)} is over it`);
          assert.ok(!got.cursor, `${w}x${h}, ${target}: the card is over the keyboard's button`);
          assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= w + 1e-6 && box.y + box.h <= h + 1e-6, `${w}x${h}: the card is inside the window`);
          n++;
        }
      }
    }
  }
  assert.ok(n >= 60, `${n} placements held`);
  // the runner asks for the size by this rule, and counts the dock's buttons among the controls it keeps clear
  const src = read('js/ui/academy.js');
  assert.match(src, /const fit = \(t\) => \{ setTier\(t\); return fitCard\(t, sizeOf\(\), spot, view, keep, strip, t !== HANDLE_SIZE && bodyEl\.scrollHeight > bodyEl\.clientHeight \+ 1\); \};/, 'the runner weighs each size by the one pure rule (fitCard)');
  { const spot = { x: 100, y: 100, w: 50, h: 50 }, view = { w: 400, h: 400 }, f = A.fitCard('full', { w: 400, h: 400 }, spot, view, []); assert.equal(f.target, true, 'fitCard says whether the card is over the target (a card as big as the view cannot miss it)'); assert.equal(A.fitCard('slim', { w: 40, h: 40 }, spot, view, []).target, false, 'and that it is not, where it is clear'); }
  assert.match(src, /add\(e, 2, 0, false, true\);/, 'every control of the screen, the dock\'s buttons among them, is one the card keeps off');
});

/** The deals of the lessons, played with the real Deal Room glue in a lesson's sandbox. */
const sandboxOf = (id) => { const m = M(id); return A.makeSandboxSession({ ...m.setup }, { id: m.id, zone: m.zone }).game; };
const assetOf = (g, cls) => g.s.assets.find((a) => a.cls === cls);
const $ = (x) => (Math.abs(x) < 100 ? `${x < 0 ? '-' : ''}$${Math.abs(x).toFixed(2)}` : `${x < 0 ? '-' : ''}$${Math.round(Math.abs(x)).toLocaleString('en-US')}`); // the Deal Room's own money
/** Lesson 10 as far as the dealer: the lot bought, read and won, then repaired (the lot is really 90% of its description). */
function dealDay() {
  const g = sandboxOf('m10');
  { const r = D.startRun(g, { kind: 'buy', zone: 6, lotId: 'estate-lot-d' }); r.quickAll(); r.finish(); }
  { const f = D.startRun(g, { kind: 'repair', assetId: assetOf(g, 'antiqueFurniture').id }); f.act({ type: 'careful' }); f.finish(); }
  return g;
}
/** The Close stage by hand: open high, hold once, then accept their offer. */
function closeByHand(run) {
  run.quick(); assert.ok(run.next()); assert.ok(run.act({ type: 'anchor', level: 'high' }).ok); assert.ok(run.act({ type: 'hold' }).ok); assert.ok(run.act({ type: 'accept' }).ok); assert.ok(run.stageDone(), 'the Close is done');
}

test('round 2 A2: the sale that is paid at the crate\'s real condition says what the talk closed at, what the buyer found, and what was paid', () => {
  const lot = M('m10').setup.lots[0].truth.quality; assert.equal(lot, 0.9);
  for (const how of ['quick', 'hand']) {
    const g = dealDay(), run = D.startRun(g, { kind: 'sell', assetId: assetOf(g, 'antiqueFurniture').id, leadId: 'antique-dealer' });
    if (how === 'quick') run.quickAll(); else closeByHand(run);
    const said = run.res.close.price, sm = run.finish();
    assert.equal(sm.ok, true, how);
    const line = sm.lines[0], paid = sm.numbers.you;
    assert.ok(Math.abs(paid / said - lot) < 0.01, `${how}: the price paid ${paid} is ${lot} of the price the Close agreed, ${said} (the lot's real condition)`);
    assert.equal(line, `The talk closed at ${$(said)}. The buyer then checked the crate and found it at 90% of the condition it was described at, so the sale closed at ${$(paid)}.`, `${how}: the card says both prices and why`);
    assert.ok(sm.headline.includes($(paid)), `${how}: and the headline's price is the second one`);
    const cond = sm.reasons.find((r) => r.label === 'Condition'); assert.ok(cond, `${how}: the Why list has the reason`); assert.match(cond.text, /really 90% of the condition it was described at, so the buyer paid x0\.90 of the price the talk closed at\./);
    assert.ok(sm.reasons.findIndex((r) => r.label === 'Haggle') + 1 === sm.reasons.indexOf(cond), `${how}: right after the Haggle reason`);
  }
});

test('round 2 A2: a crate that is as it was described, or whose condition is already known, gets no such line, and the Close stage says nothing of a check', () => {
  // lesson 3: a crate bought on the open market with no hidden condition
  const g3 = sandboxOf('m03'), r3 = D.startRun(g3, { kind: 'sell', assetId: g3.s.assets[0].id, leadId: 'thrift-flipper' });
  assert.equal(r3.plan.asset.unchecked, false, 'nothing hidden about it');
  r3.quickAll(); const s3 = r3.finish();
  assert.ok(!s3.lines.some((l) => /The talk closed at/.test(l)) && !s3.reasons.some((r) => r.label === 'Condition'), 'no condition line');
  assert.doesNotMatch(UI.sheetHTML({ ...D.modelOf(r3, {}), pick: [], slider: 0.2 }), /checks the crate before paying/);
  // a crate a classmate disclosed (known) is quoted at its real condition already: the price agreed is the price paid
  const g = dealDay(), a = assetOf(g, 'antiqueFurniture'); const plan = D.planFor(g, { kind: 'sell', assetId: a.id, leadId: 'antique-dealer' });
  assert.equal(plan.asset.unchecked, true, 'bought from a lot and never sold: the buyer will check it');
  a.quality = (a.quality ?? 1) * 0.9; delete a.truth; a.known = true;
  const run = D.startRun(g, { kind: 'sell', assetId: a.id, leadId: 'antique-dealer' }); assert.equal(run.plan.asset.unchecked, false);
  run.quickAll(); const sm = run.finish();
  assert.ok(!sm.lines.some((l) => /The talk closed at/.test(l)), 'its condition was never hidden from the figures');
});

test('round 2 A2: the Close stage tells a lot-bought crate\'s seller, once the price is agreed, that the buyer checks the crate before paying', () => {
  const g = dealDay(), run = D.startRun(g, { kind: 'sell', assetId: assetOf(g, 'antiqueFurniture').id, leadId: 'antique-dealer' });
  const html = () => UI.sheetHTML({ ...D.modelOf(run, {}), pick: [], slider: 0.2 });
  run.quick(); assert.ok(run.next());
  assert.doesNotMatch(html(), /checks the crate before paying/, 'not before there is a price');
  run.act({ type: 'anchor', level: 'high' }); run.act({ type: 'hold' }); run.act({ type: 'accept' });
  const callout = /<div class="callout good">(Agreed at [^<]*)<\/div>/.exec(html());
  assert.ok(callout, 'the stage\'s callout');
  assert.match(callout[1], new RegExp(`^Agreed at ${$(run.res.close.price).replace(/\$/g, '\\$')}\\. The buyer checks the crate before paying, so the price you are paid follows its real condition and can come out below this\\.$`));
  const walk = D.startRun(dealDay(), { kind: 'sell', assetId: undefined, leadId: 'antique-dealer' }); assert.equal(walk.ok, false, 'a deal with no crate does not start');
});

test('round 2 A2: the sale card says what "the crate\'s value" is: the market value Stock shows, in dollars', () => {
  for (const [id, cls, lead, prep] of [['m10', 'antiqueFurniture', 'antique-dealer', dealDay], ['m05', 'van', 'fleet-buyer', () => { const g = sandboxOf('m05'); const f = D.startRun(g, { kind: 'repair', assetId: assetOf(g, 'van').id }); f.act({ type: 'careful' }); f.finish(); return g; }]]) {
    const g = prep(), a = assetOf(g, cls), market = g.val(a);
    const run = D.startRun(g, { kind: 'sell', assetId: a.id, leadId: lead }); run.quickAll(); const sm = run.finish();
    const vs = sm.lines.find((l) => /against the crate's value|times the crate's value/.test(l));
    assert.ok(vs, `${id}: the comparison stays`); assert.ok(vs.includes(`of ${$(market)}, what the market values it at now`), `${id}: "${vs}" names the market value ${$(market)}`);
    assert.equal(sm.title, 'Sold below market', `${id}: the verdict is the same, and now it is explained`);
  }
});

// ====================================================================================================================================
// The browser half: the faults that only a real window shows (real clicks, real Tab, real layout)
// ====================================================================================================================================

const { CHROME } = await import('../scripts/chrome.mjs');
const BROWSER = !process.env.PC_NO_BROWSER && existsSync(CHROME);
const freePort = async () => { const { createServer } = await import('node:net'); return new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); }); };
let shared = null;
/** One static server and one headless Chrome for every browser test of this file; each test opens a page of its own (its own save slot). */
async function browser() {
  if (shared) return shared;
  const { createServer } = await import('node:http'), { handler } = await import('../server/static.mjs'), { launch, open } = await import('../scripts/cdp.mjs');
  const server = createServer(handler); await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const chrome = await launch(await freePort()), base = `http://127.0.0.1:${server.address().port}`;
  shared = { base, chrome, open, close: async () => { chrome.close(); await new Promise((ok) => server.close(ok)); shared = null; } };
  return shared;
}
test.after(async () => { if (shared) await shared.close(); });

const until = async (p, expr, what, ms = 25000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await p.eval(expr); if (last) return last; } catch { /* between screens */ } await p.sleep(100); } assert.fail(`timed out waiting for ${what} (last: ${JSON.stringify(last)})`); };
/** Click the first visible element of `sel` whose text matches `re` (a source string), the way a press does: the app listens for `click` on the document. */
const press = (p, sel, re = '.') => p.eval(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0}).find(e=>new RegExp(${JSON.stringify(re)},'i').test(e.textContent.trim())); if(!b) return false; b.click(); return true})()`);
const pressed = async (p, sel, re, what, ms) => { await until(p, `(()=>{const b=[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0}).find(e=>new RegExp(${JSON.stringify(re || '.')},'i').test(e.textContent.trim())); if(!b) return false; b.click(); return true})()`, what || `${sel} ${re || ''}`, ms); };
const eyebrow = (p) => p.eval(`(document.querySelector('.ac-coach .ac-eyebrow')||{}).innerText||''`);
const atStep = (p, n, total) => until(p, `/STEP ${n} OF ${total}/i.test((document.querySelector('.ac-coach .ac-eyebrow')||{}).innerText||'')`, `step ${n} of ${total}`);
/** A fresh page with the lessons before `lesson` marked done, on the Academy's intro for it. */
async function lessonPage(b, name, { w, h, dsf = 1, mobile = false, done = [] }) {
  const slot = `fr${name}${Date.now() % 1e6}`, p = await b.open(b.chrome, `${b.base}/?slot=${slot}`, { w, h, dsf, mobile });
  if (done.length) { await p.eval(`localStorage.setItem('pc.academy.${slot}', ${JSON.stringify(JSON.stringify(done))})`); await p.eval('location.reload()'); await p.sleep(900); }
  await pressed(p, 'button[data-act="academy"]', '', 'the Academy button'); await pressed(p, '[data-act="ac-start"]', '', 'Start the lesson');
  await until(p, `!!document.querySelector('.ac-coach')`, 'the coach card');
  return p;
}
/** Where the keyboard is and whether it can be seen: the share of its box that is in the window and not under something else, and whether its 5px ring stays in the window. */
const MEASURE = `(()=>{ const a=document.activeElement, vw=innerWidth, vh=innerHeight; if(!a||a===document.body||a===document.documentElement) return {none:true};
  const r=a.getBoundingClientRect(), R=5, ring=[r.left-R,r.top-R,r.right+R,r.bottom+R];
  const x0=Math.max(r.x,0),x1=Math.min(r.right,vw),y0=Math.max(r.y,0),y1=Math.min(r.bottom,vh); let bad=0,tot=0,by='';
  if(x1>x0&&y1>y0) for(const fx of [.06,.28,.5,.72,.94]) for(const fy of [.1,.3,.5,.7,.9]){ const h=document.elementFromPoint(x0+(x1-x0)*fx,y0+(y1-y0)*fy); tot++; if(!h||!(a===h||a.contains(h)||(h.closest&&h.closest('label')&&h.closest('label').contains(a)))){ bad++; if(!by&&h) by=(h.closest&&h.closest('.ac-coach')?'the coach card':h.tagName+'.'+String(h.className).slice(0,24)); } }
  const inVp=(x1>x0&&y1>y0)?((x1-x0)*(y1-y0))/(r.width*r.height):0;
  return { label:(a.getAttribute('aria-label')||a.innerText||a.id||'').replace(/\\s+/g,' ').trim().slice(0,30), act:(a.dataset&&(a.dataset.act||a.dataset.deal))||'', visible:tot?inVp*(1-bad/tot):0, covered:tot?bad/tot:1, by, ringIn:ring[0]>=-.5&&ring[1]>=-.5&&ring[2]<=vw+.5&&ring[3]<=vh+.5, ring }; })()`;
/** Tabs through at most `max` stops (until the cursor comes back to the first) and returns what was measured at each. */
async function tabWalk(p, max = 16) {
  const stops = []; let first = null;
  for (let i = 0; i < max; i++) {
    await p.key('Tab', { wait: 150 });
    let m = await p.eval(MEASURE); for (let k = 0; k < 6; k++) { await p.sleep(120); const n = await p.eval(MEASURE); if (JSON.stringify(n.ring) === JSON.stringify(m.ring)) { m = n; break; } m = n; } // the card and the scroll settle
    if (m.none) continue;
    const sig = `${m.act}|${m.label}`; if (first == null) first = sig; else if (sig === first) break;
    stops.push(m);
  }
  return stops;
}

test('browser A1, A5: lesson 7 stops its own clock when the glut lands, and its last step frames the Repay button once Show me has brought it into view', { skip: !BROWSER, timeout: 240000 }, async () => {
  const b = await browser(), p = await lessonPage(b, 'a1', { w: 1280, h: 813, done: ['m01', 'm02', 'm03', 'm04', 'm05', 'm06'] });
  try {
    const clockPaused = () => p.eval(`document.querySelector('[data-act="pause"]').getAttribute('aria-pressed')`);
    await atStep(p, 1, 7); await pressed(p, '[data-anchor="dock-bank"]'); await atStep(p, 2, 7);
    await p.eval(`(()=>{const i=document.querySelector('[data-anchor="drawer"] input[type=range]'); i.scrollIntoView({block:'center'}); i.focus();})()`);
    for (let k = 0; k < 3; k++) await p.key('ArrowRight', { wait: 120 });
    await pressed(p, '[data-act="bank-draw"]'); await atStep(p, 3, 7);
    await pressed(p, '[data-anchor="dock-market"]'); await atStep(p, 4, 7);
    const spot = await until(p, `(()=>{const o=pc.world&&pc.world.rectOf&&pc.world.rectOf('lot','bargain-a'); return o&&{x:o.x+o.w/2,y:o.y+o.h/2}})()`, 'the first sneaker lot in the world');
    await p.click(spot.x, spot.y);
    await pressed(p, 'dialog#dlg button', '^Quick deal'); await atStep(p, 5, 7);
    if (await p.eval(`document.querySelector('dialog#dlg').open`)) await press(p, 'dialog#dlg button', '^Continue$');
    await until(p, `!document.querySelector('dialog#dlg').open`, 'the deal closed');
    assert.equal(await clockPaused(), 'true', 'the clock waits for the player at step 5 (the button says it is paused)');
    await pressed(p, '[data-act="pause"]'); assert.equal(await clockPaused(), 'false', 'and runs when the player presses it'); await atStep(p, 6, 7);
    await atStep(p, 7, 7); // the glut took hold: about 3 seconds at 16x
    assert.equal(await clockPaused(), 'true', 'and it stopped itself with the glut, so the Bank shows the stress the card asks about');
    assert.match(await p.eval(`document.querySelector('.ac-say').innerText`), /The glut is in and the clock has stopped\./);
    if (await p.eval(`document.querySelector('dialog#dlg').open`)) await p.key('Escape', { wait: 300 });
    await pressed(p, '[data-anchor="dock-bank"]'); await until(p, `/LAST STEP/i.test((document.querySelector('.ac-coach .ac-eyebrow')||{}).innerText||'')`, 'the last step');
    // the Repay buttons are under the two Borrow forms: out of the drawer's view, so no frame (it would stand off the window and dim all of it), and a note says where it is
    const geo = () => p.eval(`(()=>{const b=document.querySelector('[data-anchor="bank-repay"]').getBoundingClientRect(), r=document.querySelector('.ac-ring'), db=document.querySelector('.drawer .db').getBoundingClientRect(); return {btn:[b.x,b.y,b.width,b.height], ringHidden:r.hidden, ring:[...r.style.transform.matchAll(/-?[\\d.]+/g)].map(x=>+x[0]), inBody:b.top>=db.top&&b.bottom<=db.bottom, where:(document.querySelector('.ac-where')||{}).innerText||'', look:(document.querySelector('.ac-look')||{}).innerText||''}})()`);
    let g = await geo();
    assert.equal(g.inBody, false, 'the Repay button is below the fold'); assert.equal(g.ringHidden, true); assert.match(g.where, /lower down this panel\. Press Show me and the panel scrolls to it\./);
    await pressed(p, '[data-act="ac-showme"]'); await until(p, `!document.querySelector('.ac-ring').hidden`, 'the frame');
    g = await geo();
    assert.equal(g.inBody, true, 'Show me scrolled the panel to it'); assert.match(g.look, /gold frame/);
    assert.ok(g.ring[0] <= g.btn[0] && g.ring[1] <= g.btn[1], `the frame ${g.ring} stands on the button ${g.btn.map(Math.round)}`);
    await pressed(p, '[data-act="bank-repay"]'); await until(p, `/WHY IT WORKED/i.test((document.querySelector('.ac-sheet .ac-eyebrow')||{}).innerText||'')`, 'the lesson won');
  } finally { await p.close(); }
});

test('browser B1: at 200% zoom the card stands clear of the Bid and Drop out buttons while the keyboard is on them', { skip: !BROWSER, timeout: 240000 }, async () => {
  const b = await browser(), p = await lessonPage(b, 'b1', { w: 640, h: 360, dsf: 2, done: ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09'] });
  try {
    await atStep(p, 1, 5); await pressed(p, '[data-anchor="dock-market"]'); await atStep(p, 2, 5).catch(() => {});
    await pressed(p, '[data-act="market-tab"]', '^Lots'); await pressed(p, '[data-act="market-look"]', '.', 'a lot to look at');
    await until(p, `document.querySelector('dialog#dlg').open`, 'the Deal Room');
    await pressed(p, 'dialog#dlg button', 'Check the serial'); await pressed(p, 'dialog#dlg button', '^Done reading'); await pressed(p, 'dialog#dlg button', '^Continue$');
    await until(p, `document.querySelector('#dlg .deal')?.dataset.stage==='bid'`, 'the bid stage');
    await pressed(p, 'dialog#dlg button', '^Bid\\$', 'a bid'); await p.sleep(900);
    await p.eval(`document.querySelector('#dlg').focus()`);
    const stops = await tabWalk(p, 20), seen = stops.filter((s) => s.act === 'bid' || s.act === 'drop');
    assert.ok(seen.length >= 2, `Tab reached the Bid and Drop out buttons (${stops.map((s) => s.act || s.label).join(', ')})`);
    for (const s of seen) assert.ok(s.covered === 0 && s.visible >= 0.98, `${s.label} (${s.act}) is ${Math.round(s.visible * 100)}% in sight, ${Math.round(s.covered * 100)}% covered by ${s.by}`);
  } finally { await p.close(); }
});

test('browser B2: the focus ring of a control at the edge of the Academy\'s sheets is never cut by the window', { skip: !BROWSER, timeout: 240000 }, async () => {
  const b = await browser();
  for (const [w, h] of [[844, 390], [360, 640]]) {
    const p = await lessonPage(b, 'b2', { w, h });
    try {
      await pressed(p, '[data-act="ac-skip"]'); await pressed(p, '[data-act="ac-skip-yes"]'); await until(p, `!!document.querySelector('.ac-sheet [data-act="ac-why-next"]')`, 'the why sheet');
      await pressed(p, '[data-act="ac-why-next"]'); await until(p, `!!document.querySelector('.ac-sheet [data-act="ac-pick"]')`, 'the teach-back');
      await pressed(p, '[data-act="ac-pick"]', '.'); await p.sleep(500); // the first option is a wrong answer
      const stops = await tabWalk(p, 10);
      assert.ok(stops.length >= 3, `${w}x${h}: Tab visited ${stops.length} stops`);
      for (const s of stops) assert.ok(s.ringIn, `${w}x${h}: the ring of "${s.label}" (${s.ring.map(Math.round)}) stays inside the window`);
    } finally { await p.close(); }
  }
});

test('browser A3, A4, A7: a tap lands on the Market\'s Sell button at 360x640 wherever the drawer is scrolled, and the Deal Room names the button it really shows', { skip: !BROWSER, timeout: 240000 }, async () => {
  const b = await browser();
  // 360x640: the card slims down and moves, so it is never over a button the player is about to press
  let p = await lessonPage(b, 'a7', { w: 360, h: 640, mobile: true });
  try {
    await pressed(p, '[data-anchor="hud-cash"]'); await p.sleep(400); await p.key('Escape', { wait: 300 });
    await pressed(p, '[data-anchor="dock-stock"]'); await atStep(p, 3, 4).catch(() => {});
    await pressed(p, '[data-anchor="dock-market"]'); await until(p, `[...document.querySelectorAll('[data-act="market-sell"]')].some(b=>/Wen/.test(b.textContent))`, 'Wen\'s Sell button');
    for (const block of ['start', 'center', 'end']) {
      await p.eval(`[...document.querySelectorAll('[data-act="market-sell"]')].find(x=>/Wen/.test(x.textContent)).scrollIntoView({block:${JSON.stringify(block)}})`);
      const hit = await until(p, `(()=>{const b=[...document.querySelectorAll('[data-act="market-sell"]')].find(x=>/Wen/.test(x.textContent)).getBoundingClientRect(); const t=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2); return t&&t.closest('[data-act="market-sell"]')?'button':false})()`, `the Sell button is what a tap lands on (scrolled to ${block})`, 4000).catch(() => false);
      assert.equal(hit, 'button', `a tap on Wen's Sell button lands on it with the drawer scrolled to ${block}`);
    }
    const card = await p.eval(`(()=>{const c=document.querySelector('.ac-coach'); return {text:(c.querySelector('.ac-say')||{}).innerText||'', cls:c.className}})()`);
    assert.ok(card.text.length > 30, 'the step\'s words stay on the card when it slims down: ' + JSON.stringify(card));
  } finally { await p.close(); }
  // 1280x813: the Deal Room, the whole-deal Quick carries the frame, the notes name Continue and See the result
  p = await lessonPage(b, 'a3', { w: 1280, h: 813 });
  try {
    await pressed(p, '[data-anchor="hud-cash"]'); await p.sleep(400); await p.key('Escape', { wait: 300 });
    await pressed(p, '[data-anchor="dock-stock"]'); await pressed(p, '[data-anchor="dock-market"]');
    await pressed(p, '[data-act="market-sell"]', 'Wen'); await until(p, `document.querySelector('dialog#dlg').open`, 'the Deal Room');
    const framed = () => p.eval(`(()=>{const r=document.querySelector('.ac-ring'); const q=[...document.querySelectorAll('[data-anchor="deal-quick"]')].map(e=>e.textContent.trim()); return {ringHidden:r.hidden, anchored:q, where:(document.querySelector('.ac-where')||{}).innerText||''}})()`);
    await until(p, `!document.querySelector('.ac-ring').hidden`, 'the frame in the Deal Room');
    let f = await framed(); assert.deepEqual(f.anchored, ['Quick deal'], 'the frame is on the whole-deal Quick');
    await pressed(p, 'dialog#dlg button', '^Quick: auto-play'); await until(p, `document.querySelector('.ac-where') && /Press Continue to move on/.test(document.querySelector('.ac-where').innerText)`, 'the note that names Continue');
    await pressed(p, 'dialog#dlg button', '^Continue$'); await pressed(p, 'dialog#dlg button', '^Quick: auto-play');
    await until(p, `document.querySelector('.ac-where') && /Press See the result to finish the deal/.test(document.querySelector('.ac-where').innerText)`, 'the note that names See the result');
    assert.ok(await p.eval(`[...document.querySelectorAll('dialog#dlg button')].some(b=>/^See the result$/.test(b.textContent.trim()))`), 'and the room has that button');
    // the card stays off what the lesson asks to be read: the footer's cells, the seller's reply and the result line (measured once the card has stopped moving)
    await until(p, `(()=>{const c=document.querySelector('.ac-coach'); const r=c.getBoundingClientRect(); const k=[r.x,r.y,r.width,r.height].join(); const same=window.__ck===k; window.__ck=k; return same})()`, 'the card at rest');
    const over = await p.eval(`(()=>{const c=document.querySelector('.ac-coach').getBoundingClientRect(); return [...document.querySelectorAll('.deal .bubble, .deal-stage .callout, .deal-score > div')].map(e=>{const r=e.getBoundingClientRect(); return Math.max(0,Math.min(r.right,c.right)-Math.max(r.left,c.left))*Math.max(0,Math.min(r.bottom,c.bottom)-Math.max(r.top,c.top))}).reduce((a,x)=>a+x,0)})()`);
    assert.equal(over, 0, 'no pixel of the result line, the seller\'s reply or the footer\'s cells is under the card');
  } finally { await p.close(); }
});

/** How much of each dock button the card covers, and whether a tap at the middle of the button lands on it. */
const DOCK_COVER = `(()=>{ const c=document.querySelector('.ac-coach').getBoundingClientRect(), out={card:[c.x,c.y,c.right,c.bottom].map(Math.round)};
  for (const n of ['dock-stock','dock-market']) { const e=document.querySelector('[data-anchor="'+n+'"]'); if(!e) continue; const b=e.getBoundingClientRect();
    const ox=Math.max(0,Math.min(b.right,c.right)-Math.max(b.left,c.left)), oy=Math.max(0,Math.min(b.bottom,c.bottom)-Math.max(b.top,c.top)), h=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
    out[n]={ cover:+(ox*oy/(b.width*b.height)).toFixed(3), tap:!!(h&&h.closest('[data-anchor="'+n+'"]')) }; }
  return out })()`;
const settled = (p) => until(p, `(()=>{const c=document.querySelector('.ac-coach'); if(!c) return false; const r=c.getBoundingClientRect(), k=[r.x,r.y,r.width,r.height].map(Math.round).join(), same=window.__r2k===k; window.__r2k=k; return same})()`, 'the card at rest');

test('browser round 2 A1: at 200% zoom (640x360, 640x400) and on a phone on its side the card stands clear of the dock, and a tap lands on the Market button the step names', { skip: !BROWSER, timeout: 240000 }, async () => {
  const b = await browser();
  for (const [w, h, dsf, mobile] of [[640, 360, 2, false], [640, 400, 2, false], [844, 390, 3, true]]) {
    const p = await lessonPage(b, 'r2a1', { w, h, dsf, mobile }), at = `${w}x${h}`;
    try {
      await pressed(p, '[data-anchor="hud-cash"]'); await p.sleep(400); await p.key('Escape', { wait: 300 });
      await pressed(p, '[data-anchor="dock-stock"]'); await atStep(p, 3, 4); await settled(p); // Stock is open, and the step says: now open Market
      let m = await p.eval(DOCK_COVER);
      assert.equal(m['dock-market'].cover, 0, `${at}, step 3: the card ${m.card} is not over the Market button the step names`);
      assert.equal(m['dock-market'].tap, true, `${at}, step 3: a tap on the Market button lands on it`);
      assert.equal(m['dock-stock'].cover, 0, `${at}, step 3: and not over Stock`); assert.equal(m['dock-stock'].tap, true);
      await pressed(p, '[data-anchor="dock-market"]'); await atStep(p, 4, 4); await settled(p); // Market is open: the next thing is in the Deal Room, which is not open yet
      m = await p.eval(DOCK_COVER);
      for (const n of ['dock-stock', 'dock-market']) { assert.equal(m[n].cover, 0, `${at}, step 4: the card ${m.card} is not over ${n}`); assert.equal(m[n].tap, true, `${at}, step 4: a tap on ${n} lands on it`); }
    } finally { await p.close(); }
  }
});
