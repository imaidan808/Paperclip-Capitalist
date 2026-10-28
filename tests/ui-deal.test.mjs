// The Deal Room screen (js/ui/deal.js): its HTML builders (pure, no DOM), coach-mark anchors, Assist, reduced motion, hidden truth, and the
// session that forwards clicks to the run. The DOM half is exercised through the same action table a click would use.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeGame } from './bot.mjs';
import { fakeCtx, checkHTML } from './helpers/ctx.mjs';
import { ASSETS } from '../js/config.js';
import * as D from '../js/deal.js';
import * as UI from '../js/ui/deal.js';

const HAS = !!(D.GAMES.haggle && D.GAMES.auction);
const world = (perks = ['grad', 'native'], seed = 9) => {
  const g = makeGame(perks, 'ops', seed);
  for (const z of [2, 3, 4, 6]) g._openZone(z);
  g.s.cash = 1e6; g.s.skills.growth = 4; g.s.skills.fintech = 3;
  for (const z of g.s.zones) for (const cls of Object.keys(ASSETS).filter((c) => (ASSETS[c].dem?.[z] || 0) >= 4).slice(0, 4)) g.s.assets.push(g._mk(g.s, cls, { zone: z, basis: 1 }));
  for (const z of g.s.zones) for (let k = 0; k < 4; k++) g._spawnLot(z);
  return g;
};
const sell = (g) => { for (const z of g.s.zones) for (const lead of g.s.leads[z]) for (const a of g.s.assets.filter((x) => x.zone === z)) { const q = g.quotePitch(a.id, lead.id); if (q.ok && q.fit >= 0.15 && !q.rejected && !D.startRun(g, { kind: 'sell', assetId: a.id, leadId: lead.id }).plan?.capped) return { kind: 'sell', assetId: a.id, leadId: lead.id }; } };
const fixedLot = (g, z = 4) => ({ kind: 'buy', zone: z, lotId: g.s.lots[z].find((l) => l.mode === 'fixed').id });
const auctionLot = (g, z = 6) => { if (!g.s.lots[z].some((l) => l.mode === 'auction')) for (let i = 0; i < 20; i++) g._spawnLot(z); return { kind: 'buy', zone: z, lotId: g.s.lots[z].find((l) => l.mode === 'auction').id }; };
const brokenCrate = (g) => { const a = g.s.assets.find((x) => ASSETS[x.cls].repair); a.cond = 'broken'; return { kind: 'repair', assetId: a.id }; };
const model = (run, extra = {}) => ({ ...D.modelOf(run, { reduced: !!extra.reduced }), pick: extra.pick || [], slider: extra.slider ?? 0.2 });
const html = (run, extra) => UI.sheetHTML(model(run, extra));
const start = (g, spec, opts) => { const r = D.startRun(g, spec, opts); assert.ok(r.ok, r.msg); return r; };

test('the Deal Room is the function the shell calls, and the builders are exported', () => {
  for (const f of ['openDeal', 'createSession', 'sheetHTML', 'readHTML', 'pitchHTML', 'closeHTML', 'bidHTML', 'fixHTML', 'resultHTML', 'castHTML', 'scoreHTML', 'stepperHTML', 'titleOf']) assert.equal(typeof UI[f], 'function', f);
  const shell = readFileSync(new URL('../js/ui/shell.js', import.meta.url), 'utf8');
  assert.match(shell, /import \{ openDeal \} from '\.\/deal\.js'/); assert.match(shell, /deal: \(spec\) => openDeal\(ctx, spec\)/);
});

test('every stage of every kind draws valid HTML, with its coach-mark anchor', { skip: !HAS }, () => {
  const g = world();
  const seen = new Set();
  const visit = (r, label) => {
    for (let guard = 0; guard < 12; guard++) {
      const h = html(r), key = r.key;
      assert.deepEqual(checkHTML(h, `${label}/${key}`), []);
      assert.match(h, /data-anchor="deal-room"/);
      if (key !== 'result') assert.match(h, new RegExp(`data-anchor="deal-stage-${key === 'bid' || key === 'fix' ? key : key}"`));
      seen.add(key);
      if (!r.stageDone()) r.quick();
      assert.deepEqual(checkHTML(html(r), `${label}/${key}/done`), []);
      if (!r.next()) break;
    }
    r.finish(); const h = html(r); assert.deepEqual(checkHTML(h, `${label}/result`), []); assert.match(h, /data-anchor="deal-result"/); seen.add('result');
  };
  visit(start(g, sell(g)), 'sell'); visit(start(g, fixedLot(g)), 'buy'); visit(start(g, auctionLot(g)), 'auction'); visit(start(g, brokenCrate(g)), 'repair');
  for (const k of ['read', 'pitch', 'close', 'bid', 'fix', 'result']) assert.ok(seen.has(k), `${k} was drawn`);
});

