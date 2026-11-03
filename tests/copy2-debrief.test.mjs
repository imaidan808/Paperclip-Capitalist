// Copy pass, part 2, package P2: the Debrief, the instructor dashboard, the title's classroom panels and the faculty kit. Each test holds a claim these screens make against the engine
// (the numbers are recomputed from the engine or the config, never copied from the text), and fails on the text it replaced:
//   D1  the Prompt C result column is the ledger's own signed number (a gain is not "value lost"; a manager's cycle is profit), the five most crowded niches are in front and the rest fold
//   D2  a niche's saturation is the one at its latest sale ("last seen" was its first); the creativity figures (herd 0.55, pioneer 2.4, the score's scale, the formula) are the engine's
//   D3  the Prompt A gain column is the same figure at both ends of a swap (the old "you / them" pair was proposer / acceptor, so it was reversed for half the rows)
//   D4  Prompt B, the chart and the workbook name the day the credit crunch really hit (an instructor can deploy it on any day); what the crunch changes is the engine's, and it moves no asset price
//   D5  the adaptability column shows what the subtotal counts, in the table and in the CSV; the grade notes (25, 10, 10, a neutral 50) are the gradebook's own
//   D6  the schedule line is the list of shocks the students' games really hold, after a deploy with or without Replace
//   D7  what the rewind, the stalled list and the room line say is what the engine and the relay do
//   D8  the voice: what these screens show at first has no question, no filler and no dash, is a fraction of what it was, and what was folded is folded
//   D9  the title's classroom panels and the kit: the names the screens use, the numbers the engine has
//   D10 the figures' hovers and labels (efficiency index, percentile, pivots, the band of a swap, the sliders) are what the engine does
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
const { creativityBand, creativity, fmtMoney: money } = await import('../js/market.js');
const { CODEX } = await import('../js/meta/codex.js');
const { hash01 } = await import('../js/rng.js');
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
const late = (() => { const g = makeGame(['native', 'heir'], 'growth', 11); g.onEvent = (e) => { if (e.type === 'cycle') cycleNets.push(e.net); }; run(g, { days: 60 }); return g; })();
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
  assert.ok(md.includes('at the latest sale 7 of 10 recent pitches went to the same buyer (saturation 70%)'));
  assert.ok(!/last seen/.test(md) && !/last seen/.test(read('js/ui/debrief.js')));

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
  assert.ok(D.reflectionMD(REAL(B), '').includes(`Gain at fair value ${money(rowB.amt, { plus: true })} (variance ${(rowB.variance * 100).toFixed(1)}%)`));
  // a swap with the Practice Partner supplies data and earns nothing: the empty line says it on hover (js/engine.js `_swapDone`)
  const none = D.debriefHTML(REAL(fresh));
  assert.ok(none.includes('No peer swaps completed. A swap with a classmate or the Practice Partner supplies the data for this prompt.'));
  assert.ok(titles(none).includes('Swaps with classmates also count toward Peer Market Engagement (10% of the grade). The Practice Partner earns no credit.'));
  const npc = mk(3, 'NPC');
  assert.equal(npc._swapDone('PARTNER', 10, 0.1, true), false); assert.equal(npc.s.p2p, 0, 'and it pays the grade nothing');
  assert.equal(npc.s.pivot, 0, 'nor is it a pivot');
  assert.ok(A.s.p2p === 1 && B.s.p2p === 1 && A.s.pivot === 1 && B.s.pivot === 1, 'a counted swap is a swap and a pivot, at both ends');
  // the band in the variance hover is the guardrail: 39% apart passes, 41% does not (js/engine.js `checkOffer`)
  const at = (cash) => A.checkOffer({ from: 'AAA', give: { assets: [A.pub(pen)], cash: 0 }, want: { assets: [], cash } }, 'offerer');
  assert.equal(at(worth.pen * (1 + FMV_BAND - 0.01)).ok, true); assert.equal(at(worth.pen * (1 + FMV_BAND + 0.01)).ok, false);
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
  assert.ok(kit.includes('If debt exceeded net worth, explain what you did to prevent margin compression'));
  // the other two rows of the kit's table are the engine's too
  const tik = EVENTS.tiktok.phases, tr = kit.split('\n').find((l) => l.startsWith('| The TikTok'));
  assert.ok(tr.includes(`For ${tik[0].to} hours demand for trend goods spikes +${(tik[0].eff.demand.mult - 1) * 100}%`) && tr.includes(`manager cycles run ${Math.round((tik[0].eff.speed.mult - 1) * 100)}% faster`));
  assert.ok(tr.includes(`halves the value of trend inventory for ${tik[1].to - tik[1].from} hours`) && tik[1].eff.price.mult === 0.5);
  const tar = EVENTS.tariff.phases[0], tt = kit.split('\n').find((l) => l.startsWith('| The Cross-Border'));
  assert.ok(tt.includes(`For ${(tar.to - tar.from) / 24} days`) && tt.includes(`slow by ${tar.eff.intlSlow / 24} virtual days`) && tt.includes(`cost ${Math.round((tar.eff.repair - 1) * 100)}% more`));
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
    assert.ok(Math.abs(num(c[9]) + num(c[10]) + num(c[11]) - num(c[12])) < 0.15, 'its components add up to its subtotal');
  }
  assert.ok(grade.includes('<p class="tiny mute">* No shock graded yet: counted as a neutral 50 of 100.</p>'));
  assert.ok(!/>n\/a</.test(grade) && !/<span class="mute">n\/a<\/span>/.test(read('js/ui/instructor.js')), 'no "n/a" where a number is counted');
  assert.ok(csv[0].includes('"adaptability_points_of_20"'), 'the column keeps its name');
  // a shock graded for three founders: a real figure, no star, no note
  const log = (after, pivots) => [{ id: `fed@${(EVENTS.fed.day - 1) * 24}`, nw: 1000, nwAfter: after, pivots }];
  const T = instructorWith([['A', { nw: 2000, shockLog: log(1200, 1) }], ['B', { nw: 2000, shockLog: log(1200, 0) }], ['C', { nw: 2000, shockLog: log(1200, 0) }]], 24 * 60);
  const tg = T.gradebook(), gradeT = I.instructorParts(T, {}).grade;
  assert.ok(tg.every((r) => r.adapt != null));
  assert.ok(!gradeT.includes('*</span>') && !gradeT.includes('No shock graded yet'));
  assert.equal(cellsOf(gradeT, 'A')[6], (tg.find((r) => r.pid === 'A').adapt * 0.2).toFixed(1));
  // the notes in the fold: 10 of 100 for a pivot, 25 per swap, 10 per flagged attempt, the weights
  assert.ok(Math.abs(tg.find((r) => r.pid === 'A').adapt - tg.find((r) => r.pid === 'B').adapt - 10) < 1e-9, 'a pivot is worth 10 of the 100');
  const one = instructorWith([['A', { nw: 100, p2p: 1, trades: 1 }], ['B', { nw: 90, p2p: 2, trades: 2 }]], 24 * 5);
  one.flags = [{ from: 'B', to: 'A', variance: 0.9, hour: 10 }];
  const engage = Object.fromEntries(one.gradebook().map((r) => [r.pid, r.engage]));
  assert.equal(engage.A, 25, 'one swap is 25 of 100'); assert.equal(engage.B, 2 * 25 - 10, 'and a flagged attempt takes 10');
  const fold = folds(I.instructorParts(S, {}).grade).join(' ');
  for (const t of ['Economic (30)', 'Adaptability (20)', 'Peer market (10)', 'plus 10 of 100 for a pivot', 'a neutral 50', '25 of 100 for each completed swap', 'less 10 for each flagged attempt', 'The 40 points for reflection', 'percentile of the efficiency index among everyone on the roster, demo students included']) assert.ok(fold.includes(t), t);
  assert.ok(gb.every((r) => r.autoMax === 60) && grade.includes('Auto subtotal / 60'), 'the pre-filled points are 60 of 100');
  const demo = new Session(); demo.mode = 'instructor'; demo.roomInfo = { code: 'D', relay: '' }; demo.setDemo(6);
  assert.equal(demo.gradebook().length, 6, 'the demo students are rows of the roster, so they are in the percentile');
  assert.ok(titles(I.instructorParts(S, {}).c1).includes('Made-up students for a demo. They count in everyone\'s percentile, so leave this at 0 when you grade.'));
  const compliance = read('docs/COMPLIANCE.md').split('\n').find((l) => /LTI 1\.3 Advantage/.test(l));
  assert.ok(fold.includes(`href="${I.KIT_URL}"`) && fold.includes('Grade passback (LTI 1.3) is not built') && /Not implemented/.test(compliance), 'and the passback line is COMPLIANCE.md\'s');
});

