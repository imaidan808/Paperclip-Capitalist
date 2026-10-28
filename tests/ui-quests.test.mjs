// The Quests drawer, against the real engine and a real Progress tracker fed by the engine's events: hero, skills, quest chain, daily bounties and badges
// for fresh, day 10, day 25 and day 60 states and two Background pairs; spending a point, the badge on the dock icon and the quest and badge views.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeCtx, checkHTML } from './helpers/ctx.mjs';
import { run } from './bot.mjs';
import quests from '../js/ui/drawers/quests.js';
import { Progress } from '../js/meta/progress.js';
import { QUESTS, ACHIEVEMENTS } from '../js/meta/quests.js';
import { SKILLS, SKILL_MAX, ZONES, xpForLevel } from '../js/config.js';

const STALE = /Zone 2|Island|Bootstrapper|profile/i;
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const el = (dataset = {}, value = '') => ({ dataset, value });
const STATES = [0, 10, 25, 60];
const PAIRS = [['trades', 'pro'], ['connected', 'grad']];

/** A fake context on a real game with a real Progress attached to the engine's events, played for `days` by the bot. */
function mk({ days = 0, perks = ['trades', 'pro'], progress = true } = {}) {
  const ctx = fakeCtx({ days: 0, perks });
  if (progress) { const pr = new Progress(ctx.g()); ctx.g().onEvent = (e) => pr.onEvent(e); ctx.progress = pr; }
  if (days) run(ctx.g(), { days });
  return ctx;
}
const pitch = (zone, extra = {}) => ({ type: 'pitch', day: 1, zone, cls: 'radio', seg: 'student', outcome: 'win', gain: 0.2, cm: 1.5, S: 0.5, fit: 0.9, price: 10, mult: 1.2, ...extra });

for (const days of STATES) for (const perks of PAIRS) {
  test(`html at day ${days} with ${perks.join(' + ')}: valid, plain, every section there`, () => {
    const ctx = mk({ days, perks }), g = ctx.g();
    const h = quests.html(ctx), t = text(h);
    assert.deepEqual(checkHTML(h, `day ${days}`), []);
    assert.ok(!STALE.test(h), 'a stale v1 term');
    assert.ok(!/zone/i.test(h), 'the word zone');
    assert.match(t, new RegExp(`Level ${g.level()}`));
    assert.equal((h.match(/class="qs-skill[ "]/g) || []).length, 3, 'three skill cards');
    for (const K of Object.values(SKILLS)) assert.ok(t.includes(K.name), K.name);
    assert.match(t, /Reputation: \w+/); assert.match(t, /Win streak \d+ \(best \d+\)/);
    assert.match(h, /data-qsect="skills"/); assert.match(h, /data-qsect="quests"/); assert.match(h, /data-qsect="daily"/); assert.match(h, /data-qsect="badges"/);
    assert.match(t, /\d+ of 32 done/); assert.match(t, /\d+ of 78 earned/);
    assert.match(h, /role="meter"[^>]*aria-label="Reputation"/);
    assert.match(h, /role="progressbar"[^>]*aria-label="XP toward level/);
    assert.match(t, /Level \d \+ \d from /, 'the Background bonus is shown apart from the level you bought');
    // the quest chain starts with the first quest still open for a fresh player
    if (!days) { assert.match(t, /First Swap/); assert.match(t, /Unlocks after “First Swap”\./); assert.match(t, /Ride|Need Beats Cost/); }
  });
}

test('the hero: level ring, XP to the next level, streak meaning and reputation meter come from the engine', () => {
  const ctx = mk({ days: 10 }), g = ctx.g(), s = g.s;
  s.streak = 3; s.bestStreak = 7; s.rep = 72;
  const h = quests.html(ctx), t = text(h), lv = g.level(), lo = xpForLevel(lv), hi = xpForLevel(lv + 1);
  assert.match(t, new RegExp(`${s.xp - lo} / ${hi - lo} XP`));
  assert.match(t, new RegExp(`${hi - s.xp} to level ${lv + 1}`));
  assert.match(h, new RegExp(`aria-label="Level ${lv}, \\d+ percent of the way to level ${lv + 1}"`));
  assert.match(t, /Win streak 3 \(best 7\)/); assert.match(t, /Your next win earns \+20 bonus XP/, 'the engine adds 5 XP per streak step to the next win');
  assert.match(t, /Reputation: Respected 72 \/ 100/);
  assert.match(t, new RegExp(`Buyers arrive at ${(0.85 + 0.003 * 72).toFixed(2)}x speed`));
  s.streak = 0; assert.match(text(quests.html(ctx)), /Win a trade to start a streak/);
  s.rep = 5; assert.match(text(quests.html(ctx)), /Reputation: Doubtful/);
  // a Background that changes how fast you learn is stated
  const heir = mk({ perks: ['gigger', 'pro'] }); assert.match(text(quests.html(heir)), /all XP \+25% -15%|all XP [+-]\d+%/);
});

