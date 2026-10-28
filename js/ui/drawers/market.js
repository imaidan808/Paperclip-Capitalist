// Market drawer (docs/V2_DESIGN.md section 8): the buyers and lots of the district you are in, plus the classmate Exchange.
// Contract: see the header of ../shell.js. Acts are named "market-...". Amounts go through ctx.money; copy says "district", never "zone".
//
// Hidden truth: a lot's `truth` (real quality, fake or not) and a buyer's `scam` flag are never displayed. What the player may see is the free
// counterfeit warning (`lot.warn`), their own read (`lot.belief`, `asset.belief`), and a buyer's fraud only after they paid to verify
// (`lead.verified`). The buyer cards do not call the engine's `quotePitch`, because its price and rejection depend on the crate's hidden truth;
// fit and the Creativity band come from public data and the Deal Room shows the real price.
import { ASSETS, BUYERS, ZONES, ZONE_IDS, FMV_BAND } from '../../config.js';
import { fitOf, fitMult, fitLabel } from '../../market.js';
import { plural, dur, nameOf, knownFake, focusZone, heldIn, beliefLine } from './stock.js';

const UP = '▲', DOWN = '▼';
const TABS = ['buyers', 'lots', 'radar', 'exchange'];

// ---- what each district's rules mean, in plain words
const TEACH_NAMES = {
  'utility-fit': 'Utility and fit', negotiation: 'Negotiation', 'saturation-herd': 'Saturation and the herd', 'information-asymmetry': 'Information asymmetry',
  'working-capital': 'Working capital', 'winners-curse': "The winner's curse", 'repair-roi': 'Repair and return', 'supply-chain': 'Supply chains',
  'scale-compliance': 'Scale and compliance', obsolescence: 'Obsolescence', 'inventory-risk': 'Inventory risk', 'recurring-revenue': 'Recurring revenue',
  'enterprise-sales': 'Enterprise sales', 'leverage-risk': 'Leverage and risk', 'asset-cash-flow': 'Assets that pay', 'arbitrage-at-scale': 'Arbitrage at scale',
};
export const teachName = (id) => TEACH_NAMES[id] || String(id || '').replace(/-/g, ' ');
// the rule that is each district's headline, so ruleText leads with it
const HEADLINE = { 'information-asymmetry': 'fakes', 'winners-curse': 'auction', 'repair-roi': 'repair', 'supply-chain': 'customs', 'scale-compliance': 'audits', obsolescence: 'fads',
  'inventory-risk': 'perish', 'recurring-revenue': 'yield', 'asset-cash-flow': 'rent', 'arbitrage-at-scale': 'arbitrage', negotiation: 'haggle', 'saturation-herd': 'season',
  'working-capital': 'managers', 'enterprise-sales': 'enterprise' };
const ORDER = ['haggle', 'season', 'fakes', 'auction', 'repair', 'customs', 'fads', 'perish', 'yield', 'rent', 'arbitrage', 'audits', 'bulk', 'managers', 'bank', 'enterprise', 'gray'];
const pc = (x) => `${Math.round(x * 100)}%`;
const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

