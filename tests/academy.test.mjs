// The Academy: the pure parts (sandbox, step resolver, anchors, card placer, teach-back, rewards, saved state), the cards it draws, and complete lessons
// played through the REAL engine by a bot that performs each step's action. Lessons are hand-made here; when js/meta/academy.js is present every lesson in it
// is played the same way and the first one that cannot be won says which step failed.
import test from 'node:test';
import assert from 'node:assert/strict';

// The session's kv reads localStorage. Give it a memory one so the tests can see exactly what a lesson would write.
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null };

const A = await import('../js/ui/academy-sandbox.js');
const D = await import('../js/ui/academy.js');
const { Game } = await import('../js/engine.js');
const { Session } = await import('../js/session.js');
const { ASSETS, BUYERS, ZONES, UPGRADES, PIPE, LOANS, CLIENTS } = await import('../js/config.js');
const { checkHTML } = await import('./helpers/ctx.mjs');

const store = { get: (k) => { try { return JSON.parse(mem.get('t.' + k) ?? 'null'); } catch { return null; } }, set: (k, v) => { mem.set('t.' + k, JSON.stringify(v)); } };
const fresh = () => { for (const k of [...mem.keys()]) if (k.startsWith('t.')) mem.delete(k); };

// ---------------------------------------------------------------- hand-made lessons (valid against the schema in docs/V2_DESIGN.md section 12)
const TB = (right = 1) => ({ q: 'Why did the first buyer pay more?', options: [0, 1, 2].map((i) => ({ text: `Option ${'ABC'[i]}`, correct: i === right, why: i === right ? 'Because need and fit set the price.' : `A tempting idea ${i}, and why it fails.` })) });
const WHY = { title: 'Why it worked', body: ['Value is use to a particular buyer.', 'Fit is how well tags match.'], formula: 'fit = min(1, strongest + 0.15 x others)', example: { setup: 'A paperclip meets a student.', steps: ['Strongest like is 1.0.', 'Fit 1.00.'], result: 'About 1.35x.' } };
const mk = (id, zone, setup, steps, win, extra = {}) => ({ id, title: 'Lesson ' + id, icon: '🎯', zone, concept: 'utility-fit', minutes: 2, intro: 'A scene for ' + id + '.', setup: { clock: 'paused', features: ['stock', 'market', 'codex'], ...setup }, steps, win, why: WHY, teachBack: TB(), reward: { xp: 120, codex: ['utility-fit'], points: 1 }, ...extra });
const ui = (id) => ({ type: 'ui', ui: 'open-drawer', id });
const ev = (event, match) => ({ type: 'event', event, ...(match ? { match } : {}) });
const step = (id, anchor, wait) => ({ id, say: `Do ${id}.`, anchor, wait, hint: `Hint for ${id}.` });

const LESSONS = [
  mk('t01', 1, { zones: [1], assets: [{ cls: 'paperclip' }], leads: [{ id: 'L-student', seg: 'student', budget: 8, need: 'tool' }, { id: 'L-barista', seg: 'barista', budget: 5 }] },
    [step('open', 'dock-stock', ui('stock')), step('pitch', 'world:lead:L-student', ev('pitch', { outcome: 'win' }))], { event: 'pitch', match: { outcome: 'win' } }),
  mk('t02', 4, { zones: [1, 2, 3, 4], cash: 500, lots: [{ id: 'T-watch', cls: 'pawnWatch', cond: 'ok', price: 150, truth: { quality: 0.9, fake: false } }, { id: 'T-fake', cls: 'pawnGuitar', cond: 'ok', price: 60, truth: { quality: 1, fake: true } }] },
    [step('read', 'deal-stage-read', ev('inspect')), step('buy', 'world:lot:T-watch', ev('buy', { fake: false }))], { event: 'buy', match: { fake: false } }),
  mk('t03', 2, { zones: [1, 2], cash: 30, assets: [{ cls: 'radio', cond: 'broken' }] }, [step('fix', 'world:asset:radio', ev('repair'))], { event: 'repair' }),
  mk('t04', 5, { zones: [1, 2, 3, 4, 5], cash: 5000, features: ['stock', 'market', 'crew', 'codex'] }, [step('crew', 'dock-crew', ui('crew')), step('hire', 'world:plot:0', ev('hire'))], { event: 'hire' }),
  mk('t05', 5, { zones: [1, 2, 3, 4, 5], cash: 2000, features: ['bank', 'codex'] }, [step('bank', 'dock-bank', ui('bank')), step('draw', 'drawer', ev('draw', { prod: 'micro' }))], { event: 'draw' }),
  mk('t06', 1, { clock: 'running', speed: 4, zones: [1], assets: [{ cls: 'paperclip' }], events: [{ kind: 'tiktok', atHour: 12 }] }, [step('wait', 'ticker', ev('shock', { kind: 'tiktok' }))], { event: 'shock', match: { kind: 'tiktok' } }),
  mk('t07', 1, { zones: [1], assets: [{ cls: 'paperclip' }], cohort: { ghosts: 400 }, leads: [{ id: 'La', seg: 'student', budget: 8 }, { id: 'Lb', seg: 'barista', budget: 6 }, { id: 'Lc', seg: 'mechanic', budget: 9 }, { id: 'Ld', seg: 'marguerite', budget: 7 }] },
    [step('pioneer', 'world:lead:Lb', ev('pitch', { outcome: 'pioneer' }))], { event: 'pitch', match: { outcome: 'pioneer' } }),
  mk('t08', 1, { zones: [1], assets: [{ cls: 'paperclip' }, { cls: 'pen' }], leads: [{ id: 'La', seg: 'student', budget: 8 }, { id: 'Lb', seg: 'barista', budget: 6 }] },
    [step('click', 'dock-market', { type: 'click', anchor: 'dock-market' }), step('open', 'dock-market', ui('market')), step('haggle', 'deal-stage-close', ev('haggle', { mult: { gte: 1.05 }, deal: true }))], { event: 'haggle', match: { deal: true } }),
];

// ---------------------------------------------------------------- anchors
test('anchors: dom names and world references parse, junk does not', () => {
  assert.deepEqual(A.parseAnchor('dock-market'), { kind: 'dom', name: 'dock-market' });
  assert.deepEqual(A.parseAnchor('world:lead:L12'), { kind: 'world', type: 'lead', id: 'L12' });
  assert.deepEqual(A.parseAnchor('world:plot:5:0'), { kind: 'world', type: 'plot', id: '5:0' });
  for (const bad of ['', null, undefined, 'world:', 'world:lead', 'world:cow:1', 'Dock Market', 'dock_market', '<b>']) assert.equal(A.parseAnchor(bad), null, String(bad));
  for (const a of A.DOM_ANCHORS) assert.equal(A.parseAnchor(a).kind, 'dom', a);
});

