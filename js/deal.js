// The Deal Room's glue (docs/V2_DESIGN.md section 6): pure, no DOM, fully deterministic.
// It turns engine state (the player's Backgrounds and skills, a lot, a buyer, a crate) into the parameters of the mini-games in js/play/*,
// remembers what each stage returned (a DealRun), combines the results into the engine's `deal` object and, at the end, calls the engine.
// js/ui/deal.js only draws what modelOf() says and forwards clicks; everything that can be wrong is here, where it can be tested.
//
// Two rules hold everywhere:
//  * HIDDEN TRUTH STAYS HIDDEN. A lot's truth (quality, counterfeit, flaws), a lead's scam flag and every game's own state live inside the run.
//    modelOf() gives the screen game view()s with their `reveal` removed, never a state. summarize() reveals only after the deal is over.
//  * QUICK IS PAR. Every stage has autoplay(params, 0.5); a player who only ever presses Quick plays about the economy the bot was balanced on.
import { ASSETS, BUYERS, ZONES, ECON } from './config.js';
import { hash, hash01 } from './rng.js';
import { clamp, fitLabel, FAKE_VALUE } from './market.js';
import * as inspect from './play/inspect.js';
import * as pitch from './play/pitch.js';
import * as repair from './play/repair.js';

// Haggle and Auction arrive from their own branch; until both are merged the glue still loads and those two stages simply do not exist.
const optional = async (name) => { try { return await import(`./play/${name}.js`); } catch { return null; } };
export const GAMES = { inspect, pitch, repair, haggle: await optional('haggle'), auction: await optional('auction') };

export const QUICK = 0.5, EXPERT = 1;
export const STAGE_LABEL = { read: 'Read', pitch: 'Pitch', close: 'Close', bid: 'Bid', fix: 'Fix' };
const GAME_OF = { read: 'inspect', pitch: 'pitch', close: 'haggle', bid: 'auction', fix: 'repair' };
const STYLES = ['hard', 'friendly', 'impulsive', 'analytical'];
const fail = (msg) => ({ ok: false, msg });
const fin = (x, d = 0) => (Number.isFinite(x) ? x : d);
const r2 = (x) => Math.round(fin(x) * 100) / 100;
const money = (x) => { x = fin(x); const v = Math.abs(x), s = x < 0 ? '-' : ''; return v < 100 ? `${s}$${v.toFixed(2)}` : `${s}$${Math.round(v).toLocaleString('en-US')}`; };
const pctOf = (x) => `${Math.round(fin(x) * 100)}%`;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** Deterministic from the game seed, the ids and the hour: opening the same deal twice in one hour replays it exactly. */
export function seedFor(g, spec) {
  const ids = spec.kind === 'sell' ? `${spec.assetId}>${spec.leadId}` : spec.kind === 'buy' ? `${spec.zone}:${spec.lotId}` : `${spec.assetId}`;
  return hash(`${g.s.seed}|deal|${spec.kind}|${ids}|${g.s.hour}`) >>> 0;
}
export const stageSeed = (seed, key) => hash(`${seed}|${key}`) >>> 0;

/** Growth buys insight (0..5): how many hints about a buyer, and how sharp a read on their limit. */
export const insightOf = (g) => clamp(Math.floor(g.lvl('growth') * TUNE.insight), 0, 5);
const needsOf = (seg, need) => {
  const liked = Object.entries(BUYERS[seg].like).filter(([, w]) => w >= 0.5).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  return [...new Set([...(need ? [need] : []), ...liked])].slice(0, 4);
};

// ------------------------------------------------------------------ the people in the room
const SELLER_NAMES = ['Marek', 'Ines', 'Bo', 'Okafor', 'Rue', 'Kit', 'Dev', 'Marla'];
const SELLER_BASE_PATIENCE = { hard: 4, friendly: 6, impulsive: 4, analytical: 5 };
const SELLER_KIND = {
  hard: { icon: '🧔', title: 'hard-nosed dealer', hello: 'The {a} is {p}. That is the price, and I have heard every trick.' },
  friendly: { icon: '👵', title: 'friendly stallholder', hello: 'Ah, a customer! The {a} is {p}, and I am sure we can work something out.' },
  impulsive: { icon: '🧒', title: 'excitable trader', hello: 'That {a}? {p}! I have a feeling about you. Make me an offer!' },
  analytical: { icon: '🧐', title: 'careful appraiser', hello: 'Listed at {p}. I know what a {a} goes for, so do not expect a miracle.' },
};
export function sellerFor(seed, assetName, price) {
  const style = STYLES[hash(seed + '|style') % 4], k = SELLER_KIND[style];
  return { style, icon: k.icon, name: `${SELLER_NAMES[hash(seed + '|name') % SELLER_NAMES.length]}, ${k.title}`, patience: SELLER_BASE_PATIENCE[style], hello: k.hello.replace('{a}', assetName).replace('{p}', money(price)) };
}

// ------------------------------------------------------------------ parameter builders
/** Inspect: the lot's hidden truth, scarce probes (Ops), accuracy (Ops, Seasoned Pro), the Second-Chance gut feeling, and an honest prior. */
export function inspectParams(g, zone, lot, { seed } = {}) {
  const t = g.lotTruth(zone, lot.id), ops = g.lvl('ops'), P = g.P, early = zone <= 2;
  const rate = lot.cond === 'ok' ? clamp((ZONES[zone].rules.fakes || 0) * (ASSETS[lot.cls].fakeRisk ?? 1), 0, 0.6) : 0;
  return {
    truth: { quality: t.q, fake: !!t.fake, defects: t.defects },
    budget: 3 + Math.floor(ops / 2) + (P.probeBonus || 0),
    accuracy: clamp(0.45 + 0.07 * ops + 0.05 * (P.inspectBonus || 0), 0.3, 0.95),
    fakeDetect: !!P.fakeDetect,
    prior: { quality: early ? 1.0 : 0.925, sd: early ? 0.09 : 0.13, fake: Math.max(0.005, rate) }, // what a stranger would guess about a lot like this one
    seed: seed ?? stageSeed(seedFor(g, { kind: 'buy', zone, lotId: lot.id }), 'read'),
  };
}

