// The Bank drawer against the real engine: the HTML at four stages of a run with several Background pairs, and every action it offers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeCtx, checkHTML } from './helpers/ctx.mjs';
import bank, { ledgerCsv } from '../js/ui/drawers/bank.js';
import { LOANS, DEBT, AUDIT } from '../js/config.js';

const STALE = /Zone 2|Scrap Yard profile|Bootstrapper/i;
const visible = (html) => html.replace(/<[^>]+>/g, ' ');
const PAIRS = [['trades', 'pro'], ['immigrant', 'heir'], ['grad', 'native']];
const STAGES = [0, 10, 25, 60];
const el = (dataset = {}, value = '') => ({ dataset, value, closest: () => null });

function wired(html, acts, label) {
  for (const m of html.matchAll(/data-(act|change|input)="([^"]+)"/g)) assert.ok(typeof acts[m[2]] === 'function' || (m[1] === 'act' && m[2] === 'dock'), `${label}: no handler for ${m[1]} ${m[2]}`);
  const fids = [...html.matchAll(/data-fid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(fids).size, fids.length, `${label}: data-fid values must be unique`);
  for (const m of html.matchAll(/<input\b[^>]*\bid="([^"]+)"/g)) assert.ok(html.includes(`for="${m[1]}"`), `${label}: input ${m[1]} has a label`);
  for (const m of html.matchAll(/<select\b[^>]*\bid="([^"]+)"/g)) assert.ok(html.includes(`for="${m[1]}"`), `${label}: select ${m[1]} has a label`);
}
function spies(ctx) {
  const sfx = [], bursts = [];
  ctx.sfx = new Proxy({}, { get: (o, k) => () => { sfx.push(k); } });
  ctx.burst = (o) => bursts.push(o);
  return { sfx, bursts };
}
function rich(days = 25, perks = PAIRS[0]) {
  const ctx = fakeCtx({ days, perks }), g = ctx.g();
  return { ctx, g, s: g.s, acts: bank.acts(ctx), ...spies(ctx) };
}
/** A card the slider can update in place. */
function cardStub() {
  const out = { innerHTML: '' }, amt = { textContent: '' }, btn = { textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  return { out, amt, btn, closest: () => ({ querySelector: (s) => (s === '[data-out]' ? out : s === '[data-amt]' ? amt : s === '[data-act="bank-draw"]' ? btn : null) }) };
}
const pendingAudit = (g) => { g.s.auditNext = g.s.hour; g._audits(); assert.ok(g.s.auditPending); };

// ------------------------------------------------------------------ the HTML
for (const perks of PAIRS) for (const days of STAGES) {
  test(`bank: renders cleanly on day ${days} with ${perks.join(' + ')}`, () => {
    const ctx = fakeCtx({ days, perks }), g = ctx.g(), s = g.s, acts = bank.acts(ctx);
    assert.equal(bank.visible(ctx), !!s.mil.m1);
    const b = bank.badge(ctx); assert.ok(b === null || (Number.isInteger(b) && b > 0));
    const html = bank.html(ctx);
    assert.deepEqual(checkHTML(html, 'bank'), []); assert.ok(!STALE.test(html)); assert.ok(!/\bzones?\b/i.test(visible(html)), 'district, never zone');
    wired(html, acts, `bank day ${days}`);
    assert.match(html, /role="img" aria-label="Debt to equity[^"]*Safe up to 3\.0[^"]*margin call above 4\.5/, 'the gauge describes itself');
    assert.match(html, /margin call/i); assert.match(html, /Stress test|No debt yet/);
    // what is offered follows what is open
    const cards = (html.match(/class="bk-prod/g) || []).length;
    if (!s.mil.m1) assert.equal(cards, 0, 'no loan products before the bank opens');
    else {
      assert.ok(html.includes(LOANS.micro.name) && html.includes(LOANS.pipeline.name));
      assert.equal(html.includes(LOANS.circle.name), !!g.P.circle, 'the Community Circle only for those who have one');
      assert.equal(html.includes(LOANS.enterprise.name), s.zones.includes(13), 'enterprise credit needs Corporate Valley');
    }
    assert.equal(html.includes('aria-label="Audit"'), !!s.mil.m2, 'the audit section only after Milestone 2');
    assert.equal(html.includes('aria-label="Exit"'), !!s.mil.m3, 'the exit section only after Milestone 3');
    assert.match(html, /aria-label="Ledger"/);
  });
}

test('bank: the gauge, headroom and cushion are the real numbers', () => {
  const { ctx, g } = rich(25), html = bank.html(ctx), m = ctx.money;
  const nw = g.netWorth(), debt = g.debt();
  assert.ok(html.includes(m(nw)) && html.includes(m(debt)));
  assert.ok(html.includes(m(DEBT.maxDE * nw - debt)), 'room to borrow before the 3.0 cap');
  assert.ok(html.includes(m(nw - debt / DEBT.callDE)), 'cushion before the 4.5 margin call');
  assert.match(html, new RegExp(`${g.deRatio().toFixed(2)}`));
  assert.match(html, /35% off/);
});

test('bank: the gauge changes words as leverage grows', () => {
  const { ctx, g, s } = rich(25);
  s.loans = []; const equity = g.netWorth(); assert.match(bank.html(ctx), /No debt/);
  // debt d against equity E - d (borrowing does not add to net worth): d / (E - d) = t  =>  d = t E / (1 + t)
  const aim = (t) => { s.loans = [{ id: 'D1', prod: 'micro', principal: t * equity / (1 + t), accr: 0, last: s.hour, next: s.hour + 24, drawn: s.hour }]; assert.ok(Math.abs(g.deRatio() - t) < 0.01, `aimed at ${t}, got ${g.deRatio()}`); return bank.html(ctx); };
  assert.match(aim(1.0), /Safe/); assert.equal(bank.badge(ctx), null);
  assert.match(aim(2.6), /Near the cap/); assert.match(aim(3.6), /Over the cap/); assert.equal(bank.badge(ctx), 1, 'the dock badge flags a ratio over the cap');
  const hot = aim(5.0); assert.match(hot, /Margin call/); assert.match(hot, /Stress test/); assert.match(hot, /which is a margin call/);
  assert.match(aim(2.4), /would jump to <b class="gold">3\.43<\/b>, which freezes new loans/, 'the stress test names the consequence');
  assert.match(aim(1.0), /would jump to <b class="">1\.43<\/b>, which is still fine/);
});

test('bank: refusals are explained in one line each, including the Backgrounds\' gates', () => {
  // Immigrant Hustler: no bank until $5,000, but a zero-interest Community Circle
  let { ctx, s } = rich(10, ['immigrant', 'heir']);
  s.mil.m1 = true; assert.ok(ctx.g().netWorth() < 5000);
  let html = bank.html(ctx);
  assert.match(html, /No bank will lend to you yet: your record asks for \$5,000 net worth first/);
  assert.ok(html.includes('Community Circle'), 'the circle is not a bank loan');
  assert.ok(!html.includes('data-act="bank-draw" data-p="micro"'), 'no draw button on a blocked line');
  // Second-Chance: $8,000
  ({ ctx, s } = rich(10, ['second', 'pro'])); s.mil.m1 = true;
  assert.match(bank.html(ctx), /\$8,000 net worth first/);
  // a credit freeze
  ({ ctx, s } = rich(25)); const g = ctx.g(); g.injectEvent('fed', s.hour);
  html = bank.html(ctx); assert.match(html, /Credit freeze/); assert.match(html, /no new loans until the freeze lifts/i);
  // the bank is not open before Metro Hub
  ({ ctx } = rich(10)); html = bank.html(ctx); assert.match(html, /The Commercial Bank opens at \$1,000 net worth/);
  // a fully drawn line says so
  ({ ctx, s } = rich(25)); s.loans = [{ id: 'D9', prod: 'micro', principal: 2500, accr: 0, last: s.hour, next: s.hour + 24, drawn: s.hour }];
  assert.match(bank.html(ctx), /drawn this line to its limit/);
});

test('bank: the Community Circle charges nothing and says so', () => {
  const { ctx, g } = rich(25, ['immigrant', 'heir']), html = bank.html(ctx);
  assert.ok(g.P.circle); assert.match(html, /no interest and no fee/); assert.equal(g.loanRate('circle'), 0);
});

// ------------------------------------------------------------------ borrowing and repaying
test('bank: slide to an amount, see what it does to the ratio, borrow it', () => {
  const { ctx, g, s, acts, sfx } = rich(25);
  const room = g.loanRoom('pipeline').room, debt = g.debt(), cash = s.cash; assert.ok(room > 1000);
  const card = cardStub();
  acts['bank-amt']({ dataset: { p: 'pipeline' }, value: '50', closest: card.closest });
  assert.equal(ctx.U.bank.pct.pipeline, 50);
  assert.match(card.out.innerHTML, /You receive/); assert.match(card.out.innerHTML, /Debt-to-equity goes from/); assert.ok(card.amt.textContent.startsWith('$')); assert.equal(card.btn.attrs['aria-disabled'], 'false');
  assert.match(bank.html(ctx), /value="50"/, 'the slider position survives a redraw');
  acts['bank-draw'](el({ p: 'pipeline' }));
  const taken = g.debt() - debt; assert.ok(Math.abs(taken - Math.floor(room / 2)) <= 1, `drew half the room (${taken} of ${room})`);
  assert.ok(s.cash > cash); assert.equal(s.loans.at(-1).prod, 'pipeline'); assert.equal(ctx.U.bank.pct.pipeline, 0, 'the slider resets'); assert.ok(sfx.includes('blip'));
});

test('bank: the preset buttons set the slider, and an empty draw is refused kindly', () => {
  const { ctx, s, acts } = rich(25);
  acts['bank-pct'](el({ p: 'pipeline', v: '100' })); assert.equal(ctx.U.bank.pct.pipeline, 100); assert.equal(ctx.calls.at(-1), 'render');
  ctx.U.bank.pct.pipeline = 0; const n = s.loans.length; acts['bank-draw'](el({ p: 'pipeline' }));
  assert.equal(s.loans.length, n); assert.equal(ctx.toasts.at(-1)[1], 'warn');
});

test('bank: the engine refuses a blocked draw and the drawer passes the reason on', () => {
  const { ctx, g, s, acts } = rich(10, ['immigrant', 'heir']);
  s.mil.m1 = true; ctx.U.bank = { pct: { micro: 60 } };
  acts['bank-draw'](el({ p: 'micro' }));
  assert.equal(g.debt(), 0); assert.equal(ctx.toasts.at(-1)[1], 'bad'); assert.match(ctx.toasts.at(-1)[0], /\$5,000/);
});

test('bank: repay half, then all; clearing the last loan celebrates', () => {
  const { ctx, g, s, acts, sfx, bursts } = rich(25);
  assert.ok(s.loans.length >= 1); s.cash = 1e6;
  const l = s.loans[0], owed = l.principal + l.accr, cash = s.cash;
  acts['bank-repay'](el({ id: l.id, f: 'half' })); assert.ok(Math.abs(cash - s.cash - owed / 2) < 0.01); assert.ok(sfx.includes('blip'));
  const html = bank.html(ctx); assert.match(html, /Repay all/); assert.match(html, /Total owed/);
  while (s.loans.length > 1) g.repay(s.loans[0].id);
  acts['bank-repay'](el({ id: s.loans[0].id, f: 'all' }));
  assert.equal(s.loans.length, 0); assert.equal(g.debt(), 0); assert.ok(sfx.includes('level')); assert.equal(bursts.length, 1); assert.match(ctx.toasts.at(-1)[0], /Debt-free/);
});

test('bank: with no cash, repaying says why and does nothing', () => {
  const { ctx, g, s, acts } = rich(25);
  s.cash = 0; const html = bank.html(ctx);
  assert.match(html, /You have no cash to repay with/); assert.match(html, /data-act="bank-repay"[^>]*aria-disabled="true"/);
  const debt = g.debt(); acts['bank-repay'](el({ id: s.loans[0].id, f: 'all' })); assert.equal(g.debt(), debt); assert.equal(ctx.toasts.at(-1)[1], 'bad');
});

// ------------------------------------------------------------------ the audit
test('bank: the audit offers three paths in plain words and each one works', () => {
  for (const choice of ['A', 'B', 'C']) {
    const { ctx, g, s, acts } = rich(25); pendingAudit(g); s.cash = 5e5;
    const html = bank.html(ctx);
    assert.deepEqual(checkHTML(html, 'audit'), []); wired(html, acts, 'audit');
    assert.match(html, /Respond within/); assert.match(html, /Hire a consultant for \$/); assert.match(html, /Pull a manager off the line/); assert.match(html, /Skip the filing and hope/);
    assert.match(html, new RegExp(`${Math.round(AUDIT.passChance * 100)}% chance nobody notices`)); assert.match(html, /stops for 5 days/);
    assert.match(html, /Who does the paperwork\?/);
    const pipe = s.pipes[1], cash = s.cash, passed = s.auditPass;
    if (choice === 'B') acts['bank-apipe'](el({}, pipe.id));
    acts['bank-audit'](el({ c: choice }));
    assert.equal(s.auditPending, null, `answered with ${choice}`); assert.ok(s.auditFirst);
    if (choice === 'A') { assert.ok(s.cash < cash); assert.equal(s.auditPass, passed + 1); }
    if (choice === 'B') { assert.ok(pipe.pausedUntil > s.hour, 'the chosen manager stops'); assert.equal(s.auditPass, passed + 1); }
    assert.ok(!bank.html(ctx).includes('Respond within'));
  }
});

test('bank: the audit section is a calm status when none is waiting, and the badge says when one is', () => {
  const { ctx, g } = rich(25);
  assert.match(bank.html(ctx), /No audit waiting/); assert.equal(bank.badge(ctx), null);
  pendingAudit(g); assert.equal(bank.badge(ctx), 1);
});

test('bank: a consultant you cannot afford is explained', () => {
  const { ctx, g, s } = rich(25); pendingAudit(g); s.cash = 5;
  assert.match(bank.html(ctx), /the consultant costs \$/);
});

// ------------------------------------------------------------------ the exit
test('bank: the exit shows both quotes, asks before it ends the run, and explains an IPO it cannot do', () => {
  const { ctx, g, s, acts } = rich(60);
  assert.ok(s.mil.m3); const html = bank.html(ctx);
  assert.match(html, /Trade sale/); assert.match(html, /IPO/); assert.match(html, /If you stopped now your score would be/);
  wired(html, acts, 'exit');
  acts['bank-exit'](el({ k: 'sale' })); assert.equal(ctx.calls.at(-1)[0], 'confirm'); assert.equal(s.exiting, null, 'nothing happens until the player confirms');
  assert.match(ctx.calls.at(-1)[1], /Sell the business/);
  s.auditFail = 1;
  assert.match(bank.html(ctx), /clean compliance record/);
  const calls = ctx.calls.length; acts['bank-exit'](el({ k: 'ipo' })); assert.equal(ctx.calls.length, calls); assert.equal(ctx.toasts.at(-1)[1], 'bad');
  s.auditFail = 0; acts['bank-exit'](el({ k: 'sale' })); ctx._confirm();
  assert.ok(s.exiting); assert.equal(s.exiting.kind, 'trade'); // the Bank says "sale"; the engine's own name for it is a trade sale assert.match(bank.html(ctx), /Your exit is settling/);
  void g;
});

// ------------------------------------------------------------------ the ledger
test('bank: the ledger is collapsed, opens on request, shows at most 40 lines, and filters', () => {
  const { ctx, s, acts } = rich(60);
  let html = bank.html(ctx); assert.match(html, /aria-expanded="false"/); assert.ok(!html.includes('<tbody>'));
  acts['bank-ledger'](el()); html = bank.html(ctx);
  assert.match(html, /aria-expanded="true"/); assert.match(html, /Download CSV/); wired(html, acts, 'ledger');
  const rows = (h) => (h.match(/<tr><td class="mono">/g) || []).length;
  assert.ok(s.ledger.length > 40); assert.equal(rows(html), 40);
  const type = s.ledger.find((e) => e.type === 'hire').type; acts['bank-logf'](el({}, type));
  html = bank.html(ctx); assert.ok(rows(html) > 0 && rows(html) <= 40);
  for (const m of html.matchAll(/<tr><td class="mono">\d+<\/td><td>([^<]*)<\/td>/g)) assert.equal(m[1], type);
  assert.match(html, new RegExp(`<option value="${type}" selected>`));
  acts['bank-ledger'](el()); assert.match(bank.html(ctx), /aria-expanded="false"/);
});

test('bank: the CSV keeps every line and quotes what needs it', () => {
  const csv = ledgerCsv([{ h: 30, type: 'pipe', text: 'Broker, "Gadgets" to Popup', amt: -12.5, cm: 1.234 }, { h: 48, type: 'loan', text: 'Drew', amt: 100 }]);
  const lines = csv.split('\n');
  assert.equal(lines[0], '"day","hour","type","description","amount","creativity_multiplier"');
  assert.equal(lines[1], '"2","30","pipe","Broker, ""Gadgets"" to Popup","-12.50","1.234"'); assert.equal(lines[2], '"3","48","loan","Drew","100.00",""');
  assert.equal(ledgerCsv(rich(25).s.ledger).split('\n').length, rich(25).s.ledger.length + 1);
});

test('bank: nothing in the file says zone, and the stylesheet uses tokens only', async () => {
  const fs = await import('node:fs');
  for (const f of ['../js/ui/drawers/bank.js', '../css/ui-bank.css']) {
    const src = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!STALE.test(src), f);
    assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(src.replace(/&#\d+;/g, '')), `${f} uses tokens, no literal colours`);
  }
});
