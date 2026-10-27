// Dev-only page: the real engine (a few perks) and nothing but the World on a full-window canvas.
// Buttons focus districts, fit the island, switch to the map, set net worth so districts open (their gates lift with the reveal), fill a district with stock, managers and freight.
import { Game } from '../js/engine.js';
import { ZONES, ZONE_IDS } from '../js/data/index.js';
import { World } from '../js/world/world.js';
import { ASSETS, BUYERS } from '../js/config.js';

const $ = (id) => document.getElementById(id);
const game = new Game({ perks: ['connected', 'grad'], handle: 'Harness', pid: 'HX-1', seed: 7 });
const session = { game, clock: { now: () => game.s.hour, paused: true, speed: 1 } };
const ui = { zone: +(new URLSearchParams(location.search).get('zone') || 1), sel: new Set() };
const info = $('info'), tip = $('tip');
const world = new World({
  session, ui,
  activate(h, ev, ground) { if (!h) { if (ground && world.mode === 'world') world.walkPlayerTo(ground.gx, ground.gy); return; } if (h.kind === 'zone') { if (!h.locked) { ui.zone = h.id; $('zone').value = h.id; setMode('world'); h.quick ? world.quickTravel(h.id) : world.focusZone(h.id, true); sync(); } return; } if (h.zone > 0 && h.zone !== ui.zone && !game.s.zones.includes(h.zone)) return; if (h.kind === 'asset') { ui.sel.has(h.id) ? ui.sel.delete(h.id) : ui.sel.add(h.id); } info.dataset.last = `${h.kind}:${h.id}`; },
  hover(h, ev) { if (!h) { tip.hidden = true; return; } tip.hidden = false; tip.textContent = (h.label || h.kind) + (h.locked ? '  [locked]' : ''); tip.style.left = Math.min(innerWidth - 280, (ev?.clientX || 0) + 14) + 'px'; tip.style.top = (ev?.clientY || 0) + 14 + 'px'; },
  reveal(z) { info.dataset.revealed = z; },
});
window.pcw = { world, game, ui, session, ZONES, ASSETS, BUYERS };
world.attach($('stage')); $('mini').append(world.mini);

for (const id of ZONE_IDS) { const o = document.createElement('option'); o.value = id; o.textContent = `${id}. ${ZONES[id].name}`; $('zone').append(o); }
$('zone').value = ui.zone;
const setMode = (m) => { world.setMode(m); $('map').setAttribute('aria-pressed', m === 'map'); };
const sync = () => { game._unlock(); game.s.auditFirst = true; world.sync(); world.dirty = true; }; // auditFirst: the Gate 2 audit is not what this page is about
function setNW(v) {
  const rest = game.netWorth() - game.s.cash; game.s.cash = Math.max(0, v - rest); sync();
  $('nw').value = Math.round(game.netWorth());
}
$('zone').onchange = () => { ui.zone = +$('zone').value; sync(); if (world.mode === 'world') world.focusZone(ui.zone, true); };
$('focus').onclick = () => { setMode('world'); world.focusZone(ui.zone, true); };
$('quick').onclick = () => { setMode('world'); ui.zone = +$('zone').value; sync(); world.quickTravel(ui.zone); };
$('fit').onclick = () => world.fit(true);
$('map').onclick = () => setMode(world.mode === 'map' ? 'world' : 'map');
$('setnw').onclick = () => setNW(+$('nw').value || 0);
$('next').onclick = () => { const top = Math.max(...game.s.zones); if (top < 16) setNW(ZONES[top + 1].gate + 1); };
$('all').onclick = () => setNW(ZONES[16].gate + 100);
$('hour').oninput = () => { game.s.hour = +$('hour').value; session.clock.paused = true; world.sync(); world.dirty = true; };
$('play').onclick = () => { session.clock.paused = !session.clock.paused; $('play').setAttribute('aria-pressed', !session.clock.paused); };
$('rm').onclick = () => { const on = document.documentElement.dataset.motion !== 'reduce'; document.documentElement.dataset.motion = on ? 'reduce' : 'auto'; $('rm').setAttribute('aria-pressed', on); world.dirty = true; };
$('anch').onclick = () => { const on = $('anch').getAttribute('aria-pressed') !== 'true'; $('anch').setAttribute('aria-pressed', on); if (!on) document.querySelectorAll('.anchor').forEach((n) => n.remove()); };
$('pop').onclick = () => {
  const z = ui.zone; if (!game.s.zones.includes(z)) return;
  const Z = ZONES[z], have = game.s.assets.filter((a) => a.zone === z).length, classes = Object.keys(ASSETS);
  for (let i = have; i < Math.min(Z.store + 4, have + 14); i++) game.s.assets.push(game._mk(game.s, classes[(i * 7 + z) % classes.length], { zone: z, cond: i % 5 === 4 ? 'broken' : 'ok' }));
  if (Z.plots) {
    const buyer = Object.keys(BUYERS).find((b) => BUYERS[b].zone === z), cls = classes.find((c) => ASSETS[c].dem?.[z] >= 4);
    for (let i = game.s.pipes.filter((p) => p.zone === z).length; i < Z.plots - 1; i++) game.s.pipes.push({ id: 'P' + game.s.nid++, kind: ['student', 'broker', 'logistics'][i % 3], zone: z, level: 1 + i, cls, buyer, channel: 'dom', alloc: 100, prog: 3, len: 12, inflight: 1, cycles: 0, profit: 0, basis: 100, status: i === 1 ? 'paused' : 'running', pausedUntil: 0, starved: false });
  }
  sync();
};
$('ship').onclick = () => { const a = game.s.assets.find((x) => x.zone === ui.zone); const to = game.s.zones.find((z) => z !== ui.zone); if (!a || !to) return; game.s.cash += 1e5; const r = game.ship([a.id], to); info.dataset.ship = r.msg; sync(); };