/** Pitch: the buyer's needs and bias (the quirk is the person's, stable for this lead), the asset's tags, Growth as insight. */
export function pitchParams(g, asset, lead, { seed } = {}) {
  const B = BUYERS[lead.seg];
  const quirk = hash01(lead.id + '|quirk') < 0.4 ? pitch.quirkFor(hash(lead.id + '|q')) : null;
  return { buyer: { needs: needsOf(lead.seg, lead.need), bias: B.bias, quirk }, asset: { tags: [...ASSETS[asset.cls].tags], features: [] }, insight: insightOf(g),
    seed: seed ?? stageSeed(seedFor(g, { kind: 'sell', assetId: asset.id, leadId: lead.id }), 'pitch') };
}

/** Haggle. role 'sell': `lead` (budget) and `buyer` (style, patience) are given and the reserve is what the buyer can pay.
 *  role 'buy': `lot` is given and the seller's minimum is 72-90% of the posted price. `fair` is always the Quick price. */
export function haggleParams(g, o) {
  const P = g.P, u = hash01(`${o.seed}|reserve`);
  const style = STYLES.includes(o.style) ? o.style : o.buyer?.style || 'friendly';
  const base = o.buyer ? o.buyer.patience : o.patience ?? SELLER_BASE_PATIENCE[style];
  const rule = o.zone != null && ZONES[o.zone]?.rules?.haggle ? 1 : 0; // Flea Market stalls: every deal bargains, with a friendly start
  const fair = Math.max(1e-6, fin(o.fair, 1));
  const reserve = o.role === 'buy' ? (o.lot ? o.lot.price : fair) * (0.72 + 0.18 * u) : Math.min(o.lead ? o.lead.budget : Infinity, fair * (1.1 + 0.25 * u) * (1 + TUNE.warm * ((o.warmth || 1) - 1)));
  return { role: o.role === 'buy' ? 'buy' : 'sell', fair, reserve, style, patience: base + rule, handicap: P.haggleHandicap || 0, insight: insightOf(g),
    alt: o.alt > 0 ? o.alt : null, assist: !!o.assist || (P.haggleAssist || 0) > 0, seed: o.seed };
}

/** A buyer whose budget has less than 12% of headroom over the fair price has nothing to negotiate with: the sale goes through at the fair price. */
const TIGHT = 1.12;
/** Balance knobs (mutable on purpose, like config's ECON): the guide price is `guide` of what the lot looks worth, and the room bids `rival` of that. */
export const TUNE = { guide: 0.8, rival: 0.85, insight: 0.65, warm: 2 };
const describedValue = (lot) => lot.price / TUNE.guide;
/** Auction: rivals who see only what the lot looks like (so they cannot spot a counterfeit), a guide price that bounds the engine's 0.6-1.4 band,
 *  and YOUR estimate: noisier without Capital Sourcing, and pulled toward what you learned if you read the lot first. */
export function auctionParams(g, zone, lot, { read = null, assist = false, seed } = {}) {
  const sd = seed ?? stageSeed(seedFor(g, { kind: 'buy', zone, lotId: lot.id }), 'bid');
  const t = g.lotTruth(zone, lot.id), M = describedValue(lot), early = zone <= 2, qbar = early ? 1.0 : 0.925, fintech = g.lvl('fintech');
  const rivals = clamp(2 + Math.floor(zone / 4), 2, 5);
  const gaussU = (tag) => Math.sqrt(-2 * Math.log(Math.max(hash01(`${sd}|${tag}a`), 1e-9))) * Math.cos(2 * Math.PI * hash01(`${sd}|${tag}b`));
  const sdEst = clamp(0.18 - 0.012 * (fintech - 1), 0.08, 0.18);
  const looks = M * qbar, own = Math.max(0.1 * looks, looks * (1 + sdEst * gaussU('est')));
  let estimate = own;
  if (read && read.estimate) { // what Read taught you: expected worth under your belief, trusted as far as the evidence stood
    const q = read.estimate.quality, p = read.estimate.fakeProb, w = clamp(0.25 + 0.6 * fin(read.confidence), 0, 0.85);
    estimate = (1 - w) * own + w * M * (q * (1 - p) + FAKE_VALUE * p);
  }
  const rivalNoise = 0.15, field = GAMES.auction.field({ trueValue: looks * TUNE.rival, rivals, noise: rivalNoise, seed: sd, reserve: lot.price * 0.6, increment: lot.price / 20 });
  return { estimate: Math.max(0.01, estimate), trueValue: Math.max(0.01, M * (t.fake ? FAKE_VALUE : t.q)), reserve: lot.price * 0.6, increment: lot.price / 20, bidders: field.bidders,
    budget: Math.max(0.01, Math.min(lot.price * 1.4, g.s.cash)), assist: !!assist, seed: sd };
}

/** Repair: Ops sets the width of the sweet spot. */
export function repairParams(g, asset, { assist = false, seed } = {}) {
  return { ops: g.lvl('ops'), difficulty: 1, assist: !!assist, careful: false, seed: seed ?? stageSeed(seedFor(g, { kind: 'repair', assetId: asset.id }), 'fix') };
}

/** What the engine will pay at mult 1, before its cap at the buyer's budget. quotePitch refuses a counterfeit with price 0, so the formula is rebuilt from its parts. */
export function rawPrice(q) {
  const p = q.parts;
  return p.ref * p.term * p.base * ECON.pitchK * p.cm * p.growth * p.hustle * (q.lead.need ? p.quality : 1);
}

/** The stage results to the engine's `deal` object, or null when there is no deal (a walk, a lost auction, a buyer who left). */
export function dealFrom(kind, res = {}) {
  if (kind === 'repair') {
    const r = res.fix;
    return r ? { qualityMult: clamp(fin(r.qualityMult, 1), 0.85, 1.15), costMult: clamp(fin(r.costMult, 1), 0.9, 1.3), precision: clamp(fin(r.precision, 0.5), 0, 1) } : { qualityMult: 1, costMult: 1, precision: 0.5 };
  }
  const side = res.close || res.bid;
  if (side && (side.deal === false || side.won === false)) return null;
  const pm = kind === 'sell' && res.pitch ? fin(res.pitch.mult, 1) : 1;
  return { mult: clamp(side && !side.skipped ? fin(side.mult, 1) : pm, 0.6, 1.4) };
}

