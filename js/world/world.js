// The 2.5D world: an isometric island that mirrors the live game. Canvas 2D only; no assets, no dependencies.
//   - every game object is something you can see: buyers walk in, lots and stock are crates, pipelines are buildings, freight is trucks
//   - the virtual hour sets the light, macro shocks set the weather
//   - clicking a thing performs the real action through api.activate()
import { ASSETS, BUYERS, PIPE, PIPE_RULES, ZONES, PROFILES, TOTAL_HOURS } from '../config.js';
import { P, sx, sy, toGrid, box, quad, shadow, ellipse, cyl, person, tone, shade, mix, clamp, lerp, ease, roundRect, diamond, windows, facePoint, h2, strHash } from './iso.js';
import { LAND, ELEV, DIST, SPOTS, PLOTS, DOORS, LANE, SCENERY, BUILD, zAt, zoneAt, isAvenue, isStreet, isRoad, groundColor, stashPos, inLand } from './layout.js';
import { drawProp } from './props.js';

const TAG_COLOR = { tool: '#a0a6ad', office: '#d9d2c0', prestige: '#7a5fb0', paper: '#e8e2cc', retro: '#b07a3a', electronics: '#4a8fb0', vehicle: '#b0493a', consumer: '#c45f7a', trend: '#ff3da8', scrap: '#6b5a4a', industrial: '#8a7a62', training: '#46a06a', digital: '#7be3ff', b2b: '#5a6fb0', franchise: '#e8cd6a', infra: '#6a5fa0' };
const classColor = (cls) => TAG_COLOR[ASSETS[cls].tags[0]] || '#a07a45';
const SHIRTS = ['#c0392b', '#2f80ed', '#27ae60', '#9b51e0', '#f2994a', '#16a085', '#d35400', '#8e44ad', '#2980b9', '#c0762b'];
const HAIR = ['#2b1b10', '#7a3b12', '#c9a26a', '#555555', '#111111'];
const lookOf = (id) => { const h = strHash(String(id)); return { shirt: SHIRTS[h % SHIRTS.length], hair: HAIR[(h >> 4) % HAIR.length], skin: ['#f1c27d', '#e0ac69', '#c68642', '#8d5524'][(h >> 8) % 4], pants: ['#27324a', '#3b3b3b', '#4a3b2c'][(h >> 12) % 3] }; };
const compact = (v) => (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e4 ? Math.round(v / 1e3) + 'k' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : v >= 100 ? String(Math.round(v)) : v.toFixed(v < 10 ? 2 : 0));
const money = (v) => '$' + compact(v);