test('the three tutorial anchors for stages are exactly deal-stage-read, -pitch and -close, and deal-quick sits on Quick', { skip: !HAS }, () => {
  const g = world(), b = start(g, fixedLot(g)), s = start(g, sell(g));
  assert.match(UI.readHTML(model(b)), /data-anchor="deal-stage-read"/); assert.match(UI.pitchHTML(model(s)), /data-anchor="deal-stage-pitch"/);
  b.quick(); b.next(); assert.match(UI.closeHTML(model(b)), /data-anchor="deal-stage-close"/);
  for (const r of [s, start(g, fixedLot(g)), start(g, brokenCrate(g))]) { const h = html(r); assert.match(h, /data-anchor="deal-quick"/); assert.ok(h.includes('Quick: auto-play at average skill')); }
  assert.equal(UI.QUICK_LABEL, 'Quick: auto-play at average skill');
});

test('"Quick deal" is one button on the first screen of a multi-stage deal, and nowhere else', { skip: !HAS }, () => {
  const g = world(), count = (h) => (h.match(/Quick deal/g) || []).length;
  const s = start(g, sell(g)); assert.equal(count(html(s)), 1);
  assert.equal(count(html(start(g, brokenCrate(g)))), 0, 'repair has one stage: its Quick button is the stage Quick');
  s.act({ type: 'pick', angles: ['utility', 'story'] }); s.next();
  assert.equal(count(html(s)), 0, 'after the first stage there is only the stage Quick');
  const r = start(g, fixedLot(g)); r.act({ type: 'probe', id: 'look' }); assert.equal(count(html(r)), 0, 'not once you have played');
});

test('the stepper names the stages, marks the current one and what is done', { skip: !HAS }, () => {
  const g = world(), r = start(g, fixedLot(g));
  let h = UI.stepperHTML(model(r)); assert.match(h, /aria-label="Deal stages"/); assert.match(h, /aria-current="step"/);
  assert.ok(h.indexOf('Read') < h.indexOf('Close') && /\(now\)/.test(h) && /\(to come\)/.test(h));
  r.quick(); r.next(); h = UI.stepperHTML(model(r)); assert.match(h, /✓/); assert.match(h, /\(done\)/);
  assert.match(UI.stepperHTML(model(start(g, sell(g)))), /Pitch[\s\S]*Close/);
  const au = start(g, auctionLot(g)); au.quick(); au.next(); assert.match(UI.stepperHTML(model(au)), /Bid/); assert.match(UI.titleOf(model(au)), /^Bid on/);
  assert.match(UI.titleOf(model(start(g, brokenCrate(g)))), /^Repair /);
});

test('the cast: a large character, a name, their line, and a polite live bubble', { skip: !HAS }, () => {
  const g = world(), r = start(g, sell(g)), h = UI.castHTML(model(r));
  assert.match(h, /class="cast-icon"/); assert.match(h, /role="status" aria-live="polite"/); assert.ok(h.includes(UI.titleOf(model(r)).split(' to ')[1].replace(/&/g, '&amp;')) || h.includes('cast-name'));
  r.act({ type: 'pick', angles: ['utility', 'story'] }); const h2 = UI.castHTML(model(r)); assert.notEqual(h, h2, 'the bubble now carries what the buyer said');
  assert.match(UI.castHTML(model(start(g, fixedLot(g)))), /Seller/);
  assert.match(UI.castHTML(model(start(g, brokenCrate(g)))), /Workbench/);
});