const FIX_ADVICE = { text: 'Aim for the middle of the green zone: the nearer the centre, the more precise the step. Assist has widened the zone for you.' };
/** The angle/price pair a coach would suggest from what the player is allowed to see (Assist). */
export function pitchAdvice(view) {
  if (!view || !Array.isArray(view.angles)) return null;
  const feat = Object.fromEntries(view.angles.map((a) => [a, 0]));
  for (const f of view.asset?.features || []) feat[f.angle] = Math.max(feat[f.angle] || 0, f.strength);
  const likely = view.likely?.angles || [], temper = (view.hints || []).find((h) => h.kind === 'temper')?.angles || [], qa = (view.hints || []).find((h) => h.kind === 'quirk-angle');
  const score = (a) => (likely.includes(a) ? 1 / Math.sqrt(likely.length) : 0) + (temper.includes(a) ? 0.3 : 0) + 0.9 * feat[a] + (qa && qa.angle === a ? qa.sign * 0.8 : 0);
  const best = [...view.angles].sort((a, b) => score(b) - score(a)).slice(0, 2);
  return { angles: best, text: `Try ${best[0]} with ${best[1]}: the buyer leans that way and your goods can back it up.` };
}
/** The next probe worth its price (Assist), from view() only. */
export function inspectAdvice(view) {
  if (!view || !view.probes) return null;
  const can = (id) => view.probes.find((p) => p.id === id && p.affordable), p = view.belief?.fakeProb ?? 0.2;
  const pick = (p > 0.08 && p < 0.92 && can('serial') && 'serial') || (view.doubt > 0.08 && can('power') && 'power') || (can('papers') && 'papers') || (can('look') && 'look') || (can('serial') && 'serial') || (can('power') && 'power') || null;
  const why = { serial: 'The serial check is the best test for a counterfeit.', power: 'Powering it up is the sharpest read on condition.', papers: 'Paperwork is a cheap second opinion on both.', look: 'A look is cheap and catches obvious wear.' };
  return pick ? { probe: pick, text: why[pick] } : { probe: null, text: 'You have what the budget can buy. Decide.' };
}

/** The slider position (0..1) to a time in ms that the repair dial would show it at: the reduced-motion dial stops at what the player set. */
export function tForPos(x, step, seed) {
  let bt = 0, bd = Infinity;
  for (let t = 0; t <= 24000; t += 2) { const d = Math.abs(repair.pos(t, step, seed) - x); if (d < bd) { bd = d; bt = t; if (d < 0.0015) break; } }
  return bt;
}

// ------------------------------------------------------------------ planning: everything public about a deal, before it starts
export function planFor(g, spec) {
  if (!spec || !['sell', 'buy', 'repair'].includes(spec.kind)) return fail('Unknown deal.');
  return spec.kind === 'sell' ? planSell(g, spec) : spec.kind === 'buy' ? planBuy(g, spec) : planRepair(g, spec);
}
const leadOf = (g, id) => { for (const z of g.s.zones) { const l = (g.s.leads[z] || []).find((x) => x.id === id); if (l) return l; } return null; };
const lotOf = (g, zone, id) => (g.s.lots[zone] || []).find((l) => l.id === id) || null;
const zoneFace = (z) => ({ id: z, name: ZONES[z].name, short: ZONES[z].short, icon: ZONES[z].icon, palette: ZONES[z].palette, teaches: ZONES[z].teaches });
const aName = (a) => `${ASSETS[a.cls].name}${a.cond === 'broken' ? ' (broken)' : ''}`;

function planSell(g, spec) {
  const s = g.s, a = s.assets.find((x) => x.id === spec.assetId);
  if (!a) return fail('Pick one of your crates first.');
  const lead = leadOf(g, spec.leadId);
  if (!lead) return fail('That buyer has left.');
  const q = g.quotePitch(a.id, lead.id, undefined, { blind: true }); // the screen may only know what the player may know
  if (!q.ok) return fail(q.msg);
  const seed = seedFor(g, spec), B = BUYERS[lead.seg], raw = rawPrice(q), fair = Math.min(raw, lead.budget), capped = raw >= lead.budget / TIGHT;
  let alt = 0; // another buyer in the room is your alternative (BATNA): the best offer that is a real competitor, not a different league
  for (const l of s.leads[lead.zone] || []) {
    if (l.id === lead.id) continue;
    const o = g.quotePitch(a.id, l.id, undefined, { blind: true }), p = o.ok && !o.rejected ? Math.min(rawPrice(o), l.budget) : 0;
    if (p >= fair * 0.8 && p <= fair * 1.3) alt = Math.max(alt, p);
  }
  const blocker = q.fit < 0.15 ? `${B.name} has almost no use for ${ASSETS[a.cls].name}. Pick a buyer who needs it.` : lead.verified && lead.scam ? 'Fraud confirmed. Skip this buyer.' : '';
  const stages = [{ key: 'pitch' }];
  if (GAMES.haggle) stages.push(capped ? { key: 'close', auto: 'Their budget is nearly spent at the fair price, so there is nothing to haggle over.' } : { key: 'close' });
  return {
    ok: true, kind: 'sell', seed, zone: lead.zone, zoneFace: zoneFace(lead.zone), stages, blocker, fair, raw, capped, budget: lead.budget, alt: alt || null,
    asset: { id: a.id, cls: a.cls, name: aName(a), icon: ASSETS[a.cls].icon, cond: a.cond },
    lead: { id: lead.id, seg: lead.seg, budget: lead.budget, need: lead.need || null, verified: !!lead.verified, ...(lead.verified ? { scam: !!lead.scam } : {}), exp: lead.exp },
    cast: { icon: B.icon, name: B.name, hello: lead.need ? `${B.hello} (Right now they need something ${lead.need}.)` : B.hello, style: B.style, role: 'buyer' },
    buyer: { id: lead.seg, name: B.name, style: B.style, patience: B.patience, bias: B.bias },
    quote: { fit: q.fit, fitLabel: fitLabel(q.fit), cm: q.ci.cm, band: { id: q.ci.band.id, label: q.ci.band.label }, S: q.ci.S, fmv: q.fmv },
    verifyCost: Math.max(0.01, r2(lead.budget * 0.01)), canVerify: !lead.verified && !!(g.P.scamRate || 0),
  };
}

