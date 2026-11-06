// The glyphs the screens draw (js/ui/glyphs.js, docs/ART_DIRECTION.md 3.6, docs/COPY.md rule 7): the data carries no icon, so a lookup names the drawing of a Codex category, a badge, a bounty, a probe, an angle,
// a manager, a client, a loan, a rarity, a dock tab, a district (zone-<theme>) and a Background (bg-<id>). Held here:
//   * every one of those things in the data has a registered drawing, and no table names a thing the data does not have;
//   * the dock: every drawer has dock-<id>, drawn in the dock and in the drawer's header, and the words stay in the page (a phone clips them, it never removes them: the glyph is decorative and the button keeps its name);
//   * every id a source writes is registered, and every registered glyph of the three sets is used by a screen, a sheet or a table;
//   * what the screens print: every <svg> is aria-hidden or named, a button that holds only a glyph has an aria-label, a thing with no drawing gets no tile and no empty column.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const ROOT = fileURLToPath(new URL('..', import.meta.url)), read = (p) => readFileSync(join(ROOT, p), 'utf8');
const G = await import('../js/ui/glyphs.js');
const { idsOf } = await import('../js/art/glyph.js');
const { has } = G;
const { CODEX } = await import('../js/meta/codex.js');
const { ACHIEVEMENTS, DAILIES, QUESTS } = await import('../js/meta/quests.js');
const { PIPE, CLIENTS, LOANS, ZONES, ZONE_IDS, PERKS, PERK_IDS, ASSETS } = await import('../js/config.js');
const { DRAWERS } = await import('../js/ui/drawers/index.js');
const { CATEGORIES } = await import('../js/ui/drawers/codex.js');
const { CSS_MARKS } = await import('../scripts/glyph-css.mjs');
const { fakeCtx, checkHTML } = await import('./helpers/ctx.mjs');