/** A district's `rules` as short plain sentences, its headline rule first. Accepts a district id or a district object. */
export function ruleText(zone) {
  const Z = zone && typeof zone === 'object' ? zone : ZONES[zone];
  if (!Z) return [];
  const r = Z.rules || {}, out = [], line = {
    haggle: () => 'Every deal can be haggled. Open with a price, and know when to walk away.',
    season: () => `Demand for ${list(r.season.tags)} goods swings by up to ${pc(r.season.amp)} on a ${r.season.period}-day wave. Buy in the dip, sell at the crest.`,
    fakes: () => (r.fakes >= 0.15 ? `Up to ${pc(r.fakes)} of lots may be counterfeit. Things here are rarely what they seem, so look closely before you pay.` : `Up to ${pc(r.fakes)} of lots may be counterfeit. Look over the dear ones before you pay.`),
    auction: () => `${pc(r.auction)} of the lots are auctions. Rival bidders have limits: bid above the true value and you win by losing.`,
    gray: () => 'A gray market: few questions asked, and audit fines are not softened here.',
    repair: () => `Many lots here are broken, and repairs cost ${pc(r.repair)} less. Fixing things is the margin.`,
    customs: () => `Freight arriving here is inspected about ${pc(r.customs)} of the time: a 12-hour delay and a 2% fee.`,
    bulk: () => 'Deals come in bulk, with service levels you have to keep.',
    fads: () => 'Digital goods lose value twice as fast. First movers win and latecomers hold the loss.',
    perish: () => 'Stock spoils. Sell it fresh, because every day on the shelf costs you.',
    yield: () => 'Some goods pay you every day while you hold them.',
    rent: () => 'Property pays rent. Cycles are long, and appraisals can be disputed.',
    arbitrage: () => 'Price gaps between districts are your edge: buy where it is cheap, sell where it is dear.',
    audits: () => 'Regulatory audits begin once you get here. Keep your paperwork clean.',
    managers: () => 'Managers open here, so your money can work while you are away.',
    bank: () => 'The Bank opens here. Borrowing is a tool, and a risk.',
    enterprise: () => 'Enterprise clients, mergers and IPO preparation open here.',
  };
  if (Z.id === 1) out.push('A barter ladder: some buyers swap goods for yours, so you can climb from one paperclip.', 'An urgent buyer pays for what they need, not for what it cost you.');
  const first = HEADLINE[Z.teaches];
  const keys = [...(first ? [first] : []), ...ORDER.filter((k) => k !== first)].filter((k) => r[k] && line[k]);
  for (const k of keys) out.push(line[k]());
  if (Z.id === 14) out.push('Credit markets: loans are cheap here. Leverage is both the weapon and the risk.');
  out.push(...bonusText(Z));
  return out;
}
/** What unlocking a district gives you for good. */
export function bonusText(zone) {
  const Z = zone && typeof zone === 'object' ? zone : ZONES[zone], b = Z?.bonus || {}, out = [];
  const less = (m) => pc(1 - m), more = (m) => pc(m - 1);
  if (b.freightMult) out.push(`Unlock bonus: freight is ${less(b.freightMult)} cheaper everywhere.`);
  if (b.capMult) out.push(`Unlock bonus: manager capacity is ${more(b.capMult)} bigger.`);
  if (b.leadMult) out.push(`Unlock bonus: buyers arrive ${more(b.leadMult)} faster.`);
  if (b.spreadMult) out.push(`Unlock bonus: loan spreads are ${less(b.spreadMult)} lower.`);
  if (b.storeBonus) out.push(`Unlock bonus: ${plural(b.storeBonus, 'extra storage space')} in every district.`);
  if (b.lotSlots) out.push(`Unlock bonus: ${plural(b.lotSlots, 'extra lot')} on every shelf.`);
  if (b.repairMult) out.push(`Unlock bonus: repairs are ${less(b.repairMult)} cheaper everywhere.`);
  if (b.rentMult) out.push(`Unlock bonus: rent income is ${more(b.rentMult)} higher.`);
  if (b.exitMult) out.push(`Unlock bonus: exit prices are ${more(b.exitMult)} higher.`);
  if (b.creditLimitMult) out.push(`Unlock bonus: credit lines are ${more(b.creditLimitMult)} bigger.`);
  if (b.feeMult) out.push(`Unlock bonus: fees are ${less(b.feeMult)} lower.`);
  return out;
}
/** How crowded a niche is, in words (S = the share of recent sales of this good that went to this buyer). */
export function satWords(S, vT) {
  if (!(vT >= 1)) return 'Nobody has sold this here lately.';
  if (S < 0.1) return 'Almost nobody else sells this to them.';
  if (S < 0.25) return 'A few classmates sell this to them.';
  if (S < 0.5) return 'A popular channel with plenty of sellers.';
  if (S < 0.75) return 'Crowded: most sellers pick this buyer.';
  return 'Packed: nearly everyone sells this to them.';
}
const BAND = { herd: { g: '⚠', tone: 'bad' }, crowded: { g: '◐', tone: 'warn' }, balanced: { g: '●', tone: 'info' }, pioneer: { g: '★', tone: 'good' } };
const cmChip = (ci) => { const b = BAND[ci.band.id] || BAND.balanced; return `<span class="chip ${b.tone}" title="Creativity multiplier"><span aria-hidden="true">${b.g}</span> ${ci.band.label} ${ci.cm.toFixed(2)}x</span>`; };
const fitTone = (f) => (f >= 0.85 ? 'good' : f >= 0.5 ? 'info' : 'warn');
const an = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');

/** Can this crate be pitched to this buyer at all? Uses only public data (never the crate's hidden truth, except to say a known fake is known). */
function canSell(g, a, lead) {
  const def = ASSETS[a.cls];
  if (knownFake(a)) return { ok: false, why: 'fake' };
  if (!(def.dem?.[lead.zone] > 0)) return { ok: false, why: 'nodemand' };
  if (a.cond === 'broken' && !g.acceptsBroken(lead.seg)) return { ok: false, why: 'broken' };
  let fit = fitOf(a.cls, lead.seg);
  if (lead.need) fit = def.tags.includes(lead.need) ? 1 : fit * 0.5;
  if (fit < 0.15) return { ok: false, why: 'nofit', fit };
  return { ok: true, fit };
}
const WHY = {
  nofit: 'None of the crates you chose fit this buyer.', broken: 'This buyer will not take a broken crate. Repair it first, or find a scrap buyer.',
  fake: 'The only crate you chose is a known fake. Sell it to the pool.', nodemand: 'Nobody here wants what you chose.',
};