function planBuy(g, spec) {
  const s = g.s, lot = lotOf(g, spec.zone, spec.lotId);
  if (!lot) return fail('That lot is gone.');
  const seed = seedFor(g, spec), def = ASSETS[lot.cls], auction = lot.mode === 'auction' && !!GAMES.auction, name = `${def.name}${lot.cond === 'broken' ? ' (broken)' : ''}`;
  const held = s.assets.filter((x) => x.zone === spec.zone).length + s.freight.reduce((n, f) => n + (f.to === spec.zone ? f.items.length : 0), 0) + s.escrow.reduce((n, e) => n + e.assets.filter((x) => x.zone === spec.zone).length, 0);
  const lowest = r2(lot.price * 0.6);
  const blocker = s.cash < lowest ? `You need at least ${money(lowest)} to deal for this lot, and you have ${money(s.cash)}.` : held >= g.storeCap(spec.zone) ? 'Storage is full here. Sell something or ship it out first.' : '';
  const seller = auction
    ? { style: 'steady', icon: '🔨', name: 'The auctioneer', patience: 5, hello: `Lot up for bids: the ${name}. Guide price ${money(lot.price)}, opening at ${money(lot.price * 0.6)}.` }
    : sellerFor(seed, name, lot.price);
  let alt = 0; // another lot of the same kind on the shelf is your alternative
  for (const l of s.lots[spec.zone] || []) if (l.id !== lot.id && l.cls === lot.cls && l.mode !== 'auction') alt = alt ? Math.min(alt, l.price) : l.price;
  const stages = [{ key: 'read' }];
  if (auction) stages.push({ key: 'bid' }); else if (GAMES.haggle) stages.push({ key: 'close' });
  return {
    ok: true, kind: 'buy', seed, zone: spec.zone, zoneFace: zoneFace(spec.zone), stages, blocker, fair: lot.price, auction, lowest, alt: alt && alt <= lot.price * 1.3 ? alt : null,
    lot: { id: lot.id, cls: lot.cls, name, icon: def.icon, cond: lot.cond, price: lot.price, mode: auction ? 'auction' : 'fixed' },
    cast: { icon: seller.icon, name: seller.name, hello: seller.hello, style: seller.style, role: 'seller' }, seller,
  };
}

function planRepair(g, spec) {
  const a = g.s.assets.find((x) => x.id === spec.assetId);
  if (!a) return fail('Pick one of your crates first.');
  const q = g.repairQuote(a.id);
  if (!q.ok) return fail(q.msg);
  const seed = seedFor(g, spec), most = q.cost * 1.3;
  return {
    ok: true, kind: 'repair', seed, zone: a.zone, zoneFace: zoneFace(a.zone), stages: [{ key: 'fix' }], fair: q.cost,
    blocker: g.s.cash < q.cost * 0.9 ? `The cheapest repair is ${money(q.cost * 0.9)} and you have ${money(g.s.cash)}.` : '',
    asset: { id: a.id, cls: a.cls, name: aName(a), icon: ASSETS[a.cls].icon, cond: a.cond },
    quote: { cost: r2(q.cost), most: r2(most), before: r2(q.before), after: r2(q.after), quality: q.quality },
    cast: { icon: '🔧', name: 'The repair bench', hello: 'Three steps: strip, fit, tune. Steady hands pay for themselves; rushed ones cost twice.', style: 'steady', role: 'bench' },
  };
}

// ------------------------------------------------------------------ a deal in progress
export class DealRun {
  constructor(g, spec, plan, { assist = false } = {}) {
    Object.assign(this, { ok: true, g, spec, plan, assist: !!assist, stages: plan.stages, idx: 0, st: {}, res: {}, says: [], over: false, summary: null, cmp: null, acted: false, walked: false });
    this.enter();
  }
  get key() { return this.over ? 'result' : this.stages[this.idx].key; }
  gameOf(key) { return GAMES[GAME_OF[key]]; }
  lot() { return this.plan.kind === 'buy' ? lotOf(this.g, this.plan.zone, this.plan.lot.id) : null; }

  /** The parameters of a stage. `read` is the Read result the Bid stage should lean on. */
  paramsFor(key, read = this.res.read, prior = this.res) {
    const { g, plan } = this, sd = stageSeed(plan.seed, key);
    switch (key) {
      case 'read': return inspectParams(g, plan.zone, this.lot(), { seed: sd });
      case 'pitch': return (this.pp ||= pitchParams(g, g.s.assets.find((a) => a.id === plan.asset.id), leadOf(g, plan.lead.id), { seed: sd })); // kept: the crate and the lead are gone once the deal is done
      case 'close': return plan.kind === 'sell'
        ? haggleParams(g, { role: 'sell', fair: plan.fair, buyer: plan.buyer, lead: { budget: plan.budget }, zone: plan.zone, alt: plan.alt, assist: this.assist, warmth: prior.pitch ? prior.pitch.mult : 1, seed: sd })
        : haggleParams(g, { role: 'buy', fair: plan.fair, lot: { price: plan.lot.price }, style: plan.seller.style, patience: plan.seller.patience, zone: plan.zone, alt: plan.alt, assist: this.assist, seed: sd });
      case 'bid': return auctionParams(g, plan.zone, this.lot(), { read, assist: this.assist, seed: sd });
      case 'fix': return repairParams(g, g.s.assets.find((a) => a.id === plan.asset.id), { assist: this.assist, seed: sd });
      default: return {};
    }
  }
  /** Create the current stage's game (or settle it automatically when there is nothing to play). */
  enter() {
    const key = this.key, stage = this.stages[this.idx];
    if (this.res[key] || this.st[key] || this.plan.blocker) return;
    if (stage.auto) { this.res[key] = { done: true, skipped: true, deal: true, mult: 1, score: 1, note: stage.auto }; return; }
    const G = this.gameOf(key);
    this.st[key] = G.create(this.paramsFor(key));
    if (this.st[key].done) this.res[key] = this.tag(key, G.result(this.st[key]));
  }
  tag(key, r) { // a Bid result also says what share of the guide price it was
    if (key === 'bid') return { ...r, mult: r.won && this.plan.lot.price > 0 ? r.price / this.plan.lot.price : null };
    return r;
  }
  say(text, key) { if (text) this.says.push({ key, text }); if (this.says.length > 12) this.says.shift(); }
  lastSay() { return this.says.length ? this.says[this.says.length - 1].text : ''; }