test('skills: effective level, the Background bonus apart, and what the next level changes', () => {
  const ctx = mk({ days: 10, perks: ['trades', 'grad'] }), g = ctx.g(), s = g.s;
  Object.assign(s.skills, { ops: 3, growth: 2, fintech: 1 }); s.points = 2;
  const h = quests.html(ctx), t = text(h);
  assert.equal(g.lvl('ops'), s.skills.ops + 2 - 1 + 0 + (g.P.opsBonus - 1), 'trades +2 and grad -1 on Ops add to +1');
  assert.match(t, new RegExp(`Level ${s.skills.ops} \\+ 1 from Licensed Tradesperson and Business-School Grad = effective level ${g.lvl('ops')}`));
  assert.match(t, new RegExp(`Level ${s.skills.fintech} \\+ 1 from Business-School Grad`), 'Capital Sourcing gets +1 from the grad');
  assert.match(h, /aria-label="Level \d+ of 8, plus 1 from your Backgrounds, effective level \d+"/);
  assert.match(t, /Repair bill/); assert.match(t, /At the next level:/); assert.match(t, /Buyers arriving \+\d+%/); assert.match(t, /Early warning of shocks/);
  assert.match(t, /Spend a point: level \d → \d/);
  assert.equal((h.match(/class="qs-skill ready"/g) || []).length, 3, 'every skill that can be raised is marked ready');
  // the numbers are the engine's own formulas
  const now = g.lvl('growth');
  assert.match(t, new RegExp(`Buyers arriving \\+${Math.round(15 * (now - 1))}%`));
  assert.match(t, new RegExp(`Pitch prices \\+${Math.round(4 * (now - 1))}%`));
  // no points: the button says what it needs and is disabled
  s.points = 0;
  const h0 = quests.html(ctx);
  assert.match(h0, /data-act="quests-spend" data-k="ops" data-fid="qs-sp-ops" aria-disabled="true"/); assert.match(text(h0), /needs a skill point/);
  // mastery
  s.skills.fintech = SKILL_MAX; s.points = 3;
  const hm = quests.html(ctx); assert.match(text(hm), /Mastered/); assert.match(text(hm), /Mastery reached/);
  assert.match(hm, /data-k="fintech" data-fid="qs-sp-fintech" aria-disabled="true"/);
});

test('quests-spend raises the skill through the engine, plays the level sound and bursts; with no point it says so', () => {
  const ctx = mk({ days: 10 }), g = ctx.g(), s = g.s, a = quests.acts(ctx), seen = [];
  ctx.sfx = { level: () => seen.push('level') }; ctx.burst = (o) => seen.push(['burst', o.power]);
  s.points = 1; const k = 'growth', before = s.skills[k], xp = s.xp;
  a['quests-spend'](el({ k }));
  assert.equal(s.skills[k], before + 1); assert.equal(s.points, 0); assert.ok(s.xp > xp, 'the engine pays a little XP for training');
  assert.deepEqual(seen, ['level', ['burst', 0.8]]); assert.equal(ctx.toasts.at(-1)[1], 'good');
  assert.ok(ctx.calls.includes('render'));
  seen.length = 0;
  a['quests-spend'](el({ k }));
  assert.equal(s.skills[k], before + 1, 'no point, no change'); assert.deepEqual(seen, []);
  assert.equal(ctx.toasts.at(-1)[1], 'bad'); assert.match(ctx.toasts.at(-1)[0], /No skill points/);
  s.points = 5; s.skills.ops = SKILL_MAX; a['quests-spend'](el({ k: 'ops' })); assert.equal(s.skills.ops, SKILL_MAX); assert.equal(s.points, 5); assert.match(ctx.toasts.at(-1)[0], /mastery/);
  a['quests-spend'](el({ k: 'constructor' })); assert.equal(s.points, 5, 'an unknown skill changes nothing');
});