// ---- the district strip and banner
function switcherHTML(ctx, z) {
  const g = ctx.g(), s = g.s, e = ctx.esc, m = ctx.money, nw = g.netWorth();
  const next = ZONE_IDS.find((id) => !s.zones.includes(id));
  return `<nav class="mkt-zones" aria-label="Districts you can trade in">${[...s.zones].sort((a, b) => a - b).map((id) => {
    const Z = ZONES[id];
    return `<button class="mkt-z" data-act="market-zone" data-z="${id}" data-fid="mk-z-${id}" aria-pressed="${id === z}" aria-label="${e(Z.name)}, district ${id}" title="${e(Z.name)}"><span aria-hidden="true">${Z.icon}</span><b>${id}</b></button>`;
  }).join('')}</nav>${next ? `<p class="tiny mute mkt-next">Next district: ${e(ZONES[next].name)}, at ${m(ZONES[next].gate)} net worth. You are at ${m(nw)}.</p>` : ''}`;
}
function bannerHTML(ctx, z) {
  const g = ctx.g(), s = g.s, e = ctx.esc, m = ctx.money, Z = ZONES[z], rules = ruleText(Z);
  const poolNow = s.pool[z] ?? 0, tax = g.zoneTax(z);
  const [head, ...more] = rules;
  return `<section class="mkt-banner" style="--zg:${e(Z.palette?.[0] || '#34445c')};--za:${e(Z.palette?.[1] || '#ffc247')}" aria-label="About ${e(Z.name)}">
    <div class="mkt-bhead"><span class="mkt-bic" aria-hidden="true">${Z.icon}</span><div><b class="mkt-bname">${e(Z.name)}</b><span class="tiny mute">District ${z} of ${ZONE_IDS.length}, tier ${Z.tier}</span></div></div>
    <p class="mkt-blurb">${e(Z.blurb)}</p>
    ${head ? `<p class="mkt-rule"><b>The rule here:</b> ${e(head)}</p>` : ''}
    <p class="mkt-teach"><span class="badge cyan">You will learn</span> ${e(teachName(Z.teaches))}</p>
    ${more.length ? `<details class="mkt-more"><summary>More about trading here</summary><ul>${more.map((t) => `<li>${e(t)}</li>`).join('')}</ul></details>` : ''}
    <div class="row mkt-stats"><span class="chip" title="Tax on each sale in this district">Tax ${Math.round(tax * 1000) / 10}%</span>
      <span class="chip" title="The liquidity pool buys what nobody else wants">Pool ${m(poolNow)} of ${m(Z.pool)}</span></div>
    <div class="bar green" role="progressbar" aria-label="Liquidity pool depth" aria-valuemin="0" aria-valuemax="${Math.round(Z.pool)}" aria-valuenow="${Math.round(poolNow)}"><i style="width:${Math.max(0, Math.min(100, (poolNow / Z.pool) * 100)).toFixed(0)}%"></i></div>
  </section>`;
}

