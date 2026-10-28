// Crew drawer: your managers as cards, the hire dialog, business upgrades and client accounts (docs/V2_DESIGN.md section 8).
// Contract: see the header of ../shell.js. State that must survive a redraw lives in ctx.U.crew; the HTML is rebuilt from the engine every time.
// The world opens this drawer with U.hireAt (a district id: open the hire dialog there) or U.focusPipe (a manager id: scroll to it and highlight it);
// both are read once, in html(), and cleared.
import { ZONES, ASSETS, BUYERS, PIPE, PIPE_RULES, UPGRADES, CLIENTS, MIL_ZONE } from '../../config.js';
import { fitOf, fitLabel } from '../../market.js';
import { esc } from '../common.js';

// ---------------------------------------------------------------- small helpers
const ST = (ctx) => {
  const C = (ctx.U.crew ||= {});
  C.tab ||= 'crew'; C.hire ??= null; C.flash ??= null; C.flashUntil ??= 0;
  return C;
};
const later = (fn, ms = 0) => { const t = setTimeout(fn, ms); t?.unref?.(); return t; };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const dur = (h) => { h = Math.max(0, Math.round(h)); const d = Math.floor(h / 24), r = h % 24; return d ? (r ? `${d}d ${r}h` : `${d}d`) : `${r}h`; };
const view = (ctx) => { const g = ctx.g(); return { ctx, g, s: g.s, m: ctx.money, C: ST(ctx) }; };
const sgn = (v, x) => v.m(x, { plus: true });
const tone = (x) => (x >= 0 ? 'green' : 'red');

/** The Creativity Engine, in words. Glyphs and labels carry the meaning; colour only backs them up. */
const BANDS = {
  herd: { glyph: '⚠', tone: 'bad', note: 'The herd trap: too many pitches chase this buyer, so your margin shrinks.' },
  crowded: { glyph: '◐', tone: 'warn', note: 'Getting crowded: a quieter buyer would pay you more.' },
  balanced: { glyph: '●', tone: 'info', note: 'A healthy niche, with room for you.' },
  pioneer: { glyph: '★', tone: 'good', note: 'Pioneer lane: few others are here, so your margin is boosted.' },
};
const bandOf = (ci) => BANDS[ci.band.id] || BANDS.balanced;
const cmChip = (ci) => `<span class="chip ${bandOf(ci).tone}"><span aria-hidden="true">${bandOf(ci).glyph}</span> ${esc(ci.band.label)} ${ci.cm.toFixed(2)}x</span>`;
const crowdWords = (ci) => (ci.vT < 2 ? 'Almost nobody else is pitching this niche.' : `${Math.round(ci.vN)} of ${Math.round(ci.vT)} recent pitches use this niche.`);
const laneName = (cls, seg) => `${esc(ASSETS[cls]?.name || 'No lane yet')} to ${esc(BUYERS[seg]?.name || '?')}`;

function statusOf(p) {
  if (p.status === 'paused') return { key: 'paused', glyph: '⏸', tone: 'warn', label: 'Paused' };
  if (p.status === 'audit') return { key: 'audit', glyph: '🛡', tone: 'warn', label: 'On compliance duty' };
  if (p.status === 'running') return { key: 'running', glyph: '▶', tone: 'good', label: 'Running' };
  if (!p.cls) return { key: 'nolane', glyph: '◌', tone: 'warn', label: 'Needs a lane' };
  if (p.starved) return { key: 'starved', glyph: '⚠', tone: 'bad', label: 'Waiting for cash' };
  return { key: 'idle', glyph: '◌', tone: '', label: 'Idle' };
}
const hiredEver = (s) => s.pipes.length > 0 || s.ledger.some((e) => e.type === 'hire' && String(e.text).startsWith('Hired'));
const autoDistricts = (v) => {
  const list = v.s.zones.filter((z) => ZONES[z].auto), cur = v.ctx.U.zone;
  return list.includes(cur) ? [cur, ...list.filter((z) => z !== cur)] : list;
};

/** Everything that stops a new hire in a district, in one line (empty when nothing does). */
function hireBlock(v, zone) {
  const { g, s } = v;
  if (!ZONES[zone]?.auto) return 'Nobody can be hired here. This district is done by hand.';
  if (!s.zones.includes(zone)) return `${ZONES[zone].name} is not open yet.`;
  if (g.autoLocked()) return 'Hiring is locked until you answer your audit. The Bank has it.';
  if (s.pipes.filter((p) => p.zone === zone).length >= ZONES[zone].plots) return `All ${ZONES[zone].plots} plots in ${ZONES[zone].name} are staffed. Release a manager to make room.`;
  return '';
}

/** Ranked lanes for a district: the engine's radar, best first. */
function lanesFor(v, zone, take, keep, skip = null) { // `skip`: the manager being edited, whose own cycles are not part of the crowd it sells into (as its forecast reads them)
  const { g } = v, all = g.radar(zone, 60, skip), key = (r) => `${r.cls}|${r.seg}`;
  const rank = new Map(all.map((r, i) => [key(r), i + 1]));
  const rows = all.slice(0, take).map((r) => ({ ...r, rank: rank.get(key(r)) }));
  for (const k of keep) {
    if (!k.cls || !k.seg || rows.some((r) => key(r) === key(k))) continue;
    const got = all.find((r) => key(r) === key(k));
    rows.push(got ? { ...got, rank: rank.get(key(k)) } : { cls: k.cls, seg: k.seg, fit: fitOf(k.cls, k.seg), ...g.cmFor(zone, k.cls, k.seg, skip), rank: 0 });
  }
  return { rows, total: all.length };
}