test('the dock badge shows the skill points waiting and nothing otherwise', () => {
  const ctx = mk(); assert.equal(quests.badge(ctx), null);
  ctx.g().s.points = 4; assert.equal(quests.badge(ctx), 4);
  assert.equal(quests.id, 'quests'); assert.equal(quests.icon, '🎯'); assert.equal(quests.label, 'Quests'); assert.equal(quests.visible(ctx), true);
});

test('quests: the active quest first with a progress bar and its reward, locked ones greyed and saying what unlocks them', () => {
  const ctx = mk(), pr = ctx.progress, g = ctx.g();
  let h = quests.html(ctx), t = text(h);
  assert.match(h, /class="qs-q active"/); assert.match(t, /Now \S+ First Swap/); assert.match(t, /0 \/ 1/);
  assert.match(h, /role="progressbar"[^>]*aria-label="First Swap progress"/);
  assert.match(t, new RegExp(`Reward \\+${Math.round(50 * g.P.xpMult)} XP`), 'the reward is shown after the Backgrounds\' XP multiplier');
  assert.match(h, /class="qs-q locked"/); assert.match(t, /Unlocks after “First Swap”\./);
  assert.ok(!t.includes('Window Shopping'), 'a district two steps ahead is not shown yet');
  // the reach: districts the player can reach plus one ahead
  assert.ok(t.includes('Flea Market Row') && !t.includes('Campus Quad'), 'district 1 is open, so 1 and 2 are shown');
  // only the next two upcoming quests spell out their goal
  assert.equal((h.match(/class="qs-q locked"/g) || []).length, QUESTS.filter((q) => q.zone <= 2).length - 1);
  // finish the first quest: the chain moves on and rewards xp
  const xp = g.s.xp; pr.onEvent(pitch(1));
  h = quests.html(ctx); t = text(h);
  assert.ok(g.s.xp > xp);
  assert.match(t, /1 of 32 done/); assert.match(t, /Now \S+ Need Beats Cost/); assert.doesNotMatch(t, /Now \S+ First Swap/);
  assert.match(h, /qs-fold/); assert.match(t, /Show completed quests \(1\)/); assert.ok(!t.includes('Done: First Swap'), 'completed quests are folded away');
  // partial progress shows a fraction (the same trade also counted toward the quest it unlocked)
  assert.match(t, /1 \/ 3/); assert.match(h, /aria-valuenow="33"/);
  pr.onEvent(pitch(1)); h = quests.html(ctx); assert.match(text(h), /2 \/ 3/); assert.match(h, /aria-valuenow="67"/);
});

test('completed quests fold and unfold; a quest in a district you have not opened says what opens it', () => {
  const ctx = mk(), pr = ctx.progress, a = quests.acts(ctx);
  pr.onEvent(pitch(1));
  a['quests-done'](); assert.equal(ctx.U.quests.doneOpen, true);
  let h = quests.html(ctx); assert.match(h, /aria-expanded="true"/); assert.match(text(h), /Done: First Swap/); assert.match(text(h), /Hide completed quests/);
  a['quests-done'](); assert.equal(ctx.U.quests.doneOpen, false); assert.doesNotMatch(quests.html(ctx), /Done: First Swap/);
  // the chain reaches a district that is still closed: the quest is the active one, and says what opens its district
  for (const q of QUESTS.slice(0, 2)) pr.m.q[q.id] = { p: q.goal.count, done: true };
  h = quests.html(ctx); let t = text(h);
  assert.match(h, /class="qs-q active"/); assert.match(t, /Now \S+ Stall Crawler/);
  assert.match(t, new RegExp(`Open ${ZONES[2].name} first: it needs \\$${ZONES[2].gate}`));
  assert.doesNotMatch(h, /data-act="quests-go"/, 'no Go button into a district that is not open');
  assert.equal(ctx.progress.current().def.id, 'q02a', 'the HUD tracker names the same quest');
  // everything within reach is done and the next quest lies two districts away
  for (const q of QUESTS.slice(0, 4)) pr.m.q[q.id] = { p: q.goal.count, done: true };
  h = quests.html(ctx); t = text(h);
  assert.doesNotMatch(h, /class="qs-q active"/); assert.match(t, /No quest is waiting on you right now/);
});