let prev = performance.now(), frames = 0, acc = 0, shown = 0;
function tick(ts) {
  requestAnimationFrame(tick);
  const dt = (ts - prev) / 1000; prev = ts;
  if (!session.clock.paused) { game.advanceTo(game.s.hour + dt * (session.clock.speed / 7)); world.sync(); }
  if ($('anch').getAttribute('aria-pressed') === 'true') {
    document.querySelectorAll('.anchor').forEach((n) => n.remove());
    const r0 = world.cv.getBoundingClientRect(), mk = (kind, id) => { const r = world.rectOf(kind, id); if (!r) return; const d = document.createElement('div'); d.className = 'anchor'; d.title = kind + ':' + id; Object.assign(d.style, { left: r0.left + r.x + 'px', top: r0.top + r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); document.body.append(d); };
    for (const e of world.ents.values()) { if (e.type === 'lead' || e.type === 'lot' || e.type === 'asset' || e.type === 'pipe') mk(e.type, e.id.split(':')[1]); else if (e.type === 'plot') mk('plot', `${e.zone}:${e.plot}`); }
    for (const h of world.hotspots().filter((x) => x.kind === 'static')) mk('static', h.id);
    mk('zone', ui.zone);
  }
  frames++; acc += ts - shown; if (acc > 500) { info.textContent = `zoom ${world.cam.z.toFixed(2)}  mode ${world.mode}  fps ${world.fps}  slow ${world.slow}  lite ${world.lite}  dpr ${world.dpr}\nhour ${game.s.hour.toFixed(1)}  night ${world.night.toFixed(2)}  open ${game.s.zones.length}/16  nw $${Math.round(game.netWorth()).toLocaleString()}\nents ${world.ents.size}  hits ${world.hits.length}  last draw ${(world.lastMs || 0).toFixed(1)} ms`; acc = 0; }
  shown = ts;
}
const draw0 = world.draw.bind(world); world.draw = () => { const t0 = performance.now(); draw0(); world.lastMs = performance.now() - t0; };
requestAnimationFrame(tick);
sync(); world.placePlayer(); world.focusZone(ui.zone, false); world.draw();
const q = new URLSearchParams(location.search);
if (q.get('nw')) setNW(+q.get('nw'));
if (q.get('map')) setMode('map'); if (q.get('hour')) { $('hour').value = q.get('hour'); $('hour').oninput(); } if (q.get('fit')) world.fit(false);
