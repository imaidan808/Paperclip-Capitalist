// Copy pass, part 2, package P1: the Deal Room and the skill games. The words of the stages, the result and the games keep to what the engine does, and they keep the voice of docs/COPY.md.
//   D1  the stages print no lede and stay short; what a card is (a probe, an angle) and what a figure means is said on hover, and every figure and claim a hover makes is held against the engine below
//   D2  the Read stage: the probe blurbs (cheap, best test for a counterfeit, sharpest read, second opinion, the expert) and the bar's range are what the engine does; a reading is printed once; the seller's opening says nothing about the lot
//   D3  the Pitch stage: the keenness a pitch can earn, an unbacked claim, an urgent need, the fee to verify a buyer
//   D4  the Close stage: the read of their limit, the words for their stance, what a friendly counterparty returns, the one use of the other option, the budget that leaves nothing to haggle over
//   D5  the Bid stage: the limit on a bid, what a rival's mood means, how sure an estimate is
//   D6  the Fix stage: the bill, the 60% the Assist adds to the zone, the dial tone's offer
//   D7  the result: one notation for a multiplier, headlines that do not repeat the sheet's title, the reveal's flaw count, the figures and lessons the result prints
//   D8  the voice: no filler, no question and no exclamation in what the game says (a buyer's own lines are the character's)
// Run: node --test tests/copy2-deal.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeGame } from './bot.mjs';
import { ASSETS, BUYERS } from '../js/config.js';
import { FAKE_VALUE } from '../js/market.js';
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
  for (const [key, r, max] of [['read', at(fixedLot(g)), 90], ['pitch', at(sellSpec(g)), 70], ['close', at(fixedLot(g, 3), 1), 52], ['bid', at(auctionLot(g), 1), 55], ['fix', at(brokenCrate(g)), 80]]) {
    assert.equal(r.key, key); const n = words(panel(r)); assert.ok(n <= max, `${key}: ${n} words before a press (at most ${max})`);
  }
});

test('D1: what a card is, and what a figure means, is on hover: the five probes, the five angles, the range, the opening number, the other option, the fee to verify', () => {
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
  buy.quick(); buy.next(); const close = panel(buy);
  assert.ok(titles(close).includes('Their limit is inside this range. Growth narrows it.'), 'the read of their limit');
  assert.ok(titles(close).includes('The first number pulls the whole talk toward it.'), 'the opening number');
  buy.act({ type: 'anchor', level: 'fair' });
  if (buy.plan.alt != null) assert.match(panel(buy), /data-deal="leverage"[^>]* title="Once per talk\. It counts only if it beats their offer\."/, 'the other option');
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
  assert.ok(titles(panel(start(g, sellSpec(g)))).includes('How well your goods back this claim. A claim they cannot back counts against you.'));
});

test('D3: the buyer\'s speech is printed once after a pitch, and a multiplier is written 1.12x', () => {
  const g = world(), run = start(g, sellSpec(g)); run.act({ type: 'pick', angles: ['utility', 'story'] });
  const h = sheet(run, { pick: ['utility', 'story'] });
  assert.equal(h.split(escQ(run.view().outcome.say)).length - 1, 1, 'the reaction is in the bubble and not again under the angles');
  assert.match(h, /<b>[+-]?\d\.\d\d fit\.<\/b> The buyer is \d\.\d\dx as keen\./);
  assert.ok(!/\bx\d\.\d\d\b/.test(h));
});