// ---------------------------------------------------------------------------------------------------------------------
test('D6: the schedule line is the list of shocks a student\'s game holds, with and without Replace', () => {
  const S = instructorWith([], 24 * 20);
  const atHour = 24 * 20 + 1, dayOf = (h) => Math.floor(h / 24) + 1;
  S.clock.set({ hour: atHour });
  const engine = (sends) => {                                  // a student's game at the class's hour, given what the instructor sent (js/engine.js `injectEvent`)
    const g = makeGame([], 'ops', 3); g.env.algo = false; g.advanceTo(24 * 20);
    for (const m of sends) g.injectEvent(m.kind, m.atHour, { id: m.id, replace: m.replace, injected: true });
    g.advanceTo(atHour);
    return g.s.events.filter((e) => !e.started).map((e) => `${e.kind}@${e.start}`).sort();
  };
  const line = (U) => I.instructorParts(S, U).c1.match(/<p class="tiny mute" title="[^"]*">((?:Upcoming|No shock)[^<]*)<\/p>/)[1];
  const mine = (U) => I.shockSchedule(S, S.clock.now(), U.sent).map((e) => `${e.kind}@${e.start}`).sort();
  assert.deepEqual(mine({ sent: [] }), engine([]), 'before anything is sent: what the games hold');
  assert.equal(line({ sent: [] }), `Upcoming: Credit Crunch day ${EVENTS.fed.day}, Tariff Lock day ${EVENTS.tariff.day}.`, 'the TikTok surge of day 15 is behind the class: it is not upcoming');
  const U = { sent: [] };
  for (const [kind, when, replace] of [['fed', 0, true], ['tiktok', 72, false], ['tariff', 24, true]]) {
    const r = S.inject(kind, { when, replace });
    assert.ok(r.ok && S.injected.get(r.id) === r.atHour, 'the session records what it sent');
    U.sent.push({ id: r.id, kind, at: r.atHour, from: r.atHour - when, replace });
    assert.deepEqual(mine(U), engine(S.sent.filter((m) => m.t === 'inject')), `after ${kind} in ${when} hours${replace ? ', replacing' : ''}: the same shocks as a student's game`);
  }
  assert.equal(line(U), `Upcoming: Tariff Lock day ${dayOf(24 * 20 + 24)}, TikTok Surge day ${dayOf(24 * 20 + 72)}.`, 'the credit crunch was sent for now (it is not to come), the tariff replaced the scheduled one, the surge was added');
  // nothing left to come
  assert.equal(I.shockSchedule(S, 24 * 89, []).length, 0);
  assert.ok(/<p class="tiny mute"[^>]*>No shock is scheduled\.<\/p>/.test(I.instructorParts(instructorWith([], 24 * 80), {}).c1));
  // a shock the record does not hold (the dashboard was reloaded): listed, and the scheduled one of its kind says it may be gone
  const R = instructorWith([], 24 * 20); R.injected.set('inj-fed-480-1234', 480);
  assert.ok(I.instructorParts(R, {}).c1.includes('Upcoming: Credit Crunch day 45 (if not replaced), Tariff Lock day 75.'));
  // the record survives a reload, and belongs to its room
  S.kv.set('shocksent', { code: 'GRADE', list: U.sent });
  assert.deepEqual(I.loadSent(S).map((x) => x.id), U.sent.map((x) => x.id)); store.clear();
  assert.deepEqual(I.loadSent(S), []);
  // what the hover says about warnings is the engine's
  const g = makeGame([], 'ops', 3), warn = (level) => { g.s.skills.fintech = level; return g.warnLead(); };
  assert.deepEqual([warn(1), warn(3), warn(5)], [WARN_LEAD.novice, WARN_LEAD.mid, WARN_LEAD.adv]);
  assert.ok(titles(I.instructorParts(S, {}).c1).includes(`Students with higher Capital Sourcing get earlier warnings: ${warn(1)} hours at first, ${warn(3)} hours at level 3, ${warn(5) / 24} days at level 5.`));
  assert.ok(!/Scheduled: TikTok Surge day 15/.test(read('js/ui/instructor.js')), 'the fixed line is gone');
});