// ---------------------------------------------------------------- manager cards
function upgradeInfo(v, p) {
  const { g, s } = v;
  if (p.level >= PIPE_RULES.maxLevel) return { maxed: true, why: 'Top level reached.' };
  const cost = g.pipeUpCost(p), cap = g.pipeCap(p), nextCap = g.pipeCap({ ...p, level: p.level + 1 });
  const cur = g.forecast({ ...p, alloc: cap }), nxt = g.forecast({ ...p, level: p.level + 1, alloc: nextCap });
  const gain = nxt.perDay - cur.perDay;
  const why = g.autoLocked() ? 'Locked until you answer your audit. The Bank has it.' : s.cash < cost ? `Short by ${v.m(cost - s.cash)}.` : '';
  return { cost, cap, nextCap, gain, payback: gain > 0 ? cost / gain : null, why };
}

/** A quieter lane for a crowded manager, from one radar read per district per draw. */
function betterLane(v, p, f, cache) {
  if (f.ci.band.id !== 'herd' && f.ci.band.id !== 'crowded') return null;
  const rows = (cache[p.zone] ||= v.g.radar(p.zone, 6));
  return rows.find((r) => !(r.cls === p.cls && r.seg === p.buyer) && (r.band.id === 'pioneer' || r.band.id === 'balanced') && r.cm > f.ci.cm * 1.25) || null;
}

function pipeCard(v, p, cache) {
  const { g, s, m, C } = v, K = PIPE[p.kind], Z = ZONES[p.zone], f = g.forecast(p), stt = statusOf(p), cap = f.cap, alloc = f.alloc, up = upgradeInfo(v, p);
  const flash = C.flash === p.id && Date.now() < C.flashUntil;
  let note = '';
  if (stt.key === 'starved') note = `Needs ${m(alloc)} of free cash to start its next cycle. You have ${m(s.cash)}.`;
  else if (stt.key === 'paused') note = p.inflight ? `Frozen mid-cycle with ${m(p.inflight)} of your capital inside until you resume.` : 'Paused. Resume it to start earning again.';
  else if (stt.key === 'audit') note = `Back at work in ${dur(p.pausedUntil - s.hour)}.`;
  else if (stt.key === 'nolane') note = 'Pick a lane so it knows what to sell, and to whom.';
  else if (stt.key === 'idle' && alloc <= 0) note = 'No capital set. Fund it from Edit lane.';
  const better = betterLane(v, p, f, cache);
  const cyc = p.inflight ? `Cycle ${Math.min(p.prog, p.len)} of ${p.len} hours, ${m(p.inflight)} at work` : `A cycle takes ${f.len} hours`;
  const reasons = [];
  if (up.why && !up.maxed) reasons.push(`<b>Upgrade:</b> ${up.why}`);
  if (p.inflight) reasons.push(`<b>Release:</b> opens when this cycle ends, in ${Math.max(1, p.len - p.prog)}h.`);
  const upBtn = up.maxed
    ? '<span class="chip good"><span aria-hidden="true">★</span> Top level</span>'
    : `<button class="btn" data-act="crew-up" data-id="${p.id}" data-fid="cu-${p.id}" ${up.why ? 'aria-disabled="true"' : ''}>Level ${p.level + 1} for ${m(up.cost)}</button>`;
  const upLine = up.maxed ? '' : `<p class="cr-up small"><b>Level ${p.level + 1}:</b> capacity ${m(up.cap)} to ${m(up.nextCap)} per cycle${up.gain > 0 ? `, about ${sgn(v, up.gain)} a day when fully funded${up.payback ? `, paid back in about ${Math.max(1, Math.round(up.payback))} days` : ''}` : '. This lane cannot use more capital profitably yet'}.</p>`;
  return `<article class="cr-card${flash ? ' cr-focus' : ''}" data-pipe="${p.id}" data-st="${stt.key}" tabindex="-1" aria-label="${esc(K.name)}, level ${p.level}, ${esc(Z.name)}, ${esc(stt.label)}">
    <header class="cr-top"><span class="cr-ic" aria-hidden="true">${K.icon}</span>
      <div class="cr-id"><h4 class="cr-name">${esc(K.name)} <span class="chip">Lv ${p.level} of ${PIPE_RULES.maxLevel}</span></h4>
        <p class="cr-lane"><span aria-hidden="true">${ASSETS[p.cls]?.icon || '📦'}</span> ${laneName(p.cls, p.buyer)}${p.channel === 'intl' ? ' <span class="chip warn">International</span>' : ''}</p></div>
      <span class="chip ${stt.tone}"><span aria-hidden="true">${stt.glyph}</span> ${esc(stt.label)}</span></header>
    <div class="bar gold cr-bar" aria-hidden="true"><i data-bar="pipe:${p.id}"></i></div>
    <p class="small mute cr-cyc">${cyc}.</p>
    <dl class="cr-nums"><div><dt>Per cycle</dt><dd class="mono ${tone(f.net)}">${sgn(v, f.net)}</dd></div><div><dt>Per day</dt><dd class="mono ${tone(f.perDay)}">${sgn(v, f.perDay)}</dd></div><div><dt>Capital</dt><dd class="mono">${m(alloc)} <span class="mute">of ${m(cap)}</span></dd></div></dl>
    <div class="cr-cm">${cmChip(f.ci)}<span class="small">${crowdWords(f.ci)}</span></div>
    <p class="small mute">${bandOf(f.ci).note}${better ? ` A quieter lane: <b>${laneName(better.cls, better.seg)}</b> (${better.cm.toFixed(2)}x).` : ''}</p>
    ${note ? `<p class="cr-note small">${note}</p>` : ''}
    <div class="cr-acts">
      <button class="btn ghost" data-act="crew-edit" data-id="${p.id}" data-fid="ce-${p.id}">Edit lane</button>
      ${upBtn}
      ${alloc < cap - 0.5 ? `<button class="btn ghost" data-act="crew-fill" data-id="${p.id}" data-fid="cf-${p.id}">Fund full ${m(cap)}</button>` : ''}
      <button class="btn ghost" data-act="crew-pause" data-id="${p.id}" data-fid="cp-${p.id}">${p.status === 'paused' ? 'Resume' : 'Pause'}</button>
      <button class="btn ghost danger-text" data-act="crew-rel" data-id="${p.id}" data-fid="cr-${p.id}" ${p.inflight ? 'aria-disabled="true"' : ''}>Release</button></div>
    ${upLine}
    ${reasons.length ? `<p class="cr-why small">${reasons.join(' ')}</p>` : ''}
  </article>`;
}