// ---- buyers
function buyersHTML(ctx, z) {
  const g = ctx.g(), s = g.s, U = ctx.U, e = ctx.esc, m = ctx.money;
  const here = s.assets.filter((a) => a.zone === z), picks = here.filter((a) => U.sel.has(a.id)), pool = picks.length ? picks : here;
  const leads = [...(s.leads[z] || [])].sort((a, b) => (b.need ? 1 : 0) - (a.need ? 1 : 0) || b.budget - a.budget);
  const exact = !!(g.P.radar || s.upg.research);
  const cache = new Map(), cmOf = (cls, seg) => { const k = cls + '|' + seg; if (!cache.has(k)) cache.set(k, g.cmFor(z, cls, seg)); return cache.get(k); };
  const use = here.length > 1 ? `<div class="mkt-use" role="group" aria-label="Which crate to sell"><span class="small mute">Selling with</span>
      <button class="btn sm ghost" data-act="market-use" data-id="" data-fid="mk-use-best" aria-pressed="${!picks.length}">Best of mine</button>
      ${here.slice(0, 12).map((a) => `<button class="btn sm ghost" data-act="market-use" data-id="${a.id}" data-fid="mk-use-${a.id}" aria-pressed="${U.sel.has(a.id)}"><span aria-hidden="true">${ASSETS[a.cls].icon}</span> ${e(nameOf(a.cls, a.cond))} <span class="mono">${m(g.val(a))}</span></button>`).join('')}</div>` : '';
  const scamNote = g.P.scamRate ? `<p class="callout warn small"><b>Scam magnet.</b> About ${Math.round(g.P.scamRate * 100)}% of the buyers who find you are fraudulent. Pay a little to verify a buyer before you sell, because a fake buyer takes the goods and never pays.</p>` : '';
  const card = (l) => {
    const B = BUYERS[l.seg], fraud = !!l.verified && !!l.scam;
    let best = null; const why = new Set();
    for (const a of pool) {
      const c = canSell(g, a, l);
      if (!c.ok) { why.add(c.why); continue; }
      const ci = cmOf(a.cls, l.seg), score = Math.min(l.budget, g.val(a) * fitMult(c.fit) * ci.cm);
      if (!best || score > best.score) best = { a, fit: c.fit, ci, score };
    }
    const urgent = l.need ? `<span class="badge">Urgent</span> <span class="small">needs ${an(l.need)} ${e(l.need)} item</span>` : '';
    const verified = l.verified && !l.scam ? '<span class="chip good"><span aria-hidden="true">✓</span> Verified</span>' : '';
    const fraudLine = fraud ? '<p class="callout bad small"><b>Fraud.</b> This buyer is not real: skip them. Selling to them would cost you the goods.</p>' : '';
    const vcost = Math.max(0.01, Math.round(l.budget * 0.01 * 100) / 100);
    const verify = g.P.scamRate && !l.verified ? `<button class="btn sm ghost" data-act="market-verify" data-lead="${l.id}" data-fid="mk-v-${l.id}">Verify this buyer (${m(vcost)})<span class="sr">: ${e(B.name)}</span></button>` : '';
    let sell = '', fitRow = '', sat = '';
    if (best && !fraud) {
      const label = picks.length ? (picks.length > 1 ? 'Best of your picks' : 'Your pick') : 'Best of yours';
      fitRow = `<div class="row mkt-chips"><span class="chip ${fitTone(best.fit)}">${fitLabel(best.fit)}${l.need && best.fit === 1 ? ': they need it now' : ''}</span>${cmChip(best.ci)}</div>
        <p class="tiny mute">${label}: <b>${e(nameOf(best.a.cls, best.a.cond))}</b></p>`;
      sat = `<p class="tiny mute">${e(satWords(best.ci.S, best.ci.vT))}${exact && best.ci.vT >= 1 ? ` (about ${best.ci.vN.toFixed(0)} of ${best.ci.vT.toFixed(0)} recent sales, ${pc(best.ci.S)})` : ''}</p>`;
      sell = `<button class="btn" data-act="market-sell" data-asset="${best.a.id}" data-lead="${l.id}" data-fid="mk-sell-${l.id}">Sell ${e(ASSETS[best.a.cls].name)}<span class="sr"> to ${e(B.name)}</span></button>`;
    } else if (!fraud) {
      const first = ['nofit', 'broken', 'fake', 'nodemand'].find((k) => why.has(k));
      sell = here.length === 0
        ? `<button class="btn ghost" data-act="market-tab" data-t="lots" data-fid="mk-go-${l.id}">Nothing to sell here: see the lots<span class="sr"> (${e(B.name)})</span></button>`
        : `<p class="small mkt-nosell">${e(WHY[first] || 'Nothing you hold works for this buyer.')}</p><button class="btn ghost" data-act="market-tab" data-t="lots" data-fid="mk-go-${l.id}">Find something in the lots<span class="sr"> (${e(B.name)})</span></button>`;
    }
    return `<li class="mkt-lead${l.need ? ' is-urgent' : ''}${fraud ? ' is-fraud' : ''}">
      <div class="mkt-who"><span class="mkt-av" aria-hidden="true">${B.icon}</span>
        <div class="mkt-id"><b class="mkt-name">${e(B.name)}</b> ${urgent} ${verified}<p class="mkt-say">“${e(B.hello)}”</p></div></div>
      <dl class="mkt-meta"><dt>Pays up to</dt><dd class="mono gold">${m(l.budget)}</dd><dt>Leaves in</dt><dd>${dur(l.exp - s.hour)}</dd></dl>
      <div class="bar ${l.need ? 'gold' : ''}" aria-hidden="true"><i data-bar="lead:${l.id}"></i></div>
      ${fraudLine}${fitRow}${sat}${verify}${sell}</li>`;
  };
  const empty = here.length === 0 && leads.length ? `<p class="callout small">You hold nothing to sell in ${e(ZONES[z].short)}. ${s.assets.length ? 'Ship stock in from another district, or ' : ''}${s.assets.length ? 'buy' : 'Buy'} a lot here, then come back.</p>` : '';
  return `${scamNote}${empty}${use}<ul class="mkt-list">${leads.map(card).join('') || '<li class="mute">No buyers right now. New ones arrive every few hours.</li>'}</ul>`;
}

