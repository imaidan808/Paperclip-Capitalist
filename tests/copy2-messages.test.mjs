// Copy pass, part 2, package P4: notes, toasts, refusals and the settings dialog. The words keep to what the engine does, and a sound never depends on them.
//   M1  every note a sound depends on carries its kind, and its sound is the same whatever its words say (the engine writes each one here, nothing is hand-made)
//   M2  the figures and claims in the notes and the refusals are the engine's, recomputed from the engine and the config; the old jargon is gone
//   M3  one message for one action (a hire, a loan, an exit), one string for one refusal (fraud, a broken crate, a full yard)
//   M4  the Cash and Net worth windows add up to the net worth, royalties owed included
//   M5  the settings dialog opens on a few words; the hover and the fold hold the rest
// Run: node --test tests/copy2-messages.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const { Game } = await import('../js/engine.js');
const C = await import('../js/config.js');
const { ASSETS, ZONES, PIPE, CLIENTS, LOANS, AUDIT, DEBT, FMV_BAND, MIL, TOTAL_HOURS, SEC_PER_HOUR } = C;
const { Session } = await import('../js/session.js');
const wire = await import('../js/audio/wire.js');
const { worthRows, worthLines } = await import('../js/ui/shell.js');
const { audioSettingsHTML, audioDefaults, statusText } = await import('../js/audio/settings.js');
const { assetFMV, demandOf } = await import('../js/market.js');
const { makeGame, run } = await import('./bot.mjs');

const mk = (perks = [], seed = 1) => { const g = new Game({ perks, seed, handle: 'T', pid: 'T-' + seed }); g.env.algo = false; return g; };
const noted = (g) => { const out = []; g.onNote = (n) => out.push(n); return out; };
const usd = (n) => (n < 100 ? '$' + n.toFixed(2) : '$' + Math.round(n).toLocaleString('en-US')); // the engine's own money()
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

// ---------------------------------------------------------------------------------------------------------------------
// M1. The kind of a note, and what it sounds like
// ---------------------------------------------------------------------------------------------------------------------
const hooks = { now: () => 1, pan: (k, id) => (k === 'zone' ? id / 100 : undefined), elsewhere: () => false };
const calls = (n, st = wire.newWireState()) => wire.noteCalls(n, st, hooks);
/** The note is of this kind, and the sound it makes does not read its words: the same note with its text thrown away makes the same calls. */
function heldByKind(n, kind, want) {
  assert.ok(n, `the engine wrote a ${kind} note`);
  assert.equal(n.kind, kind, `${kind}: the engine tags it ("${n.text}")`);
  assert.equal(wire.noteKind(n), kind);
  const a = calls(n), b = calls({ ...n, text: 'x' });
  assert.deepEqual(b, a, `${kind}: the sound is the same with the words gone`);
  if (want) assert.deepEqual(a, want, `${kind}: its sound`);
  return a;
}

test('M1: the advance warning of a macro shock, and market fatigue, are tagged; the shock going live is the event\'s sound, not the note\'s', () => {
  const g = mk(), notes = noted(g);
  g.advanceTo(336 - g.warnLead());
  const warn = notes.find((n) => n.alert && n.level === 'warn');
  heldByKind(warn, 'advance', [['request', 'alert.advance', { variant: 'l' + warn.alert.level }]]);
  g.advanceTo(336);
  const live = notes.find((n) => /now in effect/.test(n.text));
  assert.ok(live && !live.kind, 'the live note is not tagged'); assert.deepEqual(calls(live), [], 'and is silent: the shock event plays its sound');
  g.advanceTo(336 + 48);
  heldByKind(notes.find((n) => /^Market fatigue/.test(n.text)), 'fatigue', [['request', 'alert.shock', { variant: 'glut', state: 'fatigue' }]]);
  // a shock with no warning (an instructor's, now): its note says so, carries the alert dialog, and is silent
  const h = mk(); const ns = noted(h); h.injectEvent('tariff', h.s.hour + 1, { id: 'now-1' }); h.advanceTo(h.s.hour + 1);
  const bare = ns.find((n) => /no warning/.test(n.text)); assert.ok(bare && bare.alert, 'a shock that was not warned says so'); assert.deepEqual(calls(bare), []);
});

test('M1: a scam and a spotted counterfeit are tagged, and they colour the sale sound that follows them, whatever they say', () => {
  const g = mk(['native'], 3); g.s.cash = 5; const ns = noted(g);
  g.s.leads[1].push({ id: 'Ls', zone: 1, seg: 'student', budget: 8, need: null, born: 0, exp: 999, scam: true });
  g.pitch(g.s.assets[0].id, 'Ls');
  const scam = ns.find((n) => n.kind === 'scam');
  heldByKind(scam, 'scam', []);
  for (const text of [scam.text, 'x']) { const st = wire.newWireState(); wire.noteCalls({ ...scam, text }, st, { now: () => 7 }); assert.equal(st.scamAt, 7, 'the scam is remembered for the rejection that follows'); }
  const f = mk(); const fs = noted(f); const a = f.s.assets[0]; a.truth = { fake: true, q: 1, defects: [] }; a.known = false;
  f.s.leads[1].push({ id: 'Lf', zone: 1, seg: 'student', budget: 8, need: null, born: 0, exp: 999 });
  f.pitch(a.id, 'Lf');
  const fake = fs.find((n) => n.kind === 'counterfeit'); heldByKind(fake, 'counterfeit', []);
  for (const text of [fake.text, 'x']) { const st = wire.newWireState(); wire.noteCalls({ ...fake, text }, st, { now: () => 9 }); assert.equal(st.counterfeitAt, 9); }
});

test('M1: cash settling carries its amount, so the coin is the size of the sum without reading the words', () => {
  for (const amt of [900, 1250000, 48000000]) {
    const g = mk(), ns = noted(g); g.s.settle.push({ at: g.s.hour, amt }); g._settlements();
    const n = ns.find((x) => x.kind === 'settle');
    const [c] = heldByKind(n, 'settle');
    assert.equal(c[2].meta.amount, amt); assert.equal(c[2].variant, 'settle');
  }
});