function hireCard(v, zone) {
  const { g, s, m } = v, Z = ZONES[zone], used = s.pipes.filter((p) => p.zone === zone).length, free = Z.plots - used, block = hireBlock(v, zone);
  const cheapest = Math.min(...Object.keys(PIPE).map((k) => g.pipeCost(k, zone)));
  const first = used === 0;
  return `<div class="cr-hire${block ? ' off' : ''}"><div class="cr-hire-h"><span class="cr-plus" aria-hidden="true">+</span>
      <div><b>Hire a manager in ${esc(Z.name)}</b><small>${plural(free, 'free plot')}. Managers start at ${m(cheapest)}.</small></div></div>
    <p class="small">${first ? 'Idle cash earns nothing. A manager lends it to one niche for a cycle and hands it back with a margin.' : 'Another manager is another niche working for you. Spread them out: crowded niches pay less.'}${s.cash < cheapest ? ` You have ${m(s.cash)}, so keep selling first.` : ''}</p>
    <button class="btn" data-act="crew-hire" data-d="${zone}" data-fid="ch-${zone}" ${block ? 'aria-disabled="true"' : ''}>Hire a manager</button>
    ${block ? `<p class="cr-why small">${esc(block)}${g.autoLocked() ? ' <button class="btn sm ghost" data-act="dock" data-d="bank" data-fid="cr-tobank">Open the Bank</button>' : ''}</p>` : ''}</div>`;
}
/** A one-line version for a district that already has managers: the full card would repeat itself. */
function hireRow(v, zone) {
  const { s, m, g } = v, Z = ZONES[zone], free = Z.plots - s.pipes.filter((p) => p.zone === zone).length, block = hireBlock(v, zone);
  const cheapest = Math.min(...Object.keys(PIPE).map((k) => g.pipeCost(k, zone)));
  return `<div class="cr-hire cr-hire-row${block ? ' off' : ''}"><span class="cr-plus" aria-hidden="true">+</span><span class="grow small"><b>${plural(free, 'free plot')}</b> in ${esc(Z.name)}, from ${m(cheapest)}.</span>
    <button class="btn" data-act="crew-hire" data-d="${zone}" data-fid="ch-${zone}" ${block ? 'aria-disabled="true"' : ''}>Hire a manager</button>${block ? `<span class="cr-why small">${esc(block)}</span>` : ''}</div>`;
}

function districtBlock(v, zone, cache) {
  const { s } = v, Z = ZONES[zone], pipes = s.pipes.filter((p) => p.zone === zone), used = pipes.length, free = Z.plots - used;
  const dots = Array.from({ length: Z.plots }, (_, i) => `<i class="${i < used ? 'on' : ''}"></i>`).join('');
  return `<section class="cr-dist" aria-label="${esc(Z.name)} managers"><h3 class="cr-dh"><span aria-hidden="true">${Z.icon}</span> ${esc(Z.name)}
      <span class="cr-plots" role="img" aria-label="${used} of ${Z.plots} plots staffed">${dots}</span><span class="small mute">${used} of ${Z.plots} plots</span></h3>
    ${pipes.map((p) => pipeCard(v, p, cache)).join('')}
    ${free > 0 ? (used ? hireRow(v, zone) : hireCard(v, zone)) : `<p class="small mute">All ${Z.plots} plots staffed. Upgrade a manager to earn more from the same plot.</p>`}</section>`;
}

function summary(v) {
  const { g, s, m } = v;
  const live = s.pipes.filter((p) => p.status === 'running' || p.status === 'idle');
  const perDay = live.reduce((a, p) => a + g.forecast(p).perDay, 0), working = s.pipes.reduce((a, p) => a + (p.inflight || 0), 0);
  return `<div class="cr-sum" role="group" aria-label="Crew summary"><div><small>Managers</small><b class="mono">${s.pipes.length}</b></div><div><small>Running</small><b class="mono">${s.pipes.filter((p) => p.status === 'running').length}</b></div>
    <div><small>Net per day</small><b class="mono ${tone(perDay)}">${sgn(v, perDay)}</b></div><div><small>Capital at work</small><b class="mono">${m(working)}</b></div></div>`;
}

