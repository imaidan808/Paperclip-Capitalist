// The 2.5D world: an isometric island of sixteen districts that mirrors the live game. Canvas 2D only; no assets, no dependencies.
//   - every game object is something you can see: buyers walk in, lots and stock are crates, pipelines are buildings, freight is trucks
//   - the virtual hour sets the light, macro shocks set the weather, a locked district lies under fog until its gate opens
//   - clicking a thing performs the real action through api.activate()
//   - only what is on screen is drawn (districts, props and ground are culled; far away they fall back to plain blocks)
import { ASSETS, BUYERS, PIPE, ZONES } from '../config.js';
import { P, sx, sy, HW, HH, toGrid, box, quad, shadow, ellipse, cyl, person, tone, shade, mix, fogged, clamp, lerp, ease, roundRect, diamond, facePoint, h2, strHash, windows } from './iso.js';
import { LAYOUT, DIST, SPOTS, PLOTS, SCENERY, EDGES, GW, GH, BW, BD, SEA, REGIONS, zAt, zoneAt, polyAt, polyInfo } from './layout.js';
import { drawProp } from './props.js';

const TAG_COLOR = { tool: '#a0a6ad', office: '#d9d2c0', prestige: '#7a5fb0', paper: '#e8e2cc', retro: '#b07a3a', electronics: '#4a8fb0', vehicle: '#b0493a', consumer: '#c45f7a', trend: '#ff3da8', scrap: '#6b5a4a', industrial: '#8a7a62', training: '#46a06a', digital: '#7be3ff', b2b: '#5a6fb0', franchise: '#e8cd6a', infra: '#6a5fa0',
  food: '#d98a3a', farm: '#8aa84a', bulk: '#9a8a6a', marine: '#3a8ab0', collectible: '#c9a227', luxury: '#b88adf', fashion: '#e06aa0', ip: '#9b6dff', media: '#d04aa8', realty: '#c47a5a', finance: '#4aa87a', energy: '#e0c030', medical: '#e0e8f0', home: '#b09070', outdoor: '#5a9a5a', gem: '#7ae0d0' };
const classColor = (cls) => TAG_COLOR[ASSETS[cls]?.tags[0]] || '#a07a45';
const SHIRTS = ['#c0392b', '#2f80ed', '#27ae60', '#9b51e0', '#f2994a', '#16a085', '#d35400', '#8e44ad', '#2980b9', '#c0762b'];
const HAIR = ['#2b1b10', '#7a3b12', '#c9a26a', '#555555', '#111111'];
const lookOf = (id) => { const h = strHash(String(id)); return { shirt: SHIRTS[h % SHIRTS.length], hair: HAIR[(h >> 4) % HAIR.length], skin: ['#f1c27d', '#e0ac69', '#c68642', '#8d5524'][(h >> 8) % 4], pants: ['#27324a', '#3b3b3b', '#4a3b2c'][(h >> 12) % 3] }; };
const compact = (v) => (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e4 ? Math.round(v / 1e3) + 'k' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : v >= 100 ? String(Math.round(v)) : v.toFixed(v < 10 ? 2 : 0));
const money = (v) => '$' + compact(v);
export const FAR_ZOOM = 0.42;      // below this zoom the world draws plain blocks and dots
export const SLOW_MS = 22, FAST_MS = 16; // quality governor: a frame that costs more than SLOW_MS steps quality down, less than FAST_MS steps it back up
const NOFX = Object.freeze({ dim: 0, fog: 0, lights: 0 });
const FOG_DIM = 0.5, REVEAL_MS = 2600;
const HOT = new Map(SCENERY.filter((p) => p.hot).map((p) => [p.hot, p]));
const CAR_EDGES = EDGES.filter((e) => !e.path && !e.ferry);

export class World {
  /** @param {{session, ui, activate:(hit)=>void, hover?:(hit,ev)=>void, reveal?:(zone)=>void}} api */
  constructor(api) {
    this.api = api;
    this.cv = document.createElement('canvas');
    this.cv.className = 'worldcv'; this.cv.tabIndex = 0;
    this.cv.setAttribute('role', 'application');
    this.cv.setAttribute('aria-label', 'Isometric world of sixteen districts. Drag to look around, Ctrl and scroll to zoom, arrow keys to pan. Every object here is also in the list below the map.');
    this.ctx = this.cv.getContext('2d', { alpha: false });
    this.mini = document.createElement('canvas'); this.mini.width = 150; this.mini.height = 96; this.mini.className = 'worldmini'; this.mini.setAttribute('aria-hidden', 'true'); this.mctx = this.mini.getContext('2d');
    this.cam = { x: 0, y: 0, z: 0.9 }; this.camTo = null;
    this.mode = 'world';
    this.W = 800; this.H = 500; this.dpr = 1;
    this.ents = new Map(); this.parts = []; this.lights = []; this.hits = []; this.overlay = [];
    this.hover = null; this.focusKey = null; this.t = 0; this.vt = 0; this.last = 0; this.night = 0; this.fps = 30; this.slow = 0; this.warm = 0; this.lite = false;
    this.player = { x: 0, y: 0, path: [], zone: 1, moving: false, dir: 1, speed: 16, placed: false };
    this.env = { t: 0, night: 0, wind: 1, dim: 0, surge: false, crunch: false, tariff: false, far: false, lite: false, locked: false, zoff: 0, lights: this.lights };
    this.reveal = {}; this.far = false;
    this.running = false; this.dirty = true; this.pointers = new Map(); this.drag = null; this.rain = null; this.hitsLabel = {};
    this.bindInput();
    this.fit(false);
  }

