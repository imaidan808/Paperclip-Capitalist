// The districts and the Backgrounds on the screens (Icons part 3, docs/ART_DIRECTION.md 3.6): every place that used to print a district's or a Background's emoji draws its glyph (js/art/g-places.js, found by id through
// js/ui/glyphs.js), in the same place, decorative (aria-hidden: the name beside it stays the name), at the size of its row (16 px) or its card (24 px) or its page header (40 px). The data carries no icon, so a drawing that is missing
// prints nothing at all (no tile, no gap).
// Held here, the data first (one drawing for each of the sixteen districts and the twelve Backgrounds, no icon in the data), then screen by screen: Stock, Market, Travel, Crew and Quests (the drawers), the Deal Room's district chip, the quest cards, the HUD's player card, the Draft (whose drawings load after it opens: the
// first screen holds no glyph set), the debrief and the instructor's dashboard. The world's canvas (the cards of the map) is held in tests/world-places.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const G = await import('../js/ui/glyphs.js');
const { idsOf } = await import('../js/art/glyph.js');
const { ZONES, ZONE_IDS, PERKS, PERK_IDS } = await import('../js/config.js');
const { fakeCtx, checkHTML } = await import('./helpers/ctx.mjs');
const { esc } = await import('../js/ui/common.js');

const svgs = (html) => (html.match(/<svg\b/g) || []).length;
/** Every svg on the page is decorative or named: nothing a screen reader would read as an unnamed picture. */
const decorative = (html) => [...html.matchAll(/<svg\b([^>]*)>/g)].filter((m) => /viewBox="0 0 24 24"/.test(m[1]) && !/ aria-hidden="true"/.test(m[1]) && !/ role="img" aria-label="[^"]+"/.test(m[1])).map((m) => m[0]); // (a glyph: the chart of the debrief is an svg of its own, with its own name)

// ---------------------------------------------------------------------------------------------------- the data
test('the sixteen districts and the twelve Backgrounds have one drawing each, named by what the data names them (zone-<theme>, bg-<id>), told apart, and nothing is drawn that the data does not have', () => {
  const zones = idsOf().filter((id) => id.startsWith('zone-')).sort(), bgs = idsOf().filter((id) => id.startsWith('bg-')).sort();
  assert.deepEqual(zones, ZONE_IDS.map((z) => 'zone-' + ZONES[z].theme).sort(), 'one zone-<theme> for each of the sixteen districts');
  assert.deepEqual(bgs, PERK_IDS.map((p) => 'bg-' + p).sort(), 'one bg-<id> for each of the twelve Backgrounds');
  assert.equal(ZONE_IDS.length, 16); assert.equal(PERK_IDS.length, 12);
  assert.equal(new Set(ZONE_IDS.map((z) => G.zoneGlyph(z))).size, 16); assert.equal(new Set(PERK_IDS.map((p) => G.bgGlyph(p))).size, 12);
  for (const z of ZONE_IDS) assert.ok(!('icon' in ZONES[z]), `${ZONES[z].name}: the data carries no icon, its drawing is found by its theme`);
  for (const p of PERK_IDS) assert.ok(!('icon' in PERKS[p]), `${PERKS[p].name}: the data carries no icon, its drawing is found by its id`);
});


// ---------------------------------------------------------------------------------------------------- the drawers
test('Stock: the strip of the district you are in and the heading of every group of crates carry the district\'s drawing before its name', async () => {
  const { default: stock } = await import('../js/ui/drawers/stock.js');
  const ctx = fakeCtx({ days: 25 }), g = ctx.g(), z = ctx.U.zone, Z = ZONES[z];
  ctx.U.drawer = 'stock';
  const html = stock.html(ctx);
  assert.deepEqual(checkHTML(html, 'stock'), []);
  assert.ok(html.includes(`<b><span aria-hidden="true">${G.zoneGl(z, 'gl-sm')}</span> ${esc(Z.short)}</b>`), 'the strip: the drawing, then the short name');
  const groups = [...html.matchAll(/<h3><span aria-hidden="true">([\s\S]*?)<\/span> ([^<]*)/g)].filter((m) => ZONE_IDS.some((id) => esc(ZONES[id].name) === m[2].trim()));
  assert.ok(groups.length >= 1, 'a group of crates is headed by its district');
  for (const m of groups) { const id = ZONE_IDS.find((i) => esc(ZONES[i].name) === m[2].trim()); assert.equal(m[1], G.zoneGl(id, 'gl-sm'), `${ZONES[id].name}: its own drawing`); }
  assert.deepEqual(decorative(html), []);
  assert.ok(g.s.zones.includes(z));
});

