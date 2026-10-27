// The screens around the game: the Background draft, the debrief and the instructor dashboard, plus the router's wiring.
// Everything here runs in Node: the HTML builders are pure, so no browser is needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PERKS, PERK_IDS, SKILLS, ZONE_COUNT } from '../js/config.js';
import { PERK_PAIRS } from '../js/data/perks.js';
import { Session } from '../js/session.js';
import { makeSynth } from '../js/cohort.js';
import { draftInit, draftReduce, draftChoice, draftHTML, cardHTML, trayHTML, specHTML, actionsHTML, statusText, summaryOf, traitScores, suggestPair, noSpecialty, MAX_PICKS } from '../js/ui/draft.js';
import { debriefHTML, reflectionMD, skillStats, standing, ordinal, buildCosts } from '../js/ui/debrief.js';
import { instructorParts, gradebookCSV, distribution, draftCounts, busiest, heatHTML } from '../js/ui/instructor.js';
import { makeGame, run } from './bot.mjs';
import { checkHTML } from './helpers/ctx.mjs';

const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const STALE = /Bootstrapper|Mid-Tier|Venture-Backed|Zone 3|profile|Level 0|Zero-Dollar Hustle/i;
const BAD = /undefined|NaN|\[object Object\]|Infinity/;
const freeze = (o) => { for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v); return Object.freeze(o); };
const apply = (st, ...actions) => actions.reduce((s, a) => draftReduce(s, a), st);

// ------------------------------------------------------------------ the draft: the reducer
test('the draft starts empty and a Background can be added and removed', () => {
  let st = draftInit();
  assert.deepEqual(st.picks, []);
  st = apply(st, { type: 'toggle', id: 'trades' });
  assert.deepEqual(st.picks, ['trades']);
  st = apply(st, { type: 'toggle', id: 'trades' });
  assert.deepEqual(st.picks, []);
});

test('the limit of two is enforced, with a reason, and the reducer never mutates its input', () => {
  const st = freeze(draftInit());                               // frozen: any mutation throws
  const two = apply(st, { type: 'toggle', id: 'connected' }, { type: 'toggle', id: 'veteran' });
  assert.deepEqual(two.picks, ['connected', 'veteran']);
  const three = draftReduce(freeze(two), { type: 'toggle', id: 'pro' });
  assert.deepEqual(three.picks, ['connected', 'veteran'], 'a third pick changes nothing');
  assert.match(three.notice, /two Backgrounds/i);
  assert.match(three.notice, /Well-Connected/);
  // removing one frees a slot
  const swap = apply(three, { type: 'toggle', id: 'connected' }, { type: 'toggle', id: 'pro' });
  assert.deepEqual(swap.picks, ['veteran', 'pro']);
  assert.equal(swap.notice, '');
  for (const s of [two, three, swap]) assert.ok(s.picks.length <= MAX_PICKS);
});

test('ids that are not Backgrounds are ignored (including inherited property names)', () => {
  for (const id of ['constructor', '__proto__', 'toString', 'nope', '', null, undefined, 7]) {
    const st = draftReduce(draftInit(), { type: 'toggle', id });
    assert.deepEqual(st.picks, [], String(id));
  }
  assert.deepEqual(draftInit({ picks: ['trades', 'trades', 'nope', 'pro', 'heir'] }).picks, ['trades', 'pro'], 'a seeded state is cleaned and capped');
  assert.deepEqual(draftReduce(draftInit(), { type: 'set', picks: ['constructor', 'grad', 'grad', 'roots', 'pro'] }).picks, ['grad', 'roots']);
});

test('drop, clear, specialty and alias actions', () => {
  let st = apply(draftInit(), { type: 'toggle', id: 'grad' }, { type: 'toggle', id: 'roots' });
  st = apply(st, { type: 'drop', id: 'grad' });
  assert.deepEqual(st.picks, ['roots']);
  st = apply(st, { type: 'clear' });
  assert.deepEqual(st.picks, []);
  assert.equal(apply(st, { type: 'specialty', id: 'growth' }).specialty, 'growth');
  assert.equal(apply(st, { type: 'specialty', id: 'constructor' }).specialty, 'ops', 'only the three skills');
  assert.equal(apply(st, { type: 'handle', value: 'x'.repeat(50) }).handle.length, 20);
  assert.equal(apply(st, { type: 'bogus' }), st, 'an unknown action returns the same state');
  assert.match(apply(apply(st, { type: 'toggle', id: 'grad' }), { type: 'submit' }).notice, /Pick 1 more Background/);
});