function crewTab(v) {
  const { g, s } = v, zones = autoDistricts(v), cache = {};
  const main = zones.filter((z) => z === v.ctx.U.zone || s.pipes.some((p) => p.zone === z)), rest = zones.filter((z) => !main.includes(z) && ZONES[z].plots > 0);
  if (!zones.length) return `<div class="callout"><b>Managers start in ${ZONES[5].name}.</b> It opens at ${v.m(ZONES[5].gate)} net worth. Until then every district is done by hand.</div>`;
  return `${g.autoLocked() ? `<div class="callout warn"><b>Expansion is locked.</b> ${s.auditPending ? 'Answer your audit in the Bank to hire and upgrade again.' : 'Your first audit is being scheduled. Hiring and upgrades pause until you have answered it.'}</div>` : ''}
    ${s.pipes.length ? summary(v) : '<div class="callout"><b>Your first manager.</b> Cash that sits still earns nothing. A manager puts it to work in a niche and returns it, plus a margin, every cycle.</div>'}
    ${main.map((z) => districtBlock(v, z, cache)).join('')}
    ${rest.length ? `<section class="cr-dist" aria-label="Open plots in other districts"><h3 class="cr-h3">Open plots elsewhere</h3>${rest.map((z) => hireRow(v, z)).join('')}</section>` : ''}`;
}

// ---------------------------------------------------------------- upgrades and clients
function upgradesTab(v) {
  const { s, m } = v;
  const cards = Object.entries(UPGRADES).map(([id, u]) => {
    const have = !!s.upg[id], open = s.zones.includes(u.zone);
    const why = have ? '' : !open ? `Unlocks when ${ZONES[u.zone].name} opens.` : s.cash < u.cost ? `Short by ${m(u.cost - s.cash)}.` : '';
    return `<article class="cr-upg${have ? ' have' : ''}"><div class="row"><b class="grow">${esc(u.name)}</b>${have ? '<span class="chip good"><span aria-hidden="true">✓</span> Installed</span>' : `<span class="mono gold">${m(u.cost)}</span>`}</div>
      <p class="small">${esc(u.blurb)}</p>
      ${have ? '' : `<button class="btn" data-act="crew-upg" data-id="${id}" data-fid="cx-${id}" ${why ? 'aria-disabled="true"' : ''}>Install</button>${why ? `<p class="cr-why small">${esc(why)}</p>` : ''}`}</article>`;
  }).join('');
  return `<p class="small mute">One-off purchases that make every manager better. They never expire, so buy the ones that pay back first.</p><div class="cr-grid">${cards}</div>`;
}

function clientBlock(v, id) {
  const { g, s, m } = v, C = CLIENTS[id];
  if (!s.zones.includes(C.zone)) return `Opens with ${ZONES[C.zone].name}.`;
  if (C.needs && !s.mil[C.needs]) { const z = ZONES[MIL_ZONE[C.needs]]; return `Opens at ${z.name} (${m(z.gate)} net worth).`; }
  if (g.liveClients(id).length >= C.max) return `You already hold all ${C.max} of these accounts.`;
  if (s.pipes.length < C.minRunning) return `Hire ${plural(C.minRunning - s.pipes.length, 'more manager')} first: this client needs ${C.minRunning} running every day.`;
  const q = g.clientQuote(id);
  if (!q.worthwhile) return `This contract could not earn back its ${m(q.cac)} before day 90: ${plural(q.payDays, 'paying day')} left, and it needs ${Math.ceil(q.payback)}.`; // the engine refuses it for this reason
  return s.cash < q.cac ? `Short by ${m(q.cac - s.cash)}.` : '';
}

function clientCard(v, id) {
  const { g, s, m } = v, C = CLIENTS[id], q = g.clientQuote(id), n = g.liveClients(id).length, block = clientBlock(v, id);
  const run = g.runningPipes(), met = run >= C.minRunning, top = Math.max(q.cac, q.ltv, 1);
  const verdict = q.ratio >= 3 ? { t: 'good', g: '★', w: 'Strong' } : q.ratio >= 1.5 ? { t: 'warn', g: '◐', w: 'Thin' } : { t: 'bad', g: '⚠', w: 'Risky' };
  return `<article class="cr-client"><div class="row"><span class="cr-ic" aria-hidden="true">${C.icon}</span><div class="grow"><b>${esc(C.name)}</b><p class="small mute">${esc(C.blurb)}</p></div><span class="chip">${n} of ${C.max}</span></div>
    <div class="cr-vs" role="group" aria-label="What it costs to win this client against what they pay you">
      <div class="cr-vsrow"><span class="cr-vsl">You pay to win them (CAC)</span><span class="cr-vsb" aria-hidden="true"><i class="cost" style="width:${(q.cac / top * 100).toFixed(1)}%"></i></span><b class="mono">${m(q.cac)}</b></div>
      <div class="cr-vsrow"><span class="cr-vsl">They pay you ${q.payDays < C.days ? `over the ${plural(q.payDays, 'day')} you have left` : `over ${C.days} days`} (LTV)</span><span class="cr-vsb" aria-hidden="true"><i class="ltv" style="width:${(q.ltv / top * 100).toFixed(1)}%"></i></span><b class="mono">${m(q.ltv)}</b></div></div>
    <p class="small"><span class="chip ${verdict.t}"><span aria-hidden="true">${verdict.g}</span> ${verdict.w}</span> They pay ${q.ratio.toFixed(1)}x what they cost you to win, and you earn it back in about ${q.payback.toFixed(1)} days${q.worthwhile ? '' : ', which is more than the run has left'}.</p>
    <p class="small cr-sla"><span class="chip ${met ? 'good' : 'bad'}"><span aria-hidden="true">${met ? '✓' : '✗'}</span> ${met ? 'SLA met' : 'SLA not met'}</span> Needs ${plural(C.minRunning, 'manager')} running every day. You have ${run} running. Miss it on two days and they leave, with ${m(C.perDay * 2)} in penalties each time.</p>
    <button class="btn" data-act="crew-client" data-t="${id}" data-fid="cl-${id}" ${block ? 'aria-disabled="true"' : ''}>Sign for ${m(q.cac)}</button>${block ? `<p class="cr-why small">${esc(block)}</p>` : ''}</article>`;
}

