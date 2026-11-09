// The goods on the screens (Icons part 4, docs/ART_DIRECTION.md 3.6): every place that used to print a good's emoji draws its glyph (js/art/g-goods.js, found by id through js/ui/glyphs.js, goodGlyph and goodGl),
// in the same place, decorative (aria-hidden: the name beside it stays the name), at the size of its row (16 px) or of the tile it stands in (36 px in a crate's, 38 px on a lot card). The data carries no icon and the Deal Room's model carries the good's class,
// not a picture; a good nobody drew gets no mark in a row and no tile on the Deal Room's lot card (the data test below makes sure there is no such good). The world's canvas (the crate icon and the price tag) is held in tests/world-goods.test.mjs.
// Held here, the data first (one drawing for each of the 72 goods, in the order of the tier files, told apart, and the grammar of the set: gold on tier 4, the pallet strip on a pallet, slate wheels on a vehicle),
// then screen by screen: Stock, Market (lots, buyers, the Niche Radar, the Exchange), Crew, Travel and the Deal Room.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const G = await import('../js/ui/glyphs.js');
const { idsOf, shapesOf } = await import('../js/art/glyph.js');
const { isMark, lookalikes, unionBox, tonesOf } = await import('./helpers/glyph-rules.mjs');
const { ASSETS } = await import('../js/config.js');
const tiers = await Promise.all([1, 2, 3, 4].map((n) => import(`../js/data/tier${n}.js`)));
const { fakeCtx, checkHTML } = await import('./helpers/ctx.mjs');
const { esc } = await import('../js/ui/common.js');

/** Every glyph on the page is decorative or named: nothing a screen reader would read as an unnamed picture. */
const decorative = (html) => [...html.matchAll(/<svg\b([^>]*)>/g)].filter((m) => /viewBox="0 0 24 24"/.test(m[1]) && !/ aria-hidden="true"/.test(m[1]) && !/ role="img" aria-label="[^"]+"/.test(m[1])).map((m) => m[0]);
const IDS = Object.keys(ASSETS), GOODS = idsOf().filter((id) => id.startsWith('good-'));

// ---------------------------------------------------------------------------------------------------- the data
test('the 72 goods have one drawing each, named by what the data names them (good-<id>), in the order of the four tier files, and nothing is drawn that the data does not have; the data carries no icon', () => {
  assert.equal(IDS.length, 72);
  assert.deepEqual(GOODS, IDS.map((id) => 'good-' + id), 'one good-<id> for each good, a tier at a time, as the tier files list them: a new good is a line in the block of its tier');
  assert.deepEqual(IDS, tiers.flatMap((t) => Object.keys(t.assets)), 'the data merges the tiers in order');
  assert.equal(new Set(IDS.map((id) => G.goodGlyph(id))).size, 72);
  for (const id of IDS) { assert.ok(!('icon' in ASSETS[id]), `${ASSETS[id].name}: the data carries no icon, its drawing is found by its id`); assert.equal(G.goodGlyph(id), 'good-' + id); assert.ok(!isMark(shapesOf('good-' + id)), `${id} is a picture, not a mark`); }
  assert.ok(G.goodGlyph('constructor') === '' && G.goodGlyph('__proto__') === '' && G.goodGlyph(undefined) === '' && G.goodGlyph('nope') === '' && G.goodGlyph(99) === '', 'a good nobody drew is no glyph, and a name from a save or a classmate is never a way into the registry');
  assert.equal(G.goodGl('nope'), '', 'and the markup of one is empty (the screens then print no tile)'); assert.equal(G.goodGl('radio', 'gl-sm'), G.gl('good-radio', 'gl-sm'));
  assert.equal(tiers.map((t) => Object.keys(t.assets).length).join(), '18,18,18,18');
});

test('no two goods look alike: on the dark tile, in their own tones, any two goods are 30 or more apart (the kit\'s floor is 25 across all its pictures: the goods are held higher among themselves, because a row of them is what a player reads), and each fills at least 15 units of the grid', () => {
  const pics = Object.fromEntries(GOODS.map((id) => [id, shapesOf(id)]));
  const near = lookalikes(pics, 30, '#1d2634');
  assert.deepEqual(near.map((p) => `${p.a} and ${p.b} are ${p.distance.toFixed(1)} apart`), [], 'draw one of each pair differently: another silhouette and another main tone, not another shade');
  const small = GOODS.map((id) => { const [x0, y0, x1, y1] = unionBox(pics[id]); return [id, Math.max(x1 - x0, y1 - y0)]; }).filter(([, size]) => size < 15).map(([id, size]) => `${id} ${size.toFixed(1)}`);
  assert.deepEqual(small, [], 'a good smaller than 15 units cannot be told from its neighbour at 16 px');
});

