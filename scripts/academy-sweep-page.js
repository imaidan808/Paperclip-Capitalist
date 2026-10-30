// The half of scripts/academy-sweep.mjs that runs inside the page. It is evaluated as a script (not a module) once per page and defines window.__sw. It reads the page and puts it in states;
// it decides nothing: what counts as a fault is the pure judge in academy-sweep.mjs, which is tested without a browser. Everything here is in CSS pixels of the layout viewport.
//
//   __sw.states(api)                    the ids of the states this lesson can be put in (the drawers it can open, the Deal Rooms its setup allows, the dialogs it reaches)
//   __sw.batch(api, state, steps, vars) puts the page in `state`, then for every step and every variant measures the card and returns one snapshot each
//   api                                 what the lesson hands to pc.acProbe (js/ui/academy.js): ctx, goto(i), set(flags), paint(), target(), state(), card()
(() => {
  const CONTROLS = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="slider"], [role="switch"], [role="checkbox"], [role="radio"], [role="link"], [role="menuitem"], [role="option"], [tabindex]:not([tabindex="-1"]), label:has(input), [data-act], [data-deal]';
  const frames = (n = 2) => new Promise((ok) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : ok()); f(n); });
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const r1 = (n) => Math.round(n * 10) / 10;
  const dlgEl = () => document.getElementById('dlg');
  const modalEl = () => { const d = dlgEl(); return d && d.open ? d : null; };
  const desc = (el) => {
    if (!el || !el.tagName) return String(el);
    const t = ((el.getAttribute && el.getAttribute('aria-label')) || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28);
    const a = el.getAttribute && (el.getAttribute('data-act') || el.getAttribute('data-deal') || el.getAttribute('data-anchor'));
    const c = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + c + (a ? '[' + a + ']' : '') + (t ? ' "' + t + '"' : '');
  };
  const shownEl = (el) => { try { return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }); } catch { return !!(el.offsetWidth || el.offsetHeight); } };

  /** The part of an element that can be seen: its box cut to the window and to every ancestor that clips (overflow other than visible), stopping at a fixed box (it is not clipped by what it is not inside of). */
  function visibleBox(el) {
    const r = el.getBoundingClientRect();
    let x0 = Math.max(r.left, 0), y0 = Math.max(r.top, 0), x1 = Math.min(r.right, innerWidth), y1 = Math.min(r.bottom, innerHeight);
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (a !== el && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible')) {
        const b = a.getBoundingClientRect(), l = b.left + a.clientLeft, t = b.top + a.clientTop;
        x0 = Math.max(x0, l); y0 = Math.max(y0, t); x1 = Math.min(x1, l + a.clientWidth); y1 = Math.min(y1, t + a.clientHeight);
      }
      if (cs.position === 'fixed') break;
    }
    return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
  };
  const area = (v) => (v ? Math.max(0, v.x1 - v.x0) * Math.max(0, v.y1 - v.y0) : 0);
  const inter = (a, b) => { const x0 = Math.max(a.x0, b.x0), y0 = Math.max(a.y0, b.y0), x1 = Math.min(a.x1, b.x1), y1 = Math.min(a.y1, b.y1); return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null; };
  const rect = (v) => (v ? { x: r1(v.x0), y: r1(v.y0), w: r1(v.x1 - v.x0), h: r1(v.y1 - v.y0) } : null);
  const isOwn = (el, hit) => !!hit && (el === hit || el.contains(hit) || (el.tagName === 'INPUT' && hit.closest && hit.closest('label') && hit.closest('label').control === el) || (el.tagName === 'LABEL' && el.control && (hit === el.control || el.control.contains(hit))));
  /** A 5 by 5 grid over the visible box (inset a pixel), each point asked of the browser: who would take a tap there. */
  function probeGrid(el, v) {
    let inCard = 0, other = 0, own = 0, n = 0, first = null, centre = null;
    const w = v.x1 - v.x0, h = v.y1 - v.y0, ins = Math.min(1.5, w / 4, h / 4);
    const pts = [[0.5, 0.5]];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) pts.push([i / 4, j / 4]);
    for (const [fx, fy] of pts) {
      const x = v.x0 + ins + (w - 2 * ins) * fx, y = v.y0 + ins + (h - 2 * ins) * fy, hit = document.elementFromPoint(x, y);
      const mine = isOwn(el, hit), card = !!hit && !!hit.closest('.ac-coach');
      if (n === 0) centre = card ? 'card' : mine ? 'own' : 'other';
      n++;
      if (mine) own++; else if (card) { inCard++; first ||= desc(hit); } else other++;
    }
    return { n, inCard, other, own, centre, first };
  }

  /** What the card is, where it stands, what it says and what it offers. */
  function cardInfo() {
    const card = document.querySelector('.ac-coach');
    if (!card) return null;
    const cr = card.getBoundingClientRect(), cls = [...card.classList].filter((c) => !['ac-coach', 'lift'].includes(c));
    const folded = card.classList.contains('handle'), side = card.dataset.side || '';
    const region = { x0: cr.left, y0: cr.top, x1: cr.right, y1: cr.bottom }, regions = [region];
    if (!folded && ['below', 'above', 'right', 'left'].includes(side)) { // the caret: a 12px square turned 45 degrees on the edge the card faces its target from, 17px across
      const num = (k) => parseFloat(card.style.getPropertyValue(k)) || 0, rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16, c = 8.5;
      if (side === 'below' || side === 'above') { const cx = cr.left + Math.min(Math.max(num('--ac-ax'), 1.1 * rem), cr.width - 1.5 * rem), y = side === 'below' ? cr.top : cr.bottom; regions.push({ x0: cx - c, y0: side === 'below' ? y - 10.5 : y, x1: cx + c, y1: side === 'below' ? y : y + 10.5 }); }
      else { const cy = cr.top + Math.min(Math.max(num('--ac-ay'), 1.1 * rem), cr.height - 1.5 * rem), x = side === 'right' ? cr.left : cr.right; regions.push({ x0: side === 'right' ? x - 10.5 : x, y0: cy - c, x1: side === 'right' ? x : x + 10.5, y1: cy + c }); }
    }
    const text = (sel) => {
      const e = card.querySelector(sel);
      if (!e) return null;
      const on = shownEl(e), r = e.getBoundingClientRect(), v = on ? visibleBox(e) : null, full = r.width * r.height;
      return { on, w: r1(r.width), h: r1(r.height), frac: full > 0 && v ? Math.min(1, area(v) / full) : 0, rect: v ? rect(v) : null, text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) };
    };
    const buttons = [...card.querySelectorAll('button')].map((b) => {
      const on = shownEl(b), r = b.getBoundingClientRect(), v = on ? visibleBox(b) : null, full = r.width * r.height;
      const g = v ? probeGrid(b, v) : null;
      return { act: b.dataset.act || '', text: b.textContent.trim().slice(0, 24), label: b.getAttribute('aria-label') || '', on, w: r1(r.width), h: r1(r.height), frac: full > 0 && v ? Math.min(1, area(v) / full) : 0, rect: v ? rect(v) : null, hit: g ? (g.own === g.n ? 'self' : g.inCard === g.n - g.own ? 'card' : 'other:' + g.other) : 'none', hitFrac: g ? g.own / g.n : 0 };
    });
    const toasts = [];
    for (const t of modalEl() ? [] : document.querySelectorAll('#toasts .toast')) { // a window is in the browser's top layer: a toast stands under it
      const cs = getComputedStyle(t), v = visibleBox(t);
      if (!v || +cs.opacity < 0.05 || t.classList.contains('ac-under')) continue;
      for (const sel of ['.ac-say', '.ac-hint', '.ac-btns']) { const e = card.querySelector(sel); const ev = e && shownEl(e) ? visibleBox(e) : null; const o = ev && inter(v, ev); if (o && area(o) > 4) toasts.push({ over: sel, area: Math.round(area(o)), bad: t.classList.contains('bad') }); }
    }
    return { card: { x: r1(cr.left), y: r1(cr.top), w: r1(cr.width), h: r1(cr.height) }, regions, cls: cls.join(' ') || 'full', folded, side, host: card.closest('dialog') ? 'dlg' : 'page',
      eyebrow: (card.querySelector('.ac-eyebrow') || {}).textContent || '', say: text('.ac-say'), hint: text('.ac-hint'), where: text('.ac-where'), grab: text('.ac-grab'), buttons, toasts, stranded: card.classList.contains('stranded') };
  }

  /** Every control a tap can be aimed at, cut to what can be seen, that the card covers by any amount (its box or a sampled tap); the rest are only counted. */
  function coverage(info) {
    const modal = modalEl(), root = modal || document, out = [];
    let total = 0;
    for (const el of root.querySelectorAll(CONTROLS)) {
      if (el.closest('.ac-layer, .ac-coach, #toasts, .ac-ring') || el.closest('[inert]') || el.matches(':disabled') || el.tagName === 'CANVAS' || el.classList.contains('worldcv')) continue;
      if (!modal && el.closest('dialog')) continue;
      if (!shownEl(el)) continue;
      const v = visibleBox(el);
      if (!v || v.x1 - v.x0 < 3 || v.y1 - v.y0 < 3) continue;
      total++;
      let o = null, a = 0;
      for (const rg of info.regions) { const x = inter(v, rg), xa = x ? area(x) : 0; if (xa > a) { o = x; a = xa; } }
      if (!a) { // nothing of the box is under the card: a tap cannot land on it either, so no point is asked of the page
        continue;
      }
      const g = probeGrid(el, v), vis = area(v);
      out.push({ what: desc(el), kind: el.closest('.hud') ? 'hud' : el.closest('.dock') ? 'dock' : el.closest('.drawer') ? (el.closest('.dh') ? 'drawer-head' : 'drawer') : el.closest('.trackerhost') ? 'tracker' : el.closest('.tickerhost') ? 'ticker' : el.closest('.wvctl, .wvlist') ? 'camera' : el.closest('dialog') ? 'dialog' : 'other',
        rect: rect(v), overlapW: r1(o.x1 - o.x0), overlapH: r1(o.y1 - o.y0), cover: Math.round((a / vis) * 1000) / 10, tapsInCard: g.inCard, taps: g.n, centre: g.centre });
    }
    return { total, hit: out };
  }

  /** One measurement of the card as it stands now. `extra` is what the caller wants written beside it (state, step, variant). */
  function measure(api, extra = {}) {
    const info = cardInfo(), t = api.target(), st = api.state();
    const view = { w: innerWidth, h: innerHeight }, coarse = matchMedia('(pointer: coarse)').matches;
    if (!info) return { ...extra, view, coarse, none: true };
    const cov = coverage(info);
    const d = modalEl();
    // the step's thing as far as it can be seen: a manager's card in the hire dialog is taller than the dialog's window, and the part of it under the strip is not there to be pressed
    let tr = t.rect ? { x: t.rect.x, y: t.rect.y, w: t.rect.w, h: t.rect.h } : null;
    if (tr && t.via === 'dom' && /^[a-z][a-z0-9-]*$/.test(t.anchor || '')) {
      const el = [...document.querySelectorAll(`[data-anchor="${t.anchor}"]`)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }), v = el && visibleBox(el);
      tr = v ? { x: v.x0, y: v.y0, w: v.x1 - v.x0, h: v.y1 - v.y0 } : null;
    }
    return { ...extra, view, coarse, probe: st, modal: d ? (d.classList.contains('deal') ? 'deal' : d.querySelector('[data-anchor^="hire-"]') ? 'hire' : 'dialog') : null, drawer: api.ctx.U.drawer || null, size: document.documentElement.dataset.size || '',
      card: { ...info, regions: undefined, rect: info.card }, controls: cov.hit, nControls: cov.total, target: tr ? { via: t.via, rect: { x: r1(tr.x), y: r1(tr.y), w: r1(tr.w), h: r1(tr.h) }, anchor: t.anchor } : { via: null, rect: null, anchor: t.anchor } };
  }

  // ---- states
  const DEAL_STEPS = { sell: ['pitch', 'close'], buy: ['read', 'close|bid'], repair: ['fix'] };
  function dealSpec(api, kind) {
    const g = api.ctx.g(), s = g.s, leads = Object.values(s.leads).flat(), lots = Object.entries(s.lots).flatMap(([z, ls]) => ls.map((l) => ({ ...l, zone: +z })));
    if (kind === 'sell') { for (const a of s.assets) for (const l of leads) return { kind: 'sell', assetId: a.id, leadId: l.id }; }
    if (kind === 'buy') { const l = lots[0]; return l ? { kind: 'buy', zone: l.zone, lotId: l.id } : null; }
    if (kind === 'repair') { const a = s.assets.find((x) => x.cond === 'broken'); return a ? { kind: 'repair', assetId: a.id } : null; }
    return null;
  }
  function states(api) {
    const U = api.ctx.U, ids = ['plain'];
    const feats = U.features || ['stock', 'market', 'codex', 'quests'];
    for (const d of feats) { ids.push('drawer:' + d, 'drawer:' + d + ':end'); }
    for (const kind of ['sell', 'buy', 'repair']) {
      const spec = dealSpec(api, kind);
      if (!spec) continue;
      const names = kind === 'sell' ? ['pitch', 'pitch-done', 'close', 'close-done', 'result'] : kind === 'buy' ? ['read', 'read-done', 'next', 'next-done', 'result'] : ['fix', 'fix-done', 'result'];
      for (const n of names) ids.push('deal:' + kind + ':' + n);
    }
    if (feats.includes('crew')) ids.push('hire', 'hire:picked');
    ids.push('cash', 'menu', 'alert');
    return ids;
  }
  const DESTRUCTIVE = (id) => /^deal:\w+:result$/.test(id);

  async function reset(api) {
    const { ctx } = api, U = ctx.U;
    try { api._ses?.dispose?.(); } catch { /* gone */ }
    api._ses = null;
    const d = dlgEl(); if (d && d.open) d.close();
    document.querySelectorAll('#toasts .toast').forEach((t) => t.remove());
    document.documentElement.dataset.size = 'm';
    api.set({ hint: false, confirm: false, stranded: null, showMe: false, open: false });
    if (U.drawer) { U.drawer = null; ctx.render(); }
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur?.();
    await frames(3);
  }

  /** Puts the page in a state. Returns false when the lesson cannot be in it (no such Deal Room, a drawer that does not scroll). */
  async function setState(api, id) {
    const { ctx } = api, U = ctx.U;
    await reset(api);
    const [kind, a, b] = id.split(':');
    if (id === 'plain') { /* the game screen alone */ }
    else if (kind === 'drawer') {
      ctx.openDrawer(a); await frames(3);
      if (b === 'end') { const db = ctx.el.drawer.querySelector('.db'); if (!db || db.scrollHeight <= db.clientHeight + 2) return false; db.scrollTop = db.scrollHeight; await frames(2); }
    } else if (kind === 'deal') {
      const spec = dealSpec(api, a);
      if (!spec) return false;
      const ses = ctx.deal(spec);
      if (!ses || ses.ok === false || !ses.run) return false;
      api._ses = ses; await frames(3);
      const n = b, acts = ses.acts, run = ses.run, bump = async () => { acts.next?.(); await frames(3); };
      if (n === 'pitch' || n === 'read' || n === 'fix') { /* the first stage, fresh */ }
      else if (n === 'pitch-done' || n === 'read-done' || n === 'fix-done') { acts['quick-stage'](); await frames(3); }
      else if (n === 'close' || n === 'next') { if (run.stages.length < 2) return false; acts['quick-stage'](); await frames(2); await bump(); }
      else if (n === 'close-done' || n === 'next-done') { if (run.stages.length < 2) return false; acts['quick-stage'](); await frames(2); await bump(); acts['quick-stage'](); await frames(3); }
      else if (n === 'result') { acts['quick-all'](); await frames(4); }
    } else if (id === 'hire' || id === 'hire:picked') {
      ctx.openDrawer('crew'); await frames(3);
      const hb = ctx.el.drawer.querySelector('[data-act="crew-hire"]');
      if (!hb) return false;
      hb.click(); await frames(3);
      if (!dlgEl().open) return false;
      if (b === 'picked' || a === 'picked') { const m = dlgEl().querySelector('[data-anchor="hire-student"], [data-anchor^="hire-"]:not([data-anchor="hire-go"])'); m?.click(); await frames(3); }
    } else if (id === 'cash') {
      const c = document.querySelector('[data-anchor="hud-cash"]'); if (!c) return false; c.click(); await frames(3); if (!dlgEl().open) return false;
    } else if (id === 'menu') {
      const m = document.querySelector('[data-act="menu"]'); if (!m) return false; m.click(); await frames(3); if (!dlgEl().open) return false;
    } else if (id === 'alert') {
      ctx.dlg.open('<h2 tabindex="-1" autofocus>Market shock</h2><p>A glut of sneakers hit the market. Prices fell by a fifth for a day.</p><div class="row gap"><button class="btn" data-close>OK</button></div>', { cls: 'alert', label: 'Alert' }); await frames(3);
    } else return false;
    return true;
  }

  // ---- variants
  const TOAST_LINES = [['Liability added: a $400 loan at 8% a day.', 'good'], ['Drew $600 from the line of credit.', 'info']];
  async function applyVariant(api, v) {
    const { ctx } = api;
    document.documentElement.dataset.size = v === 'xl' ? 'xl' : 'm';
    document.querySelectorAll('#toasts .toast').forEach((t) => t.remove());
    if (v === 'hint' || v === 'toast' || v === 'xl') api.set({ hint: true });
    if (v === 'confirm') api.set({ confirm: true });
    if (v === 'stranded') api.set({ stranded: { say: 'That sale closed the lesson early.', hint: 'Nothing in a lesson touches your real run. Press Restart to set the scene up again.' } });
    if (v === 'toast') for (const [m, l] of TOAST_LINES) ctx.toast(m, l, 60000);
    if (v === 'xl') ctx.render();
  }

  /** The whole of one state: every step, every variant. A card that is folded is also opened (the tab's tap) and measured open. */
  async function batch(api, id, steps, variants, opts = {}) {
    const ok = await setState(api, id);
    if (!ok) return { id, skipped: true, cells: [] };
    const settle = async (n) => { if (opts.frames) await frames(n); else { api.ctx.render(); api.ctx.relayout(); void document.body.offsetHeight; } }; // without `frames` the page is made to lay out at once (the game's own pieces are measured by hand) instead of waiting for the next frame
    await settle(2);
    const cells = [];
    for (const i of steps) {
      for (const v of variants) {
        api.goto(i);
        await applyVariant(api, v);
        await settle(opts.frames || 2);
        api.paint(true); await settle(1); api.paint(); // placed once at the settled layout, then looked at again as the beat does
        if (opts.frames > 2) await frames(opts.frames - 2);
        const base = { state: id, step: i, variant: v };
        const m = measure(api, base);
        cells.push(m);
        if (m.card && m.card.folded) {
          api.set({ open: true }); api.paint(true); await settle(1);
          cells.push(measure(api, { ...base, variant: v + '+open' }));
          api.set({ open: false }); api.paint(true); await settle(1);
        }
      }
    }
    if (!opts.keep) await reset(api); // `keep`: the state is left as it is, for a picture
    return { id, skipped: false, cells };
  }

  window.__sw = { states, batch, setState, reset, measure, frames, wait, DESTRUCTIVE: DESTRUCTIVE.toString(), cardInfo };
})();
