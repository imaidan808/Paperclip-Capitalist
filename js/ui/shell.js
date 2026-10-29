// The game screen, world first. The 2.5D world fills the window; over it sit the HUD, the mission tracker, a news ticker, a dock of icons and one drawer
// at a time (docs/V2_DESIGN.md section 8). Everything a drawer needs is on `ctx`; drawers live in ./drawers/ and are listed in ./drawers/index.js.
//
// A drawer module default-exports { id, icon, label, visible(ctx), badge(ctx), html(ctx), acts(ctx) }:
//   html(ctx)  -> the drawer body as an HTML string (pure; re-run on every refresh, never put state in the DOM)
//   acts(ctx)  -> { actName(el, event) } delegated click/change/input handlers; prefix every name with the drawer id ("stock-sell")
// ctx: S (session), g() (the Game), U (UI state), progress (quests/Codex), render(), toast(msg, level), say(result), queue(html, opts), confirmBox(...),
//      openDrawer(id), closeDrawer(), deal(spec) (the Deal Room), on(fn) (game-event bus), dlg, plus the helpers re-exported by common.js.
//
// Layout is css/shell.css (its header draws the layers, the anchors and the layouts). This file's part of it: it measures the HUD, the dock, the ticker and the goal tracker and
// publishes their heights as --hud-h, --dock-h, --tick-h and --trk-b on <html> (so everything anchored to them follows when they wrap), lets a phone's bottom sheet be dragged
// shut, and keeps the render path cheap (attributes written only when they change, bars listed once per render and painted only when they move, no work for a hidden tab).
import { ZONES, TOTAL_HOURS, CLIENTS } from '../config.js';
import { $, $$, esc, setHTML, delegate, dlg, toast, announce, sfx, burst, reduced, settingsDialog, settings, applySettings } from './common.js';
import { kv } from '../session.js';
import { hudHTML, trackerHTML, tickerHTML } from './hud.js';
import { DRAWERS } from './drawers/index.js';
import { openDeal } from './deal.js';
import { createWorldView } from './worldview.js';
import { audio, wireAudio, toggleMute } from '../audio/index.js';
import { createCues } from './audiocues.js';
import { Progress } from '../meta/progress.js';
import { fmtMoney as money, fmtPct as pct } from '../market.js';

// Closes the shared dialog from any [data-close] inside it. It lives out here, not inside mountGame: a handler on the page-wide <dialog> that was made in mountGame would keep
// that mount's whole scope (the stage, the world and its bitmaps) reachable for as long as the page lives, long after the game screen has gone.
function closeOnClick(e) { if (e.target.closest('[data-close]')) dlg.close(); }

