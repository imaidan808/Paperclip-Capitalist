// The game screen, world first. The 2.5D world fills the window; over it sit the HUD, the mission tracker, a news ticker, a dock of icons and one drawer
// at a time (docs/V2_DESIGN.md section 8). Everything a drawer needs is on `ctx`; drawers live in ./drawers/ and are listed in ./drawers/index.js.
//
// A drawer module default-exports { id, icon, label, visible(ctx), badge(ctx), html(ctx), acts(ctx) }:
//   html(ctx)  -> the drawer body as an HTML string (pure; re-run on every refresh, never put state in the DOM)
//   acts(ctx)  -> { actName(el, event) } delegated click/change/input handlers; prefix every name with the drawer id ("stock-sell")
// ctx: S (session), g() (the Game), U (UI state), progress (quests/Codex), render(), toast(msg, level), say(result), queue(html, opts), confirmBox(...),
//      openDrawer(id), closeDrawer(), deal(spec) (the Deal Room), on(fn) (game-event bus), dlg, plus the helpers re-exported by common.js.
import { ZONES, TOTAL_HOURS, CLIENTS } from '../config.js';
import { $, $$, esc, setHTML, delegate, dlg, toast, announce, sfx, burst, reduced, settingsDialog } from './common.js';
import { kv } from '../session.js';
import { hudHTML, trackerHTML, tickerHTML } from './hud.js';
import { DRAWERS } from './drawers/index.js';
import { openDeal } from './deal.js';
import { createWorldView } from './worldview.js';
import { Progress } from '../meta/progress.js';
import { fmtMoney as money, fmtPct as pct } from '../market.js';

