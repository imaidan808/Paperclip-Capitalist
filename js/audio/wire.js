// The wiring (docs/AUDIO.md 8.3): what the game and the page say becomes sound. Two layers.
//   initAudio(deps)  lives for the page: the first-gesture unlock, key M, visibility, the control table (clicks, changes, sliders, submits), the dialog and toast observers.
//   wireGame(ctx)    lives for one mounted game: the engine events (4.1), the session's notes and the shell's `ui` events (4.2), the ambient state. It returns `unwire`.
// wireAudio(ctx) is the one entry point for a screen that wants both. The tables are pure functions (eventCalls, noteCalls, uiCalls, controlFor) that return what to play, so a test can
// feed them every event type; the DOM is only touched in initAudio and wireGame. Everything is inside try: a handler that throws logs once and the game never breaks for sound.
// RULE OF THE GAME: sound never carries hidden information. Nothing here reads `buy.fake`, `inspect.caught`, a lot's truth, a rival's limit or an auction's `surplus`.
import { audio } from './instance.js';
import { moneySize } from './palette.js';
import { ZONES } from '../config.js';

const calls = (...c) => c.filter(Boolean);
export const newWireState = () => ({ sale: null, saleAt: -Infinity, falling: false, scamAt: -Infinity, counterfeitAt: -Infinity, fineWaivedAt: -Infinity, repayF: null, suspected: new Set() });
const sizeFor = (amount, hooks) => moneySize(amount, hooks?.netWorth?.());
const costFor = (amount, hooks) => { const z = sizeFor(amount, hooks); return z === 'xl' ? 'l' : z; };
const SPEED_STEPS = [0.25, 1, 4, 16, 64];

/**
 * An engine event (4.1) -> the calls it makes: [['request' | 'play', id, opts], ...]. `st` is the wiring state (a sale's open mix, the notes that arrived first).
 * hooks: { now(), netWorth(), pan(kind, id), zoneTier(id), loansLeft(), cost(kind, id) }.
 */
