// The Academy runner's three screen-side faults, held in Node against the real engine, the real Deal Room glue and the real lessons (js/meta/academy.js):
//   A1  a lesson can be spent (one paperclip, one counterfeit, a manager the wallet cannot feed, a shock used early): the runner asks stillPossible() after every game event and
//       shows Restart at once (newLookout, strandedFor, strandedHTML);
//   A2  the Market card's Quick buy is a Quick deal: it goes through the Deal Room, so a lesson hears inspect, haggle or auction, then buy from either route;
//   A3  the hire dialog opens on the Broker and the coach card could not follow the player into it: anchors on the manager cards and the Hire button, and a coach that points at them.
// The browser half (the card hopping into the dialog, the Restart card, the real clicks) is walked in headless Chrome: see the notes in the commit. Run: node --test tests/academy-ui.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null };

const A = await import('../js/ui/academy-sandbox.js');
const D = await import('../js/ui/academy.js');
const { ACADEMY } = await import('../js/meta/academy.js');
const { startRun } = await import('../js/deal.js');
const { PIPE } = await import('../js/config.js');
const { fakeCtx, checkHTML } = await import('./helpers/ctx.mjs');
const { default: crew } = await import('../js/ui/drawers/crew.js');
const { default: market } = await import('../js/ui/drawers/market.js');
const { openDeal } = await import('../js/ui/deal.js');

const M = (id) => ACADEMY.find((m) => m.id === id);
const sandbox = (m) => A.makeSandboxSession(m.setup, { id: m.id, zone: m.zone }).game;
const at = (m, stepId) => m.steps.findIndex((s) => s.id === stepId);
const idOf = (g, cls) => g.s.assets.find((a) => a.cls === cls).id;
/** Plays a whole deal in the Deal Room at average skill, the way the room's Quick deal button does, and lets the engine hear it. */
const quickSell = (g, assetId, leadId) => { const r = startRun(g, { kind: 'sell', assetId, leadId }); assert.ok(r.ok !== false, r.msg); r.quickAll(); return r.finish(); };
const quickBuy = (g, zone, lotId) => { const r = startRun(g, { kind: 'buy', zone, lotId }); assert.ok(r.ok !== false, r.msg); r.quickAll(); return r.finish(); };

/** The runner in miniature: the engine's events go to the lesson's steps and to the lookout; after an action, the lookout looks (what academy.js does from a microtask). */
function lesson(id) {
  const m = M(id), g = sandbox(m), lookout = A.newLookout(m, g), seen = [];
  let run = A.startRun(m);
  g.onEvent = (evt) => { seen.push(evt); lookout.note(evt); const r = A.feedRun(m, run, evt); run = r.run; };
  const c = { m, g, seen, lookout, get i() { return run.i; }, get won() { return run.won; }, feed(evt) { const r = A.feedRun(m, run, evt); run = r.run; }, look() { return lookout.look(run); } };
  return c;
}

// ------------------------------------------------------------------ A1: the lookout
test('A1: every real lesson starts winnable, from its first step and from each step after it', () => {
  for (const m of ACADEMY) for (let i = 0; i <= m.steps.length; i++) assert.equal(A.stillPossible(m, sandbox(m), i), true, `${m.id} from step ${i}`);
});

