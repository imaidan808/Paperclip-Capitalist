// The Market drawer against the real engine: structure in four game states and two Background pairs, no hidden truth on the page
// (a lot's truth, a buyer's scam flag), the district rule text, and the key actions through the real engine and session API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeCtx, checkHTML } from './helpers/ctx.mjs';
import market, { ruleText, bonusText, teachName, satWords } from '../js/ui/drawers/market.js';
import { openDeal } from '../js/ui/deal.js';
import stock from '../js/ui/drawers/stock.js';
import { readFileSync } from 'node:fs';
import { ASSETS, BUYERS, ZONES, ZONE_IDS } from '../js/config.js';

const PAIRS = [['native', 'grad'], ['second', 'trades']];
const DAYS = [0, 10, 25, 60];
const TABS = ['buyers', 'lots', 'radar', 'exchange'];

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
/** A buyer in `zone` that likes what the crate is, added to the real game's leads. */
const addLead = (ctx, zone, cls, o = {}) => {
  const g = ctx.g(), seg = Object.keys(BUYERS).filter((id) => BUYERS[id].zone === zone).sort((a, b) => fitScore(cls, b) - fitScore(cls, a))[0];
  const lead = { id: 'LT' + g.s.nid++, zone, seg, budget: o.budget ?? ZONES[zone].scale * 3, need: o.need ?? null, born: g.s.hour, exp: g.s.hour + 30, ...(o.extra || {}) };
  g.s.leads[zone].push(lead);
  return lead;
};
const fitScore = (cls, seg) => { const like = BUYERS[seg].like; return Math.max(0, ...ASSETS[cls].tags.map((t) => like[t] || 0)); };
const cardOf = (html, id) => { const i = html.indexOf(id); return html.slice(html.lastIndexOf('<li', i), html.indexOf('</li>', i)); };

test('the Market html is well formed on every tab, in a fresh, day-10, day-25 and day-60 game, for two Background pairs', () => {
  for (const perks of PAIRS) for (const days of DAYS) {
    const ctx = fakeCtx({ days, perks });
    for (const tab of TABS) {
      ctx.U.marketTab = tab;
      const html = market.html(ctx), label = `${perks.join('+')} day ${days} ${tab}`;
      assert.deepEqual(checkHTML(html, label), [], label);
      noStale(html, label);
      assert.match(html, /The rule here/, label);
      assert.match(html, /Tax \d/, label); assert.match(html, /Pool \$/, label);
    }
  }
});

test('the default tab is Buyers, and Radar appears only with the Niche Radar', () => {
  const grad = fakeCtx({ days: 25, perks: ['grad', 'pro'] }), plain = fakeCtx({ days: 25, perks: ['trades', 'second'] });
  assert.match(market.html(grad), /aria-pressed="true"[^>]*>Buyers/);
  assert.match(market.html(grad), /data-t="radar"/);
  assert.ok(!/data-t="radar"/.test(market.html(plain)), 'no Radar tab without grad or the Market Research Suite');
  plain.U.marketTab = 'radar';
  assert.match(market.html(plain), /data-panel="buyers"/, 'a Radar request without the Radar falls back to Buyers');
  plain.g().s.upg.research = true;
  assert.match(market.html(plain), /data-t="radar"/);
  grad.U.marketTab = 'radar';
  const html = market.html(grad);
  assert.match(html, /data-panel="radar"/); assert.match(html, /recent sales/);
});