test('Begin hands over perks, specialty and a trimmed alias, and only with two Backgrounds', () => {
  let st = draftInit({ handle: '  PennyPincher  ', specialty: 'fintech' });
  assert.equal(draftChoice(st).ok, false);
  st = apply(st, { type: 'toggle', id: 'trades' }, { type: 'toggle', id: 'native' });
  const c = draftChoice(st);
  assert.deepEqual({ ok: c.ok, perks: c.perks, specialty: c.specialty, handle: c.handle }, { ok: true, perks: ['trades', 'native'], specialty: 'fintech', handle: 'PennyPincher' });
});

// ------------------------------------------------------------------ the draft: the Legacy Heir has no specialty
test('Legacy Heir disables the specialty with an explanation', () => {
  const plain = apply(draftInit(), { type: 'toggle', id: 'trades' }, { type: 'toggle', id: 'pro' });
  assert.equal(noSpecialty(plain.picks), false);
  assert.ok(!/<fieldset[^>]* disabled/.test(specHTML(plain)), 'enabled without the heir');
  assert.ok(!/ disabled>/.test(specHTML(plain)));

  const heir = apply(draftInit(), { type: 'toggle', id: 'heir' }, { type: 'toggle', id: 'pro' });
  assert.equal(noSpecialty(heir.picks), true);
  const html = specHTML(heir);
  assert.match(html, /<fieldset class="dr-spec" disabled/);
  assert.equal((html.match(/type="radio"/g) || []).length, Object.keys(SKILLS).length);
  assert.equal((html.match(/type="radio"[^>]* disabled/g) || []).length, 3, 'every radio is disabled');
  assert.match(html, /Legacy Heir has no specialty/);
  assert.match(html, /aria-describedby="dr-spec-why"/);
  assert.ok(html.includes('id="dr-spec-why"'), 'the explanation the fieldset points at exists');
  assert.ok(!/ checked/.test(html), 'nothing looks chosen while the specialty is off');
  assert.equal(draftChoice(heir).specialty, undefined);
  // a single heir already turns it off, and taking it out turns it back on
  assert.equal(noSpecialty(['heir']), true);
  assert.equal(noSpecialty(apply(heir, { type: 'drop', id: 'heir' }).picks), false);
});

// ------------------------------------------------------------------ the draft: the HTML
test('every Background appears, each with a labelled checkbox, a strength and a cost', () => {
  const html = draftHTML(draftInit());
  assert.equal((html.match(/type="checkbox"/g) || []).length, PERK_IDS.length);
  for (const id of PERK_IDS) {
    const p = PERKS[id], card = cardHTML(id, draftInit());
    assert.ok(html.includes(`value="${id}"`), `${id} has a control`);
    assert.ok(html.includes(p.name.replace(/&/g, '&amp;')), `${id}: name`);
    assert.ok(card.includes(`for="dr-in-${id}"`) && card.includes(`id="dr-in-${id}"`), `${id}: label for the checkbox`);
    assert.ok(card.includes(`aria-labelledby="dr-nm-${id}"`) && card.includes(`id="dr-nm-${id}"`), `${id}: accessible name exists`);
    assert.ok(card.includes(`aria-describedby="dr-ds-${id}"`) && card.includes(`id="dr-ds-${id}"`), `${id}: description exists`);
    assert.ok(card.includes('<em class="dr-basis">'), `${id}: the real-world basis is one italic line`);
    assert.ok(card.includes('dr-plus') && card.includes('dr-minus'), `${id}: strength and cost lines`);
    assert.ok(card.includes('Strength: ') && card.includes('Cost: '), `${id}: the lines are named for screen readers, not only coloured`);
    assert.ok(card.includes(p.icon), `${id}: icon`);
  }
});