export function mountGame(root, S, hooks) {
  const g = () => S.game;
  const U = { zone: 1, drawer: null, sel: new Set(), queue: [], last: 0, prev: {}, features: null, tracker: null };
  const listeners = new Set();
  let wv = null, dead = false, progress = null, wasOpen = false, cues = null, unwire = null;

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
    S, U, g, hooks, dlg, el, esc, money, pct, $, $$, sfx, audio, burst, reduced, announce, setHTML, delegate,
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
  function openDrawer(id, o = {}) {
    if (!drawerOf(id)) return;
    const was = U.drawer;
    U.drawer = id; render();
    if (was !== id) $('#dh-title', el.drawer)?.focus({ preventScroll: true });
    ctx.emit({ type: 'ui', ui: 'open-drawer', id, ...(was === id ? { again: true } : {}), ...(o.quiet ? { quiet: true } : {}) }); // a drawer that was already open, or one opened as the quiet result of something with its own sound (a crate clicked in the world), is not heard opening; the Academy still hears the event
  }
  function closeDrawer(o) { if (!U.drawer) return; const d = U.drawer; U.drawer = null; render(); $(`[data-fid="dk-${d}"]`, el.dock)?.focus({ preventScroll: true }); ctx.emit({ type: 'ui', ui: 'close-drawer', id: d, ...(o && o.quiet === true ? { quiet: true } : {}) }); }

  function render() {
    if (dead || !g()) return;
    if (U.drawer && !visibleIds().has(U.drawer)) U.drawer = null;
    const changed = [setHTML(el.hud, hudHTML(ctx)), setHTML(el.tracker, trackerHTML(ctx)), setHTML(el.ticker, tickerHTML(ctx)), setHTML(el.dock, dockHTML())].some(Boolean);
    let redrawn = changed; // did any part of the page get new markup (and so new bar elements)?
    // Attributes are written only when they change: a tick that changes nothing must cost the page nothing (no style recalculation, no mutation records).
    const open = !!U.drawer, key = U.drawer || '', label = drawerOf(U.drawer)?.label || 'Panel';
    if (el.drawer.hidden === open) el.drawer.hidden = !open;
    if (el.stage.dataset.drawer !== key) el.stage.dataset.drawer = key;
    if (el.drawer.getAttribute('aria-label') !== label) el.drawer.setAttribute('aria-label', label);
    const html = drawerHTML();
    if (el.drawer._html !== html) { // scrollTop is a layout read: take it only when the markup is really about to be replaced, and keep a refresh from throwing the reader back to the top
      const was = el.drawer.dataset.d === U.drawer ? el.drawer.querySelector('.db') : null, top = was ? was.scrollTop : 0;
      if (setHTML(el.drawer, html)) { redrawn = true; if (top) { const db = el.drawer.querySelector('.db'); if (db) db.scrollTop = top; } }
    }
    if (el.drawer.dataset.d !== key) el.drawer.dataset.d = key;
    wv?.update();
    if (open !== wasOpen) { wasOpen = open; fitToasts(); }
    if (redrawn) collectBars();
    paintBars(redrawn);
    pumpQueue();
    cues?.render(); // after the world has been brought up to date: a buyer's door bell is panned to where the buyer is
  }

  // ---- anchors: the stylesheet places the tracker, ticker, drawer, camera, list and toasts against the HUD above and the dock below (css/shell.css, "How it is anchored").
  // These can change height (the HUD wraps to two rows, the dock compacts, the news is one line or two, the goal is longer, the text size changes), so their real size is
  // measured and written on <html>: --hud-h, --dock-h (the dock's top, measured from the bottom), --tick-h, and --trk-b, the line under the HUD and the goal tracker (the camera
  // buttons start below it, so a tall tracker never covers them). The tracker's share is capped so a goal squeezed into a sliver cannot push the camera off the screen.
  const docEl = root.ownerDocument.documentElement;
  const anchors = {};
  const put = (k, v) => { v = Math.round(v); if (v !== anchors[k]) { anchors[k] = v; docEl.style.setProperty('--' + k, v + 'px'); } };
  function measure() {
    if (!el.stage.clientHeight) return; // not laid out (a hidden mount): leave the stylesheet's fallbacks
    put('hud-h', el.hud.offsetHeight); put('dock-h', el.stage.clientHeight - el.dock.offsetTop); put('tick-h', el.ticker.offsetHeight);
    // The tracker hangs from the HUD's foot, so it is read after --hud-h is written (a HUD that wrapped has moved it without changing its size).
    const trk = el.tracker.offsetHeight;
    put('trk-b', Math.min(trk ? el.tracker.offsetTop + trk : el.hud.offsetHeight, el.stage.clientHeight * 0.6));
  }
  // Toasts stand to the left of an open side drawer as far as the camera buttons allow (css/shell.css, --toast-r). When the window (or a big text size) leaves less than a
  // toast's own width between the two, they would lie over the drawer: then the stack is cut to the newest one, at the drawer's foot, where it covers a row of the body and never its
  // tabs. Every toast is still read out. Looked at when the drawer opens or shuts and when anything resizes, never per tick (it reads the layout).
  let tight = false;
  function fitToasts() {
    let now = false;
    const dr = U.drawer && !el.drawer.hidden ? el.drawer.getBoundingClientRect() : null, cam = dr && el.world.querySelector('.wvctl');
    if (dr && cam && dr.width && dr.left > dr.width * 0.1) { // a side drawer (a bottom sheet starts at the left edge: its toasts go above it)
      const rem = parseFloat(getComputedStyle(docEl).fontSize) || 16;
      now = dr.left - cam.getBoundingClientRect().right - 8 < 14 * rem;
    }
    if (now !== tight) { tight = now; if (now) el.stage.dataset.toasts = 'tight'; else delete el.stage.dataset.toasts; }
  }
  const sizer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { measure(); fitToasts(); }) : null;
  sizer?.observe(el.hud); sizer?.observe(el.dock); sizer?.observe(el.ticker); sizer?.observe(el.tracker); sizer?.observe(el.stage);

  // A phone's bottom sheet closes the way a native one does: drag its header down. Only the header takes the gesture (touch-action: none there); the close button and Escape stay.
  const SHEET = '(max-width: 820px) and (min-height: 521px)';
  let pull = null;
  el.drawer.addEventListener('pointerdown', (e) => {
    if (e.button || pull || !e.target.closest('.dh') || e.target.closest('button') || !matchMedia(SHEET).matches) return;
    pull = { id: e.pointerId, y: e.clientY, dy: 0 };
    try { el.drawer.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
    el.drawer.classList.add('dragging');
  });
  el.drawer.addEventListener('pointermove', (e) => {
    if (!pull || e.pointerId !== pull.id) return;
    pull.dy = Math.max(0, e.clientY - pull.y);
    el.drawer.style.transform = `translateY(${pull.dy}px)`;
  });
  const letGo = (e) => {
    if (!pull || e.pointerId !== pull.id) return;
    const far = e.type === 'pointerup' && pull.dy > Math.min(120, el.drawer.offsetHeight * 0.3);
    pull = null; el.drawer.classList.remove('dragging');
    if (!far) { el.drawer.style.transform = ''; return; }
    el.drawer.style.transform = 'translateY(100%)'; // slide the rest of the way, then close
    setTimeout(() => { el.drawer.style.transform = ''; closeDrawer(); }, reduced() ? 0 : 160);
  };
  el.drawer.addEventListener('pointerup', letGo); el.drawer.addEventListener('pointercancel', letGo);

  // ---- live bars: the engine steps whole hours, bars interpolate between steps.
  // The bars are listed once per render (never searched for on every pass), each width is worked out from the game state first and written only when it moved by a
  // visible amount (a quarter of a percent is under a pixel on a 400px bar), and the loop sleeps while the tab is hidden or the clock is stopped.
  let bars = [], barT = 0, barPass = 0, lastHf = -1;
  function collectBars() { bars = $$('[data-bar]', root).map((b) => { const [k, id] = b.dataset.bar.split(':'); return { b, k, id, w: -1 }; }); }
  function paintBars(force) {
    const game = g(); if (!game || !bars.length) return;
    const s = game.s, live = S.clock.now(), frac = S.clock.paused || s.over ? 0 : Math.max(0, Math.min(1, live - s.hour)), hf = s.hour + frac;
    if (!force && hf === lastHf) return; // nothing advanced since the last pass
    lastHf = hf;
    const next = bars.map(({ k, id }) => {
      let f = 0;
      if (k === 'day') f = hf / TOTAL_HOURS;
      else if (k === 'lead') { for (const z of s.zones) { const l = (s.leads[z] || []).find((x) => x.id === id); if (l) f = 1 - (hf - l.born) / (l.exp - l.born); } }
      else if (k === 'pipe') { const p = s.pipes.find((x) => x.id === id); f = p && p.inflight ? (p.prog + (hf - s.hour)) / Math.max(1, p.len) : 0; }
      else if (k === 'freight') { const fr = s.freight.find((x) => x.id === id); f = fr ? 1 - (fr.arrive - hf) / Math.max(1, fr.arrive - (fr.sent ?? fr.arrive - 6)) : 1; }
      else if (k === 'client') { const c = s.clients.find((x) => x.id === id); f = c ? (hf - (c.until - CLIENTS[c.tier].days * 24)) / (CLIENTS[c.tier].days * 24) : 0; }
      return Math.round(Math.max(0, Math.min(1, f)) * 400) / 4; // quarter-percent steps: under a pixel on a 400px bar
    });
    for (let i = 0; i < bars.length; i++) if (bars[i].w !== next[i] && bars[i].b.isConnected) { bars[i].w = next[i]; bars[i].b.style.width = next[i] + '%'; }
  }
  function barLoop() {
    barT = 0; if (dead || document.hidden) return; // a hidden tab asks for nothing: `wake` starts the loop again when it is shown
    if (++barPass % 10 === 0) collectBars();
    paintBars();
    barT = setTimeout(barLoop, reduced() ? 600 : S.clock.paused ? 250 : 100); // slow while nothing moves, still quick to catch a resume
  }
  const wake = () => { if (document.hidden || dead) return; collectBars(); paintBars(true); if (!barT) barLoop(); }; // back from another tab: catch up at once, and start the loop if it had stopped
  document.addEventListener('visibilitychange', wake);
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
  function say(r, good = 'good') { if (r.msg) toast(r.msg, r.ok ? good : 'bad', undefined, r.ok ? undefined : { refusal: true }); if (!r.ok && !r.msg) audio.play('ui.refuse'); return r; } // a refusal with words is heard as its bad toast (js/audio/wire.js); one with none has no toast to be heard through

  function breakdown(k) {
    const game = g(), s = game.s, row = (a, b, c = '') => `<dt>${a}</dt><dd class="${c}">${b}</dd>`;
    let body = '';
    if (k === 'cash' || k === 'nw') {
      const inv = game.invValue(), pip = s.pipes.reduce((a, p) => a + p.basis, 0), fly = s.pipes.reduce((a, p) => a + (p.inflight || 0), 0), set = s.settle.reduce((a, x) => a + x.amt, 0);
      const esc2 = s.escrow.reduce((a, e) => a + (e.cash || 0) + e.assets.reduce((x, y) => x + game.val(y), 0), 0), tr = s.freight.reduce((a, f) => a + game.inTransit(f), 0); // the engine counts a crate on a truck at the lower of where it left and where it is going, so the dialog's rows add up to the net worth beside them
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
    sound() { // the speaker button: the same switch as key M (js/audio/wire.js), whose sound it plays itself (muting is silent, unmuting is a small "ok")
      const a = settings.audio; if (!a) return;
      const r = toggleMute(a); // at volume 0 "on" brings the volume back and says so; with both buses off nothing changes and the words say why
      if (r.changed) { settings.audio = r.next; applySettings(); }
      toast(r.shown, 'info'); // the icon changes, and a toast says what it changed to (it speaks itself: no announce besides; fifth round, U3)
      if (r.changed && !r.next.mute) { audio.unlock(); if (r.hears) audio.play('ui.ok'); }
      render();
    },
    speed(b) { S.setSpeed(+b.value); },
    help() { dlg.open(`<button class="btn ghost sm x" data-close>Close</button><h2 tabindex="-1" autofocus>How to play</h2><ol class="small"><li>Click a <b>buyer</b> in the world to sell something to them, or a <b>booth</b> to buy a lot. Every deal can be played (Read, Pitch, Close) or auto-played with <b>Quick</b>.</li><li>Your <b>Goal</b> card tells you what to do next. The <b>Codex</b> explains why things work.</li><li>Net worth opens new districts. Each one has a signature rule and teaches one idea.</li><li>Press <b>1</b> to <b>7</b> to open the panels, <b>Esc</b> to close them.</li><li>Press <b>M</b> to mute or unmute sound.</li></ol>`, { label: 'Help' }); },
    settings() { settingsDialog(() => render()); },
    menu,
    breakdown(b) { breakdown(b.dataset.k); },
    'confirm-go'() { const fn = U.confirm; U.confirm = null; dlg.close(); fn?.(); render(); },
    alert(b) { const n = g().s.news[+b.dataset.i]; if (n?.alert) { dlg.open(alertHTML(n.alert), { cls: 'alert', label: 'Macro alert' }); audio.request('alert.advance', { variant: 'l' + Math.min(3, Math.max(1, Math.round(Number(n.alert.level) || 1))) }); } }, // the ticker's note, opened again: the alert's sound (the dialog observer leaves .alert dialogs to this)
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
  dlg.el.addEventListener('click', closeOnClick); // the same function every mount, so adding it again changes nothing (see closeOnClick)
  ctx.acts = acts;
  ctx.call = (name, ds = {}, value = '') => acts[name]?.({ dataset: ds, value, closest: () => null });

  // A select whose list is open uses Escape to close the list, not the drawer (`:open`, where the browser knows it).
  const listOpen = (t) => { try { return !!t.matches?.('select:open'); } catch { return false; } };
  const keydown = (e) => {
    if (dlg.el.open || e.metaKey || e.ctrlKey || e.altKey) return;
    const field = e.target.matches?.('input, select, textarea, [contenteditable]');
    // Escape closes the drawer from inside one of its fields too, so the keyboard is never stuck in a form (the 1 to 7 shortcuts stay out of fields, they are typed there)
    if (e.key === 'Escape' && U.drawer && !e.defaultPrevented && !e.isComposing && !(field && listOpen(e.target))) { closeDrawer(); e.preventDefault(); return; }
    if (field) return;
    if (/^[1-7]$/.test(e.key)) { const vis = DRAWERS.filter((d) => visibleIds().has(d.id)); const d = vis[+e.key - 1]; if (d) { U.drawer === d.id ? closeDrawer() : openDrawer(d.id); e.preventDefault(); } }
  };
  document.addEventListener('keydown', keydown);

  // ---- progress: quests, achievements, Codex
  function attachGame() {
    progress = new Progress(g(), {
      onComplete(kind, def) {
        const msg = kind === 'quest' ? `Quest complete: ${def.title}` : kind === 'achievement' ? `Achievement: ${def.title}` : `Daily bounty done: ${def.title}`;
        toast(msg, 'good', undefined, { own: true }); sfx.level(); burst({ power: kind === 'achievement' && def.rarity === 'epic' ? 1.6 : 1 }); announce(msg);
        // the reward is one more request in the burst that caused it (a sale, a level): the collector (docs/AUDIO.md 3.4.2) picks what is heard
        if (kind === 'quest') audio.request('quest.complete'); else if (kind === 'achievement') audio.request('achievement', { variant: ['common', 'rare', 'epic'].includes(def.rarity) ? def.rarity : 'common', meta: { rarity: def.rarity } }); else audio.request('daily.done');
      },
      onCodex(entry) { toast(`Codex unlocked: ${entry.title}`, 'info', undefined, { own: true }); sfx.blip(); audio.request('codex.unlock'); },
    });
    g().onEvent = (evt) => {
      progress.onEvent(evt);
      cues?.event(evt);
      ctx.emit(evt);
      if (evt.type === 'level') { sfx.level(); burst({ power: 1.2 }); } // the words are the engine's own note (Level N: a skill point, or the XP a mastered founder gets instead), which the news feed already toasts
    };
  }
  attachGame();
  const firstZone = Math.max(...g().s.zones);
  U.zone = U.zone > firstZone ? firstZone : U.zone;

  // ---- the world
  wv = createWorldView(ctx);
  wv.mount(el.world);
  cues = createCues(ctx, { settings, save: applySettings, announce, toast, supported: () => audio.supported });
  unwire = wireAudio(ctx, { settings, save: applySettings, announce, toast }); // the sound layer (js/audio/wire.js): the engine's events, the session's notes and this shell's `ui` events become sounds

  // ---- session events
  const off = S.on((type, data) => {
    if (type === 'tick' || type === 'change' || type === 'refresh') { if (type !== 'tick' || performance.now() - U.last > 230) { U.last = performance.now(); render(); } }
    if (type === 'note') {
      const n = data;
      if (n.level !== 'info' || n.milestone) toast(n.text, n.level === 'bad' ? 'bad' : n.level === 'good' ? 'good' : n.level === 'warn' ? 'warn' : 'info');
      if (n.alert) queue(alertHTML(n.alert), { cls: 'alert', label: n.alert.name, sound: 'alarm' });
      if (n.milestone) { sfx.level(); burst({ power: 1.4 }); }
      else if (n.zone) { sfx.blip(); wv?.world?.flash?.(n.zone); } // a district opening
      cues?.note(n);
    }
    if (type === 'offer') cues?.session('offer', data);
    if (type === 'rewound') { attachGame(); cues?.session('rewound'); toast('Your instructor rewound the simulation.', 'warn'); }
  });
  const over = setInterval(() => {
    const s = S.game?.s;
    if (s?.over && !U.overShown) { U.overShown = true; queue(`<h2 tabindex="-1" autofocus>The simulation is complete</h2><p>Your final Economic Efficiency Index is <b class="gold">${S.game.eei().toFixed(2)}</b>. Open the debrief to review your decisions and prepare your reflection.</p><div class="row"><button class="btn big" data-act="debrief" autofocus>Open debrief</button><button class="btn ghost" data-close>Keep looking around</button></div>`, { label: 'Complete', sound: 'level' }); }
  }, 1500);

  function destroy() {
    dead = true; off(); clearInterval(over); clearTimeout(barT); sizer?.disconnect();
    try { unwire?.(); } catch { /* the sound layer is already gone */ } unwire = null; cues?.destroy(); cues = null;
    document.removeEventListener('keydown', keydown); document.removeEventListener('visibilitychange', wake);
    for (const k in anchors) docEl.style.removeProperty('--' + k); // the next screen falls back to the stylesheet's values
    if (dlg.el._acts === acts) dlg.el._acts = null; // the shared dialog's action table is this mount's until another screen swaps it: let go of it, it holds the whole mount
    wv?.destroy(); if (g()) g().onEvent = null;
  }
  render();
  cues.hint(); // the one-time "sound is on" note (docs/AUDIO.md 7.4)
  return { render, destroy, ctx };
}

export function alertHTML(a) {
  return `<button class="btn ghost sm x" data-close>Close</button><h2 tabindex="-1" autofocus>${esc(a.name)}</h2><p class="mono small gold">${esc(a.code || '')}</p><p>${esc(a.readout || '')}</p>${(a.vars || []).length ? `<ul class="small">${a.vars.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>` : ''}<p class="small mute">${esc(a.enforcement || '')}</p>`;
}