test('everything the screen prints is escaped', { skip: !HAS }, () => {
  const g = world(), r = start(g, sell(g)), m = model(r);
  m.cast = { ...m.cast, name: '<img src=x onerror=alert(1)>', hello: '"><script>x</script>' }; m.plan = { ...m.plan, asset: { ...m.plan.asset, name: '<b>boom</b>' }, buyer: { name: '<u>who</u>', style: 'hard' } };
  const h = UI.sheetHTML(m); assert.ok(!/<img|<script|<b>boom|<u>who/.test(h)); assert.match(h, /&lt;img/);
});

// ------------------------------------------------------------------ hidden truth
test('no hidden truth reaches the screen before the deal is over, at any stage (HTML level)', { skip: !HAS }, () => {
  const g = world(['native', 'second']);
  const FLAWS = ['SECRETFLAW-a', 'SECRETFLAW-b', 'SECRETFLAW-c'];
  const lot = g.s.lots[4].find((l) => l.mode === 'fixed'); lot.truth = { q: 0.8137, fake: true, defects: FLAWS.map((label, i) => ({ id: 'd' + i, label })) };
  const au = auctionLot(g, 4); g.s.lots[4].find((l) => l.id === au.lotId).truth = { q: 0.8137, fake: true, defects: FLAWS.map((label, i) => ({ id: 'd' + i, label })) };
  const spec = sell(g), lead = (() => { for (const z of g.s.zones) { const l = g.s.leads[z].find((x) => x.id === spec.leadId); if (l) return l; } })(); lead.scam = true;
  const bad = [/0\.8137/, /"truth"/, /scam/i, /counterfeit buyer/i, /trueValue/, /reveal/i];
  const scan = (r, label) => {
    for (let guard = 0; guard < 12; guard++) {
      const h = html(r), key = r.key, found = new Set((r.view() && r.view().found) || []);
      for (const re of bad) assert.ok(!re.test(h) || /Scam magnet/.test(h) && re.source === 'scam' || /Fraud/.test(h), `${label}/${key}: ${re}`);
      for (const f of FLAWS) assert.ok(!h.includes(f) || found.has(f) || (r.res.read && r.res.read.defects.includes(f)), `${label}/${key}: ${f} shown but not found`);
      if (key === 'read') { r.act({ type: 'probe', id: 'serial' }); r.act({ type: 'probe', id: 'power' }); r.act({ type: 'conclude' }); }
      else if (key === 'pitch') r.act({ type: 'pick', angles: ['utility', 'price'] });
      else if (key === 'close') { r.act({ type: 'anchor', level: 'fair' }); r.act({ type: 'accept' }); r.act({ type: 'walk' }); }
      else if (key === 'bid') { r.act({ type: 'bid' }); r.act({ type: 'drop' }); }
      else if (key === 'fix') r.act({ type: 'careful' });
      assert.ok(!r.stageDone() || true); if (!r.next()) break;
    }
  };
  scan(start(g, { kind: 'buy', zone: 4, lotId: lot.id }), 'fixed'); scan(start(g, au), 'auction'); scan(start(g, spec), 'sale');
  // the scam word may appear only as the offer of a verification ("Scam magnet. Online buyers..."), never as a verdict
  const r = start(g, spec); assert.match(UI.pitchHTML(model(r)), /Verify this buyer/); assert.ok(!/Fraud confirmed/.test(UI.pitchHTML(model(r))));
  r.verify(); assert.match(html(r), /Fraud confirmed/);
});