function clientsTab(v) {
  const { s, m, g } = v;
  const live = g.liveClients().map((c) => { const C = CLIENTS[c.tier]; return `<article class="cr-active"><div class="row"><b class="grow">${C.icon} ${esc(C.name)}</b><span class="mono green">${sgn(v, c.earned)} earned</span></div><div class="bar green" aria-hidden="true"><i data-bar="client:${c.id}"></i></div>
      <p class="small mute">${c.breaches ? `<span class="red">${c.breaches} of 2 SLA breaches.</span> ` : 'No SLA breaches. '}Ends in ${dur(c.until - s.hour)}. You paid ${m(c.cac)} to win them.</p></article>`; }).join('');
  return `<p class="small mute">Clients pay you every day while enough managers are running. Winning one costs money now (CAC); what they pay over the contract is their lifetime value (LTV). The deal is good when LTV beats CAC and you can keep the promise (the SLA).</p>
    <div class="cr-grid">${Object.keys(CLIENTS).map((id) => clientCard(v, id)).join('')}</div>
    ${live ? `<h3 class="cr-h3">Your accounts</h3><div class="cr-grid">${live}</div>` : ''}`;
}

// ---------------------------------------------------------------- the hire / edit dialog
const startCap = (g, kind, zone) => g.pipeCap({ kind, zone, level: 1 });
function pickKind(v, zone) {
  const afford = Object.keys(PIPE).filter((k) => v.g.pipeCost(k, zone) <= v.s.cash);
  return afford.includes('broker') ? 'broker' : afford.sort((a, b) => v.g.pipeCost(b, zone) - v.g.pipeCost(a, zone))[0] || 'broker';
}
function tmpPipe(v, H) {
  const edit = H.edit && v.s.pipes.find((p) => p.id === H.edit);
  return { id: H.edit || 'new', kind: edit ? edit.kind : H.kind, zone: H.zone, level: edit ? edit.level : 1, cls: H.cls, buyer: H.buyer, channel: H.channel, alloc: +H.alloc || 0, cycles: edit ? edit.cycles : 0, inflight: edit ? edit.inflight : 0 };
}

function previewHTML(ctx) {
  const v = view(ctx), { g, s, m } = v, H = v.C.hire; if (!H) return '';
  const t = tmpPipe(v, H), f = g.forecast(t), c = f.ci, edit = H.edit ? s.pipes.find((p) => p.id === H.edit) : null;
  const cost = edit ? 0 : g.pipeCost(H.kind, H.zone), left = s.cash - cost, row = (k, x, cl = '') => `<dt>${k}</dt><dd class="${cl}">${x}</dd>`;
  const warn = [];
  if (f.net < 0) warn.push('<div class="callout bad small"><b>This lane loses money.</b> Fees and overhead are bigger than the margin. Try a quieter buyer, or put more capital to work.</div>');
  if (!edit && left < f.alloc) warn.push(`<div class="callout warn small"><b>It would wait for cash.</b> After paying ${m(cost)} you would have ${m(Math.max(0, left))}, but a cycle needs ${m(f.alloc)} free to start. Lower the capital, or earn a little more first.</div>`);
  else if (edit && !edit.inflight && s.cash < f.alloc) warn.push(`<div class="callout warn small"><b>It would wait for cash.</b> You have ${m(s.cash)}; a cycle needs ${m(f.alloc)}.</div>`);
  const pay = !edit && f.perDay > 0 ? ` It earns back its ${m(cost)} hire cost in about ${Math.max(1, Math.round(cost / f.perDay))} days.` : '';
  return `<div class="card cr-prev"><div class="row"><b>Forecast</b>${cmChip(c)}</div>
    <p class="small"><b>Why this lane:</b> ${crowdWords(c)} ${bandOf(c).note}${t.channel === 'intl' ? ' International lanes pay a bigger margin but slow down when tariffs hit.' : ''}</p>
    <dl class="kv">${row('Margin before costs', m(f.gross))}${row('Institutional fee', '-' + m(f.fee))}${row('District tax', '-' + m(f.tax))}${row('Manager royalty', '-' + m(f.roy))}${row('Overhead', '-' + m(f.overhead))}<div class="sep"></div>${row('Net per cycle', sgn(v, f.net), tone(f.net))}${row('Cycle length', f.len + ' hours')}${row('Net per day', sgn(v, f.perDay), tone(f.perDay))}</dl>
    <p class="small mute">${pay}</p>${warn.join('')}</div>`;
}

