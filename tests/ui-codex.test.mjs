// The Codex drawer, rendered with the fake ctx (tests/helpers/ctx.mjs): a fresh Codex, a Codex with many pages unlocked, search, categories, a page in full,
// the "New" chips, the Academy tab and its Replay buttons. Hand-made entries are used so the drawer is held to the schema (docs/V2_DESIGN.md section 12),
// and every real entry in js/meta/codex.js is rendered too when the file is in the tree.
import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { default: drawer, unlockHint, matchesQuery, groupByCategory, academyHTML, entryHTML, resultsHTML, unseenIds, CATEGORIES } = await import('../js/ui/drawers/codex.js');
const { fakeCtx, checkHTML } = await import('./helpers/ctx.mjs');
const { Progress } = await import('../js/meta/progress.js');
const { readAcademy } = await import('../js/ui/academy-sandbox.js');
const { kv } = await import('../js/session.js');

// ---------------------------------------------------------------- hand-made pages
const E = (id, category, unlock, extra = {}) => ({
  id, title: 'Title of ' + id, icon: '🎯', category, summary: `Summary of ${id} in one line.`,
  body: [`First paragraph about ${id}.`, `Second paragraph about ${id}, with a number: 0.4 + 0.95 x fit.`], formula: id === 'margin' ? 'margin = (price - cost) / price' : undefined,
  example: { setup: `Setup for ${id}.`, steps: ['Step one.', 'Step two.'], result: `Result for ${id}.` }, mistakes: ['A first mistake.', 'A second mistake.'], tryIt: `Try ${id} in the game.`, related: [], unlock, ...extra,
});
const DEFS = [
  E('fair-market-value', 'Value', 'start', { zone: 1, related: ['margin', 'persona-fit', 'tariffs'] }),
  E('margin', 'Value', 'start'),
  E('persona-fit', 'Markets', { event: 'pitch', match: { outcome: 'win' } }, { related: ['fair-market-value'] }),
  E('negotiation', 'People', { event: 'zone', match: { id: 4 } }, { zone: 2 }),
  E('debt-to-equity', 'Finance', { event: 'draw' }),
  E('tariffs', 'Operations', { event: 'milestone', match: { n: 2 } }),
  E('risk-of-ruin', 'Risk', { event: 'margin-call' }),
  E('exit-valuation', 'Strategy', { event: 'exit' }, { summary: 'What <b>a company</b> is worth & why' }),
];
const MISSIONS = [
  { id: 'm01', title: 'First Swap', icon: '📎', zone: 1, concept: 'fair-market-value', minutes: 2 },
  { id: 'm02', title: 'Read the Room', icon: '🔍', zone: 4, concept: 'persona-fit', minutes: 3 },
  { id: 'm03', title: 'Know Your Buyer', icon: '🎯', zone: 3, concept: 'nope', minutes: 2 },
];
const progressOf = (defs, cx) => ({ m: { cx }, codexList: () => defs.map((d) => ({ def: d, unlocked: cx[d.id] != null })), codexUnlocked: (id) => cx[id] != null, unlockCodex(id, day = 5) { if (cx[id] != null) return false; cx[id] = day; return true; } });
function ctxOf(cx, { defs = DEFS, drawerOpen = true } = {}) {
  mem.clear();
  const ctx = fakeCtx({ days: 0 });
  ctx.progress = progressOf(defs, cx);
  ctx.U.drawer = drawerOpen ? 'codex' : null;
  ctx.hooks = { replays: [], onAcademy(id) { this.replays.push(id); } };
  return ctx;
}
const START = { 'fair-market-value': 0, margin: 0 };
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');

// ---------------------------------------------------------------- the drawer's identity
test('the drawer follows the contract in shell.js', () => {
  assert.equal(drawer.id, 'codex'); assert.equal(drawer.icon, '📖'); assert.equal(drawer.label, 'Codex'); assert.equal(drawer.visible(), true);
  for (const f of ['badge', 'html', 'acts']) assert.equal(typeof drawer[f], 'function', f);
  const acts = drawer.acts(ctxOf(START));
  for (const [name, fn] of Object.entries(acts)) { assert.match(name, /^codex-/, 'every action is named codex-...'); assert.equal(typeof fn, 'function'); }
  assert.deepEqual(Object.keys(acts).sort(), ['codex-back', 'codex-cat', 'codex-open', 'codex-replay', 'codex-search', 'codex-tab']);
});