test('the set has a grammar a player can see: every asset of tier 4 wears gold, a good the data names a pallet stands on the same pallet strip (and nothing else does but the crate of four engines), and every vehicle rolls on slate wheels with the tile showing through the hub', () => {
  const gold = (id) => tonesOf(shapesOf('good-' + id)).some((t) => t === 'y' || t === 'yd');
  assert.deepEqual(Object.keys(tiers[3].assets).filter((id) => !gold(id)), [], 'tier 4: gold on every asset (a seal, a rim, a coin, a lit window, a ribbon). The rule is what tier 4 always has, not that no other tier has gold: a lower good wears it where its own colour, a coin, a clasp or a handle asks for it');
  const strip = (id) => shapesOf('good-' + id).some((s) => s[0] === 'p' && s[1] === 'nd' && s.length === 26 && Math.abs(Math.max(...s.slice(2).filter((_, i) => i % 2)) - Math.min(...s.slice(2).filter((_, i) => i % 2)) - 3.4) < 0.11);
  const pallets = IDS.filter((id) => /\bPallet\b/.test(ASSETS[id].name));
  assert.deepEqual(pallets, ['gadgets', 'textbooks', 'laptops'], 'the data names three pallets');
  assert.deepEqual(IDS.filter(strip), [...pallets, 'marineEngine'].sort((a, b) => IDS.indexOf(a) - IDS.indexOf(b)), 'the pallet strip is on the pallets and on the crate of four engines, and on nothing else');
  const wheels = (id) => shapesOf('good-' + id).filter((s) => s[0] === 'd' && s[1] === 'k' && s[3] === 'e').length;
  for (const [id, n] of Object.entries({ bike: 2, sedan: 2, classicCar: 2, van: 2, fleet: 2, rowCropTractor: 2 })) assert.equal(wheels(id), n, `${id}: ${n} slate wheels, rings with a hole (the tile shows through the hub)`);
});

test('the goods table is lazy and light: g-goods.js is one module of the later screens (tests/page-budget.test.mjs, LATER), a drawing costs 180 bytes gzipped at most on average (155 for the 72 of today: the catalog\'s fifty more will cost what they cost, not a limit written for 72), and the kit has no exemplar set left (js/art/g-sample.js went when its goods were drawn)', () => {
  const raw = readFileSync(new URL('../js/art/g-goods.js', import.meta.url)), gz = gzipSync(raw).length, each = gz / IDS.length; assert.ok(each <= 180, `js/art/g-goods.js is ${gz} bytes gzipped for ${IDS.length} goods: ${each.toFixed(0)} bytes a drawing (180 at most: fewer shapes, one decimal, a polygon where a rounded path is not needed)`);
  assert.throws(() => readFileSync(new URL('../js/art/g-sample.js', import.meta.url)), /ENOENT/, 'the exemplars are gone: the real drawings stand where they were');
  assert.match(src('js/ui/glyphs.js'), /^import '\.\.\/art\/g-goods\.js';$/m, 'the screens\' lookup loads the goods with the other sets');
});

