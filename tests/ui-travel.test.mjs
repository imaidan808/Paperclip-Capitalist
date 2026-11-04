// The Travel drawer, against the real engine: fresh, day 10, day 25 and day 60 states for two Background pairs; the path, the rule and reward words,
// the freight flow and the actions a click runs (go to a district, pick a destination, ship crates, read about the idea).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeCtx, checkHTML } from './helpers/ctx.mjs';
import travel, { shipPlan, pickedCrates, keepScroll, scrollToTop, TIERS } from '../js/ui/drawers/travel.js';
import { rulePhrases, rewardPhrases, lessonTitle, lessonGist } from '../js/ui/drawers/districttext.js';
import { CODEX } from '../js/meta/codex.js';
import { ZONES, ZONE_IDS } from '../js/config.js';
import { TEACHES } from '../js/data/schema.js';

const STALE = /Zone 2|Island|Bootstrapper|profile/i;
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const el = (dataset = {}, value = '') => ({ dataset, value });
const STATES = [0, 10, 25, 60];
const PAIRS = [['trades', 'pro'], ['connected', 'grad']];

/** Put one crate worth shipping into the player's district (zone 1) and make sure freight is affordable. */
function addCrates(ctx, cls = ['radio', 'bike'], zone = 1) {
  const g = ctx.g(), s = g.s, made = cls.map((c) => g._mk(s, c, { zone }));
  s.assets.push(...made); s.cash += 500;
  ctx.U.shipIds = made.map((a) => a.id);
  return made;
}