export class World {
  /** @param {{session, ui, activate:(hit)=>void, hover?:(hit,ev)=>void}} api */
  constructor(api) {
    this.api = api;
    this.cv = document.createElement('canvas');
    this.cv.className = 'worldcv'; this.cv.tabIndex = 0;
    this.cv.setAttribute('role', 'application');
    this.cv.setAttribute('aria-label', 'Isometric world. Drag to look around, Ctrl and scroll to zoom, arrow keys to pan. Every object here is also in the list below the map.');
    this.ctx = this.cv.getContext('2d');
    this.mini = document.createElement('canvas'); this.mini.className = 'worldmini'; this.mini.setAttribute('aria-hidden', 'true'); this.mctx = this.mini.getContext('2d');
    this.cam = { x: 0, y: 0, z: 0.9 }; this.camTo = null;
    this.mode = 'world';
    this.W = 800; this.H = 500; this.dpr = 1;
    this.ents = new Map(); this.parts = []; this.lights = []; this.hits = []; this.overlay = [];
    this.hover = null; this.focusKey = null; this.t = 0; this.last = 0; this.night = 0; this.fps = 30; this.slow = 0;
    this.player = { x: 8.8, y: 46.2, path: [], zone: 1, moving: false, dir: 1 };
    this.env = { t: 0, night: 0, wind: 1, dim: 0, surge: false, crunch: false, tariff: false };
    this.running = false; this.dirty = true; this.pointers = new Map(); this.drag = null; this.rain = null; this.labelFor = {};
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
  resize() {
    const r = this.host.getBoundingClientRect(); if (!r.width) return;
    this.W = Math.max(300, Math.floor(r.width)); this.H = Math.max(260, Math.floor(r.height));
    this.dpr = Math.min(2, window.devicePixelRatio || 1) * (this.slow > 2 ? 0.75 : 1);
    this.cv.width = Math.floor(this.W * this.dpr); this.cv.height = Math.floor(this.H * this.dpr);
    this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px';
    this.dirty = true;
    if (this.g && this.unlocked) this.draw(); // a resized canvas is blank until redrawn: never show that gap
  }

  // ------------------------------------------------------------------ camera
  bounds() { return { x0: sx(LAND.x0, LAND.y1) - 40, x1: sx(LAND.x1, LAND.y0) + 40, y0: sy(LAND.x0, LAND.y0, ELEV[3]) - 230, y1: sy(LAND.x1, LAND.y1) + 60 }; }
  fitZoom() { const b = this.bounds(); return Math.min(this.W / (b.x1 - b.x0), this.H / (b.y1 - b.y0)) * 0.98; }
  zoomRange() { return this.mode === 'map' ? [this.fitZoom() * 0.9, 1.4] : [Math.min(0.5, this.fitZoom()), 2.4]; }
  fit(animate = true) {
    const b = this.bounds(); this.goTo((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, this.fitZoom(), animate);
  }
  focusZone(z, animate = true) {
    const d = DIST[z], zoom = clamp(this.W / 1150, 0.62, 1.3);
    this.goTo(sx(d.cx, d.cy), sy(d.cx, d.cy, zAt(d.cy)) - 30, zoom, animate);
  }
  goTo(x, y, z, animate = true) {
    if (!animate || this.reduced()) { this.cam = { x, y, z }; this.camTo = null; } else this.camTo = { x, y, z, t0: this.t, from: { ...this.cam }, dur: 650 };
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
  setMode(m) { if (m === this.mode) return; this.mode = m; if (m === 'map') this.fit(true); else this.focusZone(this.api.ui.zone, true); this.dirty = true; }

  // ------------------------------------------------------------------ input
  bindInput() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => {
      try { cv.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      this.drag = { moved: false, x: e.offsetX, y: e.offsetY, cx: this.cam.x, cy: this.cam.y, pinch: this.pointers.size > 1 ? this.pinchDist() : 0, mid: this.pointers.size > 1 ? this.pinchMid() : null, z: this.cam.z };
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
      const wasDrag = this.drag?.moved;
      this.pointers.delete(e.pointerId);
      if (!this.pointers.size) { cv.style.cursor = this.hover ? 'pointer' : 'grab'; if (this.drag && !wasDrag && e.type === 'pointerup') { const h = this.pick(e.offsetX, e.offsetY); if (h) this.api.activate(h, e); else this.api.activate(null, e, this.groundAt(e.offsetX, e.offsetY)); } this.drag = null; }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { if (!this.drag) { this.hover = null; this.api.hover?.(null); this.dirty = true; } });
    cv.addEventListener('wheel', (e) => { if (!(e.ctrlKey || e.metaKey || e.altKey)) return; e.preventDefault(); this.zoomBy(Math.exp(-e.deltaY * 0.0022), e.offsetX, e.offsetY); }, { passive: false });
    cv.addEventListener('keydown', (e) => {
      const step = 60 / this.cam.z; let h = true;
      if (e.key === 'ArrowLeft') this.cam.x -= step; else if (e.key === 'ArrowRight') this.cam.x += step; else if (e.key === 'ArrowUp') this.cam.y -= step; else if (e.key === 'ArrowDown') this.cam.y += step;
      else if (e.key === '+' || e.key === '=') this.zoomBy(1.2); else if (e.key === '-') this.zoomBy(1 / 1.2); else if (e.key === '0') this.fit(); else h = false;
      if (h) { e.preventDefault(); this.clampCam(); this.camTo = null; this.dirty = true; }
    });
    cv.style.cursor = 'grab';
    this.mini.addEventListener('pointerdown', (e) => { const r = this.mini.getBoundingClientRect(), b = this.bounds(); this.goTo(b.x0 + (e.clientX - r.left) / r.width * (b.x1 - b.x0), b.y0 + (e.clientY - r.top) / r.height * (b.y1 - b.y0), this.cam.z, true); });
  }
  pinchDist() { const [a, b] = [...this.pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; }
  pinchMid() { const [a, b] = [...this.pointers.values()]; return [(a.x + b.x) / 2, (a.y + b.y) / 2]; }
  groundAt(px, py) { const [wx, wy] = this.s2w(px, py); const [gx, gy] = toGrid(wx, wy, zAt(Math.max(0, toGrid(wx, wy)[1]))); return { gx, gy }; }
  pick(px, py) {
    if (this.mode === 'map' && this.hitsLabel) for (const z of [3, 2, 1]) { const r = this.hitsLabel[z]; if (r && px >= r[0] && px <= r[0] + r[2] && py >= r[1] && py <= r[1] + r[3]) return { kind: 'zone', id: z, label: ZONES[z].name, polys: [] }; }
    const [wx, wy] = this.s2w(px, py);
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (h.circle) { if (Math.hypot(wx - h.circle[0], wy - h.circle[1]) <= h.circle[2]) return h; }
      else for (const poly of h.polys) if (inPoly(poly, wx, wy)) return h;
    }
    return null;
  }
  pointerAt(px, py, ev) {
    const h = this.pick(px, py), key = h ? h.kind + ':' + h.id : null;
    if (key !== (this.hover ? this.hover.kind + ':' + this.hover.id : null)) { this.hover = h; this.cv.style.cursor = h ? 'pointer' : 'grab'; this.dirty = true; }
    this.api.hover?.(h, ev);
  }

  // ------------------------------------------------------------------ state sync (called on every game tick)
  sync() {
    const g = this.g; if (!g) return;
    const s = g.s, unlocked = new Set(s.zones), hf = this.hourF();
    this.unlocked = unlocked;
    const seen = new Set();
    const upsert = (id, make) => { seen.add(id); let e = this.ents.get(id); if (!e) { e = make(); e.id = id; e.born = this.t; this.ents.set(id, e); } e.gone = false; return e; };
    // buyers
    for (const z of s.zones) {
      const used = new Set([...this.ents.values()].filter((e) => e.type === 'lead' && e.zone === z && !e.leaving && s.leads[z].some((l) => l.id === e.id)).map((e) => e.slot));
      for (const l of s.leads[z]) {
        const id = 'lead:' + l.id;
        const e = upsert(id, () => { let slot = SPOTS[z].leads.findIndex((_, i) => !used.has(i)); if (slot < 0) slot = 0; used.add(slot); const en = this.entry(z); return { type: 'lead', zone: z, slot, x: en[0] + (h2(strHash(l.id), 1) - 0.5) * 1.6, y: en[1] - h2(strHash(l.id), 2) * 1.4, seg: l.seg, look: lookOf(l.id + l.seg) }; });
        e.lead = l; e.leaving = false; const sp = SPOTS[z].leads[e.slot]; e.tx = sp[0]; e.ty = sp[1];
      }
      s.lots[z].forEach((l, i) => { const e = upsert('lot:' + l.id, () => ({ type: 'lot', zone: z, slot: 0, drop: 46 })); e.lot = l; });
      // reassign lot slots stably
      const lotEnts = [...this.ents.values()].filter((e) => e.type === 'lot' && e.zone === z && s.lots[z].some((l) => l.id === e.lot.id));
      const taken = new Set(); for (const e of lotEnts) if (e.slot >= 1 && e.slot <= 6 && !taken.has(e.slot)) taken.add(e.slot); else e.slot = 0;
      for (const e of lotEnts) if (!e.slot) { for (let k = 1; k <= 6; k++) if (!taken.has(k)) { e.slot = k; taken.add(k); break; } }
      // stock crates
      const mine = s.assets.filter((a) => a.zone === z);
      const usedA = new Set([...this.ents.values()].filter((e) => e.type === 'asset' && e.zone === z && mine.some((a) => 'asset:' + a.id === e.id)).map((e) => e.slot));
      for (const a of mine) { const e = upsert('asset:' + a.id, () => { let slot = 0; while (usedA.has(slot)) slot++; usedA.add(slot); return { type: 'asset', zone: z, slot, drop: 36 }; }); e.asset = a; }
    }
    // pipelines
    for (const z of [2, 3]) {
      const ps = s.pipes.filter((p) => p.zone === z);
      ps.forEach((p, i) => { const e = upsert('pipe:' + p.id, () => ({ type: 'pipe', zone: z, drop: 60, cycles: p.cycles })); e.pipe = p; e.plot = i; if (p.cycles > e.cycles) { e.cycles = p.cycles; this.cyclePop(e, z, i); } });
      for (let i = ps.length; i < PIPE_RULES.max[z]; i++) { const e = upsert(`plot:${z}:${i}`, () => ({ type: 'plot', zone: z, plot: i })); e.locked = !unlocked.has(z) || g.autoLocked(); }
    }
    // freight
    for (const f of s.freight) { const e = upsert('truck:' + f.id, () => ({ type: 'truck', from: f.items[0].zone ?? 1 })); e.f = f; }
    // leavers: anything not seen this sync
    for (const [id, e] of this.ents) {
      if (seen.has(id)) continue;
      if (e.type === 'lead' && !e.leaving) { e.leaving = true; e.leaveAt = this.t; const en = this.entry(e.zone); e.tx = en[0]; e.ty = en[1]; }
      else if (e.type === 'lead') continue;
      else if (!e.gone) { e.gone = true; e.goneAt = this.t; }
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
  hourF() { const S = this.api.session, g = this.g; if (!g) return 0; const live = S.clock.now(), fr = S.clock.paused || g.s.over ? 0 : clamp(live - g.s.hour, 0, 1); return g.s.hour + fr; }
  entry(z) { return z === 1 ? [17.8, 47.4] : z === 2 ? [17.8, 31.5] : [17.8, 15.5]; }
  placePlayer() { const z = this.unlocked?.has(this.api.ui.zone) ? this.api.ui.zone : Math.max(...(this.g?.s.zones || [1])); const h = SPOTS[z].home; Object.assign(this.player, { x: h[0], y: h[1], zone: z, path: [] }); }
  syncPlayer() {
    const z = this.unlocked?.has(this.api.ui.zone) ? this.api.ui.zone : this.player.zone, pl = this.player;
    if (pl.zone !== z) {
      pl.zone = z;
      const home = SPOTS[z].home, lane = LANE.north + 0.3;
      pl.path = [[lane, pl.y], [lane, this.entry(z)[1] - 1], home];
    } else if (!pl.path.length && !pl.moving && Math.hypot(pl.x - SPOTS[z].home[0], pl.y - SPOTS[z].home[1]) > 40) { pl.x = SPOTS[z].home[0]; pl.y = SPOTS[z].home[1]; }
  }
  walkPlayerTo(gx, gy) { const pl = this.player; if (pl.zone !== zoneAt(gy)) return; pl.path = [[gx, gy]]; }
  cyclePop(e, z, i) {
    const pl = PLOTS[z][i], p = e.pipe, g = this.g;
    const last = [...g.s.ledger].reverse().find((l) => l.type === 'pipe' && l.pid === p.id);
    const amt = last ? last.amt : 0;
    this.pop((amt >= 0 ? '+' : '-') + money(Math.abs(amt)), pl[0] + 1.5, pl[1] + 1.5, ELEV[z] + 60 + p.level * 12, amt >= 0 ? '#ffd36e' : '#ff7d75');
    if (!this.reduced()) for (let k = 0; k < 8; k++) this.parts.push({ k: 'coin', gx: pl[0] + 1.5, gy: pl[1] + 1.5, z: ELEV[z] + 40 + p.level * 12, vx: (Math.random() - 0.5) * 40, up: 50 + Math.random() * 50, life: 1.1 + Math.random() * 0.4, age: 0 });
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
    const animating = !calm || this.camTo || this.player.path.length || this.parts.length;
    if (!animating && !this.dirty) return;
    this.update(dt);
    this.draw();
    this.dirty = false;
    const cost = performance.now() - t0;
    this.slow = clamp(this.slow + (cost > 22 ? 1 : cost < 10 ? -0.25 : 0), 0, 6);
    this.fps = this.slow > 3 ? 20 : 30;
    if (this.slow > 4 && this.dpr > 1) { this.slow = 3.5; this.resize(); }
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
    Object.assign(this.env, { t: this.t, night: this.night, wind: calm ? 0 : 1, dim: 0 });
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
    if (pl.path.length) { const [tx, ty] = pl.path[0], dx = tx - pl.x, dy = ty - pl.y, d = Math.hypot(dx, dy), v = pl.path.length > 1 ? 16 : 5; if (d < 0.1) pl.path.shift(); else { const st = Math.min(d, (calm ? 80 : v) * dt); pl.x += dx / d * st; pl.y += dy / d * st; if (Math.abs(dx) > 0.01) pl.dir = dx > 0 ? 1 : -1; } pl.moving = true; } else pl.moving = false;
    // particles
    for (const p of this.parts) p.age += dt;
    this.parts = this.parts.filter((p) => p.age < p.life);
    if (this.env.crunch && !calm) { if (!this.rain) this.rain = Array.from({ length: 90 }, () => [Math.random(), Math.random(), 0.6 + Math.random() * 0.6]); for (const r of this.rain) { r[1] += dt * r[2] * 1.6; r[0] -= dt * 0.25 * r[2]; if (r[1] > 1.05) { r[1] = -0.05; r[0] = Math.random() * 1.2; } if (r[0] < -0.05) r[0] += 1.1; } } else this.rain = null;
  }

  // ------------------------------------------------------------------ drawing
  draw() {
    const ctx = this.ctx, { W, H, dpr } = this, g = this.g;
    this.hits = []; this.overlay = []; this.lights = [];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawWater(ctx);
    ctx.setTransform(dpr * this.cam.z, 0, 0, dpr * this.cam.z, dpr * (W / 2 - this.cam.x * this.cam.z), dpr * (H / 2 - this.cam.y * this.cam.z));
    const view = { x0: this.cam.x - W / 2 / this.cam.z - 80, x1: this.cam.x + W / 2 / this.cam.z + 80, y0: this.cam.y - H / 2 / this.cam.z - 260, y1: this.cam.y + H / 2 / this.cam.z + 80 };
    this.view = view;
    this.drawGround(ctx, view);
    const items = [];
    const vis = (gx, gy, w = 1, d = 1, h = 60) => { const x = sx(gx + w / 2, gy + d / 2), y = sy(gx + w / 2, gy + d / 2, zAt(gy)); return x > view.x0 - 80 && x < view.x1 + 80 && y > view.y0 - h && y < view.y1 + 60; };
    for (const p of SCENERY) if (vis(p.gx, p.gy, p.w, p.d, p.h)) items.push({ key: p.key, k: 's', p });
    const lowZoom = this.cam.z < 0.42;
    for (const e of this.ents.values()) {
      if (e.type === 'truck' || e.type === 'plot' || e.type === 'pipe') items.push({ key: this.keyOf(e), k: 'e', e });
      else { const [gx, gy] = this.posOf(e); if (vis(gx, gy, 1, 1, 80)) items.push({ key: gx + gy + 0.5, k: 'e', e }); }
    }
    items.push({ key: this.player.x + this.player.y + 0.5, k: 'p' });
    if (!this.reduced()) for (const c of this.cars()) items.push({ key: c.key, k: 'c', c });
    items.sort((a, b) => a.key - b.key);
    for (const it of items) {
      try {
        if (it.k === 's') this.drawStatic(ctx, it.p);
        else if (it.k === 'e') this.drawEnt(ctx, it.e);
        else if (it.k === 'p') this.drawPlayer(ctx);
        else this.drawCar(ctx, it.c);
      } catch (err) { ctx.restore?.(); ctx.globalAlpha = 1; this.fault(err, it.k + ':' + (it.p?.t || it.e?.type || it.c?.i)); }
    }
    if (this.hover) this.drawHover(ctx);
    // screen-space passes
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const pass of [() => this.drawLight(ctx), () => this.drawOverlay(ctx), () => this.drawWeather(ctx), () => this.mode === 'map' && this.drawMapLabels(ctx), () => this.drawMini()]) { try { pass(); } catch (err) { ctx.restore?.(); this.fault(err, 'pass'); } }
  }

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
      const y = (i / 26) * H + 8, ph = calm ? 0 : this.t / 1400 + i, x0 = ((i * 137) % W);
      ctx.beginPath(); for (let x = -20; x < 90; x += 6) { const px = (x0 + x * 2.2) % (W + 60) - 30, py = y + Math.sin(ph + x * 0.1) * 1.6; x === -20 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); } ctx.stroke();
    }
    // island shadow on the water
    const a = this.w2s(sx(LAND.x0, LAND.y1) + 30, sy(LAND.x0, LAND.y1) + 50), b = this.w2s(sx(LAND.x1, LAND.y1) + 30, sy(LAND.x1, LAND.y1) + 50), c = this.w2s(sx(LAND.x1, LAND.y0) + 30, sy(LAND.x1, LAND.y0) + 50);
    quad(ctx, [a, b, c, [c[0], c[1] - 10], [a[0], a[1] - 10]], 'rgba(5,10,20,.35)');
  }

  drawGround(ctx, view) {
    const g0 = toGrid(view.x0, view.y0 + 20), g1 = toGrid(view.x1, view.y1), g2 = toGrid(view.x0, view.y1), g3 = toGrid(view.x1, view.y0 + 20);
    const x0 = Math.max(LAND.x0, Math.floor(Math.min(g0[0], g1[0], g2[0], g3[0])) - 1), x1 = Math.min(LAND.x1 - 1, Math.ceil(Math.max(g0[0], g1[0], g2[0], g3[0])) + 1);
    const y0 = Math.max(LAND.y0, Math.floor(Math.min(g0[1], g1[1], g2[1], g3[1])) - 1), y1 = Math.min(LAND.y1 - 1, Math.ceil(Math.max(g0[1], g1[1], g2[1], g3[1])) + 1);
    const dimZ = (z) => (this.unlocked && !this.unlocked.has(z) ? 0.5 : 0);
    for (let gy = y0; gy <= y1; gy++) {
      const za = zAt(gy), zb = zAt(gy + 1), slope = (za - zb) / 8;
      for (let gx = x0; gx <= x1; gx++) {
        let col = groundColor(gx, gy); if (!col) continue;
        const dz = dimZ(zoneAt(gy)); if (dz) col = mix(col, '#10151f', dz);
        col = slope ? shade(col, 1 + slope * 0.12) : col;
        const pts = [P(gx, gy, za), P(gx + 1, gy, za), P(gx + 1, gy + 1, zb), P(gx, gy + 1, zb)];
        quad(ctx, pts, col, zoneAt(gy) > 1 && !isRoad(gx, gy) ? 'rgba(0,0,0,.14)' : null, 0.8);
        if (gy === LAND.y1 - 1) this.wall(ctx, P(gx, gy + 1, zb), zb, P(gx + 1, gy + 1, zb), zb, 0);
        if (gx === LAND.x1 - 1) this.wall(ctx, P(gx + 1, gy + 1, zb), zb, P(gx + 1, gy, za), za, 1);
      }
    }
    // road markings, crosswalks and decals
    ctx.lineWidth = 2;
    for (let gy = y0; gy <= y1; gy += 1) {
      if (gy % 2 === 0) { const z = zAt(gy), a = P(18, gy, z), b = P(18, gy + 0.55, zAt(gy + 0.55)); ctx.strokeStyle = 'rgba(255,211,110,.75)'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    }
    for (const r of [7, 24, 40]) { if (r < y0 - 1 || r > y1) continue; for (let gx = 5; gx < 31; gx += 2) { if (gx >= 16 && gx < 20) continue; const z = zAt(r), a = P(gx, r + 0.5, z), b = P(gx + 0.6, r + 0.5, z); ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } for (let k = 0; k < 5; k++) { const z = zAt(r), a = P(16.9, r + 0.1 + k * 0.2, z), b = P(18.9 + 0, r + 0.1 + k * 0.2, z); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } }
    // Scrap Yard puddles and oil
    for (let i = 0; i < 16; i++) { const gx = 5 + h2(3, i) * 26, gy = 35 + h2(4, i) * 12; if (isRoad(gx, gy) || gy < y0 || gy > y1 + 1) continue; const [x, y] = P(gx, gy, 0); ellipse(ctx, x, y, 14 + h2(5, i) * 12, 6 + h2(6, i) * 4, i % 3 ? 'rgba(20,16,12,.28)' : 'rgba(110,150,190,.35)'); }
  }
  wall(ctx, a, za, b, zb, side) {
    const col = this.night > 0.5 ? '#2c3040' : '#4a5060', c = side ? shade(col, 0.72) : col;
    quad(ctx, [a, b, [b[0], b[1] + zb + 34], [a[0], a[1] + za + 34]], c);
    ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 1;
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(a[0], a[1] + (za + 34) * k / 4); ctx.lineTo(b[0], b[1] + (zb + 34) * k / 4); ctx.stroke(); }
  }

  posOf(e) {
    if (e.type === 'lead') return [e.x, e.y];
    if (e.type === 'lot') return SPOTS[e.zone].lots[Math.max(0, e.slot - 1)];
    if (e.type === 'asset') return stashPos(e.zone, e.slot);
    return [0, 0];
  }
  keyOf(e) {
    if (e.type === 'truck') { const [x, y] = this.truckPos(e); return x + y + 0.8; }
    const pl = PLOTS[e.zone][e.plot]; return pl[0] + 1.5 + pl[1] + 1.5;
  }

  drawStatic(ctx, p) {
    const z = p.z, locked = this.unlocked && !this.unlocked.has(zoneAt(p.gy));
    ctx.save(); ctx.translate(0, -z);
    this.env.dim = locked ? 0.55 : 0; this.env.locked = p.t === 'bank' && this.g && !this.g.s.mil.m1;
    this.env.lights = this.lights;
    if (p.t === 'lamp') this.lights.push({ wx: sx(p.gx, p.gy), wy: sy(p.gx, p.gy, z + 28), r: 46, c: '255,222,140', a: 0.55 * this.night });
    if (p.t === 'board') this.env.boardText = this.boardText(p);
    const polys = drawProp(ctx, p, this.env);
    ctx.restore();
    if (p.t === 'bank' && this.env.locked) this.drawBarrier(ctx, p, z);
    if (p.hot && polys) this.hits.push({ kind: 'static', id: p.hot, label: p.label, zone: zoneAt(p.gy), polys: polys.map((q) => q.map(([x, y]) => [x, y - z])), p });
    if (p.t === 'depot' && this.env.tariff) this.drawTariff(ctx, p, z);
  }
  boardText(p) {
    const g = this.g, z = zoneAt(p.gy); if (!g) return p.text;
    const n = (g.s.leads[z] || []).length;
    return this.env.surge && z < 3 ? 'TREND SURGE' : this.env.crunch ? 'CREDIT CRUNCH' : this.env.tariff ? 'TARIFF LOCK' : `${n} BUYERS`;
  }
  drawBarrier(ctx, p, z) {
    const [x, y] = P(p.gx + p.w / 2, p.gy + p.d + 0.3, z);
    ctx.fillStyle = '#ffd36e'; ctx.fillRect(x - 40, y - 12, 80, 8); ctx.fillStyle = '#10141c'; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(x - 40 + i * 10, y - 12); ctx.lineTo(x - 34 + i * 10, y - 12); ctx.lineTo(x - 40 + 6 + i * 10 - 6, y - 4); ctx.lineTo(x - 46 + i * 10 + 6, y - 4); ctx.fill(); }
    this.overlay.push({ wx: x, wy: y - 34, draw: (g, px, py) => this.chip(g, px, py, 'Opens at $1,000', '#ffd36e') });
  }
  drawTariff(ctx, p, z) {
    ctx.save(); ctx.translate(0, -z);
    const [x, y] = P(p.gx - 0.3, p.gy + p.d / 2); ctx.fillStyle = '#ff5a4d'; ctx.fillRect(x - 4, y - 22, 8, 22); ctx.fillStyle = '#fff'; ctx.fillRect(x - 4, y - 16, 8, 3);
    ctx.restore();
  }