  setAssist(on) {
    this.assist = !!on;
    for (const k of ['close', 'bid']) if (this.st[k]) this.st[k] = { ...this.st[k], assist: this.assist || (k === 'close' && (this.g.P.haggleAssist || 0) > 0) };
    if (this.st.fix) this.st.fix = { ...this.st.fix, assist: this.assist, half: repair.zoneHalf(this.st.fix.ops, this.st.fix.difficulty, this.assist) };
  }
  view() {
    const st = this.st[this.key];
    if (!st) return null;
    const { reveal, ...rest } = this.gameOf(this.key).view(st); // the truth waits for summarize()
    return rest;
  }
  act(action) {
    const key = this.key, st = this.st[key];
    if (!st || this.res[key] || this.over || this.plan.blocker) return { ok: false };
    const G = this.gameOf(key), r = G.act(st, action);
    if (r.say === null) return { ok: false };
    this.st[key] = r.state; this.acted = true; this.say(r.say, key);
    if (r.done) this.res[key] = this.tag(key, G.result(r.state));
    return { ok: true, say: r.say, done: !!r.done };
  }
  stageDone(key = this.key) { return !!this.res[key]; }
  /** Play the current stage at `skill` from its start, with the same parameters and seed. */
  quick(skill = QUICK) {
    const key = this.key;
    if (this.over || this.res[key] || this.plan.blocker) return false;
    if (this.stages[this.idx].auto) { this.enter(); return true; }
    const out = this.gameOf(key).autoplay(this.paramsFor(key), skill);
    this.res[key] = this.tag(key, { ...out, quick: true }); this.st[key] = null;
    const last = out.log && out.log.length ? out.log[out.log.length - 1].say : '';
    this.say(last, key);
    return true;
  }
  next() {
    if (this.over || !this.res[this.key] || this.idx >= this.stages.length - 1) return false;
    this.idx++; this.enter();
    return true;
  }
  ready() { return this.stages.every((s) => this.res[s.key]); }
  quickAll(skill = QUICK) {
    for (let i = 0; i < 8 && !this.over; i++) { if (!this.res[this.key]) this.quick(skill); if (!this.next()) break; }
    return this.ready();
  }
  /** Leave the table. What the player already learned is kept (a read that has probes in it is concluded and recorded). */
  walkAway() {
    if (this.key === 'read' && this.st.read && !this.res.read && this.st.read.used.length) this.act({ type: 'conclude' });
    this.walked = true;
    return this.finish();
  }

  /** Pay the small fee to check a buyer before you ship (the Digital Native's scam magnet). The answer joins the public plan. */
  verify() {
    const p = this.plan;
    if (p.kind !== 'sell') return fail('There is nobody to verify here.');
    const r = this.g.verifyLead(p.lead.id);
    if (r.ok) { Object.assign(p.lead, { verified: true, scam: !!r.scam }); p.canVerify = false; if (r.scam) p.blocker = 'Fraud confirmed. Skip this buyer.'; }
    return r;
  }

  // ---- the comparison: the same deal played at average skill and at expert skill, never touching the engine
  simulate(skill) {
    const { g, plan } = this, res = {};
    for (const stage of this.stages) {
      const key = stage.key;
      if (stage.auto) { res[key] = { skipped: true, deal: true, mult: 1 }; continue; }
      res[key] = this.tag(key, this.gameOf(key).autoplay(this.paramsFor(key, res.read, res), skill));
    }
    return { res, ...this.outcomeOf(res, skill >= 0.75) };
  }
  /** Money terms of a set of stage results, read from the engine's own quotes. */
  outcomeOf(res, discerning = false) {
    const { g, plan } = this, deal = dealFrom(plan.kind, res);
    if (plan.kind === 'sell') {
      if (!deal) { // walking to a real alternative is a sale elsewhere
        const c = res.close;
        return c && c.walkedToAlt && c.altPrice ? { done: true, price: c.altPrice, mult: c.altPrice / plan.fair, net: c.altPrice, viaAlt: true } : { done: false, price: 0, mult: null, net: 0 };
      }
      const q = g.quotePitch(plan.asset.id, plan.lead.id, deal), sold = q.ok && !q.rejected;
      return { done: sold, price: sold ? q.price : 0, mult: deal.mult, net: sold ? q.received : 0 };
    }
    if (plan.kind === 'repair') {
      const q = g.repairQuote(plan.asset.id, deal);
      return { done: q.ok, price: q.ok ? q.cost : 0, mult: deal.costMult, net: q.ok ? q.after - q.before - q.cost : 0 };
    }
    const lot = this.lot(); if (!lot) return { done: false, price: 0, mult: null, net: 0 };
    let buy = !!deal, price = 0;
    if (deal) price = g.buyQuote(plan.zone, lot.id, deal).price;
    if (buy && discerning && res.read && res.read.estimate) { // an expert acts on the read: no deal when expected worth < price
      const t = res.read.estimate, ev = (1 - t.fakeProb) * this.worth({ q: t.quality, fake: false }) + t.fakeProb * this.worth({ q: 1, fake: true });
      if (ev < price) buy = false;
    }
    const secret = this.secret();
    return { done: buy, price: buy ? price : 0, mult: buy ? deal.mult : null, net: buy ? this.worth(secret) - price : 0 };
  }
  secret() { return this.plan.kind === 'buy' ? this.g.lotTruth(this.plan.zone, this.plan.lot.id) : null; }
  worth(t) { const lot = this.lot(), p = this.plan; return this.g.val({ cls: p.lot.cls, cond: lot ? lot.cond : p.lot.cond, quality: 1, wear: 1, zone: p.zone, known: true, truth: { q: t.q ?? t.quality ?? 1, fake: !!t.fake } }); }
  compare() { return this.cmp ||= { quick: this.simulate(QUICK), expert: this.simulate(EXPERT) }; }