const ids = () => idsOf();
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const SOURCES = walk(join(ROOT, 'js')).filter((f) => f.endsWith('.js') && !/\/js\/art\//.test(f) && !/\/js\/ui\/glyphs\.js$/.test(f)).map((f) => [f.slice(ROOT.length), readFileSync(f, 'utf8')]);

// ---------------------------------------------------------------------------------------------------- the tables against the data
test('every Codex category, badge, bounty, probe, angle, manager, client, loan and rarity has a registered drawing, and no table names a thing the data does not have', () => {
  const bad = [];
  const need = (id, what) => { if (!has(id)) bad.push(`${what}: no glyph ${id}`); };
  assert.deepEqual(Object.keys(G.CATEGORY), CATEGORIES, 'the table has the Codex\'s seven categories, in its order');
  for (const c of CATEGORIES) need(G.CATEGORY[c], `category ${c}`);
  for (const d of CODEX) if (!G.categoryGlyph(d.category)) bad.push(`Codex page ${d.id}: category ${d.category} has no drawing`);
  for (const a of ACHIEVEMENTS) { need(G.badgeGlyph(a.id, false), `badge ${a.id}`); need(G.badgeGlyph(a.id, true), `badge ${a.id} still secret`); need('rarity-' + a.rarity, `badge ${a.id} rarity`); }
  assert.deepEqual(Object.keys(G.BADGE).sort(), ACHIEVEMENTS.map((a) => a.id.replace(/^a-/, '')).sort(), 'every badge is in the table exactly once, and the table holds no badge the data lost');
  for (const d of DAILIES) need(G.dailyGlyph(d.id), `bounty ${d.id}`);
  assert.deepEqual(Object.keys(G.DAILY).sort(), DAILIES.map((d) => d.id.replace(/^d-/, '')).sort(), 'and so for the bounties');
  for (const f of Object.values(G.QUEST_EVENT)) need(f, 'a quest event');
  for (const q of QUESTS) need(G.questGlyph(q.goal.event), `quest ${q.id} (${q.goal.event})`);
  for (const id of Object.keys(PIPE)) need('mgr-' + id, `manager ${id}`);
  for (const id of Object.keys(CLIENTS)) need('client-' + id, `client ${id}`);
  for (const id of Object.keys(LOANS)) need('loan-' + id, `loan ${id}`);
  for (const id of ['look', 'serial', 'power', 'papers', 'expert']) need('probe-' + id, `probe ${id}`);
  for (const id of ['prestige', 'utility', 'scarcity', 'price', 'story']) need('angle-' + id, `angle ${id}`);
  for (const d of DRAWERS) need('dock-' + d.id, `drawer ${d.id}`);
  for (const id of ZONE_IDS) need(G.zoneGlyph(id), `district ${id} (${ZONES[id].name})`);
  for (const id of PERK_IDS) need(G.bgGlyph(id), `Background ${id}`);
  for (const id of Object.keys(ASSETS)) need(G.goodGlyph(id), `good ${id} (${ASSETS[id].name})`);
  assert.deepEqual(bad, []);
  assert.ok(G.badgeGlyph('a-no-such', false) === '' && G.dailyGlyph('d-no-such') === '' && G.categoryGlyph('Nope') === '', 'an id nobody drew is no glyph (the screens then print no tile)');
  assert.equal(G.badgeGlyph('a-pioneer', true), 'ach-secret', 'a badge still secret is drawn as the secret, so it spoils nothing');
  assert.equal(G.questGlyph('no-such-event'), 'dock-quests', 'a quest of any other kind has the Quests tab\'s drawing');
  assert.ok(G.zoneGlyph(99) === '' && G.zoneGlyph(undefined) === '' && G.zoneGlyph('constructor') === '' && G.bgGlyph('nope') === '' && G.bgGlyph('__proto__') === '' && G.bgGlyph(undefined) === '', 'a district or a Background nobody drew is no glyph, and a name from a save or a classmate is never a way into the registry');
  assert.equal(G.zoneGl(99), '', 'and the markup of one is empty (the screens then print no tile)'); assert.equal(G.bgGl('nope'), '');
  assert.equal(G.zoneGl(1, 'gl-sm'), G.gl('zone-scrap', 'gl-sm')); assert.equal(G.bgGl('grad'), G.gl('bg-grad'));
});

test('the badge families are told apart: twelve drawings for the 78, and the eight hidden badges are shown as the secret until they are earned', () => {
  assert.equal(new Set(Object.values(G.BADGE)).size, 12);
  const hidden = ACHIEVEMENTS.filter((a) => a.hidden);
  assert.equal(hidden.length, 8);
  for (const a of hidden) assert.equal(G.badgeGlyph(a.id, true), 'ach-secret');
});

// ---------------------------------------------------------------------------------------------------- the dock
test('the dock: the seven tabs are drawn in the dock and in the drawer\'s header, the label stays in the page and is only clipped on a phone, and the close button is a drawn cross with a name', () => {
  assert.deepEqual(DRAWERS.map((d) => d.id), ['stock', 'market', 'crew', 'bank', 'travel', 'codex', 'quests']);
  for (const d of DRAWERS) { assert.ok(has('dock-' + d.id), `dock-${d.id} is drawn`); assert.ok(!('icon' in d), `${d.id} has no emoji icon`); assert.ok(d.label, `${d.id} has a label`); }
  const shell = read('js/ui/shell.js');
  assert.match(shell, /<span class="ic" aria-hidden="true">\$\{gl\('dock-' \+ d\.id\)\}<\/span><span class="lb">\$\{esc\(d\.label\)\}<\/span>/, 'the dock button: the glyph is decorative and the label is in the button');
  assert.match(shell, /<h2 tabindex="-1" id="dh-title">\$\{gl\('dock-' \+ d\.id, 'gl-dh'\)\} \$\{esc\(d\.label\)\}<\/h2>/, 'the drawer header: the glyph, then the name');
  assert.match(shell, /aria-label="Close \$\{esc\(d\.label\)\}">\$\{gl\('mark-cross', 'gl-sm'\)\}<\/button>/, 'the close button has a name and a drawn cross');
  const css = read('css/shell.css');
  const phone = [...css.matchAll(/\.dk \.lb \{([^}]*)\}/g)].map((m) => m[1]).filter((b) => /clip/.test(b));
  assert.ok(phone.length >= 2 && phone.every((b) => /position:\s*absolute/.test(b) && /clip:\s*rect\(0 0 0 0\)/.test(b) && !/display:\s*none/.test(b)), 'under 520 px the label is clipped (still read out), never display: none; the glyph is the only name the eye gets');
  assert.match(css, /\.dk \.ic \.gl \{ width: 1\.375rem; height: 1\.375rem; \}/, 'the tab\'s drawing is 22 px at the default text size, in rem');
});