function laneCard(v, r, H, locked) {
  const { g, m } = v, on = r.cls === H.cls && r.seg === H.buyer, f = g.forecast({ ...tmpPipe(v, H), cls: r.cls, buyer: r.seg });
  const tag = r.rank === 1 ? 'Best pick' : r.rank ? `#${r.rank}` : 'Current lane';
  const off = locked && !on;
  return `<button class="cr-lc" aria-pressed="${on}" data-act="crew-hlane" data-cls="${esc(r.cls)}" data-seg="${esc(r.seg)}" data-fid="hl-${esc(r.cls)}-${esc(r.seg)}" ${off ? 'aria-disabled="true"' : ''}>
    <span class="cr-rank">${tag}</span>
    <span class="cr-ln"><span aria-hidden="true">${ASSETS[r.cls]?.icon || '📦'}</span> <b>${esc(ASSETS[r.cls]?.name)}</b> to <b>${esc(BUYERS[r.seg]?.name)}</b></span>
    <span class="cr-lm">${cmChip(r)} <span class="mono ${tone(f.perDay)}">about ${sgn(v, f.perDay)} a day</span></span>
    <span class="small mute">${crowdWords(r)} ${esc(fitLabel(r.fit))}.</span></button>`;
}

function hireBody(ctx) {
  const v = view(ctx), { g, s, m, C } = v, H = C.hire; if (!H) return '';
  const edit = H.edit ? s.pipes.find((p) => p.id === H.edit) : null, locked = !!(edit && edit.inflight);
  const t = tmpPipe(v, H), cap = g.pipeCap(t), alloc = Math.min(+H.alloc || 0, cap), cost = edit ? 0 : g.pipeCost(H.kind, H.zone), left = s.cash - cost;
  const take = H.more ? 60 : g.P.radar || s.upg.research ? 8 : 5;
  const { rows, total } = lanesFor(v, H.zone, take, [{ cls: H.cls, seg: H.buyer }], H.edit || null);
  const kinds = edit ? `<p class="small"><span class="cr-ic" aria-hidden="true">${PIPE[edit.kind].icon}</span> <b>${esc(PIPE[edit.kind].name)}</b> <span class="chip">Lv ${edit.level} of ${PIPE_RULES.maxLevel}</span></p>`
    : `<h3 class="cr-h3">1. Choose a manager</h3><div class="cr-kinds" role="group" aria-label="Manager type">${Object.entries(PIPE).map(([id, K]) => `<button class="cr-kind" aria-pressed="${H.kind === id}" data-act="crew-hkind" data-k="${id}" data-fid="hk-${id}" data-anchor="hire-${id}">
        <span class="cr-ic" aria-hidden="true">${K.icon}</span><b>${esc(K.name)}</b><span class="small">${esc(K.blurb)}</span>
        <span class="small mono">${m(g.pipeCost(id, H.zone))} to hire</span><span class="small mute">Up to ${m(startCap(g, id, H.zone))} per cycle. ${K.cycle < 1 ? 'Fast' : K.cycle > 1 ? 'Slow' : 'Steady'} cycles. Takes ${Math.round(K.royalty * 100)}% of profit.</span></button>`).join('')}</div>`;
  const shown = locked ? rows.filter((r) => r.cls === H.cls && r.seg === H.buyer) : rows, intl = 1.3 + (g.P.intlBonus || 0);
  const why = !edit && s.cash < cost ? `You need ${m(cost - s.cash)} more to hire this manager.` : !H.cls ? 'Pick a lane first.' : '';
  return `${kinds}
    <h3 class="cr-h3">${edit ? 'Lane' : '2. Pick a lane'}</h3>
    <p class="small mute">Ranked best first: few other pitches, and a buyer who really wants it.</p>
    ${locked ? '<p class="cr-why small">The lane is locked until the running cycle finishes. You can still change the capital.</p>' : ''}
    <div class="cr-lanes" role="group" aria-label="Lanes">${shown.map((r) => laneCard(v, r, H, locked)).join('') || '<p class="mute">No lane works here.</p>'}</div>
    ${!locked && !H.more && total > rows.length ? `<button class="btn ghost" data-act="crew-hmore" data-fid="hmore">Show all ${total} lanes</button>` : ''}
    <h3 class="cr-h3">${edit ? 'Channel' : '3. Channel'}</h3>
    <div class="cr-chans" role="group" aria-label="Channel">
      <button class="cr-lc" aria-pressed="${H.channel === 'dom'}" data-act="crew-hchan" data-c="dom" data-fid="hc-dom" ${locked && H.channel !== 'dom' ? 'aria-disabled="true"' : ''}><b>Domestic</b><span class="small">Steady and predictable.</span></button>
      <button class="cr-lc" aria-pressed="${H.channel === 'intl'}" data-act="crew-hchan" data-c="intl" data-fid="hc-intl" ${locked && H.channel !== 'intl' ? 'aria-disabled="true"' : ''}><b>International</b><span class="small">Margin x${intl.toFixed(2)}, but tariffs slow every cycle.</span></button></div>
    <h3 class="cr-h3">${edit ? 'Capital' : '4. Capital per cycle'}</h3>
    <label for="ch-amt">Putting <output id="chamt">${m(alloc)}</output> of ${m(cap)} to work each cycle</label>
    <input id="ch-amt" type="range" min="0" max="100" step="5" value="${cap ? Math.round(alloc / cap * 100) : 0}" data-input="crew-hamt" data-fid="ch-amt">
    <div class="row"><button class="btn ghost" data-act="crew-hmax" data-fid="hmax">Use full capacity</button>${!edit && left > 0 && left < alloc ? `<button class="btn ghost" data-act="crew-hafford" data-fid="hafford">Use what I can afford (${m(left)})</button>` : ''}</div>
    <div id="chprev" class="gap">${previewHTML(ctx)}</div>
    <div class="cr-foot">${why ? `<p class="cr-why small">${esc(why)}</p>` : ''}<div class="row"><button class="btn" data-act="crew-hgo" data-fid="hgo" data-anchor="hire-go" ${why ? 'aria-disabled="true"' : ''}>${edit ? 'Save changes' : `Hire for ${m(cost)}`}</button><button class="btn ghost" data-close>Cancel</button></div></div>`;
}