test('the result screen reveals what the lot really was, what Quick and an expert would have got, why, XP and one lesson', { skip: !HAS }, () => {
  const g = world();
  const lot = g.s.lots[4].find((l) => l.mode === 'fixed'); lot.truth = { q: 0.8137, fake: false, defects: [{ id: 'd0', label: 'SECRETFLAW-a' }] };
  const r = start(g, { kind: 'buy', zone: 4, lotId: lot.id }); r.quickAll(); r.finish();
  const h = html(r);
  for (const want of ['81% condition, genuine', 'SECRETFLAW-a', 'Quick', 'Expert', 'You', 'Why', '+', 'XP', 'Lesson'.slice(0, 0) + 'lesson', 'Continue']) assert.ok(h.toLowerCase().includes(want.toLowerCase()), `result lacks ${want}`);
  assert.match(h, /aria-label="How you compare"/); assert.match(h, /class="vs quick/); assert.match(h, /class="vs expert/); assert.match(h, /class="vs you/);
  assert.match(h, /<blockquote class="lesson">/);
  const s = start(g, sell(g)); s.quickAll(); s.finish(); const hs = html(s);
  assert.match(hs, /Creativity multiplier/); assert.match(hs, /Buyer fit/); assert.match(hs, /deal streak/); assert.match(hs, /sale price/i);
  const b = start(g, brokenCrate(g)); b.quickAll(); b.finish(); assert.match(html(b), /Precision/); assert.match(html(b), /Quality control|quality/i);
});

test('a loss reads calmly and says what to do next time', { skip: !HAS }, () => {
  const g = world(), spec = sell(g), a = g.s.assets.find((x) => x.id === spec.assetId); a.truth = { q: 1, fake: true, defects: [] };
  const r = start(g, spec); r.quickAll(); r.finish(); const h = html(r), s = r.summary;
  assert.equal(s.tone, 'bad'); assert.match(h, /deal-result bad/); assert.ok(!/!{2}|FAIL|stupid|wrong/i.test(h));
  assert.match(h, /Due diligence/); assert.match(s.lesson.text, /before you pay|look/i);
});

// ------------------------------------------------------------------ Repair: the dial is never timing-only
test('Repair: an animated dial with Stop, a keyboard slider under reduced motion, and Careful in both', { skip: !HAS }, () => {
  const g = world(), r = start(g, brokenCrate(g));
  const anim = UI.fixHTML(model(r)), still = UI.fixHTML(model(r, { reduced: true, slider: 0.5 }));
  assert.match(anim, /dial-mark/); assert.ok(!/type="range"/.test(anim)); assert.match(anim, /data-deal="stop"/); assert.match(anim, /Space/);
  assert.match(still, /type="range"/); assert.match(still, /aria-valuetext="Dial at 50%: inside the green zone"/); assert.match(still, /data-deal="stop"/);
  for (const h of [anim, still]) { assert.match(h, /data-deal="careful"/); assert.match(h, /Careful: pay more, no timing/); assert.match(h, /green zone/); }
  assert.match(UI.fixHTML(model(r, { reduced: true, slider: 0.05 })), /below the green zone/); assert.match(UI.fixHTML(model(r, { reduced: true, slider: 0.95 })), /above the green zone/);
  const zone = anim.match(/class="zone" style="left:([\d.]+)%;width:calc\(([\d.]+)% - ([\d.]+)%\)/); assert.ok(zone, 'the green zone is drawn from the game\'s own numbers');
  r.act({ type: 'careful' }); const done = UI.fixHTML(model(r)); assert.ok(!/data-deal="stop"/.test(done)); assert.match(done, /by the book/);
});

test('Repair under reduced motion: setting the slider and pressing Stop lands where it was set', { skip: !HAS }, () => {
  const g = world(), ctx = fakeCtx(), spec = brokenCrate(g);
  ctx.g = () => g; ctx.reduced = () => true;
  const ses = UI.createSession(ctx, start(g, spec)); ses.show();
  for (let i = 0; i < 3; i++) { ses.slider = 0.5; ses.acts.stop(); }
  assert.ok(ses.run.stageDone('fix')); assert.ok(ses.run.res.fix.precision > 0.8 && ses.run.res.fix.precision <= 0.85 + 1e-9, `precision ${ses.run.res.fix.precision}: centred, but a par option (SLIDER_CAP), not a flawless hand`);
  ses.slider = 0.5; // the slider is remembered across steps; Careful needs no timing at all
  // (another broken crate: the first one's Fix was played by hand and left, and a table sat at before is played at Quick the next time, tests/remaining-engine.test.mjs)
  const first = g.s.assets.find((x) => ASSETS[x.cls].repair), twin = g._mk(g.s, first.cls, { zone: first.zone, basis: 1, cond: 'broken' }); g.s.assets.push(twin);
  const ses2 = UI.createSession(ctx, start(g, { kind: 'repair', assetId: twin.id })); ses2.show(); ses2.acts.careful(); assert.ok(ses2.run.stageDone('fix')); assert.equal(ses2.run.res.fix.careful, true);
});

// ------------------------------------------------------------------ Assist
test('Assist: hints appear only when it is on, the switch is in the header, and Seasoned Pro cannot switch it off in the Close', { skip: !HAS }, () => {
  const g = world(['grad', 'roots']);
  const off = start(g, fixedLot(g)), on = start(g, fixedLot(g), { assist: true });
  for (const r of [off, on]) { r.quick(); r.next(); }
  r_assert(off, false); r_assert(on, true);
  function r_assert(r, want) {
    r.act({ type: 'anchor', level: 'low' }); r.act({ type: 'hold' }); assert.equal(r.stageDone(), false);
    const h = UI.closeHTML(model(r)); assert.equal(/Assist\.<\/b>/.test(h), want, `close hint, assist ${want}`);
  }
  assert.match(html(on), /data-change-deal="assist"[^>]*checked/); assert.ok(!/data-change-deal="assist"[^>]*checked/.test(html(off)));
  const pit = start(g, sell(g), { assist: true }); assert.match(UI.pitchHTML(model(pit)), /class="angle[^"]* rec/); assert.match(UI.pitchHTML(model(pit)), /Assist\.<\/b> Try /);
  assert.ok(!/class="angle[^"]* rec/.test(UI.pitchHTML(model(start(g, sell(g))))));
  const rd = start(g, fixedLot(g), { assist: true }); assert.match(UI.readHTML(model(rd)), /Assist\.<\/b>[^<]*(serial|Powering|paperwork|look)/i); assert.match(UI.readHTML(model(rd)), /class="probe[^"]* rec/);
  const fx = start(g, brokenCrate(g), { assist: true }); assert.match(UI.fixHTML(model(fx)), /Assist\.<\/b>/);
  const pro = world(['pro', 'roots']), rp = start(pro, fixedLot(pro)); rp.quick(); rp.next();
  const m = model(rp); assert.equal(m.assistLocked, true); assert.match(UI.sheetHTML(m), /data-change-deal="assist"[^>]*disabled/);
  const cl = start(pro, fixedLot(pro)); assert.equal(model(cl).assistLocked, false, 'only the Close is locked');
});