// ---- lots
function qualityLine(Z) {
  const f = Z.rules?.fakes || 0;
  if (f >= 0.15) return 'Things here are rarely what they seem. Look a lot over before you pay.';
  if (f > 0) return `A few lots here are fakes (up to ${pc(f)}). Look over the dear ones before you pay.`;
  if (Z.id <= 2) return 'Lots here are usually close to how they are described.';
  return 'A lot can be worse than its label. Looking it over is how you find out what it really is.';
}
function lotsHTML(ctx, z) {
  const g = ctx.g(), s = g.s, e = ctx.esc, m = ctx.money, Z = ZONES[z];
  const held = heldIn(g, z), cap = g.storeCap(z), full = held >= cap;
  const lots = [...(s.lots[z] || [])].sort((a, b) => a.price - b.price);
  const card = (l) => {
    const def = ASSETS[l.cls], broken = l.cond === 'broken', auction = l.mode === 'auction';
    const described = g.val({ cls: l.cls, cond: l.cond, quality: 1, wear: 1, zone: z }, z);
    let worth;
    if (broken) {
      const rq = g.repairQuoteFor(l.cls, z), net = rq.after - l.price - rq.cost;
      worth = `<p class="small">Repair costs about <b class="mono">${m(rq.cost)}</b>. Fixed up it is worth about <span class="mono">${m(rq.after)}</span>: ${net >= 0 ? `<b class="green"><span aria-hidden="true">${UP}</span> +${m(net)}</b>` : `<b class="red"><span aria-hidden="true">${DOWN}</span> -${m(-net)}</b>`} after the price and repair.</p>`;
    } else {
      const gap = described - l.price;
      worth = `<p class="small">Worth about <span class="mono">${m(described)}</span> if it is as described: ${gap >= 0 ? `<b class="green"><span aria-hidden="true">${UP}</span> +${m(gap)}</b>` : `<b class="red"><span aria-hidden="true">${DOWN}</span> -${m(-gap)}</b>`} against the price.</p>`;
    }
    const bel = beliefLine(ctx, l.belief);
    const read = bel ? `<p class="small${bel.fake ? ' mkt-warnline' : ''}">${bel.fake ? '<span aria-hidden="true">⚠</span> ' : ''}${e(bel.text)}</p>` : (l.probed && l.probed.length ? `<p class="small mute">Looked over with ${l.probed.length} check${l.probed.length === 1 ? '' : 's'}, no conclusion yet.</p>` : '<p class="small mute">Not inspected yet.</p>');
    const warn = l.warn ? '<p class="callout bad small"><b><span aria-hidden="true">⚠</span> Counterfeit warning.</b> Your street sense says this one is a fake. Walk away.</p>' : '';
    const short = s.cash < l.price, noRoom = full;
    const reason = noRoom ? 'Storage is full here.' : short ? `You need ${m(l.price - s.cash)} more.` : '';
    return `<li class="mkt-lot${auction ? ' is-auction' : ''}">
      <span class="mkt-ic" aria-hidden="true">${def.icon}</span>
      <div class="mkt-body">
        <div class="mkt-head"><b>${e(def.name)}</b> ${broken ? '<span class="badge red">Broken</span>' : '<span class="badge cyan">Working</span>'} ${auction ? '<span class="badge">Auction</span>' : ''}</div>
        <p class="mkt-price"><span class="mono gold">${m(l.price)}</span> <span class="small mute">${auction ? 'guide price' : 'asking price'}</span></p>
        ${warn}${read}${worth}
        ${auction ? '<p class="tiny mute">Rival bidders will push the price. Quick buy skips the bidding and pays the guide price.</p>' : ''}
        <p class="tiny mute">The seller moves it in ${dur(l.exp - s.hour)}.</p>
        <div class="row">
          <button class="btn" data-act="market-look" data-lot="${l.id}" data-fid="mk-look-${l.id}">Look it over<span class="sr">: ${e(def.name)}</span></button>
          <button class="btn ghost" data-act="market-buy" data-lot="${l.id}" data-fid="mk-buy-${l.id}"${reason ? ' aria-disabled="true"' : ''}>Quick buy ${m(l.price)}<span class="sr">: ${e(def.name)}</span></button>
        </div>
        ${reason ? `<p class="tiny red">${e(reason)}</p>` : ''}
      </div></li>`;
  };
  return `<p class="small mkt-qual"><span aria-hidden="true">🔎</span> ${e(qualityLine(Z))}</p>
    <p class="tiny mute">Storage here: ${held} of ${cap}${full ? ' <span class="badge red">Full</span>' : ''}. Cash: <span class="mono">${m(s.cash)}</span>.</p>
    <ul class="mkt-list">${lots.map(card).join('') || '<li class="mute">No lots right now. Sellers bring new ones every few hours.</li>'}</ul>`;
}

// ---- radar
function radarHTML(ctx, z) {
  const g = ctx.g(), s = g.s, e = ctx.esc;
  const rows = g.radar(z, 8);
  return `<p class="small">The best gaps first: goods many buyers want that few classmates sell to them. Aim at the stars.</p>
    <ul class="mkt-list">${rows.map((r) => {
    const held = s.assets.some((a) => a.cls === r.cls && a.zone === z);
    return `<li class="mkt-rrow"><span class="mkt-ic" aria-hidden="true">${ASSETS[r.cls].icon}</span><div class="mkt-body">
        <p class="mkt-rname"><b>${e(ASSETS[r.cls].name)}</b> to <b><span aria-hidden="true">${BUYERS[r.seg].icon}</span> ${e(BUYERS[r.seg].name)}</b></p>
        <div class="row mkt-chips"><span class="chip ${fitTone(r.fit)}">${fitLabel(r.fit)}</span>${cmChip(r)}${held ? '<span class="chip good">You hold one</span>' : ''}</div>
        <p class="tiny mute">${e(satWords(r.S, r.vT))} (about ${r.vN.toFixed(0)} of ${r.vT.toFixed(0)} recent sales, ${pc(r.S)})</p></div></li>`;
  }).join('') || '<li class="mute">No clear gaps right now. Check again in a few hours.</li>'}</ul>`;
}