test('the draft HTML is clean: no undefined, no duplicate ids, every control is named, every fieldset has a legend', () => {
  const states = [draftInit(), apply(draftInit(), { type: 'toggle', id: 'heir' }), apply(draftInit({ room: { code: 'AB<C' }, handle: '"><img src=x onerror=1>' }), { type: 'reroll' }),
    apply(draftInit(), { type: 'toggle', id: 'second' }, { type: 'toggle', id: 'creator' }, { type: 'toggle', id: 'pro' }, { type: 'submit' })];
  for (const st of states) {
    const html = draftHTML(st);
    assert.deepEqual(checkHTML(html, 'draft'), []);
    assert.ok(!BAD.test(html), 'no undefined/NaN');
    assert.ok(!STALE.test(html), 'no stale v1 terms');
    assert.ok(!/<img src=x/.test(html) && !html.includes('AB<C'), 'user text is escaped');
    const fieldsets = html.match(/<fieldset/g) || [], legends = html.match(/<legend/g) || [];
    assert.equal(fieldsets.length, legends.length, 'every fieldset has a legend');
    // every input/select/textarea is named by a label[for], a wrapping label, aria-label or aria-labelledby
    for (const m of html.matchAll(/<input\b([^>]*)>/g)) {
      const id = /\bid="([^"]+)"/.exec(m[1])?.[1];
      const named = /aria-label(ledby)?=/.test(m[1]) || (id && new RegExp(`<label[^>]* for="${id}"`).test(html)) || (/type="radio"/.test(m[1]));   // radios sit inside their label card
      assert.ok(named, `unnamed control: ${m[0].slice(0, 90)}`);
    }
    for (const m of html.matchAll(/<label\b([^>]*)>/g)) {
      const f = /\bfor="([^"]+)"/.exec(m[1])?.[1];
      if (f) assert.ok(html.includes(`id="${f}"`), `label for ${f} points at nothing`);
    }
    for (const m of html.matchAll(/aria-(?:labelledby|describedby)="([^"]+)"/g)) for (const ref of m[1].split(/\s+/)) assert.ok(html.includes(`id="${ref}"`), `aria reference ${ref} points at nothing`);
  }
});

test('the draft states the one rule up front and keeps the build visible', () => {
  const html = draftHTML(draftInit());
  assert.match(html, /one paperclip and \$0/);
  assert.match(html, /Your build/);
  assert.match(html, /Reroll suggestion/);
  assert.match(html, /never your real name/);
  assert.match(html, /id="handle"[^>]*maxlength="20"/);
  assert.match(html, /<h1 id="dr-h" tabindex="-1">/);
  assert.match(html, /<button class="btn big" type="submit" id="dr-begin"/);
  assert.ok(html.includes('Pick two Backgrounds'));
  assert.ok(draftHTML(draftInit({ room: { code: 'QX7' } })).includes('Joining room <b class="mono">QX7</b>'));
});

test('the tray shows both chosen cards and the build summary; Begin says what is missing', () => {
  const one = apply(draftInit(), { type: 'toggle', id: 'veteran' });
  const t1 = trayHTML(one);
  assert.match(t1, /Veteran/);
  assert.match(t1, /Open slot/);
  assert.match(actionsHTML(one), /aria-disabled="true"/);
  assert.match(actionsHTML(one), /Veteran chosen\. Pick 1 more Background to begin/);
  const two = apply(one, { type: 'toggle', id: 'creator' });
  const t2 = trayHTML(two);
  assert.ok(t2.includes('Veteran') && t2.includes('Creator'));
  assert.ok(!t2.includes('Open slot'));
  assert.match(t2, /Strong on .*weak on /);
  assert.match(actionsHTML(two), /aria-disabled="false"/);
  assert.match(actionsHTML(two), /Ready: .*Veteran.* \+ .*Creator.*\. You start with one paperclip and \$0\./);
  assert.match(actionsHTML(draftInit()), /Pick 2 more Backgrounds to begin/);
  for (const st of [draftInit(), one, two]) assert.ok(!BAD.test(trayHTML(st) + actionsHTML(st)));
});

test('the announcement names the count, the build and the summary', () => {
  assert.match(statusText(draftInit()), /0 of 2 Backgrounds chosen/);
  const one = apply(draftInit(), { type: 'toggle', id: 'grad' });
  assert.match(statusText(one), /1 of 2 Backgrounds chosen: Business-School Grad\. Pick one more\./);
  const full = apply(one, { type: 'toggle', id: 'roots' }, { type: 'toggle', id: 'pro' });
  assert.match(statusText(full), /^You can hold two Backgrounds/);
  assert.match(statusText(full), /Your build is complete: Business-School Grad and Small-Town Roots\./);
  assert.ok(!BAD.test(statusText(full)));
});