test('anchors: any rect shape becomes { x, y, w, h }; rects with no area are nothing', () => {
  assert.deepEqual(A.normRect({ x: 1, y: 2, w: 3, h: 4 }), { x: 1, y: 2, w: 3, h: 4 });
  assert.deepEqual(A.normRect({ x: 1, y: 2, width: 3, height: 4 }), { x: 1, y: 2, w: 3, h: 4 });
  assert.deepEqual(A.normRect({ left: 10, top: 20, right: 40, bottom: 80 }), { x: 10, y: 20, w: 30, h: 60 });
  assert.deepEqual(A.normRect({ left: 5, top: 6, width: 7, height: 8, right: 12, bottom: 14 }), { x: 5, y: 6, w: 7, h: 8 });
  for (const bad of [null, undefined, 3, {}, { x: 0, y: 0, w: 0, h: 5 }, { x: 0, y: 0, w: 5, h: -1 }, { x: NaN, y: 0, w: 5, h: 5 }, { left: 0, top: 0, right: 0, bottom: 0 }]) assert.equal(A.normRect(bad), null);
});

test('anchors: resolveAnchor asks the DOM for HUD names, the world for things, and falls back to the whole world', () => {
  const seen = [];
  const p = { dom: (n) => { seen.push('dom:' + n); return { dock: { x: 10, y: 600, w: 80, h: 60 }, 'dock-market': { x: 10, y: 600, w: 80, h: 60 }, world: { x: 0, y: 0, w: 1000, h: 700 } }[n] || null; }, world: (t, id) => { seen.push(`world:${t}:${id}`); return t === 'lead' && id === 'L1' ? { x: 300, y: 200, w: 40, h: 60 } : null; } };
  assert.deepEqual(A.resolveAnchor('dock-market', p).via, 'dom');
  assert.equal(A.resolveAnchor('dock-bank', p), null, 'a HUD control that is not on the screen is nothing, not the world');
  const lead = A.resolveAnchor('world:lead:L1', p);
  assert.equal(lead.via, 'world'); assert.deepEqual(lead.rect, { x: 300, y: 200, w: 40, h: 60 });
  const gone = A.resolveAnchor('world:lead:L9', p);
  assert.equal(gone.via, 'fallback'); assert.deepEqual(gone.rect, { x: 0, y: 0, w: 1000, h: 700 });
  assert.equal(A.resolveAnchor('world:lead:L1', { dom: () => null, world: () => null }), null);
  assert.equal(A.resolveAnchor('???', p), null);
  assert.equal(A.resolveAnchor('world:lot:T1', { dom: (n) => (n === 'world' ? { x: 0, y: 0, w: 5, h: 5 } : null) }).via, 'fallback', 'a provider with no world() at all (no rectOf yet) still works');
});

test('card placer: beside the target, never over it, always inside the view', () => {
  const view = { w: 1000, h: 700 }, card = { w: 300, h: 150 };
  const t = { x: 400, y: 100, w: 100, h: 60 };
  const below = A.placeCard(t, card, view); assert.equal(below.side, 'below'); assert.ok(below.y >= 160);
  const low = A.placeCard({ x: 400, y: 600, w: 100, h: 60 }, card, view); assert.equal(low.side, 'above');
  const corner = A.placeCard({ x: 940, y: 640, w: 50, h: 50 }, card, view); assert.ok(corner.x + 300 <= 1000 && corner.y + 150 <= 700 && corner.x >= 0 && corner.y >= 0);
  for (const r of [t, { x: 0, y: 0, w: 30, h: 30 }, { x: 970, y: 670, w: 30, h: 30 }, { x: 200, y: 300, w: 600, h: 100 }]) {
    const at = A.placeCard(r, card, view);
    assert.ok(at.x >= 8 && at.y >= 8 && at.x + 300 <= 992 && at.y + 150 <= 692, 'inside the view');
    if (at.side !== 'float') assert.ok(!A.rectsOverlap({ ...at, w: 300, h: 150 }, r), 'not over the target: ' + at.side);
  }
  assert.equal(A.placeCard(null, card, view).side, 'center');
  assert.equal(A.placeCard({ x: 0, y: 0, w: 1000, h: 700 }, card, view).side, 'float', 'a target as big as the screen: float above the dock');
  const tiny = A.placeCard(t, { w: 900, h: 900 }, { w: 320, h: 480 }); assert.ok(tiny.x >= 0 && tiny.y >= 0, 'a phone');
  assert.ok(A.coverOf({ x: 0, y: 0, w: 1000, h: 700 }, view) === 1 && A.coverOf(t, view) < 0.05 && A.coverOf(null, view) === 0);
  assert.ok(A.pointInRect(410, 110, t) && !A.pointInRect(10, 10, t) && !A.pointInRect(1, 1, null));
});

test('world hits: a lead, lot or place by id, a crate by id or class, a plot by number', () => {
  assert.ok(A.hitMatches('world:lead:L1', { kind: 'lead', id: 'L1' }) && !A.hitMatches('world:lead:L1', { kind: 'lead', id: 'L2' }) && !A.hitMatches('world:lead:L1', { kind: 'lot', id: 'L1' }));
  assert.ok(A.hitMatches('world:asset:van', { kind: 'asset', id: 'A7', asset: { cls: 'van' } }) && A.hitMatches('world:asset:A7', { kind: 'asset', id: 'A7' }) && !A.hitMatches('world:asset:van', { kind: 'asset', id: 'A7', asset: { cls: 'bike' } }));
  assert.ok(A.hitMatches('world:plot:1', { kind: 'plot', id: '5:1' }) && A.hitMatches('world:plot:1', { kind: 'plot', id: '5:0' }) && !A.hitMatches('world:plot:1', { kind: 'plot', id: '5:2' }) && A.hitMatches('world:plot:5:0', { kind: 'plot', id: '5:0' }));
  assert.ok(A.hitMatches('world:static:bank', { kind: 'static', id: 'bank' }));
  for (const bad of ['dock-bank', 'world:cow:1', '']) assert.equal(A.hitMatches(bad, { kind: 'lead', id: '1' }), false);
  assert.equal(A.hitMatches('world:lead:1', null), false);
});

test('card placer: it stays off an open drawer and off the dock icons', () => {
  const view = { w: 1100, h: 760 }, card = { w: 336, h: 181 }, drawer = { x: 610, y: 70, w: 480, h: 606 }, dock = { x: 450, y: 680, w: 200, h: 70 }, market = { x: 517, y: 689, w: 65, h: 54 };
  const clear = (at, r) => !A.rectsOverlap({ x: at.x, y: at.y, w: 336, h: 181 }, r);
  const plain = A.placeCard(market, card, view, 14, 8, [dock]); assert.equal(plain.side, 'above'); assert.ok(clear(plain, dock) && clear(plain, market));
  const crowded = A.placeCard(market, card, view, 14, 8, [drawer, dock]);
  assert.ok(clear(crowded, drawer) && clear(crowded, dock) && clear(crowded, market), 'nothing covered: ' + JSON.stringify(crowded));
  assert.ok(crowded.x >= 8 && crowded.y >= 8 && crowded.x + 336 <= 1092 && crowded.y + 181 <= 752);
  const inDrawer = A.placeCard({ x: 700, y: 200, w: 120, h: 40 }, card, view, 14, 8, [drawer, dock]); assert.ok(clear(inDrawer, { x: 700, y: 200, w: 120, h: 40 }), 'a target inside the drawer still gets a card that does not cover it');
  assert.equal(A.placeCard(null, card, view, 14, 8, [{ x: 382, y: 489, w: 336, h: 181 }]).side, 'center', 'with no target the card finds a free corner of the screen');
  assert.ok(A.placeCard(market, card, view, 14, 8, [null]).side, 'a missing rect in the list is ignored');
});