// ---------------------------------------------------------------- a fresh Codex
test('a fresh Codex: the starting pages are open, the rest are silhouettes that say how to unlock them', () => {
  const ctx = ctxOf(START), html = drawer.html(ctx);
  assert.deepEqual(checkHTML(html, 'fresh'), []);
  assert.match(html, /2 of 8 unlocked/);
  assert.equal((html.match(/data-act="codex-open"/g) || []).length, 2, 'two openable pages');
  assert.equal((html.match(/class="cx-card locked"/g) || []).length, 6);
  assert.match(html, /Reach The Scrap Yard|Reach Pawn District/, 'a district to reach, named');
  assert.match(html, /Reach Pawn District/); assert.match(html, /Win a pitch/); assert.match(html, /Take out a loan/); assert.match(html, /Reach Milestone 2 \(\$25,000 net worth\)/);
  assert.match(html, /Survive a margin call/); assert.match(html, /Exit your company/);
  for (const d of DEFS.filter((x) => x.unlock !== 'start')) assert.ok(!html.includes(d.title), `${d.id}: a locked page does not give away its title`);
  for (const d of DEFS.filter((x) => x.unlock === 'start')) assert.ok(html.includes(d.title) && html.includes(d.summary));
  assert.ok(!/cx-new/.test(html), 'the starting pages are not "new"');
  assert.match(html, /aria-label="Locked concept\. Unlocks when you: Win a pitch"/);
  assert.match(html, /<h3><span>Value<\/span><span class="mono">2 \/ 2<\/span><\/h3>/); assert.match(html, /<h3><span>Markets<\/span><span class="mono">0 \/ 1<\/span><\/h3>/);
  assert.equal(drawer.badge(ctxOf(START, { drawerOpen: false })), null, 'nothing new, no badge');
  assert.match(html, /aria-pressed="true">Concepts/); assert.match(html, /type="search"/); assert.match(html, /<label class="sr" for="cx-q">/);
  assert.ok(!/\bzone\b/i.test(text(html)), 'district, never zone');
});

test('a Codex with no pages at all still draws', () => {
  const ctx = ctxOf({}, { defs: [] }); const html = drawer.html(ctx);
  assert.deepEqual(checkHTML(html, 'empty'), []); assert.match(html, /Nothing here yet/);
  const none = fakeCtx({ days: 0 }); none.progress = null; none.U.drawer = 'codex'; assert.deepEqual(checkHTML(drawer.html(none), 'no progress'), []); assert.equal(drawer.badge(none), null);
});