// ------------------------------------------------------------------ the summary is derived from the mods
test('the summary is a real sentence for every Background and every one of the 66 pairs', () => {
  for (const id of PERK_IDS) {
    const s = summaryOf([id]);
    assert.ok(!BAD.test(s.text), `${id}: ${s.text}`);
    assert.ok(s.strong.length >= 1, `${id} has a strength it reads as`);
    assert.ok(s.weak.length >= 1, `${id} has a cost it reads as`);
  }
  assert.equal(PERK_PAIRS.length, 66);
  for (const p of PERK_PAIRS) {
    const s = summaryOf(p);
    assert.ok(!BAD.test(s.text), `${p}: ${s.text}`);
    assert.match(s.text, /^(Strong on [a-z, ]+(, weak on [a-z, ]+|, with no clear weakness)\.|No standout strength, weak on [a-z, ]+\.|An even build: no standout strength and no clear weakness\.)$/, `${p}: ${s.text}`);
    for (const t of traitScores(p)) assert.ok(Number.isFinite(t.score), `${p} ${t.id}`);
  }
  assert.match(summaryOf([]).text, /Pick two Backgrounds/);
  assert.deepEqual(summaryOf(['nope', 'constructor']).strong, [], 'unknown ids read as nothing');
});

test('the summary follows the mods: a trade-heavy pair is strong on stock costs, a creator is weak on steady demand', () => {
  assert.ok(summaryOf(['trades', 'pro']).strong.includes('stock costs'));
  assert.ok(summaryOf(['creator']).weak.includes('steady demand'));
  assert.ok(summaryOf(['heir']).weak.includes('learning speed'));
  assert.ok(summaryOf(['veteran']).strong.includes('risk cover'));
  assert.ok(summaryOf(['second']).weak.includes('bank credit'));
  // the same trade is strong alone and the weakness is netted when the partner covers it
  assert.ok(summaryOf(['trades']).weak.includes('selling prices'));
  assert.ok(!summaryOf(['trades', 'creator']).weak.includes('selling prices'));
});

// ------------------------------------------------------------------ the suggestion
test('Reroll suggestion: a balanced pair from the alias hash, never Math.random', () => {
  const real = Math.random;
  Math.random = () => { throw new Error('Math.random must not be used'); };
  try {
    const a = suggestPair('PennyPincher', 0), b = suggestPair('PennyPincher', 0);
    assert.deepEqual(a, b, 'same alias, same count, same pair');
    assert.equal(a.length, 2);
    assert.notEqual(a[0], a[1]);
    for (const id of a) assert.ok(PERKS[id]);
    // walking the list gives different pairs, never the one already on the table
    const seen = new Set();
    for (let n = 0; n < 20; n++) { const p = suggestPair('PennyPincher', n); seen.add([...p].sort().join('+')); }
    assert.equal(seen.size, 20, 'twenty suggestions before any repeat');
    const cur = suggestPair('PennyPincher', 3);
    assert.notDeepEqual([...suggestPair('PennyPincher', 3, cur)].sort(), [...cur].sort(), 'avoids the current pair');
    // different aliases start in different places (the pool is shared, the start is not)
    const starts = new Set(['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'].map((h) => suggestPair(h, 0).join('+')));
    assert.ok(starts.size >= 4, `aliases spread the starts (${starts.size})`);
    assert.ok(suggestPair('', 0).length === 2 && suggestPair(undefined, 0).length === 2);
    // the reducer: reroll sets a full build, flags it, and the next press changes it
    let st = draftInit({ handle: 'Ada' });
    st = draftReduce(st, { type: 'reroll' });
    assert.equal(st.picks.length, 2); assert.equal(st.suggested, true); assert.equal(st.rerolls, 1);
    const first = [...st.picks].sort().join('+');
    st = draftReduce(st, { type: 'reroll' });
    assert.notEqual([...st.picks].sort().join('+'), first);
    assert.equal(draftChoice(st).ok, true);
    assert.match(trayHTML(st), /Suggested for balance/);
    assert.equal(draftReduce(st, { type: 'toggle', id: st.picks[0] }).suggested, false, 'touching a card ends the suggestion');
  } finally { Math.random = real; }
});

