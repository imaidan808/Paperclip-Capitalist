// Copy pass, part 2, package P2: the Debrief, the instructor dashboard, the title's classroom panels and the faculty kit. Each test holds a claim these screens make against the engine
// (the numbers are recomputed from the engine or the config, never copied from the text), and fails on the text it replaced:
//   D1  the Prompt C result column is the ledger's own signed number (a gain is not "value lost"; a manager's cycle is profit), the five most crowded niches are in front and the rest fold
//   D2  a niche's saturation is the one at its latest crowded sale ("last seen" was its first); the workbook prints it with the two volumes it is the ratio of, never as a count of pitches (D2b); the creativity figures (herd 0.55, pioneer 2.4, the score's scale, the formula) are the engine's
//   D3  the Prompt A gain column is the same figure at both ends of a swap (the old "you / them" pair was proposer / acceptor, so it was reversed for half the rows); the two sides' sizes are shown by role, cash included (D3b); a skill that is not on record says n/a
//   D4  Prompt B, the chart and the workbook name the day the credit crunch really hit; what the crunch changes is the engine's, it moves no asset price, and the Debrief's line splits where debt passes net worth; a Veteran feels the three rises 40% smaller (D4b)
//   D5  the adaptability column shows what the subtotal counts, in the table and in the CSV (whose last column says whether it was graded); the grade notes (25, 10, 10, a neutral 50) are the gradebook's own
//   D6  the schedule line is the list of scheduled and sent shocks the students' games really hold, after a deploy with or without Replace, and says that the algorithmic events are not on it
//   D7  what the rewind, the stalled list, the room line and the recovery paragraph say is what the engine and the relay do; who a rewind and a shock reach is in front, in the roster's word (online)
//   D8  the voice: what these screens show at first has no question, no filler and no dash, is a fraction of what it was, and what was folded is folded
//   D9  the title's classroom panels and the kit: the names the screens use, the numbers the engine has
//   D10 the figures' hovers and labels (efficiency index, percentile, pivots, the band of a swap, the sliders, the herd) are what the engine does; the algorithmic events come from the room code
//   D11 the five days after a shock are n/a until they are over, never 0 pivots
//   D12 every hover of the Debrief and of the dashboard's controls is said once more in the page: a fold, a line or a screen-reader span, and a cue for a pointer
// What Deploy, Inject and Close room store, the print listeners and the word counter are held on a stand-in page in tests/copy2-debrief-mount.test.mjs.
// Run: node --test tests/copy2-debrief.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const { Game } = await import('../js/engine.js');
const { ASSETS, BUYERS, PERKS, EVENTS, CM, FEES, BASE_RATE, FMV_BAND, WARN_LEAD, SWAPS, TOTAL_DAYS } = await import('../js/config.js');
const { creativityBand, creativity, fmtMoney: money, fmtPct } = await import('../js/market.js');
const { CODEX } = await import('../js/meta/codex.js');
const { Session, Clock } = await import('../js/session.js');
const C = await import('../js/cohort.js');
const D = await import('../js/ui/debrief.js');
const I = await import('../js/ui/instructor.js');
const { FOLLOW_NOTE } = await import('../js/ui/room-notes.js');
const { makeGame, run } = await import('./bot.mjs');