test('A1 m01: the one clip sold to the wrong buyer closes the lesson at once, and a sale to Wen does not', () => {
  for (const buyer of ['yard-mechanic', 'cafe-barista']) {
    const c = lesson('m01'); assert.equal(c.look().changed, false, 'the start is fine');
    quickSell(c.g, idOf(c.g, 'paperclip'), buyer);
    const r = c.look();
    assert.equal(r.changed, true, `${buyer}: the lookout speaks the moment the sale is over`); assert.equal(r.stranded.say, 'That sale closed the lesson early.');
    assert.equal(c.won, false); assert.equal(c.look().changed, false, 'and says it once');
  }
  const wen = lesson('m01'); wen.feed({ type: 'click', anchor: 'hud-cash' });
  wen.feed({ type: 'ui', ui: 'open-drawer', id: 'stock' }); wen.feed({ type: 'ui', ui: 'open-drawer', id: 'market' });
  quickSell(wen.g, idOf(wen.g, 'paperclip'), 'sim-student');
  assert.equal(wen.won, true, 'Wen is the sale the lesson wants'); assert.equal(wen.look().stranded, null);
  // walking away from Wen keeps the clip
  const walk = lesson('m01'), run = startRun(walk.g, { kind: 'sell', assetId: idOf(walk.g, 'paperclip'), leadId: 'sim-student' }); run.walkAway();
  assert.equal(walk.look().changed, false, 'a deal walked away from spends nothing');
  // Wen paid BEFORE the steps began: what he paid in cannot fetch a dollar from anyone left
  const early = lesson('m01'); quickSell(early.g, idOf(early.g, 'paperclip'), 'sim-student');
  assert.equal(A.stillPossible(early.m, early.g, 0), false, 'no dollar is left to earn');
});

test('A1 m02: the fake bought blind, or both genuine lots bought, close the lesson; the Quick deal route keeps it open', () => {
  { const c = lesson('m02'); c.g.buyLot(4, 'first-watch'); const r = c.look(); assert.equal(r.changed, true, 'the only counterfeit bought from the card of old'); assert.equal(r.stranded.say, 'That purchase closed the lesson early.'); }
  { const c = lesson('m02'); c.feed({ type: 'ui', ui: 'open-drawer', id: 'codex' }); c.feed({ type: 'ui', ui: 'open-drawer', id: 'market' });
    quickBuy(c.g, 4, 'second-watch'); assert.equal(c.look().changed, false, 'one genuine lot bought: the baseball is genuine too');
    quickBuy(c.g, 4, 'signed-ball'); assert.equal(c.look().changed, true, 'both genuine lots bought at the step that asks for the fake'); assert.equal(c.i, 2, 'and the lesson is still on the fake'); }
  // the route a player has now: Quick buy opens the Deal Room, whose Quick deal reads the lot first, so the fake's read is HEARD and the lesson goes on
  { const c = lesson('m02'); c.feed({ type: 'ui', ui: 'open-drawer', id: 'codex' }); c.feed({ type: 'ui', ui: 'open-drawer', id: 'market' });
    quickBuy(c.g, 4, 'first-watch');
    assert.deepEqual(c.seen.map((e) => e.type).filter((t) => ['inspect', 'haggle', 'auction', 'buy'].includes(t)), ['inspect', 'buy', 'haggle'], 'a Quick buy sends what a hand-played purchase sends (the haggle counts once the purchase has gone through: js/deal.js finish)');
    assert.equal(c.i, 3, 'the read of the counterfeit finished its step'); assert.equal(c.look().changed, false, 'and the lesson is not stranded');
    quickBuy(c.g, 4, 'second-watch'); assert.equal(c.won, true, 'a Quick buy of the genuine watch wins it'); }
});

test('A1 m06: a Broker the wallet cannot feed closes the lesson at once; the Student, and a Broker lowered to what the wallet can fund, do not', () => {
  const lane = { cls: 'laptops', buyer: 'trainer' };
  { const c = lesson('m06'); for (const [t, id] of [['click', 'hud-cash'], ['ui', 'crew']]) c.feed(t === 'click' ? { type: 'click', anchor: id } : { type: 'ui', ui: 'open-drawer', id });
    assert.equal(c.i, 2, 'on the hire step'); assert.equal(c.look().changed, false);
    assert.ok(c.g.hirePipeline('broker', 5, lane).ok); assert.equal(c.i, 3, 'the hire was heard');
    const r = c.look(); assert.equal(r.changed, true, 'a starved pipe with zero cycles is a closed lesson'); assert.match(r.stranded.say, /^That hire closed the lesson early/); assert.equal(c.won, false); }
  { const c = lesson('m06'); assert.ok(c.g.hirePipeline('student', 5, lane).ok); assert.equal(c.look().changed, false, 'the Student is fed ($500 left against $450)'); }
  { const c = lesson('m06'); assert.ok(c.g.hirePipeline('broker', 5, { ...lane, alloc: 20 }).ok); assert.equal(c.look().changed, false, 'a Broker working with the $20 it can fund still starts a cycle'); }
  { const c = lesson('m06'); c.g.s.cash = 300; assert.equal(c.look().changed, true, 'a wallet that cannot pay the Student and feed it'); }
});