export function eventCalls(ev, st = newWireState(), hooks = {}) {
  if (!ev || typeof ev !== 'object') return [];
  const now = hooks.now ? hooks.now() : 0, pan = (k, id) => (hooks.pan ? hooks.pan(k, id) : undefined);
  const num = (v) => (Number.isFinite(+v) ? +v : 0);
  switch (ev.type) {
    case 'pitch': {
      const price = num(ev.price), gain = Number.isFinite(+ev.gain) ? +ev.gain : 0, where = pan('zone', ev.zone);
      const sale = (id, variant, coin = {}) => {
        const o = { variant, pan: where, meta: { price, gain }, cause: 'money', with: coin ? [['cash.in', { size: sizeFor(price, hooks), cause: 'money', gainDb: -4, ...coin }]] : [] };
        st.sale = o; st.saleAt = now; st.falling = false;
        return calls(['request', id, o]);
      };
      switch (ev.outcome) {
        case 'win': return sale('sale.win', 'w');
        case 'pioneer': return sale('sale.pioneer', 'p');
        case 'herd': // a sale into the crowded band is labelled herd whatever it paid: the engine's own win test is 2% over fair
          if (gain > 0.02) return sale('sale.herd', 'hw');
          { const c = sale('sale.herd', 'h', { size: costFor(price, hooks) === 'l' ? 'm' : 's' }); st.falling = true; return c; }
        case 'flat': return sale('sale.flat', 'f', gain < -0.02 ? { dull: true } : {});
        case 'rejected': {
          const scam = ev.reason === 'scam' || gain === -1 || now - st.scamAt < 50;
          const fake = ev.reason === 'counterfeit' || now - st.counterfeitAt < 50;
          st.falling = true; st.sale = null;
          return calls(['request', scam ? 'sale.scam' : 'sale.reject', { variant: scam ? 's' : fake ? 'fake' : 'nofit', pan: where, cause: 'money' }]);
        }
        default: return [];
      }
    }
    case 'streak': {
      const n = Math.min(6, num(ev.n));
      if (n < 2) return []; // one win is not a streak
      if (st.sale && !st.falling && now - st.saleAt < 100) { st.sale.with.push(['streak', { params: { n } }]); return []; } // it rides in the sale's mix
      if (st.falling && now - st.saleAt < 100) return []; // valence never contradicts itself
      return calls(['request', 'streak', { params: { n } }]);
    }
    case 'buy': { const price = num(ev.price); return calls(['request', 'buy.lot', { variant: ev.cond === 'broken' ? 'broken' : 'ok', pan: pan('zone', ev.zone), cause: 'money', with: [['cash.out', { size: costFor(price, hooks), cause: 'money', gainDb: -4 }]] }]); } // `fake` is never read
    case 'sell-pool': return calls(['request', 'pool.sell', { cause: 'money', with: num(ev.delay) > 0 ? [] : [['cash.in', { size: sizeFor(num(ev.total), hooks), cause: 'money', gainDb: -4 }]] }]);
    case 'repair': { const p = num(ev.precision), cost = num(ev.cost), z = sizeFor(cost, hooks); return calls(['request', 'repair.done', { variant: p >= 0.8 ? 'great' : p >= 0.4 ? 'ok' : 'rough', cause: 'money', with: z === 'l' || z === 'xl' ? [['cash.out', { size: costFor(cost, hooks), gainDb: -4 }]] : [] }]); }
    case 'ship': return calls(['request', 'ship.depart', { pan: pan('zone', ev.from), cause: 'money' }]);
    case 'hire': { const kind = ['student', 'broker', 'logistics'].includes(ev.kind) ? ev.kind : 'student', amt = hooks.cost ? hooks.cost('hire', ev.kind) : 0; return calls(['request', 'hire.manager', { variant: kind, cause: 'money', with: amt && sizeFor(amt, hooks) !== 's' && sizeFor(amt, hooks) !== 'm' ? [['cash.out', { size: costFor(amt, hooks), gainDb: -4 }]] : [] }]); }
    case 'upgrade': case 'pipe-level': { const amt = hooks.cost ? hooks.cost(ev.type, ev.id) : 0, z = sizeFor(amt, hooks); return calls(['request', 'crew.build', { variant: ev.type === 'upgrade' ? 'upgrade' : 'level', cause: 'money', with: amt && (z === 'l' || z === 'xl') ? [['cash.out', { size: 'l', gainDb: -4 }]] : [] }]); }
    case 'cycle': return ev.src === 'rent' ? calls(['request', 'cash.in', { size: 's', clock: true, meta: { net: num(ev.net) } }]) : calls(['request', 'manager.cycle', { meta: { net: num(ev.net) }, pan: ev.pid != null ? pan('pipe', ev.pid) : pan('zone', ev.zone) }]);
    case 'draw': return calls(['request', 'bank.draw', { cause: 'money' }]);
    case 'repay': return calls(['request', 'bank.repay', { variant: hooks.loansLeft && hooks.loansLeft() === 0 ? 'free' : (hooks.repayF ? hooks.repayF() : st.repayF) === 'half' ? 'half' : 'full', cause: 'money' }]);
    case 'client': return calls(['request', 'crew.client', { variant: ev.tier === 'smb' ? 'smb' : 'ent', cause: 'money' }]);
    case 'audit': return calls(['request', 'audit.result', { variant: ev.ok ? 'pass' : 'fail', noCoin: !ev.ok && now - st.fineWaivedAt < 50 }]);
    case 'zone': { const tier = hooks.zoneTier ? hooks.zoneTier(ev.id) : (ZONES[ev.id]?.tier || 1); return calls(['request', 'zone.open', { variant: tier >= 3 ? 't4' : 't1', params: { t: Math.min(4, Math.max(1, tier)) }, pan: pan('zone', ev.id), meta: { tier } }]); }
    case 'milestone': { const n = Math.min(3, Math.max(1, num(ev.n))); return calls(['request', 'milestone', { variant: 'm' + n }]); }
    case 'shock': return ['tiktok', 'fed', 'tariff', 'viral', 'glut', 'scare'].includes(ev.kind) ? calls(['request', 'alert.shock', { variant: ev.kind }]) : [];
    case 'p2p': return ev.npc ? calls(['play', 'ui.ok', {}]) : []; // otherwise silent: swap.done plays from the completion note
    case 'skill': return calls(['request', 'skill.up', {}]);
    case 'level': return calls(['request', 'level.up', { meta: { level: num(ev.level) } }]);
    case 'day': return calls(['request', 'day.turn', { clock: true }]);
    case 'margin-call': return calls(['request', 'alert.margin-call', {}]);
    case 'insolvent': return calls(['request', 'alert.insolvent', {}]);
    case 'exit': return calls(['request', 'run.end', { variant: 'start' }]);
    case 'perk': if (ev.effect === 'fine-waived') { st.fineWaivedAt = now; return calls(['request', 'perk.bailout', { variant: 'waived' }]); } return ev.effect === 'bailout' ? calls(['request', 'perk.bailout', { variant: 'bailout' }]) : [];
    // silent by design: `inspect` (its `caught` is the lot's truth AND the belief), `haggle` and `auction` (the sale or purchase they led to speaks; `surplus` is never read)
    case 'inspect': case 'haggle': case 'auction': return [];
    default: return [];
  }
}

