// The DOM around the 2.5D canvas: camera buttons, tooltip and the keyboard/screen-reader list of everything in view.
// Clicks on the world open the same Deal Room and drawers as the dock does (through ctx), so there is exactly one rulebook.
import { World } from '../world/world.js';
import { ZONES, ASSETS, BUYERS, PIPE } from '../config.js';
import { fmtMoney as money, fitLabel } from '../market.js';
import { esc, toast } from './common.js';

export function createWorldView(ctx) {
  const { S, U } = ctx;
  let world = null, host = null, lastZone = null, booted = false;
  const g = () => S.game;
  const unlocked = (z) => g().s.zones.includes(z);
  const gate = (z) => `${ZONES[z].name} opens at ${money(ZONES[z].gate)} net worth.`;
  const pickIn = (zone) => g().s.assets.find((a) => U.sel.has(a.id) && a.zone === zone);

  function describe(h) {
    const game = g(), s = game.s;
    if (h.kind === 'lead') {
      const l = h.lead, B = BUYERS[l.seg], sel = pickIn(h.zone);
      let q = '';
      if (sel) { const r = game.quotePitch(sel.id, l.id); q = r.ok ? (r.rejected ? ` They would reject your ${ASSETS[sel.cls].name}.` : ` Pitching your ${ASSETS[sel.cls].name}: ${fitLabel(r.fit)}, about ${money(r.received)}.`) : ' ' + r.msg; }
      return `${B.name}${l.need ? ` (urgent: needs ${/^[aeiou]/.test(l.need) ? 'an' : 'a'} ${l.need})` : ''}. Pays up to ${money(l.budget)}, leaves in ${Math.max(0, l.exp - s.hour)} h.${q || ' Click to sell them something.'}`;
    }
    if (h.kind === 'lot') return `${ASSETS[h.lot.cls].name}${h.lot.cond === 'broken' ? ' (broken)' : ''}${h.lot.mode === 'auction' ? ' (auction)' : ''}, listed at ${money(h.lot.price)}. Click to look it over and buy.`;
    if (h.kind === 'asset') return `${ASSETS[h.asset.cls].name}${h.asset.cond === 'broken' ? ' (broken)' : ''}, worth ${money(game.val(h.asset))}. Click to open your stock.`;
    if (h.kind === 'pipe') { const f = game.forecast(h.pipe); return `${PIPE[h.pipe.kind].name}, level ${h.pipe.level}, ${h.pipe.status}. ${money(f.net)} per cycle. Click to manage.`; }
    if (h.kind === 'plot') return h.locked ? 'Building plot. ' + (game.autoLocked() ? 'Resolve your audit to expand.' : 'Not open yet.') : 'Empty plot. Click to hire a manager and put idle cash to work.';
    if (h.kind === 'zone') return unlocked(h.id) ? `${ZONES[h.id].name}. Click to go there.` : `${ZONES[h.id].name} is locked. ${gate(h.id)}`;
    if (h.kind === 'static') {
      const id = h.id;
      if (id === 'bank') return s.mil.m1 ? 'Commercial Bank: loans and your debt-to-equity ratio. Click to open.' : 'The Commercial Bank opens in Metro Hub.';
      if (id === 'audit') return s.mil.m2 ? 'Regulatory office. ' + (s.auditPending ? 'An audit is waiting. Click to respond.' : 'No audit pending.') : 'Audits begin in Industrial Park.';
      if (id === 'ipo') return 'M&A and IPO tower. Click to open.';
      if (id.startsWith('hq')) return 'Your headquarters: skills, quests and the Codex. Click to open.';
      if (id.startsWith('depot')) return 'Freight depot. Click to ship crates to another district.';
      if (id.startsWith('board')) return 'Market board: everything for sale and everyone buying here.';
    }
    return h.label || '';
  }

  function activate(h, ev, ground) {
    const game = g(), s = game.s;
    if (!h) { if (ground && unlocked(U.zone)) world.walkPlayerTo(ground.gx, ground.gy); return; }
    if (h.kind === 'zone') { if (!unlocked(h.id)) { toast(gate(h.id), 'warn'); return; } U.zone = h.id; ctx.render(); return; }
    if (h.zone && h.zone > 0 && !unlocked(h.zone)) { toast(`${ZONES[h.zone].name} is locked. ${gate(h.zone)}`, 'warn'); return; }
    if (h.zone && h.zone > 0 && h.zone !== U.zone) U.zone = h.zone;
    if (h.kind === 'lead') {
      const here = s.assets.filter((a) => a.zone === h.zone);
      let sel = pickIn(h.zone);
      if (!sel) {
        if (here.length === 1) { U.sel.add(here[0].id); sel = here[0]; }
        else { toast(here.length ? 'Pick one of your crates first, then click the buyer.' : 'You have nothing to sell here. Buy a lot from a booth first.', 'warn'); ctx.openDrawer('stock'); return; }
      }
      ctx.deal({ kind: 'sell', assetId: sel.id, leadId: h.id }); return;
    }
    if (h.kind === 'lot') { ctx.deal({ kind: 'buy', zone: h.zone, lotId: h.id }); return; }
    if (h.kind === 'asset') { U.sel.has(h.id) ? U.sel.delete(h.id) : U.sel.add(h.id); ctx.openDrawer('stock'); return; }
    if (h.kind === 'pipe') { U.focusPipe = h.id; ctx.openDrawer('crew'); return; }
    if (h.kind === 'plot') { if (h.locked) { toast(game.autoLocked() ? 'Resolve your Regulatory Audit before expanding.' : 'Not open yet.', 'warn'); return; } U.hireAt = h.zone; ctx.openDrawer('crew'); return; }
    if (h.kind === 'truck') { toast('That freight run is on its way.', 'info'); return; }
    if (h.kind === 'static') {
      const id = h.id;
      if (id === 'bank' || id === 'audit' || id === 'ipo') { if (id === 'bank' && !s.mil.m1) { toast('The Commercial Bank opens in Metro Hub.', 'warn'); return; } if (id === 'audit' && !s.mil.m2) { toast('Audits begin in Industrial Park.', 'warn'); return; } ctx.openDrawer(id === 'ipo' ? 'crew' : 'bank'); return; }
      if (id.startsWith('hq')) { ctx.openDrawer('quests'); return; }
      if (id.startsWith('depot')) { ctx.openDrawer('travel'); return; }
      if (id.startsWith('board')) { ctx.openDrawer('market'); return; }
    }
  }

  const tip = () => host?.querySelector('.wvtip');
  function hover(h, ev) {
    const t = tip(); if (!t) return;
    if (!h) { t.hidden = true; return; }
    t.textContent = describe(h);
    t.hidden = false;
    const r = world.cv.getBoundingClientRect(), x = (ev?.clientX ?? r.left) - r.left, y = (ev?.clientY ?? r.top) - r.top;
    t.style.left = Math.min(x + 14, r.width - 260) + 'px'; t.style.top = Math.max(6, Math.min(y + 14, r.height - 80)) + 'px';
  }

  function list() {
    const z = U.zone, items = world.hotspots().filter((h) => !h.zone || h.zone === z);
    const ul = host.querySelector('.wvul');
    const sig = z + '|' + items.map((h) => h.kind + h.id + h.label).join(',');
    if (ul.dataset.sig === sig) return;
    ul.dataset.sig = sig;
    const had = ul.contains(document.activeElement) ? document.activeElement.dataset.hs : null;
    ul.innerHTML = items.length ? items.map((h) => `<li><button class="btn sm ghost" data-hs="${esc(`${h.kind}|${h.id}|${h.zone || ''}`)}">${esc(h.label)}</button></li>`).join('') : '<li class="mute small">Nothing here yet.</li>';
    if (had) (ul.querySelector(`[data-hs="${CSS.escape(had)}"]`) || ul.closest('details').querySelector('summary')).focus({ preventScroll: true });
  }
  /** The list view carries ids only; rebuild the full hit object the click handler expects. */
  function withData(h) {
    const s = g().s;
    if (h.kind === 'lead') return { ...h, lead: (s.leads[h.zone] || []).find((x) => x.id === h.id) };
    if (h.kind === 'lot') return { ...h, lot: (s.lots[h.zone] || []).find((x) => x.id === h.id) };
    if (h.kind === 'asset') return { ...h, asset: s.assets.find((x) => x.id === h.id) };
    if (h.kind === 'pipe') return { ...h, pipe: s.pipes.find((x) => x.id === h.id) };
    if (h.kind === 'plot') return { ...h, locked: false };
    return h;
  }

  return {
    get world() { return world; },
    mount(el) {
      host = el;
      el.innerHTML = `<div class="wvcv"></div>
        <div class="wvctl" role="group" aria-label="Camera"><button class="ibtn" data-wv="zin" aria-label="Zoom in">+</button><button class="ibtn" data-wv="zout" aria-label="Zoom out">−</button><button class="ibtn" data-wv="fit" aria-label="Show the whole island">◎</button><button class="ibtn" data-wv="me" aria-label="Back to my district">⌂</button></div>
        <div class="wvtip" hidden></div>
        <details class="wvlist"><summary>List of everything in this district (for keyboard and screen readers)</summary><ul class="wvul"></ul></details>`;
      world = new World({ session: S, ui: U, activate, hover });
      if (window.pc) window.pc.world = world;
      world.attach(el.querySelector('.wvcv'));
      world.setMode?.('world');
      world.sync();
      world.placePlayer?.();
      world.focusZone(U.zone, false);
      lastZone = U.zone;
      el.onclick = (e) => {
        const b = e.target.closest('[data-wv],[data-hs]'); if (!b) return;
        if (b.dataset.hs) { const [kind, id] = b.dataset.hs.split('|'); const h = world.hotspots().find((x) => x.kind === kind && String(x.id) === id); if (h) activate(withData(h), null, null); return; }
        const a = b.dataset.wv;
        if (a === 'zin') world.zoomBy(1.25); else if (a === 'zout') world.zoomBy(0.8); else if (a === 'fit') world.fit(); else if (a === 'me') world.focusZone(U.zone, true);
      };
      this.update();
    },
    update() {
      if (!world || !host) return;
      world.sync();
      if (U.zone !== lastZone) { lastZone = U.zone; world.focusZone(U.zone, true); }
      list();
    },
    destroy() { world?.stop(); world?.detach?.(); host = null; world = null; },
  };
}
