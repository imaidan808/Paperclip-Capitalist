// The Deal Room and the Academy have a voice (docs/AUDIO.md 4.2 and 4.3): what the room says on its own, what it leaves to the page's event bus, and what a lesson plays. Node only: the real Deal Room
// session (js/ui/deal.js), the real wiring (js/audio/wire.js) and the real collector (js/audio/resolve.js) run on a real game, with the engine's play, request and dial replaced by a recorder, a
// fake clock for the room's timers, and no browser. The browser half (listening, the dial, the spy counts) is walked in headless Chrome: see the commit message.
// Run: node --test tests/audio-deal.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeGame } from './bot.mjs';
import { fakeCtx } from './helpers/ctx.mjs';
import { ASSETS } from '../js/config.js';
import * as D from '../js/deal.js';
import * as UI from '../js/ui/deal.js';
import * as A from '../js/ui/academy-sandbox.js';
import { audio as page } from '../js/audio/index.js';
import { wireGame, dealCalls, newWireState, _setInstalled } from '../js/audio/wire.js';
import { RECIPES } from '../js/audio/recipes.js';
import { createResolverState, resolveBurst } from '../js/audio/resolve.js';
import { settings as appSettings } from '../js/ui/common.js';

const HAS = !!(D.GAMES.haggle && D.GAMES.auction);
const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

// ------------------------------------------------------------------ the world, as tests/ui-deal.test.mjs builds it
const world = (perks = ['grad', 'native'], seed = 9) => {
  const g = makeGame(perks, 'ops', seed);
  for (const z of [2, 3, 4, 6]) g._openZone(z);
  g.s.cash = 1e6; g.s.skills.growth = 4; g.s.skills.fintech = 3;
  for (const z of g.s.zones) for (const cls of Object.keys(ASSETS).filter((c) => (ASSETS[c].dem?.[z] || 0) >= 4).slice(0, 4)) g.s.assets.push(g._mk(g.s, cls, { zone: z, basis: 1 }));
  for (const z of g.s.zones) for (let k = 0; k < 4; k++) g._spawnLot(z);
  return g;
};
const sells = (g) => { const out = []; for (const z of g.s.zones) for (const lead of g.s.leads[z]) for (const a of g.s.assets.filter((x) => x.zone === z)) { const q = g.quotePitch(a.id, lead.id); if (q.ok && q.fit >= 0.15 && !q.rejected) out.push({ kind: 'sell', assetId: a.id, leadId: lead.id }); } return out; };
const sellWithHaggle = (g) => sells(g).find((s) => { const r = D.startRun(g, s); return r.ok !== false && !r.plan.capped && !r.plan.blocker && r.stages.some((x) => x.key === 'close' && !x.auto); });
const fixedLot = (g, z = 4) => ({ kind: 'buy', zone: z, lotId: g.s.lots[z].find((l) => l.mode === 'fixed').id });
const auctionLot = (g, z = 6) => { if (!g.s.lots[z].some((l) => l.mode === 'auction')) for (let i = 0; i < 20; i++) g._spawnLot(z); return { kind: 'buy', zone: z, lotId: g.s.lots[z].find((l) => l.mode === 'auction').id }; };
const brokenCrate = (g) => { const a = g.s.assets.find((x) => ASSETS[x.cls].repair); a.cond = 'broken'; return { kind: 'repair', assetId: a.id }; };

// ------------------------------------------------------------------ the rig: a real room, the real wiring, a recorder for the engine and a fake clock for the room's timers
function rig({ perks, seed, reduced = false } = {}) {
  const g = world(perks, seed), ctx = fakeCtx();
  ctx.g = () => g; ctx.S.clock = { paused: false, speed: 1, now: () => g.s.hour }; ctx.S.setPaused = (p) => { ctx.S.clock.paused = p; };
  ctx.dlg.el.querySelector = () => null; // the room's DOM half is not drawn here, but a slider move looks for its marker
  const listeners = new Set();
  ctx.on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  ctx.emit = (ev) => { for (const fn of [...listeners]) fn(ev); };
  g.onEvent = (ev) => ctx.emit(ev); // what the shell does: the engine's events go to everything that listens
  ctx.reduced = () => reduced;
  const real = { set: globalThis.setTimeout, clear: globalThis.clearTimeout }, q = [];
  let now = 0, id = 0;
  globalThis.setTimeout = (fn, ms = 0) => { const h = ++id; q.push({ h, at: now + ms, fn }); return h; };
  globalThis.clearTimeout = (h) => { const i = q.findIndex((t) => t.h === h); if (i >= 0) q.splice(i, 1); };
  const log = [], dial = [], was = { play: page.play, request: page.request, countUp: page.countUp, dial: page.dial };
  page.play = (i, o) => { log.push({ via: 'play', id: i, o: o || {}, at: now }); return null; };
  page.request = (i, o) => { log.push({ via: 'request', id: i, o: o || {}, at: now }); return true; };
  page.countUp = (xp) => { log.push({ via: 'countUp', id: 'ui.count-up', o: { xp }, at: now }); return null; };
  page.dial = { start: () => { dial.push(['start']); return true; }, update: (p, lo, hi) => dial.push(['update', p, lo, hi]), stop: () => dial.push(['stop']), get active() { return false; } };
  const unwire = wireGame(ctx);
  const R = {
    g, ctx, log, dial, from: 0,
    advance(ms) { const end = now + ms; for (;;) { q.sort((a, b) => a.at - b.at); const t = q[0]; if (!t || t.at > end) break; q.shift(); now = t.at; t.fn(); } now = end; },
    pending: () => q.length,
    /** The calls made since the last time this was asked, as 'via:id/variant'. */
    names() { const out = log.slice(R.from).map((e) => `${e.via}:${e.id}${e.o.variant ? '/' + e.o.variant : ''}`); R.from = log.length; return out; },
    since() { const out = log.slice(R.from); R.from = log.length; return out; },
    open(spec) { const s = UI.openDeal(ctx, spec); assert.ok(s.acts, JSON.stringify(s)); R.ses = s; return s; },
    end() { unwire(); _setInstalled(false); Object.assign(page, was); globalThis.setTimeout = real.set; globalThis.clearTimeout = real.clear; },
  };
  return R;
}
/** Runs a test body on a rig and always puts the engine, the timers and the settings back. */
async function withRig(opts, fn) {
  const R = rig(opts), keep = JSON.stringify(appSettings.audio);
  try { await fn(R); } finally { if (process.env.AUDIO_DEAL_LOG) console.log(R.log.map((e) => `${String(e.at).padStart(5)} ms  ${e.via}:${e.id}${e.o.variant ? '/' + e.o.variant : ''}${e.o.pan ? ' pan ' + e.o.pan : ''}${e.o.lp ? ' hollow' : ''}`).join('\n') + '\n'); R.ses?.dispose?.(); R.end(); appSettings.audio = JSON.parse(keep); }
}
const tap = (R, act, data = {}) => R.ses.acts[act]({ dataset: data });
/** The calls of a burst the collector would have resolved, as the ids that would sound (the first is the sentence that leads). */
const resolved = (calls) => {
  const reqs = calls.filter((e) => e.via === 'request').map((e) => ({ id: e.id, opts: e.o, meta: e.o.meta || {}, at: 0 }));
  const out = resolveBurst(createResolverState(), reqs, { speed: 1, durOf: (i) => (RECIPES[i]?.dur || 0) * 1000 }, 1e6);
  return out.plays.map((p) => p.mix[0][0]);
};