/** A note's meaning when the engine did not tag it with a `kind`: the texts are pinned by a test, so a copy edit cannot silently mute a sound. */
export function noteKind(n) {
  if (n.kind) return n.kind;
  const t = String(n.text || '');
  if (/^Scam:/.test(t)) return 'scam';
  if (/spotted a counterfeit/.test(t)) return 'counterfeit';
  if (/settled into cash\.?$/.test(t)) return 'settle';
  if (/^Freight arrived/.test(t)) return 'freight-arrive';
  if (/^Customs inspected/.test(t)) return 'customs';
  if (/was damaged in transit/.test(t)) return 'damage';
  if (/^Your mentor says/.test(t)) return 'mentor';
  if (/^SLA breach/.test(t)) return 'sla';
  if (/^Cash is negative/.test(t)) return 'overdraft';
  if (/^Market fatigue/.test(t)) return 'fatigue';
  if (/^Burnout:/.test(t)) return 'burnout';
  if (/Swap completed/.test(t)) return 'swap';
  if (/^Your net worth has fallen to zero/.test(t)) return 'insolvent';
  return '';
}
/** A session note (4.2) -> calls. Sounds that depend on what a note is about use its kind. */
export function noteCalls(n, st = newWireState(), hooks = {}) {
  if (!n || typeof n !== 'object') return [];
  const now = hooks.now ? hooks.now() : 0, k = noteKind(n), amt = Number.isFinite(+n.amt) ? +n.amt : Number((String(n.text).match(/\$([\d,.]+)/) || [])[1]?.replace(/,/g, '')) || 0;
  if (k === 'scam') { st.scamAt = now; return []; }
  if (k === 'counterfeit') { st.counterfeitAt = now; return []; }
  if (k === 'settle') return calls(['request', 'cash.in', { variant: 'settle', clock: true, meta: { amount: amt } }]);
  if (k === 'freight-arrive') return calls(['request', 'ship.arrive', { clock: true }]);
  if (k === 'customs' || k === 'damage') return calls(['request', 'ship.trouble', { variant: k, state: 'trouble-' + k }]);
  if (k === 'mentor') return calls(['request', 'mentor.tip', { clock: true }]);
  if (k === 'sla') return calls(['request', 'cash.out', { size: 'm', state: 'sla', meta: { amount: amt } }]);
  if (k === 'overdraft') return calls(['request', 'cash.out', { size: 's', state: 'overdraft', meta: { amount: amt } }]);
  if (k === 'fatigue') return calls(['request', 'alert.shock', { variant: 'glut', state: 'fatigue' }]);
  if (k === 'burnout') return calls(['request', 'ui.nudge', { state: 'burnout' }]);
  if (k === 'swap') return calls(['request', 'swap.done', {}]);
  if (k === 'insolvent') return [];
  if (n.audit) return calls(['request', 'audit.notice', {}]);
  if (n.alert && Number(n.alert.level) >= 1 && /effective in/.test(String(n.text))) return calls(['request', 'alert.advance', { variant: 'l' + Math.min(3, Math.max(1, Math.round(n.alert.level))) }]);
  if (n.final) return calls(['request', 'run.end', { variant: n.exit || /^Exit complete/.test(String(n.text)) ? 'done' : 'horizon' }]);
  return [];
}
/** A session event (4.2): an offer, a rewind. `tick`, `change`, `refresh` and `room` are silent. */
export function sessionCalls(type, data) {
  if (type === 'offer') return calls(['request', 'swap.offer-in', {}]);
  if (type === 'rewound') return calls(['play', 'ui.nudge', {}]);
  return [];
}
/** The shell's own `{type: 'ui', ui, ...}` events (4.2) and the Deal Room's nine lines. */
export function uiCalls(ev, st = newWireState(), hooks = {}) {
  if (!ev || ev.type !== 'ui') return [];
  const pan = (k, id) => (hooks.pan ? hooks.pan(k, id) : undefined);
  switch (ev.ui) {
    case 'open-drawer': return calls(['play', 'ui.drawer-open', { variant: ['stock', 'market', 'crew', 'bank', 'travel', 'codex', 'quests'].includes(ev.id) ? ev.id : undefined }]);
    case 'close-drawer': return calls(['play', 'ui.drawer-close', {}]);
    case 'zone': { const tier = hooks.zoneTier ? hooks.zoneTier(ev.id) : (ZONES[ev.id]?.tier || 1); return calls(['request', 'zone.enter', { variant: tier >= 3 ? 't4' : 't1', params: { t: tier }, cause: 'money' }]); }
    case 'lead': return calls(['request', ev.urgent ? 'buyer.urgent' : 'buyer.arrive', { clock: true, pan: pan('lead', ev.ids?.[0]) }]); // never reads a buyer's `scam` or a lot's truth
    case 'step': return calls(['play', 'world.step', { pan: pan('player') }]);
    case 'hover': return calls(['play', 'world.hover', { pan: pan('thing', ev.id) }]);
    case 'locked': return calls(['play', 'world.locked', { pan: pan('thing', ev.id) }]);
    case 'deal': return dealCalls(ev, st);
    default: return [];
  }
}
export function dealCalls(ev, st) {
  const tones = ['good', 'warn', 'bad', 'info'];
  switch (ev.what) {
    case 'stage': return st.quick ? [] : calls(['request', 'deal.stage-done', {}]);
    case 'quick': st.quick = true; return calls(['play', 'deal.quick', {}]);
    case 'result': st.quick = false; return calls(['request', 'deal.result', { variant: tones.includes(ev.tone) ? ev.tone : 'info', cause: 'result' }]);
    case 'suspect': { if (st.suspected.has(ev.lot)) return []; st.suspected.add(ev.lot); return calls(['request', 'read.suspect', {}]); } // once per lot, and only from the visible meter
    case 'fit': { const d = Number(ev.delta); return d >= 0.05 ? calls(['request', 'pitch.fit', { variant: 'up' }]) : d <= -0.03 ? calls(['request', 'pitch.fit', { variant: 'down' }]) : []; }
    case 'tell': return calls(['request', 'haggle.tell', { variant: ['far', 'reach', 'near'].includes(ev.tell) ? ev.tell : 'reach' }]);
    case 'rival': return calls(['request', 'bid.rival', { variant: ev.kind === 'drop' ? 'out' : 'in', pan: ev.side === 'right' ? 0.5 : ev.side === 'left' ? -0.5 : 0 }]);
    case 'hammer': return calls(['request', 'bid.hammer', { variant: ev.won ? 'won' : 'lost' }]);
    case 'count': return [['countUp', null, ev.xp]];
    default: return [];
  }
}

