// The graded game screen: mounts the four dashboard sections and wires every action to the engine.
import { ZONES, ASSETS, BUYERS, PROFILES, PIPE, PIPE_RULES, CLIENTS, LOANS, EVENTS, TOTAL_HOURS, TOTAL_DAYS, UPGRADES } from '../config.js';
import { fitOf, fitLabel, fmtMoney as money, fmtPct as pct } from '../market.js';
import { $, $$, esc, setHTML, delegate, dlg, toast, announce, sfx, burst, reduced, settingsDialog, settings } from './common.js';
import * as V from './views.js';
import { kv } from '../session.js';
import { createWorldView } from './worldview.js';

export function mountGame(root, S, hooks) {
  const g = () => S.game;
  let wv = null, wvHost = null;
  const U = { tab: 'world', zone: PROFILES[S.game.s.profile].startZone, sel: new Set(), side: 'feed', trade: { want: new Set() }, draw: {}, logF: 'all', hire: null, queue: [], confirm: null };
  root.innerHTML = `<div id="hub" class="hub"></div>
    <div class="main"><div class="col"><section class="panel" aria-label="Workspace"><div class="tabs" role="tablist" id="tabs" aria-label="Workspace tabs"></div><div id="work" role="tabpanel" tabindex="-1"></div></section></div>
    <div class="col"><section class="panel" id="inv" aria-label="Active inventory matrix"></section><section class="panel" id="auto" aria-label="Automation controller"></section><section class="panel" id="syn" aria-label="Live market syndicate"></section></div></div>`;
  const el = { hub: $('#hub'), tabs: $('#tabs'), work: $('#work'), inv: $('#inv'), auto: $('#auto'), syn: $('#syn') };

  function render() {
    if (!S.game) return;
    const views = { trade: V.tradeHTML, map: V.mapHTML, bank: V.bankHTML, clients: V.clientsHTML, skills: V.skillsHTML, audit: V.auditHTML, ledger: V.ledgerHTML };
    if (U.tab === 'audit' && !g().s.mil.m2) U.tab = 'trade';
    setHTML(el.hub, V.hubHTML(S, U));
    setHTML(el.tabs, V.tabsHTML(S, U));
    el.work.setAttribute('aria-labelledby', 'tab-' + U.tab);
    setHTML(el.work, U.tab === 'world' || U.tab === 'map' ? V.worldShell(U.tab) : views[U.tab](S, U));
    if (wv) {
      if (U.tab === 'world' || U.tab === 'map') { const host = el.work.firstElementChild; if (host && host !== wvHost) { wvHost = host; wv.show(host, U.tab); } else wv.update(); }
      else if (wvHost) { wv.hide(); wvHost = null; }
    }
    setHTML(el.inv, V.invHTML(S, U));
    setHTML(el.auto, V.autoHTML(S, U));
    setHTML(el.syn, V.synHTML(S, U));
    paintBars();
    pumpQueue();
  }

  // ---- live progress bars: the engine steps whole hours; bars interpolate between steps
  function paintBars() {
    const game = g(); if (!game) return;
    const s = game.s, live = S.clock.now(), frac = S.clock.paused || s.over ? 0 : Math.max(0, Math.min(1, live - s.hour)), hf = s.hour + frac;
    for (const b of $$('[data-bar]', root)) {
      const [k, id] = b.dataset.bar.split(':'); let f = 0;
      if (k === 'day') f = hf / TOTAL_HOURS;
      else if (k === 'lead') { for (const z of s.zones) { const l = s.leads[z].find((x) => x.id === id); if (l) f = 1 - (hf - l.born) / (l.exp - l.born); } }
      else if (k === 'pipe') { const p = s.pipes.find((x) => x.id === id); f = p && p.inflight ? (p.prog + (hf - s.hour)) / Math.max(1, p.len) : 0; }
      else if (k === 'freight') { const fr = s.freight.find((x) => x.id === id); f = fr ? (hf - (fr.arrive - 6)) / 6 : 1; }
      else if (k === 'client') { const c = s.clients.find((x) => x.id === id); f = c ? (hf - (c.until - CLIENTS[c.tier].days * 24)) / (CLIENTS[c.tier].days * 24) : 0; }
      b.style.width = Math.max(0, Math.min(1, f)) * 100 + '%';
    }
  }
  let dead = false;
  const barLoop = () => { if (dead) return; paintBars(); if (reduced()) setTimeout(barLoop, 600); else requestAnimationFrame(() => setTimeout(barLoop, 60)); };
  barLoop();

  // ---- dialogs
  function pumpQueue() {
    if (dlg.el.open || !U.queue.length) return;
    const q = U.queue.shift();
    dlg.open(q.html, { cls: q.cls || '', label: q.label, onClose: () => setTimeout(pumpQueue, 80) });
    if (q.sound) sfx[q.sound]?.();
  }
  const queue = (html, o = {}) => { U.queue.push({ html, ...o }); pumpQueue(); };
  function confirmBox(title, body, ok, fn, danger = false) {
    U.confirm = fn;
    dlg.open(`<h2 tabindex="-1" autofocus>${esc(title)}</h2>${body}<div class="row gap"><button class="btn ${danger ? 'danger' : ''}" data-act="confirm-go" autofocus>${esc(ok)}</button><button class="btn ghost" data-close>Cancel</button></div>`, { label: title });
  }
  const say = (r, good = 'good') => { if (r.msg) toast(r.msg, r.ok ? good : 'bad'); if (!r.ok) sfx.buzz(); return r; };

  // ---- hire / edit pipeline dialog
  function hireBody() {
    const game = g(), s = game.s, H = U.hire;
    const zones = s.zones.filter((z) => ZONES[z].auto);
    const classes = Object.keys(ASSETS).filter((c) => ASSETS[c].dem[H.zone - 1] > 0);
    const buyers = Object.keys(BUYERS).filter((b) => BUYERS[b].zone === H.zone && fitOf(H.cls, b) >= 0.3).map((b) => ({ b, ci: game.cmFor(H.zone, H.cls, b) }));
    const tmp = { kind: H.kind, zone: H.zone, level: H.edit ? H.edit.level : 1, cls: H.cls, buyer: H.buyer, channel: H.channel, alloc: H.alloc, cycles: H.edit?.cycles || 0 };
    return `<div class="grid g3" role="radiogroup" aria-label="Manager type">${Object.entries(PIPE).map(([id, K]) => `<button class="card pick btn ghost" style="text-transform:none;letter-spacing:0;text-align:left" role="radio" aria-checked="${H.kind === id}" data-act="hkind" data-k="${id}" ${H.edit ? 'aria-disabled="true"' : ''} data-fid="hk-${id}"><span class="ic" aria-hidden="true">${K.icon}</span><b>${esc(K.name)}</b><br><span class="small mute">${esc(K.blurb)}</span><br><span class="small mono">${H.edit ? '' : money(game.pipeCost(id, H.zone))}</span></button>`).join('')}</div>
      <div class="grid g2 gap">
        <div><label for="h-zone">Zone</label><select id="h-zone" data-change="hfield" data-k="zone" ${H.edit ? 'disabled' : ''}>${zones.map((z) => `<option value="${z}" ${z === H.zone ? 'selected' : ''}>${ZONES[z].short}</option>`).join('')}</select></div>
        <div><label for="h-cls">Asset class (the lane)</label><select id="h-cls" data-change="hfield" data-k="cls">${classes.map((c) => `<option value="${c}" ${c === H.cls ? 'selected' : ''}>${esc(ASSETS[c].name)}</option>`).join('')}</select></div>
        <div><label for="h-buyer">Target buyer segment</label><select id="h-buyer" data-change="hfield" data-k="buyer">${buyers.map(({ b, ci }) => `<option value="${b}" ${b === H.buyer ? 'selected' : ''}>${esc(BUYERS[b].name)}: ${ci.band.label} ${ci.cm.toFixed(2)}x</option>`).join('')}</select></div>
        <div><label for="h-chan">Channel</label><select id="h-chan" data-change="hfield" data-k="channel"><option value="dom" ${H.channel === 'dom' ? 'selected' : ''}>Domestic (stable)</option><option value="intl" ${H.channel === 'intl' ? 'selected' : ''}>International (+30% margin, tariff-exposed)</option></select></div>
        <div><label for="h-alloc">Capital per cycle (max ${money(game.pipeCap(tmp))})</label><input id="h-alloc" inputmode="decimal" data-input="hfield" data-k="alloc" value="${esc(H.alloc)}"></div></div>
      <div id="hprev" class="gap">${hirePreview()}</div>`;
  }
  function hirePreview() {
    const game = g(), H = U.hire;
    const tmp = { kind: H.kind, zone: H.zone, level: H.edit ? H.edit.level : 1, cls: H.cls, buyer: H.buyer, channel: H.channel, alloc: +H.alloc || 0, cycles: H.edit?.cycles || 0 };
    const f = game.forecast(tmp), c = f.ci, r = (k, v, cl = '') => `<dt>${k}</dt><dd class="${cl}">${v}</dd>`;
    return `<div class="card"><div class="row"><b>Lane forecast</b><span class="chip ${({ bad: 'bad', warn: 'warn', ok: 'info', good: 'good' })[c.band.tone]}">${c.band.label} ${c.cm.toFixed(2)}x</span><span class="small mute">${c.vN.toFixed(1)} of ${c.vT.toFixed(0)} recent pitches use this niche (${pct(c.S)} saturated)</span></div>
      <dl class="kv gap">${r('Gross margin this cycle', money(f.gross))}${r('Institutional fee', '-' + money(f.fee))}${r('Zone tax', '-' + money(f.tax))}${r('Manager royalty', '-' + money(f.roy))}${r('Overhead', '-' + money(f.overhead))}<div class="sep"></div>${r('Net per cycle', money(f.net), f.net >= 0 ? 'green' : 'red')}${r('Cycle length', f.len + ' virtual hours')}${r('Net per day', money(f.perDay), f.perDay >= 0 ? 'green' : 'red')}</dl>
      ${f.net < 0 ? '<div class="callout bad small"><b>This lane loses money.</b> Fixed overhead and fees exceed the margin. Try a less crowded buyer.</div>' : ''}</div>`;
  }
  function openHire(edit) {
    const game = g(), s = game.s;
    const zone = edit ? edit.zone : ZONES[U.zone].auto && s.zones.includes(U.zone) ? U.zone : s.zones.filter((z) => ZONES[z].auto).slice(-1)[0] || 2;
    const cls = edit?.cls || Object.keys(ASSETS).find((c) => ASSETS[c].dem[zone - 1] > 0 && ASSETS[c].base > 100) || 'textbooks';
    const best = Object.keys(BUYERS).filter((b) => BUYERS[b].zone === zone && fitOf(cls, b) >= 0.3).map((b) => ({ b, cm: game.cmFor(zone, cls, b).cm })).sort((a, b) => b.cm - a.cm)[0];
    U.hire = { edit, kind: edit?.kind || 'broker', zone, cls, buyer: edit?.buyer || best?.b, channel: edit?.channel || 'dom', alloc: edit ? edit.alloc : '' };
    if (!edit) U.hire.alloc = Math.round(game.pipeCap({ kind: 'broker', zone, level: 1 }));
    dlg.open(`<button class="btn ghost sm x" data-close>Close</button><h2 tabindex="-1" autofocus>${edit ? 'Edit lane' : 'Hire a manager'}</h2><p class="small mute">A pipeline locks your capital for one cycle, then returns it with a margin. The lane (asset class and buyer) decides how crowded the niche is.</p><div id="hbody">${hireBody()}</div>
      <div class="row gap"><button class="btn" data-act="hgo" autofocus>${edit ? 'Save lane' : 'Hire'}</button><button class="btn ghost" data-close>Cancel</button></div>`, { label: 'Pipeline' });
  }

  // ---- other dialogs
  function breakdown(k) {
    const game = g(), s = game.s, row = (a, b, c = '') => `<dt>${a}</dt><dd class="${c}">${b}</dd>`;
    let body = '';
    if (k === 'cash' || k === 'nw') {
      const inv = game.invValue(), pip = s.pipes.reduce((a, p) => a + p.basis, 0), fly = s.pipes.reduce((a, p) => a + (p.inflight || 0), 0), set = s.settle.reduce((a, x) => a + x.amt, 0), esc2 = s.escrow.reduce((a, e) => a + (e.cash || 0) + e.assets.reduce((x, y) => x + game.val(y), 0), 0), tr = s.freight.reduce((a, f) => a + f.items.reduce((x, y) => x + game.val(y, f.to), 0), 0);
      body = `<dl class="kv">${row('Cash on hand', money(s.cash))}${row('Inventory at fair value', money(inv))}${row('Assets in transit', money(tr))}${row('Pipeline capital (book)', money(pip))}${row('Capital in running cycles', money(fly))}${row('Settling liquidations', money(set))}${row('Held in escrow', money(esc2))}${row('Debt', '-' + money(game.debt()), 'red')}<div class="sep"></div>${row('Net worth', money(game.netWorth()), 'gold')}${row('Net worth peak', money(s.peak))}</dl><p class="small mute">Milestones: $1,000 Zone 2 and bank, $25,000 audits, $250,000 Zone 3. Cash flow velocity beats static inventory: stock decays, running cycles earn.</p>`;
    } else if (k === 'day') {
      const ev = s.events.filter((e) => e.warned);
      body = `<dl class="kv">${row('Virtual day', `${game.day} of ${TOTAL_DAYS}`)}${row('Virtual hour', s.hour + ' / ' + TOTAL_HOURS)}${row('Real time per virtual day', `${(168 / S.clock.speed).toFixed(0)} seconds at ${S.clock.speed}x`)}</dl><h3 class="gap">Known macro events</h3>${ev.length ? ev.map((e) => `<p class="small"><b>${esc(e.name)}</b>: ${e.start > s.hour ? 'in ' + Math.round((e.start - s.hour) / 24 * 10) / 10 + ' days' : 'started day ' + (Math.floor(e.start / 24) + 1)}</p>`).join('') : '<p class="small mute">No warnings yet. Higher Fintech and the Market Research Suite buy earlier notice.</p>'}`;
    } else {
      const lb = S.leaderboard(), me = lb.find((r) => r.me), fl = S.difficulty.eeiFloor;
      body = `<p class="mono small">EEI = ending net worth / starting capital x (1 + days remaining / ${TOTAL_DAYS})</p><dl class="kv">${row('Net worth now', money(game.netWorth()))}${row('Starting capital', money(s.startCapital))}${row('Starting capital used (floor ' + money(fl) + ')', money(Math.max(s.startCapital, fl)))}${row('Days remaining', game.daysRemaining().toFixed(1))}${row('Multiplier', (1 + game.daysRemaining() / TOTAL_DAYS).toFixed(3))}<div class="sep"></div>${row('Efficiency index', game.eei().toFixed(2), 'green')}${me ? row('Rank overall', `${me.rank} of ${lb.length}`) + row('Rank in your profile', `${me.profRank} of ${me.profN}`) : ''}</dl>`;
    }
    dlg.open(`<button class="btn ghost sm x" data-close>Close</button><h2 tabindex="-1" autofocus>${{ cash: 'Liquid balance', nw: 'Net worth', day: 'Clock', eei: 'Economic Efficiency Index' }[k]}</h2>${body}`, { label: 'Breakdown' });
  }
  function menu() {
    const game = g(), inRoom = !!S.roomInfo;
    dlg.open(`<button class="btn ghost sm x" data-close>Close</button><h2 tabindex="-1" autofocus>Menu</h2><div class="grid g2">
      <div class="card"><h3>Classroom room</h3>${inRoom ? `<p class="small">In room <b class="mono">${esc(S.roomInfo.code)}</b> via ${S.room.kind === 'relay' ? 'relay server' : 'this browser (other tabs)'}. The instructor's clock is in charge.</p><button class="btn sm ghost" data-act="leave">Leave room</button>`
        : `<p class="small mute">Joining restarts your run on the instructor's shared clock.</p><label for="m-code">Room code</label><input id="m-code" maxlength="8" style="text-transform:uppercase" autocomplete="off"><label for="m-relay" class="gap">Relay server URL (optional)</label><input id="m-relay" placeholder="wss://your-relay.example" value="${esc(kv.get('relay') || '')}"><button class="btn sm gap" data-act="joinroom">Join</button>`}</div>
      <div class="card"><h3>This run</h3><div class="grid"><button class="btn sm" data-act="debrief">Open debrief and reflection</button><button class="btn sm ghost" data-act="tutorial">Replay Level 0</button><button class="btn sm ghost" data-act="savefile">Download my save</button><button class="btn sm danger" data-act="reset">Start over</button></div></div></div>
      <p class="small mute gap">Privacy: your save lives only in this browser. Rooms share a pseudonymous Founder ID, your chosen alias and game numbers, never names or emails.</p>`, { label: 'Menu' });
  }

  // ---- actions
  const acts = {
    tab(b) { U.tab = b.dataset.t; render(); $('#tab-' + U.tab)?.focus(); },
    zone(b) { U.zone = +b.dataset.z; if (b.dataset.go) U.tab = 'trade'; render(); },
    sel(b) { const id = b.dataset.id; U.sel.has(id) ? U.sel.delete(id) : U.sel.add(id); render(); },
    clearsel() { U.sel.clear(); render(); },
    side(b) { U.side = b.dataset.s; render(); },
    pause() { S.setPaused(!S.clock.paused); },
    speed(b) { S.setSpeed(+b.value); },
    help() { dlg.open(V.helpHTML(), { label: 'Help' }); },
    settings() { settingsDialog(() => render()); },
    menu,
    breakdown(b) { breakdown(b.dataset.k); },
    'confirm-go'() { const fn = U.confirm; U.confirm = null; dlg.close(); fn?.(); render(); },
    alert(b) { const n = g().s.news[+b.dataset.i]; if (n?.alert) dlg.open(V.alertDialog(n.alert), { cls: 'alert', label: 'Macro alert' }); },

    pitch(b) {
      const game = g(), a = V.selectedAsset(game, U);
      if (!a) { toast('Select an asset in your inventory first.', 'warn'); return; }
      const q = game.quotePitch(a.id, b.dataset.lead);
      if (!q.ok) { toast(q.msg, 'bad'); return; }
      dlg.open(V.pitchDialog(q), { label: 'Confirm pitch' });
    },
    'pitch-go'(b) {
      const r = g().pitch(b.dataset.asset, b.dataset.lead);
      dlg.close();
      if (!r.ok) { toast(r.msg, 'bad'); return; }
      U.sel.delete(b.dataset.asset);
      const good = r.outcome === 'win' || r.outcome === 'pioneer';
      setTimeout(() => {
        dlg.open(V.resultDialog(r, g()), { label: 'Pitch result', cls: r.outcome === 'rejected' ? 'alert' : '' });
        if (good) { sfx.kaching(); burst({ power: r.outcome === 'pioneer' ? 1.5 : 1 }); } else sfx.buzz();
        announce(`${r.outcome === 'rejected' ? 'Trade rejected' : r.outcome === 'pioneer' ? 'Market efficiency exploited' : good ? 'Successful arbitrage' : 'Margin compression'}.`, !good);
      }, 60);
      render();
    },
    buy(b) { const z = U.zone; say(g().buyLot(z, b.dataset.lot)); render(); },
    pool(b) {
      const ids = [...U.sel], q = g().poolQuote(ids);
      if (!q.ok) { toast(q.msg, 'bad'); return; }
      confirmBox('Sell to the liquidity pool?', `<p>${q.per.length} asset(s) for <b class="gold">${money(q.total)}</b> after ${pct(q.fric, 1)} pool friction and fees. The pool has ${money(q.room)} left.${q.delay ? ` Proceeds settle after <b>${q.delay} virtual hours</b>.` : ''}</p><p class="small mute">The pool is the safe exit, but peer and buyer pitches usually pay more.</p>`, 'Sell', () => { say(g().sellPool(ids)); U.sel.clear(); });
    },
    route() {
      const ids = [...U.sel], q = g().poolQuote(ids, true);
      if (!q.ok) { toast(q.msg, 'bad'); return; }
      confirmBox('Digital pipeline routing', `<p>Liquidate ${q.per.length} digital asset(s) straight into the Zone 3 pool for <b class="gold">${money(q.total)}</b> after a 12% brokerage fee. Settles in 48 virtual hours.</p>`, 'Route', () => { say(g().sellPool(ids, true)); U.sel.clear(); });
    },
    repair() {
      const a = g().s.assets.find((x) => U.sel.has(x.id) && x.cond === 'broken'); if (!a) return;
      const q = g().repairQuote(a.id);
      if (!q.ok) { toast(q.msg, 'bad'); return; }
      confirmBox('Repair ' + ASSETS[a.cls].name, `<dl class="kv"><dt>Your Ops level</dt><dd>${g().lvl('ops')}</dd><dt>Repair cost</dt><dd>${money(q.cost)}</dd><dt>Restored quality</dt><dd>${Math.round(q.quality * 100)}%</dd><dt>Value now</dt><dd>${money(q.before)}</dd><dt>Value after</dt><dd class="green">${money(q.after)}</dd></dl>${q.after - q.before < q.cost ? '<div class="callout bad small">At your Ops level this repair loses money. Trade it to someone with higher Ops.</div>' : ''}`, 'Repair', () => say(g().repair(a.id)));
    },
    ship() {
      const ids = [...U.sel], game = g(), items = ids.map((i) => game.s.assets.find((a) => a.id === i)).filter(Boolean);
      if (!items.length) return;
      const dests = game.s.zones.filter((z) => z !== items[0].zone);
      if (!dests.length) { toast('You have no other zone open yet.', 'warn'); return; }
      U.ship = dests[0];
      const body = () => { const q = game.freightQuote(ids, U.ship); return q.ok ? `<dl class="kv"><dt>Book value</dt><dd>${money(q.book)}</dd><dt>Freight cost (4.5%)</dt><dd>${money(q.cost)}</dd><dt>Transit</dt><dd>${q.hours} virtual hours</dd><dt>Damage risk</dt><dd class="${q.risk > .15 ? 'red' : ''}">${pct(q.risk)} (Ops ${game.lvl('ops')})</dd><dt>Room at destination</dt><dd>${q.room}</dd></dl>` : `<p class="red">${esc(q.msg)}</p>`; };
      dlg.open(`<h2 tabindex="-1" autofocus>Inter-zone freight run</h2><label for="sh-to">Destination</label><select id="sh-to" data-change="shipto">${dests.map((z) => `<option value="${z}">${ZONES[z].name}</option>`).join('')}</select><div id="shb" class="gap">${body()}</div><div class="row gap"><button class="btn" data-act="ship-go" autofocus>Ship</button><button class="btn ghost" data-close>Cancel</button></div>`, { label: 'Freight' });
      dlg.el._shipBody = body;
    },
    shipto(b) { U.ship = +b.value; $('#shb', dlg.el).innerHTML = dlg.el._shipBody(); },
    'ship-go'() { const r = say(g().ship([...U.sel], U.ship)); if (r.ok) U.sel.clear(); dlg.close(); render(); },
    offer() { U.side = 'exch'; toast('Pick what you want from your counterparty, then submit the proposal.', 'info'); render(); },

    hire() { openHire(null); },
    pedit(b) { openHire(g().s.pipes.find((p) => p.id === b.dataset.id)); },
    hkind(b) { if (U.hire.edit) return; U.hire.kind = b.dataset.k; $('#hbody', dlg.el).innerHTML = hireBody(); $('[data-fid="hk-' + b.dataset.k + '"]', dlg.el)?.focus(); },
    hfield(b) {
      const H = U.hire, k = b.dataset.k, game = g();
      H[k] = k === 'zone' ? +b.value : b.value;
      if (k === 'alloc') { $('#hprev', dlg.el).innerHTML = hirePreview(); return; }
      if (k === 'zone') { H.cls = Object.keys(ASSETS).find((c) => ASSETS[c].dem[H.zone - 1] > 0 && ASSETS[c].base > 50); }
      if (k === 'zone' || k === 'cls') H.buyer = Object.keys(BUYERS).filter((x) => BUYERS[x].zone === H.zone && fitOf(H.cls, x) >= 0.3).map((x) => ({ x, cm: game.cmFor(H.zone, H.cls, x).cm })).sort((a, c) => c.cm - a.cm)[0]?.x;
      $('#hbody', dlg.el).innerHTML = hireBody();
      dlg.el.querySelector('#h-' + ({ zone: 'zone', cls: 'cls', buyer: 'buyer', channel: 'chan' }[k] || 'alloc'))?.focus();
    },
    hgo() {
      const H = U.hire, game = g();
      const r = H.edit ? game.configure(H.edit.id, { cls: H.cls, buyer: H.buyer, channel: H.channel, alloc: +H.alloc }) : game.hirePipeline(H.kind, H.zone, { cls: H.cls, buyer: H.buyer, channel: H.channel, alloc: +H.alloc });
      say(r);
      if (r.ok) { dlg.close(); if (!H.edit) sfx.level(); render(); }
    },
    ppause(b) { const p = g().s.pipes.find((x) => x.id === b.dataset.id); say(g().pausePipeline(p.id, p.status !== 'paused')); render(); },
    pup(b) { say(g().upgradePipeline(b.dataset.id)); render(); },
    prel(b) { confirmBox('Release this manager?', '<p>You recover 60% of what you put in. Pending capital returns after the cycle.</p>', 'Release', () => say(g().releasePipeline(b.dataset.id)), true); },
    upg(b) { say(g().buyUpgrade(b.dataset.id)); render(); },

    xto(b) { U.trade.to = b.value; U.trade.want = new Set(); render(); },
    xfield(b) { U.trade[b.dataset.k] = b.value; const m = $('#vmatrix'); if (m) m.innerHTML = V.matrixHTML(S, U); },
    want(b) { const id = b.dataset.id; U.trade.want.has(id) ? U.trade.want.delete(id) : U.trade.want.add(id); render(); const m = $('#vmatrix'); if (m) m.innerHTML = V.matrixHTML(S, U); },
    send() {
      const T = U.trade, game = g(), partner = S.roster().find((r) => r.pid === T.to);
      if (!partner) { toast('Choose a counterparty.', 'warn'); return; }
      const want = (partner.inventory || []).filter((a) => T.want.has(a.id)).map((a) => ({ ...a }));
      const r = S.propose({ to: T.to, giveIds: [...U.sel], giveCash: +T.giveCash || 0, want: { assets: want, cash: +T.wantCash || 0 }, royalty: +T.roy > 0 ? { perDay: +T.roy, days: +T.royDays || 10 } : null });
      if (!r.ok) { dlg.open(`<h2 tabindex="-1" autofocus>Proposal blocked</h2><div class="callout bad">${esc(r.msg)}</div>${r.chk ? `<p class="small mono">Your side ${money(r.chk.va)} vs theirs ${money(r.chk.vb)} (${(r.chk.variance * 100).toFixed(0)}% apart).</p>` : ''}<button class="btn" data-close autofocus>OK</button>`, { cls: 'alert', label: 'Blocked' }); sfx.buzz(); return; }
      U.sel.clear(); T.want = new Set(); toast(r.msg, 'good'); render();
    },
    accept(b) { say(S.acceptIncoming(b.dataset.id)); render(); },
    decline(b) { S.declineIncoming(b.dataset.id); render(); },
    withdraw(b) { say(S.withdraw(b.dataset.id), 'info'); render(); },

    drawamt(b) { U.draw[b.dataset.p] = +b.value; const o = $('#dro-' + b.dataset.p); if (o) o.textContent = money(+b.value); },
    draw(b) { const r = say(g().draw(b.dataset.p, U.draw[b.dataset.p] || 0)); if (r.ok) U.draw[b.dataset.p] = 0; render(); },
    repay(b) { say(g().repay(b.dataset.id)); render(); },
    client(b) { const r = say(g().acquireClient(b.dataset.t)); if (r.ok) sfx.blip(); render(); },
    train(b) { const r = say(g().train(b.dataset.s)); if (r.ok) sfx.level(); render(); },
    audit(b) { const r = say(g().resolveAudit(b.dataset.c, g().s.pipes[0]?.id), 'info'); render(); },
    exit(b) {
      const k = b.dataset.k, q = g().exitQuote(k);
      if (!q.ok) { toast(q.msg, 'bad'); return; }
      confirmBox(k === 'ipo' ? 'IPO preparation' : 'Trade sale', `<dl class="kv"><dt>Cash</dt><dd>${money(g().s.cash)}</dd><dt>Assets and pipelines (book)</dt><dd>${money(q.hard)}</dd><dt>Going-concern premium (${k === 'ipo' ? 10 : 6}x average daily profit ${money(q.avg)})</dt><dd>${money(q.premium)}</dd><dt>Brokerage 12%</dt><dd class="red">-${money(q.brokerage)}</dd><dt>Debt repaid</dt><dd class="red">-${money(g().debt())}</dd><div class="sep"></div><dt>Proceeds in 48h</dt><dd class="gold">${money(q.proceeds)}</dd><dt>Locked EEI</dt><dd class="green">${q.eeiIfNow.toFixed(2)}</dd></dl><p class="small mute">This ends your run and locks the score. Nothing is undone.</p>`, 'Exit now', () => say(g().exit(k)), true);
    },
    logf(b) { U.logF = b.value; render(); },
    csv() {
      const rows = [['day', 'hour', 'type', 'description', 'amount', 'creativity_multiplier'], ...g().s.ledger.map((e) => [Math.floor(e.h / 24) + 1, e.h, e.type, e.text, e.amt.toFixed(2), e.cm ? e.cm.toFixed(3) : ''])];
      const text = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = `paperclip-ledger-${g().s.pid}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    debrief() { dlg.close(); hooks.onDebrief(); },
    tutorial() { dlg.close(); hooks.onTutorial(); },
    leave() { S.leaveRoom(); dlg.close(); toast('Left the room. You keep your solo run.', 'info'); render(); },
    joinroom() {
      const code = ($('#m-code', dlg.el).value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), relay = $('#m-relay', dlg.el).value.trim();
      if (code.length < 3) { toast('Enter the room code from your instructor.', 'warn'); return; }
      kv.set('relay', relay); dlg.close(); hooks.onJoin({ code, relay });
    },
    savefile() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(g().s)], { type: 'application/json' })); a.download = `paperclip-save-${g().s.pid}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); },
    reset() { confirmBox('Start over?', '<p>This deletes your current run from this browser. Your instructor still sees your last published numbers until you join again.</p>', 'Delete and restart', () => hooks.onReset(), true); },
  };
  delegate(root, acts);
  const call = (name, ds = {}) => acts[name]?.({ dataset: ds, value: '' });
  wv = createWorldView({ S, U, call, setTab: (tab) => acts.tab({ dataset: { t: tab } }), render });
  if (!dlg.el._wired) {
    dlg.el._wired = true;
    delegate(dlg.el, new Proxy({}, { get: (_, k) => dlg.el._acts?.[k] }));
    dlg.el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) dlg.close(); });
  }
  dlg.el._acts = acts;
  dlg.el.addEventListener('keydown', () => {});
  root.addEventListener('keydown', (e) => {
    if (e.target.getAttribute?.('role') === 'tab' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      const tabs = $$('[role=tab]', e.target.parentElement), i = tabs.indexOf(e.target), n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      n.focus(); n.click(); e.preventDefault();
    } else if (e.target.getAttribute?.('role') === 'button' && e.target.tagName !== 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });

  // ---- session events
  const off = S.on((type, data) => {
    if (type === 'tick' || type === 'change' || type === 'refresh') { if (type !== 'tick' || performance.now() - (U.last || 0) > 230) { U.last = performance.now(); render(); } }
    if (type === 'note') {
      const n = data;
      if (n.level !== 'info' || n.milestone) toast(n.text, n.level === 'bad' ? 'bad' : n.level === 'good' ? 'good' : n.level === 'warn' ? 'warn' : 'info');
      if (n.alert) queue(V.alertDialog(n.alert), { cls: 'alert', label: n.alert.name, sound: 'alarm' });
      if (n.milestone) { sfx.level(); burst({ power: 1.4 }); }
    }
    if (type === 'rewound') toast('Your instructor rewound the simulation.', 'warn');
  });
  const over = setInterval(() => {
    const s = S.game?.s;
    if (s?.over && !U.overShown) { U.overShown = true; queue(`<h2 tabindex="-1" autofocus>The simulation is complete</h2><p>Your final Economic Efficiency Index is <b class="gold">${S.game.eei().toFixed(2)}</b>. Open the debrief to review your decisions and prepare your reflection.</p><div class="row"><button class="btn big" data-act="debrief" autofocus>Open debrief</button><button class="btn ghost" data-close>Keep looking around</button></div>`, { label: 'Complete', sound: 'level' }); }
  }, 1500);

  render();
  return { render, destroy() { dead = true; off(); clearInterval(over); wv?.hide(); } };
}