// ---- exchange (classmates)
function exState(ctx) {
  const T = ctx.U.exch || {}, roster = ctx.S.roster?.() || [];
  const to = roster.some((r) => r.pid === T.to) ? T.to : roster[0]?.pid;
  return { roster, to, partner: roster.find((r) => r.pid === to), want: T.want instanceof Set ? T.want : new Set(), giveCash: T.giveCash ?? '', wantCash: T.wantCash ?? '', roy: T.roy ?? '', royDays: T.royDays ?? 10 };
}
function offerShape(ctx, x) {
  const give = ctx.g().s.assets.filter((a) => ctx.U.sel.has(a.id));
  const want = (x.partner?.inventory || []).filter((a) => x.want.has(a.id));
  return { give: { assets: give, cash: +x.giveCash || 0, royalty: +x.roy > 0 ? { perDay: +x.roy, days: Math.max(1, +x.royDays || 10) } : null }, want: { assets: want, cash: +x.wantCash || 0 } };
}
export function matrixHTML(ctx) {
  const g = ctx.g(), m = ctx.money, e = ctx.esc, x = exState(ctx);
  if (!x.partner) return '';
  const o = offerShape(ctx, x), chk = g.checkOffer(o);
  const myP = o.want.assets.reduce((a, w) => a + g.projected(w), 0), theirP = o.give.assets.reduce((a, w) => a + g.projected(w, x.partner.skills), 0);
  const side = (arr, cash) => `${arr.map((a) => `${ASSETS[a.cls].icon} ${e(nameOf(a.cls, a.cond))}`).join('<br>') || '<span class="mute">no crates</span>'}${cash ? `<br>${m(cash)} cash` : ''}`;
  return `<table class="tbl mkt-matrix"><caption class="sr">Your proposed swap</caption><thead><tr><th scope="col">Part of the deal</th><th scope="col">You give</th><th scope="col">${e(x.partner.handle)} gives</th></tr></thead><tbody>
    <tr><th scope="row">Crates and cash</th><td>${side(o.give.assets, o.give.cash)}${o.give.royalty ? `<br>${m(o.give.royalty.perDay)} a day for ${o.give.royalty.days} days<br><span class="small mute">Counted at no more than a tenth of what you are worth. A promise is a debt: what you cannot pay stays owed.</span>` : ''}</td><td>${side(o.want.assets, o.want.cash)}</td></tr>
    <tr><th scope="row">Fair value</th><td class="mono">${m(chk.va)}</td><td class="mono">${m(chk.vb)}</td></tr>
    <tr><th scope="row">Worth in the new owner's hands</th><td class="mono">${m(myP)} <span class="tiny mute">to you</span></td><td class="mono">${m(theirP)} <span class="tiny mute">to them</span></td></tr>
    <tr><th scope="row">Fair-value check</th><td colspan="2"><span class="chip ${chk.ok ? 'good' : 'bad'}"><span aria-hidden="true">${chk.ok ? '✓' : '✕'}</span> ${(chk.variance * 100).toFixed(1)}% apart, ${chk.ok ? 'inside' : 'outside'} the safe limit of ${FMV_BAND * 100}%</span>
      ${chk.ok ? '' : '<p class="small red"><b>Extreme Asymmetric Premium Warning:</b> a deal this lopsided is blocked and flagged to your instructor. Balance it with cash or another crate.</p>'}</td></tr></tbody></table>`;
}
function exchangeHTML(ctx) {
  const g = ctx.g(), S = ctx.S, U = ctx.U, e = ctx.esc, m = ctx.money, x = exState(ctx);
  const incoming = (S.incoming || []).map(({ offer: o, handle }) => {
    const c = g.checkOffer(o);
    return `<li class="card small"><b>${e(handle || o.fromHandle || o.from)}</b> offers ${o.give.assets.map((a) => e(nameOf(a.cls, a.cond))).join(', ') || 'no crates'}${o.give.cash ? ' + ' + m(o.give.cash) : ''}${o.give.royalty ? ` + ${m(o.give.royalty.perDay)} a day for ${o.give.royalty.days} days` : ''} for ${o.want.assets.map((a) => e(nameOf(a.cls, a.cond))).join(', ') || 'nothing'}${o.want.cash ? ' + ' + m(o.want.cash) : ''}.
      <span class="chip ${c.ok ? 'good' : 'bad'}"><span aria-hidden="true">${c.ok ? '✓' : '✕'}</span> ${(c.variance * 100).toFixed(0)}% from fair value</span>
      <div class="row gap"><button class="btn sm green" data-act="market-accept" data-id="${e(o.id)}" data-fid="mx-ok-${e(o.id)}">Approve</button><button class="btn sm ghost" data-act="market-decline" data-id="${e(o.id)}" data-fid="mx-no-${e(o.id)}">Reject</button></div></li>`;
  }).join('');
  const sent = S.sent ? [...S.sent.values()] : (S.outgoing || []);
  const outgoing = sent.map(({ offer: o }) => `<li class="card small">Waiting on ${e(o.to)}: your ${o.give.assets.map((a) => e(nameOf(a.cls, a.cond))).join(', ') || 'cash'} sits in escrow. <button class="btn sm ghost" data-act="market-withdraw" data-id="${e(o.id)}" data-fid="mx-wd-${e(o.id)}">Withdraw</button></li>`).join('');
  const practice = x.roster.some((r) => r.npc) ? '<div class="callout small"><b>Practice partner.</b> Trade with the Practice Partner, who accepts fair deals (within 30% of fair value). Join a classroom room from the menu to trade with real classmates.</div>' : '';
  const give = g.s.assets.filter((a) => U.sel.has(a.id));
  const form = x.partner ? `<h3 class="gap">New proposal</h3>
    <div class="mkt-form">
      <label class="mkt-f">Trade with<select data-change="market-xto" data-fid="mx-to">${x.roster.map((r) => `<option value="${e(r.pid)}"${r.pid === x.to ? ' selected' : ''}>${e(r.handle)}${r.npc ? ' (practice)' : ''}</option>`).join('')}</select></label>
      <label class="mkt-f">Cash you add<input inputmode="decimal" data-input="market-xfield" data-k="giveCash" data-fid="mx-gc" value="${e(x.giveCash)}" placeholder="0"></label>
      <label class="mkt-f">Cash you ask for<input inputmode="decimal" data-input="market-xfield" data-k="wantCash" data-fid="mx-wc" value="${e(x.wantCash)}" placeholder="0"></label>
      <label class="mkt-f">Royalty you pay each day (optional)<input inputmode="decimal" data-input="market-xfield" data-k="roy" data-fid="mx-roy" value="${e(x.roy)}" placeholder="0"></label>
      <label class="mkt-f">for how many days<input inputmode="numeric" data-input="market-xfield" data-k="royDays" data-fid="mx-rd" value="${e(x.royDays)}"></label>
    </div>
    <p class="small gap">You give: ${give.length ? give.map((a) => `<b>${e(nameOf(a.cls, a.cond))}</b>`).join(', ') : '<span class="mute">no crates yet.</span>'} <button class="btn sm ghost" data-act="market-gostock" data-fid="mx-gostock">Pick crates in Stock</button></p>
    <p class="small mute">Choose what you want from ${e(x.partner.handle)}:</p>
    <div class="mkt-want" role="group" aria-label="Crates ${e(x.partner.handle)} holds">${(x.partner.inventory || []).map((a) => `<button class="btn ghost mkt-wcrate" data-act="market-want" data-id="${e(a.id)}" data-fid="mx-w-${e(a.id)}" aria-pressed="${x.want.has(a.id)}"><span aria-hidden="true">${ASSETS[a.cls].icon}</span> ${e(nameOf(a.cls, a.cond))}<span class="mono small"> ${m(a.fmv)}</span><span class="tiny mute"> ${e(ZONES[a.zone]?.short || '')}</span></button>`).join('') || '<p class="mute small">They have nothing listed.</p>'}</div>
    <div class="gap" data-matrix>${matrixHTML(ctx)}</div>
    <div class="row gap"><button class="btn" data-act="market-send" data-fid="mx-send">Send proposal</button><span class="small mute">Your side waits in escrow until they answer.</span></div>`
    : '<p class="mute">Nobody is online to trade with yet. Classmates appear here when they join your room.</p>';
  return `<p class="small">Swap crates and cash with classmates. Every deal is checked against fair value, so nobody gets fleeced and you learn what things are worth.</p>${practice}
    ${incoming ? `<h3>Invitations</h3><ul class="mkt-list">${incoming}</ul>` : ''}${outgoing ? `<h3 class="gap">Sent</h3><ul class="mkt-list">${outgoing}</ul>` : ''}${form}`;
}