// ---- the control table (4.3): what a control plays at the click. A control that can refuse plays only ui.tick; its real sound comes from the outcome.
const L = (s) => s.split(/\s+/).filter(Boolean);
const SELECT = new Set(L('market-tab market-zone market-xto crew-tab crew-hkind crew-hlane crew-hchan bank-apipe bank-logf travel-tab travel-pick codex-tab codex-cat quests-ach quests-jump spec'));
const TOGGLE = new Set(L('market-want crew-pause quests-done quests-ach-all bank-ledger ac-showme'));
const CRATE = new Set(L('stock-pick stock-pickzone stock-clear market-use travel-clear'));
const SLIDER = new Set(L('crew-hamt bank-pct bank-amt'));
const DIALOG = new Set(L('help menu settings breakdown crew-hire crew-edit'));
const PRESS = new Set(L('debrief academy joinroom codex-replay ac-start ac-continue ac-why-next ac-teach-next ac-reward-next'));
const OK = new Set(L('savefile crew-fill market-send bank-csv'));
const ASK = new Set(L('reset ac-skip-yes ac-leave'));
const CLOSE = new Set(L('leave market-decline market-withdraw'));
const CAM = { zin: 'in', zout: 'out', fit: 'fit', me: 'home' };
/** One control -> what it plays at the click. c: { act, kind ('click'|'change'|'input'), checked, pressed, count, drawerOpen, value, index, id }. */
export function controlFor(c) {
  const act = c.act || '';
  if (c.kind === 'change') {
    if (act === 'speed') { const i = Math.max(0, SPEED_STEPS.indexOf(+c.value)); return ['play', 'clock', { variant: 'speed4', params: { i: Math.min(4, i) } }]; }
    if (c.checkbox) return ['play', 'ui.toggle', { variant: c.checked ? 'on' : 'off' }];
    return ['play', 'ui.select', { variant: 'i0', params: { i: Math.min(5, Math.max(0, c.index | 0)) } }];
  }
  if (act === 'dock') return c.drawerOpen ? ['play', 'ui.drawer-close', {}] : ['play', 'ui.drawer-open', { variant: c.id }];
  if (act === 'drawer-close') return ['play', 'ui.drawer-close', {}];
  if (act === 'pause') return ['play', 'clock', { variant: c.pressed ? 'resume' : 'pause' }]; // aria-pressed is the state before the press
  if (CAM[act]) return ['play', 'cam', { variant: CAM[act] }];
  if (SELECT.has(act)) return ['play', 'ui.select', { variant: 'i0', params: { i: Math.min(5, Math.max(0, c.index | 0)) } }];
  if (TOGGLE.has(act)) return ['play', 'ui.toggle', { variant: c.pressed || c.checked ? 'off' : 'on' }];
  if (CRATE.has(act)) return act.endsWith('clear') ? ['play', 'ui.crate', { variant: 'clear' }] : ['play', 'ui.crate', { variant: 'pick1', params: { n: Math.min(8, Math.max(1, (c.count | 0) + 1)) } }];
  if (SLIDER.has(act)) return ['play', 'ui.slider', { variant: 'mid', params: { v: Math.min(10, Math.max(0, c.index | 0)) } }];
  if (DIALOG.has(act)) return ['play', 'ui.dialog-open', {}];
  if (PRESS.has(act)) return ['play', 'ui.tick', { variant: 'full' }];
  if (OK.has(act)) return ['play', 'ui.ok', {}];
  if (ASK.has(act)) return ['play', 'ui.ask', { variant: 'danger' }];
  if (CLOSE.has(act)) return ['play', 'ui.dialog-close', {}];
  if (act === 'confirm-go') return null; // the confirmed action's own sound
  return ['play', 'ui.tick', { variant: c.big ? 'full' : 'light' }];
}