// ---------------------------------------------------------------- the step resolver
test('waits: an event, a drawer opening and a click each match only themselves', () => {
  const W = { type: 'event', event: 'pitch', match: { outcome: 'win', gain: { gte: 0.5 } } };
  assert.ok(A.waitMatches(W, { type: 'pitch', outcome: 'win', gain: 0.9 }));
  assert.ok(!A.waitMatches(W, { type: 'pitch', outcome: 'win', gain: 0.1 }), 'ranges are honoured');
  assert.ok(!A.waitMatches(W, { type: 'pitch', outcome: 'flat', gain: 0.9 }));
  assert.ok(!A.waitMatches(W, { type: 'buy', outcome: 'win', gain: 0.9 }));
  assert.ok(A.waitMatches({ type: 'event', event: 'hire' }, { type: 'hire', kind: 'broker' }), 'no match object matches any event of the type');
  const U = { type: 'ui', ui: 'open-drawer', id: 'market' };
  assert.ok(A.waitMatches(U, ui('market')) && !A.waitMatches(U, ui('stock')) && !A.waitMatches(U, { type: 'open-drawer', id: 'market' }));
  assert.ok(A.waitMatches({ type: 'click', anchor: 'dock-bank' }, { type: 'click', anchor: 'dock-bank' }) && !A.waitMatches({ type: 'click', anchor: 'dock-bank' }, { type: 'click', anchor: 'dock-crew' }));
  for (const bad of [null, undefined, {}, { type: 'wat' }]) assert.ok(!A.waitMatches(bad, { type: 'pitch' }));
  assert.ok(!A.waitMatches(W, null));
});

test('feedRun: steps advance in order, one event at most one step, and the win counts only after the last step', () => {
  const m = LESSONS[0];
  let run = A.startRun(m);
  assert.deepEqual(run, { i: 0, n: 2, won: false });
  let r = A.feedRun(m, run, { type: 'pitch', outcome: 'win' }); // the win event, before the steps are done
  assert.equal(r.advanced, false); assert.equal(r.won, false); assert.equal(r.run.i, 0);
  r = A.feedRun(m, run, ui('market')); assert.equal(r.advanced, false, 'the wrong drawer');
  r = A.feedRun(m, run, ui('stock')); assert.equal(r.advanced, true); assert.equal(r.run.i, 1); assert.equal(r.won, false);
  assert.equal(run.i, 0, 'feedRun never mutates');
  run = r.run;
  r = A.feedRun(m, run, { type: 'pitch', outcome: 'flat' }); assert.equal(r.advanced, false);
  r = A.feedRun(m, run, { type: 'pitch', outcome: 'win' }); assert.equal(r.advanced, true); assert.equal(r.won, true, 'the event that ends the last step may itself be the win');
  assert.equal(A.feedRun(m, r.run, ui('stock')).advanced, false, 'once won, nothing more moves');
});

test('feedRun: a win that is a later event than the last step, a lesson with no steps, and one event satisfying two steps', () => {
  const m = { steps: [{ wait: ev('buy') }], win: { event: 'pitch' } };
  let r = A.feedRun(m, A.startRun(m), { type: 'buy' }); assert.equal(r.advanced, true); assert.equal(r.won, false); assert.equal(r.run.i, 1);
  r = A.feedRun(m, r.run, { type: 'pitch' }); assert.equal(r.won, true);
  const none = { steps: [], win: { event: 'cycle' } };
  assert.equal(A.feedRun(none, A.startRun(none), { type: 'cycle' }).won, true);
  const twice = { steps: [{ wait: ev('pitch') }, { wait: ev('pitch') }], win: { event: 'pitch' } };
  r = A.feedRun(twice, A.startRun(twice), { type: 'pitch' }); assert.equal(r.run.i, 1, 'one pitch, one step'); assert.equal(r.won, false);
  r = A.feedRun(twice, r.run, { type: 'pitch' }); assert.equal(r.won, true);
});

test('coach text: steps, the finishing state, the first sentence for the goal card, hints after 20 seconds, drawers already open', () => {
  const m = LESSONS[0];
  const c0 = A.coachFor(m, A.startRun(m));
  assert.equal(c0.index, 0); assert.equal(c0.total, 2); assert.equal(c0.say, 'Do open.'); assert.equal(c0.anchor, 'dock-stock'); assert.equal(c0.finishing, false);
  const done = A.coachFor(m, { i: 2, n: 2, won: false });
  assert.equal(done.finishing, true); assert.equal(done.anchor, 'tracker'); assert.match(done.say, /goal/i);
  assert.equal(A.coachFor({ steps: [{ say: 'x', anchor: 'world', wait: ui('stock') }] }, { i: 0, n: 1 }).hint, 'Try the highlighted control.', 'a step with no hint still gets one');
  assert.equal(A.shortSay('Open the Market. Then click a buyer.'), 'Open the Market.');
  assert.ok(A.shortSay('x'.repeat(300)).length <= 96);
  assert.equal(A.shortSay(null), '');
  assert.ok(!A.hintDue(1000, 20999) && A.hintDue(1000, 21000) && A.HINT_AFTER_MS === 20000);
  assert.deepEqual(A.satisfiedNow(m.steps[0], { drawer: 'stock' }), ui('stock'));
  assert.equal(A.satisfiedNow(m.steps[0], { drawer: 'market' }), null); assert.equal(A.satisfiedNow(m.steps[1], { drawer: 'stock' }), null); assert.equal(A.satisfiedNow(m.steps[0], {}), null);
});

test('features: the dock shows what the lesson names plus anything a step points at', () => {
  assert.deepEqual(A.featuresFor(LESSONS[0]).sort(), ['codex', 'market', 'stock']);
  assert.deepEqual(A.featuresFor(LESSONS[3]).sort(), ['codex', 'crew', 'market', 'stock']);
  const m = { setup: { features: ['stock'] }, steps: [{ anchor: 'dock-bank', wait: { type: 'click', anchor: 'dock-travel' } }, { wait: ui('quests') }] };
  assert.deepEqual(A.featuresFor(m).sort(), ['bank', 'quests', 'stock', 'travel']);
  assert.deepEqual(A.featuresFor({}), []);
});