test('balanced means complementary: in every suggested pair one Background makes up for the other\'s weak spot, and every Background can be suggested', () => {
  const one = Object.fromEntries(PERK_IDS.map((id) => [id, traitScores([id]).map((t) => t.score)]));
  const used = new Set();
  for (let n = 0; n < 20; n++) {
    const [x, y] = suggestPair('x', n);
    used.add(x); used.add(y);
    const cover = one[x].some((s, i) => (s <= -0.1 && one[y][i] >= 0.1) || (one[y][i] <= -0.1 && s >= 0.1));
    assert.ok(cover, `${x}+${y} covers nothing`);
  }
  assert.equal(used.size, PERK_IDS.length, 'all twelve appear somewhere in the suggestions');
});

// ------------------------------------------------------------------ debrief and instructor on real games
const REAL = (game) => { const S = new Session(); S.game = game; S.synth = makeSynth(11, 'test'); return S; };
const freshGame = makeGame(['connected', 'grad']);
const lateGame = (() => { const g = makeGame(['native', 'heir'], 'growth', 11); run(g, { days: 60 }); return g; })();
const gigGame = (() => { const g = makeGame(['gigger', 'second'], 'fintech', 5); run(g, { days: 60 }); return g; })();

test('the debrief builds for a fresh game and a day-60 bot game, with no stale terms', () => {
  for (const [name, g] of [['fresh', freshGame], ['day 60', lateGame], ['day 60 b', gigGame]]) {
    const S = REAL(g), html = debriefHTML(S, 'my notes <b>x</b>');
    assert.deepEqual(checkHTML(html, name), [], name);
    assert.ok(!BAD.test(html.replace(/n\/a/g, '')), `${name}: no undefined/NaN`);
    assert.ok(!STALE.test(html), `${name}: stale term ${STALE.exec(html)?.[0]}`);
    assert.ok(html.includes('my notes &lt;b&gt;x&lt;/b&gt;'), 'the draft is escaped');
    for (const id of g.s.perks) assert.ok(html.includes(PERKS[id].name), `${name}: build shows ${id}`);
    for (const need of ['Your build', 'District reached', 'Level', 'Creativity score', 'Overall percentile', 'How you met the shocks', 'Prompt A', 'Prompt B', 'Prompt C', 'Deal Room play']) assert.ok(html.includes(need), `${name}: ${need}`);
    assert.ok(html.includes(`of ${ZONE_COUNT}`), 'district out of sixteen');
    assert.ok(!/Rank in profile|profRank/.test(html));
    assert.ok(!BAD.test(reflectionMD(S, 'notes')), `${name}: workbook`);
    assert.ok(!STALE.test(reflectionMD(S, 'notes')), `${name}: workbook terms`);
  }
});

test('the debrief reports the district reached and where the founder stands overall', () => {
  const S = REAL(lateGame), top = Math.max(...lateGame.s.zones);
  const html = debriefHTML(S);
  assert.ok(html.includes(`${top} of ${ZONE_COUNT}`));
  assert.match(html, /Overall percentile/);
  assert.match(html, /(\d+)(st|nd|rd|th)/);
  const lb = S.leaderboard(), me = lb.find((r) => r.me);
  const st = standing(lb, me);
  assert.ok(st.percentile >= 0 && st.percentile <= 100);
  assert.equal(st.n, 12);
  assert.deepEqual(standing([], null), { rank: null, n: 0, percentile: null });
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th']);
});

test('the debrief shows what a build costs from the ledger', () => {
  const conn = makeGame(['connected', 'grad'], 'ops', 3); run(conn, { days: 40 });
  const c = buildCosts(conn.s.ledger);
  assert.ok(c.family.n > 0 && c.garnish.n > 0, 'the engine charged both costs');
  const html = debriefHTML(REAL(conn));
  assert.match(html, /Family obligations paid/);
  assert.match(html, /Student-loan garnishment/);
  assert.match(debriefHTML(REAL(makeGame(['trades', 'pro']))), /work through prices, speed and limits/);
});