test('Market: the row of district buttons carries each open district\'s drawing before its number (the pressed one too), and the buyers\' header the district\'s drawing at page-header size', async () => {
  const { default: market } = await import('../js/ui/drawers/market.js');
  const ctx = fakeCtx({ days: 25 }), g = ctx.g(), z = ctx.U.zone;
  ctx.U.drawer = 'market';
  const html = market.html(ctx);
  assert.deepEqual(checkHTML(html, 'market'), []);
  for (const id of g.s.zones) assert.ok(html.includes(`<span aria-hidden="true">${G.zoneGl(id, 'gl-sm')}</span><b>${id}</b>`), `district ${id}: its button has the drawing before its number`);
  assert.ok(html.includes(`<span class="mkt-bic" aria-hidden="true">${G.zoneGl(z, 'gl-lg')}</span>`), 'the header: the drawing at 40 px');
  assert.deepEqual(decorative(html), []);
  const css = src('css/ui-market.css');
  assert.match(css, /\.mkt-z\[aria-pressed="true"\] \.gl-c \{[^}]*background: var\(--bg\)/, 'a pressed (gold) button puts the drawing on a dark tile: the drawings are made for dark surfaces');
});

test('Travel: a district card, the "you are in" line, a locked district\'s fold and a destination of the freight planner each carry the district\'s own drawing', async () => {
  const { default: travel } = await import('../js/ui/drawers/travel.js');
  const ctx = fakeCtx({ days: 25 }), g = ctx.g(), open = g.s.zones, here = ctx.U.zone;
  ctx.U.drawer = 'travel';
  const html = travel.html(ctx);
  assert.deepEqual(checkHTML(html, 'travel'), []);
  assert.ok(html.includes(`<span class="tv-ic" aria-hidden="true">${G.zoneGl(here)}</span><div><small>You are in</small>`), 'the "you are in" line');
  for (const id of open) assert.ok(html.includes(`<span class="tv-ic" aria-hidden="true">${G.zoneGl(id)}</span><h4`), `district ${id}: its card has the drawing in its tile`);
  const notOpen = ZONE_IDS.filter((id) => !open.includes(id)), locked = notOpen.slice(1, 3); // (the first of them is the next stop: it has a card, the ones after it a fold)
  assert.ok(notOpen.length >= 3);
  assert.ok(html.includes(`<span class="tv-ic" aria-hidden="true">${G.zoneGl(notOpen[0])}</span><h4`), 'the next stop has its drawing in its tile too');
  for (const id of locked) assert.ok(html.includes(`<span aria-hidden="true">${G.zoneGl(id, 'gl-sm')}</span> <b>${esc(ZONES[id].name)}</b>`), `district ${id} (still locked): the fold names it with its drawing`);
  assert.deepEqual(decorative(html), []);
});

test('Travel: the freight planner names each destination with its drawing', async () => {
  const { default: travel } = await import('../js/ui/drawers/travel.js');
  const ctx = fakeCtx({ days: 25 }), g = ctx.g(), s = g.s;
  const made = ['radio', 'bike'].map((c) => g._mk(s, c, { zone: ctx.U.zone })); s.assets.push(...made); s.cash += 5000; ctx.U.shipIds = made.map((a) => a.id); ctx.U.drawer = 'travel';
  const html = travel.html(ctx), dests = [...html.matchAll(/<span class="tv-dn"><span aria-hidden="true">([\s\S]*?)<\/span> <b>([^<]*)<\/b>/g)];
  assert.ok(dests.length >= 2, 'the planner lists the districts a crate can go to');
  for (const m of dests) { const id = ZONE_IDS.find((i) => esc(ZONES[i].name) === m[2]); assert.ok(id, m[2]); assert.equal(m[1], G.zoneGl(id, 'gl-sm'), `${ZONES[id].name}: its own drawing`); }
});