// ---------------------------------------------------------------------------------------------------- the ids a source writes
test('every glyph id a screen writes is registered, and every glyph of the interface sets is used by a screen, a stylesheet or a table', () => {
  const all = new Set(ids()), literals = new Map(), prefixes = new Set();
  for (const [f, src] of SOURCES) {
    for (const line of src.split('\n').filter((l) => /\b(?:gl|tile|svg|paint)\(|\.tag\(|\bmk = |\bconst mark = |\bG = \{/.test(l))) for (const m of line.matchAll(/'((?:dock|mark|ctl|status|ach|probe|angle|mgr|client|loan|rarity|cat|zone|bg|good)-[A-Za-z0-9-]+)'/g)) { if (!literals.has(m[1])) literals.set(m[1], f); }
    for (const m of src.matchAll(/\b(?:gl|tile|svg)\(\s*'([a-z]+-)'\s*\+/g)) prefixes.add(m[1]);
  }
  const bad = [...literals].filter(([id]) => !all.has(id)).map(([id, f]) => `${f}: ${id} is not a glyph`);
  assert.deepEqual(bad, []);
  assert.deepEqual([...prefixes].sort(), ['angle-', 'client-', 'dock-', 'loan-', 'mgr-', 'probe-', 'rarity-'], 'the ids built from a data id: their data is checked above');
  const byTable = new Set([...Object.values(G.CATEGORY), ...Object.values(G.BADGE), ...Object.values(G.DAILY), ...Object.values(G.QUEST_EVENT), 'ach-secret']);
  const byPrefix = (id) => /^(dock|probe|angle|mgr|client|loan|rarity|zone|bg|good)-/.test(id); // (a district, a Background and a good are found by their data: the test above holds that every one is drawn and tests/ui-goods.test.mjs that none is drawn that the data lacks)
  const unused = [...all].filter((id) => /^(dock|mark|ctl|status|ach|probe|angle|mgr|client|loan|rarity|cat)-/.test(id) && !literals.has(id) && !byTable.has(id) && !byPrefix(id) && !CSS_MARKS.map((n) => 'mark-' + n).includes(id));
  assert.deepEqual(unused, [], 'drawn and never shown: delete it, or show it');
});

// ---------------------------------------------------------------------------------------------------- what the screens print
const A11Y = /<svg\b([^>]*)>/g;
/** Every <svg> in a piece of markup is decorative or named. */
function svgProblems(html, label) {
  const bad = [];
  for (const m of html.matchAll(A11Y)) { const a = m[1]; if (!/ aria-hidden="true"/.test(a) && !/ role="img" aria-label="[^"]+"/.test(a)) bad.push(`${label}: an svg with neither aria-hidden nor a name: ${m[0].slice(0, 80)}`); if (!/class="gl[ "]/.test(a) && /viewBox="0 0 24 24"/.test(a)) bad.push(`${label}: a glyph without the .gl class`); }
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) { // a button holding only a glyph keeps a name
    const text = m[2].replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim();
    if (/<svg\b/.test(m[2]) && !text && !/aria-label="[^"]+"/.test(m[1])) bad.push(`${label}: a button of a glyph alone has no aria-label: ${m[0].slice(0, 90)}`);
  }
  return bad;
}
const glyphs = (html) => (html.match(/<svg\b/g) || []).length;

test('the drawers draw glyphs that a screen reader skips or names, and every card that has a drawing keeps its words', async () => {
  const { Progress } = await import('../js/meta/progress.js');
  const { run } = await import('./bot.mjs');
  const { default: quests } = await import('../js/ui/drawers/quests.js');
  const { default: codex, entryHTML, academyHTML } = await import('../js/ui/drawers/codex.js');
  const { default: crew } = await import('../js/ui/drawers/crew.js');
  const { default: bank } = await import('../js/ui/drawers/bank.js');
  const { default: travel } = await import('../js/ui/drawers/travel.js');
  const ctx = fakeCtx({ days: 0, perks: ['trades', 'pro'] });
  ctx.progress = new Progress(ctx.g()); ctx.g().onEvent = (e) => ctx.progress.onEvent(e); run(ctx.g(), { days: 25 });
  ctx.U.fold = { 'quests.later': true }; ctx.U.quests = { achAll: true, ach: 'all', doneOpen: true };
  const bad = [], seen = {};
  const check = (name, html, min = 1) => { seen[name] = glyphs(html); bad.push(...checkHTML(html, name), ...svgProblems(html, name)); if (glyphs(html) < min) bad.push(`${name}: expected at least ${min} glyphs, found ${glyphs(html)}`); };
  ctx.U.drawer = 'quests'; check('quests', quests.html(ctx), 20);
  ctx.U.drawer = 'codex'; const list = codex.html(ctx); check('codex list', list, 10);
  const open = ctx.progress.codexList().find((e) => e.unlocked)?.def; assert.ok(open);
  check('codex page', entryHTML(ctx, open), 2); check('codex academy', academyHTML(ctx), 5);
  ctx.U.drawer = 'crew'; ctx.U.crew = { tab: 'clients' }; for (const tab of ['team', 'clients']) { ctx.U.crew = { ...(ctx.U.crew || {}), tab }; check('crew ' + tab, crew.html(ctx), 0); }
  ctx.U.drawer = 'bank'; check('bank', bank.html(ctx), 1);
  ctx.U.drawer = 'travel'; check('travel', travel.html(ctx), 1);
  assert.deepEqual(bad, []);
  assert.ok(seen['quests'] >= 20 && seen['codex list'] >= 10, JSON.stringify(seen));
  // a card keeps its words: every badge title is printed beside its drawing
  const html = quests.html(ctx);
  for (const a of ctx.progress.achievements().filter((x) => !x.hidden).slice(0, 5)) assert.ok(html.includes(a.def.title.replace(/'/g, '&#39;')) || html.includes(a.def.title), a.def.title);
});

test('the HUD\'s buttons that are a drawing alone keep their names: play or pause, help and the menu are glyphs with an aria-label, and the Goal card carries the drawing of what the quest asks for', async () => {
  const { hudHTML, trackerHTML } = await import('../js/ui/hud.js');
  const { Progress } = await import('../js/meta/progress.js');
  const ctx = fakeCtx({ days: 0 }); ctx.progress = new Progress(ctx.g());
  const html = hudHTML(ctx);
  assert.deepEqual(svgProblems(html, 'hud'), []);
  for (const act of ['pause', 'help', 'menu']) assert.match(html, new RegExp(`<button class="ibtn"[^>]*data-act="${act}"[^>]*aria-label="[^"]+"><svg class="gl" viewBox="0 0 24 24" aria-hidden="true">`), `${act}: a drawn glyph (a mark: the text colour) in a named button`);
  assert.doesNotMatch(html, /[▶⏸☰]/, 'no character stands for a control');
  const goal = trackerHTML(ctx);
  assert.match(goal, /<small class="tk-lb"><svg class="gl gl-c"[^>]*aria-hidden="true">[\s\S]*?<\/svg> Goal<\/small>/, 'the Goal card: the drawing of the quest\'s event, then the word');
  ctx.U.tracker = () => ({ title: 'A lesson', desc: 'Do it.', glyph: '', p: 0, n: 3 });
  assert.match(trackerHTML(ctx), /<small class="tk-lb">Goal<\/small>/, 'a lesson with no drawing for its page has the word alone');
});

test('the Deal Room draws a probe, an angle and an evidence line with their drawings, the verdict marks as drawn glyphs, and every svg is decorative', async () => {
  const { makeGame } = await import('./bot.mjs');
  const D = await import('../js/deal.js'), UI = await import('../js/ui/deal.js');
  const { ASSETS } = await import('../js/config.js');
  const g = makeGame(['grad', 'native'], 'ops', 9);
  for (const z of [2, 3, 4, 6]) g._openZone(z);
  g.s.cash = 1e6; g.s.skills.growth = 4; g.s.skills.fintech = 3;
  for (const z of g.s.zones) for (const cls of Object.keys(ASSETS).filter((c) => (ASSETS[c].dem?.[z] || 0) >= 4).slice(0, 4)) g.s.assets.push(g._mk(g.s, cls, { zone: z, basis: 1 }));
  for (const z of g.s.zones) for (let k = 0; k < 4; k++) g._spawnLot(z);
  const lot = { kind: 'buy', zone: 4, lotId: g.s.lots[4].find((l) => l.mode === 'fixed').id }, model = (r, o = {}) => ({ ...D.modelOf(r, { reduced: false }), pick: o.pick || [], slider: 0.2 });
  const r = D.startRun(g, lot); assert.ok(r.ok, r.msg);
  const bad = [], read = UI.readHTML(model(r));
  for (const id of ['look', 'serial', 'power', 'papers', 'expert']) assert.ok(read.includes('probe-' + id) || new RegExp(`data-id="${id}"[^>]*>\\s*<span class="pic" aria-hidden="true"><svg`).test(read), `the ${id} probe card has its drawing`);
  assert.equal((read.match(/class="pic"/g) || []).length, 5, 'five probe cards, five drawings');
  assert.ok(r.act({ type: 'probe', id: 'look' }).ok); const after = UI.readHTML(model(r));
  bad.push(...svgProblems(read, 'read'), ...svgProblems(after, 'read after a probe'), ...svgProblems(UI.stepperHTML(model(r)), 'stepper'));
  assert.match(after, /class="evi" aria-hidden="true"><svg/, 'a line of evidence has the drawing of the probe that found it');
  assert.match(after, /class="probe used[^"]*"[\s\S]*?class="pok" aria-hidden="true"><svg/, 'a used probe has the tick on its corner');
  // the pitch stage: five angle cards, each with a drawing, the played one numbered
  const sold = (() => { for (const z of g.s.zones) for (const lead of g.s.leads[z]) for (const a of g.s.assets.filter((x) => x.zone === z)) { const q = g.quotePitch(a.id, lead.id); if (q.ok && q.fit >= 0.15 && !q.rejected) return { kind: 'sell', assetId: a.id, leadId: lead.id }; } return null; })();
  if (sold) {
    const p = D.startRun(g, sold); assert.ok(p.ok, p.msg);
    const html = UI.pitchHTML(model(p, { pick: ['prestige'] }));
    assert.equal((html.match(/class="aic" aria-hidden="true"><svg/g) || []).length, 5, 'five angle cards, five drawings');
    bad.push(...svgProblems(html, 'pitch'));
  }
  assert.deepEqual(bad, []);
});

test('a thing with no drawing gets no tile and no empty column (the pictures are optional; the words are not)', async () => {
  const { default: codex } = await import('../js/ui/drawers/codex.js');
  const E = (id, category, unlock) => ({ id, title: 'Page ' + id, category, summary: 'A summary of ' + id + '.', body: ['x'], example: { setup: 's', steps: ['a'], result: 'r' }, mistakes: ['m'], tryIt: 't', related: [], unlock });
  const defs = [E('a', 'Value', 'start'), E('b', 'Nowhere', 'start'), E('c', 'Nowhere', { event: 'draw' })];
  const ctx = fakeCtx({ days: 0 });
  ctx.progress = { m: { cx: { a: 0, b: 0 } }, codexList: () => defs.map((d) => ({ def: d, unlocked: ['a', 'b'].includes(d.id) })), codexUnlocked: (id) => ['a', 'b'].includes(id), unlockCodex: () => false };
  ctx.U.drawer = 'codex';
  const html = codex.html(ctx), cards = html.match(/<(?:button|div) class="cx-card[^"]*"[^>]*>/g) || [];
  assert.equal(cards.length, 3);
  assert.equal(cards.filter((c) => /has-gl/.test(c)).length, 1, 'only the page of a category with a drawing has the column for it');
  assert.equal((html.match(/class="gl-tile"/g) || []).length, 1, 'and only it has a tile');
  const q = read('css/ui-codex.css');
  assert.match(q, /\.cx-card\.has-gl \{ grid-template-columns: 2\.4rem minmax\(0, 1fr\);/, 'the column exists in the stylesheet only for a card that has a drawing');
  assert.match(read('css/ui-quests.css'), /\.qs-ach\.has-gl \{ grid-template-columns: auto minmax\(0, 1fr\); \}/);
  assert.match(read('css/ui-quests.css'), /\.qs-day\.has-gl \{ grid-template-columns: auto minmax\(0, 1fr\); \}/);
});

test('the world draws its marks with the painter and reserves their room: a district tag carries a dot or a lock before its name, a card of the map a lock, a manager over its building a pause, an audit or a warning', () => {
  const overlay = read('js/world/overlay.js'), labels = read('js/world/labels.js'), mapmode = read('js/world/mapmode.js');
  for (const [name, src] of [['overlay.js', overlay], ['labels.js', labels], ['mapmode.js', mapmode]]) { assert.match(src, /import \{ paint \} from '\.\.\/art\/paint\.js';/, `${name} paints glyphs`); assert.match(src, /import '\.\.\/art\/g-ui\.js';/, `${name} loads the interface set`); }
  assert.match(overlay, /mk = id === at \? 'mark-dot' : open \? '' : 'mark-lock'/); assert.match(overlay, /const mark = p\.status === 'audit' \? 'status-audit' : p\.status === 'paused' \? 'ctl-pause' : p\.starved \? 'mark-warn' : '';/);
  assert.doesNotMatch(overlay + labels + mapmode, /\\u\{1F512\}|\\u25CF|\\u23F8|\\u2757|\\u\{1F4CB\}/, 'no emoji or symbol is written as text on a canvas any more');
  assert.match(labels, /export const LOCK = 15;/, 'the card\'s lock has its room');
});