test('A1: the other lessons close on their own mistakes (the shock spent early, the van sold broken, the last lot gone) and a clean lesson never does', () => {
  { const c = lesson('m03'); quickSell(c.g, c.g.s.assets[0].id, 'dorm-ra'); quickSell(c.g, c.g.s.assets[0].id, 'thrift-flipper'); assert.equal(c.look().changed, true, 'both pin sets gone'); }
  { const c = lesson('m05'); quickSell(c.g, idOf(c.g, 'van'), 'fleet-buyer'); assert.equal(c.look().changed, true, 'the van went broken'); }
  { const c = lesson('m07'); c.g.advanceTo(8); const r = c.look(); assert.equal(r.changed, true, 'the glut fired before the player reached it'); assert.equal(r.stranded.say, 'The clock ran past the moment this lesson needed.'); }
  { const c = lesson('m07'); c.g.advanceTo(3); assert.equal(c.look().changed, false, 'three hours of clock spend nothing'); }
  { const c = lesson('m08'); quickSell(c.g, c.g.s.assets[0].id, 'popup-stall'); quickSell(c.g, c.g.s.assets[0].id, 'trend-boutique'); assert.equal(c.look().changed, true, 'both sneaker lots sold'); }
  { const c = lesson('m10'); for (const id of ['estate-lot-a', 'estate-lot-d']) { const r = startRun(c.g, { kind: 'buy', zone: 6, lotId: id }); r.quickAll(); r.finish(); } assert.equal(c.look().changed, false, 'Quick wins a lot, the lesson goes on'); }
});

test('A1: the lookout clears when the lesson is possible again, keeps its first word while it is not, and never throws on a broken sandbox', () => {
  const c = lesson('m06'); c.g.s.cash = 300; assert.equal(c.look().changed, true); const first = c.lookout.stranded;
  c.g.advanceTo(c.g.s.hour + 1); assert.equal(c.look().changed, false); assert.equal(c.lookout.stranded, first, 'the first word is kept');
  c.g.s.cash = 620; const r = c.look(); assert.equal(r.changed, true); assert.equal(r.stranded, null, 'a wallet that can feed the Student again');
  assert.equal(A.stillPossible(M('m01'), {}, 0), true, 'a sandbox the check cannot read is not a reason to take a lesson away');
  assert.equal(A.stillPossible({ steps: [] }, sandbox(M('m01')), 0), true, 'a lesson with no win and no steps');
});

test('A1: the card names what happened by the last thing the player did, and an engine event of its own is not that', () => {
  const say = (...t) => A.strandedFor(t.map((type) => ({ type }))).say;
  assert.equal(say('pitch'), 'That sale closed the lesson early.'); assert.equal(say('buy'), 'That purchase closed the lesson early.'); assert.equal(say('sell-pool'), 'That sale to the pool closed the lesson early.');
  assert.match(say('hire'), /manager has no cash left to start a cycle/); assert.equal(say('repair'), 'That repair closed the lesson early.'); assert.equal(say('auction'), 'That auction closed the lesson early.');
  assert.equal(say('shock'), 'The clock ran past the moment this lesson needed.');
  assert.equal(say('pitch', 'level'), 'That sale closed the lesson early.', 'a level-up after the sale is not what closed the lesson');
  assert.equal(say('inspect', 'haggle', 'buy', 'zone'), 'That purchase closed the lesson early.');
  assert.equal(A.strandedFor([]).say, 'The lesson cannot be finished from here.'); assert.equal(A.strandedFor(null).say, 'The lesson cannot be finished from here.'); assert.equal(A.strandedFor({ type: 'constructor' }).say, 'The lesson cannot be finished from here.', 'an event type is looked up as an own key');
  assert.match(A.strandedFor([]).hint, /Restart/);
});