test('skill-game stats are read tolerantly from game.s.meta and may be missing', () => {
  const g = makeGame(['trades', 'pro'], 'ops', 9);
  assert.deepEqual(skillStats(g.s).rows, [], 'no meta: nothing, no throw');
  assert.match(debriefHTML(REAL(g)), /No Deal Room scores were recorded/);
  for (const meta of ['junk', 5, [], null, { haggle: null }, { haggle: { n: NaN } }, { auction: 'x' }, { games: null }]) {
    g.s.meta = meta;
    assert.doesNotThrow(() => debriefHTML(REAL(g)), JSON.stringify(meta));
    assert.deepEqual(skillStats(g.s).rows, [], JSON.stringify(meta));
  }
  g.s.meta = { haggle: { n: 5, avg: 0.7 }, inspect: 3, pitch: { count: 2, sum: 1.2 }, repair: { plays: 4, mean: 2.5 }, played: 12, quick: 4 };
  const rows = skillStats(g.s).rows;
  assert.deepEqual(rows.map((r) => r.id), ['inspect', 'pitch', 'haggle', 'repair']);
  assert.equal(rows.find((r) => r.id === 'pitch').avg, 0.6);
  const html = debriefHTML(REAL(g));
  assert.deepEqual(checkHTML(html, 'meta'), []);
  assert.match(html, /<td>Haggle<\/td><td>Close<\/td><td class="mono">5<\/td><td class="mono">70%<\/td>/);
  assert.match(html, /played 12 deals? by hand and auto-played 4 with Quick/);
  assert.match(reflectionMD(REAL(g), ''), /Haggle \(Close\): played 5 time/);
});

// the instructor
function roomSession(game) {
  const S = new Session();
  S.mode = 'instructor';
  S.roomInfo = { code: 'ABCD', relay: '', role: 'instructor' };
  S.room = { kind: 'local', state: 'open' };
  S.setDemo(12);
  const snap = (pid, handle, perks, zones) => ({ ...game.publicSnapshot(), pid, handle, perks, zones });
  S.peers.set('PC-A', { pid: 'PC-A', handle: 'Zelda', role: 'student', seen: Date.now(), snap: snap('PC-A', '=cmd|calc<b>Zelda</b>', ['trades', 'pro'], 3) });
  S.peers.set('PC-B', { pid: 'PC-B', handle: 'Orville', role: 'student', seen: Date.now(), snap: snap('PC-B', 'Orville', ['heir', 'creator'], 9) });
  return S;
}
test('the instructor dashboard builds for a fresh game and a day-60 game, with no stale terms', () => {
  for (const [name, g] of [['fresh', freshGame], ['day 60', lateGame]]) {
    const S = roomSession(g), p = instructorParts(S, { zone: null, bg: 'all', ev: 'fed', when: '0', replace: true });
    for (const k of ['head', 'c1', 'c2', 'grade']) {
      assert.ok(p[k].length > 100, `${name}: ${k}`);
      assert.ok(!BAD.test(p[k].replace(/n\/a/g, '')), `${name}: ${k} has undefined/NaN`);
      assert.ok(!STALE.test(p[k]), `${name}: ${k}: stale term ${STALE.exec(p[k])?.[0]}`);
      assert.deepEqual(checkHTML(p[k], `${name} ${k}`), []);
    }
    assert.ok(p.head.includes('ABCD'));
    assert.ok(p.c1.includes('Global engine step controls') && p.c1.includes('Manual black swan trigger') && p.c1.includes('data-act="deploy"'), 'clock and shock controls stay');
    assert.ok(p.c2.includes('Flagged peer trades'));
    assert.ok(p.grade.includes('data-act="gradecsv"'));
  }
});