  // ---- the end: the only place a run calls the engine
  finish() {
    if (this.over) return this.summary;
    const { g, plan } = this, s = g.s, before = { xp: s.xp, cash: s.cash, streak: s.streak };
    const cmp = this.compare(), secret = this.secret(), res = this.res;
    let r = null, deal = this.walked ? null : dealFrom(plan.kind, res), noDeal = !deal;
    // Every game the player finishes is recorded once (XP, the debrief's per-game stats and the quest events); `quick` says whether Quick played it.
    const done = (k) => res[k] && res[k].done && !res[k].skipped, q = (k) => !!(res[k] && res[k].quick);
    if (plan.kind === 'buy') {
      if (done('read') && (q('read') || res.read.spent > 0)) g.recordInspect(plan.zone, plan.lot.id, { ...res.read, quick: q('read') }); // reading nothing earns nothing
      if (done('close') && res.close.rounds > 0) g.recordPlay('haggle', { ...res.close, role: 'buy', quick: q('close') });
      if (done('bid') && res.bid.rounds > 0) g.recordPlay('auction', { ...res.bid, quick: q('bid') });
      if (res.bid && res.bid.won === false) g.passLot(plan.zone, plan.lot.id, `You dropped out of the auction for the ${plan.lot.name}.`);
      else if (deal) r = g.buyLot(plan.zone, plan.lot.id, deal);
    } else if (plan.kind === 'sell') {
      if (done('pitch')) g.recordPlay('pitch', { score: res.pitch.score, quick: q('pitch') });
      if (done('close') && res.close.rounds > 0) g.recordPlay('haggle', { ...res.close, role: 'sell', quick: q('close') });
      if (deal) r = g.pitch(plan.asset.id, plan.lead.id, deal);
    } else {
      r = g.repair(plan.asset.id, deal);
      if (r.ok && done('fix')) g.recordPlay('repair', { score: res.fix.score, quick: q('fix') });
    }
    this.over = true; this.deal = deal;
    const after = { xp: s.xp, cash: s.cash, streak: s.streak };
    this.summary = summarize(this, { r, deal, noDeal, before, after, cmp, secret });
    return this.summary;
  }
}

/** Open a run for a spec. `ok:false, msg` when the deal cannot start (the crate is sold, the buyer has left). */
export function startRun(g, spec, opts = {}) {
  const plan = planFor(g, spec);
  return plan.ok ? new DealRun(g, spec, plan, opts) : plan;
}

// ------------------------------------------------------------------ the end of a deal: what you got, why, what Quick would have got, and the lesson
const ANGLE_WORD = { prestige: 'prestige', utility: 'utility', scarcity: 'scarcity', price: 'price', story: 'story' };
function pitchReveal(run) { // rebuild the (deterministic) pitch game to read its reveal once the pick is final
  const r = run.res.pitch; if (!r || !r.pick) return null;
  const params = run.paramsFor('pitch'), v = pitch.view(pitch.act(pitch.create(params), { type: 'pick', angles: r.pick }).state);
  return v.reveal || null;
}
function readLine(run, secret) {
  const r = run.res.read; if (!r || !r.estimate) return null;
  const e = r.estimate, truthQ = Math.round(secret.q * 100), found = (r.defects || []).length, total = secret.defects.length;
  return { estimate: `${pctOf(e.quality)} condition, ${pctOf(e.fakeProb)} chance of counterfeit`, truth: `${truthQ}% condition, ${secret.fake ? 'counterfeit' : 'genuine'}`, found, total };
}