test('A1: the closed-early card is clean, escapes what it says, and has Restart as its one primary button', () => {
  const html = D.strandedHTML(A.strandedFor([{ type: 'pitch' }]), { title: 'First Swap' });
  assert.deepEqual(checkHTML(html, 'stranded card'), []);
  assert.match(html, /First Swap &middot; Closed early/); assert.match(html, /That sale closed the lesson early\./);
  assert.match(html, /<button class="btn sm" data-act="ac-restart"[^>]*>Restart<\/button>/, 'Restart is the primary button (not ghost)');
  assert.match(html, /<button class="btn sm ghost" data-act="ac-skip">Skip lesson<\/button>/, 'Skip stays one press away');
  assert.equal((html.match(/class="btn sm"(?! ghost)/g) || []).length, 1, 'exactly one primary button');
  assert.ok(!/Hint:|ac-continue|ac-showme/.test(html), 'no coach controls on a lesson that cannot go on');
  const evil = D.strandedHTML({ say: '<evil1>', hint: '<evil2>' }, { title: '<evil3>' });
  assert.ok(!/<evil/.test(evil)); for (const i of [1, 2, 3]) assert.ok(evil.includes(`&lt;evil${i}&gt;`));
});

test('A1: the runner asks after every event, when a step begins and once a second, and Restart rebuilds the sandbox', () => {
  const src = readFileSync(new URL('../js/ui/academy.js', import.meta.url), 'utf8');
  assert.match(src, /off\.push\(ctx\.on\(\(evt\) => \{ lookout\.note\(evt\); soon\(\); \}\)\)/, 'every game event is noted and a look is asked for');
  assert.match(src, /Promise\.resolve\(\)\.then\(\(\) => \{ checkQ = false; check\(\); \}\)/, 'the look waits for the action that sent the events to be over');
  assert.match(src, /setTimeout\(\(\) => \{ if \(!dead && !gone\) ctx\.render\(\); \}, 0\);[\s\S]{0,160}soon\(\);/, 'and a step that begins asks too');
  assert.match(src, /\+\+beats % 5 === 0\) check\(\)/, 'and the heartbeat asks once a second');
  assert.match(src, /'ac-restart'\(\) \{ dlg\.close\(\); play\(idx\); \}/, 'Restart plays the lesson again from its setup (a new sandbox, never the real save)');
  assert.match(src, /c\.stranded && !confirm \? strandedHTML\(c/, 'the closed-early card replaces the coach card');
  assert.ok(!/S\.save|kv\.set/.test(src.slice(src.indexOf('function check()'), src.indexOf('function soon()'))), 'looking never writes anything');
});

