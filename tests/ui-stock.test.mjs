// The Stock drawer against the real engine: structure in four game states and two Background pairs, no hidden truth on the page, and the key actions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeCtx, checkHTML } from './helpers/ctx.mjs';
import stock from '../js/ui/drawers/stock.js';
import { ASSETS, ZONES } from '../js/config.js';

const PAIRS = [['native', 'grad'], ['second', 'trades']];
const DAYS = [0, 10, 25, 60];

/** Text a person (or a screen reader) gets: text nodes plus aria-label and title values. */
const visibleText = (html) => [html.replace(/<[^>]*>/g, ' '), ...[...html.matchAll(/(?:aria-label|title)="([^"]*)"/g)].map((m) => m[1])].join(' \n ').replace(/&amp;/g, '&');
const noStale = (html, label) => {
  const t = visibleText(html);
  assert.ok(!/Zone \d/i.test(t), `${label}: says "Zone N"`);
  assert.ok(!/\bzones?\b/i.test(t), `${label}: says "zone" where it should say "district"`);
  assert.ok(!/bootstrapper/i.test(t), `${label}: says Bootstrapper`);
  assert.ok(!/profile/i.test(t), `${label}: says profile`);
};
const addCrate = (ctx, cls, zone, o = {}) => {
  const g = ctx.g(), a = g._mk(g.s, cls, { zone, basis: o.basis ?? 10, cond: o.cond || 'ok', from: 'lot' });
  Object.assign(a, o.extra || {});
  g.s.assets.push(a);
  return a;
};
const digitalClass = () => Object.keys(ASSETS).find((c) => ASSETS[c].tags.includes('digital') && ASSETS[c].base > 20);

test('the Stock html is well formed in a fresh, day-10, day-25 and day-60 game, for two Background pairs', () => {
  for (const perks of PAIRS) for (const days of DAYS) {
    const ctx = fakeCtx({ days, perks }), label = `${perks.join('+')} day ${days}`;
    // with a ticked crate too, so the action bar is on the page
    const html0 = stock.html(ctx);
    assert.deepEqual(checkHTML(html0, label), [], label);
    noStale(html0, label);
    for (const a of ctx.g().s.assets) ctx.U.sel.add(a.id);
    const html1 = stock.html(ctx);
    assert.deepEqual(checkHTML(html1, label + ' (all ticked)'), [], label);
    noStale(html1, label + ' (all ticked)');
    assert.match(html1, /Sell to the pool/);
    assert.match(html0, /Storage \d+ of \d+/);
  }
});

test('the badge is the number of crates', () => {
  const ctx = fakeCtx({ days: 25, perks: PAIRS[0] });
  assert.equal(stock.badge(ctx), ctx.g().s.assets.length);
  ctx.g().s.assets = [];
  assert.equal(stock.badge(ctx), null);
});

test('crates are grouped by district, the focused district first, with the storage meter for it', () => {
  const ctx = fakeCtx({ days: 25, perks: PAIRS[0] });
  const g = ctx.g();
  const zones = [...new Set(g.s.assets.map((a) => a.zone))];
  assert.ok(zones.length >= 2, 'the day-25 bot holds crates in several districts');
  ctx.U.zone = zones[zones.length - 1];
  const html = stock.html(ctx);
  for (const z of zones) assert.ok(html.includes(`data-district="${z}"`), `a group for ${ZONES[z].name}`);
  const order = zones.map((z) => html.indexOf(`data-district="${z}"`));
  assert.equal(Math.min(...order), order[zones.length - 1], 'the focused district comes first');
  assert.match(html, new RegExp(`Storage ${[...g.s.assets].filter((a) => a.zone === ctx.U.zone).length} of ${g.storeCap(ctx.U.zone)}`));
});

test('a crate shows what it is worth, what was paid, and gain or loss with an arrow as well as colour', () => {
  const ctx = fakeCtx({ days: 10, perks: PAIRS[0] }), g = ctx.g();
  g.s.assets = [];
  const up = addCrate(ctx, 'radio', 1, { basis: 0.01 }), down = addCrate(ctx, 'bike', 1, { basis: 900 });
  const html = stock.html(ctx);
  const card = (a) => html.slice(html.indexOf(`data-id="${a.id}"`), html.indexOf('</li>', html.indexOf(`data-id="${a.id}"`)));
  assert.match(card(up), /▲/); assert.match(card(up), /class="green"/); assert.match(card(up), /Gain of/);
  assert.match(card(down), /▼/); assert.match(card(down), /class="red"/); assert.match(card(down), /Loss of/);
  assert.ok(card(up).includes(ctx.money(g.val(up))) && card(down).includes('You paid'), 'worth now and what was paid');
  assert.ok(card(down).includes(ctx.money(900)));
});

test('an inspected crate shows the player\'s own read; an uninspected one says so', () => {
  const ctx = fakeCtx({ days: 10, perks: PAIRS[1] }), g = ctx.g();
  g.s.assets = [];
  const seen = addCrate(ctx, 'radio', 1, { extra: { belief: { quality: 0.93, fakeProb: 0.12, confidence: 0.8 } } }), blind = addCrate(ctx, 'bike', 1);
  const html = stock.html(ctx);
  const card = (a) => html.slice(html.indexOf(`data-id="${a.id}"`), html.indexOf('</li>', html.indexOf(`data-id="${a.id}"`)));
  assert.match(card(seen), /looks 0\.9 quality, 12% chance it is fake/);
  assert.match(card(blind), /Not inspected/);
  seen.belief.fakeProb = 0.8;
  assert.match(stock.html(ctx), /Likely a fake/);
});

test('a known counterfeit is plainly worth almost nothing', () => {
  const ctx = fakeCtx({ days: 10, perks: PAIRS[0] }), g = ctx.g();
  g.s.assets = [];
  const fake = addCrate(ctx, 'radio', 1, { basis: 40, extra: { known: true, truth: { q: 1, fake: true, defects: [] } } });
  const html = stock.html(ctx);
  assert.match(html, /Counterfeit/); assert.match(html, /Worth almost nothing/);
  assert.ok(g.val(fake) < 40 * 0.2, 'the engine values a known fake at a fraction of the price');
  assert.match(html, /▼/);
});

test('the page never shows a crate\'s hidden truth: changing it changes nothing on screen', () => {
  for (const perks of PAIRS) {
    const ctx = fakeCtx({ days: 25, perks }), g = ctx.g();
    const hidden = g.s.assets.filter((a) => !a.known);
    assert.ok(hidden.length >= 1, 'the day-25 bot bought something it has not verified');
    const set = (truth) => { for (const a of hidden) { a.truth = truth(); a.known = false; } };
    set(() => ({ q: 0.6137, fake: true, defects: [{ id: 'd0', label: 'SENTINEL-DEFECT-XYZ' }] }));
    const a = stock.html(ctx);
    set(() => ({ q: 1.1983, fake: false, defects: [] }));
    const b = stock.html(ctx);
    assert.equal(a, b, 'the same page whatever the crates really are');
    for (const needle of ['0.6137', '61.4', 'SENTINEL', '1.1983', '"fake"', 'truth']) assert.ok(!a.includes(needle), `no "${needle}" on the page`);
  }
});

test('stock-pick, stock-pickzone and stock-clear keep the shared selection', () => {
  const ctx = fakeCtx({ days: 25, perks: PAIRS[0] }), acts = stock.acts(ctx), g = ctx.g();
  const [a, b] = g.s.assets;
  acts['stock-pick']({ dataset: { id: a.id }, checked: true });
  assert.ok(ctx.U.sel.has(a.id));
  acts['stock-pick']({ dataset: { id: a.id }, checked: false });
  assert.ok(!ctx.U.sel.has(a.id));
  const zone = b.zone, here = g.s.assets.filter((x) => x.zone === zone);
  acts['stock-pickzone']({ dataset: { z: String(zone) } });
  assert.ok(here.every((x) => ctx.U.sel.has(x.id)), 'tick all in a district');
  acts['stock-pickzone']({ dataset: { z: String(zone) } });
  assert.ok(here.every((x) => !ctx.U.sel.has(x.id)), 'untick all in a district');
  ctx.U.sel.add(a.id); ctx.U.sel.add('A-gone');
  acts['stock-pick']({ dataset: { id: b.id }, checked: true });
  assert.ok(!ctx.U.sel.has('A-gone'), 'a crate that no longer exists leaves the selection');
  acts['stock-clear']({ dataset: {} });
  assert.equal(ctx.U.sel.size, 0);
  assert.ok(ctx.calls.includes('render'));
});

test('selling to the pool asks first, shows the as-described figure (never the truth-weighted offer), then sells', () => {
  const ctx = fakeCtx({ days: 10, perks: PAIRS[0] }), g = ctx.g(), acts = stock.acts(ctx);
  g.s.assets = [];
  g.s.pool[1] = ZONES[1].pool;
  const a = addCrate(ctx, 'bike', 1, { basis: 5, extra: { known: false, belief: null, truth: { q: 0.7, fake: true, defects: [] } } });
  const exact = g.poolQuote([a.id], false, { blind: false }).total, described = g.val(a) * (1 - g.poolQuote([a.id]).fric); // an ordinary pool quote is blind (as described); only the sale itself checks the crate
  assert.ok(Math.abs(g.poolQuote([a.id]).total - described) < 1e-9, 'a plain pool quote is the as-described figure');
  assert.ok(exact < described * 0.2 && described > 5, 'the real offer is far below the as-described figure');
  let box = null;
  ctx.confirmBox = (title, body, ok, fn) => { box = { title, body, ok }; ctx._confirm = fn; };
  ctx.U.sel.add(a.id);
  acts['stock-sellpool']({ dataset: {} });
  assert.ok(box, 'a confirmation was asked');
  assert.ok(box.body.includes(ctx.money(described)), 'the as-described figure is shown');
  assert.ok(!box.body.includes(ctx.money(exact)), 'the truth-weighted offer is not shown');
  assert.match(box.body, /checks what it buys/);
  const cash = g.s.cash;
  ctx._confirm();
  assert.ok(!g.s.assets.some((x) => x.id === a.id), 'the crate is sold');
  assert.ok(g.s.cash > cash, 'the money arrived');
  assert.ok(!ctx.U.sel.has(a.id), 'the selection is cleared');
  assert.ok(ctx.toasts.some(([m]) => m.includes(`Sold 1 crate for ${ctx.money(exact)}`)), 'the real total is told afterwards');
});

test('selling with nothing ticked, or from two districts at once, is refused in words', () => {
  const ctx = fakeCtx({ days: 25, perks: PAIRS[0] }), g = ctx.g(), acts = stock.acts(ctx);
  acts['stock-sellpool']({ dataset: {} });
  assert.ok(ctx.toasts.some(([m]) => /Tick a crate/.test(m)));
  // whatever the bot happens to hold, make sure there is a crate in each of two different districts
  const a = g.s.assets[0] || (g.s.assets.push(g._mk(g.s, 'paperclip', { zone: g.s.zones[0] })), g.s.assets[0]);
  let b = g.s.assets.find((x) => x.zone !== a.zone);
  if (!b) { b = g._mk(g.s, 'paperclip', { zone: g.s.zones.find((z) => z !== a.zone) ?? a.zone + 1 }); g.s.assets.push(b); }
  ctx.U.sel.add(a.id); ctx.U.sel.add(b.id);
  const html = stock.html(ctx);
  assert.match(html, /Pick crates from one district/);
  assert.match(html, /data-act="stock-sellpool"[^>]*aria-disabled="true"/);
  ctx.toasts.length = 0;
  acts['stock-sellpool']({ dataset: {} });
  assert.ok(ctx.toasts.length === 1 && ctx.toasts[0][1] === 'warn', 'the act says why');
  assert.ok(!ctx.calls.some((c) => c[0] === 'confirm'));
});

test('digital goods can be routed to the district that pays most', () => {
  const ctx = fakeCtx({ days: 10, perks: PAIRS[0] }), g = ctx.g(), acts = stock.acts(ctx);
  const cls = digitalClass();
  assert.ok(cls && g.s.zones.length >= 2);
  g.s.assets = [];
  const a = addCrate(ctx, cls, g.s.zones[0], { basis: 1 });
  ctx.U.sel.add(a.id);
  assert.match(stock.html(ctx), /Route digital/);
  let box = null;
  ctx.confirmBox = (title, body, ok, fn) => { box = { title, body }; ctx._confirm = fn; };
  acts['stock-route']({ dataset: {} });
  assert.match(box.title, /Route/);
  assert.match(box.body, /arrives after <b>48 virtual hours/);
  ctx._confirm();
  assert.ok(!g.s.assets.some((x) => x.id === a.id));
  assert.ok(g.s.settle.length >= 1, 'routed sales settle later');
  // a physical crate gets no routing button
  const b = addCrate(ctx, 'bike', 1); ctx.U.sel.clear(); ctx.U.sel.add(b.id);
  assert.ok(!/Route digital/.test(stock.html(ctx)));
});

test('a broken crate offers a repair that opens the Deal Room', () => {
  const ctx = fakeCtx({ days: 10, perks: PAIRS[1] }), g = ctx.g(), acts = stock.acts(ctx);
  g.s.assets = [];
  const cls = Object.keys(ASSETS).find((c) => ASSETS[c].repair && ASSETS[c].dem[1] > 0) || Object.keys(ASSETS).find((c) => ASSETS[c].repair);
  const a = addCrate(ctx, cls, ctx.g().s.zones[0], { cond: 'broken' });
  const html = stock.html(ctx);
  assert.match(html, /Broken/); assert.match(html, new RegExp(`data-act="stock-repair" data-id="${a.id}"`));
  assert.match(html, /Repair costs about/);
  acts['stock-repair']({ dataset: { id: a.id } });
  assert.deepEqual(ctx.calls.at(-1), ['deal', { kind: 'repair', assetId: a.id }]);
  // from the selection bar, with no id on the button
  ctx.U.sel.add(a.id);
  assert.match(stock.html(ctx), /data-act="stock-repair" data-fid="st-stock-repair"/);
  acts['stock-repair']({ dataset: {} });
  assert.deepEqual(ctx.calls.at(-1), ['deal', { kind: 'repair', assetId: a.id }]);
});

test('Ship hands the crates to the Travel drawer; Offer opens the classmate Exchange', () => {
  const ctx = fakeCtx({ days: 25, perks: PAIRS[0] }), g = ctx.g(), acts = stock.acts(ctx);
  const here = g.s.assets.filter((a) => a.zone === g.s.assets[0].zone);
  for (const a of here) ctx.U.sel.add(a.id);
  acts['stock-ship']({ dataset: {} });
  assert.deepEqual(ctx.U.shipIds, here.map((a) => a.id));
  assert.deepEqual(ctx.calls.at(-1), ['open', 'travel']);
  const other = g.s.assets.find((a) => a.zone !== here[0].zone);
  ctx.U.sel.add(other.id); ctx.calls.length = 0; ctx.U.shipIds = null;
  acts['stock-ship']({ dataset: {} });
  assert.equal(ctx.U.shipIds, null, 'nothing is handed over from two districts');
  assert.ok(!ctx.calls.some((c) => c[0] === 'open'));
  acts['stock-offer']({ dataset: {} });
  assert.equal(ctx.U.marketTab, 'exchange');
  assert.deepEqual(ctx.calls.at(-1), ['open', 'market']);
});

test('shipping with only one district open says why', () => {
  const ctx = fakeCtx({ days: 0, perks: PAIRS[0] }), acts = stock.acts(ctx);
  ctx.U.sel.add(ctx.g().s.assets[0].id);
  const html = stock.html(ctx);
  assert.match(html, /Shipping needs a second district/);
  acts['stock-ship']({ dataset: {} });
  assert.ok(ctx.toasts.some(([m]) => /second district/.test(m)));
  assert.ok(!ctx.calls.some((c) => c[0] === 'open'));
});

test('an empty shelf is friendly and points at the Market', () => {
  for (const perks of PAIRS) {
    const ctx = fakeCtx({ days: 10, perks }), acts = stock.acts(ctx);
    ctx.g().s.assets = [];
    const html = stock.html(ctx);
    assert.deepEqual(checkHTML(html, 'empty'), []);
    noStale(html, 'empty');
    assert.match(html, /Your shelves are empty/); assert.match(html, /Buy your first lot/);
    acts['stock-gomarket']({ dataset: {} });
    assert.equal(ctx.U.marketTab, 'lots');
    assert.deepEqual(ctx.calls.at(-1), ['open', 'market']);
  }
});

test('crates on the road are listed with a live arrival bar', () => {
  const ctx = fakeCtx({ days: 10, perks: PAIRS[0] }), g = ctx.g();
  const a = g.s.assets[0];
  const r = g.ship([a.id], g.s.zones.find((z) => z !== a.zone));
  if (!r.ok) { g.s.cash += 1000; assert.ok(g.ship([a.id], g.s.zones.find((z) => z !== a.zone)).ok); }
  const html = stock.html(ctx);
  assert.match(html, /On the road to/);
  assert.match(html, /<div class="bar" aria-hidden="true"><i data-bar="freight:/);
  assert.deepEqual(checkHTML(html, 'road'), []);
});

test('every control is a labelled button or input', () => {
  const ctx = fakeCtx({ days: 25, perks: PAIRS[0] });
  for (const a of ctx.g().s.assets) ctx.U.sel.add(a.id);
  const html = stock.html(ctx);
  for (const m of html.matchAll(/<input\b[^>]*type="checkbox"[^>]*>/g)) {
    const at = html.indexOf(m[0]), before = html.lastIndexOf('<label', at), close = html.indexOf('</label>', at);
    assert.ok(before > -1 && close > at && html.indexOf('</label>', before) >= close, 'a checkbox sits inside its label');
  }
  assert.ok(!/ id="/.test(html), 'no ids to collide with another drawer');
  assert.ok(!/onclick=|<a /.test(html), 'only data-act buttons');
});

test('the starting paperclip is a gift, not a loss; swapped crates say what they were worth when they came in', () => {
  const ctx = fakeCtx({ days: 0, perks: PAIRS[0] }), g = ctx.g();
  const start = g.s.assets[0];
  assert.equal(start.from, 'start');
  let html = stock.html(ctx);
  assert.match(html, /Your starting crate/);
  assert.ok(!/You paid/.test(html) && !/▼/.test(html), 'no paid price and no loss on the gift');
  const swapped = addCrate(ctx, 'bike', 1, { basis: 5, extra: { from: 'barter' } });
  html = stock.html(ctx);
  const card = html.slice(html.indexOf(`data-id="${swapped.id}"`), html.indexOf('</li>', html.indexOf(`data-id="${swapped.id}"`)));
  assert.match(card, /Worth when you got it/);
});
