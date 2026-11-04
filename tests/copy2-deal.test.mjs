// Copy pass, part 2, package P1: the Deal Room and the skill games. The words of the stages, the result and the games keep to what the engine does, and they keep the voice of docs/COPY.md.
//   D1  the stages print no lede and stay short; what a choice turns on is printed, what a card is (a probe, an angle) and what a figure means is said on hover and again in a fold for a keyboard and a finger, and every figure and claim they make is held against the engine below
//   D2  the Read stage: the probe blurbs (cheap, best test for a counterfeit, sharpest read, second opinion, the expert) and the bar's range are what the engine does; a reading is printed once; the seller's opening says nothing about the lot
//   D3  the Pitch stage: the keenness a pitch can earn, an unbacked claim (and what Assist says of it), an urgent need told in words, the buyer's lean said once, the fee to verify a buyer
//   D4  the Close stage: the read of their limit, the words for their stance, what a friendly counterparty returns, the one use of the other option, the budget that leaves nothing to haggle over
//   D5  the Bid stage: the limit on a bid (one word for it, with Assist or without), what a rival's mood means, how sure an estimate is
//   D6  the Fix stage: the bill, the 60% the Assist adds to the zone, the dial tone's offer
//   D7  the result: one notation for a multiplier, headlines that do not repeat the sheet's title, one worth per card (auction lessons, wrecks), the reveal's flaw count and condition, what a blank row says, the figures and lessons the result prints
//   D8  the voice: no filler, no question and no exclamation in what the game says (a buyer's own lines are the character's)
//   D9  the refusals the engine owns (a fraud you verified, a full yard) are said in the engine's words, once
//   D10 the Assist box says a move and its reason, adds at most 35 words to a stage, and tells nothing the stage prints
// Run: node --test tests/copy2-deal.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeGame } from './bot.mjs';
import { ASSETS, BUYERS } from '../js/config.js';
import { CODEX } from '../js/meta/codex.js';
import { FAKE_VALUE, fitOf } from '../js/market.js';
import * as D from '../js/deal.js';
import * as UI from '../js/ui/deal.js';
import * as H from '../js/play/haggle.js';
import * as A from '../js/play/auction.js';
import * as I from '../js/play/inspect.js';
import * as P from '../js/play/pitch.js';
import * as R from '../js/play/repair.js';
import { dialInfo, dialEarText, dialShortText, dialAnnounceText, dialSwitchHTML, toggleDial } from '../js/audio/dialtone.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const world = (perks = ['grad', 'native'], seed = 9) => {
  const g = makeGame(perks, 'ops', seed);
  for (const z of [2, 3, 4, 6]) g._openZone(z);
  g.s.cash = 1e6; g.s.skills.growth = 4; g.s.skills.fintech = 3;
  for (const z of g.s.zones) for (const cls of Object.keys(ASSETS).filter((c) => (ASSETS[c].dem?.[z] || 0) >= 4).slice(0, 4)) g.s.assets.push(g._mk(g.s, cls, { zone: z, basis: 1 }));
  for (const z of g.s.zones) for (let k = 0; k < 4; k++) g._spawnLot(z);
  return g;
};
const leadOf = (g, id) => { for (const z of g.s.zones) { const l = g.s.leads[z].find((x) => x.id === id); if (l) return l; } return null; };
const sellSpec = (g) => { for (const z of g.s.zones) for (const lead of g.s.leads[z]) for (const a of g.s.assets.filter((x) => x.zone === z)) { const q = g.quotePitch(a.id, lead.id); if (q.ok && q.fit >= 0.15 && !q.rejected && !D.startRun(g, { kind: 'sell', assetId: a.id, leadId: lead.id }).plan?.capped) return { kind: 'sell', assetId: a.id, leadId: lead.id }; } };
const fixedLot = (g, z = 4) => ({ kind: 'buy', zone: z, lotId: g.s.lots[z].find((l) => l.mode === 'fixed').id });
const auctionLot = (g, z = 6) => { if (!g.s.lots[z].some((l) => l.mode === 'auction')) for (let i = 0; i < 20; i++) g._spawnLot(z); return { kind: 'buy', zone: z, lotId: g.s.lots[z].find((l) => l.mode === 'auction').id }; };
const brokenCrate = (g) => { const a = g.s.assets.find((x) => ASSETS[x.cls].repair); a.cond = 'broken'; return { kind: 'repair', assetId: a.id }; };
const SPECS = { sell: sellSpec, buy: fixedLot, auction: auctionLot, repair: brokenCrate };
const start = (g, spec, opts) => { const r = D.startRun(g, spec, opts); assert.ok(r.ok, r.msg); return r; };
const model = (run, extra = {}) => ({ ...D.modelOf(run, { reduced: !!extra.reduced }), pick: extra.pick || [], slider: 0.2, ...(extra.dialInfo ? { dialInfo: extra.dialInfo } : {}) });
const sheet = (run, extra) => UI.sheetHTML(model(run, extra));
const PANEL = { read: UI.readHTML, pitch: UI.pitchHTML, close: UI.closeHTML, bid: UI.bidHTML, fix: UI.fixHTML, result: UI.resultHTML };
const panel = (run, extra) => { const m = model(run, extra); return PANEL[m.stage](m); };

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
/** What a player reads without doing anything: a fold shows its summary, a hover (title) shows nothing, a screen-reader-only span is not on the page. */
const visible = (h) => h.replace(/<details[^>]*>([\s\S]*?)<\/details>/g, (m, inner) => ` ${(inner.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) || [, ''])[1]} `).replace(/<span class="sr"[^>]*>[\s\S]*?<\/span>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[#\w]+;/g, (e) => ENT[e] ?? ' ').replace(/\s+/g, ' ').trim();
const words = (h) => { const t = visible(h); return t ? t.split(' ').length : 0; };
const titles = (h) => [...h.matchAll(/ title="([^"]*)"/g)].map((m) => m[1].replace(/&[#\w]+;/g, (e) => ENT[e] ?? e));
const money = (x) => { const v = Math.abs(x); return `${x < 0 ? '-' : ''}$${v < 100 ? v.toFixed(2) : Math.round(v).toLocaleString('en-US')}`; };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const escQ = (t) => t.replace(/'/g, '&#39;');
const bidView = (o = {}) => ({ estimate: 100, opening: 60, price: 130, nextBid: 140, budget: 135, high: 'Marla', youHigh: false, rivals: [], events: [], actions: [{ type: 'drop' }], done: false, increment: 10, round: 3, yourTurn: true, ...o });

// =====================================================================================================================================================
// D1: no lede, short stages, and the old sentences are gone from every state of every deal
// =====================================================================================================================================================
const OLD_LEDES = ['Every probe is a noisy look', 'Points are scarce', 'Spend a few probes', 'Lead with the two angles', 'Choose the two angles', 'Agree a price with', 'Haggle with the', 'Raise or drop out', 'Never bid past', 'Rivals bid with their own estimates', 'Three steps. Better work', 'Stop the marker inside', 'All three steps are done',
  'Whatever you could not check', 'Continue when you are ready', 'it could be off', 'All you can do is drop', 'Prefer to listen', 'Prefer not to time it', 'They are looking for', 'Backed barely', 'Backed somewhat', 'Backed strongly', 'rushed ones cost twice'];

test('D1: no stage opens on a lede, none of the old ledes is anywhere in the room, and each stage is short before anything is pressed', () => {
  const seen = new Set(), all = [];
  for (const kind of Object.keys(SPECS)) {
    const g = world(), run = start(g, SPECS[kind](g));
    for (let guard = 0; guard < 8; guard++) {
      const h = sheet(run); seen.add(run.key); all.push([`${kind}/${run.key}`, h]);
      if (!run.stageDone()) run.quick();
      all.push([`${kind}/${run.key}/done`, sheet(run)]);
      if (!run.next()) break;
    }
    run.finish(); seen.add(run.key); all.push([`${kind}/result`, sheet(run)]);
  }
  for (const k of ['read', 'pitch', 'close', 'bid', 'fix', 'result']) assert.ok(seen.has(k), `${k} was drawn`);
  for (const [label, h] of all) { assert.ok(!/class="lede"/.test(h), `${label}: no lede`); for (const old of OLD_LEDES) assert.ok(!h.includes(old), `${label}: "${old}" is gone`); }
  // the words a stage prints before anything is pressed (a fold and a hover are not counted). Before this pass the room printed 129, 126, 69, 69 and 104.
  const g = world(), at = (spec, n = 0) => { const r = start(g, spec); for (let i = 0; i < n; i++) { r.quick(); r.next(); } return r; };
  for (const [key, r, max] of [['read', at(fixedLot(g)), 90], ['pitch', at(sellSpec(g)), 75], ['close', at(fixedLot(g, 3), 1), 52], ['bid', at(auctionLot(g), 1), 55], ['fix', at(brokenCrate(g)), 80]]) {
    assert.equal(r.key, key); const n = words(panel(r)); assert.ok(n <= max, `${key}: ${n} words before a press (at most ${max})`);
  }
});

test('D1: what a choice turns on is printed and the detail is on hover: the five probes, the five angles, the range, the other option, the fee to verify', () => {
  const g = world(), buy = start(g, fixedLot(g)), sale = start(g, sellSpec(g));
  const read = panel(buy);
  for (const id of Object.keys(I.PROBES)) assert.ok(new RegExp(`data-id="${id}"[^>]* title="[^"]+"`).test(read), `probe ${id} carries its blurb on hover`);
  assert.equal((read.match(/class="pwh"/g) || []).length, 0, 'and none prints it');
  assert.ok(titles(read).includes('The bar spans the likely range. The true condition is inside it about two times in three.'), 'the range of the belief bar says what it means');
  const pitch = panel(sale);
  for (const a of ['prestige', 'utility', 'scarcity', 'price', 'story']) assert.ok(new RegExp(`data-angle="${a}"[^>]* title="[^"]+"`).test(pitch), `angle ${a} carries its blurb on hover`);
  assert.equal((pitch.match(/class="(awh|atag)"/g) || []).length, 0, 'and none prints it, or a "Backed" tag over the bar');
  assert.ok(!/Backed (barely|somewhat|strongly)/.test(visible(pitch)), 'the bar speaks for the backing');
  assert.equal((pitch.match(/role="img" aria-label="Your goods back this up: (barely|somewhat|strongly)"/g) || []).length, 5, 'and is still named for a screen reader');
  assert.ok(visible(pitch).includes('Bars show how well your goods back each angle. A claim they cannot back counts against you.'), 'what the bars mean, and the rule a pitch turns on, are printed');
  assert.ok(!titles(pitch).some((t) => /back this claim/.test(t)), 'once: the bars carry no second telling on hover');
  buy.quick(); buy.next(); const close = panel(buy);
  assert.ok(titles(close).includes('Their limit is inside this range. Growth narrows it.'), 'the read of their limit');
  assert.ok(visible(close).includes('Your opening offer. The first number pulls the whole talk toward it.'), 'the opening number is printed at round 0 (the Assist box no longer says it)');
  // the other option is drawn only when a second lot of the same kind sits on the shelf and the talk is still open: build exactly that, and say so before asserting
  const g2 = world(), lot = g2.s.lots[4].find((l) => l.mode === 'fixed');
  g2.s.lots[4] = g2.s.lots[4].filter((l) => l.id === lot.id || l.cls !== lot.cls); g2.s.lots[4].push({ ...lot, id: 'Ttwin', price: lot.price * 1.15 });
  const b = start(g2, { kind: 'buy', zone: 4, lotId: lot.id }); assert.ok(b.plan.alt != null, 'the lot has an alternative on the shelf');
  b.quick(); b.next(); b.act({ type: 'anchor', level: 'low' }); assert.ok(!b.stageDone(), 'the talk is still open after the opening offer');
  const after = panel(b); assert.match(after, /data-deal="leverage"/); assert.ok(!/data-deal="leverage"[^>]* title=/.test(after), 'the other option says its rule on the button, not on hover');
  assert.match(visible(after), /Mention your other option .*Once\. Counts only if it beats their offer\./, 'the other option');
});

// A hover is a mouse's way to a detail: a title is not shown to a keyboard or to a finger, and on a span, a div or a p a screen reader may not say it. What a choice turns on is printed (D2, D3, D4 and D5 hold those lines),
// and the words of every hover that says what a card or a bar is are also in a fold: only its summary is on the page until it is asked for.
test('D1: the hover words are not on hover alone: a fold for the probes and the bar, one for the angles, one for the moods', () => {
  const g = world(), buy = start(g, fixedLot(g)), sale = start(g, sellSpec(g));
  const fold = (h) => { const m = /<details class="deal-more"[^>]*><summary[^>]*>([^<]*)<\/summary>([\s\S]*?)<\/details>/.exec(h); return m ? { summary: m[1], body: visible(m[2]) } : null; };
  const tip = (h, attr, id) => h.match(new RegExp(`${attr}="${id}"[^>]* title="([^"]*)"`))[1];
  const read = panel(buy), f1 = fold(read);
  assert.equal(f1.summary, 'What the probes and the bar mean');
  for (const id of Object.keys(I.PROBES)) assert.ok(f1.body.includes(tip(read, 'data-id', id)), `the fold says what ${id} is for, in the words of its hover`);
  assert.ok(f1.body.includes('The true condition is inside it about two times in three.'), 'and what the bar holds');
  const pitch = panel(sale), f2 = fold(pitch);
  assert.equal(f2.summary, 'What the angles mean');
  for (const a of ['prestige', 'utility', 'scarcity', 'price', 'story']) assert.ok(f2.body.includes(tip(pitch, 'data-angle', a)), `the fold says what ${a} is, in the words of its hover`);
  assert.ok(!f2.body.includes('counts against you') && visible(pitch).includes('A claim they cannot back counts against you.'), 'the rule for the bars is printed once, under the cards, and not again in the fold');
  const rivals = ['steady', 'loud', 'quiet'].map((m, id) => ({ id, name: `R${id}`, mood: m, active: true, droppedAt: null, high: false }));
  const bid = (o) => UI.bidHTML({ plan: { lot: { price: 100, mode: 'auction' } }, view: bidView(o), stageDone: false }), f3 = fold(bid({ rivals }));
  assert.equal(f3.summary, 'What the estimate and the moods mean');
  for (const t of ['Patient. Raises one step at a time.', 'Aggressive or bluffing. You cannot tell which until it folds.', 'Waits, then bids late.']) assert.ok(f3.body.includes(t), t);
  assert.ok(f3.body.includes('Your estimate. Rivals bid on estimates of their own, and the highest guess usually wins. Yours is a guess too, sharper with Capital Sourcing and a good read.'), 'and the estimate, in the words of its hover: the caveat a bid turns on is not on hover alone');
  assert.equal(fold(bid({ rivals: [rivals[0], rivals[0]] })).body.split('Patient.').length - 1, 1, 'a mood is listed once however many rivals have it');
  const f4 = fold(bid({ rivals: [] })); assert.equal(f4.summary, 'What the estimate means'); assert.ok(f4.body.startsWith('Your estimate.') && !f4.body.includes('Patient.'), 'no rivals, only the estimate in the fold');
  const m1 = model(buy); m1.stageDone = true; assert.equal(fold(UI.readHTML(m1)), null, 'a Read that is done has no key to its probes');
  const m2 = model(sale); m2.stageDone = true; assert.equal(fold(UI.pitchHTML(m2)), null, 'and a Pitch that is done none to its angles');
  assert.equal(UI.bidHTML({ plan: { lot: { price: 100, mode: 'auction' } }, view: bidView({ rivals }), stageDone: true, res: { won: false } }).includes('What the estimate'), false, 'nor a Bid that is over');
});

// =====================================================================================================================================================
// D2: the Read stage
// =====================================================================================================================================================
const lots = (n, o = {}) => Array.from({ length: n }, (_, i) => ({ q: (o.lo ?? 0.7) + ((o.hi ?? 1.15) - (o.lo ?? 0.7)) * ((i * 0.6180339887) % 1), i }));
const oneProbe = (id, q, fake, accuracy, seed) => I.act(I.create({ truth: { quality: q, fake, defects: [] }, budget: 5, accuracy, seed, prior: { quality: 0.925, sd: 0.13, fake: 0.2 } }), { type: 'probe', id }).state;

test('D2: the probe blurbs are what the engine does: a look is cheap and finds flaws, the serial is the best test for a counterfeit, power the sharpest read, papers a second opinion on both, the expert needs no skill and costs the most', () => {
  const P_ = I.PROBES, ids = Object.keys(P_), cheap = Math.min(...ids.map((i) => P_[i].cost));
  assert.equal(P_.look.cost, cheap, 'a look is the cheapest');
  assert.ok(P_.look.def > P_.serial.def && P_.look.def > P_.papers.def, 'and of the cheap ones it finds the most flaws');
  assert.equal(P_.papers.cost, cheap, 'papers are cheap too');
  assert.equal(P_.expert.cost, Math.max(...ids.map((i) => P_[i].cost)), 'the expert costs the most');
  assert.deepEqual(ids.filter((i) => P_[i].fixed), ['expert'], 'and is the one probe that ignores your own accuracy');
  const N = 2000, truths = lots(N);
  for (const accuracy of [0.52, 0.95]) { // Ops 1 (0.45 + 0.07) and the best a founder reaches
    const sep = {}, rms = {};
    for (const id of ids) {
      sep[id] = mean(truths.map((t) => I.view(oneProbe(id, t.q, true, accuracy, t.i + 1)).belief.fakeProb)) - mean(truths.map((t) => I.view(oneProbe(id, t.q, false, accuracy, t.i + 1)).belief.fakeProb));
      rms[id] = Math.sqrt(mean(truths.map((t) => (I.view(oneProbe(id, t.q, false, accuracy, t.i + 1)).evidence[0].reading - t.q) ** 2)));
    }
    for (const id of ids) if (id !== 'serial') assert.ok(sep.serial > sep[id], `accuracy ${accuracy}: the serial (${sep.serial.toFixed(3)}) tells a counterfeit apart better than ${id} (${sep[id].toFixed(3)})`);
    for (const id of ids) if (id !== 'power') assert.ok(rms.power < rms[id], `accuracy ${accuracy}: power (${rms.power.toFixed(3)}) reads condition more sharply than ${id} (${rms[id].toFixed(3)})`);
    assert.ok(sep.papers > sep.look && rms.papers < rms.serial, `accuracy ${accuracy}: papers beat a look on counterfeits and the serial on condition: a second opinion on both`);
    assert.ok(Math.abs(rms.expert - P_.expert.q) < 0.006, `accuracy ${accuracy}: the expert reads as sharply as ever (${rms.expert.toFixed(3)})`);
  }
  const g = world(), h = panel(start(g, fixedLot(g))), tip = (id) => h.match(new RegExp(`data-id="${id}"[^>]* title="([^"]*)"`))[1];
  assert.equal(tip('look'), 'Cheap. Catches obvious wear.'); assert.equal(tip('serial'), 'The best test for a counterfeit.'); assert.equal(tip('power'), 'The sharpest read on condition.');
  assert.equal(tip('papers'), 'A cheap second opinion on both.'); assert.equal(tip('expert'), 'Costly, but needs no skill of yours.');
  assert.ok(visible(h).includes('The expert needs no skill of yours.'), 'the one probe that ignores your skill says so on the sheet, while it can still be hired');
  const used = start(g, fixedLot(g)); used.act({ type: 'probe', id: 'expert' }); assert.ok(!visible(panel(used)).includes('The expert needs no skill of yours.'), 'and not after it has been');
});

test('D2: the bar around "about 93%" holds the true condition about two times in three, with or without probes', () => {
  const cells = [];
  for (const [accuracy, probes] of [[0.52, []], [0.52, ['look', 'power']], [0.8, ['serial', 'power', 'papers']], [0.95, ['look']], [0.7, ['expert']], [0.6, ['power']]]) {
    const truths = lots(1200);
    let hit = 0;
    for (const t of truths) {
      let s = I.create({ truth: { quality: t.q, fake: false, defects: [] }, budget: 20, accuracy, seed: t.i + 1, prior: { quality: 0.925, sd: 0.13, fake: 0.05 } });
      for (const id of probes) s = I.act(s, { type: 'probe', id }).state;
      const v = I.view(s); if (Math.abs(v.belief.quality - t.q) <= v.doubt + 1e-9) hit++;
    }
    cells.push(hit / truths.length);
  }
  for (const c of cells) assert.ok(c > 0.5 && c < 0.78, `a bar holds the truth ${c.toFixed(2)} of the time`);
  assert.ok(Math.abs(mean(cells) - 2 / 3) < 0.05, `on average ${mean(cells).toFixed(3)}, about two in three`);
});

test('D2: a reading is printed once (the evidence list), the bubble stays the seller\'s, and the seller\'s opening says nothing about the lot', () => {
  const g = world(), run = start(g, fixedLot(g));
  run.act({ type: 'probe', id: 'serial' }); run.act({ type: 'probe', id: 'power' });
  const h = sheet(run);
  for (const e of run.view().evidence) assert.equal(h.split(escQ(e.text)).length - 1, 1, `"${e.text.slice(0, 40)}..." is printed once`);
  assert.ok(h.includes(escQ(run.plan.cast.hello)), 'the bubble is the seller\'s');
  assert.ok(!/class="deal-log"/.test(h), 'and a Read has no talk log that would print the readings again');
  run.act({ type: 'conclude' }); run.next();
  assert.ok(!sheet(run).includes('You settle on about'), 'the verdict is not said in the seller\'s bubble at the Close');
  for (let seed = 1; seed <= 9; seed++) {
    const a = I.create({ truth: { quality: 0.7, fake: true, defects: [] }, budget: 3, accuracy: 0.5, seed }), b = I.create({ truth: { quality: 1.1, fake: false, defects: [] }, budget: 3, accuracy: 0.5, seed });
    assert.equal(a.opening, b.opening, `seed ${seed}: the same opening for a counterfeit and a genuine lot`); assert.ok(!/nothing to hide|too quickly/.test(a.opening));
  }
});

test('D2: Assist names a probe that is on the screen, and says so when none fits the points left', () => {
  const none = D.inspectAdvice({ probes: [{ id: 'look', affordable: false }, { id: 'serial', affordable: false }], belief: { fakeProb: 0.5 }, doubt: 0.1 });
  assert.equal(none.probe, null); assert.equal(none.text, 'No probe fits the points you have left.');
  const some = D.inspectAdvice({ probes: Object.keys(I.PROBES).map((id) => ({ id, affordable: true })), belief: { fakeProb: 0.5 }, doubt: 0.1 });
  assert.equal(some.probe, 'serial'); assert.match(some.text, /best test for a counterfeit/);
});

// =====================================================================================================================================================
// D3: the Pitch stage
// =====================================================================================================================================================
test('D3: the keenness a pitch earns stays between 0.85x and 1.20x and its fit within 0.30, as the hover says; an unbacked claim counts against you', () => {
  let lo = 9, hi = 0, fmin = 9, fmax = -9, n = 0;
  for (let seed = 1; seed <= 60; seed++) for (const bias of ['prestige', 'utility', 'scarcity', 'price', 'story']) for (const tags of [['tool'], ['luxury', 'gem'], ['collectible', 'retro'], ['bulk', 'scrap']]) {
    const s0 = P.create({ buyer: { needs: ['tool', 'prestige'], bias, quirk: seed % 3 ? null : P.QUIRKS[seed % P.QUIRKS.length].id }, asset: { tags, features: [] }, insight: 3, seed });
    for (const a of P.legal(s0)) { const o = P.act(s0, a).state.outcome; lo = Math.min(lo, o.mult); hi = Math.max(hi, o.mult); fmin = Math.min(fmin, o.fitDelta); fmax = Math.max(fmax, o.fitDelta); n++; }
  }
  assert.ok(n > 5000);
  assert.ok(lo > 0.85 && hi < 1.2, `the keenness is ${lo.toFixed(3)}x to ${hi.toFixed(3)}x, inside 0.85x to 1.20x`);
  assert.ok(lo < 0.95 && hi > 1.1, 'and the bounds are the ones a pitch can approach');
  assert.ok(fmin > -0.3 && fmax < 0.3, `fit stays within 0.30: ${fmin.toFixed(3)} to ${fmax.toFixed(3)}`);
  const g = world(), run = start(g, sellSpec(g)); run.act({ type: 'pick', angles: ['utility', 'story'] });
  assert.ok(titles(panel(run, { pick: ['utility', 'story'] })).includes("Fit stays within 0.30 either way, and keenness between 0.85x and 1.20x."));
  // a claim the goods cannot back: the term is 1.25 C - 0.25 (zero at a fifth, negative under it), and for a buyer who wants utility the same pick scores better the better it is backed
  const m = /clamp\(([\d.]+) \* C - ([\d.]+), -0\.25, 1\)/.exec(read('js/play/pitch.js')); assert.ok(m, 'the backing term is 1.25 C - 0.25');
  assert.ok(Math.abs(+m[2] / +m[1] - 0.2) < 1e-9);
  const fit = (C) => P.act(P.create({ buyer: { needs: ['tool'], bias: 'utility', quirk: null }, asset: { tags: [], features: [{ angle: 'utility', strength: C }, { angle: 'price', strength: 0.7 }] }, insight: 3, seed: 11 }), { type: 'pick', angles: ['utility', 'price'] }).state.outcome.fitDelta;
  assert.ok(fit(0) < fit(0.2) && fit(0.2) < fit(0.4) && fit(0.4) < fit(0.7), 'more backing, a better pitch');
  const pp = panel(start(g, sellSpec(g)));
  assert.ok(visible(pp).includes('Bars show how well your goods back each angle. A claim they cannot back counts against you.'), 'the rule a pitch turns on is printed, once');
  assert.ok(!titles(pp).some((t) => /back this claim/.test(t)), 'and is not told again on every bar');
});

test('D3: the buyer\'s speech is printed once after a pitch, and a multiplier is written 1.12x', () => {
  const g = world(), run = start(g, sellSpec(g)); run.act({ type: 'pick', angles: ['utility', 'story'] });
  const h = sheet(run, { pick: ['utility', 'story'] });
  assert.equal(h.split(escQ(run.view().outcome.say)).length - 1, 1, 'the reaction is in the bubble and not again under the angles');
  assert.match(h, /<b>[+-]?\d\.\d\d fit\.<\/b> The buyer is \d\.\d\dx as keen\./);
  assert.ok(!/\bx\d\.\d\d\b/.test(h));
});

test('D3: an urgent need is said once, in words, on its chip, and the engine does what the chip says; the check to verify a buyer is 1% of the budget, and a fraud is 12% of buyers', () => {
  const g = world(['grad', 'native']);
  let found = null;
  for (const z of g.s.zones) for (const lead of g.s.leads[z]) for (const a of g.s.assets.filter((x) => x.zone === z)) { const q = g.quotePitch(a.id, lead.id, undefined, { blind: true }); if (q.ok && !found) found = { a, lead }; }
  assert.ok(found, 'a crate and a lead in one district');
  const { a, lead } = found, tag = ASSETS[a.cls].tags[0], other = Object.keys(BUYERS).flatMap((id) => Object.keys(BUYERS[id].like)).find((t) => !ASSETS[a.cls].tags.includes(t));
  lead.need = null; // the baseline is a buyer with no urgent need: the draw may have given this one a need, and the baseline would then already include it
  const base = g.quotePitch(a.id, lead.id, undefined, { blind: true }).fit;
  lead.need = tag; assert.equal(g.quotePitch(a.id, lead.id, undefined, { blind: true }).fit, 1, 'the tag the buyer needs: a perfect fit');
  lead.need = other; assert.ok(Math.abs(g.quotePitch(a.id, lead.id, undefined, { blind: true }).fit - base * 0.5) < 1e-9, 'a tag the crate lacks: half the fit');
  lead.need = tag;
  const run = start(g, { kind: 'sell', assetId: a.id, leadId: lead.id }), h = sheet(run);
  assert.ok(!/Right now they need|needs something/.test(h), 'it is not said in the bubble or under the name');
  assert.match(h, new RegExp(`<span class="chip warn" title="A crate with this tag is a perfect fit, and one without it halves the fit\\.">${tag}, needed now</span>`), 'it is marked on its chip');
  assert.equal(visible(h).split(`${tag}, needed now`).length - 1, 1, 'in words a player reads without hovering (colour is not the only carrier of an urgent need), and once');
  const fee = Math.max(0.01, Math.round(lead.budget * 0.01 * 100) / 100), cash0 = g.s.cash, plan = run.plan;
  assert.ok(plan.canVerify, 'a Digital Native may verify'); assert.match(h, /<b>Scam magnet\.<\/b> Some buyers are frauds\./); assert.match(h, /title="The check costs 1% of their budget\."/);
  assert.ok(Math.abs(plan.verifyCost - fee) < 1e-9, 'the button names the fee'); assert.ok(run.verify().ok); assert.ok(Math.abs(cash0 - g.s.cash - fee) < 1e-9, 'and the engine charges it: 1% of their budget');
  assert.equal(g.P.scamRate, 0.12, 'a fraud is 12% of a Digital Native\'s buyers, as the Draft says');
});

test('D3: an urgent need is told in words when the room is refused too (no chip row is drawn then, so the lot card says it)', () => {
  let hit = null;
  for (const seed of [9, 3, 5, 7, 11, 13]) {
    const g = world(['grad', 'native'], seed);
    for (const z of g.s.zones) for (const cls of Object.keys(ASSETS)) if ((ASSETS[cls].dem?.[z] || 0) > 0 && !g.s.assets.some((x) => x.zone === z && x.cls === cls)) g.s.assets.push(g._mk(g.s, cls, { zone: z, basis: 1 }));
    for (const z of g.s.zones) for (const lead of g.s.leads[z]) for (const a of g.s.assets.filter((x) => x.zone === z)) for (const seg of Object.keys(BUYERS)) {
      const f = fitOf(a.cls, seg); // a fit of 0.15 to 0.30 is open on its own and refused once an urgent need the crate lacks halves it
      if (!hit && (ASSETS[a.cls].dem?.[z] || 0) > 0 && f >= 0.15 && f < 0.3) hit = { g, lead, a, seg };
    }
    if (hit) break;
  }
  assert.ok(hit, 'a crate and a buyer that only just fit');
  const { g, lead, a } = hit; lead.seg = hit.seg;
  const need = Object.values(ASSETS).flatMap((d) => d.tags).find((t) => !ASSETS[a.cls].tags.includes(t));
  lead.need = need;
  const run = start(g, { kind: 'sell', assetId: a.id, leadId: lead.id });
  assert.ok(run.plan.blocker, 'an urgent need the crate lacks halves a fit of 0.15 to 0.30 under 0.15: the planner refuses');
  assert.ok(!D.modelOf(run, {}).view, 'and no stage state exists, so the sheet has no chip row');
  assert.ok(new RegExp(`\\b${need}\\b[^.]{0,20}needed now`).test(visible(sheet(run))), `"${need}" is still said to be needed now`);
});

test('D3: the buyer\'s lean is said once, by the stars on the cards, and not again in the list; two candidates are each a maybe', () => {
  for (const growth of [0, 2, 4, 5, 8]) {
    const g = world(); g.s.skills.growth = growth;
    const run = start(g, sellSpec(g)), h = panel(run), lean = run.view().hints.filter((x) => x.angles && x.kind !== 'temper');
    const stars = [...h.matchAll(/class="ahint">([^<]*)</g)].map((x) => x[1]);
    assert.equal(stars.length, lean.length ? lean[lean.length - 1].angles.length : 0, `growth ${growth}: a star on each angle the hint names, none when it names none`);
    for (const x of lean) assert.ok(!visible(h).includes(x.text), `growth ${growth}: "${x.text}" is on the stars and not also in the list`);
    for (const st of stars) assert.equal(st, stars.length > 1 ? 'Buyer may lean this way' : 'Buyer leans this way', 'one angle outright, two as a maybe: only one of two is the bias');
  }
});

// Assist names two angles by a score in which the buyer's lean outweighs the backing; what it says about the backing must be what the engine does with it
const ANG = ['prestige', 'utility', 'scarcity', 'price', 'story'];
function* pitchGrid() { // every crate against every buyer at every level of insight, as the Pitch stage would show it
  const needsOf = (seg) => Object.entries(BUYERS[seg].like).filter(([, w]) => w >= 0.5).sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 4);
  for (const cls of Object.keys(ASSETS)) for (const seg of Object.keys(BUYERS)) for (let insight = 0; insight <= 5; insight++) {
    const v = P.view(P.create({ buyer: { needs: needsOf(seg), bias: BUYERS[seg].bias, quirk: null }, asset: { tags: [...ASSETS[cls].tags], features: [] }, insight, seed: 3 }));
    yield { label: `${cls} / ${seg} / insight ${insight}`, adv: D.pitchAdvice(v), feat: Object.fromEntries(ANG.map((a) => [a, Math.max(0, ...v.asset.features.filter((f) => f.angle === a).map((f) => f.strength))])) };
  }
}

test('D3: Assist says "your goods can back it up" only of angles the goods back, and names the ones they cannot', () => {
  let n = 0, said = 0;
  for (const { label, adv, feat } of pitchGrid()) {
    n++; const weak = adv.angles.filter((a) => feat[a] < 0.2); // 0.2: pitch.js, where the backing term 1.25 C - 0.25 turns negative
    if (/can back it up/.test(adv.text)) { said++; assert.deepEqual(weak, [], `${label}: "${adv.text}" while ${weak} is unbacked`); }
    else assert.ok(weak.length && /cannot back/.test(adv.text) && weak.every((a) => adv.text.includes(a)), `${label}: "${adv.text}"`);
  }
  assert.ok(n > 40000 && said > 1000, `${n} views, ${said} of them say the goods can back it`);
});

test('D3: Assist advises no angle the goods cannot back while two others are backed (a claim they cannot back counts against you)', () => {
  let n = 0;
  for (const { label, adv, feat } of pitchGrid()) if (ANG.filter((a) => feat[a] >= 0.2).length >= 2) { n++; assert.deepEqual(adv.angles.filter((a) => feat[a] < 0.2), [], `${label}: ${adv.text}`); }
  assert.ok(n > 40000);
});

// =====================================================================================================================================================
// D4: the Close stage
// =====================================================================================================================================================
test('D4: "Their limit is inside this range" is true at every step of every talk, and Growth narrows the range', () => {
  let checked = 0;
  for (const role of ['sell', 'buy']) for (const style of H.STYLES) for (const insight of [0, 2, 5]) for (let seed = 1; seed <= 16; seed++) {
    const fair = 40 + seed, reserve = role === 'sell' ? fair * (1.1 + 0.015 * (seed % 7)) : fair * (0.72 + 0.011 * seed);
    let s = H.create({ role, fair, reserve, style, insight, seed, patience: 6 });
    for (const act of [{ type: 'anchor', level: 'fair' }, { type: 'hold' }, { type: 'concede', size: 'small' }, { type: 'concede', size: 'medium' }, { type: 'hold' }, { type: 'concede', size: 'small' }]) {
      const r = H.act(s, act); if (r.say === null) break; s = r.state;
      const real = (role === 'sell' ? s.R : 2 - s.R) * fair, v = H.view(s), lo = Math.min(v.read.lo, v.read.hi), hi = Math.max(v.read.lo, v.read.hi);
      assert.ok(lo - 1e-6 <= real && real <= hi + 1e-6, `${role}/${style}/insight ${insight}/seed ${seed}: their limit ${real.toFixed(2)} is in ${lo.toFixed(2)} to ${hi.toFixed(2)}`); checked++;
      if (s.done) break;
    }
  }
  assert.ok(checked > 700, `${checked} steps checked`);
  const widths = [0, 1, 2, 3, 4, 5].map((insight) => { const v = H.view(H.create({ role: 'sell', fair: 100, reserve: 130, style: 'friendly', insight, seed: 4 })); return v.read.hi - v.read.lo; });
  for (let i = 1; i < widths.length; i++) assert.ok(widths[i] < widths[i - 1], `insight ${i} reads a narrower range than insight ${i - 1}`);
  const g = world(), insights = [1, 2, 3, 4, 5, 6, 8, 10].map((lvl) => { g.s.skills.growth = lvl; return D.insightOf(g); });
  for (let i = 1; i < insights.length; i++) assert.ok(insights[i] >= insights[i - 1], 'more Growth never reads less'); assert.ok(insights.at(-1) > insights[0], 'Growth buys insight');
});

test('D4: their stance is worded from one table, and no advice says "They look reach"', () => {
  assert.deepEqual(Object.keys(H.TELLS).sort(), ['far', 'near', 'reach']);
  let said = 0;
  for (const style of H.STYLES) for (const role of ['sell', 'buy']) for (let seed = 1; seed <= 30; seed++) {
    let s = H.create({ role, fair: 100, reserve: role === 'sell' ? 125 : 78, style, seed, assist: true, insight: 3, patience: 6 });
    for (const act of [{ type: 'anchor', level: 'low' }, { type: 'concede', size: 'medium' }, { type: 'concede', size: 'small' }, { type: 'concede', size: 'small' }]) {
      const r = H.act(s, act); if (r.say === null || r.state.done) break; s = r.state;
      const v = H.view(s); if (!v.advice) continue;
      assert.ok(!/They look (far|reach|near)\b/.test(v.advice.text), v.advice.text);
      const m = /They are ([^:]+):/.exec(v.advice.text); if (m) { said++; assert.ok(Object.values(H.TELLS).includes(m[1]), `"${m[1]}" is one of the stance words`); }
      if (v.tell) assert.ok(UI.closeHTML({ plan: { kind: role }, view: v, stageDone: false }).includes(`They are <b>${H.TELLS[v.tell]}</b>.`), 'the stage says it in the same words');
    }
  }
  assert.ok(said > 5, 'some advice named the stance');
});

test('D4: a friendly counterparty returns 100%, 50% and 20% of a small, medium and large step, as the advice says', () => {
  const p = { role: 'sell', fair: 100, reserve: 135, style: 'friendly', insight: 3, seed: 6, patience: 7 };
  const s0 = H.act(H.create(p), { type: 'anchor', level: 'high' }).state, base = H.act(s0, { type: 'hold' }).state.tau - s0.tau; // what a round alone does to their accept line
  for (const size of ['small', 'medium', 'large']) {
    const to = H.act(s0, { type: 'concede', size }).state, measured = ((to.tau - s0.tau - base) * s0.R) / H.STEPS[size];
    assert.ok(Math.abs(measured - H.RECIP[size]) < 1e-6, `${size}: the counterparty returns ${measured.toFixed(3)} of the step, the table says ${H.RECIP[size]}`);
  }
  let text = null;
  for (let seed = 1; seed <= 80 && !text; seed++) { let s = H.act(H.create({ ...p, seed, assist: true }), { type: 'anchor', level: 'high' }).state; s = H.act(s, { type: 'hold' }).state; const t = H.view(s).advice?.text; if (t && /returns only/.test(t)) text = t; }
  assert.ok(text, 'advice that names the rule turned up');
  assert.ok(text.includes(`returns only ${Math.round(H.RECIP.medium * 100)}% of a medium step and ${Math.round(H.RECIP.large * 100)}% of a large one`), text);
});

test('D4: the other option is used once, and it counts only when it beats their offer', () => {
  const p = { role: 'sell', fair: 100, reserve: 135, style: 'friendly', insight: 3, seed: 5, patience: 7 };
  const anchored = (alt) => H.act(H.create({ ...p, alt }), { type: 'anchor', level: 'high' }).state;
  const low = anchored(60), high = anchored(125), their = H.view(low).theirs;
  assert.ok(!low.done && !high.done && 60 < their && their < 125, 'one option is under their offer and one over it');
  assert.equal(H.act(low, { type: 'leverage' }).state.lift, 0, 'an option under their offer lifts nothing');
  const used = H.act(high, { type: 'leverage' }).state;
  assert.ok(used.lift > 0, 'an option over it does');
  assert.ok(H.legal(high).some((a) => a.type === 'leverage') && !H.legal(used).some((a) => a.type === 'leverage'), 'and it is gone after one use');
});

test('D4: the Assist names the move it recommends as the Close screen does (docs/COPY.md, rule 6)', () => {
  const rec = (html) => { const m = /<button class="move[^"]*\brec\b[^"]*"[^>]*>([\s\S]*?)<\/button>/.exec(html); return m ? visible(m[1].split('<b>')[0]).replace(/[▲◆▼]/g, '').trim() : null; };
  const kinds = new Set(), names = new Set();
  for (const role of ['sell', 'buy']) for (const style of H.STYLES) for (const reserve of [role === 'sell' ? 80 : 120, role === 'sell' ? 125 : 78]) for (let seed = 1; seed <= 16; seed++) for (const alt of [null, role === 'sell' ? 112 : 88]) {
    let s = H.create({ role, fair: 100, reserve, style, seed, assist: true, insight: seed % 6, patience: 6, alt });
    for (let i = 0; i < 12 && !s.done; i++) {
      const v = H.view(s); if (!v.advice) break;
      const html = UI.closeHTML({ plan: { kind: role, alt }, view: v, advice: v.advice, assist: true, stageDone: false }), name = v.advice.action.type === 'walk' ? 'Walk away' : rec(html); // (the Walk away button carries no ring)
      assert.ok(name, `a button is highlighted for ${JSON.stringify(v.advice.action)}`);
      assert.ok(v.advice.text.toLowerCase().includes(name.toLowerCase()), `"${name}" is the button, and the Assist says: ${v.advice.text}`);
      kinds.add(v.advice.action.type + (v.advice.action.level ? ':' + v.advice.action.level : '')); names.add(`${role}/${name}`);
      s = H.act(s, v.advice.action).state;
    }
  }
  for (const k of ['anchor:high', 'anchor:fair', 'anchor:low', 'concede', 'hold', 'leverage', 'walk', 'accept']) assert.ok(kinds.has(k), `${k} was advised somewhere in the sweep`);
  for (const n of ['sell/Aim high', 'sell/Fair', 'sell/Quick sale', 'buy/Generous', 'buy/Fair', 'buy/Lowball', 'sell/Come down', 'buy/Raise your offer', 'sell/Mention your other option', 'sell/Accept their offer', 'buy/Accept their price']) assert.ok(names.has(n), `${n} was the highlighted button somewhere in the sweep`);
});

test('D4: the first-number advice is the move and the zone, and warns of a style only where the style bites; the lesson says the multiplier once', () => {
  let anchors = 0, warned = 0;
  for (const role of ['sell', 'buy']) for (const insight of [0, 2, 5]) for (let seed = 1; seed <= 60; seed++) {
    const s = H.create({ role, fair: 100, reserve: role === 'sell' ? 125 : 78, style: 'analytical', seed, assist: true, insight, patience: 6 }), a = H.view(s).advice;
    if (!a || a.action.type !== 'anchor') continue; anchors++;
    assert.match(a.text, /^Choose (Aim high|Fair|Quick sale|Generous|Lowball) \(\$[\d,.]+\)\. That stays inside the zone of possible agreement \(ZOPA\) without insulting them\./, a.text);
    if (a.action.level === 'fair') { warned++; assert.match(a.text, /They know the market price, so (a number|an offer) near fair suits them\.$/, a.text); }
    else { assert.ok(!/They know the market price/.test(a.text), `an analytical buyer is not warned off the opening it was advised: ${a.text}`); assert.equal(H.act(s, a.action).state.flag, null, 'and the opening does not rouse them'); }
  }
  assert.ok(anchors > 40 && warned > 5, `${anchors} openings advised, ${warned} of them fair`);
  // a deal's lesson names the share of the way to their limit, not the multiplier (the Haggle reason has it, once)
  let deals = 0;
  for (const role of ['sell', 'buy']) for (const style of H.STYLES) for (let seed = 1; seed <= 24; seed++) {
    let s = H.create({ role, fair: 100, reserve: role === 'sell' ? 125 : 78, style, seed, insight: 3, patience: 8 });
    const first = H.act(s, { type: 'anchor', level: 'fair' }); if (first.say === null) continue; s = first.state;
    for (let i = 0; i < 12 && !s.done; i++) { const r = H.act(s, { type: i < 2 ? 'concede' : 'accept', size: 'medium' }); if (r.say === null) break; s = r.state; }
    const lesson = H.result(s).lesson; if (!lesson || !/landed/.test(lesson.text)) continue; deals++;
    assert.ok(!/\d\.\d\d|\btimes\b/.test(lesson.text.replace(/\$[\d.,]+/g, '')), lesson.text); assert.match(lesson.text, /^The price landed \d+% of the way to their limit \(\$[\d,.]+\)\./);
  }
  assert.ok(deals > 20, `${deals} deals read`);
});

test('D4: a buyer with under 12% of headroom has nothing to haggle over, and the card says so in the words the lessons use', () => {
  const g = world();
  for (const z of g.s.zones) for (const l of g.s.leads[z]) l.need = null; // an urgent buyer is priced from their own budget (engine.js:633), so the budget set below would move the price with it
  const spec = sellSpec(g), lead = leadOf(g, spec.leadId), raw = D.planFor(g, spec).raw;
  lead.budget = raw * 1.11; assert.equal(D.planFor(g, spec).capped, true, 'a budget 11% over the price is spent');
  lead.budget = raw * 1.13; assert.equal(D.planFor(g, spec).capped, false, 'one 13% over is not');
  lead.budget = raw * 1.11;
  const r = start(g, spec); r.quick(); r.next();
  assert.match(panel(r), /<div class="callout">Their budget is nearly spent at the fair price: nothing to haggle over\.<\/div>/);
});

// =====================================================================================================================================================
// D5: the Bid stage
// =====================================================================================================================================================

test('D5: the limit on a bid is 1.4x the guide price or your cash, whichever is less, and the callout says "limit"', () => {
  const g = world(), spec = auctionLot(g), lot = g.s.lots[6].find((l) => l.id === spec.lotId);
  assert.ok(Math.abs(D.auctionParams(g, 6, lot).budget - Math.min(lot.price * 1.4, g.s.cash)) < 1e-9, 'rich: 1.4x the guide price');
  g.s.cash = lot.price * 1.1; assert.ok(Math.abs(D.auctionParams(g, 6, lot).budget - g.s.cash) < 1e-9, 'short of cash: your cash');
  const h = UI.bidHTML({ plan: { lot: { price: 100, mode: 'auction' } }, view: bidView(), stageDone: false });
  assert.match(h, /<div class="callout warn" title="Your limit is 1\.4x the guide price, or your cash if that is less\.">The next bid is past your limit\. You can only drop out\.<\/div>/);
  assert.ok(!/past your budget/.test(h));
});

test('D5: with Assist on, the cap is said once, by the Assist box in the callout\'s word, and the limit rule moves to the box\'s hover', () => {
  let s = A.create({ trueValue: 100, estimate: 100, seed: 1, reserve: 50, increment: 10, budget: 120, assist: true, bidders: [{ style: 'steady', limit: 400 }, { style: 'steady', limit: 400 }] });
  for (let i = 0; i < 20 && A.view(s).nextBid <= 120; i++) s = A.act(s, { type: 'bid' }).state;
  const v = A.view(s), plan = { lot: { price: 100, mode: 'auction' } };
  assert.ok(v.nextBid > v.budget && !A.legal(s).some((a) => a.type === 'bid'), 'the next bid is past the limit, so a drop is all that is left');
  assert.match(v.advice.text, /is past your limit \(\$120\): drop\.$/);
  const on = UI.bidHTML({ plan, view: v, advice: v.advice, assist: true, stageDone: false }), off = UI.bidHTML({ plan, view: v, stageDone: false });
  assert.match(on, /<b>Assist\.<\/b>/); assert.ok(!/class="callout warn"/.test(on), 'with the hint on screen the callout does not say it again');
  assert.equal(visible(on).split('past your limit').length - 1, 1, 'the cap is said once');
  assert.ok(titles(on).includes('Your limit is 1.4x the guide price, or your cash if that is less.'), 'and the hint carries the rule on hover');
  assert.match(off, /<div class="callout warn" title="Your limit is 1\.4x the guide price, or your cash if that is less\.">The next bid is past your limit\. You can only drop out\.<\/div>/);
  assert.ok(!/\bbudget\b/.test(visible(on)) && !/\bbudget\b/.test(visible(off)), 'one word for the cap on the one panel');
});

test('D5: a rival\'s mood is what the hover says: steady raises one step at a time, loud jumps, quiet waits', () => {
  const events = (style, seed) => { let s = A.create({ trueValue: 100, estimate: 100, seed, bidders: [{ style, limit: 400 }, { style: 'steady', limit: 90 }], reserve: 40, increment: 5, budget: 1000 }); for (let i = 0; i < 60 && !s.done; i++) { const r = A.act(s, { type: 'bid' }); s = r.say === null ? A.act(s, { type: 'drop' }).state : r.state; } return s.events.filter((e) => e.who === 'Marla'); };
  const kinds = (style) => { const k = new Set(); for (let seed = 1; seed <= 25; seed++) for (const e of events(style, seed)) k.add(e.kind); return k; };
  assert.ok(!kinds('steady').has('jump'), 'steady never jumps the price');
  assert.ok(kinds('aggressive').has('jump') && kinds('bluffer').has('jump'), 'loud jumps the price (an aggressive bidder, or one that bluffs)');
  assert.ok(kinds('sniper').has('wait'), 'quiet waits');
  const mood = (style) => A.view(A.create({ trueValue: 100, bidders: [{ style, limit: 100 }] })).rivals[0].mood;
  assert.deepEqual(['steady', 'aggressive', 'bluffer', 'sniper'].map(mood), ['steady', 'loud', 'loud', 'quiet']);
  const rivals = ['steady', 'loud', 'quiet'].map((m, id) => ({ id, name: `R${id}`, mood: m, active: true, droppedAt: null, high: false }));
  const h = UI.bidHTML({ plan: { lot: { price: 100, mode: 'auction' } }, view: bidView({ rivals }), stageDone: false });
  assert.match(h, /<span class="mute small" title="Patient\. Raises one step at a time\.">steady<\/span>/);
  assert.match(h, /<span class="mute small" title="Aggressive or bluffing\. You cannot tell which until it folds\.">loud<\/span>/);
  assert.match(h, /<span class="mute small" title="Waits, then bids late\.">quiet<\/span>/);
});

test('D5: an estimate is a guess, sharper with Capital Sourcing and with a good read', () => {
  const g = world(), z = 6, lot = { id: 'Tg', zone: z, cls: 'vinyl', cond: 'ok', price: 100, mode: 'auction', truth: { q: 0.8, fake: false, defects: [] } }; g.s.lots[z] = [lot];
  const spread = (fintech) => { g.s.skills.fintech = fintech; const errs = []; for (let i = 1; i <= 400; i++) errs.push(D.auctionParams(g, z, lot, { seed: i }).estimate / (100 / 0.8 * 0.925) - 1); return Math.sqrt(mean(errs.map((e) => (e - mean(errs)) ** 2))); };
  const s1 = spread(1), s8 = spread(8);
  assert.ok(s1 > 0.14 && s1 < 0.22, `Capital Sourcing 1: about 18% either way (${s1.toFixed(3)})`); assert.ok(s8 < s1 - 0.04, `Capital Sourcing 8 is sharper (${s8.toFixed(3)})`);
  g.s.skills.fintech = 1; let blind = 0, informed = 0;
  for (let i = 1; i <= 300; i++) { const a = D.auctionParams(g, z, lot, { seed: i }), b = D.auctionParams(g, z, lot, { seed: i, read: { estimate: { quality: 0.8, fakeProb: 0 }, confidence: 0.9 } }); blind += Math.abs(a.estimate - a.trueValue); informed += Math.abs(b.estimate - b.trueValue); }
  assert.ok(informed < blind * 0.6, 'a confident, right read pulls the estimate toward the truth');
  const h = UI.bidHTML({ plan: { lot: { price: 100, mode: 'auction' } }, view: bidView({ price: null, nextBid: 60, budget: 140, high: null, actions: [{ type: 'bid' }, { type: 'drop' }], round: 0 }), stageDone: false });
  assert.match(h, /<p class="small" title="Rivals bid on estimates of their own, and the highest guess usually wins\. Yours is a guess too, sharper with Capital Sourcing and a good read\.">Your estimate: <b>\$100<\/b>\. A guess: bid below it\.<\/p>/);
  assert.ok(!/\(it could be off\)|Opening bid|held by/.test(h));
  // what a bid turns on is printed (docs/COPY.md, rule 9): a phone has no hover, and with Assist off nothing else says the estimate is a guess to bid under (the Codex page of the winner's curse says it in these words)
  assert.ok(visible(h).includes('Your estimate: $100 . A guess: bid below it.')); assert.match(CODEX.find((c) => c.id === 'winners-curse').summary, /Bid below your estimate\.$/);
  const assisted = UI.bidHTML({ plan: { lot: { price: 100, mode: 'auction' } }, view: bidView({ price: null, nextBid: 60, budget: 140, high: null, actions: [{ type: 'bid' }, { type: 'drop' }], round: 0 }), advice: { text: "Stop near $95.00: your estimate less a margin for the winner's curse. The next bid, $60.00, is inside that." }, assist: true, stageDone: false });
  assert.ok(!visible(assisted).includes('A guess: bid below it.') && visible(assisted).includes('margin for the winner\'s curse'), 'with Assist on the box says it, once');
  assert.ok(!visible(UI.bidHTML({ plan: { lot: { price: 100, mode: 'auction' } }, view: bidView({ actions: [], done: true }), stageDone: true, res: { won: false } })).includes('A guess'), 'and a bid that is over has nothing to advise');
});

test('D5: the auctioneer says only "Lot up for bids", the guide price is printed once, and a lot you lose costs nothing', () => {
  const g = world(), spec = auctionLot(g), lot = g.s.lots[6].find((l) => l.id === spec.lotId), run = start(g, spec);
  assert.equal(run.plan.cast.hello, 'Lot up for bids.');
  const guide = money(lot.price);
  assert.equal(visible(sheet(run)).split(guide).length - 1, 1, `the guide price ${guide} is on the scoreboard and not on the lot card or in the bubble`);
  run.quick(); run.next(); run.act({ type: 'drop' });
  assert.ok(run.stageDone() && run.res.bid.won === false);
  const cash = g.s.cash, rep = g.s.rep, sm = run.finish();
  assert.equal(g.s.cash, cash, 'dropping out costs no cash'); assert.equal(g.s.rep, rep, 'and no reputation'); assert.match(sm.headline, /Dropping costs nothing\.$/);
  assert.match(UI.bidHTML({ plan: { lot: { price: 100, mode: 'auction' } }, view: bidView({ actions: [], done: true }), stageDone: true, res: { won: false } }), /<div class="callout ">You are out\.<\/div>/);
});

// =====================================================================================================================================================
// D6: the Fix stage and the dial tone's offer
// =====================================================================================================================================================
test('D6: steady hands cost less and return more: the bill runs 0.9x to 1.3x the quote, quality 0.85x to 1.15x, and "the bill can reach" is the engine\'s own most', () => {
  const at = (acc) => R.result({ ...R.create({ ops: 3, seed: 2 }), steps: [{ acc, careful: false }, { acc, careful: false }, { acc, careful: false }], step: 3, done: true });
  const best = at(1), mid = at(0.5), worst = at(0);
  assert.ok(Math.abs(best.costMult - 0.9) < 1e-9 && Math.abs(worst.costMult - 1.3) < 1e-9, 'the bill is 0.9x to 1.3x the quote, never twice');
  assert.ok(best.costMult < mid.costMult && mid.costMult < worst.costMult && best.qualityMult > mid.qualityMult && mid.qualityMult > worst.qualityMult, 'precision lowers the bill and raises the quality');
  assert.ok(Math.abs(best.qualityMult - 1.15) < 1e-9 && Math.abs(worst.qualityMult - 0.85) < 1e-9);
  const g = world(['trades', 'roots']), run = start(g, brokenCrate(g));
  assert.equal(run.plan.cast.hello, 'Three steps: strip, fit, tune. Steady hands cost less and return more.');
  const q = g.repairQuote(run.plan.asset.id), dear = g.repairQuote(run.plan.asset.id, { costMult: 1.3, qualityMult: 0.85 });
  assert.ok(Math.abs(run.plan.quote.most - dear.cost) < 0.006, `the most (${run.plan.quote.most}) is the engine's bill at 1.3x (${dear.cost})`); assert.ok(Math.abs(run.plan.quote.most - q.cost * D.REPAIR_MOST) < 0.006);
  assert.equal(D.dealFrom('repair', { fix: { costMult: 9, qualityMult: 9, precision: 9 } }).costMult, 1.3, 'and the engine takes no more than that');
  assert.ok(panel(run).includes(`Worth ${money(run.plan.quote.before)} now. The bill can reach ${money(run.plan.quote.most)}.`));
  const all = visible(sheet(run));
  assert.equal(all.split(money(run.plan.quote.cost)).length - 1, 1, 'the quote is printed once, on the scoreboard'); assert.equal(all.split(money(run.plan.quote.after)).length - 1, 1, 'and so is what it is worth repaired');
  run.act({ type: 'careful' }); assert.ok(Math.abs(run.res.fix.costMult - 1.3) < 1e-9 && Math.abs(run.res.fix.qualityMult - 1) < 1e-9, 'Careful: 1.3x the quote, the quote\'s own quality');
  assert.match(panel(run), /<b>50% precise\.<\/b> Cost 1\.30x the quote, quality 1\.00x\./);
});

test('D6: Assist widens the green zone by 60%, as its advice says', () => {
  for (let ops = 1; ops <= 10; ops++) assert.ok(Math.abs(R.zoneHalf(ops, 1, true) / R.zoneHalf(ops, 1, false) - 1.6) < 1e-9, `Ops ${ops}`);
  const g = world(), run = start(g, brokenCrate(g), { assist: true });
  assert.equal(D.modelOf(run, {}).advice.text, 'Aim for the center of the green zone: precision falls as the marker leaves it. Assist widens the zone by 60%.');
  const step = R.act(R.create({ ops: 4, seed: 7 }), { type: 'stop', t: 600 }).state.steps[0].acc, centered = R.act(R.create({ ops: 4, seed: 7 }), { type: 'stop', t: 900 }).state.steps[0].acc;
  assert.ok(Number.isFinite(step) && Number.isFinite(centered), 'precision is a fraction that falls with the distance from the center (repair.js accuracy)');
  assert.match(read('js/play/repair.js'), /clamp\(1 - Math\.abs\(x - 0\.5\) \/ half, 0, 1\)/);
});

test('D6: the dial tone\'s offer is a statement, names the switch as the screen does, and keeps the way that needs no timing in every state', () => {
  const states = [dialInfo({}), dialInfo({ dial: true }), dialInfo({ dial: true, mute: true }), dialInfo({ dial: true, master: 0 }), dialInfo({ dial: true, game: false }), dialInfo({ quiet: true })];
  for (const i of states) for (const line of [dialEarText(i), dialShortText(i), dialShortText(i, true), dialAnnounceText(i)]) assert.ok(!/\?/.test(line), `no question: "${line}"`);
  const off = dialEarText(dialInfo({}));
  assert.equal(off, 'To follow the marker by ear, turn on Dial tone next to Sound or in Display and sound. Careful needs no timing.');
  assert.ok(off.split(' ').length <= 22, `${off.split(' ').length} words: the offer was 31`);
  assert.ok(dialSwitchHTML({ kind: 'repair', stage: 'fix', dialInfo: dialInfo({}) }).includes('<span class="tn">Dial tone</span>'), 'the switch is called what the offer calls it');
  for (const i of states) { assert.match(dialEarText(i), /Careful needs no timing\.$/); assert.match(dialShortText(i), /Careful needs no timing\.$/); }
  assert.match(dialAnnounceText(dialInfo({})), /choose Careful: pay more, no timing\./, 'what is spoken says all of it');
  assert.ok(!/\?/.test(toggleDial({}).said) && !/\?/.test(toggleDial({ quiet: true }).said));
  const g = world(), html = UI.fixHTML({ ...model(start(g, brokenCrate(g))), dialInfo: dialInfo({}) });
  assert.match(html, /id="dial-help">Press <b>Stop<\/b>, Space or Enter when the marker is inside the green zone\.<\/p>/);
  assert.ok(!/Watch the marker/.test(html));
});

// =====================================================================================================================================================
// D7: the result
// =====================================================================================================================================================
const NOTATION = /(?:^|[^\w.])x\d+\.\d\d\b/;

test('D7: a multiplier is written 1.08x everywhere the room says one: the stages, the result, the notes and the bench', () => {
  const texts = [];
  for (const kind of Object.keys(SPECS)) for (const quick of [true, false]) {
    const g = world(['grad', 'roots']), run = start(g, SPECS[kind](g), { assist: true });
    if (quick) run.quickAll();
    else for (let i = 0; i < 6 && !run.over; i++) {
      const k = run.key;
      if (k === 'read') { run.act({ type: 'probe', id: 'look' }); run.act({ type: 'conclude' }); } else if (k === 'pitch') run.act({ type: 'pick', angles: ['utility', 'price'] });
      else if (k === 'close') { run.act({ type: 'anchor', level: 'fair' }); run.act({ type: 'accept' }); } else if (k === 'bid') run.act({ type: 'drop' }); else if (k === 'fix') run.act({ type: 'careful' });
      texts.push(`${kind}/${k}: ${sheet(run)}`); if (!run.next()) break;
    }
    const sm = run.finish(); texts.push(sheet(run), JSON.stringify(sm), JSON.stringify(run.says), JSON.stringify(D.modelOf(run)));
  }
  for (const t of texts) assert.ok(!NOTATION.test(t), `"${(NOTATION.exec(t) || [''])[0]}" in ${t.slice(0, 80)}`);
  const src = ['js/deal.js', 'js/ui/deal.js', 'js/play/repair.js', 'js/play/haggle.js', 'js/play/auction.js', 'js/play/pitch.js', 'js/play/inspect.js'].map(read).join('\n').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/\bx\$\{/.test(src), 'no template writes x${number}');
  assert.match(R.act(R.create({ ops: 5, seed: 3 }), { type: 'careful' }).say, /Repair done at \d+% precision\.$/);
});

test('D7: a headline does not repeat the sheet\'s title; it says what was paid', () => {
  const sells = world(['grad', 'roots']), sale = start(sells, sellSpec(sells)); sale.quickAll(); const s1 = sale.finish();
  const buys = world(['grad', 'roots']), buy = start(buys, fixedLot(buys)); buy.quickAll(); const s2 = buy.finish();
  const fixes = world(['grad', 'roots']), fix = start(fixes, brokenCrate(fixes)); fix.quickAll(); const s3 = fix.finish();
  for (const [sm, run] of [[s1, sale], [s2, buy], [s3, fix]]) { assert.ok(sm.ok); const name = (run.plan.asset || run.plan.lot).name.replace(/ \(broken\)/, ''); assert.ok(!sm.headline.includes(name), `"${sm.headline}" does not name the ${name} again`); assert.ok(sm.headline.split(' ').length <= 8, sm.headline); }
  assert.ok(['Sold at a gain', 'Pioneer sale', 'Sold into the herd', 'Sold below market', 'Sold, no gain'].includes(s1.title), s1.title); assert.equal(s1.headline, `Sold for ${money(s1.numbers.you)}.`);
  assert.equal(s2.headline, `Bought for ${money(s2.numbers.you)}.`);
  assert.match(s3.headline, /^Back at \d+% quality for \$[\d,.]+\.$/);
  const left = start(fixes, brokenCrate(fixes)).walkAway(); assert.ok(/The .+ is still broken/.test(left.headline) && !/\(broken\)/.test(left.headline), left.headline);
});

test('D7: the sale card compares what you received with the crate\'s market value in the engine\'s figures: the percent, above or below, and a multiple from 5 times', () => {
  // The comparison is the engine's gain, received / fmv - 1 (quotePitch): what lands after tax and fees against the value Stock shows. Every sale below is played on a world of its own, with urgent buyers
  // among the others, so the sweep reaches a sale above the value, one below it, and one that pays a multiple of a cheap crate's value.
  const sweep = (perks, seed) => { const g = world(perks, seed); for (const z of g.s.zones) for (let k = 0; k < 6; k++) g._spawnLead(z, false, k % 2 === 0); return g; };
  const seen = new Set();
  for (const [perks, seed] of [[['grad', 'roots'], 1], [['grad', 'roots'], 2], [['native', 'second'], 3]]) {
    const g0 = sweep(perks, seed), pairs = [];
    for (const z of g0.s.zones) for (const lead of g0.s.leads[z]) for (const a of g0.s.assets.filter((x) => x.zone === z)) { const q = g0.quotePitch(a.id, lead.id); if (q.ok && !q.rejected) pairs.push([a.id, lead.id]); }
    for (const [assetId, leadId] of pairs.filter((_, i) => i % 3 === 0)) {
      const g = sweep(perks, seed), run = start(g, { kind: 'sell', assetId, leadId }); run.quickAll();
      const sm = run.finish(), row = g.s.ledger.findLast((x) => x.type === 'pitch' && x.fmv != null);
      if (!sm.ok || !row) continue; // (a buyer who refuses, or a fraud, leaves no sale row)
      const gain = row.recv / row.fmv - 1, pct = Math.round(Math.abs(gain) * 100), kind = gain >= 4 ? 'times' : pct === 0 ? 'line' : gain > 0 ? 'above' : 'below';
      const want = `${{ times: `${Math.round(1 + gain)} times`, line: 'In line with', above: `${pct}% above`, below: `${pct}% below` }[kind]} the crate's market value of ${money(row.fmv)}.`;
      assert.ok(sm.lines.includes(want), `${kind}: gain ${gain.toFixed(4)} wants "${want}" in ${JSON.stringify(sm.lines)}`); seen.add(kind);
    }
  }
  for (const kind of ['above', 'below', 'times']) assert.ok(seen.has(kind), `the sweep reached a sale that reads "${kind}"`);
});

test('D7: the comparison line says "In line with" under half a percent, a whole percent up to 4 times the value, and a multiple of it from 5 times', () => {
  for (const [gain, says] of [[0.004, 'In line with'], [-0.004, 'In line with'], [0.006, '1% above'], [-0.006, '1% below'], [0.21, '21% above'], [-0.3, '30% below'], [3.99, '399% above'], [4, '5 times'], [130.9467, '132 times']]) {
    const g = world(['grad', 'roots']), pitch = g.pitch.bind(g); g.pitch = (...args) => { const r = pitch(...args); return r.ok ? { ...r, gain } : r; }; // the engine's own sale, read with the gain this row is about
    const run = start(g, sellSpec(g)); run.quickAll();
    const vs = run.finish().lines.find((l) => /the crate's market value/.test(l));
    assert.ok(vs && vs.startsWith(`${says} the crate's market value of $`), `gain ${gain}: "${vs}" starts "${says}"`);
  }
});

test('D7: the reveal counts the flaws a lot had and the ones you found, and "worth minus price" is the engine\'s sum', () => {
  const g = world(['grad', 'roots']), lot = g.s.lots[4].find((l) => l.mode === 'fixed');
  lot.truth = { q: 0.83, fake: false, defects: ['worn finish', 'loose fittings', 'faded markings'].map((label, i) => ({ id: 'd' + i, label })) };
  const run = start(g, { kind: 'buy', zone: 4, lotId: lot.id });
  run.act({ type: 'probe', id: 'look' }); run.act({ type: 'conclude' }); run.next(); run.quick();
  const secret = run.secret(), worth = run.worth(secret), sm = run.finish(), h = sheet(run), found = sm.reveal.found;
  assert.equal(sm.reveal.total, 3);
  assert.equal(sm.reveal.truth, '83% of its described condition, genuine'); assert.ok(h.includes('<b>83% of its described condition, genuine.</b>'), 'the real condition says what it is a share of');
  assert.ok(h.includes(`It had 3 flaws: worn finish, loose fittings, faded markings. You found ${found}.`), h.slice(h.indexOf('What the lot really was'), h.indexOf('What the lot really was') + 260));
  assert.ok(!/You found \d+ of its/.test(h), 'it no longer reads as if the three were the ones you found');
  assert.ok(Math.abs(sm.numbers.net - (worth - sm.numbers.you)) < 0.01, 'your net is worth minus price');
  assert.ok(h.includes(`Worth minus price: Quick ${money(sm.numbers.quickNet)}, expert ${money(sm.numbers.expertNet)}, you ${money(sm.numbers.net)}.`));
  assert.ok(sm.lines.includes(`Worth about ${money(worth)}.`));
  assert.ok(!/Against what it was really worth/.test(h));
  assert.match(h, /<h4>Price paid<\/h4>/); assert.ok(!/Quick, expert, you/.test(h));
  const g2 = world(['grad', 'roots']), l2 = g2.s.lots[4].find((l) => l.mode === 'fixed'); l2.truth = { q: 0.9, fake: false, defects: [] };
  const r2 = start(g2, { kind: 'buy', zone: 4, lotId: l2.id }); r2.quick(); r2.next(); r2.quick(); r2.finish();
  assert.match(sheet(r2), /It had no flaws\./);
});

test('D7: the lessons say what the engine does: a fraud costs the crate and a check costs 1%, every buyer refuses a counterfeit and it is worth 8%, and a Creativity multiplier counts the last 48 hours', () => {
  const g = world(['native', 'second']), spec = sellSpec(g); leadOf(g, spec.leadId).scam = true;
  const r = start(g, spec); r.quickAll(); const sm = r.finish();
  assert.equal(sm.title, 'Scammed'); assert.equal(sm.lesson.text, 'Verifying a buyer costs 1% of their budget. A fraud takes the crate and pays nothing.');
  assert.ok(!g.s.assets.some((a) => a.id === spec.assetId), 'a fraud takes the crate');
  const g2 = world(['grad', 'roots']), a = g2.s.assets[0]; a.truth = { q: 1, fake: true, defects: [] }; a.known = false;
  let n = 0; for (const lead of g2.s.leads[a.zone]) { const q = g2.quotePitch(a.id, lead.id, undefined, { blind: false }); if (!q.ok) continue; assert.ok(q.rejected && q.reason === 'counterfeit', `buyer ${lead.seg} refuses it`); n++; }
  assert.ok(n >= 2, `${n} buyers checked`);
  assert.equal(FAKE_VALUE, 0.08);
  const fake = { ...a, known: true, truth: { q: 1, fake: true, defects: [] } }, real = { ...a, known: true, truth: { q: 1, fake: false, defects: [] } };
  assert.ok(Math.abs(g2.val(fake) / g2.val(real) - 0.08) < 1e-9, 'a known counterfeit is worth 8% of the real thing');
  const g3 = world(); g3.s.hour = 200; g3.s.niche.push([200 - 47, 4, 'vinyl', 'collector'], [200 - 49, 4, 'vinyl', 'collector']);
  assert.equal(g3.ownCounts(4, 'vinyl').total, 1, 'a pitch 47 hours ago counts and one 49 hours ago does not');
  assert.match(read('js/cohort.js'), /rate\(zone\) \* 48 \/ nCls/, 'the cohort counts the same 48 hours');
  const g4 = world(['grad', 'roots']), sale = start(g4, sellSpec(g4)); sale.quickAll(); const why = sale.finish().reasons.find((x) => x.label === 'Creativity multiplier');
  assert.match(why.text, /^\d\.\d\dx, [A-Za-z ]+\. \d+ of \d+ pitches in the last 48 hours went to this exact buyer\.$/);
});

test('D7: leaving a sale keeps the buyer, a lot bought dear is "Paid too much", and a read is said once: as a reason on the shelf, in the reveal once the lot is bought', () => {
  const g = world(['grad', 'roots']), spec = sellSpec(g), sale = start(g, spec); sale.quick(); sale.next(); sale.act({ type: 'anchor', level: 'high' }); sale.act({ type: 'walk' });
  const sm = sale.finish(); assert.equal(sm.title, 'No deal'); assert.ok(leadOf(g, spec.leadId), 'the buyer is still there');
  assert.equal(sm.headline, 'The talks ended without a deal. You keep the crate.');
  const g2 = world(['grad', 'roots']), lot = g2.s.lots[4].find((l) => l.mode === 'fixed'); lot.price *= 4; lot.truth = { q: 1, fake: false, defects: [] };
  const buy = start(g2, { kind: 'buy', zone: 4, lotId: lot.id }); buy.quickAll(); const bs = buy.finish();
  assert.ok(bs.ok && bs.numbers.net < 0, 'it was bought above its worth'); assert.equal(bs.title, 'Paid too much');
  const g3 = world(['grad', 'roots']), walk = start(g3, fixedLot(g3)); walk.act({ type: 'probe', id: 'look' }); const ws = walk.walkAway();
  assert.ok(ws.reasons.some((r) => r.label === 'Your read') && !ws.reveal, 'on the shelf: the read is a reason, and nothing is revealed');
  const g4 = world(['grad', 'roots']), done = start(g4, fixedLot(g4)); done.quickAll(); const ds = done.finish();
  assert.ok(ds.reveal && !ds.reasons.some((r) => r.label === 'Your read'), 'bought: the reveal carries it');
  const g5 = world(['grad', 'roots']), again = start(g5, fixedLot(g5)); again.quick(); again.next(); again.act({ type: 'anchor', level: 'low' }); again.act({ type: 'walk' }); again.finish();
  const second = start(g5, fixedLot(g5)); second.quick(); second.next();
  assert.ok(second.res.close && second.res.close.quick && /sat at this table before\. Quick played it for you\.$/.test(second.lastSay()), 'a table sat at before is played at Quick, and says so');
});

test('D7: a won auction is told in one worth: the lesson quotes the figure the card prints, and gives the verdict the title gives', () => {
  let wins = 0, lost = 0;
  for (const perks of [['grad', 'native'], ['grad', 'roots'], ['trades', 'roots']]) for (const seed of [3, 9, 14]) {
    const g = world(perks, seed);
    for (const z of [3, 4, 6]) for (let k = 0; k < 30; k++) g._spawnLot(z);
    for (const z of [3, 4, 6]) for (const lot of g.s.lots[z].filter((l) => l.mode === 'auction')) {
      const run = D.startRun(g, { kind: 'buy', zone: z, lotId: lot.id }); if (!run.ok) continue;
      run.quickAll(); const secret = run.secret(), worth = run.worth(secret), sm = run.finish();
      if (!sm.ok || !run.res.bid || !run.res.bid.won || secret.fake) continue;
      wins++;
      const net = worth - sm.numbers.you, curse = /winner's curse/.test(sm.lesson.text);
      if (!run.wreck(secret)) assert.ok(sm.lines.includes(`Worth about ${money(worth)}.`), 'the card prints the engine\'s worth');
      assert.ok(sm.lesson.text.includes(money(worth)), `the lesson quotes that worth: ${sm.lesson.text}`);
      assert.ok(!/true value/.test(sm.lesson.text), 'and not the Bid game\'s own "true value" (the guide price over TUNE.guide)');
      assert.equal(curse, net < 0, `the lesson and the title give one verdict (${sm.title}): ${sm.lesson.text}`);
      assert.equal(sm.title === 'Paid too much', net < 0);
      if (net < 0) lost++;
    }
  }
  assert.ok(wins >= 15 && lost >= 3, `${wins} wins, ${lost} of them above the worth`);
});

test('D7: a dropped auction says a profitable win was possible only when the engine\'s worth leaves one', () => {
  let drops = 0, possible = 0;
  for (const perks of [['grad', 'native'], ['grad', 'roots'], ['trades', 'roots']]) for (const seed of [3, 5, 8, 9, 11, 14, 17]) {
    const g = world(perks, seed);
    for (const z of [3, 4, 6]) for (let k = 0; k < 60; k++) g._spawnLot(z);
    for (const z of [3, 4, 6]) for (const lot of g.s.lots[z].filter((l) => l.mode === 'auction')) {
      const run = D.startRun(g, { kind: 'buy', zone: z, lotId: lot.id }); if (!run.ok) continue;
      const price = lot.price; run.quickAll(); const secret = run.secret(), worth = run.worth(secret), sm = run.finish();
      if (!run.res.bid || run.res.bid.won !== false || secret.fake) continue;
      drops++;
      const top = Math.max(0, ...run.res.bid.reveal.rivals.map((b) => b.limit * (b.style === 'bluffer' ? 0.9 : 1))), could = worth - Math.max(price * 0.6, top + price / 20) > 0.01 * worth;
      assert.equal(/win at a profit was possible/.test(sm.lesson.text), could, sm.lesson.text);
      if (could) possible++;
    }
  }
  assert.ok(drops >= 20 && possible >= 3, `${drops} dropped lots, ${possible} with a profitable win left`);
});

test('D7: a wreck is judged on its better use: where the repair pays it is a "Good buy", and the line, the title and the three nets read one worth', () => {
  let wrecks = 0, pays = 0, payless = 0;
  for (const ops of [1, 4]) for (let seed = 1; seed <= 6; seed++) {
    const g = makeGame(['roots', 'second'], 'ops', seed);
    for (const z of [2, 3, 4]) g._openZone(z);
    g.s.cash = 1e9; g.s.skills.ops = ops;
    for (const z of g.s.zones) { g.s.lots[z] = []; for (let k = 0; k < 8; k++) g._spawnLot(z); } // lots posted AFTER the Ops level is set, as the engine posts them
    for (const z of g.s.zones) for (const lot of [...g.s.lots[z]].filter((l) => l.cond === 'broken')) {
      const run = D.startRun(g, { kind: 'buy', zone: z, lotId: lot.id }); assert.ok(run.ok, run.msg);
      const t = run.secret(), rq = g.repairQuoteFor(lot.cls, z), truth = { q: t.q, fake: false };
      const asIs = g.val({ cls: lot.cls, cond: 'broken', quality: 1, wear: 1, zone: z, known: true, truth });
      const fixed = g.val({ cls: lot.cls, cond: 'ok', quality: rq.quality, wear: 1, zone: z, known: true, truth });
      run.quickAll(); const sm = run.finish(); g.s.assets = [];
      if (!sm.ok || sm.numbers.you == null) continue;
      wrecks++; const price = sm.numbers.you, best = Math.max(asIs, fixed - rq.cost), n = sm.numbers;
      assert.ok(Math.abs(n.net - (best - price)) < 0.011, `your net is the better use minus the price (${n.net} vs ${best - price})`);
      assert.ok(Math.abs(n.net - n.quickNet) < 0.011, `Quick paid the same price, so its net is yours (${n.quickNet} vs ${n.net})`);
      assert.equal(sm.title, best - price >= 0 ? 'Good buy' : 'Paid too much', `${sm.title} at ops ${ops}`);
      assert.ok(sm.lines.includes(`Worth about ${money(asIs)} as it stands, ${money(fixed)} repaired for a bill of about ${money(rq.cost)}.`), sm.lines.join(' | '));
      if (fixed - rq.cost > asIs) pays++; else payless++;
    }
  }
  assert.ok(wrecks >= 20 && pays >= 5 && payless >= 5, `wrecks ${wrecks}, repair pays ${pays}, does not ${payless}`);
});

// a blank row of the comparison says what happened: nobody is paid in a sale a fraud took or a buyer refused, talks the other side ended are no deal, and a walk is a walk
const rowsOf = (h) => Object.fromEntries([...h.matchAll(/<div class="vs [^"]*"[^>]*><dt>([^<]*)<\/dt><dd[^>]*>([^<]*)<\/dd>/g)].map((m) => [m[1], m[2]]));
const cardOf = (run) => { const sm = run.summary || run.finish(); return { sm, rows: rowsOf(UI.resultHTML({ plan: run.plan, summary: sm })) }; };

test('D7: a sale a fraud took or a buyer refused reads "no sale" on all three rows, and a sale still prints its prices', () => {
  const g = world(['native', 'second']), spec = sellSpec(g); leadOf(g, spec.leadId).scam = true;
  const robbed = start(g, spec); robbed.quickAll(); const a = cardOf(robbed);
  assert.equal(a.sm.title, 'Scammed'); assert.deepEqual(a.rows, { Quick: 'no sale', Expert: 'no sale', You: 'no sale' });
  const g2 = world(['grad', 'roots']), crate = g2.s.assets[0]; crate.truth = { q: 1, fake: true, defects: [] }; crate.known = false;
  let spec2 = null; for (const lead of g2.s.leads[crate.zone]) { const q = g2.quotePitch(crate.id, lead.id, undefined, { blind: true }); if (!spec2 && q.ok && q.fit >= 0.15) spec2 = { kind: 'sell', assetId: crate.id, leadId: lead.id }; }
  assert.ok(spec2, 'a buyer who would look at the crate');
  const refused = start(g2, spec2); refused.quickAll(); const b = cardOf(refused);
  assert.equal(b.sm.title, 'Counterfeit spotted'); assert.deepEqual(b.rows, { Quick: 'no sale', Expert: 'no sale', You: 'no sale' });
  const g3 = world(['grad', 'roots']), sold = start(g3, sellSpec(g3)); sold.quickAll(); sold.finish();
  assert.ok(Object.values(cardOf(sold).rows).every((v) => /^\$/.test(v)), JSON.stringify(cardOf(sold).rows));
});

test('D7: a blank row of your own is a walk in the past tense, talks the buyer ended are "no deal", and nobody walks away from a table that was gone', () => {
  const g = world(), walked = start(g, sellSpec(g)); walked.quick(); walked.next(); walked.act({ type: 'anchor', level: 'high' }); walked.act({ type: 'walk' }); walked.finish();
  assert.equal(cardOf(walked).rows.You, 'walked away', 'the Walk away button inside a haggle is a walk, and you did it');
  const g2 = world(), left = start(g2, sellSpec(g2)); left.walkAway();
  assert.equal(cardOf(left).rows.You, 'walked away', 'leaving the table is a walk');
  const g3 = world(), patience = start(g3, sellSpec(g3)); patience.quick(); patience.next(); patience.act({ type: 'anchor', level: 'high' });
  for (let n = 0; !patience.res.close && n < 30; n++) patience.act({ type: 'hold' });
  patience.finish(); assert.equal(patience.summary.title, 'No deal'); assert.equal(cardOf(patience).rows.You, 'no deal', 'the buyer ran out of patience: not a walk of yours');
  const g4 = world(), spec4 = sellSpec(g4), gone = start(g4, spec4); g4.s.leads[gone.plan.zone] = g4.s.leads[gone.plan.zone].filter((l) => l.id !== spec4.leadId); gone.quickAll(); gone.finish();
  assert.equal(gone.summary.title, 'Not done'); assert.equal(cardOf(gone).rows.You, 'no deal', 'a buyer who has left while the table was open: nobody walked');
  const lite = { plan: { kind: 'buy' }, summary: { tone: 'info', title: 'No deal', headline: 'x', lines: [], numbers: { unit: 'price paid', better: 'low', quick: null, expert: null, you: null }, reasons: [], reveal: null, xp: 0, streak: 0, lesson: { concept: 'anchoring', text: 'x' } } };
  assert.deepEqual(rowsOf(UI.resultHTML(lite)), { Quick: 'walks away', Expert: 'walks away', You: 'walked away' }, 'a third person walks, you walked');
});

test('D7: a condition is said against its description wherever the figure stands alone (the reveal, the read left on the shelf, the Quick note), and the Read prints the range its bar draws in percent, not in "points"', () => {
  // a lot's real condition runs from 85% (the first two districts) or 70% to 115% of its description (engine.js _spawnLot), so a bare "111% condition" has no scale to be read on
  const g = world(['grad', 'roots']), lot = g.s.lots[4].find((l) => l.mode === 'fixed'); lot.truth = { q: 1.11, fake: false, defects: [] };
  const run = start(g, { kind: 'buy', zone: 4, lotId: lot.id }); run.quick(); run.next(); run.quick();
  const sm = run.finish();
  assert.equal(sm.reveal.truth, '111% of its described condition, genuine');
  assert.match(sm.reveal.estimate, /^\d+% of its described condition, \d+% chance of counterfeit$/);
  assert.match(visible(sheet(run)), /111% of its described condition, genuine\. It had no flaws\. Your read: \d+% of its described condition, \d+% chance of counterfeit\./);
  const g2 = world(['grad', 'roots']), walk = start(g2, fixedLot(g2)); walk.act({ type: 'probe', id: 'look' });
  assert.match(walk.walkAway().reasons.find((r) => r.label === 'Your read').text, /^\d+% of its described condition, \d+% chance of counterfeit$/, 'on the shelf the read is the only place the figure stands');
  const g3 = world(['grad', 'roots']), quick = start(g3, fixedLot(g3)); quick.quick();
  assert.match(D.modelOf(quick).quickRes.text, /^\d+% of its described condition, \d+% chance of counterfeit \(\d+ points? spent\)\.$/);
  // the Read: the range is what the bar draws (q - sd to q + sd), said in percent; "points" is the budget's word and nothing else's
  const g4 = world(), r4 = start(g4, fixedLot(g4)), m4 = model(r4), q = m4.view.belief.quality, sd = m4.view.doubt, pc = (x) => `${Math.round(x * 100)}%`, h = UI.readHTML(m4);
  assert.ok(h.includes(`about ${pc(q)}</b> <span class="mute small">(${pc(q - sd)} to ${pc(q + sd)})</span>`), 'about 93% (80% to 106%)');
  assert.ok(!/give or take|\d+ points\b/.test(visible(h)), 'no figure in the Read is counted in "points" but the budget');
});

// =====================================================================================================================================================
// D8: the voice of what the game says
// =====================================================================================================================================================
const BANNED = /\b(simply|basically|essentially|literally|incredibly|extremely|truly|obviously|of course|it is important to|it'?s important to|keep in mind|bear in mind|please note|note that|not just|isn'?t just|more than just|good luck|you'?ve got this|exciting|amazing|fantastic|wonderful|delve|welcome)\b|\blet[’']s\b/i;

test('D8: what the game says (advice, lessons, evidence, the bench, the summaries, the dial) has no filler, no question, no exclamation and no dash; a buyer\'s own lines are not held to it', () => {
  const says = new Set();
  for (const style of H.STYLES) for (const role of ['sell', 'buy']) for (let seed = 1; seed <= 24; seed++) {
    let s = H.create({ role, fair: 100, reserve: role === 'sell' ? 128 : 76, style, seed, assist: true, insight: 2, patience: 6, alt: seed % 2 ? (role === 'sell' ? 118 : 82) : null });
    const v0 = H.view(s); if (v0.advice) says.add(v0.advice.text);
    for (const act of [{ type: 'anchor', level: ['high', 'fair', 'low'][seed % 3] }, { type: 'hold' }, { type: 'leverage' }, { type: 'concede', size: 'medium' }, { type: 'split' }, { type: 'concede', size: 'large' }, { type: 'accept' }]) {
      const r = H.act(s, act); if (r.say === null) continue; s = r.state; const v = H.view(s); if (v.advice) says.add(v.advice.text); if (s.done) break;
    }
    const res = H.result(s); if (res.lesson) says.add(res.lesson.text);
  }
  for (let seed = 1; seed <= 20; seed++) {
    let s = A.create({ trueValue: 100, estimate: 90 + seed, seed, bidders: [{ style: 'steady', limit: 85 + seed }, { style: 'aggressive', limit: 120 }, { style: 'sniper', limit: 100 }], reserve: 50, increment: 5, budget: 160, assist: true });
    for (let i = 0; i < 12 && !s.done; i++) { const v = A.view(s); if (v.advice) says.add(v.advice.text); const r = A.act(s, { type: i % 5 === 4 ? 'drop' : 'bid' }); if (r.say === null) break; s = r.state; says.add(r.say); }
    says.add(A.result(s).lesson.text);
    let t = I.create({ truth: { quality: 0.6 + seed * 0.025, fake: seed % 4 === 0, defects: [{ id: 'd0', label: 'worn finish' }] }, budget: 8, accuracy: 0.5 + seed * 0.02, seed, fakeDetect: seed % 2 === 0, warned: seed % 3 === 0 });
    if (t.warning) says.add(t.warning); says.add(t.opening);
    for (const id of Object.keys(I.PROBES)) { const r = I.act(t, { type: 'probe', id }); if (r.say !== null) { says.add(r.say); t = r.state; } }
    says.add(I.act(t, { type: 'conclude' }).say);
    for (const h of P.create({ buyer: { needs: ['tool'], bias: 'utility', quirk: null }, asset: { tags: ['tool'], features: [] }, insight: seed % 6, seed }).hints) says.add(h.text);
    let f = R.create({ ops: 2, seed, assist: seed % 2 === 0 }); for (let i = 0; i < 3; i++) { const r = R.act(f, { type: seed % 3 === 0 ? 'careful' : 'stop', t: 300 + seed * 211 + i * 777 }); if (r.say !== null) { says.add(r.say); f = r.state; } }
  }
  for (const kind of Object.keys(SPECS)) for (const quick of [true, false]) {
    const g = world(['grad', 'roots']), run = start(g, SPECS[kind](g)); if (quick) run.quickAll(); else run.walkAway();
    const sm = run.finish(); for (const t of [sm.title, sm.headline, ...sm.lines, ...sm.reasons.map((x) => x.text), sm.lesson.text]) says.add(t);
    if (run.plan.cast.role === 'bench' || run.plan.cast.name === 'The auctioneer') says.add(run.plan.cast.hello); // the bench and the auctioneer are the room's voice; a buyer and a seller are characters
  }
  for (const i of [dialInfo({}), dialInfo({ dial: true }), dialInfo({ quiet: true })]) { says.add(dialEarText(i)); says.add(dialShortText(i, true)); }
  const bad = [];
  for (const t of says) { if (!t) continue; if (BANNED.test(t)) bad.push(`filler: ${t}`); if (/[?!]/.test(t)) bad.push(`question or exclamation: ${t}`); if (/[–—]/.test(t)) bad.push(`dash: ${t}`); if (/\bzone \d\b|\bfree\b/i.test(t)) bad.push(`zone or free: ${t}`); }
  assert.deepEqual(bad, []);
  assert.ok(says.size > 150, `${says.size} different lines were read`);
  // a buyer's own lines are theirs (they ask, exclaim, say "Let's"), but the stage that frames them asks and exclaims nothing
  const close = UI.closeHTML({ plan: { kind: 'sell' }, view: H.view(H.act(H.create({ role: 'sell', fair: 10, seed: 1 }), { type: 'anchor', level: 'fair' }).state), stageDone: false });
  assert.ok(!/[?!]/.test(visible(close)), 'the Close stage itself asks and exclaims nothing');
});

// =====================================================================================================================================================
// D9: the refusals the engine owns
// =====================================================================================================================================================
test('D9: a fraud you verified and a full yard are refused in the engine\'s own words, and the room says a refusal once', () => {
  const FRAUD = 'Fraud confirmed. Skip this buyer.', FULL = 'Storage is full here, counting trucks and open swaps. Sell something or ship it out.';
  const g = world(['native', 'second']), spec = sellSpec(g); leadOf(g, spec.leadId).scam = true;
  const run = start(g, spec), checked = run.verify(); assert.ok(checked.ok); assert.equal(checked.msg, FRAUD, 'it is the engine\'s own sentence'); assert.equal(run.plan.blocker, FRAUD);
  const h = sheet(run); assert.equal(h.split(FRAUD).length - 1, 1, 'the sheet says it once: not by the callout and again by the blocker'); assert.ok(/role="alert">Fraud confirmed\./.test(h), 'and an alert says it to a screen reader');
  const g2 = world(['grad', 'roots']); g2.storeCap = () => 0;
  const plan = D.planFor(g2, fixedLot(g2)); assert.equal(plan.blocker, FULL);
  const spec2 = fixedLot(g2), asked = g2.buyLot(spec2.zone, spec2.lotId, {}); assert.equal(asked.ok, false); assert.equal(asked.msg, plan.blocker, 'the planner says what the engine says when it is asked to buy');
  assert.equal(visible(sheet(start(g2, fixedLot(g2)))).split(FULL).length - 1, 1, 'a full yard is said once');
  for (const f of ['js/deal.js', 'js/ui/deal.js']) { const src = read(f); assert.ok(src.includes(FRAUD), `${f} says the engine's fraud refusal`); assert.ok(!/Extreme Asymmetric|will not take a broken asset/.test(src), `${f} names no refusal the engine has reworded`); }
  assert.ok(read('js/deal.js').includes(FULL), 'and the planner says the engine\'s full-yard refusal');
});

// =====================================================================================================================================================
// D10: the Assist box
// =====================================================================================================================================================
test('D10: the Assist box says a move and its reason, adds at most 35 words to any stage, and does not tell again what the stage prints', () => {
  const g = world(), at = (spec, assist, n = 0) => { const r = start(g, spec, { assist }); for (let i = 0; i < n; i++) { r.quick(); r.next(); } return r; };
  for (const [key, spec, n] of [['read', fixedLot(g), 0], ['pitch', sellSpec(g), 0], ['close', fixedLot(g, 3), 1], ['bid', auctionLot(g), 1], ['fix', brokenCrate(g), 0]]) {
    const off = at(spec, false, n), on = at(spec, true, n); assert.equal(on.key, key);
    const added = words(panel(on)) - words(panel(off)); assert.ok(added > 0 && added <= 35, `${key}: Assist adds ${added} words (at most 35)`);
  }
  // Close, round 0: the move, then the zone. The read of their limit and the first-number principle are printed on the stage, once, whether or not Assist is on.
  const close = at(fixedLot(g, 3), true, 1), principle = 'The first number pulls the whole talk toward it.';
  assert.equal(visible(panel(close)).split(principle).length - 1, 1, 'with Assist on, the principle is said once');
  assert.equal(visible(panel(at(fixedLot(g, 3), false, 1))).split(principle).length - 1, 1, 'and with it off');
  for (const role of ['sell', 'buy']) for (const style of H.STYLES) {
    const v = H.view(H.create({ role, fair: 100, reserve: role === 'sell' ? 125 : 78, style, seed: 4, assist: true, insight: 3, patience: 6 })), t = v.advice.text;
    assert.match(t, /^Choose (Aim high|Fair|Quick sale|Generous|Lowball) \(\$[\d,.]+\)\. That stays inside the zone of possible agreement \(ZOPA\) without insulting them\./, `${role}/${style}: the move, then the zone`);
    assert.ok(!/probably between|pulls the whole talk/.test(t), `${role}/${style}: neither the read nor the principle is told again`);
    assert.ok(!t.includes(money(v.read.lo)) && !t.includes(money(v.read.hi)), `${role}/${style}: the figures of the read are not in the box`);
  }
  // Bid: the stop, how the next bid stands to it, what a drop shows. The estimate, the rivals and their drops are printed on the stage.
  const room = (o) => A.create({ trueValue: 100, estimate: 100, reserve: 50, increment: 5, assist: true, seed: 3, bidders: [{ style: 'steady', limit: 200 }, { style: 'steady', limit: 200 }, { style: 'steady', limit: 200 }], ...o });
  const fine = A.view(room({})).advice, past = A.view(room({ estimate: 60, reserve: 70 })).advice, over = A.view(room({ budget: 52, reserve: 55 })).advice;
  assert.equal(fine.action.type, 'bid'); assert.equal(fine.text, "Stop near $95.00: your estimate less a margin for the winner's curse. The next bid, $55.00, is inside that.");
  assert.equal(past.action.type, 'drop'); assert.equal(past.text, "Stop near $57.00: your estimate less a margin for the winner's curse. The next bid, $75.00, is past that: drop.");
  assert.equal(over.action.type, 'drop'); assert.equal(over.text, "Stop near $95.00: your estimate less a margin for the winner's curse. The next bid, $60.00, is past your limit ($52.00): drop.");
  let s = room({ reserve: 40, increment: 4, bidders: [55, 64, 73, 82].map((limit, i) => ({ style: i % 2 ? 'steady' : 'sniper', limit })) }); const opens = new Set();
  for (let k = 0; k < 40 && !s.done; k++) {
    const t = A.view(s).advice.text; opens.add((/(A rival has|Rivals have) dropped near \$[\d,.]+; that is evidence\.$/.exec(t) || [, 'none'])[1]);
    for (const x of t.split(/(?<=[.:;]) /)) assert.ok(!/^\d/.test(x), `no sentence opens on a numeral: ${t}`);
    const r = A.act(s, { type: 'bid' }); if (r.say === null) break; s = r.state;
  }
  assert.deepEqual([...opens].sort(), ['A rival has', 'Rivals have', 'none'], 'a drop is said once, in words, after the stop and the next bid');
});
