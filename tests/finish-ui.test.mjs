// The finish round for the screens: the follow-ups the engine track asked for (docs/BALANCE.md, "The Draft screen and the wreck price", which was the "Open" note then).
//   1. The Stock drawer's repair estimate is the repair bench's own (js/deal.js benchQuote): "up to $X", and Repair is shut, with the reason beside it, when the cash does not reach it.
//   2. The instructor can see and copy the room's recovery code, is told the live room runs only from this browser unless it is saved, and the title screen has a "Resume as instructor" form.
//   3. The Draft screen's "buyer flow" counts a bigger buyer budget (leadBudget) at the weight the engine gives it.
//   4. The open market asks more for a wreck as Ops rises (x1.00 at Ops 1 up to x2.05 at Ops 6): the Codex's repair entries and Academy lessons 5 and 10 say so, with numbers rebuilt from the engine.
// Run: node --test tests/finish-ui.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSETS, ECON, PERKS } from '../js/config.js';
import { PERK_PAIRS, perkMods } from '../js/data/perks.js';
import { Game } from '../js/engine.js';
import { Cohort } from '../js/cohort.js';
import { assetFMV } from '../js/market.js';
import * as D from '../js/deal.js';
import { Session, cleanOwner, kv } from '../js/session.js';
import stock, { NEED_CASH } from '../js/ui/drawers/stock.js';
import { instructorParts, recoveryHTML, copyRecovery, FOLLOW_SECONDS, FOLLOW_NOTE } from '../js/ui/instructor.js';
import { traitScores, summaryOf, TRAIT_EDGE, BUDGET_WEIGHT } from '../js/ui/draft.js';
import { CODEX } from '../js/meta/codex.js';
import { ACADEMY } from '../js/meta/academy.js';
import { fakeCtx, checkHTML } from './helpers/ctx.mjs';