test('M1: freight arriving, customs and damage name their district and their pan does not come from the words', () => {
  const g = mk(); const ns = noted(g); g.rand = () => 0; // customs always looks (Harbor), and a risk of 1 always damages
  const crate = g._mk(g.s, 'pen', { zone: 1, basis: 1 }); g.s.assets = [];
  g.s.freight.push({ id: 'F1', items: [crate], to: 8, sent: 0, arrive: g.s.hour + 1, risk: 1, book: 100, from: 1 });
  g.advanceTo(g.s.hour + 1);
  const customs = ns.find((n) => n.kind === 'customs');
  const [c] = heldByKind(customs, 'customs', [['request', 'ship.trouble', { variant: 'customs', state: 'trouble-customs', pan: 0.08 }]]); void c;
  assert.equal(customs.z, 8);
  const at = g.s.freight[0].arrive - g.s.hour; assert.equal(g.s.freight[0].arrive, customs.h + 12, 'the delay the note names is 12 hours'); assert.ok(at > 0);
  assert.equal(+/(\d+) hours' delay/.exec(customs.text)[1], g.s.freight[0].arrive - customs.h, 'the delay the note names is the delay the engine adds');
  g.advanceTo(g.s.hour + 12);
  const dmg = ns.find((n) => n.kind === 'damage'); heldByKind(dmg, 'damage', [['request', 'ship.trouble', { variant: 'damage', state: 'trouble-damage' }]]);
  near(crate.quality, 0.8, 1e-12); // "-20% quality"
  assert.equal(+/-(\d+)% quality/.exec(dmg.text)[1], Math.round((1 - crate.quality) * 100), 'the loss the note names is the loss the engine applies');
  const arrived = ns.find((n) => n.kind === 'freight-arrive'); heldByKind(arrived, 'freight-arrive', [['request', 'ship.arrive', { clock: true, pan: 0.08 }]]);
  assert.equal(arrived.z, 8);
});

test('M1: burnout, the mentor, an SLA breach and an overdraft are tagged, the last two with the amount', () => {
  const b = mk(['gigger']); const bn = noted(b); b.advanceTo(456);
  heldByKind(bn.find((n) => n.kind === 'burnout'), 'burnout', [['request', 'ui.nudge', { state: 'burnout' }]]);
  const p = mk(['pro']); const pn = noted(p); p.advanceTo(144);
  heldByKind(pn.find((n) => n.kind === 'mentor'), 'mentor', [['request', 'mentor.tip', { clock: true }]]);
  const s = mk(); const sn = noted(s); s.s.clients.push({ id: 'C9', tier: 'corp', cac: 1, until: 24 * 60, earned: 0, breaches: 0 }); s.advanceTo(24);
  const sla = sn.find((n) => n.kind === 'sla'); const [c1] = heldByKind(sla, 'sla'); assert.equal(c1[2].meta.amount, CLIENTS.corp.perDay * 2); assert.equal(c1[2].state, 'sla');
  const o = mk(); const on = noted(o); o.s.cash = -12.5; o.advanceTo(24 * 3 + 1);
  const od = on.find((n) => n.kind === 'overdraft'); const [c2] = heldByKind(od, 'overdraft'); assert.equal(c2[2].state, 'overdraft'); assert.ok(c2[2].meta.amount > 12.5 && c2[2].meta.amount < 13, 'the balance the note names');
});

test('M1: the end of a run: the bell is the horizon, a completed exit is "done", and neither reads its words', () => {
  const g = mk(), ns = noted(g); g.advanceTo(TOTAL_HOURS);
  const bell = ns.find((n) => n.final); assert.ok(bell && !bell.exit);
  assert.deepEqual(calls(bell), [['request', 'run.end', { variant: 'horizon' }]]); assert.deepEqual(calls({ ...bell, text: 'x' }), calls(bell));
  const e = mk([], 1), en = noted(e); e.s.cash = 400000; e.advanceTo(e.s.hour + 1); e.s.auditFirst = true; e.s.auditNext = null;
  const r = e.exit('trade'); assert.ok(r.ok, r.msg); e.advanceTo(e.s.hour + 48);
  const done = en.find((n) => n.final); assert.equal(done.exit, true);
  assert.deepEqual(calls(done), [['request', 'run.end', { variant: 'done' }]]); assert.deepEqual(calls({ ...done, text: 'x' }), calls(done));
});

test('M1: across whole runs, no note\'s sound depends on its words (every note the engine writes, over three Background pairs and three worlds)', () => {
  const kinds = new Set(); let n = 0;
  for (const [perks, seed] of [[['native', 'pro'], 3], [['gigger', 'heir'], 7], [['creator', 'veteran'], 13]]) {
    const g = makeGame(perks, 'ops', seed), seen = []; g.onNote = (x) => seen.push(x);
    run(g, { days: 70 });
    for (const note of seen) {
      n++; if (note.kind) kinds.add(note.kind);
      assert.deepEqual(calls({ ...note, text: 'x' }), calls(note), `the sound of "${note.text}" reads its words`);
    }
  }
  assert.ok(n > 150, `a run writes notes (${n})`);
  for (const k of ['settle', 'freight-arrive']) assert.ok(kinds.has(k), `the runs wrote a ${k} note`);
});

// two classmates on an in-memory room, as the swap tests build them
function hubOf(code) {
  const members = new Map(), queue = [];
  return {
    queue, members,
    join(S) { members.set(S.pid, S); S.room = { kind: 'local', send: (m) => queue.push({ ...m, from: S.pid, role: 'student', handle: S.handle, ts: Date.now() }), close() {}, on() {} }; S.roomInfo = { code, relay: '', role: 'student' }; },
    drain(n = 300) { for (let i = 0; i < n && queue.length; i++) { const m = queue.shift(); for (const [pid, M] of members) if (pid !== m.from && (m.to === undefined || m.to === pid)) M._onMsg(JSON.parse(JSON.stringify(m))); } },
  };
}
function sessionIn(hub, pid) {
  store.clear();
  const S = new Session(); S.pid = pid; S.handle = pid; S.mode = 'student'; S.worldSeed = hub.code; S.startGame({ perks: ['trades', 'pro'], handle: pid }); S.clockAdopted = true; S.clock.set({ paused: true });
  S.game.s.mil = { m1: true, m2: true, m3: true }; S.game.s.auditNext = null; S.game.s.auditFirst = true; S.game.s.events.length = 0;
  for (const z of [2, 3, 4]) S.game._openZone(z);
  S.game.s.assets.length = 0; hub.join(S);
  return S;
}

test('M1: both ends of a completed swap write a "swap" note, and the swap sound does not read its words', () => {
  const hub = hubOf('P4SW'), A = sessionIn(hub, 'PC-AAAA'), B = sessionIn(hub, 'PC-BBBB');
  A.game.s.cash = 500; const x = B.game._mk(B.game.s, 'bike', { zone: 1, basis: 1 }); B.game.s.assets.push(x);
  for (const S of [A, B]) S._sendSnap(true); hub.drain();
  const want = A.roster().find((q) => q.pid === B.pid).inventory.find((i) => i.id === x.id);
  const res = A.propose({ to: B.pid, giveIds: [], giveCash: Math.round(want.fmv), want: { assets: [want], cash: 0 } }); assert.ok(res.ok, res.msg); hub.drain();
  assert.ok(B.acceptIncoming(res.offer.id).ok); hub.drain();
  for (const S of [A, B]) {
    const n = S.game.s.news.find((q) => /Swap completed/.test(q.text));
    heldByKind(n, 'swap', [['request', 'swap.done', {}]]);
  }
  assert.ok(A.game.s.assets.some((a) => a.cls === 'bike' && a.from === 'p2p'), 'the crate changed hands');
});

test('M1: every note the engine and the session write that a sound depends on goes through a kind (a source scan: no new one without a tag)', () => {
  const eng = read('js/engine.js'), ses = read('js/session.js');
  for (const [src, re] of [[eng, /this\.note\([^\n]*(?:settled into cash|Freight arrived|Customs inspected|was damaged in transit|Your mentor says|SLA breach on|Cash is negative|Market fatigue|Burnout:|spotted a counterfeit|Scam:|effective in)[^\n]*/g], [ses, /g\.note\([^\n]*Swap completed[^\n]*/g]]) {
    const hits = src.match(re) || [];
    assert.ok(hits.length >= 1);
    for (const h of hits) assert.ok(/kind: '/.test(h), `a note a sound depends on has a kind: ${h.slice(0, 90)}`);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// M2. The figures and claims in the words are the engine's
// ---------------------------------------------------------------------------------------------------------------------
test('M2: a district opens in one line; the milestones quote the config and say what the engine then does', () => {
  const g = mk(), ns = noted(g);
  for (const id of C.ZONE_IDS.filter((z) => z > 1)) {
    g.s.cash = ZONES[id].gate + 1; g.advanceTo(g.s.hour + 1);
    const n = ns.find((x) => x.zone === id);
    assert.equal(n.text, `${ZONES[id].name} is open.`, 'the name and nothing more: the blurb is the Travel drawer\'s');
  }
  // Milestone 1: the Bank lends, a manager can be hired, a small account can be signed
  const a = mk(), an = noted(a); assert.equal(a.loanBlock('micro') === '', false, 'before it the Bank is shut');
  a.s.cash = 5000; a.advanceTo(a.s.hour + 1);
  const m1 = an.find((n) => n.milestone === 1); assert.equal(m1.text, `Milestone 1 (${usd(MIL.m1)} net worth): managers, clients and the Bank are open.`);
  assert.equal(a.loanBlock('micro'), '');
  const lane = a.radar(5, 1)[0]; assert.ok(a.hirePipeline('student', 5, { cls: lane.cls, buyer: lane.seg }).ok); assert.ok(a.acquireClient('smb').ok);
  // Milestone 2: the first audit begins in the same hour, and hiring and manager upgrades (not the company upgrades) wait until it is answered
  const b = mk(), bn = noted(b); b.s.cash = MIL.m2 + 5000; b.advanceTo(b.s.hour + 1);
  const m2 = bn.find((n) => n.milestone === 2); assert.equal(m2.text, `Milestone 2 (${usd(MIL.m2)} net worth): the first audit begins. Hiring and manager upgrades wait until you answer it.`);
  assert.ok(b.s.auditPending, 'the audit begins at once'); assert.equal(b.s.auditPending.due - b.s.auditPending.at, AUDIT.deadlineHours);
  const au = bn.find((n) => n.audit); assert.equal(au.text, `Regulatory Audit: ${b.s.auditPending.title}. You have ${AUDIT.deadlineHours} hours to respond.`);
  const lane2 = b.radar(5, 1)[0], hire = b.hirePipeline('student', 5, { cls: lane2.cls, buyer: lane2.seg });
  assert.equal(hire.ok, false); assert.match(hire.msg, /^Hiring and manager upgrades are locked until you answer your Regulatory Audit\.$/);
  b.s.pipes.push({ id: 'Pq', kind: 'student', zone: 5, level: 1, status: 'idle', basis: 10, inflight: 0 }); assert.equal(b.upgradePipeline('Pq').msg, hire.msg);
  assert.equal(b.buyUpgrade('freight').ok, true, 'a company upgrade is not locked');
  assert.ok(b.resolveAudit('A').ok); assert.equal(b.autoLocked(), false);
  // Milestone 3: Enterprise accounts and a trade sale; an IPO only with a clean audit record
  const c = mk(), cn = noted(c); c.s.cash = MIL.m3 + 5000; c.advanceTo(c.s.hour + 1);
  const m3 = cn.find((n) => n.milestone === 3); assert.equal(m3.text, `Milestone 3 (${usd(MIL.m3)} net worth): Enterprise accounts and a trade sale are open, and an IPO if your audit record is clean.`);
  assert.equal(c.exitQuote('trade').ok, true); assert.equal(c.exitQuote('ipo').ok, true); assert.notEqual(c.acquireClient('ent').msg, `Unlocks at Milestone 3.`);
  const d = mk(); noted(d); d.s.cash = MIL.m2 + 5000; d.advanceTo(d.s.hour + 1); d.advanceTo(d.s.auditPending.due + 1);
  d.s.cash = MIL.m3 + 5000; d.advanceTo(d.s.hour + 1);
  assert.equal(d.exitQuote('trade').ok, true); assert.equal(d.exitQuote('ipo').ok, false); assert.match(d.exitQuote('ipo').msg, /clean audit record/);
  // n=20: the engine's own sentence, held here, since the Bank's own line says the same words
  c.s.auditFail = 1; assert.equal(c.exitQuote('ipo').ok, false); assert.equal(c.exitQuote('ipo').msg, 'An IPO needs a clean audit record. Choose a trade sale.'); assert.equal(c.exitQuote('trade').ok, true, 'a failed audit cuts a trade sale, it does not close it'); c.s.auditFail = 0;
  assert.equal(a.s.mil.m3, false); assert.equal(a.exitQuote('trade').ok, false);
});

function leveraged() {
  const g = mk(); noted(g);
  g.s.cash = 0; g.s.assets = [];
  const classes = Object.keys(ASSETS).filter((c) => C.ZONE_IDS.includes(1) && ASSETS[c].base > 1 && ASSETS[c].base < 400).slice(0, 12);
  const crates = [classes[0], classes[classes.length - 1]].map((cls) => { const a = g._mk(g.s, cls, { zone: 1, basis: 1 }); g.s.assets.push(a); return a; });
  const mgr = (id, kind, basis, inflight) => ({ id, kind, zone: 5, level: 1, status: 'running', basis, inflight, cls: 'pen', buyer: 'student', channel: 'dom', alloc: 0, prog: 0, len: 0, cycles: 0, profit: 0, pausedUntil: 0, starved: false });
  g.s.pipes = [mgr('P1', 'student', 100, 0), mgr('P2', 'broker', 500, 40)];
  g.s.loans.push({ id: 'D1', prod: 'micro', principal: 1e6, accr: 0, last: 0, next: 1e9, drawn: 0 });
  return { g, crates };
}

test('M2: the margin call says what the bank does: the largest manager first, then the stock, at the config\'s discount, until the ratio is back', () => {
  const { g, crates } = leveraged(), ns = [];
  g.onNote = (n) => ns.push(n);
  const keep = 1 - DEBT.fireSale, byValue = [...crates].sort((x, y) => g.val(y) - g.val(x)), expect = [PIPE.broker.name, PIPE.student.name, ...byValue.map((a) => ASSETS[a.cls].name)];
  const proceeds = 500 * keep + 40 + 100 * keep + byValue.reduce((t, a) => t + g.val(a) * keep, 0), debt0 = g.debt();
  assert.ok(g.deRatio() > DEBT.callDE);
  g._marginCall();
  assert.deepEqual(g.s.ledger.filter((r) => r.type === 'margin').map((r) => r.text.replace('Margin call seized ', '')), expect, 'managers by their cost, largest first, then crates by value');
  near(debt0 - g.debt(), proceeds, 1e-6); // every dollar a seizure raised went to the loan: the discount is the config's
  const call = ns.find((n) => n.alert), off = Math.round(DEBT.fireSale * 100);
  assert.equal(call.text, `Margin call: debt-to-equity passed ${DEBT.callDE}. The bank is selling your assets at a ${off}% discount.`);
  assert.equal(call.alert.name, 'Margin call'); assert.equal(call.alert.level, 3);
  assert.equal(call.alert.readout, `Debt-to-equity passed ${DEBT.callDE}. The bank sells your largest managers first, then your stock, at a ${off}% discount, until the ratio is back to ${DEBT.maxDE.toFixed(1)} or nothing is left to sell. Selling at a discount can push the ratio up, so a call can sell all your managers and stock.`);
  assert.deepEqual(wire.noteCalls(call, wire.newWireState(), {}), [], 'and the note is silent: the margin-call event plays the siren');
});

test('M2: a macro alert names the days of the shock it announces, scheduled or deployed by an instructor on another day and hour', () => {
  const fed = C.EVENTS.fed, freeze = fed.phases.find((p) => p.eff.freeze), start0 = (fed.day - 1) * 24, dayOf = (hour) => Math.floor(hour / 24) + 1;
  const freezeAt = (g, hour) => { g.advanceTo(hour); g._m = null; return g.mods().freeze; };
  // scheduled: the config's own words, and the credit freeze lifts on the day they name
  const g = mk(), ns = noted(g); g.advanceTo(start0 - g.warnLead());
  const sched = ns.find((n) => n.kind === 'advance' && n.alert.name === fed.name);
  assert.equal(sched.alert.readout, fed.alert.readout); assert.deepEqual(sched.alert.vars, fed.alert.vars); assert.equal(sched.alert.enforcement, fed.alert.enforcement);
  assert.equal(+/until Day (\d+)/.exec(sched.alert.enforcement)[1], dayOf(start0 + freeze.to));
  assert.equal(freezeAt(g, start0 + freeze.to - 1), true); assert.equal(freezeAt(g, start0 + freeze.to), false, 'the freeze lifts at the hour the day begins');
  // deployed on day 26 at 13:00: the same words, with that day and that hour
  const at = 25 * 24 + 13, h = mk(), hn = noted(h); h.advanceTo(at - 13); h.injectEvent('fed', at, { id: 'inj-fed' }); h.advanceTo(at);
  const dep = hn.find((n) => n.kind === 'advance' && n.alert.name === fed.name).alert;
  assert.equal(dep.readout, `The central bank tightens credit on Day ${dayOf(at)} at 13:00.`); assert.equal(dep.start, at);
  assert.equal(dep.enforcement, `No new bank loans until Day ${dayOf(at + freeze.to)}. Open loans re-rate within 24 hours.`);
  assert.deepEqual(dep.vars, fed.alert.vars, 'what is not a date is not touched');
  assert.equal(freezeAt(h, at + freeze.to - 1), true); assert.equal(freezeAt(h, at + freeze.to), false);
  // a shock with no warning (the instructor's "now"): the tariff's day is the day it starts
  const t = mk(), tn = noted(t); t.advanceTo(100); t.injectEvent('tariff', 101, { id: 'inj-tariff' }); t.advanceTo(101);
  const live = tn.find((n) => /no warning/.test(n.text)); assert.match(live.alert.readout, new RegExp(`from Day ${dayOf(101)} at 05:00, for 15 days\\.$`), 'the day it starts and the hour (hour 101 is 05:00 of day 5)');
  // a shock that starts at midnight, scheduled or deployed, says no hour
  const m = mk(), mn = noted(m); m.advanceTo(47); m.injectEvent('tariff', 48, { id: 'inj-tariff-2' }); m.advanceTo(48);
  assert.equal(mn.find((n) => /no warning/.test(n.text)).alert.readout, `Customs duties slow international lanes from Day ${dayOf(48)}, for 15 days.`);
  // an algorithmic shock has no date to move
  const a = mk(), an = noted(a); a.injectEvent('glut', 30, { id: 'algo-1', cls: 'sneakers' }); a.advanceTo(30);
  assert.ok(an.find((n) => n.alert)); assert.deepEqual(an.find((n) => n.alert).alert.vars, []);
});

test('M2: a failed audit names the fine and the speed it costs, as the Bank shows them', () => {
  const g = mk(), ns = noted(g);
  const fine0 = g.auditFine(), v0 = g.s.velPenalty; g._auditFail(true);
  const drop = Math.round((1 - g.s.velPenalty / v0) * 100);
  assert.equal(ns.at(-1).text, `You ignored the audit. Fine ${usd(fine0)}. Manager speed drops ${drop}% for good.`);
  assert.equal(drop, Math.round((1 - AUDIT.velocityHit) * 100)); assert.equal(Math.round(g.s.velPenalty * 100), Math.round(v0 * AUDIT.velocityHit * 100), 'the Bank\'s "Manager speed" is the speed left');
  near(g.auditFine(), fine0 * 1.5, 1e-9);
  const h = mk(['heir']), hn = noted(h); h._auditFail(false);
  assert.equal(hn[0].text, 'The family lawyer waived the first audit fine.'); assert.ok(!/Fine/.test(hn.at(-1).text), 'no "Fine $0.00" for a fine that was waived'); assert.match(hn.at(-1).text, /^You were caught\. Manager speed drops 15% for good\.$/);
  // the three answers: the Bank's buttons, in the Bank's words
  const a = mk(['trades']); a.s.mil.m2 = true; a.s.auditPending = { id: 'x', title: 't', due: 99, at: 0 }; a.s.cash = 5000;
  const A = a.resolveAudit('A'); assert.equal(A.msg, `Consultant hired for ${usd(AUDIT.fee * Math.max(0.7, 1 - 0.03 * (a.lvl('fintech') - 1)))}. Your managers keep running.`);
  const b = mk(); b.s.mil.m2 = true; b.s.auditPending = { id: 'x', title: 't', due: 99, at: 0 }; b.s.pipes.push({ id: 'P1', kind: 'student', zone: 5, level: 1, status: 'idle', basis: 10, inflight: 0 });
  const B = b.resolveAudit('B', 'P1'); assert.equal(B.msg, `${PIPE.student.name} stops for ${AUDIT.pauseHours / 24} days to handle the filing.`); assert.equal(b.s.pipes[0].pausedUntil - b.s.hour, AUDIT.pauseHours);
  assert.equal(mk().resolveAudit('B').ok, false);
  const none = mk(); none.s.auditPending = { id: 'x', title: 't', due: 99, at: 0 }; assert.equal(none.resolveAudit('B').msg, 'You have no manager to spare. Choose another path.');
  const c = mk(); c.s.auditPending = { id: 'x', title: 't', due: 99, at: 0 }; c.rand = () => 0; const ev = []; c.onEvent = (e) => ev.push(e); const C1 = c.resolveAudit('C');
  assert.equal(C1.msg, 'Nobody noticed.'); assert.equal(ev.find((e) => e.type === 'audit').ok, true);
  const d = mk(), dn = noted(d); d.s.auditPending = { id: 'x', title: 't', due: 99, at: 0 }; d.rand = () => 0.99; const ev2 = []; d.onEvent = (e) => ev2.push(e); const D1 = d.resolveAudit('C');
  assert.equal(D1.ok, true); assert.equal(D1.msg, '', 'the result has no words: the note is the message'); assert.equal(dn.length, 1);
  assert.equal(dn[0].level, 'bad'); assert.match(dn[0].text, /^You were caught\. Fine \$[\d,]+\. Manager speed drops 15% for good\.$/);
  assert.equal(ev2.find((e) => e.type === 'audit').ok, false, 'the event still reads the failed bypass as a failed audit, though the result has no words to read it from');
  // the state and the event do not read the message: over many worlds the event is false exactly when the bypass failed, and the fine and the speed are the engine's
  for (let seed = 1; seed <= 40; seed++) {
    const x = mk([], seed), xe = []; x.onEvent = (e) => xe.push(e); x.s.auditPending = { id: 'x', title: 't', due: 99, at: 0 }; const v0 = x.s.velPenalty, r = x.resolveAudit('C'), failed = x.s.auditFail === 1;
    assert.equal(xe.find((e) => e.type === 'audit').ok, !failed); assert.equal(x.s.auditPass, failed ? 0 : 1); assert.equal(r.msg, failed ? '' : 'Nobody noticed.'); assert.equal(x.s.velPenalty, failed ? v0 * AUDIT.velocityHit : v0);
  }
});

test('M2: market fatigue says what the craze\'s phases do: half their value, for 72 hours, from hour 48', () => {
  const fade = C.EVENTS.tiktok.phases.find((p) => p.eff.price), g = mk(), ns = noted(g); g.advanceTo(C.EVENTS.tiktok.day * 24 - 24 + fade.from);
  const text = ns.find((n) => n.kind === 'fatigue').text;
  assert.equal(fade.eff.price.mult, 0.5); assert.deepEqual(fade.eff.price.tags, ['trend']); assert.equal(fade.to - fade.from, 72);
  assert.equal(text, 'Market fatigue: trend goods lose half their value for 72 hours.');
});

test('M2: a contract that cannot pay back before the bell says how many paying days are left and how many it needs', () => {
  const g = mk(); g.s.cash = 1e6; g.s.zones.push(13); g.s.mil.m3 = true; g.s.hour = 80 * 24;
  for (let i = 0; i < 3; i++) g.s.pipes.push({ id: 'P' + i, kind: 'broker', zone: 5, level: 1, status: 'running', basis: 0, inflight: 0 });
  const q = g.clientQuote('ent'), r = g.acquireClient('ent');
  assert.equal(r.ok, false); assert.equal(r.msg, `This contract could not earn back its ${usd(q.cac)} before day 90: ${q.payDays} paying days left, and it needs ${Math.ceil(q.payback)}.`);
  assert.ok(Math.ceil(q.payback) > q.payDays, 'and the numbers say why');
  const lean = mk(); lean.s.zones.push(13); lean.s.mil.m3 = true; assert.equal(lean.acquireClient('ent').msg, `This account needs at least ${CLIENTS.ent.minRunning} managers. Hire more first.`);
});

test('M2: the overdraft note names its rate, and the engine charges it', () => {
  const g = mk(), ns = noted(g); g.s.cash = -12.5; g.advanceTo(24 * 3 + 1);
  const row = g.s.ledger.find((r) => r.type === 'overdraft'), rate = Math.abs(row.amt) / 12.5, text = ns.find((n) => n.kind === 'overdraft').text;
  assert.equal(`${+(rate * 100).toFixed(1)}`, text.match(/is ([\d.]+)% a day/)[1]); assert.match(text, /^Cash is negative \(-\$\d/);
});

test('M2: a loan: the rate in the message is the engine\'s, per 30 days, and the fee is the product\'s', () => {
  const g = mk(); g.s.cash = 5000; g.advanceTo(g.s.hour + 1);
  const r = g.draw('micro', 1000); assert.ok(r.ok, r.msg);
  const rate = g.loanRate('micro'), fee = 1000 * LOANS.micro.fee;
  assert.equal(r.msg, `Drew $1,000 at ${(rate * 100).toFixed(1)}% a month. Fee ${usd(fee)}.`);
  const h = mk(); h.s.cash = 5000; h.s.loans.push({ id: 'D1', prod: 'pipeline', principal: 1000, accr: 0, last: 0, next: 168, drawn: 0 }); h.advanceTo(24);
  near(h.s.loans[0].accr, 1000 * h.loanRate('pipeline') / 30, 1e-9); // a day accrues a thirtieth of the rate the message quotes
});

test('M2: a refusal for want of cash says what it takes and what there is, the same way each time', () => {
  const g = mk(); g.s.cash = 1; g.advanceTo(g.s.hour + 1);
  const cash = g.s.cash, best = g.radar(5, 1)[0], lane = { cls: best.cls, buyer: best.seg };
  const say = (r, cost, thing) => { assert.equal(r.ok, false); assert.equal(r.msg, `Need ${usd(cost)} for ${thing}; you have ${usd(cash)}.`); };
  g.s.cash = cash; const lot = g.s.lots[1][0]; say(g.buyLot(1, lot.id), lot.price, 'the lot');
  g.s.zones.push(5); g.s.mil.m1 = true;
  say(g.hirePipeline('student', 5, lane), g.pipeCost('student', 5), 'hiring');
  g.s.pipes.push({ id: 'P1', kind: 'student', zone: 5, level: 1, status: 'idle', basis: 10, inflight: 0 }); say(g.upgradePipeline('P1'), g.pipeUpCost(g.s.pipes[0]), 'the upgrade');
  say(g.buyUpgrade('freight'), C.UPGRADES.freight.cost, 'this upgrade');
  say(g.acquireClient('smb'), g.clientQuote('smb').cac, 'the account');
  g.s.mil.m2 = true; g.s.auditPending = { id: 'x', title: 't', due: 99, at: 0 }; const fee = AUDIT.fee * Math.max(0.7, 1 - 0.03 * (g.lvl('fintech') - 1)); say(g.resolveAudit('A'), fee, 'the consultant');
  // the three sites the list left out: the check on a buyer (a manager is hired, so the last-crate voucher does not apply), a repair, a truck
  const buyer = { id: 'Lv', zone: 1, seg: 'student', budget: 5000, need: null, born: 0, exp: 999 }; g.s.leads[1].push(buyer);
  say(g.verifyLead('Lv'), buyer.budget * 0.01, 'verification');
  const dear = Object.keys(ASSETS).filter((c) => ASSETS[c].repair).sort((x, y) => g.repairQuoteFor(y, 1).cost - g.repairQuoteFor(x, 1).cost)[0];
  const wreck = g._mk(g.s, dear, { zone: 1, basis: 1, cond: 'broken' }); g.s.assets.push(wreck);
  say(g.repair(wreck.id), g.repairQuote(wreck.id).cost, 'the repair');
  const prized = Object.keys(ASSETS).sort((x, y) => ASSETS[y].base - ASSETS[x].base)[0], crate = g._mk(g.s, prized, { zone: 1, basis: 1 }); g.s.assets.push(crate);
  say(g.ship([crate.id], 5), g.freightQuote([crate.id], 5).cost, 'freight');
});

test('M2: a full destination is named in the refusal to ship there', () => {
  const g = mk(); g.s.cash = 1e6; g.s.zones.push(5); g.s.assets = [];
  const at = (z) => g._mk(g.s, 'pen', { zone: z, basis: 1 });
  for (let i = 0; i < g.storeCap(5); i++) g.s.assets.push(at(5));
  const a = at(1); g.s.assets.push(a); assert.equal(g.roomIn(5), 0);
  const r = g.ship([a.id], 5); assert.equal(r.ok, false); assert.equal(r.msg, `${ZONES[5].short} does not have room for all of that.`);
});

test('M2: an SLA breach asks for the managers the config names, and the client leaves on the breach the note counts', () => {
  const g = mk(), ns = noted(g), K = CLIENTS.corp, WORDS = { one: 1, two: 2, three: 3, four: 4 }, left = () => ns.find((n) => /left after/.test(n.text));
  g.s.clients.push({ id: 'C9', tier: 'corp', cac: 1, until: 24 * 60, earned: 0, breaches: 0 });
  g.advanceTo(24);
  const first = ns.find((n) => n.kind === 'sla');
  assert.equal(first.text, `SLA breach on your ${K.name}: ${usd(K.perDay * 2)} penalty. Keep ${K.minRunning} managers running.`);
  assert.equal(g.s.clients.length, 1); assert.ok(!left(), 'one breach is not the end');
  g.advanceTo(48);
  const bye = left(); assert.ok(bye, 'the second is'); assert.equal(g.s.clients.length, 0);
  assert.equal(WORDS[/left after (\w+) SLA breaches/.exec(bye.text)[1]], ns.filter((n) => n.kind === 'sla').length, 'the number the note says is the number of breaches it took');
});

test('M2: a refusal for want of cash never prints a balance at or above the cost, however near the two are', () => {
  const g = mk(); g.s.cash = 1; g.advanceTo(g.s.hour + 1);
  const best = g.radar(5, 1)[0], lane = { cls: best.cls, buyer: best.seg };
  g.s.zones.push(5); g.s.mil.m1 = true;
  const cost = g.pipeCost('student', 5), figure = (s) => Number(s.replace(/[$,]/g, ''));
  assert.equal(cost, 120);
  const say = (cash) => { g.s.cash = cash; const r = g.hirePipeline('student', 5, lane); assert.equal(r.ok, false); return r.msg; };
  for (const short of [0.001, 0.05, 0.3, 0.49, 0.5, 0.51, 0.7, 0.99, 1, 1.4, 1.5, 2, 30]) {
    const m = /^Need (\$[\d,.]+) for hiring; you have (\$[\d,.]+)\.$/.exec(say(cost - short));
    assert.ok(m, `${short} short`); assert.ok(figure(m[2]) < figure(m[1]), `${m[0]} (${short} short)`);
  }
  assert.equal(say(cost - 0.3), 'Need $120.00 for hiring; you have $119.70.', 'whole dollars cannot show a gap of under a dollar, so both go to the cent');
  assert.equal(say(cost - 2), 'Need $120 for hiring; you have $118.', 'a wider gap reads as the screens write money');
  assert.equal(say(cost - 0.001), 'Need $120.00 for hiring; you have $119.99.', 'and a balance under the cost by less than a cent still reads lower');
  for (const z of Object.keys(ZONES)) if (!g.s.zones.includes(+z)) g.s.zones.push(+z);
  g.advanceTo(g.s.hour + 48);
  const lot = Object.keys(ZONES).flatMap((z) => (g.s.lots[z] || []).map((l) => ({ z: +z, l }))).find((x) => x.l.price >= 100);
  g.s.cash = lot.l.price - 0.3;
  assert.equal(g.buyLot(lot.z, lot.l.id).msg, `Need $${lot.l.price.toFixed(2)} for the lot; you have $${(lot.l.price - 0.3).toFixed(2)}.`);
});

test('M2: storage counts trucks and open swaps, as the refusal says', () => {
  const g = mk(); g.s.cash = 1e6; g.s.assets = [];
  const cap = g.storeCap(1), lot = g.s.lots[1][0], at = () => g._mk(g.s, 'pen', { zone: 1, basis: 1 });
  for (let i = 0; i < cap - 1; i++) g.s.assets.push(at());
  g.s.freight.push({ id: 'F1', items: [at()], to: 1, sent: 0, arrive: g.s.hour + 5, risk: 0, book: 1, from: 2 });
  const full = g.buyLot(1, lot.id); assert.equal(full.ok, false); assert.match(full.msg, /^Storage is full here, counting trucks and open swaps\. Sell something or ship it out\.$/);
  g.s.freight = [];
  g.s.escrow.push({ offerId: 'O1', assets: [at()], cash: 0, at: 0, offer: { want: { assets: [] }, give: { assets: [] } } });
  assert.equal(g.buyLot(1, lot.id).msg, full.msg, 'a crate held for a swap fills a place too');
  g.s.escrow = []; assert.equal(g.buyLot(1, lot.id).ok, true, 'and with the truck and the swap gone there is room');
});

test('M2: the pool refills the share of its size the refusal names, and a swap holds as many crates as it says', () => {
  const g = mk(); g.s.pool[1] = 0; g.advanceTo(24);
  const share = g.s.pool[1] / ZONES[1].pool;
  g.s.pool[1] = 0.5; g.s.assets = []; const big = g._mk(g.s, Object.keys(ASSETS).find((c) => ASSETS[c].base > 500), { zone: 1, basis: 1 }); g.s.assets.push(big);
  const r = g.sellPool([big.id]); assert.equal(r.ok, false);
  assert.equal(r.msg, `The ${ZONES[1].short} liquidity pool has only $0.50 left and refills ${Math.round(share * 100)}% of its size a day. Sell fewer crates or wait.`);
  const s = mk(); s.s.assets = []; const ids = []; for (let i = 0; i < 40; i++) { const a = s._mk(s.s, 'pen', { zone: 1, basis: 1 }); s.s.assets.push(a); ids.push(a.id); }
  const max = +/at most (\d+) crates/.exec(s.createOffer({ to: 'B', giveIds: ids.slice(0, 30) }).msg)[1];
  assert.ok(max >= 2 && max < 30); assert.doesNotMatch(s.createOffer({ to: 'B', giveIds: ids.slice(0, max) }).msg || '', /at most/); assert.match(s.createOffer({ to: 'B', giveIds: ids.slice(0, max + 1) }).msg, new RegExp(`at most ${max} crates`));
});

test('M2: a lopsided swap says how far apart its sides are and what the limit is, and says when an instructor is told', () => {
  const A = mk([], 1), B = mk([], 2); A.s.pid = 'AAA'; B.s.pid = 'BBB';
  const scrap = B._mk(B.s, 'scrap', { zone: 1, basis: 1 }); B.s.assets.push(scrap);
  const bad = A.createOffer({ to: 'BBB', giveIds: [], giveCash: 1_000_000, want: { assets: [B.pub(scrap)], cash: 0 } });
  const flag = A.out.find((m) => m.t === 'flag');
  assert.equal(bad.msg, `Blocked: the two sides are ${(flag.offer.variance * 100).toFixed(0)}% apart (limit ${FMV_BAND * 100}%). In a classroom, your instructor is told. Balance it with cash or another crate.`);
  assert.ok(flag.offer.variance > FMV_BAND, 'it is past the limit it names');
  assert.doesNotMatch(bad.msg, /Extreme|Asymmetric|Premium|deviates|fair market/);
  // a bid for a crate from a district the bidder has not opened is not misconduct: it is said so, with something to do, and nobody is told
  const P = mk([], 1, 'POOR'), R = mk([], 2, 'RICH'); P.s.cash = 2000; P.advanceTo(P.s.hour + 1); for (let z = 2; z <= 9; z++) R._openZone(z);
  let far = null;
  for (const cls of Object.keys(ASSETS)) for (const z of [7, 8, 9]) {
    if (demandOf(ASSETS[cls], z) < 4 || ASSETS[cls].perish) continue;
    const c = { id: 'Fq', cls, cond: 'ok', quality: 1, wear: 1, zone: z }, sits = P.sideValue({ assets: [c] }, { landing: false }), lands = P.sideValue({ assets: [c] }, { landing: true });
    if (sits > lands * 1.6 && lands > 5 && lands < 1500 && (!far || sits > far.sits)) far = { cls, z, sits, lands };
  }
  assert.ok(far); const x = R._mk(R.s, far.cls, { zone: far.z, basis: 1 }); R.s.assets.push(x);
  const bid = P.createOffer({ to: 'RICH', giveCash: Math.round(far.lands), want: { assets: [R.pub(x)], cash: 0 } });
  assert.equal(bid.msg, 'Cannot be sent: a crate you asked for sits in a district you have not opened, so its owner values it far above what it is worth to you. Ask for another crate.');
  assert.ok(!P.out.some((m) => m.t === 'flag'));
  // and the same crate priced where the bidder would hold it, still far off: the refusal quotes the engine's own figures
  const cheap = P.createOffer({ to: 'RICH', giveCash: 1, want: { assets: [R.pub(x)], cash: 0 } });
  assert.equal(cheap.ok, false);
  const m = /^Blocked: (?:the two sides are|priced where you would hold the crates you ask for, the two sides are) (\d+)% apart \(limit (\d+)%\)\. /.exec(cheap.msg);
  assert.ok(m, cheap.msg); assert.equal(+m[1], Math.round(cheap.chk.variance * 100)); assert.equal(+m[2], FMV_BAND * 100);
});

test('M2: the figure is the gap as a share of the LOWER side: a bid 28% under what a crate is worth goes through and 30% under is blocked, while an ask 39% over goes through and 41% over is blocked', () => {
  const bid = (share) => {
    const A = mk([], 1), B = mk([], 2); A.s.pid = 'AAA'; B.s.pid = 'BBB'; A.s.cash = 1e6;
    const c = B._mk(B.s, 'scrap', { zone: 1, basis: 1 }); B.s.assets.push(c);
    return A.createOffer({ to: 'BBB', giveIds: [], giveCash: B.val(c) * share, want: { assets: [B.pub(c)], cash: 0 } });
  };
  assert.equal(bid(0.72).ok, true, '28% under is inside: 1 / 0.72 - 1 = 38.9%');
  const low = bid(0.70); assert.equal(low.ok, false, '30% under is outside: 1 / 0.70 - 1 = 42.9%, though the player is only 30% under what the crate is worth');
  assert.match(low.msg, /^Blocked: the two sides are 43% apart \(limit 40%\)\. /); near(low.chk.variance, 1 / 0.70 - 1);
  assert.equal(bid(1.39).ok, true); const high = bid(1.41); assert.equal(high.ok, false);
  assert.match(high.msg, /^Blocked: the two sides are 41% apart \(limit 40%\)\. /);
  assert.doesNotMatch(low.msg + high.msg, /from fair value/, 'it does not say the figure is a distance from fair value: for a bid under the crate\'s worth it is not');
});

// ---------------------------------------------------------------------------------------------------------------------
// M3. One message for one action, one string for one refusal
// ---------------------------------------------------------------------------------------------------------------------
test('M3: a hire, a loan and an exit say it once: the result carries the facts and writes no second note', () => {
  const g = mk(); g.s.cash = 5000; g.advanceTo(g.s.hour + 1);
  const lane = g.radar(5, 1)[0], n0 = g.s.news.length;
  const hire = g.hirePipeline('student', 5, { cls: lane.cls, buyer: lane.seg });
  assert.equal(hire.msg, `${PIPE.student.name} hired. Lane: ${ASSETS[lane.cls].name} to ${C.BUYERS[lane.seg].name}.`);
  const draw = g.draw('micro', 500); assert.ok(draw.ok, draw.msg);
  assert.equal(g.s.news.length, n0, 'neither wrote a note: a toast for the result, not a second for the same thing');
  const e = mk(); e.s.cash = 400000; e.advanceTo(e.s.hour + 1); e.s.auditFirst = true; e.s.auditNext = null; const n1 = e.s.news.length;
  const exit = e.exit('ipo'); assert.ok(exit.ok, exit.msg);
  assert.equal(exit.msg, 'IPO launched. It settles in 48 hours.'); assert.equal(e.s.exiting.at - e.s.hour, 48, 'the 48 hours the message names'); assert.equal(e.s.news.length, n1);
  assert.equal(e.s.settle.at(-1).at, e.s.exiting.at, 'and the money lands when the exit closes (the Bank says "The sale money lands then")');
  assert.equal(mk().exit('trade').ok, false);
});

test('M3: a fraudulent buyer, a broken crate and a full yard are each refused in one string, and the screens that say them say the same stem', () => {
  const FRAUD = 'Fraud confirmed. Skip this buyer.';
  const g = mk(['native'], 3); g.s.cash = 20; g.s.leads[1].push({ id: 'La', zone: 1, seg: 'student', budget: 40, need: null, born: 0, exp: 999, scam: true });
  assert.equal(g.verifyLead('La').msg, FRAUD); assert.equal(g.quotePitch(g.s.assets[0].id, 'La').msg, FRAUD);
  const broken = mk(), seg = Object.keys(C.BUYERS).find((id) => C.BUYERS[id].zone === 1 && !broken.acceptsBroken(id)), cls = Object.keys(ASSETS).find((c) => ASSETS[c].repair && C.demandOf?.(ASSETS[c], 1) !== 0);
  broken.s.leads[1].push({ id: 'Lb', zone: 1, seg, budget: 99, need: null, born: 0, exp: 999 });
  const crate = broken._mk(broken.s, cls, { zone: 1, basis: 1, cond: 'broken' }); broken.s.assets.push(crate);
  const refusal = broken.quotePitch(crate.id, 'Lb'); assert.equal(refusal.ok, false); assert.equal(refusal.msg, 'This buyer will not take a broken crate. Repair it first, or find a scrap buyer.');
  const stems = { 'js/ui/drawers/market.js': ['This buyer will not take a broken crate', 'Storage is full here'], 'js/deal.js': [FRAUD, 'Storage is full here'], 'js/ui/deal.js': [FRAUD] };
  for (const [file, list] of Object.entries(stems)) for (const stem of list) assert.ok(read(file).includes(stem), `${file} says "${stem}", as the engine does`);
});

// ---------------------------------------------------------------------------------------------------------------------
// M4. The Cash and Net worth windows add up
// ---------------------------------------------------------------------------------------------------------------------
test('M4: the lines of the Cash and Net worth windows add up to the net worth, royalties owed included', () => {
  const sum = (g) => worthRows(g).reduce((t, [, v]) => t + v, 0);
  const fresh = mk(); near(sum(fresh), fresh.netWorth(), 1e-9);
  const mid = makeGame(['trades', 'pro'], 'ops', 13); run(mid, { days: 25 }); near(sum(mid), mid.netWorth(), 1e-6);
  assert.ok(mid.s.pipes.length || mid.s.assets.length, 'a game with something in it');
  const g = makeGame(['trades', 'pro'], 'ops', 13); run(g, { days: 25 });
  g.s.royalties.push({ dir: 'pay', peer: 'PC-ZZZZ', perDay: 40, days: 5, since: g.s.hour, until: g.s.hour + 120, offer: 'O1', arrears: 10, cap: 500, paid: 0 });
  g.s.settle.push({ amt: 321, at: g.s.hour + 30 }); g.s.escrow.push({ offerId: 'Ox', assets: [g._mk(g.s, 'pen', { zone: 1, basis: 1 })], cash: 77, at: g.s.hour, offer: { want: { assets: [] }, give: { assets: [] } } });
  g.s.freight.push({ id: 'Fx', items: [g._mk(g.s, 'pen', { zone: 1, basis: 1 })], to: 1, sent: g.s.hour, arrive: g.s.hour + 4, risk: 0, book: 1, from: 2 });
  near(sum(g), g.netWorth(), 1e-6);
  const owed = worthRows(g).find(([label]) => label === 'Royalties owed'); assert.ok(owed && owed[1] < 0 && Math.abs(owed[1] + g.royaltyOwed()) < 1e-9, 'the line the Breakdown used to leave out: what netWorth() takes off');
  assert.ok(worthLines(g).some(([label]) => label === 'Royalties owed'));
  // a line that is zero is not shown, except the first two
  const labels = worthLines(fresh).map(([label]) => label); assert.deepEqual(labels, ['Cash on hand', 'Stock at fair value']);
  assert.deepEqual(worthRows(fresh).map(([label]) => label).filter((l) => /\bassets?\b|inventory|\(book\)/i.test(l)), [], 'the windows say stock and crates, as the screens do');
  assert.ok(worthRows(g).every(([label, v, tip], i) => i < 2 || i === 7 || (typeof tip === 'string' && tip.length > 10)), 'each derived line says on hover what it is');
});

// ---------------------------------------------------------------------------------------------------------------------
// M5. The settings dialog opens on a few words
// ---------------------------------------------------------------------------------------------------------------------
test('M4: a window is named by its heading, and Help says how the keyboard drives the game', () => {
  const src = read('js/ui/shell.js');
  assert.match(src, /const title = \{ cash: 'Cash', nw: 'Net worth', day: 'Clock' \}\[k\] \|\| 'Numbers';/, 'the Cash, Net worth and Clock windows have one name, and it is their heading');
  assert.match(src, /<h2 tabindex="-1" autofocus>\$\{title\}<\/h2>\$\{body\}`, \{ label: title \}\);/, 'and the dialog is labelled with it: a screen reader said "Breakdown" for a window headed Cash');
  assert.ok(!/label: 'Breakdown'/.test(src));
  assert.match(src, /<li><b>Tab<\/b> moves, <b>Enter<\/b> or <b>Space<\/b> presses\.<\/li><\/ol>`, \{ label: 'Help' \}\)/, 'Help names the keys that run the game besides the shortcuts: Tab, Enter and Space were documented nowhere');
});

test('M5: the settings dialog\'s default words are few: the WCAG note and the privacy line are gone, the rows explain themselves on hover, the rest folds', () => {
  const common = read('js/ui/common.js');
  assert.ok(!/WCAG|Settings are stored only in this browser/.test(common), 'no accessibility claim and no privacy line in front');
  const html = audioSettingsHTML(audioDefaults(), 'running');
  const words = (h) => h.replace(/<details[\s\S]*?<\/details>/g, ' What these are, and if you hear nothing ').replace(/<option[^>]*>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").split(/\s+/).filter(Boolean).length;
  assert.ok(words(html) <= 50, `the Sound section is ${words(html)} words by default (it was 128)`);
  for (const id of ['s-ui', 's-game', 's-world', 's-clock', 's-amb', 's-dial']) {
    assert.match(html, new RegExp(`<label title="[^"]{12,}"><input type="checkbox" id="${id}"[^>]* title="[^"]{12,}">`), `${id}: what it covers is its hover`);
    assert.match(html, new RegExp(`id="${id}-h"[^>]*></span>`), `${id}: nothing is written beside the row until there is a state to say`);
  }
  assert.match(html, /<details class="cx-more"><summary>What these are, and if you hear nothing<\/summary><p class="small">Check your device's volume and its silent switch: the browser can be on while the device is silent\.<\/p><dl class="small">/); assert.ok(!/<details[^>]* open/.test(html), 'and it is closed');
  // a title is shown to a mouse and to nothing else (the HTML Standard says so of the attribute): the same sentences are in the fold, which Tab, Enter and a tap reach
  const fold = html.match(/<details class="cx-more">[\s\S]*?<\/details>/)[0];
  for (const id of ['s-ui', 's-game', 's-world', 's-clock', 's-amb', 's-dial']) {
    const tip = html.match(new RegExp(`<label title="([^"]+)"><input type="checkbox" id="${id}"`))[1];
    assert.ok(fold.includes(`<dd>${tip}</dd>`), `${id}: what it covers is in the fold as well as in its hover`);
  }
  assert.equal(statusText(audioDefaults(), 'running'), 'Sound is on.'); assert.match(statusText(audioDefaults(), 'locked'), /^Sound is on\. Your browser starts audio after your first click\.$/);
  // a state is still said where it matters
  assert.match(audioSettingsHTML({ ...audioDefaults(), mute: true }, 'running'), /id="s-ui-h"[^>]*>Muted\./); assert.match(audioSettingsHTML({ ...audioDefaults(), quiet: true }, 'running'), /id="s-amb-h"[^>]*>Off in Classroom\./);
});

// ---------------------------------------------------------------------------------------------------------------------
// the old words are gone from what a player reads
// ---------------------------------------------------------------------------------------------------------------------
test('M2: the jargon this pass replaced is gone from the sources that speak', () => {
  const OLD = [/clearing horizon/i, /Liability added/, /Governance drag/, /Extreme Asymmetric/, /Gate 2/, /BREAKING:/, /MARGIN CALL/, /Margin Liquidation Protocol/, /Digital Natives attract/, /fair market value/, /fire-sale/, /Pipeline lane:/, /family stepped in/, /simulation is complete/i, /Resolve your audit/, /liquidating assets/];
  for (const f of ['js/engine.js', 'js/session.js', 'js/ui/shell.js', 'js/ui/worldview.js', 'js/ui/audiocues.js', 'js/ui/common.js', 'js/audio/settings.js', 'js/audio/wire.js', 'js/audio/recipes.js', 'docs/AUDIO.md']) {
    const src = read(f);
    for (const re of OLD) assert.ok(!re.test(src), `${f} still says ${re}`);
  }
  assert.ok(!/Click to /.test(read('js/ui/worldview.js').replace(/\/\/.*$/gm, '')), 'a tooltip says what a thing is, not that it can be clicked');
});

test('M2: a message in the engine says crate and district, as the screens do, never asset or zone', () => {
  const src = read('js/engine.js');
  const msgs = [...src.matchAll(/(?:fail|ok)\((['`])((?:(?!\1).)*)\1/g)].map((m) => m[2].replace(/\$\{[^}]*\}/g, ''));
  assert.ok(msgs.length > 100);
  assert.deepEqual(msgs.filter((m) => /\bassets?\b/i.test(m)), [], 'a refusal names a crate');
  assert.deepEqual(msgs.filter((m) => /\bzones?\b/i.test(m)), [], 'and a district');
});