test('quests-go takes the player to the quest\'s district and closes the drawer', () => {
  const ctx = mk({ days: 25 }), pr = ctx.progress, a = quests.acts(ctx);
  ctx.U.drawer = 'quests';
  pr.m.q = {};   // the bot may have finished quests during its 25 days; this test sets the whole chain itself
  for (const q of QUESTS.slice(0, 5)) pr.m.q[q.id] = { p: q.goal.count, done: true };   // the chain now waits at Campus Quad (district 3)
  ctx.U.zone = 9;
  const h = quests.html(ctx);
  assert.match(h, /data-act="quests-go" data-dist="3"/);
  a['quests-go'](el({ dist: '3' }));
  assert.equal(ctx.U.zone, 3); assert.equal(ctx.U.drawer, null);
  assert.doesNotMatch(quests.html(ctx), /data-act="quests-go"/, 'no button when you are already there');
  a['quests-go'](el({ dist: '16' })); assert.equal(ctx.U.zone, 3); assert.equal(ctx.toasts.at(-1)[1], 'warn');
});

test('money goals read as money and fractions are capped at the goal', () => {
  const ctx = mk(), pr = ctx.progress;
  for (const q of QUESTS) if (q.zone < 14) pr.m.q[q.id] = { p: q.goal.count, done: true };
  const q = QUESTS.find((x) => x.id === 'q14b'); pr.m.q.q14a = { p: 2, done: true };
  pr.m.q[q.id] = { p: 123456, done: false };
  ctx.g().s.zones.push(...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  const t = text(quests.html(ctx));
  assert.match(t, /\$50,000 \/ \$50,000/, 'capped at the goal, in dollars');
});

test('daily bounties: three a day with bars; none yet on the first morning', () => {
  const ctx = mk(), pr = ctx.progress;
  assert.match(text(quests.html(ctx)), /0 of 3 today/); assert.match(text(quests.html(ctx)), /Three fresh bounties arrive with every new day/);
  pr.onEvent({ type: 'day', day: 2 });
  assert.equal(pr.dailies().length, 3);
  let h = quests.html(ctx); const t = text(h);
  for (const d of pr.dailies()) { assert.ok(t.includes(d.title), d.title); assert.match(h, new RegExp(`aria-label="${d.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} progress"`)); }
  assert.match(t, /0 of 3 today/);
  // finish one
  const d = pr.dailies()[0]; d.p = d.goal.count; d.done = true;
  h = quests.html(ctx); assert.match(text(h), /1 of 3 today/); assert.match(text(h), /Done/); assert.match(h, /class="qs-day done"/);
  assert.deepEqual(checkHTML(h), []);
});

test('badges: rarity has a shape and a word, secrets are a question mark, progress shows, earned ones are marked', () => {
  const ctx = mk(), pr = ctx.progress, a = quests.acts(ctx);
  a['quests-ach-all']();
  let h = quests.html(ctx), t = text(h);
  assert.equal((h.match(/class="qs-ach /g) || []).length, 78, 'all badges once they are all shown');
  for (const [shape, word] of [['●', 'Common'], ['◆', 'Rare'], ['★', 'Epic']]) assert.ok(t.includes(`${shape} ${word}`), word);
  const secrets = ACHIEVEMENTS.filter((x) => x.hidden);
  assert.ok(secrets.length >= 5);
  assert.equal((h.match(/class="qs-ach \w+ secret"/g) || []).length, secrets.length);
  for (const x of secrets) { assert.ok(!t.includes(x.title), `secret "${x.title}" leaked`); assert.ok(!t.includes(x.desc), `secret text of "${x.title}" leaked`); }
  assert.match(t, /Secret badge/); assert.match(t, /· secret/); assert.match(h, /aria-hidden="true">\?<\/span>/);
  // epic badges promise a skill point
  assert.match(t, /\+1 skill point/);
  // earn a secret and an ordinary one
  const sec = secrets[0], plain = ACHIEVEMENTS.find((x) => !x.hidden && x.goal.count > 1);
  pr.m.a[sec.id] = { p: sec.goal.count, done: true, day: 3 }; pr.m.a[plain.id] = { p: 1, done: false };
  h = quests.html(ctx); t = text(h);
  assert.ok(t.includes(sec.title), 'an earned secret shows itself'); assert.match(t, /✓ Earned/);
  assert.match(t, new RegExp(`${plain.goal.count > 9 ? `1 / ${plain.goal.count}` : `1 / ${plain.goal.count}`}`), 'progress on an unfinished badge');
  assert.match(t, /1 of 78 earned/);
  assert.equal((h.match(/class="qs-ach \w+ earned"/g) || []).length, 1);
  assert.deepEqual(checkHTML(h), []);
});

test('badge filters and the long list: earned first, only twelve until Show all', () => {
  const ctx = mk(), pr = ctx.progress, a = quests.acts(ctx);
  const rare = ACHIEVEMENTS.find((x) => x.rarity === 'rare' && !x.hidden); pr.m.a[rare.id] = { p: rare.goal.count, done: true };
  let h = quests.html(ctx);
  assert.equal((h.match(/class="qs-ach /g) || []).length, 12);
  assert.match(text(h), /Show all 78 badges/);
  assert.ok(h.indexOf(rare.title) > -1 && h.indexOf(rare.title) < h.search(/class="qs-ach \w+ todo"/), 'earned badges come first');
  a['quests-ach'](el({ k: 'earned' }));
  h = quests.html(ctx); assert.equal((h.match(/class="qs-ach /g) || []).length, 1); assert.match(h, /data-k="earned"[^>]*aria-pressed="true"/); assert.doesNotMatch(text(h), /Show all/);
  a['quests-ach'](el({ k: 'todo' }));
  h = quests.html(ctx); assert.ok(!(h.match(/class="qs-ach \w+ earned"/g) || []).length);
  a['quests-ach-all'](); h = quests.html(ctx); assert.equal((h.match(/class="qs-ach /g) || []).length, 77); assert.match(text(h), /Show fewer badges/);
  a['quests-ach'](el({ k: 'nonsense' })); assert.equal(ctx.U.quests.ach, 'all');
  // nothing earned yet: a friendly empty state
  const fresh = mk(); quests.acts(fresh)['quests-ach'](el({ k: 'earned' })); assert.match(text(quests.html(fresh)), /Nothing here yet/);
});

test('the jump bar scrolls to a section and moves focus to its heading', () => {
  const ctx = mk(), a = quests.acts(ctx), log = [];
  const h3 = { focus: (o) => log.push(['focus', o.preventScroll]) }, sec = { scrollIntoView: (o) => log.push(['scroll', o.block, o.behavior]), querySelector: () => h3 };
  ctx.$ = (sel, root) => { log.push(['find', sel, root]); return sec; }; ctx.el = { drawer: 'DRAWER' }; ctx.reduced = () => true;
  a['quests-jump'](el({ to: 'badges' }));
  assert.deepEqual(log, [['find', '[data-qsect="badges"]', 'DRAWER'], ['scroll', 'start', 'auto'], ['focus', true]]);
  ctx.$ = () => null; a['quests-jump'](el({ to: 'nowhere' }));             // nothing there: nothing breaks
  const h = quests.html(ctx); assert.equal((h.match(/data-act="quests-jump"/g) || []).length, 4);
  const bare = mk({ progress: false }); assert.equal((quests.html(bare).match(/data-act="quests-jump"/g) || []).length, 1, 'only Skills without a tracker');
});

test('the jump is instant whatever the motion setting: the shell writes the list\'s scrollTop back on every redraw, which cancels a smooth scroll and strands it part way', () => {
  const ctx = mk(), a = quests.acts(ctx), calls = [], cls = new Set(), heard = [];
  const h3 = { focus() {}, offsetWidth: 1, classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c) }, addEventListener: (type, f, o) => heard.push([type, o && o.once]) };
  const db = { scrollTop: 100, dataset: { drawer: 'quests' }, getBoundingClientRect: () => ({ top: 20 }), scrollTo: (o) => { calls.push(o); db.scrollTop = o.top; } };
  const sec = { closest: (s) => (s === '.db' ? db : null), getBoundingClientRect: () => ({ top: 520 }), querySelector: () => h3 };
  const drawer = { _keep: { top: 100, id: 'quests' }, querySelector: () => db };
  ctx.$ = () => sec; ctx.el = { drawer };
  globalThis.getComputedStyle = () => ({ scrollMarginTop: '62px' });
  try {
    for (const reduced of [false, true]) {
      ctx.reduced = () => reduced; calls.length = 0; cls.clear(); heard.length = 0; db.scrollTop = 100; drawer._keep.top = 100;
      a['quests-jump'](el({ to: 'badges' }));
      assert.equal(calls.length, 1, 'one scroll, on the drawer\'s own list');
      assert.equal(calls[0].behavior, 'auto', `instant with reduced motion ${reduced ? 'on' : 'off'}: nothing in flight for a redraw to cancel`);
      assert.equal(calls[0].top, 520 - 20 + 100 - 62, 'the section lands under the sticky jump bar (its scroll margin)');
      assert.equal(drawer._keep.top, db.scrollTop, 'the new place is the remembered one, so a rebuild in the same frame cannot put the old one back');
      assert.ok(cls.has('landed'), 'the heading takes its wash'); assert.deepEqual(heard, [['animationend', true]], 'and gives it up when it has played, once');
    }
  } finally { delete globalThis.getComputedStyle; }
  const css = readFileSync(new URL('../css/ui-quests.css', import.meta.url), 'utf8');
  assert.match(css, /\.qs h3\.landed \{ animation: qs-landed [.0-9]+s ease-out; \}/); assert.match(css, /@keyframes qs-landed \{ from \{ background: color-mix\(in srgb, var\(--gold\) 30%, transparent\); \} \}/);
});

test('with no progress tracker the drawer still shows the hero and the skills', () => {
  for (const days of [0, 25]) {
    const ctx = mk({ days, progress: false }), h = quests.html(ctx), t = text(h);
    assert.deepEqual(checkHTML(h), []); assert.ok(!STALE.test(h));
    assert.match(t, /Level \d+/); assert.match(t, /Operational Engineering/); assert.doesNotMatch(t, /Daily bounties|Achievements|Coming up/);
    assert.equal(ctx.progress, null);
  }
});

test('every control is a real button with a label and a stable focus id, and every action it names exists', () => {
  for (const days of [0, 25, 60]) {
    const ctx = mk({ days }), acts = quests.acts(ctx), pr = ctx.progress;
    pr.m.q[QUESTS[0].id] = { p: 1, done: true };
    for (const k of [{}, { doneOpen: true, achAll: true }, { ach: 'earned' }]) {
      ctx.U.quests = k; ctx.g().s.points = 2;
      const h = quests.html(ctx);
      assert.deepEqual(checkHTML(h), []);
      assert.ok(!/<(a|div|span|li)[^>]*\bdata-act=/.test(h), 'actions sit on buttons only');
      const fids = [...h.matchAll(/data-fid="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(new Set(fids).size, fids.length, 'focus ids are unique');
      for (const b of [...h.matchAll(/<button\b[^>]*>/g)].map((m) => m[0])) { assert.ok(/data-fid=/.test(b), `no focus id: ${b}`); assert.ok(/data-act="quests-[a-z-]+"/.test(b), 'prefixed action'); }
      for (const m of h.matchAll(/data-act="([^"]+)"/g)) assert.equal(typeof acts[m[1]], 'function', `no action ${m[1]}`);
      for (const b of h.matchAll(/<(?:span|div)[^>]*role="(progressbar|meter)"[^>]*>/g)) assert.match(b[0], /aria-label="[^"]+"/, 'every bar has a name');
    }
  }
});

test('data from a save is never trusted: odd quest, daily and badge state still renders', () => {
  const ctx = mk(), pr = ctx.progress;
  pr.m.q.q01a = { p: -3 }; pr.m.q.q01b = { p: 'x' }; pr.m.d = { day: 1, list: [{ id: 'd-x', title: '<b>x</b>', desc: 'a & b', icon: '🎲', goal: { event: 'buy', count: 3 }, reward: { xp: 10 }, p: 99, done: false }] };
  pr.m.a['a-haggle-first'] = { p: 99, done: false };
  const h = quests.html(ctx);
  assert.deepEqual(checkHTML(h), []);
  assert.ok(h.includes('&lt;b&gt;x&lt;/b&gt;') && !h.includes('<b>x</b>'), 'text from data is escaped');
});

test('the words of every quest, bounty and badge are free of stale terms and the word zone', async () => {
  const { DAILIES } = await import('../js/meta/quests.js');
  for (const x of [...QUESTS, ...ACHIEVEMENTS, ...DAILIES]) assert.ok(!/zone|Zone 2|Island|Bootstrapper|profile/i.test(`${x.title} ${x.desc}`), `${x.id}: ${x.desc}`);
});