const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const near = (a, b, eps = 0.006) => Math.abs(a - b) <= eps;
const usd = (x) => `$${Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const DASHES = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');

// ============================================================================================================================ 1. the Stock drawer's repair estimate
/** A broken Barn-Find Classic Roadster in Auto Row, held by a founder with no Ops bonus (Ops 1: the bill is $1,350, the most it can run to $1,755). */
function benchWorld(cash) {
  const ctx = fakeCtx({ days: 10, perks: ['veteran', 'roots'] }), g = ctx.g(), acts = stock.acts(ctx);
  g._openZone(5); g._openZone(6); g._openZone(7);
  g.s.skills.ops = 1; g.s.assets = [];
  const a = g._mk(g.s, 'classicCar', { zone: 7, basis: 3000, cond: 'broken', from: 'lot' }); g.s.assets.push(a);
  ctx.U.zone = 7;
  g.s.cash = cash;
  return { ctx, g, acts, a };
}

test('Stock: the repair estimate is the bench\'s own: the cost, and up to the most the bill can run to, the same two numbers the Deal Room plans from', () => {
  const { ctx, g, a } = benchWorld(100000);
  const q = D.benchQuote(g, a.id), plan = D.planFor(g, { kind: 'repair', assetId: a.id });
  assert.ok(q.ok && near(q.cost, 1350) && near(q.most, 1350 * D.REPAIR_MOST), `${q.cost} / ${q.most}`);
  assert.equal(plan.quote.cost, q.cost, 'the bench plans from the same quote'); assert.equal(plan.quote.most, q.most);
  const html = stock.html(ctx), m = ctx.money;
  assert.match(html, /Repair costs about/);
  assert.ok(html.includes(`Repair costs about <b class="mono">${m(q.cost)}</b>, up to <b class="mono">${m(q.most)}</b> if the marker slips`), 'the drawer says the bench\'s two figures');
  assert.deepEqual(checkHTML(html, 'stock with a repair'), []);
  assert.ok(!/aria-disabled/.test(html.slice(html.indexOf('data-act="stock-repair"'), html.indexOf('</button>', html.indexOf('data-act="stock-repair"')))), 'with the cash in hand the Repair button is open');
  assert.ok(!html.includes('stk-fixwhy'), 'and nothing is explained away');
});

test('Stock: Repair is shut, with the reason beside it, when the cash does not reach the most a bill can run to, and the bench says the same', () => {
  const { ctx, g, acts, a } = benchWorld(0);
  const most = D.benchQuote(g, a.id).most;
  for (const [cash, open] of [[most - 0.01, false], [most, true], [most + 1, true], [D.benchQuote(g, a.id).cost + 1, false]]) {
    g.s.cash = cash; ctx.calls.length = 0; ctx.toasts.length = 0;
    const q = D.benchQuote(g, a.id), html = stock.html(ctx), button = html.slice(html.lastIndexOf('<button', html.indexOf('data-act="stock-repair"')), html.indexOf('</button>', html.indexOf('data-act="stock-repair"')));
    assert.equal(q.affordable, open, `cash ${cash}`);
    assert.equal(/aria-disabled="true"/.test(button), !open, `cash ${cash}: the button is ${open ? 'open' : 'shut'}`);
    assert.equal(html.includes('stk-fixwhy'), !open);
    acts['stock-repair']({ dataset: { id: a.id } });
    if (open) assert.deepEqual(ctx.calls.at(-1), ['deal', { kind: 'repair', assetId: a.id }], 'it opens the Deal Room');
    else {
      assert.ok(!ctx.calls.some((c) => c[0] === 'deal'), 'and a shut one does not, whatever way it is pressed');
      assert.equal(ctx.toasts.at(-1)[0], `${q.blocker} ${NEED_CASH}`); assert.equal(ctx.toasts.at(-1)[1], 'warn');
      assert.ok(html.includes(`id="st-fixwhy-${a.id}"`) && button.includes(`aria-describedby="st-fixwhy-${a.id}"`), 'the reason is tied to the button for a screen reader');
      assert.ok(html.includes(q.blocker) && html.includes(NEED_CASH));
      assert.equal(D.planFor(g, { kind: 'repair', assetId: a.id }).blocker, q.blocker, 'it is the bench\'s own reason: the Deal Room would turn this founder away with the same words');
      assert.deepEqual(checkHTML(html, 'stock, bench shut'), []);
    }
  }
});

test('Stock: the Repair button of the action bar asks about the first broken crate ticked, with the same reason', () => {
  const { ctx, g, acts, a } = benchWorld(500);
  ctx.U.sel.add(a.id);
  const q = D.benchQuote(g, a.id), html = stock.html(ctx);
  const bar = html.slice(html.indexOf('class="stk-selbar"'), html.indexOf('class="sect stk-group"'));
  const btn = bar.slice(bar.lastIndexOf('<button', bar.indexOf('data-act="stock-repair"')), bar.indexOf('</button>', bar.indexOf('data-act="stock-repair"')));
  assert.match(btn, /aria-disabled="true"/); assert.ok(bar.includes(q.blocker), 'the bar says why');
  ctx.calls.length = 0; acts['stock-repair']({ dataset: {} });
  assert.ok(!ctx.calls.some((c) => c[0] === 'deal'));
  g.s.cash = q.most + 5;
  const open = stock.html(ctx), btn2 = open.slice(open.lastIndexOf('<button', open.indexOf('data-fid="st-stock-repair"')), open.indexOf('</button>', open.indexOf('data-fid="st-stock-repair"')));
  assert.ok(!/aria-disabled/.test(btn2)); acts['stock-repair']({ dataset: {} });
  assert.deepEqual(ctx.calls.at(-1), ['deal', { kind: 'repair', assetId: a.id }]);
});

// ============================================================================================================================ 2. the instructor's way back
const roomOf = (opts = {}) => { // a real Session in a room of its own: the page's connection closed, a stand-in left in its place
  const S = new Session(); S.pid = 'TEACH';
  S.joinRoom({ code: 'ROOMQ', relay: '', role: 'instructor', handle: 'Instructor', ...opts });
  const owner = S.room.owner;
  S.room.close(); S.room = { kind: opts.kind || 'relay', state: 'open', owner, send() {}, close() {}, on() {} };
  return S;
};

test('Instructor dashboard: the recovery code is on the page behind a closed "Show", with the warning that the live room runs only from this browser unless it is saved', () => {
  store.clear();
  const S = roomOf(), code = S.recoveryCode();
  assert.match(code, /^[0-9a-f]{4}(-[0-9a-f]{4}){7}$/);
  const p = instructorParts(S, {});
  assert.equal(p.keep, recoveryHTML(S));
  assert.ok(p.keep.includes(code), 'the code is there to read');
  assert.ok(p.keep.includes('This live room runs only from this browser unless you save its recovery code.'));
  assert.ok(p.keep.includes('<span class="mono">') || p.keep.includes('ROOMQ'), 'the room code is named');
  assert.match(p.keep, /<details class="in-code">/); assert.ok(!/<details[^>]*\sopen/.test(p.keep), 'closed until asked for: the dashboard is often on a projector');
  assert.ok(p.keep.indexOf('runs only from this browser') < p.keep.indexOf(code), 'the warning stands where it can be read without opening it');
  for (const k of ['head', 'c1', 'c2', 'grade']) assert.ok(!p[k].includes(code), `${k} does not carry the code`);
  assert.match(p.keep, /data-act="copykey"/); assert.ok(p.keep.includes('Resume as instructor'), 'it says where the code goes');
  assert.ok(p.keep.includes(FOLLOW_NOTE), 'and what the students do when it is used');
  assert.deepEqual(checkHTML(p.keep, 'keep panel'), []);
  assert.ok(!DASHES.test(p.keep) && !/\bzones?\b/i.test(p.keep), 'no dash, and "district"');
  assert.equal(recoveryHTML(S), p.keep, 'the same text each time, so the open "Show" is not closed by the next tick');
  // a room with no relay says that it is also only this browser's tabs
  assert.ok(!recoveryHTML(S).includes("browser's tabs") && recoveryHTML(roomOf({ kind: 'local' })).includes("browser's tabs"));
  // the escaping holds for whatever a room is called
  const odd = roomOf(); odd.roomInfo = { code: '<b>X</b>', relay: '', role: 'instructor' }; assert.ok(!recoveryHTML(odd).includes('<b>X</b>'));
});

test('Instructor dashboard: no recovery code saved (storage blocked) is said plainly, with no Copy button', () => {
  const real = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null, setItem() { throw new Error('private window'); }, removeItem() {} };
  try {
    const S = roomOf();
    assert.equal(S.recoveryCode(), null);
    const html = recoveryHTML(S);
    assert.match(html, /No recovery code is saved for room/); assert.match(html, /cannot resume as instructor/); assert.ok(!/copykey/.test(html));
  } finally { globalThis.localStorage = real; }
  assert.equal(recoveryHTML(new Session()).includes('copykey'), false, 'a solo session has no room to keep');
});

test('Instructor dashboard: Copy puts the code on the clipboard, and says when it could not', async () => {
  store.clear();
  const S = roomOf(), code = S.recoveryCode(), said = [];
  let written = null;
  assert.equal(await copyRecovery(S, { write: async (t) => { written = t; }, say: (m, l) => said.push([m, l]) }), true);
  assert.equal(written, code); assert.deepEqual(said.at(-1), ['Recovery code copied. Keep it somewhere safe.', 'good']);
  assert.equal(await copyRecovery(S, { write: async () => { throw new Error('denied'); }, say: (m, l) => said.push([m, l]) }), false);
  assert.equal(said.at(-1)[1], 'warn'); assert.match(said.at(-1)[0], /select it by hand/);
  assert.equal(await copyRecovery(S, { write: () => { throw new TypeError('clipboard is undefined'); }, say: (m, l) => said.push([m, l]) }), false, 'a browser with no clipboard (a plain http address) is told, not left with a thrown error');
  assert.equal(await copyRecovery(new Session(), { write: async () => { throw new Error('never called'); }, say: (m, l) => said.push([m, l]) }), false);
  assert.match(said.at(-1)[0], /no recovery code saved/);
  // wired to the button, and to the real clipboard
  const i = src('js/ui/instructor.js');
  assert.match(i, /copykey\(\) \{ copyRecovery\(S, \{ write: \(t\) => navigator\.clipboard\.writeText\(t\), say: toast \}\); \}/);
});

test('Resume as instructor: the title form takes the room code and the recovery code (any spacing, any case) and the session gets it as the owner token', () => {
  store.clear();
  const first = roomOf(), code = first.recoveryCode();
  store.clear();                                                           // another device: nothing in storage
  const pasted = code.toUpperCase().replace(/-/g, '  ');
  const back = new Session(); back.pid = 'LAPTOP';
  back.joinRoom({ code: 'ROOMQ', relay: '', role: 'instructor', handle: 'Instructor', owner: cleanOwner(pasted), recover: true });
  assert.equal(back.room.owner, cleanOwner(code), 'the room is opened with the pasted token');
  assert.equal(back.recoveryCode(), code, 'and the dashboard shows the same code');
  assert.equal(back.recovering, true, 'it waits to hear the class\'s clock');
  assert.ok(instructorParts(back, {}).keep.includes(code));
  back.room.close();
  // the form on the page (main.js), field by field
  const main = src('js/main.js');
  for (const needle of ['id="ires"', 'Resume as instructor', 'data-act="instr-recover"', "'instr-recover'()", "cleanOwner($('#ik').value)", "cleanCode($('#ic').value)", "startInstructor(code, rl, false, null, owner)",
    "S.joinRoom({ code, relay, role: 'instructor', handle: 'Instructor', owner, recover: !!owner && !saved })", 'recoveryCodeFor(instr.code)', 'FOLLOW_NOTE', 'for="ic"', 'for="ik"'])
    assert.ok(main.includes(needle), `main.js has: ${needle}`);
  assert.ok(main.includes('Take the room back') && main.includes('take back a room'), 'the older names are kept, so the faculty kit\'s words still find the form');
  assert.ok(main.includes('The Relay URL above must be the one your students joined with'), 'and it says which relay');
  assert.ok(!DASHES.test(FOLLOW_NOTE));
});

test('Resume as instructor: while the room is being taken back the controls that depend on the class\'s hour wait, and the page says so instead of showing a lobby', () => {
  // A taken-back room reads Day 1 until it has heard the class's clock: a "Rewind 1 day" measured against that made-up hour would send every student to the start.
  store.clear();
  const first = roomOf(), code = first.recoveryCode(); store.clear();
  const back = new Session(); back.pid = 'LAPTOP';
  back.joinRoom({ code: 'ROOMQ', relay: '', role: 'instructor', handle: 'Instructor', owner: cleanOwner(code), recover: true });
  back.room.close(); back.room = { kind: 'relay', state: 'open', send() {}, close() {}, on() {} };
  assert.equal(back.recovering, true);
  const waiting = instructorParts(back, { ev: 'fed', when: '0' }).c1;
  assert.match(waiting, /Taking the room back/); assert.ok(!waiting.includes('Start simulation') && !/<b>Lobby\.<\/b>/.test(waiting), 'not a lobby: the class may be on day 40');
  for (const act of ['pause', 'speed', 'rewind', 'deploy']) {
    const buttons = [...waiting.matchAll(new RegExp(`<button[^>]*data-act="${act}"[^>]*>`, 'g'))].map((m) => m[0]);
    assert.ok(buttons.length > 0 && buttons.every((b) => /aria-disabled="true"/.test(b)), `${act} waits`);
  }
  assert.match(waiting, /<select id="pace"[^>]* disabled>/);
  // once the class's clock has been heard the page is the ordinary one
  back._recovered(24 * 40 + 3, 16, false);
  const ready = instructorParts(back, { ev: 'fed', when: '0' }).c1;
  assert.ok(!/Taking the room back/.test(ready) && !/aria-disabled/.test(ready) && !/<select id="pace"[^>]* disabled/.test(ready));
  assert.match(ready, /Day 41/);
  // and a room that was never taken back has no such notice
  assert.ok(!/Taking the room back/.test(instructorParts(first, { ev: 'fed', when: '0' }).c1));
  back.room = { close() {} };
});

test('Instructor rooms: a solo run saved in this browser is put back after the room opens (S.reset() deletes it), so Resume your run is still on the title after the room closes', () => {
  const main = src('js/main.js'), fn = main.slice(main.indexOf('function startInstructor('), main.indexOf('function keepRecoveryCode('));
  const at = (t) => fn.indexOf(t);
  assert.ok(at("const solo = kv.get('save');") > 0 && at("const solo = kv.get('save');") < at('S.reset();'), 'the run is read before the reset');
  assert.ok(at("if (solo) kv.set('save', solo);") > at('S.reset();') && at("if (solo) kv.set('save', solo);") < at("S.mode = 'instructor';"), 'and written back right after it');
  // what the reset does, which is why: it deletes the save
  kv.set('save', { v: 1, marker: 'a solo run' }); assert.deepEqual(kv.get('save'), { v: 1, marker: 'a solo run' });
  new Session().reset(); assert.equal(kv.get('save'), null, 'Session.reset() deletes the saved run');
});

test('Resume as instructor: students follow the new Founder ID after the old one has been silent for the grace period (about a minute), not at once', () => {
  assert.equal(FOLLOW_SECONDS, 60); assert.match(FOLLOW_NOTE, /about a minute, not at once/);
  const S = new Session();
  const msg = { role: 'instructor' };
  S.instructorPid = 'PC-OLD'; S.instructorSeen = Date.now();
  assert.equal(S._isInstructor(msg, 'PC-NEW'), false, 'at once: the new ID is not believed');
  S.instructorSeen = Date.now() - (FOLLOW_SECONDS - 1) * 1000;
  assert.equal(S._isInstructor(msg, 'PC-NEW'), false, 'one second short of the grace: still the old one');
  S.instructorSeen = Date.now() - (FOLLOW_SECONDS + 1) * 1000;
  assert.equal(S._isInstructor(msg, 'PC-NEW'), true, 'a second past it: the new one is the instructor');
  assert.equal(S._isInstructor(msg, 'PC-OLD'), true, 'the old one still is, while it speaks');
  // what the shock and the clock do meanwhile: the students ignore a deploy from an ID they do not follow yet
  const t = new Session(); t.mode = 'student'; t.instructorPid = 'PC-OLD'; t.instructorSeen = Date.now() - 5000;
  assert.equal(t._isInstructor({ role: 'instructor' }, 'PC-NEW'), false, 'so a shock deployed at once is ignored, as the note says');
});

// ============================================================================================================================ 3. the Draft screen's buyer flow
test('Draft: buyer flow counts a bigger buyer budget at the weight the engine gives it (0.8 of a point of arrival rate)', () => {
  assert.equal(BUDGET_WEIGHT, 0.8);
  const flow = (ids) => traitScores(ids).find((t) => t.id === 'buyers').score;
  const m = (ids) => perkMods(ids);
  // the trait, rebuilt here from the Backgrounds' own numbers
  const expect = (ids) => { const x = m(ids); return (x.leadMult - 1) + 0.8 * (x.leadBudget - 1) + x.loyalty + 0.6 * x.trendBuyers + (x.digitalBuyers ? 0.25 : 0) - 0.6 * (1 - x.farLeadMult); };
  for (const id of Object.keys(PERKS)) assert.ok(near(flow([id]), expect([id]), 1e-9), `${id}: buyer flow is ${flow([id])}, expected ${expect([id])}`);
  assert.ok(near(flow(['connected']), 0.3 + 0.8 * 0.15, 1e-9), 'Well-Connected: 30% faster buyers and 15% bigger budgets');
  assert.ok(near(flow(['grad']), 0.8 * 0.12, 1e-9), 'Business-School Grad: only the alumni network, 12% bigger budgets');
  assert.ok(flow(['grad']) > 0 && flow(['grad']) < TRAIT_EDGE, 'Grad\'s budget is worth something, but not a strength by itself');
  assert.ok(flow(['connected']) >= TRAIT_EDGE);
  assert.ok(summaryOf(['connected']).strong.includes('buyer flow'));
  assert.ok(!summaryOf(['grad']).strong.includes('buyer flow'), 'so a Grad build is not sold as strong on buyer flow');
  assert.ok(flow(['connected', 'grad']) > flow(['connected']), 'together they add: Grad\'s budget lifts Well-Connected\'s');
  assert.ok(near(flow(['connected', 'grad']), 0.3 + 0.8 * (1.15 * 1.12 - 1), 1e-9), 'the budgets multiply, as the engine multiplies them');
});

test('Draft: every summary is honest in all 66 pairs: a strength is a trait at +0.10 or more, a weakness at -0.10 or less, and the top two are named', () => {
  for (const pair of PERK_PAIRS) {
    const sc = traitScores(pair), s = summaryOf(pair), by = Object.fromEntries(sc.map((t) => [t.name, t.score]));
    for (const n of s.strong) assert.ok(by[n] >= TRAIT_EDGE, `${pair}: "${n}" is called a strength at ${by[n]}`);
    for (const n of s.weak) assert.ok(by[n] <= -TRAIT_EDGE, `${pair}: "${n}" is called a weakness at ${by[n]}`);
    const best = sc.filter((t) => t.score >= TRAIT_EDGE).sort((a, b) => b.score - a.score).slice(0, 2).map((t) => t.name);
    assert.deepEqual(s.strong, best, `${pair}: the strengths named are the strongest two`);
    assert.ok(!DASHES.test(s.text) && !/\bzones?\b/i.test(s.text));
  }
});

test('Draft: the weight is the engine\'s: a buyer budget 15% bigger lifts the price of the best pitch to a lead by about 0.8 of 15% (0.55 to 1.0 in Metro Hub and Auto Row)', () => {
  PERKS.fnb0 = { id: 'fnb0', name: 'fnb0', icon: 'x', basis: '', strength: '', cost: '', mods: {} };
  PERKS.fnb15 = { id: 'fnb15', name: 'fnb15', icon: 'x', basis: '', strength: '', cost: '', mods: { leadBudget: 1.15 } };
  try {
    const world = (perk, seed, z) => {
      const g = new Game({ perks: [perk], seed, handle: 'T', pid: 'T-' + seed }); g.env.cohort = new Cohort({ seed: 'test', ghosts: 36 }); g.env.algo = false;
      for (let zz = 1; zz <= z; zz++) g._openZone(zz);
      g.s.cash = 1e9; g.advanceTo(48);
      return g;
    };
    const ups = [];
    for (const z of [5, 7]) for (let seed = 1; seed <= 6; seed++) {
      const A = world('fnb0', seed, z), B = world('fnb15', seed, z);
      const classes = Object.keys(ASSETS).filter((c) => (ASSETS[c].dem?.[z] || 0) >= 4);
      const hold = (g) => classes.map((c) => { const a = g._mk(g.s, c, { zone: z }); g.s.assets.push(a); return a; });
      const aa = hold(A), bb = hold(B);
      for (const la of A.s.leads[z]) {
        const lb = B.s.leads[z].find((l) => l.id === la.id && l.seg === la.seg);
        if (!lb) continue;
        let best = null;
        classes.forEach((c, i) => {
          const qa = A.quotePitch(aa[i].id, la.id, undefined, { blind: true }), qb = B.quotePitch(bb[i].id, lb.id, undefined, { blind: true });
          if (qa.ok && !qa.rejected && qb.ok && !qb.rejected && qa.price > 0 && (!best || qa.price > best.pa)) best = { pa: qa.price, pb: qb.price };
        });
        if (best) ups.push(best.pb / best.pa - 1);
      }
    }
    assert.ok(ups.length >= 40, `${ups.length} leads`);
    const through = ups.reduce((a, b) => a + b, 0) / ups.length / 0.15;
    assert.ok(through > 0.55 && through < 1.0, `a point of budget is worth ${through.toFixed(2)} of a point of price on the best pitch: BUDGET_WEIGHT ${BUDGET_WEIGHT} should sit inside that`);
    assert.ok(Math.abs(BUDGET_WEIGHT - through) < 0.25, `weight ${BUDGET_WEIGHT} against the measured ${through.toFixed(2)}`);
  } finally { delete PERKS.fnb0; delete PERKS.fnb15; }
});

// ============================================================================================================================ 4. what the open market asks for a wreck
const askAt = (ops) => Math.max(ECON.brokenLo, 1 - ECON.brokenSlope * (ops - 1));
/** The multiple of its as-is value at which the engine itself posts a broken lot in a district, read off real lots (never from the formula). */
function postedMultiple(ops, z = 7, perks = []) {
  for (let seed = 1; seed <= 80; seed++) {
    const g = new Game({ perks, seed, handle: 'T', pid: 'T-' + seed }); g.env.algo = false; g.s.skills.ops = ops; g._openZone(z); g.s.lots[z] = [];
    for (let i = 0; i < 40 && !(g.s.lots[z][0] && g.s.lots[z][0].cond === 'broken'); i++) { g.s.lots[z] = []; g._spawnLot(z); }
    const lot = g.s.lots[z][0];
    if (lot && lot.cond === 'broken' && lot.price >= 20) return lot.price / assetFMV({ cls: lot.cls, cond: 'broken', quality: 1, wear: 1 }, z, g.mods(), g.crowd(lot.cls, z));
  }
  throw new Error('no broken lot in district ' + z);
}
/** The roadster of the Codex, held at a given Ops: what the repair itself nets and what the whole flip nets when the wreck was bought at the open market's ask. */
function roadster(ops) {
  const g = new Game({ perks: [], seed: 5, handle: 'T', pid: 'T-5' }); g.env.algo = false; g._openZone(7); g.s.skills.ops = ops;
  const a = g._mk(g.s, 'classicCar', { zone: 7, cond: 'broken' }); g.s.assets.push(a);
  const q = g.repairQuote(a.id), repair = q.after - q.before - q.cost, paid = q.before * postedMultiple(ops);
  return { ...q, repair, paid, flip: q.after - paid - q.cost, ask: postedMultiple(ops) };
}
const entry = (id) => CODEX.find((e) => e.id === id);
const text = (v) => JSON.stringify(v);

test('Wrecks: the multiples the Codex quotes are what the engine posts (x1.00 at Ops 1 up to x2.05 at Ops 6), a Tradesperson pays 20% less, and each district past 12 adds 10%', () => {
  const body = entry('repair-roi').body[3];
  const stated = { 1: '1.00', 3: '1.42', 4: '1.63', 6: '2.05' };
  for (const [ops, want] of Object.entries(stated)) assert.equal(postedMultiple(+ops).toFixed(2), want, `Ops ${ops}`);
  assert.ok(body.includes('1.00 times its as-is value at Ops 1, 1.42 at Ops 3, 1.63 at Ops 4 and 2.05 at Ops 6'), body);
  assert.equal(PERKS.trades.mods.brokenDiscount, 0.2); assert.ok(body.includes('A Tradesperson pays 20% less'));
  assert.ok(near(postedMultiple(5, 7, ['trades']), 0.8 * askAt(7), 0.012), 'Trades: 20% under the price its Ops 5 plus 2 gives');
  assert.equal(ECON.brokenTop, 0.1); assert.equal(ECON.brokenFrom, 12); assert.ok(body.includes('each district past 12 adds another 10%'));
  assert.ok(near(postedMultiple(4, 13) / postedMultiple(4, 7), 1.1, 0.012) && near(postedMultiple(4, 16) / postedMultiple(4, 7), 1.4, 0.012), 'district 13 is x1.10 and 16 x1.40, on top');
  assert.ok(body.length <= 420);
});

test('Codex repair-roi: the wreck\'s price is in the worked example, and what it says about the flip is true (a third kept by the seller at Ops 4, two thirds left)', () => {
  const e = entry('repair-roi'), r1 = roadster(1), r4 = roadster(4);
  assert.ok(near(r1.ask, 1, 0.001) && near(r1.paid, r1.before, 0.01), 'at Ops 1 the car is bought for its as-is value');
  assert.equal(usd(r1.before), '$1,814.40'); assert.equal(usd(r1.repair), '$140.40'); assert.ok(r1.repair < 0 && near(r1.flip, r1.repair, 0.01), 'and the flip loses what the repair loses');
  assert.equal(r4.ask.toFixed(2), '1.63'); assert.equal(usd(r4.repair), '$3,377.58');
  const seller = (r4.paid - r4.before) / r4.repair, kept = r4.flip / r4.repair;
  assert.ok(seller > 0.3 && seller < 0.37, `the seller keeps ${(seller * 100).toFixed(0)}% of the repair gain: "about a third"`);
  assert.ok(kept > 0.62 && kept < 0.7, `the founder keeps ${(kept * 100).toFixed(0)}%: "about two thirds"`);
  const t = text(e.example);
  for (const bit of ['sellers ask 1.00 times its as-is value at Ops 1 and 1.63 times at Ops 4', 'At Ops 1 you pay $1,814.40 and the flip still loses $140.40', 'the seller keeps about a third of the repair\'s $3,377.58 gain', 'keeps about two thirds of that', '$140 loss', '$3,378 windfall on the repair'])
    assert.ok(t.includes(bit), `repair-roi example: ${bit}`);
  assert.ok(!/lot price barely matters/i.test(t), 'the old claim that the lot price barely matters is gone');
  assert.ok(e.mistakes.some((x) => /whole flip|repair alone/i.test(x)) || e.mistakes.some((x) => /forgetting what the wreck cost/.test(x)), 'and the mistake is named');
  // limits of the entry
  assert.ok(e.body.length <= 4 && e.body.every((p) => p.length <= 420) && e.example.steps.length <= 5 && e.example.steps.every((s) => s.length <= 300) && e.example.result.length <= 380);
  assert.ok(!DASHES.test(text(e)), 'no dash in the entry');
});

test('Codex specialization: the gap between focusing and spreading is smaller on a car you buy, by about half, because the wreck asks more at higher Ops', () => {
  const r3 = roadster(3), r5 = roadster(5), s = entry('specialization');
  assert.equal(r5.ask.toFixed(2), '1.84'); assert.equal(r3.ask.toFixed(2), '1.42');
  assert.equal(usd(r5.repair - r3.repair), '$1,708.13');
  const share = (r5.flip - r3.flip) / (r5.repair - r3.repair);
  assert.ok(share > 0.5 && share < 0.6, `the gap on a bought car is ${(share * 100).toFixed(0)}% of the gap on a car you own: "a little over half"`);
  const t = text(s.example);
  assert.ok(t.includes('$1,708 more per car you already own') && t.includes('1.84 times as-is at level 5, 1.42 at level 3') && t.includes('a little over half of that'));
  assert.ok(s.example.result.length <= 380);
});

test('Academy lesson 5: the van is a gift, its numbers are the repair\'s, and the card says what the market would ask (x1.00 at Ops 1, x1.21 at Ops 2) and what that does to the flip', () => {
  const m = ACADEMY.find((x) => x.id === 'm05');
  assert.equal(m.setup.skills.ops, 2); assert.deepEqual(m.setup.lots, [], 'nothing is bought in this lesson: the van sits in the yard');
  assert.equal(postedMultiple(1).toFixed(2), '1.00'); assert.equal(postedMultiple(2).toFixed(2), '1.21');
  const why = m.why.body.join(' '), res = m.why.example.result;
  assert.ok(why.includes('This van is already yours: bought on the open market, a wreck is asked at 1.00 times its as-is value at Ops 1 and 1.21 times at Ops 2.'));
  assert.ok(/\$241 more at Ops 2/.test(res) && /whole flip nets \$616/.test(res) && /\$156 loss into an \$857 profit/.test(res));
  assert.ok(m.why.body.every((p) => p.length >= 80 && p.length <= 420) && res.length <= 300 && m.why.example.steps.length === 5);
  assert.ok(!DASHES.test(text(m.why)));
});

test('Academy lesson 10: the estate lots are posted just under their as-is value on purpose, and the intro says why (the open market would ask more at Ops 2)', () => {
  const m = ACADEMY.find((x) => x.id === 'm10'), lot = m.setup.lots[0];
  const asIs = assetFMV({ cls: lot.cls, cond: 'broken', quality: 1, wear: 1 }, m.zone, new Game({ perks: [], seed: 1, handle: 'T', pid: 'T-1' }).mods(), 1);
  assert.ok(lot.price / asIs > 0.95 && lot.price / asIs < 1, `posted at ${(lot.price / asIs * 100).toFixed(0)}% of its as-is value`);
  assert.ok(lot.price < postedMultiple(m.setup.skills.ops, m.zone) * asIs, 'the open market would ask more for the same wreck at this lesson\'s Ops');
  assert.match(m.intro, /A family is clearing three broken antiques at auction, priced low to sell fast\./);
  assert.ok(m.intro.length >= 80 && m.intro.length <= 260);
  const header = src('js/meta/academy.js').slice(0, src('js/meta/academy.js').indexOf('export const ACADEMY'));
  assert.ok(header.includes('A BROKEN lot on the open market is posted the other way'), 'the header of the data says the same');
  assert.ok(!/a broken one lower/.test(header), 'and no longer says a wreck is posted lower');
});