// ---------------------------------------------------------------------------------------------------------------------
const REAL = (game) => { const S = new Session(); S.game = game; S.synth = C.makeSynth(11, 'test'); return S; };
/** What a reader sees at once: the bodies of closed folds, hover text, screen-reader text, hidden marks and form fields are left out. */
function visible(html) {
  return html
    .replace(/<details[^>]*>([\s\S]*?)<\/details>/g, (m, inner) => { const s = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(inner); return s ? ` ${s[1]} ` : ' '; })
    .replace(/<(title|desc)[^>]*>[\s\S]*?<\/\1>/g, ' ')
    .replace(/<(span|caption|label)[^>]*class="sr"[^>]*>[\s\S]*?<\/\1>/g, ' ')
    .replace(/<(span|b|i)\b[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/\1>/g, ' ')
    .replace(/<(textarea|option)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&middot;|&amp;|&lt;|&gt;|&hellip;|&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
const folds = (html) => [...html.matchAll(/<details[^>]*>([\s\S]*?)<\/details>/g)].map((m) => m[1]);
const withoutFolds = (html) => html.replace(/<details[^>]*>[\s\S]*?<\/details>/g, '');
const unescape = (t) => t.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const titles = (html) => [...html.matchAll(/ title="([^"]*)"/g)].map((m) => unescape(m[1]));
const words = (t) => (t ? t.split(/\s+/).length : 0);
const num = (s) => +String(s).replace(/[^0-9.\-]/g, '');
const ordered = ['herd', 'crowded', 'open', 'balanced', 'pioneer'];
/** The lowest multiplier of a band, found from the engine's own band function. */
function lowerEdge(id) { let lo = CM.min, hi = CM.max; for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (ordered.indexOf(creativityBand(mid).id) >= ordered.indexOf(id)) hi = mid; else lo = mid; } return hi; }

const cycleNets = [];
// The two scheduled shocks only (days 15 and 45): D8 counts the words of the debrief's shock table, so this world must not move with the algorithmic draw (js/engine.js `_algoEvent`).
const late = (() => { const g = makeGame(['native', 'heir'], 'growth', 11); g.env.algo = false; g.onEvent = (e) => { if (e.type === 'cycle') cycleNets.push(e.net); }; run(g, { days: 60 }); return g; })();
const fresh = makeGame(['connected', 'grad']);

/** An instructor's session with students whose snapshots say what a test wants (a stand-in room records what it is sent). */
function instructorWith(snaps, hour = 24 * 60) {
  store.clear();
  const S = new Session(); S.pid = 'TEACH'; S.mode = 'instructor'; S.clock = new Clock({ hour, paused: true });
  S.roomInfo = { code: 'GRADE', relay: '', role: 'instructor' }; S.sent = []; S.room = { kind: 'local', state: 'open', send: (m) => S.sent.push(m), close() {}, on() {} };
  for (const [pid, snap, extra] of snaps) S.peers.set(pid, { pid, handle: pid, role: 'student', clean: true, seen: Date.now(), ...extra, snap: C.cleanSnap({ handle: pid, hour, flags: {}, ...snap }, pid) });
  return S;
}
/** The dashboard of a classroom: two real students, five demo students and a recovery code, as a teacher would see it. */
function dashboard(game) {
  const S = instructorWith([], 24 * 20); S.setDemo(5);
  const snap = (pid, handle, perks, zones) => ({ ...game.publicSnapshot(), pid, handle, perks, zones });
  S.peers.set('PC-A', { pid: 'PC-A', handle: 'Zelda', role: 'student', seen: Date.now(), snap: snap('PC-A', 'Zelda', ['trades', 'pro'], 3) });
  S.peers.set('PC-B', { pid: 'PC-B', handle: 'Orville', role: 'student', seen: Date.now(), snap: snap('PC-B', 'Orville', ['heir', 'creator'], 9) });
  S.recoveryCode = () => 'abcd-abcd-abcd-abcd-abcd-abcd-abcd-abcd';
  return S;
}
const cellsOf = (grade, pid) => { const row = grade.split('<tr>').find((r) => r.includes(`>${pid}<`)); return row ? [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim()) : null; };

// ---------------------------------------------------------------------------------------------------------------------
test('D1: a niche\'s result is the ledger\'s own signed number: what a pitch took in less its fair value, or a manager cycle\'s profit; never "value lost"', () => {
  const S = REAL(late), E = D.evidence(S), html = D.debriefHTML(S);
  assert.ok(!/value lost/i.test(html) && !/value lost/i.test(read('js/ui/debrief.js')), 'no column called "value lost" (it summed a signed number, and a gain read as a loss)');
  // the engine: a pitch row's amount is what came in less the fair value it was priced against (js/engine.js `pitch`), a manager cycle's is the cycle's profit (`_cycleDone`)
  const L = late.s.ledger;
  assert.ok(!late.s.ledgerDropped, 'nothing of this run was folded into a summary row');
  const pitches = L.filter((e) => e.type === 'pitch' && e.cm), cycles = L.filter((e) => e.type === 'pipe');
  assert.ok(pitches.length > 20 && cycles.length > 5, 'the run has both kinds of row');
  for (const e of pitches) assert.ok(Math.abs(e.amt - (e.recv - e.fmv)) < 1e-6, 'a pitch row is what was received less fair value');
  assert.ok(pitches.some((e) => e.amt > 0 && e.cm < D.CROWDED), 'and it can be a gain, even in a crowded niche: an urgent buyer pays above fair value at any multiplier');
  assert.deepEqual(cycles.map((e) => e.amt), cycleNets, 'a manager row is the profit the engine booked for that cycle');
  assert.ok(pitches.every((e) => Number.isFinite(e.S)) && cycles.every((e) => e.S === undefined && e.vN === undefined), 'a pitch row records the saturation it sold into and a manager row does not');

  // the screen: each niche's figure is the sum of those rows, green when it is not negative and red when it is, and says what it is
  const crowded = L.filter((e) => (e.type === 'pitch' || e.type === 'pipe') && e.cm && e.cm < D.CROWDED);
  assert.equal(E.niches.reduce((a, [, v]) => a + v.n, 0), crowded.length, 'every crowded sale and cycle is in a niche');
  assert.ok(Math.abs(E.niches.reduce((a, [, v]) => a + v.net, 0) - crowded.reduce((a, e) => a + e.amt, 0)) < 1e-6, 'and every niche adds up the ledger\'s amounts');
  const row = /<tr><td>[^<]*<\/td><td class="mono">\d+<\/td><td class="mono red">[\d.]+x<\/td><td class="mono">(?:\d+%|n\/a)<\/td><td class="mono (?:red|green)">[^<]*<span class="tiny mute">(?:vs fair|profit)<\/span><\/td><\/tr>/g;
  const shown = withoutFolds(html).match(row) || [];
  assert.ok(E.niches.length > 5 && shown.length === 5, `five niches of ${E.niches.length} at first`);
  E.niches.slice(0, 5).forEach(([k, v], i) => assert.ok(shown[i].includes(`<td class="mono ${v.net < 0 ? 'red' : 'green'}">${money(v.net, { plus: true })} <span class="tiny mute">${v.cycles ? 'profit' : 'vs fair'}</span>`), `${k}`));
  const avg = E.niches.map(([, v]) => v.cm / v.n);
  assert.deepEqual(avg, [...avg].sort((a, b) => a - b), 'the most crowded niche (the lowest average multiplier) comes first');
  assert.match(html, new RegExp(`<summary class="small">The other ${E.niches.length - 5} niches</summary>`), 'and the rest are one fold away');
  assert.equal((html.match(row) || []).length, E.niches.length, 'with none lost between the two tables');
  assert.ok(html.includes('title="A sale: what you received less its fair value. A manager cycle: the cycle&#39;s profit. Added up.">Result</th>'), 'the head says what the column adds up');

  // a gain in a crowded niche is green with a plus, a shortfall red with a minus, a manager cycle says profit; a multiplier of 0.81 is not crowded (rows written into a ledger, so each case is certain)
  const g = makeGame(['connected', 'grad']);
  g.s.ledger.push({ h: 5, type: 'pitch', text: 'x', amt: 12.5, cm: 0.5, S: 0.4, vN: 4, vT: 10, cls: 'pen', seg: 'student' }, { h: 6, type: 'pitch', text: 'y', amt: -7, cm: 0.5, S: 0.6, vN: 6, vT: 10, cls: 'bike', seg: 'student' },
    { h: 7, type: 'pipe', text: 'Asset Broker: Radio to Student', amt: 100, cm: 0.6, z: 5 }, { h: 8, type: 'pitch', text: 'z', amt: 1, cm: 0.81, S: 0.1, vN: 1, vT: 10, cls: 'scrap', seg: 'student' });
  const h2 = D.debriefHTML(REAL(g)), md = D.reflectionMD(REAL(g), '');
  assert.ok(h2.includes(`<td class="mono green">${money(12.5, { plus: true })} <span class="tiny mute">vs fair</span>`) && h2.includes(`<td class="mono red">${money(-7)} <span class="tiny mute">vs fair</span>`) && h2.includes(`<td class="mono green">${money(100, { plus: true })} <span class="tiny mute">profit</span>`));
  assert.equal((h2.match(/<td class="mono red">[\d.]+x<\/td>/g) || []).length, 3, `the table is the ones under ${D.CROWDED}`);
  assert.ok(md.includes(`cycle profit ${money(100, { plus: true })}`) && md.includes(`against fair value ${money(12.5, { plus: true })}`));
  assert.ok(h2.includes('<td class="mono red">0.60x</td><td class="mono">n/a</td><td class="mono green">') && md.includes('saturation not recorded for manager cycles'), 'a manager cycle has no saturation to show: n/a, not 0%');
});

// ---------------------------------------------------------------------------------------------------------------------
test('D2: saturation is the niche\'s latest, and the creativity figures the debrief states are the engine\'s', () => {
  // two rows of one niche: the table and the workbook speak of the later one ("last seen" used to be the first)
  const g = makeGame(['connected', 'grad']);
  g.s.ledger.push({ h: 5, type: 'pitch', text: 'a', amt: -1, cm: 0.7, S: 0.3, vN: 3, vT: 10, cls: 'pen', seg: 'student' }, { h: 9, type: 'pitch', text: 'b', amt: -1, cm: 0.5, S: 0.7, vN: 7, vT: 10, cls: 'pen', seg: 'student' });
  const html = D.debriefHTML(REAL(g)), md = D.reflectionMD(REAL(g), '');
  assert.ok(html.includes('<td class="mono red">0.60x</td><td class="mono">70%</td>'), 'the saturation at the latest sale (70%), beside the average multiplier of the two (0.60)');
  assert.ok(!html.includes('<td class="mono">30%</td>'));
  assert.ok(md.includes('saturation 70% at its latest crowded sale (V_niche 7.0000, V_total 10.0000)'), 'the workbook states the saturation and the two volumes it is the ratio of, under the formula\'s names');
  assert.ok(!/last seen/.test(md) && !/last seen/.test(read('js/ui/debrief.js')));
  // real engine rows: the volumes behind a saturation are fractions of a pitch (the class's expected pitches, in parts: js/cohort.js `ghostCounts`), so a count of pitches rounded from them contradicts the percentage beside it
  const mdLate = D.reflectionMD(REAL(late), ''), lines = [...mdLate.matchAll(/saturation (\d+)% at its latest crowded sale \(V_niche ([\d.]+), V_total ([\d.]+)\)/g)];
  assert.ok(lines.length > 10 && late.s.ledger.some((e) => e.type === 'pitch' && Number.isFinite(e.vN) && Math.abs(e.vN - Math.round(e.vN)) > 0.05), 'the run has niches whose volumes are fractions');
  assert.ok(!/\d+ of \d+ recent pitches|at the latest sale/.test(mdLate), 'no rounded volume is worded as a count');
  for (const m of lines) assert.ok(Math.abs(+m[2] / +m[3] - +m[1] / 100) <= 0.01, `${m[0]}: the printed volumes reproduce the printed saturation`);

  // the bands: 0.55 and 2.4 are where the engine's own band names change; the table's 0.8 sits inside the crowded band
  assert.ok(Math.abs(lowerEdge('crowded') - 0.55) < 1e-9 && creativityBand(0.55).id === 'herd', 'the herd trap is 0.55 or less');
  assert.ok(Math.abs(lowerEdge('pioneer') - 2.4) < 1e-9 && creativityBand(2.4).id === 'pioneer', 'a pioneer is 2.4 or more');
  assert.ok(lowerEdge('crowded') < D.CROWDED && D.CROWDED < lowerEdge('open'), `${D.CROWDED} is a crowded multiplier: above the herd trap, under the open band`);
  const tips = titles(html);
  assert.ok(tips.includes('Pitches sold at a creativity multiplier of 0.55 or less.') && tips.includes('Pitches sold at a creativity multiplier of 2.4 or more.'), 'the hovers say those edges');
  const E = D.evidence(REAL(late)), cms = late.s.ledger.filter((e) => e.type === 'pitch' && e.cm).map((e) => e.cm);
  assert.equal(E.herd, cms.filter((c) => creativityBand(c).id === 'herd').length);
  assert.equal(E.pioneer, cms.filter((c) => creativityBand(c).id === 'pioneer').length);
  assert.ok(E.herd > 0 && E.pioneer > 0, 'both counts are exercised');

  // the score: 0.40 scores 0 and 3.14 scores 100, over the niche sales and the manager cycles (js/engine.js `creativityScore`, `logNiche`)
  const e = new Game({ perks: [], seed: 1, handle: 'T', pid: 'T-1' });
  e.s.cm = { sum: CM.min * 4, n: 4 }; assert.equal(e.creativityScore(), 0);
  e.s.cm = { sum: CM.max * 4, n: 4 }; assert.equal(e.creativityScore(), 100);
  assert.ok(tips.includes(`Your average creativity multiplier over all niche sales and manager cycles, scaled so ${CM.min.toFixed(2)} scores 0 and ${CM.max} scores 100.`));

  // the formula in the fold is the Codex's, and it is what creativity() computes
  const formula = CODEX.find((x) => x.id === 'creativity-multiplier').formula, fold = folds(html).find((x) => /V_total/.test(x)) || '';
  assert.ok(fold.includes(formula.split(', clamped')[0]), 'the same formula as the Codex page: ' + formula.split(', clamped')[0]);
  assert.ok(fold.includes(`kept between ${CM.min.toFixed(2)} and ${CM.max}`) && fold.includes('over the last 48 virtual hours'));
  for (const [vN, vT] of [[0, 40], [10, 100], [60, 100], [4, 20], [8, 24]]) {
    const S = Math.min(1, vN / vT), by = Math.min(CM.max, Math.max(CM.min, (CM.beta + Math.log((vT + 2) / (vN + 1))) * (1 - S)));
    assert.ok(Math.abs(creativity(vN, vT) - by) < 1e-9, `the formula for ${vN} of ${vT}`);
  }
  assert.ok(fold.includes('(the class\'s expected pitches plus yours, so not whole numbers)'), 'and the fold says why the volumes in the workbook are decimals');
});

test('D2b: the workbook states the saturation of the niche\'s latest crowded sale, which is not necessarily its latest sale, and never a count of pitches', () => {
  const g = makeGame(['connected', 'grad']);
  g.s.ledger.push(
    { h: 5, type: 'pitch', text: 'a', amt: -1, cm: 0.5, S: 3.61 / 6.68, vN: 3.61, vT: 6.68, cls: 'pen', seg: 'collector' },
    { h: 6, type: 'pitch', text: 'b', amt: -1, cm: 0.6, S: 0.076 / 0.235, vN: 0.076, vT: 0.235, cls: 'radio', seg: 'student' },
    { h: 9, type: 'pitch', text: 'c', amt: 3, cm: 1.5, S: 0.15, vN: 1.5, vT: 10, cls: 'pen', seg: 'collector' }); // the pen niche reopened afterwards (Cm 1.5): its later sale is not a crowded one
  const S = REAL(g), md = D.reflectionMD(S, ''), html = D.debriefHTML(S);
  assert.ok(md.includes('saturation 54% at its latest crowded sale (V_niche 3.6100, V_total 6.6800)'), 'the pen niche says its crowded sale\'s saturation, not the open one\'s 15%');
  assert.ok(md.includes('saturation 32% at its latest crowded sale (V_niche 0.0760, V_total 0.2350)'), 'a thin niche keeps its decimals, not "0 of 0"');
  assert.ok(!/\d+ of \d+/.test(md.split('Prompt C')[1].split('## My analysis')[0]), 'no "N of M" in the Prompt C evidence');
  assert.ok(html.includes('<td class="mono red">0.50x</td><td class="mono">54%</td>') && !html.includes('<td class="mono">15%</td>'), 'the table and the workbook speak of the same sale');
  // the hover says which sale: "latest sale there" was any sale, and the row is the latest one under the crowded line
  assert.ok(titles(html).includes('The niche\'s share of the recent pitches of that asset in that district, at its latest crowded sale. Not recorded for manager cycles.'));
  assert.ok(!/latest sale there/.test(html));
  // an old save that holds only the share (no volumes) keeps the share; a manager's cycle keeps its sentence
  const old = makeGame(['connected', 'grad']);
  old.s.ledger.push({ h: 5, type: 'pitch', text: 'a', amt: -1, cm: 0.5, S: 0.4, cls: 'pen', seg: 'collector' }, { h: 6, type: 'pipe', text: 'Asset Broker: Radio to Student', amt: 10, cm: 0.6, z: 5 });
  const mdOld = D.reflectionMD(REAL(old), '');
  assert.ok(mdOld.includes('saturation 40% at its latest crowded sale;') && mdOld.includes('saturation not recorded for manager cycles'));
  assert.ok(!/NaN|undefined/.test(mdOld));
  // and on the engine's own rows, each niche line carries the ledger's recorded share, which is vN / vT (market.js `saturation` adds 1e-9 to vT)
  const L = late.s.ledger, E = D.evidence(REAL(late)), mdLate = D.reflectionMD(REAL(late), '');
  for (const [k, v] of E.niches) {
    if (v.cycles) continue;
    const rows = L.filter((e) => e.type === 'pitch' && e.cm && e.cm < D.CROWDED && e.cls + '|' + e.seg === k), last = rows[rows.length - 1];
    assert.ok(Math.abs(last.S - last.vN / last.vT) < 1e-6, 'the ledger share is the engine\'s vN / vT');
    assert.ok(mdLate.includes(`saturation ${fmtPct(last.S)} at its latest crowded sale (V_niche ${last.vN.toFixed(4)}, V_total ${last.vT.toFixed(4)})`), `${k}: the line carries ${fmtPct(last.S)}`);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
test('D3: a swap\'s gain is the same figure at both ends; the old "you / them" pair was the proposer\'s side and the acceptor\'s, so half the rows were reversed', () => {
  const mk = (seed, pid) => { const g = new Game({ perks: [], seed, handle: pid, pid }); g.env.algo = false; return g; };
  const put = (g, cls) => { const a = g._mk(g.s, cls, { zone: 1, basis: 1 }); g.s.assets.push(a); return a; };
  const A = mk(1, 'AAA'), B = mk(2, 'BBB'), pen = put(A, 'pen'), scrap = put(B, 'scrap');
  const worth = { pen: A.val(pen), scrap: B.val(scrap) };
  const off = A.createOffer({ to: 'BBB', giveIds: [pen.id], want: { assets: [B.pub(scrap)], cash: 0 } });
  const acc = B.acceptOffer(off.offer);
  assert.ok(off.ok && acc.ok && A.finalizeOffer(off.offer.id, acc.deliver, 'BBB').ok);
  const rowA = A.s.ledger.find((e) => e.type === 'p2p' && e.gave), rowB = B.s.ledger.find((e) => e.type === 'p2p' && e.gave);
  // the engine: va and vb are the proposer's side and the acceptor's side at both ends...
  assert.equal(rowA.va, rowB.va); assert.equal(rowA.vb, rowB.vb);
  assert.ok(Math.abs(rowA.va - worth.pen) < 1e-9 && Math.abs(rowA.vb - worth.scrap) < 1e-9, 'va is what the proposer gave, vb what they got');
  // ...so "you / them" was reversed for the acceptor; what means the same to the player at both ends is what they got less what they gave
  assert.ok(Math.abs(rowA.amt - (worth.scrap - worth.pen)) < 1e-9, 'the proposer gave the pen and got the scrap');
  assert.ok(Math.abs(rowB.amt - (worth.pen - worth.scrap)) < 1e-9, 'the acceptor gave the scrap and got the pen');
  const htmlA = D.debriefHTML(REAL(A)), htmlB = D.debriefHTML(REAL(B)), cell = (x, cls) => `<td class="mono ${cls}">${money(x, { plus: true })}</td>`;
  assert.ok(htmlA.includes(cell(rowA.amt, 'red')) && htmlB.includes(cell(rowB.amt, 'green')), 'one swap, one gain, opposite signs');
  assert.ok(!/you \/ them|Baseline FMV/.test(htmlA + htmlB + D.reflectionMD(REAL(A), '') + read('js/ui/debrief.js')));
  assert.ok(htmlA.includes('<th scope="col" title="What you got less what you gave, both at fair value.">Gain at fair value</th>'));
  assert.ok(titles(htmlA).includes(`The gap between the two sides' fair values as a share of the lower side. A swap more than ${Math.round(FMV_BAND * 100)}% apart is flagged and blocked.`), 'the variance hover names the engine\'s band');
  // the top skill is known for a swap the player accepted only (the offer carries the proposer's skills)
  assert.ok(rowB.peerSkills && !rowA.peerSkills);
  assert.ok(htmlB.includes('<td>Ops</td></tr>') && !htmlA.includes('<td>Ops</td></tr>'));
  // ...and where it is not on record the cell says n/a (as the variance, saturation and shock cells do), never an empty cell that reads as none; the hover says why
  assert.ok(htmlA.includes('<td>n/a</td></tr>') && !/<td><\/td>/.test(htmlA) && !/<td><\/td>/.test(htmlB), 'no empty cell in the Prompt A table');
  assert.ok(D.reflectionMD(REAL(A), '').includes('Counterparty skills: n/a;') && titles(htmlA).includes('The highest skill of the classmate who proposed the swap. Recorded only for swaps you accepted.'));
  const bare = mk(4, 'BARE'); bare.s.ledger.push({ type: 'p2p', h: 30, text: 'Swap', amt: 1.5, gave: ['pen'], got: ['scrap'], va: 5, vb: 6.5, variance: 0.1, peerSkills: {} }); // an offer that carried no skills
  assert.ok(D.reflectionMD(REAL(bare), '').includes('Counterparty skills: n/a;') && D.debriefHTML(REAL(bare)).includes('<td>n/a</td></tr>'));
  assert.ok(D.reflectionMD(REAL(B), '').includes(`Gain at fair value ${money(rowB.amt, { plus: true })} (variance ${(rowB.variance * 100).toFixed(1)}%)`));
  // a swap with the Practice Partner supplies data and earns nothing: the empty line says it in front, where a keyboard and a touch screen read it (js/engine.js `_swapDone`)
  const none = D.debriefHTML(REAL(fresh));
  assert.ok(visible(none).includes('No peer swaps completed. A swap with a classmate or the Practice Partner supplies the data for this prompt, but only a classmate\'s counts toward Peer Market Engagement (10% of the grade).'));
  assert.ok(!titles(none).some((t) => /Peer Market Engagement/.test(t)), 'and it is not left on a hover');
  const npc = mk(3, 'NPC');
  assert.equal(npc._swapDone('PARTNER', 10, 0.1, true), false); assert.equal(npc.s.p2p, 0, 'and it pays the grade nothing');
  assert.equal(npc.s.pivot, 0, 'nor is it a pivot');
  assert.ok(A.s.p2p === 1 && B.s.p2p === 1 && A.s.pivot === 1 && B.s.pivot === 1, 'a counted swap is a swap and a pivot, at both ends');
  // the band in the variance hover is the guardrail: 39% apart passes, 41% does not (js/engine.js `checkOffer`)
  const at = (cash) => A.checkOffer({ from: 'AAA', give: { assets: [A.pub(pen)], cash: 0 }, want: { assets: [], cash } }, 'offerer');
  assert.equal(at(worth.pen * (1 + FMV_BAND - 0.01)).ok, true); assert.equal(at(worth.pen * (1 + FMV_BAND + 0.01)).ok, false);
});


// ---------------------------------------------------------------------------------------------------------------------
test('D3b: a swap\'s two sides are shown at fair value, cash included, the right way round at both ends, even when prices moved before the proposer settled', () => {
  const mk = (seed, pid) => { const g = new Game({ perks: [], seed, handle: pid, pid }); g.env.algo = false; return g; };
  const put = (g, cls) => { const a = g._mk(g.s, cls, { zone: 1, basis: 1 }); g.s.assets.push(a); return a; };
  const cell = (gave, got) => `<td class="mono">${money(gave)} for ${money(got)}</td>`;
  const swap = (between = () => {}) => {
    const A = mk(1, 'AAA'), B = mk(2, 'BBB'), pen = put(A, 'pen'), scrap = put(B, 'scrap'); B.s.cash = 50;
    const worth = { pen: A.val(pen), scrap: B.val(scrap) };
    const off = A.createOffer({ to: 'BBB', giveIds: [pen.id], want: { assets: [B.pub(scrap)], cash: 0 } }), acc = B.acceptOffer(off.offer);
    between(A);
    assert.ok(off.ok && acc.ok && A.finalizeOffer(off.offer.id, acc.deliver, 'BBB').ok);
    return { A, B, worth, rowA: A.s.ledger.find((e) => e.type === 'p2p' && e.gave), rowB: B.s.ledger.find((e) => e.type === 'p2p' && e.gave) };
  };
  // the pair is the proposer's side then the side they asked for: each founder reads it as what they gave for what they got
  const calm = swap();
  assert.ok(D.debriefHTML(REAL(calm.A)).includes(cell(calm.worth.pen, calm.worth.scrap)) && D.debriefHTML(REAL(calm.B)).includes(cell(calm.worth.scrap, calm.worth.pen)));
  assert.ok(D.reflectionMD(REAL(calm.A), '').includes(`Worth at fair value: gave ${money(calm.worth.pen)}, got ${money(calm.worth.scrap)}.`));
  assert.ok(D.reflectionMD(REAL(calm.B), '').includes(`Worth at fair value: gave ${money(calm.worth.scrap)}, got ${money(calm.worth.pen)}.`));
  // the proposer's gain is counted when the swap settles and the pair when the offer was made: after a glut in pens the two disagree in sign, and the pair must still be read by role, never by the gain's sign
  const moved = swap((A) => A.injectEvent('glut', A.s.hour, { cls: 'pen', id: 'glut-1' }));
  assert.ok(moved.rowA.amt > 0 && moved.rowA.vb - moved.rowA.va < 0, 'the glut turned the proposer\'s loss into a gain on settlement');
  assert.ok(D.debriefHTML(REAL(moved.A)).includes(cell(moved.worth.pen, moved.worth.scrap)) && !D.debriefHTML(REAL(moved.A)).includes(cell(moved.worth.scrap, moved.worth.pen)));
  assert.ok(D.debriefHTML(REAL(moved.B)).includes(cell(moved.worth.scrap, moved.worth.pen)));
  // a side that is cash shows its amount (the row names assets only), at both ends
  const A = mk(1, 'AAA'), B = mk(2, 'BBB'), pen = put(A, 'pen'); B.s.cash = 50;
  const off = A.createOffer({ to: 'BBB', giveIds: [pen.id], want: { assets: [], cash: 3 } }), acc = B.acceptOffer(off.offer);
  assert.ok(off.ok && acc.ok && A.finalizeOffer(off.offer.id, acc.deliver, 'BBB').ok);
  assert.ok(D.debriefHTML(REAL(A)).includes(cell(A.val(pen), 3)) && D.debriefHTML(REAL(B)).includes(cell(3, A.val(pen))));
  assert.ok(D.reflectionMD(REAL(B), '').includes(`Worth at fair value: gave ${money(3)}, got ${money(A.val(pen))}.`));
  // a row with no values (a save from before they were kept) says so and prints no NaN
  const old = mk(3, 'OLD'); old.s.ledger.push({ type: 'p2p', h: 30, text: 'Swap', amt: 1.5, gave: ['pen'], got: ['scrap'] });
  assert.ok(D.debriefHTML(REAL(old)).includes('<td class="mono">n/a</td><td class="mono green">+$1.50</td>') && !/NaN/.test(D.debriefHTML(REAL(old)) + D.reflectionMD(REAL(old), '')));
});

// ---------------------------------------------------------------------------------------------------------------------
test('D4: Prompt B, the chart and the workbook name the day the credit crunch really hit, and say what it changes', () => {
  // the instructor deploys the crunch for day 20 in place of the scheduled one (js/engine.js `injectEvent`)
  const g = makeGame(['connected', 'grad'], 'ops', 5); g.env.algo = false;
  g.injectEvent('fed', 24 * 19, { id: 'inj-fed-456-1', replace: true, injected: true });
  g.advanceTo(24 * 27);
  const fed = g.s.shockLog.find((x) => x.kind === 'fed');
  assert.equal(fed.start, 24 * 19, 'it hit on day 20');
  assert.ok(!g.s.shockLog.some((x) => x.start === (EVENTS.fed.day - 1) * 24) && !g.s.events.some((x) => x.kind === 'fed' && !x.started), 'and the scheduled copy was taken out');
  const html = D.debriefHTML(REAL(g)), md = D.reflectionMD(REAL(g), '');
  assert.ok(html.includes('<h2>Prompt B: the credit crunch, day 20</h2>'));
  assert.ok(!/day 45/i.test(html), 'no day 45 anywhere on a page about a crunch that hit on day 20');
  assert.ok(md.includes('## Evidence: Prompt B (the credit crunch, day 20)'));
  assert.match(html, /stroke="#ff7d75" stroke-width="2"\/><text[^>]*>Day 20<\/text>/, 'the chart marks day 20');
  assert.ok(!/>Day 45</.test(html), 'and not the scheduled day 45');
  const code = read('js/ui/debrief.js').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/Day 45|day 45/.test(code), 'the source holds no hard-coded day for the shock');
  // the ordinary run: the scheduled day, the engine's own; the run before it: no day, and a plain statement
  const ordinary = makeGame(['connected', 'grad'], 'ops', 5); ordinary.env.algo = false; ordinary.advanceTo(24 * 50);
  assert.ok(D.debriefHTML(REAL(ordinary)).includes(`<h2>Prompt B: the credit crunch, day ${EVENTS.fed.day}</h2>`));
  const before = D.debriefHTML(REAL(fresh));
  assert.ok(before.includes('<h2>Prompt B: the credit crunch</h2>') && before.includes('No credit crunch has occurred in your run.'));
  assert.match(D.debriefHTML(REAL(late)), /Vertical lines mark the macro shocks on days 15, 45\./, 'the chart marks the macro shocks that hit, and its description lists only what is drawn');

  // what it changes, in the fold: the game's own alert lines and the freeze; every figure is the engine's
  const fold = unescape(folds(html).find((x) => /base monthly rate/.test(x)) || '');
  for (const v of EVENTS.fed.alert.vars) assert.ok(fold.includes(v), v);
  const sched = makeGame([], 'ops', 3); sched.env.algo = false; sched.advanceTo((EVENTS.fed.day - 1) * 24 + 1);
  const m = sched.mods();
  assert.equal(m.rateBps, 600); assert.ok(Math.abs(BASE_RATE + m.rateBps / 10000 - 0.085) < 1e-12, 'the base monthly rate goes from 2.5% to 8.5%');
  assert.ok(Math.abs(FEES.base + m.fee - FEES.crunch) < 1e-12 && Math.abs(FEES.crunch - 0.12) < 1e-12, 'the fee on sales goes from 2.5% to 12.0%');
  assert.equal(m.overhead, 1.2); assert.equal(m.freeze, true);
  assert.equal(m.price.length, 0, 'it has no effect on asset prices'); assert.equal(m.demand.length, 0, 'or on demand');
  const days = (p) => (p.to - p.from) / 24, freeze = EVENTS.fed.phases.find((p) => p.eff.freeze), rates = EVENTS.fed.phases.find((p) => p.eff.rateBps);
  assert.equal(days(freeze), 10); assert.equal(days(rates), 15); assert.equal(EVENTS.fed.day + days(freeze), 55);
  assert.ok(fold.includes(`No new bank loans for ${days(freeze)} days.`));
  sched.s.mil.m1 = true;
  assert.match(sched.loanBlock('micro'), /Credit freeze/, 'the freeze blocks a new bank loan...');
  sched.advanceTo((EVENTS.fed.day - 1) * 24 + 24 * days(freeze)); assert.equal(sched.loanBlock('micro'), '', '...for ten days');
  // the kit says the same, with the numbers from the same places
  const kit = read('docs/FACULTY_KIT.md'), row = kit.split('\n').find((l) => l.startsWith('| The Fed Taper')), pct = (x) => (x * 100).toFixed(1) + '%';
  for (const t of [`${pct(BASE_RATE)} to ${pct(BASE_RATE + 600 / 10000)}`, `${pct(FEES.base)} to ${pct(FEES.crunch)}`, 'manager overhead rises 20%', 'for 10 days (until Day 55)', 'It has no effect on asset prices', `For ${days(rates)} days`]) assert.ok(row.includes(t), `the kit's crunch row says "${t}"`);
  assert.ok(!/transaction tax/.test(kit) && !/exploited the drop in asset values/.test(kit), 'it is a fee, not the tax, and there is no drop in asset values to exploit');
  // the Codex page says the same: the rest sell stock at the crunch's fee, not into a falling market (the crunch moves no price)
  const page = CODEX.find((x) => x.id === 'credit-crunch').body.join(' ');
  assert.ok(page.includes(`sell stock at the ${Math.round(FEES.crunch * 100)}% fee to raise cash`) && !/falling market/.test(page));
  assert.ok(kit.includes('If debt exceeded net worth, explain what you did to prevent margin compression'));
  // the Debrief's own line for Prompt B: debt above net worth is the shock log's debt-to-equity over 1 (js/engine.js `deRatio`), and the crunch moves no price, so no line asks how to exploit a drop
  const asks = (loan) => {
    const x = makeGame([], 'ops', 3); x.env.algo = false; x.injectEvent('fed', 24 * 19, { id: 'inj-fed-9-1', replace: true, injected: true });
    x.s.mil.m1 = true; x.s.cash = 1000; x.advanceTo(24 * 19 - 2); if (loan) assert.ok(x.draw('micro', loan).ok); x.advanceTo(24 * 19 + 1);   // the loan is drawn just before the shock
    const logged = x.s.shockLog.find((e) => e.kind === 'fed'), page = D.debriefHTML(REAL(x));
    assert.equal(logged.de > 1, logged.debt > logged.nw, `debt ${logged.debt} against net worth ${logged.nw}: the log's debt-to-equity is over 1 exactly when debt is above net worth`);
    assert.ok(!/exploit|asset price|drop in asset/i.test(page), 'the crunch moves no asset price (m.price is empty above), so no line asks how it was exploited');
    return /<h2>Prompt B[^<]*<\/h2>\s*<p class="mute small">([^<]*)<\/p>/.exec(page)?.[1];
  };
  const above = 'Debt exceeded your net worth when it hit: explain what stopped margin compression.', atMost = 'Debt was at most your net worth when it hit: explain how you used that position while credit was tight.';
  assert.equal(asks(0), atMost, 'no debt'); assert.equal(asks(200), atMost, 'debt well under net worth'); assert.equal(asks(1500), above, 'debt above net worth');
  // the other two rows of the kit's table are the engine's too
  const tik = EVENTS.tiktok.phases, tr = kit.split('\n').find((l) => l.startsWith('| The TikTok'));
  assert.ok(tr.includes(`For ${tik[0].to} hours demand for trend goods spikes +${(tik[0].eff.demand.mult - 1) * 100}%`) && tr.includes(`manager cycles run ${Math.round((tik[0].eff.speed.mult - 1) * 100)}% faster`));
  assert.ok(tr.includes(`halves the value of trend inventory for ${tik[1].to - tik[1].from} hours`) && tik[1].eff.price.mult === 0.5);
  const tar = EVENTS.tariff.phases[0], tt = kit.split('\n').find((l) => l.startsWith('| The Cross-Border'));
  assert.ok(tt.includes(`For ${(tar.to - tar.from) / 24} days`) && tt.includes(`slow by ${tar.eff.intlSlow / 24} virtual days`) && tt.includes(`cost ${Math.round((tar.eff.repair - 1) * 100)}% more`));
});

// ---------------------------------------------------------------------------------------------------------------------
test('D4b: a Veteran feels the credit crunch\'s three rises 40% smaller (js/engine.js `mods`): the fold and the kit say so in the engine\'s numbers, and the freeze and the days stay', () => {
  const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
  const sf = PERKS.veteran.mods.shockSoften, rises = EVENTS.fed.phases.find((p) => p.eff.rateBps).eff, start = (EVENTS.fed.day - 1) * 24;
  const vet = makeGame(['veteran', 'heir'], 'ops', 3); vet.env.algo = false; vet.advanceTo(start + 1);
  const m = vet.mods();
  assert.ok(Math.abs(m.rateBps - rises.rateBps * (1 - sf)) < 1e-9 && Math.abs(m.fee - rises.fee * (1 - sf)) < 1e-12 && Math.abs(m.overhead - (1 + (rises.overhead - 1) * (1 - sf))) < 1e-12, 'the engine softens the three rises');
  assert.equal(m.freeze, true); vet.advanceTo(start + 239); assert.equal(vet.mods().freeze, true); vet.advanceTo(start + 240); assert.equal(vet.mods().freeze, false, 'the freeze is not softened: ten days');
  vet.advanceTo(24 * 50);
  const open = unescape(folds(D.debriefHTML(REAL(vet))).find((x) => /base monthly rate/.test(x)) || '');
  const rate = pct(BASE_RATE + rises.rateBps * (1 - sf) / 10000), fee = pct(FEES.base + rises.fee * (1 - sf)), ovh = pct((rises.overhead - 1) * (1 - sf), 0);
  for (const x of [`Your Veteran Background softens the three rises by ${Math.round(sf * 100)}%`, `base monthly rate rises to ${rate}`, `base fee on sales to ${fee}`, `manager overhead by ${ovh}`, 'The loan freeze is not softened.']) assert.ok(open.includes(x), x);
  for (const v of EVENTS.fed.alert.vars) assert.ok(open.includes(v), 'the announced lines stay: ' + v);
  assert.ok(!/softens the three rises/.test(unescape(folds(D.debriefHTML(REAL(fresh))).join(' '))), 'a founder without the Background is not told it');
  // the kit says it once, under the table, for the three rows
  const kit = read('docs/FACULTY_KIT.md'), para = kit.split('\n').find((l) => l.startsWith('A student with the Veteran Background'));
  assert.ok(para, 'the kit has the sentence');
  const tik = EVENTS.tiktok.phases[0].eff.demand.mult, tar = EVENTS.tariff.phases[0].eff.intlSlow, rep = EVENTS.tariff.phases[0].eff.repair;
  const inside = (kind) => { const v = makeGame(['veteran', 'heir'], 'ops', 3); v.env.algo = false; v.advanceTo((EVENTS[kind].day - 1) * 24 + 1); return v.mods(); };   // the surge and the lock, softened by the same line of `mods`
  assert.ok(Math.abs(inside('tiktok').demand[0].mult - (1 + (tik - 1) * (1 - sf))) < 1e-9 && Math.abs(inside('tariff').intlSlow - tar * (1 - sf)) < 1e-9 && Math.abs(inside('tariff').repair - (1 + (rep - 1) * (1 - sf))) < 1e-9, 'the engine softens the other two rows the same way');
  assert.ok(para.includes(`repairs cost ${pct((rep - 1) * (1 - sf), 0)} more (not ${pct(rep - 1, 0)})`), 'and the kit says the repairs');
  for (const x of [`${Math.round(sf * 100)}% smaller`, `to ${rate} (not ${pct(BASE_RATE + rises.rateBps / 10000)})`, `to ${fee} (not ${pct(FEES.crunch)})`, `rises ${ovh} (not ${pct(rises.overhead - 1, 0)})`, `demand rises ${pct((tik - 1) * (1 - sf), 0)} (not ${pct(tik - 1, 0)})`, `slow by ${tar * (1 - sf) / 24} days (not ${tar / 24})`, 'The loan freeze and the length of each shock do not change.']) assert.ok(para.includes(x), `the kit says "${x}"`);
});

// ---------------------------------------------------------------------------------------------------------------------
test('D5: the adaptability column shows what the subtotal counts, in the table and in the CSV, and the grade notes are the gradebook\'s own numbers', () => {
  // no shock graded yet: `adapt` is null, and the gradebook still counts a neutral 50 of 100 (js/session.js `adapt ?? 50`)
  const S = instructorWith([['A', { nw: 5000 }], ['B', { nw: 3000 }], ['C', { nw: 1000 }]], 100);
  const gb = S.gradebook(), grade = I.instructorParts(S, {}).grade, csv = I.gradebookCSV(S).split('\n');
  assert.ok(gb.every((r) => r.adapt == null), 'nothing is graded');
  for (const r of gb) {
    assert.ok(Math.abs(r.auto - r.econ * 0.3 - r.engage * 0.1 - 10) < 1e-9, 'a neutral 50 of 100 is 10 of the 20 points');
    const cells = cellsOf(grade, r.pid);
    assert.equal(cells[6], '10.0*', 'the table says what is counted, marked');
    assert.ok(Math.abs(num(cells[5]) + num(cells[6]) + num(cells[7]) - num(cells[8])) < 0.15, 'the three components add up to the subtotal the row shows (to a tenth)');
    const c = csv.find((l) => l.startsWith(`"${r.pid}"`)).split('","').map((x) => x.replace(/"/g, ''));
    assert.equal(c[10], '10.0', 'the CSV says it too, where it was blank');
    assert.equal(c.at(-1), 'no', 'and its last column says the 10.0 is the neutral figure');
    assert.ok(Math.abs(num(c[9]) + num(c[10]) + num(c[11]) - num(c[12])) < 0.15, 'its components add up to its subtotal');
  }
  assert.ok(grade.includes('<p class="tiny mute">* No shock graded yet: counted as a neutral 50 of 100, which is 10 of the 20 points.</p>'), 'the note says the points as well as the score');
  assert.ok(!/>n\/a</.test(grade) && !/<span class="mute">n\/a<\/span>/.test(read('js/ui/instructor.js')), 'no "n/a" where a number is counted');
  assert.ok(csv[0].includes('"adaptability_points_of_20"') && csv[0].endsWith('"virtual_days_played","adaptability_graded"'), 'the column keeps its name and its place, and the new one is last');
  // a shock graded for three founders: a real figure, no star, no note
  const log = (after, pivots) => [{ id: `fed@${(EVENTS.fed.day - 1) * 24}`, nw: 1000, nwAfter: after, pivots }];
  const T = instructorWith([['A', { nw: 2000, shockLog: log(1200, 1) }], ['B', { nw: 2000, shockLog: log(1200, 0) }], ['C', { nw: 2000, shockLog: log(1200, 0) }]], 24 * 60);
  const tg = T.gradebook(), gradeT = I.instructorParts(T, {}).grade;
  assert.ok(tg.every((r) => r.adapt != null));
  assert.ok(!gradeT.includes('*</span>') && !gradeT.includes('No shock graded yet'));
  assert.equal(cellsOf(gradeT, 'A')[6], (tg.find((r) => r.pid === 'A').adapt * 0.2).toFixed(1));
  assert.ok(I.gradebookCSV(T).split('\n').slice(1).every((l) => l.endsWith('","yes"')), 'a graded founder says yes');
  // the same 10.0 from two different facts: a founder at the class median (graded) and one with no graded shock
  const M = instructorWith([['A', { nw: 2000, shockLog: log(1500, 0) }], ['B', { nw: 2000, shockLog: log(1200, 0) }], ['C', { nw: 2000, shockLog: log(900, 0) }], ['D', { nw: 2000 }]], 24 * 60);
  const mc = (pid) => I.gradebookCSV(M).split('\n').find((l) => l.startsWith(`"${pid}"`)).split('","').map((x) => x.replace(/"/g, ''));
  assert.deepEqual([mc('B')[10], mc('D')[10]], ['10.0', '10.0'], 'the same figure');
  assert.deepEqual([mc('B').at(-1), mc('D').at(-1)], ['yes', 'no'], 'told apart by the last column');
  // the notes in the fold: 10 of 100 for a pivot, 25 per swap, 10 per flagged attempt, the weights
  assert.ok(Math.abs(tg.find((r) => r.pid === 'A').adapt - tg.find((r) => r.pid === 'B').adapt - 10) < 1e-9, 'a pivot is worth 10 of the 100');
  const one = instructorWith([['A', { nw: 100, p2p: 1, trades: 1 }], ['B', { nw: 90, p2p: 2, trades: 2 }]], 24 * 5);
  one.flags = [{ from: 'B', to: 'A', variance: 0.9, hour: 10 }];
  const engage = Object.fromEntries(one.gradebook().map((r) => [r.pid, r.engage]));
  assert.equal(engage.A, 25, 'one swap is 25 of 100'); assert.equal(engage.B, 2 * 25 - 10, 'and a flagged attempt takes 10');
  const fold = folds(I.instructorParts(S, {}).grade).join(' ');
  for (const t of ['Each component is scored from 0 to 100, then weighted to the points in its column heading.', 'Economic (30)', 'Adaptability (20)', 'Peer market (10)', 'plus 10 for a pivot', 'a neutral 50', '25 for each completed swap', 'less 10 for each flagged attempt', 'The 40 points for reflection', 'percentile of the efficiency index among everyone on the roster, demo students included']) assert.ok(fold.includes(t), t);
  assert.ok(gb.every((r) => r.autoMax === 60) && grade.includes('Auto subtotal / 60'), 'the pre-filled points are 60 of 100');
  const demo = new Session(); demo.mode = 'instructor'; demo.roomInfo = { code: 'D', relay: '' }; demo.setDemo(6);
  assert.equal(demo.gradebook().length, 6, 'the demo students are rows of the roster, so they are in the percentile');
  assert.ok(titles(I.instructorParts(S, {}).c1).includes('Made-up students for a demo. They count in everyone\'s percentile, so leave this at 0 when you grade.'));
  const compliance = read('docs/COMPLIANCE.md').split('\n').find((l) => /LTI 1\.3 Advantage/.test(l));
  assert.ok(fold.includes(`href="${I.KIT_URL}"`) && fold.includes('Grade passback (LTI 1.3) is not built') && /Not implemented/.test(compliance), 'and the passback line is COMPLIANCE.md\'s');
});

// ---------------------------------------------------------------------------------------------------------------------
test('D6: the schedule line is the list of scheduled and sent shocks a student\'s game holds, with and without Replace, and says the algorithmic events are not on it (what Deploy stores: tests/copy2-debrief-mount.test.mjs)', () => {
  const S = instructorWith([], 24 * 20); S.worldSeed = 'GRADE';
  const atHour = 24 * 20 + 1, dayOf = (h) => Math.floor(h / 24) + 1, NOTE = ' Algorithmic surprise events, drawn from the room code and the day, are not listed.';
  S.clock.set({ hour: atHour });
  const game = (sends) => {                                    // a student's game at the class's hour, in this room, given what the instructor sent (js/engine.js `injectEvent`); the algorithmic events are on, as they are by default
    const g = makeGame([], 'ops', 3); g.env.worldSeed = 'GRADE'; g.advanceTo(24 * 20);
    for (const m of sends) g.injectEvent(m.kind, m.atHour, { id: m.id, replace: m.replace, injected: true });
    g.advanceTo(atHour);
    return g;
  };
  const engine = (sends) => game(sends).s.events.filter((e) => !e.started && !e.id.startsWith('algo')).map((e) => `${e.kind}@${e.start}`).sort();
  const line = (U) => I.instructorParts(S, U).c1.match(/<p class="tiny mute" title="[^"]*">((?:Scheduled|No shock)[^<]*)<\/p>/)[1];
  const mine = (U) => I.shockSchedule(S, S.clock.now(), U.sent).map((e) => `${e.kind}@${e.start}`).sort();
  assert.deepEqual(mine({ sent: [] }), engine([]), 'before anything is sent: what the games hold');
  assert.deepEqual(game([]).s.events.filter((e) => !e.started && e.id.startsWith('algo')).map((e) => `${e.kind}@${e.start}`), ['glut@488'], 'a game of this room already holds its next algorithmic event, and the line does not list it (js/engine.js `_algoEvent`, one day ahead)');
  assert.equal(line({ sent: [] }), `Scheduled: Credit Crunch day ${EVENTS.fed.day}, Tariff Lock day ${EVENTS.tariff.day}.${NOTE}`, 'the TikTok surge of day 15 is behind the class: it is not scheduled, and the line says what it leaves out');
  S.setAlgo(false); assert.equal(line({ sent: [] }), `Scheduled: Credit Crunch day ${EVENTS.fed.day}, Tariff Lock day ${EVENTS.tariff.day}.`, 'with the algorithmic events off there is nothing left out to say'); S.setAlgo(true);
  const U = { sent: [] };
  for (const [kind, when, replace] of [['fed', 0, true], ['tiktok', 72, false], ['tariff', 24, true]]) {
    const r = S.inject(kind, { when, replace });
    assert.ok(r.ok && S.injected.get(r.id) === r.atHour, 'the session records what it sent');
    U.sent.push({ id: r.id, kind, at: r.atHour, from: r.atHour - when, replace });
    assert.deepEqual(mine(U), engine(S.sent.filter((m) => m.t === 'inject')), `after ${kind} in ${when} hours${replace ? ', replacing' : ''}: the same shocks as a student's game`);
  }
  assert.equal(line(U), `Scheduled: Tariff Lock day ${dayOf(24 * 20 + 24)}, TikTok Surge day ${dayOf(24 * 20 + 72)}.${NOTE}`, 'the credit crunch was sent for now (it is not to come), the tariff replaced the scheduled one, the surge was added');
  // nothing left to come
  assert.equal(I.shockSchedule(S, 24 * 89, []).length, 0);
  assert.ok(new RegExp(`<p class="tiny mute"[^>]*>No shock is scheduled\\.${NOTE}</p>`).test(I.instructorParts(instructorWith([], 24 * 80), {}).c1));
  // a shock the record does not hold (the dashboard was reloaded): listed, and the scheduled one of its kind says it may be gone
  const R = instructorWith([], 24 * 20); R.injected.set('inj-fed-480-1234', 480);
  assert.ok(I.instructorParts(R, {}).c1.includes('Scheduled: Credit Crunch day 45 (if not replaced), Tariff Lock day 75.'));
  // the record survives a reload, and belongs to its room
  S.kv.set('shocksent', { code: 'GRADE', list: U.sent });
  assert.deepEqual(I.loadSent(S).map((x) => x.id), U.sent.map((x) => x.id)); store.clear();
  assert.deepEqual(I.loadSent(S), []);
  assert.ok(/close\(\) \{ S\.kv\?\.del\(SENT_KEY\); hooks\.onClose\(\); \}/.test(read('js/ui/instructor.js')), 'closing the room forgets the record, as it forgets the roster');
  // what the hover says about warnings is the engine's
  const g = makeGame([], 'ops', 3), warn = (level) => { g.s.skills.fintech = level; return g.warnLead(); };
  assert.deepEqual([warn(1), warn(3), warn(5)], [WARN_LEAD.novice, WARN_LEAD.mid, WARN_LEAD.adv]);
  assert.ok(titles(I.instructorParts(S, {}).c1).includes(`Students with higher Capital Sourcing get earlier warnings: ${warn(1)} hours at first, ${warn(3)} hours at level 3, ${warn(5) / 24} days at level 5.`));
  assert.ok(!/Scheduled: TikTok Surge day 15/.test(read('js/ui/instructor.js')) && !/Upcoming/.test(read('js/ui/instructor.js')), 'the fixed line is gone, and so is the label that claimed all of them');
  // the kit says what the line does not know after a resume on another device, and which shocks it leaves out
  const kit = read('docs/FACULTY_KIT.md');
  assert.ok(kit.includes('**Scheduled**') && kit.includes('The Scheduled line does not know the shocks the old dashboard sent') && /algorithmic surprise events that the room code draws are not on it/.test(kit));
});

// ---------------------------------------------------------------------------------------------------------------------
test('D7: what the rewind, the stalled list and the room line say is what the engine and the relay do', () => {
  // a game keeps ten days of daily checkpoints, so a rewind reaches back ten days at most
  const g = makeGame([], 'ops', 3); g.advanceTo(24 * 25);
  assert.equal(Math.floor(g.s.hour / 24) - Math.min(...g.ckpt.keys()), I.CHECKPOINT_DAYS, 'ten days back, from the day the game is on');
  const S = instructorWith([], 24 * 30), c1 = I.instructorParts(S, {}).c1;
  const rewinds = [...c1.matchAll(/<button[^>]*data-act="rewind" data-d="(\d)" title="([^"]*)"[^>]*>([^<]*)<\/button>/g)];
  assert.deepEqual(rewinds.map((m) => [m[1], m[3]]), [['1', 'Rewind 1 day'], ['3', '3 days'], ['7', '7 days']]);
  for (const m of rewinds) assert.equal(m[2], `Sends every online student back ${m[1]} day${m[1] === '1' ? '' : 's'} to a daily checkpoint. A rewind reaches back ${I.CHECKPOINT_DAYS} days at most.`);
  assert.ok(rewinds.every((m) => +m[1] <= I.CHECKPOINT_DAYS), 'every button is inside what a game keeps');
  // a rewind goes to the room as one live message (js/session.js `rewind`) and the relay replays only the last snapshots and the clock (server/relay.mjs): a student who is away is not rewound
  const before = S.sent.length; S.rewind(3);
  assert.deepEqual(S.sent.slice(before).map((m) => m.t), ['rewind', 'clock']);
  const relay = read('server/relay.mjs');
  assert.ok(/snaps:\s*new Map\(\)[^}]*clock:\s*null/.test(relay) && /room\.clock = \{/.test(relay) && !/room\.(rewind|inject)\b/.test(relay), 'the relay keeps snapshots and the clock for a late joiner (a cheap check of the source; tests/multiplayer.test.mjs plays it against a running relay: a late joiner is sent the clock and the snapshots, not the rewind or the shock)');
  const kit = read('docs/FACULTY_KIT.md');
  assert.ok(!/catch up deterministically/.test(kit + read('js/ui/instructor.js')) && kit.includes('A student who is offline when you rewind is not rewound'));
  // who a rewind and a shock reach is in front, under their buttons, in the roster's own word (a title is read by a mouse and by nothing else)
  assert.ok(visible(c1).includes('A rewind reaches only the students who are online when you send it.') && visible(c1).includes('A shock reaches only the students who are online when you deploy it.'));
  assert.ok(!/title="[^"]*(?:connected|offline)/.test(c1) && !/connected/.test(visible(c1)), 'one word for it on the dashboard: online, as the head and the roster chips say');
  assert.ok(I.instructorParts(instructorWith([['A', { nw: 100 }]], 24 * 5), {}).head.includes('<b>1</b> student online'));

  // the stalled list counts a sale to a buyer or a manager cycle: the two places the engine sets `lastAuto` (a sale to the pool does not)
  const b = makeGame(['trades', 'pro'], 'ops', 9); run(b, { days: 40 });
  const last = Math.max(0, ...b.s.ledger.filter((e) => (e.type === 'pitch' && e.cm) || e.type === 'pipe').map((e) => e.h));
  assert.ok(!b.s.ledgerDropped && b.s.ledger.some((e) => e.type === 'pitch' && e.cm) && b.s.ledger.some((e) => e.type === 'pipe'));
  assert.equal(b.s.lastAuto, last, 'lastAuto is the hour of the last completed pitch or manager cycle');
  const asset = b.s.assets.find((a) => b.s.pool[a.zone] > 0);
  if (asset) { b.s.auditPending = null; const was = b.s.lastAuto; b.sellPool([asset.id]); assert.equal(b.s.lastAuto, was, 'a sale to the pool does not move it'); }
  const T = instructorWith([['STALL', { nw: 900, autoEligible: true, lastAutoHour: 24 * 30 - 24 * (I.STALL_DAYS + 1), mil: { m1: true } }], ['FINE', { nw: 900, autoEligible: true, lastAutoHour: 24 * 30 - 24 * (I.STALL_DAYS - 1), mil: { m1: true } }], ['NEW', { nw: 900, autoEligible: false, lastAutoHour: 0 }]], 24 * 30);
  const c2 = I.instructorParts(T, {}).c2, stalled = c2.slice(c2.indexOf('Operational bottlenecks'), c2.indexOf('Flagged peer trades'));
  assert.ok(stalled.includes('STALL') && !stalled.includes('FINE') && !stalled.includes('NEW'), `a founder past the first milestone is listed after ${I.STALL_DAYS} days`);
  assert.ok(titles(stalled).includes(`Days since a sale to a buyer or a manager cycle last finished. A founder is listed after ${I.STALL_DAYS} days, once past the first milestone.`));
  assert.ok(!/automated asset velocity|pipeline-management|no automated activity/.test(c2 + kit));
  assert.ok(kit.includes('no sale to a buyer and no manager cycle for more than three virtual days') && I.STALL_DAYS === 3);

  // the flagged-trades band, the Gini line, the room line
  assert.ok(c2.includes(`outside +/-${FMV_BAND * 100}% of fair value`));
  const calm = instructorWith([['A', { nw: 100 }], ['B', { nw: 100 }]], 24 * 5), parts = I.instructorParts(calm, {});
  assert.equal(I.GINI_ALERT, 0.65);
  assert.ok(!/Inequality alert|alert line/.test(parts.c2) && titles(parts.c2).includes('The alert starts above 0.65.'), 'a calm room has no line about the alert, and the card says where it starts');
  assert.ok(parts.head.includes('<span title="Students join from other tabs of this browser with Copy student link.">this browser only</span> (other devices need a relay)'));
  assert.match(visible(parts.head), /this browser only\s*\(other devices need a relay\)/, 'who cannot join is in front, where a keyboard and a tablet read it');
  assert.ok(!visible(parts.head).includes('students join from other tabs'));
  // the paragraph that is read without opening the fold says the room is this browser's tabs when there is no relay, and does not offer another laptop (js/net.js LocalTransport is a BroadcastChannel)
  const keyed = (room) => { room.recoveryCode = () => 'abcd-abcd-abcd-abcd-abcd-abcd-abcd-abcd'; return room; };
  const local = I.recoveryHTML(keyed(instructorWith([], 24 * 5))), shown = local.slice(0, local.indexOf('<details'));
  assert.ok(shown.includes('This live room exists only in this browser\'s tabs.') && shown.includes('another laptop cannot take it over') && !shown.includes('from another laptop'));
  const viaRelay = keyed(instructorWith([], 24 * 5)); viaRelay.room = { ...viaRelay.room, kind: 'relay' };
  assert.ok(I.recoveryHTML(viaRelay).includes('are the only way back in from another laptop') && !I.recoveryHTML(viaRelay).includes('cannot take it over'), 'and a room on a relay keeps its sentence');
});

// ---------------------------------------------------------------------------------------------------------------------
const VOICE = /\b(simply|basically|essentially|literally|incredibly|extremely|truly|obviously|of course|it is important to|keep in mind|please note|not just|good luck|exciting|amazing|fantastic|wonderful|delve|welcome|free)\b|\blet[’']s\b|!|—|–|\?/i;

test('D8: what the debrief and the dashboard show at first is a fraction of what it was, speaks plainly, and keeps the rest one fold or hover away', () => {
  // the words at first (a fresh run, and a bot's day 60). Before this pass the debrief read 449 and 1,194 words and the dashboard 640 and 651 (as this file's visible() counts them on c4b9c48)
  const was = { debrief: [449, 1194], dashboard: [640, 651] };
  const freshD = visible(D.debriefHTML(REAL(fresh))), lateD = visible(D.debriefHTML(REAL(late)));
  assert.ok(words(freshD) <= 0.75 * was.debrief[0], `a fresh debrief reads ${words(freshD)} words`);
  assert.ok(words(lateD) <= 0.45 * was.debrief[1], `a day-60 debrief reads ${words(lateD)} words`);
  for (const [game, before] of [[fresh, was.dashboard[0]], [late, was.dashboard[1]]]) {
    const all = visible(Object.values(I.instructorParts(dashboard(game), { ev: 'fed', when: '0' })).join('\n'));
    assert.ok(words(all) <= 0.8 * before, `the dashboard reads ${words(all)} words`);
  }
  // no question, no filler, no dash, no exclamation, no "free": in the words, on hover and in the folds (the Backgrounds' own text is the Draft's, not these screens')
  for (const game of [fresh, late]) {
    const debrief = D.debriefHTML(REAL(game)), md = D.reflectionMD(REAL(game), ''), parts = Object.values(I.instructorParts(dashboard(game), {})).join('\n');
    for (const [name, html] of [['debrief', debrief.replace(/<div class="sc-build">[\s\S]*?<\/div><\/details>/, '</details>')], ['dashboard', parts]]) {
      const text = [visible(html), ...titles(html), ...folds(html).map((f) => f.replace(/<[^>]+>/g, ' '))].join(' | '), m = VOICE.exec(text);
      assert.ok(!m, `${name}: "${m?.[0]}" in: ${text.slice(Math.max(0, (m?.index ?? 0) - 60), (m?.index ?? 0) + 60)}`);
    }
    assert.ok(!VOICE.test(md.replace(/\?/g, '').replace(/Free Niche Radar/g, '')), 'the workbook too');
    assert.ok(!/\bzones?\b/i.test(debrief + md + parts), 'district, never zone');
  }
  // what was said in front and is now folded or on hover
  const html = D.debriefHTML(REAL(late)), open = withoutFolds(html);
  for (const t of ['Strength and cost of each Background', 'Your actions from a day before to five days after', 'What the credit crunch changed', 'The formula', 'The other \\d+ niches', 'Data table for the chart']) assert.ok(new RegExp(`<summary class="small">${t}`).test(html), `a fold: ${t}`);
  assert.ok(!/Upgraded Asset Broker|liquidity pool \(/.test(open), 'the list of actions is not in front');
  for (const id of late.s.perks) assert.ok(!open.includes(PERKS[id].strength.slice(0, 30)) && html.includes(PERKS[id].name), `${id}: the build is named in front and described in the fold`);
  assert.ok(!/Everyone starts with one paperclip/.test(html));
  const dash = I.instructorParts(dashboard(late), {});
  assert.ok(!/Rewind restores|catch up|Scheduled: TikTok Surge day 15/.test(Object.values(dash).join('')), 'the old rewind sentence and the fixed schedule line stay gone');
  assert.ok(dash.c2.includes('<summary class="small" data-fid="fold-buyers">Buyer key</summary>') && Object.values(BUYERS).some((b) => unescape(folds(dash.c2)[0]).includes(b.name)), 'the buyer key is a fold');
  assert.equal(folds(dash.grade).length, 1); assert.ok(dash.grade.includes('data-fold="points"'));
  // a fold the instructor opened stays open when its panel is drawn again
  assert.ok(I.instructorParts(dashboard(late), { open: { points: true, buyers: true } }).grade.includes('<details class="gap" data-fold="points" open>'));
  assert.ok(!dash.grade.includes('data-fold="points" open'));
  // a printed debrief carries what the folds hold: every fold but the chart's data table is opened for the print and shut again after it
  assert.equal((html.match(/<details class="gap" data-print>/g) || []).length, folds(html).length - 1);
  assert.ok(/addEventListener\('beforeprint', openForPrint\)/.test(read('js/ui/debrief.js')) && /removeEventListener\('afterprint', shutAfterPrint\)/.test(read('js/ui/debrief.js')));
  // the strings that stay, read from the screens' sources
  const d = read('js/ui/debrief.js'), i = read('js/ui/instructor.js');
  for (const t of ['work through prices, speed and limits', 'No Deal Room scores were recorded', 'Family obligations paid', 'Student-loan garnishment']) assert.ok(d.includes(t), t);
  for (const t of ['Rewind sent to the students who are online.', 'Event deployed to the students who are online.', 'Student link copied, with quiet sound.']) assert.ok(i.includes(t), t);
  assert.ok(!/Rewind sent to all students|Event deployed to the cohort/.test(i), 'a toast does not claim a reach the hover and the kit deny');
});

// ---------------------------------------------------------------------------------------------------------------------
test('D9: the title\'s classroom panels say less, and the kit names what the screens name', () => {
  const main = read('js/main.js'), a = main.indexOf('<div class="choices">'), b = main.indexOf('<p class="tiny mute" id="build-note"');
  const h = main.slice(a, b).replace(/\$\{saved[^}]*\}/g, '').replace(/\$\{instr \?[^]*?\}\n/g, '\n').replace(/\$\{instrKey \?[^]*?\}\n/g, '\n').replace(/\$\{[^}]*\}/g, 'X');
  const text = visible(h.replace(/<input[^>]*>/g, ' '));
  assert.ok(words(text) <= 80, `the Join, Instructor and Accessible panels read ${words(text)} words (99 before this pass)`);
  assert.ok(!VOICE.test(text), text);
  for (const t of ['Join a classroom', 'Room code from your instructor', 'Create a room', 'Resume as instructor: take back a room', 'Accessible by design', 'Display and sound settings']) assert.ok(text.includes(t), t);
  assert.ok(main.includes('<label for="ir">Relay URL (blank: other tabs of this browser only; other devices need one)</label>'), 'the label says what a blank box does and what it cannot, in front');
  assert.ok(!/Keyboard-only play, screen-reader announcements/.test(main) && !/Relay server \(only if/.test(main));
  assert.ok(!/—|–/.test(FOLLOW_NOTE) && /about a minute, not at once/.test(FOLLOW_NOTE));

  // the kit: the control is called what the screen calls it, and the notes it makes are the dashboard's
  const kit = read('docs/FACULTY_KIT.md'), head = kit.split('\n').find((l) => l.startsWith('| Head |'));
  assert.ok(/\*\*Display and sound\*\*/.test(head) && !/\*\*Access\*\*/.test(kit));
  assert.ok(I.instructorParts(dashboard(fresh), {}).head.includes('data-act="settings">Display and sound<'));
  assert.ok(kit.includes('**Scheduled**') && !kit.includes('**Upcoming**') && kit.includes('Sends a shock to the students who are online when you press it') && kit.includes('Sends every online student back to their daily checkpoint'));
  assert.ok(!/connected/.test(kit.split('\n').filter((l) => /^\| (\||Manual black swan|Global engine)/.test(l)).join('\n')), 'the kit\'s dashboard table uses the dashboard\'s word, online');
  assert.ok(kit.includes('A founder with no graded shock shows 10.0 for adaptability') && kit.includes('counts a neutral 50, which is 10 of the 20 points'));
  assert.ok(/One box at the end holds their analysis/.test(kit) && !/Beside each prompt is a box/.test(kit));
  assert.ok(kit.includes(`${SWAPS.perDay} a day`) && kit.includes(`${FMV_BAND * 100}%`));
  assert.ok(!/\bprofile\b|all three|Zone \d/i.test(kit));
});

// ---------------------------------------------------------------------------------------------------------------------
test('D10: the figures\' hovers and labels are what the engine does: the index, the percentile, the pivots, the sliders, the herd and the algorithmic events', () => {
  // the index: net worth over the floor, times one plus the share of the days left (js/market.js `eei`); the floor in the hover is the room's
  const S = REAL(late), floor = S.difficulty.eeiFloor;
  assert.ok(Math.abs(late.eei() - late.netWorth() / floor * (1 + late.daysRemaining() / TOTAL_DAYS)) < 1e-9);
  const eeiTip = (x) => titles(D.debriefHTML(x)).find((t) => t.startsWith('Net worth divided by the'));
  assert.equal(eeiTip(S), `Net worth divided by the ${money(floor)} starting-capital floor, times 1 plus the share of the ${TOTAL_DAYS} days left.`);
  S.difficulty.eeiFloor = 5000; assert.ok(eeiTip(S).includes('$5,000'), 'an instructor who moves the floor moves the hover');
  // the percentile: the share of the others whose index is lower (the same rule as the gradebook's Economic column)
  const lb = [1, 2, 3, 4, 5].map((eei, i) => ({ eei, rank: 5 - i }));
  assert.equal(D.standing(lb, lb[2]).percentile, 2 / 4 * 100);
  assert.ok(titles(D.debriefHTML(REAL(late))).includes('The share of the other players whose efficiency index is lower than yours.'));
  const gb = instructorWith([['A', { nw: 500 }], ['B', { nw: 300 }], ['C', { nw: 100 }]], 100).gradebook();
  assert.deepEqual(gb.map((r) => r.econ), [100, 50, 0], 'the dashboard\'s Economic column is the same percentile');
  // who is in "of N players": a solo run has eleven simulated classmates (js/session.js `startGame`), a student in a room has none
  const solo = new Session(); solo.startGame({ perks: ['trades', 'pro'], specialty: 'ops', handle: 'Solo' });
  assert.equal(solo.synth.length, 11);
  assert.ok(D.debriefHTML(solo).includes('of 12 players, 11 simulated'));
  const stu = new Session(); stu.mode = 'student'; stu.startGame({ perks: ['trades', 'pro'], specialty: 'ops', handle: 'Stu' });
  assert.ok(D.debriefHTML(stu).includes('of 1 player</div>') && !/simulated/.test(visible(D.debriefHTML(stu))));
  // the hero says final only when the run is closed (js/engine.js `closedNetWorth`), and a manager is a manager
  assert.ok(D.debriefHTML(REAL(fresh)).includes('>Net worth now<'));
  const over = makeGame(['trades', 'pro'], 'ops', 3); over.advanceTo(2160); assert.ok(over.s.over);
  assert.ok(D.debriefHTML(REAL(over)).includes('>Final net worth<') && D.reflectionMD(REAL(over), '').includes('Final net worth:'));
  const crunch = makeGame(['connected', 'grad'], 'ops', 5); crunch.env.algo = false; crunch.advanceTo(24 * 50);
  assert.ok(D.debriefHTML(REAL(crunch)).includes('<dt>Managers</dt>') && !/Pipelines/.test(D.debriefHTML(REAL(crunch))));

  // what is a pivot: a pool sale, a loan repayment, a change of a manager's lane, a pause or a release; hiring, upgrading and a new allocation are not (js/engine.js `s.pivot`)
  const g = makeGame(['trades', 'pro'], 'ops', 3); g.env.algo = false; g.s.mil.m1 = true; g.s.cash = 3000; // (under the second milestone, whose audit locks hiring)
  for (const z of [2, 3, 4, 5]) g._openZone(z);
  g.advanceTo(g.s.hour + 1);
  const lanes = g.radar(5, 12).filter((x) => x.fit >= 0.3), one = lanes[0], two = lanes.find((x) => x.cls !== one.cls || x.seg !== one.seg);
  const moves = (what, f, by) => { const before = g.s.pivot; const r = f(); assert.ok(r?.ok !== false, `${what}: ${r?.msg}`); assert.equal(g.s.pivot - before, by, what); };
  let mgr; moves('hiring a manager', () => { const r = g.hirePipeline('broker', 5, { cls: one.cls, buyer: one.seg }); mgr = r.pipe; return r; }, 0);
  moves('a new allocation', () => g.configure(mgr.id, { alloc: 10 }), 0);
  moves('a new lane', () => g.configure(mgr.id, { cls: two.cls, buyer: two.seg }), 1);
  moves('pausing a manager', () => g.pausePipeline(mgr.id, true), 1);
  moves('resuming it', () => g.pausePipeline(mgr.id, false), 1);
  moves('releasing it', () => g.releasePipeline(mgr.id), 1);
  moves('drawing a loan', () => g.draw('micro', 100), 0);
  moves('repaying it', () => g.repay(g.s.loans[0].id, 10), 1);
  const crate = g._mk(g.s, 'bike', { zone: 1, basis: 1 }); g.s.assets.push(crate);
  moves('a sale to the liquidity pool', () => g.sellPool([crate.id]), 1);
  assert.ok(titles(D.debriefHTML(REAL(crunch))).includes('Pool sales, loan repayments, manager lane changes, pauses and releases, and counted swaps in the five days after.'), 'and the hover says exactly these, with the counted swap of D3');

  // the sliders: taxes and fees scale with friction; the kit's ranges are the sliders'; ghosts shape the market and are not rows; the algorithmic events come from the room code
  const f = makeGame([], 'ops', 3), tax = f.zoneTax(5), fee = f.instFee('pitch');
  f.env.difficulty.friction = 2; assert.ok(Math.abs(f.zoneTax(5) - 2 * tax) < 1e-12 && Math.abs(f.instFee('pitch') - 2 * fee) < 1e-12, 'friction scales the tax and the fee');
  const c1 = I.instructorParts(instructorWith([], 24 * 5), {}).c1, kit = read('docs/FACULTY_KIT.md');
  const range = (id) => { const m = new RegExp(`<input id="${id}" type="range" min="([\\d.]+)" max="([\\d.]+)"`).exec(c1); return [+m[1], +m[2]]; };
  assert.deepEqual(range('fr'), [0.5, 3]); assert.deepEqual(range('au'), [0.5, 3]); assert.deepEqual(range('gh'), [0, 80]); assert.deepEqual(range('dm'), [0, 24]);
  for (const t of ['**Transaction friction** (0.5x to 3x)', '**Compliance audit frequency** (0.5x to 3x)', '**Synthetic classmates filling the market** (0 to 80)', '**Demo students on this dashboard** (0 to 24)']) assert.ok(kit.includes(t), t);
  const T = instructorWith([], 24 * 20), cls = Object.keys(ASSETS).find((c) => (ASSETS[c].dem?.[5] ?? 0) > 0);
  T.setGhosts(0); const quiet = T.cohort.counts(24 * 20, 5, cls).total, rows = T.gradebook().length;
  T.setGhosts(60); assert.ok(T.cohort.counts(24 * 20, 5, cls).total > quiet, 'the herd is in the market');
  assert.equal(T.gradebook().length, rows, 'and not in the roster');
  // the algorithmic events are drawn from the room code and the day (js/engine.js `_algoEvent`): every student of a room has the same shocks (the same kind on the same class), whatever their seed and perks, the gradebook (js/session.js `shockStart`) knows each of them, and another room has others
  const shocks = (code, seed, perks) => { const x = new Game({ perks, seed, handle: 'S' + seed, pid: 'S-' + seed, worldSeed: code }); x.advanceTo(24 * 87); return x.s.events.filter((e) => e.id.startsWith('algo-')).map((e) => ({ id: e.id, kind: e.kind, name: e.name, start: e.start })); };
  const rooms = [];
  search: for (const a of 'ABCDEFGH') for (const b of 'ABCDEFGH') { const code = `R${a}${b}Z`, mine = shocks(code, 1, []); if (mine.length >= 2) rooms.push({ code, mine }); if (rooms.length === 2) break search; }
  assert.equal(rooms.length, 2, 'two rooms that have algorithmic shocks to compare');
  for (const { code, mine } of rooms) {
    assert.ok(mine.every((m) => { const d = +m.id.slice(5); return d >= 1 && d <= TOTAL_DAYS; }), `room ${code}: every shock falls inside the run`);
    assert.deepEqual(shocks(code, 7, ['trades', 'pro']), mine, `room ${code}: a student with another seed and other perks has the same shocks`);
    const grade = instructorWith([], 24 * 87); grade.worldSeed = code;
    for (const m of mine) assert.equal(grade.shockStart(m.id), m.start, `room ${code}: the gradebook knows ${m.id}`);
  }
  assert.notDeepEqual(rooms[0].mine, rooms[1].mine, 'another room has others');

  // the herd is not on the roster and still moves what a sale pays (js/engine.js `crowd`, `cmFor`): the same sale pays more with 80 simulated sellers than with none for some, less for others, so the hover and the kit do not call the herd outside the grade
  let up = 0, down = 0, pairs = 0;
  for (const [perks, spec, seed] of [[['native', 'heir'], 'growth', 11], [['trades', 'pro'], 'ops', 9]]) {
    const x = makeGame(perks, spec, seed), co = x.env.cohort; run(x, { days: 14 });
    for (const z of x.s.zones) for (const lead of x.s.leads[z]) for (const a of x.s.assets) {
      if (a.zone !== z) continue;
      const pay = {};
      for (const n of [0, 80]) { co.ghosts = n; co.refresh(); const q = x.quotePitch(a.id, lead.id, undefined, { blind: true }); pay[n] = q.ok && !q.rejected ? q.received : null; }
      if (pay[0] == null || pay[80] == null) continue;
      pairs++; if (pay[80] > 1.2 * pay[0]) up++; if (pay[80] < 0.8 * pay[0]) down++;
    }
  }
  assert.ok(pairs > 20 && up >= 1 && down >= 1, `of ${pairs} sales, ${up} pay over 20% more with 80 sellers than with none and ${down} pay over 20% less`);
  const herd = titles(c1).find((t) => t.startsWith('Simulated sellers that crowd niches')), tableRow = kit.split('\n').find((l) => l.includes('**Synthetic classmates filling the market**')), bullet = kit.split('\n').find((l) => l.startsWith('- **Demo students count'));
  assert.ok(herd && /never enter the percentile/.test(herd) && /change what sales pay/.test(herd) && /same in every section you compare/.test(herd));
  assert.ok(!/not the grade|do not affect the grade/i.test(herd + kit), 'neither the hover nor the kit says the herd is outside the grade');
  assert.ok(/never enters the percentile, but it changes what sales pay/.test(tableRow) && /never enter the percentile, but they change what sales pay/.test(bullet));
});

// ---------------------------------------------------------------------------------------------------------------------
/** The cells of the shock table's row for the credit crunch. */
const fedRow = (html) => { const m = /<tr><td>The Fed Taper and Credit Crunch<\/td>((?:<td class="mono[^"]*">[^<]*<\/td>)+)<\/tr>/.exec(html); assert.ok(m, 'the crunch has a row'); return [...m[1].matchAll(/<td class="mono[^"]*">([^<]*)<\/td>/g)].map((x) => x[1]); };
const dd = (html, dt) => new RegExp(`<dt[^>]*>${dt}</dt><dd>([^<]*)</dd>`).exec(html)?.[1];

test('D11: the five days after a shock are n/a until they are over, never 0 pivots', () => {
  const g = makeGame(['native', 'heir'], 'growth', 11); g.env.algo = false; run(g, { days: 47 }); // three days after the credit crunch: the menu opens the Debrief at any time
  const f = g.s.shockLog.find((x) => x.kind === 'fed');
  assert.ok(g.s.hour < f.start + 120 && f.nwAfter == null && f.pivots == null, 'the engine has measured neither the net worth nor the pivots yet (js/engine.js `_events`)');
  assert.ok(g.s.pivot - f.pivot0 > 0, 'though the founder has made pivots since the shock');
  const html = D.debriefHTML(REAL(g)), md = D.reflectionMD(REAL(g), '');
  assert.equal(dd(html, 'Net worth five days later'), 'n/a');
  assert.equal(dd(html, 'Pivots in the five days after'), 'n/a', 'an unmeasured count is not zero');
  const row = fedRow(html);
  assert.deepEqual([row[2], row[3], row[5]], ['n/a', 'n/a', 'n/a'], 'the table says the same: no net worth, no change, no count');
  assert.ok(md.includes('- Five days later: n/a, fewer than five days had passed since the shock.') && !/after 0 pivot action/.test(md), 'and so does the workbook');

  // a run that closes inside the five days (an exit settles after 48 hours) never measures them either
  const e = makeGame(['native', 'heir'], 'growth', 11); e.env.algo = false; run(e, { days: 46 });
  assert.ok(e.exit('trade').ok); for (let i = 0; i < 100 && !e.s.over; i++) e.advanceTo(e.s.hour + 1);
  const ef = e.s.shockLog.find((x) => x.kind === 'fed');
  assert.ok(e.s.over && e.s.hour < ef.start + 120 && ef.pivots == null);
  assert.equal(dd(D.debriefHTML(REAL(e)), 'Pivots in the five days after'), 'n/a');
  assert.ok(!/after 0 pivot action/.test(D.reflectionMD(REAL(e), '')));

  // and once the five days are over, the count is the engine's, whatever it is
  const done = makeGame(['native', 'heir'], 'growth', 11); done.env.algo = false; run(done, { days: 52 });
  const df = done.s.shockLog.find((x) => x.kind === 'fed');
  assert.ok(df.nwAfter != null && Number.isInteger(df.pivots));
  assert.equal(dd(D.debriefHTML(REAL(done)), 'Pivots in the five days after'), String(df.pivots));
  assert.ok(D.reflectionMD(REAL(done), '').includes(`after ${df.pivots} pivot action(s).`));
});

// ---------------------------------------------------------------------------------------------------------------------
test('D12: every hover of the Debrief and of the dashboard\'s controls is said once more in the page, where a keyboard, a touch screen, a screen reader and the paper can read it', () => {
  // a title is shown to a mouse and to nothing else: the words of each are also in a fold (the print opens the Debrief's), a line or a screen-reader span
  const text = (html) => unescape(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  const mk = (seed, pid) => { const g = new Game({ perks: [], seed, handle: pid, pid }); g.env.algo = false; return g; };
  const P = mk(1, 'AAA'), Q = mk(2, 'BBB'), pen = P._mk(P.s, 'pen', { zone: 1, basis: 1 }), scrap = Q._mk(Q.s, 'scrap', { zone: 1, basis: 1 });
  P.s.assets.push(pen); Q.s.assets.push(scrap);
  const off = P.createOffer({ to: 'BBB', giveIds: [pen.id], want: { assets: [Q.pub(scrap)], cash: 0 } }), acc = Q.acceptOffer(off.offer);
  assert.ok(off.ok && acc.ok && P.finalizeOffer(off.offer.id, acc.deliver, 'BBB').ok);
  const seen = new Set();
  for (const [name, game] of [['a day-60 run with shocks and niches', late], ['a run with a swap', Q], ['a fresh run', fresh]]) {
    const html = D.debriefHTML(REAL(game)), tips = titles(html), gloss = folds(html).find((f) => /^<summary class="small">What the figures mean<\/summary>/.test(f)) || '';
    assert.ok(tips.length >= 5, `${name}: the page has hovers`);
    assert.ok(html.includes('<details class="gap" data-print><summary class="small">What the figures mean</summary>'), `${name}: the fold is one the print opens`);
    for (const t of new Set(tips)) { seen.add(t); assert.equal(text(gloss).split(t).length - 1, 1, `${name}: "${t}" is in the fold, once`); }
  }
  assert.ok(seen.size >= 13, `the Debrief has ${seen.size} distinct hovers across these pages and every one is in a fold`);
  assert.ok(![...folds(D.debriefHTML(REAL(late)))].some((f) => /^<summary class="small">What the figures mean/.test(f) && /title=/.test(f)), 'a fold repeats the words and carries no hover of its own');

  // the dashboard's controls: one fold under them lists what each does; the three rewind buttons are one line there
  const parts = I.instructorParts(dashboard(late), {}), c1 = parts.c1;
  const rewinds = [...c1.matchAll(/data-act="rewind" data-d="(\d)" title="([^"]*)"/g)].map((m) => [+m[1], unescape(m[2])]);
  assert.equal(rewinds.length, 3);
  const controls = folds(c1).find((f) => /^<summary class="small" data-fid="fold-controls">What the controls do<\/summary>/.test(f)) || '';
  assert.ok(controls, 'the fold exists');
  for (const t of new Set(titles(c1))) {
    if (rewinds.some(([, r]) => r === t)) continue;
    assert.ok(text(controls).includes(t), `the dashboard's hover "${t}" is also in the fold`);
  }
  const days = rewinds.map(([d]) => d);
  assert.ok(text(controls).includes(`Sends every online student back ${days.slice(0, -1).join(', ')} or ${days.at(-1)} days to a daily checkpoint. A rewind reaches back ${I.CHECKPOINT_DAYS} days at most.`), 'the three rewinds are one line');
  assert.ok(I.instructorParts(dashboard(late), { open: { controls: true } }).c1.includes('<details class="gap" data-fold="controls" open>'), 'and the fold stays open once it is opened');
  assert.ok(read('docs/FACULTY_KIT.md').split('\n').some((l) => l.startsWith('| | **What the controls do** |')), 'the kit names the fold, as the screen does');
  // the sound choice's description is read by a screen reader through aria-describedby, which reads text and not a title
  const ls = parts.head.match(/<span class="tiny mute" id="ls-h" title="([^"]*)">([\s\S]*?)<\/span><\/fieldset>/);
  assert.ok(ls && ls[2].includes(`<span class="sr"> ${ls[1]}</span>`) && /aria-describedby="ls-h"/.test(parts.head), 'the description of the sound choice has a screen-reader twin');
  for (const x of I.LINK_SOUNDS) assert.ok(unescape(I.instructorParts(dashboard(late), { linkSound: x.id }).head).includes(unescape(x.more)), `${x.id}: its full description is in the page`);

  // a hovered label or figure wears a dotted underline and a help cursor where a pointer exists (css/ui-draft.css), and not on touch
  const css = read('css/ui-draft.css');
  assert.ok(/@media \(hover: hover\) \{ \.sc-stat\[title\] \.sc-k, th\[title\], dt\[title\], label\[title\] \{ cursor: help; text-decoration: underline dotted;/.test(css), 'the cue is there for a pointer');
});
