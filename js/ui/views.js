// Pure view builders: (session, ui-state) -> HTML string. No listeners here; actions are data-act attributes handled in game.js.
import { ZONES, ASSETS, BUYERS, PROFILES, PIPE, PIPE_RULES, UPGRADES, CLIENTS, LOANS, SKILLS, SKILL_MAX, trainCost, MIL, DEBT, AUDIT, TOTAL_DAYS, FMV_BAND } from '../config.js';
import { utilityIn, fitLabel, fmtMoney as money, fmtPct as pct } from '../market.js';
import { esc } from './common.js';

export const TABS = [['world', 'World'], ['trade', 'Trade'], ['map', 'Island map'], ['bank', 'Bank'], ['clients', 'Clients & Exit'], ['skills', 'Skills'], ['audit', 'Audit'], ['ledger', 'Ledger']];
const TONE = { bad: 'bad', warn: 'warn', ok: 'info', good: 'good' };
const ic = (x) => `<span class="ic" aria-hidden="true">${x}</span>`;
const dur = (h) => (h >= 48 ? (h / 24).toFixed(1) + ' days' : Math.max(0, Math.round(h)) + ' h');
const cmChip = (ci) => `<span class="chip ${TONE[ci.band.tone]}" title="Creativity multiplier">${ci.band.label}: ${ci.cm.toFixed(2)}x</span>`;
const aName = (a) => `${ASSETS[a.cls].name}${a.cond === 'broken' ? ' (broken)' : ''}`;
const gain = (x) => `<span class="${x >= 0 ? 'green' : 'red'}">${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%</span>`;
export const worldShell = (mode) => `<div class="wvhost" data-mode="${mode}"></div>`;
export const selectedAsset = (g, U, zone) => { const sel = g.s.assets.filter((a) => U.sel.has(a.id)); return (zone != null && sel.find((a) => a.zone === zone)) || sel[0]; };

// ---------------------------------------------------------------- header
export function hubHTML(S, U) {
  const g = S.game, s = g.s, nw = g.netWorth(), P = PROFILES[s.profile], prev = U.prev || {};
  const fl = (k, v) => (prev[k] == null || Math.abs(v - prev[k]) < 0.005 ? '' : v > prev[k] ? ' flash-up' : ' flash-down');
  U.prev = { cash: s.cash, nw };
  const eei = g.eei();
  const lb = S.leaderboard(); const me = lb.find((r) => r.me);
  const clock = S.canSetClock()
    ? `<button class="btn sm ghost" data-act="pause" aria-pressed="${S.clock.paused}">${S.clock.paused ? 'Resume' : 'Pause'}</button>
       <label class="sr" for="spd">Game speed</label><select id="spd" data-change="speed" data-fid="spd" style="min-height:1.9rem;padding:.1rem .3rem">${[0.25, 1, 4, 16, 64].map((v) => `<option value="${v}" ${S.clock.speed === v ? 'selected' : ''}>${v}x</option>`).join('')}</select>`
    : `<span class="chip info">Class clock ${S.clock.paused ? 'paused' : S.clock.speed + 'x'}</span>`;
  const room = S.roomInfo ? `<span class="chip ${S.room?.state === 'open' ? 'good' : 'warn'}">Room ${esc(S.roomInfo.code)} &middot; ${S.alivePeers().filter((p) => p.role === 'student').length + 1} online</span>` : '';
  return `
    <div class="brand"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M11 24V9a4 4 0 0 1 8 0v13a2.5 2.5 0 0 1-5 0V11" fill="none" stroke="#ffc247" stroke-width="2.6" stroke-linecap="square"/></svg>
      <div><b>PAPERCLIP<br>CAPITALIST</b><div class="tiny mute">${esc(P.name)} &middot; ${esc(s.handle)}</div></div></div>
    <button class="stat${fl('cash', s.cash)}" data-act="breakdown" data-k="cash" data-fid="st-cash"><div class="lbl">Liquid balance</div><div class="val mono gold">${money(s.cash)}</div><div class="tiny mute">${s.settle.length ? money(s.settle.reduce((a, x) => a + x.amt, 0)) + ' settling' : 'tap for detail'}</div></button>
    <button class="stat${fl('nw', nw)}" data-act="breakdown" data-k="nw" data-fid="st-nw"><div class="lbl">Net worth</div><div class="val mono">${money(nw)}</div><div class="tiny mute">${g.debt() > 0 ? 'debt ' + money(g.debt()) + ' &middot; D/E ' + (isFinite(g.deRatio()) ? g.deRatio().toFixed(2) : 'inf') : 'no debt'}</div></button>
    <button class="stat" data-act="breakdown" data-k="day" data-fid="st-day"><div class="lbl">Day</div><div class="val mono">${g.day}<span class="mute" style="font-size:.9rem"> / ${TOTAL_DAYS}</span></div><div class="bar" role="progressbar" aria-label="Game progress" aria-valuemin="0" aria-valuemax="${TOTAL_DAYS}" aria-valuenow="${g.day}"><i data-bar="day"></i></div></button>
    <button class="stat" data-act="breakdown" data-k="eei" data-fid="st-eei"><div class="lbl">Efficiency index</div><div class="val mono green">${eei >= 100 ? eei.toFixed(0) : eei.toFixed(2)}</div><div class="tiny mute">${me ? `rank ${me.rank} of ${lb.length}` : ''} ${s.exit ? '&middot; locked' : ''}</div></button>
    <div class="stat row" style="justify-content:flex-end;align-content:center">${clock}${room}
      <button class="btn sm ghost" data-act="help">Help</button><button class="btn sm ghost" data-act="settings">Access</button><button class="btn sm ghost" data-act="menu">Menu</button></div>`;
}

export function tabsHTML(S, U) {
  const s = S.game.s;
  return TABS.filter(([id]) => id !== 'audit' || s.mil.m2).map(([id, label]) => {
    const dot = (id === 'audit' && s.auditPending) || (id === 'bank' && s.mil.m1 && !s.loans.length && false);
    return `<button class="tab" role="tab" id="tab-${id}" aria-selected="${U.tab === id}" aria-controls="work" tabindex="${U.tab === id ? 0 : -1}" data-act="tab" data-t="${id}" data-fid="tab-${id}">${label}${dot ? '<span class="dot" title="Action needed"></span><span class="sr"> (action needed)</span>' : ''}</button>`;
  }).join('');
}