test('the dashboard shows the sixteen districts: class distribution, heat map selector, Backgrounds as icons', () => {
  const S = roomSession(lateGame), p = instructorParts(S, { zone: null, bg: 'all' });
  const dist = distribution(S.students());
  assert.equal(dist.length, ZONE_COUNT + 1);
  assert.equal(dist.reduce((a, b) => a + b, 0), S.students().length, 'every student counted once');
  assert.equal(dist[3] >= 1 && dist[9] >= 1, true);
  assert.equal((p.c2.match(/<li data-n=/g) || []).length, ZONE_COUNT, 'one column per district');
  assert.match(p.c2, /Students by highest district reached/);
  assert.equal((p.c2.match(/<option value="\d+"/g) || []).length, ZONE_COUNT, 'the heat map can show any district');
  assert.ok(!/data-z="[123]"/.test(p.c2), 'no three-zone buttons');
  assert.ok(p.c2.includes('Niche saturation heat map'));
  assert.ok(p.c2.includes('What the class drafted'));
  // the heat map defaults to where most students are, and a chosen district sticks
  const mode = busiest(dist);
  assert.ok(heatHTML(S, { zone: null }, S.students(), dist).includes(`<option value="${mode}" selected>`));
  assert.ok(heatHTML(S, { zone: 7 }, S.students(), dist).includes('<option value="7" selected>'));
  assert.ok(heatHTML(S, { zone: 999 }, S.students(), dist).includes(`<option value="${mode}" selected>`), 'a bad district falls back');
  // Backgrounds as two small icons with names for assistive technology, in the roster
  assert.match(p.grade, /<span class="in-bgs" role="img" aria-label="Licensed Tradesperson and Seasoned Pro"/);
  assert.ok(p.grade.includes('>District<'));
  const counts = draftCounts(S.students());
  assert.ok(counts.trades >= 1 && counts.heir >= 1);
});