// ================================================================================ the DOM
const isField = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) && !(el.tagName === 'INPUT' && /^(checkbox|radio|button|submit|range)$/.test(el.type));
let installed = false, deps = null, gamesWired = 0;
const pageState = { repayF: null };
/** Is a game's wiring installed? While it is, the five legacy names of common.js are no-ops (8.4): the events speak for themselves. Before any game is wired (the title, the draft) they still play. */
export const wired = () => gamesWired > 0;
/** A test hook: pretend a game is (or is not) wired. */
export const _setInstalled = (b) => { gamesWired = b ? 1 : 0; };
/**
 * Called once from initDialog(): the page-wide layer. deps: { settings (the live object), save() (applySettings), announce(msg), toast(msg, level) }.
 */
export function initAudio(d = {}) {
  if (installed || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return; // a page without a DOM (a test's stand-in) has nothing to listen to
  installed = true; deps = d;
  const guard = (fn) => (...a) => { try { return fn(...a); } catch (e) { try { console.warn('[audio] listener disabled:', e && e.message); } catch { /* no console */ } fn = () => {}; } };
  const opts = { capture: true };
  const A = () => deps.settings?.audio || {};
  let uiState = { rangeIdx: new WeakMap(), lastDlg: false, lastTick: 0 };
  // 1. the first activating input creates or resumes the context; that same press plays its tick as soon as it can
  const unlock = guard((e) => { if (e.type === 'keydown' && (e.key === 'Escape' || /^(Shift|Control|Alt|Meta|CapsLock)$/.test(e.key))) return; audio.touch(); if (audio.state !== 'running') audio.unlock(); });
  for (const t of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(t, unlock, opts);
  // 2. visibility: hidden stops every voice and suspends; visible resumes after the shell's own tick has run
  document.addEventListener('visibilitychange', guard(() => audio.setHidden(document.hidden)));
  addEventListener('pagehide', guard((e) => { if (!e.persisted) audio.close(); }));
  // 3. key M mutes and unmutes wherever focus is not in a field, in every dialog too (the shell's own handler returns while a dialog is open)
  document.addEventListener('keydown', guard((e) => {
    if ((e.key !== 'm' && e.key !== 'M') || e.ctrlKey || e.metaKey || e.altKey || e.repeat || isField(e.target)) return;
    const a = A(); if (!deps.settings?.audio) return;
    deps.settings.audio = { ...a, mute: !a.mute, touched: true }; deps.save?.();
    deps.announce?.(deps.settings.audio.mute ? 'Sound off.' : 'Sound on.');
    if (!deps.settings.audio.mute) { audio.unlock(); audio.play('ui.ok'); }
  }), opts);
  // 4. the control table
  const info = (el, kind, e) => {
    const t = el.type, sibs = el.parentElement ? [...el.parentElement.children].filter((c) => c.tagName === el.tagName) : [];
    const range = t === 'range' ? Math.round((+el.value - +(el.min || 0)) / ((+(el.max || 100) - +(el.min || 0)) || 1) * 10) : 0;
    return { act: el.dataset.act || el.dataset.change || el.dataset.deal || el.dataset.wv || '', kind, checkbox: t === 'checkbox', checked: !!el.checked, pressed: el.getAttribute('aria-pressed') === 'true', value: el.value, index: t === 'range' ? range : sibs.indexOf(el), id: el.dataset.d || el.dataset.id, count: document.querySelectorAll('.crate.on, [data-crate].on, input[data-crate]:checked').length, drawerOpen: el.getAttribute('aria-pressed') === 'true', big: el.classList.contains('big') || (el.classList.contains('btn') && !el.classList.contains('ghost') && !el.classList.contains('sm')) };
  };
  const doCall = (c) => { if (!c) return; const [m, id, o] = c; if (m === 'play') audio.play(id, o); else if (m === 'request') audio.request(id, o); };
  document.addEventListener('click', guard((e) => {
    const el = e.target?.closest?.('button, [data-act], [data-deal], [data-wv], .btn, .ibtn, a[href], [role=button]');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('#dlg [data-snd], #s-sample')) return;
    if (el.matches('input, select, textarea') || el.closest('label')?.querySelector('input')) return; // checkboxes, ranges and selects are heard on change and input
    audio.touch();
    if (el.dataset.act === 'bank-repay') pageState.repayF = el.dataset.f; // the repay event carries only the amount: the click records which button it was
    doCall(controlFor(info(el, 'click', e)));
  }), opts);
  document.addEventListener('change', guard((e) => {
    const el = e.target; if (!el || el.matches('[data-snd], #s-preset') || el.closest('#dlg .snd')) return;
    if (el.type === 'range' || el.matches('input:not([type=checkbox]):not([type=radio]), textarea')) return; // typing is silent; a range is heard on input
    audio.touch();
    doCall(controlFor(info(el, 'change', e)));
  }), opts);
  document.addEventListener('input', guard((e) => { // a slider crossing a detent: every 10% of its travel, at most 12 a second, and the last one when the thumb is let go
    const el = e.target; if (!el || el.type !== 'range' || el.closest('.snd')) return;
    const idx = Math.round((+el.value - +(el.min || 0)) / ((+(el.max || 100) - +(el.min || 0)) || 1) * 10), last = uiState.rangeIdx.get(el);
    if (idx === last) return;
    uiState.rangeIdx.set(el, idx);
    audio.touch();
    if (audio.state === 'running' || audio.state === 'locked') audio.play('ui.slider', { variant: idx === 0 ? 'zero' : idx === 10 ? 'top' : 'mid', params: { v: idx } });
  }), opts);
  document.addEventListener('submit', guard(() => { audio.touch(); audio.play('ui.tick', { variant: 'full' }); }), opts);
  // 5. the dialog (open and close) and the toasts (the fallback sound of a toast with none of its own)
  const dlg = document.getElementById('dlg');
  if (dlg && typeof MutationObserver !== 'undefined') {
    uiState.lastDlg = !!dlg.open;
    new MutationObserver(guard(() => {
      const open = !!dlg.open, was = uiState.lastDlg; uiState.lastDlg = open;
      audio.hold(open); audio.setEnv({ busy: open });
      if (open) {
        if (dlg.classList.contains('deal')) audio.play('deal.open', { variant: 'sell', cause: 'dialog' });
        else if (dlg.classList.contains('alert')) { /* the alert note plays alert.advance */ }
        else if (dlg.querySelector('[data-act="confirm-go"]')) audio.play('ui.ask', { variant: dlg.querySelector('.btn.danger') ? 'danger' : 'normal', cause: 'dialog' });
        else audio.play('ui.dialog-open', { cause: 'dialog' });
      } else if (was) audio.play('ui.dialog-close', { cause: 'dialog' });
    })).observe(dlg, { attributes: true, attributeFilter: ['open'] });
  }
  const toasts = document.getElementById('toasts');
  if (toasts && typeof MutationObserver !== 'undefined') {
    new MutationObserver(guard((recs) => {
      for (const r of recs) for (const n of r.addedNodes) {
        if (!n.classList || !n.classList.contains('toast')) continue;
        const lvl = n.classList.contains('good') ? 'good' : n.classList.contains('warn') ? 'warn' : n.classList.contains('bad') ? 'bad' : 'info';
        if (lvl === 'good') audio.play('ui.ok', { cause: 'toast' });
        else if (lvl === 'warn') audio.play('ui.nudge', { cause: 'toast' });
        else if (lvl === 'bad' && performance.now() - audio.env.lastPress < 1500) audio.play('ui.refuse', { cause: 'toast' }); // a refusal answers something the player just did; an SLA penalty is a state, not a refusal
      }
    })).observe(toasts, { childList: true });
  }
  // the engine follows the settings
  audio.sync();
}

/**
 * Called from mountGame for each mounted game (the game screen and each Academy lesson's sandbox). ctx: the drawer context ({ on, g, S, U, world... }). Returns `unwire`.
 */
export function wireGame(ctx) {
  if (!ctx || typeof ctx.on !== 'function') return () => {};
  gamesWired++;
  const st = newWireState();
  const g = () => ctx.g?.(), S = ctx.S, U = ctx.U;
  const hooks = {
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    netWorth: () => { try { return g()?.netWorth?.() ?? 0; } catch { return 0; } },
    loansLeft: () => g()?.s?.loans?.length,
    repayF: () => pageState.repayF,
    zoneTier: (id) => ZONES[id]?.tier || 1,
    pan: (kind, id) => { try { const wv = ctx.world?.(), r = wv?.rectOf ? wv.rectOf(kind, id) : wv?.world?.rectOf?.(kind, id); if (!r) return undefined; const w = innerWidth || 1; return Math.max(-0.6, Math.min(0.6, ((r.x + r.w / 2 - w / 2) / (w / 2)) * 0.6)); } catch { return undefined; } },
  };
  let alive = true, lastAmb = 0, ambSig = '';
  const lag = () => { // how many real milliseconds of game the engine still has to replay (0 while paused)
    try { const clock = S?.clock, game = g(); if (!clock || !game || clock.paused) return 0; const sp = clock.speed || 1; return Math.max(0, (Math.floor(clock.now()) - game.s.hour) * 7000 / sp); } catch { return 0; }
  };
  const env = () => {
    const clock = S?.clock, game = g();
    audio.setEnv({ speed: clock?.speed || 1, paused: !!clock?.paused, lagMs: lag(), sandbox: !!game?.sandbox, netWorth: hooks.netWorth() });
  };
  const run = (list) => { for (const [m, id, o] of list) { if (m === 'countUp') audio.countUp(o ?? 0); else if (m === 'play') audio.play(id, o); else audio.request(id, o); } };
  const safe = (fn) => (...a) => { if (!alive) return; try { fn(...a); } catch (e) { alive = false; try { console.warn('[audio] wiring disabled:', e && e.message); } catch { /* no console */ } } };
  const pushAmbient = () => { // at most once a second, and only when something in the state changed
    const now = hooks.now(); if (now - lastAmb < 1000) return; lastAmb = now;
    const game = g(), s = game?.s; if (!s) return;
    const z = U?.zone, tier = Math.max(1, ...(s.zones || [1]).map((id) => ZONES[id]?.tier || 1));
    const state = { zone: z, theme: ZONES[z]?.theme, tier, night: ctx.world?.()?.night ?? 0, rain: !!s.env?.crunch, surge: !!s.env?.surge, tariff: !!s.env?.tariff, paused: !!S?.clock?.paused, speed: S?.clock?.speed || 1, dialog: !!ctx.dlg?.el?.open, over: !!s.over, sandbox: !!game?.sandbox };
    const sig = JSON.stringify(state); if (sig === ambSig) return; ambSig = sig;
    audio.ambient(state);
  };
  const offs = [];
  offs.push(ctx.on(safe((ev) => {
    env();
    if (ev.type === 'ui') run(uiCalls(ev, st, hooks)); else run(eventCalls(ev, st, hooks));
    pushAmbient();
  })));
  if (S && typeof S.on === 'function') {
    const off = S.on(safe((type, data) => {
      env();
      if (type === 'note') run(noteCalls(data, st, hooks));
      else if (type === 'tick') { if (lag() < 600) audio.setEnv({ justVisible: false, rewound: false }); pushAmbient(); }
      else if (type === 'rewound') { audio.setEnv({ rewound: true }); run(sessionCalls(type, data)); } else run(sessionCalls(type, data));
    }));
    if (typeof off === 'function') offs.push(off);
  }
  audio.setEnv({ sandbox: !!g()?.sandbox });
  pushAmbient();
  return function unwire() { if (!alive && gamesWired === 0) return; alive = false; gamesWired = Math.max(0, gamesWired - 1); for (const off of offs) { try { off(); } catch { /* gone */ } } audio.release(); };
}
/** The one entry point for a screen that wants both layers: the page-wide one (once) and the game's. */
export function wireAudio(ctx, d) { initAudio(d); return wireGame(ctx); }