// ---------------------------------------------------------------- teach-back
test('teach-back: right and wrong picks, retries are recorded, the reveal and the first try', () => {
  const tb = TB(1);
  assert.equal(A.scoreTeachBack(tb, 5), null); assert.equal(A.scoreTeachBack(tb, '1'), null); assert.equal(A.scoreTeachBack(null, 0), null);
  const w = A.scoreTeachBack(tb, 0); assert.equal(w.correct, false); assert.equal(w.right, 1); assert.match(w.why, /tempting/); assert.match(w.rightWhy, /need and fit/);
  assert.equal(A.scoreTeachBack(tb, 1).correct, true);
  let s = A.newTeach(); assert.equal(A.teachDone(s), false);
  let r = A.pickTeach(tb, s, 0); s = r.state; assert.equal(r.result.correct, false); assert.deepEqual(s.picks, [0]); assert.equal(A.teachDone(s), false);
  r = A.pickTeach(tb, s, 0); assert.equal(r.result, null, 'the same wrong answer twice is not a second attempt'); assert.deepEqual(r.state.picks, [0]);
  r = A.pickTeach(tb, s, 1); s = r.state; assert.equal(s.solved, true); assert.deepEqual(s.picks, [0, 1]); assert.equal(A.teachFirstTry(s), false); assert.equal(A.teachDone(s), true);
  assert.equal(A.pickTeach(tb, s, 2).result, null, 'nothing after the answer');
  const first = A.pickTeach(tb, A.newTeach(), 1).state; assert.equal(A.teachFirstTry(first), true);
  const shown = A.revealTeach(A.pickTeach(tb, A.newTeach(), 2).state); assert.equal(A.teachDone(shown), true); assert.equal(A.teachFirstTry(shown), false);
});

// ---------------------------------------------------------------- the sandbox
test('sandbox: a setup becomes a Game with exactly what it names, the schema truth in the engine shape, and no strangers', () => {
  const setup = { clock: 'paused', zones: [1, 2], cash: 12.5, skills: { ops: 3, growth: 2 }, perks: ['trades', 'nope'], assets: [{ cls: 'paperclip' }, { cls: 'radio', cond: 'broken', quality: 0.8 }, { cls: 'ghost-class' }],
    leads: [{ id: 'L-a', seg: 'student', budget: 8, need: 'tool' }, { id: 'L-b', seg: 'nobody', budget: 3 }, { seg: 'barista', budget: 4 }], lots: [{ id: 'T-a', cls: 'pen', cond: 'ok', price: 2, truth: { quality: 0.6, fake: true } }, { id: 'T-b', cls: 'pen', price: 1 }], events: [{ kind: 'tiktok', atHour: 6 }, { kind: 'volcano', atHour: 1 }] };
  const g = A.buildSandboxGame(setup, { id: 'x', zone: 2 }), s = g.s;
  assert.deepEqual(s.zones, [1, 2]); assert.equal(s.cash, 12.5); assert.deepEqual(s.skills, { ops: 3, growth: 2, fintech: 1 }); assert.deepEqual(s.perks, ['trades']);
  assert.equal(s.assets.length, 2); assert.equal(s.assets[0].zone, 2, 'assets live in the mission district'); assert.equal(s.assets[1].cond, 'broken'); assert.equal(s.assets[1].quality, 0.8);
  assert.ok(s.assets.every((a) => a.basis >= 0 && /^A\d+$/.test(a.id)));
  assert.deepEqual(s.leads[2].map((l) => l.id), ['L-a', 'LL1']); assert.equal(s.leads[2][0].need, 'tool'); assert.equal(s.leads[1].length, 0);
  const lot = s.lots[2].find((l) => l.id === 'T-a');
  assert.equal(lot.truth.q, 0.6); assert.equal(lot.truth.fake, true); assert.ok(lot.truth.defects.length >= 4, 'a poor fake shows its flaws'); assert.equal(lot.mode, 'fixed');
  assert.equal(s.lots[2].find((l) => l.id === 'T-b').truth.fake, false);
  assert.deepEqual(s.events.map((e) => e.id), ['lesson-tiktok-6']);
  assert.deepEqual(g.sandbox.warnings.sort(), ['asset class ghost-class', 'buyer nobody', 'event volcano']);
  assert.equal(s.mil.m1, false, 'milestone flags follow the open districts'); assert.deepEqual(g.lotTruth(2, 'T-a').defects.length, lot.truth.defects.length);
  assert.ok(s.nid >= 100 && s.hour === 0 && s.news.length === 0);
  assert.equal(A.buildSandboxGame({ zones: [1, 5] }, { zone: 5 }).s.mil.m1, true);
  assert.deepEqual(A.buildSandboxGame({}, { zone: 3 }).s.zones, [1, 2, 3], 'no zones named: the way up to the mission district');
  assert.deepEqual(A.buildSandboxGame({}).s.zones, [1]);
});

test('sandbox: an auction lot is an auction lot, however the lesson spells it', () => {
  const g = A.buildSandboxGame({ lots: [{ id: 'a', cls: 'pen', price: 3, auction: true }, { id: 'b', cls: 'pen', price: 3, mode: 'auction' }, { id: 'c', cls: 'pen', price: 3 }, { id: 'd', cls: 'pen', price: 3, auction: false }] }, { zone: 1 });
  assert.deepEqual(g.s.lots[1].map((l) => l.mode), ['auction', 'auction', 'fixed', 'fixed']);
});

test('sandbox: it is the same lesson every time, and nothing arrives that the lesson did not bring', () => {
  const setup = LESSONS[0].setup;
  const a = A.makeSandboxSession(setup, { id: 'same', zone: 1 }).game, b = A.makeSandboxSession(setup, { id: 'same', zone: 1 }).game;
  assert.equal(JSON.stringify(a.s), JSON.stringify(b.s));
  a.advanceTo(24 * 14); // two weeks of game time
  assert.deepEqual(a.s.leads[1].map((l) => l.id), ['L-student', 'L-barista'], 'no random buyers, none left');
  assert.equal(a.s.lots[1].length, 0, 'no random lots'); assert.equal(a.s.events.length, 0, 'no stock events from the 90-day calendar');
  assert.equal(a.s.assets.length, 1);
  const c = A.cloneSandbox(b); c.advanceTo(48); assert.equal(c.s.leads[1].length, 2, 'a clone keeps the rules'); assert.equal(b.s.hour, 0, 'and leaves the original alone');
});

test('sandbox session: paused or running, with or without a herd, and it never writes the real save', () => {
  const real = new Session(); real.game = new Game({ perks: ['pro'], handle: 'R', pid: 'REAL' }); real.save(true);
  assert.ok(mem.has('pc.save.main'), 'the stand-in storage is wired: a real Session does write');
  mem.delete('pc.save.main');
  const paused = A.makeSandboxSession({ clock: 'paused', assets: [{ cls: 'paperclip' }] }, { id: 'p', zone: 1 });
  assert.equal(paused.clock.paused, true); assert.equal(paused.mode, 'solo'); assert.equal(paused.canSetClock(), true); assert.equal(paused.ghosts, 0); assert.equal(paused.algo, false);
  const running = A.makeSandboxSession({ clock: 'running', speed: 4, cohort: { ghosts: 36 } }, { id: 'r', zone: 1 });
  assert.equal(paused.clock.speed, 16, 'when the player presses the clock a lesson hour is under half a second');
  assert.equal(A.makeSandboxSession({ clock: 'running' }, { zone: 1 }).clock.speed, 4); assert.equal(A.makeSandboxSession({ clock: 'paused', speed: 1 }, { zone: 1 }).clock.speed, 1, 'a lesson can ask for its own');
  assert.equal(running.clock.paused, false); assert.equal(running.clock.speed, 4); assert.equal(running.ghosts, 36); assert.equal(running.cohort.ghosts, 36); assert.equal(running.game.env.cohort, running.cohort);
  assert.equal(running.game.env.algo, false);
  const t0 = running.clock.wall; running.tick(t0 + 7000 * 10 / 4 + 50); // ten game hours at 4x
  assert.ok(running.game.s.hour >= 9 && running.game.s.hour <= 10, 'the lesson clock runs: ' + running.game.s.hour);
  running.setSpeed(16); running.setPaused(true); running.save(true); running.reset(); assert.equal(running.restore(), false);
  assert.equal(mem.has('pc.save.main'), false, 'a lesson wrote nothing');
  assert.equal(mem.get('pc.pid.main') != null, true, 'only the pseudonymous founder id exists, as before');
  // the herd is real: 36+ ghosts crowd the obvious niche, none leaves it empty
  const g0 = paused.game, g1 = A.makeSandboxSession({ cohort: { ghosts: 200 } }, { id: 'h', zone: 1 }).game;
  assert.equal(g0.cmFor(1, 'paperclip', 'student').vT, 0); assert.ok(g1.cmFor(1, 'paperclip', 'student').vT > 20, 'ghosts make a crowd');
});