  drawEnt(ctx, e) {
    const alpha = e.gone ? clamp(1 - (this.t - e.goneAt) / 600, 0, 1) : 1;
    ctx.globalAlpha = alpha;
    if (e.type === 'lead') this.drawLead(ctx, e); else if (e.type === 'lot') this.drawLot(ctx, e); else if (e.type === 'asset') this.drawAsset(ctx, e);
    else if (e.type === 'pipe') this.drawPipe(ctx, e); else if (e.type === 'plot') this.drawPlot(ctx, e); else if (e.type === 'truck') this.drawTruck(ctx, e);
    ctx.globalAlpha = 1;
  }

  drawLead(ctx, e) {
    const z = zAt(e.y), [x, y] = P(e.x, e.y, z), B = BUYERS[e.seg], l = e.lead, calm = this.reduced();
    const hov = this.hover?.id === e.id && this.hover.kind === 'lead';
    if (e.leaving) ctx.globalAlpha = clamp(1 - (this.t - e.leaveAt) / 4200, 0.2, 1);
    if (l?.need && !e.leaving) { const k = 0.5 + 0.5 * Math.sin(this.t / 300); ellipse(ctx, x, y + 1, 15 + 3 * k, 7 + 1.5 * k, `rgba(255,211,110,${0.28 + 0.2 * k})`); }
    person(ctx, x, y, hov ? 1.15 : 1, e.look, this.t, e.moving, e.dir || 1);
    ctx.globalAlpha = 1;
    if (!e.leaving && l) {
      this.hits.push({ kind: 'lead', id: e.id.slice(5), zone: e.zone, label: `${B.name}${l.need ? ', urgent' : ''}`, circle: [x, y - 16, 20], lead: l });
      if (this.cam.z > 0.5 || hov) this.overlay.push({ wx: x, wy: y - 40, draw: (g, px, py, s) => this.leadBubble(g, px, py, s, B, l, hov) });
    }
  }
  drawLot(ctx, e) {
    const [gx, gy] = this.posOf(e), z = zAt(gy), l = e.lot, [x, y0] = P(gx, gy, z), y = y0 - e.drop;
    const col = classColor(l.cls), hov = this.hover?.id === e.id && this.hover.kind === 'lot';
    ellipse(ctx, x, y0 + 2, 17, 8, 'rgba(8,10,20,.3)');
    ctx.save(); ctx.translate(0, -z - e.drop);
    box(ctx, gx - 0.4, gy - 0.4, 0.8, 0.8, 4, tone('#8a6a45'));
    const f = box(ctx, gx - 0.34, gy - 0.34, 0.68, 0.68, 15, tone(l.cond === 'broken' ? shade(col, 0.7) : col), { z: 4, line: hov ? '#ffffff' : 'rgba(0,0,0,.25)' });
    if (l.cond === 'broken') { ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.4; const a = facePoint(f.left, 0.2, 0.9), b = facePoint(f.left, 0.55, 0.25), c = facePoint(f.left, 0.8, 0.6); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); }
    ctx.restore();
    this.hits.push({ kind: 'lot', id: e.id.slice(4), zone: e.zone, label: `${ASSETS[l.cls].name}${l.cond === 'broken' ? ' (broken)' : ''} for sale`, polys: [[[x - 18, y - 26], [x + 18, y - 26], [x + 18, y + 4], [x - 18, y + 4]]], lot: l });
    if (this.cam.z > 0.5) this.overlay.push({ wx: x, wy: y - 32, draw: (g, px, py, s) => this.tag(g, px, py, s, ASSETS[l.cls].icon, money(l.price), '#46e38e', hov) });
  }
  drawAsset(ctx, e) {
    const [gx, gy] = this.posOf(e), z = zAt(gy), a = e.asset, [x, y0] = P(gx, gy, z), y = y0 - e.drop;
    const sel = this.api.ui.sel.has(a.id), col = classColor(a.cls), hov = this.hover?.id === e.id && this.hover.kind === 'asset', bob = sel && !this.reduced() ? Math.sin(this.t / 220) * 2 : 0;
    ellipse(ctx, x, y0 + 2, 15, 7, 'rgba(8,10,20,.3)');
    if (sel) { const k = 0.5 + 0.5 * Math.sin(this.t / 250); ellipse(ctx, x, y0 + 1, 22 + 2 * k, 11 + k, `rgba(255,211,110,${0.5})`, '#ffd36e', 2); }
    ctx.save(); ctx.translate(0, -z - e.drop - bob);
    const wear = clamp(a.wear, 0.4, 1), c = a.cond === 'broken' ? shade(col, 0.65) : mix('#6a6f7c', col, wear);
    const f = box(ctx, gx - 0.36, gy - 0.36, 0.72, 0.72, 17, tone(c), { line: hov ? '#fff' : 'rgba(0,0,0,.3)' });
    if (a.cond === 'broken') { ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.4; const p1 = facePoint(f.left, 0.15, 0.85), p2 = facePoint(f.left, 0.5, 0.3), p3 = facePoint(f.left, 0.85, 0.7); ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.stroke(); if (!this.reduced()) { const [sx0, sy0] = P(gx, gy, 18); for (let i = 0; i < 2; i++) { const k = ((this.t / 900) + i / 2) % 1; ctx.fillStyle = `rgba(200,200,210,${0.4 * (1 - k)})`; ctx.beginPath(); ctx.arc(sx0 + k * 6, sy0 - k * 16, 2 + k * 4, 0, 7); ctx.fill(); } } }
    ctx.restore();
    this.hits.push({ kind: 'asset', id: a.id, zone: e.zone, label: `${ASSETS[a.cls].name}${a.cond === 'broken' ? ' (broken)' : ''}, in your stock`, polys: [[[x - 16, y - 32 - bob], [x + 16, y - 32 - bob], [x + 16, y + 4], [x - 16, y + 4]]], asset: a });
    if (this.cam.z > 0.6 || sel || hov) this.overlay.push({ wx: x, wy: y - 36 - bob, draw: (g, px, py, s) => this.icon(g, px, py, s, ASSETS[a.cls].icon, sel) });
  }
  drawPlot(ctx, e) {
    const pl = PLOTS[e.zone][e.plot], z = ELEV[e.zone], hov = this.hover?.id === e.id && this.hover.kind === 'plot';
    ctx.save(); ctx.translate(0, -z);
    diamond(ctx, pl[0], pl[1], 3, 3, e.locked ? '#2a2e38' : '#6a5a40', hov ? '#fff' : 'rgba(0,0,0,.35)', 0, hov ? 2 : 1);
    ctx.strokeStyle = e.locked ? '#7a7f88' : '#ffd36e'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); const [a, b, c, d] = [P(pl[0] + 0.2, pl[1] + 0.2), P(pl[0] + 2.8, pl[1] + 0.2), P(pl[0] + 2.8, pl[1] + 2.8), P(pl[0] + 0.2, pl[1] + 2.8)]; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    for (const [cx, cy] of [[pl[0] + 0.3, pl[1] + 2.6], [pl[0] + 2.6, pl[1] + 2.6]]) { const [x, y] = P(cx, cy); quad(ctx, [[x - 4, y], [x + 4, y], [x, y - 14]], '#ff8a2b'); ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, y - 7, 4, 2); }
    ctx.restore();
    const [x, y] = P(pl[0] + 1.5, pl[1] + 1.5, z);
    this.hits.push({ kind: 'plot', id: `${e.zone}:${e.plot}`, zone: e.zone, label: e.locked ? 'Building plot (locked)' : 'Empty plot: hire a manager here', polys: [[P(pl[0], pl[1], z), P(pl[0] + 3, pl[1], z), P(pl[0] + 3, pl[1] + 3, z), P(pl[0], pl[1] + 3, z)]], locked: e.locked });
    this.overlay.push({ wx: x, wy: y - 20, draw: (g, px, py, s) => this.chip(g, px, py, e.locked ? 'Locked' : '+ Hire', e.locked ? '#a3b3c9' : '#ffd36e', s) });
  }
  drawPipe(ctx, e) {
    const p = e.pipe, pl = PLOTS[e.zone][e.plot], z = ELEV[e.zone], K = PIPE[p.kind], hov = this.hover?.id === e.id && this.hover.kind === 'pipe';
    const floors = p.level, h = 26 + floors * 13, running = p.status === 'running', off = p.status === 'paused' || p.status === 'audit';
    const col = off ? '#6a707c' : { student: '#46a06a', broker: '#c9a227', logistics: '#4a8fb0' }[p.kind];
    ctx.save(); ctx.translate(0, -z - e.drop);
    diamond(ctx, pl[0], pl[1], 3, 3, '#59606e', null, 0);
    shadow(ctx, pl[0] + 0.3, pl[1] + 0.3, 2.4, 2.4, h);
    const f = box(ctx, pl[0] + 0.3, pl[1] + 0.3, 2.4, 2.4, h, tone(col), { z: 1, line: hov ? '#fff' : undefined });
    windows(ctx, f.left, 3, floors + 1, '#16264a', running ? 0.8 + 0.2 * this.night : this.night * 0.5, 0.08); windows(ctx, f.right, 3, floors + 1, '#10203f', running ? 0.8 : this.night * 0.5, 0.08);
    box(ctx, pl[0] + 0.1, pl[1] + 0.1, 2.8, 2.8, 4, tone(shade(col, 0.8)), { z: h + 1 });
    const [rx, ry] = P(pl[0] + 1.5, pl[1] + 1.5, h + 5);
    ctx.fillStyle = '#e8eef6'; ctx.font = '800 11px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center'; const sp = facePoint(f.left, 0.5, 0.04); ctx.fillText(K.icon, sp[0], sp[1] - 2);
    if (running && !this.reduced()) { cyl(ctx, pl[0] + 2.2, pl[1] + 0.8, 0.22, 16, tone('#6a6f78'), h + 5); const [cx, cy] = P(pl[0] + 2.2, pl[1] + 0.8, h + 21); for (let i = 0; i < 4; i++) { const k = ((this.t / 1700) + i / 4) % 1; ctx.fillStyle = `rgba(235,240,250,${0.38 * (1 - k)})`; ctx.beginPath(); ctx.arc(cx + k * 10, cy - k * 38, 3 + k * 8, 0, 7); ctx.fill(); } }
    ctx.restore();
    const [x, y] = P(pl[0] + 1.5, pl[1] + 1.5, z);
    this.hits.push({ kind: 'pipe', id: p.id, zone: e.zone, label: `${K.name}, level ${p.level}`, polys: [f.left, f.right, f.top].map((q) => q.map(([a, b]) => [a, b - z - e.drop])), pipe: p });
    const frac = p.inflight ? clamp((p.prog + (this.hourF() - this.g.s.hour)) / Math.max(1, p.len), 0, 1) : 0;
    this.overlay.push({ wx: x, wy: y - h - 14 - e.drop, draw: (g, px, py, s) => this.progress(g, px, py, s, frac, p, off) });
  }
  truckPos(e) {
    const f = e.f, from = e.from, to = f.to, p = clamp((this.hourF() - (f.arrive - 6)) / 6, 0, 1);
    const a = DOORS[from], b = DOORS[to], north = to < from, lane = north ? LANE.north : LANE.south;
    const pts = [a, [lane, a[1]], [lane, b[1]], b];
    const seg = [Math.abs(pts[1][0] - pts[0][0]), Math.abs(pts[2][1] - pts[1][1]), Math.abs(pts[3][0] - pts[2][0])], tot = seg[0] + seg[1] + seg[2];
    let d = p * tot, i = 0; while (i < 2 && d > seg[i]) { d -= seg[i]; i++; }
    const A = pts[i], B = pts[i + 1], k = seg[i] ? d / seg[i] : 1;
    e.dirY = i === 1; e.north = north;
    return [lerp(A[0], B[0], k), lerp(A[1], B[1], k)];
  }
  drawTruck(ctx, e) {
    const [gx, gy] = this.truckPos(e), z = zAt(gy), [x, y] = P(gx, gy, z), alongY = e.dirY;
    const blocked = this.env.tariff;
    ctx.save(); ctx.translate(0, -z);
    const w = alongY ? 0.8 : 1.7, d = alongY ? 1.7 : 0.8;
    shadow(ctx, gx - w / 2, gy - d / 2, w, d, 16, 0.25);
    box(ctx, gx - w / 2, gy - d / 2, w, d, 16, tone('#e8eef6'), { z: 3 });
    const cab = alongY ? [gx - 0.4, gy + (e.north ? -0.85 : 0.35), 0.8, 0.5] : [gx + (e.north ? -0.85 : 0.35), gy - 0.4, 0.5, 0.8];
    box(ctx, cab[0], cab[1], cab[2], cab[3], 12, tone('#2f80ed'), { z: 3 });
    for (const [ox, oy] of [[-0.25, -0.6], [0.25, 0.6], [-0.25, 0.6], [0.25, -0.6]]) { const [wx, wy] = P(gx + (alongY ? ox : oy), gy + (alongY ? oy : ox), 0); ellipse(ctx, wx, wy - 2, 3.4, 3.4, '#10141c'); }
    ctx.restore();
    if (!this.reduced() && !blocked) for (let i = 0; i < 2; i++) { const k = ((this.t / 500) + i / 2) % 1; ctx.fillStyle = `rgba(210,215,225,${0.3 * (1 - k)})`; ctx.beginPath(); ctx.arc(x - 8 - k * 14 * (e.north ? -1 : 1), y - 6 - k * 6, 2 + k * 3, 0, 7); ctx.fill(); }
    this.hits.push({ kind: 'truck', id: e.f.id, zone: 0, label: `Freight run to ${ZONES[e.f.to].short}`, circle: [x, y - 12, 20] });
    this.overlay.push({ wx: x, wy: y - 40, draw: (g, px, py, s) => this.chip(g, px, py, `${e.f.items.length} crate${e.f.items.length > 1 ? 's' : ''} to ${ZONES[e.f.to].short}`, '#ffd36e', s) });
  }
  cars() {
    const out = [];
    for (let i = 0; i < 6; i++) {
      const north = i % 2 === 0, speed = 0.0014 + i * 0.0002, ph = ((this.t * speed + i * 0.19) % 1), gy = north ? 47 - ph * 46 : 2 + ph * 46, gx = north ? LANE.north - 0.05 : LANE.south + 0.05;
      out.push({ gx, gy, north, i, key: gx + gy + 0.4 });
    }
    return out;
  }
  drawCar(ctx, c) {
    const z = zAt(c.gy); ctx.save(); ctx.translate(0, -z);
    const cols = ['#c0392b', '#2f80ed', '#f2c94c', '#9b51e0', '#27ae60', '#e8eef6'];
    box(ctx, c.gx - 0.28, c.gy - 0.55, 0.56, 1.1, 8, tone(cols[c.i % 6]), { z: 2 });
    box(ctx, c.gx - 0.22, c.gy - 0.3, 0.44, 0.6, 7, tone(shade(cols[c.i % 6], 0.9)), { z: 10 });
    if (this.night > 0.3) { const [x, y] = P(c.gx, c.gy + (c.north ? -0.6 : 0.6), 6); this.lights.push({ wx: x, wy: y - z, r: 26, c: '255,240,190', a: 0.5 * this.night }); }
    ctx.restore();
  }
  drawPlayer(ctx) {
    const pl = this.player, z = zAt(pl.y), [x, y] = P(pl.x, pl.y, z), prof = this.g?.s.profile;
    const look = { shirt: { bootstrapper: '#c0392b', venture: '#1d2b53', midtier: '#16a085' }[prof] || '#c0392b', hair: '#222', skin: '#f1c27d', pants: '#27324a' };
    const k = 0.5 + 0.5 * Math.sin(this.t / 400);
    ellipse(ctx, x, y + 1, 16, 7.5, `rgba(255,211,110,${0.3 + 0.15 * k})`, '#ffd36e', 1.5);
    person(ctx, x, y, 1.3, look, this.t, pl.moving, pl.dir);
    this.overlay.push({ wx: x, wy: y - 48, draw: (g, px, py, s) => this.chip(g, px, py, 'You', '#ffd36e', s) });
  }
  drawHover(ctx) {
    const h = this.hover; ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 / this.cam.z; ctx.shadowColor = '#ffd36e'; ctx.shadowBlur = 10;
    if (h.circle) { ctx.beginPath(); ctx.ellipse(h.circle[0], h.circle[1] + 14, 18, 8, 0, 0, 7); ctx.stroke(); } else if (h.kind === 'static' || h.kind === 'plot') for (const poly of h.polys) { ctx.beginPath(); poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke(); }
    ctx.restore();
  }

  // ------------------------------------------------------------------ screen-space passes
  drawLight(ctx) {
    if (this.night < 0.04) return;
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${255 - 150 * this.night}, ${255 - 130 * this.night}, ${255 - 70 * this.night})`; ctx.fillRect(0, 0, this.W, this.H);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lights) { const [x, y] = this.w2s(l.wx, l.wy), r = l.r * this.cam.z, g = ctx.createRadialGradient(x, y, 1, x, y, r); g.addColorStop(0, `rgba(${l.c},${l.a})`); g.addColorStop(1, `rgba(${l.c},0)`); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
    ctx.restore();
  }
  drawWeather(ctx) {
    const { W, H } = this;
    if (this.env.crunch) { ctx.fillStyle = 'rgba(60,66,80,.3)'; ctx.fillRect(0, 0, W, H); if (this.rain) { ctx.strokeStyle = 'rgba(190,210,235,.4)'; ctx.lineWidth = 1; ctx.beginPath(); for (const r of this.rain) { const x = r[0] * W, y = r[1] * H; ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 11); } ctx.stroke(); } }
    if (this.env.surge && !this.reduced()) { const k = this.t / 1000; for (let i = 0; i < 26; i++) { const x = (i * 97 + Math.sin(k + i) * 24) % W, y = ((k * 40 + i * 53) % (H + 20)) - 10; ctx.fillStyle = ['#ff3da8', '#7be3ff', '#ffd36e'][i % 3]; ctx.globalAlpha = 0.55; ctx.fillRect(x, y, 5, 5); } ctx.globalAlpha = 1; }
    if (this.env.surge) { ctx.fillStyle = 'rgba(255,61,168,.07)'; ctx.fillRect(0, 0, W, H); }
    if (this.env.tariff) { ctx.fillStyle = 'rgba(255,80,60,.05)'; ctx.fillRect(0, 0, W, H); }
  }
  drawOverlay(ctx) {
    const s = clamp(this.cam.z, 0.75, 1.25);
    for (const o of this.overlay) { const [x, y] = this.w2s(o.wx, o.wy); if (x < -80 || x > this.W + 80 || y < -40 || y > this.H + 40) continue; o.draw(ctx, x, y, s); }
    for (const p of this.parts) {
      const [x, y] = this.w2s(sx(p.gx, p.gy), sy(p.gx, p.gy, p.z + (p.k === 'text' ? p.age * 26 : 0)));
      const a = clamp(1 - p.age / p.life, 0, 1);
      if (p.k === 'text') { ctx.globalAlpha = a; ctx.font = `800 ${Math.round(15 * s)}px ui-monospace, Menlo, monospace`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(8,10,20,.85)'; ctx.strokeText(p.text, x, y); ctx.fillStyle = p.color; ctx.fillText(p.text, x, y); ctx.globalAlpha = 1; }
      else { const rise = (p.up * p.age - 80 * p.age * p.age) * this.cam.z; ctx.globalAlpha = a; ctx.fillStyle = '#ffd36e'; ctx.fillRect(x + p.vx * p.age * this.cam.z, y - rise, 5, 5); ctx.fillStyle = '#b8860b'; ctx.fillRect(x + p.vx * p.age * this.cam.z + 1, y - rise + 1, 3, 3); ctx.globalAlpha = 1; }
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
    const bob = this.reduced() ? 0 : Math.sin(this.t / 500 + l.born) * 1.5;
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
  drawMapLabels(ctx) {
    const g = this.g; if (!g) return; const s = g.s, compact = this.W < 620;
    this.hitsLabel = {};
    for (const z of [3, 2, 1]) {
      const d = DIST[z], open = this.unlocked.has(z), left = z === 3;
      // anchor in the open water beside the district: Corporate Valley to the left, the other two to the right
      const [ax, ay] = this.w2s(left ? sx(LAND.x0, d.cy) - 20 : sx(LAND.x1, d.cy) + 20, (left ? sy(LAND.x0, d.cy, ELEV[z]) : sy(LAND.x1, d.cy, ELEV[z])));
      const stock = s.assets.filter((a) => a.zone === z).length, pipes = s.pipes.filter((p) => p.zone === z).length, leads = (s.leads[z] || []).length;
      const lines = compact
        ? [(open ? '' : 'LOCKED ') + ZONES[z].short, open ? `${leads} buyers${z > 1 ? ', ' + pipes + ' mgr' : ''}` : (z === 2 ? '$1,000' : '$250,000')]
        : [(open ? '' : 'LOCKED  ') + ZONES[z].name, open ? `${leads} buyers  ${stock} crates${z > 1 ? '  ' + pipes + ' managers' : ''}` : (z === 2 ? 'Unlocks at $1,000 net worth' : 'Unlocks at $250,000 net worth'), `tax ${(ZONES[z].tax * 100).toFixed(1)}%  speed ${ZONES[z].speed}x  pool ${money(ZONES[z].pool)}`];
      ctx.font = `800 ${compact ? 11 : 13}px ui-monospace, Menlo, monospace`; const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 22, h = lines.length * (compact ? 15 : 17) + 12;
      let x = left ? ax - w : ax, y = ay - h / 2; x = clamp(x, 6, this.W - w - 6); y = clamp(y, 6, this.H - h - 6);
      roundRect(ctx, x, y, w, h, 8); ctx.fillStyle = 'rgba(16,20,28,.94)'; ctx.fill(); ctx.strokeStyle = z === this.api.ui.zone ? '#ffd36e' : '#7f95b5'; ctx.lineWidth = 2; ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      lines.forEach((l, i) => { ctx.font = `${i === 0 ? 800 : 600} ${i === 0 ? (compact ? 11 : 13) : (compact ? 10 : 11)}px ui-monospace, Menlo, monospace`; ctx.fillStyle = i === 0 ? (open ? '#ffd36e' : '#a3b3c9') : i === 1 ? '#e8eef6' : '#a3b3c9'; ctx.fillText(l, x + 11, y + 12 + i * (compact ? 15 : 17) + 2); });
      ctx.textBaseline = 'alphabetic';
      // leader line from the label to the district
      const [tx, ty] = this.w2s(sx(d.cx, d.cy), sy(d.cx, d.cy, ELEV[z]) - 10);
      ctx.strokeStyle = 'rgba(255,211,110,.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(left ? x + w : x, y + h / 2); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ffd36e'; ctx.beginPath(); ctx.arc(tx, ty, 4, 0, 7); ctx.fill();
      this.hitsLabel[z] = [x, y, w, h];
    }
  }
  drawMini() {
    const m = this.mini, c = this.mctx, W = (m.width = 150), H = (m.height = 96), b = this.bounds();
    c.clearRect(0, 0, W, H); c.fillStyle = 'rgba(16,24,40,.85)'; c.fillRect(0, 0, W, H);
    const px = (x) => (x - b.x0) / (b.x1 - b.x0) * W, py = (y) => (y - b.y0) / (b.y1 - b.y0) * H;
    for (const z of [1, 2, 3]) { const d = DIST[z]; const pts = [[LAND.x0, d.gy0], [LAND.x1, d.gy0], [LAND.x1, d.gy1], [LAND.x0, d.gy1]].map(([gx, gy]) => [px(sx(gx, gy)), py(sy(gx, gy, ELEV[z]))]); c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fillStyle = this.unlocked?.has(z) ? ['#705f45', '#4d586c', '#3d4c70'][z - 1] : '#1e2430'; c.fill(); if (z === this.api.ui.zone) { c.strokeStyle = '#ffd36e'; c.lineWidth = 1.5; c.stroke(); } }
    for (const e of this.ents.values()) { if (e.type === 'lead' && !e.leaving) { c.fillStyle = e.lead?.need ? '#ffd36e' : '#e8eef6'; c.fillRect(px(sx(e.x, e.y)) - 1, py(sy(e.x, e.y, zAt(e.y))) - 1, 2, 2); } else if (e.type === 'pipe') { const pl = PLOTS[e.zone][e.plot]; c.fillStyle = '#46e38e'; c.fillRect(px(sx(pl[0] + 1.5, pl[1] + 1.5)) - 2, py(sy(pl[0] + 1.5, pl[1] + 1.5, ELEV[e.zone])) - 2, 4, 4); } }
    const v = this.view; if (v) { c.strokeStyle = '#ffffff'; c.lineWidth = 1; c.strokeRect(px(this.cam.x - this.W / 2 / this.cam.z), py(this.cam.y - this.H / 2 / this.cam.z), (this.W / this.cam.z) / (b.x1 - b.x0) * W, (this.H / this.cam.z) / (b.y1 - b.y0) * H); }
  }

  /** Everything clickable right now, for the keyboard-accessible list view. */
  hotspots() {
    const g = this.g, out = [];
    if (!g) return out;
    for (const e of this.ents.values()) {
      if (e.gone || e.leaving) continue;
      if (e.type === 'lead') out.push({ kind: 'lead', id: e.id.slice(5), zone: e.zone, label: `${BUYERS[e.lead.seg].name} wants a deal${e.lead.need ? ', urgent' : ''}: pays up to ${money(e.lead.budget)}` });
      else if (e.type === 'lot') out.push({ kind: 'lot', id: e.id.slice(4), zone: e.zone, label: `Buy ${ASSETS[e.lot.cls].name}${e.lot.cond === 'broken' ? ' (broken)' : ''} for ${money(e.lot.price)}` });
      else if (e.type === 'asset') out.push({ kind: 'asset', id: e.asset.id, zone: e.zone, label: `${this.api.ui.sel.has(e.asset.id) ? 'Deselect' : 'Select'} ${ASSETS[e.asset.cls].name} (${money(g.val(e.asset))})` });
      else if (e.type === 'pipe') out.push({ kind: 'pipe', id: e.pipe.id, zone: e.zone, label: `Edit ${PIPE[e.pipe.kind].name}, level ${e.pipe.level}, ${e.pipe.status}` });
      else if (e.type === 'plot' && !e.locked) out.push({ kind: 'plot', id: `${e.zone}:${e.plot}`, zone: e.zone, label: `Hire a manager on plot ${e.plot + 1}` });
    }
    for (const p of SCENERY) if (p.hot) out.push({ kind: 'static', id: p.hot, zone: zoneAt(p.gy), label: p.label });
    return out;
  }
}

function inPoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; }
  return c;
}