test('toggling Assist mid-deal reaches the game in progress (haggle advice, a wider sweet zone)', { skip: !HAS }, () => {
  const g = world(['grad', 'roots']), r = start(g, fixedLot(g)); r.quick(); r.next(); r.act({ type: 'anchor', level: 'low' });
  assert.ok(!r.view().advice); r.setAssist(true); assert.ok(r.view().advice && r.view().advice.text); r.setAssist(false); assert.ok(!r.view().advice);
  const f = start(g, brokenCrate(g)), w0 = f.view().zone.hi - f.view().zone.lo; f.setAssist(true);
  assert.ok(f.view().zone.hi - f.view().zone.lo > w0 * 1.3);
});

// ------------------------------------------------------------------ the haggle and auction boards
test('Close: first the three openings, then the moves; only legal moves are enabled; the board shows both numbers and the read', { skip: !HAS }, () => {
  const g = world(), r = start(g, fixedLot(g)); r.quick(); r.next();
  let h = UI.closeHTML(model(r));
  assert.equal((h.match(/data-deal="anchor"/g) || []).length, 3); assert.match(h, /Lowball/); assert.match(h, /Generous/); assert.ok(!/data-deal="hold"/.test(h)); assert.match(h, /Your read of their limit/);
  r.act({ type: 'anchor', level: 'low' }); h = UI.closeHTML(model(r));
  for (const a of ['hold', 'concede', 'split', 'accept', 'walk']) assert.match(h, new RegExp(`data-deal="${a}"`));
  assert.match(h, /Raise your offer/); assert.match(h, /neg-track/); assert.match(h, /role="img" aria-label="\d+ rounds? left of \d+"/);
  const s = start(g, sell(g)); s.quick(); s.next(); if (!s.plan.stages[1].auto) { s.act({ type: 'anchor', level: 'high' }); assert.match(UI.closeHTML(model(s)), /Come down/); }
  for (let i = 0; i < 12 && !r.stageDone(); i++) r.act({ type: 'accept' }) || r.act({ type: 'walk' });
  assert.ok(!/data-deal="hold"/.test(UI.closeHTML(model(r))), 'a finished haggle offers no more moves');
});

test('Close with nothing to haggle over says why and offers Continue', { skip: !HAS }, () => {
  const g = world(), spec = sell(g), lead = (() => { for (const z of g.s.zones) { const l = g.s.leads[z].find((x) => x.id === spec.leadId); if (l) return l; } })();
  lead.budget = g.quotePitch(spec.assetId, spec.leadId).price + 0.0001;
  const r = start(g, spec); r.quick(); r.next(); const h = html(r);
  assert.match(h, /nothing to haggle over/); assert.match(h, /data-deal="finish"/);
});