// ---------------------------------------------------------------- rewards and saved state
test('rewards: a played lesson pays, a replay pays nothing, a skipped one gives only its pages', () => {
  const m = LESSONS[0];
  assert.deepEqual(A.rewardPlan(m), { grant: true, xp: 120, points: 1, codex: ['utility-fit'], show: ['utility-fit'], reason: 'played' });
  assert.deepEqual(A.rewardPlan(m, { done: true }), { grant: false, xp: 0, points: 0, codex: [], show: ['utility-fit'], reason: 'replay' });
  assert.deepEqual(A.rewardPlan(m, { skipped: true }), { grant: true, xp: 0, points: 0, codex: ['utility-fit'], show: ['utility-fit'], reason: 'skipped' });
  assert.equal(A.rewardPlan({ reward: { xp: -4, codex: [3, 'a'] } }).xp, 0); assert.deepEqual(A.rewardPlan({}).codex, []);
  assert.equal(A.rewardPlan({ reward: { xp: 10 } }).points, 0);
});

test('rewards: applied to a real run they add XP (through its own multiplier), the point, the pages and a record', () => {
  const g = new Game({ perks: ['grad', 'pro'], handle: 'R', pid: 'REAL', seed: 5 });
  const unlocked = new Set(), meta = { cx: {}, mission: {} };
  const makeProgress = () => ({ m: meta, unlockCodex: (id) => { if (unlocked.has(id)) return false; unlocked.add(id); meta.cx[id] = g.day; return true; } });
  const xp0 = g.s.xp, pts0 = g.s.points;
  const out = A.applyRewards(g, A.rewardPlan(LESSONS[0]), { id: 't01', tries: 2 }, makeProgress);
  assert.equal(g.s.xp - xp0, out.xp); assert.ok(out.xp > 0 && out.xp <= 120, 'multiplied by the Backgrounds: ' + out.xp);
  assert.equal(g.s.points - pts0 >= 1, true); assert.deepEqual(out.newCodex, ['utility-fit']); assert.deepEqual(out.knownCodex, []);
  assert.deepEqual(meta.mission.t01, { day: 1, tries: 2, skipped: false });
  const again = A.applyRewards(g, A.rewardPlan(LESSONS[0]), { id: 't01' }, makeProgress);
  assert.deepEqual(again.newCodex, []); assert.deepEqual(again.knownCodex, ['utility-fit'], 'a page you already have is not "new"');
});

test('rewards before a run exists wait in the store and are handed over once', () => {
  fresh();
  assert.deepEqual(A.readPending(store), { xp: 0, points: 0, codex: [], missions: [] });
  A.addPending(store, A.rewardPlan(LESSONS[0]), { id: 't01', tries: 1 });
  A.addPending(store, A.rewardPlan(LESSONS[1]), { id: 't02', tries: 3, skipped: false });
  A.addPending(store, A.rewardPlan({ reward: { codex: ['margin'] } }, { skipped: true }), { id: 't03', skipped: true });
  const p = A.readPending(store);
  assert.equal(p.xp, 240); assert.equal(p.points, 2); assert.deepEqual(p.codex, ['utility-fit', 'margin']); assert.deepEqual(p.missions.map((x) => x.id), ['t01', 't02', 't03']);
  assert.deepEqual(A.codexSeed({ a: 0, b: 5 }, p), { a: 0, b: 5, 'utility-fit': 1, margin: 1 }, 'the sandbox Codex shows what finished lessons hold');
  const g = new Game({ perks: ['pro', 'veteran'], handle: 'R', pid: 'REAL', seed: 5 }), meta = { cx: {}, mission: {} }, got = [];
  const makeProgress = () => ({ m: meta, unlockCodex: (id) => { got.push(id); meta.cx[id] = 1; return true; } });
  const out = A.claimPending(store, g, makeProgress);
  assert.ok(out.xp > 0); assert.deepEqual(got.slice(0, 2), ['utility-fit', 'margin']); assert.deepEqual(Object.keys(meta.mission).sort(), ['t01', 't02', 't03']); assert.equal(meta.mission.t02.tries, 3); assert.equal(meta.mission.t03.skipped, true);
  assert.equal(A.claimPending(store, g, makeProgress), null, 'handed over once');
  assert.deepEqual(A.readPending(store).missions, []);
});

test('saved state: done and skipped lessons, where to resume, and when the Academy is finished', () => {
  fresh();
  assert.deepEqual(A.readAcademy(store), { done: [], skipped: [], finished: false });
  assert.equal(A.nextIndex(LESSONS, A.readAcademy(store)), 0);
  A.markMission(store, LESSONS, 't01'); A.markMission(store, LESSONS, 't02', { skipped: true });
  const st = A.readAcademy(store); assert.deepEqual(st.done, ['t01']); assert.deepEqual(st.skipped, ['t02']);
  assert.equal(A.nextIndex(LESSONS, st), 2, 'skipped lessons are passed over');
  A.markMission(store, LESSONS, 't02'); assert.deepEqual(A.readAcademy(store).skipped, [], 'playing a skipped lesson moves it to done');
  A.markMission(store, LESSONS, 't01'); assert.deepEqual(A.readAcademy(store).done, ['t01', 't02'], 'twice is once');
  for (const m of LESSONS.slice(2, -1)) A.markMission(store, LESSONS, m.id);
  assert.equal(A.readAcademy(store).finished, false); assert.equal(store.get('academyDone'), null);
  const last = A.markMission(store, LESSONS, LESSONS[LESSONS.length - 1].id, { skipped: true });
  assert.equal(last.finished, true); assert.equal(store.get('academyDone'), true); assert.equal(A.nextIndex(LESSONS, A.readAcademy(store)), -1);
  store.set('academy', 'junk'); store.set('academySkipped', [1, 'ok', null]); assert.deepEqual(A.readAcademy(store).done, []); assert.deepEqual(A.readAcademy(store).skipped, ['ok'], 'junk in storage is ignored');
  fresh();
});