test('Crew: each district\'s group of managers is headed by the district\'s drawing', async () => {
  const { default: crew } = await import('../js/ui/drawers/crew.js');
  const ctx = fakeCtx({ days: 60 });
  ctx.U.drawer = 'crew'; ctx.U.crew = { tab: 'crew' };
  const html = crew.html(ctx);
  assert.deepEqual(checkHTML(html, 'crew'), []);
  const heads = [...html.matchAll(/<h3 class="cr-dh"><span aria-hidden="true">([\s\S]*?)<\/span> ([^<]*)/g)];
  assert.ok(heads.length >= 1, 'at day 60 a manager is hired somewhere');
  for (const m of heads) { const id = ZONE_IDS.find((i) => esc(ZONES[i].name) === m[2].trim()); assert.ok(id, m[2]); assert.equal(m[1], G.zoneGl(id, 'gl-sm')); }
  assert.deepEqual(decorative(html), []);
});

test('Quests: a quest card names its district with the drawing, and the groups of upcoming and finished quests are headed by it', async () => {
  const { Progress } = await import('../js/meta/progress.js');
  const { run } = await import('./bot.mjs');
  const { default: quests } = await import('../js/ui/drawers/quests.js');
  const ctx = fakeCtx({ days: 0, perks: ['trades', 'pro'] });
  ctx.progress = new Progress(ctx.g()); ctx.g().onEvent = (e) => ctx.progress.onEvent(e); run(ctx.g(), { days: 25 });
  ctx.U.fold = { 'quests.later': true }; ctx.U.quests = { achAll: true, ach: 'all', doneOpen: true }; ctx.U.drawer = 'quests';
  const html = quests.html(ctx), now = ctx.progress.quests().find((v) => v.state === 'active');
  assert.deepEqual(checkHTML(html, 'quests'), []);
  assert.ok(now);
  assert.ok(html.includes(`<small>${G.zoneGl(now.def.zone, 'gl-sm')} ${esc(ZONES[now.def.zone].name)}</small>`), 'a quest card: the district\'s drawing, then its name');
  const heads = [...html.matchAll(/<h4 class="qs-dist"><span aria-hidden="true">([\s\S]*?)<\/span> ([^<]*)/g)];
  assert.ok(heads.length >= 2, 'the finished and the coming-up quests are grouped by district');
  for (const m of heads) { const id = ZONE_IDS.find((i) => esc(ZONES[i].name) === m[2].trim()); assert.ok(id, m[2]); assert.equal(m[1], G.zoneGl(id, 'gl-sm')); }
  assert.deepEqual(decorative(html), []);
});

// ---------------------------------------------------------------------------------------------------- the Deal Room, the HUD
test('the Deal Room\'s district chip carries the district\'s drawing, and a sheet with no district (a lesson) has no chip', async () => {
  const UI = await import('../js/ui/deal.js'), D = await import('../js/deal.js');
  const { makeGame } = await import('./bot.mjs');
  const g = makeGame(['grad', 'native'], 'ops', 9); g._openZone(2); g.s.cash = 1e6;
  for (let k = 0; k < 6; k++) g._spawnLot(2);
  const lot = { kind: 'buy', zone: 2, lotId: g.s.lots[2].find((l) => l.mode === 'fixed').id }, r = D.startRun(g, lot); assert.ok(r.ok, r.msg);
  const m = { ...D.modelOf(r, { reduced: false }), pick: [], slider: 0.2 }, html = UI.sheetHTML(m);
  assert.ok(html.includes(`<span class="deal-zone"><span aria-hidden="true">${G.zoneGl(2, 'gl-sm')}</span> ${esc(ZONES[2].short)}</span>`));
  assert.ok(!('icon' in m.zone), 'the model carries the district\'s id, not an icon');
  assert.equal(m.zone.id, 2);
  const none = UI.sheetHTML({ ...m, zone: null });
  assert.ok(!/class="deal-zone"/.test(none));
  assert.deepEqual(decorative(html), []);
});

test('the HUD\'s player card shows the drawing of each Background the player holds, on the disc, with the name in the title and the card\'s label', async () => {
  const { playerCard } = await import('../js/ui/hud.js');
  for (const pair of [['trades', 'pro'], ['connected', 'heir'], ['gigger', 'native']]) {
    const ctx = fakeCtx({ days: 0, perks: pair }), html = playerCard(ctx);
    for (const id of pair) assert.ok(html.includes(`<i title="${esc(PERKS[id].name)}">${G.bgGl(id, 'gl-sm')}</i>`), `${id}: its drawing on the disc`);
    assert.ok(!/\p{Extended_Pictographic}/u.test(html), 'no emoji on the card');
    assert.deepEqual(decorative(html), []);
  }
});