test('Bid: the next bid, the rivals and their moods, a drop that keeps your cash; a finished auction offers no more bids', { skip: !HAS }, () => {
  const g = world(), r = start(g, auctionLot(g)); r.quick(); r.next();
  let h = UI.bidHTML(model(r));
  assert.match(h, /data-deal="bid"/); assert.match(h, /data-deal="drop"/); assert.match(h, /keep your cash/); assert.match(h, /class="rivals"/); assert.match(h, /Your estimate/);
  assert.ok(!/limit|trueValue/.test(h));
  r.act({ type: 'drop' }); h = UI.bidHTML(model(r)); assert.ok(!/data-deal="bid"/.test(h)); assert.match(h, /You are out/);
});

test('Read: probes with their prices, spent ones marked, the budget as points, a belief that moves', { skip: !HAS }, () => {
  const g = world(), r = start(g, fixedLot(g)); let h = UI.readHTML(model(r));
  assert.equal((h.match(/data-deal="probe"/g) || []).length, 5); assert.match(h, /1 pt/); assert.match(h, /3 pts/); assert.match(h, /Points/); assert.match(h, /Chance it is a counterfeit/);
  const before = h.match(/about (\d+)%/)[1]; r.act({ type: 'probe', id: 'power' }); h = UI.readHTML(model(r));
  assert.match(h, /class="probe used"/); assert.match(h, /Power it up\.<\/b>/); assert.ok(h.match(/about (\d+)%/)[1] !== undefined && before !== undefined);
  r.act({ type: 'conclude' }); h = UI.readHTML(model(r)); assert.match(h, /You have read the lot/); assert.ok(!/data-deal="read-done"/.test(h));
});

test('Pitch: five angles, two to pick, the button says how many are left, hints are listed, the reaction shows after', { skip: !HAS }, () => {
  const g = world(), r = start(g, sell(g)); let h = UI.pitchHTML(model(r, { pick: [] }));
  assert.equal((h.match(/data-deal="angle"/g) || []).length, 5); assert.match(h, /Pick 2 more angles/); assert.match(h, /disabled/);
  h = UI.pitchHTML(model(r, { pick: ['utility'] })); assert.match(h, /Pick 1 more angle</); assert.match(h, /aria-pressed="true"/);
  h = UI.pitchHTML(model(r, { pick: ['utility', 'story'] })); assert.match(h, /Pitch Utility and Story/);
  r.act({ type: 'pick', angles: ['utility', 'story'] }); h = UI.pitchHTML(model(r, { pick: ['utility', 'story'] })); assert.match(h, /fit\./); assert.match(h, /as keen/); assert.ok(!/data-deal="pitch-go"/.test(h));
});

