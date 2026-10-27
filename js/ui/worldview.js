// The DOM around the 2.5D canvas: toolbar, zoom controls, tooltip, action HUD and the keyboard/screen-reader list of every object.
// Clicks on the world call the same actions as the rest of the dashboard (via call), so there is exactly one rulebook.
import { World } from '../world/world.js';
import { ZONES, ASSETS, BUYERS, PIPE, PIPE_RULES } from '../config.js';
import { fmtMoney as money, fitLabel } from '../market.js';
import { esc, toast, announce } from './common.js';

const STATIC_TAB = { bank: 'bank', audit: 'audit', ipo: 'clients' };

export function createWorldView({ S, U, call, setTab, render }) {
  let world = null, host = null, mode = 'world', lastZone = null, listSig = '', hudSig = '', booted = false;
  const g = () => S.game;
  const unlocked = (z) => g().s.zones.includes(z);

  const gate = (z) => (z === 2 ? 'Zone 2 opens at $1,000 net worth (Gate 1).' : 'Zone 3 opens at $250,000 net worth (Gate 3).');
  function describe(h) {
    const game = g(), s = game.s;
    if (h.kind === 'lead') {
      const l = h.lead, B = BUYERS[l.seg], sel = [...U.sel].map((id) => s.assets.find((a) => a.id === id)).find((a) => a && a.zone === h.zone);
      let q = '';
      if (sel) { const r = game.quotePitch(sel.id, l.id); q = r.ok ? (r.rejected ? ' They would reject your ' + ASSETS[sel.cls].name + '.' : ` Pitching your ${ASSETS[sel.cls].name}: ${fitLabel(r.fit)}, ${r.ci.band.label} ${r.ci.cm.toFixed(2)}x, you would get ${money(r.received)}.`) : ' ' + r.msg; }
      return `${B.name}${l.need ? ` (urgent: needs ${/^[aeiou]/.test(l.need) ? 'an' : 'a'} ${l.need})` : ''}. Pays up to ${money(l.budget)}, leaves in ${Math.max(0, l.exp - s.hour)} h.${q || ' Select a crate, then click to pitch.'}`;
    }
    if (h.kind === 'lot') return `${ASSETS[h.lot.cls].name}${h.lot.cond === 'broken' ? ' (broken)' : ''} for ${money(h.lot.price)}. Click to buy.`;
    if (h.kind === 'asset') return `${ASSETS[h.asset.cls].name}${h.asset.cond === 'broken' ? ' (broken)' : ''}, worth ${money(game.val(h.asset))}. Click to ${U.sel.has(h.asset.id) ? 'deselect' : 'select'}.`;
    if (h.kind === 'pipe') { const f = game.forecast(h.pipe); return `${PIPE[h.pipe.kind].name}, level ${h.pipe.level}, ${h.pipe.status}. ${money(f.net)} per cycle. Click to edit its lane.`; }
    if (h.kind === 'plot') return h.locked ? 'Building plot. ' + (game.autoLocked() ? 'Resolve your audit to expand.' : gate(2)) : 'Empty plot. Click to hire a manager and put idle cash to work.';
    if (h.kind === 'zone') return unlocked(h.id) ? `${ZONES[h.id].name}. Click to go there.` : `${ZONES[h.id].name} is locked. ${gate(h.id)}`;
    if (h.kind === 'static') {
      const id = h.id;
      if (id === 'bank') return s.mil.m1 ? 'Commercial Bank: loans, interest and your debt-to-equity ratio. Click to open.' : 'The Commercial Bank opens at $1,000 net worth.';
      if (id === 'audit') return s.mil.m2 ? 'Regulatory office. ' + (s.auditPending ? 'An audit is waiting for you. Click to respond.' : 'No audit pending.') : 'Audits begin at $25,000 net worth.';
      if (id === 'ipo') return 'M&A and IPO tower, plus your enterprise clients. Click to open.';
      if (id.startsWith('hq')) return 'Training office: raise your Ops, Growth and Capital Sourcing skills. Click to open.';
      if (id.startsWith('depot')) return 'Freight depot. Select crates, then click here to ship them to another zone.';
      if (id.startsWith('board')) return 'Market board: open the Trade tab for this zone.';
    }
    if (h.kind === 'truck') return h.label + '. It arrives soon.';
    return h.label || '';
  }

  function activate(h, ev, ground) {
    const game = g(), s = game.s;
    if (!h) { if (ground && mode === 'world' && unlocked(U.zone)) world.walkPlayerTo(ground.gx, ground.gy); return; }
    if (h.kind === 'zone') { if (!unlocked(h.id)) { toast(gate(h.id), 'warn'); return; } U.zone = h.id; setTab('world'); render(); return; }
    if (h.zone && h.zone > 0 && !unlocked(h.zone)) { toast(`${ZONES[h.zone].name} is locked. ${gate(h.zone)}`, 'warn'); return; }
    if (h.zone && h.zone > 0 && h.zone !== U.zone) { U.zone = h.zone; }
    if (h.kind === 'lead') {
      const here = s.assets.filter((a) => a.zone === h.zone);
      if (![...U.sel].some((id) => here.some((a) => a.id === id))) {
        if (here.length === 1) { U.sel.clear(); U.sel.add(here[0].id); }
        else { toast(here.length ? 'Click one of your crates first, then the buyer.' : 'You have no stock here. Buy a pallet from the auction row first.', 'warn'); return; }
      }
      call('pitch', { lead: h.id }); return;
    }
    if (h.kind === 'lot') { const r = call('buy', { lot: h.id }); return; }
    if (h.kind === 'asset') { call('sel', { id: h.id }); return; }
    if (h.kind === 'pipe') { call('pedit', { id: h.id }); return; }
    if (h.kind === 'plot') { if (h.locked) { toast(game.autoLocked() ? 'Gate 2: resolve your Regulatory Audit before expanding.' : gate(h.zone), 'warn'); return; } call('hire', {}); return; }
    if (h.kind === 'truck') { toast('That freight run is on its way.', 'info'); return; }
    if (h.kind === 'static') {
      const id = h.id;
      if (id === 'bank') { if (!s.mil.m1) { toast('The Commercial Bank opens at $1,000 net worth.', 'warn'); return; } setTab('bank'); return; }
      if (id === 'audit') { if (!s.mil.m2) { toast('Audits begin at $25,000 net worth.', 'warn'); return; } setTab('audit'); return; }
      if (id === 'ipo') { setTab('clients'); return; }
      if (id.startsWith('hq')) { setTab('skills'); return; }
      if (id.startsWith('depot')) { if ([...U.sel].some((i) => s.assets.some((a) => a.id === i && a.zone === h.zone))) call('ship', {}); else toast('Click your crates to select them, then click the depot to ship.', 'info'); return; }
      if (id.startsWith('board')) { setTab('trade'); return; }
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

  function shell() {
    const m = mode;
    host.innerHTML = `<div class="wv">
      <div class="wvbar"><div class="row" role="group" aria-label="Zone">${[1, 2, 3].map((z) => `<button class="btn sm ghost" data-wz="${z}" aria-pressed="false">${ZONES[z].short}</button>`).join('')}</div>
        <span class="grow"></span>
        <div class="row" role="group" aria-label="View"><button class="btn sm ghost" data-wv="world" aria-pressed="${m === 'world'}">World</button><button class="btn sm ghost" data-wv="map" aria-pressed="${m === 'map'}">Island map</button></div></div>
      <div class="wvstage"><div class="wvcv"></div>
        <div class="wvctl" role="group" aria-label="Camera"><button class="btn sm" data-wv="zin" aria-label="Zoom in">+</button><button class="btn sm" data-wv="zout" aria-label="Zoom out">&minus;</button><button class="btn sm ghost" data-wv="fit">Fit</button><button class="btn sm ghost" data-wv="me">Me</button></div>
        <div class="wvminiwrap"></div><div class="wvtip" hidden></div><div class="wvhint">Drag to look around. Ctrl and scroll to zoom.</div></div>
      <div class="wvhud" role="region" aria-label="What you can do here"></div>
      <details class="wvlist"><summary>List view of this zone, for keyboard and screen reader use</summary><ul class="wvul"></ul></details></div>`;
    world.attach(host.querySelector('.wvcv'));
    host.querySelector('.wvminiwrap').append(world.mini);
    host.onclick = (e) => {
      const b = e.target.closest('[data-wv],[data-wz],[data-hs]'); if (!b) return;
      if (b.dataset.wz) { const z = +b.dataset.wz; if (!unlocked(z)) toast(gate(z), 'warn'); U.zone = z; render(); world.focusZone(z, true); }
      else if (b.dataset.hs) { const [kind, id, zone] = b.dataset.hs.split('|'); const h = world.hotspots().find((x) => x.kind === kind && String(x.id) === id); if (h) activate(withData(h), null, null); }
      else { const a = b.dataset.wv; if (a === 'world' || a === 'map') setTab(a); else if (a === 'zin') world.zoomBy(1.25); else if (a === 'zout') world.zoomBy(0.8); else if (a === 'fit') world.fit(); else if (a === 'me') world.focusZone(U.zone, true); }
    };
  }
  /** The list view carries ids only; rebuild the full hit object the click handler expects. */
  function withData(h) {
    const s = g().s;
    if (h.kind === 'lead') { const l = s.leads[h.zone].find((x) => x.id === h.id); return { ...h, lead: l }; }
    if (h.kind === 'lot') return { ...h, lot: s.lots[h.zone].find((x) => x.id === h.id) };
    if (h.kind === 'asset') return { ...h, asset: s.assets.find((x) => x.id === h.id) };
    if (h.kind === 'pipe') return { ...h, pipe: s.pipes.find((x) => x.id === h.id) };
    if (h.kind === 'plot') return { ...h, locked: false };
    return h;
  }

  function hud() {
    const game = g(), s = game.s, z = U.zone, Z = ZONES[z], open = unlocked(z);
    const sel = [...U.sel].map((id) => s.assets.find((a) => a.id === id)).filter(Boolean);
    const here = s.assets.filter((a) => a.zone === z).length;
    if (mode === 'map') return `<div class="row"><b>Island map</b><span class="chip">${s.zones.length} of 3 districts open</span></div><p class="small mute">The whole economy at a glance. Click a district label to go there. Corporate Valley sits on the highest plateau: reach $250,000 net worth to open it. Freight trucks show crates in transit; rain means a credit crunch.</p>`;
    let html = `<div class="row"><b>${esc(Z.name)}</b><span class="chip">tax ${(game.zoneTax(z) * 100).toFixed(1)}%</span><span class="chip">${(s.leads[z] || []).length} buyers</span><span class="chip">${here} crate${here === 1 ? '' : 's'}</span><span class="chip">pool ${money(s.pool[z])}</span>${S.clock.paused ? '<span class="chip warn">paused</span>' : ''}</div>`;
    if (!open) html += `<p class="small mute">${esc(gate(z))} You can look around, but nothing here is open to you yet.</p>`;
    else if (sel.length) {
      const pq = game.poolQuote(sel.map((a) => a.id));
      html += `<div class="row gap"><span class="small">Selected: ${sel.map((a) => `<span aria-hidden="true">${ASSETS[a.cls].icon}</span> ${esc(ASSETS[a.cls].name)}${a.cond === 'broken' ? ' (broken)' : ''} ${money(game.val(a))}`).join(', ')}</span></div>
        <div class="row gap"><span class="small mute">Click a buyer to pitch, or:</span><button class="btn sm" data-act="pool" ${pq.ok ? '' : 'aria-disabled="true"'}>Sell to pool${pq.ok ? ' ' + money(pq.total) : ''}</button>${sel.length === 1 && sel[0].cond === 'broken' ? '<button class="btn sm ghost" data-act="repair">Repair</button>' : ''}<button class="btn sm ghost" data-act="ship">Ship</button><button class="btn sm ghost" data-act="offer">Offer to a classmate</button><button class="btn sm ghost" data-act="clearsel">Clear</button></div>`;
    } else html += `<p class="small mute">${here ? 'Click one of your crates to select it, then click a buyer to pitch.' : 'You have no stock here. Click a pallet on the auction row to buy one.'} Click a building to open it. Gold <b>!</b> bubbles are urgent buyers.</p>`;
    return html;
  }

  function list() {
    const z = U.zone, items = world.hotspots().filter((h) => !h.zone || h.zone === z);
    const sig = z + '|' + items.map((h) => h.kind + h.id + h.label).join('~');
    if (sig === listSig) return;
    listSig = sig;
    const ul = host.querySelector('.wvul');
    ul.innerHTML = items.map((h) => `<li><button class="btn sm ghost" data-hs="${esc(h.kind)}|${esc(String(h.id))}|${h.zone || ''}">${esc(h.label)}</button></li>`).join('') || '<li class="mute small">Nothing here yet.</li>';
  }

  return {
    get world() { return world; },
    show(el, m) {
      if (!world) { world = new World({ session: S, ui: U, activate, hover }); if (window.pc) window.pc.world = world; }
      host = el; mode = m; world.api.ui = U;
      shell(); listSig = ''; hudSig = '';
      world.setMode(m); world.sync();
      if (!booted) { world.placePlayer(); booted = true; }
      m === 'map' ? world.fit(false) : world.focusZone(U.zone, false);
      lastZone = U.zone;
      this.update();
    },
    hide() { world?.stop(); host = null; },
    update() {
      if (!world || !host) return;
      world.sync();
      if (U.zone !== lastZone) { lastZone = U.zone; if (mode === 'world') world.focusZone(U.zone, true); }
      for (const b of host.querySelectorAll('[data-wz]')) { const on = +b.dataset.wz === U.zone; if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', on); b.classList.toggle('ghost', !on); b.textContent = (unlocked(+b.dataset.wz) ? '' : 'Locked: ') + ZONES[+b.dataset.wz].short; }
      const h = hud(), el = host.querySelector('.wvhud'); if (h !== hudSig && !el.contains(document.activeElement)) { hudSig = h; el.innerHTML = h; }
      list();
    },
  };
}