export function mountGame(root, S, hooks) {
  const g = () => S.game;
  const U = { zone: 1, drawer: null, sel: new Set(), queue: [], last: 0, prev: {}, features: null, tracker: null };
  const listeners = new Set();
  let wv = null, dead = false, progress = null;

  root.innerHTML = `<div class="stage" id="stage">
      <div class="worldhost" id="worldhost" data-anchor="world"></div>
      <header class="hud" id="hud"></header>
      <div class="trackerhost" id="trackerhost"></div>
      <div class="tickerhost" id="tickerhost"></div>
      <section class="drawer" id="drawer" data-anchor="drawer" aria-label="Panel" hidden></section>
      <nav class="dock" id="dock" aria-label="Game panels"></nav>
      <div class="overlay" id="overlay"></div>
    </div>`;
  const el = { stage: $('#stage'), world: $('#worldhost'), hud: $('#hud'), tracker: $('#trackerhost'), ticker: $('#tickerhost'), drawer: $('#drawer'), dock: $('#dock'), overlay: $('#overlay') };

  // ---- the context every drawer receives
  const ctx = {
    S, U, g, hooks, dlg, el, esc, money, pct, $, $$, sfx, burst, reduced, announce, setHTML, delegate,
    get progress() { return progress; },
    render: () => render(),
    toast, queue, confirmBox, say,
    openDrawer, closeDrawer,
    deal: (spec) => openDeal(ctx, spec),
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit(evt) { for (const fn of [...listeners]) { try { fn(evt); } catch (e) { console.error(e); } } },
    world: () => wv,
    destroy: () => destroy(),
  };

  function visibleIds() {
    if (U.features) return new Set(U.features);
    const s = g().s, ids = new Set(['stock', 'market', 'codex', 'quests']);
    if (s.zones.length > 1) ids.add('travel');
    if (s.mil.m1) { ids.add('crew'); ids.add('bank'); }
    return ids;
  }
  const drawerOf = (id) => DRAWERS.find((d) => d.id === id);

  function dockHTML() {
    const vis = visibleIds();
    return DRAWERS.filter((d) => vis.has(d.id)).map((d, i) => {
      const b = d.badge?.(ctx);
      return `<button class="dk" data-anchor="dock-${d.id}" data-act="dock" data-d="${d.id}" data-fid="dk-${d.id}" aria-pressed="${U.drawer === d.id}" aria-keyshortcuts="${i + 1}"><span class="ic" aria-hidden="true">${d.icon}</span><span class="lb">${esc(d.label)}</span>${b ? `<span class="bd" aria-label="${esc(String(b))} waiting">${esc(String(b))}</span>` : ''}</button>`;
    }).join('');
  }
  function drawerHTML() {
    const d = drawerOf(U.drawer);
    if (!d) return '';
    return `<header class="dh"><h2 tabindex="-1" id="dh-title"><span aria-hidden="true">${d.icon}</span> ${esc(d.label)}</h2><button class="ibtn" data-act="drawer-close" aria-label="Close ${esc(d.label)}">✕</button></header><div class="db" data-drawer="${d.id}">${d.html(ctx)}</div>`;
  }
  function openDrawer(id) {
    if (!drawerOf(id)) return;
    const was = U.drawer;
    U.drawer = id; render();
    if (was !== id) $('#dh-title', el.drawer)?.focus({ preventScroll: true });
    ctx.emit({ type: 'ui', ui: 'open-drawer', id });
  }
  function closeDrawer() { if (!U.drawer) return; const d = U.drawer; U.drawer = null; render(); $(`[data-fid="dk-${d}"]`, el.dock)?.focus({ preventScroll: true }); }

  function render() {
    if (dead || !g()) return;
    if (U.drawer && !visibleIds().has(U.drawer)) U.drawer = null;
    setHTML(el.hud, hudHTML(ctx));
    setHTML(el.tracker, trackerHTML(ctx));
    setHTML(el.ticker, tickerHTML(ctx));
    setHTML(el.dock, dockHTML());
    el.drawer.hidden = !U.drawer;
    el.stage.dataset.drawer = U.drawer || '';
    el.drawer.setAttribute('aria-label', drawerOf(U.drawer)?.label || 'Panel');
    setHTML(el.drawer, drawerHTML());
    wv?.update();
    paintBars();
    pumpQueue();
  }

  // ---- live bars: the engine steps whole hours, bars interpolate between steps
  function paintBars() {
    const game = g(); if (!game) return;
    const s = game.s, live = S.clock.now(), frac = S.clock.paused || s.over ? 0 : Math.max(0, Math.min(1, live - s.hour)), hf = s.hour + frac;
    for (const b of $$('[data-bar]', root)) {
      const [k, id] = b.dataset.bar.split(':'); let f = 0;
      if (k === 'day') f = hf / TOTAL_HOURS;
      else if (k === 'lead') { for (const z of s.zones) { const l = (s.leads[z] || []).find((x) => x.id === id); if (l) f = 1 - (hf - l.born) / (l.exp - l.born); } }
      else if (k === 'pipe') { const p = s.pipes.find((x) => x.id === id); f = p && p.inflight ? (p.prog + (hf - s.hour)) / Math.max(1, p.len) : 0; }
      else if (k === 'freight') { const fr = s.freight.find((x) => x.id === id); f = fr ? 1 - (fr.arrive - hf) / Math.max(1, fr.arrive - (fr.sent ?? fr.arrive - 6)) : 1; }
      else if (k === 'client') { const c = s.clients.find((x) => x.id === id); f = c ? (hf - (c.until - CLIENTS[c.tier].days * 24)) / (CLIENTS[c.tier].days * 24) : 0; }
      b.style.width = Math.max(0, Math.min(1, f)) * 100 + '%';
    }
  }
  const barLoop = () => { if (dead) return; paintBars(); if (reduced()) setTimeout(barLoop, 600); else requestAnimationFrame(() => setTimeout(barLoop, 80)); };
  barLoop();

  // ---- dialogs and feedback
  function pumpQueue() {
    if (dlg.el.open || !U.queue.length) return;
    const q = U.queue.shift();
    dlg.open(q.html, { cls: q.cls || '', label: q.label, onClose: () => setTimeout(pumpQueue, 80) });
    if (q.sound) sfx[q.sound]?.();
  }
  function queue(html, o = {}) { U.queue.push({ html, ...o }); pumpQueue(); }
  function confirmBox(title, body, ok, fn, danger = false) {
    U.confirm = fn;
    dlg.open(`<h2 tabindex="-1" autofocus>${esc(title)}</h2>${body}<div class="row gap"><button class="btn ${danger ? 'danger' : ''}" data-act="confirm-go" autofocus>${esc(ok)}</button><button class="btn ghost" data-close>Cancel</button></div>`, { label: title });
  }
  function say(r, good = 'good') { if (r.msg) toast(r.msg, r.ok ? good : 'bad'); if (!r.ok) sfx.buzz(); return r; }

  function breakdown(k) {
    const game = g(), s = game.s, row = (a, b, c = '') => `<dt>${a}</dt><dd class="${c}">${b}</dd>`;
    let body = '';
    if (k === 'cash' || k === 'nw') {
      const inv = game.invValue(), pip = s.pipes.reduce((a, p) => a + p.basis, 0), fly = s.pipes.reduce((a, p) => a + (p.inflight || 0), 0), set = s.settle.reduce((a, x) => a + x.amt, 0);
      const esc2 = s.escrow.reduce((a, e) => a + (e.cash || 0) + e.assets.reduce((x, y) => x + game.val(y), 0), 0), tr = s.freight.reduce((a, f) => a + f.items.reduce((x, y) => x + game.val(y, f.to), 0), 0);
      body = `<dl class="kv">${row('Cash on hand', money(s.cash))}${row('Inventory at fair value', money(inv))}${row('Assets in transit', money(tr))}${row('Manager capital (book)', money(pip))}${row('Capital in running cycles', money(fly))}${row('Settling sales', money(set))}${row('Held in escrow', money(esc2))}${row('Debt', '-' + money(game.debt()), 'red')}<div class="sep"></div>${row('Net worth', money(game.netWorth()), 'gold')}${row('Net worth peak', money(s.peak))}</dl><p class="small mute">Districts open as your net worth passes their gate. Stock decays and running cycles earn, so money that keeps moving beats money that sits.</p>`;
    } else if (k === 'day') {
      const ev = s.events.filter((e) => e.warned);
      body = `<dl class="kv">${row('Virtual day', `${game.day} of 90`)}${row('Virtual hour', s.hour + ' / ' + TOTAL_HOURS)}${row('Real time per virtual day', `${(168 / S.clock.speed).toFixed(0)} seconds at ${S.clock.speed}x`)}</dl><h3 class="gap">Known macro events</h3>${ev.length ? ev.map((e) => `<p class="small"><b>${esc(e.name)}</b>: ${e.start > s.hour ? 'in ' + Math.round((e.start - s.hour) / 24 * 10) / 10 + ' days' : 'started day ' + (Math.floor(e.start / 24) + 1)}</p>`).join('') : '<p class="small mute">No warnings yet. Capital Sourcing and the Market Research Suite buy earlier notice.</p>'}`;
    }
    dlg.open(`<button class="btn ghost sm x" data-close>Close</button><h2 tabindex="-1" autofocus>${{ cash: 'Cash', nw: 'Net worth', day: 'Clock' }[k] || 'Numbers'}</h2>${body}`, { label: 'Breakdown' });
  }
  function menu() {
    const inRoom = !!S.roomInfo;
    dlg.open(`<button class="btn ghost sm x" data-close>Close</button><h2 tabindex="-1" autofocus>Menu</h2><div class="grid g2">
      <div class="card"><h3>Classroom room</h3>${inRoom ? `<p class="small">In room <b class="mono">${esc(S.roomInfo.code)}</b> via ${S.room.kind === 'relay' ? 'relay server' : 'this browser (other tabs)'}. The instructor's clock is in charge.</p><button class="btn sm ghost" data-act="leave">Leave room</button>`
        : `<p class="small mute">Joining restarts your run on the instructor's shared clock.</p><label for="m-code">Room code</label><input id="m-code" maxlength="8" style="text-transform:uppercase" autocomplete="off"><label for="m-relay" class="gap">Relay server URL (optional)</label><input id="m-relay" placeholder="wss://your-relay.example" value="${esc(kv.get('relay') || '')}"><button class="btn sm gap" data-act="joinroom">Join</button>`}</div>
      <div class="card"><h3>This run</h3><div class="grid"><button class="btn sm" data-act="debrief">Open debrief and reflection</button><button class="btn sm ghost" data-act="academy">Academy: replay a lesson</button><button class="btn sm ghost" data-act="settings">Display and sound</button><button class="btn sm ghost" data-act="savefile">Download my save</button><button class="btn sm danger" data-act="reset">Start over</button></div></div></div>
      <p class="small mute gap">Privacy: your save lives only in this browser. Rooms share a pseudonymous Founder ID, your chosen alias and game numbers, never names or emails.</p>`, { label: 'Menu' });
  }

  // ---- base actions (drawers add their own, see the header comment)
  const base = {
    dock(b) { const id = b.dataset.d; U.drawer === id ? closeDrawer() : openDrawer(id); },
    'drawer-close': closeDrawer,
    pause() { S.setPaused(!S.clock.paused); },
    speed(b) { S.setSpeed(+b.value); },
    help() { dlg.open(`<button class="btn ghost sm x" data-close>Close</button><h2 tabindex="-1" autofocus>How to play</h2><ol class="small"><li>Click a <b>buyer</b> in the world to sell something to them, or a <b>booth</b> to buy a lot. Every deal can be played (Read, Pitch, Close) or auto-played with <b>Quick</b>.</li><li>Your <b>Goal</b> card tells you what to do next. The <b>Codex</b> explains why things work.</li><li>Net worth opens new districts. Each one has a signature rule and teaches one idea.</li><li>Press <b>1</b> to <b>7</b> to open the panels, <b>Esc</b> to close them.</li></ol>`, { label: 'Help' }); },
    settings() { settingsDialog(() => render()); },
    menu,
    breakdown(b) { breakdown(b.dataset.k); },
    'confirm-go'() { const fn = U.confirm; U.confirm = null; dlg.close(); fn?.(); render(); },
    alert(b) { const n = g().s.news[+b.dataset.i]; if (n?.alert) dlg.open(alertHTML(n.alert), { cls: 'alert', label: 'Macro alert' }); },
    debrief() { dlg.close(); hooks.onDebrief(); },
    academy() { dlg.close(); hooks.onAcademy?.(); },
    leave() { S.leaveRoom(); dlg.close(); toast('Left the room. You keep your solo run.', 'info'); render(); },
    joinroom() {
      const code = ($('#m-code', dlg.el).value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), relay = $('#m-relay', dlg.el).value.trim();
      if (code.length < 3) { toast('Enter the room code from your instructor.', 'warn'); return; }
      kv.set('relay', relay); dlg.close(); hooks.onJoin({ code, relay });
    },
    savefile() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(g().s)], { type: 'application/json' })); a.download = `paperclip-save-${g().s.pid}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); },
    reset() { confirmBox('Start over?', '<p>This deletes your current run from this browser. Your instructor still sees your last published numbers until you join again.</p>', 'Delete and restart', () => hooks.onReset(), true); },
  };
  const acts = { ...base };
  for (const d of DRAWERS) Object.assign(acts, d.acts?.(ctx) || {});
  delegate(root, acts);
  delegate(dlg.el, acts);
  if (!dlg.el._closer) { dlg.el._closer = true; dlg.el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) dlg.close(); }); }
  ctx.acts = acts;
  ctx.call = (name, ds = {}, value = '') => acts[name]?.({ dataset: ds, value, closest: () => null });

  const keydown = (e) => {
    if (dlg.el.open || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.matches?.('input, select, textarea, [contenteditable]')) return;
    if (e.key === 'Escape' && U.drawer) { closeDrawer(); e.preventDefault(); }
    else if (/^[1-7]$/.test(e.key)) { const vis = DRAWERS.filter((d) => visibleIds().has(d.id)); const d = vis[+e.key - 1]; if (d) { U.drawer === d.id ? closeDrawer() : openDrawer(d.id); e.preventDefault(); } }
  };
  document.addEventListener('keydown', keydown);

  // ---- progress: quests, achievements, Codex
  function attachGame() {
    progress = new Progress(g(), {
      onComplete(kind, def) {
        const msg = kind === 'quest' ? `Quest complete: ${def.title}` : kind === 'achievement' ? `Achievement: ${def.title}` : `Daily bounty done: ${def.title}`;
        toast(msg, 'good'); sfx.level(); burst({ power: kind === 'achievement' && def.rarity === 'epic' ? 1.6 : 1 }); announce(msg);
      },
      onCodex(entry) { toast(`Codex unlocked: ${entry.title}`, 'info'); sfx.blip(); },
    });
    g().onEvent = (evt) => {
      progress.onEvent(evt);
      ctx.emit(evt);
      if (evt.type === 'level') { toast(`Level ${evt.level}. You earned a skill point.`, 'good'); sfx.level(); burst({ power: 1.2 }); }
    };
  }
  attachGame();
  const firstZone = Math.max(...g().s.zones);
  U.zone = U.zone > firstZone ? firstZone : U.zone;

  // ---- the world
  wv = createWorldView(ctx);
  wv.mount(el.world);

  // ---- session events
  const off = S.on((type, data) => {
    if (type === 'tick' || type === 'change' || type === 'refresh') { if (type !== 'tick' || performance.now() - U.last > 230) { U.last = performance.now(); render(); } }
    if (type === 'note') {
      const n = data;
      if (n.level !== 'info' || n.milestone) toast(n.text, n.level === 'bad' ? 'bad' : n.level === 'good' ? 'good' : n.level === 'warn' ? 'warn' : 'info');
      if (n.alert) queue(alertHTML(n.alert), { cls: 'alert', label: n.alert.name, sound: 'alarm' });
      if (n.milestone) { sfx.level(); burst({ power: 1.4 }); }
    }
    if (type === 'rewound') { attachGame(); toast('Your instructor rewound the simulation.', 'warn'); }
  });
  const over = setInterval(() => {
    const s = S.game?.s;
    if (s?.over && !U.overShown) { U.overShown = true; queue(`<h2 tabindex="-1" autofocus>The simulation is complete</h2><p>Your final Economic Efficiency Index is <b class="gold">${S.game.eei().toFixed(2)}</b>. Open the debrief to review your decisions and prepare your reflection.</p><div class="row"><button class="btn big" data-act="debrief" autofocus>Open debrief</button><button class="btn ghost" data-close>Keep looking around</button></div>`, { label: 'Complete', sound: 'level' }); }
  }, 1500);

  function destroy() { dead = true; off(); clearInterval(over); document.removeEventListener('keydown', keydown); wv?.destroy(); if (g()) g().onEvent = null; }
  render();
  return { render, destroy, ctx };
}

export function alertHTML(a) {
  return `<button class="btn ghost sm x" data-close>Close</button><h2 tabindex="-1" autofocus>${esc(a.name)}</h2><p class="mono small gold">${esc(a.code || '')}</p><p>${esc(a.readout || '')}</p>${(a.vars || []).length ? `<ul class="small">${a.vars.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>` : ''}<p class="small mute">${esc(a.enforcement || '')}</p>`;
}