function summarize(run, { r, deal, noDeal, before, after, cmp, secret }) {
  const { plan, res } = run, kind = plan.kind;
  const xp = Math.max(0, after.xp - before.xp), reasons = [], lines = [];
  const out = { ok: true, kind, tone: 'info', title: '', headline: '', lines, reasons, reveal: null, xp, streak: after.streak, numbers: null, lesson: null, quick: false, engineMsg: r ? r.msg : '' };
  out.quick = run.stages.every((s) => res[s.key] && (res[s.key].quick || res[s.key].skipped));
  const side = (c) => (c.done ? r2(c.price) : null); // null: that way of playing does not buy or sell at all (it walks away)
  const compare = (you, unit, better, extra = {}) => ({ unit, better, you: you == null ? null : r2(you), quick: side(cmp.quick), expert: side(cmp.expert), quickNet: r2(cmp.quick.net), expertNet: r2(cmp.expert.net), expertVia: cmp.expert.viaAlt ? 'another buyer' : null, ...extra });

  if (kind === 'sell') {
    const hag = res.close && !res.close.skipped ? res.close : null, pk = res.pitch;
    if (pk && pk.pick) reasons.push({ label: 'Pitch', text: `You led with ${ANGLE_WORD[pk.pick[0]]} and ${ANGLE_WORD[pk.pick[1]]}: ${pk.fitDelta >= 0 ? '+' : ''}${pk.fitDelta.toFixed(2)} fit, so the buyer was x${pk.mult.toFixed(2)} as keen${pk.quick ? ' (played for you at average skill)' : ''}.` });
    if (hag) reasons.push({ label: 'Haggle', text: hag.deal ? `Closed at x${hag.mult.toFixed(2)} of the fair price${hag.quick ? ' (played for you at average skill)' : ''}.` : 'No deal was struck.' });
    if (res.close && res.close.skipped) reasons.push({ label: 'Haggle', text: res.close.note });
    if (noDeal) {
      Object.assign(out, { tone: 'info', title: 'No deal', headline: run.walked ? 'You walked away. The buyer is still here until they leave.' : 'The talks ended without a deal. Your crate is still yours.' });
      out.numbers = compare(null, 'sale price', 'high');
    } else if (!r || !r.ok) {
      Object.assign(out, { tone: 'warn', title: 'Not done', headline: r ? r.msg : 'The deal could not be completed.' });
    } else {
      const band = r.ci ? r.ci.band : null;
      reasons.unshift({ label: 'Creativity multiplier', text: r.ci ? `${r.ci.cm.toFixed(2)}x, ${band.label}. ${r.ci.vN.toFixed(0)} of ${r.ci.vT.toFixed(0)} recent pitches went to this exact buyer.` : '' });
      reasons.splice(1, 0, { label: 'Buyer fit', text: `${fitLabel(r.fit)} (${pctOf(r.fit)}).` });
      if (r.outcome === 'scam') {
        Object.assign(out, { tone: 'bad', title: 'Scammed', headline: 'The payment bounced and the buyer vanished. The crate is gone.' });
        out.lesson = { concept: 'due-diligence', text: 'Online buyers can be fraudulent; paying a small fee to verify a buyer before you ship is cheap insurance.' };
      } else if (r.outcome === 'rejected') {
        const cf = r.reason === 'counterfeit';
        Object.assign(out, { tone: 'bad', title: cf ? 'Counterfeit spotted' : 'No sale', headline: cf ? 'The buyer checked your goods and spotted a counterfeit. It is worth almost nothing now.' : 'The buyer had no use for it.' });
        if (cf) out.lesson = { concept: 'due-diligence', text: 'A counterfeit you bought without checking is still yours to sell, and every buyer can check it. The time to look is before you pay.' };
      } else {
        const good = r.outcome === 'win' || r.outcome === 'pioneer';
        Object.assign(out, { tone: good ? 'good' : 'warn', title: { win: 'Sold at a gain', pioneer: 'Pioneer sale', herd: 'Sold into the herd', flat: 'Sold, no gain' }[r.outcome] || 'Sold',
          headline: `${plan.asset.name} sold to ${plan.buyer.name} for ${money(r.price)}.` });
        lines.push(`You received ${money(r.received)} after tax and fees${r.gotName ? `, including ${r.gotName} in trade` : ''}.`);
        if (r.capped) lines.push('The buyer paid their whole budget.');
        lines.push(r.gain >= 4 ? `${(1 + r.gain).toFixed(0)} times the crate's value.` : `${r.gain >= 0 ? '+' : ''}${Math.round(r.gain * 100)}% against the crate's value.`);
        if (r.outcome === 'herd') out.lesson = { concept: 'saturation-herd', text: `When many players sell the same thing to the same buyer the Creativity multiplier falls to ${r.ci.cm.toFixed(2)}x. A different buyer with a decent fit pays more.` };
      }
      out.numbers = compare(r.outcome !== 'rejected' && r.outcome !== 'scam' ? r.price : null, 'sale price', 'high');
    }
    if (!out.lesson) {
      const rev = pitchReveal(run), pf = pk ? pk.score : 1;
      if (rev && pk && pf < 0.7) {
        out.lesson = { concept: 'persona-fit', text: `This buyer responds most to ${rev.bias}${rev.quirk ? ` and ${rev.quirk}` : ''}; the strongest pair here was ${rev.best.angles[0]} with ${rev.best.angles[1]}. Match your pitch to the person, not to what you like about the goods.` };
      } else if (hag && hag.lesson) out.lesson = hag.lesson;
      else if (rev) out.lesson = { concept: 'persona-fit', text: `You matched this buyer well: they respond most to ${rev.bias}. A pitch lands when the angle suits the person and your goods can honestly back it up.` };
    }
  } else if (kind === 'buy') {
    const rd = readLine(run, secret), hag = res.close && !res.close.skipped ? res.close : null, bid = res.bid;
    if (rd) {
      reasons.push({ label: 'Your read', text: rd.estimate });
      out.reveal = { quality: secret.q, fake: !!secret.fake, defects: secret.defects.map((d) => d.label), truth: rd.truth, found: rd.found, total: rd.total, estimate: rd.estimate };
    } else out.reveal = { quality: secret.q, fake: !!secret.fake, defects: secret.defects.map((d) => d.label), truth: `${Math.round(secret.q * 100)}% condition, ${secret.fake ? 'counterfeit' : 'genuine'}`, found: 0, total: secret.defects.length, estimate: 'You did not read this lot.' };
    if (hag) reasons.push({ label: 'Haggle', text: hag.deal ? `Closed at x${hag.mult.toFixed(2)} of the posted price${hag.quick ? ' (played for you at average skill)' : ''}.` : 'No deal was struck.' });
    if (bid) reasons.push({ label: 'Auction', text: bid.won ? `Won at ${money(bid.price)}, x${(bid.mult || 0).toFixed(2)} of the guide price.` : 'You dropped out.' });
    const worth = run.worth(secret);
    if (run.walked || noDeal) {
      const lostAuction = bid && bid.won === false;
      Object.assign(out, { tone: 'info', title: lostAuction ? 'You dropped out' : 'No deal', headline: lostAuction ? 'The lot went to another bidder. Dropping costs nothing.' : run.walked ? 'You passed on this lot. It stays on the shelf.' : 'The talks ended without a deal. The lot is still on the shelf.' });
      if (secret.fake) lines.push('It was a counterfeit. Walking away was the right call.');
      out.numbers = compare(null, 'price paid', 'low', { net: 0 });
      if (lostAuction && bid.lesson) out.lesson = bid.lesson;
    } else if (!r || !r.ok) {
      Object.assign(out, { tone: 'warn', title: 'Not bought', headline: r ? r.msg : 'The deal could not be completed.' });
    } else {
      const price = r.price, net = worth - price;
      Object.assign(out, { tone: secret.fake ? 'bad' : net >= 0 ? 'good' : 'warn', title: secret.fake ? 'It was a counterfeit' : net >= 0 ? 'Good buy' : 'Paid a little too much', headline: `You bought the ${plan.lot.name} for ${money(price)}.` });
      lines.push(secret.fake ? `It is a counterfeit, worth about ${money(worth)}.` : `It is really ${Math.round(secret.q * 100)}% of the described condition, worth about ${money(worth)}.`);
      out.numbers = compare(price, 'price paid', 'low', { net: r2(net) });
      if (secret.fake) out.lesson = { concept: 'due-diligence', text: 'Sellers know more than you do (information asymmetry). A cheap check before you pay, like the serial number, is the best money you can spend.' };
      else if (bid && bid.lesson) out.lesson = bid.lesson;
    }
    if (!out.lesson && hag && hag.lesson) out.lesson = hag.lesson;
    if (!out.lesson && rd) out.lesson = { concept: 'due-diligence', text: `Information has a price: your read ${rd.found >= rd.total ? 'found every flaw' : `found ${rd.found} of ${rd.total} flaws`}, and what you do not check you pay for.` };
    if (!out.lesson) out.lesson = { concept: 'due-diligence', text: 'Reading a lot before you buy it costs points but saves money: the seller always knows more than you do.' };
    if (secret.fake && out.tone !== 'bad' && !(run.walked || noDeal)) out.tone = 'bad';
  } else { // repair
    const fx = res.fix, q = r && r.ok ? r : null;
    if (!q) Object.assign(out, { tone: 'warn', title: 'Not repaired', headline: r ? r.msg : 'The repair could not be done.' });
    else {
      const gain = q.after - q.before - q.cost;
      Object.assign(out, { tone: gain > 0 ? 'good' : 'warn', title: gain > 0 ? 'Repaired, and it pays' : 'Repaired', headline: `${plan.asset.name} is back at ${Math.round(q.quality * 100)}% quality for ${money(q.cost)}.` });
      lines.push(`Its value goes from ${money(q.before)} to ${money(q.after)}: ${gain >= 0 ? 'a gain' : 'a loss'} of ${money(Math.abs(gain))} after the bill.`);
      reasons.push({ label: 'Precision', text: `${pctOf(fx.precision)} over three steps${fx.careful ? ' (including steps done carefully)' : ''}: quality x${fx.qualityMult.toFixed(2)}, cost x${fx.costMult.toFixed(2)}.` });
      out.numbers = { unit: 'net gain after the bill', better: 'high', you: r2(gain), quick: r2(cmp.quick.net), expert: r2(cmp.expert.net), quickNet: r2(cmp.quick.net), expertNet: r2(cmp.expert.net), expertVia: null };
      out.lesson = { concept: 'repair-roi', text: gain > 0
        ? 'Quality control pays twice: better work costs less and returns more, so precision is money. Repair when the value it adds beats the bill.'
        : 'Repair is an investment: it only pays when the value it adds beats the bill. Check the numbers before you start, and take more care next time.' };
    }
  }
  out.xp = xp;
  if (!out.numbers) out.numbers = compare(null, kind === 'sell' ? 'sale price' : 'price paid', kind === 'sell' ? 'high' : 'low');
  if (!out.lesson) out.lesson = { concept: 'anchoring', text: 'The first number in a negotiation pulls the whole talk toward it. Know your fair price and your alternative before you open.' };
  return sanitize(out);
}
function sanitize(o) { // no NaN, Infinity or undefined may reach the screen
  const walk = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(o);
}