// ------------------------------------------------------------------ A2: Quick buy is a Quick deal
test('A2: the Market card buys through the Deal Room (the same spec as Look it over) and never calls the engine itself', () => {
  const src = readFileSync(new URL('../js/ui/drawers/market.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('.buyLot('), 'no direct purchase left in the drawer');
  const ctx = fakeCtx({ days: 10, perks: ['native', 'grad'] }), g = ctx.g(), acts = market.acts(ctx);
  ctx.U.zone = 2; ctx.U.marketTab = 'lots'; g.s.cash = 1e6;
  const lot = g.s.lots[2][0];
  acts['market-look']({ dataset: { lot: lot.id } }); const look = ctx.calls.at(-1);
  acts['market-buy']({ dataset: { lot: lot.id } });
  assert.deepEqual(ctx.calls.at(-1), look, 'one deal, two buttons');
});

test('A2: a Quick buy of every kind of lot sends the engine what a hand-played purchase sends, and a lesson hears it', () => {
  // fixed lots: inspect, buy, haggle (the haggle counts once the purchase has gone through); auctions: inspect, auction and buy in js/deal.js's order (no buy when a rival wins)
  for (const [id, lotId, zone, kind] of [['m02', 'second-watch', 4, 'haggle'], ['m07', 'bargain-b', 5, 'haggle'], ['m10', 'estate-lot-d', 6, 'auction']]) {
    const c = lesson(id); const r = startRun(c.g, { kind: 'buy', zone, lotId }); r.quickAll(); r.finish();
    const heard = c.seen.map((e) => e.type).filter((t) => ['inspect', 'haggle', 'auction', 'buy'].includes(t));
    assert.equal(heard[0], 'inspect', `${id}: the read comes first: ${heard}`);
    assert.ok(heard.includes(kind), `${id}: the ${kind} is heard: ${heard}`);
    assert.ok(heard.length === 3 ? heard.includes('buy') : kind === 'auction', `${id}: and the buy (a lost auction sends none): ${heard}`);
  }
  // end to end through the Market drawer, the real Deal Room in the fake dialog, on the lesson's own sandbox
  const c = lesson('m02'), ctx = fakeCtx({ days: 0 }); ctx.g = () => c.g; ctx.S.game = c.g; ctx.U.zone = 4; ctx.U.marketTab = 'lots';
  ctx.deal = (spec) => openDeal(ctx, spec);
  c.feed({ type: 'ui', ui: 'open-drawer', id: 'codex' }); c.feed({ type: 'ui', ui: 'open-drawer', id: 'market' });
  market.acts(ctx)['market-buy']({ dataset: { lot: 'first-watch' } });
  assert.equal(c.i, 3, 'the card\'s Quick buy of the counterfeit read it, which is what step 3 waits for');
  market.acts(ctx)['market-buy']({ dataset: { lot: 'second-watch' } });
  assert.equal(c.won, true, 'and its Quick buy of the genuine watch wins the lesson');
});

// ------------------------------------------------------------------ A3: the hire dialog
const hireHTML = (cash, zone = 5) => {
  const ctx = fakeCtx({ days: 10, perks: ['trades', 'pro'] }); ctx.g().s.cash = cash; ctx.g().s.zones.includes(zone) || ctx.g().s.zones.push(zone);
  crew.acts(ctx)['crew-hire']({ dataset: { d: String(zone) } });
  return ctx.calls.filter((c) => c[0] === 'dlg').at(-1)?.[1] || '';
};

test('A3: the hire dialog carries an anchor on each manager card and on the Hire button, and on nothing else', () => {
  for (const cash of [620, 5000, 50000]) {
    const html = hireHTML(cash);
    assert.ok(html, `a dialog opened at $${cash}`);
    const found = [...html.matchAll(/data-anchor="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(found.sort(), [...A.HIRE_ANCHORS].sort(), 'one each, and no other');
    for (const k of Object.keys(PIPE)) assert.match(html, new RegExp(`<button class="cr-kind"[^>]*data-k="${k}"[^>]*data-anchor="hire-${k}"`), `the ${k} card`);
    assert.match(html, /data-act="crew-hgo"[^>]*data-anchor="hire-go"/, 'the Hire button');
    assert.deepEqual(checkHTML(html, 'hire dialog'), []);
  }
  for (const a of A.HIRE_ANCHORS) { assert.ok(A.DOM_ANCHORS.includes(a), `${a} is a listed anchor`); assert.equal(A.parseAnchor(a).kind, 'dom'); }
  assert.ok(hireHTML(5000).includes('data-act="crew-hkind"'), 'the dialog is still the one the Crew drawer always opened');
});

test('A3: the hire dialog still opens on the Broker whenever it is affordable (the coach, not the dialog, moves the player off it)', () => {
  const cost = (k) => fakeCtx({ days: 10, perks: ['trades', 'pro'] }).g().pipeCost(k, 5);
  assert.match(hireHTML(cost('broker')), /<button class="cr-kind" aria-pressed="true" data-act="crew-hkind" data-k="broker"/);
  assert.match(hireHTML(cost('student') + 1), /<button class="cr-kind" aria-pressed="true" data-act="crew-hkind" data-k="student"/, 'with only the Student affordable the dialog opens on it');
});

test('A3: inside the dialog the coach points at the manager the wallet can feed, then at the Hire button', () => {
  const m = M('m06'), g = sandbox(m), hire = m.steps[at(m, 'hire')];
  const snap = (kind) => A.hireSnapshot(g, m.zone, kind);
  assert.equal(g.s.cash, 620);
  const s0 = snap('broker'); assert.equal(s0.fed.kind, 'student'); assert.equal(s0.pickedFed, false); assert.deepEqual([s0.picked.fee, s0.fed.fee, s0.fed.cap], [600, 120, 450]);
  const off = A.hireCoach(hire, s0);
  assert.equal(off.anchor, 'hire-student'); assert.match(off.say, /^Pick the Supply-Chain Student\./); assert.ok(off.say.includes('$600') && off.say.includes('$1,000') && off.say.includes('$620'), 'the numbers are the real ones');
  assert.match(off.say, /could never start a cycle/);
  const on = A.hireCoach(hire, snap('student'));
  assert.equal(on.anchor, 'hire-go'); assert.match(on.say, /Press the Hire button/); assert.ok(on.say.includes('$120') && on.say.includes('$450') && on.say.includes('$620'));
  assert.equal(A.hireCoach(hire, snap('logistics')).anchor, 'hire-student', 'the dearest other manager is no better than the Broker at $620: $420 and $700 do not fit');
  // a richer wallet feeds the Broker too: it is then a fine choice, and the coach says Hire
  g.s.cash = 5000; assert.equal(A.hireCoach(hire, snap('broker')).anchor, 'hire-go'); assert.equal(snap('student').fed.kind, 'broker', 'the dearest manager the wallet can feed');
  // a wallet that feeds nobody is a closed lesson (its own card), not a dialog hint
  g.s.cash = 130; assert.equal(A.hireCoach(hire, snap('broker')), null);
  // only a step that waits for the hire gets dialog help, and only with a manager chosen
  const other = m.steps[at(m, 'clock')]; g.s.cash = 620;
  assert.equal(A.hireCoach(other, snap('broker')), null); assert.equal(A.hireCoach(hire, null), null); assert.equal(A.hireCoach(hire, snap(null)), null); assert.equal(A.hireCoach(undefined, snap('broker')), null);
});

test('A3: the runner hops the card into the dialog for a dialog anchor and watches the dialog for a manager picked', () => {
  const src = readFileSync(new URL('../js/ui/academy.js', import.meta.url), 'utf8');
  assert.match(src, /dlg\.el\.open && dlg\.el\.contains\(el\)/, 'a card whose anchor lives in the dialog is carried into it');
  assert.match(src, /hostFor = \(res\) => \(dealOpen\(\) \|\| inDialog\(res\) \? dlg\.el : ctx\.el\.overlay\)/, 'and so is every card while a Deal Room is open, whatever its step points at');
  assert.match(src, /hireCoach\(steps\[run\.i\], hireSnap\(\)\)/); assert.match(src, /\[data-anchor\^="hire-"\]\[aria-pressed="true"\]/, 'the manager picked is read from the dialog itself');
  assert.match(src, /mo\.observe\(dlg\.el, \{ childList: true, subtree: true, attributes: true, attributeFilter: \['open', 'aria-pressed'\] \}\)/, 'a pick repaints the card at once');
  assert.match(src, /const c = coachNow\(\), a = parseAnchor\(c\.anchor\)/, 'Show me points at the control the card names now');
  // the lesson data names no dialog anchor today and keeps the Crew drawer's own: the dialog help is the runner's
  assert.equal(M('m06').steps[at(M('m06'), 'hire')].anchor, 'drawer');
});