  get g() { return this.api.session.game; }
  reduced() { return document.documentElement.dataset.motion === 'reduce' || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches); }

  // ------------------------------------------------------------------ lifecycle
  attach(host) {
    host.replaceChildren(this.cv);
    this.host = host;
    if (!this.ro) { this.ro = new ResizeObserver(() => this.resize()); }
    this.ro.disconnect(); this.ro.observe(host);
    this.resize();
    this.start();
  }
  detach() { this.stop(); this.ro?.disconnect(); }
  start() { if (this.running) return; this.running = true; this.last = performance.now(); this.raf = requestAnimationFrame((t) => this.frame(t)); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  targetDpr() { return Math.max(1, Math.min(2, window.devicePixelRatio || 1) * (this.slow > 3 ? 0.75 : 1)); }
  resize() {
    const r = this.host.getBoundingClientRect(); if (!r.width) return;
    this.W = Math.max(1, Math.floor(r.width)); this.H = Math.max(1, Math.floor(r.height));
    this.dpr = this.targetDpr(); this.warm = 30;
    this.cv.width = Math.floor(this.W * this.dpr); this.cv.height = Math.floor(this.H * this.dpr);
    this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px';
    this.dirty = true;
    if (this.g && this.unlocked) this.draw(); // a resized canvas is blank until redrawn: never show that gap
  }

  // ------------------------------------------------------------------ camera
  bounds() { return LAYOUT.bounds; }
  fitZoom() { const b = this.bounds(); return Math.min(this.W / (b.x1 - b.x0), this.H / (b.y1 - b.y0)) * 0.98; }
  zoomRange() { return this.mode === 'map' ? [this.fitZoom() * 0.9, 1.4] : [Math.min(0.5, this.fitZoom()), 2.4]; }
  fit(animate = true) { const b = this.bounds(); this.goTo((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, this.fitZoom(), animate); }
  /** Frame one district: its whole block fills the view. */
  focusZone(z, animate = true) {
    const d = DIST[z]; if (!d) return;
    const zoom = clamp(Math.min(this.W / 1330, this.H / 830), 0.4, 1.25);
    this.goTo(sx(d.cx, d.cy), sy(d.cx, d.cy, d.z) - 20, zoom, animate);
  }
  goTo(x, y, z, animate = true) {
    if (!animate || this.reduced()) { this.cam = { x, y, z }; this.camTo = null; this.clampCam(); } else this.camTo = { x, y, z, t0: this.t, from: { ...this.cam }, dur: 650 };
    this.dirty = true;
  }
  clampCam() {
    const b = this.bounds(), [lo, hi] = this.zoomRange(); this.cam.z = clamp(this.cam.z, lo, hi);
    const hw = this.W / 2 / this.cam.z, hh = this.H / 2 / this.cam.z;
    this.cam.x = clamp(this.cam.x, b.x0 + Math.min(hw, (b.x1 - b.x0) / 2), b.x1 - Math.min(hw, (b.x1 - b.x0) / 2));
    this.cam.y = clamp(this.cam.y, b.y0 + Math.min(hh, (b.y1 - b.y0) / 2), b.y1 - Math.min(hh, (b.y1 - b.y0) / 2));
  }
  zoomBy(f, px = this.W / 2, py = this.H / 2) {
    const before = this.s2w(px, py); this.cam.z *= f; this.clampCam();
    const after = this.s2w(px, py); this.cam.x += before[0] - after[0]; this.cam.y += before[1] - after[1]; this.clampCam(); this.camTo = null; this.dirty = true;
  }
  w2s(x, y) { return [(x - this.cam.x) * this.cam.z + this.W / 2, (y - this.cam.y) * this.cam.z + this.H / 2]; }
  s2w(x, y) { return [(x - this.W / 2) / this.cam.z + this.cam.x, (y - this.H / 2) / this.cam.z + this.cam.y]; }
  setMode(m) { if (m === this.mode) return; this.mode = m; this.hover = null; if (m === 'map') this.fit(true); else this.focusZone(this.api.ui.zone, true); this.dirty = true; }

  // ------------------------------------------------------------------ input
  bindInput() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => {
      try { cv.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      this.drag = { moved: false, x: e.offsetX, y: e.offsetY, cx: this.cam.x, cy: this.cam.y, pinch: this.pointers.size > 1 ? this.pinchDist() : 0, mid: this.pointers.size > 1 ? this.pinchMid() : null, z: this.cam.z, button: e.button };
    });
    cv.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (p) { p.x = e.offsetX; p.y = e.offsetY; }
      if (this.pointers.size > 1 && this.drag) { const d = this.pinchDist(); if (this.drag.pinch) { const mid = this.pinchMid(); if (this.drag.mid) { this.cam.x -= (mid[0] - this.drag.mid[0]) / this.cam.z; this.cam.y -= (mid[1] - this.drag.mid[1]) / this.cam.z; this.clampCam(); } this.zoomBy(d / this.drag.pinch, mid[0], mid[1]); this.drag.pinch = d; this.drag.mid = mid; this.drag.moved = true; } return; }
      if (this.drag && p) {
        const dx = e.offsetX - this.drag.x, dy = e.offsetY - this.drag.y;
        if (!this.drag.moved && Math.hypot(dx, dy) > 6) { this.drag.moved = true; cv.style.cursor = 'grabbing'; }
        if (this.drag.moved) { this.cam.x = this.drag.cx - dx / this.cam.z; this.cam.y = this.drag.cy - dy / this.cam.z; this.clampCam(); this.camTo = null; this.dirty = true; }
        return;
      }
      this.pointerAt(e.offsetX, e.offsetY, e);
    });
    const up = (e) => {
      const d = this.drag, wasDrag = d?.moved;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 1 && d) { const [p] = [...this.pointers.values()]; Object.assign(d, { x: p.x, y: p.y, cx: this.cam.x, cy: this.cam.y, pinch: 0, mid: null, moved: true }); } // one finger left: carry on panning from here, never jump
      if (!this.pointers.size) {
        cv.style.cursor = this.hover ? 'pointer' : 'grab';
        if (d && !wasDrag && e.type === 'pointerup' && d.button === 0) { const h = this.pick(e.offsetX, e.offsetY); if (h) this.api.activate(h, e); else this.api.activate(null, e, this.groundAt(e.offsetX, e.offsetY)); }
        this.drag = null;
      }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { if (!this.drag) { this.hover = null; this.api.hover?.(null); this.dirty = true; } });
    cv.addEventListener('wheel', (e) => { if (!(e.ctrlKey || e.metaKey || e.altKey)) return; e.preventDefault(); this.zoomBy(Math.exp(-e.deltaY * 0.0022), e.offsetX, e.offsetY); }, { passive: false });
    cv.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return; // never swallow the browser's own zoom and navigation shortcuts
      if (e.key === '0') { e.preventDefault(); this.fit(true); return; }
      const step = 60 / this.cam.z; let h = true;
      if (e.key === 'ArrowLeft') this.cam.x -= step; else if (e.key === 'ArrowRight') this.cam.x += step; else if (e.key === 'ArrowUp') this.cam.y -= step; else if (e.key === 'ArrowDown') this.cam.y += step;
      else if (e.key === '+' || e.key === '=') this.zoomBy(1.2); else if (e.key === '-') this.zoomBy(1 / 1.2); else h = false;
      if (h) { e.preventDefault(); this.clampCam(); this.camTo = null; this.dirty = true; }
    });
    cv.style.cursor = 'grab';
    this.mini.addEventListener('pointerdown', (e) => { const r = this.mini.getBoundingClientRect(), b = this.bounds(); this.goTo(b.x0 + (e.clientX - r.left) / r.width * (b.x1 - b.x0), b.y0 + (e.clientY - r.top) / r.height * (b.y1 - b.y0), this.cam.z, true); });
  }
  pinchDist() { const [a, b] = [...this.pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; }
  pinchMid() { const [a, b] = [...this.pointers.values()]; return [(a.x + b.x) / 2, (a.y + b.y) / 2]; }
  /** The grid point under a world-pixel point, taking the height of the ground there into account. */
  unproject(wx, wy) { let g = toGrid(wx, wy, 0); for (let i = 0; i < 4; i++) g = toGrid(wx, wy, zAt(g[0], g[1])); return g; }
  groundAt(px, py) { const [wx, wy] = this.s2w(px, py), [gx, gy] = this.unproject(wx, wy); return { gx, gy, zone: zoneAt(gx, gy) }; }
  /** Which district's ground (block or its pad) is under a world point (used by the map). */
  zoneUnder(wx, wy) { const [gx, gy] = this.unproject(wx, wy); return LAYOUT.footAt(gx, gy); }
  pick(px, py) {
    if (this.mode === 'map') {
      for (const id of LAYOUT.ids) { const r = this.hitsLabel[id]; if (r && px >= r[0] && px <= r[0] + r[2] && py >= r[1] && py <= r[1] + r[3]) return this.zoneHit(id); }
      const z = this.zoneUnder(...this.s2w(px, py)); return z ? this.zoneHit(z) : null;
    }
    const [wx, wy] = this.s2w(px, py);
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (h.circle) { if (Math.hypot(wx - h.circle[0], wy - h.circle[1]) <= h.circle[2]) return h; }
      else for (const poly of h.polys) if (inPoly(poly, wx, wy)) return h;
    }
    return null;
  }
  zoneHit(id) { const D = DIST[id], open = this.unlocked?.has(id) ?? true; return { kind: 'zone', id, eid: 'zone:' + id, zone: id, label: D.name + (open ? '' : ` (locked: opens at ${money(D.gate)} net worth)`), locked: !open, quick: true, gate: D.gate, polys: [blockPoly(D)] }; }
  pointerAt(px, py, ev) {
    const h = this.pick(px, py), key = h ? h.kind + ':' + h.id : null;
    const prev = this.hover ? this.hover.kind + ':' + this.hover.id : null; this.hover = h; if (key !== prev) { this.cv.style.cursor = h ? 'pointer' : 'grab'; this.dirty = true; }
    this.api.hover?.(h, ev);
  }

  // ------------------------------------------------------------------ state sync (called on every game tick)
  sync() {
    const g = this.g; if (!g) return;
    const s = g.s, unlocked = new Set(s.zones), hf = this.hourF();
    if (this.unlocked) for (const z of unlocked) if (!this.unlocked.has(z)) this.startReveal(z);
    this.unlocked = unlocked;
    const seen = new Set();
    const upsert = (id, make) => { seen.add(id); let e = this.ents.get(id); if (!e) { e = make(); e.id = id; e.born = this.t; this.ents.set(id, e); } e.gone = false; return e; };
    // buyers, lots
    for (const z of s.zones) {
      const SP = SPOTS[z], D = DIST[z]; if (!SP) continue;
      const live = new Set(s.leads[z].map((l) => 'lead:' + l.id));
      const used = new Set([...this.ents.values()].filter((e) => e.type === 'lead' && e.zone === z && !e.leaving && live.has(e.id)).map((e) => e.slot));
      for (const l of s.leads[z]) {
        const id = 'lead:' + l.id;
        const e = upsert(id, () => { let slot = SP.leads.findIndex((_, i) => !used.has(i)); if (slot < 0) slot = 0; used.add(slot); const en = D.entry; return { type: 'lead', zone: z, slot, x: en[0] + (h2(strHash(l.id), 1) - 0.5) * 1.2, y: en[1] + (h2(strHash(l.id), 2) - 0.5) * 0.8, seg: l.seg, look: lookOf(l.id + l.seg) }; });
        e.lead = l; e.leaving = false; const sp = SP.leads[e.slot]; e.tx = sp[0]; e.ty = sp[1];
      }
      const lotEnts = s.lots[z].map((l) => { const e = upsert('lot:' + l.id, () => ({ type: 'lot', zone: z, slot: -1, drop: 46 })); e.lot = l; return e; });
      const taken = new Set(); for (const e of lotEnts) if (e.slot >= 0 && e.slot < SP.lots.length && !taken.has(e.slot)) taken.add(e.slot); else e.slot = -1;
      for (const e of lotEnts) if (e.slot < 0) { let k = 0; while (taken.has(k) && k < SP.lots.length - 1) k++; e.slot = k; taken.add(k); }
    }
    // stock crates: everything the player holds, wherever it is (a crate that changed district is a new arrival)
    const byZone = {};
    for (const a of s.assets) (byZone[a.zone] ||= []).push(a);
    for (const [zs, list] of Object.entries(byZone)) {
      const z = +zs, ids = new Set(list.map((a) => 'asset:' + a.id));
      if (!DIST[z]) continue;
      for (const a of list) { const old = this.ents.get('asset:' + a.id); if (old && old.zone !== z) this.ents.delete('asset:' + a.id); }
      const usedA = new Set([...this.ents.values()].filter((e) => e.type === 'asset' && e.zone === z && !e.gone && ids.has(e.id)).map((e) => e.slot));
      for (const a of list) { const e = upsert('asset:' + a.id, () => { let slot = 0; while (usedA.has(slot)) slot++; usedA.add(slot); return { type: 'asset', zone: z, slot, drop: 36 }; }); e.asset = a; }
    }
    // pipelines: a building keeps its plot for life; empty plots are the ones nobody holds (a fading building still holds its)
    for (const z of LAYOUT.ids) {
      const n = ZONES[z].plots; if (!n) continue;
      const ps = s.pipes.filter((p) => p.zone === z);
      const held = new Set([...this.ents.values()].filter((e) => e.type === 'pipe' && e.zone === z).map((e) => e.plot));
      for (const p of ps) {
        const e = upsert('pipe:' + p.id, () => { let i = 0; while (held.has(i) && i < n - 1) i++; held.add(i); return { type: 'pipe', zone: z, drop: 60, cycles: p.cycles, plot: i }; });
        e.pipe = p; if (p.cycles > e.cycles) { e.cycles = p.cycles; this.cyclePop(e, z, e.plot); }
      }
      const taken = new Set([...this.ents.values()].filter((e) => e.type === 'pipe' && e.zone === z).map((e) => e.plot));
      for (let i = 0; i < n; i++) if (!taken.has(i)) { const e = upsert(`plot:${z}:${i}`, () => ({ type: 'plot', zone: z, plot: i })); e.zoneLocked = !unlocked.has(z); e.locked = e.zoneLocked || g.autoLocked(); }
    }
    // freight
    for (const f of s.freight) { const e = upsert('truck:' + f.id, () => ({ type: 'truck', from: f.from ?? f.items[0]?.zone ?? 1 })); e.f = f; }
    // leavers: anything not seen this sync
    for (const [id, e] of this.ents) {
      if (seen.has(id)) continue;
      if (e.type === 'lead' && !e.leaving) { e.leaving = true; e.leaveAt = this.t; const en = DIST[e.zone].entry; e.tx = en[0]; e.ty = en[1]; }
      else if (e.type === 'lead') continue;
      else if (!e.gone) { e.gone = true; e.goneAt = this.t; this.hits = this.hits.filter((h) => h.eid !== id); }
    }
    // environment
    const m = g.mods();
    this.env.surge = m.demand.some((d) => d.tags?.includes('trend') && d.mult > 1);
    this.env.crunch = m.freeze || m.rateBps > 0;
    this.env.tariff = m.intlSlow > 0;
    this.env.alertAudit = !!s.auditPending;
    this.env.boardText = null;
    this.env.hour = hf;
    this.syncPlayer();
    this.dirty = true;
  }
  /** A district just opened: its fog lifts and its lights come on (instantly under reduced motion). */
  startReveal(z) { if (!this.reduced()) this.reveal[z] = { t0: this.t, dur: REVEAL_MS }; this.api.reveal?.(z); this.dirty = true; }
  fxOf(z) {
    const open = this.unlocked ? this.unlocked.has(z) : true, r = this.reveal[z];
    if (open && !r) return NOFX;
    if (!open) return { dim: FOG_DIM, fog: 1, lights: 0 };
    const p = clamp((this.t - r.t0) / r.dur, 0, 1);
    if (p >= 1) { delete this.reveal[z]; return NOFX; }
    const e = ease(p); return { dim: FOG_DIM * (1 - e), fog: 1 - e, lights: Math.sin(p * Math.PI) * 0.9 };
  }
  hourF() { const S = this.api.session, g = this.g; if (!g) return 0; const live = S.clock.now(), fr = S.clock.paused || g.s.over ? 0 : clamp(live - g.s.hour, 0, 1); return g.s.hour + fr; }
  homeZone() { return this.unlocked?.has(this.api.ui.zone) ? this.api.ui.zone : Math.max(...(this.g?.s.zones || [1])); }
  placePlayer() { const z = this.homeZone(), h = SPOTS[z].home; Object.assign(this.player, { x: h[0], y: h[1], zone: z, path: [], placed: true }); }
  syncPlayer() {
    const z = this.unlocked?.has(this.api.ui.zone) ? this.api.ui.zone : this.player.zone, pl = this.player;
    if (!pl.placed) { this.placePlayer(); return; }
    if (pl.zone !== z) {
      const from = pl.zone; pl.zone = z;
      const path = LAYOUT.playerRoute(from, z, this.unlocked); if (!path) { this.placePlayer(); return; }
      let len = 0, [px, py] = [pl.x, pl.y]; for (const [x, y] of path) { len += Math.hypot(x - px, y - py); px = x; py = y; }
      pl.path = path; pl.speed = Math.max(14, len / 5); // the walk is real, along the roads; a very long one still takes only about five seconds (quickTravel skips it)
    } else if (!pl.path.length && !pl.moving && Math.hypot(pl.x - SPOTS[z].home[0], pl.y - SPOTS[z].home[1]) > 40) { pl.x = SPOTS[z].home[0]; pl.y = SPOTS[z].home[1]; }
  }
  /** Skip the walk: stand at the home spot of an open district and frame it. Returns false if the district is locked. */
  quickTravel(z) {
    if (!DIST[z] || (this.unlocked && !this.unlocked.has(z))) return false;
    const pl = this.player, h = SPOTS[z].home; Object.assign(pl, { x: h[0], y: h[1], zone: z, path: [], placed: true, moving: false });
    if (this.mode === 'world') this.focusZone(z, true); this.dirty = true; return true;
  }
  walkPlayerTo(gx, gy) { const pl = this.player; if (zoneAt(gx, gy) !== pl.zone) return; pl.speed = 16; pl.path = [[gx, gy]]; }
  cyclePop(e, z, i) {
    const pl = PLOTS[z][i], p = e.pipe, g = this.g, D = DIST[z];
    const last = [...g.s.ledger].reverse().find((l) => l.type === 'pipe' && l.pid === p.id);
    const amt = last ? last.amt : 0;
    this.pop((amt >= 0 ? '+' : '-') + money(Math.abs(amt)), pl[0] + 1.5, pl[1] + 1.5, D.z + 60 + p.level * 12, amt >= 0 ? '#ffd36e' : '#ff7d75');
    if (!this.reduced()) for (let k = 0; k < 8; k++) this.parts.push({ k: 'coin', gx: pl[0] + 1.5, gy: pl[1] + 1.5, z: D.z + 40 + p.level * 12, vx: (h2(k, e.cycles) - 0.5) * 40, up: 50 + h2(k + 9, e.cycles) * 50, life: 1.1 + h2(k + 3, e.cycles) * 0.4, age: 0 });
  }
  pop(text, gx, gy, z, color = '#ffd36e') { this.parts.push({ k: 'text', gx, gy, z, text, color, life: 1.8, age: 0 }); }

  // ------------------------------------------------------------------ frame loop
  frame(ts) {
    if (!this.running) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
    if (document.hidden) return;
    const dt = Math.min(0.1, (ts - this.last) / 1000);
    if (ts - this.last < 1000 / this.fps - 1) return;
    const t0 = performance.now();
    this.last = ts; this.t = ts;
    const calm = this.reduced();
    const animating = !calm || this.camTo || this.player.path.length || this.parts.length || Object.keys(this.reveal).length;
    if (!animating && !this.dirty) return;
    this.update(dt);
    this.draw();
    this.dirty = false;
    const cost = performance.now() - t0;
    if (this.warm > 0) this.warm--; else this.slow = clamp(this.slow + (cost > SLOW_MS ? 1 : cost < FAST_MS ? -1 : 0), 0, 6);
    this.fps = this.slow > 4 ? 15 : this.slow > 2 ? 20 : 30;
    this.lite = this.slow > 2;
    if (Math.abs(this.targetDpr() - this.dpr) > 0.01) this.resize();
  }

  update(dt) {
    const calm = this.reduced(), speed = this.api.session.clock.speed;
    // camera tween
    if (this.camTo) { const c = this.camTo, k = clamp((this.t - c.t0) / c.dur, 0, 1), e = ease(k); this.cam.x = lerp(c.from.x, c.x, e); this.cam.y = lerp(c.from.y, c.y, e); this.cam.z = lerp(c.from.z, c.z, e); if (k >= 1) this.camTo = null; this.clampCam(); }
    // light: rate-limited so fast clocks never strobe (WCAG 2.3.1)
    const h = ((this.env.hour ?? 0) + 8) % 24; // the run starts at 08:00 so the first view is daylight
    let target = h >= 7 && h < 17 ? 0 : h >= 17 && h < 20 ? (h - 17) / 3 : h >= 4 && h < 7 ? 1 - (h - 4) / 3 : 1;
    if (calm) target = 0; else if (speed >= 16) target = 0.3;
    this.night += clamp(target - this.night, -dt * 0.35, dt * 0.35);
    this.vt = calm ? 0 : this.t;
    Object.assign(this.env, { t: this.vt, night: this.night, wind: calm ? 0 : 1, dim: 0 });
    // entities walk
    const sp = 2.4;
    for (const [id, e] of this.ents) {
      if (e.type === 'lead') {
        const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.hypot(dx, dy);
        e.moving = d > 0.06;
        if (e.moving) { const stp = Math.min(d, (calm ? 40 : sp) * dt); e.x += dx / d * stp; e.y += dy / d * stp; if (Math.abs(dx) > 0.01) e.dir = dx > 0 ? 1 : -1; }
        if (e.leaving && (!e.moving || this.t - e.leaveAt > 4500)) this.ents.delete(id);
      } else if (e.gone && this.t - e.goneAt > 600) this.ents.delete(id);
      if (e.drop) e.drop = Math.max(0, e.drop - (calm ? 999 : 180) * dt);
    }
    // player walks
    const pl = this.player;
    if (pl.path.length) { const [tx, ty] = pl.path[0], dx = tx - pl.x, dy = ty - pl.y, d = Math.hypot(dx, dy), v = pl.path.length > 1 ? pl.speed : Math.min(pl.speed, 5); if (d < 0.1) pl.path.shift(); else { const st = Math.min(d, (calm ? 4000 : v) * dt); pl.x += dx / d * st; pl.y += dy / d * st; if (Math.abs(dx) > 0.01) pl.dir = dx > 0 ? 1 : -1; } pl.moving = true; } else pl.moving = false;
    // particles
    for (const p of this.parts) p.age += dt;
    this.parts = this.parts.filter((p) => p.age < p.life);
    if (this.env.crunch && !calm) { if (!this.rain) this.rain = Array.from({ length: 90 }, (_, i) => [h2(i, 1), h2(i, 2), 0.6 + h2(i, 3) * 0.6]); for (const r of this.rain) { r[1] += dt * r[2] * 1.6; r[0] -= dt * 0.25 * r[2]; if (r[1] > 1.05) { r[1] = -0.05; r[0] = Math.random() * 1.2; } if (r[0] < -0.05) r[0] += 1.1; } } else this.rain = null;
  }

  // ------------------------------------------------------------------ drawing
  draw() {
    const ctx = this.ctx, { W, H, dpr } = this;
    this.hits = []; this.overlay = []; this.lights = []; this.env.lights = this.lights;
    this.far = this.cam.z < FAR_ZOOM; this.env.far = this.far; this.env.lite = this.lite;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawWater(ctx);
    ctx.setTransform(dpr * this.cam.z, 0, 0, dpr * this.cam.z, dpr * (W / 2 - this.cam.x * this.cam.z), dpr * (H / 2 - this.cam.y * this.cam.z));
    const view = { x0: this.cam.x - W / 2 / this.cam.z - 80, x1: this.cam.x + W / 2 / this.cam.z + 80, y0: this.cam.y - H / 2 / this.cam.z - 260, y1: this.cam.y + H / 2 / this.cam.z + 80 };
    this.view = view;
    this.drawGround(ctx, view);
    const items = [], map = this.mode === 'map', vz = new Set();
    const seeBox = (b) => b[2] > view.x0 && b[0] < view.x1 && b[3] > view.y0 && b[1] < view.y1;
    for (const id of LAYOUT.ids) {
      const D = DIST[id]; if (!seeBox(D.bb)) continue; vz.add(id);
      for (const p of D.props) { if (p.sm && (this.far || this.lite && this.cam.z < 0.6)) continue; if (p.bb[2] > view.x0 && p.bb[0] < view.x1 && p.bb[3] > view.y0 && p.bb[1] < view.y1) items.push({ key: p.key, k: 's', p }); }
    }
    for (const e of this.ents.values()) {
      if (e.type === 'truck') { const [gx, gy] = this.truckPos(e), x = sx(gx, gy), y = sy(gx, gy, zAt(gx, gy)); if (x > view.x0 && x < view.x1 && y > view.y0 && y < view.y1 + 60) items.push({ key: gx + gy + 0.8, k: 'e', e }); }
      else if (!vz.has(e.zone)) continue;
      else if (e.type === 'plot' || e.type === 'pipe') items.push({ key: this.keyOf(e), k: 'e', e });
      else { const [gx, gy] = this.posOf(e); if (this.onView(gx, gy, 80)) items.push({ key: gx + gy + 0.5, k: 'e', e }); }
    }
    if (this.onView(this.player.x, this.player.y, 80)) items.push({ key: this.player.x + this.player.y + 0.5, k: 'p' });
    if (!this.reduced()) for (const c of this.cars()) if (this.onView(c.gx, c.gy, 40)) items.push({ key: c.key, k: 'c', c });
    items.sort((a, b) => a.key - b.key);
    for (const it of items) {
      try {
        if (it.k === 's') this.drawStatic(ctx, it.p);
        else if (it.k === 'e') this.drawEnt(ctx, it.e);
        else if (it.k === 'p') this.drawPlayer(ctx);
        else this.drawCar(ctx, it.c);
      } catch (err) { ctx.restore?.(); ctx.globalAlpha = 1; this.fault(err, it.k + ':' + (it.p?.t || it.e?.type || it.c?.i)); }
    }
    if (!map && this.cam.z < 0.4) for (const id of vz) { const D = DIST[id], open = this.unlocked?.has(id) ?? true; this.hits.push({ kind: 'zone', id, eid: 'tag:' + id, zone: id, label: open ? `Travel to ${D.name}` : `${D.name} (locked: opens at ${money(D.gate)} net worth)`, locked: !open, quick: true, gate: D.gate, circle: [sx(D.cx, D.cy), sy(D.cx, D.cy, D.z) - 70, 44 / this.cam.z] }); }
    try { this.drawFog(ctx, vz); } catch (err) { ctx.restore?.(); this.fault(err, 'fog'); }
    if (this.hover) { const k = this.hover.kind + ':' + this.hover.id, fresh = this.hits.find((h) => h.kind + ':' + h.id === k); if (fresh) this.hover = fresh; this.drawHover(ctx); }
    // screen-space passes
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const pass of [() => this.drawLight(ctx), () => map ? this.drawMapRoute(ctx) : null, () => this.drawOverlay(ctx), () => this.drawWeather(ctx), () => map && this.drawMapLabels(ctx), () => this.drawMini()]) { try { pass(); } catch (err) { ctx.restore?.(); this.fault(err, 'pass'); } }
  }
  onView(gx, gy, m = 60) { const x = sx(gx, gy), y = sy(gx, gy, zAt(gx, gy)), v = this.view; return x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m; }

  /** One broken object must never blank the world: log it once and keep drawing the rest. */
  fault(err, where) { this.faults = this.faults || new Set(); const k = where + err.message; if (!this.faults.has(k)) { this.faults.add(k); console.error('world: could not draw', where, err); } }

  drawWater(ctx) {
    const { W, H } = this, night = this.night;
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, mix('#1b3b5c', '#08111f', night * 0.8)); gr.addColorStop(1, mix('#235a7a', '#0b1a2c', night * 0.8));
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = `rgba(190,230,255,${0.1 + 0.05 * (1 - night)})`; ctx.lineWidth = 1;
    const calm = this.reduced();
    for (let i = 0; i < 26; i++) {
      const y = (i / 26) * H + 8, ph = calm ? 0 : this.vt / 1400 + i, x0 = ((i * 137) % W);
      ctx.beginPath(); for (let x = -20; x < 90; x += 6) { const px = (x0 + x * 2.2) % (W + 60) - 30, py = y + Math.sin(ph + x * 0.1) * 1.6; x === -20 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); } ctx.stroke();
    }
  }

  /** Ground: coast cliffs, the terrain (drawn coarser the further out you are), roads and bridges between districts, each block's flat patches and decals. */
  drawGround(ctx, view) {
    const zoom = this.cam.z, far = zoom < FAR_ZOOM, see = (x0, y0, x1, y1) => x1 > view.x0 && x0 < view.x1 && y1 > view.y0 && y0 < view.y1;
    const { ZV, VW, tcol, land, lands, owner, core, maxZ } = LAYOUT, stride = zoom >= 0.85 ? 1 : zoom >= 0.5 ? 2 : zoom >= 0.28 ? 4 : 8;
    for (const c of LAYOUT.cliffs) {
      if (!see(c.bb[0], c.bb[1], c.bb[2], c.bb[3])) continue;
      const col = mix('#9a8a64', '#575d6a', clamp((c.za + c.zb) / 90, 0, 1));
      if (c.k === 's') { quad(ctx, [P(c.x, c.y, c.za), P(c.x + 1, c.y, c.zb), P(c.x + 1, c.y, -SEA), P(c.x, c.y, -SEA)], col, col, 0.6); if (!far) { ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 1; for (let i = 1; i < 4; i++) { const f = i / 4, a = P(c.x, c.y, c.za + (-SEA - c.za) * f), b = P(c.x + 1, c.y, c.zb + (-SEA - c.zb) * f); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } } }
      else quad(ctx, [P(c.x, c.y, c.za), P(c.x, c.y + 1, c.zb), P(c.x, c.y + 1, -SEA), P(c.x, c.y, -SEA)], shade(col, 0.72), shade(col, 0.72), 0.6);
    }
    // terrain: the tiles in view (a coarser mesh when zoomed out), tinted down where a district is still locked
    let gx0 = 1e9, gx1 = -1e9, gy0 = 1e9, gy1 = -1e9;
    for (const [x, y] of [[view.x0, view.y0], [view.x1, view.y0], [view.x0, view.y1], [view.x1, view.y1]]) for (const zz of [0, maxZ]) { const [a, b] = toGrid(x, y, zz); gx0 = Math.min(gx0, a); gx1 = Math.max(gx1, a); gy0 = Math.min(gy0, b); gy1 = Math.max(gy1, b); }
    const i0 = Math.max(0, Math.floor(gx0) - 1), i1 = Math.min(GW - 1, Math.ceil(gx1) + 1), j0 = Math.max(0, Math.floor(gy0) - 1), j1 = Math.min(GH - 1, Math.ceil(gy1) + 1);
    const sig = this.unlocked ? [...this.unlocked].join() : ''; if (sig !== this.tileSig) { this.tileSig = sig; this.dimTiles = new Map(); }
    const st = stride, Ls = st > 1 ? lands[st] : null, Z = (i, j) => ZV[Math.min(j, GH) * VW + Math.min(i, GW)];
    for (let j = j0 - (j0 % st); j <= j1; j += st) for (let i = i0 - (i0 % st); i <= i1; i += st) {
      const px = (i - j) * HW; if (px < view.x0 - 90 * st || px > view.x1 + 90 * st) continue;
      let col;
      if (st === 1) { const k = j * GW + i; if (!land[k] || core[k]) continue; col = tcol[k]; const o = owner[k]; if (o && this.unlocked) { const dm = this.fxOf(o).dim; if (dm) { if (dm === FOG_DIM) { col = this.dimTiles.get(k) || (this.dimTiles.set(k, fogged(col, dm)), this.dimTiles.get(k)); } else col = fogged(col, dm); } } }
      else { if (!Ls.a[Math.floor(j / st) * Ls.w + Math.floor(i / st)]) continue; col = this.coarseCol(st, i, j); }
      quad(ctx, [P(i, j, Z(i, j)), P(i + st, j, Z(i + st, j)), P(i + st, j + st, Z(i + st, j + st)), P(i, j + st, Z(i, j + st))], col, col, 0.8);
    }
    this.drawRoads(ctx, view, far, see);
    for (const id of LAYOUT.ids) {
      const D = DIST[id], b = D.bb; if (!see(b[0], b[1] + 200, b[2], b[3])) continue;
      const k = this.fxOf(id).dim, z = D.z;
      for (const g of D.ground) quad(ctx, [P(g.x, g.y, z), P(g.x + g.w, g.y, z), P(g.x + g.w, g.y + g.d, z), P(g.x, g.y + g.d, z)], k ? fogged(g.col, k) : g.col, g.kind === 'block' ? 'rgba(0,0,0,.4)' : null, 1.5);
      for (const d of D.decals) if (zoom >= (d.min ?? 0.3)) this.drawDecal(ctx, d, z, k);
      if (zoom >= 0.4) this.drawMarks(ctx, D, z);
    }
  }
  /** The colour of a coarse terrain cell: the first land tile in it nearest its middle. */
  coarseCol(st, i, j) {
    const key = st * 1e7 + j * 1000 + i; this.cc = this.cc || new Map(); let c = this.cc.get(key);
    if (c === undefined) { c = '#4b7a4e'; let best = 1e9; for (let b = 0; b < st; b++) for (let a = 0; a < st; a++) { const k = (j + b) * GW + i + a; if (i + a < GW && j + b < GH && LAYOUT.land[k]) { const d = Math.abs(a - st / 2) + Math.abs(b - st / 2); if (d < best) { best = d; c = LAYOUT.tcol[k]; } } } this.cc.set(key, c); }
    return c;
  }
  /** The roads between districts (ribbons that follow the ground), the footpaths, the ferry's route and the bridges. */
  drawRoads(ctx, view, far, see) {
    const zoom = this.cam.z;
    for (const e of EDGES) {
      if (!e.bb) { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of e.pts) { x0 = Math.min(x0, (x - y) * HW); x1 = Math.max(x1, (x - y) * HW); y0 = Math.min(y0, (x + y) * HH); y1 = Math.max(y1, (x + y) * HH); } e.bb = [x0 - 60, y0 - LAYOUT.maxZ - 80, x1 + 60, y1 + 60]; e.br = LAYOUT.bridges.filter((b) => b.edge === e); }
      if (!see(e.bb[0], e.bb[1], e.bb[2], e.bb[3])) continue;
      const open = this.unlocked ? this.unlocked.has(e.gate) : true;
      if (e.ferry) { ctx.save(); ctx.strokeStyle = open ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.18)'; ctx.lineWidth = 2; ctx.setLineDash([6, 10]); ctx.beginPath(); e.pts.slice(1, -1).forEach(([x, y], i) => { const [X, Y] = P(x, y, 0); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke(); ctx.restore(); continue; }
      const col = e.path ? '#8f7e5c' : open ? '#2f3644' : '#454a58', half = e.w / 2, brokenBridge = !open && DIST[e.gate]?.gateKind === 'bridge';
      const gap = brokenBridge && e.br[0] ? [e.br[0].s0 + (e.br[0].s1 - e.br[0].s0) * 0.22, e.br[0].s1 - (e.br[0].s1 - e.br[0].s0) * 0.22] : null;
      const dash = []; let s0 = 0;
      for (let i = 0; i + 1 < e.pts.length; i++) {
        const [ax, ay] = e.pts[i], [bx, by] = e.pts[i + 1], l = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / l * half, ny = (bx - ax) / l * half, n = Math.max(1, Math.ceil(l / 3));
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n, x0 = ax + (bx - ax) * t0, y0 = ay + (by - ay) * t0, x1 = ax + (bx - ax) * t1, y1 = ay + (by - ay) * t1, sm = s0 + l * (t0 + t1) / 2;
          if (gap && sm > gap[0] && sm < gap[1]) continue;
          const z0 = zAt(x0, y0) + 0.4, z1 = zAt(x1, y1) + 0.4;
          quad(ctx, [P(x0 - nx, y0 - ny, z0), P(x1 - nx, y1 - ny, z1), P(x1 + nx, y1 + ny, z1), P(x0 + nx, y0 + ny, z0)], col, col, 0.7);
          if (!e.path && open && zoom >= 0.3) dash.push([x0, y0, z0, x1, y1, z1]);
        }
        s0 += l;
        if (i > 0 && !gap) { const [X, Y] = P(ax, ay, zAt(ax, ay) + 0.4); ellipse(ctx, X, Y, half * HW * 1.42, half * HH * 1.42, col); }
      }
      if (dash.length) { ctx.save(); ctx.strokeStyle = 'rgba(255,211,110,.7)'; ctx.lineWidth = 1.6; ctx.setLineDash([10, 12]); ctx.beginPath(); for (const [x0, y0, z0, x1, y1, z1] of dash) { const a = P(x0, y0, z0 + 0.2), b = P(x1, y1, z1 + 0.2); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } ctx.stroke(); ctx.restore(); }
      for (const b of e.br) this.drawBridge(ctx, b, brokenBridge, far);
    }
  }
  drawBridge(ctx, b, broken, far) {
    if (far) return;
    const pts = b.pts, n = pts.length; ctx.save(); ctx.lineWidth = 1.6;
    for (let i = 0; i + 1 < n; i++) {
      if (broken && i > n * 0.22 && i < n * 0.78) continue;
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], l = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / l * 1.15, ny = (bx - ax) / l * 1.15, z0 = zAt(ax, ay), z1 = zAt(bx, by);
      ctx.strokeStyle = '#c9ccd2'; for (const sgn of [-1, 1]) { const A = P(ax + nx * sgn, ay + ny * sgn, z0 + 6), B = P(bx + nx * sgn, by + ny * sgn, z1 + 6); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); }
      if (i % 3 === 1) { ctx.strokeStyle = '#2b3342'; ctx.lineWidth = 3; for (const sgn of [-1, 1]) { const A = P(ax + nx * sgn * 0.7, ay + ny * sgn * 0.7, z0 - 1), B = P(ax + nx * sgn * 0.7, ay + ny * sgn * 0.7, 0); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); } ctx.lineWidth = 1.6; }
    }
    ctx.restore();
  }
  /** Crosswalks at the junction of every block (flat white bars). */
  drawMarks(ctx, D, z) {
    const { ox, oy } = D, w = 'rgba(255,255,255,.5)';
    for (let k = 0; k < 5; k++) {
      const u = 0.15 + k * 0.17;
      for (const x of [ox + 8.4, ox + 13.1]) quad(ctx, [P(x, oy + 8 + u * 2 - 0.1, z), P(x + 0.5, oy + 8 + u * 2 - 0.1, z), P(x + 0.5, oy + 8 + u * 2 + 0.05, z), P(x, oy + 8 + u * 2 + 0.05, z)], w);
      for (const y of [oy + 6.5, oy + 11.1]) quad(ctx, [P(ox + 10 + u * 2 - 0.1, y, z), P(ox + 10 + u * 2 + 0.05, y, z), P(ox + 10 + u * 2 + 0.05, y + 0.5, z), P(ox + 10 + u * 2 - 0.1, y + 0.5, z)], w);
    }
  }
  /** Ground decals a theme lays down: lawns, cobbles, bays, circuit traces, crops, water. */
  drawDecal(ctx, d, z, k) {
    const col = (c) => (c && k && c[0] === '#' ? fogged(c, k) : c), { x, y, w, d: dd } = d;
    const rect = (x0, y0, w0, d0, fill, stroke) => quad(ctx, [P(x0, y0, z), P(x0 + w0, y0, z), P(x0 + w0, y0 + d0, z), P(x0, y0 + d0, z)], col(fill), stroke ? col(stroke) : null);
    switch (d.k) {
      case 'rect': rect(x, y, w, dd, d.fill, d.stroke); break;
      case 'ell': { const [px, py] = P(x, y, z); ellipse(ctx, px, py, d.r * HW * 1.42, d.r * HH * 1.42, col(d.fill), d.stroke ? col(d.stroke) : null, 1.5); break; }
      case 'stripes': { const n = d.n; for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n; if (d.axis === 'x') rect(x, y + dd * t0, w, dd * (t1 - t0) + 0.01, i % 2 ? d.c2 : d.c1); else rect(x + w * t0, y, w * (t1 - t0) + 0.01, dd, i % 2 ? d.c2 : d.c1); } break; }
      case 'checker': { rect(x, y, w, dd, d.c1); const s = d.step; for (let i = 0; i * s < w - 0.01; i++) for (let j = 0; j * s < dd - 0.01; j++) if ((i + j) % 2) rect(x + i * s, y + j * s, Math.min(s, w - i * s), Math.min(s, dd - j * s), d.c2); break; }
      case 'grid': { ctx.strokeStyle = d.col; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i <= w + 0.01; i += d.step) { const a = P(x + i, y, z), b = P(x + i, y + dd, z); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } for (let j = 0; j <= dd + 0.01; j += d.step) { const a = P(x, y + j, z), b = P(x + w, y + j, z); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } ctx.stroke(); break; }
      case 'spk': { ctx.fillStyle = d.fill; for (let i = 0; i < d.n; i++) { const [px, py] = P(x + h2(d.seed, i * 2) * w, y + h2(d.seed, i * 2 + 1) * dd, z); ctx.fillRect(px, py, d.r, d.r); } break; }
      case 'pulse': { const ph = this.vt ? this.vt / 900 : 0; ctx.fillStyle = d.col; for (let i = 0; i < 7; i++) { const [px, py] = P(x + h2(7, i) * w, y + h2(8, i) * dd, z); ctx.globalAlpha = 0.35 + 0.35 * Math.sin(ph + i * 1.7); ctx.fillRect(px - 2, py - 1, 4, 2); } ctx.globalAlpha = 1; break; }
      case 'water': {
        rect(x, y, w, dd, d.fill); const ph = this.vt ? this.vt / 700 : 0;
        ctx.strokeStyle = 'rgba(200,235,255,.35)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let i = 1; i < 7; i++) { const yy = y + (dd * i) / 7; for (let j = 0; j <= 12; j++) { const xx = x + (w * j) / 12, [px, py] = P(xx, yy + Math.sin(ph + j * 0.8 + i) * 0.06, z); j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } }
        ctx.stroke(); break;
      }
      default: break;
    }
  }

  /** Mist over locked districts and over one that is opening: a soft dark pool centred on the district, thickest at its heart, with slow wisps. */
  drawFog(ctx, vz) {
    const t = this.vt;
    for (const id of vz) {
      const fx = this.fxOf(id); if (fx.fog <= 0.01) continue;
      const D = DIST[id], F = D.fp, [X, Y] = P(F[0] + F[2] / 2, F[1] + F[3] / 2, D.z + 24), R = (F[2] + F[3]) * 18;
      ctx.save(); ctx.translate(X, Y); ctx.scale(1, 0.62);
      const gr = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R); gr.addColorStop(0, `rgba(14,20,32,${0.55 * fx.fog})`); gr.addColorStop(0.55, `rgba(14,20,32,${0.4 * fx.fog})`); gr.addColorStop(1, 'rgba(14,20,32,0)');
      ctx.fillStyle = gr; ctx.fillRect(-R, -R, R * 2, R * 2);
      if (!this.far) { ctx.fillStyle = `rgba(120,135,160,${0.12 * fx.fog})`; for (let i = 0; i < 5; i++) { const u = (t / 26000 + i * 0.21) % 1, x = -R * 0.8 + R * 1.6 * u, y = Math.sin(i * 2.1) * R * 0.35; ctx.beginPath(); ctx.ellipse(x, y, R * 0.28, R * 0.07, 0, 0, 7); ctx.fill(); } }
      ctx.restore();
    }
  }

  drawStatic(ctx, p) {
    const fx = this.fxOf(p.zone), locked = this.unlocked ? !this.unlocked.has(p.zone) : false, z = p.z, env = this.env;
    if (p.t === 'gate' && !locked && p.gk !== 'ferry') return;
    ctx.save(); ctx.translate(0, -z);
    env.dim = fx.dim; env.night = Math.max(this.night, fx.lights); env.zoff = z; env.locked = locked;
    if (p.t === 'lamp' && env.night > 0.04) this.lights.push({ wx: sx(p.gx, p.gy), wy: sy(p.gx, p.gy, z + 28), r: 46, c: p.col ? rgbOf(p.col) : '255,222,140', a: 0.55 * env.night });
    if (p.t === 'board') env.boardText = this.boardText(p, locked);
    const polys = drawProp(ctx, p, env);
    ctx.restore();
    env.night = this.night; env.dim = 0;
    if (p.t === 'gate') {
      if (!locked) return;
      const x = sx(p.gx + 0.15, p.gy + 0.15), y = sy(p.gx + 0.15, p.gy + 0.15, z);
      this.hits.push({ kind: 'zone', id: p.zone, eid: 'gate:' + p.zone, label: p.label, zone: p.zone, locked: true, gate: DIST[p.zone].gate, circle: [x, y - 20, 26] });
      this.overlay.push({ wx: x, wy: y - 44, draw: (g, px, py, s) => this.chip(g, px, py, `Opens at ${money(DIST[p.zone].gate)}`, '#ffd36e', s) });
      return;
    }
    if (p.hot && polys) this.hits.push({ kind: 'static', id: p.hot, label: p.label, zone: p.zone, locked, polys: polys.map((q) => q.map(([x, y]) => [x, y - z])), p });
    if (p.t === 'depot' && this.env.tariff && !locked) this.drawTariff(ctx, p, z);
  }
  boardText(p, locked) {
    const g = this.g, z = p.zone; if (!g) return p.text;
    if (locked) return 'LOCKED ' + money(DIST[z].gate).toUpperCase();
    const n = (g.s.leads[z] || []).length;
    return this.env.surge && z < 5 ? 'TREND SURGE' : this.env.crunch ? 'CREDIT CRUNCH' : this.env.tariff ? 'TARIFF LOCK' : `${n} BUYERS`;
  }
  drawTariff(ctx, p, z) {
    ctx.save(); ctx.translate(0, -z);
    const [x, y] = P(p.gx - 0.3, p.gy + p.d / 2); ctx.fillStyle = '#ff5a4d'; ctx.fillRect(x - 4, y - 22, 8, 22); ctx.fillStyle = '#fff'; ctx.fillRect(x - 4, y - 16, 8, 3);
    ctx.restore();
  }

  posOf(e) {
    if (e.type === 'lead') return [e.x, e.y];
    if (e.type === 'lot') return SPOTS[e.zone].lots[Math.max(0, e.slot)];
    if (e.type === 'asset') return LAYOUT.stashPos(e.zone, e.slot);
    return [0, 0];
  }
  keyOf(e) {
    if (e.type === 'truck') { const [x, y] = this.truckPos(e); return x + y + 0.8; }
    const pl = PLOTS[e.zone][e.plot % PLOTS[e.zone].length]; return pl[0] + 1.5 + pl[1] + 1.5;
  }

  drawEnt(ctx, e) {
    const nh = this.hits.length, no = this.overlay.length;
    const alpha = e.gone ? clamp(1 - (this.t - e.goneAt) / 600, 0, 1) : 1;
    ctx.globalAlpha = alpha;
    if (e.type === 'lead') this.drawLead(ctx, e); else if (e.type === 'lot') this.drawLot(ctx, e); else if (e.type === 'asset') this.drawAsset(ctx, e);
    else if (e.type === 'pipe') this.drawPipe(ctx, e); else if (e.type === 'plot') this.drawPlot(ctx, e); else if (e.type === 'truck') this.drawTruck(ctx, e);
    ctx.globalAlpha = 1;
    if (e.gone) { this.hits.length = nh; this.overlay.length = no; } // a fading object takes no clicks and keeps no label
  }

  drawLead(ctx, e) {
    const z = zAt(e.x, e.y), [x, y] = P(e.x, e.y, z), B = BUYERS[e.seg], l = e.lead, calm = this.reduced();
    const hov = this.hover?.eid === e.id;
    if (e.leaving) ctx.globalAlpha = clamp(1 - (this.t - e.leaveAt) / 4200, 0.2, 1);
    if (this.far) { ctx.fillStyle = l?.need ? '#ffd36e' : e.look.shirt; ctx.fillRect(x - 2.5, y - 8, 5, 8); ctx.globalAlpha = 1; }
    else {
      if (l?.need && !e.leaving) { const k = 0.5 + 0.5 * Math.sin(this.vt / 300); ellipse(ctx, x, y + 1, 15 + 3 * k, 7 + 1.5 * k, `rgba(255,211,110,${0.28 + 0.2 * k})`); }
      person(ctx, x, y, hov ? 1.15 : 1, e.look, this.vt, e.moving, e.dir || 1);
      ctx.globalAlpha = 1;
    }
    void calm;
    if (!e.leaving && l) {
      this.hits.push({ eid: e.id, kind: 'lead', id: e.id.slice(5), zone: e.zone, label: `${B.name}${l.need ? ', urgent' : ''}`, circle: [x, y - 16, 20], lead: l });
      if (this.cam.z > 0.5 || hov) this.overlay.push({ wx: x, wy: y - 40, draw: (g, px, py, s) => this.leadBubble(g, px, py, s, B, l, hov) });
    }
  }
  drawLot(ctx, e) {
    const [gx, gy] = this.posOf(e), z = zAt(gx, gy), l = e.lot, [x, y0] = P(gx, gy, z), y = y0 - e.drop;
    const col = classColor(l.cls), hov = this.hover?.eid === e.id, auction = l.mode === 'auction';
    ellipse(ctx, x, y0 + 2, 17, 8, 'rgba(8,10,20,.3)');
    ctx.save(); ctx.translate(0, -z - e.drop);
    box(ctx, gx - 0.4, gy - 0.4, 0.8, 0.8, 4, tone('#8a6a45'));
    const f = box(ctx, gx - 0.34, gy - 0.34, 0.68, 0.68, 15, tone(l.cond === 'broken' ? shade(col, 0.7) : col), { z: 4, line: hov ? '#ffffff' : auction ? '#ffd36e' : 'rgba(0,0,0,.25)' });
    if (l.cond === 'broken') { ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.4; const a = facePoint(f.left, 0.2, 0.9), b = facePoint(f.left, 0.55, 0.25), c = facePoint(f.left, 0.8, 0.6); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); }
    ctx.restore();
    this.hits.push({ eid: e.id, kind: 'lot', id: e.id.slice(4), zone: e.zone, label: `${ASSETS[l.cls].name}${l.cond === 'broken' ? ' (broken)' : ''}${auction ? ' at auction' : ' for sale'}`, polys: [[[x - 18, y - 26], [x + 18, y - 26], [x + 18, y + 4], [x - 18, y + 4]]], lot: l });
    if (this.cam.z > 0.5) this.overlay.push({ wx: x, wy: y - 32, draw: (g, px, py, s) => this.tag(g, px, py, s, auction ? '🔨' : ASSETS[l.cls].icon, money(l.price), auction ? '#ffd36e' : '#46e38e', hov) });
  }
  drawAsset(ctx, e) {
    const [gx, gy] = this.posOf(e), z = zAt(gx, gy), a = e.asset, [x, y0] = P(gx, gy, z), y = y0 - e.drop;
    const sel = this.api.ui.sel.has(a.id), col = classColor(a.cls), hov = this.hover?.eid === e.id, bob = sel && !this.reduced() ? Math.sin(this.vt / 220) * 2 : 0;
    ellipse(ctx, x, y0 + 2, 15, 7, 'rgba(8,10,20,.3)');
    if (sel) { const k = 0.5 + 0.5 * Math.sin(this.vt / 250); ellipse(ctx, x, y0 + 1, 22 + 2 * k, 11 + k, `rgba(255,211,110,${0.5})`, '#ffd36e', 2); }
    ctx.save(); ctx.translate(0, -z - e.drop - bob);
    const wear = clamp(a.wear, 0.4, 1), c = a.cond === 'broken' ? shade(col, 0.65) : mix('#6a6f7c', col, wear);
    const f = box(ctx, gx - 0.36, gy - 0.36, 0.72, 0.72, 17, tone(c), { line: hov ? '#fff' : 'rgba(0,0,0,.3)' });
    if (a.cond === 'broken') { ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.4; const p1 = facePoint(f.left, 0.15, 0.85), p2 = facePoint(f.left, 0.5, 0.3), p3 = facePoint(f.left, 0.85, 0.7); ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.stroke(); if (!this.reduced() && !this.far) { const [sx0, sy0] = P(gx, gy, 18); for (let i = 0; i < 2; i++) { const k = ((this.vt / 900) + i / 2) % 1; ctx.fillStyle = `rgba(200,200,210,${0.4 * (1 - k)})`; ctx.beginPath(); ctx.arc(sx0 + k * 6, sy0 - k * 16, 2 + k * 4, 0, 7); ctx.fill(); } } }
    ctx.restore();
    this.hits.push({ eid: e.id, kind: 'asset', id: a.id, zone: e.zone, label: `${ASSETS[a.cls].name}${a.cond === 'broken' ? ' (broken)' : ''}, in your stock`, polys: [[[x - 16, y - 32 - bob], [x + 16, y - 32 - bob], [x + 16, y + 4], [x - 16, y + 4]]], asset: a });
    if (this.cam.z > 0.6 || sel || hov) this.overlay.push({ wx: x, wy: y - 36 - bob, draw: (g, px, py, s) => this.icon(g, px, py, s, ASSETS[a.cls].icon, sel) });
  }
  drawPlot(ctx, e) {
    const pl = PLOTS[e.zone][e.plot], D = DIST[e.zone], z = D.z, hov = this.hover?.eid === e.id, zl = e.zoneLocked;
    ctx.save(); ctx.translate(0, -z);
    diamond(ctx, pl[0], pl[1], 3, 3, e.locked ? '#2a2e38' : '#6a5a40', hov ? '#fff' : 'rgba(0,0,0,.35)', 0, hov ? 2 : 1);
    ctx.strokeStyle = e.locked ? '#7a7f88' : '#ffd36e'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); const [a, b, c, d] = [P(pl[0] + 0.2, pl[1] + 0.2), P(pl[0] + 2.8, pl[1] + 0.2), P(pl[0] + 2.8, pl[1] + 2.8), P(pl[0] + 0.2, pl[1] + 2.8)]; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    if (!this.far) for (const [cx, cy] of [[pl[0] + 0.3, pl[1] + 2.6], [pl[0] + 2.6, pl[1] + 2.6]]) { const [x, y] = P(cx, cy); quad(ctx, [[x - 4, y], [x + 4, y], [x, y - 14]], '#ff8a2b'); ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, y - 7, 4, 2); }
    ctx.restore();
    if (zl) return; // a plot in a district still under fog takes no clicks and keeps no chip
    const [x, y] = P(pl[0] + 1.5, pl[1] + 1.5, z);
    this.hits.push({ eid: e.id, kind: 'plot', id: `${e.zone}:${e.plot}`, zone: e.zone, label: e.locked ? 'Building plot (locked)' : 'Empty plot: hire a manager here', polys: [[P(pl[0], pl[1], z), P(pl[0] + 3, pl[1], z), P(pl[0] + 3, pl[1] + 3, z), P(pl[0], pl[1] + 3, z)]], locked: e.locked });
    if (this.cam.z > 0.5) this.overlay.push({ wx: x, wy: y - 20, draw: (g, px, py, s) => this.chip(g, px, py, e.locked ? 'Locked' : '+ Hire', e.locked ? '#a3b3c9' : '#ffd36e', s) });
  }
  drawPipe(ctx, e) {
    const p = e.pipe, pl = PLOTS[e.zone][e.plot % PLOTS[e.zone].length], D = DIST[e.zone], z = D.z, K = PIPE[p.kind], hov = this.hover?.eid === e.id;
    const floors = p.level, h = 26 + floors * 13, running = p.status === 'running', off = p.status === 'paused' || p.status === 'audit';
    const col = off ? '#6a707c' : { student: '#46a06a', broker: '#c9a227', logistics: '#4a8fb0' }[p.kind];
    ctx.save(); ctx.translate(0, -z - e.drop);
    diamond(ctx, pl[0], pl[1], 3, 3, '#59606e', null, 0);
    shadow(ctx, pl[0] + 0.3, pl[1] + 0.3, 2.4, 2.4, h);
    const f = box(ctx, pl[0] + 0.3, pl[1] + 0.3, 2.4, 2.4, h, tone(col), { z: 1, line: hov ? '#fff' : undefined });
    if (!this.far) {
      windows(ctx, f.left, 3, floors + 1, '#16264a', running ? 0.8 + 0.2 * this.night : this.night * 0.5); windows(ctx, f.right, 3, floors + 1, '#10203f', running ? 0.8 : this.night * 0.5);
      ctx.fillStyle = '#e8eef6'; ctx.font = '800 11px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center'; const sp = facePoint(f.left, 0.5, 0.04); ctx.fillText(K.icon, sp[0], sp[1] - 2);
    }
    box(ctx, pl[0] + 0.1, pl[1] + 0.1, 2.8, 2.8, 4, tone(shade(col, 0.8)), { z: h + 1 });
    if (running && !this.reduced() && !this.far) { cyl(ctx, pl[0] + 2.2, pl[1] + 0.8, 0.22, 16, tone('#6a6f78'), h + 5); const [cx, cy] = P(pl[0] + 2.2, pl[1] + 0.8, h + 21); for (let i = 0; i < 4; i++) { const k = ((this.vt / 1700) + i / 4) % 1; ctx.fillStyle = `rgba(235,240,250,${0.38 * (1 - k)})`; ctx.beginPath(); ctx.arc(cx + k * 10, cy - k * 38, 3 + k * 8, 0, 7); ctx.fill(); } }
    ctx.restore();
    const [x, y] = P(pl[0] + 1.5, pl[1] + 1.5, z);
    this.hits.push({ eid: e.id, kind: 'pipe', id: p.id, zone: e.zone, label: `${K.name}, level ${p.level}`, polys: [f.left, f.right, f.top].map((q) => q.map(([a, b]) => [a, b - z - e.drop])), pipe: p });
    const frac = p.inflight ? clamp((p.prog + (this.hourF() - this.g.s.hour)) / Math.max(1, p.len), 0, 1) : 0;
    this.overlay.push({ wx: x, wy: y - h - 14 - e.drop, draw: (g, px, py, s) => this.progress(g, px, py, s, frac, p, off) });
  }
  /** Where a freight truck is now: it leaves its depot door, drives the avenue's right-hand lane and arrives at the other district's door. */
  truckPos(e) {
    const f = e.f, to = f.to, from = e.from;
    if (!e.route || e.route.key !== from + '>' + to) { const pts = LAYOUT.truckRoute(from, to, this.unlocked) || [DIST[from].door, DIST[to].door]; e.route = { key: from + '>' + to, info: polyInfo(pts) }; }
    const g = this.g, hops = Math.abs(to - from), dur = Math.max(2, Math.round(6 * Math.min(2.5, 1 + 0.1 * (hops - 1)) * (1 - (g?.P?.freightSpeed || 0))));
    let p = clamp((this.hourF() - (f.arrive - dur)) / dur, 0, f.checked && f.arrive > this.hourF() ? 0.97 : 1); // held at the border while customs looks
    p = Math.max(e.maxP || 0, p); e.maxP = p;
    const q = polyAt(e.route.info, p * e.route.info.len);
    e.dirY = Math.abs(q.dy) > Math.abs(q.dx); e.hd = Math.sign(e.dirY ? q.dy : q.dx) || 1;
    return [q.x, q.y];
  }
  drawTruck(ctx, e) {
    const [gx, gy] = this.truckPos(e), z = zAt(gx, gy), [x, y] = P(gx, gy, z), alongY = e.dirY, blocked = this.env.tariff, big = this.far ? 1.6 : 1;
    ctx.save(); ctx.translate(0, -z);
    const w = (alongY ? 0.8 : 1.7) * big, d = (alongY ? 1.7 : 0.8) * big;
    shadow(ctx, gx - w / 2, gy - d / 2, w, d, 16, 0.25);
    box(ctx, gx - w / 2, gy - d / 2, w, d, 16, tone('#e8eef6'), { z: 3 });
    const lead = e.hd < 0 ? -0.85 : 0.35;
    const cab = alongY ? [gx - 0.4 * big, gy + lead * big, 0.8 * big, 0.5 * big] : [gx + lead * big, gy - 0.4 * big, 0.5 * big, 0.8 * big];
    box(ctx, cab[0], cab[1], cab[2], cab[3], 12, tone('#2f80ed'), { z: 3 });
    if (!this.far) for (const [ox, oy] of [[-0.25, -0.6], [0.25, 0.6], [-0.25, 0.6], [0.25, -0.6]]) { const [wx, wy] = P(gx + (alongY ? ox : oy), gy + (alongY ? oy : ox), 0); ellipse(ctx, wx, wy - 2, 3.4, 3.4, '#10141c'); }
    ctx.restore();
    if (!this.reduced() && !blocked && !this.far) for (let i = 0; i < 2; i++) { const k = ((this.vt / 500) + i / 2) % 1; ctx.fillStyle = `rgba(210,215,225,${0.3 * (1 - k)})`; ctx.beginPath(); ctx.arc(x + (alongY ? e.hd : -e.hd) * (8 + k * 14), y - 6 - k * 6, 2 + k * 3, 0, 7); ctx.fill(); }
    this.hits.push({ eid: e.id, kind: 'truck', id: e.f.id, zone: 0, label: `Freight run to ${ZONES[e.f.to].short}`, circle: [x, y - 12, 20 * big] });
    this.overlay.push({ wx: x, wy: y - 40, draw: (g, px, py, s) => this.chip(g, px, py, `${e.f.items.length} crate${e.f.items.length > 1 ? 's' : ''} to ${ZONES[e.f.to].short}`, '#ffd36e', s) });
  }
  /** Traffic on the open roads between districts: cars shuttle along them in both lanes and fade in and out at the ends. */
  cars() {
    const out = [];
    for (let i = 0; i < 18; i++) {
      const e = CAR_EDGES[(i * 7) % CAR_EDGES.length]; if (this.unlocked && !this.unlocked.has(e.gate)) continue;
      const fwd = i % 2 === 0, u = (i * 0.137 + this.t * (0.00008 + (i % 5) * 0.00001)) % 1, s = fwd ? u * e.len : (1 - u) * e.len, a = polyAt(e, s), k = (fwd ? 0.5 : -0.5);
      const x = a.x - a.dy * k, y = a.y + a.dx * k;
      out.push({ gx: x, gy: y, i, key: x + y + 0.4, horiz: Math.abs(a.dx) > Math.abs(a.dy), fade: clamp(Math.min(s, e.len - s) / 6, 0, 1) });
    }
    return out;
  }
  drawCar(ctx, c) {
    const z = zAt(c.gx, c.gy), cols = ['#c0392b', '#2f80ed', '#f2c94c', '#9b51e0', '#27ae60', '#e8eef6'], col = cols[c.i % 6], w = c.horiz ? 1.1 : 0.56, d = c.horiz ? 0.56 : 1.1;
    ctx.save(); ctx.translate(0, -z); ctx.globalAlpha = c.fade;
    box(ctx, c.gx - w / 2, c.gy - d / 2, w, d, 8, tone(col), { z: 2 });
    if (!this.far) box(ctx, c.gx - w * 0.22, c.gy - d * 0.22, w * 0.44, d * 0.44, 7, tone(shade(col, 0.9)), { z: 10 });
    if (this.night > 0.3 && !this.far) { const [x, y] = P(c.gx, c.gy, 6); this.lights.push({ wx: x, wy: y - z, r: 26, c: '255,240,190', a: 0.5 * this.night }); }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  drawPlayer(ctx) {
    const pl = this.player, z = zAt(pl.x, pl.y), [x, y] = P(pl.x, pl.y, z);
    const look = { shirt: '#c0392b', hair: '#222', skin: '#f1c27d', pants: '#27324a' };
    const k = 0.5 + 0.5 * Math.sin(this.vt / 400);
    ellipse(ctx, x, y + 1, 16, 7.5, `rgba(255,211,110,${0.3 + 0.15 * k})`, '#ffd36e', 1.5);
    person(ctx, x, y, 1.3, look, this.vt, pl.moving, pl.dir);
    this.overlay.push({ wx: x, wy: y - 48, draw: (g, px, py, s) => this.chip(g, px, py, 'You', '#ffd36e', s) });
  }
  drawHover(ctx) {
    const h = this.hover; ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 / this.cam.z; ctx.shadowColor = '#ffd36e'; ctx.shadowBlur = 10;
    if (h.circle) { ctx.beginPath(); ctx.ellipse(h.circle[0], h.circle[1] + 14, 18, 8, 0, 0, 7); ctx.stroke(); } else if (h.kind === 'static' || h.kind === 'plot' || h.kind === 'zone') for (const poly of h.polys) { ctx.beginPath(); poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke(); }
    ctx.restore();
  }

  // ------------------------------------------------------------------ screen-space passes
  drawLight(ctx) {
    const boost = Object.keys(this.reveal).length > 0;
    if (this.night < 0.04 && !boost) return;
    ctx.save();
    if (this.night >= 0.04) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgb(${255 - 150 * this.night}, ${255 - 130 * this.night}, ${255 - 70 * this.night})`; ctx.fillRect(0, 0, this.W, this.H); }
    ctx.globalCompositeOperation = 'lighter';
    const cap = this.lite ? 40 : 160; let n = 0;
    for (const l of this.lights) { if (n++ > cap) break; const [x, y] = this.w2s(l.wx, l.wy), r = l.r * this.cam.z; if (x < -r || x > this.W + r || y < -r || y > this.H + r) continue; const g = ctx.createRadialGradient(x, y, 1, x, y, r); g.addColorStop(0, `rgba(${l.c},${l.a})`); g.addColorStop(1, `rgba(${l.c},0)`); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
    ctx.restore();
  }
  drawWeather(ctx) {
    const { W, H } = this;
    if (this.env.crunch) { ctx.fillStyle = 'rgba(60,66,80,.3)'; ctx.fillRect(0, 0, W, H); if (this.rain) { ctx.strokeStyle = 'rgba(190,210,235,.4)'; ctx.lineWidth = 1; ctx.beginPath(); for (const r of this.rain) { const x = r[0] * W, y = r[1] * H; ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 11); } ctx.stroke(); } }
    if (this.env.surge && !this.reduced()) { const k = this.vt / 1000; for (let i = 0; i < 26; i++) { const x = (i * 97 + Math.sin(k + i) * 24) % W, y = ((k * 40 + i * 53) % (H + 20)) - 10; ctx.fillStyle = ['#ff3da8', '#7be3ff', '#ffd36e'][i % 3]; ctx.globalAlpha = 0.55; ctx.fillRect(x, y, 5, 5); } ctx.globalAlpha = 1; }
    if (this.env.surge) { ctx.fillStyle = 'rgba(255,61,168,.07)'; ctx.fillRect(0, 0, W, H); }
    if (this.env.tariff) { ctx.fillStyle = 'rgba(255,80,60,.05)'; ctx.fillRect(0, 0, W, H); }
  }
  drawOverlay(ctx) {
    const s = clamp(this.cam.z, 0.75, 1.25);
    for (const o of this.overlay) { const [x, y] = this.w2s(o.wx, o.wy); if (x < -80 || x > this.W + 80 || y < -40 || y > this.H + 40) continue; o.draw(ctx, x, y, s); }
    if (this.mode === 'world' && this.cam.z < 0.8) this.drawZoneTags(ctx);
    for (const p of this.parts) {
      const [x, y] = this.w2s(sx(p.gx, p.gy), sy(p.gx, p.gy, p.z + (p.k === 'text' && !this.reduced() ? p.age * 26 : 0)));
      const a = clamp(1 - p.age / p.life, 0, 1);
      if (p.k === 'text') { ctx.globalAlpha = a; ctx.font = `800 ${Math.round(15 * s)}px ui-monospace, Menlo, monospace`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(8,10,20,.85)'; ctx.strokeText(p.text, x, y); ctx.fillStyle = p.color; ctx.fillText(p.text, x, y); ctx.globalAlpha = 1; }
      else { const rise = this.reduced() ? 0 : (p.up * p.age - 80 * p.age * p.age) * this.cam.z; ctx.globalAlpha = a; ctx.fillStyle = '#ffd36e'; ctx.fillRect(x + p.vx * p.age * this.cam.z, y - rise, 5, 5); ctx.fillStyle = '#b8860b'; ctx.fillRect(x + p.vx * p.age * this.cam.z + 1, y - rise + 1, 3, 3); ctx.globalAlpha = 1; }
    }
  }
  /** Name tags over each visible district while zoomed out, so you always know where you are. */
  drawZoneTags(ctx) {
    for (const id of LAYOUT.ids) {
      const D = DIST[id], [x, y] = this.w2s(sx(D.cx, D.cy), sy(D.cx, D.cy, D.z) - 70);
      if (x < -120 || x > this.W + 120 || y < -30 || y > this.H + 30) continue;
      const open = this.unlocked?.has(id) ?? true;
      this.chip(ctx, x, y, `${open ? '' : '\u{1F512} '}${id}  ${D.short}`, open ? D.pal[1] : '#a3b3c9', 1);
    }
  }
  chip(g, x, y, text, color = '#ffd36e', s = 1) {
    g.font = `700 ${Math.round(11 * s)}px ui-monospace, Menlo, monospace`; const w = g.measureText(text).width + 14 * s, h = 18 * s;
    roundRect(g, x - w / 2, y - h / 2, w, h, 5 * s); g.fillStyle = 'rgba(16,20,28,.9)'; g.fill(); g.strokeStyle = color; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 0.5); g.textBaseline = 'alphabetic';
  }
  icon(g, x, y, s, icon, sel) {
    const r = 12 * s; g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = sel ? '#ffd36e' : 'rgba(16,20,28,.9)'; g.fill(); g.strokeStyle = sel ? '#ffffff' : '#5b6b85'; g.lineWidth = 1.5; g.stroke();
    g.font = `${Math.round(14 * s)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(icon, x, y + 1); g.textBaseline = 'alphabetic';
  }
  tag(g, x, y, s, icon, text, color, hov) {
    g.font = `800 ${Math.round(11 * s)}px ui-monospace, Menlo, monospace`; const w = g.measureText(text).width + 30 * s, h = 20 * s;
    roundRect(g, x - w / 2, y - h / 2, w, h, 6 * s); g.fillStyle = 'rgba(16,20,28,.92)'; g.fill(); g.strokeStyle = hov ? '#ffffff' : color; g.lineWidth = 1.5; g.stroke();
    g.font = `${Math.round(13 * s)}px system-ui, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(icon, x - w / 2 + 5 * s, y + 1);
    g.font = `800 ${Math.round(11 * s)}px ui-monospace, Menlo, monospace`; g.fillStyle = color; g.fillText(text, x - w / 2 + 22 * s, y + 1); g.textBaseline = 'alphabetic';
  }
  leadBubble(g, x, y, s, B, l, hov) {
    const text = money(l.budget), urgent = !!l.need;
    g.font = `800 ${Math.round(11 * s)}px ui-monospace, Menlo, monospace`; const w = g.measureText(text).width + 32 * s, h = 22 * s;
    const bob = this.reduced() ? 0 : Math.sin(this.vt / 500 + l.born) * 1.5;
    roundRect(g, x - w / 2, y - h + bob, w, h, 7 * s); g.fillStyle = 'rgba(16,20,28,.94)'; g.fill(); g.strokeStyle = urgent ? '#ffd36e' : hov ? '#ffffff' : '#5b6b85'; g.lineWidth = urgent ? 2 : 1.5; g.stroke();
    g.beginPath(); g.moveTo(x - 4 * s, y + bob); g.lineTo(x + 4 * s, y + bob); g.lineTo(x, y + 6 * s + bob); g.fill();
    g.font = `${Math.round(14 * s)}px system-ui, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(B.icon, x - w / 2 + 5 * s, y - h / 2 + 1 + bob);
    g.font = `800 ${Math.round(11 * s)}px ui-monospace, Menlo, monospace`; g.fillStyle = urgent ? '#ffd36e' : '#e8eef6'; g.fillText(text, x - w / 2 + 23 * s, y - h / 2 + 1 + bob);
    if (urgent) { g.fillStyle = '#ffd36e'; g.beginPath(); g.arc(x + w / 2 - 2, y - h + 2 + bob, 7 * s, 0, 7); g.fill(); g.fillStyle = '#1a1303'; g.font = `900 ${Math.round(11 * s)}px ui-monospace, Menlo, monospace`; g.textAlign = 'center'; g.fillText('!', x + w / 2 - 2, y - h + 3 + bob); }
    g.textBaseline = 'alphabetic';
  }
  progress(g, x, y, s, frac, p, off) {
    const w = 54 * s, h = 7 * s;
    g.fillStyle = 'rgba(16,20,28,.92)'; roundRect(g, x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, 3); g.fill();
    g.fillStyle = off ? '#7a7f88' : p.starved ? '#ff7d75' : '#ffc247'; g.fillRect(x - w / 2, y - h / 2, w * frac, h);
    g.font = `${Math.round(12 * s)}px system-ui, sans-serif`; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(p.status === 'audit' ? '📋' : p.status === 'paused' ? '⏸' : p.starved ? '❗' : '', x, y - 8 * s);
  }

  // ------------------------------------------------------------------ map mode
  /** The overworld: every road as a route line between district nodes (gold as far as you have opened, grey and dashed beyond, blue for the ferry), and the four regions named. */
  drawMapRoute(ctx) {
    const g = this.g; if (!g) return;
    const proj = (x, y) => this.w2s(sx(x, y), sy(x, y, zAt(x, y)) - 4);
    const trace = (e) => { ctx.beginPath(); e.pts.forEach(([x, y], i) => { const [X, Y] = proj(x, y); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke(); };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([]); ctx.strokeStyle = 'rgba(8,12,20,.6)'; ctx.lineWidth = 9;
    for (const e of EDGES) if (!e.path) trace(e);
    for (const e of EDGES) {
      const open = this.unlocked.has(e.gate);
      if (e.path) { ctx.strokeStyle = 'rgba(230,220,190,.55)'; ctx.lineWidth = 2; ctx.setLineDash([2, 6]); }
      else if (e.ferry) { ctx.strokeStyle = open ? '#7be3ff' : 'rgba(123,227,255,.45)'; ctx.lineWidth = 3; ctx.setLineDash([8, 8]); }
      else if (open) { ctx.strokeStyle = 'rgba(255,211,110,.95)'; ctx.lineWidth = 4; ctx.setLineDash([]); }
      else { ctx.strokeStyle = 'rgba(163,179,201,.75)'; ctx.lineWidth = 3; ctx.setLineDash([4, 8]); }
      trace(e);
    }
    ctx.setLineDash([]);
    ctx.restore();
    const D1 = DIST[1], D16 = DIST[16], [x1, y1] = proj(D1.ox - 3, D1.cy), [x2, y2] = proj(D16.ox + BW / 2, D16.oy - 4);
    this.chip(ctx, x1, y1 - 16, 'START', '#ffd36e', 1.05); this.chip(ctx, x2, y2 - 12, 'THE TOP', this.unlocked.has(16) ? '#ffd36e' : '#a3b3c9', 1.05);
  }
  drawMapLabels(ctx) {
    const g = this.g; if (!g) return; const s = g.s, compact = this.W < 760;
    this.hitsLabel = {};
    for (const id of LAYOUT.ids) {
      const D = DIST[id], open = this.unlocked.has(id), cur = id === this.api.ui.zone, hov = this.hover?.id === id && this.hover.kind === 'zone';
      const [cx, cy] = this.w2s(sx(D.cx, D.cy), sy(D.cx, D.cy, D.z) - 6);
      const stock = s.assets.filter((a) => a.zone === id).length, leads = (s.leads[id] || []).length;
      const l1 = `${open ? '' : '\u{1F512} '}${id}  ${compact ? D.short : D.name}`, l2 = open ? `${leads} buyers  ${stock} crates` : `opens at ${money(D.gate)}`;
      ctx.font = '800 12px ui-monospace, Menlo, monospace'; const w1 = ctx.measureText(l1).width; ctx.font = '600 10px ui-monospace, Menlo, monospace'; const w2 = ctx.measureText(l2).width;
      const w = Math.max(w1, compact ? 0 : w2) + 34, h = compact ? 24 : 38;
      const x = clamp(cx - w / 2, 4, this.W - w - 4), y = clamp(cy - h / 2, 4, this.H - h - 4);
      ctx.globalAlpha = open ? 1 : 0.88;
      roundRect(ctx, x, y, w, h, 7); ctx.fillStyle = 'rgba(16,20,28,.94)'; ctx.fill(); ctx.strokeStyle = cur || hov ? '#ffd36e' : open ? D.pal[1] : '#5b6b85'; ctx.lineWidth = cur || hov ? 3 : 1.6; ctx.stroke();
      ctx.fillStyle = D.pal[1]; ctx.fillRect(x + 1, y + 6, 4, h - 12);
      ctx.font = '16px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(D.icon, x + 10, y + h / 2 + 1);
      ctx.font = '800 12px ui-monospace, Menlo, monospace'; ctx.fillStyle = open ? '#ffd36e' : '#a3b3c9'; ctx.fillText(l1, x + 30, y + (compact ? h / 2 + 1 : 13));
      if (!compact) { ctx.font = '600 10px ui-monospace, Menlo, monospace'; ctx.fillStyle = open ? '#e8eef6' : '#a3b3c9'; ctx.fillText(l2, x + 30, y + 27); }
      ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
      this.hitsLabel[id] = [x, y, w, h];
    }
    // the four regions of the journey, written under their districts
    ctx.save(); ctx.textAlign = 'center'; ctx.font = '800 17px ui-monospace, Menlo, monospace'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(8,12,20,.8)';
    for (const R of REGIONS) {
      const pts = R.ids.map((i) => this.w2s(sx(DIST[i].cx, DIST[i].cy), sy(DIST[i].cx, DIST[i].cy, DIST[i].z))), X = pts.reduce((a, q) => a + q[0], 0) / pts.length, Y = Math.max(...pts.map((q) => q[1])) + 54, text = `${R.id}  ${R.name.toUpperCase()}`;
      ctx.strokeText(text, X, Y); ctx.fillStyle = R.tint; ctx.fillText(text, X, Y);
    }
    ctx.restore();
  }
  /** The island's land, painted once into a small canvas (the minimap's backdrop). */
  miniBase() {
    if (this.mb) return this.mb;
    const c = document.createElement('canvas'); c.width = 150; c.height = 96; const g = c.getContext('2d'), b = this.bounds();
    g.fillStyle = '#10203a'; g.fillRect(0, 0, 150, 96);
    for (let j = 0; j < GH; j += 2) for (let i = 0; i < GW; i += 2) { const k = j * GW + i; if (!LAYOUT.land[k]) continue; g.fillStyle = LAYOUT.tcol[k] || '#4b7a4e'; g.fillRect((((i - j) * 32 - b.x0) / (b.x1 - b.x0)) * 150, (((i + j) * 16 - LAYOUT.ZV[j * LAYOUT.VW + i] - b.y0) / (b.y1 - b.y0)) * 96, 2.2, 1.6); }
    return (this.mb = c);
  }
  drawMini() {
    const m = this.mini, c = this.mctx, W = 150, H = 96, b = this.bounds();
    if (m.offsetParent === null) return; // hidden on phones: do not paint it
    c.clearRect(0, 0, W, H); c.drawImage(this.miniBase(), 0, 0);
    const px = (x) => (x - b.x0) / (b.x1 - b.x0) * W, py = (y) => (y - b.y0) / (b.y1 - b.y0) * H;
    for (const id of LAYOUT.ids) { const D = DIST[id], F = D.fp, pts = [[F[0], F[1]], [F[0] + F[2], F[1]], [F[0] + F[2], F[1] + F[3]], [F[0], F[1] + F[3]]].map(([gx, gy]) => [px(sx(gx, gy)), py(sy(gx, gy, D.z))]); c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fillStyle = this.unlocked?.has(id) ? D.cols.ground : 'rgba(20,26,40,.85)'; c.fill(); if (id === this.api.ui.zone) { c.strokeStyle = '#ffd36e'; c.lineWidth = 1.5; c.stroke(); } }
    for (const e of this.ents.values()) { if (e.type === 'lead' && !e.leaving) { c.fillStyle = e.lead?.need ? '#ffd36e' : '#e8eef6'; c.fillRect(px(sx(e.x, e.y)) - 1, py(sy(e.x, e.y, zAt(e.x, e.y))) - 1, 2, 2); } else if (e.type === 'pipe') { const pl = PLOTS[e.zone][e.plot % PLOTS[e.zone].length]; c.fillStyle = '#46e38e'; c.fillRect(px(sx(pl[0] + 1.5, pl[1] + 1.5)) - 2, py(sy(pl[0] + 1.5, pl[1] + 1.5, DIST[e.zone].z)) - 2, 4, 4); } }
    const pl = this.player; c.fillStyle = '#ffd36e'; c.fillRect(px(sx(pl.x, pl.y)) - 2, py(sy(pl.x, pl.y, zAt(pl.x, pl.y))) - 2, 4, 4);
    if (this.view) { c.strokeStyle = '#ffffff'; c.lineWidth = 1; c.strokeRect(px(this.cam.x - this.W / 2 / this.cam.z), py(this.cam.y - this.H / 2 / this.cam.z), (this.W / this.cam.z) / (b.x1 - b.x0) * W, (this.H / this.cam.z) / (b.y1 - b.y0) * H); }
  }

  // ------------------------------------------------------------------ tutorial anchors
  /** World-space box [x0, y0, x1, y1] of an entity, or null when there is no such thing. */
  boxOf(kind, id) {
    id = String(id);
    const around = (x, y, l, t, r, b) => [x - l, y - t, x + r, y + b];
    if (kind === 'lead') { const e = this.ents.get('lead:' + id); if (!e) return null; const [x, y] = P(e.x, e.y, zAt(e.x, e.y)); return around(x, y, 14, 40, 14, 4); }
    if (kind === 'lot') { const e = this.ents.get('lot:' + id); if (!e || e.gone) return null; const [gx, gy] = this.posOf(e), [x, y] = P(gx, gy, zAt(gx, gy)); return around(x, y, 18, 28, 18, 6); }
    if (kind === 'asset') { const e = this.ents.get('asset:' + id); if (!e || e.gone) return null; const [gx, gy] = this.posOf(e), [x, y] = P(gx, gy, zAt(gx, gy)); return around(x, y, 16, 34, 16, 6); }
    if (kind === 'pipe') { const e = this.ents.get('pipe:' + id); if (!e) return null; const pl = PLOTS[e.zone][e.plot % PLOTS[e.zone].length], z = DIST[e.zone].z; return footBox(pl[0], pl[1], 3, 3, z, 26 + e.pipe.level * 13); }
    if (kind === 'plot') {
      let zs = id.includes(':') ? id.split(':').map(Number) : [this.api.ui.zone, +id];
      const pl = PLOTS[zs[0]]?.[zs[1]]; if (!pl) return null; return footBox(pl[0], pl[1], 3, 3, DIST[zs[0]].z, 4);
    }
    if (kind === 'static') { const p = HOT.get(id); return p ? footBox(p.gx, p.gy, p.w, p.d, p.z, p.h + 6) : null; }
    if (kind === 'zone') { const D = DIST[+id]; return D ? footBox(D.fp[0], D.fp[1], D.fp[2], D.fp[3], D.z, 4) : null; }
    if (kind === 'truck') { const e = this.ents.get('truck:' + id); if (!e) return null; const [gx, gy] = this.truckPos(e), [x, y] = P(gx, gy, zAt(gx, gy)); return around(x, y, 24, 28, 24, 6); }
    return null;
  }
  /**
   * The current on-screen rectangle {x, y, w, h} (CSS pixels, relative to the canvas) of a thing in the world, for coach marks.
   * kind: 'lead' | 'lot' | 'asset' | 'pipe' | 'plot' ("zone:n" or n in the current district) | 'static' (hot id such as 'hq:5', 'bank', 'board:3') | 'zone' | 'truck'.
   * Returns null when there is no such thing or none of it is on screen. The rectangle is not clipped: a partly visible thing keeps its full size.
   */
  rectOf(kind, id) {
    const b = this.boxOf(kind, id); if (!b) return null;
    const [x0, y0] = this.w2s(b[0], b[1]), [x1, y1] = this.w2s(b[2], b[3]);
    if (x1 < 0 || y1 < 0 || x0 > this.W || y0 > this.H) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /** Everything clickable right now, for the keyboard-accessible list view. */
  hotspots() {
    const g = this.g, out = [];
    if (!g) return out;
    for (const e of this.ents.values()) {
      if (e.gone || e.leaving) continue;
      if (e.type === 'lead') out.push({ kind: 'lead', id: e.id.slice(5), zone: e.zone, label: `${BUYERS[e.lead.seg].name} wants a deal${e.lead.need ? ', urgent' : ''}: pays up to ${money(e.lead.budget)}` });
      else if (e.type === 'lot') out.push({ kind: 'lot', id: e.id.slice(4), zone: e.zone, label: `Buy ${ASSETS[e.lot.cls].name}${e.lot.cond === 'broken' ? ' (broken)' : ''} for ${money(e.lot.price)}${e.lot.mode === 'auction' ? ' at auction' : ''}` });
      else if (e.type === 'asset') out.push({ kind: 'asset', id: e.asset.id, zone: e.zone, label: `${this.api.ui.sel.has(e.asset.id) ? 'Deselect' : 'Select'} ${ASSETS[e.asset.cls].name} (${money(g.val(e.asset))})` });
      else if (e.type === 'pipe') out.push({ kind: 'pipe', id: e.pipe.id, zone: e.zone, label: `Edit ${PIPE[e.pipe.kind].name}, level ${e.pipe.level}, ${e.pipe.status}` });
      else if (e.type === 'plot' && !e.locked) out.push({ kind: 'plot', id: `${e.zone}:${e.plot}`, zone: e.zone, label: `Hire a manager on plot ${e.plot + 1}` });
    }
    for (const p of SCENERY) if (p.hot) out.push({ kind: 'static', id: p.hot, zone: p.zone, label: p.label, locked: this.unlocked ? !this.unlocked.has(p.zone) : false });
    return out;
  }
}

const rgbOf = (h) => { const n = parseInt(h.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };
const footBox = (gx, gy, w, d, z, h) => [(gx - gy - d) * HW - 6, (gx + gy) * HH - z - h - 6, (gx + w - gy) * HW + 6, (gx + w + gy + d) * HH - z + 4];
const blockPoly = (D) => [P(D.ox, D.oy, D.z), P(D.ox + BW, D.oy, D.z), P(D.ox + BW, D.oy + BD, D.z), P(D.ox, D.oy + BD, D.z)];

function inPoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; }
  return c;
}