test('D3: an urgent need is said once, on its chip, and the engine does what the chip says; the check to verify a buyer is 1% of the budget, and a fraud is 12% of buyers', () => {
  const g = world(['grad', 'native']);
  let found = null;
  for (const z of g.s.zones) for (const lead of g.s.leads[z]) for (const a of g.s.assets.filter((x) => x.zone === z)) { const q = g.quotePitch(a.id, lead.id, undefined, { blind: true }); if (q.ok && !found) found = { a, lead }; }
  assert.ok(found, 'a crate and a lead in one district');
  const { a, lead } = found, tag = ASSETS[a.cls].tags[0], other = Object.keys(BUYERS).flatMap((id) => Object.keys(BUYERS[id].like)).find((t) => !ASSETS[a.cls].tags.includes(t));
  const base = g.quotePitch(a.id, lead.id, undefined, { blind: true }).fit;
  lead.need = tag; assert.equal(g.quotePitch(a.id, lead.id, undefined, { blind: true }).fit, 1, 'the tag the buyer needs: a perfect fit');
  lead.need = other; assert.ok(Math.abs(g.quotePitch(a.id, lead.id, undefined, { blind: true }).fit - base * 0.5) < 1e-9, 'a tag the crate lacks: half the fit');
  lead.need = tag;
  const run = start(g, { kind: 'sell', assetId: a.id, leadId: lead.id }), h = sheet(run);
  assert.ok(!/Right now they need|needs something/.test(h), 'it is not said in the bubble or under the name');
  assert.match(h, new RegExp(`<span class="chip warn" title="Needed now: a crate with this tag is a perfect fit, and one without it halves the fit\\.">${tag}</span>`), 'it is marked on its chip');
  const fee = Math.max(0.01, Math.round(lead.budget * 0.01 * 100) / 100), cash0 = g.s.cash, plan = run.plan;
  assert.ok(plan.canVerify, 'a Digital Native may verify'); assert.match(h, /<b>Scam magnet\.<\/b> Some buyers are frauds\./); assert.match(h, /title="The check costs 1% of their budget\."/);
  assert.ok(Math.abs(plan.verifyCost - fee) < 1e-9, 'the button names the fee'); assert.ok(run.verify().ok); assert.ok(Math.abs(cash0 - g.s.cash - fee) < 1e-9, 'and the engine charges it: 1% of their budget');
  assert.equal(g.P.scamRate, 0.12, 'a fraud is 12% of a Digital Native\'s buyers, as the Draft says');
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

test('D4: a buyer with under 12% of headroom has nothing to haggle over, and the card says so in the words the lessons use', () => {
  const g = world(), spec = sellSpec(g), lead = leadOf(g, spec.leadId), raw = D.planFor(g, spec).raw;
  lead.budget = raw * 1.11; assert.equal(D.planFor(g, spec).capped, true, 'a budget 11% over the price is spent');
  lead.budget = raw * 1.13; assert.equal(D.planFor(g, spec).capped, false, 'one 13% over is not');
  lead.budget = raw * 1.11;
  const r = start(g, spec); r.quick(); r.next();
  assert.match(panel(r), /<div class="callout">Their budget is nearly spent at the fair price: nothing to haggle over\.<\/div>/);
});

// =====================================================================================================================================================
// D5: the Bid stage
// =====================================================================================================================================================
const bidView = (o = {}) => ({ estimate: 100, opening: 60, price: 130, nextBid: 140, budget: 135, high: 'Marla', youHigh: false, rivals: [], events: [], actions: [{ type: 'drop' }], done: false, increment: 10, round: 3, yourTurn: true, ...o });

test('D5: the limit on a bid is 1.4x the guide price or your cash, whichever is less, and the callout says "limit"', () => {
  const g = world(), spec = auctionLot(g), lot = g.s.lots[6].find((l) => l.id === spec.lotId);
  assert.ok(Math.abs(D.auctionParams(g, 6, lot).budget - Math.min(lot.price * 1.4, g.s.cash)) < 1e-9, 'rich: 1.4x the guide price');
  g.s.cash = lot.price * 1.1; assert.ok(Math.abs(D.auctionParams(g, 6, lot).budget - g.s.cash) < 1e-9, 'short of cash: your cash');
  const h = UI.bidHTML({ plan: { lot: { price: 100, mode: 'auction' } }, view: bidView(), stageDone: false });
  assert.match(h, /<div class="callout warn" title="Your limit is 1\.4x the guide price, or your cash if that is less\.">The next bid is past your limit\. You can only drop out\.<\/div>/);
  assert.ok(!/past your budget/.test(h));
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
  assert.match(h, /<p class="small" title="Rivals bid on estimates of their own, and the highest guess usually wins\. Yours is a guess too, sharper with Capital Sourcing and a good read\.">Your estimate: <b>\$100<\/b>\.<\/p>/);
  assert.ok(!/\(it could be off\)|Opening bid|held by/.test(h));
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

test('D7: the reveal counts the flaws a lot had and the ones you found, and "worth minus price" is the engine\'s sum', () => {
  const g = world(['grad', 'roots']), lot = g.s.lots[4].find((l) => l.mode === 'fixed');
  lot.truth = { q: 0.83, fake: false, defects: ['worn finish', 'loose fittings', 'faded markings'].map((label, i) => ({ id: 'd' + i, label })) };
  const run = start(g, { kind: 'buy', zone: 4, lotId: lot.id });
  run.act({ type: 'probe', id: 'look' }); run.act({ type: 'conclude' }); run.next(); run.quick();
  const secret = run.secret(), worth = run.worth(secret), sm = run.finish(), h = sheet(run), found = sm.reveal.found;
  assert.equal(sm.reveal.total, 3);
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