// ---------------------------------------------------------------------------------------------------- the Draft
test('the Draft: the title screen holds no glyph set; the Draft loads the Backgrounds\' drawings when it opens and fills each card\'s disc, the tray\'s slot and the chip in the bar', async () => {
  const draft = src('js/ui/draft.js');
  assert.doesNotMatch(draft, /^import .*glyph/m, 'no static import of a glyph module: the first screen holds no drawing (tests/page-budget.test.mjs)');
  assert.match(draft, /import\('\.\/glyphs\.js'\)/, 'the Draft imports the screens\' lookup when it opens, with a literal path (scripts/preload.mjs reads it)');
  const D = await import('../js/ui/draft.js');
  const before = D.cardHTML('grad', D.draftInit());
  assert.match(before, /<span class="dr-ic" data-bg="grad" aria-hidden="true"><\/span>/, 'before the module has loaded the disc is empty (and the sheet hides an empty one)');
  await D.loadGlyphs();
  for (const id of PERK_IDS) {
    const st = D.draftInit(), card = D.cardHTML(id, st);
    assert.ok(card.includes(`<span class="dr-ic" data-bg="${id}" aria-hidden="true">${G.bgGl(id)}</span>`), `${id}: the card's disc holds its drawing`);
    assert.ok(!('icon' in PERKS[id]));
  }
  const two = D.draftReduce(D.draftReduce(D.draftInit(), { type: 'toggle', id: 'pro' }), { type: 'toggle', id: 'second' });
  const tray = D.trayHTML(two), bar = D.actionsHTML(two);
  for (const id of ['pro', 'second']) { assert.ok(tray.includes(`<span class="dr-ic" data-bg="${id}" aria-hidden="true">${G.bgGl(id)}</span>`), `${id}: its slot in the tray`); assert.ok(bar.includes(`<span aria-hidden="true">${G.bgGl(id, 'gl-sm')}</span> ${esc(PERKS[id].name)}`), `${id}: its chip in the bar`); }
  const html = D.draftHTML(two);
  assert.deepEqual(decorative(html), []);
  assert.ok(!/\p{Extended_Pictographic}/u.test(html), 'no emoji on the Draft');
  assert.ok(svgs(html) >= 12 + 2 + 2, 'twelve cards, two slots and two chips');
  const css = src('css/ui-draft.css');
  assert.match(css, /\.dr-ic:empty \{[^}]*visibility: hidden/, 'a disc whose drawing has not loaded yet is not drawn: no empty circle flashes');
  assert.match(css, /\.dr-ic \.gl/, 'the disc sizes the drawing');
});