function tabOf(ctx) {
  const g = ctx.g(), t = ctx.U.marketTab || 'buyers';
  if (!TABS.includes(t)) return 'buyers';
  if (t === 'radar' && !(g.P.radar || g.s.upg.research)) return 'buyers';
  return t;
}

export default {
  id: 'market', icon: '🛒', label: 'Market',
  visible: () => true,
  /** Classmate offers waiting, plus urgent buyers in the district you are in that one of your crates can serve right now. */
  badge(ctx) {
    const g = ctx.g(), s = g.s, z = focusZone(ctx);
    const urgent = (s.leads[z] || []).filter((l) => l.need && !(l.verified && l.scam) && s.assets.some((a) => a.zone === z && a.cond === 'ok' && ASSETS[a.cls].tags.includes(l.need))).length;
    return urgent + (ctx.S.incoming?.length || 0) || null;
  },

  html(ctx) {
    const g = ctx.g(), s = g.s, z = focusZone(ctx), tab = tabOf(ctx);
    const radar = !!(g.P.radar || s.upg.research), inc = ctx.S.incoming?.length || 0;
    const tabs = [['buyers', 'Buyers', (s.leads[z] || []).length], ['lots', 'Lots', (s.lots[z] || []).length], ...(radar ? [['radar', 'Radar', null]] : []), ['exchange', 'Exchange', inc || null]];
    const nav = `<div class="dtabs" role="group" aria-label="Market sections">${tabs.map(([id, label, n]) => `<button class="btn sm ghost" data-act="market-tab" data-t="${id}" data-fid="mk-t-${id}" aria-pressed="${tab === id}">${label}${n != null ? ` <span class="mkt-n">${n}</span>${id === 'exchange' ? '<span class="sr"> waiting</span>' : ''}` : ''}</button>`).join('')}</div>`;
    const body = tab === 'buyers' ? buyersHTML(ctx, z) : tab === 'lots' ? lotsHTML(ctx, z) : tab === 'radar' ? radarHTML(ctx, z) : exchangeHTML(ctx);
    return `${switcherHTML(ctx, z)}${bannerHTML(ctx, z)}${nav}<div class="mkt-panel" data-panel="${tab}">${body}</div>`;
  },

  acts(ctx) {
    const U = ctx.U, g = () => ctx.g();
    const ensure = () => (U.exch ||= { want: new Set() });
    const blocked = (r) => {
      const c = r.chk;
      ctx.dlg.open(`<h2 tabindex="-1" autofocus>Proposal blocked</h2><div class="callout bad">${ctx.esc(r.msg)}</div>${c ? `<p class="small mono">Your side ${ctx.money(c.va)} against theirs ${ctx.money(c.vb)} (${(c.variance * 100).toFixed(0)}% apart).</p>` : ''}<button class="btn" data-close autofocus>OK</button>`, { cls: 'alert', label: 'Proposal blocked' });
      ctx.sfx?.buzz?.();
    };
    return {
      'market-zone'(el) { const z = +el.dataset.z; if (g().s.zones.includes(z)) { U.zone = z; ctx.render(); } },
      'market-tab'(el) { U.marketTab = el.dataset.t; ctx.render(); },
      'market-use'(el) {
        const z = focusZone(ctx), id = el.dataset.id;
        if (!id) { for (const a of g().s.assets) if (a.zone === z) U.sel.delete(a.id); } else if (U.sel.has(id)) U.sel.delete(id); else U.sel.add(id);
        ctx.render();
      },
      'market-sell'(el) {
        const { asset, lead } = el.dataset, s = g().s;
        if (!s.assets.some((a) => a.id === asset)) { ctx.toast('That crate is gone.', 'warn'); ctx.render(); return; }
        if (!Object.values(s.leads).some((ls) => ls.some((l) => l.id === lead))) { ctx.toast('That buyer has left.', 'warn'); ctx.render(); return; }
        ctx.deal({ kind: 'sell', assetId: asset, leadId: lead });
      },
      'market-verify'(el) {
        const r = g().verifyLead(el.dataset.lead);
        if (!r.ok) ctx.say(r); else ctx.toast(r.msg, r.scam ? 'warn' : 'good');
        ctx.render();
      },
      'market-look'(el) {
        const lotId = el.dataset.lot, zone = focusZone(ctx);
        if (!g().s.lots[zone]?.some((l) => l.id === lotId)) { ctx.toast('That lot is gone.', 'warn'); ctx.render(); return; }
        ctx.deal({ kind: 'buy', zone, lotId });
      },
      'market-buy'(el) {
        const r = g().buyLot(focusZone(ctx), el.dataset.lot);
        if (!r.ok) ctx.say(r); else { ctx.toast(`Bought ${nameOf(r.asset.cls, r.asset.cond)} for ${ctx.money(r.price)}.`, 'good'); ctx.sfx?.blip?.(); }
        ctx.render();
      },
      'market-gostock'() { ctx.openDrawer('stock'); },
      // the classmate Exchange (the peer-to-peer rules live in the engine and the session)
      'market-xto'(el) {
        ensure().to = el.value; ensure().want = new Set();
        el.blur?.(); ctx.render();
        ctx.$?.('[data-fid="mx-to"]')?.focus?.({ preventScroll: true }); // the redraw is held back while a field has the cursor, so give the cursor back after
      },
      'market-xfield'(el) {
        ensure()[el.dataset.k] = el.value;
        const box = ctx.$?.('[data-matrix]');
        if (box) box.innerHTML = matrixHTML(ctx); // typing never redraws the drawer, so refresh the table in place
      },
      'market-want'(el) {
        const T = ensure(), id = el.dataset.id;
        if (T.want.has(id)) T.want.delete(id); else T.want.add(id);
        ctx.render();
      },
      'market-send'() {
        const x = exState(ctx);
        if (!x.partner) { ctx.toast('Choose someone to trade with.', 'warn'); return; }
        const o = offerShape(ctx, x);
        if (!o.give.assets.length && !o.give.cash && !o.give.royalty) { ctx.toast('Offer something: tick crates in Stock, or add cash.', 'warn'); return; }
        const r = ctx.S.propose({ to: x.to, giveIds: o.give.assets.map((a) => a.id), giveCash: o.give.cash, want: { assets: o.want.assets.map((a) => ({ ...a })), cash: o.want.cash }, royalty: o.give.royalty });
        if (!r.ok) { blocked(r); return; }
        for (const a of o.give.assets) U.sel.delete(a.id);
        U.exch = { ...ensure(), want: new Set(), giveCash: '', wantCash: '', roy: '' };
        ctx.toast(r.msg, 'good'); ctx.render();
      },
      'market-accept'(el) { ctx.say(ctx.S.acceptIncoming(el.dataset.id)); ctx.render(); },
      'market-decline'(el) { ctx.S.declineIncoming(el.dataset.id); ctx.render(); },
      'market-withdraw'(el) { ctx.say(ctx.S.withdraw(el.dataset.id), 'info'); ctx.render(); },
    };
  },
};