// ---------------------------------------------------------------- trade
export function tradeHTML(S, U) {
  const g = S.game, s = g.s, z = U.zone, Z = ZONES[z];
  const chips = `<div class="row" role="group" aria-label="Zone">${[1, 2, 3].map((n) => `<button class="btn sm ${n === z ? '' : 'ghost'}" data-act="zone" data-z="${n}" aria-pressed="${n === z}" data-fid="zone-${n}">${s.zones.includes(n) ? '' : 'Locked: '}${ZONES[n].short}</button>`).join('')}</div>`;
  if (!s.zones.includes(z)) {
    const need = z === 2 ? '$1,000 net worth (Gate 1: Revenue Proof)' : '$250,000 net worth (Gate 3: Corporate Exit)';
    return `${chips}<div class="callout warn gap"><b>${esc(Z.name)} is locked.</b> Reach ${need} to open it. You are at ${money(g.netWorth())}.</div>`;
  }
  const sel = selectedAsset(g, U, z);
  const here = s.assets.filter((a) => a.zone === z);
  const leads = [...s.leads[z]].sort((a, b) => (b.need ? 1 : 0) - (a.need ? 1 : 0) || b.budget - a.budget);
  const lots = [...s.lots[z]].sort((a, b) => a.price - b.price);
  const m = g.mods();
  const surge = m.demand.length || m.price.length;
  const leadCard = (l) => {
    const B = BUYERS[l.seg];
    let q = '';
    if (sel) {
      const r = g.quotePitch(sel.id, l.id);
      if (!r.ok) q = `<div class="quote mute">${esc(r.msg)}</div>`;
      else if (r.rejected) q = `<div class="quote"><span class="chip bad">No fit: they will reject this</span></div>`;
      else q = `<div class="quote"><span class="chip ${r.fit >= 0.85 ? 'good' : r.fit >= 0.5 ? 'info' : 'warn'}">${fitLabel(r.fit)}</span>${cmChip(r.ci)}<span class="chip ${r.received > r.fmv ? 'good' : 'bad'}">You get ${money(r.received)} (${r.gain >= 0 ? '+' : ''}${(r.gain * 100).toFixed(0)}% vs value)</span></div>`;
    }
    return `<div class="card lead${l.need ? ' urgent' : ''}">${ic(B.icon)}<div><b>${esc(B.name)}</b> ${l.need ? `<span class="badge">Urgent: needs ${/^[aeiou]/i.test(l.need) ? 'an' : 'a'} ${esc(l.need)}</span>` : ''}
      <div class="small mute">Pays up to <span class="mono">${money(l.budget)}</span> &middot; leaves in ${dur(l.exp - s.hour)}</div><div class="bar" aria-hidden="true"><i data-bar="lead:${l.id}"></i></div>${q}</div>
      <button class="btn sm" data-act="pitch" data-lead="${l.id}" data-fid="lead-${l.id}">Pitch</button></div>`;
  };
  const lotCard = (l) => {
    const def = ASSETS[l.cls], ops = g.lvl('ops');
    const a = { cls: l.cls, cond: l.cond, quality: 1, wear: 1, zone: z };
    let worth = `<span class="mute">Market value</span> ${money(g.val(a))}`;
    if (l.cond === 'broken') {
      const rq = g.repairQuoteFor(l.cls, z);
      worth = `<span class="mute">After your repair</span> ${money(rq.after)} <span class="mute">(repair ${money(rq.cost)}, ${Math.round(rq.quality * 100)}% quality)</span>`;
    }
    return `<div class="card lead">${ic(def.icon)}<div><b>${esc(aName(l))}</b><div class="small">${worth}</div><div class="tiny mute">Seller moves it in ${dur(l.exp - s.hour)}</div></div>
      <button class="btn sm green" data-act="buy" data-lot="${l.id}" data-fid="lot-${l.id}" ${s.cash < l.price ? 'aria-disabled="true"' : ''}>Buy ${money(l.price)}</button></div>`;
  };
  const radar = s.upg.research ? g.radar(z, 6) : [];
  return `${chips}
    <div class="card gap"><div class="row"><b>${esc(Z.name)}</b><span class="chip">tax ${pct(g.zoneTax(z), 1)}</span><span class="chip">cycle speed ${Z.speed}x</span>${surge ? '<span class="chip warn">Market event active</span>' : ''}<span class="grow"></span><span class="small mute">${esc(Z.tagline)}</span></div>
      <div class="small gap">Liquidity pool: <b class="mono">${money(s.pool[z])}</b> of ${money(Z.pool)} (refills 35% a day)</div><div class="bar green" aria-hidden="true"><i style="width:${(s.pool[z] / Z.pool * 100).toFixed(1)}%"></i></div></div>
    <h2 class="gap">Buyer leads</h2>
    <p class="small mute">${sel ? `Pitching <b>${esc(aName(sel))}</b> (${money(g.val(sel))}). Each card previews the fit and the Creativity Multiplier before you commit.` : 'Select an asset in your inventory to preview a pitch on every buyer.'}${here.length ? '' : ' You have nothing in this zone: source a lot below.'}</p>
    <div class="grid">${leads.map(leadCard).join('') || '<p class="mute">No buyers right now. New leads arrive every few hours.</p>'}</div>
    <h2 class="gap">Sourcing lots</h2>
    <div class="grid">${lots.map(lotCard).join('') || '<p class="mute">No lots right now.</p>'}</div>
    <h2 class="gap">Niche radar</h2>
    ${radar.length ? `<div class="scroll"><table class="tbl"><thead><tr><th scope="col">Asset</th><th scope="col">Buyer</th><th scope="col">Fit</th><th scope="col">Saturation</th><th scope="col">Cm</th></tr></thead><tbody>${radar.map((r) => `<tr><td>${esc(ASSETS[r.cls].name)}</td><td>${esc(BUYERS[r.seg].name)}</td><td>${fitLabel(r.fit)}</td><td class="mono">${pct(r.S)}</td><td>${cmChip(r)}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="small mute">Pitch previews already show the saturation of the niche you are about to use. Install the <b>Market Research Suite</b> (Automation panel) to see every underserved niche at once.</p>`}`;
}

// ---------------------------------------------------------------- inventory, automation, syndicate
export function invHTML(S, U) {
  const g = S.game, s = g.s, m = g.mods();
  const cap = (z) => `${s.assets.filter((a) => a.zone === z).length}/${ZONES[z].store}`;
  const cards = s.assets.map((a) => {
    const def = ASSETS[a.cls], u = Math.round(utilityIn(a.cls, a.zone, m, g.crowd(a.cls, a.zone)));
    return `<button class="card asset" aria-pressed="${U.sel.has(a.id)}" data-act="sel" data-id="${a.id}" data-fid="as-${a.id}">${ic(def.icon)}<span class="nm">${esc(def.name)}</span>
      <span class="small">${a.cond === 'broken' ? '<span class="badge red">Broken</span> ' : ''}<span class="chip">${esc(ZONES[a.zone].short)}</span> ${a.quality < 1 ? `<span class="chip warn">${Math.round(a.quality * 100)}% quality</span>` : ''}</span>
      <span class="small mono">${money(g.val(a))} <span class="mute">&middot; utility ${u}/100</span></span>
      <span class="bar" aria-hidden="true" title="Condition"><i style="width:${(a.wear * 100).toFixed(0)}%;background:${a.wear > 0.8 ? 'var(--green)' : a.wear > 0.55 ? 'var(--gold)' : 'var(--red)'}"></i></span></button>`;
  }).join('');
  const sel = s.assets.filter((a) => U.sel.has(a.id));
  let actions = '<p class="small mute">Select assets to sell, repair, ship or offer to a classmate. Condition bars show depreciation: holding stock costs money.</p>';
  if (sel.length) {
    const pq = g.poolQuote(sel.map((a) => a.id));
    const broken = sel.filter((a) => a.cond === 'broken');
    const digi = sel.every((a) => ASSETS[a.cls].tags.includes('digital')) && s.zones.includes(3) && sel[0].zone !== 3;
    actions = `<div class="row gap">
      <button class="btn sm" data-act="pool" data-fid="b-pool" ${pq.ok ? '' : 'aria-disabled="true"'}>Sell to pool${pq.ok ? ' ' + money(pq.total) : ''}</button>
      ${broken.length === 1 ? `<button class="btn sm ghost" data-act="repair" data-fid="b-repair">Repair</button>` : ''}
      <button class="btn sm ghost" data-act="ship" data-fid="b-ship">Ship</button>
      <button class="btn sm ghost" data-act="offer" data-fid="b-offer">Offer to a classmate</button>
      ${digi ? '<button class="btn sm ghost" data-act="route" data-fid="b-route">Digital route to Zone 3</button>' : ''}
      <button class="btn sm ghost" data-act="clearsel">Clear</button></div>
      ${pq.ok && pq.delay ? `<p class="tiny mute">Liquidation settles after ${pq.delay} virtual hours (governance drag).</p>` : ''}`;
  }
  const transit = s.freight.map((f) => `<div class="card small"><div class="row"><b>In transit to ${esc(ZONES[f.to].short)}</b><span class="grow"></span>${dur(f.arrive - s.hour)}</div><div class="bar" aria-hidden="true"><i data-bar="freight:${f.id}"></i></div><span class="mute">${f.items.map((a) => esc(ASSETS[a.cls].name)).join(', ')}</span></div>`).join('');
  return `<h2>Active inventory matrix <span class="tiny mute mono">${[1, 2, 3].filter((z) => s.zones.includes(z)).map((z) => 'Z' + z + ' ' + cap(z)).join(' &middot; ')}</span></h2>
    <div class="grid g2" role="group" aria-label="Your assets">${cards || '<p class="mute">Empty. Click a pallet on the auction row in the World, or use the Trade tab.</p>'}</div>${transit ? '<div class="grid gap">' + transit + '</div>' : ''}${actions}`;
}

export function laneLabel(p) { return `${esc(ASSETS[p.cls]?.name || '?')} to ${esc(BUYERS[p.buyer]?.name || '?')}`; }
export function autoHTML(S, U) {
  const g = S.game, s = g.s;
  const locked = g.autoLocked();
  const head = !s.zones.some((z) => ZONES[z].auto)
    ? `<div class="callout"><b>Manual only.</b> Automated managers start in the Metro Hub (Zone 2), unlocked at $1,000 net worth. The Scrap Yard is hands-on.</div>` : '';
  const pipes = s.pipes.map((p) => {
    const f = g.forecast(p), st = p.status;
    return `<div class="card"><div class="row"><span class="ic" aria-hidden="true">${PIPE[p.kind].icon}</span><div class="grow"><b>${esc(PIPE[p.kind].name)}</b> <span class="chip">L${p.level}</span> <span class="chip">${esc(ZONES[p.zone].short)}</span> ${p.channel === 'intl' ? '<span class="chip warn">International</span>' : '<span class="chip">Domestic</span>'}
      <div class="small">${laneLabel(p)} ${cmChip(f.ci)}</div></div>
      <span class="chip ${st === 'running' ? 'good' : st === 'paused' || st === 'audit' ? 'warn' : p.starved ? 'bad' : ''}">${st === 'audit' ? 'on compliance duty' : p.starved ? 'starved of cash' : st}</span></div>
      <div class="bar gold gap" aria-hidden="true"><i data-bar="pipe:${p.id}"></i></div>
      <div class="small row gap"><span>Allocated <b class="mono">${money(Math.min(p.alloc, f.cap))}</b>/${money(f.cap)}</span><span>Cycle ${dur(f.len)}</span><span class="${f.net >= 0 ? 'green' : 'red'} mono">${f.net >= 0 ? '+' : ''}${money(f.net)} / cycle</span><span class="mute">${money(f.perDay)} / day</span></div>
      <div class="row gap"><button class="btn sm ghost" data-act="pedit" data-id="${p.id}" data-fid="pe-${p.id}">Lane</button><button class="btn sm ghost" data-act="ppause" data-id="${p.id}" data-fid="pp-${p.id}">${st === 'paused' ? 'Resume' : 'Pause'}</button>
        <button class="btn sm" data-act="pup" data-id="${p.id}" data-fid="pu-${p.id}" ${p.level >= PIPE_RULES.maxLevel ? 'aria-disabled="true"' : ''}>Level up ${p.level >= PIPE_RULES.maxLevel ? '' : money(g.pipeUpCost(p))}</button>
        <button class="btn sm ghost" data-act="prel" data-id="${p.id}" data-fid="pr-${p.id}">Release</button></div></div>`;
  }).join('');
  const upg = Object.entries(UPGRADES).map(([id, u]) => `<div class="card small"><div class="row"><b>${esc(u.name)}</b><span class="grow"></span>${s.upg[id] ? '<span class="chip good">Installed</span>' : `<button class="btn sm" data-act="upg" data-id="${id}" data-fid="up-${id}" ${s.zones.includes(u.zone) ? '' : 'aria-disabled="true"'}>${money(u.cost)}</button>`}</div><span class="mute">${esc(u.blurb)}</span></div>`).join('');
  return `<h2>Automation controller</h2>${head}
    ${locked ? `<div class="callout warn"><b>Gate 2: expansion locked.</b> ${s.auditPending ? 'Resolve your Regulatory Audit in the Audit tab.' : 'Your first audit is being scheduled.'}</div>` : ''}
    <div class="grid">${pipes || (s.zones.some((z) => ZONES[z].auto) ? '<p class="mute">No managers yet. A pipeline turns idle cash into a working-capital loop.</p>' : '')}</div>
    ${s.zones.some((z) => ZONES[z].auto) ? `<div class="row gap"><button class="btn" data-act="hire" data-fid="hire" ${locked ? 'aria-disabled="true"' : ''}>Hire a manager</button></div>
      <details class="gap"><summary class="small">Business upgrades (JIT, SEO, freight, research)</summary><div class="grid gap">${upg}</div></details>` : ''}`;
}

export function synHTML(S, U) {
  const g = S.game, s = g.s;
  const tabs = [['feed', 'Feed'], ['exch', 'Exchange'], ['board', 'Board'], ['prices', 'Prices']];
  const nav = `<div class="tabs" role="tablist" aria-label="Syndicate">${tabs.map(([id, l]) => `<button class="tab" role="tab" aria-selected="${U.side === id}" data-act="side" data-s="${id}" data-fid="sd-${id}">${l}${id === 'exch' && S.incoming.length ? `<span class="dot"></span><span class="sr"> (${S.incoming.length} waiting)</span>` : ''}</button>`).join('')}</div>`;
  let body = '';
  if (U.side === 'feed') {
    body = `<div class="scroll" style="max-height:20rem">${s.news.slice(0, 14).map((n, i) => `<div class="callout ${n.level === 'bad' ? 'bad' : n.level === 'good' ? 'good' : n.level === 'warn' ? 'warn' : ''}" style="margin:.25rem 0"><span class="tiny mute mono">Day ${Math.floor(n.h / 24) + 1} ${String(n.h % 24).padStart(2, '0')}:00</span> ${esc(n.text)} ${n.alert ? `<button class="btn sm ghost" data-act="alert" data-i="${i}" data-fid="al-${i}">Read alert</button>` : ''}</div>`).join('') || '<p class="mute">Quiet so far. Macro shocks are scheduled for days 15, 45 and 75, and the sim may add surprises.</p>'}</div>`;
  } else if (U.side === 'exch') body = exchHTML(S, U);
  else if (U.side === 'board') {
    const lb = S.leaderboard();
    const top = lb.slice(0, 8); const me = lb.find((r) => r.me);
    if (me && !top.includes(me)) top.push(me);
    body = `<table class="tbl"><caption class="sr">Economic Efficiency Index leaderboard</caption><thead><tr><th scope="col">#</th><th scope="col">Founder</th><th scope="col">Net worth</th><th scope="col">EEI</th><th scope="col">In profile</th></tr></thead><tbody>${top.map((r) => `<tr${r.me ? ' style="background:var(--warn-bg)"' : ''}><td>${r.rank}</td><td>${PROFILES[r.profile]?.icon || ''} ${esc(r.handle)}${r.me ? ' (you)' : ''}${r.synth ? ' <span class="tiny mute">demo</span>' : ''}</td><td class="mono">${money(r.nw)}</td><td class="mono">${r.eei >= 100 ? r.eei.toFixed(0) : r.eei.toFixed(2)}</td><td class="mono">${r.profRank}/${r.profN}</td></tr>`).join('')}</tbody></table>
      <p class="tiny mute">EEI = ending net worth / starting capital x (1 + days remaining / 90), with starting capital floored at ${money(S.difficulty.eeiFloor)} so a $0.05 start does not dwarf every other profile. Compare yourself within your own profile too.${S.mode === 'solo' ? ' Rivals here are simulated classmates; join a room for real ones.' : ''}</p>`;
  } else {
    const z = U.zone, rows = Object.keys(ASSETS).filter((c) => ASSETS[c].dem[z - 1] > 0 && s.zones.includes(z));
    body = `<p class="small mute">NPC liquidity pool pricing in ${esc(ZONES[z].short)}. This is the Fair Market Value baseline for peer trades.</p><div class="scroll"><table class="tbl"><thead><tr><th scope="col">Asset</th><th scope="col">FMV</th><th scope="col">vs base</th><th scope="col">Cohort volume (48h)</th></tr></thead><tbody>${rows.map((c) => { const v = g.val({ cls: c, cond: 'ok', quality: 1, wear: 1, zone: z }, z), r = v / ASSETS[c].base, cv = g.env.cohort?.counts(s.hour, z, c).total ?? 0; return `<tr><td>${esc(ASSETS[c].name)}</td><td class="mono">${money(v)}</td><td class="${r >= 1 ? 'green' : 'red'} mono">${r >= 1 ? '&#9650;' : '&#9660;'} ${(r * 100).toFixed(0)}%</td><td class="mono">${Math.round(cv)}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  return `<h2>Live market syndicate</h2>${nav}${body}`;
}

export function matrixHTML(S, U) {
  const g = S.game, T = U.trade || {};
  const partner = S.roster().find((r) => r.pid === T.to);
  if (!partner) return '';
  const give = [...U.sel].map((id) => g.s.assets.find((a) => a.id === id)).filter(Boolean);
  const want = (partner.inventory || []).filter((a) => (T.want || new Set()).has(a.id));
  const offerShape = { give: { assets: give, cash: +T.giveCash || 0, royalty: +T.roy > 0 ? { perDay: +T.roy, days: +T.royDays || 10 } : null }, want: { assets: want, cash: +T.wantCash || 0 } };
  const chk = g.checkOffer(offerShape);
  const myP = want.reduce((a, w) => a + g.projected(w), 0), theirP = give.reduce((a, w) => a + g.projected(w, partner.skills), 0);
  const side = (arr, cash, who) => `${arr.map((a) => `${ASSETS[a.cls].icon} ${esc(aName(a))}`).join('<br>') || '<span class="mute">no assets</span>'}${cash ? `<br>${money(cash)} cash` : ''}`;
  return `<table class="tbl"><caption class="sr">Proposed transaction verification matrix</caption><thead><tr><th scope="col">Trade parameter</th><th scope="col">You offer</th><th scope="col">${esc(partner.handle)} offers</th></tr></thead><tbody>
    <tr><th scope="row">Assets</th><td>${side(give, offerShape.give.cash)}${offerShape.give.royalty ? `<br>Royalty ${money(offerShape.give.royalty.perDay)}/day x ${offerShape.give.royalty.days}d` : ''}</td><td>${side(want, offerShape.want.cash)}</td></tr>
    <tr><th scope="row">Baseline fair market value</th><td class="mono">${money(chk.va)}</td><td class="mono">${money(chk.vb)}</td></tr>
    <tr><th scope="row">Worth in the receiver's hands</th><td class="mono">${money(myP)} <span class="tiny mute">to you</span></td><td class="mono">${money(theirP)} <span class="tiny mute">to them</span></td></tr>
    <tr><th scope="row">System valuation report</th><td colspan="2"><span class="chip ${chk.ok ? 'good' : 'bad'}">Variance ${(chk.variance * 100).toFixed(1)}% ${chk.ok ? 'is within' : 'EXCEEDS'} the safe +/-${FMV_BAND * 100}% threshold</span> ${chk.ok ? '' : '<b class="red">Extreme Asymmetric Premium Warning: this will be blocked and flagged to your instructor.</b>'}</td></tr></tbody></table>`;
}
function exchHTML(S, U) {
  const g = S.game, T = (U.trade ||= { want: new Set() });
  const roster = S.roster();
  if (!T.to || !roster.some((r) => r.pid === T.to)) T.to = roster[0]?.pid;
  const partner = roster.find((r) => r.pid === T.to);
  const incoming = S.incoming.map(({ offer: o, handle }) => { const c = g.checkOffer(o); return `<div class="card small"><b>${esc(handle || o.fromHandle || o.from)}</b> offers ${o.give.assets.map((a) => esc(aName(a))).join(', ') || 'no assets'}${o.give.cash ? ' + ' + money(o.give.cash) : ''}${o.give.royalty ? ` + ${money(o.give.royalty.perDay)}/day for ${o.give.royalty.days}d` : ''} for ${o.want.assets.map((a) => esc(aName(a))).join(', ') || 'nothing'}${o.want.cash ? ' + ' + money(o.want.cash) : ''}. <span class="chip ${c.ok ? 'good' : 'bad'}">${(c.variance * 100).toFixed(0)}% from FMV</span>
    <div class="row gap"><button class="btn sm green" data-act="accept" data-id="${o.id}" data-fid="ac-${o.id}">Approve</button><button class="btn sm ghost" data-act="decline" data-id="${o.id}" data-fid="de-${o.id}">Reject</button></div></div>`; }).join('');
  const outgoing = [...S.sent.values()].map(({ offer: o }) => `<div class="card small">Waiting on ${esc(o.to)}: your ${o.give.assets.map((a) => esc(aName(a))).join(', ') || 'cash'} in escrow. <button class="btn sm ghost" data-act="withdraw" data-id="${o.id}" data-fid="wd-${o.id}">Withdraw</button></div>`).join('');
  const noRoom = S.mode === 'solo' ? `<div class="callout"><b>Solo practice.</b> Trade with the Practice Partner, who accepts fair deals (within 30% of FMV). Join a classroom room from the Menu to trade with real classmates.</div>` : '';
  return `${noRoom}${incoming ? '<h3>Invitations</h3><div class="grid">' + incoming + '</div>' : ''}${outgoing ? '<h3 class="gap">Sent</h3><div class="grid">' + outgoing + '</div>' : ''}
    <h3 class="gap">New proposal</h3>
    <div class="grid g2"><div><label for="x-to">Counterparty Founder ID</label><select id="x-to" data-change="xto" data-fid="x-to">${roster.map((r) => `<option value="${esc(r.pid)}" ${r.pid === T.to ? 'selected' : ''}>${esc(r.handle)} (${esc(r.pid)})${r.npc ? ' - practice' : ''}</option>`).join('')}</select></div>
    <div><label for="x-gc">Cash you add</label><input id="x-gc" inputmode="decimal" data-input="xfield" data-k="giveCash" value="${esc(T.giveCash ?? '')}" placeholder="0"></div>
    <div><label for="x-wc">Cash you ask for</label><input id="x-wc" inputmode="decimal" data-input="xfield" data-k="wantCash" value="${esc(T.wantCash ?? '')}" placeholder="0"></div>
    <div><label for="x-r">Royalty you pay per day (optional)</label><input id="x-r" inputmode="decimal" data-input="xfield" data-k="roy" value="${esc(T.roy ?? '')}" placeholder="0"><label for="x-rd" class="tiny gap">for how many days</label><input id="x-rd" inputmode="numeric" data-input="xfield" data-k="royDays" value="${esc(T.royDays ?? 10)}"></div></div>
    <p class="small mute gap">You offer the assets selected in your inventory (${[...U.sel].length} selected). Choose what you want from ${esc(partner?.handle || 'them')}:</p>
    <div class="grid g3" role="group" aria-label="Counterparty assets">${(partner?.inventory || []).map((a) => `<button class="card asset" aria-pressed="${T.want.has(a.id)}" data-act="want" data-id="${esc(a.id)}" data-fid="w-${esc(a.id)}">${ic(ASSETS[a.cls].icon)}<span class="nm">${esc(aName(a))}</span><span class="small mono">${money(a.fmv)}</span><span class="tiny mute">${esc(ZONES[a.zone].short)}</span></button>`).join('') || '<p class="mute small">They have nothing listed.</p>'}</div>
    <div id="vmatrix" class="gap">${matrixHTML(S, U)}</div>
    <div class="row gap"><button class="btn" data-act="send" data-fid="x-send">Submit proposal</button><span class="small mute">Your side is held in escrow until they answer.</span></div>`;
}

// ---------------------------------------------------------------- bank, clients, skills, audit, ledger
export function bankHTML(S, U) {
  const g = S.game, s = g.s;
  if (!s.mil.m1) return `<div class="callout warn"><b>The Commercial Bank opens at $1,000 net worth</b> (Milestone 1). You are at ${money(g.netWorth())}.</div><p class="mute">Leverage is a lesson in itself: debt-to-equity is capped at ${DEBT.maxDE.toFixed(1)}; past ${DEBT.callDE} the bank liquidates your best pipelines at a 35% discount.</p>`;
  const de = g.deRatio(), shown = isFinite(de) ? de : 9, m = g.mods();
  const facs = Object.entries(LOANS).map(([id, L]) => {
    const r = g.loanRoom(id), block = g.loanBlock(id);
    return `<div class="card"><div class="row"><b>${esc(L.name)}</b><span class="grow"></span><span class="chip info">${(g.loanRate(id) * 100).toFixed(1)}% / 30 days</span></div><p class="small mute">${esc(L.note)}</p>
      <div class="small">Available <b class="mono">${money(r.room)}</b> &middot; owed <span class="mono">${money(r.owed)}</span></div>
      ${block ? `<div class="callout warn small">${esc(block)}</div>` : `<div class="row gap"><label class="sr" for="dr-${id}">Amount to draw</label><input id="dr-${id}" type="range" min="0" max="${Math.floor(r.room)}" step="${r.room > 5000 ? 100 : 10}" value="${U.draw?.[id] ?? 0}" data-input="drawamt" data-p="${id}" style="max-width:14rem"><output class="mono" id="dro-${id}">${money(U.draw?.[id] ?? 0)}</output><button class="btn sm" data-act="draw" data-p="${id}" data-fid="dr-btn-${id}">Execute</button></div>`}</div>`;
  }).join('');
  const loans = s.loans.map((l) => `<tr><td>${esc(LOANS[l.prod].name)}</td><td class="mono">${money(l.principal)}</td><td class="mono red">+${money(l.accr)}</td><td class="mono">${(g.loanRate(l.prod) * 100).toFixed(1)}%</td><td>${dur(l.next - s.hour)}</td><td><button class="btn sm ghost" data-act="repay" data-id="${l.id}" data-fid="rp-${l.id}">Repay all</button></td></tr>`).join('');
  return `${m.freeze ? '<div class="callout bad"><b>Credit Action Override.</b> No new loans until the freeze lifts. Open lines are re-rating at the new index.</div>' : ''}
    <div class="card"><div class="row"><b>Debt-to-equity</b><span class="grow"></span><span class="mono ${de > DEBT.maxDE ? 'red' : ''}">${isFinite(de) ? de.toFixed(2) : 'insolvent'}</span></div>
      <div class="gauge gap" role="img" aria-label="Debt to equity ${isFinite(de) ? de.toFixed(2) : 'infinite'}. Borrowing limit ${DEBT.maxDE}. Margin call ${DEBT.callDE}."><i style="width:${Math.min(100, shown / 6 * 100)}%;background:${de > DEBT.callDE ? 'var(--red)' : de > DEBT.maxDE ? 'var(--gold)' : 'var(--green)'}"></i><span class="mk" style="left:${DEBT.maxDE / 6 * 100}%"></span><span class="mk" style="left:${DEBT.callDE / 6 * 100}%;background:var(--red)"></span></div>
      <div class="row tiny mute"><span>0</span><span class="grow"></span><span>limit ${DEBT.maxDE}</span><span class="grow"></span><span>margin call ${DEBT.callDE}</span></div>
      <div class="small gap">Base index <b>${((0.025 + m.rateBps / 10000) * 100).toFixed(1)}%</b> per 30 days. Your Fintech level ${g.lvl('fintech')} trims every spread.</div></div>
    <div class="grid gap">${facs}</div>
    ${s.loans.length ? `<h2 class="gap">Open liabilities</h2><table class="tbl"><thead><tr><th scope="col">Facility</th><th scope="col">Principal</th><th scope="col">Accrued</th><th scope="col">Rate</th><th scope="col">Compounds in</th><th scope="col"><span class="sr">Action</span></th></tr></thead><tbody>${loans}</tbody></table>` : ''}`;
}

export function clientsHTML(S, U) {
  const g = S.game, s = g.s;
  const tiers = Object.entries(CLIENTS).map(([id, C]) => {
    const q = g.clientQuote(id), n = s.clients.filter((c) => c.tier === id).length;
    const locked = !s.zones.includes(C.zone) || (C.needs && !s.mil[C.needs]);
    return `<div class="card">${ic(C.icon)}<b>${esc(C.name)}</b> <span class="chip">${n}/${C.max}</span><p class="small mute">${esc(C.blurb)}</p>
      <dl class="kv"><dt>Acquisition cost (CAC)</dt><dd>${money(q.cac)}</dd><dt>Lifetime value (LTV)</dt><dd>${money(q.ltv)}</dd><dt>LTV : CAC</dt><dd class="${q.ratio >= 3 ? 'green' : 'gold'}">${q.ratio.toFixed(1)} : 1</dd><dt>Payback</dt><dd>${q.payback.toFixed(1)} days</dd><dt>SLA</dt><dd>${C.minRunning} pipeline${C.minRunning === 1 ? '' : 's'} running daily</dd></dl>
      <button class="btn sm gap" data-act="client" data-t="${id}" data-fid="cl-${id}" ${locked ? 'aria-disabled="true"' : ''}>${locked ? 'Locked' : 'Sign for ' + money(q.cac)}</button></div>`;
  }).join('');
  const act = s.clients.map((c) => { const C = CLIENTS[c.tier]; return `<div class="card small"><div class="row"><b>${esc(C.name)}</b><span class="grow"></span><span class="mono green">+${money(c.earned)}</span></div><div class="bar green" aria-hidden="true"><i data-bar="client:${c.id}"></i></div><span class="mute">SLA breaches: ${c.breaches}/2 &middot; ends in ${dur(c.until - s.hour)}</span></div>`; }).join('');
  let exit = '';
  if (s.exiting) exit = `<div class="callout good"><b>Exit settling.</b> Governance drag: ${dur(s.exiting.at - s.hour)} left.</div>`;
  else if (s.exit) exit = `<div class="callout good"><b>Exited.</b> Locked at ${money(s.exit.nw)} with ${Math.round(s.exit.daysLeft)} days to spare.</div>`;
  else if (s.mil.m3) exit = `<p class="small mute">Exiting ends the run early and locks your score. The EEI multiplier is (1 + days remaining / 90), so leaving early only wins if you could not have grown more than that over the remaining days.</p><div class="row"><button class="btn" data-act="exit" data-k="ipo" data-fid="ex-ipo">IPO preparation</button><button class="btn ghost" data-act="exit" data-k="sale" data-fid="ex-sale">Trade sale (M&amp;A)</button></div>`;
  else exit = `<p class="mute small">Exit options (M&amp;A and IPO) open at ${money(MIL.m3)} net worth.</p>`;
  return `<h2>Client tiers: CAC vs LTV</h2><p class="small mute">Marketing capital buys recurring revenue, but each account has a service-level agreement. Miss it twice and the client leaves.</p><div class="grid g2">${tiers}</div>${act ? '<h3 class="gap">Active accounts</h3><div class="grid">' + act + '</div>' : ''}<h2 class="gap">Corporate exit</h2>${exit}`;
}

export function skillsHTML(S) {
  const g = S.game, s = g.s;
  const eff = { ops: (l) => `Repair cost x${(0.42 ** (l - 1)).toFixed(2)}, restore quality ${Math.round((0.5 + 0.5 * Math.min(1, (l - 1) / 4)) * 100)}%`, growth: (l) => `Leads +${(l - 1) * 15}%, pitch price +${(l - 1) * 4}%, CAC -${Math.min(50, (l - 1) * 8)}%`, fintech: (l) => `Fees -${Math.min(50, (l - 1) * 6)}%, loan spreads -${Math.min(55, (l - 1) * 7)}%, shock warning ${l >= 5 ? '7 days' : l >= 3 ? '72 hours' : '12 hours'}` };
  return `<h2>Skill specialties</h2><div class="grid g2">${Object.entries(SKILLS).map(([id, K]) => { const l = s.skills[id]; return `<div class="card"><b>${esc(K.name)}</b> ${s.specialty === id ? '<span class="badge">Specialty</span>' : ''}<div class="mono gold" style="font-size:1.4rem">Level ${l}</div><div class="bar gold" aria-hidden="true"><i style="width:${l / SKILL_MAX * 100}%"></i></div><p class="small mute">${esc(K.blurb)}</p><p class="small">Now: ${eff[id](l)}</p><button class="btn sm" data-act="train" data-s="${id}" data-fid="tr-${id}" ${l >= SKILL_MAX ? 'aria-disabled="true"' : ''}>${l >= SKILL_MAX ? 'Mastered' : 'Train ' + money(trainCost(l))}</button></div>`; }).join('')}</div>
    <h2 class="gap">Progress</h2><dl class="kv"><dt>Founder level</dt><dd>${g.level()} (${s.xp} XP)</dd><dt>Win streak</dt><dd>${s.streak} (best ${s.bestStreak})</dd><dt>Creativity score</dt><dd>${g.creativityScore().toFixed(0)} / 100</dd><dt>Peer swaps completed</dt><dd>${s.p2p}</dd><dt>Trades</dt><dd>${s.trades}</dd></dl>`;
}

export function auditHTML(S) {
  const g = S.game, s = g.s, a = s.auditPending;
  const fine = g.auditFine();
  const hist = `<dl class="kv"><dt>Filings passed</dt><dd>${s.auditPass}</dd><dt>Failures (compounding)</dt><dd class="${s.auditFail ? 'red' : ''}">${s.auditFail}</dd><dt>Zone 2 velocity</dt><dd>${(s.velPenalty * 100).toFixed(0)}%</dd><dt>Next fine if caught</dt><dd>${money(fine)}</dd></dl>`;
  if (!a) return `<h2>Regulatory compliance</h2><div class="callout good">No audit pending.${s.auditNext != null ? ' Next review in ' + dur(s.auditNext - s.hour) + '.' : ''}</div>${hist}`;
  const pipes = s.pipes.length;
  return `<h2>Regulatory audit</h2><div class="callout warn"><b>${esc(a.title)}</b> &middot; ${esc(a.text)}<br>Respond within <b>${dur(a.due - s.hour)}</b>. Ignoring it triggers the penalty automatically and compounds.</div>
    <div class="grid g2">
      <button class="card pick btn ghost" style="text-transform:none;letter-spacing:0;text-align:left" data-act="audit" data-c="A" data-fid="au-a"><b>A. File with a compliance consultant</b><br><span class="small">Flat ${money(AUDIT.fee)}. Pipelines untouched. Low risk.</span></button>
      <button class="card pick btn ghost" style="text-transform:none;letter-spacing:0;text-align:left" data-act="audit" data-c="B" data-fid="au-b" ${pipes ? '' : 'aria-disabled="true"'}><b>B. Put an in-house agent on it</b><br><span class="small">$0 cash, but one pipeline pauses for 5 virtual days. Opportunity cost.</span></button>
      <button class="card pick btn ghost" style="text-transform:none;letter-spacing:0;text-align:left" data-act="audit" data-c="C" data-fid="au-c"><b>C. Bypass the filing (high risk)</b><br><span class="small">15% chance to slip through; 85% a ${money(fine)} fine and a permanent -15% Zone 2 velocity hit.</span></button></div>${hist}`;
}

export function ledgerHTML(S, U) {
  const rows = [...S.game.s.ledger].reverse().filter((e) => !U.logF || U.logF === 'all' || e.type === U.logF).slice(0, 120);
  const types = ['all', 'pitch', 'buy', 'repair', 'pool', 'freight', 'pipe', 'hire', 'client', 'loan', 'repay', 'audit', 'p2p', 'train', 'exit', 'margin'];
  return `<div class="row"><h2 class="grow">Transaction ledger</h2><label class="sr" for="lf">Filter</label><select id="lf" data-change="logf" data-fid="lf">${types.map((t) => `<option ${U.logF === t || (!U.logF && t === 'all') ? 'selected' : ''}>${t}</option>`).join('')}</select><button class="btn sm ghost" data-act="csv">Export CSV</button></div>
    <div class="scroll" style="max-height:30rem"><table class="tbl"><thead><tr><th scope="col">Day</th><th scope="col">Type</th><th scope="col">What</th><th scope="col" class="right">Amount</th><th scope="col" class="right">Cm</th></tr></thead><tbody>${rows.map((e) => `<tr><td class="mono">${Math.floor(e.h / 24) + 1}</td><td>${esc(e.type)}</td><td>${esc(e.text)}</td><td class="right mono ${e.amt >= 0 ? 'green' : 'red'}">${e.amt ? money(e.amt, { plus: true }) : ''}</td><td class="right mono">${e.cm ? e.cm.toFixed(2) : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

// ---------------------------------------------------------------- map
export function mapHTML(S, U) {
  const g = S.game, s = g.s;
  const zone = (n, x, y, w, h, fill, art) => {
    const open = s.zones.includes(n), Z = ZONES[n];
    return `<g class="zone-btn" role="button" tabindex="0" data-act="zone" data-z="${n}" data-go="trade" data-fid="mz-${n}" aria-label="${Z.name}. ${open ? 'Open' : 'Locked'}. Tax ${(Z.tax * 100).toFixed(1)} percent. Cycle speed ${Z.speed}x. Liquidity pool ${money(Z.pool)}. Activate to trade here.">
      <rect class="hit" x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${n === U.zone ? '#ffc247' : '#34445c'}" stroke-width="${n === U.zone ? 5 : 2}" opacity="${open ? 1 : .45}"/>${art}
      <text x="${x + 14}" y="${y + 28}" font-size="18" font-weight="700">${Z.name}</text>
      <text x="${x + 14}" y="${y + 50}" font-size="13">tax ${(Z.tax * 100).toFixed(1)}%  &#183;  speed ${Z.speed}x  &#183;  pool ${money(Z.pool, { compact: true })}</text>
      <text x="${x + 14}" y="${y + h - 14}" font-size="13">${open ? `you hold ${s.assets.filter((a) => a.zone === n).length} asset(s)${s.pipes.filter((p) => p.zone === n).length ? ', ' + s.pipes.filter((p) => p.zone === n).length + ' manager(s)' : ''}` : (n === 2 ? 'Gate 1: $1,000 net worth' : 'Gate 3: $250,000 net worth')}</text></g>`;
  };
  const junk = '<g fill="#6b7078">' + [[40, 100, 50, 30], [100, 120, 36, 22], [150, 96, 44, 36]].map(([a, b, c, d]) => `<rect x="${a}" y="${b + 270}" width="${c}" height="${d}"/>`).join('') + '</g>';
  const blocks = '<g fill="#3c5a86">' + [0, 1, 2, 3].map((i) => `<rect x="${360 + i * 56}" y="${210 + (i % 2) * 14}" width="40" height="${70 - (i % 2) * 14}"/>`).join('') + '</g>';
  const towers = '<g fill="#7a5fd0">' + [0, 1, 2, 3, 4].map((i) => `<rect x="${640 + i * 40}" y="${70 + (i % 3) * 22}" width="28" height="${110 - (i % 3) * 22}"/>`).join('') + '</g>';
  const routes = s.freight.map((f) => { const c = { 1: [150, 360], 2: [450, 240], 3: [720, 130] }; const [x1, y1] = c[f.items[0].zone ?? 1] || c[1], [x2, y2] = c[f.to]; return `<path class="route" d="M${x1} ${y1} L${x2} ${y2}" stroke="#ffc247" stroke-width="4" fill="none"/>`; }).join('');
  const legend = `<p class="small mute">Zone 1 is hands-on, Zone 2 adds staffing and banking, Zone 3 adds enterprise clients and exits. Freight runs cost ${pct(0.045, 1)} of book value and take 6 virtual hours (damage risk falls with Ops). Select a zone to trade there.</p>`;
  return `<svg class="map" viewBox="0 0 880 440" role="group" aria-label="Game map with three zones">${routes}
    ${zone(1, 20, 250, 300, 170, '#223024', junk)}${zone(2, 330, 150, 250, 190, '#1c2a40', blocks)}${zone(3, 590, 20, 270, 190, '#251f40', towers)}
    <path d="M320 330 L330 300" stroke="#34445c" stroke-width="3"/><path d="M580 200 L600 190" stroke="#34445c" stroke-width="3"/></svg>${legend}`;
}

// ---------------------------------------------------------------- dialogs
export function pitchDialog(q) {
  const { lead, asset: a, ci, parts: p } = q, B = BUYERS[lead.seg];
  const r = (k, v, cls = '') => `<dt>${k}</dt><dd class="${cls}">${v}</dd>`;
  return `<h2 tabindex="-1" autofocus>Pitch ${esc(aName(a))} to ${esc(B.name)}</h2>
    <dl class="kv">
      ${r('Asset Utility Score (scarcity x demand - depreciation)', `${Math.round(utilityIn(a.cls, a.zone, q.mods, 1))} / 100`)}
      ${r('Fair market value', money(q.fmv))}
      ${r('Buyer fit', `${fitLabel(q.fit)} (${Math.round(q.fit * 100)}%)`, q.fit < 0.15 ? 'red' : '')}
      ${r('Niche volume', `${ci.vN.toFixed(1)} of ${ci.vT.toFixed(1)} pitches in 48h (saturation ${pct(ci.S)})`)}
      ${r('Creativity multiplier Cm', `<b>${ci.cm.toFixed(2)}x</b> ${ci.band.label}`, ci.cm < 0.8 ? 'red' : ci.cm > 2 ? 'green' : '')}
      <div class="sep"></div>
      ${r(lead.need ? 'Buyer urgency value' : 'Reference value', money(p.ref))}
      ${r('x fit term', p.term.toFixed(2))}${r('x buyer-offer base', p.base.toFixed(2))}${r('x creativity Cm', p.cm.toFixed(2))}
      ${p.growth !== 1 ? r('x Growth skill', p.growth.toFixed(2)) : ''}${p.hustle !== 1 ? r('x Hustle Multiplier', p.hustle.toFixed(2)) : ''}
      ${r('Offer' + (q.capped ? ' (capped at their budget)' : ''), money(q.price))}
      ${r('Zone tax', pct(q.tax, 1))}${r('Institutional fee', pct(q.fee, 1))}
      <div class="sep"></div>
      ${r('You receive', `${q.goods ? esc(ASSETS[q.goods.cls].name) + (q.goods.cond === 'broken' ? ' (broken)' : '') + ' worth ' + money(q.goods.value) + ' + ' : ''}${money(q.change)}${q.goods ? ' change' : ''}`, 'gold')}
      ${r('Change vs your asset\'s value', gain(q.gain))}
    </dl>
    ${ci.band.id === 'herd' ? '<div class="callout bad"><b>Linear herd trap.</b> Most of the class already sells this combination here, so the multiplier hit its 0.40 floor. Try a different buyer with a decent fit.</div>' : ''}
    ${ci.band.id === 'pioneer' ? '<div class="callout good"><b>Pioneer vector.</b> Almost nobody serves this niche. Expect a premium.</div>' : ''}
    <div class="row gap"><button class="btn big" data-act="pitch-go" data-lead="${lead.id}" data-asset="${a.id}" autofocus>Confirm pitch</button><button class="btn ghost" data-close>Cancel</button></div>`;
}

export function resultDialog(r, g) {
  const B = BUYERS[r.lead.seg], a = r.asset;
  const kind = r.outcome === 'rejected' ? 'bad' : r.outcome === 'herd' ? 'warn' : r.outcome === 'flat' ? 'warn' : 'good';
  const title = { rejected: 'TRADE REJECTED', herd: 'MARGIN COMPRESSION', flat: 'TRADED, NO GAIN', win: 'SUCCESSFUL ARBITRAGE!', pioneer: 'MARKET EFFICIENCY EXPLOITED!' }[r.outcome];
  const why = r.outcome === 'rejected' ? `${esc(B.name)} has almost no use for ${esc(ASSETS[a.cls].name)} (fit ${Math.round(r.fit * 100)}%). Match the asset to the buyer's needs.`
    : r.outcome === 'herd' ? `Saturation ${pct(r.ci.S)}: ${r.ci.vN.toFixed(0)} of ${r.ci.vT.toFixed(0)} recent pitches went to this exact buyer, so Cm fell to ${r.ci.cm.toFixed(2)}.`
      : r.outcome === 'pioneer' ? `Cm ${r.ci.cm.toFixed(2)}x: only ${r.ci.vN.toFixed(1)} of ${r.ci.vT.toFixed(0)} recent pitches served this niche.`
        : `Fit ${Math.round(r.fit * 100)}% and Cm ${r.ci.cm.toFixed(2)}x.`;
  return `<div class="result ${kind} popin"><div class="rtitle">${title}</div>
    ${r.outcome === 'rejected' ? '<p>The buyer walks away. The lead is gone, the asset stays with you. No XP.</p>' : `<p>${r.gotName ? 'You received <b>' + esc(r.gotName) + '</b> and ' : 'You received '}<b class="gold">${money(r.change)}</b>${r.gotName ? ' change' : ''}.</p><div class="banner">${r.gain >= 0 ? '+' : ''}${(r.gain * 100).toFixed(0)}% asset valuation change</div><p><b>+${r.xp} XP</b></p>`}
    <p class="small mute">Why: ${why}</p><button class="btn big" data-close autofocus>Continue</button></div>`;
}

export function alertDialog(a) {
  const row = (k, v) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`;
  return `<h2 tabindex="-1" autofocus>${esc(a.name)}</h2><table class="tbl"><caption class="sr">Macro alert</caption><tbody>
    ${row('Alert identity code', `<span class="mono">${esc(a.code)}</span>`)}${row('Disruption severity', `Level ${a.level || 1} disruption`)}${row('Systemic market readout', `<b>${esc(a.readout)}</b>`)}
    ${(a.vars || []).map((v, i) => row('Primary variable alteration ' + (i + 1), esc(v))).join('')}${row('Enforcement status', esc(a.enforcement))}</tbody></table>
    <p class="small mute gap">${a.start != null ? 'Effective ' + (a.start < 0 ? '' : 'Day ' + (Math.floor(a.start / 24) + 1) + ', 00:00 virtual time.') : ''} Higher Fintech levels and the Market Research Suite buy you earlier notice.</p><button class="btn" data-close autofocus>Understood</button>`;
}

export function helpHTML() {
  return `<button class="btn ghost sm x" data-close>Close</button><h2 tabindex="-1" autofocus>How it works</h2>
    <div class="grid g2">
    <div class="card"><h3>The loop</h3><p class="small">Source stock, repair it if you have Ops, pitch it to the buyer who values it most, and use the proceeds to climb. At $1,000 the Metro Hub and the Commercial Bank open. At $25,000 you face audits. At $250,000 Corporate Valley opens.</p></div>
    <div class="card"><h3>Asset Utility Score</h3><p class="small mono">(Scarcity x Local Demand) - Depreciation</p><p class="small">Sets what an asset is worth in a zone. Demand moves with market events and with how many classmates are selling the same thing.</p></div>
    <div class="card"><h3>Creativity Multiplier</h3><p class="small mono">Cm = [0.40 + ln((V_total+2)/(V_niche+1))] x (1 - S)</p><p class="small">V_total is how many pitches of this asset class the cohort made in 48 virtual hours, V_niche how many went to this exact buyer. Crowded niches floor at 0.40x, untouched ones reach 3.14x.</p></div>
    <div class="card"><h3>Score</h3><p class="small mono">EEI = ending net worth / starting capital x (1 + days remaining / 90)</p><p class="small">Efficiency, not raw wealth. Starting capital is floored for the Bootstrapper so $0.05 does not distort the board.</p></div>
    <div class="card"><h3>Working capital</h3><p class="small">A manager locks your allocation for a full cycle and returns it with a margin, minus fees, tax, royalty and overhead. Idle cash earns nothing; stock decays.</p></div>
    <div class="card"><h3>Keyboard</h3><p class="small">Tab and Shift+Tab move. Enter or Space activates. Arrow keys switch tabs. Escape closes windows. Everything is also announced to screen readers.</p></div></div>
    <p class="small mute gap">Every number in the game is tunable by your instructor. Your decisions are logged in the Ledger for your reflection paper.</p>`;
}