// ---------------------------------------------------------------- many pages unlocked, and what is new
test('with most pages unlocked they are grouped by category in the Codex order and the new ones say so', () => {
  const cx = { ...START, 'persona-fit': 3, negotiation: 4, 'debt-to-equity': 9, tariffs: 12, 'risk-of-ruin': 20, 'exit-valuation': 31 };
  const ctx = ctxOf(cx), html = drawer.html(ctx);
  assert.deepEqual(checkHTML(html, 'many'), []); assert.match(html, /8 of 8 unlocked/); assert.ok(!/class="cx-card locked"/.test(html));
  const heads = [...html.matchAll(/<h3><span>([A-Za-z]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(heads, CATEGORIES.filter((c) => DEFS.some((d) => d.category === c)), 'Value, Markets, Operations, Finance, Risk, People, Strategy');
  assert.equal((html.match(/cx-new/g) || []).length, 6, 'six pages unlocked by play are new, the two starting pages are not');
  assert.match(html, /What &lt;b&gt;a company&lt;\/b&gt; is worth &amp; why/, 'summaries are text');
  assert.deepEqual(unseenIds(ctx).sort(), []);
});

test('"New" stays while the drawer is open, goes when it is closed, and the dock badge counts what has not been shown', () => {
  const cx = { ...START }, ctx = ctxOf(cx, { drawerOpen: false });
  assert.equal(drawer.badge(ctx), null);
  cx['persona-fit'] = 3; cx.tariffs = 8;                              // unlocked by play while the drawer is shut
  assert.equal(drawer.badge(ctx), 2, 'two new pages: the dock icon says 2');
  ctx.U.drawer = 'codex';
  assert.equal(drawer.badge(ctx), null, 'open: no badge');
  let html = drawer.html(ctx); assert.equal((html.match(/cx-new/g) || []).length, 2);
  cx.negotiation = 9;                                                // another unlocks with the drawer open
  html = drawer.html(ctx); assert.equal((html.match(/cx-new/g) || []).length, 2, 'the chips of this visit do not change underfoot');
  ctx.U.drawer = null; assert.equal(drawer.badge(ctx), 1, 'closed again: the one unlocked meanwhile is waiting');
  ctx.U.drawer = 'codex'; html = drawer.html(ctx); assert.equal((html.match(/cx-new/g) || []).length, 1, 'a new visit shows only what is new since the last');
  ctx.U.drawer = null; assert.equal(drawer.badge(ctx), null);
  assert.deepEqual(JSON.parse(mem.get('pc.codexSeen.main')).sort(), ['negotiation', 'persona-fit', 'tariffs'], 'seen pages are remembered across visits');
  const later = fakeCtx({ days: 0 }); later.progress = progressOf(DEFS, { ...cx }); later.U.drawer = null; assert.equal(drawer.badge(later), null, 'and across sessions: a fresh UI state does not flag them again');
});

// ---------------------------------------------------------------- search and categories
test('search finds unlocked pages by title, summary, category or body, never locked ones', () => {
  const cx = { ...START, 'persona-fit': 3, 'debt-to-equity': 9 }, ctx = ctxOf(cx), acts = drawer.acts(ctx);
  drawer.html(ctx);
  const type = (q) => { ctx.calls.length = 0; acts['codex-search']({ value: q }); return ctx.calls.includes('render'); };
  assert.equal(type('margin'), true, 'with no results box to patch the drawer is drawn again'); assert.equal(ctx.U.codexQ, 'margin');
  let html = drawer.html(ctx); assert.match(html, /Title of margin/); assert.ok(!/Title of persona-fit/.test(html)); assert.match(html, /value="margin"/);
  type('FINANCE'); html = drawer.html(ctx); assert.match(html, /Title of debt-to-equity/); assert.ok(!/Title of margin/.test(html), 'category match, any case');
  type('second paragraph about persona'); html = drawer.html(ctx); assert.match(html, /Title of persona-fit/); assert.ok(!/Title of debt/.test(html), 'body text is searched');
  type('negotiation'); html = drawer.html(ctx); assert.match(html, /Nothing unlocked matches/); assert.match(html, /Locked pages are not searched/); assert.ok(!/class="cx-card/.test(html), 'a locked page cannot be found by its name');
  type('<script>alert(1)</script>'); html = drawer.html(ctx); assert.ok(!/<script>/.test(html)); assert.deepEqual(checkHTML(html, 'xss'), []);
  type('  '); html = drawer.html(ctx); assert.match(html, /Title of margin/);
  // typing patches the list in place (and leaves the box the person is typing in alone)
  const box = { innerHTML: '' }, inp = { value: 'fair', closest: () => ({ querySelector: (sel) => (sel === '[data-cx-results]' ? box : null) }) };
  ctx.calls.length = 0; acts['codex-search'](inp);
  assert.match(box.innerHTML, /Title of fair-market-value/); assert.ok(!/Title of margin/.test(box.innerHTML)); assert.ok(!ctx.calls.includes('render'), 'no redraw: the search box keeps its focus');
  assert.ok(matchesQuery(DEFS[0], 'fair market') && !matchesQuery(DEFS[0], 'fair xyz') && matchesQuery(DEFS[0], ''));
});

test('a category filter narrows the list and the search works inside it', () => {
  const ctx = ctxOf({ ...START, 'persona-fit': 3 }), acts = drawer.acts(ctx);
  let html = drawer.html(ctx);
  assert.equal((html.match(/data-act="codex-cat"/g) || []).length, 1 + new Set(DEFS.map((d) => d.category)).size);
  acts['codex-cat']({ dataset: { cat: 'Markets' } }); html = drawer.html(ctx);
  assert.match(html, /Title of persona-fit/); assert.ok(!/Title of margin/.test(html)); assert.match(html, /data-cat="Markets" aria-pressed="true"/);
  acts['codex-cat']({ dataset: { cat: '' } }); html = drawer.html(ctx); assert.match(html, /Title of margin/); assert.match(html, /data-cat="" aria-pressed="true"/);
  assert.deepEqual(groupByCategory([{ def: { category: 'Risk' } }, { def: { category: 'Mystery' } }, { def: { category: 'Value' } }]).map((g) => g.category), ['Value', 'Risk', 'Strategy'], 'an unknown category goes last, not missing');
});

// ---------------------------------------------------------------- one page in full
test('a page opens in full: body, formula, worked example, mistakes, Try it, related links; Back returns to the list', () => {
  const ctx = ctxOf({ ...START, 'persona-fit': 3 }), acts = drawer.acts(ctx);
  acts['codex-open']({ dataset: { id: 'fair-market-value' } });
  assert.ok(ctx.calls.includes('render')); assert.equal(ctx.U.codexOpenId, 'fair-market-value');
  const html = drawer.html(ctx);
  assert.deepEqual(checkHTML(html, 'page'), []);
  assert.match(html, /<h3 id="cx-t" tabindex="-1">Title of fair-market-value/); assert.match(html, /The Scrap Yard/); assert.match(html, />Value</);
  assert.match(html, /First paragraph about fair-market-value/); assert.match(html, /Second paragraph/);
  assert.ok(!/class="cx-formula/.test(html), 'no formula, no formula block');
  assert.match(html, /Worked example/); assert.match(html, /<ol><li>Step one\.<\/li><li>Step two\.<\/li><\/ol>/); assert.match(html, /Result:<\/b> Result for fair-market-value/);
  assert.match(html, /Common mistakes/); assert.match(html, /A second mistake/); assert.match(html, /<h4>Try it<\/h4><p>Try fair-market-value in the game/);
  assert.match(html, /data-act="codex-open" data-id="margin"/, 'an unlocked neighbour is a link');
  assert.match(html, /data-id="persona-fit"/); assert.match(html, /Locked: Keep playing|Locked: Milestone|Locked: Reach Milestone 2/, 'a locked neighbour says how to unlock it'); assert.ok(!/Title of tariffs/.test(html), 'and does not give away its title');
  assert.match(html, /data-act="codex-back"/);
  acts['codex-open']({ dataset: { id: 'margin' } });
  const m = drawer.html(ctx); assert.match(m, /class="cx-formula mono" aria-label="Formula">margin = \(price - cost\) \/ price/);
  acts['codex-back'](); assert.equal(ctx.U.codexOpenId, null); assert.match(drawer.html(ctx), /2 of 8|3 of 8/);
  ctx.U.codexOpenId = 'negotiation'; const locked = drawer.html(ctx); assert.match(locked, /Search the Codex/, 'a page that is still locked cannot be opened by a stale link');
  ctx.U.codexOpenId = 'gone-id'; assert.match(drawer.html(ctx), /Search the Codex/);
});

test('every page of the schema draws cleanly even when its optional parts are missing', () => {
  const bare = { id: 'bare', title: 'Bare', icon: '📘', category: 'Value', summary: 's', body: ['b'], unlock: 'start' };
  const ctx = ctxOf({ bare: 0 }, { defs: [bare] });
  const html = entryHTML(ctx, bare); assert.deepEqual(checkHTML(html, 'bare'), []); assert.ok(!/Worked example|Common mistakes|Try it|Related|Formula/.test(html));
  const hostile = { ...bare, id: 'h', title: '<b>"x"</b>', summary: '<i>', body: ['<u>'], formula: '<s>', example: { setup: '<q>', steps: ['<r>'], result: '<t>' }, mistakes: ['<v>'], tryIt: '<w>' };
  const h = entryHTML(ctx, hostile); assert.ok(!/<(b|i|u|s|q|r|t|v|w)>/.test(h.replace(/<\/?(b|ol|li|ul|p|pre|h4|section|span|div|header|button)[^>]*>/g, ''))); assert.deepEqual(checkHTML(h, 'hostile'), []);
});

// ---------------------------------------------------------------- the Academy tab
test('the Academy tab lists the lessons with Play or Replay, what they teach, and a way to carry on', () => {
  mem.clear();
  const ctx = ctxOf({ ...START, 'persona-fit': 3 }), acts = drawer.acts(ctx);
  acts['codex-tab']({ dataset: { tab: 'academy' } });
  assert.equal(ctx.U.codexTab, 'academy');
  const none = academyHTML(ctx, { done: [], skipped: [], finished: false }, MISSIONS);
  assert.deepEqual(checkHTML(none, 'academy'), []);
  assert.match(none, /0 of 3 lessons done/); assert.equal((none.match(/data-act="codex-replay"/g) || []).length, 4, 'three lessons and Continue');
  assert.match(none, /Continue with lesson 1/); assert.match(none, /Play<\/button>/); assert.match(none, /1\. First Swap/); assert.match(none, /The Scrap Yard &middot; about 2 min &middot; teaches Title of fair-market-value/);
  assert.match(none, /3\. Know Your Buyer/); assert.ok(!/teaches Title of nope/.test(none), 'a concept the Codex does not have is not named');
  const part = academyHTML(ctx, { done: ['m01'], skipped: ['m02'], finished: false }, MISSIONS);
  assert.match(part, /1 of 3 lessons done/); assert.match(part, /chip good">Done/); assert.match(part, /chip warn">Skipped/); assert.match(part, /Replay<\/button>/); assert.match(part, /Continue with lesson 3/);
  const all = academyHTML(ctx, { done: ['m01', 'm02', 'm03'], skipped: [], finished: true }, MISSIONS);
  assert.ok(!/Continue with/.test(all)); assert.equal((all.match(/Replay<\/button>/g) || []).length, 3);
  assert.match(academyHTML(ctx, { done: [], skipped: [] }, []), /not in this build yet/);
  assert.match(part, /aria-label="Replay lesson 1: First Swap"/);
  assert.match(drawer.html(ctx), /aria-pressed="true">Academy/);
  acts['codex-replay']({ dataset: { id: 'm02' } }); acts['codex-replay']({ dataset: { id: '' } });
  assert.deepEqual(ctx.hooks.replays, ['m02', undefined], 'Replay asks main.js to play that lesson; Continue asks it to resume');
  const bare = fakeCtx({ days: 0 }); bare.progress = progressOf(DEFS, START); drawer.acts(bare)['codex-replay']({ dataset: { id: 'm01' } });
  assert.match(bare.toasts[0][0], /menu/i, 'with no Academy hook the player is told where to go');
  acts['codex-tab']({ dataset: { tab: 'concepts' } }); assert.equal(ctx.U.codexTab, 'concepts');
});

test('the Academy tab reads the saved lessons through the session store', () => {
  mem.clear(); mem.set('pc.academy.main', JSON.stringify(['m01'])); mem.set('pc.academySkipped.main', JSON.stringify(['m02']));
  assert.deepEqual(readAcademy(kv), { done: ['m01'], skipped: ['m02'], finished: false });
});

// ---------------------------------------------------------------- how a locked page says to unlock it
test('unlock hints say what to do in the player\'s words', () => {
  const H = unlockHint;
  assert.equal(H('start'), ''); assert.equal(H(undefined), 'Keep playing'); assert.equal(H({}), 'Keep playing'); assert.equal(H({ event: 'unheard-of' }), 'Keep playing');
  assert.equal(H({ event: 'zone', match: { id: 4 } }), 'Reach Pawn District'); assert.equal(H({ event: 'zone', match: { id: 2 } }), 'Reach Flea Market Row'); assert.equal(H({ event: 'zone' }), 'Open a new district'); assert.equal(H({ event: 'zone', match: { id: 99 } }), 'Open a new district');
  assert.equal(H({ event: 'milestone', match: { n: 1 } }), 'Reach Milestone 1 ($1,000 net worth)'); assert.equal(H({ event: 'milestone', match: { n: { gte: 3 } } }), 'Reach Milestone 3 ($250,000 net worth)');
  assert.equal(H({ event: 'pitch', match: { outcome: 'pioneer' } }), 'Make a pioneer pitch (a niche few others use)'); assert.equal(H({ event: 'pitch', match: { outcome: 'herd' } }), 'Pitch into a crowded niche'); assert.equal(H({ event: 'pitch' }), 'Sell something to a buyer');
  assert.match(H({ event: 'pitch', match: { outcome: 'win', cls: 'paperclip' } }), /^Win a pitch with an? .*[Pp]aperclip/i);
  assert.equal(H({ event: 'buy', match: { fake: true } }), 'Buy a counterfeit lot (it happens to everyone)'); assert.equal(H({ event: 'buy', match: { cond: 'broken' } }), 'Buy a broken lot');
  assert.equal(H({ event: 'shock', match: { kind: 'tiktok' } }), 'Live through The TikTok Arbitrage Surge'); assert.equal(H({ event: 'shock' }), 'Live through a market shock');
  assert.equal(H({ event: 'hire', match: { kind: 'broker' } }), 'Hire an Asset Broker'); assert.equal(H({ event: 'hire' }), 'Hire a manager');
  assert.equal(H({ event: 'draw', match: { prod: 'micro' } }), 'Draw on the Micro-Business Line'); assert.equal(H({ event: 'audit', match: { ok: true } }), 'Pass an audit'); assert.equal(H({ event: 'auction', match: { won: true } }), 'Win an auction');
  assert.equal(H({ event: 'haggle', match: { role: 'buy' } }), 'Haggle a price down when buying'); assert.equal(H({ event: 'haggle', match: { role: 'sell' } }), 'Haggle a price up when selling'); assert.equal(H({ event: 'haggle' }), 'Haggle a deal');
  assert.equal(H({ event: 'streak', match: { n: { gte: 3 } } }), 'Win 3 deals in a row'); assert.equal(H({ event: 'level', match: { level: { gte: 5 } } }), 'Reach level 5'); assert.equal(H({ event: 'cycle', match: { net: { gt: 0 } } }), 'Finish a manager cycle in profit');
  assert.equal(H({ event: 'client', match: { tier: 'corp' } }), 'Sign a Corporate Account'); assert.match(H({ event: 'upgrade', match: { id: 'jit' } }), /^Install /);
  assert.ok(!/\bzone\b/i.test(['zone', 'milestone', 'pitch', 'shock', 'hire'].map((event) => H({ event, match: {} })).join(' ')), 'district, never zone');
});

// ---------------------------------------------------------------- the real pages and the real tracker
let REAL = [];
try { ({ CODEX: REAL } = await import('../js/meta/codex.js')); } catch { /* not merged yet */ }
test('every real Codex page draws as a page, as a card and as a silhouette, with a hint that says something', { skip: !REAL.length && 'js/meta/codex.js is not in this tree yet' }, (t) => {
  const cx = Object.fromEntries(REAL.map((d) => [d.id, 7]));
  const open = ctxOf(cx, { defs: REAL }), shut = ctxOf({}, { defs: REAL }), said = [];
  assert.deepEqual(checkHTML(drawer.html(open), 'all open'), []); assert.deepEqual(checkHTML(drawer.html(shut), 'all shut'), []);
  assert.equal((drawer.html(shut).match(/class="cx-card locked"/g) || []).length, REAL.length);
  for (const d of REAL) {
    const page = entryHTML(open, d);
    assert.deepEqual(checkHTML(page, d.id), []);
    assert.match(page, /Worked example/); assert.match(page, /Try it/);
    if (/\bzone\b/i.test(text(page))) said.push(d.id);
    const hint = unlockHint(d.unlock);
    if (d.unlock !== 'start') { assert.ok(hint && hint !== 'Keep playing', `${d.id}: a hint that says something for ${JSON.stringify(d.unlock)}`); assert.ok(!/\bzone\b/i.test(hint), `${d.id}: hint says zone`); }
    for (const rel of d.related) assert.ok(REAL.some((x) => x.id === rel), `${d.id}: related ${rel} exists`);
  }
  assert.ok(CATEGORIES.every((c) => REAL.some((d) => d.category === c)), 'every category has pages');
  if (said.length) t.diagnostic('pages whose own words say "zone" (the drawer shows them as written; the game says district): ' + said.join(', '));
});

test('the drawer works on the real Progress tracker of a real game', { skip: !REAL.length && 'js/meta/codex.js is not in this tree yet' }, () => {
  mem.clear();
  const ctx = fakeCtx({ days: 0 }); ctx.progress = new Progress(ctx.g()); ctx.U.drawer = 'codex';
  const start = REAL.filter((d) => d.unlock === 'start').length;
  let html = drawer.html(ctx); assert.deepEqual(checkHTML(html, 'real fresh'), []); assert.match(html, new RegExp(`${start} of ${REAL.length} unlocked`)); assert.ok(!/cx-new/.test(html));
  ctx.U.drawer = null; assert.equal(drawer.badge(ctx), null);
  const later = REAL.find((d) => d.unlock !== 'start');
  ctx.progress.unlockCodex(later.id, 3);                              // the Academy (or play) unlocks a page
  assert.equal(drawer.badge(ctx), 1);
  ctx.U.drawer = 'codex'; html = drawer.html(ctx); assert.equal((html.match(/cx-new/g) || []).length, 1); assert.match(html, new RegExp(`${start + 1} of ${REAL.length} unlocked`));
  assert.ok(html.includes(later.title));
});