// ---------------------------------------------------------------------------------------------------- the drawers
test('Stock: every crate carries its good\'s drawing in its tile, decorative, and the name stays beside it', async () => {
  const { default: stock } = await import('../js/ui/drawers/stock.js');
  const ctx = fakeCtx({ days: 25 }), g = ctx.g(); ctx.U.drawer = 'stock';
  const html = stock.html(ctx), crates = [...html.matchAll(/<li class="stk-crate[^"]*">\s*<span class="stk-ic" aria-hidden="true">([\s\S]*?)<\/span>\s*<div class="stk-body">[\s\S]*?<span>([^<]*)<span class="sr">/g)];
  assert.deepEqual(checkHTML(html, 'stock'), []);
  assert.ok(crates.length >= 3 && crates.length === g.s.assets.length, `a crate each: ${crates.length} of ${g.s.assets.length}`);
  for (const m of crates) { const id = IDS.find((i) => esc(ASSETS[i].name) === m[2] || ASSETS[i].name === m[2]); assert.ok(id, m[2]); assert.equal(m[1], G.goodGl(id), `${ASSETS[id].name}: its own drawing`); }
  assert.deepEqual(decorative(html), []); assert.ok(!/\p{Extended_Pictographic}/u.test(html), 'no emoji in Stock');
});

test('Market: a lot (the booth) and a row of the Niche Radar carry the good\'s drawing in its tile, the crates one sells with carry it at 16 px, decorative, and the words stay', async () => {
  const { default: market } = await import('../js/ui/drawers/market.js');
  const ctx = fakeCtx({ days: 25 }), g = ctx.g(), z = ctx.U.zone; ctx.U.drawer = 'market';
  for (let k = 0; k < 6; k++) g._spawnLot(z);
  ctx.U.marketTab = 'lots'; let html = market.html(ctx);
  assert.deepEqual(checkHTML(html, 'lots'), []);
  const lots = g.s.lots[z]; assert.ok(lots.length >= 3);
  for (const l of lots) assert.ok(html.includes(`<span class="mkt-ic" aria-hidden="true">${G.goodGl(l.cls)}</span>`), `a lot of ${l.cls}: its drawing in the booth`);
  assert.equal((html.match(/class="mkt-ic"/g) || []).length, lots.length); assert.deepEqual(decorative(html), []);
  g.s.assets.push(g._mk(g.s, 'radio', { zone: z }), g._mk(g.s, 'bike', { zone: z })); ctx.U.marketTab = 'buyers'; html = market.html(ctx);
  const here = g.s.assets.filter((a) => a.zone === z); assert.ok(here.length > 1, 'two crates or more in the district: the "selling with" row is drawn');
  for (const a of here.slice(0, 12)) assert.ok(html.includes(`<span aria-hidden="true">${G.goodGl(a.cls, 'gl-sm')}</span> ${esc(ASSETS[a.cls].name)}`) || html.includes(`<span aria-hidden="true">${G.goodGl(a.cls, 'gl-sm')}</span> `), `${a.cls}: its drawing on its button`);
  assert.deepEqual(decorative(html), []); assert.ok(!/\p{Extended_Pictographic}/u.test(html), 'no emoji on the Market');
  g.P.radar = true; ctx.U.marketTab = 'radar'; html = market.html(ctx);
  const rows = [...html.matchAll(/<li class="mkt-rrow"><span class="mkt-ic" aria-hidden="true">([\s\S]*?)<\/span><div class="mkt-body">\s*<p class="mkt-rname"><b>([^<]*)<\/b>/g)];
  assert.ok(rows.length >= 1, 'the radar has rows'); for (const m of rows) { const id = IDS.find((i) => esc(ASSETS[i].name) === m[2]); assert.ok(id, m[2]); assert.equal(m[1], G.goodGl(id), `${id}: its drawing in the radar row`); }
  assert.deepEqual(decorative(html), []);
});

test('Market, the Exchange: the crates in a proposal\'s table and the crates a classmate holds are named with their drawing at 16 px, before the name', async () => {
  const { default: market } = await import('../js/ui/drawers/market.js');
  const ctx = fakeCtx({ days: 10 }), g = ctx.g(), mine = g.s.assets[0];
  const theirs = [{ id: 'NPC-1', cls: 'bike', cond: 'ok', quality: 1, wear: 1, zone: 1, fmv: 20 }, { id: 'NPC-2', cls: 'radio', cond: 'broken', quality: 1, wear: 1, zone: 1, fmv: 12 }];
  ctx.S.roster = () => [{ pid: 'P1', handle: 'Pat', skills: { ops: 1, growth: 1, fintech: 1 }, inventory: theirs }];
  ctx.U.drawer = 'market'; ctx.U.marketTab = 'exchange'; ctx.U.sel.add(mine.id);
  const acts = market.acts(ctx); acts['market-want']({ dataset: { id: 'NPC-1' } });
  const html = market.html(ctx);
  assert.deepEqual(checkHTML(html, 'exchange'), []);
  for (const a of theirs) assert.ok(html.includes(`<span aria-hidden="true">${G.goodGl(a.cls, 'gl-sm')}</span> `), `${a.cls}: the classmate's crate has its drawing`);
  assert.ok(html.includes(`<span aria-hidden="true">${G.goodGl(mine.cls, 'gl-sm')}</span> `) && html.includes('<span aria-hidden="true">' + G.goodGl('bike', 'gl-sm') + '</span> '), 'and the proposal\'s table names the crates it holds');
  assert.deepEqual(decorative(html), []); assert.ok(!/\p{Extended_Pictographic}/u.test(html));
});

test('Crew: a lane\'s goods and a row of the radar are named with the good\'s drawing at 16 px before the name', async () => {
  const { default: crew } = await import('../js/ui/drawers/crew.js');
  const ctx = fakeCtx({ days: 60 }), g = ctx.g(); ctx.U.drawer = 'crew'; ctx.U.crew = { tab: 'crew' };
  const html = crew.html(ctx), lanes = [...html.matchAll(/<p class="cr-lane"><span aria-hidden="true">([\s\S]*?)<\/span> /g)];
  assert.deepEqual(checkHTML(html, 'crew'), []);
  assert.ok(lanes.length >= 1, 'at day 60 a manager has a lane');
  const cls = new Set(g.s.pipes.map((p) => p.cls)); for (const m of lanes) assert.ok([...cls].some((c) => m[1] === G.goodGl(c, 'gl-sm')), 'a lane\'s drawing is its good\'s');
  assert.deepEqual(decorative(html), []); assert.ok(!/\p{Extended_Pictographic}/u.test(html), 'no emoji in Crew');
  assert.match(src('js/ui/drawers/crew.js'), /const goodsMark = \(cls\) => \(goodGlyph\(cls\) \? `<span aria-hidden="true">\$\{goodGl\(cls, 'gl-sm'\)\}<\/span> ` : ''\);/, 'a good nobody drew has no mark and no gap');
});

test('Travel: the crates in the freight planner and the crates a shipment carries are named with their drawing at 16 px, each name escaped', async () => {
  const { default: travel } = await import('../js/ui/drawers/travel.js');
  const ctx = fakeCtx({ days: 25 }), g = ctx.g(), s = g.s;
  const made = ['radio', 'bike', 'pen', 'sedan'].map((c) => g._mk(s, c, { zone: ctx.U.zone })); s.assets.push(...made); s.cash += 5000; ctx.U.shipIds = made.map((a) => a.id); ctx.U.drawer = 'travel';
  const html = travel.html(ctx);
  assert.deepEqual(checkHTML(html, 'travel'), []);
  for (const c of ['radio', 'bike', 'pen']) assert.ok(html.includes(`<span aria-hidden="true">${G.goodGl(c, 'gl-sm')}</span> ${esc(ASSETS[c].name)}`), `${c}: named with its drawing`);
  assert.ok(/and 1 more\./.test(html), 'three are named and the rest counted');
  assert.deepEqual(decorative(html), []); assert.ok(!/\p{Extended_Pictographic}/u.test(html), 'no emoji in Travel');
});

// ---------------------------------------------------------------------------------------------------- the Deal Room
test('the Deal Room\'s lot card carries the good\'s drawing in its tile (Read, Pitch and Fix), the model carries the class and no icon, and a good nobody drew leaves the tile out', async () => {
  const UI = await import('../js/ui/deal.js'), D = await import('../js/deal.js');
  const { makeGame } = await import('./bot.mjs');
  const g = makeGame(['grad', 'native'], 'ops', 9);
  for (const z of [2, 3, 4]) g._openZone(z);
  g.s.cash = 1e6; g.s.skills.growth = 4; g.s.skills.fintech = 3;
  for (const z of g.s.zones) for (const cls of Object.keys(ASSETS).filter((c) => (ASSETS[c].dem?.[z] || 0) >= 4).slice(0, 4)) g.s.assets.push(g._mk(g.s, cls, { zone: z, basis: 1 }));
  for (const z of g.s.zones) for (let k = 0; k < 4; k++) g._spawnLot(z);
  const model = (r, o = {}) => ({ ...D.modelOf(r, { reduced: false }), pick: o.pick || [], slider: 0.2 });
  const tile = (cls) => `<span class="ic" aria-hidden="true">${G.goodGl(cls)}</span>`, bad = [];
  const lot = { kind: 'buy', zone: 4, lotId: g.s.lots[4].find((l) => l.mode === 'fixed').id }, r = D.startRun(g, lot); assert.ok(r.ok, r.msg);
  const m = model(r), html = UI.readHTML(m);
  assert.ok(html.includes(tile(m.plan.lot.cls)), 'Read: the lot\'s drawing in the card'); assert.ok(!('icon' in m.plan.lot) && m.plan.lot.cls, 'the model carries the class, not a picture');
  bad.push(...checkHTML(html, 'read'));
  const sold = (() => { for (const z of g.s.zones) for (const lead of g.s.leads[z]) for (const a of g.s.assets.filter((x) => x.zone === z)) { const q = g.quotePitch(a.id, lead.id); if (q.ok && q.fit >= 0.15 && !q.rejected) return { kind: 'sell', assetId: a.id, leadId: lead.id }; } return null; })();
  assert.ok(sold, 'a crate with a buyer to pitch to');
  const p = D.startRun(g, sold); assert.ok(p.ok, p.msg); const pm = model(p, { pick: ['prestige'] }), pitch = UI.pitchHTML(pm);
  assert.ok(pitch.includes(tile(pm.plan.asset.cls)), 'Pitch: the crate\'s drawing in the card'); assert.ok(!('icon' in pm.plan.asset));
  const broken = g.s.assets.find((a) => g.repairQuote(a.id)?.ok !== false && a.cond === 'broken') || (() => { const a = g.s.assets[0]; a.cond = 'broken'; return a; })();
  const f = D.startRun(g, { kind: 'repair', assetId: broken.id });
  if (f.ok) { const fm = model(f), fix = UI.fixHTML(fm); assert.ok(fix.includes(tile(fm.plan.asset.cls)), 'Fix: the crate\'s drawing in the card'); assert.ok(!('icon' in fm.plan.asset)); bad.push(...checkHTML(fix, 'fix')); assert.deepEqual(decorative(fix), []); }
  assert.deepEqual(decorative(html + pitch), []); assert.deepEqual(bad, []);
  const unknown = UI.readHTML({ ...m, plan: { ...m.plan, lot: { ...m.plan.lot, cls: 'nope' } } });
  assert.ok(!/class="ic"/.test(unknown) && /<div class="lotcard"><div><b>/.test(unknown), 'a good nobody drew leaves the tile out: the card is its words alone, and no stand-in character');
  assert.ok(!/\p{Extended_Pictographic}/u.test(html + pitch + unknown));
});

// ---------------------------------------------------------------------------------------------------- the sheets
test('the sheets size a good\'s drawing in the tile each already has: 36 px in a crate\'s and a booth\'s (2.8 rem), 38 px on the Deal Room\'s lot card (3 rem; 34 px in 2.6 rem in a window 761 to 1100 px wide, a tablet or a small laptop: a phone keeps the 38), 16 px in a row; nothing is left of an emoji\'s font-size, rim or text shadow', () => {
  const stock = src('css/ui-stock.css'), market = src('css/ui-market.css'), deal = src('css/ui-deal.css');
  assert.doesNotMatch(stock, /\.stk-ic \{[^}]*font-size/, 'a crate\'s tile holds a drawing, not a character'); assert.doesNotMatch(market, /\.mkt-ic \{[^}]*font-size/); assert.doesNotMatch(deal, /\.lotcard \.ic \{[^}]*font-size/);
  assert.doesNotMatch(stock, /text-shadow: 0 0 1px rgba\(255, 255, 255/, 'no light rim round a character: the drawings are made for the dark tile');
  assert.match(stock, /\.stk-ic \.gl \{ width: 2\.25rem; height: 2\.25rem; \}/, 'a crate\'s drawing is 36 px in its 44.8 px tile'); assert.match(market, /\.mkt-ic \.gl \{ width: 2\.25rem; height: 2\.25rem; \}/);
  assert.match(deal, /\.lotcard \.ic \.gl \{ width: 2\.4rem; height: 2\.4rem; \}/, 'the lot card\'s is 38 px in its 48 px tile');
  const tablet = deal.match(/@media \(min-width: 761px\) and \(max-width: 1100px\) \{[\s\S]*?\n\}/)?.[0] || '', phone = deal.match(/@media \(max-width: 760px\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(tablet, /\.lotcard \.ic \.gl \{ width: 2\.1rem; height: 2\.1rem; \}/, 'and 34 px in the 41.6 px tile of a window 761 to 1100 px wide (a tablet or a small laptop: the media query of those windows)');
  assert.ok(phone.length > 500 && !/\.lotcard/.test(phone), 'a phone (760 px or less) keeps the 38 px drawing in its 48 px tile: its media query has no lot card rule');
  assert.match(market, /\.mkt-use \.btn\[aria-pressed="true"\] \.gl-c \{[^}]*background: var\(--bg\)/, 'a pressed (gold) "selling with" button puts the drawing on a dark tile: the drawings are made for dark surfaces');
});