// ------------------------------------------------------------------ the screen's model: what the player may see, as plain data
export function modelOf(run, ui = {}) {
  const { g, plan } = run, s = g.s, key = run.key, stage = key === 'result' ? null : run.stages[run.idx];
  const st = run.stages.map((x, i) => ({ key: x.key, label: x.key === 'close' && plan.kind === 'buy' ? 'Close' : STAGE_LABEL[x.key], status: run.over || run.res[x.key] ? (run.res[x.key]?.skipped ? 'skipped' : 'done') : i === run.idx ? 'now' : 'todo' }));
  const done = run.stages.filter((x) => run.res[x.key] && !run.res[x.key].skipped).map((x) => ({ key: x.key, label: STAGE_LABEL[x.key], text: stageNote(run, x.key) }));
  const m = {
    kind: plan.kind, stage: key, steps: st, done, assist: run.assist, assistLocked: (g.P.haggleAssist || 0) > 0 && (key === 'close'), reduced: !!ui.reduced,
    cash: s.cash, res: safeRes(run.res[key]), zone: plan.zoneFace, cast: plan.cast, say: run.lastSay(), says: run.says.slice(-5).map((x) => x.text), blocker: plan.blocker || '',
    plan: publicPlan(plan), auto: stage && stage.auto ? stage.auto : '',
    first: !run.acted && run.idx === 0 && !run.over && !plan.blocker, canQuick: !run.over && !plan.blocker && !run.res[key], stageDone: !!run.res[key],
    last: run.idx === run.stages.length - 1, view: null, quickRes: null, advice: null, summary: run.summary,
  };
  if (!run.over) {
    m.view = run.view();
    if (run.res[key] && run.res[key].quick) m.quickRes = quickNote(run, key);
    if (run.assist && m.view && !run.res[key]) m.advice = key === 'read' ? inspectAdvice(m.view) : key === 'pitch' ? pitchAdvice(m.view) : key === 'fix' ? FIX_ADVICE : (m.view.advice || null);
    if (key === 'fix' && m.view) m.dial = { ...m.view.zone, step: m.view.step, seed: m.view.seed };
  }
  return m;
}
/** The few numbers of a finished stage the screen may print (never a game's `reveal` or `lesson`, which name the truth). */
function safeRes(r) {
  if (!r) return null;
  const o = {};
  for (const k of ['deal', 'price', 'mult', 'won', 'precision', 'qualityMult', 'costMult', 'skipped', 'quick']) if (r[k] !== undefined) o[k] = r[k];
  return o;
}
function publicPlan(p) {
  const o = { kind: p.kind, fair: p.fair, zone: p.zone };
  if (p.kind === 'sell') Object.assign(o, { asset: p.asset, buyer: { name: p.buyer.name, style: p.buyer.style }, need: p.lead.need, budget: p.budget, capped: p.capped, quote: p.quote, alt: p.alt, verified: p.lead.verified, canVerify: p.canVerify, verifyCost: p.verifyCost, ...(p.lead.verified ? { scam: p.lead.scam } : {}) });
  if (p.kind === 'buy') Object.assign(o, { lot: p.lot, lowest: p.lowest, auction: p.auction, alt: p.alt, seller: { name: p.seller.name, style: p.seller.style } });
  if (p.kind === 'repair') Object.assign(o, { asset: p.asset, quote: p.quote });
  return o;
}
function stageNote(run, key) {
  const r = run.res[key];
  if (key === 'read') return `${pctOf(r.estimate.quality)} condition, ${pctOf(r.estimate.fakeProb)} chance it is counterfeit (${r.spent} points spent).`;
  if (key === 'pitch') return r.pick ? `${ANGLE_WORD[r.pick[0]]} + ${ANGLE_WORD[r.pick[1]]}: price x${r.mult.toFixed(2)}.` : 'No pitch.';
  if (key === 'close') return r.deal ? `Agreed at ${money(r.price)} (x${fin(r.mult, 1).toFixed(2)}).` : 'No deal.';
  if (key === 'bid') return r.won ? `Won at ${money(r.price)}.` : 'Dropped out.';
  if (key === 'fix') return `Precision ${pctOf(r.precision)}: quality x${r.qualityMult.toFixed(2)}, cost x${r.costMult.toFixed(2)}.`;
  return '';
}
function quickNote(run, key) {
  const r = run.res[key];
  return { text: `Played at average skill. ${stageNote(run, key)}`, say: run.lastSay(), ok: key === 'close' ? r.deal !== false : key === 'bid' ? r.won !== false : true };
}