test('the Draft fills the cards in when the module arrives, once, without touching the alias field or the checkboxes, and does nothing if the screen has gone', async () => {
  const draft = src('js/ui/draft.js');
  assert.match(draft, /loadGlyphs\(\)\.then\(/, 'mountDraft asks for the drawings after it has drawn the screen');
  assert.match(draft, /!form\.isConnected/, 'and fills nothing in if the Draft is gone by then (#app, the root, stays in the page: the form does not)');
  assert.match(draft, /\$\$\('\.dr-ic\[data-bg\]', root\)/, 'it fills the discs by their data-bg, one by one, and rebuilds nothing');
});

// ---------------------------------------------------------------------------------------------------- the debrief, the instructor
test('the debrief names the build with the drawings: the line under the title and each Background\'s card', async () => {
  const { debriefHTML } = await import('../js/ui/debrief.js');
  const { Session } = await import('../js/session.js');
  const { makeSynth } = await import('../js/cohort.js');
  const { makeGame, run } = await import('./bot.mjs');
  const g = makeGame(['native', 'heir'], 'growth', 11); run(g, { days: 20 });
  const S = new Session(); S.game = g; S.synth = makeSynth(11, 'test');
  const html = debriefHTML(S);
  for (const id of ['native', 'heir']) {
    assert.ok(html.includes(`<span class="sc-ic" aria-hidden="true">${G.bgGl(id)}</span>${esc(PERKS[id].name)}`), `${id}: its card`);
    assert.ok(html.includes(`${G.bgGl(id, 'gl-sm')} ${esc(PERKS[id].name)}`), `${id}: the line under the title`);
  }
  assert.deepEqual(decorative(html), []);
  const none = debriefHTML(Object.assign(new Session(), { game: (() => { const x = makeGame(['native', 'heir'], 'growth', 11); x.s.perks = []; return x; })(), synth: makeSynth(11, 'test') }));
  assert.match(none, /No Background/, 'a run with no Background says so, and draws nothing for it');
});

test('the instructor dashboard draws the Backgrounds: two small drawings in a student\'s row (named once, for assistive technology), and one beside each name in what the class drafted', async () => {
  const { bgIcons, instructorParts } = await import('../js/ui/instructor.js');
  const row = bgIcons({ perks: ['trades', 'pro'] });
  assert.ok(row.startsWith('<span class="in-bgs" role="img" aria-label="Licensed Tradesperson and Seasoned Pro"'), 'the pair is one picture with the two names');
  for (const id of ['trades', 'pro']) assert.ok(row.includes(`<span aria-hidden="true">${G.bgGl(id, 'gl-sm')}</span>`), `${id}: its drawing`);
  assert.equal(bgIcons({ perks: [] }), '<span class="mute">none</span>');
  assert.equal(bgIcons({ perks: ['constructor', 'nope'] }), '<span class="mute">none</span>', 'a name from a classmate\'s save is no Background');
  const { Session } = await import('../js/session.js');
  const { makeGame, run } = await import('./bot.mjs');
  const g = makeGame(['native', 'heir'], 'growth', 11); run(g, { days: 20 });
  const S = new Session(); S.mode = 'instructor'; S.roomInfo = { code: 'ABCD', relay: '', role: 'instructor' }; S.room = { kind: 'local', state: 'open' }; S.setDemo(12);
  S.peers.set('PC-A', { pid: 'PC-A', handle: 'Zelda', role: 'student', seen: Date.now(), snap: { ...g.publicSnapshot(), pid: 'PC-A', handle: 'Zelda', perks: ['trades', 'pro'], zones: 3 } });
  const p = instructorParts(S, { bg: 'all' });
  const chips = [...p.c2.matchAll(/<li><span aria-hidden="true">([\s\S]*?)<\/span> ([^<]*) <b class="mono">/g)];
  assert.ok(chips.length >= 3, 'the class drafted several Backgrounds');
  for (const m of chips) { const id = PERK_IDS.find((i) => esc(PERKS[i].name) === m[2]); assert.ok(id, m[2]); assert.equal(m[1], G.bgGl(id, 'gl-sm'), `${id}: its drawing beside its name`); }
  assert.deepEqual(decorative(p.c2 + p.grade), []);
});

// ---------------------------------------------------------------------------------------------------- the sheets
test('the sheets size the drawings of a place: 26 px on a Draft disc (22 on a phone), 24 px on the debrief\'s card, 16 px in a row and on the player card\'s disc, 24 px in the Travel tile, 40 px in the Market\'s banner; nothing is left of an emoji\'s font-size', () => {
  const draft = src('css/ui-draft.css'), shell = src('css/shell.css'), market = src('css/ui-market.css');
  assert.match(draft, /\.dr-ic \.gl \{ width: 1\.6rem; height: 1\.6rem; \}/); assert.match(draft, /\.dr-ic \.gl \{ width: 1\.35rem; height: 1\.35rem; \}/, 'and on a phone');
  assert.doesNotMatch(draft.match(/\.dr-ic \{[^}]*\}/)[0], /font-size/, 'the disc holds a drawing, not a character');
  assert.match(draft, /\.sc-ic \.gl \{/); assert.match(draft, /\.in-bgs \.gl, \.in-chips \.gl \{ display: block; \}/);
  assert.match(shell, /\.ring \.av i \{ display: flex;/, 'the player card\'s disc: each drawing is a flex item, so it sits centred');
  assert.match(market, /\.mkt-bic \{ display: flex; flex: none;/); assert.doesNotMatch(market.match(/\.mkt-bic \{[^}]*\}/)[0], /font-size/);
});