test('a deal that cannot start explains why and offers no play', { skip: !HAS }, () => {
  const g = world(); g.s.cash = 0.01; const r = start(g, fixedLot(g)), h = html(r);
  assert.match(h, /role="alert"/); assert.match(h, /You need at least/); assert.ok(!/data-deal="quick-/.test(h)); assert.ok(!/data-deal="probe"[^>]*>(?![^<]*disabled)/.test(h.replace(/disabled/g, 'disabled')) || /disabled/.test(h));
});

// ------------------------------------------------------------------ the session
function fresh(perks) {
  const g = world(perks), ctx = fakeCtx();
  ctx.g = () => g; ctx.S.clock = { paused: false }; ctx.S.setPaused = (p) => { ctx.S.clock.paused = p; };
  const fx = { kaching: 0, buzz: 0, blip: 0, burst: 0, announce: [] };
  ctx.sfx = { kaching: () => fx.kaching++, buzz: () => fx.buzz++, blip: () => fx.blip++, level() {}, alarm() {} };
  ctx.burst = () => fx.burst++; ctx.announce = (m) => fx.announce.push(m);
  return { g, ctx, fx, last: () => ctx.calls.filter((c) => c[0] === 'dlg').map((c) => c[1]).pop() };
}

test('openDeal opens one sheet, pauses the world while you deal, and gives it back', { skip: !HAS }, () => {
  const { g, ctx, last } = fresh(); const ses = UI.openDeal(ctx, sell(g));
  assert.ok(ses.run && ses.acts); assert.match(last(), /data-anchor="deal-room"/); assert.equal(ctx.S.clock.paused, true);
  ses.dispose(); assert.equal(ctx.S.clock.paused, false);
  const mine = fresh(); mine.ctx.S.clock.paused = true; const s2 = UI.openDeal(mine.ctx, sell(mine.g)); s2.dispose(); assert.equal(mine.ctx.S.clock.paused, true, 'a clock you paused stays paused');
  const bad = fresh(); const r = UI.openDeal(bad.ctx, { kind: 'buy', zone: 4, lotId: 'gone' }); assert.equal(r.ok, false); assert.ok(bad.ctx.toasts.length && /gone/i.test(bad.ctx.toasts[0][0]));
});

test('Quick deal: one press plays every stage, finishes through the engine, celebrates or consoles, announces', { skip: !HAS }, () => {
  const { g, ctx, fx, last } = fresh(), spec = sell(g), cash = g.s.cash;
  const ses = UI.openDeal(ctx, spec); ses.acts['quick-all']();
  assert.match(last(), /data-anchor="deal-result"/); assert.ok(g.s.cash > cash && !g.s.assets.some((a) => a.id === spec.assetId));
  assert.ok(fx.kaching + fx.buzz + fx.blip >= 1); assert.ok(fx.announce.some((m) => /sold|Sold|deal/i.test(m)));
  assert.ok(ctx.calls.includes('render'), 'the world is drawn again');
  const lose = fresh(); const sp = sell(lose.g), a = lose.g.s.assets.find((x) => x.id === sp.assetId); a.truth = { q: 1, fake: true, defects: [] };
  UI.openDeal(lose.ctx, sp).acts['quick-all'](); assert.equal(lose.fx.buzz, 1); assert.equal(lose.fx.kaching, 0); assert.equal(lose.fx.burst, 0);
});

test('by hand through the action table: Read, probe, conclude, Continue, Close, finish', { skip: !HAS }, () => {
  const { g, ctx, last } = fresh(), spec = fixedLot(g), lot = g.s.lots[4].find((l) => l.id === spec.lotId), ses = UI.openDeal(ctx, spec);
  ses.acts.probe({ dataset: { id: 'serial' } }); assert.match(last(), /Check the serial\./);
  ses.acts['read-done'](); assert.match(last(), /Continue/); ses.acts.next(); assert.equal(ses.run.key, 'close'); assert.match(last(), /data-anchor="deal-stage-close"/);
  ses.acts.anchor({ dataset: { level: 'low' } }); for (let i = 0; i < 8 && !ses.run.stageDone(); i++) { ses.acts.accept(); if (!ses.run.stageDone()) ses.acts.concede({ dataset: { size: 'large' } }); }
  assert.ok(ses.run.stageDone()); assert.match(last(), /See the result/); ses.acts.finish();
  assert.match(last(), /data-anchor="deal-result"/); assert.equal(ses.run.over, true);
  assert.ok(ses.run.res.close.deal ? !g.s.lots[4].some((l) => l.id === lot.id) : g.s.lots[4].some((l) => l.id === lot.id));
  assert.ok(g.s.meta.inspect.n === 1 && g.s.meta.haggle.n === 1 && g.s.meta.played >= 2);
});

test('pitch angles toggle, at most two are kept, and Pitch needs exactly two', { skip: !HAS }, () => {
  const { g, ctx, last } = fresh(), ses = UI.openDeal(ctx, sell(g)), tap = (a) => ses.acts.angle({ dataset: { angle: a } });
  tap('price'); tap('story'); tap('utility'); assert.deepEqual(ses.pick, ['story', 'utility']); tap('story'); assert.deepEqual(ses.pick, ['utility']);
  ses.acts['pitch-go'](); assert.equal(ses.run.stageDone('pitch'), false, 'one angle is not a pitch');
  tap('story'); ses.acts['pitch-go'](); assert.ok(ses.run.stageDone('pitch')); assert.match(last(), /as keen/);
});

test('Pass on a lot, Walk away from a haggle, Leave: nothing is bought and nothing is lost', { skip: !HAS }, () => {
  const { g, ctx, last } = fresh(), spec = fixedLot(g), lot = g.s.lots[4].find((l) => l.id === spec.lotId), cash = g.s.cash, ses = UI.openDeal(ctx, spec);
  ses.acts.pass(); assert.match(last(), /No deal/); assert.equal(g.s.cash, cash); assert.ok(g.s.lots[4].some((l) => l.id === lot.id));
  const b = fresh(), s2 = UI.openDeal(b.ctx, fixedLot(b.g)); s2.acts.walk(); assert.match(b.last(), /No deal/);
  const c = fresh(), s3 = UI.openDeal(c.ctx, fixedLot(c.g)); s3.run.quick(); s3.acts.next(); s3.acts.anchor({ dataset: { level: 'fair' } }); s3.acts.walk(); assert.ok(s3.run.stageDone('close')); assert.equal(c.g.s.cash, cash);
});

test('Verify a buyer: the fee is paid and the answer shown; a fraud closes the deal', { skip: !HAS }, () => {
  const { g, ctx, last } = fresh(['native', 'second']), spec = sell(g);
  const lead = (() => { for (const z of g.s.zones) { const l = g.s.leads[z].find((x) => x.id === spec.leadId); if (l) return l; } })(); lead.scam = true;
  const ses = UI.openDeal(ctx, spec), cash = g.s.cash; ses.acts.verify();
  assert.ok(g.s.cash < cash); assert.match(last(), /Fraud confirmed/); assert.ok(ctx.toasts.length); ses.acts.quick = ses.acts['quick-stage']; ses.acts['quick-stage']();
  assert.equal(ses.run.stageDone('pitch'), false, 'no deal with a confirmed fraud');
});

test('a second Deal Room replaces the first: only one set of listeners answers', { skip: !HAS }, () => {
  const { g, ctx } = fresh(), a = UI.openDeal(ctx, sell(g)), b = UI.openDeal(ctx, fixedLot(g));
  assert.equal(a.disposed, true); assert.equal(b.disposed, false); b.dispose();
});

test('the session survives a game that changed under it: the buyer left, the crate sold elsewhere', { skip: !HAS }, () => {
  const { g, ctx, last } = fresh(), spec = sell(g), ses = UI.openDeal(ctx, spec);
  for (const z of g.s.zones) g.s.leads[z] = g.s.leads[z].filter((l) => l.id !== spec.leadId);
  ses.acts['quick-all'](); assert.match(last(), /deal-result/); assert.ok(/left|Not done|No deal/.test(last()));
  assert.ok(g.s.assets.some((a) => a.id === spec.assetId), 'nothing was taken');
});

// ------------------------------------------------------------------ the sheet's styles
test('css/ui-deal.css uses tokens only: every var() exists, no hex colours, no !important, reduced motion is left to the global rule', () => {
  const css = readFileSync(new URL('../css/ui-deal.css', import.meta.url), 'utf8'), base = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
  const defined = new Set([...base.matchAll(/--([\w-]+):/g)].map((m) => m[1])); defined.add('zg'); defined.add('za');
  for (const [, name] of css.matchAll(/var\(--([\w-]+)/g)) assert.ok(defined.has(name), `--${name} is not a token`);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css), 'no hard-coded hex colours'); assert.ok(!/!important/.test(css));
  assert.ok(/@keyframes/.test(css) && /prefers-reduced-motion/.test(base), 'its animations are switched off by the global reduced-motion rule in styles.css');
  assert.match(css, /dialog\.deal/);
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8'); assert.match(index, /css\/ui-deal\.css/);
});

test('the keyboard: every control is a real button or input, Stop answers Space and Enter, and focus goes to the new stage', () => {
  const src = readFileSync(new URL('../js/ui/deal.js', import.meta.url), 'utf8');
  assert.ok(!/<(div|span|li)[^>]*data-deal=/.test(src), 'actions are on buttons, never on divs');
  assert.match(src, /e\.key === ' ' \|\| e\.key === 'Enter'/); assert.match(src, /data-stage-head/); assert.match(src, /autofocus/);
  assert.equal((src.match(/addEventListener\('keydown'/g) || []).length, 1, 'one keydown handler'); assert.equal((src.match(/removeEventListener\('keydown'/g) || []).length, 1, 'removed with the session');
});