function hireDialog(ctx) {
  const v = view(ctx), H = v.C.hire, Z = ZONES[H.zone];
  return `<div class="crd"><button class="btn ghost sm x" data-close>Close</button><h2 tabindex="-1" autofocus>${H.edit ? 'Edit lane' : `Hire a manager in ${esc(Z.name)}`}</h2>
    <p class="small mute">A manager lends your cash to one niche for a cycle, then hands it back with a margin. The lane you pick (what to sell, and to whom) decides how crowded that niche is.</p>
    <div id="chbody">${hireBody(ctx)}</div></div>`;
}

const dlgRoot = (ctx) => ctx.dlg?.el;
function repaint(ctx, fid) {
  const body = dlgRoot(ctx)?.querySelector?.('#chbody');
  if (!body || !ST(ctx).hire) return;
  body.innerHTML = hireBody(ctx);
  if (fid) body.querySelector?.(`[data-fid="${fid}"]`)?.focus?.({ preventScroll: true });
}
function repaintPreview(ctx) {
  const root = dlgRoot(ctx), prev = root?.querySelector?.('#chprev');
  if (!prev || !ST(ctx).hire) return;
  prev.innerHTML = previewHTML(ctx);
  const H = ST(ctx).hire, v = view(ctx), cap = v.g.pipeCap(tmpPipe(v, H)), out = root.querySelector('#chamt');
  if (out) out.textContent = v.m(Math.min(+H.alloc || 0, cap));
}

function openHire(ctx, { zone, edit }) {
  const v = view(ctx), { g, C } = v;
  if (!edit) { const block = hireBlock(v, zone); if (block) { ctx.toast(block, 'warn'); return; } }
  zone = edit ? edit.zone : zone;
  const best = g.radar(zone, 1)[0], kind = edit ? edit.kind : pickKind(v, zone);
  C.hire = { edit: edit ? edit.id : null, kind, zone, cls: edit?.cls || best?.cls, buyer: edit?.buyer || best?.seg, channel: edit?.channel || 'dom', alloc: edit ? edit.alloc : startCap(g, kind, zone), touched: !!edit, more: false };
  ctx.dlg.open(hireDialog(ctx), { label: edit ? 'Edit lane' : 'Hire a manager' });
}

// ---------------------------------------------------------------- the drawer
function frame(ctx, body) {
  const v = view(ctx), { s, C } = v, tabs = [['crew', 'Managers', s.pipes.length], ['upgrades', 'Upgrades', Object.keys(s.upg).length ? `${Object.keys(s.upg).length} of ${Object.keys(UPGRADES).length}` : null], ['clients', 'Clients', s.clients.length || null]];
  return `<div class="cr"><div class="dtabs cr-tabs" role="group" aria-label="Crew sections">${tabs.map(([id, label, n]) => `<button class="btn ghost" aria-pressed="${C.tab === id}" data-act="crew-tab" data-t="${id}" data-fid="ct-${id}">${label}${n != null ? ` <span class="chip">${n}</span>` : ''}</button>`).join('')}</div>${body}</div>`;
}

/** The world sets U.hireAt / U.focusPipe and opens the drawer; read them once, then do the DOM part after the draw. */
function consume(ctx) {
  const { U } = ctx, C = ST(ctx), todo = {};
  if (U.focusPipe) { C.tab = 'crew'; C.flash = U.focusPipe; C.flashUntil = Date.now() + 3200; todo.focus = U.focusPipe; U.focusPipe = null; }
  if (U.hireAt) { C.tab = 'crew'; todo.hire = U.hireAt; U.hireAt = null; }
  if (!todo.focus && !todo.hire) return;
  later(() => {
    if (todo.hire) openHire(ctx, { zone: +todo.hire });
    if (todo.focus) {
      const el = ctx.el?.drawer?.querySelector?.(`[data-pipe="${todo.focus}"]`);
      const db = el?.closest?.('.db');
      if (db && typeof db.scrollTo === 'function') db.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top - db.getBoundingClientRect().top + db.scrollTop - (db.clientHeight - el.offsetHeight) / 2) }); // the drawer's own list only: scrollIntoView would slide the whole stage
      else el?.scrollIntoView?.({ block: 'center' });
      if (!todo.hire) el?.focus?.({ preventScroll: true });
      later(() => ctx.render(), 3300);
    }
  });
}

/** The shell rebuilds the drawer on every refresh and that resets the scroll; put it back right after. */
function keepScroll(ctx) {
  const db = ctx.el?.drawer?.querySelector?.('.db');
  if (!db || db.dataset.drawer !== 'crew' || !db.scrollTop) return;
  const top = db.scrollTop;
  queueMicrotask(() => { const n = ctx.el.drawer.querySelector('.db'); if (n && n.dataset.drawer === 'crew') n.scrollTop = top; });
}