test('every district has a rule in plain words, never the word zone (the words are districttext.js, which the Market drawer reads too)', () => {
  for (const id of ZONE_IDS) {
    const rules = rulePhrases(ZONES[id]), w = rewardPhrases(ZONES[id]);
    assert.ok(rules.length >= 1 && rules.every((r) => r.length > 20 && r.endsWith('.') && !/undefined|NaN|\[object/.test(r)), `district ${id}: ${rules}`);
    assert.ok(!/zone/i.test(rules.join(' ') + w.join(' ')), `district ${id} says zone`);
    assert.ok(w.every((x) => x.endsWith('.')), `district ${id} reward: ${w}`);
    assert.deepEqual(rulePhrases(id), rules, 'accepts an id as well as a district');
  }
  assert.equal(rulePhrases(6)[0], `${Math.round(ZONES[6].rules.auction * 100)}% of lots are auctions.`);
  assert.match(rulePhrases(8)[0], /inspected/);
  assert.match(rulePhrases(10)[0], /twice as fast/);
  assert.match(rulePhrases(4).join(' '), /counterfeit/);
  assert.match(rulePhrases(4).join(' '), /auctions/);
  assert.match(rulePhrases(3)[0], /28-day/);
  assert.match(rulePhrases(1).join(' '), /barter/i);
  assert.match(rewardPhrases(8).join(' '), /Freight costs 30% less everywhere/);
  assert.match(rewardPhrases(7).join(' '), /Repairs cost 10% less everywhere/);
  assert.match(rulePhrases(5)[0], /Managers, clients, upgrades and the Bank open here/, 'a feature a district opens is its rule, said once: the reward lists only what it gives for good');
  assert.deepEqual(rewardPhrases(5), []);
  assert.deepEqual(rewardPhrases(1), [], 'the first districts give nothing but the lesson');
  assert.deepEqual(rulePhrases(99), []);
});

test('the sixteen lessons are named once, by the Codex, and read the same in Travel and the Market', () => {
  for (const id of TEACHES) {
    const entry = CODEX.find((c) => c.id === id);
    assert.equal(lessonTitle(id), entry.title, `${id}: the Codex's title`); assert.equal(lessonGist(id), entry.summary);
    assert.equal(ZONE_IDS.filter((z) => ZONES[z].teaches === id).length, 1);
  }
  assert.equal(lessonTitle('constructor'), 'Constructor', 'an unknown id never reads the prototype');
  assert.equal(TIERS.length, 4);
  for (const t of TIERS) assert.equal(ZONE_IDS.filter((z) => ZONES[z].tier === t.n).length, 4);
});

for (const days of STATES) for (const perks of PAIRS) {
  test(`html at day ${days} with ${perks.join(' + ')}: valid, plain, all sixteen districts`, () => {
    const ctx = fakeCtx({ days, perks }), s = ctx.g().s;
    for (const picked of [false, true]) {
      if (picked) addCrates(ctx);
      for (const tab of ['path', 'freight']) {
        ctx.U.travel = { tab, sig: ctx.U.shipIds?.join(',') ?? '' };
        const h = travel.html(ctx);
        assert.deepEqual(checkHTML(h, `${days}/${tab}`), []);
        assert.ok(!STALE.test(h), 'a stale v1 term');
        assert.ok(!/zone/i.test(h), 'the word zone');
        if (tab === 'path') {
          for (const id of ZONE_IDS) assert.ok(h.includes(ZONES[id].name.replace(/&/g, '&amp;')), `${ZONES[id].name} missing`);
          assert.equal((h.match(/class="tv-d /g) || []).length, 16);
          assert.equal((h.match(/class="chip good">✓ Open/g) || []).length, s.zones.length, 'one Open chip per open district');
          assert.equal((h.match(/→ Next stop/g) || []).length, s.zones.length < 16 ? 1 : 0, 'exactly one next stop');
          assert.equal((h.match(/class="chip">🔒 /g) || []).length, Math.max(0, 16 - s.zones.length - 1), 'a locked district is one line with its gate');
          assert.equal((h.match(/data-act="travel-codex"/g) || []).length, s.zones.length, 'every open district links to its Codex page (a locked one has no page to read)');
          assert.equal((h.match(/data-act="travel-go"/g) || []).length, s.zones.length, 'a Go button on open districts only');
          assert.match(text(h), new RegExp(`${s.zones.length} of 16 districts open`));
        }
      }
    }
  });
}

test('the next district shows a progress bar of net worth toward its gate and the dollars missing', () => {
  const ctx = fakeCtx({ days: 0 }), h = travel.html(ctx), g = ctx.g();
  assert.match(h, /aria-label="Net worth toward Flea Market Row"/);
  assert.match(text(h), /to go/);
  assert.match(text(h), /Campus Quad 🔒 \$80\.00/, 'a locked district beyond the next is one line that states its gate');
  assert.ok(!text(h).includes(rulePhrases(3)[0]), 'and keeps its rule, reward and lesson under the line');
  const pct = +h.match(/Net worth toward Flea Market Row" aria-valuemin="0" aria-valuemax="100" aria-valuenow="(\d+)"/)[1];
  assert.equal(pct, Math.floor(Math.min(1, g.netWorth() / ZONES[2].gate) * 100));
});

test('a district card carries its rule, the lesson as a button to its Codex page, and the way in; the next stop adds what opening it gives', () => {
  const ctx = fakeCtx({ days: 25 }), h = travel.html(ctx), g = ctx.g(), next = ZONE_IDS.find((id) => !g.s.zones.includes(id));
  assert.match(text(h), new RegExp(`${Math.round(ZONES[6].rules.auction * 100)}% of lots are auctions\\.`));
  assert.match(text(h), /Teaches Supply Chains/);
  assert.match(h, /data-act="travel-codex" data-id="supply-chain"[^>]*aria-label="Read about Supply Chains in the Codex"/);
  assert.ok(h.includes(`title="${ctx.esc(lessonGist('supply-chain'))}"`), 'the lesson in a line is the button\'s hover');
  assert.ok(h.includes('title="Opening it gave you: Freight costs 30% less everywhere."'), 'what an open district gave is the hover on its name');
  assert.match(text(h), new RegExp(`${ZONES[next].name} → Next stop`));
  assert.match(text(h), /Opening it: /, 'the next stop says what opening it gives');
  assert.ok(text(h).includes(`of ${ctx.money(ZONES[next].gate)} net worth.`), 'and says what its gate measures');
  assert.match(h, /You are here/);
  assert.doesNotMatch(text(h), /Reward you earned|In your Codex/, 'said once');
});

test('a locked district past the next is one line; its rule, reward and lesson open under it, and the same words are its hover', () => {
  const ctx = fakeCtx({ days: 25 }), g = ctx.g(), acts = travel.acts(ctx), s = g.s;
  const far = ZONE_IDS.filter((id) => !s.zones.includes(id)).at(-1), Z = ZONES[far];
  let h = travel.html(ctx);
  const row = (html) => { const at = html.lastIndexOf('<li class="tv-d locked"', html.indexOf(`<summary data-act="travel-fold" data-k="d${far}"`)); return at < 0 ? '' : html.slice(at, html.indexOf('</li>', at)); };
  const reward = rewardPhrases(Z).join(' '), tip = `Opens at ${ctx.money(Z.gate)} net worth. ${rulePhrases(Z)[0]}${reward ? ` Opening it: ${reward}` : ''} Teaches ${lessonTitle(Z.teaches)}.`;
  assert.ok(h.includes(`title="${ctx.esc(tip)}"`), 'the hover carries the rule, the reward and the lesson');
  assert.ok(!text(h).includes(rulePhrases(Z)[0]), 'but the rule is not on the page until the line is opened');
  assert.match(h, new RegExp(`<summary data-act="travel-fold" data-k="d${far}"`));
  acts['travel-fold'](el({ k: `d${far}` }));
  assert.equal(ctx.U.fold[`travel.d${far}`], true); assert.equal(ctx.calls.at(-1), 'render');
  h = travel.html(ctx);
  assert.match(h, /<details class="cx-more" open>/); assert.ok(text(h).includes(rulePhrases(Z)[0]), 'opened, the rule is there');
  assert.match(text(h), new RegExp(`Teaches ${lessonTitle(Z.teaches).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.ok(/<details class="cx-more" open>/.test(row(h)) && text(row(h)).includes(rulePhrases(Z)[0]), 'it opens inside its own line');
  assert.ok(text(row(h)).includes(`Opens at ${ctx.money(Z.gate)} net worth.`), 'and says what its amount is');
  acts['travel-fold'](el({ k: `d${far}` })); assert.ok(!text(travel.html(ctx)).includes(rulePhrases(Z)[0]), 'and shut again');
});

test('travel-go moves the player, aims the camera and closes the drawer; a locked district refuses', () => {
  const ctx = fakeCtx({ days: 25 }), a = travel.acts(ctx), s = ctx.g().s, focus = [];
  ctx.world = () => ({ focusZone: (id, animate) => focus.push([id, animate]) });
  ctx.U.drawer = 'travel';
  const to = s.zones.find((z) => z !== ctx.U.zone);
  a['travel-go'](el({ dist: String(to) }));
  assert.equal(ctx.U.zone, to);
  assert.equal(ctx.U.drawer, null, 'the drawer closed');
  assert.deepEqual(focus, [[to, true]]);
  // the real world view keeps its world one level down
  const ctx2 = fakeCtx({ days: 25 }), f2 = []; ctx2.world = () => ({ world: { focusZone: (id) => f2.push(id) } });
  travel.acts(ctx2)['travel-go'](el({ dist: String(to) })); assert.deepEqual(f2, [to]);
  // no world at all is fine
  const ctx3 = fakeCtx({ days: 25 }); ctx3.world = () => null; travel.acts(ctx3)['travel-go'](el({ dist: String(to) })); assert.equal(ctx3.U.zone, to);
  // a locked district
  const ctx4 = fakeCtx({ days: 0 }); ctx4.U.drawer = 'travel';
  travel.acts(ctx4)['travel-go'](el({ dist: '12' }));
  assert.equal(ctx4.U.zone, 1); assert.equal(ctx4.U.drawer, 'travel');
  assert.match(ctx4.toasts.at(-1)[0], /still locked/); assert.equal(ctx4.toasts.at(-1)[1], 'warn');
  travel.acts(ctx4)['travel-go'](el({ dist: 'banana' })); assert.equal(ctx4.U.zone, 1);
});

test('the Codex button opens the Codex and says which idea was asked for', () => {
  const ctx = fakeCtx({ days: 10 }), a = travel.acts(ctx);
  a['travel-codex'](el({ id: 'negotiation' }));
  assert.deepEqual(ctx.calls.at(-1), ['open', 'codex']); assert.equal(ctx.U.codexFocus, 'negotiation');
  a['travel-stock'](); assert.deepEqual(ctx.calls.at(-1), ['open', 'stock']);
});

test('with no crates picked the freight tab sends the player to Stock', () => {
  const ctx = fakeCtx({ days: 25 }); ctx.U.shipIds = [];
  assert.equal(travel.html(ctx).includes('data-tab="freight"'), true);
  ctx.U.travel = { tab: 'freight', sig: '' };
  const h = travel.html(ctx);
  assert.match(text(h), /No crates picked/); assert.match(h, /data-act="travel-stock"/); assert.doesNotMatch(h, /data-act="travel-ship"/);
  assert.equal(shipPlan(ctx).rows.length, 0);
  travel.acts(ctx)['travel-ship'](el({ dist: '2' }));
  assert.match(ctx.toasts.at(-1)[0], /Pick crates in Stock/);
});

test('picked crates open the freight tab with a quote for every other open district', () => {
  const ctx = fakeCtx({ days: 25 }), g = ctx.g(), s = g.s, made = addCrates(ctx);
  const h = travel.html(ctx);
  assert.match(h, /data-tab="freight"[^>]*aria-pressed="true"/, 'the freight tab opens by itself when crates are picked');
  const plan = shipPlan(ctx);
  assert.deepEqual(plan.rows.map((r) => r.to), s.zones.filter((z) => z !== 1));
  assert.equal((h.match(/data-act="travel-pick"/g) || []).length, plan.rows.length);
  for (const r of plan.rows) {
    const q = g.freightQuote(made.map((a) => a.id), r.to);
    assert.ok(Math.abs(r.q.cost - q.cost) < 1e-9);
    const gap = made.reduce((x, a) => x + g.val(a, r.to) - g.val(a), 0);
    assert.ok(Math.abs(r.gap - gap) < 1e-9, 'the gap is val(there) minus val(here)');
  }
  assert.match(text(h), /Freight \$[\d.,]+ · \d+ h · damage risk \d+% \((low|medium|high)\) · room for \d+/);
  assert.match(text(h), /Worth \$[\d.,]+ (more|less) there/);
  assert.match(h, /aria-pressed="true"[^>]*>\s*<span class="tv-dn">/, 'one destination is chosen');
  assert.match(text(h), /Ship 2 crates to .+ for \$/);
  assert.ok(plan.chosen && plan.rows.includes(plan.chosen));
});

test('a destination with customs says so, and a full or too-dear destination blocks the Ship button with a reason', () => {
  const ctx = fakeCtx({ days: 0 }), g = ctx.g(), s = g.s;
  g._openZone(2); g._openZone(8); s.zones.sort((a, b) => a - b);
  addCrates(ctx);
  const a = travel.acts(ctx);
  a['travel-pick'](el({ dist: '8' }));
  let h = travel.html(ctx);
  assert.match(text(h), /Customs may inspect it: a 25% chance of a 12-hour delay/);
  assert.equal(shipPlan(ctx).chosen.to, 8);
  // too little cash
  s.cash = 0;
  h = travel.html(ctx);
  assert.match(h, /data-act="travel-ship"[^>]*aria-disabled="true"/);
  assert.match(text(h), /You need \$[\d.,]+ more cash/);
  // no room
  s.cash = 1000;
  for (let i = 0; i < 30; i++) s.assets.push(g._mk(s, 'paperclip', { zone: 8 }));
  h = travel.html(ctx);
  assert.match(h, /data-act="travel-ship"[^>]*aria-disabled="true"/);
  assert.match(text(h), /Only room for 0 more crates/);
  const before = s.freight.length; a['travel-ship'](el({ dist: '8' }));
  assert.equal(s.freight.length, before, 'the engine refuses and the player is told');
  assert.equal(ctx.toasts.at(-1)[1], 'bad');
});

test('shipping runs through the engine: cash is paid, crates leave, a freight card with a live bar appears, the pick is cleared', () => {
  const ctx = fakeCtx({ days: 25 }), g = ctx.g(), s = g.s, made = addCrates(ctx), ids = made.map((a) => a.id), a = travel.acts(ctx);
  const to = shipPlan(ctx).rows[0].to, quote = g.freightQuote(ids, to), cash = s.cash, n = s.freight.length;
  ctx.U.sel = new Set(ids);
  a['travel-pick'](el({ dist: String(to) }));
  assert.equal(shipPlan(ctx).chosen.to, to);
  a['travel-ship'](el({ dist: String(to) }));
  assert.equal(s.freight.length, n + 1);
  assert.ok(Math.abs(cash - s.cash - quote.cost) < 1e-6, 'paid the quoted freight');
  assert.ok(ids.every((id) => !s.assets.some((x) => x.id === id)), 'the crates left');
  assert.deepEqual(ctx.U.shipIds, []); assert.equal(ctx.U.sel.size, 0);
  assert.equal(ctx.toasts.at(-1)[1], 'good');
  assert.match(ctx.toasts.at(-1)[0], /Shipped 2 crates to .+ arrive in about \d+ h|In transit for \d+ virtual hours/, 'the player is told, by the engine or by the drawer');
  const h = travel.html(ctx), f = s.freight.at(-1);
  assert.match(h, /data-tab="freight"[^>]*aria-pressed="true"/, 'the player lands on the freight tab');
  assert.ok(h.includes(`<i data-bar="freight:${f.id}"></i>`), 'a live bar for the new shipment');
  assert.match(h, /role="progressbar" aria-label="Freight to /);
  assert.match(text(h), new RegExp(`2 crates to ${ZONES[to].name}`));
  assert.deepEqual(checkHTML(h), []);
  for (const fr of s.freight) assert.ok(h.includes(`data-bar="freight:${fr.id}"`), `bar for ${fr.id}`);
  assert.deepEqual(pickedCrates(ctx), []);
});

test('crates in different districts, or ones that are gone, are explained instead of failing', () => {
  const ctx = fakeCtx({ days: 25 }), g = ctx.g(), s = g.s;
  const x = g._mk(s, 'radio', { zone: 1 }), y = g._mk(s, 'bike', { zone: 2 }); s.assets.push(x, y);
  ctx.U.shipIds = [x.id, y.id, 'A-gone'];
  assert.deepEqual(pickedCrates(ctx), [x.id, y.id]);
  const h = travel.html(ctx);
  assert.match(text(h), /These crates sit in different districts/); assert.doesNotMatch(h, /data-act="travel-pick"/);
  assert.deepEqual(checkHTML(h), []);
  ctx.U.shipIds = ['A-gone', 'A-also-gone'];
  assert.match(text(travel.html(ctx)), /No crates picked|Districts/);
  // only one district open: nowhere to ship
  const one = fakeCtx({ days: 0 }); addCrates(one);
  assert.match(text(travel.html(one)), /no other district to ship to yet/);
});

test('when no destination pays after freight the drawer says so', () => {
  const ctx = fakeCtx({ days: 25 }), g = ctx.g(), s = g.s; s.cash += 100;
  let found = null;
  for (const cls of ['van', 'fleet', 'sneakers', 'gadgets', 'electronics', 'textbooks', 'saas', 'pen']) for (const zone of s.zones) {
    const a = g._mk(s, cls, { zone }); s.assets.push(a); ctx.U.shipIds = [a.id];
    const plan = shipPlan(ctx);
    if (plan.rows.length && !plan.rows.some((r) => r.net > 0)) { found = a; break; }
    s.assets.pop();
  }
  assert.ok(found, 'some good is best sold where it is');
  const h = travel.html(ctx);
  assert.match(text(h), /No district pays more after freight/); assert.doesNotMatch(h, /Best price/);
  assert.match(text(h), /Worth \$[\d.,]+ less there/);
  // and the Best price chip appears when a district does pay
  const ctx2 = fakeCtx({ days: 25 }); addCrates(ctx2);
  const h2 = travel.html(ctx2); assert.match(h2, /★ Best price/); assert.doesNotMatch(text(h2), /No district pays more/);
});

test('tabs: the choice sticks while the crates stay the same and the drawer falls back to the right tab when they change', () => {
  const ctx = fakeCtx({ days: 25 }), a = travel.acts(ctx);
  ctx.U.shipIds = [];
  assert.match(travel.html(ctx), /data-tab="path"[^>]*aria-pressed="true"/);
  a['travel-tab'](el({ tab: 'freight' }));
  assert.match(travel.html(ctx), /data-tab="freight"[^>]*aria-pressed="true"/);
  addCrates(ctx);                                         // Stock picks crates: the open tab is not stuck on an old choice
  assert.match(travel.html(ctx), /data-tab="freight"[^>]*aria-pressed="true"/);
  a['travel-tab'](el({ tab: 'path' }));
  assert.match(travel.html(ctx), /data-tab="path"[^>]*aria-pressed="true"/);
  ctx.U.shipIds = [];
  a['travel-clear']();
  assert.deepEqual(ctx.U.shipIds, []);
});

test('the dock icon: Travel shows from the second district, with no badge', () => {
  assert.equal(travel.id, 'travel'); assert.equal(travel.icon, '🧭'); assert.equal(travel.label, 'Travel');
  assert.equal(travel.visible(fakeCtx({ days: 0 })), false);
  assert.equal(travel.visible(fakeCtx({ days: 10 })), true);
  assert.equal(travel.badge(fakeCtx({ days: 10 })), null);
});

test('every control is a real button with a label and a stable focus id, and every action it names exists', () => {
  for (const days of [0, 25]) {
    const ctx = fakeCtx({ days }), acts = travel.acts(ctx);
    if (days) addCrates(ctx);
    for (const tab of ['path', 'freight']) {
      ctx.U.travel = { tab, sig: ctx.U.shipIds?.join(',') ?? '' };
      const h = travel.html(ctx);
      assert.ok(!/<(a|div|span)[^>]*\bdata-act=/.test(h), 'actions sit on buttons only');
      const fids = [...h.matchAll(/data-fid="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(new Set(fids).size, fids.length, 'focus ids are unique');
      const buttons = [...h.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
      assert.ok(buttons.length >= 3);
      for (const b of buttons) { assert.ok(/data-fid=/.test(b), `a button without a focus id: ${b}`); assert.ok(/data-act="travel-[a-z]+"/.test(b), 'prefixed action'); }
      for (const m of h.matchAll(/data-act="([^"]+)"/g)) assert.equal(typeof acts[m[1]], 'function', `no action ${m[1]}`);
    }
  }
});

test('keepScroll puts a long list back where the player left it after the shell rebuilds the drawer', () => {
  const real = globalThis.MutationObserver; let rebuild = null;
  globalThis.MutationObserver = class { constructor(fn) { rebuild = fn; } observe() {} };
  try {
    const mkDb = (id) => ({ classList: { contains: (c) => c === 'db' }, dataset: { drawer: id }, scrollTop: 0 });
    let db = mkDb('travel'), listener = null;
    const host = { addEventListener: (t, fn, cap) => { assert.equal(t, 'scroll'); assert.equal(cap, true, 'scroll does not bubble: listen on the way down'); listener = fn; }, querySelector: () => db };
    const ctx = fakeCtx({ days: 0 }); ctx.el = { drawer: host };
    keepScroll(ctx, ['travel']); keepScroll(ctx, ['quests']);                       // two drawers share one observer
    const first = listener;
    keepScroll(ctx, ['quests']); assert.equal(listener, first, 'only one listener');
    db.scrollTop = 640; listener({ target: db });                                  // the player scrolls
    db = mkDb('travel'); rebuild();                                                // the shell sets new html: a fresh body at the top
    assert.equal(db.scrollTop, 640, 'put back');
    scrollToTop(ctx); db = mkDb('travel'); rebuild(); assert.equal(db.scrollTop, 0, 'a change of tab starts at the top');
    db.scrollTop = 300; listener({ target: db }); db = mkDb('quests'); rebuild(); assert.equal(db.scrollTop, 0, 'another drawer starts at the top');
    db.scrollTop = 90; listener({ target: db }); db = mkDb('quests'); rebuild(); assert.equal(db.scrollTop, 90, 'and the second drawer is kept too');
    db = mkDb('stock'); listener({ target: { classList: { contains: () => false } } }); rebuild(); assert.equal(db.scrollTop, 0, 'a drawer that did not ask is left alone');
    db = null; rebuild();                                                          // the drawer closed
    db = mkDb('quests'); rebuild(); assert.equal(db.scrollTop, 0, 'reopened at the top');
    keepScroll(fakeCtx({ days: 0 }), ['travel']);                                  // no drawer element: nothing happens
  } finally { globalThis.MutationObserver = real; }
});