test('student text is escaped in the dashboard and the roster filters by Background', () => {
  const S = roomSession(lateGame);
  const all = instructorParts(S, { bg: 'all' });
  assert.ok(all.grade.includes('=cmd|calc&lt;b&gt;Zelda&lt;/b&gt;'), 'alias escaped');
  assert.ok(!all.grade.includes('<b>Zelda</b>'));
  const heirs = instructorParts(S, { bg: 'heir' });
  assert.ok(heirs.grade.includes('Orville') && !heirs.grade.includes('Zelda'), 'filter keeps only that Background');
  assert.ok(heirs.grade.includes('<option value="heir" selected>'));
  assert.equal((all.grade.match(/<option value="/g) || []).length, 1 + PERK_IDS.length, 'All Backgrounds plus the twelve');
  assert.ok(!/All profiles|Profile/.test(all.grade));
  assert.deepEqual(instructorParts(S, { bg: 'constructor' }).grade.includes('selected>All'), false, 'a bad filter value falls back to all');
});

test('the gradebook uses an overall percentile and the CSV has Backgrounds, district and level', () => {
  const S = roomSession(lateGame);
  const gb = S.gradebook();
  assert.ok(gb.length >= 14);
  for (const r of gb) assert.ok(r.econ >= 0 && r.econ <= 100);
  assert.ok(gb.some((r) => r.econ === 0) && Math.max(...gb.map((r) => r.econ)) > 90, 'a percentile across the whole room, demo students included');
  const csv = gradebookCSV(S), lines = csv.split('\n');
  assert.equal(lines.length, 3, 'header plus the two real students; demo students are not exported');
  assert.match(lines[0], /^"founder_id","alias","background_1","background_2","district_reached","level","net_worth","eei","economic_percentile"/);
  assert.ok(!STALE.test(csv) && !/economic_pct_in_profile/.test(csv));
  assert.ok(lines.some((l) => l.includes('"trades","pro","3"')));
  assert.ok(lines.some((l) => l.includes('"heir","creator","9"')));
  assert.ok(lines.some((l) => l.startsWith('"PC-A","\'=cmd|calc<b>Zelda</b>"')), 'a formula in an alias is made text');
  for (const l of lines) assert.equal(l.split('","').length, 17, 'every row has the 17 columns');
});

test('the dashboard builds with no students at all and with a room that is not connected', () => {
  const S = new Session();
  S.mode = 'instructor'; S.roomInfo = { code: 'ZZZ', relay: 'wss://x.example', role: 'instructor' };
  const p = instructorParts(S, {});
  assert.ok(p.grade.includes('Waiting for students'));
  assert.ok(p.c2.includes('No Backgrounds yet'));
  assert.ok(p.head.includes('relay=wss%3A%2F%2Fx.example'));
  for (const k of Object.keys(p)) assert.ok(!BAD.test(p[k]), k);
});

// ------------------------------------------------------------------ the router
test('main.js routes title, draft, Academy, game, debrief and instructor with no v1 leftovers', () => {
  const main = src('js/main.js');
  assert.ok(!/tutorial\.js/.test(main), 'the Level 0 tutorial is not imported');
  assert.ok(!/mountTutorial|PROFILES|tutDone|'tutorial'|Level 0|profile/i.test(main), 'no profiles and no Level 0');
  assert.ok(!STALE.test(main.replace(/'academyDone'/g, '')), `stale term ${STALE.exec(main)?.[0]}`);
  assert.match(main, /from '\.\/ui\/shell\.js'/);
  assert.match(main, /from '\.\/ui\/draft\.js'/);
  assert.match(main, /from '\.\/ui\/academy\.js'/);
  assert.match(main, /root\._acts = \{\};/, 'the action table is reset before every screen');
  assert.match(main, /root\.focus\(\{ preventScroll: true \}\)/, 'focus moves to the page on every route change');
  assert.match(main, /kv\.get\('academyDone'\)/, 'the Academy runs on a first visit only');
  assert.match(main, /onAcademy:/, 'the game Menu can replay the Academy');
  assert.match(main, /data-act="academy"/, 'the title offers the Academy');
  for (const hook of ['onDebrief', 'onAcademy', 'onJoin', 'onReset']) assert.ok(main.includes(hook + ':'), hook);
  assert.match(main, /S\.startGame\(\{ perks, specialty, handle \}\)/);
  assert.match(main, /S\.joinRoom\(\{ \.\.\.room, role: 'student'/);
  for (const needle of ['one paperclip', 'sixteen districts', 'twelve Backgrounds', 'skill games']) assert.ok(main.includes(needle), needle);
  // routes every screen the shell knows
  for (const s of ['title()', 'setup()', 'academy()', 'game()', 'instructor()', 'debrief()']) assert.ok(main.includes(s), s);
});

test('the Academy is offered as a first-run tutorial after the draft and never twice', () => {
  const main = src('js/main.js');
  // draft -> startGame -> academy when not done, else the game
  assert.match(main, /if \(kv\.get\('academyDone'\)\) enter\(\); else openAcademy\(\(\) => go\('game'\)\);/);
  // finishing or skipping marks it done, once
  assert.match(main, /onDone: finish, onSkip: finish/);
  assert.match(main, /kv\.set\('academyDone', true\)/);
  // a solo clock waits while the sandbox plays, and is only resumed by the screen that paused it
  assert.match(main, /freezeClock/);
  assert.match(main, /p\?\.resume/);
});

test('the screens keep their accessibility behaviour: skip link, landmarks, live announcements, focus', () => {
  const html = src('index.html');
  for (const needle of ['class="skip"', 'aria-live="polite"', 'role="alert"', '<main id="app"']) assert.ok(html.includes(needle), needle);
  assert.match(html, /css\/ui-draft\.css/);
  const draft = src('js/ui/draft.js');
  assert.match(draft, /announce\(st\.notice \|\| statusText\(st\)/, 'every change of the build is announced');
  assert.match(draft, /e\.key === 'Enter'/, 'Enter toggles a focused card instead of submitting');
  assert.match(draft, /ArrowRight/);
  const debrief = src('js/ui/debrief.js'), instructor = src('js/ui/instructor.js');
  assert.match(debrief, /<h1 tabindex="-1"/); assert.match(debrief, /aria-live="polite"/);
  assert.match(instructor, /<h1 tabindex="-1"/); assert.match(instructor, /<caption class="sr">/);
  for (const f of [draft, debrief, instructor]) assert.ok(!/innerHTML\s*=\s*[^`'"]*\+\s*(handle|value)/.test(f), 'no string-built innerHTML from user text');
});

test('the files this author owns carry no stale v1 terms and no hard-coded colours in the new stylesheet', () => {
  for (const f of ['js/ui/draft.js', 'js/ui/debrief.js', 'js/ui/instructor.js']) assert.ok(!STALE.test(src(f).replace(/Level 0/g, '')), `${f}: ${STALE.exec(src(f))?.[0]}`);
  const css = src('css/ui-draft.css');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), 'tokens only');
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /data-motion="reduce"/);
  assert.match(css, /:focus-visible/);
});