test('ruleText turns every district\'s rules into short plain sentences', () => {
  for (const id of ZONE_IDS) {
    const lines = ruleText(id), label = ZONES[id].name;
    assert.ok(lines.length >= 1, `${label} has a rule line`);
    for (const l of lines) {
      assert.ok(l.length > 12 && l.length < 220, `${label}: line length ${l.length}: ${l}`);
      assert.ok(!/\bzones?\b/i.test(l) && !/undefined|NaN|\[object/.test(l), `${label}: ${l}`);
    }
    assert.ok(teachName(ZONES[id].teaches) && !/-/.test(teachName(ZONES[id].teaches)), `${label} has a readable lesson name`);
  }
  assert.match(ruleText(2)[0], /haggled/);
  assert.match(ruleText(3)[0], /28-day wave/);
  assert.match(ruleText(4)[0], /counterfeit/);
  assert.match(ruleText(6)[0], /auctions/);
  assert.match(ruleText(7)[0], /broken/);
  assert.match(ruleText(8)[0], /inspected/);
  assert.match(ruleText(10)[0], /twice as fast/);
  assert.match(ruleText(11)[0], /spoils/);
  assert.match(ruleText(12)[0], /every day/);
  assert.match(ruleText(16)[0], /Price gaps/);
  assert.match(ruleText(1)[0], /barter/i);
  assert.ok(ruleText(14).some((l) => /Leverage/.test(l)), 'the credit district is explained though its rules are empty');
  assert.ok(ruleText(8).some((l) => /freight is 30% cheaper/.test(l)), 'the unlock bonus is explained');
  assert.deepEqual(bonusText(1), []);
  assert.deepEqual(ruleText(99), []);
  assert.match(satWords(0, 0), /Nobody/); assert.match(satWords(0.9, 30), /Packed/);
});

test('the banner names the district, its blurb, what it teaches, its tax and its pool', () => {
  const ctx = fakeCtx({ days: 25, perks: PAIRS[0] }), g = ctx.g();
  for (const z of g.s.zones) {
    ctx.U.zone = z;
    const html = market.html(ctx), Z = ZONES[z];
    assert.ok(html.includes(Z.name) && html.includes(Z.blurb.replace(/&/g, '&amp;').replace(/'/g, '&#39;')), `${Z.name}: name and blurb`);
    assert.ok(html.includes(ctx.esc(teachName(Z.teaches))), `${Z.name}: what it teaches`);
    assert.ok(html.includes(`Pool ${ctx.money(g.s.pool[z])} of ${ctx.money(Z.pool)}`), `${Z.name}: pool depth`);
  }
});

test('the district switcher lists the open districts and switching changes the focused one', () => {
  const ctx = fakeCtx({ days: 25, perks: PAIRS[0] }), g = ctx.g(), acts = market.acts(ctx);
  const html = market.html(ctx);
  for (const z of g.s.zones) assert.ok(html.includes(`data-act="market-zone" data-z="${z}"`), `a chip for district ${z}`);
  const locked = ZONE_IDS.find((z) => !g.s.zones.includes(z));
  assert.ok(!html.includes(`data-z="${locked}"`), 'a closed district has no chip');
  assert.match(html, /Next district:/);
  acts['market-zone']({ dataset: { z: '2' } });
  assert.equal(ctx.U.zone, 2);
  acts['market-zone']({ dataset: { z: String(locked) } });
  assert.equal(ctx.U.zone, 2, 'a closed district cannot be chosen');
  assert.match(market.html(ctx), /Flea Market Row/);
  acts['market-tab']({ dataset: { t: 'lots' } });
  assert.equal(ctx.U.marketTab, 'lots');
});

test('buyers are characters: icon, name, their line in quotes, budget, a live time bar, and Urgent only when they need something', () => {
  const ctx = fakeCtx({ days: 10, perks: PAIRS[1] }), g = ctx.g();
  ctx.U.zone = 2;
  const html = market.html(ctx);
  for (const l of g.s.leads[2]) {
    const card = cardOf(html, `lead:${l.id}`), B = BUYERS[l.seg];
    assert.ok(card.includes(B.icon) && card.includes(B.name), `${B.name} card`);
    assert.ok(card.includes('“') && card.includes('”'), 'their line is quoted');
    assert.ok(card.includes(`<div class="bar ${l.need ? 'gold' : ''}" aria-hidden="true"><i data-bar="lead:${l.id}"></i></div>`), 'the time-left bar');
    assert.ok(card.includes(ctx.money(l.budget)), 'their budget');
    assert.equal(/Urgent/.test(card), !!l.need, 'the urgent badge matches the need');
    if (l.need) assert.ok(card.includes(`needs ${/^[aeiou]/i.test(l.need) ? 'an' : 'a'} ${l.need} item`));
  }
});

test('a buyer card shows the fit and the Creativity band for the crate that would be sold, in words as well as a number', () => {
  const ctx = fakeCtx({ days: 10, perks: PAIRS[1] }), g = ctx.g();
  g.s.assets = [];
  const crate = addCrate(ctx, 'radio', 2);
  ctx.U.zone = 2;
  const lead = addLead(ctx, 2, 'radio');
  const card = cardOf(market.html(ctx), `lead:${lead.id}`);
  assert.match(card, /(Perfect|Good|Weak) fit/);
  assert.match(card, /(Linear herd trap|Crowded|Open|Balanced|Pioneer vector) \d\.\d\dx/);
  assert.match(card, /Best of yours: <b>[^<]*Radio/);
  assert.match(card, /recent|Nobody has sold|Almost nobody|classmates|popular|Crowded|Packed/i, 'the saturation in words');
  // choosing a crate by hand changes the label
  acts_use(ctx, crate.id);
  assert.match(cardOf(market.html(ctx), `lead:${lead.id}`), /Your pick: <b>/);
});
const acts_use = (ctx, id) => market.acts(ctx)['market-use']({ dataset: { id } });

test('Radar owners see exact counts behind the saturation; everyone else gets words', () => {
  const rad = fakeCtx({ days: 10, perks: ['grad', 'pro'] }), plain = fakeCtx({ days: 10, perks: ['trades', 'second'] });
  for (const ctx of [rad, plain]) { ctx.g().s.assets = []; addCrate(ctx, 'radio', 2); ctx.U.zone = 2; addLead(ctx, 2, 'radio'); }
  const idOf = (ctx) => ctx.g().s.leads[2].at(-1).id;
  assert.match(cardOf(market.html(rad), `lead:${idOf(rad)}`), /about \d+ of \d+ recent sales/);
  assert.ok(!/recent sales/.test(cardOf(market.html(plain), `lead:${idOf(plain)}`)));
});

test('Sell opens the Deal Room with the crate and the buyer', () => {
  const ctx = fakeCtx({ days: 10, perks: PAIRS[1] }), g = ctx.g(), acts = market.acts(ctx);
  g.s.assets = [];
  const crate = addCrate(ctx, 'radio', 2);
  ctx.U.zone = 2;
  const lead = addLead(ctx, 2, 'radio');
  const html = market.html(ctx);
  assert.ok(html.includes(`data-act="market-sell" data-asset="${crate.id}" data-lead="${lead.id}"`));
  acts['market-sell']({ dataset: { asset: crate.id, lead: lead.id } });
  assert.deepEqual(ctx.calls.at(-1), ['deal', { kind: 'sell', assetId: crate.id, leadId: lead.id }]);
  // a buyer who has left, or a crate that is gone, is said in words and opens nothing
  ctx.calls.length = 0;
  acts['market-sell']({ dataset: { asset: crate.id, lead: 'L-gone' } });
  acts['market-sell']({ dataset: { asset: 'A-gone', lead: lead.id } });
  assert.ok(!ctx.calls.some((c) => c[0] === 'deal'));
  assert.ok(ctx.toasts.some(([m]) => /has left/.test(m)) && ctx.toasts.some(([m]) => /crate is gone/.test(m)));
});

test('with nothing to sell here the button says why and points at the Lots', () => {
  const ctx = fakeCtx({ days: 10, perks: PAIRS[0] }), g = ctx.g(), acts = market.acts(ctx);
  g.s.assets = [];
  ctx.U.zone = 2;
  const html = market.html(ctx);
  assert.match(html, /You hold nothing to sell in Flea Market/);
  assert.match(html, /Nothing to sell here: see the lots/);
  assert.ok(!/data-act="market-sell"/.test(html));
  acts['market-tab']({ dataset: { t: 'lots' } });
  assert.equal(ctx.U.marketTab, 'lots');
  // holding crates elsewhere says so
  ctx.U.marketTab = 'buyers';
  addCrate(ctx, 'radio', 1);
  assert.match(market.html(ctx), /Ship stock in from another district/);
  // a broken crate a buyer will not take: the reason is named
  const g2 = fakeCtx({ days: 10, perks: PAIRS[0] }); g2.g().s.assets = [];
  addCrate(g2, 'radio', 2, { cond: 'broken' });
  g2.U.zone = 2;
  const buyer = g2.g().s.leads[2].find((l) => !g2.g().acceptsBroken(l.seg));
  if (buyer) assert.match(cardOf(market.html(g2), `lead:${buyer.id}`), /will not take a broken crate|fit this buyer|Nothing you hold/);
});

test('buyer scams stay hidden until verified; Verify costs a little and then says fraud or genuine', () => {
  const ctx = fakeCtx({ days: 10, perks: ['native', 'grad'] }), g = ctx.g(), acts = market.acts(ctx);
  g.s.assets = [];
  addCrate(ctx, 'radio', 2);
  ctx.U.zone = 2;
  const real = addLead(ctx, 2, 'radio'), scam = addLead(ctx, 2, 'radio', { extra: { scam: true } });
  let html = market.html(ctx);
  assert.match(html, /Scam magnet/);
  for (const l of [real, scam]) assert.match(cardOf(html, `lead:${l.id}`), /Verify this buyer \(\$/);
  const before = html;
  // flipping every hidden flag changes nothing on the page
  for (const l of g.s.leads[2]) if (!l.verified) l.scam = !l.scam;
  assert.equal(market.html(ctx), before, 'the page is the same whether a buyer is a scam or not');
  for (const l of g.s.leads[2]) if (!l.verified) l.scam = l.id === scam.id;
  g.s.cash = 100;
  acts['market-verify']({ dataset: { lead: scam.id } });
  acts['market-verify']({ dataset: { lead: real.id } });
  assert.ok(g.s.cash < 100, 'verifying costs money');
  html = market.html(ctx);
  assert.match(cardOf(html, `lead:${scam.id}`), /Fraud\./); assert.ok(!/data-act="market-sell"[^>]*data-lead="/.test(cardOf(html, `lead:${scam.id}`)), 'no Sell for a fraud');
  assert.match(cardOf(html, `lead:${real.id}`), /Verified/); assert.match(cardOf(html, `lead:${real.id}`), /market-sell/);
  assert.ok(ctx.toasts.some(([m, l]) => /Fraud confirmed/.test(m) && l === 'warn'));
  assert.ok(ctx.toasts.some(([m, l]) => /genuine/.test(m) && l === 'good'));
  // no scam magnet, no Verify
  const calm = fakeCtx({ days: 10, perks: PAIRS[1] }); calm.U.zone = 2;
  assert.ok(!/Verify this buyer|Scam magnet/.test(market.html(calm)));
});

test('the page never shows a lot\'s hidden truth: changing it changes nothing on screen', () => {
  for (const perks of PAIRS) for (const days of [10, 25, 60]) {
    const ctx = fakeCtx({ days, perks }), g = ctx.g();
    ctx.U.marketTab = 'lots';
    const lots = Object.values(g.s.lots).flat();
    assert.ok(lots.length >= 4);
    const set = (truth) => { for (const l of lots) l.truth = truth(); };
    set(() => ({ q: 0.6137, fake: true, defects: [{ id: 'd0', label: 'SENTINEL-DEFECT-XYZ' }, { id: 'd1', label: 'SENTINEL-TWO' }] }));
    const a = market.html(ctx);
    set(() => ({ q: 1.1983, fake: false, defects: [] }));
    const b = market.html(ctx);
    assert.equal(a, b, `${perks.join('+')} day ${days}: the same page whatever the lots really are`);
    for (const needle of ['0.6137', '61.4', 'SENTINEL', '1.1983', '"fake"', 'truth', 'defect']) assert.ok(!a.includes(needle), `no "${needle}" on the page`);
    // the crates the player already holds, shown on the Stock page
    const crates = g.s.assets.filter((x) => !x.known);
    for (const c of crates) c.truth = { q: 0.6137, fake: true, defects: [] };
    const s1 = stock.html(ctx);
    for (const c of crates) c.truth = { q: 1.1983, fake: false, defects: [] };
    assert.equal(s1, stock.html(ctx));
  }
});

test('lots are booths: the price, Working or Broken, the district\'s quality line, and Auction when it is one', () => {
  const ctx = fakeCtx({ days: 25, perks: PAIRS[1] }), g = ctx.g();
  ctx.U.marketTab = 'lots'; ctx.U.zone = 4;
  const lots = g.s.lots[4];
  assert.ok(lots.length >= 1);
  lots[0].mode = 'auction'; lots[0].cond = 'broken';
  const html = market.html(ctx);
  for (const l of lots) {
    const card = cardOf(html, `data-lot="${l.id}"`);
    assert.ok(card.includes(ASSETS[l.cls].name) && card.includes(ctx.money(l.price)), `${l.cls} name and price`);
    assert.match(card, /Working|Broken/);
    assert.equal(/<span class="badge">Auction<\/span>/.test(card), l.mode === 'auction');
    assert.match(card, /Look it over/); assert.match(card, /Quick buy/);
    assert.match(card, /Not inspected yet/);
  }
  assert.match(html, /Things here are rarely what they seem/);
  ctx.U.zone = 1;
  assert.match(market.html(ctx), /close to how they are described/);
});

test('the free counterfeit warning and the player\'s own read are shown, nothing else about authenticity is', () => {
  const ctx = fakeCtx({ days: 25, perks: PAIRS[1] }), g = ctx.g();
  ctx.U.marketTab = 'lots'; ctx.U.zone = 4;
  while (g.s.lots[4].length < 3) g._spawnLot(4); // how many lots the bot's day-25 shelf holds depends on the content, so the test makes sure of three
  const [a, b, c] = g.s.lots[4];
  for (const l of g.s.lots[4]) { delete l.warn; delete l.belief; }
  a.warn = true;
  b.belief = { quality: 0.93, fakeProb: 0.12, confidence: 0.6 };
  c.belief = { quality: 0.8, fakeProb: 0.85, confidence: 0.9 };
  c.truth = { q: 1, fake: false, defects: [] }; // the read can be wrong, and the page believes the player's read, not the truth
  const html = market.html(ctx);
  assert.match(cardOf(html, `data-lot="${a.id}"`), /Counterfeit warning/);
  assert.ok(!/Counterfeit warning/.test(cardOf(html, `data-lot="${b.id}"`)));
  assert.match(cardOf(html, `data-lot="${b.id}"`), /looks 0\.9 quality, 12% chance it is fake/);
  assert.match(cardOf(html, `data-lot="${c.id}"`), /Likely a fake/);
});

// The shell's own ctx.deal: the real Deal Room, drawn into the fake dialog (it records what it paints), over the real engine.
const withRoom = (ctx) => { ctx.deal = (spec) => { ctx.calls.push(['deal', spec]); return openDeal(ctx, spec); }; return ctx; };
const heard = (g) => { const seen = []; g.onEvent = (e) => seen.push(e.type); return seen; };

test('Look it over opens the Deal Room; Quick buy opens it too and plays it with the room\'s own Quick deal', () => {
  const ctx = fakeCtx({ days: 10, perks: PAIRS[0] }), g = ctx.g(), acts = market.acts(ctx);
  ctx.U.zone = 2; ctx.U.marketTab = 'lots';
  g.s.cash = 1e6;
  const lot = g.s.lots[2][0], crates = g.s.assets.length;
  acts['market-look']({ dataset: { lot: lot.id } });
  assert.deepEqual(ctx.calls.at(-1), ['deal', { kind: 'buy', zone: 2, lotId: lot.id }]);
  // with a stand-in room that only records the spec, Quick buy asks for the same deal and buys nothing by itself
  acts['market-buy']({ dataset: { lot: lot.id } });
  assert.deepEqual(ctx.calls.at(-1), ['deal', { kind: 'buy', zone: 2, lotId: lot.id }], 'Quick buy opens the same deal as Look it over');
  assert.equal(g.s.assets.length, crates, 'the card no longer calls the engine\'s buyLot behind the room\'s back');
  assert.ok(g.s.lots[2].some((l) => l.id === lot.id), 'the lot is still on the shelf until the room has played');
  // with the real room: the deal is played at average skill, the crate arrives, and the engine hears what a hand-played purchase sends (a read, a haggle or an auction, then the buy)
  withRoom(ctx); const seen = heard(g), cash = g.s.cash;
  acts['market-buy']({ dataset: { lot: lot.id } });
  assert.equal(g.s.assets.length, crates + 1, 'the crate arrived');
  assert.ok(!g.s.lots[2].some((l) => l.id === lot.id), 'the lot is gone');
  assert.ok(g.s.cash < cash);
  assert.ok(seen.includes('buy'), 'the buy is heard (the haggle is counted once the purchase has gone through, so it may follow it)');
  assert.ok(seen.includes('inspect') && seen.some((t) => t === 'haggle' || t === 'auction'), `a Quick buy is read and haggled or bid for like any other: ${seen.join(', ')}`);
  assert.match(ctx.calls.filter((c) => c[0] === 'dlg').at(-1)[1], /deal-result/, 'and the room shows its result');
  // a lot that has gone is said, not crashed on, by both buttons
  for (const act of ['market-look', 'market-buy']) {
    ctx.calls.length = 0; ctx.toasts.length = 0;
    acts[act]({ dataset: { lot: lot.id } });
    assert.ok(!ctx.calls.some((c) => c[0] === 'deal'), act);
    assert.ok(ctx.toasts.some(([m]) => /lot is gone/.test(m)), act);
  }
});

test('Quick buy on a lot you cannot afford opens the room, which says why, and plays nothing', () => {
  const ctx = withRoom(fakeCtx({ days: 10, perks: PAIRS[0] })), g = ctx.g(), acts = market.acts(ctx);
  ctx.U.zone = 2; ctx.U.marketTab = 'lots';
  g.s.cash = 0;
  const lot = g.s.lots[2][0];
  let html = market.html(ctx);
  assert.match(cardOf(html, `data-lot="${lot.id}"`), /data-act="market-buy"[^>]*aria-disabled="true"/);
  assert.match(cardOf(html, `data-lot="${lot.id}"`), /You need \$/);
  const seen = heard(g), crates = g.s.assets.length;
  acts['market-buy']({ dataset: { lot: lot.id } });
  assert.equal(g.s.assets.length, crates); assert.equal(g.s.cash, 0); assert.deepEqual(seen, [], 'nothing was played, so the engine heard nothing');
  assert.match(ctx.calls.filter((c) => c[0] === 'dlg').at(-1)[1], /You need at least/, 'the room says why');
  g.s.cash = 1e6;
  while (g.s.assets.filter((a) => a.zone === 2).length < g.storeCap(2)) addCrate(ctx, 'radio', 2);
  html = market.html(ctx);
  assert.match(html, /Storage is full here/);
  assert.match(html, /Storage here: \d+ of \d+ <span class="badge red">Full/);
  const before = g.s.assets.length; seen.length = 0;
  acts['market-buy']({ dataset: { lot: lot.id } });
  assert.equal(g.s.assets.length, before); assert.deepEqual(seen, []);
  assert.match(ctx.calls.filter((c) => c[0] === 'dlg').at(-1)[1], /Storage is full here/, 'a full yard is said by the room too');
});

test('an auction lot says what Quick buy does now: it bids at average skill, and a rival may win', () => {
  const ctx = fakeCtx({ days: 10, perks: PAIRS[0] }), g = ctx.g();
  ctx.U.zone = 2; ctx.U.marketTab = 'lots';
  g.s.lots[2][0].mode = 'auction';
  const html = market.html(ctx);
  assert.match(html, /Quick buy bids for you at average skill, and a rival may outbid you/);
  assert.ok(!/skips the bidding|pays the guide price/.test(html), 'the card no longer promises a purchase at the guide price');
  assert.ok(!/\.buyLot\(/.test(readFileSync(new URL('../js/ui/drawers/market.js', import.meta.url), 'utf8')), 'the Market drawer never buys a lot itself: every purchase is a deal');
});

test('the Exchange lists invitations, sent offers and a proposal form, and every action goes through the session', () => {
  const ctx = fakeCtx({ days: 25, perks: PAIRS[0] }), g = ctx.g(), S = ctx.S, acts = market.acts(ctx);
  const mine = g.s.assets.find((a) => a.cond === 'ok');
  const mk = (n, cls, zone, like = {}) => { const a = { id: 'NPC-' + n, cls, cond: 'ok', quality: 1, wear: 1, zone, ...like }; return { ...a, fmv: g.val(a) }; };
  const theirs = [mk(1, mine.cls, mine.zone, { quality: mine.quality, wear: mine.wear }), mk(2, 'bike', 1)];
  S.roster = () => [{ pid: 'NPC-1', handle: 'Practice Partner', perks: ['pro'], skills: { ops: 3, growth: 3, fintech: 3 }, npc: true, inventory: theirs, nw: 0 }];
  const seen = [];
  S.incoming = [{ offer: { id: 'O1', from: 'X', fromHandle: 'Sam', give: { assets: [{ id: 'z', cls: 'radio', cond: 'ok', quality: 1, wear: 1, zone: 1 }], cash: 0, royalty: null }, want: { assets: [], cash: 0 } }, handle: 'Sam' }];
  S.sent = new Map([['O2', { offer: { id: 'O2', to: 'NPC-1', give: { assets: [{ cls: 'bike', cond: 'ok' }], cash: 0 }, want: { assets: [], cash: 0 } } }]]);
  S.acceptIncoming = (id) => { seen.push(['accept', id]); return { ok: true, msg: 'Deal done.' }; };
  S.declineIncoming = (id) => seen.push(['decline', id]);
  S.withdraw = (id) => { seen.push(['withdraw', id]); return { ok: true, msg: 'Offer withdrawn.' }; };
  S.propose = (args) => { seen.push(['propose', args]); return g.createOffer(args); };
  ctx.U.marketTab = 'exchange';
  const html = market.html(ctx);
  assert.deepEqual(checkHTML(html, 'exchange'), []);
  noStale(html, 'exchange');
  assert.match(html, /Practice partner/); assert.match(html, /Sam<\/b> offers/); assert.match(html, /Waiting on NPC-1/);
  assert.match(html, /Approve/); assert.match(html, /Reject/); assert.match(html, /Withdraw/);
  assert.match(html, /Fair-value check/);
  assert.match(html, /Exchange <span class="mkt-n">1<\/span><span class="sr"> waiting<\/span>/);
  assert.equal(market.badge(ctx) >= 1, true, 'the badge counts waiting offers');
  acts['market-accept']({ dataset: { id: 'O1' } }); acts['market-decline']({ dataset: { id: 'O1' } }); acts['market-withdraw']({ dataset: { id: 'O2' } });
  assert.deepEqual(seen.map((x) => x[0]), ['accept', 'decline', 'withdraw']);

  // a lopsided proposal is blocked with the guardrail's words, and keeps the player's crates
  ctx.U.sel.add(mine.id);
  acts['market-want']({ dataset: { id: 'NPC-1' } });
  acts['market-xfield']({ dataset: { k: 'wantCash' }, value: '1000000' });
  const blocked = [];
  ctx.dlg.open = (h, o) => blocked.push([h, o]);
  const held = g.s.assets.length;
  acts['market-send']({ dataset: {} });
  assert.equal(blocked.length, 1, 'a blocked proposal opens a dialog');
  assert.match(blocked[0][0], /Proposal blocked/); assert.match(blocked[0][0], /Extreme Asymmetric Premium Warning/);
  assert.equal(g.s.assets.length, held, 'nothing left the shelf');
  assert.equal(g.s.escrow.length, 0);

  // a fair one goes through: the same crate for the same crate
  acts['market-xfield']({ dataset: { k: 'wantCash' }, value: '' });
  const sentBefore = seen.filter((x) => x[0] === 'propose').length;
  acts['market-send']({ dataset: {} });
  assert.equal(seen.filter((x) => x[0] === 'propose').length, sentBefore + 1);
  assert.ok(g.s.escrow.some((e) => e.assets.some((a) => a.id === mine.id)), 'the crate is held in escrow');
  assert.ok(!ctx.U.sel.has(mine.id), 'the selection is cleared');
  assert.ok(ctx.toasts.some(([m, l]) => l === 'good' && /escrow/.test(m)));
  assert.match(stock.html(ctx), /Offered to a classmate/);
});

test('typing in the Exchange keeps the form state and refreshes the table in place', () => {
  const ctx = fakeCtx({ days: 10, perks: PAIRS[0] }), g = ctx.g(), acts = market.acts(ctx);
  const theirs = [{ id: 'NPC-1', cls: 'bike', cond: 'ok', quality: 1, wear: 1, zone: 1, fmv: 20 }];
  ctx.S.roster = () => [{ pid: 'P1', handle: 'Pat', skills: { ops: 1, growth: 1, fintech: 1 }, inventory: theirs }];
  let box = { innerHTML: '' };
  ctx.$ = (s) => (s === '[data-matrix]' ? box : null);
  ctx.U.marketTab = 'exchange';
  ctx.U.sel.add(g.s.assets[0].id);
  acts['market-xfield']({ dataset: { k: 'giveCash' }, value: '12.5' });
  acts['market-xfield']({ dataset: { k: 'roy' }, value: '3' });
  assert.match(box.innerHTML, /12\.50 cash|\$12\.50/);
  const html = market.html(ctx);
  assert.match(html, /data-k="giveCash"[^>]*value="12.5"/); assert.match(html, /data-k="roy"[^>]*value="3"/);
  assert.ok(!/Practice partner/.test(html), 'no practice callout for a real classmate');
  acts['market-xto']({ dataset: {}, value: 'P1' });
  assert.equal(ctx.U.exch.to, 'P1');
  // no one online
  ctx.S.roster = () => [];
  assert.match(market.html(ctx), /Nobody is online to trade with yet/);
  acts['market-send']({ dataset: {} });
  assert.ok(ctx.toasts.some(([m]) => /Choose someone/.test(m)));
});

test('the dock badge counts urgent buyers you can serve plus waiting offers, and is empty otherwise', () => {
  const ctx = fakeCtx({ days: 10, perks: PAIRS[1] }), g = ctx.g();
  g.s.assets = []; ctx.U.zone = 2; ctx.S.incoming = []; g.s.leads[2] = [];
  assert.equal(market.badge(ctx), null);
  const crate = addCrate(ctx, 'radio', 2);
  addLead(ctx, 2, 'radio', { need: ASSETS.radio.tags[0] });
  assert.equal(market.badge(ctx), 1);
  ctx.S.incoming = [{ offer: { id: 'O9' }, handle: 'A' }];
  assert.equal(market.badge(ctx), 2);
  assert.ok(crate);
});

test('the Stock Offer button lands on the Exchange tab', () => {
  const ctx = fakeCtx({ days: 25, perks: PAIRS[0] });
  stock.acts(ctx)['stock-offer']({ dataset: {} });
  assert.match(market.html(ctx), /data-panel="exchange"/);
  stock.acts(ctx)['stock-gomarket']({ dataset: {} });
  assert.match(market.html(ctx), /data-panel="lots"/);
});

test('every control is a labelled button or input and no id can collide with another drawer', () => {
  const ctx = fakeCtx({ days: 25, perks: PAIRS[0] });
  ctx.S.roster = () => [{ pid: 'P1', handle: 'Pat', skills: { ops: 1, growth: 1, fintech: 1 }, inventory: [{ id: 'N1', cls: 'bike', cond: 'ok', quality: 1, wear: 1, zone: 1, fmv: 20 }] }];
  for (const tab of TABS) {
    ctx.U.marketTab = tab;
    const html = market.html(ctx);
    assert.ok(!/ id="/.test(html), `${tab}: no ids`);
    assert.ok(!/onclick=|<a /.test(html), `${tab}: only data-act buttons`);
    for (const m of html.matchAll(/<(input|select)\b[^>]*>/g)) {
      const at = html.indexOf(m[0]), before = html.lastIndexOf('<label', at), close = html.indexOf('</label>', at);
      assert.ok(before > -1 && close > at && html.indexOf('</label>', before) >= close, `${tab}: ${m[1]} sits inside its label`);
    }
    for (const m of html.matchAll(/data-act="([a-z-]+)"/g)) assert.match(m[1], /^market-/, `${tab}: act ${m[1]} is namespaced`);
  }
});

test('every control carries a data-fid so the shell can give the cursor back after a redraw', () => {
  const ctx = fakeCtx({ days: 25, perks: PAIRS[0] });
  ctx.S.roster = () => [{ pid: 'P1', handle: 'Pat', skills: { ops: 1, growth: 1, fintech: 1 }, inventory: [{ id: 'N1', cls: 'bike', cond: 'ok', quality: 1, wear: 1, zone: 1, fmv: 20 }] }];
  const pages = [];
  for (const tab of TABS) { ctx.U.marketTab = tab; pages.push(market.html(ctx)); }
  for (const a of ctx.g().s.assets) ctx.U.sel.add(a.id);
  pages.push(stock.html(ctx));
  for (const html of pages) for (const m of html.matchAll(/<(button|input|select)\b[^>]*>/g)) assert.match(m[0], /data-fid="[^"]+"/, `no data-fid on ${m[0].slice(0, 90)}`);
  for (const html of pages) { const f = [...html.matchAll(/data-fid="([^"]+)"/g)].map((m) => m[1]); assert.equal(new Set(f).size, f.length, 'data-fid values are unique on a page'); }
});

test('the district banner keeps its text readable on every district\'s palette (WCAG 4.5:1)', () => {
  const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  const tokens = {};
  for (const [, k, v] of (read('../css/styles.css').match(/:root\s*\{([^}]*)\}/)?.[1] || '').matchAll(/--([\w-]+):\s*([^;]+);/g)) tokens[k] = v.trim();
  const share = +/color-mix\(in srgb, var\(--zg[^)]*\)\) (\d+)%, var\(--panel2\)\)/.exec(read('../css/ui-market.css'))?.[1] / 100;
  assert.ok(share > 0 && share < 0.5, 'the banner mixes a little of the district ground into the panel');
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const Z of Object.values(ZONES)) {
    const ground = rgb(Z.palette[0]), panel = rgb(tokens.panel2), bg = ground.map((v, i) => v * share + panel[i] * (1 - share));
    for (const ink of ['ink', 'mute', 'cyan', 'gold', 'green', 'red']) assert.ok(ratio(rgb(tokens[ink]), bg) >= 4.5, `${Z.name}: ${ink} on its banner is ${ratio(rgb(tokens[ink]), bg).toFixed(2)}`);
  }
});