// ---------------------------------------------------------------------------------------------------------------------
test('D7: what the rewind, the stalled list and the room line say is what the engine and the relay do', () => {
  // a game keeps ten days of daily checkpoints, so a rewind reaches back ten days at most
  const g = makeGame([], 'ops', 3); g.advanceTo(24 * 25);
  assert.equal(Math.floor(g.s.hour / 24) - Math.min(...g.ckpt.keys()), I.CHECKPOINT_DAYS, 'ten days back, from the day the game is on');
  const S = instructorWith([], 24 * 30);
  const rewinds = [...I.instructorParts(S, {}).c1.matchAll(/<button[^>]*data-act="rewind" data-d="(\d)" title="([^"]*)"[^>]*>([^<]*)<\/button>/g)];
  assert.deepEqual(rewinds.map((m) => [m[1], m[3]]), [['1', 'Rewind 1 day'], ['3', '3 days'], ['7', '7 days']]);
  for (const m of rewinds) assert.ok(m[2].includes(`A rewind reaches back ${I.CHECKPOINT_DAYS} days at most.`) && m[2].endsWith('A student who is offline is not rewound.'), m[2]);
  assert.ok(rewinds.every((m) => +m[1] <= I.CHECKPOINT_DAYS), 'every button is inside what a game keeps');
  // a rewind goes to the room as one live message (js/session.js `rewind`) and the relay replays only the last snapshots and the clock (server/relay.mjs): a student who is away is not rewound
  const before = S.sent.length; S.rewind(3);
  assert.deepEqual(S.sent.slice(before).map((m) => m.t), ['rewind', 'clock']);
  const relay = read('server/relay.mjs');
  assert.ok(/snaps:\s*new Map\(\)[^}]*clock:\s*null/.test(relay) && /room\.clock = \{/.test(relay) && !/room\.(rewind|inject)\b/.test(relay), 'the relay keeps snapshots and the clock for a late joiner, nothing else');
  const kit = read('docs/FACULTY_KIT.md');
  assert.ok(!/catch up deterministically/.test(kit + read('js/ui/instructor.js')) && kit.includes('A student who is offline when you rewind is not rewound'));
  assert.ok(I.instructorParts(S, {}).c1.includes('title="Reaches the students who are connected now."'));

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
  assert.ok(parts.head.includes('<span title="Students join from other tabs of this browser with Copy student link. Students on other devices need a relay.">this browser only</span>'));
  assert.ok(!visible(parts.head).includes('students join from other tabs'));
});