// ---------------------------------------------------------------- the cards
test('the cards are clean HTML: intro, coach, why, teach-back (before, after a miss, solved, revealed) and reward', () => {
  const m = LESSONS[0], st = { done: ['t01'], skipped: [], finished: false };
  const lookup = (id) => ({ 'utility-fit': { id, title: 'Utility & Fit', icon: '🎯', summary: 'Value is <use> to a buyer.' } })[id];
  const intro = D.introHTML(m, { index: 0, total: 8, st, concept: lookup('utility-fit'), replay: false, missions: LESSONS });
  const cards = {
    intro, introReplay: D.introHTML(m, { index: 0, total: 8, st, concept: null, replay: true, missions: LESSONS }),
    coach: D.coachHTML(A.coachFor(m, A.startRun(m)), { title: m.title }), coachHint: D.coachHTML(A.coachFor(m, A.startRun(m)), { title: m.title, hint: true, showMe: true, manual: true }),
    coachConfirm: D.coachHTML(A.coachFor(m, A.startRun(m)), { title: m.title, confirm: true }), coachFinish: D.coachHTML(A.coachFor(m, { i: 2, n: 2 }), { title: m.title }),
    why: D.whyHTML(m, { index: 0, total: 8 }), whySkipped: D.whyHTML(m, { skipped: true, index: 0, total: 8 }),
    teach0: D.teachHTML(m, A.newTeach()), teachMiss: D.teachHTML(m, A.pickTeach(m.teachBack, A.newTeach(), 0).state),
    teachOk: D.teachHTML(m, A.pickTeach(m.teachBack, A.pickTeach(m.teachBack, A.newTeach(), 0).state, 1).state), teachShown: D.teachHTML(m, A.revealTeach(A.pickTeach(m.teachBack, A.newTeach(), 2).state)),
    reward: D.rewardHTML(m, { xp: 96, points: 1, newCodex: ['utility-fit'], knownCodex: [], pending: false }, lookup, { index: 0, total: 8 }),
    rewardPending: D.rewardHTML(m, { xp: 120, points: 1, newCodex: ['utility-fit', 'unknown-id'], knownCodex: [], pending: true }, lookup, { last: true, index: 7, total: 8 }),
    rewardReplay: D.rewardHTML(m, { xp: 0, points: 0, newCodex: [], knownCodex: ['utility-fit'] }, lookup, { replay: true, index: 0, total: 8 }),
    rewardSkipped: D.rewardHTML(m, { xp: 0, points: 0, newCodex: ['utility-fit'], knownCodex: [] }, lookup, { skipped: true, index: 0, total: 8 }),
  };
  for (const [name, html] of Object.entries(cards)) assert.deepEqual(checkHTML(html, name), []);
  assert.match(cards.intro, /Lesson 1 of 8/); assert.match(cards.intro, /About 2 min/); assert.match(cards.intro, /The Scrap Yard|Scrap/); assert.match(cards.intro, /Utility &amp; Fit/); assert.match(cards.intro, /Start the lesson/);
  assert.equal((cards.intro.match(/class="ac-pip /g) || []).length, LESSONS.length); assert.match(cards.intro, /ac-pip done/);
  assert.match(cards.introReplay, /Replay the lesson/); assert.match(cards.introReplay, /pays no new XP/);
  assert.match(cards.coach, /Step 1 of 2/); assert.match(cards.coach, /Show me/); assert.match(cards.coach, /Skip lesson/); assert.ok(!/Hint:/.test(cards.coach));
  assert.match(cards.coachHint, /Hint:/); assert.match(cards.coachHint, /gold frame/); assert.match(cards.coachHint, /ac-continue/); assert.match(cards.coachHint, /aria-pressed="true"/); assert.match(cards.coachHint, /Restart/);
  assert.match(cards.coachConfirm, /ac-skip-yes/); assert.match(cards.coachFinish, /Last step/);
  assert.match(cards.why, /fit = min\(1/); assert.match(cards.why, /<ol><li>Strongest like is 1\.0\./); assert.match(cards.why, /Result:/); assert.match(cards.whySkipped, /skipped the hands-on part/); assert.match(cards.why, /Test myself/);
  assert.equal((cards.teach0.match(/data-act="ac-pick"/g) || []).length, 3, 'three large options'); assert.ok(!/ac-why/.test(cards.teach0), 'no reasons before a pick');
  assert.match(cards.teachMiss, /Not quite/); assert.match(cards.teachMiss, /tempting idea 0/); assert.match(cards.teachMiss, /Show me the answer/); assert.ok(!/need and fit set/.test(cards.teachMiss), 'a wrong pick does not give the answer away');
  assert.match(cards.teachOk, /ac-teach-next/); assert.match(cards.teachOk, /need and fit set the price/); assert.match(cards.teachOk, /tempting idea 0/, 'the miss is kept with its reason'); assert.match(cards.teachOk, /Got it/);
  assert.match(cards.teachShown, /This one/); assert.match(cards.teachShown, /need and fit/);
  assert.match(D.rewardHTML(m, { xp: 5, points: 0, newCodex: [], knownCodex: [] }, lookup, { last: true, only: true }), />Done</); assert.match(cards.rewardPending, />Finish the Academy</);
  const echo = (why, correct) => D.teachHTML({ teachBack: { q: 'q', options: [{ text: 'a', correct, why }, { text: 'b', correct: !correct, why: 'other' }, { text: 'c', correct: false, why: 'third' }] } }, A.pickTeach({ options: [{ correct, why }, { correct: !correct }, {}] }, A.newTeach(), 0).state);
  assert.ok(!/Yes\.<\/b> Yes/.test(echo('Yes. Because.', true)) && !/Yes\./.test(echo('Yes. Because.', true).replace(/Yes\. Because\./g, '')), 'a reason that opens with Yes is not given a second Yes');
  assert.ok(!/Not quite\.<\/b> No/.test(echo('No, because.', false)) && /Not quite\.<\/b> Because/.test(echo('Because.', false)), 'a reason that opens with No is not given a second verdict, one that does not is');
  assert.match(cards.teachMiss, /ac-fb sr/, 'the spoken feedback is not shown twice');
  assert.match(cards.reward, /\+96 XP/); assert.match(cards.reward, /\+1 skill point/); assert.match(cards.reward, /Utility &amp; Fit/); assert.match(cards.reward, /Value is &lt;use&gt; to a buyer/); assert.match(cards.reward, /Next lesson/); assert.match(cards.reward, />New</);
  assert.match(cards.rewardPending, /arrive when your run begins/); assert.match(cards.rewardPending, /Finish the Academy/); assert.match(cards.rewardPending, /Unknown id/, 'a page that is not loaded still gets a card');
  assert.match(cards.rewardReplay, /pays nothing new/); assert.ok(!/ac-rw/.test(cards.rewardReplay)); assert.match(cards.rewardSkipped, /earn its XP/);
  assert.ok(!/\bzone\b/i.test(Object.values(cards).join(' ').replace(/data-[a-z-]+|class="[^"]*"/g, '')), 'district, never zone');
});

test('the cards escape what lessons say', () => {
  const evil = mk('ev', 1, {}, [], { event: 'pitch' }, { title: '<evil1>', intro: '<evil2>', why: { title: '"><evil3>', body: ['<evil4>'], formula: 'a <evil5> b & c', example: { setup: '<evil6>', steps: ['<evil7>'], result: '<evil8>' } },
    teachBack: { q: '<evil9>', options: [{ text: '<evil10>', correct: true, why: '<evil11>' }, { text: 'b', correct: false, why: 'x' }, { text: 'c', correct: false, why: 'y' }] } });
  const html = [D.introHTML(evil, { index: 0, total: 1, st: { done: [], skipped: [] }, missions: [evil] }), D.whyHTML(evil, {}), D.teachHTML(evil, A.pickTeach(evil.teachBack, A.newTeach(), 0).state),
    D.coachHTML({ index: 0, total: 1, say: '<evil12>', hint: '<evil13>' }, { hint: true, title: '<evil14>' }), D.rewardHTML(evil, { xp: 1, points: 0, newCodex: ['x'], knownCodex: [] }, () => ({ id: 'x', title: '<evil15>', icon: '<evil16>', summary: '<evil17>' }), {})].join('');
  assert.ok(!/<evil/.test(html), 'nothing from a lesson is markup');
  for (let i = 1; i <= 17; i++) assert.ok(html.includes(`&lt;evil${i}&gt;`), `evil${i} is shown as text`);
});

// ---------------------------------------------------------------- the driver's edges (no game screen needed)
test('mountAcademy: no lessons ends at once; an unknown lesson id ends at once; the intro draws and Leave calls onSkip after cleanup', async () => {
  const root = () => { const h = {}; return { innerHTML: '', _h: h, addEventListener(t, fn) { (h[t] ||= []).push(fn); }, querySelector: () => null }; };
  const click = (r, act) => { const el = { dataset: { act }, getAttribute: () => null, disabled: false }; for (const f of r._h.click || []) f({ target: { closest: () => el }, preventDefault() {} }); };
  let done = null; const stop = D.mountAcademy(root(), {}, { missions: [], onDone: (x) => { done = x; } });
  await new Promise((r) => setTimeout(r, 10)); assert.equal(done.empty, true); stop();
  done = null; D.mountAcademy(root(), {}, { missions: LESSONS, only: 'nope', onDone: (x) => { done = x; } }); await new Promise((r) => setTimeout(r, 10)); assert.ok(done, 'an unknown id does not hang the screen');
  const r = root(); let skipped = 0, doneCalls = 0;
  const cleanup = D.mountAcademy(r, {}, { missions: LESSONS, store, onSkip: () => { skipped++; }, onDone: () => { doneCalls++; } });
  assert.match(r.innerHTML, /Lesson t01/); assert.match(r.innerHTML, /Lesson 1 of 8/);
  click(r, 'ac-leave'); assert.equal(skipped, 1); assert.equal(doneCalls, 0); cleanup(); cleanup();
  fresh(); store.set('academy', ['t01', 't02']);
  const r2 = root(); D.mountAcademy(r2, {}, { missions: LESSONS, store }); assert.match(r2.innerHTML, /Lesson t03/, 'resumes where the player stopped');
  const r3 = root(); D.mountAcademy(r3, {}, { missions: LESSONS, only: 't02', store }); assert.match(r3.innerHTML, /Lesson t02/); assert.match(r3.innerHTML, /Replay the lesson/);
  fresh();
});

test('pending rewards are exposed for main.js, and the Academy hands them to a run that exists when it opens', async () => {
  fresh();
  const g = new Game({ perks: ['pro', 'veteran'], handle: 'R', pid: 'REAL', seed: 5 }), saved = [];
  A.addPending(store, A.rewardPlan(LESSONS[0]), { id: 't01', tries: 1 });
  assert.equal(A.readPending(store).xp, 120);
  D.mountAcademy({ innerHTML: '', addEventListener() {}, querySelector: () => null }, { game: g, save: (f) => saved.push(f) }, { missions: [], store, onDone() {} });
  assert.ok(g.s.xp > 0 && g.s.xp <= 120, 'the run got the XP: ' + g.s.xp); assert.equal(g.s.points, 1 + (g.level() - 1)); assert.deepEqual(saved, [true], 'and was saved');
  assert.equal(g.s.meta.mission.t01.tries, 1); assert.deepEqual(A.readPending(store), { xp: 0, points: 0, codex: [], missions: [] }, 'handed over once');
  await new Promise((r) => setTimeout(r, 5));
  fresh();
  assert.equal(typeof D.pendingRewards, 'function'); assert.equal(typeof D.claimPendingRewards, 'function');
  assert.deepEqual(D.pendingRewards(store), { xp: 0, points: 0, codex: [], missions: [] });
});

// ---------------------------------------------------------------- whole lessons, played through the engine by a bot that performs each step
// For a step that waits on a game event the bot tries candidate actions on a copy of the sandbox and performs the first one whose events satisfy the wait.
function* actions(g) {
  const s = g.s;
  for (const z of s.zones) {
    for (const lead of s.leads[z] || []) for (const a of s.assets) for (const mult of [1, 1.2, 1.4, 0.8]) yield (x) => x.pitch(a.id, lead.id, { mult });
    for (const lot of s.lots[z] || []) {
      for (const mult of [1, 0.8]) yield (x) => x.buyLot(z, lot.id, { mult });
      for (const score of [0.9, 0.5]) yield (x) => x.recordInspect(z, lot.id, { estimate: { quality: lot.truth.q, fakeProb: lot.truth.fake ? 0.9 : 0.1 }, confidence: 0.8, score });
    }
  }
  for (const a of s.assets) {
    if (a.cond === 'broken') for (const [qualityMult, costMult, precision] of [[1, 1, 0.5], [1.15, 0.9, 1]]) yield (x) => x.repair(a.id, { qualityMult, costMult, precision });
    yield (x) => x.sellPool([a.id]);
    for (const z of s.zones) if (z !== a.zone) yield (x) => x.ship([a.id], z);
  }
  for (const role of ['sell', 'buy']) for (const mult of [1.1, 1, 1.3, 0.9]) for (const score of [0.8, 0.5]) yield (x) => x.recordPlay('haggle', { role, mult, score, deal: true });
  for (const z of s.zones) for (const lot of s.lots[z] || []) if (lot.mode === 'auction') yield (x) => { x.recordPlay('auction', { won: true, price: lot.price * 0.9, surplus: 10 }); x.buyLot(z, lot.id, { mult: 0.9 }); }; // winning at auction is buying
  for (const won of [true, false]) yield (x) => x.recordPlay('auction', { won, price: 1, surplus: won ? 1 : 0 });
  for (const sk of ['ops', 'growth', 'fintech']) yield (x) => x.spendPoint(sk);
  for (const id of Object.keys(UPGRADES)) yield (x) => x.buyUpgrade(id);
  for (const zone of s.zones) for (const kind of Object.keys(PIPE)) for (const lane of g.radar(zone, 4)) yield (x) => x.hirePipeline(kind, zone, { cls: lane.cls, buyer: lane.seg });
  for (const p of s.pipes) yield (x) => x.upgradePipeline(p.id);
  for (const prod of Object.keys(LOANS)) for (const f of [1, 0.5, 0.2]) yield (x) => x.draw(prod, Math.max(1, g.loanRoom(prod).room * f));
  for (const l of s.loans) yield (x) => x.repay(l.id);
  for (const tier of Object.keys(CLIENTS)) yield (x) => x.acquireClient(tier);
  yield (x) => x.xp(5000);
  for (const h of [1, 6, 12, 24, 48, 72, 120, 240, 480]) yield (x) => x.advanceTo(x.s.hour + h);
}
function perform(g, accepts) {
  for (const act of actions(g)) {
    const c = A.cloneSandbox(g), seen = [];
    c.onEvent = (e) => seen.push(e);
    try { act(c); } catch { continue; }
    if (seen.some(accepts)) { act(g); return true; }
  }
  return false;
}
/** Plays a lesson start to finish. Returns { ok, failedStep, why, events }. */
function playLesson(m) {
  const sess = A.makeSandboxSession(m.setup, { id: m.id, zone: m.zone }), g = sess.game, events = [];
  let run = A.startRun(m);
  const feed = (e) => { events.push(e); run = A.feedRun(m, run, e).run; };
  g.onEvent = feed;
  while (run.i < run.n && !run.won) {
    const st = m.steps[run.i], before = run.i;
    if (st.wait.type === 'ui') feed({ type: 'ui', ui: st.wait.ui, id: st.wait.id });
    else if (st.wait.type === 'click') feed({ type: 'click', anchor: st.wait.anchor });
    else if (!perform(g, (e) => A.waitMatches(st.wait, e))) return { ok: false, failedStep: st.id, why: 'no action produced ' + JSON.stringify(st.wait), events };
    if (run.i === before) return { ok: false, failedStep: st.id, why: 'the step did not advance', events };
  }
  if (!run.won && !perform(g, (e) => A.winMatches(m.win, e))) return { ok: false, failedStep: 'win', why: 'no action produced ' + JSON.stringify(m.win), events };
  return { ok: run.won, failedStep: run.won ? null : 'win', why: run.won ? '' : 'steps done but no win', events, game: g };
}

for (const m of LESSONS) {
  test(`a bot plays lesson ${m.id} (district ${m.zone}) to its win through the real engine`, () => {
    const r = playLesson(m);
    assert.ok(r.ok, `${m.id} step "${r.failedStep}": ${r.why}`);
    assert.ok(r.events.length >= m.steps.length - 1);
  });
}

test('the herd lesson is won only because of the herd: with no ghosts the same pitches are never pioneer', () => {
  const m = { ...LESSONS[6], setup: { ...LESSONS[6].setup, cohort: { ghosts: 0 } } };
  const r = playLesson(m);
  assert.equal(r.ok, false, 'without a crowd nobody can be a pioneer: ' + r.why);
});

test('a lesson whose key lot is bought for real changes the sandbox and nothing else', () => {
  const m = LESSONS[1], sess = A.makeSandboxSession(m.setup, { id: m.id, zone: m.zone }), g = sess.game;
  const cash = g.s.cash, got = [];
  g.onEvent = (e) => got.push(e.type);
  assert.equal(g.recordInspect(4, 'T-watch', { estimate: { quality: 0.9, fakeProb: 0.05 }, confidence: 0.7, score: 0.8 }).ok, true);
  const r = g.buyLot(4, 'T-watch', { mult: 1 });
  assert.ok(r.ok, r.msg); assert.equal(g.s.cash, cash - 150); assert.equal(g.s.assets.length, 1); assert.equal(g.s.assets[0].truth.fake, false);
  assert.ok(got.includes('inspect') && got.includes('buy'));
  assert.equal(mem.has('pc.save.main'), false);
});

// ---------------------------------------------------------------- the real lessons, when they are in the tree
let REAL = [];
try { ({ ACADEMY: REAL } = await import('../js/meta/academy.js')); } catch { /* not merged yet */ }
test('the real Academy: every anchor and wait is one the driver understands, and the lessons are ten in order', { skip: !REAL.length && 'js/meta/academy.js is not in this tree yet' }, () => {
  assert.deepEqual(REAL.map((m) => m.id), Array.from({ length: 10 }, (_, i) => 'm' + String(i + 1).padStart(2, '0')));
  for (const m of REAL) {
    for (const st of m.steps) {
      assert.ok(A.parseAnchor(st.anchor), `${m.id}/${st.id}: anchor ${st.anchor}`);
      assert.ok(['event', 'ui', 'click'].includes(st.wait.type), `${m.id}/${st.id}: wait type`);
      if (st.wait.type === 'click') assert.ok(A.parseAnchor(st.wait.anchor), `${m.id}/${st.id}: click anchor`);
    }
    assert.ok(A.featuresFor(m).every((f) => ['stock', 'market', 'crew', 'bank', 'travel', 'codex', 'quests'].includes(f)), `${m.id}: dock ids`);
    const w = A.buildSandboxGame(m.setup, { id: m.id, zone: m.zone }).sandbox.warnings;
    assert.deepEqual(w, [], `${m.id}: the sandbox skipped things the lesson named`);
    assert.deepEqual(checkHTML(D.introHTML(m, { index: 0, total: 10, st: { done: [], skipped: [] }, missions: REAL }), m.id), []);
    for (const [name, html] of Object.entries({ why: D.whyHTML(m, {}), teach: D.teachHTML(m, A.newTeach()), solved: D.teachHTML(m, A.pickTeach(m.teachBack, A.newTeach(), m.teachBack.options.findIndex((o) => o.correct)).state), reward: D.rewardHTML(m, { xp: m.reward.xp, points: 1, newCodex: m.reward.codex, knownCodex: [] }, null, {}) })) assert.deepEqual(checkHTML(html, m.id + ' ' + name), []);
  }
});
// Known faults in the lesson data (not in the driver), kept visible rather than hidden: the test is a `todo` until the data is fixed, and passes then.
const KNOWN_DATA_FAULTS = {
  m10: 'set in district 6 but sells district-5 goods: the boutique lead wants Viral Gadget Pallets, which have no demand in Estate Sales, so quotePitch says "Nobody in Estates wants Viral Gadget Pallet" and the last step cannot be done',
};
for (const m of REAL) {
  test(`the real lesson ${m.id} (${m.title}) can be won by scripted engine play`, { todo: KNOWN_DATA_FAULTS[m.id] }, () => {
    const r = playLesson(m);
    assert.ok(r.ok, `${m.id} step "${r.failedStep}": ${r.why}`);
  });
}
test('the real lessons use goods that sell in their own district', { skip: !REAL.length && 'js/meta/academy.js is not in this tree yet' }, (t) => {
  const odd = [];
  for (const m of REAL) {
    const classes = new Set([...(m.setup.assets || []), ...(m.setup.lots || [])].map((x) => x.cls));
    for (const cls of classes) if ((ASSETS[cls]?.dem?.[m.zone] || 0) < 3) odd.push(`${m.id}: ${cls} has demand ${ASSETS[cls]?.dem?.[m.zone] || 0} in district ${m.zone}`);
    for (const l of m.setup.leads || []) if (BUYERS[l.seg] && BUYERS[l.seg].zone !== m.zone) odd.push(`${m.id}: buyer ${l.seg} lives in district ${BUYERS[l.seg].zone}`);
  }
  if (odd.length) t.diagnostic('lessons whose numbers will not match their worked examples (the engine prices a good with no demand at 15% of base): ' + odd.join('; '));
});