// ------------------------------------------------------------------ the markup says which buttons have a voice of their own
const OWN = ['quick-stage', 'quick-all', 'probe', 'verify', 'angle', 'anchor', 'hold', 'concede', 'split', 'leverage', 'accept', 'bid', 'drop', 'stop', 'careful', 'sound'];
const PAGE_TICK = ['next', 'finish', 'read-done', 'pitch-go', 'pass'];
const model = (run, extra = {}) => ({ ...D.modelOf(run, { reduced: !!extra.reduced }), pick: extra.pick || [], slider: extra.slider ?? 0.2, sound: extra.sound, tone: !!extra.tone });
const buttons = (html) => [...html.matchAll(/<button\b([^>]*)>/g)].map((m) => m[1]);

test('the buttons that play their own sound carry data-snd, so the page adds no tick under them; every other button keeps the page\'s tick', { skip: !HAS }, () => {
  const g = world(), seen = new Set();
  const visit = (r) => {
    for (let guard = 0; guard < 12; guard++) {
      const h = UI.sheetHTML(model(r));
      for (const attrs of buttons(h)) {
        const act = (attrs.match(/data-deal="([^"]+)"/) || [])[1], own = /\bdata-snd\b/.test(attrs);
        if (act) { seen.add(act); if (OWN.includes(act)) assert.ok(own, `${act} plays its own sound and says so`); if (PAGE_TICK.includes(act)) assert.ok(!own, `${act} keeps the page's tick`); }
        if (/\bdata-close\b/.test(attrs)) assert.ok(own, 'Leave, Close and Continue are heard as the dialog closing, not as a tick under it');
      }
      if (!r.stageDone()) r.quick();
      if (!r.next()) break;
    }
    r.finish();
    for (const attrs of buttons(UI.sheetHTML(model(r)))) if (/\bdata-close\b/.test(attrs)) assert.match(attrs, /data-snd/);
  };
  visit(D.startRun(g, sellWithHaggle(g))); visit(D.startRun(g, fixedLot(g))); visit(D.startRun(g, auctionLot(g))); visit(D.startRun(g, brokenCrate(g)));
  // the moves of a haggle and the controls of a bid and a repair (which Quick skips past) are checked on the stage's own markup
  const r = D.startRun(g, fixedLot(g)); r.quick(); r.next(); const open = UI.closeHTML(model(r));
  for (const attrs of buttons(open)) { const act = (attrs.match(/data-deal="([^"]+)"/) || [])[1]; if (act === 'anchor') assert.match(attrs, /data-snd/); if (act === 'walk') assert.ok(!/data-snd/.test(attrs), 'before the first number, Walk away is the card (the page\'s tick, then the stamp)'); }
  r.act({ type: 'anchor', level: 'fair' });
  for (const attrs of buttons(UI.closeHTML(model(r)))) { const act = (attrs.match(/data-deal="([^"]+)"/) || [])[1]; if (['hold', 'concede', 'split', 'accept', 'walk'].includes(act)) { seen.add(act); assert.match(attrs, /data-snd/, act); } }
  for (const act of ['probe', 'quick-stage', 'quick-all', 'stop', 'careful', 'bid', 'drop', 'hold', 'concede', 'accept', 'angle', 'anchor']) assert.ok(seen.has(act), `${act} was checked`);
});

test('the room carries a Sound switch: a labelled toggle that says whether sound is on, in the header beside Leave', { skip: !HAS }, () => {
  const g = world(), r = D.startRun(g, fixedLot(g));
  const on = UI.sheetHTML(model(r, { sound: true })), off = UI.sheetHTML(model(r, { sound: false }));
  assert.match(on, /<button class="btn ghost sm" data-deal="sound" data-snd data-fid="deal-sound" aria-pressed="true" aria-label="Sound">/); assert.match(off, /aria-pressed="false" aria-label="Sound"/);
  assert.match(on, /Sound on/); assert.match(off, /Sound off/);
  assert.ok(on.indexOf('deal-sound') < on.indexOf('data-fid="leave"'), 'before Leave, after Assist');
  assert.match(UI.sheetHTML(model(r)), /aria-pressed="true"/, 'a model that does not know is on');
  const fix = D.startRun(g, brokenCrate(g));
  assert.match(UI.fixHTML(model(fix, { reduced: true, tone: true })), /<input id="dial-in" type="range" class="snd"/, 'with the repair tone on the slider\'s own detents are silent');
  assert.ok(!/class="snd"/.test(UI.fixHTML(model(fix, { reduced: true }))));
});

// ------------------------------------------------------------------ a sale by hand
test('selling by hand: the shop door, five angles, the buyer\'s answer, the haggle and its stance, the handshake, and a card that does not talk over the sale', { skip: !HAS }, async () => {
  await withRig({}, async (R) => {
    const spec = sellWithHaggle(R.g); assert.ok(spec, 'the world has a haggle to play');
    const ses = R.open(spec); await Promise.resolve();
    assert.deepEqual(R.names(), ['play:deal.open/sell'], 'the room opens with the shop door of a buyer (the page\'s own deal.open is a sell and would have been dropped by the cooldown)');
    tap(R, 'angle', { angle: 'utility' }); tap(R, 'angle', { angle: 'story' }); tap(R, 'angle', { angle: 'price' }); tap(R, 'angle', { angle: 'price' });
    assert.deepEqual(R.names(), ['play:pitch.angle/utility', 'play:pitch.angle/story', 'play:pitch.angle/price', 'play:pitch.angle/drop'], 'each angle has its voice, a third pick takes the first off, and putting one back falls');
    tap(R, 'angle', { angle: 'price' }); R.names();
    ses.acts['pitch-go'](); R.advance(400);
    const fit = ses.run.view().outcome.fitDelta, got = R.names();
    assert.deepEqual(got, [fit >= 0.05 ? 'request:pitch.fit/up' : fit <= -0.03 ? 'request:pitch.fit/down' : 'request:deal.stage-done'], `the buyer's answer is the fit the callout prints (${fit}), and a stage done only when the fit is silent`);
    ses.acts.next(); assert.deepEqual(R.names(), [], 'Continue is the page\'s tick, nothing more');
    // the haggle: every move has one sound, the stance follows a beat later and only when it changed, the end is one handshake or one door
    let tell = null, moves = 0, ended = false;
    for (let i = 0; i < 9 && !ended; i++) {
      const before = ses.run.view(), act = i === 0 ? null : i === 8 ? 'accept' : ['accept', 'hold', 'concede', 'split'][i % 4 === 0 ? 1 : i % 4 === 1 ? 2 : i % 4 === 2 ? 3 : 0];
      if (!act) tap(R, 'anchor', { level: 'high' }); // Aim high: the first number pulls the talk, and the talk takes rounds
      if (act) tap(R, act, { size: 'medium' });
      const calls = R.since(); R.advance(600); const later = R.since();
      const all = [...calls, ...later], after = ses.run.view(), plays = all.filter((e) => e.via === 'play'), told = all.filter((e) => e.id === 'haggle.tell');
      assert.equal(plays.length, 1, `one move, one sound (${act || 'anchor'}): ${plays.map((p) => p.id)}`);
      if (ses.run.stageDone()) {
        ended = true; assert.equal(plays[0].id, 'haggle.close'); assert.equal(plays[0].o.variant, ses.run.res.close.deal ? 'accept' : 'walk', 'a deal is a handshake, no deal is a door');
        assert.deepEqual(told, [], 'no stance after the end'); assert.ok(!all.some((e) => e.id === 'deal.stage-done'), 'the handshake is the end of the stage');
      } else {
        if (after.tell !== before.tell) { assert.equal(told.length, 1); assert.equal(told[0].o.variant, after.tell, 'the stance is the one the screen words'); assert.equal(told[0].at - calls[0].at, UI.SOUND.TELL_AT, 'a beat after the move'); } else assert.deepEqual(told, []);
        if (act === 'concede' && after.tell !== before.tell) assert.deepEqual(plays[0].o, { variant: 'small' }, 'a concession is one tap when the stance answers it');
        moves++; tell = after.tell;
      }
    }
    assert.ok(ended && moves >= 1 && tell, 'the haggle was played to its end');
    ses.acts.finish();
    const burst = R.since(), reqs = burst.map((e) => e.id);
    assert.ok(reqs.indexOf('deal.result') > 0 && reqs.at(-1) === 'deal.result', `the engine speaks first, the card last: ${reqs}`);
    const lead = resolved(burst);
    if (reqs.some((i) => i.startsWith('sale.'))) assert.ok(lead[0].startsWith('sale.') && !lead.includes('deal.result'), `a sale outranks the card: ${lead}`);
    else assert.equal(lead[0], 'deal.result');
  });
});

test('Verify this buyer: the answer the player paid for is a check mark or a warning, and a refusal is the toast\'s', { skip: !HAS }, async () => {
  await withRig({ perks: ['native', 'second'] }, async (R) => {
    const spec = sells(R.g).find((s) => D.startRun(R.g, s).plan?.canVerify); assert.ok(spec, 'a buyer to verify');
    const lead = (() => { for (const z of R.g.s.zones) { const l = R.g.s.leads[z].find((x) => x.id === spec.leadId); if (l) return l; } })();
    for (const scam of [false, true]) {
      lead.scam = scam; lead.verified = false;
      const ses = R.open(spec); await Promise.resolve(); R.names();
      ses.acts.verify();
      assert.deepEqual(R.names(), [`play:deal.verify/${scam ? 'bad' : 'ok'}`]); ses.dispose();
    }
    R.g.s.cash = 0; lead.verified = false; const poor = R.open(spec); R.names(); poor.acts.verify(); assert.deepEqual(R.names().filter((n) => n.startsWith('play:deal.verify')), [], 'a verify that was refused plays no verdict');
  });
});

// ------------------------------------------------------------------ a purchase by hand
test('buying by hand: each probe has its own sound, a probe that finds nothing is hollow, a problem found warns once, the meter\'s warning is the same cue, and the stage ends in a glass pair', { skip: !HAS }, async () => {
  await withRig({}, async (R) => {
    const g = R.g, clean = fixedLot(g), dirty = { kind: 'buy', zone: 4, lotId: g.s.lots[4].filter((l) => l.mode === 'fixed')[1].id };
    g.s.lots[4].find((l) => l.id === clean.lotId).truth = { q: 0.95, fake: false, defects: [] };
    g.s.lots[4].find((l) => l.id === dirty.lotId).truth = { q: 0.7, fake: true, defects: ['d0', 'd1', 'd2'].map((id) => ({ id, label: 'flaw ' + id })) };
    // a clean lot: nothing is spotted, so each probe is the same sound, rounder and a little quieter
    let ses = R.open(clean); await Promise.resolve(); assert.deepEqual(R.names(), ['play:deal.open/buy']);
    const probed = [];
    for (const id of ['look', 'serial', 'power', 'papers']) {
      if (!ses.run.view().probes.find((x) => x.id === id).affordable) continue; // the points are scarce: a probe that cannot be paid for is not pressed
      tap(R, 'probe', { id }); R.advance(400);
      const ev = ses.run.view().evidence.at(-1), calls = R.since(), p = calls.find((e) => e.id === 'read.probe');
      probed.push(p.o.variant);
      assert.equal(!!p.o.lp, ev.found.length === 0, `${id}: hollow exactly when the evidence line names no problem`);
      if (ev.found.length === 0) { assert.deepEqual({ lp: p.o.lp, gainDb: p.o.gainDb }, UI.SOUND.HOLLOW); assert.equal(p.o.variant, id); }
      if (ses.run.stageDone()) { assert.ok(calls.some((e) => e.id === 'deal.stage-done'), 'the last probe the points could buy ends the stage: the glass pair, a third of a second after it'); break; }
    }
    assert.ok(probed.length >= 2 && new Set(probed).size === probed.length, `a distinct sound for each way of checking: ${probed}`);
    tap(R, 'probe', { id: probed[0] }); assert.deepEqual(R.since().map((e) => e.id), ['ui.refuse'], 'a probe already paid for is a short no');
    ses.dispose();
    const third = g.s.lots[4].filter((l) => l.mode === 'fixed')[2]; third.truth = { q: 0.95, fake: false, defects: [] };
    const early = R.open({ kind: 'buy', zone: 4, lotId: third.id }); await Promise.resolve(); R.names(); tap(R, 'probe', { id: 'look' }); R.names();
    early.acts['read-done'](); R.advance(400);
    assert.deepEqual(R.names(), ['request:deal.stage-done'], 'Done reading: the glass pair of a stage done (a click\'s tick is the page\'s)');
    early.dispose();
    // a lot with problems in it: the expert spots them, the warning comes after the probe has been heard, once per lot
    ses = R.open(dirty); await Promise.resolve(); R.names();
    tap(R, 'probe', { id: 'expert' }); R.advance(10);
    const first = R.since(); assert.deepEqual(first.map((e) => `${e.via}:${e.id}`), ['play:read.probe'], 'the probe is heard first');
    assert.equal(first[0].o.lp, undefined, 'it found something: the bright sound');
    assert.ok(ses.run.view().evidence.at(-1).found.length > 0);
    R.advance(UI.SOUND.PROBE_MS);
    const warn = R.since(); assert.deepEqual(warn.map((e) => `${e.via}:${e.id}`), ['request:read.suspect'], 'then the warning pair, a third of a second after');
    tap(R, 'probe', { id: 'power' }); R.advance(600);
    assert.deepEqual(R.since().map((e) => e.id).filter((i) => i === 'read.suspect'), [], 'once per lot, whatever the next probe finds');
  });
});

test('the counterfeit meter is the only thing that raises a suspicion of a fake: a lot that is a fake and shows nothing is as quiet as one that is not', { skip: !HAS }, async () => {
  const warned = async (fake) => withRigResult(async (R) => {
    const lot = R.g.s.lots[4].find((l) => l.mode === 'fixed'); lot.truth = { q: 0.9, fake, defects: [] };
    const ses = R.open({ kind: 'buy', zone: 4, lotId: lot.id }); await Promise.resolve(); R.names();
    // the same readings in both worlds: the probe is fed the same view, so the sound is a function of the view alone
    const out = UI.soundsFor('read', { type: 'probe', id: 'serial' }, { b: { belief: { fakeProb: 0.2 }, evidence: [] }, a: { belief: { fakeProb: 0.3 }, evidence: [{ id: 'serial', found: [] }] }, r: { ok: true }, lot: lot.id });
    ses.dispose(); return out;
  });
  assert.deepEqual(await warned(true), await warned(false));
  const meter = UI.soundsFor('read', { type: 'probe', id: 'serial' }, { b: { belief: { fakeProb: 0.5 }, evidence: [] }, a: { belief: { fakeProb: 0.7 }, evidence: [{ id: 'serial', found: [] }] }, r: { ok: true }, lot: 7 });
  assert.deepEqual(meter.map((s) => (s.hear ? s.hear[0] : s.say[0])), ['read.probe', 'suspect'], 'the meter crossing 60% upward is the cue');
  assert.deepEqual(UI.soundsFor('read', { type: 'probe', id: 'serial' }, { b: { belief: { fakeProb: 0.7 }, evidence: [] }, a: { belief: { fakeProb: 0.9 }, evidence: [{ id: 'serial', found: [] }] }, r: { ok: true } }).map((s) => (s.hear ? s.hear[0] : s.say[0])), ['read.probe'], 'already above 60%: no second cue');
});
async function withRigResult(fn) { let out; await withRig({}, async (R) => { out = await fn(R); }); return out; }

// ------------------------------------------------------------------ an auction by hand
test('bidding: the paddle climbs a note a raise, the room answers one rival at a time on its own side, and the gavel is last', { skip: !HAS }, async () => {
  await withRig({}, async (R) => {
    const ses = R.open(auctionLot(R.g)); await Promise.resolve(); R.names();
    ses.run.quick(); ses.acts.next(); assert.equal(ses.run.key, 'bid');
    let sold = false, raises = 0;
    for (let i = 0; i < 14 && !sold; i++) {
      const n0 = ses.run.st.bid.events.length, round = ses.run.view().round;
      tap(R, 'bid'); const mine = R.since(); R.advance(2000); const room = R.since();
      const fresh = ses.run.st.bid.events.slice(n0).filter((e) => e.who !== 'You' && ['bid', 'jump', 'drop'].includes(e.kind)).slice(-3);
      assert.deepEqual(mine.map((e) => e.id), ['bid.raise'], 'the raise is heard at the click');
      assert.deepEqual(mine[0].o.params, { n: Math.min(4, round) }, 'a note higher each raise, up to the fifth');
      const rivals = room.filter((e) => e.id === 'bid.rival');
      assert.equal(rivals.length, fresh.length, 'one sound for each of the last three things the rivals did');
      rivals.forEach((e, k) => { assert.equal(e.o.variant, fresh[k].kind === 'drop' ? 'out' : 'in'); assert.ok(Math.abs(e.o.pan) === 0.5); if (k) assert.equal(e.at - rivals[k - 1].at, UI.SOUND.RIVAL_GAP, 'one at a time'); assert.ok(e.at >= UI.SOUND.RIVAL_AT); });
      const hammer = room.filter((e) => e.id === 'bid.hammer'); sold = ses.run.stageDone();
      assert.equal(hammer.length, sold ? 1 : 0, 'the gavel falls once, when the log says sold');
      if (sold) { assert.equal(hammer[0].o.variant, ses.run.res.bid.won ? 'won' : 'lost'); assert.ok(hammer[0].at > (rivals.at(-1) || { at: 0 }).at, 'after the last rival'); assert.ok(!room.some((e) => e.id === 'deal.stage-done')); }
      raises++;
    }
    assert.ok(raises >= 1);
    if (!sold) { const n0 = ses.run.st.bid.events.length; tap(R, 'drop'); const d = R.since(); R.advance(3000); const rest = R.since(); assert.equal(d[0].id, 'bid.drop'); assert.equal(rest.filter((e) => e.id === 'bid.hammer').length, 1); assert.equal(rest.find((e) => e.id === 'bid.hammer').o.variant, 'lost'); assert.ok(ses.run.st.bid.events.length > n0); }
  });
});

test('a room that closes with sounds still to come plays none of them', { skip: !HAS }, async () => {
  await withRig({}, async (R) => {
    const ses = R.open(auctionLot(R.g)); await Promise.resolve(); ses.run.quick(); ses.acts.next();
    tap(R, 'bid'); R.names();
    assert.ok(R.pending() >= 0); ses.dispose(); const left = R.pending(); R.advance(5000);
    assert.equal(left, 0, 'the room\'s timers go with it'); assert.deepEqual(R.names(), []);
    // and a count-up that is still waiting
    const again = R.open(fixedLot(R.g)); again.run.quickAll(); again.acts.finish(); again.dispose(); R.advance(5000); assert.ok(!R.since().some((e) => e.id === 'ui.count-up'));
  });
});

// ------------------------------------------------------------------ a repair by hand
test('repair: a stop rings as clean as it was, Careful is an ok, and no stage-done after the third stop', { skip: !HAS }, async () => {
  await withRig({}, async (R) => {
    const ses = R.open(brokenCrate(R.g)); await Promise.resolve();
    assert.deepEqual(R.names(), ['play:deal.open/fix'], 'the bench');
    const tiers = [];
    for (let i = 0; i < 3; i++) {
      ses.t0 = 0; ses.acts.stop();
      const calls = R.since(), last = ses.run.st.fix.steps.at(-1).acc;
      assert.deepEqual(calls.map((e) => e.id), ['repair.stop'], 'one hit, whatever the step');
      assert.equal(calls[0].o.variant, UI.stopTier(last), `${(last * 100).toFixed(0)}% precise`);
      tiers.push(calls[0].o.variant);
    }
    assert.ok(ses.run.stageDone('fix') && tiers.length === 3);
    ses.acts.finish();
    const burst = R.since(), ids = burst.map((e) => e.id);
    assert.ok(ids.includes('repair.done') && ids.at(-1) === 'deal.result', ids.join(' '));
    assert.equal(burst.find((e) => e.id === 'repair.done').o.variant, ses.run.res.fix.precision >= 0.8 ? 'great' : ses.run.res.fix.precision >= 0.4 ? 'ok' : 'rough', 'the work done speaks for the precision');
    assert.equal(resolved(burst)[0], 'repair.done', 'and the card does not talk over it');
    ses.dispose();
    const first = R.g.s.assets.find((x) => ASSETS[x.cls].repair), twin = R.g._mk(R.g.s, first.cls, { zone: first.zone, basis: 1, cond: 'broken' }); R.g.s.assets.push(twin);
    const c = R.open({ kind: 'repair', assetId: twin.id }); await Promise.resolve(); R.names(); c.acts.careful();
    assert.deepEqual(R.names(), ['play:repair.stop/ok'], 'by the book: three steps at 50% are an ok');
  });
});

test('the stops are the four of the map by the thresholds of the map, and a miss is a miss', () => {
  assert.deepEqual([1, 0.9, 0.89, 0.65, 0.64, 0.5, 0.01, 0, -1, NaN, undefined].map(UI.stopTier), ['perfect', 'perfect', 'good', 'good', 'ok', 'ok', 'ok', 'miss', 'miss', 'miss', 'miss']);
});

test('the repair tone follows the marker only when its note or the green zone changes: ten notes, never a call a frame', () => {
  let st = null, calls = 0;
  for (let t = 0; t < 4000; t += 16) { const p = 0.5 + 0.45 * Math.sin(t / 700), n = UI.toneStep(st, p, 0.4, 0.6); if (n) { st = n; calls++; } }
  assert.ok(calls <= 40, `250 frames, ${calls} calls`); assert.equal(UI.toneStep(st, st.pos, 0.4, 0.6), null, 'the same place says nothing');
  assert.equal(UI.toneStep({ note: 5, zone: false, pos: 0.5 }, 0.5, 0.4, 0.6).zone, true, 'entering the green zone is a change');
  assert.deepEqual(UI.toneStep(null, 2, 0.4, 0.6), { note: 10, zone: false, pos: 1 }); assert.equal(UI.toneStep(null, NaN, 0.4, 0.6).note, 0, 'junk is the left end');
});

test('under reduced motion nothing follows the dial; the opt-in tone follows the slider while it moves and lets go half a second later; with the setting off there is none', { skip: !HAS }, async () => {
  await withRig({ reduced: true }, async (R) => {
    const ses = R.open(brokenCrate(R.g)); await Promise.resolve(); R.names();
    const b = { value: '60', setAttribute() {} }, move = (v) => { b.value = String(v); ses.inputs.slider(b); };
    appSettings.audio = { ...appSettings.audio, dial: false }; move(40); R.advance(1000);
    assert.deepEqual(R.dial, [], 'the tone is off by default, and the slider is the page\'s own detents');
    appSettings.audio = { ...appSettings.audio, dial: true, mute: false, quiet: false };
    move(40); move(45); move(45); move(70);
    assert.deepEqual(R.dial.map((d) => d[0]), ['start', 'update', 'update', 'update'], 'one tone, a note word per change of note (45 twice is one)');
    assert.equal(R.dial.at(-1)[1], 0.7);
    R.advance(499); assert.equal(R.dial.at(-1)[0], 'update'); R.advance(2); assert.equal(R.dial.at(-1)[0], 'stop', 'half a second after the last move');
    // the stop on the slider is the same stop as the dial\'s
    ses.slider = 0.5; ses.acts.stop(); const hit = R.since().filter((e) => e.id === 'repair.stop'); assert.equal(hit.length, 1); assert.ok(['good', 'ok'].includes(hit[0].o.variant), 'the slider is a par option: never a perfect');
    appSettings.audio = { ...appSettings.audio, mute: true }; R.dial.length = 0; move(30); assert.deepEqual(R.dial, [], 'muted: no tone');
  });
});

// ------------------------------------------------------------------ Quick
test('Quick: one sound for the stage, one for the whole deal, no shop door under it, no stage-done after it', { skip: !HAS }, async () => {
  await withRig({}, async (R) => {
    let ses = R.open(fixedLot(R.g)); await Promise.resolve(); R.names();
    ses.acts['quick-stage'](); R.advance(500);
    assert.deepEqual(R.names(), ['play:deal.quick'], 'Quick on a stage: its own sound, and no stage-done for the stage it finished');
    ses.acts.next(); ses.acts['quick-stage'](); R.advance(500); assert.deepEqual(R.names(), ['play:deal.quick']);
    ses.acts.finish(); const out = R.since(); assert.ok(out.at(-1).id === 'deal.result'); ses.dispose();
    // Quick buy from the Market: the sheet opens and plays the whole deal in the same task, so the room never says hello
    ses = R.open(fixedLot(R.g, 4)); ses.acts['quick-all'](); await Promise.resolve(); R.advance(500);
    const seen = R.since(), ids = seen.map((e) => e.id);
    assert.equal(ids[0], 'deal.quick'); assert.ok(!ids.includes('deal.open'), `no shop door: ${ids}`); assert.ok(!ids.includes('deal.stage-done')); assert.equal(ids.filter((i) => i === 'deal.result').length, 1);
    assert.ok(ids.indexOf('deal.quick') < ids.indexOf('deal.result'));
    ses.acts.finish?.call; ses.dispose();
    // after a Quick deal the next deal's stages are heard again (the wiring forgets Quick at the result card)
    ses = R.open(sellWithHaggle(R.g) || fixedLot(R.g)); await Promise.resolve(); R.names();
    if (ses.run.key === 'read') { tap(R, 'probe', { id: 'look' }); R.names(); ses.acts['read-done'](); R.advance(500); assert.deepEqual(R.names(), ['request:deal.stage-done']); }
  });
});

test('Pass on a lot and Walk away before the first number: the card is the sound, an info stamp, and nobody is punished', { skip: !HAS }, async () => {
  await withRig({}, async (R) => {
    const ses = R.open(fixedLot(R.g)); await Promise.resolve(); R.names();
    ses.acts.pass(); const out = R.since();
    assert.deepEqual(out.map((e) => `${e.via}:${e.id}/${e.o.variant}`), ['request:deal.result/info']);
  });
});

// ------------------------------------------------------------------ the result card
test('the stamp against Quick has the rule of the card and a quiet answer: a chime for better, a nudge for worse, nothing for the same, never a chime on a bad card', { skip: !HAS }, () => {
  assert.equal(UI.verdictOf(null), null); assert.equal(UI.verdictOf({ you: null, quick: 5 }), null); assert.equal(UI.verdictOf({ you: 5, quick: null }), null);
  assert.equal(UI.verdictOf({ better: 'high', you: 130, quick: 100, expert: 140 }), 'win'); assert.equal(UI.verdictOf({ better: 'high', you: 90, quick: 100, expert: 140 }), 'lose'); assert.equal(UI.verdictOf({ better: 'high', you: 100.1, quick: 100, expert: 140 }), 'even');
  assert.equal(UI.verdictOf({ better: 'low', you: 80, quick: 100, expert: 70 }), 'win', 'a lower price is the better one when buying'); assert.equal(UI.verdictOf({ better: 'low', you: 120, quick: 100, expert: 70 }), 'lose');
  const at = (v) => UI.soundsFor('result', { type: 'result' }, { summary: { tone: 'good', xp: 5, numbers: { better: 'high', quick: 100, expert: 150, you: v } } });
  assert.deepEqual(at(130).map((s) => (s.hear ? s.hear[0] : s.say[0])), ['result', 'ui.ok']); assert.equal(at(130)[1].at, UI.SOUND.VERDICT_AT, 'after the sale and the count');
  assert.deepEqual(at(80).map((s) => (s.hear ? s.hear[0] : s.say[0])), ['result', 'ui.nudge']); assert.deepEqual(at(100).map((s) => (s.hear ? s.hear[0] : s.say[0])), ['result']);
  const bad = UI.soundsFor('result', { type: 'result' }, { summary: { tone: 'bad', xp: 0, numbers: { better: 'low', quick: 100, you: 50 } } }); assert.deepEqual(bad.map((s) => (s.hear ? s.hear[0] : s.say[0])), ['result'], 'a counterfeit bought below Quick\'s price is still a bad card: no chime');
  assert.deepEqual(UI.soundsFor('result', { type: 'result' }, { summary: { tone: 'good', quick: true, numbers: { better: 'high', quick: 100, you: 130 } } }).length, 1, 'Quick played it: it cannot beat itself');
  // and it is the card's own stamp: every kind of deal, played well and badly, agrees with the words on the card
  const g = world(), seen = new Set();
  const card = (html) => (html.match(/class="rver (win|lose|even)"/) || [])[1] || null;
  const finish = (r, hand) => { if (!r || r.ok === false) return; for (let k = 0; k < 8 && !r.over; k++) { if (!r.stageDone()) hand(r); if (!r.next()) break; } r.finish(); const h = UI.resultHTML({ ...D.modelOf(r), pick: [], slider: 0.2 }); assert.equal(UI.verdictOf(r.summary.numbers), card(h)); seen.add(card(h)); };
  for (let i = 0; i < 4; i++) {
    const hands = [(r) => r.quick(), (r) => { if (r.key === 'read') { r.act({ type: 'probe', id: 'serial' }); r.act({ type: 'conclude' }); } else if (r.key === 'pitch') r.act({ type: 'pick', angles: ['price', 'story'] }); else if (r.key === 'close') { r.act({ type: 'anchor', level: i % 2 ? 'low' : 'high' }); for (let k = 0; k < 6 && !r.stageDone(); k++) r.act({ type: 'concede', size: 'large' }) || r.act({ type: 'accept' }); } else if (r.key === 'bid') { r.act({ type: 'drop' }); } else r.act({ type: 'careful' }); }];
    for (const hand of hands) { const w = world(['grad', 'native'], 9 + i), s = sellWithHaggle(w), c = brokenCrate(w); finish(s && D.startRun(w, s), hand); finish(D.startRun(w, fixedLot(w)), hand); finish(D.startRun(w, c), hand); void g; }
  }
  if (process.env.AUDIO_DEAL_LOG) console.log('stamps seen:', [...seen]);
  assert.ok(seen.size >= 2, `the stamp was checked on ${[...seen]}`);
});

test('the card\'s numbers count up for 25 XP or more, a quarter second after the card is drawn, and are never counted when nothing counts', () => {
  assert.deepEqual(UI.soundsFor('result', { type: 'count' }, { xp: 60 }), [{ at: UI.SOUND.COUNT_AT, say: ['count', { xp: 60 }] }]);
  const st = newWireState(); assert.deepEqual(dealCalls({ what: 'count', xp: 60 }, st), [['countUp', null, 60]]);
  assert.equal(UI.soundsFor('result', { type: 'result' }, { summary: { tone: 'good', xp: 30 } })[0].say[1].tone, 'good');
  assert.deepEqual(UI.soundsFor('result', { type: 'result' }, { summary: { tone: 'good', xp: 30 } }), [{ at: 0, say: ['result', { tone: 'good', xp: 30 }] }]);
});

test('every move the room makes names a sound that exists, in a variant that exists', { skip: !HAS }, () => {
  const views = (extra = {}) => ({ b: { tell: null, round: 0, belief: { fakeProb: 0.1 }, evidence: [] }, a: { tell: 'near', round: 1, outcome: { fitDelta: 0.1 }, belief: { fakeProb: 0.8 }, evidence: [{ id: 'serial', found: ['x'] }], rivals: [{ name: 'Marla' }, { name: 'Dev' }] }, r: { ok: true }, res: { deal: true }, acc: 0.7, scam: true, ...extra });
  const moves = [['read', { type: 'probe', id: 'serial' }], ['read', { type: 'conclude' }], ['pitch', { type: 'pick' }], ['pitch', { type: 'angle', angle: 'story' }, { on: true }], ['pitch', { type: 'angle', angle: 'story' }, { on: false }], ['pitch', { type: 'verify' }],
    ['close', { type: 'anchor', level: 'high' }], ['close', { type: 'hold' }], ['close', { type: 'concede', size: 'medium' }], ['close', { type: 'concede', size: 'large' }], ['close', { type: 'split' }], ['close', { type: 'leverage' }], ['close', { type: 'accept' }, { r: { ok: true, done: true } }], ['close', { type: 'walk' }, { r: { ok: true, done: true }, res: { deal: false } }],
    ['bid', { type: 'bid' }, { fresh: [{ kind: 'bid', who: 'Marla', price: 5 }, { kind: 'drop', who: 'Dev', price: 5 }, { kind: 'sold', who: 'You', price: 5 }] }], ['bid', { type: 'drop' }], ['fix', { type: 'stop' }], ['fix', { type: 'careful' }], ['pitch', { type: 'quick-stage' }], ['read', { type: 'quick-all' }], ['result', { type: 'result' }, { summary: { tone: 'bad', xp: 0 } }], ['result', { type: 'count' }, { xp: 80 }], ['close', { type: 'hold' }, { r: { ok: false } }]];
  const ids = new Set();
  for (const [key, action, extra] of moves) for (const s of UI.soundsFor(key, action, views(extra))) if (s.hear) {
    const [id, o] = s.hear; ids.add(id); assert.ok(RECIPES[id], `${key}/${action.type}: ${id} is a sound`);
    if (o.variant) assert.ok(RECIPES[id].variants[o.variant], `${id}#${o.variant}`); assert.ok(Number.isFinite(s.at), 'every sound has a time');
  } else { assert.ok(s.say && typeof s.say[0] === 'string'); }
  for (const id of ['read.probe', 'pitch.angle', 'haggle.anchor', 'haggle.move', 'haggle.leverage', 'haggle.close', 'bid.raise', 'bid.drop', 'repair.stop', 'deal.verify', 'deal.quick', 'ui.refuse']) assert.ok(ids.has(id), `${id} is played by the room`);
  for (const v of ['look', 'serial', 'power', 'papers', 'expert']) assert.ok(RECIPES['read.probe'].variants[v]);
  for (const v of ['prestige', 'utility', 'scarcity', 'price', 'story', 'drop']) assert.ok(RECIPES['pitch.angle'].variants[v]);
  for (const v of UI.openVariant('sell') + UI.openVariant('buy') + UI.openVariant('repair') ? ['sell', 'buy', 'fix'] : []) assert.ok(RECIPES['deal.open'].variants[v]);
  assert.deepEqual(['sell', 'buy', 'repair'].map(UI.openVariant), ['sell', 'buy', 'fix']);
});

test('a refused move is a short no, never the sound of the move', () => {
  assert.deepEqual(UI.soundsFor('close', { type: 'hold' }, { r: { ok: false } }), [{ at: 0, hear: ['ui.refuse', {}] }]);
  assert.deepEqual(UI.soundsFor('read', { type: 'probe', id: 'look' }, { r: { ok: false } }), [{ at: 0, hear: ['ui.refuse', {}] }]);
  assert.deepEqual(UI.soundsFor('pitch', { type: 'verify' }, { r: { ok: false } }), [], 'a refused verify has its warn toast');
});

test('the room\'s sounds are chosen from what the screen shows: the sound section reads no hidden field', () => {
  const text = src('js/ui/deal.js'), from = text.indexOf('// ------------------------------------------------------------------ sound (docs/AUDIO.md 4.2 and 4.3)'), to = text.indexOf('// ------------------------------------------------------------------ the DOM half');
  assert.ok(from > 0 && to > from, 'the sound section is marked');
  const code = text.slice(from, to).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\/\/ .*$/, '')).join('\n');
  const HIDDEN = [/\btruth\b/, /\bcounterfeit\b/, /\breveal\b/, /\bsurplus\b/, /\blimit\b/, /\bcaught\b/, /\btrueValue\b/, /\bsecret\b/, /\.fake\b/, /\bfake\b/, /\breserve\b/, /\bscore\b/];
  for (const re of HIDDEN) assert.ok(!re.test(code), `the sound section must not mention ${re}`);
  assert.equal((code.match(/\bscam\b/g) || []).length, 1, 'scam appears once: the verdict of the Verify the player paid for');
  assert.match(code, /case 'verify': .*o\.scam/);
  // and the DOM half reads the screen\'s view and the run\'s answers, never a plan\'s truth
  const half = text.slice(to);
  assert.ok(!/\.truth\b|lotTruth|\.secret\(|trueValue|\.reveal\b/.test(half.slice(half.indexOf('const look ='), half.indexOf('const lastAcc =') + 200)), 'look() reads the view');
  // the three legacy calls of the card stay (no-ops while the wiring is installed, the old tones when it is not)
  assert.equal((half.match(/ctx\.sfx\?\.(kaching|buzz|blip)\?\.\(\)/g) || []).length, 3);
});

test('every room sound comes out of an act or a plan: the DOM half has no sound call the plan does not own', () => {
  const half = src('js/ui/deal.js').slice(src('js/ui/deal.js').indexOf('// ------------------------------------------------------------------ the DOM half'));
  const direct = half.match(/\beng\(\)\.play\(|\bone\(\{ hear/g) || [];
  assert.equal(direct.length, 3, 'the plan\'s player, the opening voice and the switch\'s own tone');
  assert.match(half, /const plan = \(key, action, o\) => \{ try \{ play\(soundsFor\(key, action, o\)\); \} catch/, 'one guarded place chooses and plays: a fault in choosing a sound is the sound\'s, never the deal\'s');
  assert.ok(!/[^a-z]play\(soundsFor\(/.test(half.replace(/const plan = .*\n/, '')), 'every move goes through it');
  assert.ok(!/sfx\.play|audio\.request/.test(half), 'the cause sounds go over the bus, not around it');
});

// ------------------------------------------------------------------ sound is never worth a broken deal
test('a sound card that throws, a listener that throws and a context with no audio at all never break a deal', { skip: !HAS }, async () => {
  for (const make of [() => ({ play() { throw new Error('no sound card'); }, on() { throw new Error('no events'); }, dial: { start() { throw new Error('x'); }, update() { throw new Error('x'); }, stop() { throw new Error('x'); } } }), () => null, () => ({})]) {
    await withRig({}, async (R) => {
      R.ctx.audio = make(); R.ctx.emit = () => { throw new Error('a listener fell over'); };
      const spec = sellWithHaggle(R.g), ses = R.open(spec); await Promise.resolve();
      tap(R, 'angle', { angle: 'utility' }); tap(R, 'angle', { angle: 'story' }); ses.acts['pitch-go'](); assert.ok(ses.run.stageDone('pitch'), 'the pitch went through');
      ses.acts.next(); tap(R, 'anchor', { level: 'high' }); R.advance(1000); ses.acts.sound(); ses.acts.sound(); ses.acts['quick-stage']();
      ses.acts.finish(); assert.equal(ses.run.over, true, 'the deal ended, and its card is the engine\'s own'); assert.ok(ses.run.summary);
      const rep = R.open(brokenCrate(R.g)); await Promise.resolve(); R.advance(10); rep.slider = 0.5; rep.acts.stop(); rep.inputs.slider({ value: '50', setAttribute() {} }); rep.dispose();
    });
  }
});

// ------------------------------------------------------------------ the Sound switch
test('the room\'s Sound switch mutes and unmutes the page, says so, and the first thing it plays unmuted is a rising toggle', { skip: !HAS }, async () => {
  await withRig({}, async (R) => {
    const ses = R.open(fixedLot(R.g)); await Promise.resolve(); R.names(); const said = [];
    R.ctx.announce = (m) => said.push(m);
    appSettings.audio = { ...appSettings.audio, mute: false };
    assert.equal(ses.sound(), true);
    ses.acts.sound(); assert.equal(appSettings.audio.mute, true); assert.equal(ses.sound(), false); assert.equal(appSettings.audio.touched, true); assert.deepEqual(said.at(-1), 'Sound off.'); assert.deepEqual(R.names(), []);
    ses.acts.sound(); assert.equal(appSettings.audio.mute, false); assert.equal(said.at(-1), 'Sound on.'); assert.deepEqual(R.names(), ['play:ui.toggle/on']);
  });
});

// ------------------------------------------------------------------ the order of things in one macrotask
test('what the room says goes over the bus in an order the collector can use: the engine\'s consequences first, then the card', { skip: !HAS }, async () => {
  await withRig({}, async (R) => {
    const spec = fixedLot(R.g), ses = R.open(spec); await Promise.resolve(); R.names();
    ses.acts['quick-all']();
    const calls = R.since(), reqs = calls.filter((e) => e.via === 'request').map((e) => e.id);
    assert.equal(calls[0].id, 'deal.quick'); assert.equal(reqs.at(-1), 'deal.result');
    const lead = resolved(calls); assert.ok(lead.length >= 1 && lead.length <= 2);
    if (reqs.includes('buy.lot')) assert.equal(lead[0], 'buy.lot', 'the purchase, not the card');
  });
});

// ------------------------------------------------------------------ the Academy
test('the Academy: every moment of a lesson has its sound, the sounds exist, and a wrong answer is soft', () => {
  const all = ['start', 'step', 'win', 'page', 'right', 'wrong', 'reveal', 'hint', 'stranded', 'reward', 'count'];
  const data = { step: { i: 3 }, reward: { first: true, graduate: false, newCodex: 2 }, count: { xp: 50 } };
  for (const what of all) {
    const calls = A.academySounds(what, data[what] || {});
    assert.ok(calls.length >= 1, what);
    for (const [id, o] of calls) { if (id === 'countUp') { assert.equal(o.xp, 50); continue; } assert.ok(RECIPES[id], `${what}: ${id}`); if (o.variant) assert.ok(RECIPES[id].variants[o.variant], `${what}: ${id}#${o.variant}`); }
  }
  assert.deepEqual(A.academySounds('right'), [['acad.teach', { variant: 'right', delay: 0.08 }]]); assert.equal(A.academySounds('wrong')[0][1].variant, 'wrong');
  assert.ok(!A.academySounds('wrong').some(([id]) => id === 'ui.refuse'), 'a wrong answer is not a refusal');
  assert.equal(A.academySounds('hint')[0][0], 'ui.nudge'); assert.equal(A.academySounds('stranded')[0][0], 'ui.refuse');
  assert.deepEqual(A.academySounds('page'), [['ui.dialog-open', {}]]); assert.equal(A.academySounds('page', { late: true })[0][1].delay, 0.18, 'a sheet that follows a closed window waits a beat, so the two papers are not one smear');
  assert.deepEqual(A.academySounds('nonsense'), []);
});

test('the Academy\'s steps climb the scale, the goal comes a beat after the action that reached it, and the reward is by what the lesson was', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map((i) => A.academySounds('step', { i })[0][1].params.i), [0, 1, 2, 3, 4, 5, 5], 'the nth step is the nth note, to the sixth');
  assert.equal(A.academySounds('step', { i: 0 })[0][1].variant, 's0'); assert.equal(A.academySounds('step', { i: 4 })[0][1].variant, 's5');
  assert.equal(A.academySounds('step', { i: NaN })[0][1].params.i, 0);
  assert.ok(A.academySounds('win')[0][1].delay >= 0.3, 'the sale or purchase that won it is heard first');
  assert.deepEqual(A.academySounds('reward', { first: true, graduate: false, newCodex: 0 }).map(([id]) => id), ['acad.win']);
  assert.deepEqual(A.academySounds('reward', { first: true, graduate: false, newCodex: 2 }).map(([id]) => id), ['acad.win', 'codex.unlock'], 'a Codex page that is new is a beat after the fanfare');
  assert.deepEqual(A.academySounds('reward', { first: true, graduate: true, newCodex: 2 }).map(([id]) => id), ['acad.graduate'], 'the last lesson is the graduation, and nothing else sounds over it');
  assert.deepEqual(A.academySounds('reward', { first: false, graduate: true, newCodex: 2 }).map(([id]) => id), ['ui.dialog-open'], 'a replay pays nothing and only turns the page');
  assert.equal(A.academySounds('reward', { first: true }).length, 1);
  assert.deepEqual(A.academySounds('count', { xp: 0 }), []); assert.deepEqual(A.academySounds('count', { xp: 80 }), [['countUp', { xp: 80 }]]);
});

test('academy.js plays through academySounds only, at the moments of the lesson, and no longer through the old tones', () => {
  const text = src('js/ui/academy.js');
  const whats = [...text.matchAll(/\bhear\('([a-z]+)'/g)].map((m) => m[1]);
  for (const w of new Set(whats)) assert.ok(A.academySounds(w, { first: true, xp: 10, i: 1 }).length >= 1, `hear('${w}') is a moment academySounds knows`);
  for (const w of ['start', 'step', 'win', 'page', 'right', 'wrong', 'reveal', 'hint', 'stranded', 'reward', 'count']) assert.ok(whats.includes(w) || text.includes(`'${w}'`) || text.includes(`? 'right' : 'wrong'`), `${w} is played somewhere`);
  assert.ok(!/\bsfx\./.test(text), 'the five old tones are not called from the lesson player any more');
  assert.match(text, /hear\(r\.result\.correct \? 'right' : 'wrong'\)/); assert.match(text, /if \(!r\.won\) hear\('step'/);
  assert.match(text, /hear\('start'\);\s*\/\/[^\n]*\n\s*stepChanged\(\);/, 'the first card is heard once, before the first step is drawn');
  assert.match(text, /return counted;/);
  // a wrong pick is heard a beat after the click\'s tick, and the reward\'s fanfare and Codex accent are one call
  assert.equal((text.match(/hear\('reward'/g) || []).length, 1);
});

test('the Academy\'s buttons are not marked data-snd: the page\'s tick is their press, and the lesson\'s sounds come a beat after it', () => {
  const text = src('js/ui/academy.js');
  assert.ok(!/data-snd/.test(text), 'the sheets are outside the dialog: the page\'s tick plays, and acad.* follows it by 80 ms');
});

// ------------------------------------------------------------------ the old tones
test('the room still calls the three old tones of its card (no-ops while the wiring is installed), and a page without the wiring hears them as before', { skip: !HAS }, async () => {
  const seen = { kaching: 0, buzz: 0, blip: 0 };
  await withRig({}, async (R) => {
    R.ctx.sfx = { kaching: () => seen.kaching++, buzz: () => seen.buzz++, blip: () => seen.blip++, level() {}, alarm() {} };
    const ses = R.open(fixedLot(R.g)); ses.acts['quick-all'](); ses.dispose();
  });
  assert.ok(seen.kaching + seen.buzz + seen.blip >= 1);
});