// ---------------------------------------------------------------------------------------------------------------------
const VOICE = /\b(simply|basically|essentially|literally|incredibly|extremely|truly|obviously|of course|it is important to|keep in mind|please note|not just|good luck|exciting|amazing|fantastic|wonderful|delve|welcome|free)\b|\blet[’']s\b|!|—|–|\?/i;

test('D8: what the debrief and the dashboard show at first is a fraction of what it was, speaks plainly, and keeps the rest one fold or hover away', () => {
  // the words at first (a fresh run, and a bot's day 60). Before this pass the debrief read 449 and 1,194 words and the dashboard 632 and 643
  const was = { debrief: [449, 1194], dashboard: [632, 643] };
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
  assert.ok(!/Rewind restores|catch up|Scheduled:/.test(Object.values(dash).join('')));
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
  for (const t of ['Rewind sent to all students.', 'Event deployed to the cohort.', 'Student link copied, with quiet sound.']) assert.ok(i.includes(t), t);
});

// ---------------------------------------------------------------------------------------------------------------------
test('D9: the title\'s classroom panels say less, and the kit names what the screens name', () => {
  const main = read('js/main.js'), a = main.indexOf('<div class="choices">'), b = main.indexOf('<p class="tiny mute" id="build-note"');
  const h = main.slice(a, b).replace(/\$\{saved[^}]*\}/g, '').replace(/\$\{instr \?[^]*?\}\n/g, '\n').replace(/\$\{instrKey \?[^]*?\}\n/g, '\n').replace(/\$\{[^}]*\}/g, 'X');
  const text = visible(h.replace(/<input[^>]*>/g, ' '));
  assert.ok(words(text) <= 80, `the Join, Instructor and Accessible panels read ${words(text)} words (99 before this pass)`);
  assert.ok(!VOICE.test(text), text);
  for (const t of ['Join a classroom', 'Room code from your instructor', 'Create a room', 'Resume as instructor: take back a room', 'Accessible by design', 'Display and sound settings']) assert.ok(text.includes(t), t);
  assert.ok(main.includes('<label for="ir" title="Without a relay, students join from other tabs of this browser, each tab its own founder.">Relay URL (needed for other devices)</label>'));
  assert.ok(!/Keyboard-only play, screen-reader announcements/.test(main) && !/Relay server \(only if/.test(main));
  assert.ok(!/—|–/.test(FOLLOW_NOTE) && /about a minute, not at once/.test(FOLLOW_NOTE));

  // the kit: the control is called what the screen calls it, and the notes it makes are the dashboard's
  const kit = read('docs/FACULTY_KIT.md'), head = kit.split('\n').find((l) => l.startsWith('| Head |'));
  assert.ok(/\*\*Display and sound\*\*/.test(head) && !/\*\*Access\*\*/.test(kit));
  assert.ok(I.instructorParts(dashboard(fresh), {}).head.includes('data-act="settings">Display and sound<'));
  assert.ok(kit.includes('**Upcoming**') && kit.includes('Sends a shock to the students who are connected when you press it'));
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
  // the algorithmic events are drawn from the room code and the day (js/engine.js `_algoEvent`): the days the rule picks are the days the game has them, and another code picks others
  const picked = (code) => { const out = []; for (let d = 4; d <= 86; d++) if (![15, 45, 75].some((x) => Math.abs(x - d) < 3) && hash01(code + 'algo' + d) <= 0.14) out.push('algo-' + d); return out; };
  const had = (code) => { const x = new Game({ perks: [], seed: 1, handle: 'T', pid: 'T-1', worldSeed: code }); x.advanceTo(24 * 87); return x.s.events.filter((e) => e.id.startsWith('algo-')).map((e) => e.id); };
  const codes = []; for (const a of 'ABCDEFGH') for (const b of 'ABCDEFGH') if (picked(`R${a}${b}Z`).length >= 2 && codes.length < 2) codes.push(`R${a}${b}Z`);
  assert.equal(codes.length, 2);
  assert.deepEqual(had(codes[0]), picked(codes[0])); assert.deepEqual(had(codes[1]), picked(codes[1]));
  assert.notDeepEqual(picked(codes[0]), picked(codes[1]), 'the same room code gives the same events, another room others');
});