export default {
  id: 'crew', icon: '👥', label: 'Crew',
  visible: (ctx) => !!ctx.g().s.mil.m1,
  badge: (ctx) => { const n = ctx.g().s.pipes.filter((p) => p.starved || (!p.cls && p.status === 'idle')).length; return n || null; },
  html(ctx) {
    keepScroll(ctx);
    consume(ctx);
    const v = view(ctx), tab = v.C.tab;
    return frame(ctx, tab === 'upgrades' ? upgradesTab(v) : tab === 'clients' ? clientsTab(v) : crewTab(v));
  },
  acts(ctx) {
    const g = () => ctx.g(), pipe = (id) => g().s.pipes.find((p) => p.id === id);
    const fail = (msg) => { ctx.toast(msg, 'warn'); return null; };
    return {
      'crew-tab'(b) { ST(ctx).tab = b.dataset.t; ctx.render(); },
      'crew-hire'(b) { openHire(ctx, { zone: +b.dataset.d }); },
      'crew-edit'(b) { const p = pipe(b.dataset.id); if (p) openHire(ctx, { edit: p }); },
      'crew-hkind'(b) {
        const H = ST(ctx).hire; if (!H || H.edit) return;
        H.kind = b.dataset.k; if (!H.touched) H.alloc = startCap(g(), H.kind, H.zone);
        repaint(ctx, 'hk-' + H.kind);
      },
      'crew-hlane'(b) {
        const H = ST(ctx).hire, p = H?.edit && pipe(H.edit); if (!H || (p && p.inflight)) return;
        H.cls = b.dataset.cls; H.buyer = b.dataset.seg; repaint(ctx, `hl-${H.cls}-${H.buyer}`);
      },
      'crew-hchan'(b) { const H = ST(ctx).hire, p = H?.edit && pipe(H.edit); if (!H || (p && p.inflight)) return; H.channel = b.dataset.c; repaint(ctx, 'hc-' + H.channel); },
      'crew-hmore'() { const H = ST(ctx).hire; if (!H) return; H.more = true; repaint(ctx, ''); },
      'crew-hamt'(b) {
        const H = ST(ctx).hire; if (!H) return;
        const cap = g().pipeCap(tmpPipe(view(ctx), H)); H.alloc = Math.round(cap * Math.max(0, Math.min(100, +b.value || 0))) / 100; H.touched = true;
        repaintPreview(ctx);
      },
      'crew-hmax'() { const H = ST(ctx).hire; if (!H) return; H.alloc = g().pipeCap(tmpPipe(view(ctx), H)); H.touched = true; repaint(ctx, 'hmax'); },
      'crew-hafford'() {
        const v = view(ctx), H = v.C.hire; if (!H) return;
        H.alloc = Math.max(0, Math.floor(v.s.cash - v.g.pipeCost(H.kind, H.zone))); H.touched = true; repaint(ctx, 'hafford');
      },
      'crew-hgo'() {
        const v = view(ctx), { g: game } = v, H = v.C.hire; if (!H) return;
        const cfg = { cls: H.cls, buyer: H.buyer, channel: H.channel, alloc: +H.alloc || 0 };
        if (H.edit) {
          const r = ctx.say(game.configure(H.edit, cfg));
          if (r.ok) { ctx.dlg.close(); v.C.hire = null; }
          ctx.render(); return;
        }
        const first = !hiredEver(v.s), r = ctx.say(game.hirePipeline(H.kind, H.zone, cfg));
        if (r.ok) {
          ctx.dlg.close(); v.C.hire = null; v.C.tab = 'crew'; v.C.flash = r.pipe.id; v.C.flashUntil = Date.now() + 3200;
          ctx.sfx.level(); if (first) ctx.burst({ power: 1.2 });
          later(() => ctx.render(), 3300);
        }
        ctx.render();
      },
      'crew-up'(b) {
        const game = g(), p = pipe(b.dataset.id); if (!p) return;
        const r = game.upgradePipeline(p.id);
        if (!r.ok) ctx.say(r);
        else {
          ctx.sfx.level();
          const cap = game.pipeCap(p);
          ctx.toast(`Level ${p.level}. Capacity is now ${ctx.money(cap)} per cycle.${p.alloc < cap - 0.5 ? ' Use "Fund full" to put it all to work.' : ''}`, 'good');
        }
        ctx.render();
      },
      'crew-fill'(b) { const game = g(), p = pipe(b.dataset.id); if (!p) return; const r = game.configure(p.id, { alloc: game.pipeCap(p) }); if (!r.ok) ctx.say(r); else ctx.toast(`Now putting ${ctx.money(p.alloc)} to work each cycle.`, 'good'); ctx.render(); },
      'crew-pause'(b) { const p = pipe(b.dataset.id); if (!p) return; ctx.say(g().pausePipeline(p.id, p.status !== 'paused'), 'info'); ctx.render(); },
      'crew-rel'(b) {
        const p = pipe(b.dataset.id); if (!p) return;
        if (p.inflight) { fail('Wait for the running cycle to finish before releasing.'); return; }
        ctx.confirmBox('Release this manager?', `<p>${esc(PIPE[p.kind].name)} in ${esc(ZONES[p.zone].name)} leaves. You get back <b>${ctx.money(p.basis * 0.6)}</b>, which is 60% of the ${ctx.money(p.basis)} you put in (hire cost and upgrades). The rest is gone for good, and the plot opens up for someone new.</p>`, 'Release', () => { ctx.say(g().releasePipeline(p.id), 'info'); }, true);
      },
      'crew-upg'(b) { const r = ctx.say(g().buyUpgrade(b.dataset.id)); if (r.ok) ctx.sfx.level(); ctx.render(); },
      'crew-client'(b) { const r = ctx.say(g().acquireClient(b.dataset.t)); if (r.ok) ctx.sfx.blip(); ctx.render(); },
    };
  },
};
